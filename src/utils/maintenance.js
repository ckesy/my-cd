/**
 * 维保台账（维修 / 保养 / 轮胎）· 数据层
 * ============================================================
 * 一张表 `maintenance_records` + kind 区分三类。
 *
 * ⭐ 两条铁律：
 *   1) 保养记录保存后要**回写车务**（`vehicle_certs.maintain`）+ 结掉待办，
 *      否则「刚录完保养、提醒还挂着」。下次保养由车务的 maintain_interval_km 推算，
 *      台账**不存** next_mileage / next_date。
 *   2) 金额只记事实；审批与付款仍走「费用管理」的 reports（维修单可一键生成上报）。
 */
import { supabase } from './supabase'
import { loadCertMap, upsertCert } from './vehicleAffair'

/* ============================================================
   字典（页面只引用这里，别在页面里自建映射）
   ============================================================ */
export const KIND_META = {
  repair: { key: 'repair', label: '维修', short: '修', color: '#C8102E', bg: '#FEF2F2' },
  service: { key: 'service', label: '保养', short: '保', color: '#15803D', bg: '#DCFCE7' },
  tire: { key: 'tire', label: '轮胎', short: '胎', color: '#1D4ED8', bg: '#DBEAFE' },
}
export const KIND_TABS = ['repair', 'service', 'tire']

export const REPAIR_CATEGORIES = ['机修', '电修', '钣金', '事故', '三电', '其他']

export const SERVICE_LEVELS = [
  { value: 'daily', label: '日常维护' },
  { value: 'level1', label: '一级维护' },
  { value: 'level2', label: '二级维护' },
]
export const SERVICE_LEVEL_LABEL = { daily: '日常维护', level1: '一级维护', level2: '二级维护' }

export const SERVICE_ITEMS = [
  '换机油', '换齿轮油', '换空滤', '换空调滤', '换刹车片',
  '打黄油', '四轮保养', '检查制动', '检查转向', '检查轮胎', '三电检查',
]

export const TIRE_ACTIONS = ['装胎', '换胎', '补胎', '换位', '报废']
export const TIRE_POSITIONS = ['左前', '右前', '左后内', '左后外', '右后内', '右后外', '挂车左后', '挂车右后', '备用']

export const FIELDS =
  'id,owner_account,customer_id,vehicle_id,plate,org,kind,happen_at,mileage,amount,vendor,vendor_type,' +
  'fault_desc,repair_desc,category,service_level,items,maintain_interval_km,' +
  'tire_action,tire_pos,tire_no,tire_brand,tire_spec,tread_mm,' +
  'images,remark,status,inspection_id,report_id,created_by,create_time'

/* ============================================================
   身份 / 范围
   ============================================================ */
export const currentUser = (() => {
  try {
    return JSON.parse(localStorage.getItem('currentUser') || 'null') || {}
  } catch {
    return {}
  }
})()
export const isAdmin = currentUser.role === 'admin'
export const myAccount = currentUser.masterAccount || currentUser.account || ''
export const myName = currentUser.name || currentUser.account || ''

/** 租户隔离：管理员不过滤（台账 records 走 owner_account） */
export const scope = (q) => (isAdmin ? q : q.eq('owner_account', myAccount))

/* ============================================================
   ⭐ 车辆表隔离（口径与 VehicleArchive 完全一致，别各写一套）
   ------------------------------------------------------------
   vehicles 没有 owner_account，靠 customer_id 隔离；
   二级机构子账号再加 org。管理员（平台侧）不过滤。
   ⚠️ 2026-10-25 用户反馈：维保录单的「车辆」下拉出现了别的租户的车
      （车队演示账号 + 山西卡友混在一起）—— 就是因为这里没过滤。
   ============================================================ */
const isSubAccount = !!currentUser.isSubAccount
const myCustomerId = currentUser.customerId || null
const myOrgName = isSubAccount ? String(currentUser.orgName || '').trim() || null : null
const myOrgLevel = isSubAccount ? Number(currentUser.orgLevel) || 1 : null
export const needOrgFilter = !isAdmin && isSubAccount && Number(myOrgLevel) >= 2

export const scopeVehicles = (q) => {
  if (isAdmin || !myCustomerId) return q
  let out = q.eq('customer_id', myCustomerId)
  if (needOrgFilter && myOrgName) out = out.eq('org', myOrgName)
  return out
}

/* ============================================================
   读
   ============================================================ */
/**
 * @param {{kind?:string, plate?:string, from?:string, to?:string, limit?:number}} opts
 */
