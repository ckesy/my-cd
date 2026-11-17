// cloudfunctions/dongfeng-overspeed-check/index.js
// 超速提醒：拉东风轨迹 → 围栏判断（circle/polygon/polyline/district）→ 超速段合并 → 逆地理编码
// 环境变量：DONGFENG_TOKEN, AMAP_WEB_KEY

const https = require('https')
const { URL } = require('url')

const DONGFENG_TOKEN = process.env.DONGFENG_TOKEN || 'c40c7311ff604a598b9fb791a63e9deb'
const AMAP_WEB_KEY = process.env.AMAP_WEB_KEY || '491d5475803e65c06ba6169bdaf3e1f3'
const TRACK_API = 'https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/track/history'
const CONCURRENCY = 20
const GEO_CONCURRENCY = 8
const SEGMENT_GAP_MS = 5 * 60 * 1000

// 逆地理编码缓存
const geoCache = new Map()
// ⭐ 行政区划边界缓存（adcode → boundaries[]）
const districtCache = new Map()

// ============================================================
// HTTP GET
// ============================================================
function httpsGet(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CloudBaseFunction/1.0)',
        'Accept': 'application/json',
      },
    }, (res) => {
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { resolve({ raw: data }) }
      })
    })
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`请求超时 ${timeoutMs}ms`)))
    req.on('error', reject)
    req.end()
  })
}

// ============================================================
// 时间解析
// ============================================================
function parseTimeCN(str) {
  if (!str) return 0
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})[\sT](\d{2}):(\d{2}):(\d{2})/)
  if (!m) return 0
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  const hh = Number(m[4]), mm = Number(m[5]), ss = Number(m[6])
  return Date.UTC(y, mo - 1, d, hh - 8, mm, ss)
}

// ============================================================
// 逆地理编码
// ============================================================
async function reverseGeocode(lng, lat) {
  const key = `${lng.toFixed(3)},${lat.toFixed(3)}`
  if (geoCache.has(key)) return geoCache.get(key)

  try {
    const url = `https://restapi.amap.com/v3/geocode/regeo?key=${AMAP_WEB_KEY}&location=${lng.toFixed(6)},${lat.toFixed(6)}&extensions=base&radius=200`
    const res = await httpsGet(url, 5000)
    let addr = ''
    if (res && res.status === '1' && res.regeocode) {
      const fa = res.regeocode.formatted_address
      addr = Array.isArray(fa) ? (fa[0] || '') : (fa || '')
      if (addr.length > 60) addr = addr.slice(0, 60) + '…'
    }
    geoCache.set(key, addr)
    return addr
  } catch (e) {
    console.warn(`[regeo] ${lng},${lat} 失败:`, e.message)
    geoCache.set(key, '')
    return ''
  }
}

// ============================================================
// ⭐ 拿行政区划边界（高德）
// ============================================================
async function getDistrictBoundary(adcode) {
  if (!adcode) return []
  const key = String(adcode)
  if (districtCache.has(key)) return districtCache.get(key)

  try {
    // subdistrict=0 只要当前行政区，不要下级
    const url = `https://restapi.amap.com/v3/config/district?key=${AMAP_WEB_KEY}&keywords=${key}&extensions=all&subdistrict=0`
    const res = await httpsGet(url, 8000)

    if (res.status !== '1' || !res.districts || !res.districts[0]) {
      console.warn(`[district] adcode=${key} 查询失败:`, res.info || res.infocode)
      districtCache.set(key, [])
      return []
    }

    const polyline = res.districts[0].polyline || ''
    // 格式："lng,lat;lng,lat|...|..."
    // 拆成多个多边形，每个多边形是 [[lng,lat], ...]
    const boundaries = polyline
      .split('|')
      .map(seg =>
        seg.split(';')
          .map(s => {
            const parts = s.split(',')
            return [Number(parts[0]), Number(parts[1])]
          })
          .filter(([a, b]) => !isNaN(a) && !isNaN(b))
      )
      .filter(poly => poly.length >= 3)

    console.log(`[district] adcode=${key} 拿到 ${boundaries.length} 段边界，共 ${boundaries.reduce((s, p) => s + p.length, 0)} 个点`)
    districtCache.set(key, boundaries)
    return boundaries
  } catch (e) {
    console.warn(`[district] adcode=${key} 异常:`, e.message)
    districtCache.set(key, [])
    return []
  }
}

// ⭐ 预加载所有 district 围栏的边界（在主流程前调用一次）
async function prepareDistrictBoundaries(fences) {
  const tasks = fences
    .filter(f => f.shape === 'district' && f.adcode && !f._boundaries)
    .map(async (f) => {
      f._boundaries = await getDistrictBoundary(f.adcode)
    })
  await Promise.all(tasks)
}

// ============================================================
// 几何算法
// ============================================================
function isPointInPolygon(lng, lat, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1]
    const xj = polygon[j][0], yj = polygon[j][1]
    const intersect = ((yi > lat) !== (yj > lat))
      && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

