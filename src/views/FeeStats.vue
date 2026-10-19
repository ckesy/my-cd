<template>
  <div class="fee-stats-page">
    <!-- ===== 筛选 ===== -->
    <div class="fs-filter fade-up">
      <div class="fs-filter-top">
        <div class="fs-title">
          <span class="fs-bar"></span>
          <h2>费用统计</h2>
          <span class="fs-sub">按客户 / 司机 / 类型 / 月份汇总，金额只算钱款类上报</span>
        </div>
        <div class="fs-actions">
          <el-button class="btn-outline" @click="handleExport">
            <el-icon><Download /></el-icon> 导出当前口径
          </el-button>
          <el-button type="primary" class="btn-primary" :loading="loading" @click="refreshAll">
            <el-icon><Refresh /></el-icon> 刷新
          </el-button>
        </div>
      </div>

      <div class="fs-search">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          unlink-panels
          :shortcuts="DATE_SHORTCUTS"
          style="width: 250px"
        />
        <el-select v-model="typeFilter" placeholder="费用类型" clearable style="width: 130px">
          <el-option v-for="t in TYPE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
        </el-select>
        <el-select v-model="statusFilter" placeholder="状态" clearable style="width: 120px">
          <el-option v-for="s in STATUS_OPTIONS" :key="s" :label="s" :value="s" />
        </el-select>
        <el-button type="primary" class="btn-primary" @click="handleSearch">
          <el-icon><Search /></el-icon> 搜索
        </el-button>
        <el-button class="btn-outline" @click="handleReset">重置</el-button>
        <span class="fs-count">
          共 {{ rawList.length }} 条上报<text v-if="truncated" class="fs-trunc"> · 已截断，请收窄日期</text>
        </span>
      </div>
    </div>

    <!-- ===== KPI ===== -->
    <div class="fs-cards">
      <div v-for="c in cards" :key="c.k" class="fs-card" :class="c.cls">
        <span class="fc-k">{{ c.k }}</span>
        <b class="fc-v">{{ c.v }}</b>
        <em class="fc-s">{{ c.s }}</em>
      </div>
    </div>

    <!-- ===== 图表 ===== -->
    <div class="fs-charts">
      <div class="fs-chart-card">
        <div class="fs-chart-head">
          <b>月度趋势</b>
          <span>柱 = 金额，线 = 笔数</span>
        </div>
        <div v-show="hasData" ref="trendRef" class="fs-chart"></div>
        <div v-if="!hasData" class="fs-chart-empty">这段时间没有数据</div>
      </div>

      <div class="fs-chart-card">
        <div class="fs-chart-head">
          <b>类型分布</b>
          <span>按金额（钱款类）</span>
        </div>
        <div v-show="hasData" ref="typeRef" class="fs-chart"></div>
        <div v-if="!hasData" class="fs-chart-empty">这段时间没有数据</div>
      </div>
    </div>

    <!-- ===== 汇总表 ===== -->
    <Teleport to="body" :disabled="!fullscreen">
      <div class="fs-table-wrap" :class="{ 'is-fullscreen': fullscreen }">
        <div class="fs-table-card">
          <div class="fs-toolbar">
            <div class="fs-tabs">
              <button
                v-for="t in TABS"
                :key="t.value"
                class="fs-tab"
                :class="{ on: tab === t.value }"
                @click="tab = t.value"
              >{{ t.label }}</button>
              <span class="fs-total">共 {{ tableRows.length }} 行</span>
            </div>

            <div class="fs-toolbar-right">
              <button class="icon-btn" title="刷新" @click="refreshAll">
                <el-icon><Refresh /></el-icon>
              </button>

              <el-dropdown trigger="click" popper-class="density-dropdown-red" @command="(v) => (tableSize = v)">
                <button class="icon-btn" title="表格密度">
                  <el-icon><Operation /></el-icon>
                </button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="large"><span class="density-item" :class="{ active: tableSize === 'large' }">宽松</span></el-dropdown-item>
                    <el-dropdown-item command="default"><span class="density-item" :class="{ active: tableSize === 'default' }">默认</span></el-dropdown-item>
                    <el-dropdown-item command="small"><span class="density-item" :class="{ active: tableSize === 'small' }">紧凑</span></el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>

              <el-popover
                v-model:visible="columnPopoverVisible"
                placement="bottom-end"
                :width="230"
                trigger="click"
                popper-class="column-setting-popper"
              >
                <template #reference>
                  <button class="icon-btn" :class="{ active: columnPopoverVisible }" title="列设置">
                    <el-icon><Setting /></el-icon>
                  </button>
                </template>
                <div class="column-setting">
                  <div class="column-setting-header">
                    <span class="col-title"><el-icon><Grid /></el-icon> 列展示</span>
                    <span class="col-reset" @click="resetColumns">重置</span>
                  </div>
                  <div v-for="col in COLUMN_DEFS" :key="col.key" class="column-item">
                    <el-checkbox v-model="colVisible[col.key]">{{ col.label }}</el-checkbox>
                  </div>
                </div>
              </el-popover>

              <button class="icon-btn" :title="fullscreen ? '退出全屏' : '全屏'" @click="fullscreen = !fullscreen">
                <el-icon><component :is="fullscreen ? Close : FullScreen" /></el-icon>
              </button>
            </div>
          </div>

          <el-table
            v-loading="loading"
            :data="tableRows"
            border
            stripe
            :size="tableSize"
            row-key="name"
            show-summary
            :summary-method="summaryMethod"
            class="custom-table"
            :max-height="fullscreen ? 'calc(100vh - 190px)' : 520"
          >
            <el-table-column v-if="colVisible.name" prop="name" :label="tabLabel" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="fs-name">{{ row.name }}</span>
              </template>
            </el-table-column>

            <el-table-column v-if="colVisible.count" prop="count" label="笔数" width="90" align="center">
              <template #default="{ row }">{{ row.count }}</template>
            </el-table-column>

            <el-table-column v-if="colVisible.amount" prop="amount" label="金额" min-width="130" align="right">
              <template #default="{ row }">
                <b class="fs-amount">¥{{ money(row.amount) }}</b>
              </template>
            </el-table-column>

            <el-table-column v-if="colVisible.ratio" prop="ratio" label="占比" min-width="160" align="center">
              <template #default="{ row }">
                <div class="fs-ratio">
                  <div class="fs-ratio-bar"><i :style="{ width: Math.min(100, row.ratio * 100) + '%' }"></i></div>
                  <span>{{ (row.ratio * 100).toFixed(1) }}%</span>
                </div>
              </template>
            </el-table-column>

            <el-table-column v-if="payoutOn && colVisible.pending" prop="pending" label="待付款" min-width="120" align="right">
              <template #default="{ row }">
                <span :class="{ 'fs-warn': row.pending > 0 }">¥{{ money(row.pending) }}</span>
              </template>
            </el-table-column>

            <el-table-column v-if="payoutOn && colVisible.paid" prop="paid" label="已付款" min-width="120" align="right">
              <template #default="{ row }">
                <span class="fs-ok">¥{{ money(row.paid) }}</span>
              </template>
            </el-table-column>

            <el-table-column v-if="colVisible.rejected" prop="rejected" label="被驳回" width="100" align="center">
              <template #default="{ row }">
                <span :class="{ 'fs-danger': row.rejected > 0 }">{{ row.rejected }}</span>
              </template>
            </el-table-column>

            <template #empty>
              <div class="fs-empty">
                <div class="fs-empty-ic"><el-icon><DataAnalysis /></el-icon></div>
                <p>这段时间没有上报记录</p>
                <span>换个日期范围，或清掉类型 / 状态筛选</span>
              </div>
            </template>
          </el-table>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Search, Refresh, Download, Setting, FullScreen, Close, Operation, Grid, DataAnalysis,
} from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import { supabase } from '@/utils/supabase'
import { MONEY_TYPES, currentFeeUser } from '@/utils/feeTodo'
import { moduleFlags, ensureModuleFlags } from '@/utils/modules'

