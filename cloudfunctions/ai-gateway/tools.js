/**
 * 工具实现（白名单，纯查询，不写库）
 * ============================================================
 * ⚠️⚠️ 数据隔离的唯一防线在这里 ⚠️⚠️
 *   anon 库权限较宽，数据库拦不住越权查询，所以：
 *   ① 每个查询函数都必须拼租户条件，且条件来自 ctx，绝不来自模型参数
 *   ② 返回前一律过 guard.assertTenant 做二次断言
 *   ③ 拿不到租户上下文时直接报错，宁可不返回也不返回全量
 *
 * 口径来源（改这里要同步改前端）：
 *   - reports 租户键 owner_account = masterAccount || account
 *   - waybills 租户键同理
 *   - vehicle_daily_stats 用 customer_id（无 owner_account），拿不到时退化为 org 列表
 */

const { CODE, TABLE, FEE_PENDING } = require('./constants')
const { dbSelect, enc, isMissingTable } = require('./db')
const { BizError, assertTenant, assertScope } = require('./guard')

/* ============================================================
   公共
   ============================================================ */

/** 租户条件：租户为空一律拒绝，绝不退化成「查全部」 */
const requireTenant = (ctx) => {
  if (!ctx || !ctx.tenant) throw new BizError(CODE.ERR_NO_TENANT, '缺少租户上下文，无法查询')
  return ctx.tenant
}

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? 0 : Number(v))

const round = (v, d = 2) => {
  const p = Math.pow(10, d)
  return Math.round((Number(v) || 0) * p) / p
}

const isoDate = (d) => new Date(d).toISOString().slice(0, 10)

/* ============================================================
   q_energy —— 能耗与里程
   ============================================================ */
async function q_energy(args, ctx) {
  const tenant = requireTenant(ctx)

  let q =
    'select=plate,vin,stat_date,km,fuel,rate,customer_id,org,has_data' +
    `&stat_date=gte.${enc(args.from)}&stat_date=lte.${enc(args.to)}` +
    `&limit=${Math.max(args.limit * 40, 500)}`

  /* 租户条件：该表没有 owner_account，只能按 customer_id / 机构名收口
     ⚠️ customer_id 是 customers.id（UUID）；org 是 organizations.name（中文名），
        两者不是同一套值，别混用。 */
  const scope = ctx.energyScope || {}
  if (scope.customerId) {
    q += `&customer_id=eq.${enc(scope.customerId)}`
  } else if (Array.isArray(scope.orgNames) && scope.orgNames.length) {
    q += `&org=in.(${scope.orgNames.map(enc).join(',')})`
  } else {
    console.error(`[q_energy] 租户 ${tenant} 缺少 customerId / 机构名，拒绝查询`)
    throw new BizError(CODE.ERR_NO_TENANT, '当前账号未绑定客户档案，暂时无法查询能耗')
  }

  if (args.plate) q += `&plate=ilike.*${enc(args.plate)}*`

  let rows = []
  try {
    rows = await dbSelect(TABLE.DAILY_STATS, q)
  } catch (e) {
    if (isMissingTable(e)) throw new BizError(CODE.ERR_TOOL_FAIL, '能耗统计表尚未初始化')
    throw e
  }

  /* 只保留有数据的天 */
  rows = (rows || []).filter((r) => r.has_data !== false && num(r.km) > 0)

  /* 二次断言：customer_id 命中，或 org 落在本租户机构名里 */
  assertScope(rows, ctx, TABLE.DAILY_STATS)

  if (!rows.length) {
    return { ok: true, rows: [], summary: { km: 0, energy: 0, rate: null }, asOf: null, note: '该区间内没有可用数据' }
  }

  /* 聚合 */
  const keyOf = (r) => {
    if (args.groupBy === 'day') return String(r.stat_date || '').slice(0, 10)
    if (args.groupBy === 'total') return 'ALL'
    return String(r.plate || '(未知)')
  }

  const map = new Map()
  for (const r of rows) {
    const k = keyOf(r)
    const cur = map.get(k) || { key: k, km: 0, energy: 0 }
    cur.km += num(r.km)
    cur.energy += num(r.fuel)
    map.set(k, cur)
  }

  let list = [...map.values()].map((x) => ({
    key: x.key,
    km: round(x.km, 1),
    energy: round(x.energy, 1),
    rate: x.km > 0 ? round((x.energy / x.km) * 100, 2) : null,
  }))

  /* 排序 */
  const metric = args.metric === 'km' ? 'km' : args.metric === 'energy' ? 'energy' : 'rate'
  list.sort((a, b) => {
    const av = a[metric] == null ? -1 : a[metric]
    const bv = b[metric] == null ? -1 : b[metric]
    return args.orderBy === 'asc' ? av - bv : bv - av
  })
  list = list.slice(0, args.limit)

  const totalKm = round(rows.reduce((s, r) => s + num(r.km), 0), 1)
  const totalEnergy = round(rows.reduce((s, r) => s + num(r.fuel), 0), 1)

  const maxDate = rows.reduce((m, r) => (String(r.stat_date) > m ? String(r.stat_date) : m), '')

  return {
    ok: true,
    rows: list,
    summary: {
      km: totalKm,
      energy: totalEnergy,
      rate: totalKm > 0 ? round((totalEnergy / totalKm) * 100, 2) : null,
      vehicles: new Set(rows.map((r) => r.plate)).size,
    },
    asOf: maxDate,
    note: `百公里能耗 = 耗电量 ÷ 里程 × 100；数据来自每日凌晨同步，最新为 ${maxDate}`,
  }
}