export async function loadRecords(opts = {}) {
  let q = supabase.from('maintenance_records').select(FIELDS).order('happen_at', { ascending: false })
  q = scope(q)
  if (opts.kind) q = q.eq('kind', opts.kind)
  if (opts.plate) q = q.eq('plate', opts.plate)
  if (opts.from) q = q.gte('happen_at', opts.from)
  if (opts.to) q = q.lte('happen_at', opts.to)
  q = q.limit(opts.limit || 1000)

  const { data, error } = await q
  if (error) throw error
  return (data || []).map((r) => ({
    ...r,
    items: Array.isArray(r.items) ? r.items : [],
    images: Array.isArray(r.images) ? r.images : [],
    amount: Number(r.amount) || 0,
  }))
}

/** 单车全部记录（时间轴用） */
export const loadByPlate = (plate) => loadRecords({ plate, limit: 500 })

/** 车牌 → { id, org }（补全台账里的车辆信息） */
export async function loadVehicleBrief(plates) {
  const list = Array.from(new Set((plates || []).filter(Boolean)))
  if (!list.length) return {}
  try {
    let q = supabase.from('vehicles').select('id,plate,org').in('plate', list)
    q = scopeVehicles(q)
    const { data } = await q
    const map = {}
    ;(data || []).forEach((v) => {
      map[v.plate] = v
    })
    return map
  } catch (e) {
    return {}
  }
}

/* ============================================================
   写
   ============================================================ */
