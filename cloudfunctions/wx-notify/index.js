/**
 * 云函数：wx-notify
 * ============================================================
 * 微信订阅消息（运单场景）
 *
 * action:
 *   bind      { account, code, role }      ← wx.login 的 code 换 openid 并落库
 *   config    {}                            ← 返回模板 ID（没配就是空，前端据此隐藏按钮）
 *   assigned  { id | waybill_no }           ← 派单后通知司机
 *   finished  { id | waybill_no }           ← 运单完成后通知管理端（常驻趟次只计数不推）
 *   recurring_end { group_no }               ← 常驻任务结束，整组只推一次
 *
 * 设计要点：
 *   1) 不引 wx-server-sdk：access_token 走 appid+secret（云函数环境变量），统一用 fetch
 *   2) 模板 ID / 字段映射全部走环境变量：**没配就静默跳过**，不影响派单和完单主流程
 *   3) 用 wx_notify_log 唯一键去重：同一条运单 + 事件 + openid 只发一次
 *   4) 发送失败只记日志，绝不抛错给前端
 *
 * 环境变量（云函数配置里加）：
 *   WX_APPID                 小程序 AppID
 *   WX_APPSECRET             小程序 AppSecret
 *   WX_TPL_ASSIGNED          派单提醒模板 ID
 *   WX_TPL_ASSIGNED_FIELDS   {"waybill_no":"character_string1","route":"thing2","time":"time3"}
 *   WX_TPL_FINISHED          完成提醒模板 ID
 *   WX_TPL_FINISHED_FIELDS   {"waybill_no":"character_string1","driver":"name2","time":"time3"}
 *   WX_MINIPROGRAM_STATE     formal（默认）/ trial / developer
 */

const { randomUUID } = require('crypto')

const API_BASE = process.env.TCB_API_BASE || 'https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com'
const WX_API = 'https://api.weixin.qq.com'
const DEVICE_ID = randomUUID()

const APPID = process.env.WX_APPID || ''
const SECRET = process.env.WX_APPSECRET || ''
const STATE = process.env.WX_MINIPROGRAM_STATE || 'formal'

const TPL = {
  assigned: process.env.WX_TPL_ASSIGNED || '',
  finished: process.env.WX_TPL_FINISHED || '',
}

const parseFields = (raw, fallback) => {
  if (!raw) return fallback
  try {
    const obj = JSON.parse(raw)
    return obj && typeof obj === 'object' ? obj : fallback
  } catch (e) {
    console.warn('[wx-notify] 字段映射不是合法 JSON，用默认值', raw)
    return fallback
  }
}

const FIELDS = {
  /* 默认对「任务指派提醒」模板（thing1/name2/time5/thing17/thing18）：
     任务名称←运单号、指派人←发单人、指派时间、起始地址、目的地址 */
  assigned: parseFields(process.env.WX_TPL_ASSIGNED_FIELDS, {
    waybill_no: 'thing1',
    creator: 'name2',
    time: 'time5',
    pickup: 'thing17',
    delivery: 'thing18',
  }),
  /* 默认对「任务完成通知」模板（thing1/name3/time5/number13）：
     任务名称←单号、接单人←司机、完成时间、累计完成数 */
  finished: parseFields(process.env.WX_TPL_FINISHED_FIELDS, {
    waybill_no: 'thing1',
    driver: 'name3',
    time: 'time5',
    total: 'number13',
  }),
}

const enc = encodeURIComponent
const nowIso = () => new Date().toISOString()

/* ============================================================
   云开发网关（匿名 token，2 小时过期）
   ============================================================ */
let _token = ''
let _tokenExp = 0

async function getToken(force = false) {
  if (!force && _token && Date.now() < _tokenExp) return _token
  const r = await fetch(`${API_BASE}/auth/v1/signin/anonymously`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-device-id': DEVICE_ID },
    body: '{}',
  })
  const j = await r.json()
  if (!j.access_token) throw new Error('匿名登录失败')
  _token = j.access_token
  _tokenExp = Date.now() + Math.max(60, Number(j.expires_in || 7200) - 300) * 1000
  return _token
}

