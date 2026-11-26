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

const { CODE, TABLE, FEE_PENDING, LIMITS, permHit } = require('./constants')
const { dbSelect, dbInsert, dbPatch, enc, isMissingTable } = require('./db')
const { BizError, assertTenant, assertScope, maskPhone } = require('./guard')
const {
  splitPlates, normPlate, normName, rankCandidates, isTypoOf,
  classifyMissing, draftStatusOf, isActiveWaybill, SCORE,
} = require('./match')

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

/**
 * 子账号的机构隔离条件（车辆 / 司机档案共用）
 * ------------------------------------------------------------
 * 口径来自 Web 档案页（DriverArchive.vue `needOrgFilter`）：
 *   只有「客户 + 子账号 + 机构层级 ≥ 2」才按机构收窄，其余看本客户全部。
 *
 * ⚠️⚠️ 不能只按 org_id 过滤（踩过，2026-11-26）：
 *   vehicles.org_id 有值，但 drivers.org_id 大量为 NULL（历史数据只写了 org 名，
 *   如「管理员名下车辆」）。`org_id=eq.4` 会把 org_id 为空的司机全部滤掉，
 *   于是用户明明有「李亚楠」这条司机档案，助手却答「档案里没有这个司机」。
 *   所以这里用「org_id 命中 或 机构名命中」的 OR 条件。
 */
const orgFilterOf = (ctx) => {
  if (!ctx || !ctx.orgId) return ''
  if (Number(ctx.orgLevel || 0) < 2) return ''
  const parts = [`org_id.eq.${String(ctx.orgId)}`]
  if (ctx.orgName) parts.push(`org.eq."${String(ctx.orgName).replace(/"/g, '')}"`)
  return `&or=(${parts.join(',')})`
}

/**
 * 时间戳 → 北京时间字符串 'YYYY-MM-DD HH:mm:ss'
 *
 * ⚠️ 云函数容器是 UTC，直接 `new Date(ts).toISOString()` 组装出来的是 UTC 时间，
 *    建单页的日期控件按浏览器本地时区再解析一次，就会出现「说 8 点显示 0 点」。
 *    业务只在国内跑，固定 +08:00，不依赖容器时区。
 */
