/**
 * 云函数：inspection
 * ============================================================
 * 司机端「外观巡检」的唯一写入口 + 模板读取
 *
 * action:
 *   template     { fuelType, hasTrailer }        → 取当前租户的巡检模板
 *   lastByPlate  { plates: [] }                  → 每辆车「上次巡检」时间（卡片上显示 N 天前）
 *   create       { plate, vehicleId, vin, trailer, items, images, remark, force }
 *   mine         { limit }                       → 我最近提交的记录（P2 用，先留好）
 *
 * 设计要点：
 *   1) 巡检项是**模板**（inspection_templates.groups 的 jsonb），不写死在页面里；
 *   2) result / total_count / abnormal_count **服务端重算**，不信任前端；
 *   3) items 存快照（key + group + label + status + note），以后改模板不影响历史；
 *   4) 异常项硬校验：描述 ≥4 字 + 至少 1 张照片（照片的 item 字段要指到那一项）；
 *   5) kind='photo' 的项目（挂车全景拍照）**正常也要传图**；
 *   6) 30 分钟内同车重复提交 → 409 + warn:'recent'，前端弹确认后带 force:true 重发。
 *
 * ⚠️ 匿名 token 只有 2 小时：getToken 按过期时间取，401 换 token 重试一次。
 * ⚠️ 云函数之间不能 require 本地模块，身份解析这段是各函数各一份的复制件。
 */

const { randomUUID } = require('crypto')

const API_BASE = 'https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com'
const DEVICE_ID = randomUUID()
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
  /* ⭐ 提前 5 分钟过期，避免边界上拿到快死的 token */
  _tokenExp = Date.now() + Math.max(60, ttl - 300) * 1000
  return _token
}

async function request(method, table, query, body) {
  const url = `${API_BASE}/v1/rdb/rest/${table}${query ? '?' + query : ''}`
  const doFetch = async (token) => {
    const headers = {
      Authorization: `Bearer ${token}`,
      'x-device-id': DEVICE_ID,
      'Accept-Profile': 'public',
      'Content-Profile': 'public',
    }
    if (body) headers['Content-Type'] = 'application/json'
    if (method === 'PATCH' || method === 'POST') headers.Prefer = 'return=representation'
    return fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
  }
  let res = await doFetch(await getToken())
  if (res.status === 401) res = await doFetch(await getToken(true))
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`${method} ${table} 失败 HTTP ${res.status}: ${txt.slice(0, 200)}`)
  }
  return res.json()
}

const queryTable = (table, query) => request('GET', table, query)
const insertTable = (table, row) => request('POST', table, '', row)

/* ============================================================
   默认模板兜底
   ------------------------------------------------------------
   SQL 没跑 / 表还不在的时候，页面不能白屏 —— 用这份内置的顶上。
   （控制台第一次部署云函数时，SQL 往往还没执行）
   ============================================================ */
const DEFAULT_GROUPS = [
  {
    key: 'exterior',
    label: '外观巡检',
    optional: false,
    items: [
      { key: 'plate_front', label: '车头牌照', kind: 'check' },
      { key: 'plate_trailer', label: '挂车牌照', kind: 'check' },
      { key: 'cab_paint', label: '驾驶室面漆', kind: 'check' },
      { key: 'battery_temp', label: '电池温差', kind: 'check', when: { fuel_type: ['纯电动'] } },
      { key: 'body_clean', label: '车身外面整洁', kind: 'check' },
    ],
  },
  {
    key: 'function',
    label: '功能巡检',
    optional: false,
    items: [
      { key: 'light', label: '灯光', kind: 'check' },
      { key: 'lamp', label: '灯具', kind: 'check' },
      { key: 'horn', label: '喇叭', kind: 'check' },
      { key: 'wiper', label: '雨刮', kind: 'check' },
      { key: 'windshield', label: '前挡风玻璃', kind: 'check' },
      { key: 'mirror', label: '后视镜', kind: 'check' },
      { key: 'air_tank', label: '储气筒气压', kind: 'check' },
      { key: 'steering_oil', label: '转向油壶', kind: 'check' },
      { key: 'window_lift', label: '玻璃升降器', kind: 'check' },
      { key: 'tire_pressure', label: '轮胎气压', kind: 'check' },
      { key: 'tire_tread', label: '轮胎胎面胎冠', kind: 'check' },
      { key: 'brake_pad', label: '制动蹄片', kind: 'check' },
      { key: 'clutch', label: '离合器摩擦片', kind: 'check' },
    ],
  },
  {
    key: 'trailer',
    label: '挂车巡检',
    optional: true,
    items: [
      { key: 'trailer_door', label: '货柜门', kind: 'check' },
      { key: 'trailer_wing', label: '飞翼箱', kind: 'check' },
      { key: 'trailer_tire_pressure', label: '轮胎气压', kind: 'check' },
      { key: 'trailer_tire_tread', label: '轮胎胎面胎冠', kind: 'check' },
      { key: 'trailer_photo', label: '挂车全景拍照', kind: 'photo' },
    ],
  },
]

