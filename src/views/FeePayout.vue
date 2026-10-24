<template>
  <div class="payout-page">
    <!-- 模块未开通：不显示任何登记能力（开关在「费用审批设置」） -->
    <div v-if="moduleLoaded && !payoutOn" class="off-card">
      <div class="off-ic"><el-icon><Wallet /></el-icon></div>
      <h3>「付款登记」没有开通</h3>
      <p>这是一个可配置的功能模块，当前账号还没有启用。<template v-if="isMaster">去「费用管理 → 费用审批设置 → 功能模块」打开即可。</template></p>
      <el-button v-if="isMaster" type="danger" plain @click="router.push('/fee/config')">去开通</el-button>
    </div>

    <template v-else>
      <!-- ===== 筛选卡片 ===== -->
      <div class="filter-card fade-up">
        <div class="stats-tabs">
          <button class="stat-pill" :class="{ active: tab === 'pending' }" @click="switchTab('pending')">
            <span class="stat-label">待付款</span>
            <span class="stat-count">{{ stats.pendingCount }}</span>
          </button>
          <button class="stat-pill" :class="{ active: tab === 'paid' }" @click="switchTab('paid')">
            <span class="stat-label">已付款</span>
            <span class="stat-count">{{ stats.paidCount }}</span>
          </button>

          <div class="sums">
            <span class="sum-item">待付款 <b class="is-warn">¥{{ money(stats.pendingAmount) }}</b></span>
            <span class="sum-item">本月已付 <b class="is-ok">¥{{ money(stats.paidMonthAmount) }}</b></span>
          </div>
        </div>

        <div class="search-row">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            unlink-panels
            style="width: 240px"
          />
          <el-select v-model="typeFilter" placeholder="费用类型" clearable style="width: 130px">
            <el-option v-for="t in TYPE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
          <el-input v-model="keyword" placeholder="上报单号 / 运单号 / 司机 / 车牌" clearable style="width: 230px" />

          <div class="search-btns">
            <el-button type="primary" class="btn-primary" @click="handleSearch">
              <el-icon><Search /></el-icon> 搜索
            </el-button>
            <el-button class="btn-outline" @click="handleReset">
              <el-icon><Refresh /></el-icon> 重置
            </el-button>
          </div>
        </div>
      </div>

      <!-- ===== 表格卡片 ===== -->
      <Teleport to="body" :disabled="!fullscreen">
        <div class="table-card-wrap" :class="{ 'is-fullscreen': fullscreen }">
          <div class="table-card">
            <div class="toolbar">
              <div class="toolbar-left">
                <span class="toolbar-bar"></span>
                <span class="toolbar-title">{{ tab === 'pending' ? '待付款清单' : '付款记录' }}</span>
                <span class="toolbar-total">共 {{ total }} 笔</span>
              </div>

              <div class="toolbar-right">
                <el-button
                  v-if="tab === 'pending'"
                  type="primary"
                  class="btn-primary"
                  :disabled="!selected.length"
                  @click="openPay(selected)"
                >
                  <el-icon><Wallet /></el-icon> 批量登记付款{{ selected.length ? `（${selected.length}）` : '' }}
                </el-button>

                <button class="icon-btn" title="刷新" @click="refreshAll">
                  <el-icon><Refresh /></el-icon>
                </button>

                <el-dropdown trigger="click" popper-class="density-dropdown-red" @command="handleDensityChange">
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
                  :width="240"
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
                    <div class="column-setting-body">
                      <div v-for="col in columnDefs" :key="col.key" class="column-item">
                        <el-checkbox v-model="colVisible[col.key]">{{ col.label }}</el-checkbox>
                      </div>
                    </div>
                  </div>
                </el-popover>

                <button class="icon-btn" :title="fullscreen ? '退出全屏' : '全屏'" @click="fullscreen = !fullscreen">
                  <el-icon><component :is="fullscreen ? Close : FullScreen" /></el-icon>
                </button>
              </div>
            </div>

            <!-- 已选汇总 -->
            <div v-if="tab === 'pending' && selected.length" class="batch-bar">
              <span class="bb-k">已选</span>
              <b class="bb-n">{{ selected.length }}</b>
              <span class="bb-k">笔 · 合计</span>
              <b class="bb-amt">¥{{ money(selectedAmount) }}</b>
              <span class="bb-x" @click="clearSelection">取消选择</span>
            </div>

            <div class="table-wrap">
              <el-table
                ref="tableRef"
                :data="tableData"
                v-loading="loading"
                border
                stripe
                :size="tableSize"
                row-key="id"
                height="100%"
                class="custom-table"
                @selection-change="onSelectionChange"
              >
                <el-table-column v-if="tab === 'pending'" type="selection" width="44" />

                <el-table-column v-if="colVisible.reportNo" label="上报单号" min-width="150" align="center">
                  <template #default="{ row }">
                    <span class="num-text">{{ row.report_no || '--' }}</span>
                    <div class="sub-text">{{ fmtTime(row.create_time) }}</div>
                  </template>
                </el-table-column>

                <el-table-column v-if="colVisible.waybillNo" label="运单号" min-width="150" align="center">
                  <template #default="{ row }">
                    <span class="num-text link" @click="openWaybill(row)">{{ row.waybill_no || '--' }}</span>
                  </template>
                </el-table-column>

                <el-table-column v-if="colVisible.type" label="类型" min-width="100" align="center">
                  <template #default="{ row }">
                    <span class="type-chip" :class="'t-' + row.type">{{ typeLabel(row.type) }}</span>
                  </template>
                </el-table-column>

                <el-table-column v-if="colVisible.driver" label="司机 / 车牌" min-width="140" align="center">
                  <template #default="{ row }">
                    <span>{{ row.driver_name || '--' }}</span>
                    <div class="sub-text">{{ row.plate || '--' }}</div>
                  </template>
                </el-table-column>

                <el-table-column v-if="colVisible.amount" label="金额" min-width="120" align="center">
                  <template #default="{ row }">
                    <b class="amount">¥{{ money(row.amount) }}</b>
                  </template>
                </el-table-column>

                <el-table-column v-if="colVisible.status" label="状态" min-width="100" align="center">
                  <template #default="{ row }">
                    <el-tag size="small" effect="light" :type="statusTagType(row.status)">{{ row.status }}</el-tag>
                  </template>
                </el-table-column>

                <el-table-column v-if="colVisible.time" :label="tab === 'pending' ? '审批通过时间' : '付款时间'" min-width="160" align="center">
                  <template #default="{ row }">
                    <span class="time-text">{{ fmtTime(tab === 'pending' ? approvedAt(row) : row.paid_at) }}</span>
                  </template>
                </el-table-column>

                <el-table-column v-if="tab === 'paid' && colVisible.paidBy" label="付款人" min-width="110" align="center">
                  <template #default="{ row }">
                    <span>{{ row.paid_by || '--' }}</span>
                  </template>
                </el-table-column>

                <el-table-column v-if="tab === 'paid' && colVisible.voucher" label="凭据" min-width="110" align="center">
                  <template #default="{ row }">
                    <span v-if="voucherCount(row)" class="voucher-link" @click="openVouchers(row)">
                      {{ voucherCount(row) }} 个 ›
                    </span>
                    <span v-else class="voucher-none">--</span>
                  </template>
                </el-table-column>

                <el-table-column label="操作" min-width="190" align="center" fixed="right">
                  <template #default="{ row }">
                    <template v-if="tab === 'pending'">
                      <el-button size="small" type="primary" plain @click="openPay([row])">登记付款</el-button>
                    </template>
                    <template v-else>
                      <el-button size="small" type="danger" plain @click="openRevoke(row)">撤销</el-button>
                    </template>
                    <el-button size="small" plain @click="openWaybill(row)">看运单</el-button>
                  </template>
                </el-table-column>

                <template #empty>
                  <div class="empty-box">
                    <div class="empty-ic"><el-icon><Wallet /></el-icon></div>
                    <p>{{ tab === 'pending' ? '没有待付款的费用' : '还没有付款记录' }}</p>
                    <span>{{ tab === 'pending' ? '审批通过的钱款类上报会出现在这里' : '登记付款后，这里会留下时间、付款人与凭据' }}</span>
                  </div>
                </template>
              </el-table>
            </div>

            <div class="pager">
              <el-pagination
                v-model:current-page="page"
                v-model:page-size="pageSize"
                :total="total"
                :page-sizes="[10, 20, 50, 100]"
                layout="total, sizes, prev, pager, next, jumper"
                background
                size="small"
                @size-change="onSizeChange"
                @current-change="onPageChange"
              />
            </div>
          </div>
        </div>
      </Teleport>
    </template>

    <!-- 登记 / 撤销 共用弹窗 -->
    <PaymentDialog v-model="payVisible" :targets="payTargets" mode="pay" @done="onPaid" />
    <PaymentDialog v-model="revokeVisible" :targets="revokeTargets" mode="revoke" @done="onRevoked" />

    <!-- 凭据查看 -->
    <PaymentVouchers v-model="voucherVisible" :images="voucherImages" :title="voucherTitle" />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search, Refresh, Wallet, Setting, FullScreen, Close, Operation, Grid } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { supabase } from '@/utils/supabase'