const BJ_OFFSET_MS = 8 * 3600 * 1000
const toBeijingString = (ts) => {
  const d = new Date(Number(ts) + BJ_OFFSET_MS)
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

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
    groupBy: args.groupBy || 'vehicle',
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

/**
 * 当前账号能不能做付款登记 —— 与 src/utils/feeTodo.js 的 isPayer 同口径：
 * 财务岗或主账号，且确实有 fee_payout 权限（有人被收了这个权限就不能看金额）。
 * ⚠️ 没有这道判定时，任何有 fee_list 的人都会看到全队的「已通过/待打款」，
 *    等于把付款清单暴露给不该看的人。
 */
function canPayout(ctx) {
  if (!ctx) return false
  const isPayer = ctx.isFinance || ctx.isMaster
  if (!isPayer) return false
  /* 权限判定统一走 permHit（含老 key 别名），别在这里写 includes 字面比较 */
  return permHit(ctx.perms, 'fee_payout')
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

    /* 待审批：只有当前节点是我才列。
       待付款：只有付款人（财务岗/主账号且有 fee_payout）才列 —— 见 canPayout 注释。 */
    let mine
    let note
    if (kind === 'fee_approval') {
      mine = rows.filter((r) => canApprove(r, ctx))
      note = '审批动作需在费用列表页完成，本助手不代签'
    } else if (canPayout(ctx)) {
      mine = rows
      note = '打款动作需在付款登记页完成，本助手不代付'
    } else {
      mine = []
      note = '当前账号不是付款人，付款登记由主账号或财务岗操作'
    }

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
      note,
    }
  }

  /* ============================================================
     运单类待办（2026-11-26 补）
     ------------------------------------------------------------
     以前这里是空壳：恒返回 count 0，用户问「哪些单还没派车」只能得到「没有」。
     两类口径分开（不能混，否则调度不知道该派车还是催司机）：
       waybill_assign  → 需要**调度动手派车**的：待重新指派（司机拒单）+ 待接单但没车/没司机
       recurring_accept→ 已派给司机、**等司机点「接一趟」**的常驻趟次
     ⚠️ waybills 没有 updated_at，排序只能用 create_time（凭记忆加列 → 整页 42703）。
     ============================================================ */
  if (kind !== 'waybill_assign' && kind !== 'recurring_accept') {
    throw new BizError(CODE.ERR_PARAM, `不支持的待办类型：${kind}`)
  }
  if (!permHit(ctx.perms, 'waybill')) {
    throw new BizError(CODE.ERR_NO_TOOL, '当前账号没有运单权限，看不到这类待办')
  }

  /* ⚠️ owner_account 必须出现在 select 里：assertTenant 要对每行做租户二次断言，
     不带这列会直接判「数据隔离校验未通过」（2026-11-26 踩过）。 */
  const cols =
    'id,waybill_no,status,vehicle,driver,pickup,delivery,plan_time,create_time,' +
    'recurring_group_no,trip_seq,is_recurring,owner_account'
  let rows = []
  try {
    rows = await dbSelect(TABLE.WAYBILLS, `select=${cols}&owner_account=eq.${enc(tenant)}&limit=200`)
  } catch (e) {
    if (isMissingTable(e)) throw new BizError(CODE.ERR_TOOL_FAIL, '运单表尚未初始化')
    throw e
  }
  assertTenant(rows, ctx, TABLE.WAYBILLS)

  /** 车牌是不是「真的派了车」—— 多指派时 vehicle 会退化成「多种 / N辆 / --」 */
  const assigned = (v) => {
    const t = String(v || '').trim()
    return !!t && !['--', '—', '多种'].includes(t) && !/^\d+\s*辆$/.test(t)
  }
  const briefWaybill = (r) => ({
    kind: 'waybill',
    id: r.id,
    waybillNo: String(r.waybill_no || ''),
    status: String(r.status || ''),
    plate: String(r.vehicle || ''),
    driverName: String(r.driver || ''),
    pickup: String(r.pickup || ''),
    delivery: String(r.delivery || ''),
    time: r.plan_time || r.create_time || '',
    tripSeq: Number(r.trip_seq) || 1,
    groupNo: String(r.recurring_group_no || ''),
  })

  if (kind === 'waybill_assign') {
    /* 待重新指派：司机拒单，必须换人 → 全部列
       待接单但没派车/没司机：刚建完单没派，调度的活
       待接单且已有车：在等司机接单，不是调度的待办 → 排除 */
    const mine = rows.filter(
      (r) => String(r.status) === '待重新指派' ||
        (String(r.status) === '待接单' && !assigned(r.vehicle))
    )
    const list = mine.slice(0, args.limit).map(briefWaybill)
    return {
      ok: true,
      kind,
      rows: list,
      summary: { count: mine.length },
      jump: { path: '/waybill', query: { status: '待重新指派' } },
      note: mine.length
        ? '待重新指派的单要换车换人；待接单但没车的单要先派车。都在运单列表里操作'
        : '',
    }
  }

  /* 待接单的常驻趟次：按组聚合，一组一行（常驻一单一行，口径同 Web） */
  const waiting = rows.filter(
    (r) => r.is_recurring === true && String(r.status) === '待接单'
  )
  const groups = new Map()
  for (const r of waiting) {
    const key = String(r.recurring_group_no || r.waybill_no || r.id)
    const g = groups.get(key) || { ...briefWaybill(r), trips: 0 }
    g.trips += 1
    /* 主趟信息优先取 trip_seq=1 的那条 */
    if (Number(r.trip_seq) === 1) Object.assign(g, briefWaybill(r), { trips: g.trips })
    groups.set(key, g)
  }
  const list = [...groups.values()].slice(0, args.limit)
  return {
    ok: true,
    kind,
    rows: list,
    summary: { count: list.length, trips: waiting.length },
    jump: { path: '/waybill', query: { status: '待接单', tab: 'recurring' } },
    note: waiting.length ? '这些趟次已经派给司机，等司机在小程序点「接一趟」' : '',
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
   q_vehicle —— 车辆档案
   ------------------------------------------------------------
   口径（与 vehicle-list 云函数完全一致，别另造一套）：
     司机      ：drivers.phone = 本人手机号 → bound_vehicle（逗号/顿号/分号分隔）
                 → vehicles plate in (...)            ← 白名单即隔离，最强
     管理员/员工：customers.phone = 主账号 → customer_id=eq.
                 子账号（users.org_id 非空）再加「org_id 或机构名」收口（见 orgFilterOf）
   ⚠️ vehicles 表**没有** owner_account，不能用租户键直接过滤。
   ============================================================ */
/**
 * 车牌拆分已移到 match.js（纯函数，可单测）。
 * q_vehicle / q_driver 仍按「drivers.bound_vehicle」白名单收口。
 */
async function selfPlates(ctx) {
  const phone = ctx.phone || ctx.account
  const rows = await dbSelect(
    TABLE.DRIVERS,
    `select=driver_name,bound_vehicle&phone=eq.${enc(phone)}&limit=1`
  )
  const d = rows[0]
  if (!d) return { plates: [], driverName: '' }
  return { plates: splitPlates(d.bound_vehicle), driverName: String(d.driver_name || '') }
}

async function q_vehicle(args, ctx) {
  requireTenant(ctx)
  const cols = 'plate,vin,org,driver,fuel_type,customer_id'

  /* ① 司机：只看自己绑的车 */
  if (ctx.scope === 'self') {
    const { plates, driverName } = await selfPlates(ctx)
    if (!plates.length) {
      return {
        ok: true, mine: true, rows: [],
        summary: { count: 0 }, driver: driverName,
        note: '你的账号还没有绑定车辆，请联系调度在司机档案里绑定车牌',
      }
    }
    const q =
      `select=${cols}&plate=in.(${plates.map((p) => `"${p.replace(/"/g, '')}"`).join(',')})` +
      `&limit=${args.limit}`
    const rows = (await dbSelect(TABLE.VEHICLES, q).catch((e) => {
      if (isMissingTable(e)) throw new BizError(CODE.ERR_TOOL_FAIL, '车辆档案表尚未初始化')
      throw e
    })) || []
    /* 白名单二次过滤：即使库里有同名车牌也只认 drivers 里登记过的 */
    const set = new Set(plates)
    const mine = rows.filter((r) => set.has(String(r.plate || '')))
    return {
      ok: true, mine: true, driver: driverName,
      rows: mine.map(briefVehicle),
      summary: { count: mine.length },
      note: mine.length < plates.length ? `档案里只找到 ${mine.length} / ${plates.length} 台，其余车牌可能未建档` : '',
    }
  }

  /* ② 管理员 / 员工：客户（+ 机构）收口 */
  const scope = ctx.energyScope || {}
  let q = `select=${cols}&limit=${Math.max(args.limit, 50)}`
  if (scope.customerId) q += `&customer_id=eq.${enc(scope.customerId)}`
  else if (Array.isArray(scope.orgNames) && scope.orgNames.length) {
    q += `&org=in.(${scope.orgNames.map((n) => `"${String(n).replace(/"/g, '')}"`).join(',')})`
  } else {
    throw new BizError(CODE.ERR_NO_TENANT, '当前账号未绑定客户档案，暂时无法查询车辆')
  }
  /* 子账号只看本机构，主账号（org_id 空）看全部 —— 见 orgFilterOf 的 OR 口径 */
  q += orgFilterOf(ctx)
  if (args.keyword) q += `&plate=ilike.*${enc(args.keyword)}*`
  if (args.org) q += `&org=ilike.*${enc(args.org)}*`
  q += '&order=updated_at.desc'

  const rows = (await dbSelect(TABLE.VEHICLES, q).catch((e) => {
    if (isMissingTable(e)) throw new BizError(CODE.ERR_TOOL_FAIL, '车辆档案表尚未初始化')
    throw e
  })) || []

  const safe = assertScope(rows, ctx, TABLE.VEHICLES)
  const list = safe.slice(0, args.limit).map(briefVehicle)

  return {
    ok: true, mine: false,
    rows: list,
    summary: { count: safe.length, truncated: safe.length > args.limit },
    note: safe.length > args.limit ? `共 ${safe.length} 台，只列前 ${args.limit} 台` : '',
  }
}

const briefVehicle = (r) => ({
  plate: r.plate || '',
  driver: r.driver || '',
  org: r.org || '',
  fuel: r.fuel_type || '',
})

/* ============================================================
   q_driver —— 司机档案
   ------------------------------------------------------------
   司机本人只返回自己那一行；管理员按 customer_id / 机构收口。
   `plate` 参数用于反向查「这辆车现在归谁开」。
   ============================================================ */
