/**
 * 大屏悬停数据卡 · 状态与定位
 * ============================================================
 * 两块大屏（车辆运行 / 运单费用）共用：
 *   const tip = useScreenTip()
 *   <div ref="rootRef" class="screen-root"> ... <ScreenTip v-bind="tip.bindProps" /> </div>
 *   onMounted(() => tip.bind(rootRef.value))
 *
 * 元素上：
 *   <div v-on="tip.hot({ title:'今日里程', rows:[{k:'合计',v:'9,692 km'}] })">
 *   SVG 里同样可用（rect / circle / polyline 都支持 v-on）。
 *
 * ⭐ 坐标按「大屏根容器」算：整屏是 transform:scale() 缩放的，
 *    用 clientX - rootRect.left 得到的才是根容器内的绝对坐标，
 *    卡片放在 .stage 之外，字号不会被缩放带小。
 * ============================================================
 */
import { reactive } from 'vue'

export function useScreenTip() {
  const tip = reactive({
    show: false,
    x: 0,
    y: 0,
    flip: false,   // 靠右 → 向左展开
    up: false,     // 靠下 → 向上展开
    title: '',
    sub: '',
    rows: [],
    foot: '',
  })

  let host = null
  const TIP_W = 300
  const TIP_H = 190

  function bind(el) { host = el }

  function place(e) {
    if (!host || !e) return
    const r = host.getBoundingClientRect()
    const x = (e.clientX || 0) - r.left
    const y = (e.clientY || 0) - r.top
    tip.x = x + 16
    tip.y = y + 16
    tip.flip = x > r.width - TIP_W
    tip.up = y > r.height - TIP_H
  }

  /** 首次进入：落内容并定位 */
  function set(e, payload) {
    if (!payload) return
    place(e)
    tip.title = payload.title || ''
    tip.sub = payload.sub || ''
    tip.rows = payload.rows || []
    tip.foot = payload.foot || ''
    tip.show = true
  }

  /** 移动：只挪位置，不重算内容（避免 mousemove 高频重建数组） */
  function move(e) { if (tip.show) place(e) }

  function hide() { tip.show = false }

  /**
   * 模板里 v-on="tip.hot(payload)" 一把梭
   * ⚠️ 键名必须是小写事件名：v-on 对象语法内部走 toHandlers()，
   *    会自动拼成 onMouseenter，写成 onMouseenter 会变成 onOnMouseenter → 永不触发。
   */
  function hot(payload) {
    return {
      mouseenter: (e) => set(e, payload),
      mousemove: (e) => move(e),
      mouseleave: hide,
    }
  }

  return { tip, bind, set, move, hide, hot }
}

/** 大屏里常用的「键值行」小工厂 */
export const row = (k, v, c) => ({ k, v, c })
