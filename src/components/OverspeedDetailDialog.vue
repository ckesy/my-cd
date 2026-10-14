<template>
  <el-dialog
    :model-value="modelValue"
    width="880px"
    top="6vh"
    destroy-on-close
    :close-on-click-modal="false"
    class="overspeed-detail-dialog"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <template #header>
      <div class="osd-header">
        <span class="osd-header-title">超速详情</span>
        <span v-if="segment" class="osd-header-plate">
          <span class="osd-plate-bar"></span>
          {{ segment.plate }}
        </span>
      </div>
    </template>

    <div v-if="segment" class="osd-body">
      <!-- 4 个统计卡片 -->
      <div class="osd-stats">
        <div class="osd-stat" :style="{ animationDelay: '0s' }">
          <div class="osd-stat-icon max"><el-icon><Top /></el-icon></div>
          <div class="osd-stat-info">
            <div class="osd-stat-value">{{ displayValues.maxSpeed }}<small>km/h</small></div>
            <div class="osd-stat-label">最高速度</div>
          </div>
        </div>
        <div class="osd-stat" :style="{ animationDelay: '0.08s' }">
          <div class="osd-stat-icon avg"><el-icon><DataLine /></el-icon></div>
          <div class="osd-stat-info">
            <div class="osd-stat-value">{{ displayValues.avgSpeed }}<small>km/h</small></div>
            <div class="osd-stat-label">平均速度</div>
          </div>
        </div>
        <div class="osd-stat" :style="{ animationDelay: '0.16s' }">
          <div class="osd-stat-icon dur"><el-icon><Timer /></el-icon></div>
          <div class="osd-stat-info">
            <div class="osd-stat-value">{{ durationText }}</div>
            <div class="osd-stat-label">持续时长</div>
          </div>
        </div>
        <div class="osd-stat" :style="{ animationDelay: '0.24s' }">
          <div class="osd-stat-icon cnt"><el-icon><WarningFilled /></el-icon></div>
          <div class="osd-stat-info">
            <div class="osd-stat-value">{{ segment.pointCount }}</div>
            <div class="osd-stat-label">超速点数</div>
          </div>
        </div>
      </div>

      <!-- ⭐ 报警位置栏 -->
      <div v-if="segmentAddress" class="osd-address-bar">
        <el-icon><Location /></el-icon>
        <span>{{ segmentAddress }}</span>
      </div>

      <!-- 曲线图 -->
      <div class="osd-section">
        <div class="osd-section-title">
          <span class="osd-bar"></span>
          速度曲线
        </div>
        <div class="osd-chart-wrap" @mouseleave="hoverPoint = null">
          <svg ref="chartSvgRef" class="osd-chart" viewBox="0 0 800 220" preserveAspectRatio="none">
            <defs>
              <linearGradient id="osdSpeedGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#c8102e" stop-opacity="0.35"/>
                <stop offset="100%" stop-color="#c8102e" stop-opacity="0"/>
              </linearGradient>
              <linearGradient id="osdLineGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="#F59E0B"/>
                <stop offset="50%" stop-color="#c8102e"/>
                <stop offset="100%" stop-color="#991B1B"/>
              </linearGradient>
            </defs>

            <g class="osd-grid">
              <line v-for="i in 5" :key="'g'+i" :x1="40" :y1="10 + (i-1) * 45" :x2="790" :y2="10 + (i-1) * 45" />
            </g>

            <g class="osd-axis-y">
              <text v-for="(v, i) in yAxisLabels" :key="'y'+i" :x="34" :y="14 + i * 45" text-anchor="end">{{ v }}</text>
            </g>

            <line class="osd-threshold-line" :x1="40" :x2="790" :y1="thresholdY" :y2="thresholdY" />
            <text class="osd-threshold-label" :x="792" :y="thresholdY + 4">阈值 {{ threshold }}</text>

            <path v-if="areaPath" :d="areaPath" fill="url(#osdSpeedGrad)" class="osd-area" />

            <path
              v-if="linePath"
              ref="linePathRef"
              :d="linePath"
              class="osd-line"
              fill="none"
              stroke="url(#osdLineGrad)"
              stroke-width="2.5"
              stroke-linejoin="round"
              stroke-linecap="round"
            />

            <g>
              <circle
                v-for="(p, i) in chartPoints"
                :key="'p'+i"
                :cx="p.x"
                :cy="p.y"
                r="3"
                class="osd-point"
                :class="{ 'is-hovered': hoverPoint && hoverPoint.index === i }"
                :style="{ animationDelay: (0.6 + i * 0.02) + 's' }"
                @mouseenter="hoverPoint = { index: i, x: p.x, y: p.y, data: segment.points[i] }"
              />
            </g>

            <text class="osd-axis-x" x="40" y="218">{{ startTimeText }}</text>
            <text class="osd-axis-x" x="790" y="218" text-anchor="end">{{ endTimeText }}</text>
          </svg>

          <transition name="tooltip-fade">
            <div
              v-if="hoverPoint"
              class="osd-tooltip"
              :style="{
                left: (hoverPoint.x / 800 * 100) + '%',
                top: (hoverPoint.y / 220 * 100) + '%',
              }"
            >
              <div class="osd-tooltip-arrow"></div>
              <div class="osd-tooltip-time">{{ hoverPoint.data.timeStr }}</div>
              <div class="osd-tooltip-speed">
                <span class="speed-num">{{ Number(hoverPoint.data.velocity).toFixed(1) }}</span>
                <span class="speed-unit">km/h</span>
              </div>
            </div>
          </transition>
        </div>
      </div>

      <!-- 超速点列表 -->
      <div class="osd-section">
        <div class="osd-section-title">
          <span class="osd-bar"></span>
          超速点列表
          <span class="osd-count">{{ segment.pointCount }} 个点</span>
        </div>
        <div class="osd-points-list">
          <div
            v-for="(p, i) in segment.points"
            :key="i"
            class="osd-point-row"
            :style="{ animationDelay: (0.3 + i * 0.02) + 's' }"
          >
            <span class="osd-point-idx">{{ i + 1 }}</span>
            <span class="osd-point-time">{{ p.timeStr }}</span>
            <span class="osd-point-speed" :class="{ high: p.velocity > threshold + 10 }">
              {{ p.velocity.toFixed(1) }} km/h
            </span>
            <span class="osd-point-loc">
              <!-- ⭐ 优先显示点的地址，没有就显示经纬度 -->
              <template v-if="pointAddresses[i]">
                <el-icon class="loc-icon"><Location /></el-icon>
                {{ pointAddresses[i] }}
              </template>
              <template v-else-if="addressLoading">
                <span class="loc-loading"></span>
                <span class="loc-loading-text">定位中…</span>
              </template>
              <template v-else>
                {{ p.lng.toFixed(5) }}, {{ p.lat.toFixed(5) }}
              </template>
            </span>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="osd-footer">
        <button class="osd-btn ghost" @click="$emit('update:modelValue', false)">关闭</button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { Top, DataLine, Timer, WarningFilled, Location } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

