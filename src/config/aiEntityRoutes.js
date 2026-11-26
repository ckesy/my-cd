/**
 * AI 助手 · 实体 → 档案页 路由映射
 * ============================================================
 * 草稿卡上的「新建」按钮靠这张表决定跳哪一页、建完落哪张表。
 * ⚠️ path 必须与 src/router/index.js 完全一致（和 aiPageIndex.js 一样属于
 *    「新增页面要记得加」的地方，漏了只是按钮跳不到，不会报错）。
 * ⚠️ 落表口径：客户是 customer_archives（不是 customers），
 *    货物是 cargo_archives + cargo_rules（计价规则在子表）。
 */

/** key 与草稿卡字段的 key 一致（pickup / delivery / vehicle ...） */
export const ENTITY_ROUTE = {
  pickup: { kind: 'fence', label: '装货围栏', path: '/ele-fence/setting', table: 'ele_fences' },
  delivery: { kind: 'fence', label: '卸货围栏', path: '/ele-fence/setting', table: 'ele_fences' },
  vehicle: { kind: 'vehicle', label: '车辆', path: '/archive/vehicle', table: 'vehicles' },
  driver: { kind: 'driver', label: '司机', path: '/archive/driver', table: 'drivers' },
  customer: { kind: 'customer', label: '客户', path: '/archive/customer', table: 'customer_archives' },
  cargo: { kind: 'cargo', label: '货物', path: '/archive/cargo', table: 'cargo_archives' },
  route: { kind: 'route', label: '路线', path: '/route/manage', table: 'routes' },
}

/** 草稿字段 key → draft_waybill 接受的参数名（redraft 的 patch 用） */
export const PATCH_KEY_OF = {
  pickup: 'pickup',
  delivery: 'delivery',
  customer: 'customerName',
  cargo: 'cargoName',
  vehicle: 'vehiclePlate',
  driver: 'driverName',
  route: 'routeName',
}

export const routeOfField = (key) => ENTITY_ROUTE[key] || null

/** 拼接带来源标记的地址，目标页据此显示"返回助手"提示条 */
export const withFromAi = (path) => `${path}${path.includes('?') ? '&' : '?'}from=ai`
