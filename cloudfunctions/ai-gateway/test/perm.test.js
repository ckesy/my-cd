/**
 * 权限别名单测
 * 背景：角色配置里存的是老 key（operation / fee_stats），
 *      工具裁剪按字面比对会让「有权限的人」拿不到工具（2026-11-26 能耗查不了）。
 * 口径来源：src/config/permissions.js 的 PERM_ALIAS / permHit（此处镜像，改一处要改两处）。
 */
const test = require('node:test')
const assert = require('node:assert')
const { permHit, PERM_ALIAS } = require('../constants')

test('permHit：精确命中', () => {
  assert.strictEqual(permHit(['operation_energy'], 'operation_energy'), true)
  assert.strictEqual(permHit(['waybill'], 'operation_energy'), false)
})

test('permHit：主账号 * 全量', () => {
  assert.strictEqual(permHit(['*'], 'operation_energy'), true)
  assert.strictEqual(permHit(['*'], '随便什么'), true)
})

test('permHit：老 key operation 命中三个报表子权限', () => {
  const legacy = ['home', 'operation', 'waybill']
  assert.strictEqual(permHit(legacy, 'operation_energy'), true)
  assert.strictEqual(permHit(legacy, 'operation_summary'), true)
  assert.strictEqual(permHit(legacy, 'operation_driving'), true)
})

test('permHit：财务角色只有 fee_stats 也能查费用', () => {
  const finance = ['home', 'waybill', 'report', 'operation', 'fee_stats']
  assert.strictEqual(permHit(finance, 'fee_list'), true)
  assert.strictEqual(permHit(finance, 'operation_energy'), true)
})

test('permHit：空权限 / 非数组一律不放行', () => {
  assert.strictEqual(permHit([], 'operation_energy'), false)
  assert.strictEqual(permHit(null, 'operation_energy'), false)
  assert.strictEqual(permHit(undefined, 'fee_list'), false)
})

test('PERM_ALIAS 结构与前端一致（每个 key 至少一个老 key）', () => {
  assert.deepStrictEqual(Object.keys(PERM_ALIAS).sort(), [
    'affair_ledger', 'affair_reminders', 'affair_settings',
    'fee_list', 'maintenance_ledger',
    'operation_driving', 'operation_energy', 'operation_summary',
    'waybill_stats',
  ])
  Object.entries(PERM_ALIAS).forEach(([k, v]) => {
    assert.ok(Array.isArray(v) && v.length, `${k} 别名必须是非空数组`)
  })
})
