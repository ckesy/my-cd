<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Search, Refresh, CirclePlus, Operation, Setting, FullScreen, Close,
  Edit, Delete, Grid, Rank, DArrowLeft, DArrowRight,
  OfficeBuilding, Share, Van, CircleCheck,
} from '@element-plus/icons-vue'
import { supabase } from '@/utils/supabase'
import dayjs from 'dayjs'

// ============================================================
// 当前登录用户
// ============================================================
const currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('currentUser') || '{}') }
  catch { return {} }
})()
const isAdmin = currentUser.role === 'admin'
const isCustomer = !isAdmin
// ⭐ 子账号也用主账号的 owner_account
const myAccount = currentUser.masterAccount || currentUser.account || ''
const myPhone = currentUser.masterPhone || currentUser.phone || ''

const myCustomerId = ref(null)
const loadMyCustomerId = async () => {
  if (!isCustomer || !myPhone) return
  try {
    const { data } = await supabase.from('customers').select('id').eq('phone', myPhone).maybeSingle()
    if (data) myCustomerId.value = data.id
  } catch (e) { console.warn('查询客户信息失败:', e) }
}

// ============================================================
// 数据源
// ============================================================
const loading = ref(false)
const treeLoading = ref(false)
const allTableData = ref([])
const allVehicles = ref([])
const orgTreeData = ref([])
const selectedOrg = ref(null)
const treeSearchKeyword = ref('')
const orgTreeRef = ref(null)

const searchForm = reactive({ name: '' })

// 组织名 → 车辆数 映射
const orgVehicleCount = computed(() => {
  const map = {}
  allVehicles.value.forEach(v => {
    if (v.org) map[v.org] = (map[v.org] || 0) + 1
  })
  return map
})

const getOrgVehicleCount = (orgName) => orgVehicleCount.value[orgName] || 0
const getTotalVehicleCount = () => allVehicles.value.filter(v => v.org).length

// ⭐ 判断是否是根节点
const isRootOrg = (o) => {
  if (!o) return false
  return o.is_root === true || Number(o.level) === 1 || !o.parent_id
}

// ============================================================
// 读取数据
// ============================================================
const fetchData = async () => {
  loading.value = true
  treeLoading.value = true
  try {
    let orgQuery = supabase
      .from('organizations')
      .select('*')
      .order('level', { ascending: true })
      .order('id', { ascending: true })
    if (isCustomer) orgQuery = orgQuery.eq('owner_account', myAccount)

    let vehicleQuery = supabase.from('vehicles').select('id, org, customer_id')
    if (isCustomer && myCustomerId.value) {
      vehicleQuery = vehicleQuery.eq('customer_id', myCustomerId.value)
    }

    const [orgRes, vehicleRes] = await Promise.all([orgQuery, vehicleQuery])
    if (orgRes.error) throw orgRes.error
    if (vehicleRes.error) throw vehicleRes.error

    allTableData.value = orgRes.data || []
    allVehicles.value = vehicleRes.data || []

    // ⭐ 构建树：真实根节点直接作为顶层
    const map = {}
    allTableData.value.forEach(item => {
      const node = { ...item, children: [] }
      // 给 template 用的 isRoot 标记
      if (isRootOrg(item)) node.isRoot = true
      map[item.id] = node
    })

    const roots = []
    allTableData.value.forEach(item => {
      if (item.parent_id && map[item.parent_id]) {
        map[item.parent_id].children.push(map[item.id])
      } else {
        roots.push(map[item.id])
      }
    })

    orgTreeData.value = roots

    // 恢复选中
    if (selectedOrg.value?.id) {
      const found = allTableData.value.find(o => o.id === selectedOrg.value.id)
      selectedOrg.value = found || roots[0] || null
    } else {
      selectedOrg.value = roots[0] || null
    }

    nextTick(() => {
      if (selectedOrg.value?.id) {
        orgTreeRef.value?.setCurrentKey(selectedOrg.value.id)
      }
    })
  } catch (e) {
    console.error('加载组织失败:', e)
    ElMessage.error('加载组织失败：' + (e?.message || e))
  } finally {
    loading.value = false
    treeLoading.value = false
  }
}

// ============================================================
// 左侧树
// ============================================================
const filterTreeNode = (value, data) => {
  if (!value) return true
  return (data.name || '').includes(value)
}
watch(treeSearchKeyword, (val) => { orgTreeRef.value?.filter(val) })

const handleTreeClick = (data) => { selectedOrg.value = data }

// ============================================================
// 右侧列表
// ============================================================
const displayedData = computed(() => {
  if (!selectedOrg.value) return allTableData.value
  // 根节点 → 显示全部
  if (isRootOrg(selectedOrg.value)) return allTableData.value

  const ids = new Set()
  const collect = (id) => {
    ids.add(id)
    allTableData.value.filter(o => o.parent_id === id).forEach(o => collect(o.id))
  }
  collect(selectedOrg.value.id)
  return allTableData.value.filter(o => ids.has(o.id))
})

const filteredData = computed(() => {
  return displayedData.value.filter(row => {
    if (searchForm.name && !(row.name || '').includes(searchForm.name)) return false
    return true
  })
})

const currentTitle = computed(() => {
  if (!selectedOrg.value) return '组织列表'
  return `${selectedOrg.value.name} - 组织列表`
})

const orgMap = computed(() => {
  const m = {}
  allTableData.value.forEach(o => { m[o.id] = o })
  return m
})

const getParentName = (parentId) => {
  if (!parentId) return '—'
  return orgMap.value[parentId]?.name || '—'
}

const handleSearch = () => {}
const handleReset = () => {
  searchForm.name = ''
  selectedOrg.value = orgTreeData.value[0] || null
  nextTick(() => {
    if (selectedOrg.value?.id) {
      orgTreeRef.value?.setCurrentKey(selectedOrg.value.id)
    }
  })
}

