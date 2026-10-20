/**
 * 云函数：waybill-admin
 * ============================================================
 * 作用：小程序「管理端」取数 —— 全站运单列表（按装货日期分天）+ 概览统计。
 * 调用：wx.cloud.callFunction({ name: 'waybill-admin', data: { account, action, date, status, keyword } })
 *
 * 口径（与 Web 端保持一致）：
 *   · 谁能调：users.role_id 非空（管理员 / 员工）。司机账号一律 403。
 *   · 看多少：主管理员（owner_account 为空）不过滤；子账号按 owner_account 收窄，
 *             并且要带上「管理员发布的单」（owner_account 为 null，和 waybill-list 同口径）。
 *   · 日期：按 **计划装货时间 pickup_time** 分天（用户 2026-10-17 拍板）。
 *           没填装货时间的单归到「未排期」，单独返回。
 *
 * ⭐ 为什么把状态筛选 / 关键字放在内存里做：
 *   同一屏要「列表 + 各状态计数」，走 SQL 筛就只能拿到一份列表、拿不到全量计数。
 *   一天的量很小（limit 200），一次取回本地筛更省往返，也不会出现「计数和列表不一致」。
 *
 * 运行时：Node.js 18.15（只用内置 fetch，无 npm 依赖）
 * 环境变量：无
 */

const { randomUUID } = require('crypto')

const API_BASE = 'https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com'
const DEVICE_ID = randomUUID()

/* 单日取数上限（一天 200 单已经远超实际） */
const DAY_LIMIT = 200
/* 待派清单上限（车辆页「派单给这辆」用） */
const PENDING_LIMIT = 100

/* 「执行中」口径（用于概览的在途数、车辆的占用判定） */
const RUNNING_STATUS = ['待装车', '装车中', '装车完成', '已发车', '已到达']

/* 删除闸门（与 Web Waybill.vue 的 DELETE_ALLOWED_STATUS 一致）：
   待接单 = 还没跑；已完成 / 已取消 = 闭环；待重新指派 = 司机拒单等同作废。
   执行中（待装车~已到达）删掉会让司机占用闸门、围栏打卡、费用上报全部对不上号 → 一律不许删。 */
const DELETE_ALLOWED_STATUS = ['待接单', '已完成', '已取消', '待重新指派']

/* 列表要带回来的字段（够卡片 + 多趟明细用） */
const LIST_FIELDS = [
  'id',
  'waybill_no',
  'task_name',
  'status',
  'pickup',
  'delivery',
  'pickup_time',
  'plan_time',
  'cargo',
  'quantity',
  'freight',
  'vehicle',
  'driver',
  'assignments',
  'is_recurring',
  'recurring_group_no',
  'recurring_status',
  'create_time',
  'owner_account',
  'receive_no',
].join(',')

/* ============================================================
   基础工具（与其它云函数同一套写法：token 记过期 + 401 重试）
   ============================================================ */
const enc = encodeURIComponent

/* waybills.id 是 bigint（不是 uuid）：非数字 id 直接挡掉，别让 PostgREST 的 400 变成 500 抛给前端 */
const isBadId = (id) => !/^\d+$/.test(String(id || ''))

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

/* ---------- 指派解析（key 是 method，不是 assignMethod） ---------- */
const readAssignMethod = (a) =>
  String((a && (a.method || a.assignMethod)) || '').trim()

