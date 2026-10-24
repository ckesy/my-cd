<template>
  <div class="mt-page">
    <!-- ===== KPI ===== -->
    <div class="mt-kpis">
      <div class="kpi">
        <div class="kpi-v">{{ kpi.repair.count }}<span class="kpi-u">次</span></div>
        <div class="kpi-l">本月维修 · {{ money(kpi.repair.amount) }}</div>
      </div>
      <div class="kpi is-green">
        <div class="kpi-v">{{ kpi.service.count }}<span class="kpi-u">次</span></div>
        <div class="kpi-l">本月保养 · {{ money(kpi.service.amount) }}</div>
      </div>
      <div class="kpi is-blue">
        <div class="kpi-v">{{ kpi.tire.count }}<span class="kpi-u">条</span></div>
        <div class="kpi-l">本月轮胎 · {{ money(kpi.tire.amount) }}</div>
      </div>
      <div class="kpi is-amber">
        <div class="kpi-v">{{ kpi.doing }}<span class="kpi-u">单</span></div>
        <div class="kpi-l">待修（巡检转单）</div>
      </div>
    </div>

    <!-- ===== tabs ===== -->
    <div class="mt-tabs">
      <button v-for="k in KIND_TABS" :key="k" class="mt-tab" :class="{ on: kind === k }" @click="switchKind(k)">
        {{ KIND_META[k].label }}
        <span class="mt-tab-n">{{ countOf(k) }}</span>
      </button>
    </div>

    <!-- ===== 筛选 ===== -->
    <div class="mt-filter">
      <el-date-picker v-model="dateRange" type="daterange" range-separator="至"
        start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD"
        unlink-panels :shortcuts="DATE_SHORTCUTS" style="width:250px" @change="reload" />
      <el-input v-model="keyword" :placeholder="kwPlaceholder" clearable style="width:200px"
        @keyup.enter="applyFilter" @clear="applyFilter">
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-select v-if="kind === 'repair'" v-model="catFilter" placeholder="类别" clearable style="width:120px">
        <el-option v-for="c in REPAIR_CATEGORIES" :key="c" :label="c" :value="c" />
      </el-select>
      <el-select v-if="kind === 'service'" v-model="lvFilter" placeholder="级别" clearable style="width:130px">
        <el-option v-for="l in SERVICE_LEVELS" :key="l.value" :label="l.label" :value="l.value" />
      </el-select>
      <el-select v-if="kind === 'tire'" v-model="actFilter" placeholder="动作" clearable style="width:120px">
        <el-option v-for="a in TIRE_ACTIONS" :key="a" :label="a" :value="a" />
      </el-select>
      <el-button type="primary" class="btn-primary" :loading="loading" @click="reload">查询</el-button>
      <el-button @click="handleReset">重置</el-button>
      <el-button type="primary" class="btn-primary mt-add" @click="openAdd">
        <el-icon><CirclePlus /></el-icon> 新增{{ KIND_META[kind].label }}
      </el-button>
    </div>

    <!-- ===== 建表提示 ===== -->
    <div v-if="dbHint" class="mt-hint">
      <el-icon><WarningFilled /></el-icon>
      <div>
        <div>{{ dbHint }}</div>
        <div class="mt-hint-s">请先在 CloudBase 控制台执行 <code>sql/2026-10-25_maintenance_records.sql</code>，再刷新。</div>
      </div>
    </div>

    <!-- ===== 表格卡片（四件套在卡片里，全屏才有退出） ===== -->
    <Teleport to="body" :disabled="!isFullscreen">
      <div class="mt-card" :class="{ 'is-fullscreen': isFullscreen }">
        <div class="mt-toolbar">
          <span class="tl-bar"></span>
          <h2>{{ KIND_META[kind].label }}记录</h2>
          <span class="tl-hint">一行一次作业 · 点行可编辑</span>
          <TableTools v-model:size="tableSize" v-model:fullscreen="isFullscreen" :columns="columns"
            :total="filtered.length" :storage-key="'maintenance_' + kind" :refreshing="loading"
            @refresh="reload" @reset="resetColumns" />
        </div>

        <div class="mt-table">
          <el-table :data="pagedRows" v-loading="loading" element-loading-text="加载中…"
            element-loading-background="rgba(255,255,255,0.88)" :size="tableSize" stripe height="100%"
            row-key="id" @row-click="openEdit">
            <el-table-column v-for="col in visibleColumns" :key="col.prop" :prop="col.prop" :label="col.label"
              :width="col.width" :min-width="col.width ? undefined : col.minWidth || 110"
              :fixed="col.fixed || false" :align="col.align || 'left'" show-overflow-tooltip>
              <template #default="{ row }">
                <span v-if="col.prop === 'happen_at'" class="cell-date num">
                  {{ day(row.happen_at) }}
                  <span v-if="row.status === 'doing'" class="tag-doing">待修</span>
                </span>
                <span v-else-if="col.prop === 'plate'" class="cell-plate">{{ row.plate }}</span>
                <span v-else-if="col.prop === 'fault_desc'" class="cell-main">{{ row.fault_desc || '--' }}</span>
                <span v-else-if="col.prop === 'repair_desc'" class="cell-dim">{{ row.repair_desc || '--' }}</span>
                <span v-else-if="col.prop === 'category'" class="pill" :class="catClass(row.category)">{{ row.category || '--' }}</span>
                <span v-else-if="col.prop === 'service_level'" class="pill ok">{{ SERVICE_LEVEL_LABEL[row.service_level] || '--' }}</span>
                <span v-else-if="col.prop === 'items'" class="cell-dim">{{ (row.items || []).join(' / ') || '--' }}</span>
                <span v-else-if="col.prop === 'tire_action'" class="pill info">{{ row.tire_action || '--' }}</span>
                <span v-else-if="col.prop === 'tire_pos'" class="cell-dim">{{ row.tire_pos || '--' }}</span>
                <span v-else-if="col.prop === 'tire_spec'" class="cell-dim">
                  {{ [row.tire_spec, row.tire_brand].filter(Boolean).join(' · ') || '--' }}
                </span>
                <span v-else-if="col.prop === 'tread_mm'" class="num cell-dim">{{ row.tread_mm ? row.tread_mm + ' mm' : '--' }}</span>
                <span v-else-if="col.prop === 'amount'" class="cell-amt num">{{ row.amount ? money(row.amount) : '--' }}</span>
                <span v-else-if="col.prop === 'vendor'" class="cell-dim">{{ row.vendor || '--' }}</span>
                <span v-else-if="col.prop === 'mileage'" class="num cell-dim">{{ row.mileage ? km(row.mileage) : '--' }}</span>
                <div v-else-if="col.prop === 'ops'" class="cell-ops">
                  <el-button link type="primary" size="small" @click.stop="openEdit(row)">编辑</el-button>
                  <el-button link size="small" class="del-btn" @click.stop="remove(row)">删除</el-button>
                </div>
                <span v-else class="cell-dim">{{ row[col.prop] || '--' }}</span>
              </template>
            </el-table-column>

            <template #empty>
              <div class="mt-empty">
                <el-icon class="mt-empty-ic"><Tools /></el-icon>
                <p>{{ dbHint ? '读不到维保数据' : '还没有' + KIND_META[kind].label + '记录' }}</p>
                <span v-if="dbHint">先执行 sql/2026-10-25_maintenance_records.sql，再刷新</span>
                <span v-else>点右上角「新增{{ KIND_META[kind].label }}」开始记第一条</span>
              </div>
            </template>
          </el-table>
        </div>

        <div class="mt-pager">
          <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[20, 50, 100]"
            :total="filtered.length" layout="total, sizes, prev, pager, next, jumper" background
            @size-change="page = 1" />
        </div>

        <transition name="fs-fade">
          <button v-if="isFullscreen" class="fs-exit-btn" @click="isFullscreen = false">
            <el-icon><Close /></el-icon> 退出全屏
          </button>
        </transition>
      </div>
    </Teleport>

    <RecordDrawer v-model="drawerVisible" :kind="kind" :record="editRow" @saved="onSaved" />
  </div>
