// src/utils/supabase.js
import cloudbase from '@cloudbase/js-sdk'

const ENV_ID = 'wuxian-token-d0guymjkpadcd1f22'

const app = cloudbase.init({
  env: ENV_ID,
  // 注意：这里不传 accessKey
  // 匿名登录会自动处理凭证
})

// 关键：先匿名登录，再导出数据库实例
const auth = app.auth()

try {
  const loginState = await auth.getLoginState()
  if (!loginState) {
    await auth.signInAnonymously()
    console.log('[CloudBase] ✅ 匿名登录成功')
  } else {
    console.log('[CloudBase] ✅ 已有登录态')
  }
} catch (e) {
  console.error('[CloudBase] ❌ 匿名登录失败:', e)
}

export const supabase = app.rdb()
export { auth }
export default app