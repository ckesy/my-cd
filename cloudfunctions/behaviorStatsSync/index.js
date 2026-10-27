/**
 * 云函数：behaviorStatsSync
 * ============================================================
 * 逐车拉当天轨迹（track/history），算「超速段」与「停留超时」，写 vehicle_behavior_daily。
 * 大屏只读这张表 —— 不在前端逐车跑轨迹（128 台要几分钟，大屏会转圈）。
 *
 * 触发方式：
 *   1) 定时触发器：Cron `0 30 1 * * * *`（每天 01:30，跑前一天的账）
 *   2) 控制台「测试」：{"days":2} / {"date":"2026-10-24"} / {"date":"2026-10-24","vins":["..."]}
 *   3) HTTP 访问：POST /behaviorStatsSync {"days":1}
 *
 * 环境变量：
 *   CLOUDBASE_APIKEY  HTTP 调用时必须
 *   DONGFENG_TOKEN    可选，默认内置
 *   RDB_SCHEMA        可选，默认 public
 *
 * ⚠️ 阈值不写死：读 ele_fence_alerts（alert_type='speeding'/'staying'），
 *    与大屏、提醒查询页共用同一份配置，避免两处口径不一致。
 * ⚠️ 轨迹接口是 GET；云函数 Node 16 及以下没有全局 fetch，统一用 https。
 * ============================================================
 */
const https = require('https')

let tcb = null
try {
  tcb = require('@cloudbase/node-sdk')
} catch (e) {
  tcb = null
}

const DF_TRACK_URL = 'https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/track/history'
const DF_TOKEN = process.env.DONGFENG_TOKEN || 'c40c7311ff604a598b9fb791a63e9deb'
const TIMEOUT = 22000
const CONCURRENCY = 6
const MAX_DAYS = 15

const DEFAULT_SPEED_THRESHOLD = 80    // km/h
const DEFAULT_STAY_MINUTES = 30       // 分钟
const DEFAULT_STAY_RADIUS = 200       // 米
const IDLE_SPEED = 3                  // 低于这个速度视为静止

let db = null
function getDb() {
  if (db) return db
  if (!tcb) {
    throw new Error('缺少依赖 @cloudbase/node-sdk：请在云函数面板点「云端安装依赖」')
  }
  const app = tcb.init({
    env: process.env.TCB_ENV || 'wuxian-token-d0guymjkpadcd1f22',
    ...(process.env.CLOUDBASE_APIKEY ? { accessKey: process.env.CLOUDBASE_APIKEY } : {}),
  })
  db = app.rdb({ database: process.env.RDB_SCHEMA || 'public' })
  return db
}

/* ---------- 极简 GET（兼容 Node 12/14/16） ---------- */
function getJson(urlStr, timeoutMs = TIMEOUT) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'GET',
        timeout: timeoutMs,
        headers: { Accept: 'application/json' },
      },
      (res) => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (c) => { data += c })
        res.on('end', () => resolve({ status: res.statusCode, text: data }))
      },
    )
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    req.end()
  })
}

/* ---------- 时间（云函数跑在 UTC，一律按北京时间理解） ---------- */
const todayBJ = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)
const addDays = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10)
const diffDays = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400e3)

const parseDT = (s) => {
  if (!s) return null
  const t = String(s).trim().replace(/-/g, '/')
  const [dp, tp] = t.split(' ')
  const d = new Date(`${dp.replace(/\//g, '-')}T${tp || '00:00:00'}+08:00`)
  return isNaN(d.getTime()) ? null : d
}

