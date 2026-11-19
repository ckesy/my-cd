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

/* 设备凭证：与 token 分开存。token 被清（换设备/清缓存/浏览器策略）时，
   还能凭它免密换一张新的，不用让用户反复输密码。 */
const DEVICE_KEY = 'ai_device_key'

export const getAiDevice = () => {
  try { return localStorage.getItem(DEVICE_KEY) || '' } catch (e) { return '' }
}

export const setAiDevice = (k) => {
  try {
    if (k) localStorage.setItem(DEVICE_KEY, k)
    else localStorage.removeItem(DEVICE_KEY)
  } catch (e) { /* 忽略 */ }
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
 *
 * ⭐ 这里带重试：云函数冷启动 / 首次匿名登录可能超过单次超时，
 *    原来一次失败就静默放弃，用户之后一直卡在「还没连上」，只能重登 ——
 *    而重登还是可能再失败一次，看起来就像「有时候连不上」。
 *    现在：网络类错误重试 2 次；账号密码错这类确定性错误立即返回，不做无谓重试。
 *
 * @returns {Promise<{ok:boolean, message?:string}>}
 */
export async function ensureAiToken(account, password, attempts = 2) {
  if (!account || !password) return { ok: false, message: '缺少账号或密码' }

  let last = '网络异常'
  for (let i = 0; i < attempts; i += 1) {
    try {
      const data = await postJson('/ai-token', { account, password })
      if (data && data.code === 0 && data.token) {
        setAiToken(data.token)
        /* 顺手种下设备凭证：以后 token 再丢也不用重新输密码 */
        if (data.deviceKey) setAiDevice(data.deviceKey)
        return { ok: true }
      }
      last = (data && data.message) || 'AI 助手未开通'
      /* 只有 5001（服务暂时不可用）值得重试；1001 密码错 / 1002 无租户重试也没用 */
      if (data && Number(data.code) !== 5001) return { ok: false, message: last }
    } catch (e) {
      last = '网络异常'
      console.warn(`[AI] 签发会话失败（第 ${i + 1} 次）：`, e && e.message)
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 600))
  }
  return { ok: false, message: last }
}

/* ============================================================
   免密续签
   ============================================================ */
/**
 * 用设备凭证换一张新 token。
 * 场景：token 被清 / 过期 / 被服务端清掉，但设备凭证还在。
 * 失败不抛错，返回 {ok:false}，调用方自行决定是否引导重新登录。
 * @returns {Promise<{ok:boolean, message?:string}>}
 */
export async function resumeAiToken() {
  const dk = getAiDevice()
  if (!dk) return { ok: false, message: '没有设备凭证' }

  try {
    const data = await postJson('/ai-token', { action: 'renew', deviceKey: dk })
    if (data && data.code === 0 && data.token) {
      setAiToken(data.token)
      if (data.deviceKey) setAiDevice(data.deviceKey)
      return { ok: true }
    }
    /* 1001 = 设备凭证确实失效/过期 → 清掉，别每次白试一次 */
    if (data && Number(data.code) === 1001) setAiDevice('')
    return { ok: false, message: (data && data.message) || '续签失败' }
  } catch (e) {
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
 * 单次提问（不含重试）
 * @param {{text:string, history:Array, sessionId:string, token:string}} o
 */
async function askOnce({ text, history = [], sessionId = '', token }) {
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

/* ============================================================
   提问（对外入口）
   ============================================================ */
/**
 * @param {{text:string, history?:Array<{role:string,content:string}>, sessionId?:string}} opts
 * @returns {Promise<{ok:boolean, answer:string, cards:Array, code:number, message?:string, usage?:object, traceId:string, needLogin?:boolean}>}
 */
export async function askAi({ text, history = [], sessionId = '' } = {}) {
  let token = getAiToken()

  /* 没有 token 但设备凭证还在 → 静默补一张，用户完全无感 */
  if (!token) {
    const r = await resumeAiToken()
    if (r.ok) token = getAiToken()
  }

  if (!token) {
    return {
      ok: false,
      code: CODE.ERR_SESSION,
      message: '还没建立会话，请重新登录后用',
      answer: '',
      cards: [],
      traceId: '',
      needLogin: true,
    }
  }

  let res = await askOnce({ text, history, sessionId, token })

  /* ⭐ 会话失效先重试一次再清 token。
     原来是「一收到 1001 就 clearAiToken()」，一次网关冷启 / 库抖动就能把
     用户永久打到「未连接」，只能重新登录 —— 这正是「有时候还是连不上」。
     现在：重试能自愈的就自愈；两次都 1001 才认定确实失效，清掉并要求重登。 */
  if (!res.ok && res.code === CODE.ERR_SESSION) {
    await new Promise((r) => setTimeout(r, 400))
    res = await askOnce({ text, history, sessionId, token })
    if (!res.ok && res.code === CODE.ERR_SESSION) {
      clearAiToken()
      return { ...res, needLogin: true }
    }
  }

  return res
}
