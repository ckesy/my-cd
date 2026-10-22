<template>
  <div class="energy-report-page">
    <!-- ============================================================
         筛选条：控件全部在同一行，按钮跟在末尾（窄屏自动折行）
         ============================================================ -->
    <div class="filter-row">
      <el-input v-model="filters.task_name" placeholder="任务名称" clearable class="f-name"
        @keyup.enter="applySearch" />
      <el-select v-model="filters.fuel_type" placeholder="燃料类型" clearable class="f-fuel">
        <el-option v-for="f in FUEL_OPTIONS" :key="f" :label="f" :value="f" />
      </el-select>
      <el-select v-model="filters.task_type" placeholder="任务类型" clearable class="f-type">
        <el-option v-for="t in TASK_TYPES" :key="t" :label="t" :value="t" />
      </el-select>
      <el-select v-model="filters.task_status" placeholder="任务状态" clearable class="f-status">
        <el-option v-for="s in STATUS_OPTIONS" :key="s" :label="s" :value="s" />
      </el-select>
      <el-date-picker v-model="filters.dateRange" type="daterange" range-separator="→"
        start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" unlink-panels
        class="f-date" />

      <div class="filter-btns">
        <el-button type="primary" class="btn-primary" @click="applySearch">
          <el-icon>
            <Search />
          </el-icon> 搜索
        </el-button>
        <el-button class="btn-outline" @click="handleReset">
          <el-icon>
            <Refresh />
          </el-icon> 重置
        </el-button>
        <el-button class="btn-outline" @click="exportSelected">
          <el-icon>
            <Download />
          </el-icon> 导出报告
        </el-button>
      </div>
    </div>

    <!-- 次级条件：创建人 / 账号归属 -->
    <div class="filter-sub">
      <span class="sub-label">更多</span>
      <el-input v-model="filters.creator_name" placeholder="创建人" clearable class="f-person"
        @keyup.enter="applySearch" />
      <el-input v-model="filters.owner_account" placeholder="账号归属" clearable class="f-person"
        @keyup.enter="applySearch" />
    </div>

    <!-- ============================================================
         表格工具行 + 表格（两者一起进全屏，全屏里也能新建/切换密度）
         ============================================================ -->
    <div v-if="dbHint" class="sql-hint">
      <el-icon>
        <WarningFilled />
      </el-icon>
      <div class="sql-hint-text">
        <div>{{ dbHint.title }}</div>
        <div class="sql-hint-sub">
          请先在 CloudBase 控制台执行 <code>{{ dbHint.file }}</code>，再点刷新重试。
        </div>
      </div>
    </div>

    <Teleport to="body" :disabled="!isFullscreen">
      <div class="table-block" :class="{ 'is-fullscreen': isFullscreen }">
        <div class="page-head">
          <span class="head-bar"></span>
          <h2 class="head-title">能耗报告</h2>
          <span class="head-count">共 {{ total }} 条</span>

          <div class="head-tools">
            <el-button type="primary" class="btn-primary btn-new" @click="openCreate">
              <el-icon>
                <Plus />
              </el-icon> 新建
            </el-button>
            <TableTools v-model:size="tableSize" v-model:fullscreen="isFullscreen" :columns="columnConfig"
              :show-total="false" storage-key="energy_report" :refreshing="loading" @refresh="fetchList"
              @reset="resetColumns" />
          </div>
        </div>

        <div class="table-card">
        <div class="table-wrap">
          <el-table ref="tableRef" :data="tableData" v-loading="loading" border height="100%"
            :size="tableSize" class="custom-table" row-key="task_no" @selection-change="onSelectionChange"
            :default-sort="{ prop: 'create_time', order: 'descending' }" @sort-change="onSortChange">
            <el-table-column type="selection" width="44" align="center" />

            <el-table-column v-for="col in visibleColumns" :key="col.prop" :label="col.label"
              :prop="col.prop" :width="col.width || undefined" :min-width="col.width ? undefined : col.minWidth"
              :align="col.align || 'center'" :fixed="col.fixed || false"
              :sortable="col.sortable ? 'custom' : false" show-overflow-tooltip>
              <template #default="{ row }">
                <!-- 任务名称：唯一入口，点击看报告 -->
                <a v-if="col.prop === 'task_name'" class="task-link" @click.stop="openReport(row)">
                  {{ row.task_name }}
                </a>
                <span v-else-if="col.prop === 'task_no'" class="mono-text">{{ row.task_no }}</span>
                <!-- 状态：圆点 + 文字（与综合报表一致的表达） -->
                <span v-else-if="col.prop === 'task_status'" class="status-dot" :class="statusClass(row.task_status)">
                  <i></i>{{ row.task_status }}
                </span>
                <span v-else-if="col.prop === 'create_time'" class="text-content date-text">
                  {{ formatDate(row.create_time) }}
                </span>
                <span v-else-if="col.prop === 'owner_account'" class="text-muted">
                  {{ row.owner_account || '--' }}
                </span>
                <span v-else class="text-content">{{ row[col.prop] || '--' }}</span>
              </template>
            </el-table-column>

            <template #empty>
              <div class="empty-state">
                <el-icon class="empty-icon">
                  <DataLine />
                </el-icon>
                <p>暂无报告任务</p>
                <span class="empty-tip">点击右上角「新建」，选择燃料类型与任务类型后创建</span>
              </div>
            </template>
          </el-table>
        </div>

        <div class="pager">
          <el-pagination background layout="sizes, prev, pager, next, jumper" :total="total"
            :page-size="pageSize" :page-sizes="PAGE_SIZES" v-model:current-page="currentPage"
            @size-change="onSizeChange" @current-change="onPageChange" class="custom-pagination" />
        </div>

        </div>
      </div>
    </Teleport>

    <!-- ============================================================
         新建任务
         ============================================================ -->
    <el-dialog v-model="createVisible" title="任务信息 / 新增任务" width="880px" class="er-dialog" append-to-body
      :close-on-click-modal="false" @closed="resetCreateForm">
      <el-form ref="createFormRef" :model="form" :rules="rules" label-position="right" label-width="96px"
        class="create-form">
        <div class="form-grid">
          <div class="form-col">
            <el-form-item label="燃料类型" prop="fuel_type">
              <el-select v-model="form.fuel_type" placeholder="请选择" style="width: 100%" @change="onFuelChange">
                <el-option v-for="f in FUEL_OPTIONS" :key="f" :label="f" :value="f" />
              </el-select>
            </el-form-item>

            <!-- ⭐ 任务类型依赖燃料类型：没选燃料时禁用 -->
            <el-form-item label="任务类型" prop="task_type">
              <el-select v-model="form.task_type" :placeholder="form.fuel_type ? '请选择' : '请先选择燃料类型'"
                :disabled="!form.fuel_type" style="width: 100%">
                <el-option v-for="t in taskTypeOptions" :key="t" :label="t" :value="t" />
              </el-select>
            </el-form-item>

            <el-form-item label="任务名称" prop="task_name">
              <el-input v-model="form.task_name" placeholder="请输入" maxlength="40" show-word-limit />
            </el-form-item>

            <el-form-item label="周期" prop="period_type">
              <el-radio-group v-model="form.period_type">
                <el-radio value="周">周</el-radio>
                <el-radio value="月">月</el-radio>
                <el-radio value="任意">任意</el-radio>
              </el-radio-group>
            </el-form-item>
          </div>

          <div class="form-col">
            <el-form-item label="任务编号">
              <div class="task-no-box">
                <span class="mono-text">{{ form.task_no }}</span>
                <button type="button" class="regen-btn" title="重新生成" @click="form.task_no = genTaskNo()">
                  <el-icon>
                    <Refresh />
                  </el-icon>
                </button>
              </div>
            </el-form-item>

            <el-form-item label="选择日期" prop="dateRange">
              <el-date-picker v-model="form.dateRange" type="daterange" range-separator="→"
                start-placeholder="请选择日期" end-placeholder="请选择日期" value-format="YYYY-MM-DD" unlink-panels
                style="width: 100%" />
            </el-form-item>
          </div>
        </div>

        <div class="form-tip">
          <el-icon>
            <InfoFilled />
          </el-icon>
          提交后系统会按任务参数去取数并生成报告；目前取数接口尚未接入，任务会先落库为「待生成」。
        </div>
      </el-form>

      <template #footer>
        <div class="dialog-footer">
          <el-button class="btn-primary btn-submit" :loading="submitting" @click="submitForm('submit')">提交</el-button>
          <el-button class="btn-submit-export" :loading="submitting" @click="submitForm('export')">提交并导出</el-button>
          <el-button class="btn-cancel" @click="createVisible = false">取消</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Search, Plus, Download, Refresh, DataLine, WarningFilled, InfoFilled,
} from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { supabase } from '@/utils/supabase'
import TableTools from '@/components/TableTools.vue'

