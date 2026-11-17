/**
 * 云函数：pick-list
 * ============================================================
 * 作用：管理端「新建运单 / 派单」要用的所有下拉候选，一次取回。
 *       （别让前端为 司机/车辆/车队/围栏/机构 各打一次云函数）
 *
 * 调用：wx.cloud.callFunction({ name: 'pick-list', data: { account } })
 *
 * 返回：
 *   vehicles[{ plate, org, org_id, driver, busy, todayTrips }]
 *   drivers[{ name, phone, org, plate, busy, todayTrips }]
 *   fleets [{ id, name, level, parent_id }]      —— 车队 = organizations
 *   fences [{ id, name, shape, center, radius, points, org, attr }]  —— 只读用，不在小程序改
 *   counts { vehicles, drivers, fences, busyVehicles, busyDrivers }
 *
 * 口径：
 *   · busy = 有「未结束运单」指派给它（待装车~已到达），按 assignments 解析，不看 vehicle 字段
 *   · todayTrips = 今天（计划装货时间）指派给它的运单数
 *   · 谁能调：管理员 / 员工（role_id 非空）或客户主账号（role_id 空 + owner_account 空）；司机 403
 *   · 隔离：owner_account = 子账号的 owner，主账号就是自己 account（scopeOwner）
 */

const { randomUUID } = require('crypto')

const API_BASE = 'https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com'
const DEVICE_ID = randomUUID()

const RUNNING_STATUS = ['待装车', '装车中', '装车完成', '已发车', '已到达']

const enc = encodeURIComponent

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
  const url = `${API_BASE}/v1/rdb/rest/${table}${query ? '?' + query : ''}`
  const doFetch = (token) =>
    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-device-id': DEVICE_ID,
        Accept: 'application/json',
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
  const json = await res.json()
  return Array.isArray(json) ? json : json.data || []
}

/* ---------- 解析指派 ---------- */
const readMethod = (a) => String((a && (a.method || a.assignMethod)) || '').trim()

const parseAssignments = (raw) => {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const v = JSON.parse(raw)
      return Array.isArray(v) ? v : []
    } catch (e) {
      return []
    }
  }
  return []
}

const targetsOf = (wb, method) => {
  const out = []
  parseAssignments(wb && wb.assignments).forEach((a) => {
    if (readMethod(a) !== method) return
    ;(a.items || []).forEach((it) => {
      const t = String((it && it.target) || '').trim()
      if (t) out.push(t)
    })
  })
  return out
}

