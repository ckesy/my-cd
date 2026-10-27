/**
 * 大屏历史数据回补（本地直连，不依赖云函数）
 * ============================================================
 * 补两张表：
 *   vehicle_daily_stats   ← 东风 tripAnalysisOil（里程/电耗/运行时长）
 *   vehicle_behavior_daily ← 东风 track/history（超速段/停留超时）
 *
 * 用法：
 *   node tools/backfill-screen-stats.mjs --start=2026-10-20 --end=2026-10-26
 *   node tools/backfill-screen-stats.mjs --start=2026-10-20 --end=2026-10-21 --only=behavior
 *   node tools/backfill-screen-stats.mjs --start=2026-10-20 --end=2026-10-26 --force
 *   node tools/backfill-screen-stats.mjs --probe        # 只测写权限，不跑全量
 *
 * 说明：
 *   · 走 CloudBase RDB REST + 匿名登录（与 Web 端同一条通道）；
 *     前提是表已 `grant insert, update ... to anon`，否则会回
 *     "permission denied for table xxx"。
 *   · 计算口径与云函数 opStatsSync / behaviorStatsSync 完全一致。
 * ============================================================
 */
import { randomUUID } from 'crypto'

const GW = 'https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com'
const DEVICE = randomUUID()
const DF_TOKEN = process.env.DONGFENG_TOKEN || 'c40c7311ff604a598b9fb791a63e9deb'
const OIL_URL = 'https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/track/tripAnalysisOil'
const TRACK_URL = 'https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/track/history'
const CONCURRENCY = 6
const TIMEOUT = 25000

/* ---------------- 参数 ---------------- */
const args = Object.fromEntries(
  process.argv.slice(2).map((s) => {
    const [k, v] = s.replace(/^--/, '').split('=')
    return [k, v === undefined ? true : v]
  }),
)
const ONLY = args.only || 'both'
const FORCE = !!args.force
const todayBJ = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)
const addDays = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10)
const diffDays = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400e3)
const END = args.end || addDays(todayBJ(), -1)
const START = args.start || addDays(END, -6)
const dates = []
for (let i = 0; i <= diffDays(START, END); i++) dates.push(addDays(START, i))

/* ---------------- 登录 / REST ---------------- */
let TOKEN = null
async function login() {
  const r = await fetch(`${GW}/auth/v1/signin/anonymously`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-device-id': DEVICE },
    body: '{}',
  })
  const j = await r.json()
  TOKEN = j.access_token || (j.data && j.data.access_token)
  if (!TOKEN) throw new Error('匿名登录失败：' + JSON.stringify(j).slice(0, 200))
}

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    'x-device-id': DEVICE,
    Accept: 'application/json',
    'Accept-Profile': 'public',
    'Content-Profile': 'public',
  }
  if (body) headers['Content-Type'] = 'application/json'
  if (prefer) headers.Prefer = prefer
  const r = await fetch(`${GW}/v1/rdb/rest/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const txt = await r.text()
  let data = null
  try { data = txt ? JSON.parse(txt) : null } catch { data = txt }
  return { ok: r.ok, status: r.status, data }
}

/* ---------------- 东风接口 ---------------- */
const DEFAULT_CFG = { speed: 80, stayMin: 30, stayRadius: 200 }

async function fetchOil(vin, date) {
  const qs = new URLSearchParams({ token: DF_TOKEN, carId: vin, startTime: date, endTime: date })
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), TIMEOUT)
  try {
    /* ⭐ 只能 POST：参数放 query，body 传 {}（参数进 body 恒返 2101） */
    const r = await fetch(`${OIL_URL}?${qs.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: ac.signal,
    })
    if (r.status !== 200) return { ok: false, reason: `http ${r.status}` }
    const j = await r.json()
    if (j.code !== 1 || !j.data) return { ok: true, empty: true }
    return { ok: true, data: j.data }
  } catch (e) {
    return { ok: false, reason: e.message }
  } finally {
    clearTimeout(t)
  }
}

async function fetchTrack(vin, date) {
  const qs = new URLSearchParams({
    token: DF_TOKEN,
    carId: vin,
    beginTime: `${date} 00:00:00`,
    endTime: `${date} 23:59:59`,
  })
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), TIMEOUT)
  try {
    const r = await fetch(`${TRACK_URL}?${qs.toString()}`, { signal: ac.signal })
    if (r.status !== 200) return { ok: false, reason: `http ${r.status}` }
    const j = await r.json()
    if (j.code !== 1 || !Array.isArray(j.data)) return { ok: true, points: [] }
    const points = j.data
      .map((p) => {
        const lng = parseFloat(p.longitude)
        const lat = parseFloat(p.latitude)
        const speed = parseFloat(p.velocity) || 0
        const d = parseDT(p.sendTime)
        return d && isFinite(lng) && isFinite(lat) ? { lng, lat, speed, t: d.getTime() } : null
      })
      .filter(Boolean)
      .sort((a, b) => a.t - b.t)
    return { ok: true, points }
  } catch (e) {
    return { ok: false, reason: e.message }
  } finally {
    clearTimeout(t)
  }
}

