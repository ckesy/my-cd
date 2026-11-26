/**
 * 图表明细合并（mergeChartFold）单测
 * 口径：同源 table 卡折进 chart 卡 fold，且不丢行；不同源的表卡保留。
 */
const test = require('node:test')
const assert = require('node:assert')
const { mergeChartFold } = require('../index')._internals

test('同源表卡折进图表卡，不再单独下发', () => {
  const cards = [
    { type: 'chart', source: 'q_energy', title: '每日能耗', fold: null, table: { cols: [], rows: [] } },
    { type: 'table', source: 'q_energy', title: '6 天明细', cols: [{ key: 'km' }], rows: [{ km: 1 }, { km: 2 }] },
  ]
  const out = mergeChartFold(cards)
  assert.strictEqual(out.length, 1)
  assert.strictEqual(out[0].type, 'chart')
  assert.strictEqual(out[0].fold.rows.length, 2)
  assert.strictEqual(out[0].fold.title, '6 天明细')
  assert.strictEqual(out[0].table, undefined, 'chart.table 应被删掉，避免重复下发')
})

test('不同源的表卡要保留（别把别的查询结果吞了）', () => {
  const cards = [
    { type: 'chart', source: 'q_energy' },
    { type: 'table', source: 'q_fee', cols: [], rows: [{ a: 1 }] },
  ]
  const out = mergeChartFold(cards)
  assert.strictEqual(out.length, 2)
  assert.strictEqual(out[1].source, 'q_fee')
})

test('没有同源表卡时用图自带小表兜底', () => {
  const cards = [
    { type: 'chart', source: 'q_fee', table: { cols: [{ key: 'x' }], rows: [{ x: 9 }] } },
  ]
  const out = mergeChartFold(cards)
  assert.strictEqual(out[0].fold.rows.length, 1)
})

test('没有图表卡时原样返回', () => {
  const cards = [{ type: 'table', source: 'q_fee', rows: [1] }]
  const out = mergeChartFold(cards)
  assert.strictEqual(out.length, 1)
  assert.strictEqual(out[0].fold, undefined)
})
