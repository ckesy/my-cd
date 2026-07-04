<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { ElMessage } from 'element-plus'
import AMapLoader from '@amap/amap-jsapi-loader'

// ============================================================
//  配置说明：
//  1. 在 index.html 中设置安全密钥（必须）：
//     <script>
//       window._AMapSecurityConfig = { securityJsCode: '您的安全密钥' };
//     
//  2. 将下方 YOUR_AMAP_KEY 替换为您的真实高德 Key
// ============================================================

// ---------- 固定车辆数据（30条） ----------
const vehicleData = [
  { plate: '鄂A39907D', location: '湖北省武汉市青山区正街与沿河街交叉口西100米西0.110公里' },
  { plate: '鄂A37759D', location: '湖北省武汉市青山区正街与沿河街交叉口西100米西北0.98公里' },
  { plate: '鄂A30958D', location: '湖北省武汉市青山区工人村路112号附近西南方向150米东0.24公里' },
  { plate: '鄂A39603D', location: '湖北省武汉市青山区正街与沿河街交叉口西100米西0.185公里' },
  { plate: '苏K01739D', location: '江苏省扬州市邗江区物港路1号西0.77公里' },
  { plate: '贵A07309D', location: '广西壮族自治区防城港市上思县G210|S313西0.7公里' },
  { plate: '苏K01073D', location: '江苏省扬州市仪征市204县道张嫂酱鸭东正东方向20米南0.73公里' },
  { plate: '鄂C18887D', location: '湖北省襄阳市枣阳市七方镇汉孟路569号东北0.37公里' },
  { plate: '桂A06866D', location: '广西壮族自治区崇左市扶绥县祥和路153号北0.200公里' },
  { plate: '皖M03087D', location: '安徽省滁州市凤阳县前门大街与五经路交叉口正北方向124米北0.139公里' },
  { plate: '新AD9211', location: '新疆维吾尔自治区乌鲁木齐市天山区东泉路1568号西北0.38公里' },
  { plate: '赣DL1340', location: '江西省吉安市新干县789县道东50米北0.175公里' },
  { plate: '黑MM0970', location: '辽宁省沈阳市大东区东贸路水晶城一期佳每客旅馆对面北0.312公里' },
  { plate: '闽B57583', location: '福建省莆田市秀屿区忠湄街与新西埔坑口路交叉口东40米西0.523公里' },
  { plate: '湘A20481', location: '湖南省长沙市长沙县长沙经济技术开发区大众西路以东宾塘路以南南0.4公里' },
  { plate: '浙B3V275', location: '浙江省宁波市奉化区长汀东路南0.66公里' },
  { plate: '甘D00009', location: '甘肃省兰州市榆中县三角城乡高墩营幼儿园' },
  { plate: '川AET169', location: '四川省成都市双流区航枢大道二段头道沟南0.42公里' },
  { plate: '新L33815', location: '甘肃省陇南市武都区汉王镇杨家坝90号东南方向120米东北0.249公里' },
  { plate: '云F95659', location: '云南省玉溪市红塔区工业园区观音山17号东北0.49公里' },
  { plate: '辽J55251', location: '辽宁省阜新市彰武县花家村国道304与县道913路口处北0.29公里' },
  { plate: '黑AU2363', location: '黑龙江省哈尔滨市宾县' },
  { plate: '粤T62160', location: '广东省珠海市金湾区联富路与石化九路交叉路口往东北约290米东南0.43公里' },
  { plate: '鲁N34527', location: '甘肃省武威市古浪县甘肃银双高速公路大境段距该站最近的高速公路出入口为大境收费站南0.47公里' },
  { plate: '川ZD0856', location: '四川省眉山市东坡区安平街与尚义路交叉口北380米西0.114公里' },
  { plate: '鲁N25753', location: '山东省聊城市东昌府区西侧80米北0.8公里' },
  { plate: '鲁NH9952', location: '内蒙古自治区包头市青山区京藏高速公路|京新高速公路|G6|G7南0.165公里' },
  { plate: '赣DL4406', location: '广东省佛山市南海区九江沙头工业园A区龙行天下物流C区2排2仓东南0.82公里' },
  { plate: '宁E62337', location: '陕西省西安市灞桥区纺渭路与港兴四路交叉路口往西约60米北0.215公里' },
  { plate: '晋KB9296', location: '山西省太原市阳曲县穗华物流园南塔底村南0.411公里' },
]

