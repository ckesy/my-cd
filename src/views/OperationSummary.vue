<template>
  <div class="op-page">
    <!-- ================= 顶部：模式 + 筛选 ================= -->
    <div class="top-bar">
      <div class="modes">
        <button :class="{ active: mode === 'wb' }" @click="setMode('wb')">工作台</button>
        <button :class="{ active: mode === 'table' }" @click="setMode('table')">明细表</button>
      </div>

      <template v-if="mode === 'wb'">
        <el-select v-model="filters.org" placeholder="全部机构" clearable style="width: 150px">
          <el-option v-for="o in orgOptions" :key="o" :label="o" :value="o" />
        </el-select>

        <el-select v-model="period" style="width: 132px">
          <el-option label="本月" value="month" />
          <el-option label="近 7 天" value="7d" />
          <el-option label="上周" value="lastweek" />
          <el-option label="自定义" value="custom" />
        </el-select>

        <el-date-picker
          v-if="period === 'custom'"
          v-model="customRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="开始"
          end-placeholder="结束"
          unlink-panels
          style="width: 238px"
          @change="reloadAll"
        />

        <span class="range-tip">
          {{ rangeText }}
          <i v-if="dbCover.rows" class="cache-tip">缓存 {{ dbCover.rows }} 条</i>
        </span>

        <div class="bar-right">
          <span v-if="loadingAll && progress.total" class="progress">查询中 {{ progress.done }}/{{ progress.total }}</span>
          <el-button class="btn-outline" :loading="syncing" title="服务端批量拉取东风数据并写库" @click="syncNow">
            <el-icon><Download /></el-icon> 同步数据
          </el-button>
          <el-button class="btn-outline" :loading="loadingAll" @click="reloadAll">
            <el-icon><Refresh /></el-icon> 刷新
          </el-button>
          <el-button v-if="!editing" class="btn-outline" @click="startEdit">
            <el-icon><Operation /></el-icon> 编辑布局
          </el-button>
          <template v-else>
            <el-button class="btn-outline" @click="resetLayout">恢复默认</el-button>
            <el-button type="primary" class="btn-primary" @click="finishEdit">完成</el-button>
          </template>
        </div>
      </template>

      <template v-else>
        <span class="range-tip">明细表沿用原有筛选（机构 / 日期类型 / 日期），见下方筛选条</span>
      </template>
    </div>

    <!-- ================= 工作台 ================= -->
    <div v-show="mode === 'wb'" class="board-wrap">
      <div class="board" :class="{ editing }">
        <div
          v-for="t in layout"
          :key="t.key"
          class="tile"
          :class="{ dragging: dragKey === t.key, over: overKey === t.key }"
          :style="{ gridColumn: 'span ' + t.span }"
          :draggable="editing"
          @dragstart="onDragStart(t)"
          @dragover.prevent="onDragOver(t)"
          @dragleave="overKey = ''"
          @drop.prevent="onDrop(t)"
          @dragend="onEndDrag"
        >
          <div class="tile-head">
            <span v-if="editing" class="grab" title="拖动排序">⠿</span>
            <span class="t-title">{{ TITLES[t.key] }}</span>
            <button
              class="scope"
              :class="{ custom: !!tileRanges[t.key] }"
              :title="scopeTitle(t.key)"
              @click.stop="openScope(t.key)"
            >{{ scopeText(t.key) }}</button>
            <span class="flex1"></span>
            <button v-if="!editing" class="expand" @click="expand(t.key)">展开 ↗</button>
          </div>

          <div class="tile-tip" :title="DESCS[t.key]">{{ DESCS[t.key] }}</div>

          <div class="tile-body">
            <OpView
              :kind="t.key"
              compact
              :loading="loading[t.key]"
              :payload="payload(t.key)"
              @pick="onPickDay"
            />
          </div>
        </div>
      </div>

    <!-- ================= 展开层 ================= -->
    <transition name="exp">
      <div v-if="expanded" class="expander">
        <div class="exp-head">
          <button class="back" @click="closeExpand">← 返回工作台</button>
          <span class="exp-title">{{ TITLES[expanded] }}</span>
          <span class="exp-scope">{{ scopeText(expanded) }}</span>

          <template v-if="expanded === 'cal'">
            <el-select v-model="calPlate" size="small" style="width: 140px" @change="loadCalendar">
              <el-option v-for="v in filteredVehicles" :key="v.plate" :label="v.plate" :value="v.plate" />
            </el-select>
            <div class="month-nav">
              <button @click="shiftMonth(-1)">‹</button>
              <span>{{ calMonth.format('YYYY 年 M 月') }}</span>
              <button @click="shiftMonth(1)">›</button>
            </div>
            <div class="chips">
              <button
                v-for="m in CAL_METRICS" :key="m.key"
                :class="{ active: calMetric === m.key }"
                @click="calMetric = m.key"
              >{{ m.label }}</button>
            </div>
          </template>

          <template v-else-if="expanded === 'timeline'">
            <el-date-picker v-model="tlDate" type="date" size="small" value-format="YYYY-MM-DD"
              :clearable="false" style="width: 140px" @change="onTimelineDateChange" />
            <div class="chips">
              <button v-for="s in TL_SORTS" :key="s.key" :class="{ active: tlSort === s.key }"
                @click="tlSort = s.key">{{ s.label }}</button>
            </div>
          </template>

          <template v-else-if="expanded === 'rank'">
            <div class="chips">
              <button v-for="m in RANK_METRICS" :key="m.key" :class="{ active: rankMetric === m.key }"
                @click="rankMetric = m.key">{{ m.label }}</button>
            </div>
          </template>

          <template v-else-if="expanded === 'quad'">
            <div class="chips">
              <button :class="{ active: quadX === 'km' }" @click="quadX = 'km'">横轴：日均里程</button>
            </div>
          </template>

          <template v-else-if="expanded === 'issues'">
            <div class="chips">
              <button v-for="t in ISSUE_TYPES" :key="t.key" :class="{ active: issueType === t.key }"
                @click="issueType = t.key">{{ t.label }}</button>
            </div>
          </template>

          <span class="flex1"></span>
          <button class="close-x" @click="closeExpand">✕</button>
        </div>

        <div class="exp-tip">{{ DESCS[expanded] }}</div>

        <div class="exp-body">
          <OpView :kind="expanded" :loading="loading[expanded]" :payload="payload(expanded)" />
        </div>
      </div>
    </transition>
    </div>

    <!-- ================= 明细表 ================= -->
    <OperationTable v-if="mode === 'table'" :default-date="dayEnd" />


    <!-- ================= 口径设置 ================= -->
    <el-dialog v-model="scopeOpen" title="设置该视图的时间口径" width="380px" append-to-body>
      <div class="scope-form">
        <p class="scope-hint">默认跟随全局筛选：<b>{{ rangeText }}</b></p>
        <el-date-picker
          v-if="scopeKind === 'range'"
          v-model="scopeDraftRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="开始"
          end-placeholder="结束"
          style="width: 100%"
        />
        <el-date-picker
          v-else-if="scopeKind === 'month'"
          v-model="scopeDraftMonth"
          type="month"
          value-format="YYYY-MM"
          style="width: 100%"
        />
        <el-date-picker
          v-else
          v-model="scopeDraftDate"
          type="date"
          value-format="YYYY-MM-DD"
          style="width: 100%"
        />
      </div>
      <template #footer>
        <el-button size="small" @click="resetScope">跟随全局</el-button>
        <el-button size="small" @click="scopeOpen = false">取消</el-button>
        <el-button size="small" type="primary" @click="applyScope">应用</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Operation, Download } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { supabase, ensureAnonymousLogin } from '@/utils/supabase'