const parseDT = (s) => {
  if (!s) return null
  const t = String(s).trim().replace(/-/g, '/')
  const [dp, tp] = t.split(' ')
  const d = new Date(`${dp.replace(/\//g, '-')}T${tp || '00:00:00'}+08:00`)
  return isNaN(d.getTime()) ? null : d
}

/* ---------------- 口径（与云函数逐字对齐） ---------------- */
function oilToRow(v, date, d) {
  const base = {
    vin: v.vin, stat_date: date, plate: v.plate, org: v.org || null,
    customer_id: v.customer_id != null ? String(v.customer_id) : null,
  }
  if (!d) {
    return { ...base, km: 0, fuel: 0, rate: null, run_min: null, off_min: null, avg_speed: null,
      start_time: null, end_time: null, has_data: false, source: 'df' }
  }
  const km = Number(d.tripMileage) / 1000
  const fuel = Number(d.sumTravelFuel) / 1000
  const runMin = Number(d.travelSumDuration)
  const sDt = parseDT(d.startTime)
  const eDt = parseDT(d.endTime)
  const sMs = sDt ? sDt.getTime() : 0
  const eMs = eDt ? eDt.getTime() : 0
  const spanMin = sMs && eMs && eMs > sMs ? (eMs - sMs) / 60000 : null
  return {
    ...base,
    km: isFinite(km) ? km : 0,
    fuel: isFinite(fuel) ? fuel : 0,
    rate: km > 0 ? (fuel / km) * 100 : null,
    run_min: isFinite(runMin) ? Math.round(runMin) : null,
    off_min: spanMin != null && isFinite(runMin) ? Math.max(0, Math.round(spanMin - runMin)) : null,
    avg_speed: isFinite(Number(d.travelAvgDuration)) ? Number(d.travelAvgDuration) * 3.6 : null,
    start_time: sDt ? sDt.toISOString() : null,
    end_time: eDt ? eDt.toISOString() : null,
    has_data: true,
    source: 'df',
  }
}

function calcOverspeed(points, threshold) {
  let segments = 0, overPoints = 0, maxSpeed = 0, seconds = 0, cur = null
  const close = () => {
    if (!cur) return
    segments++
    seconds += Math.max(0, Math.round((cur.end - cur.start) / 1000))
    cur = null
  }
  points.forEach((p) => {
    if (p.speed > maxSpeed) maxSpeed = p.speed
    if (p.speed > threshold) {
      overPoints++
      if (!cur) cur = { start: p.t, end: p.t }
      else cur.end = p.t
    } else close()
  })
  close()
  return { segments, overPoints, maxSpeed, seconds }
}

