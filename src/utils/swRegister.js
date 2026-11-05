/**
 * Service Worker 注册
 * ------------------------------------------------------------
 * 背景见 public/sw.js 顶部注释：托管平台强制 no-store，用 SW 的 Cache Storage
 * 给 /assets/* 做本地缓存，让第二次打开不再重下 2.3MB。
 *
 * 几个刻意的选择：
 *   · 只在生产构建注册（dev 下开着 SW，改代码刷新看不到效果，会耽误调试）
 *   · 等 window.load 之后再注册，不跟首屏抢带宽
 *   · 注册失败只打 warn，绝不阻塞登录和业务（最差就是回到"每次都重新下载"）
 *   · localStorage 里 sw_off = '1' 可一键停用并清掉缓存，出问题不用发版
 */

const OFF_KEY = 'sw_off'

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  if (!import.meta.env.PROD) return

  let off = false
  try { off = localStorage.getItem(OFF_KEY) === '1' } catch (e) { /* ignore */ }

  if (off) {
    /* 停用：注销 SW + 清空缓存，下一次打开恢复成"走原生网络" */
    navigator.serviceWorker.getRegistrations()
      .then((list) => list.forEach((r) => r.unregister()))
      .catch(() => {})
    if (typeof caches !== 'undefined') {
      caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {})
    }
    return
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        /* 顺手检查一次更新（sw.js 改了策略时能尽快生效） */
        reg.update().catch(() => {})
      })
      .catch((e) => {
        console.warn('[SW] 注册失败，静态资源回退到原生网络：', e && e.message)
      })
  })
}
