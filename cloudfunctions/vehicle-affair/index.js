/**
 * 云函数：vehicle-affair
 * ============================================================
 * 小程序「车务提醒」（证件到期）取数与处理。数据表和 Web 端完全共用：
 *   vehicle_certs  证件（一车多行）
 *   reminders      提醒事项（每天 09:00 由 vehicleReminderCron 生成）
 *
 * 调用：wx.cloud.callFunction({ name: 'vehicle-affair', data: { account, action, ... } })
 *
 * action：
 *   count    { }                                     → { total, overdue, near }
 *   list     { status?: '待处理'|'已处理'|'已忽略' }  → { list: [...], counts }
 *   postpone { id, next_remind_at }                   → 只改下次提醒时间，不动档案
 *   renew    { id, expire_date, cert_no?, remind_days? } → 更新证件到期日 + 关闭这条提醒
 *
 * 谁能调（与 Web 端菜单口径一致）：
 *   · 主账号（role_id 空 + owner_account 空）→ 直接放行
 *   · 子账号 → 角色 permissions.client 里必须有 'vehicle_affair'
 *     （也就是「功能配置」里勾了车务管理，且模块已开通）
 *   · 其他人 → 403（司机账号不该看到证件提醒）
 *
 * 看多少：
 *   · 主账号 → 本租户全部
 *   · 子账号 → 本租户 + 自己机构（organizations.level >= 2 才按机构收窄，一级机构等同主账号）
 *
 * ⚠️ 不要在这里算「该不该提醒」——那是 vehicleReminderCron 的事，
 *    这里只读已生成的 reminders，避免两个地方口径打架。
 * ============================================================
 */
const { randomUUID } = require('crypto')

const API_BASE = 'https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com'
const DEVICE_ID = randomUUID()

const CERT_NAME = {
  driving: '行驶证',
  transport: '营运证',
  jq_insurance: '交强险',
  sy_insurance: '商业险',
  excess_insurance: '超赔险',
  maintain: '保养',
}

const enc = (v) => encodeURIComponent(String(v))

/* ---------- 匿名登录 + REST ---------- */
let _token = null
let _tokenExp = 0

async function getToken(force) {
  if (_token && !force && Date.now() < _tokenExp) return _token
  _token = null
  const res = await fetch(`${API_BASE}/auth/v1/signin/anonymously`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-device-id': DEVICE_ID },
    body: JSON.stringify({}),
  })
  if (!res.ok) throw new Error(`匿名登录失败 HTTP ${res.status}`)
  const json = await res.json()
  _token = json.access_token || json.accessToken || (json.data && json.data.access_token)
  if (!_token) throw new Error('匿名登录未返回 access_token')
  const ttl = Number(json.expires_in) || 7200
  _tokenExp = Date.now() + Math.max(60, ttl - 300) * 1000
  return _token
}

async function request(method, table, query, body) {
  const url = `${API_BASE}/v1/rdb/rest/${table}${query ? '?' + query : ''}`
  const doFetch = async (token) => {
    const headers = {
      Authorization: `Bearer ${token}`,
      'x-device-id': DEVICE_ID,
      Accept: 'application/json',
      'Accept-Profile': 'public',
      'Content-Profile': 'public',
    }
    if (body) headers['Content-Type'] = 'application/json'
    if (method === 'PATCH' || method === 'POST') headers.Prefer = 'return=representation'
    return fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
  }

  let res = await doFetch(await getToken())
  if (res.status === 401) res = await doFetch(await getToken(true))
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`${method} ${table} 失败 HTTP ${res.status}: ${txt.slice(0, 200)}`)
  }
  const json = await res.json()
  return Array.isArray(json) ? json : json.data || []
}

const queryTable = (t, q) => request('GET', t, q)
const updateTable = (t, q, patch) => request('PATCH', t, q, patch)

/* ---------- 权限 ---------- */
const parsePerms = (raw) => {
  if (!raw) return []
  let v = raw
  if (typeof v === 'string') {
    try { v = JSON.parse(v) } catch (e) { return [] }
  }
  if (Array.isArray(v)) return v
  const client = v && v.client
  if (Array.isArray(client)) return client
  if (typeof client === 'string') return client.split(',').map((s) => s.trim()).filter(Boolean)
  return []
}

async function resolveScope(account) {
  const users = await queryTable(
    'users',
    `account=eq.${enc(account)}&select=account,name,phone,owner_account,role_id,org_id&limit=1`
  )
  const u = users[0]
  if (!u) return { error: { code: 403, message: '账号不存在' } }

  const hasRole = u.role_id !== null && u.role_id !== undefined && u.role_id !== ''
  const owner = String(u.owner_account || '').trim()
  const isMaster = !hasRole && !owner
  const ownerKey = owner || account

  /* 主账号直接放行；子账号要角色里勾了车务管理 */
  if (!isMaster) {
    if (!hasRole) return { error: { code: 403, message: '该账号没有车务管理权限' } }
    let perms = []
    try {
      const roles = await queryTable('roles', `id=eq.${enc(u.role_id)}&select=permissions&limit=1`)
      perms = parsePerms(roles[0] && roles[0].permissions)
    } catch (e) {
      perms = []
    }
    if (!perms.includes('vehicle_affair')) {
      return { error: { code: 403, message: '该账号没有车务管理权限' } }
    }
  }

  /* 子账号按机构收窄：level >= 2 才算二级机构 */
  let orgName = ''
  if (!isMaster && u.org_id !== null && u.org_id !== undefined && u.org_id !== '') {
    try {
      const orgs = await queryTable(
        'organizations',
        `id=eq.${enc(u.org_id)}&select=name,level&limit=1`
      )
      const o = orgs[0]
      if (o && Number(o.level) >= 2) orgName = String(o.name || '').trim()
    } catch (e) { /* 机构表读失败就不收窄 */ }
  }

  return { user: u, ownerKey, isMaster, orgName }
}