// ---------- 全国主要城市坐标 ----------
const chinaCities = [
  { name: '北京', lng: 116.4, lat: 39.9 },
  { name: '上海', lng: 121.5, lat: 31.2 },
  { name: '广州', lng: 113.3, lat: 23.1 },
  { name: '深圳', lng: 114.1, lat: 22.5 },
  { name: '成都', lng: 104.1, lat: 30.6 },
  { name: '重庆', lng: 106.5, lat: 29.6 },
  { name: '武汉', lng: 114.3, lat: 30.6 },
  { name: '南京', lng: 118.8, lat: 32.0 },
  { name: '杭州', lng: 120.2, lat: 30.3 },
  { name: '西安', lng: 108.9, lat: 34.3 },
  { name: '沈阳', lng: 123.4, lat: 41.8 },
  { name: '长春', lng: 125.3, lat: 43.9 },
  { name: '哈尔滨', lng: 126.6, lat: 45.8 },
  { name: '乌鲁木齐', lng: 87.6, lat: 43.8 },
  { name: '拉萨', lng: 91.1, lat: 29.6 },
  { name: '昆明', lng: 102.7, lat: 25.0 },
  { name: '贵阳', lng: 106.7, lat: 26.6 },
  { name: '南宁', lng: 108.4, lat: 22.8 },
  { name: '海口', lng: 110.3, lat: 20.0 },
  { name: '兰州', lng: 103.8, lat: 36.0 },
  { name: '西宁', lng: 101.8, lat: 36.6 },
  { name: '银川', lng: 106.3, lat: 38.5 },
  { name: '呼和浩特', lng: 111.7, lat: 40.8 },
  { name: '太原', lng: 112.5, lat: 37.9 },
  { name: '石家庄', lng: 114.5, lat: 38.0 },
  { name: '济南', lng: 117.0, lat: 36.7 },
  { name: '郑州', lng: 113.6, lat: 34.7 },
  { name: '长沙', lng: 112.9, lat: 28.2 },
  { name: '南昌', lng: 115.9, lat: 28.7 },
  { name: '福州', lng: 119.3, lat: 26.1 },
]

// ---------- 统计数据 ----------
const stats = ref([
  { label: '全部车辆', value: 0, color: '#d32f2f' },
  { label: '行驶', value: 0, color: '#22c55e' },
  { label: '静止', value: 0, color: '#6b7280' },
  { label: '充电', value: 0, color: '#eab308' },
  { label: '离线', value: 0, color: '#ef4444' },
])

// ---------- 筛选 ----------
const orgOptions = ref(['李先生的车队（30）'])
const selectedOrg = ref(orgOptions.value[0])
const statusOptions = ref(['全部', '行驶', '静止', '充电', '离线'])
const selectedStatus = ref('全部')
const searchKeyword = ref('')
const loading = ref(false)

// ---------- 车辆数据 ----------
const vehicles = ref([])
const geocodeProgress = ref(0)
const isMapReady = ref(false)

