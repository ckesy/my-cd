/**
 * 常量（唯一来源，禁止在别处写字面量）
 * ============================================================
 * ⚠️ 这里的枚举要和以下口径保持一致，改这里就等于改全局：
 *    - 费用类型 / 状态：src/utils/feeTodo.js（MONEY_TYPES、status 判定）
 *    - 运单状态：src/views/Waybill.vue 的状态枚举（9 态）
 *    - 权限 key：src/config/permissions.js
 */

/** 云函数返回码（含业务码与错误码，前端按 code 分支） */
const CODE = {
  OK: 0,
  ERR_SESSION: 1001,      // 会话无效 / 过期
  ERR_NO_TENANT: 1002,    // 平台账号未选定租户
  ERR_NO_TOOL: 1003,      // 没有任何可用工具（权限不足）
  ERR_PARAM: 2001,        // 参数校验失败
  ERR_NOT_FOUND: 2002,    // 实体未匹配 / 多候选
  ERR_TIMEOUT: 3001,      // 模型超时
  ERR_FORMAT: 3002,       // 模型输出格式非法
  ERR_TOOL_FAIL: 3003,    // 工具执行失败 / 超时
  ERR_QUOTA: 4001,        // 配额超限
  ERR_INTERNAL: 5001,     // 内部错误
}

/** 费用类型 —— 与 feeTodo.MONEY_TYPES 一致 */
const MONEY_TYPES = ['expense', 'subsidy', 'loan', 'violation']

/** 费用状态 —— 注意「审核中」是实际落库值，「待审核」是同义展示值 */
const FEE_STATUS = ['待审核', '审核中', '已通过', '已驳回', '待打款', '已打款']
const FEE_PENDING = ['待审核', '审核中']

/** 运单状态（9 态，装车中为历史遗留） */
const WAYBILL_STATUS = [
  '待接单', '待重新指派', '待装车', '装车中',
  '装车完成', '已发车', '已到达', '已完成', '已取消',
]

/**
 * 工具清单
 * ------------------------------------------------------------
 * perm  ：调用该工具所需权限 key（null = 登录即可用）
 * scope ：数据范围约束
 *   'tenant' 只能给能看到整队数据的角色（主账号 / 员工）
 *   'any'    两种范围都能用，具体过滤在 tools.js 里按 ctx.scope 收紧
 *   'self'   只允许司机本人（当前没有这类工具）
 * 主账号（master）默认拥有全部权限。
 */const TOOLS = {
  q_energy: { perm: 'operation_energy', scope: 'tenant', desc: '能耗与里程' },
  q_fee: { perm: 'fee_list', scope: 'any', desc: '费用查询' },
  q_todo: { perm: 'fee_list', scope: 'tenant', desc: '待我处理' },
  q_waybill: { perm: 'waybill', scope: 'any', desc: '运单查询' },
  /* ⭐ 2026-11-24：补「车辆 / 司机档案」两个查询能力。
     之前 TABLE 里留了表名却没实现，用户问「我名下有哪些车」只能答「无法查询」。
     perm 用 Web 档案模块的 key（src/config/permissions.js）；
     scope='any' —— 司机走 self 分支（只返回自己绑的车），管理员走客户/机构分支。 */
  q_vehicle: { perm: 'vehicle_archive', scope: 'any', desc: '车辆档案' },
  q_driver: { perm: 'driver_archive', scope: 'any', desc: '司机档案' },
  /* ⭐ 2026-11-26 派单能力。
     scope 必须是 'tenant'：司机（self）不能派单，工具根本不下发。
     perm 用 waybill —— 有建单权限才谈得上派单。 */
  resolve_entity: { perm: 'waybill', scope: 'tenant', desc: '实体对齐（车牌/司机/围栏/客户/货物/路线）' },
  draft_waybill: { perm: 'waybill', scope: 'tenant', desc: '派单草稿（不写库）' },
  /* 图表卡只引用本轮已执行工具的结果，数据已在权限裁剪后，
     因此不再单独设 perm；scope='any' 让司机也能把自己那条画出来。 */
  render_chart: { perm: null, scope: 'any', desc: '把已查到的数据画成图' },
  /* ⭐ 2026-11-27 大屏遥控：把「看某台车」投到会议室大屏。
     scope='tenant' —— 司机不控屏，工具根本不下发。
     perm 用大屏模块 key；switch_tab 切到费用页时在实现里再校验 screen_fee。 */
  screen_dispatch: { perm: 'screen_fleet', scope: 'tenant', desc: '向数据大屏下发查看指令' },
  q_screen: { perm: 'screen_fleet', scope: 'tenant', desc: '查可投屏的大屏与在线状态' },
}