import { fetchTripOil } from '@/utils/dongfengReport'
import { fetchDailyStats, rowToStat, aggregate, triggerSync } from '@/utils/opStats'
import OpView from '@/components/operation/OpView.vue'
import OperationTable from '@/components/operation/OperationTable.vue'

const TITLES = {
  cal: '逐日日历',
  issues: '异常待办',
  quad: '效率象限',
  rank: '车队排行',
  matrix: '车辆矩阵',
  timeline: '运行剖面',
  rhythm: '周节律',
}

const DESCS = {
  cal: '看这台车每天跑了多少、电耗高低；颜色越深越费电，灰的是没出车',
  issues: '系统挑出来的异常车和原因，先处理电耗超标和长期不出车的',
  quad: '横轴看跑得多不多、纵轴看费不费电；右下角是既省电又跑得多的标杆',
  rank: '按指标从高到低排队，条形越长数值越大；虚线是车队平均值',
  matrix: '每台车每天的里程，色块越深跑得越多；空白的格子是当天没跑',
  timeline: '一天里每台车从几点跑到几点；橙色段是长时间停着没动',
  rhythm: '一周里每天各时段有多少车在路上，颜色越深同时在跑的车越多',
}

const CAL_METRICS = [
  { key: 'km', label: '行驶里程' },
  { key: 'fuel', label: '行驶电耗' },
  { key: 'rate', label: '百公里电耗' },
]
const TL_SORTS = [
  { key: 'start', label: '按出车' },
  { key: 'km', label: '按里程' },
  { key: 'off', label: '按下电' },
]
const RANK_METRICS = [
  { key: 'rate', label: '百公里电耗' },
  { key: 'km', label: '行驶里程' },
  { key: 'fuel', label: '行驶电耗' },
]
const ISSUE_TYPES = [
  { key: 'all', label: '全部' },
  { key: 'rate', label: '电耗超标' },
  { key: 'km', label: '里程偏低' },
  { key: 'run', label: '运行不足' },
]

const ORG_COLORS = ['#c8102e', '#e8a33d', '#4f7cac', '#7f8c9b', '#9f5fa8', '#3d9970']
const DAY_LIMIT = 12

const currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('currentUser') || '{}') }
  catch { return {} }
})()

const isAdmin = currentUser.role === 'admin'
const isCustomer = !isAdmin
const isSubAccount = !!currentUser.isSubAccount
const myPhone = currentUser.masterPhone || currentUser.phone || ''
const myCustomerId = ref(currentUser.customerId || null)
const myOrgName = ref(isSubAccount ? String(currentUser.orgName || '').trim() || null : null)
const myOrgLevel = ref(isSubAccount ? (Number(currentUser.orgLevel) || 1) : null)
const isRootOrgSubAccount = computed(() => isSubAccount && Number(myOrgLevel.value) === 1)
const needOrgFilter = computed(() => isCustomer && isSubAccount && Number(myOrgLevel.value) >= 2)

/* ---------------- 布局 ---------------- */
const DEFAULT_LAYOUT = [
  { key: 'cal', span: 5 },
  { key: 'issues', span: 3 },
  { key: 'quad', span: 4 },
  { key: 'rank', span: 3 },
  { key: 'matrix', span: 3 },
  { key: 'timeline', span: 3 },
  { key: 'rhythm', span: 3 },
]

const layoutKey = 'op_board_layout_' + (currentUser.masterAccount || currentUser.account || 'anon')

function loadLayout() {
  try {
    const raw = localStorage.getItem(layoutKey)
    if (!raw) return DEFAULT_LAYOUT.map((x) => ({ ...x }))
    const saved = JSON.parse(raw)
    const valid = saved.filter((s) => DEFAULT_LAYOUT.some((d) => d.key === s.key))
    const keys = valid.map((s) => s.key)
    const merged = valid.map((s) => ({ ...s, span: DEFAULT_LAYOUT.find((d) => d.key === s.key).span }))
    DEFAULT_LAYOUT.forEach((d) => { if (!keys.includes(d.key)) merged.push({ ...d }) })
    return merged
  } catch { return DEFAULT_LAYOUT.map((x) => ({ ...x })) }
}

const layout = ref(loadLayout())
const editing = ref(false)
const dragKey = ref('')
const overKey = ref('')

function saveLayout() {
  try { localStorage.setItem(layoutKey, JSON.stringify(layout.value)) } catch { }
}

const startEdit = () => { editing.value = true }
const finishEdit = () => {
  editing.value = false
  saveLayout()
  ElMessage.success({ message: '布局已保存', duration: 1200 })
}
const resetLayout = () => {
  layout.value = DEFAULT_LAYOUT.map((x) => ({ ...x }))
  saveLayout()
}

function onDragStart(t) { if (editing.value) dragKey.value = t.key }
function onDragOver(t) { if (editing.value && dragKey.value) overKey.value = t.key }
function onEndDrag() { dragKey.value = ''; overKey.value = '' }
function onDrop(target) {
  if (!editing.value || !dragKey.value || dragKey.value === target.key) return onEndDrag()
  const from = layout.value.findIndex((x) => x.key === dragKey.value)
  const to = layout.value.findIndex((x) => x.key === target.key)
  if (from >= 0 && to >= 0) {
    const list = [...layout.value]
    const [item] = list.splice(from, 1)
    list.splice(to, 0, item)
    layout.value = list
    saveLayout()
  }
  onEndDrag()
}

