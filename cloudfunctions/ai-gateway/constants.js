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
 */
const TOOLS = {
  q_energy: { perm: 'operation_energy', scope: 'tenant', desc: '能耗与里程' },
  q_fee: { perm: 'fee_list', scope: 'any', desc: '费用查询' },
  q_todo: { perm: 'fee_list', scope: 'tenant', desc: '待我处理' },
  q_waybill: { perm: 'waybill', scope: 'any', desc: '运单查询' },
}

/** 条数上限（阿里规约：查询必须限制条数） */
const LIMITS = {
  ENERGY_ROWS: 50,
  FEE_ROWS: 100,
  WAYBILL_ROWS: 50,
  TODO_ROWS: 50,
  DATE_SPAN_DAYS: 366,      // 单次查询最长跨度
  MAX_TOOL_ROUNDS: 3,       // 最多 3 轮模型往返
  MAX_TOOL_CALLS: 6,        // 一次提问内工具调用总次数上限（防模型反复查同一件事）
  INPUT_TOKEN_CAP: 10000,   // 输入上限（超出截断历史）；实测工具结果会把上下文顶到 8k+
  TIMEOUT_MS: 15000,        // 整个请求硬超时
}

/** 配额（单账号 / 单租户） */
const QUOTA = {
  PER_ACCOUNT_HOUR: 60,
  PER_TENANT_DAY: 800,
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
}

module.exports = {
  CODE, MONEY_TYPES, FEE_STATUS, FEE_PENDING, WAYBILL_STATUS,
  TOOLS, LIMITS, QUOTA, MASK, TABLE,
}