const currentUser = currentFeeUser() || {}
const isAdmin = currentUser.role === 'admin'
const myAccount = currentUser.masterAccount || currentUser.account || ''
const payoutOn = computed(() => moduleFlags.payout === true)

const TYPE_LABEL = {
  expense: '费用上报', subsidy: '补贴申请', loan: '借款申请', violation: '违章上报',
  weigh: '磅单上报', receipt: '回单上报', overtime: '超时报备', cardfix: '补卡申请',
}
const TYPE_OPTIONS = Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))
const STATUS_OPTIONS = ['审核中', '已通过', '待打款', '已打款', '已驳回']
const TABS = [
  { value: 'customer', label: '按客户' },
  { value: 'driver', label: '按司机' },
  { value: 'type', label: '按类型' },
  { value: 'month', label: '按月' },
]
const DATE_SHORTCUTS = [
  { text: '本月', value: () => [dayjs().startOf('month').toDate(), new Date()] },
  { text: '上月', value: () => [dayjs().subtract(1, 'month').startOf('month').toDate(), dayjs().subtract(1, 'month').endOf('month').toDate()] },
  { text: '近三个月', value: () => [dayjs().subtract(2, 'month').startOf('month').toDate(), new Date()] },
]

const money = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const isMoneyType = (t) => MONEY_TYPES.includes(t)
const monthKey = (v) => (v ? dayjs(v).format('YYYY-MM') : '未排期')

