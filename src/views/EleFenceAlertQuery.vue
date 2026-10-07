<template>
  <div class="alert-query-page">
    <!-- 搜索卡片 -->
    <div class="search-card fade-up">
      <div class="search-row">
        <el-select v-model="searchForm.org" placeholder="请选择所属车队" size="default" class="search-select" clearable>
          <el-option label="西马物流新能源车队" value="西马物流新能源车队" />
          <el-option label="其他机构" value="其他机构" />
        </el-select>

        <el-date-picker
          v-model="searchForm.dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          size="default"
          class="search-date"
        />

        <el-select v-model="searchForm.alert_type" placeholder="全部" size="default" class="search-select" clearable>
          <el-option label="超速提醒" value="speeding" />
          <el-option label="停留提醒" value="staying" />
        </el-select>

        <el-input v-model="searchForm.plate" placeholder="请输入车牌号" size="default" class="search-input" clearable />
        <el-input v-model="searchForm.vin" placeholder="请输入车架号" size="default" class="search-input" clearable />

        <div class="search-btns">
          <el-button type="primary" size="default" class="btn-primary" @click="handleSearch">
            <el-icon><Search /></el-icon> 搜索
          </el-button>
          <el-button size="default" class="btn-outline" @click="handleReset">
            <el-icon><Refresh /></el-icon> 重置
          </el-button>
          <el-button type="danger" size="default" plain class="btn-danger-outline" @click="handleExport">
            <el-icon><Download /></el-icon> 导出
          </el-button>
        </div>
      </div>

      <!-- 统计条 -->
      <div class="stats-row">
        <div class="stat-item" :class="{ active: activeStat === 'all' }" @click="filterByStat('all')">
          <div class="stat-icon-wrap total-icon">
            <el-icon><Bell /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.total }}</div>
            <div class="stat-label">提醒次数</div>
          </div>
          <div class="stat-glow"></div>
        </div>

        <div class="stat-item" :class="{ active: activeStat === 'speeding' }" @click="filterByStat('speeding')">
          <div class="stat-icon-wrap speeding-stat-icon">
            <el-icon><Odometer /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.speeding }}</div>
            <div class="stat-label">超速提醒</div>
          </div>
          <div class="stat-glow speeding-glow"></div>
        </div>

        <div class="stat-item" :class="{ active: activeStat === 'staying' }" @click="filterByStat('staying')">
          <div class="stat-icon-wrap staying-stat-icon">
            <el-icon><Location /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.staying }}</div>
            <div class="stat-label">停留提醒</div>
          </div>
          <div class="stat-glow staying-glow"></div>
        </div>

        <div class="stat-item" :class="{ active: activeStat === 'unhandled' }" @click="filterByStat('unhandled')">
          <div class="stat-icon-wrap unhandled-icon">
            <el-icon><WarningFilled /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.unhandled }}</div>
            <div class="stat-label">未处理</div>
          </div>
          <div class="stat-glow unhandled-glow"></div>
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
        <el-table-column prop="plate" label="车牌号" min-width="130" align="center" fixed>
          <template #default="{ row }">
            <!-- 👇 新的车牌展示：左侧红条 + 等宽字体 -->
            <div class="plate-wrap">
              <span class="plate-bar"></span>
              <span class="plate-text">{{ row.plate }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="org" label="所属机构" min-width="140" align="center" show-overflow-tooltip />
        <el-table-column prop="vin" label="VIN" min-width="160" align="center" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="vin-text">{{ row.vin || '--' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="提醒类型" min-width="110" align="center">
          <template #default="{ row }">
            <span class="type-tag" :class="row.alert_type">
              <el-icon>
                <Odometer v-if="row.alert_type === 'speeding'" />
                <Location v-else />
              </el-icon>
              {{ row.alert_type === 'speeding' ? '超速' : '停留' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="提醒开始时间" min-width="160" align="center">
          <template #default="{ row }">
            <span class="time-text">{{ formatDateTime(row.start_time) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="提醒结束时间" min-width="160" align="center">
          <template #default="{ row }">
            <span class="time-text">{{ formatDateTime(row.end_time) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="车速(km/h)" min-width="100" align="center">
          <template #default="{ row }">
            <span v-if="row.alert_type === 'speeding' && row.speed" class="speed-text">
              {{ Number(row.speed).toFixed(1) }}
            </span>
            <span v-else class="null-text">--</span>
          </template>
        </el-table-column>
        <el-table-column label="持续时间" min-width="100" align="center">
          <template #default="{ row }">
            <span class="duration-text">{{ row.duration || 0 }} 分钟</span>
          </template>
        </el-table-column>
        <el-table-column prop="location" label="报警位置" min-width="200" align="center" show-overflow-tooltip />
        <el-table-column label="状态" min-width="100" align="center">
          <template #default="{ row }">
            <span class="status-tag" :class="row.status">
              {{ row.status === 'handled' ? '已处理' : '未处理' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="center" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status !== 'handled'"
              type="text"
              size="small"
              class="action-btn handle"
              @click="handleMarkHandled(row)"
            >
              标记已处理
            </el-button>
            <span v-else class="handled-text">✓ 已处理</span>
          </template>
        </el-table-column>

        <template #empty>
          <div class="empty-state">
            <el-icon class="empty-icon"><Bell /></el-icon>
            <p>暂无提醒事件</p>
            <span class="empty-sub">去"提醒设置"开启超速或停留提醒吧</span>
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
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Search, Refresh, Download, Bell, Odometer, Location, WarningFilled
} from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { supabase } from '@/utils/supabase'

const formatDateTime = (dateStr) => {
  if (!dateStr) return '--'
  return dayjs(dateStr).format('YYYY-MM-DD HH:mm:ss')
}

const loading = ref(false)
const tableData = ref([])
const total = ref(0)
const pageSize = ref(10)
const currentPage = ref(1)
const activeStat = ref('all')

const searchForm = reactive({
  org: '',
  dateRange: [],
  alert_type: '',
  plate: '',
  vin: '',
})

const stats = reactive({
  total: 0,
  speeding: 0,
  staying: 0,
  unhandled: 0,
})

const loadStats = async () => {
  try {
    const { count: totalCount } = await supabase
      .from('ele_fence_events')
      .select('*', { count: 'exact', head: true })
    stats.total = totalCount || 0

    const { count: speedingCount } = await supabase
      .from('ele_fence_events')
      .select('*', { count: 'exact', head: true })
      .eq('alert_type', 'speeding')
    stats.speeding = speedingCount || 0

    const { count: stayingCount } = await supabase
      .from('ele_fence_events')
      .select('*', { count: 'exact', head: true })
      .eq('alert_type', 'staying')
    stats.staying = stayingCount || 0

    const { count: unhandledCount } = await supabase
      .from('ele_fence_events')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'unhandled')
    stats.unhandled = unhandledCount || 0
  } catch (e) {
    console.error('加载统计失败：', e)
  }
}

const fetchData = async () => {
  loading.value = true
  try {
    let query = supabase
      .from('ele_fence_events')
      .select('*', { count: 'exact' })
      .order('start_time', { ascending: false })

    if (searchForm.org) query = query.eq('org', searchForm.org)
    if (searchForm.plate) query = query.ilike('plate', `%${searchForm.plate}%`)
    if (searchForm.vin) query = query.ilike('vin', `%${searchForm.vin}%`)

    if (activeStat.value === 'speeding') query = query.eq('alert_type', 'speeding')
    else if (activeStat.value === 'staying') query = query.eq('alert_type', 'staying')
    else if (activeStat.value === 'unhandled') query = query.eq('status', 'unhandled')
    else if (searchForm.alert_type) query = query.eq('alert_type', searchForm.alert_type)

    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      query = query
        .gte('start_time', searchForm.dateRange[0] + 'T00:00:00')
        .lte('start_time', searchForm.dateRange[1] + 'T23:59:59')
    }

    const from = (currentPage.value - 1) * pageSize.value
    const to = from + pageSize.value - 1

    const { data, error, count } = await query.range(from, to)
    if (error) throw error

    tableData.value = data || []
    total.value = count || 0
  } catch (e) {
    ElMessage.error('加载提醒事件失败：' + e.message)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  activeStat.value = 'all'
  currentPage.value = 1
  fetchData()
}

const handleReset = () => {
  searchForm.org = ''
  searchForm.dateRange = []
  searchForm.alert_type = ''
  searchForm.plate = ''
  searchForm.vin = ''
  activeStat.value = 'all'
  currentPage.value = 1
  fetchData()
}

const filterByStat = (type) => {
  activeStat.value = activeStat.value === type ? 'all' : type
  currentPage.value = 1
  fetchData()
}

const handleMarkHandled = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定将车牌「${row.plate}」的该条提醒标记为已处理吗？`,
      '处理确认',
      {
        confirmButtonText: '确定标记',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
    const { error } = await supabase
      .from('ele_fence_events')
      .update({ status: 'handled', updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (error) throw error
    ElMessage.success('已标记为处理')
    fetchData()
    loadStats()
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('操作失败：' + e.message)
    }
  }
}

const handleExport = () => {
  ElMessage.info('正在导出数据...')
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

onMounted(() => {
  fetchData()
  loadStats()
})
</script>

<style scoped>
.alert-query-page {
  padding: 6px 16px 16px;
  background-color: #f8fafc;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 14px;
  color: #1E293B;
}

/* ========== 搜索卡片 ========== */
.search-card {
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: box-shadow 0.3s ease;
}
.search-card:hover {
  box-shadow: 0 6px 24px rgba(200, 16, 46, 0.06);
}

.search-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
.search-select { width: 180px; }
.search-input { width: 160px; }
.search-date { width: 260px; }
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

/* ==========================================
   统计条
   ========================================== */
.stats-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid #E2E8F0;
}

.stat-item {
  position: relative;
  flex: 1;
  min-width: 160px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #F1F5F9;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  overflow: hidden;
}

.stat-item:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
  background: #ffffff;
}

.stat-item.active {
  border-color: #FCA5A5;
  background: #ffffff;
  box-shadow: 0 6px 20px rgba(211, 47, 47, 0.15);
}
.stat-item.active:nth-child(2) {
  border-color: #FCA5A5;
}
.stat-item.active:nth-child(3) {
  border-color: #93C5FD;
  box-shadow: 0 6px 20px rgba(37, 99, 235, 0.15);
}
.stat-item.active:nth-child(4) {
  border-color: #FCD34D;
  box-shadow: 0 6px 20px rgba(245, 158, 11, 0.15);
}

.stat-icon-wrap {
  width: 42px;
  height: 42px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
  transition: transform 0.3s;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
}
.stat-item:hover .stat-icon-wrap {
  transform: scale(1.1) rotate(-6deg);
}

.total-icon {
  background: linear-gradient(135deg, #FEE2E2, #FCA5A5);
  color: #991B1B;
}
.speeding-stat-icon {
  background: linear-gradient(135deg, #FEE2E2, #FCA5A5);
  color: #991B1B;
}
.staying-stat-icon {
  background: linear-gradient(135deg, #DBEAFE, #93C5FD);
  color: #1E40AF;
}
.unhandled-icon {
  background: linear-gradient(135deg, #FEF3C7, #FCD34D);
  color: #92400E;
}

.stat-info {
  display: flex;
  flex-direction: column;
}
.stat-value {
  font-size: 24px;
  font-weight: 800;
  color: #0F172A;
  line-height: 1.1;
  font-family: 'Courier New', monospace;
  letter-spacing: -0.5px;
}
.stat-label {
  font-size: 12px;
  color: #475569;
  margin-top: 2px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.stat-glow {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 0;
  height: 3px;
  background: linear-gradient(90deg, #EF4444, #B91C1C);
  transition: width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.stat-item.active .stat-glow {
  width: 100%;
}
.stat-glow.speeding-glow {
  background: linear-gradient(90deg, #EF4444, #B91C1C);
}
.stat-glow.staying-glow {
  background: linear-gradient(90deg, #3B82F6, #1D4ED8);
}
.stat-glow.unhandled-glow {
  background: linear-gradient(90deg, #F59E0B, #D97706);
}

/* ==========================================
   表格卡片
   ========================================== */
.table-card {
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  padding: 16px;
  transition: box-shadow 0.3s ease;
}
.table-card:hover {
  box-shadow: 0 6px 24px rgba(200, 16, 46, 0.06);
}

.custom-table {
  border-radius: 8px;
  overflow: hidden;
}

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

/* ==========================================
   👇 车牌号展示（新样式）
   ========================================== */
.plate-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 3px 10px 3px 8px;
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.plate-wrap:hover {
  border-color: #FCA5A5;
  box-shadow: 0 3px 10px rgba(200, 16, 46, 0.12);
  transform: translateY(-1px);
}

/* 左侧红色小竖条 */
.plate-bar {
  display: inline-block;
  width: 3px;
  height: 16px;
  background: linear-gradient(180deg, #EF4444, #B91C1C);
  border-radius: 2px;
  box-shadow: 0 0 4px rgba(211, 47, 47, 0.4);
  flex-shrink: 0;
}

/* 车牌文字：等宽字体 + 深色加粗 */
.plate-text {
  font-family: 'Courier New', monospace;
  font-size: 13px;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: 0.8px;
  line-height: 1;
}

.vin-text {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #334155;
  font-weight: 600;
}

/* 提醒类型标签 */
.type-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
  transition: all 0.2s;
  letter-spacing: 0.3px;
}
.type-tag:hover {
  transform: scale(1.05);
}
.type-tag.speeding {
  background: #FEE2E2;
  color: #991B1B;
  border: 1px solid #FCA5A5;
}
.type-tag.staying {
  background: #DBEAFE;
  color: #1E40AF;
  border: 1px solid #93C5FD;
}
.type-tag .el-icon {
  font-size: 13px;
}

.time-text {
  font-size: 12px;
  color: #334155;
  font-family: 'Courier New', monospace;
  font-weight: 600;
}

.speed-text {
  display: inline-block;
  padding: 3px 10px;
  background: #FEE2E2;
  color: #991B1B;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 800;
  font-family: 'Courier New', monospace;
  border: 1px solid #FCA5A5;
}

.duration-text {
  font-size: 13px;
  color: #334155;
  font-weight: 600;
}

.null-text {
  color: #94A3B8;
  font-weight: 600;
}

.status-tag {
  display: inline-block;
  padding: 3px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.3px;
}
.status-tag.unhandled {
  background: #FEF3C7;
  color: #92400E;
  border: 1px solid #FCD34D;
  animation: statusPulse 2s ease-in-out infinite;
}
.status-tag.handled {
  background: #D1FAE5;
  color: #065F46;
  border: 1px solid #6EE7B7;
}
@keyframes statusPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.action-btn.handle {
  color: #c8102e;
  font-weight: 700;
  padding: 0 4px;
}
.action-btn.handle:hover {
  color: #7F1D1D;
  text-decoration: underline;
}
.handled-text {
  font-size: 13px;
  color: #059669;
  font-weight: 700;
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

.fade-up {
  animation: fadeUp 0.5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
  opacity: 0;
  transform: translateY(20px);
}
@keyframes fadeUp {
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 768px) {
  .stats-row {
    flex-direction: column;
  }
  .stat-item {
    min-width: 100%;
  }
}
</style>