/* ============================================================
   q_fee —— 费用查询
   ============================================================ */
async function q_fee(args, ctx) {
  const tenant = requireTenant(ctx)

  /* ⚠️ 按月汇总必须取全量：模型常给一个很小的 limit（比如 5），
     若按 limit*4 取数，聚合结果会缺月 —— 之前「今年每个月」只出 1 行就是这个原因。
     明细查询才需要按 limit 收。 */
  const fetchLimit = args.groupBy === 'month' ? 2000 : args.limit * 4

  let q =
    'select=id,type,amount,status,create_time,paid_at,payment,driver_name,plate,waybill_no,current_level,flow,owner_account' +
    `&owner_account=eq.${enc(tenant)}` +
    `&create_time=gte.${enc(args.from)}T00:00:00&create_time=lte.${enc(args.to)}T23:59:59` +
    `&limit=${fetchLimit}`

  /* ⭐⭐ 司机只能看自己的：reports 有 driver_phone，按手机号精确过滤。
     没有手机号就拒绝，绝不退化成「整队可见」。 */
  if (ctx.scope === 'self') {
    if (!ctx.phone) {
      throw new BizError(CODE.ERR_NO_TOOL, '账号未绑定手机号，暂时无法查询个人费用')
    }
    q += `&driver_phone=eq.${enc(ctx.phone)}`
  }

  if (args.types && args.types.length) q += `&type=in.(${args.types.map(enc).join(',')})`
  if (args.plate) q += `&plate=ilike.*${enc(args.plate)}*`
  if (args.driver) q += `&driver_name=ilike.*${enc(args.driver)}*`
  if (args.waybillNo) q += `&waybill_no=eq.${enc(args.waybillNo)}`
  if (args.status) {
    /* 「待审核」是同义展示值，实际落库为「审核中」 */
    if (FEE_PENDING.includes(args.status)) q += `&status=in.(${FEE_PENDING.map(enc).join(',')})`
    else q += `&status=eq.${enc(args.status)}`
  }

  let rows = []
  try {
    rows = await dbSelect(TABLE.REPORTS, q)
  } catch (e) {
    if (isMissingTable(e)) throw new BizError(CODE.ERR_TOOL_FAIL, '费用表尚未初始化')
    throw e
  }

  assertTenant(rows, ctx, TABLE.REPORTS)

  const amount = rows.reduce((s, r) => s + num(r.amount), 0)
  const count = rows.length

  /* 按月汇总：一次查询就能回答「每个月各花了多少」。
     ⚠️ 不加这个的话模型会把 12 个月拆成 12 次调用，既慢又会撞上次数上限。 */
  if (args.groupBy === 'month') {
    const map = new Map()
    for (const r of rows) {
      const m = String(r.create_time || '').slice(0, 7)
      if (!m) continue
      const cur = map.get(m) || { month: m, count: 0, amount: 0 }
      cur.amount += num(r.amount)
      cur.count += 1
      map.set(m, cur)
    }
    const list = [...map.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((x) => ({ month: x.month, count: x.count, amount: round(x.amount, 2) }))

    return {
      ok: true,
      groupBy: 'month',
      rows: list,
      summary: { amount: round(amount, 2), count, months: list.length },
      note: '按月汇总，含全部费用类型（支出 / 补贴 / 借款 / 违章）',
    }
  }

  /* 只把展示需要的最小字段给模型 */
  /* 回填模型只给前 20 行：卡片自己渲染完整数据，模型看多了只会撑爆上下文 */
  const brief = rows.slice(0, Math.min(args.limit, 20)).map((r) => ({
    id: r.id,
    type: r.type,
    amount: round(num(r.amount), 2),
    status: r.status,
    plate: r.plate || '',
    driverName: r.driver_name || '',
    waybillNo: r.waybill_no || '',
    createTime: r.create_time || '',
    paidAt: r.paid_at || '',
  }))

  return {
    ok: true,
    summary: { amount: round(amount, 2), count, truncated: count > args.limit },
    rows: brief,
    note: count > args.limit ? `共 ${count} 条，只返回前 ${args.limit} 条` : '',
  }
}

/* ============================================================
   q_todo —— 待我处理
   ============================================================ */

/**
 * 当前节点是不是我 —— 必须与 src/utils/feeTodo.js 的 canApproveReport 同口径：
 * ① approver_id 命中 ② role==='owner' 且主账号 ③ role==='finance' 且财务岗/主账号
 */
function canApprove(row, ctx) {
  if (String(row.status || '') !== '审核中') return false
  const flow = Array.isArray(row.flow) ? row.flow : []
  const step = flow[(Number(row.current_level) || 0) - 1]
  if (!step) return false
  if (step.approver_id && String(step.approver_id) === String(ctx.userId)) return true
  if (step.role === 'owner' && ctx.isMaster) return true
  if (step.role === 'finance' && ctx.isFinance) return true
  return false
}

async function q_todo(args, ctx) {
  const tenant = requireTenant(ctx)
  const kind = args.kind || 'fee_approval'

  if (kind === 'fee_approval' || kind === 'payout') {
    const status = kind === 'fee_approval' ? ['审核中'] : ['已通过', '待打款']
    const q =
      'select=id,type,amount,status,plate,driver_name,waybill_no,create_time,current_level,flow,owner_account' +
      `&owner_account=eq.${enc(tenant)}` +
      `&status=in.(${status.map(enc).join(',')})` +
      '&limit=200'

    let rows = []
    try {
      rows = await dbSelect(TABLE.REPORTS, q)
    } catch (e) {
      if (isMissingTable(e)) throw new BizError(CODE.ERR_TOOL_FAIL, '费用表尚未初始化')
      throw e
    }
    assertTenant(rows, ctx, TABLE.REPORTS)

    const mine = kind === 'fee_approval' ? rows.filter((r) => canApprove(r, ctx)) : rows
    const list = mine.slice(0, args.limit).map((r) => ({
      id: r.id,
      type: r.type,
      amount: round(num(r.amount), 2),
      plate: r.plate || '',
      driverName: r.driver_name || '',
      waybillNo: r.waybill_no || '',
      createTime: r.create_time || '',
    }))

    return {
      ok: true,
      rows: list,
      summary: { count: mine.length, amount: round(mine.reduce((s, r) => s + num(r.amount), 0), 2) },
      jump: { path: '/fee/list', query: { ids: list.map((x) => x.id).join(',') } },
      note: kind === 'fee_approval' ? '审批动作需在费用列表页完成，本助手不代签' : '',
    }
  }

  /* 运单类待办：交给运单列表页，这里只给数量与跳转 */
  return {
    ok: true,
    rows: [],
    summary: { count: 0 },
    jump: { path: '/waybill', query: { tab: kind } },
    note: '该类型待办请在运单列表中处理',
  }
}

/* ============================================================
   q_waybill —— 运单查询
   ============================================================ */
async function q_waybill(args, ctx) {
  const tenant = requireTenant(ctx)

  /* ⚠️ waybills 的车牌字段叫 vehicle（不是 plate），别照抄 reports 的习惯 */
  const cols = 'id,waybill_no,status,vehicle,driver,pickup,delivery,plan_time,owner_account,recurring_group_no,trip_seq,is_recurring'

  /* ⭐ 司机只能看挂在自己名下的运单。
     ⚠️ waybills 没有 driver_phone，只能按 driver 姓名匹配；
        同车队重名司机极少，但仍不如手机号精确 —— 这是该表结构的限制。 */
  let selfFilter = ''
  if (ctx.scope === 'self') {
    if (!ctx.name) throw new BizError(CODE.ERR_NO_TOOL, '账号缺少姓名，暂时无法查询个人运单')
    selfFilter = `&driver=eq.${enc(ctx.name)}`
  }

  const base =
    `select=${cols}&owner_account=eq.${enc(tenant)}${selfFilter}` +
    /* 常驻任务只留首趟，避免一个组号刷出 N 行 */
    '&or=(is_recurring.is.null,is_recurring.eq.false,trip_seq.eq.1)' +
    `&limit=${args.limit}`

  /* 时间字段名在该表上不确定 → 先带 create_time，42703 时剥掉重试 */
  const tries = [
    base + `&create_time=gte.${enc(args.from)}T00:00:00&create_time=lte.${enc(args.to)}T23:59:59`,
    base,
  ]

  let rows = null
  let lastErr = null
  for (const q of tries) {
    let qq = q
    if (args.status) qq += `&status=eq.${enc(args.status)}`
    if (args.plate) qq += `&vehicle=ilike.*${enc(args.plate)}*`
    if (args.customer) qq += `&customer=ilike.*${enc(args.customer)}*`
    /* ⚠️ 这里只能用普通条件：PostgREST 一个请求只认一个 or=(...)，
       再拼一个会跟上面「常驻只留首趟」的 or 冲突，导致过滤失效。 */
    if (args.keyword) qq += `&waybill_no=ilike.*${enc(args.keyword)}*`
    try {
      rows = await dbSelect(TABLE.WAYBILLS, qq)
      break
    } catch (e) {
      lastErr = e
      if (isMissingTable(e)) throw new BizError(CODE.ERR_TOOL_FAIL, '运单表尚未初始化')
      // 列不存在 → 换下一个尝试
    }
  }
  if (rows == null) throw lastErr || new BizError(CODE.ERR_TOOL_FAIL, '运单查询失败')

  assertTenant(rows, ctx, TABLE.WAYBILLS)

  return {
    ok: true,
    rows: rows.map((r) => ({
      waybillNo: r.waybill_no,
      status: r.status,
      plate: r.vehicle,
      driver: r.driver,
      pickup: r.pickup,
      delivery: r.delivery,
      planTime: r.plan_time,
      recurring: r.is_recurring === true,
    })),
    summary: { count: rows.length },
    note: '',
  }
}

/* ============================================================
   调度
   ============================================================ */
const IMPL = { q_energy, q_fee, q_todo, q_waybill }

async function runTool(name, args, ctx) {
  const fn = IMPL[name]
  if (!fn) throw new BizError(CODE.ERR_NO_TOOL, `未知工具 ${name}`)
  return fn(args, ctx)
}

module.exports = { runTool, canApprove }
