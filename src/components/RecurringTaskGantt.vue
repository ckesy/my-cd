<template>
  <div class="rtg">
    <!-- ============================================================
         历次完成情况
         ============================================================ -->
    <div class="rtg-hist">
      <div class="rtg-hist-head">
        <div class="rtg-hist-left">
          <span class="rtg-h-title">历次完成情况</span>
          <span class="rtg-h-sum">{{ historySummary }}</span>
        </div>
        <div class="rtg-spark" v-if="durationBars.length > 1">
          <span class="rtg-spark-label">近 {{ durationBars.length }} 趟耗时</span>
          <div class="rtg-spark-bars">
            <i
              v-for="(b, i) in durationBars"
              :key="i"
              :class="{ 'is-slow': b.slow }"
              :style="{ height: b.h + '%' }"
              :title="b.title"
            ></i>
          </div>
        </div>
      </div>

      <div class="rtg-trips" v-if="completedTrips.length">
        <div
          class="rtg-trip"
          v-for="t in visibleTrips"
          :key="t.waybill_no"
          @click="drillTo(t)"
        >
          <span class="rtg-trip-seq">第 {{ t.seq }} 趟</span>
          <span class="rtg-trip-day">{{ t.dayText }}</span>
          <span class="rtg-trip-range">{{ t.rangeText }}</span>
          <span class="rtg-trip-dur">耗时 {{ t.durationText }}</span>
          <span class="rtg-trip-gap" :class="t.gapCls">{{ t.gapText }}</span>
        </div>

        <div
          class="rtg-more"
          v-if="!expanded && completedTrips.length > 3"
          @click="expanded = true"
        >查看全部 {{ completedTrips.length }} 趟</div>
        <div
          class="rtg-more"
          v-else-if="expanded && completedTrips.length > 3"
          @click="expanded = false"
        >收起</div>
      </div>
      <div class="rtg-none" v-else>还没有已完成的趟次</div>
    </div>

    <!-- ============================================================
         周期视图 / 当天明细
         ============================================================ -->
    <div class="rtg-main">
      <div class="rtg-main-head">
        <span class="rtg-m-title">
          {{ mode === 'cycle' ? '周期视图' : selectedDayText + ' 当天明细' }}
        </span>
        <button class="rtg-back" v-if="mode === 'day'" @click="mode = 'cycle'">
          返回周期视图
        </button>
        <span class="rtg-m-hint" v-else>点任意一天可下钻到当天明细</span>
      </div>

      <!-- ---- 周期视图 ---- -->
      <template v-if="mode === 'cycle'">
        <template v-if="days.length">
          <div class="rtg-axis">
            <span
              v-for="t in dayTicks"
              :key="t.date"
              class="rtg-tick"
              :style="{ left: t.pct + '%' }"
            >{{ t.label }}</span>
          </div>

          <div class="rtg-body">
            <div class="rtg-row" v-for="row in vehicleRows" :key="row.plate">
              <div class="rtg-row-label">
                <span class="rtg-plate">{{ row.plate }}</span>
                <span class="rtg-row-sub">{{ row.tripCount }} 趟 · {{ row.doneCount }} 已完成</span>
              </div>
              <div class="rtg-cells">
                <span
                  v-for="(c, i) in row.cells"
                  :key="i"
                  class="rtg-cell"
                  :class="['is-' + c.state, { 'is-today': c.isToday }]"
                  :style="{ left: c.pct + '%', width: c.w + '%' }"
                  :title="c.title"
                  @click="drillToDay(c.date)"
                ><em v-if="c.count > 1">{{ c.count }}</em></span>
              </div>
            </div>
          </div>

          <div class="rtg-legend">
            <span><i class="c-done"></i>已完成</span>
            <span><i class="c-transit"></i>在途</span>
            <span><i class="c-loading"></i>装货中</span>
            <span><i class="c-ready"></i>待发车</span>
            <span><i class="c-missed"></i>缺趟</span>
            <span><i class="c-planned"></i>未开始</span>
          </div>
        </template>
        <div class="rtg-none" v-else>
          {{
            (task && task.recurring_type === "count")
              ? "这是「按次数」常驻任务，没有周期范围 —— 进度看上面的历次完成情况"
              : "该常驻任务没有可展示的周期范围（有效期未填）"
          }}
        </div>
      </template>

      <!-- ---- 当天明细 ---- -->
      <template v-else>
        <div class="rtg-day" v-if="dayTrips.length">
          <WaybillProgressBar
            v-for="t in dayTrips"
            :key="t.waybill_no"
            :trip="t"
            :progress="progressOf(t)"
            :label="plateOf(t) + ' · 第 ' + t.seq + ' 趟'"
            :sublabel="t.status + ' · ' + t.rangeText"
            dense
          />
        </div>
        <div class="rtg-none" v-else>这一天没有运输记录</div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import WaybillProgressBar from '@/components/WaybillProgressBar.vue'