/* ---------- 动作 ---------- */
const listFields = [
  'id', 'reminder_no', 'plate', 'org', 'cert_id', 'cert_type', 'level',
  'title', 'content', 'due_date', 'next_remind_at', 'status', 'source',
  'remind_days', 'owner_account', 'created_at',
].join(',')

const LEVEL_RANK = { 已逾期: 3, 临近: 2, 快到期: 1 }

async function fetchReminders(ownerKey, orgName, status) {
  let q = `owner_account=eq.${enc(ownerKey)}&status=eq.${enc(status)}` +
    `&select=${listFields}&order=created_at.desc&limit=200`
  if (orgName) q += `&org=eq.${enc(orgName)}`
  return queryTable('reminders', q)
}

async function actionCount(scope) {
  const rows = await fetchReminders(scope.ownerKey, scope.orgName, '待处理')
  const overdue = rows.filter((r) => r.level === '已逾期').length
  const near = rows.filter((r) => r.level === '临近').length
  return { code: 0, data: { total: rows.length, overdue, near } }
}

async function actionList(event, scope) {
  const status = String(event.status || '待处理').trim()
  const rows = await fetchReminders(scope.ownerKey, scope.orgName, status)

  /* 待处理按严重度排（逾期 → 临近 → 快到期），其余按时间倒序 */
  if (status === '待处理') {
    rows.sort((a, b) => {
      const d = (LEVEL_RANK[b.level] || 0) - (LEVEL_RANK[a.level] || 0)
      if (d) return d
      return String(a.due_date || '9999').localeCompare(String(b.due_date || '9999'))
    })
  }

  /* 只在待处理里给计数，避免为了角标再打一次接口 */
  let counts = { 待处理: 0, 已处理: 0, 已忽略: 0 }
  if (status === '待处理') {
    counts = {
      待处理: rows.length,
      已处理: 0,
      已忽略: 0,
    }
  }

  return {
    code: 0,
    data: {
      list: rows.map((r) => ({
        ...r,
        cert_name: CERT_NAME[r.cert_type] || '证件',
        remind_text: Array.isArray(r.remind_days)
          ? r.remind_days.join('/')
          : String(r.remind_days || '').replace(/[{}]/g, '').replace(/,/g, '/'),
        is_km: r.cert_type === 'maintain',
      })),
      counts,
    },
  }
}

async function actionPostpone(event, scope) {
  const id = Number(event.id)
  const when = String(event.next_remind_at || '').trim()
  if (!id || !when) return { code: 400, message: '参数不全' }

  /* 只允许改自己租户的提醒 */
  const rows = await queryTable(
    'reminders',
    `id=eq.${enc(id)}&select=id,owner_account&limit=1`
  )
  const row = rows[0]
  if (!row) return { code: 404, message: '提醒不存在' }
  if (String(row.owner_account || '') !== scope.ownerKey) return { code: 403, message: '无权操作' }

  await updateTable('reminders', `id=eq.${enc(id)}`, {
    next_remind_at: when,
    snooze_until: when,
  })
  return { code: 0, data: { id, next_remind_at: when } }
}

async function actionRenew(event, scope) {
  const id = Number(event.id)
  const expire = String(event.expire_date || '').trim()
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(expire)) {
    return { code: 400, message: '请选择正确的新到期日' }
  }

  const rows = await queryTable(
    'reminders',
    `id=eq.${enc(id)}&select=id,owner_account,cert_id,cert_type,plate,org,customer_id,vehicle_id,remind_days&limit=1`
  )
  const r = rows[0]
  if (!r) return { code: 404, message: '提醒不存在' }
  if (String(r.owner_account || '') !== scope.ownerKey) return { code: 403, message: '无权操作' }
  if (!r.cert_id) return { code: 400, message: '这条提醒没有关联证件，请到 Web 端处理' }

  const patch = { expire_date: expire, updated_at: new Date().toISOString() }
  if (event.cert_no) patch.cert_no = String(event.cert_no).trim()
  if (Array.isArray(event.remind_days) && event.remind_days.length) {
    patch.remind_days = event.remind_days
  }

  await updateTable('vehicle_certs', `id=eq.${enc(r.cert_id)}`, patch)

  /* 关闭这条提醒；新日期若仍在窗口内，下次扫描会再生成一条 */
  await updateTable('reminders', `id=eq.${enc(id)}`, {
    status: '已处理',
    handle_action: 'renew',
    handled_by: (scope.user && (scope.user.name || scope.user.account)) || '',
    handled_at: new Date().toISOString(),
  })

  return { code: 0, data: { id, expire_date: expire } }
}

/* ---------- 入口 ---------- */
exports.main = async (event) => {
  try {
    const account = String((event && event.account) || '').trim()
    if (!account) return { code: 400, message: '未登录' }

    const scope = await resolveScope(account)
    if (scope.error) return scope.error

    const action = String((event && event.action) || 'count').trim()
    if (action === 'count') return await actionCount(scope)
    if (action === 'list') return await actionList(event, scope)
    if (action === 'postpone') return await actionPostpone(event, scope)
    if (action === 'renew') return await actionRenew(event, scope)
    return { code: 400, message: '未知操作：' + action }
  } catch (e) {
    console.error('vehicle-affair 执行失败：', e)
    return { code: 500, message: e.message || '服务异常' }
  }
}