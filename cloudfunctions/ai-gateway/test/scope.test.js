/**
 * 机构隔离条件单测
 * 背景：drivers.org_id 大量为 NULL，只按 org_id 过滤会把司机表滤成 0 行，
 *      用户明明有档案却被告知「档案里没有这个司机」（2026-11-26 线上问题）。
 */
const test = require('node:test')
const assert = require('node:assert')
const { orgFilterOf } = require('../tools')

test('orgFilterOf：主账号（无 orgId）不加任何条件', () => {
  assert.strictEqual(orgFilterOf({}), '')
  assert.strictEqual(orgFilterOf({ orgId: '', orgName: 'X', orgLevel: 2 }), '')
  assert.strictEqual(orgFilterOf(null), '')
})

test('orgFilterOf：机构层级 < 2 只看客户，不收窄', () => {
  assert.strictEqual(orgFilterOf({ orgId: '5', orgName: '山西卡友', orgLevel: 1 }), '')
  assert.strictEqual(orgFilterOf({ orgId: '4', orgName: '管理员名下车辆', orgLevel: 0 }), '')
})

test('orgFilterOf：层级 ≥ 2 → org_id 或机构名任一命中', () => {
  const q = orgFilterOf({ orgId: '4', orgName: '管理员名下车辆', orgLevel: 2 })
  assert.strictEqual(q, '&or=(org_id.eq.4,org.eq."管理员名下车辆")')
})

test('orgFilterOf：机构名缺失时退化为仅 org_id', () => {
  const q = orgFilterOf({ orgId: '4', orgName: '', orgLevel: 2 })
  assert.strictEqual(q, '&or=(org_id.eq.4)')
})

test('orgFilterOf：机构名里的双引号被剔除，不能注入条件', () => {
  const q = orgFilterOf({ orgId: '4', orgName: 'X",status.eq.0', orgLevel: 2 })
  assert.ok(!q.includes('"X",'), q)
  assert.strictEqual(q, '&or=(org_id.eq.4,org.eq."X,status.eq.0")')
})
