<template>
  <div class="fullmap">
    <div class="map-stage">
      <div id="map-container" class="map-container"></div>

      <!-- ============ 顶部胶囊统计条 ============ -->
      <div class="floating-stats">
        <div class="stats-pills">
          <div class="stat-pill" :class="{ active: statusFilter === 'all' }" @click="setStatusFilter('all')">
            <span class="pill-dot total-dot"></span>
            <span class="pill-value">{{ totalCount }}</span>
            <span class="pill-label">全部</span>
          </div>
          <div class="stat-pill" :class="{ active: statusFilter === '在线' }" @click="setStatusFilter('在线')">
            <span class="pill-dot online-dot"></span>
            <span class="pill-value">{{ onlineCount }}</span>
            <span class="pill-label">在线</span>
          </div>
          <div class="stat-pill" :class="{ active: statusFilter === '离线' }" @click="setStatusFilter('离线')">
            <span class="pill-dot offline-dot"></span>
            <span class="pill-value">{{ offlineCount }}</span>
            <span class="pill-label">离线</span>
          </div>
          <div class="stat-pill" :class="{ active: statusFilter === 'located' }" @click="setStatusFilter('located')">
            <span class="pill-dot located-dot"></span>
            <span class="pill-value">{{ locatedCount }}</span>
            <span class="pill-label">已定位</span>
          </div>
        </div>

        <el-button class="refresh-btn" @click="refreshLocations" :loading="loadingVehicles" size="small">
          <el-icon :class="{ 'icon-spin': loadingVehicles }"><Refresh /></el-icon>
          刷新定位
        </el-button>
      </div>

      <!-- ============ 悬浮左侧车辆列表 ============ -->
      <div class="floating-sidebar" :class="{ collapsed: isListCollapsed }"
        :style="{ width: isListCollapsed ? '44px' : listWidth + 'px' }">
        <div v-show="!isListCollapsed" class="sidebar-content">
          <div class="sidebar-filter">
            <el-select v-model="selectedOrg" placeholder="请选择组织机构" size="small" style="width: 100%;" clearable>
              <el-option label="全部车队" value=""></el-option>
              <el-option v-for="org in orgOptions" :key="org" :label="org" :value="org"></el-option>
            </el-select>
            <el-select v-model="selectedStatus" placeholder="请选择作业状态" size="small" style="width: 100%; margin-top: 8px;" clearable>
              <el-option v-for="s in statusOptions" :key="s" :label="s" :value="s"></el-option>
            </el-select>
            <el-input :value="searchKeyword" placeholder="点击搜索车辆" size="small" readonly class="search-trigger"
              style="margin-top: 8px;" @click="openDialog" clearable @clear="searchKeyword = ''; tempSearchKeyword = ''">
              <template #prefix><el-icon><Search /></el-icon></template>
            </el-input>
            <div class="filter-buttons">
              <el-button size="small" class="btn-reset" @click="resetAll">
                <el-icon><RefreshRight /></el-icon> 重置
              </el-button>
              <el-button size="small" type="primary" class="btn-search" @click="openDialog">
                <el-icon><Search /></el-icon> 搜索
              </el-button>
            </div>
          </div>

          <div class="sidebar-list-header">
            <el-icon class="list-icon"><Van /></el-icon>
            <span>车辆列表</span>
            <span class="list-count">({{ filteredVehicles.length }})</span>
            <div class="collapse-btn" @click.stop="toggleList" title="收起">
              <el-icon><ArrowLeft /></el-icon>
            </div>
          </div>

          <div class="sidebar-list">
            <transition-group name="list-item">
              <div v-for="v in filteredVehicles" :key="v.plate" class="vehicle-item"
                :class="{ active: isVehicleHighlighted(v.plate), 'no-loc': !v.hasLocation }"
                @click="highlightVehicle(v.plate)">
                <span class="vehicle-status-dot" :class="v.status"></span>
                <span class="vehicle-plate">{{ v.plate }}</span>
                <span class="vehicle-vin">({{ v.vin ? v.vin.slice(-6) : '----' }})</span>
                <span class="vehicle-status-tag" :class="v.status">{{ v.status }}</span>
              </div>
            </transition-group>
            <div v-if="filteredVehicles.length === 0" class="list-empty">
              <el-icon><Search /></el-icon>
              <span>无匹配车辆</span>
            </div>
          </div>
        </div>

        <div v-show="isListCollapsed" class="sidebar-collapsed">
          <div class="collapse-btn-vertical" @click.stop="toggleList" title="展开">
            <el-icon><ArrowRight /></el-icon>
          </div>
        </div>

        <div class="resizer" v-show="!isListCollapsed" @mousedown="startResize"></div>
      </div>

      <!-- 加载遮罩 -->
      <transition name="fade">
        <div v-if="!isMapReady || loadingVehicles" class="map-loading-overlay">
          <div class="loading-card">
            <div class="loading-ring">
              <svg viewBox="0 0 100 100" width="72" height="72">
                <circle cx="50" cy="50" r="42" class="ring-track" />
                <circle cx="50" cy="50" r="42" class="ring-progress"
                  :style="{ strokeDashoffset: ringOffset }" />
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

    <!-- 搜索弹窗 -->
    <el-dialog v-model="dialogVisible" title="搜索车辆" width="450px" :close-on-click-modal="false"
      @close="cancelSearch" class="vehicle-dialog">
      <div class="dialog-search-row">
        <el-input v-model="tempSearchKeyword" placeholder="输入车牌号模糊搜索" clearable style="flex:1;">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-button type="primary" size="default" class="btn-primary" @click="selectAll">
          {{ dialogFilteredVehicles.every(v => tempSelectedPlates.includes(v.plate)) ? '取消全选' : '全选' }}
        </el-button>
      </div>
      <div class="dialog-list">
        <el-checkbox-group v-model="tempSelectedPlates">
          <div v-for="v in dialogFilteredVehicles" :key="v.plate" class="dialog-item">
            <el-checkbox :label="v.plate">{{ v.plate }}</el-checkbox>
          </div>
        </el-checkbox-group>
        <div v-if="dialogFilteredVehicles.length === 0" class="dialog-empty">暂无匹配车辆</div>
      </div>
      <template #footer>
        <el-button @click="cancelSearch">取消</el-button>
        <el-button type="primary" class="btn-primary" @click="confirmSearch">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Van, Position, Location, Aim, Refresh, Search, RefreshRight,
  ArrowLeft, ArrowRight, WarningFilled
} from '@element-plus/icons-vue'
import AMapLoader from '@amap/amap-jsapi-loader'
import { supabase } from '@/utils/supabase'
import dayjs from 'dayjs'

