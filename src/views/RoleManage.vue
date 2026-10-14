<template>
  <div class="role-page">
    <!-- 搜索卡片 -->
    <div class="search-card fade-up">
      <div class="search-row">
        <div class="search-field">
          <label class="field-label">角色名称</label>
          <el-input v-model="searchForm.name" placeholder="请输入角色名称" clearable style="width: 220px"
            @keyup.enter="handleSearch" />
        </div>

        <div class="search-btns">
          <el-button type="primary" class="btn-primary" @click="handleSearch">
            <el-icon>
              <Search />
            </el-icon> 查询
          </el-button>
          <el-button class="btn-outline" @click="handleReset">
            <el-icon>
              <RefreshLeft />
            </el-icon> 重置
          </el-button>
        </div>
      </div>
    </div>

    <!-- 表格卡片 -->
    <Teleport to="body" :disabled="!isFullscreen">
      <div class="table-card-wrap" :class="{ 'is-fullscreen': isFullscreen }">
        <div class="table-card">
          <div class="toolbar">
            <div class="toolbar-left">
              <span class="toolbar-bar"></span>
              <span class="toolbar-title">角色列表</span>
              <span class="toolbar-total">共 {{ total }} 条</span>
            </div>

            <div class="toolbar-right">
              <el-button type="primary" class="btn-primary" @click="handleAdd">
                <el-icon>
                  <CirclePlus />
                </el-icon> 新增角色
              </el-button>

              <el-tooltip content="刷新" placement="top" :show-after="300">
                <button class="icon-btn" :class="{ spinning: refreshing }" @click="handleRefresh">
                  <el-icon>
                    <Refresh />
                  </el-icon>
                </button>
              </el-tooltip>

              <el-dropdown trigger="click" popper-class="density-dropdown-red" @command="handleDensityChange">
                <button class="icon-btn" title="表格密度">
                  <el-icon>
                    <Operation />
                  </el-icon>
                </button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="large"><span class="density-item"
                        :class="{ active: tableSize === 'large' }">宽松</span></el-dropdown-item>
                    <el-dropdown-item command="default"><span class="density-item"
                        :class="{ active: tableSize === 'default' }">默认</span></el-dropdown-item>
                    <el-dropdown-item command="small"><span class="density-item"
                        :class="{ active: tableSize === 'small' }">紧凑</span></el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>

              <el-popover v-model:visible="columnPopoverVisible" placement="bottom-end" :width="280" trigger="click"
                popper-class="column-setting-popper">
                <template #reference>
                  <button class="icon-btn" :class="{ active: columnPopoverVisible }" title="列设置">
                    <el-icon>
                      <Setting />
                    </el-icon>
                  </button>
                </template>
                <div class="column-setting">
                  <div class="column-setting-header">
                    <span class="col-title"><el-icon>
                        <Grid />
                      </el-icon> 列展示</span>
                    <span class="col-reset" @click="resetColumns">重置</span>
                  </div>
                  <div class="column-setting-body">
                    <div v-for="(col, index) in columnConfig" :key="col.prop" class="column-item"
                      :class="{ dragging: dragIndex === index, dragOver: dragOverIndex === index }" draggable="true"
                      @dragstart="dragIndex = index" @dragover.prevent="dragOverIndex = index" @drop="onDrop(index)"
                      @dragend="dragIndex = -1; dragOverIndex = -1">
                      <span class="drag-handle"><el-icon>
                          <Rank />
                        </el-icon></span>
                      <el-checkbox v-model="col.visible" class="col-checkbox">{{ col.label }}</el-checkbox>
                      <div class="fix-actions">
                        <button class="fix-btn" :class="{ active: col.fixed === 'left' }"
                          @click.stop="toggleFix(col, 'left')"><el-icon>
                            <DArrowLeft />
                          </el-icon></button>
                        <button class="fix-btn" :class="{ active: col.fixed === 'right' }"
                          @click.stop="toggleFix(col, 'right')"><el-icon>
                            <DArrowRight />
                          </el-icon></button>
                      </div>
                    </div>
                  </div>
                </div>
              </el-popover>

              <button class="icon-btn" :class="{ active: isFullscreen }" @click="toggleFullscreen"
                :title="isFullscreen ? '退出全屏' : '全屏'">
                <el-icon>
                  <component :is="isFullscreen ? Close : FullScreen" />
                </el-icon>
              </button>
            </div>
          </div>

          <!-- 表格 -->
          <div class="table-wrap">
            <el-table :data="tableData" border stripe :size="tableSize" v-loading="loading" element-loading-text="加载中…"
              element-loading-background="rgba(255,255,255,0.88)" height="100%" class="custom-table">
              <template v-for="col in visibleColumns" :key="col.prop">
                <!-- 角色名称 -->
                <el-table-column v-if="col.prop === 'name'" prop="name" :label="col.label" :min-width="col.minWidth"
                  :align="col.align" :fixed="col.fixed || false" show-overflow-tooltip>
                  <template #default="{ row }">
                    <div class="name-wrap">
                      <span class="name-bar"></span>
                      <span class="name-text">{{ row.name }}</span>
                      <span v-if="isAdminRole(row)" class="name-admin-tag">
                        <el-icon>
                          <StarFilled />
                        </el-icon> 管理员
                      </span>
                    </div>
                  </template>
                </el-table-column>

                <!-- 所属组织 -->
                <el-table-column v-else-if="col.prop === 'org'" prop="org" :label="col.label" :min-width="col.minWidth"
                  :align="col.align" :fixed="col.fixed || false" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span v-if="row.org" class="org-chip">
                      <el-icon>
                        <OfficeBuilding />
                      </el-icon>
                      {{ row.org }}
                    </span>
                    <span v-else class="text-muted">--</span>
                  </template>
                </el-table-column>

                <!-- 备注 -->
                <el-table-column v-else-if="col.prop === 'description'" prop="description" :label="col.label"
                  :min-width="col.minWidth" :align="col.align" :fixed="col.fixed || false" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span :class="row.description ? 'text-content' : 'text-muted'">
                      {{ row.description || '--' }}
                    </span>
                  </template>
                </el-table-column>

                <!-- 状态 -->
                <el-table-column v-else-if="col.prop === 'status'" :label="col.label" :min-width="col.minWidth"
                  :align="col.align" :fixed="col.fixed || false">
                  <template #default="{ row }">
                    <span class="status-tag" :class="isRowActive(row) ? 'on' : 'off'">
                      <span class="status-dot"></span>
                      {{ isRowActive(row) ? '启用' : '停用' }}
                    </span>
                  </template>
                </el-table-column>

                <!-- 创建时间 -->
                <el-table-column v-else-if="col.prop === 'created_at'" :label="col.label" :min-width="col.minWidth"
                  :align="col.align" :fixed="col.fixed || false">
                  <template #default="{ row }">
                    <span class="time-text">{{ formatDateTime(row.created_at) }}</span>
                  </template>
                </el-table-column>

                <!-- ⭐ 操作列：编辑 / 功能配置 / 删除 -->
                <el-table-column v-else-if="col.prop === 'action'" :label="col.label" :width="col.width || 280"
                  :align="col.align" :fixed="col.fixed || false">
                  <template #default="{ row }">
                    <div class="action-cell">
                      <button class="op-btn op-view" @click="handleEdit(row)" title="编辑">
                        <el-icon>
                          <Edit />
                        </el-icon>
                        <span>编辑</span>
                      </button>
                      <button class="op-btn op-perm" @click="openPermDialog(row)" title="功能配置">
                        <el-icon>
                          <Setting />
                        </el-icon>
                        <span>功能配置</span>
                      </button>
                      <button class="op-btn op-delete" @click="handleDelete(row)" title="删除">
                        <el-icon>
                          <Delete />
                        </el-icon>
                        <span>删除</span>
                      </button>
                    </div>
                  </template>
                </el-table-column>
              </template>

              <template #empty>
                <div class="empty-state">
                  <el-icon class="empty-icon">
                    <User />
                  </el-icon>
                  <p>暂无角色</p>
                  <span class="empty-tip">点击右上角「新增角色」创建第一个角色</span>
                </div>
              </template>
            </el-table>
          </div>

          <div class="pagination-wrapper">
            <span class="total-text">共 {{ total }} 条</span>
            <el-pagination background layout="sizes, prev, pager, next, jumper" :total="total" :page-size="pageSize"
              :page-sizes="[10, 20, 50, 100]" v-model:current-page="currentPage" @size-change="handleSizeChange"
              @current-change="handleCurrentChange" class="custom-pagination" />
          </div>
        </div>

        <transition name="fs-fade">
          <button v-if="isFullscreen" class="fs-exit-btn" @click="toggleFullscreen">
            <el-icon>
              <Close />
            </el-icon> 退出全屏
          </button>
        </transition>
      </div>
    </Teleport>

    <!-- 新增 / 编辑角色弹窗 -->
    <el-dialog v-model="formVisible" :title="isEdit ? '编辑角色' : '新增角色'" width="540px" top="15vh" destroy-on-close
      :close-on-click-modal="false" class="role-form-dialog">
      <el-form :model="form" label-width="90px" label-position="right" size="default">
        <el-form-item label="角色名称" required>
          <el-input v-model="form.name" placeholder="请输入角色名称" maxlength="20" show-word-limit />
        </el-form-item>

        <!-- ⭐ 所属组织（客户名根节点 + 下级机构） -->
        <el-form-item label="所属组织" required>
          <el-select v-model="form.org" placeholder="请选择所属组织" clearable filterable style="width:100%" popper-class="role-org-popper">
            <el-option v-for="o in sortedOrgList" :key="o.id || o.name" :label="o.name" :value="o.name" />
          </el-select>
          <div class="form-tip">
            <el-icon>
              <InfoFilled />
            </el-icon>
            <span>该角色归属于哪个组织/车队</span>
          </div>
        </el-form-item>

        <el-form-item label="备注">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="请输入角色说明" maxlength="100"
            show-word-limit />
        </el-form-item>

        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio :value="1">启用</el-radio>
            <el-radio :value="0">停用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" class="btn-primary" :loading="saving" @click="handleSubmit">
          确定
        </el-button>
      </template>
    </el-dialog>

    <!-- 功能配置弹窗 -->
    <FunctionPermissionDialog v-model="permDialogVisible" :role-id="permCurrentRole?.id"
      :role-name="permCurrentRole?.name" :value="permCurrentKeys" @confirm="handlePermConfirm" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Search, RefreshLeft, Refresh, CirclePlus, Edit, Delete,
  Operation, Setting, FullScreen, Close, Grid, Rank,
  DArrowLeft, DArrowRight, User, InfoFilled, StarFilled,
  OfficeBuilding,
} from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { supabase } from '@/utils/supabase'
import FunctionPermissionDialog from '@/components/FunctionPermissionDialog.vue'

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
const myOrgName = ref(null)

