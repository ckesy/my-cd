/**
 * 测试单据生成器
 * ============================================================
 * 目的：业务测试需要「待打款」「审核中」这两种单，库里现成的不一定够。
 * 这里按当前车队的真实运单造几笔费用单，测完可以一键删除。
 *
 * ⚠️ 会写生产库。所以：
 *   - 默认 dry-run，只打印要写什么，不真写
 *   - 必须加 --yes 才执行
 *   - 生成的单据 report_no 带 TEST- 前缀，清理时按前缀删
 *
 * 用法：
 *   node tools/biz-seed.mjs                 # 预览
 *   node tools/biz-seed.mjs --yes           # 真造
 *   node tools/biz-seed.mjs --clean --yes   # 删掉所有 TEST- 单
 */

import { randomUUID } from 'crypto'

const GW = 'https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com'
const DEVICE = randomUUID()
const YES = process.argv.includes('--yes')
const CLEAN = process.argv.includes('--clean')

let TOKEN = null

const C = {
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  d: (s) => `\x1b[90m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
}

async function login() {
  const r = await fetch(`${GW}/auth/v1/signin/anonymously`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-device-id': DEVICE },
    body: '{}',
  })
  const j = await r.json()
  const tk = j.access_token || (j.data && j.data.access_token)
  if (!tk) throw new Error('匿名登录失败')
  return tk
}

async function q(table, query = '', method = 'GET', body) {
  const url = `${GW}/v1/rdb/rest/${table}${query ? '?' + query : ''}`
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    'x-device-id': DEVICE,
    Accept: 'application/json',
    'Accept-Profile': 'public',
    'Content-Profile': 'public',
  }
  if (body) headers['Content-Type'] = 'application/json'
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const txt = await r.text()
  let data = null
  try { data = txt ? JSON.parse(txt) : null } catch { data = txt }
  return { ok: r.ok, status: r.status, data }
}

const nowIso = () => new Date().toISOString()
const enc = encodeURIComponent

;(async () => {
  TOKEN = await login()
  console.log(C.d('匿名登录 OK\n'))

  /* ---------- 清理 ---------- */
  if (CLEAN) {
    const hit = await q('reports', `select=id,report_no&report_no=like.${enc('TEST-%')}`)
    const rows = hit.ok && Array.isArray(hit.data) ? hit.data : []
    console.log(C.b(`找到 ${rows.length} 条 TEST- 单`))
    rows.slice(0, 20).forEach((r) => console.log(C.d('  · ' + r.report_no)))
    if (!rows.length) return
    if (!YES) {
      console.log(C.y('\n预览模式，加 --yes 才会真删'))
      return
    }
    const del = await q('reports', `report_no=like.${enc('TEST-%')}`, 'DELETE')
    console.log(del.ok ? C.g(`已删除 ${rows.length} 条`) : C.r('删除失败：' + JSON.stringify(del.data).slice(0, 120)))
    return
  }

  /* ---------- 找一个真实运单和车队 ---------- */
  /* ⚠️ waybills 实际没有 org_id / plate 字段，plate 用 vehicle；
     且管理员建的运单 owner_account 为 null → 车队从 tenant_modules 反推 */
  const wb = await q('waybills', 'select=id,waybill_no,owner_account,driver,vehicle,status&limit=5')
  if (!wb.ok || !(wb.data || []).length) {
    console.log(C.r('没有运单可用，先在 Web 端建一条运单再来'))
    console.log(C.d('  返回：' + JSON.stringify(wb.data).slice(0, 160)))
    return
  }
  const w = wb.data[0]

  let owner = String(w.owner_account || '').trim()
  if (!owner) {
    const mods = await q('tenant_modules', 'select=owner_account&limit=20')
    const list = mods.ok && Array.isArray(mods.data)
      ? [...new Set(mods.data.map((x) => x.owner_account).filter(Boolean))] : []
    if (list.length === 1) {
      owner = list[0]
      console.log(C.y(`运单 owner_account 为空（管理员建的单），按唯一车队处理：${owner}\n`))
    } else if (list.length > 1) {
      console.log(C.r(`运单没有归属车队，且库里有 ${list.length} 个车队，无法自动判断。`))
      console.log(C.d('  可选：' + list.join(', ')))
      return
    } else {
      console.log(C.r('既没有归属车队，也没有模块配置，先跑迁移 + 建车队'))
      return
    }
  }
  console.log(C.b('目标车队：') + owner)
  console.log(C.b('挂靠运单：') + `${w.waybill_no}  ·  ${w.driver || '-'}  ·  ${w.vehicle || '-'}  ·  ${w.status}\n`)

  const base = {
    type: 'expense',
    waybill_id: w.id,
    waybill_no: w.waybill_no,
    owner_account: owner,
    org_id: w.org_id || null,
    driver_name: w.driver || null,
    driver_phone: null,
    plate: String(w.vehicle || '').slice(0, 30) || null,
    images: [],
    create_time: nowIso(),
    update_time: nowIso(),
  }

  const plans = [
    {
      tag: '待打款（测「付款登记」）',
      row: {
        ...base,
        report_no: 'TEST-TOPAY-1',
        amount: 1280,
        payload: { items: [{ name: '运费', amount: 1280 }], note: '测试单' },
        status: '待打款',
        pay_required: true,
        approval_enabled: true,
        current_level: 0,
        flow: [{ level: 1, role: 'finance', name: '财务', status: '已通过', acted_at: nowIso() }],
      },
    },
    {
      tag: '审核中（测「待办审批」）',
      row: {
        ...base,
        report_no: 'TEST-PENDING-1',
        amount: 680,
        payload: { items: [{ name: '过路费', amount: 680 }], note: '测试单' },
        status: '审核中',
        pay_required: true,
        approval_enabled: true,
        current_level: 1,
        flow: [{
          level: 1, role: 'finance', approver_id: null, account: '', name: '财务',
          status: '待处理', acted_at: null,
        }],
      },
    },
    {
      tag: '已通过（对照组，不该出现在待办里）',
      row: {
        ...base,
        report_no: 'TEST-DONE-1',
        amount: 520,
        payload: { items: [{ name: '停车费', amount: 520 }], note: '测试单' },
        status: '已通过',
        pay_required: false,
        approval_enabled: true,
        current_level: 0,
        flow: [{ level: 1, role: 'finance', name: '财务', status: '已通过', acted_at: nowIso() }],
      },
    },
  ]

  console.log(C.b('将写入 3 条：'))
  plans.forEach((p) => {
    console.log(`  · ${p.row.report_no.padEnd(16)} ¥${String(p.row.amount).padEnd(6)} ${p.row.status.padEnd(4)} pay_required=${p.row.pay_required}`)
    console.log(C.d(`      ${p.tag}`))
  })

  if (!YES) {
    console.log(C.y('\n预览模式，什么都没写。确认无误后加 --yes 执行。'))
    console.log(C.d('清理：node tools/biz-seed.mjs --clean --yes'))
    return
  }

  /* ---------- 逐个写（已存在的跳过） ---------- */
  console.log('')
  for (const p of plans) {
    const exist = await q('reports', `select=id&report_no=eq.${enc(p.row.report_no)}`)
    if (exist.ok && (exist.data || []).length) {
      console.log(C.y(`  - ${p.row.report_no} 已存在，跳过`))
      continue
    }
    const ins = await q('reports', '', 'POST', p.row)
    if (ins.ok) {
      console.log(C.g(`  ✓ ${p.row.report_no} 已写入`))
    } else {
      console.log(C.r(`  ✗ ${p.row.report_no} 失败：${JSON.stringify(ins.data).slice(0, 160)}`))
      /* pay_required 列不存在时给个明确提示 */
      if (String(JSON.stringify(ins.data)).includes('pay_required')) {
        console.log(C.y('    → reports.pay_required 列不存在，先跑迁移 SQL'))
      }
    }
  }

  console.log('\n' + C.b('接下来：'))
  console.log('  1. 财务账号登录小程序 → 底栏应出现「待登记」，角标 1')
  console.log('  2. 「待办」里应有 1 笔 ¥680 待审')
  console.log('  3. 台账「已付款」里不应有这 3 笔（对照组在已通过）')
  console.log(C.d('\n清理：node tools/biz-seed.mjs --clean --yes'))
})()
