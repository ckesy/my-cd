<template>
  <div class="waybill-page">
    <!-- 统计标签 -->
    <div class="stats-tabs">
      <span
        v-for="(item, index) in stats"
        :key="index"
        class="stat-item"
        :class="{ active: item.active }"
        @click="setActive(index)"
      >
        {{ item.label }}（{{ item.count }}）
      </span>
    </div>

    <!-- 搜索筛选区域 -->
    <div class="search-bar">
      <div class="search-row">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          size="small"
          value-format="YYYY-MM-DD"
          class="date-picker"
          unlink-panels
        />
        <el-select v-model="searchForm.org" placeholder="请选择所属机构" size="small" class="search-select">
          <el-option label="机构A" value="A" />
          <el-option label="机构B" value="B" />
        </el-select>
        <el-select v-model="searchForm.source" placeholder="请选择运单来源" size="small" class="search-select">
          <el-option label="来源1" value="1" />
          <el-option label="来源2" value="2" />
        </el-select>
        <el-input v-model="searchForm.waybillNo" placeholder="请输入运单编号" size="small" class="search-input" clearable />
        <el-input v-model="searchForm.receiveNo" placeholder="请输入接单编号" size="small" class="search-input" clearable />
        <el-input v-model="searchForm.plate" placeholder="请输入车牌号码" size="small" class="search-input" clearable />
        <el-input v-model="searchForm.driver" placeholder="请输入司机姓名" size="small" class="search-input" clearable />

        <div class="btn-group">
          <el-button size="small" class="action-btn" @click="handleSearch">搜索</el-button>
          <el-button size="small" class="action-btn" @click="handleReset">重置</el-button>
          <el-button size="small" class="action-btn">导出</el-button>
          <el-button size="small" class="action-btn create-btn" @click="router.push('/waybill/create')">＋ 新建</el-button>
        </div>
      </div>
    </div>

    <!-- 表格（支持滚动） -->
    <div class="table-wrapper">
      <el-table
        :data="tableData"
        border
        stripe
        size="small"
        row-key="waybill_no"
        :row-class-name="getRowClassName"
        @expand-change="handleExpandChange"
        max-height="calc(100vh - 360px)"
      >
        <!-- 展开列 -->
        <el-table-column type="expand" width="50">
          <template #default="{ row }">
            <div v-if="getTotalItems(row.assignments) > 1" class="expand-content">
              <div class="sub-row-wrapper" style="padding-left: 50px; overflow: hidden; width: 100%;">
                <div
                  v-for="(item, idx) in flattenAssignments(row.assignments)"
                  :key="idx"
                  class="sub-row"
                >
                  <span class="sub-cell" style="width: 220px; flex-shrink: 0; text-align: center;">--</span>
                  <span class="sub-cell" style="width: 90px; flex-shrink: 0; text-align: center;">--</span>
                  <span class="sub-cell" style="width: 100px; flex-shrink: 0; text-align: center;">--</span>
                  <span class="sub-cell" style="width: 100px; flex-shrink: 0; text-align: center;">--</span>
                  <span class="sub-cell" style="width: 120px; flex-shrink: 0; text-align: center;">--</span>
                  <span class="sub-cell" style="width: 120px; flex-shrink: 0; text-align: center;">--</span>
                  <span class="sub-cell" style="width: 90px; flex-shrink: 0; text-align: center;">--</span>
                  <span class="sub-cell" style="width: 90px; flex-shrink: 0; text-align: center;">--</span>
                  <span class="sub-cell" style="width: 70px; flex-shrink: 0; text-align: center;">--</span>
                  <span class="sub-cell" style="width: 100px; flex-shrink: 0; text-align: center; font-weight: 500;">
                    <span v-if="item.method === 'vehicle'">{{ item.target }}</span>
                    <span v-else style="color: #999;">--</span>
                  </span>
                  <span class="sub-cell" style="width: 90px; flex-shrink: 0; text-align: center; font-weight: 500;">
                    <span v-if="item.method === 'driver'">{{ item.target }}</span>
                    <span v-else style="color: #999;">--</span>
                  </span>
                  <span class="sub-cell" style="width: 90px; flex-shrink: 0; text-align: center; font-weight: 500;">
                    {{ item.carryQuantity }}
                  </span>
                  <span class="sub-cell" style="width: 110px; flex-shrink: 0; text-align: center;">--</span>
                  <span class="sub-cell" style="width: 90px; flex-shrink: 0; text-align: center;">--</span>
                  <span class="sub-cell" style="width: 140px; flex-shrink: 0; text-align: center;">--</span>
                  <span class="sub-cell" style="width: 80px; flex-shrink: 0; text-align: center;">--</span>
                </div>
              </div>
            </div>
            <div v-else style="padding: 12px 16px; color: #999; font-size: 13px; text-align: center;">
              （单一指派，无详情）
            </div>
          </template>
        </el-table-column>

        <el-table-column label="运单编号 / 任务名称" width="220" align="center" fixed="left">
          <template #default="{ row }">
            <div>
              <div style="font-weight: 600;">{{ row.waybill_no }}</div>
              <div style="font-size: 12px; color: #666;">{{ row.task_name || '未命名任务' }}</div>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="status" label="物流状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="pickup" label="装货地" width="100" align="center" />
        <el-table-column prop="delivery" label="卸货地" width="100" align="center" />

        <el-table-column label="计划装货时间" width="120" align="center">
          <template #default="{ row }">
            {{ row.pickup_time ? new Date(row.pickup_time).toLocaleString() : '未设置' }}
          </template>
        </el-table-column>

        <el-table-column label="计划送达时间" width="120" align="center">
          <template #default="{ row }">
            {{ row.plan_time ? new Date(row.plan_time).toLocaleString() : '未设置' }}
          </template>
        </el-table-column>

        <el-table-column prop="cargo" label="货物名称" width="90" align="center" />
        <el-table-column label="货物数量" width="90" align="center">
          <template #default="{ row }">
            {{ row.quantity || 0 }}
          </template>
        </el-table-column>
        <el-table-column label="运费" width="70" align="center">
          <template #default="{ row }">
            {{ row.freight || 0 }}
          </template>
        </el-table-column>

        <el-table-column label="承运车辆" width="100" align="center">
          <template #default="{ row }">
            <span v-if="getVehicleList(row.assignments).length === 1">
              {{ getVehicleList(row.assignments)[0] }}
            </span>
            <span v-else-if="getVehicleList(row.assignments).length > 1">
              {{ getVehicleList(row.assignments).length }}辆
            </span>
            <span v-else>--</span>
          </template>
        </el-table-column>

        <el-table-column label="承运司机" width="90" align="center">
          <template #default="{ row }">
            <span v-if="getDriverList(row.assignments).length === 1">
              {{ getDriverList(row.assignments)[0] }}
            </span>
            <span v-else-if="getDriverList(row.assignments).length > 1">
              {{ getDriverList(row.assignments).length }}人
            </span>
            <span v-else>--</span>
          </template>
        </el-table-column>

        <el-table-column label="承运数量" width="90" align="center">
          <template #default="{ row }">
            {{ getTotalCarryQuantity(row.assignments) }}
          </template>
        </el-table-column>

        <el-table-column prop="receive_no" label="接单编号" width="110" align="center" />
        <el-table-column prop="source" label="运单来源" width="90" align="center" />
        <el-table-column prop="create_time" label="创建运单时间" width="140" align="center">
          <template #default="{ row }">
            {{ new Date(row.create_time).toLocaleString() }}
          </template>
        </el-table-column>

        <el-table-column label="操作" fixed="right" width="80" align="center">
          <template #default="{ row }">
            <div class="action-buttons">
              <el-button type="text" size="small" style="color: #409eff; padding: 0;" @click="handleView(row)">
                查看
              </el-button>
              <el-button type="text" size="small" style="color: #c8102e; padding: 0;" @click="handleDelete(row)">
                删除
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 分页 -->
    <div class="pagination-wrapper">
      <span class="total">共 {{ total }} 条</span>
      <el-pagination
        background
        layout="sizes, prev, pager, next"
        :total="total"
        :page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
      />
      <span class="goto">
        前往
        <el-input-number
          v-model="gotoPage"
          :min="1"
          :max="Math.max(1, totalPages)"
          size="small"
          controls-position="right"
          @change="handleGotoPage"
        />
        页
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { supabase } from '@/utils/supabase'

