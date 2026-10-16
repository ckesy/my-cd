/**
 * 运单进度计算（Web 端）
 * ============================================================
 * 数据来源
 *   1. 东风历史轨迹 `track/history`        → 已行驶里程 + 车辆当前位置
 *   2. `dongfeng-lostlocation`（HTTP 网关）→ 轨迹为空时的位置兜底
 *   3. 高德驾车规划（发布时算一次，落 waybills.plan_distance / plan_duration）
 *
 * ⭐ 进度口径（已与产品确认）
 *   已行驶   = 从「确认发车」（depart_time）起算的轨迹点逐点累加
 *              ← 不从接单起算，否则车辆在装货场内挪车会算进里程、比例虚高
 *   剩余里程 = plan_distance − 已行驶（小于 0 时按 0 计，并标记 overPlan）
 *   剩余时间 = plan_duration × (剩余里程 ÷ plan_distance)
 *   预计到达 = 现在 + 剩余时间
 *
 * ⚠️ 定位停更超过 30 分钟时标记 stale，界面不展示 ETA（不给假数字）
 */

import dayjs from 'dayjs'
import { supabase } from '@/utils/supabase'

export const DONGFENG_TRACK_URL =
  'https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/track/history'
export const DONGFENG_LIVE_URL =
  'https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com/dongfeng-lostlocation'

/* ⚠️ Token 目前走前端直连。该接口会回显任意 Origin，等于公开可读，
   建议后续改由云函数中转，届时只需把下面这行换成环境变量 */
export const DONGFENG_TOKEN =
  import.meta.env.VITE_DONGFENG_TOKEN || 'c40c7311ff604a598b9fb791a63e9deb'

export const TRACK_MAX_POINTS = 2000
export const STALE_MINUTES = 30

const currentUser = (() => {
  try {
    return JSON.parse(localStorage.getItem('currentUser') || '{}')
  } catch (e) {
    return {}
  }
})()

/* ============================================================
   基础工具
   ============================================================ */
export const parseTimeMs = (raw) => {
  if (!raw) return 0
  const ms = new Date(String(raw).trim().replace(/-/g, '/')).getTime()
  return isNaN(ms) ? 0 : ms
}

export const parseLngLat = (raw) => {
  if (!raw) return null
  if (Array.isArray(raw) && raw.length >= 2) {
    const lng = parseFloat(raw[0])
    const lat = parseFloat(raw[1])
    return !isNaN(lng) && !isNaN(lat) ? [lng, lat] : null
  }
  const m = String(raw).match(/(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)/)
  if (!m) return null
  const lng = parseFloat(m[1])
  const lat = parseFloat(m[2])
  return !isNaN(lng) && !isNaN(lat) ? [lng, lat] : null
}

