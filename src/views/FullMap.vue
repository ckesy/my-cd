<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { supabase } from '@/utils/supabase'

// ---------- 统计数据 ----------
const stats = ref([
  { label: '全部车辆', value: 0, color: '#d32f2f' },
  { label: '行驶', value: 0, color: '#22c55e' },
  { label: '静止', value: 0, color: '#6b7280' },
  { label: '充电', value: 0, color: '#eab308' },
  { label: '离线', value: 0, color: '#ef4444' },
])

// ---------- 筛选 ----------
const orgOptions = ref(['李先生的车队（27）'])
const selectedOrg = ref(orgOptions.value[0])
const statusOptions = ref(['全部', '行驶', '静止', '充电', '离线'])
const selectedStatus = ref('全部')
const searchKeyword = ref('')
const loading = ref(false)

// ---------- 车辆数据 ----------
const vehicles = ref([])

const fetchVehicles = async () => {
  loading.value = true
  try {
    const { data, error } = await supabase.from('vehicles').select('plate, fuel_type')
    if (error) throw error

    const lngMin = 73, lngMax = 135
    const latMin = 3, latMax = 54
    const orgs = ['西马物流新能源车队', '东湖新能源车队', '南湖物流车队', '汉口新能源车队']
    const locations = [
      '湖北省武汉市青山区青化路',
      '湖北省武汉市洪山区珞喻路',
      '湖北省武汉市江汉区解放大道',
      '湖北省武汉市武昌区中北路',
      '湖北省武汉市汉阳区龙阳大道',
      '湖北省武汉市东西湖区金山大道',
      '湖北省武汉市江夏区文化大道',
      '湖北省武汉市黄陂区巨龙大道',
    ]

    const enriched = data.map(v => {
      let statusPool = ['行驶', '静止', '离线']
      if (v.fuel_type === '纯电动' || v.fuel_type === '纯电') {
        statusPool = ['行驶', '静止', '充电', '离线']
      }
      const status = statusPool[Math.floor(Math.random() * statusPool.length)]
      const direction = Math.random() * 360
      const lng = lngMin + Math.random() * (lngMax - lngMin)
      const lat = latMin + Math.random() * (latMax - latMin)
      const x = ((lng - lngMin) / (lngMax - lngMin)) * 100
      const y = ((lat - latMin) / (latMax - latMin)) * 100

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

      const location = locations[Math.floor(Math.random() * locations.length)]
      const org = orgs[Math.floor(Math.random() * orgs.length)]
      let fuelDisplay = v.fuel_type
      if (fuelDisplay === '纯电动') fuelDisplay = '纯电'

      return {
        ...v,
        fuelDisplay,
        status,
        direction,
        x,
        y,
        speed,
        rpm,
        battery,
        dcdcStatus,
        motorStatus,
        motorRpm,
        envTemp,
        motorTemp,
        reportTime,
        location,
        org,
      }
    })

    vehicles.value = enriched

    const total = enriched.length
    const running = enriched.filter(v => v.status === '行驶').length
    const stopped = enriched.filter(v => v.status === '静止').length
    const charging = enriched.filter(v => v.status === '充电').length
    const offline = enriched.filter(v => v.status === '离线').length
    stats.value = [
      { label: '全部车辆', value: total, color: '#d32f2f' },
      { label: '行驶', value: running, color: '#22c55e' },
      { label: '静止', value: stopped, color: '#6b7280' },
      { label: '充电', value: charging, color: '#eab308' },
      { label: '离线', value: offline, color: '#ef4444' },
    ]
  } catch (err) {
    ElMessage.error('加载车辆数据失败：' + err.message)
  } finally {
    loading.value = false
  }
}

// ---------- 地名数据 ----------
const places = ref([
  { name: '汉施大道', x: 20, y: 15 },
  { name: '武湖大道', x: 35, y: 30 },
  { name: '江北快速路', x: 55, y: 20 },
  { name: '汉施公路', x: 30, y: 45 },
  { name: '武湖街道', x: 45, y: 55 },
  { name: '港区高架桥', x: 70, y: 40 },
  { name: '长江', x: 15, y: 70 },
  { name: '汉施立交桥', x: 60, y: 60 },
  { name: '可可村', x: 80, y: 70 },
  { name: '谌家矶街道', x: 75, y: 80 },
  { name: '天兴洲', x: 90, y: 85 },
  { name: '天兴乡政府', x: 55, y: 80 },
  { name: '青山湿地', x: 30, y: 85 },
  { name: '临江大道', x: 20, y: 90 },
  { name: '化工大道', x: 45, y: 75 },
  { name: '青山区', x: 40, y: 92 },
  { name: '建设六路立交', x: 70, y: 92 },
  { name: '沿港路', x: 80, y: 90 },
  { name: '武商MALL·众圆', x: 35, y: 60 },
  { name: '工业路', x: 50, y: 65 },
  { name: '友谊大道立交桥', x: 25, y: 55 },
  { name: '星火村', x: 15, y: 50 },
  { name: '北湖互通', x: 85, y: 50 },
  { name: '杨春湖公园', x: 40, y: 45 },
  { name: '团结大道', x: 60, y: 50 },
  { name: '武汉站', x: 80, y: 40 },
])