// ============================================================
// 密度
// ============================================================
const DENSITY_KEY = 'org_manage_density' + (isCustomer ? `_cust_${myAccount}` : '_admin')
const tableSize = ref(sessionStorage.getItem(DENSITY_KEY) || 'default')

const densityMultiplier = computed(() =>
  tableSize.value === 'large' ? 1.15 : tableSize.value === 'small' ? 0.85 : 1
)

const handleDensityChange = (cmd) => {
  tableSize.value = cmd
  sessionStorage.setItem(DENSITY_KEY, cmd)
}

// ============================================================
// 列设置
// ============================================================
const columnPopoverVisible = ref(false)
const DEFAULT_COLUMNS = [
  { prop: 'name',         label: '组织名称', visible: true, fixed: false, minWidth: 160, align: 'left' },
  { prop: 'code',         label: '组织简称', visible: true, fixed: false, minWidth: 120, align: 'center' },
  { prop: 'vehicleCount', label: '车辆数',   visible: true, fixed: false, minWidth: 90,  align: 'center' },
  { prop: 'parent',       label: '上级组织', visible: true, fixed: false, minWidth: 150, align: 'center' },
  { prop: 'description',  label: '备注',     visible: true, fixed: false, minWidth: 180, align: 'left' },
  { prop: 'created_at',   label: '创建时间', visible: true, fixed: false, minWidth: 160, align: 'center' },
  { prop: 'action',       label: '操作',     visible: true, fixed: 'right', width: 250, align: 'center' },
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
  if (dragIndex.value === -1 || dragIndex.value === index) {
    dragIndex.value = -1; dragOverIndex.value = -1; return
  }
  const list = [...columnConfig.value]
  const [item] = list.splice(dragIndex.value, 1)
  list.splice(index, 0, item)
  columnConfig.value = list
  dragIndex.value = -1
  dragOverIndex.value = -1
}

// ============================================================
// 全屏
// ============================================================
const isTableFullscreen = ref(false)
const toggleTableFullscreen = () => { isTableFullscreen.value = !isTableFullscreen.value }
const onEscKeydown = (e) => {
  if (e.key === 'Escape' && isTableFullscreen.value) isTableFullscreen.value = false
}

// ============================================================
// 新增 / 编辑组织
// ============================================================
const dialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)
const formRef = ref(null)

const form = reactive({
  id: null,
  parent_id: null,
  name: '',
  code: '',
  description: '',
})

const rules = {
  name: [
    { required: true, message: '请输入组织名称', trigger: 'blur' },
    { max: 50, message: '组织名称不能超过50个字符', trigger: 'blur' },
  ],
  code: [{ max: 30, message: '组织简称不能超过30个字符', trigger: 'blur' }],
  description: [{ max: 200, message: '备注不能超过200个字符', trigger: 'blur' }],
}

// ⭐ 上级组织下拉：排除自己
const parentOptions = computed(() => {
  return allTableData.value.filter(o => o.id !== form.id)
})

const resetForm = () => {
  form.id = null
  // ⭐ 默认父节点 = 当前选中节点，或第一个根节点
  form.parent_id = selectedOrg.value?.id || orgTreeData.value[0]?.id || null
  form.name = ''
  form.code = ''
  form.description = ''
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
    parent_id: row.parent_id || null,
    name: row.name,
    code: row.code || '',
    description: row.description || '',
  })
  dialogVisible.value = true
}

// ⭐ 递归更新所有子孙节点的 level
const cascadeUpdateLevels = async (parentId, parentLevel) => {
  try {
    const children = allTableData.value.filter(o => o.parent_id === parentId)
    for (const child of children) {
      const childLevel = parentLevel + 1
      await supabase.from('organizations').update({ level: childLevel }).eq('id', child.id)
      await cascadeUpdateLevels(child.id, childLevel)
    }
  } catch (e) {
    console.warn('[org] 级联更新 level 失败:', e)
  }
}