const AMAP_KEY = '273f5c474604b71906674aac159b8f45'
const DONGFENG_API_URL = '/api-dongfeng/locationData'
const DONGFENG_TOKEN = '8e0f08a758a64451b8791f47bd716ccd'
const DONGFENG_LOGIS_NAME = 'cihon_rainbow'

const orgOptions = ref([])
const selectedOrg = ref('')
const statusOptions = ref(['在线', '离线'])
const selectedStatus = ref('')
const searchKeyword = ref('')
const loadingVehicles = ref(false)
const statusFilter = ref('all')

const vehicles = ref([])
const isMapReady = ref(false)
const locationProgress = ref(0)
const locationTotal = ref(0)
const locatedCount = ref(0)

const totalCount = computed(() => vehicles.value.length)
const onlineCount = computed(() => vehicles.value.filter(v => v.status === '在线').length)
const offlineCount = computed(() => vehicles.value.filter(v => v.status === '离线').length)
const loadPercent = computed(() => {
  if (locationTotal.value === 0) return 0
  return Math.min(100, (locationProgress.value / locationTotal.value) * 100)
})

const RING_LENGTH = 263.89
const ringOffset = computed(() => RING_LENGTH * (1 - loadPercent.value / 100))

const getTimeValue = (record) => {
  const candidates = [
    'time', 'reportTime', 'gpsTime', 'createTime', 'updateTime',
    'locTime', 'timestamp', 'ts', 'reportTimeStr', 'gpsTimeStr',
    'locationTime', 'positionTime', 'lastTime', 'accTime',
  ]
  for (const key of candidates) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
      const t = new Date(record[key]).getTime()
      if (!isNaN(t)) return t
    }
  }
  return 0
}

const isAccOn = (accStatus) => {
  if (accStatus === undefined || accStatus === null || accStatus === '') return false
  const s = String(accStatus).trim()
  if (s.includes('开')) return true
  if (s.includes('关')) return false
  const lower = s.toLowerCase()
  return ['1', 'true', 'on', 'open', 'yes', 'y'].includes(lower)
}

