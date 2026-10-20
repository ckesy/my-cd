/**
 * 客户级功能模块开关（注册表驱动）
 * ============================================================
 * 锚点表：tenant_modules（owner_account + module_key 唯一）
 * 注册表：@/config/modules（模块清单、依赖关系、默认值）
 *
 * 核心约定：
 *   ① **没有记录 = 按 defaultOn 处理**（运单默认开，其余默认关）
 *      这样新增模块不会把存量客户的业务悄悄关掉
 *   ② **依赖折叠只在内存里算**，父模块关闭时不写子模块的 enabled
 *      否则客户关一次运单，再打开时付款/报表的配置全丢
 *   ③ 表不存在 / 读失败 → 降级为「全开」，避免一次部署顺序把已上线功能藏起来
 *   ④ 平台管理员（role=admin）不受客户配置限制，一律视为开启
 *
 * 权限分层：
 *   - 开关（enabled）：只有管理员能写 → setModuleFlag
 *   - 参数（config） ：客户主账号可写 → setModuleConfig
 */
import { reactive } from 'vue'
import { supabase } from '@/utils/supabase'
import {
  MODULE, MODULES, DEFAULT_ON, foldDeps, foldedBy,
} from '@/config/modules'

/** 兼容旧引用 */
export const MODULE_PAYOUT = MODULE.PAYOUT

/** 允许客户自行修改的参数白名单（不在名单里的 key 一律拒绝） */
const CONFIG_WHITELIST = {
  [MODULE.PAYOUT]: ['method', 'note'],
  [MODULE.REPORT]: ['caliber'],
  [MODULE.ROUTE]: [],
  [MODULE.RECURRING]: ['pattern'],
  [MODULE.WAYBILL]: [],
}

export const moduleFlags = reactive({
  /* —— 兼容旧代码的扁平字段（= effective） —— */
  payout: false,
  waybill: true,
  route: false,
  recurring: false,
  report: false,
  /* —— 新结构 —— */
  intent: {},      // 库里读出来的原始 enabled
  effective: {},   // 依赖折叠后的有效状态
  config: {},      // module_key -> config 对象
  folded: {},      // 被父模块折叠掉的子模块 -> 缺哪些依赖
  loaded: false,
  failed: false,
})

export const moduleOwner = (u) => (u && (u.masterAccount || u.account)) || ''

/**
 * 是否处于「平台管理员模拟客户」状态
 * 判定依据与 Dashboard 的 isImpersonatingAdmin 一致：
 *   originalUser 是 admin，而 currentUser 已经被换成 customer
 */
export const isImpersonating = () => {
  try {
    const orig = JSON.parse(localStorage.getItem('originalUser') || 'null')
    const cur = JSON.parse(localStorage.getItem('currentUser') || 'null')
    return !!(orig && orig.role === 'admin' && cur && cur.role === 'customer')
  } catch (e) {
    return false
  }
}

/**
 * 平台管理员：能配置流程
 * ⭐ 包含「管理员模拟客户」的情况 —— 否则模拟进去就变成只读，
 *    服务商根本没法给客户配置（这是之前的 bug）
 */
export const isFlowAdmin = (u) => {
  if (u && u.role === 'admin') return true
  return isImpersonating()
}

export const currentUserForModules = () => {
  try { return JSON.parse(localStorage.getItem('currentUser') || 'null') } catch { return null }
}

let _task = null

/** 把计算结果同步到扁平字段，供老代码直接读 moduleFlags.payout */
function applyEffective(eff, intent, configs, folded) {
  moduleFlags.intent = intent
  moduleFlags.effective = eff
  moduleFlags.config = configs
  moduleFlags.folded = folded || {}
  MODULES.forEach((m) => {
    if (m.key in moduleFlags) moduleFlags[m.key] = eff[m.key] === true
  })
}

/** 全开（管理员 / 读失败兜底） */
function applyAllOn(configs = {}) {
  const eff = {}
  MODULES.forEach((m) => { eff[m.key] = true })
  applyEffective(eff, eff, configs, {})
}

/**
 * 读取一次并缓存（响应式 moduleFlags）
 * @param {object} user currentUser
 * @param {{force?: boolean}} opts
 */