function isPointInCircle(lng, lat, cLng, cLat, radiusM) {
  const R = 6371000
  const φ1 = lat * Math.PI / 180
  const φ2 = cLat * Math.PI / 180
  const Δφ = (cLat - lat) * Math.PI / 180
  const Δλ = (cLng - lng) * Math.PI / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c <= radiusM
}

function distancePointToSegmentMeters(px, py, ax, ay, bx, by) {
  const lat0 = (ay + by + py) / 3
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180)
  const ky = 111320
  const axm = ax * kx, aym = ay * ky
  const bxm = bx * kx, bym = by * ky
  const pxm = px * kx, pym = py * ky
  const dx = bxm - axm
  const dy = bym - aym
  const len2 = dx * dx + dy * dy
  let t = 0
  if (len2 > 0) {
    t = ((pxm - axm) * dx + (pym - aym) * dy) / len2
    t = Math.max(0, Math.min(1, t))
  }
  const projX = axm + t * dx
  const projY = aym + t * dy
  return Math.sqrt((pxm - projX) ** 2 + (pym - projY) ** 2)
}

function parseCoords(points) {
  if (!points) return []
  return String(points).split(';').map(s => {
    const parts = s.split(',')
    const a = Number(parts[0])
    const b = Number(parts[1])
    return [a, b]
  }).filter(([a, b]) => !isNaN(a) && !isNaN(b))
}

// ⭐ 判断点是否在任一围栏内（circle / polygon / polyline / district）
function isInAnyFence(lng, lat, fences) {
  for (const f of fences) {
    try {
      // 圆形
      if (f.shape === 'circle' && f.center) {
        const parts = String(f.center).split(',')
        const cLng = Number(parts[0])
        const cLat = Number(parts[1])
        if (!isNaN(cLng) && !isNaN(cLat)) {
          const radius = Number(f.radius) || 1000
          if (isPointInCircle(lng, lat, cLng, cLat, radius)) return true
        }
      }
      // 多边形
      else if (f.shape === 'polygon' && f.points) {
        const coords = parseCoords(f.points)
        if (coords.length >= 3 && isPointInPolygon(lng, lat, coords)) return true
      }
      // 线形
      else if (f.shape === 'polyline' && f.points) {
        const buffer = Number(f.bufferradius) || 50
        const coords = parseCoords(f.points)
        for (let i = 0; i < coords.length - 1; i++) {
          const ax = coords[i][0], ay = coords[i][1]
          const bx = coords[i + 1][0], by = coords[i + 1][1]
          if (distancePointToSegmentMeters(lng, lat, ax, ay, bx, by) <= buffer) return true
        }
      }
      // ⭐ 行政区划（用预加载的边界多边形判断）
      else if (f.shape === 'district') {
        const boundaries = f._boundaries || []
        for (const poly of boundaries) {
          if (poly.length >= 3 && isPointInPolygon(lng, lat, poly)) return true
        }
      }
    } catch (e) {
      console.warn(`[isInAnyFence] ${f.shape} 判断异常:`, e.message)
    }
  }
  return false
}

// ============================================================
// 拉轨迹
// ============================================================
async function fetchTrack(carId, startTime, endTime) {
  const qs = `token=${DONGFENG_TOKEN}&carId=${encodeURIComponent(carId)}&beginTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}`
  const url = `${TRACK_API}?${qs}`
  const res = await httpsGet(url, 15000)
  if (res.code !== 1) throw new Error(res.msg || '东风接口返回非成功')
  return Array.isArray(res.data) ? res.data : []
}

// ============================================================
// 超速点合并成段
// ============================================================
function mergeSegments(points) {
  if (!points.length) return []
  const segments = []
  let cur = null
  for (const p of points) {
    if (!cur) {
      cur = { startTime: p.timeMs, endTime: p.timeMs, points: [p] }
    } else if (p.timeMs - cur.endTime <= SEGMENT_GAP_MS) {
      cur.endTime = p.timeMs
      cur.points.push(p)
    } else {
      segments.push(cur)
      cur = { startTime: p.timeMs, endTime: p.timeMs, points: [p] }
    }
  }
  if (cur) segments.push(cur)
  return segments
}