import { MONEY_TYPES, PAY_PENDING_STATUS, currentFeeUser, isMasterUser, isPayer } from '@/utils/feeTodo'
import { moduleFlags, ensureModuleFlags } from '@/utils/modules'
import PaymentDialog from '@/components/PaymentDialog.vue'
import PaymentVouchers from '@/components/PaymentVouchers.vue'

const router = useRouter()
const currentUser = currentFeeUser() || {}
const isAdmin = currentUser.role === 'admin'
const myAccount = currentUser.masterAccount || currentUser.account || ''
const isMaster = isMasterUser(currentUser)

const payoutOn = computed(() => moduleFlags.payout === true)
const moduleLoaded = computed(() => moduleFlags.loaded)

/* ============================================================
   基础
   ============================================================ */
const TYPE_LABEL = {
  expense: '费用上报', subsidy: '补贴申请', loan: '借款申请', violation: '违章上报',
  weigh: '磅单上报', receipt: '回单上报', overtime: '超时报备', cardfix: '补卡申请',
  repair: '报修报销',
}
const TYPE_OPTIONS = [
  { value: 'expense', label: '费用上报' },
  { value: 'subsidy', label: '补贴申请' },
  { value: 'loan', label: '借款申请' },
  { value: 'violation', label: '违章上报' },
]

