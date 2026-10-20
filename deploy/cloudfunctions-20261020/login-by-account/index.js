/**
 * 云函数：login-by-account
 * ============================================================
 * 作用：小程序账号密码登录，返回用户权限 + 司机档案
 * 调用：wx.cloud.callFunction({ name: 'login-by-account', data: { account, password } })
 * 运行时：Node.js 18.15（只用内置 fetch，无 npm 依赖）
 * 环境变量：无
 *
 * ⚠️ 本文件是「参考实现」，不是线上正在运行的代码。
 *    第 2 节「数据库访问层」需与 CloudBase 控制台里的实际实现核对后再使用。
 *
 * 返回契约见《数据契约.md》§2.3
 * ⚠️ 返回的 user.isSubAccount / orgName / ownerAccount 直接决定 vehicle-list 的隔离结果，
 *    缺任意一个都可能导致小程序端查询被过滤成空。
 */

const { randomUUID } = require('crypto')

/* ============================================================
   1. 常量
   ============================================================ */
const API_GATEWAY = 'https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com'

/* ============================================================
   2. 数据库访问层   ⚠️ 需与线上核对
   ============================================================ */
let _token = null
let _tokenExp = 0 // 匿名 access token 的过期时间戳（ms）
let _deviceId = null

const getDeviceId = () => {
  if (!_deviceId) _deviceId = randomUUID()
  return _deviceId
}

const getToken = async (force) => {
  /* ⭐ 匿名 token 只有 2 小时（expires_in=7200）。原来只判 `if (_token) return _token`，
     容器热过 2 小时后登录会直接失败：「查询 users 失败 HTTP 401 ACCESS_TOKEN_EXPIRED」。
     现在按过期时间取，并支持 401 时强制换 token 重试。 */
  if (_token && !force && Date.now() < _tokenExp) return _token
  _token = null
  const res = await fetch(`${API_GATEWAY}/auth/v1/signin/anonymously`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-device-id': getDeviceId() },
    body: JSON.stringify({}),
  })
  if (!res.ok) throw new Error(`匿名登录失败 HTTP ${res.status}`)
  const json = await res.json()
  _token =
    json.access_token ||
    json.accessToken ||
    (json.data && json.data.access_token)
  if (!_token) throw new Error('匿名登录未返回 token')
  const ttl = Number(json.expires_in) || 7200
  _tokenExp = Date.now() + Math.max(60, ttl - 300) * 1000 // 提前 5 分钟换
  return _token
}

/* 所有查表/写表都走这里：自带「401 → 换 token → 重试一次」 */
const restFetch = async (method, table, query, body) => {
  const url = `${API_GATEWAY}/v1/rdb/rest/${table}${query ? '?' + query : ''}`
  const doFetch = async (token) => {
    const headers = {
      Authorization: `Bearer ${token}`,
      'x-device-id': getDeviceId(),
      Accept: 'application/json',
      'Accept-Profile': 'public',
      'Content-Profile': 'public',
    }
    if (body) headers['Content-Type'] = 'application/json'
    if (method !== 'GET') headers.Prefer = 'return=representation'
    return fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
  }

  let res = await doFetch(await getToken())
  if (res.status === 401) res = await doFetch(await getToken(true))
  return res
}

const dbSelect = async (table, query) => {
  const res = await restFetch('GET', table, query)
  const text = await res.text()
  if (!res.ok) {
    const err = new Error(`查询 ${table} 失败 HTTP ${res.status}: ${text.slice(0, 200)}`)
    err.status = res.status
    err.body = text
    throw err
  }
  if (!text) return []
  try {
    const json = JSON.parse(text)
    return Array.isArray(json) ? json : json.data || []
  } catch (e) {
    return []
  }
}

/* 写库（PATCH / POST / DELETE）—— 只在「登录落会话」这一处用 */
const dbRequest = async (method, table, query, body) => {
  const res = await restFetch(method, table, query, body)
  const text = await res.text()
  if (!res.ok) {
    const err = new Error(`${method} ${table} 失败 HTTP ${res.status}: ${text.slice(0, 200)}`)
    err.status = res.status
    err.body = text
    throw err
  }
  if (!text) return []
  try {
    return JSON.parse(text)
  } catch (e) {
    return []
  }
}

/* user_sessions 表还没建（没执行 sql/2026-10-17_user_sessions.sql） */
const isMissingTable = (err) => {
  const s = String((err && (err.body || err.message)) || '')
  return /PGRST205|Could not find the table|does not exist|42P01|undefined_table/i.test(s)
}

/* ============================================================
   3. 角色判定（口径见《数据契约.md》§4）
   ------------------------------------------------------------
   司机账号       = role_id IS NULL AND owner_account IS NOT NULL
   管理员 / 子账号 = role_id IS NOT NULL
   客户主账号     = role_id IS NULL AND owner_account IS NULL
   ============================================================ */
