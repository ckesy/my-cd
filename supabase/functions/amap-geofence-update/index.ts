import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2/cors'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { shape, gfid, name, desc, center, radius, points, bufferradius, adcode } = body

    console.log('【更新围栏】收到请求：', JSON.stringify(body))

    if (!gfid) {
      return new Response(
        JSON.stringify({ errcode: -1, errmsg: '缺少参数 gfid' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const key = Deno.env.get('AMAP_WEB_KEY')
    const sid = Deno.env.get('AMAP_SID')

    if (!key || !sid) {
      return new Response(
        JSON.stringify({ errcode: -1, errmsg: '高德 Key 或 SID 未配置' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    let url = ''
    const params = { key, sid, gfid, name }
    if (desc) params.desc = desc

    switch (shape) {
      case 'circle':
        url = 'https://tsapi.amap.com/v1/track/geofence/update/circle'
        params.center = center
        params.radius = String(radius)
        break
      case 'polygon':
        url = 'https://tsapi.amap.com/v1/track/geofence/update/polygon'
        params.points = points
        break
      case 'polyline':
        url = 'https://tsapi.amap.com/v1/track/geofence/update/polyline'
        params.points = points
        params.bufferradius = String(bufferradius)
        break
      case 'district':
        url = 'https://tsapi.amap.com/v1/track/geofence/update/district'
        params.adcode = adcode
        break
      default:
        throw new Error('未知的围栏形状：' + shape)
    }

    console.log('【更新围栏】转发到高德：', url, params)

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    })

    const data = await response.json()

    console.log('【更新围栏】高德返回：', JSON.stringify(data))

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('【更新围栏】异常：', error)
    return new Response(
      JSON.stringify({ errcode: -1, errmsg: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
