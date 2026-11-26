/**
 * 大屏遥控单测（node --test，零 npm 依赖）
 * ------------------------------------------------------------
 * 重点锁三件事：
 *   ① 身份字段塞进参数必须被丢掉（越权的最后一道口子）
 *   ② 动作是枚举，写错一个字母都不能下发
 *   ③ 车牌数组限 20 个，且不接受对象/嵌套，杜绝「传一段 JSON 去执行」
 */
const test = require('node:test')
const assert = require('node:assert')
const { validateArgs } = require('../guard')

test('screen_dispatch：正常参数通过，且身份字段被丢弃', () => {
  const a = validateArgs('screen_dispatch', {
    action: 'focus_vehicle',
    plate: ' 苏A12345 ',
    /* 模型（或被污染的提示词）塞进来的越权字段，必须消失 */
    tenant: 'another-tenant',
    account: 'someone-else',
  })
  assert.strictEqual(a.action, 'focus_vehicle')
  assert.strictEqual(a.plate, '苏A12345')
  assert.strictEqual(a.tenant, undefined)
  assert.strictEqual(a.account, undefined)
})

test('screen_dispatch：动作必须在白名单内', () => {
  assert.throws(() => validateArgs('screen_dispatch', { action: 'run_js' }), /action/)
  assert.throws(() => validateArgs('screen_dispatch', { action: 'Focus_Vehicle' }), /action/)
})

test('screen_dispatch：action 必填', () => {
  assert.throws(() => validateArgs('screen_dispatch', {}), /action/)
})

test('screen_dispatch：车牌数组截断到 20，且丢掉非字符串元素', () => {
  const plates = Array.from({ length: 30 }, (_, i) => '苏A' + (10000 + i))
  plates[3] = { evil: true }
  plates[5] = 123456
  const a = validateArgs('screen_dispatch', { action: 'highlight_vehicles', plates })
  /* 先截 20 个再过滤脏值：对象那条被丢掉，剩 19 */
  assert.strictEqual(a.plates.length, 19)
  assert.ok(a.plates.every((x) => typeof x === 'string' && x.length > 0))
  assert.ok(!a.plates.some((x) => x === '[object Object]'))
})

test('screen_dispatch：超长字段被截断或拒绝，不会原样写库', () => {
  const longArea = '成'.repeat(80)
  assert.throws(() => validateArgs('screen_dispatch', { action: 'focus_area', area: longArea }), /area/)

  const ok = validateArgs('screen_dispatch', { action: 'focus_area', area: '重庆' })
  assert.strictEqual(ok.area, '重庆')
})

test('q_screen：无参数，返回空对象', () => {
  assert.deepStrictEqual(validateArgs('q_screen', { anything: 1 }), {})
})
