/**
 * 客户级功能模块开关
 * ============================================================
 * 锚点表：tenant_modules（owner_account + module_key 唯一）
 * 约定：
 *   - **没有记录 = 未开通**（"不配置就没有"）
 *   - 表不存在 / 读失败 → 降级为「开启」，避免一次部署顺序问题把已上线功能藏起来，
 *     同时 `failed=true` 让设置页提示先执行迁移 SQL
 *   - 平台管理员（role=admin）不受客户配置限制，一律视为开启
 * 以后加模块：module_key 加一个常量，前端 ensureModuleFlags 里补一行即可。
 */
import { reactive } from 'vue'
import { supabase } from '@/utils/supabase'

export const MODULE_PAYOUT = 'payout'

export const moduleFlags = reactive({
  payout: false,
  loaded: false,
  failed: false,
})

export const moduleOwner = (u) => (u && (u.masterAccount || u.account)) || ''

const isAdminUser = (u) => !!u && u.role === 'admin'

export const currentUserForModules = () => {
  try { return JSON.parse(localStorage.getItem('currentUser') || 'null') } catch { return null }
}

let _task = null

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
    if (isAdminUser(u)) {
      moduleFlags.payout = true
      moduleFlags.failed = false
      moduleFlags.loaded = true
      return moduleFlags
    }

    const owner = moduleOwner(u)
    if (!owner) {
      moduleFlags.loaded = true
      return moduleFlags
    }

    try {
      const { data, error } = await supabase
        .from('tenant_modules')
        .select('module_key,enabled')
        .eq('owner_account', owner)
      if (error) throw error

      const row = (data || []).find((r) => r.module_key === MODULE_PAYOUT)
      /* 没配置 = 关闭 */
      moduleFlags.payout = !!(row && row.enabled === true)
      moduleFlags.failed = false
    } catch (e) {
      console.warn('[模块开关] 读取失败，按开启降级（请先执行 db_migration_modules_payment.sql）', e)
      moduleFlags.payout = true
      moduleFlags.failed = true
    } finally {
      moduleFlags.loaded = true
    }
    return moduleFlags
  })()

  return _task
}

/** 开关（设置页用）：upsert 一行，然后强制刷新缓存 */
export async function setModuleFlag(key, enabled, user) {
  const u = user || currentUserForModules()
  const owner = moduleOwner(u)
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

  if (key === MODULE_PAYOUT) moduleFlags.payout = !!enabled
  moduleFlags.failed = false
  moduleFlags.loaded = true
  return moduleFlags
}
