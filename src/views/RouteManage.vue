<template>
  <div class="route-page">
    <!-- 搜索卡片 -->
    <div class="search-card fade-up">
      <div class="search-row">
        <div class="search-field">
          <label class="field-label">路线名称</label>
          <el-input v-model="searchForm.name" placeholder="请输入路线名称" clearable style="width: 180px" />
        </div>
        <div class="search-field">
          <label class="field-label">所属组织</label>
          <el-select v-model="searchForm.org" placeholder="请选择所属组织" clearable style="width: 180px">
            <el-option v-for="o in orgOptions" :key="o" :label="o" :value="o" />
          </el-select>
        </div>

        <div class="search-btns">
          <el-button type="primary" class="btn-primary" @click="handleSearch">
            <el-icon><Search /></el-icon> 查询
          </el-button>
          <el-button class="btn-outline" @click="handleReset">
            <el-icon><RefreshLeft /></el-icon> 重置
          </el-button>
        </div>
      </div>
    </div>

    <!-- 表格卡片（支持全屏） -->
    <Teleport to="body" :disabled="!isFullscreen">
      <div class="table-card-wrap" :class="{ 'is-fullscreen': isFullscreen }">
        <div class="table-card">
          <!-- 工具栏 -->
          <div class="toolbar">
            <div class="toolbar-left">
              <div class="status-tabs">
                <button
                  v-for="tab in statusTabs"
                  :key="tab.value"
                  class="status-tab"
                  :class="{ active: activeStatus === tab.value }"
                  @click="switchStatus(tab.value)"
                >
                  {{ tab.label }}({{ tab.count }})
                </button>
              </div>
            </div>

            <div class="toolbar-right">
              <el-button type="primary" class="btn-primary" @click="handleAdd">
                <el-icon><CirclePlus /></el-icon> 新增
              </el-button>
              <el-button class="btn-warning" @click="handleExport">
                <el-icon><Download /></el-icon> 导出
              </el-button>

              <el-tooltip content="刷新" placement="top" :show-after="300">
                <button class="icon-btn" @click="handleRefresh">
                  <el-icon><Refresh /></el-icon>
                </button>
              </el-tooltip>

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
                :width="280"
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
                    <div
                      v-for="(col, index) in columnConfig"
                      :key="col.prop"
                      class="column-item"
                      :class="{ dragging: dragIndex === index, dragOver: dragOverIndex === index }"
                      draggable="true"
                      @dragstart="dragIndex = index"
                      @dragover.prevent="dragOverIndex = index"
                      @drop="onDrop(index)"
                      @dragend="dragIndex = -1; dragOverIndex = -1"
                    >
                      <span class="drag-handle"><el-icon><Rank /></el-icon></span>
                      <el-checkbox v-model="col.visible" class="col-checkbox">{{ col.label }}</el-checkbox>
                      <div class="fix-actions">
                        <button class="fix-btn" :class="{ active: col.fixed === 'left' }"
                          @click.stop="toggleFix(col, 'left')"><el-icon><DArrowLeft /></el-icon></button>
                        <button class="fix-btn" :class="{ active: col.fixed === 'right' }"
                          @click.stop="toggleFix(col, 'right')"><el-icon><DArrowRight /></el-icon></button>
                      </div>
                    </div>
                  </div>
                </div>
              </el-popover>

              <button class="icon-btn" :class="{ active: isFullscreen }" @click="toggleFullscreen" :title="isFullscreen ? '退出全屏' : '全屏'">
                <el-icon><component :is="isFullscreen ? Close : FullScreen" /></el-icon>
              </button>
            </div>
          </div>

          <!-- 表格 -->
          <div class="table-wrap">
            <el-table
              :data="tableData"
              border
              stripe
              :size="tableSize"
              v-loading="loading"
              element-loading-text="加载中…"
              element-loading-background="rgba(255,255,255,0.88)"
              height="100%"
              class="custom-table"
            >
              <template v-for="col in visibleColumns" :key="col.prop">
                <!-- ⭐ 操作列：重新设计 -->
                <el-table-column
                  v-if="col.prop === 'action'"
                  :label="col.label"
                  :width="col.width || 320"
                  :align="col.align"
                  :fixed="col.fixed || false"
                >
                  <template #default="{ row }">
                    <div class="action-cell">
                      <!-- 详情 -->
                      <button class="op-btn op-view" @click="handleView(row)" title="查看详情">
                        <el-icon><View /></el-icon>
                        <span>详情</span>
                      </button>

                      <!-- 编辑 -->
                      <button class="op-btn op-edit" @click="handleEdit(row)" title="编辑">
                        <el-icon><Edit /></el-icon>
                        <span>编辑</span>
                      </button>

                      <!-- 停用（仅 active 状态） -->
                      <button
                        v-if="row.status === 'active'"
                        class="op-btn op-disable"
                        @click="handleToggleStatus(row)"
                        title="停用"
                      >
                        <el-icon><CircleClose /></el-icon>
                        <span>停用</span>
                      </button>

                      <!-- 启用（仅 disabled 状态） -->
                      <button
                        v-else
                        class="op-btn op-enable"
                        @click="handleToggleStatus(row)"
                        title="启用"
                      >
                        <el-icon><CircleCheck /></el-icon>
                        <span>启用</span>
                      </button>

                      <!-- 删除（仅 disabled 状态） -->
                      <button
                        v-if="row.status === 'disabled'"
                        class="op-btn op-delete"
                        @click="handleDelete(row)"
                        title="删除"
                      >
                        <el-icon><Delete /></el-icon>
                        <span>删除</span>
                      </button>
                    </div>
                  </template>
                </el-table-column>

                <!-- 名称 -->
                <el-table-column
                  v-else-if="col.prop === 'name'"
                  prop="name"
                  :label="col.label"
                  :min-width="col.minWidth"
                  :align="col.align"
                  :fixed="col.fixed || false"
                  show-overflow-tooltip
                >
                  <template #default="{ row }">
                    <div class="name-wrap" :class="{ disabled: row.status === 'disabled' }">
                      <span class="name-bar"></span>
                      <span class="name-text">{{ row.name }}</span>
                      <span v-if="row.status === 'disabled'" class="name-disabled-tag">已停用</span>
                    </div>
                  </template>
                </el-table-column>

                <!-- 创建时间 -->
                <el-table-column
                  v-else-if="col.prop === 'created_at'"
                  :label="col.label"
                  :min-width="col.minWidth"
                  :align="col.align"
                  :fixed="col.fixed || false"
                >
                  <template #default="{ row }">
                    <span class="time-text">{{ formatDateTime(row.created_at) }}</span>
                  </template>
                </el-table-column>

                <!-- 方案数量 -->
                <el-table-column
                  v-else-if="col.prop === 'plan_count'"
                  :label="col.label"
                  :min-width="col.minWidth"
                  :align="col.align"
                  :fixed="col.fixed || false"
                >
                  <template #default="{ row }">
                    <span class="plan-count-tag">{{ row.plan_count || 0 }}</span>
                  </template>
                </el-table-column>

                <!-- 普通列 -->
                <el-table-column
                  v-else
                  :prop="col.prop"
                  :label="col.label"
                  :min-width="col.minWidth"
                  :align="col.align"
                  :fixed="col.fixed || false"
                  show-overflow-tooltip
                >
                  <template #default="{ row }">
                    <span :class="row[col.prop] ? 'text-content' : 'text-muted'">
                      {{ row[col.prop] || '--' }}
                    </span>
                  </template>
                </el-table-column>
              </template>

              <template #empty>
                <div class="empty-state">
                  <el-icon class="empty-icon"><Guide /></el-icon>
                  <p>暂无路线</p>
                  <span class="empty-tip">点击右上角「新增」创建第一条路线</span>
                </div>
              </template>
            </el-table>
          </div>

          <!-- 分页 -->
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

        <!-- 全屏退出按钮 -->
        <transition name="fs-fade">
          <button v-if="isFullscreen" class="fs-exit-btn" @click="toggleFullscreen">
            <el-icon><Close /></el-icon> 退出全屏
          </button>
        </transition>
      </div>
    </Teleport>

    <!-- 新增 / 编辑 / 详情 弹窗 -->
    <RouteFormDialog
      v-model="formVisible"
      :edit-data="editingRow"
      :readonly="formReadonly"
      @success="handleFormSuccess"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Search, RefreshLeft, Refresh, Download, CirclePlus, View, Edit,
  Operation, Setting, FullScreen, Close, Grid, Rank,
  DArrowLeft, DArrowRight, Guide,
  CircleCheck, CircleClose, Delete,
} from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { supabase } from '@/utils/supabase'
import RouteFormDialog from '@/components/RouteFormDialog.vue'