export async function saveRecord(row) {
  /* ⚠️ 只挑表里存在的列：多带一个字段 PostgREST 会整条 400 */
  const pick = (k) => (row[k] === undefined ? undefined : row[k])
  const keep = [
    'id', 'owner_account', 'customer_id', 'vehicle_id', 'plate', 'org', 'kind',
    'happen_at', 'mileage', 'amount', 'vendor', 'vendor_type',
    'fault_desc', 'repair_desc', 'category',
    'service_level', 'items', 'maintain_interval_km',
    'tire_action', 'tire_pos', 'tire_no', 'tire_brand', 'tire_spec', 'tread_mm',
    'images', 'remark', 'status', 'inspection_id', 'report_id', 'created_by', 'create_time',
  ]
  const payload = {}
  keep.forEach((k) => {
    if (row[k] !== undefined) payload[k] = pick(k)
  })

  payload.owner_account =
    payload.owner_account || (isAdmin ? null : myAccount || null)
  payload.customer_id = payload.customer_id || (currentUser.customerId ? String(currentUser.customerId) : null)
  payload.amount = Number(payload.amount) || 0
  payload.mileage = payload.mileage === '' || payload.mileage == null ? null : Number(payload.mileage)
  payload.tread_mm = payload.tread_mm === '' || payload.tread_mm == null ? null : Number(payload.tread_mm)
  payload.maintain_interval_km =
    payload.kind === 'service' && payload.maintain_interval_km
      ? Number(payload.maintain_interval_km)
      : null
  payload.images = Array.isArray(payload.images) ? payload.images : []
  payload.items = Array.isArray(payload.items) ? payload.items : []
  payload.updated_at = new Date().toISOString()
  payload.created_by = payload.created_by || myName
  if (!payload.id) {
    delete payload.id
    payload.create_time = payload.create_time || new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('maintenance_records')
    .upsert(payload, { onConflict: 'id' })
    .select(FIELDS)
  if (error) throw error
  return data && data[0]
}

export async function deleteRecord(id) {
  let q = supabase.from('maintenance_records').delete().eq('id', id)
  if (!isAdmin) q = q.eq('owner_account', myAccount)
  const { error } = await q
  if (error) throw error
}

/* ============================================================
   ⭐ 保养记录 → 回写车务（不做会出现「刚录完保养、提醒还挂着」）
   ------------------------------------------------------------
   · last_maintain_date / last_maintain_km 一定要写
   · 间隔里程本次填了就覆盖，没填沿用原值
   · 如果这车保养是按「日期型」提醒（有 expire_date 且没有里程），
     按上次的间隔天数往后推一次
   · 最后把该车「待处理」的保养待办结掉
   ============================================================ */
export async function syncMaintainToCert(rec) {
  if (!rec || rec.kind !== 'service' || !rec.plate) return { ok: false, reason: 'skip' }

  const result = { ok: false, cert: null, closed: 0 }
  try {
    const map = await loadCertMap(rec.plate)
    const old = map.maintain || {}

    /* 日期型：原到期日 − 原保养日 = 间隔天数，往后推 */
    let expireDate = old.expire_date || null
    if (old.expire_date && old.last_maintain_date) {
      const gapDays = Math.round(
        (Date.parse(old.expire_date) - Date.parse(old.last_maintain_date)) / 86400000
      )
      if (Number.isFinite(gapDays) && gapDays > 0) {
        const next = new Date(`${rec.happen_at}T00:00:00Z`)
        next.setUTCDate(next.getUTCDate() + gapDays)
        expireDate = next.toISOString().slice(0, 10)
      }
    }

    const payload = {
      plate: rec.plate,
      cert_type: 'maintain',
      vehicle_id: rec.vehicle_id || old.vehicle_id || null,
      org: rec.org || old.org || null,
      owner_account: rec.owner_account || old.owner_account || (isAdmin ? null : myAccount),
      customer_id: rec.customer_id || old.customer_id || null,
      start_date: rec.happen_at,
      last_maintain_date: rec.happen_at,
      last_maintain_km: Number(rec.mileage) || old.last_maintain_km || null,
      maintain_interval_km:
        Number(rec.maintain_interval_km) || old.maintain_interval_km || 10000,
      expire_date: expireDate,
      remind_enabled: old.remind_enabled !== false,
      remind_days: old.remind_days && old.remind_days.length ? old.remind_days : [1000],
    }

    result.cert = await upsertCert(payload)

    /* 结掉待办：同一车、保养、待处理 */
    const { data: closed, error: e2 } = await supabase
      .from('reminders')
      .update({
        status: '已处理',
        handle_action: 'auto',
        handled_by: myName || '系统',
        handled_at: new Date().toISOString(),
      })
      .eq('plate', rec.plate)
      .eq('cert_type', 'maintain')
      .eq('status', '待处理')
      .select('id')
    if (e2) throw e2

    result.closed = (closed || []).length
    result.ok = true
  } catch (e) {
    console.warn('[维保] 回写车务失败（记录已保存，可手动去车务台账改）', e)
  }
  return result
}

/* ============================================================
   外观巡检异常 → 维修单
   ------------------------------------------------------------
   巡检里标的异常项（含描述、照片）直接带过来，管理员一个字不用重打。
   生成后把巡检记录标记为「已处理」。
   ============================================================ */
export async function repairFromInspection(ins) {
  if (!ins || !ins.plate) throw new Error('巡检记录缺少车牌')

  const bad = (ins.items || []).filter((it) => it.status === 'abnormal')
  const badKeys = bad.map((it) => it.key)
  const images = (ins.images || [])
    .filter((im) => badKeys.includes(im.item))
    .map((im) => ({ key: im.key || im.fileID, name: im.name || '', size: im.size || 0 }))
    .filter((im) => im.key)

  const row = {
    owner_account: ins.owner_account || null,
    vehicle_id: ins.vehicle_id ? String(ins.vehicle_id) : null,
    plate: ins.plate,
    org: ins.org || null,
    kind: 'repair',
    happen_at: new Date().toISOString().slice(0, 10),
    mileage: null,
    amount: 0,
    vendor: '',
    vendor_type: 'out',
    category: '其他',
    fault_desc: bad.map((it) => `${it.label}：${it.note || '异常'}`).join('；').slice(0, 500),
    repair_desc: '',
    status: 'doing',
    inspection_id: ins.id || null,
    images,
    remark: `由外观巡检生成（${String(ins.create_time || '').slice(0, 10)}）`,
  }

  const saved = await saveRecord(row)

  /* 回写巡检：已处理 + 说明 */
  try {
    await supabase
      .from('vehicle_inspections')
      .update({
        handle_status: 'done',
        handle_note: `已生成维修单 #${saved.id}`,
        handle_by: myName || '系统',
        handle_at: new Date().toISOString(),
      })
      .eq('id', ins.id)
  } catch (e) {
    console.warn('[维保] 回写巡检状态失败', e)
  }

  return saved
}

/* ============================================================
   展示小工具
   ============================================================ */
export const money = (n) => `¥${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
export const km = (n) => (n ? `${Number(n).toLocaleString('en-US')} km` : '--')
export const day = (v) => (v ? String(v).slice(0, 10) : '--')

/** 一条记录的「内容摘要」（时间轴 / 列表复用） */
export function summaryOf(r) {
  if (!r) return ''
  if (r.kind === 'repair') return r.repair_desc || r.fault_desc || '维修'
  if (r.kind === 'service') {
    const lv = SERVICE_LEVEL_LABEL[r.service_level] || '保养'
    const it = (r.items || []).slice(0, 2).join(' / ')
    return it ? `${lv} · ${it}` : lv
  }
  const t = [r.tire_action, r.tire_spec || r.tire_brand, r.tire_pos].filter(Boolean).join(' · ')
  return t || '轮胎作业'
}