import {
  pickVehiclePlate,
  parseTimeMs,
  fmtDurationCn,
  fmtClock,
  tripDurationMinutes,
} from '@/utils/waybillProgress'

const props = defineProps({
  /* 同一常驻任务（recurring_group_no）下的全部运输记录 */
  records: { type: Array, default: () => [] },
  /* 主运单行，用来取常驻配置（有效期等） */
  task: { type: Object, default: null },
  /* { waybill_no: computeProgress 结果 } */
  progressMap: { type: Object, default: () => ({}) },
})

const expanded = ref(false)
const mode = ref('cycle')
const selectedDay = ref('')

/* ============================================================
   基础
   ============================================================ */
const plateOf = (rec) => pickVehiclePlate(rec) || '未分配车辆'
const dayOf = (rec) => {
  const ms = parseTimeMs(rec.accept_time || rec.create_time)
  return ms ? dayjs(ms).format('YYYY-MM-DD') : ''
}
const progressOf = (rec) => props.progressMap[rec.waybill_no] || null

const todayKey = () => dayjs().format('YYYY-MM-DD')

/* 按接单时间（没接单看创建时间）升序，序号即第几趟 */
const trips = computed(() =>
  [...props.records]
    .sort(
      (a, b) =>
        (Number(a.trip_seq) || 0) - (Number(b.trip_seq) || 0) ||
        parseTimeMs(a.create_time) - parseTimeMs(b.create_time)
    )
    .map((r, i) => ({ ...r, seq: Number(r.trip_seq) || i + 1 }))
)

/* ============================================================
   历次完成情况
   ============================================================ */
const completedTrips = computed(() =>
  trips.value
    .filter((t) => String(t.status || '').trim() === '已完成')
    .sort((a, b) => parseTimeMs(b.finish_time || b.arrive_time) - parseTimeMs(a.finish_time || a.arrive_time))
)

const sumTrips = computed(() =>
  completedTrips.value.map((t) => {
    const start = parseTimeMs(t.accept_time || t.create_time)
    const end = parseTimeMs(t.finish_time || t.arrive_time)
    return {
      ...t,
      dayText: start ? dayjs(start).format('MM-DD') : '--',
      rangeText: start && end ? `${fmtClock(start)} → ${fmtClock(end)}` : '--',
      durationText: fmtDurationCn(tripDurationMinutes(t)),
      durationMin: tripDurationMinutes(t),
      gap: gapOf(t, end),
    }
  })
)

function gapOf(t, endMs) {
  const plan = parseTimeMs(t.plan_time)
  if (!endMs || !plan) return { text: '计划未填', cls: 'is-idle' }
  const diff = Math.round((endMs - plan) / 60000)
  const fmtGap = (m) =>
    m < 60 ? `${m} 分` : `${Math.floor(m / 60)} 时 ${m % 60} 分`
  if (Math.abs(diff) <= 15) return { text: '准点', cls: 'is-ok' }
  return diff > 0
    ? { text: `晚 ${fmtGap(diff)}`, cls: 'is-late' }
    : { text: `早 ${fmtGap(-diff)}`, cls: 'is-early' }
}

const visibleTrips = computed(() =>
  expanded.value ? sumTrips.value : sumTrips.value.slice(0, 3)
)

const historySummary = computed(() => {
  const list = sumTrips.value
  if (!list.length) return ''
  const mins = list.map((t) => t.durationMin)
  const avg = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length)
  return `共 ${list.length} 趟 · 平均耗时 ${fmtDurationCn(avg)} · 最长 ${fmtDurationCn(Math.max(...mins))}`
})

/* 近 12 趟耗时柱：明显偏长的用淡红标出来 */
const durationBars = computed(() => {
  const asc = [...sumTrips.value].reverse().slice(-12)
  if (asc.length < 2) return []
  const mins = asc.map((t) => t.durationMin)
  const max = Math.max(...mins, 1)
  return asc.map((t) => ({
    h: Math.max(14, Math.round((t.durationMin / max) * 100)),
    slow: t.durationMin >= max * 0.9,
    title: `第 ${t.seq} 趟 · ${t.durationText}`,
  }))
})

/* ============================================================
   周期范围
   ============================================================ */
