<template>
  <div class="fullmap" :class="{ 'is-fs': focusFullscreen, 'is-focus': !!focusMode }">
    <div class="map-stage">
      <div id="map-container" class="map-container"></div>

      <svg ref="rangingSvgRef" class="ranging-svg" xmlns="http://www.w3.org/2000/svg"></svg>

      <!-- ⭐ 沉浸态路线层（独立 SVG，不受地图滤镜影响） -->
      <svg v-if="focusMode" ref="focusSvgRef" class="focus-svg" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="focusLineGrad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stop-color="#4338CA" />
            <stop offset="55%" stop-color="#6366F1" />
            <stop offset="100%" stop-color="#22D3EE" />
          </linearGradient>
          <filter id="focusGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="7" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <template v-if="focusSvgD">
          <path :d="focusSvgD" fill="none" stroke="#4F46E5" stroke-width="18" stroke-linecap="round"
            stroke-linejoin="round" opacity=".26" filter="url(#focusGlow)" />
          <path :d="focusSvgD" fill="none" stroke="url(#focusLineGrad)" stroke-width="6" stroke-linecap="round"
            stroke-linejoin="round" pathLength="100" :style="{ strokeDasharray: (focusGrow * 100) + ' 100' }" />
          <path :d="focusSvgD" fill="none" stroke="#41548A" stroke-width="6" stroke-linecap="round"
            stroke-linejoin="round" pathLength="100" :style="{ strokeDasharray: focusPct + ' 100' }" />
          <path :d="focusSvgD" fill="none" stroke="#DFF9FF" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round" class="focus-flow" opacity=".92" />
        </template>

        <template v-if="focusStartXY">
          <g :transform="`translate(${focusStartXY.x} ${focusStartXY.y})`">
            <circle r="8" fill="#0B1220" stroke="#818CF8" stroke-width="2.5" />
            <circle r="2.8" fill="#A5B4FC" />
            <text x="0" y="22" text-anchor="middle" fill="#C7D2FE" font-size="10.5"
              font-weight="700">起点 · {{ focusMode.task.pickup || '--' }}</text>
          </g>
        </template>
        <template v-if="focusEndXY">
          <g :transform="`translate(${focusEndXY.x} ${focusEndXY.y})`">
            <circle r="10" fill="#0B1220" stroke="#22D3EE" stroke-width="2.8" />
            <circle r="3.6" fill="#67E8F9" />
            <text x="0" y="-18" text-anchor="middle" fill="#A5F3FC" font-size="10.5"
              font-weight="700">终点 · {{ focusMode.task.delivery || '--' }}</text>
          </g>
        </template>

        <!-- 车辆 -->
        <g :transform="`translate(${focusVehXY.x} ${focusVehXY.y})`">
          <circle r="13" fill="#22D3EE" opacity=".2" class="fv-pulse-svg" />
          <circle r="9" fill="rgba(34,211,238,.16)" stroke="rgba(103,232,249,.8)" stroke-width="1.2" />
          <circle r="4.4" fill="#E0F2FE" />
          <circle r="2.2" fill="#0EA5E9" />
          <text y="-19" text-anchor="middle" fill="#E0F2FE" font-size="11"
            font-weight="800">{{ focusMode.vehicle.plate }}</text>
        </g>

        <!-- 流光 -->
        <circle v-if="focusCometVisible" :cx="focusCometXY.x" :cy="focusCometXY.y" r="4.6" fill="#F0FDFF"
          filter="url(#focusGlow)" />
      </svg>

      <div v-if="!focusMode" class="top-bar">
        <div class="left-group">
          <div class="stats-pills">
            <div class="stat-pill" :class="{ active: statusFilter === 'all' }" @click="setStatusFilter('all')">
              <span class="pill-dot total-dot"></span>
              <span class="pill-value">{{ totalCount }}</span>
              <span class="pill-label">全部</span>
            </div>
            <div class="stat-pill" :class="{ active: statusFilter === '行驶' }" @click="setStatusFilter('行驶')">
              <span class="pill-dot driving-dot"></span>
              <span class="pill-value">{{ drivingCount }}</span>
              <span class="pill-label">行驶</span>
            </div>
            <div class="stat-pill" :class="{ active: statusFilter === '静止' }" @click="setStatusFilter('静止')">
              <span class="pill-dot parked-dot"></span>
              <span class="pill-value">{{ parkedCount }}</span>
              <span class="pill-label">静止</span>
            </div>
            <div class="stat-pill" :class="{ active: statusFilter === '离线' }" @click="setStatusFilter('离线')">
              <span class="pill-dot offline-dot"></span>
              <span class="pill-value">{{ offlineCount }}</span>
              <span class="pill-label">离线</span>
            </div>
          </div>

          <el-button class="refresh-btn" @click="refreshLocations(true)" :loading="loadingVehicles" size="small">
            <el-icon :class="{ 'icon-spin': loadingVehicles }"><Refresh /></el-icon>
            刷新定位
          </el-button>
        </div>

        <div class="map-controls">
          <el-select v-model="currentMapStyle" size="small" class="style-select" @change="changeMapStyle">
            <template #prefix><el-icon><Brush /></el-icon></template>
            <el-option label="草色青" value="amap://styles/fresh" />
            <el-option label="远山黛" value="amap://styles/whitesmoke" />
            <el-option label="月光银" value="amap://styles/light" />
            <el-option label="雅士灰" value="amap://styles/grey" />
            <el-option label="靛青蓝" value="amap://styles/blue" />
            <el-option label="暗黑" value="amap://styles/dark" />
          </el-select>

          <button class="ctrl-btn" :class="{ active: showSatellite }" @click="toggleSatellite" title="卫星图">
            <el-icon><Aim /></el-icon><span>卫星</span>
          </button>

          <button class="ctrl-btn" :class="{ active: showRoadNet }" @click="toggleRoadNet" title="路网">
            <el-icon><Guide /></el-icon><span>路网</span>
          </button>

          <button class="ctrl-btn" :class="{ active: rangingActive }" @click="toggleRanging" title="测距">
            <el-icon><Position /></el-icon>
            <span>{{ rangingActive ? '结束' : '测距' }}</span>
          </button>
        </div>
      </div>

      <transition name="summary-slide">
        <div v-if="rangingActive && segmentCount > 0" class="ranging-summary">
          <div class="ranging-summary-header">
            <span class="summary-dot"></span>
            <span>测距中</span>
          </div>
          <div class="ranging-summary-body">
            <div class="summary-item">
              <span class="summary-label">路段数</span>
              <span class="summary-value">{{ segmentCount }}</span>
            </div>
            <div class="summary-divider"></div>
            <div class="summary-item">
              <span class="summary-label">总距离</span>
              <span class="summary-value highlight">{{ formatDistanceText(totalDistance) }}</span>
            </div>
          </div>
          <div class="ranging-summary-tip">右键结束当前段 · 再次点击开始新段</div>
        </div>
      </transition>

      <!-- 左侧悬浮面板 -->
      <div class="fm-dock" :class="{ 'is-collapsed': isListCollapsed }" :style="{ width: listWidth + 'px' }">
        <div class="dock-panel" :class="{ collapsed: isListCollapsed }">

          <div class="side-filter">
            <div class="f-row">
              <el-select v-model="selectedOrg" placeholder="全部车队" size="small" clearable class="f-org">
                <el-option label="全部车队" value="" />
                <el-option v-for="org in orgOptions" :key="org" :label="org" :value="org" />
              </el-select>
              <el-select v-model="selectedStatus" placeholder="车况" size="small" clearable class="f-status">
                <el-option v-for="s in statusOptions" :key="s" :label="s" :value="s" />
              </el-select>
            </div>
            <div class="f-row">
              <el-input v-model="searchKeyword" placeholder="车牌/昵称/车架" size="small" clearable class="f-kw">
                <template #prefix><el-icon><Search /></el-icon></template>
              </el-input>
              <button class="f-btn primary" @click="handleSearch">搜索</button>
              <button class="f-btn" @click="resetAll">重置</button>
            </div>
            <div class="task-chips">
              <button v-for="c in taskChips" :key="c.key" class="tchip" :class="{ on: taskFilter === c.key }"
                @click="setTaskFilter(c.key)">
                {{ c.label }}<b v-if="c.count">{{ c.count }}</b>
              </button>
            </div>
          </div>

          <div class="sidebar-list-header">
            <span class="hdot"></span>
            <span class="header-title">{{ rootNodeName }}</span>
            <span class="list-count">{{ visibleVehicleCount }}</span>
            <div v-if="waybillLoading" class="bill-loading"></div>
            <div class="collapse-all" :class="{ off: !allExpanded }" :title="allExpanded ? '全部收起' : '全部展开'"
              @click.stop="toggleAllOrgs">
              <el-icon>
                <Fold v-if="allExpanded" />
                <Expand v-else />
              </el-icon>
            </div>
          </div>

          <div class="sidebar-tree" v-loading="treeLoading || loadingVehicles" element-loading-text="加载车辆中…">
            <transition-group v-if="flatRows.length" name="rowfade" tag="div" class="row-list">
              <div v-for="(row, idx) in flatRows" :key="row.key" class="row-item"
                :class="{ 'no-guide': row.depth === 0 }"
                :style="{ '--d': row.depth, animationDelay: Math.min(idx, 14) * 0.02 + 's' }">

                <!-- 机构 -->
                <div v-if="row.type === 'org'" class="trow"
                  :class="['lv' + row.level, { open: row.open, empty: !row.count }]" @click="toggleOrg(row.key)">
                  <span class="caret">▸</span>
                  <span class="lvmark" :class="'l' + row.level"></span>
                  <span class="tname">{{ row.name }}</span>
                  <span class="tcount">{{ row.count }}</span>
                  <span v-if="row.taskCount" class="ttask">{{ row.taskCount }} 单</span>
                  <span v-if="row.count" class="tmix">
                    <i class="m-run" :style="{ width: row.mix.run + '%' }"></i>
                    <i class="m-stop" :style="{ width: row.mix.stop + '%' }"></i>
                    <i class="m-off" :style="{ width: row.mix.off + '%' }"></i>
                  </span>
                </div>

                <!-- 车辆 -->
                <div v-else-if="row.type === 'vehicle'" class="vrow" :class="[
                  { two: !!row.task, 'has-task': !!row.task, active: highlightedPlate === row.vehicle.plate, noloc: !row.vehicle.hasLocation },
                  row.task ? 'tone-' + taskTone(row.task) : 'tone-none',
                ]" @click="focusVehicle(row.vehicle)">
                  <div class="vr1">
                    <span class="vdot" :class="row.vehicle.status"></span>
                    <span class="vplate">{{ row.vehicle.plate }}</span>
                    <span v-if="row.task" class="tbadge" :class="taskTone(row.task)">{{ taskLabel(row.task) }}</span>
                    <span v-else class="tbadge idle">空闲</span>
                    <span v-if="row.task && row.progress && row.progress.ready" class="vpct">
                      {{ Math.round(row.progress.pct) }}%
                    </span>
                    <span v-else class="vstat" :class="row.vehicle.status">{{ row.vehicle.status }}</span>
                  </div>
                  <div v-if="row.task" class="vr2">
                    <span class="vroute">{{ shortPlace(row.task.pickup) }} → {{ shortPlace(row.task.delivery) }}</span>
                    <span class="vbar"><i :style="{ width: (row.progress && row.progress.ready ? row.progress.pct : 0) + '%' }"></i></span>
                    <span class="veta">{{ rowMeta(row) }}</span>
                  </div>
                </div>

                <!-- 还有更多车辆 -->
                <div v-else class="more-row" :style="{ paddingLeft: (row.depth * 12 + 19) + 'px' }"
                  @click="expandVehicles(row.expandKey)">
                  <span class="more-ic">+</span>
                  还有 {{ row.rest }} 台车
                </div>
              </div>
            </transition-group>

            <div v-if="!flatRows.length && !loadingVehicles" class="list-empty">
              <el-icon><Search /></el-icon>
              <span>无匹配车辆</span>
            </div>
          </div>
        </div>

        <!-- 右边缘把手：收起 / 展开整个列表 -->
        <button class="dock-handle" :class="{ collapsed: isListCollapsed }" @click.stop="toggleList"
          :title="isListCollapsed ? '展开列表' : '收起列表'">
          <svg v-if="!isListCollapsed" viewBox="0 0 24 24" width="13" height="13" fill="none"
            stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 5 8 12 15 19" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
            stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 5 16 12 9 19" />
          </svg>
        </button><div class="resizer" v-show="!isListCollapsed" @mousedown="startResize"></div>
      </div>

      <!-- ⭐ 沉浸式物流概览（C1） -->
      <transition name="focusfade">
        <div v-if="focusMode" class="focus-layer">
          <!-- 顶部 -->
          <div class="focus-top">
            <button class="fbtn back" @click="exitFocus">← 返回全图</button>
            <div class="fplate">
              <span class="live"></span>
              <span>{{ focusMode.vehicle.plate }} · {{ taskLabel(focusMode.task) }}</span>
            </div>

            <div class="focus-metrics">
              <div class="fmetric accent">
                <span class="k">预计送达</span>
                <span class="v">{{ focusEta }}</span>
              </div>
              <div class="fmetric">
                <span class="k">剩余里程</span>
                <span class="v">{{ Math.round(focusRemainKm) }}<small>km</small></span>
              </div>
              <div class="fmetric">
                <span class="k">剩余时间</span>
                <span class="v">{{ focusRemainText }}</span>
              </div>
              <button class="fbtn icon" :class="{ on: focusFullscreen }" @click="toggleFocusFullscreen"
                :title="focusFullscreen ? '退出全屏' : '全屏'">
                <svg v-if="!focusFullscreen" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                </svg>
                <svg v-else viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                </svg>
                <span class="fbtn-txt">{{ focusFullscreen ? '退出全屏' : '全屏' }}</span>
              </button>
            </div>
          </div>

          <!-- 右侧节点轴 -->
          <div class="focus-side">
            <div class="fs-title">任务进度</div>
            <div class="fs-timeline">
              <div v-for="(n, i) in focusNodes" :key="n.label" class="fs-node" :class="{ on: n.on, done: n.done }"
                :style="{ animationDelay: 0.15 + i * 0.06 + 's' }">
                <span class="fs-dot"></span>
                <span class="fs-label">{{ n.label }}</span>
                <span class="fs-time">{{ n.time || '' }}</span>
              </div>
            </div>
            <div v-if="focusMode.task.is_recurring" class="fs-tip">
              常驻任务 · 今日第 {{ focusMode.task.trip_seq || 1 }} 次
            </div>
          </div>

          <!-- 底部进度带 -->
          <div class="focus-bottom">
            <div class="fb-row">
              <span><b>{{ focusMode.task.pickup || '--' }}</b> {{ focusStartText }}</span>
              <span>已行 <b>{{ Math.round(focusTraveledKm) }}</b> / 计划 <b>{{ focusPlanKm || '--' }}</b> km</span>
              <span><b>{{ focusMode.task.delivery || '--' }}</b> 预计 {{ focusEta }}</span>
            </div>
            <div class="fb-track">
              <div class="fb-fill" :style="{ width: focusPct + '%' }"></div>
              <div class="fb-knob" :style="{ left: focusPct + '%' }"></div>
            </div>
            <div class="fb-row sub">
              <span>{{ focusSpeedText }}</span>
              <span>进度 {{ Math.round(focusPct) }}% · 剩余 {{ Math.round(focusRemainKm) }} km · 预计 {{ focusEta }} 送达</span>
            </div>
          </div>
        </div>
      </transition>

      <transition name="fade">
        <div v-if="!isMapReady || loadingVehicles" class="map-loading-overlay">
          <div class="loading-card">
            <div class="loading-ring">
              <svg viewBox="0 0 100 100" width="72" height="72">
                <circle cx="50" cy="50" r="42" class="ring-track" />
                <circle cx="50" cy="50" r="42" class="ring-progress" :style="{ strokeDashoffset: ringOffset }" />
              </svg>
              <div class="loading-percent">{{ Math.round(loadPercent) }}%</div>
            </div>
            <p class="loading-text">
              {{ loadingVehicles ? `正在调用定位接口... ${locationProgress}/${locationTotal}` : '正在初始化地图...' }}
            </p>
          </div>
        </div>
      </transition>

      <div v-if="isMapReady && !loadingVehicles && totalCount === 0" class="map-empty">
        <div class="empty-icon-wrap"><el-icon><Van /></el-icon></div>
        <p>暂无车辆档案</p>
        <span>请先前往「基础数据管理 → 车辆档案」创建车辆</span>
      </div>

      <div v-if="isMapReady && !loadingVehicles && totalCount > 0 && locatedCount === 0" class="map-empty">
        <div class="empty-icon-wrap warning"><el-icon><WarningFilled /></el-icon></div>
        <p>所有车辆定位获取失败</p>
        <span>请检查车辆 VIN 码是否正确，或点击右上角「刷新定位」重试</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, onActivated, onDeactivated, nextTick, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Van, Refresh, Search, RefreshRight,
  ArrowLeft, ArrowRight, WarningFilled,
  Brush, Aim, Guide, Position, Fold, Expand,
} from '@element-plus/icons-vue'
import AMapLoader from '@amap/amap-jsapi-loader'
import { supabase } from '@/utils/supabase'
import dayjs from 'dayjs'
import { loadVehicleTrip, computeProgress, traveledMetersSince } from '@/utils/waybillProgress'

const AMAP_KEY = '273f5c474604b71906674aac159b8f45'
const DONGFENG_API_URL = 'https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com/dongfeng-lostlocation'

const CONCURRENCY = 15
const CACHE_TTL = 3 * 60 * 1000

// ============================================================
// 当前登录用户
// ============================================================
const currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('currentUser') || '{}') }
  catch { return {} }
})()

const isAdmin = currentUser.role === 'admin'
const isCustomer = currentUser.role === 'customer'
const isSubAccount = !!currentUser.isSubAccount

