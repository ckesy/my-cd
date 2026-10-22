<template>
  <div class="op-view" :class="['k-' + kind, compact ? 'compact' : '']">
    <!-- 悬浮气泡（固定定位，跟随鼠标） -->
    <teleport to="body">
      <div v-if="tip" class="op-tip" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">
        <div class="op-tip-h">{{ tip.title }}</div>
        <div v-for="(l, i) in tip.lines" :key="i" class="op-tip-r">{{ l }}</div>
      </div>
    </teleport>
    <div v-if="loading" class="sk">
      <div v-for="i in skeletonRows" :key="i" class="sk-row" :style="{ animationDelay: i * 60 + 'ms' }"></div>
    </div>

    <div v-else-if="empty" class="empty">
      <span>暂无数据</span>
    </div>

    <!-- ================= 日历 ================= -->
    <div v-else-if="kind === 'cal'" class="cal-wrap">
      <div class="cal-grid">
        <div v-for="w in weekdays" :key="w" class="wd">{{ w }}</div>
        <div v-for="i in offset" :key="'e' + i" class="cell empty"></div>
        <div
          v-for="d in days"
          :key="d.day"
          class="cell"
          :class="[d.level, d.isToday ? 'today' : '', d.picked ? 'picked' : '', d.future ? 'future' : '']"
          @click="onPick(d)"
          @mouseenter="showTip($event, `${d.date}`, d.has ? [`行驶 ${d.main} ${d.unit}`, `百公里电耗 ${d.rateNum}`, d.restText] : ['当天未运行'])"
          @mousemove="moveTip"
          @mouseleave="hideTip"
        >
          <span class="dnum">{{ d.day }}</span>
          <template v-if="d.has">
            <span class="km">{{ d.main }}<i>{{ d.unit }}</i></span>
            <span class="rate">{{ d.rateText }}</span>
          </template>
          <span v-else-if="!d.future" class="rest">未运行</span>
        </div>
      </div>
    </div>

    <!-- ================= 矩阵 ================= -->
    <div v-else-if="kind === 'matrix'" class="mx">
      <div class="mx-row head">
        <div class="mx-veh">车辆</div>
        <div v-for="d in mxDays" :key="d" class="mx-cell">{{ d.slice(5) }}</div>
        <div class="mx-total">里程</div>
      </div>
      <div v-for="g in groups" :key="g.org" class="mx-group">
        <span class="g-name">{{ g.org }}</span>
        <span class="g-meta">{{ g.rows.length }} 台 · 均值 {{ g.avgRate }}</span>
      </div>
      <div v-for="row in flatRows" :key="row.plate" class="mx-row">
        <div class="mx-veh">{{ row.plate }}</div>
        <div
          v-for="(c, i) in row.cells"
          :key="i"
          class="mx-cell"
          :class="c ? c.level : 'blank'"
          @mouseenter="showTip($event, `${row.plate} · ${mxDays[i]}`, c ? [`当天行驶 ${c.km} km`, `百公里电耗 ${c.rate}`, `区间合计 ${row.total} km`] : ['当天未运行'])"
          @mousemove="moveTip"
          @mouseleave="hideTip"
        >{{ c ? c.km : '–' }}</div>
        <div class="mx-total">{{ row.total }}<i> km</i></div>
      </div>
    </div>

    <!-- ================= 象限 ================= -->
    <div v-else-if="kind === 'quad'" class="quad">
      <svg class="quad-svg" viewBox="0 0 420 260" preserveAspectRatio="xMidYMid meet">
        <line v-for="(t, i) in yTicks" :key="'gy' + i" :x1="pad.l" :y1="t.y" :x2="420 - pad.r" :y2="t.y" stroke="#f4f7fb" />
        <line v-for="(t, i) in xTicks" :key="'gx' + i" :x1="t.x" :y1="pad.t" :x2="t.x" :y2="pad.t + ih" stroke="#f4f7fb" />
        <line :x1="pad.l" :y1="pad.t + ih" :x2="420 - pad.r" :y2="pad.t + ih" stroke="#dbe3ec" />
        <line :x1="pad.l" :y1="pad.t" :x2="pad.l" :y2="pad.t + ih" stroke="#dbe3ec" />
        <line :x1="medianX" :y1="pad.t" :x2="medianX" :y2="pad.t + ih" stroke="#cbd5e1" stroke-dasharray="4 4" />
        <line :x1="pad.l" :y1="medianY" :x2="420 - pad.r" :y2="medianY" stroke="#cbd5e1" stroke-dasharray="4 4" />
        <text v-for="(t, i) in yTicks" :key="'ty' + i" :x="pad.l - 6" :y="t.y + 3" text-anchor="end" class="qtick">{{ t.label }}</text>
        <text v-for="(t, i) in xTicks" :key="'tx' + i" :x="t.x" :y="pad.t + ih + 14" text-anchor="middle" class="qtick">{{ t.label }}</text>
        <text :x="420 - pad.r" :y="pad.t + ih + 26" text-anchor="end" class="qaxis">{{ xTitle }}</text>
        <text x="12" :y="pad.t + ih / 2" text-anchor="middle" class="qaxis"
          :transform="`rotate(-90 12 ${pad.t + ih / 2})`">{{ yTitle }}</text>
        <text x="38" y="15" class="qtex">低效·低利用 {{ counts ? counts.ll : 0 }} 台</text>
        <text x="392" y="15" text-anchor="end" class="qtex">低效·高利用 {{ counts ? counts.lh : 0 }} 台</text>
        <text x="38" :y="pad.t + ih - 8" class="qtex">高效·低利用 {{ counts ? counts.hl : 0 }} 台</text>
        <text x="392" :y="pad.t + ih - 8" text-anchor="end" class="qtex">高效·高利用 {{ counts ? counts.hh : 0 }} 台</text>
        <circle
          v-for="p in points"
          :key="p.plate"
          :cx="p.x"
          :cy="p.y"
          :r="compact ? 3.4 : 5.4"
          :fill="p.color"
          fill-opacity="0.78"
          stroke="#fff"
          stroke-width="1"
          @mouseenter="showTip($event, p.plate, [`日均 ${p.xText}`, `百公里电耗 ${p.rate}`, p.org])"
          @mousemove="moveTip"
          @mouseleave="hideTip"
        />
      </svg>
      <div class="quad-legend">
        <span v-for="o in legend" :key="o.name" class="lg">
          <i :style="{ background: o.color }"></i>{{ o.name }}
        </span>
      </div>
    </div>

    <!-- ================= 排行 ================= -->
    <div v-else-if="kind === 'rank'" class="rank">
      <div v-for="(r, i) in rows" :key="r.plate" class="rk"
        @mouseenter="showTip($event, `${r.plate}（第 ${i + 1} 名）`, [`${label}：${r.value} ${unit}`, `车队均值：${avgValue} ${unit}`])"
        @mousemove="moveTip" @mouseleave="hideTip">
        <span class="rk-idx" :class="{ top: i === 0 }">{{ i + 1 }}</span>
        <span class="rk-name">{{ r.plate }}</span>
        <div class="rk-track">
          <div class="rk-bar" :style="{ width: r.width + '%' }"></div>
          <i v-if="avgPos !== null" class="rk-avg" :style="{ left: avgPos + '%' }"></i>
        </div>
        <span class="rk-val">{{ r.value }}<i>{{ unit }}</i></span>
        <span v-if="r.delta !== null" class="rk-delta" :class="r.good ? 'good' : 'bad'">{{ r.delta }}</span>
      </div>
      <div v-if="!rows.length" class="empty">暂无数据</div>
    </div>

    <!-- ================= 运行剖面 ================= -->
    <div v-else-if="kind === 'timeline'" class="tl">
      <div class="tl-axis">
        <span v-for="h in axisHours" :key="h" :style="{ left: (h / 24) * 100 + '%' }">{{ h }}</span>
      </div>
      <div v-for="r in rows" :key="r.plate" class="tl-row">
        <span class="tl-name">{{ r.plate }}</span>
        <div class="tl-track"
          @mouseenter="showTip($event, `${r.plate} · ${r.day}`, r.has ? [`出车 ${r.startText} — 收车 ${r.endText}`, `行驶 ${r.km} km`, `下电 ${r.offText}`, r.warn ? '⚠️ 下电超过 5 小时' : ''] : ['当天未运行'])"
          @mousemove="moveTip" @mouseleave="hideTip">
          <div v-for="h in gridHours" :key="h" class="tl-grid" :style="{ left: (h / 24) * 100 + '%' }"></div>
          <template v-if="r.has">
            <div class="tl-off" :class="{ warn: r.warn }" :style="{ left: r.offLeft + '%', width: r.offWidth + '%' }"></div>
            <div class="tl-run" :style="{ left: r.runLeft + '%', width: r.runWidth + '%' }"></div>
          </template>
          <span v-else class="tl-none">未运行</span>
        </div>
        <span class="tl-val">{{ r.km }}<i> km</i></span>
      </div>
    </div>

    <!-- ================= 异常待办 ================= -->
    <div v-else-if="kind === 'issues'" class="issues">
      <div v-for="(it, i) in rows" :key="i" class="is-row"
        @mouseenter="showTip($event, `${it.plate} · ${it.type}`, [`所属机构：${it.org}`, it.desc])"
        @mousemove="moveTip" @mouseleave="hideTip">
        <span class="is-lv" :class="it.level"></span>
        <span class="is-name">{{ it.plate }}<i>{{ it.org }}</i></span>
        <span class="is-tag" :class="it.tone">{{ it.type }}</span>
        <span class="is-desc">{{ it.desc }}</span>
      </div>
      <div v-if="!rows.length" class="empty">今天没有需要处理的异常</div>
    </div>

    <!-- ================= 周节律 ================= -->
    <div v-else-if="kind === 'rhythm'" class="rh">
      <div class="rh-grid">
        <div></div>
        <div v-for="h in 24" :key="h" class="rh-h">{{ (h - 1) % 3 === 0 ? h - 1 : '' }}</div>
        <template v-for="(w, wi) in rhythm" :key="wi">
          <div class="rh-wd">{{ w.label }}</div>
          <div
            v-for="(c, hi) in w.cells"
            :key="hi"
            class="rh-c"
            :style="{ background: c.color }"
            @mouseenter="showTip($event, `${w.label} ${String(hi).padStart(2, '0')}:00`, [`平均在途 ${c.count} 台`])"
            @mousemove="moveTip" @mouseleave="hideTip"
          ></div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  kind: { type: String, required: true },
  compact: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  payload: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['pick'])