const MAX_DAYS = 92
const days = computed(() => {
  const task = props.task || {}
  let start = parseTimeMs(task.recurring_start_time)
  let end = parseTimeMs(task.recurring_end_time)
  if (!start || !end) {
    const all = trips.value
      .map((t) => parseTimeMs(t.accept_time || t.create_time))
      .filter(Boolean)
    if (!all.length) return []
    start = start || Math.min(...all)
    end = end || Math.max(...all)
  }
  let cur = dayjs(start).startOf('day')
  const last = dayjs(end).startOf('day')
  const out = []
  let guard = 0
  while (cur.valueOf() <= last.valueOf() && guard++ < MAX_DAYS) {
    out.push(cur.format('YYYY-MM-DD'))
    cur = cur.add(1, 'day')
  }
  return out
})

const cellW = computed(() => (days.value.length ? 100 / days.value.length : 0))

const dayTicks = computed(() => {
  const n = days.value.length
  if (!n) return []
  const step = Math.max(1, Math.ceil(n / 7))
  const out = []
  for (let i = 0; i < n; i += step) {
    out.push({
      date: days.value[i],
      label: dayjs(days.value[i]).format('MM-DD'),
      pct: (i + 0.46) * cellW.value,
    })
  }
  return out
})

/* ============================================================
   车辆行 × 天 的格子
   ============================================================ */
/* 一天多趟时，优先展示「最活跃」的那个状态 */
const STATE_PRIORITY = ['loading', 'ready', 'transit', 'pending', 'done', 'cancelled']
const STATUS_TO_CELL = {
  待接单: 'pending',
  待装车: 'loading',
  装车中: 'loading',
  装车完成: 'ready',
  已发车: 'transit',
  已到达: 'transit',
  已完成: 'done',
  已取消: 'cancelled',
  待重新指派: 'cancelled',
}
const STATE_LABEL = {
  pending: '待接单',
  loading: '装货中',
  ready: '待发车',
  transit: '在途',
  done: '已完成',
  cancelled: '已取消',
  missed: '缺趟',
  planned: '未开始',
}

const vehicleRows = computed(() => {
  const today = todayKey()
  const byPlate = new Map()
  trips.value.forEach((t) => {
    const plate = plateOf(t)
    if (!byPlate.has(plate)) byPlate.set(plate, [])
    byPlate.get(plate).push(t)
  })

  return Array.from(byPlate.entries()).map(([plate, list]) => {
    const cells = days.value.map((date, i) => {
      const dayList = list.filter((t) => dayOf(t) === date)
      const base = {
        date,
        pct: i * cellW.value,
        w: cellW.value * 0.9,
        isToday: date === today,
        count: dayList.length,
      }
      if (!dayList.length) {
        const state = date > today ? 'planned' : 'missed'
        return { ...base, state, title: `${plate} · ${date} · ${STATE_LABEL[state]}` }
      }
      const states = dayList.map((t) => STATUS_TO_CELL[String(t.status || '').trim()] || 'pending')
      const state =
        STATE_PRIORITY.find((s) => states.includes(s)) || states[0] || 'pending'
      return {
        ...base,
        state,
        title:
          `${plate} · ${date} · ${STATE_LABEL[state]}` +
          (dayList.length > 1 ? `（${dayList.length} 趟）` : ''),
      }
    })

    return {
      plate,
      cells,
      tripCount: list.length,
      doneCount: list.filter((t) => String(t.status || '').trim() === '已完成').length,
    }
  })
})

/* ============================================================
   下钻
   ============================================================ */
const dayTrips = computed(() =>
  trips.value
    .filter((t) => dayOf(t) === selectedDay.value)
    .map((t) => ({ ...t, rangeText: `${fmtClock(t.accept_time || t.create_time)} 接单` }))
)

const selectedDayText = computed(() =>
  selectedDay.value ? dayjs(selectedDay.value).format('MM-DD') : ''
)

const drillToDay = (date) => {
  selectedDay.value = date
  mode.value = 'day'
}
const drillTo = (trip) => {
  const d = dayOf(trip)
  if (d) drillToDay(d)
}
</script>

<style scoped>
.rtg {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ============================================================
   历次完成情况
   ============================================================ */
.rtg-hist {
  padding: 12px 16px 14px 16px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}
.rtg-hist-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 10px;
}
.rtg-hist-left {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}
.rtg-h-title {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
  white-space: nowrap;
}
.rtg-h-sum {
  font-size: 11.5px;
  color: #94a3b8;
}

/* 近 12 趟耗时柱 */
.rtg-spark {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}
.rtg-spark-label {
  font-size: 10.5px;
  color: #94a3b8;
}
.rtg-spark-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 38px;
}
.rtg-spark-bars i {
  display: block;
  width: 11px;
  border-radius: 2px 2px 0 0;
  background: #b7d5e8;
  transition: height 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}