export async function ensureModuleFlags(user, opts = {}) {
  const u = user || currentUserForModules()
  if (!u) return moduleFlags
  if (moduleFlags.loaded && !opts.force) return moduleFlags
  if (_task && !opts.force) return _task

  _task = (async () => {
    /* ⭐ 管理员本人 → 全开（要在菜单里看到所有功能）；
       但「管理员模拟客户」要读客户的真实配置，否则画布看不出哪些真开着 */
    if (isFlowAdmin(u) && !isImpersonating()) {
      applyAllOn()
      moduleFlags.failed = false
      moduleFlags.loaded = true
      return moduleFlags
    }

    const owner = moduleOwner(u)
    if (!owner) {
      /* 没有主账号信息，按默认值走：运单开、其余关 */
      const intent = {}
      DEFAULT_ON.forEach((k) => { intent[k] = true })
      applyEffective(foldDeps(intent), intent, {}, {})
      moduleFlags.loaded = true
      return moduleFlags
    }

    try {
      const { data, error } = await supabase
        .from('tenant_modules')
        .select('module_key,enabled,config')
        .eq('owner_account', owner)
      if (error) throw error

      const intent = {}
      const configs = {}
      ;(data || []).forEach((r) => {
        if (!r || !r.module_key) return
        intent[r.module_key] = r.enabled === true
        configs[r.module_key] = r.config || {}
      })
      /* 没记录的模块不在 intent 里 → foldDeps 会按 defaultOn 兜底 */
      const eff = foldDeps(intent)
      applyEffective(eff, intent, configs, foldedBy(intent, eff))
      moduleFlags.failed = false
    } catch (e) {
      console.warn('[模块开关] 读取失败，按全开降级（请先执行 sql/2026-10-20_flow_modules.sql）', e)
      /* 本地调试钩子：window.__MOCK_FLAGS = { payout:false } 可以模拟「部分模块关闭」，
         只在读库失败的降级分支生效，生产连得上库时永远不会走到这里 */
      const mock = typeof window !== 'undefined' ? window.__MOCK_FLAGS : null
      if (mock && typeof mock === 'object') {
        const eff = foldDeps(mock)
        applyEffective(eff, mock, {}, {})
      } else {
        applyAllOn()
      }
      moduleFlags.failed = true
    } finally {
      moduleFlags.loaded = true
    }
    return moduleFlags
  })()

  return _task
}

/**
 * 开关（仅管理员）：upsert 一行 enabled
 * ⚠️ 只改这一个 module_key，**不动子模块**（依赖靠 foldDeps 运行时折叠）
 */
/**
 * 开关
 * ============================================================
 * 权限分层（2026-10-20 调整）：
 *   · 服务商 / 平台管理员：任何模块都能开关
 *   · 客户主账号：**只能开关「管理员给他配置过」的模块**
 *     —— 判断依据是该 module_key 在 tenant_modules 里有没有记录。
 *        没记录 = 服务商没卖这项，客户不能自助开启。
 */
export async function setModuleFlag(key, enabled, user) {
  const u = user || currentUserForModules()
  const owner = moduleOwner(u)

  if (!isFlowAdmin(u)) {
    if (!u) throw new Error('未登录')
    await ensureModuleFlags(u)
    if (!Object.prototype.hasOwnProperty.call(moduleFlags.intent || {}, key)) {
      throw new Error('该功能尚未开通，请联系您的服务顾问')
    }
  }
  if (!owner) throw new Error('找不到主账号，无法保存模块开关')

  const { error } = await supabase
    .from('tenant_modules')
    .upsert(
      {
        owner_account: owner,
        module_key: key,
        enabled: !!enabled,
        updated_by: u.name || u.account || '',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'owner_account,module_key' }
    )
  if (error) throw error

  await ensureModuleFlags(u, { force: true })
  return moduleFlags
}

/**
 * 参数（客户主账号可写）
 * ⚠️ 只允许白名单字段，且必须先确认模块已开通
 */
export async function setModuleConfig(key, patch, user) {
  const u = user || currentUserForModules()
  if (!u) throw new Error('未登录')

  await ensureModuleFlags(u)
  if (moduleFlags.effective[key] !== true) {
    throw new Error('该模块未开通，无法修改参数')
  }

  const allow = CONFIG_WHITELIST[key] || []
  const clean = {}
  Object.keys(patch || {}).forEach((k) => {
    if (allow.includes(k)) clean[k] = patch[k]
  })
  if (!Object.keys(clean).length) throw new Error('没有可保存的参数')

  const owner = moduleOwner(u)
  const next = { ...(moduleFlags.config[key] || {}), ...clean }

  const { error } = await supabase
    .from('tenant_modules')
    .upsert(
      {
        owner_account: owner,
        module_key: key,
        config: next,
        updated_by: u.name || u.account || '',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'owner_account,module_key' }
    )
  if (error) throw error

  await ensureModuleFlags(u, { force: true })
  return moduleFlags
}

/** 某个模块现在能不能用（模块开 且 人有权限） */
export function canUse(key, perms = []) {
  if (moduleFlags.effective[key] !== true) return false
  const m = MODULES.find((x) => x.key === key)
  if (!m || !m.perm) return true
  return Array.isArray(perms) && perms.includes(m.perm)
}
