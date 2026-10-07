<template>
  <div class="ele-fence-page">
    <!-- 搜索卡片 -->
    <div class="search-card fade-up">
      <div class="search-row">
        <el-select v-model="searchForm.org" placeholder="请选择所属车队" size="default" class="search-select" clearable>
          <el-option label="西马物流新能源车队" value="西马物流新能源车队" />
          <el-option label="其他机构" value="其他机构" />
        </el-select>
        <el-select v-model="searchForm.shape" placeholder="请选择围栏形状" size="default" class="search-select" clearable>
          <el-option label="圆形" value="circle" />
          <el-option label="多边形" value="polygon" />
          <el-option label="线形" value="polyline" />
          <el-option label="行政区划" value="district" />
        </el-select>
        <el-input v-model="searchForm.name" placeholder="请输入围栏名称" size="default" class="search-input" clearable />

        <div class="search-btns">
          <el-button type="primary" size="default" class="btn-primary" @click="handleSearch">
            <el-icon><Search /></el-icon> 搜索
          </el-button>
          <el-button size="default" class="btn-outline" @click="handleReset">
            <el-icon><Refresh /></el-icon> 重置
          </el-button>
          <el-button type="primary" size="default" class="btn-primary" @click="handleAdd">
            <el-icon><Plus /></el-icon> 新增
          </el-button>
          <el-button type="danger" size="default" plain class="btn-danger-outline" @click="handleExport">
            <el-icon><Download /></el-icon> 导出
          </el-button>
        </div>
      </div>
    </div>

    <!-- 表格卡片 -->
    <div class="table-card fade-up" style="animation-delay: 0.1s">
      <el-table
        :data="tableData"
        border
        stripe
        style="width: 100%;"
        size="default"
        v-loading="loading"
        class="custom-table"
        :header-cell-style="{ background: '#F1F5F9', color: '#0F172A', fontWeight: '700', fontSize: '13px' }"
      >
        <el-table-column prop="name" label="围栏名称" min-width="160" align="center" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="name-wrap">
              <span class="name-bar"></span>
              <span class="name-text">{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="org" label="所属机构" min-width="140" align="center" show-overflow-tooltip />
        <el-table-column prop="attr" label="围栏属性" min-width="110" align="center" show-overflow-tooltip />
        <el-table-column label="围栏形状" min-width="100" align="center">
          <template #default="{ row }">
            <span class="shape-tag" :class="row.shape">{{ shapeText(row.shape) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="围栏参数" min-width="120" align="center">
          <template #default="{ row }">
            <span v-if="row.shape === 'circle'" class="param-text">{{ row.radius }} 米</span>
            <span v-else-if="row.shape === 'polyline'" class="param-text">偏移 {{ row.bufferradius }} 米</span>
            <span v-else-if="row.shape === 'district'" class="param-text">区划 {{ row.adcode }}</span>
            <span v-else class="param-text">顶点 {{ countPoints(row.points) }} 个</span>
          </template>
        </el-table-column>
        <el-table-column prop="location" label="地址信息" min-width="220" show-overflow-tooltip align="center" />
        <el-table-column label="更新时间" min-width="160" align="center">
          <template #default="{ row }">
            <span class="time-text">{{ formatDateTime(row.updated_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="center" fixed="right">
          <template #default="{ row }">
            <el-button type="text" size="small" class="action-btn edit" @click="handleEdit(row)">编辑</el-button>
            <el-button type="text" size="small" class="action-btn delete" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>

        <template #empty>
          <div class="empty-state">
            <el-icon class="empty-icon"><MapLocation /></el-icon>
            <p>暂无电子围栏数据</p>
            <span class="empty-sub">点击右上角"新增"创建你的第一个围栏吧</span>
          </div>
        </template>
      </el-table>

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

    <AddEleFenceDialog
      v-model="showFenceDialog"
      :edit-data="editingRow"
      @success="handleDialogSuccess"
    />

    <!-- 删除中动画遮罩 -->
    <transition name="delete-fade">
      <div v-if="deleting" class="delete-loading-overlay">
        <div class="delete-loading-content">
          <div class="delete-ring">
            <svg viewBox="0 0 100 100" width="110" height="110">
              <circle cx="50" cy="50" r="42" class="del-ring-track" />
              <circle
                cx="50" cy="50" r="42"
                class="del-ring-progress"
                :style="{ strokeDashoffset: delRingOffset }"
              />
            </svg>
            <div class="del-trash">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#D32F2F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </div>
          </div>
          <div class="delete-text">
            正在删除围栏「<span class="delete-name">{{ deletingName }}</span>」...
          </div>
          <div class="delete-bar">
            <div class="delete-bar-inner" :style="{ width: deleteProgress + '%' }"></div>
          </div>
          <div class="delete-tip">请稍候，正在同步高德服务器</div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Download, Plus, MapLocation } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { supabase } from '@/utils/supabase'
import AddEleFenceDialog from '@/components/AddEleFenceDialog.vue'

const formatDateTime = (dateStr) => {
  if (!dateStr) return '--'
  return dayjs(dateStr).format('YYYY-MM-DD HH:mm:ss')
}

const shapeText = (shape) => {
  const map = { circle: '圆形', polygon: '多边形', polyline: '线形', district: '行政区划' }
  return map[shape] || shape
}

const countPoints = (points) => {
  if (!points) return 0
  return points.split(';').filter(Boolean).length
}

const showFenceDialog = ref(false)
const editingRow = ref(null)
const loading = ref(false)
const tableData = ref([])
const total = ref(0)
const pageSize = ref(10)
const currentPage = ref(1)

const searchForm = reactive({ org: '', shape: '', name: '' })

const deleting = ref(false)
const deletingName = ref('')
const deleteProgress = ref(0)
let deleteTimer = null

const DEL_RING_LENGTH = 263.89
const delRingOffset = computed(() => DEL_RING_LENGTH * (1 - deleteProgress.value / 100))

const startDeleteAnimation = (name) => {
  deleting.value = true
  deletingName.value = name
  deleteProgress.value = 0
  deleteTimer = setInterval(() => {
    if (deleteProgress.value < 80) {
      deleteProgress.value = Math.min(80, deleteProgress.value + Math.random() * 8 + 3)
    }
  }, 200)
}

const finishDeleteAnimation = () => {
  if (deleteTimer) { clearInterval(deleteTimer); deleteTimer = null }
  deleteProgress.value = 100
}

const resetDeleteAnimation = () => {
  if (deleteTimer) { clearInterval(deleteTimer); deleteTimer = null }
  deleting.value = false
  deletingName.value = ''
  deleteProgress.value = 0
}

const fetchData = async () => {
  loading.value = true
  try {
    let query = supabase
      .from('ele_fences')
      .select('*', { count: 'exact' })
      .order('updated_at', { ascending: false })

    if (searchForm.org) query = query.eq('org', searchForm.org)
    if (searchForm.shape) query = query.eq('shape', searchForm.shape)
    if (searchForm.name) query = query.ilike('name', `%${searchForm.name}%`)

    const from = (currentPage.value - 1) * pageSize.value
    const to = from + pageSize.value - 1

    const { data, error, count } = await query.range(from, to)
    if (error) throw error

    tableData.value = data || []
    total.value = count || 0
  } catch (err) {
    ElMessage.error('加载围栏数据失败：' + err.message)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => { currentPage.value = 1; fetchData() }

const handleReset = () => {
  searchForm.org = ''
  searchForm.shape = ''
  searchForm.name = ''
  handleSearch()
}

const handleAdd = () => {
  editingRow.value = null
  showFenceDialog.value = true
}

const handleEdit = (row) => {
  editingRow.value = { ...row }
  showFenceDialog.value = true
}

const handleDialogSuccess = () => { fetchData() }

const handleExport = () => { ElMessage.info('正在导出数据...') }

const handleDelete = (row) => {
  ElMessageBox.confirm(
    `是否继续删除围栏「${row.name}」`,
    '删除确认',
    {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'btn-danger-confirm',
      customClass: 'delete-confirm-box',
    }
  ).then(async () => {
    startDeleteAnimation(row.name)
    try {
      const { data, error } = await supabase.functions.invoke('amap-geofence-delete', {
        body: { gfids: row.gfid },
      })
      if (error) throw error

      const isSuccess = data.errcode === 0 || data.errcode === 10000
      if (!isSuccess) {
        finishDeleteAnimation()
        setTimeout(() => {
          resetDeleteAnimation()
          ElMessage.error('高德删除失败：errcode=' + data.errcode + '，errmsg=' + (data.errmsg || '未知'))
        }, 400)
        return
      }

      const { error: dbError } = await supabase.from('ele_fences').delete().eq('id', row.id)
      if (dbError) throw dbError

      finishDeleteAnimation()
      setTimeout(() => {
        resetDeleteAnimation()
        ElMessage.success('删除成功')
        fetchData()
      }, 400)
    } catch (err) {
      finishDeleteAnimation()
      setTimeout(() => {
        resetDeleteAnimation()
        ElMessage.error('删除失败：' + err.message)
      }, 400)
    }
  }).catch(() => {})
}

const handleSizeChange = (val) => { pageSize.value = val; currentPage.value = 1; fetchData() }
const handleCurrentChange = (val) => { currentPage.value = val; fetchData() }

onMounted(() => { fetchData() })
</script>

<style scoped>
.ele-fence-page {
  padding: 6px 16px 16px;
  background-color: #f8fafc;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 14px;
  color: #1E293B;
}

.search-card, .table-card {
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  padding: 16px;
  transition: box-shadow 0.3s ease;
}
.search-card:hover, .table-card:hover {
  box-shadow: 0 6px 24px rgba(200, 16, 46, 0.06);
}

.search-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
.search-select { width: 180px; }
.search-input { width: 200px; }
.search-btns {
  display: flex;
  gap: 10px;
  margin-left: auto;
}

:deep(.el-button) {
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  border-radius: 6px;
  font-weight: 600;
}
:deep(.el-button:hover) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.15);
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
  border-color: #CBD5E1;
  color: #334155;
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

:deep(.el-input__wrapper.is-focus),
:deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 2px rgba(200, 16, 46, 0.15), 0 0 0 1px #c8102e inset !important;
}

/* ========== 表格 ========== */
.custom-table { border-radius: 8px; overflow: hidden; }

:deep(.custom-table .el-table__cell) {
  color: #1E293B;
  font-weight: 500;
  font-size: 13px;
}
:deep(.custom-table th.el-table__cell) {
  color: #0F172A !important;
  font-weight: 700 !important;
  font-size: 13px;
  background: #F1F5F9 !important;
  border-bottom: 2px solid #E2E8F0;
}

:deep(.el-table__row) {
  transition: background-color 0.3s ease, transform 0.2s ease;
}
:deep(.el-table__row:hover) {
  background-color: #FEF2F2 !important;
  transform: scale(1.002);
  box-shadow: 0 2px 8px rgba(200, 16, 46, 0.08);
}
:deep(.el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell) {
  background: #FAFBFC;
}

.name-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 3px 10px 3px 8px;
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  max-width: 100%;
}
.name-wrap:hover {
  border-color: #FCA5A5;
  box-shadow: 0 3px 10px rgba(200, 16, 46, 0.12);
  transform: translateY(-1px);
}
.name-bar {
  display: inline-block;
  width: 3px;
  height: 16px;
  background: linear-gradient(180deg, #EF4444, #B91C1C);
  border-radius: 2px;
  box-shadow: 0 0 4px rgba(211, 47, 47, 0.4);
  flex-shrink: 0;
}
.name-text {
  font-size: 13px;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: 0.3px;
  line-height: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shape-tag {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.3px;
}
.shape-tag.circle {
  background: #DBEAFE;
  color: #1E40AF;
  border: 1px solid #93C5FD;
}
.shape-tag.polygon {
  background: #D1FAE5;
  color: #065F46;
  border: 1px solid #6EE7B7;
}
.shape-tag.polyline {
  background: #FEF3C7;
  color: #92400E;
  border: 1px solid #FCD34D;
}
.shape-tag.district {
  background: #EDE9FE;
  color: #5B21B6;
  border: 1px solid #C4B5FD;
}

.param-text {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.time-text {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #334155;
  font-weight: 600;
}

.action-btn {
  font-weight: 700;
  transition: all 0.2s;
  padding: 0 4px;
}
.action-btn.edit { color: #c8102e; }
.action-btn.edit:hover {
  color: #7F1D1D;
  text-decoration: underline;
}
.action-btn.delete { color: #64748B; }
.action-btn.delete:hover {
  color: #c8102e;
  text-decoration: underline;
}

.empty-state {
  padding: 40px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.empty-icon {
  font-size: 48px;
  color: #94A3B8;
  animation: float 3s ease-in-out infinite;
}
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
.empty-state p {
  margin: 0;
  font-size: 15px;
  color: #334155;
  font-weight: 700;
}
.empty-sub {
  font-size: 13px;
  color: #64748B;
}

.pagination-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 16px;
  border-top: 1px solid #E2E8F0;
  margin-top: 16px;
}
.total-text {
  font-size: 13px;
  color: #334155;
  font-weight: 700;
}
:deep(.custom-pagination .el-pager li) {
  transition: all 0.2s;
  font-weight: 600;
  color: #334155;
}
:deep(.custom-pagination .el-pager li:hover) {
  color: #c8102e;
  transform: scale(1.1);
}
:deep(.custom-pagination .el-pager li.is-active) {
  background-color: #c8102e !important;
  color: #fff !important;
  box-shadow: 0 2px 6px rgba(200, 16, 46, 0.35);
}
:deep(.custom-pagination button:hover) { color: #c8102e; }

.delete-loading-overlay {
  position: fixed;
  inset: 0;
  background: rgba(248, 250, 252, 0.75);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.delete-loading-content {
  background: #ffffff;
  border-radius: 16px;
  padding: 32px 40px;
  box-shadow: 0 20px 60px rgba(211, 47, 47, 0.15), 0 0 0 1px rgba(211, 47, 47, 0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  animation: deleteContentIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes deleteContentIn {
  from { opacity: 0; transform: scale(0.85) translateY(20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.delete-ring {
  position: relative;
  width: 110px;
  height: 110px;
}
.delete-ring svg { transform: rotate(-90deg); }
.del-ring-track {
  fill: none;
  stroke: #FEE2E2;
  stroke-width: 6;
}
.del-ring-progress {
  fill: none;
  stroke: #D32F2F;
  stroke-width: 6;
  stroke-linecap: round;
  stroke-dasharray: 263.89;
  transition: stroke-dashoffset 0.3s ease-out;
  filter: drop-shadow(0 2px 6px rgba(211, 47, 47, 0.4));
}
.del-trash {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation: trashShake 1.2s ease-in-out infinite;
}
@keyframes trashShake {
  0%, 100% { transform: translate(-50%, -50%) rotate(0deg); }
  25% { transform: translate(-50%, -50%) rotate(-8deg); }
  75% { transform: translate(-50%, -50%) rotate(8deg); }
}
.delete-text {
  font-size: 15px;
  color: #0F172A;
  font-weight: 600;
}
.delete-name {
  color: #D32F2F;
  font-weight: 800;
}
.delete-bar {
  width: 240px;
  height: 6px;
  background: #FEE2E2;
  border-radius: 3px;
  overflow: hidden;
}
.delete-bar-inner {
  height: 100%;
  background: linear-gradient(90deg, #EF4444, #B91C1C);
  border-radius: 3px;
  transition: width 0.3s ease-out;
  position: relative;
}
.delete-bar-inner::after {
  content: '';
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent);
  animation: barShine 1.5s ease-in-out infinite;
}
@keyframes barShine {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
.delete-tip {
  font-size: 12px;
  color: #64748B;
  font-weight: 500;
  animation: textPulse 1.6s ease-in-out infinite;
}
@keyframes textPulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
.delete-fade-enter-active, .delete-fade-leave-active {
  transition: opacity 0.35s ease;
}
.delete-fade-enter-from, .delete-fade-leave-to { opacity: 0; }

.fade-up {
  animation: fadeUp 0.5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
  opacity: 0;
  transform: translateY(20px);
}
@keyframes fadeUp {
  to { opacity: 1; transform: translateY(0); }
}
</style>

<style>
.btn-danger-confirm {
  background-color: #D32F2F !important;
  border-color: #D32F2F !important;
  color: #ffffff !important;
  font-weight: 700 !important;
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.btn-danger-confirm:hover {
  background-color: #B91C1C !important;
  border-color: #B91C1C !important;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(211, 47, 47, 0.35);
}
.delete-confirm-box .el-message-box__header { padding: 16px 20px 8px; }
.delete-confirm-box .el-message-box__title {
  font-weight: 700;
  color: #0F172A;
  font-size: 16px;
}
.delete-confirm-box .el-message-box__content {
  padding: 8px 20px 16px;
  font-size: 14px;
  color: #334155;
  font-weight: 500;
}
</style>