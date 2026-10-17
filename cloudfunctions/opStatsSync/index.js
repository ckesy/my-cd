/**
 * 云函数：opStatsSync
 * ============================================================
 * 批量拉取东风 tripAnalysisOil（按车 × 天），写入 vehicle_daily_stats。
 *
 * 触发方式：
 *   1) 定时触发器：Cron `0 0 6 * * * *`，参数 {"days":2}
 *   2) 控制台「测试」：{"days":7} / {"start":"2026-10-01","end":"2026-10-17"}
 *   3) HTTP 访问：POST /opStatsSync  {"days":2}
 *
 * 环境变量：
 *   CLOUDBASE_APIKEY  HTTP 调用时必须（SDK 用它换凭证）
 *   DONGFENG_TOKEN    可选，默认内置
 *   TCB_ENV           可选，默认当前环境
 *
 * ⚠️ 用 https 模块而不是 fetch：云函数 Node 16 及以下没有全局 fetch，
 *    否则会报 "fetch is not defined"。
 * ⚠️ 所有异常都 return 出去，否则网关只会回 FUNCTIONS_INVOCATION_FAILED。
 * ============================================================
 */
const https = require('https')

// 依赖没装时报错要说人话，否则网关只给 FUNCTIONS_INVOCATION_FAILED
let tcb = null
try {
  tcb = require('@cloudbase/node-sdk')
} catch (e) {
  tcb = null
}

const DF_URL = 'https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/track/tripAnalysisOil'
const DF_TOKEN = process.env.DONGFENG_TOKEN || 'c40c7311ff604a598b9fb791a63e9deb'
const FETCH_TIMEOUT = 25000
const CONCURRENCY = 5
const MAX_DAYS = 62

let db = null
function getDb() {
  if (db) return db
  if (!tcb) {
    throw new Error('缺少依赖 @cloudbase/node-sdk：请在云函数面板点「云端安装依赖」，或上传 node_modules 后重试')
  }
  // ⚠️ 不能用 tcb.SYMBOL_DEFAULT_ENV（Symbol），配了 accessKey 时 SDK 会拼 URL 失败：
  //    TypeError: Cannot convert a Symbol value to a string
  const app = tcb.init({
    env: process.env.TCB_ENV || 'wuxian-token-d0guymjkpadcd1f22',
    accessKey: process.env.CLOUDBASE_APIKEY,
  })
  // ⚠️ node-sdk 的 rdb() 默认把 env 当 schema 发（Accept-Profile），网关会回
  //    "Invalid schema: <envId>"；这里必须显式指定 schema（默认 public）。
  db = app.rdb({ database: process.env.RDB_SCHEMA || 'public' })
  return db
}

/* ---------- 极简 POST（兼容 Node 12/14/16） ---------- */
function postJson(urlStr, body, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const payload = body || '{}'
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
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
    req.write(payload)
    req.end()
  })
}

/* ⚠️ 云函数运行在 UTC：所有“今天/昨天”都按北京时间算，否则会差一天 */
const todayBJ = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)
const ymd = (d) => new Date(d.getTime() + 8 * 3600e3).toISOString().slice(0, 10)
/** 纯日期加减（用 UTC 做锚点，和运行环境时区无关） */
const addDays = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10)
const diffDays = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400e3)

/** 解析「2026-10-16 06:34:06」，按北京时间（+08:00）理解 */
const parseDT = (s) => {
  if (!s) return null
  const t = String(s).trim().replace(/-/g, '/')
  const [dpart, tpart] = t.split(' ')
  const iso = `${dpart.replace(/\//g, '-')}T${tpart || '00:00:00'}+08:00`
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}
async function fetchOil(vin, date) {
  try {
    const qs = new URLSearchParams({ token: DF_TOKEN, carId: vin, startTime: date, endTime: date })
    const res = await postJson(`${DF_URL}?${qs.toString()}`, '{}', FETCH_TIMEOUT)
    if (res.status !== 200) return { ok: false, reason: `http ${res.status}` }
    const data = JSON.parse(res.text)
    if (data.code !== 1 || !data.data) return { ok: true, empty: true }
    return { ok: true, data: data.data }
  } catch (e) {
    return { ok: false, reason: e.message }
  }
}

