/**
 * match.js 单测（node --test，零 npm 依赖）
 * 运行：cd cloudfunctions/ai-gateway && node --test
 */
const test = require('node:test')
const assert = require('node:assert')

const {
  normPlate, normName, splitPlates, isTypoOf, scoreOf, rankCandidates,
  classifyMissing, draftStatusOf, isActiveWaybill, pickPatch, SCORE,
} = require('../match')

test('normPlate：间隔符与全角都不影响结果', () => {
  const a = normPlate('苏A·89802')
  const b = normPlate('苏a 89802')
  const c = normPlate('苏A８９８０２')
  assert.strictEqual(a, '苏A89802')
  assert.strictEqual(b, '苏A89802')
  assert.strictEqual(c, '苏A89802')
})

test('normPlate：空值与纯符号返回空串', () => {
  assert.strictEqual(normPlate(''), '')
  assert.strictEqual(normPlate(null), '')
  assert.strictEqual(normPlate('·- '), '')
})

test('normName：去标点与空白，忽略大小写', () => {
  assert.strictEqual(normName('青白江 仓库'), '青白江仓库')
  assert.strictEqual(normName('蜀通物流（成都）'), '蜀通物流成都')
  assert.strictEqual(normName('ABC Co.'), 'abcco')
})

test('splitPlates：逗号顿号分号空格都能拆', () => {
  assert.deepStrictEqual(splitPlates('苏A1,苏A2、苏A3；苏A4 苏A5'), ['苏A1', '苏A2', '苏A3', '苏A4', '苏A5'])
  assert.deepStrictEqual(splitPlates(''), [])
  assert.deepStrictEqual(splitPlates(null), [])
})

test('isTypoOf：差一个字判为疑似笔误', () => {
  const r = isTypoOf('川A89802', '苏A89802')
  assert.strictEqual(r.typo, true)
  assert.strictEqual(r.distance, 1)
})

test('isTypoOf：长度差超过 1 不判笔误', () => {
  const r = isTypoOf('苏A89802', '苏A8980219')
  assert.strictEqual(r.typo, false)
  assert.strictEqual(r.distance, null)
})

test('isTypoOf：完全相同不算笔误（应该走精确匹配）', () => {
  const r = isTypoOf('苏A89802', '苏A89802')
  assert.strictEqual(r.typo, false)
})

test('scoreOf：四档分值严格递减，且精确档 matchedBy 正确', () => {
  const exact = scoreOf('苏A89802', '苏A89802', 'vehicle')
  const norm = scoreOf('苏A·89802', '苏A89802', 'vehicle')
  const prefix = scoreOf('苏A898', '苏A89802', 'vehicle')
  const contains = scoreOf('89802', '苏A89802', 'vehicle')
  assert.strictEqual(exact.score, SCORE.EXACT)
  assert.strictEqual(exact.matchedBy, 'vehicle_exact')
  assert.ok(exact.score > norm.score)
  assert.ok(norm.score > prefix.score)
  assert.ok(prefix.score > contains.score)
})

test('scoreOf：单字查询不做包含匹配', () => {
  assert.strictEqual(scoreOf('苏', '苏A89802', 'vehicle').score, 0)
})

test('scoreOf：无交集返回 0', () => {
  assert.strictEqual(scoreOf('川B11111', '苏A89802', 'vehicle').score, 0)
})

test('rankCandidates：按分值降序且受 limit 限制', () => {
  const rows = [
    { plate: '苏A8980219' },
    { plate: '苏A89802' },
    { plate: '苏A89803' },
    { plate: '川B11111' },
  ]
  const hits = rankCandidates('苏A89802', rows, { kind: 'vehicle', field: (r) => r.plate, limit: 2 })
  assert.strictEqual(hits.length, 2)
  assert.strictEqual(hits[0].row.plate, '苏A89802')
  assert.strictEqual(hits[0].score, SCORE.EXACT)
})

test('classifyMissing：三档分级', () => {
  assert.strictEqual(classifyMissing('pickup'), 'block')
  assert.strictEqual(classifyMissing('cargo'), 'block')
  /* 2026-11-26 时间拆成两个，都属于「建单页可填」，不挡建单 */
  assert.strictEqual(classifyMissing('pickupTime'), 'confirm')
  assert.strictEqual(classifyMissing('deliveryTime'), 'confirm')
  assert.strictEqual(classifyMissing('planTime'), 'confirm')
  assert.strictEqual(classifyMissing('freight'), 'defer')
  assert.strictEqual(classifyMissing('unknownField'), 'confirm')
})

test('pickPatch：运输模式与两个时间都能改，非白名单键丢弃', () => {
  const out = pickPatch({
    transportMode: '详细',
    pickupTime: '2026-11-27T08:00:00+08:00',
    deliveryTime: '2026-11-27T15:00:00+08:00',
    owner_account: 'attacker',
  })
  assert.strictEqual(out.transportMode, '详细')
  assert.ok(out.pickupTime)
  assert.ok(out.deliveryTime)
  assert.strictEqual(out.owner_account, undefined)
})

test('draftStatusOf：按 block > ambiguous > conflict > ready 取最严重', () => {
  assert.strictEqual(
    draftStatusOf({ missing: [{ level: 'block' }], conflicts: [{ code: 'X' }], ambiguous: true }),
    'incomplete'
  )
  assert.strictEqual(draftStatusOf({ missing: [], conflicts: [{ code: 'X' }], ambiguous: true }), 'ambiguous')
  assert.strictEqual(draftStatusOf({ missing: [], conflicts: [{ code: 'X' }] }), 'conflict')
  assert.strictEqual(draftStatusOf({ missing: [{ level: 'defer' }], conflicts: [] }), 'ready')
})

test('isActiveWaybill：结束后不再占用车辆/司机', () => {
  assert.strictEqual(isActiveWaybill('已完成'), false)
  assert.strictEqual(isActiveWaybill('已取消'), false)
  assert.strictEqual(isActiveWaybill('待重新指派'), false)
  assert.strictEqual(isActiveWaybill('已发车'), true)
  assert.strictEqual(isActiveWaybill('装车完成'), true)
  assert.strictEqual(isActiveWaybill(''), false)
})

test('pickPatch：白名单外的键一律丢弃', () => {
  const got = pickPatch({
    delivery: '青羊工业园',
    owner_account: 'hacker',
    tenant: 'x',
    id: 1,
    quantity: 30,
  })
  assert.deepStrictEqual(got, { delivery: '青羊工业园', quantity: 30 })
})

test('pickPatch：空入参返回空对象', () => {
  assert.deepStrictEqual(pickPatch(null), {})
  assert.deepStrictEqual(pickPatch('str'), {})
  assert.deepStrictEqual(pickPatch({}), {})
})
