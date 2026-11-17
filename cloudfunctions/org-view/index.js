/**
 * 云函数：org-view
 * ============================================================
 * 作用：小程序「组织架构」页取数（**只读**）+ 切换账号审计日志
 * 调用：
 *   wx.cloud.callFunction({ name: 'org-view', data: { account } })                  → 组织树
 *   wx.cloud.callFunction({ name: 'org-view', data: { account, action: 'log-switch',
 *       targetAccount, targetName, mode } })                                        → 写一条切换日志
 *
 * 口径：
 *   · 谁能看：客户主账号（role_id 空 + owner_account 空）与员工（role_id 非空）；司机 403。
 *   · 看哪家：owner = 主账号自己 / 员工的 owner_account。子账号只看本家。
 *   · 人员 = users(org_id) + drivers(org_id)；车辆 = vehicles(org_id)。
 *   · 可切换的账号 = 该机构下「role_id 非空 + mp_login_enabled + 未停用」的用户（司机不给切）。
 *
 * 运行时：Node.js 18.15（只用内置 fetch，无 npm 依赖）
 * 环境变量：无
 */

const { randomUUID } = require('crypto')

const API_BASE = 'https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com'
const DEVICE_ID = randomUUID()
const enc = encodeURIComponent

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

async function queryTable(table, query) {
  const url = `${API_BASE}/v1/rdb/rest/${table}${query ? '?' + query : ''}`
  const doFetch = (token) =>
    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-device-id': DEVICE_ID,
        Accept: 'application/json',
        'Accept-Profile': 'public',
        'Content-Profile': 'public',
      },
    })
  let res = await doFetch(await getToken())
  if (res.status === 401) res = await doFetch(await getToken(true))
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`查询 ${table} 失败 HTTP ${res.status}: ${txt.slice(0, 200)}`)
  }
  const json = await res.json()
  return Array.isArray(json) ? json : json.data || []
}

async function insertRow(table, body) {
  const url = `${API_BASE}/v1/rdb/rest/${table}`
  const doFetch = (token) =>
    fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-device-id': DEVICE_ID,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Accept-Profile': 'public',
        'Content-Profile': 'public',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    })
  let res = await doFetch(await getToken())
  if (res.status === 401) res = await doFetch(await getToken(true))
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`写入 ${table} 失败 HTTP ${res.status}: ${txt.slice(0, 200)}`)
  }
  return true
}

const isDisabled = (row) => {
  const st = row && row.status
  if (st === 0 || st === false) return true
  const s = String(st === null || st === undefined ? '' : st).trim().toLowerCase()
  return s === '0' || s === 'false' || s === 'disabled'
}

const displayName = (u) =>
  String((u && u.nickname) || '').trim() ||
  String((u && u.name) || '').trim() ||
  String((u && u.account) || '')

const inListOf = (ids) => ids.map((id) => `"${id}"`).join(',')

