<template>
  <el-dialog
    :model-value="modelValue"
    width="1080px"
    top="6vh"
    destroy-on-close
    :close-on-click-modal="false"
    class="stay-detail-dialog"
    @update:model-value="$emit('update:modelValue', $event)"
    @opened="handleOpened"
    @closed="handleClosed"
  >
    <template #header>
      <div class="sd-header">
        <div class="sd-title-wrap">
          <div class="sd-title-icon">
            <el-icon><Timer /></el-icon>
          </div>
          <div>
            <div class="sd-title">停留详情</div>
            <div class="sd-subtitle">停留点分布 · 时间轨迹</div>
          </div>
        </div>
        <div class="sd-header-right">
          <span v-if="event" class="sd-plate">
            <span class="sd-plate-bar"></span>
            {{ event.plate }}
          </span>
          <span v-if="points.length" class="sd-badge">
            <el-icon><Location /></el-icon>
            {{ points.length }} 个停留点
          </span>
        </div>
      </div>
    </template>

    <div v-if="event" class="sd-body">
      <div class="sd-main">
        <!-- 地图 -->
        <div class="sd-map-wrap">
          <div ref="mapRef" class="sd-map"></div>
          <div v-if="!points.length" class="sd-map-empty">
            <el-icon><Location /></el-icon>
            <span>暂无停留点数据</span>
          </div>
          <div v-if="points.length" class="sd-legend">
            <div class="sd-legend-item">
              <span class="sd-legend-dot"></span>
              <span>停留点</span>
            </div>
            <div class="sd-legend-item">
              <span class="sd-legend-line"></span>
              <span>停留轨迹</span>
            </div>
            <div class="sd-legend-item">
              <span class="sd-legend-circle"></span>
              <span>停留半径 {{ stayRadius }}m</span>
            </div>
          </div>
          <div v-if="activeIndex >= 0" class="sd-map-focus-tip">
            <el-icon><Aim /></el-icon>
            已定位到第 {{ activeIndex + 1 }} 个停留点
          </div>
        </div>

        <!-- 信息面板 -->
        <div class="sd-panel">
          <div class="sd-duration-card">
            <div class="sd-duration-icon">
              <el-icon><Timer /></el-icon>
            </div>
            <div class="sd-duration-info">
              <div class="sd-duration-value">
                {{ event.durationMin }}<small>分钟</small>
              </div>
              <div class="sd-duration-label">停留时长</div>
            </div>
            <div class="sd-duration-glow"></div>
          </div>

          <div class="sd-info-grid">
            <div class="sd-info-item">
              <div class="sd-info-label">开始时间</div>
              <div class="sd-info-value mono">{{ shortTime(event.startTime) }}</div>
            </div>
            <div class="sd-info-item">
              <div class="sd-info-label">结束时间</div>
              <div class="sd-info-value mono">{{ shortTime(event.endTime) }}</div>
            </div>
            <div class="sd-info-item">
              <div class="sd-info-label">所属机构</div>
              <div class="sd-info-value">{{ event.org || '--' }}</div>
            </div>
            <div class="sd-info-item">
              <div class="sd-info-label">VIN</div>
              <div class="sd-info-value mono small">{{ event.vin || '--' }}</div>
            </div>
            <div class="sd-info-item full">
              <div class="sd-info-label">停留位置</div>
              <div class="sd-info-value">
                {{ points[0]?.address || event.address || '--' }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 停留点时间线 -->
      <div class="sd-timeline">
        <div class="sd-timeline-header">
          <div class="sd-timeline-title">
            <el-icon><Clock /></el-icon>
            停留点轨迹
          </div>
          <div class="sd-timeline-tip">按时间顺序编号 ① ② ③ … · 点击卡片可定位</div>
        </div>
        <div class="sd-timeline-list">
          <div
            v-for="(p, i) in points"
            :key="i"
            class="sd-timeline-item"
            :class="{ active: i === activeIndex }"
            :style="{ animationDelay: (i * 0.06) + 's' }"
            @click="focusPoint(i)"
          >
            <div class="sd-tl-index">
              <span class="sd-tl-num">{{ i + 1 }}</span>
            </div>
            <div class="sd-tl-body">
              <div class="sd-tl-time">{{ shortTime(p.time) }}</div>
              <div class="sd-tl-addr" :title="p.address || ''">
                <el-icon><Location /></el-icon>
                <span class="sd-tl-addr-text">
                  {{ p.address || `${fmtCoord(p.lng)}, ${fmtCoord(p.lat)}` }}
                </span>
              </div>
            </div>
            <div class="sd-tl-shine"></div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="sd-footer">
        <button class="sd-btn ghost" @click="$emit('update:modelValue', false)">关闭</button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { Timer, Location, Clock, Aim } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

const props = defineProps({
  modelValue: Boolean,
  event: { type: Object, default: null },
})
defineEmits(['update:modelValue'])

// ============================================================
// 数据
// ============================================================
const points = computed(() => {
  const e = props.event
  if (!e) return []
  if (Array.isArray(e.points) && e.points.length) return e.points
  if (e.lng != null && e.lat != null) {
    return [{ lng: e.lng, lat: e.lat, time: e.startTime, address: e.address }]
  }
  return []
})

const stayRadius = computed(() => Number(props.event?.radius) || 200)

const shortTime = (t) => {
  if (!t) return '--'
  if (typeof t === 'number' || /^\d+$/.test(String(t))) {
    return dayjs(Number(t)).format('HH:mm:ss')
  }
  const m = String(t).match(/(\d{2}:\d{2}:\d{2})/)
  return m ? m[1] : dayjs(t).format('HH:mm:ss')
}

const fmtCoord = (v) => {
  const n = Number(v)
  return isNaN(n) ? '--' : n.toFixed(6)
}

// ============================================================
// 高德地图加载
// ============================================================
const AMAP_KEY = '273f5c474604b71906674aac159b8f45'
let amapPromise = null
const loadAMap = () => {
  if (amapPromise) return amapPromise
  amapPromise = new Promise((resolve, reject) => {
    if (window.AMap) return resolve(window.AMap)
    const script = document.createElement('script')
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}&plugin=AMap.Geocoder`
    script.onload = () => resolve(window.AMap)
    script.onerror = reject
    document.head.appendChild(script)
  })
  return amapPromise
}

// ============================================================
// 地图实例
// ============================================================
const mapRef = ref(null)
let mapInstance = null
let overlays = []
let markers = []
let polylineInstance = null
let circleInstance = null
const activeIndex = ref(-1)

const destroyMap = () => {
  if (mapInstance) {
    try { mapInstance.destroy() } catch (e) { /* noop */ }
    mapInstance = null
  }
  overlays = []
  markers = []
  polylineInstance = null
  circleInstance = null
  activeIndex.value = -1
}

// ⭐ 生成标记 HTML（已修复：补回开头的 <div class="...">）
const buildMarkerContent = (idx, active = false) => {
  const cls = active ? 'spm-marker active' : 'spm-marker'
  return `<div class="${cls}"><span class="spm-num">${idx + 1}</span></div>`
}

const updateMarkerHighlight = () => {
  if (!mapInstance) return
  markers.forEach((m, i) => {
    m.setContent(buildMarkerContent(i, i === activeIndex.value))
    m.setzIndex?.(200 + (i === activeIndex.value ? 100 : i))
  })
}

// ⭐ 点击时间线卡片：地图跳过去 + 高亮
const focusPoint = (i) => {
  const p = points.value[i]
  if (!p) return
  activeIndex.value = i
  updateMarkerHighlight()

  if (mapInstance) {
    mapInstance.setZoomAndCenter(17, [Number(p.lng), Number(p.lat)], false, 500)
  }
}

const handleOpened = async () => {
  if (!props.event || !points.value.length) return
  await nextTick()

  try {
    const AMap = await loadAMap()
    await nextTick()
    if (!mapRef.value) return

    // ⭐ 圆心 = 第一个停留点，半径 = 事件配置的 stayRadius
    const first = points.value[0]
    const centerLng = Number(first.lng)
    const centerLat = Number(first.lat)

    const map = new AMap.Map(mapRef.value, {
      zoom: 17,
      center: [centerLng, centerLat],
      mapStyle: 'amap://styles/whitesmoke',
      viewMode: '2D',
      zooms: [4, 19],
      showLabel: false,
    })
    mapInstance = map

    // ---- 1. 停留半径圆（虚线）以第一个点为圆心 ----
    const circle = new AMap.Circle({
      center: [centerLng, centerLat],
      radius: stayRadius.value,
      strokeColor: '#3B82F6',
      strokeWeight: 2,
      strokeOpacity: 0.85,
      strokeStyle: 'dashed',
      fillColor: '#3B82F6',
      fillOpacity: 0.06,
      zIndex: 5,
      bubble: true,
    })
    map.add(circle)
    overlays.push(circle)
    circleInstance = circle

    // ---- 2. 停留轨迹线 ----
    if (points.value.length > 1) {
      const path = points.value.map(p => [Number(p.lng), Number(p.lat)])
      const polyline = new AMap.Polyline({
        path,
        strokeColor: '#3B82F6',
        strokeWeight: 3.5,
        strokeOpacity: 0.9,
        lineJoin: 'round',
        lineCap: 'round',
        showDir: true,
        zIndex: 10,
      })
      map.add(polyline)
      overlays.push(polyline)
      polylineInstance = polyline
    }

    // ---- 3. 编号标记 ----
    markers = []
    points.value.forEach((p, i) => {
      const marker = new AMap.Marker({
        position: [Number(p.lng), Number(p.lat)],
        content: buildMarkerContent(i, false),
        offset: new AMap.Pixel(-16, -16),
        zIndex: 100 + i,
      })
      map.add(marker)
      overlays.push(marker)
      markers.push(marker)
    })

    // ---- 4. 视野：点分散→setFitView；点集中→直接用圆心 17 级 ----
    setTimeout(() => {
      if (!mapInstance) return
      const lngs = points.value.map(p => Number(p.lng))
      const lats = points.value.map(p => Number(p.lat))
      const lngSpan = Math.max(...lngs) - Math.min(...lngs)
      const latSpan = Math.max(...lats) - Math.min(...lats)
      const threshold = 0.001 // ≈ 100m

      if (lngSpan < threshold && latSpan < threshold) {
        map.setZoomAndCenter(17, [centerLng, centerLat], false, 400)
      } else {
        try {
          map.setFitView(overlays, false, [60, 60, 60, 60], 18)
        } catch (e) {
          map.setFitView()
        }
      }
    }, 280)
  } catch (e) {
    console.warn('[stay-detail] 地图初始化失败:', e)
  }
}

const handleClosed = () => {
  destroyMap()
}
</script>

<style scoped>
/* ========== 头部 ========== */
.sd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.sd-title-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}
.sd-title-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #3B82F6, #1D4ED8);
  color: #fff;
  font-size: 20px;
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.35);
}
.sd-title {
  font-size: 16px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: 0.3px;
}
.sd-subtitle {
  font-size: 12px;
  color: #94A3B8;
  font-weight: 500;
  margin-top: 2px;
}
.sd-header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.sd-plate {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px 5px 10px;
  border-radius: 999px;
  background: linear-gradient(135deg, #3B82F6, #1D4ED8);
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.8px;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.35);
  font-family: 'Courier New', monospace;
}
.sd-plate-bar {
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.85);
}
.sd-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: 999px;
  background: #EFF6FF;
  color: #1E40AF;
  font-size: 12.5px;
  font-weight: 700;
  border: 1px solid #BFDBFE;
}
.sd-badge .el-icon { font-size: 13px; }

/* ========== 主体 ========== */
.sd-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.sd-main {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 16px;
}

/* ========== 地图 ========== */
.sd-map-wrap {
  position: relative;
  height: 340px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #E2E8F0;
  background: #F1F5F9;
}
.sd-map {
  width: 100%;
  height: 100%;
}
.sd-map-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #94A3B8;
  font-size: 13px;
  background: #F8FAFC;
  z-index: 5;
}
.sd-map-empty .el-icon { font-size: 36px; }

.sd-legend {
  position: absolute;
  left: 12px;
  bottom: 12px;
  display: flex;
  gap: 12px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.94);
  border-radius: 8px;
  border: 1px solid #E2E8F0;
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  font-size: 11.5px;
  color: #475569;
  font-weight: 600;
  z-index: 10;
  animation: sdLegendIn 0.6s 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes sdLegendIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.sd-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.sd-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3B82F6, #1D4ED8);
  border: 1.5px solid #fff;
  box-shadow: 0 0 0 1px #93C5FD;
}
.sd-legend-line {
  width: 14px;
  height: 2px;
  background: #3B82F6;
  border-radius: 1px;
}
.sd-legend-circle {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1.5px dashed #3B82F6;
  background: rgba(59, 130, 246, 0.1);
}

/* 定位提示条 */
.sd-map-focus-tip {
  position: absolute;
  top: 12px;
  left: 12px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  background: rgba(59, 130, 246, 0.95);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  border-radius: 999px;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  z-index: 10;
  animation: sdTipIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.sd-map-focus-tip .el-icon { font-size: 13px; }
@keyframes sdTipIn {
  from { opacity: 0; transform: translateY(-6px) scale(0.9); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ========== 右侧面板 ========== */
.sd-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 340px;
}
.sd-duration-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  background: linear-gradient(135deg, #EFF6FF, #DBEAFE);
  border: 1px solid #BFDBFE;
  border-radius: 12px;
  overflow: hidden;
  animation: sdCardIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes sdCardIn {
  from { opacity: 0; transform: translateY(10px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.sd-duration-icon {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: linear-gradient(135deg, #3B82F6, #1D4ED8);
  color: #fff;
  font-size: 24px;
  box-shadow: 0 8px 20px rgba(59, 130, 246, 0.35);
  flex-shrink: 0;
  animation: sdIconFloat 3s ease-in-out infinite;
}
@keyframes sdIconFloat {
  0%, 100% { transform: translateY(0) rotate(0); }
  50% { transform: translateY(-3px) rotate(-4deg); }
}
.sd-duration-value {
  font-size: 30px;
  font-weight: 800;
  color: #1E40AF;
  font-family: 'Courier New', monospace;
  line-height: 1.1;
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.sd-duration-value small {
  font-size: 13px;
  font-weight: 600;
  color: #64748B;
}
.sd-duration-label {
  font-size: 12.5px;
  color: #64748B;
  font-weight: 600;
  margin-top: 2px;
}
.sd-duration-glow {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, #3B82F6, #1D4ED8);
}

.sd-info-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 12px;
  padding: 14px;
  background: #fff;
  border: 1px solid #F1F5F9;
  border-radius: 12px;
  animation: sdCardIn 0.5s 0.1s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  overflow-y: auto;
}
.sd-info-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.sd-info-item.full {
  grid-column: span 2;
}
.sd-info-label {
  font-size: 11px;
  color: #94A3B8;
  font-weight: 700;
  letter-spacing: 0.3px;
  text-transform: uppercase;
}
.sd-info-value {
  font-size: 13px;
  color: #0F172A;
  font-weight: 600;
  word-break: break-all;
  line-height: 1.35;
}
.sd-info-value.mono {
  font-family: 'Courier New', monospace;
  font-size: 12.5px;
}
.sd-info-value.small {
  font-size: 11.5px;
}

/* ========== 时间线 ========== */
.sd-timeline {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sd-timeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sd-timeline-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
  font-weight: 800;
  color: #0F172A;
}
.sd-timeline-title .el-icon {
  color: #3B82F6;
  font-size: 15px;
}
.sd-timeline-tip {
  font-size: 11.5px;
  color: #94A3B8;
  font-weight: 500;
}

.sd-timeline-list {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 4px 2px 8px;
  scrollbar-width: thin;
  scrollbar-color: #CBD5E1 transparent;
}
.sd-timeline-list::-webkit-scrollbar {
  height: 6px;
}
.sd-timeline-list::-webkit-scrollbar-thumb {
  background: #CBD5E1;
  border-radius: 3px;
}
.sd-timeline-list::-webkit-scrollbar-track {
  background: transparent;
}

.sd-timeline-item {
  position: relative;
  flex-shrink: 0;
  display: flex;
  gap: 10px;
  padding: 10px 14px 10px 12px;
  min-width: 280px;
  max-width: 340px;
  background: #fff;
  border: 1px solid #E2E8F0;
  border-radius: 10px;
  cursor: pointer;
  overflow: hidden;
  animation: sdTlIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1),
              box-shadow 0.28s ease,
              border-color 0.28s ease,
              background 0.28s ease;
}
@keyframes sdTlIn {
  from { opacity: 0; transform: translateX(-12px) scale(0.94); }
  to { opacity: 1; transform: translateX(0) scale(1); }
}
.sd-timeline-item:hover {
  border-color: #93C5FD;
  box-shadow: 0 8px 20px rgba(59, 130, 246, 0.18);
  transform: translateY(-3px);
}
.sd-timeline-item.active {
  border-color: #3B82F6;
  background: linear-gradient(135deg, #EFF6FF, #FFFFFF);
  box-shadow: 0 10px 24px rgba(59, 130, 246, 0.28);
  transform: translateY(-3px);
}
.sd-timeline-item.active::before {
  background: linear-gradient(180deg, #3B82F6, #1D4ED8);
  width: 4px;
}
.sd-timeline-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, #60A5FA, #1D4ED8);
  transition: width 0.28s ease;
}

/* 高亮流光 */
.sd-tl-shine {
  position: absolute;
  top: 0;
  left: -60%;
  width: 40%;
  height: 100%;
  background: linear-gradient(100deg,
    transparent 0%,
    rgba(59, 130, 246, 0.14) 50%,
    transparent 100%);
  opacity: 0;
  pointer-events: none;
}
.sd-timeline-item.active .sd-tl-shine {
  opacity: 1;
  animation: sdShine 2.4s ease-in-out infinite;
}
@keyframes sdShine {
  0% { left: -60%; }
  100% { left: 120%; }
}

.sd-tl-index {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sd-tl-num {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #3B82F6, #1D4ED8);
  color: #fff;
  font-size: 12.5px;
  font-weight: 800;
  font-family: 'Courier New', monospace;
  border-radius: 50%;
  box-shadow: 0 4px 10px rgba(59, 130, 246, 0.35);
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.sd-timeline-item.active .sd-tl-num {
  transform: scale(1.12);
  box-shadow: 0 6px 14px rgba(59, 130, 246, 0.55),
              0 0 0 4px rgba(59, 130, 246, 0.14);
}
.sd-tl-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  justify-content: center;
}
.sd-tl-time {
  font-size: 13px;
  font-weight: 800;
  color: #1E40AF;
  font-family: 'Courier New', monospace;
}
.sd-tl-addr {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  color: #475569;
  min-width: 0;
  line-height: 1.35;
}
.sd-tl-addr .el-icon {
  font-size: 11px;
  color: #3B82F6;
  flex-shrink: 0;
}
.sd-tl-addr-text {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-all;
}

/* ========== 底部 ========== */
.sd-footer {
  display: flex;
  justify-content: flex-end;
}
.sd-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 22px;
  border-radius: 8px;
  font-size: 13.5px;
  font-weight: 600;
  font-family: inherit;
  border: none;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.sd-btn.ghost {
  background: #F1F5F9;
  color: #475569;
  border: 1px solid #E2E8F0;
}
.sd-btn.ghost:hover {
  background: #E2E8F0;
  color: #1E293B;
  transform: translateY(-2px);
}
</style>

<!-- ========== 全局样式（地图标记 / 弹窗外壳）========== -->
<style>
/* ---- 弹窗外壳 ---- */
/* ⭐ el-dialog 会把 class 合并到 .el-dialog 自身，必须用同元素选择器 */
.stay-detail-dialog.el-dialog {
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 30px 80px rgba(15, 23, 42, 0.25);
  max-width: 95vw;
}
.stay-detail-dialog .el-dialog__header {
  padding: 18px 24px;
  margin: 0;
  border-bottom: 1px solid #F1F5F9;
  background: linear-gradient(180deg, #FFFFFF, #FAFBFC);
}
.stay-detail-dialog .el-dialog__body {
  padding: 20px 24px;
  background: #F8FAFC;
  max-height: 72vh;
  overflow-y: auto;
}
.stay-detail-dialog .el-dialog__footer {
  padding: 14px 24px;
  background: #fff;
  border-top: 1px solid #F1F5F9;
}

/* ---- 地图上的停留点标记（静态，无入场动画、无脉冲）---- */
.spm-marker {
  position: relative;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.spm-marker .spm-num {
  position: relative;
  z-index: 2;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #3B82F6, #1D4ED8);
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  font-family: 'Courier New', monospace;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.5);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* ---- 高亮标记 ---- */
.spm-marker.active {
  transform: scale(1.25);
}
.spm-marker.active .spm-num {
  background: linear-gradient(135deg, #1D4ED8, #1E40AF);
  box-shadow: 0 0 0 5px rgba(59, 130, 246, 0.25),
              0 8px 20px rgba(29, 78, 216, 0.55);
}

/* ---- 响应式 ---- */
@media (max-width: 960px) {
  .stay-detail-dialog.el-dialog { width: 94vw !important; }
}
</style>