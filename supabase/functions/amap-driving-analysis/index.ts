import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2/cors'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { tid, trid, startTime, endTime, speedLimitThres } = body

    const key = Deno.env.get('AMAP_WEB_KEY')
    const sid = Deno.env.get('AMAP_SID')

    if (!key || !sid) {
      return new Response(
        JSON.stringify({ errcode: -1, errmsg: '高德 Key 或 SID 未配置' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const params = new URLSearchParams({ key, sid, tid, trid })
    if (startTime) params.append('startTime', String(startTime))
    if (endTime) params.append('endTime', String(endTime))
    if (speedLimitThres) params.append('speedLimitThres', String(speedLimitThres))

    const url = 'https://tsapi.amap.com/v1/track/analysis/drivingbehavior?' + params.toString()
    const response = await fetch(url, { method: 'GET' })
    const data = await response.json()

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ errcode: -1, errmsg: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