const router = useRouter()

// ============================================================
// 常量
// ============================================================
const FUEL_OPTIONS = ['燃油车', '燃气车', '纯电动', '氢燃料']
/* ⭐ 任务类型暂时所有燃料类型都一样（用户 2026-10-19 确认），
   后续按燃料区分时只改这里：FUEL_TASK_TYPES[fuel] */
const TASK_TYPES = ['单车分析报告', '车辆对比报告', '车队分析报告', '同车对比报告']
const STATUS_OPTIONS = ['成功', '生成中', '待生成', '失败']
const PAGE_SIZES = [20, 30, 50]

const currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('currentUser') || '{}') } catch { return {} }
})()

// ============================================================
// 筛选
// ============================================================
const emptyFilters = () => ({
  task_name: '', fuel_type: '', task_type: '', task_status: '',
  creator_name: '', owner_account: '', dateRange: [],
})
const filters = reactive(emptyFilters())
/* 查询条件与输入框分离：点「搜索」才生效，边打字不会一直打接口 */
const applied = reactive(emptyFilters())

const applySearch = () => {
  Object.assign(applied, JSON.parse(JSON.stringify(filters)))
  currentPage.value = 1
  fetchList()
}

const handleReset = () => {
  Object.assign(filters, emptyFilters())
  Object.assign(applied, emptyFilters())
  currentPage.value = 1
  fetchList()
}