/** 条数上限（阿里规约：查询必须限制条数） */
const LIMITS = {
  ENERGY_ROWS: 50,
  FEE_ROWS: 100,
  WAYBILL_ROWS: 50,
  TODO_ROWS: 50,
  VEHICLE_ROWS: 50,
  DRIVER_ROWS: 50,
  DATE_SPAN_DAYS: 366,      // 单次查询最长跨度
  MAX_TOOL_ROUNDS: 3,       // 最多 3 轮模型往返
  MAX_TOOL_CALLS: 6,        // 一次提问内工具调用总次数上限（防模型反复查同一件事）
  INPUT_TOKEN_CAP: 10000,   // 输入上限（超出截断历史）；实测工具结果会把上下文顶到 8k+
  TIMEOUT_MS: 15000,        // 整个请求硬超时
  CANDIDATE_ROWS: 5,        // 实体对齐最多返回几个候选
  ENTITY_SCAN_ROWS: 200,    // 实体对齐扫描上限（按关键字粗筛后再打分）
  CHART_POINTS: 12,         // 图表最多画几个点 / 几根柱
  DRAFT_LOOKBACK_H: 24,     // 疑似重复单的回看小时数
  SCREEN_PLATES_MAX: 20,    // 一次最多高亮几台车
  SCREEN_ONLINE_MS: 30000,  // 大屏心跳超过这个时长视为离线
  SCREEN_CMD_TTL_MS: 60000, // 指令有效期：超过就不执行（防止早上发的指令晚上才亮）
}

/** 配额（单账号 / 单租户）
 * ⚠️⚠️ 2026-11-27 临时上调（调试大屏遥控用），**测试通过后务必改回 60 / 800**。
 *    上调只影响费用上限，不影响功能；忘了改回会在客户误用时多花钱。
 */
const QUOTA = {
  PER_ACCOUNT_HOUR: 150,   // 原值 60
  PER_TENANT_DAY: 2000,    // 原值 800
}

/** 脱敏规则 */
const MASK = {
  PHONE: /(\d{3})\d{4}(\d{4})/g,
  ID_CARD: /(\d{4})\d{10}(\w{4})/g,
}

/** 表名 */
const TABLE = {
  USERS: 'users',
  ROLES: 'roles',
  SESSIONS: 'ai_sessions',
  LOGS: 'ai_assistant_logs',
  REPORTS: 'reports',
  WAYBILLS: 'waybills',
  DAILY_STATS: 'vehicle_daily_stats',
  VEHICLES: 'vehicles',
  DRIVERS: 'drivers',
  /* 2026-11-26 派单：草稿要引用的主数据表 */
  FENCES: 'ele_fences',
  CUSTOMER_ARCHIVES: 'customer_archives',
  CUSTOMER_CONTACTS: 'customer_contacts',
  CARGO_ARCHIVES: 'cargo_archives',
  ROUTES: 'routes',
  /* 2026-11-27 大屏遥控 */
  SCREEN_DEVICES: 'screen_devices',
  SCREEN_COMMANDS: 'screen_commands',
}

/**
 * 权限别名 —— 与前端 `src/config/permissions.js` 的 PERM_ALIAS **一一对应**
 * ------------------------------------------------------------
 * 2026-11-26 线上问题：小程序的「管理员」角色 permissions.client 里只有老 key
 * `operation`，而 q_energy 要 `operation_energy`，工具裁剪按字面比对 → 直接不下发，
 * 用户问「这个月能耗怎么样」助手只能答「查不了」。财务角色同理（只有 `fee_stats`，
 * 没有 `fee_list`，连费用都查不了）。
 *
 * ⚠️ 改前端 PERM_ALIAS 必须同步改这里（云函数不能 import 前端文件）。
 */
const PERM_ALIAS = {
  operation_summary: ['operation'],
  operation_energy: ['operation'],
  operation_driving: ['operation'],
  fee_list: ['fee_stats'],
  waybill_stats: ['waybill'],
  maintenance_ledger: ['vehicle_affair'],
  affair_ledger: ['vehicle_affair'],
  affair_reminders: ['vehicle_affair'],
  affair_settings: ['vehicle_affair'],
}

/**
 * 权限是否命中（与前端 permHit 同口径）
 * @param {string[]} perms 角色权限数组（含 '*' 视为全量）
 * @param {string} key 需要的权限 key
 */
const permHit = (perms, key) => {
  const list = Array.isArray(perms) ? perms : []
  if (list.includes('*')) return true
  if (list.includes(key)) return true
  const alias = PERM_ALIAS[key]
  return !!(alias && alias.some((k) => list.includes(k)))
}

module.exports = {
  CODE, MONEY_TYPES, FEE_STATUS, FEE_PENDING, WAYBILL_STATUS,
  TOOLS, LIMITS, QUOTA, MASK, TABLE,
  PERM_ALIAS, permHit,
}