async function q_driver(args, ctx) {
  requireTenant(ctx)
  const cols = 'driver_name,phone,org,bound_vehicle,customer_id'

  if (ctx.scope === 'self') {
    const phone = ctx.phone || ctx.account
    const rows = await dbSelect(TABLE.DRIVERS, `select=${cols}&phone=eq.${enc(phone)}&limit=1`)
    const d = rows[0]
    if (!d) return { ok: true, rows: [], summary: { count: 0 }, note: '司机档案里没有你的手机号记录' }
    return {
      ok: true,
      rows: [{ name: d.driver_name || '', plate: splitPlates(d.bound_vehicle).join('、'), org: d.org || '', phone: maskPhone(d.phone) }],
      summary: { count: 1 },
      note: '',
    }
  }

  const scope = ctx.energyScope || {}
  let q = `select=${cols}&limit=${Math.max(args.limit, 50)}`
  if (scope.customerId) q += `&customer_id=eq.${enc(scope.customerId)}`
  else if (Array.isArray(scope.orgNames) && scope.orgNames.length) {
    q += `&org=in.(${scope.orgNames.map((n) => `"${String(n).replace(/"/g, '')}"`).join(',')})`
  } else {
    throw new BizError(CODE.ERR_NO_TENANT, '当前账号未绑定客户档案，暂时无法查询司机')
  }
  q += orgFilterOf(ctx)
  if (args.keyword) q += `&driver_name=ilike.*${enc(args.keyword)}*`
  if (args.org) q += `&org=ilike.*${enc(args.org)}*`
  if (args.plate) q += `&bound_vehicle=ilike.*${enc(args.plate)}*`
  q += '&order=updated_at.desc'

  const rows = (await dbSelect(TABLE.DRIVERS, q).catch((e) => {
    if (isMissingTable(e)) throw new BizError(CODE.ERR_TOOL_FAIL, '司机档案表尚未初始化')
    throw e
  })) || []

  const safe = assertScope(rows, ctx, TABLE.DRIVERS)
  const list = safe.slice(0, args.limit).map((d) => ({
    name: d.driver_name || '',
    plate: splitPlates(d.bound_vehicle).join('、'),
    org: d.org || '',
    phone: maskPhone(d.phone),
  }))

  return {
    ok: true,
    rows: list,
    summary: { count: safe.length, truncated: safe.length > args.limit },
    note: safe.length > args.limit ? `共 ${safe.length} 名，只列前 ${args.limit} 名` : '',
  }
}

/* ============================================================
   实体对齐 resolve_entity / 派单草稿 draft_waybill（2026-11-26）
   ------------------------------------------------------------
   口径（改这里要同步前端 src/config/aiEntityRoutes.js）：
     车辆 / 司机      ：customer_id 或 org 收口 —— 这两张表**没有** owner_account
     围栏/客户/货物/路线：owner_account = 租户
                        ⚠️ customer_archives 不是 customers 表
     指派 target       ：vehicle → 车牌字符串，driver → 司机姓名
                        （与 WaybillCreate.doPublish 的 record.vehicle / record.driver 一致）
   ⚠️ 客户与货物**必须能在档案表里查到**才放行：运单只存 id + 名称，
      档案不存在的话运单上就是个查无此人的字符串。
   ============================================================ */

const FENCE_TYPE_CN = { pickup: '装货', delivery: '卸货', alert: '提醒' }

const ENTITY_DEF = {
  vehicle: {
    table: TABLE.VEHICLES,
    cols: 'plate,vin,org,driver,fuel_type,customer_id',
    orderCol: 'updated_at',
    matchCol: 'plate',
    tenantBy: 'scope',
    nameOf: (r) => r.plate,
    shape: (r) => ({
      id: String(r.plate || ''),
      name: String(r.plate || ''),
      plate: String(r.plate || ''),
      org: String(r.org || ''),
      extra: [r.fuel_type ? String(r.fuel_type) : '', r.driver ? `司机 ${r.driver}` : '']
        .filter(Boolean).join(' · '),
    }),
  },
  driver: {
    table: TABLE.DRIVERS,
    cols: 'driver_name,phone,org,bound_vehicle,customer_id',
    orderCol: 'updated_at',
    matchCol: 'driver_name',
    tenantBy: 'scope',
    nameOf: (r) => r.driver_name,
    shape: (r) => ({
      id: String(r.driver_name || ''),
      name: String(r.driver_name || ''),
      org: String(r.org || ''),
      phoneMasked: maskPhone(r.phone),
      extra: splitPlates(r.bound_vehicle).length ? `车 ${splitPlates(r.bound_vehicle).join('、')}` : '',
    }),
  },
  fence: {
    table: TABLE.FENCES,
    cols: 'id,name,center,fence_type,owner_account',
    orderCol: 'updated_at',
    matchCol: 'name',
    tenantBy: 'owner',
    nameOf: (r) => r.name,
    shape: (r) => ({
      id: String(r.id ?? ''),
      name: String(r.name || ''),
      /* 只标「装货 / 卸货」，alert 类型不显示 —— 否则卡片上会出现「提醒」，
         用户会以为是系统在提示他什么。 */
      extra: r.fence_type === 'pickup' ? '装货围栏'
        : r.fence_type === 'delivery' ? '卸货围栏'
          : '',
    }),
  },
  customer: {
    table: TABLE.CUSTOMER_ARCHIVES,
    cols: 'id,name,org_name,manager,owner_account',
    orderCol: 'created_at',
    matchCol: 'name',
    tenantBy: 'owner',
    nameOf: (r) => r.name,
    shape: (r) => ({
      id: String(r.id ?? ''),
      name: String(r.name || ''),
      org: String(r.org_name || ''),
      extra: r.manager ? `联系人 ${r.manager}` : '',
    }),
  },
  cargo: {
    table: TABLE.CARGO_ARCHIVES,
    cols: 'id,name,unit,status,owner_account',
    orderCol: 'created_at',
    matchCol: 'name',
    tenantBy: 'owner',
    nameOf: (r) => r.name,
    shape: (r) => ({ id: String(r.id ?? ''), name: String(r.name || ''), extra: String(r.unit || '') }),
  },
  route: {
    table: TABLE.ROUTES,
    cols: 'id,name,org,owner_account',
    orderCol: 'created_at',
    matchCol: 'name',
    tenantBy: 'owner',
    nameOf: (r) => r.name,
    shape: (r) => ({ id: String(r.id ?? ''), name: String(r.name || ''), org: String(r.org || ''), extra: '' }),
  },
}

/**
 * 查实体候选。
 * ① 先用 ilike 粗筛（覆盖绝大多数正确输入）
 * ② 粗筛为空 → 扫租户内最近 200 条，在内存里打分（这样打错一个字还能提示"是不是 XX"）
 */