// ============================================================
// 主函数
// ============================================================
exports.main = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }

  const t0 = Date.now()
  try {
    let params = {}
    if (event.body) {
      params = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {})
    } else if (event.queryStringParameters) {
      params = event.queryStringParameters
    } else {
      params = event
    }

    const vehicles = Array.isArray(params.vehicles) ? params.vehicles : []
    const fences = Array.isArray(params.fences) ? params.fences : []
    const threshold = Number(params.threshold) || 80
    const startTime = params.startTime
    const endTime = params.endTime
    const withAddress = params.withAddress !== false

    if (!vehicles.length) {
      return { statusCode: 400, headers, body: JSON.stringify({ code: -1, msg: '缺少 vehicles' }) }
    }
    if (!startTime || !endTime) {
      return { statusCode: 400, headers, body: JSON.stringify({ code: -1, msg: '缺少时间范围' }) }
    }

    const isGlobal = fences.length === 0
    console.log(`[overspeed] 车 ${vehicles.length} 辆 | 围栏 ${fences.length} 个${isGlobal ? '（全域）' : ''} | 阈值 ${threshold} | ${startTime} ~ ${endTime}`)

    // ⭐⭐⭐ 阶段 0：预加载行政区划边界（district 围栏需要）
    if (!isGlobal && fences.some(f => f.shape === 'district')) {
      console.log('[overspeed] 检测到行政区划围栏，预加载边界...')
      await prepareDistrictBoundaries(fences)
    }

    // ============================================================
    // 阶段 1：并发拉每辆车的轨迹 → 超速点 → 超速段
    // ============================================================
    const results = new Array(vehicles.length)
    let idx = 0
    const worker = async () => {
      while (idx < vehicles.length) {
        const i = idx++
        const v = vehicles[i]
        const vin = v.vin
        if (!vin || vin.length < 8) {
          results[i] = { vin, plate: v.plate, org: v.org, segments: [], reason: 'VIN 无效' }
          continue
        }

        try {
          const points = await fetchTrack(vin, startTime, endTime)
          const overspeedPoints = []
          let inFenceCount = 0

          for (const p of points) {
            const lng = parseFloat(p.longitude)
            const lat = parseFloat(p.latitude)
            const vel = parseFloat(p.velocity)
            if (isNaN(lng) || isNaN(lat) || isNaN(vel)) continue

            if (!isGlobal && !isInAnyFence(lng, lat, fences)) continue
            inFenceCount++

            if (vel > threshold) {
              overspeedPoints.push({
                timeMs: parseTimeCN(p.sendTime),
                timeStr: p.sendTime,
                lng, lat,
                velocity: vel,
                mileage: parseFloat(p.mileage) || 0,
              })
            }
          }

          const rawSegments = mergeSegments(overspeedPoints)
          const segments = rawSegments.map((seg, si) => {
            const velocities = seg.points.map(p => p.velocity)
            const maxSpeed = Math.max(...velocities)
            const avgSpeed = velocities.reduce((a, b) => a + b, 0) / velocities.length
            const durationSec = Math.round((seg.endTime - seg.startTime) / 1000)
            const centerPoint = seg.points[Math.floor(seg.points.length / 2)]
            return {
              id: `${vin}-${seg.startTime}-${si}`,
              plate: v.plate,
              vin,
              org: v.org,
              startTime: seg.startTime,
              endTime: seg.endTime,
              durationSec,
              maxSpeed: Number(maxSpeed.toFixed(1)),
              avgSpeed: Number(avgSpeed.toFixed(1)),
              pointCount: seg.points.length,
              lng: centerPoint.lng,
              lat: centerPoint.lat,
              points: seg.points,
            }
          })

          console.log(`[overspeed] ${v.plate}(${vin}) 轨迹点=${points.length} 有效=${inFenceCount} 超速点=${overspeedPoints.length} 段=${segments.length}`)
          results[i] = { vin, plate: v.plate, org: v.org, segments }
        } catch (e) {
          console.warn(`[overspeed] ${vin} 失败: ${e.message}`)
          results[i] = { vin, plate: v.plate, org: v.org, segments: [], reason: e.message }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, vehicles.length) }, worker))

    // ============================================================
    // 阶段 2：逆地理编码
    // ============================================================
    const allSegments = []
    results.forEach(r => {
      (r.segments || []).forEach(s => allSegments.push(s))
    })

    if (withAddress && allSegments.length) {
      console.log(`[overspeed] 开始逆地理编码：${allSegments.length} 段`)
      const geoT0 = Date.now()
      let gi = 0
      const geoWorker = async () => {
        while (gi < allSegments.length) {
          const i = gi++
          const seg = allSegments[i]
          seg.address = await reverseGeocode(seg.lng, seg.lat)
        }
      }
      await Promise.all(Array.from({ length: Math.min(GEO_CONCURRENCY, allSegments.length) }, geoWorker))
      console.log(`[overspeed] 逆地理编码完成，耗时 ${Date.now() - geoT0}ms，缓存数 ${geoCache.size}`)
    }

    allSegments.sort((a, b) => b.startTime - a.startTime)

    const cost = Date.now() - t0
    console.log(`[overspeed] 完成：共 ${allSegments.length} 段，耗时 ${cost}ms`)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        code: 1,
        threshold,
        isGlobal,
        totalVehicles: vehicles.length,
        totalSegments: allSegments.length,
        segments: allSegments,
        cost,
      }),
    }
  } catch (e) {
    console.error('[overspeed] 异常:', e)
    return { statusCode: 500, headers, body: JSON.stringify({ code: -1, msg: e.message }) }
  }
}