const typeLabel = (t) => TYPE_LABEL[t] || '上报'
const money = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtTime = (v) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '--')

const statusTagType = (s) => {
  if (s === '已打款') return 'success'
  if (s === '待打款') return 'primary'
  return 'warning'
}

const approvedAt = (r) => {
  const flow = Array.isArray(r.flow) ? r.flow : []
  let hit = ''
  flow.forEach((st) => {
    if (st && st.status === '已通过' && st.acted_at) hit = st.acted_at
  })
  return hit || r.update_time
}

const voucherCount = (r) => (Array.isArray(r?.payment?.images) ? r.payment.images.length : 0)

/* ============================================================
   列表
   ============================================================ */
const tab = ref('pending')
const keyword = ref('')
const typeFilter = ref('')
const dateRange = ref([])
const tableData = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const selected = ref([])
const tableRef = ref(null)

const stats = reactive({ pendingCount: 0, pendingAmount: 0, paidCount: 0, paidMonthAmount: 0 })
const selectedAmount = computed(() => selected.value.reduce((s, r) => s + (Number(r.amount) || 0), 0))

const scope = (q) => (isAdmin ? q : q.eq('owner_account', myAccount))

async function fetchData() {
  loading.value = true
  try {
    let q = supabase.from('reports').select('*', { count: 'exact' }).in('type', MONEY_TYPES)
    q = tab.value === 'pending'
      ? q.in('status', PAY_PENDING_STATUS)
      : q.eq('status', '已打款')
    q = scope(q)

    const kw = keyword.value.trim().replace(/[,()]/g, ' ')
    if (kw) {
      q = q.or(
        `report_no.ilike.%${kw}%,waybill_no.ilike.%${kw}%,driver_name.ilike.%${kw}%,plate.ilike.%${kw}%`
      )
    }
    if (typeFilter.value) q = q.eq('type', typeFilter.value)

    if (dateRange.value && dateRange.value.length === 2) {
      const col = tab.value === 'pending' ? 'update_time' : 'paid_at'
      q = q.gte(col, dateRange.value[0]).lt(col, dateRange.value[1] + ' 23:59:59')
    }

    const from = (page.value - 1) * pageSize.value
    const { data, count, error } = await q
      .order(tab.value === 'pending' ? 'update_time' : 'paid_at', { ascending: false })
      .range(from, from + pageSize.value - 1)
    if (error) throw error

    tableData.value = data || []
    total.value = count || 0
  } catch (e) {
    console.error('[付款登记] 读取失败', e)
    ElMessage.error('读取上报失败：' + (e?.message || '未知错误'))
    tableData.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

async function loadStats() {
  try {
    const [pendingRes, paidRes] = await Promise.all([
      scope(
        supabase
          .from('reports')
          .select('id,amount', { count: 'exact' })
          .in('type', MONEY_TYPES)
          .in('status', PAY_PENDING_STATUS)
      ).limit(2000),
      scope(
        supabase
          .from('reports')
          .select('id,amount', { count: 'exact' })
          .in('type', MONEY_TYPES)
          .eq('status', '已打款')
          .gte('paid_at', dayjs().startOf('month').format('YYYY-MM-DD') + ' 00:00:00')
      ).limit(5000),
    ])

    const pendingRows = pendingRes.data || []
    const paidRows = paidRes.data || []
    stats.pendingCount = pendingRes.count ?? pendingRows.length
    stats.pendingAmount = pendingRows.reduce((s, r) => s + (Number(r.amount) || 0), 0)
    stats.paidCount = paidRes.count ?? paidRows.length
    stats.paidMonthAmount = paidRows.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  } catch (e) {
    console.warn('[付款登记] 统计失败（不阻断）', e)
  }
}

const refreshAll = async () => {
  await Promise.all([fetchData(), loadStats()])
}

const switchTab = (t) => {
  if (tab.value === t) return
  tab.value = t
  page.value = 1
  clearSelection()
  fetchData()
}

const handleSearch = () => { page.value = 1; fetchData() }
const handleReset = () => {
  keyword.value = ''
  typeFilter.value = ''
  dateRange.value = []
  page.value = 1
  fetchData()
}
const onPageChange = (p) => { page.value = p; fetchData() }
const onSizeChange = (s) => { pageSize.value = s; page.value = 1; fetchData() }

const onSelectionChange = (rows) => { selected.value = rows || [] }
const clearSelection = () => {
  selected.value = []
  if (tableRef.value) tableRef.value.clearSelection()
}

const openWaybill = (row) => {
  if (!row.waybill_no) return
  router.push({ path: '/waybill/detail', query: { waybill_no: row.waybill_no, tab: 'fee' } })
}

/* ============================================================
   工具栏：密度 / 列设置 / 全屏
   ============================================================ */
const tableSize = ref('default')
const handleDensityChange = (cmd) => { tableSize.value = cmd }

const fullscreen = ref(false)
const columnPopoverVisible = ref(false)

const columnDefs = reactive([
  { key: 'reportNo', label: '上报单号' },
  { key: 'waybillNo', label: '运单号' },
  { key: 'type', label: '类型' },
  { key: 'driver', label: '司机 / 车牌' },
  { key: 'amount', label: '金额' },
  { key: 'status', label: '状态' },
  { key: 'time', label: '通过 / 付款时间' },
  { key: 'paidBy', label: '付款人' },
  { key: 'voucher', label: '凭据' },
])
const colVisible = reactive({
  reportNo: true, waybillNo: true, type: true, driver: true,
  amount: true, status: true, time: true, paidBy: true, voucher: true,
})
const resetColumns = () => {
  columnDefs.forEach((c) => { colVisible[c.key] = true })
}

/* ============================================================
   登记 / 撤销 / 凭据
   ============================================================ */
const payVisible = ref(false)
const payTargets = ref([])
const revokeVisible = ref(false)
const revokeTargets = ref([])
const voucherVisible = ref(false)
const voucherImages = ref([])
const voucherTitle = ref('付款凭据')

const openPay = (rows) => {
  if (!payoutOn.value) return ElMessage.warning('付款登记未开通，请先在费用审批设置里打开')
  if (!isPayer(currentUser)) return ElMessage.warning('只有主账号或财务可以登记付款')

  const list = (rows || []).filter((r) => r && PAY_PENDING_STATUS.includes(r.status))
  if (!list.length) return ElMessage.warning('这些上报已经不在待付款状态，请刷新')
  payTargets.value = list
  payVisible.value = true
}

const openRevoke = (row) => {
  if (!row) return
  if (row.status !== '已打款') return ElMessage.warning('只有已打款的记录可以撤销')
  if (!isPayer(currentUser)) return ElMessage.warning('只有主账号或财务可以撤销付款')
  revokeTargets.value = [row]
  revokeVisible.value = true
}

const openVouchers = (row) => {
  const imgs = Array.isArray(row?.payment?.images) ? row.payment.images : []
  if (!imgs.length) return
  voucherImages.value = imgs
  voucherTitle.value = `付款凭据 · ${row.waybill_no || row.report_no || ''}`
  voucherVisible.value = true
}

const onPaid = async () => {
  clearSelection()
  await refreshAll()
}

const onRevoked = async () => {
  await refreshAll()
}

/* ============================================================
   初始化
   ============================================================ */
onMounted(async () => {
  await ensureModuleFlags(currentUser)
  if (!payoutOn.value) return
  if (isPayer(currentUser)) {
    await refreshAll()
  } else {
    ElMessage.warning('只有主账号或财务可以登记付款')
  }
})
</script>

<style scoped>
.payout-page {
  --num-font: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue',
    'PingFang SC', 'HarmonyOS Sans SC', 'Source Han Sans SC', 'Microsoft YaHei', Arial, sans-serif;
  padding: 6px 16px 16px;
  background-color: #F8FAFC;
  height: calc(100vh - 101px);
  max-height: calc(100vh - 101px);
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 13px;
}

/* 未开通 */
.off-card {
  margin: 40px auto;
  width: 460px;
  max-width: 92%;
  background: #fff;
  border-radius: 14px;
  padding: 40px 32px;
  text-align: center;
  box-shadow: 0 8px 30px rgba(15, 23, 42, 0.06);
}
.off-ic {
  width: 56px;
  height: 56px;
  margin: 0 auto 16px;
  border-radius: 50%;
  background: var(--brand-primary-light);
  color: var(--brand-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}
.off-card h3 { margin: 0 0 8px; font-size: 17px; color: #0F172A; }
.off-card p { margin: 0 0 18px; font-size: 13px; color: #64748B; line-height: 1.8; }

/* ===== 筛选卡片 ===== */
.filter-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
}

.stats-tabs { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.stat-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px solid transparent;
  border-radius: 18px;
  background: #F1F5F9;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  color: #475569;
}

.stat-pill:hover {
  background: var(--brand-primary-light);
  color: var(--brand-primary);
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(var(--brand-rgb), 0.08);
}

.stat-pill.active {
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  color: #fff;
  box-shadow: 0 4px 12px rgba(var(--brand-rgb), 0.35);
}

.stat-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 16px;
  padding: 0 5px;
  border-radius: 8px;
  background: rgba(100, 116, 139, 0.12);
  font-size: 11px;
  font-weight: 700;
  color: #64748B;
  line-height: 1;
}

.stat-pill.active .stat-count {
  background: rgba(255, 255, 255, 0.28);
  color: #fff;
}

.sums {
  margin-left: auto;
  display: flex;
  gap: 16px;
  align-items: center;
  font-size: 12px;
  color: #94A3B8;
}

.sum-item b {
  font-family: var(--num-font);
  font-size: 14px;
  margin-left: 4px;
  color: #0F172A;
}
.sum-item b.is-warn { color: #D97706; }
.sum-item b.is-ok { color: #15803D; }

.search-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.search-btns { display: flex; gap: 10px; margin-left: auto; }

/* ===== 表格卡片 ===== */
.table-card-wrap { display: flex; flex-direction: column; flex: 1; min-height: 0; }

.table-card-wrap.is-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 9999;
  padding: 24px;
  background: rgba(248, 250, 252, 0.85);
  backdrop-filter: blur(20px) saturate(180%);
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

.toolbar-left { display: flex; align-items: center; gap: 8px; }

.toolbar-bar {
  width: 4px;
  height: 18px;
  border-radius: 2px;
  background: linear-gradient(180deg, var(--brand-primary), var(--brand-primary-dark));
  box-shadow: 0 0 8px rgba(var(--brand-rgb), 0.35);
}

.toolbar-title { font-size: 15px; font-weight: 800; color: #0F172A; letter-spacing: 0.3px; }

.toolbar-total {
  font-size: 12.5px;
  color: #94A3B8;
  font-weight: 500;
  padding-left: 8px;
  border-left: 1px solid #E2E8F0;
}

.toolbar-right { display: flex; align-items: center; gap: 8px; margin-left: auto; flex-wrap: wrap; }

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

.icon-btn.active {
  border-color: var(--brand-primary);
  color: #fff;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  box-shadow: 0 4px 12px rgba(var(--brand-rgb), 0.35);
}

.batch-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--brand-primary-light);
  border: 1px solid #FBD5DB;
  color: #9F1239;
  font-size: 12.5px;
  flex-shrink: 0;
}

.bb-n { font-family: var(--num-font); font-size: 14px; }
.bb-amt { font-family: var(--num-font); font-size: 14px; color: var(--brand-primary); }
.bb-x {
  margin-left: auto;
  cursor: pointer;
  color: var(--brand-primary);
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
}
.bb-x:hover { background: #FEE2E2; }

.table-wrap { flex: 1; min-height: 0; overflow: hidden; border-radius: 8px; }

.pager {
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
  padding-top: 8px;
  border-top: 1px solid #F1F5F9;
}

.num-text { font-family: var(--num-font); font-weight: 600; color: #0F172A; font-size: 12.5px; }
.num-text.link { color: var(--brand-primary); cursor: pointer; }
.num-text.link:hover { text-decoration: underline; }

.sub-text { font-size: 11px; color: #94A3B8; margin-top: 2px; font-family: var(--num-font); }
.time-text { font-family: var(--num-font); font-size: 12px; color: #475569; }
.amount { font-family: var(--num-font); font-size: 13.5px; color: var(--brand-primary); }

.type-chip {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 600;
  background: #F1F5F9;
  color: #475569;
}
.type-chip.t-expense { background: var(--brand-primary-light); color: var(--brand-primary); }
.type-chip.t-subsidy { background: #EFF6FF; color: #1D4ED8; }
.type-chip.t-loan { background: var(--brand-primary-light); color: var(--brand-primary); }
.type-chip.t-violation { background: #FEE2E2; color: #B91C1C; }

.voucher-link { color: var(--brand-primary); font-size: 12px; cursor: pointer; font-weight: 600; }
.voucher-link:hover { text-decoration: underline; }
.voucher-none { color: #CBD5E1; }

.empty-box { padding: 26px 0 14px; text-align: center; color: #94A3B8; }
.empty-ic { font-size: 28px; color: #CBD5E1; margin-bottom: 6px; }
.empty-box p { margin: 0 0 4px; font-size: 13.5px; color: #64748B; font-weight: 600; }
.empty-box span { font-size: 12px; }

/* ===== 列设置 ===== */
.column-setting { padding: 0; background: #FFFFFF; }
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
.col-reset { font-size: 12px; color: var(--brand-primary); cursor: pointer; font-weight: 600; }
.column-item { display: flex; align-items: center; padding: 3px 2px; }
</style>
