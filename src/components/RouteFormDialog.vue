<template>
  <el-dialog
    :model-value="modelValue"
    :title="readonly ? '查看路线' : (isEdit ? '编辑路线' : '新增路线')"
    width="1440px"
    top="4vh"
    destroy-on-close
    :close-on-click-modal="false"
    class="route-form-dialog"
    @update:model-value="$emit('update:modelValue', $event)"
    @opened="handleOpened"
    @closed="handleClosed"
  >
    <div class="rf-stage">
      <div ref="mapRef" class="map-container"></div>
      <svg ref="rangingSvgRef" class="ranging-svg" xmlns="http://www.w3.org/2000/svg"></svg>

      <!-- ============================================================
           左上：基础信息卡
           ============================================================ -->
      <transition name="slide-left">
        <div v-show="!infoCardCollapsed" class="floating-card info-card">
          <div class="card-header">
            <div class="card-title">
              <span class="card-title-icon info-icon">
                <el-icon><Document /></el-icon>
              </span>
              <span class="card-title-text">{{ readonly ? '基础信息（只读）' : '基础信息' }}</span>
            </div>
            <button class="collapse-btn" @click="toggleInfoCard" title="隐藏">
              <el-icon><ArrowLeft /></el-icon>
            </button>
          </div>

          <div class="card-body">
            <el-form :model="form" label-position="top" size="default" class="info-form">
              <!-- 所属机构 -->
              <el-form-item label="所属机构" required>
                <el-select
                  v-model="form.org"
                  :disabled="readonly"
                  placeholder="请选择所属机构"
                  clearable
                  filterable
                  style="width:100%"
                  popper-class="route-org-popper"
                >
                  <el-option
                    v-for="o in sortedOrgList"
                    :key="o.id || o.name"
                    :label="o.name"
                    :value="o.name"
                  />
                </el-select>
              </el-form-item>

              <!-- 装货点 -->
              <el-form-item label="装货点" required>
                <el-select
                  :ref="el => pickupRef = el"
                  v-model="form.pickup_point"
                  :disabled="readonly"
                  placeholder="请选择装货点"
                  clearable
                  filterable
                  style="width:100%"
                  popper-class="fence-select-popper pickup-fence-popper"
                >
                  <el-option v-for="f in fenceList" :key="f.id" :label="f.name" :value="f.name" />
                  <template v-if="!readonly" #footer>
                    <div
                      class="fence-cta fence-cta-pickup"
                      @mousedown.stop.prevent
                      @click.stop.prevent="openCreateFence('pickup')"
                    >
                      <span class="fence-cta-hint">
                        <el-icon class="hint-icon"><InfoFilled /></el-icon>
                        没有合适围栏？
                      </span>
                      <span class="fence-cta-action">
                        <span class="plus-bubble"><el-icon><Plus /></el-icon></span>
                        <span class="action-text">去新建装货围栏</span>
                        <el-icon class="arrow-icon"><ArrowRight /></el-icon>
                      </span>
                    </div>
                  </template>
                </el-select>
              </el-form-item>

              <!-- 交换按钮 -->
              <div v-if="!readonly" class="swap-divider">
                <button
                  type="button"
                  class="swap-btn"
                  :disabled="!form.pickup_point && !form.delivery_point"
                  @click.stop.prevent="swapPickupDelivery"
                  title="一键交换装货点和卸货点"
                >
                  <el-icon><Sort /></el-icon>
                </button>
              </div>

              <!-- 卸货点 -->
              <el-form-item label="卸货点" required>
                <el-select
                  :ref="el => deliveryRef = el"
                  v-model="form.delivery_point"
                  :disabled="readonly"
                  placeholder="请选择卸货点"
                  clearable
                  filterable
                  style="width:100%"
                  popper-class="fence-select-popper delivery-fence-popper"
                >
                  <el-option v-for="f in fenceList" :key="f.id" :label="f.name" :value="f.name" />
                  <template v-if="!readonly" #footer>
                    <div
                      class="fence-cta fence-cta-delivery"
                      @mousedown.stop.prevent
                      @click.stop.prevent="openCreateFence('delivery')"
                    >
                      <span class="fence-cta-hint">
                        <el-icon class="hint-icon"><InfoFilled /></el-icon>
                        没有合适围栏？
                      </span>
                      <span class="fence-cta-action">
                        <span class="plus-bubble"><el-icon><Plus /></el-icon></span>
                        <span class="action-text">去新建卸货围栏</span>
                        <el-icon class="arrow-icon"><ArrowRight /></el-icon>
                      </span>
                    </div>
                  </template>
                </el-select>
              </el-form-item>

              <!-- 路线名称 -->
              <el-form-item label="路线名称" required>
                <el-input v-model="form.name" :disabled="readonly" placeholder="自动生成或手动输入">
                  <template v-if="!readonly" #suffix>
                    <el-tooltip content="根据装货点 + 卸货点自动生成" placement="top">
                      <span class="auto-btn" @click="autoGenerateName">
                        <el-icon><MagicStick /></el-icon>
                      </span>
                    </el-tooltip>
                  </template>
                </el-input>
              </el-form-item>

              <!-- 备注 -->
              <el-form-item label="备注">
                <el-input
                  v-model="form.remark"
                  :disabled="readonly"
                  type="textarea"
                  :rows="3"
                  placeholder="请输入备注"
                  maxlength="100"
                  show-word-limit
                />
              </el-form-item>
            </el-form>
          </div>
        </div>
      </transition>

      <transition name="scale-in">
        <button
          v-show="infoCardCollapsed"
          class="collapsed-trigger info-trigger"
          @click="toggleInfoCard"
          title="展开基础信息"
        >
          <el-icon><Document /></el-icon>
        </button>
      </transition>

      <!-- ============================================================
           右上：方案卡列
           ============================================================ -->
      <transition name="slide-right">
        <div v-show="!planPanelCollapsed" class="floating-card plan-panel">
          <div class="card-header">
            <div class="card-title">
              <span class="card-title-icon plan-icon">
                <el-icon><Guide /></el-icon>
              </span>
              <span class="card-title-text">方案配置</span>
              <span class="plan-count-badge">{{ form.plans.length }}</span>
            </div>
            <button class="collapse-btn" @click="togglePlanPanel" title="隐藏">
              <el-icon><ArrowRight /></el-icon>
            </button>
          </div>

          <div class="card-body plan-panel-body">
            <div v-if="activePlanKey !== null" class="highlight-tip">
              <el-icon><Aim /></el-icon>
              <span>已高亮方案 {{ activePlanIndexDisplay }}，再次点击卡片取消</span>
            </div>

            <div
              v-for="(plan, idx) in form.plans"
              :key="plan._key"
              class="plan-block"
              :class="{
                'is-active': activePlanKey === plan._key,
                'is-dimmed': activePlanKey !== null && activePlanKey !== plan._key,
              }"
              :style="{ '--plan-color': getPlanColorHex(plan._key) }"
              @click="handlePlanCardClick(plan, $event)"
            >
              <div class="plan-block-header">
                <div class="plan-block-title">
                  <span class="plan-index-badge">
                    <span class="badge-num">{{ idx + 1 }}</span>
                  </span>
                  <span class="plan-title-text">方案 {{ idx + 1 }}</span>
                  <span
                    v-if="planOverlays.has(plan._key)"
                    class="plan-ready-tag"
                    :style="{ '--tag-color': getPlanColorHex(plan._key) }"
                  >
                    已规划
                  </span>
                </div>
                <el-button
                  v-if="!readonly && form.plans.length > 1"
                  type="danger"
                  plain
                  size="small"
                  class="del-plan-btn"
                  @click.stop="removePlan(idx)"
                >
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>

              <div class="plan-field">
                <span class="plan-field-label">方案名称</span>
                <el-input v-model="plan.name" :disabled="readonly" placeholder="如：方案一" size="default" />
              </div>

              <div class="plan-field">
                <span class="plan-field-label">方案类型</span>
                <el-select v-model="plan.type" :disabled="readonly" size="default" style="width:100%">
                  <el-option label="途径点自动生成" value="auto" />
                  <el-option label="手动录入" value="manual" />
                </el-select>
              </div>

              <div class="waypoints-section">
                <div class="waypoints-title">
                  <el-icon><Location /></el-icon>
                  <span>途径点</span>
                  <span v-if="plan.waypoints.length" class="wp-count">
                    {{ plan.waypoints.length }} 个
                  </span>
                </div>
                <div class="waypoints-list">
                  <div
                    v-for="(wp, wpIdx) in plan.waypoints"
                    :key="wp.id"
                    class="waypoint-row"
                  >
                    <span class="wp-marker">
                      <span class="wp-num">{{ wpIdx + 1 }}</span>
                    </span>
                    <el-input
                      v-model="wp.value"
                      :disabled="readonly"
                      placeholder="途径点名称"
                      size="default"
                      class="wp-input"
                    />
                    <button
                      v-if="!readonly"
                      class="wp-del"
                      @click.stop="removeWaypoint(idx, wp.id)"
                      title="删除"
                    >
                      <el-icon><Close /></el-icon>
                    </button>
                  </div>
                  <div v-if="!plan.waypoints.length" class="wp-empty">
                    暂无途径点
                  </div>
                </div>
                <div v-if="!readonly" class="wp-action-row">
                  <button class="add-waypoint-btn" @click.stop="addWaypoint(idx)">
                    <el-icon class="btn-icon"><Plus /></el-icon>
                    <span>手动添加</span>
                  </button>
                  <button
                    class="map-pick-btn"
                    :class="{ active: pickingPlanKey === plan._key }"
                    @click.stop="togglePickingWaypoint(idx)"
                  >
                    <el-icon class="btn-icon"><Position /></el-icon>
                    <span>{{ pickingPlanKey === plan._key ? '结束选点' : '地图选点' }}</span>
                  </button>
                </div>
              </div>

              <button
                class="plan-route-btn"
                :class="{ loading: planningIndex === idx }"
                :disabled="planningIndex === idx"
                @click.stop="handlePlanRoute(idx)"
              >
                <el-icon v-if="planningIndex === idx" class="spin-icon"><Loading /></el-icon>
                <el-icon v-else class="btn-icon"><Guide /></el-icon>
                <span>{{ planningIndex === idx ? '规划中...' : (readonly ? '查看路线' : '规划路线') }}</span>
              </button>

              <div class="plan-meta">
                <div class="meta-cell">
                  <span class="meta-lbl">里程预估</span>
                  <span class="meta-val">
                    <template v-if="plan.distance">
                      {{ plan.distance }}<small>km</small>
                    </template>
                    <template v-else>--</template>
                  </span>
                </div>
                <div class="meta-cell">
                  <span class="meta-lbl">预估时间</span>
                  <span class="meta-val">{{ plan.duration || '--' }}</span>
                </div>
              </div>

              <div class="plan-toll">
                <span class="meta-lbl">预估高速费</span>
                <el-input v-model="plan.toll" :disabled="readonly" placeholder="请输入" size="default" style="width:130px">
                  <template #append>元</template>
                </el-input>
              </div>
            </div>

            <button v-if="!readonly" class="add-plan-btn" @click="addPlan">
              <el-icon class="btn-icon"><Plus /></el-icon>
              <span>添加方案</span>
            </button>
          </div>
        </div>
      </transition>

      <transition name="scale-in">
        <button
          v-show="planPanelCollapsed"
          class="collapsed-trigger plan-trigger"
          @click="togglePlanPanel"
          title="展开方案配置"
        >
          <el-icon><Guide /></el-icon>
          <span class="trigger-badge">{{ form.plans.length }}</span>
        </button>
      </transition>

      <div class="map-controls">
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

      <transition name="summary-slide">
        <div v-if="pickingPlanKey !== null" class="pick-tip">
          <el-icon class="pick-tip-icon"><Position /></el-icon>
          <span class="pick-tip-text">
            点击地图为「<b>方案 {{ pickingPlanIndexDisplay }}</b>」添加途径点
          </span>
          <button class="pick-tip-btn" @click="stopPickingWaypoint">完成</button>
        </div>
      </transition>

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
              <span class="summary-value highlight">{{ formatDistance(totalDistance) }}</span>
            </div>
          </div>
          <div class="ranging-summary-tip">右键结束当前段 · 再次点击开始新段</div>
        </div>
      </transition>

      <!-- ⭐ 详情模式自动规划中的提示 -->
      <transition name="summary-slide">
        <div v-if="autoPlanning" class="auto-plan-tip">
          <div class="auto-plan-spinner"></div>
          <span>正在自动展示路线…</span>
        </div>
      </transition>

      <div v-if="!isMapReady" class="map-loading-overlay">
        <div class="loading-card">
          <div class="loading-ring"></div>
          <p>地图加载中…</p>
        </div>
      </div>
    </div>

    <template #footer>
      <template v-if="readonly">
        <el-button type="primary" class="btn-primary" size="default" @click="$emit('update:modelValue', false)">关闭</el-button>
      </template>
      <template v-else>
        <el-button size="default" @click="$emit('update:modelValue', false)">取消</el-button>
        <el-button type="primary" class="btn-primary" :loading="saving" size="default" @click="handleSubmit">确定</el-button>
      </template>
    </template>

    <teleport to="body">
      <AddEleFenceDialog
        v-model="showFenceDialog"
        :edit-data="null"
        @success="handleFenceSuccess"
      />
    </teleport>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, nextTick, watch, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Location, Plus, Close, Guide, MagicStick,
  InfoFilled, ArrowRight, ArrowLeft, Aim, Position, Loading,
  Delete, Document, Sort,
} from '@element-plus/icons-vue'
import AMapLoader from '@amap/amap-jsapi-loader'
import { supabase } from '@/utils/supabase'
import AddEleFenceDialog from '@/components/AddEleFenceDialog.vue'

