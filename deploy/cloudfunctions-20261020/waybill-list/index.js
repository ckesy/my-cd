/**
 * 云函数：waybill-list
 * ============================================================
 * 作用：小程序「任务中心」——按司机身份取出指派给他的运单
 * 调用：wx.cloud.callFunction({ name: 'waybill-list', data: { account, page, pageSize } })
 * 运行时：Node.js 18.15（只用内置 fetch，无 npm 依赖）
 * 环境变量：无
 *
 * 返回契约见根目录《数据契约.md》与《任务中心设计方案.md》§2
 *
 * ⭐ 匹配规则（方案 §2.4）——必须解析 assignments，不能只看 driver/vehicle 字段：
 *    指派司机  方式='driver'  → target === 司机姓名
 *    指派车辆  方式='vehicle' → target ∈ 绑定车牌列表
 *    指派车队  方式='team'    → target === 我的机构 或 我的祖先机构名
 *
 * ⚠️ 方式字段名：设计方案文档写的是 `assignMethod`，但 Web 端 WaybillCreate.vue
 *    doPublish() 实际落库写入的 key 是 **`method`**（Web 端 Waybill.vue 读取时也用
 *    `a.method`）。两边不一致会让所有指派静默匹配失败、任务中心永远空列表。
 *    这里统一用 readAssignMethod() 兼容两种写法，并优先取 `method`（库里的真实字段）。
 *
 * ⭐ 「待重新指派」的运单**不在小程序展示**（已拒单，等 Web 端重新派单）
 *
 * ⭐ 车队抢单：按「车队」指派的运单，组织下所有司机都能匹配到。
 *    一旦某位司机抢走（accept_by 有值），其他人：
 *      - 10 分钟内（TAKEN_WINDOW_MIN）→ 仍然返回，标记 taken_by_other，前端灰显 + 倒计时
 *      - 超过 10 分钟 → 直接从列表剔除
 *    ⚠️ 只返回「已被接走」，**绝不返回承接人是谁**（用户明确要求）。
 */

const { randomUUID } = require('crypto')

const API_BASE = 'https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com'
const DEVICE_ID = randomUUID()

/* 司机侧不展示的状态 */
const EXCLUDE_STATUS = ['待重新指派']

/* ⭐ 车队单被抢走后，在别的司机列表里最多还挂多久（灰显「已被他人承接」） */
const TAKEN_WINDOW_MIN = 10

/* 候选集窗口与上限（内存过滤方案，见文末「已知限制」） */
const FETCH_DAYS = 90
const FETCH_LIMIT = 300

const PAGE_SIZE_DEFAULT = 20
const PAGE_SIZE_MAX = 50

/* ============================================================
   基础工具
   ============================================================ */
const enc = encodeURIComponent

let _token = null
let _tokenExp = 0 // 匿名 access token 的过期时间戳（ms）

/* ⭐ 匿名 token 只有 2 小时（signin 返回 expires_in=7200）。
   原来这里只判 `if (_token) return _token`，容器一旦热过 2 小时，
   后续所有查询都会 401 ACCESS_TOKEN_EXPIRED ——
   前端看到的是「查询 users 失败 HTTP 401 ... Access token has expired」。
   现在：① 按过期时间取；② 请求收到 401 时强制换 token 重试一次。 */
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

async function queryTable(table, query) {
  const url = `${API_BASE}/v1/rdb/rest/${table}?${query}`
  const doFetch = (token) =>
    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-device-id': DEVICE_ID,
        'Accept-Profile': 'public',
        'Content-Profile': 'public',
      },
    })

  let res = await doFetch(await getToken())
  if (res.status === 401) res = await doFetch(await getToken(true)) // token 过期 → 换一张重试
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`查询 ${table} 失败 HTTP ${res.status}: ${txt.slice(0, 200)}`)
  }
  return res.json()
}