async function searchEntity(kind, text, ctx, opt = {}) {
  const def = ENTITY_DEF[kind]
  if (!def) throw new BizError(CODE.ERR_PARAM, `不支持的实体类型：${kind}`)
  const tenant = ctx.tenant

  let base = `select=${def.cols}&limit=${LIMITS.ENTITY_SCAN_ROWS}`
  if (def.tenantBy === 'scope') {
    const scope = ctx.energyScope || {}
    if (scope.customerId) {
      base += `&customer_id=eq.${enc(scope.customerId)}`
    } else if (Array.isArray(scope.orgNames) && scope.orgNames.length) {
      base += `&org=in.(${scope.orgNames.map((n) => `"${String(n).replace(/"/g, '')}"`).join(',')})`
    } else {
      throw new BizError(CODE.ERR_NO_TENANT, '当前账号未绑定客户档案，暂时无法查询该实体')
    }
    base += orgFilterOf(ctx)
  } else {
    base += `&owner_account=eq.${enc(tenant)}`
  }
  /* 最新的排前面：点「选已有」时看到的是最近用过的，而不是几年前的几条 */
  if (def.orderCol) base += `&order=${def.orderCol}.desc`

  const run = async (extra) => {
    let rows = []
    try {
      rows = (await dbSelect(def.table, base + extra)) || []
    } catch (e) {
      if (isMissingTable(e)) throw new BizError(CODE.ERR_TOOL_FAIL, `${def.table} 表尚未初始化`)
      throw e
    }
    /* owner 类表本地再断言一次：脏数据的 owner_account 可能为空，
       逐行报错会把整个功能打死，这里只剔除并留痕。 */
    if (def.tenantBy === 'owner') {
      const kept = rows.filter((r) => r && String(r.owner_account || '') === String(tenant))
      if (kept.length !== rows.length) {
        console.error(`[searchEntity] ${def.table} 剔除越权行 ${rows.length - kept.length} 条 expect=${tenant}`)
      }
      return kept
    }
    return rows
  }

  const needle = String(text || '').trim()
  if (!needle) {
    /* 没给关键字 = 浏览模式：列最近的几条让用户挑。
       ⚠️ 以前这里返回空数组，用户点「选已有」看到"档案里没有相似的"，
          会以为档案是空的 —— 而"待补充"本来就该等同于"没填"，
          应该把可选项摆出来。 */
    const rows = await run('')
    const take = opt.browseLimit || 8
    const candidates = rows.slice(0, take).map((r) => ({
      ...def.shape(r),
      matchedBy: 'browse',
      score: 0,
    }))
    return { kind, exact: false, candidates, suggestions: [], scanned: rows.length, browse: true }
  }

  let rows = await run(`&${def.matchCol}=ilike.*${enc(needle)}*`)
  if (!rows.length) rows = await run('')

  const hits = rankCandidates(needle, rows, {
    kind,
    field: (r) => def.nameOf(r),
    limit: opt.limit || LIMITS.CANDIDATE_ROWS,
  })
  const candidates = hits.map((h) => ({ ...def.shape(h.row), matchedBy: h.matchedBy, score: h.score }))
  const exact = candidates.length === 1 && candidates[0].score >= SCORE.PREFIX

  /* 一个都没中 → 给「疑似笔误」建议（编辑距离 ≤2 的前 3 个） */
  let suggestions = []
  if (!candidates.length && rows.length) {
    suggestions = rows
      .map((r) => {
        const { typo, distance } = isTypoOf(needle, def.nameOf(r))
        return typo ? { ...def.shape(r), distance } : null
      })
      .filter(Boolean)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3)
  }

  return { kind, exact, candidates, suggestions, scanned: rows.length }
}

async function resolve_entity(args, ctx) {
  requireTenant(ctx)
  const r = await searchEntity(args.kind, args.text, ctx)
  let note = ''
  if (!r.candidates.length) {
    note = r.suggestions.length
      ? `没找到「${args.text}」，是不是 ${r.suggestions.map((s) => s.name).join(' / ')}？`
      : `没找到「${args.text}」，需要先去建档`
  } else if (r.exact) {
    note = `命中 1 个：${r.candidates[0].name}`
  } else {
    note = `对上 ${r.candidates.length} 个，请用户选一个`
  }
  return {
    ok: true,
    kind: r.kind,
    exact: r.exact,
    candidates: r.candidates,
    suggestions: r.suggestions,
    note,
  }
}

/** 草稿里「没提到」时的严重度：客户/路线/运费可以后补，其余不行 */
const LEVEL_WHEN_ABSENT = {
  customer: 'defer',
  route: 'defer',
  freight: 'defer',
}

/** 草稿字段 key → 实体名（搜索失败判定用） */
const ENTITY_OF_KEY = {
  pickup: 'fence', delivery: 'fence', customer: 'customer',
  cargo: 'cargo', vehicle: 'vehicle', driver: 'driver', route: 'route',
}
const entityOfKey = (key) => ENTITY_OF_KEY[key] || key

