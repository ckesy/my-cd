/**
 * 车辆档案 · 列定义（唯一来源）
 * ============================================================
 * ⭐ 一份定义同时驱动四件事，改一处四处生效：
 *   ① Excel 导出   （按顺序写表头 + 从宽表取值）
 *   ② Excel 导入   （按 label 反查列号，**不认列位置**）
 *   ③ 页面列设置   （弹窗自动出现该列，可隐藏/调序）
 *   ④ 宽表视图     （key 必须与 v_vehicle_export 的字段名一致）
 *
 * ⭐ target 决定导入时写到哪张表：
 *   vehicle → public.vehicles（col 是真实列名）
 *   cert    → public.vehicle_certs（cert 指定证件类型，col 是真实列名）
 *
 * ⚠️ 改这里的 label 会让老 Excel 导不进来（老文件里是旧表头），
 *    label 只许加、不许改。
 */

/** 证件类型（顺序即台账/Tab 顺序） */
export const CERT_TYPES = [
  { key: 'driving',          name: '行驶证', short: '行驶证', color: '#2563EB', bg: '#EFF4FF' },
  { key: 'transport',        name: '营运证', short: '营运证', color: '#0E9F6E', bg: '#ECFDF5' },
  { key: 'jq_insurance',     name: '交强险', short: '交强险', color: '#D97706', bg: '#FFF7ED' },
  { key: 'sy_insurance',     name: '商业险', short: '商业险', color: '#C8102E', bg: '#FDF2F4' },
  { key: 'excess_insurance', name: '超赔险', short: '超赔险', color: '#7C3AED', bg: '#F5F3FF' },
  { key: 'maintain',         name: '保养',   short: '保养',   color: '#475569', bg: '#F1F5F9' },
]

export const CERT_NAME = CERT_TYPES.reduce((m, x) => (m[x.key] = x.name, m), {})
export const CERT_META = CERT_TYPES.reduce((m, x) => (m[x.key] = x, m), {})

/** 提醒节点可选值（天） */
export const REMIND_DAYS_OPTIONS = [90, 30, 15, 7, 3]
/** 默认只勾 30 —— 2026-10-24 用户拍板 */
export const REMIND_DAYS_DEFAULT = [30]
/** 临近阈值：剩余 ≤3 天且未过期（每天提醒） */
export const NEAR_DAYS = 3

/** 分组（导出表头第 1 行 + 列设置分组 + 台账配色） */
export const COLUMN_GROUPS = [
  { key: 'base',      name: '车辆信息', colspan: 17, bg: 'FFEEF2F7', font: 'FF334155' },
  { key: 'driving',   name: '行驶证',   colspan: 2,  bg: 'FFEFF4FF', font: 'FF1D4ED8' },
  { key: 'transport', name: '营运证',   colspan: 3,  bg: 'FFECFDF5', font: 'FF047857' },
  { key: 'jq',        name: '交强险',   colspan: 3,  bg: 'FFFFF7ED', font: 'FFB45309' },
  { key: 'sy',        name: '商业险',   colspan: 3,  bg: 'FFFDF2F4', font: 'FF9F1239' },
  { key: 'excess',    name: '超赔险',   colspan: 3,  bg: 'FFF5F3FF', font: 'FF5B21B6' },
  { key: 'maintain',  name: '保养',     colspan: 3,  bg: 'FFF1F5F9', font: 'FF334155' },
  { key: 'remind',    name: '提醒设置（留空 = 30 天）', colspan: 6, bg: 'FFFEF9C3', font: 'FF854D0E' },
]

/** 可选值（导入校验 + 页面下拉共用） */
export const ENUM_OPTIONS = {
  fuel_type: ['燃油车', '燃气车', '纯电动', '氢燃料'],
  biz_status: ['营运', '停运', '报废'],
  sub_vehicle: ['是', '否'],
}

/**
 * 40 列定义
 * type: text | date | number | days | enum
 * req : true 时导入必填
 * isNew: 本次新增字段（导出表头标蓝，页面提示）
 */
