/* ============================================================
 * Service Worker：给静态资源加一层本地缓存
 * ------------------------------------------------------------
 * 为什么需要它：
 *   CloudBase 的 webapps.tcloudbase.com 是共享域名，网关（tcbgw）会给**所有**
 *   响应强行加上 `cache-control: no-store`，控制台也没有缓存配置入口。
 *   结果是每次打开都要重新下载 2.3MB 的 JS/CSS。
 *   SW 用的是 Cache Storage（一套 JS API），不受 HTTP 缓存头约束，能绕过它。
 *
 * 策略（只有两条，故意做得简单）：
 *   ① /assets/*.js|css  → CacheFirst。文件名带 hash，命中即可用，永不取错版本。
 *   ② 页面导航（刷新/首次进入）→ NetworkFirst。保证 index.html 永远是最新的，
 *      于是新版本发布后用户下次打开自动就是新版，**不需要点任何提示**。
 *
 * 版本怎么更新：
 *   - 不依赖 sw.js 内容变化，所以没有"等待新版本"那一套。
 *   - 新 JS 文件名变了 → 缓存未命中 → 自动取新的。
 *   - 旧文件会留在缓存里，攒多了影响不大（每个版本约 2MB），
 *     真要清理就改 CACHE 版本号，activate 时会把旧缓存全删掉。
 * ============================================================ */

const CACHE = 'my-cd-static-v1'

/* 只缓存构建产物：这些文件名带 hash，内容变了名字必然变 */
const ASSET_RE = /^\/assets\/[^/]+\.(?:js|css|woff2?|ttf|png|jpe?g|svg|gif|webp)$/

/* 装好立刻接管，避免"新 SW 一直在等待" */
self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    /* 清掉旧版本缓存（改 CACHE 名字时生效） */
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  let url
  try { url = new URL(req.url) } catch (e) { return }
  /* 跨域一律不碰：CloudBase 数据库、高德、东风接口都走原生网络 */
  if (url.origin !== self.location.origin) return

  /* ① 构建产物：缓存优先 */
  if (ASSET_RE.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE)
      const hit = await cache.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res && res.ok) {
        /* 源站带 no-store，Cache.put 在个别浏览器上可能拒绝，失败不影响本次响应 */
        try { await cache.put(req, res.clone()) } catch (e) { /* ignore */ }
      }
      return res
    })())
    return
  }

  /* ② 页面导航：网络优先，断网时用上一次的首页兜底 */
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req)
        if (res && res.ok) {
          const cache = await caches.open(CACHE)
          try { await cache.put('/', res.clone()) } catch (e) { /* ignore */ }
        }
        return res
      } catch (e) {
        const cache = await caches.open(CACHE)
        const cached = await cache.match('/')
        return cached || Response.error()
      }
    })())
  }
})
