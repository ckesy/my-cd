import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

/* ============================================================
   代码混淆（可选，默认关闭）
   ------------------------------------------------------------
   ⚠️ 先说清定位：混淆**防不了密钥泄露**。
      密钥是字符串常量，混淆后仍可被 `strings dist/*.js | grep -E '[a-f0-9]{32}'`
      提取出来。混淆真正的价值是抬高「业务逻辑被整段抄走」的成本。
      密钥安全的唯一解法是「外置 + 服务端鉴权 + 出口白名单」。

   用法
     npm run build       # 常规构建，不混淆
     npm run build:obf   # 开启混淆

   为什么默认关
     混淆会让产物体积 +40%~70%、首屏解析慢 10%~30%，且线上报错堆栈不可读。
     建议先 `npm run build:obf && npm run preview` 手工回归一轮，
     确认无运行时报错后，再考虑常态化（届时把 build 脚本改成 build:obf）。
   ============================================================ */

const OBFUSCATE = process.env.OBFUSCATE === '1'

let Obfuscator = null
if (OBFUSCATE) {
  try {
    Obfuscator = require('javascript-obfuscator')
  } catch (e) {
    console.warn('[obfuscate] 未安装 javascript-obfuscator，已跳过混淆')
    Obfuscator = null
  }
}

/**
 * 只混淆「包含 src/utils 或 src/api 模块」的 chunk。
 * 命中这类模块的通常是主 chunk —— 首屏代价就在这里，故配置取保守档：
 * 轻度控制流平坦化 + 字符串数组加密 + 标识符重命名，不开死代码注入/自我防护。
 */
function obfuscateBusinessLogic() {
  return {
    name: 'obfuscate-business-logic',
    apply: 'build',
    enforce: 'post',
    renderChunk(code, chunk) {
      if (!Obfuscator) return null
      const mods = Object.keys(chunk.modules || {})
      const touchesBusiness = mods.some((m) => /\/src\/(utils|api)\//.test(m))
      if (!touchesBusiness) return null
      try {
        const out = Obfuscator.obfuscate(code, {
          compact: true,
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.35,
          deadCodeInjection: false,
          debugProtection: false,
          disableConsoleOutput: false,
          identifierNamesGenerator: 'hexadecimal',
          renameGlobals: false,
          selfDefending: false,
          simplify: true,
          splitStrings: true,
          splitStringsChunkLength: 8,
          stringArray: true,
          stringArrayEncoding: ['base64'],
          stringArrayThreshold: 0.5,
          transformObjectKeys: false,
          unicodeEscapeSequence: false,
          sourceMap: false,
          target: 'browser',
          /* 保护 Vue 运行时依赖的内部标识符，避免混淆后渲染异常 */
          reservedNames: ['^__', '^_ctx$', 'createElementVNode', 'createVNode', 'defineComponent'],
        })
        return { code: out.getObfuscatedCode(), map: null }
      } catch (e) {
        console.warn(`[obfuscate] ${chunk.fileName} 混淆失败，保留原样：`, (e && e.message) || e)
        return null
      }
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), obfuscateBusinessLogic()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    /* 混淆后 sourcemap 无意义且会泄露结构，统一关闭 */
    sourcemap: false,
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