const parseAssignments = (raw) => {
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

/* 从 assignments 里取车牌（多趟 / 多车都摊平；排除「N辆 / 多种」这种汇总文案） */
const platesOfWaybill = (wb) => {
  const out = []
  parseAssignments(wb && wb.assignments).forEach((a) => {
    if (readAssignMethod(a) !== 'vehicle') return
    ;(a.items || []).forEach((it) => {
      const t = String((it && it.target) || '').trim()
      if (t) out.push(t)
    })
  })
  const direct = String((wb && wb.vehicle) || '').trim()
  if (direct && !/辆|多种|^--$/.test(direct)) out.push(direct)
  return out
}

/* 从 assignments 里取司机姓名（排除「N人 / 多种」这种汇总文案） */
const driversOfWaybill = (wb) => {
  const out = []
  parseAssignments(wb && wb.assignments).forEach((a) => {
    if (readAssignMethod(a) !== 'driver') return
    ;(a.items || []).forEach((it) => {
      const t = String((it && it.target) || '').trim()
      if (t) out.push(t)
    })
  })
  const direct = String((wb && wb.driver) || '').trim()
  if (direct && !/人|多种|^--$/.test(direct)) out.push(direct)
  return out
}

/* 日期工具：按 +08:00 的「自然日」返回 [当天 00:00, 次日 00:00) 的**带时区** ISO 串。
   ⚠️ 管理端现在按「发单日期」分天（`create_time`，timestamptz），比较值必须带偏移，
      写成不带时区的裸串会被数据库当 UTC 解释 → 整天差 8 小时、单子跑到前一天去。 */
const dayRange = (ymd) => {
  const s = String(ymd || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const start = new Date(`${s}T00:00:00+08:00`)
  if (isNaN(start.getTime())) return null
  const end = new Date(start.getTime() + 86400000)
  const toTz = (d) => d.toISOString().replace(/\.\d+Z$/, '+00:00')
  return { start: toTz(start), end: toTz(end) }
}

const todayYmd = () => {
  const d = new Date(Date.now() + 8 * 3600000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

/* ============================================================
   取数
   ============================================================ */
/* ⭐ 管理端按「**发单日期**」取一天的单（`create_time`，用户 2026-10-18 拍板）：
   派单的人关心「我今天发了哪些单」；计划装货时间只作为卡片上的信息显示，
   不再决定这张单落在日期条的哪一天。
   按发单日期分组后「未排期」这个概念就不存在了（每张单都有 create_time），
   字段保留成空数组只为兼容旧调用方。 */
async function fetchByDate(date) {
  const r = dayRange(date)
  if (!r) return { list: [], unscheduled: [] }

  const dated = await queryTable(
    'waybills',
    `select=${LIST_FIELDS}` +
      `&create_time=gte.${enc(r.start)}&create_time=lt.${enc(r.end)}` +
      `&order=create_time.desc&limit=${DAY_LIMIT}`
  )
  return { list: dated || [], unscheduled: [] }
}

/* 归属过滤：主管理员看全部；子账号看「自己客户的 + 管理员发布的」 */
const makeScope = (user, account) => {
  const owner = String((user && user.owner_account) || '').trim()
  if (!owner) return () => true // 主管理员：不过滤
  return (row) => {
    const oa = String((row && row.owner_account) || '').trim()
    return !oa || oa === owner || oa === account
  }
}

const countByStatus = (rows) => {
  const by = {}
  rows.forEach((r) => {
    const s = String((r && r.status) || '').trim() || '未知'
    by[s] = (by[s] || 0) + 1
  })
  return by
}

/* ============================================================
   写库（POST / PATCH）—— 只有 save / assign 用
   ============================================================ */
async function writeTable(method, table, query, body) {
  const url = `${API_BASE}/v1/rdb/rest/${table}${query ? '?' + query : ''}`
  const doFetch = async (token) => {
    const headers = {
      Authorization: `Bearer ${token}`,
      'x-device-id': DEVICE_ID,
      Accept: 'application/json',
      'Accept-Profile': 'public',
      'Content-Profile': 'public',
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    }
    return fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
  }
  let res = await doFetch(await getToken())
  if (res.status === 401) res = await doFetch(await getToken(true))
  const text = await res.text()
  if (!res.ok) {
    const err = new Error(`${method} ${table} 失败 HTTP ${res.status}: ${text.slice(0, 200)}`)
    err.body = text
    throw err
  }
  if (!text) return []
  try {
    const json = JSON.parse(text)
    return Array.isArray(json) ? json : [json]
  } catch (e) {
    return []
  }
}

/* 运单号：YD + yyyyMMdd + 4 位当日序号 */
async function nextWaybillSeqs(n) {
  const d = new Date(Date.now() + 8 * 3600000)
  const p2 = (x) => String(x).padStart(2, '0')
  const ymd = `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`
  let maxSeq = 0
  try {
    const rows = await queryTable(
      'waybills',
      `select=waybill_no&waybill_no=like.${enc('YD' + ymd)}*&order=waybill_no.desc&limit=1`
    )
    if (rows[0]) {
      const m = String(rows[0].waybill_no || '').match(/(\d{4})$/)
      if (m) maxSeq = parseInt(m[1], 10) || 0
    }
  } catch (e) {
    console.warn('nextWaybillSeqs：取当日最大号失败，从 1 开始', e.message)
  }
  return Array.from({ length: n }, (_, i) => `YD${ymd}${String(maxSeq + i + 1).padStart(4, '0')}`)
}

const appendLog = (wb, entry) => {
  const cur = Array.isArray(wb && wb.status_log) ? wb.status_log.slice() : []
  cur.push(entry)
  return cur.slice(-100)
}

/* 承运量/运费两条腿 → 行级汇总字段（与 Web 落库口径一致） */
function summarizeAssign(assigns) {
  const methods = new Set()
  let vehicle = ''
  let driver = ''
  let carry = 0
  const orgNames = []
  assigns.forEach((a) => {
    methods.add(a.method)
    ;(a.items || []).forEach((it) => {
      carry += Number(it.carryQuantity || 0)
      const t = String(it.target || '').trim()
      if (a.method === 'vehicle') vehicle = vehicle ? vehicle : t
      if (a.method === 'driver') driver = driver ? driver : t
      if (a.method === 'team') orgNames.push(t)
    })
  })
  const vehicleCount = assigns.reduce(
    (n, a) => n + (a.method === 'vehicle' ? (a.items || []).length : 0),
    0
  )
  const driverCount = assigns.reduce(
    (n, a) => n + (a.method === 'driver' ? (a.items || []).length : 0),
    0
  )
  return {
    vehicle: vehicleCount > 1 ? `${vehicleCount}辆` : vehicle,
    driver: driverCount > 1 ? `${driverCount}人` : driver,
    carry_quantity: Number(carry.toFixed(2)),
    assigned_orgs: orgNames.filter(Boolean).join('、'),
    mixed: methods.size > 1,
  }
}

/* ============================================================
   动作：list
   ============================================================ */
async function actionList(event, user, account) {
  const date = String(event.date || '').trim() || todayYmd()
  const status = String(event.status || '').trim()
  const keyword = String(event.keyword || '').trim().toLowerCase()
  const inScope = makeScope(user, account)

  const { list } = await fetchByDate(date)
  const scopedAll = list.filter(inScope)
  /* ⭐ 常驻任务：一个组在列表里只占一行（组主 trip_seq=1）。
     司机每接一趟都会新建一条趟次，列表里不该跟着长出多条 —— 趟次进度看详情「物流状态」。
     Web 端也同样处理（用户 2026-10-18 拍板）。 */
  const scoped = scopedAll.filter((r) => !(r.is_recurring && Number(r.trip_seq || 1) > 1))

  /* 计数：给状态胶囊用（在「状态/关键字筛选之前」算，才是各状态的全量） */
  const counts = { all: scoped.length, byStatus: countByStatus(scoped) }

  let rows = scoped
  if (status && status !== '全部') {
    rows = rows.filter((r) => String(r.status || '').trim() === status)
  }
  if (keyword) {
    rows = rows.filter((r) =>
      [r.waybill_no, r.receive_no, r.vehicle, r.driver, r.task_name, r.pickup, r.delivery]
        .map((v) => String(v || '').toLowerCase())
        .join(' ')
        .includes(keyword)
    )
  }

  console.log(
    `waybill-admin.list：${account} ${date}（按发单日期）命中 ${rows.length}/${scoped.length}`
  )

  return {
    code: 0,
    date,
    list: rows,
    /* 按发单日期分天后没有「未排期」了；字段留着给老版本前端兜底 */
    unscheduled: { count: 0, list: [] },
    counts,
  }
}

/* ============================================================
   动作：stats（概览）
   ------------------------------------------------------------
   一次算好：今日单量 / 待接 / 在途 / 完成 / 待指派 / 运力（有任务·空闲）
   ============================================================ */
async function actionStats(event, user, account) {
  const date = String(event.date || '').trim() || todayYmd()
  const inScope = makeScope(user, account)
  const owner = String((user && user.owner_account) || '').trim() || account

  const { list } = await fetchByDate(date)
  const scopedAll = list.filter(inScope)
  /* ⭐ 常驻任务：一个组在列表里只占一行（组主 trip_seq=1）。
     司机每接一趟都会新建一条趟次，列表里不该跟着长出多条 —— 趟次进度看详情「物流状态」。
     Web 端也同样处理（用户 2026-10-18 拍板）。 */
  const scoped = scopedAll.filter((r) => !(r.is_recurring && Number(r.trip_seq || 1) > 1))
  const byStatus = countByStatus(scoped)

  const today = {
    total: scoped.length,
    todo: byStatus['待接单'] || 0,
    running: RUNNING_STATUS.reduce((n, s) => n + (byStatus[s] || 0), 0),
    done: byStatus['已完成'] || 0,
    pending: 0, // 待重新指派（跨日期查，见下）
  }

  /* 待重新指派：不限日期（这种单都在等人管，不能因为日期切换就看不见） */
  let reassign = []
  try {
    reassign = await queryTable(
      'waybills',
      `select=id,owner_account,pickup_time&status=eq.${enc('待重新指派')}&order=create_time.desc&limit=100`
    )
  } catch (e) {
    console.warn('waybill-admin.stats：待重新指派查询失败', e.message)
  }
  today.pending = reassign.filter(inScope).length

  /* ---------- 运力：车辆 / 司机 / 车队 三个视角都要的明细 ---------- */
  const power = {
    total: 0,
    busy: 0,
    idle: 0,
    vehicles: [], // [{ plate, org, busy }]
    drivers: [], // [{ name, org, plate, busy }]
    fleets: [], // [{ name, total, busy, idle }]
    usedBy: [],
  }
  try {
    /* 客户 ID：和 vehicle-list 一样用 customers.phone = 主账号 反查 */
    const customers = await queryTable(
      'customers',
      `phone=eq.${enc(owner)}&select=id&limit=1`
    )
    const customerId = customers[0] && customers[0].id
    /* 主管理员（owner_account 为空）没有对应客户行 → 不加客户过滤，看全部车辆 */
    if (customerId || !String((user && user.owner_account) || '').trim()) {
      const vehQuery =
        `select=plate,org,org_id` +
        (customerId ? `&customer_id=eq.${enc(customerId)}` : '') +
        (customerId && user.org_id !== null && user.org_id !== undefined
          ? `&org_id=eq.${enc(user.org_id)}`
          : '') +
        `&limit=500`
      const vehicles = await queryTable('vehicles', vehQuery)
      const rows = vehicles.filter((v) => String(v.plate || '').trim())
      const plates = rows.map((v) => String(v.plate || '').trim())
      power.total = plates.length

      /* 在途运单占用了哪些车 / 哪些司机（不限日期：正在跑的单不该因为切日期而释放） */
      const running = await queryTable(
        'waybills',
        `select=id,assignments,vehicle,driver,owner_account,waybill_no,pickup,delivery&status=in.(${RUNNING_STATUS.map(
          (s) => `"${s}"`
        ).join(',')})&limit=300`
      )
      const busyPlates = new Set()
      const busyDrivers = new Set()
      /* 车牌 → 当前运单（车辆卡要显示「当前任务」） */
      const busyInfo = new Map()
      running.filter(inScope).forEach((wb) => {
        platesOfWaybill(wb).forEach((p) => {
          busyPlates.add(p)
          if (!busyInfo.has(p)) {
            busyInfo.set(p, {
              id: wb.id,
              no: String(wb.waybill_no || '').trim(),
              route: [String(wb.pickup || '').trim(), String(wb.delivery || '').trim()]
                .filter(Boolean)
                .join(' → '),
            })
          }
        })
        driversOfWaybill(wb).forEach((n) => busyDrivers.add(n))
      })

      const plateSet = new Set(plates)
      power.usedBy = plates.filter((p) => busyPlates.has(p))
      power.busy = power.usedBy.length
      power.idle = Math.max(0, power.total - power.busy)
      /* 占用了但不是自己车队的车牌，也一并算上（避免「有任务 1 辆」但列表里找不到） */
      Array.from(busyPlates).forEach((p) => {
        if (!plateSet.has(p)) power.usedBy.push(p)
      })

      power.vehicles = rows
        .map((v) => {
          const plate = String(v.plate || '').trim()
          const info = busyInfo.get(plate)
          return {
            plate,
            org: String(v.org || '').trim() || '未归属车队',
            busy: busyPlates.has(plate),
            waybill_id: info ? info.id : '',
            waybill_no: info ? info.no : '',
            waybill_route: info ? info.route : '',
          }
        })
        .sort((a, b) => Number(b.busy) - Number(a.busy) || a.plate.localeCompare(b.plate))

      /* ---------- 司机视角：drivers 表 + 是否被在途运单占用 ---------- */
      try {
        /* ⚠️ drivers 表的 org_id 实测大量为 null（只有 org 名称），
           所以这里**只按 customer_id 过滤**，不要叠 org_id，否则一个司机都查不出来 */
        const drvQuery =
          `select=driver_name,org,org_id,bound_vehicle,customer_id` +
          (customerId ? `&customer_id=eq.${enc(customerId)}` : '') +
          `&limit=500`
        const drivers = await queryTable('drivers', drvQuery)
        power.drivers = drivers
          .map((d) => {
            const name = String(d.driver_name || '').trim()
            const plate = String(d.bound_vehicle || '').split(/[,，、;；\s]+/).filter(Boolean)[0] || ''
            return {
              name,
              org: String(d.org || '').trim() || '未归属车队',
              plate,
              busy: busyDrivers.has(name) || (plate && busyPlates.has(plate)),
            }
          })
          .filter((d) => d.name)
          .sort((a, b) => Number(b.busy) - Number(a.busy) || a.name.localeCompare(b.name))
      } catch (e) {
        console.warn('waybill-admin.stats：司机查询失败', e.message)
      }

      /* ---------- 车队视角：按 vehicles.org 归组 ---------- */
      const fleetMap = new Map()
      power.vehicles.forEach((v) => {
        const key = v.org || '未归属车队'
        const cur = fleetMap.get(key) || { name: key, total: 0, busy: 0, idle: 0 }
        cur.total += 1
        if (v.busy) cur.busy += 1
        else cur.idle += 1
        fleetMap.set(key, cur)
      })
      power.fleets = Array.from(fleetMap.values()).sort(
        (a, b) => b.total - a.total || a.name.localeCompare(b.name)
      )
    }
  } catch (e) {
    console.warn('waybill-admin.stats：运力统计失败（不影响其它数字）', e.message)
  }

  return { code: 0, date, today, power }
}

/* ============================================================
   动作：save（新建运单，支持一次多个任务 → 生成多张运单）
   ------------------------------------------------------------
   tasks[] 每个任务 = 一张运单（与 Web 的 doPublish 同口径：
   Web 的「＋添加任务」就是 forEach 逐任务生成记录再批量 insert）

   ⭐ 带 id 时 = **编辑**（见 actionSaveEdit）：只改一张、只允许 待接单/待重新指派。
   ============================================================ */
/* 单个任务的校验（新建 / 编辑共用；文案带任务序号） */
function validateTaskInput(t, idx) {
  const src = t || {}
  if (!String(src.pickup || '').trim()) return `任务${idx}：请选择装货地`
  if (!String(src.delivery || '').trim()) return `任务${idx}：请选择卸货地`

  const cargos = (Array.isArray(src.cargos) ? src.cargos : []).filter((c) =>
    String((c && c.name) || '').trim()
  )
  if (!cargos.length) return `任务${idx}：至少填一项货物`

  const assigns = (Array.isArray(src.assigns) ? src.assigns : []).filter(
    (a) => a && (a.items || []).length
  )
  if (!assigns.length) return `任务${idx}：请至少指派一个承运人`

  for (const a of assigns) {
    const m = String(a.method || '').trim()
    if (!['driver', 'vehicle', 'team'].includes(m)) return `任务${idx}：指派方式不合法`
    for (const it of a.items) {
      if (!String((it && it.target) || '').trim()) return `任务${idx}：有承运人没选`
    }
  }

  /* 承运量之和 = 货物总量（Web 同一条闸门，误差 0.01） */
  const qty = cargos.reduce((n, c) => n + Number(c.quantity || 0), 0)
  const carry = assigns.reduce(
    (n, a) => n + (a.items || []).reduce((m, it) => m + Number(it.carryQuantity || 0), 0),
    0
  )
  if (qty > 0 && Math.abs(Number(carry.toFixed(2)) - Number(qty.toFixed(2))) > 0.01) {
    return `任务${idx}：承运量合计 ${Number(carry.toFixed(2))} 吨，与货物总量 ${Number(
      qty.toFixed(2)
    )} 吨不一致`
  }
  return ''
}

/* 常驻组号：CZ + yyyyMMdd + 4 位随机（和 Web 发布同前缀，长度一致便于识别） */
function makeGroupNo(now) {
  const d = now || new Date()
  const p2 = (x) => String(x).padStart(2, '0')
  const day = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`
  const rnd = String(Math.floor(Math.random() * 9000) + 1000)
  return `CZ${day}${rnd}`
}

/* 表里有没有 creator 列（没加之前不能写，否则整条 insert 会报 42703） */
let _hasCreator = null
/* 装卸货联系人这 4 列同理：没加就不能写 */
let _hasContact = null
async function hasContactColumns() {
  if (_hasContact !== null) return _hasContact
  try {
    await queryTable('waybills', 'select=pickup_contact&limit=1')
    _hasContact = true
  } catch (e) {
    _hasContact = false
    console.warn('waybills 暂无 pickup_contact 列，联系人/电话将不落库')
  }
  return _hasContact
}

/* 建单只带了围栏「名称」，导航需要经纬度 → 按名称去 ele_fences 反查中心点 */
async function fenceCoords(names) {
  const out = new Map()
  const list = [...new Set((names || []).map((n) => String(n || '').trim()).filter(Boolean))]
  if (!list.length) return out
  try {
    const inList = list.map((n) => `"${n.replace(/"/g, '')}"`).join(',')
    const rows = await queryTable('ele_fences', `select=name,center&name=in.(${inList})&limit=200`)
    ;(rows || []).forEach((r) => {
      const parts = String(r.center || '').split(',').map(Number)
      const name = String(r.name || '').trim()
      if (name && parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
        out.set(name, { lng: parts[0], lat: parts[1] })
      }
    })
  } catch (e) {
    console.warn('围栏坐标反查失败:', e.message)
  }
  return out
}

async function hasCreatorColumn() {
  if (_hasCreator !== null) return _hasCreator
  try {
    await queryTable('waybills', 'select=creator&limit=1')
    _hasCreator = true
  } catch (e) {
    _hasCreator = false
    console.warn('waybills 暂无 creator 列，发起人将回退到账号口径')
  }
  return _hasCreator
}

async function actionSave(event, user, account) {
  /* 带 id = 编辑（前端「编辑」进来会带上运单 id） */
  if (String((event && event.id) || '').trim()) {
    return await actionSaveEdit(event, user, account)
  }

  const tasks = Array.isArray(event.tasks) ? event.tasks : []
  if (!tasks.length) return { code: 400, message: '至少填一个任务' }

  const owner = String((user && user.owner_account) || '').trim()

  /* ---------- 1. 全量校验（先校验完再写，避免写一半） ---------- */
  for (let i = 0; i < tasks.length; i++) {
    const msg = validateTaskInput(tasks[i], i + 1)
    if (msg) return { code: 400, message: msg }
  }

  /* ---------- 2. 逐任务落库 ---------- */
  /* 发起人：谁点的保存就记谁（姓名 + 账号），司机端「指派人」直接用它 */
  const canWriteCreator = await hasCreatorColumn()
  const canWriteContact = await hasContactColumns()
  const creatorName =
    String((user && (user.name || user.nickname)) || '').trim() || String(account || '').trim()
  const creatorAccount = String(account || '').trim()

  /* 先把这一批任务里用到的围栏名一次性换成坐标 */
  const coordMap = await fenceCoords(
    tasks.flatMap((t) => [t && t.pickup, t && t.delivery])
  )

  const seqs = await nextWaybillSeqs(tasks.length)
  const nowIso = new Date().toISOString()
  const created = []
  const failed = []

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i] || {}
    const cargos = (t.cargos || []).filter((c) => String((c && c.name) || '').trim())
    const assigns = (t.assigns || [])
      .filter((a) => a && (a.items || []).length)
      .map((a) => ({
        method: String(a.method || '').trim(),
        items: (a.items || []).map((it) => ({
          target: String(it.target || '').trim(),
          carryQuantity: Number(it.carryQuantity || 0),
          carryFreight: Number(it.carryFreight || 0),
        })),
      }))

    const sum = summarizeAssign(assigns)
    const transportMode = String(t.transportMode || '').trim() === '详细' ? '详细' : '极简'

    const record = {
      waybill_no: seqs[i],
      task_name: String(t.name || '').trim() || `任务${i + 1}`,
      pickup: String(t.pickup || '').trim(),
      delivery: String(t.delivery || '').trim(),
      /* 起终点坐标：司机端「导航」要用（原来一直空 → 点导航提示没有坐标） */
      pickup_lng: (coordMap.get(String(t.pickup || '').trim()) || {}).lng ?? null,
      pickup_lat: (coordMap.get(String(t.pickup || '').trim()) || {}).lat ?? null,
      delivery_lng: (coordMap.get(String(t.delivery || '').trim()) || {}).lng ?? null,
      delivery_lat: (coordMap.get(String(t.delivery || '').trim()) || {}).lat ?? null,
      pickup_time: t.pickupTime || null,
      plan_time: t.planTime || null,
      cargo: cargos.map((c) => String(c.name).trim()).join('、'),
      quantity: Number(cargos.reduce((n, c) => n + Number(c.quantity || 0), 0).toFixed(2)),
      freight: Number(cargos.reduce((n, c) => n + Number(c.freight || 0), 0).toFixed(2)),
      remaining: 0,
      receive_no: `RC${Date.now().toString().slice(-6)}${String(
        Math.floor(Math.random() * 900) + 100
      )}`,
      source: '手动',
      create_time: nowIso,
      status: '待接单',
      /* 常驻任务（管理端也能建）：类型 / 有效期 / 次数，其余字段与普通单一致，
         司机端靠 is_recurring + recurring_group_no 聚合出「任务卡」 */
      is_recurring: !!t.recurring,
      ...(t.recurring
        ? {
            recurring_group_no: makeGroupNo(nowIso ? new Date(nowIso) : new Date()),
            recurring_type: String(t.recurring.type || 'time').trim() === 'count' ? 'count' : 'time',
            recurring_start_time: t.recurring.startTime || null,
            recurring_end_time: t.recurring.endTime || null,
            recurring_max_count:
              t.recurring.type === 'count' ? Number(t.recurring.maxCount || 0) || null : null,
            recurring_accepted_count: 0,
            recurring_status: '生效中',
            trip_seq: 1,
          }
        : {}),
      assignments: assigns,
      vehicle: sum.mixed ? '多种' : sum.vehicle,
      driver: sum.mixed ? '多种' : sum.driver,
      carry_quantity: sum.carry_quantity,
      /* ⭐ 归属口径：
         · 主管理员（owner 为空）→ null，与 Web 一致；
         · 子账号 → 写**主账号**（Web 写的是自己）。
           这里故意与 Web 不同：写自己会让主账号和司机都看不到这张单，
           等于建了个「只有自己可见」的孤儿单。写主账号才落在客户层。 */
      owner_account: owner || null,
      transport_mode: transportMode,
      check_in_required: transportMode === '详细' ? t.checkInRequired !== false : false,
      assigned_orgs: sum.assigned_orgs || null,
      /* ⚠️ 高德驾车规划还没接到云函数，先留空；Web 端详情会显示「—」 */
      plan_distance: null,
      plan_duration: null,
      /* 发起人（列不存在时自动跳过，保证老库也能跑） */
      ...(canWriteCreator ? { creator: creatorName, creator_account: creatorAccount } : {}),
      /* 装卸货联系人 / 电话（司机端「导航 · 打电话」用；列不存在自动跳过） */
      ...(canWriteContact
        ? {
            pickup_contact: String(t.pickupContact || '').trim() || null,
            pickup_phone: String(t.pickupPhone || '').trim() || null,
            delivery_contact: String(t.deliveryContact || '').trim() || null,
            delivery_phone: String(t.deliveryPhone || '').trim() || null,
          }
        : {}),
    }

    try {
      const rows = await writeTable('POST', 'waybills', '', record)
      created.push({
        id: rows[0] && rows[0].id,
        waybill_no: record.waybill_no,
        /* 回给前端做自检：想建常驻却没生效 = 云函数还是旧版 */
        recurring: !!record.is_recurring,
      })
    } catch (e) {
      console.error('save：单条落库失败', record.waybill_no, e.message)
      failed.push({ waybill_no: record.waybill_no, message: e.message })
    }
  }

  if (!created.length) {
    return { code: 500, message: `保存失败：${(failed[0] && failed[0].message) || '未知错误'}` }
  }

  console.log(`waybill-admin.save：${account} 任务 ${tasks.length} → 成功 ${created.length}`)

  return {
    code: 0,
    created,
    failed,
    message:
      failed.length && `已创建 ${created.length} 张，失败 ${failed.length} 张` ||
      `已创建 ${created.length} 张运单`,
  }
}