const router = useRouter()

// ---------- 统计标签 ----------
const stats = ref([
  { label: '全部', count: 0, active: true },
  { label: '待接单', count: 0, active: false },
  { label: '待装车', count: 0, active: false },
  { label: '装车中', count: 0, active: false },
  { label: '装车完成', count: 0, active: false },
  { label: '已发车', count: 0, active: false },
  { label: '已完成', count: 0, active: false },
  { label: '已取消', count: 0, active: false },
])

const setActive = (index) => {
  stats.value.forEach((item, i) => { item.active = i === index })
  fetchData()
}

// ---------- 搜索表单 ----------
const searchForm = reactive({
  org: '',
  source: '',
  waybillNo: '',
  receiveNo: '',
  plate: '',
  driver: '',
})
const dateRange = ref([])

// ---------- 表格数据 ----------
const tableData = ref([])
const total = ref(0)
const pageSize = ref(10)
const currentPage = ref(1)
const gotoPage = ref(1)

const totalPages = computed(() => Math.ceil(total.value / pageSize.value) || 1)

// ---------- 辅助函数 ----------
const getTotalItems = (assignments) => {
  if (!assignments || !Array.isArray(assignments)) return 0
  let count = 0
  assignments.forEach(a => {
    if (a.items && Array.isArray(a.items)) {
      count += a.items.length
    }
  })
  return count
}

