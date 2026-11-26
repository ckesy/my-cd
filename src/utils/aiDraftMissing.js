/**
 * AI 派单草稿 → 缺项清单
 *
 * 为什么要有这个文件：
 *   缺项以前完全依赖云函数 `draft_waybill` 返回的 `missing[]`，再靠前端一层层透传。
 *   中间任何一环丢数据（卡片从历史记录里恢复、state 没写进去、只走了 sessionStorage），
 *   高亮和感叹号就整体失效 —— 用户看到的是「什么都没发生」。
 *
 *   这里按「草稿结构本身」重新推导一遍，作为唯一口径：
 *   助手跳转前用它兜底，建单页挂载后再用它兜底。两边同一份逻辑，不会打架。
 *
 * 结构对齐 WaybillCreate.applyCloneData 认的 cloneData：
 *   { tasks:[{pickupLocation,deliveryLocation,pickupTime,deliveryTime,pickupCustomerName}],
 *     cargoList:[{name,quantity}], assignList:[{items:[{target}]}] }
 *
 * ⚠️ 只列「挡住建单」的项：计划装货/到达、客户、路线、运费都属于可后补，
 *    不在其中（见 HIGHLIGHT_KEYS 的注释）。
 */

/** 空值判定：null / undefined / 空串都算没填（0 不算空 —— 数量 0 是业务值） */
const isBlank = (v) => v === null || v === undefined || String(v).trim() === ''

/** 缺项中文名（前端提示文案用，避免各处自己写一份） */
export const AI_MISS_LABEL = {
  pickup: '装货地',
  delivery: '卸货地',
  pickupTime: '计划装货时间',
  deliveryTime: '计划到达时间',
  customer: '客户',
  cargo: '货物',
  quantity: '数量',
  vehicle: '车辆/司机',
  driver: '车辆/司机',
  route: '路线',
  freight: '运费',
}

/**
 * 建单页要「标红 + 感叹号」的项。
 * ⚠️ 只放真正挡住建单的：时间、运费、路线都属于「建单页可填 / 可后补」，
 *    跟着一起闪会变成满屏红，反而看不出哪一项真的卡住了。
 */
export const HIGHLIGHT_KEYS = ['pickup', 'delivery', 'cargo', 'quantity', 'vehicle', 'driver']

/**
 * 从草稿结构推导缺项 key 列表
 * @param {object} cloneData 派单草稿（与「再来一单」同一结构）
 * @returns {string[]} 例如 ['cargo', 'quantity']
 */
export function deriveMissing(cloneData) {
  if (!cloneData || typeof cloneData !== 'object') return []
  const out = []

  const task = (Array.isArray(cloneData.tasks) && cloneData.tasks[0]) || {}
  if (isBlank(task.pickupLocation)) out.push('pickup')
  if (isBlank(task.deliveryLocation)) out.push('delivery')

  const cargo = (Array.isArray(cloneData.cargoList) && cloneData.cargoList[0]) || {}
  if (isBlank(cargo.name)) out.push('cargo')
  if (cargo.quantity == null || Number(cargo.quantity) <= 0) out.push('quantity')

  /* 指派：只要有一条明细填了目标（车牌或司机）就算有。
     车辆 / 司机在表单里是同一块（指派方式二选一），所以只出一个 key。 */
  const items = (Array.isArray(cloneData.assignList) ? cloneData.assignList : [])
    .flatMap((a) => (Array.isArray(a && a.items) ? a.items : []))
  if (!items.some((i) => i && !isBlank(i.target))) out.push('vehicle')

  return out
}

/** 去重 + 过滤非法值（外部传进来的 _missing 也可能是脏的） */
export function normalizeMissing(list) {
  if (!Array.isArray(list)) return []
  const valid = new Set(Object.keys(AI_MISS_LABEL))
  return [...new Set(list.filter((k) => typeof k === 'string' && valid.has(k)))]
}

/* ============================================================
   页内直达通道
   ------------------------------------------------------------
   问题：用户已经在建单页时再点「去建单页确认」，router.push 到同一路径
   会被判成重复导航 —— 组件不重新挂载、onMounted 不跑，草稿和标红都不会出现。
   以前用 window.location.assign 强刷绕过，但整页重载体验差，还会掉未保存内容。

   改成事件通道：建单页挂载时注册处理器，助手侧先尝试「就地投递」，
   投递成功就不跳转；没有处理器（不在建单页）才走路由。
   ============================================================ */
const draftHandlers = new Set()

/**
 * 建单页注册处理器
 * @param {(payload: {cloneData: object, statedMiss: string[]}) => void} fn
 * @returns {() => void} 取消注册
 */
export function onAiDraft(fn) {
  if (typeof fn !== 'function') return () => {}
  draftHandlers.add(fn)
  return () => draftHandlers.delete(fn)
}

/**
 * 把草稿投递给已挂载的建单页
 * @returns {boolean} 是否有页面接住了（false 表示需要正常跳转）
 */
export function emitAiDraft(payload) {
  if (!payload || !payload.cloneData) return false
  let hit = false
  draftHandlers.forEach((fn) => {
    try {
      fn(payload)
      hit = true
    } catch (e) {
      /* 单个处理器出错不能影响其它处理器，也不能阻断跳转兜底 */
      console.error('AI 草稿投递失败', e)
    }
  })
  return hit
}
