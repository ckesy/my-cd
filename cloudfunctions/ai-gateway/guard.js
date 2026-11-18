/**
 * 守卫层：参数校验 / 脱敏 / 租户断言 / 配额
 * ============================================================
 * 这是"数据隔离"和"防幻觉"的落点，改动此文件等于改安全边界，务必走评审。
 *
 * 三道防线：
 *   ① validateArgs —— 模型给的参数一律不信，类型/枚举/长度/条数全校验
 *   ② assertTenant —— 查询结果逐行断言租户，防 where 条件漏拼
 *   ③ sanitize     —— 返回前端前统一脱敏
 */

const { CODE, FEE_STATUS, WAYBILL_STATUS, MONEY_TYPES, LIMITS, QUOTA, MASK, TABLE } = require('./constants')
const { dbSelect, enc } = require('./db')

class BizError extends Error {
  constructor(code, message, extra) {
    super(message || 'error')
    this.code = code || CODE.ERR_INTERNAL
    this.extra = extra || null
  }
}

/* ============================================================
   一、参数校验
   ============================================================ */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const bad = (field, why) => {
  throw new BizError(CODE.ERR_PARAM, `参数 ${field} ${why}`, { field })
}

const assertDate = (v, field, required) => {
  if (v == null || v === '') {
    if (required) bad(field, '必填')
    return null
  }
  const s = String(v).trim()
  if (!DATE_RE.test(s)) bad(field, '必须为 YYYY-MM-DD')
  const t = Date.parse(s + 'T00:00:00Z')
  if (Number.isNaN(t)) bad(field, '不是合法日期')
  return s
}

const assertEnum = (v, list, field) => {
  if (v == null || v === '') return null
  const s = String(v)
  if (!list.includes(s)) bad(field, `只能是 ${list.join(' / ')}`)
  return s
}

const assertInt = (v, min, max, field, dft) => {
  if (v == null || v === '') return dft
  const n = Number(v)
  if (!Number.isFinite(n) || Math.floor(n) !== n) bad(field, '必须是整数')
  if (n < min || n > max) bad(field, `范围 ${min}~${max}`)
  return n
}

const assertStr = (v, maxLen, field) => {
  if (v == null || v === '') return null
  const s = String(v).trim()
  if (s.length > maxLen) bad(field, `长度不能超过 ${maxLen}`)
  return s
}

/** 日期跨度检查：防止「查三年」把库拖死 */
const assertSpan = (from, to) => {
  const a = Date.parse(from + 'T00:00:00Z')
  const b = Date.parse(to + 'T00:00:00Z')
  if (b < a) bad('to', '不能早于 from')
  const days = Math.round((b - a) / 86400000) + 1
  if (days > LIMITS.DATE_SPAN_DAYS) bad('to', `跨度不能超过 ${LIMITS.DATE_SPAN_DAYS} 天`)
  return days
}

const VALIDATORS = {
  q_energy(a) {
    const from = assertDate(a.from, 'from', true)
    const to = assertDate(a.to, 'to', true)
    assertSpan(from, to)
    return {
      from, to,
      plate: assertStr(a.plate, 20, 'plate'),
      fleet: assertStr(a.fleet, 40, 'fleet'),
      groupBy: assertEnum(a.groupBy, ['vehicle', 'day', 'total'], 'groupBy') || 'vehicle',
      metric: assertEnum(a.metric, ['km', 'energy', 'rate'], 'metric') || 'rate',
      orderBy: assertEnum(a.orderBy, ['asc', 'desc'], 'orderBy') || 'desc',
      limit: assertInt(a.limit, 1, LIMITS.ENERGY_ROWS, 'limit', 10),
    }
  },
  q_fee(a) {
    const from = assertDate(a.from, 'from', true)
    const to = assertDate(a.to, 'to', true)
    assertSpan(from, to)
    let types = a.types
    if (types != null) {
      if (!Array.isArray(types)) bad('types', '必须是数组')
      types = types.map((t) => {
        if (!MONEY_TYPES.includes(String(t))) bad('types', `只能是 ${MONEY_TYPES.join(' / ')}`)
        return String(t)
      })
      if (types.length > MONEY_TYPES.length) bad('types', '元素过多')
    }
    return {
      from, to,
      types: types || null,
      plate: assertStr(a.plate, 20, 'plate'),
      driver: assertStr(a.driver, 20, 'driver'),
      waybillNo: assertStr(a.waybillNo, 40, 'waybillNo'),
      status: assertEnum(a.status, FEE_STATUS, 'status'),
      /* ⚠️ 必须与 index.js 的 TOOL_SCHEMAS.q_fee 枚举一致，也与 tools.js 的实现一致。
         这里曾是旧值 ['none','type','plate','driver','day']：schema 说有 month、
         校验层却拒绝 month，模型主动传 month 会被判参数错误。 */
      groupBy: assertEnum(a.groupBy, ['none', 'month'], 'groupBy') || 'none',
      limit: assertInt(a.limit, 1, LIMITS.FEE_ROWS, 'limit', 50),
    }
  },
  q_todo(a) {
    return {
      kind: assertEnum(a.kind, ['fee_approval', 'payout', 'waybill_assign', 'recurring_accept'], 'kind'),
      limit: assertInt(a.limit, 1, LIMITS.TODO_ROWS, 'limit', 20),
    }
  },
  q_waybill(a) {
    const from = assertDate(a.from, 'from', true)
    const to = assertDate(a.to, 'to', true)
    assertSpan(from, to)
    return {
      from, to,
      status: assertEnum(a.status, WAYBILL_STATUS, 'status'),
      plate: assertStr(a.plate, 20, 'plate'),
      customer: assertStr(a.customer, 40, 'customer'),
      keyword: assertStr(a.keyword, 40, 'keyword'),
      limit: assertInt(a.limit, 1, LIMITS.WAYBILL_ROWS, 'limit', 20),
    }
  },
}