async function gw(method, path, body, prefer = 'return=representation') {
  for (let i = 0; i < 2; i++) {
    const token = await getToken(i > 0)
    const res = await fetch(`${API_BASE}/v1/rdb/rest/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'x-device-id': DEVICE_ID,
        'Accept-Profile': 'public',
        'Content-Profile': 'public',
        Prefer: prefer,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.status === 401 && i === 0) continue
    const txt = await res.text()
    if (!res.ok) throw new Error(`${method} ${path} ${res.status} ${txt.slice(0, 160)}`)
    return txt ? JSON.parse(txt) : null
  }
  return null
}

async function rpc(fn, body) {
  const token = await getToken()
  const res = await fetch(`${API_BASE}/v1/rdb/rest/rpc/${fn}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-device-id': DEVICE_ID,
      'Accept-Profile': 'public',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  })
  const txt = await res.text()
  if (!res.ok) throw new Error(`rpc ${fn} ${res.status} ${txt.slice(0, 160)}`)
  return txt ? JSON.parse(txt) : null
}

/* ============================================================
   微信 access_token（带缓存；40001/42001 换一次重试）
   ============================================================ */
let _wxToken = ''
let _wxExp = 0

async function wxToken(force = false) {
  if (!force && _wxToken && Date.now() < _wxExp) return _wxToken
  if (!APPID || !SECRET) throw new Error('未配置 WX_APPID / WX_APPSECRET')
  const r = await fetch(
    `${WX_API}/cgi-bin/token?grant_type=client_credential&appid=${enc(APPID)}&secret=${enc(SECRET)}`
  )
  const j = await r.json()
  if (!j.access_token) throw new Error(`获取 access_token 失败：${j.errcode || ''} ${j.errmsg || ''}`)
  _wxToken = j.access_token
  _wxExp = Date.now() + Math.max(60, Number(j.expires_in || 7200) - 300) * 1000
  return _wxToken
}

