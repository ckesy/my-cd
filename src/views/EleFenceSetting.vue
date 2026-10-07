<template>
  <div class="ele-fence-page">
    
    <!-- 搜索卡片区域 -->
    <div class="search-card fade-up">
      <div class="search-row">
        <el-select v-model="searchForm.fleet" placeholder="请选择所属车队" size="default" class="search-select" clearable>
          <el-option label="李先生的车队" value="李先生的车队" />
        </el-select>
        <el-select v-model="searchForm.attr" placeholder="请选择围栏属性" size="default" class="search-select" clearable>
          <el-option label="圆形围栏" value="圆形围栏" />
        </el-select>
        <el-input v-model="searchForm.name" placeholder="请输入围栏名称" size="default" class="search-input" clearable />
        
        <div class="search-btns">
          <el-button type="primary" size="default" class="btn-primary" @click="handleSearch">
            <el-icon><Search /></el-icon> 搜索
          </el-button>
          <el-button size="default" class="btn-outline" @click="handleReset">
            <el-icon><Refresh /></el-icon> 重置
          </el-button>
          <!-- 点击打开新增弹窗 -->
          <el-button type="primary" size="default" class="btn-primary" @click="showAddDialog = true">
            <el-icon><Plus /></el-icon> 新增
          </el-button>
          <el-button type="danger" size="default" plain class="btn-danger-outline" @click="handleExport">
            <el-icon><Download /></el-icon> 导出
          </el-button>
        </div>
      </div>
    </div>

    <!-- 表格卡片区域 -->
    <div class="table-card fade-up" style="animation-delay: 0.1s">
      <el-table
        :data="tableData"
        border
        stripe
        style="width: 100%;"
        size="default"
        v-loading="loading"
        class="custom-table"
        :header-cell-style="{ background: '#fafafa', color: '#333', fontWeight: '600' }"
        :row-class-name="tableRowClassName"
      >
        <el-table-column prop="name" label="围栏名称" min-width="140" align="center" />
        <el-table-column prop="org" label="所属机构" min-width="140" align="center" />
        <el-table-column prop="attr" label="围栏属性" min-width="100" align="center" />
        <el-table-column prop="radius" label="围栏半径(米)" min-width="120" align="center" />
        <el-table-column prop="shape" label="围栏形状" min-width="100" align="center" />
        <el-table-column prop="center" label="中心坐标" min-width="160" align="center" />
        <el-table-column prop="desc" label="地址信息" min-width="160" show-overflow-tooltip align="center" />
        <el-table-column prop="updated_at" label="更新时间" min-width="160" align="center">
          <template #default="{ row }">
            {{ formatDateTime(row.updated_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="center" fixed="right">
          <template #default="{ row }">
            <el-button type="text" size="small" class="action-btn edit" @click="handleEdit(row)">编辑</el-button>
            <el-button type="text" size="small" class="action-btn delete" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
        
        <!-- 自定义空状态插画 -->
        <template #empty>
          <div class="empty-state">
            <el-icon class="empty-icon"><MapLocation /></el-icon>
            <p>暂无电子围栏数据</p>
          </div>
        </template>
      </el-table>
      
      <!-- 分页区域 -->
      <div class="pagination-wrapper">
        <span class="total-text">共 {{ total }} 条</span>
        <el-pagination
          background
          layout="sizes, prev, pager, next, jumper"
          :total="total"
          :page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          v-model:current-page="currentPage"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          class="custom-pagination"
        />
      </div>
    </div>

    <!-- 👇 新增围栏弹窗 -->
    <AddEleFenceDialog v-model="showAddDialog" @success="handleAddSuccess" />

  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Download, Plus, MapLocation } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { supabase } from '@/utils/supabase'
import AddEleFenceDialog from '@/components/AddEleFenceDialog.vue'

// ---------- 时间格式化 ----------
const formatDateTime = (dateStr) => {
  if (!dateStr) return '--'
  return dayjs(dateStr).format('YYYY-MM-DD HH:mm:ss')
}

// ---------- 状态变量 ----------
const showAddDialog = ref(false) // 控制新增弹窗显示
const loading = ref(false)
const tableData = ref([])
const total = ref(0)
const pageSize = ref(10)
const currentPage = ref(1)

const searchForm = reactive({
  fleet: '',
  attr: '',
  name: ''
})

// ---------- 数据获取 ----------
const fetchData = async () => {
  loading.value = true
  try {
    // 模拟数据请求（这里预留了 Supabase 查询逻辑）
    // 真实场景请解开注释，并确保表名为 ele_fences
    /*
    let query = supabase.from('ele_fences').select('*', { count: 'exact' })
    if (searchForm.name) query = query.ilike('name', `%${searchForm.name}%`)
    
    const from = (currentPage.value - 1) * pageSize.value
    const to = from + pageSize.value - 1
    const { data, error, count } = await query.range(from, to)
    if (error) throw error
    tableData.value = data || []
    total.value = count || 0
    */

    // 演示用：模拟空数据
    setTimeout(() => {
      tableData.value = []
      total.value = 0
      loading.value = false
    }, 500)
    
  } catch (err) {
    ElMessage.error('加载围栏数据失败：' + err.message)
    loading.value = false
  }
}

// ---------- 操作逻辑 ----------
const handleSearch = () => {
  currentPage.value = 1
  fetchData()
}

const handleReset = () => {
  searchForm.fleet = ''
  searchForm.attr = ''
  searchForm.name = ''
  handleSearch()
}

// 点击新增成功后的回调
const handleAddSuccess = () => {
  ElMessage.success('围栏创建成功，即将刷新列表')
  fetchData() // 刷新列表
}

const handleExport = () => {
  ElMessage.info('正在导出数据...')
}

const handleEdit = (row) => {
  ElMessage.info('编辑围栏：' + row.name)
}

const handleDelete = (row) => {
  ElMessageBox.confirm('确定要删除该围栏吗？此操作将同步删除高德服务端的围栏！', '提示', { 
    type: 'warning',
    confirmButtonText: '确定',
    cancelButtonText: '取消'
  }).then(async () => {
    // 真实删除逻辑：
    // await supabase.functions.invoke('amap-geofence', { body: { action: 'delete', gfid: row.gfid } })
    ElMessage.success('删除成功')
    fetchData()
  }).catch(() => {})
}

const handleSizeChange = (val) => {
  pageSize.value = val
  currentPage.value = 1
  fetchData()
}

const handleCurrentChange = (val) => {
  currentPage.value = val
  fetchData()
}

const tableRowClassName = ({ rowIndex }) => {
  return rowIndex % 2 === 0 ? 'even-row' : 'odd-row'
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
/* ========== 页面基础布局 ========== */
.ele-fence-page {
  padding: 6px 16px 16px; /* 顶部紧贴导航，其他方向留白 */
  background-color: #f8fafc;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 通用卡片样式 */
.search-card, .table-card {
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  padding: 16px;
  transition: box-shadow 0.3s ease;
}
.search-card:hover, .table-card:hover {
  box-shadow: 0 6px 20px rgba(200, 16, 46, 0.06);
}

/* ========== 搜索区域 ========== */
.search-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.search-select {
  width: 180px;
}
.search-input {
  width: 200px;
}

.search-btns {
  display: flex;
  gap: 10px;
  margin-left: auto;
}

/* 按钮微动效 */
:deep(.el-button) {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 6px;
}
:deep(.el-button:hover) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.12);
}
:deep(.btn-primary) {
  background-color: #c8102e;
  border-color: #c8102e;
  color: #fff;
}
:deep(.btn-primary:hover) {
  background-color: #a00d24;
  border-color: #a00d24;
}
:deep(.btn-outline) {
  border-color: #E2E8F0;
  color: #64748B;
}
:deep(.btn-outline:hover) {
  border-color: #c8102e;
  color: #c8102e;
  background-color: #FEF2F2;
}
:deep(.btn-danger-outline) {
  border-color: #c8102e;
  color: #c8102e;
}
:deep(.btn-danger-outline:hover) {
  background-color: #c8102e;
  color: #fff;
}

/* ========== 表格区域 ========== */
.custom-table {
  border-radius: 8px;
  overflow: hidden;
}

/* 表格行悬停微动效 */
:deep(.el-table__row) {
  transition: background-color 0.3s ease, transform 0.2s ease;
}
:deep(.el-table__row:hover) {
  background-color: #FEF2F2 !important;
  transform: scale(1.002);
  box-shadow: 0 2px 8px rgba(200, 16, 46, 0.05);
}

/* 操作按钮 */
.action-btn {
  font-weight: 500;
  transition: all 0.2s;
  padding: 0 4px;
}
.action-btn.edit {
  color: #c8102e;
}
.action-btn.edit:hover {
  color: #a00d24;
  text-decoration: underline;
}
.action-btn.delete {
  color: #909399;
}
.action-btn.delete:hover {
  color: #c8102e;
  text-decoration: underline;
}

/* 空状态动画 */
.empty-state {
  padding: 40px 0;
  color: #94A3B8;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.empty-icon {
  font-size: 48px;
  color: #CBD5E1;
  animation: float 3s ease-in-out infinite;
}
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

/* ========== 分页区域 ========== */
.pagination-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 16px;
  border-top: 1px solid #F1F5F9;
  margin-top: 16px;
}
.total-text {
  font-size: 13px;
  color: #64748B;
}

:deep(.custom-pagination .el-pager li) {
  transition: all 0.2s;
}
:deep(.custom-pagination .el-pager li:hover) {
  color: #c8102e;
  transform: scale(1.1);
}
:deep(.custom-pagination .el-pager li.is-active) {
  background-color: #c8102e !important;
  color: #fff !important;
  box-shadow: 0 2px 6px rgba(200, 16, 46, 0.3);
}
:deep(.custom-pagination button:hover) {
  color: #c8102e;
}

/* ========== 入场动画 ========== */
.fade-up {
  animation: fadeUp 0.5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
  opacity: 0;
  transform: translateY(20px);
}
@keyframes fadeUp {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>