/* 车牌串可能是逗号 / 顿号 / 分号 / 空格分隔 */
const splitPlates = (raw) =>
  String(raw || '')
    .split(/[,，、;；\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)

/* assignments 可能是 jsonb（已解析）也可能是 text（需 parse），两种都兼容 */
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
 * ⚠️ Web 端落库的 key 是 `method`；设计方案文档里写的是 `assignMethod`。
 * 两者都认，优先 `method`，避免历史数据 / 文档口径不一致导致匹配全空。
 */
const readAssignMethod = (a) =>
  String((a && (a.method || a.assignMethod)) || '').trim()

/* 'YYYY-MM-DD HH:mm:ss' / ISO（带 T、毫秒、时区偏移）→ 毫秒
   ⚠️ 老写法 `new Date(s.replace(/-/g, '/'))` 对**带 T** 的串会返回 NaN。
   库里 waybills.accept_time 实际是 "2026-10-17T00:42:27.565+08:00"，
   于是被抢走的单在别人列表里算出的 at = 0 → 下面 `if (!at) continue`
   直接把它剔除了，**10 分钟灰显窗口形同虚设**（用户 2026-10-17 反馈「别人抢完单，
   换个账号进去这单就不显示了」就是这个原因）。pickup_time / plan_time 同样是带 T 的串。
   所以先按原生 ISO 解，解不出来再退回「- 换 /」的老写法。 */
function toMs(t) {
  if (!t) return 0
  if (typeof t === 'number') return t
  const s = String(t).trim()
  if (/^\d+$/.test(s)) return Number(s)
  const direct = Date.parse(s)
  if (!isNaN(direct)) return direct
  const ms = new Date(s.replace(/-/g, '/')).getTime()
  return isNaN(ms) ? 0 : ms
}

/* ============================================================
   组织树：取出「我的机构 + 全部祖先机构名」
   用于「指派车队」的匹配（指派给上级车队时，下级司机也应收到）
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
    console.warn('加载组织树失败，车队匹配将只按本机构名:', e.message)
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

/* ============================================================
   管理员运单的消歧守卫
   ------------------------------------------------------------
   管理员跨客户派单时 owner_account 记 null，且 target 仍是「名称」。
   名称可能跨客户重名（同名司机 / 同名机构），直接放开会串到别的客户。
   做法：全量统计每个名称到底归属几个客户，**只有唯一归属我所在的客户才认**。
   车牌不需要消歧——target 已经要落在我自己绑定的车牌里。
   ============================================================ */
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
    console.warn('管理员运单消歧（司机）构建失败，同名司机将不予匹配:', e.message)
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
    console.warn('管理员运单消歧（机构）构建失败，同名机构将不予匹配:', e.message)
  }
  console.log(`waybill-list：管理员运单消歧 → 唯一司机名 ${drivers.size} 个 / 唯一机构名 ${orgs.size} 个`)
  return { drivers, orgs }
}

/* 管理员运单的 target 是否可安全认领 */
function adminTargetAllowed(method, target, isAdminWaybill, ctx) {
  if (!isAdminWaybill) return true
  const safe = ctx.adminSafe
  if (!safe) return false // 消歧索引没建成 → 保守起见不认
  if (method === 'vehicle') return true // 车牌是我自己绑定的，天然唯一
  if (method === 'driver') return safe.drivers.has(target)
  if (method === 'team') return safe.orgs.has(target)
  return false
}

/* 这条指派的目标是不是我自己 */
function targetMatchesMe(method, target, ctx) {
  if (method === 'driver') return !!ctx.driverName && target === ctx.driverName
  if (method === 'vehicle') return ctx.plates.includes(target)
  if (method === 'team') return ctx.orgNames.has(target)
  return false
}

/* ============================================================
   匹配：这条运单是否指派给了该司机
   命中返回 { method, target }，否则 null
   ============================================================ */
function matchWaybill(wb, ctx) {
  const isAdminWaybill = !String((wb && wb.owner_account) || '').trim()
  const assigns = parseAssignments(wb.assignments)
  for (const a of assigns) {
    if (!a) continue
    const method = readAssignMethod(a)
    const items = Array.isArray(a.items) ? a.items : []
    for (const it of items) {
      const target = String((it && it.target) || '').trim()
      if (!target) continue
      if (!targetMatchesMe(method, target, ctx)) continue
      if (!adminTargetAllowed(method, target, isAdminWaybill, ctx)) {
        // 目标确实指向我，但名称跨客户重名、无法判断是哪家的 → 记下来便于排查
        if (ctx.adminAmbiguous) ctx.adminAmbiguous.push(`${method}:${target}`)
        continue
      }
      return { method, target }
    }
  }
  return null
}

/* ============================================================
   车牌取值（优先级，见方案 §2.3）
   1) assignments 里指派给我的车
   2) waybills.vehicle 是真实车牌且属于我
   3) 我只绑了一辆车 → 就是它
   4) 都取不到 → ''（前端显示「未分配」）
   ============================================================ */
