<template>
  <div class="summary-page table-page">
    <!-- ========== 筛选卡片 ========== -->
    <div class="filter-card">
      <div class="search-row">
        <el-select v-model="filters.org" placeholder="请选择所属车队" clearable filterable style="width: 180px"
          @change="onOrgChange">
          <el-option v-for="o in orgOptions" :key="o" :label="o" :value="o" />
        </el-select>

        <el-select v-model="filters.plate" placeholder="请选择车牌号" clearable filterable style="width: 160px">
          <el-option v-for="v in plateOptions" :key="v.plate" :label="v.plate" :value="v.plate" />
        </el-select>

        <el-select v-model="filters.period" style="width: 120px">
          <el-option label="日报" value="day" />
          <el-option label="周报" value="week" />
          <el-option label="月报" value="month" />
          <el-option label="自定义" value="custom" />
        </el-select>

        <el-date-picker v-if="filters.period === 'day'" v-model="filters.date" type="date" placeholder="选择日期"
          value-format="YYYY-MM-DD" :clearable="false" style="width: 150px" />

        <el-date-picker v-else-if="filters.period === 'week'" v-model="filters.week" type="week"
          placeholder="选择周" format="YYYY 第 ww 周" value-format="YYYY-MM-DD" :clearable="false"
          style="width: 180px" />

        <el-date-picker v-else-if="filters.period === 'month'" v-model="filters.month" type="month" placeholder="选择月份"
          value-format="YYYY-MM" :clearable="false" style="width: 150px" />

        <el-date-picker v-else v-model="filters.range" type="daterange" range-separator="至" start-placeholder="开始日期"
          end-placeholder="结束日期" value-format="YYYY-MM-DD" unlink-panels :clearable="false" style="width: 250px" />

        <div class="search-btns">
          <el-button type="primary" class="btn-primary" :loading="loading" @click="handleSearch">
            <el-icon>
              <Search />
            </el-icon> 搜索
          </el-button>
          <el-button class="btn-outline" @click="handleReset">
            <el-icon>
              <Refresh />
            </el-icon> 重置
          </el-button>
          <el-button class="btn-outline" @click="handleExport">
            <el-icon>
              <Download />
            </el-icon> 导出
          </el-button>
        </div>
      </div>
    </div>

    <!-- ========== 表格卡片 ========== -->
    <Teleport to="body" :disabled="!isTableFullscreen">
      <div class="table-card-wrap" :class="{ 'is-fullscreen': isTableFullscreen }">
        <div class="table-card">
          <!-- 工具栏 -->
          <div class="toolbar">
            <div class="toolbar-left">
              <span class="toolbar-bar"></span>
              <span class="toolbar-title">综合报表</span>
              <span class="toolbar-total">
                共 {{ tableData.length }} 条
                <template v-if="rangeText"> · {{ rangeText }}</template>
              </span>
              <span v-if="loading" class="toolbar-progress">
                查询中 {{ progress.done }}/{{ progress.total }}
              </span>
            </div>

            <div class="toolbar-right">
              <!-- 刷新 -->
              <button class="icon-btn" title="刷新" @click="handleRefresh">
                <el-icon>
                  <Refresh />
                </el-icon>
              </button>

              <!-- 密度 -->
              <el-dropdown trigger="click" popper-class="density-dropdown-red" @command="handleDensityChange">
                <button class="icon-btn" title="表格密度">
                  <el-icon>
                    <Operation />
                  </el-icon>
                </button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="large"><span class="density-item"
                        :class="{ active: tableSize === 'large' }">宽松</span></el-dropdown-item>
                    <el-dropdown-item command="default"><span class="density-item"
                        :class="{ active: tableSize === 'default' }">默认</span></el-dropdown-item>
                    <el-dropdown-item command="small"><span class="density-item"
                        :class="{ active: tableSize === 'small' }">紧凑</span></el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>

              <!-- 列设置 -->
              <el-popover v-model:visible="columnPopoverVisible" placement="bottom-end" :width="300" trigger="click"
                popper-class="column-setting-popper">
                <template #reference>
                  <button class="icon-btn" :class="{ active: columnPopoverVisible }" title="列设置">
                    <el-icon>
                      <Setting />
                    </el-icon>
                  </button>
                </template>
                <div class="column-setting">
                  <div class="column-setting-header">
                    <span class="col-title">
                      <el-icon>
                        <Grid />
                      </el-icon> 列展示
                    </span>
                    <span class="col-reset" @click="resetColumns">重置</span>
                  </div>
                  <div class="column-setting-body">
                    <div v-for="(col, index) in columnConfig" :key="col.prop" class="column-item"
                      :class="{ dragging: dragIndex === index, dragOver: dragOverIndex === index }"
                      :draggable="!col.locked" @dragstart="!col.locked && (dragIndex = index)"
                      @dragover.prevent="dragOverIndex = index" @drop="onDrop(index)"
                      @dragend="dragIndex = -1; dragOverIndex = -1">
                      <span class="drag-handle">
                        <el-icon>
                          <Rank />
                        </el-icon>
                      </span>
                      <el-checkbox v-model="col.visible" class="col-checkbox" :disabled="col.locked">
                        {{ col.label }}
                      </el-checkbox>
                      <div v-if="!col.locked" class="fix-actions">
                        <button class="fix-btn" :class="{ active: col.fixed === 'left' }"
                          @click.stop="toggleFix(col, 'left')">
                          <el-icon>
                            <DArrowLeft />
                          </el-icon>
                        </button>
                        <button class="fix-btn" :class="{ active: col.fixed === 'right' }"
                          @click.stop="toggleFix(col, 'right')">
                          <el-icon>
                            <DArrowRight />
                          </el-icon>
                        </button>
                      </div>
                      <span v-else class="locked-tip">固定</span>
                    </div>
                  </div>
                </div>
              </el-popover>

              <!-- 全屏 -->
              <button class="icon-btn" :class="{ active: isTableFullscreen }" :title="isTableFullscreen ? '退出全屏' : '全屏'"
                @click="toggleTableFullscreen">
                <el-icon>
                  <component :is="isTableFullscreen ? Close : FullScreen" />
                </el-icon>
              </button>
            </div>
          </div>

          <!-- 数据延迟提示（东风侧对「当天/昨天」的能耗数据有入库延迟） -->
          <div v-if="energyEmptyHint" class="data-hint">
            <el-icon class="hint-icon">
              <WarningFilled />
            </el-icon>
            <span>所选日期（{{ currentRange.start }} ~ {{ currentRange.end }}）暂无能耗数据，东风平台数据通常有 1 天延迟。</span>
            <button v-if="filters.period === 'day'" class="hint-btn" @click="queryPrevDay">改查前 1 天</button>
          </div>

          <!-- 表格 -->
          <div class="table-wrap">
            <el-table :data="tableData" v-loading="loading" :element-loading-text="loadingText"
              element-loading-background="rgba(255,255,255,0.88)" border stripe :size="tableSize" height="100%"
              class="custom-table" empty-text="暂无数据，请调整筛选条件后查询">
              <el-table-column v-for="col in visibleColumns" :key="col.prop" :prop="col.prop" :label="col.label"
                :width="col.width || undefined" :min-width="col.minWidth || undefined" :fixed="col.fixed || false"
                :align="col.align || 'center'" :sortable="col.sortable ? true : false"
                :show-overflow-tooltip="!!col.overflow">
                <template #default="{ row }">
                  <!-- 在线状态 -->
                  <span v-if="col.prop === 'onlineStatus'" class="status-tag" :class="statusClass(row.onlineStatus)">
                    <i class="dot"></i>{{ row.onlineStatus }}
                  </span>

                  <!-- 当前位置 -->
                  <span v-else-if="col.prop === 'location'" class="loc-text" :title="row.location">
                    {{ row.location || '--' }}
                  </span>

                  <!-- 数字类 -->
                  <span v-else-if="col.fmt === 'num1'" class="num-text">
                    {{ fmtNum(row[col.prop], 1) }}
                  </span>
                  <span v-else-if="col.fmt === 'num2'" class="num-text">
                    {{ fmtNum(row[col.prop], 2) }}
                  </span>

                  <!-- 时长 -->
                  <span v-else-if="col.fmt === 'duration'" class="duration-text">
                    {{ fmtDuration(row[col.prop]) }}
                  </span>

                  <!-- 时间 -->
                  <span v-else-if="col.fmt === 'time'" class="time-text">
                    {{ row[col.prop] || '--' }}
                  </span>

                  <span v-else class="text-content">{{ row[col.prop] || '--' }}</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>

        <transition name="fs-fade">
          <button v-if="isTableFullscreen" class="fs-exit-btn" @click="toggleTableFullscreen">
            <el-icon>
              <Close />
            </el-icon> 退出全屏
          </button>
        </transition>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Search, Refresh, Download, Operation, Setting, FullScreen, Close,
  Grid, Rank, DArrowLeft, DArrowRight, WarningFilled,
} from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { supabase, ensureAnonymousLogin } from '@/utils/supabase'
import { fetchRealtime } from '@/utils/waybillProgress'
import { fetchTripOil, fetchOdometerKm } from '@/utils/dongfengReport'
import { fetchDailyStats, aggregate } from '@/utils/opStats'