const weekdays = ['一', '二', '三', '四', '五', '六', '日']

/* ---------- 悬浮气泡 ---------- */
const tip = ref(null)
function showTip(e, title, lines) {
  tip.value = { x: e.clientX + 16, y: e.clientY + 18, title, lines: lines.filter(Boolean) }
}
function moveTip(e) {
  if (!tip.value) return
  const x = Math.min(e.clientX + 16, window.innerWidth - 240)
  const y = Math.min(e.clientY + 18, window.innerHeight - 120)
  tip.value = { ...tip.value, x: Math.max(8, x), y: Math.max(8, y) }
}
function hideTip() { tip.value = null }
const axisHours = [0, 3, 6, 9, 12, 15, 18, 21, 24]
const gridHours = [3, 6, 9, 12, 15, 18, 21]

const skeletonRows = computed(() => (props.compact ? 4 : 8))
const empty = computed(() => {
  const p = props.payload || {}
  if (props.kind === 'cal') return false
  if (props.kind === 'matrix') return !p.groups || !p.groups.length
  if (props.kind === 'quad') return !p.points || !p.points.length
  if (props.kind === 'rhythm') return !p.rhythm || !p.rhythm.length
  return !p.rows || !p.rows.length
})

// ---------- 日历 ----------
const days = computed(() => props.payload.days || [])
const offset = computed(() => props.payload.offset || 0)

