<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Search, Refresh, CirclePlus, Operation, Setting, FullScreen, Close,
  Edit, Delete, Setting as SettingIcon,
  Grid, Rank, DArrowLeft, DArrowRight, Lock,
} from '@element-plus/icons-vue'
import { supabase } from '@/utils/supabase'
import dayjs from 'dayjs'

// ============================================================
// ⭐ 当前登录用户 & 角色判断
// ============================================================
const currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('currentUser') || '{}') }
  catch { return {} }
})()
const isAdmin = currentUser.role === 'admin'
const isCustomer = !isAdmin                      // ⭐ 非管理员一律按客户处理
const myAccount = currentUser.account || ''

// ============================================================
// 功能权限分组
// ============================================================
const PERMISSION_GROUPS_ALL = [
  {
    key: 'home',
    label: '首页',
    items: [
      { key: 'home', label: '首页 / 数据总览' },
    ],
  },
  {
    key: 'driving',
    label: '行车管理',
    items: [
      { key: 'driving_fullmap', label: '全图监控' },
      { key: 'vehicle_fault', label: '车辆故障管理' },
      { key: 'appearance_inspect', label: '外观巡检管理' },
    ],
  },
  {
    key: 'ele_fence',
    label: '电子围栏管理',
    items: [
      { key: 'ele_fence', label: '电子围栏管理' },
    ],
  },
  {
    key: 'operation',
    label: '运营管理',
    items: [
      { key: 'operation', label: '运营管理' },
    ],
  },
  {
    key: 'transport',
    label: '运输管理',
    items: [
      { key: 'waybill', label: '运单管理' },
      { key: 'report', label: '车队运营报告' },
    ],
  },
  {
    key: 'base_data',
    label: '基础数据管理',
    items: [
      { key: 'vehicle_archive', label: '车辆档案' },
      { key: 'driver_archive', label: '司机档案' },
    ],
  },
  {
    key: 'system',
    label: '系统管理',
    items: [
      { key: 'system', label: '系统管理' },
    ],
  },
]

// ⭐ 客户视角：隐藏"系统管理"分组
const PERMISSION_GROUPS = computed(() => {
  if (isCustomer) {
    return PERMISSION_GROUPS_ALL.filter(g => g.key !== 'system')
  }
  return PERMISSION_GROUPS_ALL
})

// ============================================================
// 数据源
// ============================================================
const loading = ref(false)
const allTableData = ref([])
const searchForm = reactive({ name: '' })