/* ============================================================
   动作：save + id = 编辑（只改一张，只允许 待接单 / 待重新指派）
   ------------------------------------------------------------
   · 语义：把「行程 / 货物 / 派发」整块重写（与新建同一套校验）
   · 待重新指派 改完也变回「待接单」，否则司机端看不到
   · 用 status 做 CAS；写一条 status_log「管理员编辑」
   · 常驻趟次不许在小程序里改（组里还有额度 / trip_seq，回 Web）
   ============================================================ */
async function actionSaveEdit(event, user, account) {
  const id = String(event.id || '').trim()
  if (isBadId(id)) return { code: 400, message: '运单 id 不合法' }

  const tasks = Array.isArray(event.tasks) ? event.tasks : []
  if (!tasks.length) return { code: 400, message: '没有要保存的内容' }
  if (tasks.length > 1) return { code: 400, message: '编辑一次只能改一张运单' }

  const rows = await queryTable(
    'waybills',
    `select=id,waybill_no,status,is_recurring,owner_account,status_log&id=eq.${enc(id)}&limit=1`
  )
  const wb = rows[0]
  if (!wb) return { code: 404, message: '运单不存在' }
  if (!makeScope(user, account)(wb)) return { code: 403, message: '这条运单不在你的可见范围里' }
  if (wb.is_recurring) {
    return { code: 409, message: '常驻任务的趟次不能在小程序里改，请回 Web 处理' }
  }

  const st = String(wb.status || '').trim()
  if (!['待接单', '待重新指派'].includes(st)) {
    return { code: 409, message: `「${st}」的运单不能编辑（只有待接单 / 待重新指派可以）` }
  }

  const msg = validateTaskInput(tasks[0], 1)
  if (msg) return { code: 400, message: msg }

  const t = tasks[0]
  const cargos = (t.cargos || []).filter((c) => String((c && c.name) || '').trim())
  const assigns = (t.assigns || [])
    .filter((a) => a && (a.items || []).length)
    .map((a) => ({
      method: String(a.method || '').trim(),
      items: (a.items || []).map((it) => ({
        target: String(it.target || '').trim(),
        carryQuantity: Number(it.carryQuantity || 0),
        carryFreight: Number(it.carryFreight || 0),
      })),
    }))
  const sum = summarizeAssign(assigns)
  const transportMode = String(t.transportMode || '').trim() === '详细' ? '详细' : '极简'
  const operator = String((user && user.name) || account).trim()
  const nowIso = new Date().toISOString()
  const taskName = String(t.name || '').trim() || '任务1'

  const patch = {
    task_name: taskName,
    pickup: String(t.pickup || '').trim(),
    delivery: String(t.delivery || '').trim(),
    pickup_time: t.pickupTime || null,
    plan_time: t.planTime || null,
    cargo: cargos.map((c) => String(c.name).trim()).join('、'),
    quantity: Number(cargos.reduce((n, c) => n + Number(c.quantity || 0), 0).toFixed(2)),
    freight: Number(cargos.reduce((n, c) => n + Number(c.freight || 0), 0).toFixed(2)),
    assignments: assigns,
    vehicle: sum.mixed ? '多种' : sum.vehicle,
    driver: sum.mixed ? '多种' : sum.driver,
    carry_quantity: sum.carry_quantity,
    assigned_orgs: sum.assigned_orgs || null,
    transport_mode: transportMode,
    check_in_required: transportMode === '详细' ? t.checkInRequired !== false : false,
    /* 改完决定「待接单」：待重新指派的单编辑后必须回到待接单，司机端才看得到 */
    status: '待接单',
    status_log: appendLog(wb, {
      status: '待接单',
      time: nowIso,
      operator,
      account,
      remark: `管理员编辑：${taskName}`,
    }),
  }

  const updated = await writeTable(
    'PATCH',
    'waybills',
    `id=eq.${enc(id)}&status=eq.${enc(st)}`,
    patch
  )
  if (!Array.isArray(updated) || !updated.length) {
    return { code: 409, message: '这条运单刚被改过（可能已有人接单），请刷新后重试' }
  }

  console.log(`waybill-admin.save(edit)：${account} ${wb.waybill_no} ${st} → 待接单`)
  return { code: 0, id: Number(id), status: '待接单', message: '已保存' }
}