function resolvePlate(wb, ctx) {
  const assigns = parseAssignments(wb.assignments)
  for (const a of assigns) {
    if (!a || readAssignMethod(a) !== 'vehicle') continue
    for (const it of Array.isArray(a.items) ? a.items : []) {
      const t = String((it && it.target) || '').trim()
      if (t && ctx.plates.includes(t)) return t
    }
  }
  const v = String(wb.vehicle || '').trim()
  if (v && ctx.plates.includes(v)) return v
  if (ctx.plates.length === 1) return ctx.plates[0]
  return ''
}

/* ============================================================
   ⭐ 子母车：一单多司机 / 多车，每人各自跑自己那一趟
   ------------------------------------------------------------
   场景（用户 2026-10-17）：一个运单、一种货物，派给 2 个及以上的司机 / 车辆，
   每人承运数量之和 = 总货物量（Web 新建运单时可分别设置，默认平分）。
   拍板口径：
     · **一个运单保持一行**，每个司机这一趟的状态**单独记在自己的指派项上**
       （`leg_status` / `leg_accept_time` / `leg_accept_by` / `leg_vehicle` / 各节点时间），
       各自接单、各自上报，互不影响；
     · 运单行上的 status / accept_time / … 是**聚合值**（Web 列表筛选与统计照样能用）；
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

/* 是不是「一单多司机/多车」：非常驻、没有 team 指派、driver/vehicle 条目 ≥2 */
function isMultiLegWaybill(wb) {
  if (!wb || wb.is_recurring) return false
  const legs = collectLegs(wb)
  if (legs.length < 2) return false
  return legs.every((l) => LEG_EXCLUSIVE_METHODS.includes(l.method))
}

/* 这条腿是不是我的：司机按姓名、车辆按我绑定的车牌 */
function legMatchesMe(leg, ctx) {
  if (leg.method === 'driver') return !!ctx.driverName && leg.target === ctx.driverName
  if (leg.method === 'vehicle') return ctx.plates.includes(leg.target)
  return false
}

function findMyLeg(wb, ctx) {
  if (!isMultiLegWaybill(wb)) return null
  return collectLegs(wb).find((l) => legMatchesMe(l, ctx)) || null
}

/* 腿的当前状态（没写过就是待接单）
   ⚠️ 兼容历史数据：这套「按趟记状态」上线前接的单，状态只落在**行级**；
      那时行级的 accept_by 记的就是第一个接单的人 —— 只把他的那条腿按行级状态算。 */
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

/* 腿的节点时间（没写过且这条腿还没开始 → null；历史数据回退到行级） */
function legTimeOf(leg, key, wb) {
  if (!leg) return (wb && wb[key]) || null
  const own = leg.item && leg.item[`leg_${key}`]
  if (own) return own
  if (legStatusOf(leg, wb) === LEG_TODO) return null
  return (wb && wb[key]) || null
}

/* ============================================================
   ⭐ 司机侧可执行动作（与 waybill-action / waybill-detail 保持同一套口径）
   ------------------------------------------------------------
   动作链由运单的 transport_mode 决定：
     极简：accept → finish
     详细：accept → confirmLoad → confirmDepart → confirmArrive → finish
   ⚠️ 子母车（一单多司机）时，这里要传**我这一趟的状态**，
      不能用运单行的聚合状态（别人接了不该把我也推进下一步）。
   ============================================================ */
const ACTION_STATES = {
  accept: ['待接单'],
  reject: ['待接单'],
  complete: ['待装车', '装车中', '装车完成', '已发车', '已到达'],
  confirmLoad: ['待装车', '装车中'],
  confirmDepart: ['装车完成', '装车中'],
  confirmArrive: ['已发车', '装车完成'],
  finish: ['待装车', '装车中', '装车完成', '已发车', '已到达'],
}

const ACTION_LABEL = {
  accept: '确认接单',
  reject: '拒单',
  confirmLoad: '装车完成',
  confirmDepart: '确认发车',
  confirmArrive: '确认到达',
  finish: '完成运单',
}

const ACTION_CHAIN = {
  极简: ['accept', 'finish'],
  详细: ['accept', 'confirmLoad', 'confirmDepart', 'confirmArrive', 'finish'],
}

/* 节点时间字段，用于判断哪个节点已完成 */
const ACTION_TIME_FIELD = {
  accept: 'accept_time',
  confirmLoad: 'load_end_time',
  confirmDepart: 'depart_time',
  confirmArrive: 'arrive_time',
  finish: 'finish_time',
}