/* ---------- 轨迹 ---------- */
async function fetchTrack(vin, date) {
  try {
    const qs = new URLSearchParams({
      token: DF_TOKEN,
      carId: vin,
      beginTime: `${date} 00:00:00`,
      endTime: `${date} 23:59:59`,
    })
    const res = await getJson(`${DF_TRACK_URL}?${qs.toString()}`)
    if (res.status !== 200) return { ok: false, reason: `http ${res.status}` }
    const json = JSON.parse(res.text)
    if (json.code !== 1 || !Array.isArray(json.data)) {
      return { ok: true, points: [] }
    }
    const points = json.data
      .map((p) => {
        const lng = parseFloat(p.longitude)
        const lat = parseFloat(p.latitude)
        const speed = parseFloat(p.velocity) || 0
        const d = parseDT(p.sendTime)
        return d && isFinite(lng) && isFinite(lat)
          ? { lng, lat, speed, t: d.getTime() }
          : null
      })
      .filter(Boolean)
      .sort((a, b) => a.t - b.t)
    return { ok: true, points }
  } catch (e) {
    return { ok: false, reason: e.message }
  }
}

/* ---------- 超速：连续 velocity > 阈值 的点算一段 ---------- */
function calcOverspeed(points, threshold) {
  let segments = 0
  let overPoints = 0
  let maxSpeed = 0
  let seconds = 0
  let cur = null

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
    } else {
      close()
    }
  })
  close()
  return { segments, overPoints, maxSpeed, seconds }
}

/* ---------- 停留：静止且在半径内的一簇，时长 >= 阈值算一次 ---------- */
function distanceM(a, b) {
  const R = 6371000
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

function calcStay(points, minMinutes, radiusM) {
  let count = 0
  let maxMin = 0
  let totalMin = 0
  let cluster = null

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
    if (p.speed < IDLE_SPEED) {
      if (!cluster) cluster = { start: p.t, end: p.t, head: p }
      else if (distanceM(cluster.head, p) <= radiusM) cluster.end = p.t
      else { close(); cluster = { start: p.t, end: p.t, head: p } }
    } else {
      close()
    }
  })
  close()
  return { count, maxMin, totalMin }
}

/* ---------- 阈值：读取提醒配置（与大屏 / 查询页同一份） ---------- */
async function loadConfig(rdb) {
  const cfg = {
    speed: DEFAULT_SPEED_THRESHOLD,
    stayMin: DEFAULT_STAY_MINUTES,
    stayRadius: DEFAULT_STAY_RADIUS,
  }
  try {
    const r = await rdb.from('ele_fence_alerts')
      .select('alert_type,speed_threshold,stay_duration,stay_radius')
    if (!r.error && Array.isArray(r.data)) {
      r.data.forEach((x) => {
        if (x.alert_type === 'speeding' && x.speed_threshold) cfg.speed = Number(x.speed_threshold)
        if (x.alert_type === 'staying') {
          if (x.stay_duration) cfg.stayMin = Number(x.stay_duration)
          if (x.stay_radius) cfg.stayRadius = Number(x.stay_radius)
        }
      })
    }
  } catch (e) { /* 读不到就用默认值 */ }
  return cfg
}

function readParams(event) {
  if (!event || typeof event !== 'object') return {}
  if (event.Type === 'Timer' || event.type === 'timer' || event.TriggerName) return {}
  if (typeof event.body === 'string') {
    let raw = event.body
    if (event.isBase64Encoded) raw = Buffer.from(raw, 'base64').toString('utf8')
    try { return JSON.parse(raw || '{}') } catch { return {} }
  }
  if (event.body && typeof event.body === 'object') return event.body
  return event
}

