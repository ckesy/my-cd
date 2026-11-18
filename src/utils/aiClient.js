/**
 * AI 助手 · 调用层
 * ============================================================
 * 两个入口同一套接口：
 *   Web        POST <网关>/ai-gateway
 *   小程序      wx.cloud.callFunction({ name:'ai-gateway' })
 *
 * ⭐ 身份只用服务端签发的 sessionToken。
 *    前端**永远不传** account / tenant / 权限 —— 传了云函数也不认。
 *    token 由 ai-token 云函数在登录后签发，localStorage 里存一份。
 */

import { AI_CODE, AI_MSG, AI_STORAGE } from '@/config/aiConstants'

/* 外部常量全部兜底：模块解析异常时也不能让调用层崩 */
const CODE = (AI_CODE && typeof AI_CODE === 'object') ? AI_CODE : {}
const MSG = (AI_MSG && typeof AI_MSG === 'object') ? AI_MSG : {}
const STORAGE_KEY = (AI_STORAGE && AI_STORAGE.TOKEN) || 'ai_session_token'

const API_BASE = 'https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com'

const isMp = () => typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.callFunction === 'function'

/* ============================================================
   token 管理
   ============================================================ */
export const getAiToken = () => {
  try { return localStorage.getItem(STORAGE_KEY) || '' } catch (e) { return '' }
}

export const setAiToken = (t) => {
  try {
    if (t) localStorage.setItem(STORAGE_KEY, t)
    else localStorage.removeItem(STORAGE_KEY)
  } catch (e) { /* 忽略 */ }
}

export const clearAiToken = () => setAiToken('')

/**
 * 登录成功后再调，用相同的账号密码换一个服务端 token。
 * ⚠️ 失败不阻断登录流程 —— AI 助手是增强功能，不能因为网关挂了让人登不进来。
 * @returns {Promise<{ok:boolean, message?:string}>}
 */
export async function ensureAiToken(account, password) {
  if (!account || !password) return { ok: false, message: '缺少账号或密码' }
  /* ⚠️ 不检查本地是否已有 token：换账号登录时必须重签，否则会拿着上一个人的会话 */
  try {
    const data = await postJson('/ai-token', { account, password })
    if (data && data.code === 0 && data.token) {
      setAiToken(data.token)
      return { ok: true }
    }
    return { ok: false, message: (data && data.message) || 'AI 助手未开通' }
  } catch (e) {
    console.warn('[AI] 签发会话失败：', e && e.message)
    return { ok: false, message: '网络异常' }
  }
}

/* ============================================================
   底层请求
   ============================================================ */
async function postJson(path, body, timeoutMs = 20000) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`)
  try {
    return JSON.parse(text)
  } catch (e) {
    return { code: CODE.ERR_INTERNAL, message: '返回格式异常' }
  }
}

/* ============================================================
   提问
   ============================================================ */
/**
 * @param {{text:string, history?:Array<{role:string,content:string}>, sessionId?:string}} opts
 * @returns {Promise<{ok:boolean, answer:string, cards:Array, code:number, message?:string, usage?:object, traceId:string}>}
 */
export async function askAi({ text, history = [], sessionId = '' } = {}) {
  const token = getAiToken()
  if (!token) {
    return {
      ok: false,
      code: CODE.ERR_SESSION,
      message: '还没建立会话，请重新登录后用',
      answer: '',
      cards: [],
      traceId: '',
    }
  }

  const payload = {
    sessionToken: token,
    text,
    history: history.slice(-6),
    sessionId,
    client: isMp() ? 'miniprogram' : 'web',
  }

  try {
    const data = isMp()
      ? (await wx.cloud.callFunction({ name: 'ai-gateway', data: payload })).result
      : await postJson('/ai-gateway', payload, 22000)

    const code = Number(data && data.code)
    if (code === 0) {
      return {
        ok: true,
        code: 0,
        answer: String((data && data.answer) || ''),
        cards: Array.isArray(data && data.cards) ? data.cards : [],
        usage: (data && data.usage) || null,
        traceId: (data && data.traceId) || '',
      }
    }

    /* 会话失效 → 清掉本地 token，让用户重新登录 */
    if (code === CODE.ERR_SESSION) clearAiToken()

    return {
      ok: false,
      code,
      message: (data && data.message) || MSG[code] || '出了点问题',
      answer: '',
      cards: [],
      traceId: (data && data.traceId) || '',
    }
  } catch (e) {
    const timeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError')
    return {
      ok: false,
      code: timeout ? CODE.ERR_TIMEOUT : CODE.ERR_INTERNAL,
      message: timeout ? MSG[CODE.ERR_TIMEOUT] : '网络不太通，稍后再试',
      answer: '',
      cards: [],
      traceId: '',
    }
  }
}
