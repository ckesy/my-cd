/**
 * 业务流程模块注册表（唯一来源）
 * ============================================================
 * 画布、菜单、小程序底栏、云函数闸门全部从这里读，**不要各写一份**。
 *
 * 三层概念，别混：
 *   ① 模块（module）：租户级「有没有」，存 tenant_modules.enabled
 *   ② 参数（config） ：租户级「怎么跑」，存 tenant_modules.config
 *   ③ 权限（perm）   ：人级「谁能用」，存角色权限
 *   可见 = ① AND ③（模块开着 且 这个人有权限）
 *
 * ⭐ 依赖关系（deps）
 *   父模块关掉，子模块**不写库**，只在运行时折叠为无效。
 *   理由：否则客户关一次运单，再打开时付款/报表的配置全丢了。
 *
 * ⭐ defaultOn
 *   没有记录时按「开」还是「关」处理。
 *   只有运单是默认开——它是地基，其余模块默认关（"不配置就没有"）。
 */

/** 模块 key（与 tenant_modules.module_key 一一对应） */
export const MODULE = {
  WAYBILL: 'waybill',
  ROUTE: 'route',
  RECURRING: 'recurring',
  PAYOUT: 'payout',
  REPORT: 'report',
}

/** 人级权限 key（与 permissions.js / 角色权限对应） */
export const CAP = {
  WAYBILL: 'waybill',
  FEE_AUDIT: 'fee_audit',
  FEE_PAY: 'fee_pay',
  FEE_STATS: 'fee_stats',
  REPORT: 'report',
  ROUTE: 'route',
  OPERATION: 'operation',
}

/**
 * 模块清单
 * icons/chips 供画布渲染；lane 对应四条泳道；page 对应路由
 */
export const MODULES = [
  {
    key: MODULE.WAYBILL,
    name: '运单管理',
    desc: '接单、派单、执行、完成，整条运输链的地基',
    lane: 'dispatch',
    level: 'L1',            // 可关，但默认开
    defaultOn: true,        // ⭐ 唯一默认开的模块
    deps: [],
    perm: CAP.WAYBILL,
    chips: ['客户下单', '自建运单', '派单配载'],
    page: '/waybill',
  },
  {
    key: MODULE.ROUTE,
    name: '路线管理',
    desc: '常用路线与围栏绑定，建单时可直接选',
    lane: 'dispatch',
    level: 'L1',
    deps: [MODULE.WAYBILL],
    perm: CAP.ROUTE,
    chips: ['常用路线', '围栏绑定'],
    page: '/route/manage',
  },
  {
    key: MODULE.RECURRING,
    name: '常驻任务',
    desc: '按时间或次数自动续建的运输任务',
    lane: 'dispatch',
    level: 'L1',
    deps: [MODULE.WAYBILL],
    perm: CAP.WAYBILL,
    chips: ['按时间', '按次数'],
    page: '/waybill',
  },
  {
    key: MODULE.PAYOUT,
    name: '付款记录',
    desc: '审批通过后登记付款方式、时间、流水号，用于对账',
    lane: 'settle',
    level: 'L2',
    deps: [MODULE.WAYBILL],
    perm: CAP.FEE_PAY,
    chips: ['登记付款', '台账', '撤销'],
    page: '/fee/payout',
  },
  {
    key: MODULE.REPORT,
    name: '车队运营报告',
    desc: '综合报表叠加运单维度：按客户、按线路、单趟成本',
    lane: 'report',
    level: 'L1',
    deps: [MODULE.WAYBILL],
    perm: CAP.REPORT,
    chips: ['运单汇总', '按客户', '单趟成本'],
    page: '/report',
  },
]

/** key → 模块定义 */
export const MODULE_MAP = MODULES.reduce((m, x) => (m[x.key] = x, m), {})

/** 反查：子模块依赖了哪些父模块 */
export const DEPS = MODULES.reduce((m, x) => (m[x.key] = x.deps || [], m), {})

/** 默认开启的模块（没有记录时按开处理） */
export const DEFAULT_ON = MODULES.filter((m) => m.defaultOn).map((m) => m.key)

/**
 * 依赖折叠：父模块无效 → 子模块强制无效
 * ⚠️ 只在内存里算，永远不写库
 * @param {Record<string, boolean>} flags 库里读出来的 enabled
 * @returns {Record<string, boolean>} 有效状态
 */
export function foldDeps(flags = {}) {
  const eff = {}
  // 先按库里的值 + defaultOn 兜底
  MODULES.forEach((m) => {
    const raw = flags[m.key]
    eff[m.key] = raw === undefined || raw === null
      ? m.defaultOn === true
      : raw === true
  })
  // 再按依赖折叠（多轮，支持多层依赖）
  for (let pass = 0; pass < MODULES.length; pass++) {
    let changed = false
    MODULES.forEach((m) => {
      if (!eff[m.key]) return
      const deps = m.deps || []
      if (deps.some((d) => eff[d] !== true)) {
        eff[m.key] = false
        changed = true
      }
    })
    if (!changed) break
  }
  return eff
}

/** 子模块里哪些因为父模块关闭而被折叠（用于画布上标「依赖缺失」） */
export function foldedBy(flags = {}, eff = {}) {
  const out = {}
  MODULES.forEach((m) => {
    if (flags[m.key] === true && eff[m.key] === false) {
      out[m.key] = (m.deps || []).filter((d) => eff[d] !== true)
    }
  })
  return out
}

/** 必选能力：不进 tenant_modules，客户不可关 */
export const BASE_MODULES = [
  {
    key: 'summary',
    name: '综合报表',
    desc: '车辆运行数据，按车按日',
    chips: ['里程', '时长', '电耗'],
    page: '/operation/summary',
    color: 'var(--blue)',
  },
  {
    key: 'energy',
    name: '能耗报告',
    desc: '与运单无关，独立口径',
    chips: ['油耗', '电耗', '百公里'],
    page: '/operation/energy',
    color: 'var(--teal)',
  },
  {
    key: 'driving',
    name: '驾驶行为',
    desc: '行程维度，运单聚合待接口',
    chips: ['超速', '急加速', '怠速'],
    page: '/operation/driving',
    color: 'var(--purple)',
  },
]
