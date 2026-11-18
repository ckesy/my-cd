/**
 * 数据库访问层（与 session-guard / login-by-account 同一套写法）
 * ============================================================
 * 走 CloudBase 的 PostgREST 网关，匿名登录拿 token 后直连 rdb。
 *
 * ⚠️ 重要架构现实：anon 角色的库权限较宽，**租户隔离完全依赖本服务端的 where 条件**，
 *    不能指望数据库拦住越权查询。所以 tools.js 里每个查询都强制拼租户条件，
 *    并且返回前用 guard.assertTenant 做二次断言。
 */

const { LIMITS } = require('./constants')

const API_GATEWAY = 'https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com'

let _token = null
let _deviceId = null
let _tokenAt = 0
const TOKEN_TTL = 50 * 60 * 1000

const getDeviceId = () => {
  if (!_deviceId) {
    _deviceId = 'ai-gw-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  }
  return _deviceId
}

const getToken = async () => {
  if (_token && Date.now() - _tokenAt < TOKEN_TTL) return _token
  const res = await fetch(`${API_GATEWAY}/auth/v1/signin/anonymously`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-device-id': getDeviceId() },
    body: JSON.stringify({}),
  })
  if (!res.ok) throw new Error(`匿名登录失败 HTTP ${res.status}`)
  const json = await res.json()
  _token = json.access_token || json.accessToken || (json.data && json.data.access_token)
  if (!_token) throw new Error('匿名登录未返回 token')
  _tokenAt = Date.now()
  return _token
}

const dbRequest = async (method, table, query, body) => {
  const token = await getToken()
  const headers = {
    Authorization: `Bearer ${token}`,
    'x-device-id': getDeviceId(),
    Accept: 'application/json',
    'Accept-Profile': 'public',
    'Content-Profile': 'public',
  }
  if (body) headers['Content-Type'] = 'application/json'
  if (method !== 'GET') headers.Prefer = 'return=representation'

  const url = `${API_GATEWAY}/v1/rdb/rest/${table}${query ? '?' + query : ''}`
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  })
  const text = await res.text()
  if (!res.ok) {
    const err = new Error(`${method} ${table} HTTP ${res.status}: ${text.slice(0, 200)}`)
    err.status = res.status
    err.body = text
    throw err
  }
  if (!text) return []
  try {
    return JSON.parse(text)
  } catch (e) {
    return []
  }
}

const dbSelect = async (table, query) => {
  const rows = await dbRequest('GET', table, query)
  return Array.isArray(rows) ? rows : (rows.data || [])
}

const dbInsert = async (table, row) => dbRequest('POST', table, '', row)
const dbPatch = async (table, query, patch) => dbRequest('PATCH', table, query, patch)

const enc = encodeURIComponent

/** 表未建 / schema 缓存未刷新 */
const isMissingTable = (err) => {
  const s = String((err && (err.body || err.message)) || '')
  /* ⭐ 42703 = 列不存在，说明表是有的；以前这里一并匹配 "does not exist"，
     导致「字段写错」被报成「表尚未初始化」，排查时完全被带偏。 */
  if (/\b42703\b|column .+ does not exist/i.test(s)) return false
  return /PGRST205|Could not find the table|\b42P01\b|undefined_table/i.test(s)
}

/** 超时包装：外部调用一律走这里，避免整请求挂死 */
const withTimeout = (p, ms, label) => {
  const t = Number(ms) || LIMITS.TIMEOUT_MS
  return Promise.race([
    p,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label || 'call'} 超时 ${t}ms`)), t)
    ),
  ])
}

module.exports = {
  API_GATEWAY, dbRequest, dbSelect, dbInsert, dbPatch, enc, isMissingTable, withTimeout,
}