const props = defineProps({
  modelValue: Boolean,
  editData: { type: Object, default: null },
  readonly: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'success'])

const AMAP_KEY = '273f5c474604b71906674aac159b8f45'

// ============================================================
// 方案配色
// ============================================================
const PLAN_COLORS = [
  { main: '#2563EB', light: '#DBEAFE', name: '蓝' },
  { main: '#8B5CF6', light: '#EDE9FE', name: '紫' },
  { main: '#EC4899', light: '#FCE7F3', name: '粉' },
  { main: '#06B6D4', light: '#CFFAFE', name: '青' },
  { main: '#F97316', light: '#FFEDD5', name: '橙' },
  { main: '#6366F1', light: '#E0E7FF', name: '靛' },
  { main: '#14B8A6', light: '#CCFBF1', name: '青绿' },
  { main: '#A855F7', light: '#F3E8FF', name: '紫罗兰' },
]

// ============================================================
// 数据隔离
// ============================================================
const currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('currentUser') || '{}') }
  catch { return {} }
})()
const isAdmin = currentUser.role === 'admin'
const isCustomer = !isAdmin
const isSubAccount = !!currentUser.isSubAccount
const myAccount = currentUser.masterAccount || currentUser.account || ''
const myPhone = currentUser.masterPhone || currentUser.phone || ''
const myCustomerId = ref(currentUser.customerId || null)

// ⭐ 子账号机构信息
const myOrgName = ref(isSubAccount ? String(currentUser.orgName || '').trim() || null : null)
const myOrgLevel = ref(isSubAccount ? (Number(currentUser.orgLevel) || 1) : null)

const isRootOrgSubAccount = computed(() =>
  isSubAccount && Number(myOrgLevel.value) === 1
)
const needOrgFilter = computed(() =>
  isCustomer && isSubAccount && Number(myOrgLevel.value) >= 2
)

const loadMyCustomerId = async () => {
  if (!isCustomer || myCustomerId.value || !myPhone) return
  try {
    const { data } = await supabase.from('customers').select('id, name').eq('phone', myPhone).maybeSingle()
    if (data) {
      myCustomerId.value = data.id
      if (data.name && !currentUser.customerName) currentUser.customerName = data.name
    }
  } catch (e) { }
}

// ⭐ 兜底反查
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
  } catch (e) { }
}

// ============================================================
// 状态
// ============================================================
const isEdit = computed(() => !!props.editData?.id)
const saving = ref(false)
const infoCardCollapsed = ref(false)
const planPanelCollapsed = ref(false)
const autoPlanning = ref(false)

const fenceList = ref([])
const orgList = ref([])

// ⭐ 所属机构下拉：从 organizations 读真实数据，按 level 排序
//    二级机构子账号只显示本机构（其他情况显示全部）
const sortedOrgList = computed(() => {
  const list = [...orgList.value]
  const roots = list.filter(o => o.is_root === true || Number(o.level) === 1)
  const nonRoots = list.filter(o => !(o.is_root === true || Number(o.level) === 1))
  nonRoots.sort((a, b) => {
    const la = Number(a.level) || 2
    const lb = Number(b.level) || 2
    if (la !== lb) return la - lb
    return (a.id || 0) - (b.id || 0)
  })
  return [...roots, ...nonRoots]
})

// ⭐ 客户真实根节点（用于新增时的默认值）
const customerRootOrg = computed(() => {
  return orgList.value.find(o => o.is_root === true || Number(o.level) === 1) || null
})

const showFenceDialog = ref(false)
const fenceTarget = ref(null)
const pickupRef = ref(null)
const deliveryRef = ref(null)

let planKeyCounter = 1
let waypointIdCounter = 1

const createWaypoint = (value = '', lng = null, lat = null) => ({
  id: waypointIdCounter++,
  value,
  lng,
  lat,
})

const createPlan = (name) => ({
  _key: planKeyCounter++,
  name: name || `方案${planKeyCounter - 1}`,
  type: 'auto',
  waypoints: [],
  distance: '',
  duration: '',
  toll: '',
})

const form = reactive({
  id: null,
  name: '',
  org: '',
  pickup_point: '',
  delivery_point: '',
  remark: '',
  plans: [createPlan('方案一')],
})

// ============================================================
// 交换装货点 / 卸货点
// ============================================================
const swapPickupDelivery = () => {
  if (!form.pickup_point && !form.delivery_point) {
    ElMessage.warning('装货点和卸货点都为空，无法交换')
    return
  }
  const tmp = form.pickup_point
  form.pickup_point = form.delivery_point
  form.delivery_point = tmp
  ElMessage.success({ message: '已交换装货点和卸货点', duration: 1200 })
}

// ============================================================
// 方案颜色
// ============================================================
const planColorMap = new Map()
let colorSeedCounter = 0

const getPlanColorIndex = (planKey) => {
  if (!planColorMap.has(planKey)) {
    planColorMap.set(planKey, colorSeedCounter % PLAN_COLORS.length)
    colorSeedCounter++
  }
  return planColorMap.get(planKey)
}

const getPlanColor = (planKey) => PLAN_COLORS[getPlanColorIndex(planKey)]
const getPlanColorHex = (planKey) => getPlanColor(planKey).main

// ============================================================
// 方案路线 & 围栏 绘制
// ============================================================
const planOverlays = new Map()
const activePlanKey = ref(null)

const activePlanIndexDisplay = computed(() => {
  if (activePlanKey.value === null) return ''
  const idx = form.plans.findIndex(p => p._key === activePlanKey.value)
  return idx >= 0 ? idx + 1 : ''
})

const clearPlanOverlay = (planKey) => {
  const record = planOverlays.get(planKey)
  if (!record || !map) return
  try { if (record.polyline) map.remove(record.polyline) } catch (e) { }
  ;(record.markers || []).forEach(m => { try { map.remove(m) } catch (e) { } })
  ;(record.fenceOverlays || []).forEach(o => { try { map.remove(o) } catch (e) { } })
  planOverlays.delete(planKey)
}

const clearAllPlanOverlays = () => {
  Array.from(planOverlays.keys()).forEach(k => clearPlanOverlay(k))
}

const createEndpointMarker = (position, colorHex, num, type) => {
  const container = document.createElement('div')
  container.className = 'route-endpoint'
  container.style.setProperty('--color', colorHex)
  container.innerHTML = `
    <span class="endpoint-num">${num}</span>
    <span class="endpoint-text">${type}</span>
  `
  return new AMapLib.Marker({
    position,
    content: container,
    offset: new AMapLib.Pixel(-30, -16),
    zIndex: 300,
  })
}

const createWaypointMarker = (position, colorHex, num, subIdx) => {
  const container = document.createElement('div')
  container.className = 'route-waypoint'
  container.style.setProperty('--color', colorHex)
  container.innerHTML = `<span class="waypoint-num">${num}-${subIdx}</span>`
  return new AMapLib.Marker({
    position,
    content: container,
    offset: new AMapLib.Pixel(-20, -14),
    zIndex: 290,
  })
}

const parseFencePoints = (points) => {
  if (!points) return []
  return String(points).split(';').map(s => {
    const parts = s.split(',')
    const lng = Number(parts[0])
    const lat = Number(parts[1])
    return (isNaN(lng) || isNaN(lat)) ? null : [lng, lat]
  }).filter(Boolean)
}

