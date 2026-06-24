<script setup>
import { ref, computed } from 'vue'

// ---------- 统计卡片 ----------
const stats = ref([
  { label: '全部车辆', value: 27, color: '#1a3a6b' },
  { label: '行驶', value: 9, color: '#22c55e' },
  { label: '静止', value: 8, color: '#6b7280' },
  { label: '充电', value: 3, color: '#eab308' },
  { label: '离线', value: 7, color: '#ef4444' },
])

// ---------- 筛选 ----------
const orgOptions = ref(['李先生的车队（27）'])
const selectedOrg = ref(orgOptions.value[0])
const statusOptions = ref(['全部', '行驶', '静止', '充电', '离线'])
const selectedStatus = ref('全部')

// ---------- 车辆数据 ----------
const vehicles = ref([
  { plate: '鄂A37866D', x: 25, y: 25, status: '行驶' },
  { plate: '鄂A37616D', x: 50, y: 35, status: '静止' },
  { plate: '鄂A38891D', x: 40, y: 50, status: '离线' },
  { plate: '鄂A39397D', x: 70, y: 55, status: '行驶' },
  { plate: '鄂A33708D', x: 80, y: 65, status: '静止' },
  { plate: '鄂A18505D', x: 30, y: 70, status: '充电' },
  { plate: '鄂A30031D', x: 60, y: 75, status: '离线' },
  { plate: '鄂A31185D', x: 45, y: 80, status: '行驶' },
  { plate: '鄂A31231D', x: 55, y: 85, status: '静止' },
  { plate: '鄂A36787D', x: 65, y: 90, status: '离线' },
  { plate: '鄂A18488D', x: 35, y: 88, status: '行驶' },
  { plate: '鄂A32969D', x: 75, y: 82, status: '静止' },
  { plate: '鄂A36370D', x: 20, y: 40, status: '离线' },
  { plate: '鄂A16867D', x: 50, y: 45, status: '行驶' },
  { plate: '鄂A39378D', x: 85, y: 75, status: '充电' },
  { plate: '鄂A38990D', x: 40, y: 30, status: '静止' },
  { plate: '鄂A31102D', x: 30, y: 35, status: '行驶' },
  { plate: '鄂A32226D', x: 60, y: 50, status: '离线' },
  { plate: '鄂A18601D', x: 70, y: 45, status: '静止' },
  { plate: '鄂A13945D', x: 80, y: 55, status: '行驶' },
  { plate: '鄂A32771D', x: 25, y: 60, status: '充电' },
  { plate: '鄂A30866D', x: 45, y: 65, status: '离线' },
  { plate: '鄂A30936D', x: 60, y: 70, status: '行驶' },
  { plate: '鄂A39063D', x: 75, y: 60, status: '静止' },
  { plate: '鄂A37373D', x: 85, y: 50, status: '离线' },
  { plate: '鄂A32027D', x: 20, y: 80, status: '行驶' },
  { plate: '鄂A11345D', x: 55, y: 92, status: '静止' },
])

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
const searchKeyword = ref('')          // 主界面搜索关键词（仅显示在搜索框，应用时由弹窗确定）
const selectedPlates = ref([])         // 已勾选的车牌

// 主界面过滤（状态 + 勾选 + 主搜索关键词）
const filteredVehicles = computed(() => {
  return vehicles.value.filter(v => {
    const matchStatus = selectedStatus.value === '全部' || v.status === selectedStatus.value
    const matchSearch = !searchKeyword.value || v.plate.includes(searchKeyword.value)
    const matchSelected = selectedPlates.value.length === 0 || selectedPlates.value.includes(v.plate)
    return matchStatus && matchSearch && matchSelected
  })
})

// 单点高亮
const highlightedPlate = ref(null)
const highlightVehicle = (plate) => {
  if (highlightedPlate.value === plate) {
    highlightedPlate.value = null
  } else {
    highlightedPlate.value = plate
  }
}
const isVehicleHighlighted = (plate) => {
  return highlightedPlate.value === plate || selectedPlates.value.includes(plate)
}

// ---------- 地图缩放 ----------
const zoom = ref(1)
const minZoom = 0.5
const maxZoom = 2
const zoomIn = () => {
  if (zoom.value < maxZoom) zoom.value = Math.min(zoom.value + 0.1, maxZoom)
}
const zoomOut = () => {
  if (zoom.value > minZoom) zoom.value = Math.max(zoom.value - 0.1, minZoom)
}
const resetZoom = () => {
  zoom.value = 1
}
const onWheel = (e) => {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  const newZoom = Math.min(maxZoom, Math.max(minZoom, zoom.value + delta))
  zoom.value = newZoom
}

// ---------- 地图拖拽 ----------
const mapOffsetX = ref(0)
const mapOffsetY = ref(0)
let isDraggingMap = false
let dragStartX = 0
let dragStartY = 0
let startOffsetX = 0
let startOffsetY = 0
const onMapMouseDown = (e) => {
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
  const dx = e.clientX - dragStartX
  const dy = e.clientY - dragStartY
  mapOffsetX.value = startOffsetX + dx
  mapOffsetY.value = startOffsetY + dy
}
const onMapMouseUp = () => {
  isDraggingMap = false
  document.removeEventListener('mousemove', onMapMouseMove)
  document.removeEventListener('mouseup', onMapMouseUp)
}