const AMAP_KEY = '273f5c474604b71906674aac159b8f45'
const CONCURRENCY = 8

// ============================================================
// 数据隔离（与全图监控一致）
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
const myOrgName = ref(isSubAccount ? String(currentUser.orgName || '').trim() || null : null)
const myOrgLevel = ref(isSubAccount ? (Number(currentUser.orgLevel) || 1) : null)

const isRootOrgSubAccount = computed(() => isSubAccount && Number(myOrgLevel.value) === 1)
const needOrgFilter = computed(() => isCustomer && isSubAccount && Number(myOrgLevel.value) >= 2)

const loadMyCustomerId = async () => {
  if (!isCustomer || myCustomerId.value || !myPhone) return
  try {
    const { data } = await supabase.from('customers').select('id').eq('phone', myPhone).maybeSingle()
    if (data) myCustomerId.value = data.id
  } catch (e) {
    console.warn('[综合报表] 查询客户信息失败:', e)
  }
}

const loadMyOrgInfo = async () => {
  if (!isCustomer || !isSubAccount) return
  if (myOrgName.value && myOrgLevel.value) return
  if (!currentUser.orgId) return
  try {
    const { data } = await supabase.from('organizations').select('name, level').eq('id', currentUser.orgId).maybeSingle()
    if (data) {
      if (data.name) myOrgName.value = String(data.name).trim()
      myOrgLevel.value = Number(data.level) || 1
    }
  } catch (e) {
    console.warn('[综合报表] 反查机构失败:', e)
  }
}