const drawFenceShape = (fence, colorHex, type) => {
  if (!map || !AMapLib || !fence) return []
  const overlays = []
  const isStart = type === 'pickup'
  const strokeStyle = isStart ? 'solid' : 'dashed'
  const fillOpacity = isStart ? 0.15 : 0.08

  try {
    if (fence.shape === 'circle' && fence.center) {
      const parts = String(fence.center).split(',')
      const lng = Number(parts[0])
      const lat = Number(parts[1])
      if (!isNaN(lng) && !isNaN(lat)) {
        const radius = Number(fence.radius) || 200
        const circle = new AMapLib.Circle({
          center: [lng, lat],
          radius,
          strokeColor: colorHex,
          strokeWeight: 3,
          strokeOpacity: 0.9,
          strokeStyle,
          fillColor: colorHex,
          fillOpacity,
          zIndex: 15,
          bubble: true,
        })
        map.add(circle)
        overlays.push(circle)
      }
    } else if (fence.shape === 'polygon' && fence.points) {
      const path = parseFencePoints(fence.points)
      if (path.length >= 3) {
        const polygon = new AMapLib.Polygon({
          path,
          strokeColor: colorHex,
          strokeWeight: 3,
          strokeOpacity: 0.9,
          strokeStyle,
          fillColor: colorHex,
          fillOpacity,
          zIndex: 15,
        })
        map.add(polygon)
        overlays.push(polygon)
      }
    } else if (fence.shape === 'polyline' && fence.points) {
      const path = parseFencePoints(fence.points)
      if (path.length >= 2) {
        const polyline = new AMapLib.Polyline({
          path,
          strokeColor: colorHex,
          strokeWeight: 4,
          strokeOpacity: 0.9,
          strokeStyle,
          zIndex: 15,
        })
        map.add(polyline)
        overlays.push(polyline)
      }
    }
  } catch (e) {
    console.warn('[route-form] 绘制围栏失败', e)
  }

  return overlays
}

const drawPlanRoute = (planKey, planIdx, fullPath, originLngLat, destLngLat, waypointLngLats) => {
  if (!map || !AMapLib || !fullPath || fullPath.length < 2) return
  const color = getPlanColor(planKey)

  clearPlanOverlay(planKey)

  const polyline = new AMapLib.Polyline({
    path: fullPath,
    strokeColor: color.main,
    strokeWeight: 7,
    strokeOpacity: 0.88,
    lineJoin: 'round',
    lineCap: 'round',
    zIndex: 30 + getPlanColorIndex(planKey),
    map: map,
  })

  const markers = []

  const startMarker = createEndpointMarker(originLngLat, color.main, planIdx + 1, '起')
  map.add(startMarker)
  markers.push(startMarker)

  const endMarker = createEndpointMarker(destLngLat, color.main, planIdx + 1, '终')
  map.add(endMarker)
  markers.push(endMarker)

  ;(waypointLngLats || []).forEach((ll, i) => {
    const m = createWaypointMarker(ll, color.main, planIdx + 1, i + 1)
    map.add(m)
    markers.push(m)
  })

  const fenceOverlays = []
  const pickupFence = findFenceByName(form.pickup_point)
  const deliveryFence = findFenceByName(form.delivery_point)
  if (pickupFence) {
    fenceOverlays.push(...drawFenceShape(pickupFence, color.main, 'pickup'))
  }
  if (deliveryFence) {
    fenceOverlays.push(...drawFenceShape(deliveryFence, color.main, 'delivery'))
  }

  planOverlays.set(planKey, { polyline, markers, fenceOverlays })

  const allOverlays = []
  planOverlays.forEach(r => {
    if (r.polyline) allOverlays.push(r.polyline)
    ;(r.markers || []).forEach(m => allOverlays.push(m))
    ;(r.fenceOverlays || []).forEach(o => allOverlays.push(o))
  })
  if (allOverlays.length) {
    try { map.setFitView(allOverlays, false, [120, 120, 120, 120]) } catch (e) { /* noop */ }
  }

  updatePlanHighlight()
}

const handlePlanCardClick = (plan, e) => {
  const target = e?.target
  if (target && target.closest) {
    const noToggle = target.closest('.el-input, .el-select, .el-input-number, .el-button, .wp-del, .add-waypoint-btn, .map-pick-btn, .plan-route-btn, .del-plan-btn, textarea, input, select, button')
    if (noToggle) return
  }

  if (activePlanKey.value === plan._key) {
    activePlanKey.value = null
  } else {
    activePlanKey.value = plan._key
  }
  updatePlanHighlight()
}

const updatePlanHighlight = () => {
  planOverlays.forEach((record, planKey) => {
    const isActive = activePlanKey.value === null || activePlanKey.value === planKey
    const isFocused = activePlanKey.value === planKey

    if (record.polyline) {
      try {
        record.polyline.setOptions({
          strokeWeight: isFocused ? 10 : (isActive ? 7 : 4),
          strokeOpacity: isFocused ? 1 : (isActive ? 0.85 : 0.22),
          zIndex: isFocused ? 50 : (isActive ? 30 + getPlanColorIndex(planKey) : 10),
        })
      } catch (err) { /* noop */ }
    }

    ;(record.fenceOverlays || []).forEach(o => {
      try {
        o.setOptions({
          strokeOpacity: isFocused ? 1 : (isActive ? 0.9 : 0.15),
          fillOpacity: isFocused ? 0.2 : (isActive ? 0.1 : 0.03),
        })
      } catch (err) { /* noop */ }
    })

    ;(record.markers || []).forEach(m => {
      const c = m.getContent()
      if (c && c.classList) {
        if (isActive) c.classList.remove('dimmed')
        else c.classList.add('dimmed')
      }
    })
  })
}

// ============================================================
// 围栏坐标提取
// ============================================================
const findFenceByName = (name) => {
  if (!name) return null
  return fenceList.value.find(f => f.name === name) || null
}

const getFenceCoord = (fence) => {
  if (!fence) return null
  try {
    if (fence.shape === 'circle' && fence.center) {
      const parts = String(fence.center).split(',')
      const lng = Number(parts[0])
      const lat = Number(parts[1])
      if (!isNaN(lng) && !isNaN(lat)) return [lng, lat]
    }
    if ((fence.shape === 'polygon' || fence.shape === 'polyline') && fence.points) {
      const first = String(fence.points).split(';')[0]
      if (first) {
        const parts = first.split(',')
        const lng = Number(parts[0])
        const lat = Number(parts[1])
        if (!isNaN(lng) && !isNaN(lat)) return [lng, lat]
      }
    }
  } catch (e) {
    console.warn('[route-form] 解析围栏坐标失败', e)
  }
  return null
}

// ============================================================
// 地图选点
// ============================================================
const pickingPlanKey = ref(null)

const pickingPlanIndexDisplay = computed(() => {
  if (pickingPlanKey.value === null) return ''
  const idx = form.plans.findIndex(p => p._key === pickingPlanKey.value)
  return idx >= 0 ? idx + 1 : ''
})

const togglePickingWaypoint = (planIdx) => {
  if (props.readonly) return
  const plan = form.plans[planIdx]
  if (!plan) return
  if (pickingPlanKey.value === plan._key) {
    stopPickingWaypoint()
    return
  }
  if (rangingActive.value) stopRanging()
  pickingPlanKey.value = plan._key
  if (map) {
    try { map.setDefaultCursor('crosshair') } catch (e) { /* noop */ }
  }
  if (!infoCardCollapsed.value) infoCardCollapsed.value = true
  ElMessage.info({ message: '请在地图上点击添加途径点', duration: 2000 })
}

const stopPickingWaypoint = () => {
  pickingPlanKey.value = null
  if (map) {
    try { map.setDefaultCursor('default') } catch (e) { /* noop */ }
  }
}

const reverseGeocode = (lng, lat) => {
  return new Promise((resolve) => {
    if (!AMapLib) return resolve('')
    const geocoder = new AMapLib.Geocoder()
    geocoder.getAddress([lng, lat], (status, result) => {
      if (status === 'complete' && result.regeocode) {
        resolve(result.regeocode.formattedAddress || '')
      } else {
        resolve('')
      }
    })
  })
}

const handleMapPickWaypoint = async (e) => {
  if (props.readonly) return
  const planKey = pickingPlanKey.value
  if (planKey === null) return
  const planIdx = form.plans.findIndex(p => p._key === planKey)
  if (planIdx === -1) return

  const lng = e.lnglat.getLng()
  const lat = e.lnglat.getLat()

  let address = ''
  try { address = await reverseGeocode(lng, lat) } catch (err) { }

  const plan = form.plans[planIdx]
  plan.waypoints.push(createWaypoint(
    address || `${lng.toFixed(6)}, ${lat.toFixed(6)}`,
    lng, lat
  ))

  ElMessage.success({
    message: `方案 ${planIdx + 1} 已添加途径点 ${plan.waypoints.length}`,
    duration: 1500,
  })
}

// ============================================================
// 页面滚动锁
// ============================================================
const lockPageScroll = () => {
  try {
    const body = document.body
    const html = document.documentElement
    body.dataset._prevOverflow = body.style.overflow || ''
    html.dataset._prevOverflow = html.style.overflow || ''
    body.style.overflow = 'hidden'
    html.style.overflow = 'hidden'
    const mainContent = document.querySelector('.main-content')
    if (mainContent) {
      mainContent.dataset._prevOverflow = mainContent.style.overflow || ''
      mainContent.style.overflow = 'hidden'
    }
  } catch (e) { /* noop */ }
}

const unlockPageScroll = () => {
  try {
    const body = document.body
    const html = document.documentElement
    body.style.overflow = body.dataset._prevOverflow || ''
    html.style.overflow = html.dataset._prevOverflow || ''
    delete body.dataset._prevOverflow
    delete html.dataset._prevOverflow
    const mainContent = document.querySelector('.main-content')
    if (mainContent) {
      mainContent.style.overflow = mainContent.dataset._prevOverflow || ''
      delete mainContent.dataset._prevOverflow
    }
  } catch (e) { /* noop */ }
}

// ============================================================
// 折叠控制
// ============================================================
const toggleInfoCard = () => { infoCardCollapsed.value = !infoCardCollapsed.value }
const togglePlanPanel = () => { planPanelCollapsed.value = !planPanelCollapsed.value }

// ============================================================
// ⭐ 自动规划所有方案（详情模式用）
// ============================================================
const autoPlanAllRoutes = async () => {
  if (!props.readonly) return
  if (!form.pickup_point || !form.delivery_point) return
  if (!form.plans || form.plans.length === 0) return
  if (!map || !AMapLib) return

  autoPlanning.value = true
  try {
    for (let i = 0; i < form.plans.length; i++) {
      await handlePlanRoute(i, true)
    }
    activePlanKey.value = null
    updatePlanHighlight()
  } finally {
    autoPlanning.value = false
  }
}