/* ---------------- 模式 ---------------- */
const mode = ref(localStorage.getItem('op_mode') || 'wb')
const setMode = async (m) => {
  mode.value = m
  try { localStorage.setItem('op_mode', m) } catch { }
  closeExpand()
  // 直接打开在「明细表」时不会触发工作台加载，切回来要补一次
  if (m === 'wb' && !Object.keys(statsMap).length) await reloadAll()
}

/* ---------------- 周期 ---------------- */
const filters = reactive({ org: '' })
const period = ref('month')
const customRange = ref([
  dayjs().subtract(7, 'day').format('YYYY-MM-DD'),
  dayjs().subtract(1, 'day').format('YYYY-MM-DD'),
])

const yesterday = () => dayjs().subtract(1, 'day')

const periodRange = computed(() => {
  const end = yesterday()
  if (period.value === 'month') {
    return [end.startOf('month').format('YYYY-MM-DD'), end.format('YYYY-MM-DD')]
  }
  if (period.value === '7d') {
    return [end.subtract(6, 'day').format('YYYY-MM-DD'), end.format('YYYY-MM-DD')]
  }
  if (period.value === 'lastweek') {
    const dow = (end.day() + 6) % 7
    const lastSunday = end.subtract(dow + 1, 'day')
    const lastMonday = lastSunday.subtract(6, 'day')
    return [lastMonday.format('YYYY-MM-DD'), lastSunday.format('YYYY-MM-DD')]
  }
  const r = customRange.value || []
  return r.length === 2 ? r : [end.startOf('month').format('YYYY-MM-DD'), end.format('YYYY-MM-DD')]
})

const rangeText = computed(() => {
  const [s, e] = periodRange.value
  return s === e ? s : `${s} ~ ${e}`
})

/* 按当前这批数据做相对分档，避免"固定阈值 + 车队整体偏低"导致全是一个颜色 */
function quantiles(arr, ps) {
  if (!arr.length) return []
  const a = [...arr].sort((x, y) => x - y)
  return ps.map((p) => a[Math.min(a.length - 1, Math.floor(a.length * p))])
}
function levelOf(v, th) {
  if (!th || !th.length) return 'lv1'
  if (v <= th[0]) return 'lv1'
  if (v <= th[1]) return 'lv2'
  if (v <= th[2]) return 'lv3'
  if (v <= th[3]) return 'lv4'
  return 'lv5'
}

function periodLength(s, e) {
  return Math.max(1, dayjs(e).diff(dayjs(s), 'day') + 1)
}

/* ---------------- 车辆 ---------------- */
const vehicles = ref([])
const orgOptions = computed(() => [...new Set(vehicles.value.map((v) => v.org).filter(Boolean))])
const filteredVehicles = computed(() =>
  filters.org ? vehicles.value.filter((v) => v.org === filters.org) : vehicles.value
)

async function loadVehicles() {
  try {
    if (!isCustomer) {
      const { data, error } = await supabase.from('vehicles')
        .select('plate, vin, org, fuel_type').order('updated_at', { ascending: false })
      if (error) throw error
      vehicles.value = (data || []).filter((v) => v.plate && v.vin)
        .map((v) => ({ plate: v.plate, vin: String(v.vin).trim(), org: v.org || '' }))
      return
    }

    if (!myCustomerId.value && myPhone) {
      const { data } = await supabase.from('customers').select('id').eq('phone', myPhone).maybeSingle()
      if (data) myCustomerId.value = data.id
    }
    if (isSubAccount && (!myOrgName.value || !myOrgLevel.value) && currentUser.orgId) {
      const { data } = await supabase.from('organizations').select('name, level').eq('id', currentUser.orgId).maybeSingle()
      if (data) {
        myOrgName.value = String(data.name || '').trim() || null
        myOrgLevel.value = Number(data.level) || 1
      }
    }
    if (!myCustomerId.value) { vehicles.value = []; return }

    let q = supabase.from('vehicles').select('plate, vin, org, fuel_type')
      .eq('customer_id', myCustomerId.value).order('updated_at', { ascending: false })
    if (!isRootOrgSubAccount.value && needOrgFilter.value && myOrgName.value) {
      q = q.eq('org', myOrgName.value)
    }
    const { data, error } = await q
    if (error) throw error
    vehicles.value = (data || []).filter((v) => v.plate && v.vin)
      .map((v) => ({ plate: v.plate, vin: String(v.vin).trim(), org: v.org || '' }))
  } catch (e) {
    console.error('[综合报表] 加载车辆失败', e)
    ElMessage.error('加载车辆失败：' + (e.message || e))
  }
}

/* ---------------- 缓存 ---------------- */
const rangeCache = reactive({})
const dayCache = reactive({})
const dailyMap = reactive({})        // `${vin}|${date}` -> 数据库行
const dbCover = ref({ start: '', end: '', rows: 0 })
const inflight = new Map()
const progress = reactive({ total: 0, done: 0 })
const loadingAll = ref(false)
const loading = reactive({ cal: false, matrix: false, quad: false, rank: false, timeline: false, issues: false, rhythm: false })
const statsMap = reactive({})
const dayCells = reactive({})

const parseTimeMs = (raw) => {
  if (!raw) return 0
  if (raw instanceof Date) return raw.getTime()
  const s = String(raw).trim()
  // ① 标准 ISO（带 T 或时区）：直接交给 Date
  if (s.includes('T') || /Z$|[+-]\d{2}:?\d{2}$/.test(s)) {
    const iso = new Date(s).getTime()
    if (!isNaN(iso)) return iso
  }
  // ② 东风原始格式 2026-10-16 06:34:06（按北京时间理解）
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) {
    const bj = new Date(s.replace(' ', 'T') + '+08:00').getTime()
    if (!isNaN(bj)) return bj
  }
  // ③ 兜底
  const ms = new Date(s.replace(/-/g, '/')).getTime()
  return isNaN(ms) ? 0 : ms
}

function toStat(d) {
  if (!d) return null
  const km = Number(d.tripMileage) / 1000
  const fuel = Number(d.sumTravelFuel) / 1000
  const runMin = Number(d.travelSumDuration)
  const sMs = parseTimeMs(d.startTime)
  const eMs = parseTimeMs(d.endTime)
  const spanMin = sMs && eMs && eMs > sMs ? (eMs - sMs) / 60000 : null
  return {
    km: isFinite(km) ? km : 0,
    fuel: isFinite(fuel) ? fuel : 0,
    rate: km > 0 && isFinite(fuel) ? (fuel / km) * 100 : null,
    runMin: isFinite(runMin) ? runMin : null,
    offMin: spanMin != null && isFinite(runMin) ? Math.max(0, spanMin - runMin) : null,
    spanMin,
    avgSpeed: isFinite(Number(d.travelAvgDuration)) ? Number(d.travelAvgDuration) * 3.6 : null,
    startTime: d.startTime || '',
    endTime: d.endTime || '',
  }
}