const resolveRole = (u) => {
  const hasRole = u.role_id !== null && u.role_id !== undefined && u.role_id !== ''
  const ownerAccount = String(u.owner_account || '').trim()
  const isSubAccount = !!ownerAccount && ownerAccount !== u.account

  if (!hasRole && ownerAccount) return { kind: 'driver', isSubAccount, ownerAccount }
  if (hasRole) return { kind: 'staff', isSubAccount, ownerAccount }
  return { kind: 'master', isSubAccount: false, ownerAccount: '' }
}

/* ============================================================
   3.5 ⭐ 模块开关（与 Web 端 src/config/modules.js 保持一致）
   ------------------------------------------------------------
   规则同 Web：
     ① 没有记录 = 按 defaultOn（只有运单默认开）
     ② 依赖折叠只在内存里算，父模块关 → 子模块无效
     ③ 表不存在 / 读失败 → 全开降级（避免一次迁移把客户业务关掉）
   ============================================================ */
const MODULES = [
  { key: 'waybill',   name: '运单管理',     defaultOn: true,  deps: [],          perm: 'waybill' },
  { key: 'route',     name: '路线管理',     defaultOn: false, deps: ['waybill'], perm: 'route' },
  { key: 'recurring', name: '常驻任务',     defaultOn: false, deps: ['waybill'], perm: 'waybill' },
  { key: 'payout',    name: '付款记录',     defaultOn: false, deps: ['waybill'], perm: 'fee_pay' },
  { key: 'report',    name: '车队运营报告', defaultOn: false, deps: ['waybill'], perm: 'report' },
]

const allOn = () => MODULES.reduce((m, x) => { m[x.key] = true; return m }, {})

const foldDeps = (flags) => {
  const eff = {}
  MODULES.forEach((m) => {
    const raw = flags[m.key]
    eff[m.key] = raw === undefined || raw === null ? m.defaultOn === true : raw === true
  })
  for (let pass = 0; pass < MODULES.length; pass++) {
    let changed = false
    MODULES.forEach((m) => {
      if (!eff[m.key]) return
      if ((m.deps || []).some((d) => eff[d] !== true)) { eff[m.key] = false; changed = true }
    })
    if (!changed) break
  }
  return eff
}

/** ownerAccount 为空时无法读配置，按默认值走 */
const loadModules = async (ownerAccount) => {
  if (!ownerAccount) return foldDeps({})
  try {
    const rows = await dbSelect(
      'tenant_modules',
      `select=module_key,enabled&owner_account=eq.${encodeURIComponent(ownerAccount)}`
    )
    const intent = {}
    ;(rows || []).forEach((r) => {
      if (r && r.module_key) intent[r.module_key] = r.enabled === true
    })
    return foldDeps(intent)
  } catch (e) {
    /* 表还没建 → 全开；其他错误也全开，宁可多给不可误关 */
    console.warn(
      `loadModules 降级（${isMissingTable(e) ? 'tenant_modules 表不存在' : '读取失败'}）：` +
        (e.message || e)
    )
    return allOn()
  }
}

/* ============================================================
   4. 组装返回对象
   ============================================================ */
const buildUser = (u, role, org) => ({
  id: u.id,
  account: u.account,
  name: u.name || '',
  phone: u.phone || '',
  roleId: role.kind === 'driver' ? null : u.role_id ?? null,
  orgId: u.org_id ?? null,
  // 主账号兜底：没有机构名时用用户自己的名字（与 Web 端口径一致）
  orgName: (org && org.name) || (role.kind === 'master' ? u.name || '' : ''),
  orgLevel: org ? Number(org.level) || 1 : null,
  isSubAccount: role.isSubAccount,
  ownerAccount: role.ownerAccount,
  platform: 'miniprogram',
})

const buildDriver = (d) =>
  d
    ? {
        driver_name: d.driver_name || '',
        phone: d.phone || '',
        org: d.org || '',
        org_id: d.org_id ?? null,
        bound_vehicle: d.bound_vehicle || '',
      }
    : {}

/* ============================================================
   4.1 ⭐ 财务端可见性
   ------------------------------------------------------------
   三层全部成立才给财务端入口：
     运单模块开  AND  (审批 mode≠off  OR  付款模块开)  AND  角色是财务/主账号
   最后一格（审批关 + 付款关）必须回管理端，不能把人扔进空页面。
   ============================================================ */
async function resolveIsFinance(u, role) {
  if (role.kind === 'master') return true
  if (role.kind !== 'staff') return false
  if (!u.role_id) return false
  try {
    const rows = await dbSelect(
      'roles',
      `select=id,name,role_type&id=eq.${encodeURIComponent(u.role_id)}&limit=1`
    )
    const r = rows[0] || {}
    return r.role_type === 'finance' || /财务/.test(String(r.name || ''))
  } catch (e) {
    return false
  }
}