exports.main = async (event = {}) => {
  try {
    const account = String(event.account || '').trim()
    if (!account) return { code: 401, message: '缺少账号' }

    const meRows = await queryTable(
      'users',
      `account=eq.${enc(account)}&select=account,name,nickname,role_id,owner_account,org_id,mp_login_enabled,status&limit=1`
    )
    const me = meRows[0]
    if (!me) return { code: 403, message: '账号不存在' }

    const ownerOfMe = String(me.owner_account || '').trim()
    const isMaster = !me.role_id && !ownerOfMe
    const isStaff = !!me.role_id
    if (!isMaster && !isStaff) return { code: 403, message: '司机账号不能查看组织架构' }

    const owner = isMaster ? account : ownerOfMe
    if (!owner) return { code: 403, message: '找不到归属主账号' }

    /* ---------- 写切换日志（前端切身份时顺手记一条，表没建就忽略） ---------- */
    if (String(event.action || '') === 'log-switch') {
      const target = String(event.targetAccount || '').trim()
      if (!target) return { code: 400, message: '缺少目标账号' }
      try {
        await insertRow('account_switch_logs', {
          owner_account: owner,
          actor_account: account,
          actor_name: displayName(me),
          target_account: target,
          target_name: String(event.targetName || '').trim(),
          action: String(event.mode || 'switch'),
          detail: String(event.detail || '').slice(0, 200),
          device_id: String(event.deviceId || '').slice(0, 60),
          device_label: String(event.deviceLabel || '').slice(0, 80),
        })
        return { code: 0 }
      } catch (e) {
        /* 表还没建 / 权限不足都不该挡住业务 */
        console.warn('[org-view] 写切换日志失败（忽略）', e.message)
        return { code: 0, skipped: true }
      }
    }

    /* ---------- 组织树 ---------- */
    const orgs = await queryTable(
      'organizations',
      `owner_account=eq.${enc(owner)}` +
        `&select=id,name,level,parent_id,leader,phone,is_root,status` +
        `&order=level.asc,id.asc&limit=200`
    )
    const ids = (orgs || []).map((o) => o.id).filter((x) => x !== null && x !== undefined)

    /* ---------- 人 / 车 / 角色 ---------- */
    const users = await queryTable(
      'users',
      `or=(owner_account.eq.${enc(owner)},account.eq.${enc(owner)})` +
        `&select=account,name,nickname,role_id,org_id,mp_login_enabled,status&limit=500`
    )
    const roles = await queryTable('roles', 'select=id,name,role_type&limit=200')
    const roleMap = {}
    ;(roles || []).forEach((r) => { roleMap[String(r.id)] = r })

    let vehicles = []
    let drivers = []
    if (ids.length) {
      const inList = enc(inListOf(ids))
      try {
        vehicles = await queryTable(
          'vehicles',
          `org_id=in.(${inList})&select=plate,org_id&limit=1000`
        )
      } catch (e) {
        console.warn('[org-view] 车辆统计失败（忽略）', e.message)
      }
      try {
        drivers = await queryTable(
          'drivers',
          `org_id=in.(${inList})&select=driver_name,org_id&limit=1000`
        )
      } catch (e) {
        console.warn('[org-view] 司机统计失败（忽略）', e.message)
      }
    }

    const countBy = (rows, key) => {
      const map = {}
      ;(rows || []).forEach((r) => {
        const k = String((r && r[key]) === null || (r && r[key]) === undefined ? '' : r[key])
        if (!k) return
        map[k] = (map[k] || 0) + 1
      })
      return map
    }
    const vCount = countBy(vehicles, 'org_id')
    const dCount = countBy(drivers, 'org_id')
    const uCount = countBy(users, 'org_id')

    /* 可切换账号：按机构分组（司机没有 role_id，自然被排除） */
    const accountsByOrg = {}
    ;(users || []).forEach((u) => {
      const orgId = u.org_id === null || u.org_id === undefined ? '' : String(u.org_id)
      if (!orgId) return
      if (!u.role_id) return
      if (u.mp_login_enabled !== true) return
      if (isDisabled(u)) return
      if (String(u.account) === String(account)) return /* 自己不用切 */
      const role = roleMap[String(u.role_id)] || {}
      ;(accountsByOrg[orgId] = accountsByOrg[orgId] || []).push({
        account: String(u.account || ''),
        name: displayName(u),
        roleName: String(role.name || ''),
        roleType: String(role.role_type || 'normal'),
      })
    })

    const orgList = (orgs || []).map((o) => {
      const idStr = String(o.id)
      const people = (uCount[idStr] || 0) + (dCount[idStr] || 0)
      return {
        id: o.id,
        name: String(o.name || ''),
        level: Number(o.level) || 1,
        parentId: o.parent_id === null || o.parent_id === undefined ? null : o.parent_id,
        leader: String(o.leader || ''),
        phone: String(o.phone || ''),
        isRoot: o.is_root === true,
        disabled: isDisabled(o),
        vehicles: vCount[idStr] || 0,
        people,
        accounts: accountsByOrg[idStr] || [],
      }
    })

    /* 合计只算启用中的机构，避免把已停用的机构算进去 */
    const live = orgList.filter((o) => !o.disabled)
    return {
      code: 0,
      data: {
        owner,
        isMaster,
        me: { account: String(me.account || ''), name: displayName(me) },
        orgs: orgList,
        totals: {
          orgs: live.length,
          vehicles: live.reduce((s, o) => s + o.vehicles, 0),
          people: live.reduce((s, o) => s + o.people, 0),
          accounts: live.reduce((s, o) => s + o.accounts.length, 0),
        },
      },
    }
  } catch (e) {
    console.error('org-view 执行失败：', e)
    return { code: 500, message: e.message || '服务异常' }
  }
}
