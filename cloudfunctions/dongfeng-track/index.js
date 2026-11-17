/**
 * 云函数：dongfeng-track
 * ============================================================
 * 东风车联网 · 轨迹 / 能耗 中转网关
 *
 * 为什么存在这个函数：
 *   东风开放平台的 Token 是**长期有效且不可重置**的凭据。原先它被写在前端代码里，
 *   构建后直接躺在 bundle 中，任何人下载 JS 即可提取。本函数把它收进服务端环境变量，
 *   前端只与本函数通信，浏览器里再也拿不到 Token。
 *
 * 动作（action）
 *   history  GET  /track/history          历史轨迹（beginTime ~ endTime）
 *   oil      POST /track/tripAnalysisOil  单车能耗（startTime ~ endTime 日期）
 *
 * 入参
 *   { action, account, vin, beginTime?, endTime?, startTime? }
 *
 * 环境变量（必填）
 *   DONGFENG_TOKEN   东风开放平台 Token —— 代码里**不允许**出现任何明文兜底
 * 环境变量（建议）
 *   ALLOWED_ORIGINS  允许的来源域名，逗号分隔，如 https://a.com,https://b.com
 *                    留空 = 不校验来源（首次部署可留空，上线后务必填写）
 *   TCB_ENV          数据库环境，默认当前环境
 *   RDB_SCHEMA       默认 public
 *
 * ⚠️ 用 https 模块而不是 fetch：云函数 Node 16 及以下没有全局 fetch。
 * ⚠️ 所有异常都 return 出去，否则网关只回 FUNCTIONS_INVOCATION_FAILED。
 * ============================================================
 */
const https = require('https')

let tcb = null
try {
  tcb = require('@cloudbase/node-sdk')
} catch (e) {
  tcb = null
}

/* ⭐⭐⭐ Token 唯一来源：环境变量。缺失时直接报错，绝不静默降级到硬编码。 */
const DF_TOKEN = String(process.env.DONGFENG_TOKEN || '').trim()

const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const UPSTREAM = {
  history: 'https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/track/history',
  oil: 'https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/track/tripAnalysisOil',
}

const FETCH_TIMEOUT = 25000
const MAX_SPAN_DAYS = 92 // 单次查询跨度的硬上限，防止被拿来整库拖数据
const RATE_WINDOW = 60 * 1000
const RATE_MAX = 150 // 单实例每窗口次数（云函数多实例时总量会大于此值，仅作基础刹车）

/* ============================================================
   一、CORS
   ============================================================ */

function corsHeaders(origin) {
  const allowAll = ALLOWED_ORIGINS.length === 0
  const hit = allowAll || ALLOWED_ORIGINS.includes(origin)
  return {
    'Access-Control-Allow-Origin': hit ? origin || '*' : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function isOriginAllowed(origin) {
  if (ALLOWED_ORIGINS.length === 0) return true // 未配置则放行，配置后严格校验
  if (!origin) return false // 配了白名单后，无来源头的脚本调用一律拒绝
  return ALLOWED_ORIGINS.includes(origin)
}

/* ============================================================
   二、限流（单实例内存窗口，冷启动即清零 —— 够用，不求精确）
   ============================================================ */

const RATE = new Map()

function rateLimited(key) {
  const now = Date.now()
  const rec = RATE.get(key)
  if (!rec || now - rec.start > RATE_WINDOW) {
    RATE.set(key, { start: now, count: 1 })
    return false
  }
  rec.count += 1
  if (RATE.size > 5000) RATE.clear() // 防止 Map 无限增长
  return rec.count > RATE_MAX
}

/* ============================================================
   三、账号校验（轻鉴权）
   ------------------------------------------------------------
   说明：本系统登录态保存在前端，服务端没有会话表，因此这里只能做
   「账号是否存在且启用」的轻校验 —— 能挡住随机扫描器与不知账号体系的调用方，
   挡不住已知道账号名的定向攻击者。
   真正的强鉴权需要「登录时下发会话 Token 并落库」的改造，属于后续独立事项。
   查库失败不影响业务（fail-open），因为可用性优先于这一层弱校验。
   ============================================================ */

let db = null

function getDb() {
  if (db) return db
  if (!tcb) return null
  try {
    const app = tcb.init({
      env: process.env.TCB_ENV || 'wuxian-token-d0guymjkpadcd1f22',
      ...(process.env.CLOUDBASE_APIKEY ? { accessKey: process.env.CLOUDBASE_APIKEY } : {}),
    })
    db = app.rdb({ database: process.env.RDB_SCHEMA || 'public' })
    return db
  } catch (e) {
    return null
  }
}

async function accountExists(account) {
  const acc = String(account || '').trim()
  if (!acc) return false
  const client = getDb()
  if (!client) return true // 依赖不可用 → 放行（fail-open）
  try {
    /* ⭐ 用户表是 users —— 登录页（LoginView）查的就是它，
       不是 admins（只有 phone、没有 account），也不是 customers（客户档案）。
       status 是 smallint，1 = 启用。前端先用 account 匹配、失败再用 phone。 */
    const byAccount = await client.from('users').select('status').eq('account', acc).limit(1)
    if (Array.isArray(byAccount.data) && byAccount.data.length) {
      return Number(byAccount.data[0].status) === 1
    }

    const byPhone = await client.from('users').select('status').eq('phone', acc).limit(1)
    if (Array.isArray(byPhone.data) && byPhone.data.length) {
      return Number(byPhone.data[0].status) === 1
    }

    return false
  } catch (e) {
    console.warn('[dongfeng-track] 账号校验查询失败，放行：', e && e.message)
    return true
  }
}

/* ============================================================
   四、上游请求
   ============================================================ */

function requestUpstream(urlStr, method, bodyObj, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const payload = bodyObj ? JSON.stringify(bodyObj) : ''
    const headers = {
      'User-Agent': 'Mozilla/5.0 (compatible; CloudBaseFunction/1.0)',
      Accept: 'application/json',
    }
    if (payload) {
      headers['Content-Type'] = 'application/json'
      headers['Content-Length'] = Buffer.byteLength(payload)
    }

    const req = https.request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method,
        headers,
      },
      (res) => {
        let data = ''
        res.on('data', (c) => {
          data += c
        })
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(data) })
          } catch (e) {
            resolve({ status: res.statusCode, json: { code: -1, msg: '上游返回非 JSON', raw: data.slice(0, 200) } })
          }
        })
      }
    )

    req.setTimeout(timeoutMs, () => req.destroy(new Error(`请求超时 (${timeoutMs}ms)`)))
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