// ============================================================
// 列表
// ============================================================
const tableData = ref([])
const total = ref(0)
const pageSize = ref(20)
const currentPage = ref(1)
const loading = ref(false)
const dbHint = ref(null)
const selectedRows = ref([])
const tableRef = ref(null)

const tableSize = ref('default')
const isFullscreen = ref(false)

/* 排序：只在服务端支持的字段上开，避免「只排当前页」的假排序 */
const sortState = reactive({ prop: 'create_time', order: 'descending' })

const DEFAULT_COLUMNS = [
  { prop: 'task_no', label: '任务编号', width: 180, visible: true, align: 'center', sortable: true },
  { prop: 'task_name', label: '任务名称', minWidth: 120, visible: true, align: 'center' },
  { prop: 'task_type', label: '任务类型', width: 104, visible: true, align: 'center' },
  { prop: 'fuel_type', label: '燃料类型', width: 78, visible: true, align: 'center' },
  { prop: 'task_status', label: '任务状态', width: 78, visible: true, align: 'center' },
  { prop: 'owner_account', label: '账号归属', width: 74, visible: true, align: 'center' },
  { prop: 'creator_account', label: '创建账号', width: 110, visible: true, align: 'center' },
  { prop: 'create_time', label: '创建时间', width: 100, visible: true, align: 'center', sortable: true },
]
const columnConfig = ref(JSON.parse(JSON.stringify(DEFAULT_COLUMNS)))
const visibleColumns = computed(() => columnConfig.value.filter((c) => c.visible))
const resetColumns = () => { columnConfig.value = JSON.parse(JSON.stringify(DEFAULT_COLUMNS)) }

