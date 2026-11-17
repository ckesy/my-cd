// amap-geofence-update/index.js
const https = require('https')

function httpsRequest(url, options, postData) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const reqOptions = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: options.method || 'POST',
      headers: options.headers || {},
    }
    const req = https.request(reqOptions, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) })
        } catch (e) {
          resolve({ status: res.statusCode, data: { raw: data } })
        }
      })
    })
    req.on('error', reject)
    if (postData) req.write(postData)
    req.end()
  })
}

exports.main = async (event, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    // 👇 兼容 SDK 和 HTTP 网关两种入参方式
    let params = {}
    if (event.body) {
      params = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {})
    } else {
      params = event
    }
    const { shape, gfid, name, desc, center, radius, points, bufferradius, adcode } = params

    console.log('[更新围栏] 收到请求:', JSON.stringify(params))

    if (!gfid) {
      return { statusCode: 400, headers, body: JSON.stringify({ errcode: -1, errmsg: '缺少参数 gfid' }) }
    }

    const key = process.env.AMAP_WEB_KEY
    const sid = process.env.AMAP_SID

    if (!key || !sid) {
      return { statusCode: 500, headers, body: JSON.stringify({ errcode: -1, errmsg: '高德 Key 或 SID 未配置' }) }
    }

    let url = ''
    const amapParams = { key, sid, gfid, name }
    if (desc) amapParams.desc = desc

    switch (shape) {
      case 'circle':
        url = 'https://tsapi.amap.com/v1/track/geofence/update/circle'
        amapParams.center = center
        amapParams.radius = String(radius)
        break
      case 'polygon':
        url = 'https://tsapi.amap.com/v1/track/geofence/update/polygon'
        amapParams.points = points
        break
      case 'polyline':
        url = 'https://tsapi.amap.com/v1/track/geofence/update/polyline'
        amapParams.points = points
        amapParams.bufferradius = String(bufferradius)
        break
      case 'district':
        url = 'https://tsapi.amap.com/v1/track/geofence/update/district'
        amapParams.adcode = adcode
        break
      default:
        throw new Error('未知的围栏形状：' + shape)
    }

    console.log('[更新围栏] 转发到高德:', url)

    const result = await httpsRequest(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
      new URLSearchParams(amapParams).toString()
    )

    console.log('[更新围栏] 高德返回:', JSON.stringify(result.data))

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result.data),
    }
  } catch (error) {
    console.error('[更新围栏] 异常:', error)
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ errcode: -1, errmsg: error.message }),
    }
  }
}