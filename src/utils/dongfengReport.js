/**
 * 运营报表 · 东风车联网接口封装
 * ============================================================
 * ⭐ 单车能耗分析 `track/tripAnalysisOil`
 *   ⚠️ 该接口**只接受 POST**（GET 直接报 "Request method 'GET' not supported"），
 *      且入参必须放在 query 上、body 传空 JSON 对象 `{}`。
 *      参数丢进 body 会被东风判成「入参错误 2101」，这是踩过的坑。
 *
 *   返回 data：
 *     tripMileage           行驶里程，单位 **米**
 *     sumTravelFuel         行驶电耗，单位 **Wh**
 *     hundredSumTravelFuel  百公里电耗，东风这个字段恒为 0.02（精度被截断到 2 位、
 *                           且量纲约等于 kWh/km ÷ 100），**不可直接展示**，
 *                           页面统一用 sumTravelFuel / tripMileage 现算
 *     startTime / endTime   运行开始 / 结束时间
 *     travelSumDuration     运行时长，单位 **分钟**（驾驶时长同值）
 *     travelAvgDuration     平均车速，单位 **m/s**（×3.6 → km/h）
 *     idleDuration          怠速时长（分钟）
 *
 * ⭐ 累计里程（里程表读数）不在上面这个接口里，
 *   取 `track/history` 当天最后一个点的 mileage（单位 米），÷1000 → km
 * ============================================================
 */
import { DONGFENG_TOKEN } from './waybillProgress'

export const DONGFENG_OIL_URL =
  'https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/track/tripAnalysisOil'
export const DONGFENG_TRACK_URL =
  'https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/track/history'

const OIL_TIMEOUT = 25000
const TRACK_TIMEOUT = 20000
const ODO_TTL = 10 * 60 * 1000

/** VIN → { km, at } */
const odoCache = new Map()

/**
 * 单车能耗分析
 * @param {string} vin       完整 VIN
 * @param {string} startTime YYYY-MM-DD
 * @param {string} endTime   YYYY-MM-DD
 * @returns {Promise<{ok: boolean, data?: object, reason?: string}>}
 */
export async function fetchTripOil(vin, startTime, endTime) {
  if (!vin) return { ok: false, reason: '缺少 VIN' }

  const qs = new URLSearchParams({
    token: DONGFENG_TOKEN,
    carId: vin,
    startTime,
    endTime,
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), OIL_TIMEOUT)
  try {
    const res = await fetch(`${DONGFENG_OIL_URL}?${qs.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: controller.signal,
    })
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
    const json = await res.json()
    if (json.code !== 1 || !json.data) {
      return { ok: false, reason: json.msg || '无数据' }
    }
    return { ok: true, data: json.data }
  } catch (err) {
    const reason = err.name === 'AbortError' ? '请求超时（25s）' : err.message
    return { ok: false, reason }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 累计里程（里程表读数，km）
 * @param {string} vin
 * @param {string} dateStr YYYY-MM-DD，取该日最后一个轨迹点的里程
 * @param {boolean} [force] 跳过缓存
 * @returns {Promise<number|null>}
 */
export async function fetchOdometerKm(vin, dateStr, force = false) {
  if (!vin || !dateStr) return null

  const key = `${vin}|${dateStr}`
  const hit = odoCache.get(key)
  if (!force && hit && Date.now() - hit.at < ODO_TTL) return hit.km

  const params = new URLSearchParams({
    token: DONGFENG_TOKEN,
    carId: vin,
    beginTime: `${dateStr} 00:00:00`,
    endTime: `${dateStr} 23:59:59`,
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TRACK_TIMEOUT)
  try {
    const res = await fetch(`${DONGFENG_TRACK_URL}?${params.toString()}`, {
      signal: controller.signal,
    })
    if (!res.ok) return null
    const json = await res.json()
    if (json.code !== 1 || !Array.isArray(json.data) || !json.data.length) return null

    let maxMeter = 0
    json.data.forEach((p) => {
      const m = parseFloat(p.mileage)
      if (!isNaN(m) && m > maxMeter) maxMeter = m
    })
    if (!maxMeter) return null

    const km = Math.round((maxMeter / 1000) * 10) / 10
    odoCache.set(key, { km, at: Date.now() })
    return km
  } catch (err) {
    console.warn(`[运行报表] 累计里程获取失败 ${vin}：`, err.message)
    return null
  } finally {
    clearTimeout(timer)
  }
}
