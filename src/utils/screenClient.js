/**
 * 数据大屏遥控 · 调用层
 * ============================================================
 * 大屏页面 ↔ screen-hub 云函数。
 *
 * ⭐ 身份只用 ai-token 签发的 sessionToken；前端**永远不传** tenant / account。
 * ⭐ Web 走 HTTP 网关（小程序端不用本模块：遥控方向是小程序 → 大屏，
 *    大屏只有 Web）。
 * ⭐ pull 是长轮询（默认挂 12s），超时必须给到 16s 以上，
 *    否则前端先超时、指令还在路上，表现为「点了没反应」。
 */

import { getAiToken, resumeAiToken } from '@/utils/aiClient'

const API_BASE = 'https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com'

const isMp = () => typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.callFunction === 'function'

async function postJson(path, body, timeoutMs) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${String(text).slice(0, 120)}`)
  try {
    return JSON.parse(text)
  } catch (e) {
    return { code: 1500, message: '返回格式异常' }
  }
}

/**
 * 统一调用
 * ------------------------------------------------------------
 * ⚠️ 走 /ai-gateway 而不是独立函数：CloudBase 的系统默认域名不允许 CLI
 *    新增 HTTP 路由，独立函数拿不到 Web 可访问地址。屏控作为网关的一个
 *    action（`action:'screen'`）下发，鉴权和租户都由网关算好。
 * @param {string} op register|attach|release|pull|ack|state
 * @param {object} body
 * @param {number} timeoutMs
 */
async function call(op, body, timeoutMs = 15000) {
  let token = getAiToken()
  if (!token) {
    const r = await resumeAiToken()
    if (r.ok) token = getAiToken()
  }
  if (!token) return { code: 1002, message: '还没建立会话，请重新登录' }

  const payload = Object.assign({ action: 'screen', op, sessionToken: token }, body || {})
  try {
    const data = isMp()
      ? (await wx.cloud.callFunction({ name: 'ai-gateway', data: payload })).result
      : await postJson('/ai-gateway', payload, timeoutMs)
    return data || { code: 1500, message: '空返回' }
  } catch (e) {
    const timeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError')
    return { code: timeout ? 3001 : 5001, message: timeout ? '请求超时' : '网络不太通' }
  }
}

/* ============================================================
   屏幕标识
   ------------------------------------------------------------
   ⭐ screen_id 必须持久化：刷新页面不能变，否则屏会变成「新屏」，
      小程序那边刚接管的对象就消失了。
   ⚠️ 清浏览器缓存会丢，此时屏会以新 id 重新注册，需要在小程序重新接管
      （不影响使用，只是「上次选择的那块屏」记忆失效）。
   ============================================================ */
const ID_KEY = 'screen_device_id'
const NAME_KEY = 'screen_device_name'

export function ensureScreenId() {
  let id = ''
  try { id = localStorage.getItem(ID_KEY) || '' } catch (e) { id = '' }
  if (/^scr_[A-Za-z0-9_-]{4,48}$/.test(id)) return id
  id = 'scr_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-6)
  try { localStorage.setItem(ID_KEY, id) } catch (e) { /* 隐私模式忽略 */ }
  return id
}

export function getScreenName() {
  try { return localStorage.getItem(NAME_KEY) || '数据大屏' } catch (e) { return '数据大屏' }
}

export function setScreenName(name) {
  const n = String(name || '').trim().slice(0, 40)
  if (!n) return
  try { localStorage.setItem(NAME_KEY, n) } catch (e) { /* 忽略 */ }
}

/* ============================================================
   动作
   ============================================================ */

/** 大屏打开/刷新时注册（幂等），返回 {screenId, name, page} */
export const screenRegister = (kind = 'fleet') =>
  call('register', { screenId: ensureScreenId(), name: getScreenName(), kind }, 12000)

/** 大屏长轮询取指令；wait 建议 12（服务端硬上限 12） */
export const screenPull = ({ screenId, page, wait = 12, skipCommandId = '' }) =>
  call('pull', { screenId, page, wait, skipCommandId }, 17000)

/** 回执 */
export const screenAck = ({ screenId, commandId, ok, ms, error }) =>
  call('ack', { screenId, commandId, ok, ms, error }, 10000)

/** 小程序用：自动匹配接管（大屏端不会调用） */
export const screenAttach = (screenId) => call('attach', screenId ? { screenId } : {}, 12000)

/** 小程序用：交还 */
export const screenRelease = (screenId) => call('release', { screenId }, 10000)

/** 小程序用：轮询屏状态 */
export const screenState = (screenId) => call('state', { screenId }, 10000)
