<template>
  <div class="vehicle-archive">
    <!-- 搜索区域 -->
    <div class="search-bar">
      <div class="search-row">
        <el-select v-model="searchForm.org" placeholder="请选择所属机构" size="small" class="search-select">
          <el-option label="西马物流新能源车队" value="1" />
          <el-option label="其他机构" value="2" />
        </el-select>
        <el-input v-model="searchForm.plate" placeholder="请输入车牌号" size="small" class="search-input" clearable />
        <el-input v-model="searchForm.vin" placeholder="请输入车架号" size="small" class="search-input" clearable />
        <el-button type="primary" size="small" class="search-btn">搜索</el-button>
        <el-button size="small">重置</el-button>
        <el-button size="small" plain class="export-btn">导出</el-button>
      </div>
    </div>

    <!-- 表格 -->
    <div class="table-wrapper">
      <el-table
        :data="tableData"
        border
        stripe
        style="width: 100%;"
        size="small"
        max-height="calc(100vh - 260px)"
      >
        <!-- 每一列都加上 :formatter 确保空值显示为 '--' -->
        <el-table-column prop="plate" label="车牌号" min-width="110" fixed>
          <template #default="{ row }">
            {{ row.plate || '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="vin" label="VIN码" min-width="120">
          <template #default="{ row }">
            {{ row.vin || '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="nickname" label="车辆昵称" min-width="100">
          <template #default="{ row }">
            {{ row.nickname || '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="org" label="所属机构组织" min-width="140">
          <template #default="{ row }">
            {{ row.org || '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="driver" label="绑定司机" min-width="100">
          <template #default="{ row }">
            {{ row.driver || '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="fuelType" label="燃料类型" min-width="90">
          <template #default="{ row }">
            {{ row.fuelType || '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="vehicleType" label="车辆类型" min-width="90">
          <template #default="{ row }">
            {{ row.vehicleType || '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="usage" label="车辆用途" min-width="90">
          <template #default="{ row }">
            {{ row.usage || '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="subVehicle" label="子母车" min-width="80">
          <template #default="{ row }">
            {{ row.subVehicle || '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="trailer" label="关联挂车" min-width="100">
          <template #default="{ row }">
            {{ row.trailer || '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="purchaseDate" label="车辆购买日" min-width="110">
          <template #default="{ row }">
            {{ row.purchaseDate || '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="insuranceDate" label="保险购买日" min-width="110">
          <template #default="{ row }">
            {{ row.insuranceDate || '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="updateTime" label="修改时间" min-width="140">
          <template #default="{ row }">
            {{ row.updateTime || '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="operator" label="操作人" min-width="90">
          <template #default="{ row }">
            {{ row.operator || '--' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="140">
          <template #default>
            <el-button type="text" size="small" style="color: #c8102e;">编辑</el-button>
            <el-button type="text" size="small" style="color: #c8102e;">查看</el-button>
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

// 搜索表单
const searchForm = reactive({
  org: '',
  plate: '',
  vin: '',
})

// 表格数据（完全清空，后续从接口获取）
const tableData = ref([])      // ← 空数组
const total = ref(0)           // ← 总条数为0
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
</script>

<style scoped>
.vehicle-archive {
  padding: 0;
  background: #ffffff;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.search-bar {
  padding: 8px 20px;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
}
.search-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.search-select {
  width: 180px;
}
.search-input {
  width: 160px;
}
.search-btn {
  background-color: #c8102e;
  border-color: #c8102e;
  color: #fff;
}
.search-btn:hover {
  background-color: #a00d24;
  border-color: #a00d24;
}
.export-btn {
  border-color: #c8102e;
  color: #c8102e;
}
.export-btn:hover {
  background-color: #c8102e;
  color: #fff;
}

.table-wrapper {
  flex: 1;
  padding: 0 20px;
  overflow: hidden;
}
:deep(.el-table th.el-table__cell) {
  background-color: #fafafa;
  color: #333;
  font-weight: 600;
}
:deep(.el-table .cell) {
  font-size: 12px;
}

.pagination-wrapper {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  padding: 8px 20px;
  border-top: 1px solid #f0f0f0;
  flex-shrink: 0;
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
:deep(.el-pagination .el-pager li.active) {
  background-color: #409eff;
  color: #fff;
}
:deep(.el-pagination .el-pager li:hover) {
  color: #c8102e;
}
</style>