exports.main = async (event = {}, context = {}) => {
  const startedAt = Date.now()
  try {
    const params = readParams(event)

    if (event.httpMethod === 'GET' && !params.days && !params.date) {
      return {
        ok: true,
        service: 'behaviorStatsSync',
        node: process.version,
        usage: 'POST {"days":1} 或 {"date":"2026-10-24"}，默认跑昨天',
      }
    }

    const force = !!params.force
    const onlyVins = Array.isArray(params.vins) ? params.vins : []
    const days = Math.min(Number(params.days) || 1, MAX_DAYS)
    const end = params.date || params.end || addDays(todayBJ(), -1)
    const start = params.start || addDays(end, -(days - 1))

    if (diffDays(start, end) < 0) return { ok: false, error: 'start 不能大于 end' }

    const dates = []
    for (let i = 0; i <= diffDays(start, end); i++) dates.push(addDays(start, i))

    const rdb = getDb()
    const cfg = await loadConfig(rdb)

    const vres = await rdb.from('vehicles').select('plate,vin,org,customer_id')
    if (vres.error) {
      return {
        ok: false,
        error: `读 vehicles 失败：${vres.error.message || JSON.stringify(vres.error)}`,
        schema: process.env.RDB_SCHEMA || 'public',
      }
    }
    let vehicles = (vres.data || []).filter((v) => v.vin && v.plate)
    if (onlyVins.length) vehicles = vehicles.filter((v) => onlyVins.includes(v.vin))

    /* 已算过的跳过（force 可重算） */
    let doneSet = new Set()
    if (!force) {
      const r = await rdb.from('vehicle_behavior_daily').select('vin,stat_date')
        .gte('stat_date', start).lte('stat_date', end)
      if (!r.error) {
        doneSet = new Set((r.data || []).map((x) => `${x.vin}|${String(x.stat_date).slice(0, 10)}`))
      }
    }

    const tasks = []
    for (const v of vehicles) {
      for (const date of dates) {
        if (!doneSet.has(`${v.vin}|${date}`)) tasks.push({ v, date })
      }
    }

    let ok = 0, empty = 0, fail = 0
    const errors = []
    let cursor = 0
    const totals = { segments: 0, stay: 0, points: 0 }

    const worker = async () => {
      while (cursor < tasks.length) {
        const { v, date } = tasks[cursor++]
        const res = await fetchTrack(v.vin, date)
        if (!res.ok) {
          fail++
          if (errors.length < 8) errors.push(`${v.plate} ${date}: ${res.reason}`)
          continue
        }
        const pts = res.points
        const over = calcOverspeed(pts, cfg.speed)
        const stay = calcStay(pts, cfg.stayMin, cfg.stayRadius)

        const row = {
          vin: v.vin,
          stat_date: date,
          plate: v.plate,
          org: v.org || null,
          customer_id: v.customer_id != null ? String(v.customer_id) : null,
          overspeed_segments: over.segments,
          overspeed_points: over.overPoints,
          overspeed_max_speed: over.maxSpeed ? Math.round(over.maxSpeed * 10) / 10 : null,
          overspeed_seconds: over.seconds,
          stay_count: stay.count,
          stay_max_min: stay.maxMin,
          stay_total_min: stay.totalMin,
          max_speed: over.maxSpeed ? Math.round(over.maxSpeed * 10) / 10 : null,
          track_points: pts.length,
          has_data: pts.length > 0,
          source: 'df',
          updated_at: new Date().toISOString(),
        }

        try {
          const w = await rdb.from('vehicle_behavior_daily')
            .upsert([row], { onConflict: 'vin,stat_date' })
          if (w.error) throw new Error(w.error.message || JSON.stringify(w.error))
          ok++
          if (!pts.length) empty++
          totals.segments += over.segments
          totals.stay += stay.count
          totals.points += pts.length
        } catch (e) {
          fail++
          if (errors.length < 8) errors.push(`${v.plate} ${date}: 写库失败 ${e.message}`)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length || 1) }, worker))

    return {
      ok: true,
      range: [start, end],
      config: cfg,
      vehicles: vehicles.length,
      tasks: tasks.length,
      written: ok,
      empty,
      failed: fail,
      totals,
      elapsedMs: Date.now() - startedAt,
      errors,
    }
  } catch (e) {
    return {
      ok: false,
      error: e && e.message ? e.message : String(e),
      stack: e && e.stack ? String(e.stack).split('\n').slice(0, 4) : undefined,
      node: process.version,
      elapsedMs: Date.now() - startedAt,
    }
  }
}
