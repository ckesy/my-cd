/**
 * 运营报表 · 逐日统计读取层
 * ============================================================
 * 数据来源：vehicle_daily_stats（由 supabase/functions/op-stats-sync 定时写入）
 * 前端只做「一次查询 + 本地聚合」，不再逐车逐天打东风接口。
 * 没同步到的日期仍然保留实时兜底（见 OperationSummary 的 getDay/getRange）。
 * ============================================================
 */
import { supabase } from './supabase'

/** 云函数 HTTP 网关（与 dongfeng-lostlocation 同域） */
const SYNC_URL =
  'https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com/opStatsSync'

const COLS = 'vin,stat_date,plate,org,customer_id,km,fuel,rate,run_min,off_min,avg_speed,start_time,end_time,has_data'

/**
 * 拉取区间内的逐日统计（一次请求拿回全部车辆）
 * @param {{start:string,end:string,customerId?:string|null,org?:string}} opts
 */
export async function fetchDailyStats({ start, end, customerId, org } = {}) {
  let q = supabase.from('vehicle_daily_stats').select(COLS)
    .gte('stat_date', start).lte('stat_date', end)
  if (customerId) q = q.eq('customer_id', customerId)
  if (org) q = q.eq('org', org)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

/** 单行 → 前端统一结构 */
export function rowToStat(r) {
  if (!r) return null
  return {
    km: Number(r.km) || 0,
    fuel: Number(r.fuel) || 0,
    rate: r.rate == null ? null : Number(r.rate),
    runMin: r.run_min == null ? null : Number(r.run_min),
    offMin: r.off_min == null ? null : Number(r.off_min),
    avgSpeed: r.avg_speed == null ? null : Number(r.avg_speed),
    startTime: r.start_time || '',
    endTime: r.end_time || '',
    hasData: r.has_data !== false,
  }
}

/** 多天汇总 → 区间统计（口径与实时接口一致） */
export function aggregate(rows) {
  if (!rows || !rows.length) return null
  let km = 0
  let fuel = 0
  let runMin = 0
  let offMin = 0
  let speedSum = 0
  let speedN = 0
  let start = ''
  let end = ''
  rows.forEach((r) => {
    km += Number(r.km) || 0
    fuel += Number(r.fuel) || 0
    runMin += Number(r.run_min) || 0
    offMin += Number(r.off_min) || 0
    if (r.avg_speed != null) { speedSum += Number(r.avg_speed); speedN++ }
    if (r.start_time && (!start || r.start_time < start)) start = r.start_time
    if (r.end_time && (!end || r.end_time > end)) end = r.end_time
  })
  return {
    km,
    fuel,
    rate: km > 0 ? (fuel / km) * 100 : null,
    runMin: runMin || null,
    offMin: offMin || null,
    avgSpeed: speedN ? speedSum / speedN : null,
    startTime: start,
    endTime: end,
  }
}

/**
 * 触发云函数批量同步（会写库）
 * 走 CloudBase HTTP 访问服务，与 dongfeng-lostlocation 同一套网关。
 * @param {{days?:number,start?:string,end?:string,force?:boolean}} opts
 */
export async function triggerSync(opts = {}) {
  let res
  try {
    res = await fetch(SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: 2, ...opts }),
    })
  } catch {
    // 跨域被拦 / 域名不通，浏览器只会给 "Failed to fetch"，这里换成能看懂的说明
    throw new Error('同步服务不可达：云函数 opStatsSync 还没部署，或没有开启 HTTP 访问服务')
  }
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }

  if (res.status === 404) {
    throw new Error('同步云函数还没部署（cloudfunctions/opStatsSync）')
  }
  if (!res.ok) {
    throw new Error(data?.error || data?.message || `同步失败 HTTP ${res.status}`)
  }
  // ⚠️ 函数内部异常时网关仍返回 200，必须看 ok 字段，否则会把失败当成功
  if (data && data.ok === false) {
    throw new Error(data.error || '同步执行失败')
  }
  // HTTP 访问服务有时会把返回值再包一层
  return data?.data && typeof data.data === 'object' && 'written' in data.data ? data.data : data
}