/* ============================================================
   筛选与数据
   ============================================================ */
const dateRange = ref([dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')])
const typeFilter = ref('')
const statusFilter = ref('')
const rawList = ref([])
const waybillCustomer = ref({})
const loading = ref(false)

const tab = ref('customer')
const tableSize = ref('default')
const fullscreen = ref(false)
const columnPopoverVisible = ref(false)

const COLUMN_DEFS = [
  { key: 'name', label: '名称' },
  { key: 'count', label: '笔数' },
  { key: 'amount', label: '金额' },
  { key: 'ratio', label: '占比' },
  { key: 'pending', label: '待付款' },
  { key: 'paid', label: '已付款' },
  { key: 'rejected', label: '被驳回' },
]
const colVisible = reactive({ name: true, count: true, amount: true, ratio: true, pending: true, paid: true, rejected: true })
const resetColumns = () => COLUMN_DEFS.forEach((c) => { colVisible[c.key] = true })

const scope = (q) => (isAdmin ? q : q.eq('owner_account', myAccount))

const PAGE_SIZE = 1000
const MAX_ROWS = 20000
const truncated = ref(false)

/* 每次分页都要重建查询（PostgREST 的 builder 只能消费一次） */
const buildQuery = () => {
  let q = supabase
    .from('reports')
    .select('id,type,amount,status,reject_count,create_time,paid_at,payment,driver_name,plate,waybill_no,owner_account')
  q = scope(q)
  if (dateRange.value && dateRange.value.length === 2) {
    q = q.gte('create_time', dateRange.value[0]).lt('create_time', dateRange.value[1] + ' 23:59:59')
  }
  if (typeFilter.value) q = q.eq('type', typeFilter.value)
  if (statusFilter.value) q = q.eq('status', statusFilter.value)
  return q.order('create_time', { ascending: false })
}

async function fetchData() {
  loading.value = true
  try {
    const rows = []
    truncated.value = false

    /* 分页拉全量：一次 1000，最多 2 万（超出就提示收窄日期） */
    for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
      const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      const chunk = data || []
      rows.push(...chunk)
      if (chunk.length < PAGE_SIZE) break
      if (from + PAGE_SIZE >= MAX_ROWS) truncated.value = true
    }

    rawList.value = rows
    await loadCustomers()
    await nextTick()
    renderCharts().catch((e) => console.warn('[费用统计] 图表渲染失败', e))
  } catch (e) {
    console.error('[费用统计] 读取失败', e)
    ElMessage.error('读取上报失败：' + (e?.message || '未知错误'))
    rawList.value = []
  } finally {
    loading.value = false
  }
}

/* 按客户统计需要运单上的客户名：单独批量取（150 一批，避免 URL 过长） */
async function loadCustomers() {
  const nos = [...new Set(rawList.value.map((r) => r.waybill_no).filter(Boolean))]
  if (!nos.length) { waybillCustomer.value = {}; return }
  const map = {}
  for (let i = 0; i < nos.length; i += 150) {
    const chunk = nos.slice(i, i + 150)
    try {
      /* ⚠️ waybills 没有 customer 列，客户名在 customer_archive_name */
      const { data } = await supabase
        .from('waybills')
        .select('waybill_no,customer_archive_name')
        .in('waybill_no', chunk)
      ;(data || []).forEach((w) => { map[w.waybill_no] = w.customer_archive_name || '' })
    } catch (e) {
      console.warn('[费用统计] 读取客户失败（该批按未归属处理）', e)
    }
  }
  waybillCustomer.value = map
}

/* ============================================================
   汇总
   ============================================================ */
const summary = computed(() => {
  let amount = 0
  let pendingApprove = 0
  let approvedAmount = 0
  let pendingPay = 0
  let paid = 0
  let rejected = 0

  rawList.value.forEach((r) => {
    const moneyType = isMoneyType(r.type)
    const amt = num(r.amount)
    if (moneyType) amount += amt
    if (r.status === '审核中') pendingApprove += 1
    if (moneyType && ['已通过', '待打款', '已打款'].includes(r.status)) approvedAmount += amt
    if (moneyType && ['已通过', '待打款'].includes(r.status)) pendingPay += amt
    if (moneyType && r.status === '已打款') paid += amt
    if (num(r.reject_count) > 0) rejected += 1
  })

  const count = rawList.value.length
  return {
    count,
    amount,
    pendingApprove,
    approvedAmount,
    pendingPay,
    paid,
    rejected,
    rejectRate: count ? rejected / count : 0,
  }
})

const cards = computed(() => {
  const s = summary.value
  const list = [
    { k: '上报笔数', v: `${s.count}`, s: '含单据类', cls: '' },
    { k: '上报金额', v: `¥${money(s.amount)}`, s: '钱款类合计', cls: 'red' },
    { k: '审核中', v: `${s.pendingApprove}`, s: '等待审批', cls: 'amber' },
  ]
  if (payoutOn.value) {
    list.push({ k: '待付款', v: `¥${money(s.pendingPay)}`, s: '已通过未登记付款', cls: 'amber' })
    list.push({ k: '已付款', v: `¥${money(s.paid)}`, s: `驳回率 ${(s.rejectRate * 100).toFixed(1)}%`, cls: 'green' })
  } else {
    list.push({ k: '已通过', v: `¥${money(s.approvedAmount)}`, s: '审批通过（含已付）', cls: 'green' })
    list.push({ k: '驳回率', v: `${(s.rejectRate * 100).toFixed(1)}%`, s: `${s.rejected} 笔曾被驳回`, cls: 'gray' })
  }
  return list
})

const hasData = computed(() => rawList.value.length > 0)

/* ============================================================
   分组表
   ============================================================ */
const tabLabel = computed(() => ({ customer: '客户', driver: '司机', type: '费用类型', month: '月份' }[tab.value] || '名称'))

const groupRows = (mode) => {
  const map = new Map()
  rawList.value.forEach((r) => {
    let key
    if (mode === 'customer') key = waybillCustomer.value[r.waybill_no] || '未归属客户'
    else if (mode === 'driver') key = r.driver_name || r.plate || '未知司机'
    else if (mode === 'type') key = TYPE_LABEL[r.type] || '其他'
    else key = monthKey(r.create_time)

    const g = map.get(key) || { name: key, count: 0, amount: 0, pending: 0, paid: 0, rejected: 0 }
    g.count += 1
    if (isMoneyType(r.type)) {
      const amt = num(r.amount)
      g.amount += amt
      if (['已通过', '待打款'].includes(r.status)) g.pending += amt
      if (r.status === '已打款') g.paid += amt
    }
    if (num(r.reject_count) > 0) g.rejected += 1
    map.set(key, g)
  })

  const list = [...map.values()]
  if (mode === 'month') list.sort((a, b) => (a.name < b.name ? -1 : 1))
  else list.sort((a, b) => b.amount - a.amount || b.count - a.count)
  return list.map((r) => ({ ...r, ratio: summary.value.amount ? r.amount / summary.value.amount : 0 }))
}

const tableRows = computed(() => groupRows(tab.value))

const summaryMethod = ({ columns }) => {
  const list = tableRows.value
  const total = (key) => list.reduce((s, r) => s + num(r[key]), 0)
  return columns.map((col) => {
    const key = col.property
    if (key === 'name') return '合计'
    if (key === 'count') return total('count')
    if (key === 'amount') return `¥${money(total('amount'))}`
    if (key === 'pending') return `¥${money(total('pending'))}`
    if (key === 'paid') return `¥${money(total('paid'))}`
    if (key === 'rejected') return total('rejected')
    if (key === 'ratio') return '100%'
    return ''
  })
}

/* ============================================================
   图表
   ============================================================ */
const trendRef = ref(null)
const typeRef = ref(null)
let trendChart = null
let typeChart = null
let echartsLib = null

/* echarts 只在打开这页时按需加载，别拖慢 Dashboard 首屏 */
async function ensureEcharts() {
  if (!echartsLib) {
    const mod = await import('echarts')
    echartsLib = mod.default || mod
  }
  return echartsLib
}

async function renderCharts() {
  if (!hasData.value) return
  let echarts
  try {
    echarts = await ensureEcharts()
  } catch (e) {
    console.warn('[费用统计] 图表库加载失败', e)
    return
  }

  /* 月度趋势：柱=金额，线=笔数 */
  const months = new Map()
  rawList.value.forEach((r) => {
    const k = monthKey(r.create_time)
    const g = months.get(k) || { amount: 0, count: 0 }
    if (isMoneyType(r.type)) g.amount += num(r.amount)
    g.count += 1
    months.set(k, g)
  })
  const keys = [...months.keys()].sort()
  const amounts = keys.map((k) => Math.round(months.get(k).amount * 100) / 100)
  const counts = keys.map((k) => months.get(k).count)

  if (trendRef.value) {
    trendChart = trendChart || echarts.init(trendRef.value)
    trendChart.setOption({
      grid: { left: 52, right: 44, top: 24, bottom: 34 },
      tooltip: { trigger: 'axis' },
      legend: { show: false },
      xAxis: {
        type: 'category',
        data: keys,
        axisLine: { lineStyle: { color: '#E2E8F0' } },
        axisLabel: { color: '#94A3B8', fontSize: 11 },
      },
      yAxis: [
        {
          type: 'value',
          name: '金额',
          nameTextStyle: { color: '#94A3B8', fontSize: 10 },
          splitLine: { lineStyle: { color: '#F1F5F9' } },
          axisLabel: { color: '#94A3B8', fontSize: 11, formatter: (v) => (v >= 10000 ? `${v / 10000}万` : v) },
        },
        {
          type: 'value',
          name: '笔数',
          nameTextStyle: { color: '#94A3B8', fontSize: 10 },
          splitLine: { show: false },
          axisLabel: { color: '#94A3B8', fontSize: 11 },
        },
      ],
      series: [
        {
          name: '金额',
          type: 'bar',
          barMaxWidth: 28,
          data: amounts,
          itemStyle: { color: '#c8102e', borderRadius: [4, 4, 0, 0] },
        },
        {
          name: '笔数',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          symbolSize: 6,
          data: counts,
          lineStyle: { color: '#378ADD', width: 2 },
          itemStyle: { color: '#378ADD' },
        },
      ],
    }, true)
  }

  /* 类型分布：按金额（钱款类） */
  const byType = new Map()
  rawList.value.forEach((r) => {
    if (!isMoneyType(r.type)) return
    const k = TYPE_LABEL[r.type] || '其他'
    byType.set(k, (byType.get(k) || 0) + num(r.amount))
  })
  const pieData = [...byType.entries()]
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .filter((x) => x.value > 0)

  if (typeRef.value) {
    typeChart = typeChart || echarts.init(typeRef.value)
    typeChart.setOption({
      tooltip: { trigger: 'item', formatter: (p) => `${p.name}<br/>¥${money(p.value)}（${p.percent}%）` },
      legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { color: '#64748B', fontSize: 11 } },
      color: ['#c8102e', '#378ADD', '#BA7517', '#639922', '#7F77DD'],
      series: [
        {
          type: 'pie',
          radius: ['46%', '68%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          data: pieData.length
            ? pieData
            : [{ name: '暂无金额类上报', value: 1, itemStyle: { color: '#E2E8F0' } }],
        },
      ],
    }, true)
  }
}

const onResize = () => {
  trendChart && trendChart.resize()
  typeChart && typeChart.resize()
}

/* ============================================================
   操作
   ============================================================ */
const handleSearch = () => fetchData()
const handleReset = () => {
  dateRange.value = [dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')]
  typeFilter.value = ''
  statusFilter.value = ''
  fetchData()
}
const refreshAll = () => fetchData()

const handleExport = () => {
  if (!tableRows.value.length) { ElMessage.warning('当前口径没有数据可导出'); return }
  const rows = tableRows.value.map((r) => ({
    [tabLabel.value]: r.name,
    '笔数': r.count,
    '金额': r.amount,
    '占比': `${(r.ratio * 100).toFixed(1)}%`,
    ...(payoutOn.value ? { '待付款': r.pending, '已付款': r.paid } : {}),
    '被驳回': r.rejected,
  }))
  rows.push({
    [tabLabel.value]: '合计',
    '笔数': tableRows.value.reduce((s, r) => s + r.count, 0),
    '金额': tableRows.value.reduce((s, r) => s + r.amount, 0),
    '占比': '100%',
    ...(payoutOn.value
      ? {
          '待付款': tableRows.value.reduce((s, r) => s + r.pending, 0),
          '已付款': tableRows.value.reduce((s, r) => s + r.paid, 0),
        }
      : {}),
    '被驳回': tableRows.value.reduce((s, r) => s + r.rejected, 0),
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '费用统计')
  const range = dateRange.value && dateRange.value.length === 2 ? `${dateRange.value[0]}_${dateRange.value[1]}` : '全部'
  XLSX.writeFile(wb, `费用统计_${tabLabel.value}_${range}.xlsx`)
  ElMessage.success(`已导出 ${tableRows.value.length} 行`)
}

onMounted(async () => {
  await ensureModuleFlags(currentUser)
  await fetchData()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  trendChart && trendChart.dispose()
  typeChart && typeChart.dispose()
  trendChart = null
  typeChart = null
})
</script>

<style scoped>
.fee-stats-page {
  --num-font: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue',
    'PingFang SC', 'HarmonyOS Sans SC', 'Source Han Sans SC', 'Microsoft YaHei', Arial, sans-serif;
  min-height: 100%;
  padding: 8px 16px 26px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #F8FAFC;
  font-size: 13px;
}

/* ===== 筛选 ===== */
.fs-filter {
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
}

.fs-filter-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.fs-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fs-bar {
  width: 4px;
  height: 18px;
  border-radius: 2px;
  background: linear-gradient(180deg, #c8102e, #a00d24);
  box-shadow: 0 0 8px rgba(200, 16, 46, 0.35);
}

.fs-title h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: 0.2px;
}

.fs-sub {
  font-size: 11.5px;
  color: #94A3B8;
  padding-left: 8px;
  border-left: 1px solid #E2E8F0;
}

.fs-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.fs-search {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.fs-count {
  margin-left: auto;
  font-size: 12px;
  color: #94A3B8;
}

.fs-trunc {
  color: #B45309;
}

/* ===== KPI ===== */
.fs-cards {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
}

.fs-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  border-top: 3px solid #E2E8F0;
  min-width: 0;
}

.fs-card.red { border-top-color: #c8102e; }
.fs-card.amber { border-top-color: #D97706; }
.fs-card.green { border-top-color: #16A34A; }
.fs-card.gray { border-top-color: #94A3B8; }

.fc-k {
  display: block;
  font-size: 11.5px;
  color: #94A3B8;
  margin-bottom: 6px;
}

.fc-v {
  display: block;
  font-family: var(--num-font);
  font-size: 22px;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: -0.4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fs-card.red .fc-v { color: #c8102e; }
.fs-card.amber .fc-v { color: #B45309; }
.fs-card.green .fc-v { color: #15803D; }
.fs-card.gray .fc-v { color: #475569; }

.fc-s {
  display: block;
  margin-top: 4px;
  font-style: normal;
  font-size: 11px;
  color: #94A3B8;
}

/* ===== 图表 ===== */
.fs-charts {
  display: grid;
  grid-template-columns: 1.55fr 1fr;
  gap: 12px;
}

.fs-chart-card {
  background: #fff;
  border-radius: 12px;
  padding: 12px 14px 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  min-width: 0;
}

.fs-chart-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}

.fs-chart-head b {
  font-size: 13px;
  color: #0F172A;
}

.fs-chart-head span {
  font-size: 11px;
  color: #94A3B8;
}

.fs-chart {
  height: 210px;
}

.fs-chart-empty {
  height: 210px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12.5px;
  color: #94A3B8;
}

/* ===== 表格 ===== */
.fs-table-wrap {
  display: flex;
  flex-direction: column;
}

.fs-table-wrap.is-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 9999;
  padding: 24px;
  background: rgba(248, 250, 252, 0.88);
  backdrop-filter: blur(20px) saturate(180%);
}

.fs-table-card {
  background: #fff;
  border-radius: 12px;
  padding: 12px 16px 14px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
}

.fs-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 10px;
  border-bottom: 1px solid #F1F5F9;
  margin-bottom: 10px;
}

.fs-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.fs-tab {
  padding: 5px 13px;
  border-radius: 16px;
  border: 1px solid transparent;
  background: #F1F5F9;
  color: #475569;
  font-size: 12.5px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.22s;
}

.fs-tab:hover { background: #FEF2F2; color: #c8102e; }

.fs-tab.on {
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #fff;
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.3);
}

.fs-total {
  font-size: 12px;
  color: #94A3B8;
  padding-left: 8px;
  border-left: 1px solid #E2E8F0;
}

.fs-toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

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
  padding: 0;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.icon-btn:hover {
  border-color: #c8102e;
  color: #c8102e;
  background: #FEF2F2;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.15);
}

.icon-btn.active {
  border-color: #c8102e;
  color: #fff;
  background: linear-gradient(135deg, #c8102e, #a00d24);
}

.column-setting-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px 10px;
  border-bottom: 1px solid #F1F5F9;
  margin-bottom: 8px;
}

.col-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 700;
  color: #0F172A;
}

.col-reset {
  font-size: 12px;
  color: #c8102e;
  cursor: pointer;
  font-weight: 600;
}

.column-item {
  display: flex;
  align-items: center;
  padding: 3px 2px;
}

.fs-name {
  font-size: 12.5px;
  font-weight: 600;
  color: #0F172A;
}

.fs-amount {
  font-family: var(--num-font);
  font-size: 13px;
  color: #c8102e;
}

.fs-ratio {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fs-ratio-bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: #F1F5F9;
  overflow: hidden;
  min-width: 60px;
}

.fs-ratio-bar i {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #F09595, #c8102e);
  transition: width 0.4s ease;
}

.fs-ratio span {
  flex: 0 0 auto;
  font-family: var(--num-font);
  font-size: 11.5px;
  color: #64748B;
  width: 42px;
  text-align: right;
}

.fs-warn { color: #B45309; font-family: var(--num-font); }
.fs-ok { color: #15803D; font-family: var(--num-font); }
.fs-danger { color: #B91C1C; font-weight: 600; }

.fs-empty {
  padding: 30px 0 16px;
  text-align: center;
}

.fs-empty-ic {
  font-size: 28px;
  color: #CBD5E1;
  margin-bottom: 6px;
}

.fs-empty p {
  margin: 0 0 4px;
  font-size: 13.5px;
  color: #64748B;
  font-weight: 600;
}

.fs-empty span {
  font-size: 12px;
  color: #94A3B8;
}

@media (max-width: 1200px) {
  .fs-cards { grid-template-columns: repeat(3, 1fr); }
  .fs-charts { grid-template-columns: 1fr; }
}
</style>