async function draft_waybill(args, ctx) {
  requireTenant(ctx)
  const tenant = ctx.tenant
  const warnings = []

  /* 查询失败的实体单独记一份：不能把「查询出错」当成「档案里没有」，
     否则会误导用户去重复建档（2026-11-26 司机隔离条件的坑就这么被掩盖了）。 */
  const failedKinds = new Set()
  const safeSearch = (kind, text) => {
    if (!text) return Promise.resolve(null)
    return searchEntity(kind, text, ctx).catch((e) => {
      failedKinds.add(kind)
      warnings.push(`${kind}:${(e && e.message) || '查询失败'}`)
      return null
    })
  }

  const [pickupR, deliveryR, customerR, cargoR, vehicleR, driverR, routeR] = await Promise.all([
    safeSearch('fence', args.pickup),
    safeSearch('fence', args.delivery),
    safeSearch('customer', args.customerName),
    safeSearch('cargo', args.cargoName),
    safeSearch('vehicle', args.vehiclePlate),
    safeSearch('driver', args.driverName),
    safeSearch('route', args.routeName),
  ])

  const fields = []
  const missing = []
  const conflicts = []
  const duplicates = []
  let ambiguous = false

  /**
   * 往卡片里推一个主数据字段，并决定它是命中 / 多候选 / 缺口
   * @returns 命中的候选对象，或 null
   */
  const putEntity = (key, label, raw, res, hitSrc) => {
    if (!raw) {
      const level = LEVEL_WHEN_ABSENT[key] || classifyMissing(key)
      if (level !== 'defer') missing.push({ field: key, level, reason: '原文未提及' })
      fields.push({
        key, label, value: '未指定', src: 'missing',
        sub: level === 'defer' ? '可后补' : '需要补', level,
      })
      return null
    }
    if (res && res.exact) {
      const c = res.candidates[0]
      fields.push({ key, label, value: c.name, src: hitSrc, sub: c.extra || '' })
      return c
    }
    if (res && res.candidates.length > 1) {
      ambiguous = true
      fields.push({
        key, label, value: raw, src: 'text',
        sub: `对上 ${res.candidates.length} 个`, candidates: res.candidates, level: 'confirm',
      })
      return null
    }
    /* 查询本身失败（不是"没有"）：给可重试的提示，不逼用户去建档 */
    if (failedKinds.has(entityOfKey(key))) {
      missing.push({ field: key, level: 'confirm', reason: `查询${label}档案时出错，点「重新对齐」再试一次` })
      fields.push({ key, label, value: raw, src: 'missing', sub: '查询失败，可重试', level: 'confirm' })
      return null
    }
    const sug = res && res.suggestions && res.suggestions.length
      ? `；是不是「${res.suggestions[0].name}」？` : ''
    missing.push({ field: key, level: 'block', reason: `没匹配到${label}${sug}` })
    fields.push({ key, label, value: raw, src: 'missing', sub: '档案里没有', level: 'block' })
    return null
  }

  const pickup = putEntity('pickup', '装货地', args.pickup, pickupR, 'fence')
  const delivery = putEntity('delivery', '卸货地', args.delivery, deliveryR, 'fence')
  const customer = putEntity('customer', '客户', args.customerName, customerR, 'archive')
  const cargo = putEntity('cargo', '货物', args.cargoName, cargoR, 'archive')

  /* ---------- 数量 ---------- */
  const unit = String(args.unit || (cargo && cargo.extra) || '吨')
  const quantity = args.quantity == null || args.quantity === '' ? null : Number(args.quantity)
  if (quantity == null) {
    missing.push({ field: 'quantity', level: 'confirm', reason: '原文未提及，建单页可填' })
    fields.push({ key: 'quantity', label: '数量', value: '未填', src: 'missing', sub: '可后补', level: 'confirm' })
  } else {
    fields.push({ key: 'quantity', label: '数量', value: `${quantity} ${unit}`, src: 'text', sub: '' })
  }

  /* ---------- 车辆 / 司机 ---------- */
  const vehicle = putEntity('vehicle', '车辆', args.vehiclePlate, vehicleR, 'archive')
  const driver = putEntity('driver', '司机', args.driverName, driverR, 'archive')
  const plate = vehicle ? vehicle.name : ''
  const driverName = driver ? driver.name : ''

  /* ---------- 路线（选填） ---------- */
  const route = putEntity('route', '路线', args.routeName, routeR, 'archive')

  /* ---------- 计划装货 / 计划到达（两个独立时间） ----------
     用户 2026-11-26 要求把原来的「计划发车」拆成两个：
       计划装货 = 司机到场装货的时间；计划到达 = 承诺送达时间。
     合成一个必然丢信息（原来的写法把两个都塞进 plan_time）。

     ⚠️ 落到草稿里的必须是**北京时间字符串** 'YYYY-MM-DD HH:mm:ss'，
        不能给 ISO。云函数跑在 UTC，建单页的 el-date-picker 会按浏览器本地时区
        再解析一次，给 ISO 就会出现「说 8 点、显示 0 点」（已经踩过）。
     兼容：老草稿/老卡片传 planTime 时当作到达时间。 */
  const normalizePlanTime = (raw, key, label) => {
    if (!raw) {
      missing.push({ field: key, level: 'confirm', reason: '原文未提及' })
      fields.push({ key, label, value: '未指定', src: 'missing', sub: '建单页可填', level: 'confirm' })
      return null
    }
    const t = Date.parse(raw)
    if (Number.isNaN(t)) {
      missing.push({ field: key, level: 'confirm', reason: '时间没看懂，建单页再定' })
      fields.push({ key, label, value: '未识别', src: 'missing', sub: '建单页可填', level: 'confirm' })
      return null
    }
    const local = toBeijingString(t)
    fields.push({ key, label, value: local.slice(5, 16), src: 'text', sub: '' })
    if (t < Date.now() - 5 * 60 * 1000) {
      conflicts.push({ code: 'TIME_PAST', reason: `${label}早于当前时间`, value: local })
    }
    return local
  }

  const pickupTime = normalizePlanTime(args.pickupTime, 'pickupTime', '计划装货')
  const deliveryTime = normalizePlanTime(args.deliveryTime || args.planTime, 'deliveryTime', '计划到达')
  /* 装卸货时间倒挂：到得比装得还早，一定是听错了或说反了 */
  if (pickupTime && deliveryTime && deliveryTime < pickupTime) {
    conflicts.push({
      code: 'TIME_REVERSED',
      reason: '计划到达早于计划装货，时间可能有误',
      value: `${pickupTime} → ${deliveryTime}`,
    })
  }

  /* ---------- 运输模式（卡片上可直接改，走 redraft 的 transportMode 补丁） ---------- */
  const transportMode = args.transportMode === '详细' ? '详细' : '极简'
  fields.push({
    key: 'mode', label: '运输模式', value: transportMode,
    src: args.transportMode ? 'text' : 'default',
    sub: transportMode === '极简' ? '接单 → 完成' : '接单 → 装车完成 → 发车 → 到达 → 完成',
  })

  /* ---------- 运费（**不是必填**，建单页可填、建单后也能在费用页登记） ---------- */
  fields.push({
    key: 'freight', label: '运费', value: '未填', src: 'missing',
    sub: '选填 · 建单页或之后登记', level: 'defer',
  })

  /* ---------- 冲突与疑似重复 ---------- */
  const lookbackSince = new Date(Date.now() - LIMITS.DRAFT_LOOKBACK_H * 3600 * 1000).toISOString()

  if (plate) {
    const q =
      'select=waybill_no,status,vehicle,driver,delivery,create_time' +
      `&owner_account=eq.${enc(tenant)}&vehicle=eq.${enc(plate)}` +
      `&create_time=gte.${enc(lookbackSince)}&limit=8`
    const rows = (await dbSelect(TABLE.WAYBILLS, q).catch((e) => {
      console.warn('[draft_waybill] 车辆冲突查询失败:', e && e.message)
      return []
    })) || []

    const busy = rows.find((r) => isActiveWaybill(r.status))
    if (busy) {
      conflicts.push({
        code: 'VEHICLE_BUSY', plate,
        waybillNo: busy.waybill_no, status: busy.status,
        reason: '同车只能有一条未结束运单',
      })
    }
    const dup = rows.find((r) => delivery && normName(r.delivery) === normName(delivery.name))
    if (dup) {
      duplicates.push({
        waybillNo: dup.waybill_no,
        diffMin: dup.create_time ? Math.max(0, Math.round((Date.now() - Date.parse(dup.create_time)) / 60000)) : null,
        sameBy: '车牌 + 卸货地',
      })
    }
  }

  if (driverName) {
    const q =
      'select=waybill_no,status,driver' +
      `&owner_account=eq.${enc(tenant)}&driver=eq.${enc(driverName)}&limit=8`
    const rows = (await dbSelect(TABLE.WAYBILLS, q).catch(() => [])) || []
    const busy = rows.find((r) => isActiveWaybill(r.status))
    if (busy && !conflicts.some((c) => c.waybillNo === busy.waybill_no)) {
      conflicts.push({
        code: 'DRIVER_BUSY', driver: driverName,
        waybillNo: busy.waybill_no, status: busy.status,
        reason: '同司机只能有一条未结束运单',
      })
    }
  }

  /* ---------- 客户联系人（同角色唯一时自动带入，与 Web 建单页同口径） ----------
     2026-11-26：以前 tasks 里 pickupContactName 写死空串，草稿卡永远显示「未填」，
     用户到建单页还得自己去找人。现在从 customer_contacts 按角色带：
       ① 恰好 1 个该角色（或 roles 含「唯一」）→ 自动带入
       ② 多个 → 不猜，建单页让人选（草稿卡仍显示未填，这是对的）
       ③ 没有客户档案 → 无从查，留空
     ⚠️ 这里是运营/调度自己的客户资料，卡片显示完整号码（要拨号）；
        写日志时不要带号码（见 writeLog 的字段白名单）。 */
  let contacts = []
  if (customer && customer.id) {
    try {
      contacts = (await dbSelect(
        TABLE.CUSTOMER_CONTACTS,
        `select=id,name,phone,roles&archive_id=eq.${enc(customer.id)}&limit=50`
      )) || []
    } catch (e) {
      contacts = []
      warnings.push(`customer_contacts:${(e && e.message) || '查询失败'}`)
    }
  }
  const pickContact = (role) => {
    if (!contacts.length) return null
    const hit = contacts.filter((c) => {
      const rs = String(c.roles || '').split(/[,，、]/).map((x) => x.trim()).filter(Boolean)
      return rs.includes(role) || rs.includes('唯一')
    })
    return hit.length === 1 ? hit[0] : null
  }
  const pc = pickContact('装货')
  const dc = pickContact('卸货')
  if (customer && contacts.length && !pc && !dc) {
    warnings.push('customer_contacts:同角色有多位联系人，请在建单页选择')
  }

  /* ---------- 组装草稿（结构对齐 WaybillCreate.applyCloneData） ---------- */
  const target = plate || driverName
  const draft = {
    tasks: [{
      customName: '任务1',
      pickupLocation: pickup ? pickup.name : (args.pickup || ''),
      deliveryLocation: delivery ? delivery.name : (args.delivery || ''),
      pickupTime: pickupTime || '',
      deliveryTime: deliveryTime || '',
      senderPhone: pc ? String(pc.phone || '') : '',
      receiverPhone: dc ? String(dc.phone || '') : '',
      pickupCustomerId: customer ? customer.id : '',
      pickupCustomerName: customer ? customer.name : '',
      pickupContactId: pc ? String(pc.id) : '',
      pickupContactName: pc ? String(pc.name || '') : '',
      pickupPhone: pc ? String(pc.phone || '') : '',
      deliveryCustomerId: '',
      deliveryContactId: dc ? String(dc.id) : '',
      deliveryContactName: dc ? String(dc.name || '') : '',
      deliveryPhone: dc ? String(dc.phone || '') : '',
      routeId: route ? route.id : null,
      routeName: route ? route.name : '',
      planIdx: null, planName: '', planColor: '', planInfo: null,
    }],
    cargoList: [{
      name: cargo ? cargo.name : (args.cargoName || ''),
      quantity: quantity,
      unit: unit,
      freight: 0,
      taskId: 1,
      /* 计价规则从货物档案带（cargo_rules 由档案页维护，这里只带档案上的单位） */
      ruleId: '', ruleName: '', priceUnit: unit, priceTax: null, priceNoTax: null, autoFreight: true,
    }],
    assignList: [{
      assignMethod: plate ? 'vehicle' : 'driver',
      taskId: 1,
      items: [{ target: target || '', carryQuantity: quantity, carryFreight: null }],
    }],
    transportMode,
    checkInRequired: transportMode === '详细',
    customerArchiveId: customer ? customer.id : '',
    customerArchiveName: customer ? customer.name : '',
  }

  return {
    ok: true,
    status: draftStatusOf({ missing, conflicts, ambiguous }),
    draft,
    fields,
    missing,
    conflicts,
    duplicates,
    /* 前端要保存下来供「刷新草稿」重跑（原始文字，不是已解析的值） */
    params: {
      pickup: args.pickup || '',
      delivery: args.delivery || '',
      customerName: args.customerName || '',
      vehiclePlate: args.vehiclePlate || '',
      driverName: args.driverName || '',
      routeName: args.routeName || '',
      cargoName: args.cargoName || '',
      quantity: quantity,
      unit: unit,
      /* 原始入参：redraft 重跑时要原样回传（不是解析后的值） */
      pickupTime: args.pickupTime || '',
      deliveryTime: args.deliveryTime || args.planTime || '',
      transportMode,
    },
    jump: { path: '/waybill/create' },
    note: warnings.length
      ? `部分档案查询失败：${warnings.slice(0, 2).join('；')}`
      : (ambiguous ? '有字段对上了多个候选，选一个后可以继续' : '确认后进入建单页，仍需人工发布'),
  }
}

