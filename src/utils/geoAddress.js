/**
 * 逆地理编码（高德 JSAPI · 懒加载 + 坐标缓存 + 并发去重）
 * ============================================================
 * 背景：东风 `dongfeng-lostlocation` 返回的 `address` 字段并不是地址，
 *      而是「纬度,经度」字符串（例：37.073871,111.909985）。
 *      所以界面上要显示「所在位置」时必须自己反查一次真实地址。
 *
 * ⭐ 三条约定：
 *   ① 缓存按坐标 4 位小数（≈10m）落 Map，同一位置只查一次；
 *   ② 同坐标并发请求合并成一次（地图 30s 刷新会重复触发）；
 *   ③ 失败不缓存（高德限流/断网时下次还能重试），只缓存成功结果。
 * ============================================================
 */
import AMapLoader from '@amap/amap-jsapi-loader'

/** 与大屏 / 电子围栏同一把 Web 端 key */
const AMAP_KEY = '273f5c474604b71906674aac159b8f45'
const MAX_CACHE = 1500
const TIMEOUT = 6000

let loaderP = null
let geocoder = null
const cache = new Map()
const inflight = new Map()

function loadGeo() {
  if (loaderP) return loaderP
  loaderP = AMapLoader.load({ key: AMAP_KEY, version: '2.0', plugins: ['AMap.Geocoder'] })
    .then((AMap) => {
      geocoder = new AMap.Geocoder({ radius: 500, extensions: 'base' })
      return AMap
    })
    .catch((e) => {
      console.warn('[逆地理] 高德 SDK 加载失败', e && e.message)
      loaderP = null
      return null
    })
  return loaderP
}

/** 「36.903411,114.927703」这类纯经纬度串（东风 address 的真实形态） */
export function isLngLatText(t) {
  if (typeof t !== 'string') return false
  return /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(t.trim())
}

/**
 * 坐标 → 地址
 * @returns {Promise<string>} 失败返回 ''
 */
export async function reverseGeocode(lng, lat) {
  const ln = Number(lng)
  const la = Number(lat)
  if (!Number.isFinite(ln) || !Number.isFinite(la) || !ln || !la) return ''

  const key = `${ln.toFixed(4)},${la.toFixed(4)}`
  if (cache.has(key)) return cache.get(key)
  if (inflight.has(key)) return inflight.get(key)

  const p = (async () => {
    const AMap = await loadGeo()
    if (!AMap || !geocoder) return ''
    const addr = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(''), TIMEOUT)
      geocoder.getAddress([ln, la], (status, result) => {
        clearTimeout(timer)
        if (status === 'complete' && result && result.regeocode) {
          resolve(result.regeocode.formattedAddress || '')
        } else {
          resolve('')
        }
      })
    })
    if (addr) {
      if (cache.size > MAX_CACHE) cache.clear()
      cache.set(key, addr)
    }
    inflight.delete(key)
    return addr
  })()

  inflight.set(key, p)
  return p
}
