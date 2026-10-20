/**
 * 云函数：waybill-action
 * ============================================================
 * 作用：小程序「任务中心」——司机对运单执行动作
 * 调用：wx.cloud.callFunction({
 *         name: 'waybill-action',
 *         data: { account, id, action, reason?, note?, vehicle? }
 *       })
 * 运行时：Node.js 18.15（只用内置 fetch，无 npm 依赖）
 * 环境变量：无
 *
 * ⭐ 状态流转（按 waybills.transport_mode 决定司机端能走几步）
 *
 *   通用：  accept         待接单   → 待装车
 *           claim          待接单   → 待装车       （车队抢单，语义同 accept，但原子抢占）
 *           reject         待接单   → 待重新指派   （司机拒单，原因必填）
 *           finish         执行中   → 已完成       （完成运单）
 *
 *   仅「详细」模式：
 *           confirmLoad    待装车/装车中 → 装车完成   ← 校验【装货地】围栏
 *           confirmDepart  装车完成      → 已发车
 *           confirmArrive  已发车/装车完成 → 已到达   ← 校验【卸货地】围栏
 *
 *   极简模式：只有 accept → finish 两步
 *
 * ⭐ 补写类动作（**都不改状态**，只补字段）
 *
 *   setVehicle     补写 / 更改「本次用哪辆车」
 *   setPlanTime    补写 / 更改「计划装货时间 + 计划送达时间」
 *                  —— 常驻趟次建房时**不带计划时间**（用户拍板），
 *                     司机要自己排时间就用这个入口。传空 = 清空。
 *                     只允许改**自己接过的**趟次（待接单的趟次是公共池里的，谁都别改）。
 *
 * ⭐ 车队常驻「接一趟」（claimRecurring）
 *   不是对某条运单操作，而是在常驻任务（组）下**新建一条属于我的趟次**，
 *   所以它不传 id、传 group_no，并在拿到单条运单之前就分叉处理。
 *   公共额度按次数时用 CAS 乐观锁扣减（用户选方案 A，不动数据库）。
 *
 * ⭐ 车队抢单（claim）
 *   运单按「车队」指派时，组织下所有司机会同时收到。抢单必须原子：
 *   落库用条件 PATCH（`id=eq.X&status=eq.待接单`），拿返回行数判断胜负，
 *   0 行即说明被别人抢先 → 返回 409 + conflict='claimed_by_other'。
 *   前端据此提示「手慢了」，不能靠前端先查再写（会有两人同时抢到的竞态）。
 *
 * ⭐ 抢单归属守卫（关键）
 *   按车队指派时，组织下**每个**司机都能通过 isAssignedToDriver 校验。
 *   所以额外确认一次 accept_by：一旦有值且不是我，任何动作都直接 403。
 *   少了这道校验，同事 A 抢走的单，同事 B 照样能装车、发车（真踩过）。
 *
 * ⭐ 车牌（本次用哪辆车）
 *   - 只绑 1 辆车 → 自动带上，不打扰司机
 *   - 绑 ≥2 辆车 → 极简模式**接单前**必须选；详细模式**装车 / 发车前**必须选
 *   任何动作都允许带 vehicle 参数，这样「发车」可以一次调用同时写车牌。
 *
 * ⭐ 装卸货地打卡校验
 *   waybills.check_in_required = true 时，confirmLoad / confirmArrive 必须
 *   车辆实时位置落在对应围栏内才放行：
 *     confirmLoad   → 装货地（waybills.pickup）
 *     confirmArrive → 卸货地（waybills.delivery）
 *   围栏形状支持 circle / polygon / polyline（district 无法本地判定，放行并写 warn）。
 *   Web 端运单详情页可把 check_in_required 临时置 false 兜底。
 *
 * ⚠️ 前置条件：waybills 必须先执行迁移，否则新字段写入会失败。
 *    迁移脚本：my-cd/sql/2026-10-16_recurring_task_and_status_log.sql
 *
 * 环境变量：DONGFENG_TOKEN（围栏校验要取车辆实时位置；缺失时跳过围栏校验并写 error 日志）
 */

const { randomUUID } = require('crypto')

const API_BASE = 'https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com'
const DEVICE_ID = randomUUID()

/* 状态流转表
   node      写入 status_log 的节点名（与 Web 端时间轴的 logKey 对应）
   timeField 该节点写哪个时间字段，Web 端时间轴直接读这些列
   mode      both = 两种运输节点模式都可用；detail = 仅「详细」模式
   fence     该节点需要校验哪个围栏：pickup / delivery */
const TRANSITIONS = {
  accept: { from: ['待接单'], to: '待装车', node: '待装车', timeField: 'accept_time', mode: 'both' },
  /* ⭐ 车队抢单：语义与 accept 相同，但落库用**条件 PATCH** 抢占。
     多条运单派给同一车队时，组织下所有司机同时看到，谁先点到谁拿走。 */
  claim: { from: ['待接单'], to: '待装车', node: '待装车', timeField: 'accept_time', mode: 'both' },
  reject: { from: ['待接单'], to: '待重新指派', node: '待重新指派', timeField: 'reject_time', mode: 'both' },
  confirmLoad: {
    from: ['待装车', '装车中'],
    to: '装车完成',
    node: '装车完成',
    timeField: 'load_end_time',
    mode: 'detail',
    fence: 'pickup',
  },
  confirmDepart: {
    from: ['装车完成', '装车中'],
    to: '已发车',
    node: '已发车',
    timeField: 'depart_time',
    mode: 'detail',
  },
  confirmArrive: {
    from: ['已发车', '装车完成'],
    to: '已到达',
    node: '已到达',
    timeField: 'arrive_time',
    mode: 'detail',
    fence: 'delivery',
  },
  finish: {
    from: ['待装车', '装车中', '装车完成', '已发车', '已到达'],
    to: '已完成',
    node: '已完成',
    timeField: 'finish_time',
    mode: 'both',
  },
  /* ⭐ 补写 / 更改「本次用哪辆车」——**不改状态**，只写 vehicle。
     两个场景需要它：
       1. 抢单是先抢占再选车的，抢到手时还不知道用哪辆 → 事后补写
       2. 司机跳过选车 → vehicle 为空 → 打卡围栏校验要车牌查 VIN 和定位，会直接失败
          → 从卡片上的「选本次用车」入口补上，别把司机卡死
     ⚠️ to / node / timeField 都是 null，patch 组装时要跳过它们。 */
  setVehicle: {
    from: ['待装车', '装车中', '装车完成', '已发车', '已到达', '已完成'],
    to: null,
    node: null,
    timeField: null,
    mode: 'both',
  },
  /* ⭐ 补写 / 修改「计划时间」——常驻趟次建房时**不带计划装货 / 送达时间**，
     司机要自己排时间就用这个入口补。只写 pickup_time / plan_time，不改状态。
     ⚠️ 故意**不含「待接单」**：车队常驻里没被接走的趟次是公共池里的，
        谁都能看见，不能让某一个人改它的时间。
     可传 null / 空串表示清空。 */
  setPlanTime: {
    from: ['待装车', '装车中', '装车完成', '已发车', '已到达'],
    to: null,
    node: null,
    timeField: null,
    mode: 'both',
  },
}

/* 旧动作名兼容：已上线的司机端只发 accept / reject / complete，
   complete 语义就是「完成运单」，映射到 finish */
const ACTION_ALIASES = {
  complete: 'finish',
  loadEnd: 'confirmLoad',
  depart: 'confirmDepart',
}

/* 视为「已接单」的状态，用于常驻任务次数统计 */
const ACCEPTED_STATUSES = ['待装车', '装车中', '装车完成', '已发车', '已到达', '已完成']

/* status_log 最多保留的条数（防御性截断，避免异常情况下无限增长） */
const STATUS_LOG_MAX = 100

/* 拒单原因预设项（与小程序端保持一致） */
const REJECT_REASONS = ['车辆故障', '时间冲突', '路线不熟', '其他']
const REASON_MAX = 50
const NOTE_MAX = 200

/**
 * 把司机端传上来的计划时间统一成库里既有的写法 `YYYY-MM-DDTHH:mm:ss`
 * （库里 pickup_time / plan_time 实测就是带 T 的：`2026-10-17T04:04:00`）。
 * 接受：'YYYY-MM-DD HH:mm(:ss)' / ISO（带 T、毫秒、时区偏移）/ 只给日期。
 * 传空 = 清空（返回 null）；解析不出来返回 undefined（调用方按格式错误处理）。
 */
function normalizePlanTime(raw) {
  if (raw === undefined || raw === null) return null
  const s = String(raw).trim()
  if (!s) return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (!m) return undefined
  const [, y, mo, d, hh = '00', mi = '00', ss = '00'] = m
  const num = (v) => parseInt(v, 10)
  if (num(mo) < 1 || num(mo) > 12 || num(d) < 1 || num(d) > 31) return undefined
  if (num(hh) > 23 || num(mi) > 59 || num(ss) > 59) return undefined
  return `${y}-${mo}-${d}T${hh}:${mi}:${ss}`
}

/* ============================================================
   基础工具
   ============================================================ */
const enc = encodeURIComponent

let _token = null
let _tokenExp = 0 // 匿名 access token 的过期时间戳（ms）

