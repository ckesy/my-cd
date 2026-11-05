#!/usr/bin/env node
/**
 * 静态托管缓存体检
 * ============================================================
 * 用法：node scripts/check-cache.mjs https://your-domain.com
 *
 * 直接抓线上响应头，回答三个问题：
 *   ① index.html 是不是 no-cache（该是）
 *   ② /assets/*.js|css 有没有 max-age（该有，一年 + immutable）
 *   ③ 中间是不是有 CDN 命中（x-cache / age）
 *
 * 判据：
 *   · 无 cache-control  → 浏览器只能"启发式缓存"，刚上传的文件约等于每次都回源 ★问题根源
 *   · no-cache / max-age=0 → 每次都要跟服务器校验（HTML 应该这样，assets 不该）
 *   · max-age>0 + immutable → 真正的强缓存，第二次不再发请求
 */
const base = (process.argv[2] || '').replace(/\/+$/, '')
if (!base) {
  console.error('用法: node scripts/check-cache.mjs https://your-domain.com')
  process.exit(1)
}

const HEADERS = ['cache-control', 'etag', 'last-modified', 'age', 'x-cache', 'x-cache-lookup', 'server', 'content-length']

async function probe(url) {
  const t0 = Date.now()
  let res
  try {
    res = await fetch(url, { headers: { 'cache-control': 'no-cache' } })
  } catch (e) {
    console.log(`\n✗ ${url}\n  请求失败: ${e.message}`)
    return null
  }
  const body = res.status === 200 ? await res.text() : ''
  const h = {}
  HEADERS.forEach((k) => { const v = res.headers.get(k); if (v) h[k] = v })
  console.log(`\n${res.status} ${url}  (${Date.now() - t0}ms)`)
  Object.entries(h).forEach(([k, v]) => console.log(`   ${k}: ${v}`))

  const cc = (h['cache-control'] || '').toLowerCase()
  let verdict
  if (!cc) verdict = '⚠ 没有 cache-control —— 浏览器只能启发式缓存，基本等于每次都重新下载'
  else if (/immutable|max-age=(\d{4,})/.test(cc)) verdict = '✓ 强缓存，第二次不会发请求'
  else if (/no-store/.test(cc)) verdict = '✗ no-store，永不缓存'
  else if (/no-cache|max-age=0|must-revalidate/.test(cc)) verdict = '○ 每次带 ETag 校验（命中返回 304，HTML 的预期行为）'
  else verdict = '○ 有缓存但不长'
  console.log(`   → ${verdict}`)
  return { url, body, h, cc }
}

const root = await probe(`${base}/`)
const html = root?.body || ''

// 从 HTML 里抽出构建产物（vite 出来带 hash 的 /assets/xxx.js|css）
const assets = [...new Set(html.match(/\/assets\/[A-Za-z0-9._-]+\.(?:js|css)/g) || [])]
if (!assets.length) {
  console.log('\n没从 HTML 里解析到 /assets/ 资源，可能不是 Vite 产物或首页是登录页兜底。')
}

for (const a of assets.slice(0, 6)) await probe(`${base}${a}`)

console.log(`
────────────────────────────────────────────
结论怎么看：
  · index.html 是 no-cache（每版都能立刻生效）→ 正常，别改
  · /assets/* 出现「没有 cache-control」或 no-cache → 就是"第二次仍全量下载"的原因
    修法：给 /assets/ 配 public, max-age=31536000, immutable
  · 配完必须刷 CDN 缓存，否则旧规则要等过期才换
`)
