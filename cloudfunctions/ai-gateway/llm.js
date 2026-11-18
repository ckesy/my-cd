/**
 * DeepSeek 调用层
 * ============================================================
 * 只做三件事：发请求、解析 tool_calls、把 usage 带回来（用于成本核算）。
 * 重试策略：仅对超时 / 5xx 重试 1 次；4xx（含 401 未授权）不重试，避免刷爆配额。
 *
 * 环境变量：
 *   DEEPSEEK_API_KEY   必填，只在云函数环境变量里配置，禁止进代码库
 *   DEEPSEEK_BASE_URL  选填，默认官方地址
 *   AI_MODEL           选填，默认 deepseek-flash
 */

const BASE = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
const MODEL = process.env.AI_MODEL || 'deepseek-flash'
const KEY = process.env.DEEPSEEK_API_KEY || ''

const DEFAULT_TIMEOUT = 12000
const MAX_OUTPUT_TOKENS = 800

class LlmError extends Error {
  constructor(kind, message, status) {
    super(message)
    this.kind = kind          // timeout | auth | rate | server | bad_format
    this.status = status || 0
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const normalizeUsage = (u) => ({
  prompt: Number(u?.prompt_tokens) || 0,
  completion: Number(u?.completion_tokens) || 0,
  cached: Number(u?.prompt_cache_hit_tokens) || 0,
  total: Number(u?.total_tokens) || 0,
})

/**
 * 估算 token：中文约 1 字 1 token，英文 4 字符 1 token。
 * 只用于「输入超长就截断历史」这一件事，不用于计费。
 */
const roughTokens = (text) => {
  const s = String(text || '')
  const cjk = (s.match(/[\u4e00-\u9fa5]/g) || []).length
  return cjk + Math.ceil((s.length - cjk) / 4)
}

/**
 * 输入超上限时，从最旧的历史开始丢，保留 system + 最近若干轮。
 * system 与 tools 是缓存命中的关键，绝不能动。
 */
function trimMessages(messages, cap) {
  if (!Array.isArray(messages)) return []
  const total = messages.reduce((s, m) => s + roughTokens(m.content) + 40, 0)
  if (total <= cap) return messages

  const system = messages.filter((m) => m.role === 'system')
  const rest = messages.filter((m) => m.role !== 'system')
  let budget = cap - system.reduce((s, m) => s + roughTokens(m.content) + 40, 0)
  const kept = []
  for (let i = rest.length - 1; i >= 0; i -= 1) {
    const cost = roughTokens(rest[i].content) + 40
    if (budget - cost < 0) break
    budget -= cost
    kept.unshift(rest[i])
  }
  return [...system, ...kept]
}

/**
 * 调一次模型
 * @returns {{content:string, toolCalls:Array, finishReason:string, usage:object}}
 */
async function chat({ messages, tools, toolChoice, timeoutMs, temperature }) {
  if (!KEY) throw new LlmError('auth', '未配置 DEEPSEEK_API_KEY')

  const body = {
    model: MODEL,
    messages,
    temperature: temperature == null ? 0.1 : temperature,
    max_tokens: MAX_OUTPUT_TOKENS,
    stream: false,
  }
  if (tools && tools.length) {
    body.tools = tools
    body.tool_choice = toolChoice || 'auto'
  }

  const doFetch = async () => {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KEY}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs || DEFAULT_TIMEOUT),
    })
    const text = await res.text()
    if (!res.ok) {
      const kind =
        res.status === 401 ? 'auth'
          : res.status === 402 ? 'balance'
            : res.status === 429 ? 'rate'
              : res.status >= 500 ? 'server'
                : 'bad_format'
      throw new LlmError(kind, `模型接口 HTTP ${res.status}: ${text.slice(0, 200)}`, res.status)
    }
    try {
      return JSON.parse(text)
    } catch (e) {
      throw new LlmError('bad_format', '模型返回非 JSON')
    }
  }

  let json
  try {
    json = await doFetch()
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new LlmError('timeout', '模型调用超时')
    /* 仅超时/5xx 重试一次 */
    if (e.kind === 'timeout' || e.kind === 'server') {
      await sleep(300)
      json = await doFetch()
    } else {
      throw e
    }
  }

  const choice = (json.choices && json.choices[0]) || {}
  const msg = choice.message || {}
  const toolCalls = Array.isArray(msg.tool_calls)
    ? msg.tool_calls.map((tc) => ({
      id: tc.id,
      name: tc.function && tc.function.name,
      rawArgs: (tc.function && tc.function.arguments) || '{}',
    }))
    : []

  return {
    content: msg.content || '',
    toolCalls,
    finishReason: choice.finish_reason || '',
    usage: normalizeUsage(json.usage),
  }
}

/** 安全解析模型给的 arguments（模型偶尔会带 ```json 包裹或多余空格） */
function parseArgs(raw) {
  if (raw == null || raw === '') return {}
  if (typeof raw === 'object') return raw
  let s = String(raw).trim()
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start >= 0 && end > start) s = s.slice(start, end + 1)
  try {
    return JSON.parse(s)
  } catch (e) {
    return null
  }
}

module.exports = { chat, parseArgs, trimMessages, roughTokens, LlmError, MODEL }