// ---------- 过滤与高亮 ----------
const selectedPlates = ref([])

const filteredVehicles = computed(() => {
  return vehicles.value.filter(v => {
    const matchStatus = selectedStatus.value === '全部' || v.status === selectedStatus.value
    const matchSearch = !searchKeyword.value || v.plate.includes(searchKeyword.value)
    const matchSelected = selectedPlates.value.length === 0 || selectedPlates.value.includes(v.plate)
    return matchStatus && matchSearch && matchSelected
  })
})

const highlightedPlate = ref(null)
const highlightVehicle = (plate) => {
  // 点击列表只切换高亮，不弹窗
  highlightedPlate.value = highlightedPlate.value === plate ? null : plate
}
const isVehicleHighlighted = (plate) => {
  return highlightedPlate.value === plate || selectedPlates.value.includes(plate)
}

// ---------- 浮动小卡片（地图点击） ----------
const popupVisible = ref(false)
const popupVehicle = ref(null)
const popupStyle = ref({ left: '0px', top: '0px' })
const mapDisabled = ref(false) // 禁止地图交互

const openPopup = (vehicle, event) => {
  popupVehicle.value = vehicle
  const offsetX = 20
  const offsetY = -10
  let left = event.clientX + offsetX
  let top = event.clientY + offsetY
  const popupWidth = 240
  const popupHeight = 380
  if (left + popupWidth > window.innerWidth) {
    left = event.clientX - popupWidth - offsetX
  }
  if (top + popupHeight > window.innerHeight) {
    top = window.innerHeight - popupHeight - 10
  }
  if (top < 10) top = 10
  popupStyle.value = {
    left: left + 'px',
    top: top + 'px'
  }
  popupVisible.value = true
  highlightedPlate.value = vehicle.plate
}

const closePopup = () => {
  popupVisible.value = false
  mapDisabled.value = false // 恢复地图交互
}

// 点击地图空白处关闭浮窗
const onMapClick = (e) => {
  if (!e.target.closest('.vehicle-marker') && !e.target.closest('.popup-card')) {
    closePopup()
  }
}

// ---------- 地图交互 ----------
const zoom = ref(1)
const minZoom = 0.5
const maxZoom = 2
const zoomIn = () => {
  if (zoom.value < maxZoom) zoom.value = Math.min(zoom.value + 0.1, maxZoom)
}
const zoomOut = () => {
  if (zoom.value > minZoom) zoom.value = Math.max(zoom.value - 0.1, minZoom)
}
const resetZoom = () => { zoom.value = 1 }
const onWheel = (e) => {
  if (mapDisabled.value) return // 禁止缩放
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  const newZoom = Math.min(maxZoom, Math.max(minZoom, zoom.value + delta))
  zoom.value = newZoom
}

const mapOffsetX = ref(0)
const mapOffsetY = ref(0)
let isDraggingMap = false
let dragStartX = 0, dragStartY = 0, startOffsetX = 0, startOffsetY = 0
const onMapMouseDown = (e) => {
  if (mapDisabled.value) return // 禁止拖拽
  if (e.button !== 0) return
  isDraggingMap = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  startOffsetX = mapOffsetX.value
  startOffsetY = mapOffsetY.value
  document.addEventListener('mousemove', onMapMouseMove)
  document.addEventListener('mouseup', onMapMouseUp)
}
const onMapMouseMove = (e) => {
  if (!isDraggingMap) return
  mapOffsetX.value = startOffsetX + (e.clientX - dragStartX)
  mapOffsetY.value = startOffsetY + (e.clientY - dragStartY)
}
const onMapMouseUp = () => {
  isDraggingMap = false
  document.removeEventListener('mousemove', onMapMouseMove)
  document.removeEventListener('mouseup', onMapMouseUp)
}

