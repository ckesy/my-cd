/**
 * 云函数：vehicle-list
 * ============================================================
 * 小程序端车辆列表 + 实时定位
 * 调用：wx.cloud.callFunction({ name: 'vehicle-list', data: { account, orgName, isSubAccount, ownerAccount } })
 * 运行时：Node.js 18.15（只用内置 fetch，无 npm 依赖）
 *
 * 返回契约见根目录《数据契约.md》§2.2
 *
 * ============================================================
 * ⭐ 本版相对线上版本的改动（定位取数路径）
 * ------------------------------------------------------------
 * 现象：Web 端全图监控能看到晋K05851D 的定位（16 km/h、ACC开），
 *       小程序端 vehicle-list 返回 hasLocation:false / 近 3 天无数据。
 *
 * 原因：Web 端调的是中转云函数 dongfeng-lostlocation（已验证可用），
 *       而本函数是「自己直连东风原始接口」。两条不同的取数路径，
 *       直连那条在云函数环境里拿不到数据。
 *
 * 修法：改为「优先走 dongfeng-lostlocation 中转（与 Web 端同一条链路），
 *       失败再回退到直连东风」。这样两端定位逻辑彻底统一，
 *       直连路径若以后修好也能自动恢复。
 * ============================================================
 */

const crypto = require('crypto')

const ENV_ID = 'wuxian-token-d0guymjkpadcd1f22'
const API_BASE = `https://${ENV_ID}.api.tcloudbasegateway.com`

/* 东风位置中转云函数（HTTP 网关）—— 与 Web 端 FullMap.vue 用的完全同一个地址 */
const GATEWAY_BASE = `https://${ENV_ID}-1447716425.ap-shanghai.app.tcloudbase.com`
const DONGFENG_PROXY_URL = `${GATEWAY_BASE}/dongfeng-lostlocation`

/* 直连东风原始接口（回退）。Token 必须由环境变量提供，不再内置兜底常量 */
const DONGFENG_TOKEN = process.env.DONGFENG_TOKEN || ''
const DONGFENG_LOCATION_URL =
  'https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/dataforward/forward/locationData'

const CONCURRENCY = 15
/* 单辆车定位的硬上限：云函数默认超时 3s，东风中转偶尔要 8-10s，
   不设上限的话「有一个 VIN 卡住 → 整个函数超时 → 前端拿到空」。
   超时就当这辆车没定位，把剩下的车按时返回。 */
const LOCATE_BUDGET_MS = 1800
const PROXY_TIMEOUT_MS = 1800
const DIRECT_TIMEOUT_MS = 8000

/* 同一个 deviceId 贯穿「取 token」与「查表」两次请求 */
const DEVICE_ID = crypto.randomUUID()

exports.main = async (event) => {
  const { account, orgName, isSubAccount, ownerAccount, mode } = event || {}

  if (!account) {
    return { code: 400, message: '未登录', list: [] }
  }

  try {
    const token = await getAnonToken()

    // 1. 查车辆档案（带隔离）
    /* ⭐ mode: 'admin' = 管理端小程序用（车辆页地图 / 空闲车气泡）。
       管理端既不是司机、也没有 orgName，原隔离逻辑会返回 0 条，
       所以单独走 staff 分支：按「主账号 → 客户」圈定范围。
       ⚠️ 只有 users.role_id 非空的账号才放行，普通司机传 mode=admin 拿不到别家车。 */
    const vehicles =
      mode === 'admin'
        ? await queryVehiclesForStaff(token, { account })
        : await queryVehicles(token, { account, orgName, isSubAccount, ownerAccount })
    if (!vehicles.length) {
      return { code: 0, message: 'ok', list: [], locatedCount: 0, total: 0 }
    }

    // 2. 并发拉每辆车定位
    const withLocation = new Array(vehicles.length)
    let index = 0
    const worker = async () => {
      while (index < vehicles.length) {
        const i = index++
        const v = vehicles[i]
        const loc = await withTimeout(
          fetchLocation(v.vin),
          LOCATE_BUDGET_MS,
          { hasLocation: false, status: '离线', reason: '定位超时' }
        )
        withLocation[i] = { ...v, ...loc }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, vehicles.length) }, () => worker()))

    const locatedCount = withLocation.filter((v) => v.hasLocation).length
    console.log(`vehicle-list：账号 ${account}，车辆 ${withLocation.length} 辆，有定位 ${locatedCount} 辆`)

    return {
      code: 0,
      message: 'ok',
      list: withLocation,
      locatedCount,
      total: withLocation.length,
    }
  } catch (e) {
    console.error('vehicle-list error:', e && (e.stack || e.message || e))
    return {
      code: 500,
      message: '服务异常：' + (e && e.message ? e.message : '未知'),
      list: [],
    }
  }
}