const formatDate = (v) => (v ? dayjs(v).format('YYYY-MM-DD') : '--')
const statusClass = (s) => {
  const map = { 成功: 'ok', 生成中: 'running', 待生成: 'pending', 失败: 'fail' }
  return map[String(s || '').trim()] || 'pending'
}

const onSelectionChange = (rows) => { selectedRows.value = rows }

const onSortChange = ({ prop, order }) => {
  sortState.prop = prop || 'create_time'
  sortState.order = order || 'descending'
  currentPage.value = 1
  fetchList()
}

const fetchList = async () => {
  loading.value = true
  dbHint.value = null
  try {
    let q = supabase.from('energy_report_tasks').select('*', { count: 'exact' })

    if (applied.task_name) q = q.ilike('task_name', `%${applied.task_name}%`)
    if (applied.fuel_type) q = q.eq('fuel_type', applied.fuel_type)
    if (applied.task_type) q = q.eq('task_type', applied.task_type)
    if (applied.task_status) q = q.eq('task_status', applied.task_status)
    if (applied.creator_name) q = q.ilike('creator_name', `%${applied.creator_name}%`)
    if (applied.owner_account) q = q.ilike('owner_account', `%${applied.owner_account}%`)
    if (Array.isArray(applied.dateRange) && applied.dateRange.length === 2) {
      q = q.gte('create_time', applied.dateRange[0]).lt('create_time', `${applied.dateRange[1]} 23:59:59`)
    }

    q = q.order(sortState.prop, { ascending: sortState.order === 'ascending' })
      .range((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value - 1)

    const { data, error, count } = await q
    if (error) throw error

    tableData.value = data || []
    total.value = count || 0
  } catch (e) {
    const msg = String(e?.message || e || '')
    console.warn('[能耗报告] 加载失败', e)
    tableData.value = []
    total.value = 0
    if (/permission|denied|401|403/i.test(msg)) {
      dbHint.value = { title: '能耗报告表没有读写权限', file: 'sql/2026-10-19_energy_report.sql' }
    } else {
      dbHint.value = { title: '能耗报告表读取失败（多半是还没建表）', file: 'sql/2026-10-19_energy_report.sql' }
    }
  } finally {
    loading.value = false
  }
}

const onSizeChange = (v) => { pageSize.value = v; currentPage.value = 1; fetchList() }
const onPageChange = (v) => { currentPage.value = v; fetchList() }

const openReport = (row) => {
  router.push({ path: '/operation/energy/report', query: { task_no: row.task_no } })
}

// ============================================================
// 导出报告（选中任务的车辆明细 → CSV）
// ============================================================
const exportSelected = () => {
  const row = selectedRows.value[0]
  if (!row) { ElMessage.warning('请先勾选一条任务'); return }
  const cars = row.report_data?.quadrant
  if (!Array.isArray(cars) || !cars.length) {
    ElMessage.warning('这条任务还没有报告数据（接口未接入），暂时无法导出')
    return
  }
  const head = ['底盘号', '出勤率', '月里程(km)', '百公里电耗(kWh/100km)', '耗电量(MWh)']
  const lines = [head.join(',')].concat(
    cars.map((c) => [c.name, c.attendance, c.mileage, c.kiloil, c.fuel].join(','))
  )
  const blob = new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${row.task_name}_${row.task_no}_车辆明细.csv`
  a.click()
  URL.revokeObjectURL(a.href)
  ElMessage.success('已导出车辆明细')
}

// ============================================================
// 新建
// ============================================================
const createVisible = ref(false)
const submitting = ref(false)
const createFormRef = ref(null)

const emptyForm = () => ({
  fuel_type: '', task_type: '', task_name: '', period_type: '月',
  task_no: '', dateRange: [],
})
const form = reactive(emptyForm())

const taskTypeOptions = computed(() => (form.fuel_type ? TASK_TYPES : []))

const rules = {
  fuel_type: [{ required: true, message: '请选择燃料类型', trigger: 'change' }],
  task_type: [{ required: true, message: '请选择任务类型', trigger: 'change' }],
  task_name: [{ required: true, message: '请输入任务名称', trigger: 'blur' }],
  dateRange: [{ required: true, message: '请选择日期范围', trigger: 'change' }],
}

/* 任务编号：yyyyMMddHHmmss + 4 位随机小写字母数字（好记、能看出是哪天建的） */
const genTaskNo = () => {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  let tail = ''
  for (let i = 0; i < 4; i += 1) tail += chars[Math.floor(Math.random() * chars.length)]
  return dayjs().format('YYYYMMDDHHmmss') + tail
}

const onFuelChange = () => {
  form.task_type = ''
}

const openCreate = () => {
  Object.assign(form, emptyForm())
  form.task_no = genTaskNo()
  createVisible.value = true
}

const resetCreateForm = () => {
  Object.assign(form, emptyForm())
  createFormRef.value?.clearValidate()
}

const submitForm = async (mode) => {
  const ok = await createFormRef.value?.validate().catch(() => false)
  if (!ok) return

  submitting.value = true
  try {
    const [start, end] = form.dateRange || []
    const payload = {
      task_no: form.task_no,
      task_name: form.task_name.trim(),
      fuel_type: form.fuel_type,
      task_type: form.task_type,
      task_status: '待生成',
      period_type: form.period_type,
      period_start: start || null,
      period_end: end || null,
      creator_name: currentUser.name || currentUser.nickName || '当前用户',
      creator_account: currentUser.phone || currentUser.account || currentUser.username || '--',
      report_data: null,
    }
    const { error } = await supabase.from('energy_report_tasks').insert(payload)
    if (error) throw error

    ElMessage.success({
      message: mode === 'export'
        ? '任务已创建；取数接口接入后可直接导出报告'
        : '任务已创建，报告数据待接口接入后生成',
      duration: 2600,
    })
    createVisible.value = false
    currentPage.value = 1
    fetchList()
  } catch (e) {
    ElMessage.error('创建失败：' + (e?.message || e))
  } finally {
    submitting.value = false
  }
}

onMounted(fetchList)
</script>

<style scoped>
/* ============================================================
   版式对齐「综合报表 · 明细表」：标题行 + 一行筛选 + 白卡表格
   ============================================================ */
.energy-report-page {
  --num-font: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue',
    'PingFang SC', 'HarmonyOS Sans SC', 'Source Han Sans SC', 'Microsoft YaHei', Arial, sans-serif;
  height: calc(100vh - 101px);
  padding: 14px 18px 16px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #F5F7FA;
  font-size: 13px;
  color: #1E293B;
  overflow: hidden;
}

/* ========== 表格工具行 ========== */
.page-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 32px;
  padding: 0 4px;
  margin-top: -2px;
  margin-bottom: -2px;
}

.head-bar {
  width: 4px;
  height: 16px;
  border-radius: 2px;
  background: linear-gradient(180deg, var(--brand-primary), var(--brand-primary));
  flex: 0 0 auto;
}

.head-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: .2px;
  white-space: nowrap;
}

.head-count {
  font-size: 12.5px;
  color: #94A3B8;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.head-tools {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.btn-new {
  height: 32px;
  border-radius: 8px;
  padding: 0 14px;
  font-weight: 600;
}

/* TableTools 在标题行里不要额外留白 */
.head-tools :deep(.table-tools) { min-height: 32px; }

/* ========== 筛选条 ========== */
.filter-row {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.filter-row :deep(.el-input),
.filter-row :deep(.el-select),
.filter-row :deep(.el-date-editor) {
  flex: 0 0 auto;
}

.f-name { width: 132px; }
.f-fuel { width: 110px; }
.f-type { width: 130px; }
.f-status { width: 110px; }
.f-date { width: 208px; }
.f-person { width: 132px; }

.filter-sub {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: -4px;
}

.sub-label {
  font-size: 12px;
  color: #94A3B8;
  letter-spacing: .5px;
}

.filter-row :deep(.el-input__wrapper),
.filter-row :deep(.el-select__wrapper),
.filter-sub :deep(.el-input__wrapper) {
  height: 32px;
  min-height: 32px;
  border-radius: 8px;
  box-shadow: 0 0 0 1px #E4EAF1 inset;
  background: #fff;
}

.filter-row :deep(.el-input__wrapper:hover),
.filter-row :deep(.el-select__wrapper:hover),
.filter-row :deep(.el-date-editor:hover .el-input__wrapper),
.filter-sub :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #F3B4BE inset;
}

.filter-row :deep(.el-input__inner),
.filter-row :deep(.el-select__placeholder),
.filter-sub :deep(.el-input__inner) {
  font-size: 12.5px;
  color: #475569;
}

.filter-btns {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 2px;
}

.btn-primary {
  height: 32px;
  border-radius: 8px;
  padding: 0 14px;
  background: var(--brand-primary);
  border-color: var(--brand-primary);
  font-weight: 600;
}

.btn-primary:hover {
  background: #a80d26;
  border-color: #a80d26;
}

.btn-outline {
  height: 32px;
  border-radius: 8px;
  padding: 0 12px;
  border-color: #E4EAF1;
  color: #475569;
  background: #fff;
  font-weight: 500;
}

.btn-outline:hover {
  border-color: #F3B4BE;
  color: var(--brand-primary);
  background: var(--brand-primary-light);
}

.btn-outline.is-disabled,
.btn-outline.is-disabled:hover {
  color: #C0CCD8;
  border-color: #EDF1F6;
  background: #FAFBFC;
}

/* ========== 提示条 ========== */
.sql-hint {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #FFFBEB;
  border: 1px solid #FDE68A;
  color: #92400E;
  font-size: 12.5px;
}

.sql-hint-text code {
  font-family: var(--num-font);
  background: #FEF3C7;
  padding: 0 4px;
  border-radius: 4px;
}

.sql-hint-sub { color: #B45309; margin-top: 2px; }

/* ========== 表格区（工具行 + 卡片，一起进全屏） ========== */
.table-block {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.table-block.is-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 9999;
  padding: 14px 18px 12px;
  background: #F5F7FA;
  animation: fs-fade-in .25s ease;
}

/* ========== 表格卡片 ========== */
.table-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 10px;
  border: 1px solid #EDF1F6;
  box-shadow: 0 1px 3px rgba(15, 41, 66, .04);
  padding: 2px 2px 10px;
  overflow: hidden;
}

@keyframes fs-fade-in {
  from { opacity: 0; transform: scale(.996); }
  to { opacity: 1; transform: scale(1); }
}

.table-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.custom-table {
  font-size: 12.5px;
  -webkit-font-smoothing: antialiased;
}

/* 表头：与综合报表一致，浅灰底 + 深色粗体 */
:deep(.custom-table th.el-table__cell) {
  background: #F7F9FC !important;
  color: #0F172A;
  font-weight: 700;
  font-size: 12.5px;
  border-bottom: 1px solid #E8EEF5;
  padding: 11px 0;
}

:deep(.custom-table td.el-table__cell) {
  color: #1E293B;
  font-size: 12.5px;
  font-weight: 500;
  border-bottom: 1px solid #F2F6FA;
  padding: 13px 0;
}

:deep(.custom-table.el-table--large td.el-table__cell) { padding: 17px 0; }
:deep(.custom-table.el-table--default td.el-table__cell) { padding: 13px 0; }
:deep(.custom-table.el-table--small td.el-table__cell) { padding: 6px 0; }

:deep(.custom-table .el-table__row:hover td) {
  background: #F8FAFC !important;
}

:deep(.custom-table .el-table__inner-wrapper::before) { display: none; }

/* 单元格左右内边距收窄到 10px：9 列合计能多留 36px，防止窄屏把文字挤成省略号 */
:deep(.custom-table .cell) {
  padding-left: 10px;
  padding-right: 10px;
}

/* 排序箭头稍微收一点，别抢表头 */
:deep(.custom-table .caret-wrapper) { transform: scale(.9); }

.mono-text {
  font-family: var(--num-font);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
  color: #475569;
}

.text-content { color: #334155; }

/* 日期用等宽数字，避免 0/1 宽度不同导致个别行被截 */
.date-text { font-variant-numeric: tabular-nums; }
.text-muted { color: #B6C2CE; }

.task-link {
  /* 与客户档案的附件链接同色：表格里的可点文字统一用这个蓝 */
  color: #0369A1;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
}

.task-link:hover {
  color: #075985;
  text-decoration: underline;
  text-underline-offset: 3px;
}

/* 状态：圆点 + 文字 */
.status-dot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
}

.status-dot i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px rgba(148, 163, 184, .14);
  flex: 0 0 auto;
}

.status-dot.ok { color: #15803D; }
.status-dot.ok i { box-shadow: 0 0 0 3px rgba(34, 197, 94, .16); }
.status-dot.running { color: #1D4ED8; }
.status-dot.running i { box-shadow: 0 0 0 3px rgba(59, 130, 246, .16); }
.status-dot.pending { color: #B45309; }
.status-dot.pending i { box-shadow: 0 0 0 3px rgba(245, 158, 11, .16); }
.status-dot.fail { color: #B91C1C; }
.status-dot.fail i { box-shadow: 0 0 0 3px rgba(239, 68, 68, .16); }

/* 空态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 48px 0;
  color: #94A3B8;
}

.empty-icon { font-size: 30px; color: #CBD5E1; }
.empty-state p { margin: 0; font-size: 13px; color: #64748B; }
.empty-tip { font-size: 12px; color: #94A3B8; }

/* ========== 分页 ========== */
.pager {
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  padding: 10px 12px 2px;
}

:deep(.custom-pagination .el-pager li.is-active) {
  background: var(--brand-primary) !important;
  color: #fff;
}

:deep(.custom-pagination .el-select__wrapper) {
  border-radius: 8px;
  box-shadow: 0 0 0 1px #E4EAF1 inset;
}

/* ========== 新建弹窗 ========== */
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px 28px;
}

.form-col { min-width: 0; }

.create-form :deep(.el-form-item) { margin-bottom: 18px; }

.create-form :deep(.el-form-item__label) {
  font-size: 12.5px;
  color: #475569;
}

.task-no-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid #E2E8F0;
  border-radius: 6px;
  background: #F8FAFC;
  box-sizing: border-box;
}

.task-no-box .mono-text {
  font-size: 13px;
  color: #0F172A;
  letter-spacing: .4px;
}

.regen-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: #94A3B8;
  cursor: pointer;
  transition: all .16s;
}

.regen-btn:hover { color: var(--brand-primary); background: var(--brand-primary-light); }

.form-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  padding: 8px 12px;
  border-radius: 8px;
  background: #F8FAFC;
  border: 1px dashed #E2E8F0;
  font-size: 12px;
  color: #94A3B8;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-submit {
  min-width: 96px;
  background: var(--brand-primary);
  border-color: var(--brand-primary);
  font-weight: 600;
}

.btn-submit-export {
  min-width: 112px;
  background: #FDF2E9;
  border-color: #F5C48A;
  color: #B45309;
  font-weight: 600;
}

.btn-submit-export:hover {
  background: #FBE6D2;
  border-color: #E8A857;
  color: #92400E;
}

.btn-cancel {
  min-width: 96px;
  background: #EEF2F7;
  border-color: #DDE3EC;
  color: #64748B;
}

</style>

<style>
/* 弹窗挂到 body 后脱离 scoped，只能写全局 */
.er-dialog.el-dialog {
  border-radius: 12px;
  padding: 0;
  overflow: hidden;
}

.er-dialog .el-dialog__header {
  padding: 16px 22px;
  margin: 0;
  border-bottom: 1px solid #EEF2F7;
}

.er-dialog .el-dialog__title {
  font-size: 14.5px;
  font-weight: 700;
  color: #0F172A;
}

.er-dialog .el-dialog__body { padding: 22px 22px 8px; }

.er-dialog .el-dialog__footer {
  padding: 12px 22px 18px;
  border-top: 1px solid #F1F5F9;
}
</style>
