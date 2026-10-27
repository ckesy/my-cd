/**
 * 数据大屏 · 取数层（只读）
 * ============================================================
 * 两个大屏（车辆运行 / 运单费用）共用，只做「查」和「算」，不写库。
 *
 * ⭐ 三条硬规则：
 *   ① 数据隔离：平台管理员看全量；客户按 customer_id，二级机构子账号再叠 org。
 *      vehicles 没有 owner_account 列（只有 customer_id），别再照 FullMap 写错。
 *   ② 费用与业务流程开关联动：审批（fee_approval_configs.mode）关了 →
 *      不展示待审/审核中/驳回；付款记录模块（tenant_modules.payout）关了 →
 *      不展示待打款/已打款。两者都关 → 费用区整体降级为「仅上报汇总」。
 *   ③ 降级容错：任何一张表读失败都返回空数组/默认值，不能让大屏白屏。
 *      （东风接口更容易挂，逐车失败的车辆直接跳过，不阻塞整屏）
 * ============================================================
 */
import dayjs from 'dayjs'
import { supabase } from './supabase'
import { DONGFENG_TOKEN, DONGFENG_TRACK_URL, fetchRealtime } from './waybillProgress'
import { fetchDailyStats, aggregate, rowToStat } from './opStats'
import { moduleFlags, approvalState } from './modules'

/* ============================================================
   一、数据隔离
   ============================================================ */

/** 当前账号的可见范围（大屏所有查询都从这里拿过滤条件） */
export function screenScope() {
  let u = {}
  try { u = JSON.parse(localStorage.getItem('currentUser') || '{}') } catch { u = {} }

  const isAdmin = u.role === 'admin'
  const isSub = !!u.isSubAccount
  const orgLevel = isSub ? Number(u.orgLevel) || 1 : null
  const orgName = isSub ? (String(u.orgName || '').trim() || null) : null

  /* ⭐ 主账号口径必须和 Dashboard.isMaster 完全一致：
        Dashboard 认「客户 且 不是子账号」，不靠 masterAccount === account。
        之前这里自己写了一套更严的判定，导致大屏组件把自己拦在门外
        （Dashboard 放行、组件内却显示「未开通」）。 */
  const isMaster = isAdmin || (u.role === 'customer' && !isSub)

  return {
    isAdmin,
    isSub,
    account: u.masterAccount || u.account || '',
    customerId: u.customerId || null,
    orgName,
    orgLevel,
    /** 二级及以下机构子账号 → 再叠一层 org 过滤 */
    needOrgFilter: !isAdmin && isSub && orgLevel >= 2 && !!orgName,
    isMaster,
    perms: Array.isArray(u.permissions && u.permissions.client) ? u.permissions.client : [],
  }
}

/* ============================================================
   二、车辆
   ============================================================ */

/** 大屏车辆清单（含 VIN，用于定位） */
export async function loadScreenVehicles(scope) {
  try {
    let q = supabase
      .from('vehicles')
      .select('id,plate,vin,org,driver,customer_id,fuel_type,vehicle_type,usage,biz_status')
    if (!scope.isAdmin) {
      if (!scope.customerId) return []
      q = q.eq('customer_id', scope.customerId)
      if (scope.needOrgFilter) q = q.eq('org', scope.orgName)
    }
    const { data, error } = await q
    if (error) throw error
    return (data || []).filter((v) => v && v.plate)
  } catch (e) {
    console.warn('[大屏] 车辆列表读取失败', e)
    return []
  }
}

/** 在线状态推断（与 FullMap / 运单进度保持一致） */
export function normalizeRealtime(rt) {
  if (!rt) return null
  const speed = Number(rt.speed) || 0
  let status = '离线'
  if (rt.status) status = rt.status
  else if (speed > 0) status = '行驶中'
  return { ...rt, speed, status }
}

/**
 * 批量拉实时定位
 * ⭐ 逐车一个 HTTP，必须限流：默认 6 并发，单台 8s 超时，失败的车辆返回 null 跳过
 */
export async function pullRealtime(vehicles, { concurrency = 6, onProgress } = {}) {
  const list = (vehicles || []).filter((v) => v && v.vin)
  const out = new Map()
  let cursor = 0
  let done = 0

  const worker = async () => {
    while (cursor < list.length) {
      const i = cursor++
      const v = list[i]
      try {
        const rt = await fetchRealtime(v.vin, v.plate)
        out.set(v.plate, rt ? normalizeRealtime(rt) : null)
      } catch (e) {
        out.set(v.plate, null)
      } finally {
        done++
        if (onProgress) onProgress(done, list.length)
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, list.length || 1) }, () => worker())
  )
  return out
}

