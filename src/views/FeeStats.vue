<template>
  <div class="fs-page">
    <!-- ===== 筛选 ===== -->
    <div class="fs-filter fade-up">
      <div class="fs-title">
        <span class="fs-bar"></span>
        <h2>费用统计</h2>
        <span class="fs-sub">8 类费用 · 5 类钱款计入金额，3 类非钱款只计笔数</span>
      </div>
      <div class="fs-actions">
        <el-date-picker v-model="dateRange" type="daterange" range-separator="至"
          start-placeholder="开始" end-placeholder="结束" value-format="YYYY-MM-DD"
          unlink-panels :shortcuts="DATE_SHORTCUTS" style="width: 236px" />
        <el-button class="btn-outline" @click="handleExport">
          <el-icon><Download /></el-icon> 导出
        </el-button>
        <el-button type="primary" class="btn-primary" :loading="loading" @click="refreshAll">
          <el-icon><Refresh /></el-icon> 刷新
        </el-button>
      </div>
    </div>

    <!-- ===== KPI 条 ===== -->
    <div class="fs-kpis fade-up">
      <div class="kpi hero">
        <div class="kpi-k">{{ periodLabel }}费用合计</div>
        <div class="kpi-v num">¥{{ fmtMoney(kpi.total) }}</div>
        <div class="kpi-s">5 类钱款 · {{ kpi.moneyCount }} 笔</div>
      </div>
      <div v-if="auditOn" class="kpi">
        <div class="kpi-k">待审核</div>
        <div class="kpi-v num" style="color:#B45309">¥{{ fmtMoney(kpi.pending) }}</div>
        <div class="kpi-s">{{ kpi.pendingCount }} 笔</div>
      </div>
      <div v-if="payoutOn" class="kpi">
        <div class="kpi-k">待打款</div>
        <div class="kpi-v num" style="color:#1D4ED8">¥{{ fmtMoney(kpi.toPay) }}</div>
        <div class="kpi-s">{{ kpi.toPayCount }} 笔</div>
      </div>
      <div v-if="payoutOn" class="kpi">
        <div class="kpi-k">已打款</div>
        <div class="kpi-v num" style="color:#15803D">¥{{ fmtMoney(kpi.paid) }}</div>
        <div class="kpi-s">{{ kpi.paidRate }}% 已结清</div>
      </div>
    </div>

    <!-- ===== 类型矩阵 ===== -->
    <div class="fs-card fade-up">
      <el-table :data="typeRows" v-loading="loading" class="custom-table"
        element-loading-text="加载中…" :row-class-name="rowClass"
        show-summary :summary-method="summaryMethod">
        <el-table-column label="费用类型" min-width="118">
          <template #default="{ row }"><span class="t-name">{{ row.label }}</span></template>
        </el-table-column>

        <el-table-column label="笔数" width="74" align="right">
          <template #default="{ row }"><span class="num">{{ row.count }}</span></template>
        </el-table-column>

        <el-table-column label="金额" width="132" align="right">
          <template #default="{ row }">
            <span v-if="row.money" class="num t-amt">¥{{ fmtMoney(row.amount) }}</span>
            <span v-else class="num t-dash">—</span>
          </template>
        </el-table-column>

        <el-table-column v-if="auditOn" label="待审核" width="132" align="right">
          <template #default="{ row }">
            <span v-if="row.money && row.pending > 0" class="num t-wait">¥{{ fmtMoney(row.pending) }}</span>
            <span v-else class="num t-dash">—</span>
          </template>
        </el-table-column>

        <el-table-column v-if="payoutOn" label="待打款" width="132" align="right">
          <template #default="{ row }">
            <span v-if="row.money && row.toPay > 0" class="num t-pay">¥{{ fmtMoney(row.toPay) }}</span>
            <span v-else class="num t-dash">—</span>
          </template>
        </el-table-column>

        <el-table-column v-if="payoutOn" label="已打款" width="132" align="right">
          <template #default="{ row }">
            <span v-if="row.money && row.paid > 0" class="num t-done">¥{{ fmtMoney(row.paid) }}</span>
            <span v-else-if="row.money" class="num t-dash">—</span>
            <span v-else class="num t-dash">—</span>
          </template>
        </el-table-column>

        <el-table-column label="占比" width="80" align="right">
          <template #default="{ row }">
            <span v-if="row.money" class="num t-muted">{{ row.ratio }}%</span>
            <span v-else class="num t-dash">—</span>
          </template>
        </el-table-column>

        <el-table-column label="环比上月" width="104" align="right">
          <template #default="{ row }">
            <span v-if="row.mom === 'new'" class="mom new">新增</span>
            <span v-else-if="row.mom !== null && row.mom !== undefined" class="num mom" :class="row.mom >= 0 ? 'up' : 'down'">
              {{ row.mom > 0 ? '+' : '' }}{{ row.mom }}%
            </span>
            <span v-else class="num t-dash">—</span>
          </template>
        </el-table-column>

        <el-table-column label="备注" min-width="130">
          <template #default="{ row }"><span class="t-note">{{ row.note || '—' }}</span></template>
        </el-table-column>
      </el-table>

      <div class="fs-foot">
        <span>非钱款类（回单 / 超时 / 补卡）不计入金额，避免总额虚高</span>
        <span>· 环比对比的是「上月同期等长区间」，上月无数据时显示「新增」</span>
        <span v-if="!auditOn || !payoutOn">
          · 当前 <b>{{ auditOn ? '审批已开' : '审批未开' }}</b> / <b>{{ payoutOn ? '付款已开' : '付款未开' }}</b>，相关列已隐藏
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, Refresh } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import { supabase } from '@/utils/supabase'
import { MONEY_TYPES, currentFeeUser } from '@/utils/feeTodo'
import { moduleFlags, ensureModuleFlags, approvalOn } from '@/utils/modules'

