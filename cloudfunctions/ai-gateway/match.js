/**
 * 实体匹配 / 草稿判定 · 纯函数层
 * ============================================================
 * 这一层**不碰数据库、不读环境变量**，只做字符串与规则计算，
 * 因此可以零依赖单测（node --test）。凡是"口径"都集中在这里，
 * tools.js 只负责取数，判定一律调用本文件，避免同一规则写两遍。
 *
 * 口径来源（改这里要同步改前端）：
 *   - 运单状态 9 态：constants.WAYBILL_STATUS
 *   - 缺口分级：AI助手派单草稿_设计与实施清单 §3.3
 *   - 车牌归一化：运单页/车辆档案都按"只比字母数字"处理
 */

/* ============================================================
   一、归一化
   ============================================================ */

/** 全角 → 半角（字母数字与常见间隔符），并把中文间隔符统一成半角 */
const toHalfWidth = (s) =>
  String(s || '')
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, ' ')

/**
 * 车牌归一化：去掉一切非字母数字，字母大写。
 * 「苏A·89802」「苏a-89802 」「苏A８９８０２」→ 全部 SU A89802 → 苏A89802
 * ⚠️ 不要去掉中文省份简称，它是车牌的一部分。
 */
const normPlate = (s) =>
  toHalfWidth(s)
    .replace(/[^0-9A-Za-z\u4e00-\u9fa5]/g, '')
    .toUpperCase()

/** 人名 / 机构名 / 围栏名归一化：去空白与标点，全角转半角，小写 */
const normName = (s) =>
  toHalfWidth(s)
    .replace(/[\s~!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?，。、；：？！“”‘’（）【】《》]/g, '')
    .toLowerCase()

/** 绑定车牌串拆分：兼容逗号 / 顿号 / 分号 / 空格 */
const splitPlates = (s) =>
  String(s || '')
    .split(/[,，、;；\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)

/* ============================================================
   二、相似度（笔误判定）
   ============================================================ */

/** 编辑距离（Levenshtein），只做小字符串比较，不需要优化到滚动数组 */
function editDistance(a, b) {
  const s = String(a || '')
  const t = String(b || '')
  if (s === t) return 0
  if (!s.length) return t.length
  if (!t.length) return s.length
  const prev = new Array(t.length + 1)
  const cur = new Array(t.length + 1)
  for (let j = 0; j <= t.length; j++) prev[j] = j
  for (let i = 1; i <= s.length; i++) {
    cur[0] = i
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= t.length; j++) prev[j] = cur[j]
  }
  return prev[t.length]
}

/**
 * 是否「疑似笔误」
 * 口径：编辑距离 ≤ 2 且长度差 ≤ 1。
 * ⚠️ 长度差超过 1 一律不算笔误 —— 否则「苏A89802」会把「苏A8980219」认成笔误，
 *    宁可让用户自己判断，也不要瞎建议。
 */
function isTypoOf(a, b) {
  const s = normPlate(a)
  const t = normPlate(b)
  if (!s || !t) return { typo: false, distance: null }
  if (Math.abs(s.length - t.length) > 1) return { typo: false, distance: null }
  const d = editDistance(s, t)
  return { typo: d > 0 && d <= 2, distance: d }
}

/* ============================================================
   三、匹配打分（四档，命中即停）
   ============================================================ */

const SCORE = {
  EXACT: 100,
  NORMALIZED: 92,
  PREFIX: 78,
  CONTAINS: 66,
}

/**
 * 打分：needle 是用户原话，hay 是库里的值
 * @returns {{score:number, matchedBy:string|null}}
 */
function scoreOf(needle, hay, kind) {
  const raw = String(needle || '').trim()
  const target = String(hay || '').trim()
  if (!raw || !target) return { score: 0, matchedBy: null }

  const norm = kind === 'vehicle' ? normPlate : normName
  const n = norm(raw)
  const t = norm(target)
  if (!n || !t) return { score: 0, matchedBy: null }

  if (raw === target) return { score: SCORE.EXACT, matchedBy: `${kind}_exact` }
  if (n === t) return { score: SCORE.NORMALIZED, matchedBy: `${kind}_normalized` }
  /* 单字查询不做包含匹配：「苏」不该命中「苏A89802」 */
  if (n.length < 2) return { score: 0, matchedBy: null }
  if (t.startsWith(n)) return { score: SCORE.PREFIX, matchedBy: `${kind}_prefix` }
  if (t.includes(n)) return { score: SCORE.CONTAINS, matchedBy: `${kind}_contains` }
  return { score: 0, matchedBy: null }
}