// ============================================================
// 车辆
// ============================================================
const vehicles = ref([])
const orgOptions = ref([])
const loading = ref(false)
const progress = reactive({ done: 0, total: 0 })

const plateOptions = computed(() => {
  const list = filters.org ? vehicles.value.filter(v => (v.org || '') === filters.org) : vehicles.value
  return list.filter(v => v.plate)
})

const loadVehicles = async () => {
  if (isCustomer && !myCustomerId.value) {
    vehicles.value = []
    return
  }
  try {
    let q = supabase
      .from('vehicles')
      .select('plate, vin, org, fuel_type, customer_id, updated_at')
      .order('updated_at', { ascending: false })

    if (isCustomer) {
      q = q.eq('customer_id', myCustomerId.value)
      if (!isRootOrgSubAccount.value && needOrgFilter.value && myOrgName.value) {
        q = q.eq('org', myOrgName.value)
      }
    }

    const { data, error } = await q
    if (error) throw error

    vehicles.value = (data || []).filter(v => v.plate).map(v => ({
      plate: v.plate,
      vin: (v.vin || '').trim(),
      org: v.org || '',
      fuel_type: v.fuel_type || '',
    }))

    const set = new Set()
    vehicles.value.forEach(v => { if (v.org) set.add(v.org) })
    orgOptions.value = Array.from(set)
  } catch (e) {
    console.error('[综合报表] 加载车辆失败:', e)
    ElMessage.error('加载车辆失败：' + (e.message || e))
  }
}

// ============================================================
// 筛选
// ============================================================
const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD')

const props = defineProps({
  defaultDate: { type: String, default: '' },
})

const filters = reactive({
  org: '',
  plate: '',
  period: 'day',
  date: props.defaultDate || yesterday,
  week: yesterday,
  month: dayjs().subtract(1, 'day').format('YYYY-MM'),
  range: [dayjs().subtract(7, 'day').format('YYYY-MM-DD'), yesterday],
})

const onOrgChange = () => { filters.plate = '' }

/** 周报：以所选日期所在周的周一为起点 */
const weekRange = (anyDay) => {
  const d = dayjs(anyDay)
  const dow = (d.day() + 6) % 7 // 周一 = 0
  const start = d.subtract(dow, 'day')
  return { start: start.format('YYYY-MM-DD'), end: start.add(6, 'day').format('YYYY-MM-DD') }
}

const resolveRange = () => {
  let start = ''
  let end = ''

  if (filters.period === 'day') {
    start = end = filters.date
  } else if (filters.period === 'week') {
    const r = weekRange(filters.week || yesterday)
    start = r.start
    end = r.end
  } else if (filters.period === 'month') {
    const d = dayjs((filters.month || yesterday.slice(0, 7)) + '-01')
    start = d.startOf('month').format('YYYY-MM-DD')
    end = d.endOf('month').format('YYYY-MM-DD')
  } else {
    start = filters.range?.[0] || ''
    end = filters.range?.[1] || ''
  }

  // 不给接口传未来日期
  const today = dayjs().format('YYYY-MM-DD')
  if (!end || end > today) end = today
  if (!start || start > end) start = end
  return { start, end }
}

const currentRange = ref({ start: yesterday, end: yesterday })
const rangeText = computed(() => {
  const { start, end } = currentRange.value
  if (!start || !end) return ''
  return start === end ? start : `${start} ~ ${end}`
})

// ============================================================
// 表格
// ============================================================
const tableData = ref([])

const DEFAULT_COLUMNS = [
  { prop: 'org', label: '所属机构', width: 132, fixed: 'left', locked: true, overflow: true },
  { prop: 'plate', label: '车牌号', width: 112, fixed: 'left', locked: true },
  { prop: 'vin', label: 'VIN', width: 160, locked: true, overflow: true },
  { prop: 'totalMileage', label: '累计里程km', width: 112, sortable: true, fmt: 'num1' },
  { prop: 'avgKwhPerKm', label: '累计电耗kwh/km', width: 122, sortable: true, fmt: 'num2' },
  { prop: 'hundredKwh', label: '百公里电耗kwh', width: 118, sortable: true, fmt: 'num2' },
  { prop: 'tripMileage', label: '行驶里程km', width: 112, sortable: true, fmt: 'num2' },
  { prop: 'travelFuel', label: '行驶电耗kwh', width: 112, sortable: true, fmt: 'num2' },
  { prop: 'startTime', label: '运行开始时间', width: 152, sortable: true, fmt: 'time' },
  { prop: 'endTime', label: '运行结束时间', width: 152, sortable: true, fmt: 'time' },
  { prop: 'driveMinutes', label: '驾驶时长', width: 108, sortable: true, fmt: 'duration' },
  { prop: 'runMinutes', label: '运行时长', width: 108, sortable: true, fmt: 'duration' },
  { prop: 'offMinutes', label: '下电时长', width: 108, sortable: true, fmt: 'duration' },
  { prop: 'avgSpeed', label: '平均车速km/h', width: 104, sortable: true, fmt: 'num1' },
  { prop: 'fuelType', label: '燃料类型', width: 110 },
  { prop: 'onlineStatus', label: '在线状态', width: 92, fixed: 'right', locked: true },
  { prop: 'location', label: '当前位置', width: 152, fixed: 'right', locked: true, align: 'left', overflow: true },
].map(c => ({ visible: true, ...c }))