const fetchDongfengLocation = async (vin) => {
  if (!vin || vin.length < 8) return { success: false, reason: 'VIN 长度不足' }
  const chassisNo = vin.slice(-8)
  const now = dayjs()
  const payload = {
    chassisNo,
    token: DONGFENG_TOKEN,
    startTime: now.subtract(1, 'hour').format('YYYY-MM-DD HH:mm:ss'),
    endTime: now.add(1, 'hour').format('YYYY-MM-DD HH:mm:ss'),
    logisName: DONGFENG_LOGIS_NAME,
  }
  try {
    const response = await fetch(DONGFENG_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const result = await response.json()
    let records = result?.data || result?.list || result?.rows || result?.result || result?.records || []
    if (!Array.isArray(records)) records = records ? [records] : []
    if (records.length === 0) return { success: false, reason: '无定位数据' }
    const sorted = [...records].sort((a, b) => getTimeValue(b) - getTimeValue(a))
    const latest = sorted[0]
    const lng = parseFloat(latest.lng ?? latest.longitude ?? latest.lon)
    const lat = parseFloat(latest.lat ?? latest.latitude)
    if (!lng || !lat || isNaN(lng) || isNaN(lat)) return { success: false, reason: '经纬度无效' }
    const accStatus = latest.accStatus ?? latest.acc ?? latest.accState ?? ''
    const online = isAccOn(accStatus)
    const timeVal = getTimeValue(latest)
    const reportTime = timeVal > 0 ? dayjs(timeVal).format('YYYY-MM-DD HH:mm:ss') : '--'
    const direction = parseFloat(latest.direction ?? latest.dir ?? latest.course ?? latest.heading ?? 0) || 0
    const speed = parseFloat(latest.speed ?? latest.spd ?? 0) || 0
    const rpm = parseFloat(latest.rpm ?? latest.speedRpm ?? latest.engineRpm ?? 0) || 0
    const fuelRemaining = parseFloat(latest.fuel ?? latest.oil ?? latest.fuelRemaining ?? latest.fuelAmount ?? latest.oilMass ?? 0) || 0
    const locationText = latest.address || latest.location || latest.formattedAddress || latest.addr || (online ? '行驶中' : '静止')
    return { success: true, lng, lat, online, accStatus: String(accStatus || '--'), reportTime, locationText, direction, speed, rpm, fuelRemaining }
  } catch (err) {
    console.warn(`获取车辆 ${vin} 定位失败：`, err.message)
    return { success: false, reason: err.message }
  }
}

// ============================================================
// 加载车辆（含按当前登录客户过滤）
// ============================================================
const loadVehicles = async () => {
  loadingVehicles.value = true
  locationProgress.value = 0
  locationTotal.value = 0
  locatedCount.value = 0
  try {
    // 读取当前登录用户
    let currentUser = null
    try {
      currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null')
    } catch {}

    // 构造查询
    let query = supabase.from('vehicles').select('*').order('updated_at', { ascending: false })

    // 客户只显示自己名下的车辆
    if (currentUser?.role === 'customer' && currentUser?.customerId) {
      query = query.eq('customer_id', currentUser.customerId)
    }

    const { data, error } = await query
    if (error) throw error

    if (!data || data.length === 0) {
      vehicles.value = []
      orgOptions.value = []
      if (currentUser?.role === 'customer') {
        ElMessage.warning('您的账户下暂无车辆，请联系管理员分配')
      } else {
        ElMessage.warning('车辆档案为空，请先去「车辆档案」页面创建车辆')
      }
      return
    }

    locationTotal.value = data.length
    const enriched = new Array(data.length)
    const concurrency = 5
    let index = 0
    const worker = async () => {
      while (index < data.length) {
        const i = index++
        const item = data[i]
        const loc = await fetchDongfengLocation(item.vin)
        if (loc.success) {
          locatedCount.value++
          enriched[i] = {
            ...item,
            status: loc.online ? '在线' : '离线',
            accStatus: loc.accStatus,
            reportTime: loc.reportTime,
            lng: loc.lng,
            lat: loc.lat,
            hasLocation: true,
            location: loc.locationText,
            direction: loc.direction,
            speed: loc.speed,
            rpm: loc.rpm,
            fuelRemaining: loc.fuelRemaining,
          }
        } else {
          enriched[i] = {
            ...item,
            status: '离线',
            accStatus: '--',
            reportTime: '--',
            lng: null,
            lat: null,
            hasLocation: false,
            location: '定位获取失败',
            direction: 0,
            speed: 0,
            rpm: 0,
            fuelRemaining: 0,
          }
        }
        locationProgress.value++
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, data.length) }, () => worker()))
    vehicles.value = enriched.filter(Boolean)

    // 收集组织/车队选项
    const orgSet = new Set()
    vehicles.value.forEach(v => {
      const org = v.org || v.customer_name || v.nickname
      if (org) orgSet.add(org)
    })
    orgOptions.value = Array.from(orgSet)
  } catch (e) {
    console.error('加载车辆失败：', e)
    ElMessage.error('加载车辆失败：' + e.message)
  } finally {
    loadingVehicles.value = false
  }
}

const refreshLocations = async () => {
  await loadVehicles()
  if (isMapReady.value) {
    addMarkers()
    updateMarkersVisibility()
  }
}

// ============================================================
// 地图
// ============================================================
let map = null
let markers = []
let markerMap = new Map()
let infoWindow = null

const highlightedPlate = ref(null)
let hoveredMarker = null

const initMap = async () => {
  try {
    const AMap = await AMapLoader.load({
      key: AMAP_KEY,
      version: '2.0',
      plugins: ['AMap.Geocoder'],
    })

    map = new AMap.Map('map-container', {
      zoom: 5,
      center: [107, 33],
      mapStyle: 'amap://styles/fresh',
      viewMode: '2D',
      features: ['bg', 'road', 'building', 'point'],
    })

    infoWindow = new AMap.InfoWindow({
      isCustom: true,
      offset: new AMap.Pixel(0, -46),
      autoMove: true,
      closeWhenClickMap: true,
    })

    addMarkers()
    isMapReady.value = true
    updateMarkersVisibility()
  } catch (err) {
    ElMessage.error('地图加载失败：' + err.message)
    console.error(err)
  }
}