// ---------- 列表折叠 ----------
const isListCollapsed = ref(false)
const toggleList = () => {
  isListCollapsed.value = !isListCollapsed.value
}

// ---------- 列表宽度拖拽 ----------
const listWidth = ref(180) // 默认80px
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

// 弹窗内过滤（仅基于 tempSearchKeyword）
const dialogFilteredVehicles = computed(() => {
  if (!tempSearchKeyword.value) return vehicles.value
  return vehicles.value.filter(v => v.plate.includes(tempSearchKeyword.value))
})

const openDialog = () => {
  // 从外部复制当前状态
  tempSearchKeyword.value = searchKeyword.value
  tempSelectedPlates.value = [...selectedPlates.value]
  dialogVisible.value = true
}

const confirmSearch = () => {
  // 应用：将临时值赋给外部
  searchKeyword.value = tempSearchKeyword.value
  selectedPlates.value = [...tempSelectedPlates.value]
  dialogVisible.value = false
}

const cancelSearch = () => {
  dialogVisible.value = false
}

// 全选/取消全选（针对弹窗内当前显示的列表）
const selectAll = () => {
  const allPlates = dialogFilteredVehicles.value.map(v => v.plate)
  // 如果当前已全选，则取消全选；否则全选
  const allSelected = allPlates.every(p => tempSelectedPlates.value.includes(p))
  if (allSelected) {
    // 移除这些
    tempSelectedPlates.value = tempSelectedPlates.value.filter(p => !allPlates.includes(p))
  } else {
    // 添加未选的
    const toAdd = allPlates.filter(p => !tempSelectedPlates.value.includes(p))
    tempSelectedPlates.value = [...tempSelectedPlates.value, ...toAdd]
  }
}

// 重置所有
const resetAll = () => {
  selectedStatus.value = '全部'
  searchKeyword.value = ''
  tempSearchKeyword.value = ''
  selectedPlates.value = []
  tempSelectedPlates.value = []
  highlightedPlate.value = null
}
</script>