const columnConfig = ref(JSON.parse(JSON.stringify(DEFAULT_COLUMNS)))
const visibleColumns = computed(() => columnConfig.value.filter(c => c.visible))

const columnPopoverVisible = ref(false)
const resetColumns = () => {
  columnConfig.value = JSON.parse(JSON.stringify(DEFAULT_COLUMNS))
  ElMessage.success('已重置列设置')
}
const toggleFix = (col, side) => { col.fixed = col.fixed === side ? false : side }

const dragIndex = ref(-1)
const dragOverIndex = ref(-1)
const onDrop = (index) => {
  if (dragIndex.value === -1 || dragIndex.value === index) {
    dragIndex.value = -1; dragOverIndex.value = -1; return
  }
  const list = [...columnConfig.value]
  const [item] = list.splice(dragIndex.value, 1)
  list.splice(index, 0, item)
  columnConfig.value = list
  dragIndex.value = -1; dragOverIndex.value = -1
}

// 密度
const tableSize = ref('default')
const handleDensityChange = (cmd) => { tableSize.value = cmd }

// 全屏
const isTableFullscreen = ref(false)
const toggleTableFullscreen = () => { isTableFullscreen.value = !isTableFullscreen.value }
const onEscKeydown = (e) => {
  if (e.key === 'Escape' && isTableFullscreen.value) isTableFullscreen.value = false
}

// ============================================================
// 格式化
// ============================================================
const fmtNum = (v, digits = 1) => {
  if (v === null || v === undefined || v === '' || isNaN(Number(v))) return '--'
  return Number(v).toFixed(digits)
}

/** 分钟 → 「2 小时 29 分钟 55 秒」 */
const fmtDuration = (minutes) => {
  if (minutes === null || minutes === undefined || isNaN(Number(minutes))) return '--'
  const total = Math.max(0, Math.round(Number(minutes) * 60))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const parts = []
  if (h > 0) parts.push(`${h} 小时`)
  if (h > 0 || m > 0) parts.push(`${m} 分钟`)
  parts.push(`${s} 秒`)
  return parts.join(' ')
}

const parseTimeMs = (raw) => {
  if (!raw) return 0
  const ms = new Date(String(raw).trim().replace(/-/g, '/')).getTime()
  return isNaN(ms) ? 0 : ms
}

const statusClass = (s) => (s === '行驶' ? 'driving' : s === '静止' ? 'parked' : 'offline')

