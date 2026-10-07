import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2/cors'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { gfids } = await req.json()

    console.log('【删除围栏】收到请求：', gfids)

    if (!gfids) {
      return new Response(
        JSON.stringify({ errcode: -1, errmsg: '缺少参数 gfids' }),
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

    const params = new URLSearchParams({ key, sid, gfids })

    const response = await fetch(
      'https://tsapi.amap.com/v1/track/geofence/delete',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      }
    )

    const data = await response.json()

    console.log('【删除围栏】高德返回：', JSON.stringify(data))

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('【删除围栏】异常：', error)
    return new Response(
      JSON.stringify({ errcode: -1, errmsg: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