const FALLBACK_TEMPLATE = {
  id: null,
  name: '默认外观巡检',
  version: 1,
  strict: false,
  need_photo_when_normal: false,
  groups: DEFAULT_GROUPS,
  _fallback: true,
}

/* ============================================================
   工具
   ============================================================ */
const str = (v) => String(v == null ? '' : v).trim()

const splitPlates = (raw) =>
  str(raw)
    .split(/[,，、;；/\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)

const toBool = (v) => v === true || v === 'true' || v === 1 || v === '1'

/** 车型是否命中 when 条件（目前只支持 fuel_type） */
function itemApplies(item, ctx) {
  const when = item && item.when
  if (!when) return true
  if (Array.isArray(when.fuel_type) && when.fuel_type.length) {
    const mine = str(ctx.fuelType)
    if (!mine) return true /* 车档没写能源类型 → 不因为猜不出来就把项藏掉 */
    return when.fuel_type.some((f) => mine === str(f) || mine.includes(str(f)) || str(f).includes(mine))
  }
  return true
}

/** 把模板裁成「这辆车实际要检的项」：去掉不适用项；挂车按 trailer 决定要不要整组 */
function resolveTemplate(tpl, ctx) {
  const groups = (Array.isArray(tpl.groups) ? tpl.groups : []).map((g) => ({
    key: str(g.key),
    label: str(g.label),
    optional: !!g.optional,
    items: (Array.isArray(g.items) ? g.items : [])
      .filter((it) => it && str(it.key) && str(it.label))
      .filter((it) => itemApplies(it, ctx))
      .map((it) => ({ key: str(it.key), label: str(it.label), kind: str(it.kind) || 'check' })),
  }))

  /* 全空组不要（比如某车队只留了挂车组，但本车没挂车） */
  const kept = groups.filter((g) => {
    if (!g.items.length) return false
    if (g.optional && !ctx.trailerIncluded) return false
    return true
  })

  return {
    id: tpl.id || null,
    name: str(tpl.name) || '默认外观巡检',
    version: Number(tpl.version) || 1,
    strict: !!tpl.strict,
    needPhotoWhenNormal: !!tpl.need_photo_when_normal,
    groups: kept,
    fallback: !!tpl._fallback,
  }
}

/* ============================================================
   身份
   ============================================================ */
async function loadContext(account) {
  const users = await queryTable(
    'users',
    `account=eq.${enc(account)}&select=id,account,name,phone,owner_account,org_id,role_id&limit=1`
  )
  const user = users[0]
  if (!user) throw new Error('账号不存在')

  const ownerAccount = str(user.owner_account) || str(user.account)
  const driverPhone = str(user.phone) || account

  let driver = null
  try {
    /* ⚠️ drivers 表列名是 driver_name / bound_vehicle */
    const list = await queryTable(
      'drivers',
      `phone=eq.${enc(driverPhone)}&select=id,driver_name,phone,bound_vehicle,org,org_id&limit=1`
    )
    const d = list[0]
    driver = d
      ? { id: d.id, name: str(d.driver_name), phone: str(d.phone), plates: str(d.bound_vehicle), org: str(d.org) }
      : null
  } catch (e) {
    console.warn('[inspection] 读司机档案失败（不阻断）', e.message)
  }

  return {
    account,
    user,
    ownerAccount,
    driverPhone,
    driverName: (driver && driver.name) || str(user.name) || account,
    driver,
  }
}

/* ============================================================
   车辆档案（挂车 / 能源类型以库里为准，不信前端传的）
   ------------------------------------------------------------
   ⚠️ vehicles.id 是 bigint：非数字 id 直接 400，所以先判 /^\d+$/
   ============================================================ */
async function loadVehicle(event) {
  try {
    const idRaw = str(event && event.vehicleId)
    const plate = str(event && event.plate)
    let q = ''
    if (/^\d+$/.test(idRaw)) {
      q = `id=eq.${Number(idRaw)}&select=id,plate,vin,trailer,fuel_type,org&limit=1`
    } else if (plate) {
      q = `plate=eq.${enc(plate)}&select=id,plate,vin,trailer,fuel_type,org&limit=1`
    }
    if (!q) return null
    const rows = await queryTable('vehicles', q)
    return rows[0] || null
  } catch (e) {
    console.warn('[inspection] 读车辆档案失败（不阻断）', e.message)
    return null
  }
}

/* ============================================================
   action: template
   ============================================================ */
async function loadTemplate(ownerAccount) {
  try {
    if (ownerAccount) {
      const own = await queryTable(
        'inspection_templates',
        `owner_account=eq.${enc(ownerAccount)}&is_active=is.true&select=*&order=version.desc&limit=1`
      )
      if (own && own[0]) return own[0]
    }
    const def = await queryTable(
      'inspection_templates',
      `owner_account=is.null&is_active=is.true&select=*&order=version.desc&limit=1`
    )
    if (def && def[0]) return def[0]
  } catch (e) {
    /* 表不存在 / 没授权 → 用内置模板，页面照样能用 */
    console.warn('[inspection] 读模板失败，用内置模板', e.message)
  }
  return FALLBACK_TEMPLATE
}

async function handleTemplate(event, ctx) {
  const veh = await loadVehicle(event)
  const fuelType = str(veh && veh.fuel_type) || str(event && event.fuelType)
  /* vehicles.trailer 是「关联挂车」的文本（车牌或说明），有值就算有挂车 */
  const hasTrailer = veh ? !!str(veh.trailer) : toBool(event && event.hasTrailer)

  const tpl = await loadTemplate(ctx.ownerAccount)
  /* ⭐ 模板里**始终带上可选组**（挂车），由前端按开关决定显不显示、算不算总数。
     若这里按 hasTrailer 裁掉，司机就没法给临时挂车开启巡检了。
     create 时才按真实的 trailer 标记重算。 */
  const resolved = resolveTemplate(tpl, { fuelType, trailerIncluded: true })

  return {
    code: 0,
    template: resolved,
    hasTrailer,
    vehicle: {
      id: (veh && veh.id) || null,
      plate: str(veh && veh.plate) || str(event && event.plate),
      vin: str(veh && veh.vin) || str(event && event.vin),
      org: str(veh && veh.org) || '',
      fuelType,
    },
    driver: {
      name: ctx.driverName,
      phone: ctx.driverPhone,
      plates: splitPlates(ctx.driver && ctx.driver.plates),
    },
  }
}

/* ============================================================
   action: lastByPlate
   ------------------------------------------------------------
   车辆卡片上要显示「上次 3 天前」。一次 in.(...) 查完，别 N+1。
   ============================================================ */
async function handleLastByPlate(event, ctx) {
  const plates = Array.from(
    new Set((Array.isArray(event && event.plates) ? event.plates : []).map(str).filter(Boolean))
  ).slice(0, 60)

  if (!plates.length) return { code: 0, map: {} }

  const inList = plates.map((p) => `"${p.replace(/"/g, '')}"`).join(',')
  const rows = await queryTable(
    'vehicle_inspections',
    `plate=in.(${enc(inList)})&owner_account=eq.${enc(ctx.ownerAccount)}` +
      `&select=plate,create_time,result,abnormal_count,handle_status&order=create_time.desc&limit=300`
  )

  /* 已按时间倒序 → 每辆车取第一条 */
  const map = {}
  ;(rows || []).forEach((r) => {
    const p = str(r.plate)
    if (!p || map[p]) return
    map[p] = {
      create_time: r.create_time,
      result: r.result,
      abnormal_count: Number(r.abnormal_count) || 0,
      handle_status: r.handle_status,
    }
  })

  return { code: 0, map }
}

/* ============================================================
   action: create
   ============================================================ */
const DUP_WINDOW_MS = 30 * 60 * 1000
const NOTE_MIN = 4

async function handleCreate(event, ctx) {
  const plate = str(event && event.plate)
  if (!plate) return { code: 400, message: '缺少车牌' }

  /* ---- 归属：车牌必须是我绑定的车（司机档案有车牌时才校验） ---- */
  const myPlates = splitPlates(ctx.driver && ctx.driver.plates)
  if (myPlates.length && !myPlates.includes(plate)) {
    return { code: 403, message: `这辆车（${plate}）不在你的名下，不能提交巡检` }
  }

  /* ---- 30 分钟内重复提交：让前端确认一次（补拍/改错是真实需求，不硬拦） ---- */
  if (!toBool(event && event.force)) {
    try {
      const recent = await queryTable(
        'vehicle_inspections',
        `plate=eq.${enc(plate)}&owner_account=eq.${enc(ctx.ownerAccount)}` +
          `&select=id,create_time&order=create_time.desc&limit=1`
      )
      const last = recent && recent[0]
      if (last && Date.now() - Date.parse(last.create_time) < DUP_WINDOW_MS) {
        return {
          code: 409,
          warn: 'recent',
          last: { id: last.id, create_time: last.create_time },
          message: '这辆车 30 分钟内已经提交过一次巡检',
        }
      }
    } catch (e) {
      /* 查不到就当没重复，别把提交挡死 */
    }
  }

  /* ---- 模板：服务端自己再算一遍，不信前端传的 total / result ---- */
  const veh = await loadVehicle(event)
  const fuelType = str(veh && veh.fuel_type) || str(event && event.fuelType)
  /* 司机可以给「本车无挂车」的车临时打开挂车巡检 → event.trailer 优先 */
  const trailerIncluded =
    event && event.trailer !== undefined && event.trailer !== null
      ? toBool(event.trailer)
      : !!(veh && str(veh.trailer))

  const tpl = await loadTemplate(ctx.ownerAccount)
  const resolved = resolveTemplate(tpl, { fuelType, trailerIncluded })

  if (!resolved.groups.length) {
    return { code: 400, message: '巡检模板为空，请联系管理员配置检查项' }
  }

  /* 前端提交的勾选结果：key → { status, note } */
  const given = {}
  ;(Array.isArray(event && event.items) ? event.items : []).forEach((it) => {
    const k = str(it && it.key)
    if (!k) return
    given[k] = {
      status: str(it.status) === 'abnormal' ? 'abnormal' : 'normal',
      note: str(it.note).slice(0, 200),
    }
  })

  /* 照片：按项目归位；item='overall' 是整单照片 */
  const images = (Array.isArray(event && event.images) ? event.images : [])
    .map((im) => ({
      key: str(im && (im.key || im.fileID)),
      name: str(im && im.name),
      size: Number(im && im.size) || 0,
      item: str(im && im.item) || 'overall',
    }))
    .filter((im) => im.key)
    .slice(0, 30)

  const imagesOf = (itemKey) => images.filter((im) => im.item === itemKey)

  /* ---- 逐项校验 + 组装快照 ---- */
  const snapshot = []
  const errors = []

  for (const g of resolved.groups) {
    for (const it of g.items) {
      const got = given[it.key]
      const status = got ? got.status : 'normal'
      const note = got ? got.note : ''
      const shots = imagesOf(it.key)

      if (status === 'abnormal') {
        if (note.length < NOTE_MIN) errors.push(`${it.label}：异常描述至少 ${NOTE_MIN} 个字`)
        if (!shots.length) errors.push(`${it.label}：异常必须拍照`)
      }
      /* kind=photo 的项目（挂车全景拍照）：不管正常与否都要有图 */
      if (it.kind === 'photo' && !shots.length) errors.push(`${it.label}：请上传照片`)

      snapshot.push({
        key: it.key,
        group: g.key,
        /* ⭐ 组名一起快照：Web 端详情直接按组分行，不用再查模板
           （模板可以自定义，写死一个 group 文案表迟早对不上） */
        groupLabel: g.label,
        label: it.label,
        status,
        note,
        photos: shots.length,
      })
    }
  }

  if (errors.length) {
    return { code: 400, message: errors[0], errors: errors.slice(0, 6) }
  }

  /* 模板要求「全正常也拍照」 */
  if (resolved.needPhotoWhenNormal && !imagesOf('overall').length) {
    return { code: 400, message: '请至少上传 1 张整车照片' }
  }

  const abnormal = snapshot.filter((s) => s.status === 'abnormal')
  const result = abnormal.length ? 'abnormal' : 'normal'

  const row = {
    owner_account: ctx.ownerAccount,
    vehicle_id: (veh && veh.id) || Number(event && event.vehicleId) || null,
    plate,
    vin: str(veh && veh.vin) || str(event && event.vin) || null,
    org: str(veh && veh.org) || str(event && event.org) || (ctx.driver && ctx.driver.org) || null,
    driver_name: ctx.driverName,
    driver_phone: ctx.driverPhone,
    trailer_included: trailerIncluded,
    template_id: resolved.id || null,
    template_version: resolved.version || 1,
    result,
    total_count: snapshot.length,
    abnormal_count: abnormal.length,
    items: snapshot,
    images,
    remark: str(event && event.remark).slice(0, 300) || null,
    handle_status: 'pending',
  }

  const saved = await insertTable('vehicle_inspections', row)
  const id = saved && saved[0] ? saved[0].id : null

  return {
    code: 0,
    id,
    result,
    total_count: snapshot.length,
    abnormal_count: abnormal.length,
    create_time: (saved && saved[0] && saved[0].create_time) || new Date().toISOString(),
  }
}

/* ============================================================
   action: mine（我最近提交的，P2 司机端历史用）
   ============================================================ */
async function handleMine(event, ctx) {
  const limit = Math.min(50, Math.max(1, Number(event && event.limit) || 20))
  const rows = await queryTable(
    'vehicle_inspections',
    `owner_account=eq.${enc(ctx.ownerAccount)}&driver_phone=eq.${enc(ctx.driverPhone)}` +
      `&select=id,plate,result,total_count,abnormal_count,handle_status,create_time` +
      `&order=create_time.desc&limit=${limit}`
  )
  return { code: 0, list: rows || [] }
}

/* ============================================================
   入口
   ============================================================ */
exports.main = async (event) => {
  try {
    const account = str(event && event.account)
    if (!account) return { code: 401, message: '未登录' }

    const action = str(event && event.action) || 'template'
    const ctx = await loadContext(account)

    if (action === 'template') return await handleTemplate(event, ctx)
    if (action === 'lastByPlate') return await handleLastByPlate(event, ctx)
    if (action === 'create') return await handleCreate(event, ctx)
    if (action === 'mine') return await handleMine(event, ctx)

    return { code: 400, message: '未知操作' }
  } catch (err) {
    console.error('[inspection] 失败', err)
    const msg = String((err && err.message) || '')
    if (msg.includes('42501') || /permission denied/i.test(msg)) {
      return { code: 500, message: '数据库未授权：请先执行 db_migration_inspection.sql 的 grant 段' }
    }
    if (/42P01|does not exist/i.test(msg)) {
      return { code: 500, message: '巡检表还没建：请先执行 db_migration_inspection.sql' }
    }
    return { code: 500, message: msg || '巡检提交失败' }
  }
}
