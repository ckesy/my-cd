/**
 * 云函数：report-action
 * ============================================================
 * 司机端「上报」的唯一写入口 + 列表读取
 *
 * action:
 *   create    { type, waybill_no, amount, items, note, images }
 *   resubmit  { id, amount, items, note, images, payload }   ← 已驳回单改回审核中
 *   detail    { id }                                          ← 取单条（重提时回填）
 *   review    { id, op:'approve'|'reject', comment }          ← 小程序管理端审批
 *   pending   {}                                              ← 我当前节点待审的上报
 *   list      { waybill_no?, limit? }
 *
 * 设计要点：
 *   1) 金额 / 净重这类数字**服务端重算**，不信任前端
 *   2) 审批链在提交时生成并写进 reports.flow（快照），之后改配置不影响在途单
 *   3) 一级=发单人（可免审）、二级=本机构财务（缺失则顶主账号）、三级=主账号（阈值/财务要求）
 *   4) 同一人不重复出现在两级；一级=上报人本人时跳过
 *   5) 重提 = 改原单（不新建）：状态回「审核中」、按**当前配置**重建审批链从第一级重走，
 *      reject_count 只在驳回时 +1（重提不重复加），重提动作另写 report_approval_logs
 *
 * ⚠️ 匿名 token 只有 2 小时：getToken 必须按过期时间取，401 换 token 重试一次
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

async function request(method, table, query, body) {
  const url = `${API_BASE}/v1/rdb/rest/${table}${query ? '?' + query : ''}`
  const doFetch = async (token) => {
    const headers = {
      Authorization: `Bearer ${token}`,
      'x-device-id': DEVICE_ID,
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
  return res.json()
}

const queryTable = (table, query) => request('GET', table, query)
const insertTable = (table, row) => request('POST', table, '', row)
const updateTable = (table, query, row) => request('PATCH', table, query, row)

/* ============================================================
   常量
   ============================================================ */
const TYPE_SET = ['expense', 'weigh', 'subsidy', 'violation', 'overtime', 'receipt', 'loan', 'cardfix']
const MONEY_TYPES = ['expense', 'subsidy', 'loan', 'violation']
const TYPE_LABEL = {
  expense: '费用上报', weigh: '磅单上报', subsidy: '补贴申请', violation: '违章上报',
  overtime: '超时报备', receipt: '回单上报', loan: '借款申请', cardfix: '补卡申请',
}
const STATUS_PENDING = '审核中'
const STATUS_APPROVED = '已通过'
const STATUS_REJECTED = '已驳回'
/* ⭐ 付款环节（pay_required 为 true 才会进入） */
const STATUS_TO_PAY = '待打款'
const STATUS_PAID = '已打款'

/* ============================================================
   工具
   ============================================================ */
const nowIso = () => new Date().toISOString()
const pad2 = (n) => String(n).padStart(2, '0')

const genReportNo = () => {
  const d = new Date()
  const ymd = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
  const seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  return `RP${ymd}${seq}`
}

const toNum = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const money = (n) => Math.round(toNum(n) * 100) / 100

/* ============================================================
   身份
   ============================================================ */
async function loadContext(account) {
  const users = await queryTable(
    'users',
    `account=eq.${enc(account)}&select=id,account,name,phone,owner_account,org_id,role_id&limit=1`
  )
  const user = users[0]
  if (!user) throw new Error('账号不存在')

  const ownerAccount = String(user.owner_account || '').trim() || String(user.account || '').trim()
  const driverPhone = String(user.phone || '').trim() || account

  let driver = null
  try {
    /* ⚠️ drivers 表没有 name / plates 列（实际是 driver_name / bound_vehicle），
       以前按 name 取会 42703 → driver 恒为 null（不阻断，但车牌和姓名全靠兜底） */
    const list = await queryTable(
      'drivers',
      `phone=eq.${enc(driverPhone)}&select=id,driver_name,phone,bound_vehicle&limit=1`
    )
    const d = list[0]
    driver = d
      ? { id: d.id, name: d.driver_name, phone: d.phone, plates: d.bound_vehicle }
      : null
  } catch (e) {
    console.warn('[report-action] 读司机档案失败（不阻断）', e.message)
  }

  return { account, user, ownerAccount, driverPhone, driver }
}

async function loadWaybill(waybillNo) {
  const rows = await queryTable(
    'waybills',
    `waybill_no=eq.${enc(waybillNo)}&select=*&limit=1`
  )
  return rows[0] || null
}

/* ============================================================
   指派归属（软校验，与 waybill-action 的 isAssignedToDriver 同口径）
   ------------------------------------------------------------
   ⚠️ 2026-10-20 修复：以前只看 waybills.driver 这个**展示串**。
      一单派给 2 个司机时 Web 落库的 driver 是「2 人」（多车是「多种」/「2 辆」），
      字符串永远不含司机姓名 → 两个司机上报都被判「该运单不是派给你的」。
      现在先按 assignments 逐条比姓名 / 车牌，再退回展示串的模糊判断。
   ============================================================ */
function parseAssignments(raw) {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const v = JSON.parse(raw)
      return Array.isArray(v) ? v : []
    } catch (e) {
      return []
    }
  }
  return []
}