const flattenAssignments = (assignments) => {
  if (!assignments || !Array.isArray(assignments)) return []
  const result = []
  assignments.forEach(a => {
    const method = a.method || 'driver'
    const items = a.items || []
    items.forEach(item => {
      result.push({
        method,
        target: item.target || '未指定',
        carryQuantity: item.carryQuantity || 0,
        carryFreight: item.carryFreight || 0,
      })
    })
  })
  return result
}

const getVehicleList = (assignments) => {
  if (!assignments || !Array.isArray(assignments)) return []
  const list = []
  assignments.forEach(a => {
    if (a.method === 'vehicle' && a.items) {
      a.items.forEach(item => {
        if (item.target) list.push(item.target)
      })
    }
  })
  return list
}

const getDriverList = (assignments) => {
  if (!assignments || !Array.isArray(assignments)) return []
  const list = []
  assignments.forEach(a => {
    if (a.method === 'driver' && a.items) {
      a.items.forEach(item => {
        if (item.target) list.push(item.target)
      })
    }
  })
  return list
}

const getTotalCarryQuantity = (assignments) => {
  if (!assignments || !Array.isArray(assignments)) return 0
  let total = 0
  assignments.forEach(a => {
    if (a.items) {
      a.items.forEach(item => {
        total += (item.carryQuantity || 0)
      })
    }
  })
  return total
}

// ---------- 展开控制 ----------
const getRowClassName = ({ row }) => {
  if (getTotalItems(row.assignments) > 1) {
    return 'has-multiple-assign'
  }
  return ''
}

const handleExpandChange = (row, expandedRows) => {
  // 可选
}

