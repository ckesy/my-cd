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

/**
 * 账号是否停用（**唯一口径**）
 * ------------------------------------------------------------
 * ⚠️ 这个判定有两处用户：① 登录时的「账号已停用」；② 判断这家有没有「专职财务」。
 *    两处必须一致 —— 否则会出现「一个永远登不上的财务号把管理员永久挡在合并之外」。
 * status 历史上可能是数字 0/1、布尔 true/false、字符串 '0'/'disabled'，
 * 一律归一化处理；null/undefined 仍按「未停用」放行（老数据里没有这一列）。
 */
const isDisabledUser = (u) => {
  const st = u && u.status
  if (st === 0 || st === false) return true
  const s = String(st === null || st === undefined ? '' : st).trim().toLowerCase()
  return s === '0' || s === 'false' || s === 'disabled'
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
  /* ⭐ 角色类型（master / staff / driver）：前端判断「客户主账号」只认它，
     不要靠 roleId 是否为空去猜（0 / '' 这类脏数据会猜错）。老会话没有这个字段时再回退。 */
  roleKind: role.kind,
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
   4.1 ⭐ 财务能力 + 权限点
   ------------------------------------------------------------
   以前这里只算「是不是财务角色」，但 **能不能审 / 能不能付** 其实是
   report-action 的 `financePermsOf` 说了算（角色权限点 fee_audit / fee_pay）。
   两边口径不一致就会出现：管理端底栏给了「审批 / 财务」，点进去立刻被
   「（付款记录）未开通」踢回概览 —— 用户看到的就是「进管理端报错」。
   现在一次把角色和 permissions 读回来，permissions 与云函数同一套过滤。
   ============================================================ */
const FIN_PERMS = ['fee_audit', 'fee_pay', 'fee_stats']

async function resolveFinanceRole(u, role) {
  if (role.kind === 'master') return { canFinance: true, perms: FIN_PERMS.slice() }
  if (role.kind !== 'staff') return { canFinance: false, perms: [] }
  if (!u.role_id) return { canFinance: false, perms: [] }
  try {
    const rows = await dbSelect(
      'roles',
      `select=id,name,role_type,permissions&id=eq.${encodeURIComponent(u.role_id)}&limit=1`
    )
    const r = rows[0] || {}
    const name = String(r.name || '')
    const isFin = r.role_type === 'finance' || /财务/.test(name)
    if (isFin) return { canFinance: true, perms: FIN_PERMS.slice() }
    /* ⭐ 管理员（老板）默认带三项：小车队没有专职财务时，管理员就是既审又付的人。
       ⚠️ 只认「管理员」，不认「总管 / 分管」，避免区域经理白拿付款权。 */
    if (/管理员/.test(name)) return { canFinance: false, perms: FIN_PERMS.slice() }
    /* 其他员工：按角色权限点（和 report-action 一致） */
    const p = r.permissions
    const arr = Array.isArray(p) ? p : (p && Array.isArray(p.client) ? p.client : [])
    return { canFinance: false, perms: arr.filter((x) => FIN_PERMS.includes(x)) }
  } catch (e) {
    return { canFinance: false, perms: [] }
  }
}

/**
 * ⭐ 本租户是否已经有「专职财务」账号（同主账号下、财务角色、能登录小程序、且不是自己）。
 * 有 → 管理员不再合并财务 tab，退回普通管理端（审批走运单详情，他仍是一级审批人）。
 * 2026-10-22 用户拍板：「选了财务角色就分开」。
 *
 * ⭐ 2026-10-22 补：**停用的财务账号 = 没有**（用户明确：禁用了就跟没这个人一致）。
 *    只看 mp_login_enabled 不够 —— 停用账号那一位还是 true，结果管理员被一个
 *    永远登不上的财务号永久挡在合并之外，审批/财务两个 tab 一直不出现。
 *    判停用统一走 isDisabledUser()，与登录那一步同口径。
 */
async function hasDedicatedFinance(ownerAccount, selfAccount) {
  if (!ownerAccount) return false
  try {
    const roles = await dbSelect('roles', 'select=id&role_type=eq.finance&limit=50')
    const ids = (roles || []).map((r) => r.id).filter((x) => x !== null && x !== undefined)
    if (!ids.length) return false
    const inList = ids.map((id) => `"${id}"`).join(',')
    const rows = await dbSelect(
      'users',
      `owner_account=eq.${encodeURIComponent(ownerAccount)}` +
        `&role_id=in.(${encodeURIComponent(inList)})` +
        `&mp_login_enabled=is.true&select=account,status&limit=20`
    )
    const valid = (rows || []).filter(
      (u) => !isDisabledUser(u) && String(u.account || '') !== String(selfAccount || '')
    )
    if (valid.length) console.log(`login-by-account：本家有专职财务 ${valid.map((u) => u.account).join('/')}`)
    return valid.length > 0
  } catch (e) {
    /* 查不到就当没有专职财务（宁可合并，也别把人卡在管理端啥也干不了） */
    console.log('login-by-account：查专职财务失败（忽略）', e.message)
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

   ⭐ 合并模式（2026-10-22，方案 B）：
      小车队没有专职财务，管理员自己既管运单又审单/付款。
      这时 **不给管理员开「财务角色」**（canFinance=false），登录时把
      「审批 / 财务」两个 tab 直接并进管理端底栏 —— 一次登录一套底栏搞定。
      一旦 Web 端给某人指派了「财务角色」，那个账号走纯财务端（分开）。
      fin 参数只在合并模式传：{ audit: bool, payout: bool }
   ============================================================ */
const buildTabs = (kind, mods, fin) => {
  /* ⭐ 客户主账号（大BOSS）：固定 4 格 —— 概览 / 运单 / 组织 / 个人。
     车辆、路线不进底栏（收到概览的运力条与「个人」里）；财务端是独立工作台，从「个人」切。 */
  if (kind === 'master') {
    const t = [{ text: '概览', path: '/pages/admin/home' }]
    if (mods.waybill) t.push({ text: '运单', path: '/pages/admin/waybill' })
    t.push({ text: '组织', path: '/pages/admin/org' })
    t.push({ text: '个人', path: '/pages/admin/mine' })
    return t
  }
  if (kind === 'staff') {
    /* ⭐ 纯财务角色（分开模式）：底栏就是财务那 5 格，不给管理端的车辆/路线
       —— 以前这里无条件给管理端 tabs，结果财务角色登录后 homeUrl 指向财务端，
          tabs 却是管理端那套，看起来就"还是进了管理端"。 */
    if (fin && fin.mode === 'finance') {
      const t = [{ text: '待办', path: '/pages/finance/home', key: 'todo' }]
      if (fin.payout) t.push({ text: '待登记', path: '/pages/finance/pay-list', key: 'pay' })
      t.push({ text: '台账', path: '/pages/finance/ledger', key: 'ledger' })
      t.push({ text: '统计', path: '/pages/finance/stats', key: 'stats' })
      t.push({ text: '我的', path: '/pages/finance/mine', key: 'mine' })
      return t
    }
    /* 合并模式：5 格 —— 概览 / 运单 / 审批 / 财务 / 我的
       车辆、路线退到「概览」的运力条和「我的」里的入口（不是每天高频操作） */
    if (fin && fin.mode === 'merged') {
      const merged = [{ text: '概览', path: '/pages/admin/home' }]
      if (mods.waybill) merged.push({ text: '运单', path: '/pages/admin/waybill' })
      if (fin.audit) merged.push({ text: '审批', path: '/pages/finance/home', key: 'todo' })
      if (fin.payout) merged.push({ text: '财务', path: '/pages/finance/pay-list', key: 'pay' })
      merged.push({ text: '个人', path: '/pages/admin/mine' })
      return merged
    }
    const tabs = [
      { text: '概览', path: '/pages/admin/home' },
      { text: '车辆', path: '/pages/admin/vehicle' },
    ]
    if (mods.waybill) {
      tabs.push({ text: '运单', path: '/pages/admin/waybill' })
      tabs.push({ text: '路线', path: '/pages/admin/route' })
    }
    tabs.push({ text: '个人', path: '/pages/admin/mine' })
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
    if (isDisabledUser(u)) return { code: 500, message: '账号已停用' }

    const role = resolveRole(u)

    /* ⭐ 小程序管理端开关（users.mp_login_enabled）
       只对「管理员 / 员工」（role_id 非空）生效：关掉就登不上小程序管理端。
       司机账号（role_id 为空）不看这一列 —— 否则一次 default false 的迁移
       就能把全体司机挡在门外。
       ⚠️ 列不存在时 u.mp_login_enabled 为 undefined → 按「未开通」处理，
          所以必须先执行 sql/2026-10-17_users_mp_login.sql 再部署本函数。 */
    /* ⭐ 2026-10-22：客户主账号（大BOSS）也进管理端 —— 以前只有 staff 算 canAdmin，
       主账号登录会落到财务端首页、底栏却是司机端那套。主账号不看 mp_login_enabled。 */
    const canAdmin =
      role.kind === 'master' ||
      (role.kind === 'staff' && u.mp_login_enabled === true)
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

    /* ⭐ 财务能力 + 权限点（与 report-action 同口径） */
    const finRole = await resolveFinanceRole(u, role)
    const canFinance = finRole.canFinance
    const finPerms = finRole.perms || []
    const approvalMode = await loadApprovalMode(ownerAccount)
    const auditOn = approvalMode !== 'off'
    /* 真能不能审 / 能不能付，看的是权限点（fee_audit / fee_pay），不是模块开关 */
    const canAudit = auditOn && finPerms.includes('fee_audit')
    const canPay = modules.payout === true && finPerms.includes('fee_pay')

    /* ⭐ 财务账号闸门（2026-10-22 用户拍板）：
       财务角色（不是管理员、也不是主账号）如果「费用审批」和「付款记录」都没开通，
       这个小程序里他一件能做的事都没有 —— 财务页会立刻提示未开通再踢回来，
       底栏还会退回管理端那套（他本来就没权限）。干脆在登录这一步就拦住，
       直接提示「权限未开通」。
       ⚠️ 只拦「纯财务角色」：管理员（车队长）和客户主账号不受影响，
          他们还有运单/车辆/我的，而且还要进去把开关打开。 */
    if (role.kind === 'staff' && canFinance && !auditOn && modules.payout !== true) {
      console.log(`login-by-account：${account} 费用审批与付款记录均未开通，拒绝财务账号登录`)
      return {
        code: 500,
        message: '该账号未开通费用审批与付款记录权限，请联系管理员',
        needFinance: true,
      }
    }

    const financeVisible = canFinance && modules.waybill === true && (auditOn || modules.payout === true)
    const financeUrl = financeVisible ? '/pages/finance/home' : ''

    /* ⭐ 合并模式（方案 B）：管理员兼审批/付款时，把财务两个 tab 并进管理端底栏。
       ⚠️ 必须按「权限点」判断，不能只看模块开没开 —— 否则管理员角色没勾
          fee_audit/fee_pay 时，底栏给了「审批/财务」，点进去被判未开通又踢回来。
       没有财务角色 + 能进管理端 + 真的能审或能付 → 合并。 */
    /* ⭐ 本租户已经有专职财务 → 管理员不合并（「选了财务角色就分开」） */
    const dedicatedFinance = await hasDedicatedFinance(ownerAccount, account)
    const mergedFinance =
      canAdmin &&
      !canFinance &&
      modules.waybill === true &&
      (canAudit || canPay) &&
      !dedicatedFinance

    /* ⭐ 三种底栏形态，别搞混：
       merged  → 管理员兼审批/付款，一套底栏 5 格
       finance → 财务角色（分开模式），底栏就是财务那 5 格
       null    → 普通管理端 概览/车辆/运单/路线/我的 */
    let finMode = null
    if (mergedFinance) finMode = { mode: 'merged', audit: canAudit, payout: canPay }
    else if (canFinance && financeVisible)
      finMode = { mode: 'finance', audit: canAudit, payout: canPay }

    const tabs = buildTabs(role.kind, modules, finMode)

    /* 财务端那套底栏（切成财务工作台时用），只有真能用才算一个 port */
    const finTabs = canFinance && financeVisible
      ? buildTabs(role.kind, modules, { mode: 'finance', audit: canAudit, payout: canPay })
      : null
    const ports = []
    if (canAdmin) ports.push({ key: 'admin', text: '管理端', tabs, homeUrl: '/pages/admin/home' })
    if (finTabs) ports.push({ key: 'finance', text: '财务端', tabs: finTabs, homeUrl: '/pages/finance/home' })
    /* 合并模式下落地页固定是概览（一套底栏里两边都能到，不用先绕财务待办） */
    /* ⭐ 客户主账号一律落管理端概览。
       财务待办（/pages/finance/home）是财务人员的工位，老板一登录被丢进「待我审」，
       底栏却还是管理端那套 —— 2026-10-22 用户实测就是这个现象。
       主账号要看财务，从底栏「财务」或「工作台 → 财务端」自己切，不由服务端代劳。 */
    const homeUrl =
      role.kind === 'master'
        ? '/pages/admin/home'
        : mergedFinance
          ? '/pages/admin/home'
          : financeUrl || homeOf(role.kind, tabs)

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
      /* ⭐ 昵称（2026-10-22）：主账号可自定义；空则回退 name。
         派单 / 审批 / 代操作处的显示名都用它，不再写死「大BOSS」。 */
      nickname: String(u.nickname || '').trim(),
      displayName:
        String(u.nickname || '').trim() ||
        String(u.name || '').trim() ||
        String(account || ''),
      /* ⭐ 工作台（端口）：至少 admin；财务端开通且合格时多一个 finance。
         前端「个人 → 工作台」按这个列表渲染并本地切换（不退出登录、不动会话）。 */
      ports,
      canFinance,
      financeUrl,
      approvalMode,
      /* ⭐ 合并底栏：前端底栏按这一位决定要不要把「审批/财务」和「运单」画在一起 */
      mergedFinance,
      dedicatedFinance,
    }
  } catch (e) {
    console.error('login-by-account 执行失败：', e)
    return { code: 500, message: e.message || '服务异常' }
  }
}