// ---------- 列表折叠 ----------
const isListCollapsed = ref(false)
const toggleList = () => { isListCollapsed.value = !isListCollapsed.value }

// ---------- 列表宽度拖拽 ----------
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
  highlightedPlate.value = null
  closePopup()
}

onMounted(() => { fetchVehicles() })
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
        <el-option label="李先生的车队（27）" value="李先生的车队（27）" />
      </el-select>
      <el-select v-model="selectedStatus" placeholder="请选择作业状态" size="small" style="width:140px; margin-left:10px;">
        <el-option v-for="s in statusOptions" :key="s" :label="s" :value="s" />
      </el-select>
      <el-input :value="searchKeyword" placeholder="点击搜索车辆" size="small" style="width:160px; margin-left:10px;"
        readonly class="search-input" @click="openDialog" clearable @clear="searchKeyword = ''; tempSearchKeyword = ''" />
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

      <!-- 右侧地图 -->
      <div class="map-container" @mousedown="onMapMouseDown" @wheel="onWheel" @click="onMapClick">
        <div class="map-content" :style="{
          transform: `translate(${mapOffsetX}px, ${mapOffsetY}px) scale(${zoom})`,
          transformOrigin: 'center center'
        }">
          <div class="road road-h1"></div>
          <div class="road road-h2"></div>
          <div class="road road-v1"></div>
          <div class="road road-v2"></div>

          <div v-for="p in places" :key="p.name" class="place-label" :style="{ left: p.x + '%', top: p.y + '%' }">
            {{ p.name }}
          </div>

          <div v-for="v in filteredVehicles" :key="v.plate" class="vehicle-marker"
            :class="{ highlight: isVehicleHighlighted(v.plate) }" :style="{ left: v.x + '%', top: v.y + '%' }"
            @click.stop="openPopup(v, $event)">
            <div class="vehicle-icon" :class="v.status">
              <span class="arrow" :style="{ transform: `translate(-50%, -50%) rotate(${v.direction}deg)` }">▲</span>
            </div>
            <span class="plate">{{ v.plate }}</span>
          </div>
        </div>

        <div class="zoom-controls">
          <button class="zoom-btn" @click="zoomIn" title="放大">+</button>
          <button class="zoom-btn" @click="resetZoom" title="重置">⟲</button>
          <button class="zoom-btn" @click="zoomOut" title="缩小">−</button>
        </div>

        <!-- ===== 浮动小卡片 ===== -->
        <div v-if="popupVisible && popupVehicle" class="popup-card" :style="popupStyle" @click.stop
          @mouseenter="mapDisabled = true"
          @mouseleave="mapDisabled = false">
          <div class="popup-close" @click="closePopup">×</div>
          <!-- 头部：车牌号左，状态紧挨右侧 -->
          <div class="popup-header">
            <span class="popup-plate">{{ popupVehicle.plate }}</span>
            <span class="popup-status" :class="popupVehicle.status">{{ popupVehicle.status }}</span>
          </div>
          <!-- 分隔横线 -->
          <div class="popup-divider"></div>
          <!-- 信息单列 -->
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
            <div class="popup-row"><span class="popup-label">当前位置</span><span class="popup-value">{{ popupVehicle.location || '湖北省武汉市青山区青化路' }}</span></div>
          </div>
          <!-- 操作按钮 -->
          <div class="popup-actions">
            <el-button type="primary" size="small" plain @click="ElMessage.info('实时跟踪功能开发中')">实时跟踪</el-button>
            <el-button type="info" size="small" plain @click="ElMessage.info('轨迹回放功能开发中')">轨迹回放</el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 搜索弹窗 -->
    <el-dialog v-model="dialogVisible" title="搜索车辆" width="450px" :close-on-click-modal="false" @close="cancelSearch">
      <div style="margin-bottom:16px; display:flex; align-items:center; gap:12px;">
        <el-input v-model="tempSearchKeyword" placeholder="输入车牌号模糊搜索" clearable style="flex:1;" />
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
.map-container {
  flex: 1;
  position: relative;
  background: #e8edf5;
  border-radius: 12px;
  border: 1px solid #d0d8e0;
  overflow: hidden;
  box-shadow: inset 0 0 0 2px rgba(255,255,255,0.6);
  min-height: 0;
  cursor: grab;
}
.map-container:active {
  cursor: grabbing;
}

