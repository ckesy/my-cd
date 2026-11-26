const test = require('node:test')
const assert = require('node:assert')

const { toBeijingString } = require('../tools')

/* ============================================================
   计划时间的时区口径
   ------------------------------------------------------------
   踩过的坑：云函数容器是 UTC，直接 toISOString() 出来是 UTC 时间，
   建单页的日期控件再按浏览器本地时区解析一次，就出现
   「用户说 8 点、建单页显示 0 点」。
   这一组用例把这个口径锁死。
   ============================================================ */

test('toBeijingString：+08:00 的 08:00 必须还是 08:00', () => {
  const ts = Date.parse('2026-11-27T08:00:00+08:00') // = 2026-11-27T00:00:00Z
  assert.strictEqual(toBeijingString(ts), '2026-11-27 08:00:00')
})

test('toBeijingString：UTC 零点属于当天早上八点（跨日不能错）', () => {
  const ts = Date.parse('2026-11-26T16:00:00Z') // 北京时间 11-27 00:00
  assert.strictEqual(toBeijingString(ts), '2026-11-27 00:00:00')
})

test('toBeijingString：下午三点', () => {
  const ts = Date.parse('2026-11-27T15:00:00+08:00')
  assert.strictEqual(toBeijingString(ts), '2026-11-27 15:00:00')
})
