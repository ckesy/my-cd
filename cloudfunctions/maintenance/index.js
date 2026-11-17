/**
 * 云函数：maintenance
 * ============================================================
 * 维保台账（维修 / 保养 / 轮胎）—— **小程序管理端**的读写入口
 *
 * action:
 *   list     { kind?, plate?, from?, to?, limit? }  → 台账列表（不带 kind 就全给，前端分三段并出计数）
 *   byPlate  { plate }                              → 该车全部记录（单车维保时间流）
 *   save     { record }                             → 新增 / 编辑；**保养时顺手回写车务**
 *   del      { id }                                 → 删除
 *
 * 闸门（三层都要）：`role_id` 非空 **或** `!owner_account`
 *   → 主账号 / 管理员 / 员工可用；**司机永远 403**。
 *   （2026-10-22 踩过：只放宽登录不同步云函数 = 前端能进页、后端全 403）
 *
 * ⭐ 保养回写车务：与 Web `src/utils/maintenance.js` 的 `syncMaintainToCert()` **同口径**。
 *   小程序复用不了 Web 那份，只能各写一遍 —— 改一处必须同步另一处，
 *   否则会出现「小程序录完保养，Web 看还在提醒」。
 *
 * ⚠️ 匿名 token 只有 2 小时：getToken 按过期时间取，401 换 token 重试一次。
 * ⚠️ 云函数之间不能 require 本地模块，这段基础设施是各函数各一份的复制件。
 */

const { randomUUID } = require('crypto')

const API_BASE = 'https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com'
const DEVICE_ID = randomUUID()
const enc = encodeURIComponent

const KINDS = ['repair', 'service', 'tire']
const FIELDS =
  'id,owner_account,customer_id,vehicle_id,plate,org,kind,happen_at,mileage,amount,vendor,vendor_type,' +
  'fault_desc,repair_desc,category,service_level,items,maintain_interval_km,' +
  'tire_action,tire_pos,tire_no,tire_brand,tire_spec,tread_mm,' +
  'images,remark,status,inspection_id,report_id,created_by,create_time'

let _token = null
let _tokenExp = 0

const str = (v) => String(v == null ? '' : v).trim()
const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

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

async function request(method, table, query, body, extraHeaders) {
  const url = `${API_BASE}/v1/rdb/rest/${table}${query ? '?' + query : ''}`
  const doFetch = async (token) => {
    const headers = {
      Authorization: `Bearer ${token}`,
      'x-device-id': DEVICE_ID,
      'Accept-Profile': 'public',
      'Content-Profile': 'public',
      ...(extraHeaders || {}),
    }
    if (body) headers['Content-Type'] = 'application/json'
    if ((method === 'PATCH' || method === 'POST') && !headers.Prefer) {
      headers.Prefer = 'return=representation'
    }
    return fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
  }
  let res = await doFetch(await getToken())
  if (res.status === 401) res = await doFetch(await getToken(true))
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`${method} ${table} 失败 HTTP ${res.status}: ${txt.slice(0, 200)}`)
  }
  const txt = await res.text()
  try {
    return txt ? JSON.parse(txt) : []
  } catch (e) {
    return []
  }
}

const queryTable = (table, query) => request('GET', table, query)
const insertTable = (table, row) => request('POST', table, '', row)
const patchTable = (table, query, patch) => request('PATCH', table, query, patch)

/* ============================================================
   身份 / 权限
   ============================================================ */
async function loadContext(account) {
  const users = await queryTable(
    'users',
    `account=eq.${enc(account)}&select=id,account,name,phone,owner_account,role_id&limit=1`
  )
  const user = users[0]
  if (!user) {
    const e = new Error('账号不存在')
    e.code = 401
    throw e
  }
  /* ⭐ 管理端闸门：角色 或 主账号（客户大BOSS：role_id 为空、owner_account 也为空） */
  const isStaff = !!str(user.role_id)
  const isMaster = !str(user.owner_account)
  if (!isStaff && !isMaster) {
    const e = new Error('仅管理端账号可用')
    e.code = 403
    throw e
  }
  return {
    account,
    user,
    ownerAccount: str(user.owner_account) || str(user.account),
    name: str(user.name) || account,
  }
}

/* ============================================================
   保养 → 回写车务（与 Web syncMaintainToCert 同口径）
   ------------------------------------------------------------
   · last_maintain_date / last_maintain_km 一定要写
   · 间隔里程本次填了就覆盖，没填沿用原值（再没有就 10000）
   · 日期型（有 expire_date 且有上次日期）按原间隔天数往后推
   · 最后把该车「待处理」的保养待办结掉
   ============================================================ */
