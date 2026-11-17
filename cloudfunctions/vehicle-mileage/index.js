/**
 * 云函数：vehicle-mileage
 * ============================================================
 * 作用：按车牌取**车辆当前里程**（里程表读数，km），给「费用上报 → 加油费/加气费」自动带出里程用。
 *
 * 调用：
 *   wx.cloud.callFunction({ name: 'vehicle-mileage', data: { plate: '晋K05851D' } })
 *   → { code: 0, plate, vin, km: 18630, day: '2026-10-25' }
 *   → { code: 404/500/502, message: '...' }   ← 前端要能退化到「手动填里程」
 *
 * 数据来源（与 Web 端完全同一条口径）：
 *   ① vehicles 表：plate → vin                （没有 VIN 就查不到，直接返回 404）
 *   ② 东风 track/history：取当天所有轨迹点，`mileage` 单位是**米**，取最大值 ÷ 1000 = 当前里程
 *      ⚠️ 累计里程不在 tripAnalysisOil 里，别调错接口；当天没轨迹就往前找一天。
 *
 * 环境变量（CloudBase 控制台 → 云函数 → vehicle-mileage → 函数配置 → 环境变量）
 *   DONGFENG_TOKEN   必填，东风车联网的 token（和 waybill-action / vehicle-list 用的是同一个）
 *   DONGFENG_TRACK_URL 选填，默认 https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/track/history
 *   DONGFENG_TIMEOUT_MS 选填，默认 9000（云函数整体超时要设 ≥ 15s）
 *
 * 运行时：Node.js 18（只用内置 fetch，无 npm 依赖）
 */

const { randomUUID } = require('crypto')

const API_BASE = 'https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com'
const DEVICE_ID = randomUUID()

const TRACK_URL =
  process.env.DONGFENG_TRACK_URL ||
  'https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/track/history'
const TOKEN = String(process.env.DONGFENG_TOKEN || '').trim()
const TIMEOUT_MS = Number(process.env.DONGFENG_TIMEOUT_MS) || 9000

const enc = encodeURIComponent

/* ============================================================
   数据库（只读一个字段，匿名 token 就够）
   ⚠️ 匿名 token 只有 2 小时：必须记过期时间 + 401 换票重试
   ============================================================ */
let _token = null
let _tokenExp = 0

async function getToken(force) {
  if (_token && !force && Date.now() < _tokenExp) return _token
  _token = null
  const res = await fetch(`${API_BASE}/auth/v1/signin/anonymously`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-device-id': DEVICE_ID },
    body: JSON.stringify({}),
  })
  if (!res.ok) throw new Error(`匿名登录失败 HTTP ${res.status}`)
  const json = await res.json()
  _token = json.access_token || json.accessToken || (json.data && json.data.access_token)
  if (!_token) throw new Error('匿名登录未返回 access_token')
  const ttl = Number(json.expires_in) || 7200
  _tokenExp = Date.now() + Math.max(60, ttl - 300) * 1000
  return _token
}

async function queryTable(table, query) {
  const url = `${API_BASE}/v1/rdb/rest/${table}?${query}`
  const doFetch = (token) =>
    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-device-id': DEVICE_ID,
        'Accept-Profile': 'public',
        'Content-Profile': 'public',
      },
    })

  let res = await doFetch(await getToken())
  if (res.status === 401) res = await doFetch(await getToken(true))
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`查询 ${table} 失败 HTTP ${res.status}: ${txt.slice(0, 160)}`)
  }
  return res.json()
}

/* ============================================================
   东风轨迹
   ============================================================ */
const pad = (n) => String(n).padStart(2, '0')

/** 'YYYY-MM-DD HH:mm:ss'（东风要空格分隔，不是带 T 的 ISO） */
function fmtDay(d, endOfDay) {
  const y = d.getFullYear()
  const m = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  return `${y}-${m}-${day} ${endOfDay ? '23:59:59' : '00:00:00'}`
}

/** 拉一天轨迹，返回该天最大里程（米）；没数据返回 0 */
async function dayMaxMeter(vin, date) {
  const qs = new URLSearchParams({
    token: TOKEN,
    carId: vin,
    beginTime: fmtDay(date, false),
    endTime: fmtDay(date, true),
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${TRACK_URL}?${qs.toString()}`, { signal: controller.signal })
    if (!res.ok) {
      console.warn(`[track] ${vin} HTTP ${res.status}`)
      return 0
    }
    const json = await res.json()
    if (!json || json.code !== 1 || !Array.isArray(json.data) || !json.data.length) {
      console.warn(`[track] ${vin} 无数据：${(json && (json.msg || json.message)) || 'code != 1'}`)
      return 0
    }
    let max = 0
    for (const p of json.data) {
      const m = Number(p && p.mileage)
      if (Number.isFinite(m) && m > max) max = m
    }
    return max
  } catch (e) {
    console.warn(`[track] ${vin} 失败：${e && e.name === 'AbortError' ? '超时' : e.message}`)
    return 0
  } finally {
    clearTimeout(timer)
  }
}

/* ============================================================
   入口
   ============================================================ */
exports.main = async (event) => {
  const plate = String((event && event.plate) || '').trim()
  const vinIn = String((event && event.vin) || '').trim()
  if (!plate && !vinIn) return { code: 400, message: '缺少车牌或 VIN' }
  if (!TOKEN) return { code: 500, message: '未配置 DONGFENG_TOKEN（车辆里程取不到）' }

  /* ① 车牌 → VIN */
  let vin = vinIn
  if (!vin) {
    try {
      const rows = await queryTable('vehicles', `plate=eq.${enc(plate)}&select=plate,vin&limit=1`)
      vin = String((rows && rows[0] && rows[0].vin) || '').trim()
    } catch (e) {
      return { code: 500, message: '查车辆档案失败：' + String(e.message || e).slice(0, 80) }
    }
  }
  if (!vin) return { code: 404, message: `车辆 ${plate} 未配置 VIN，取不到里程` }

  /* ② 今天没有轨迹就往前找一天（隔夜停车很常见） */
  const today = new Date()
  for (const offset of [0, 1]) {
    const d = new Date(today)
    d.setDate(d.getDate() - offset)
    const meter = await dayMaxMeter(vin, d)
    if (meter > 0) {
      const km = Math.round((meter / 1000) * 10) / 10
      return {
        code: 0,
        plate: plate || '',
        vin,
        km,
        day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      }
    }
  }

  return { code: 404, message: '近两天没有轨迹数据，里程取不到' }
}