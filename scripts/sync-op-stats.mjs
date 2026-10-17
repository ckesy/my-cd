/**
 * 运营报表 · 逐日统计本地同步脚本
 * ============================================================
 * 用途：不部署云函数也能把东风数据补进 vehicle_daily_stats。
 *       适合先跑一次补历史，或放到服务器 crontab 里每天跑。
 *
 * 用法：
 *   CLOUDBASE_APIKEY='粘贴真实的Key' node scripts/sync-op-stats.mjs --days=7
 *   node scripts/sync-op-stats.mjs --start=2026-10-01 --end=2026-10-17
 *   node scripts/sync-op-stats.mjs --days=3 --force        # 已同步的也重拉
 *   node scripts/sync-op-stats.mjs --vins=LGAG...,LGAG...  # 只补几台
 *
 * 环境变量：
 *   CLOUDBASE_APIKEY  必填。云开发控制台 → 环境 → API Key（也叫「云开发 API Key」）
 *   TCB_ENV           可选，默认取项目里的环境 ID
 *
 * 注意：云开发 API Key 是服务端凭证，只在本地/服务器用，别放进前端。
 * ============================================================
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const tcb = require('@cloudbase/node-sdk')

const DF_URL = 'https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/track/tripAnalysisOil'
const DF_TOKEN = process.env.DONGFENG_TOKEN || 'c40c7311ff604a598b9fb791a63e9deb'
const ENV_ID = process.env.TCB_ENV || 'wuxian-token-d0guymjkpadcd1f22'
const CONCURRENCY = 5
const FETCH_TIMEOUT = 25000

/* ---------- 参数 ---------- */
const args = process.argv.slice(2)
const arg = (name, def = '') => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.split('=').slice(1).join('=') : def
}
const hasFlag = (name) => args.includes(`--${name}`)

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

/* ---------- API Key 校验（提前挡住“粘了占位符/带空格换行”） ---------- */
const rawKey = String(arg('key') || process.env.CLOUDBASE_APIKEY || '')
  .trim()
  .replace(/^['"]|['"]$/g, '')
  .replace(/\s+/g, '')

const days = Number(arg('days', '2')) || 2
const end = arg('end', addDays(todayBJ(), -1))
const start = arg('start', addDays(end, -(days - 1)))
const force = hasFlag('force')
const onlyVins = arg('vins') ? arg('vins').split(',').map((s) => s.trim()).filter(Boolean) : []

if (!rawKey) {
  console.error('\n缺少 API Key')
  console.error('获取方式：云开发控制台 → 选择环境 → 环境设置 / 管理 → API Key（API 密钥）→ 新建')
  console.error("示例：CLOUDBASE_APIKEY='eyJhbGciOi...' node scripts/sync-op-stats.mjs --days=7\n")
  process.exit(1)
}
if (!/^[\x21-\x7e]+$/.test(rawKey)) {
  console.error('\nAPI Key 里含有非 ASCII 字符，接口会报 Invalid character in header content')
  console.error('常见原因：')
  console.error('  1) 直接粘了文档里的占位符（比如「你的key」）')
  console.error('  2) 复制 Key 时带上了空格、换行或中文引号')
  console.error('  3) Key 本身不完整（只复制了一部分）')
  console.error(`当前取到的值（已打码）：${rawKey.slice(0, 4)}***${rawKey.slice(-4)}，长度 ${rawKey.length}`)
  console.error('请重新从控制台复制完整的 API Key 再试，建议用单引号包住。\n')
  process.exit(1)
}
if (diffDays(start, end) < 0) {
  console.error('start 不能大于 end')
  process.exit(1)
}

const app = tcb.init({ env: ENV_ID, accessKey: rawKey })
// node-sdk 默认拿 env 当 schema，网关会报 Invalid schema，显式给 public
const db = app.rdb({ database: process.env.RDB_SCHEMA || 'public' })

async function fetchOil(vin, date) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  try {
    const qs = new URLSearchParams({ token: DF_TOKEN, carId: vin, startTime: date, endTime: date })
    const res = await fetch(`${DF_URL}?${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: controller.signal,
    })
    if (!res.ok) return { ok: false, reason: `http ${res.status}` }
    const data = await res.json()
    if (data.code !== 1 || !data.data) return { ok: true, empty: true }
    return { ok: true, data: data.data }
  } catch (e) {
    return { ok: false, reason: e.message }
  } finally {
    clearTimeout(timer)
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

const dates = []
for (let i = 0; i <= diffDays(start, end); i++) dates.push(addDays(start, i))

console.log(`\n环境：${ENV_ID}`)
console.log(`Key：${rawKey.slice(0, 4)}***${rawKey.slice(-4)}（长度 ${rawKey.length}）`)
console.log(`区间：${start} ~ ${end}（${dates.length} 天）${force ? ' · 强制重拉' : ''}\n`)

const vres = await db.from('vehicles').select('plate,vin,org,customer_id')
if (vres.error) {
  console.error('读 vehicles 失败：', vres.error.message || vres.error)
  process.exit(1)
}
let vehicles = (vres.data || []).filter((v) => v.vin && v.plate)
if (onlyVins.length) vehicles = vehicles.filter((v) => onlyVins.includes(v.vin))
console.log(`车辆：${vehicles.length} 台`)

let doneSet = new Set()
if (!force) {
  const r = await db.from('vehicle_daily_stats').select('vin,stat_date')
    .gte('stat_date', start).lte('stat_date', end)
  if (!r.error) doneSet = new Set((r.data || []).map((x) => `${x.vin}|${String(x.stat_date).slice(0, 10)}`))
}

const tasks = []
for (const v of vehicles) {
  for (const date of dates) {
    if (!doneSet.has(`${v.vin}|${date}`)) tasks.push({ v, date })
  }
}
console.log(`待同步：${tasks.length} 条（已跳过 ${vehicles.length * dates.length - tasks.length} 条已存在）\n`)

let ok = 0
let empty = 0
let fail = 0
let cursor = 0
const errors = []
const t0 = Date.now()

const worker = async () => {
  while (cursor < tasks.length) {
    const { v, date } = tasks[cursor++]
    const res = await fetchOil(v.vin, date)
    if (!res.ok) {
      fail++
      if (errors.length < 10) errors.push(`${v.plate} ${date}: ${res.reason}`)
      continue
    }
    const row = toRow(v, date, res.empty ? null : res.data)
    try {
      const w = await db.from('vehicle_daily_stats').upsert([row], { onConflict: 'vin,stat_date' })
      if (w.error) throw new Error(w.error.message || 'upsert failed')
      ok++
      if (res.empty) empty++
      const done = ok + fail
      if (done % 20 === 0) {
        process.stdout.write(`  进度 ${done}/${tasks.length} · 成功 ${ok} · 无数据 ${empty} · 失败 ${fail}\r`)
      }
    } catch (e) {
      fail++
      if (errors.length < 10) errors.push(`${v.plate} ${date}: 写库失败 ${e.message}`)
    }
  }
}

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length || 1) }, worker))

try {
  await db.from('op_stats_sync_log').insert([{
    date_from: start, date_to: end, vehicles: vehicles.length,
    ok_count: ok, fail_count: fail,
    note: errors.length ? errors.join(' | ') : null,
    finished_at: new Date().toISOString(),
  }])
} catch { /* 日志失败不影响结果 */ }

console.log(`\n\n完成：写入 ${ok} 条（其中 ${empty} 条当天无运行），失败 ${fail} 条，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
if (errors.length) {
  console.log('\n失败样例：')
  errors.forEach((e) => console.log('  - ' + e))
}
