/**
 * 临时排查：AI 助手最近日志（只读）
 * 用法：node tools/_tmp-ai-log.mjs
 */
import { randomUUID } from 'crypto'

const GW = 'https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com'
const DEVICE = randomUUID()

async function login() {
  const r = await fetch(`${GW}/auth/v1/signin/anonymously`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-device-id': DEVICE },
    body: '{}',
  })
  const j = await r.json()
  const tk = j.access_token || (j.data && j.data.access_token)
  if (!tk) throw new Error('匿名登录失败：' + JSON.stringify(j).slice(0, 200))
  return tk
}

async function q(table, query = '') {
  const url = `${GW}/v1/rdb/rest/${table}?${query}`
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'x-device-id': DEVICE,
      Accept: 'application/json',
      'Accept-Profile': 'public',
    },
  })
  const txt = await r.text()
  let data = null
  try { data = txt ? JSON.parse(txt) : null } catch { data = txt }
  return { ok: r.ok, status: r.status, data }
}

const TOKEN = await login()

const logs = await q('ai_assistant_logs', 'select=*&order=created_at.desc&limit=12')
console.log('ai_assistant_logs:', logs.status, Array.isArray(logs.data) ? `${logs.data.length} 行` : logs.data)
if (Array.isArray(logs.data)) {
  for (const r of logs.data) {
    console.log([
      r.created_at,
      'client=' + (r.client || '-'),
      'account=' + (r.account_id || '-'),
      'tenant=' + (r.owner_account || '-'),
      'q=' + String(r.question || '').slice(0, 24),
      'intent=' + (r.intent || '-'),
      'status=' + (r.status || '-'),
      'err=' + (r.error_code || '-'),
      'rows=' + (r.rows_returned ?? '-'),
    ].join('  '))
  }
}

const sess = await q('ai_sessions', 'select=token,account,expires_at,created_at&order=created_at.desc&limit=8')
console.log('\nai_sessions:', sess.status, Array.isArray(sess.data) ? `${sess.data.length} 行` : sess.data)
if (Array.isArray(sess.data)) {
  for (const s of sess.data) {
    console.log([s.created_at, 'account=' + s.account, 'exp=' + s.expires_at, 'token=' + String(s.token || '').slice(0, 10) + '…'].join('  '))
  }
}
