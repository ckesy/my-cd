// amap-geofence-list/index.js —— 查询围栏列表
const https = require('https')

function httpsRequest(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const req = https.request({
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
    }, (res) => {
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
    req.end()
  })
}

exports.main = async (event, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    const key = process.env.AMAP_WEB_KEY
    const sid = process.env.AMAP_SID

    if (!key || !sid) {
      return { statusCode: 500, headers, body: JSON.stringify({ errcode: -1, errmsg: '高德 Key 或 SID 未配置' }) }
    }

    const url = `https://tsapi.amap.com/v1/track/geofence/list?key=${key}&sid=${sid}`
    console.log('[围栏列表] 请求高德:', url)

    const result = await httpsRequest(url)
    console.log('[围栏列表] 高德返回:', JSON.stringify(result.data))

    return { statusCode: 200, headers, body: JSON.stringify(result.data) }
  } catch (error) {
    console.error('[围栏列表] 异常:', error)
    return { statusCode: 400, headers, body: JSON.stringify({ errcode: -1, errmsg: error.message }) }
  }
}