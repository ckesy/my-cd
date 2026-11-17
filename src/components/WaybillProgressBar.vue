<template>
  <div class="wpb" :class="{ 'is-dense': dense }">
    <!-- 标题 + 右侧读数 -->
    <div class="wpb-top">
      <div class="wpb-title">
        <span class="wpb-label" v-if="label">{{ label }}</span>
        <span class="wpb-sub" v-if="sublabel">{{ sublabel }}</span>
        <span class="wpb-flag" v-if="progress && progress.overPlan">已超规划里程</span>
      </div>
      <div class="wpb-metrics" :class="metricClass">{{ metricText }}</div>
    </div>

    <template v-if="range">
      <!-- 时间刻度 -->
      <div class="wpb-axis" ref="axisEl">
        <span
          v-for="t in ticks"
          :key="t.ms"
          class="wpb-tick"
          :class="'is-' + t.align"
          :style="{ left: t.pct + '%' }"
        >{{ t.label }}</span>
      </div>

      <!-- 轨道：计划条 / 实际条 / 预测虚线 / 现在线 -->
      <div class="wpb-track">
        <span
          v-for="t in ticks"
          :key="'g' + t.ms"
          class="wpb-grid"
          :style="{ left: t.pct + '%' }"
        ></span>

        <div class="wpb-plan" v-if="planStyle" :style="planStyle" title="计划装货 → 计划送达"></div>

        <div
          class="wpb-actual"
          :class="{ 'is-running': isRunning }"
          v-if="actualStyle"
          :style="actualStyle"
          :title="actualTitle"
        ></div>

        <div class="wpb-pred" v-if="predStyle" :style="predStyle" title="按已行驶比例预测的剩余行程"></div>

        <div class="wpb-now" v-if="nowPct !== null" :style="{ left: nowPct + '%' }">
          <span class="wpb-now-label">{{ nowLabel }}</span>
        </div>
      </div>

      <!-- 图例 -->
      <div class="wpb-legend" v-if="showLegend">
        <span><i class="lg-plan"></i>计划</span>
        <span><i class="lg-actual"></i>实际</span>
        <span><i class="lg-pred"></i>预测剩余</span>
        <span><i class="lg-now"></i>现在</span>
      </div>
    </template>

    <div class="wpb-none" v-else>该趟没有可用的时间数据</div>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import dayjs from 'dayjs'
import {
  parseTimeMs,
  fmtDurationCn,
  fmtKm,
  fmtClock,
  tripDurationMinutes,
} from '@/utils/waybillProgress'

const props = defineProps({
  /* 运输记录（waybills 行） */
  trip: { type: Object, required: true },
  /* computeProgress 的结果，可为空 */
  progress: { type: Object, default: null },
  label: { type: String, default: '' },
  sublabel: { type: String, default: '' },
  dense: { type: Boolean, default: false },
  showLegend: { type: Boolean, default: false },
})

const RUNNING_STATUSES = ['待装车', '装车中', '装车完成', '已发车', '已到达']

const status = computed(() => String((props.trip && props.trip.status) || '').trim())
const isRunning = computed(() => RUNNING_STATUSES.includes(status.value))

/* ============================================================
   现在线：自己走，不依赖父组件刷新
   ============================================================ */
const nowMs = ref(Date.now())
let ticker = null

/* 时间轴的实际宽度：刻度数量按它反推，宽度不够就减少刻度，避免标签互相压住 */
const axisEl = ref(null)
const axisWidth = ref(640)
let axisRO = null

onMounted(() => {
  ticker = setInterval(() => { nowMs.value = Date.now() }, 30000)
  if (axisEl.value && typeof ResizeObserver !== 'undefined') {
    axisRO = new ResizeObserver((entries) => {
      const w = entries[0] && entries[0].contentRect && entries[0].contentRect.width
      if (w && w > 0) axisWidth.value = w
    })
    axisRO.observe(axisEl.value)
  }
})
onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
  if (axisRO) axisRO.disconnect()
})

/* ============================================================
   时间范围：按数据自动取，两端各留 1 小时
   ============================================================ */
const planFromMs = computed(() => parseTimeMs(props.trip && props.trip.pickup_time))
const planToMs = computed(() => parseTimeMs(props.trip && props.trip.plan_time))
const actualFromMs = computed(
  () => parseTimeMs((props.trip && (props.trip.accept_time || props.trip.create_time)) || '')
)
const actualToMs = computed(() => {
  const t = props.trip || {}
  const done = parseTimeMs(t.finish_time || t.arrive_time)
  if (done) return done
  return isRunning.value ? nowMs.value : 0
})
const predToMs = computed(() => {
  const p = props.progress
  if (!p || !p.ready || p.stale) return 0
  return p.etaMs || 0
})

