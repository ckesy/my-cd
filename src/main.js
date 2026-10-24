import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import './style.css'                    // ← 保留你的全局样式
import App from './App.vue'
import router from './router'
import { supabase, ensureAnonymousLogin } from './utils/supabase'
import { applyTheme, readLocalTheme, DEFAULT_THEME, loadRemoteTheme } from './utils/theme'

// 1. 导入中文语言包和 dayjs
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'

// 2. 设置 dayjs 全局语言为中文
dayjs.locale('zh-cn')

// 3. 导入并注册所有图标
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

/* ⭐ 先套主题再挂载：读 localStorage 的缓存，避免刷新时闪一下默认色
   ⭐ 2026-10-24：主题按**当前登录账号**取，同一浏览器多账号各看各的皮肤 */
const bootUser = (() => {
  try { return JSON.parse(localStorage.getItem('currentUser') || 'null') } catch { return null }
})()
applyTheme(readLocalTheme(bootUser && bootUser.account) || DEFAULT_THEME)

const app = createApp(App)

// 注册图标组件
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 使用 ElementPlus，并传入中文 locale
app.use(ElementPlus, {
  locale: zhCn,
})

app.use(router)
app.mount('#app')

/* 登录态存在时，从账号同步主题（换设备打开也是同一套皮肤） */
;(async () => {
  try {
    const u = JSON.parse(localStorage.getItem('currentUser') || 'null')
    if (!u) return
    const remote = await loadRemoteTheme(supabase, u)
    if (remote) applyTheme(remote)
  } catch (e) {
    /* 拿不到就用本地缓存 */
  }
})()
/* ============================================================
   ⭐ 启动即确保 CloudBase 匿名登录态
   ------------------------------------------------------------
   以前只在「登录页点登录」时才 signInAnonymously。
   用户下次直接进业务页（localStorage 里还有 currentUser，跳过登录），
   CloudBase 的登录态已经过期 → 所有查询 FetchError / 401，整站看起来"没数据"。
   ============================================================ */
ensureAnonymousLogin()
  .then(() => supabase.from('vehicles').select('*', { count: 'exact', head: true }))
  .then(({ error }) => {
    if (error) console.error('❌ 数据库查询失败:', error.message)
    else console.log('✅ 数据库连接成功')
  })
  .catch((e) => console.error('❌ 匿名登录失败:', e && (e.message || e)))