/* ============================================================
   render_chart —— 把本轮已查到的数据画成图
   ------------------------------------------------------------
   ⚠️⚠️ 参数里**没有任何数值字段**：数据只从 ctx.chartSources（本轮已执行
        的工具结果）里取。模型能选「画哪种图、用哪份结果」，但塞不进一个
        自己编的数字 —— 这是结构性防幻觉，不是靠 prompt 约束。
   ============================================================ */
const CHART_BAR = '#C8102E'
const CHART_LINE = '#0F9B8E'
const CHART_SOFT = '#9FDED4'
const CHART_PALETTE = ['#C8102E', '#3EA8D6', '#F5B544', '#8B7CC8', '#0F9B8E', '#FF7A59']
const FEE_TYPE_CN = { expense: '支出', subsidy: '补贴', loan: '借款', violation: '违章' }

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100

/** 环比：最后两项的百分比变化；不足两点或基数为 0 时不显示 */
function deltaOf(values) {
  const arr = (values || []).filter((v) => v != null && Number.isFinite(Number(v)))
  if (arr.length < 2) return null
  const prev = Number(arr[arr.length - 2])
  const last = Number(arr[arr.length - 1])
  if (!prev) return null
  return r2(((last - prev) / prev) * 100)
}

/** 按某个字段计数，返回环图/排行用的 items */
function groupCount(rows, keyOf, labelOf, colorBase) {
  const map = new Map()
  for (const r of rows) {
    const k = keyOf(r)
    map.set(k, (map.get(k) || 0) + 1)
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v], i) => ({ label: labelOf(k), value: v, color: CHART_PALETTE[i % CHART_PALETTE.length] }))
}