/* ⭐ 匿名 token 只有 2 小时（expires_in=7200）。原来只判 `if (_token) return _token`，
   容器热过 2 小时后所有读写都 401 ACCESS_TOKEN_EXPIRED。现在按过期时间取，
   并在 request() 收到 401 时强制换 token 重试一次。 */
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
  _token =
    json.access_token || json.accessToken || (json.data && json.data.access_token)
  if (!_token) throw new Error('匿名登录未返回 access_token')
  const ttl = Number(json.expires_in) || 7200
  _tokenExp = Date.now() + Math.max(60, ttl - 300) * 1000 // 提前 5 分钟换
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
    /* PATCH / POST 都要拿回写入后的行，用来判断「命中了几行」 */
    if (method === 'PATCH' || method === 'POST') headers.Prefer = 'return=representation'

    return fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  let res = await doFetch(await getToken())
  /* ⚠️ token 过期（401）→ 换一张重试。写动作重试是安全的：
     401 时请求根本没进库，不存在重复写入。 */
  if (res.status === 401) res = await doFetch(await getToken(true))
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`${method} ${table} 失败 HTTP ${res.status}: ${txt.slice(0, 200)}`)
  }
  return res.json()
}

const queryTable = (table, query) => request('GET', table, query)
const updateTable = (table, query, patch) => request('PATCH', table, query, patch)
const insertTable = (table, row) => request('POST', table, '', row)