function toRow(v, date, d) {
  if (!d) {
    return {
      vin: v.vin, stat_date: date, plate: v.plate, org: v.org, customer_id: v.customer_id,
      km: 0, fuel: 0, rate: null, run_min: null, off_min: null, avg_speed: null,
      start_time: null, end_time: null, has_data: false, source: 'df',
    }
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
    vin: v.vin,
    stat_date: date,
    plate: v.plate,
    org: v.org,
    customer_id: v.customer_id,
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

/** 解析入参：兼容定时触发 / 控制台测试 / HTTP 调用 */
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
    // 健康检查：GET 或空调用
    const params = readParams(event)
    if (event.httpMethod === 'GET' && !params.days && !params.start) {
      return {
        ok: true,
        service: 'opStatsSync',
        node: process.version,
        hasApiKey: !!process.env.CLOUDBASE_APIKEY,
        usage: 'POST {"days":2} 或 {"start":"2026-10-01","end":"2026-10-17"}',
      }
    }

    const force = !!params.force
    const onlyVins = Array.isArray(params.vins) ? params.vins : []
    const days = Math.min(Number(params.days) || 2, MAX_DAYS)
    const end = params.end || addDays(todayBJ(), -1)
    const start = params.start || addDays(end, -(days - 1))

    if (diffDays(start, end) < 0) return { ok: false, error: 'start 不能大于 end' }
    if (diffDays(start, end) + 1 > MAX_DAYS) return { ok: false, error: `一次最多 ${MAX_DAYS} 天` }

    const dates = []
    for (let i = 0; i <= diffDays(start, end); i++) dates.push(addDays(start, i))

    const rdb = getDb()

    const vres = await rdb.from('vehicles').select('plate,vin,org,customer_id')
    if (vres.error) {
      const msg = vres.error.message || JSON.stringify(vres.error)
      const hint = /Invalid schema/i.test(msg)
        ? '（schema 不对：把函数环境变量 RDB_SCHEMA 设成你的 schema，云开发 PostgreSQL 通常是 public）'
        : ''
      return { ok: false, error: `读 vehicles 失败：${msg}${hint}`, schema: process.env.RDB_SCHEMA || 'public' }
    }
    let vehicles = (vres.data || []).filter((v) => v.vin && v.plate)
    if (onlyVins.length) vehicles = vehicles.filter((v) => onlyVins.includes(v.vin))

    let doneSet = new Set()
    if (!force) {
      const r = await rdb.from('vehicle_daily_stats').select('vin,stat_date')
        .gte('stat_date', start).lte('stat_date', end)
      if (!r.error) doneSet = new Set((r.data || []).map((x) => `${x.vin}|${String(x.stat_date).slice(0, 10)}`))
    }

    const tasks = []
    for (const v of vehicles) {
      for (const date of dates) {
        if (!doneSet.has(`${v.vin}|${date}`)) tasks.push({ v, date })
      }
    }

    let ok = 0
    let empty = 0
    let fail = 0
    const errors = []
    let cursor = 0

    const worker = async () => {
      while (cursor < tasks.length) {
        const { v, date } = tasks[cursor++]
        const res = await fetchOil(v.vin, date)
        if (!res.ok) {
          fail++
          if (errors.length < 8) errors.push(`${v.plate} ${date}: ${res.reason}`)
          continue
        }
        const row = toRow(v, date, res.empty ? null : res.data)
        try {
          const w = await rdb.from('vehicle_daily_stats').upsert([row], { onConflict: 'vin,stat_date' })
          if (w.error) throw new Error(w.error.message || JSON.stringify(w.error))
          ok++
          if (res.empty) empty++
        } catch (e) {
          fail++
          if (errors.length < 8) errors.push(`${v.plate} ${date}: 写库失败 ${e.message}`)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length || 1) }, worker))

    try {
      await rdb.from('op_stats_sync_log').insert([{
        date_from: start, date_to: end, vehicles: vehicles.length,
        ok_count: ok, fail_count: fail,
        note: errors.length ? errors.join(' | ') : null,
        finished_at: new Date().toISOString(),
      }])
    } catch (e) { /* 日志失败忽略 */ }

    return {
      ok: true,
      range: [start, end],
      vehicles: vehicles.length,
      tasks: tasks.length,
      written: ok,
      empty,
      failed: fail,
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
