/**
 * 车务管理 · 证件到期 + 提醒事项
 * ============================================================
 * 唯一权威口径都在这，页面不要自己算：
 *   levelOf()        快到期 / 临近 / 已逾期 的判定
 *   syncReminders()  按到期日生成/更新提醒事项（幂等，一个证件最多一条待处理）
 *   flattenRow()     Excel 一行 → { vehicle, certs[] }
 *   toFlatRow()      { vehicle, certs } → Excel 一行
 *
 * ⭐ 提醒节点的单位不一样：
 *   5 类证照 → 「提前多少天」(90/30/15/7/3)
 *   保养     → 「提前多少公里」(2000/1000/500/200)，因为保养是按里程的
 * ⭐ 日历口径：全部按本地日（startOf('day')）比，不用 UTC 串切字符串。
 */
import dayjs from 'dayjs'
import { supabase } from '@/utils/supabase'
import {
  CERT_TYPES, CERT_NAME, REMIND_DAYS_DEFAULT, REMIND_DAYS_OPTIONS, NEAR_DAYS,
  VEHICLE_COLUMNS, COLUMN_BY_LABEL, ENUM_OPTIONS,
} from '@/config/vehicleColumns'

export const MAINTAIN_KM_OPTIONS = [2000, 1000, 500, 200]
export const MAINTAIN_NEAR_KM = 500

export const LEVEL_META = {
  '正常':   { color: '#047857', bg: '#ECFDF5', dot: '#0E9F6E', rank: 0 },
  '未录入': { color: '#64748B', bg: '#F1F5F9', dot: '#94A3B8', rank: 0 },
  '需核对': { color: '#64748B', bg: '#F1F5F9', dot: '#94A3B8', rank: 0 },
  '快到期': { color: '#B45309', bg: '#FFF7ED', dot: '#D97706', rank: 1 },
  '临近':   { color: '#EA580C', bg: '#FFF4ED', dot: '#EA580C', rank: 2 },
  '已逾期': { color: '#C8102E', bg: '#FDF2F4', dot: '#C8102E', rank: 3 },
}

// ============================================================
// 基础转换
// ============================================================

/** int[] 可能是数组，也可能是 PostgREST 的 "{30,7}" 字符串 */
export const parseDays = (v) => {
  if (Array.isArray(v)) return v.map(Number).filter(n => !isNaN(n))
  if (typeof v === 'number') return [v]
  if (typeof v === 'string') {
    const s = v.replace(/[{}]/g, '').trim()
    if (!s) return []
    return s.split(',').map(x => Number(x.trim())).filter(n => !isNaN(n))
  }
  return []
}

export const daysText = (v) => {
  const a = parseDays(v)
  return a.length ? a.join(',') : ''
}

/** 解析用户输入的 "90,30,7" → int[]；非法返回 null */
export const parseDaysInput = (raw, options) => {
  const s = String(raw ?? '').trim()
  if (!s) return [...REMIND_DAYS_DEFAULT]
  const arr = s.split(/[,，\s]+/).filter(Boolean).map(Number)
  if (arr.some(n => isNaN(n))) return null
  const pool = options || REMIND_DAYS_OPTIONS
  if (arr.some(n => !pool.includes(n))) return null
  return [...new Set(arr)].sort((a, b) => b - a)
}

