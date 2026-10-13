// src/utils/supabase.js
import cloudbase from '@cloudbase/js-sdk'

const ENV_ID = 'wuxian-token-d0guymjkpadcd1f22'

// ❌ 去掉固定 accessKey，改用 signInAnonymously()
const app = cloudbase.init({
  env: ENV_ID,
  region: 'ap-shanghai',
})

// 导出数据库实例和认证对象
export const supabase = app.rdb()
export const auth = app.auth()

// 👇 新增：确保每台设备都有匿名登录态
export const ensureAnonymousLogin = async () => {
  try {
    const loginState = await auth.getLoginState()
    if (loginState && loginState.user) {
      // 已有登录态，直接返回
      return loginState
    }
    // 没有登录态 → 匿名登录
    const result = await auth.signInAnonymously()
    console.log('[匿名登录] 成功:', result)
    return result
  } catch (err) {
    console.error('[匿名登录] 失败:', err)
    throw err
  }
}

export default app