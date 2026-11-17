/**
 * 云函数：session-guard
 * ============================================================
 * 作用：小程序「单设备登录」守卫 —— 每台设备定时上报自己的会话凭证，
 *       服务端比对 user_sessions.token；不一致说明账号在别处登录了 →
 *       返回 state='kicked'，被顶掉的那台自行退出并提示。
 *
 * 调用：wx.cloud.callFunction({
 *   name: 'session-guard',
 *   data: { action: 'heartbeat', account, token },
 * })
 *
 * action：
 *   heartbeat（默认）→ 校验 token，顺手更新 last_seen
 *   logout          → 清掉自己的会话行（主动退出登录时调用）
 *
 * 返回契约：
 *   正常     { code: 0, state: 'ok', at, by }        —— at/by = 当前生效的登录时间 / 设备
 *   被顶下线 { code: 0, state: 'kicked', at, by }    —— by = 顶号的那台设备
 *   无记录   { code: 0, state: 'none' }              —— 表未建 / 已被清（不踢人，避免误伤）
 *   失败     { code: 500, message }
 *   ⚠️ 表不存在（未执行 sql/2026-10-17_user_sessions.sql）时**必须**返回 state:'none'，
 *      不能报错 —— 否则客户端会把「表没建」当成异常，或者反过来误踢。
 *
 * 运行时：Node.js 18.15（只用内置 fetch，无 npm 依赖）
 * 环境变量：无
 */

const { randomUUID } = require('crypto')

const API_GATEWAY = 'https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com'
const SESSION_TABLE = 'user_sessions'

/* last_seen 的写入节流：心跳 20s 一次，没必要每 20s 都写库 */
const SEEN_THROTTLE_MS = 120000

/* ============================================================
   数据库访问层（与 login-by-account 同一套写法）
   ============================================================ */
let _token = null
let _deviceId = null

const getDeviceId = () => {
    if (!_deviceId) _deviceId = randomUUID()
    return _deviceId
}

const getToken = async () => {
    if (_token) return _token
    const res = await fetch(`${API_GATEWAY}/auth/v1/signin/anonymously`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-id': getDeviceId() },
        body: JSON.stringify({}),
    })
    if (!res.ok) throw new Error(`匿名登录失败 HTTP ${res.status}`)
    const json = await res.json()
    _token = json.access_token || json.accessToken || (json.data && json.data.access_token)
    if (!_token) throw new Error('匿名登录未返回 token')
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
    /* PATCH / POST / DELETE 都要拿回受影响的行，用来判断「命中了几行」 */
    if (method !== 'GET') headers.Prefer = 'return=representation'

    const url = `${API_GATEWAY}/v1/rdb/rest/${table}${query ? '?' + query : ''}`
    const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    if (!res.ok) {
        const err = new Error(`${method} ${table} 失败 HTTP ${res.status}: ${text.slice(0, 200)}`)
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
    return Array.isArray(rows) ? rows : rows.data || []
}

const enc = encodeURIComponent

/* 表还没建 / schema 缓存里没有 */
const isMissingTable = (err) => {
    const s = String((err && (err.body || err.message)) || '')
    return /PGRST205|Could not find the table|does not exist|42P01|undefined_table/i.test(s)
}

/* ============================================================
   入口
   ============================================================ */
exports.main = async (event) => {
    const action = String((event && event.action) || 'heartbeat').trim()
    const account = String((event && event.account) || '').trim()
    const token = String((event && event.token) || '').trim()

    if (!account || !token) return { code: 400, message: '缺少账号或会话凭证' }

    try {
        /* ---------- 主动退出登录：清掉自己的会话行 ---------- */
        if (action === 'logout') {
            const rows = await dbSelect(
                SESSION_TABLE,
                `select=token&account=eq.${enc(account)}&limit=1`
            )
            /* 只删自己的：token 不匹配说明已经被别人顶掉了，别误删新的那条 */
            if (!rows.length) return { code: 0 }
            if (String(rows[0].token) !== token) return { code: 0 }
            await dbRequest('DELETE', SESSION_TABLE, `account=eq.${enc(account)}`)
            return { code: 0 }
        }

        /* ---------- 心跳：校验这个 token 还是不是「当前有效会话」 ---------- */
        const rows = await dbSelect(
            SESSION_TABLE,
            `select=account,token,device_label,login_at,last_seen&account=eq.${enc(account)}&limit=1`
        )
        if (!rows.length) return { code: 0, state: 'none' }

        const s = rows[0]
        if (String(s.token || '') !== token) {
            /* ⭐ 被顶号：把「谁顶的 / 什么时候顶的」一起回给老设备，用来提示 */
            return {
                code: 0,
                state: 'kicked',
                by: s.device_label || '另一台设备',
                at: s.login_at || '',
            }
        }

        /* 还活着：节流更新 last_seen（给人看「最后一次在线」，不影响判定） */
        const last = Date.parse(s.last_seen || '') || 0
        if (!last || Date.now() - last > SEEN_THROTTLE_MS) {
            try {
                await dbRequest('PATCH', SESSION_TABLE, `account=eq.${enc(account)}`, {
                    last_seen: new Date().toISOString(),
                })
            } catch (e) {
                /* 写失败不影响校验结果 */
            }
        }

        return { code: 0, state: 'ok', at: s.login_at || '', by: s.device_label || '' }
    } catch (e) {
        if (isMissingTable(e)) {
            /* 表没建：降级为「不限制」，绝不能反过来把用户踢下线 */
            console.warn('session-guard：user_sessions 不存在，已降级为不限制登录设备')
            return { code: 0, state: 'none', degraded: true }
        }
        console.error('session-guard 执行失败：', e)
        return { code: 500, message: e.message || '服务异常' }
    }
}