function buildChartData(args, data) {
  const type = args.chartType
  const limit = Math.min(args.limit || 8, LIMITS.CHART_POINTS)
  const src = args.source
  const rows = Array.isArray(data.rows) ? data.rows.slice(0, LIMITS.CHART_POINTS) : []
  if (!rows.length) return null

  /* ---------------- 能耗 ---------------- */
  if (src === 'q_energy') {
    if (type === 'rank') {
      const top = rows.slice(0, limit)
      return {
        chartType: 'rank',
        chart: {
          items: top.map((r, i) => ({
            label: String(r.key || '--'),
            value: r.rate == null ? 0 : Number(r.rate),
            note: r.rate == null ? '--' : String(r.rate),
            color: i === 0 ? CHART_BAR : CHART_LINE,
          })),
        },
        table: {
          cols: [{ key: 'key', label: '车牌' }, { key: 'rate', label: '百公里' }, { key: 'km', label: '里程' }],
          rows: top,
        },
        note: `按百公里能耗降序，共 ${(data.summary && data.summary.vehicles) || rows.length} 台有数据`,
      }
    }
    const labels = rows.map((r) => String(r.key || ''))
    const km = rows.map((r) => Number(r.km) || 0)
    const rate = rows.map((r) => (r.rate == null ? null : Number(r.rate)))
    return {
      chartType: 'trend',
      chart: {
        labels,
        series: [
          { name: '里程 km', type: 'bar', data: km, color: CHART_SOFT },
          { name: '百公里能耗', type: 'line', data: rate, color: CHART_LINE },
        ],
        unit: '度',
      },
      kpi: { value: data.summary ? data.summary.rate : null, delta: deltaOf(rate), unit: '度 / 百公里' },
      table: {
        cols: [{ key: 'key', label: '日期/车牌' }, { key: 'km', label: '里程' }, { key: 'rate', label: '百公里' }],
        rows,
      },
      note: data.note || '',
    }
  }

  /* ---------------- 费用（按月） ---------------- */
  if (src === 'q_fee' && data.groupBy === 'month') {
    const labels = rows.map((r) => String(r.month || ''))
    const amount = rows.map((r) => Number(r.amount) || 0)
    const count = rows.map((r) => Number(r.count) || 0)
    return {
      chartType: 'trend',
      chart: {
        labels,
        series: [
          { name: '金额 元', type: 'bar', data: amount, color: CHART_BAR },
          { name: '笔数', type: 'line', data: count, color: CHART_LINE },
        ],
        unit: '元',
      },
      kpi: { value: data.summary ? data.summary.amount : null, delta: deltaOf(amount), unit: '元' },
      table: {
        cols: [{ key: 'month', label: '月份' }, { key: 'amount', label: '金额' }, { key: 'count', label: '笔数' }],
        rows,
      },
      note: data.note || '',
    }
  }

  /* ---------------- 费用（明细）→ 构成 ---------------- */
  if (src === 'q_fee') {
    const map = new Map()
    for (const r of rows) {
      const k = String(r.type || 'other')
      map.set(k, (map.get(k) || 0) + Number(r.amount || 0))
    }
    const items = [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v], i) => ({ label: FEE_TYPE_CN[k] || k, value: r2(v), color: CHART_PALETTE[i % CHART_PALETTE.length] }))
    if (items.length < 2) return null
    return {
      chartType: 'share',
      chart: { items },
      kpi: { value: data.summary ? data.summary.amount : null, unit: '元' },
      table: { cols: [{ key: 'label', label: '类型' }, { key: 'value', label: '金额' }], rows: items },
      note: '费用只有支出 / 补贴 / 借款 / 违章四类',
    }
  }

  /* ---------------- 运单 → 状态分布 ---------------- */
  if (src === 'q_waybill') {
    const items = groupCount(rows, (r) => String(r.status || '未知'), (k) => k)
    if (items.length < 2) return null
    return {
      chartType: 'share',
      chart: { items },
      table: { cols: [{ key: 'label', label: '状态' }, { key: 'value', label: '单数' }], rows: items },
      note: `共 ${(data.summary && data.summary.count) || rows.length} 条`,
    }
  }

  /* ---------------- 车辆 → 机构分布 ---------------- */
  if (src === 'q_vehicle') {
    const items = groupCount(rows, (r) => String(r.org || '未分机构'), (k) => k)
    if (items.length < 2) return null
    return {
      chartType: 'share',
      chart: { items },
      table: { cols: [{ key: 'label', label: '机构' }, { key: 'value', label: '台数' }], rows: items },
      note: `共 ${(data.summary && data.summary.count) || rows.length} 台`,
    }
  }

  return null
}

const CHART_TITLE = {
  'q_energy:rank': '百公里能耗排行',
  'q_energy:trend': '能耗趋势',
  'q_energy:compare': '能耗对比',
  'q_fee:trend': '费用趋势',
  'q_fee:share': '费用构成',
  'q_waybill:share': '运单状态分布',
  'q_vehicle:share': '车辆机构分布',
}

async function render_chart(args, ctx) {
  const sources = Array.isArray(ctx.chartSources) ? ctx.chartSources : []
  const hit = [...sources].reverse().find((r) => r && r.name === args.source && r.ok && r.data)
  if (!hit) {
    throw new BizError(CODE.ERR_PARAM, '还没有查这项数据，请先查询再画图')
  }

  const built = buildChartData(args, hit.data)
  if (!built) {
    throw new BizError(CODE.ERR_PARAM, '这份数据画图不如直接说清楚，请改用文字回答')
  }

  const points = (built.chart.labels || built.chart.items || []).length
  if (built.chartType !== 'share' && points < 3) {
    return {
      ok: false,
      tooFewPoints: true,
      count: points,
      note: `只有 ${points} 个数据点，直接说结论更清楚`,
    }
  }

  return {
    ok: true,
    ...built,
    title: args.title || CHART_TITLE[`${args.source}:${args.chartType}`] || '数据图',
    range: hit.data.asOf ? `截至 ${hit.data.asOf}` : '',
  }
}