<template>
  <div class="fullmap">
    <!-- 顶部标题 -->
    <div class="header">
      <div class="title">
        <span class="brand">🚛 李先生的车队</span>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-row">
      <div v-for="s in stats" :key="s.label" class="stat-item">
        <span class="stat-label">{{ s.label }}</span>
        <span class="stat-value" :style="{ color: s.color }">{{ s.value }}</span>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <el-select v-model="selectedOrg" placeholder="请选择组织机构" size="small" style="width:160px;">
        <el-option v-for="o in orgOptions" :key="o" :label="o" :value="o" />
      </el-select>
      <el-select v-model="selectedStatus" placeholder="请选择作业状态" size="small" style="width:140px; margin-left:10px;">
        <el-option v-for="s in statusOptions" :key="s" :label="s" :value="s" />
      </el-select>
      <!-- 搜索框（点击弹窗，只读） -->
      <el-input
        :value="searchKeyword"
        placeholder="点击搜索车辆"
        size="small"
        style="width:160px; margin-left:10px;"
        readonly
        class="search-input"
        @click="openDialog"
        clearable
        @clear="searchKeyword = ''; tempSearchKeyword = ''"
      />
      <el-button size="small" style="margin-left:10px;" @click="resetAll">重置</el-button>
    </div>

    <!-- 主区域 -->
    <div class="map-layout">
      <!-- 左侧车辆列表 -->
      <div
        class="vehicle-list"
        :class="{ collapsed: isListCollapsed }"
        :style="{ width: listWidth + 'px' }"
      >
        <div class="list-header" @click="toggleList">
          <span v-if="!isListCollapsed">车辆列表</span>
          <span v-else class="collapsed-icon">📋</span>
          <span v-if="!isListCollapsed" class="list-count">{{ filteredVehicles.length }}</span>
          <span class="toggle-btn">{{ isListCollapsed ? '▶' : '◀' }}</span>
        </div>
        <!-- 展开状态 -->
        <div v-show="!isListCollapsed" class="list-scroll">
          <div
            v-for="v in filteredVehicles"
            :key="v.plate"
            class="list-item"
            :class="{
              active: isVehicleHighlighted(v.plate),
              'selected-multi': selectedPlates.includes(v.plate)
            }"
            @click="highlightVehicle(v.plate)"
          >
            <span class="plate-badge">{{ v.plate }}</span>
            <span class="status-badge" :class="v.status">{{ v.status }}</span>
          </div>
        </div>
        <!-- 折叠状态 -->
        <div v-show="isListCollapsed" class="list-scroll collapsed-list">
          <div
            v-for="v in filteredVehicles"
            :key="v.plate"
            class="list-item collapsed-item"
            :class="{
              active: isVehicleHighlighted(v.plate),
              'selected-multi': selectedPlates.includes(v.plate)
            }"
            @click="highlightVehicle(v.plate)"
          >
            <span class="plate-badge-collapsed">{{ v.plate }}</span>
          </div>
        </div>

        <!-- 拖拽手柄 -->
        <div class="resizer" @mousedown="startResize"></div>
      </div>

      <!-- 右侧地图 -->
      <div
        class="map-container"
        @mousedown="onMapMouseDown"
        @wheel="onWheel"
      >
        <div
          class="map-content"
          :style="{
            transform: `translate(${mapOffsetX}px, ${mapOffsetY}px) scale(${zoom})`,
            transformOrigin: 'center center'
          }"
        >
          <div class="road road-h1"></div>
          <div class="road road-h2"></div>
          <div class="road road-v1"></div>
          <div class="road road-v2"></div>

          <div
            v-for="p in places"
            :key="p.name"
            class="place-label"
            :style="{ left: p.x + '%', top: p.y + '%' }"
          >
            {{ p.name }}
          </div>

          <div
            v-for="v in filteredVehicles"
            :key="v.plate"
            class="vehicle-marker"
            :class="{ highlight: isVehicleHighlighted(v.plate) }"
            :style="{ left: v.x + '%', top: v.y + '%' }"
            @click.stop="highlightVehicle(v.plate)"
          >
            <div class="vehicle-icon" :class="v.status"></div>
            <span class="plate">{{ v.plate }}</span>
          </div>
        </div>

        <div class="zoom-controls">
          <button class="zoom-btn" @click="zoomIn" title="放大">+</button>
          <button class="zoom-btn" @click="resetZoom" title="重置">⟲</button>
          <button class="zoom-btn" @click="zoomOut" title="缩小">−</button>
        </div>
      </div>
    </div>

    <!-- 搜索弹窗（宽度450px，列表只显示车牌号） -->
    <el-dialog
      v-model="dialogVisible"
      title="搜索车辆"
      width="450px"
      :close-on-click-modal="false"
      @close="cancelSearch"
    >
      <div style="margin-bottom:16px; display:flex; align-items:center; gap:12px;">
        <el-input
          v-model="tempSearchKeyword"
          placeholder="输入车牌号模糊搜索"
          clearable
          style="flex:1;"
        />
        <el-button type="primary" size="small" @click="selectAll">
          {{ dialogFilteredVehicles.every(v => tempSelectedPlates.includes(v.plate)) ? '取消全选' : '全选' }}
        </el-button>
      </div>
      <div style="max-height:400px; overflow-y:auto;">
        <el-checkbox-group v-model="tempSelectedPlates">
          <div
            v-for="v in dialogFilteredVehicles"
            :key="v.plate"
            style="padding:4px 0;"
          >
            <el-checkbox :label="v.plate">
              {{ v.plate }}
            </el-checkbox>
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
/* ===== 全局固定高度 ===== */
.fullmap {
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #f0f4f9;
  padding: 8px 16px 12px;
  box-sizing: border-box;
}

/* ===== 顶部标题 ===== */
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
  gap: 16px;
  background: #ffffff;
  padding: 6px 16px;
  border-radius: 10px;
  border: 1px solid #e5e9f0;
  margin-bottom: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.stat-item {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.stat-label {
  font-size: 12px;
  color: #4a6a8a;
}
.stat-value {
  font-size: 16px;
  font-weight: 700;
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

/* 折叠样式 */
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

/* 模拟道路 */
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

/* 地名标签 */
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

/* 车辆标记 */
.vehicle-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transition: transform 0.2s, filter 0.2s;
}
.vehicle-marker.highlight {
  transform: translate(-50%, -50%) scale(1.5);
  filter: drop-shadow(0 0 10px rgba(26, 58, 107, 0.8));
  z-index: 10;
}
.vehicle-icon {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid #ffffff;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  margin-bottom: 1px;
}
.vehicle-icon.行驶 { background: #22c55e; }
.vehicle-icon.静止 { background: #6b7280; }
.vehicle-icon.充电 { background: #eab308; }
.vehicle-icon.离线 { background: #ef4444; }

.plate {
  font-size: 8px;
  color: #1a2a4a;
  background: rgba(255,255,255,0.85);
  padding: 0 3px;
  border-radius: 3px;
  white-space: nowrap;
  font-weight: 600;
  border: 1px solid rgba(255,255,255,0.6);
}

/* 缩放控制 */
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

@media (max-width: 768px) {
  .fullmap { padding: 4px 8px 8px; }
  .stats-row { gap: 8px; padding: 4px 10px; }
  .filter-bar { flex-direction: column; align-items: stretch; gap: 4px; padding: 6px 10px; }
  .filter-bar .el-select, .filter-bar .el-input { width: 100% !important; margin-left: 0 !important; }
  .map-layout { flex-direction: column; }
  .vehicle-list { width: 100% !important; max-height: 120px; }
  .vehicle-list.collapsed { width: 100% !important; max-height: 36px; }
  .resizer { display: none; }
  .map-container { min-height: 300px; }
}
</style>