/**
 * report-ocr —— 加油 / 加气小票文字识别（腾讯云 OCR）
 * ============================================================
 * 为什么要有这个云函数：
 *   小程序里没有任何「离线 OCR」能力，识别必须借助外部服务。
 *   项目里已经有腾讯云的密钥（COS 直传用的那对），所以直接调腾讯云 OCR，
 *   不额外引入第三方账号，也不走微信服务市场（要单独申请权限）。
 *
 * 调用（小程序端）
 *   wx.cloud.callFunction({ name: 'report-ocr', data: { image: '<base64，不带 data: 前缀>' } })
 *   → { code: 0, lines: ['中国石化', '95号汽油', '单价 7.35', ...] }
 *   → { code: 400/413/500/502, message: '...' }   失败时前端要能退化到手动填写
 *
 * 需要配置的环境变量（CloudBase 控制台 → 云函数 → report-ocr → 函数配置 → 环境变量）
 *   OCR_SECRET_ID  / OCR_SECRET_KEY   优先用这对；没配则回落到 COS_SECRET_ID / COS_SECRET_KEY
 *   OCR_REGION     可选，默认 ap-shanghai
 *
 * ⚠️ 识别出来的只是文字，数字怎么取是小程序端 src/utils/ocr-parse.js 的事。
 *    两边分工：这里只负责「图 → 文本行」。
 */

const crypto = require('crypto')
const https = require('https')

const HOST = 'ocr.tencentcloudapi.com'
const SERVICE = 'ocr'
const REGION = process.env.OCR_REGION || 'ap-shanghai'

function getKeys() {
  return {
    id: process.env.OCR_SECRET_ID || process.env.COS_SECRET_ID || '',
    key: process.env.OCR_SECRET_KEY || process.env.COS_SECRET_KEY || '',
  }
}

const sha256hex = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex')
const hmac = (key, msg) => crypto.createHmac('sha256', key).update(msg, 'utf8').digest()

/* TC3-HMAC-SHA256 签名 + 请求（官方文档那套，别改顺序） */
function tc3Request(action, version, payload, timeout = 15000) {
  const { id, key } = getKeys()
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload || {})
    const ts = Math.floor(Date.now() / 1000)
    const date = new Date(ts * 1000).toISOString().slice(0, 10)
    const contentType = 'application/json; charset=utf-8'

    const canonicalHeaders = `content-type:${contentType}\nhost:${HOST}\n`
    const signedHeaders = 'content-type;host'
    const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, sha256hex(body)].join('\n')
    const scope = `${date}/${SERVICE}/tc3_request`
    const stringToSign = ['TC3-HMAC-SHA256', String(ts), scope, sha256hex(canonicalRequest)].join('\n')
    const kDate = hmac('TC3' + key, date)
    const kService = hmac(kDate, SERVICE)
    const kSigning = hmac(kService, 'tc3_request')
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex')
    const authorization =
      `TC3-HMAC-SHA256 Credential=${id}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

    const req = https.request(
      {
        host: HOST,
        method: 'POST',
        path: '/',
        timeout,
        headers: {
          Authorization: authorization,
          'Content-Type': contentType,
          Host: HOST,
          'X-TC-Action': action,
          'X-TC-Timestamp': String(ts),
          'X-TC-Version': version,
          'X-TC-Region': REGION,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = ''
        res.on('data', (c) => { raw += c })
        res.on('end', () => {
          let data = null
          try {
            data = JSON.parse(raw || '{}')
          } catch (e) {
            reject(new Error('OCR 返回不是 JSON：' + raw.slice(0, 120)))
            return
          }
          const r = data.Response || {}
          if (r.Error) {
            reject(new Error(`${r.Error.Code || 'Error'}: ${r.Error.Message || '识别失败'}`))
            return
          }
          resolve(r)
        })
      }
    )
    req.on('timeout', () => { req.destroy(new Error('OCR 请求超时')) })
    req.on('error', (e) => reject(e))
    req.write(body)
    req.end()
  })
}

/** 从 Response 里抽文本行（高精度版是 TextDetections[].DetectedText） */
function linesOf(resp) {
  const dets = (resp && resp.TextDetections) || []
  return dets.map((d) => String((d && d.DetectedText) || '').trim()).filter(Boolean)
}

exports.main = async (event) => {
  const image = String((event && event.image) || '').replace(/^data:image\/[a-z+]+;base64,/i, '').trim()
  if (!image) return { code: 400, message: '缺少图片数据' }

  const { id, key } = getKeys()
  if (!id || !key) {
    return { code: 500, message: 'OCR 密钥未配置：请给 report-ocr 配 OCR_SECRET_ID / OCR_SECRET_KEY' }
  }

  /* 腾讯云 OCR 单图上限 7MB，这里留余量到 6MB（base64 会比原图大 1/3） */
  const bytes = Math.ceil((image.length * 3) / 4)
  if (bytes > 6 * 1024 * 1024) return { code: 413, message: '图片太大，请重拍（控制在 6MB 内）' }

  try {
    let resp
    try {
      /* 高精度版：小票这种小字更准 */
      resp = await tc3Request('GeneralAccurateOCR', '2018-11-19', { ImageBase64: image })
    } catch (e) {
      /* 高精度版偶发限频/不支持时退回通用版，别让司机白拍一次 */
      if (/LimitExceeded|FailedOperation|RequestLimitExceeded/i.test(String(e && e.message))) {
        resp = await tc3Request('GeneralBasicOCR', '2018-11-19', { ImageBase64: image })
      } else {
        throw e
      }
    }
    const lines = linesOf(resp)
    return { code: 0, lines, requestId: (resp && resp.RequestId) || '' }
  } catch (e) {
    const msg = String((e && e.message) || e || '识别失败')
    /* 把最常见的几类翻译成人话，前端直接能显示 */
    if (/AuthFailure|Signature/i.test(msg)) return { code: 502, message: 'OCR 密钥无效或无权限' }
    if (/ResourceNotFound|not activated|UnauthorizedOperation/i.test(msg)) {
      return { code: 502, message: '腾讯云 OCR 服务未开通（控制台开通后重试）' }
    }
    return { code: 502, message: msg.slice(0, 120) }
  }
}