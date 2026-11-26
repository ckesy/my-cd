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

/* ⭐⭐ 令牌归属账号（令牌签发时一并存下）
   ------------------------------------------------------------
   背景：令牌是「登录那一刻」由 ai-token 按账号签发的，之后一直躺在
        localStorage 里。只要换账号没有重新签发，助手就会拿**上一个人的
        身份**答题 —— 页面费用列表 0 条，助手却报「你有 10 笔待审批」，
        典型的串号。存一份归属账号，每次提问前比对即可拦住。 */
const ACC_KEY = 'ai_session_account'

export const getAiTokenAccount = () => {
  try { return localStorage.getItem(ACC_KEY) || '' } catch (e) { return '' }
}

const setAiTokenAccount = (a) => {
  try {
    if (a) localStorage.setItem(ACC_KEY, String(a))
    else localStorage.removeItem(ACC_KEY)
  } catch (e) { /* 忽略 */ }
}

/** 当前页面登录的账号（只取 account，不用 masterAccount：
    子账号的 masterAccount 是租户号，与令牌里的 account 不是一回事） */
const currentLoginAccount = () => {
  try {
    const u = JSON.parse(localStorage.getItem('currentUser') || 'null') || {}
    return String(u.account || '')
  } catch (e) { return '' }
}

/**
 * 校验「令牌归属账号 == 当前登录账号」，不一致就地清掉。
 * 返回 { ok:false } 表示令牌已作废，调用方应提示重新登录。
 * 小程序走 wx 存储，这里读不到 localStorage，直接放行。
 */
export const syncAiTokenAccount = () => {
  if (isMp()) return { ok: true, changed: false }
  const cur = currentLoginAccount()
  if (!cur) return { ok: true, changed: false }
  const bound = getAiTokenAccount()
  /* 老数据没有归属记录：补写当前账号，不打扰用户（升级前签发的令牌只能这样收口） */
  if (!bound) { setAiTokenAccount(cur); return { ok: true, changed: false } }
  if (bound === cur) return { ok: true, changed: false }

  console.warn(`[AI] 令牌归属 ${bound} 与当前账号 ${cur} 不一致，已作废，需重新登录`)
  clearAiToken()
  setAiDevice('')
  return { ok: false, changed: true }
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
    /* 换 token 时归属未知 → 清掉旧记录，避免「新令牌挂着旧账号」被误判。
       ensureAiToken / resumeAiToken 随后会写回服务端确认的 account。 */
    setAiTokenAccount('')
  } catch (e) { /* 忽略 */ }
}

export const clearAiToken = () => { setAiToken(''); setAiTokenAccount('') }

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
        /* ⭐ 记下令牌归属：以服务端回填的 account 为准（大小写/空格以库为准） */
        setAiTokenAccount(data.account || account)
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
      setAiTokenAccount(data.account || '')
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
   轻量请求（不进模型）：刷新草稿 / 查实体候选
   ------------------------------------------------------------
   这两个动作在服务端走 action 分支，直接跑工具就返回，
   不扣 LLM 配额、也没有模型延迟（约 200ms）。
   ============================================================ */
async function postAction(payload) {
  const token = getAiToken()
  if (!token) {
    return { code: (CODE && CODE.ERR_SESSION) || 1001, message: '还没连上，请重新登录一次' }
  }
  const body = { sessionToken: token, ...payload }
  try {
    return isMp()
      ? ((await wx.cloud.callFunction({ name: 'ai-gateway', data: body })).result || {})
      : await postJson('/ai-gateway', body, 15000)
  } catch (e) {
    const timeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError')
    return { code: timeout ? 3001 : 5001, message: timeout ? '刷新超时，稍后再试' : '网络不太通' }
  }
}

/**
 * 刷新草稿：拿上一次的原始参数 + 用户补的字段，重算一遍
 * @param {{draft:object, patch?:object, sessionId?:string}} o
 */
export async function redraftDraft(o = {}) {
  const data = await postAction({
    action: 'redraft',
    draft: o.draft && typeof o.draft === 'object' ? o.draft : {},
    patch: o.patch && typeof o.patch === 'object' ? o.patch : {},
    sessionId: o.sessionId || '',
  })
  const code = Number(data.code)
  return {
    ok: code === 0,
    code,
    cards: Array.isArray(data.cards) ? data.cards : [],
    message: data.message || '',
    traceId: data.traceId || '',
  }
}

/**
 * 查实体候选（草稿卡点「选已有」时用）
 * @param {{kind:string, text:string}} o
 */
export async function resolveEntity(o = {}) {
  const data = await postAction({ action: 'resolve', kind: o.kind, text: o.text })
  const code = Number(data.code)
  return {
    ok: code === 0,
    code,
    exact: !!data.exact,
    candidates: Array.isArray(data.candidates) ? data.candidates : [],
    suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
    note: data.note || '',
    message: data.message || '',
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
  /* ⭐⭐ 先验身份：令牌归属账号必须等于当前登录账号。
     不做这一步的话，换账号（尤其「进入客户端 / 返回入口」这类 SPA 内切换）
     后助手仍按上一个人的身份答题 —— 页面查不到的单，助手却能列出来。 */
  if (!syncAiTokenAccount().ok) {
    return {
      ok: false,
      code: CODE.ERR_SESSION,
      message: '登录账号已切换，助手需要重新登录后才能使用',
      answer: '',
      cards: [],
      traceId: '',
      needLogin: true,
    }
  }

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

  /* ⭐ 会话失效的处理顺序：重试 → 免密续签 → 才清凭证要求重登。
     原来是「一收到 1001 就 clearAiToken()」，一次网关冷启 / 库抖动就能把
     用户永久打到「未连接」，只能重新登录 —— 这正是「有时候还是连不上」。
     现在：偶发抖动靠重试自愈；token 真过期了靠设备凭证换新的；都不行才算真失效。 */
  if (!res.ok && res.code === CODE.ERR_SESSION) {
    await new Promise((r) => setTimeout(r, 400))
    res = await askOnce({ text, history, sessionId, token })
  }

  /* token 确认不可用（过期 / 被清）→ 用设备凭证换一张再试一次。
     少了这一步，设备凭证只在「页面加载时」起作用，
     页面开着跨过有效期就要重登。 */
  if (!res.ok && res.code === CODE.ERR_SESSION) {
    const r = await resumeAiToken()
    if (r.ok) {
      const fresh = getAiToken()
      if (fresh) res = await askOnce({ text, history, sessionId, token: fresh })
      if (res.ok) return res
    }
    clearAiToken()
    return { ...res, needLogin: true }
  }

  return res
}
