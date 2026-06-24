<script setup>
import { ref } from 'vue'

// ---------- 统计卡片数据 ----------
const stats = ref([
  { label: '全部车辆', value: 80, color: '#1a3a6b' },
  { label: '行驶', value: 4, color: '#22c55e' },
  { label: '静止', value: 10, color: '#6b7280' },
  { label: '充电', value: 0, color: '#eab308' },
  { label: '离线', value: 66, color: '#ef4444' },
])

// ---------- 地图上的地名（带坐标百分比） ----------
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

// ---------- 车辆标记（带车牌号和坐标） ----------
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

// 筛选条件（仅示意）
const orgOptions = ref(['西马物流新能源车队（80）', '21号线（可退线）'])
const selectedOrg = ref(orgOptions.value[0])
const statusOptions = ref(['全部', '行驶', '静止', '充电', '离线'])
const selectedStatus = ref('全部')
const searchKeyword = ref('')
</script>

<template>
  <div class="fullmap">
    <!-- ====== 顶部栏 ====== -->
    <div class="header">
      <div class="title">
        <span class="brand">🚛 西马物流新能源车队（80）</span>
        <span class="sub">21号线（可退线）</span>
      </div>
    </div>

    <!-- ====== 统计卡片 ====== -->
    <div class="stats-row">
      <div v-for="s in stats" :key="s.label" class="stat-item">
        <span class="stat-label">{{ s.label }}</span>
        <span class="stat-value" :style="{ color: s.color }">{{ s.value }}</span>
      </div>
    </div>

    <!-- ====== 筛选栏 ====== -->
    <div class="filter-bar">
      <el-select v-model="selectedOrg" placeholder="请选择组织机构" size="small" style="width:200px;">
        <el-option v-for="o in orgOptions" :key="o" :label="o" :value="o" />
      </el-select>
      <el-select v-model="selectedStatus" placeholder="请选择作业状态" size="small" style="width:160px; margin-left:12px;">
        <el-option v-for="s in statusOptions" :key="s" :label="s" :value="s" />
      </el-select>
      <el-input
        v-model="searchKeyword"
        placeholder="车牌/昵称/车架"
        size="small"
        style="width:200px; margin-left:12px;"
        clearable
      />
      <el-button size="small" style="margin-left:12px;">重置</el-button>
      <el-button type="primary" size="small">搜索</el-button>
    </div>

    <!-- ====== 地图区域 ====== -->
    <div class="map-container">
      <!-- 道路（用几根线条模拟） -->
      <div class="road road-h1"></div>
      <div class="road road-h2"></div>
      <div class="road road-v1"></div>
      <div class="road road-v2"></div>

      <!-- 地名标签 -->
      <div
        v-for="p in places"
        :key="p.name"
        class="place-label"
        :style="{ left: p.x + '%', top: p.y + '%' }"
      >
        {{ p.name }}
      </div>

      <!-- 车辆标记 -->
      <div
        v-for="v in vehicles"
        :key="v.plate"
        class="vehicle-marker"
        :style="{ left: v.x + '%', top: v.y + '%' }"
      >
        <div class="vehicle-icon" :class="v.status"></div>
        <span class="plate">{{ v.plate }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fullmap {
  background: #f0f4f9;
  min-height: 100vh;
  padding: 16px 20px;
  position: relative;
}

/* ===== 顶部标题 ===== */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.title .brand {
  font-size: 20px;
  font-weight: 700;
  color: #0a2a4a;
}
.title .sub {
  font-size: 14px;
  color: #4a6a8a;
  margin-left: 16px;
  background: #e5e9f0;
  padding: 2px 12px;
  border-radius: 12px;
}

/* ===== 统计卡片 ===== */
.stats-row {
  display: flex;
  gap: 24px;
  background: #ffffff;
  padding: 12px 24px;
  border-radius: 12px;
  border: 1px solid #e5e9f0;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.stat-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.stat-label {
  font-size: 14px;
  color: #4a6a8a;
}
.stat-value {
  font-size: 20px;
  font-weight: 700;
}

/* ===== 筛选栏 ===== */
.filter-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  background: #ffffff;
  padding: 12px 20px;
  border-radius: 12px;
  border: 1px solid #e5e9f0;
  margin-bottom: 16px;
}

/* ===== 地图容器 ===== */
.map-container {
  position: relative;
  width: 100%;
  min-height: 600px;
  background: #e8edf5;
  border-radius: 16px;
  border: 1px solid #d0d8e0;
  overflow: hidden;
  box-shadow: inset 0 0 0 2px rgba(255,255,255,0.6);
}

/* ----- 模拟道路（用绝对定位的线条） ----- */
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

/* ----- 地名标签 ----- */
.place-label {
  position: absolute;
  transform: translate(-50%, -50%);
  font-size: 12px;
  color: #1a3a6b;
  background: rgba(255,255,255,0.7);
  padding: 2px 8px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.8);
  white-space: nowrap;
  font-weight: 500;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
}

/* ----- 车辆标记 ----- */
.vehicle-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
}
.vehicle-icon {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #ffffff;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  margin-bottom: 2px;
}
.vehicle-icon.行驶 { background: #22c55e; }
.vehicle-icon.静止 { background: #6b7280; }
.vehicle-icon.充电 { background: #eab308; }
.vehicle-icon.离线 { background: #ef4444; }

.plate {
  font-size: 9px;
  color: #1a2a4a;
  background: rgba(255,255,255,0.85);
  padding: 0 4px;
  border-radius: 4px;
  white-space: nowrap;
  font-weight: 600;
  border: 1px solid rgba(255,255,255,0.6);
}

/* ----- 响应式 ----- */
@media (max-width: 768px) {
  .stats-row { gap: 12px; padding: 10px 16px; }
  .filter-bar { flex-direction: column; align-items: stretch; gap: 8px; }
  .filter-bar .el-select, .filter-bar .el-input { width: 100% !important; margin-left: 0 !important; }
  .map-container { min-height: 400px; }
}
</style>