// ============================================================
// 生成唯一 code（客户创建的角色前缀固定，避免撞管理员 code）
// ============================================================
const genRoleCode = () => {
  return 'role_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

// ============================================================
// 判断是否管理员角色（code / name 双判）
// ============================================================
// ⭐ 判断是否"系统管理员角色"——只看 code，不看名字
// 客户可以给自己的角色起名"管理员"，只要 code 不是 admin 就视为普通角色
const isAdminRole = (role) => {
  const code = String(role?.code || '').toLowerCase().trim()
  return code === 'admin' || code === 'super_admin'
}

// ============================================================
// 读取角色数据
// ============================================================
const fetchData = async () => {
  loading.value = true
  try {
    let query = supabase
      .from('roles')
      .select('*')
      .order('id', { ascending: true })

    if (isCustomer) {
      query = query.eq('owner_account', myAccount)
    }

    const { data, error } = await query
    if (error) throw error

    let list = data || []
    if (isCustomer) {
      list = list.filter(r => !isAdminRole(r))
    }

    allTableData.value = list.map(item => ({
      ...item,
      remark: item.description || '--',
      hasPermissionConfig: !isAdminRole(item),
    }))
  } catch (e) {
    console.error('加载角色失败:', e)
    ElMessage.error('加载角色失败：' + (e?.message || e))
  } finally {
    loading.value = false
  }
}

// ============================================================
// 搜索过滤
// ============================================================
const filteredData = computed(() => {
  return allTableData.value.filter(row => {
    if (searchForm.name && !(row.name || '').includes(searchForm.name)) return false
    return true
  })
})

const handleSearch = () => {}
const handleReset = () => {
  searchForm.name = ''
}

// ============================================================
// 表格密度 / 列设置 / 全屏
// ============================================================
const DENSITY_KEY = 'role_manage_density' + (isCustomer ? `_cust_${myAccount}` : '_admin')
const tableSize = ref(sessionStorage.getItem(DENSITY_KEY) || 'default')
const densityMultiplier = computed(() => {
  if (tableSize.value === 'large') return 1.15
  if (tableSize.value === 'small') return 0.85
  return 1
})
const handleDensityChange = (cmd) => {
  tableSize.value = cmd
  sessionStorage.setItem(DENSITY_KEY, cmd)
}

const columnPopoverVisible = ref(false)
const DEFAULT_COLUMNS = [
  { prop: 'name',       label: '角色名称', visible: true, fixed: false, minWidth: 140, align: 'center' },
  { prop: 'remark',     label: '备注',     visible: true, fixed: false, minWidth: 200, align: 'left' },
  { prop: 'created_at', label: '创建时间', visible: true, fixed: false, minWidth: 150, align: 'center' },
  { prop: 'updated_at', label: '更新时间', visible: true, fixed: false, minWidth: 150, align: 'center' },
  { prop: 'action',     label: '操作',     visible: true, fixed: 'right', width: 240, align: 'center' },
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
const onDragStart = (index) => { dragIndex.value = index }
const onDragOver = (index) => { dragOverIndex.value = index }
const onDrop = (index) => {
  if (dragIndex.value === -1 || dragIndex.value === index) { dragIndex.value = -1; dragOverIndex.value = -1; return }
  const list = [...columnConfig.value]
  const [item] = list.splice(dragIndex.value, 1)
  list.splice(index, 0, item)
  columnConfig.value = list
  dragIndex.value = -1
  dragOverIndex.value = -1
}
const onDragEnd = () => { dragIndex.value = -1; dragOverIndex.value = -1 }

const isTableFullscreen = ref(false)
const toggleTableFullscreen = () => { isTableFullscreen.value = !isTableFullscreen.value }
const onEscKeydown = (e) => {
  if (e.key === 'Escape' && isTableFullscreen.value) isTableFullscreen.value = false
}

// ============================================================
// 新增 / 编辑
// ============================================================
const dialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)
const formRef = ref(null)

const form = reactive({
  id: null,
  name: '',
  remark: '',
})

const rules = {
  name: [
    { required: true, message: '请输入角色名称', trigger: 'blur' },
    { max: 50, message: '角色名称不能超过50个字符', trigger: 'blur' },
  ],
  remark: [
    { max: 200, message: '备注不能超过200个字符', trigger: 'blur' },
  ],
}

const resetForm = () => {
  form.id = null
  form.name = ''
  form.remark = ''
  formRef.value?.clearValidate?.()
}

const handleAdd = () => {
  isEdit.value = false
  resetForm()
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  resetForm()
  Object.assign(form, {
    id: row.id,
    name: row.name,
    remark: row.remark === '--' ? '' : row.remark,
  })
  dialogVisible.value = true
}

// ============================================================
// 保存角色
// ⭐ 不再限制角色名，通过 code 前缀 + permissions 过滤来限制能力
// ============================================================
const saveRole = async () => {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
    saving.value = true

    // ⭐⭐⭐ 前端重名检查（同客户内不允许同名）
    const dup = allTableData.value.find(r =>
      r.name === form.name && r.id !== form.id
    )
    if (dup) {
      ElMessage.warning(`角色名「${form.name}」已存在`)
      saving.value = false
      return
    }

    if (isEdit.value) {
      const payload = {
        name: form.name,
        description: form.remark || null,
        updated_at: new Date().toISOString(),
      }

      const current = allTableData.value.find(r => r.id === form.id)
      if (!current?.code) {
        payload.code = genRoleCode()
      }

      const { error } = await supabase
        .from('roles')
        .update(payload)
        .eq('id', form.id)
      if (error) throw error
      ElMessage.success('角色更新成功')
    } else {
      const payload = {
        name: form.name,
        description: form.remark || null,
        code: genRoleCode(),
        status: 1,
        permissions: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      if (isCustomer) payload.owner_account = myAccount

      const { error } = await supabase.from('roles').insert(payload)
      if (error) throw error
      ElMessage.success('角色新增成功')
    }

    dialogVisible.value = false
    await fetchData()
  } catch (e) {
    if (e?.message) ElMessage.error('保存失败：' + e.message)
  } finally {
    saving.value = false
  }
}

// ============================================================
// 删除
// ============================================================
const handleDelete = (row) => {
  ElMessageBox.confirm(`确定删除角色「${row.name}」吗？删除后不可恢复。`, '删除确认', {
    confirmButtonText: '确定删除',
    cancelButtonText: '取消',
    type: 'warning',
    confirmButtonClass: 'el-button--danger',
  }).then(async () => {
    try {
      const { error } = await supabase.from('roles').delete().eq('id', row.id)
      if (error) throw error
      ElMessage.success('删除成功')
      await fetchData()
    } catch (e) {
      ElMessage.error('删除失败：' + e.message)
    }
  }).catch(() => {})
}

// ============================================================
// ⭐ 功能配置弹窗
// ============================================================
const permDialogVisible = ref(false)
const permTargetRole = ref(null)
const permSelected = ref([])
const permSaving = ref(false)

const totalPermCount = computed(() => {
  return PERMISSION_GROUPS.value.reduce((sum, g) => sum + g.items.length, 0)
})

const isAllSelected = computed(() => {
  return totalPermCount.value > 0 && permSelected.value.length === totalPermCount.value
})

const parseRolePerms = (role) => {
  const p = role?.permissions
  if (Array.isArray(p)) return p
  if (p && typeof p === 'object' && Array.isArray(p.client)) return p.client
  return []
}

const handlePermissionConfig = (row) => {
  permTargetRole.value = row

  // ⭐ 客户视角：过滤掉 system（双保险）
  let perms = parseRolePerms(row)
  if (isCustomer) {
    perms = perms.filter(p => p !== 'system')
  }
  permSelected.value = perms

  permDialogVisible.value = true
}

const toggleAllPerms = (val) => {
  if (val) {
    const all = []
    PERMISSION_GROUPS.value.forEach(g => g.items.forEach(i => all.push(i.key)))
    permSelected.value = all
  } else {
    permSelected.value = []
  }
}

const isGroupAllSelected = (group) => {
  return group.items.every(i => permSelected.value.includes(i.key))
}

const toggleGroupAll = (group) => {
  if (isGroupAllSelected(group)) {
    group.items.forEach(i => {
      const idx = permSelected.value.indexOf(i.key)
      if (idx > -1) permSelected.value.splice(idx, 1)
    })
  } else {
    group.items.forEach(i => {
      if (!permSelected.value.includes(i.key)) {
        permSelected.value.push(i.key)
      }
    })
  }
}

const savePermissions = async () => {
  if (!permTargetRole.value) return
  try {
    permSaving.value = true

    // ⭐⭐ 客户视角：保存前强制过滤 system（核心防线）
    let perms = [...permSelected.value]
    if (isCustomer) {
      perms = perms.filter(p => p !== 'system')
    }

    const { error } = await supabase
      .from('roles')
      .update({
        permissions: perms,
        updated_at: new Date().toISOString(),
      })
      .eq('id', permTargetRole.value.id)
    if (error) throw error

    ElMessage.success(`「${permTargetRole.value.name}」功能权限已更新`)
    permDialogVisible.value = false
    await fetchData()
  } catch (e) {
    ElMessage.error('保存失败：' + (e?.message || e))
  } finally {
    permSaving.value = false
  }
}

// ============================================================
// 生命周期
// ============================================================
onMounted(async () => {
  document.addEventListener('keydown', onEscKeydown)
  await fetchData()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onEscKeydown)
})
</script>

