/**
 * 云函数：upload-photo
 * ============================================================
 * 作用：给小程序 / Web 端「签发对象存储（COS）的上传、下载地址」。
 *   文件不经过云函数中转（API 网关有 100KB 限制），客户端拿到签名 URL
 *   直接 PUT 到 COS，原图 2~5MB 也没问题。
 *
 * 为什么不用 CloudBase 云存储：
 *   业务库环境 d0guy 是 PostgreSQL 环境，`Storage is not supported in PostgreSQL env`；
 *   另一个有存储的环境 d5gl7 又没绑定到小程序（Env Not Exists）。
 *   所以直接对接底层 COS。
 *
 * 触发方式：HTTP 访问服务 POST /uploadPhoto
 *
 *   1) 签发上传地址
 *      { "action": "signPut", "path": "reports/xxx/1.jpg" }
 *      → { ok:true, key, url }        // 客户端把二进制 PUT 到这个 url
 *
 *   2) 批量签发下载地址
 *      { "action": "signGet", "keys": ["reports/xxx/1.jpg"] }
 *      → { ok:true, urls: { key: "https://..." } }
 *
 * 环境变量（必填）
 *   COS_SECRET_ID   腾讯云 SecretId
 *   COS_SECRET_KEY  腾讯云 SecretKey
 *   COS_BUCKET      桶名全称，形如 wuxian-fleet-1254135806
 *   COS_REGION      地域，默认 ap-shanghai
 *
 * ⚠️ 所有异常都 return 出去，否则网关只回 FUNCTIONS_INVOCATION_FAILED。
 */

let COS = null
try {
  COS = require('cos-nodejs-sdk-v5')
} catch (e) {
  COS = null
}

const SECRET_ID = String(process.env.COS_SECRET_ID || '').trim()
const SECRET_KEY = String(process.env.COS_SECRET_KEY || '').trim()
const BUCKET = String(process.env.COS_BUCKET || '').trim()
const REGION = String(process.env.COS_REGION || 'ap-shanghai').trim()

let cos = null
function getCos() {
  if (cos) return cos
  if (!COS) throw new Error('缺少依赖 cos-nodejs-sdk-v5：请在函数面板「在线安装依赖」')
  if (!SECRET_ID || !SECRET_KEY) throw new Error('缺少 COS_SECRET_ID / COS_SECRET_KEY 环境变量')
  if (!BUCKET) throw new Error('缺少 COS_BUCKET 环境变量（形如 wuxian-fleet-1254135806）')
  cos = new COS({ SecretId: SECRET_ID, SecretKey: SECRET_KEY })
  return cos
}

function signUrl(key, method, expires) {
  return new Promise((resolve, reject) => {
    getCos().getObjectUrl(
      {
        Bucket: BUCKET,
        Region: REGION,
        Key: key,
        Method: method,
        Expires: expires,
        Sign: true,
      },
      (err, data) => {
        if (err) return reject(err)
        resolve(data && data.Url ? data.Url : '')
      }
    )
  })
}

/* HTTP 访问服务 / callFunction 两种入参都能吃 */
function parseBody(event) {
  if (!event) return {}
  if (typeof event === 'string') return JSON.parse(event)
  if (typeof event.body === 'string') {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body
    return JSON.parse(raw || '{}')
  }
  if (event.body && typeof event.body === 'object') return event.body
  return event
}

/* ============================================================
   路径白名单
   ------------------------------------------------------------
   此前任何调用方都能对桶内**任意路径**签发上传/下载地址，等于把整个桶交出去：
     · signPut 可覆盖他人文件、写入钓鱼 HTML（桶若开静态托管）
     · signGet 可读取桶内任何非业务对象
   这里加两道闸：限定前缀 + 阻断路径穿越。
   ⚠️ 仍属「弱防护」：signGet 可读 reports/ 下任意 key。要根治需按登录会话
      校验 key 归属，属后续独立改造（见安全整改清单 A4 备注）。
   ============================================================ */

const ALLOWED_PREFIXES = ['reports/']
const KEY_MAX_LEN = 180

function normalizeKey(raw) {
  const key = String(raw == null ? '' : raw).trim().replace(/^\/+/, '')
  if (!key) return { ok: false, error: '缺少 key/path' }
  if (key.length > KEY_MAX_LEN) return { ok: false, error: 'path 太长' }
  if (key.includes('..') || key.includes('\\') || key.includes('\u0000')) {
    return { ok: false, error: 'path 含非法字符' }
  }
  if (!ALLOWED_PREFIXES.some((p) => key.startsWith(p))) {
    return { ok: false, error: 'path 不在允许目录内（仅 reports/）' }
  }
  return { ok: true, key }
}

exports.main = async (event) => {
  try {
    const body = parseBody(event)
    const action = String(body.action || 'signPut')

    if (action === 'signPut') {
      const parsed = normalizeKey(body.path)
      if (!parsed.ok) return { ok: false, error: parsed.error }
      const key = parsed.key
      const url = await signUrl(key, 'PUT', 600)
      if (!url) return { ok: false, error: '签名失败' }
      return { ok: true, key, url, bucket: BUCKET, region: REGION }
    }

    if (action === 'signGet') {
      const raw = Array.isArray(body.keys) ? body.keys.filter(Boolean).slice(0, 20) : []
      if (!raw.length) return { ok: false, error: '缺少 keys' }
      const urls = {}
      const rejected = []
      for (let i = 0; i < raw.length; i++) {
        const parsed = normalizeKey(raw[i])
        if (!parsed.ok) {
          rejected.push(String(raw[i]))
          continue
        }
        /* 返回结构沿用原始 key，前端取值逻辑不用改 */
        urls[raw[i]] = await signUrl(parsed.key, 'GET', 3600)
      }
      if (!Object.keys(urls).length) {
        return { ok: false, error: '所有 key 都不在允许目录内', rejected }
      }
      return { ok: true, urls, ...(rejected.length ? { rejected } : {}) }
    }

    return { ok: false, error: '未知 action：' + action }
  } catch (e) {
    return { ok: false, error: (e && e.message) ? e.message : String(e) }
  }
}
