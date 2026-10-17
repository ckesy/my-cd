/**
 * 系统功能权限清单（唯一来源）
 *
 * ⭐ 新增页面时：
 *   1. router/index.js 加路由
 *   2. SidebarMenu.vue 加菜单项 v-if="hasPerm('xxx')"
 *   3. 在这里加一行 { key: 'xxx', name: '功能名' }
 *   4. 提交后功能配置弹窗自动出现新功能
 *
 * 模块 key 和 item key 建议保持一致（模块含多个功能时模块 key 可另起）
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
    key: 'drive',
    name: '行车管理',
    icon: 'Van',
    sort: 2,
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
    sort: 3,
    items: [
      { key: 'ele_fence', name: '电子围栏管理', sort: 1 },
    ],
  },
  {
    key: 'operation',
    name: '运营管理',
    icon: 'DataLine',
    sort: 4,
    items: [
      // ⭐ 三个子报表共用 operation 权限（与「系统管理」三项共用 system 的做法一致）
      { key: 'operation', name: '综合报表', sort: 1 },
      { key: 'operation', name: '能耗报告', sort: 2 },
      { key: 'operation', name: '驾驶行为报表', sort: 3 },
    ],
  },
  {
    key: 'transport',
    name: '运输管理',
    icon: 'Tickets',
    sort: 5,
    items: [
      { key: 'waybill', name: '运单管理', sort: 1 },
      { key: 'route', name: '路线管理', sort: 2 },
      { key: 'report', name: '车队运营报告', sort: 3 },
    ],
  },
  {
    key: 'base_data',
    name: '基础数据管理',
    icon: 'User',
    sort: 6,
    items: [
      { key: 'vehicle_archive', name: '车辆档案', sort: 1 },
      { key: 'driver_archive', name: '司机档案', sort: 2 },
    ],
  },
  {
    key: 'system',
    name: '系统管理',
    icon: 'Setting',
    sort: 7,
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