const splitPlates = (raw) =>
  String(raw || '')
    .split(/[,，、;；\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)

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

/**
 * 取指派方式。
 * ⚠️ Web 端落库的 key 是 `method`（不是文档里写的 `assignMethod`），
 * 必须兼容两者，否则归属校验永远失败 → 接单 / 拒单直接报「无权操作」。
 */
const readAssignMethod = (a) =>
  String((a && (a.method || a.assignMethod)) || '').trim()

/* ============================================================
   归属校验：这单确实指派给了该司机吗
   （与 waybill-list 的匹配逻辑保持一致；云函数之间无法共享模块，故此处复制）
   ============================================================ */
async function loadOrgNameSet(ownerAccount, myOrgName) {
  const set = new Set()
  if (myOrgName) set.add(myOrgName)
  if (!ownerAccount) return set

  let orgs = []
  try {
    orgs = await queryTable(
      'organizations',
      `owner_account=eq.${enc(ownerAccount)}&select=id,name,parent_id&limit=500`
    )
  } catch (e) {
    return set
  }

  const byId = new Map()
  const byName = new Map()
  orgs.forEach((o) => {
    if (o && o.id !== undefined && o.id !== null) byId.set(o.id, o)
    const n = String((o && o.name) || '').trim()
    if (n) byName.set(n, o)
  })

  let cur = byName.get(myOrgName)
  let guard = 0
  while (cur && cur.parent_id !== null && cur.parent_id !== undefined && guard++ < 30) {
    const parent = byId.get(cur.parent_id)
    if (!parent) break
    const n = String(parent.name || '').trim()
    if (n) set.add(n)
    cur = parent
  }
  return set
}

/* 这条指派的目标是不是我自己 */
function targetMatchesMe(method, target, ctx) {
  if (method === 'driver') return !!ctx.driverName && target === ctx.driverName
  if (method === 'vehicle') return ctx.plates.includes(target)
  if (method === 'team') return ctx.orgNames.has(target)
  return false
}

/* 管理员运单（owner_account 为 null）的消歧守卫，与 waybill-list 保持一致 */
async function buildAdminSafeTargets(customerId, ownerAccount) {
  const drivers = new Set()
  const orgs = new Set()
  try {
    const rows = await queryTable('drivers', 'select=driver_name,customer_id&limit=2000')
    const byName = new Map()
    for (const d of rows) {
      const n = String((d && d.driver_name) || '').trim()
      const c = String((d && d.customer_id) || '').trim()
      if (!n || !c) continue
      if (!byName.has(n)) byName.set(n, new Set())
      byName.get(n).add(c)
    }
    byName.forEach((owners, n) => {
      if (owners.size === 1 && owners.has(customerId)) drivers.add(n)
    })
  } catch (e) {
    console.warn('管理员运单消歧（司机）构建失败:', e.message)
  }
  try {
    const rows = await queryTable('organizations', 'select=name,owner_account&limit=2000')
    const byName = new Map()
    for (const o of rows) {
      const n = String((o && o.name) || '').trim()
      const a = String((o && o.owner_account) || '').trim()
      if (!n || !a) continue
      if (!byName.has(n)) byName.set(n, new Set())
      byName.get(n).add(a)
    }
    byName.forEach((owners, n) => {
      if (owners.size === 1 && owners.has(ownerAccount)) orgs.add(n)
    })
  } catch (e) {
    console.warn('管理员运单消歧（机构）构建失败:', e.message)
  }
  return { drivers, orgs }
}

function adminTargetAllowed(method, target, isAdminWaybill, ctx) {
  if (!isAdminWaybill) return true
  const safe = ctx.adminSafe
  if (!safe) return false
  if (method === 'vehicle') return true
  if (method === 'driver') return safe.drivers.has(target)
  if (method === 'team') return safe.orgs.has(target)
  return false
}

function isAssignedToDriver(wb, ctx) {
  const isAdminWaybill = !String((wb && wb.owner_account) || '').trim()
  for (const a of parseAssignments(wb.assignments)) {
    if (!a) continue
    const method = readAssignMethod(a)
    const items = Array.isArray(a.items) ? a.items : []
    for (const it of items) {
      const target = String((it && it.target) || '').trim()
      if (!target) continue
      if (!targetMatchesMe(method, target, ctx)) continue
      if (!adminTargetAllowed(method, target, isAdminWaybill, ctx)) continue
      return true
    }
  }
  return false
}

/* ============================================================
   ⭐ 子母车：一单多司机 / 多车，每人各自跑自己那一趟
   ------------------------------------------------------------
   场景（用户 2026-10-17）：一个运单、一种货物，派给 2 个及以上的司机 / 车辆，
   每人承运数量之和 = 总货物量（Web 新建运单可分别设置，默认平分）。
   拍板口径：
     · **一个运单保持一行**，每个司机这一趟的状态与时间**单独记在自己的指派项上**
       （`leg_status` / `leg_accept_time` / `leg_accept_by` / `leg_vehicle` / `leg_*_time`），
       各自接单、各自上报，互不影响；
     · 行级的 status / accept_time / finish_time 是**聚合值**（Web 列表筛选与统计照样能用）；
     · **派到车队（team）不进这套**：组织下都能抢、先到先得，维持原样。
   ⚠️ 这套判断在 waybill-list / waybill-action / waybill-detail 三份里各有一份，
      改一处必须同步三处。
   ============================================================ */
const LEG_TODO = '待接单'
const LEG_RUNNING = ['待装车', '装车中', '装车完成', '已发车', '已到达']
const LEG_EXCLUSIVE_METHODS = ['driver', 'vehicle']

function collectLegs(wb) {
  const out = []
  for (const a of parseAssignments(wb && wb.assignments)) {
    const method = readAssignMethod(a)
    for (const it of Array.isArray(a.items) ? a.items : []) {
      out.push({ method, item: it || {}, target: String((it && it.target) || '').trim() })
    }
  }
  return out
}

function isMultiLegWaybill(wb) {
  if (!wb || wb.is_recurring) return false
  const legs = collectLegs(wb)
  if (legs.length < 2) return false
  return legs.every((l) => LEG_EXCLUSIVE_METHODS.includes(l.method))
}

function legMatchesMe(leg, ctx) {
  if (leg.method === 'driver') return !!ctx.driverName && leg.target === ctx.driverName
  if (leg.method === 'vehicle') return ctx.plates.includes(leg.target)
  return false
}

function findMyLeg(wb, ctx) {
  if (!isMultiLegWaybill(wb)) return null
  return collectLegs(wb).find((l) => legMatchesMe(l, ctx)) || null
}

/* 腿的状态（没写过就待接单）；兼容上线前的老数据（状态只在行级、accept_by 是第一个接单人） */
function legStatusOf(leg, wb) {
  const own = String((leg && leg.item && leg.item.leg_status) || '').trim()
  if (own) return own
  if (leg && wb) {
    const ab = String(wb.accept_by || '').trim()
    const st = String(wb.status || '').trim()
    if (ab && st && st !== LEG_TODO && leg.method === 'driver' && ab === leg.target) return st
  }
  return LEG_TODO
}

/* 把一个腿的补丁合并进 assignments（只改**我这一条**，别人的原样带回去） */
function withLegPatch(wb, myLeg, legPatch) {
  let done = false
  const out = parseAssignments(wb.assignments).map((a) => {
    const method = readAssignMethod(a)
    const items = (Array.isArray(a.items) ? a.items : []).map((it) => {
      const target = String((it && it.target) || '').trim()
      if (!done && method === myLeg.method && target === myLeg.target) {
        done = true
        return { ...(it || {}), ...legPatch }
      }
      return it
    })
    return { ...a, items }
  })
  return out
}

/* 行级聚合：各腿状态 → 运单行的 status / accept_time / accept_by / finish_time */
function aggregateRowPatch(wb, assignments) {
  const view = { ...wb, assignments }
  const legs = collectLegs(view)
  const st = legs.map((l) => legStatusOf(l, view))
  const total = legs.length
  const done = st.filter((s) => s === '已完成').length
  const pending = st.filter((s) => s === LEG_TODO).length
  const rejected = st.filter((s) => s === '待重新指派').length
  const running = st.filter((s) => LEG_RUNNING.includes(s)).length

  let status = '待装车'
  if (pending === total) status = '待接单'
  else if (done === total) status = '已完成'
  else if (rejected === total) status = '待重新指派'
  else if (done + rejected === total) status = '已完成' // 有完成的、有拒掉的 → 任务收尾
  else if (running === 0 && done === 0) status = '待接单' // 只剩「待接单 + 待重新指派」

  const patch = { status }
  const started = legs.filter((l) => l.item.leg_accept_time)
  if (started.length) {
    const first = started
      .slice()
      .sort((a, b) => String(a.item.leg_accept_time).localeCompare(String(b.item.leg_accept_time)))[0]
    patch.accept_time = first.item.leg_accept_time
    patch.accept_by = String(first.item.leg_accept_by || '').trim() || wb.accept_by || ''
  }
  if (status === '已完成') {
    const fin = legs.map((l) => l.item.leg_finish_time).filter(Boolean).sort().pop()
    patch.finish_time = fin || wb.finish_time || new Date().toISOString()
  }
  return patch
}

/* 动作 → 腿上的补丁 */
function buildLegPatch(action, rule, operator, nowIso, finalVehicle, reason, note) {
  const patch = {}
  if (action === 'setVehicle') {
    patch.leg_vehicle = finalVehicle
    return patch
  }
  if (action === 'reject') {
    patch.leg_status = '待重新指派'
    patch.leg_reject_time = nowIso
    patch.leg_reject_reason = reason || ''
    patch.leg_reject_note = note || null
    patch.leg_reject_by = operator
    return patch
  }
  patch.leg_status = rule.to
  const tf = {
    accept: 'accept_time',
    confirmLoad: 'load_end_time',
    confirmDepart: 'depart_time',
    confirmArrive: 'arrive_time',
    finish: 'finish_time',
  }[action]
  if (tf) patch[`leg_${tf}`] = nowIso
  if (action === 'accept' || action === 'claim') {
    patch.leg_accept_by = operator
    if (finalVehicle) patch.leg_vehicle = finalVehicle
  }
  return patch
}

/* ============================================================
   ⭐ 状态流转日志 + 常驻任务配额
   ============================================================ */

/* status_log 在库里是 jsonb，走 PostgREST 可能回来的是字符串 */
function parseStatusLog(raw) {
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

/* append 一条流转记录；拒单重派后再接单会继续往后追加，形成完整履历 */
function appendStatusLog(wb, entry) {
  const log = parseStatusLog(wb && wb.status_log)
  log.push(entry)
  return log.slice(-STATUS_LOG_MAX)
}

/**
 * 常驻任务接单闸门
 * - 按时间（recurring_type = 'time'）：起止时间窗内不限次数
 * - 按次数（recurring_type = 'count'）：累计接单达到 recurring_max_count 即止
 * 次数以「同分组下有接单痕迹的运单数」为准，不依赖单条记录上的冗余计数，
 * 避免并发 / 补数据导致计数漂移。
 */
async function checkRecurringGate(wb) {
  if (!wb || !wb.is_recurring) return { ok: true, used: 0, max: 0 }

  const type = String(wb.recurring_type || '').trim()
  const groupNo = String(wb.recurring_group_no || '').trim()

  /* ⭐ Web 端可以「暂停 / 结束」常驻任务，这两种状态都不能再接单 */
  const rstat = String(wb.recurring_status || '').trim()
  if (rstat === '已结束') return { ok: false, used: 0, max: 0, message: '该常驻任务已结束' }
  if (rstat === '已暂停') {
    return { ok: false, used: 0, max: 0, message: '该常驻任务已暂停，暂时不能接单' }
  }

  if (type === 'time') {
    const now = Date.now()
    const start = wb.recurring_start_time ? new Date(wb.recurring_start_time).getTime() : 0
    const end = wb.recurring_end_time ? new Date(wb.recurring_end_time).getTime() : 0
    if (start && now < start) {
      return { ok: false, message: '该常驻任务尚未到生效时间' }
    }
    if (end && now > end) {
      return { ok: false, message: '该常驻任务已过有效期，无法再接单' }
    }
    return { ok: true, used: 0, max: 0 }
  }

  if (type === 'count') {
    const max = Number(wb.recurring_max_count) || 0
    let used = 0
    if (groupNo) {
      try {
        const rows = await queryTable(
          'waybills',
          `recurring_group_no=eq.${enc(groupNo)}&select=id,status,accept_time&limit=2000`
        )
        used = rows.filter(
          (r) =>
            r &&
            (r.accept_time || ACCEPTED_STATUSES.includes(String(r.status || '').trim()))
        ).length
      } catch (e) {
        console.warn('常驻任务已接单次数统计失败，回退到冗余计数:', e.message)
        used = Number(wb.recurring_accepted_count) || 0
      }
    }
    if (max && used >= max) {
      return { ok: false, message: `该常驻任务接单次数已用尽（${used}/${max}）` }
    }
    return { ok: true, used, max }
  }

  return { ok: true, used: 0, max: 0 }
}

/* ============================================================
   ⭐ 装卸货地打卡：车辆是否落在围栏内
   ------------------------------------------------------------
   围栏口径（ele_fences）：
     circle   center="lng,lat"  radius=米
     polygon  points="lng,lat;lng,lat;..."（猎鹰要求首尾闭合）
     polyline points="lng,lat;..."  bufferradius=米
     district adcode 行政区划 —— 本地无法判定，放行并写 warn
   ============================================================ */

/* 东风实时位置：chassisNo 取 VIN 后 8 位，循环今/昨/前天，命中即返回 */
const DONGFENG_LOCATION_URL =
  'https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/dataforward/forward/locationData'
const DONGFENG_TOKEN = process.env.DONGFENG_TOKEN || ''

const pad2 = (n) => String(n).padStart(2, '0')
const fmtDateTime = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
  `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`

async function fetchVehiclePoint(vin) {
  if (!DONGFENG_TOKEN) {
    console.error('[fence] 未配置 DONGFENG_TOKEN，无法校验围栏位置')
    return null
  }
  const chassisNo = String(vin).slice(-8)
  const now = new Date()
  for (let offset = 0; offset <= 2; offset++) {
    const day = new Date(now.getTime() - offset * 86400000)
    const start = new Date(day)
    start.setHours(0, 0, 0, 0)
    const end = new Date(day)
    end.setHours(23, 59, 59, 999)

    const url =
      `${DONGFENG_LOCATION_URL}?token=${enc(DONGFENG_TOKEN)}` +
      `&chassisNo=${enc(chassisNo)}` +
      `&startTime=${enc(fmtDateTime(start))}&endTime=${enc(fmtDateTime(end))}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)
    try {
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timeoutId)
      if (!res.ok) continue
      const json = await res.json()
      if (json.code !== 1 || !Array.isArray(json.data) || json.data.length === 0) continue

      const sorted = json.data
        .slice()
        .sort((a, b) => String(b.sendTime || '').localeCompare(String(a.sendTime || '')))
      const latest = sorted[0]
      const lng = parseFloat(latest.longitude)
      const lat = parseFloat(latest.latitude)
      if (isNaN(lng) || isNaN(lat)) continue
      return { lng, lat, time: latest.sendTime || '', speed: parseFloat(latest.velocity) || 0 }
    } catch (e) {
      clearTimeout(timeoutId)
      continue
    }
  }
  return null
}

async function resolveVin(plate) {
  try {
    const rows = await queryTable('vehicles', `plate=eq.${enc(plate)}&select=plate,vin&limit=1`)
    return String((rows[0] && rows[0].vin) || '').trim()
  } catch (e) {
    return ''
  }
}

/* 只有单车牌的运单才做位置校验；多车（『多种』/『N辆』）无法定位到具体一台 */
function pickVehiclePlate(wb) {
  const plates = []
  for (const a of parseAssignments(wb && wb.assignments)) {
    if (!a || readAssignMethod(a) !== 'vehicle') continue
    for (const it of a.items || []) {
      const t = String((it && it.target) || '').trim()
      if (t) plates.push(t)
    }
  }
  if (plates.length === 1) return plates[0]
  if (plates.length > 1) return ''
  const v = String((wb && wb.vehicle) || '').trim()
  if (!v || v === '多种' || v === '--' || /辆$/.test(v)) return ''
  return v
}

const toRad = (d) => (d * Math.PI) / 180
const EARTH_R = 6371008.8

function haversine(a, b) {
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.sqrt(s))
}

function parseLngLat(raw) {
  const m = String(raw || '').match(/(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)/)
  if (!m) return null
  const lng = parseFloat(m[1])
  const lat = parseFloat(m[2])
  return isNaN(lng) || isNaN(lat) ? null : [lng, lat]
}

function parsePoints(raw) {
  return String(raw || '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const parts = s.split(',').map(Number)
      return !isNaN(parts[0]) && !isNaN(parts[1]) ? [parts[0], parts[1]] : null
    })
    .filter(Boolean)
}

/* 射线法：点是否在多边形内 */
function pointInPolygon(pt, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const crossed =
      yi > pt[1] !== yj > pt[1] &&
      pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi
    if (crossed) inside = !inside
  }
  return inside
}

/* 点到线段的距离（米）。用等距投影近似，米级判定足够 */
function distanceToSegment(pt, a, b) {
  const k = Math.cos(toRad(pt[1]))
  const px = pt[0] * k
  const py = pt[1]
  const ax = a[0] * k
  const ay = a[1]
  const bx = b[0] * k
  const by = b[1]
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2) * 111320
}

function distanceToPolyline(pt, line) {
  let min = Infinity
  for (let i = 0; i < line.length - 1; i++) {
    min = Math.min(min, distanceToSegment(pt, line[i], line[i + 1]))
  }
  return min
}

/* 返回 true / false；无法判定时返回 null（调用方放行并写 warn） */
function isPointInFence(pt, fence) {
  const shape = String((fence && fence.shape) || '').trim()
  if (shape === 'circle') {
    const c = parseLngLat(fence.center)
    const r = Number(fence.radius) || 0
    if (!c || !r) return null
    return haversine(pt, c) <= r
  }
  if (shape === 'polygon') {
    const ring = parsePoints(fence.points)
    if (ring.length < 3) return null
    return pointInPolygon(pt, ring)
  }
  if (shape === 'polyline') {
    const line = parsePoints(fence.points)
    const buf = Number(fence.bufferradius) || 0
    if (line.length < 2 || !buf) return null
    return distanceToPolyline(pt, line) <= buf
  }
  return null
}

/**
 * 打卡围栏校验
 * @param {object} wb        运单行
 * @param {string} fenceType 'pickup' | 'delivery'
 * @returns {{ok:boolean, message?:string, remark?:string}}
 */
async function assertFenceCheckin(wb, fenceType, plateOverride) {
  const fenceName = String((fenceType === 'pickup' ? wb.pickup : wb.delivery) || '').trim()
  const label = fenceType === 'pickup' ? '装货地' : '卸货地'
  if (!fenceName) {
    return { ok: false, message: `运单未填写${label}围栏名称，无法校验打卡位置` }
  }

  let fence = null
  try {
    const rows = await queryTable(
      'ele_fences',
      `name=eq.${enc(fenceName)}&select=name,shape,center,points,radius,bufferradius&limit=1`
    )
    fence = rows[0] || null
  } catch (e) {
    console.warn('围栏查询失败:', e.message)
  }
  if (!fence) {
    return { ok: false, message: `未找到${label}围栏「${fenceName}」，无法校验打卡位置` }
  }
  if (String(fence.shape || '').trim() === 'district') {
    console.warn(`waybill-action：围栏「${fenceName}」是行政区划，跳过位置校验`)
    return { ok: true, remark: `${label}为行政区划围栏，未做位置校验` }
  }

  const plate = String(plateOverride || '').trim() || pickVehiclePlate(wb)
  if (!plate) {
    return { ok: false, message: `该运单未指定单车，无法校验${label}围栏位置` }
  }
  const vin = await resolveVin(plate)
  if (!vin) {
    return { ok: false, message: `车辆 ${plate} 未配置 VIN，无法校验${label}围栏位置` }
  }
  const point = await fetchVehiclePoint(vin)
  if (!point) {
    return { ok: false, message: `未获取到车辆 ${plate} 的定位，无法校验${label}围栏位置` }
  }

  const inside = isPointInFence([point.lng, point.lat], fence)
  if (inside === null) {
    console.warn(
      `waybill-action：围栏「${fenceName}」形状为 ${fence.shape}，几何数据不完整，跳过位置校验`
    )
    return { ok: true, remark: `${label}围栏几何数据不完整，未做位置校验` }
  }
  if (!inside) {
    return {
      ok: false,
      message: `车辆不在「${fenceName}」${label}围栏范围内，暂时无法打卡`,
    }
  }
  return { ok: true, remark: `${label}围栏校验通过` }
}

/* ============================================================
   ⭐ 同车 / 同司机并发拦截
   ------------------------------------------------------------
   同一个车牌或同一个司机，在同一个客户范围内只能有一条「未结束」的运输记录。
   一趟没跑完（含待装车 / 装车中 / 装车完成 / 已发车 / 已到达）不能再接下一趟。
   「待重新指派」视为已离开当前司机，不计入占用。
   ============================================================ */
/* ⚠️ 这里是「白名单」：只有**已经接单、还没结束**才占用运力。
   不能写成黑名单（除 已完成/已取消/待重新指派 之外都算占用）——
   那样「待接单」这种还没接的单也会被判成未结束的运输记录，
   司机会被自己还没接的单拦住，而且提示被 toast 截断后完全看不出原因。 */
const OCCUPY_STATUSES = ['待装车', '装车中', '装车完成', '已发车', '已到达']

function recordHasDriver(rec, driverName) {
  const name = String(driverName || '').trim()
  if (!name) return false
  for (const a of parseAssignments(rec && rec.assignments)) {
    if (!a || readAssignMethod(a) !== 'driver') continue
    for (const it of a.items || []) {
      if (String((it && it.target) || '').trim() === name) return true
    }
  }
  return String((rec && rec.driver) || '').trim() === name
}

/* 这条记录占不占用「我」的运力？
   ⚠️ 子母车（一单多司机/多车）要**按腿判**：
      · 司机维度：只看**我那条腿**有没有开始跑（别人接的趟次不算占我的运力，
        否则一单派两人时两个人会互相把对方挡住，谁都接不了 —— 真踩过）；
      · 车牌维度：看所有**已经开始**的腿里有没有用到这块牌。 */
function occupiesMe(r, ctx, which, plate) {
  if (isMultiLegWaybill(r)) {
    const legs = collectLegs(r)
    if (which === 'plate') {
      if (!plate) return false
      return legs.some((l) => {
        if (!LEG_RUNNING.includes(legStatusOf(l, r))) return false
        const v =
          String(l.item.leg_vehicle || '').trim() ||
          (l.method === 'vehicle' ? l.target : '')
        return v === plate
      })
    }
    const myLeg = legs.find((l) => legMatchesMe(l, ctx))
    return !!myLeg && LEG_RUNNING.includes(legStatusOf(myLeg, r))
  }
  if (which === 'plate') return !!plate && pickVehiclePlate(r) === plate
  return recordHasDriver(r, ctx.driverName)
}

async function findRunningConflict(wb, ctx, ownerAccount, plate) {
  let rows = []
  try {
    const ownerFilter = ownerAccount
      ? `owner_account=eq.${enc(ownerAccount)}`
      : 'owner_account=is.null'
    rows = await queryTable(
      'waybills',
      `${ownerFilter}&select=id,waybill_no,status,vehicle,driver,assignments&limit=500`
    )
  } catch (e) {
    console.warn('并发校验查询失败，本次放行:', e.message)
    return null
  }

  const running = rows.filter(
    (r) =>
      r &&
      String(r.id) !== String(wb.id) &&
      OCCUPY_STATUSES.includes(String(r.status || '').trim())
  )

  if (plate) {
    const hit = running.find((r) => occupiesMe(r, ctx, 'plate', plate))
    if (hit) {
      return {
        message:
          `车辆 ${plate} 还有未结束的运输记录（${hit.waybill_no} · ${hit.status}），` +
          `请先完成或取消后再接单`,
      }
    }
  }

  if (ctx.driverName) {
    const hit = running.find((r) => occupiesMe(r, ctx, 'driver', ''))
    if (hit) {
      return {
        message:
          `司机 ${ctx.driverName} 还有未结束的运输记录（${hit.waybill_no} · ${hit.status}），` +
          `请先完成或取消后再接单`,
      }
    }
  }

  return null
}

/* ============================================================
   ⭐ 车队常驻任务「接一趟」
   ------------------------------------------------------------
   与普通接单（accept / claim）的本质区别：
     · 普通接单是**占用一条已经存在的运单**，所以必须原子抢占（claim）
     · 常驻接一趟是**在常驻任务下新建一条属于我的趟次**，不存在争抢：
       同事接不接、接了几趟，都不影响我能不能接（用户 2026-10-17 拍板）

   额度是**公共池**：
     · 按次数 recurring_type='count' → 上限 = **全队**累计接单次数之和
     · 按时间 recurring_type='time'  → **没有次数上限**，只看有效期
   额度扣减用 **CAS 乐观锁**（用户选的方案 A，不用动数据库）：
     先读「我看到的值」，再 PATCH 并把该值写进条件
     （`&recurring_accepted_count=eq.<我看到的值>`）。
     返回 0 行 = 这一瞬间被别人改过 → 重新读、重试。
     ⚠️ 绝不能「先查后写」不 conditions —— 剩 1 次时两人同时点会各生成一条趟次，
        额度只扣 1 次，超发。

   新建趟次只复制常驻任务的**路线 / 货物 / 指派**等业务字段，
   **不带计划装货时间、计划送达时间**：常驻任务一般就不设这两个时间，
   这趟的时间口径只看 `accept_time`（接单）和 `finish_time`（完单）。
   ============================================================ */
const RECURRING_CAS_RETRY = 4
const RECURRING_INSERT_RETRY = 3
const RECURRING_TRIPS_LIMIT = 500

/* 从常驻任务「组主」复制过去、**但不含计划时间**的字段白名单。
   ⚠️ 只复制组主上**确实存在且非空**的值 —— 组主是同一张表的真实行，
      所以存在的字段名一定是合法列，不会撞上「column does not exist」。 */
const RECURRING_COPY_FIELDS = [
  'task_name', 'receive_no',
  'pickup', 'delivery', 'pickup_lng', 'pickup_lat', 'delivery_lng', 'delivery_lat',
  'plan_distance', 'plan_duration',
  'cargo', 'quantity', 'freight', 'carry_quantity',
  'assignments', 'assigned_orgs', 'org',
  'transport_mode', 'check_in_required', 'source', 'remark',
]

/* 运单号规则与 Web 端一致：YD + YYYYMMDD + 4 位当日序号（pad2 在上面的东风工具区已定义） */
async function generateWaybillNo(datePart) {
  let maxSeq = 0
  try {
    const rows = await queryTable(
      'waybills',
      `waybill_no=like.${enc('YD' + datePart + '*')}` +
        `&select=waybill_no&order=waybill_no.desc&limit=1`
    )
    const last = rows && rows[0] && rows[0].waybill_no
    if (last) {
      const seq = parseInt(String(last).slice(-4), 10)
      if (!isNaN(seq)) maxSeq = seq
    }
  } catch (e) {
    console.warn('生成运单号时查询当日最大序号失败，从 0 起算:', e.message)
  }
  return maxSeq
}

/* 接手「组内还挂着的那条待接单趟次」（Web 发布时常驻任务会先落一条待接单记录）。
   ⚠️ 不要让这条永久挂着，也不能让两个人"抢"它 ——
      认领用 CAS（条件带 status=待接单 & accept_by is null）：
      一个成功，另一个返回 0 行 → 调用方改为**新建一条趟次**，
      **不给"被抢先"的提示**（车队常驻本来就不该有抢单体验）。 */
async function tryAdoptPendingTrip({ groupNo, finalVehicle, operator, account, ctx }) {
  let pending = null
  try {
    const rows = await queryTable(
      'waybills',
      `recurring_group_no=eq.${enc(groupNo)}` +
        `&status=eq.${enc('待接单')}&accept_by=is.null` +
        `&select=*&order=trip_seq.asc&limit=1`
    )
    pending = rows[0] || null
  } catch (e) {
    console.warn('查询待接单趟次失败，改为新建:', e.message)
    return null
  }
  if (!pending) return null

  /* ⚠️ 只接手**也指派给我**的待接单趟次。
     车队常驻的组里可能挂着一条派给别人的待接单趟次（比如 Web 续建时换了指派），
     那不是给我的活 —— 我不能替别人接，应该走下面的「自己新建一条」。 */
  if (!isAssignedToDriver(pending, ctx)) {
    console.log(
      `waybill-action：常驻 ${groupNo} 的第 ${pending.trip_seq} 趟不是派给我的，改为新建`
    )
    return null
  }

  const nowIso = new Date().toISOString()
  const patch = {
    status: '待装车',
    accept_by: operator,
    accept_time: nowIso,
    status_log: appendStatusLog(pending, {
      status: '待装车',
      time: nowIso,
      operator,
      account,
      remark: '常驻任务接一趟',
    }),
  }
  if (finalVehicle) patch.vehicle = finalVehicle

  try {
    const updated = await updateTable(
      'waybills',
      `id=eq.${enc(pending.id)}&status=eq.${enc('待接单')}&accept_by=is.null`,
      patch
    )
    const affected = Array.isArray(updated) ? updated.length : updated ? 1 : 0
    if (affected > 0) return Array.isArray(updated) ? updated[0] : updated
    console.log(`waybill-action：常驻 ${groupNo} 的第 ${pending.trip_seq} 趟刚被别人接手，改为新建`)
  } catch (e) {
    console.warn('接手待接单趟次失败，改为新建:', e.message)
  }
  return null
}

async function claimRecurringTrip({ event, account, ctx, ownerAccount }) {
  const groupNo = String((event && event.group_no) || '').trim()
  if (!groupNo) return { code: 400, message: '缺少常驻任务分组号' }

  /* 1) 组内全部趟次（按 create_time 升序，第一条就是 Web 发布时落的「组主」） */
  const rows = await queryTable(
    'waybills',
    `recurring_group_no=eq.${enc(groupNo)}&select=*&order=create_time.asc&limit=${RECURRING_TRIPS_LIMIT}`
  )
  if (!rows.length) return { code: 404, message: '常驻任务不存在' }

  /* 2) 归属：组主必须属于我这个客户（管理员单的 owner_account 为空） */
  const mine = rows.filter((r) => {
    const oa = String((r && r.owner_account) || '').trim()
    return !oa || oa === ownerAccount
  })
  if (!mine.length) return { code: 403, message: '无权操作该常驻任务' }
  const tpl = mine[0]

  if (!String(tpl.owner_account || '').trim()) {
    ctx.adminSafe = await buildAdminSafeTargets(ctx.customerId, ownerAccount)
  }
  if (!isAssignedToDriver(tpl, ctx)) {
    return { code: 403, message: '该常驻任务没有指派给你' }
  }

  /* 3) 任务是否还能接 */
  const type = String(tpl.recurring_type || 'time').trim()
  const maxCount = Number(tpl.recurring_max_count) || 0
  if (String(tpl.recurring_status || '').trim() === '已结束') {
    return { code: 409, message: '该常驻任务已结束' }
  }
  /* ⭐ Web 端「暂停」的常驻任务不能再接（有趟次在进行中时 Web 端不允许暂停，这里只兜底） */
  if (String(tpl.recurring_status || '').trim() === '已暂停') {
    return { code: 409, message: '该常驻任务已暂停，暂时不能接单' }
  }
  if (type === 'time') {
    const now = Date.now()
    const s = tpl.recurring_start_time ? new Date(tpl.recurring_start_time).getTime() : 0
    const e = tpl.recurring_end_time ? new Date(tpl.recurring_end_time).getTime() : 0
    if (s && !isNaN(s) && now < s) return { code: 409, message: '该常驻任务尚未到生效时间' }
    if (e && !isNaN(e) && now > e) return { code: 409, message: '该常驻任务已过有效期，无法再接' }
  }

  /* 4) 本次用哪辆车（口径与普通接单一致：绑 1 辆自动带，绑多辆且极简模式必须先选） */
  const reqVehicle = String((event && event.vehicle) || '').trim()
  if (reqVehicle && !ctx.plates.includes(reqVehicle)) {
    return { code: 400, message: '只能选择你自己绑定的车辆' }
  }
  const transportMode = String(tpl.transport_mode || '极简').trim()
  let finalVehicle = reqVehicle
  if (!finalVehicle && ctx.plates.length === 1) finalVehicle = ctx.plates[0]
  if (ctx.plates.length > 1 && transportMode === '极简' && !finalVehicle) {
    return {
      code: 400,
      message: '该常驻任务是「极简」模式，接一趟前请先选择本次用哪辆车',
      need_vehicle: true,
      /* 服务端认可的车牌：前端选车面板用这份，避免本地缓存过期导致无车可选 */
      plates: ctx.plates,
    }
  }

  /* 5) 个人维度闸门：你手上还有没跑完的趟次就不能再接（用户拍板，不能同时接两趟） */
  const conflict = await findRunningConflict(tpl, ctx, ownerAccount, finalVehicle)
  if (conflict) return { code: 409, message: conflict.message }

  /* 6) 按次数：CAS 原子占一个公共额度 */
  let usedBefore = 0
  if (type === 'count') {
    let bumped = false
    for (let attempt = 0; attempt < RECURRING_CAS_RETRY && !bumped; attempt++) {
      const cur = await queryTable(
        'waybills',
        `id=eq.${enc(tpl.id)}&select=recurring_accepted_count,recurring_max_count&limit=1`
      )
      const row = cur[0] || {}
      const hasVal =
        row.recurring_accepted_count !== null && row.recurring_accepted_count !== undefined
      const seen = hasVal ? Number(row.recurring_accepted_count) || 0 : 0
      const max = Number(row.recurring_max_count) || maxCount
      if (max && seen >= max) {
        return { code: 409, message: `该常驻任务次数已用完（${seen}/${max}）` }
      }
      const next = seen + 1
      const cond = hasVal
        ? `recurring_accepted_count=eq.${enc(String(seen))}`
        : 'recurring_accepted_count=is.null'
      /* ⭐ 只记次数，不在这里置「已结束」——接最后一趟时任务还没跑完，
         真正的收口在 finish 之后判定（用户 2026-10-18 报「最后一趟没完成就结束了」）。 */
      const patch = { recurring_accepted_count: next }
      const updated = await updateTable('waybills', `id=eq.${enc(tpl.id)}&${cond}`, patch)
      const affected = Array.isArray(updated) ? updated.length : updated ? 1 : 0
      if (affected > 0) {
        bumped = true
        usedBefore = seen
      } else {
        console.log(
          `waybill-action：常驻 ${groupNo} 额度 CAS 冲突（第 ${attempt + 1} 次），重读重试`
        )
      }
    }
    if (!bumped) {
      return { code: 409, message: '手慢了，额度刚好被别人用完，请刷新后再试' }
    }
  }

  /* 7) 先看组内有没有还挂着没被接走的「待接单」趟次（Web 发布常驻任务时会先落一条），
        有就直接接手它；没有（或刚被别人接手）再新建一条属于我的趟次 */
  const nowIso = new Date().toISOString()
  const operator = ctx.driverName || account

  const adopted = await tryAdoptPendingTrip({ groupNo, finalVehicle, operator, account, ctx })
  if (adopted) {
    console.log(
      `waybill-action：${account} 常驻 ${groupNo} 接手第 ${adopted.trip_seq} 趟 ${adopted.waybill_no}`
    )
    return {
      code: 0,
      message: 'ok',
      id: adopted.id,
      group_no: groupNo,
      waybill_no: adopted.waybill_no || '',
      trip_seq: adopted.trip_seq,
      status: '待装车',
      accept_time: nowIso,
      adopted: true,
      used: type === 'count' ? usedBefore + 1 : null,
      max_count: type === 'count' ? Number(tpl.recurring_max_count) || 0 : null,
    }
  }

  /* 8) 新建一条属于我的趟次 */
  const d = new Date()
  const datePart = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
  const seqBase = await generateWaybillNo(datePart)
  const tripSeqBase = Math.max(
    Number(tpl.trip_seq) || 0,
    ...rows.map((r) => Number(r.trip_seq) || 0)
  )

  let created = null
  let lastErr = null
  for (let attempt = 0; attempt < RECURRING_INSERT_RETRY && !created; attempt++) {
    const payload = {
      waybill_no: `YD${datePart}${String(seqBase + attempt + 1).padStart(4, '0')}`,
      status: '待装车',
      create_time: nowIso,
      accept_time: nowIso,
      accept_by: operator,
      trip_seq: tripSeqBase + attempt + 1,
      owner_account: String(tpl.owner_account || '').trim() || null,
      is_recurring: true,
      recurring_group_no: groupNo,
      recurring_type: type,
      recurring_start_time: tpl.recurring_start_time || null,
      recurring_end_time: tpl.recurring_end_time || null,
      recurring_max_count: type === 'count' ? Number(tpl.recurring_max_count) || null : null,
      recurring_accepted_count: usedBefore + 1,
      recurring_status: String(tpl.recurring_status || '生效中').trim() || '生效中',
      vehicle: finalVehicle || '',
      status_log: [
        {
          status: '待装车',
          time: nowIso,
          operator,
          account,
          remark: '常驻任务接一趟',
        },
      ],
      /* ⚠️ 计划装货 / 送达时间一律不带过来：常驻趟次没有计划时间，
         时间口径只看 accept_time（接单）与 finish_time（完单） */
      pickup_time: null,
      plan_time: null,
    }
    RECURRING_COPY_FIELDS.forEach((k) => {
      const v = tpl[k]
      if (v !== undefined && v !== null && v !== '') payload[k] = v
    })

    try {
      const res = await insertTable('waybills', payload)
      created = Array.isArray(res) ? res[0] : res
    } catch (e) {
      lastErr = e
      console.warn(
        `waybill-action：常驻 ${groupNo} 新建趟次失败（第 ${attempt + 1} 次）:`,
        e.message
      )
    }
  }

  if (!created) {
    /* 额度已经占了、趟次却没建出来 → 把额度还回去，别白扣一次（宁可少卖，不可超发） */
    if (type === 'count') {
      try {
        await updateTable('waybills', `id=eq.${enc(tpl.id)}`, {
          recurring_accepted_count: usedBefore,
          recurring_status: String(tpl.recurring_status || '生效中').trim() || '生效中',
        })
        console.log(`waybill-action：常驻 ${groupNo} 建趟失败，已把额度回滚到 ${usedBefore}`)
      } catch (e) {
        console.warn('额度回滚失败（需要人工核对）:', e.message)
      }
    }
    return {
      code: 500,
      message: '生成趟次失败：' + ((lastErr && lastErr.message) || '未知'),
    }
  }

  console.log(
    `waybill-action：${account} 常驻 ${groupNo} 接一趟 → 第 ${created.trip_seq} 趟 ` +
      `${created.waybill_no}` +
      (type === 'count' ? `（全队已接 ${usedBefore + 1}/${tpl.recurring_max_count}）` : '')
  )

  return {
    code: 0,
    message: 'ok',
    id: created.id,
    group_no: groupNo,
    waybill_no: created.waybill_no,
    trip_seq: created.trip_seq,
    status: '待装车',
    accept_time: nowIso,
    used: type === 'count' ? usedBefore + 1 : null,
    max_count: type === 'count' ? Number(tpl.recurring_max_count) || 0 : null,
  }
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
    const id = event && event.id

    const rawAction = String((event && event.action) || '').trim()
    /* 旧动作名兼容：已上线的司机端还在发 complete */
    const action = ACTION_ALIASES[rawAction] || rawAction

    if (!account) return { code: 400, message: '未登录' }

    /* ⭐ 常驻「接一趟」不是对某条运单操作，而是在常驻任务（组）下新建一条趟次，
       所以在「取单条运单」之前就分叉，也不需要 id。 */
    const isRecurringClaim = action === 'claimRecurring'
    if (!isRecurringClaim && (id === undefined || id === null || id === '')) {
      return { code: 400, message: '缺少运单 id' }
    }

    const rule = TRANSITIONS[action]
    if (!isRecurringClaim && !rule) {
      return { code: 400, message: `不支持的操作：${rawAction}` }
    }

    /* ⭐ claim（抢单）与 accept 走同一套前置校验，只是落库时多一个状态条件 */
    const isAcceptLike = action === 'accept' || action === 'claim'

    /* 拒单原因必填 */
    let reason = ''
    let note = ''
    if (action === 'reject') {
      reason = String((event.reason) || '').trim().slice(0, REASON_MAX)
      note = String((event.note) || '').trim().slice(0, NOTE_MAX)
      if (!reason) return { code: 400, message: '请选择拒单原因' }
      if (reason === '其他' && !note) {
        return { code: 400, message: '选择「其他」时请填写补充说明' }
      }
      if (!REJECT_REASONS.includes(reason)) {
        console.warn(`waybill-action：非预设拒单原因「${reason}」`)
      }
    }

    /* ⭐ 改计划时间：只写 pickup_time / plan_time 两个字段，不改状态。
       传空 = 清空；格式不对直接拦掉，别把脏数据写进库。 */
    let planPickup = null
    let planDelivery = null
    if (action === 'setPlanTime') {
      planPickup = normalizePlanTime(event.pickup_time)
      planDelivery = normalizePlanTime(event.plan_time)
      if (planPickup === undefined) {
        return { code: 400, message: '计划装货时间格式不对' }
      }
      if (planDelivery === undefined) {
        return { code: 400, message: '计划送达时间格式不对' }
      }
      /* 两个时间都是 'YYYY-MM-DDTHH:mm:ss'，字符串比较就是时间先后 */
      if (planPickup && planDelivery && planDelivery < planPickup) {
        return { code: 400, message: '计划送达时间不能早于计划装货时间' }
      }
    }

    /* 1. 用户行：phone（司机档案以手机号关联）与 owner_account（隔离口径） */
    const users = await queryTable(
      'users',
      `account=eq.${enc(account)}&select=account,phone,owner_account&limit=1`
    )
    const user = users[0]
    if (!user) return { code: 403, message: '未找到用户记录' }

    /* 2. 司机档案 —— 口径与 login-by-account 对齐：phone = users.phone || account */
    const driverPhone = String(user.phone || '').trim() || account
    const drivers = await queryTable(
      'drivers',
      `phone=eq.${enc(driverPhone)}&select=driver_name,phone,org,bound_vehicle,customer_id&limit=1`
    )
    const driver = drivers[0]
    if (!driver) return { code: 403, message: '未找到司机档案' }

    const ctx = {
      driverName: String(driver.driver_name || '').trim(),
      myOrgName: String(driver.org || '').trim(),
      plates: splitPlates(driver.bound_vehicle),
      customerId: String(driver.customer_id || '').trim(),
      orgNames: new Set(),
      adminSafe: null,
    }

    /* ⭐ 常驻「接一趟」：在这里分叉（它按常驻任务「组」操作，不按单条运单） */
    if (isRecurringClaim) {
      const ownerAcc = String(user.owner_account || '').trim() || account
      ctx.orgNames = await loadOrgNameSet(ownerAcc, ctx.myOrgName)
      return await claimRecurringTrip({ event, account, ctx, ownerAccount: ownerAcc })
    }

    /* 3. 取运单 */
    const rows = await queryTable('waybills', `id=eq.${enc(id)}&limit=1`)
    const wb = rows[0]
    if (!wb) return { code: 404, message: '运单不存在' }

    /* 4. 归属校验（防越权） */
    const ownerAccount =
      String(user.owner_account || '').trim() || account

    if (wb.owner_account && String(wb.owner_account) !== ownerAccount) {
      return { code: 403, message: '无权操作该运单' }
    }
    ctx.orgNames = await loadOrgNameSet(ownerAccount, ctx.myOrgName)
    /* 管理员发布的运单靠名称认领，需先做跨客户重名消歧（与 waybill-list 一致） */
    if (!String(wb.owner_account || '').trim()) {
      ctx.adminSafe = await buildAdminSafeTargets(ctx.customerId, ownerAccount)
    }
    if (!isAssignedToDriver(wb, ctx)) {
      return { code: 403, message: '该运单未指派给你' }
    }

    /* ⭐ 子母车（一单多司机/多车）：我这一趟单独算，状态/时间都写在自己那条指派项上 */
    const multi = isMultiLegWaybill(wb)
    const myLeg = multi ? findMyLeg(wb, ctx) : null
    if (multi && !myLeg) {
      return { code: 403, message: '这趟没有派给你（子母车任务每人只跑自己那份）' }
    }
    const myLegStatus = myLeg ? legStatusOf(myLeg, wb) : ''

    /* ⭐ 4.1 抢单归属守卫（关键）
       按「车队」指派时，组织下**每个**司机都能通过上面的指派校验。
       所以必须在指派校验之外再确认一次：这条单是不是**我**抢到的。
       否则同事 A 抢走之后，同事 B 照样能把车装了、发了。
       ⚠️ 子母车（multi）**不走这道**：行级 accept_by 只是「第一个接单的人」，
          别人接了不影响我接我自己那一趟。 */
    const acceptBy = String(wb.accept_by || '').trim()
    if (!multi && acceptBy) {
      const meNames = [ctx.driverName, account].filter(Boolean)
      if (!meNames.includes(acceptBy)) {
        return {
          code: 403,
          message: '这趟已被其他司机接走，你不能再操作它',
        }
      }
    }

    /* ⭐ 改计划时间必须是「我接的这趟」。
       没被接走的趟次（accept_by 为空）在车队常驻里是公共池里的，谁都别改它的时间。
       子母车按**我这一趟**的状态判。 */
    if (action === 'setPlanTime') {
      const started = multi ? myLegStatus !== LEG_TODO : !!acceptBy
      if (!started) return { code: 403, message: '这趟还没有被接走，不能改它的计划时间' }
    }

    /* ⭐ 车队单（可抢）和常驻单**不给拒单**（用户 2026-10-17 拍板）
       前端已经不给入口，这里再守一道：旧版本小程序、或者直接调接口都绕不过去。
       · 车队指派 = 一条活谁抢到归谁，不接就放着让别人接，没有"拒绝"的语义
       · 常驻任务 = 组织下谁都能接、各接各的，同样不该出现拒单 */
    if (action === 'reject') {
      if (wb.is_recurring) {
        return { code: 403, message: '常驻任务的趟次不能拒单' }
      }
      const isTeam = parseAssignments(wb.assignments).some(
        (a) => readAssignMethod(a) === 'team'
      )
      if (isTeam) {
        return { code: 403, message: '车队指派的任务不能拒单，不接就放着让别人接' }
      }
    }

    /* 5. 状态校验
       ⚠️ 子母车按**我这一趟**的状态判：别人接了只影响他自己的腿，
          不能因此把我这一步也顶掉（以前就是这样把第二个司机挡在 403 外面的）。 */
    const cur = multi ? myLegStatus : String(wb.status || '').trim()
    if (!rule.from.includes(cur)) {
      return { code: 409, message: `当前状态「${cur}」不能执行该操作` }
    }

    /* 5.1 ⭐ 运输节点模式校验：极简模式只有「接单 → 完成运单」两步 */
    const transportMode = String(wb.transport_mode || '详细').trim()
    if (rule.mode === 'detail' && transportMode === '极简') {
      return {
        code: 409,
        message: `该运单的运输节点为「极简」，不需要上报「${rule.node}」`,
      }
    }

    /* 5.2 ⭐ 装卸货地打卡围栏校验
       confirmLoad  → 装货地围栏
       confirmArrive → 卸货地围栏
       运单已临时关闭打卡时跳过校验
       ⚠️ 子母车每辆车不一样：要按**我这趟的车**去查 VIN 和定位 */
    const legPlate = myLeg
      ? (String((event && event.vehicle) || '').trim() ||
          String(myLeg.item.leg_vehicle || '').trim() ||
          (myLeg.method === 'vehicle' ? myLeg.target : '') ||
          (ctx.plates.length === 1 ? ctx.plates[0] : ''))
      : ''
    let fenceRemark = ''
    if (rule.fence && transportMode === '详细') {
      if (wb.check_in_required === false) {
        fenceRemark = '运单已临时关闭装卸货地打卡，未做位置校验'
      } else {
        const gate = await assertFenceCheckin(wb, rule.fence, legPlate)
        if (!gate.ok) {
          console.log(
            `waybill-action：${account} 运单 ${wb.waybill_no || id} ` +
              `「${rule.node}」打卡被围栏拦截 —— ${gate.message}`
          )
          return { code: 409, message: gate.message }
        }
        fenceRemark = gate.remark || ''
      }
    }

    /* 5.3 ⭐ 同车 / 同司机并发拦截：一趟没跑完不能再接下一趟
       ⚠️ 子母车按「我这趟的车 / 我自己」判：别人那条腿的占用不该拦我 */
    if (isAcceptLike) {
      const myPlate = legPlate || pickVehiclePlate(wb) ||
        (ctx.plates.length === 1 ? ctx.plates[0] : '')
      const conflict = await findRunningConflict(wb, ctx, ownerAccount, myPlate)
      if (conflict) {
        console.log(
          `waybill-action：${account} 运单 ${wb.waybill_no || id} 接单被并发规则拦截 —— ${conflict.message}`
        )
        return { code: 409, message: conflict.message }
      }
    }

    /* 6. ⭐ 常驻任务接单闸门（只有接单 / 抢单需要校验） */
    let recurringGate = null
    if (isAcceptLike) {
      recurringGate = await checkRecurringGate(wb)
      if (!recurringGate.ok) {
        console.log(`waybill-action：${account} 接单被常驻任务规则拦截 —— ${recurringGate.message}`)
        return { code: 409, message: recurringGate.message }
      }
    }

    /* 6.5 ⭐ 车牌（本次用哪辆车）与「必须选车」闸门
       规则（用户拍板）：
         - 只绑 1 辆车 → 自动带上，不打扰司机
         - 绑 ≥2 辆车：
             极简模式 → **接单前**必须选，不选不让接
             详细模式 → **发车前**必须选，不选不让发车
       任何动作都允许顺带带 vehicle（这样「发车」可以一次调用同时写车牌）。 */
    const reqVehicle = String((event.vehicle) || '').trim()
    if (reqVehicle && !ctx.plates.includes(reqVehicle)) {
      return { code: 400, message: '只能选择你自己绑定的车辆' }
    }
    /* 绑 1 辆自动带；绑多辆且极简模式 → 接单前必须选（返回 need_vehicle，前端弹选车面板） */
    let finalVehicle = ''
    if (multi && myLeg) {
      /* 子母车：默认沿用「我这趟已经定过的车 / 派给我这辆车」，行级的 vehicle 是「多种」不能用 */
      finalVehicle =
        reqVehicle ||
        String(myLeg.item.leg_vehicle || '').trim() ||
        (myLeg.method === 'vehicle' ? myLeg.target : '') ||
        ''
      if (!finalVehicle && ctx.plates.length === 1) finalVehicle = ctx.plates[0]
    } else {
      finalVehicle = reqVehicle || String(wb.vehicle || '').trim()
      if (!finalVehicle && isAcceptLike && ctx.plates.length === 1) {
        finalVehicle = ctx.plates[0]
      }
    }

    if (ctx.plates.length > 1) {
      if (isAcceptLike && transportMode === '极简' && !finalVehicle) {
        return {
          code: 400,
          message: '该运单是「极简」模式，接单前请先选择本次用哪辆车',
          need_vehicle: true,
          /* ⭐ 车牌的权威副本：前端本地缓存的绑定可能过期，
             不带回来就会出现「服务端要选车、界面上没有可选的入口」 */
          plates: ctx.plates,
        }
      }
      /* 详细模式打卡要靠车牌去查 VIN 和车辆定位，所以装车这一步就必须有车牌，
         否则会退化成「该运单未指定单车，无法校验装货地围栏位置」这种更难懂的错误 */
      if (action === 'confirmLoad' && wb.check_in_required !== false && !finalVehicle) {
        return {
          code: 400,
          message: '还没有选择本次用哪辆车，装货地打卡无法校验，请先选车',
          need_vehicle: true,
          plates: ctx.plates,
        }
      }
      if (action === 'confirmDepart' && !finalVehicle) {
        return {
          code: 400,
          message: '还没有选择本次用哪辆车，请先选车再发车',
          need_vehicle: true,
          plates: ctx.plates,
        }
      }
    }

    /* ============================================================
       ⭐⭐ 7. 子母车：只写**我这一趟**的字段，再重算行级聚合
       ------------------------------------------------------------
       行级 status / accept_time / finish_time 是聚合值（Web 列表、统计照样能用），
       每次写完某一趟都重算一遍 —— 这样 Web 上「执行中 1/2」「已完成 2/2」都是现成的。
       ⚠️ assignments 是 jsonb，PostgREST 只能整列覆盖 → 必须「读 → 改我这条 → 写回」，
          所以用**行级 status 当版本号**做一次 CAS：并发时 0 行命中就重读重试，
          避免两个人的写入互相覆盖（各写各的腿，谁都不该丢）。
       ============================================================ */
    if (multi && myLeg) {
      if (action === 'setVehicle' && !reqVehicle) {
        return { code: 400, message: '请选择本次用哪辆车' }
      }
      const nowIso = new Date().toISOString()
      const operator = ctx.driverName || account
      const legPatch = buildLegPatch(action, rule, operator, nowIso, finalVehicle, reason, note)
      const legLabel = myLeg.method === 'vehicle' ? `车 ${myLeg.target}` : `司机 ${myLeg.target}`

      let ok = false
      let after = null
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        const fresh =
          attempt === 0
            ? wb
            : (await queryTable('waybills', `id=eq.${enc(id)}&limit=1`))[0]
        if (!fresh) break
        const legNow = findMyLeg(fresh, ctx)
        if (!legNow) break
        /* 重读过就再校验一次状态：这一小会儿可能刚好被别人改过 */
        if (attempt > 0 && action !== 'setVehicle' && action !== 'setPlanTime') {
          const stNow = legStatusOf(legNow, fresh)
          if (!rule.from.includes(stNow)) {
            return { code: 409, message: `当前状态「${stNow}」不能执行该操作` }
          }
        }

        const assignsAfter = withLegPatch(fresh, legNow, legPatch)
        const patch = {
          ...aggregateRowPatch(fresh, assignsAfter),
          assignments: assignsAfter,
          status_log: appendStatusLog(fresh, {
            status: rule.node || String(fresh.status || '').trim(),
            time: nowIso,
            operator,
            account,
            remark:
              `子母车 · ${legLabel} · ${rule.node || action}` +
              (action === 'reject' && reason ? `（${reason}）` : '') +
              (fenceRemark ? `（${fenceRemark}）` : ''),
          }),
        }
        if (action === 'setPlanTime') {
          patch.pickup_time = planPickup
          patch.plan_time = planDelivery
        }

        const updated = await updateTable(
          'waybills',
          `id=eq.${enc(id)}&status=eq.${enc(String(fresh.status || '').trim())}`,
          patch
        )
        const affected = Array.isArray(updated) ? updated.length : updated ? 1 : 0
        if (affected > 0) {
          ok = true
          after = Array.isArray(updated) ? updated[0] : updated
        } else {
          console.log(
            `waybill-action：子母车 ${wb.waybill_no || id} 第 ${attempt + 1} 次写入冲突，重读重试`
          )
        }
      }
      if (!ok) {
        return { code: 409, message: '手慢了，这趟刚好被别人改过，请刷新后再试' }
      }

      const legsAfter = collectLegs(after || wb)
      console.log(
        `waybill-action：${account} 子母车 ${wb.waybill_no || id} ${legLabel} ${action} ` +
          `${cur} → ${rule.to || cur}（行级聚合 → ${(after && after.status) || ''}）`
      )
      return {
        code: 0,
        message: 'ok',
        id,
        status: rule.to || cur,
        leg_status: rule.to || cur,
        vehicle: finalVehicle || '',
        waybill_no: (after && after.waybill_no) || wb.waybill_no || '',
        node_time: nowIso,
        multi_leg: true,
        leg_count: legsAfter.length,
        leg_index: legsAfter.findIndex((l) => l.target === myLeg.target) + 1,
      }
    }

    /* 7. 组装 patch */
    const nowIso = new Date().toISOString()
    const operator = ctx.driverName || account

    const patch = {
      /* ⭐ 只在动作真的有目标状态时才写 status（setVehicle 不改状态） */
      ...(rule.to ? { status: rule.to } : {}),
      /* ⭐ 节点时间：Web 端「物流状态」时间轴直接读这些列 */
      ...(rule.timeField ? { [rule.timeField]: nowIso } : {}),
      /* ⭐ 流转履历：拒单重派后再接单会继续往后追加，保留完整轨迹 */
      ...(rule.node
        ? {
            status_log: appendStatusLog(wb, {
              status: rule.node,
              time: nowIso,
              operator,
              account,
              remark:
                action === 'reject'
                  ? reason + (note ? '（' + note + '）' : '')
                  : fenceRemark || '',
            }),
          }
        : {}),
    }

    /* ⭐ 补写 / 更改本次用车：只校验「必须是我绑定的车」，其余不动 */
    if (action === 'setVehicle') {
      if (!reqVehicle) return { code: 400, message: '请选择本次用哪辆车' }
      patch.vehicle = reqVehicle
    } else if (finalVehicle && finalVehicle !== String(wb.vehicle || '').trim()) {
      patch.vehicle = finalVehicle
    }

    /* ⭐ 改计划时间：只动这两个字段（常驻趟次建房时不带时间，司机用这个入口补） */
    if (action === 'setPlanTime') {
      patch.pickup_time = planPickup
      patch.plan_time = planDelivery
    }

    if (isAcceptLike) {
      patch.accept_by = operator
      /* 常驻任务：累计接单次数 +1，用满自动置为「已结束」 */
      if (wb.is_recurring) {
        const nextUsed = (recurringGate.used || 0) + 1
        patch.recurring_accepted_count = nextUsed
        /* 接单只累加次数；任务结束要等这一趟跑完再判（见下方 finish 分支） */
      }
    }

    if (action === 'reject') {
      patch.reject_reason = reason
      patch.reject_note = note || null
      patch.reject_by = operator
      patch.reject_count = (Number(wb.reject_count) || 0) + 1
    }

    /* 8. 落库
       ⭐ 抢单必须原子：把「当前状态还得是待接单」写进 PATCH 的 where 条件，
          用返回行数判断谁先到。若交给前端判断，两个司机会同时「抢到」。 */
    const where =
      action === 'claim'
        ? `id=eq.${enc(id)}&status=eq.${enc('待接单')}`
        : `id=eq.${enc(id)}`
    const updated = await updateTable('waybills', where, patch)
    const affected = Array.isArray(updated) ? updated.length : updated ? 1 : 0

    if (action === 'claim' && affected === 0) {
      console.log(
        `waybill-action：${account} 抢单失败 —— 运单 ${wb.waybill_no || id} 已被他人接走`
      )
      return {
        code: 409,
        message: '手慢了，这趟已被其他司机接走',
        conflict: 'claimed_by_other',
      }
    }

    const after = Array.isArray(updated) ? updated[0] : updated

    /* ⭐ 常驻任务收尾判定（用户 2026-10-18）：
       · 按次数：次数用满 且 组内**没有**进行中的趟次 → 已结束
       · 按时间：已过有效期 且 组内没有进行中的趟次 → 已结束
       这样最后一趟能正常跑完、交单，任务才收口。 */
    if (action === 'finish' && wb.is_recurring && wb.recurring_group_no) {
      try {
        const gno = String(wb.recurring_group_no).trim()
        const rows2 = await queryTable(
          'waybills',
          `select=status,recurring_type,recurring_max_count,recurring_accepted_count,recurring_end_time,recurring_status` +
            `&recurring_group_no=eq.${enc(gno)}&limit=300`
        )
        const RUN = ['待装车', '装车中', '装车完成', '已发车', '已到达']
        const running = (rows2 || []).filter((r) => RUN.includes(String(r.status || '').trim()))
        const head = (rows2 || [])[0] || {}
        const type = String(head.recurring_type || 'time').trim()
        const max = Number(head.recurring_max_count) || 0
        const used = Math.max(0, ...(rows2 || []).map((r) => Number(r.recurring_accepted_count) || 0))
        const endMs = head.recurring_end_time ? new Date(head.recurring_end_time).getTime() : 0
        const expired = !!endMs && endMs < Date.now()
        const quotaDone = type === 'count' && max > 0 && used >= max
        const already = String(head.recurring_status || '').trim() === '已结束'
        if (!running.length && (quotaDone || expired) && !already) {
          await updateTable('waybills', `recurring_group_no=eq.${enc(gno)}`, {
            recurring_status: '已结束',
          })
          console.log(`waybill-action：常驻 ${gno} 已收口（${quotaDone ? '次数用满' : '已过期'}）`)
        }
      } catch (e) {
        console.warn('常驻收尾判定失败（不影响本次完成）:', e.message)
      }
    }

    console.log(
      `waybill-action：${account} ${action} 运单 ${wb.waybill_no || id} ${cur} → ${rule.to || cur}` +
        (action === 'reject' ? `（原因：${reason}）` : '') +
        (action === 'setVehicle' ? `（本次用车 ${patch.vehicle}）` : '') +
        (isAcceptLike && wb.is_recurring
          ? `（常驻任务累计 ${patch.recurring_accepted_count} 次）`
          : '')
    )

    return {
      code: 0,
      message: 'ok',
      id,
      status: rule.to || cur,
      vehicle: patch.vehicle || wb.vehicle || '',
      waybill_no: (after && after.waybill_no) || wb.waybill_no || '',
      node_time: nowIso,
      recurring_status: patch.recurring_status || wb.recurring_status || null,
    }
  } catch (e) {
    console.error('waybill-action error:', e && (e.stack || e.message || e))
    return {
      code: 500,
      message: '服务异常：' + (e && e.message ? e.message : '未知'),
    }
  }
}

/* ============================================================
   备注
   ------------------------------------------------------------
   1. 节点时间现已落库（accept_time / load_end_time / depart_time /
      arrive_time / finish_time），并同步 append 到 status_log。
      Web 端「运单详情 → 物流状态」时间轴优先读列，读不到再回退 status_log。
   2. reject_count / recurring_accepted_count 采用「读-改-写」非原子方式累加；
      同一单并发操作概率极低，可接受。若要严格原子，需改用 PostgREST 的 RPC 函数。
   3. 常驻任务的次数闸门以「同 recurring_group_no 下已接单的运单数」为准，
      比单条记录上的冗余计数更可靠；recurring_accepted_count 仅作展示与兜底。
   4. 围栏校验用的是「车辆最后一次上报的位置」，不是司机手机定位。
      车辆熄火/离线时位置可能是旧的，此时仍可能判定为「不在围栏内」——
      这正是 Web 端「临时关闭装卸货地打卡」存在的意义。
   ============================================================ */