/**
 * 校验模型给的参数
 * ⚠️ 未知字段一律丢弃（不报错），避免模型塞 owner_account 之类的越权字段
 */
function validateArgs(name, raw) {
  const v = VALIDATORS[name]
  if (!v) throw new BizError(CODE.ERR_NO_TOOL, `未知工具 ${name}`)
  return v(raw && typeof raw === 'object' ? raw : {})
}

/* ============================================================
   二、租户断言（第二道防线）
   ------------------------------------------------------------
   ⚠️ 不同表的「租户字段」语义不同，不能一律拿 ctx.tenant 去比：
     reports / waybills  → owner_account，值就是主账号（ctx.tenant）
     vehicle_daily_stats → customer_id 是 customers.id（UUID），
                           org 是 organizations.name（中文机构名），
                           两者都不等于 ctx.tenant。
   ============================================================ */
const TENANT_FIELD = {
  [TABLE.REPORTS]: 'owner_account',
  [TABLE.WAYBILLS]: 'owner_account',
}

/**
 * 断言查询结果确实落在当前租户范围内。
 * 正常情况下永远不该触发；触发了说明 where 条件漏拼（bug）或被绕过（攻击）。
 */
function assertScope(rows, ctx, table) {
  const list = rows || []

  /* 能耗表：customer_id 命中，或 org 落在本租户机构名列表里 */
  if (table === TABLE.DAILY_STATS) {
    const scope = ctx.energyScope || {}
    const cid = scope.customerId ? String(scope.customerId) : ''
    const orgSet = new Set((scope.orgNames || []).map((s) => String(s)))
    if (!cid && !orgSet.size) throw new BizError(CODE.ERR_NO_TENANT, '缺少能耗数据范围')

    for (const r of list) {
      const ok =
        (cid && r && String(r.customer_id) === cid) ||
        (orgSet.size && r && orgSet.has(String(r.org)))
      if (!ok) {
        console.error(
          `[ai-gateway] ⚠️ 能耗越权数据 customer_id=${r && r.customer_id} org=${r && r.org} expect(${cid}/${[...orgSet].join('|')})`
        )
        throw new BizError(CODE.ERR_INTERNAL, '数据隔离校验未通过', { table })
      }
    }
    return list
  }

  /* 其余表：owner_account 必须等于 ctx.tenant */
  const field = TENANT_FIELD[table] || 'owner_account'
  const expect = ctx.tenant
  if (!expect) throw new BizError(CODE.ERR_NO_TENANT, '缺少租户上下文')

  for (const r of list) {
    const got = r == null ? null : r[field]
    if (got == null) {
      console.error(`[ai-gateway] 租户断言失败：${table} 行缺少字段 ${field}`, JSON.stringify(r).slice(0, 200))
      throw new BizError(CODE.ERR_INTERNAL, '数据隔离校验未通过', { table })
    }
    if (String(got) !== String(expect)) {
      console.error(`[ai-gateway] ⚠️ 越权数据：${table} ${field}=${got} expect=${expect}`)
      throw new BizError(CODE.ERR_INTERNAL, '数据隔离校验未通过', { table })
    }
  }
  return list
}