function buildActions(wb) {
  const mode = String(wb.transport_mode || '详细').trim() === '极简' ? '极简' : '详细'
  const status = String(wb.status || '').trim()
  const actions = ACTION_CHAIN[mode].map((key) => ({
    key,
    label: ACTION_LABEL[key] || key,
    enabled: ACTION_STATES[key].includes(status),
    done: !!wb[ACTION_TIME_FIELD[key]],
  }))
  const primary = actions.find((a) => a.enabled && a.key !== 'finish') ||
    actions.find((a) => a.enabled) || null
  return {
    transport_mode: mode,
    actions,
    next_action: primary ? primary.key : '',
    next_action_label: primary ? primary.label : '',
  }
}

/* ============================================================
   ⭐ 常驻任务按组聚合（用户 2026-10-17 拍板）
   ------------------------------------------------------------
   一个 recurring_group_no = 一个常驻任务；一趟 = 组下的一条运单。
   小程序里「一个常驻任务一张卡」，所以要按组把趟次收在一起返回，
   **不再混进列表分页** —— 否则一个常驻任务跑久了，历史趟次会把 50 条的
   窗口占满，把别的当天任务挤出去。
   ⚠️ 这里只拿得到「我自己的」趟次（上游已经把别人的剔掉了）。
   ============================================================ */
const RECURRING_TRIPS_PER_GROUP = 100
const REC_TRIP_ACTIVE = ['待装车', '装车中', '装车完成', '已发车', '已到达']