async function loadApprovalMode(ownerAccount) {
  if (!ownerAccount) return 'on'
  try {
    const rows = await dbSelect(
      'fee_approval_configs',
      `select=mode&owner_account=eq.${encodeURIComponent(ownerAccount)}&limit=1`
    )
    const m = rows[0] && rows[0].mode
    return m || 'on'
  } catch (e) {
    return 'on'
  }
}

/* ============================================================
   4.2 ⭐ 底栏与落地页（服务端算，前端不要自己拼）
   ------------------------------------------------------------
   之前 tabBar 的 list 是写死的，模块关了入口还在。
   现在统一由这里给 tabs，前端照单渲染。
   ============================================================ */
const buildTabs = (kind, mods) => {
  if (kind === 'staff') {
    const tabs = [
      { text: '概览', path: '/pages/admin/home' },
      { text: '车辆', path: '/pages/admin/vehicle' },
    ]
    if (mods.waybill) {
      tabs.push({ text: '运单', path: '/pages/admin/waybill' })
      tabs.push({ text: '路线', path: '/pages/admin/route' })
    }
    tabs.push({ text: '我的', path: '/pages/admin/mine' })
    return tabs
  }
  /* 司机端 / 客户主账号 */
  const tabs = [{ text: '车辆管理', path: '/pages/vehicle/list' }]
  if (mods.waybill) {
    tabs.push({ text: '任务中心', path: '/pages/waybill/list' })
    tabs.push({ text: '上报', path: '/pages/report/center' })
  }
  tabs.push({ text: '我的', path: '/pages/mine/mine' })
  return tabs
}

const homeOf = (kind, tabs) => {
  if (kind === 'staff') return '/pages/admin/home'
  const first = tabs.find((t) => t.path !== '/pages/mine/mine')
  return (first && first.path) || '/pages/vehicle/list'
}

/* ============================================================
   4.5 ⭐ 会话落库（单设备登录 / 顶号）
   ------------------------------------------------------------
   一个 account 一行：最后一次登录写入的 token 生效。
   老设备拿旧 token 去 session-guard 心跳 → 不匹配 → 被顶下线。
   ⚠️ 会话记账失败**绝不能**把登录挡下来（表没建时照样能登录，只是不限制设备）。
   ============================================================ */
const openSession = async (account, event) => {
  const token = randomUUID().replace(/-/g, '')
  const deviceId = String((event && event.deviceId) || '').trim().slice(0, 64)
  const deviceLabel =
    String((event && event.deviceLabel) || '').trim().slice(0, 120) || '未知设备'
  const nowIso = new Date().toISOString()
  const row = {
    platform: 'miniprogram',
    token,
    device_id: deviceId,
    device_label: deviceLabel,
    login_at: nowIso,
    last_seen: nowIso,
  }

  const mine = { token, enforced: false, loginAt: nowIso, deviceLabel, previous: null }

  try {
    let before = null
    try {
      const prev = await dbSelect(
        'user_sessions',
        `select=account,device_id,device_label,login_at&account=eq.${encodeURIComponent(
          account
        )}&limit=1`
      )
      before = prev[0] || null
    } catch (e) {
      if (isMissingTable(e)) throw e
      /* 读旧会话失败不影响写新会话 */
    }

    /* upsert：先 PATCH（已有一行），没命中再 INSERT（第一次登录） */
    let written = await dbRequest(
      'PATCH',
      'user_sessions',
      `account=eq.${encodeURIComponent(account)}`,
      row
    )
    if (!Array.isArray(written) || !written.length) {
      try {
        await dbRequest('POST', 'user_sessions', '', { account, ...row })
      } catch (e2) {
        /* 两台设备同时登录撞主键 → 再 PATCH 一次，最后写的赢 */
        if (/duplicate|unique|23505/i.test(String(e2.body || e2.message || ''))) {
          await dbRequest(
            'PATCH',
            'user_sessions',
            `account=eq.${encodeURIComponent(account)}`,
            row
          )
        } else {
          throw e2
        }
      }
    }

    return {
      ...mine,
      enforced: true,
      /* ⭐ 上一次登录的是「别的设备」才回给前端 —— 同机重登不该提示「已下线其他设备」 */
      previous:
        before && String(before.device_id || '') !== deviceId
          ? { deviceLabel: before.device_label || '', loginAt: before.login_at || '' }
          : null,
    }
  } catch (e) {
    const missing = isMissingTable(e)
    console.warn(
      `openSession 降级（${missing ? 'user_sessions 表不存在' : '写会话失败'}）：` +
        (e.message || e)
    )
    return { ...mine, degraded: true }
  }
}