// ============================================================
// 弹窗打开
// ============================================================
const handleOpened = async () => {
  try { lockPageScroll() } catch (e) { /* noop */ }
  await nextTick()

  // ⭐ 先加载机构信息（含兜底反查）
  if (isCustomer && isSubAccount) {
    await loadMyOrgInfo()
  }
  await loadMyCustomerId()

  try {
    await Promise.all([loadOrgs(), loadFences()])
  } catch (e) {
    console.warn('[route-form] 加载基础数据失败', e)
  }

  if (isEdit.value && props.editData) {
    form.id = props.editData.id
    form.name = props.editData.name || ''
    form.org = props.editData.org || ''
    form.pickup_point = props.editData.pickup_point || ''
    form.delivery_point = props.editData.delivery_point || ''
    form.remark = props.editData.remark || ''
    const plans = props.editData.plans
    if (Array.isArray(plans) && plans.length) {
      form.plans = plans.map(p => ({
        _key: planKeyCounter++,
        name: p.name || '未命名方案',
        type: p.type || 'auto',
        waypoints: Array.isArray(p.waypoints)
          ? p.waypoints.map(w => {
            if (typeof w === 'string') return createWaypoint(w)
            return createWaypoint(w.value || '', w.lng || null, w.lat || null)
          })
          : [],
        distance: p.distance || '',
        duration: p.duration || '',
        toll: p.toll || '',
      }))
    } else {
      form.plans = [createPlan('方案一')]
    }
  } else {
    form.id = null
    form.name = ''
    // ⭐ 新增时默认所属机构：
    //   二级机构子账号 → 本机构名
    //   一级机构子账号 / 主账号 → 客户真实根节点名
    if (needOrgFilter.value && myOrgName.value) {
      form.org = myOrgName.value
    } else if (customerRootOrg.value) {
      form.org = customerRootOrg.value.name
    } else {
      form.org = currentUser.customerName || currentUser.masterName || currentUser.name || ''
    }
    form.pickup_point = ''
    form.delivery_point = ''
    form.remark = ''
    form.plans = [createPlan('方案一')]
  }

  infoCardCollapsed.value = false
  planPanelCollapsed.value = false
  activePlanKey.value = null

  try {
    await initMap()
    if (props.readonly && form.pickup_point && form.delivery_point && form.plans.length > 0) {
      setTimeout(() => { autoPlanAllRoutes() }, 200)
    }
  } catch (e) {
    console.error('[route-form] 地图初始化失败', e)
  }
}

const handleClosed = () => {
  try { unlockPageScroll() } catch (e) { /* noop */ }
  destroyMap()
  fenceTarget.value = null
  showFenceDialog.value = false
  planningIndex.value = -1
  pickingPlanKey.value = null
  activePlanKey.value = null
  autoPlanning.value = false
}

// ============================================================
// ⭐ 加载组织（按 orgLevel 隔离）
// ============================================================
const loadOrgs = async () => {
  try {
    let q = supabase
      .from('organizations')
      .select('id, name, parent_id, level, is_root, customer_id, owner_account')
      .order('level', { ascending: true })
      .order('id', { ascending: true })

    if (isCustomer && myAccount) {
      q = q.eq('owner_account', myAccount)
      // ⭐⭐⭐ 二级机构子账号 → 只显示本机构
      if (needOrgFilter.value && myOrgName.value) {
        q = q.eq('name', myOrgName.value)
      }
    }

    const { data, error } = await q
    if (error) throw error
    orgList.value = data || []
    console.log('[route-form] 加载机构:', orgList.value.length, '条')
  } catch (e) {
    console.warn('[route-form] 加载组织失败', e)
  }
}

// ============================================================
// ⭐ 加载围栏（按 orgLevel 隔离）
// ============================================================
const loadFences = async () => {
  try {
    let q = supabase
      .from('ele_fences')
      .select('id, name, shape, center, points, radius, bufferradius, org')
      .order('updated_at', { ascending: false })

    if (isCustomer && myAccount) {
      q = q.eq('owner_account', myAccount)
      // ⭐⭐⭐ 二级机构子账号 → 只看本机构围栏
      if (needOrgFilter.value && myOrgName.value) {
        q = q.eq('org', myOrgName.value)
      }
    }

    const { data, error } = await q
    if (error) throw error
    fenceList.value = data || []
  } catch (e) {
    console.warn('[route-form] 加载围栏失败', e)
  }
}

// ============================================================
// 新建围栏
// ============================================================
const openCreateFence = async (type) => {
  if (props.readonly) return
  const sel = type === 'pickup' ? pickupRef.value : deliveryRef.value
  if (sel) { try { sel.blur?.() } catch (e) { /* noop */ } }
  fenceTarget.value = type
  await nextTick()
  showFenceDialog.value = true
}

const handleFenceSuccess = async (newFence) => {
  const target = fenceTarget.value
  await loadFences()
  try {
    let targetFence = newFence
    if (!targetFence) {
      let q = supabase
        .from('ele_fences')
        .select('id, name, shape, center, points, radius, bufferradius, org')
        .order('updated_at', { ascending: false })
        .limit(1)
      if (isCustomer && myAccount) {
        q = q.eq('owner_account', myAccount)
        if (needOrgFilter.value && myOrgName.value) q = q.eq('org', myOrgName.value)
      }
      const { data } = await q
      targetFence = data?.[0]
    }
    if (targetFence && target) {
      if (target === 'pickup') form.pickup_point = targetFence.name
      else if (target === 'delivery') form.delivery_point = targetFence.name
      ElMessage.success(`已自动选择：${targetFence.name}`)
    }
  } catch (e) {
    console.warn('获取新围栏失败', e)
  }
  fenceTarget.value = null
}

// ============================================================
// 方案 & 途径点
// ============================================================
const addPlan = () => {
  if (props.readonly) return
  form.plans.push(createPlan(`方案${form.plans.length + 1}`))
  if (!infoCardCollapsed.value) infoCardCollapsed.value = true
}

const removePlan = (idx) => {
  if (props.readonly) return
  if (form.plans.length <= 1) {
    ElMessage.warning('至少保留一个方案')
    return
  }
  const planKey = form.plans[idx]._key
  clearPlanOverlay(planKey)
  planColorMap.delete(planKey)
  if (activePlanKey.value === planKey) activePlanKey.value = null
  form.plans.splice(idx, 1)
  if (pickingPlanKey.value === planKey) stopPickingWaypoint()
  updatePlanHighlight()
}

const addWaypoint = (planIdx) => {
  if (props.readonly) return
  const plan = form.plans[planIdx]
  if (!plan) return
  if (!Array.isArray(plan.waypoints)) plan.waypoints = []
  plan.waypoints.push(createWaypoint(''))
  if (!infoCardCollapsed.value) infoCardCollapsed.value = true
}

const removeWaypoint = (planIdx, wpId) => {
  if (props.readonly) return
  const plan = form.plans[planIdx]
  if (!plan || !Array.isArray(plan.waypoints)) return
  const i = plan.waypoints.findIndex(w => w.id === wpId)
  if (i !== -1) plan.waypoints.splice(i, 1)
}

const autoGenerateName = () => {
  if (props.readonly) return
  if (!form.pickup_point || !form.delivery_point) {
    ElMessage.warning('请先选择装货点和卸货点')
    return
  }
  form.name = `${form.pickup_point}-${form.delivery_point}`
}

// ============================================================
// 路线规划
// ============================================================
const planningIndex = ref(-1)

const geocodeLocation = (geocoder, keyword) => {
  return new Promise((resolve) => {
    if (!keyword || !keyword.trim()) return resolve(null)
    geocoder.getLocation(keyword, (status, result) => {
      if (status === 'complete' && result.geocodes && result.geocodes.length) {
        const loc = result.geocodes[0].location
        resolve([loc.lng, loc.lat])
      } else {
        resolve(null)
      }
    })
  })
}

const formatDurationBySec = (seconds) => {
  if (!seconds || seconds < 60) return '1分钟'
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h > 0) return `${h}小时${m}分`
  return `${m}分钟`
}

const handlePlanRoute = async (idx, silent = false) => {
  const plan = form.plans[idx]
  if (!plan) return
  if (!form.pickup_point) {
    if (!silent) ElMessage.warning('请先选择装货点')
    return
  }
  if (!form.delivery_point) {
    if (!silent) ElMessage.warning('请先选择卸货点')
    return
  }
  if (!map || !AMapLib) {
    if (!silent) ElMessage.error('地图尚未加载完成')
    return
  }

  planningIndex.value = idx
  try {
    const geocoder = new AMapLib.Geocoder()

    const pickupFence = findFenceByName(form.pickup_point)
    let originLngLat = getFenceCoord(pickupFence)
    if (!originLngLat) {
      originLngLat = await geocodeLocation(geocoder, form.pickup_point)
    }
    if (!originLngLat) throw new Error(`无法解析装货点「${form.pickup_point}」`)

    const deliveryFence = findFenceByName(form.delivery_point)
    let destLngLat = getFenceCoord(deliveryFence)
    if (!destLngLat) {
      destLngLat = await geocodeLocation(geocoder, form.delivery_point)
    }
    if (!destLngLat) throw new Error(`无法解析卸货点「${form.delivery_point}」`)

    const waypointLngLats = []
    const validWaypoints = plan.waypoints || []
    for (const wp of validWaypoints) {
      if (wp.lng != null && wp.lat != null) {
        waypointLngLats.push([wp.lng, wp.lat])
      } else if (wp.value && wp.value.trim()) {
        const ll = await geocodeLocation(geocoder, wp.value.trim())
        if (ll) waypointLngLats.push(ll)
      }
    }

    const driving = new AMapLib.Driving({
      policy: AMapLib.DrivingPolicy.LEAST_TIME,
    })

    await new Promise((resolve) => {
      driving.search(
        originLngLat,
        destLngLat,
        { waypoints: waypointLngLats },
        (status, result) => {
          if (status === 'complete' && result.routes && result.routes.length) {
            const route = result.routes[0]
            const distanceKm = (route.distance / 1000).toFixed(1)
            const durationText = formatDurationBySec(route.time)
            const tollText = route.tolls ? String(Math.round(Number(route.tolls))) : '0'

            plan.distance = distanceKm
            plan.duration = durationText
            plan.toll = tollText

            const fullPath = []
            ;(route.steps || []).forEach(step => {
              if (Array.isArray(step.path)) {
                step.path.forEach(p => {
                  if (!p) return
                  const lng = typeof p.getLng === 'function' ? p.getLng() : p.lng
                  const lat = typeof p.getLat === 'function' ? p.getLat() : p.lat
                  if (lng != null && lat != null) fullPath.push([lng, lat])
                })
              }
            })

            if (fullPath.length < 2) {
              if (!silent) ElMessage.warning('规划结果无有效路径')
              resolve()
              return
            }

            drawPlanRoute(plan._key, idx, fullPath, originLngLat, destLngLat, waypointLngLats)

            if (!silent) {
              ElMessage.success(`方案 ${idx + 1} 规划成功：${distanceKm} km · ${durationText}`)
            }
          } else {
            const info = result?.info || '未知错误'
            if (!silent) ElMessage.error('路线规划失败：' + info)
          }
          resolve()
        }
      )
    })
  } catch (e) {
    console.error('[route-form] 规划失败', e)
    if (!silent) ElMessage.error('规划失败：' + e.message)
  } finally {
    planningIndex.value = -1
  }
}