const enrichVehicleData = (raw) => {
  const statusPool = ['行驶', '静止', '充电', '离线']
  const status = statusPool[Math.floor(Math.random() * statusPool.length)]
  const direction = Math.random() * 360
  const isRunning = status === '行驶'
  const isCharging = status === '充电'
  const isOffline = status === '离线'

  const speed = isRunning ? Math.round(10 + Math.random() * 70) : 0
  const rpm = isRunning ? Math.round(800 + Math.random() * 3200) : 0
  const battery = isCharging ? Math.round(50 + Math.random() * 48) : Math.round(Math.random() * 100)
  const dcdcStatus = isOffline ? '停止' : ['工作', '工作', '工作', '停止'][Math.floor(Math.random() * 4)]
  const motorStatus = isOffline ? '停止' : isRunning ? ['运行', '运行', '运行', '准备'][Math.floor(Math.random() * 4)] : ['准备', '停止', '停止'][Math.floor(Math.random() * 3)]
  const motorRpm = isRunning ? Math.round(500 + Math.random() * 3500) : 0
  const envTemp = Math.round((18 + Math.random() * 22) * 10) / 10
  const motorTemp = isRunning ? Math.round((45 + Math.random() * 25) * 10) / 10 : Math.round((30 + Math.random() * 20) * 10) / 10

  const now = new Date()
  const reportTime =
    now.getFullYear() +
    '-' +
    String(now.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(now.getDate()).padStart(2, '0') +
    ' ' +
    String(now.getHours()).padStart(2, '0') +
    ':' +
    String(now.getMinutes()).padStart(2, '0') +
    ':' +
    String(now.getSeconds()).padStart(2, '0')

  const orgs = ['西马物流新能源车队', '东湖新能源车队', '南湖物流车队', '汉口新能源车队']
  const org = orgs[Math.floor(Math.random() * orgs.length)]

  return {
    ...raw,
    status,
    direction,
    speed,
    rpm,
    battery,
    dcdcStatus,
    motorStatus,
    motorRpm,
    envTemp,
    motorTemp,
    reportTime,
    org,
    fuelDisplay: '纯电',
    lng: 0,
    lat: 0,
  }
}

// ---------- 地图相关 ----------
let map = null
let markers = []           // 存储所有标记对象
let markerMap = new Map()  // 车牌 -> marker 映射
let infoWindow = null

const highlightedPlate = ref(null)
let hoveredMarker = null

// 缓存地图容器 rect，避免频繁读取
let mapContainerRect = null
const popupWidth = 260
const popupHeight = 500

// ---------- 卡片拖拽相关 ----------
const isUserPositioned = ref(false)  // 是否用户手动拖拽过
let dragOffsetX = 0
let dragOffsetY = 0

const getRandomChinaLocation = () => {
  const city = chinaCities[Math.floor(Math.random() * chinaCities.length)]
  const offsetLng = (Math.random() - 0.5) * 1.0
  const offsetLat = (Math.random() - 0.5) * 1.0
  return {
    lng: city.lng + offsetLng,
    lat: city.lat + offsetLat,
    cityName: city.name,
  }
}

const initMap = async () => {
  try {
    const AMap = await AMapLoader.load({
      key: '273f5c474604b71906674aac159b8f45', // 👈 替换为您的 Key
      version: '2.0',
      plugins: ['AMap.Geocoder'],
    })

    map = new AMap.Map('map-container', {
      zoom: 4,
      center: [104, 35],
      mapStyle: 'amap://styles/fresh',
      viewMode: '2D',
      features: ['bg', 'road', 'building', 'point'],
    })

    infoWindow = new AMap.InfoWindow({
      offset: new AMap.Pixel(0, -20),
      autoMove: true,
      closeWhenClickMap: true,
    })

    await geocodeAddresses(AMap)

    addMarkers()
    isMapReady.value = true
    updateStats()
    updateMarkersVisibility()

    ElMessage.success('地图加载完成，共 ' + vehicles.value.length + ' 辆车')
  } catch (err) {
    ElMessage.error('地图加载失败：' + err.message)
    console.error(err)
  }
}

const geocodeAddresses = (AMap) => {
  return new Promise((resolve) => {
    const geocoder = new AMap.Geocoder({
      city: '',
      radius: 1000,
      extensions: 'all',
    })

    const total = vehicles.value.length
    let completed = 0

    const promises = vehicles.value.map((v) => {
      return new Promise((res) => {
        const timeout = setTimeout(() => {
          const loc = getRandomChinaLocation()
          v.lng = loc.lng
          v.lat = loc.lat
          v.location = '中国 ' + loc.cityName + ' 附近'
          completed++
          geocodeProgress.value = Math.round((completed / total) * 100)
          console.warn('地址编码超时: ' + v.location + '，使用随机城市坐标')
          res()
        }, 5000)

        geocoder.getLocation(v.location, (status, result) => {
          clearTimeout(timeout)
          let lng, lat
          if (status === 'complete' && result.geocodes.length) {
            const loc = result.geocodes[0]
            lng = loc.location.getLng()
            lat = loc.location.getLat()
            if (lng < 73 || lng > 135 || lat < 3 || lat > 54) {
              const fallback = getRandomChinaLocation()
              lng = fallback.lng
              lat = fallback.lat
              v.location = '中国 ' + fallback.cityName + ' 附近'
              console.warn('坐标超出中国范围，使用随机城市坐标')
            } else {
              v.location = loc.formattedAddress || v.location
            }
          } else {
            const fallback = getRandomChinaLocation()
            lng = fallback.lng
            lat = fallback.lat
            v.location = '中国 ' + fallback.cityName + ' 附近'
            console.warn('地址编码失败: ' + v.location + '，使用随机城市坐标')
          }
          v.lng = lng
          v.lat = lat
          completed++
          geocodeProgress.value = Math.round((completed / total) * 100)
          res()
        })
      })
    })

    Promise.all(promises).then(() => resolve())
  })
}

const addMarkers = () => {
  if (!map) return

  // 清除已有标记
  if (markers.length) {
    map.remove(markers)
    markers = []
    markerMap.clear()
  }

  vehicles.value.forEach(v => {
    if (!v.lng || !v.lat || v.lng < 73 || v.lng > 135 || v.lat < 3 || v.lat > 54) {
      const loc = getRandomChinaLocation()
      v.lng = loc.lng
      v.lat = loc.lat
      v.location = '中国 ' + loc.cityName + ' 附近'
    }

    const container = document.createElement('div')
    container.className = 'custom-marker'

    const icon = document.createElement('div')
    icon.className = 'vehicle-icon ' + v.status
    icon.style.width = '16px'
    icon.style.height = '16px'
    icon.style.border = '2.5px solid #ffffff'
    icon.style.boxShadow = '0 0 0 2px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.3)'

    const arrow = document.createElement('span')
    arrow.className = 'arrow'
    arrow.textContent = '▲'
    arrow.style.fontSize = '9px'
    arrow.style.color = '#ffffff'
    arrow.style.textShadow = '0 1px 3px rgba(0,0,0,0.6)'
    arrow.style.cssText += '; transform: translate(-50%, -50%) rotate(' + v.direction + 'deg);'
    icon.appendChild(arrow)

    const plateSpan = document.createElement('span')
    plateSpan.className = 'plate'
    plateSpan.textContent = v.plate
    const statusColorMap = {
      '行驶': '#22c55e',
      '静止': '#6b7280',
      '充电': '#eab308',
      '离线': '#ef4444'
    }
    plateSpan.style.color = statusColorMap[v.status] || '#1a2a4a'
    plateSpan.style.fontWeight = '700'
    plateSpan.style.fontSize = '8px'
    plateSpan.style.textShadow = '0 0 4px rgba(255,255,255,0.9)'
    plateSpan.style.background = 'rgba(255,255,255,0.85)'

    container.appendChild(icon)
    container.appendChild(plateSpan)

    const marker = new AMap.Marker({
      position: [v.lng, v.lat],
      content: container,
      offset: new AMap.Pixel(-8, -18),
      zIndex: 1,
      extData: { plate: v.plate },
    })

    // 点击事件
    marker.on('click', (e) => {
      if (popupVisible.value && popupVehicle.value?.plate === v.plate) {
        closePopup()
      } else {
        openPopup(v, marker)
      }
    })

    // 悬停高亮
    marker.on('mouseover', () => {
      if (hoveredMarker && hoveredMarker !== marker) resetMarkerStyle(hoveredMarker)
      hoveredMarker = marker
      const c = marker.getContent()
      if (c) {
        c.style.transform = 'translate(-50%, -50%) scale(1.5)'
        c.style.filter = 'drop-shadow(0 0 12px rgba(0,0,0,0.5))'
        c.style.zIndex = '100'
      }
    })
    marker.on('mouseout', () => {
      if (hoveredMarker === marker) {
        if (highlightedPlate.value !== v.plate) {
          resetMarkerStyle(marker)
        }
        hoveredMarker = null
      }
    })

    markers.push(marker)
    markerMap.set(v.plate, marker)
  })

  map.add(markers)
  if (markers.length) map.setFitView(markers)
}

const resetMarkerStyle = (marker) => {
  const c = marker.getContent()
  if (c) {
    c.style.transform = 'translate(-50%, -50%) scale(1)'
    c.style.filter = 'none'
    c.style.zIndex = '1'
  }
}

const highlightMarker = (marker) => {
  const c = marker.getContent()
  if (c) {
    c.style.transform = 'translate(-50%, -50%) scale(1.5)'
    c.style.filter = 'drop-shadow(0 0 12px rgba(0,0,0,0.5))'
    c.style.zIndex = '100'
  }
}

// ---------- 浮动小卡片 ----------
const popupVisible = ref(false)
const popupVehicle = ref(null)
const popupStyle = ref({ left: '0px', top: '0px' })
const popupMarker = ref(null)

// 更新卡片位置（被地图事件调用，但若用户已拖拽过则跳过）
const updatePopupPosition = () => {
  if (!popupVisible.value || !popupMarker.value || !map) return
  if (isUserPositioned.value) return
  try {
    const marker = popupMarker.value
    const position = marker.getPosition()
    let pixel = null
    if (position) {
      pixel = map.lngLatToContainer(position)
    }
    if (!pixel || typeof pixel.getX !== 'function') {
      const center = map.getCenter()
      pixel = map.lngLatToContainer(center)
    }
    if (!mapContainerRect) {
      const mapContainer = document.getElementById('map-container')
      if (mapContainer) {
        mapContainerRect = mapContainer.getBoundingClientRect()
      }
    }
    const rect = mapContainerRect

    let left = rect.left + pixel.getX() + 20
    let top = rect.top + pixel.getY() + 10

    if (left + popupWidth > window.innerWidth) {
      left = rect.left + pixel.getX() - popupWidth - 20
    }
    if (top + popupHeight > window.innerHeight) {
      top = rect.top + pixel.getY() - popupHeight - 10
    }
    if (top < 10) top = 10
    if (top + popupHeight > window.innerHeight) {
      top = window.innerHeight - popupHeight - 10
    }
    if (left < 10) left = 10
    if (left + popupWidth > window.innerWidth) {
      left = window.innerWidth - popupWidth - 10
    }

    popupStyle.value = { left: left + 'px', top: top + 'px' }
  } catch (e) {
    console.warn('更新卡片位置失败', e)
  }
}

// 拖拽事件
const startDrag = (e) => {
  if (!popupVisible.value) return
  if (e.target.closest('.popup-close') || e.target.closest('.el-button')) {
    return
  }
  e.preventDefault()
  const currentLeft = parseFloat(popupStyle.value.left) || 0
  const currentTop = parseFloat(popupStyle.value.top) || 0
  dragOffsetX = currentLeft - e.clientX
  dragOffsetY = currentTop - e.clientY
  isUserPositioned.value = true

  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', endDrag)
}

const onDrag = (e) => {
  e.preventDefault()
  let left = e.clientX + dragOffsetX
  let top = e.clientY + dragOffsetY

  if (left < 10) left = 10
  if (top < 10) top = 10
  if (left + popupWidth > window.innerWidth) {
    left = window.innerWidth - popupWidth - 10
  }
  if (top + popupHeight > window.innerHeight) {
    top = window.innerHeight - popupHeight - 10
  }
  popupStyle.value = { left: left + 'px', top: top + 'px' }
}

const endDrag = () => {
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', endDrag)
}

const openPopup = (vehicle, marker) => {
  popupVehicle.value = vehicle
  popupMarker.value = marker
  highlightMarker(marker)
  highlightedPlate.value = vehicle.plate

  isUserPositioned.value = false

  const mapContainer = document.getElementById('map-container')
  if (mapContainer) {
    mapContainerRect = mapContainer.getBoundingClientRect()
  }

  updatePopupPosition()
  if (popupStyle.value.left === '0px' && popupStyle.value.top === '0px') {
    setTimeout(() => { updatePopupPosition() }, 100)
  }
  popupVisible.value = true

  if (map) {
    map.off('moving', updatePopupPosition)
    map.off('moveend', updatePopupPosition)
    map.off('zoomend', updatePopupPosition)
    map.on('moving', updatePopupPosition)
    map.on('moveend', updatePopupPosition)
    map.on('zoomend', updatePopupPosition)
  }
}

const closePopup = () => {
  popupVisible.value = false
  popupVehicle.value = null
  popupMarker.value = null
  mapContainerRect = null
  isUserPositioned.value = false
  if (highlightedPlate.value) {
    const marker = markerMap.get(highlightedPlate.value)
    if (marker) resetMarkerStyle(marker)
    highlightedPlate.value = null
  }
  if (map) {
    map.off('moving', updatePopupPosition)
    map.off('moveend', updatePopupPosition)
    map.off('zoomend', updatePopupPosition)
  }
}

const onMapClick = (e) => {
  const target = e.originalEvent?.target || e.target
  if (!target?.closest?.('.custom-marker') && !target?.closest?.('.popup-card')) {
    closePopup()
  }
}

watch(isMapReady, (val) => {
  if (val && map) {
    map.on('click', onMapClick)
  }
})

// ---------- 统计更新 ----------
const updateStats = () => {
  const total = vehicles.value.length
  const running = vehicles.value.filter(v => v.status === '行驶').length
  const stopped = vehicles.value.filter(v => v.status === '静止').length
  const charging = vehicles.value.filter(v => v.status === '充电').length
  const offline = vehicles.value.filter(v => v.status === '离线').length
  stats.value = [
    { label: '全部车辆', value: total, color: '#d32f2f' },
    { label: '行驶', value: running, color: '#22c55e' },
    { label: '静止', value: stopped, color: '#6b7280' },
    { label: '充电', value: charging, color: '#eab308' },
    { label: '离线', value: offline, color: '#ef4444' },
  ]
}

// ---------- 筛选与高亮 ----------
const selectedPlates = ref([])

const filteredVehicles = computed(() => {
  return vehicles.value.filter(v => {
    const matchStatus = selectedStatus.value === '全部' || v.status === selectedStatus.value
    const matchSearch = !searchKeyword.value || v.plate.includes(searchKeyword.value)
    const matchSelected = selectedPlates.value.length === 0 || selectedPlates.value.includes(v.plate)
    return matchStatus && matchSearch && matchSelected
  })
})

const highlightVehicle = (plate) => {
  if (highlightedPlate.value === plate) {
    const marker = markerMap.get(plate)
    if (marker) resetMarkerStyle(marker)
    highlightedPlate.value = null
    if (popupVisible.value && popupVehicle.value?.plate === plate) {
      closePopup()
    }
    return
  }
  if (highlightedPlate.value) {
    const oldMarker = markerMap.get(highlightedPlate.value)
    if (oldMarker) resetMarkerStyle(oldMarker)
  }
  const marker = markerMap.get(plate)
  if (marker && map) {
    map.setCenter(marker.getPosition())
    highlightMarker(marker)
    highlightedPlate.value = plate
    if (popupVisible.value && popupVehicle.value?.plate !== plate) {
      closePopup()
    }
    const vehicle = vehicles.value.find(v => v.plate === plate)
    if (vehicle) {
      openPopup(vehicle, marker)
    }
  }
}

const isVehicleHighlighted = (plate) => {
  return highlightedPlate.value === plate || selectedPlates.value.includes(plate)
}

const updateMarkersVisibility = () => {
  if (!map) return

  const visiblePlates = new Set(filteredVehicles.value.map(v => v.plate))

  markerMap.forEach((marker, plate) => {
    const shouldVisible = visiblePlates.has(plate)
    if (typeof marker.setVisible === 'function') {
      marker.setVisible(shouldVisible)
    }
    if (shouldVisible) {
      if (typeof marker.show === 'function') marker.show()
    } else {
      if (typeof marker.hide === 'function') marker.hide()
    }
  })

  if (highlightedPlate.value && !visiblePlates.has(highlightedPlate.value)) {
    const marker = markerMap.get(highlightedPlate.value)
    if (marker) resetMarkerStyle(marker)
    highlightedPlate.value = null
    if (popupVisible.value) closePopup()
  }

  const visibleMarkers = []
  markerMap.forEach((marker, plate) => {
    if (visiblePlates.has(plate) && marker.getVisible()) {
      visibleMarkers.push(marker)
    }
  })
  if (visibleMarkers.length) {
    map.setFitView(visibleMarkers)
  }
}

watch(
  [selectedStatus, searchKeyword, selectedPlates],
  () => {
    updateMarkersVisibility()
  },
  { deep: true, immediate: true }
)

// ---------- 搜索弹窗 ----------
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
  selectedStatus.value = '全部'
  searchKeyword.value = ''
  tempSearchKeyword.value = ''
  selectedPlates.value = []
  tempSelectedPlates.value = []
  closePopup()
  if (highlightedPlate.value) {
    const marker = markerMap.get(highlightedPlate.value)
    if (marker) resetMarkerStyle(marker)
    highlightedPlate.value = null
  }
  updateMarkersVisibility()
}

