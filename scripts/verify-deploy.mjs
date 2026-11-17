#!/usr/bin/env node
/**
 * 部署后自检
 * ============================================================
 * 为什么需要它：
 *   静态托管上传失败时不一定报错。2026-11-17 就出过一次——首页上去了，
 *   但它引用的 assets 全部缺失，访问者看到的是白屏，而部署日志显示"成功"。
 *   这个脚本把「部署后到底能不能用」变成一条可执行的检查。
 *
 * 检查项
 *   ① 首页可达，且引用的 js/css 全部 200、content-type 正确
 *   ② 主 bundle 里不含已知的敏感串（Token / 密钥 / 直连域名）
 *   ③ 网关地址已出现在产物中（证明前端确实走了中转）
 *
 * 用法
 *   node scripts/verify-deploy.mjs
 *   DEPLOY_BASE_URL=https://xxx.com node scripts/verify-deploy.mjs
 * ============================================================
 */
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const BASE = (
  process.env.DEPLOY_BASE_URL ||
  'https://wuxian-token-d0guymjkpadcd1f22-1447716425.tcloudbaseapp.com'
).replace(/\/+$/, '')

/* 绝不允许出现在线上的字符串 */
const FORBIDDEN = [
  ['c40c7311', '东风 Token'],
  ['491d5475803e65c06ba6169bdaf3e1f3', '高德 Web 服务 Key'],
  ['dfcvyl.dfcv.com.cn', '东风接口直连域名'],
]

const REQUIRED_IN_BUNDLE = ['dongfeng-track']

const TIMEOUT = 20000

function readLocalIndex() {
  const p = path.join(ROOT, 'dist', 'index.html')
  if (!fs.existsSync(p)) {
    console.error('✖ 未找到 dist/index.html，请先执行 npm run build')
    process.exit(1)
  }
  return fs.readFileSync(p, 'utf8')
}

function extractRefs(html) {
  const out = new Set()
  const re = /(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g
  let m
  while ((m = re.exec(html)) !== null) out.add(m[1])
  return [...out]
}

async function get(url, asText = false) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT)
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    })
    const body = asText ? await res.text() : null
    return { ok: res.ok, status: res.status, type: res.headers.get('content-type') || '', body }
  } catch (e) {
    return { ok: false, status: 0, type: '', body: null, error: e.message }
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  console.log(`\n🔍 部署自检：${BASE}\n`)
  const html = readLocalIndex()
  const refs = extractRefs(html)

  if (!refs.length) {
    console.error('✖ dist/index.html 里没解析到任何 /assets/ 引用，构建产物异常')
    process.exit(1)
  }

  let failed = 0

  /* ① 首页 + 资源可达性 */
  const home = await get(`${BASE}/?t=${Date.now()}`, true)
  if (!home.ok) {
    console.error(`✖ 首页不可达 → HTTP ${home.status}`)
    failed++
  } else if (!/<!doctype html>/i.test(home.body || '')) {
    console.error('✖ 首页返回内容不是 HTML，可能被重定向或回退')
    failed++
  } else {
    console.log(`✅ 首页可达（${home.status}）`)
  }

  for (const ref of refs) {
    const r = await get(`${BASE}${ref}?t=${Date.now()}`)
    const isJs = ref.endsWith('.js')
    const expect = isJs ? /javascript|ecmascript/i : /text\/css/i
    if (!r.ok) {
      console.error(`✖ ${ref} → HTTP ${r.status}${r.error ? ` (${r.error})` : ''}`)
      failed++
    } else if (!expect.test(r.type)) {
      console.error(`✖ ${ref} → content-type 异常：${r.type}（大概率是 SPA 回退，文件实际不存在）`)
      failed++
    } else {
      console.log(`✅ ${ref}（${r.type.split(';')[0]}）`)
    }
  }

  /* ② 主 bundle 敏感串检查 */
  const mainRef = refs.find((r) => /\/assets\/index-[^/]+\.js$/.test(r))
  if (!mainRef) {
    console.error('✖ 未找到主 bundle（/assets/index-*.js）')
    failed++
  } else {
    const r = await get(`${BASE}${mainRef}?t=${Date.now()}`, true)
    if (!r.ok || !r.body) {
      console.error(`✖ 主 bundle 拉取失败 → HTTP ${r.status}`)
      failed++
    } else {
      for (const [needle, label] of FORBIDDEN) {
        if (r.body.includes(needle)) {
          console.error(`✖ 主 bundle 中仍含 ${label}（${needle.slice(0, 8)}…）`)
          failed++
        } else {
          console.log(`✅ 不含 ${label}`)
        }
      }
      for (const needle of REQUIRED_IN_BUNDLE) {
        if (r.body.includes(needle)) {
          console.log(`✅ 已接入网关 ${needle}`)
        } else {
          console.error(`✖ 主 bundle 中找不到 ${needle}，前端可能没走网关`)
          failed++
        }
      }
    }
  }

  console.log('')
  if (failed) {
    console.error(`❌ 自检未通过：${failed} 项异常\n`)
    process.exit(1)
  }
  console.log('✅ 自检全部通过\n')
}

main().catch((e) => {
  console.error('自检脚本异常：', e)
  process.exit(1)
})