function ensureFetch(kind, key, vin, s, e) {
  if (inflight.has(key)) return inflight.get(key)
  const p = fetchTripOil(vin, s, e)
    .then((res) => {
      const stat = res.ok ? toStat(res.data) : null
      if (kind === 'range') rangeCache[key] = stat
      else dayCache[key] = stat
      progress.done++
      inflight.delete(key)
      return stat
    })
    .catch(() => {
      if (kind === 'range') rangeCache[key] = null
      else dayCache[key] = null
      progress.done++
      inflight.delete(key)
      return null
    })
  inflight.set(key, p)
  return p
}

function dbCovers(s, e) {
  const c = dbCover.value
  return c.rows > 0 && c.start && c.start <= s && c.end >= e
}

function rowsOf(vin, s, e) {
  const out = []
  for (let d = dayjs(s); d.format('YYYY-MM-DD') <= e; d = d.add(1, 'day')) {
    const row = dailyMap[`${vin}|${d.format('YYYY-MM-DD')}`]
    if (row) out.push(row)
  }
  return out
}

const getRange = (vin, s, e) => {
  const k = `r|${vin}|${s}|${e}`
  if (k in rangeCache) return Promise.resolve(rangeCache[k])
  if (dbCovers(s, e)) {
    const stat = aggregate(rowsOf(vin, s, e))
    rangeCache[k] = stat
    return Promise.resolve(stat)
  }
  return ensureFetch('range', k, vin, s, e)
}

const getDay = (vin, date) => {
  const k = `d|${vin}|${date}`
  if (k in dayCache) return Promise.resolve(dayCache[k])
  const row = dailyMap[`${vin}|${date}`]
  if (row) {
    const stat = rowToStat(row)
    dayCache[k] = stat
    return Promise.resolve(stat)
  }
  return ensureFetch('day', k, vin, date, date)
}