// ============================================================
// ⭐ 提交保存（写 org_id）
// ============================================================
const handleSubmit = async () => {
  if (props.readonly) return
  if (!form.org) return ElMessage.warning('请选择所属机构')
  if (!form.pickup_point) return ElMessage.warning('请选择装货点')
  if (!form.delivery_point) return ElMessage.warning('请选择卸货点')
  if (!form.name || !form.name.trim()) return ElMessage.warning('请填写路线名称')

  saving.value = true
  try {
    // ⭐ 确定最终 org（二级机构子账号新增时强制本机构）
    let finalOrg = form.org
    if (!isEdit.value && needOrgFilter.value && myOrgName.value) {
      finalOrg = myOrgName.value
      console.log('[route-form] 二级机构子账号新增 → 强制 org =', finalOrg)
    }

    // ⭐ 根据 org 名反查 id（用于写 routes.org_id）
    const matchedOrg = orgList.value.find(o => o.name === finalOrg)
    const finalOrgId = matchedOrg?.id || null

    const payload = {
      name: form.name.trim(),
      org: finalOrg,
      org_id: finalOrgId,      // ⭐ 新加
      pickup_point: form.pickup_point,
      delivery_point: form.delivery_point,
      remark: form.remark || null,
      plans: form.plans.map(p => ({
        name: p.name || '未命名方案',
        type: p.type || 'auto',
        waypoints: (p.waypoints || [])
          .filter(w => (w.value || '').trim() || (w.lng != null && w.lat != null))
          .map(w => ({
            value: (w.value || '').trim(),
            lng: w.lng ?? null,
            lat: w.lat ?? null,
          })),
        distance: p.distance || '',
        duration: p.duration || '',
        toll: p.toll || '',
      })),
      plan_count: form.plans.length,
      updated_at: new Date().toISOString(),
    }

    if (isEdit.value) {
      let q = supabase.from('routes').update(payload).eq('id', form.id)
      if (isCustomer && myAccount && !isSubAccount) q = q.eq('owner_account', myAccount)
      const { error } = await q
      if (error) throw error
      ElMessage.success('更新成功')
    } else {
      payload.creator = currentUser.name || currentUser.account || '未知'
      payload.status = 'active'
      payload.owner_account = isAdmin ? null : myAccount
      payload.customer_id = isCustomer ? myCustomerId.value : null
      payload.created_at = new Date().toISOString()

      const { error } = await supabase.from('routes').insert(payload)
      if (error) throw error
      ElMessage.success('新增成功')
    }

    emit('success')
    emit('update:modelValue', false)
  } catch (e) {
    console.error('[route-form] 保存失败', e)
    ElMessage.error('保存失败：' + e.message)
  } finally {
    saving.value = false
  }
}

// ============================================================
// 地图初始化
// ============================================================
const mapRef = ref(null)
const rangingSvgRef = ref(null)
let map = null
let AMapLib = null
let satelliteLayer = null
let roadNetLayer = null
const showSatellite = ref(false)
const showRoadNet = ref(false)
const isMapReady = ref(false)

const initMap = async () => {
  if (!mapRef.value) return
  try {
    AMapLib = await AMapLoader.load({
      key: AMAP_KEY,
      version: '2.0',
      plugins: [
        'AMap.Geocoder',
        'AMap.TileLayer.Satellite',
        'AMap.TileLayer.RoadNet',
        'AMap.Driving',
      ],
    })
    map = new AMapLib.Map(mapRef.value, {
      zoom: 5,
      center: [107, 33],
      mapStyle: 'amap://styles/fresh',
      viewMode: '2D',
      features: ['bg', 'road', 'building', 'point'],
    })
    map.on('click', onMapClick)
    map.on('rightclick', onMapRightClick)
    map.on('mousemove', onMapMouseMove)
    map.on('mapmove', updateAllSvgLines)
    map.on('zoomchange', updateAllSvgLines)
    isMapReady.value = true
  } catch (e) {
    console.error('地图加载失败', e)
    ElMessage.error('地图加载失败：' + e.message)
    throw e
  }
}

const destroyMap = () => {
  clearAllPlanOverlays()
  planColorMap.clear()
  colorSeedCounter = 0
  if (map) {
    try {
      map.off('click', onMapClick)
      map.off('rightclick', onMapRightClick)
      map.off('mousemove', onMapMouseMove)
      map.off('mapmove', updateAllSvgLines)
      map.off('zoomchange', updateAllSvgLines)
      map.destroy()
    } catch (e) { /* noop */ }
    map = null
  }
  isMapReady.value = false
  rangingActive.value = false
  clearAllRanging()
}

// ============================================================
// 卫星 / 路网
// ============================================================
const toggleSatellite = () => {
  if (!map || !AMapLib) return
  if (!satelliteLayer) satelliteLayer = new AMapLib.TileLayer.Satellite()
  if (showSatellite.value) {
    map.remove(satelliteLayer)
    showSatellite.value = false
  } else {
    map.add(satelliteLayer)
    showSatellite.value = true
  }
}

const toggleRoadNet = () => {
  if (!map || !AMapLib) return
  if (!roadNetLayer) roadNetLayer = new AMapLib.TileLayer.RoadNet()
  if (showRoadNet.value) {
    map.remove(roadNetLayer)
    showRoadNet.value = false
  } else {
    map.add(roadNetLayer)
    showRoadNet.value = true
  }
}

// ============================================================
// 测距
// ============================================================
const rangingActive = ref(false)
const totalDistance = ref(0)
const segmentCount = ref(0)

const pointGroups = ref([[]])
let rangingNodeInfos = []
let rangingSegmentInfos = []
let rangingDistanceLabels = []
let rangingSvgLines = []
let rangingPreviewLine = null
let rangingPreviewLabel = null
let rangingLastClickTime = 0
let rangingRafId = null
let rangingPendingLng = null
let rangingPendingLat = null

const calcDistance = (p1, p2) => {
  try {
    const a = new AMapLib.LngLat(p1.lng, p1.lat)
    const b = new AMapLib.LngLat(p2.lng, p2.lat)
    return a.distance(b)
  } catch (e) { return 0 }
}

const formatDistance = (m) => {
  if (m < 1000) return m.toFixed(1) + ' m'
  return (m / 1000).toFixed(2) + ' km'
}

