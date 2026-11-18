/**
 * ai-token —— 签发 AI 助手会话令牌
 * ============================================================
 * 为什么必须有这个函数：
 *   Web 端登录是前端直连数据库校验密码的，本地只存 currentUser（可被随意篡改）。
 *   如果 ai-gateway 直接信任前端传来的 account，那 A 客户改一下 localStorage
 *   就能查 B 客户的数据 —— 数据隔离就成了一句空话。
 *
 *   所以：登录成功后由本函数**在服务端**再校验一次账号密码，签发一个随机 token
 *   存进 ai_sessions，之后 ai-gateway 只认这个 token。
 *
 * 调用：
 *   Web        POST https://<网关>/ai-token   body: { account, password }
 *   小程序      wx.cloud.callFunction({ name:'ai-token', data:{ account, password } })
 *
 * 返回：
 *   成功 { code:0, token, expiresAt, tenant, name, kind }
 *   失败 { code:1001|2001|5001, message }
 *
 * ⚠️ 密码只在本次请求里用一次，不落库、不落日志（日志里只出现账号）。
 */

const { randomUUID, createHash } = require('crypto')

const API_GATEWAY = 'https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com'
const SESSIONS = 'ai_sessions'
const USERS = 'users'
const TTL_DAYS = 7

let _token = null
let _deviceId = null
let _tokenAt = 0

const getDeviceId = () => {
  if (!_deviceId) _deviceId = 'ai-tk-' + Math.random().toString(36).slice(2, 10)
  return _deviceId
}

const getToken = async () => {
  if (_token && Date.now() - _tokenAt < 50 * 60 * 1000) return _token
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

const enc = encodeURIComponent

const isMissingTable = (err) => {
  const s = String((err && (err.body || err.message)) || '')
  /* ⭐ 42703 = 列不存在，说明表是有的；以前这里一并匹配 "does not exist"，
     导致「字段写错」被报成「表尚未初始化」，排查时完全被带偏。 */
  if (/\b42703\b|column .+ does not exist/i.test(s)) return false
  return /PGRST205|Could not find the table|\b42P01\b|undefined_table/i.test(s)
}

/** token 生成：随机 + 账号摘要，便于排障时看出是谁的会话（不可反推） */
const mintToken = (account) => {
  const salt = randomUUID().replace(/-/g, '')
  const digest = createHash('sha256').update(`${account}|${salt}`).digest('hex').slice(0, 16)
  return `ait_${digest}${salt.slice(0, 16)}`
}

exports.main = async (event) => {
  let payload = event || {}
  if (typeof payload.body === 'string') {
    try { payload = { ...payload, ...JSON.parse(payload.body) } } catch (e) { /* 忽略 */ }
  }

  const account = String(payload.account || '').trim()
  const password = String(payload.password || '')

  if (!account || !password) return { code: 2001, message: '缺少账号或密码' }

  try {
    const users = await dbSelect(
      USERS,
      `select=id,account,password,name,role_id,owner_account,status&account=eq.${enc(account)}&limit=1`
    )
    const u = users[0]
    /* 不区分「账号不存在」和「密码错误」，避免账号枚举 */
    if (!u || String(u.password || '') !== password) {
      return { code: 1001, message: '账号或密码不正确' }
    }
    if (u.status != null && ['disabled', '停用', '0'].includes(String(u.status))) {
      return { code: 1001, message: '账号已停用' }
    }

    const hasRole = u.role_id !== null && u.role_id !== undefined && u.role_id !== ''
    const owner = String(u.owner_account || '').trim()
    const kind = hasRole ? 'staff' : (owner ? 'driver' : 'master')
    const tenant = kind === 'master' ? String(u.account) : owner
    if (!tenant) return { code: 1002, message: '账号未归属任何车队' }

    /* 司机账号同样签发。数据范围由 ai-gateway 按 kind==='driver' 收窄到「本人」：
       费用按 driver_phone 精确过滤、运单按 driver 姓名过滤，
       审批/待办/能耗这些整队视角的工具不给司机。 */

    const token = mintToken(u.account)
    const expiresAt = new Date(Date.now() + TTL_DAYS * 86400 * 1000).toISOString()

    /* 同一账号只保留一个有效会话，旧的自然失效（单设备语义） */
    try {
      await dbRequest('DELETE', SESSIONS, `account=eq.${enc(u.account)}`)
    } catch (e) {
      if (!isMissingTable(e)) console.warn('[ai-token] 清理旧会话失败:', e && e.message)
    }

    try {
      await dbRequest('POST', SESSIONS, '', {
        token,
        account: String(u.account),
        tenant,
        kind,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
      })
    } catch (e) {
      if (isMissingTable(e)) {
        console.error('[ai-token] ai_sessions 表不存在，请先执行 sql/2026-11-18_ai_sessions.sql')
        return { code: 5001, message: 'AI 助手尚未初始化，请联系管理员' }
      }
      throw e
    }

    console.log(`[ai-token] 签发成功 account=${u.account} tenant=${tenant} kind=${kind}`)

    return {
      code: 0,
      token,
      expiresAt,
      tenant,
      kind,
      name: u.name || '',
    }
  } catch (e) {
    console.error('[ai-token] 失败:', e && (e.message || e))
    return { code: 5001, message: '服务暂时不可用' }
  }
}