async function runPool(items, worker, concurrency = 8) {
  let i = 0
  const run = async () => {
    while (i < items.length) {
      const idx = i++
      await worker(items[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, run))
}

/* ---------------- 口径 ---------------- */
const tileRanges = reactive({})
const scopeOpen = ref(false)
const scopeKey = ref('')
const scopeKind = ref('range')
const scopeDraftRange = ref([])
const scopeDraftMonth = ref('')
const scopeDraftDate = ref('')

const SCOPE_KIND = {
  cal: 'month', timeline: 'date', quad: 'range', rank: 'range', matrix: 'range', rhythm: 'range', issues: 'range',
}

function rangeOf(key) {
  const own = tileRanges[key]
  if (own && own.start && own.end) return [own.start, own.end]
  return periodRange.value
}

function monthOfTile() {
  const own = tileRanges.cal
  if (own && own.month) return dayjs(own.month + '-01')
  return dayjs(periodRange.value[1]).startOf('month')
}

function dateOfTile() {
  const own = tileRanges.timeline
  if (own && own.date) return own.date
  return dayEnd.value || periodRange.value[1]
}

const scopeText = (key) => {
  const own = tileRanges[key]
  if (key === 'cal') return monthOfTile().format('YYYY-MM')
  if (key === 'timeline') return dateOfTile().slice(5)
  if (own && own.start) return own.start.slice(5) + '~' + own.end.slice(5)
  const [s, e] = periodRange.value
  return s === e ? s.slice(5) : `${s.slice(5)}~${e.slice(5)}`
}

const scopeTitle = (key) => (tileRanges[key] ? '已单独设置，点击可改回跟随全局' : '当前跟随全局筛选，点击可单独设置')

function openScope(key) {
  scopeKey.value = key
  scopeKind.value = SCOPE_KIND[key] || 'range'
  const own = tileRanges[key]
  if (scopeKind.value === 'month') scopeDraftMonth.value = own?.month || monthOfTile().format('YYYY-MM')
  else if (scopeKind.value === 'date') scopeDraftDate.value = own?.date || dateOfTile()
  else scopeDraftRange.value = own?.start ? [own.start, own.end] : [...periodRange.value]
  scopeOpen.value = true
}

async function applyScope() {
  const key = scopeKey.value
  if (scopeKind.value === 'month') {
    if (!scopeDraftMonth.value) return
    tileRanges[key] = { month: scopeDraftMonth.value }
    await loadCalendar()
  } else if (scopeKind.value === 'date') {
    if (!scopeDraftDate.value) return
    tileRanges[key] = { date: scopeDraftDate.value }
    await loadTimeline(scopeDraftDate.value)
  } else {
    const r = scopeDraftRange.value
    if (!r || r.length !== 2) return
    tileRanges[key] = { start: r[0], end: r[1] }
    await loadRangeTiles()
    if (key === 'matrix' || key === 'rhythm') await loadDayWindow()
  }
  scopeOpen.value = false
}

async function resetScope() {
  const key = scopeKey.value
  delete tileRanges[key]
  scopeOpen.value = false
  if (key === 'cal') await loadCalendar()
  else if (key === 'timeline') await loadTimeline()
  else {
    await loadRangeTiles()
    if (key === 'matrix' || key === 'rhythm') await loadDayWindow()
  }
}

/* ---------------- 加载 ---------------- */
async function loadRangeTiles() {
  const [s, e] = rangeOf('quad')
  const list = filteredVehicles.value
  loading.quad = loading.rank = loading.issues = true
  progress.total += list.filter((v) => !(`r|${v.vin}|${s}|${e}` in rangeCache)).length
  await runPool(list, async (v) => {
    statsMap[v.vin] = await getRange(v.vin, s, e)
  }, 8)
  loading.quad = loading.rank = loading.issues = false
}

const dayEnd = ref('')

/* 东风数据有 1 天左右延迟：探一下区间末尾，没数就往回退（最多 4 天） */
async function resolveDayEnd() {
  let end = dayjs(rangeOf('matrix')[1])
  const probe = filteredVehicles.value[0]
  if (!probe) return end.format('YYYY-MM-DD')
  for (let i = 0; i < 4; i++) {
    const d = end.format('YYYY-MM-DD')
    const st = await getDay(probe.vin, d)
    if (st && st.km > 0) return d
    end = end.subtract(1, 'day')
  }
  return end.format('YYYY-MM-DD')
}

const dayWindow = computed(() => {
  const end = dayjs(dayEnd.value || rangeOf('matrix')[1])
  return Array.from({ length: 7 }, (_, i) => end.subtract(6 - i, 'day').format('YYYY-MM-DD'))
})

const dayVehicles = computed(() => filteredVehicles.value.slice(0, DAY_LIMIT))

async function loadDayWindow() {
  if (!dayEnd.value) dayEnd.value = await resolveDayEnd()
  const days = dayWindow.value
  const list = dayVehicles.value
  loading.matrix = loading.rhythm = true
  const missing = list.reduce((n, v) => n + days.filter((d) => !(`d|${v.vin}|${d}` in dayCache)).length, 0)
  progress.total += missing
  await runPool(list, async (v) => {
    const row = (dayCells[v.vin] = dayCells[v.vin] || {})
    for (const d of days) if (!(d in row)) row[d] = await getDay(v.vin, d)
  }, 6)
  loading.matrix = loading.rhythm = false
}

/* ---------------- 日历 ---------------- */
const calPlate = ref('')
const calMetric = ref('km')
const calMonth = ref(dayjs().subtract(1, 'day').startOf('month'))
const calCells = reactive({})
const calPicked = ref('')

async function loadCalendar() {
  if (!calPlate.value && filteredVehicles.value.length) calPlate.value = filteredVehicles.value[0].plate
  const v = vehicles.value.find((x) => x.plate === calPlate.value)
  if (!v) return
  const m = monthOfTile()
  calMonth.value = m
  const days = m.daysInMonth()
  const list = Array.from({ length: days }, (_, i) => m.date(i + 1).format('YYYY-MM-DD'))
  loading.cal = true
  progress.total += list.filter((d) => !(`d|${v.vin}|${d}` in dayCache)).length
  await runPool(list, async (d) => { calCells[d] = await getDay(v.vin, d) }, 6)
  loading.cal = false
  if (!calPicked.value) {
    const withData = list.filter((d) => calCells[d] && calCells[d].km > 0)
    calPicked.value = withData[withData.length - 1] || list[0]
  }
}

function shiftMonth(n) {
  const m = calMonth.value.add(n, 'month')
  tileRanges.cal = { month: m.format('YYYY-MM') }
  calMonth.value = m
  loadCalendar()
}

const onPickDay = (d) => { calPicked.value = d }

/* ---------------- 剖面 ---------------- */
const tlDate = ref('')
const tlSort = ref('start')

async function loadTimeline(explicitDate) {
  const date = (typeof explicitDate === 'string' && explicitDate) || tlDate.value || dateOfTile()
  tlDate.value = date
  const list = dayVehicles.value
  loading.timeline = true
  progress.total += list.filter((v) => !(`d|${v.vin}|${date}` in dayCache)).length
  await runPool(list, async (v) => {
    const row = (dayCells[v.vin] = dayCells[v.vin] || {})
    if (!(date in row)) row[date] = await getDay(v.vin, date)
  }, 6)
  loading.timeline = false
}

/* ---------------- 读缓存 ---------------- */
async function loadDbStats() {
  const [ps, pe] = periodRange.value
  const cs = calMonth.value.startOf('month').format('YYYY-MM-DD')
  const ce = calMonth.value.endOf('month').format('YYYY-MM-DD')
  const start = ps < cs ? ps : cs
  const end = pe > ce ? pe : ce
  try {
    const rows = await fetchDailyStats({
      start,
      end,
      customerId: isCustomer ? myCustomerId.value : null,
      org: filters.org || null,
    })
    rows.forEach((r) => { dailyMap[`${r.vin}|${r.stat_date}`] = r })
    dbCover.value = { start, end, rows: rows.length }
  } catch (e) {
    console.warn('[综合报表] 读取缓存失败，走实时接口', e)
    dbCover.value = { start: '', end: '', rows: 0 }
  }
}

/* 手动同步（服务端批量拉东风 → 写库） */
const syncing = ref(false)
async function syncNow() {
  syncing.value = true
  try {
    const res = await triggerSync({ days: 2 })
    const msg = res?.written != null
      ? `同步完成：写入 ${res.written} 条，失败 ${res.failed || 0}`
      : '同步完成'
    ElMessage.success({ message: msg, duration: 2000 })
    await reloadAll()
  } catch (e) {
    const msg = String(e.message || e)
    if (msg.includes('还没部署') || msg.includes('不可达')) ElMessage.warning({ message: msg, duration: 3500 })
    else ElMessage.error('同步失败：' + msg)
  } finally {
    syncing.value = false
  }
}

async function onTimelineDateChange(v) {
  if (!v) return
  tileRanges.timeline = { date: v }
  loading.timeline = true
  await loadTimeline(v)
}

/* ---------------- 汇总加载 ---------------- */
async function reloadAll() {
  if (mode.value !== 'wb') return
  loadingAll.value = true
  Object.keys(loading).forEach((k) => { loading[k] = true })
  await loadDbStats()
  progress.total = 0
  progress.done = 0
  try {
    await Promise.all([loadRangeTiles(), loadCalendar(), loadDayWindow()])
    await loadTimeline()
  } finally {
    loadingAll.value = false
  }
}

watch(period, () => { reloadAll() })
watch(() => filters.org, () => { reloadAll() })

/* ---------------- payload ---------------- */
const calDays = computed(() => {
  const m = calMonth.value
  const days = m.daysInMonth()
  const today = dayjs().format('YYYY-MM-DD')
  const monthRates = []
  for (let d = 1; d <= days; d++) {
    const st = calCells[m.date(d).format('YYYY-MM-DD')]
    if (st && st.rate) monthRates.push(st.rate)
  }
  const rateTh = quantiles(monthRates, [0.2, 0.4, 0.6, 0.8])
  const out = []
  for (let d = 1; d <= days; d++) {
    const date = m.date(d).format('YYYY-MM-DD')
    const st = calCells[date]
    const future = date > today
    const has = !!st && (st.km > 0 || st.fuel > 0)
    const main = !has ? 0 : calMetric.value === 'km' ? st.km : calMetric.value === 'fuel' ? st.fuel : st.rate || 0
    const level = !has ? '' : st.rate == null ? 'lv1' : levelOf(st.rate, rateTh)
    const stStart = st && st.startTime ? fmtHour(hourOf(st.startTime)) : ''
    const stEnd = st && st.endTime ? fmtHour(hourOf(st.endTime)) : ''
    out.push({
      day: d,
      date,
      rateNum: st && st.rate ? st.rate.toFixed(0) : '--',
      restText: stStart && stEnd ? `运行 ${stStart} — ${stEnd}` : '',
      has,
      future,
      main: main.toFixed(main >= 100 ? 0 : 1),
      unit: calMetric.value === 'km' ? 'km' : 'kWh',
      rateText: has ? `${st.rate ? st.rate.toFixed(0) : '--'} kWh/100km` : '',
      level,
      today: date === today,
      picked: date === calPicked.value,
      tip: has ? `${date} · ${st.km.toFixed(1)} km · ${st.fuel.toFixed(0)} kWh` : date,
    })
  }
  return out
})

const calOffset = computed(() => (calMonth.value.startOf('month').day() + 6) % 7)

const orgColor = (org) => ORG_COLORS[Math.max(0, orgOptions.value.indexOf(org)) % ORG_COLORS.length]

const quadPayload = computed(() => {
  const [s, e] = rangeOf('quad')
  const len = periodLength(s, e)
  const list = filteredVehicles.value
    .map((v) => ({ v, st: statsMap[v.vin] }))
    .filter((x) => x.st && x.st.km > 0 && x.st.rate != null)

  const xs = list.map((x) => x.st.km / len)
  const ys = list.map((x) => x.st.rate)
  const maxX = Math.max(1, ...xs) * 1.08
  const minY = Math.max(0, Math.min(...ys) - 6)
  const maxY = Math.max(...ys) + 6
  const ml = 34, mr = 16, mt = 24, mb = 26
  const iw = 420 - ml - mr
  const ih = 260 - mt - mb
  const px = (v) => ml + (v / maxX) * iw
  const py = (v) => mt + ih - ((v - minY) / (maxY - minY || 1)) * ih
  const med = (arr) => {
    if (!arr.length) return 0
    const a = [...arr].sort((m, n) => m - n)
    return a[Math.floor(a.length / 2)]
  }
  const mx = med(xs)
  const my = med(ys)
  const cnt = { ll: 0, lh: 0, hl: 0, hh: 0 }
  list.forEach((x) => {
    const left = x.st.km / len <= mx
    const low = x.st.rate >= my   // y 轴越大越费电 → "低效"
    if (left && low) cnt.ll++
    else if (!left && low) cnt.lh++
    else if (left && !low) cnt.hl++
    else cnt.hh++
  })
  return {
    points: list.map((x) => ({
      plate: x.v.plate,
      org: x.v.org,
      x: +px(x.st.km / len).toFixed(1),
      y: +py(x.st.rate).toFixed(1),
      rate: x.st.rate.toFixed(1),
      xText: (x.st.km / len).toFixed(0) + ' km/天',
      color: orgColor(x.v.org),
    })),
    medianX: +px(mx).toFixed(1),
    medianY: +py(my).toFixed(1),
    xTicks: [0, maxX / 2, maxX].map((v) => ({ x: +px(v).toFixed(1), label: Math.round(v) })),
    yTicks: [minY, (minY + maxY) / 2, maxY].map((v) => ({ y: +py(v).toFixed(1), label: Math.round(v) })),
    xTitle: '日均里程 km',
    yTitle: '百公里电耗',
    counts: cnt,
    legend: orgOptions.value.map((o) => ({ name: o, color: orgColor(o) })),
  }
})

const rankMetric = ref('rate')
const rankPayload = computed(() => {
  const list = filteredVehicles.value
    .map((v) => ({ plate: v.plate, st: statsMap[v.vin] }))
    .filter((x) => x.st && (x.st.km > 0 || x.st.fuel > 0))
    .map((x) => ({
      plate: x.plate,
      value: rankMetric.value === 'rate' ? (x.st.rate || 0) : rankMetric.value === 'km' ? x.st.km : x.st.fuel,
    }))
  list.sort((a, b) => b.value - a.value)
  const top = list.slice(0, 10)
  const max = Math.max(...top.map((x) => x.value), 1)
  const min = Math.min(...top.map((x) => x.value), 0)
  const avg = list.length ? list.reduce((a, b) => a + b.value, 0) / list.length : 0
  const pos = (v) => {
    const n = 50 + ((v - min) / (max - min || 1)) * 50
    return isFinite(n) ? n : 100
  }
  const metricLabel = RANK_METRICS.find((m) => m.key === rankMetric.value)?.label || ''
  return {
    unit: rankMetric.value === 'rate' ? 'kWh/100km' : rankMetric.value === 'km' ? 'km' : 'kWh',
    label: metricLabel,
    avgValue: rankMetric.value === 'rate' ? avg.toFixed(1) : avg.toFixed(0),
    avgPos: +pos(avg).toFixed(1),
    rows: top.map((x) => ({
      plate: x.plate,
      value: rankMetric.value === 'rate' ? x.value.toFixed(1) : x.value.toFixed(0),
      width: +pos(x.value).toFixed(1),
      delta: null,
    })),
  }
})

const issueType = ref('all')
const issuesPayload = computed(() => {
  const [s, e] = rangeOf('issues')
  const len = periodLength(s, e)
  const list = filteredVehicles.value
    .map((v) => ({ v, st: statsMap[v.vin] }))
    .filter((x) => x.st)
  const rates = list.map((x) => x.st.rate).filter((r) => r != null).sort((a, b) => a - b)
  const p85 = rates.length ? rates[Math.floor(rates.length * 0.85)] : null
  const kms = list.map((x) => x.st.km).sort((a, b) => a - b)
  const medianKm = kms.length ? kms[Math.floor(kms.length / 2)] : 0

  const rows = []
  list.forEach(({ v, st }) => {
    if (p85 && st.rate && st.rate > p85) {
      rows.push({
        type: '电耗超标', tone: '', level: 'h', plate: v.plate, org: v.org,
        desc: `${st.rate.toFixed(1)} kWh/100km，高于车队 P85（${p85.toFixed(0)}）`,
      })
    }
    if (medianKm > 0 && st.km < medianKm * 0.35) {
      rows.push({
        type: '里程偏低', tone: 't2', level: 'm', plate: v.plate, org: v.org,
        desc: `区间仅 ${st.km.toFixed(0)} km，不到车队中位数（${medianKm.toFixed(0)}）的 35%`,
      })
    }
    const minutes = len * 1440
    if (st.runMin != null && st.km > 0 && st.runMin / minutes < 0.18) {
      rows.push({
        type: '运行不足', tone: 't2', level: 'm', plate: v.plate, org: v.org,
        desc: `运行 ${(st.runMin / 60).toFixed(0)}h，仅占区间时长 ${((st.runMin / minutes) * 100).toFixed(0)}%`,
      })
    }
  })

  const keyMap = { rate: '电耗超标', km: '里程偏低', run: '运行不足' }
  const filtered = issueType.value === 'all' ? rows : rows.filter((r) => r.type === keyMap[issueType.value])
  const order = { h: 0, m: 1 }
  filtered.sort((a, b) => order[a.level] - order[b.level])
  return { rows: filtered.slice(0, 40) }
})

const matrixPayload = computed(() => {
  const days = dayWindow.value
  const groups = {}
  // 先收齐所有里程，按分位分 5 档（这批车跑多少，就按这批车的分布上色）
  const allKm = []
  dayVehicles.value.forEach((v) => {
    const row = dayCells[v.vin] || {}
    days.forEach((d) => { const st = row[d]; if (st && st.km > 0) allKm.push(st.km) })
  })
  const kmTh = quantiles(allKm, [0.2, 0.4, 0.6, 0.8])

  dayVehicles.value.forEach((v) => {
    const g = (groups[v.org || '未分组'] = groups[v.org || '未分组'] || { org: v.org || '未分组', rows: [], rates: [] })
    const row = dayCells[v.vin] || {}
    let total = 0
    const cells = days.map((d) => {
      const st = row[d]
      if (!st || st.km <= 0) return null
      total += st.km
      if (st.rate) g.rates.push(st.rate)
      return { km: st.km.toFixed(0), rate: st.rate ? st.rate.toFixed(0) : '--', level: levelOf(st.km, kmTh) }
    })
    g.rows.push({ plate: v.plate, cells, total: total.toFixed(0) })
  })
  return {
    days,
    // 区间内完全没数据的车不占行（否则半屏都是空白，容易以为图坏了）
    groups: Object.values(groups)
      .map((g) => ({
        org: g.org,
        avgRate: g.rates.length ? (g.rates.reduce((a, b) => a + b, 0) / g.rates.length).toFixed(0) : '--',
        rows: g.rows.filter((r) => Number(r.total) > 0).sort((a, b) => Number(b.total) - Number(a.total)),
      }))
      .filter((g) => g.rows.length),
  }
})

const timelinePayload = computed(() => {
  const date = dateOfTile()
  let rows = dayVehicles.value.map((v) => {
    const st = (dayCells[v.vin] || {})[date]
    const has = !!st && st.km > 0 && st.startTime && st.endTime
    if (!has) return { plate: v.plate, has: false, km: '--' }
    const sh = hourOf(st.startTime)
    const eh = Math.min(23.99, hourOf(st.endTime))
    const runH = (st.runMin || 0) / 60
    const runEnd = Math.min(eh, sh + runH)
    return {
      plate: v.plate,
      has: true,
      km: st.km.toFixed(0),
      day: date,
      offText: `${(((st.offMin || 0) / 60)).toFixed(1)} 小时`,
      startText: fmtHour(sh),
      endText: fmtHour(eh),
      runLeft: +((sh / 24) * 100).toFixed(2),
      runWidth: +((Math.max(0.2, runEnd - sh) / 24) * 100).toFixed(2),
      offLeft: +((runEnd / 24) * 100).toFixed(2),
      offWidth: +((Math.max(0, eh - runEnd) / 24) * 100).toFixed(2),
      warn: (st.offMin || 0) > 300,
      startH: sh,
      offH: (st.offMin || 0) / 60,
    }
  }).filter((r) => r.has)
  rows.sort((a, b) => {
    if (tlSort.value === 'km') return parseFloat(b.km) - parseFloat(a.km)
    if (tlSort.value === 'off') return (b.offH || 0) - (a.offH || 0)
    return (a.startH || 0) - (b.startH || 0)
  })
  return { rows: rows.slice(0, 40) }
})

function fmtHour(h) {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function hourOf(t) {
  const ms = parseTimeMs(t)
  if (!ms) return 0
  const d = new Date(ms)
  return d.getHours() + d.getMinutes() / 60
}

const rhythmPayload = computed(() => {
  const days = dayWindow.value
  const WD = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  const counts = WD.map(() => new Array(24).fill(0))
  const dateCount = new Array(7).fill(0)
  days.forEach((d) => { dateCount[(dayjs(d).day() + 6) % 7]++ })

  dayVehicles.value.forEach((v) => {
    const row = dayCells[v.vin] || {}
    days.forEach((d) => {
      const st = row[d]
      if (!st || st.km <= 0 || !st.startTime || !st.endTime) return
      const wd = (dayjs(d).day() + 6) % 7
      const from = Math.floor(hourOf(st.startTime))
      const to = Math.min(23, Math.floor(hourOf(st.endTime)))
      for (let h = from; h <= to; h++) counts[wd][h]++
    })
  })

  const avg = counts.map((row, w) => row.map((c) => (dateCount[w] ? c / dateCount[w] : 0)))
  const max = Math.max(1, ...avg.flat())
  const color = (v) => {
    const t = Math.pow(Math.min(1, v / max), 0.78)
    return `rgb(${Math.round(255 - 55 * t)},${Math.round(245 - 229 * t)},${Math.round(245 - 199 * t)})`
  }
  return {
    rhythm: WD.map((label, w) => ({
      label,
      cells: avg[w].map((c) => ({ count: Math.round(c), color: color(c) })),
    })),
  }
})

const payload = (key) => {
  if (key === 'cal') return { offset: calOffset.value, days: calDays.value }
  if (key === 'quad') return quadPayload.value
  if (key === 'rank') return rankPayload.value
  if (key === 'issues') return issuesPayload.value
  if (key === 'matrix') return matrixPayload.value
  if (key === 'timeline') return timelinePayload.value
  if (key === 'rhythm') return rhythmPayload.value
  return {}
}

/* ---------------- 展开 ---------------- */
const expanded = ref('')
const expand = (k) => { expanded.value = k }
const closeExpand = () => { expanded.value = '' }
const onEsc = (e) => { if (e.key === 'Escape' && expanded.value) closeExpand() }

onMounted(async () => {
  document.addEventListener('keydown', onEsc)
  try { await ensureAnonymousLogin() } catch { }
  await loadVehicles()
  if (!calPlate.value && filteredVehicles.value.length) calPlate.value = filteredVehicles.value[0].plate
  if (mode.value === 'wb') await reloadAll()
})

onBeforeUnmount(() => document.removeEventListener('keydown', onEsc))
</script>

<style scoped>
.op-page {
  position: relative;
  height: calc(100vh - 101px);
  max-height: calc(100vh - 101px);
  padding: 6px 16px 12px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #f8fafc;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC',
    'HarmonyOS Sans SC', 'Microsoft YaHei', Arial, sans-serif;
}

/* ---------- 顶栏 ---------- */
.top-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fff;
  border: 1px solid #edf1f6;
  border-radius: 11px;
  padding: 7px 11px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.modes {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: #f1f5f9;
  margin-right: 2px;
}

.modes button {
  border: 0;
  background: transparent;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  padding: 5px 13px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.modes button:hover { color: #c8102e; }

.modes button.active {
  background: #fff;
  color: #c8102e;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.1);
}

.range-tip {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 600;
  padding-left: 4px;
}

.cache-tip {
  font-style: normal;
  font-size: 11px;
  color: #0f9d58;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 9px;
  padding: 1px 7px;
  margin-left: 6px;
}

.bar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress {
  font-size: 11.5px;
  color: #c8102e;
  font-weight: 700;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 10px;
  padding: 2px 9px;
}

:deep(.btn-outline) {
  border-color: #e2e8f0;
  color: #475569;
  background: #fff;
}
:deep(.btn-outline:hover) {
  border-color: #c8102e;
  color: #c8102e;
  background: #fef2f2;
}
:deep(.btn-primary) {
  background: #c8102e;
  border-color: #c8102e;
}
:deep(.btn-primary:hover) {
  background: #a00d24;
  border-color: #a00d24;
}

/* ---------- 工作台 ---------- */
.board-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
}

.board {
  height: 100%;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  grid-template-rows: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: 8px;
}

.tile {
  background: #fff;
  border: 1px solid #edf1f6;
  border-radius: 11px;
  padding: 8px 10px;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: box-shadow 0.18s, transform 0.18s, border-color 0.18s;
}

.tile:hover {
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.07);
}

.board.editing .tile {
  border-style: dashed;
  border-color: #fca5a5;
  background: #fffdfd;
  cursor: grab;
}

.tile.dragging { opacity: 0.45; }

.tile.over {
  border-color: #c8102e !important;
  box-shadow: 0 0 0 2px rgba(200, 16, 46, 0.15);
}

.tile-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  flex-shrink: 0;
}

.grab {
  color: #cbd5e1;
  font-size: 12px;
  letter-spacing: -1px;
  cursor: grab;
}

.t-title {
  font-size: 12.5px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: 0.2px;
  white-space: nowrap;
}

.scope {
  border: 1px solid #e8edf4;
  background: #f8fafc;
  color: #94a3b8;
  font-family: inherit;
  font-size: 10px;
  font-weight: 700;
  border-radius: 5px;
  padding: 1px 6px;
  cursor: pointer;
  transition: all 0.18s;
  white-space: nowrap;
}

.scope:hover { color: #c8102e; border-color: #fecaca; }

.scope.custom {
  color: #c8102e;
  background: #fef2f2;
  border-color: #fecaca;
}

.scope.custom::before {
  content: '●';
  font-size: 7px;
  margin-right: 3px;
  vertical-align: 1px;
}

.flex1 { flex: 1; }

.expand {
  border: 0;
  background: transparent;
  color: #c8102e;
  font-family: inherit;
  font-size: 10.5px;
  font-weight: 700;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 5px;
  white-space: nowrap;
}

.expand:hover { background: #fef2f2; }

.tile-tip {
  flex-shrink: 0;
  font-size: 9px;
  line-height: 1.4;
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 5px;
  padding: 1px 6px;
  margin-bottom: 5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.exp-tip {
  flex-shrink: 0;
  font-size: 13px;
  line-height: 1.5;
  color: #92400e;
  background: #fffbeb;
  border-left: 3px solid #f59e0b;
  border-radius: 0 6px 6px 0;
  padding: 5px 10px;
  margin: 6px 10px 0;
}

.tile-body {
  flex: 1;
  min-height: 0;
  position: relative;
}

.tile-body::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 16px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0), #fff 80%);
  pointer-events: none;
}

/* ---------- 展开层 ---------- */
.expander {
  position: absolute;
  inset: 0;
  background: #f8fafc;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  z-index: 20;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.16);
}

.exp-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: #fff;
  border: 1px solid #edf1f6;
  border-radius: 11px 11px 0 0;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.back {
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #475569;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  padding: 7px 14px;
  border-radius: 8px;
  cursor: pointer;
}

.back:hover { border-color: #c8102e; color: #c8102e; background: #fef2f2; }

.exp-title {
  font-size: 16px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: 0.3px;
}

.exp-scope {
  font-size: 12.5px;
  color: #94a3b8;
  font-weight: 700;
  background: #f8fafc;
  border: 1px solid #e8edf4;
  border-radius: 6px;
  padding: 3px 9px;
}

.close-x {
  border: 0;
  background: transparent;
  color: #94a3b8;
  font-size: 18px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
}

.close-x:hover { background: #f1f5f9; color: #c8102e; }

.month-nav {
  display: inline-flex;
  align-items: center;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  height: 34px;
}

.month-nav button {
  border: 0;
  background: #fff;
  width: 30px;
  height: 34px;
  cursor: pointer;
  color: #64748b;
  font-size: 15px;
}

.month-nav button:hover { background: #fef2f2; color: #c8102e; }

.month-nav span {
  font-size: 13.5px;
  font-weight: 700;
  color: #0f172a;
  padding: 0 10px;
}

.chips {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 7px;
  background: #f1f5f9;
}

.chips button {
  border: 0;
  background: transparent;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 700;
  color: #64748b;
  padding: 6px 13px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
}

.chips button.active {
  background: #fff;
  color: #c8102e;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.1);
}

.exp-body {
  flex: 1;
  min-height: 0;
  background: #fff;
  border: 1px solid #edf1f6;
  border-top: 0;
  border-radius: 0 0 11px 11px;
  padding: 14px 16px;
}

.exp-enter-active, .exp-leave-active { transition: opacity 0.18s, transform 0.22s cubic-bezier(0.34, 1.2, 0.64, 1); }
.exp-enter-from, .exp-leave-to { opacity: 0; transform: translateY(8px) scale(0.99); }

.scope-form { display: flex; flex-direction: column; gap: 10px; }
.scope-hint { margin: 0; font-size: 12px; color: #64748b; }
.scope-hint b { color: #0f172a; }
</style>