const getPixelCoords = (lngLat) => {
  if (!map) return { x: 0, y: 0 }
  try {
    const p = map.lngLatToContainer(new AMapLib.LngLat(lngLat.lng, lngLat.lat))
    return { x: p.x, y: p.y }
  } catch (e) { return { x: 0, y: 0 } }
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
  rangingSvgLines.push(record)
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

const updateAllSvgLines = () => { rangingSvgLines.forEach(updateSvgLine) }

const clearSvgLines = () => {
  if (!rangingSvgRef.value) { rangingSvgLines = []; return }
  rangingSvgLines.forEach(r => {
    try { r.baseEl.remove() } catch (e) { }
    try { r.flowEl.remove() } catch (e) { }
  })
  rangingSvgLines = []
}

const getNodeMeta = (group, pointIdx) => {
  const total = group.length
  if (total === 1) return { type: 'start', badge: '起' }
  if (pointIdx === 0) return { type: 'start', badge: '起' }
  if (pointIdx === total - 1) return { type: 'end', badge: '终' }
  return { type: 'mid', badge: String(pointIdx) }
}

const createNodeMarker = (point, groupIdx, pointIdx) => {
  const group = pointGroups.value[groupIdx]
  const meta = getNodeMeta(group, pointIdx)
  const container = document.createElement('div')
  container.className = `ranging-point ${meta.type}`
  container.innerHTML = `<div class="ranging-point-icon">${meta.badge}</div>`
  const marker = new AMapLib.Marker({
    position: [point.lng, point.lat],
    content: container,
    offset: new AMapLib.Pixel(-14, -14),
    zIndex: 200,
    map: map,
  })
  return { marker, container, groupIdx, pointIdx }
}

const updateNodeMarker = (info) => {
  const group = pointGroups.value[info.groupIdx]
  if (!group) return
  const meta = getNodeMeta(group, info.pointIdx)
  const cls = `ranging-point ${meta.type}`
  if (info.container.className !== cls) info.container.className = cls
  const iconEl = info.container.querySelector('.ranging-point-icon')
  if (iconEl && iconEl.textContent !== meta.badge) iconEl.textContent = meta.badge
}

const createDistanceLabel = (p1, p2, distance) => {
  const midLng = (p1.lng + p2.lng) / 2
  const midLat = (p1.lat + p2.lat) / 2
  const container = document.createElement('div')
  container.className = 'ranging-distance-label'
  container.textContent = formatDistance(distance)
  return new AMapLib.Marker({
    position: [midLng, midLat],
    content: container,
    offset: new AMapLib.Pixel(0, -12),
    anchor: 'center',
    zIndex: 250,
    map: map,
  })
}

const addRangingPoint = (lng, lat) => {
  const point = { lng, lat }
  const currentGroupIdx = pointGroups.value.length - 1
  const currentGroup = pointGroups.value[currentGroupIdx]

  if (currentGroup.length > 0) {
    const prev = currentGroup[currentGroup.length - 1]
    const distance = calcDistance(prev, point)
    const line = new AMapLib.Polyline({
      path: [[prev.lng, prev.lat], [point.lng, point.lat]],
      strokeColor: '#3B82F6',
      strokeWeight: 4,
      strokeOpacity: 0.85,
      lineJoin: 'round',
      lineCap: 'round',
      zIndex: 150,
      map: map,
    })
    const svgLine = createSvgFlowLine(prev, point)
    const label = createDistanceLabel(prev, point, distance)
    rangingSegmentInfos.push({ from: prev, to: point, distance, line, svgLine })
    rangingDistanceLabels.push(label)
  }
  currentGroup.push(point)
  const info = createNodeMarker(point, currentGroupIdx, currentGroup.length - 1)
  rangingNodeInfos.push(info)
  const groupInfos = rangingNodeInfos.filter(i => i.groupIdx === currentGroupIdx)
  groupInfos.forEach(i => updateNodeMarker(i))
  recalcTotals()
  hidePreview()
  updateAllSvgLines()
}

const recalcTotals = () => {
  let total = 0
  rangingSegmentInfos.forEach(s => { total += s.distance })
  totalDistance.value = total
  segmentCount.value = rangingSegmentInfos.length
}

const hidePreview = () => {
  if (rangingPreviewLine) { try { rangingPreviewLine.setMap(null) } catch (e) { } }
  if (rangingPreviewLabel) { try { rangingPreviewLabel.setMap(null) } catch (e) { } }
}

const destroyPreview = () => {
  if (rangingPreviewLine) { try { map.remove(rangingPreviewLine) } catch (e) { } rangingPreviewLine = null }
  if (rangingPreviewLabel) { try { map.remove(rangingPreviewLabel) } catch (e) { } rangingPreviewLabel = null }
}

const updatePreview = (mouseLng, mouseLat) => {
  const currentGroup = pointGroups.value[pointGroups.value.length - 1]
  if (currentGroup.length === 0) return
  const lastPoint = currentGroup[currentGroup.length - 1]
  const path = [[lastPoint.lng, lastPoint.lat], [mouseLng, mouseLat]]

  if (!rangingPreviewLine) {
    rangingPreviewLine = new AMapLib.Polyline({
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
    rangingPreviewLine.setPath(path)
    try { rangingPreviewLine.setMap(map) } catch (e) { }
  }

  const dist = calcDistance(lastPoint, { lng: mouseLng, lat: mouseLat })
  const previewText = '+' + formatDistance(dist)
  if (!rangingPreviewLabel) {
    const container = document.createElement('div')
    container.className = 'ranging-preview-label'
    container.textContent = previewText
    rangingPreviewLabel = new AMapLib.Marker({
      position: [mouseLng, mouseLat],
      content: container,
      offset: new AMapLib.Pixel(14, -26),
      zIndex: 240,
      map: map,
    })
  } else {
    rangingPreviewLabel.setPosition([mouseLng, mouseLat])
    const c = rangingPreviewLabel.getContent()
    if (c) c.textContent = previewText
    try { rangingPreviewLabel.setMap(map) } catch (e) { }
  }
}

const clearAllRanging = () => {
  if (!map) return
  rangingNodeInfos.forEach(i => { try { map.remove(i.marker) } catch (e) { } })
  rangingSegmentInfos.forEach(s => { try { map.remove(s.line) } catch (e) { } })
  rangingDistanceLabels.forEach(l => { try { map.remove(l) } catch (e) { } })
  destroyPreview()
  clearSvgLines()
  rangingNodeInfos = []
  rangingSegmentInfos = []
  rangingDistanceLabels = []
  pointGroups.value = [[]]
  totalDistance.value = 0
  segmentCount.value = 0
  if (rangingRafId) { cancelAnimationFrame(rangingRafId); rangingRafId = null }
  rangingPendingLng = null
  rangingPendingLat = null
  rangingLastClickTime = 0
}

const onMapClick = async (e) => {
  if (rangingActive.value) {
    const now = Date.now()
    if (now - rangingLastClickTime < 60) return
    rangingLastClickTime = now
    addRangingPoint(e.lnglat.getLng(), e.lnglat.getLat())
    return
  }
  if (pickingPlanKey.value !== null && !props.readonly) {
    await handleMapPickWaypoint(e)
    return
  }
}

const onMapRightClick = (e) => {
  if (!rangingActive.value) return
  if (e?.originalEvent?.preventDefault) e.originalEvent.preventDefault()
  const currentGroupIdx = pointGroups.value.length - 1
  const currentGroup = pointGroups.value[currentGroupIdx]
  if (currentGroup.length >= 2) {
    pointGroups.value.push([])
  }
  hidePreview()
}

const onMapMouseMove = (e) => {
  if (!rangingActive.value) return
  const currentGroup = pointGroups.value[pointGroups.value.length - 1]
  if (currentGroup.length === 0) return
  rangingPendingLng = e.lnglat.getLng()
  rangingPendingLat = e.lnglat.getLat()
  if (rangingRafId) return
  rangingRafId = requestAnimationFrame(() => {
    rangingRafId = null
    if (rangingPendingLng !== null && rangingActive.value) {
      updatePreview(rangingPendingLng, rangingPendingLat)
      rangingPendingLng = null
      rangingPendingLat = null
    }
  })
}

const startRanging = () => {
  if (!map) return
  if (pickingPlanKey.value !== null) stopPickingWaypoint()
  clearAllRanging()
  rangingActive.value = true
}

const stopRanging = () => {
  rangingActive.value = false
  clearAllRanging()
}

const toggleRanging = () => {
  if (rangingActive.value) stopRanging()
  else startRanging()
}

// ============================================================
// watch / 生命周期
// ============================================================
watch(() => props.modelValue, (val) => {
  if (!val) {
    fenceTarget.value = null
    showFenceDialog.value = false
    pickingPlanKey.value = null
  }
})

onBeforeUnmount(() => {
  try { unlockPageScroll() } catch (e) { /* noop */ }
  destroyMap()
})

if (isCustomer) {
  loadMyCustomerId()
  loadMyOrgInfo()
}
</script>

<style scoped>
.rf-stage {
  position: relative;
  width: 100%;
  height: 76vh;
  min-height: 560px;
  background: #F1F5F9;
  border-radius: 4px;
  overflow: hidden;
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

/* 浮层卡片 */
.floating-card {
  position: absolute;
  z-index: 60;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border-radius: 14px;
  box-shadow:
    0 12px 40px rgba(15, 23, 42, 0.12),
    0 0 0 1px rgba(255, 255, 255, 0.7) inset;
  border: 1px solid rgba(255, 255, 255, 0.75);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.info-card {
  top: 16px;
  left: 16px;
  width: 440px;
  max-height: calc(100% - 32px);
}

.plan-panel {
  top: 16px;
  right: 16px;
  width: 520px;
  max-height: calc(100% - 32px);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(241, 245, 249, 0.9);
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.6);
}

.card-title { display: flex; align-items: center; gap: 8px; }

.card-title-icon {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #fff;
  flex-shrink: 0;
}

.card-title-icon.info-icon {
  background: linear-gradient(135deg, #60A5FA, #2563EB);
  box-shadow: 0 3px 8px rgba(37, 99, 235, 0.3);
}

.card-title-icon.plan-icon {
  background: linear-gradient(135deg, #c8102e, #a00d24);
  box-shadow: 0 3px 8px rgba(200, 16, 46, 0.3);
}

.card-title-text {
  font-size: 14px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: 0.3px;
}

.plan-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 7px;
  border-radius: 10px;
  background: #FEF2F2;
  color: #c8102e;
  font-size: 11.5px;
  font-weight: 800;
  font-family: 'Courier New', monospace;
  border: 1px solid #FCA5A5;
}

.collapse-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: rgba(241, 245, 249, 0.9);
  color: #64748B;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  flex-shrink: 0;
}

.collapse-btn:hover {
  background: #FEF2F2;
  color: #c8102e;
  transform: scale(1.12);
}

.card-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 18px 22px;
}

.card-body::-webkit-scrollbar { width: 5px; }
.card-body::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }
.card-body::-webkit-scrollbar-thumb:hover { background: #94A3B8; }

.plan-panel-body { padding: 14px 16px; }

/* 收起按钮 */
.collapsed-trigger {
  position: absolute;
  z-index: 61;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  color: #475569;
  box-shadow:
    0 6px 20px rgba(15, 23, 42, 0.14),
    0 0 0 1px rgba(255, 255, 255, 0.8) inset;
  transition: all 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.collapsed-trigger:hover {
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #FFFFFF;
  transform: scale(1.12);
  box-shadow:
    0 10px 28px rgba(200, 16, 46, 0.4),
    0 0 0 1px rgba(255, 255, 255, 0.35) inset;
}

.collapsed-trigger.info-trigger { top: 16px; left: 16px; }
.collapsed-trigger.plan-trigger { top: 16px; right: 16px; }

.trigger-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: #c8102e;
  color: #FFFFFF;
  font-size: 10.5px;
  font-weight: 800;
  font-family: 'Courier New', monospace;
  border: 2px solid #FFFFFF;
  box-shadow: 0 3px 8px rgba(200, 16, 46, 0.4);
  line-height: 1;
}

.slide-left-enter-active,
.slide-left-leave-active {
  transition: transform 0.42s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.35s ease;
}
.slide-left-enter-from,
.slide-left-leave-to {
  transform: translateX(-120%);
  opacity: 0;
}
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.42s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.35s ease;
}
.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(120%);
  opacity: 0;
}
.scale-in-enter-active,
.scale-in-leave-active {
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.scale-in-enter-from,
.scale-in-leave-to {
  transform: scale(0.4) rotate(-45deg);
  opacity: 0;
}

/* 基础信息表单 */
.info-form :deep(.el-form-item) { margin-bottom: 18px; }

.info-form :deep(.el-form-item__label) {
  font-weight: 700;
  color: #1E293B;
  font-size: 13px;
  padding: 0 0 6px 0;
  line-height: 1.2;
}

.info-form :deep(.el-input__wrapper),
.info-form :deep(.el-select__wrapper),
.info-form :deep(.el-textarea__inner) {
  border-radius: 10px !important;
  background: #F8FAFC !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-size: 14px;
}

.info-form :deep(.el-input__inner),
.info-form :deep(.el-textarea__inner) {
  font-size: 14px;
  color: #0F172A;
}

.info-form :deep(.el-input__wrapper:hover),
.info-form :deep(.el-select__wrapper:hover),
.info-form :deep(.el-textarea__inner:hover) {
  background: #fff !important;
  box-shadow: 0 0 0 1px rgba(200, 16, 46, 0.35) inset !important;
}

.info-form :deep(.el-input__wrapper.is-focus),
.info-form :deep(.el-select__wrapper.is-focused),
.info-form :deep(.el-textarea__inner:focus) {
  background: #fff !important;
  box-shadow: 0 0 0 1px #c8102e inset, 0 0 0 3px rgba(200, 16, 46, 0.12) !important;
}

.info-form :deep(.el-input.is-disabled .el-input__wrapper),
.info-form :deep(.el-select.is-disabled .el-select__wrapper),
.info-form :deep(.el-textarea.is-disabled .el-textarea__inner) {
  background: #F1F5F9 !important;
  color: #475569;
  cursor: not-allowed;
  opacity: 0.85;
}

.auto-btn {
  cursor: pointer;
  color: #c8102e;
  transition: transform 0.25s;
  display: inline-flex;
  font-size: 16px;
}
.auto-btn:hover { transform: scale(1.25) rotate(-10deg); }

.swap-divider {
  position: relative;
  height: 6px;
  margin: -12px 0 6px;
  display: flex;
  justify-content: flex-end;
  padding-right: 12px;
  z-index: 5;
}

.swap-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 3px solid #F8FAFC;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 15px;
  padding: 0;
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow:
    0 4px 12px rgba(200, 16, 46, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.8) inset;
}

.swap-btn:hover:not(:disabled) {
  transform: rotate(180deg) scale(1.15);
  box-shadow:
    0 6px 20px rgba(200, 16, 46, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.8) inset;
}

.swap-btn:active:not(:disabled) {
  transform: rotate(180deg) scale(0.95);
}

.swap-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  background: #94A3B8;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.1);
}

