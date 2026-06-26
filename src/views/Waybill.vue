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
        <!-- 日期选择框 -->
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

        <!-- 四个按钮统一风格，左对齐 -->
        <div class="btn-group">
          <el-button size="small" class="action-btn">搜索</el-button>
          <el-button size="small" class="action-btn">重置</el-button>
          <el-button size="small" class="action-btn">导出</el-button>
          <el-button size="small" class="action-btn create-btn" @click="router.push('/waybill/create')">＋ 新建</el-button>
        </div>
      </div>
    </div>

    <!-- 表格 -->
    <div class="table-wrapper">
      <el-table :data="tableData" border stripe style="width: 100%;" size="small">
        <el-table-column prop="waybillNo" label="运单编号" min-width="120" />
        <el-table-column prop="status" label="物流状态" min-width="90">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="pickup" label="装货地" min-width="100" />
        <el-table-column prop="delivery" label="卸货地" min-width="100" />
        <el-table-column prop="cargo" label="货物名称" min-width="90" />
        <el-table-column prop="remaining" label="剩余货物" min-width="90" />
        <el-table-column prop="quantity" label="数量" min-width="70" />
        <el-table-column prop="vehicle" label="承运车辆" min-width="100" />
        <el-table-column prop="driver" label="承运司机" min-width="90" />
        <el-table-column prop="carryQuantity" label="承运数量" min-width="90" />
        <el-table-column prop="receiveNo" label="接单编号" min-width="110" />
        <el-table-column prop="planTime" label="计划送达时间" min-width="120" />
        <el-table-column prop="source" label="运单来源" min-width="90" />
        <el-table-column prop="createTime" label="创建运单时间" min-width="140" />
        <el-table-column label="操作" fixed="right" width="120">
          <template #default>
            <el-button type="text" size="small" style="color: #c8102e;">编辑</el-button>
            <el-button type="text" size="small" style="color: #c8102e;">删除</el-button>
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
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'

// 统计标签数据
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
const router = useRouter()

// 点击统计标签切换高亮
const setActive = (index) => {
  stats.value.forEach((item, i) => {
    item.active = i === index
  })
}

// 搜索表单
const searchForm = reactive({
  org: '',
  source: '',
  waybillNo: '',
  receiveNo: '',
  plate: '',
  driver: '',
})

// 日期范围
const dateRange = ref([])

// 表格数据（暂时为空）
const tableData = ref([])

// 分页
const total = ref(0)
const pageSize = ref(10)
const currentPage = ref(1)
const gotoPage = ref(1)

const totalPages = computed(() => Math.ceil(total.value / pageSize.value) || 1)

const handleSizeChange = (val) => {
  pageSize.value = val
  // 此处可调用接口获取数据
}

const handleCurrentChange = (val) => {
  currentPage.value = val
  gotoPage.value = val
  // 此处可调用接口获取数据
}

const handleGotoPage = (val) => {
  if (val >= 1 && val <= totalPages.value) {
    currentPage.value = val
    // 此处可调用接口获取数据
  }
}

// 状态标签颜色
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
</script>

<style scoped>
.waybill-page {
  padding: 8px 0;
  background: #ffffff;
  height: 100%;
  overflow-y: auto;
}

/* 统计标签 */
.stats-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  padding: 8px 16px;
  border-bottom: 1px solid #e8e8e8;
  margin-bottom: 12px;
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

/* 搜索栏 */
.search-bar {
  padding: 0 16px 12px;
  border-bottom: 1px solid #f0f0f0;
}
.search-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

/* 日期选择框 - 聚焦时边框变红 */
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

/* 按钮组：左对齐，强制一行 */
.btn-group {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  flex-shrink: 0;
  margin-right: auto;  /* 左对齐 */
}

/* 统一按钮样式：红框红字，悬停红底白字 */
.action-btn {
  border-color: #c8102e;
  color: #c8102e;
  background-color: transparent;
}
.action-btn:hover {
  background-color: #c8102e;
  color: #ffffff;
}

/* 新建按钮保持同样的样式（因为上面已经继承，但为了明确可保留） */
.create-btn {
  border-color: #c8102e;
  color: #c8102e;
  background-color: transparent;
}
.create-btn:hover {
  background-color: #c8102e;
  color: #ffffff;
}

/* 表格 */
.table-wrapper {
  padding: 0 16px;
  margin-top: 4px;
}
:deep(.el-table th.el-table__cell) {
  background-color: #fafafa;
  color: #333;
  font-weight: 600;
}
:deep(.el-table .cell) {
  font-size: 12px;
}

/* 分页 */
.pagination-wrapper {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  padding: 12px 16px;
  border-top: 1px solid #f0f0f0;
  margin-top: 4px;
  flex-wrap: wrap;
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
/* 当前页码：红底白字，悬停不变色 */
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