/** 车辆四态统计 */
export function summarizeRealtime(vehicles, rtMap) {
  const s = { total: vehicles.length, online: 0, running: 0, idle: 0, offline: 0, stale: 0, noVin: 0 }
  const now = Date.now()
  vehicles.forEach((v) => {
    if (!v.vin) { s.noVin++; s.offline++; return }
    const rt = rtMap.get(v.plate)
    if (!rt) { s.offline++; return }
    if (rt.status === '行驶') { s.running++; s.online++ }
    else if (rt.status === '静止') { s.idle++; s.online++ }
    else { s.offline++ }
    if (rt.reportAt && now - rt.reportAt > 30 * 60 * 1000) s.stale++
  })
  s.rate = s.total ? Math.round((s.online / s.total) * 1000) / 10 : 0
  return s
}

/* ============================================================
   三、今日里程（轨迹批量实算）
   ------------------------------------------------------------
   东风的日统计有 1 天延迟，所以「今日里程」必须自己算：
   取当天全部轨迹点的里程表读数，最大 - 最小 = 今日行驶里程。
   ⭐ 5 分钟缓存：50 台车一轮约 20~40s，不能跟 30s 定位刷新同频。
   ============================================================ */

const MILE_TTL = 5 * 60 * 1000
const mileCache = new Map() // vin|date -> { km, at }

async function fetchDayMileage(vin, dateStr) {
  const key = `${vin}|${dateStr}`
  const hit = mileCache.get(key)
  if (hit && Date.now() - hit.at < MILE_TTL) return hit.km

  const params = new URLSearchParams({
    token: DONGFENG_TOKEN,
    carId: vin,
    beginTime: `${dateStr} 00:00:00`,
    endTime: `${dateStr} 23:59:59`,
  })
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 20000)
  try {
    const res = await fetch(`${DONGFENG_TRACK_URL}?${params.toString()}`, { signal: ac.signal })
    if (!res.ok) return null
    const json = await res.json()
    if (json.code !== 1 || !Array.isArray(json.data) || json.data.length < 2) {
      mileCache.set(key, { km: null, at: Date.now() })
      return null
    }
    const ms = json.data
      .map((p) => parseFloat(p.mileage))
      .filter((n) => Number.isFinite(n))
    if (ms.length < 2) return null
    const km = (Math.max(...ms) - Math.min(...ms)) / 1000
    /* 里程表跳变（换表/异常）兜底：单日 > 2000km 视为脏数据 */
    const val = km > 0 && km < 2000 ? Math.round(km * 10) / 10 : null
    mileCache.set(key, { km: val, at: Date.now() })
    return val
  } catch (e) {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 批量算今日里程
 * ⭐ 只跑「在线」的车（离线车今天大概率没出车，白等 20s 超时不值）
 */
export async function pullTodayMileage(vehicles, rtMap, { concurrency = 5, dateStr } = {}) {
  const day = dateStr || dayjs().format('YYYY-MM-DD')
  const targets = (vehicles || []).filter((v) => {
    if (!v.vin) return false
    const rt = rtMap.get(v.plate)
    return rt && rt.status !== '离线'
  })

  const rows = []
  let cursor = 0
  const worker = async () => {
    while (cursor < targets.length) {
      const v = targets[cursor++]
      const km = await fetchDayMileage(v.vin, day)
      if (km != null) rows.push({ plate: v.plate, org: v.org || '', km })
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, targets.length || 1) }, () => worker())
  )
  rows.sort((a, b) => b.km - a.km)
  const total = Math.round(rows.reduce((s, r) => s + r.km, 0) * 10) / 10
  return { rows, total, counted: rows.length, day }
}

/* ============================================================
   四、日统计（里程 / 电耗 / 运行时长）
   ------------------------------------------------------------
   ⚠️ 东风能耗接口对「当天」和「昨天」都返回 code:3000 data:null，
      所以能耗只能显示到「前天」，大屏上必须标「截至 X」。
   ============================================================ */

export async function loadDayStats(scope, start, end) {
  try {
    const rows = await fetchDailyStats({
      start, end,
      customerId: scope.isAdmin ? null : scope.customerId,
      org: scope.needOrgFilter ? scope.orgName : null,
    })
    return { rows, sum: aggregate(rows) }
  } catch (e) {
    console.warn('[大屏] 日统计读取失败', e)
    return { rows: [], sum: null }
  }
}

/** 最近一个有数据的日期（用于「能耗截至 X」文案） */
export function latestStatDate(rows) {
  if (!rows || !rows.length) return ''
  let max = ''
  rows.forEach((r) => { if (r.stat_date > max) max = r.stat_date })
  return max
}

/* ============================================================
   五、车务到期（证件 / 保养 / 维修）
   ============================================================ */