const splitPlates = (raw) =>
  String(raw || '')
    .split(/[,，、;；\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)

/* 今天（+08:00）的起止，用来算今日趟数 */
const todayRange = () => {
  const d = new Date(Date.now() + 8 * 3600000)
  const p = (n) => String(n).padStart(2, '0')
  const ymd = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
  const start = new Date(`${ymd}T00:00:00+08:00`)
  const toLocal = (dt) => {
    const s = new Date(dt.getTime() + 8 * 3600000)
    return (
      `${s.getUTCFullYear()}-${p(s.getUTCMonth() + 1)}-${p(s.getUTCDate())}` +
      `T${p(s.getUTCHours())}:${p(s.getUTCMinutes())}:${p(s.getUTCSeconds())}`
    )
  }
  return { start: toLocal(start), end: toLocal(new Date(start.getTime() + 86400000)), ymd }
}

exports.main = async (event) => {
  try {
    const account = String((event && event.account) || '').trim()
    if (!account) return { code: 400, message: '未登录' }

    const users = await queryTable(
      'users',
      `account=eq.${enc(account)}&select=account,name,owner_account,role_id,org_id&limit=1`
    )
    const user = users[0]
    if (!user) return { code: 403, message: '账号不存在' }
    /* ⭐ 2026-10-22：客户主账号（role_id 空 + owner_account 空）也放行，与登录 canAdmin 同口径。
       否则主账号进管理端建单 / 派单时，选司机、选车、选路线全部 403。 */
    const hasRole =
      user.role_id !== null && user.role_id !== undefined && user.role_id !== ''
    const isMaster = !hasRole && !String(user.owner_account || '').trim()
    if (!hasRole && !isMaster) return { code: 403, message: '仅管理端账号可用' }

    const owner = String(user.owner_account || '').trim()
    const scopeOwner = owner || account
    const isSub = !!owner

    /* 客户 ID：和 vehicle-list 一样用 customers.phone = 主账号 反查 */
    let customerId = ''
    try {
      const cs = await queryTable('customers', `phone=eq.${enc(scopeOwner)}&select=id&limit=1`)
      customerId = (cs[0] && cs[0].id) || ''
    } catch (e) {
      console.warn('pick-list：客户查询失败', e.message)
    }

    /* ---------- 车辆 ---------- */
    const vehQ =
      `select=plate,org,org_id,driver,vehicle_type&limit=500` +
      (customerId ? `&customer_id=eq.${enc(customerId)}` : '') +
      (customerId && isSub && user.org_id !== null && user.org_id !== undefined
        ? `&org_id=eq.${enc(user.org_id)}`
        : '')
    const vehiclesRaw = await queryTable('vehicles', vehQ).catch((e) => {
      console.warn('pick-list：车辆查询失败', e.message)
      return []
    })

    /* ---------- 司机（org_id 大量为 null，只按 customer_id 过滤） ---------- */
    const drvQ =
      `select=driver_name,phone,org,bound_vehicle&limit=500` +
      (customerId ? `&customer_id=eq.${enc(customerId)}` : '')
    const driversRaw = await queryTable('drivers', drvQ).catch((e) => {
      console.warn('pick-list：司机查询失败', e.message)
      return []
    })

    /* ---------- 车队（organizations） ---------- */
    /* ⚠️ 用 scopeOwner（主账号 = 自己 account），不能再用 owner —— 主账号 owner 是空串，
       空串会让过滤条件整个消失，直接扫全库别家的机构 / 围栏。
       口径与 waybill-admin 一致：本租户 + 无归属（owner_account 为 null）的旧数据。 */
    const orgQ =
      `select=id,name,level,parent_id&limit=200&order=level.asc` +
      `&or=(owner_account.eq.${enc(scopeOwner)},owner_account.is.null)`
    const fleetsRaw = await queryTable('organizations', orgQ).catch((e) => {
      console.warn('pick-list：车队查询失败', e.message)
      return []
    })

    /* ---------- 围栏（只读：中心点/半径/点串，小程序自己画） ---------- */
    const fenceQ =
      `select=id,name,shape,center,radius,points,org,attr,desc&limit=300&order=name.asc` +
      `&or=(owner_account.eq.${enc(scopeOwner)},owner_account.is.null)`
    const fencesRaw = await queryTable('ele_fences', fenceQ).catch((e) => {
      console.warn('pick-list：围栏查询失败', e.message)
      return []
    })

    /* ---------- 占用：在途运单 → 哪些车/人在跑 ---------- */
    const busyPlates = new Set()
    const busyDrivers = new Set()
    const tripsByPlate = {}
    const tripsByDriver = {}

    try {
      const running = await queryTable(
        'waybills',
        `select=assignments,vehicle,driver&status=in.(${RUNNING_STATUS.map(
          (s) => `"${s}"`
        ).join(',')})&limit=400`
      )
      running.forEach((wb) => {
        targetsOf(wb, 'vehicle').forEach((p) => busyPlates.add(p))
        targetsOf(wb, 'driver').forEach((n) => busyDrivers.add(n))
      })
    } catch (e) {
      console.warn('pick-list：在途运单查询失败', e.message)
    }

    try {
      const { start, end } = todayRange()
      const today = await queryTable(
        'waybills',
        `select=assignments,vehicle,driver&pickup_time=gte.${enc(start)}&pickup_time=lt.${enc(
          end
        )}&limit=400`
      )
      today.forEach((wb) => {
        targetsOf(wb, 'vehicle').forEach((p) => {
          tripsByPlate[p] = (tripsByPlate[p] || 0) + 1
        })
        targetsOf(wb, 'driver').forEach((n) => {
          tripsByDriver[n] = (tripsByDriver[n] || 0) + 1
        })
      })
    } catch (e) {
      console.warn('pick-list：今日趟数查询失败', e.message)
    }

    const vehicles = vehiclesRaw
      .map((v) => {
        const plate = String(v.plate || '').trim()
        return {
          plate,
          org: String(v.org || '').trim(),
          org_id: v.org_id,
          driver: String(v.driver || '').trim(),
          vehicle_type: String(v.vehicle_type || '').trim(),
          busy: busyPlates.has(plate),
          todayTrips: tripsByPlate[plate] || 0,
        }
      })
      .filter((v) => v.plate)
      /* 空闲优先 → 今日趟数少的优先 → 车牌 */
      .sort(
        (a, b) =>
          Number(a.busy) - Number(b.busy) ||
          a.todayTrips - b.todayTrips ||
          a.plate.localeCompare(b.plate)
      )

    const drivers = driversRaw
      .map((d) => {
        const name = String(d.driver_name || '').trim()
        const plates = splitPlates(d.bound_vehicle)
        return {
          name,
          phone: String(d.phone || '').trim(),
          org: String(d.org || '').trim(),
          plate: plates[0] || '',
          plates,
          busy: busyDrivers.has(name) || plates.some((p) => busyPlates.has(p)),
          todayTrips: tripsByDriver[name] || 0,
        }
      })
      .filter((d) => d.name)
      .sort(
        (a, b) =>
          Number(a.busy) - Number(b.busy) ||
          a.todayTrips - b.todayTrips ||
          a.name.localeCompare(b.name)
      )

    const fences = fencesRaw.map((f) => ({
      id: f.id,
      name: String(f.name || '').trim(),
      shape: String(f.shape || '').trim(),
      center: String(f.center || '').trim(),
      radius: f.radius === null || f.radius === undefined ? null : Number(f.radius),
      points: String(f.points || '').trim(),
      org: String(f.org || '').trim(),
      attr: String(f.attr || '').trim(),
      desc: String(f.desc || '').trim(),
    }))

    console.log(
      `pick-list：${account} 车 ${vehicles.length}（占用 ${vehicles.filter((v) => v.busy).length}）` +
        ` 司机 ${drivers.length}（占用 ${drivers.filter((d) => d.busy).length}）` +
        ` 车队 ${fleetsRaw.length} 围栏 ${fences.length}`
    )

    return {
      code: 0,
      vehicles,
      drivers,
      fleets: fleetsRaw.map((o) => ({
        id: o.id,
        name: String(o.name || '').trim(),
        level: o.level,
        parent_id: o.parent_id,
      })),
      fences,
      counts: {
        vehicles: vehicles.length,
        drivers: drivers.length,
        fences: fences.length,
        busyVehicles: vehicles.filter((v) => v.busy).length,
        busyDrivers: drivers.filter((d) => d.busy).length,
      },
    }
  } catch (e) {
    console.error('pick-list 执行失败：', e)
    return { code: 500, message: e.message || '服务异常' }
  }
}
