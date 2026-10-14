<template>
  <div class="alert-query-page">
    <!-- ⭐ 提醒类型切换 -->
    <div class="type-tabs fade-up">
      <button class="type-tab" :class="{ active: alertType === 'speeding' }" @click="switchType('speeding')">
        <el-icon><Odometer /></el-icon>
        超速提醒
      </button>
      <button class="type-tab" :class="{ active: alertType === 'staying' }" @click="switchType('staying')">
        <el-icon><Timer /></el-icon>
        停留提醒
      </button>
      <div class="type-tabs-tip">
        <el-icon><InfoFilled /></el-icon>
        {{ alertType === 'speeding' ? '监控车辆超速行为' : '监控车辆停留行为' }}
      </div>
    </div>

    <!-- 搜索卡片 -->
    <div class="search-card fade-up" style="animation-delay: 0.05s">
      <div class="search-row">
        <el-select v-model="searchForm.org" placeholder="请选择所属车队" size="default" class="search-select" clearable>
          <el-option v-for="o in orgOptions" :key="o" :label="o" :value="o" />
        </el-select>

        <el-date-picker
          v-model="searchForm.dateTimeRange"
          type="datetimerange"
          range-separator="至"
          start-placeholder="开始日期时间"
          end-placeholder="结束日期时间"
          value-format="YYYY-MM-DD HH:mm:ss"
          format="YYYY-MM-DD HH:mm"
          size="default"
          class="search-datetime"
          :shortcuts="dateShortcuts"
        />

        <el-input v-model="searchForm.plate" placeholder="请输入车牌号" size="default" class="search-input" clearable />
        <el-input v-model="searchForm.vin" placeholder="请输入车架号" size="default" class="search-input" clearable />

        <!-- ⭐ 停留点数筛选（仅停留 tab 显示） -->
        <el-select
          v-if="alertType === 'staying'"
          v-model="searchForm.pointCount"
          placeholder="停留点数"
          size="default"
          class="search-select-sm"
          clearable
        >
          <el-option label="全部点数" value="" />
          <el-option label="仅 1 个点" value="1" />
          <el-option label="2 ~ 5 个点" value="2-5" />
          <el-option label="5 个点以上" value="5+" />
        </el-select>

        <div class="search-btns">
          <el-button type="primary" size="default" class="btn-primary" @click="handleSearch">
            <el-icon><Search /></el-icon> 搜索
          </el-button>
          <el-button size="default" class="btn-outline" @click="handleReset">
            <el-icon><Refresh /></el-icon> 重置
          </el-button>
          <el-button type="danger" size="default" plain class="btn-danger-outline" @click="handleExport">
            <el-icon><Download /></el-icon> 导出
          </el-button>
        </div>
      </div>

      <!-- 统计条 -->
      <div class="stats-row">
        <!-- 超速：4 卡 -->
        <template v-if="alertType === 'speeding'">
          <div class="stat-item" :class="{ active: activeStat === 'all' }" @click="filterByStat('all')">
            <div class="stat-icon-wrap total-icon"><el-icon><Bell /></el-icon></div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.total }}</div>
              <div class="stat-label">超速段</div>
            </div>
            <div class="stat-glow"></div>
          </div>
          <div class="stat-item" :class="{ active: activeStat === 'vehicles' }" @click="filterByStat('vehicles')">
            <div class="stat-icon-wrap speeding-stat-icon"><el-icon><Odometer /></el-icon></div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.vehicles }}</div>
              <div class="stat-label">涉及车辆</div>
            </div>
            <div class="stat-glow speeding-glow"></div>
          </div>
          <div class="stat-item" :class="{ active: activeStat === 'max' }" @click="filterByStat('max')">
            <div class="stat-icon-wrap staying-stat-icon"><el-icon><Location /></el-icon></div>
            <div class="stat-info">
              <div class="stat-value">
                {{ Number(stats.maxSpeed).toFixed(0) }}<small class="unit">km/h</small>
              </div>
              <div class="stat-label">最高速度</div>
            </div>
            <div class="stat-glow staying-glow"></div>
          </div>
          <div class="stat-item" :class="{ active: activeStat === 'duration' }" @click="filterByStat('duration')">
            <div class="stat-icon-wrap unhandled-icon"><el-icon><WarningFilled /></el-icon></div>
            <div class="stat-info">
              <div class="stat-value">
                {{ Math.round(stats.totalDuration / 60) }}<small class="unit">分钟</small>
              </div>
              <div class="stat-label">累计时长</div>
            </div>
            <div class="stat-glow unhandled-glow"></div>
          </div>
        </template>

        <!-- 停留：4 卡（蓝色主题） -->
        <template v-else>
          <div class="stat-item staying-stat-item" :class="{ active: activeStat === 'all' }" @click="filterByStat('all')">
            <div class="stat-icon-wrap stay-total-icon"><el-icon><Timer /></el-icon></div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.total }}</div>
              <div class="stat-label">停留次数</div>
            </div>
            <div class="stat-glow stay-glow"></div>
          </div>
          <div class="stat-item staying-stat-item" :class="{ active: activeStat === 'vehicles' }" @click="filterByStat('vehicles')">
            <div class="stat-icon-wrap stay-vehicle-icon"><el-icon><Van /></el-icon></div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.vehicles }}</div>
              <div class="stat-label">涉及车辆</div>
            </div>
            <div class="stat-glow stay-vehicle-glow"></div>
          </div>
          <div class="stat-item staying-stat-item" :class="{ active: activeStat === 'max' }" @click="filterByStat('max')">
            <div class="stat-icon-wrap stay-max-icon"><el-icon><AlarmClock /></el-icon></div>
            <div class="stat-info">
              <div class="stat-value">
                {{ stats.maxDuration }}<small class="unit">分钟</small>
              </div>
              <div class="stat-label">最长停留</div>
            </div>
            <div class="stat-glow stay-max-glow"></div>
          </div>
          <div class="stat-item staying-stat-item" :class="{ active: activeStat === 'duration' }" @click="filterByStat('duration')">
            <div class="stat-icon-wrap stay-sum-icon"><el-icon><Clock /></el-icon></div>
            <div class="stat-info">
              <div class="stat-value">
                {{ Math.round(stats.totalDuration / 60) }}<small class="unit">分钟</small>
              </div>
              <div class="stat-label">累计停留</div>
            </div>
            <div class="stat-glow stay-sum-glow"></div>
          </div>
        </template>
      </div>
    </div>

    <!-- 表格卡片 -->
    <div class="table-card fade-up" style="animation-delay: 0.1s">
      <!-- ⭐ 超速表格 -->
      <el-table
        v-if="alertType === 'speeding'"
        :data="tableData"
        border
        stripe
        height="100%"
        style="width: 100%;"
        size="default"
        class="custom-table"
        :header-cell-style="{ background: '#F1F5F9', color: '#0F172A', fontWeight: '700', fontSize: '13px' }"
      >
        <el-table-column prop="plate" label="车牌号" min-width="140" align="center" fixed>
          <template #default="{ row }">
            <div class="plate-wrap">
              <span class="plate-bar"></span>
              <span class="plate-text">{{ row.plate }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="org" label="所属机构" min-width="160" align="center" show-overflow-tooltip />
        <el-table-column prop="vin" label="VIN" min-width="180" align="center" show-overflow-tooltip>
          <template #default="{ row }"><span class="vin-text">{{ row.vin || '--' }}</span></template>
        </el-table-column>
        <el-table-column label="提醒类型" min-width="110" align="center">
          <template #default>
            <span class="type-tag speeding"><el-icon><Odometer /></el-icon> 超速</span>
          </template>
        </el-table-column>
        <el-table-column label="提醒开始时间" min-width="170" align="center">
          <template #default="{ row }"><span class="time-text">{{ formatDateTime(row.startTime) }}</span></template>
        </el-table-column>
        <el-table-column label="提醒结束时间" min-width="170" align="center">
          <template #default="{ row }"><span class="time-text">{{ formatDateTime(row.endTime) }}</span></template>
        </el-table-column>
        <el-table-column label="最高速度" min-width="110" align="center">
          <template #default="{ row }">
            <span class="speed-text">{{ Number(row.maxSpeed).toFixed(1) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="平均速度" min-width="110" align="center">
          <template #default="{ row }">
            <span class="speed-text avg">{{ Number(row.avgSpeed).toFixed(1) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="持续时长" min-width="110" align="center">
          <template #default="{ row }">
            <span class="duration-text">{{ formatDuration(row.durationSec) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="超速点数" min-width="110" align="center">
          <template #default="{ row }">
            <span class="status-tag point-count">{{ row.pointCount }} 个</span>
          </template>
        </el-table-column>
        <el-table-column label="报警位置" min-width="220" align="left" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.address" class="address-text">
              <el-icon class="addr-icon"><Location /></el-icon>
              {{ row.address }}
            </span>
            <span v-else class="text-muted">--</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="130" align="center" fixed="right">
          <template #default="{ row }">
            <el-button type="text" size="small" class="action-btn handle" @click="handleViewDetail(row)">
              查看详情
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-state">
            <el-icon class="empty-icon"><Bell /></el-icon>
            <p>暂无超速提醒</p>
            <span class="empty-sub">在"提醒设置"里配置超速阈值和关联围栏吧</span>
          </div>
        </template>
      </el-table>

      <!-- ⭐ 停留表格 -->
      <el-table
        v-else
        :data="tableData"
        border
        stripe
        height="100%"
        style="width: 100%;"
        size="default"
        class="custom-table"
        :header-cell-style="{ background: '#EFF6FF', color: '#0F172A', fontWeight: '700', fontSize: '13px' }"
      >
        <el-table-column prop="plate" label="车牌号" min-width="140" align="center" fixed>
          <template #default="{ row }">
            <div class="plate-wrap">
              <span class="plate-bar stay"></span>
              <span class="plate-text">{{ row.plate }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="org" label="所属机构" min-width="160" align="center" show-overflow-tooltip />
        <el-table-column prop="vin" label="VIN" min-width="180" align="center" show-overflow-tooltip>
          <template #default="{ row }"><span class="vin-text">{{ row.vin || '--' }}</span></template>
        </el-table-column>
        <el-table-column label="提醒类型" min-width="110" align="center">
          <template #default>
            <span class="type-tag staying"><el-icon><Timer /></el-icon> 停留</span>
          </template>
        </el-table-column>
        <el-table-column label="停留开始时间" min-width="170" align="center">
          <template #default="{ row }"><span class="time-text">{{ row.startTime }}</span></template>
        </el-table-column>
        <el-table-column label="停留结束时间" min-width="170" align="center">
          <template #default="{ row }"><span class="time-text">{{ row.endTime }}</span></template>
        </el-table-column>
        <el-table-column label="停留时长" min-width="120" align="center">
          <template #default="{ row }">
            <span class="speed-text stay-duration">{{ row.durationMin }} 分钟</span>
          </template>
        </el-table-column>
        <!-- ⭐ 新增：停留点数 -->
        <el-table-column label="停留点数" min-width="110" align="center">
          <template #default="{ row }">
            <span class="point-count-tag">{{ (row.points || []).length }} 个</span>
          </template>
        </el-table-column>
        <el-table-column label="停留位置" min-width="280" align="left" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.address" class="address-text">
              <el-icon class="addr-icon stay"><Location /></el-icon>
              {{ row.address }}
            </span>
            <span v-else class="text-muted">
              {{ row.lng.toFixed(5) }}, {{ row.lat.toFixed(5) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="130" align="center" fixed="right">
          <template #default="{ row }">
            <el-button type="text" size="small" class="action-btn handle stay" @click="handleViewDetail(row)">
              查看详情
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-state">
            <el-icon class="empty-icon"><Timer /></el-icon>
            <p>暂无停留提醒</p>
            <span class="empty-sub">在"提醒设置"里配置停留时长和关联围栏吧</span>
          </div>
        </template>
      </el-table>

      <div class="pagination-wrapper">
        <span class="total-text">共 {{ total }} 条</span>
        <el-pagination
          background
          layout="sizes, prev, pager, next, jumper"
          :total="total"
          :page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          v-model:current-page="currentPage"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          class="custom-pagination"
        />
      </div>
    </div>

    <!-- ⭐ 加载动画 -->
    <transition name="loading-fade">
      <div v-if="loadingVisible" class="os-loading-overlay">
        <div class="os-loading-card">
          <div class="os-loading-icon-wrap">
            <span class="os-ring os-ring-1" :class="{ stay: alertType === 'staying' }"></span>
            <span class="os-ring os-ring-2" :class="{ stay: alertType === 'staying' }"></span>
            <div class="os-loading-icon" :class="{ stay: alertType === 'staying' }">
              <el-icon><component :is="alertType === 'speeding' ? Odometer : Timer" /></el-icon>
            </div>
          </div>
          <div class="os-loading-title" :class="{ stay: alertType === 'staying' }">
            正在查询{{ alertType === 'speeding' ? '超速' : '停留' }}数据
          </div>
          <div class="os-loading-stages">
            <div
              v-for="(stage, i) in stages"
              :key="i"
              class="os-stage"
              :class="{ active: i === currentStage, done: i < currentStage, stay: alertType === 'staying' }"
            >
              <span class="os-stage-dot" :class="{ stay: alertType === 'staying' }">
                <el-icon v-if="i < currentStage"><Select /></el-icon>
                <span v-else-if="i === currentStage" class="os-stage-pulse"></span>
              </span>
              <span class="os-stage-text">{{ stage }}</span>
            </div>
          </div>
          <div class="os-loading-progress">
            <div class="os-progress-bar" :class="{ stay: alertType === 'staying' }">
              <div class="os-progress-inner" :class="{ stay: alertType === 'staying' }" :style="{ width: progress + '%' }">
                <div class="os-progress-shine"></div>
              </div>
            </div>
            <div class="os-progress-text" :class="{ stay: alertType === 'staying' }">
              <span class="os-progress-num">{{ Math.round(progress) }}</span>
              <span class="os-progress-percent">%</span>
            </div>
          </div>
          <div class="os-loading-tip">
            <el-icon class="tip-icon" :class="{ stay: alertType === 'staying' }"><InfoFilled /></el-icon>
            {{ loadingSubText }}
          </div>
        </div>
      </div>
    </transition>

    <!-- 详情弹窗 -->
    <OverspeedDetailDialog
      v-model="detailVisible"
      :segment="detailSegment"
      :threshold="threshold"
    />
    <StayDetailDialog v-model="stayDetailVisible" :event="stayDetailEvent" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Search, Refresh, Download, Bell, Odometer, Location, WarningFilled,
  InfoFilled, Select, Timer, Van, AlarmClock, Clock,
} from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import { supabase } from '@/utils/supabase'
import OverspeedDetailDialog from '@/components/OverspeedDetailDialog.vue'
import StayDetailDialog from '@/components/StayDetailDialog.vue'

const API_BASE = 'https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com'
const CACHE_TTL = 5 * 60 * 1000

// ============================================================
// 时间格式化
// ============================================================
const formatDateTime = (t) => {
  if (!t) return '--'
  if (typeof t === 'number' || /^\d+$/.test(String(t))) {
    return dayjs(Number(t)).format('YYYY-MM-DD HH:mm:ss')
  }
  return dayjs(t).format('YYYY-MM-DD HH:mm:ss')
}

const formatDuration = (s) => {
  if (!s || s < 60) return `${s || 0} 秒`
  const m = Math.floor(s / 60)
  const ss = s % 60
  return ss === 0 ? `${m} 分钟` : `${m}分${ss}秒`
}

const todayStr = dayjs().format('YYYY-MM-DD')

// ============================================================
// 日期快捷
// ============================================================
const dateShortcuts = [
  { text: '今天', value: () => [dayjs().startOf('day').toDate(), dayjs().endOf('day').toDate()] },
  { text: '昨天', value: () => [dayjs().subtract(1, 'day').startOf('day').toDate(), dayjs().subtract(1, 'day').endOf('day').toDate()] },
  { text: '最近 3 天', value: () => [dayjs().subtract(2, 'day').startOf('day').toDate(), dayjs().endOf('day').toDate()] },
  { text: '最近 7 天', value: () => [dayjs().subtract(6, 'day').startOf('day').toDate(), dayjs().endOf('day').toDate()] },
]

// ============================================================
// ⭐ 当前用户
// ============================================================
const currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('currentUser') || '{}') }
  catch { return {} }
})()
const isAdmin = currentUser.role === 'admin'
const isCustomer = !isAdmin
const isSubAccount = !!currentUser.isSubAccount
const myPhone = currentUser.masterPhone || currentUser.phone || ''
const myAccount = currentUser.masterAccount || currentUser.account || ''
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
  const { data } = await supabase.from('customers').select('id').eq('phone', myPhone).maybeSingle()
  if (data) myCustomerId.value = data.id
}

// ⭐ 兜底反查机构信息
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
const alertType = ref('speeding')

const tableData = ref([])
const allSegments = ref([])
const total = ref(0)
const pageSize = ref(10)
const currentPage = ref(1)
const activeStat = ref('all')
const orgOptions = ref([])
const threshold = ref(80)
const alertConfig = ref(null)

const searchForm = reactive({
  org: '',
  dateTimeRange: [],
  plate: '',
  vin: '',
  pointCount: '',
})

const stats = reactive({
  total: 0,
  vehicles: 0,
  maxSpeed: 0,
  maxDuration: 0,
  totalDuration: 0,
})

// 加载动画
const loadingVisible = ref(false)
const progress = ref(0)
const currentStage = ref(0)
const loadingSubText = ref('准备中...')
const stages = computed(() => {
  return alertType.value === 'speeding'
    ? ['读取配置', '加载车辆', '拉取轨迹', '解析结果']
    : ['读取配置', '加载车辆', '拉取停留', '解析结果']
})

// 详情弹窗
const detailVisible = ref(false)
const detailSegment = ref(null)
const stayDetailVisible = ref(false)
const stayDetailEvent = ref(null)

// ============================================================
// 进度条
// ============================================================
let progressTimer = null

const startProgress = () => {
  progress.value = 0
  currentStage.value = 0
  loadingSubText.value = '读取提醒配置...'
  loadingVisible.value = true
}

const setStage = (idx, subText) => {
  currentStage.value = idx
  if (subText) loadingSubText.value = subText
  const targets = [10, 30, 85, 95]
  const target = targets[idx] || 0
  if (progressTimer) clearInterval(progressTimer)
  progressTimer = setInterval(() => {
    if (progress.value < target) {
      progress.value = Math.min(target, progress.value + Math.random() * 3 + 1)
    } else {
      clearInterval(progressTimer)
      progressTimer = null
    }
  }, 150)
}

const finishProgress = () => {
  if (progressTimer) clearInterval(progressTimer)
  currentStage.value = 3
  loadingSubText.value = '查询完成'
  progress.value = 100
  setTimeout(() => { loadingVisible.value = false }, 400)
}

const failProgress = () => {
  if (progressTimer) clearInterval(progressTimer)
  loadingVisible.value = false
  progress.value = 0
}

// ============================================================
// 读配置
// ============================================================
const loadAlertConfig = async (type) => {
  let q = supabase
    .from('ele_fence_alerts')
    .select('*')
    .eq('alert_type', type)
    .eq('enabled', true)
    .limit(1)

  if (isCustomer) q = q.eq('owner_account', myAccount)

  const { data, error } = await q.maybeSingle()
  if (error) { console.warn('[alert] 读配置失败:', error); return null }
  alertConfig.value = data
  return data
}

// ============================================================
// ⭐ 拉车辆（按 orgLevel 隔离）
// ============================================================
const loadVehicles = async () => {
  let q = supabase.from('vehicles').select('vin, plate, org')
  if (isCustomer) {
    if (!myCustomerId.value) return []
    q = q.eq('customer_id', myCustomerId.value)
    // ⭐⭐⭐ 二级机构子账号 → 只看本机构车辆
    if (needOrgFilter.value && myOrgName.value) {
      console.log('[alert] 子账号挂 level=' + myOrgLevel.value + ' 机构 → 隔离车辆 org =', myOrgName.value)
      q = q.eq('org', myOrgName.value)
    }
  }
  const { data, error } = await q
  if (error) { console.warn('[alert] 查车辆失败:', error); return [] }
  const list = (data || []).filter(v => v.vin && v.vin.length >= 8)

  const orgSet = new Set()
  list.forEach(v => { if (v.org) orgSet.add(v.org) })
  orgOptions.value = Array.from(orgSet)

  return list
}

// ============================================================
// ⭐ 拉围栏（按 orgLevel 隔离）
// ============================================================
const loadFences = async (config) => {
  const parseArr = (str) => {
    if (!str) return []
    try {
      const arr = JSON.parse(str)
      return Array.isArray(arr) ? arr : [str]
    } catch { return str ? [str] : [] }
  }
  const ids = parseArr(config?.fence_id)

  if (!ids.length) {
    console.log('[alert] 未配置围栏 → 全域提醒')
    return []
  }

  let q = supabase.from('ele_fences')
    .select('id, gfid, name, shape, points, center, radius, bufferradius, adcode, org')
    .in('id', ids)

  if (isCustomer) {
    q = q.eq('owner_account', myAccount)
    // ⭐⭐⭐ 二级机构子账号 → 只看本机构围栏
    if (needOrgFilter.value && myOrgName.value) {
      q = q.eq('org', myOrgName.value)
    }
  }

  const { data, error } = await q
  if (error) { console.warn('[alert] 查围栏失败:', error); return [] }
  return data || []
}

// ============================================================
// 缓存
// ============================================================
const getCacheKey = () => {
  const userPart = isAdmin ? 'admin' : (isSubAccount ? 'sub_' + currentUser.account : 'cust_' + currentUser.account)
  const rangePart = searchForm.dateTimeRange?.length === 2
    ? `${searchForm.dateTimeRange[0].slice(0, 10)}_${searchForm.dateTimeRange[1].slice(0, 10)}`
    : 'today'
  return `alert_cache_${alertType.value}_${userPart}_${rangePart}`
}

const readCache = () => {
  try {
    const key = getCacheKey()
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const obj = JSON.parse(raw)
    if (!obj || !obj.ts) return null
    if (Date.now() - obj.ts > CACHE_TTL) { sessionStorage.removeItem(key); return null }
    return obj
  } catch (e) { return null }
}

const writeCache = (list) => {
  try {
    sessionStorage.setItem(getCacheKey(), JSON.stringify({ ts: Date.now(), list }))
  } catch (e) { }
}

// ============================================================
// 时间范围
// ============================================================
const getTimeRange = () => {
  if (searchForm.dateTimeRange && searchForm.dateTimeRange.length === 2) {
    return [searchForm.dateTimeRange[0], searchForm.dateTimeRange[1]]
  }
  return [`${todayStr} 00:00:00`, `${todayStr} 23:59:59`]
}

// ============================================================
// 超速查询
// ============================================================
const fetchOverspeedAlerts = async (forceRefresh = false) => {
  if (!forceRefresh) {
    const cached = readCache()
    if (cached && Array.isArray(cached.list)) {
      allSegments.value = cached.list
      console.log(`[overspeed] 命中缓存，${cached.list.length} 段`)
      return
    }
  }

  setStage(0, '读取超速提醒配置...')
  const config = await loadAlertConfig('speeding')
  if (!config) throw new Error('未配置超速提醒，请先去"提醒设置"开启')
  threshold.value = config.speed_threshold || 80

  setStage(1, '加载车辆列表和围栏...')
  const vehicles = await loadVehicles()
  if (!vehicles.length) throw new Error('当前账号下没有车辆')

  const fences = await loadFences(config)

  const [startTime, endTime] = getTimeRange()
  console.log(`[overspeed] 车 ${vehicles.length} | 围栏 ${fences.length} | 阈值 ${threshold.value} | ${startTime} ~ ${endTime}`)

  setStage(2, `正在查询 ${vehicles.length} 辆车的轨迹数据...`)

  const res = await fetch(`${API_BASE}/dongfeng-overspeed-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vehicles, fences,
      threshold: threshold.value,
      startTime, endTime,
    }),
  })
  const json = await res.json()
  if (json.code !== 1) throw new Error(json.msg || '云函数调用失败')

  setStage(3, '解析超速数据...')
  allSegments.value = json.segments || []
  writeCache(allSegments.value)
  console.log(`[overspeed] 拉取 ${allSegments.value.length} 段`)
}

// ============================================================
// 停留查询
// ============================================================
const fetchStayAlerts = async (forceRefresh = false) => {
  if (!forceRefresh) {
    const cached = readCache()
    if (cached && Array.isArray(cached.list)) {
      allSegments.value = cached.list
      console.log(`[stay] 命中缓存，${cached.list.length} 条`)
      return
    }
  }

  setStage(0, '读取停留提醒配置...')
  const config = await loadAlertConfig('staying')
  if (!config) throw new Error('未配置停留提醒，请先去"提醒设置"开启')

  setStage(1, '加载车辆列表和围栏...')
  const vehicles = await loadVehicles()
  if (!vehicles.length) throw new Error('当前账号下没有车辆')

  const fences = await loadFences(config)

  const [startTime, endTime] = getTimeRange()
  const stayDuration = config.stay_duration || 30
  const stayRadius = config.stay_radius || 200
  console.log(`[stay] 车 ${vehicles.length} | 围栏 ${fences.length} | 停留 ${stayDuration}分钟 | 半径 ${stayRadius}m | ${startTime} ~ ${endTime}`)

  setStage(2, `正在查询 ${vehicles.length} 辆车的停留事件...`)

  const res = await fetch(`${API_BASE}/dongfeng-stay-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vehicles, fences,
      stayDuration,
      stayRadius,
      startTime, endTime,
    }),
  })
  const json = await res.json()
  if (json.code !== 1) throw new Error(json.msg || '云函数调用失败')

  setStage(3, '解析停留数据...')
  allSegments.value = json.events || []
  writeCache(allSegments.value)
  console.log(`[stay] 拉取 ${allSegments.value.length} 条`)
}

// ============================================================
// 统一入口
// ============================================================
const fetchAlerts = async (forceRefresh = false) => {
  if (alertType.value === 'staying') {
    return fetchStayAlerts(forceRefresh)
  }
  return fetchOverspeedAlerts(forceRefresh)
}

// ============================================================
// 前端过滤 + 分页 + 统计
// ============================================================
const applyFilterAndPage = () => {
  const list = allSegments.value

  const filtered = list.filter(s => {
    if (searchForm.org && s.org !== searchForm.org) return false
    if (searchForm.plate && !String(s.plate || '').toLowerCase().includes(searchForm.plate.toLowerCase())) return false
    if (searchForm.vin && !String(s.vin || '').toLowerCase().includes(searchForm.vin.toLowerCase())) return false

    if (alertType.value === 'staying' && searchForm.pointCount) {
      const n = (s.points || []).length
      const r = searchForm.pointCount
      if (r === '1' && n !== 1) return false
      if (r === '2-5' && (n < 2 || n > 5)) return false
      if (r === '5+' && n <= 5) return false
    }
    return true
  })

  if (alertType.value === 'staying') {
    stats.total = list.length
    stats.vehicles = new Set(list.map(s => s.vin)).size
    stats.maxDuration = list.length ? Math.max(...list.map(s => s.durationMin || 0)) : 0
    stats.totalDuration = list.reduce((sum, s) => sum + (s.durationMin || 0) * 60, 0)
    stats.maxSpeed = 0
  } else {
    stats.total = list.length
    stats.vehicles = new Set(list.map(s => s.vin)).size
    stats.maxSpeed = list.length ? Math.max(...list.map(s => s.maxSpeed || 0)) : 0
    stats.totalDuration = list.reduce((sum, s) => sum + (s.durationSec || 0), 0)
    stats.maxDuration = 0
  }

  total.value = filtered.length
  const from = (currentPage.value - 1) * pageSize.value
  tableData.value = filtered.slice(from, from + pageSize.value)
}

// ============================================================
// 交互
// ============================================================
const refreshData = async (forceRefresh = true) => {
  startProgress()
  try {
    await fetchAlerts(forceRefresh)
    currentPage.value = 1
    applyFilterAndPage()
    finishProgress()
  } catch (e) {
    console.error(e)
    failProgress()
    ElMessage.error(e.message)
    allSegments.value = []
    applyFilterAndPage()
  }
}

const switchType = (type) => {
  if (alertType.value === type) return
  alertType.value = type
  activeStat.value = 'all'
  currentPage.value = 1
  searchForm.pointCount = ''
  allSegments.value = []
  tableData.value = []
  refreshData(true)
}

const handleSearch = () => {
  activeStat.value = 'all'
  currentPage.value = 1
  refreshData(true)
}

const handleReset = () => {
  searchForm.org = ''
  searchForm.dateTimeRange = [`${todayStr} 00:00:00`, `${todayStr} 23:59:59`]
  searchForm.plate = ''
  searchForm.vin = ''
  searchForm.pointCount = ''
  activeStat.value = 'all'
  currentPage.value = 1
  refreshData(true)
}

const filterByStat = (type) => {
  activeStat.value = activeStat.value === type ? 'all' : type
  currentPage.value = 1
  applyFilterAndPage()
}

const handleViewDetail = (row) => {
  if (alertType.value === 'staying') {
    stayDetailEvent.value = row
    stayDetailVisible.value = true
  } else {
    detailSegment.value = row
    detailVisible.value = true
  }
}

// ============================================================
// 导出
// ============================================================
const handleExport = () => {
  const list = allSegments.value
  if (!list.length) { ElMessage.warning('没有数据可导出'); return }

  let rows
  let filename

  if (alertType.value === 'staying') {
    rows = list.map(s => ({
      车牌号: s.plate,
      所属机构: s.org || '',
      VIN: s.vin,
      提醒类型: '停留',
      停留开始: s.startTime,
      停留结束: s.endTime,
      停留时长: `${s.durationMin} 分钟`,
      停留点数: (s.points || []).length + ' 个',
      停留位置: s.address || `${s.lng.toFixed(5)}, ${s.lat.toFixed(5)}`,
    }))
    filename = `停留提醒_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`
  } else {
    rows = list.map(s => ({
      车牌号: s.plate,
      所属机构: s.org || '',
      VIN: s.vin,
      提醒类型: '超速',
      开始时间: formatDateTime(s.startTime),
      结束时间: formatDateTime(s.endTime),
      最高速度: Number(s.maxSpeed).toFixed(1),
      平均速度: Number(s.avgSpeed).toFixed(1),
      持续时长: formatDuration(s.durationSec),
      超速点数: s.pointCount,
      报警位置: s.address || '',
    }))
    filename = `超速提醒_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`
  }

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, alertType.value === 'staying' ? '停留提醒' : '超速提醒')
  XLSX.writeFile(wb, filename)
  ElMessage.success(`已导出 ${list.length} 条数据`)
}