/* ============================================================
   管理端（staff）视角：按「主账号 → 客户」取车辆
   ------------------------------------------------------------
   为什么单开：管理端账号既不是司机（drivers 无记录），也不是客户手机号本人
   （60020 是子账号，主账号是 60010），原逻辑会直接返回 0 条。
   权限闸门：只有 users.role_id 非空才放行；司机/客户账号传 mode=admin 一律空。
   ============================================================ */
async function queryVehiclesForStaff(token, { account }) {
  const users = await queryTable(
    'users',
    `account=eq.${encodeURIComponent(account)}&select=account,role_id,owner_account,org_id&limit=1`,
    token
  )
  const u = users && users[0]
  /* ⭐ 2026-10-22：客户主账号（role_id 空 + owner_account 空）也放行，
     与登录 canAdmin 同口径；司机（role_id 空 + owner_account 非空）仍旧拒绝。 */
  const hasRole =
    !!u && u.role_id !== null && u.role_id !== undefined && u.role_id !== ''
  const isMaster = !!u && !hasRole && !String(u.owner_account || '').trim()
  if (!u || (!hasRole && !isMaster)) {
    console.log('[staff] 非管理端账号，拒绝 mode=admin：', account)
    return []
  }
  const owner = String(u.owner_account || '').trim() || String(account)
  const customers = await queryTable(
    'customers',
    `phone=eq.${encodeURIComponent(owner)}&select=id&limit=1`,
    token
  )
  const customerId = customers[0] && customers[0].id

  const filters = []
  if (customerId) filters.push(`customer_id=eq.${encodeURIComponent(customerId)}`)
  /* 子账号绑了机构就只看本机构的车；主账号（org_id 为空）看全部 */
  if (customerId && u.org_id !== null && u.org_id !== undefined) {
    filters.push(`org_id=eq.${encodeURIComponent(u.org_id)}`)
  }
  filters.push('order=updated_at.desc')
  filters.push('limit=500')

  const rows = (await queryTable('vehicles', filters.join('&'), token)) || []
  console.log(
    `[staff] 车辆：owner=${owner} customer=${customerId || '-'} 命中 ${rows.length} 辆`
  )
  return rows
}

/* ============================================================
   查车辆档案
   优先级：
   1. 如果有 driver 记录且绑了车 → 只返回绑定车辆
   2. 否则按原有客户 + org 隔离逻辑
   ============================================================ */