// ⭐ 保存：计算 level / is_root / customer_id，同步车辆
const saveOrg = async () => {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
    saving.value = true

    // 1. 计算父节点 / level / is_root
    let realParentId = form.parent_id || null
    let newLevel = 1
    let newIsRoot = true

    if (realParentId) {
      const parent = allTableData.value.find(o => o.id === realParentId)
      if (parent) {
        newLevel = (Number(parent.level) || 1) + 1
        newIsRoot = false
      } else {
        // 父节点找不到 → 视为根
        realParentId = null
        newLevel = 1
        newIsRoot = true
      }
    }

    // 2. ⭐ 客户/子账号不能建根节点
    if (isCustomer && newLevel === 1) {
      ElMessage.warning('您不能在根层级创建组织')
      saving.value = false
      return
    }

    // 3. 计算 customer_id
    let newCustomerId = null
    if (realParentId) {
      const parent = allTableData.value.find(o => o.id === realParentId)
      newCustomerId = parent?.customer_id || null
    }
    if (!newCustomerId && isCustomer && myCustomerId.value) {
      newCustomerId = myCustomerId.value
    }

    // 4. 提前查车辆（编辑时用）
    let oldName = ''
    let vehicleIdsToSync = []
    if (isEdit.value) {
      const oldRow = allTableData.value.find(r => r.id === form.id)
      oldName = oldRow?.name || ''
      vehicleIdsToSync = allVehicles.value
        .filter(v => v.org === oldName)
        .map(v => v.id)
    }

    // 5. 构造 payload
    const payload = {
      name: form.name,
      code: form.code || null,
      description: form.description || null,
      parent_id: realParentId,
      level: newLevel,
      is_root: newIsRoot,
      customer_id: newCustomerId,
      updated_at: new Date().toISOString(),
    }

    if (isEdit.value) {
      // 更新
      const { error } = await supabase.from('organizations').update(payload).eq('id', form.id)
      if (error) throw error

      // ⭐ 如果 level 或 parent 变了 → 级联更新子节点 level
      const oldRow = allTableData.value.find(r => r.id === form.id)
      const oldLevel = Number(oldRow?.level) || 1
      const oldParentId = oldRow?.parent_id || null
      if (oldLevel !== newLevel || oldParentId !== realParentId) {
        await cascadeUpdateLevels(form.id, newLevel)
      }

      // 名字变了 → 同步车辆
      if (oldName && oldName !== form.name && vehicleIdsToSync.length > 0) {
        const { error: syncErr } = await supabase
          .from('vehicles')
          .update({ org: form.name, updated_at: new Date().toISOString() })
          .in('id', vehicleIdsToSync)

        if (syncErr) {
          console.error('同步车辆归属失败:', syncErr)
          ElMessage.warning(`组织更新成功，但 ${vehicleIdsToSync.length} 台车辆归属同步失败：${syncErr.message}`)
        } else {
          ElMessage.success(`组织更新成功，已同步 ${vehicleIdsToSync.length} 台车辆归属`)
        }
      } else {
        ElMessage.success('组织更新成功')
      }
    } else {
      payload.created_at = new Date().toISOString()
      payload.status = 1
      payload.owner_account = isAdmin ? null : myAccount

      const { error } = await supabase.from('organizations').insert(payload)
      if (error) throw error
      ElMessage.success('组织新增成功')
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
// 删除组织
// ============================================================
const handleDelete = async (row) => {
  // ① 检查是否有子组织
  const hasChildren = allTableData.value.some(o => o.parent_id === row.id)
  if (hasChildren) {
    ElMessage.warning('该组织下还有子组织，请先删除子组织')
    return
  }

  // ② 检查是否有车辆
  const vehicleCount = getOrgVehicleCount(row.name)
  let message = ''
  if (vehicleCount > 0) {
    message = `组织「${row.name}」下还有 ${vehicleCount} 台车辆，删除后这些车辆将取消组织归属。确定继续删除吗？`
  } else {
    message = `确定删除组织「${row.name}」吗？删除后不可恢复。`
  }

  try {
    await ElMessageBox.confirm(message, '删除确认', {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }

  try {
    if (vehicleCount > 0) {
      const { error: relErr } = await supabase
        .from('vehicles')
        .update({ org: null, updated_at: new Date().toISOString() })
        .eq('org', row.name)
      if (relErr) throw relErr
    }

    const { error } = await supabase.from('organizations').delete().eq('id', row.id)
    if (error) throw error

    ElMessage.success(vehicleCount > 0 ? `已删除组织，并释放 ${vehicleCount} 台车辆` : '删除成功')
    await fetchData()
  } catch (e) {
    ElMessage.error('删除失败：' + (e?.message || e))
  }
}

// ============================================================
// 分配车辆
// ============================================================
const assignDialogVisible = ref(false)
const assignTargetOrg = ref(null)
const assignSearchKeyword = ref('')
const assignLoading = ref(false)
const assignSaving = ref(false)
const vehiclePool = ref([])
const selectedVehicleIds = ref([])

const openAssignDialog = async (row) => {
  assignTargetOrg.value = row
  assignSearchKeyword.value = ''
  selectedVehicleIds.value = []
  vehiclePool.value = []
  assignDialogVisible.value = true
  await loadVehiclesForAssign(row)
}

const loadVehiclesForAssign = async (orgRow) => {
  assignLoading.value = true
  try {
    let query = supabase
      .from('vehicles')
      .select('id, plate, vin, vehicle_type, fuel_type, org, customer_id')
      .order('id', { ascending: false })

    if (isCustomer && myCustomerId.value) {
      query = query.eq('customer_id', myCustomerId.value)
    }

    const { data, error } = await query
    if (error) throw error

    const list = data || []
    vehiclePool.value = list
    selectedVehicleIds.value = list.filter(v => v.org === orgRow.name).map(v => v.id)

    const latestOrg = allTableData.value.find(o => o.id === orgRow.id)
    if (latestOrg && latestOrg.name !== orgRow.name) {
      assignTargetOrg.value = latestOrg
    }
  } catch (e) {
    console.error('加载车辆失败:', e)
    ElMessage.error('加载车辆失败：' + (e?.message || e))
  } finally {
    assignLoading.value = false
  }
}

const filteredVehicles = computed(() => {
  const kw = assignSearchKeyword.value.trim().toLowerCase()
  if (!kw) return vehiclePool.value
  return vehiclePool.value.filter(v =>
    (v.plate || '').toLowerCase().includes(kw)
    || (v.vin || '').toLowerCase().includes(kw)
    || (v.vehicle_type || '').toLowerCase().includes(kw)
  )
})

const isAllVehiclesSelected = computed(() => {
  if (!filteredVehicles.value.length) return false
  return filteredVehicles.value.every(v => selectedVehicleIds.value.includes(v.id))
})

const isSomeVehiclesSelected = computed(() => {
  return filteredVehicles.value.some(v => selectedVehicleIds.value.includes(v.id))
    && !isAllVehiclesSelected.value
})

const toggleVehicle = (id) => {
  const idx = selectedVehicleIds.value.indexOf(id)
  if (idx > -1) selectedVehicleIds.value.splice(idx, 1)
  else selectedVehicleIds.value.push(id)
}

const toggleAllVehicles = () => {
  if (isAllVehiclesSelected.value) {
    const idsToRemove = new Set(filteredVehicles.value.map(v => v.id))
    selectedVehicleIds.value = selectedVehicleIds.value.filter(id => !idsToRemove.has(id))
  } else {
    const existing = new Set(selectedVehicleIds.value)
    filteredVehicles.value.forEach(v => {
      if (!existing.has(v.id)) selectedVehicleIds.value.push(v.id)
    })
  }
}

const getVehicleOrgLabel = (v) => {
  if (!v.org) return null
  const latestTarget = allTableData.value.find(o => o.id === assignTargetOrg.value?.id)
  const currentOrgName = latestTarget?.name || assignTargetOrg.value?.name || ''
  if (v.org === currentOrgName) return { type: 'current', text: '已属于本组织' }
  return { type: 'other', text: `属于 ${v.org}` }
}

const saveAssign = async () => {
  if (!assignTargetOrg.value) return
  assignSaving.value = true
  try {
    const orgName = assignTargetOrg.value.name
    const selectedSet = new Set(selectedVehicleIds.value)

    const toAssign = vehiclePool.value
      .filter(v => selectedSet.has(v.id) && v.org !== orgName)
      .map(v => v.id)

    const toRelease = vehiclePool.value
      .filter(v => !selectedSet.has(v.id) && v.org === orgName)
      .map(v => v.id)

    const now = new Date().toISOString()

    if (toAssign.length) {
      const { error } = await supabase.from('vehicles').update({ org: orgName, updated_at: now }).in('id', toAssign)
      if (error) throw error
    }
    if (toRelease.length) {
      const { error } = await supabase.from('vehicles').update({ org: null, updated_at: now }).in('id', toRelease)
      if (error) throw error
    }

    ElMessage.success(`「${orgName}」车辆分配已更新（新增 ${toAssign.length} 台，释放 ${toRelease.length} 台）`)
    assignDialogVisible.value = false
    await fetchData()
  } catch (e) {
    console.error('保存失败:', e)
    ElMessage.error('保存失败：' + (e?.message || e))
  } finally {
    assignSaving.value = false
  }
}

// ============================================================
// 生命周期
// ============================================================
onMounted(async () => {
  document.addEventListener('keydown', onEscKeydown)
  if (isCustomer) await loadMyCustomerId()
  fetchData()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onEscKeydown)
})
</script>

<template>
  <div class="org-manage-page">
    <!-- 左侧：组织架构树 -->
    <aside class="org-aside">
      <div class="aside-header">
        <el-icon><Share /></el-icon>
        <span>组织架构</span>
      </div>

      <div class="aside-search">
        <el-input v-model="treeSearchKeyword" placeholder="搜索组织" clearable size="default">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
      </div>

      <div class="aside-tree" v-loading="treeLoading">
        <el-tree
          v-if="orgTreeData.length > 0"
          ref="orgTreeRef"
          :data="orgTreeData"
          node-key="id"
          :props="{ children: 'children', label: 'name' }"
          :default-expand-all="true"
          :filter-node-method="filterTreeNode"
          :expand-on-click-node="false"
          highlight-current
          @node-click="handleTreeClick"
          class="org-tree"
        >
          <template #default="{ data }">
            <div class="tree-node" :class="{ 'is-root': data.isRoot }">
              <el-icon class="node-icon">
                <component :is="data.isRoot ? OfficeBuilding : Share" />
              </el-icon>
              <span class="node-label">{{ data.name }}</span>
              <span v-if="data.isRoot" class="node-vehicle-count root">
                {{ getTotalVehicleCount() }} 辆
              </span>
              <span
                v-else
                class="node-vehicle-count"
                :class="{ empty: getOrgVehicleCount(data.name) === 0 }"
              >
                {{ getOrgVehicleCount(data.name) }} 辆
              </span>
            </div>
          </template>
        </el-tree>

        <div v-else-if="!treeLoading" class="tree-empty">
          <el-icon><Share /></el-icon>
          <p>暂无组织</p>
          <span class="empty-tip">点击右侧「新增组织」开始创建</span>
        </div>
      </div>
    </aside>

    <!-- 右侧：组织列表 -->
    <main class="org-main">
      <Teleport to="body" :disabled="!isTableFullscreen">
        <div class="main-panel" :class="{ 'is-fullscreen': isTableFullscreen }">
          <div class="main-header">
            <span class="main-title">{{ currentTitle }}</span>
            <el-button type="primary" class="btn-primary" @click="handleAdd">
              <el-icon><CirclePlus /></el-icon> 新增组织
            </el-button>
          </div>

          <div class="search-bar">
            <div class="search-item">
              <label>组织名称</label>
              <el-input v-model="searchForm.name" placeholder="请输入组织名称" clearable />
            </div>
            <div class="search-actions">
              <el-button type="primary" class="btn-primary" @click="handleSearch">
                <el-icon><Search /></el-icon> 查询
              </el-button>
              <el-button class="btn-outline" @click="handleReset">
                <el-icon><Refresh /></el-icon> 重置
              </el-button>
            </div>
          </div>

          <div class="toolbar-row">
            <span class="total-hint">共 <b>{{ filteredData.length }}</b> 条</span>
            <div class="toolbar-right">
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
                      @dragstart="dragIndex = index"
                      @dragover.prevent="dragOverIndex = index"
                      @drop="onDrop(index)"
                      @dragend="dragIndex = -1; dragOverIndex = -1"
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

          <div class="table-wrap">
            <el-table
              :data="filteredData"
              v-loading="loading"
              element-loading-text="加载中…"
              element-loading-background="rgba(255, 255, 255, 0.88)"
              border
              stripe
              :size="tableSize"
              height="100%"
              class="custom-table"
              :header-cell-style="{ background:'#F8FAFC', color:'#0F172A', fontWeight:'700' }"
            >
              <template v-for="col in visibleColumns" :key="col.prop">
                <el-table-column
                  v-if="col.prop === 'vehicleCount'"
                  :label="col.label"
                  :min-width="Math.round(col.minWidth * densityMultiplier)"
                  :align="col.align"
                  :fixed="col.fixed || false"
                >
                  <template #default="{ row }">
                    <span class="vehicle-count-tag" :class="{ empty: getOrgVehicleCount(row.name) === 0 }">
                      {{ getOrgVehicleCount(row.name) }}
                    </span>
                  </template>
                </el-table-column>

                <el-table-column
                  v-else-if="col.prop === 'parent'"
                  :label="col.label"
                  :min-width="Math.round(col.minWidth * densityMultiplier)"
                  :align="col.align"
                  :fixed="col.fixed || false"
                  show-overflow-tooltip
                >
                  <template #default="{ row }">
                    <span class="text-content">{{ getParentName(row.parent_id) }}</span>
                  </template>
                </el-table-column>

                <el-table-column
                  v-else-if="col.prop === 'created_at'"
                  :label="col.label"
                  :min-width="Math.round(col.minWidth * densityMultiplier)"
                  :align="col.align"
                  :fixed="col.fixed || false"
                >
                  <template #default="{ row }">
                    <span class="time-text">
                      {{ row.created_at ? dayjs(row.created_at).format('YYYY-MM-DD HH:mm:ss') : '--' }}
                    </span>
                  </template>
                </el-table-column>

                <!-- 操作列：编辑 / 分配车辆 / 删除 -->
                <el-table-column
                  v-else-if="col.prop === 'action'"
                  :label="col.label"
                  :width="col.width ? Math.round(col.width * densityMultiplier) : 250"
                  :align="col.align"
                  :fixed="col.fixed || false"
                >
                  <template #default="{ row }">
                    <div class="action-cell">
                      <el-button type="text" class="action-btn action-edit" @click="handleEdit(row)">
                        <el-icon><Edit /></el-icon> 编辑
                      </el-button>
                      <el-button type="text" class="action-btn action-assign" @click="openAssignDialog(row)">
                        <el-icon><Van /></el-icon> 分配车辆
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
                    <span v-if="col.prop === 'name'" class="org-name-tag">{{ row.name }}</span>
                    <span v-else class="text-content">{{ row[col.prop] || '--' }}</span>
                  </template>
                </el-table-column>
              </template>

              <template #empty>
                <div class="empty-state">
                  <el-icon class="empty-icon"><OfficeBuilding /></el-icon>
                  <p>暂无组织数据</p>
                </div>
              </template>
            </el-table>
          </div>
        </div>
      </Teleport>

      <transition name="fs-fade">
        <button v-if="isTableFullscreen" class="fs-exit-btn" @click="toggleTableFullscreen">
          <el-icon><Close /></el-icon> 退出全屏
        </button>
      </transition>
    </main>

    <!-- 新增 / 编辑组织弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑组织' : '新增组织'"
      width="520px"
      destroy-on-close
      :close-on-click-modal="false"
      class="org-dialog"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" class="org-form">
        <!-- ⭐ 上级组织：编辑/新增都可以修改 -->
        <el-form-item label="上级组织">
          <el-select
            v-model="form.parent_id"
            placeholder="请选择上级组织"
            filterable
            clearable
            style="width: 100%"
          >
            <el-option
              v-for="o in parentOptions"
              :key="o.id"
              :label="o.name"
              :value="o.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="组织名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入组织名称" maxlength="50" clearable />
        </el-form-item>

        <el-form-item label="组织简称" prop="code">
          <el-input v-model="form.code" placeholder="请输入组织简称" maxlength="30" clearable />
        </el-form-item>

        <el-form-item label="备注" prop="description">
          <el-input
            v-model="form.description"
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
        <button class="action-btn-footer primary" :disabled="saving" @click="saveOrg">
          {{ saving ? '保存中...' : '确定' }}
        </button>
      </template>
    </el-dialog>

    <!-- 分配车辆弹窗 -->
    <el-dialog
      v-model="assignDialogVisible"
      width="720px"
      top="6vh"
      destroy-on-close
      :close-on-click-modal="false"
      class="assign-vehicle-dialog"
    >
      <template #header>
        <div class="assign-header">
          <span class="assign-title">分配车辆</span>
          <span class="assign-org">
            <el-icon><OfficeBuilding /></el-icon>
            {{ assignTargetOrg?.name }}
          </span>
        </div>
      </template>

      <div class="assign-body">
        <div class="assign-toolbar">
          <div class="assign-toolbar-left">
            <el-input
              v-model="assignSearchKeyword"
              placeholder="搜索车牌 / VIN / 车型"
              clearable
              size="default"
              class="assign-search"
            >
              <template #prefix><el-icon><Search /></el-icon></template>
            </el-input>
          </div>
          <div class="assign-toolbar-right">
            <label class="assign-select-all">
              <el-checkbox
                :model-value="isAllVehiclesSelected"
                :indeterminate="isSomeVehiclesSelected"
                @change="toggleAllVehicles"
              />
              <span class="assign-select-all-text">全选</span>
            </label>
            <div class="assign-count">
              已选 <b>{{ selectedVehicleIds.length }}</b> / {{ vehiclePool.length }}
            </div>
          </div>
        </div>

        <div class="assign-list-wrap" v-loading="assignLoading" element-loading-text="加载中…">
          <div v-if="filteredVehicles.length === 0" class="assign-empty">
            <el-icon><Van /></el-icon>
            <p>{{ assignSearchKeyword ? '没有匹配的车辆' : '当前账号下暂无可分配的车辆' }}</p>
          </div>

          <div
            v-for="v in filteredVehicles"
            :key="v.id"
            class="vehicle-item"
            :class="{ selected: selectedVehicleIds.includes(v.id) }"
            @click="toggleVehicle(v.id)"
          >
            <span class="vehicle-check">
              <el-icon v-if="selectedVehicleIds.includes(v.id)"><CircleCheck /></el-icon>
              <span v-else class="check-empty"></span>
            </span>
            <div class="vehicle-info">
              <div class="vehicle-plate">{{ v.plate || '--' }}</div>
              <div class="vehicle-meta">
                <span v-if="v.vin">VIN: {{ v.vin }}</span>
                <span v-if="v.vehicle_type">· {{ v.vehicle_type }}</span>
                <span v-if="v.fuel_type">· {{ v.fuel_type }}</span>
              </div>
            </div>
            <!-- 归属标签：跟随最新的组织名 -->
            <template v-if="getVehicleOrgLabel(v)">
              <div class="vehicle-tag" :class="getVehicleOrgLabel(v).type">
                {{ getVehicleOrgLabel(v).text }}
              </div>
            </template>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="assign-footer">
          <div class="assign-footer-tip">
            已选择 <b>{{ selectedVehicleIds.length }}</b> 台车辆
          </div>
          <div class="assign-footer-actions">
            <button class="action-btn-footer ghost" @click="assignDialogVisible = false">取消</button>
            <button class="action-btn-footer primary" :disabled="assignSaving" @click="saveAssign">
              {{ assignSaving ? '保存中...' : '确定保存' }}
            </button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ============================================================
   页面整体布局
   ============================================================ */
.org-manage-page {
  display: flex;
  gap: 12px;
  padding: 12px;
  height: 100vh;
  max-height: 100vh;
  box-sizing: border-box;
  overflow: hidden;
  background: #F8FAFC;
  font-size: 13px;
  animation: pageIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes pageIn {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ============================================================
   左侧树
   ============================================================ */
.org-aside {
  width: 260px;
  flex-shrink: 0;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.aside-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  font-size: 15px;
  font-weight: 700;
  color: #0F172A;
  border-bottom: 1px solid #F1F5F9;
  flex-shrink: 0;
}
.aside-header .el-icon { color: #c8102e; font-size: 18px; }
.aside-search {
  padding: 10px 12px;
  flex-shrink: 0;
}
.aside-search :deep(.el-input__wrapper) {
  border-radius: 6px !important;
  background: #F8FAFC !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.aside-search :deep(.el-input__wrapper:hover) {
  background: #FEF2F2 !important;
  box-shadow: 0 0 0 1px #FCA5A5 inset !important;
}
.aside-search :deep(.el-input__wrapper.is-focus) {
  background: #fff !important;
  box-shadow: 0 0 0 2px rgba(200, 16, 46, 0.15), 0 0 0 1px #c8102e inset !important;
}
.aside-tree {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 8px 12px;
  min-height: 0;
}
.aside-tree::-webkit-scrollbar { width: 4px; }
.aside-tree::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 2px; }
.aside-tree::-webkit-scrollbar-thumb:hover { background: #CBD5E1; }

.org-tree { background: transparent; }
.org-tree :deep(.el-tree-node__content) {
  height: 36px;
  border-radius: 6px;
  margin: 1px 0;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.org-tree :deep(.el-tree-node__content:hover) { background: #FEF2F2; }
.org-tree :deep(.el-tree-node.is-current > .el-tree-node__content) {
  background: linear-gradient(135deg, #FEE2E2, #FECACA);
  color: #c8102e;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(200, 16, 46, 0.12);
}
.org-tree :deep(.el-tree-node.is-current > .el-tree-node__content .node-icon) { color: #c8102e; }

.tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  padding-right: 4px;
}
.tree-node.is-root .node-label { font-weight: 800; color: #0F172A; letter-spacing: 0.3px; }
.tree-node.is-root .node-icon { color: #7C3AED; }
.node-icon {
  font-size: 14px;
  color: #94A3B8;
  flex-shrink: 0;
  transition: color 0.25s;
}
.tree-node:hover .node-icon { color: #c8102e; }
.tree-node.is-root:hover .node-icon { color: #7C3AED; }
.node-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.node-vehicle-count {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  height: 18px;
  padding: 0 6px;
  border-radius: 9px;
  font-size: 11px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
  background: linear-gradient(135deg, #FEF2F2, #FEE2E2);
  color: #c8102e;
  letter-spacing: -0.2px;
  transition: all 0.25s;
}
.node-vehicle-count.empty {
  background: #F1F5F9;
  color: #94A3B8;
  font-weight: 500;
}
.node-vehicle-count.root {
  background: linear-gradient(135deg, #EDE9FE, #DDD6FE);
  color: #7C3AED;
  font-weight: 800;
}
.tree-node:hover .node-vehicle-count:not(.empty) {
  transform: scale(1.08);
  box-shadow: 0 2px 6px rgba(200, 16, 46, 0.2);
}

.tree-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 60px 20px;
  color: #94A3B8;
}
.tree-empty .el-icon { font-size: 36px; color: #CBD5E1; }
.tree-empty p { font-size: 14px; font-weight: 600; color: #64748B; margin: 0; }
.tree-empty .empty-tip { font-size: 12px; color: #CBD5E1; }

/* ============================================================
   右侧主面板
   ============================================================ */
.org-main {
  flex: 1;
  min-width: 0;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.main-panel {
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  overflow: hidden;
  transition: all 0.3s;
}
.main-panel.is-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 9999;
  border-radius: 0;
  padding: 24px 28px;
  overflow: hidden;
  background:
    radial-gradient(circle at 20% 20%, rgba(200, 16, 46, 0.08) 0%, transparent 60%),
    radial-gradient(circle at 80% 80%, rgba(200, 16, 46, 0.06) 0%, transparent 60%),
    rgba(248, 250, 252, 0.85);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  animation: fullscreenFadeIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes fullscreenFadeIn { from { opacity: 0; } to { opacity: 1; } }

.main-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid #F1F5F9;
  flex-shrink: 0;
}
.main-title {
  font-size: 16px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: 0.3px;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 4px;
  flex-shrink: 0;
}
.search-item { display: flex; align-items: center; gap: 8px; }
.search-item label { font-size: 13px; color: #334155; font-weight: 600; white-space: nowrap; }
.search-item :deep(.el-input) { width: 260px; }
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
  background: #fff !important;
  box-shadow: 0 0 0 2px rgba(200, 16, 46, 0.15), 0 0 0 1px #c8102e inset !important;
  transform: translateY(-1px);
}
.search-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }

.btn-primary {
  background: linear-gradient(135deg, #c8102e, #a00d24) !important;
  border: none !important;
  color: #fff !important;
  font-weight: 600;
  border-radius: 6px !important;
  box-shadow: 0 3px 10px rgba(200, 16, 46, 0.25);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}
.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 5px 14px rgba(200, 16, 46, 0.4); }
.btn-outline {
  border-radius: 6px !important;
  border-color: #CBD5E1 !important;
  color: #334155;
  background: #fff !important;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}
.btn-outline:hover {
  border-color: #c8102e !important;
  color: #c8102e !important;
  background: #FEF2F2 !important;
  transform: translateY(-1px);
}

.toolbar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
  flex-shrink: 0;
}
.total-hint { font-size: 13px; color: #64748B; }
.total-hint b { color: #c8102e; font-family: 'Courier New', monospace; font-size: 14px; }
.toolbar-right { display: flex; align-items: center; gap: 8px; }

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

.table-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border-radius: 8px;
}

/* ============================================================
   表格
   ============================================================ */
.custom-table {
  border-radius: 8px;
  overflow: hidden;
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
:deep(.custom-table .el-table__cell) {
  color: #1E293B;
  font-size: 13px;
  border-bottom: 1px solid #F1F5F9;
}
:deep(.custom-table th.el-table__cell) {
  background: #F8FAFC !important;
  color: #0F172A;
  font-weight: 700;
  font-size: 13px;
  border-bottom: 1px solid #E2E8F0;
  padding: 9px 0;
}
:deep(.custom-table td.el-table__cell) { padding: 9px 0; }
:deep(.custom-table.el-table--large td.el-table__cell) { padding: 13px 0; }
:deep(.custom-table.el-table--default td.el-table__cell) { padding: 9px 0; }
:deep(.custom-table.el-table--small td.el-table__cell) { padding: 5px 0; }
:deep(.custom-table .el-table__row:hover td) { background: #FEF2F2 !important; }

.org-name-tag { font-weight: 600; color: #0F172A; font-size: 13px; }
.text-content { color: #334155; font-size: 13px; }
.time-text {
  color: #475569;
  font-family: 'Courier New', Courier, monospace;
  font-size: 12.5px;
  letter-spacing: -0.2px;
}

.vehicle-count-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  height: 22px;
  padding: 0 10px;
  border-radius: 11px;
  font-size: 12.5px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
  background: linear-gradient(135deg, #FEF2F2, #FEE2E2);
  color: #c8102e;
  transition: all 0.25s;
}
.vehicle-count-tag.empty {
  background: #F1F5F9;
  color: #94A3B8;
  font-weight: 500;
}

/* 操作列 */
.action-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.action-cell :deep(.el-button) {
  margin: 0 !important;
  padding: 0 !important;
  border: none !important;
  background: transparent !important;
  height: auto !important;
}
.action-cell :deep(.el-button + .el-button) { margin-left: 0 !important; }
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
.action-assign { color: #0EA5E9; }
.action-assign:hover { color: #0369A1; background: #F0F9FF; }
.action-delete { color: #EF4444; }
.action-delete:hover { color: #991B1B; background: #FEE2E2; }

.empty-state {
  padding: 50px 20px; display: flex; flex-direction: column;
  align-items: center; gap: 10px; color: #94A3B8;
}
.empty-icon { font-size: 44px; color: #CBD5E1; }
.empty-state p { font-size: 14px; margin: 0; }

/* 退出全屏 */
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
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: inherit;
}
.fs-exit-btn:hover {
  transform: translateY(-2px) scale(1.03);
  box-shadow: 0 10px 28px rgba(200, 16, 46, 0.55);
}
.fs-fade-enter-active, .fs-fade-leave-active {
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.fs-fade-enter-from, .fs-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.9);
}

/* ============================================================
   弹窗
   ============================================================ */
:deep(.org-dialog .el-dialog) {
  border-radius: 12px;
  overflow: hidden;
  animation: dialogIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes dialogIn {
  from { opacity: 0; transform: scale(0.92) translateY(20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
:deep(.org-dialog .el-dialog__header) {
  padding: 16px 20px;
  border-bottom: 1px solid #F1F5F9;
}
:deep(.org-dialog .el-dialog__title) { font-weight: 700; color: #0F172A; font-size: 15px; }
:deep(.org-dialog .el-dialog__body) { padding: 20px 24px; }

.org-form :deep(.el-form-item) { margin-bottom: 20px; }
.org-form :deep(.el-form-item__label) { font-weight: 600; color: #334155; font-size: 13px; }
.org-form :deep(.el-input__wrapper),
.org-form :deep(.el-textarea__inner),
.org-form :deep(.el-select__wrapper) {
  border-radius: 8px !important;
  background: #F8FAFC !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.org-form :deep(.el-input__wrapper:hover),
.org-form :deep(.el-textarea__inner:hover),
.org-form :deep(.el-select__wrapper:hover) {
  background: #FFFFFF !important;
  box-shadow: 0 0 0 1px rgba(200, 16, 46, 0.4) inset !important;
}
.org-form :deep(.el-input__wrapper.is-focus),
.org-form :deep(.el-textarea__inner:focus),
.org-form :deep(.el-select__wrapper.is-focused) {
  background: #FFFFFF !important;
  box-shadow: 0 0 0 1px #c8102e inset, 0 0 0 3px rgba(200, 16, 46, 0.1) !important;
}

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
   分配车辆弹窗
   ============================================================ */
:deep(.assign-vehicle-dialog .el-dialog) {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.18);
  animation: dialogIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
:deep(.assign-vehicle-dialog .el-dialog__header) {
  padding: 16px 22px;
  margin: 0;
  border-bottom: 1px solid #F1F5F9;
}
:deep(.assign-vehicle-dialog .el-dialog__body) { padding: 0; background: #FFFFFF; }
:deep(.assign-vehicle-dialog .el-dialog__footer) { padding: 0; border-top: 1px solid #F1F5F9; }

.assign-header { display: flex; align-items: center; gap: 12px; }
.assign-title { font-size: 16px; font-weight: 700; color: #0F172A; letter-spacing: 0.3px; }
.assign-org {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 10px;
  border-radius: 999px;
  background: #FEF2F2;
  color: #c8102e;
  font-size: 12.5px;
  font-weight: 600;
}
.assign-org .el-icon { font-size: 13px; }

.assign-body {
  padding: 14px 22px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.assign-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.assign-toolbar-left { flex-shrink: 0; }
.assign-search { width: 260px; }
.assign-search :deep(.el-input__wrapper) {
  border-radius: 6px !important;
  background: #F8FAFC !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  min-height: 32px;
}
.assign-search :deep(.el-input__wrapper:hover) {
  background: #FEF2F2 !important;
  box-shadow: 0 0 0 1px #FCA5A5 inset !important;
}
.assign-search :deep(.el-input__wrapper.is-focus) {
  background: #fff !important;
  box-shadow: 0 0 0 2px rgba(200, 16, 46, 0.15), 0 0 0 1px #c8102e inset !important;
}
.assign-toolbar-right { display: flex; align-items: center; gap: 16px; }
.assign-select-all {
  display: inline-flex; align-items: center; gap: 6px;
  cursor: pointer;
  user-select: none;
}
.assign-select-all :deep(.el-checkbox) { margin: 0; height: auto; }
.assign-select-all :deep(.el-checkbox__label) { padding-left: 0; }
.assign-select-all :deep(.el-checkbox__inner) {
  width: 16px !important; height: 16px !important;
  border-radius: 4px !important; border-color: #CBD5E1;
  transition: all 0.2s;
}
.assign-select-all :deep(.el-checkbox__input.is-checked .el-checkbox__inner),
.assign-select-all :deep(.el-checkbox__input.is-indeterminate .el-checkbox__inner) {
  background-color: #c8102e;
  border-color: #c8102e;
}
.assign-select-all:hover :deep(.el-checkbox__inner) { border-color: #c8102e; }
.assign-select-all-text { font-size: 13px; font-weight: 600; color: #0F172A; }
.assign-count { font-size: 13px; color: #64748B; }
.assign-count b {
  color: #c8102e;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  font-weight: 700;
  margin: 0 2px;
}

.assign-list-wrap {
  min-height: 220px;
  max-height: 400px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid #F1F5F9;
  border-radius: 8px;
  background: #FAFBFC;
}
.assign-list-wrap::-webkit-scrollbar { width: 6px; }
.assign-list-wrap::-webkit-scrollbar-track { background: transparent; }
.assign-list-wrap::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 3px; }
.assign-list-wrap::-webkit-scrollbar-thumb:hover { background: #CBD5E1; }

.assign-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 60px 20px;
  color: #94A3B8;
}
.assign-empty .el-icon { font-size: 36px; color: #CBD5E1; }
.assign-empty p { font-size: 13px; margin: 0; }

.vehicle-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid transparent;
  margin-bottom: 4px;
  background: #FFFFFF;
}
.vehicle-item:hover {
  background: #FEF2F2;
  border-color: rgba(200, 16, 46, 0.25);
}
.vehicle-item.selected {
  background: linear-gradient(135deg, #FEF2F2, #FEE2E2);
  border-color: rgba(200, 16, 46, 0.35);
  box-shadow: 0 2px 8px rgba(200, 16, 46, 0.08);
}

.vehicle-check {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #c8102e;
  font-size: 18px;
  transition: all 0.2s;
}
.vehicle-item.selected .vehicle-check { transform: scale(1.05); }
.check-empty {
  width: 15px;
  height: 15px;
  border-radius: 4px;
  border: 1.5px solid #CBD5E1;
  transition: all 0.2s;
}
.vehicle-item:hover .check-empty { border-color: #c8102e; }

.vehicle-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.vehicle-plate { font-size: 13.5px; font-weight: 700; color: #0F172A; letter-spacing: 0.3px; }
.vehicle-meta {
  font-size: 12px;
  color: #94A3B8;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.vehicle-tag {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.2px;
}
.vehicle-tag.current { background: #D1FAE5; color: #059669; }
.vehicle-tag.other { background: #F1F5F9; color: #64748B; }

.assign-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 22px;
  background: #FFFFFF;
}
.assign-footer-tip { font-size: 13px; color: #64748B; }
.assign-footer-tip b {
  color: #c8102e;
  font-family: 'Courier New', monospace;
  font-size: 15px;
  font-weight: 700;
  margin: 0 2px;
}
.assign-footer-actions { display: flex; align-items: center; gap: 10px; }

@media (max-width: 768px) {
  .assign-search { width: 180px; }
  .assign-toolbar { flex-wrap: wrap; }
}
</style>

<style>
html, body {
  height: 100%;
  overflow: hidden;
}

.density-dropdown-red.el-dropdown__popper.el-popper {
  border: 2px solid #FFFFFF !important;
  box-shadow: 0 10px 32px rgba(200, 16, 46, 0.18), 0 0 0 1px rgba(200, 16, 46, 0.15) !important;
  border-radius: 10px !important;
  overflow: hidden;
  background: #FFFFFF !important;
}
.density-dropdown-red .el-dropdown-menu { padding: 4px !important; background: #FFFFFF !important; }
.density-dropdown-red .el-dropdown-menu__item {
  font-size: 13px !important;
  color: #c8102e !important;
  font-weight: 600 !important;
  border-radius: 6px !important;
  padding: 6px 16px !important;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}
.density-dropdown-red .el-dropdown-menu__item:hover {
  color: #ffffff !important;
  background: linear-gradient(135deg, #c8102e, #a00d24) !important;
  transform: translateX(2px);
}
.density-dropdown-red .el-dropdown-menu__item .density-item {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.25s;
}
.density-dropdown-red .el-dropdown-menu__item .density-item.active { color: #c8102e; font-weight: 700; }
.density-dropdown-red .el-dropdown-menu__item:hover .density-item.active { color: #ffffff; }

.column-setting-popper.el-popover.el-popper {
  padding: 0 !important;
  border-radius: 12px !important;
  box-shadow: 0 12px 36px rgba(200, 16, 46, 0.18), 0 0 0 1px rgba(200, 16, 46, 0.12) !important;
  border: 2px solid #FFFFFF !important;
  overflow: hidden;
  background: #FFFFFF !important;
}
.column-setting-popper .el-popover__title { display: none; }
.column-setting { padding: 0; background: #FFFFFF; }
.column-setting-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #FEE2E2;
  background: #FFFFFF;
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