const getTruckSVG = (isOnline) => {
  const fillColor = isOnline ? '#10B981' : '#1F2937'
  return `
    <svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="truckShadow_${isOnline ? 'on' : 'off'}" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="rgba(0,0,0,0.3)"/>
        </filter>
      </defs>
      <g filter="url(#truckShadow_${isOnline ? 'on' : 'off'})">
        <rect x="11" y="6" width="14" height="24" rx="3" ry="3" fill="${fillColor}" stroke="#ffffff" stroke-width="1.5"/>
        <path d="M 12 6 L 24 6 L 22 2 L 14 2 Z" fill="${fillColor}" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>
        <rect x="13.5" y="8" width="9" height="3" rx="1" fill="rgba(255,255,255,0.4)"/>
        <line x1="11.5" y1="15" x2="24.5" y2="15" stroke="#ffffff" stroke-width="1" opacity="0.7"/>
        <rect x="9" y="20" width="2" height="5" rx="0.8" fill="#1F2937"/>
        <rect x="25" y="20" width="2" height="5" rx="0.8" fill="#1F2937"/>
        <rect x="9" y="8" width="2" height="4" rx="0.8" fill="#1F2937"/>
        <rect x="25" y="8" width="2" height="4" rx="0.8" fill="#1F2937"/>
      </g>
    </svg>
  `
}

const addMarkers = () => {
  if (!map) return
  if (markers.length) {
    map.remove(markers)
    markers = []
    markerMap.clear()
  }
  const locatedVehicles = vehicles.value.filter(v => v.hasLocation)
  if (locatedVehicles.length === 0) return

  locatedVehicles.forEach((v, idx) => {
    const container = document.createElement('div')
    container.className = 'custom-marker'
    container.style.animationDelay = (idx * 0.02) + 's'

    const iconWrap = document.createElement('div')
    iconWrap.className = 'truck-icon-wrap ' + (v.status === '在线' ? 'online' : 'offline')
    iconWrap.style.transform = `rotate(${v.direction || 0}deg)`
    iconWrap.innerHTML = getTruckSVG(v.status === '在线')

    if (v.status === '在线') {
      const ring = document.createElement('div')
      ring.className = 'truck-pulse-ring'
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
      offset: new AMap.Pixel(-18, -18),
      zIndex: 1,
      extData: { plate: v.plate },
    })

    marker.on('click', () => {
      if (highlightedPlate.value === v.plate && infoWindow.getIsOpen()) {
        closePopup()
      } else {
        openPopup(v, marker)
      }
    })

    marker.on('mouseover', () => {
      if (hoveredMarker && hoveredMarker !== marker) resetMarkerStyle(hoveredMarker)
      hoveredMarker = marker
      const c = marker.getContent()
      if (c) { c.style.transform = 'scale(1.3)'; c.style.zIndex = '100' }
    })
    marker.on('mouseout', () => {
      if (hoveredMarker === marker) {
        if (highlightedPlate.value !== v.plate) resetMarkerStyle(marker)
        hoveredMarker = null
      }
    })

    markers.push(marker)
    markerMap.set(v.plate, marker)
  })

  map.add(markers)
  if (markers.length) map.setFitView(markers, false, [120, 80, 80, 80])
}

const resetMarkerStyle = (marker) => {
  const c = marker.getContent()
  if (c) { c.style.transform = 'scale(1)'; c.style.zIndex = '1' }
}

const highlightMarker = (marker) => {
  const c = marker.getContent()
  if (c) { c.style.transform = 'scale(1.3)'; c.style.zIndex = '100' }
}