function distanceM(a, b) {
  const R = 6371000
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

function calcStay(points, minMinutes, radiusM) {
  let count = 0, maxMin = 0, totalMin = 0, cluster = null
  const close = () => {
    if (!cluster) return
    const m = Math.round((cluster.end - cluster.start) / 60000)
    if (m >= minMinutes) {
      count++
      totalMin += m
      if (m > maxMin) maxMin = m
    }
    cluster = null
  }
  points.forEach((p) => {
    if (p.speed < 3) {
      if (!cluster) cluster = { start: p.t, end: p.t, head: p }
      else if (distanceM(cluster.head, p) <= radiusM) cluster.end = p.t
      else { close(); cluster = { start: p.t, end: p.t, head: p } }
    } else close()
  })
  close()
  return { count, maxMin, totalMin }
}

/* ---------------- 主流程 ---------------- */
async function main() {
  await login()
  console.log(`✓ 匿名登录 OK，区间 ${START} ~ ${END}（${dates.length} 天）`)

  const vs = await rest('vehicles?select=plate,vin,org,customer_id&vin=not.is.null')
  if (!vs.ok) throw new Error('读 vehicles 失败：' + JSON.stringify(vs.data).slice(0, 200))
  const vehicles = (vs.data || []).filter((v) => v.vin && v.plate)
  console.log(`✓ 车辆 ${vehicles.length} 台`)

  /* 阈值：与提醒设置同源 */
  const cfg = { ...DEFAULT_CFG }
  const al = await rest('ele_fence_alerts?select=alert_type,speed_threshold,stay_duration,stay_radius')
  if (al.ok) {
    (al.data || []).forEach((x) => {
      if (x.alert_type === 'speeding' && x.speed_threshold) cfg.speed = Number(x.speed_threshold)
      if (x.alert_type === 'staying') {
        if (x.stay_duration) cfg.stayMin = Number(x.stay_duration)
        if (x.stay_radius) cfg.stayRadius = Number(x.stay_radius)
      }
    })
  }
  console.log(`✓ 阈值：超速 >${cfg.speed}km/h，停留 ≥${cfg.stayMin}分钟 / ${cfg.stayRadius}m`)

  /* ---------- 写权限探测 ---------- */
  if (args.probe) {
    const v = vehicles[0]
    const r1 = await rest('vehicle_daily_stats?on_conflict=vin,stat_date', {
      method: 'POST',
      body: [{ ...oilToRow(v, START, null) }],
      prefer: 'resolution=merge-duplicates,return=minimal',
    })
    console.log('写 vehicle_daily_stats →', r1.status, JSON.stringify(r1.data).slice(0, 200))
    const r2 = await rest('vehicle_behavior_daily?on_conflict=vin,stat_date', {
      method: 'POST',
      body: [{
        vin: v.vin, stat_date: START, plate: v.plate, org: v.org || null,
        customer_id: v.customer_id != null ? String(v.customer_id) : null,
        overspeed_segments: 0, overspeed_points: 0, overspeed_max_speed: null,
        overspeed_seconds: 0, stay_count: 0, stay_max_min: 0, stay_total_min: 0,
        max_speed: null, track_points: 0, has_data: false, source: 'df',
        updated_at: new Date().toISOString(),
      }],
      prefer: 'resolution=merge-duplicates,return=minimal',
    })
    console.log('写 vehicle_behavior_daily →', r2.status, JSON.stringify(r2.data).slice(0, 200))
    return
  }

  /* ---------- 已算过的跳过 ---------- */
  const doneMile = new Set()
  const doneBeh = new Set()
  if (!FORCE) {
    for (const [tbl, set] of [['vehicle_daily_stats', doneMile], ['vehicle_behavior_daily', doneBeh]]) {
      const r = await rest(`${tbl}?select=vin,stat_date&stat_date=gte.${START}&stat_date=lte.${END}&limit=5000`)
      if (r.ok) (r.data || []).forEach((x) => set.add(`${x.vin}|${String(x.stat_date).slice(0, 10)}`))
    }
  }

  const tasks = []
  vehicles.forEach((v) => dates.forEach((d) => tasks.push({ v, d })))
  console.log(`✓ 待处理 ${tasks.length} 车日（已有：里程 ${doneMile.size} / 行为 ${doneBeh.size}）`)

  let cur = 0
  let okMile = 0, okBeh = 0, skip = 0
  const errors = []

  const worker = async () => {
    while (cur < tasks.length) {
      const { v, d } = tasks[cur++]

      if (ONLY !== 'behavior' && !doneMile.has(`${v.vin}|${d}`)) {
        const oil = await fetchOil(v.vin, d)
        if (!oil.ok) {
          if (errors.length < 10) errors.push(`里程 ${v.plate} ${d}: ${oil.reason}`)
        } else {
          const row = oilToRow(v, d, oil.data || null)
          const w = await rest('vehicle_daily_stats?on_conflict=vin,stat_date', {
            method: 'POST', body: [row], prefer: 'resolution=merge-duplicates,return=minimal',
          })
          if (w.ok) okMile++
          else if (errors.length < 10) errors.push(`里程写库 ${v.plate} ${d}: ${JSON.stringify(w.data).slice(0, 120)}`)
        }
      } else if (ONLY !== 'behavior') skip++

      if (ONLY !== 'mileage' && !doneBeh.has(`${v.vin}|${d}`)) {
        const tr = await fetchTrack(v.vin, d)
        if (!tr.ok) {
          if (errors.length < 10) errors.push(`行为 ${v.plate} ${d}: ${tr.reason}`)
        } else {
          const pts = tr.points
          const over = calcOverspeed(pts, cfg.speed)
          const stay = calcStay(pts, cfg.stayMin, cfg.stayRadius)
          const row = {
            vin: v.vin, stat_date: d, plate: v.plate, org: v.org || null,
            customer_id: v.customer_id != null ? String(v.customer_id) : null,
            overspeed_segments: over.segments, overspeed_points: over.overPoints,
            overspeed_max_speed: over.maxSpeed ? Math.round(over.maxSpeed * 10) / 10 : null,
            overspeed_seconds: over.seconds,
            stay_count: stay.count, stay_max_min: stay.maxMin, stay_total_min: stay.totalMin,
            max_speed: over.maxSpeed ? Math.round(over.maxSpeed * 10) / 10 : null,
            track_points: pts.length, has_data: pts.length > 0, source: 'df',
            updated_at: new Date().toISOString(),
          }
          const w = await rest('vehicle_behavior_daily?on_conflict=vin,stat_date', {
            method: 'POST', body: [row], prefer: 'resolution=merge-duplicates,return=minimal',
          })
          if (w.ok) okBeh++
          else if (errors.length < 10) errors.push(`行为写库 ${v.plate} ${d}: ${JSON.stringify(w.data).slice(0, 120)}`)
        }
      }
    }
  }

  const t0 = Date.now()
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length || 1) }, worker))
  console.log(`\n✓ 完成：里程 ${okMile} 行 / 行为 ${okBeh} 行，跳过 ${skip}，耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s`)
  if (errors.length) {
    console.log('⚠️ 失败样例：')
    errors.forEach((e) => console.log('   ' + e))
  }
}

main().catch((e) => { console.error('FAIL', e); process.exit(1) })