const handleSizeChange = (val) => { pageSize.value = val; currentPage.value = 1; applyFilterAndPage() }
const handleCurrentChange = (val) => { currentPage.value = val; applyFilterAndPage() }

// ============================================================
// 生命周期
// ============================================================
onMounted(async () => {
  if (!searchForm.dateTimeRange || searchForm.dateTimeRange.length === 0) {
    searchForm.dateTimeRange = [`${todayStr} 00:00:00`, `${todayStr} 23:59:59`]
  }

  if (isCustomer) {
    await loadMyCustomerId()
    await loadMyOrgInfo()
  }

  const LOADED_FLAG = 'alert_page_loaded_' + (isAdmin ? 'admin' : (isSubAccount ? 'sub_' + currentUser.account : 'cust_' + currentUser.account))
  const isFirstVisit = !sessionStorage.getItem(LOADED_FLAG)

  if (isFirstVisit) {
    sessionStorage.setItem(LOADED_FLAG, '1')
    console.log('[alert] 首次进页面，强制拉取')
    refreshData(true)
    return
  }

  const cached = readCache()
  if (cached && Array.isArray(cached.list)) {
    allSegments.value = cached.list
    currentPage.value = 1
    applyFilterAndPage()
    console.log(`[alert] 切回页面，命中缓存 ${cached.list.length} 条`)
    return
  }

  console.log('[alert] 缓存过期，重新拉取')
  refreshData(true)
})
</script>

