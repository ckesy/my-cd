/**
 * 单位体系（唯一来源）
 *
 * 分两层：
 *   1. 货物单位 UNIT_GROUPS —— 只放「数量」用的单位（重量 / 体积 / 包装 / 大件）
 *   2. 计价单位 PRICE_UNITS —— 计费规则的单价口径（元/km、元/吨、元/趟…）
 *
 * ⚠️ 里程/时间（公里/小时/天）属于计价维度，故意不放进货物单位，
 *    否则建运单时可能把「数量单位」选成「小时」。
 */

/* ============================================================
   一、货物单位
   ============================================================ */
export const UNIT_GROUPS = [
  {
    key: 'weight',
    label: '重量单位',
    options: [
      { value: '吨', label: '吨 (t)', symbol: 't' },
      { value: '千克', label: '千克 (kg)', symbol: 'kg' },
      { value: '公斤', label: '公斤 (kg)', symbol: 'kg' },
      { value: '克', label: '克 (g)', symbol: 'g' },
      { value: '磅', label: '磅 (lb)', symbol: 'lb' },
    ],
  },
  {
    key: 'volume',
    label: '体积单位',
    options: [
      { value: '立方米', label: '立方米 (m³/CBM)', symbol: 'm³' },
      { value: '立方厘米', label: '立方厘米 (cm³)', symbol: 'cm³' },
      { value: '立方英尺', label: '立方英尺 (ft³)', symbol: 'ft³' },
      { value: '升', label: '升 (L)', symbol: 'L' },
    ],
  },
  {
    key: 'pack',
    label: '包装与件数',
    options: [
      { value: '件', label: '件', symbol: '件' },
      { value: '箱', label: '箱', symbol: '箱' },
      { value: '纸箱', label: '纸箱', symbol: '纸箱' },
      { value: '木箱', label: '木箱', symbol: '木箱' },
      { value: '托盘', label: '托盘 (板)', symbol: '托' },
      { value: '桶', label: '桶', symbol: '桶' },
      { value: '铁桶', label: '铁桶', symbol: '铁桶' },
      { value: '袋', label: '袋', symbol: '袋' },
      { value: '包', label: '包', symbol: '包' },
      { value: '捆', label: '捆', symbol: '捆' },
      { value: '卷', label: '卷', symbol: '卷' },
    ],
  },
  {
    key: 'large',
    label: '大件与集装箱',
    options: [
      { value: '台', label: '台 (设备)', symbol: '台' },
      { value: '辆', label: '辆 (车辆)', symbol: '辆' },
      { value: '车', label: '车 (整车)', symbol: '车' },
      { value: '套', label: '套', symbol: '套' },
      { value: 'TEU', label: 'TEU (20尺标准箱)', symbol: 'TEU' },
      { value: '自然箱', label: '自然箱 (个)', symbol: '箱' },
    ],
  },
]

/** 下拉顶部「常用」置顶组 */
export const COMMON_UNITS = ['吨', '件', '立方米', '箱']

/** 默认单位（新建货物 / 新建货物行） */
export const DEFAULT_UNIT = '吨'

/** 所有货物单位（扁平） */
export const UNIT_OPTIONS = UNIT_GROUPS.flatMap(g =>
  g.options.map(o => ({ ...o, group: g.label, groupKey: g.key }))
)

export const UNIT_MAP = UNIT_OPTIONS.reduce((m, u) => { m[u.value] = u; return m }, {})

/** 历史值 / 手输别名 → 标准值 */
const UNIT_ALIASES = {
  方: '立方米',
  立方: '立方米',
  m3: '立方米',
  'm³': '立方米',
  cbm: '立方米',
  CBM: '立方米',
  托: '托盘',
  板: '托盘',
  托盘板: '托盘',
  t: '吨',
  T: '吨',
  kg: '千克',
  KG: '千克',
  Kg: '千克',
  g: '克',
  G: '克',
  lb: '磅',
  个: '件',
  只: '件',
  支: '件',
  pcs: '件',
  台套: '套',
  箱装: '箱',
}

/** 统一成标准值（未知值原样返回，视为自定义单位） */
export const normalizeUnit = (val) => {
  const v = String(val ?? '').trim()
  if (!v) return ''
  if (UNIT_MAP[v]) return v
  const alias = UNIT_ALIASES[v]
  if (alias) return alias
  const lower = v.toLowerCase()
  const hit = Object.keys(UNIT_ALIASES).find(k => k.toLowerCase() === lower)
  return hit ? UNIT_ALIASES[hit] : v
}