async function upsertCert(table, row, onConflict) {
  const q = onConflict ? `on_conflict=${enc(onConflict)}` : ''
  return request('POST', table, q, row, {
    Prefer: 'resolution=merge-duplicates,return=representation',
  })
}

async function syncMaintainToCert(rec, ctx) {
  if (!rec || rec.kind !== 'service' || !rec.plate) return { ok: false, closed: 0 }
  try {
    const old = (
      await queryTable(
        'vehicle_certs',
        `plate=eq.${enc(rec.plate)}&cert_type=eq.maintain&limit=1`
      )
    )[0] || {}

    /* 日期型：原到期日 − 原保养日 = 间隔天数，往后推一次 */
    let expireDate = old.expire_date || null
    if (old.expire_date && old.last_maintain_date) {
      const gap = Math.round(
        (Date.parse(old.expire_date) - Date.parse(old.last_maintain_date)) / 86400000
      )
      if (Number.isFinite(gap) && gap > 0) {
        const next = new Date(`${rec.happen_at}T00:00:00Z`)
        next.setUTCDate(next.getUTCDate() + gap)
        expireDate = next.toISOString().slice(0, 10)
      }
    }

    await upsertCert(
      'vehicle_certs',
      {
        plate: rec.plate,
        cert_type: 'maintain',
        vehicle_id: rec.vehicle_id ? String(rec.vehicle_id) : old.vehicle_id || null,
        org: rec.org || old.org || null,
        owner_account: rec.owner_account || old.owner_account || ctx.ownerAccount,
        customer_id: rec.customer_id || old.customer_id || null,
        start_date: rec.happen_at,
        last_maintain_date: rec.happen_at,
        last_maintain_km: num(rec.mileage) || old.last_maintain_km || null,
        maintain_interval_km:
          num(rec.maintain_interval_km) || old.maintain_interval_km || 10000,
        expire_date: expireDate,
        remind_enabled: old.remind_enabled !== false,
        remind_days:
          Array.isArray(old.remind_days) && old.remind_days.length ? old.remind_days : [1000],
      },
      'plate,cert_type'
    )

    /* 结掉待办 */
    const closed = await patchTable(
      'reminders',
      `plate=eq.${enc(rec.plate)}&cert_type=eq.maintain&status=eq.${enc('待处理')}`,
      {
        status: '已处理',
        handle_action: 'auto',
        handled_by: ctx.name || '系统',
        handled_at: new Date().toISOString(),
      }
    )
    return { ok: true, closed: Array.isArray(closed) ? closed.length : 0 }
  } catch (e) {
    console.warn('[maintenance] 回写车务失败（记录已保存）', e.message)
    return { ok: false, closed: 0, error: e.message }
  }
}

/* ============================================================
   列表
   ============================================================ */
function normalize(r) {
  return {
    ...r,
    items: Array.isArray(r.items) ? r.items : [],
    images: Array.isArray(r.images) ? r.images : [],
    amount: num(r.amount),
  }
}

async function handleList(event, ctx) {
  const parts = [`owner_account=eq.${enc(ctx.ownerAccount)}`, `select=${enc(FIELDS)}`]
  if (str(event.kind)) parts.push(`kind=eq.${enc(str(event.kind))}`)
  if (str(event.plate)) parts.push(`plate=eq.${enc(str(event.plate))}`)
  if (str(event.from)) parts.push(`happen_at=gte.${enc(str(event.from))}`)
  if (str(event.to)) parts.push(`happen_at=lte.${enc(str(event.to))}`)
  parts.push('order=happen_at.desc')
  parts.push(`limit=${Math.min(1000, num(event.limit) || 500)}`)

  const rows = await queryTable('maintenance_records', parts.join('&'))
  return { code: 0, list: (rows || []).map(normalize) }
}

async function handleByPlate(event, ctx) {
  const plate = str(event.plate)
  if (!plate) return { code: 400, message: '缺少车牌' }
  const rows = await queryTable(
    'maintenance_records',
    `owner_account=eq.${enc(ctx.ownerAccount)}&plate=eq.${enc(plate)}&select=${enc(FIELDS)}&order=happen_at.desc&limit=500`
  )
  return { code: 0, list: (rows || []).map(normalize) }
}

/* ============================================================
   保存
   ============================================================ */
