import { defineConfig, loadEnv } from 'vite'
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

/**
 * 构建前校验必需的环境变量。
 *
 * 为什么需要：VITE_ 变量缺失时 Vite 不会报错，只会把 `import.meta.env.XXX` 变成
 * undefined —— 于是构建「成功」、部署也「成功」，线上却白屏或地图全空，
 * 排查成本极高。这里让问题在构建阶段就暴露。
 *
 * 同时兼容两种来源：本地 .env 文件、CI 流水线的环境变量。
 */
function requireBuildEnv(env) {
  const REQUIRED = [
    ['VITE_SUPABASE_URL', 'CloudBase 网关地址，缺了整站连不上数据库'],
    ['VITE_SUPABASE_ANON_KEY', 'CloudBase 匿名密钥，缺了整站连不上数据库'],
    ['VITE_AMAP_KEY', '高德 JS API Key，缺了所有地图空白'],
    ['VITE_AMAP_SECURITY_CODE', '高德安全密钥，缺了地图初始化直接报错'],
  ]
  return {
    name: 'require-build-env',
    apply: 'build',
    configResolved() {
      const missing = REQUIRED.filter(([k]) => !String(env[k] || '').trim())
      if (!missing.length) return
      const list = missing.map(([k, why]) => `  · ${k}  —— ${why}`).join('\n')
      throw new Error(
        `\n构建中止：缺少 ${missing.length} 个必需的环境变量\n\n${list}\n\n` +
          `  本地开发：写入 .env（参考 .env.example）\n` +
          `  CI 构建：在流水线的环境变量中配置\n\n`
      )
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  /* 合并 .env 文件与进程环境变量：CI 里通常只设后者 */
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }

  return {
    plugins: [vue(), requireBuildEnv(env), obfuscateBusinessLogic()],
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
  }
})