/** 列表 / 详情里展示的中文值 */
export const unitText = (val) => {
  const v = normalizeUnit(val)
  return v || '--'
}

/** 符号（自定义单位没有符号，返回空） */
export const unitSymbol = (val) => UNIT_MAP[normalizeUnit(val)]?.symbol || ''

/** 展示用符号：只在是拉丁符号（t / kg / m³ / TEU）时返回，避免出现「件 件」 */
export const unitSymbolDisplay = (val) => {
  const sym = unitSymbol(val)
  if (!sym) return ''
  return /[\u4e00-\u9fa5]/.test(sym) ? '' : sym
}

/** 完整写法：吨 (t)；自定义单位原样返回 */
export const unitFull = (val) => {
  const v = normalizeUnit(val)
  if (!v) return '--'
  return UNIT_MAP[v]?.label || v
}

/** 所属分组名（自定义返回「自定义」） */
export const unitGroupLabel = (val) => UNIT_MAP[normalizeUnit(val)]?.group || '自定义'

/** 是否字典内的标准单位 */
export const isKnownUnit = (val) => !!UNIT_MAP[normalizeUnit(val)]

/** 搜索用：值 / 符号 / 分组都能命中 */
export const unitMatches = (val, keyword) => {
  const kw = String(keyword || '').trim().toLowerCase()
  if (!kw) return true
  const v = normalizeUnit(val)
  const item = UNIT_MAP[v]
  const hay = [v, item?.symbol, item?.group, item?.label].filter(Boolean).join(' ').toLowerCase()
  return hay.includes(kw)
}

/* ============================================================
   二、计价单位（计费规则用）
   basis：
     distance → 运费 = 里程(km) × 单价
     quantity → 运费 = 数量 × 单价
     fixed    → 运费 = 单价（整趟包干）
     manual   → 不自动算，只带出单价（按实际用时/天数人工结算）
   ============================================================ */
export const PRICE_UNITS = [
  { value: '元/km', label: '元/km（按公里）', basis: 'distance', hint: '里程 × 单价' },
  { value: '元/吨', label: '元/吨（按重量）', basis: 'quantity', hint: '数量 × 单价' },
  { value: '元/件', label: '元/件（按件数）', basis: 'quantity', hint: '数量 × 单价' },
  { value: '元/箱', label: '元/箱（按箱数）', basis: 'quantity', hint: '数量 × 单价' },
  { value: '元/车', label: '元/车（按车数）', basis: 'quantity', hint: '数量 × 单价' },
  { value: '元/趟', label: '元/趟（整趟包干）', basis: 'fixed', hint: '直接取单价' },
  { value: '元/小时', label: '元/小时（按用时）', basis: 'manual', hint: '运费手填' },
  { value: '元/天', label: '元/天（按天数）', basis: 'manual', hint: '运费手填' },
]

export const DEFAULT_PRICE_UNIT = '元/km'

export const PRICE_UNIT_MAP = PRICE_UNITS.reduce((m, p) => { m[p.value] = p; return m }, {})

export const priceBasisOf = (unit) => PRICE_UNIT_MAP[unit]?.basis || 'manual'

/** 计价单位短名（去掉括号说明） */
export const priceUnitShort = (unit) => String(unit || DEFAULT_PRICE_UNIT).split('（')[0]

/** 按计价方式算运费；算不出来返回 null（交给用户手填） */
export const calcFreight = ({ priceUnit, price, quantity, distance }) => {
  const p = Number(price)
  if (!p || p <= 0) return null
  switch (priceBasisOf(priceUnit)) {
    case 'quantity': {
      const q = Number(quantity)
      if (!q || q <= 0) return null
      return Number((q * p).toFixed(2))
    }
    case 'distance': {
      const d = Number(distance)
      if (!d || d <= 0) return null
      return Number((d * p).toFixed(2))
    }
    case 'fixed':
      return Number(p.toFixed(2))
    default:
      return null
  }
}

/** 计费公式说明，给界面做提示用 */
export const freightFormula = (priceUnit) => {
  const basis = priceBasisOf(priceUnit)
  if (basis === 'distance') return '里程 × 单价'
  if (basis === 'quantity') return '数量 × 单价'
  if (basis === 'fixed') return '直接取单价'
  return '需人工填写'
}
