import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      // ⚠️ 顺序很重要：/api-dongfeng 必须放在 /api 前面
      // 因为 Vite 的代理是「前缀匹配」，按书写顺序依次匹配
      '/api-dongfeng': {
        target: 'http://clw.dfcv.com.cn',
        changeOrigin: true,
        secure: false,
        rewrite: (p) =>
          p.replace(/^\/api-dongfeng/, '/api/dongfeng/dataforward/forward'),
      },

      // 原有的 /api 代理（转发到 Vercel）
      '/api': {
        target: 'https://my-cd-six.vercel.app',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, '/api'),
      },
    },
  },
})