export async function loadAffairSummary(scope) {
  const empty = { overdue: 0, near: 0, soon: 0, missing: 0, inRepair: 0, dueMaintain: 0 }
  try {
    let q = supabase.from('vehicle_certs').select('cert_type,expire_date,remind_days,plate,cert_no')
    if (!scope.isAdmin && scope.account) q = q.eq('owner_account', scope.account)
    const { data, error } = await q
    if (error) throw error

    const certs = data || []
    const now = dayjs()
    let overdue = 0, near = 0, soon = 0, missing = 0
    certs.forEach((c) => {
      if (c.cert_type === 'maintain') return
      if (!c.expire_date) { missing++; return }
      const days = dayjs(c.expire_date).diff(now, 'day')
      if (days < 0) overdue++
      else if (days <= 30) near++
      else if (days <= Math.max(60, Number(c.remind_days) || 60)) soon++
    })

    /* 在修：维修台账里没有「结束时间」的记录 */
    let inRepair = 0
    try {
      let rq = supabase.from('maintenance_records').select('id,kind,finish_at,happen_at')
      if (!scope.isAdmin && scope.account) rq = rq.eq('owner_account', scope.account)
      const { data: recs } = await rq.limit(500)
      inRepair = (recs || []).filter((r) => !r.finish_at).length
    } catch (e) { /* 表可能没建，忽略 */ }

    return { overdue, near, soon, missing, inRepair, dueMaintain: 0, empty: false }
  } catch (e) {
    console.warn('[大屏] 车务数据读取失败', e)
    return { ...empty, empty: true }
  }
}

/* ============================================================
   六、费用可见性（⭐ 与业务流程开关联动）
   ------------------------------------------------------------
   来源：tenant_modules（moduleFlags）+ fee_approval_configs（approvalState）
   规则：
     · approvalState.mode === 'off'  → 不走审批：隐藏 待审核/审核中/已驳回/漏斗
     · moduleFlags.payout === false  → 没有付款记录：隐藏 待打款/已打款
     · 两个都不可用                   → 费用区降级为「仅上报汇总」
   ============================================================ */
export function feeVisibility(scope) {
  const approvalOn = approvalState.mode !== 'off'
  const payoutOn = moduleFlags.payout === true

  /* 人级权限：主账号 / 平台管理员兜底，其余看 permissions.client */
  const has = (k) => scope.isAdmin || scope.isMaster || scope.perms.includes(k)
  const canReport = has('fee_list') || has('fee_stats')
  const canAudit = approvalOn && (has('fee_list') || has('fee_audit'))
  const canPay = payoutOn && (has('fee_payout') || has('fee_list'))

  return {
    approvalOn,
    payoutOn,
    canReport,
    canAudit,
    canPay,
    /** 费用区整个要不要显示 */
    show: canReport || canAudit || canPay,
    /** 只有上报汇总，没有任何流程 */
    degraded: !approvalOn && !payoutOn,
  }
}

/** 费用汇总（按状态分组，自动剪掉不可见的环节） */
export async function loadFeeSummary(scope, vis, start, end) {
  const empty = { list: [], byStatus: {}, byType: {}, total: 0, count: 0 }
  if (!vis.show) return empty
  try {
    let q = supabase
      .from('reports')
      .select('id,type,amount,status,create_time,plate,driver_name')
      .in('type', ['expense', 'subsidy', 'loan', 'violation'])
    if (!scope.isAdmin && scope.account) q = q.eq('owner_account', scope.account)
    if (start) q = q.gte('create_time', start)
    if (end) q = q.lte('create_time', end)
    const { data, error } = await q.limit(2000)
    if (error) throw error

    const list = data || []
    const byStatus = {}
    const byType = {}
    let total = 0
    list.forEach((r) => {
      const amt = Number(r.amount) || 0
      total += amt
      byStatus[r.status] = byStatus[r.status] || { count: 0, amount: 0 }
      byStatus[r.status].count++
      byStatus[r.status].amount += amt
      byType[r.type] = byType[r.type] || { count: 0, amount: 0 }
      byType[r.type].count++
      byType[r.type].amount += amt
    })

    /* ⭐ 按开关剪枝：不给不可见的环节留数字 */
    if (!vis.approvalOn) ['待审核', '审核中', '已驳回'].forEach((k) => delete byStatus[k])
    if (!vis.payoutOn) ['待打款', '已打款'].forEach((k) => delete byStatus[k])

    return { list, byStatus, byType, total, count: list.length }
  } catch (e) {
    console.warn('[大屏] 费用读取失败', e)
    return empty
  }
}

/* ============================================================
   七、运单（2 号屏）
   ------------------------------------------------------------
   ⭐ pickup_lng/lat、delivery_lng/lat 在发布运单时就落库了，
      画路线不需要再调高德地理编码。
   ============================================================ */

export const ACTIVE_STATUS = ['待接单', '待重新指派', '待装车', '装车中', '装车完成', '已发车', '已到达']