// ---------- 列表折叠 ----------
const isListCollapsed = ref(false)
const toggleList = () => { isListCollapsed.value = !isListCollapsed.value }

const listWidth = ref(180)
const isResizing = ref(false)
const startResize = (e) => {
  e.preventDefault()
  isResizing.value = true
  const startX = e.clientX
  const startWidth = listWidth.value
  const onMouseMove = (ev) => {
    const newWidth = startWidth + (ev.clientX - startX)
    listWidth.value = Math.min(400, Math.max(80, newWidth))
  }
  const onMouseUp = () => {
    isResizing.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

// ---------- 生命周期 ----------
onMounted(async () => {
  vehicles.value = vehicleData.map(item => enrichVehicleData(item))
  updateStats()
  await nextTick()
  await initMap()
})
</script>

<template>
  <div class="fullmap">
    <!-- 顶部标题 -->
    <div class="header">
      <div class="title"><span class="brand">🚛 李先生的车队</span></div>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-row">
      <div v-for="s in stats" :key="s.label" class="stat-item">
        <span class="stat-value" :style="{ color: s.color }">{{ s.value }}</span>
        <span class="stat-label">{{ s.label }}</span>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <el-select v-model="selectedOrg" placeholder="请选择组织机构" size="small" style="width:160px;" disabled>
        <el-option label="李先生的车队（30）" value="李先生的车队（30）"></el-option>
      </el-select>
      <el-select v-model="selectedStatus" placeholder="请选择作业状态" size="small" style="width:140px; margin-left:10px;">
        <el-option v-for="s in statusOptions" :key="s" :label="s" :value="s"></el-option>
      </el-select>
      <el-input :value="searchKeyword" placeholder="点击搜索车辆" size="small" style="width:160px; margin-left:10px;"
        readonly class="search-input" @click="openDialog" clearable @clear="searchKeyword = ''; tempSearchKeyword = ''">
      </el-input>
      <el-button size="small" style="margin-left:10px;" @click="resetAll">重置</el-button>
    </div>

    <!-- 主区域 -->
    <div class="map-layout">
      <!-- 左侧车辆列表 -->
      <div class="vehicle-list" :class="{ collapsed: isListCollapsed }" :style="{ width: listWidth + 'px' }">
        <div class="list-header" @click="toggleList">
          <span v-if="!isListCollapsed">车辆列表</span>
          <span v-else class="collapsed-icon">📋</span>
          <span v-if="!isListCollapsed" class="list-count">{{ filteredVehicles.length }}</span>
          <span class="toggle-btn">{{ isListCollapsed ? '▶' : '◀' }}</span>
        </div>
        <div v-show="!isListCollapsed" class="list-scroll">
          <div v-for="v in filteredVehicles" :key="v.plate" class="list-item"
            :class="{ active: isVehicleHighlighted(v.plate), 'selected-multi': selectedPlates.includes(v.plate) }"
            @click="highlightVehicle(v.plate)">
            <span class="plate-badge">{{ v.plate }}</span>
            <span class="status-badge" :class="v.status">{{ v.status }}</span>
          </div>
        </div>
        <div v-show="isListCollapsed" class="list-scroll collapsed-list">
          <div v-for="v in filteredVehicles" :key="v.plate" class="list-item collapsed-item"
            :class="{ active: isVehicleHighlighted(v.plate), 'selected-multi': selectedPlates.includes(v.plate) }"
            @click="highlightVehicle(v.plate)">
            <span class="plate-badge-collapsed">{{ v.plate }}</span>
          </div>
        </div>
        <div class="resizer" @mousedown="startResize"></div>
      </div>

      <!-- 地图容器 -->
      <div id="map-container" class="map-container">
        <div v-if="!isMapReady" class="map-loading">
          <span>正在定位车辆位置... {{ geocodeProgress }}%</span>
        </div>
      </div>
    </div>

    <!-- 搜索弹窗 -->
    <el-dialog v-model="dialogVisible" title="搜索车辆" width="450px" :close-on-click-modal="false" @close="cancelSearch">
      <div style="margin-bottom:16px; display:flex; align-items:center; gap:12px;">
        <el-input v-model="tempSearchKeyword" placeholder="输入车牌号模糊搜索" clearable style="flex:1;"></el-input>
        <el-button type="primary" size="small" @click="selectAll">
          {{ dialogFilteredVehicles.every(v => tempSelectedPlates.includes(v.plate)) ? '取消全选' : '全选' }}
        </el-button>
      </div>
      <div style="max-height:400px; overflow-y:auto; text-align:left;">
        <el-checkbox-group v-model="tempSelectedPlates" style="display:flex; flex-direction:column; align-items:flex-start;">
          <div v-for="v in dialogFilteredVehicles" :key="v.plate" style="padding:4px 0; width:100%; text-align:left;">
            <el-checkbox :label="v.plate" style="text-align:left;">{{ v.plate }}</el-checkbox>
          </div>
        </el-checkbox-group>
      </div>
      <template #footer>
        <el-button @click="cancelSearch">取消</el-button>
        <el-button type="primary" @click="confirmSearch">确定</el-button>
      </template>
    </el-dialog>

    <!-- 浮动小卡片 -->
    <div
      v-if="popupVisible && popupVehicle"
      class="popup-card"
      :style="popupStyle"
      @click.stop
      @mousedown="startDrag"
      style="cursor: grab; user-select: none;"
      @dragstart.prevent
    >
      <div class="popup-close" @click="closePopup">×</div>
      <div class="popup-header">
        <span class="popup-plate">{{ popupVehicle.plate }}</span>
        <span class="popup-status" :class="popupVehicle.status">{{ popupVehicle.status }}</span>
      </div>
      <div class="popup-divider"></div>
      <div class="popup-info">
        <div class="popup-row"><span class="popup-label">所属机构</span><span class="popup-value">{{ popupVehicle.org || '西马物流新能源车队' }}</span></div>
        <div class="popup-row"><span class="popup-label">燃料类型</span><span class="popup-value">{{ popupVehicle.fuelDisplay || '纯电' }}</span></div>
        <div class="popup-row"><span class="popup-label">当前速度</span><span class="popup-value">{{ popupVehicle.speed }}km/h</span></div>
        <div class="popup-row"><span class="popup-label">当前转速</span><span class="popup-value">{{ popupVehicle.rpm }}r/min</span></div>
        <div class="popup-row"><span class="popup-label">剩余电量</span><span class="popup-value">{{ popupVehicle.battery }}%</span></div>
        <div class="popup-row"><span class="popup-label">DCDC状态</span><span class="popup-value">{{ popupVehicle.dcdcStatus || '工作' }}</span></div>
        <div class="popup-row"><span class="popup-label">驱动电机状态</span><span class="popup-value">{{ popupVehicle.motorStatus || '准备' }}</span></div>
        <div class="popup-row"><span class="popup-label">驱动电机转速</span><span class="popup-value">{{ popupVehicle.motorRpm }}r/min</span></div>
        <div class="popup-row"><span class="popup-label">环境温度</span><span class="popup-value">{{ popupVehicle.envTemp }}℃</span></div>
        <div class="popup-row"><span class="popup-label">电机温度</span><span class="popup-value">{{ popupVehicle.motorTemp }}℃</span></div>
        <div class="popup-row"><span class="popup-label">上报时间</span><span class="popup-value">{{ popupVehicle.reportTime }}</span></div>
        <div class="popup-row"><span class="popup-label">当前位置</span><span class="popup-value">{{ popupVehicle.location }}</span></div>
      </div>
      <div class="popup-actions">
        <el-button type="primary" size="small" plain @click="ElMessage.info('实时跟踪功能开发中')">实时跟踪</el-button>
        <el-button type="info" size="small" plain @click="ElMessage.info('轨迹回放功能开发中')">轨迹回放</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ===== 全局 ===== */
.fullmap {
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #f5f7fb;
  padding: 8px 16px 12px;
  box-sizing: border-box;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  flex-shrink: 0;
}
.title .brand {
  font-size: 16px;
  font-weight: 700;
  color: #0a2a4a;
}

/* ===== 统计卡片 ===== */
.stats-row {
  display: flex;
  gap: 6px;
  background: #ffffff;
  padding: 4px 12px;
  border-radius: 8px;
  border: 1px solid #f0f0f0;
  margin-bottom: 6px;
  flex-shrink: 0;
  flex-wrap: nowrap;
  align-items: center;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2px 10px 2px 8px;
  border-right: 1px solid #f0f0f0;
  min-width: 44px;
}
.stat-item:last-child {
  border-right: none;
  padding-right: 4px;
}
.stat-value {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
}
.stat-label {
  font-size: 10px;
  color: #999;
  font-weight: 400;
  letter-spacing: 0.2px;
  margin-top: 1px;
}

/* ===== 筛选栏 ===== */
.filter-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  background: #ffffff;
  padding: 6px 16px;
  border-radius: 10px;
  border: 1px solid #e5e9f0;
  margin-bottom: 8px;
  flex-shrink: 0;
  gap: 4px;
}
.filter-bar .el-select,
.filter-bar .el-input {
  font-size: 12px;
}
.filter-bar .el-button {
  font-size: 12px;
  padding: 5px 12px;
}
.search-input :deep(.el-input__wrapper) {
  background-color: #f5f7fa;
  border-radius: 6px;
  box-shadow: 0 0 0 1px #dcdfe6 inset;
  cursor: pointer;
}
.search-input :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #c0c4cc inset;
}
.search-input :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #409eff inset;
}
.search-input :deep(.el-input__inner) {
  cursor: pointer;
}

