// dongfeng-lostlocation/index.js
// 东风车辆位置数据：当天无数据 → 往前推，最多 3 天
// v2 优化：加 HTTP 超时（8秒），防止请求挂死拖垮云函数
const https = require('https')

function httpsGet(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const req = https.request({
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CloudBaseFunction/1.0)',
        'Accept': 'application/json',
      },
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

    // ⭐⭐⭐ 关键：8 秒超时，避免请求挂死
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`请求超时 (${timeoutMs}ms)`))
    })

    req.on('error', reject)
    req.end()
  })
}

function getDayRangeCN(dayOffset = 0) {
  const now = new Date()
  const cn = new Date(now.getTime() + 8 * 60 * 60 * 1000 - dayOffset * 24 * 60 * 60 * 1000)
  const y = cn.getUTCFullYear()
  const m = String(cn.getUTCMonth() + 1).padStart(2, '0')
  const d = String(cn.getUTCDate()).padStart(2, '0')
  return {
    startTime: `${y}-${m}-${d} 00:00:00`,
    endTime: `${y}-${m}-${d} 23:59:59`,
  }
}

exports.main = async (event, context) => {
  const t0 = Date.now()
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
    let params = {}
    if (event.body) {
      params = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {})
    } else if (event.queryStringParameters) {
      params = event.queryStringParameters
    } else {
      params = event
    }

    let chassisNo = params.chassisNo
    if (!chassisNo && params.vin) {
      chassisNo = String(params.vin).slice(-8)
    }
    if (!chassisNo) {
      return { statusCode: 400, headers, body: JSON.stringify({ code: -1, msg: '缺少参数 chassisNo 或 vin' }) }
    }

    const token = process.env.DONGFENG_TOKEN
    if (!token) {
      return { statusCode: 500, headers, body: JSON.stringify({ code: -1, msg: 'DONGFENG_TOKEN 未配置' }) }
    }

    // 循环 3 天：今天 → 昨天 → 前天，命中即返回
    for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
      const { startTime, endTime } = getDayRangeCN(dayOffset)
      const query = new URLSearchParams({ token, chassisNo, startTime, endTime })
      const url = `https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/dataforward/forward/locationData?${query.toString()}`

      const reqStart = Date.now()
      let result
      try {
        result = await httpsGet(url, 8000)   // ⭐ 8 秒超时
      } catch (e) {
        const cost = Date.now() - reqStart
        console.warn(`[东风位置] dayOffset=${dayOffset} ${chassisNo} 请求失败 (${cost}ms):`, e.message)
        continue
      }

      const cost = Date.now() - reqStart
      const payload = result.data || {}
      if (payload.code === 1 && Array.isArray(payload.data) && payload.data.length > 0) {
        console.log(`[东风位置] dayOffset=${dayOffset} ${chassisNo} 命中 ${payload.data.length} 条 (${cost}ms)`)
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ ...payload, dayOffset }),
        }
      }
      console.log(`[东风位置] dayOffset=${dayOffset} ${chassisNo} 无数据 (${cost}ms)`)
    }

    const totalCost = Date.now() - t0
    console.log(`[东风位置] ${chassisNo} 近 3 天无数据 (总耗时 ${totalCost}ms)`)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ code: 1, msg: '近 3 天无数据', data: [], dayOffset: -1 }),
    }
  } catch (error) {
    console.error('[东风位置] 异常:', error)
    return { statusCode: 400, headers, body: JSON.stringify({ code: -1, msg: error.message }) }
  }
}