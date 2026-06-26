import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import './style.css'                    // ← 保留你的全局样式
import App from './App.vue'
import router from './router'
import { supabase } from './utils/supabase'

// 1. 导入中文语言包和 dayjs
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'

// 2. 设置 dayjs 全局语言为中文
dayjs.locale('zh-cn')

// 3. 导入并注册所有图标
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

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
// 测试 Supabase 连接（临时）
supabase.from('vehicles').select('*', { count: 'exact', head: true })
  .then(({ error }) => {
    if (error) {
      console.error('❌ Supabase 连接失败:', error.message)
    } else {
      console.log('✅ Supabase 连接成功！')
    }
  })