/* ============================================================
   五、工具
   ============================================================ */

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i

function parseBody(event) {
  let b = event && event.body
  if (b && typeof b === 'object') return b
  if (typeof b !== 'string' || !b.trim()) return {}
  try {
    const raw = event.isBase64Encoded ? Buffer.from(b, 'base64').toString('utf8') : b
    return JSON.parse(raw)
  } catch (e) {
    return {}
  }
}

function parseTs(str) {
  const s = String(str || '').trim().replace(/-/g, '/').replace('T', ' ')
  const t = new Date(s).getTime()
  return isNaN(t) ? 0 : t
}

function spanTooLarge(beginStr, endStr) {
  const a = parseTs(beginStr)
  const b = parseTs(endStr)
  if (!a || !b) return true
  return Math.abs(b - a) > MAX_SPAN_DAYS * 24 * 3600 * 1000
}

const json = (body, status = 200, extraHeaders = {}) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  body: JSON.stringify(body),
})

/* ============================================================
   六、入口
   ============================================================ */

exports.main = async (event = {}) => {
  const headers = (event && event.headers) || {}
  const origin = headers.origin || headers.Origin || ''
  const method = String(event.httpMethod || '').toUpperCase()

  /* 预检 */
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(origin), body: '' }
  }

  const ch = corsHeaders(origin)

  try {
    /* 1) 来源校验 */
    if (!isOriginAllowed(origin)) {
      console.warn('[dongfeng-track] 来源被拒：', origin)
      return json({ code: 403, msg: '来源未授权' }, 403, ch)
    }

    /* 2) Token 就绪校验 —— 缺了就明说，别让前端猜 */
    if (!DF_TOKEN) {
      console.error('[dongfeng-track] 环境变量 DONGFENG_TOKEN 未配置')
      return json({ code: 500, msg: '服务端未配置 DONGFENG_TOKEN' }, 500, ch)
    }

    const body = parseBody(event)
    const action = String(body.action || (event.queryStringParameters || {}).action || '').trim()
    const account = String(body.account || (event.queryStringParameters || {}).account || '').trim()
    const vin = String(body.vin || (event.queryStringParameters || {}).vin || '').trim()

    /* 3) 限流 */
    const rlKey = account || (headers['x-forwarded-for'] || '').split(',')[0] || 'anon'
    if (rateLimited(rlKey)) {
      return json({ code: 429, msg: '请求过于频繁' }, 429, ch)
    }

    /* 4) 账号轻校验 */
    if (!(await accountExists(account))) {
      return json({ code: 401, msg: '账号无效或已停用' }, 401, ch)
    }

    /* 5) 参数校验 */
    if (!VIN_RE.test(vin)) {
      return json({ code: 400, msg: 'VIN 格式不正确（需 17 位）' }, 400, ch)
    }

    if (action === 'history') {
      const beginTime = String(body.beginTime || '').trim()
      const endTime = String(body.endTime || '').trim()
      if (!beginTime || !endTime) {
        return json({ code: 400, msg: '缺少 beginTime / endTime' }, 400, ch)
      }
      if (spanTooLarge(beginTime, endTime)) {
        return json({ code: 400, msg: `查询跨度不能超过 ${MAX_SPAN_DAYS} 天` }, 400, ch)
      }

      const qs = new URLSearchParams({ token: DF_TOKEN, carId: vin, beginTime, endTime })
      const r = await requestUpstream(`${UPSTREAM.history}?${qs}`, 'GET', null, FETCH_TIMEOUT)
      return json(r.json, 200, ch)
    }

    if (action === 'oil') {
      /* ⚠️ 踩过的坑：该接口只接受 POST，且参数必须在 query、body 传空对象 {} */
      const startTime = String(body.startTime || '').trim()
      const endTime = String(body.endTime || '').trim()
      if (!startTime || !endTime) {
        return json({ code: 400, msg: '缺少 startTime / endTime' }, 400, ch)
      }
      if (spanTooLarge(startTime, endTime)) {
        return json({ code: 400, msg: `查询跨度不能超过 ${MAX_SPAN_DAYS} 天` }, 400, ch)
      }

      const qs = new URLSearchParams({ token: DF_TOKEN, carId: vin, startTime, endTime })
      const r = await requestUpstream(`${UPSTREAM.oil}?${qs}`, 'POST', {}, FETCH_TIMEOUT)
      return json(r.json, 200, ch)
    }

    return json({ code: 400, msg: '未知 action：' + (action || '(空)') }, 400, ch)
  } catch (e) {
    const msg = (e && e.message) || String(e)
    console.error('[dongfeng-track] 异常：', msg)
    return json({ code: 500, msg: '网关异常：' + msg }, 500, ch)
  }
}
