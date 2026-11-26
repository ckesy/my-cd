/**
 * 数据大屏遥控 · 执行层（composable）
 * ============================================================
 * 大屏页面挂上这个之后，就具备「被小程序接管」的能力：
 *   注册 → 长轮询（12s/轮）→ 取到指令 → 交给页面执行 → 回执 → 继续
 *
 * ⭐ 为什么要长轮询而不是短轮询：见《大屏遥控方案》§3.3。
 *    一次挂 12 秒，指令一到立刻返回，延迟 1 秒内、请求量只有短轮询的 1/4。
 *
 * ⚠️ 三条易踩的坑
 *   ① 循环不能用 `while(true)` 直接 await：页面卸载后仍在跑，切页会累积多个循环，
 *      同一条指令被执行两遍。这里用 setTimeout 串起来，卸载即停。
 *   ② 失败必须退避（3s 起，最长 20s），否则网关抖动时会打出一串 500。
 *   ③ 执行异常也要 ack（ok:false）—— 不回执的话，小程序那边永远显示「发送中」。
 * ============================================================
 */

import { ref, onMounted, onBeforeUnmount } from 'vue'
import { ensureScreenId, screenRegister, screenPull, screenAck } from '@/utils/screenClient'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * @param {object} o
 * @param {'fleet'|'fee'} o.page        当前大屏页
 * @param {object} o.handlers           动作名 → 执行函数，返回 {ok, error?}
 * @param {(info:object)=>void} [o.onRemote]  收到远端指令时的回调（顶部提示条）
 * @param {()=>boolean} [o.enabled]     是否启用（无权限时不轮询）
 */
export function useScreenControl({ page = 'fleet', handlers = {}, onRemote = null, enabled = null } = {}) {
  const screenId = ensureScreenId()
  const pageRef = ref(page)
  /** 通道是否通（仅表示最近一次 pull 成功，不代表大屏在场） */
  const connected = ref(false)
  /** 最近一次收到指令的时间，页面可用来判断「刚被遥控过」 */
  const lastCommandAt = ref(0)

  let stopped = false
  let timer = null
  let retryDelay = 3000
  let skipCommandId = ''

  function schedule(ms) {
    if (timer) clearTimeout(timer)
    if (stopped) return
    timer = setTimeout(tick, Math.max(0, ms || 0))
  }

  async function runCommand(cmd) {
    const started = Date.now()
    lastCommandAt.value = started

    /* 提示条先出，用户才知道画面为什么自己动了 */
    try {
      if (typeof onRemote === 'function') {
        onRemote({ action: cmd.action, payload: cmd.payload || {}, by: cmd.by || '' })
      }
    } catch (e) {
      console.warn('[screen-control] onRemote 回调异常:', e && e.message)
    }

    let res = { ok: true }
    const fn = handlers[cmd.action]
    if (typeof fn !== 'function') {
      res = { ok: false, error: `当前页面不支持指令 ${cmd.action}` }
    } else {
      try {
        res = (await fn(cmd.payload || {})) || { ok: true }
      } catch (e) {
        res = { ok: false, error: String((e && e.message) || '执行失败') }
      }
    }

    /* ⭐ 记下已执行的 id：万一 ack 丢了、服务端还是 pending，下一轮别重复执行 */
    skipCommandId = cmd.commandId

    await screenAck({
      screenId,
      commandId: cmd.commandId,
      ok: res.ok !== false,
      ms: Date.now() - started,
      error: res.error || '',
      page: pageRef.value,
    }).catch(() => { /* ack 失败不影响继续轮询 */ })
  }

  async function tick() {
    if (stopped) return

    const r = await screenPull({
      screenId,
      page: pageRef.value,
      wait: 12,
      skipCommandId,
    })

    if (stopped) return

    if (r && Number(r.code) === 0) {
      connected.value = true
      retryDelay = 3000
      if (r.command) await runCommand(r.command)
      schedule(0)
      return
    }

    /* 1002 = 会话失效，轮询下去也没意义，等用户重新登录后刷新页面 */
    if (r && Number(r.code) === 1002) {
      connected.value = false
      console.warn('[screen-control] 会话失效，停止轮询')
      return
    }

    connected.value = false
    console.warn(`[screen-control] 拉取失败(${r && r.code})，${retryDelay}ms 后重试：`, r && r.message)
    schedule(retryDelay)
    retryDelay = Math.min(Math.round(retryDelay * 1.8), 20000)
  }

  onMounted(async () => {
    if (typeof enabled === 'function' && !enabled()) return

    /* 注册失败不阻断：可能只是首次冷启动，pull 成功同样能刷新 last_seen 与页面 */
    const reg = await screenRegister(pageRef.value)
    if (reg && Number(reg.code) === 0) connected.value = true
    else if (reg) console.warn('[screen-control] 注册失败：', reg.code, reg.message)

    schedule(0)
  })

  onBeforeUnmount(() => {
    stopped = true
    if (timer) clearTimeout(timer)
  })

  /** 切页时调用：下一次 pull 与 ack 都会带上新页，小程序 15s 内能看到 */
  function setPage(p) {
    pageRef.value = p === 'fee' ? 'fee' : 'fleet'
  }

  return { screenId, connected, lastCommandAt, setPage }
}