function buildRow(input, ctx) {
  const kind = str(input.kind)
  if (!KINDS.includes(kind)) throw Object.assign(new Error('类型不对'), { code: 400 })
  const plate = str(input.plate)
  if (!plate) throw Object.assign(new Error('请选择车辆'), { code: 400 })
  const happenAt = str(input.happen_at).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(happenAt)) {
    throw Object.assign(new Error('请选择日期'), { code: 400 })
  }

  const row = {
    owner_account: ctx.ownerAccount,
    customer_id: input.customer_id ? String(input.customer_id) : null,
    vehicle_id: input.vehicle_id ? String(input.vehicle_id) : null,
    plate,
    org: str(input.org) || null,
    kind,
    happen_at: happenAt,
    mileage: input.mileage === '' || input.mileage == null ? null : num(input.mileage),
    amount: num(input.amount),
    vendor: str(input.vendor) || null,
    vendor_type: str(input.vendor_type) || 'out',
    images: Array.isArray(input.images) ? input.images.slice(0, 6) : [],
    remark: str(input.remark) || null,
    status: str(input.status) || 'done',
    inspection_id: input.inspection_id || null,
    report_id: input.report_id || null,
    created_by: str(input.created_by) || ctx.name,
    updated_at: new Date().toISOString(),
  }

  if (kind === 'repair') {
    const fault = str(input.fault_desc)
    const repair = str(input.repair_desc)
    if (!fault) throw Object.assign(new Error('请填写故障现象'), { code: 400 })
    if (!repair) throw Object.assign(new Error('请填写维修项目'), { code: 400 })
    row.fault_desc = fault.slice(0, 200)
    row.repair_desc = repair.slice(0, 200)
    row.category = str(input.category) || '其他'
  }
  if (kind === 'service') {
    const lv = str(input.service_level)
    if (!['daily', 'level1', 'level2'].includes(lv)) {
      throw Object.assign(new Error('请选择保养级别'), { code: 400 })
    }
    row.service_level = lv
    row.items = Array.isArray(input.items) ? input.items.slice(0, 20) : []
    row.maintain_interval_km = num(input.maintain_interval_km) || null
  }
  if (kind === 'tire') {
    const act = str(input.tire_action)
    if (!act) throw Object.assign(new Error('请选择轮胎动作'), { code: 400 })
    row.tire_action = act
    row.tire_pos = str(input.tire_pos) || null
    row.tire_no = str(input.tire_no) || null
    row.tire_brand = str(input.tire_brand) || null
    row.tire_spec = str(input.tire_spec) || null
    row.tread_mm = input.tread_mm === '' || input.tread_mm == null ? null : num(input.tread_mm)
  }
  return row
}

async function handleSave(event, ctx) {
  const input = event.record || {}
  const row = buildRow(input, ctx)

  let saved
  if (input.id) {
    /* 编辑：只改自己租户的 */
    const out = await patchTable(
      'maintenance_records',
      `id=eq.${num(input.id)}&owner_account=eq.${enc(ctx.ownerAccount)}&select=${enc(FIELDS)}`,
      row
    )
    saved = (out || [])[0]
    if (!saved) return { code: 404, message: '记录不存在或已删除' }
  } else {
    row.create_time = new Date().toISOString()
    const out = await insertTable('maintenance_records', row)
    saved = (Array.isArray(out) ? out[0] : out) || null
  }
  if (!saved) return { code: 500, message: '保存失败' }

  /* ⭐ 保养：回写车务 + 结掉待办 */
  let sync = null
  if (saved.kind === 'service') {
    sync = await syncMaintainToCert(normalize(saved), ctx)
  }

  return { code: 0, record: normalize(saved), sync }
}

async function handleDel(event, ctx) {
  const id = num(event.id)
  if (!id) return { code: 400, message: '缺少 id' }
  await request(
    'DELETE',
    'maintenance_records',
    `id=eq.${id}&owner_account=eq.${enc(ctx.ownerAccount)}`
  )
  return { code: 0 }
}

/* ============================================================
   入口
   ============================================================ */
exports.main = async (event = {}) => {
  try {
    const account = str(event && event.account)
    if (!account) return { code: 401, message: '未登录' }

    const ctx = await loadContext(account)
    const action = str(event.action) || 'list'

    if (action === 'list') return await handleList(event, ctx)
    if (action === 'byPlate') return await handleByPlate(event, ctx)
    if (action === 'save') return await handleSave(event, ctx)
    if (action === 'del') return await handleDel(event, ctx)

    return { code: 400, message: '未知操作' }
  } catch (err) {
    console.error('[maintenance] 失败', err)
    const code = err.code || 500
    const msg = String((err && err.message) || '')
    if (msg.includes('42501') || /permission denied/i.test(msg)) {
      return { code: 500, message: '数据库未授权：请先执行 sql/2026-10-25_maintenance_records.sql 的 grant 段' }
    }
    if (/42P01|does not exist/i.test(msg)) {
      return { code: 500, message: '维保表还没建：请先执行 sql/2026-10-25_maintenance_records.sql' }
    }
    return { code, message: msg || '维保操作失败' }
  }
}