// ---------- 数据获取 ----------
const fetchData = async () => {
  try {
    let query = supabase
      .from('waybills')
      .select('*', { count: 'exact' })
      .order('create_time', { ascending: false })
      .range((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value - 1)

    if (searchForm.waybillNo) {
      query = query.ilike('waybill_no', '%' + searchForm.waybillNo + '%')
    }
    if (searchForm.receiveNo) {
      query = query.ilike('receive_no', '%' + searchForm.receiveNo + '%')
    }
    if (searchForm.plate) {
      query = query.ilike('vehicle', '%' + searchForm.plate + '%')
    }
    if (searchForm.driver) {
      query = query.ilike('driver', '%' + searchForm.driver + '%')
    }
    if (searchForm.source) {
      query = query.eq('source', searchForm.source)
    }
    if (dateRange.value && dateRange.value.length === 2) {
      const start = dateRange.value[0]
      const end = dateRange.value[1]
      query = query.gte('create_time', start).lt('create_time', end + ' 23:59:59')
    }
    const activeStat = stats.value.find(s => s.active)
    if (activeStat && activeStat.label !== '全部') {
      query = query.eq('status', activeStat.label)
    }

    const { data, count, error } = await query
    if (error) throw error

    tableData.value = data || []
    total.value = count || 0
    updateStats()
  } catch (err) {
    console.error('加载数据失败', err)
    ElMessage.error('加载数据失败：' + err.message)
  }
}

// ---------- 更新统计 ----------
const updateStats = async () => {
  try {
    const { count: all } = await supabase.from('waybills').select('*', { count: 'exact', head: true })
    const statuses = ['待接单', '待装车', '装车中', '装车完成', '已发车', '已完成', '已取消']
    const counts = {}
    for (const s of statuses) {
      const { count } = await supabase.from('waybills').select('*', { count: 'exact', head: true }).eq('status', s)
      counts[s] = count || 0
    }
    stats.value[0].count = all || 0
    stats.value[1].count = counts['待接单'] || 0
    stats.value[2].count = counts['待装车'] || 0
    stats.value[3].count = counts['装车中'] || 0
    stats.value[4].count = counts['装车完成'] || 0
    stats.value[5].count = counts['已发车'] || 0
    stats.value[6].count = counts['已完成'] || 0
    stats.value[7].count = counts['已取消'] || 0
  } catch (e) {
    console.warn('更新统计失败', e)
  }
}

// ---------- 状态标签颜色 ----------
const statusTagType = (status) => {
  const map = {
    '待接单': 'info',
    '待装车': 'warning',
    '装车中': 'primary',
    '装车完成': 'success',
    '已发车': 'success',
    '已完成': 'success',
    '已取消': 'danger',
  }
  return map[status] || 'info'
}

// ---------- 搜索和重置 ----------
const handleSearch = () => {
  currentPage.value = 1
  fetchData()
}
const handleReset = () => {
  searchForm.org = ''
  searchForm.source = ''
  searchForm.waybillNo = ''
  searchForm.receiveNo = ''
  searchForm.plate = ''
  searchForm.driver = ''
  dateRange.value = []
  currentPage.value = 1
  fetchData()
}

// ---------- 分页 ----------
const handleSizeChange = (val) => {
  pageSize.value = val
  currentPage.value = 1
  fetchData()
}
const handleCurrentChange = (val) => {
  currentPage.value = val
  gotoPage.value = val
  fetchData()
}
const handleGotoPage = (val) => {
  if (val >= 1 && val <= totalPages.value) {
    currentPage.value = val
    fetchData()
  }
}

// ---------- 查看 ----------
const handleView = (row) => {
  router.push({
    path: '/waybill/detail',
    query: { waybill_no: row.waybill_no }
  })
}

// ---------- 删除 ----------
const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm('确定删除运单 ' + row.waybill_no + ' 吗？', '提示', { type: 'warning' })
    const { error } = await supabase.from('waybills').delete().eq('id', row.id)
    if (error) throw error
    ElMessage.success('删除成功')
    fetchData()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error('删除失败：' + err.message)
    }
  }
}

// ---------- 生命周期 ----------
onMounted(() => {
  fetchData()
})

watch(
  [() => searchForm.waybillNo, () => searchForm.receiveNo, () => searchForm.plate, () => searchForm.driver, () => searchForm.source, dateRange],
  () => {}
)
</script>