// ============================================================
// 逆地理编码（高德 JS API，懒加载 + 坐标缓存）
// ============================================================
let amapPromise = null
const loadAMap = () => {
  if (amapPromise) return amapPromise
  amapPromise = new Promise((resolve, reject) => {
    if (window.AMap) return resolve(window.AMap)
    const script = document.createElement('script')
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}&plugin=AMap.Geocoder`
    script.onload = () => resolve(window.AMap)
    script.onerror = () => reject(new Error('高德 SDK 加载失败'))
    document.head.appendChild(script)
  }).catch((e) => {
    console.warn('[综合报表]', e.message)
    amapPromise = null
    return null
  })
  return amapPromise
}

let geocoder = null
const addrCache = new Map()

const resolveAddress = async (lng, lat) => {
  if (!lng || !lat) return ''
  const key = `${Number(lng).toFixed(4)},${Number(lat).toFixed(4)}`
  if (addrCache.has(key)) return addrCache.get(key)

  const AMap = await loadAMap()
  if (!AMap) return ''
  if (!geocoder) geocoder = new AMap.Geocoder({ radius: 500, extensions: 'base' })

  const addr = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(''), 6000)
    geocoder.getAddress([lng, lat], (status, result) => {
      clearTimeout(timer)
      if (status === 'complete' && result?.regeocode) {
        resolve(result.regeocode.formattedAddress || '')
      } else {
        resolve('')
      }
    })
  })

  addrCache.set(key, addr)
  return addr
}

// ============================================================
// 单车数据拼装
// ============================================================
/* DB 里的时间是 ISO，转成表格习惯的 2026-10-16 06:34:06 */
const fmtISO = (raw) => {
  if (!raw) return ''
  const d = new Date(raw)
  if (isNaN(d.getTime())) return String(raw)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

const buildRow = async (v, start, end, dbStat) => {
  const row = {
    org: v.org || '--',
    plate: v.plate || '--',
    vin: v.vin || '--',
    totalMileage: null,
    avgKwhPerKm: null,
    hundredKwh: null,
    tripMileage: null,
    travelFuel: null,
    startTime: '',
    endTime: '',
    driveMinutes: null,
    runMinutes: null,
    offMinutes: null,
    avgSpeed: null,
    fuelType: v.fuel_type || '--',
    onlineStatus: '离线',
    location: '--',
  }

  if (!v.vin) return row

  // ✅ 命中缓存：能耗相关列直接落，不再打东风（在线状态/位置/累计里程稍后补齐）
  if (dbStat) {
    row.tripMileage = dbStat.km
    row.travelFuel = dbStat.fuel
    row.avgKwhPerKm = dbStat.km > 0 ? dbStat.fuel / dbStat.km : null
    row.hundredKwh = dbStat.rate
    row.startTime = fmtISO(dbStat.startTime)
    row.endTime = fmtISO(dbStat.endTime)
    row.runMinutes = dbStat.runMin
    row.driveMinutes = dbStat.runMin
    row.offMinutes = dbStat.offMin
    row.avgSpeed = dbStat.avgSpeed
    row._needEnrich = true
    return row
  }

  const [oilRes, liveRes, odoRes] = await Promise.allSettled([
    fetchTripOil(v.vin, start, end),
    fetchRealtime(v.vin, v.plate),
    fetchOdometerKm(v.vin, end),
  ])

  // ---------- 累计里程 ----------
  if (odoRes.status === 'fulfilled' && odoRes.value != null) {
    row.totalMileage = odoRes.value
  }

  // ---------- 能耗 ----------
  const oil = oilRes.status === 'fulfilled' ? oilRes.value : null
  if (oil && oil.ok) {
    const d = oil.data
    const tripKm = Number(d.tripMileage) / 1000      // 米 → 公里
    const fuelKwh = Number(d.sumTravelFuel) / 1000   // Wh → kWh

    row.tripMileage = isFinite(tripKm) ? tripKm : null
    row.travelFuel = isFinite(fuelKwh) ? fuelKwh : null

    // 百公里电耗：接口的 hundredSumTravelFuel 恒为 0.02（量纲/精度都不可用），
    // 统一用 行驶电耗 ÷ 行驶里程 × 100 现算
    if (row.tripMileage > 0 && row.travelFuel != null) {
      row.avgKwhPerKm = row.travelFuel / row.tripMileage
      row.hundredKwh = row.avgKwhPerKm * 100
    }

    row.startTime = d.startTime || ''
    row.endTime = d.endTime || ''

    const runMin = Number(d.travelSumDuration)
    if (isFinite(runMin)) {
      row.runMinutes = runMin
      row.driveMinutes = runMin // 驾驶时长 = 运行时长（业务口径）
    }

    const avg = Number(d.travelAvgDuration)
    if (isFinite(avg)) row.avgSpeed = avg * 3.6 // m/s → km/h

    // 下电时长 = 运行结束 − 运行开始 − 运行时长
    const sMs = parseTimeMs(row.startTime)
    const eMs = parseTimeMs(row.endTime)
    if (sMs && eMs && eMs > sMs && row.runMinutes != null) {
      row.offMinutes = Math.max(0, (eMs - sMs) / 60000 - row.runMinutes)
    }
  }

  // ---------- 在线状态 / 当前位置（实时，与所选日期无关） ----------
  const live = liveRes.status === 'fulfilled' ? liveRes.value : null
  if (live) {
    row.onlineStatus = live.status || '离线'
    const addr = await resolveAddress(live.lng, live.lat)
    const fallback = live.locationText && !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(live.locationText)
      ? live.locationText
      : `${Number(live.lng).toFixed(6)}, ${Number(live.lat).toFixed(6)}`
    row.location = addr || fallback
  }

  return row
}

// ============================================================
// 查询
// ============================================================
const loadingText = computed(() =>
  progress.total ? `正在查询 ${progress.done}/${progress.total} 辆车…` : '加载中…'
)

const targetVehicles = () => {
  let list = vehicles.value
  if (filters.org) list = list.filter(v => (v.org || '') === filters.org)
  if (filters.plate) list = list.filter(v => v.plate === filters.plate)
  return list
}

const fetchData = async () => {
  if (!vehicles.value.length) {
    tableData.value = []
    return
  }

  const { start, end } = resolveRange()
  currentRange.value = { start, end }

  const list = targetVehicles()
  if (!list.length) {
    tableData.value = []
    return
  }

  loading.value = true
  progress.total = list.length
  progress.done = 0

  // ① 一次查询把区间内的逐日数据读回来，按车汇总
  let dbMap = {}
  try {
    const dbRows = await fetchDailyStats({ start, end, org: filters.org || null })
    const byVin = {}
    dbRows.forEach((r) => { (byVin[r.vin] = byVin[r.vin] || []).push(r) })
    Object.keys(byVin).forEach((vin) => { dbMap[vin] = aggregate(byVin[vin]) })
  } catch (e) {
    console.warn('[综合报表] 读缓存失败，走实时接口', e)
  }
  const cacheHit = Object.keys(dbMap).length

  const out = new Array(list.length)
  let idx = 0
  const worker = async () => {
    while (idx < list.length) {
      const i = idx++
      try {
        out[i] = await buildRow(list[i], start, end, dbMap[list[i].vin])
      } catch (e) {
        console.warn('[综合报表] 行查询失败:', list[i].plate, e)
        out[i] = { org: list[i].org || '--', plate: list[i].plate, vin: list[i].vin || '--', fuelType: list[i].fuel_type || '--', onlineStatus: '离线', location: '--' }
      }
      progress.done++
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, () => worker()))
    tableData.value = out.filter(Boolean)

    // ② 缓存命中的行：表格先出来，再后台补"在线状态/当前位置/累计里程"
    if (cacheHit) {
      const need = tableData.value.filter((r) => r._needEnrich)
      if (need.length) enrichRows(need)
    }
  } finally {
    loading.value = false
  }
}

/* 后台补齐：实时状态 + 位置 + 里程表读数（不阻塞表格显示） */
const enrichRows = async (rows) => {
  let i = 0
  const worker = async () => {
    while (i < rows.length) {
      const row = rows[i++]
      try {
        const [odo, live] = await Promise.allSettled([
          fetchOdometerKm(row.vin, currentRange.value.end),
          fetchRealtime(row.vin, row.plate),
        ])
        if (odo.status === 'fulfilled' && odo.value != null) row.totalMileage = odo.value
        if (live.status === 'fulfilled' && live.value) {
          row.onlineStatus = live.value.status || '离线'
          row.location = await resolveAddress(live.value.lng, live.value.lat)
        }
      } catch (e) { /* 单个失败不影响其他 */ }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
}

const handleSearch = () => { fetchData() }

/* 所有车都没拿到能耗：多半是东风侧当天/昨天的数据还没入库 */
const energyEmptyHint = computed(() => {
  if (loading.value || !tableData.value.length) return false
  return tableData.value.every(r => r.tripMileage == null && r.travelFuel == null)
})

const queryPrevDay = () => {
  const base = filters.date || currentRange.value.start || dayjs().format('YYYY-MM-DD')
  filters.period = 'day'
  filters.date = dayjs(base).subtract(1, 'day').format('YYYY-MM-DD')
  fetchData()
}

const handleReset = () => {
  filters.org = ''
  filters.plate = ''
  filters.period = 'day'
  filters.date = yesterday
  filters.week = yesterday
  filters.month = dayjs().subtract(1, 'day').format('YYYY-MM')
  filters.range = [dayjs().subtract(7, 'day').format('YYYY-MM-DD'), yesterday]
  tableData.value = []
  fetchData()
}

const handleRefresh = async () => {
  await fetchData()
  ElMessage.success({ message: '已刷新', duration: 1200 })
}

// ============================================================
// 导出
// ============================================================
const cellText = (row, col) => {
  if (col.prop === 'onlineStatus') return row.onlineStatus || ''
  if (col.prop === 'location') return row.location || ''
  if (col.fmt === 'num1') return row[col.prop] == null ? '' : Number(row[col.prop]).toFixed(1)
  if (col.fmt === 'num2') return row[col.prop] == null ? '' : Number(row[col.prop]).toFixed(2)
  if (col.fmt === 'duration') return row[col.prop] == null ? '' : fmtDuration(row[col.prop])
  return row[col.prop] == null ? '' : String(row[col.prop])
}

const handleExport = () => {
  if (!tableData.value.length) { ElMessage.warning('没有数据可导出'); return }

  const cols = visibleColumns.value
  const headers = cols.map(c => c.label)
  const lines = tableData.value.map(row => cols.map(c => {
    const v = cellText(row, c)
    return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v
  }).join(','))

  const csv = [headers.join(','), ...lines].join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const { start, end } = currentRange.value
  a.download = `综合报表_${start}${start === end ? '' : '_' + end}.csv`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success(`已导出 ${tableData.value.length} 条`)
}

// ============================================================
// 生命周期
// ============================================================
onMounted(async () => {
  document.addEventListener('keydown', onEscKeydown)
  // 匿名登录态（直接从其它页面跳进来 / 刷新后失效时兜底）
  try { await ensureAnonymousLogin() } catch (e) { console.warn('[综合报表] 匿名登录失败:', e) }
  await loadMyCustomerId()
  await loadMyOrgInfo()
  await loadVehicles()
  await fetchData()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onEscKeydown)
})
</script>

<style scoped>
/* ============================================================
   页面布局
   ============================================================ */
.summary-page {
  --num-font: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue',
    'PingFang SC', 'HarmonyOS Sans SC', 'Source Han Sans SC', 'Microsoft YaHei', Arial, sans-serif;
  padding: 6px 16px 16px;
  background-color: #F8FAFC;
  height: calc(100vh - 147px);
  max-height: calc(100vh - 147px);
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: var(--num-font);
  font-size: 13px;
  color: #1E293B;
}

/* ========== 筛选卡片 ========== */
.filter-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  padding: 14px 16px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.search-row :deep(.el-input__wrapper),
.search-row :deep(.el-select__wrapper) {
  border-radius: 8px !important;
  background: #F8FAFC !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  transition: all 0.25s;
  min-height: 32px;
}

.search-row :deep(.el-input__wrapper:hover),
.search-row :deep(.el-select__wrapper:hover) {
  background: var(--brand-primary-light) !important;
  box-shadow: 0 0 0 1px #FCA5A5 inset !important;
}

.search-row :deep(.el-input__wrapper.is-focus),
.search-row :deep(.el-select__wrapper.is-focused) {
  background: #fff !important;
  box-shadow: 0 0 0 2px rgba(var(--brand-rgb), 0.15), 0 0 0 1px var(--brand-primary) inset !important;
}

.search-btns {
  display: flex;
  gap: 10px;
  margin-left: auto;
}

:deep(.el-button) {
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  border-radius: 8px;
  font-weight: 600;
}

:deep(.el-button:hover) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(var(--brand-rgb), 0.15);
}

:deep(.btn-primary) {
  background-color: var(--brand-primary);
  border-color: var(--brand-primary);
  color: #fff;
}

:deep(.btn-primary:hover) {
  background-color: #a00d24;
  border-color: #a00d24;
}

:deep(.btn-outline) {
  border-color: #CBD5E1;
  color: #334155;
  background: #fff;
}

:deep(.btn-outline:hover) {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
  background-color: var(--brand-primary-light);
}

/* ========== 表格卡片 ========== */
.table-card-wrap {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.table-card-wrap.is-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 9999;
  padding: 24px;
  background: rgba(248, 250, 252, 0.85);
  backdrop-filter: blur(20px) saturate(180%);
  animation: fs-fade-in 0.3s;
}

@keyframes fs-fade-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

.table-card-wrap.is-fullscreen .table-card {
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(var(--brand-rgb), 0.18);
}

.table-card {
  flex: 1;
  min-height: 0;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}

/* ========== 工具栏 ========== */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  flex-wrap: wrap;
  padding-bottom: 10px;
  border-bottom: 1px solid #F1F5F9;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-bar {
  width: 4px;
  height: 18px;
  border-radius: 2px;
  background: linear-gradient(180deg, var(--brand-primary), var(--brand-primary-dark));
  box-shadow: 0 0 8px rgba(var(--brand-rgb), 0.35);
}

.toolbar-title {
  font-size: 15px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: 0.3px;
}

.toolbar-total {
  font-size: 12.5px;
  color: #94A3B8;
  font-weight: 500;
  padding-left: 8px;
  border-left: 1px solid #E2E8F0;
}

.toolbar-progress {
  font-size: 12px;
  color: var(--brand-primary);
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 10px;
  background: var(--brand-primary-light);
  border: 1px solid #FECACA;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-wrap: wrap;
}

/* ========== 数据延迟提示 ========== */
.data-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 9px;
  background: #FFFBEB;
  border: 1px solid #FDE68A;
  color: #92400E;
  font-size: 12.5px;
  font-weight: 500;
  flex-shrink: 0;
}

.data-hint .hint-icon {
  color: #D97706;
  font-size: 14px;
}

.hint-btn {
  margin-left: auto;
  border: 1px solid #FCD34D;
  background: #fff;
  color: #B45309;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.hint-btn:hover {
  background: #D97706;
  border-color: #D97706;
  color: #fff;
}

/* ========== 图标按钮 ========== */
.icon-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #E2E8F0;
  background: #fff;
  border-radius: 8px;
  color: #64748B;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  padding: 0;
  font-family: inherit;
}

.icon-btn:hover {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
  background: var(--brand-primary-light);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(var(--brand-rgb), 0.15);
}

.icon-btn:active {
  transform: translateY(0);
}

.icon-btn.active {
  border-color: var(--brand-primary);
  color: #fff;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  box-shadow: 0 4px 12px rgba(var(--brand-rgb), 0.35);
}

/* ========== 表格 ========== */
.table-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border-radius: 8px;
}

/* 固定列加投影，滚动时能看出"这几列钉住了" */
:deep(.el-table__cell.el-table-fixed-column--left.is-last-column::before),
:deep(.el-table__cell.el-table-fixed-column--right.is-first-column::before) {
  content: '';
  position: absolute;
  top: 0;
  bottom: -1px;
  width: 24px;
  pointer-events: none;
}

:deep(.el-table__cell.el-table-fixed-column--left.is-last-column::before) {
  right: -24px;
  box-shadow: -6px 0 8px -6px rgba(15, 23, 42, 0.28);
}

:deep(.el-table__cell.el-table-fixed-column--right.is-first-column::before) {
  left: -24px;
  box-shadow: 6px 0 8px -6px rgba(15, 23, 42, 0.28);
}

:deep(.el-table__cell.el-table-fixed-column--left),
:deep(.el-table__cell.el-table-fixed-column--right) {
  background: #fbfcfe;
}

/* 表头固定列给个更明显的底色，一眼能看出"这几列是钉住的" */
:deep(.el-table__header .el-table__cell.el-table-fixed-column--left),
:deep(.el-table__header .el-table__cell.el-table-fixed-column--right) {
  background: #eef3f9;
}

/* 固定区边界画一条实线，比阴影更直观 */
:deep(.el-table__cell.el-table-fixed-column--left.is-last-column) {
  border-right: 1px solid #dbe3ec;
}

:deep(.el-table__cell.el-table-fixed-column--right.is-first-column) {
  border-left: 1px solid #dbe3ec;
}

.custom-table {
  border-radius: 8px;
  overflow: hidden;
  font-size: 13px;
  font-family: var(--num-font);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

:deep(.custom-table th.el-table__cell) {
  background: #F8FAFC !important;
  color: #0F172A;
  font-weight: 700;
  font-size: 12.5px;
  letter-spacing: 0.2px;
  border-bottom: 1px solid #E2E8F0;
  padding: 10px 0;
}

:deep(.custom-table td.el-table__cell) {
  color: #1F2937;
  font-size: 13px;
  font-weight: 500;
  border-bottom: 1px solid #F1F5F9;
}

:deep(.custom-table.el-table--large td.el-table__cell) {
  padding: 14px 0;
}

:deep(.custom-table.el-table--default td.el-table__cell) {
  padding: 10px 0;
}

:deep(.custom-table.el-table--small td.el-table__cell) {
  padding: 6px 0;
}

:deep(.custom-table .el-table__row:hover td) {
  background: var(--brand-primary-light) !important;
}

:deep(.custom-table .el-table__body tr.el-table__row--striped td.el-table__cell) {
  background: #FAFBFC;
}

:deep(.custom-table .cell) {
  padding: 0 10px;
}

/* ========== 单元格 ==========
   ⭐ 数字/时间统一换成系统无衬线字体（PingFang / 思源黑），
      比原来的 Courier 等宽体更清爽、笔画更实，远看也清楚 */
.num-text {
  font-family: var(--num-font);
  font-weight: 600;
  color: #111827;
  font-size: 13.5px;
  letter-spacing: 0.2px;
  font-variant-numeric: tabular-nums;
}

.duration-text {
  font-family: var(--num-font);
  font-size: 12.8px;
  font-weight: 500;
  color: #374151;
  letter-spacing: 0.1px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.time-text {
  font-family: var(--num-font);
  font-size: 12.8px;
  font-weight: 500;
  color: #374151;
  letter-spacing: 0.1px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.text-content {
  color: #1F2937;
  font-size: 13px;
  font-weight: 500;
}

/* VIN 这类长串：稍加字距，眼睛不容易串行 */
:deep(.custom-table td:nth-child(3) .cell) span {
  letter-spacing: 0.4px;
}

.loc-text {
  display: block;
  color: #4B5563;
  font-size: 12.5px;
  line-height: 1.45;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 在线状态 */
.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
  border: 1px solid transparent;
}

.status-tag .dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.status-tag.driving {
  background: #ECFDF5;
  color: #059669;
  border-color: #A7F3D0;
}

.status-tag.parked {
  background: #FFFBEB;
  color: #D97706;
  border-color: #FDE68A;
}

.status-tag.offline {
  background: #F1F5F9;
  color: #64748B;
  border-color: #E2E8F0;
}

/* 列设置：锁定列 */
.locked-tip {
  font-size: 11px;
  color: #94A3B8;
  background: #F1F5F9;
  border-radius: 4px;
  padding: 1px 6px;
}

/* 全屏退出 */
.fs-exit-btn {
  position: fixed;
  right: 40px;
  bottom: 28px;
  z-index: 10000;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  border: none;
  border-radius: 20px;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(var(--brand-rgb), 0.35);
  transition: all 0.25s;
}

.fs-exit-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 30px rgba(var(--brand-rgb), 0.45);
}

.fs-fade-enter-active,
.fs-fade-leave-active {
  transition: opacity 0.25s;
}

.fs-fade-enter-from,
.fs-fade-leave-to {
  opacity: 0;
}

/* loading 文案 */
:deep(.el-loading-text) {
  color: #64748B;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 1px;
}
</style>

<!-- ===== 全局：下拉/列设置弹层样式（与系统其它列表页保持一致） ===== -->
<style>
.density-dropdown-red.el-dropdown__popper.el-popper,
.column-setting-popper.el-popover.el-popper {
  border: 2px solid #FFFFFF !important;
  box-shadow: 0 10px 32px rgba(var(--brand-rgb), 0.18), 0 0 0 1px rgba(var(--brand-rgb), 0.12) !important;
  border-radius: 10px !important;
  overflow: hidden;
  background: #FFFFFF !important;
}

.column-setting-popper.el-popover.el-popper {
  padding: 0 !important;
}

.density-dropdown-red .el-dropdown-menu {
  padding: 4px !important;
  background: #FFFFFF !important;
}

.density-dropdown-red .el-dropdown-menu__item {
  font-size: 13px !important;
  color: var(--brand-primary) !important;
  font-weight: 600 !important;
  border-radius: 6px !important;
  padding: 6px 16px !important;
  transition: all 0.25s;
}

.density-dropdown-red .el-dropdown-menu__item:hover {
  color: #fff !important;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark)) !important;
}

.density-dropdown-red .density-item {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
}

.density-dropdown-red .density-item.active {
  color: var(--brand-primary);
  font-weight: 700;
}

.density-dropdown-red .el-dropdown-menu__item:hover .density-item.active {
  color: #fff;
}

.column-setting-popper .el-popover__title {
  display: none;
}

.column-setting {
  padding: 0;
  background: #FFFFFF;
}

.column-setting-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #FEE2E2;
}

.col-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 700;
  color: var(--brand-primary);
}

.col-reset {
  font-size: 12.5px;
  color: var(--brand-primary);
  cursor: pointer;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.25s;
}

.col-reset:hover {
  background: #FEE2E2;
  text-decoration: underline;
}

.column-setting-body {
  max-height: 400px;
  overflow-y: auto;
  padding: 6px;
}

.column-setting-body::-webkit-scrollbar {
  width: 4px;
}

.column-setting-body::-webkit-scrollbar-thumb {
  background: #FCA5A5;
  border-radius: 2px;
}

.column-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: grab;
  transition: all 0.25s;
  user-select: none;
}

.column-item:hover {
  background: var(--brand-primary-light);
}

.column-item.dragging {
  opacity: 0.4;
}

.column-item.dragOver {
  background: #FEE2E2;
}

.drag-handle {
  display: flex;
  align-items: center;
  color: #FCA5A5;
  cursor: grab;
  font-size: 14px;
}

.column-item:hover .drag-handle {
  color: var(--brand-primary);
}

.col-checkbox {
  flex: 1;
  min-width: 0;
  font-size: 13px;
}

.col-checkbox .el-checkbox__label {
  font-size: 13px;
  color: var(--brand-primary);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-checkbox .el-checkbox__inner {
  border-color: #FCA5A5;
}

.col-checkbox.is-checked .el-checkbox__inner,
.col-checkbox .el-checkbox__input.is-checked .el-checkbox__inner {
  background-color: var(--brand-primary);
  border-color: var(--brand-primary);
}

.col-checkbox .el-checkbox__input.is-checked + .el-checkbox__label {
  color: var(--brand-primary);
}

.fix-actions {
  display: flex;
  gap: 2px;
}

.fix-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #E2E8F0;
  background: #FFF;
  border-radius: 4px;
  color: #94A3B8;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  transition: all 0.2s;
}

.fix-btn:hover {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
}

.fix-btn.active {
  border-color: var(--brand-primary);
  background: var(--brand-primary);
  color: #fff;
}
</style>