const getCacheKey = () => {
  if (isAdmin) return 'fullmap_vehicle_locations_cache_admin'
  if (isSubAccount) return 'fullmap_vehicle_locations_cache_sub_' + (currentUser.account || 'unknown')
  return 'fullmap_vehicle_locations_cache_cust_' + (currentUser.account || 'guest')
}

const masterAccount = currentUser.masterAccount || ''
const masterPhone = currentUser.masterPhone || ''
const masterName = currentUser.masterName || ''
const customerName = currentUser.customerName || ''

const myAccount = masterAccount || currentUser.account || ''
const myPhone = masterPhone || currentUser.phone || ''

const rootNodeName = isAdmin
  ? '全部组织'
  : (customerName || masterName || currentUser.name || '我的组织')

// ============================================================
// 数据
// ============================================================
const orgOptions = ref([])
const selectedOrg = ref('')
const statusOptions = ref(['行驶', '静止', '离线'])
const selectedStatus = ref('')
const searchKeyword = ref('')
const loadingVehicles = ref(false)
const statusFilter = ref('all')

const vehicles = ref([])
const organizations = ref([])
const isMapReady = ref(false)
const locationProgress = ref(0)
const locationTotal = ref(0)
const locatedCount = ref(0)

const currentMapStyle = ref('amap://styles/fresh')
const showSatellite = ref(false)
const showRoadNet = ref(false)
const rangingActive = ref(false)

let satelliteLayer = null
let roadNetLayer = null

const rangingSvgRef = ref(null)
const pointGroups = ref([[]])
let nodeInfos = []
let segmentInfos = []
let distanceLabels = []
let groupTotalLabels = []
let previewLine = null
let previewLabel = null
let svgLines = []

let lastClickTime = 0
let rafId = null
let pendingMouseLng = null
let pendingMouseLat = null

const totalDistance = ref(0)
const segmentCount = ref(0)

const totalCount = computed(() => vehicles.value.length)
const drivingCount = computed(() => vehicles.value.filter(v => v.status === '行驶').length)
const parkedCount = computed(() => vehicles.value.filter(v => v.status === '静止').length)
const offlineCount = computed(() => vehicles.value.filter(v => v.status === '离线').length)

const loadPercent = computed(() => {
  if (locationTotal.value === 0) return 0
  return Math.min(100, (locationProgress.value / locationTotal.value) * 100)
})

const RING_LENGTH = 263.89
const ringOffset = computed(() => RING_LENGTH * (1 - loadPercent.value / 100))

const isDarkTheme = computed(() => {
  if (showSatellite.value) return true
  const s = currentMapStyle.value
  return s.includes('dark') || s.includes('blue')
})

const themeColors = computed(() => {
  if (isDarkTheme.value) {
    return {
      driving: { top: '#4ADE80', bottom: '#22C55E', glow: 'rgba(74,222,128,0.65)' },
      parked: { top: '#FCD34D', bottom: '#F59E0B', glow: 'rgba(252,211,77,0.6)' },
      offline: { top: '#CBD5E1', bottom: '#94A3B8', glow: 'rgba(203,213,225,0.45)' },
    }
  }
  return {
    driving: { top: '#34D399', bottom: '#059669', glow: 'rgba(52,211,153,0.5)' },
    parked: { top: '#FBBF24', bottom: '#D97706', glow: 'rgba(251,191,36,0.45)' },
    offline: { top: '#94A3B8', bottom: '#475569', glow: 'rgba(148,163,184,0.35)' },
  }
})

const parseTimeToMs = (t) => {
  if (t === undefined || t === null || t === '') return 0
  if (typeof t === 'number') return t
  if (/^\d+$/.test(String(t))) return Number(t)
  const ms = new Date(t).getTime()
  return isNaN(ms) ? 0 : ms
}

const isAccOn = (accStatus) => {
  if (accStatus === undefined || accStatus === null || accStatus === '') return false
  const s = String(accStatus).trim()
  if (s.includes('关')) return false
  if (s.includes('开')) return true
  return false
}

const readCache = () => {
  try {
    const raw = sessionStorage.getItem(getCacheKey())
    if (!raw) return null
    const obj = JSON.parse(raw)
    if (!obj || !obj.ts) return null
    if (Date.now() - obj.ts > CACHE_TTL) {
      sessionStorage.removeItem(getCacheKey())
      return null
    }
    return obj.data
  } catch (e) { return null }
}

const writeCache = (data) => {
  try { sessionStorage.setItem(getCacheKey(), JSON.stringify({ ts: Date.now(), data })) } catch (e) { }
}

const clearCache = () => {
  try { sessionStorage.removeItem(getCacheKey()) } catch (e) { }
}

const fetchDongfengLocation = async (vin) => {
  if (!vin || vin.length < 8) return { success: false, reason: 'VIN 长度不足' }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8000)

  try {
    const response = await fetch(DONGFENG_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vin }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const result = await response.json()
    if (result.code !== 1 || !Array.isArray(result.data) || result.data.length === 0) {
      return { success: false, reason: result.msg || '近 3 天无数据' }
    }
    const sorted = [...result.data].sort((a, b) => parseTimeToMs(b.time) - parseTimeToMs(a.time))
    const latest = sorted[0]
    const lng = parseFloat(latest.lng)
    const lat = parseFloat(latest.lat)
    if (!lng || !lat || isNaN(lng) || isNaN(lat)) {
      return { success: false, reason: '经纬度无效' }
    }
    const speed = parseFloat(latest.speed) || 0
    const accOn = isAccOn(latest.accStatus)
    let status = '离线'
    if (accOn) status = speed > 0 ? '行驶' : '静止'
    const timeMs = parseTimeToMs(latest.time)
    const reportTime = timeMs > 0 ? dayjs(timeMs).format('YYYY-MM-DD HH:mm:ss') : '--'
    const locationText = latest.address ||
      (status === '行驶' ? '行驶中' : status === '静止' ? '停车' : '离线')
    const dayOffset = typeof result.dayOffset === 'number' ? result.dayOffset : 0
    return {
      success: true, lng, lat,
      online: status !== '离线', status,
      accStatus: String(latest.accStatus || '--'),
      reportTime, locationText,
      direction: parseFloat(latest.direction) || 0,
      speed, altitude: parseFloat(latest.altitude) || 0,
      dayOffset,
    }
  } catch (err) {
    clearTimeout(timeoutId)
    const reason = err.name === 'AbortError' ? '请求超时（8s）' : err.message
    console.warn(`获取车辆 ${vin} 定位失败：`, reason)
    return { success: false, reason }
  }
}

// ============================================================
// ⭐⭐ 客户 ID & 子账号机构信息
// ============================================================
const myCustomerId = ref(currentUser.customerId || null)
const myOrgName = ref(isSubAccount ? String(currentUser.orgName || '').trim() || null : null)
const myOrgLevel = ref(isSubAccount ? (Number(currentUser.orgLevel) || 1) : null)

const loadMyCustomerId = async () => {
  if (!isCustomer) return
  if (myCustomerId.value) return
  if (!myPhone) return
  try {
    const { data } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', myPhone)
      .maybeSingle()
    if (data) myCustomerId.value = data.id
  } catch (e) {
    console.warn('查询客户信息失败:', e)
  }
}

// ⭐ 兜底：currentUser 缺字段时反查
const loadMyOrgInfo = async () => {
  if (!isCustomer || !isSubAccount) return
  if (myOrgName.value && myOrgLevel.value) return
  if (!currentUser.orgId) return
  try {
    const { data } = await supabase
      .from('organizations')
      .select('name, level')
      .eq('id', currentUser.orgId)
      .maybeSingle()
    if (data) {
      if (data.name) myOrgName.value = String(data.name).trim()
      myOrgLevel.value = Number(data.level) || 1
    }
  } catch (e) {
    console.warn('[FullMap] 反查机构失败:', e)
  }
}

// ⭐ 一级机构子账号 → 等同主账号
const isRootOrgSubAccount = computed(() => {
  return isSubAccount && Number(myOrgLevel.value) === 1
})

// ⭐ 二级及以下子账号 → 需要按 org 隔离
const needOrgFilter = computed(() => {
  return isCustomer && isSubAccount && Number(myOrgLevel.value) >= 2
})

// ============================================================
// ⭐ 运单任务联动（车辆 × 任务）
// ============================================================
const ACTIVE_STATUS = ['待接单', '待重新指派', '待装车', '装车中', '装车完成', '已发车', '已到达']
const STATUS_WEIGHT = {
  '待接单': 1, '待重新指派': 1, '待装车': 2, '装车中': 2,
  '装车完成': 3, '已发车': 4, '已到达': 5,
}

const waybillLoading = ref(false)
const taskByPlate = ref({})
const progressByPlate = ref({})
const taskFilter = ref('all')

const normStatus = (s) => {
  if (s === '装车中') return '待装车'
  if (s === '待重新指派') return '待接单'
  return s || '--'
}

const taskLabel = (t) => normStatus(t && t.status)
const taskTone = (t) => {
  const s = normStatus(t && t.status)
  if (s === '已发车') return 'run'
  if (s === '已到达') return 'done'
  if (s === '待装车' || s === '装车完成') return 'load'
  return 'wait'
}

const parseAssignments = (rec) => {
  let arr = rec && rec.assignments
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr) } catch { arr = [] }
  }
  return Array.isArray(arr) ? arr : []
}

/** 运单 → 车牌集合（多指派时 waybills.vehicle 会退化成「多种 / N辆」，必须走 assignments） */
const platesOfWaybill = (rec) => {
  const set = new Set()
  parseAssignments(rec).forEach(a => {
    const method = a && (a.method || a.assignMethod)
    if (method !== 'vehicle') return
    ;(a.items || []).forEach(i => {
      const t = String((i && i.target) || '').trim()
      if (t) set.add(t)
    })
  })
  const v = String((rec && rec.vehicle) || '').trim()
  if (!set.size && v && v !== '--' && v !== '多种' && !/辆$/.test(v) && !/人$/.test(v)) set.add(v)
  return [...set]
}

const loadWaybills = async () => {
  waybillLoading.value = true
  try {
    let q = supabase.from('waybills')
      .select('id,waybill_no,status,pickup,delivery,pickup_time,plan_time,vehicle,driver,assignments,' +
        'accept_time,depart_time,arrive_time,finish_time,create_time,plan_distance,plan_duration,' +
        'pickup_lng,pickup_lat,delivery_lng,delivery_lat,is_recurring,recurring_group_no,trip_seq,transport_mode,owner_account')
      .in('status', ACTIVE_STATUS)
      .order('create_time', { ascending: false })
      .limit(400)
    if (isCustomer && myAccount) q = q.eq('owner_account', myAccount)
    const { data, error } = await q
    if (error) throw error

    const map = {}
    ;(data || []).forEach(rec => {
      platesOfWaybill(rec).forEach(plate => {
        const cur = map[plate]
        if (!cur || (STATUS_WEIGHT[rec.status] || 0) > (STATUS_WEIGHT[cur.status] || 0)) map[plate] = rec
      })
    })
    taskByPlate.value = map
  } catch (e) {
    console.warn('[FullMap] 运单加载失败：', e)
    taskByPlate.value = {}
  } finally {
    waybillLoading.value = false
  }
}

const progressPending = new Set()
const ensureProgress = async (plate, task, force = false) => {
  if (!plate || !task) return null
  const cached = progressByPlate.value[plate]
  if (!force && cached && Date.now() - cached.ts < 25000) return cached
  if (progressPending.has(plate)) return cached || null

  progressPending.add(plate)
  try {
    const rec = { ...task, vehicle: plate }
    const res = await loadVehicleTrip(rec, {
      since: task.depart_time || task.accept_time || task.create_time,
    })
    // ⭐ 轨迹拉不到（超时 / 无数据）时保留上一次的好数据，不要算成「已行 0」
    if (res.error && !(res.points && res.points.length)) return cached || null
    const sinceIso = task.depart_time || task.accept_time
    const traveled = res.points && res.points.length && sinceIso
      ? traveledMetersSince(res.points, sinceIso)
      : 0
    const p = computeProgress({
      traveledMeters: traveled,
      planDistance: task.plan_distance,
      planDuration: task.plan_duration,
      lastReportAt: res.current && res.current.reportAt,
    })
    const value = {
      ...p,
      pct: p.ready ? Math.round(p.doneRatio * 100) : 0,
      ts: Date.now(),
      current: res.current || null,
      error: res.error || '',
    }
    progressByPlate.value = { ...progressByPlate.value, [plate]: value }
    return value
  } catch (e) {
    console.warn('[FullMap] 进度计算失败：', plate, e)
    return null
  } finally {
    progressPending.delete(plate)
  }
}

/** 后台补进度：只给「已发车 / 已到达」的车算，并发 2，最多 8 台 */
const prefetchProgress = async () => {
  const targets = Object.entries(taskByPlate.value)
    .filter(([plate, t]) => ['已发车', '已到达'].includes(t.status) && vehicles.value.some(v => v.plate === plate))
    .slice(0, 8)
  for (let i = 0; i < targets.length; i += 2) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(targets.slice(i, i + 2).map(([p, t]) => ensureProgress(p, t)))
  }
}

/** 地点名压缩：去掉括号备注、超长截断 */
const shortPlace = (name) => {
  const s = String(name || '').trim()
  if (!s || s === '未指定') return '未指定'
  const cut = s.replace(/[（(].*?[)）]/g, '')
  return cut.length > 6 ? cut.slice(0, 6) + '…' : cut
}

const rowMeta = (row) => {
  const p = row.progress
  if (p && p.ready) {
    if (p.stale) return '定位停更'
    return p.remainKm < 1 ? '即将到达' : `剩 ${Math.round(p.remainKm)}km`
  }
  const t = row.task
  if (t && t.plan_time) return dayjs(t.plan_time).format('MM-DD HH:mm')
  return '待发车'
}

const taskOf = (v) => taskByPlate.value[v.plate] || null

/** 业务过滤（任务 chip 之前的那一层） */
const preTaskVehicles = computed(() => {
  return vehicles.value.filter(v => {
    if (statusFilter.value !== 'all' && v.status !== statusFilter.value) return false
    if (selectedOrg.value && (v.org || v.customer_name || '') !== selectedOrg.value) return false
    if (selectedStatus.value && v.status !== selectedStatus.value) return false
    if (searchKeyword.value) {
      const kw = searchKeyword.value.trim().toLowerCase()
      const hay = `${v.plate || ''} ${v.nickname || ''} ${v.vin || ''}`.toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })
})

const taskChips = computed(() => {
  const list = preTaskVehicles.value
  const withTask = list.filter(v => taskOf(v))
  const transit = withTask.filter(v => ['已发车', '已到达'].includes(taskOf(v).status))
  const loadingT = withTask.filter(v => ['待接单', '待装车', '装车完成'].includes(taskOf(v).status))
  return [
    { key: 'all', label: '全部', count: list.length },
    { key: 'task', label: '有任务', count: withTask.length },
    { key: 'transit', label: '在途', count: transit.length },
    { key: 'loading', label: '待装', count: loadingT.length },
    { key: 'idle', label: '空闲', count: list.length - withTask.length },
  ]
})

const setTaskFilter = (key) => {
  taskFilter.value = taskFilter.value === key ? 'all' : key
}

// ============================================================
// 加载车辆
// ============================================================
const loadVehicles = async (forceRefresh = false) => {
  if (!forceRefresh) {
    const cached = readCache()
    if (cached && Array.isArray(cached.vehicles)) {
      vehicles.value = cached.vehicles
      orgOptions.value = cached.orgOptions || []
      locatedCount.value = cached.locatedCount || 0
      locationTotal.value = cached.vehicles.length
      locationProgress.value = cached.vehicles.length
      await loadOrganizations()
      await syncVehicleOrgFields()
      return
    }
  }
  loadingVehicles.value = true
  locationProgress.value = 0
  locationTotal.value = 0
  locatedCount.value = 0
  try {
    // ⭐ 客户必须有 customerId
    if (isCustomer && !myCustomerId.value) {
      console.warn('[FullMap] 客户账号未关联 customers，返回空')
      vehicles.value = []
      orgOptions.value = []
      return
    }
    // ⭐ 二级机构子账号必须有 orgName
    if (needOrgFilter.value && !myOrgName.value) {
      console.warn('[FullMap] 二级机构子账号 orgName 缺失，返回空')
      vehicles.value = []
      orgOptions.value = []
      return
    }

    let query = supabase.from('vehicles').select('*').order('updated_at', { ascending: false })

    if (isCustomer) {
      query = query.eq('customer_id', myCustomerId.value)

      // ⭐⭐⭐ 子账号隔离
      if (isRootOrgSubAccount.value) {
        console.log('[FullMap] 子账号挂一级机构 → 等同主账号')
        // 不加 org 过滤
      } else if (needOrgFilter.value) {
        console.log('[FullMap] 子账号挂 level=' + myOrgLevel.value + ' 机构 → 隔离 org =', myOrgName.value)
        query = query.eq('org', myOrgName.value)
      }
    }

    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) {
      vehicles.value = []
      orgOptions.value = []
      if (isCustomer) {
        ElMessage.warning('您的账户下暂无车辆，请联系管理员分配')
      } else {
        ElMessage.warning('车辆档案为空，请先去「车辆档案」页面创建车辆')
      }
      await loadOrganizations()
      return
    }
    locationTotal.value = data.length
    const enriched = new Array(data.length)
    let index = 0
    const worker = async () => {
      while (index < data.length) {
        const i = index++
        const item = data[i]
        const loc = await fetchDongfengLocation(item.vin)
        if (loc.success) {
          locatedCount.value++
          enriched[i] = {
            ...item, status: loc.status, accStatus: loc.accStatus,
            reportTime: loc.reportTime, lng: loc.lng, lat: loc.lat,
            hasLocation: true, location: loc.locationText,
            direction: loc.direction, speed: loc.speed,
            altitude: loc.altitude, dayOffset: loc.dayOffset,
          }
        } else {
          enriched[i] = {
            ...item, status: '离线', accStatus: '--', reportTime: '--',
            lng: null, lat: null, hasLocation: false,
            location: '定位获取失败', direction: 0, speed: 0,
            altitude: 0, dayOffset: -1,
          }
        }
        locationProgress.value++
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, data.length) }, () => worker()))
    vehicles.value = enriched.filter(Boolean)
    const orgSet = new Set()
    vehicles.value.forEach(v => {
      const org = v.org || v.customer_name || v.nickname
      if (org) orgSet.add(org)
    })
    orgOptions.value = Array.from(orgSet)
    writeCache({
      vehicles: vehicles.value,
      orgOptions: orgOptions.value,
      locatedCount: locatedCount.value,
    })
    await loadOrganizations()
  } catch (e) {
    console.error('加载车辆失败：', e)
    ElMessage.error('加载车辆失败：' + e.message)
  } finally {
    loadingVehicles.value = false
  }
}