/**
 * 从候选行里挑出命中的，按分值降序，取前 limit 条
 * @param {string} needle 用户原话
 * @param {Array<object>} rows 库里的行
 * @param {{kind:string, field:(row)=>string, limit?:number}} opt
 */
function rankCandidates(needle, rows, opt) {
  const kind = opt.kind
  const limit = opt.limit || 5
  const getField = opt.field
  const out = []
  for (const row of rows || []) {
    const val = getField(row)
    const { score, matchedBy } = scoreOf(needle, val, kind)
    if (score > 0) out.push({ row, score, matchedBy })
  }
  out.sort((a, b) => b.score - a.score)
  return out.slice(0, limit)
}

/* ============================================================
   四、缺口分级
   ============================================================ */

/** block=缺了建不了单 / confirm=有推断值待确认 / defer=建单后补 */
const FIELD_LEVEL = {
  pickup: 'block',
  delivery: 'block',
  customer: 'block',
  cargo: 'block',
  assign: 'block',
  quantity: 'confirm',
  /* 计划装货 / 计划到达：建单页可填，不挡建单（2026-11-26 拆成两个时间） */
  pickupTime: 'confirm',
  deliveryTime: 'confirm',
  route: 'defer',
  freight: 'defer',
  contact: 'defer',
}

const LEVEL_WEIGHT = { block: 3, confirm: 2, defer: 1 }

const classifyMissing = (field) => FIELD_LEVEL[field] || 'confirm'

/** 草稿状态：取最严重的一档 */
function draftStatusOf({ missing = [], conflicts = [], ambiguous = false }) {
  if (missing.some((m) => m.level === 'block')) return 'incomplete'
  if (ambiguous) return 'ambiguous'
  if (conflicts.length) return 'conflict'
  return 'ready'
}

/* ============================================================
   五、在途判定
   ============================================================ */

/** 结束后不再占用的状态（与运单 9 态口径一致） */
const ENDED_STATUS = ['已完成', '已取消', '待重新指派']

/** 这条运单是否仍占用车辆 / 司机 */
const isActiveWaybill = (status) => {
  const s = String(status || '')
  if (!s) return false
  return !ENDED_STATUS.includes(s)
}

/* ============================================================
   六、补丁白名单（redraft 用）
   ============================================================ */

/**
 * 只挑白名单里的键，其余（account / tenant / id / owner_account 等）全部丢弃。
 * ⚠️ 这是 redraft 的防篡改闸门，任何新增可改字段都必须加进 ALLOW。
 */
const PATCH_ALLOW = [
  'pickup', 'delivery', 'customerName', 'vehiclePlate', 'driverName',
  'routeName', 'cargoName', 'quantity', 'unit',
  /* 两个时间 + 运输模式都允许在卡片上改（transportMode 对应「极简/详细」切换） */
  'pickupTime', 'deliveryTime', 'transportMode',
  /* planTime 是拆分前的老键，保留兼容，服务端按「到达时间」处理 */
  'planTime',
]

function pickPatch(patch) {
  const out = {}
  if (!patch || typeof patch !== 'object') return out
  for (const k of PATCH_ALLOW) {
    if (patch[k] !== undefined) out[k] = patch[k]
  }
  return out
}

module.exports = {
  toHalfWidth,
  normPlate,
  normName,
  splitPlates,
  editDistance,
  isTypoOf,
  scoreOf,
  rankCandidates,
  SCORE,
  FIELD_LEVEL,
  LEVEL_WEIGHT,
  classifyMissing,
  draftStatusOf,
  ENDED_STATUS,
  isActiveWaybill,
  PATCH_ALLOW,
  pickPatch,
}