const onPick = (d) => {
  if (!d.has) return
  emit('pick', d.day)
}

// ---------- 矩阵 ----------
const mxDays = computed(() => props.payload.days || [])
const groups = computed(() => props.payload.groups || [])
const flatRows = computed(() => {
  const out = []
  ;(props.payload.groups || []).forEach((g) => {
    if (g.collapsed) return
    g.rows.forEach((r) => out.push(r))
  })
  return out
})

// ---------- 象限 ----------
const pad = { l: 34, r: 16, t: 24, b: 26 }
const iw = 420 - pad.l - pad.r
const ih = 260 - pad.t - pad.b
const points = computed(() => props.payload.points || [])
const medianX = computed(() => props.payload.medianX || pad.l)
const medianY = computed(() => props.payload.medianY || pad.t)
const legend = computed(() => props.payload.legend || [])
const xTicks = computed(() => props.payload.xTicks || [])
const yTicks = computed(() => props.payload.yTicks || [])
const xTitle = computed(() => props.payload.xTitle || '')
const yTitle = computed(() => props.payload.yTitle || '')
const counts = computed(() => props.payload.counts || null)

// ---------- 排行 ----------
const rows = computed(() => props.payload.rows || [])
const unit = computed(() => props.payload.unit || '')
const avgPos = computed(() => (props.payload.avgPos == null ? null : props.payload.avgPos))
const label = computed(() => props.payload.label || '')
const avgValue = computed(() => props.payload.avgValue || '--')