function buildRecurringGroupsPayload(recMatched, toItem, headMap, headHitMap) {
  const bySeqDesc = (a, b) => (Number(b.wb.trip_seq) || 0) - (Number(a.wb.trip_seq) || 0)
  const map = new Map()
  for (const m of recMatched || []) {
    const g =
      String((m.wb && m.wb.recurring_group_no) || '').trim() || 'single-' + m.wb.id
    if (!map.has(g)) map.set(g, [])
    map.get(g).push(m)
  }

  const out = []
  map.forEach((entries, group_no) => {
    /* ⭐ 组级配置（常驻方式 / 上限 / 有效期 / 指派）一律取**组主** ——
       它是这个常驻任务的本体（Web 发布时落的那条），
       和 waybill-action 的 claimRecurring 查的是同一条，两边不会打架。
       ⚠️ 以前取「我的最新一趟」，同一组里趟次配置不一致时（Web「创建相同运单」
          续建到同组会改指派 / 常驻方式）界面显示和实际能接的规则会对不上。 */
    const head =
      (headMap && headMap.get(group_no)) || entries.slice().sort(bySeqDesc)[0].wb
    const headHit = (headHitMap && headHitMap.get(group_no)) || entries[0]

    /* ⭐ 只返回「我的」趟次（用户拍板：小程序只看自己的接单记录），
       但组的存在性由组主决定 —— 同事接走一趟之后，我这边不会连任务一起消失。 */
    const mineEntries = entries.filter((e) => !e.notMine).sort(bySeqDesc)
    const kept = mineEntries.slice(0, RECURRING_TRIPS_PER_GROUP)
    out.push({
      group_no,
      /* 发起人（建单时写入；老数据为空，前端回退「—」） */
      creator: String(head.creator || '').trim(),
      /* 装卸货点坐标与联系人：常驻详情页也要能「导航 / 打电话」 */
      pickup_lng: head.pickup_lng === null || head.pickup_lng === undefined ? null : Number(head.pickup_lng),
      pickup_lat: head.pickup_lat === null || head.pickup_lat === undefined ? null : Number(head.pickup_lat),
      delivery_lng:
        head.delivery_lng === null || head.delivery_lng === undefined ? null : Number(head.delivery_lng),
      delivery_lat:
        head.delivery_lat === null || head.delivery_lat === undefined ? null : Number(head.delivery_lat),
      pickup_contact: String(head.pickup_contact || '').trim(),
      pickup_phone: String(head.pickup_phone || '').trim(),
      delivery_contact: String(head.delivery_contact || '').trim(),
      delivery_phone: String(head.delivery_phone || '').trim(),
      task_name: head.task_name || '',
      pickup: head.pickup || '',
      delivery: head.delivery || '',
      assign_method: headHit.method,
      assign_target: headHit.target,
      recurring_type: String(head.recurring_type || 'time').trim(),
      /* 生效中 / 已暂停 / 已结束 —— Web 端可暂停、可结束（有趟次进行中时不允许） */
      recurring_status: String(head.recurring_status || '生效中').trim() || '生效中',
      recurring_start_time: head.recurring_start_time || null,
      recurring_end_time: head.recurring_end_time || null,
      recurring_max_count: Number(head.recurring_max_count || 0),
      /* 「全队已接」：组上的冗余计数由 waybill-action 每接一趟写一次，
         取组内最大值作为展示口径（真正的公共额度字段后续再补） */
      recurring_accepted_count: Math.max(
        0,
        ...entries.map((e) => Number(e.wb.recurring_accepted_count) || 0)
      ),
      trip_count: mineEntries.length,
      truncated: mineEntries.length > kept.length,
      /* 组里还有别人的趟次（我没接过 / 别人正在跑）—— 前端可据此提醒
         「这个任务我还没接过」，但**不会**泄露是谁接的 */
      hasOtherTrips: entries.length > mineEntries.length,
      trips: kept.map(toItem),
    })
  })

  /* 有「进行中 / 待接单」趟次的组排前面，其次按最近一趟的时间倒序 */
  const rank = (g) => {
    /* 已结束的常驻任务沉到最底（用户 2026-10-18：结束了就别再置顶）；
       已暂停排在生效中之后、已结束之前 */
    const rs = String(g.recurring_status || '生效中').trim()
    if (rs === '已结束') return -1
    if (rs === '已暂停') return 0
    if (g.hasOtherTrips) return 1
    return g.trips.some(
      (t) =>
        t.status === '待接单' ||
        REC_TRIP_ACTIVE.indexOf(String(t.status || '').trim()) > -1
    )
      ? 1
      : 0
  }
  const lastTs = (g) =>
    Math.max(...g.trips.map((t) => toMs(t.accept_time) || toMs(t.create_time) || 0), 0)

  out.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(b) - rank(a)
    return lastTs(b) - lastTs(a)
  })
  return out
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
    if (!account) return { code: 400, message: '未登录', list: [] }

    const page = Math.max(1, Number(event.page) || 1)
    const pageSize = Math.min(
      PAGE_SIZE_MAX,
      Math.max(1, Number(event.pageSize) || PAGE_SIZE_DEFAULT)
    )

    /* 1. 用户行：拿 phone（司机档案以手机号关联）与 owner_account（隔离口径） */
    const users = await queryTable(
      'users',
      `account=eq.${enc(account)}&select=account,phone,owner_account&limit=1`
    )
    const user = users[0]
    if (!user) {
      console.log(`waybill-list：${account} 无用户记录`)
      return { code: 0, message: 'ok', list: [], total: 0, hasMore: false }
    }

    /* 2. 司机档案 —— 口径与 login-by-account 对齐：phone = users.phone || account */
    const driverPhone = String(user.phone || '').trim() || account
    const drivers = await queryTable(
      'drivers',
      `phone=eq.${enc(driverPhone)}&select=driver_name,phone,org,org_id,bound_vehicle,customer_id&limit=1`
    )
    const driver = drivers[0]
    if (!driver) {
      console.log(`waybill-list：${account} 无司机档案（phone=${driverPhone}）`)
      return { code: 0, message: 'ok', list: [], total: 0, hasMore: false }
    }

    const driverName = String(driver.driver_name || '').trim()
    const myOrgName = String(driver.org || '').trim()
    const plates = splitPlates(driver.bound_vehicle)
    const customerId = String(driver.customer_id || '').trim()

    /* 3. 主账号（数据隔离口径） */
    const ownerAccount =
      String(user.owner_account || '').trim() || account

    /* 4. 我的机构 + 祖先机构名 */
    const orgNames = await loadOrgNameSet(ownerAccount, myOrgName)

    const ctx = {
      driverName,
      plates,
      orgNames,
      customerId,
      ownerAccount,
      adminSafe: null,
      adminAmbiguous: [],
    }
    console.log(
      `waybill-list：${account} 司机=${driverName} 车牌=${plates.join('/')} 机构=${myOrgName} 祖先=${orgNames.size} 主账号=${ownerAccount}`
    )

    /* 5. 拉候选运单：本客户的 + 管理员发布的（owner_account 为 null） + 时间窗。
         管理员单在这里不做名称过滤，交给后面的消歧守卫处理。 */
    const since = new Date(Date.now() - FETCH_DAYS * 86400000).toISOString()
    const rows = await queryTable(
      'waybills',
      `or=(owner_account.eq.${enc(ownerAccount)},owner_account.is.null)` +
        `&create_time=gte.${enc(since)}` +
        `&order=create_time.desc&limit=${FETCH_LIMIT}`
    )
    const adminCount = rows.filter((r) => !String((r && r.owner_account) || '').trim()).length
    console.log(`waybill-list：候选 ${rows.length} 条（其中管理员单 ${adminCount} 条）`)

    /* 5.1 只有真的出现管理员单，才构建一次消歧索引（避免无谓查询） */
    if (adminCount > 0) {
      ctx.adminSafe = await buildAdminSafeTargets(customerId, ownerAccount)
    }

    /* 6. 内存匹配
       ⭐ 顺带处理「已经被别人抢走」的情况：
          按车队/车辆指派时，组织下多个司机都能匹配到同一条运单。
          一旦 accept_by 有值且不是我，说明这趟被同事抢了：
            - 10 分钟内 → 仍然返回，标记 taken_by_other，前端灰显 + 倒计时
            - 超过 10 分钟 → 直接从列表移除
          ⚠️ 只告诉前端「被接了」，**绝不返回是谁接的**。 */
    const meNames = new Set([driverName, account].filter(Boolean))

    /* ⭐⭐ 常驻任务先按组分拢，再决定「这个任务要不要给这位司机看」：
       一个 recurring_group_no = 一个常驻任务，任务的**归属只看组主**
       （create_time 最早的那条，也就是 Web 发布时落的那条）。
       必须与 waybill-action 的 claimRecurring 口径一致 ——
       ⚠️ 以前这里写的是「组里任一条指派给我就出组」，而 claimRecurring 只查组主，
          结果是司机能看见这个任务、点「接一趟」却被 403「该常驻任务没有指派给你」
          （用户 2026-10-17 截图反馈的就是这个：lyn 因为组里有一条指派给
          「管理员名下车辆」机构的趟次而看到任务，组主却是指派给司机李亚楠的）。 */
    const recHead = new Map() // group_no → 组主（运单行）
    const recHeadHit = new Map() // group_no → { method, target }
    for (const wb of rows) {
      if (!wb || !wb.is_recurring) continue
      const oa = String(wb.owner_account || '').trim()
      if (oa && oa !== ownerAccount) continue // 别的客户的常驻单，整组都不看
      const g = String(wb.recurring_group_no || '').trim() || 'single-' + wb.id
      const cur = recHead.get(g)
      if (!cur || toMs(wb.create_time) < toMs(cur.create_time)) recHead.set(g, wb)
    }
    /* ⭐ 组主（trip_seq=1）被删了 → 剩下的趟次不能再凑成一个任务。
       用户 2026-10-18：管理端删了单，司机端任务中心还挂着 CZ202610170009。
       判据：整组没有任何一条 trip_seq=1 的行，就当作任务已删除，整组不展示。 */
    const headSeqSet = new Set()
    for (const wb of rows) {
      if (!wb || !wb.is_recurring) continue
      if (Number(wb.trip_seq) === 1) {
        headSeqSet.add(String(wb.recurring_group_no || '').trim() || 'single-' + wb.id)
      }
    }
    recHeadHit.forEach((_, g) => {
      if (!headSeqSet.has(g)) recHeadHit.delete(g)
    })

    recHead.forEach((head, g) => {
      if (!headSeqSet.has(g)) return
      const hit = matchWaybill(head, ctx)
      if (hit) recHeadHit.set(g, hit)
      else {
        console.log(
          `waybill-list：常驻 ${g} 的组主没指派给我（trip_seq=${head.trip_seq}），整组不展示`
        )
      }
    })

    const matched = []
    for (const wb of rows) {
      if (EXCLUDE_STATUS.includes(String(wb.status || '').trim())) continue

      /* ⭐ 常驻趟次：整组的存在性由组主决定；组里的**所有**趟次都要收进来
         （`trips` 只留给我的，`hasOtherTrips` 用来提示"这个任务我还没接过"），
         这样组级配置 / 趟次统计和 claimRecurring 用的是同一份数据。
         ⚠️ 只收「匹配到我」的趟次会让 head 与统计漂移：组主是别人的、我只接过一趟时，
            旧写法会把我的那趟当成组主，组级配置跟着错。 */
      if (wb.is_recurring) {
        const g =
          String(wb.recurring_group_no || '').trim() || 'single-' + wb.id
        const hit = recHeadHit.get(g)
        if (!hit) continue
        const acceptBy = String(wb.accept_by || '').trim()
        matched.push({
          wb,
          method: hit.method,
          target: hit.target,
          taken: false,
          takenExpireAt: null,
          notMine: !(!acceptBy || meNames.has(acceptBy)),
        })
        continue
      }

      const hit = matchWaybill(wb, ctx)
      if (!hit) continue

      /* ⭐ 子母车（一单多司机/多车）：我这一趟单独算，
         **不进「被他人抢占」那套** —— 同行上别人的 accept_by 跟我没关系，
         我也永远不会被别人抢走（每个人只跑自己那份）。 */
      if (isMultiLegWaybill(wb)) {
        matched.push({
          wb,
          method: hit.method,
          target: hit.target,
          taken: false,
          takenExpireAt: null,
          leg: findMyLeg(wb, ctx),
        })
        continue
      }

      const acceptBy = String(wb.accept_by || '').trim()
      const mine = !acceptBy || meNames.has(acceptBy)

      let taken = false
      let takenExpireAt = null
      if (acceptBy && !meNames.has(acceptBy)) {
        const at = toMs(wb.accept_time)
        const expireAt = at + TAKEN_WINDOW_MIN * 60000
        if (!at || expireAt <= Date.now()) continue // 抢走超过窗口 → 不再展示
        taken = true
        takenExpireAt = new Date(expireAt).toISOString()
      }

      matched.push({ wb, method: hit.method, target: hit.target, taken, takenExpireAt })
    }
    console.log(
      `waybill-list：命中 ${matched.length} 条` +
        (matched.filter((m) => m.taken).length
          ? `（其中 ${matched.filter((m) => m.taken).length} 条已被他人承接）`
          : '')
    )
    if (ctx.adminAmbiguous.length) {
      console.warn(
        `waybill-list：${account} 有 ${ctx.adminAmbiguous.length} 个管理员单目标因跨客户重名无法认领：` +
          [...new Set(ctx.adminAmbiguous)].join(', ')
      )
    }

    /* ⭐⭐ 常驻趟次与普通运单**分开处理**：
       常驻按组聚合返回（recurring_groups），不再混进列表分页 ——
       否则一个常驻任务跑久了，历史趟次会把列表窗口占满、把别的当天任务挤出去。 */
    const recMatched = matched.filter((m) => m.wb.is_recurring)
    const normalMatched = matched.filter((m) => !m.wb.is_recurring)

    /* 7. 普通运单按计划装货时间倒序（无时间的排最后） */
    normalMatched.sort((a, b) => toMs(b.wb.pickup_time) - toMs(a.wb.pickup_time))

    /* 8. 分页（只分普通运单） */
    const total = normalMatched.length
    const start = (page - 1) * pageSize
    const slice = normalMatched.slice(start, start + pageSize)

    /* 9. 映射为前端视图模型（常驻趟次与普通运单共用同一个 mapper）
       ⭐ 子母车：状态 / 车牌 / 各节点时间 / 承运数量 一律按**我这一趟**给，
          同时用 leg_* / total_* 把「这是子母车、共几趟、我第几趟」带出去。 */
    const toItem = ({ wb, method, target, taken, takenExpireAt, leg }) => {
      const legs = leg ? collectLegs(wb) : []
      const legStatus = leg ? legStatusOf(leg, wb) : ''
      const legVehicle = leg
        ? (leg.item.leg_vehicle ||
            (leg.method === 'vehicle' ? leg.target : '') ||
            (ctx.plates.length === 1 ? ctx.plates[0] : ''))
        : ''
      const legCarry = leg
        ? Number(leg.item.carryQuantity || 0)
        : Number(wb.carry_quantity || 0)
      const totalCarry = legs.length
        ? legs.reduce((s, l) => s + (Number(l.item.carryQuantity) || 0), 0)
        : Number(wb.carry_quantity || 0)
      /* 动作链要用「我这一趟的状态」推，不能用行级聚合状态 */
      const view = leg
        ? {
            ...wb,
            status: legStatus,
            accept_time: legTimeOf(leg, 'accept_time', wb),
            load_end_time: legTimeOf(leg, 'load_end_time', wb),
            depart_time: legTimeOf(leg, 'depart_time', wb),
            arrive_time: legTimeOf(leg, 'arrive_time', wb),
            finish_time: legTimeOf(leg, 'finish_time', wb),
          }
        : wb

      return {
        id: wb.id,
        waybill_no: wb.waybill_no || '',
        status: leg ? legStatus : wb.status || '',
        task_name: wb.task_name || '',
        receive_no: wb.receive_no || '',
        pickup: wb.pickup || '',
        delivery: wb.delivery || '',
        pickup_time: wb.pickup_time || null,
        plan_time: wb.plan_time || null,
        vehicle: leg ? legVehicle : resolvePlate(wb, ctx),
        cargo: wb.cargo || '',
        quantity: wb.quantity === null || wb.quantity === undefined ? 0 : wb.quantity,
        freight: wb.freight === null || wb.freight === undefined ? 0 : wb.freight,
        carry_quantity: legCarry,
        create_time: wb.create_time || null,
        accept_time: leg ? legTimeOf(leg, 'accept_time', wb) : wb.accept_time || null,
        finish_time: leg ? legTimeOf(leg, 'finish_time', wb) : wb.finish_time || null,
        /* 这条是「怎么派给我的」，前端可用来展示来源 */
        assign_method: method,
        assign_target: target,
        /* ⭐ 运输节点模式与当前可执行动作 */
        ...buildActions(view),
        /* ⭐ 常驻任务（前端据此置顶 + 高亮） */
        is_recurring: !!wb.is_recurring,
        recurring_group_no: wb.recurring_group_no || '',
        recurring_type: wb.recurring_type || '',
        recurring_start_time: wb.recurring_start_time || null,
        recurring_end_time: wb.recurring_end_time || null,
        recurring_max_count: Number(wb.recurring_max_count || 0),
        recurring_accepted_count: Number(wb.recurring_accepted_count || 0),
        recurring_status: wb.recurring_status || '',
        trip_seq: Number(wb.trip_seq || 0),
        /* ⭐ 子母车（一单多司机/多车） */
        multi_leg: !!leg,
        leg_count: legs.length || 1,
        leg_index: leg ? legs.findIndex((l) => l.item === leg.item) + 1 : 1,
        leg_done: legs.filter((l) => legStatusOf(l, wb) === '已完成').length,
        total_carry_quantity: totalCarry,
        /* ⭐ 打卡开关（详细模式下装车/到达需围栏内打卡） */
        check_in_required: wb.check_in_required !== false,
        /* ⭐ 已被他人承接：10 分钟窗口内灰显，超时已在上游剔除 */
        taken_by_other: !!taken,
        taken_expire_at: takenExpireAt,
      }
    }

    const list = slice.map(toItem)

    /* 10. ⭐ 常驻任务按组聚合（不受分页影响，每组最多带 RECURRING_TRIPS_PER_GROUP 趟） */
    const recurring_groups = buildRecurringGroupsPayload(
      recMatched,
      toItem,
      recHead,
      recHeadHit
    )
    console.log(
      `waybill-list：常驻任务 ${recurring_groups.length} 个 / 趟次 ${recMatched.length} 条`
    )

    return {
      code: 0,
      message: 'ok',
      list,
      total,
      hasMore: start + pageSize < total,
      recurring_groups,
      driver: { driver_name: driverName, org: myOrgName, plates },
    }
  } catch (e) {
    console.error('waybill-list error:', e && (e.stack || e.message || e))
    return {
      code: 500,
      message: '服务异常：' + (e && e.message ? e.message : '未知'),
      list: [],
    }
  }
}

/* ============================================================
   已知限制
   ------------------------------------------------------------
   1. 采用「拉候选 → 内存过滤 → 分页」的方案：因为匹配依赖 assignments(JSON)，
      无法用一条 PostgREST 查询表达。窗口为近 90 天 / 最多 300 条。
      若某客户运单量很大导致漏单，建议 Web 端发布时把匹配结果**反范式化**写入
      一个 assigned_drivers 字段（逗号分隔司机姓名），届时这里改成
      `or=(assigned_drivers.ilike.*我*,assigned_orgs.ilike.*我的机构*)` 即可。
   2. 组织树查询限制 500 条，机构极多的客户需要改成分页拉取。
   3. 管理员发布的运单（owner_account 为 null）靠「名称」认领，跨客户重名时
      无法判断归属，会保守地不派给任何人，并在日志里打 warn。
      根治办法是 Web 端发布时把目标反范式化成 id（或直接把 owner_account
      写成目标所属客户），届时报文里就不需要名称消歧了。
   ============================================================ */