<style scoped>
.alert-query-page {
  padding: 6px 16px 16px;
  background-color: #f8fafc;
  height: calc(100vh - 101px);
  max-height: calc(100vh - 101px);
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 14px;
  color: #1E293B;
}

/* ========== 提醒类型切换 ========== */
.type-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  flex-shrink: 0;
}
.type-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #64748B;
  font-size: 13.5px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.type-tab:hover {
  color: #c8102e;
  background: #FEF2F2;
}
.type-tab.active {
  color: #fff;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.35);
}
.type-tab .el-icon { font-size: 15px; }
.type-tabs-tip {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  color: #64748B;
  font-weight: 500;
}
.type-tabs-tip .el-icon { color: #c8102e; font-size: 13px; }

/* ========== 搜索卡片 ========== */
.search-card {
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex-shrink: 0;
}
.search-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
.search-select { width: 180px; }
.search-select-sm { width: 150px; }   /* ⭐ 停留点数下拉 */
.search-input { width: 160px; }
.search-datetime { width: 380px; }
.search-btns { display: flex; gap: 10px; margin-left: auto; }

:deep(.el-button) {
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  border-radius: 6px;
  font-weight: 600;
}
:deep(.el-button:hover) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.15);
}
:deep(.btn-primary) {
  background-color: #c8102e;
  border-color: #c8102e;
  color: #fff;
}
:deep(.btn-primary:hover) { background-color: #a00d24; border-color: #a00d24; }
:deep(.btn-outline) {
  border-color: #CBD5E1;
  color: #334155;
}
:deep(.btn-outline:hover) {
  border-color: #c8102e;
  color: #c8102e;
  background-color: #FEF2F2;
}
:deep(.btn-danger-outline) {
  border-color: #c8102e;
  color: #c8102e;
}
:deep(.btn-danger-outline:hover) {
  background-color: #c8102e;
  color: #fff;
}
:deep(.el-input__wrapper.is-focus),
:deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 2px rgba(200, 16, 46, 0.15), 0 0 0 1px #c8102e inset !important;
}