// ============================================================
// 数据隔离
// ============================================================
const currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('currentUser') || '{}') }
  catch { return {} }
})()
const isAdmin = currentUser.role === 'admin'
const isCustomer = !isAdmin
const isSubAccount = !!currentUser.isSubAccount
const myAccount = currentUser.masterAccount || currentUser.account || ''
const myPhone = currentUser.masterPhone || currentUser.phone || ''
const myCustomerId = ref(currentUser.customerId || null)

const loadMyCustomerId = async () => {
  if (!isCustomer || myCustomerId.value || !myPhone) return
  try {
    const { data } = await supabase.from('customers').select('id').eq('phone', myPhone).maybeSingle()
    if (data) myCustomerId.value = data.id
  } catch (e) { }
}

// ============================================================
// 状态
// ============================================================
const loading = ref(false)
const tableData = ref([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(10)

const searchForm = reactive({ name: '', org: '' })
const orgOptions = ref([])

const activeStatus = ref('active')
const statusTabs = ref([
  { label: '正常', value: 'active', count: 0 },
  { label: '停用', value: 'disabled', count: 0 },
])

const tableSize = ref('default')
const handleDensityChange = (cmd) => { tableSize.value = cmd }

const isFullscreen = ref(false)
const toggleFullscreen = () => { isFullscreen.value = !isFullscreen.value }
const onEscKeydown = (e) => {
  if (e.key === 'Escape' && isFullscreen.value) isFullscreen.value = false
}

const formVisible = ref(false)
const editingRow = ref(null)
const formReadonly = ref(false)

// ============================================================
// 列设置
// ============================================================
const columnPopoverVisible = ref(false)

const DEFAULT_COLUMNS = [
  { prop: 'name', label: '路线名称', visible: true, fixed: 'left', minWidth: 200, align: 'left' },
  { prop: 'pickup_point', label: '装货点', visible: true, fixed: false, minWidth: 140, align: 'left' },
  { prop: 'delivery_point', label: '卸货点', visible: true, fixed: false, minWidth: 140, align: 'left' },
  { prop: 'org', label: '所属组织', visible: true, fixed: false, minWidth: 140, align: 'center' },
  { prop: 'remark', label: '备注', visible: true, fixed: false, minWidth: 160, align: 'left' },
  { prop: 'plan_count', label: '方案数量', visible: true, fixed: false, minWidth: 100, align: 'center' },
  { prop: 'creator', label: '创建人', visible: true, fixed: false, minWidth: 110, align: 'center' },
  { prop: 'created_at', label: '创建时间', visible: true, fixed: false, minWidth: 170, align: 'center' },
  { prop: 'action', label: '操作', visible: true, fixed: 'right', width: 320, align: 'center' },
]
const columnConfig = ref(JSON.parse(JSON.stringify(DEFAULT_COLUMNS)))
const visibleColumns = computed(() => columnConfig.value.filter(c => c.visible))
const resetColumns = () => {
  columnConfig.value = JSON.parse(JSON.stringify(DEFAULT_COLUMNS))
  ElMessage.success('已重置列设置')
}
const toggleFix = (col, side) => { col.fixed = col.fixed === side ? false : side }

const dragIndex = ref(-1)
const dragOverIndex = ref(-1)
const onDrop = (index) => {
  if (dragIndex.value === -1 || dragIndex.value === index) { dragIndex.value = -1; dragOverIndex.value = -1; return }
  const list = [...columnConfig.value]
  const [item] = list.splice(dragIndex.value, 1)
  list.splice(index, 0, item)
  columnConfig.value = list
  dragIndex.value = -1; dragOverIndex.value = -1
}

// ============================================================
// 工具
// ============================================================
const formatDateTime = (d) => d ? dayjs(d).format('YYYY-MM-DD HH:mm:ss') : '--'

// ============================================================
// ⭐⭐ 数据隔离（按 orgLevel 判断）
//    管理员                    → 无过滤
//    子账号（orgLevel=1）      → 等同主账号（owner_account）
//    子账号（orgLevel>=2）     → 只看本机构（org）
//    主账号 / 客户             → owner_account
// ============================================================
const applyIsolation = (q) => {
  if (isAdmin) return q

  if (isSubAccount) {
    const level = Number(currentUser.orgLevel) || 1
    const orgName = String(currentUser.orgName || '').trim()

    // ① 一级机构子账号 → 等同主账号
    if (level === 1) {
      console.log('[route] 子账号挂一级机构 → 等同主账号，owner =', myAccount)
      if (myAccount) return q.eq('owner_account', myAccount)
      return q.eq('owner_account', '__NO_PERMISSION__')
    }

    // ② 二级及以下 → 按 org 名隔离
    if (orgName) {
      console.log('[route] 子账号挂 level=' + level + ' 机构 → 隔离 org =', orgName)
      return q.eq('org', orgName)
    }

    // ③ 兜底：orgName 缺失 → 返回空集
    console.warn('[route] ⚠️ 子账号 level=' + level + ' 但 orgName 缺失，返回空集')
    return q.eq('id', '00000000-0000-0000-0000-000000000000')
  }

  // 主账号 / 客户
  if (myAccount) return q.eq('owner_account', myAccount)
  return q.eq('owner_account', '__NO_PERMISSION__')
}

// ============================================================
// 加载数据
// ============================================================
const fetchData = async () => {
  loading.value = true
  try {
    let q = supabase
      .from('routes')
      .select('*', { count: 'exact' })
      .eq('status', activeStatus.value)
      .order('created_at', { ascending: false })

    q = applyIsolation(q)
    if (searchForm.name) q = q.ilike('name', `%${searchForm.name}%`)
    if (searchForm.org) q = q.eq('org', searchForm.org)

    const from = (currentPage.value - 1) * pageSize.value
    const { data, error, count } = await q.range(from, from + pageSize.value - 1)
    if (error) throw error

    tableData.value = data || []
    total.value = count || 0
    updateTabCounts()
  } catch (e) {
    console.error('[route] 加载失败', e)
    ElMessage.error('加载失败：' + e.message)
  } finally {
    loading.value = false
  }
}

const updateTabCounts = async () => {
  try {
    const buildBase = (status) => {
      let q = supabase.from('routes').select('*', { count: 'exact', head: true }).eq('status', status)
      q = applyIsolation(q)
      if (searchForm.name) q = q.ilike('name', `%${searchForm.name}%`)
      if (searchForm.org) q = q.eq('org', searchForm.org)
      return q
    }
    const [{ count: activeCount }, { count: disabledCount }] = await Promise.all([
      buildBase('active'),
      buildBase('disabled'),
    ])
    statusTabs.value[0].count = activeCount || 0
    statusTabs.value[1].count = disabledCount || 0
  } catch (e) { /* noop */ }
}

const loadOrgOptions = async () => {
  try {
    let q = supabase.from('organizations').select('name').order('level', { ascending: true }).order('id', { ascending: true })
    if (isCustomer && myAccount) q = q.eq('owner_account', myAccount)
    const { data } = await q
    orgOptions.value = (data || []).map(o => o.name)
  } catch (e) { /* noop */ }
}

// ============================================================
// 交互
// ============================================================
const switchStatus = (val) => {
  if (activeStatus.value === val) return
  activeStatus.value = val
  currentPage.value = 1
  fetchData()
}

const handleSearch = () => { currentPage.value = 1; fetchData() }
const handleReset = () => {
  searchForm.name = ''
  searchForm.org = ''
  currentPage.value = 1
  fetchData()
}
const handleRefresh = async () => {
  await fetchData()
  ElMessage.success({ message: '已刷新', duration: 1200 })
}

const handleSizeChange = (v) => { pageSize.value = v; currentPage.value = 1; fetchData() }
const handleCurrentChange = (v) => { currentPage.value = v; fetchData() }

// ============================================================
// 新增 / 编辑 / 详情
// ============================================================
const handleAdd = () => {
  editingRow.value = null
  formReadonly.value = false
  formVisible.value = true
}
const handleEdit = (row) => {
  editingRow.value = { ...row }
  formReadonly.value = false
  formVisible.value = true
}
const handleView = (row) => {
  editingRow.value = { ...row }
  formReadonly.value = true
  formVisible.value = true
}
const handleFormSuccess = () => { fetchData() }

// ============================================================
// 停用 / 启用
// ============================================================
const handleToggleStatus = async (row) => {
  const isDisabling = row.status === 'active'
  try {
    await ElMessageBox.confirm(
      `确定${isDisabling ? '停用' : '启用'}路线「${row.name}」吗？`,
      `${isDisabling ? '停用' : '启用'}确认`,
      { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' }
    )
    let q = supabase
      .from('routes')
      .update({ status: isDisabling ? 'disabled' : 'active', updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (isCustomer && myAccount && !isSubAccount) q = q.eq('owner_account', myAccount)

    const { error } = await q
    if (error) throw error
    ElMessage.success(`${isDisabling ? '停用' : '启用'}成功`)
    fetchData()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('操作失败：' + (e.message || ''))
  }
}

// ============================================================
// 删除路线
// ============================================================
const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定删除路线「${row.name}」吗？删除后不可恢复。`,
      '删除确认',
      {
        type: 'warning',
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        confirmButtonClass: 'btn-danger-confirm',
        customClass: 'delete-confirm-box',
      }
    )
    let q = supabase.from('routes').delete().eq('id', row.id)
    if (isCustomer && myAccount && !isSubAccount) q = q.eq('owner_account', myAccount)
    const { error } = await q
    if (error) throw error
    ElMessage.success('删除成功')
    fetchData()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败：' + (e.message || ''))
  }
}

// ============================================================
// 导出
// ============================================================
const handleExport = () => {
  if (!tableData.value.length) {
    ElMessage.warning('没有数据可导出')
    return
  }
  const rows = tableData.value.map(r => ({
    '路线名称': r.name,
    '装货点': r.pickup_point || '',
    '卸货点': r.delivery_point || '',
    '所属组织': r.org || '',
    '备注': r.remark || '',
    '方案数量': r.plan_count || 0,
    '创建人': r.creator || '',
    '创建时间': formatDateTime(r.created_at),
  }))
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map(row => headers.map(h => {
      const v = row[h] == null ? '' : String(row[h])
      return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v
    }).join(','))
  ].join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `路线列表_${dayjs().format('YYYYMMDD_HHmmss')}.csv`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success(`已导出 ${rows.length} 条`)
}

// ============================================================
// 生命周期
// ============================================================
onMounted(async () => {
  document.addEventListener('keydown', onEscKeydown)
  if (isCustomer) {
    await loadMyCustomerId()
  }
  await loadOrgOptions()
  await fetchData()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onEscKeydown)
})
</script>

<style scoped>
.route-page {
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
  color: #1E293B;
}

/* 搜索卡片 */
.search-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  padding: 14px 16px;
  flex-shrink: 0;
}
.search-row { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
.search-field { display: flex; align-items: center; gap: 8px; }
.field-label { font-size: 13px; font-weight: 600; color: #334155; white-space: nowrap; }
.search-btns { display: flex; gap: 10px; margin-left: auto; }

/* 按钮 */
:deep(.el-button) {
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  border-radius: 8px;
  font-weight: 600;
}
:deep(.el-button:hover) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.15);
}
:deep(.btn-primary) {
  background: linear-gradient(135deg, #c8102e, #a00d24);
  border: none;
  color: #fff;
}
:deep(.btn-primary:hover) { background: linear-gradient(135deg, #a00d24, #7F1D1D); }
:deep(.btn-outline) {
  border-color: #CBD5E1;
  color: #334155;
  background: #fff;
}
:deep(.btn-outline:hover) {
  border-color: #c8102e;
  color: #c8102e;
  background-color: #FEF2F2;
}
:deep(.btn-warning) {
  background: linear-gradient(135deg, #F5A623, #D97706);
  border: none;
  color: #fff;
}
:deep(.btn-warning:hover) { background: linear-gradient(135deg, #D97706, #B45309); }

.search-row :deep(.el-input__wrapper),
.search-row :deep(.el-select__wrapper) {
  border-radius: 8px !important;
  background: #F8FAFC !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  transition: all 0.25s;
  min-height: 32px;
}
.search-row :deep(.el-input__wrapper:hover),
.search-row :deep(.el-select__wrapper:hover) {
  background: #FEF2F2 !important;
  box-shadow: 0 0 0 1px #FCA5A5 inset !important;
}
.search-row :deep(.el-input__wrapper.is-focus),
.search-row :deep(.el-select__wrapper.is-focused) {
  background: #fff !important;
  box-shadow: 0 0 0 2px rgba(200, 16, 46, 0.15), 0 0 0 1px #c8102e inset !important;
}

/* 表格卡片 */
.table-card-wrap {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.table-card-wrap.is-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 9999;
  padding: 24px;
  background: rgba(248, 250, 252, 0.85);
  backdrop-filter: blur(20px) saturate(180%);
  animation: fs-fade-in 0.3s;
}
@keyframes fs-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.table-card-wrap.is-fullscreen .table-card {
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(200, 16, 46, 0.18);
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

/* 工具栏 */
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
.toolbar-right { display: flex; align-items: center; gap: 8px; margin-left: auto; flex-wrap: wrap; }

/* 状态 tabs */
.status-tabs {
  display: inline-flex;
  padding: 3px;
  background: #F1F5F9;
  border-radius: 10px;
  gap: 2px;
}
.status-tab {
  padding: 6px 16px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  color: #64748B;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.status-tab:hover {
  color: #c8102e;
  background: rgba(255, 255, 255, 0.6);
}
.status-tab.active {
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #fff;
  box-shadow: 0 3px 10px rgba(200, 16, 46, 0.3);
}

/* 图标按钮 */
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
}
.icon-btn:hover {
  border-color: #c8102e;
  color: #c8102e;
  background: #FEF2F2;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.15);
}
.icon-btn.active {
  border-color: #c8102e;
  color: #fff;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.35);
}

/* 表格 */
.table-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border-radius: 8px;
}
.custom-table {
  border-radius: 8px;
  overflow: hidden;
  font-size: 12.5px;
}
:deep(.custom-table th.el-table__cell) {
  background: #F8FAFC !important;
  color: #0F172A;
  font-weight: 700;
  font-size: 12.5px;
  border-bottom: 1px solid #E2E8F0;
  padding: 9px 0;
}
:deep(.custom-table td.el-table__cell) {
  color: #1E293B;
  font-size: 12.5px;
  font-weight: 500;
  border-bottom: 1px solid #F1F5F9;
}
:deep(.custom-table .el-table__row:hover td) {
  background: #FEF2F2 !important;
}
:deep(.custom-table .el-table__body tr.el-table__row--striped td.el-table__cell) {
  background: #FAFBFC;
}

/* 名称 */
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
}
.name-wrap:hover {
  border-color: #FCA5A5;
  box-shadow: 0 3px 10px rgba(200, 16, 46, 0.12);
  transform: translateY(-1px);
}
.name-wrap.disabled { opacity: 0.65; }
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
}
.name-disabled-tag {
  padding: 1px 7px;
  border-radius: 8px;
  background: #F1F5F9;
  color: #64748B;
  font-size: 10.5px;
  font-weight: 700;
  border: 1px solid #E2E8F0;
  letter-spacing: 0.3px;
}

.time-text {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #475569;
}
.plan-count-tag {
  display: inline-block;
  padding: 2px 10px;
  background: #FEF2F2;
  color: #991B1B;
  border: 1px solid #FCA5A5;
  border-radius: 10px;
  font-weight: 700;
  font-size: 11.5px;
  font-family: 'Courier New', monospace;
}
.text-content { color: #334155; font-size: 12.5px; }
.text-muted { color: #CBD5E1; font-size: 12.5px; }

/* ============================================================
   ⭐ 操作列：胶囊按钮（重新设计）
   ============================================================ */
.action-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
}

.op-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px;
  height: 26px;
  border-radius: 13px;
  border: 1px solid;
  background: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: inherit;
  white-space: nowrap;
  line-height: 1;
  letter-spacing: 0.2px;
  outline: none;
}
.op-btn .el-icon { font-size: 13px; }
.op-btn:active { transform: translateY(0) scale(0.96); }

/* 详情 - 红色描边 */
.op-view {
  color: #c8102e;
  border-color: #FCA5A5;
  background: #FEF2F2;
}
.op-view:hover {
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #fff;
  border-color: #c8102e;
  transform: translateY(-2px);
  box-shadow: 0 6px 14px rgba(200, 16, 46, 0.35);
}

/* 编辑 - 蓝色描边 */
.op-edit {
  color: #2563EB;
  border-color: #93C5FD;
  background: #EFF6FF;
}
.op-edit:hover {
  background: linear-gradient(135deg, #3B82F6, #1D4ED8);
  color: #fff;
  border-color: #2563EB;
  transform: translateY(-2px);
  box-shadow: 0 6px 14px rgba(37, 99, 235, 0.35);
}

/* 停用 - 琥珀描边 */
.op-disable {
  color: #D97706;
  border-color: #FCD34D;
  background: #FFFBEB;
}
.op-disable:hover {
  background: linear-gradient(135deg, #F59E0B, #D97706);
  color: #fff;
  border-color: #F59E0B;
  transform: translateY(-2px);
  box-shadow: 0 6px 14px rgba(217, 119, 6, 0.35);
}

/* 启用 - 绿色描边 */
.op-enable {
  color: #059669;
  border-color: #6EE7B7;
  background: #ECFDF5;
}
.op-enable:hover {
  background: linear-gradient(135deg, #10B981, #059669);
  color: #fff;
  border-color: #059669;
  transform: translateY(-2px);
  box-shadow: 0 6px 14px rgba(5, 150, 105, 0.35);
}

/* 删除 - 红实心 */
.op-delete {
  color: #fff;
  border-color: #DC2626;
  background: linear-gradient(135deg, #EF4444, #DC2626);
  box-shadow: 0 2px 6px rgba(220, 38, 38, 0.22);
}
.op-delete:hover {
  background: linear-gradient(135deg, #DC2626, #B91C1C);
  border-color: #B91C1C;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(220, 38, 38, 0.45);
}

/* 空状态 */
.empty-state {
  padding: 50px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.empty-icon {
  font-size: 44px;
  color: #CBD5E1;
  animation: float 3s ease-in-out infinite;
}
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
.empty-state p { font-size: 14px; margin: 0; color: #334155; font-weight: 700; }
.empty-tip { font-size: 12px; color: #94A3B8; }

/* 分页 */
.pagination-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px solid #F1F5F9;
  flex-shrink: 0;
}
.total-text { font-size: 13px; color: #334155; font-weight: 600; }
:deep(.custom-pagination .el-pager li) {
  transition: all 0.2s;
  font-weight: 600;
  color: #334155;
  min-width: 26px;
  height: 26px;
  line-height: 26px;
  font-size: 13px;
}
:deep(.custom-pagination .el-pager li:hover) { color: #c8102e; transform: scale(1.08); }
:deep(.custom-pagination .el-pager li.is-active) {
  background-color: #c8102e !important;
  color: #fff !important;
  box-shadow: 0 2px 6px rgba(200, 16, 46, 0.35);
}

/* 全屏退出按钮 */
.fs-exit-btn {
  position: fixed;
  top: 36px;
  right: 40px;
  z-index: 10001;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  border: none;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(200, 16, 46, 0.4);
  transition: all 0.25s;
  font-family: inherit;
}
.fs-exit-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 28px rgba(200, 16, 46, 0.55);
}
.fs-fade-enter-active,
.fs-fade-leave-active { transition: all 0.3s; }
.fs-fade-enter-from,
.fs-fade-leave-to { opacity: 0; transform: translateY(-10px); }

/* 入场动画 */
.fade-up {
  animation: fadeUp 0.5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
  opacity: 0;
  transform: translateY(20px);
}
@keyframes fadeUp {
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 900px) {
  .search-row { flex-direction: column; align-items: stretch; }
  .search-btns { margin-left: 0; }
  .toolbar { flex-direction: column; align-items: stretch; }
  .toolbar-right { justify-content: flex-end; }
}
</style>

<style>
/* 密度下拉 */
.density-dropdown-red.el-dropdown__popper.el-popper {
  border: 2px solid #FFFFFF !important;
  box-shadow: 0 10px 32px rgba(200, 16, 46, 0.18), 0 0 0 1px rgba(200, 16, 46, 0.12) !important;
  border-radius: 10px !important;
  overflow: hidden;
  background: #FFFFFF !important;
}
.density-dropdown-red .el-dropdown-menu { padding: 4px !important; }
.density-dropdown-red .el-dropdown-menu__item {
  font-size: 13px !important;
  color: #c8102e !important;
  font-weight: 600 !important;
  border-radius: 6px !important;
  padding: 6px 16px !important;
  transition: all 0.25s;
}
.density-dropdown-red .el-dropdown-menu__item:hover {
  color: #fff !important;
  background: linear-gradient(135deg, #c8102e, #a00d24) !important;
  transform: translateX(2px);
}
.density-dropdown-red .density-item.active { color: #c8102e; font-weight: 700; }
.density-dropdown-red .el-dropdown-menu__item:hover .density-item.active { color: #fff; }

/* 列设置 */
.column-setting-popper.el-popover.el-popper {
  border: 2px solid #FFFFFF !important;
  box-shadow: 0 10px 32px rgba(200, 16, 46, 0.18), 0 0 0 1px rgba(200, 16, 46, 0.12) !important;
  border-radius: 10px !important;
  overflow: hidden;
  background: #FFFFFF !important;
  padding: 0 !important;
}
.column-setting-popper .el-popover__title { display: none; }
.column-setting-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #FEE2E2;
}
.col-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 700;
  color: #c8102e;
}
.col-reset {
  font-size: 12.5px;
  color: #c8102e;
  cursor: pointer;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
}
.col-reset:hover { background: #FEE2E2; text-decoration: underline; }
.column-setting-body {
  max-height: 400px;
  overflow-y: auto;
  padding: 6px;
}
.column-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: grab;
  transition: all 0.25s;
  user-select: none;
}
.column-item:hover { background: #FEF2F2; }
.column-item.dragging { opacity: 0.4; }
.column-item.dragOver { background: #FEE2E2; transform: scale(1.02); }
.drag-handle { display: flex; color: #FCA5A5; cursor: grab; font-size: 14px; }
.column-item:hover .drag-handle { color: #c8102e; }
.col-checkbox { flex: 1; }
.col-checkbox :deep(.el-checkbox__label) { font-size: 13px; color: #c8102e; font-weight: 600; }
.col-checkbox :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background-color: #c8102e;
  border-color: #c8102e;
}
.fix-actions { display: flex; gap: 2px; }
.fix-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: #FCA5A5;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.25s;
}
.fix-btn:hover { color: #c8102e; background: #FEE2E2; transform: scale(1.1); }
.fix-btn.active { color: #fff; background: linear-gradient(135deg, #c8102e, #a00d24); }

/* 删除确认框 */
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
.delete-confirm-box .el-message-box__title {
  font-weight: 700;
  color: #0F172A;
  font-size: 16px;
}
.delete-confirm-box .el-message-box__content {
  font-size: 14px;
  color: #334155;
  font-weight: 500;
}
</style>