/* ================= 用户与范围 ================= */
const currentUser = currentFeeUser() || {}
const isAdmin = currentUser.role === 'admin'
const myAccount = currentUser.masterAccount || currentUser.account || ''
const scope = (q) => (isAdmin ? q : q.eq('owner_account', myAccount))

const payoutOn = computed(() => moduleFlags.payout === true)
const auditOn = computed(() => approvalOn.value)

/* ================= 常量 ================= */
const TYPE_LABEL = {
  expense: '费用上报', subsidy: '补贴申请', loan: '借款申请', violation: '违章处理',
  weigh: '过磅单', receipt: '回单上报', overtime: '超时报备', cardfix: '补卡申请',
}
const ALL_TYPES = ['expense', 'subsidy', 'weigh', 'loan', 'violation', 'receipt', 'overtime', 'cardfix']
const isMoneyType = (t) => (MONEY_TYPES || []).includes(t)

const DATE_SHORTCUTS = [
  { text: '本月', value: () => [dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')] },
  { text: '上月', value: () => [dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD'), dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD')] },
  { text: '近 30 天', value: () => [dayjs().subtract(29, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')] },
  { text: '今年', value: () => [dayjs().startOf('year').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')] },
]

/* ================= 状态 ================= */
const loading = ref(false)
const dateRange = ref([dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')])
const raw = ref([])
const prevRaw = ref([])

const range = computed(() => {
  if (dateRange.value && dateRange.value.length === 2) return dateRange.value
  return [dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')]
})

const periodLabel = computed(() => {
  const [s, e] = range.value
  if (s === dayjs().startOf('month').format('YYYY-MM-DD') && e === dayjs().format('YYYY-MM-DD')) return '本月'
  return `${dayjs(s).format('M月D日')} 起`
})

/** 上月同期（与当前区间等长），用于环比 */
const prevRange = computed(() => {
  const [s, e] = range.value
  const days = dayjs(e).diff(dayjs(s), 'day') + 1
  return [dayjs(s).subtract(days, 'day').format('YYYY-MM-DD'), dayjs(s).subtract(1, 'day').format('YYYY-MM-DD')]
})

async function fetchRange(from, to) {
  let q = supabase
    .from('reports')
    .select('id,type,amount,status,create_time,waybill_no,driver_name,plate,payload')
    .gte('create_time', from)
    .lte('create_time', to + ' 23:59:59')
    .limit(5000)
  q = scope(q)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

async function load() {
  loading.value = true
  try {
    const [cur, prev] = await Promise.all([
      fetchRange(range.value[0], range.value[1]),
      fetchRange(prevRange.value[0], prevRange.value[1]),
    ])
    raw.value = cur
    prevRaw.value = prev
  } catch (e) {
    ElMessage.error(e.message || '加载失败')
    raw.value = []
    prevRaw.value = []
  } finally {
    loading.value = false
  }
}

/* ================= 聚合 ================= */
function aggregate(list) {
  const map = {}
  ALL_TYPES.forEach((t) => { map[t] = { count: 0, amount: 0, pending: 0, toPay: 0, paid: 0, items: [] } })
  list.forEach((r) => {
    const g = map[r.type]
    if (!g) return
    g.count += 1
    g.items.push(r)
    if (!isMoneyType(r.type)) return
    const amt = Number(r.amount) || 0
    g.amount += amt
    if (r.status === '审核中' || r.status === '待审核') g.pending += amt
    else if (r.status === '已通过' || r.status === '待打款') g.toPay += amt
    else if (r.status === '已打款') g.paid += amt
  })
  return map
}

const curAgg = computed(() => aggregate(raw.value))
const prevAgg = computed(() => aggregate(prevRaw.value))

const totalMoney = computed(() => Object.values(curAgg.value).reduce((s, g) => s + g.amount, 0))

const kpi = computed(() => {
  const a = curAgg.value
  const moneyKeys = Object.keys(a).filter(isMoneyType)
  const sum = (k) => Object.values(a).reduce((s, g) => s + g[k], 0)
  const total = totalMoney.value
  const paid = sum('paid')
  return {
    total,
    moneyCount: moneyKeys.reduce((s, k) => s + a[k].count, 0),
    pending: sum('pending'),
    pendingCount: moneyKeys.reduce((s, k) => s + a[k].items.filter((r) => r.status === '审核中' || r.status === '待审核').length, 0),
    toPay: sum('toPay'),
    toPayCount: moneyKeys.reduce((s, k) => s + a[k].items.filter((r) => r.status === '已通过' || r.status === '待打款').length, 0),
    paid,
    paidRate: total > 0 ? Math.round((paid / total) * 100) : 0,
  }
})

/** 备注：能用真实字段就拼，拿不到就留空 */
function noteOf(type, items) {
  if (!items || !items.length) return ''
  if (type === 'violation') {
    const points = items.reduce((s, r) => s + (Number(r.payload && r.payload.points) || 0), 0)
    const undone = items.filter((r) => !['已打款', '已通过'].includes(r.status)).length
    return [undone ? `${undone} 笔未处理` : '', points ? `扣 ${points} 分` : ''].filter(Boolean).join(' · ')
  }
  if (type === 'weigh') {
    const net = items.reduce((s, r) => {
      const p = r.payload || {}
      return s + Math.max(0, (Number(p.gross) || 0) - (Number(p.tare) || 0))
    }, 0)
    return net ? `净重 ${(net / 1000).toFixed(1)} 吨` : ''
  }
  if (type === 'loan') {
    const overdue = items.filter((r) => r.payload && r.payload.repay_date
      && dayjs(r.payload.repay_date).isBefore(dayjs()) && r.status !== '已打款').length
    return overdue ? `${overdue} 笔逾期未还` : ''
  }
  if (type === 'receipt') return `${items.length} 张`
  if (type === 'overtime') return `${items.length} 次报备`
  if (type === 'cardfix') return `${items.length} 张补卡`
  if (type === 'subsidy') {
    const kinds = new Set()
    items.forEach((r) => { const p = r.payload || {}; if (p.subsidy_type) kinds.add(p.subsidy_type) })
    return kinds.size ? [...kinds].slice(0, 2).join(' · ') : ''
  }
  if (type === 'expense') {
    const kinds = new Set()
    items.forEach((r) => { const p = r.payload || {}; if (p.kind) kinds.add(p.kind) })
    return kinds.size ? [...kinds].slice(0, 2).join(' · ') : ''
  }
  return ''
}

const typeRows = computed(() =>
  ALL_TYPES.map((t) => {
    const g = curAgg.value[t]
    const prev = prevAgg.value[t]
    const money = isMoneyType(t)
    return {
      type: t,
      label: TYPE_LABEL[t],
      money,
      count: g.count,
      amount: g.amount,
      pending: g.pending,
      toPay: g.toPay,
      paid: g.paid,
      ratio: money && totalMoney.value > 0 ? Math.round((g.amount / totalMoney.value) * 100) : 0,
      mom: !money ? null
        : prev.amount > 0 ? Math.round(((g.amount - prev.amount) / prev.amount) * 100)
          : (g.amount > 0 ? 'new' : null),
      note: noteOf(t, g.items),
    }
  })
)

function summaryMethod({ columns, data }) {
  return columns.map((col, i) => {
    if (i === 0) return '合计'
    const label = col.label
    if (label === '笔数') return data.reduce((s, r) => s + r.count, 0)
    if (label === '金额') return '¥' + fmtMoney(data.reduce((s, r) => s + r.amount, 0))
    if (label === '待审核') return '¥' + fmtMoney(data.reduce((s, r) => s + r.pending, 0))
    if (label === '待打款') return '¥' + fmtMoney(data.reduce((s, r) => s + r.toPay, 0))
    if (label === '已打款') return '¥' + fmtMoney(data.reduce((s, r) => s + r.paid, 0))
    if (label === '占比') return '100%'
    return ''
  })
}

const rowClass = ({ row }) => (row.money ? '' : 'row-soft')

/* ================= 工具 ================= */
const fmtMoney = (v) => (Number(v) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function refreshAll() { load() }

function handleExport() {
  const rows = typeRows.value.map((r) => ({
    费用类型: r.label,
    笔数: r.count,
    金额: r.money ? r.amount : '',
    待审核: r.money ? r.pending : '',
    待打款: r.money ? r.toPay : '',
    已打款: r.money ? r.paid : '',
    占比: r.money ? r.ratio + '%' : '',
    环比: r.mom === null ? '' : r.mom + '%',
    备注: r.note,
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '费用统计')
  XLSX.writeFile(wb, `费用统计_${range.value[0]}_${range.value[1]}.xlsx`)
}

onMounted(async () => {
  try { await ensureModuleFlags(currentUser, { force: true }) } catch (e) { /* 读不到不影响 */ }
  await load()
})
</script>

<style scoped>
.fs-page { display: flex; flex-direction: column; gap: 13px; padding: 18px 20px 24px; }

.fs-filter {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  background: #fff; border: 1px solid #E6ECF3; border-radius: 11px; padding: 13px 16px;
}
.fs-title { display: flex; align-items: center; gap: 9px; }
.fs-bar { width: 3px; height: 15px; border-radius: 2px; background: #C8102E; }
.fs-title h2 { margin: 0; font-size: 14px; font-weight: 800; color: #0F172A; }
.fs-sub { font-size: 11px; color: #94A3B8; }
.fs-actions { margin-left: auto; display: flex; align-items: center; gap: 9px; }

.fs-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.fs-kpis:has(> .kpi:nth-child(2):last-child) { grid-template-columns: repeat(2, 1fr); }
.fs-kpis:has(> .kpi:nth-child(3):last-child) { grid-template-columns: repeat(3, 1fr); }

.kpi { border: 1px solid #EDF1F6; border-radius: 11px; padding: 14px 16px; background: #fff; }
.kpi.hero { background: linear-gradient(135deg, #CE1230, #8E0A20); border-color: transparent; }
.kpi-k { font-size: 11px; color: #94A3B8; }
.kpi.hero .kpi-k { color: rgba(255, 255, 255, .72); }
.kpi-v { font-size: 22px; font-weight: 800; letter-spacing: -.6px; margin-top: 6px; color: #0F172A; }
.kpi.hero .kpi-v { color: #fff; }
.kpi-s { font-size: 10.5px; color: #B4BECB; margin-top: 4px; }
.kpi.hero .kpi-s { color: rgba(255, 255, 255, .6); }

.fs-card { background: #fff; border: 1px solid #E6ECF3; border-radius: 11px; overflow: hidden; }

.t-name { font-size: 12.5px; font-weight: 700; color: #0F172A; }
.t-amt { font-size: 13.5px; font-weight: 800; color: #0F172A; white-space: nowrap; }
.num { white-space: nowrap; }
.t-wait { color: #B45309; font-weight: 700; }
.t-pay { color: #1D4ED8; font-weight: 700; }
.t-done { color: #15803D; font-weight: 700; }
.t-muted { color: #64748B; }
.t-dash { color: #DCE3EC; }
.t-note { font-size: 11px; color: #94A3B8; }

.mom { font-weight: 700; font-size: 11.5px; }
.mom.up { color: #C8102E; }
.mom.down { color: #15803D; }
.mom.new { color: #1D4ED8; background: #EFF6FF; border-radius: 4px; padding: 1px 6px; font-size: 10.5px; }

:deep(.row-soft) td { background: #FCFDFE; }

.fs-foot {
  display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
  padding: 10px 16px; border-top: 1px solid #F1F5F9; background: #FAFBFD;
  font-size: 10.5px; color: #94A3B8;
}
.fs-foot b { color: #475569; font-weight: 700; }

:deep(.el-table th.el-table__cell) { font-size: 11.5px; color: #475569; font-weight: 700; }
:deep(.el-table td.el-table__cell) { padding: 11px 0; }
:deep(.el-table__footer td) { font-weight: 800; background: #FAFBFD; }
</style>