const syncVehicleOrgFields = async () => {
  if (!vehicles.value.length) return
  try {
    const plates = vehicles.value.map(v => v.plate).filter(Boolean)
    if (!plates.length) return

    let q = supabase.from('vehicles').select('plate, org, customer_id, driver, nickname').in('plate', plates)
    if (isCustomer && myCustomerId.value) {
      q = q.eq('customer_id', myCustomerId.value)
      if (needOrgFilter.value && myOrgName.value) {
        q = q.eq('org', myOrgName.value)
      }
    }
    const { data, error } = await q
    if (error || !data) return

    const freshMap = {}
    data.forEach(item => { freshMap[item.plate] = item })

    let changed = false
    const updated = vehicles.value.map(v => {
      const fresh = freshMap[v.plate]
      if (fresh && (v.org !== fresh.org || v.driver !== fresh.driver || v.nickname !== fresh.nickname)) {
        changed = true
        return { ...v, org: fresh.org, driver: fresh.driver, nickname: fresh.nickname }
      }
      return v
    })

    if (changed) {
      vehicles.value = updated
      const orgSet = new Set()
      vehicles.value.forEach(v => {
        const org = v.org || v.customer_name || v.nickname
        if (org) orgSet.add(org)
      })
      orgOptions.value = Array.from(orgSet)
      writeCache({ vehicles: vehicles.value, orgOptions: orgOptions.value, locatedCount: locatedCount.value })
    }
  } catch (e) {
    console.error('同步车辆 org 失败:', e)
  }
}

// ⭐ 加载组织（按 level 排序）
const loadOrganizations = async () => {
  try {
    let q = supabase
      .from('organizations')
      .select('*')
      .order('level', { ascending: true })
      .order('id', { ascending: true })
    if (isCustomer) q = q.eq('owner_account', myAccount)
    const { data, error } = await q
    if (error) throw error
    organizations.value = data || []
  } catch (e) {
    console.error('加载组织失败:', e)
  }
}

const refreshLocations = async (forceRefresh = false) => {
  if (forceRefresh) clearCache()
  await loadVehicles(forceRefresh)
  if (isMapReady.value) {
    addMarkers()
    updateMarkersVisibility()
  }
}

let map = null
let markers = []
let markerMap = new Map()
let infoWindow = null
let AMap = null

const highlightedPlate = ref(null)

const initMap = async () => {
  try {
    AMap = await AMapLoader.load({
      key: AMAP_KEY,
      version: '2.0',
      plugins: ['AMap.Geocoder', 'AMap.TileLayer.Satellite', 'AMap.TileLayer.RoadNet', 'AMap.Driving'],
    })
    map = new AMap.Map('map-container', {
      zoom: 5, center: [107, 33],
      mapStyle: currentMapStyle.value,
      viewMode: '2D',
      features: ['bg', 'road', 'building', 'point'],
    })
    infoWindow = new AMap.InfoWindow({
      isCustom: true,
      offset: new AMap.Pixel(0, -54),
      autoMove: true,
      closeWhenClickMap: true,
    })
    map.on('click', onMapClick)
    map.on('mapmove', updateAllSvgLines)
    map.on('mapmove', onFocusMapMove)
    map.on('zoomchange', updateAllSvgLines)
    map.on('zoomchange', onFocusMapMove)
    addMarkers()
    isMapReady.value = true
    updateMarkersVisibility()
  } catch (err) {
    ElMessage.error('地图加载失败：' + err.message)
    console.error(err)
  }
}

const changeMapStyle = (style) => {
  if (!map) return
  map.setMapStyle(style)
  nextTick(() => { addMarkers(); updateMarkersVisibility() })
}

const toggleSatellite = () => {
  if (!map || !AMap) return
  if (!satelliteLayer) satelliteLayer = new AMap.TileLayer.Satellite()
  if (showSatellite.value) {
    map.remove(satelliteLayer)
    showSatellite.value = false
  } else {
    map.add(satelliteLayer)
    showSatellite.value = true
  }
  nextTick(() => { addMarkers(); updateMarkersVisibility() })
}

const toggleRoadNet = () => {
  if (!map || !AMap) return
  if (!roadNetLayer) roadNetLayer = new AMap.TileLayer.RoadNet()
  if (showRoadNet.value) {
    map.remove(roadNetLayer)
    showRoadNet.value = false
  } else {
    map.add(roadNetLayer)
    showRoadNet.value = true
  }
}

const calcDistance = (p1, p2) => {
  try {
    const a = new AMap.LngLat(p1.lng, p1.lat)
    const b = new AMap.LngLat(p2.lng, p2.lat)
    return a.distance(b)
  } catch (e) { return 0 }
}

const formatDistance = (m) => {
  if (m < 1000) return m.toFixed(1) + ' m'
  return (m / 1000).toFixed(2) + ' km'
}

const formatDistanceText = (m) => formatDistance(m)

const getNodeMeta = (group, pointIdx) => {
  const total = group.length
  if (total === 1) return { type: 'start', badge: '起', label: '起点' }
  if (pointIdx === 0) return { type: 'start', badge: '起', label: '起点' }
  if (pointIdx === total - 1) return { type: 'end', badge: '终', label: '终点' }
  return { type: 'mid', badge: String(pointIdx), label: `途径点${pointIdx}` }
}

const createNodeMarker = (point, groupIdx, pointIdx) => {
  const group = pointGroups.value[groupIdx]
  const meta = getNodeMeta(group, pointIdx)
  const container = document.createElement('div')
  container.className = `ranging-point ${meta.type}`
  container.innerHTML = `<div class="ranging-point-icon">${meta.badge}</div>`
  const marker = new AMap.Marker({
    position: [point.lng, point.lat],
    content: container,
    offset: new AMap.Pixel(-14, -14),
    zIndex: 200,
    map: map,
  })
  return { marker, container, groupIdx, pointIdx }
}

const updateNodeMarker = (info) => {
  const group = pointGroups.value[info.groupIdx]
  if (!group) return
  const meta = getNodeMeta(group, info.pointIdx)
  const newClass = `ranging-point ${meta.type}`
  if (info.container.className !== newClass) info.container.className = newClass
  const iconEl = info.container.querySelector('.ranging-point-icon')
  if (iconEl && iconEl.textContent !== meta.badge) iconEl.textContent = meta.badge
}