.map-content {
  width: 100%;
  height: 100%;
  position: relative;
  transition: transform 0.05s linear;
  will-change: transform;
}

.road {
  position: absolute;
  background: #c0cbd8;
  border-radius: 2px;
  opacity: 0.5;
}
.road-h1 {
  width: 80%;
  height: 2px;
  top: 30%;
  left: 10%;
}
.road-h2 {
  width: 70%;
  height: 2px;
  top: 65%;
  left: 15%;
}
.road-v1 {
  width: 2px;
  height: 50%;
  top: 20%;
  left: 40%;
}
.road-v2 {
  width: 2px;
  height: 40%;
  top: 35%;
  left: 70%;
}

.place-label {
  position: absolute;
  transform: translate(-50%, -50%);
  font-size: 10px;
  color: #1a3a6b;
  background: rgba(255,255,255,0.7);
  padding: 1px 6px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.8);
  white-space: nowrap;
  font-weight: 500;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
}

/* ===== 车辆标记 ===== */
.vehicle-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transition: transform 0.2s, filter 0.2s;
  z-index: 1;
}
.vehicle-marker.highlight {
  transform: translate(-50%, -50%) scale(1.5);
  filter: drop-shadow(0 0 10px rgba(26, 58, 107, 0.8));
  z-index: 10;
}

.vehicle-icon {
  position: relative;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid #ffffff;
  box-shadow: 0 2px 6px rgba(0,0,0,0.25);
  margin-bottom: 1px;
  flex-shrink: 0;
}
.vehicle-icon.行驶 { background: #22c55e; }
.vehicle-icon.静止 { background: #6b7280; }
.vehicle-icon.充电 { background: #eab308; }
.vehicle-icon.离线 { background: #ef4444; }

.vehicle-icon .arrow {
  position: absolute;
  top: 50%;
  left: 50%;
  font-size: 9px;
  color: #ffffff;
  line-height: 1;
  text-shadow: 0 1px 2px rgba(0,0,0,0.3);
  pointer-events: none;
  transform-origin: center center;
}

.plate {
  font-size: 8px;
  color: #1a2a4a;
  background: rgba(255,255,255,0.85);
  padding: 0 3px;
  border-radius: 3px;
  white-space: nowrap;
  font-weight: 600;
  border: 1px solid rgba(255,255,255,0.6);
  margin-top: 1px;
}

.zoom-controls {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: rgba(255,255,255,0.9);
  border-radius: 6px;
  padding: 3px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  border: 1px solid #e5e9f0;
}
.zoom-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  font-size: 16px;
  font-weight: 600;
  color: #1a2a4a;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;
}
.zoom-btn:hover {
  background: #e6effa;
}
.zoom-btn:active {
  background: #c0cbd8;
}

/* ===== 浮动小卡片 ===== */
.popup-card {
  position: fixed;
  background: #dce8f5; /* 更深淡蓝 */
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  padding: 10px 12px 12px;
  width: 240px;
  max-height: 400px;
  overflow-y: auto;
  z-index: 1000;
  border: 1px solid #c0d0e0;
  pointer-events: auto;
}
.popup-card::-webkit-scrollbar {
  width: 3px;
}
.popup-card::-webkit-scrollbar-thumb {
  background: #b0c4de;
  border-radius: 4px;
}
.popup-close {
  position: absolute;
  top: 4px;
  right: 8px;
  font-size: 18px;
  color: #6a7a8a;
  cursor: pointer;
  line-height: 1;
}
.popup-close:hover {
  color: #333;
}

/* 头部：车牌号左，状态紧挨右侧 */
.popup-header {
  display: flex;
  align-items: baseline;
  gap: 4px; /* 状态紧挨车牌 */
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

/* 分隔横线 */
.popup-divider {
  border-top: 1px solid #c0d0e0;
  margin: 4px 0 6px 0;
}

/* 信息单列 - 极度紧凑 */
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
  padding: 1px 0;
  border-bottom: 1px dashed #d0deec;
}
.popup-row:last-child {
  border-bottom: none;
}
.popup-label {
  color: #5a7a8a;
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

/* 操作按钮 */
.popup-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
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
  .map-container { min-height: 300px; }
  .popup-card { width: 200px; padding: 8px 10px; max-height: 340px; }
  .popup-plate { font-size: 13px; }
  .popup-status { font-size: 10px; padding: 0 8px; }
  .popup-row { font-size: 9px; }
  .popup-actions .el-button { max-width: 80px; font-size: 8px; }
}
</style>