/** 兼容旧调用名 */
const assertTenant = assertScope

/* ============================================================
   三、脱敏
   ============================================================ */

/**
 * ⚠️ 口径说明（与方案 §7.2 一致）：
 *    姓名不脱敏 —— 这是内部运营系统，调度需要知道"是哪个司机"，
 *    脱成「康师傅」反而不可用；姓名不属于高敏字段。
 *    手机号 / 身份证 / 合同正文必须脱敏。
 */
const maskPhone = (s) => (s == null ? null : String(s).replace(MASK.PHONE, '$1****$2'))
const maskIdCard = (s) => (s == null ? null : String(s).replace(MASK.ID_CARD, '$1**********$2'))
const clip = (s, n) => (s == null ? null : String(s).slice(0, n))

function sanitize(input, depth = 0) {
  if (depth > 6 || input == null) return input
  if (Array.isArray(input)) return input.map((x) => sanitize(x, depth + 1))
  if (typeof input !== 'object') {
    if (typeof input === 'string') return maskIdCard(maskPhone(input))
    return input
  }
  const out = {}
  for (const [k, v] of Object.entries(input)) {
    if (k === 'id_card' || k === 'idCard' || k === 'id_card_enc') continue   // 身份证完全不下发
    if (k === 'images' || k === 'payload' || k === 'contract_data') continue // 大字段不下发
    if (k === 'phone' || k === 'driver_phone' || k === 'contact_phone') {
      out[k] = maskPhone(v)
      continue
    }
    if (k === 'remark' || k === 'note_text') {
      out[k] = clip(v, 100)
      continue
    }
    out[k] = sanitize(v, depth + 1)
  }
  return out
}

/* ============================================================
   四、配额
   ============================================================ */
const hourAgoIso = () => new Date(Date.now() - 3600 * 1000).toISOString()
const dayStartIso = () => {
  const d = new Date(Date.now() - 24 * 3600 * 1000)
  return d.toISOString()
}

/**
 * 配额检查：用 limit=上限 的轻量查询，返回行数达到上限即视为超限，
 * 不做 count(*) 全表统计（阿里规约：禁止 count(列名) 滥用）。
 */
async function checkQuota(ctx) {
  try {
    const byAccount = await dbSelect(
      TABLE.LOGS,
      `select=id&account_id=eq.${enc(ctx.account)}&created_at=gte.${hourAgoIso()}&limit=${QUOTA.PER_ACCOUNT_HOUR}`
    )
    if ((byAccount || []).length >= QUOTA.PER_ACCOUNT_HOUR) {
      throw new BizError(CODE.ERR_QUOTA, '本小时提问次数已达上限，请稍后再试')
    }
    const byTenant = await dbSelect(
      TABLE.LOGS,
      `select=id&owner_account=eq.${enc(ctx.tenant)}&created_at=gte.${dayStartIso()}&limit=${QUOTA.PER_TENANT_DAY}`
    )
    if ((byTenant || []).length >= QUOTA.PER_TENANT_DAY) {
      throw new BizError(CODE.ERR_QUOTA, '本车队今日提问额度已用完，请联系管理员')
    }
  } catch (e) {
    // 配额表还没建 → 放行（不让基建缺失阻断功能），但要留日志
    if (e instanceof BizError) throw e
    console.warn('[ai-gateway] 配额检查跳过：', e && e.message)
  }
}

/* ============================================================
   五、evidence 硬校验（派单场景用）
   ============================================================ */
/**
 * 模型抽出的每个字段必须能追溯到原文子串，否则丢弃。
 * 这是防幻觉最硬的一道闸 —— 不依赖 prompt 自称"禁止编造"。
 */
function assertEvidence(fields, rawText) {
  const src = String(rawText || '')
  const kept = {}
  const dropped = []
  for (const [k, f] of Object.entries(fields || {})) {
    if (!f || f.value == null || f.value === '') continue
    const ev = String(f.evidence || '')
    if (!ev || !src.includes(ev)) {
      dropped.push(k)
      continue
    }
    kept[k] = { ...f, needConfirm: Number(f.conf) < 0.7 }
  }
  return { kept, dropped }
}

module.exports = {
  BizError, validateArgs, assertScope, assertTenant, sanitize, maskPhone, maskIdCard,
  checkQuota, assertEvidence, assertSpan,
}