const createBaseLine = (p1, p2) => {
  const line = new AMap.Polyline({
    path: [[p1.lng, p1.lat], [p2.lng, p2.lat]],
    strokeColor: '#3B82F6',
    strokeWeight: 5,
    strokeOpacity: 0,
    lineJoin: 'round',
    lineCap: 'round',
    zIndex: 150,
    map: map,
  })
  let opacity = 0
  const step = () => {
    opacity += 0.08
    if (opacity >= 0.95) opacity = 0.95
    try { line.setOptions({ strokeOpacity: opacity }) } catch (e) { }
    if (opacity < 0.95) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
  return line
}

const getPixelCoords = (lngLat) => {
  if (!map) return { x: 0, y: 0 }
  try {
    const pixel = map.lngLatToContainer(new AMap.LngLat(lngLat.lng, lngLat.lat))
    return { x: pixel.x, y: pixel.y }
  } catch (e) {
    return { x: 0, y: 0 }
  }
}

const createSvgFlowLine = (p1, p2) => {
  if (!rangingSvgRef.value) return null
  const svg = rangingSvgRef.value
  const baseEl = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  baseEl.setAttribute('class', 'ranging-svg-base')
  const flowEl = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  flowEl.setAttribute('class', 'ranging-svg-flow')
  svg.appendChild(baseEl)
  svg.appendChild(flowEl)
  const record = { from: p1, to: p2, baseEl, flowEl }
  svgLines.push(record)
  updateSvgLine(record)
  return record
}

const updateSvgLine = (record) => {
  const p1 = getPixelCoords(record.from)
  const p2 = getPixelCoords(record.to)
  record.baseEl.setAttribute('x1', p1.x)
  record.baseEl.setAttribute('y1', p1.y)
  record.baseEl.setAttribute('x2', p2.x)
  record.baseEl.setAttribute('y2', p2.y)
  record.flowEl.setAttribute('x1', p1.x)
  record.flowEl.setAttribute('y1', p1.y)
  record.flowEl.setAttribute('x2', p2.x)
  record.flowEl.setAttribute('y2', p2.y)
}

const updateAllSvgLines = () => {
  svgLines.forEach(updateSvgLine)
}

const clearSvgLines = () => {
  if (!rangingSvgRef.value) {
    svgLines = []
    return
  }
  svgLines.forEach(r => {
    try { r.baseEl.remove() } catch (e) { }
    try { r.flowEl.remove() } catch (e) { }
  })
  svgLines = []
}

const createDistanceLabel = (p1, p2, distance) => {
  const midLng = (p1.lng + p2.lng) / 2
  const midLat = (p1.lat + p2.lat) / 2
  const container = document.createElement('div')
  container.className = 'ranging-distance-label'
  container.textContent = formatDistance(distance)
  const marker = new AMap.Marker({
    position: [midLng, midLat],
    content: container,
    offset: new AMap.Pixel(0, -12),
    anchor: 'center',
    zIndex: 250,
    map: map,
  })
  return marker
}

const showGroupTotalLabel = (point, total, groupIdx) => {
  const existing = groupTotalLabels.find(l => l.groupIdx === groupIdx)
  if (existing) {
    try { map.remove(existing.marker) } catch (e) { }
    groupTotalLabels.splice(groupTotalLabels.indexOf(existing), 1)
  }
  const container = document.createElement('div')
  container.className = 'ranging-group-total'
  container.innerHTML = `
    <span class="group-total-icon">∑</span>
    <span class="group-total-text">${formatDistance(total)}</span>
  `
  const marker = new AMap.Marker({
    position: [point.lng, point.lat],
    content: container,
    offset: new AMap.Pixel(0, 26),
    anchor: 'center',
    zIndex: 260,
    map: map,
  })
  groupTotalLabels.push({ groupIdx, marker })
}

const clearGroupTotalLabels = () => {
  groupTotalLabels.forEach(l => {
    try { map.remove(l.marker) } catch (e) { }
  })
  groupTotalLabels = []
}

const addRangingPoint = (lng, lat) => {
  const point = { lng, lat }
  const currentGroupIdx = pointGroups.value.length - 1
  const currentGroup = pointGroups.value[currentGroupIdx]
  if (currentGroup.length > 0) {
    const prev = currentGroup[currentGroup.length - 1]
    const distance = calcDistance(prev, point)
    const line = createBaseLine(prev, point)
    const svgLine = createSvgFlowLine(prev, point)
    const label = createDistanceLabel(prev, point, distance)
    segmentInfos.push({ from: prev, to: point, distance, line, svgLine })
    distanceLabels.push(label)
  }
  currentGroup.push(point)
  const info = createNodeMarker(point, currentGroupIdx, currentGroup.length - 1)
  nodeInfos.push(info)
  const groupInfos = nodeInfos.filter(i => i.groupIdx === currentGroupIdx)
  groupInfos.forEach(i => updateNodeMarker(i))
  recalcTotals()
  hidePreview()
  updateAllSvgLines()
}

const recalcTotals = () => {
  let total = 0
  segmentInfos.forEach(s => { total += s.distance })
  totalDistance.value = total
  segmentCount.value = segmentInfos.length
}

const hidePreview = () => {
  if (previewLine) {
    try { previewLine.setMap(null) } catch (e) { }
  }
  if (previewLabel) {
    try { previewLabel.setMap(null) } catch (e) { }
  }
}

const destroyPreview = () => {
  if (previewLine) {
    try { map.remove(previewLine) } catch (e) { }
    previewLine = null
  }
  if (previewLabel) {
    try { map.remove(previewLabel) } catch (e) { }
    previewLabel = null
  }
}

const updatePreview = (mouseLng, mouseLat) => {
  const currentGroup = pointGroups.value[pointGroups.value.length - 1]
  if (currentGroup.length === 0) return
  const lastPoint = currentGroup[currentGroup.length - 1]
  const path = [[lastPoint.lng, lastPoint.lat], [mouseLng, mouseLat]]

  if (!previewLine) {
    previewLine = new AMap.Polyline({
      path,
      strokeColor: '#3B82F6',
      strokeWeight: 3,
      strokeStyle: 'dashed',
      strokeDasharray: [10, 8],
      strokeOpacity: 0.7,
      lineJoin: 'round',
      lineCap: 'round',
      zIndex: 140,
      map: map,
    })
  } else {
    previewLine.setPath(path)
    try { previewLine.setMap(map) } catch (e) { }
  }

  const dist = calcDistance(lastPoint, { lng: mouseLng, lat: mouseLat })
  const previewText = '+' + formatDistance(dist)
  if (!previewLabel) {
    const container = document.createElement('div')
    container.className = 'ranging-preview-label'
    container.textContent = previewText
    previewLabel = new AMap.Marker({
      position: [mouseLng, mouseLat],
      content: container,
      offset: new AMap.Pixel(14, -26),
      zIndex: 240,
      map: map,
    })
  } else {
    previewLabel.setPosition([mouseLng, mouseLat])
    const c = previewLabel.getContent()
    if (c) c.textContent = previewText
    try { previewLabel.setMap(map) } catch (e) { }
  }
}

const clearAllRanging = () => {
  if (!map) return
  nodeInfos.forEach(i => { try { map.remove(i.marker) } catch (e) { } })
  segmentInfos.forEach(s => { try { map.remove(s.line) } catch (e) { } })
  distanceLabels.forEach(l => { try { map.remove(l) } catch (e) { } })
  clearGroupTotalLabels()
  destroyPreview()
  clearSvgLines()
  nodeInfos = []
  segmentInfos = []
  distanceLabels = []
  pointGroups.value = [[]]
  totalDistance.value = 0
  segmentCount.value = 0
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  pendingMouseLng = null
  pendingMouseLat = null
  lastClickTime = 0
}

const onRangingClick = (e) => {
  if (!rangingActive.value) return
  const now = Date.now()
  if (now - lastClickTime < 60) return
  lastClickTime = now
  addRangingPoint(e.lnglat.getLng(), e.lnglat.getLat())
}

const onRangingRightClick = (e) => {
  if (!rangingActive.value) return
  if (e && e.originalEvent && e.originalEvent.preventDefault) {
    e.originalEvent.preventDefault()
  }
  const currentGroupIdx = pointGroups.value.length - 1
  const currentGroup = pointGroups.value[currentGroupIdx]
  if (currentGroup.length >= 2) {
    let groupTotal = 0
    for (let i = 0; i < currentGroup.length - 1; i++) {
      groupTotal += calcDistance(currentGroup[i], currentGroup[i + 1])
    }
    const lastPoint = currentGroup[currentGroup.length - 1]
    showGroupTotalLabel(lastPoint, groupTotal, currentGroupIdx)
    pointGroups.value.push([])
  }
  hidePreview()
}

const onRangingMouseMove = (e) => {
  if (!rangingActive.value) return
  const currentGroup = pointGroups.value[pointGroups.value.length - 1]
  if (currentGroup.length === 0) return

  pendingMouseLng = e.lnglat.getLng()
  pendingMouseLat = e.lnglat.getLat()

  if (rafId) return
  rafId = requestAnimationFrame(() => {
    rafId = null
    if (pendingMouseLng !== null && rangingActive.value) {
      updatePreview(pendingMouseLng, pendingMouseLat)
      pendingMouseLng = null
      pendingMouseLat = null
    }
  })
}

const onRangingMouseOut = () => {
  hidePreview()
}

const startRanging = () => {
  if (!map || !AMap) return
  clearAllRanging()
  rangingActive.value = true
  map.on('click', onRangingClick)
  map.on('rightclick', onRangingRightClick)
  map.on('mousemove', onRangingMouseMove)
  map.on('mouseout', onRangingMouseOut)
}

const stopRanging = () => {
  if (!map) return
  rangingActive.value = false
  map.off('click', onRangingClick)
  map.off('rightclick', onRangingRightClick)
  map.off('mousemove', onRangingMouseMove)
  map.off('mouseout', onRangingMouseOut)
  clearAllRanging()
}

const toggleRanging = () => {
  if (rangingActive.value) {
    stopRanging()
  } else {
    startRanging()
  }
}

const getArrowScheme = (status) => {
  const colors = themeColors.value
  if (status === '行驶') return { id: 'driving_' + (isDarkTheme.value ? 'd' : 'l'), ...colors.driving }
  if (status === '静止') return { id: 'parked_' + (isDarkTheme.value ? 'd' : 'l'), ...colors.parked }
  return { id: 'offline_' + (isDarkTheme.value ? 'd' : 'l'), ...colors.offline }
}

const getArrowSVG = (status) => {
  const s = getArrowScheme(status)
  return `
    <svg width="38" height="38" viewBox="0 0 38 38" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="arrowGrad_${s.id}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${s.top}"/>
          <stop offset="100%" stop-color="${s.bottom}"/>
        </linearGradient>
        <filter id="arrowShadow_${s.id}" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="${s.glow}"/>
        </filter>
      </defs>
      <g filter="url(#arrowShadow_${s.id})">
        <path d="M19 4 L31.5 32.5 L19 26.5 L6.5 32.5 Z"
              fill="url(#arrowGrad_${s.id})" stroke-linejoin="round"/>
        <path d="M19 10 L25 28 L19 23.5 Z" fill="rgba(255,255,255,0.28)"/>
      </g>
    </svg>
  `
}

const addMarkers = () => {
  if (!map || !AMap) return
  if (markers.length) {
    map.remove(markers)
    markers = []
    markerMap.clear()
  }
  const locatedVehicles = vehicles.value.filter(v => v.hasLocation)
  if (locatedVehicles.length === 0) return
  locatedVehicles.forEach((v, idx) => {
    const container = document.createElement('div')
    container.className = 'custom-marker status-' + v.status
    container.style.animationDelay = (idx * 0.02) + 's'
    const iconWrap = document.createElement('div')
    iconWrap.className = 'arrow-icon-wrap ' + v.status
    iconWrap.style.transform = `rotate(${v.direction || 0}deg)`
    iconWrap.innerHTML = getArrowSVG(v.status)
    if (v.status === '行驶') {
      const ring = document.createElement('div')
      ring.className = 'arrow-pulse-ring driving'
      ring.style.borderColor = themeColors.value.driving.glow
      iconWrap.appendChild(ring)
    }
    const plateSpan = document.createElement('span')
    plateSpan.className = 'plate'
    plateSpan.textContent = v.plate
    container.appendChild(iconWrap)
    container.appendChild(plateSpan)

    // ⭐ 有任务的车，标记下面挂一枚任务徽标
    const vTask = taskByPlate.value[v.plate]
    if (vTask) {
      const badge = document.createElement('span')
      badge.className = 'marker-task ' + taskTone(vTask)
      badge.textContent = taskLabel(vTask)
      container.appendChild(badge)
    }
    container.classList.toggle('has-task', !!vTask)

    const marker = new AMap.Marker({
      position: [v.lng, v.lat],
      content: container,
      offset: new AMap.Pixel(-19, -19),
      zIndex: vTask ? 6 : 1,
      extData: { plate: v.plate },
    })
    marker.on('click', () => {
      if (rangingActive.value) return
      if (highlightedPlate.value === v.plate && infoWindow.getIsOpen()) {
        closePopup()
      } else {
        openPopup(v, marker)
      }
    })
    marker.on('mouseover', () => {
      if (rangingActive.value) return
      const c = marker.getContent()
      if (c) c.classList.add('hovered')
    })
    marker.on('mouseout', () => {
      const c = marker.getContent()
      if (c) c.classList.remove('hovered')
    })
    markers.push(marker)
    markerMap.set(v.plate, marker)
  })
  map.add(markers)
  if (markers.length) map.setFitView(markers, false, [120, 80, 80, 80])
}

const resetMarkerStyle = (marker) => {
  const c = marker.getContent()
  if (c) c.classList.remove('hovered')
}

const highlightMarker = (marker) => {
  const c = marker.getContent()
  if (c) c.classList.add('hovered')
}

const fmtEta = (p) => {
  if (!p || !p.ready) return '--:--'
  if (p.stale) return '定位停更'
  return dayjs(p.etaMs).format('HH:mm')
}

const openPopup = (vehicle, marker) => {
  highlightedPlate.value = vehicle.plate
  highlightMarker(marker)
  let statusClass = 'offline'
  if (vehicle.status === '行驶') statusClass = 'driving'
  else if (vehicle.status === '静止') statusClass = 'parked'
  let dayOffsetText = ''
  if (vehicle.dayOffset === 1) dayOffsetText = '📅 昨天的数据'
  else if (vehicle.dayOffset === 2) dayOffsetText = '📅 前天的数据'

  const task = taskByPlate.value[vehicle.plate] || null
  const p = progressByPlate.value[vehicle.plate] || null
  const pct = p && p.ready ? Math.round(p.doneRatio * 100) : 0
  const tone = task ? taskTone(task) : ''

  /* ⭐ 有任务才渲染任务区 + 主按钮；没任务保持原样 */
  const taskBlock = task ? `
      <div class="amap-popup-task">
        <div class="apt-route">
          <span class="apt-place">${task.pickup || '--'}</span>
          <span class="apt-arrow">→</span>
          <span class="apt-place">${task.delivery || '--'}</span>
        </div>
        <div class="apt-bar">
          <span class="apt-badge ${tone}">${taskLabel(task)}</span>
          <span class="apt-track"><i style="width:${pct}%"></i></span>
          <b class="apt-pct">${p ? pct + '%' : '--'}</b>
        </div>
        <div class="apt-meta">
          <span>剩 <b>${p && p.ready ? Math.round(p.remainKm) : '--'}</b> km</span>
          <span>预计 <b>${fmtEta(p)}</b> 送达</span>
          <span>已行 ${p && p.ready ? Math.round(p.traveledKm) : '--'} km</span>
        </div>
        <button class="apt-go" data-action="focus">查看物流概览 →</button>
      </div>` : ''

  const infoBlock = task ? `
      <div class="amap-popup-grid">
        <div class="pg-item"><span>机构</span><b title="${vehicle.org || ''}">${vehicle.org || '--'}</b></div>
        <div class="pg-item"><span>司机</span><b>${vehicle.driver || '--'}</b></div>
        <div class="pg-item"><span>燃料</span><b>${vehicle.fuel_type || '--'}</b></div>
        <div class="pg-item"><span>方向</span><b>${(vehicle.direction ?? 0)}°</b></div>
        <div class="pg-item"><span>ACC</span><b>${vehicle.accStatus || '--'}</b></div>
        <div class="pg-item"><span>上报</span><b class="mono">${(vehicle.reportTime || '--').slice(11)}</b></div>
      </div>` : `
      <div class="amap-popup-info">
        <div class="amap-popup-row"><span class="amap-popup-label">所属机构</span><span class="amap-popup-value">${vehicle.org || '--'}</span></div>
        <div class="amap-popup-row"><span class="amap-popup-label">司机</span><span class="amap-popup-value">${vehicle.driver || '--'}</span></div>
        <div class="amap-popup-row"><span class="amap-popup-label">燃料类型</span><span class="amap-popup-value">${vehicle.fuel_type || '--'}</span></div>
        <div class="amap-popup-row"><span class="amap-popup-label">行驶方向</span><span class="amap-popup-value">${(vehicle.direction ?? 0)}°</span></div>
        <div class="amap-popup-row"><span class="amap-popup-label">ACC状态</span><span class="amap-popup-value">${vehicle.accStatus || '--'}</span></div>
        <div class="amap-popup-row"><span class="amap-popup-label">上报时间</span><span class="amap-popup-value mono">${vehicle.reportTime || '--'}</span></div>
        <div class="amap-popup-row"><span class="amap-popup-label">当前位置</span><span class="amap-popup-value mono">${vehicle.location || '--'}</span></div>
      </div>`

  const actionsBlock = task ? `
      <div class="amap-popup-actions compact">
        <button class="amap-popup-iconbtn" data-action="track" title="实时跟踪">◎</button>
        <button class="amap-popup-iconbtn" data-action="playback" title="轨迹回放">↺</button>
      </div>` : `
      <div class="amap-popup-actions">
        <button class="amap-popup-btn" data-action="track">实时跟踪</button>
        <button class="amap-popup-btn" data-action="playback">轨迹回放</button>
      </div>`

  const html = `
    <div class="amap-custom-popup ${statusClass} ${task ? 'has-task' : 'no-task'}">
      <div class="amap-popup-accent"></div>
      <div class="amap-popup-close">×</div>
      <div class="amap-popup-header">
        <span class="amap-popup-plate">${vehicle.plate || '--'}</span>
        <span class="amap-popup-status ${statusClass}">${vehicle.status}</span>
        <span class="amap-popup-vin-inline">VIN …${String(vehicle.vin || '').slice(-7) || '--'}</span>
      </div>
      ${dayOffsetText ? `<div class="amap-popup-dayoffset">${dayOffsetText}</div>` : ''}
      <div class="amap-popup-metrics">
        <div class="metric-card">
          <span class="metric-label">当前速度</span>
          <span class="metric-value">${vehicle.speed ?? 0}<small>km/h</small></span>
        </div>
        <div class="metric-card">
          <span class="metric-label">海拔高度</span>
          <span class="metric-value">${(vehicle.altitude ?? 0).toFixed(1)}<small>m</small></span>
        </div>
      </div>
      ${taskBlock}
      <div class="amap-popup-divider"></div>
      ${infoBlock}
      ${actionsBlock}
    </div>
  `
  infoWindow.setContent(html)
  infoWindow.open(map, marker.getPosition())
  setTimeout(() => {
    const closeBtn = document.querySelector('.amap-popup-close')
    if (closeBtn) closeBtn.onclick = closePopup
    const goBtn = document.querySelector('.apt-go')
    if (goBtn) {
      goBtn.onclick = (e) => {
        e.stopPropagation()
        enterFocus(vehicle, task)
      }
    }
    document.querySelectorAll('.amap-popup-btn, .amap-popup-iconbtn').forEach(btn => {
      btn.onclick = () => {
        const action = btn.getAttribute('data-action')
        ElMessage.info(action === 'track' ? '实时跟踪功能开发中' : '轨迹回放功能开发中')
      }
    })
  }, 30)

  // 第一次打开时补算进度，算完再刷一次卡片
  if (task && !p) {
    ensureProgress(vehicle.plate, task).then(v => {
      if (v && highlightedPlate.value === vehicle.plate) {
        const m = markerMap.get(vehicle.plate)
        if (m) openPopup(vehicle, m)
      }
    })
  }
}

const closePopup = () => {
  if (infoWindow) infoWindow.close()
  if (highlightedPlate.value) {
    const marker = markerMap.get(highlightedPlate.value)
    if (marker) resetMarkerStyle(marker)
    highlightedPlate.value = null
  }
}

const onMapClick = (e) => {
  if (rangingActive.value) return
  const target = e.originalEvent?.target || e.target
  if (!target?.closest?.('.custom-marker') && !target?.closest?.('.amap-custom-popup')) {
    closePopup()
  }
}

const selectedPlates = ref([])

const setStatusFilter = (type) => {
  statusFilter.value = statusFilter.value === type ? 'all' : type
  updateMarkersVisibility()
}

const getStatusPriority = (v) => {
  if (!v.hasLocation) return 4
  if (v.status === '行驶') return 1
  if (v.status === '静止') return 2
  if (v.status === '离线') return 3
  return 4
}

const sortByStatusPriority = (list) => {
  return [...list]
    .map((v, idx) => ({ v, idx, p: getStatusPriority(v) }))
    .sort((a, b) => {
      if (a.p !== b.p) return a.p - b.p
      return a.idx - b.idx
    })
    .map(item => item.v)
}

const orgTreeRef = ref(null)
const treeLoading = ref(false)

const filteredVehicles = computed(() => {
  return preTaskVehicles.value.filter(v => {
    const t = taskOf(v)
    if (taskFilter.value === 'task') return !!t
    if (taskFilter.value === 'transit') return !!t && ['已发车', '已到达'].includes(t.status)
    if (taskFilter.value === 'loading') return !!t && ['待接单', '待装车', '装车完成'].includes(t.status)
    if (taskFilter.value === 'idle') return !t
    return true
  })
})

const visibleVehicleCount = computed(() => filteredVehicles.value.length)

// ============================================================
// ⭐ 组织树：用 parent_id 真建树（根 → 二级 → 三级 → 车辆）
// ============================================================
const expandedOrgs = ref(new Set())
const expandedVehicles = ref(new Set())
const VEH_PAGE = 6
const TREE_KEY = 'fullmap_tree_expanded'
let treeInited = false

const orgChildrenMap = computed(() => {
  const m = new Map()
  organizations.value.forEach(o => {
    const pid = o.parent_id == null ? '__root__' : String(o.parent_id)
    if (!m.has(pid)) m.set(pid, [])
    m.get(pid).push(o)
  })
  return m
})

const rootOrgs = computed(() => {
  const list = organizations.value
  if (!list.length) return []
  let roots = list.filter(o => o.is_root === true || Number(o.level) === 1 || !o.parent_id)
  if (!roots.length) {
    const ids = new Set(list.map(o => String(o.id)))
    roots = list.filter(o => !o.parent_id || !ids.has(String(o.parent_id)))
  }
  return roots.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-CN'))
})

const vehiclesByOrgName = computed(() => {
  const m = new Map()
  filteredVehicles.value.forEach(v => {
    const name = String(v.org || v.customer_name || '').trim() || '未分配机构'
    if (!m.has(name)) m.set(name, [])
    m.get(name).push(v)
  })
  return m
})

/** 车辆排序：有任务优先 → 任务状态靠前 → 车牌 */
const sortVehicles = (list) => list.slice().sort((a, b) => {
  const ta = taskOf(a)
  const tb = taskOf(b)
  if (!!tb !== !!ta) return tb ? 1 : -1
  if (ta && tb) {
    const w = (STATUS_WEIGHT[tb.status] || 0) - (STATUS_WEIGHT[ta.status] || 0)
    if (w) return w
  }
  return String(a.plate || '').localeCompare(String(b.plate || ''), 'zh-CN')
})

const buildNode = (org, depth) => {
  const kids = (orgChildrenMap.value.get(String(org.id)) || [])
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-CN'))
    .map(k => buildNode(k, depth + 1))

  const direct = sortVehicles(vehiclesByOrgName.value.get(org.name) || [])
  let count = direct.length
  let taskCount = direct.filter(v => taskOf(v)).length
  const mix = { run: 0, stop: 0, off: 0 }
  direct.forEach(v => {
    if (v.status === '行驶') mix.run++
    else if (v.status === '静止') mix.stop++
    else mix.off++
  })
  kids.forEach(k => {
    count += k.count
    taskCount += k.taskCount
    mix.run += k.mix.run
    mix.stop += k.mix.stop
    mix.off += k.mix.off
  })
  const total = Math.max(1, count)
  return {
    key: 'org:' + org.id,
    id: org.id,
    name: org.name,
    level: Number(org.level) || (depth + 1),
    depth,
    children: kids,
    vehicles: direct,
    count,
    taskCount,
    mix: {
      run: (mix.run / total) * 100,
      stop: (mix.stop / total) * 100,
      off: (mix.off / total) * 100,
    },
  }
}

const orgTree = computed(() => rootOrgs.value.map(o => buildNode(o, 0)))

const flatRows = computed(() => {
  const rows = []
  const searching = !!searchKeyword.value.trim()

  const pushVehicles = (node, depth) => {
    const all = node.vehicles
    if (!all.length) return
    const expandKey = 'veh:' + node.key
    const showAll = searching || expandedVehicles.value.has(expandKey)
    const shown = showAll ? all : all.slice(0, VEH_PAGE)
    shown.forEach(v => rows.push({
      type: 'vehicle',
      key: 'v:' + v.plate,
      depth,
      vehicle: v,
      task: taskOf(v),
      progress: progressByPlate.value[v.plate] || null,
    }))
    if (shown.length < all.length) {
      rows.push({
        type: 'more', key: 'more:' + node.key, depth, expandKey,
        rest: all.length - shown.length,
      })
    }
  }

  const walk = (node) => {
    const open = searching ? true : expandedOrgs.value.has(node.key)
    rows.push({
      type: 'org', key: node.key, name: node.name, level: node.level, depth: node.depth,
      count: node.count, taskCount: node.taskCount, mix: node.mix, open,
    })
    if (!open) return
    // ⭐ 机构优先：先把子机构铺完，再放本机构直属车辆，
    //    否则一个机构几十台车会把下面的机构全顶走
    node.children.forEach(walk)
    pushVehicles(node, node.depth + 1)
  }

  if (orgTree.value.length) {
    orgTree.value.forEach(walk)
    const un = sortVehicles(vehiclesByOrgName.value.get('未分配机构') || [])
    if (un.length) {
      const key = 'org:__none__'
      const open = searching || expandedOrgs.value.has(key)
      rows.push({
        type: 'org', key, name: '未分配机构', level: 1, depth: 0,
        count: un.length, taskCount: un.filter(v => taskOf(v)).length,
        mix: { run: 0, stop: 0, off: 100 }, open,
      })
      if (open) pushVehicles({ vehicles: un, key: key }, 1)
    }
    return rows
  }

  // 兜底：没有机构数据时，按车辆上的 org 名字拍平
  const names = [...vehiclesByOrgName.value.keys()].filter(n => n !== '未分配机构')
  names.sort((a, b) => a.localeCompare(b, 'zh-CN'))
  names.forEach(name => {
    const list = sortVehicles(vehiclesByOrgName.value.get(name))
    const key = 'flat:' + name
    const open = searching || expandedOrgs.value.has(key)
    rows.push({
      type: 'org', key, name, level: 1, depth: 0, count: list.length,
      taskCount: list.filter(v => taskOf(v)).length, mix: { run: 0, stop: 0, off: 100 }, open,
    })
    if (open) pushVehicles({ vehicles: list, key }, 1)
  })
  return rows
})

const allOrgKeys = computed(() => {
  const keys = []
  const walk = (n) => { keys.push(n.key); n.children.forEach(walk) }
  orgTree.value.forEach(walk)
  return keys
})

const allExpanded = computed(() => {
  const keys = allOrgKeys.value
  if (!keys.length) return false
  return keys.every(k => expandedOrgs.value.has(k))
})

const saveExpanded = () => {
  try { sessionStorage.setItem(TREE_KEY, JSON.stringify([...expandedOrgs.value])) } catch (e) { }
}

const toggleOrg = (key) => {
  const s = new Set(expandedOrgs.value)
  if (s.has(key)) s.delete(key)
  else s.add(key)
  expandedOrgs.value = s
  saveExpanded()
}

const expandVehicles = (key) => {
  const next = new Set(expandedVehicles.value)
  next.add(key)
  expandedVehicles.value = next
}

const toggleAllOrgs = () => {
  const keys = allOrgKeys.value
  if (!keys.length) return
  expandedOrgs.value = allExpanded.value ? new Set() : new Set(keys)
  saveExpanded()
}

/** 默认展开：有车且层级 <= 2 的机构（三级折叠） */
const initTreeExpanded = () => {
  if (treeInited || !organizations.value.length) return
  treeInited = true

  try {
    const saved = sessionStorage.getItem(TREE_KEY)
    if (saved) {
      const arr = JSON.parse(saved)
      if (Array.isArray(arr) && arr.length) {
        expandedOrgs.value = new Set(arr)
        return
      }
    }
  } catch (e) { }

  const nameCount = new Map()
  vehicles.value.forEach(v => {
    const n = String(v.org || v.customer_name || '').trim()
    if (n) nameCount.set(n, (nameCount.get(n) || 0) + 1)
  })
  const countOf = (o) => (nameCount.get(o.name) || 0) +
    (orgChildrenMap.value.get(String(o.id)) || []).reduce((sum, c) => sum + countOf(c), 0)

  const set = new Set()
  const walk = (o, depth) => {
    if (countOf(o) > 0 && depth <= 1) set.add('org:' + o.id)
    ;(orgChildrenMap.value.get(String(o.id)) || []).forEach(k => walk(k, depth + 1))
  }
  rootOrgs.value.forEach(o => walk(o, 0))
  expandedOrgs.value = set
}

watch([organizations, () => vehicles.value.length], () => { initTreeExpanded() })

/** 点击车辆：定位到地图并弹出卡片 */
const focusVehicle = (vehicle) => {
  if (!vehicle) return
  highlightVehicle(vehicle.plate)
}

const highlightVehicle = (plate) => {
  const vehicle = vehicles.value.find(v => v.plate === plate)
  if (vehicle && !vehicle.hasLocation) {
    ElMessage.warning(`车辆「${plate}」暂无定位数据，请稍后刷新定位`)
    return
  }
  if (highlightedPlate.value === plate) {
    closePopup()
    return
  }
  if (highlightedPlate.value) {
    const oldMarker = markerMap.get(highlightedPlate.value)
    if (oldMarker) resetMarkerStyle(oldMarker)
  }
  const marker = markerMap.get(plate)
  if (marker && map && vehicle) {
    map.setZoomAndCenter(8, marker.getPosition(), false, 400)
    setTimeout(() => {
      highlightMarker(marker)
      openPopup(vehicle, marker)
    }, 420)
  }
}

const isVehicleHighlighted = (plate) => {
  return highlightedPlate.value === plate || selectedPlates.value.includes(plate)
}

// ============================================================
// ⭐⭐ 沉浸式物流概览（C1）：靛青蓝 + 单车主线 + HUD
// ============================================================
const focusMode = ref(null)
const focusFullscreen = ref(false)
const focusProgress = ref(null)

const focusPct = computed(() => {
  const p = focusProgress.value
  return p && p.ready ? Math.round(p.doneRatio * 100) : 0
})
const focusRemainKm = computed(() => (focusProgress.value && focusProgress.value.ready ? focusProgress.value.remainKm : 0))
const focusTraveledKm = computed(() => (focusProgress.value && focusProgress.value.ready ? focusProgress.value.traveledKm : 0))
const focusPlanKm = computed(() => (focusMode.value && focusMode.value.task.plan_distance) || 0)
const focusEta = computed(() => fmtEta(focusProgress.value))
const focusRemainText = computed(() => {
  const p = focusProgress.value
  if (!p || !p.ready) return '--'
  if (p.stale) return '停更'
  const m = Math.max(0, Math.round(p.remainMinutes))
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m` : `${m}m`
})
const focusStartText = computed(() => {
  const t = focusMode.value && focusMode.value.task
  const dt = t && (t.depart_time || t.pickup_time)
  return dt ? dayjs(dt).format('MM-DD HH:mm') + ' 发车' : '待发车'
})
const focusSpeedText = computed(() => {
  const v = focusMode.value && focusMode.value.vehicle
  const cur = focusProgress.value && focusProgress.value.current
  const speed = cur ? cur.speed : (v ? v.speed : 0)
  const time = cur && cur.reportTime
    ? dayjs(cur.reportTime).format('HH:mm:ss')
    : (v && v.reportTime ? String(v.reportTime).slice(11) : '--')
  return `定位 ${time} 上报 · ${Math.round(speed || 0)} km/h`
})
const focusNodes = computed(() => {
  const t = (focusMode.value && focusMode.value.task) || {}
  const s = normStatus(t.status)
  const reached = { '待接单': 0, '待装车': 0, '装车完成': 0, '已发车': 1, '已到达': 2, '已完成': 3 }[s] ?? 0
  const nodes = [
    { label: '接单', time: t.accept_time },
    { label: '已发车', time: t.depart_time },
    { label: '确认到达', time: t.arrive_time },
    { label: '完成运单', time: t.finish_time },
  ]
  return nodes.map((n, i) => ({
    label: n.label,
    time: n.time ? dayjs(n.time).format('MM-DD HH:mm') : '',
    on: i === reached,
    done: i < reached,
  }))
})

const focusSvgRef = ref(null)
const focusSvgD = ref('')
const focusGrow = ref(0)
const focusStartXY = ref(null)
const focusEndXY = ref(null)
const focusVehXY = ref({ x: -999, y: -999 })
const focusCometXY = ref({ x: -999, y: -999 })
const focusCometVisible = ref(false)

let focusPath = []
let focusPts = []
let focusCometRaf = null
let focusGrowRaf = null

const stopFocusAnim = () => {
  if (focusCometRaf) { cancelAnimationFrame(focusCometRaf); focusCometRaf = null }
  if (focusGrowRaf) { cancelAnimationFrame(focusGrowRaf); focusGrowRaf = null }
  focusCometVisible.value = false
}

/** 经纬度 → 容器像素 */
const toContainerXY = (pt) => {
  const p = map.lngLatToContainer(new AMap.LngLat(Number(pt[0]), Number(pt[1])))
  return { x: p.getX(), y: p.getY() }
}

/** 地图移动/缩放后重算整条线的像素坐标 */
const rebuildFocusSvg = () => {
  if (!map || !AMap || !focusPath.length) return
  const pts = focusPath.map(toContainerXY)
  focusPts = pts
  focusSvgD.value = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  focusStartXY.value = pts[0]
  focusEndXY.value = pts[pts.length - 1]
  updateFocusVeh()
}

const pointAtRatio = (ratio) => {
  if (!focusPts.length) return { x: -999, y: -999 }
  const r = Math.min(1, Math.max(0, ratio))
  const f = r * (focusPts.length - 1)
  const i = Math.floor(f)
  const a = focusPts[i]
  const b = focusPts[Math.min(focusPts.length - 1, i + 1)] || a
  const k = f - i
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
}

const updateFocusVeh = () => {
  focusVehXY.value = pointAtRatio(focusPct.value / 100)
}

/** 流光：从当前位置跑到终点，循环 */
const startFocusComet = () => {
  if (focusCometRaf) cancelAnimationFrame(focusCometRaf)
  focusCometVisible.value = true
  const from = Math.min(0.97, focusPct.value / 100)
  const t0 = performance.now()
  const loop = (now) => {
    const k = ((now - t0) % 5200) / 5200
    focusCometXY.value = pointAtRatio(from + (1 - from) * k)
    focusCometRaf = requestAnimationFrame(loop)
  }
  focusCometRaf = requestAnimationFrame(loop)
}

/** 路线「生长」动画 */
const animateFocusGrow = (duration = 950) => {
  if (focusGrowRaf) cancelAnimationFrame(focusGrowRaf)
  const t0 = performance.now()
  focusGrow.value = 0
  const step = (now) => {
    const k = Math.min(1, (now - t0) / duration)
    focusGrow.value = 1 - Math.pow(1 - k, 2)
    if (k < 1) focusGrowRaf = requestAnimationFrame(step)
    else focusGrowRaf = null
  }
  focusGrowRaf = requestAnimationFrame(step)
}

const fetchDrivingPath = (from, to) => new Promise((resolve) => {
  try {
    const driving = new AMap.Driving({ policy: AMap.DrivingPolicy.LEAST_TIME })
    const timer = setTimeout(() => resolve(null), 8000)
    driving.search(new AMap.LngLat(from[0], from[1]), new AMap.LngLat(to[0], to[1]), (status, result) => {
      clearTimeout(timer)
      if (status === 'complete' && result && result.routes && result.routes.length) {
        const path = []
        ;(result.routes[0].steps || []).forEach(s => (s.path || []).forEach(pt => path.push([pt.lng, pt.lat])))
        resolve(path.length > 1 ? path : null)
      } else {
        resolve(null)
      }
    })
  } catch (e) { resolve(null) }
})

const drawFocusRoute = async (vehicle, task) => {
  stopFocusAnim()
  focusPath = []
  focusPts = []
  focusSvgD.value = ''
  focusGrow.value = 0
  focusStartXY.value = null
  focusEndXY.value = null
  focusVehXY.value = { x: -999, y: -999 }

  const from = task.pickup_lng && task.pickup_lat ? [Number(task.pickup_lng), Number(task.pickup_lat)] : null
  const to = task.delivery_lng && task.delivery_lat ? [Number(task.delivery_lng), Number(task.delivery_lat)] : null

  let path = from && to ? await fetchDrivingPath(from, to) : null
  if (!path) {
    if (from && to) path = [from, to]
    else if (vehicle.lng) path = [[vehicle.lng, vehicle.lat], [vehicle.lng, vehicle.lat]]
    else return
  }
  focusPath = path

  await nextTick()
  rebuildFocusSvg()

  // 相机包住整条线（用一条不可见折线做 setFitView，给 HUD 留出空间）
  try {
    const fitter = new AMap.Polyline({ path, strokeOpacity: 0, strokeWeight: 1, bubble: true })
    map.add(fitter)
    map.setFitView([fitter], false, [100, 110, 130, 100])
    setTimeout(() => { try { map.remove(fitter) } catch (e) { } }, 900)
  } catch (e) { }

  setTimeout(() => {
    rebuildFocusSvg()
    animateFocusGrow()
    startFocusComet()
  }, 240)

  setTimeout(() => { if (focusMode.value) rebuildFocusSvg() }, 760)
}

const enterFocus = async (vehicle, task) => {
  if (!map || !AMap) {
    ElMessage.warning('地图还没准备好，请稍后重试')
    return
  }
  if (!task) {
    ElMessage.info('该车暂无进行中的运单')
    return
  }
  closePopup()
  focusMode.value = { vehicle, task }
  focusProgress.value = progressByPlate.value[vehicle.plate] || null
  isListCollapsed.value = true
  markerMap.forEach(m => {
    setMarkerVisible(m, false)
  })

  await nextTick()
  await drawFocusRoute(vehicle, task)

  const p = await ensureProgress(vehicle.plate, task, true)
  // 刷新失败时别把已有的好数据覆盖掉
  if (p && (p.ready || !focusProgress.value || !focusProgress.value.ready)) {
    focusProgress.value = p
    nextTick(() => {
      updateFocusVeh()
      startFocusComet()
    })
  }
}

const clearFocusState = () => {
  stopFocusAnim()
  focusPath = []
  focusPts = []
  focusSvgD.value = ''
}

const exitFocus = () => {
  clearFocusState()
  if (focusFullscreen.value) focusFullscreen.value = false
  focusMode.value = null
  focusProgress.value = null
  markerMap.forEach(m => {
    setMarkerVisible(m, true)
  })
  updateMarkersVisibility()
  isListCollapsed.value = false
  nextTick(() => {
    setTimeout(() => {
      if (map && markers.length) map.setFitView(markers, false, [120, 80, 80, 80])
    }, 90)
  })
}

const toggleFocusFullscreen = () => {
  focusFullscreen.value = !focusFullscreen.value
  setTimeout(() => { try { map && map.resize() } catch (e) { } }, 80)
  setTimeout(() => { try { map && map.resize() } catch (e) { } }, 340)
}

const onEscFocus = (e) => {
  if (e.key === 'Escape' && focusMode.value) {
    if (focusFullscreen.value) focusFullscreen.value = false
    else exitFocus()
  }
}

/** 地图拖动 / 缩放时重算路线 */
const onFocusMapMove = () => {
  if (focusMode.value) rebuildFocusSvg()
}


const setMarkerVisible = (m, visible) => {
  if (!m) return
  try {
    if (visible) { if (m.show) m.show(); else if (m.setVisible) m.setVisible(true) }
    else { if (m.hide) m.hide(); else if (m.setVisible) m.setVisible(false) }
  } catch (e) { }
}

const updateMarkersVisibility = () => {
  if (!map) return
  const visiblePlates = new Set(filteredVehicles.value.filter(v => v.hasLocation).map(v => v.plate))
  markerMap.forEach((marker, plate) => {
    setMarkerVisible(marker, visiblePlates.has(plate))
  })
  if (highlightedPlate.value && !visiblePlates.has(highlightedPlate.value)) {
    closePopup()
  }
}

watch([selectedOrg, selectedStatus, searchKeyword, selectedPlates, statusFilter, taskFilter], () => {
  updateMarkersVisibility()
}, { deep: true })

const handleSearch = () => { }

const resetAll = () => {
  selectedOrg.value = ''
  selectedStatus.value = ''
  searchKeyword.value = ''
  selectedPlates.value = []
  statusFilter.value = 'all'
  closePopup()
  updateMarkersVisibility()
}

const isListCollapsed = ref(false)
const toggleList = () => { isListCollapsed.value = !isListCollapsed.value }

const listWidth = ref(260)
const isResizing = ref(false)
const startResize = (e) => {
  e.preventDefault()
  e.stopPropagation()
  isResizing.value = true
  const startX = e.clientX
  const startWidth = listWidth.value
  const onMouseMove = (ev) => {
    const newWidth = startWidth + (ev.clientX - startX)
    listWidth.value = Math.min(440, Math.max(220, newWidth))
  }
  const onMouseUp = () => {
    isResizing.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

onMounted(async () => {
  await nextTick()
  document.body.style.overflow = 'hidden'
  document.documentElement.style.overflow = 'hidden'
  window.addEventListener('keydown', onEscFocus)

  // ⭐ 面板先挂出来：地图初始化 与 车辆/运单加载 **并行**，谁先好谁先渲染
  const mapTask = initMap()

  const dataTask = (async () => {
    if (isCustomer) {
      await loadMyCustomerId()
      await loadMyOrgInfo()
    }
    await loadVehicles(true)
    await loadWaybills()
  })()

  // 任何一边失败都不影响另一边（地图挂了下拉列表照样能用）
  await Promise.all([mapTask.catch(() => { }), dataTask.catch(() => { })])

  // 数据到齐后补一次标记（initMap 那次可能还没有车）
  if (isMapReady.value) {
    addMarkers()
    updateMarkersVisibility()
  }
  prefetchProgress()
})

onDeactivated(() => {
  // ⭐ keep-alive 下切走不会走 onBeforeUnmount，必须在这里把 body 滚动还回去，
  //    否则别的页面（尤其独立路由的运单详情）会被锁住滚不动
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
})

onActivated(async () => {
  if (isCustomer && !myCustomerId.value) await loadMyCustomerId()
  if (isCustomer && isSubAccount && (!myOrgName.value || !myOrgLevel.value)) {
    await loadMyOrgInfo()
  }
  await loadVehicles(true)
  await loadOrganizations()
  await loadWaybills()
  if (isMapReady.value) {
    addMarkers()
    updateMarkersVisibility()
  }
  document.body.style.overflow = 'hidden'
  document.documentElement.style.overflow = 'hidden'
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEscFocus)
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
  clearFocusState()
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  if (map) {
    try { map.off('click', onMapClick) } catch (e) { }
    try { map.off('click', onRangingClick) } catch (e) { }
    try { map.off('rightclick', onRangingRightClick) } catch (e) { }
    try { map.off('mousemove', onRangingMouseMove) } catch (e) { }
    try { map.off('mouseout', onRangingMouseOut) } catch (e) { }
    try { map.off('mapmove', updateAllSvgLines) } catch (e) { }
    try { map.off('zoomchange', updateAllSvgLines) } catch (e) { }
    try { map.destroy() } catch (e) { }
    map = null
  }
})
</script>

<style scoped>
/* ============================================================
   页面基础
   ============================================================ */
.fullmap {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  width: 100%;
  overflow: hidden;
  padding: 12px;
  box-sizing: border-box;
  background: #f0f2f5;
  overscroll-behavior: none;
  touch-action: none;
}
.map-stage {
  position: relative;
  height: 100%;
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
  background: #F8FAFC;
  overscroll-behavior: none;
}
.map-container {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.ranging-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 100;
  overflow: visible;
}

/* 顶部栏 */
.top-bar {
  position: absolute;
  top: 16px; right: 16px; left: 300px;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  pointer-events: none;
}
.left-group { display: flex; align-items: center; gap: 10px; pointer-events: auto; min-width: 0; }
.stats-pills {
  display: flex; align-items: center; gap: 6px;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-radius: 999px; padding: 5px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(255, 255, 255, 0.6) inset;
  flex-shrink: 0;
}
.stat-pill {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 14px; border-radius: 999px; cursor: pointer;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  background: transparent; border: 1.5px solid transparent; user-select: none;
}
.stat-pill:hover { background: rgba(248, 250, 252, 0.95); transform: translateY(-2px); box-shadow: 0 4px 10px rgba(0, 0, 0, 0.06); }
.stat-pill:hover .pill-dot { transform: scale(1.4); }
.stat-pill.active { background: #ffffff; box-shadow: 0 4px 14px rgba(200, 16, 46, 0.12), 0 0 0 1.5px currentColor inset; }
.stat-pill.active .pill-value { transform: scale(1.08); }
.stat-pill:nth-child(1) { color: #c8102e; }
.stat-pill:nth-child(2) { color: #10B981; }
.stat-pill:nth-child(3) { color: #F59E0B; }
.stat-pill:nth-child(4) { color: #64748B; }
.pill-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex-shrink: 0; transition: all 0.3s; }
.stat-pill:nth-child(1) .pill-dot { box-shadow: 0 0 0 3px rgba(200, 16, 46, 0.18); animation: dotPulseRed 2s ease-in-out infinite; }
.stat-pill:nth-child(2) .pill-dot { box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.18); animation: dotPulseGreen 2s ease-in-out infinite; }
.stat-pill:nth-child(3) .pill-dot { box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.18); animation: dotPulseAmber 2s ease-in-out infinite; }
@keyframes dotPulseRed { 0%,100% { box-shadow: 0 0 0 3px rgba(200,16,46,0.18); } 50% { box-shadow: 0 0 0 6px rgba(200,16,46,0.04); } }
@keyframes dotPulseGreen { 0%,100% { box-shadow: 0 0 0 3px rgba(16,185,129,0.18); } 50% { box-shadow: 0 0 0 6px rgba(16,185,129,0.04); } }
@keyframes dotPulseAmber { 0%,100% { box-shadow: 0 0 0 3px rgba(245,158,11,0.18); } 50% { box-shadow: 0 0 0 6px rgba(245,158,11,0.04); } }
.pill-value { font-size: 14px; font-weight: 800; color: #0F172A; font-family: 'Courier New', monospace; line-height: 1; }
.pill-label { font-size: 12px; font-weight: 600; color: #64748B; line-height: 1; }

.refresh-btn {
  background: linear-gradient(135deg, #c8102e, #a00d24) !important;
  border: none !important; color: #ffffff !important; font-weight: 600 !important;
  border-radius: 999px !important;
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.3) !important;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
  padding: 8px 18px !important; flex-shrink: 0;
}
.refresh-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(200, 16, 46, 0.45) !important; }
.icon-spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.map-controls {
  display: flex; align-items: center; gap: 8px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-radius: 999px; padding: 5px 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(255, 255, 255, 0.6) inset;
  pointer-events: auto; flex-shrink: 0;
}
.style-select { width: 108px; }
.style-select :deep(.el-input__wrapper) {
  border-radius: 999px !important;
  background: rgba(248, 250, 252, 0.9) !important;
  box-shadow: none !important; padding: 0 10px !important;
  min-height: 26px; transition: all 0.25s;
}
.style-select :deep(.el-input__wrapper:hover) { background: #FEF2F2 !important; }
.style-select :deep(.el-input__wrapper.is-focus) { box-shadow: 0 0 0 2px rgba(200, 16, 46, 0.15), 0 0 0 1px #c8102e inset !important; background: #ffffff !important; }
.style-select :deep(.el-input__inner) { font-size: 12px; color: #475569; font-weight: 600; }
.ctrl-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 5px 11px; border-radius: 999px; border: none;
  background: rgba(248, 250, 252, 0.9); color: #475569;
  font-size: 12px; font-weight: 600; cursor: pointer;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1); outline: none;
}
.ctrl-btn:hover { background: #FEF2F2; color: #c8102e; transform: translateY(-1px); box-shadow: 0 4px 10px rgba(200, 16, 46, 0.15); }
.ctrl-btn.active { background: linear-gradient(135deg, #c8102e, #a00d24); color: #ffffff; box-shadow: 0 4px 12px rgba(200, 16, 46, 0.35); }
.ctrl-btn.active:hover { color: #ffffff; box-shadow: 0 6px 16px rgba(200, 16, 46, 0.5); }
.ctrl-btn .el-icon { font-size: 13px; }

/* 测距摘要 */
.ranging-summary {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 55;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border-radius: 14px;
  padding: 12px 20px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(255, 255, 255, 0.85) inset, 0 1px 0 rgba(255, 255, 255, 0.9) inset;
  border: 1px solid rgba(255, 255, 255, 0.75);
  min-width: 280px;
  pointer-events: none;
}
.ranging-summary-header {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; font-weight: 700; color: #475569;
  margin-bottom: 8px; letter-spacing: 0.3px;
}
.summary-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #3B82F6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
  animation: summaryPulse 1.6s ease-in-out infinite;
}
@keyframes summaryPulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2); }
  50% { box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.05); }
}
.ranging-summary-body { display: flex; align-items: center; gap: 14px; }
.summary-item { display: flex; flex-direction: column; gap: 2px; }
.summary-label { font-size: 10px; font-weight: 600; color: #94A3B8; letter-spacing: 0.3px; }
.summary-value { font-size: 18px; font-weight: 800; color: #0F172A; font-family: 'Courier New', monospace; line-height: 1.1; }
.summary-value.highlight { color: #c8102e; font-size: 22px; }
.summary-divider { width: 1px; height: 30px; background: rgba(203, 213, 225, 0.9); }
.ranging-summary-tip { margin-top: 8px; font-size: 10.5px; color: #94A3B8; font-weight: 500; letter-spacing: 0.2px; }
.summary-slide-enter-active, .summary-slide-leave-active { transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }
.summary-slide-enter-from, .summary-slide-leave-to { opacity: 0; transform: translateX(-50%) translateY(20px); }

/* 悬浮左侧面板 */
/* ⭐ 左侧面板：整块滑出（方案 3）+ 右边缘把手 */
.fm-dock {
  position: absolute;
  top: 16px;
  left: 16px;
  bottom: 16px;
  z-index: 60;
}

.dock-panel {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.97);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.10), 0 0 0 1px rgba(255, 255, 255, 0.6) inset;
  overflow: hidden;
  transition: transform 0.26s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: transform;
}

.dock-panel.collapsed {
  /* 整块滑出，只留右边缘把手 */
  transform: translateX(-100%);
}

.dock-handle {
  position: absolute;
  left: calc(100% - 4px);
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 66px;
  padding: 0 0 0 4px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 0 12px 12px 0;
  background: #C8102E;
  color: #FFFFFF;
  cursor: pointer;
  z-index: 3;
  box-shadow: 2px 6px 16px rgba(200, 16, 46, 0.30);
  transition: left 0.26s cubic-bezier(0.4, 0, 0.2, 1), background 0.2s, box-shadow 0.2s, transform 0.2s;
}

.dock-handle:hover {
  background: #A00D24;
  box-shadow: 2px 8px 20px rgba(200, 16, 46, 0.42);
}

.dock-handle:active {
  transform: translateY(-50%) scale(0.96);
}

.dock-handle.collapsed {
  left: -16px;
  border-radius: 12px;
  padding: 0;
}

/* 筛选栏 */
.sidebar-filter {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.6);
  flex-shrink: 0;
}
:deep(.sidebar-filter .el-input__wrapper),
:deep(.sidebar-filter .el-select__wrapper) {
  border-radius: 8px !important;
  background: rgba(248, 250, 252, 0.8) !important;
}
:deep(.sidebar-filter .el-input__wrapper.is-focus),
:deep(.sidebar-filter .el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 2px rgba(200, 16, 46, 0.15), 0 0 0 1px #c8102e inset !important;
  background: #ffffff !important;
}
.search-row { margin-top: 8px; }
.filter-buttons { display: flex; gap: 8px; margin-top: 8px; }
.btn-reset, .btn-search { flex: 1; border-radius: 8px !important; font-weight: 600 !important; font-size: 12px !important; }
.btn-reset { border-color: #CBD5E1; color: #334155; background: #fff; }
.btn-reset:hover { border-color: #c8102e; color: #c8102e; background: #FEF2F2; }
.btn-search { background: linear-gradient(135deg, #c8102e, #a00d24) !important; border: none !important; color: #ffffff !important; }
.btn-search:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(200, 16, 46, 0.3); }

/* 头部 */
.sidebar-list-header {
  padding: 8px 12px;
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 700; color: #0F172A;
  border-bottom: 1px solid rgba(226, 232, 240, 0.6);
  flex-shrink: 0;
}
.list-icon { color: #c8102e; font-size: 15px; flex-shrink: 0; }
.header-title {
  font-size: 13.5px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: 0.3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
.list-count { color: #c8102e; font-weight: 700; font-size: 12px; font-family: 'Courier New', monospace; flex-shrink: 0; }

.hdot {
  width: 7px; height: 7px; border-radius: 2px; background: #C8102E; flex: 0 0 auto;
}

.collapse-all {
  width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center;
  color: #94A3B8; cursor: pointer; flex: 0 0 auto;
  transition: background .18s, color .18s;
}

.collapse-all:hover { background: #FEF2F2; color: #C8102E; }
.collapse-all.off { color: #CBD5E1; }

.collapse-btn {
  width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 6px;
  cursor: pointer;
  color: #64748B; font-size: 13px;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  flex-shrink: 0;
}
.collapse-btn:hover { background: #F1F5F9; color: #c8102e; transform: scale(1.15); }
.collapse-btn:hover .collapse-icon { transform: translateX(-2px); }
.collapse-icon { transition: transform 0.3s; }

/* 组织树 */
.sidebar-tree {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 2px;
  scrollbar-width: thin;
}
.sidebar-tree::-webkit-scrollbar { width: 4px; }
.sidebar-tree::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 2px; }
.sidebar-tree::-webkit-scrollbar-thumb:hover { background: #94A3B8; }

.org-tree { background: transparent; }

.org-tree :deep(.el-tree-node__content) {
  height: 24px;
  line-height: 24px;
  border-radius: 4px;
  margin: 0;
  padding: 0 !important;
  transition: background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.org-tree :deep(.el-tree-node__content:hover) {
  background: rgba(254, 242, 242, 0.7);
}
.org-tree :deep(.el-tree-node.is-current > .el-tree-node__content) {
  background: rgba(254, 242, 242, 0.85);
}

.org-tree :deep(.el-tree-node__expand-icon) {
  width: 24px;
  padding: 0;
  font-size: 11px;
  color: #94A3B8;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.org-tree :deep(.el-tree-node__expand-icon.is-leaf) {
  color: transparent;
  cursor: default;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  padding-right: 4px;
}

.tree-node-org .org-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #0F172A;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
}
.tree-node-org.type-root .org-label {
  font-weight: 800;
  letter-spacing: 0.2px;
  font-size: 12.5px;
}
.tree-node-org .org-count {
  flex-shrink: 0;
  font-size: 10.5px;
  font-weight: 700;
  color: #c8102e;
  font-family: 'Courier New', monospace;
  letter-spacing: -0.3px;
  line-height: 1;
}
.tree-node-org .org-count.empty {
  color: #94A3B8;
  font-weight: 500;
}

.tree-node-vehicle {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 4px 0 0;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  min-width: 0;
  flex: 1;
  line-height: 1;
}
.tree-node-vehicle:hover {
  background: rgba(254, 242, 242, 0.6);
}
.tree-node-vehicle.active {
  background: linear-gradient(90deg, rgba(254, 202, 202, 0.55), rgba(254, 242, 242, 0.25));
  box-shadow: none;
}
.tree-node-vehicle.no-loc {
  opacity: 0.45;
}
.tree-node-vehicle .vehicle-plate {
  font-weight: 600;
  color: #0F172A;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
  letter-spacing: 0.2px;
}
.tree-node-vehicle .vehicle-status-tag {
  flex-shrink: 0;
  font-size: 9.5px;
  font-weight: 700;
  padding: 0 5px;
  line-height: 15px;
  height: 15px;
  border-radius: 7.5px;
  letter-spacing: 0.1px;
  display: inline-flex;
  align-items: center;
}
.tree-node-vehicle .vehicle-status-tag.行驶 { background: #D1FAE5; color: #065F46; }
.tree-node-vehicle .vehicle-status-tag.静止 { background: #FEF3C7; color: #92400E; }
.tree-node-vehicle .vehicle-status-tag.离线 { background: #F1F5F9; color: #64748B; }

.list-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 50px 20px;
  color: #94A3B8;
  font-size: 12px;
}
.list-empty .el-icon { font-size: 26px; color: #CBD5E1; }

/* 收起态 */
.sidebar-collapsed {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition:
    opacity 0.24s cubic-bezier(0.4, 0, 0.2, 1),
    visibility 0s linear 0.2s;
}
.sidebar-collapsed.is-visible {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transition:
    opacity 0.28s cubic-bezier(0.4, 0, 0.2, 1) 0.12s,
    visibility 0s linear 0s;
}
.collapse-btn-vertical {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  cursor: pointer;
  color: #475569;
  background: linear-gradient(135deg, #ffffff, #F8FAFC);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.1),
    0 0 0 1px rgba(203, 213, 225, 0.6) inset;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.collapse-btn-vertical:hover {
  color: #c8102e;
  background: linear-gradient(135deg, #FEF2F2, #FEE2E2);
  transform: scale(1.12);
  box-shadow:
    0 4px 14px rgba(200, 16, 46, 0.25),
    0 0 0 1px rgba(200, 16, 46, 0.3) inset;
}
.collapse-btn-vertical:hover .collapse-icon { transform: translateX(2px); }

.resizer {
  position: absolute;
  top: 0;
  right: -3px;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
}
.resizer:hover { background: rgba(200, 16, 46, 0.08); }
.resizer::after {
  content: '';
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 2px; height: 24px;
  background: #CBD5E1;
  border-radius: 1px;
  opacity: 0;
}
.resizer:hover::after { opacity: 1; }

/* 加载 & 空状态 */
.map-loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(248, 250, 252, 0.9);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.loading-card {
  background: #ffffff;
  border-radius: 16px;
  padding: 28px 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  box-shadow: 0 20px 60px rgba(200, 16, 46, 0.15);
  animation: loadingCardIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes loadingCardIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
.loading-ring { position: relative; width: 72px; height: 72px; }
.loading-ring svg { transform: rotate(-90deg); }
.ring-track { fill: none; stroke: #FEE2E2; stroke-width: 6; }
.ring-progress { fill: none; stroke: #c8102e; stroke-width: 6; stroke-linecap: round; stroke-dasharray: 263.89; transition: stroke-dashoffset 0.3s ease-out; filter: drop-shadow(0 2px 6px rgba(200, 16, 46, 0.4)); }
.loading-percent { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 16px; font-weight: 800; color: #c8102e; font-family: 'Courier New', monospace; }
.loading-text { font-size: 13px; color: #475569; font-weight: 600; margin: 0; animation: textPulse 1.6s ease-in-out infinite; }
@keyframes textPulse { 0%,100% { opacity: 0.7; } 50% { opacity: 1; } }

.fade-enter-active, .fade-leave-active { transition: opacity 0.4s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.map-empty {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  z-index: 150;
  text-align: center;
  padding: 30px 40px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.08);
}
.empty-icon-wrap {
  display: flex;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: linear-gradient(135deg, #FEF2F2, #FCA5A5);
  align-items: center;
  justify-content: center;
  animation: emptyFloat 3s ease-in-out infinite;
}
.empty-icon-wrap.warning { background: linear-gradient(135deg, #FFFBEB, #FCD34D); }
.empty-icon-wrap .el-icon { font-size: 34px; color: #991B1B; }
.empty-icon-wrap.warning .el-icon { color: #92400E; }
@keyframes emptyFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
.map-empty p { margin: 0; font-size: 16px; color: #0F172A; font-weight: 700; }
.map-empty span { font-size: 13px; color: #64748B; font-weight: 500; }

@media (max-width: 1400px) {
  .pill-label { display: none; }
  .stat-pill { padding: 6px 10px; }
  .style-select { width: 92px; }
  .ctrl-btn span { display: none; }
  .ctrl-btn { padding: 5px 9px; }
}
@media (max-width: 1024px) { .map-controls { gap: 4px; padding: 4px 6px; } }
@media (max-width: 768px) {
  .fullmap { padding: 6px; }
  .floating-sidebar { display: none; }
  .top-bar { left: 12px; right: 12px; top: 12px; gap: 8px; }
  .map-controls { display: none; }
  .stats-pills { overflow-x: auto; }
}

/* ============================================================
   ⭐ 左侧面板：筛选区压缩 + 任务 chip + 组织分组 + 双行卡片
   ============================================================ */
.side-filter {
  padding: 8px 10px 7px;
  border-bottom: 1px solid rgba(226, 232, 240, .7);
  flex-shrink: 0;
}

.f-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.f-row + .f-row { margin-top: 6px; }

.f-org { flex: 1; min-width: 0; }
.f-status { width: 88px; flex: 0 0 auto; }
.f-kw { flex: 1; min-width: 0; }

.side-filter :deep(.el-select__wrapper),
.side-filter :deep(.el-input__wrapper) {
  border-radius: 8px !important;
  background: #F8FAFC !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  min-height: 28px;
  transition: box-shadow .22s, background .22s;
}

.side-filter :deep(.el-select__wrapper:hover),
.side-filter :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #FCA5A5 inset !important;
}

.side-filter :deep(.el-select__wrapper.is-focused),
.side-filter :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #C8102E inset, 0 0 0 3px rgba(200, 16, 46, .10) !important;
}

.f-btn {
  height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid #E2E8F0;
  background: #fff;
  color: #475569;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  flex: 0 0 auto;
  transition: all .22s cubic-bezier(.34, 1.2, .64, 1);
}

.f-btn:hover {
  color: #C8102E;
  border-color: #FCA5A5;
  background: #FEF2F2;
  transform: translateY(-1px);
}

.f-btn:active { transform: translateY(0) scale(.97); }

.f-btn.primary {
  background: linear-gradient(135deg, #C8102E, #A00D24);
  border-color: #C8102E;
  color: #fff;
  box-shadow: 0 4px 12px rgba(200, 16, 46, .25);
}

.f-btn.primary:hover { filter: brightness(1.05); color: #fff; }

.task-chips {
  display: flex;
  gap: 5px;
  margin-top: 7px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  padding-bottom: 1px;
}

.task-chips::-webkit-scrollbar { display: none; }

.tchip {
  flex: 0 0 auto;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid #E2E8F0;
  background: #fff;
  color: #64748B;
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  transition: all .22s cubic-bezier(.34, 1.2, .64, 1);
}

.tchip b {
  font-size: 10px;
  font-weight: 800;
  color: #94A3B8;
}

.tchip:hover {
  border-color: #C7D2FE;
  color: #4F46E5;
  transform: translateY(-1px);
}

.tchip.on {
  background: #EEF2FF;
  border-color: #C7D2FE;
  color: #3730A3;
  font-weight: 800;
  box-shadow: 0 2px 8px rgba(79, 70, 229, .12);
}

.tchip.on b { color: #4F46E5; }

.bill-loading {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid #E2E8F0;
  border-top-color: #C8102E;
  animation: billSpin .8s linear infinite;
  margin-left: 2px;
}

@keyframes billSpin { to { transform: rotate(360deg); } }

/* 组织分组 */
.org-row {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  margin: 3px 4px 1px;
  padding-right: 8px;
  border-radius: 7px;
  cursor: pointer;
  color: #334155;
  font-size: 11.5px;
  font-weight: 800;
  position: relative;
  transition: background .2s;
}

.org-row::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 2px;
  border-radius: 2px;
  background: #E2E8F0;
  transition: background .2s;
}

.org-row:hover { background: #F8FAFC; }
.org-row:hover::before { background: #CBD5E1; }

.org-chev {
  font-size: 10px;
  color: #CBD5E1;
  transition: transform .3s cubic-bezier(.34, 1.4, .64, 1), color .2s;
  flex: 0 0 auto;
}

.org-chev.open { transform: rotate(90deg); color: #94A3B8; }

.org-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.org-n {
  font-size: 10px;
  font-weight: 700;
  color: #94A3B8;
  flex: 0 0 auto;
}

.org-task {
  font-size: 9px;
  font-weight: 800;
  color: #4F46E5;
  background: #EEF2FF;
  border-radius: 4px;
  padding: 1px 5px;
  flex: 0 0 auto;
  animation: taskPulse 2.4s ease-in-out infinite;
}

@keyframes taskPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0); }
  50% { box-shadow: 0 0 0 3px rgba(79, 70, 229, .10); }
}

.org-mix {
  width: 32px;
  height: 4px;
  border-radius: 2px;
  overflow: hidden;
  display: flex;
  background: #EEF2F7;
  flex: 0 0 auto;
}

.org-mix i { display: block; height: 100%; transition: width .5s ease; }
.m-run { background: #22C55E; }
.m-stop { background: #F59E0B; }
.m-off { background: #CBD5E1; }

/* 车辆行 */
/* ⭐ 组织树：层级缩进 + 引导线 */
.trow {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding-right: 8px;
  padding-left: calc(var(--d, 0) * 12px + 6px);
  border-radius: 7px;
  cursor: pointer;
  transition: background .18s;
}

.trow:hover { background: #F8FAFC; }

.trow.lv1 { font-size: 12px; font-weight: 800; color: #0F172A; }
.trow.lv2 { font-size: 11.5px; font-weight: 700; color: #334155; }
.trow.lv3 { font-size: 11px; font-weight: 600; color: #475569; }
.trow.empty { opacity: .5; }

.caret {
  width: 10px;
  font-size: 9px;
  color: #CBD5E1;
  text-align: center;
  flex: 0 0 auto;
  transition: transform .26s cubic-bezier(.34, 1.4, .64, 1), color .2s;
}

.trow.open .caret { transform: rotate(90deg); color: #94A3B8; }

.lvmark { flex: 0 0 auto; border-radius: 3px; }
.lvmark.l1 { width: 9px; height: 9px; background: linear-gradient(135deg, #818CF8, #4338CA); box-shadow: 0 0 0 2px rgba(99, 102, 241, .12); }
.lvmark.l2 { width: 7px; height: 7px; background: #A5B4FC; }
.lvmark.l3 { width: 5px; height: 5px; border-radius: 50%; background: #CBD5E1; }

.tname {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tcount { font-size: 9.5px; color: #94A3B8; font-weight: 700; flex: 0 0 auto; }

.ttask {
  font-size: 9px;
  font-weight: 800;
  color: #4F46E5;
  background: #EEF2FF;
  border-radius: 4px;
  padding: 1px 4px;
  flex: 0 0 auto;
}

.tmix {
  width: 26px;
  height: 3.5px;
  border-radius: 2px;
  overflow: hidden;
  display: flex;
  background: #EEF2F7;
  flex: 0 0 auto;
}

.tmix i { display: block; height: 100%; transition: width .45s ease; }

/* 每行自己画祖先竖线 + 一条横线 */
.row-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: calc(var(--d, 0) * 12px);
  background-image: repeating-linear-gradient(to right, #C9D4E2 0 1px, transparent 1px 12px);
  background-position: 5px 0;
  pointer-events: none;
}

.row-item::after {
  content: '';
  position: absolute;
  left: calc(var(--d, 0) * 12px - 7px);
  top: 50%;
  width: 9px;
  height: 1px;
  background: #C9D4E2;
  pointer-events: none;
}

.row-item.no-guide::before,
.row-item.no-guide::after { display: none; }

/* 「还有 N 台车」折叠行 */
.more-row {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  margin: 1px 0;
  padding-right: 8px;
  font-size: 10.5px;
  font-weight: 700;
  color: #94A3B8;
  cursor: pointer;
  border-radius: 6px;
  transition: color .18s, background .18s;
}

.more-row:hover { color: #4F46E5; background: #F5F7FF; }

.more-ic {
  width: 13px;
  height: 13px;
  display: grid;
  place-items: center;
  border-radius: 4px;
  background: #EEF2FF;
  color: #4F46E5;
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
  flex: 0 0 auto;
}

.row-list { padding: 2px 0 10px; }

.row-item { position: relative; animation: rowIn .34s cubic-bezier(.22, 1, .36, 1) backwards; }

@keyframes rowIn {
  from { opacity: 0; transform: translateX(-10px); }
  to { opacity: 1; transform: none; }
}

.rowfade-move { transition: transform .3s cubic-bezier(.22, 1, .36, 1); }
.rowfade-leave-active { display: none; }

.vrow {
  margin: 1px 0;
  padding: 5px 8px 5px calc(var(--d, 0) * 12px + 19px);
  border-radius: 8px;
  cursor: pointer;
  transition: background .18s, box-shadow .2s, transform .18s;
  position: relative;
}

.vrow:hover {
  background: #F8FAFC;
  transform: translateX(2px);
}

.vrow.active {
  background: #EEF2FF;
  box-shadow: 0 0 0 1px #C7D2FE inset;
}

.vrow.noloc { opacity: .55; }

/* ⭐ 有任务的车：左侧状态色竖条（在途/待装/已到达），空闲车不加 */
.vrow.has-task::after {
  content: '';
  position: absolute;
  left: calc(var(--d, 0) * 12px + 12px);
  top: 7px;
  bottom: 7px;
  width: 3px;
  border-radius: 2px;
  background: #94A3B8;
  transition: background .2s;
}

.vrow.tone-run::after { background: #4F46E5; }
.vrow.tone-load::after { background: #D97706; }
.vrow.tone-done::after { background: #16A34A; }

.vrow.has-task .vplate { color: #0B1220; }

.vrow.has-task {
  background: linear-gradient(90deg, rgba(79, 70, 229, .028), rgba(79, 70, 229, 0) 82%);
}

.vrow.has-task:hover {
  background: #F7F8FF;
}

/* 选中的行优先显示选中底色 */
.vrow.active.has-task,
.vrow.active.has-task:hover {
  background: #EEF2FF;
}

.vr1 {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.vr2 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 10px;
  color: #64748B;
  min-width: 0;
}

.vdot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.vdot.行驶 { background: #22C55E; box-shadow: 0 0 0 2.5px rgba(34, 197, 94, .16); }
.vdot.静止 { background: #F59E0B; box-shadow: 0 0 0 2.5px rgba(245, 158, 11, .16); }
.vdot.离线 { background: #CBD5E1; }

.vplate {
  font-size: 12px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: .1px;
  white-space: nowrap;
  flex: 0 0 auto;
}

.tbadge {
  font-size: 9.5px;
  font-weight: 800;
  padding: 1px 5px;
  border-radius: 4px;
  white-space: nowrap;
  flex: 0 0 auto;
}

.tbadge.run { color: #3730A3; background: #EEF2FF; }
.tbadge.load { color: #92400E; background: #FEF3C7; }
.tbadge.done { color: #166534; background: #DCFCE7; }
.tbadge.wait { color: #475569; background: #E2E8F0; }
.tbadge.idle { color: #94A3B8; background: #F1F5F9; }

.vpct {
  margin-left: auto;
  font-size: 10px;
  font-weight: 800;
  color: #4F46E5;
  font-variant-numeric: tabular-nums;
  flex: 0 0 auto;
}

.vstat {
  margin-left: auto;
  font-size: 9.5px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  flex: 0 0 auto;
}

.vstat.行驶 { color: #166534; background: #DCFCE7; }
.vstat.静止 { color: #475569; background: #E2E8F0; }
.vstat.离线 { color: #94A3B8; background: #F1F5F9; }

.vroute {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vbar {
  width: 36px;
  height: 3px;
  border-radius: 2px;
  background: #EEF2F7;
  overflow: hidden;
  flex: 0 0 auto;
}

.vbar i {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, #6366F1, #22D3EE);
  transition: width .6s cubic-bezier(.22, 1, .36, 1);
}

.veta {
  font-size: 9.5px;
  color: #94A3B8;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  flex: 0 0 auto;
}

/* ============================================================
   ⭐ 沉浸式物流概览 HUD
   ============================================================ */
.focusfade-enter-active,
.focusfade-leave-active { transition: opacity .3s ease; }

.focusfade-enter-from,
.focusfade-leave-to { opacity: 0; }

.focus-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 90;
}

.focus-layer > * { pointer-events: auto; }

.focus-top {
  position: absolute;
  left: 16px;
  right: 16px;
  top: 14px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  animation: hudIn .46s cubic-bezier(.22, 1, .36, 1) both;
}

@keyframes hudIn {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: none; }
}

.fbtn {
  height: 32px;
  padding: 0 12px;
  border-radius: 9px;
  border: 1px solid rgba(129, 140, 248, .38);
  background: rgba(15, 24, 44, .78);
  color: #DBE4FF;
  font-size: 11.5px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-family: inherit;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: all .22s cubic-bezier(.34, 1.2, .64, 1);
  flex: 0 0 auto;
}

.fbtn:hover {
  background: rgba(35, 52, 90, .92);
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, .3);
}

.fbtn:active { transform: scale(.97); }

.fbtn.icon { padding: 0 10px; }

.fbtn.icon.on {
  border-color: rgba(34, 211, 238, .6);
  color: #A5F3FC;
}

.fbtn-txt { font-size: 11px; }

.fplate {
  height: 32px;
  padding: 0 13px;
  border-radius: 9px;
  background: rgba(15, 24, 44, .78);
  border: 1px solid rgba(129, 140, 248, .3);
  color: #E8EEFF;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .3px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  flex: 0 0 auto;
}

.fplate .live {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22D3EE;
  animation: livePulse 1.6s ease-in-out infinite;
}

@keyframes livePulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(34, 211, 238, .18); }
  50% { box-shadow: 0 0 0 6px rgba(34, 211, 238, .04); }
}

.focus-metrics {
  margin-left: auto;
  display: flex;
  gap: 7px;
  align-items: flex-start;
}

.fmetric {
  min-width: 92px;
  padding: 6px 12px;
  border-radius: 10px;
  background: rgba(15, 24, 44, .8);
  border: 1px solid rgba(129, 140, 248, .28);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  animation: metricIn .5s cubic-bezier(.22, 1, .36, 1) both;
}

.fmetric:nth-child(2) { animation-delay: .06s; }
.fmetric:nth-child(3) { animation-delay: .12s; }

@keyframes metricIn {
  from { opacity: 0; transform: translateY(-6px) scale(.96); }
  to { opacity: 1; transform: none; }
}

.fmetric .k {
  display: block;
  font-size: 9px;
  font-weight: 700;
  color: #8EA3C8;
  letter-spacing: .4px;
}

.fmetric .v {
  display: block;
  font-size: 17px;
  font-weight: 800;
  color: #F8FAFC;
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
  letter-spacing: .2px;
  transition: color .3s;
}

.fmetric .v small {
  font-size: 10px;
  color: #A9BBD8;
  font-weight: 700;
  margin-left: 2px;
}

.fmetric.accent .v {
  color: #67E8F9;
  text-shadow: 0 0 18px rgba(34, 211, 238, .5);
}

.focus-side {
  position: absolute;
  right: 16px;
  top: 104px;
  width: 188px;
  padding: 11px 13px;
  border-radius: 12px;
  background: rgba(15, 24, 44, .8);
  border: 1px solid rgba(129, 140, 248, .28);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  animation: hudIn .5s cubic-bezier(.22, 1, .36, 1) .12s both;
}

.fs-title {
  font-size: 10px;
  font-weight: 800;
  color: #8EA3C8;
  letter-spacing: .6px;
  margin-bottom: 8px;
}

.fs-timeline { position: relative; padding-left: 13px; }

.fs-timeline::before {
  content: '';
  position: absolute;
  left: 3px;
  top: 8px;
  bottom: 8px;
  width: 1px;
  background: rgba(99, 102, 241, .3);
}

.fs-node {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 3px 0;
  font-size: 10.5px;
  color: #7C8DB0;
}

.fs-dot {
  position: absolute;
  left: -13px;
  top: 7px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #33415C;
  border: 1px solid rgba(129, 140, 248, .4);
  transition: all .3s;
}

.fs-node.done .fs-dot { background: #6366F1; border-color: #818CF8; }
.fs-node.done .fs-label { color: #A9BBD8; }

.fs-node.on .fs-dot {
  background: #22D3EE;
  border-color: #67E8F9;
  box-shadow: 0 0 0 3px rgba(34, 211, 238, .18), 0 0 12px rgba(34, 211, 238, .8);
  animation: nodePulse 2s ease-in-out infinite;
}

@keyframes nodePulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(34, 211, 238, .16), 0 0 12px rgba(34, 211, 238, .7); }
  50% { box-shadow: 0 0 0 6px rgba(34, 211, 238, .06), 0 0 18px rgba(34, 211, 238, .95); }
}

.fs-node.on .fs-label { color: #E8EEFF; font-weight: 800; }

.fs-label { flex: 1; min-width: 0; }

.fs-time {
  font-size: 9px;
  color: #5F7398;
  font-variant-numeric: tabular-nums;
}

.fs-tip {
  margin-top: 9px;
  padding-top: 8px;
  border-top: 1px solid rgba(99, 102, 241, .22);
  font-size: 9.5px;
  color: #5F7398;
}

.focus-bottom {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 14px;
  padding: 11px 16px 13px;
  border-radius: 13px;
  background: rgba(15, 24, 44, .93);
  border: 1px solid rgba(129, 140, 248, .28);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  animation: hudIn .5s cubic-bezier(.22, 1, .36, 1) .18s both;
}

.fb-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 11px;
  color: #A9BBD8;
}

.fb-row b { color: #E8EEFF; font-weight: 800; }

.fb-row.sub { font-size: 10px; color: #6B7F9F; }

.fb-track {
  position: relative;
  height: 5px;
  border-radius: 3px;
  background: rgba(99, 102, 241, .2);
  margin: 9px 0 7px;
}

.fb-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 3px;
  background: linear-gradient(90deg, #4338CA, #22D3EE);
  box-shadow: 0 0 14px rgba(34, 211, 238, .5);
  transition: width .9s cubic-bezier(.22, 1, .36, 1);
}

.fb-knob {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  margin: -6px 0 0 -6px;
  border-radius: 50%;
  background: #E0F2FE;
  box-shadow: 0 0 0 3px rgba(34, 211, 238, .35), 0 0 18px rgba(34, 211, 238, .85);
  transition: left .9s cubic-bezier(.22, 1, .36, 1);
}

/* ⭐ 全屏态 */
.fullmap.is-fs {
  z-index: 2000;
  padding: 8px;
  background: #0B1220;
}

.fullmap.is-fs .map-stage { border-radius: 10px; }

/* ⭐ 沉浸态：靛青蓝底图（CSS 滤镜，稳定不依赖地图样式服务） */
.map-stage { isolation: isolate; }

.fullmap.is-focus .fm-dock { display: none; }

.fullmap.is-focus #map-container {
  filter: invert(1) hue-rotate(188deg) saturate(.5) brightness(.95) contrast(1.02);
  transition: filter .9s cubic-bezier(.4, 0, .2, 1);
}

.map-stage::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  opacity: 0;
  background: rgba(28, 48, 92, .42);
  mix-blend-mode: screen;
  transition: opacity .9s cubic-bezier(.4, 0, .2, 1);
}

.fullmap.is-focus .map-stage::after { opacity: 1; }

/* 路线层 */
.focus-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 2;
  animation: focusSvgIn .35s ease both;
}

@keyframes focusSvgIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.focus-flow {
  stroke-dasharray: 3 14;
  animation: focusFlow 1.6s linear infinite;
}

@keyframes focusFlow {
  to { stroke-dashoffset: -34; }
}

.fv-pulse-svg {
  transform-box: fill-box;
  transform-origin: center;
  animation: fvPulseSvg 2.4s ease-out infinite;
}

@keyframes fvPulseSvg {
  0% { transform: scale(.7); opacity: .7; }
  70% { transform: scale(2.6); opacity: 0; }
  100% { transform: scale(2.6); opacity: 0; }
}
</style>

<!-- ==========================================
   非 scoped：地图标记 + InfoWindow + 测距样式
   ========================================== -->
<style>
.custom-marker {
  display: flex; flex-direction: column; align-items: center; cursor: pointer;
  will-change: transform; z-index: 1;
  animation: markerDrop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
  transform: translateZ(0); backface-visibility: hidden;
  transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1), filter 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}
@keyframes markerDrop {
  from { opacity: 0; transform: translateY(-24px) scale(0.4); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.custom-marker.hovered {
  transform: scale(1.12) translateY(-2px);
  z-index: 100;
  filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.22));
}
.custom-marker.hovered .plate { transform: translateY(-3px) scale(1.04); box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22); }
.custom-marker.hovered .arrow-icon-wrap { animation-play-state: paused; }
.custom-marker .arrow-icon-wrap {
  position: relative; width: 38px; height: 38px;
  display: flex; align-items: center; justify-content: center;
  transform-origin: center center;
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  will-change: transform; transform: translateZ(0);
}
.custom-marker .arrow-icon-wrap svg { width: 38px; height: 38px; display: block; shape-rendering: geometricPrecision; overflow: visible; }
.custom-marker.status-行驶 .arrow-icon-wrap { animation: arrowBreathe 1.8s ease-in-out infinite; }
@keyframes arrowBreathe { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.12); } }
.custom-marker.status-静止 .arrow-icon-wrap { animation: parkedGlow 2.6s ease-in-out infinite; }
@keyframes parkedGlow { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.06); } }
.custom-marker.status-离线 { opacity: 0.72; transition: opacity 0.3s; }
.custom-marker.status-离线:hover, .custom-marker.status-离线.hovered { opacity: 1; }
.arrow-pulse-ring {
  position: absolute; top: 50%; left: 50%;
  width: 24px; height: 24px;
  margin-left: -12px; margin-top: -12px;
  border-radius: 50%; pointer-events: none; border: 2px solid;
}
.arrow-pulse-ring.driving { animation: arrowPulse 1.8s ease-out infinite; }
@keyframes arrowPulse { 0% { transform: scale(0.7); opacity: 0.95; } 100% { transform: scale(2.8); opacity: 0; } }
.custom-marker .plate {
  font-size: 10px; font-weight: 800; color: #0F172A;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(8px);
  padding: 2px 7px; border-radius: 5px; white-space: nowrap;
  letter-spacing: 0.3px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.16);
  margin-top: -3px;
  transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}

.amap-custom-popup {
  position: relative;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border-radius: 12px; padding: 14px 16px 12px;
  min-width: 260px; max-width: 288px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(255, 255, 255, 0.85) inset, 0 1px 0 rgba(255, 255, 255, 0.9) inset;
  border: 1px solid rgba(255, 255, 255, 0.8); color: #1E293B;
  font-family: system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  overflow: hidden; animation: popupFadeIn 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes popupFadeIn { from { opacity: 0; transform: scale(0.88) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
.amap-popup-accent { position: absolute; top: 0; left: 0; width: 100%; height: 3px; overflow: hidden; border-radius: 12px 12px 0 0; }
.amap-custom-popup.driving .amap-popup-accent { background: linear-gradient(90deg, rgba(16,185,129,0.2), rgba(16,185,129,0.55), rgba(16,185,129,0.2)); }
.amap-custom-popup.driving .amap-popup-accent::before { content: ''; position: absolute; top: 0; left: -40%; width: 40%; height: 100%; background: linear-gradient(90deg, transparent, #34D399, #10B981, transparent); box-shadow: 0 0 10px rgba(16, 185, 129, 0.95); animation: accentFlow 2s ease-in-out infinite; }
.amap-custom-popup.parked .amap-popup-accent { background: linear-gradient(90deg, rgba(245,158,11,0.2), rgba(245,158,11,0.55), rgba(245,158,11,0.2)); }
.amap-custom-popup.parked .amap-popup-accent::before { content: ''; position: absolute; top: 0; left: -40%; width: 40%; height: 100%; background: linear-gradient(90deg, transparent, #FBBF24, #F59E0B, transparent); box-shadow: 0 0 10px rgba(245, 158, 11, 0.9); animation: accentFlow 2.6s ease-in-out infinite; }
.amap-custom-popup.offline .amap-popup-accent { background: linear-gradient(90deg, rgba(100,116,139,0.2), rgba(100,116,139,0.5), rgba(100,116,139,0.2)); }
.amap-custom-popup.offline .amap-popup-accent::before { content: ''; position: absolute; top: 0; left: -40%; width: 40%; height: 100%; background: linear-gradient(90deg, transparent, #94A3B8, #64748B, transparent); animation: accentFlow 3.5s ease-in-out infinite; }
@keyframes accentFlow { 0% { left: -40%; } 100% { left: 100%; } }
.amap-popup-close { position: absolute; top: 8px; right: 10px; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 15px; color: #94A3B8; cursor: pointer; transition: all 0.25s; line-height: 1; user-select: none; z-index: 2; }
.amap-popup-close:hover { background: #F1F5F9; color: #475569; transform: rotate(90deg) scale(1.15); }
.amap-popup-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding-right: 22px; }
.amap-popup-plate { font-size: 15px; font-weight: 800; color: #0F172A; letter-spacing: 0.5px; }
.amap-popup-status { font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 4px; border: 1px solid; letter-spacing: 0.3px; }
.amap-popup-status.driving { background: #ECFDF5; color: #059669; border-color: #A7F3D0; }
.amap-popup-status.parked { background: #FFFBEB; color: #D97706; border-color: #FDE68A; }
.amap-popup-status.offline { background: #F1F5F9; color: #475569; border-color: #E2E8F0; }
.amap-popup-dayoffset { display: inline-block; font-size: 10.5px; font-weight: 700; color: #D97706; background: #FFFBEB; border: 1px solid #FDE68A; padding: 2px 8px; border-radius: 4px; margin-bottom: 8px; letter-spacing: 0.3px; }
.amap-popup-vin { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: rgba(248, 250, 252, 0.9); border: 1px solid rgba(226, 232, 240, 0.9); border-radius: 6px; margin-bottom: 10px; }
.vin-label { font-size: 10px; font-weight: 800; color: #64748B; letter-spacing: 0.8px; background: #E2E8F0; padding: 2px 6px; border-radius: 3px; flex-shrink: 0; }
.vin-value { font-family: 'Courier New', monospace; font-size: 11.5px; font-weight: 700; color: #334155; letter-spacing: 0.4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.amap-popup-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
.metric-card { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; background: linear-gradient(135deg, #ffffff 0%, #F8FAFC 100%); border: 1px solid rgba(226, 232, 240, 0.9); border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03); }
.metric-label { font-size: 10px; font-weight: 600; color: #94A3B8; letter-spacing: 0.3px; }
.metric-value { font-size: 17px; font-weight: 800; color: #0F172A; font-family: 'Courier New', monospace; line-height: 1.1; display: flex; align-items: baseline; gap: 3px; }
.metric-value small { font-size: 9.5px; font-weight: 600; color: #94A3B8; letter-spacing: 0; }
.amap-custom-popup.driving .metric-card:first-child .metric-value { color: #059669; }
.amap-custom-popup.parked .metric-card:first-child .metric-value { color: #D97706; }
.amap-popup-divider { border-top: 1px dashed rgba(203, 213, 225, 0.9); margin: 0 0 8px 0; }
.amap-popup-info { display: flex; flex-direction: column; gap: 5px; }
.amap-popup-row { display: flex; justify-content: space-between; align-items: flex-start; font-size: 12px; line-height: 1.4; }
.amap-popup-label { color: #64748B; font-weight: 500; white-space: nowrap; margin-right: 8px; flex-shrink: 0; }
.amap-popup-value { color: #0F172A; font-weight: 600; text-align: right; word-break: break-all; flex: 1; }
.amap-popup-value.mono { font-family: 'Courier New', monospace; font-size: 11px; }
.amap-popup-actions { display: flex; gap: 8px; margin-top: 12px; }
.amap-popup-btn { flex: 1; padding: 7px 0; border-radius: 16px; font-size: 11.5px; font-weight: 700; cursor: pointer; transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); background: #F1F5F9; color: #475569; border: 1px solid #E2E8F0; outline: none; font-family: inherit; position: relative; overflow: hidden; }
.amap-popup-btn::after { content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(200, 16, 46, 0.18), transparent); transition: left 0.5s ease; }
.amap-popup-btn:hover::after { left: 100%; }
.amap-popup-btn:hover { background: #FEF2F2; border-color: #FCA5A5; color: #c8102e; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(200, 16, 46, 0.15); }
.amap-popup-btn:active { transform: translateY(0) scale(0.97); }
.amap-info-close { display: none !important; }
.amap-info-sharp { display: none !important; }
.amap-info-content { padding: 0 !important; background: transparent !important; border: none !important; box-shadow: none !important; }
.amap-info-window { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }

.ranging-svg-base {
  stroke: #3B82F6;
  stroke-width: 5;
  stroke-opacity: 0.35;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 0 3px rgba(59, 130, 246, 0.7));
}
.ranging-svg-flow {
  stroke: #E0F2FE;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 10 34;
  filter: drop-shadow(0 0 5px #93C5FD) drop-shadow(0 0 10px #3B82F6);
  animation: rangingFlowMove 1.4s linear infinite;
}
@keyframes rangingFlowMove {
  from { stroke-dashoffset: 0; }
  to { stroke-dashoffset: -44; }
}

.ranging-point {
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: pointDropIn 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
  will-change: transform, opacity;
  transform: translateZ(0);
}
@keyframes pointDropIn {
  0% { opacity: 0; transform: translateY(-30px) scale(0); }
  60% { opacity: 1; transform: translateY(2px) scale(1.18); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.ranging-point-icon {
  position: relative;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
  color: #FFFFFF;
  border: 2.5px solid #FFFFFF;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(0, 0, 0, 0.06);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  letter-spacing: 0;
  line-height: 1;
  user-select: none;
  z-index: 2;
}
.ranging-point.start .ranging-point-icon {
  background: linear-gradient(135deg, #34D399, #059669);
  box-shadow: 0 3px 10px rgba(16, 185, 129, 0.45), 0 0 0 1px rgba(0, 0, 0, 0.06);
}
.ranging-point.start .ranging-point-icon::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid rgba(52, 211, 153, 0.7);
  animation: pointPulseGreen 2s ease-out infinite;
  pointer-events: none;
}
@keyframes pointPulseGreen {
  0% { transform: scale(0.85); opacity: 0.9; }
  100% { transform: scale(1.9); opacity: 0; }
}
.ranging-point.mid .ranging-point-icon {
  background: linear-gradient(135deg, #60A5FA, #3B82F6);
  box-shadow: 0 3px 10px rgba(59, 130, 246, 0.4), 0 0 0 1px rgba(0, 0, 0, 0.06);
}
.ranging-point.end .ranging-point-icon {
  background: linear-gradient(135deg, #F87171, #DC2626);
  box-shadow: 0 3px 12px rgba(220, 38, 38, 0.5), 0 0 0 1px rgba(0, 0, 0, 0.06);
  animation: endPulse 1.6s ease-in-out infinite;
}
@keyframes endPulse {
  0%, 100% { box-shadow: 0 3px 12px rgba(220, 38, 38, 0.5), 0 0 0 1px rgba(0, 0, 0, 0.06); }
  50% { box-shadow: 0 3px 16px rgba(220, 38, 38, 0.75), 0 0 0 1px rgba(0, 0, 0, 0.06); }
}

.ranging-distance-label {
  padding: 3px 9px;
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95));
  color: #FFFFFF;
  font-size: 11px;
  font-weight: 700;
  border-radius: 5px;
  white-space: nowrap;
  font-family: 'Courier New', monospace;
  letter-spacing: 0.3px;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.15);
  animation: labelPopIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
}
@keyframes labelPopIn {
  from { opacity: 0; transform: scale(0.5); }
  to { opacity: 1; transform: scale(1); }
}
.ranging-preview-label {
  padding: 2px 7px;
  background: rgba(59, 130, 246, 0.92);
  color: #FFFFFF;
  font-size: 10.5px;
  font-weight: 700;
  border-radius: 4px;
  white-space: nowrap;
  font-family: 'Courier New', monospace;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
  letter-spacing: 0.2px;
  pointer-events: none;
  animation: previewFade 0.2s ease-out;
}
@keyframes previewFade { from { opacity: 0; } to { opacity: 1; } }

.ranging-group-total {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: linear-gradient(135deg, #F59E0B, #D97706);
  color: #FFFFFF;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  font-family: 'Courier New', monospace;
  letter-spacing: 0.3px;
  box-shadow:
    0 4px 14px rgba(217, 119, 6, 0.5),
    0 0 0 2px #FFFFFF,
    0 0 0 3px rgba(217, 119, 6, 0.3);
  animation: groupTotalPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
}
.group-total-icon {
  font-size: 13px;
  font-weight: 900;
  opacity: 0.9;
  filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.6));
}
.group-total-text { letter-spacing: 0.3px; }
@keyframes groupTotalPop {
  0% { opacity: 0; transform: scale(0.4) rotate(-8deg); }
  60% { transform: scale(1.15) rotate(2deg); }
  100% { opacity: 1; transform: scale(1) rotate(0deg); }
}

/* ============================================================
   ⭐ 车辆标记上的任务徽标
   ============================================================ */
.custom-marker .marker-task {
  display: block;
  margin: 1px auto 0;
  width: fit-content;
  padding: 0 4px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 800;
  line-height: 13px;
  white-space: nowrap;
  animation: taskBadgeIn .4s cubic-bezier(.34, 1.56, .64, 1) both;
}

@keyframes taskBadgeIn {
  from { opacity: 0; transform: translateY(-4px) scale(.8); }
  to { opacity: 1; transform: none; }
}

.custom-marker .marker-task.run { color: #fff; background: rgba(79, 70, 229, .92); }
.custom-marker .marker-task.load { color: #78350F; background: rgba(253, 230, 138, .95); }
.custom-marker .marker-task.done { color: #fff; background: rgba(22, 163, 74, .92); }
.custom-marker .marker-task.wait { color: #fff; background: rgba(100, 116, 139, .92); }

/* ============================================================
   ⭐ 气泡内：任务区（只有有任务的车才有）
   ============================================================ */
.amap-custom-popup.has-task { max-width: 300px; }

.amap-popup-vin-inline {
  margin-left: auto;
  font-size: 9px;
  color: #B6C2D2;
  font-weight: 600;
  letter-spacing: .2px;
  white-space: nowrap;
}

.amap-popup-task {
  margin-top: 10px;
  padding: 10px 11px 11px;
  border-radius: 10px;
  background: linear-gradient(180deg, #FBFCFF, #F6F8FF);
  border: 1px solid #E8ECFB;
  animation: taskBlockIn .36s cubic-bezier(.22, 1, .36, 1) both;
}

@keyframes taskBlockIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}

.apt-route {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 800;
  color: #0F172A;
  min-width: 0;
}

.apt-place {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.apt-arrow { color: #A5B4FC; flex: 0 0 auto; }

.apt-bar {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 7px;
}

.apt-badge {
  font-size: 9.5px;
  font-weight: 800;
  padding: 1px 6px;
  border-radius: 4px;
  flex: 0 0 auto;
}

.apt-badge.run { color: #3730A3; background: #EEF2FF; }
.apt-badge.load { color: #92400E; background: #FEF3C7; }
.apt-badge.done { color: #166534; background: #DCFCE7; }
.apt-badge.wait { color: #475569; background: #E2E8F0; }

.apt-track {
  flex: 1;
  height: 5px;
  border-radius: 3px;
  background: #E8ECFB;
  overflow: hidden;
}

.apt-track i {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #6366F1, #22D3EE);
  transition: width .8s cubic-bezier(.22, 1, .36, 1);
}

.apt-pct {
  font-size: 10px;
  font-weight: 800;
  color: #4F46E5;
  font-variant-numeric: tabular-nums;
  flex: 0 0 auto;
}

.apt-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
  font-size: 10px;
  color: #64748B;
}

.apt-meta b { color: #334155; font-weight: 800; }

.apt-go {
  width: 100%;
  margin-top: 9px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #4F46E5, #3730A3);
  color: #fff;
  font-size: 11.5px;
  font-weight: 800;
  letter-spacing: .3px;
  cursor: pointer;
  font-family: inherit;
  box-shadow: 0 8px 18px rgba(79, 70, 229, .28);
  transition: all .22s cubic-bezier(.34, 1.2, .64, 1);
}

.apt-go:hover {
  filter: brightness(1.06);
  transform: translateY(-1px);
  box-shadow: 0 10px 22px rgba(79, 70, 229, .38);
}

.apt-go:active { transform: scale(.98); }

.amap-popup-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px 12px;
  padding-top: 2px;
}

.pg-item {
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
  font-size: 10px;
}

.pg-item span { color: #94A3B8; flex: 0 0 auto; }

.pg-item b {
  color: #334155;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.amap-popup-actions.compact {
  gap: 6px;
  padding-top: 8px;
}

.amap-popup-iconbtn {
  width: 28px;
  height: 26px;
  border-radius: 7px;
  border: 1px solid #E2E8F0;
  background: #fff;
  color: #64748B;
  font-size: 13px;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: all .2s;
}

.amap-popup-iconbtn:hover {
  color: #C8102E;
  border-color: #FCA5A5;
  background: #FEF2F2;
}

/* ============================================================
   ⭐ 沉浸态：地图上的车辆 / 起终点 / 流光
   ============================================================ */
.focus-vehicle {
  position: relative;
  width: 18px;
  height: 18px;
}

.fv-pulse {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 14px;
  height: 14px;
  margin: -7px 0 0 -7px;
  border-radius: 50%;
  background: rgba(34, 211, 238, .55);
  animation: fvPulse 2.2s ease-out infinite;
}

@keyframes fvPulse {
  0% { transform: scale(.6); opacity: .85; }
  70% { transform: scale(3.4); opacity: 0; }
  100% { transform: scale(3.4); opacity: 0; }
}

.fv-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1.5px solid rgba(103, 232, 249, .85);
  box-shadow: 0 0 14px rgba(34, 211, 238, .9);
}

.fv-core {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 8px;
  height: 8px;
  margin: -4px 0 0 -4px;
  border-radius: 50%;
  background: #E0F2FE;
  box-shadow: 0 0 0 2px rgba(14, 165, 233, .55);
}

.fv-name {
  position: absolute;
  left: 50%;
  top: -20px;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 800;
  color: #E0F2FE;
  white-space: nowrap;
  text-shadow: 0 2px 8px rgba(0, 0, 0, .8);
}

.focus-endpoint {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2.5px solid var(--c, #818CF8);
  background: #0B1220;
  box-shadow: 0 0 14px color-mix(in srgb, var(--c, #818CF8) 60%, transparent);
  animation: endIn .5s cubic-bezier(.34, 1.56, .64, 1) both;
}

@keyframes endIn {
  from { opacity: 0; transform: scale(.3); }
  to { opacity: 1; transform: scale(1); }
}

.focus-comet {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #F0FDFF;
  box-shadow: 0 0 10px 3px rgba(103, 232, 249, .9), 0 0 26px 8px rgba(34, 211, 238, .55);
}

/* ⭐ 全屏：去掉外壳的 transform，position:fixed 才相对视口 */
.content-wrapper:has(.fullmap.is-fs) {
  transform: none !important;
  animation: none !important;
  overflow: visible !important;
}
</style>