export const VEHICLE_COLUMNS = [
  // ---------- 车辆信息（17） ----------
  { key: 'plate',               label: '车牌号',       group: 'base', type: 'text',   req: true,  target: 'vehicle', col: 'plate', width: 108 },
  { key: 'vin',                 label: '车架号(VIN)',  group: 'base', type: 'text',   req: 'new', target: 'vehicle', col: 'vin', width: 168 },
  { key: 'nickname',            label: '车辆昵称',     group: 'base', type: 'text',   target: 'vehicle', col: 'nickname', width: 100 },
  { key: 'org',                 label: '所属机构组织', group: 'base', type: 'text',   target: 'vehicle', col: 'org', width: 116 },
  { key: 'driver',              label: '绑定司机',     group: 'base', type: 'text',   target: 'vehicle', col: 'driver', width: 104 },
  { key: 'fuel_type',           label: '燃料类型',     group: 'base', type: 'enum',   target: 'vehicle', col: 'fuel_type', enumKey: 'fuel_type', width: 92 },
  { key: 'vehicle_type',        label: '车辆类型',     group: 'base', type: 'text',   target: 'vehicle', col: 'vehicle_type', width: 96 },
  { key: 'usage',               label: '车辆用途',     group: 'base', type: 'text',   target: 'vehicle', col: 'usage', width: 96 },
  { key: 'sub_vehicle',         label: '子母车',       group: 'base', type: 'enum',   target: 'vehicle', col: 'sub_vehicle', enumKey: 'sub_vehicle', width: 80 },
  { key: 'trailer',             label: '关联挂车',     group: 'base', type: 'text',   target: 'vehicle', col: 'trailer', width: 104 },
  { key: 'engine_no',           label: '发动机号',     group: 'base', type: 'text',   target: 'vehicle', col: 'engine_no', isNew: true, width: 108 },
  { key: 'first_register_date', label: '初次登记日期', group: 'base', type: 'date',   target: 'vehicle', col: 'first_register_date', isNew: true, width: 118 },
  { key: 'owner_name',          label: '车主姓名',     group: 'base', type: 'text',   target: 'vehicle', col: 'owner_name', isNew: true, width: 96 },
  { key: 'biz_status',          label: '车辆状态',     group: 'base', type: 'enum',   target: 'vehicle', col: 'biz_status', enumKey: 'biz_status', isNew: true, width: 92 },
  { key: 'purchase_date',       label: '车辆购买日',   group: 'base', type: 'date',   target: 'vehicle', col: 'purchase_date', width: 108 },
  { key: 'insurance_date',      label: '保险购买日',   group: 'base', type: 'date',   target: 'vehicle', col: 'insurance_date', width: 108 },
  { key: 'remark',              label: '备注',         group: 'base', type: 'text',   target: 'vehicle', col: 'remark', width: 100 },

  // ---------- 行驶证（2） ----------
  { key: 'driving_no',     label: '行驶证号',       group: 'driving', type: 'text', target: 'cert', cert: 'driving', col: 'cert_no', isNew: true, width: 118 },
  { key: 'driving_expire', label: '行驶证有效期至', group: 'driving', type: 'date', target: 'cert', cert: 'driving', col: 'expire_date', isNew: true, width: 126 },

  // ---------- 营运证（3） ----------
  { key: 'transport_no',     label: '营运证号',       group: 'transport', type: 'text', target: 'cert', cert: 'transport', col: 'cert_no', isNew: true, width: 128 },
  { key: 'transport_start',  label: '营运证起期',     group: 'transport', type: 'date', target: 'cert', cert: 'transport', col: 'start_date', isNew: true, width: 110 },
  { key: 'transport_expire', label: '营运证有效期至', group: 'transport', type: 'date', target: 'cert', cert: 'transport', col: 'expire_date', isNew: true, width: 126 },

  // ---------- 交强险（3） ----------
  { key: 'jq_no',    label: '交强险保单号', group: 'jq', type: 'text', target: 'cert', cert: 'jq_insurance', col: 'cert_no', isNew: true, width: 136 },
  { key: 'jq_start', label: '交强险起期',   group: 'jq', type: 'date', target: 'cert', cert: 'jq_insurance', col: 'start_date', isNew: true, width: 110 },
  { key: 'jq_end',   label: '交强险止期',   group: 'jq', type: 'date', target: 'cert', cert: 'jq_insurance', col: 'expire_date', isNew: true, width: 110 },

  // ---------- 商业险（3） ----------
  { key: 'sy_no',    label: '商业险保单号', group: 'sy', type: 'text', target: 'cert', cert: 'sy_insurance', col: 'cert_no', isNew: true, width: 136 },
  { key: 'sy_start', label: '商业险起期',   group: 'sy', type: 'date', target: 'cert', cert: 'sy_insurance', col: 'start_date', isNew: true, width: 110 },
  { key: 'sy_end',   label: '商业险止期',   group: 'sy', type: 'date', target: 'cert', cert: 'sy_insurance', col: 'expire_date', isNew: true, width: 110 },

  // ---------- 超赔险（3） ----------
  { key: 'excess_no',    label: '超赔险保单号', group: 'excess', type: 'text', target: 'cert', cert: 'excess_insurance', col: 'cert_no', isNew: true, width: 136 },
  { key: 'excess_start', label: '超赔险起期',   group: 'excess', type: 'date', target: 'cert', cert: 'excess_insurance', col: 'start_date', isNew: true, width: 110 },
  { key: 'excess_end',   label: '超赔险止期',   group: 'excess', type: 'date', target: 'cert', cert: 'excess_insurance', col: 'expire_date', isNew: true, width: 110 },

  // ---------- 保养（3）⚠️ 只按里程提醒，不做日期型 ----------
  { key: 'maintain_date',     label: '最近保养日期', group: 'maintain', type: 'date',   target: 'cert', cert: 'maintain', col: 'start_date', isNew: true, width: 118 },
  { key: 'maintain_km',       label: '最近保养里程', group: 'maintain', type: 'number', target: 'cert', cert: 'maintain', col: 'last_maintain_km', isNew: true, width: 118 },
  { key: 'maintain_interval', label: '保养间隔里程', group: 'maintain', type: 'number', target: 'cert', cert: 'maintain', col: 'maintain_interval_km', isNew: true, width: 118 },

  // ---------- 提醒设置（6）· 一律放最后，和预览稿一致 ----------
  { key: 'driving_remind',  label: '行驶证提醒',  group: 'remind', type: 'days', target: 'cert', cert: 'driving', col: 'remind_days', isNew: true, width: 108, unit: 'day' },
  { key: 'transport_remind', label: '营运证提醒', group: 'remind', type: 'days', target: 'cert', cert: 'transport', col: 'remind_days', isNew: true, width: 108, unit: 'day' },
  { key: 'jq_remind',       label: '交强险提醒',  group: 'remind', type: 'days', target: 'cert', cert: 'jq_insurance', col: 'remind_days', isNew: true, width: 108, unit: 'day' },
  { key: 'sy_remind',       label: '商业险提醒',  group: 'remind', type: 'days', target: 'cert', cert: 'sy_insurance', col: 'remind_days', isNew: true, width: 108, unit: 'day' },
  { key: 'excess_remind',   label: '超赔险提醒',  group: 'remind', type: 'days', target: 'cert', cert: 'excess_insurance', col: 'remind_days', isNew: true, width: 108, unit: 'day' },
  { key: 'maintain_remind', label: '保养提醒(km)', group: 'remind', type: 'days', target: 'cert', cert: 'maintain', col: 'remind_days', isNew: true, width: 122, unit: 'km' },
]

/** label → 列定义（导入按表头名反查） */
export const COLUMN_BY_LABEL = VEHICLE_COLUMNS.reduce((m, c) => (m[c.label] = c, m), {})
/** key → 列定义 */
export const COLUMN_BY_KEY = VEHICLE_COLUMNS.reduce((m, c) => (m[c.key] = c, m), {})

/** 车辆本体字段（导出时从宽表行取值 / 导入时写 vehicles） */
export const VEHICLE_FIELD_KEYS = VEHICLE_COLUMNS.filter(c => c.target === 'vehicle').map(c => c.col)

/** 每个证件的字段清单（页面表单 + 导入拆行用） */
export const CERT_FIELDS = VEHICLE_COLUMNS
  .filter(c => c.target === 'cert')
  .reduce((m, c) => {
    (m[c.cert] = m[c.cert] || []).push(c)
    return m
  }, {})

/** 导出表头（一维，按定义顺序） */
export const EXPORT_HEADERS = VEHICLE_COLUMNS.map(c => c.label)
