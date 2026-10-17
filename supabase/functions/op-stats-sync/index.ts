import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2/cors'

/**
 * 运营报表 · 逐日统计同步任务
 * ============================================================
 * 作用：批量拉取东风 tripAnalysisOil，按「车 × 天」落到 vehicle_daily_stats。
 * 调用方式：
 *   POST /functions/v1/op-stats-sync
 *   body: { "days": 3 }                        # 补最近 3 天（默认）
 *         { "start": "2026-09-01", "end": "2026-10-17" }   # 指定区间
 *         { "force": true }                  # 已同步的也重拉
 *         { "vins": ["LGAG..."] }            # 只同步部分车（调试用）
 *
 * 建议定时：每天 06:00 跑一次 { days: 2 }（东风数据有 1 天延迟，补昨天+前天最稳）。
 * 也可由前端「同步」按钮手动触发。
 * ============================================================
 */

const DF_URL = 'https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/track/tripAnalysisOil'
const DF_TOKEN_FALLBACK = 'c40c7311ff604a598b9fb791a63e9deb'
const FETCH_TIMEOUT = 25000
const CONCURRENCY = 6

const SB_URL = Deno.env.get('SUPABASE_URL') || ''
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const DF_TOKEN = Deno.env.get('DONGFENG_TOKEN') || DF_TOKEN_FALLBACK

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const ymd = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const addDays = (s: string, n: number) => {
  const d = new Date(s.replace(/-/g, '/') + ' 00:00:00')
  d.setDate(d.getDate() + n)
  return ymd(d)
}

const diffDays = (s: string, e: string) =>
  Math.round((new Date(e.replace(/-/g, '/')).getTime() - new Date(s.replace(/-/g, '/')).getTime()) / 86400000)

async function sb(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

/** 单车某天 */
async function fetchOil(vin: string, date: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  try {
    const qs = new URLSearchParams({
      token: DF_TOKEN,
      carId: vin,
      startTime: date,
      endTime: date,
    })
    // ⚠️ 只能 POST，参数在 query，body 传 {}
    const res = await fetch(`${DF_URL}?${qs.toString()}`, {
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

function toRow(v: any, date: string, d: any) {
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
  const sMs = d.startTime ? new Date(String(d.startTime).replace(/-/g, '/')).getTime() : 0
  const eMs = d.endTime ? new Date(String(d.endTime).replace(/-/g, '/')).getTime() : 0
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
    start_time: d.startTime ? new Date(String(d.startTime).replace(/-/g, '/')).toISOString() : null,
    end_time: d.endTime ? new Date(String(d.endTime).replace(/-/g, '/')).toISOString() : null,
    has_data: true,
    source: 'df',
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (!SB_URL || !SB_KEY) return json({ error: '缺少 SUPABASE_URL / SERVICE_ROLE_KEY' }, 500)

  const startedAt = new Date()
  let logId: number | null = null

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const days = Number(body.days) || 3
    const force = !!body.force
    const onlyVins: string[] = Array.isArray(body.vins) ? body.vins : []

    // 默认：昨天往前 days 天（东风有 1 天延迟，昨天未必有数，但一起补）
    const end = body.end || ymd(new Date(Date.now() - 86400000))
    const start = body.start || addDays(end, -(days - 1))
    if (diffDays(start, end) < 0) return json({ error: 'start 不能大于 end' }, 400)
    if (diffDays(start, end) > 62) return json({ error: '一次最多同步 62 天' }, 400)

    const dates: string[] = []
    for (let i = 0; i <= diffDays(start, end); i++) dates.push(addDays(start, i))

    // 车辆
    let vehicles = await sb('vehicles?select=plate,vin,org,customer_id&vin=not.is.null')
    vehicles = (vehicles || []).filter((v: any) => v.vin && v.plate)
    if (onlyVins.length) vehicles = vehicles.filter((v: any) => onlyVins.includes(v.vin))

    // 日志
    const log = await sb('op_stats_sync_log', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ date_from: start, date_to: end, vehicles: vehicles.length }),
    })
    logId = Array.isArray(log) ? log[0]?.id : null

    // 已同步的（非 force 时跳过）
    let done = new Set<string>()
    if (!force && vehicles.length) {
      const rows = await sb(
        `vehicle_daily_stats?select=vin,stat_date&stat_date=gte.${start}&stat_date=lte.${end}`,
      )
      done = new Set((rows || []).map((r: any) => `${r.vin}|${r.stat_date}`))
    }

    let ok = 0
    let fail = 0
    let empty = 0
    const errors: string[] = []

    const tasks: { v: any; date: string }[] = []
    for (const v of vehicles) {
      for (const date of dates) {
        if (done.has(`${v.vin}|${date}`)) continue
        tasks.push({ v, date })
      }
    }

    // 并发池
    let cursor = 0
    const run = async () => {
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
          await sb('vehicle_daily_stats?on_conflict=vin,stat_date', {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify([row]),
          })
          ok++
          if (res.empty) empty++
        } catch (e) {
          fail++
          if (errors.length < 8) errors.push(`${v.plate} ${date}: 写库失败 ${e.message}`)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length || 1) }, run))

    if (logId) {
      await sb(`op_stats_sync_log?id=eq.${logId}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          finished_at: new Date().toISOString(),
          ok_count: ok,
          fail_count: fail,
          note: errors.length ? errors.join(' | ') : null,
        }),
      }).catch(() => {})
    }

    return json({
      ok: true,
      range: [start, end],
      vehicles: vehicles.length,
      tasks: tasks.length,
      written: ok,
      empty,
      failed: fail,
      elapsedMs: Date.now() - startedAt.getTime(),
      errors,
    })
  } catch (e) {
    if (logId) {
      await sb(`op_stats_sync_log?id=eq.${logId}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ finished_at: new Date().toISOString(), note: String(e.message || e) }),
      }).catch(() => {})
    }
    return json({ error: String(e.message || e) }, 500)
  }
})