.rtg-spark-bars i.is-slow { background: #efa9a0; }

.rtg-trips {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rtg-trip {
  display: grid;
  grid-template-columns: 68px 54px 132px 1fr 92px;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  background: #f8fafc;
  font-size: 11.5px;
  color: #475569;
  cursor: pointer;
  transition: background 0.2s, transform 0.2s;
}
.rtg-trip:hover {
  background: #fef2f2;
  transform: translateX(2px);
}
.rtg-trip-seq {
  font-weight: 600;
  color: #0f172a;
}
.rtg-trip-range { font-family: 'Courier New', monospace; }
.rtg-trip-gap { text-align: right; font-weight: 600; }
.rtg-trip-gap.is-ok { color: #15803d; }
.rtg-trip-gap.is-late { color: #a32d2d; }
.rtg-trip-gap.is-early { color: #0f6e56; }
.rtg-trip-gap.is-idle { color: #cbd5e1; font-weight: 400; }

.rtg-more {
  margin-top: 4px;
  padding: 5px 10px;
  font-size: 11.5px;
  color: #c8102e;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.2s;
}
.rtg-more:hover { background: #fef2f2; }

/* ============================================================
   周期视图
   ============================================================ */
.rtg-main {
  padding: 12px 16px 14px 16px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}
.rtg-main-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.rtg-m-title {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}
.rtg-m-hint {
  margin-left: auto;
  font-size: 11px;
  color: #94a3b8;
}
.rtg-back {
  margin-left: auto;
  padding: 3px 10px;
  font-size: 11.5px;
  color: #c8102e;
  background: #fff;
  border: 1px solid #f7c1c1;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.2s;
}
.rtg-back:hover { background: #fef2f2; }

.rtg-axis {
  position: relative;
  height: 18px;
  margin-left: 118px;
}
.rtg-tick {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-size: 10.5px;
  color: #94a3b8;
  white-space: nowrap;
}

.rtg-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rtg-row {
  display: flex;
  align-items: center;
  gap: 0;
}
.rtg-row-label {
  flex: 0 0 118px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-right: 10px;
  box-sizing: border-box;
}
.rtg-plate {
  font-size: 11.5px;
  font-weight: 600;
  color: #0f172a;
  white-space: nowrap;
}
.rtg-row-sub {
  font-size: 10.5px;
  color: #94a3b8;
  white-space: nowrap;
}
.rtg-cells {
  position: relative;
  flex: 1;
  height: 20px;
}

.rtg-cell {
  position: absolute;
  top: 1px;
  height: 18px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.18s, box-shadow 0.18s, opacity 0.3s;
}
.rtg-cell:hover {
  transform: scaleY(1.18);
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.18);
  z-index: 2;
}
.rtg-cell em {
  font-style: normal;
  font-size: 10px;
  font-weight: 700;
  color: #ffffff;
}
.rtg-cell.is-done { background: #639922; }
.rtg-cell.is-transit { background: #ef9f27; }
.rtg-cell.is-loading { background: #c8102e; }
.rtg-cell.is-ready { background: #fde7c4; }
.rtg-cell.is-pending { background: #dbeafe; }
.rtg-cell.is-cancelled { background: #e2e8f0; }
.rtg-cell.is-planned { background: #f1f5f9; }
/* 过去的日子没跑：斜纹缺口，和「未开始」区分开 */
.rtg-cell.is-missed {
  background: repeating-linear-gradient(
    45deg,
    #fcebeb 0 4px,
    #f7c1c1 4px 6px
  );
}
.rtg-cell.is-today {
  box-shadow: 0 0 0 2px #fef2f2, 0 0 0 3px #c8102e;
}

.rtg-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  margin-top: 12px;
  padding-left: 118px;
  font-size: 11px;
  color: #475569;
}
.rtg-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.rtg-legend i {
  display: inline-block;
  width: 12px;
  height: 10px;
  border-radius: 2px;
  font-style: normal;
}
.rtg-legend .c-done { background: #639922; }
.rtg-legend .c-transit { background: #ef9f27; }
.rtg-legend .c-loading { background: #c8102e; }
.rtg-legend .c-ready { background: #fde7c4; }
.rtg-legend .c-planned { background: #f1f5f9; }
.rtg-legend .c-missed {
  background: repeating-linear-gradient(45deg, #fcebeb 0 4px, #f7c1c1 4px 6px);
}

/* ============================================================
   当天明细
   ============================================================ */
.rtg-day {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rtg-day :deep(.wpb) {
  padding: 8px 10px 6px 10px;
  border-radius: 8px;
  background: #f8fafc;
  transition: background 0.2s;
}
.rtg-day :deep(.wpb:hover) { background: #fef2f2; }

.rtg-none {
  padding: 26px 0;
  text-align: center;
  font-size: 12px;
  color: #94a3b8;
}
</style>