/** 分钟 → 「3 时 20 分」 */
export const fmtDurationCn = (minutes) => {
  const min = Math.max(0, Math.round(Number(minutes) || 0))
  if (min < 1) return '不足 1 分钟'
  if (min < 60) return min + ' 分钟'
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} 时 ${m} 分` : `${h} 小时`
}

/** 公里数保留一位小数，「82.4 km」 */
export const fmtKm = (km) => {
  const v = Number(km) || 0
  return (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10) + ' km'
}

/** 「HH:mm」 */
export const fmtClock = (t) => {
  if (!t) return '--'
  const d = dayjs(typeof t === 'number' ? t : parseTimeMs(t) || t)
  return d.isValid() ? d.format('HH:mm') : '--'
}

/** 「MM-DD」 */
export const fmtDay = (t) => {
  const ms = typeof t === 'number' ? t : parseTimeMs(t)
  if (!ms) return '--'
  return dayjs(ms).format('MM-DD')
}

/* 球面距离（米），入参 [lng, lat] */
const toRad = (d) => (d * Math.PI) / 180
const EARTH_R = 6371008.8
export const haversine = (a, b) => {
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.sqrt(s))
}

/** 轨迹点逐点累加里程（米） */
export const sumDistance = (points) => {
  if (!Array.isArray(points) || points.length < 2) return 0
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += haversine([points[i - 1].lng, points[i - 1].lat], [points[i].lng, points[i].lat])
  }
  return total
}

/** 取 sinceIso 之后的轨迹点累计里程（米）；sinceIso 为空则算全程 */
export const traveledMetersSince = (points, sinceIso) => {
  if (!Array.isArray(points) || points.length < 2) return 0
  const since = sinceIso ? parseTimeMs(sinceIso) : 0
  const list = since ? points.filter((p) => parseTimeMs(p.time) >= since) : points
  return sumDistance(list)
}

/** 轨迹点抽稀：约 1 分钟一个点，长周期运单可能上万点 */
export const downsamplePoints = (points, max) => {
  const limit = max || TRACK_MAX_POINTS
  if (!Array.isArray(points) || points.length <= limit) return points || []
  const step = Math.ceil(points.length / limit)
  const out = []
  for (let i = 0; i < points.length; i += step) out.push(points[i])
  const last = points[points.length - 1]
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

/* ============================================================
   车辆解析
   ============================================================ */

/** 单车牌的运单才画位置/算里程；多车（『多种』/『N辆』）无法表达单车 */
export const pickVehiclePlate = (rec) => {
  if (!rec) return ''
  let assignments = rec.assignments
  if (typeof assignments === 'string' && assignments.trim()) {
    try {
      assignments = JSON.parse(assignments)
    } catch (e) {
      assignments = []
    }
  }
  const plates = []
  if (Array.isArray(assignments)) {
    assignments.forEach((a) => {
      const method = String((a && (a.method || a.assignMethod)) || '').trim()
      if (method !== 'vehicle') return
      const items = (a && a.items) || []
      items.forEach((it) => {
        const t = String((it && it.target) || '').trim()
        if (t) plates.push(t)
      })
    })
  }
  if (plates.length === 1) return plates[0]
  if (plates.length > 1) return ''
  const v = String(rec.vehicle || '').trim()
  if (!v || v === '多种' || v === '--' || /辆$/.test(v)) return ''
  return v
}

/** 车牌 → 完整 VIN（东风历史轨迹接口要的 carId） */
export async function resolveVin(plate) {
  const p = String(plate || '').trim()
  if (!p) return ''
  try {
    let q = supabase.from('vehicles').select('plate,vin').eq('plate', p).limit(1)
    if (currentUser.role !== 'admin' && currentUser.customerId) {
      q = q.eq('customer_id', currentUser.customerId)
    }
    const { data } = await q
    return String((data && data[0] && data[0].vin) || '').trim()
  } catch (e) {
    return ''
  }
}

/* ============================================================
   轨迹与定位
   ============================================================ */

/* 25 秒内的同一辆车只拉一次，避免 30 秒自动刷新把接口打满 */
const TRACK_CACHE = new Map()
const TRACK_TTL = 25 * 1000

/**
 * 历史行驶轨迹
 * @param {string} vin     完整 VIN
 * @param {string} beginAt 轨迹起点（一般传「确认发车」时间，没发车就用接单时间）
 */
export async function fetchTrack(vin, beginAt) {
  const key = `${vin}|${beginAt}`
  const hit = TRACK_CACHE.get(key)
  if (hit && Date.now() - hit.at < TRACK_TTL) return hit.points

  const params = new URLSearchParams({
    token: DONGFENG_TOKEN,
    carId: vin,
    beginTime: dayjs(parseTimeMs(beginAt) || Date.now()).format('YYYY-MM-DD HH:mm:ss'),
    endTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
  })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 20000)
  try {
    const res = await fetch(`${DONGFENG_TRACK_URL}?${params.toString()}`, {
      signal: controller.signal,
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const json = await res.json()
    if (json.code !== 1 || !Array.isArray(json.data)) return []
    const points = json.data
      .map((p) => ({
        lng: parseFloat(p.longitude),
        lat: parseFloat(p.latitude),
        speed: parseFloat(p.velocity) || 0,
        time: p.sendTime,
      }))
      .filter((p) => !isNaN(p.lng) && !isNaN(p.lat))
      .sort((a, b) => parseTimeMs(a.time) - parseTimeMs(b.time))
    TRACK_CACHE.set(key, { at: Date.now(), points })
    return points
  } finally {
    clearTimeout(timeoutId)
  }
}

/** 实时定位兜底（8s 超时），返回 { plate, lng, lat, speed, status, reportTime, locationText } */
export async function fetchRealtime(vin, plate) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(DONGFENG_LIVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vin }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (!response.ok) throw new Error('HTTP ' + response.status)
    const result = await response.json()
    if (result.code !== 1 || !Array.isArray(result.data) || result.data.length === 0) return null
    const sorted = [...result.data].sort((a, b) => parseTimeMs(b.time) - parseTimeMs(a.time))
    const latest = sorted[0]
    const lng = parseFloat(latest.lng)
    const lat = parseFloat(latest.lat)
    if (isNaN(lng) || isNaN(lat)) return null
    const speed = parseFloat(latest.speed) || 0
    const accOn = String(latest.accStatus || '').includes('开')
    const status = accOn ? (speed > 0 ? '行驶' : '静止') : '离线'
    return {
      plate,
      lng,
      lat,
      speed: Math.round(speed),
      status,
      reportTime: latest.time,
      reportAt: parseTimeMs(latest.time),
      locationText:
        latest.address || (status === '行驶' ? '行驶中' : status === '静止' ? '停车' : '离线'),
    }
  } catch (err) {
    clearTimeout(timeoutId)
    throw err
  }
}

/**
 * 取一条运输记录的车辆轨迹与当前位置
 * @param {object} rec 运单行
 * @param {object} [opts] { since: 轨迹起点，默认 depart_time || accept_time || create_time }
 * @returns {{plate,vin,points,current,error}}
 */
export async function loadVehicleTrip(rec, opts) {
  const plate = pickVehiclePlate(rec)
  if (!plate) return { plate: '', error: '该运输记录未指定单车，无法获取轨迹' }
  const vin = await resolveVin(plate)
  if (!vin) return { plate, error: `车辆 ${plate} 未配置 VIN，无法获取轨迹` }

  const since =
    (opts && opts.since) || rec.depart_time || rec.accept_time || rec.create_time || null
  let points = []
  let error = ''
  if (since) {
    try {
      points = await fetchTrack(vin, since)
    } catch (err) {
      error = '历史轨迹获取失败：' + (err.name === 'AbortError' ? '请求超时（20s）' : err.message)
    }
  }

  const rawLast = points.length ? points[points.length - 1] : null
  let current = null

  if (rawLast) {
    /* 轨迹接口不带 ACC 状态，用「最后上报距今多久」推断在线状态 */
    const gapMin = (Date.now() - parseTimeMs(rawLast.time)) / 60000
    const status = gapMin > STALE_MINUTES ? '离线' : rawLast.speed > 0 ? '行驶' : '静止'
    current = {
      plate,
      lng: rawLast.lng,
      lat: rawLast.lat,
      speed: Math.round(rawLast.speed),
      status,
      reportTime: rawLast.time,
      reportAt: parseTimeMs(rawLast.time),
      locationText:
        status === '离线'
          ? `离线（超过 ${STALE_MINUTES} 分钟未上报）`
          : status === '行驶'
            ? '行驶中'
            : '停车',
    }
  } else {
    try {
      current = await fetchRealtime(vin, plate)
      if (!current && !error) error = `车辆 ${plate} 暂无轨迹与定位数据`
    } catch (err) {
      if (!error) {
        error = '实时位置获取失败：' + (err.name === 'AbortError' ? '请求超时（8s）' : err.message)
      }
    }
  }

  return {
    plate,
    vin,
    points,
    current,
    error,
    rawCount: points.length,
    pointsDownsampled: downsamplePoints(points),
  }
}

/* ============================================================
   进度计算
   ============================================================ */

/**
 * 按已行驶比例折算剩余里程 / 剩余时间 / 预计到达
 * @param {object} p
 * @param {number} p.traveledMeters 已行驶里程（米，从确认发车起算）
 * @param {number} p.planDistance   规划总里程（km）
 * @param {number} p.planDuration   计划总时长（分钟）
 * @param {number} p.lastReportAt   最后一次定位上报时间（ms），用于判断停更
 */
export function computeProgress({ traveledMeters, planDistance, planDuration, lastReportAt }) {
  const traveledKm = Math.max(0, (Number(traveledMeters) || 0) / 1000)
  const planKm = Number(planDistance) || 0
  const planMin = Number(planDuration) || 0
  const stale =
    !lastReportAt || Date.now() - Number(lastReportAt) > STALE_MINUTES * 60 * 1000

  if (!planKm || !planMin) {
    return { ready: false, traveledKm, stale, reason: '缺少规划里程/时长' }
  }

  let remainKm = planKm - traveledKm
  const overPlan = remainKm < 0
  if (overPlan) remainKm = 0

  const ratio = remainKm / planKm
  const remainMinutes = Math.round(planMin * ratio)
  const etaMs = Date.now() + remainMinutes * 60000

  return {
    ready: true,
    stale,
    overPlan,
    planKm,
    planMin,
    traveledKm,
    remainKm,
    remainMinutes,
    etaMs,
    doneRatio: Math.min(1, Math.max(0, 1 - ratio)),
  }
}

/** 一趟的耗时（分钟）；已完成用 finish_time/arrive_time，进行中算到此刻 */
export function tripDurationMinutes(rec) {
  if (!rec) return 0
  const start = parseTimeMs(rec.accept_time || rec.create_time)
  if (!start) return 0
  const end = parseTimeMs(rec.finish_time || rec.arrive_time) || Date.now()
  return Math.max(0, Math.round((end - start) / 60000))
}