/* ========== 统计条 ========== */
.stats-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid #E2E8F0;
}
.stat-item {
  position: relative;
  flex: 1;
  min-width: 160px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #F1F5F9;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  overflow: hidden;
}
.stat-item:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
  background: #ffffff;
}
.stat-item.active {
  border-color: #FCA5A5;
  background: #ffffff;
  box-shadow: 0 6px 20px rgba(211, 47, 47, 0.15);
}
.stat-item.active:nth-child(3) {
  border-color: #93C5FD;
  box-shadow: 0 6px 20px rgba(37, 99, 235, 0.15);
}
.stat-item.active:nth-child(4) {
  border-color: #FCD34D;
  box-shadow: 0 6px 20px rgba(245, 158, 11, 0.15);
}

/* 停留统计卡（蓝调） */
.staying-stat-item.active { border-color: #93C5FD; box-shadow: 0 6px 20px rgba(59, 130, 246, 0.15); }
.staying-stat-item.active:nth-child(2) { border-color: #93C5FD; }
.staying-stat-item.active:nth-child(3) { border-color: #A78BFA; box-shadow: 0 6px 20px rgba(139, 92, 246, 0.15); }
.staying-stat-item.active:nth-child(4) { border-color: #FCD34D; }

.stat-icon-wrap {
  width: 42px; height: 42px; border-radius: 11px;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; flex-shrink: 0;
  transition: transform 0.3s;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
}
.stat-item:hover .stat-icon-wrap { transform: scale(1.1) rotate(-6deg); }

.total-icon { background: linear-gradient(135deg, #FEE2E2, #FCA5A5); color: #991B1B; }
.speeding-stat-icon { background: linear-gradient(135deg, #FEE2E2, #FCA5A5); color: #991B1B; }
.staying-stat-icon { background: linear-gradient(135deg, #DBEAFE, #93C5FD); color: #1E40AF; }
.unhandled-icon { background: linear-gradient(135deg, #FEF3C7, #FCD34D); color: #92400E; }

/* 停留 4 卡图标 */
.stay-total-icon { background: linear-gradient(135deg, #DBEAFE, #93C5FD); color: #1E40AF; }
.stay-vehicle-icon { background: linear-gradient(135deg, #E0E7FF, #A5B4FC); color: #3730A3; }
.stay-max-icon { background: linear-gradient(135deg, #EDE9FE, #C4B5FD); color: #5B21B6; }
.stay-sum-icon { background: linear-gradient(135deg, #FEF3C7, #FCD34D); color: #92400E; }

.stat-info { display: flex; flex-direction: column; }
.stat-value {
  font-size: 24px; font-weight: 800; color: #0F172A;
  line-height: 1.1;
  font-family: 'Courier New', monospace;
  letter-spacing: -0.5px;
  display: flex; align-items: baseline; gap: 2px;
}
.stat-value .unit { font-size: 12px; color: #94A3B8; font-weight: 600; margin-left: 2px; }
.stat-label {
  font-size: 12px; color: #475569; margin-top: 2px;
  font-weight: 600; letter-spacing: 0.3px;
}

.stat-glow {
  position: absolute; bottom: 0; left: 0;
  width: 0; height: 3px;
  background: linear-gradient(90deg, #EF4444, #B91C1C);
  transition: width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.stat-item.active .stat-glow { width: 100%; }
.stat-glow.speeding-glow { background: linear-gradient(90deg, #EF4444, #B91C1C); }
.stat-glow.staying-glow { background: linear-gradient(90deg, #3B82F6, #1D4ED8); }
.stat-glow.unhandled-glow { background: linear-gradient(90deg, #F59E0B, #D97706); }

/* 停留 4 卡光条 */
.stat-glow.stay-glow { background: linear-gradient(90deg, #3B82F6, #1D4ED8); }
.stat-glow.stay-vehicle-glow { background: linear-gradient(90deg, #6366F1, #4338CA); }
.stat-glow.stay-max-glow { background: linear-gradient(90deg, #8B5CF6, #6D28D9); }
.stat-glow.stay-sum-glow { background: linear-gradient(90deg, #F59E0B, #D97706); }

/* ========== 表格卡片 ========== */
.table-card {
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  padding: 16px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.custom-table { border-radius: 8px; overflow: hidden; }

:deep(.custom-table .el-table__cell) {
  color: #1E293B;
  font-weight: 500;
  font-size: 13px;
}
:deep(.custom-table th.el-table__cell) {
  color: #0F172A !important;
  font-weight: 700 !important;
  font-size: 13px;
  border-bottom: 2px solid #E2E8F0;
}
:deep(.el-table__row) { transition: background-color 0.3s ease; }
:deep(.el-table__row:hover) { background-color: #FEF2F2 !important; }
:deep(.el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell) { background: #FAFBFC; }

/* 车牌 */
.plate-wrap {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 3px 10px 3px 8px;
  background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.plate-wrap:hover {
  border-color: #FCA5A5;
  box-shadow: 0 3px 10px rgba(200, 16, 46, 0.12);
  transform: translateY(-1px);
}
.plate-bar {
  display: inline-block; width: 3px; height: 16px;
  background: linear-gradient(180deg, #EF4444, #B91C1C);
  border-radius: 2px;
  box-shadow: 0 0 4px rgba(211, 47, 47, 0.4);
  flex-shrink: 0;
}
.plate-bar.stay {
  background: linear-gradient(180deg, #60A5FA, #1D4ED8);
  box-shadow: 0 0 4px rgba(59, 130, 246, 0.4);
}
.plate-text {
  font-family: 'Courier New', monospace;
  font-size: 13px; font-weight: 700; color: #0F172A;
  letter-spacing: 0.8px; line-height: 1;
}

.vin-text {
  font-family: 'Courier New', monospace;
  font-size: 12px; color: #334155; font-weight: 600;
}

/* 类型标签 */
.type-tag {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 12px;
  font-size: 12px; font-weight: 700; letter-spacing: 0.3px;
  transition: all 0.2s;
}
.type-tag:hover { transform: scale(1.05); }
.type-tag.speeding { background: #FEE2E2; color: #991B1B; border: 1px solid #FCA5A5; }
.type-tag.staying { background: #DBEAFE; color: #1E40AF; border: 1px solid #93C5FD; }
.type-tag .el-icon { font-size: 13px; }

.time-text {
  font-size: 12px; color: #334155;
  font-family: 'Courier New', monospace; font-weight: 600;
}

.speed-text {
  display: inline-block; padding: 3px 10px;
  background: #FEE2E2; color: #991B1B;
  border-radius: 10px; font-size: 13px; font-weight: 800;
  font-family: 'Courier New', monospace;
  border: 1px solid #FCA5A5;
}
.speed-text.avg {
  background: #FEF3C7; color: #92400E; border-color: #FCD34D;
}
.speed-text.stay-duration {
  background: #DBEAFE; color: #1E40AF; border-color: #93C5FD;
}

.duration-text { font-size: 13px; color: #334155; font-weight: 600; }

.status-tag {
  display: inline-block; padding: 3px 12px;
  border-radius: 12px; font-size: 12px; font-weight: 700;
}
.status-tag.point-count {
  background: #EDE9FE; color: #5B21B6; border: 1px solid #C4B5FD;
}

/* ⭐ 停留点数标签（蓝调） */
.point-count-tag {
  display: inline-block;
  padding: 3px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
  background: #DBEAFE;
  color: #1E40AF;
  border: 1px solid #93C5FD;
}

.address-text {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #334155;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.4;
}
.addr-icon { color: #c8102e; font-size: 13px; flex-shrink: 0; }
.addr-icon.stay { color: #2563EB; }
.text-muted { color: #94A3B8; font-size: 12.5px; }

.action-btn.handle { color: #c8102e; font-weight: 700; padding: 0 4px; }
.action-btn.handle:hover { color: #7F1D1D; text-decoration: underline; }
.action-btn.handle.stay { color: #2563EB; }
.action-btn.handle.stay:hover { color: #1D4ED8; }

.empty-state {
  padding: 40px 0; display: flex; flex-direction: column; align-items: center; gap: 6px;
}
.empty-icon {
  font-size: 48px; color: #94A3B8;
  animation: float 3s ease-in-out infinite;
}
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
.empty-state p { margin: 0; font-size: 15px; color: #334155; font-weight: 700; }
.empty-sub { font-size: 13px; color: #64748B; }

.pagination-wrapper {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 16px; border-top: 1px solid #E2E8F0; margin-top: 16px;
}
.total-text { font-size: 13px; color: #334155; font-weight: 700; }
:deep(.custom-pagination .el-pager li) {
  transition: all 0.2s; font-weight: 600; color: #334155;
}
:deep(.custom-pagination .el-pager li:hover) { color: #c8102e; transform: scale(1.1); }
:deep(.custom-pagination .el-pager li.is-active) {
  background-color: #c8102e !important; color: #fff !important;
  box-shadow: 0 2px 6px rgba(200, 16, 46, 0.35);
}

/* ============ 加载动画 ============ */
.os-loading-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background:
    radial-gradient(circle at 30% 30%, rgba(200, 16, 46, 0.08) 0%, transparent 60%),
    radial-gradient(circle at 70% 70%, rgba(200, 16, 46, 0.06) 0%, transparent 60%),
    rgba(248, 250, 252, 0.75);
  backdrop-filter: blur(16px) saturate(160%);
  display: flex; align-items: center; justify-content: center;
}
.os-loading-card {
  background: #ffffff;
  border-radius: 20px;
  padding: 36px 44px 30px;
  min-width: 420px;
  box-shadow: 0 30px 80px rgba(200, 16, 46, 0.2), 0 0 0 1px rgba(254, 226, 226, 0.6);
  display: flex; flex-direction: column; align-items: center;
  gap: 18px;
  animation: osCardIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes osCardIn {
  from { opacity: 0; transform: scale(0.85) translateY(30px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.os-loading-icon-wrap {
  position: relative; width: 84px; height: 84px;
  display: flex; align-items: center; justify-content: center;
}
.os-ring {
  position: absolute; inset: 0;
  border-radius: 50%;
  border: 2px solid rgba(200, 16, 46, 0.55);
  pointer-events: none;
}
.os-ring.stay { border-color: rgba(59, 130, 246, 0.55); }
.os-ring-1 { animation: osRingPulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
.os-ring-2 { animation: osRingPulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite 0.7s; }
@keyframes osRingPulse {
  0% { transform: scale(0.7); opacity: 0.9; }
  100% { transform: scale(1.8); opacity: 0; }
}

.os-loading-icon {
  position: relative; z-index: 2;
  width: 64px; height: 64px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #ffffff;
  box-shadow: 0 10px 24px rgba(200, 16, 46, 0.4), 0 0 0 6px rgba(200, 16, 46, 0.08);
  animation: osIconFloat 2s ease-in-out infinite;
}
.os-loading-icon.stay {
  background: linear-gradient(135deg, #3B82F6, #1D4ED8);
  box-shadow: 0 10px 24px rgba(59, 130, 246, 0.4), 0 0 0 6px rgba(59, 130, 246, 0.08);
}
.os-loading-icon .el-icon { font-size: 32px; }
@keyframes osIconFloat {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-6px) rotate(-6deg); }
}

.os-loading-title {
  font-size: 17px; font-weight: 800;
  letter-spacing: 0.5px;
  background: linear-gradient(120deg, #0F172A 0%, #c8102e 50%, #0F172A 100%);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: osTitleShine 3s ease-in-out infinite;
}
.os-loading-title.stay {
  background: linear-gradient(120deg, #0F172A 0%, #3B82F6 50%, #0F172A 100%);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
@keyframes osTitleShine {
  0%, 100% { background-position: 0% 0; }
  50% { background-position: 100% 0; }
}

.os-loading-stages {
  display: flex; align-items: center;
  gap: 16px; padding: 10px 0;
  flex-wrap: wrap; justify-content: center;
}
.os-stage {
  display: flex; align-items: center; gap: 6px;
  font-size: 12.5px; color: #94A3B8;
  font-weight: 600;
  transition: all 0.3s;
}
.os-stage.active { color: #c8102e; font-weight: 800; }
.os-stage.active.stay { color: #3B82F6; }
.os-stage.done { color: #059669; }

.os-stage-dot {
  width: 18px; height: 18px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: #F1F5F9;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.os-stage.active .os-stage-dot {
  background: linear-gradient(135deg, #c8102e, #a00d24);
  box-shadow: 0 0 0 4px rgba(200, 16, 46, 0.15);
  transform: scale(1.15);
}
.os-stage.active.stay .os-stage-dot {
  background: linear-gradient(135deg, #3B82F6, #1D4ED8);
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.15);
}
.os-stage.done .os-stage-dot { background: #10B981; color: #fff; }
.os-stage-dot .el-icon { font-size: 11px; color: #fff; }
.os-stage-pulse {
  width: 8px; height: 8px; border-radius: 50%;
  background: #ffffff;
  animation: osPulse 1s ease-in-out infinite;
}
@keyframes osPulse {
  0%, 100% { transform: scale(0.8); opacity: 0.8; }
  50% { transform: scale(1.2); opacity: 1; }
}

.os-loading-progress {
  display: flex; align-items: center;
  gap: 14px; width: 100%;
}
.os-progress-bar {
  flex: 1; height: 8px;
  background: #FEE2E2;
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}
.os-progress-bar.stay { background: #DBEAFE; }
.os-progress-inner {
  height: 100%;
  background: linear-gradient(90deg, #EF4444, #c8102e, #a00d24);
  border-radius: 4px;
  transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}
.os-progress-inner.stay {
  background: linear-gradient(90deg, #60A5FA, #3B82F6, #1D4ED8);
}
.os-progress-shine {
  position: absolute; top: 0; left: -100%;
  width: 100%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.55), transparent);
  animation: osBarShine 1.4s ease-in-out infinite;
}
@keyframes osBarShine {
  0% { left: -100%; }
  100% { left: 100%; }
}
.os-progress-text {
  display: flex; align-items: baseline; gap: 1px;
  font-family: 'Courier New', monospace;
  font-weight: 800;
  color: #c8102e;
  min-width: 52px;
  justify-content: flex-end;
}
.os-progress-text.stay { color: #2563EB; }
.os-progress-num { font-size: 20px; letter-spacing: -0.5px; }
.os-progress-percent { font-size: 12px; color: #94A3B8; }

.os-loading-tip {
  display: flex; align-items: center; gap: 5px;
  font-size: 12.5px; color: #64748B;
  font-weight: 500;
  padding: 6px 14px;
  background: #F8FAFC;
  border-radius: 999px;
  animation: osTipPulse 1.8s ease-in-out infinite;
}
@keyframes osTipPulse {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}
.tip-icon { color: #c8102e; font-size: 13px; }
.tip-icon.stay { color: #2563EB; }

.loading-fade-enter-active,
.loading-fade-leave-active { transition: opacity 0.35s ease; }
.loading-fade-enter-from,
.loading-fade-leave-to { opacity: 0; }

.fade-up {
  animation: fadeUp 0.5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
  opacity: 0;
  transform: translateY(20px);
}
@keyframes fadeUp {
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 768px) {
  .stats-row { flex-direction: column; }
  .stat-item { min-width: 100%; }
  .os-loading-card { min-width: auto; width: calc(100vw - 40px); padding: 30px 24px 24px; }
  .type-tabs-tip { display: none; }
}
</style>