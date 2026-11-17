// cloudfunctions/dongfeng-stay-check/index.js
// 停留提醒：调东风 stopEvent → 围栏判断 → 时长过滤 → 拉轨迹补充停留点 → 返回
// 环境变量：DONGFENG_TOKEN, AMAP_WEB_KEY

const https = require('https')
const { URL } = require('url')

const DONGFENG_TOKEN = process.env.DONGFENG_TOKEN || 'c40c7311ff604a598b9fb791a63e9deb'
const AMAP_WEB_KEY = process.env.AMAP_WEB_KEY || '491d5475803e65c06ba6169bdaf3e1f3'
const STOP_API = 'https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/track/stopEvent'
const HISTORY_API = 'https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/track/history'

const CONCURRENCY = 10
const MAX_POINTS_PER_EVENT = 30

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
        return [Number(parts[0]), Number(parts[1])]
    }).filter(([a, b]) => !isNaN(a) && !isNaN(b))
}

function isInAnyFence(lng, lat, fences) {
    for (const f of fences) {
        try {
            if (f.shape === 'circle' && f.center) {
                const parts = String(f.center).split(',')
                const cLng = Number(parts[0])
                const cLat = Number(parts[1])
                if (!isNaN(cLng) && !isNaN(cLat)) {
                    const radius = Number(f.radius) || 1000
                    if (isPointInCircle(lng, lat, cLng, cLat, radius)) return true
                }
            } else if (f.shape === 'polygon' && f.points) {
                const coords = parseCoords(f.points)
                if (coords.length >= 3 && isPointInPolygon(lng, lat, coords)) return true
            } else if (f.shape === 'polyline' && f.points) {
                const buffer = Number(f.bufferradius) || 50
                const coords = parseCoords(f.points)
                for (let i = 0; i < coords.length - 1; i++) {
                    const ax = coords[i][0], ay = coords[i][1]
                    const bx = coords[i + 1][0], by = coords[i + 1][1]
                    if (distancePointToSegmentMeters(lng, lat, ax, ay, bx, by) <= buffer) return true
                }
            } else if (f.shape === 'district') {
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
// 行政区划边界
// ============================================================
async function getDistrictBoundary(adcode) {
    if (!adcode) return []
    const key = String(adcode)
    if (districtCache.has(key)) return districtCache.get(key)

    try {
        const url = `https://restapi.amap.com/v3/config/district?key=${AMAP_WEB_KEY}&keywords=${key}&extensions=all&subdistrict=0`
        const res = await httpsGet(url, 8000)
        if (res.status !== '1' || !res.districts || !res.districts[0]) {
            districtCache.set(key, [])
            return []
        }
        const polyline = res.districts[0].polyline || ''
        const boundaries = polyline
            .split('|')
            .map(seg => seg.split(';').map(s => {
                const parts = s.split(',')
                return [Number(parts[0]), Number(parts[1])]
            }).filter(([a, b]) => !isNaN(a) && !isNaN(b)))
            .filter(poly => poly.length >= 3)

        console.log(`[district] adcode=${key} 拿到 ${boundaries.length} 段边界`)
        districtCache.set(key, boundaries)
        return boundaries
    } catch (e) {
        console.warn(`[district] ${key} 异常:`, e.message)
        districtCache.set(key, [])
        return []
    }
}

async function prepareDistrictBoundaries(fences) {
    const tasks = fences
        .filter(f => f.shape === 'district' && f.adcode && !f._boundaries)
        .map(async (f) => { f._boundaries = await getDistrictBoundary(f.adcode) })
    await Promise.all(tasks)
}

// ============================================================
// 拉停留事件 / 历史轨迹
// ============================================================
async function fetchStopEvents(carId, startTime, endTime) {
    const qs = `token=${DONGFENG_TOKEN}&carId=${encodeURIComponent(carId)}&beginTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}`
    const url = `${STOP_API}?${qs}`
    const res = await httpsGet(url, 15000)
    if (res.code !== 1) throw new Error(res.msg || '东风接口返回非成功')
    return Array.isArray(res.data) ? res.data : []
}

async function fetchHistoryTrack(carId, startTime, endTime) {
    const qs = `token=${DONGFENG_TOKEN}&carId=${encodeURIComponent(carId)}&beginTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}`
    const url = `${HISTORY_API}?${qs}`
    const res = await httpsGet(url, 20000)
    if (res.code !== 1) throw new Error(res.msg || '轨迹接口返回非成功')
    return Array.isArray(res.data) ? res.data : []
}

// ============================================================
// 均匀采样
// ============================================================
function samplePoints(points, maxCount = MAX_POINTS_PER_EVENT) {
    if (points.length <= maxCount) return points
    const result = []
    const step = (points.length - 1) / (maxCount - 1)
    for (let i = 0; i < maxCount; i++) {
        result.push(points[Math.round(i * step)])
    }
    return result
}

// ============================================================
// 为每个停留事件补充 points（用 event.address 填充，不再逆地理编码）
// ============================================================
async function enrichEventsWithPoints(vin, events, stayRadius, startTime, endTime) {
    if (!events.length) return events
    const radius = Number(stayRadius) > 0 ? Number(stayRadius) : 200

    let trackRaw = []
    try {
        trackRaw = await fetchHistoryTrack(vin, startTime, endTime)
        console.log(`[stay] ${vin} 轨迹点数=${trackRaw.length}`)
    } catch (e) {
        console.warn(`[stay] ${vin} 拉轨迹失败: ${e.message}, 降级用中心点`)
        return events.map(ev => ({
            ...ev,
            radius,
            points: [{
                lng: ev.lng,
                lat: ev.lat,
                time: ev.startTime,
                address: ev.address || '',   // ⭐ 直接用接口返回的 address
            }],
        }))
    }

    return events.map(ev => {
        const sMs = ev.startTimeMs
        const eMs = ev.endTimeMs
        const centerAddr = ev.address || ''    // ⭐ 本停留事件的地址

        const matched = []
        for (const p of trackRaw) {
            const t = parseTimeCN(p.sendTime)
            if (t < sMs || t > eMs) continue
            const lng = parseFloat(p.longitude)
            const lat = parseFloat(p.latitude)
            if (isNaN(lng) || isNaN(lat)) continue
            if (!isPointInCircle(lng, lat, ev.lng, ev.lat, radius)) continue
            matched.push({ lng, lat, time: p.sendTime })
        }

        matched.sort((a, b) => parseTimeCN(a.time) - parseTimeCN(b.time))
        let sampled = samplePoints(matched, MAX_POINTS_PER_EVENT)

        if (!sampled.length) {
            sampled.push({ lng: ev.lng, lat: ev.lat, time: ev.startTime })
        }

        // ⭐ 每个点都带上 event 的中心地址（同一个停留事件落在同一块区域，地址一致）
        sampled = sampled.map(p => ({ ...p, address: centerAddr }))

        return { ...ev, radius, points: sampled }
    })
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
        const stayDuration = Number(params.stayDuration) || 30
        const stayRadius = Number(params.stayRadius) || 200
        const startTime = params.startTime
        const endTime = params.endTime

        if (!vehicles.length) return { statusCode: 400, headers, body: JSON.stringify({ code: -1, msg: '缺少 vehicles' }) }
        if (!startTime || !endTime) return { statusCode: 400, headers, body: JSON.stringify({ code: -1, msg: '缺少时间范围' }) }

        const isGlobal = fences.length === 0
        console.log(`[stay] 车 ${vehicles.length} | 围栏 ${fences.length}${isGlobal ? '（全域）' : ''} | 停留 ${stayDuration}分钟 | 半径 ${stayRadius}m | ${startTime} ~ ${endTime}`)

        if (!isGlobal && fences.some(f => f.shape === 'district')) {
            console.log('[stay] 预加载行政区划边界...')
            await prepareDistrictBoundaries(fences)
        }

        const results = new Array(vehicles.length)
        let idx = 0
        const worker = async () => {
            while (idx < vehicles.length) {
                const i = idx++
                const v = vehicles[i]
                const vin = v.vin
                if (!vin || vin.length < 8) {
                    results[i] = { vin, plate: v.plate, org: v.org, events: [], reason: 'VIN 无效' }
                    continue
                }

                try {
                    const rawEvents = await fetchStopEvents(vin, startTime, endTime)
                    const events = []
                    let inFenceCount = 0

                    for (const e of rawEvents) {
                        const lng = parseFloat(e.longitude)
                        const lat = parseFloat(e.latitude)
                        const duration = Number(e.duration) || 0
                        if (isNaN(lng) || isNaN(lat)) continue

                        if (!isGlobal && !isInAnyFence(lng, lat, fences)) continue
                        inFenceCount++

                        if (duration < stayDuration) continue

                        events.push({
                            id: `${vin}-stay-${e.startTime}`,
                            plate: v.plate,
                            vin,
                            org: v.org,
                            startTime: e.startTime,
                            endTime: e.endTime,
                            startTimeMs: parseTimeCN(e.startTime),
                            endTimeMs: parseTimeCN(e.endTime),
                            durationMin: duration,
                            lng, lat,
                            address: e.address || '',
                        })
                    }

                    let finalEvents = events
                    if (events.length > 0) {
                        finalEvents = await enrichEventsWithPoints(vin, events, stayRadius, startTime, endTime)
                    }

                    console.log(`[stay] ${v.plate}(${vin}) 原始=${rawEvents.length} 围栏内=${inFenceCount} 合格=${events.length}`)
                    results[i] = { vin, plate: v.plate, org: v.org, events: finalEvents }
                } catch (e) {
                    console.warn(`[stay] ${vin} 失败: ${e.message}`)
                    results[i] = { vin, plate: v.plate, org: v.org, events: [], reason: e.message }
                }
            }
        }
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, vehicles.length) }, worker))

        const allEvents = []
        results.forEach(r => {
            (r.events || []).forEach(e => allEvents.push(e))
        })
        allEvents.sort((a, b) => b.startTimeMs - a.startTimeMs)

        const cost = Date.now() - t0
        console.log(`[stay] 完成：共 ${allEvents.length} 条，耗时 ${cost}ms`)

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                code: 1,
                isGlobal,
                stayDuration,
                stayRadius,
                totalVehicles: vehicles.length,
                totalEvents: allEvents.length,
                events: allEvents,
                cost,
            }),
        }
    } catch (e) {
        console.error('[stay] 异常:', e)
        return { statusCode: 500, headers, body: JSON.stringify({ code: -1, msg: e.message }) }
    }
}