/* ============================================================
   动作：assign（派发 / 改派）
   ------------------------------------------------------------
   · 只允许 待接单 / 待重新指派 —— 已经开始跑的单改派会打乱司机
   · 待重新指派 → 派发后状态改回「待接单」（否则司机端根本不展示）
   · 用 status 当版本号做 CAS，防止两个人同时改
   ============================================================ */
async function actionAssign(event, user, account) {
  const id = String(event.id || '').trim()
  if (!id) return { code: 400, message: '缺少运单 id' }
  if (isBadId(id)) return { code: 400, message: '运单 id 不合法' }
  if (isBadId(id)) return { code: 400, message: '运单 id 不合法' }

  const rows = await queryTable(
    'waybills',
    `select=id,waybill_no,status,assignments,status_log&id=eq.${enc(id)}&limit=1`
  )
  const wb = rows[0]
  if (!wb) return { code: 404, message: '运单不存在' }

  const st = String(wb.status || '').trim()
  if (!['待接单', '待重新指派'].includes(st)) {
    return { code: 409, message: `「${st}」的运单不能改派（只有待接单 / 待重新指派可以）` }
  }

  const method = String(event.method || '').trim()
  if (!['driver', 'vehicle', 'team'].includes(method)) {
    return { code: 400, message: '指派方式不合法' }
  }
  const items = (Array.isArray(event.items) ? event.items : [])
    .map((it) => ({
      target: String((it && it.target) || '').trim(),
      carryQuantity: Number((it && it.carryQuantity) || 0),
      carryFreight: Number((it && it.carryFreight) || 0),
    }))
    .filter((it) => it.target)
  if (!items.length) return { code: 400, message: '请选择要派给谁' }

  const assigns = [{ method, items }]
  const sum = summarizeAssign(assigns)
  const nowIso = new Date().toISOString()
  const operator = String((user && user.name) || account).trim()

  const patch = {
    assignments: assigns,
    vehicle: sum.mixed ? '多种' : sum.vehicle,
    driver: sum.mixed ? '多种' : sum.driver,
    carry_quantity: sum.carry_quantity,
    assigned_orgs: sum.assigned_orgs || null,
    /* ⭐ 待重新指派 → 待接单：不改回来司机端看不到 */
    status: '待接单',
    status_log: appendLog(wb, {
      status: '待接单',
      time: nowIso,
      operator,
      account,
      remark: `${st === '待重新指派' ? '管理员改派' : '管理员派发'}：${items
        .map((it) => it.target)
        .join('/')}`,
    }),
  }

  const updated = await writeTable(
    'PATCH',
    'waybills',
    `id=eq.${enc(id)}&status=eq.${enc(st)}`,
    patch
  )
  if (!Array.isArray(updated) || !updated.length) {
    return { code: 409, message: '这条运单刚被改过（可能已有人接单），请刷新后重试' }
  }

  console.log(`waybill-admin.assign：${account} ${wb.waybill_no} ${st} → 待接单，派给 ${items.map((i) => i.target).join('/')}`)

  return { code: 0, status: '待接单', message: '已派发' }
}