const splitPlates = (raw) =>
  String(raw || '')
    .split(/[,，、;；/\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)

/** 这条单有没有指派到我（姓名或车牌命中即算） */
function assignedToMe(wb, ctx, myName) {
  const plates = splitPlates(ctx.driver && ctx.driver.plates)
  for (const a of parseAssignments(wb && wb.assignments)) {
    const method = String((a && (a.method || a.assignMethod)) || '').trim()
    for (const it of Array.isArray(a && a.items) ? a.items : []) {
      const target = String((it && it.target) || '').trim()
      if (!target) continue
      if (method === 'driver' && myName && target === myName) return true
      if (method === 'vehicle' && plates.includes(target)) return true
    }
  }
  return false
}

/** 展示串是聚合值时（多种 / 2人 / 2辆 / -- / 空）没法按名字判断 → 放行 */
const isAggregatedDriver = (v) => {
  const s = String(v || '').trim()
  if (!s) return true
  if (['多种', '--', '-', '未指定'].includes(s)) return true
  return /^\d+\s*[人名辆]$/.test(s)
}

/* ============================================================
   审批链
   ============================================================ */
async function loadConfig(ownerAccount) {
  try {
    const rows = await queryTable(
      'fee_approval_configs',
      `owner_account=eq.${enc(ownerAccount)}&limit=1`
    )
    return rows[0] || null
  } catch (e) {
    console.warn('[report-action] 读审批配置失败，按默认开启处理', e.message)
    return null
  }
}

/* ============================================================
   ⭐ 财务配置：审批策略（三态）× 付款模块（二元）
   ------------------------------------------------------------
   mode 来自 fee_approval_configs（已有），payout 来自 tenant_modules。
   ⚠️ 不要给审批再加一个模块开关：mode 已经是它的开关，
      两个开关并存必然出现「模块开 + 策略关 = 到底审不审」。
   ============================================================ */
let _finCache = new Map()
const FIN_TTL = 5 * 1000

async function loadFinanceConfig(ownerAccount) {
  const hit = _finCache.get(ownerAccount)
  if (hit && Date.now() < hit.exp) return hit.cfg

  const cfg = (await loadConfig(ownerAccount)) || { mode: 'on' }
  /* mode 缺失按 'on'（保持现有审批行为不丢） */
  if (!cfg.mode) cfg.mode = 'on'

  let payout = false
  try {
    const mods = await queryTable(
      'tenant_modules',
      `owner_account=eq.${enc(ownerAccount)}&select=module_key,enabled`
    )
    const row = (mods || []).find((m) => m.module_key === 'payout')
    /* 没记录按关（新功能不擅自打开） */
    payout = !!(row && row.enabled === true)
  } catch (e) {
    /* 表不存在 → 按关，不影响审批 */
    payout = false
  }

  const out = {
    cfg,
    mode: cfg.mode,
    approvalOn: cfg.mode !== 'off',
    payout,
    /* 提交时的快照值 */
    payRequired: payout === true,
  }
  _finCache.set(ownerAccount, { cfg: out, exp: Date.now() + FIN_TTL })
  return out
}

/* 测试用：清配置缓存。生产路径不会调用（只供 test/run.js 切场景） */
exports.__clearFinCache = () => { _finCache.clear() }

/* 列不存在时剥掉新字段重试（迁移没跑也不能把上报打挂） */
const isMissingColumn = (e) =>
  /PGRST204|column .* does not exist|42703|pay_required/i.test(
    String((e && (e.body || e.message)) || '')
  )

async function findFinanceUser(ownerAccount, config) {
  if (config && config.l2_user_id) {
    const rows = await queryTable(
      'users',
      `id=eq.${enc(config.l2_user_id)}&select=id,account,name&limit=1`
    )
    if (rows[0]) return rows[0]
  }

  try {
    const roles = await queryTable('roles', 'select=id,name&limit=100')
    const financeRoleIds = new Set(
      roles.filter((r) => String(r.name || '').includes('财务')).map((r) => Number(r.id))
    )
    if (!financeRoleIds.size) return null

    const users = await queryTable(
      'users',
      `owner_account=eq.${enc(ownerAccount)}&select=id,account,name,role_id,status&limit=200`
    )
    const hit = users.find(
      (u) => financeRoleIds.has(Number(u.role_id)) && u.status !== 0 && u.status !== false
    )
    return hit || null
  } catch (e) {
    console.warn('[report-action] 查找财务失败', e.message)
    return null
  }
}

async function findMasterUser(ownerAccount) {
  try {
    const rows = await queryTable(
      'users',
      `account=eq.${enc(ownerAccount)}&select=id,account,name&limit=1`
    )
    return rows[0] || null
  } catch (e) {
    return null
  }
}

async function findUserByAccount(account) {
  if (!account) return null
  try {
    const rows = await queryTable(
      'users',
      `account=eq.${enc(account)}&select=id,account,name&limit=1`
    )
    return rows[0] || null
  } catch (e) {
    return null
  }
}

/**
 * 生成审批链快照
 * @returns {{ flow: Array, currentLevel: number, enabled: boolean }}
 */
async function buildFlow(ctx, wb, config, amount) {
  const enabled = (() => {
    if (!config) return true
    if (config.mode === 'off') return false
    if (config.mode === 'on') return true
    const ov = String((wb && wb.fee_approval) || 'inherit')
    if (ov === 'on') return true
    if (ov === 'off') return false
    return config.custom_default !== false
  })()

  if (!enabled) return { flow: [], currentLevel: 0, enabled: false }

  const flow = []
  const push = (step) => {
    // 同一个人的相邻两级去重
    const prev = flow[flow.length - 1]
    if (prev && step.account && prev.account === step.account) return
    flow.push(step)
  }

  /* ---------- 一级：发单人（或配置指定人） ---------- */
  const l1Skip = config && config.l1_mode === 'skip'
  let l1User = null
  if (config && config.l1_user_id) {
    const rows = await queryTable(
      'users',
      `id=eq.${enc(config.l1_user_id)}&select=id,account,name&limit=1`
    )
    l1User = rows[0] || null
  } else if (wb && wb.creator_account) {
    l1User = await findUserByAccount(wb.creator_account)
  }

  const l1Name = (l1User && l1User.name) || (wb && wb.creator) || '发单人'
  const l1IsReporter = !!(l1User && l1User.account && l1User.account === ctx.account)

  if (l1Skip || l1IsReporter || !l1User) {
    push({
      level: 1,
      role: 'creator',
      approver_id: l1User ? l1User.id : null,
      account: l1User ? l1User.account : '',
      name: l1Name,
      status: '已跳过',
      acted_at: nowIso(),
      comment: l1Skip ? '一级免审（配置）' : (l1IsReporter ? '一级免审（本人）' : '未找到发单人，自动跳过'),
    })
  } else {
    push({
      level: 1,
      role: 'creator',
      approver_id: l1User.id,
      account: l1User.account,
      name: l1Name,
      status: '待处理',
    })
  }

  /* ---------- 二级：本机构财务，缺失则顶主账号 ---------- */
  const finance = await findFinanceUser(ctx.ownerAccount, config)
  const master = await findMasterUser(ctx.ownerAccount)

  if (finance && finance.account !== ctx.account) {
    push({
      level: 2,
      role: 'finance',
      approver_id: finance.id,
      account: finance.account,
      name: finance.name || finance.account,
      status: '待处理',
    })
  } else if (master) {
    push({
      level: 2,
      role: 'owner',
      approver_id: master.id,
      account: master.account,
      name: master.name || master.account,
      status: '待处理',
      note: '未配置财务，二级由主账号执行',
    })
  }

  /* ---------- 三级：主账号（阈值 / 财务要求），与前面同人则跳过 ---------- */
  const threshold = toNum(config && config.threshold)
  const needOwner =
    !!master &&
    master.account !== ctx.account &&
    ((config && config.require_owner === true) || (threshold > 0 && toNum(amount) >= threshold))

  if (needOwner && !flow.some((s) => s.account === master.account)) {
    push({
      level: 3,
      role: 'owner',
      approver_id: master.id,
      account: master.account,
      name: master.name || master.account,
      status: '待处理',
    })
  }

  // 重排 level（去重后可能缺号）
  flow.forEach((s, i) => { s.level = i + 1 })

  const firstPending = flow.find((s) => s.status === '待处理')
  if (!firstPending) {
    return { flow, currentLevel: 0, enabled: true }
  }
  return { flow, currentLevel: firstPending.level, enabled: true }
}

/* ============================================================
   内容归一（create / resubmit 共用）
   ⚠️ 金额 / 净重 / 超时时长一律服务端重算，前端值只当预览；
      差异字段走白名单，别把前端 payload 整包写库。
   ============================================================ */
function normalizeContent(event, type) {
  /* 金额：明细求和，不信任前端 */
  const items = Array.isArray(event.items) ? event.items : []
  const cleanItems = items
    .map((it) => ({
      name: String(it.name || '').trim().slice(0, 30),
      amount: money(it.amount),
      date: String(it.date || '').trim().slice(0, 10),
      note: String(it.note || '').trim().slice(0, 60),
    }))
    .filter((it) => it.name && it.amount > 0)

  /* ⚠️ 2026-10-20 修复：以前所有「钱款类」都拿明细求和，
     但补贴 / 借款 / 违章前端只填一个总金额（items 是空的）→ 恒为 0 →
     报「请至少填写一笔有效金额」，页面根本提交不了。
     现在只有费用上报（expense）用明细求和，其它三类用前端传的 amount。 */
  const amount = type === 'expense'
    ? money(cleanItems.reduce((s, it) => s + it.amount, 0))
    : money(event.amount)

  if (MONEY_TYPES.includes(type) && amount <= 0) {
    return { error: '请至少填写一笔有效金额' }
  }

  /* ⭐ 凭证（2026-10-20）：上传已改为「客户端直传 COS」，字段是 `key`；
     更早的数据是云存储 `fileID`。
     ⚠️ 以前这里只认 fileID → 新上传的图**全被过滤掉**，库里 images 恒为 []，
        小程序和 Web 都看不到凭证。现在两种都收（有 key 用 key，没有才用 fileID）。 */
  const images = Array.isArray(event.images)
    ? event.images
        .map((x) => {
          if (!x) return null
          const key = String(x.key || '').trim()
          const fid = String(x.fileID || '').trim()
          if (!key && !fid) return null
          const row = {
            name: String(x.name || '').slice(0, 60),
            size: Number(x.size) || 0,
          }
          if (key) row.key = key
          else row.fileID = fid
          return row
        })
        .filter(Boolean)
        .slice(0, 9)
    : []

  const note = String(event.note || '').trim().slice(0, 200)

  /* 单据类（回单 / 磅单）必须带照片 */
  if ((type === 'receipt' || type === 'weigh') && !images.length) {
    return { error: '请至少上传一张照片' }
  }

  const src = (event && event.payload) || {}
  let extra = {}
  if (type === 'receipt') {
    extra = {
      receipt_no: String(src.receipt_no || '').trim().slice(0, 40),
      receipt_date: String(src.receipt_date || '').trim().slice(0, 10),
    }
  } else if (type === 'overtime') {
    if (!images.length) return { error: '超时报备请至少上传一张现场照片' }
    const planned = String(src.planned_at || '').trim().replace(' ', 'T').slice(0, 19)
    const actual = String(src.actual_at || '').trim() || nowIso()
    const pms = Date.parse(planned)
    const ams = Date.parse(actual)
    if (!Number.isFinite(pms)) return { error: '计划时间无效，无法计算超时' }
    const duration = Number.isFinite(ams) ? Math.round((ams - pms) / 60000) : 0
    if (duration <= 0) return { error: '实际时间要晚于计划时间' }
    extra = {
      overtime_type: String(src.overtime_type || '').trim().slice(0, 10),
      planned_at: planned,
      actual_at: actual,
      duration_min: duration,
      reason: String(src.reason || '').trim().slice(0, 20),
    }
  } else if (type === 'weigh') {
    const gross = money(src.gross)
    const tare = money(src.tare)
    if (gross <= 0 || tare <= 0) return { error: '毛重与皮重都要填' }
    if (gross <= tare) return { error: '毛重必须大于皮重' }
    extra = {
      ticket_no: String(src.ticket_no || '').trim().slice(0, 40),
      gross,
      tare,
      net: money(gross - tare),
    }
  } else if (type === 'subsidy') {
    extra = {
      subsidy_type: String(src.subsidy_type || '').trim().slice(0, 12),
      start_date: String(src.start_date || '').trim().slice(0, 10),
      end_date: String(src.end_date || '').trim().slice(0, 10),
    }
  } else if (type === 'violation') {
    if (!images.length) return { error: '请上传处罚决定书照片' }
    extra = {
      violation_date: String(src.violation_date || '').trim().slice(0, 10),
      place: String(src.place || '').trim().slice(0, 40),
      act: String(src.act || '').trim().slice(0, 40),
      points: Math.max(0, Number(src.points) || 0),
    }
  } else if (type === 'loan') {
    extra = {
      loan_date: String(src.loan_date || '').trim().slice(0, 10),
      purpose: String(src.purpose || '').trim().slice(0, 30),
      repay_date: String(src.repay_date || '').trim().slice(0, 10),
    }
  } else if (type === 'cardfix') {
    extra = {
      card_type: String(src.card_type || '').trim().slice(0, 10),
      card_time: String(src.card_time || '').trim() || nowIso(),
      reason: String(src.reason || '').trim().slice(0, 20),
    }
  }

  return { amount, cleanItems, images, note, extra }
}

/* 归属：只认「同一主账号 + 同一司机手机号」；老数据没手机号时放宽到主账号 */
function ownReportError(report, ctx) {
  const owner = String(report.owner_account || '').trim()
  const meOwner = String(ctx.ownerAccount || '').trim()
  if (owner && meOwner && owner !== meOwner) return '无权操作该上报'

  const rp = String(report.driver_phone || '').trim()
  const me = String(ctx.driverPhone || '').trim()
  if (rp && me && rp !== me) return '无权操作该上报'
  return ''
}

/* ============================================================
   action: create
   ============================================================ */
async function handleCreate(event, ctx) {
  const type = String(event.type || '').trim()
  if (!TYPE_SET.includes(type)) return { code: 400, message: '不支持的上报类型' }

  const waybillNo = String(event.waybill_no || '').trim()
  if (!waybillNo) return { code: 400, message: '请先选择运单' }

  const wb = await loadWaybill(waybillNo)
  if (!wb) return { code: 404, message: '运单不存在' }

  /* 归属校验：管理员运单 owner_account 为 null，允许本司机上报 */
  const wbOwner = String(wb.owner_account || '').trim()
  if (wbOwner && wbOwner !== ctx.ownerAccount) {
    return { code: 403, message: '无权对该运单上报' }
  }


  /* ⭐ 必须先「确认接单」才能报这一趟的费用 */
  const wbStatus = String(wb.status || '').trim()
  if (['待接单', '待重新指派', '已取消'].includes(wbStatus)) {
    return { code: 403, message: `运单当前「${wbStatus}」，请先确认接单再上报` }
  }

  /* 指派校验（软校验）：
     1) assignments 里能直接命中「我」（姓名 / 车牌）→ 通过（子母车、多车都靠这条）
     2) driver 是聚合值（多种 / 2人 / 2辆 / -- / 空）→ 没法判断，放行
     3) 其余按展示串包含姓名判，判不出来才 403 */
  const wbDriver = String(wb.driver || '').trim()
  const myName = String((ctx.driver && ctx.driver.name) || ctx.user.name || '').trim()
  const byAssignment = assignedToMe(wb, ctx, myName)
  const byDisplay = !!(wbDriver && myName && wbDriver.includes(myName))
  if (!byAssignment && !byDisplay && !isAggregatedDriver(wbDriver)) {
    return { code: 403, message: '该运单不是派给你的' }
  }

  const content = normalizeContent(event, type)
  if (content.error) return { code: 400, message: content.error }
  const { amount, cleanItems, images, note, extra } = content

  /* 审批链 */
  const config = await loadConfig(ctx.ownerAccount)
  const { flow, currentLevel, enabled } = await buildFlow(ctx, wb, config, amount)

  /* ⭐ 付款是否需要：按当前「付款记录」模块开关**快照**（不是实时判断）。
     若实时判断，今天一开付款模块，历史所有「已通过」会突然涌进待登记。 */
  const fin = await loadFinanceConfig(ctx.ownerAccount)
  const payRequired = fin.payRequired === true

  const approved = enabled && currentLevel === 0
  /* 不走审批 / 一级就过 → 看要不要付款；要付款就停在「待打款」 */
  const status = (!enabled || approved)
    ? (payRequired ? STATUS_TO_PAY : STATUS_APPROVED)
    : STATUS_PENDING

  const row = {
    report_no: genReportNo(),
    type,
    waybill_id: wb.id || null,
    waybill_no: waybillNo,
    owner_account: ctx.ownerAccount,
    org_id: ctx.user.org_id || null,
    driver_name: myName || null,
    driver_phone: ctx.driverPhone || null,
    plate: String(
      ((ctx.driver && ctx.driver.plates) || '').split(',')[0].trim() || wb.plate || wb.vehicle || ''
    ).slice(0, 30) || null,
    amount,
    payload: { items: cleanItems, note, ...extra },
    images,
    status,
    approval_enabled: enabled,
    current_level: currentLevel,
    flow,
    pay_required: payRequired,
    create_time: nowIso(),
    update_time: nowIso(),
  }

  /* 列还不存在（迁移没跑）→ 剥掉新字段重试，别把上报打挂 */
  let inserted
  try {
    inserted = await insertTable('reports', row)
  } catch (e) {
    if (isMissingColumn(e)) {
      const { pay_required, ...rest } = row
      console.warn('[report-action] reports.pay_required 列不存在，已降级写入')
      inserted = await insertTable('reports', rest)
    } else throw e
  }
  const report = Array.isArray(inserted) ? inserted[0] : inserted

  return {
    code: 0,
    data: report,
    message: status === STATUS_APPROVED
      ? '已提交（免审）'
      : `已提交，等待${(flow[currentLevel - 1] || {}).name || '审批人'}审批`,
  }
}

/* ============================================================
   action: resubmit —— 驳回后改原单重提（不新建，避免重复单）
   口径：
     - 只有「已驳回」能重提；条件更新 status=已驳回 防并发
     - 审批链按**当前配置**重建，从第一级重走（金额可能已变）
     - reject_count 只在驳回时 +1；重提另写一条 resubmit 流水
   ============================================================ */
async function handleResubmit(event, ctx) {
  const id = Number(event.id)
  if (!Number.isFinite(id) || id <= 0) return { code: 400, message: '缺少上报记录 id' }

  const rows = await queryTable('reports', `id=eq.${id}&select=*&limit=1`)
  const report = rows[0]
  if (!report) return { code: 404, message: '上报记录不存在' }

  const deny = ownReportError(report, ctx)
  if (deny) return { code: 403, message: deny }

  if (report.status !== STATUS_REJECTED) {
    return { code: 400, message: `当前状态「${report.status || '未知'}」，只有被驳回的单可以重提` }
  }

  const type = String(report.type || '').trim()
  if (!TYPE_SET.includes(type)) return { code: 400, message: '上报类型异常，请联系调度' }

  const waybillNo = String(report.waybill_no || '').trim()
  const wb = waybillNo ? await loadWaybill(waybillNo) : null

  const content = normalizeContent(event, type)
  if (content.error) return { code: 400, message: content.error }
  const { amount, cleanItems, images, note, extra } = content

  const config = await loadConfig(ctx.ownerAccount)
  const { flow, currentLevel, enabled } = await buildFlow(ctx, wb, config, amount)
  const approved = enabled && currentLevel === 0
  const status = !enabled || approved ? STATUS_APPROVED : STATUS_PENDING

  const patch = {
    amount,
    payload: { items: cleanItems, note, ...extra },
    images,
    status,
    approval_enabled: enabled,
    current_level: currentLevel,
    flow,
    update_time: nowIso(),
  }

  /* 条件更新：只有还停在「已驳回」才写得进去，避免两个人同时点重提 */
  const updated = await updateTable(
    'reports',
    `id=eq.${id}&status=eq.${enc(STATUS_REJECTED)}`,
    patch
  )
  const row = Array.isArray(updated) ? updated[0] : updated
  if (!row) return { code: 409, message: '这笔上报已被处理，请刷新后重试' }

  try {
    await insertTable('report_approval_logs', {
      report_id: id,
      level: currentLevel || 0,
      actor_id: ctx.user.id || null,
      actor_name: (ctx.driver && ctx.driver.name) || ctx.user.name || ctx.account,
      action: 'resubmit',
      comment: note ? `重新提交：${note}` : '重新提交',
    })
  } catch (e) {
    console.warn('[report-action] 重提流水写入失败（不影响主流程）', e.message)
  }

  return {
    code: 0,
    data: row,
    message: status === STATUS_APPROVED
      ? '已重新提交（免审）'
      : `已重新提交，等待${(flow[currentLevel - 1] || {}).name || '审批人'}审批`,
  }
}

/* ============================================================
   action: detail —— 重提时回填原单（只给本人）
   ============================================================ */
async function handleDetail(event, ctx) {
  const id = Number(event.id)
  if (!Number.isFinite(id) || id <= 0) return { code: 400, message: '缺少上报记录 id' }

  const rows = await queryTable('reports', `id=eq.${id}&select=*&limit=1`)
  const report = rows[0]
  if (!report) return { code: 404, message: '上报记录不存在' }

  const deny = ownReportError(report, ctx)
  if (deny) return { code: 403, message: deny }

  return { code: 0, data: report }
}

/* ============================================================
   审批人判定（与 Web「运单详情 → 费用情况」同一口径）
   当前节点 = flow[current_level-1]：approver_id 是我，或 owner 节点由主账号兜底
   ============================================================ */
const isStaffCtx = (ctx) => !!(ctx.user && ctx.user.role_id)
const isOwnerAccount = (ctx) =>
  String((ctx.user && ctx.user.account) || '') === String(ctx.ownerAccount || '')

const canActStep = (step, ctx) => {
  if (!step) return false
  if (step.approver_id && Number(step.approver_id) === Number(ctx.user.id)) return true
  return step.role === 'owner' && isOwnerAccount(ctx)
}

/* ============================================================
   action: review —— 小程序管理端审批（approve / reject）
   ⚠️ 只做审批；登记付款需要凭据，仍回 Web「付款登记」
   ============================================================ */
async function handleReview(event, ctx) {
  if (!isStaffCtx(ctx)) return { code: 403, message: '只有管理员可以审批' }

  const id = Number(event.id)
  if (!Number.isFinite(id) || id <= 0) return { code: 400, message: '缺少上报记录 id' }

  const op = String(event.op || '').trim()
  if (!['approve', 'reject', 'escalate'].includes(op)) {
    return { code: 400, message: '不支持的操作' }
  }

  const rows = await queryTable('reports', `id=eq.${id}&select=*&limit=1`)
  const report = rows[0]
  if (!report) return { code: 404, message: '上报记录不存在' }

  const owner = String(report.owner_account || '').trim()
  if (owner && owner !== String(ctx.ownerAccount || '').trim()) {
    return { code: 403, message: '无权审批该上报' }
  }
  if (report.status !== STATUS_PENDING) {
    return { code: 400, message: `当前状态「${report.status || '未知'}」不能审批` }
  }

  const flow = Array.isArray(report.flow) ? JSON.parse(JSON.stringify(report.flow)) : []
  const oldLevel = Number(report.current_level) || 0
  const idx = oldLevel - 1
  const step = flow[idx]
  if (!canActStep(step, ctx)) return { code: 403, message: '当前不是你的审批节点' }

  const now = nowIso()
  const name = ctx.user.name || ctx.user.account || '审批人'
  const comment = String(event.comment || '').trim().slice(0, 100)

  if (op === 'escalate' && Number(oldLevel) < 2) {
    return { code: 403, message: '只有财务节点可以报送老板' }
  }

  if (op === 'approve' || op === 'escalate') {
    step.status = '已通过'
    step.acted_at = now
    step.acted_by = name
    step.comment = op === 'escalate' ? (comment || '要求老板终审') : (comment || '')
    if (op === 'escalate' && !flow.some((x) => Number(x.level) === 3)) {
      /* 没有老板节点就补一个（主账号兜底） */
      let ownerName = '主账号'
      try {
        const rows = await queryTable(
          'users',
          `account=eq.${enc(ctx.ownerAccount || '')}&select=name,account&limit=1`
        )
        if (rows[0]) ownerName = rows[0].name || rows[0].account || ownerName
      } catch (e) { /* ignore */ }
      flow.push({
        level: 3,
        role: 'owner',
        approver_id: null,
        name: ownerName,
        status: '待处理',
      })
    }
  } else {
    step.status = '已驳回'
    step.acted_at = now
    step.acted_by = name
    step.comment = comment || '审批驳回'
  }

  const nextIdx = flow.findIndex((st, i) => i > idx && st.status === '待处理')
  const nextStatus = op === 'reject'
    ? STATUS_REJECTED
    : (nextIdx === -1
        /* ⭐ 走完审批后还有没有付款环节，看提交时的快照，不看现在开没开 */
        ? (report.pay_required === true ? STATUS_TO_PAY : STATUS_APPROVED)
        : STATUS_PENDING)
  const nextLevel = op === 'reject'
    ? 0
    : (nextIdx === -1 ? 0 : (Number(flow[nextIdx].level) || nextIdx + 1))

  const patch = {
    flow,
    status: nextStatus,
    current_level: nextLevel,
    update_time: now,
  }
  if (op === 'reject') {
    patch.reject_reason = step.comment
    patch.reject_count = (Number(report.reject_count) || 0) + 1
  }

  /* CAS：状态 + 当前级别一起做版本号，两个人同时点只有一个成功 */
  const updated = await updateTable(
    'reports',
    `id=eq.${id}&status=eq.${enc(STATUS_PENDING)}&current_level=eq.${oldLevel}`,
    patch
  )
  const row = Array.isArray(updated) ? updated[0] : updated
  if (!row) return { code: 409, message: '这笔上报已被处理，请刷新' }

  try {
    await insertTable('report_approval_logs', {
      report_id: id,
      level: oldLevel,
      actor_id: ctx.user.id || null,
      actor_name: name,
      action: op === 'escalate' ? 'escalate' : (op === 'approve' ? 'approve' : 'reject'),
      comment: op === 'reject' ? step.comment : comment,
    })
  } catch (e) {
    console.warn('[report-action] 审批流水写入失败（不影响主流程）', e.message)
  }

  const endText = nextStatus === STATUS_TO_PAY ? '已通过，待登记付款'
    : nextStatus === STATUS_APPROVED ? '已通过，流程结束' : ''
  const message = op === 'reject'
    ? '已驳回'
    : op === 'escalate'
      ? (endText || '已报送老板终审')
      : (endText || `已通过，转第 ${nextLevel} 级`)
  return { code: 0, data: row, message }
}

/* ============================================================
   ⭐ 财务端：角色与能力
   ------------------------------------------------------------
   两层 × 人级：
     租户级（审批 mode / 付款模块） × 人级（角色权限）
   同一家公司里财务能审批、调度看不到，靠的就是第二层。
   ============================================================ */
async function loadRoleInfo(ctx) {
  const roleId = ctx.user && ctx.user.role_id
  const isMaster = !roleId
  if (isMaster) return { isMaster: true, roleName: '主账号', roleType: 'master' }
  try {
    const rows = await queryTable(
      'roles',
      `id=eq.${enc(roleId)}&select=id,name,role_type,permissions&limit=1`
    )
    const r = rows[0] || {}
    return {
      isMaster: false,
      roleName: String(r.name || ''),
      roleType: String(r.role_type || 'normal'),
      permissions: r.permissions || null,
    }
  } catch (e) {
    return { isMaster: false, roleName: '', roleType: 'normal' }
  }
}

/** 人级财务权限：主账号天然全有；财务角色给三项；其余按 roles.permissions */
function financePermsOf(roleInfo) {
  if (roleInfo.isMaster) return ['fee_audit', 'fee_pay', 'fee_stats']
  const isFinance = roleInfo.roleType === 'finance' || /财务/.test(roleInfo.roleName)
  if (isFinance) return ['fee_audit', 'fee_pay', 'fee_stats']
  const p = roleInfo.permissions
  const arr = Array.isArray(p) ? p : (p && Array.isArray(p.client) ? p.client : [])
  return arr.filter((x) => ['fee_audit', 'fee_pay', 'fee_stats'].includes(x))
}

/** 底栏：按能力算，页面只认 key */
function buildFinanceTabs({ audit, payment, stats }) {
  const tabs = []
  if (audit) tabs.push({ key: 'todo', text: '待办', path: '/pages/finance/home', icon: 0 })
  if (payment) tabs.push({ key: 'pay', text: '待登记', path: '/pages/finance/pay-list', icon: 1 })
  if (audit || payment) tabs.push({ key: 'ledger', text: '台账', path: '/pages/finance/ledger', icon: 2 })
  if (stats && (audit || payment)) tabs.push({ key: 'stats', text: '统计', path: '/pages/finance/stats', icon: 3 })
  tabs.push({ key: 'mine', text: '我的', path: '/pages/finance/mine', icon: 4 })
  return tabs
}

const todayStart = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

async function countReports(owner, query) {
  try {
    const rows = await queryTable('reports', `owner_account=eq.${enc(owner)}&${query}&select=id`)
    return (rows || []).length
  } catch (e) {
    return 0
  }
}

/** 同条件查一笔金额合计（首页大卡用） */
async function sumReports(owner, query) {
  try {
    const rows = await queryTable('reports', `owner_account=eq.${enc(owner)}&${query}&select=amount`)
    return (rows || []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
  } catch (e) {
    return 0
  }
}

/* ============================================================
   action: bootstrap —— 财务端启动只调一次，别让 4 个请求打底
   ============================================================ */
async function handleBootstrap(event, ctx) {
  const fin = await loadFinanceConfig(ctx.ownerAccount)
  const roleInfo = await loadRoleInfo(ctx)
  const perms = financePermsOf(roleInfo)

  const audit = fin.approvalOn && perms.includes('fee_audit')
  const payment = fin.payout && perms.includes('fee_pay')
  const stats = perms.includes('fee_stats') && (audit || payment)

  const owner = ctx.ownerAccount
  const [pending, toPay, paidToday, pendingAmount, toPayAmount] = await Promise.all([
    audit ? countReports(owner, `status=eq.${enc(STATUS_PENDING)}`) : 0,
    payment ? countReports(owner, `status=eq.${enc(STATUS_TO_PAY)}&pay_required=is.true`) : 0,
    countReports(owner, `status=eq.${enc(STATUS_PAID)}&update_time=gte.${enc(todayStart())}`),
    audit ? sumReports(owner, `status=eq.${enc(STATUS_PENDING)}`) : 0,
    payment ? sumReports(owner, `status=eq.${enc(STATUS_TO_PAY)}&pay_required=is.true`) : 0,
  ])

  return {
    code: 0,
    data: {
      modules: { audit, payment },
      perms,
      tabs: buildFinanceTabs({ audit, payment, stats }),
      counts: { pending, toPay, paidToday },
      /* 首页顶部大卡要显示合计金额 */
      amount: { pending: pendingAmount, toPay: toPayAmount },
      total: pendingAmount,
      role: {
        type: roleInfo.roleType,
        name: roleInfo.roleName || (ctx.user && ctx.user.name) || '',
        isMaster: roleInfo.isMaster,
      },
      /* 六格里的最后一格：两个都关 → 前端回管理端 */
      visible: audit || payment,
      approvalMode: fin.mode,
    },
  }
}

/* ============================================================
   action: pay / unpay —— 付款记录（记账，不发起支付）
   ============================================================ */
async function handlePay(event, ctx) {
  const fin = await loadFinanceConfig(ctx.ownerAccount)
  const roleInfo = await loadRoleInfo(ctx)
  const perms = financePermsOf(roleInfo)
  if (!fin.payout || !perms.includes('fee_pay')) {
    return { code: 403, message: '「付款记录」未开通，无法登记' }
  }

  const ids = Array.isArray(event.ids) && event.ids.length
    ? event.ids.map((x) => Number(x)).filter((x) => x > 0)
    : (Number(event.id) ? [Number(event.id)] : [])
  if (!ids.length) return { code: 400, message: '请选择要登记的单据' }

  const method = String(event.method || '').trim()
  if (!method) return { code: 400, message: '请选择付款方式' }

  const now = nowIso()
  const payment = {
    method,
    at: String(event.at || '').trim() || now,
    serial: String(event.serial || '').trim(),
    note: String(event.note || '').trim(),
    images: Array.isArray(event.images) ? event.images : [],
    by: (ctx.user && ctx.user.name) || ctx.account,
    paid_at: now,
  }

  /* 条件更新：只改「待打款 且 确实需要付款」的单，天然防重复记账 */
  let updated
  try {
    updated = await updateTable(
      'reports',
      `id=in.(${ids.join(',')})&owner_account=eq.${enc(ctx.ownerAccount)}`
        + `&status=eq.${enc(STATUS_TO_PAY)}&pay_required=is.true`,
      { payment, status: STATUS_PAID, update_time: now }
    )
  } catch (e) {
    return { code: 500, message: '登记失败：' + (e.message || '') }
  }

  const rows = Array.isArray(updated) ? updated : (updated ? [updated] : [])
  if (rows.length !== ids.length) {
    return {
      code: 409,
      message: `只成功登记 ${rows.length}/${ids.length} 笔，其余已被处理，请刷新后重试`,
      data: rows,
    }
  }
  return { code: 0, data: rows, message: `已登记 ${rows.length} 笔付款` }
}

async function handleUnpay(event, ctx) {
  const fin = await loadFinanceConfig(ctx.ownerAccount)
  const roleInfo = await loadRoleInfo(ctx)
  const perms = financePermsOf(roleInfo)
  if (!fin.payout || !perms.includes('fee_pay')) {
    return { code: 403, message: '「付款记录」未开通，无法撤销' }
  }

  const id = Number(event.id)
  if (!id) return { code: 400, message: '缺少年单据 id' }

  const rows = await queryTable(
    'reports',
    `id=eq.${id}&owner_account=eq.${enc(ctx.ownerAccount)}&select=id,payment,status&limit=1`
  )
  const report = rows[0]
  if (!report) return { code: 404, message: '单据不存在' }
  if (report.status !== STATUS_PAID) return { code: 409, message: '该单当前不是「已打款」' }

  const now = nowIso()
  const payment = {
    ...(report.payment || {}),
    revoked_at: now,
    revoked_by: (ctx.user && ctx.user.name) || ctx.account,
    revoke_reason: String(event.reason || '').trim(),
  }

  const updated = await updateTable(
    'reports',
    `id=eq.${id}&status=eq.${enc(STATUS_PAID)}`,
    { payment, status: STATUS_TO_PAY, update_time: now }
  )
  const row = Array.isArray(updated) ? updated[0] : updated
  if (!row) return { code: 409, message: '该单已被处理，请刷新' }
  return { code: 0, data: row, message: '已撤销，回到待登记' }
}

/* action: paidList —— 付款台账（已打款 / 待打款） */
async function handlePaidList(event, ctx) {
  const fin = await loadFinanceConfig(ctx.ownerAccount)
  const roleInfo = await loadRoleInfo(ctx)
  const perms = financePermsOf(roleInfo)
  const canPay = fin.payout && perms.includes('fee_pay')
  const canAudit = fin.approvalOn && perms.includes('fee_audit')
  if (!canPay && !canAudit) return { code: 403, message: '没有财务查看权限' }

  const page = Math.max(1, Number(event.page) || 1)
  const size = Math.min(50, Math.max(1, Number(event.pageSize) || 20))
  const from = (page - 1) * size
  const to = from + size - 1

  const status = String(event.status || '').trim()
  let q = `owner_account=eq.${enc(ctx.ownerAccount)}&select=*`
  if (status) q += `&status=eq.${enc(status)}`
  else q += `&status=in.(${enc(STATUS_PAID)},${enc(STATUS_TO_PAY)})`
  q += `&order=update_time.desc&offset=${from}&limit=${size}`

  try {
    const rows = await queryTable('reports', q)
    return { code: 0, data: rows || [], page, pageSize: size }
  } catch (e) {
    return { code: 500, message: '查询失败：' + (e.message || '') }
  }
}

/* ============================================================
   action: batchReview —— 批量通过（大额单不允许批量）
   ------------------------------------------------------------
   逐笔走 handleReview，保证审批链、流水、CAS 都和单笔一致；
   金额服务端重算，不信前端传的合计。
   ============================================================ */
async function handleBatchReview(event, ctx) {
  const fin = await loadFinanceConfig(ctx.ownerAccount)
  const roleInfo = await loadRoleInfo(ctx)
  const perms = financePermsOf(roleInfo)
  if (!fin.approvalOn || !perms.includes('fee_audit')) {
    return { code: 403, message: '没有审批权限' }
  }

  const ids = Array.isArray(event.ids)
    ? event.ids.map((x) => Number(x)).filter((x) => x > 0)
    : []
  if (!ids.length) return { code: 400, message: '请选择要批的单' }
  if (ids.length > 50) return { code: 400, message: '一次最多 50 笔' }

  const BIG = 5000
  const comment = String(event.comment || '批量通过').slice(0, 100)
  const out = []

  for (const id of ids) {
    /* 服务端复核金额，防止前端绕过限制 */
    let amount = 0
    try {
      const rows = await queryTable('reports', `id=eq.${id}&select=amount&limit=1`)
      amount = Number((rows[0] || {}).amount) || 0
    } catch (e) {
      out.push({ id, code: 500, message: '查不到单据' })
      continue
    }
    if (amount >= BIG) {
      out.push({ id, code: 403, message: `超过 ¥${BIG}，请单独审批` })
      continue
    }
    const r = await handleReview({ id, op: 'approve', comment }, ctx)
    out.push({ id, code: r.code, message: r.message })
  }

  const ok = out.filter((x) => x.code === 0).length
  return {
    code: 0,
    data: out,
    message: ok === ids.length ? `已通过 ${ok} 笔` : `通过 ${ok} 笔，${ids.length - ok} 笔未处理`,
  }
}

/* ============================================================
   action: pending —— 我当前节点待审的上报（管理端角标用）
   ============================================================ */
async function handlePendingMine(event, ctx) {
  if (!isStaffCtx(ctx)) return { code: 403, message: '只有管理员可以查看' }

  const owner = String(ctx.ownerAccount || '').trim()
  if (!owner) return { code: 0, data: [] }

  const rows = await queryTable(
    'reports',
    `owner_account=eq.${enc(owner)}&status=eq.${enc(STATUS_PENDING)}` +
    '&select=id,waybill_no,report_no,type,amount,current_level,flow&order=create_time.desc&limit=200'
  )
  const mine = rows.filter((r) => {
    const st = (r.flow || [])[(Number(r.current_level) || 0) - 1]
    return canActStep(st, ctx)
  })
  return { code: 0, data: mine }
}

/* ============================================================
   action: list
   ============================================================ */
async function handleList(event, ctx) {
  const limit = Math.min(Math.max(Number(event.limit) || 20, 1), 50)

  /* 按运单查：司机只能查自己的单；员工（管理端）按运单所属主账号查 */
  if (event.waybill_no) {
    const no = String(event.waybill_no).trim()
    const wb = await loadWaybill(no)
    if (!wb) return { code: 404, message: '运单不存在' }

    const wbOwner = String(wb.owner_account || '').trim()
    /* ⭐ 归属收紧：管理员也只允许看本主账号的运单（以前 staff 可以按单号查任意客户） */
    if (wbOwner && wbOwner !== ctx.ownerAccount) {
      return { code: 403, message: '无权查看该运单的费用' }
    }

    const parts = [`waybill_no=eq.${enc(no)}`]
    if (wbOwner) parts.push(`owner_account=eq.${enc(wbOwner)}`)

    const rows = await queryTable(
      'reports',
      `${parts.join('&')}&select=*&order=create_time.desc&limit=${limit}`
    )
    return { code: 0, data: Array.isArray(rows) ? rows : [] }
  }

  /* 司机端「我的上报」 */
  const parts = [`owner_account=eq.${enc(ctx.ownerAccount)}`]
  if (ctx.driverPhone) parts.push(`driver_phone=eq.${enc(ctx.driverPhone)}`)

  const rows = await queryTable(
    'reports',
    `${parts.join('&')}&select=*&order=create_time.desc&limit=${limit}`
  )
  return { code: 0, data: Array.isArray(rows) ? rows : [] }
}

/* ============================================================
   入口
   ============================================================ */

/* ============================================================
   ⭐ 模块闸门（口径与 Web src/config/modules.js 一致）
   ------------------------------------------------------------
   云函数之间不共享代码，这段在每个业务函数里各存一份。
   为什么必须做：前端藏掉入口挡不住 callFunction，司机拿自己账号就能调。
   ============================================================ */
const MODULE_DEFAULT_ON = { waybill: true }

async function assertModule(account, key) {
  try {
    if (!account) return true
    const rows = await queryTable(
      'users',
      `account=eq.${enc(account)}&select=account,owner_account&limit=1`
    )
    const u = rows[0]
    if (!u) return true
    const owner = String(u.owner_account || '').trim() || String(u.account || '').trim()
    if (!owner) return true
    const mods = await queryTable(
      'tenant_modules',
      `owner_account=eq.${enc(owner)}&select=module_key,enabled`
    )
    const hit = (mods || []).find((m) => m.module_key === key)
    /* 没有记录 → 按 defaultOn（只有运单默认开） */
    if (!hit) return MODULE_DEFAULT_ON[key] === true
    return hit.enabled === true
  } catch (e) {
    /* 表不存在 / 查询失败 → 放行，避免一次迁移把业务全挡死 */
    return true
  }
}

exports.main = async (event) => {
    /* ⭐ 模块闸门：未开通直接 403 */
    if (!(await assertModule(String((event && event.account) || '').trim(), 'waybill'))) {
      return { code: 403, message: '该功能未开通，请联系车队管理员' }
    }

  try {
    const account = String((event && event.account) || '').trim()
    if (!account) return { code: 401, message: '未登录' }

    const action = String((event && event.action) || 'create').trim()
    const ctx = await loadContext(account)

    if (action === 'create') return await handleCreate(event, ctx)
    if (action === 'resubmit') return await handleResubmit(event, ctx)
    if (action === 'detail') return await handleDetail(event, ctx)
    if (action === 'review') return await handleReview(event, ctx)
    if (action === 'pending') return await handlePendingMine(event, ctx)
    if (action === 'list') return await handleList(event, ctx)
    /* ⭐ 财务端 */
    if (action === 'bootstrap') return await handleBootstrap(event, ctx)
    if (action === 'pay') return await handlePay(event, ctx)
    if (action === 'unpay') return await handleUnpay(event, ctx)
    if (action === 'paidList') return await handlePaidList(event, ctx)
    if (action === 'batchReview') return await handleBatchReview(event, ctx)

    return { code: 400, message: '未知操作' }
  } catch (err) {
    console.error('[report-action] 失败', err)
    return { code: 500, message: err.message || '上报失败' }
  }
}