/* ============================================================
   5. 入口
   ============================================================ */
exports.main = async (event) => {
  try {
    const account = String((event && event.account) || '').trim()
    const password = String((event && event.password) || '')
    if (!account || !password) return { code: 500, message: '请输入账号和密码' }

    // ⚠️ 登录校验的是 users.password（不是 customers / admins）
    const users = await dbSelect(
      'users',
      `select=*&account=eq.${encodeURIComponent(account)}&limit=1`
    )
    const u = users[0]
    if (!u) return { code: 500, message: '账号或密码不正确' }
    if (String(u.password || '') !== password) {
      return { code: 500, message: '账号或密码不正确' }
    }
    if (u.status === 0 || u.status === false || u.status === 'disabled') {
      return { code: 500, message: '账号已停用' }
    }

    const role = resolveRole(u)

    /* ⭐ 小程序管理端开关（users.mp_login_enabled）
       只对「管理员 / 员工」（role_id 非空）生效：关掉就登不上小程序管理端。
       司机账号（role_id 为空）不看这一列 —— 否则一次 default false 的迁移
       就能把全体司机挡在门外。
       ⚠️ 列不存在时 u.mp_login_enabled 为 undefined → 按「未开通」处理，
          所以必须先执行 sql/2026-10-17_users_mp_login.sql 再部署本函数。 */
    const canAdmin = role.kind === 'staff' && u.mp_login_enabled === true
    if (role.kind === 'staff' && !canAdmin) {
      console.log(`login-by-account：${account} 未开通小程序管理端（mp_login_enabled）`)
      return {
        code: 500,
        message: '该账号未开通小程序登录，请联系管理员',
        needAdmin: true,
      }
    }

    /* ⭐ 模块开关：owner_account 决定读哪家的配置
       主账号用自己的 account，员工/司机用 owner_account */
    const ownerAccount = role.kind === 'master'
      ? String(u.account || '').trim()
      : String(u.owner_account || '').trim()
    const modules = await loadModules(ownerAccount)

    /* ⭐ 运单关了 → 司机端不该存在（只剩「车辆 + 我的」是残缺形态，直接拒绝登录） */
    if (role.kind === 'driver' && !modules.waybill) {
      console.log(`login-by-account：${account} 所属车队未开通运单模块，拒绝司机登录`)
      return {
        code: 500,
        message: '本车队未开通运输业务，暂时无法登录。如有疑问请联系车队管理员',
        needWaybill: true,
      }
    }

    /* ⭐ 财务端：三层判定 */
    const canFinance = await resolveIsFinance(u, role)
    const approvalMode = await loadApprovalMode(ownerAccount)
    const auditOn = approvalMode !== 'off'
    const financeVisible =
      canFinance && modules.waybill === true && (auditOn || modules.payout === true)
    const financeUrl = financeVisible ? '/pages/finance/home' : ''

    const tabs = buildTabs(role.kind, modules)
    /* 财务落地页优先：财务人员登录直接进待办，不用先绕管理端 */
    const homeUrl = financeUrl || homeOf(role.kind, tabs)

    // 机构信息
    let org = null
    if (u.org_id !== null && u.org_id !== undefined && u.org_id !== '') {
      const orgs = await dbSelect(
        'organizations',
        `select=id,name,level,is_root&id=eq.${encodeURIComponent(u.org_id)}&limit=1`
      )
      org = orgs[0] || null
    }

    // 司机档案
    let driver = null
    if (role.kind === 'driver') {
      const drivers = await dbSelect(
        'drivers',
        `select=driver_name,phone,org,org_id,bound_vehicle&phone=eq.${encodeURIComponent(
          u.phone || account
        )}&limit=1`
      )
      driver = drivers[0] || null
    }

    console.log(`login-by-account：${account} → ${role.kind}`)

    /* ⭐ 签发会话凭证（单设备登录用）：登录成功即把别的设备顶下线 */
    const session = await openSession(account, event)

    return {
      code: 0,
      user: buildUser(u, role, org),
      driver: buildDriver(driver),
      session,
      /* ⭐ 前端只认这个字段决定去「管理端」还是「司机端」，不要自己拿 roleId 判 */
      canAdmin,
      /* ⭐ 模块与底栏：前端照单渲染，不要在客户端自己拼 */
      modules,
      tabs,
      homeUrl,
      /* ⭐ 财务端：canFinance 只是「人合格」，financeUrl 非空才是「真能用」 */
      canFinance,
      financeUrl,
      approvalMode,
    }
  } catch (e) {
    console.error('login-by-account 执行失败：', e)
    return { code: 500, message: e.message || '服务异常' }
  }
}