const props = defineProps({
  modelValue: Boolean,
  segment: { type: Object, default: null },
  threshold: { type: Number, default: 80 },
})
const emit = defineEmits(['update:modelValue'])

const linePathRef = ref(null)
const hoverPoint = ref(null)
const displayValues = ref({ maxSpeed: 0, avgSpeed: 0 })

// ⭐ 地址相关
const segmentAddress = ref('')        // 段级地址
const pointAddresses = ref([])         // 每个点的地址（数组，索引对应点）
const addressLoading = ref(false)      // 是否正在查询地址

// ============================================================
// 弹窗打开时锁住背景滚动
// ============================================================
watch(() => props.modelValue, (val) => {
  const mainContent = document.querySelector('.main-content')
  if (mainContent) {
    if (val) {
      mainContent.dataset._prevOverflow = mainContent.style.overflow || ''
      mainContent.style.overflow = 'hidden'
    } else {
      mainContent.style.overflow = mainContent.dataset._prevOverflow || ''
    }
  }
  if (val) {
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
  } else {
    document.documentElement.style.overflow = ''
    document.body.style.overflow = ''
  }
})

// ============================================================
// 数字滚动
// ============================================================
const countUp = (target, setter, duration = 700) => {
  const start = performance.now()
  const tick = (now) => {
    const progress = Math.min((now - start) / duration, 1)
    const eased = 1 - Math.pow(1 - progress, 3)
    setter((target * eased).toFixed(1))
    if (progress < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

const durationText = computed(() => {
  if (!props.segment) return '--'
  const s = props.segment.durationSec
  if (s < 60) return `${s} 秒`
  const m = Math.floor(s / 60)
  const ss = s % 60
  return ss === 0 ? `${m} 分钟` : `${m}分${ss}秒`
})

const startTimeText = computed(() => props.segment ? dayjs(props.segment.startTime).format('HH:mm:ss') : '')
const endTimeText = computed(() => props.segment ? dayjs(props.segment.endTime).format('HH:mm:ss') : '')

// ============================================================
// 图表几何
// ============================================================
const CHART_LEFT = 40
const CHART_RIGHT = 790
const CHART_TOP = 10
const CHART_BOTTOM = 190
const CHART_W = CHART_RIGHT - CHART_LEFT
const CHART_H = CHART_BOTTOM - CHART_TOP

const yRange = computed(() => {
  if (!props.segment) return { min: 0, max: 100 }
  const speeds = props.segment.points.map(p => p.velocity)
  const maxV = Math.max(...speeds, props.threshold)
  const minV = Math.min(...speeds)
  const pad = Math.max(5, (maxV - minV) * 0.15)
  return {
    min: Math.max(0, Math.floor(minV - pad)),
    max: Math.ceil(maxV + pad),
  }
})

const yAxisLabels = computed(() => {
  const { min, max } = yRange.value
  const step = (max - min) / 4
  return [4, 3, 2, 1, 0].map(i => Math.round(min + step * i))
})

const thresholdY = computed(() => {
  const { min, max } = yRange.value
  const r = (props.threshold - min) / (max - min)
  return CHART_BOTTOM - Math.max(0, Math.min(1, r)) * CHART_H
})

const chartPoints = computed(() => {
  if (!props.segment || !props.segment.points.length) return []
  const { min, max } = yRange.value
  const range = max - min || 1
  const pts = props.segment.points
  const t0 = pts[0].timeMs
  const t1 = pts[pts.length - 1].timeMs
  const dt = t1 - t0 || 1

  return pts.map(p => ({
    x: CHART_LEFT + ((p.timeMs - t0) / dt) * CHART_W,
    y: CHART_BOTTOM - ((p.velocity - min) / range) * CHART_H,
  }))
})

const linePath = computed(() => {
  const pts = chartPoints.value
  if (!pts.length) return ''
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
})

const areaPath = computed(() => {
  const pts = chartPoints.value
  if (!pts.length) return ''
  const base = `M ${pts[0].x} ${CHART_BOTTOM} `
  const line = pts.map(p => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
  return `${base}${line} L ${pts[pts.length - 1].x} ${CHART_BOTTOM} Z`
})

// ============================================================
// ⭐ 前端兜底：用 AMap.Geocoder 查地址
// ============================================================
const waitForAMap = () => {
  return new Promise((resolve) => {
    if (window.AMap && window.AMap.Geocoder) { resolve(true); return }
    let retry = 0
    const timer = setInterval(() => {
      if (window.AMap && window.AMap.Geocoder) {
        clearInterval(timer)
        resolve(true)
      } else if (++retry > 30) {   // 3 秒超时
        clearInterval(timer)
        resolve(false)
      }
    }, 100)
  })
}

const queryAddressFrontend = async (lng, lat) => {
  try {
    const geocoder = new window.AMap.Geocoder({ radius: 200, extensions: 'base' })
    return await new Promise((resolve) => {
      geocoder.getAddress([lng, lat], (status, result) => {
        if (status === 'complete' && result.regeocode) {
          resolve(result.regeocode.formattedAddress || '')
        } else {
          resolve('')
        }
      })
    })
  } catch (e) {
    console.warn('[OverspeedDetail] 前端逆地理编码失败:', e)
    return ''
  }
}

// 并发 3 对每个点查地址
const queryPointAddresses = async (points) => {
  const CONCURRENCY = 3
  let idx = 0
  const addresses = new Array(points.length).fill('')
  const worker = async () => {
    while (idx < points.length) {
      const i = idx++
      const p = points[i]
      addresses[i] = await queryAddressFrontend(p.lng, p.lat)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, points.length) }, worker))
  return addresses
}

// ============================================================
// 弹窗打开时：初始化地址
// ============================================================
watch(() => props.modelValue, async (val) => {
  if (!val || !props.segment) return

  // 1. 数字滚动 + 曲线绘制
  displayValues.value = { maxSpeed: '0.0', avgSpeed: '0.0' }
  countUp(props.segment.maxSpeed, v => { displayValues.value.maxSpeed = v })
  countUp(props.segment.avgSpeed, v => { displayValues.value.avgSpeed = v })

  await nextTick()
  const path = linePathRef.value
  if (path) {
    try {
      const len = path.getTotalLength()
      path.style.strokeDasharray = String(len)
      path.style.strokeDashoffset = String(len)
      path.style.transition = 'none'
      void path.getBoundingClientRect()
      path.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(0.34, 1.26, 0.64, 1)'
      path.style.strokeDashoffset = '0'
    } catch (e) { /* ignore */ }
  }

  // 2. ⭐ 地址处理
  segmentAddress.value = props.segment.address || ''
  pointAddresses.value = []
  addressLoading.value = false

  if (segmentAddress.value) {
    // 云函数已有段地址，所有点都用它
    pointAddresses.value = props.segment.points.map(() => segmentAddress.value)
    return
  }

  // 云函数没给地址 → 前端兜底
  addressLoading.value = true
  const ok = await waitForAMap()
  if (!ok) {
    console.warn('[OverspeedDetail] AMap.Geocoder 不可用，显示经纬度')
    addressLoading.value = false
    return
  }

  try {
    // 用段中心点查段地址
    const centerAddr = await queryAddressFrontend(props.segment.lng, props.segment.lat)
    if (centerAddr) {
      segmentAddress.value = centerAddr
      pointAddresses.value = props.segment.points.map(() => centerAddr)
    } else {
      // 段中心也拿不到 → 对每个点单独查
      const addrs = await queryPointAddresses(props.segment.points)
      pointAddresses.value = addrs
    }
  } catch (e) {
    console.warn('[OverspeedDetail] 地址查询异常:', e)
  } finally {
    addressLoading.value = false
  }
})
</script>

<style scoped>
/* 头部 */
.osd-header { display: flex; align-items: center; gap: 12px; }
.osd-header-title { font-size: 16px; font-weight: 700; color: #0F172A; letter-spacing: 0.3px; }
.osd-header-plate {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 14px 4px 10px;
  border-radius: 999px;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #fff; font-size: 13px; font-weight: 800;
  letter-spacing: 0.8px;
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.35);
  font-family: 'Courier New', monospace;
}
.osd-plate-bar {
  width: 3px; height: 14px; border-radius: 2px;
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 0 6px rgba(255, 255, 255, 0.9);
}

/* 主体 */
.osd-body { display: flex; flex-direction: column; gap: 12px; }

/* 4 个统计卡片 */
.osd-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.osd-stat {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  background: linear-gradient(135deg, #fff 0%, #FEF2F2 100%);
  border: 1px solid #FEE2E2;
  border-radius: 10px;
  opacity: 0;
  animation: osdStatIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.osd-stat:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 24px rgba(200, 16, 46, 0.12);
  border-color: #FCA5A5;
}
@keyframes osdStatIn {
  from { opacity: 0; transform: translateY(12px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.osd-stat-icon {
  width: 38px; height: 38px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 10px; color: #fff; font-size: 18px;
  flex-shrink: 0;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.osd-stat:hover .osd-stat-icon { transform: scale(1.1) rotate(-6deg); }
.osd-stat-icon.max { background: linear-gradient(135deg, #EF4444, #991B1B); box-shadow: 0 5px 14px rgba(239, 68, 68, 0.35); }
.osd-stat-icon.avg { background: linear-gradient(135deg, #F59E0B, #D97706); box-shadow: 0 5px 14px rgba(245, 158, 11, 0.35); }
.osd-stat-icon.dur { background: linear-gradient(135deg, #3B82F6, #1D4ED8); box-shadow: 0 5px 14px rgba(59, 130, 246, 0.35); }
.osd-stat-icon.cnt { background: linear-gradient(135deg, #8B5CF6, #6D28D9); box-shadow: 0 5px 14px rgba(139, 92, 246, 0.35); }

.osd-stat-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.osd-stat-value {
  font-size: 19px; font-weight: 800; color: #0F172A;
  font-family: 'Courier New', monospace; line-height: 1.1;
  letter-spacing: -0.5px;
  display: flex; align-items: baseline; gap: 3px;
}
.osd-stat-value small { font-size: 10.5px; font-weight: 600; color: #94A3B8; letter-spacing: 0; }
.osd-stat-label { font-size: 11.5px; color: #64748B; font-weight: 600; letter-spacing: 0.3px; }

/* ⭐ 报警位置栏 */
.osd-address-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px;
  background: linear-gradient(135deg, #FEF2F2, #FEE2E2);
  border: 1px solid #FECACA;
  border-radius: 10px;
  font-size: 13px;
  color: #991B1B;
  font-weight: 600;
  line-height: 1.4;
  animation: osdAddressIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes osdAddressIn {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}
.osd-address-bar .el-icon {
  color: #c8102e;
  font-size: 16px;
  flex-shrink: 0;
}

/* Section */
.osd-section {
  background: #FAFBFC;
  border: 1px solid #F1F5F9;
  border-radius: 10px;
  padding: 10px 14px;
}
.osd-section-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 700;
  color: #0F172A;
  margin-bottom: 8px;
  letter-spacing: 0.3px;
}
.osd-bar {
  width: 3px; height: 12px;
  border-radius: 2px;
  background: linear-gradient(180deg, #c8102e, #7F1D1D);
  box-shadow: 0 0 6px rgba(200, 16, 46, 0.5);
}
.osd-count { margin-left: auto; font-size: 11.5px; color: #94A3B8; font-weight: 500; }

/* 图表 */
.osd-chart-wrap { width: 100%; position: relative; }
.osd-chart { width: 100%; height: 160px; display: block; }
.osd-grid line { stroke: #E2E8F0; stroke-width: 1; stroke-dasharray: 3 4; }
.osd-axis-y text { font-size: 10px; fill: #94A3B8; font-family: 'Courier New', monospace; font-weight: 600; }
.osd-axis-x { font-size: 11px; fill: #64748B; font-family: 'Courier New', monospace; font-weight: 600; }
.osd-threshold-line {
  stroke: #c8102e;
  stroke-width: 1.5;
  stroke-dasharray: 6 4;
  opacity: 0.7;
  animation: thresholdPulse 2s ease-in-out infinite;
}
@keyframes thresholdPulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.95; } }
.osd-threshold-label { font-size: 10.5px; fill: #c8102e; font-weight: 700; }
.osd-area { opacity: 0; animation: areaFadeIn 1s ease-out 0.6s forwards; }
@keyframes areaFadeIn { to { opacity: 1; } }

.osd-point {
  fill: #fff;
  stroke: #c8102e;
  stroke-width: 1.8;
  opacity: 0;
  animation: pointPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  cursor: pointer;
  transition: all 0.2s;
}
.osd-point:hover {
  r: 5;
  fill: #c8102e;
  stroke: #fff;
  stroke-width: 2.5;
  filter: drop-shadow(0 0 6px rgba(200, 16, 46, 0.7));
}
@keyframes pointPop { from { opacity: 0; r: 0; } to { opacity: 1; r: 3; } }

/* 超速点列表 */
.osd-points-list {
  max-height: 140px;
  overflow-y: auto;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #F1F5F9;
}
.osd-points-list::-webkit-scrollbar { width: 6px; }
.osd-points-list::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }

.osd-point-row {
  display: grid;
  grid-template-columns: 32px 90px 80px 1fr;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 12px;
  border-bottom: 1px solid #F8FAFC;
  opacity: 0;
  animation: rowIn 0.35s ease forwards;
  transition: background 0.2s;
}
.osd-point-row:hover { background: #FEF2F2; }
.osd-point-row:last-child { border-bottom: none; }
@keyframes rowIn {
  from { opacity: 0; transform: translateX(-6px); }
  to { opacity: 1; transform: translateX(0); }
}
.osd-point-idx {
  width: 20px; height: 20px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: #F1F5F9;
  color: #64748B;
  font-size: 10.5px; font-weight: 800;
  font-family: 'Courier New', monospace;
}
.osd-point-time {
  color: #334155;
  font-family: 'Courier New', monospace;
  font-weight: 600;
}
.osd-point-speed {
  padding: 2px 8px;
  border-radius: 999px;
  background: #FEF3C7;
  color: #92400E;
  font-weight: 800;
  font-size: 11.5px;
  font-family: 'Courier New', monospace;
  text-align: center;
  transition: all 0.2s;
}
.osd-point-speed.high {
  background: #FEE2E2;
  color: #991B1B;
  animation: highSpeedPulse 1.6s ease-in-out infinite;
}
@keyframes highSpeedPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
  50% { box-shadow: 0 0 0 4px rgba(239, 68, 68, 0); }
}

/* ⭐ 位置列 */
.osd-point-loc {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #64748B;
  font-size: 11.5px;
  font-family: 'Courier New', monospace;
  text-align: right;
  justify-content: flex-end;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.osd-point-loc .loc-icon {
  color: #c8102e;
  font-size: 12px;
  flex-shrink: 0;
}
.osd-point-loc .loc-loading {
  display: inline-block;
  width: 10px; height: 10px;
  border: 1.5px solid #FCA5A5;
  border-top-color: #c8102e;
  border-radius: 50%;
  animation: locSpin 0.8s linear infinite;
  flex-shrink: 0;
}
@keyframes locSpin { to { transform: rotate(360deg); } }
.osd-point-loc .loc-loading-text {
  color: #94A3B8;
  font-size: 11px;
}

/* Footer */
.osd-footer { display: flex; justify-content: flex-end; gap: 10px; }
.osd-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 7px 22px;
  border-radius: 8px;
  font-size: 13.5px; font-weight: 600;
  font-family: inherit;
  border: none;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.osd-btn.ghost {
  background: #F1F5F9; color: #475569;
  border: 1px solid #E2E8F0;
}
.osd-btn.ghost:hover {
  background: #E2E8F0; color: #1E293B;
  transform: translateY(-2px);
}

/* 曲线 hover tooltip */
.osd-point.is-hovered {
  r: 6;
  fill: #c8102e;
  stroke: #fff;
  stroke-width: 2.5;
  filter: drop-shadow(0 0 8px rgba(200, 16, 46, 0.7));
}
.osd-tooltip {
  position: absolute;
  transform: translate(-50%, calc(-100% - 14px));
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.96), rgba(15, 23, 42, 0.96));
  backdrop-filter: blur(8px);
  border-radius: 8px;
  padding: 8px 12px;
  pointer-events: none;
  z-index: 10;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1);
  min-width: 110px;
  white-space: nowrap;
}
.osd-tooltip-arrow {
  position: absolute;
  bottom: -5px;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 10px; height: 10px;
  background: rgba(15, 23, 42, 0.96);
  box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
}
.osd-tooltip-time {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.65);
  font-family: 'Courier New', monospace;
  letter-spacing: 0.2px;
  margin-bottom: 4px;
  font-weight: 600;
}
.osd-tooltip-speed { display: flex; align-items: baseline; gap: 3px; }
.osd-tooltip-speed .speed-num {
  font-size: 18px;
  font-weight: 800;
  color: #ffffff;
  font-family: 'Courier New', monospace;
  letter-spacing: -0.5px;
  line-height: 1.1;
  background: linear-gradient(120deg, #ffffff 0%, #FCA5A5 50%, #ffffff 100%);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: tooltipShine 2s ease-in-out infinite;
}
.osd-tooltip-speed .speed-unit {
  font-size: 10.5px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
}
@keyframes tooltipShine {
  0%, 100% { background-position: 0% 0; }
  50% { background-position: 100% 0; }
}
.tooltip-fade-enter-active { transition: opacity 0.15s ease, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); }
.tooltip-fade-leave-active { transition: opacity 0.1s ease; }
.tooltip-fade-enter-from {
  opacity: 0;
  transform: translate(-50%, calc(-100% - 6px)) scale(0.9);
}
.tooltip-fade-leave-to { opacity: 0; }
</style>

<style>
.overspeed-detail-dialog .el-dialog {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.18);
}
.overspeed-detail-dialog .el-dialog__header {
  padding: 14px 20px;
  margin: 0;
  border-bottom: 1px solid #F1F5F9;
}
.overspeed-detail-dialog .el-dialog__body {
  padding: 14px 20px;
  max-height: none;
  overflow: visible;
}
.overspeed-detail-dialog .el-dialog__footer {
  padding: 12px 20px;
  background: #FAFBFC;
  border-top: 1px solid #F1F5F9;
}
</style>