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

async function post(body) {
  const res = await fetch(COS_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
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

/** 批量拿下载临时链接：{ key: url } */
export async function signGet(keys) {
  const list = (keys || []).filter(Boolean)
  if (!list.length) return {}
  const data = await post({ action: 'signGet', keys: list })
  return data.urls || {}
}

/** 把文件 PUT 到 COS */
export async function putToCos(url, file) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': (file && file.type) || 'application/octet-stream' },
    body: file,
  })
  if (!res.ok) throw new Error('上传返回 HTTP ' + res.status)
}

/** 生成对象 key：目录 + 时间戳 + 随机串 + 扩展名 */
export function cosKey(prefix, name) {
  const ext = (String(name || '').split('.').pop() || 'bin').toLowerCase().slice(0, 6)
  const rand = Math.random().toString(36).slice(2, 7)
  return `${prefix}/${Date.now()}-${rand}.${ext}`
}