<template>
  <div class="role-manage-page">
    <!-- ============ 搜索卡片 ============ -->
    <div class="search-card">
      <div class="search-row">
        <div class="search-item">
          <label>角色名称</label>
          <el-input v-model="searchForm.name" placeholder="请输入角色名称" clearable size="default" />
        </div>
        <div class="search-actions">
          <el-button type="primary" class="btn-primary" size="default" @click="handleSearch">
            <el-icon><Search /></el-icon> 查询
          </el-button>
          <el-button class="btn-outline" size="default" @click="handleReset">
            <el-icon><Refresh /></el-icon> 重置
          </el-button>
        </div>
      </div>
    </div>

    <!-- ============ 表格卡片 ============ -->
    <Teleport to="body" :disabled="!isTableFullscreen">
      <div class="table-card-wrap" :class="{ 'is-fullscreen': isTableFullscreen }">
        <div class="table-card">
          <div class="toolbar">
            <div class="toolbar-left">
              <span class="total-hint">共 <b>{{ filteredData.length }}</b> 条</span>
            </div>
            <div class="toolbar-right">
              <el-button type="primary" class="btn-primary" size="default" @click="handleAdd">
                <el-icon><CirclePlus /></el-icon> 新增角色
              </el-button>

              <button class="icon-btn" @click="fetchData" title="刷新">
                <el-icon><Refresh /></el-icon>
              </button>

              <el-dropdown trigger="click" popper-class="density-dropdown-red" @command="handleDensityChange">
                <button class="icon-btn" title="密度">
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

              <el-popover v-model:visible="columnPopoverVisible" placement="bottom-end" :width="280" trigger="click" popper-class="column-setting-popper">
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
                      @dragstart="onDragStart(index)"
                      @dragover.prevent="onDragOver(index)"
                      @drop="onDrop(index)"
                      @dragend="onDragEnd"
                    >
                      <span class="drag-handle"><el-icon><Rank /></el-icon></span>
                      <el-checkbox v-model="col.visible" class="col-checkbox">{{ col.label }}</el-checkbox>
                      <div class="fix-actions">
                        <button class="fix-btn" :class="{ active: col.fixed === 'left' }" @click="toggleFix(col, 'left')" title="左固定"><el-icon><DArrowLeft /></el-icon></button>
                        <button class="fix-btn" :class="{ active: col.fixed === 'right' }" @click="toggleFix(col, 'right')" title="右固定"><el-icon><DArrowRight /></el-icon></button>
                      </div>
                    </div>
                  </div>
                </div>
              </el-popover>

              <button class="icon-btn" :class="{ active: isTableFullscreen }" @click="toggleTableFullscreen" :title="isTableFullscreen ? '退出全屏' : '表格全屏'">
                <el-icon><component :is="isTableFullscreen ? Close : FullScreen" /></el-icon>
              </button>
            </div>
          </div>

          <el-table
            :data="filteredData"
            v-loading="loading"
            border
            stripe
            :size="tableSize"
            class="custom-table"
            :header-cell-style="{ background:'#F8FAFC', color:'#0F172A', fontWeight:'700' }"
          >
            <template v-for="col in visibleColumns" :key="col.prop">
              <el-table-column
                v-if="col.prop === 'created_at' || col.prop === 'updated_at'"
                :label="col.label"
                :min-width="Math.round(col.minWidth * densityMultiplier)"
                :align="col.align"
                :fixed="col.fixed || false"
              >
                <template #default="{ row }">
                  <span class="time-text">
                    {{ row[col.prop] ? dayjs(row[col.prop]).format('YYYY-MM-DD HH:mm:ss') : '--' }}
                  </span>
                </template>
              </el-table-column>

              <el-table-column
                v-else-if="col.prop === 'action'"
                :label="col.label"
                :width="col.width ? Math.round(col.width * densityMultiplier) : 240"
                :align="col.align"
                :fixed="col.fixed || false"
              >
                <template #default="{ row }">
                  <div class="action-cell">
                    <el-button type="text" class="action-btn action-edit" @click="handleEdit(row)">
                      <el-icon><Edit /></el-icon> 编辑
                    </el-button>
                    <el-button
                      v-if="row.hasPermissionConfig"
                      type="text"
                      class="action-btn action-perm"
                      @click="handlePermissionConfig(row)"
                    >
                      <el-icon><SettingIcon /></el-icon> 功能配置
                    </el-button>
                    <el-button type="text" class="action-btn action-delete" @click="handleDelete(row)">
                      <el-icon><Delete /></el-icon> 删除
                    </el-button>
                  </div>
                </template>
              </el-table-column>

              <el-table-column
                v-else
                :prop="col.prop"
                :label="col.label"
                :min-width="Math.round(col.minWidth * densityMultiplier)"
                :align="col.align"
                :fixed="col.fixed || false"
                show-overflow-tooltip
              >
                <template #default="{ row }">
                  <span v-if="col.prop === 'name'" class="role-name-tag">{{ row.name }}</span>
                  <span v-else class="text-content">{{ row[col.prop] || '--' }}</span>
                </template>
              </el-table-column>
            </template>

            <template #empty>
              <div class="empty-state">
                <el-icon class="empty-icon"><Lock /></el-icon>
                <p>暂无角色数据</p>
              </div>
            </template>
          </el-table>
        </div>

        <transition name="fs-fade">
          <button v-if="isTableFullscreen" class="fs-exit-btn" @click="toggleTableFullscreen">
            <el-icon><Close /></el-icon> 退出全屏
          </button>
        </transition>
      </div>
    </Teleport>

    <!-- ============ 新增/编辑弹窗 ============ -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑角色' : '新增角色'"
      width="520px"
      destroy-on-close
      :close-on-click-modal="false"
      class="role-dialog"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" class="role-form">
        <el-form-item label="角色名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入角色名称" maxlength="50" clearable />
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="4"
            placeholder="请输入备注"
            maxlength="200"
            show-word-limit
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <button class="action-btn-footer ghost" @click="dialogVisible = false">取消</button>
        <button class="action-btn-footer primary" :disabled="saving" @click="saveRole">
          {{ saving ? '保存中...' : '确定' }}
        </button>
      </template>
    </el-dialog>

    <!-- ============ 功能配置弹窗 ============ -->
    <el-dialog
      v-model="permDialogVisible"
      width="720px"
      top="6vh"
      destroy-on-close
      :close-on-click-modal="false"
      class="perm-config-dialog"
    >
      <template #header>
        <div class="perm-header">
          <span class="perm-header-title">功能配置</span>
          <span class="perm-header-role">{{ permTargetRole?.name }}</span>
        </div>
      </template>

      <div class="perm-body">
        <div class="perm-toolbar">
          <label class="perm-select-all">
            <el-checkbox
              :model-value="isAllSelected"
              :indeterminate="permSelected.length > 0 && !isAllSelected"
              @change="toggleAllPerms"
            />
            <span class="perm-select-all-text">全选</span>
          </label>
          <div class="perm-count">
            已选 <b>{{ permSelected.length }}</b> / {{ totalPermCount }}
          </div>
        </div>

        <el-checkbox-group v-model="permSelected" class="perm-groups">
          <div
            v-for="group in PERMISSION_GROUPS"
            :key="group.key"
            class="perm-group"
          >
            <div class="perm-group-header">
              <span class="perm-group-name">{{ group.label }}</span>
              <button
                type="button"
                class="perm-group-toggle"
                @click.stop="toggleGroupAll(group)"
              >
                {{ isGroupAllSelected(group) ? '取消全选' : '全选' }}
              </button>
            </div>

            <div class="perm-list">
              <el-checkbox
                v-for="item in group.items"
                :key="item.key"
                :label="item.key"
                class="perm-item"
              >
                {{ item.label }}
              </el-checkbox>
            </div>
          </div>
        </el-checkbox-group>
      </div>

      <template #footer>
        <div class="perm-footer">
          <button class="action-btn-footer ghost" @click="permDialogVisible = false">取消</button>
          <button
            class="action-btn-footer primary"
            :disabled="permSaving"
            @click="savePermissions"
          >
            {{ permSaving ? '保存中...' : '确定保存' }}
          </button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.role-manage-page {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 100%;
  background: #F8FAFC;
  font-size: 13px;
  animation: pageIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes pageIn {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ============ 搜索卡片 ============ */
.search-card {
  background: #fff; border-radius: 10px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  padding: 12px 16px;
}
.search-row { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; }
.search-item { display: flex; align-items: center; gap: 8px; }
.search-item label { font-size: 13px; color: #334155; font-weight: 600; white-space: nowrap; }
.search-item :deep(.el-input) { width: 220px; }
.search-item :deep(.el-input__wrapper) {
  border-radius: 6px !important;
  background: #F8FAFC !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  min-height: 32px;
}
.search-item :deep(.el-input__wrapper:hover) {
  background: #FEF2F2 !important;
  box-shadow: 0 0 0 1px #FCA5A5 inset !important;
}
.search-item :deep(.el-input__wrapper.is-focus) {
  background: #ffffff !important;
  box-shadow: 0 0 0 2px rgba(200, 16, 46, 0.15), 0 0 0 1px #c8102e inset !important;
  transform: translateY(-1px);
}
.search-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }

/* ============ 按钮样式 ============ */
.btn-primary {
  background: linear-gradient(135deg, #c8102e, #a00d24) !important;
  border: none !important; color: #fff !important;
  font-weight: 600; border-radius: 6px !important;
  box-shadow: 0 3px 10px rgba(200, 16, 46, 0.25);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}
.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 5px 14px rgba(200, 16, 46, 0.4); }
.btn-outline {
  border-radius: 6px !important;
  border-color: #CBD5E1 !important; color: #334155;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
  background: #fff !important;
}
.btn-outline:hover { border-color: #c8102e !important; color: #c8102e !important; background: #FEF2F2 !important; transform: translateY(-1px); }

/* ============ 表格卡片 ============ */
.table-card-wrap { display: flex; flex-direction: column; }
.table-card-wrap.is-fullscreen {
  position: fixed; inset: 0; z-index: 9999; padding: 24px;
  background:
    radial-gradient(circle at 20% 20%, rgba(200, 16, 46, 0.08) 0%, transparent 60%),
    radial-gradient(circle at 80% 80%, rgba(200, 16, 46, 0.06) 0%, transparent 60%),
    rgba(248, 250, 252, 0.75);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  animation: fullscreenFadeIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes fullscreenFadeIn { from { opacity: 0; } to { opacity: 1; } }
.table-card-wrap.is-fullscreen .table-card {
  flex: 1; border-radius: 14px;
  box-shadow: 0 20px 60px rgba(200, 16, 46, 0.18), 0 0 0 1px rgba(200, 16, 46, 0.08);
  animation: fullscreenCardIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes fullscreenCardIn {
  from { opacity: 0; transform: scale(0.94) translateY(20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.fs-exit-btn {
  position: absolute; top: 36px; right: 36px; z-index: 10001;
  display: flex; align-items: center; gap: 4px;
  padding: 8px 16px; border: none;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #fff; font-size: 13px; font-weight: 600;
  border-radius: 8px; cursor: pointer;
  box-shadow: 0 6px 20px rgba(200, 16, 46, 0.4);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: inherit;
}
.fs-exit-btn:hover { transform: translateY(-2px) scale(1.03); box-shadow: 0 10px 28px rgba(200, 16, 46, 0.55); }
.fs-fade-enter-active, .fs-fade-leave-active { transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }
.fs-fade-enter-from, .fs-fade-leave-to { opacity: 0; transform: translateY(-10px) scale(0.9); }

.table-card {
  background: #fff; border-radius: 10px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  padding: 12px 16px; flex: 1;
  display: flex; flex-direction: column;
  transition: all 0.3s;
}
.toolbar { display: flex; align-items: center; margin-bottom: 10px; gap: 8px; }
.toolbar-left { display: flex; align-items: center; gap: 8px; }
.total-hint { font-size: 13px; color: #64748B; }
.total-hint b { color: #c8102e; font-family: 'Courier New', monospace; font-size: 14px; }
.toolbar-right { display: flex; align-items: center; gap: 8px; margin-left: auto; }

.icon-btn {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid #E2E8F0; background: #fff;
  border-radius: 6px; color: #64748B; font-size: 15px;
  cursor: pointer;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.icon-btn:hover {
  border-color: #c8102e; color: #c8102e; background: #FEF2F2;
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(200, 16, 46, 0.15);
}
.icon-btn.active {
  border-color: #c8102e; color: #fff;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  box-shadow: 0 3px 10px rgba(200, 16, 46, 0.35);
}
.icon-btn:active { transform: translateY(0) scale(0.95); }

/* ============================================================
   表格样式
   ============================================================ */
.custom-table {
  flex: 1;
  border-radius: 8px;
  overflow: hidden;
  font-size: 13.5px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
:deep(.custom-table .el-table__cell) {
  color: #1E293B;
  border-bottom: 1px solid #F1F5F9;
}
:deep(.custom-table th.el-table__cell) {
  background: #F8FAFC !important;
  color: #0F172A;
  font-weight: 700;
  font-size: 13.5px;
  border-bottom: 1px solid #E2E8F0;
}
:deep(.custom-table .el-table__row:hover td) { background: #FEF2F2 !important; }

:deep(.custom-table.el-table--large .el-table__cell) { padding: 12px 0; }
:deep(.custom-table.el-table--default .el-table__cell) { padding: 8px 0; }
:deep(.custom-table.el-table--small .el-table__cell) { padding: 5px 0; }

.role-name-tag {
  font-weight: 700;
  color: #0F172A;
}
.text-content { color: #334155; }
.time-text {
  color: #475569;
  font-family: 'Courier New', Courier, monospace;
  font-size: 12.5px;
  letter-spacing: -0.2px;
}

/* ============================================================
   操作列
   ============================================================ */
.action-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.action-cell :deep(.el-button) {
  margin: 0 !important;
  padding: 0 !important;
  border: none !important;
  background: transparent !important;
  height: auto !important;
}
.action-cell :deep(.el-button + .el-button) {
  margin-left: 0 !important;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 24px;
  padding: 0 4px;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
  white-space: nowrap;
  user-select: none;
}
.action-btn .el-icon { font-size: 13px; }

.action-edit { color: #c8102e; }
.action-edit:hover { color: #7F1D1D; background: #FEF2F2; }

.action-perm { color: #c8102e; }
.action-perm:hover { color: #7F1D1D; background: #FEF2F2; }

.action-delete { color: #c8102e; }
.action-delete:hover { color: #7F1D1D; background: #FEF2F2; }

/* 空状态 */
.empty-state {
  padding: 50px 20px; display: flex; flex-direction: column;
  align-items: center; gap: 10px; color: #94A3B8;
}
.empty-icon { font-size: 44px; color: #CBD5E1; }
.empty-state p { font-size: 14px; margin: 0; }

/* ============================================================
   新增/编辑弹窗
   ============================================================ */
:deep(.role-dialog .el-dialog) {
  border-radius: 12px; overflow: hidden;
  animation: dialogIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes dialogIn {
  from { opacity: 0; transform: scale(0.92) translateY(20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
:deep(.role-dialog .el-dialog__header) { padding: 16px 20px; border-bottom: 1px solid #F1F5F9; }
:deep(.role-dialog .el-dialog__title) { font-weight: 700; color: #0F172A; font-size: 15px; }
:deep(.role-dialog .el-dialog__body) { padding: 20px 24px; }

.role-form :deep(.el-form-item) { margin-bottom: 20px; }
.role-form :deep(.el-form-item__label) { font-weight: 600; color: #334155; font-size: 13px; }
.role-form :deep(.el-input__wrapper),
.role-form :deep(.el-textarea__inner) {
  border-radius: 8px !important;
  background: #F8FAFC !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.role-form :deep(.el-input__wrapper:hover),
.role-form :deep(.el-textarea__inner:hover) {
  background: #FFFFFF !important;
  box-shadow: 0 0 0 1px rgba(200, 16, 46, 0.4) inset !important;
}
.role-form :deep(.el-input__wrapper.is-focus),
.role-form :deep(.el-textarea__inner:focus) {
  background: #FFFFFF !important;
  box-shadow: 0 0 0 1px #c8102e inset, 0 0 0 3px rgba(200, 16, 46, 0.1) !important;
}

/* 底部按钮 */
.action-btn-footer {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  border: none;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.action-btn-footer.ghost {
  background: #F1F5F9; color: #475569; border: 1px solid #E2E8F0;
}
.action-btn-footer.ghost:hover { background: #E2E8F0; color: #1E293B; transform: translateY(-2px); }
.action-btn-footer.primary {
  color: #FFFFFF;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  box-shadow: 0 6px 20px rgba(200, 16, 46, 0.4);
}
.action-btn-footer.primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 30px rgba(200, 16, 46, 0.55); }
.action-btn-footer.primary:disabled { opacity: 0.6; cursor: not-allowed; }

/* ============================================================
   功能配置弹窗
   ============================================================ */
:deep(.perm-config-dialog .el-dialog) {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.18);
}
:deep(.perm-config-dialog .el-dialog__header) {
  padding: 18px 24px 16px;
  margin: 0;
  border-bottom: 1px solid #F1F5F9;
}
:deep(.perm-config-dialog .el-dialog__body) {
  padding: 0;
  background: #FFFFFF;
}
:deep(.perm-config-dialog .el-dialog__footer) {
  padding: 0;
  border-top: 1px solid #F1F5F9;
}

.perm-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.perm-header-title {
  font-size: 16px;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: 0.3px;
}
.perm-header-role {
  font-size: 13px;
  color: #64748B;
  font-weight: 500;
}

.perm-body {
  padding: 16px 24px 20px;
  max-height: 60vh;
  overflow-y: auto;
}
.perm-body::-webkit-scrollbar { width: 6px; }
.perm-body::-webkit-scrollbar-track { background: transparent; }
.perm-body::-webkit-scrollbar-thumb {
  background: #E2E8F0;
  border-radius: 3px;
}
.perm-body::-webkit-scrollbar-thumb:hover {
  background: #CBD5E1;
}

.perm-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #F8FAFC;
  border-radius: 8px;
  margin-bottom: 16px;
}
.perm-select-all {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}
.perm-select-all :deep(.el-checkbox) {
  margin-right: 0;
  height: auto;
}
.perm-select-all :deep(.el-checkbox__label) {
  padding-left: 0;
}
.perm-select-all :deep(.el-checkbox__inner) {
  width: 16px !important;
  height: 16px !important;
  border-radius: 4px !important;
  border-color: #CBD5E1;
}
.perm-select-all :deep(.el-checkbox__input.is-checked .el-checkbox__inner),
.perm-select-all :deep(.el-checkbox__input.is-indeterminate .el-checkbox__inner) {
  background-color: #c8102e;
  border-color: #c8102e;
}
.perm-select-all-text {
  font-size: 13.5px;
  font-weight: 600;
  color: #0F172A;
}
.perm-count {
  font-size: 13px;
  color: #64748B;
}
.perm-count b {
  color: #c8102e;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  font-weight: 700;
  margin: 0 2px;
}

.perm-groups {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.perm-group {
  padding: 14px 0;
  border-bottom: 1px solid #F1F5F9;
}
.perm-group:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.perm-group:first-child {
  padding-top: 0;
}

.perm-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.perm-group-name {
  position: relative;
  padding-left: 12px;
  font-size: 13.5px;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: 0.3px;
}
.perm-group-name::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 12px;
  border-radius: 2px;
  background: #c8102e;
}
.perm-group-toggle {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 500;
  color: #c8102e;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: inherit;
  border-radius: 4px;
  transition: background 0.2s;
}
.perm-group-toggle:hover {
  background: #FEF2F2;
  text-decoration: underline;
}

.perm-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px 16px;
  padding-left: 12px;
}

.perm-item {
  margin: 0 !important;
  height: auto !important;
  display: flex;
  align-items: center;
}
.perm-item :deep(.el-checkbox__label) {
  font-size: 13px;
  color: #334155;
  padding-left: 8px;
  line-height: 1.4;
  font-weight: 400;
}
.perm-item :deep(.el-checkbox__input.is-checked + .el-checkbox__label) {
  color: #c8102e;
  font-weight: 600;
}
.perm-item :deep(.el-checkbox__inner) {
  width: 15px !important;
  height: 15px !important;
  border-radius: 3px !important;
  border-color: #CBD5E1;
  transition: all 0.2s;
}
.perm-item:hover :deep(.el-checkbox__inner) {
  border-color: #c8102e;
}
.perm-item :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background-color: #c8102e;
  border-color: #c8102e;
}

.perm-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 22px;
  background: #FFFFFF;
}

@media (max-width: 900px) {
  .perm-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .perm-list { grid-template-columns: 1fr; }
}
</style>

<style>
/* ============================================================
   全局样式
   ============================================================ */
.density-dropdown-red.el-dropdown__popper.el-popper {
  border: 2px solid #FFFFFF !important;
  box-shadow: 0 10px 32px rgba(200, 16, 46, 0.18), 0 0 0 1px rgba(200, 16, 46, 0.15) !important;
  border-radius: 10px !important; overflow: hidden; background: #FFFFFF !important;
}
.density-dropdown-red .el-dropdown-menu { padding: 4px !important; background: #FFFFFF !important; }
.density-dropdown-red .el-dropdown-menu__item {
  font-size: 13px !important; color: #c8102e !important;
  font-weight: 600 !important; border-radius: 6px !important;
  padding: 6px 16px !important;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}
.density-dropdown-red .el-dropdown-menu__item:hover {
  color: #ffffff !important;
  background: linear-gradient(135deg, #c8102e, #a00d24) !important;
  transform: translateX(2px);
}
.density-dropdown-red .el-dropdown-menu__item .density-item {
  display: inline-block; padding: 2px 6px; border-radius: 4px;
  transition: all 0.25s;
}
.density-dropdown-red .el-dropdown-menu__item .density-item.active { color: #c8102e; font-weight: 700; }
.density-dropdown-red .el-dropdown-menu__item:hover .density-item.active { color: #ffffff; }

.column-setting-popper.el-popover.el-popper {
  padding: 0 !important;
  border-radius: 12px !important;
  box-shadow: 0 12px 36px rgba(200, 16, 46, 0.18), 0 0 0 1px rgba(200, 16, 46, 0.12) !important;
  border: 2px solid #FFFFFF !important; overflow: hidden; background: #FFFFFF !important;
}
.column-setting-popper .el-popover__title { display: none; }
.column-setting { padding: 0; background: #FFFFFF; }
.column-setting-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-bottom: 1px solid #FEE2E2; background: #FFFFFF;
}
.col-title {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 13px; font-weight: 700; color: #c8102e;
}
.col-title .el-icon { color: #c8102e; font-size: 14px; }
.col-reset {
  font-size: 12.5px; color: #c8102e; cursor: pointer;
  font-weight: 700; padding: 2px 6px; border-radius: 4px;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.col-reset:hover { background: #FEE2E2; text-decoration: underline; transform: scale(1.05); }
.column-setting-body { max-height: 400px; overflow-y: auto; padding: 6px; background: #FFFFFF; }
.column-setting-body::-webkit-scrollbar { width: 4px; }
.column-setting-body::-webkit-scrollbar-thumb { background: #FCA5A5; border-radius: 2px; }
.column-item {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 8px; border-radius: 6px; cursor: grab;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  user-select: none;
}
.column-item:hover { background: #FEF2F2; }
.column-item.dragging { opacity: 0.4; cursor: grabbing; }
.column-item.dragOver { background: #FEE2E2; transform: scale(1.02); box-shadow: 0 0 0 1px rgba(200, 16, 46, 0.2) inset; }
.drag-handle {
  display: flex; align-items: center;
  color: #FCA5A5; cursor: grab; font-size: 14px; transition: color 0.2s;
}
.column-item:hover .drag-handle { color: #c8102e; }
.col-checkbox { flex: 1; font-size: 13px; }
.col-checkbox :deep(.el-checkbox__label) {
  font-size: 13px; color: #c8102e; font-weight: 600; transition: color 0.2s;
}
.col-checkbox :deep(.el-checkbox__inner) {
  border-color: #FCA5A5;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.col-checkbox:hover :deep(.el-checkbox__inner) { border-color: #c8102e; }
.col-checkbox :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background-color: #c8102e; border-color: #c8102e;
}
.col-checkbox :deep(.el-checkbox__input.is-checked + .el-checkbox__label) {
  color: #c8102e; font-weight: 700;
}
.fix-actions { display: flex; gap: 2px; }
.fix-btn {
  width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent;
  border-radius: 4px; color: #FCA5A5; font-size: 13px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.fix-btn:hover { color: #c8102e; background: #FEE2E2; transform: scale(1.1); }
.fix-btn.active {
  color: #ffffff;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  box-shadow: 0 2px 6px rgba(200, 16, 46, 0.35);
}

.el-message-box__btns .el-button--primary {
  background: linear-gradient(135deg, #c8102e, #a00d24) !important;
  border-color: #c8102e !important;
}
</style>