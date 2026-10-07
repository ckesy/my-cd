import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2/cors'

Deno.serve(async (req) => {
  // 1. 处理浏览器的 CORS 预检请求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. 接收前端传来的参数
    const { name, desc, center, radius } = await req.json()

    // 3. 组装高德需要的表单参数，从环境变量里安全读取 Key 和 SID
    const payload = new URLSearchParams({
      key: Deno.env.get('AMAP_WEB_KEY')!,
      sid: Deno.env.get('AMAP_SID')!,
      name,
      desc: desc || '',
      center,
      radius: String(radius),
    })

    // 4. 转发请求给高德猎鹰 API
    const response = await fetch(
      'https://tsapi.amap.com/v1/track/geofence/add/circle',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payload.toString(),
      }
    )

    const data = await response.json()

    // 5. 把高德的结果原样返回给前端
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    // 6. 出错处理
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})