async function queryVehicles(token, { account, orgName, isSubAccount, ownerAccount }) {
  const dataOwner = isSubAccount ? ownerAccount || account : account

  // ⭐ 1. 先查 drivers 表，看这个账号是不是司机
  const drivers = await queryTable(
    'drivers',
    `phone=eq.${encodeURIComponent(account)}&select=bound_vehicle&limit=1`,
    token
  )

  console.log('drivers 查询结果:', JSON.stringify(drivers))

  // ⭐ 2. 如果是司机账号且绑定了车辆 → 只返回绑定车辆
  if (drivers && drivers.length > 0 && drivers[0].bound_vehicle) {
    // bound_vehicle 可能是多车牌，用逗号 / 顿号 / 分号 / 空格分隔
    const plates = String(drivers[0].bound_vehicle)
      .split(/[,，、;；\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)

    if (plates.length > 0) {
      console.log('司机绑定车辆:', plates)
      // PostgREST in 语法：plate=in.("晋K1H001","晋K1H003")
      const plateFilter = plates.map((p) => `"${p}"`).join(',')
      const query = `plate=in.(${plateFilter})&order=updated_at.desc&limit=200`
      const rows = await queryTable('vehicles', query, token)
      console.log('按绑定车辆过滤后命中:', (rows || []).length)
      return rows || []
    }
  }

  // ⭐ 3. 非司机账号 → 走原有的客户 + org 隔离
  console.log('非司机账号，走客户隔离逻辑, dataOwner =', dataOwner)

  const customers = await queryTable(
    'customers',
    `phone=eq.${encodeURIComponent(dataOwner)}&select=id&limit=1`,
    token
  )
  if (!customers.length) {
    console.log('未找到客户记录, phone =', dataOwner)
    return []
  }
  const customerId = customers[0].id

  const filters = [`customer_id=eq.${customerId}`]

  if (isSubAccount && orgName) {
    filters.push(`org=eq.${encodeURIComponent(orgName)}`)
  }

  filters.push('order=updated_at.desc')
  filters.push('limit=200')

  const rows = await queryTable('vehicles', filters.join('&'), token)
  console.log('客户隔离命中数:', (rows || []).length)
  return rows || []
}

/* 给 Promise 加个硬超时：到点直接返回兜底值（不抛错，保证其它车照常返回） */
function withTimeout(promise, ms, fallback) {
  return new Promise((resolve) => {
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      done = true
      resolve(fallback)
    }, ms)
    promise
      .then((v) => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve(v)
      })
      .catch((e) => {
        if (done) return
        done = true
        clearTimeout(timer)
        console.warn('定位异常，按无定位处理:', e && e.message)
        resolve(fallback)
      })
  })
}

/* ============================================================
   拉单车定位
   ------------------------------------------------------------
   优先走 dongfeng-lostlocation 中转（与 Web 端同一条链路，已验证可用）
   失败再回退到直连东风原始接口
   ============================================================ */
async function fetchLocation(vin) {
  if (!vin || String(vin).length < 8) {
    return { hasLocation: false, status: '离线', reason: 'VIN 不足 8 位' }
  }

  const viaProxy = await fetchViaProxy(vin)
  if (viaProxy) return viaProxy

  const viaDirect = await fetchViaDirect(vin)
  if (viaDirect) return viaDirect

  return { hasLocation: false, status: '离线', reason: '近 3 天无数据' }
}

/* ---- 路径 A：dongfeng-lostlocation 中转（Web 端同款） ---- */
async function fetchViaProxy(vin) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS)

  try {
    const res = await fetch(DONGFENG_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vin }),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) {
      console.warn(`[proxy] ${vin} HTTP ${res.status}`)
      return null
    }

    const result = await res.json()
    if (!result || result.code !== 1 || !Array.isArray(result.data) || !result.data.length) {
      console.warn(`[proxy] ${vin} 无数据：${(result && (result.msg || result.message)) || 'code != 1'}`)
      return null
    }

    return buildLocation(result.data, result.dayOffset)
  } catch (e) {
    clearTimeout(timer)
    console.warn(`[proxy] ${vin} 失败：${e.message}`)
    return null
  }
}

/* ---- 路径 B：直连东风原始接口（回退） ---- */
async function fetchViaDirect(vin) {
  if (!DONGFENG_TOKEN) {
    console.error('[direct] 未配置 DONGFENG_TOKEN，跳过直连定位')
    return null
  }
  const chassisNo = String(vin).slice(-8)
  const now = new Date()

  for (const dayOffset of [0, 1, 2]) {
    const d = new Date(now)
    d.setDate(d.getDate() - dayOffset)
    const startTime = formatDate(d, '00:00:00')
    const endTime = formatDate(d, '23:59:59')

    try {
      const url =
        `${DONGFENG_LOCATION_URL}?token=${encodeURIComponent(DONGFENG_TOKEN)}` +
        `&chassisNo=${encodeURIComponent(chassisNo)}` +
        `&startTime=${encodeURIComponent(startTime)}` +
        `&endTime=${encodeURIComponent(endTime)}`

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), DIRECT_TIMEOUT_MS)
      const response = await fetch(url, { method: 'GET', signal: controller.signal })
      clearTimeout(timer)

      if (!response.ok) {
        console.warn(`[direct] 东风接口 HTTP ${response.status}`)
        continue
      }

      const result = await response.json()
      if (result && result.code === 1 && Array.isArray(result.data) && result.data.length > 0) {
        return buildLocation(result.data, dayOffset)
      }
    } catch (e) {
      console.warn(`[direct] fetchLocation(${chassisNo}) day-${dayOffset} 失败：${e.message}`)
    }
  }
  return null
}