const range = computed(() => {
  const list = [
    planFromMs.value,
    planToMs.value,
    actualFromMs.value,
    actualToMs.value,
    predToMs.value,
    isRunning.value ? nowMs.value : 0,
  ].filter(Boolean)
  if (!list.length) return null
  let lo = Math.floor(Math.min(...list) / 3600000) * 3600000 - 3600000
  let hi = Math.ceil(Math.max(...list) / 3600000) * 3600000 + 3600000
  if (hi - lo < 4 * 3600000) hi = lo + 4 * 3600000
  return { lo, hi, span: hi - lo }
})

const pct = (ms) => {
  if (!range.value || !ms) return null
  const raw = ((ms - range.value.lo) / range.value.span) * 100
  return Math.min(101, Math.max(-1, raw))
}

/* 一个标签所占的横向空间（含两侧留白），用来反推该放几个刻度 */
const TICK_SLOT_PX = 78

/* 标签粒度随跨度收缩：跨度越长越粗，避免文字变长后互相压住 */
const tickLabel = (ms) => {
  const days = range.value ? range.value.span / 86400000 : 0
  if (days > 4) return dayjs(ms).format('MM-DD')
  if (days > 1.5) return dayjs(ms).format('MM-DD HH:00')
  return dayjs(ms).format('HH:00')
}

const ticks = computed(() => {
  if (!range.value) return []
  const hours = range.value.span / 3600000
  const slots = Math.max(2, Math.floor(axisWidth.value / TICK_SLOT_PX))

  /* 候选步长（小时）：挑第一个「步长 >= 理想步长」的档位 */
  const STEPS = [1, 2, 3, 6, 12, 24, 48, 72, 120, 168, 240, 336, 720]
  const ideal = hours / slots
  const stepH = STEPS.find((s) => s >= ideal) || Math.ceil(ideal / 24) * 24

  /* 步长 >= 1 天对齐到当地 00:00，否则对齐整点——刻度落在整齐的时间上才好看 */
  let t
  if (stepH >= 24) {
    t = dayjs(range.value.lo).startOf('day').add(1, 'day').valueOf()
  } else {
    t = Math.ceil(range.value.lo / 3600000) * 3600000
  }

  const out = []
  let guard = 0
  while (t <= range.value.hi && guard++ < 60) {
    const p = pct(t)
    if (p !== null && p >= 0 && p <= 100) {
      out.push({
        ms: t,
        label: tickLabel(t),
        pct: p,
        /* 首尾刻度改成左/右对齐，避免标签溢出容器被裁掉 */
        align: p < 3 ? 'start' : p > 97 ? 'end' : 'center',
      })
    }
    t += stepH * 3600000
  }
  return out
})

/* ============================================================
   条段
   ============================================================ */
const clampLeft = (v) => Math.min(99.5, Math.max(0, v))

const planStyle = computed(() => {
  const a = pct(planFromMs.value)
  const b = pct(planToMs.value)
  if (a === null || b === null || b <= a) return null
  return { left: clampLeft(a) + '%', width: Math.max(0.6, b - a) + '%' }
})

const actualStyle = computed(() => {
  const a = pct(actualFromMs.value)
  const b = pct(actualToMs.value)
  if (a === null || b === null || b <= a) return null
  return { left: clampLeft(a) + '%', width: Math.max(0.6, b - a) + '%' }
})

const predStyle = computed(() => {
  const a = pct(actualToMs.value)
  const b = pct(predToMs.value)
  if (a === null || b === null || b <= a) return null
  return { left: clampLeft(a) + '%', width: Math.max(0.6, b - a) + '%' }
})

const nowPct = computed(() => {
  const p = pct(nowMs.value)
  return p === null ? null : clampLeft(p)
})
const nowLabel = computed(() => dayjs(nowMs.value).format('HH:mm'))

const actualTitle = computed(() => {
  const t = props.trip || {}
  const from = t.accept_time || t.create_time
  const to = t.finish_time || t.arrive_time
  return to
    ? `实际：${fmtClock(from)} → ${fmtClock(to)}`
    : `实际：${fmtClock(from)} → 现在`
})

/* ============================================================
   右侧读数
   ============================================================ */