/* ============================================================
   大屏遥控（2026-11-27）
   ------------------------------------------------------------
   ⭐ 只「写一条指令」，绝不直接操作大屏；执行与回执都在大屏侧。
   ⭐ 屏不在线时返回 ok:false —— 让模型如实说，不许编「已投屏」。
   ⭐ payload 全是标量 / 字符串数组，不接收自由文本，杜绝「传一段话去执行」。
   ============================================================ */
const SCREEN_ACTIONS = [
  'focus_vehicle', 'highlight_vehicles', 'filter_vehicle',
  'switch_tab', 'focus_area', 'open_kpi', 'reset',
]
const SCREEN_STATUS = ['行驶', '静止', '离线']
const SCREEN_KPI = ['mileage', 'running', 'speed', 'alerts', 'flow', 'route']

/** 找目标屏：指定优先，否则用最近活跃的那块 */
async function pickScreen(tenant, screenId) {
  const since = new Date(Date.now() - LIMITS.SCREEN_ONLINE_MS).toISOString()
  const rows = await dbSelect(
    TABLE.SCREEN_DEVICES,
    `select=screen_id,name,current_page&tenant=eq.${enc(tenant)}` +
      `&last_seen=gt.${enc(since)}&order=last_seen.desc&limit=5`
  )
  if (!rows.length) return null
  const wanted = String(screenId || '').trim()
  if (wanted) {
    const hit = rows.find((r) => r.screen_id === wanted)
    if (hit) return hit
  }
  return rows[0]
}

async function screen_dispatch(args, ctx) {
  const tenant = requireTenant(ctx)
  const action = String((args && args.action) || '').trim()
  if (SCREEN_ACTIONS.indexOf(action) < 0) {
    throw new BizError(CODE.ERR_PARAM, '不支持的投屏动作')
  }

  /* 切到费用大屏是另一个权限 key，不能借 screen_fleet 的道 */
  if (action === 'switch_tab' && args.tab === 'fee' && !permHit(ctx.perms, 'screen_fee')) {
    return { ok: false, code: 'E_NO_PERM', note: '当前账号没有运单费用大屏的权限' }
  }

  const dev = await pickScreen(tenant, args.screenId)
  if (!dev) {
    return {
      ok: false,
      code: 'E_SCREEN_OFFLINE',
      note: '没有在线的大屏。请确认大屏已打开、浏览器没被最小化',
    }
  }

  const payload = {}
  if (action === 'focus_vehicle') {
    const plate = String(args.plate || '').trim().replace(/\s+/g, '').toUpperCase()
    if (!plate) throw new BizError(CODE.ERR_PARAM, '没给车牌')
    payload.plate = plate
  } else if (action === 'highlight_vehicles' || action === 'filter_vehicle') {
    const plates = (Array.isArray(args.plates) ? args.plates : [])
      .map((x) => String(x || '').trim().replace(/\s+/g, '').toUpperCase())
      .filter(Boolean)
      .slice(0, LIMITS.SCREEN_PLATES_MAX)
    if (plates.length) payload.plates = plates

    if (action === 'filter_vehicle') {
      if (args.org) payload.org = String(args.org).slice(0, 30)
      if (SCREEN_STATUS.indexOf(args.status) >= 0) payload.status = args.status
      if (!plates.length && !payload.org && !payload.status) {
        throw new BizError(CODE.ERR_PARAM, '筛选条件为空')
      }
    } else if (!plates.length) {
      throw new BizError(CODE.ERR_PARAM, '没给要高亮的车牌')
    }
  } else if (action === 'switch_tab') {
    payload.tab = args.tab === 'fee' ? 'fee' : 'fleet'
  } else if (action === 'focus_area') {
    const area = String(args.area || '').trim().slice(0, 30)
    if (!area) throw new BizError(CODE.ERR_PARAM, '没说要看的片区')
    payload.city = area
  } else if (action === 'open_kpi') {
    payload.key = SCREEN_KPI.indexOf(args.key) >= 0 ? args.key : 'mileage'
  }

  /* 只留最新一条：同屏更早的 pending 直接作废。
     否则用户连着说三句，屏幕会按顺序跳三下，看起来像抽风。 */
  await dbPatch(
    TABLE.SCREEN_COMMANDS,
    `tenant=eq.${enc(tenant)}&screen_id=eq.${enc(dev.screen_id)}&status=eq.pending`,
    { status: 'expired' }
  )

  const commandId = 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  await dbInsert(TABLE.SCREEN_COMMANDS, {
    command_id: commandId,
    tenant,
    screen_id: dev.screen_id,
    action,
    payload,
    status: 'pending',
    source: 'miniprogram',
    created_by: ctx.account,
    created_by_name: ctx.name || ctx.account,
    expires_at: new Date(Date.now() + LIMITS.SCREEN_CMD_TTL_MS).toISOString(),
  })

  return {
    ok: true,
    commandId,
    screen: { name: dev.name, page: dev.current_page === 'fee' ? '运单费用' : '车辆运行' },
    note: '已发送，1 秒内生效',
  }
}

async function q_screen(args, ctx) {
  const tenant = requireTenant(ctx)
  let rows = []
  try {
    rows = await dbSelect(
      TABLE.SCREEN_DEVICES,
      `select=screen_id,name,current_page,holder_name,last_seen` +
        `&tenant=eq.${enc(tenant)}&order=last_seen.desc&limit=10`
    )
  } catch (e) {
    if (isMissingTable(e)) return { ok: false, note: '大屏遥控功能尚未初始化，请先执行建表脚本' }
    throw e
  }

  const now = Date.now()
  const screens = rows.map((r) => ({
    name: r.name,
    page: r.current_page === 'fee' ? '运单费用' : '车辆运行',
    online: r.last_seen ? now - Date.parse(r.last_seen) < LIMITS.SCREEN_ONLINE_MS : false,
    holder: r.holder_name || '',
  }))

  return {
    ok: true,
    count: screens.length,
    online: screens.filter((s) => s.online).length,
    screens,
  }
}

/* ============================================================
   调度
   ============================================================ */
const IMPL = {
  q_energy, q_fee, q_todo, q_waybill, q_vehicle, q_driver,
  resolve_entity, draft_waybill, render_chart,
  screen_dispatch, q_screen,
}

async function runTool(name, args, ctx) {
  const fn = IMPL[name]
  if (!fn) throw new BizError(CODE.ERR_NO_TOOL, `未知工具 ${name}`)
  return fn(args, ctx)
}

/* toBeijingString 一并导出，只为单测能锁住「8 点不能变 0 点」这个坑 */
module.exports = { runTool, canApprove, toBeijingString, orgFilterOf }
