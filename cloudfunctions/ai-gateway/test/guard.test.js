/**
 * guard.js 单测（node --test，零 npm 依赖）
 * 重点覆盖两处容易"以为生效其实没接线"的地方：
 *   ① assertEvidence —— 当前 Web 链路不走它，但逻辑必须是对的（IM 阶段要用）
 *   ② validateArgs   —— 未知字段必须被丢弃，防止模型塞 owner_account
 */
const test = require('node:test')
const assert = require('node:assert')

const { assertEvidence, validateArgs, BizError } = require('../guard')

test('assertEvidence：原文里找不到依据的字段被丢弃', () => {
  const r = assertEvidence(
    { plate: { value: '川A1', evidence: '车牌：川A1' } },
    '车号：川B2'
  )
  assert.deepStrictEqual(r.dropped, ['plate'])
  assert.deepStrictEqual(Object.keys(r.kept), [])
})

test('assertEvidence：evidence 为空字符串也丢弃', () => {
  const r = assertEvidence(
    { cargo: { value: '钢材', evidence: '' }, plate: { value: '苏A1', evidence: '苏A1' } },
    '拉钢材，车苏A1'
  )
  assert.deepStrictEqual(r.dropped, ['cargo'])
  assert.deepStrictEqual(Object.keys(r.kept), ['plate'])
})

test('assertEvidence：置信度低于 0.7 时标 needConfirm', () => {
  const r = assertEvidence({ plate: { value: '苏A1', evidence: '苏A1', conf: 0.5 } }, '苏A1')
  assert.strictEqual(r.kept.plate.needConfirm, true)
})

test('validateArgs：草稿参数里塞 owner_account 会被丢弃', () => {
  const got = validateArgs('draft_waybill', {
    pickup: '青白江仓库',
    owner_account: 'hacker',
    tenant: 'x',
  })
  assert.strictEqual(got.pickup, '青白江仓库')
  assert.strictEqual('owner_account' in got, false)
  assert.strictEqual('tenant' in got, false)
})

test('validateArgs：render_chart 没有数值字段可用', () => {
  const got = validateArgs('render_chart', {
    chartType: 'trend',
    source: 'q_energy',
    data: [1, 2, 3],
    series: [{ values: [9] }],
  })
  assert.strictEqual(got.chartType, 'trend')
  assert.strictEqual('data' in got, false)
  assert.strictEqual('series' in got, false)
})

test('validateArgs：非法枚举直接报参数错误', () => {
  assert.throws(
    () => validateArgs('resolve_entity', { kind: 'spaceship', text: 'x' }),
    (e) => e instanceof BizError && e.code === 2001
  )
})

test('validateArgs：未知工具报 1003', () => {
  assert.throws(
    () => validateArgs('drop_table', {}),
    (e) => e instanceof BizError && e.code === 1003
  )
})
