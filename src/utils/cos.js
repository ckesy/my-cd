/**
 * COS 直传 / 取图（Web 端）
 * ============================================================
 * 背景：业务库所在 CloudBase 环境是 PostgreSQL 类型，**云存储不可用**
 *   （`Storage is not supported in PostgreSQL env`），
 *   所以文件统一走腾讯云对象存储 COS：
 *   云函数 `upload-photo` 只签发地址，浏览器拿到签名后直接 PUT / GET。
 *
 * 约定
 *   - 上传：signPut(key) → fetch PUT 二进制
 *   - 展示：signGet([key]) → 1 小时有效的临时链接
 *   - 业务表里存 { key, name, size }，不要再存 fileID
 *
 * ⚠️ 桶需要配置 CORS（来源 *、方法 PUT/GET/HEAD），否则浏览器直传会被拦。
 */

const COS_API =
  'https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com/uploadPhoto'

/** 桶名（报错文案里要指名道姓，方便照着去控制台加规则） */
const COS_BUCKET = 'wuxian-fleet-1447716425'

/**
 * ⭐ 浏览器直传 COS 命中跨域时，fetch 只会抛 `TypeError: Failed to fetch`，
 *    看不出是 CORS 还是网络。这里统一翻译成能照着修的提示。
 *    判定依据：PUT + content-type 必然触发 OPTIONS 预检，
 *    桶没配 CORS（或不含 PUT）就一定走到这里。
 */
function corsHint(action) {
  console.warn('[COS] ' + action + '预检失败：桶 ' + COS_BUCKET + ' 未放行跨域。' +
    '需在 COS 控制台加 CORS：来源 *、方法 PUT/GET/HEAD/POST、Allow-Headers *、Expose-Headers ETag')
  return `${action}被浏览器拦截（Failed to fetch）：COS 桶未配置跨域。` +
    '请到 COS 控制台 → 该桶 → 安全管理 → 跨域访问CORS，添加规则：' +
    '来源 *、方法 PUT/GET/HEAD/POST、Allow-Headers *、Expose-Headers ETag'
}

async function post(body) {
  let res
  try {
    res = await fetch(COS_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (e) {
    throw new Error('签名服务不可达（网络或跨域）：' + COS_API)
  }
  if (!res.ok) throw new Error('签名服务返回 HTTP ' + res.status)
  const data = await res.json()
  if (!data || !data.ok) throw new Error((data && data.error) || '签名失败')
  return data
}

/** 拿上传签名地址 */
export async function signPut(key) {
  const data = await post({ action: 'signPut', path: key })
  if (!data.url) throw new Error('签名失败：没有返回 url')
  return data.url
}

/* ⚠️ 云函数 upload-photo 一次最多签 20 个 key（`keys.slice(0, 20)`），
   传 30 个只会回前 20 个 —— 剩下的在页面上永远没有链接。
   所以这里必须自己分批，调用方无感。 */
const SIGN_BATCH = 20

/** 批量拿下载临时链接：{ key: url }  —— 自动分批，>20 个也不会丢 */
export async function signGet(keys) {
  const list = [...new Set((keys || []).filter(Boolean))]
  if (!list.length) return {}
  const out = {}
  for (let i = 0; i < list.length; i += SIGN_BATCH) {
    const data = await post({ action: 'signGet', keys: list.slice(i, i + SIGN_BATCH) })
    Object.assign(out, data.urls || {})
  }
  return out
}

/* ============================================================
   ⭐ 带 TTL 的取图缓存（解决「有时候图片加载不出来」）
   ------------------------------------------------------------
   COS 临时链接只有 1 小时有效。以前详情页只在进页面时签一次，
   页面挂着超过 1 小时、或复用上次签的旧链接 → 图片直接 403，
   el-image 就显示「加载失败」。
   这里统一做：50 分钟 TTL + 过期自动重签 + 单 key 失效可强刷。
   ============================================================ */
const URL_TTL = 50 * 60 * 1000 // 签名 1h，留 10min 余量
const urlCache = new Map() // key -> { url, at }

/** 只读缓存：拿不到/已过期返回 '' */
export function cachedCosUrl(key) {
  const hit = urlCache.get(key)
  if (!hit) return ''
  if (Date.now() - hit.at > URL_TTL) {
    urlCache.delete(key)
    return ''
  }
  return hit.url
}

/** 图片加载失败时调它：先扔掉这个链接，下次取会重新签 */
export function forgetCosUrl(key) {
  if (key) urlCache.delete(key)
}

/**
 * 取图（缓存优先）：{ key: url }
 * @param {string[]} keys
 * @param {{ force?: boolean }} opts force=true 时不看缓存，强制重签
 */
export async function signGetCached(keys, opts = {}) {
  const list = [...new Set((keys || []).filter(Boolean))]
  if (!list.length) return {}

  const out = {}
  const need = []
  list.forEach((k) => {
    const hit = opts.force ? '' : cachedCosUrl(k)
    if (hit) out[k] = hit
    else need.push(k)
  })

  if (need.length) {
    /* 同一个 key 同时被多个组件要 → 共用一次请求，避免并发重复签 */
    const map = await signGet(need)
    Object.keys(map).forEach((k) => urlCache.set(k, { url: map[k], at: Date.now() }))
    Object.assign(out, map)
  }
  return out
}

/** 把文件 PUT 到 COS */
export async function putToCos(url, file) {
  let res
  try {
    res = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': (file && file.type) || 'application/octet-stream' },
      body: file,
    })
  } catch (e) {
    /* 走不到 Response 就说明请求被浏览器拦了（预检失败 / CORS / 断网） */
    throw new Error(corsHint('照片直传 COS '))
  }
  if (!res.ok) throw new Error('上传返回 HTTP ' + res.status)
  return res
}

/** 生成对象 key：目录 + 时间戳 + 随机串 + 扩展名 */
export function cosKey(prefix, name) {
  const ext = (String(name || '').split('.').pop() || 'bin').toLowerCase().slice(0, 6)
  const rand = Math.random().toString(36).slice(2, 7)
  return `${prefix}/${Date.now()}-${rand}.${ext}`
}