/* ===== 地图布局 ===== */
.map-layout {
  display: flex;
  gap: 12px;
  flex: 1;
  min-height: 0;
  position: relative;
}

/* ----- 车辆列表 ----- */
.vehicle-list {
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid #e5e9f0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
  transition: width 0.3s ease;
  position: relative;
  min-width: 80px;
}
.list-header {
  padding: 8px 12px;
  background: #f8fafc;
  border-bottom: 1px solid #e5e9f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  font-size: 13px;
  color: #0a2a4a;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
}
.vehicle-list.collapsed .list-header {
  justify-content: center;
  padding: 8px 0;
}
.toggle-btn {
  font-size: 11px;
  color: #4a6a8a;
}
.collapsed-icon {
  font-size: 18px;
}
.list-count {
  background: #e5e9f0;
  padding: 0 8px;
  border-radius: 10px;
  font-size: 11px;
  color: #4a6a8a;
}
.list-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}
.list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 12px;
  cursor: pointer;
  transition: background 0.15s;
  border-left: 3px solid transparent;
  font-size: 13px;
}
.list-item:hover {
  background: #f0f4f9;
}
.list-item.active {
  background: #e6effa;
  border-left-color: #1a3a6b;
}
.list-item.selected-multi {
  background: #d4e2f7;
  border-left-color: #3b82f6;
}
.plate-badge {
  font-size: 13px;
  font-weight: 600;
  color: #1a2a4a;
}
.status-badge {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
  color: #fff;
  font-weight: 500;
}
.status-badge.行驶 { background: #22c55e; }
.status-badge.静止 { background: #6b7280; }
.status-badge.充电 { background: #eab308; }
.status-badge.离线 { background: #ef4444; }

.collapsed-list .list-item {
  justify-content: center;
  padding: 2px 0;
}
.collapsed-item .plate-badge-collapsed {
  font-size: 13px;
  font-weight: 600;
  color: #1a2a4a;
  white-space: nowrap;
}

/* ----- 拖拽手柄 ----- */
.resizer {
  position: absolute;
  top: 0;
  right: -4px;
  width: 8px;
  height: 100%;
  cursor: col-resize;
  z-index: 5;
  background: transparent;
  transition: background 0.2s;
}
.resizer:hover {
  background: rgba(26, 58, 107, 0.15);
}
.resizer::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 2px;
  height: 30px;
  background: #b0c4de;
  border-radius: 2px;
  opacity: 0.5;
  transition: opacity 0.2s;
}
.resizer:hover::after {
  opacity: 1;
}

/* ----- 地图容器 ----- */
#map-container {
  flex: 1;
  border-radius: 12px;
  border: 1px solid #d0d8e0;
  overflow: hidden;
  box-shadow: inset 0 0 0 2px rgba(255,255,255,0.6);
  min-height: 0;
  position: relative;
}
.map-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255,255,255,0.9);
  padding: 16px 32px;
  border-radius: 10px;
  font-size: 16px;
  color: #1a3a6b;
  z-index: 100;
  box-shadow: 0 2px 12px rgba(0,0,0,0.1);
}

