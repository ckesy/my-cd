<template>
  <div class="fullmap">
    <div class="map-stage">
      <div id="map-container" class="map-container"></div>

      <svg ref="rangingSvgRef" class="ranging-svg" xmlns="http://www.w3.org/2000/svg"></svg>

      <div class="top-bar">
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
      <div class="floating-sidebar" :class="{ collapsed: isListCollapsed }"
        :style="{ width: isListCollapsed ? '44px' : listWidth + 'px' }">
        <div class="sidebar-content" :class="{ 'is-hidden': isListCollapsed }">

          <div class="sidebar-filter">
            <el-select v-model="selectedOrg" placeholder="请选择组织机构" size="small" style="width: 100%;" clearable>
              <el-option label="全部车队" value=""></el-option>
              <el-option v-for="org in orgOptions" :key="org" :label="org" :value="org"></el-option>
            </el-select>
            <el-select v-model="selectedStatus" placeholder="请选择车辆状态" size="small" style="width: 100%; margin-top: 8px;"
              clearable>
              <el-option v-for="s in statusOptions" :key="s" :label="s" :value="s"></el-option>
            </el-select>
            <div class="search-row">
              <el-input v-model="searchKeyword" placeholder="车牌/昵称/车架" size="small" clearable>
                <template #prefix><el-icon><Search /></el-icon></template>
              </el-input>
            </div>
            <div class="filter-buttons">
              <el-button size="small" class="btn-reset" @click="resetAll">
                <el-icon><RefreshRight /></el-icon> 重置
              </el-button>
              <el-button size="small" type="primary" class="btn-search" @click="handleSearch">
                <el-icon><Search /></el-icon> 搜索
              </el-button>
            </div>
          </div>

          <div class="sidebar-list-header">
            <el-icon class="list-icon"><Van /></el-icon>
            <span class="header-title">{{ rootNodeName }}</span>
            <span class="list-count">({{ visibleVehicleCount }})</span>
            <div class="collapse-btn" @click.stop="toggleList" title="收起">
              <el-icon class="collapse-icon"><ArrowLeft /></el-icon>
            </div>
          </div>

          <div class="sidebar-tree" v-loading="treeLoading" element-loading-text="加载中…">
            <el-tree v-if="displayTreeData.length > 0" ref="orgTreeRef" :data="displayTreeData" node-key="key"
              :props="{ children: 'children', label: 'label' }" :default-expand-all="true" :expand-on-click-node="false"
              highlight-current :indent="0" class="org-tree">
              <template #default="{ data }">
                <!-- 车辆节点 -->
                <div v-if="data.type === 'vehicle'" class="tree-node tree-node-vehicle"
                  :class="{ active: isVehicleHighlighted(data.plate), 'no-loc': !data.hasLocation }"
                  :style="{ paddingLeft: (data.level || 0) * 18 + 'px' }" @click.stop="highlightVehicle(data.plate)">
                  <span class="vehicle-plate">{{ data.label }}</span>
                  <span class="vehicle-status-tag" :class="data.status">{{ data.status }}</span>
                </div>

                <!-- 组织节点 -->
                <div v-else class="tree-node tree-node-org" :class="'type-' + data.type"
                  :style="{ paddingLeft: (data.level || 0) * 18 + 'px' }">
                  <span class="org-label">{{ data.label }}</span>
                  <span class="org-count" :class="{ empty: data.vehicleCount === 0 }">
                    ({{ data.vehicleCount }})
                  </span>
                </div>
              </template>
            </el-tree>

            <div v-if="visibleVehicleCount === 0" class="list-empty">
              <el-icon><Search /></el-icon>
              <span>无匹配车辆</span>
            </div>
          </div>
        </div>

        <div class="sidebar-collapsed" :class="{ 'is-visible': isListCollapsed }">
          <div class="collapse-btn-vertical" @click.stop="toggleList" title="展开">
            <el-icon class="collapse-icon"><ArrowRight /></el-icon>
          </div>
        </div>

        <div class="resizer" v-show="!isListCollapsed" @mousedown="startResize"></div>
      </div>

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
import { ref, computed, onMounted, onBeforeUnmount, onActivated, nextTick, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Van, Refresh, Search, RefreshRight,
  ArrowLeft, ArrowRight, WarningFilled,
  Brush, Aim, Guide, Position,
} from '@element-plus/icons-vue'
import AMapLoader from '@amap/amap-jsapi-loader'
import { supabase } from '@/utils/supabase'
import dayjs from 'dayjs'

