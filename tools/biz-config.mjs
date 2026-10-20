/**
 * 测试配置切换器（改的是真实车队的配置，测完记得还原）
 * ============================================================
 * 业务测试要在 6 种组合之间来回切，手敲 SQL 太慢，这里一条命令搞定。
 *
 * 用法：
 *   node tools/biz-config.mjs                        # 看当前
 *   node tools/biz-config.mjs --mode on --payout on  # 改
 *   node tools/biz-config.mjs --mode off --payout off
 *   node tools/biz-config.mjs --restore              # 还原成 mode=on / payout=false
 *
 * 只改这两个开关，不动阈值和审批人。
 */

import { randomUUID } from 'crypto'

const GW = 'https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com'
const DEVICE = randomUUID()

const C = {
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  d: (s) => `\x1b[90m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
}

const arg = (name) => {
  const i = process.argv.indexOf('--' + name)
  return i > -1 ? process.argv[i + 1] : null
}

let TOKEN = null

async function login() {
  const r = await fetch(`${GW}/auth/v1/signin/anonymously`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-device-id': DEVICE },
    body: '{}',
  })
  const j = await r.json()
  return j.access_token || (j.data && j.data.access_token)
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

const modeDesc = (m) => ({ on: '全局开启（所有单都审）', off: '全局关闭（提交即通过）', custom: '自定义（按单票）' }[m] || m)

;(async () => {
  TOKEN = await login()

  const owners = await q('tenant_modules', 'select=owner_account')
  const list = owners.ok && Array.isArray(owners.data)
    ? [...new Set(owners.data.map((x) => x.owner_account).filter(Boolean))] : []
  if (!list.length) {
    console.log(C.r('库里没有车队配置，先跑迁移 SQL'))
    return
  }
  const owner = arg('owner') || list[0]
  if (list.length > 1 && !arg('owner')) {
    console.log(C.y(`有 ${list.length} 个车队：${list.join(', ')}`))
    console.log(C.d(`默认操作第一个，要指定请加 --owner xxx`))
  }

  /* ---------- 读当前 ---------- */
  const cfgRes = await q('fee_approval_configs', `select=mode,threshold,require_owner&owner_account=eq.${encodeURIComponent(owner)}&limit=1`)
  const cfg = (cfgRes.ok && cfgRes.data && cfgRes.data[0]) || { mode: '(无配置→按on)' }
  const modRes = await q('tenant_modules', `select=module_key,enabled&owner_account=eq.${encodeURIComponent(owner)}`)
  const mods = {}
  ;(modRes.data || []).forEach((r) => { mods[r.module_key] = r.enabled === true })

  console.log(C.b(`\n车队 ${owner}`))
  console.log(`  审批策略   ${C.b(cfg.mode || 'on')}  ${C.d(modeDesc(cfg.mode || 'on'))}`)
  console.log(`  金额阈值   ${cfg.threshold ?? '-'}  ${C.d('≥ 此值追加老板终审')}`)
  console.log(`  老板必审   ${cfg.require_owner === true ? '是' : '否'}`)
  console.log(`  付款记录   ${mods.payout === true ? C.g('开') : C.d('关')}`)
  console.log(`  运单模块   ${mods.waybill === true ? C.g('开') : C.r('关')}`)

  /* 财务端会有什么 */
  const auditOn = (cfg.mode || 'on') !== 'off'
  const payoutOn = mods.payout === true
  const tabs = []
  if (auditOn) tabs.push('待办')
  if (payoutOn) tabs.push('待登记')
  if (auditOn || payoutOn) tabs.push('台账')
  tabs.push('我的')
  console.log(`\n  财务端底栏 → ${C.b(tabs.join(' · '))}`)
  if (!auditOn && !payoutOn) console.log(C.y('  ⚠️ 两个都关：财务端不出现，登录回管理端'))

  /* ---------- 改 ---------- */
  const restore = process.argv.includes('--restore')
  const nextMode = restore ? 'on' : arg('mode')
  const nextPayout = restore ? 'false' : arg('payout')

  if (!nextMode && nextPayout === null) {
    console.log(C.d('\n只读模式。改配置示例：'))
    console.log(C.d('  node tools/biz-config.mjs --mode on --payout on'))
    console.log(C.d('  node tools/biz-config.mjs --restore'))
    return
  }

  console.log('')
  if (nextMode) {
    if (!['on', 'off', 'custom'].includes(nextMode)) {
      console.log(C.r('mode 只能是 on / off / custom'))
      return
    }
    const r = await q(
      'fee_approval_configs',
      `owner_account=eq.${encodeURIComponent(owner)}`,
      'PATCH',
      { mode: nextMode, updated_at: new Date().toISOString() }
    )
    console.log(r.ok ? C.g(`  ✓ 审批策略 → ${nextMode}`) : C.r('  审批策略修改失败：' + JSON.stringify(r.data).slice(0, 120)))
  }

  if (nextPayout !== null && nextPayout !== undefined) {
    const want = nextPayout === 'on' || nextPayout === 'true'
    const exist = await q('tenant_modules', `select=id&owner_account=eq.${encodeURIComponent(owner)}&module_key=eq.payout`)
    if (exist.ok && (exist.data || []).length) {
      const r = await q(
        'tenant_modules',
        `owner_account=eq.${encodeURIComponent(owner)}&module_key=eq.payout`,
        'PATCH',
        { enabled: want, updated_by: 'biz-test', updated_at: new Date().toISOString() }
      )
      console.log(r.ok ? C.g(`  ✓ 付款记录 → ${want ? '开' : '关'}`) : C.r('  付款模块修改失败'))
    } else {
      const r = await q('tenant_modules', '', 'POST', {
        owner_account: owner, module_key: 'payout', enabled: want,
        updated_by: 'biz-test', config: {},
      })
      console.log(r.ok ? C.g(`  ✓ 付款记录 → ${want ? '开' : '关'}（新建行）`) : C.r('  付款模块创建失败'))
    }
  }

  console.log(C.d('\n⚠️ 云函数配置缓存 5 秒，改完等 5 秒再测，或重新登录小程序'))
  console.log(C.d('还原：node tools/biz-config.mjs --restore'))
})()