.highlight-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
  background: linear-gradient(135deg, #FEF3C7, #FDE68A);
  border: 1px solid #FCD34D;
  border-radius: 10px;
  font-size: 12.5px;
  font-weight: 700;
  color: #92400E;
  animation: tipSlideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes tipSlideIn {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.highlight-tip .el-icon { color: #D97706; font-size: 15px; }

.plan-block {
  padding: 14px 16px 14px 20px;
  background: #FFFFFF;
  border: 1.5px solid #E2E8F0;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;
  overflow: hidden;
  margin-bottom: 12px;
  cursor: pointer;
  animation: planBlockIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes planBlockIn {
  from { opacity: 0; transform: translateY(-16px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.plan-block::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  background: var(--plan-color, #c8102e);
  box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.3);
  transition: width 0.3s;
}

.plan-block:hover {
  border-color: var(--plan-color, #FCA5A5);
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.1);
  transform: translateY(-2px);
}

.plan-block.is-active {
  border-color: var(--plan-color, #c8102e);
  box-shadow:
    0 10px 28px rgba(15, 23, 42, 0.15),
    0 0 0 3px color-mix(in srgb, var(--plan-color, #c8102e) 20%, transparent);
  transform: translateY(-2px);
}

.plan-block.is-active::before {
  width: 8px;
  box-shadow:
    inset -1px 0 0 rgba(255, 255, 255, 0.3),
    0 0 12px var(--plan-color, #c8102e);
}

.plan-block.is-dimmed {
  opacity: 0.55;
  filter: saturate(0.7);
}

.plan-block.is-dimmed:hover {
  opacity: 0.85;
  filter: saturate(1);
}

.plan-block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px dashed #F1F5F9;
}

.plan-block-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.plan-index-badge {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  background: var(--plan-color, #c8102e);
  box-shadow: 0 3px 10px rgba(15, 23, 42, 0.25);
  transition: transform 0.3s;
}

.plan-block.is-active .plan-index-badge { transform: scale(1.1); }

.plan-index-badge::after {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 12px;
  border: 2px solid var(--plan-color, #c8102e);
  opacity: 0.35;
  animation: badgePulse 2s ease-out infinite;
  pointer-events: none;
}

@keyframes badgePulse {
  0% { transform: scale(0.9); opacity: 0.5; }
  100% { transform: scale(1.3); opacity: 0; }
}

.badge-num {
  font-size: 14px;
  font-weight: 900;
  color: #FFFFFF;
  font-family: 'Courier New', monospace;
  line-height: 1;
  letter-spacing: -0.5px;
}

.plan-title-text {
  font-size: 14px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: 0.3px;
}

.plan-ready-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 10.5px;
  font-weight: 800;
  color: var(--tag-color, #2563EB);
  background: color-mix(in srgb, var(--tag-color, #2563EB) 12%, #fff);
  border: 1px solid color-mix(in srgb, var(--tag-color, #2563EB) 35%, transparent);
  letter-spacing: 0.3px;
  font-family: 'Courier New', monospace;
  animation: tagIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes tagIn {
  from { opacity: 0; transform: scale(0.6); }
  to { opacity: 1; transform: scale(1); }
}

.del-plan-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  font-weight: 700;
  padding: 5px 10px !important;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.del-plan-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.2);
}

.plan-field {
  display: flex;
  align-items: center;
  gap: 10px;
}

.plan-field-label {
  flex-shrink: 0;
  width: 76px;
  font-size: 13px;
  color: #475569;
  font-weight: 600;
}

.waypoints-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  background: #FAFBFC;
  border-radius: 10px;
  border: 1px dashed #E2E8F0;
}

.waypoints-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 700;
  color: #475569;
}

.waypoints-title .el-icon {
  color: var(--plan-color, #0EA5E9);
  font-size: 14px;
}

.wp-count {
  margin-left: auto;
  padding: 1px 7px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--plan-color, #0EA5E9) 12%, #fff);
  color: var(--plan-color, #0369A1);
  font-size: 10.5px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
}

.waypoints-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.waypoint-row {
  display: flex;
  align-items: center;
  gap: 8px;
  animation: wpRowIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes wpRowIn {
  from { opacity: 0; transform: translateX(-12px); }
  to { opacity: 1; transform: translateX(0); }
}

.wp-marker {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--plan-color, #0EA5E9) 15%, #fff);
  color: var(--plan-color, #0369A1);
  font-size: 11.5px;
  font-weight: 800;
  font-family: 'Courier New', monospace;
  border: 1.5px solid var(--plan-color, #7DD3FC);
  transition: all 0.25s;
}

.waypoint-row:hover .wp-marker {
  background: var(--plan-color, #0EA5E9);
  color: #FFF;
  transform: scale(1.08);
}

.wp-num { line-height: 1; }
.wp-input { flex: 1; }

.wp-del {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: 1px solid #E2E8F0;
  background: #FFFFFF;
  color: #94A3B8;
  cursor: pointer;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-size: 13px;
}

.wp-del:hover {
  color: #c8102e;
  border-color: #FCA5A5;
  background: #FEF2F2;
  transform: scale(1.1) rotate(90deg);
}

.wp-empty {
  padding: 10px;
  text-align: center;
  font-size: 12px;
  color: #94A3B8;
  font-weight: 500;
}

.wp-action-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 2px;
}

.add-waypoint-btn,
.map-pick-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 8px;
  background: #FFFFFF;
  border: 1.5px dashed #CBD5E1;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: inherit;
}

.add-waypoint-btn { color: #c8102e; }

.add-waypoint-btn:hover {
  border-color: #c8102e;
  background: #FEF2F2;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.1);
}

.add-waypoint-btn:hover .btn-icon {
  transform: rotate(90deg) scale(1.15);
}

.map-pick-btn {
  color: var(--plan-color, #0EA5E9);
  border-color: var(--plan-color, #CBD5E1);
}

.map-pick-btn:hover {
  background: color-mix(in srgb, var(--plan-color, #0EA5E9) 10%, #fff);
  border-color: var(--plan-color, #0EA5E9);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.1);
}

.map-pick-btn.active {
  background: var(--plan-color, #0EA5E9);
  color: #fff;
  border-color: var(--plan-color, #0EA5E9);
  border-style: solid;
  animation: pickPulse 1.6s ease-in-out infinite;
}

@keyframes pickPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(15, 23, 42, 0.25); }
  50% { box-shadow: 0 0 0 6px rgba(15, 23, 42, 0.05); }
}

.btn-icon {
  transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-size: 14px;
}

.plan-route-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 10px;
  background: linear-gradient(135deg, var(--plan-color, #c8102e), color-mix(in srgb, var(--plan-color, #c8102e) 75%, #000));
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: inherit;
  box-shadow: 0 5px 14px rgba(15, 23, 42, 0.2);
  letter-spacing: 0.4px;
  position: relative;
  overflow: hidden;
}

.plan-route-btn::after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.22), transparent);
  transition: left 0.6s ease;
}

.plan-route-btn:hover:not(:disabled)::after { left: 100%; }

.plan-route-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.3);
}

.plan-route-btn:disabled {
  opacity: 0.75;
  cursor: not-allowed;
}

.plan-route-btn.loading {
  background: linear-gradient(135deg, color-mix(in srgb, var(--plan-color, #c8102e) 60%, #000), color-mix(in srgb, var(--plan-color, #c8102e) 40%, #000));
}

.spin-icon { animation: spinRotate 1s linear infinite; }
@keyframes spinRotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.plan-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.meta-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  background: linear-gradient(135deg, #FAFBFC, #F1F5F9);
  border: 1px solid #F1F5F9;
  border-radius: 9px;
  transition: all 0.25s;
}

.meta-cell:hover {
  border-color: var(--plan-color, #FCA5A5);
  background: #fff;
}

.meta-lbl {
  font-size: 11px;
  color: #94A3B8;
  font-weight: 700;
  letter-spacing: 0.3px;
}

.meta-val {
  font-size: 14px;
  color: #0F172A;
  font-weight: 800;
  font-family: 'Courier New', monospace;
  line-height: 1.2;
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.meta-val small {
  font-size: 10.5px;
  color: #94A3B8;
  font-weight: 600;
  margin-left: 2px;
}

.plan-toll { display: flex; align-items: center; gap: 10px; padding-top: 2px; }

.add-plan-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 12px;
  background: #FFFFFF;
  border: 2px dashed #E2E8F0;
  border-radius: 12px;
  color: #c8102e;
  font-size: 13.5px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: inherit;
  letter-spacing: 0.3px;
  width: 100%;
  margin-top: 4px;
}

.add-plan-btn:hover {
  border-color: #c8102e;
  background: linear-gradient(135deg, #FEF2F2, #FFF);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(200, 16, 46, 0.15);
}

.add-plan-btn:hover .btn-icon {
  transform: rotate(90deg) scale(1.2);
}

.map-controls {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-radius: 999px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(255, 255, 255, 0.7) inset;
  border: 1px solid rgba(255, 255, 255, 0.6);
}

.ctrl-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border-radius: 999px;
  border: none;
  background: rgba(248, 250, 252, 0.9);
  color: #475569;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  outline: none;
  font-family: inherit;
}

.ctrl-btn:hover {
  background: #FEF2F2;
  color: #c8102e;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.18);
}

.ctrl-btn.active {
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #ffffff;
  box-shadow: 0 4px 14px rgba(200, 16, 46, 0.4);
}

.ctrl-btn.active:hover {
  color: #ffffff;
  box-shadow: 0 8px 20px rgba(200, 16, 46, 0.55);
}

.ctrl-btn .el-icon { font-size: 14px; }

.pick-tip {
  position: absolute;
  bottom: 78px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 56;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: linear-gradient(135deg, #0F172A, #1E293B);
  border-radius: 14px;
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.08) inset;
  color: #fff;
}

.pick-tip-icon {
  font-size: 18px;
  color: #FCD34D;
  animation: pickIconPulse 1.6s ease-in-out infinite;
}

@keyframes pickIconPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.15); }
}

.pick-tip-text { font-size: 14px; font-weight: 600; letter-spacing: 0.3px; }
.pick-tip-text b { color: #FCD34D; font-family: 'Courier New', monospace; font-weight: 900; padding: 0 4px; }

.pick-tip-btn {
  padding: 6px 14px;
  border-radius: 8px;
  border: none;
  background: #FCD34D;
  color: #0F172A;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: inherit;
}

.pick-tip-btn:hover {
  background: #FBBF24;
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(252, 211, 77, 0.4);
}

/* ⭐ 详情模式自动规划提示 */
.auto-plan-tip {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 58;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 24px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(200, 16, 46, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.8) inset;
  font-size: 14px;
  font-weight: 700;
  color: #0F172A;
  pointer-events: none;
}

.auto-plan-spinner {
  width: 20px;
  height: 20px;
  border: 3px solid #FEE2E2;
  border-top-color: #c8102e;
  border-radius: 50%;
  animation: loadingSpin 0.8s linear infinite;
}

.ranging-summary {
  position: absolute;
  bottom: 78px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 55;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border-radius: 16px;
  padding: 14px 22px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.14), 0 0 0 1px rgba(255, 255, 255, 0.85) inset;
  border: 1px solid rgba(255, 255, 255, 0.75);
  min-width: 300px;
  pointer-events: none;
}

.ranging-summary-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: #475569;
  margin-bottom: 10px;
  letter-spacing: 0.3px;
}

.summary-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #3B82F6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
  animation: summaryPulse 1.6s ease-in-out infinite;
}

@keyframes summaryPulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2); }
  50% { box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.05); }
}

.ranging-summary-body { display: flex; align-items: center; gap: 16px; }
.summary-item { display: flex; flex-direction: column; gap: 3px; }
.summary-label { font-size: 11px; font-weight: 600; color: #94A3B8; letter-spacing: 0.3px; }
.summary-value { font-size: 20px; font-weight: 800; color: #0F172A; font-family: 'Courier New', monospace; line-height: 1.1; }
.summary-value.highlight { color: #c8102e; font-size: 24px; }
.summary-divider { width: 1px; height: 32px; background: rgba(203, 213, 225, 0.9); }
.ranging-summary-tip { margin-top: 10px; font-size: 11.5px; color: #94A3B8; font-weight: 500; letter-spacing: 0.2px; }

.summary-slide-enter-active,
.summary-slide-leave-active { transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }
.summary-slide-enter-from,
.summary-slide-leave-to { opacity: 0; transform: translateX(-50%) translateY(20px); }

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
  background: #fff;
  border-radius: 16px;
  padding: 28px 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  box-shadow: 0 20px 60px rgba(200, 16, 46, 0.15);
}

.loading-ring {
  width: 36px;
  height: 36px;
  border: 3px solid #FEE2E2;
  border-top-color: #c8102e;
  border-radius: 50%;
  animation: loadingSpin 1s linear infinite;
}

@keyframes loadingSpin { to { transform: rotate(360deg); } }
.loading-card p { font-size: 14px; color: #475569; font-weight: 600; margin: 0; }

@media (max-width: 1200px) {
  .info-card { width: 380px; }
  .plan-panel { width: 440px; }
}
@media (max-width: 1000px) {
  .info-card { width: 340px; }
  .plan-panel { width: 400px; }
}
@media (max-width: 900px) {
  .rf-stage { height: 90vh; }
  .info-card { width: calc(100% - 32px); max-height: 45%; }
  .plan-panel {
    width: calc(100% - 32px);
    top: auto;
    bottom: 16px;
    max-height: 45%;
  }
  .plan-trigger { top: auto; bottom: 16px; right: 16px; }
}
</style>

<style>
.route-form-dialog .el-dialog {
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 24px 72px rgba(15, 23, 42, 0.22);
  width: 1440px;
  max-width: 96vw;
}
.route-form-dialog .el-dialog__header {
  padding: 18px 26px;
  margin: 0;
  border-bottom: 1px solid #F1F5F9;
  background: linear-gradient(180deg, #FFFFFF, #FAFBFC);
}
.route-form-dialog .el-dialog__title {
  font-weight: 800;
  color: #0F172A;
  font-size: 17px;
  letter-spacing: 0.3px;
}
.route-form-dialog .el-dialog__body {
  padding: 0;
  background: #F8FAFC;
}
.route-form-dialog .el-dialog__footer {
  padding: 14px 26px;
  background: #fff;
  border-top: 1px solid #F1F5F9;
}
.route-form-dialog .el-dialog__footer .el-button {
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;
  padding: 10px 24px;
}
.route-form-dialog .btn-primary {
  background: linear-gradient(135deg, #c8102e, #a00d24);
  border: none;
  color: #fff;
  box-shadow: 0 6px 16px rgba(200, 16, 46, 0.3);
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.route-form-dialog .btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(200, 16, 46, 0.45);
}

.fence-select-popper .el-select-dropdown__list { padding-bottom: 0 !important; }
.fence-select-popper .el-select-dropdown__footer,
.fence-select-popper .el-select-dropdown__empty { padding: 0 !important; }

.fence-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  margin-top: 4px;
  border-top: 1px dashed #E2E8F0;
  cursor: pointer;
  user-select: none;
  position: relative;
  overflow: hidden;
  transition: background 0.28s ease;
}
.fence-cta::before {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 0.28s ease;
  pointer-events: none;
}
.fence-cta-pickup::before {
  background: linear-gradient(90deg, rgba(254, 242, 242, 0) 0%, rgba(254, 242, 242, 0.7) 40%, rgba(254, 226, 226, 0.9) 100%);
}
.fence-cta-delivery::before {
  background: linear-gradient(90deg, rgba(239, 246, 255, 0) 0%, rgba(239, 246, 255, 0.7) 40%, rgba(219, 234, 254, 0.9) 100%);
}
.fence-cta:hover::before { opacity: 1; }
.fence-cta > * { position: relative; z-index: 1; }

.fence-cta-hint {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  color: #94A3B8;
  font-weight: 500;
  transition: color 0.28s;
  white-space: nowrap;
}
.fence-cta-hint .hint-icon { font-size: 13px; color: #CBD5E1; transition: color 0.28s; }
.fence-cta-pickup:hover .fence-cta-hint,
.fence-cta-pickup:hover .fence-cta-hint .hint-icon { color: #c8102e; }
.fence-cta-delivery:hover .fence-cta-hint,
.fence-cta-delivery:hover .fence-cta-hint .hint-icon { color: #2563EB; }

.fence-cta-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 13px 6px 7px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.2px;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  white-space: nowrap;
}
.fence-cta-pickup .fence-cta-action {
  color: #c8102e;
  background: #FFFFFF;
  border: 1px solid #FCA5A5;
  box-shadow: 0 2px 6px rgba(200, 16, 46, 0.06);
}
.fence-cta-delivery .fence-cta-action {
  color: #2563EB;
  background: #FFFFFF;
  border: 1px solid #93C5FD;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.06);
}
.fence-cta-pickup:hover .fence-cta-action {
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #fff;
  border-color: #c8102e;
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.35);
  transform: translateY(-1px);
}
.fence-cta-delivery:hover .fence-cta-action {
  background: linear-gradient(135deg, #3B82F6, #1D4ED8);
  color: #fff;
  border-color: #2563EB;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);
  transform: translateY(-1px);
}
.plus-bubble {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-size: 12px;
  transition: all 0.28s;
}
.fence-cta-pickup .plus-bubble { background: #FEE2E2; color: #c8102e; }
.fence-cta-delivery .plus-bubble { background: #DBEAFE; color: #2563EB; }
.fence-cta-pickup:hover .plus-bubble,
.fence-cta-delivery:hover .plus-bubble {
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
  transform: rotate(90deg);
}
.action-text { font-size: 13px; }
.arrow-icon {
  font-size: 12px;
  transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.fence-cta-pickup:hover .arrow-icon,
.fence-cta-delivery:hover .arrow-icon { transform: translateX(3px); }

.route-org-popper .el-select-dropdown__item {
  height: auto;
  line-height: 1.5;
  padding: 10px 14px;
  font-size: 14px;
  color: #1E293B;
  font-weight: 500;
}
.route-org-popper .el-select-dropdown__item.is-selected {
  color: #c8102e;
  font-weight: 700;
}

.route-endpoint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px 3px 4px;
  background: rgba(255, 255, 255, 0.97);
  border-radius: 20px;
  border: 2px solid var(--color, #2563EB);
  box-shadow: 0 3px 10px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(255, 255, 255, 0.7) inset;
  white-space: nowrap;
  user-select: none;
  pointer-events: none;
  font-family: system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  transition: opacity 0.3s;
}
.route-endpoint.dimmed { opacity: 0.35; }
.route-endpoint .endpoint-num {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color, #2563EB);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 900;
  font-family: 'Courier New', monospace;
  line-height: 1;
}
.route-endpoint .endpoint-text {
  color: var(--color, #2563EB);
  font-weight: 800;
  font-size: 12px;
  letter-spacing: 0.5px;
}

.route-waypoint {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 20px;
  padding: 0 6px;
  background: var(--color, #2563EB);
  color: #fff;
  border-radius: 10px;
  border: 2px solid #fff;
  box-shadow: 0 3px 8px rgba(15, 23, 42, 0.25);
  white-space: nowrap;
  user-select: none;
  pointer-events: none;
  font-family: 'Courier New', monospace;
  transition: opacity 0.3s;
}
.route-waypoint.dimmed { opacity: 0.35; }
.route-waypoint .waypoint-num {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.3px;
  line-height: 1;
}

.ranging-svg-base {
  stroke: #3B82F6;
  stroke-width: 4;
  stroke-opacity: 0.4;
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
  user-select: none;
  line-height: 1;
}
.ranging-point.start .ranging-point-icon {
  background: linear-gradient(135deg, #34D399, #059669);
}
.ranging-point.mid .ranging-point-icon {
  background: linear-gradient(135deg, #60A5FA, #3B82F6);
}
.ranging-point.end .ranging-point-icon {
  background: linear-gradient(135deg, #F87171, #DC2626);
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
  pointer-events: none;
}
</style>