/** 日期 → YYYY-MM-DD（兼容 Excel 序列号 / 2026-11-18 / 2026/11/18） */
export const parseDate = (v) => {
  if (!v && v !== 0) return null
  if (v instanceof Date && !isNaN(v)) return dayjs(v).format('YYYY-MM-DD')
  if (typeof v === 'number') {
    // Excel 序列号（1900 起算）
    const ms = Math.round((v - 25569) * 86400 * 1000)
    const d = new Date(ms)
    return isNaN(d) ? null : dayjs(d).format('YYYY-MM-DD')
  }
  const s = String(v).trim().replace(/[./]/g, '-')
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (!m) return null
  const y = +m[1], mo = +m[2], d = +m[3]
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = dayjs(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  if (!dt.isValid() || dt.year() !== y || dt.month() + 1 !== mo || dt.date() !== d) return null
  return dt.format('YYYY-MM-DD')
}

export const fmtDate = (v) => (v ? dayjs(v).format('YYYY-MM-DD') : '')
export const today = () => dayjs().format('YYYY-MM-DD')

/** 剩余天数（按本地日算，逾期为负） */
export const daysLeft = (d) => {
  const p = parseDate(d)
  if (!p) return null
  return dayjs(p).startOf('day').diff(dayjs().startOf('day'), 'day')
}

export const fmtLeft = (left) => {
  if (left === null || left === undefined) return '--'
  if (left < 0) return `${left} 天`
  if (left === 0) return '今天到期'
  return `${left} 天`
}

export const fmtKm = (km) => {
  if (km === null || km === undefined) return '--'
  const v = Math.round(km)
  return `${v < 0 ? '' : '剩 '}${v.toLocaleString('zh-CN')} km`
}

// ============================================================
// 级别判定（唯一口径）
// ============================================================

/**
 * @param {object} cert       vehicle_certs 行
 * @param {number} currentKm  当前里程（保养用，其他证件传 null）
 * @returns {{level:string, left:number|null, max:number}}
 */
export function levelOf(cert, currentKm) {
  if (!cert) return { level: '未录入', left: null, max: 0 }
  if (!cert.remind_enabled) return { level: '正常', left: null, max: 0 }

  /* ---------- 保养：按里程 ---------- */
  if (cert.cert_type === 'maintain') {
    const last = Number(cert.last_maintain_km) || 0
    const gap = Number(cert.maintain_interval_km) || 10000
    const max = Math.max(...(parseDays(cert.remind_days).length ? parseDays(cert.remind_days) : [1000]))
    if (!last || !currentKm) return { level: '需核对', left: null, max }
    const kmLeft = last + gap - Number(currentKm)
    if (kmLeft <= 0) return { level: '已逾期', left: kmLeft, max }
    if (kmLeft <= MAINTAIN_NEAR_KM) return { level: '临近', left: kmLeft, max }
    if (kmLeft <= max) return { level: '快到期', left: kmLeft, max }
    return { level: '正常', left: kmLeft, max }
  }

  /* ---------- 证照：按日期 ---------- */
  const left = daysLeft(cert.expire_date)
  if (left === null) return { level: '未录入', left: null, max: 0 }
  const max = Math.max(...(parseDays(cert.remind_days).length ? parseDays(cert.remind_days) : REMIND_DAYS_DEFAULT))
  if (left < 0) return { level: '已逾期', left, max }
  if (left <= NEAR_DAYS) return { level: '临近', left, max }
  if (left <= max) return { level: '快到期', left, max }
  return { level: '正常', left, max }
}

export const isDue = (lv) => ['快到期', '临近', '已逾期'].includes(lv)

/** 快到期只在「命中勾选节点」的那天才算首次触发 */
export const hitNode = (cert, left) => {
  const days = parseDays(cert.remind_days)
  return (days.length ? days : REMIND_DAYS_DEFAULT).includes(left)
}

// ============================================================
// 查证件
// ============================================================

/**
 * 租户隔离键
 * ⭐ 平台运营账号（role=admin 且没有 customerId / 未代管客户）返回 ''，
 *    表示"不过滤" —— 和车辆档案里 admin 看全部车保持一致；
 *    客户主账号（isTenantOwner 或带 customerId）仍然只看自己的。
 */
const scopeAccount = () => {
  try {
    const u = JSON.parse(localStorage.getItem('currentUser') || '{}')
    const platform = u.role === 'admin' && !u.isTenantOwner && !u.customerId && !u.masterAccount
    if (platform) return ''
    return u.masterAccount || u.account || ''
  } catch { return '' }
}

/**
 * 拉证件（可按车牌/机构/类型/状态筛）
 * ⭐ 状态是算出来的，不在库里 → 需要当前里程，所以先只按库字段筛，状态在前端过滤
 */
export async function loadCerts({ plates, org, certType, ownerAccount } = {}) {
  try {
    let q = supabase.from('vehicle_certs').select('*').order('expire_date', { ascending: true, nullsFirst: false })
    const oa = ownerAccount || scopeAccount()
    if (oa) q = q.eq('owner_account', oa)
    if (org) q = q.eq('org', org)
    if (certType) q = q.eq('cert_type', certType)
    if (plates?.length) q = q.in('plate', plates)
    const { data, error } = await q
    if (error) throw error
    return (data || []).map(r => ({ ...r, remind_days: parseDays(r.remind_days) }))
  } catch (e) {
    console.warn('[车务] 读证件失败', e?.message)
    return []
  }
}

/** 一次拿一台车的全部证件，拼成 { driving: {...}, sy_insurance: {...} } */
export async function loadCertMap(plate) {
  const rows = await loadCerts({ plates: [plate] })
  const map = {}
  rows.filter(r => r.plate === plate).forEach(r => { map[r.cert_type] = r })
  return map
}

export async function upsertCert(payload) {
  const row = { ...payload, updated_at: new Date().toISOString() }
  if (row.remind_days !== undefined) row.remind_days = parseDays(row.remind_days)
  const { data, error } = await supabase
    .from('vehicle_certs')
    .upsert(row, { onConflict: 'plate,cert_type' })
    .select()
  if (error) throw error
  return data?.[0]
}

export async function deleteCert(id) {
  const { error } = await supabase.from('vehicle_certs').delete().eq('id', id)
  if (error) throw error
}

// ============================================================
// 当前里程（保养里程型提醒要用）
// ============================================================

const KM_CACHE = new Map()
const KM_TTL = 10 * 60 * 1000

/** 车牌 → 当天最大里程（km）。取东风 track/history，失败返回 null（页面显示「需核对」） */
export async function fetchCurrentKm(plate) {
  if (!plate) return null
  const hit = KM_CACHE.get(plate)
  if (hit && Date.now() - hit.at < KM_TTL) return hit.km
  try {
    const { resolveVin, fetchTrack } = await import('@/utils/waybillProgress')
    const vin = await resolveVin(plate)
    if (!vin) return null
    const begin = dayjs().startOf('day').format('YYYY-MM-DD HH:mm:ss')
    const pts = await fetchTrack(vin, begin)
    // fetchTrack 只保留经纬度，里程要自己拉一次
    const { DONGFENG_TRACK_URL, DONGFENG_TOKEN } = await import('@/utils/waybillProgress')
    const params = new URLSearchParams({
      token: DONGFENG_TOKEN, carId: vin,
      beginTime: begin, endTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
    })
    const res = await fetch(`${DONGFENG_TRACK_URL}?${params.toString()}`)
    const json = await res.json()
    if (json.code !== 1 || !Array.isArray(json.data)) return null
    const maxM = json.data.reduce((m, p) => Math.max(m, Number(p.mileage) || 0), 0)
    const km = maxM > 0 ? maxM / 1000 : null
    KM_CACHE.set(plate, { km, at: Date.now() })
    return km
  } catch (e) {
    console.warn('[车务] 取当前里程失败', plate, e?.message)
    return null
  }
}

/** 批量取里程（限制并发，失败不阻断） */
export async function fetchKmMap(plates, concurrency = 6) {
  const out = {}
  const list = [...new Set((plates || []).filter(Boolean))]
  let i = 0
  const worker = async () => {
    while (i < list.length) {
      const p = list[i++]
      out[p] = await fetchCurrentKm(p)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker))
  return out
}

// ============================================================
// 提醒事项
// ============================================================

const reminderNo = () => {
  const d = dayjs().format('YYYYMMDD')
  const t = String(Date.now()).slice(-5)
  const r = String(Math.floor(Math.random() * 90) + 10)
  return `TX${d}-${t}${r}`
}

const levelText = (cert, level, left) => {
  const name = CERT_NAME[cert.cert_type] || '证件'
  if (cert.cert_type === 'maintain') {
    if (level === '已逾期') return `${name}已超里程 ${Math.abs(Math.round(left)).toLocaleString('zh-CN')} km，请尽快安排保养`
    if (level === '临近') return `${name}还剩 ${Math.round(left)} km 到期，请预约保养`
    return `${name}还剩 ${Math.round(left).toLocaleString('zh-CN')} km 到期`
  }
  if (level === '已逾期') return `${name}已于 ${fmtDate(cert.expire_date)} 到期，已逾期 ${Math.abs(left)} 天`
  if (level === '临近') return `${name}${left} 天后到期（${fmtDate(cert.expire_date)}），进入倒计时`
  return `${name}${left} 天后到期（${fmtDate(cert.expire_date)}）`
}

/** 下一次提醒时间：统一当天/次日 09:00（读设置里的 remind_hour） */
export const nextRemindAt = (hour = 9) => {
  const now = dayjs()
  const t = now.startOf('day').hour(hour)
  return (t.isAfter(now) ? t : t.add(1, 'day')).format('YYYY-MM-DD HH:mm:ss')
}

/** 该 cert 是否应该有一条待处理提醒 */
export function shouldRemind(cert, currentKm) {
  if (!cert?.remind_enabled) return null
  const { level, left } = levelOf(cert, currentKm)
  if (!isDue(level)) return null
  // 快到期只在命中节点当天首次触发；临近/逾期每天
  if (level === '快到期' && !hitNode(cert, left)) return null
  return { level, left }
}

/**
 * 生成/更新提醒事项（幂等）
 * ⭐ 一个证件最多一条「待处理」提醒：有就更新级别和时间，没有才新建
 * @returns {{created:number, updated:number, closed:number}}
 */
export async function syncReminders(certs, kmMap = {}, opts = {}) {
  const ownerAccount = opts.ownerAccount || scopeAccount()
  const hour = Number(opts.hour) || 9
  if (!certs?.length) return { created: 0, updated: 0, closed: 0 }

  const ids = certs.map(c => c.id).filter(Boolean)
  let open = []
  try {
    const { data } = await supabase
      .from('reminders').select('*')
      .eq('status', '待处理')
      .in('cert_id', ids)
    open = data || []
  } catch { open = [] }

  const openByCert = open.reduce((m, r) => { m[r.cert_id] = r; return m }, {})
  let created = 0, updated = 0, closed = 0

  for (const cert of certs) {
    const km = cert.cert_type === 'maintain' ? kmMap[cert.plate] : null
    const hit = shouldRemind(cert, km)
    const exist = openByCert[cert.id]

    if (!hit) {
      // 已经正常（续保/换证了）→ 把还开着的旧提醒关掉
      if (exist) {
        await supabase.from('reminders').update({
          status: '已处理', handle_action: 'auto', handled_at: new Date().toISOString(),
          handled_by: '系统', content: exist.content,
        }).eq('id', exist.id)
        closed++
      }
      continue
    }

    const payload = {
      biz_type: 'vehicle_cert',
      cert_id: cert.id,
      cert_type: cert.cert_type,
      vehicle_id: cert.vehicle_id ? String(cert.vehicle_id) : null,
      plate: cert.plate,
      org: cert.org || null,
      owner_account: ownerAccount || cert.owner_account || null,
      customer_id: cert.customer_id ? String(cert.customer_id) : null,
      due_date: cert.cert_type === 'maintain' ? null : cert.expire_date,
      level: hit.level,
      title: `${cert.plate} · ${CERT_NAME[cert.cert_type]}${hit.level === '已逾期' ? '已逾期' : hit.level === '临近' ? '临近到期' : '快到期'}`,
      content: levelText(cert, hit.level, hit.left),
      receiver_scope: 'tenant',
      remind_days: parseDays(cert.remind_days),
      next_remind_at: nextRemindAt(hour),
      status: '待处理',
    }

    if (exist) {
      await supabase.from('reminders').update({
        level: payload.level, due_date: payload.due_date,
        title: payload.title, content: payload.content,
        next_remind_at: payload.next_remind_at,
      }).eq('id', exist.id)
      updated++
    } else {
      const { error } = await supabase.from('reminders').insert({ ...payload, reminder_no: reminderNo() })
      if (!error) created++
      else console.warn('[车务] 建提醒失败', error.message)
    }
  }
  return { created, updated, closed }
}

/**
 * 预览：哪些证件「该提醒但还没生成待办」
 * ⭐ 用于「先问要不要生成提醒事项」这一步，点确定才真正写库
 */
export async function previewDueReminders(certs, kmMap = {}) {
  const ids = (certs || []).map(c => c.id).filter(Boolean)
  if (!ids.length) return []
  let open = []
  try {
    const { data } = await supabase.from('reminders').select('cert_id').eq('status', '待处理').in('cert_id', ids)
    open = data || []
  } catch { open = [] }
  const has = new Set(open.map(r => r.cert_id))
  const out = []
  for (const c of certs) {
    if (has.has(c.id)) continue
    const km = c.cert_type === 'maintain' ? kmMap[c.plate] : null
    const hit = shouldRemind(c, km)
    if (hit) out.push({ cert: c, level: hit.level, left: hit.left })
  }
  return out
}

/** 待处理提醒（可按车牌/级别筛） */
export async function loadReminders({ status = '待处理', org, plate, scope } = {}) {
  try {
    let q = supabase.from('reminders').select('*').order('created_at', { ascending: false })
    const oa = scopeAccount()
    if (scope === 'platform') q = q.eq('receiver_scope', 'platform')
    else if (oa) q = q.eq('owner_account', oa)
    if (status) q = q.eq('status', status)
    if (org) q = q.eq('org', org)
    if (plate) q = q.ilike('plate', `%${plate}%`)
    const { data, error } = await q.limit(500)
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('[车务] 读提醒失败', e?.message)
    return []
  }
}

/**
 * 车辆下拉候选（人工添加提醒用）
 * ------------------------------------------------------------
 * ⭐ 只读证件台账会漏车：一台车一条证件都没录时，下拉就是「无数据」，
 *    所以必须并上「车辆档案」（权威来源）。
 *    客户按 customer_id 过滤（与车辆档案/司机档案同口径），平台管理员看全部。
 */
export async function loadVehiclePlates() {
  const set = new Set()

  /* ① 证件台账里出现过的车牌（可能比车辆档案多：老数据只录了证件） */
  try {
    const rows = await loadCerts()
    rows.forEach((r) => { if (r.plate) set.add(r.plate) })
  } catch { /* ignore */ }

  /* ② 车辆档案（权威来源）
     ⚠️ vehicles 没有 owner_account 列（2026-10-25 实测），只有 customer_id，
        所以只按 customer_id 过滤；客户没关联客户号时按"全部可见车辆"兜底 */
  try {
    const u = (() => {
      try { return JSON.parse(localStorage.getItem('currentUser') || '{}') } catch { return {} }
    })()
    const isPlatform = u.role === 'admin' && !u.isTenantOwner && !u.customerId && !u.masterAccount
    let cid = u.customerId || null
    if (!isPlatform && !cid) {
      const phone = u.masterPhone || u.phone || ''
      if (phone) {
        const { data } = await supabase.from('customers').select('id').eq('phone', phone).maybeSingle()
        cid = data?.id || null
      }
    }

    let q = supabase.from('vehicles').select('plate')
    if (!isPlatform && cid) q = q.eq('customer_id', cid)
    const { data, error } = await q
    if (error) throw error
    ;(data || []).forEach((v) => { if (v.plate) set.add(v.plate) })
  } catch (e) {
    console.warn('[车务] 读车辆档案失败', e?.message)
  }

  return [...set].sort()
}

/** 人工添加提醒（不挂证件，或挂证件） */
export async function createManualReminder(payload) {
  const ownerAccount = scopeAccount()
  const row = {
    reminder_no: reminderNo(),
    biz_type: payload.biz_type || 'manual',
    cert_id: payload.cert_id || null,
    cert_type: payload.cert_type || null,
    plate: payload.plate || null,
    org: payload.org || null,
    owner_account: ownerAccount,
    due_date: payload.due_date || null,
    level: payload.due_date ? (daysLeft(payload.due_date) < 0 ? '已逾期' : daysLeft(payload.due_date) <= 3 ? '临近' : '快到期') : '快到期',
    title: payload.title,
    content: payload.content || '',
    source: 'manual',
    receiver_scope: payload.receiver_scope || 'tenant',
    next_remind_at: nextRemindAt(),
    status: '待处理',
  }
  const { data, error } = await supabase.from('reminders').insert(row).select()
  if (error) throw error
  return data?.[0]
}

/** 改下次提醒时间 */
export async function postponeReminder(id, when) {
  const { error } = await supabase.from('reminders')
    .update({ next_remind_at: when, snooze_until: when }).eq('id', id)
  if (error) throw error
}

/** 取消提醒（不动档案，次日仍会被重新命中并再问一次） */
export async function cancelReminder(id, by = '') {
  const { error } = await supabase.from('reminders').update({
    status: '已忽略', handle_action: 'cancel',
    handled_by: by, handled_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw error
}

/**
 * 更新到期日并关闭提醒（续保/换证）
 * ⭐ 改完按新日期重新排期；若新日期仍在提醒窗口内，返回 needAsk=true 让页面再问一次
 */
export async function renewCert(reminder, patch) {
  const cert = {
    plate: reminder.plate,
    cert_type: reminder.cert_type,
    cert_no: patch.cert_no ?? undefined,
    start_date: patch.start_date ?? undefined,
    expire_date: patch.expire_date,
    remind_days: parseDays(patch.remind_days),
    owner_account: reminder.owner_account,
    org: reminder.org,
    customer_id: reminder.customer_id,
    vehicle_id: reminder.vehicle_id,
  }
  Object.keys(cert).forEach(k => cert[k] === undefined && delete cert[k])
  const saved = await upsertCert(cert)

  await supabase.from('reminders').update({
    status: '已处理', handle_action: 'renew',
    handled_by: patch.by || '', handled_at: new Date().toISOString(),
  }).eq('id', reminder.id)

  const plain = { ...saved, remind_days: parseDays(saved?.remind_days) }
  const hit = shouldRemind({ ...plain, remind_enabled: true }, null)
  return { cert: plain, needAsk: !!hit, hit }
}

/** 提醒事项 → 更新单条（内容/下次提醒） */
export async function updateReminder(id, patch) {
  const { error } = await supabase.from('reminders').update(patch).eq('id', id)
  if (error) throw error
}

// ============================================================
// 宽表 ↔ 分表（导入导出）
// ============================================================

/**
 * Excel 一行（{表头: 值}）→ { vehicle, certs }
 * ⭐ 按表头名取值，不认列位置：老 10 列 Excel 也能导，缺列 = 不更新
 */
export function flattenRow(byLabel, { isNewVehicle = false } = {}) {
  const vehicle = {}
  const certs = {}

  for (const col of VEHICLE_COLUMNS) {
    const raw = byLabel[col.label]
    const has = raw !== undefined && raw !== null && String(raw).trim() !== ''
    if (!has) continue

    if (col.target === 'vehicle') {
      if (col.type === 'date') {
        const d = parseDate(raw)
        if (d) vehicle[col.col] = d
      } else if (col.type === 'enum') {
        const s = String(raw).trim()
        const pool = ENUM_OPTIONS[col.enumKey] || []
        if (!pool.length || pool.includes(s)) vehicle[col.col] = s
        else throw new Error(`「${col.label}」只能是：${pool.join(' / ')}`)
      } else {
        vehicle[col.col] = String(raw).trim()
      }
    } else {
      certs[col.cert] = certs[col.cert] || { cert_type: col.cert }
      if (col.type === 'date') {
        const d = parseDate(raw)
        if (!d) throw new Error(`「${col.label}」日期格式不对：${raw}`)
        certs[col.cert][col.col] = d
      } else if (col.type === 'number') {
        const n = Number(String(raw).replace(/,/g, '').trim())
        if (isNaN(n)) throw new Error(`「${col.label}」必须是数字：${raw}`)
        certs[col.cert][col.col] = n
      } else if (col.type === 'days') {
        const kmMode = col.cert === 'maintain'
        const days = parseDaysInput(raw, kmMode ? MAINTAIN_KM_OPTIONS : REMIND_DAYS_OPTIONS)
        if (!days) throw new Error(`「${col.label}」只能填 ${(kmMode ? MAINTAIN_KM_OPTIONS : REMIND_DAYS_OPTIONS).join('/')}`)
        certs[col.cert][col.col] = days
      } else {
        certs[col.cert][col.col] = String(raw).trim()
      }
    }
  }

  if (!vehicle.plate) throw new Error('缺少车牌号')
  if (isNewVehicle && !vehicle.vin) throw new Error('新建车辆必须填车架号(VIN)')

  /* 证件：只有"到期日/里程"或证号有值才建，整组全空不建 */
  const certList = Object.values(certs).filter(c => {
    if (c.cert_type === 'maintain') return c.last_maintain_km != null || c.maintain_interval_km != null
    return !!(c.expire_date || c.cert_no)
  })
  certList.forEach(c => {
    if (!c.remind_days) c.remind_days = c.cert_type === 'maintain' ? [1000] : [...REMIND_DAYS_DEFAULT]
    if (c.cert_type !== 'maintain' && !c.expire_date && c.cert_no) {
      // 只有证号没有到期日 → 合法，但不会进提醒
    }
  })

  return { vehicle, certs: certList }
}

/** { vehicle, certs } → 宽表一行（导出/导入回读都用） */
export function toFlatRow(vehicle, certMap) {
  const out = {}
  for (const col of VEHICLE_COLUMNS) {
    if (col.target === 'vehicle') {
      out[col.label] = vehicle?.[col.col] ?? ''
    } else {
      const c = certMap?.[col.cert]
      if (!c) { out[col.label] = ''; continue }
      if (col.type === 'days') out[col.label] = daysText(c.remind_days)
      else out[col.label] = c[col.col] ?? ''
    }
  }
  return out
}

/**
 * 保存一台车 + 它的证件
 * ⭐ 拆/拼逻辑只在这里，页面看不到两张表
 */
export async function saveVehicleWithCerts({ vehicle, certs }, { existingId } = {}) {
  const now = new Date().toISOString()
  const vRow = { ...vehicle, updated_at: now }
  let vid = existingId
  let isNew = false

  if (!vid) {
    const { data: found } = await supabase
      .from('vehicles').select('id').eq('plate', vehicle.plate).limit(1)
    vid = found?.[0]?.id
  }

  if (vid) {
    const { error } = await supabase.from('vehicles').update(vRow).eq('id', vid)
    if (error) throw error
  } else {
    isNew = true
    vRow.created_at = now
    const { data, error } = await supabase.from('vehicles').insert(vRow).select('id')
    if (error) throw error
    vid = data?.[0]?.id
  }

  let savedCerts = 0
  for (const c of certs || []) {
    const row = {
      ...c,
      vehicle_id: vid ? String(vid) : null,
      plate: vehicle.plate,
      org: vehicle.org || null,
      owner_account: c.owner_account || scopeAccount() || null,
      customer_id: c.customer_id || (vehicle.customer_id ? String(vehicle.customer_id) : null),
      updated_at: now,
    }
    if (row.cert_type === 'maintain') {
      row.expire_date = row.expire_date || null
    }
    const { error } = await supabase
      .from('vehicle_certs')
      .upsert(row, { onConflict: 'plate,cert_type' })
    if (error) throw error
    savedCerts++
  }
  return { vehicleId: vid, isNew, savedCerts }
}

// ============================================================
// 提醒设置
// ============================================================

export const DEFAULT_SETTINGS = {
  remind_hour: 9,
  weekend: true,
  receivers: { master: true, admins: [], platform: false },
  default_days: {
    driving: [30], transport: [30], jq_insurance: [30],
    sy_insurance: [30], excess_insurance: [30], maintain: [1000],
  },
  maintain_interval_km: 10000,
}

export async function loadSettings() {
  const oa = scopeAccount()
  if (!oa) return { ...DEFAULT_SETTINGS }
  try {
    const { data } = await supabase
      .from('vehicle_affair_settings').select('*').eq('owner_account', oa).maybeSingle()
    if (!data) return { ...DEFAULT_SETTINGS }
    return {
      ...DEFAULT_SETTINGS,
      ...data,
      receivers: { ...DEFAULT_SETTINGS.receivers, ...(data.receivers || {}) },
      default_days: { ...DEFAULT_SETTINGS.default_days, ...(data.default_days || {}) },
    }
  } catch { return { ...DEFAULT_SETTINGS } }
}

export async function saveSettings(patch) {
  const oa = scopeAccount()
  if (!oa) throw new Error('未取到租户账号')
  const row = { owner_account: oa, ...patch, updated_at: new Date().toISOString() }
  const { error } = await supabase
    .from('vehicle_affair_settings')
    .upsert(row, { onConflict: 'owner_account' })
  if (error) throw error
}

// ============================================================
// 汇总
// ============================================================

/** 4 个 KPI + 分证件统计 */
export function summarize(certs, kmMap = {}) {
  const kpi = { overdue: 0, near: 0, soon: 0, normal: 0, missing: 0 }
  const byType = {}
  CERT_TYPES.forEach(t => { byType[t.key] = { total: 0, overdue: 0, near: 0, soon: 0, normal: 0, missing: 0 } })

  certs.forEach(c => {
    const km = c.cert_type === 'maintain' ? kmMap[c.plate] : null
    const { level } = levelOf(c, km)
    const bucket = level === '已逾期' ? 'overdue' : level === '临近' ? 'near'
      : level === '快到期' ? 'soon' : (level === '正常' ? 'normal' : 'missing')
    kpi[bucket]++
    if (byType[c.cert_type]) { byType[c.cert_type].total++; byType[c.cert_type][bucket]++ }
  })
  return { kpi, byType }
}

/** 未来 N 天（或 90 天）到期分布，按月聚合 */
export function dueBuckets(certs, months = 6) {
  const out = []
  for (let i = 0; i < months; i++) {
    const m = dayjs().add(i, 'month')
    out.push({ key: m.format('YYYY-MM'), label: `${m.month() + 1}月`, count: 0 })
  }
  certs.forEach(c => {
    if (c.cert_type === 'maintain') return
    const d = parseDate(c.expire_date)
    if (!d) return
    const k = dayjs(d).format('YYYY-MM')
    const hit = out.find(x => x.key === k)
    if (hit) hit.count++
  })
  return out
}
