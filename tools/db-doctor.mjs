/**
 * 数据库体检 · 只读
 * ============================================================
 * 直连腾讯云 CloudBase（和云函数、Web 端同一条 REST 通道），
 * 用匿名登录跑一遍迁移检查和数据巡检。**不写任何数据**。
 *
 * 用法：node tools/db-doctor.mjs
 */

import { randomUUID } from 'crypto'

const GW = 'https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com'
const DEVICE = randomUUID()

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
  if (!tk) throw new Error('匿名登录失败：' + JSON.stringify(j).slice(0, 200))
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

const problems = []
const warns = []

function line(label, ok, detail) {
  const mark = ok ? C.g('✓') : C.r('✗')
  console.log(`  ${mark} ${label}${detail ? C.d('  ' + detail) : ''}`)
  if (!ok) problems.push(label + (detail ? ' — ' + detail : ''))
}

function warn(label, detail) {
  console.log(`  ${C.y('!')} ${label}${detail ? C.d('  ' + detail) : ''}`)
  warns.push(label + (detail ? ' — ' + detail : ''))
}

;(async () => {
  console.log('\n' + C.b('数据库体检 · ' + new Date().toLocaleString('zh-CN')))
  console.log(C.d('环境 wuxian-token-d0guymjkpadcd1f22 · 只读，不修改任何数据\n'))

  TOKEN = await login()
  console.log(C.d('匿名登录 OK\n'))

  /* ---------- 1. 迁移列 ---------- */
  console.log(C.b('① 迁移检查（三列 + pay_required）'))
  let pays = []
  const payTest = await q('reports', 'select=id,status,pay_required,amount&limit=1')
  const hasPayRequired = payTest.ok
  line('reports.pay_required 列存在', hasPayRequired,
    hasPayRequired ? '' : `查询报错：${String(payTest.data?.message || '').slice(0, 60)}`)

  const modTest = await q('tenant_modules', 'select=id,config&limit=1')
  line('tenant_modules.config 列存在', modTest.ok,
    modTest.ok ? '' : `查询报错：${String(modTest.data?.message || '').slice(0, 60)}`)

  const roleTest = await q('roles', 'select=id,role_type&limit=1')
  line('roles.role_type 列存在', roleTest.ok,
    roleTest.ok ? '' : `查询报错：${String(roleTest.data?.message || '').slice(0, 60)}`)

  /* ---------- 2. 模块表 ---------- */
  console.log('\n' + C.b('② 模块表 tenant_modules'))
  const mods = await q('tenant_modules', 'select=*')
  if (!mods.ok) {
    line('读取模块表', false, mods.data?.message)
  } else {
    const rows = mods.data || []
    line('读取成功', true, `${rows.length} 行`)

    /* 按车队聚合 */
    const byOwner = {}
    rows.forEach((r) => {
      byOwner[r.owner_account] = byOwner[r.owner_account] || {}
      byOwner[r.owner_account][r.module_key] = r.enabled
    })
    const owners = Object.keys(byOwner)
    console.log(C.d(`    共 ${owners.length} 个车队：`))
    owners.slice(0, 10).forEach((o) => {
      const m = byOwner[o]
      const on = Object.keys(m).filter((k) => m[k] === true)
      const off = Object.keys(m).filter((k) => m[k] !== true)
      console.log(`    ${o.padEnd(14)} 开: ${on.join(',') || '无'}${off.length ? C.d('  关: ' + off.join(',')) : ''}`)
    })
    if (owners.length > 10) console.log(C.d(`    …… 还有 ${owners.length - 10} 个`))

    /* 缺 waybill 行的车队 */
    const wb = await q('waybills', 'select=owner_account&limit=1000')
    if (wb.ok) {
      const wbOwners = new Set((wb.data || []).map((x) => x.owner_account).filter(Boolean))
      const missing = [...wbOwners].filter((o) => byOwner[o]?.waybill === undefined)
      if (missing.length) {
        warn(`${missing.length} 个车队有运单但没有 waybill 模块行`, missing.slice(0, 5).join(', '))
        console.log(C.d('    （代码有默认开会兜底，但画布上看不到这一行）'))
      } else {
        line('有运单的车队都有 waybill 行', true)
      }
    }
  }

  /* ---------- 3. 费用单现状 ---------- */
  console.log('\n' + C.b('③ 费用单 reports'))
  if (hasPayRequired) {
    const all = await q('reports', 'select=id,status,pay_required,owner_account,amount&limit=1000')
    if (all.ok) {
      const rows = all.data || []
      const st = {}
      rows.forEach((r) => { st[r.status] = (st[r.status] || 0) + 1 })
      console.log(`    共 ${rows.length} 条`)
      Object.keys(st).forEach((k) => console.log(`    ${C.d('·')} ${k}: ${st[k]}`))

      const bad = rows.filter((r) => ['待打款', '已打款'].includes(r.status) && r.pay_required !== true)
      if (bad.length) {
        warn(`${bad.length} 条「待打款/已打款」但 pay_required 不是 true`, '回填可能没跑到')
      } else {
        line('待打款/已打款 的 pay_required 全部为 true', true)
      }

      const nulls = rows.filter((r) => r.pay_required === null || r.pay_required === undefined)
      if (nulls.length) warn(`${nulls.length} 条 pay_required 为空`, '（代码按 false 处理，不影响）')

      const pending = rows.filter((r) => r.status === '审核中').length
      const toPay = rows.filter((r) => r.status === '待打款' && r.pay_required === true).length
      console.log(`\n    在途：${C.b('待审 ' + pending)} · ${C.b('待付款 ' + toPay)}`)
      if (pending || toPay) {
        console.log(C.d('    ⚠️ 关运单前要注意这些会卡住（画布的影响预览会显示）'))
      } else {
        console.log(C.d('    ✓ 可以安全做「关模块」类测试'))
      }
    }
  } else {
    warn('pay_required 列不存在，跳过费用单统计', '先跑 sql/2026-10-20_flow_modules.sql')
  }

  /* ---------- 4. 财务角色 ---------- */
  console.log('\n' + C.b('④ 财务角色 roles'))
  if (roleTest.ok) {
    const roles = await q('roles', 'select=id,name,role_type')
    if (roles.ok) {
      const rows = roles.data || []
      const fin = rows.filter((r) => r.role_type === 'finance')
      const byName = rows.filter((r) => String(r.name || '').includes('财务'))
      line('财务角色已打标', fin.length > 0 || byName.length === 0,
        `finance ${fin.length} 个 · 名字带财务 ${byName.length} 个`)
      const untagged = byName.filter((r) => r.role_type !== 'finance')
      if (untagged.length) warn(`${untagged.length} 个名字带「财务」但没打标`, untagged.map((r) => r.name).join(', '))
    }
  }

  /* ---------- 5. 审批配置 ---------- */
  console.log('\n' + C.b('⑤ 审批配置 fee_approval_configs'))
  const cfg = await q('fee_approval_configs', 'select=owner_account,mode,threshold,require_owner,l2_user_id')
  if (cfg.ok) {
    const rows = cfg.data || []
    if (!rows.length) {
      warn('没有任何审批配置', '（代码按 mode=on 处理，即走审批）')
    } else {
      rows.slice(0, 10).forEach((r) => {
        console.log(`    ${String(r.owner_account).padEnd(14)} mode=${C.b(r.mode || '(空→on)')} 阈值=${r.threshold ?? '-'} 老板必审=${r.require_owner === true}`)
      })
    }
  }

  /* ---------- 结论 ---------- */
  console.log('\n' + '─'.repeat(52))
  if (!problems.length && !warns.length) {
    console.log(C.g(C.b('  全部通过，可以开始业务测试')))
  } else {
    if (problems.length) {
      console.log(C.r(C.b(`  阻断问题 ${problems.length} 个：`)))
      problems.forEach((p) => console.log(C.r('    · ' + p)))
    }
    if (warns.length) {
      console.log(C.y(C.b(`  提示 ${warns.length} 个：`)))
      warns.forEach((p) => console.log(C.y('    · ' + p)))
    }
  }
  console.log('─'.repeat(52) + '\n')
})()