// ---------- 节律 ----------
const rhythm = computed(() => props.payload.rhythm || [])
</script>

<style scoped>
.op-view {
  height: 100%;
  min-height: 0;
  position: relative;
  font-family: inherit;
}

.empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #b6c2d2;
  font-weight: 600;
}

/* 骨架 */
.sk {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 0;
}
.sk-row {
  flex: 1;
  border-radius: 6px;
  background: linear-gradient(90deg, #f6f8fb 25%, #eef3f8 37%, #f6f8fb 63%);
  background-size: 400% 100%;
  animation: sk 1.2s ease infinite;
  min-height: 12px;
}
@keyframes sk {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}

/* ================= 日历 ================= */
.cal-wrap { height: 100%; min-height: 0; overflow: hidden; }
.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: minmax(0, 1fr);
  gap: 4px;
  align-content: stretch;
  height: 100%;
}
.wd {
  font-size: 10px;
  color: #94a3b8;
  font-weight: 700;
  text-align: center;
  padding-bottom: 2px;
}
.cell {
  border-radius: 6px;
  background: #f8fafc;
  padding: 4px 5px;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  cursor: default;
  min-height: 0;
  border: 1px solid transparent;
}
.cell.empty { background: transparent; }
.cell.future { background: #fbfcfe; border: 1px dashed #eef2f7; }
.cell.today { box-shadow: inset 0 0 0 1.2px var(--brand-primary); }
.cell.picked { border-color: var(--brand-primary); box-shadow: 0 0 0 2px rgba(var(--brand-rgb), 0.14); }
.dnum { font-size: 9.5px; color: #9aa7b8; font-weight: 700; }
.km {
  font-size: 15px;
  font-weight: 800;
  color: #111827;
  line-height: 1.1;
  margin-top: auto;
  letter-spacing: -0.2px;
  white-space: nowrap;
}
.km i { font-size: 8px; font-style: normal; color: #6b7280; margin-left: 1px; }
.rate {
  font-size: 9.5px;
  color: #9f1239;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rest { margin: auto 0; font-size: 9.5px; color: #cbd5e1; font-weight: 700; }

.compact .cell { padding: 2px 4px; border-radius: 5px; }
.compact .dnum { font-size: 8px; line-height: 1.1; }
.compact .km { font-size: 11.5px; letter-spacing: -0.3px; }
.compact .km i { font-size: 7px; }
.compact .rate { font-size: 7.5px; font-weight: 600; }
.compact .rest { font-size: 8px; }
.cal-grid .cell.has { min-height: 0; }

/* 悬浮气泡 */
.op-tip {
  position: fixed;
  z-index: 4000;
  min-width: 120px;
  max-width: 240px;
  background: rgba(15, 23, 42, 0.94);
  color: #fff;
  border-radius: 8px;
  padding: 8px 10px;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.35);
  pointer-events: none;
  backdrop-filter: blur(4px);
}
.op-tip-h {
  font-size: 13px;
  font-weight: 800;
  margin-bottom: 4px;
  letter-spacing: 0.2px;
}
.op-tip-r {
  font-size: 12px;
  line-height: 1.65;
  color: #e2e8f0;
  white-space: nowrap;
}

/* 悬浮反馈：让格子/行"有反应" */
.cell.has { transition: transform 0.15s, box-shadow 0.15s; }
.cell.has:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 14px rgba(var(--brand-rgb), 0.16);
  z-index: 2;
}
.mx-cell { transition: box-shadow 0.15s; }
.mx-cell:not(.blank):hover { box-shadow: inset 0 0 0 2px var(--brand-primary); }
.rk { transition: background 0.15s; border-radius: 6px; }
.rk:hover { background: #fdf6f6; }
.is-row { transition: background 0.15s; }
.is-row:hover { background: #fdfafa; }
.tl-row { transition: background 0.15s; border-radius: 6px; }
.tl-row:hover { background: #fdf6f6; }
.tl-row:hover .tl-track { box-shadow: inset 0 0 0 1px #fca5a5; }
.rh-c { transition: outline-color 0.15s; }
.rh-c:hover { outline: 1.5px solid var(--brand-primary); outline-offset: -1px; }

/* 热力：5 档（用「元素+lv」提高权重，避免被后面的 .cell/.mx-cell 默认底色覆盖） */
/* 热力色阶跟着品牌色走：透明度递进，换肤后自动协调 */
/* ⚠️ 不用 color-mix —— 旧版 Chromium（部分国产浏览器内核）不支持，
   @supports 整块被跳过，色阶会退回写死的红。rgba 兼容性好得多。 */
.cell.lv1, .mx-cell.lv1 { background: rgba(var(--brand-rgb), 0.08); }
.cell.lv2, .mx-cell.lv2 { background: rgba(var(--brand-rgb), 0.18); }
.cell.lv3, .mx-cell.lv3 { background: rgba(var(--brand-rgb), 0.32); }

/* 深色档位（0.52 以上）黑字看不清 —— 文字改成白色，子元素一起继承 */
.cell.lv4, .mx-cell.lv4 { background: rgba(var(--brand-rgb), 0.52); color: #fff; }
.cell.lv4 > *, .mx-cell.lv4 > * { color: inherit; }

/* 第 5 档 = 最高，用品牌深色，白字保证可读 */
.cell.lv5, .mx-cell.lv5 { background: var(--brand-primary-dark); color: #fff; }
.cell.lv5 > *, .mx-cell.lv5 > * { color: inherit; }

/* ================= 矩阵 ================= */
.mx {
  height: 100%;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mx-row {
  display: grid;
  grid-template-columns: 62px repeat(7, minmax(26px, 1fr)) 54px;
  gap: 2px;
  align-items: center;
}
.mx-row.head { position: sticky; top: 0; background: #fff; z-index: 2; }
.mx-veh {
  font-size: 9.5px;
  font-weight: 700;
  color: #334155;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mx-cell {
  height: 22px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9.5px;
  font-weight: 700;
  color: #111827;
  background: #f8fafc;
}
.mx-row.head .mx-cell {
  background: transparent;
  font-size: 8.5px;
  color: #94a3b8;
  font-weight: 700;
  height: 16px;
}
.mx-cell.blank { color: #dbe3ec; }
.mx-total {
  text-align: right;
  font-size: 10px;
  font-weight: 800;
  color: #0f172a;
}
.mx-total i { font-size: 8px; font-style: normal; color: #94a3b8; }
.mx-group {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #fdf6f6;
  border-radius: 4px;
  padding: 2px 6px;
  margin-top: 2px;
}
.g-name { font-size: 9px; font-weight: 800; color: #9f1239; }
.g-meta { font-size: 8.5px; color: #b9808a; font-weight: 600; }

/* ================= 象限 ================= */
.quad { height: 100%; display: flex; flex-direction: column; min-height: 0; }
.quad svg { width: 100%; flex: 1; min-height: 0; }
.qtex { font-size: 8px; font-weight: 700; fill: #b6c2d2; }
.qtick { font-size: 7.5px; fill: #a9b6c6; font-weight: 600; }
.qaxis { font-size: 8px; fill: #8fa0b3; font-weight: 700; }
.quad-legend {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 9px;
  color: #64748b;
  font-weight: 600;
  padding-top: 4px;
  flex-shrink: 0;
}
.quad-legend i {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 3px;
}

/* ================= 排行 ================= */
.rank { height: 100%; overflow: auto; }
.rk {
  display: grid;
  grid-template-columns: 16px 66px 1fr 52px 36px;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  border-bottom: 1px dashed #f4f7fb;
}
.rk-idx {
  width: 15px;
  height: 15px;
  border-radius: 4px;
  background: #f1f5f9;
  color: #94a3b8;
  font-size: 8.5px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rk-idx.top { background: var(--brand-primary); color: #fff; }
.rk-name {
  font-size: 10px;
  font-weight: 700;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rk-track {
  position: relative;
  height: 8px;
  border-radius: 4px;
  background: #f8fafc;
}
.rk-bar {
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--brand-primary-hover), var(--brand-primary));
}
.rk-avg {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 1px;
  border-left: 1.4px dashed #94a3b8;
}
.rk-val {
  text-align: right;
  font-size: 10px;
  font-weight: 800;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}
.rk-val i { font-size: 8px; font-style: normal; color: #94a3b8; margin-left: 1px; }
.rk-delta { font-size: 8.5px; font-weight: 800; text-align: right; }
.rk-delta.good { color: #0f9d58; }
.rk-delta.bad { color: var(--brand-primary); }

/* ================= 剖面 ================= */
.tl { height: 100%; overflow: auto; }
.tl-axis {
  position: relative;
  height: 12px;
  margin-left: 66px;
  margin-right: 48px;
}
.tl-axis span {
  position: absolute;
  transform: translateX(-50%);
  font-size: 8px;
  color: #b6c2d2;
  font-weight: 600;
}
.tl-row {
  display: grid;
  grid-template-columns: 62px 1fr 44px;
  gap: 6px;
  align-items: center;
  padding: 3px 0;
}
.tl-name {
  font-size: 9.5px;
  font-weight: 700;
  color: #334155;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tl-track {
  position: relative;
  height: 14px;
  background: #f8fafc;
  border-radius: 4px;
  overflow: hidden;
}
.tl-grid { position: absolute; top: 0; bottom: 0; width: 1px; background: #f1f5f9; }
.tl-off {
  position: absolute;
  top: 3px;
  bottom: 3px;
  background: #e3e9f2;
  border-radius: 3px;
}
.tl-off.warn { background: #fbd9b0; }
.tl-run {
  position: absolute;
  top: 2px;
  bottom: 2px;
  background: linear-gradient(90deg, var(--brand-primary-hover), var(--brand-primary));
  border-radius: 3px;
}
.tl-none {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  color: #cbd5e1;
  font-weight: 700;
  letter-spacing: 1px;
}
.tl-val {
  text-align: right;
  font-size: 10px;
  font-weight: 700;
  color: #0f172a;
}
.tl-val i { font-size: 8px; font-style: normal; color: #94a3b8; }

/* ================= 异常 ================= */
.issues { height: 100%; overflow: auto; }
.is-row {
  display: grid;
  grid-template-columns: 3px 84px 62px 1fr;
  align-items: center;
  gap: 6px;
  padding: 5px 0;
  border-bottom: 1px solid #f6f8fb;
  font-size: 9.5px;
}
.is-lv { width: 3px; height: 14px; border-radius: 2px; }
.is-lv.h { background: var(--brand-primary); }
.is-lv.m { background: #f0a04b; }
.is-name {
  font-weight: 800;
  color: #0f172a;
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.is-name i {
  display: block;
  font-style: normal;
  font-size: 8.5px;
  color: #94a3b8;
  font-weight: 600;
}
.is-tag {
  font-size: 8.5px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  text-align: center;
  background: var(--brand-primary-light);
  color: #9f1239;
  white-space: nowrap;
}
.is-tag.t2 { background: #fff7ed; color: #b45309; }
.is-desc {
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ================= 节律 ================= */
.rh { height: 100%; display: flex; flex-direction: column; }
.rh-grid {
  display: grid;
  grid-template-columns: 22px repeat(24, 1fr);
  gap: 2px;
  align-content: start;
}
.rh-h { font-size: 7px; color: #c3cddb; text-align: center; font-weight: 600; }
.rh-wd { font-size: 8px; color: #94a3b8; font-weight: 700; }
.rh-c { height: 14px; border-radius: 2px; background: #f8fafc; }
.compact .rh-c { height: 10px; }

/* ============================================================
   展开态（非 compact）：整体放大，给管理人员看，字要大
   ============================================================ */
.op-view:not(.compact) .empty { font-size: 14px; }

.op-view:not(.compact) .cal-grid { gap: 6px; }
.op-view:not(.compact) .wd { font-size: 12px; }
.op-view:not(.compact) .cell { padding: 4px 7px; border-radius: 8px; }
.op-view:not(.compact) .dnum { font-size: 11px; line-height: 1.2; }
.op-view:not(.compact) .km { font-size: 17px; line-height: 1.1; }
.op-view:not(.compact) .km i { font-size: 9.5px; }
.op-view:not(.compact) .rate { font-size: 10.5px; line-height: 1.25; }
.op-view:not(.compact) .rest { font-size: 12px; }

.op-view:not(.compact) .mx-row { grid-template-columns: 100px repeat(7, minmax(44px, 1fr)) 78px; gap: 4px; }
.op-view:not(.compact) .mx-cell { height: 34px; font-size: 13.5px; border-radius: 6px; }
.op-view:not(.compact) .mx-row.head .mx-cell { height: 22px; font-size: 11.5px; }
.op-view:not(.compact) .mx-veh { font-size: 13px; }
.op-view:not(.compact) .mx-total { font-size: 13.5px; }
.op-view:not(.compact) .mx-total i { font-size: 10px; }
.op-view:not(.compact) .mx-group { padding: 5px 8px; margin-top: 4px; }
.op-view:not(.compact) .g-name { font-size: 12.5px; }
.op-view:not(.compact) .g-meta { font-size: 11px; }

.op-view:not(.compact) .quad-legend { font-size: 12px; gap: 14px; }
.op-view:not(.compact) .qtex { font-size: 11px; }
.op-view:not(.compact) .qtick { font-size: 10px; }
.op-view:not(.compact) .qaxis { font-size: 10.5px; }

.op-view:not(.compact) .rk { grid-template-columns: 24px 100px 1fr 82px 48px; padding: 9px 0; gap: 9px; }
.op-view:not(.compact) .rk-idx { width: 21px; height: 21px; font-size: 11.5px; border-radius: 5px; }
.op-view:not(.compact) .rk-name { font-size: 13.5px; }
.op-view:not(.compact) .rk-track { height: 12px; }
.op-view:not(.compact) .rk-bar { height: 12px; }
.op-view:not(.compact) .rk-val { font-size: 13.5px; }
.op-view:not(.compact) .rk-val i { font-size: 10px; }
.op-view:not(.compact) .rk-delta { font-size: 11px; }

.op-view:not(.compact) .tl-axis { margin-left: 100px; margin-right: 64px; }
.op-view:not(.compact) .tl-axis span { font-size: 11px; }
.op-view:not(.compact) .tl-row { grid-template-columns: 96px 1fr 64px; padding: 5px 0; gap: 8px; }
.op-view:not(.compact) .tl-track { height: 22px; border-radius: 6px; }
.op-view:not(.compact) .tl-name { font-size: 13px; }
.op-view:not(.compact) .tl-val { font-size: 13px; }
.op-view:not(.compact) .tl-val i { font-size: 10px; }

.op-view:not(.compact) .is-row { grid-template-columns: 5px 112px 92px 1fr; padding: 10px 0; gap: 9px; }
.op-view:not(.compact) .is-lv { width: 5px; height: 20px; border-radius: 3px; }
.op-view:not(.compact) .is-name { font-size: 13.5px; }
.op-view:not(.compact) .is-name i { font-size: 11px; }
.op-view:not(.compact) .is-tag { font-size: 11px; padding: 3px 8px; border-radius: 5px; }
.op-view:not(.compact) .is-desc { font-size: 12.5px; }

.op-view:not(.compact) .rh-grid { gap: 3px; }
.op-view:not(.compact) .rh-c { height: 34px; border-radius: 3px; }
.op-view:not(.compact) .rh-wd { font-size: 12px; }
.op-view:not(.compact) .rh-h { font-size: 10px; }
</style>