</template>

<script setup>
/**
 * 维保台账（维修 / 保养 / 轮胎）
 * ------------------------------------------------------------
 * · 三 tab = 一个 kind 条件；「跨车看一车」在单车维保页
 * · 录单统一右侧抽屉（components/maintenance/RecordDrawer.vue）
 * · 保养保存后回写车务 vehicle_certs.maintain（见 utils/maintenance）
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, CirclePlus, WarningFilled, Tools, Close } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import TableTools from '@/components/TableTools.vue'
import RecordDrawer from '@/components/maintenance/RecordDrawer.vue'
import {
  KIND_META, KIND_TABS, REPAIR_CATEGORIES, SERVICE_LEVELS, SERVICE_LEVEL_LABEL, TIRE_ACTIONS,
  loadRecords, deleteRecord, money, km, day,
} from '@/utils/maintenance'

/* ================= 状态 ================= */
const kind = ref('repair')
const rows = ref([])
const loading = ref(false)
const dbHint = ref('')
const dateRange = ref([dayjs().subtract(29, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')])
const keyword = ref('')
const catFilter = ref('')
const lvFilter = ref('')
const actFilter = ref('')
const page = ref(1)
const pageSize = ref(20)
const tableSize = ref('default')
const isFullscreen = ref(false)

const drawerVisible = ref(false)
const editRow = ref(null)

const kpi = ref({
  repair: { count: 0, amount: 0 },
  service: { count: 0, amount: 0 },
  tire: { count: 0, amount: 0 },
  doing: 0,
})

const DATE_SHORTCUTS = [
  { text: '本月', value: () => [dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')] },
  { text: '近 30 天', value: () => [dayjs().subtract(29, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')] },
  { text: '近 90 天', value: () => [dayjs().subtract(89, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')] },
  { text: '今年', value: () => [dayjs().startOf('year').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')] },
]

/* ================= 列（按 kind 切） ================= */
const COLUMN_MAP = {
  repair: [
    { prop: 'happen_at', label: '维修日期', visible: true, width: 110 },
    { prop: 'plate', label: '车牌', visible: true, width: 118 },
    { prop: 'fault_desc', label: '故障现象', visible: true, minWidth: 200 },
    { prop: 'repair_desc', label: '维修项目', visible: true, minWidth: 180 },
    { prop: 'category', label: '类别', visible: true, width: 80 },
    { prop: 'amount', label: '金额', visible: true, width: 96, align: 'right' },
    { prop: 'vendor', label: '维修厂', visible: true, width: 120 },
    { prop: 'mileage', label: '里程', visible: true, width: 100 },
    { prop: 'ops', label: '操作', visible: true, width: 110, fixed: 'right' },
  ],
  service: [
    { prop: 'happen_at', label: '保养日期', visible: true, width: 110 },
    { prop: 'plate', label: '车牌', visible: true, width: 118 },
    { prop: 'service_level', label: '级别', visible: true, width: 110 },
    { prop: 'items', label: '保养项目', visible: true, minWidth: 240 },
    { prop: 'amount', label: '金额', visible: true, width: 96, align: 'right' },
    { prop: 'vendor', label: '地点', visible: true, width: 120 },
    { prop: 'mileage', label: '里程', visible: true, width: 100 },
    { prop: 'ops', label: '操作', visible: true, width: 110, fixed: 'right' },
  ],
  tire: [
    { prop: 'happen_at', label: '日期', visible: true, width: 110 },
    { prop: 'plate', label: '车牌', visible: true, width: 118 },
    { prop: 'tire_action', label: '动作', visible: true, width: 84 },
    { prop: 'tire_pos', label: '位置', visible: true, width: 150 },
    { prop: 'tire_spec', label: '规格 · 品牌', visible: true, minWidth: 140 },
    { prop: 'tread_mm', label: '胎面', visible: true, width: 90 },
    { prop: 'amount', label: '金额', visible: true, width: 96, align: 'right' },
    { prop: 'vendor', label: '地点', visible: true, width: 110 },
    { prop: 'mileage', label: '里程', visible: true, width: 100 },
    { prop: 'ops', label: '操作', visible: true, width: 110, fixed: 'right' },
  ],
}
const columnState = ref({
  repair: COLUMN_MAP.repair.map((c) => ({ ...c })),
  service: COLUMN_MAP.service.map((c) => ({ ...c })),
  tire: COLUMN_MAP.tire.map((c) => ({ ...c })),
})
const columns = computed(() => columnState.value[kind.value])
const visibleColumns = computed(() => columns.value.filter((c) => c.visible !== false))
const resetColumns = () => columns.value.forEach((c) => { c.visible = true })

const kwPlaceholder = computed(
  () => ({ repair: '车牌 / 故障现象', service: '车牌 / 保养项目', tire: '车牌 / 规格 / 胎号' }[kind.value])
)

/* ================= 取数 ================= */
const isMissingTable = (msg) => /42P01|does not exist|permission denied|42501/i.test(String(msg || ''))

async function reload() {
  loading.value = true
  try {
    const list = await loadRecords({
      from: dateRange.value?.[0] || undefined,
      to: dateRange.value?.[1] || undefined,
      limit: 1000,
    })
    dbHint.value = ''
    rows.value = list
    await loadKpi()
  } catch (e) {
    const msg = String((e && e.message) || e || '')
    console.error('加载维保台账失败', e)
    dbHint.value = isMissingTable(msg)
      ? '维保表还不存在或没有授权'
      : '读不到维保数据：可能还没建表，或网络异常'
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function loadKpi() {
  const start = dayjs().startOf('month').format('YYYY-MM-DD')
  try {
    const month = await loadRecords({ from: start, limit: 1000 })
    const acc = { repair: { count: 0, amount: 0 }, service: { count: 0, amount: 0 }, tire: { count: 0, amount: 0 } }
    month.forEach((r) => {
      const a = acc[r.kind] || (acc[r.kind] = { count: 0, amount: 0 })
      a.count += 1
      a.amount += Number(r.amount) || 0
    })
    kpi.value = {
      repair: acc.repair,
      service: acc.service,
      tire: acc.tire,
      /* 待修：不限日期，取当前所有 doing */
      doing: rows.value.filter((r) => r.status === 'doing').length,
    }
  } catch (e) {
    /* KPI 失败不影响列表 */
  }
}

/* ================= 筛选 ================= */
const ofKind = computed(() => rows.value.filter((r) => r.kind === kind.value))

const countOf = (k) => rows.value.filter((r) => r.kind === k).length

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return ofKind.value.filter((r) => {
    if (kind.value === 'repair' && catFilter.value && r.category !== catFilter.value) return false
    if (kind.value === 'service' && lvFilter.value && r.service_level !== lvFilter.value) return false
    if (kind.value === 'tire' && actFilter.value && r.tire_action !== actFilter.value) return false
    if (kw) {
      const hay = `${r.plate || ''} ${r.fault_desc || ''} ${r.repair_desc || ''} ${(r.items || []).join(' ')} ${r.tire_spec || ''} ${r.tire_brand || ''} ${r.tire_no || ''}`
      if (!hay.toLowerCase().includes(kw)) return false
    }
    return true
  })
})

const pagedRows = computed(() => {
  const s = (page.value - 1) * pageSize.value
  return filtered.value.slice(s, s + pageSize.value)
})

const catClass = (c) => ({ 三电: 'warn', 事故: 'bad' }[c] || '')

const applyFilter = () => { page.value = 1 }

const switchKind = (k) => {
  kind.value = k
  page.value = 1
  keyword.value = ''
  catFilter.value = ''
  lvFilter.value = ''
  actFilter.value = ''
}

const handleReset = () => {
  dateRange.value = [dayjs().subtract(29, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')]
  keyword.value = ''
  catFilter.value = ''
  lvFilter.value = ''
  actFilter.value = ''
  page.value = 1
  reload()
}

/* ================= 录单 ================= */
const openAdd = () => {
  editRow.value = null
  drawerVisible.value = true
}
const openEdit = (row) => {
  editRow.value = row
  drawerVisible.value = true
}
const onSaved = async () => {
  await reload()
}

const remove = async (row) => {
  try {
    await ElMessageBox.confirm(
      `删除 ${day(row.happen_at)} ${row.plate} 的这条${KIND_META[kind.value].label}记录？`,
      '确认删除',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch (e) {
    return
  }
  try {
    await deleteRecord(row.id)
    ElMessage.success('已删除')
    await reload()
  } catch (e) {
    ElMessage.error('删除失败：' + String((e && e.message) || '').slice(0, 60))
  }
}

onMounted(reload)
</script>

<style scoped>
.mt-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
  padding: 16px 18px;
  box-sizing: border-box;
}

/* KPI */
.mt-kpis {
  display: flex;
  gap: 10px;
}
.kpi {
  flex: 1;
  background: #fff;
  border: 1px solid #e6ecf3;
  border-radius: 10px;
  padding: 12px 16px;
}
.kpi-v {
  font-size: 22px;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.15;
  letter-spacing: -0.4px;
  font-variant-numeric: tabular-nums;
}
.kpi-u {
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  margin-left: 3px;
}
.kpi-l {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 3px;
}
.kpi.is-green .kpi-v { color: #15803d; }
.kpi.is-blue .kpi-v { color: #1d4ed8; }
.kpi.is-amber .kpi-v { color: #b45309; }

/* tabs */
.mt-tabs {
  display: flex;
  gap: 6px;
  padding: 0 2px;
}
.mt-tab {
  font: inherit;
  font-size: 13px;
  color: #475569;
  background: #fff;
  border: 1px solid #e6ecf3;
  border-radius: 8px;
  padding: 6px 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: 0.15s;
}
.mt-tab:hover { border-color: #cbd5e1; color: #0f172a; }
.mt-tab.on {
  background: var(--brand-primary);
  border-color: var(--brand-primary);
  color: #fff;
  font-weight: 700;
}
.mt-tab-n {
  font-size: 10.5px;
  font-weight: 700;
  padding: 0 5px;
  border-radius: 4px;
  background: rgba(15, 23, 42, 0.06);
}
.mt-tab.on .mt-tab-n { background: rgba(255, 255, 255, 0.22); }

/* 筛选 */
.mt-filter {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  background: #fff;
  border: 1px solid #e6ecf3;
  border-radius: 10px;
  padding: 12px 14px;
}
.mt-add { margin-left: auto; }

.mt-hint {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 10px;
  padding: 12px 14px;
  color: #b45309;
  font-size: 12.5px;
  line-height: 1.7;
}
.mt-hint-s { color: #92400e; }
.mt-hint code {
  background: #fef3c7;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 11.5px;
}

/* 表格卡片 */
.mt-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #e6ecf3;
  border-radius: 10px;
  overflow: hidden;
}
.mt-card.is-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 2000;
  border-radius: 0;
  border: none;
}
.mt-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px 8px;
  border-bottom: 1px solid #f1f5f9;
}
.tl-bar {
  width: 3px;
  height: 15px;
  border-radius: 2px;
  background: var(--brand-primary);
}
.mt-toolbar h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
  color: #0f172a;
}
.tl-hint { font-size: 11px; color: #b4becb; }
.mt-toolbar :deep(.table-tools) { margin-left: auto; }

.mt-table {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.mt-card :deep(.el-table th.el-table__cell) {
  font-size: 12px;
  color: #475569;
  font-weight: 700;
}
.mt-card :deep(.el-table td.el-table__cell) { padding: 12px 0; }
.mt-card :deep(.el-table__row) { cursor: pointer; }

.mt-pager {
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  padding: 10px 14px;
  border-top: 1px solid #f1f5f9;
}

/* 单元格 */
.num { font-variant-numeric: tabular-nums; }
.cell-date { font-size: 12.5px; color: #64748b; display: inline-flex; align-items: center; gap: 5px; }
.cell-plate { font-size: 13px; font-weight: 700; color: #0f172a; letter-spacing: 0.3px; }
.cell-main { font-size: 12.5px; color: #0f172a; }
.cell-dim { font-size: 12.5px; color: #64748b; }
.cell-amt { font-size: 13px; font-weight: 700; color: #0f172a; }
.cell-ops { display: flex; gap: 4px; }
.del-btn { color: #b45309 !important; }
.tag-doing {
  font-size: 9.5px;
  font-weight: 700;
  color: #b45309;
  background: #fef3c7;
  border-radius: 3px;
  padding: 1px 4px;
}
.pill {
  display: inline-flex;
  align-items: center;
  font-size: 11.5px;
  font-weight: 700;
  border-radius: 5px;
  padding: 2px 8px;
  background: #f1f5f9;
  color: #475569;
}
.pill.ok { background: #dcfce7; color: #15803d; }
.pill.info { background: #dbeafe; color: #1d4ed8; }
.pill.warn { background: #fef3c7; color: #b45309; }
.pill.bad { background: #fef2f2; color: #c8102e; }

.mt-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 40px 0;
}
.mt-empty-ic { font-size: 30px; color: #e2e8f0; }
.mt-empty p { margin: 0; font-size: 13px; color: #64748b; font-weight: 600; }
.mt-empty span { font-size: 12px; color: #b4becb; }

.fs-exit-btn {
  position: fixed;
  right: 26px;
  bottom: 66px;
  z-index: 2100;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 16px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark, #a00d24));
  color: #fff;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 8px 22px rgba(200, 16, 46, 0.34);
}
.fs-fade-enter-active,
.fs-fade-leave-active { transition: opacity 0.18s ease; }
.fs-fade-enter-from,
.fs-fade-leave-to { opacity: 0; }
</style>