/* ---- 统一解析（兼容中转与直连两种字段命名） ---- */
function buildLocation(rows, dayOffset) {
  const pick = (o, keys) => {
    for (const k of keys) {
      const v = o[k]
      if (v !== undefined && v !== null && v !== '') return v
    }
    return undefined
  }

  const sorted = [...rows].sort(
    (a, b) => parseTimeToMs(pick(b, ['time', 'sendTime'])) - parseTimeToMs(pick(a, ['time', 'sendTime']))
  )
  const latest = sorted[0]
  if (!latest) return null

  const lng = parseFloat(pick(latest, ['lng', 'longitude']))
  const lat = parseFloat(pick(latest, ['lat', 'latitude']))
  if (!lng || !lat || isNaN(lng) || isNaN(lat)) return null

  const speed = parseFloat(pick(latest, ['speed', 'velocity'])) || 0
  const accRaw = pick(latest, ['accStatus', 'acc', 'accState'])
  const accOn = isAccOn(accRaw)
  const status = accOn ? (speed > 0 ? '行驶' : '静止') : '离线'

  return {
    hasLocation: true,
    lng,
    lat,
    status,
    speed,
    direction: parseFloat(pick(latest, ['direction'])) || 0,
    altitude: parseFloat(pick(latest, ['altitude'])) || 0,
    accStatus: String(accRaw === undefined ? '--' : accRaw),
    reportTime: formatReportTime(pick(latest, ['time', 'sendTime'])),
    location:
      pick(latest, ['address']) ||
      (status === '行驶' ? '行驶中' : status === '静止' ? '停车' : '离线'),
    dayOffset: typeof dayOffset === 'number' ? dayOffset : 0,
  }
}

function isAccOn(acc) {
  if (acc === undefined || acc === null || acc === '') return false
  const s = String(acc).trim()
  if (s.includes('关')) return false
  if (s.includes('开')) return true
  return false
}

/* 兼容数字时间戳、纯数字字符串、日期字符串
   ⚠️ 老写法 new Date(s.replace(/-/g,'/')) 对带 T 的 ISO 串会返回 NaN
   （和 waybill-list 的 toMs 是同一个坑，2026-10-17 一并修掉）。
   先原生 Date.parse 兜 ISO，再退回「- 换 /」。 */
function parseTimeToMs(t) {
  if (t === undefined || t === null || t === '') return 0
  if (typeof t === 'number') return t
  const s = String(t).trim()
  if (/^\d+$/.test(s)) return Number(s)
  const direct = Date.parse(s)
  if (!isNaN(direct)) return direct
  const ms = new Date(s.replace(/-/g, '/')).getTime()
  return isNaN(ms) ? 0 : ms
}

function formatReportTime(t) {
  const ms = parseTimeToMs(t)
  if (!ms) return '--'
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  )
}

function formatDate(d, time) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day} ${time}`
}

/* ============================================================
   匿名登录 + 查表
   ============================================================ */
async function getAnonToken() {
  const url = `${API_BASE}/auth/v1/signin/anonymously`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': DEVICE_ID,
    },
    body: JSON.stringify({}),
  })

  if (!res.ok) {
    throw new Error(`匿名登录失败 HTTP ${res.status}`)
  }

  const data = await res.json()
  if (!data || !data.access_token) {
    throw new Error('匿名登录未返回 access_token')
  }
  return data.access_token
}

async function queryTable(table, query, token) {
  const url = `${API_BASE}/v1/rdb/rest/${table}?${query}`

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-device-id': DEVICE_ID,
      'Accept-Profile': 'public',
      'Content-Profile': 'public',
    },
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`查询 ${table} 失败 HTTP ${res.status}: ${txt.slice(0, 200)}`)
  }

  return res.json()
}