const metricText = computed(() => {
  const t = props.trip || {}
  const p = props.progress

  if (status.value === '已完成') {
    return '已完成 · 用时 ' + fmtDurationCn(tripDurationMinutes(t))
  }
  if (status.value === '已取消') return '已取消'
  if (status.value === '待重新指派') return '已被拒单，待重新指派'
  if (status.value === '待接单') return '待接单 · 计划装货 ' + fmtClock(t.pickup_time)

  if (!p || !p.ready) return '缺少规划里程，无法估算剩余'
  if (p.stale) return '定位停更，ETA 暂不可用'
  return (
    '剩余 ' + fmtKm(p.remainKm) +
    ' · 约 ' + fmtDurationCn(p.remainMinutes) +
    ' · 预计 ' + fmtClock(p.etaMs) + ' 到达'
  )
})

const metricClass = computed(() => {
  const t = props.trip || {}
  const p = props.progress
  if (status.value === '已完成') return 'is-ok'
  if (status.value === '已取消' || status.value === '待重新指派') return 'is-idle'
  if (status.value === '待接单') return 'is-idle'
  if (!p || !p.ready || p.stale || p.overPlan) return 'is-warn'
  return 'is-live'
})
</script>

<style scoped>
.wpb {
  padding: 10px 0 4px 0;
}
.wpb.is-dense {
  padding: 6px 0 2px 0;
}

/* ---- 顶部 ---- */
.wpb-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 2px;
}
.wpb-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.wpb-label {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--ink);
  white-space: nowrap;
}
.wpb-sub {
  font-size: 12px;
  color: var(--ink-3);
  white-space: nowrap;
}
.wpb-flag {
  padding: 1px 6px;
  font-size: 10.5px;
  font-weight: 700;
  color: #a32d2d;
  background: #fcebeb;
  border-radius: 8px;
  white-space: nowrap;
}
.wpb-metrics {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wpb-metrics.is-live {
  color: var(--brand-primary);
  font-weight: 600;
}
.wpb-metrics.is-ok {
  color: #15803d;
  font-weight: 600;
}
.wpb-metrics.is-warn {
  color: #b45309;
}
.wpb-metrics.is-idle {
  color: var(--ink-3);
}

/* ---- 刻度 ---- */
.wpb-axis {
  position: relative;
  height: 16px;
  margin-left: 2px;
  overflow: hidden;
}
.wpb-tick {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-size: 11px;
  color: var(--ink-3);
  white-space: nowrap;
}
.wpb-tick.is-start {
  transform: none;
}
.wpb-tick.is-end {
  transform: translateX(-100%);
}

/* ---- 轨道 ---- */
.wpb-track {
  position: relative;
  height: 34px;
  margin-bottom: 4px;
}
.wpb-grid {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--surface-hover);
}
.wpb-plan {
  position: absolute;
  top: 8px;
  height: 8px;
  border-radius: 3px;
  background: #e2e8f0;
  transition: left 0.6s ease, width 0.6s ease;
}
.wpb-actual {
  position: absolute;
  top: 20px;
  height: 12px;
  border-radius: 3px;
  background: #639922;
  overflow: hidden;
  transition: left 0.6s ease, width 0.6s ease;
}
/* 进行中的实际条：一条从左往右流动的光带 */
.wpb-actual.is-running::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 40%;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0));
  animation: wpbFlow 1.8s linear infinite;
}
@keyframes wpbFlow {
  0% { left: -40%; }
  100% { left: 100%; }
}
.wpb-pred {
  position: absolute;
  top: 24px;
  height: 4px;
  border-radius: 2px;
  background: repeating-linear-gradient(90deg, #94a3b8 0 6px, transparent 6px 10px);
  transition: left 0.6s ease, width 0.6s ease;
}
.wpb-now {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--brand-primary);
  transition: left 0.8s linear;
}
.wpb-now-label {
  position: absolute;
  top: -1px;
  left: 3px;
  font-size: 10px;
  color: var(--brand-primary);
  white-space: nowrap;
}

/* ---- 图例 ---- */
.wpb-legend {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--ink-2);
}
.wpb-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.wpb-legend i {
  display: inline-block;
  font-style: normal;
}
.lg-plan {
  width: 14px;
  height: 6px;
  border-radius: 2px;
  background: #e2e8f0;
}
.lg-actual {
  width: 14px;
  height: 10px;
  border-radius: 2px;
  background: #639922;
}
.lg-pred {
  width: 14px;
  height: 4px;
  border-radius: 2px;
  background: repeating-linear-gradient(90deg, #94a3b8 0 5px, transparent 5px 8px);
}
.lg-now {
  width: 1px;
  height: 12px;
  background: var(--brand-primary);
}

.wpb-none {
  padding: 14px 0;
  font-size: 12px;
  color: var(--ink-3);
}
</style>