export async function loadWaybills(scope, { limit = 500 } = {}) {
  try {
    let q = supabase
      .from('waybills')
      .select('id,waybill_no,status,pickup,delivery,pickup_time,plan_time,vehicle,driver,assignments,' +
        'accept_time,depart_time,arrive_time,finish_time,create_time,plan_distance,plan_duration,' +
        'pickup_lng,pickup_lat,delivery_lng,delivery_lat,is_recurring,recurring_group_no,trip_seq,owner_account')
      .order('create_time', { ascending: false })
      .limit(limit)
    if (!scope.isAdmin && scope.account) q = q.eq('owner_account', scope.account)
    const { data, error } = await q
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('[大屏] 运单读取失败', e)
    return []
  }
}

/** 运单状态归并（9 态 → 大屏 4 组 + 完成/取消） */
export function groupWaybillStatus(rows) {
  const g = { 待接单: 0, 装车中: 0, 已发车: 0, 已到达: 0, 已完成: 0, 已取消: 0, 其他: 0 }
  rows.forEach((r) => {
    const s = r.status || ''
    if (s === '待接单' || s === '待重新指派') g.待接单++
    else if (s === '待装车' || s === '装车中' || s === '装车完成') g.装车中++
    else if (s === '已发车') g.已发车++
    else if (s === '已到达') g.已到达++
    else if (s === '已完成') g.已完成++
    else if (s === '已取消') g.已取消++
    else g.其他++
  })
  return g
}

/** 有坐标的活跃运单（画路线用） */
export function routableWaybills(rows) {
  return rows.filter((r) => {
    if (!ACTIVE_STATUS.includes(r.status)) return false
    const a = Number(r.pickup_lng), b = Number(r.pickup_lat)
    const c = Number(r.delivery_lng), d = Number(r.delivery_lat)
    return Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(d) && a && c
  })
}

/* ============================================================
   八、驾驶行为日汇总（读 vehicle_behavior_daily）
   ------------------------------------------------------------
   ⭐ 大屏不逐车跑轨迹：由云函数 behaviorStatsSync 每日写入，
      这里只读表 + 聚合。表不存在时返回 ready:false，前端显示「未启用」。
   ============================================================ */
export async function loadBehaviorDaily(scope, { days = 7 } = {}) {
  const empty = {
    ready: false, date: '', cars: 0, segments: 0, points: 0,
    stayCount: 0, stayMaxMin: 0, maxSpeed: 0, trend: [],
  }
  try {
    const start = dayjs().subtract(days, 'day').format('YYYY-MM-DD')
    let q = supabase
      .from('vehicle_behavior_daily')
      .select('vin,stat_date,plate,org,customer_id,overspeed_segments,overspeed_points,' +
        'overspeed_max_speed,stay_count,stay_max_min,stay_total_min,max_speed,track_points,has_data')
      .gte('stat_date', start)
      .order('stat_date', { ascending: false })
      .limit(4000)
    if (!scope.isAdmin && scope.customerId) q = q.eq('customer_id', String(scope.customerId))

    const { data, error } = await q
    if (error) throw error

    const rows = data || []
    if (!rows.length) return empty

    const byDate = new Map()
    rows.forEach((r) => {
      const d = String(r.stat_date).slice(0, 10)
      if (!byDate.has(d)) byDate.set(d, { date: d, segments: 0, stay: 0, cars: new Set(), maxMin: 0, maxSpeed: 0 })
      const b = byDate.get(d)
      if (!r.has_data) return
      b.segments += Number(r.overspeed_segments) || 0
      b.stay += Number(r.stay_count) || 0
      b.maxMin = Math.max(b.maxMin, Number(r.stay_max_min) || 0)
      b.maxSpeed = Math.max(b.maxSpeed, Number(r.max_speed) || 0)
      if ((Number(r.overspeed_segments) || 0) > 0) b.cars.add(r.plate || r.vin)
    })

    const dates = [...byDate.keys()].sort()
    const latestKey = dates[dates.length - 1]
    const latest = byDate.get(latestKey)

    return {
      ready: true,
      date: latestKey,
      cars: latest.cars.size,
      segments: latest.segments,
      stayCount: latest.stay,
      stayMaxMin: latest.maxMin,
      maxSpeed: Math.round(latest.maxSpeed * 10) / 10,
      trend: dates.slice(-7).map((d) => ({
        date: d.slice(5),
        segments: byDate.get(d).segments,
        stay: byDate.get(d).stay,
      })),
    }
  } catch (e) {
    /* 表没建 / 无权限 → 大屏显示「未启用」，不报错 */
    console.warn('[大屏] 驾驶行为汇总读取失败（表可能还没建）', e && e.message)
    return empty
  }
}