/* 折线抽样：高德一条长途可能上万点，直接下发接口会很大、地图也卡。
   均匀抽样到 max 点（保留首尾）——画线够用，精度损失肉眼看不出来。 */
function simplifyLine(s, max) {
  const raw = String(s || '')
  if (!raw) return ''
  const pts = raw.split(';').filter(Boolean)
  const limit = max || 600
  if (pts.length <= limit) return raw
  const step = Math.ceil(pts.length / limit)
  const out = []
  for (let i = 0; i < pts.length; i += step) out.push(pts[i])
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1])
  return out.join(';')
}

/* ============================================================
   动作：dayCounts（周历小圆点 —— 按「发单日期」统计每天几单）
   ------------------------------------------------------------
   · 只回数量，不回明细；口径与列表一致（create_time + owner_account 隔离）
   · create_time 是带 T 的 ISO，用日期串比较即可（'2026-10-18T09:00' >= '2026-10-18'）
   ============================================================ */
function addDays(ymd, n) {
  const d = new Date(ymd + 'T00:00:00')
  d.setDate(d.getDate() + n)
  const p2 = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

async function actionDayCounts(event, user, account) {
  const from = String((event && event.from) || '').slice(0, 10)
  const to = String((event && event.to) || '').slice(0, 10)
  if (!from || !to) return { code: 400, message: '缺少日期范围', counts: {} }
  /* 隔离直接写在查询里：主账号 + 管理员建的单（owner_account 为 null） */
  const owner = String((user && user.owner_account) || '').trim() || account
  const rows = await queryTable(
    'waybills',
    `select=create_time&create_time=gte.${enc(from)}&create_time=lt.${enc(
      addDays(to, 1)
    )}&or=(owner_account.eq.${enc(owner)},owner_account.is.null)&limit=2000`
  )
  const counts = {}
  ;(rows || []).forEach((w) => {
    const d = String(w.create_time || '').slice(0, 10)
    if (d) counts[d] = (counts[d] || 0) + 1
  })
  console.log(`waybill-admin.dayCounts：${from}~${to} 共 ${Object.keys(counts).length} 天有单`)
  return { code: 0, counts }
}

/* ============================================================
   动作：routes（路线清单 —— 管理端「路线管理」页用）
   ------------------------------------------------------------
   · plans[].polyline 由 Web 端「规划路线 / 一键规划」用高德驾车算出来后写入（"lng,lat;lng,lat;…"）
   · 老数据没有 polyline → 小程序只显示距离/时长，提示去 Web 端点一次规划
   ============================================================ */
async function actionRoutes(event, user, account) {
  const owner = String((user && user.owner_account) || '').trim() || account
  const rows = await queryTable(
    'routes',
    `select=id,name,org,pickup_point,delivery_point,remark,plans,plan_count,status,owner_account` +
      `&or=(owner_account.eq.${enc(owner)},owner_account.is.null)` +
      `&order=updated_at.desc&limit=200`
  )
  const list = (rows || []).map((r) => ({
    id: r.id,
    name: String(r.name || '').trim() || '未命名路线',
    org: String(r.org || '').trim(),
    pickup: String(r.pickup_point || '').trim(),
    delivery: String(r.delivery_point || '').trim(),
    remark: String(r.remark || '').trim(),
    status: String(r.status || 'active').trim(),
    plans: (Array.isArray(r.plans) ? r.plans : []).map((p) => ({
      name: String((p && p.name) || '未命名方案'),
      distance: String((p && p.distance) || ''),
      duration: String((p && p.duration) || ''),
      toll: String((p && p.toll) || ''),
      pointCount: Array.isArray(p && p.waypoints) ? p.waypoints.length : 0,
      /* 途经点坐标（Web 端地图选点会带 lng/lat；纯手填名字的没有坐标，跳过） */
      waypoints: (Array.isArray(p && p.waypoints) ? p.waypoints : [])
        .filter((w) => w && w.lng != null && w.lat != null)
        .map((w) => ({
          name: String(w.value || '').trim(),
          lng: Number(w.lng),
          lat: Number(w.lat),
        })),
      /* 折线：老数据没有就是空串；点数多时抽样（600 点上限）再下发 */
      polyline: simplifyLine(p && p.polyline, 600),
    })),
  }))
  console.log(`waybill-admin.routes：${account} 命中 ${list.length} 条路线`)
  return { code: 0, list, count: list.length }
}

/* ============================================================
   动作：fences（围栏清单 —— 管理端「围栏预览」页用）
   ------------------------------------------------------------
   · 只读：新建/编辑围栏永远回 Web（设计稿口径）
   · 口径拿 owner_account（子账号落到主账号）+ is.null（主管理员建的单）
   · circle 用 center("lng,lat") + radius；polyline/polygon 用 points("lng,lat;lng,lat;…")
   ============================================================ */
async function actionFences(event, user, account) {
  const owner = String((user && user.owner_account) || '').trim() || account
  const rows = await queryTable(
    'ele_fences',
    `select=id,name,shape,center,points,radius,org,attr,desc,adcode,location,owner_account` +
      `&or=(owner_account.eq.${enc(owner)},owner_account.is.null)` +
      `&order=updated_at.desc&limit=300`
  )
  const list = (rows || []).map((f) => ({
    id: f.id,
    name: String(f.name || '').trim() || '未命名围栏',
    shape: String(f.shape || '').trim() || 'circle',
    center: String(f.center || '').trim(),
    points: String(f.points || '').trim(),
    radius: Number(f.radius || 0),
    org: String(f.org || '').trim(),
    attr: String(f.attr || '').trim(),
    desc: String(f.desc || '').trim(),
    adcode: f.adcode || null,
    location: String(f.location || '').trim(),
  }))
  console.log(`waybill-admin.fences：${account} 命中 ${list.length} 个围栏`)
  return { code: 0, list, count: list.length }
}

/* ============================================================
   动作：pending（待派清单 —— 车辆页「派单给这辆」用）
   ------------------------------------------------------------
   · 只取「待接单 / 待重新指派」的普通运单（常驻趟次不算：那套走任务卡）
   · **不限日期**：待派的单可能排在任何一天，不能因为切了日期就看不见
     （真机踩过：管理端派了张「昨天」的单，司机端看不到）
   · 有计划装货时间的按时间升序（最急的在前），没排期的排最后
   ============================================================ */
async function actionPending(event, user, account) {
  const rows = await queryTable(
    'waybills',
    `select=${LIST_FIELDS}` +
      `&status=in.(${['待接单', '待重新指派'].map((s) => `"${s}"`).join(',')})` +
      `&order=create_time.desc&limit=${PENDING_LIMIT}`
  )

  const inScope = makeScope(user, account)
  const toMs = (v) => {
    const s = String(v || '').trim()
    if (!s) return Infinity
    const t = Date.parse(s)
    return isNaN(t) ? Infinity : t
  }
  /* ⚠️ 不要用 `is_recurring=eq.false` 过滤：小程序建的单这一列可能是 **NULL**，
     `eq.false` 不匹配 NULL，会把它们全漏掉（真机踩过：刚派的单不在待派清单里） */
  const list = rows
    .filter(inScope)
    .filter((w) => !w.is_recurring)
    .sort((a, b) => toMs(a.pickup_time) - toMs(b.pickup_time))

  return { code: 0, list, count: list.length }
}

/* ============================================================
   动作：detail（管理端运单详情）
   ------------------------------------------------------------
   · 直接返回整条 waybills（含 assignments / status_log / 各节点时间）
   · 归属校验与列表同一口径（makeScope）：子账号看不到别家的单
   · 顺手按司机姓名补电话（派单的人要能直接打给司机；查不到就算了）
   ============================================================ */
async function actionDetail(event, user, account) {
  const id = String(event.id || '').trim()
  if (!id) return { code: 400, message: '缺少运单 id' }
  if (isBadId(id)) return { code: 400, message: '运单 id 不合法' }

  const rows = await queryTable('waybills', `select=*&id=eq.${enc(id)}&limit=1`)
  const wb = rows[0]
  if (!wb) return { code: 404, message: '运单不存在' }
  if (!makeScope(user, account)(wb)) return { code: 403, message: '这条运单不在你的可见范围里' }

  const names = [...new Set(driversOfWaybill(wb))]
  const driverPhones = {}
  if (names.length) {
    try {
      const list = names.map((n) => `"${String(n).replace(/"/g, '')}"`).join(',')
      const ds = await queryTable(
        'drivers',
        `select=driver_name,phone&driver_name=in.(${list})&limit=50`
      )
      ds.forEach((d) => {
        const n = String(d.driver_name || '').trim()
        const p = String(d.phone || '').trim()
        if (n && p && !driverPhones[n]) driverPhones[n] = p
      })
    } catch (e) {
      /* 电话拿不到不影响详情主体，前端只是少一个「拨打」入口 */
      console.warn('detail：司机电话查询失败', e.message)
    }
  }

  return { code: 0, waybill: wb, driverPhones }
}

/* ============================================================
   动作：recurringOp（常驻任务：暂停 / 恢复 / 结束 / 删除）
   ------------------------------------------------------------
   · 有「进行中」趟次时不许暂停 / 结束 / 删除（与 Web 口径一致）
   · 删除是整组删（含所有趟次），前端负责二次确认
   ============================================================ */
const REC_RUNNING = ['待装车', '装车中', '装车完成', '已发车', '已到达']

async function actionRecurringOp(event, user, account) {
  const groupNo = String((event && event.group_no) || '').trim()
  const op = String((event && event.op) || '').trim()
  if (!groupNo) return { code: 400, message: '缺少常驻组号' }
  if (!['pause', 'resume', 'end', 'remove'].includes(op)) {
    return { code: 400, message: '不支持的操作' }
  }

  const scope = makeScope(user, account)
  const rows = await queryTable(
    'waybills',
    `select=id,status,is_recurring,recurring_status,trip_seq,owner_account` +
      `&recurring_group_no=eq.${enc(groupNo)}&limit=500`
  )
  const mine = (rows || []).filter(scope)
  if (!mine.length) return { code: 404, message: '这个常驻任务不在你的可见范围里' }

  const running = mine.filter((r) => REC_RUNNING.includes(String(r.status || '').trim()))
  if (running.length && op !== 'resume') {
    return {
      code: 409,
      message: `还有 ${running.length} 趟在跑，先把这些趟跑完再操作`,
    }
  }

  if (op === 'remove') {
    await writeTable('DELETE', 'waybills', `recurring_group_no=eq.${enc(groupNo)}`, null)
    console.log(`waybill-admin.recurringOp：${account} 删除常驻组 ${groupNo}（${mine.length} 条）`)
    return { code: 0, message: `已删除这个常驻任务（${mine.length} 条记录）` }
  }

  const nextStatus = op === 'pause' ? '已暂停' : op === 'resume' ? '生效中' : '已结束'
  await writeTable(
    'PATCH',
    'waybills',
    `recurring_group_no=eq.${enc(groupNo)}`,
    { recurring_status: nextStatus }
  )
  console.log(`waybill-admin.recurringOp：${account} ${groupNo} → ${nextStatus}`)
  return { code: 0, message: `已${op === 'pause' ? '暂停' : op === 'resume' ? '恢复' : '结束'}` }
}

/* ============================================================
   动作：remove（删除运单）
   ------------------------------------------------------------
   · 与 Web 同一条闸门：只有 待接单 / 已完成 / 已取消 / 待重新指派 能删
   · 常驻任务的趟次不许在小程序删（组里还有额度与趟次序号，回 Web 处理）
   · 用 status 做 CAS，防止两个人同时操作
   ============================================================ */
async function actionRemove(event, user, account) {
  const id = String(event.id || '').trim()
  if (!id) return { code: 400, message: '缺少运单 id' }
  if (isBadId(id)) return { code: 400, message: '运单 id 不合法' }

  const rows = await queryTable(
    'waybills',
    `select=id,waybill_no,status,is_recurring,owner_account&id=eq.${enc(id)}&limit=1`
  )
  const wb = rows[0]
  if (!wb) return { code: 404, message: '运单不存在' }
  if (!makeScope(user, account)(wb)) return { code: 403, message: '这条运单不在你的可见范围里' }
  if (wb.is_recurring) return { code: 409, message: '常驻任务的趟次不能在小程序里删，请回 Web 处理' }

  const st = String(wb.status || '').trim()
  if (!DELETE_ALLOWED_STATUS.includes(st)) {
    return {
      code: 409,
      message: `「${st}」不能删除，只有 ${DELETE_ALLOWED_STATUS.join(' / ')} 允许`,
    }
  }

  const deleted = await writeTable(
    'DELETE',
    'waybills',
    `id=eq.${enc(id)}&status=eq.${enc(st)}`,
    null
  )
  if (!Array.isArray(deleted) || !deleted.length) {
    return { code: 409, message: '这条运单刚被改过，请刷新后重试' }
  }

  console.log(`waybill-admin.remove：${account} 删除 ${wb.waybill_no}（${st}）`)
  return { code: 0, message: '已删除' }
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
    if (!account) return { code: 400, message: '未登录' }

    const users = await queryTable(
      'users',
      `account=eq.${enc(account)}&select=account,name,phone,owner_account,role_id,org_id&limit=1`
    )
    const user = users[0]
    if (!user) return { code: 403, message: '账号不存在' }

    const isStaff =
      user.role_id !== null && user.role_id !== undefined && user.role_id !== ''
    if (!isStaff) {
      /* 司机账号不该走管理端接口 —— 这是「管理端不能接单」之外的另一道闸门 */
      return { code: 403, message: '仅管理端账号可用' }
    }

    const action = String((event && event.action) || 'list').trim()
    if (action === 'stats') return await actionStats(event, user, account)
    if (action === 'pending') return await actionPending(event, user, account)
    if (action === 'fences') return await actionFences(event, user, account)
    if (action === 'routes') return await actionRoutes(event, user, account)
    if (action === 'dayCounts') return await actionDayCounts(event, user, account)
    if (action === 'save') return await actionSave(event, user, account)
    if (action === 'assign') return await actionAssign(event, user, account)
    if (action === 'detail') return await actionDetail(event, user, account)
    if (action === 'remove') return await actionRemove(event, user, account)
    if (action === 'recurringOp') return await actionRecurringOp(event, user, account)
    return await actionList(event, user, account)
  } catch (e) {
    console.error('waybill-admin 执行失败：', e)
    return { code: 500, message: e.message || '服务异常' }
  }
}