const AMAP_KEY = '273f5c474604b71906674aac159b8f45'
const DONGFENG_API_URL = 'https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com/dongfeng-lostlocation'

const CONCURRENCY = 15
const CACHE_TTL = 3 * 60 * 1000

// ============================================================
// ⭐ 当前登录用户 & 权限判断（必须先定义）
// ============================================================
const currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('currentUser') || '{}') }
  catch { return {} }
})()

const isAdmin = currentUser.role === 'admin'
const isCustomer = currentUser.role === 'customer'

// ⭐ 缓存 key（用函数动态生成，避免时机问题）
const getCacheKey = () => {
  if (isAdmin) return 'fullmap_vehicle_locations_cache_admin'
  if (currentUser.isSubAccount) return 'fullmap_vehicle_locations_cache_sub_' + (currentUser.account || 'unknown')
  return 'fullmap_vehicle_locations_cache_cust_' + (currentUser.account || 'guest')
}

// ⭐ 主账号信息
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
// ⭐ 客户 ID & 子账号所属组织名
// ============================================================
const myCustomerId = ref(currentUser.customerId || null)
const myOrgName = ref(null)

const loadMyCustomerId = async () => {
  if (!isCustomer) return
  // 优先用 currentUser.customerId
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

const loadMyOrgName = async () => {
  if (!isCustomer) return
  if (!currentUser.isSubAccount) return
  if (!currentUser.orgId) return
  try {
    const { data } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', currentUser.orgId)
      .maybeSingle()
    if (data) myOrgName.value = data.name
  } catch (e) {
    console.warn('查询所属组织失败:', e)
  }
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
    // ⭐⭐⭐ 客户视角必须有 myCustomerId，否则返回空（防止查全量）
    if (isCustomer && !myCustomerId.value) {
      console.warn('[FullMap] 客户账号未关联 customers，返回空防止越权')
      vehicles.value = []
      orgOptions.value = []
      return
    }

    let query = supabase.from('vehicles').select('*').order('updated_at', { ascending: false })

    if (isCustomer) {
      query = query.eq('customer_id', myCustomerId.value)

      // ⭐⭐⭐ 子账号：只显示所属组织下的车辆
      if (currentUser.isSubAccount && myOrgName.value) {
        query = query.eq('org', myOrgName.value)
      }
      // 子账号但没查到组织名 → 返回空（防越权）
      if (currentUser.isSubAccount && !myOrgName.value) {
        console.warn('[FullMap] 子账号组织未查到，返回空')
        vehicles.value = []
        orgOptions.value = []
        return
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
    if (isCustomer && myCustomerId.value) q = q.eq('customer_id', myCustomerId.value)
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

// ⭐ 加载组织：用主账号的 account
const loadOrganizations = async () => {
  try {
    let q = supabase.from('organizations').select('*').order('id')
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
      plugins: ['AMap.Geocoder', 'AMap.TileLayer.Satellite', 'AMap.TileLayer.RoadNet'],
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
    map.on('zoomchange', updateAllSvgLines)
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
    const marker = new AMap.Marker({
      position: [v.lng, v.lat],
      content: container,
      offset: new AMap.Pixel(-19, -19),
      zIndex: 1,
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

const openPopup = (vehicle, marker) => {
  highlightedPlate.value = vehicle.plate
  highlightMarker(marker)
  let statusClass = 'offline'
  if (vehicle.status === '行驶') statusClass = 'driving'
  else if (vehicle.status === '静止') statusClass = 'parked'
  let dayOffsetText = ''
  if (vehicle.dayOffset === 1) dayOffsetText = '📅 昨天的数据'
  else if (vehicle.dayOffset === 2) dayOffsetText = '📅 前天的数据'
  const html = `
    <div class="amap-custom-popup ${statusClass}">
      <div class="amap-popup-accent"></div>
      <div class="amap-popup-close">×</div>
      <div class="amap-popup-header">
        <span class="amap-popup-plate">${vehicle.plate || '--'}</span>
        <span class="amap-popup-status ${statusClass}">${vehicle.status}</span>
      </div>
      ${dayOffsetText ? `<div class="amap-popup-dayoffset">${dayOffsetText}</div>` : ''}
      <div class="amap-popup-vin">
        <span class="vin-label">VIN</span>
        <span class="vin-value">${vehicle.vin || '--'}</span>
      </div>
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
      <div class="amap-popup-divider"></div>
      <div class="amap-popup-info">
        <div class="amap-popup-row"><span class="amap-popup-label">所属机构</span><span class="amap-popup-value">${vehicle.org || '--'}</span></div>
        <div class="amap-popup-row"><span class="amap-popup-label">司机</span><span class="amap-popup-value">${vehicle.driver || '--'}</span></div>
        <div class="amap-popup-row"><span class="amap-popup-label">燃料类型</span><span class="amap-popup-value">${vehicle.fuel_type || '--'}</span></div>
        <div class="amap-popup-row"><span class="amap-popup-label">行驶方向</span><span class="amap-popup-value">${(vehicle.direction ?? 0)}°</span></div>
        <div class="amap-popup-row"><span class="amap-popup-label">ACC状态</span><span class="amap-popup-value">${vehicle.accStatus || '--'}</span></div>
        <div class="amap-popup-row"><span class="amap-popup-label">上报时间</span><span class="amap-popup-value mono">${vehicle.reportTime || '--'}</span></div>
        <div class="amap-popup-row"><span class="amap-popup-label">当前位置</span><span class="amap-popup-value mono">${vehicle.location || '--'}</span></div>
      </div>
      <div class="amap-popup-actions">
        <button class="amap-popup-btn" data-action="track">实时跟踪</button>
        <button class="amap-popup-btn" data-action="playback">轨迹回放</button>
      </div>
    </div>
  `
  infoWindow.setContent(html)
  infoWindow.open(map, marker.getPosition())
  setTimeout(() => {
    const closeBtn = document.querySelector('.amap-popup-close')
    if (closeBtn) closeBtn.onclick = closePopup
    document.querySelectorAll('.amap-popup-btn').forEach(btn => {
      btn.onclick = () => {
        const action = btn.getAttribute('data-action')
        ElMessage.info(action === 'track' ? '实时跟踪功能开发中' : '轨迹回放功能开发中')
      }
    })
  }, 50)
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
  return vehicles.value.filter(v => {
    if (statusFilter.value !== 'all' && v.status !== statusFilter.value) return false
    if (selectedOrg.value) {
      const org = v.org || v.customer_name || ''
      if (org !== selectedOrg.value) return false
    }
    if (selectedStatus.value && v.status !== selectedStatus.value) return false
    if (searchKeyword.value) {
      const kw = searchKeyword.value.trim().toLowerCase()
      const haystack = `${v.plate || ''} ${v.nickname || ''} ${v.vin || ''}`.toLowerCase()
      if (!haystack.includes(kw)) return false
    }
    return true
  })
})

const visibleVehicleCount = computed(() => filteredVehicles.value.length)

const buildVehicleNode = (v, level = 0) => ({
  key: 'vehicle-' + (v.id || v.plate),
  type: 'vehicle',
  label: v.plate || '--',
  plate: v.plate,
  status: v.status,
  hasLocation: v.hasLocation,
  vehicle: v,
  level,
})

const displayTreeData = computed(() => {
  const list = filteredVehicles.value
  const orgs = organizations.value

  const orgVehiclesMap = {}
  const rootLevelVehicles = []
  const unassigned = []

  list.forEach(v => {
    const orgName = v.org || v.customer_name || ''
    if (!orgName) {
      unassigned.push(v)
    } else if (orgName === rootNodeName) {
      rootLevelVehicles.push(v)
    } else {
      if (!orgVehiclesMap[orgName]) orgVehiclesMap[orgName] = []
      orgVehiclesMap[orgName].push(v)
    }
  })

  const buildOrgChildren = (parentId, level = 0) => {
    const childOrgs = orgs.filter(o => o.parent_id === parentId)
    const nodes = []
    let total = 0
    childOrgs.forEach(o => {
      const sub = buildOrgChildren(o.id, level + 1)
      const ownVehicles = sortByStatusPriority(orgVehiclesMap[o.name] || [])
      const vehicleNodes = ownVehicles.map(v => buildVehicleNode(v, level))
      const count = sub.total + vehicleNodes.length
      total += count
      if (count > 0) {
        nodes.push({
          key: 'org-' + o.id,
          type: 'org',
          label: o.name,
          vehicleCount: count,
          level,
          children: [...sub.nodes, ...vehicleNodes],
        })
      }
    })
    return { nodes, total }
  }

  const root = buildOrgChildren(null, 1)

  const rootVehicleNodes = sortByStatusPriority(rootLevelVehicles).map(v => buildVehicleNode(v, 0))
  const unassignedNodes = sortByStatusPriority(unassigned).map(v => buildVehicleNode(v, 0))

  return [{
    key: 'root',
    type: 'root',
    label: rootNodeName,
    vehicleCount: list.length,
    level: 0,
    children: [...root.nodes, ...unassignedNodes, ...rootVehicleNodes],
  }]
})

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

const updateMarkersVisibility = () => {
  if (!map) return
  const visiblePlates = new Set(filteredVehicles.value.filter(v => v.hasLocation).map(v => v.plate))
  markerMap.forEach((marker, plate) => {
    const shouldVisible = visiblePlates.has(plate)
    if (typeof marker.setVisible === 'function') marker.setVisible(shouldVisible)
  })
  if (highlightedPlate.value && !visiblePlates.has(highlightedPlate.value)) {
    closePopup()
  }
}

watch([selectedOrg, selectedStatus, searchKeyword, selectedPlates, statusFilter], () => {
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
  if (isCustomer) {
    await loadMyCustomerId()
    await loadMyOrgName()
  }
  // ⭐ 每次进入 FullMap 都强制重新拉（跳过缓存）
  await loadVehicles(true)
  await initMap()
  document.body.style.overflow = 'hidden'
  document.documentElement.style.overflow = 'hidden'
})

onActivated(async () => {
  if (isCustomer && !myCustomerId.value) await loadMyCustomerId()

  // ⭐ 每次都重新加载组织名（组织名可能被主账号改过）
  if (isCustomer && currentUser.isSubAccount) {
    await loadMyOrgName()
  }

  // ⭐⭐⭐ 每次切回来都重新拉车辆（跳过缓存，确保看到最新组织分配）
  await loadVehicles(true)

  await loadOrganizations()

  if (isMapReady.value) {
    addMarkers()
    updateMarkersVisibility()
  }
})

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
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
  height: 100vh;
  height: 100dvh;
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
.floating-sidebar {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 60;
  height: calc(100% - 32px);
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.6) inset;
  overflow: hidden;
  transition:
    width 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
    height 0.35s cubic-bezier(0.4, 0, 0.2, 1),
    border-radius 0.3s;
  min-width: 44px;
  will-change: width, height;
}
.floating-sidebar.collapsed {
  height: 56px;
  border-radius: 999px;
}

.sidebar-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition:
    opacity 0.24s cubic-bezier(0.4, 0, 0.2, 1),
    visibility 0s linear 0.24s;
  will-change: opacity;
  visibility: visible;
  opacity: 1;
}
.sidebar-content.is-hidden {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition:
    opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    visibility 0s linear 0s;
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
  z-index: 200;
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
</style>