<style scoped>
.waybill-page {
  padding: 8px 0;
  background: #ffffff;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.stats-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  padding: 8px 16px;
  border-bottom: 1px solid #e8e8e8;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.stat-item {
  font-size: 13px;
  color: #555;
  cursor: pointer;
  padding: 4px 0;
  border-bottom: 2px solid transparent;
  transition: color 0.2s, border-color 0.2s;
  white-space: nowrap;
}
.stat-item:hover {
  color: #c8102e;
}
.stat-item.active {
  color: #c8102e;
  border-bottom-color: #c8102e;
  font-weight: 600;
}

.search-bar {
  padding: 0 16px 12px;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
}
.search-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.date-picker {
  width: 200px;
}
.date-picker :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #c8102e inset !important;
}
.search-select {
  width: 140px;
}
.search-input {
  width: 140px;
}
.btn-group {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  flex-shrink: 0;
  margin-right: auto;
}
.action-btn {
  border-color: #c8102e;
  color: #c8102e;
  background-color: transparent;
}
.action-btn:hover {
  background-color: #c8102e;
  color: #ffffff;
}
.create-btn {
  border-color: #c8102e;
  color: #c8102e;
  background-color: transparent;
}
.create-btn:hover {
  background-color: #c8102e;
  color: #ffffff;
}

.table-wrapper {
  padding: 0 16px;
  margin-top: 4px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

:deep(.el-table th.el-table__cell) {
  background-color: #c8102e !important;
  color: #ffffff !important;
  font-weight: 600;
  text-align: center !important;
}
:deep(.el-table .cell) {
  font-size: 12px;
  text-align: center !important;
}
:deep(.el-table__body tr) {
  background-color: #fef0f0;
}
:deep(.el-table__body tr.el-table__row--striped) {
  background-color: #fce4e4;
}
:deep(.el-table__body tr:hover) {
  background-color: #f8d0d0 !important;
}
:deep(.el-table__body tr.el-table__row--expanded) {
  background-color: #e8b4b4 !important;
}
:deep(.el-table__body tr.el-table__row--expanded + .el-table__expanded-row) {
  background-color: #e8b4b4 !important;
}
:deep(.el-table__body tr.el-table__row--expanded + .el-table__expanded-row .sub-row) {
  background-color: #e8b4b4 !important;
}

:deep(.el-table__row:not(.has-multiple-assign) .el-table__expand-icon) {
  display: none !important;
}

.expand-content {
  padding: 4px 0;
  background-color: #f5faff;
}
.sub-row-wrapper {
  overflow: hidden !important;
  width: 100%;
}
.sub-row {
  display: flex;
  align-items: center;
  border-bottom: 1px dashed #d0dce8;
  padding: 4px 0;
  min-height: 32px;
  background-color: #f5faff;
}
.sub-row:last-child {
  border-bottom: none;
}
.sub-cell {
  display: inline-block;
  padding: 0 4px;
  font-size: 12px;
  color: #555;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-sizing: border-box;
  flex-shrink: 0;
  text-align: center;
}
.sub-cell span {
  display: inline-block;
  width: 100%;
}
:deep(.el-table__expanded-cell) {
  padding: 0 !important;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 4px;
  height: 100%;
  min-height: 50px;
}
.action-buttons .el-button {
  margin: 0;
  line-height: 1.5;
  height: auto;
  padding: 2px 0;
}

.pagination-wrapper {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  padding: 12px 16px;
  border-top: 1px solid #f0f0f0;
  margin-top: 4px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.total {
  font-size: 13px;
  color: #555;
  margin-right: auto;
}
.goto {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #555;
}
.goto .el-input-number {
  width: 70px;
}
:deep(.el-pagination .btn-prev),
:deep(.el-pagination .btn-next) {
  color: #333;
}
:deep(.el-pagination .el-pager li.active) {
  background-color: #c8102e !important;
  color: #ffffff !important;
}
:deep(.el-pagination .el-pager li.active:hover) {
  background-color: #c8102e !important;
  color: #ffffff !important;
}
:deep(.el-pagination .el-pager li:hover) {
  color: #c8102e;
}
</style>