/* ===== 高德信息窗体 - 透明背景 ===== */
.amap-info-content {
  padding: 0 !important;
  background: transparent !important;
  border: none !important;
}
.amap-info-window {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

/* ===== 浮动小卡片（80%透明度后备） ===== */
.popup-card {
  position: fixed;
  background: rgba(220, 232, 245, 0.8); /* 80% 透明度后备 */
  background: rgba(220, 232, 245, 0.55);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  padding: 12px 14px 14px;
  width: 260px;
  z-index: 1000;
  border: 1px solid rgba(255, 255, 255, 0.25);
  pointer-events: auto;
  cursor: grab;
  user-select: none;
}
.popup-card:active {
  cursor: grabbing;
}
.popup-close {
  position: absolute;
  top: 6px;
  right: 10px;
  font-size: 18px;
  color: rgba(60, 70, 80, 0.7);
  cursor: pointer;
  line-height: 1;
  pointer-events: auto;
}
.popup-close:hover {
  color: rgba(30, 40, 50, 0.9);
}

.popup-header {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 4px;
}
.popup-plate {
  font-size: 15px;
  font-weight: 700;
  color: #0a2a4a;
  letter-spacing: 0.5px;
}
.popup-status {
  font-size: 11px;
  font-weight: 600;
  padding: 0 10px;
  border-radius: 20px;
  color: #fff;
  line-height: 1.6;
}
.popup-status.行驶 { background: #22c55e; }
.popup-status.静止 { background: #6b7280; }
.popup-status.充电 { background: #eab308; }
.popup-status.离线 { background: #ef4444; }

.popup-divider {
  border-top: 1px solid rgba(192, 208, 224, 0.5);
  margin: 4px 0 6px 0;
}

.popup-info {
  display: flex;
  flex-direction: column;
  gap: 0px;
}
.popup-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 10px;
  padding: 2px 0;
  border-bottom: 1px dashed rgba(208, 222, 236, 0.5);
}
.popup-row:last-child {
  border-bottom: none;
}
.popup-label {
  color: rgba(60, 80, 100, 0.8);
  font-weight: 400;
  white-space: nowrap;
  margin-right: 4px;
}
.popup-value {
  color: #1a2a4a;
  font-weight: 500;
  text-align: right;
  word-break: break-all;
}

.popup-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  justify-content: center;
}
.popup-actions .el-button {
  flex: 1;
  max-width: 100px;
  border-radius: 20px;
  font-size: 9px;
  padding: 2px 0;
}

/* ===== 响应式 ===== */
@media (max-width: 768px) {
  .fullmap { padding: 4px 8px 8px; }
  .stats-row { gap: 4px; padding: 4px 8px; flex-wrap: nowrap; overflow-x: auto; }
  .stat-item { padding: 2px 6px 2px 4px; min-width: 36px; }
  .stat-value { font-size: 14px; }
  .stat-label { font-size: 9px; }
  .filter-bar { flex-direction: column; align-items: stretch; gap: 4px; padding: 6px 10px; }
  .filter-bar .el-select, .filter-bar .el-input { width: 100% !important; margin-left: 0 !important; }
  .map-layout { flex-direction: column; }
  .vehicle-list { width: 100% !important; max-height: 120px; }
  .vehicle-list.collapsed { width: 100% !important; max-height: 36px; }
  .resizer { display: none; }
  #map-container { min-height: 300px; }
  .popup-card { width: 220px; padding: 10px 12px; }
  .popup-plate { font-size: 13px; }
  .popup-status { font-size: 10px; padding: 0 8px; }
  .popup-row { font-size: 9px; }
  .popup-actions .el-button { max-width: 80px; font-size: 8px; }
}
</style>

<!-- ===== 自定义标记样式（非 scoped） ===== -->
<style>
.custom-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transform: translate(-50%, -50%);
  transition: transform 0.2s, filter 0.2s, box-shadow 0.2s;
  will-change: transform;
  z-index: 1;
}
.custom-marker .vehicle-icon {
  position: relative;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2.5px solid #ffffff;
  box-shadow: 0 0 0 2px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.3);
  margin-bottom: 2px;
}
.custom-marker .vehicle-icon.行驶 { background: #22c55e; }
.custom-marker .vehicle-icon.静止 { background: #6b7280; }
.custom-marker .vehicle-icon.充电 { background: #eab308; }
.custom-marker .vehicle-icon.离线 { background: #ef4444; }

.custom-marker .vehicle-icon .arrow {
  position: absolute;
  top: 50%;
  left: 50%;
  font-size: 9px;
  color: #ffffff;
  line-height: 1;
  text-shadow: 0 1px 3px rgba(0,0,0,0.6);
  pointer-events: none;
  transform-origin: center center;
}

.custom-marker .plate {
  font-size: 8px;
  font-weight: 700;
  background: rgba(255,255,255,0.85);
  padding: 0 4px;
  border-radius: 4px;
  white-space: nowrap;
  border: 1px solid rgba(255,255,255,0.8);
  text-shadow: 0 0 4px rgba(255,255,255,0.9);
}
</style>