// ============================================================
// InfoWindow 详情
// ============================================================
const openPopup = (vehicle, marker) => {
  highlightedPlate.value = vehicle.plate
  highlightMarker(marker)

  const isOnline = vehicle.status === '在线'
  const statusClass = isOnline ? 'online' : 'offline'

  const html = `
    <div class="amap-custom-popup ${statusClass}">
      <div class="amap-popup-accent"></div>
      <div class="amap-popup-close">×</div>
      <div class="amap-popup-header">
        <span class="amap-popup-plate">${vehicle.plate || '--'}</span>
        <span class="amap-popup-status ${statusClass}">${vehicle.status}</span>
      </div>
      <div class="amap-popup-divider"></div>
      <div class="amap-popup-info">
        <div class="amap-popup-row"><span class="amap-popup-label">所属机构</span><span class="amap-popup-value">${vehicle.org || '--'}</span></div>
        <div class="amap-popup-row"><span class="amap-popup-label">司机</span><span class="amap-popup-value">${vehicle.driver || '--'}</span></div>
        <div class="amap-popup-row"><span class="amap-popup-label">燃料类型</span><span class="amap-popup-value">${vehicle.fuel_type || '--'}</span></div>
        <div class="amap-popup-row"><span class="amap-popup-label">当前速度</span><span class="amap-popup-value">${(vehicle.speed ?? 0)} km/h</span></div>
        <div class="amap-popup-row"><span class="amap-popup-label">当前转速</span><span class="amap-popup-value">${(vehicle.rpm ?? 0)} r/min</span></div>
        <div class="amap-popup-row"><span class="amap-popup-label">剩余油量</span><span class="amap-popup-value">${(vehicle.fuelRemaining ?? 0)} L</span></div>
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
  const target = e.originalEvent?.target || e.target
  if (!target?.closest?.('.custom-marker') && !target?.closest?.('.amap-custom-popup')) {
    closePopup()
  }
}

watch(isMapReady, (val) => {
  if (val && map) map.on('click', onMapClick)
})

// ============================================================
// 筛选
// ============================================================
const selectedPlates = ref([])

const setStatusFilter = (type) => {
  statusFilter.value = statusFilter.value === type ? 'all' : type
  updateMarkersVisibility()
}

const filteredVehicles = computed(() => {
  return vehicles.value.filter(v => {
    if (statusFilter.value === '在线' && v.status !== '在线') return false
    if (statusFilter.value === '离线' && v.status !== '离线') return false
    if (statusFilter.value === 'located' && !v.hasLocation) return false
    const org = v.org || v.customer_name || ''
    const matchOrg = !selectedOrg.value || org === selectedOrg.value
    const matchStatus = !selectedStatus.value || v.status === selectedStatus.value
    const matchSearch = !searchKeyword.value || v.plate.includes(searchKeyword.value)
    const matchSelected = selectedPlates.value.length === 0 || selectedPlates.value.includes(v.plate)
    return matchOrg && matchStatus && matchSearch && matchSelected
  })
})

watch([selectedOrg, selectedStatus, searchKeyword, selectedPlates, statusFilter], () => {
  updateMarkersVisibility()
}, { deep: true })

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

// ============================================================
// 搜索弹窗
// ============================================================
const dialogVisible = ref(false)
const tempSearchKeyword = ref('')
const tempSelectedPlates = ref([])

const dialogFilteredVehicles = computed(() => {
  if (!tempSearchKeyword.value) return vehicles.value
  return vehicles.value.filter(v => v.plate.includes(tempSearchKeyword.value))
})

const openDialog = () => {
  tempSearchKeyword.value = searchKeyword.value
  tempSelectedPlates.value = [...selectedPlates.value]
  dialogVisible.value = true
}
const confirmSearch = () => {
  searchKeyword.value = tempSearchKeyword.value
  selectedPlates.value = [...tempSelectedPlates.value]
  dialogVisible.value = false
  updateMarkersVisibility()
}
const cancelSearch = () => { dialogVisible.value = false }
const selectAll = () => {
  const allPlates = dialogFilteredVehicles.value.map(v => v.plate)
  const allSelected = allPlates.every(p => tempSelectedPlates.value.includes(p))
  if (allSelected) {
    tempSelectedPlates.value = tempSelectedPlates.value.filter(p => !allPlates.includes(p))
  } else {
    const toAdd = allPlates.filter(p => !tempSelectedPlates.value.includes(p))
    tempSelectedPlates.value = [...tempSelectedPlates.value, ...toAdd]
  }
}
const resetAll = () => {
  selectedOrg.value = ''
  selectedStatus.value = ''
  searchKeyword.value = ''
  tempSearchKeyword.value = ''
  selectedPlates.value = []
  tempSelectedPlates.value = []
  statusFilter.value = 'all'
  closePopup()
  updateMarkersVisibility()
}

// ============================================================
// 列表折叠 + 拖拽
// ============================================================
const isListCollapsed = ref(false)
const toggleList = () => { isListCollapsed.value = !isListCollapsed.value }

const listWidth = ref(220)
const isResizing = ref(false)
const startResize = (e) => {
  e.preventDefault()
  e.stopPropagation()
  isResizing.value = true
  const startX = e.clientX
  const startWidth = listWidth.value
  const onMouseMove = (ev) => {
    const newWidth = startWidth + (ev.clientX - startX)
    listWidth.value = Math.min(400, Math.max(200, newWidth))
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
  await loadVehicles()
  await initMap()
})
</script>

<style scoped>
.fullmap {
  height: 100vh;
  width: 100%;
  overflow: hidden;
  padding: 12px;
  box-sizing: border-box;
  background: #f0f2f5;
}
.map-stage {
  position: relative;
  height: 100%;
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
  background: #F8FAFC;
}
.map-container {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

/* ========== 顶部胶囊统计条 ========== */
.floating-stats {
  position: absolute;
  top: 16px;
  right: 16px;
  left: 260px;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 10px;
  pointer-events: none;
}
.stats-pills {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-radius: 999px;
  padding: 5px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(255, 255, 255, 0.6) inset;
  pointer-events: auto;
}
.stat-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  background: transparent;
  border: 1.5px solid transparent;
  user-select: none;
}
.stat-pill:hover {
  background: rgba(248, 250, 252, 0.95);
  transform: translateY(-2px);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.06);
}
.stat-pill:hover .pill-dot { transform: scale(1.4); }
.stat-pill.active {
  background: #ffffff;
  box-shadow: 0 4px 14px rgba(200, 16, 46, 0.12), 0 0 0 1.5px currentColor inset;
}
.stat-pill.active .pill-value { transform: scale(1.08); }
.stat-pill:nth-child(1) { color: #c8102e; }
.stat-pill:nth-child(2) { color: #10B981; }
.stat-pill:nth-child(3) { color: #1F2937; }
.stat-pill:nth-child(4) { color: #2563EB; }
.pill-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
  transition: all 0.3s;
}
.stat-pill:nth-child(1) .pill-dot { box-shadow: 0 0 0 3px rgba(200, 16, 46, 0.18); animation: dotPulseRed 2s ease-in-out infinite; }
.stat-pill:nth-child(2) .pill-dot { box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.18); animation: dotPulseGreen 2s ease-in-out infinite; }
.stat-pill:nth-child(4) .pill-dot { box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.18); animation: dotPulseBlue 2s ease-in-out infinite; }
@keyframes dotPulseRed { 0%,100% { box-shadow: 0 0 0 3px rgba(200,16,46,0.18); } 50% { box-shadow: 0 0 0 6px rgba(200,16,46,0.04); } }
@keyframes dotPulseGreen { 0%,100% { box-shadow: 0 0 0 3px rgba(16,185,129,0.18); } 50% { box-shadow: 0 0 0 6px rgba(16,185,129,0.04); } }
@keyframes dotPulseBlue { 0%,100% { box-shadow: 0 0 0 3px rgba(37,99,235,0.18); } 50% { box-shadow: 0 0 0 6px rgba(37,99,235,0.04); } }
.pill-value {
  font-size: 14px;
  font-weight: 800;
  color: #0F172A;
  font-family: 'Courier New', monospace;
  line-height: 1;
}
.pill-label { font-size: 12px; font-weight: 600; color: #64748B; line-height: 1; }

.refresh-btn {
  background: linear-gradient(135deg, #c8102e, #a00d24) !important;
  border: none !important;
  color: #ffffff !important;
  font-weight: 600 !important;
  border-radius: 999px !important;
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.3) !important;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
  pointer-events: auto;
  padding: 8px 18px !important;
}
.refresh-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(200, 16, 46, 0.45) !important;
}
.icon-spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ========== 悬浮左侧车辆列表 ========== */
.floating-sidebar {
  position: absolute;
  top: 16px;
  bottom: 16px;
  left: 16px;
  z-index: 60;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.6) inset;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  min-width: 44px;
}
.sidebar-content { display: flex; flex-direction: column; height: 100%; overflow: hidden; width: 100%; }
.sidebar-filter { padding: 12px; border-bottom: 1px solid rgba(226, 232, 240, 0.6); flex-shrink: 0; }

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
.search-trigger :deep(.el-input__wrapper) { cursor: pointer; }
.search-trigger :deep(.el-input__inner) { cursor: pointer; }
.filter-buttons { display: flex; gap: 8px; margin-top: 8px; }
.btn-reset, .btn-search {
  flex: 1;
  border-radius: 8px !important;
  font-weight: 600 !important;
  font-size: 12px !important;
}
.btn-reset { border-color: #CBD5E1; color: #334155; }
.btn-reset:hover { border-color: #c8102e; color: #c8102e; background: #FEF2F2; }
.btn-search {
  background: linear-gradient(135deg, #c8102e, #a00d24) !important;
  border: none !important;
  color: #ffffff !important;
}
.btn-search:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.3);
}

.sidebar-list-header {
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #0F172A;
  border-bottom: 1px solid rgba(226, 232, 240, 0.6);
  flex-shrink: 0;
}
.list-icon { color: #c8102e; font-size: 15px; }
.list-count { color: #94A3B8; font-weight: 600; font-size: 12px; }
.collapse-btn {
  margin-left: auto;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: pointer;
  color: #64748B;
  font-size: 13px;
  transition: all 0.25s;
}
.collapse-btn:hover { background: #F1F5F9; color: #c8102e; transform: scale(1.1); }

.sidebar-list { flex: 1; overflow-y: auto; padding: 6px; }
.sidebar-list::-webkit-scrollbar { width: 4px; }
.sidebar-list::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 2px; }

.vehicle-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  margin-bottom: 2px;
  border-radius: 7px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  border-left: 2px solid transparent;
  font-size: 12.5px;
  white-space: nowrap;
  overflow: hidden;
}
.vehicle-item:hover { background: rgba(248, 250, 252, 0.9); transform: translateX(3px); }
.vehicle-item.active {
  background: rgba(254, 242, 242, 0.95);
  border-left-color: #c8102e;
  box-shadow: 0 2px 6px rgba(200, 16, 46, 0.08);
}
.vehicle-item.no-loc { opacity: 0.45; }
.vehicle-item.no-loc:hover { transform: none; }
.vehicle-status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.vehicle-status-dot.在线 { background: #10B981; box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.18); animation: dotPulseGreen 2s ease-in-out infinite; }
.vehicle-status-dot.离线 { background: #1F2937; }
.vehicle-plate { font-weight: 700; color: #0F172A; font-size: 12.5px; flex-shrink: 0; }
.vehicle-vin { color: #94A3B8; font-size: 11px; font-family: 'Courier New', monospace; flex-shrink: 1; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.vehicle-status-tag { margin-left: auto; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 8px; flex-shrink: 0; }
.vehicle-status-tag.在线 { background: #D1FAE5; color: #065F46; }
.vehicle-status-tag.离线 { background: #F1F5F9; color: #1F2937; }

.list-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 40px 20px; color: #94A3B8; font-size: 12px; }
.list-empty .el-icon { font-size: 26px; color: #CBD5E1; }

.sidebar-collapsed { display: flex; flex-direction: column; height: 100%; align-items: center; padding: 8px 0; }
.collapse-btn-vertical {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  cursor: pointer;
  color: #64748B;
  transition: all 0.25s;
  background: rgba(241, 245, 249, 0.6);
}
.collapse-btn-vertical:hover { background: #FEF2F2; color: #c8102e; transform: scale(1.1); }

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

.list-item-enter-active, .list-item-leave-active { transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.list-item-enter-from { opacity: 0; transform: translateX(-20px); }
.list-item-leave-to { opacity: 0; transform: translateX(20px); }

/* ========== 加载遮罩 ========== */
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
.ring-progress {
  fill: none;
  stroke: #c8102e;
  stroke-width: 6;
  stroke-linecap: round;
  stroke-dasharray: 263.89;
  transition: stroke-dashoffset 0.3s ease-out;
  filter: drop-shadow(0 2px 6px rgba(200, 16, 46, 0.4));
}
.loading-percent {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  font-size: 16px;
  font-weight: 800;
  color: #c8102e;
  font-family: 'Courier New', monospace;
}
.loading-text { font-size: 13px; color: #475569; font-weight: 600; margin: 0; animation: textPulse 1.6s ease-in-out infinite; }
@keyframes textPulse { 0%,100% { opacity: 0.7; } 50% { opacity: 1; } }

.fade-enter-active, .fade-leave-active { transition: opacity 0.4s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* ========== 空状态 ========== */
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

/* ========== 高德 InfoWindow 容器清理 ========== */
:deep(.amap-info-content) { padding: 0 !important; background: transparent !important; border: none !important; box-shadow: none !important; }
:deep(.amap-info-window) { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
:deep(.amap-info-close) { display: none !important; }

/* ========== 搜索弹窗 ========== */
:deep(.vehicle-dialog .el-dialog) { border-radius: 12px; overflow: hidden; }
:deep(.vehicle-dialog .el-dialog__header) { padding: 16px 20px; border-bottom: 1px solid #F1F5F9; }
:deep(.vehicle-dialog .el-dialog__title) { font-weight: 700; color: #0F172A; }
:deep(.vehicle-dialog .el-dialog__body) { padding: 16px 20px; }
.dialog-search-row { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
.dialog-list { max-height: 380px; overflow-y: auto; padding: 4px 0; }
.dialog-item { padding: 6px 0; }
.dialog-empty { text-align: center; color: #94A3B8; padding: 30px 0; font-size: 13px; }
:deep(.btn-primary) {
  background-color: #c8102e !important;
  border-color: #c8102e !important;
  color: #fff !important;
  font-weight: 600;
}
:deep(.btn-primary:hover) {
  background-color: #a00d24 !important;
  border-color: #a00d24 !important;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.3);
}

@media (max-width: 1200px) { .pill-label { display: none; } .stat-pill { padding: 6px 10px; } }
@media (max-width: 768px) {
  .fullmap { padding: 6px; }
  .floating-sidebar { display: none; }
  .floating-stats { left: 12px; right: 12px; top: 12px; }
  .stats-pills { flex: 1; overflow-x: auto; }
}
</style>

<!-- ==========================================
   非 scoped：地图标记 + InfoWindow 浅色毛玻璃卡片
   ========================================== -->
<style>
/* ========== 自定义地图标记 ========== */
.custom-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  will-change: transform;
  z-index: 1;
  animation: markerDrop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
}
@keyframes markerDrop {
  from { opacity: 0; transform: translateY(-20px) scale(0.5); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.custom-marker .truck-icon-wrap {
  position: relative;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.3s ease-out;
  transform-origin: center center;
}
.custom-marker .truck-icon-wrap svg { width: 36px; height: 36px; display: block; }
.custom-marker .truck-pulse-ring {
  position: absolute;
  top: 50%; left: 50%;
  width: 24px; height: 24px;
  margin-left: -12px;
  margin-top: -12px;
  border-radius: 50%;
  border: 2px solid rgba(16, 185, 129, 0.7);
  animation: truckPulse 1.8s ease-out infinite;
  pointer-events: none;
}
@keyframes truckPulse {
  0% { transform: scale(0.8); opacity: 0.9; }
  100% { transform: scale(2.4); opacity: 0; }
}
.custom-marker .plate {
  font-size: 9px;
  font-weight: 800;
  color: #0F172A;
  background: rgba(255, 255, 255, 0.95);
  padding: 1px 5px;
  border-radius: 4px;
  white-space: nowrap;
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  letter-spacing: 0.3px;
  margin-top: -2px;
}

/* ==========================================
   高德 InfoWindow 卡片 —— 浅色毛玻璃 + 弹性入场 + 顶部流光
   ========================================== */
.amap-custom-popup {
  position: relative;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border-radius: 10px;
  padding: 10px 12px;
  min-width: 210px;
  max-width: 230px;
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.15),
    0 0 0 1px rgba(255, 255, 255, 0.8) inset,
    0 1px 0 rgba(255, 255, 255, 0.9) inset;
  border: 1px solid rgba(255, 255, 255, 0.75);
  color: #1E293B;
  font-family: system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  overflow: hidden;
  animation: popupFadeIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes popupFadeIn {
  from { opacity: 0; transform: scale(0.88) translateY(6px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.amap-popup-accent {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 2.5px;
  overflow: hidden;
  border-radius: 10px 10px 0 0;
  background: linear-gradient(90deg, rgba(16, 185, 129, 0.15), rgba(16, 185, 129, 0.35), rgba(16, 185, 129, 0.15));
}
.amap-popup-accent::before {
  content: '';
  position: absolute;
  top: 0;
  left: -40%;
  width: 40%;
  height: 100%;
  background: linear-gradient(90deg, transparent, #34D399, #10B981, transparent);
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.9);
  animation: accentFlow 2.2s ease-in-out infinite;
}
@keyframes accentFlow {
  0% { left: -40%; }
  100% { left: 100%; }
}
.amap-custom-popup.offline .amap-popup-accent {
  background: linear-gradient(90deg, rgba(100, 116, 139, 0.15), rgba(100, 116, 139, 0.35), rgba(100, 116, 139, 0.15));
}
.amap-custom-popup.offline .amap-popup-accent::before {
  background: linear-gradient(90deg, transparent, #94A3B8, #64748B, transparent);
  box-shadow: 0 0 8px rgba(100, 116, 139, 0.9);
}

.amap-popup-close {
  position: absolute;
  top: 6px;
  right: 8px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 14px;
  color: #94A3B8;
  cursor: pointer;
  transition: all 0.25s;
  line-height: 1;
  user-select: none;
  z-index: 2;
}
.amap-popup-close:hover {
  background: #F1F5F9;
  color: #475569;
  transform: rotate(90deg) scale(1.1);
}

.amap-popup-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  padding-right: 20px;
}
.amap-popup-plate {
  font-size: 13px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: 0.4px;
}
.amap-popup-status {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 3px;
  border: 1px solid;
  letter-spacing: 0.2px;
}
.amap-popup-status.online {
  background: #ECFDF5;
  color: #059669;
  border-color: #A7F3D0;
}
.amap-popup-status.offline {
  background: #F1F5F9;
  color: #475569;
  border-color: #E2E8F0;
}

.amap-popup-divider {
  border-top: 1px solid rgba(226, 232, 240, 0.7);
  margin: 0 0 8px 0;
}

.amap-popup-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.amap-popup-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  font-size: 11.5px;
  line-height: 1.35;
}
.amap-popup-label {
  color: #64748B;
  font-weight: 500;
  white-space: nowrap;
  margin-right: 6px;
  flex-shrink: 0;
}
.amap-popup-value {
  color: #0F172A;
  font-weight: 600;
  text-align: right;
  word-break: break-all;
  flex: 1;
}
.amap-popup-value.mono {
  font-family: 'Courier New', monospace;
  font-size: 10.5px;
}

.amap-popup-actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}
.amap-popup-btn {
  flex: 1;
  padding: 5px 0;
  border-radius: 14px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  background: #F1F5F9;
  color: #475569;
  border: 1px solid #E2E8F0;
  outline: none;
  font-family: inherit;
  position: relative;
  overflow: hidden;
}
.amap-popup-btn::after {
  content: '';
  position: absolute;
  top: 0; left: -100%;
  width: 100%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(200, 16, 46, 0.18), transparent);
  transition: left 0.5s ease;
}
.amap-popup-btn:hover::after {
  left: 100%;
}
.amap-popup-btn:hover {
  background: #FEF2F2;
  border-color: #FCA5A5;
  color: #c8102e;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.15);
}
.amap-popup-btn:active {
  transform: translateY(0) scale(0.97);
}

.amap-info-close { display: none !important; }
.amap-info-sharp { display: none !important; }
.amap-info-content { padding: 0 !important; background: transparent !important; border: none !important; box-shadow: none !important; }
.amap-info-window { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
</style>