const loadMyCustomerId = async () => {
  if (!isCustomer || myCustomerId.value || !myPhone) return
  try {
    const { data } = await supabase.from('customers').select('id, name').eq('phone', myPhone).maybeSingle()
    if (data) {
      myCustomerId.value = data.id
      // ⭐ 缓存客户名，用于机构下拉的虚拟根节点
      if (data.name && !currentUser.customerName) {
        currentUser.customerName = data.name
      }
    }
  } catch (e) { }
}
const loadMyOrgName = async () => {
  if (!isCustomer || !isSubAccount || !currentUser.orgId) return
  try {
    const { data } = await supabase.from('organizations').select('name').eq('id', currentUser.orgId).maybeSingle()
    if (data) myOrgName.value = data.name
  } catch (e) { }
}

// ============================================================
// 状态
// ============================================================
const loading = ref(false)
const refreshing = ref(false)
const tableData = ref([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(10)

const searchForm = reactive({ name: '' })

// 原始组织列表
const orgList = ref([])

// ⭐ 排序后的机构列表：客户公司名 → 根 → 子
const sortedOrgList = computed(() => {
  const list = [...orgList.value]
  const roots = list.filter(o => !o.parent_id)
  const children = list.filter(o => o.parent_id)
  const sorted = [...roots, ...children]

  // 客户公司名（虚拟根），排第一
  const customerName =
    currentUser.customerName ||
    currentUser.masterName ||
    currentUser.name ||
    ''

  if (customerName) {
    const existedIdx = sorted.findIndex(o => o.name === customerName)
    if (existedIdx >= 0) {
      const [existed] = sorted.splice(existedIdx, 1)
      sorted.unshift(existed)
    } else {
      sorted.unshift({
        id: '__customer_root__',
        name: customerName,
        parent_id: null,
        _virtual: true,
      })
    }
  }

  return sorted
})

// 表格设置
const tableSize = ref('default')
const handleDensityChange = (cmd) => { tableSize.value = cmd }

// 全屏
const isFullscreen = ref(false)
const toggleFullscreen = () => { isFullscreen.value = !isFullscreen.value }
const onEscKeydown = (e) => {
  if (e.key === 'Escape' && isFullscreen.value) isFullscreen.value = false
}

// 新增 / 编辑弹窗
const formVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)
const form = reactive({
  id: null,
  name: '',
  org: '',
  description: '',
  status: 1,
})

// 权限配置弹窗
const permDialogVisible = ref(false)
const permCurrentRole = ref(null)
const permCurrentKeys = ref([])

// ============================================================
// 列设置
// ============================================================
const columnPopoverVisible = ref(false)

const DEFAULT_COLUMNS = [
  { prop: 'name', label: '角色名称', visible: true, fixed: 'left', minWidth: 180, align: 'left' },
  { prop: 'org', label: '所属组织', visible: true, fixed: false, minWidth: 200, align: 'center' },
  { prop: 'description', label: '备注', visible: true, fixed: false, minWidth: 180, align: 'left' },
  { prop: 'status', label: '状态', visible: true, fixed: false, minWidth: 100, align: 'center' },
  { prop: 'created_at', label: '创建时间', visible: true, fixed: false, minWidth: 170, align: 'center' },
  { prop: 'action', label: '操作', visible: true, fixed: 'right', width: 280, align: 'center' },
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

const isRowActive = (row) => {
  const s = row.status
  if (typeof s === 'number') return s === 1
  if (typeof s === 'string') {
    return s === '1' || s === 'active' || s === 'enabled'
  }
  return false
}

const isAdminRole = (row) => {
  return row.code === 'admin' || row.name === '管理员' || row.name === 'admin'
}

// ============================================================
// 数据隔离
// ============================================================
const applyIsolation = (q) => {
  if (isAdmin) return q
  if (isSubAccount && myOrgName.value) return q.eq('org', myOrgName.value)
  if (myAccount) return q.eq('owner_account', myAccount)
  return q.eq('owner_account', '__NO_PERMISSION__')
}

// ============================================================
// 加载角色
// ============================================================
const fetchRoles = async () => {
  loading.value = true
  try {
    let q = supabase
      .from('roles')
      .select('*', { count: 'exact' })
      .order('id', { ascending: true })

    q = applyIsolation(q)
    if (searchForm.name) q = q.ilike('name', `%${searchForm.name}%`)

    const from = (currentPage.value - 1) * pageSize.value
    const { data, error, count } = await q.range(from, from + pageSize.value - 1)
    if (error) throw error

    tableData.value = data || []
    total.value = count || 0
  } catch (e) {
    console.error('[role] 加载失败', e)
    ElMessage.error('加载失败：' + e.message)
  } finally {
    loading.value = false
  }
}

// ============================================================
// 加载组织列表
// ============================================================
const loadOrgOptions = async () => {
  try {
    let q = supabase.from('organizations').select('id, name, parent_id').order('id')
    if (isCustomer && myAccount) q = q.eq('owner_account', myAccount)
    const { data, error } = await q
    if (error) throw error
    orgList.value = data || []
  } catch (e) {
    console.warn('[role] 加载组织失败', e)
  }
}

// ============================================================
// 交互
// ============================================================
const handleSearch = () => { currentPage.value = 1; fetchRoles() }
const handleReset = () => {
  searchForm.name = ''
  currentPage.value = 1
  fetchRoles()
}
const handleRefresh = async () => {
  refreshing.value = true
  await fetchRoles()
  setTimeout(() => { refreshing.value = false }, 400)
  ElMessage.success({ message: '已刷新', duration: 1200 })
}

const handleSizeChange = (v) => { pageSize.value = v; currentPage.value = 1; fetchRoles() }
const handleCurrentChange = (v) => { currentPage.value = v; fetchRoles() }

// ============================================================
// 新增 / 编辑
// ============================================================
const handleAdd = () => {
  isEdit.value = false
  form.id = null
  form.name = ''
  // ⭐ 默认填充客户公司名（虚拟根）
  form.org = currentUser.customerName || currentUser.masterName || currentUser.name || ''
  form.description = ''
  form.status = 1
  formVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  form.id = row.id
  form.name = row.name || ''
  form.org = row.org || ''
  form.description = row.description || ''
  form.status = isRowActive(row) ? 1 : 0
  formVisible.value = true
}

const handleSubmit = async () => {
  if (!form.name.trim()) return ElMessage.warning('请输入角色名称')
  if (!form.org) return ElMessage.warning('请选择所属组织')

  saving.value = true
  try {
    const payload = {
      name: form.name.trim(),
      org: form.org,
      description: form.description?.trim() || null,
      status: Number(form.status),
      owner_account: isAdmin ? null : myAccount,
      updated_at: new Date().toISOString(),
    }

    if (isEdit.value) {
      let q = supabase.from('roles').update(payload).eq('id', form.id)
      if (isCustomer && myAccount) q = q.eq('owner_account', myAccount)
      const { error } = await q
      if (error) throw error
      ElMessage.success('更新成功')
    } else {
      payload.permissions = { client: [] }
      payload.created_at = new Date().toISOString()

      const { error } = await supabase.from('roles').insert(payload)
      if (error) {
        if (String(error.message).includes('unique') || String(error.code) === '23505') {
          throw new Error('该角色名称已存在')
        }
        throw error
      }
      ElMessage.success('新增成功')
    }

    formVisible.value = false
    fetchRoles()
  } catch (e) {
    console.error('[role] 保存失败', e)
    ElMessage.error('保存失败：' + e.message)
  } finally {
    saving.value = false
  }
}

// ============================================================
// 删除
// ============================================================
const handleDelete = async (row) => {
  if (isAdminRole(row)) {
    ElMessage.warning('管理员角色不可删除')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定删除角色「${row.name}」吗？删除后该角色下的用户将失去对应权限。`,
      '删除确认',
      {
        type: 'warning',
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        confirmButtonClass: 'btn-danger-confirm',
        customClass: 'delete-confirm-box',
      }
    )
    let q = supabase.from('roles').delete().eq('id', row.id)
    if (isCustomer && myAccount) q = q.eq('owner_account', myAccount)
    const { error } = await q
    if (error) throw error
    ElMessage.success('删除成功')
    fetchRoles()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败：' + (e.message || ''))
  }
}

// ============================================================
// 功能配置弹窗
// ============================================================
const openPermDialog = (row) => {
  permCurrentRole.value = row
  let list = []
  try {
    const p = row.permissions
    if (p) {
      const obj = typeof p === 'string' ? JSON.parse(p) : p
      list = Array.isArray(obj.client) ? [...obj.client] : []
    }
  } catch (e) {
    console.warn('[role] 解析 permissions 失败', e)
    list = []
  }
  permCurrentKeys.value = list
  permDialogVisible.value = true
}

const handlePermConfirm = async ({ roleId, permissions }) => {
  try {
    const payload = {
      permissions: { client: permissions || [] },
      updated_at: new Date().toISOString(),
    }
    let q = supabase.from('roles').update(payload).eq('id', roleId)
    if (isCustomer && myAccount) q = q.eq('owner_account', myAccount)
    const { error } = await q
    if (error) throw error

    ElMessage.success(`功能配置已保存，共 ${permissions.length} 项`)
    fetchRoles()
  } catch (e) {
    console.error('[role] 保存权限失败', e)
    ElMessage.error('保存权限失败：' + e.message)
  }
}

// ============================================================
// 生命周期
// ============================================================
onMounted(async () => {
  document.addEventListener('keydown', onEscKeydown)
  if (isCustomer) {
    await loadMyCustomerId()
    await loadMyOrgName()
  }
  await loadOrgOptions()
  fetchRoles()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onEscKeydown)
})
</script>

<style scoped>
.role-page {
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

.search-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  padding: 14px 16px;
  flex-shrink: 0;
}

.search-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
}

.search-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.field-label {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  white-space: nowrap;
}

.search-btns {
  display: flex;
  gap: 10px;
  margin-left: auto;
}

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

:deep(.btn-primary:hover) {
  background: linear-gradient(135deg, #a00d24, #7F1D1D);
}

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

.search-row :deep(.el-input__wrapper) {
  border-radius: 8px !important;
  background: #F8FAFC !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  min-height: 32px;
}

.search-row :deep(.el-input__wrapper:hover) {
  background: #FEF2F2 !important;
  box-shadow: 0 0 0 1px #FCA5A5 inset !important;
}

.search-row :deep(.el-input__wrapper.is-focus) {
  background: #fff !important;
  box-shadow: 0 0 0 2px rgba(200, 16, 46, 0.15), 0 0 0 1px #c8102e inset !important;
}

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
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
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

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-wrap: wrap;
}

.toolbar-bar {
  width: 4px;
  height: 18px;
  border-radius: 2px;
  background: linear-gradient(180deg, #c8102e, #a00d24);
  box-shadow: 0 0 8px rgba(200, 16, 46, 0.35);
}

.toolbar-title {
  font-size: 15px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: 0.3px;
}

.toolbar-total {
  font-size: 12.5px;
  color: #94A3B8;
  font-weight: 500;
  padding-left: 8px;
  border-left: 1px solid #E2E8F0;
}

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

.icon-btn.spinning .el-icon {
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

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

.name-admin-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 8px;
  border-radius: 8px;
  background: linear-gradient(135deg, #FEF3C7, #FDE68A);
  color: #92400E;
  border: 1px solid #FCD34D;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.2px;
}

.name-admin-tag .el-icon {
  font-size: 10px;
}

.org-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  background: #EFF6FF;
  color: #1E40AF;
  border: 1px solid #BFDBFE;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.2px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.org-chip .el-icon {
  font-size: 12px;
  flex-shrink: 0;
  color: #3B82F6;
}

.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 12px 3px 10px;
  border-radius: 12px;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.3px;
}

.status-tag.on {
  background: #ECFDF5;
  color: #059669;
  border: 1px solid #6EE7B7;
}

.status-tag.off {
  background: #FEF2F2;
  color: #991B1B;
  border: 1px solid #FCA5A5;
}

.status-tag .status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 2px color-mix(in srgb, currentColor 20%, transparent);
}

.status-tag.on .status-dot {
  animation: dotPulse 1.8s ease-in-out infinite;
}

@keyframes dotPulse {

  0%,
  100% {
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
  }

  50% {
    box-shadow: 0 0 0 5px rgba(16, 185, 129, 0.05);
  }
}

.time-text {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #475569;
}

.text-content {
  color: #334155;
  font-size: 12.5px;
}

.text-muted {
  color: #CBD5E1;
  font-size: 12.5px;
}

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

.op-btn .el-icon {
  font-size: 13px;
}

.op-btn:active {
  transform: translateY(0) scale(0.96);
}

.op-view {
  color: #2563EB;
  border-color: #93C5FD;
  background: #EFF6FF;
}

.op-view:hover {
  background: linear-gradient(135deg, #3B82F6, #1D4ED8);
  color: #fff;
  border-color: #2563EB;
  transform: translateY(-2px);
  box-shadow: 0 6px 14px rgba(37, 99, 235, 0.35);
}

.op-perm {
  color: #c8102e;
  border-color: #FCA5A5;
  background: #FEF2F2;
}

.op-perm:hover {
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #fff;
  border-color: #c8102e;
  transform: translateY(-2px);
  box-shadow: 0 6px 14px rgba(200, 16, 46, 0.35);
}

.op-delete {
  color: #64748B;
  border-color: #E2E8F0;
  background: #fff;
}

.op-delete:hover {
  color: #fff;
  background: linear-gradient(135deg, #EF4444, #DC2626);
  border-color: #DC2626;
  transform: translateY(-2px);
  box-shadow: 0 6px 14px rgba(220, 38, 38, 0.35);
}

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

  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-10px);
  }
}

.empty-state p {
  font-size: 14px;
  margin: 0;
  color: #334155;
  font-weight: 700;
}

.empty-tip {
  font-size: 12px;
  color: #94A3B8;
}

.pagination-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px solid #F1F5F9;
  flex-shrink: 0;
}

.total-text {
  font-size: 13px;
  color: #334155;
  font-weight: 600;
}

:deep(.custom-pagination .el-pager li) {
  transition: all 0.2s;
  font-weight: 600;
  color: #334155;
  min-width: 26px;
  height: 26px;
  line-height: 26px;
  font-size: 13px;
}

:deep(.custom-pagination .el-pager li:hover) {
  color: #c8102e;
  transform: scale(1.08);
}

:deep(.custom-pagination .el-pager li.is-active) {
  background-color: #c8102e !important;
  color: #fff !important;
  box-shadow: 0 2px 6px rgba(200, 16, 46, 0.35);
}

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
.fs-fade-leave-active {
  transition: all 0.3s;
}

.fs-fade-enter-from,
.fs-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.form-tip {
  margin-top: 6px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #94A3B8;
  font-weight: 500;
}

.form-tip .el-icon {
  color: #c8102e;
  font-size: 12px;
}

/* ⭐ 组织下拉选项 */
.org-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
}

.org-icon {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-size: 12px;
  flex-shrink: 0;
  background: #F1F5F9;
  color: #64748B;
}

.org-icon.root {
  background: linear-gradient(135deg, #FEF2F2, #FEE2E2);
  color: #c8102e;
  box-shadow: 0 2px 6px rgba(200, 16, 46, 0.15);
}

.org-name {
  flex: 1;
  font-size: 14px;
  color: #0F172A;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.org-tag {
  flex-shrink: 0;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 700;
  color: #c8102e;
  background: #FEF2F2;
  border: 1px solid #FCA5A5;
  border-radius: 10px;
  letter-spacing: 0.3px;
}

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

@media (max-width: 900px) {
  .search-row {
    flex-direction: column;
    align-items: stretch;
  }

  .search-btns {
    margin-left: 0;
  }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-right {
    justify-content: flex-end;
  }
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

.density-dropdown-red .el-dropdown-menu {
  padding: 4px !important;
}

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

.density-dropdown-red .density-item.active {
  color: #c8102e;
  font-weight: 700;
}

.density-dropdown-red .el-dropdown-menu__item:hover .density-item.active {
  color: #fff;
}

/* 列设置 */
.column-setting-popper.el-popover.el-popper {
  border: 2px solid #FFFFFF !important;
  box-shadow: 0 10px 32px rgba(200, 16, 46, 0.18), 0 0 0 1px rgba(200, 16, 46, 0.12) !important;
  border-radius: 10px !important;
  overflow: hidden;
  background: #FFFFFF !important;
  padding: 0 !important;
}

.column-setting-popper .el-popover__title {
  display: none;
}

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

.col-reset:hover {
  background: #FEE2E2;
  text-decoration: underline;
}

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

.column-item:hover {
  background: #FEF2F2;
}

.column-item.dragging {
  opacity: 0.4;
}

.column-item.dragOver {
  background: #FEE2E2;
  transform: scale(1.02);
}

.drag-handle {
  display: flex;
  color: #FCA5A5;
  cursor: grab;
  font-size: 14px;
}

.column-item:hover .drag-handle {
  color: #c8102e;
}

.col-checkbox {
  flex: 1;
}

.col-checkbox :deep(.el-checkbox__label) {
  font-size: 13px;
  color: #c8102e;
  font-weight: 600;
}

.col-checkbox :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background-color: #c8102e;
  border-color: #c8102e;
}

.fix-actions {
  display: flex;
  gap: 2px;
}

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

.fix-btn:hover {
  color: #c8102e;
  background: #FEE2E2;
  transform: scale(1.1);
}

.fix-btn.active {
  color: #fff;
  background: linear-gradient(135deg, #c8102e, #a00d24);
}

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

/* 角色表单弹窗 */
.role-form-dialog .el-dialog {
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 24px 72px rgba(15, 23, 42, 0.22);
}

.role-form-dialog .el-dialog__header {
  padding: 18px 24px;
  margin: 0;
  border-bottom: 1px solid #F1F5F9;
  background: linear-gradient(180deg, #FFFFFF, #FAFBFC);
}

.role-form-dialog .el-dialog__title {
  font-weight: 800;
  color: #0F172A;
  font-size: 16px;
  letter-spacing: 0.3px;
}

.role-form-dialog .el-dialog__body {
  padding: 22px 26px;
  background: #fff;
}

.role-form-dialog .el-dialog__footer {
  padding: 14px 24px;
  background: #FAFBFC;
  border-top: 1px solid #F1F5F9;
}

.role-form-dialog .el-form-item__label {
  font-weight: 700;
  color: #334155;
  font-size: 13px;
}

.role-form-dialog .el-input__wrapper,
.role-form-dialog .el-textarea__inner,
.role-form-dialog .el-select__wrapper {
  border-radius: 10px !important;
  background: #F8FAFC !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  transition: all 0.25s;
}

.role-form-dialog .el-input__wrapper:hover,
.role-form-dialog .el-textarea__inner:hover,
.role-form-dialog .el-select__wrapper:hover {
  background: #fff !important;
  box-shadow: 0 0 0 1px rgba(200, 16, 46, 0.35) inset !important;
}

.role-form-dialog .el-input__wrapper.is-focus,
.role-form-dialog .el-textarea__inner:focus,
.role-form-dialog .el-select__wrapper.is-focused {
  background: #fff !important;
  box-shadow: 0 0 0 1px #c8102e inset, 0 0 0 3px rgba(200, 16, 46, 0.12) !important;
}
/* ============================================================
   ⭐ 所属组织下拉框：纯文本 + 高亮
   ============================================================ */
.role-org-popper.el-select-dropdown {
  padding: 6px !important;
  border-radius: 10px !important;
}
.role-org-popper .el-select-dropdown__item {
  height: 40px;
  line-height: 40px;
  padding: 0 14px;
  font-size: 14px;
  color: #1E293B;
  font-weight: 500;
  border-radius: 8px;
  transition: all 0.2s;
  margin-bottom: 2px;
}
.role-org-popper .el-select-dropdown__item.is-hovering {
  background: #FEF2F2;
  color: #c8102e;
  font-weight: 600;
}
.role-org-popper .el-select-dropdown__item.is-selected {
  color: #c8102e;
  font-weight: 800;
  background: #FEF2F2;
}
.role-org-popper .el-select-dropdown__item.is-selected::after {
  color: #c8102e;
}
</style>