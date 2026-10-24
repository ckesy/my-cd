/**
 * 系统功能权限清单（唯一来源）
 *
 * ⭐ 新增页面时：
 *   1. router/index.js 加路由
 *   2. SidebarMenu.vue 加菜单项 v-if="hasPerm('xxx')"
 *   3. 在这里加一行 { key: 'xxx', name: '功能名' }
 *   4. 提交后功能配置弹窗自动出现新功能
 *
 * ⚠️ 这里的模块/条目要和 **侧边栏真实菜单** 一一对应（2026-10-24 用户反馈
 *    「有的新增页签没有」就是这里漏了：业务流程、车队分析报告、费用明细、运单统计）。
 *    新加菜单忘了加这里 → 配置弹窗里就少一项，角色永远勾不上。
 */
export const PERMISSION_MODULES = [
  {
    key: 'home',
    name: '首页',
    icon: 'HomeFilled',
    sort: 1,
    items: [
      { key: 'home', name: '首页 / 数据总览', sort: 1 },
    ],
  },
  {
    key: 'flow',
    name: '业务流程',
    icon: 'Rank',
    sort: 2,
    items: [
      /* 可配给角色：勾了就能进画布（非主账号只读调参，不能启停模块） */
      { key: 'flow', name: '业务流程画布', sort: 1 },
    ],
  },
  {
    key: 'drive',
    name: '行车管理',
    icon: 'Van',
    sort: 3,
    items: [
      { key: 'driving_fullmap', name: '全图监控', sort: 1 },
      { key: 'vehicle_fault', name: '车辆故障管理', sort: 2 },
      { key: 'appearance_inspect', name: '外观巡检管理', sort: 3 },
    ],
  },
  {
    key: 'ele_fence',
    name: '电子围栏管理',
    icon: 'Location',
    sort: 4,
    items: [
      /* 围栏设置 / 提醒设置 / 提醒事件查询 三项共用 ele_fence 权限 */
      { key: 'ele_fence', name: '电子围栏管理', sort: 1 },
    ],
  },
  {
    key: 'operation',
    name: '运营管理',
    icon: 'DataLine',
    sort: 5,
    items: [
      /* ⭐ 2026-10-24：三个报表拆成独立权限（以前共用 operation，
         勾一个三个全亮，看着像"页签不刷新"）。
         老角色配置里如果是单条 operation，读取时会展开成这三条
         （见 FunctionPermissionDialog 的 expandKeys），菜单侧也留了别名。 */
      { key: 'operation_summary', name: '综合报表', sort: 1 },
      { key: 'operation_energy', name: '能耗报告', sort: 2 },
      { key: 'operation_driving', name: '驾驶行为报表', sort: 3 },
    ],
  },
  {
    key: 'transport',
    name: '运输管理',
    icon: 'Tickets',
    sort: 6,
    items: [
      { key: 'waybill', name: '运单管理', sort: 1 },
      /* ⭐ 新增：运单统计（以前跟 waybill 共用，勾了运单才有统计） */
      { key: 'waybill_stats', name: '运单统计', sort: 2 },
      { key: 'route', name: '路线管理', sort: 3 },
    ],
  },
  {
    key: 'fee',
    name: '费用管理',
    icon: 'Wallet',
    sort: 7,
    items: [
      /* ⭐ 新增：费用明细（以前和费用统计共用 fee_stats） */
      { key: 'fee_list', name: '费用明细', sort: 1 },
      { key: 'fee_stats', name: '费用统计', sort: 2 },
      /* 付款登记：可配给角色（财务/出纳）；模块开关 payout 仍是硬前提 */
      { key: 'fee_payout', name: '付款登记', sort: 3 },
      // ⭐ 审批设置只给主账号：任何角色都勾不上（与「系统管理」同一套置灰机制）
      { key: 'fee_config', name: '费用审批设置', sort: 4, adminOnly: true },
    ],
  },
  {
    key: 'affair',
    name: '车务管理',
    icon: 'Van',
    sort: 8.5,
    items: [
      /* ⭐ 2026-10-24：一个 key 管四个子页（总览/台账/提醒事项/提醒设置）。
         子账号只有勾了它、且模块已开通，才会收到到期提醒（口径见 vehicleAffair.js） */
      { key: 'vehicle_affair', name: '车务管理', sort: 1 },
    ],
  },
  {
    key: 'report',
    name: '车队分析报告',
    icon: 'DataAnalysis',
    sort: 8,
    items: [
      /* 一级菜单 /report，以前挂在「运输管理」里叫「车队运营报告」，与侧边栏名字对不上 */
      { key: 'report', name: '车队分析报告', sort: 1 },
    ],
  },
  {
    /* ⭐ 2026-10-25：车辆档案 / 司机档案 从「基础数据管理」整组并入档案管理
       （原分组只剩这两项，已删除）。侧边栏顺序：车辆 → 司机 → 客户 → 货物。 */
    key: 'archive',
    name: '档案管理',
    icon: 'FolderOpened',
    sort: 10,
    items: [
      { key: 'vehicle_archive', name: '车辆档案', sort: 1 },
      { key: 'driver_archive', name: '司机档案', sort: 2 },
      { key: 'customer_archive', name: '客户档案', sort: 3 },
      { key: 'cargo_archive', name: '货物档案', sort: 4 },
    ],
  },
  {
    key: 'system',
    name: '系统管理',
    icon: 'Setting',
    sort: 11,
    items: [
      { key: 'system', name: '用户管理', sort: 1 },
      { key: 'system', name: '角色管理', sort: 2 },
      { key: 'system', name: '组织管理', sort: 3 },
    ],
    // ⭐ 系统管理一般是管理员专属，配置里标记一下
    adminOnly: true,
  },
]

/** 全部权限 key 扁平列表 */
export const ALL_PERMISSION_KEYS = PERMISSION_MODULES.flatMap(m => m.items.map(i => i.key))

/** 权限 key → 中文名 */
export const PERMISSION_LABEL_MAP = (() => {
  const map = {}
  PERMISSION_MODULES.forEach(m => {
    m.items.forEach(item => { map[item.key] = item.name })
  })
  return map
})()

/**
 * ⭐ 老权限 → 新权限的兼容映射（只在「判断有没有权限」时用，不写库）
 * ------------------------------------------------------------
 * 拆分前一个 key 管多个菜单，老角色的 CSV 里只有老 key，
 * 菜单/路由判断要认，否则升级后会整片菜单消失。
 */
export const PERM_ALIAS = {
  operation_summary: ['operation'],
  operation_energy: ['operation'],
  operation_driving: ['operation'],
  fee_list: ['fee_stats'],
  waybill_stats: ['waybill'],
}

/** key 是否命中（perms 为 null 表示不过滤） */
export const permHit = (perms, key) => {
  if (perms === null || perms === undefined) return true
  if (perms.includes(key)) return true
  const alias = PERM_ALIAS[key]
  return !!(alias && alias.some((k) => perms.includes(k)))
}