async function sendSubscribe(openid, templateId, page, data) {
  const post = async (token) => {
    const r = await fetch(`${WX_API}/cgi-bin/message/subscribe/send?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        touser: openid,
        template_id: templateId,
        page,
        data,
        miniprogram_state: STATE,
        lang: 'zh_CN',
      }),
    })
    return r.json()
  }

  let j = await post(await wxToken())
  if (j.errcode === 40001 || j.errcode === 42001) {
    j = await post(await wxToken(true))
  }
  if (j.errcode) throw new Error(`wx ${j.errcode} ${j.errmsg || ''}`)
  return true
}

/* ============================================================
   工具
   ============================================================ */
const clip = (v, n) => String(v == null ? '' : v).slice(0, n)

/* name 关键词只有 10 字：公司全称先去掉「有限公司 / 有限责任公司」再截，
   否则「山西卡友新能源运输有限公司」会变成「山西卡友新能源运」这种半截话 */
const shortOrg = (v) => {
  const raw = String(v || '').trim()
  if (!raw) return ''
  const short = raw.replace(/(有限责任公司|有限公司|公司|集团)$/u, '').trim()
  return clip(short || raw, 10)
}

/** 按模板字段映射组装 data；只发映射里有的字段 */
function buildData(map, values) {
  const out = {}
  Object.keys(map || {}).forEach((key) => {
    const field = map[key]
    if (!field || values[key] == null || values[key] === '') return
    const raw = values[key]
    const limit = String(field).startsWith('thing')
      ? 20
      : String(field).startsWith('name')
        ? 10
        : 32
    out[field] = { value: clip(raw, limit) || '-' }
  })
  return out
}

function assignmentDriverNames(assignments) {
  const out = []
  ;(Array.isArray(assignments) ? assignments : []).forEach((a) => {
    if (!a || a.method !== 'driver') return
    ;(a.items || []).forEach((it) => {
      if (it && it.target) out.push(String(it.target).trim())
    })
  })
  return [...new Set(out.filter(Boolean))]
}

/* ⭐ 抢单（车队 / 车辆指派）也要能推：
   车队单以前直接 skipped（"这单没有指派到司机"），司机根本收不到提醒。
   现在把「车队的组织」和「指派的车辆」也解析出来，各自找到对应司机的手机号。 */
function assignmentTargets(assignments) {
  const drivers = []
  const orgs = []
  const plates = []
  ;(Array.isArray(assignments) ? assignments : []).forEach((a) => {
    if (!a) return
    const method = String(a.method || a.assignMethod || '').trim()
    ;(a.items || []).forEach((it) => {
      const t = String((it && it.target) || '').trim()
      if (!t) return
      if (method === 'driver') drivers.push(t)
      else if (method === 'team') orgs.push(t)
      else if (method === 'vehicle') plates.push(t)
    })
  })
  const uniq = (arr) => [...new Set(arr.filter(Boolean))]
  return { drivers: uniq(drivers), orgs: uniq(orgs), plates: uniq(plates) }
}

/** 车队（组织名）下的司机手机号 */
async function phonesOfOrgs(orgs) {
  if (!orgs.length) return []
  const list = orgs.map((n) => `"${enc(n)}"`).join(',')
  try {
    const rows = await gw(
      'GET',
      `drivers?select=driver_name,phone,org&org=in.(${list})&limit=200`
    )
    return [...new Set((rows || []).map((r) => String(r.phone || '').trim()).filter(Boolean))]
  } catch (e) {
    console.warn('[wx-notify] 按车队取司机失败', e.message)
    return []
  }
}

/** 指派车辆 → 绑定了这辆车的司机手机号（bound_vehicle 可能是逗号串） */
async function phonesOfPlates(plates) {
  if (!plates.length) return []
  const out = []
  for (const p of plates.slice(0, 20)) {
    try {
      const rows = await gw(
        'GET',
        `drivers?select=driver_name,phone,bound_vehicle&bound_vehicle=ilike.*${enc(p)}*&limit=50`
      )
      ;(rows || []).forEach((r) => {
        const ph = String(r.phone || '').trim()
        if (ph) out.push(ph)
      })
    } catch (e) {
      console.warn('[wx-notify] 按车辆取司机失败', p, e.message)
    }
  }
  return [...new Set(out)]
}

async function loadWaybill(event) {
  const id = Number(event.id)
  let rows = []
  if (Number.isFinite(id) && id > 0) {
    rows = await gw('GET', `waybills?id=eq.${id}&select=*&limit=1`)
  } else if (event.waybill_no) {
    rows = await gw('GET', `waybills?waybill_no=eq.${enc(event.waybill_no)}&select=*&limit=1`)
  }
  return rows[0] || null
}

async function phonesOf(names) {
  if (!names.length) return []
  const list = names.map((n) => `"${enc(n)}"`).join(',')
  const rows = await gw('GET', `drivers?select=driver_name,phone&driver_name=in.(${list})&limit=50`)
  return [...new Set((rows || []).map((r) => String(r.phone || '').trim()).filter(Boolean))]
}

async function openidsOf(accounts) {
  const list = [...new Set((accounts || []).map((a) => String(a || '').trim()).filter(Boolean))]
  if (!list.length) return []
  const q = list.map((a) => `"${enc(a)}"`).join(',')
  const rows = await gw('GET', `wx_openids?select=account,openid&account=in.(${q})&limit=200`)
  return (rows || []).filter((r) => r.openid)
}

/** status_log 可能回来是字符串：取最后一条「已完成」的操作人 */
function lastFinishOperator(wb) {
  let log = wb && wb.status_log
  if (typeof log === 'string') {
    try { log = JSON.parse(log) } catch (e) { log = [] }
  }
  if (!Array.isArray(log)) return ''
  for (let i = log.length - 1; i >= 0; i--) {
    const it = log[i]
    if (it && it.status === '已完成') return String(it.operator || it.account || '').trim()
  }
  return ''
}

/** 原子 +1，返回新的累计完成数 */
async function bumpStat(owner, driver) {
  if (!owner || !driver) return 0
  try {
    const n = await rpc('bump_driver_finish', { p_owner: owner, p_driver: driver })
    return Number(n) || 0
  } catch (e) {
    console.warn('[wx-notify] 累计完成数 +1 失败（不影响消息）', e.message)
    return 0
  }
}

async function finishCount(owner, driver) {
  if (!owner || !driver) return 0
  try {
    const rows = await gw(
      'GET',
      `driver_finish_stats?owner_account=eq.${enc(owner)}&driver_name=eq.${enc(driver)}&select=finished_count&limit=1`
    )
    return Number(rows[0] && rows[0].finished_count) || 0
  } catch (e) {
    return 0
  }
}

async function staffAccounts(owner) {
  if (!owner) return []
  const o = enc(owner)
  const rows = await gw(
    'GET',
    `users?select=account,role_id,owner_account&or=(account.eq.${o},owner_account.eq.${o})&limit=200`
  )
  /* 员工 + 主账号本人都收；主账号 role_id 是 null，别漏掉 */
  return (rows || [])
    .filter((u) => (u.role_id !== null && u.role_id !== undefined) || u.account === owner)
    .map((u) => String(u.account || '').trim())
    .filter(Boolean)
}

/** 去重占位：抢到才发 */
async function claim(waybillNo, event, openid) {
  try {
    const rows = await gw(
      'POST',
      'wx_notify_log?on_conflict=waybill_no,event,openid',
      { waybill_no: waybillNo, event, openid },
      'resolution=ignore-duplicates,return=representation'
    )
    return Array.isArray(rows) && rows.length > 0
  } catch (e) {
    console.warn('[wx-notify] 去重写入失败，按可发处理', e.message)
    return true
  }
}

async function markFail(waybillNo, event, openid, err) {
  try {
    await gw(
      'PATCH',
      `wx_notify_log?waybill_no=eq.${enc(waybillNo)}&event=eq.${enc(event)}&openid=eq.${enc(openid)}`,
      { ok: false, err: clip(err, 180) }
    )
  } catch (e) {
    /* 忽略 */
  }
}

/* ============================================================
   actions
   ============================================================ */
async function handleBind(event) {
  if (!APPID || !SECRET) {
    return { code: 500, message: '云函数未配置 WX_APPID / WX_APPSECRET' }
  }
  const account = String(event.account || '').trim()
  const code = String(event.code || '').trim()
  if (!account || !code) return { code: 400, message: '缺少 account / code' }

  const r = await fetch(
    `${WX_API}/sns/jscode2session?appid=${enc(APPID)}&secret=${enc(SECRET)}&js_code=${enc(code)}&grant_type=authorization_code`
  )
  const j = await r.json()
  if (!j.openid) return { code: 400, message: `换取 openid 失败：${j.errcode || ''} ${j.errmsg || ''}` }

  await gw(
    'POST',
    'wx_openids?on_conflict=account',
    {
      account,
      openid: j.openid,
      role: event.role || null,
      user_id: Number(event.user_id) || null,
      updated_at: nowIso(),
    },
    'resolution=merge-duplicates,return=representation'
  )
  return { code: 0, data: { openid: j.openid }, message: '已绑定' }
}

function handleConfig() {
  return {
    code: 0,
    data: {
      assigned: TPL.assigned || '',
      finished: TPL.finished || '',
      ready: !!(APPID && SECRET),
    },
  }
}

async function handleAssigned(event) {
  if (!TPL.assigned) return { code: 0, skipped: true, message: '未配置派单提醒模板' }
  const wb = await loadWaybill(event)
  if (!wb) return { code: 404, message: '运单不存在' }
  if (!['待接单', '待装车', '待重新指派'].includes(wb.status)) {
    return { code: 0, skipped: true, message: `状态「${wb.status}」不发派单提醒` }
  }

  const tgt = assignmentTargets(wb.assignments)
  if (!tgt.drivers.length && !tgt.orgs.length && !tgt.plates.length) {
    return { code: 0, skipped: true, message: '这单没有任何指派对象（车队/抢单也按车队推）' }
  }

  /* 三种指派各自找收件人：司机 → 车队组织下所有司机 → 被指派车辆绑定的司机 */
  const phones = [
    ...(tgt.drivers.length ? await phonesOf(tgt.drivers) : []),
    ...(await phonesOfOrgs(tgt.orgs)),
    ...(await phonesOfPlates(tgt.plates)),
  ]
  const targets = await openidsOf([...new Set(phones)])
  const names = tgt.drivers
  if (!targets.length) return { code: 0, skipped: true, message: '司机还没绑定微信（让他打开一次小程序）' }

  const data = buildData(FIELDS.assigned, {
    waybill_no: wb.waybill_no,
    route: `${wb.pickup || '—'}→${wb.delivery || '—'}`,
    pickup: wb.pickup || '—',
    delivery: wb.delivery || '—',
    /* 指派人：谁发单就显示谁（`creator` 是发单时的姓名快照，主账号那边已经是昵称）。
       ⚠️ 不再写死「大BOSS」—— 那只是个昵称（2026-10-22）。老数据没 creator 才退回「主账号」。 */
    creator: shortOrg(wb.creator) || wb.creator || '主账号',
    driver: names.length ? names.join('、') : '车队抢单',
    time: wb.create_time ? String(wb.create_time).replace('T', ' ').slice(0, 16) : nowIso().slice(0, 16),
    cargo: wb.cargo || '',
  })

  let sent = 0
  let failed = 0
  for (const t of targets) {
    if (!(await claim(wb.waybill_no, 'assigned', t.openid))) continue
    try {
      await sendSubscribe(t.openid, TPL.assigned, `pages/waybill/detail?waybill_no=${enc(wb.waybill_no)}`, data)
      sent++
    } catch (e) {
      failed++
      await markFail(wb.waybill_no, 'assigned', t.openid, e.message)
      console.warn('[wx-notify] 派单提醒发送失败', t.account, e.message)
    }
  }
  return { code: 0, data: { sent, failed }, message: `派单提醒：成功 ${sent}，失败 ${failed}` }
}

async function handleFinished(event) {
  const wb = await loadWaybill(event)
  if (!wb) return { code: 404, message: '运单不存在' }
  if (wb.status !== '已完成') return { code: 0, skipped: true, message: `状态「${wb.status}」不发完成提醒` }

  const owner = String(wb.owner_account || wb.creator_account || '').trim()

  /* 接单人：优先取 status_log 里最后一条「已完成」的操作人（子母车也能落到具体司机） */
  const finisher = lastFinishOperator(wb) || String(wb.driver || '').trim() || '司机'

  /* 累计完成数：每完成一趟 +1（常驻趟次也 +1），同一张运单只加一次 */
  let total = 0
  const firstBump = await claim(wb.waybill_no, 'finished_stat', '__stat__')
  if (firstBump) total = await bumpStat(owner, finisher)
  else total = await finishCount(owner, finisher)

  /* 常驻趟次：计数照加，但不逐趟推送——等整个任务「已结束」再推一次 */
  if (wb.is_recurring) {
    return { code: 0, skipped: true, data: { total }, message: '常驻趟次不逐趟推送' }
  }

  if (!TPL.finished) return { code: 0, skipped: true, message: '未配置完成提醒模板' }

  const accounts = await staffAccounts(owner)
  const targets = await openidsOf(accounts)
  if (!targets.length) return { code: 0, skipped: true, message: '管理端账号还没绑定微信' }

  const data = buildData(FIELDS.finished, {
    waybill_no: wb.waybill_no,
    driver: finisher,
    creator: shortOrg(wb.creator) || '调度',
    route: `${wb.pickup || '—'}→${wb.delivery || '—'}`,
    pickup: wb.pickup || '—',
    delivery: wb.delivery || '—',
    time: wb.finish_time ? String(wb.finish_time).replace('T', ' ').slice(0, 16) : nowIso().slice(0, 16),
    total: total || (await finishCount(owner, finisher)),
  })

  let sent = 0
  let failed = 0
  for (const t of targets) {
    if (!(await claim(wb.waybill_no, 'finished', t.openid))) continue
    try {
      await sendSubscribe(t.openid, TPL.finished, `pages/admin/waybill-detail?id=${wb.id}`, data)
      sent++
    } catch (e) {
      failed++
      await markFail(wb.waybill_no, 'finished', t.openid, e.message)
      console.warn('[wx-notify] 完成提醒发送失败', t.account, e.message)
    }
  }
  return { code: 0, data: { sent, failed, total }, message: `完成提醒：成功 ${sent}，失败 ${failed}` }
}

/* ============================================================
   常驻任务结束：整组只提醒一次（不逐趟推）
   ============================================================ */
async function handleRecurringEnd(event) {
  const groupNo = String(event.group_no || '').trim()
  if (!groupNo) return { code: 400, message: '缺少 group_no' }

  const rows = await gw(
    'GET',
    `waybills?recurring_group_no=eq.${enc(groupNo)}&select=*&order=create_time.asc&limit=200`
  )
  if (!rows || !rows.length) return { code: 404, message: '常驻任务不存在' }

  const main = rows[0]
  if (String(main.recurring_status || '') !== '已结束') {
    return { code: 0, skipped: true, message: `任务状态「${main.recurring_status || '生效中'}」还没结束` }
  }
  if (!TPL.finished) return { code: 0, skipped: true, message: '未配置完成提醒模板' }

  const owner = String(main.owner_account || main.creator_account || '').trim()
  const accounts = await staffAccounts(owner)
  const targets = await openidsOf(accounts)
  if (!targets.length) return { code: 0, skipped: true, message: '管理端账号还没绑定微信' }

  const doneTrips = rows.filter((r) => r.status === '已完成').length
  const data = buildData(FIELDS.finished, {
    waybill_no: main.task_name || main.waybill_no,
    driver: main.driver && main.driver !== '多种' ? main.driver : '全队',
    creator: shortOrg(main.creator) || '调度',
    route: `${main.pickup || '—'}→${main.delivery || '—'}`,
    pickup: main.pickup || '—',
    delivery: main.delivery || '—',
    time: nowIso().slice(0, 16).replace('T', ' '),
    total: doneTrips,
  })

  let sent = 0
  let failed = 0
  for (const t of targets) {
    /* 事件维度去重：同一组只发一次（openid 用 __group__，与逐单的键区分开） */
    if (!(await claim(groupNo, 'recurring_end', t.openid))) continue
    try {
      await sendSubscribe(t.openid, TPL.finished, `pages/admin/waybill-detail?id=${main.id}`, data)
      sent++
    } catch (e) {
      failed++
      await markFail(groupNo, 'recurring_end', t.openid, e.message)
      console.warn('[wx-notify] 常驻结束提醒失败', t.account, e.message)
    }
  }
  return { code: 0, data: { sent, failed, doneTrips }, message: `常驻结束提醒：成功 ${sent}，失败 ${failed}` }
}

/* ============================================================
   入口
   ============================================================ */
exports.main = async (event = {}) => {
  const action = String(event.action || '').trim()
  try {
    if (action === 'bind') return await handleBind(event)
    if (action === 'config') return handleConfig()
    if (action === 'assigned') return await handleAssigned(event)
    if (action === 'finished') return await handleFinished(event)
    if (action === 'recurring_end') return await handleRecurringEnd(event)
    return { code: 400, message: `未知 action：${action}` }
  } catch (e) {
    console.error('[wx-notify] 失败', action, e)
    return { code: 500, message: e.message || '发送失败' }
  }
}
