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
/* ⭐ 30 天。配合 ai-gateway 的滑动续期（剩余不足 7 天自动顺延），
   活跃账号实际永不掉线；长期不用才自然过期。原来 7 天，一放假回来就断。 */
const TTL_DAYS = 30

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

/** 设备凭证：登录时种下，之后凭它免密换新 token（不再让用户反复重登） */
const mintDeviceKey = () => randomUUID().replace(/-/g, '')

/** 由 users 行推 kind / tenant —— 与签发、网关三处必须同口径 */
function resolveKindTenant(u) {
  const hasRole = u.role_id !== null && u.role_id !== undefined && u.role_id !== ''
  const owner = String(u.owner_account || '').trim()
  const kind = hasRole ? 'staff' : (owner ? 'driver' : 'master')
  const tenant = kind === 'master' ? String(u.account) : owner
  return { kind, tenant }
}

exports.main = async (event) => {
  let payload = event || {}
  if (typeof payload.body === 'string') {
    try { payload = { ...payload, ...JSON.parse(payload.body) } } catch (e) { /* 忽略 */ }
  }

  const action = String(payload.action || '').trim()

  /* ============================================================
     ① 免密续签：凭设备凭证换新 token
     ------------------------------------------------------------
     为什么需要：token 只存在 localStorage，一旦被清（换设备、清缓存、
     浏览器策略、之前的互踢）就必须重新输密码。用户视角就是
     「有时候还是连不上」。设备凭证只多存一个 key，就能自愈。
     安全边界：deviceKey 是 32 位随机串，与 token 同等强度；
     它只能换 token，不能查任何业务数据，且账号状态每次都会重校。
     ============================================================ */
  if (action === 'renew') {
    const dk = String(payload.deviceKey || '').trim()
    if (dk.length < 16) return { code: 1001, message: '设备凭证无效' }
    try {
      const rows = await dbSelect(
        SESSIONS,
        `select=token,account,tenant,kind,expires_at&device_key=eq.${enc(dk)}&limit=1`
      )
      const s = rows[0]
      if (!s) return { code: 1001, message: '设备凭证已失效，请重新登录' }
      if (s.expires_at && Date.parse(s.expires_at) < Date.now()) {
        return { code: 1001, message: '设备凭证已过期，请重新登录' }
      }

      /* 期间可能被停用 / 改了角色 —— 每次续签都重读一次用户 */
      const users = await dbSelect(
        USERS,
        `select=id,account,password,name,role_id,owner_account,status&account=eq.${enc(s.account)}&limit=1`
      )
      const u = users[0]
      if (!u) return { code: 1001, message: '账号不存在' }
      if (u.status != null && ['disabled', '停用', '0'].includes(String(u.status))) {
        return { code: 1001, message: '账号已停用' }
      }
      const { kind, tenant } = resolveKindTenant(u)
      if (!tenant) return { code: 1002, message: '账号未归属任何车队' }

      const token = mintToken(u.account)
      const expiresAt = new Date(Date.now() + TTL_DAYS * 86400 * 1000).toISOString()

      /* ⚠️ 不 rotate deviceKey：续签做成幂等的，
         否则「PATCH 成功但响应丢包」会让设备凭证失效，等于又要重登。 */
      await dbRequest('PATCH', SESSIONS, `device_key=eq.${enc(dk)}`, {
        token,
        expires_at: expiresAt,
        tenant,
        kind,
      })

      console.log(`[ai-token] 续签成功 account=${u.account} tenant=${tenant} kind=${kind}`)
      return { code: 0, token, deviceKey: dk, expiresAt, tenant, kind, account: String(u.account), name: u.name || '' }
    } catch (e) {
      if (isMissingTable(e)) {
        return { code: 5001, message: 'AI 助手尚未初始化，请联系管理员' }
      }
      console.error('[ai-token] 续签失败:', e && (e.message || e))
      return { code: 5001, message: '服务暂时不可用' }
    }
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

    const { kind, tenant } = resolveKindTenant(u)
    if (!tenant) return { code: 1002, message: '账号未归属任何车队' }

    /* 司机账号同样签发。数据范围由 ai-gateway 按 kind==='driver' 收窄到「本人」：
       费用按 driver_phone 精确过滤、运单按 driver 姓名过滤，
       审批/待办/能耗这些整队视角的工具不给司机。 */

    const token = mintToken(u.account)
    const deviceKey = mintDeviceKey()
    const expiresAt = new Date(Date.now() + TTL_DAYS * 86400 * 1000).toISOString()

    /* ⚠️ 这里曾经是「删掉该账号的全部旧会话」（单设备语义），后果很严重：
       多标签页 / 多设备各登录一次就互相踢下线 —— 先登录的那个窗口下一次请求
       必然 1001，前端随即清掉本地 token，用户看到的正是
       「有时候还是连接不上，只能重新登录」。
       现在改成允许多条并存（token 本身是随机的，多条不等于更弱），
       只顺手清理已过期的行，避免表无限增长。 */
    try {
      await dbRequest(
        'DELETE',
        SESSIONS,
        `account=eq.${enc(u.account)}&expires_at=lt.${enc(new Date().toISOString())}`
      )
    } catch (e) {
      if (!isMissingTable(e)) console.warn('[ai-token] 清理过期会话失败:', e && e.message)
    }

    try {
      await dbRequest('POST', SESSIONS, '', {
        token,
        account: String(u.account),
        tenant,
        kind,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
        device_key: deviceKey,
      })
    } catch (e) {
      /* 老表没有 device_key 列时降级：先保证 token 能签出来，
         设备凭证是「免密续签」用的，缺了不影响本次登录。 */
      if (/42703|column .+ does not exist/i.test(String(e.body || e.message))) {
        console.warn('[ai-token] ai_sessions 缺 device_key 列，本次不带设备凭证')
        await dbRequest('POST', SESSIONS, '', {
          token, account: String(u.account), tenant, kind,
          expires_at: expiresAt, created_at: new Date().toISOString(),
        })
      } else if (isMissingTable(e)) {
        console.error('[ai-token] ai_sessions 表不存在，请先执行 sql/2026-11-18_ai_sessions.sql')
        return { code: 5001, message: 'AI 助手尚未初始化，请联系管理员' }
      } else {
        throw e
      }
    }

    console.log(`[ai-token] 签发成功 account=${u.account} tenant=${tenant} kind=${kind}`)

    return {
      code: 0,
      token,
      deviceKey,
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
