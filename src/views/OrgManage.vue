<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Search, Refresh, CirclePlus, Operation, Setting, FullScreen, Close,
  Edit, Delete, Grid, Rank, DArrowLeft, DArrowRight,
  OfficeBuilding, Share, Van, CircleCheck, ArrowLeft, ArrowRight, Filter,
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
const myAccount = currentUser.masterAccount || currentUser.account || ''
const myPhone = currentUser.masterPhone || currentUser.phone || ''
const myCustomerId = ref(null)

const loadMyCustomerId = async () => {
  if (!isCustomer || !myPhone || myCustomerId.value) return
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

// ============================================================
// 性能优化：一次性预计算所有 Map
// ============================================================
const orgMapById = computed(() => {
  const m = new Map()
  allTableData.value.forEach(o => m.set(o.id, o))
  return m
})

const directVehicleMap = computed(() => {
  const m = new Map()
  allVehicles.value.forEach(v => {
    if (v.org_id != null) {
      const k = String(v.org_id)
      m.set(k, (m.get(k) || 0) + 1)
    }
  })
  return m
})

const recursiveVehicleMap = computed(() => {
  const orgs = allTableData.value
  const direct = directVehicleMap.value
  const m = new Map()
  const childrenMap = new Map()
  orgs.forEach(o => {
    const pid = o.parent_id == null ? null : String(o.parent_id)
    if (pid != null) {
      if (!childrenMap.has(pid)) childrenMap.set(pid, [])
      childrenMap.get(pid).push(o)
    }
  })
  const calc = (org) => {
    const k = String(org.id)
    if (m.has(k)) return m.get(k)
    let total = direct.get(k) || 0
    const kids = childrenMap.get(k) || []
    for (const c of kids) total += calc(c)
    m.set(k, total)
    return total
  }
  orgs.forEach(o => calc(o))
  return m
})

const getOrgVehicleCountById = (orgId) => {
  if (orgId == null) return 0
  return recursiveVehicleMap.value.get(String(orgId)) || 0
}

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

    let vehicleQuery = supabase.from('vehicles').select('id, plate, org, org_id, customer_id')
    if (isCustomer && myCustomerId.value) {
      vehicleQuery = vehicleQuery.eq('customer_id', myCustomerId.value)
    }

    const [orgRes, vehicleRes] = await Promise.all([orgQuery, vehicleQuery])
    if (orgRes.error) throw orgRes.error
    if (vehicleRes.error) throw vehicleRes.error

    allTableData.value = orgRes.data || []
    allVehicles.value = vehicleRes.data || []

    const map = {}
    allTableData.value.forEach(item => {
      const node = { ...item, children: [] }
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

const getParentName = (parentId) => {
  if (!parentId) return '—'
  return orgMapById.value.get(parentId)?.name || '—'
}

const handleSearch = () => { }
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
  { prop: 'name', label: '组织名称', visible: true, fixed: false, minWidth: 160, align: 'left' },
  { prop: 'code', label: '组织简称', visible: true, fixed: false, minWidth: 120, align: 'center' },
  { prop: 'vehicleCount', label: '车辆数', visible: true, fixed: false, minWidth: 90, align: 'center' },
  { prop: 'parent', label: '上级组织', visible: true, fixed: false, minWidth: 150, align: 'center' },
  { prop: 'description', label: '备注', visible: true, fixed: false, minWidth: 180, align: 'left' },
  { prop: 'created_at', label: '创建时间', visible: true, fixed: false, minWidth: 160, align: 'center' },
  { prop: 'action', label: '操作', visible: true, fixed: 'right', width: 250, align: 'center' },
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
  id: null, parent_id: null, name: '', code: '', description: '',
})

const rules = {
  name: [
    { required: true, message: '请输入组织名称', trigger: 'blur' },
    { max: 50, message: '组织名称不能超过50个字符', trigger: 'blur' },
  ],
  code: [{ max: 30, message: '组织简称不能超过30个字符', trigger: 'blur' }],
  description: [{ max: 200, message: '备注不能超过200个字符', trigger: 'blur' }],
}

const parentOptions = computed(() => allTableData.value.filter(o => o.id !== form.id))

const resetForm = () => {
  form.id = null
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

const cascadeUpdateLevels = async (parentId, parentLevel) => {
  try {
    const children = allTableData.value.filter(o => o.parent_id === parentId)
    for (const child of children) {
      const childLevel = parentLevel + 1
      await supabase.from('organizations').update({ level: childLevel }).eq('id', child.id)
      await cascadeUpdateLevels(child.id, childLevel)
    }
  } catch (e) { console.warn('[org] 级联更新 level 失败:', e) }
}

const saveOrg = async () => {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
    saving.value = true

    let realParentId = form.parent_id || null
    let newLevel = 1
    let newIsRoot = true

    if (realParentId) {
      const parent = allTableData.value.find(o => o.id === realParentId)
      if (parent) {
        newLevel = (Number(parent.level) || 1) + 1
        newIsRoot = false
      } else {
        realParentId = null
        newLevel = 1
        newIsRoot = true
      }
    }

    if (isCustomer && newLevel === 1) {
      ElMessage.warning('您不能在根层级创建组织')
      saving.value = false
      return
    }

    let newCustomerId = null
    if (realParentId) {
      const parent = allTableData.value.find(o => o.id === realParentId)
      newCustomerId = parent?.customer_id || null
    }
    if (!newCustomerId && isCustomer && myCustomerId.value) {
      newCustomerId = myCustomerId.value
    }

    let oldName = ''
    let vehicleIdsToSync = []
    if (isEdit.value) {
      const oldRow = allTableData.value.find(r => r.id === form.id)
      oldName = oldRow?.name || ''
      vehicleIdsToSync = allVehicles.value.filter(v => v.org === oldName).map(v => v.id)
    }

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
      const { error } = await supabase.from('organizations').update(payload).eq('id', form.id)
      if (error) throw error

      const oldRow = allTableData.value.find(r => r.id === form.id)
      const oldLevel = Number(oldRow?.level) || 1
      const oldParentId = oldRow?.parent_id || null
      if (oldLevel !== newLevel || oldParentId !== realParentId) {
        await cascadeUpdateLevels(form.id, newLevel)
      }

      if (oldName && oldName !== form.name && vehicleIdsToSync.length > 0) {
        const { error: syncErr } = await supabase
          .from('vehicles')
          .update({ org: form.name, org_id: form.id, updated_at: new Date().toISOString() })
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
  const hasChildren = allTableData.value.some(o => o.parent_id === row.id)
  if (hasChildren) {
    ElMessage.warning('该组织下还有子组织，请先删除子组织')
    return
  }

  const vehicleCount = getOrgVehicleCountById(row.id)
  let message = vehicleCount > 0
    ? `组织「${row.name}」下还有 ${vehicleCount} 台车辆，删除后这些车辆将取消组织归属。确定继续删除吗？`
    : `确定删除组织「${row.name}」吗？删除后不可恢复。`

  try {
    await ElMessageBox.confirm(message, '删除确认', {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger',
    })
  } catch { return }

  try {
    if (vehicleCount > 0) {
      const { error: relErr } = await supabase
        .from('vehicles')
        .update({ org: null, org_id: null, updated_at: new Date().toISOString() })
        .eq('org_id', row.id)
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
// 分配车辆（双栏看板）
// ============================================================
const assignDialogVisible = ref(false)
const assignTargetOrg = ref(null)
const assignSearchKeyword = ref('')
const assignLoading = ref(false)
const assignSaving = ref(false)
const vehiclePool = ref([])
const assignedVehicleIds = ref([])
const initialAssignedIds = ref([])

// 批量模式
const batchMode = ref(false)
const selectedPoolIds = ref([])
const selectedAssignedIds = ref([])

// ⭐ 车辆池筛选
//   poolFilter  → UI 立即响应（el-select 显示）
//   appliedFilter → 实际用于列表过滤（延迟 150ms 让下拉先关）
const poolFilter = ref('all')
const appliedFilter = ref('all')

// 持久高亮 + 最新置顶
const recentlyMovedIds = ref([])
// 筛选切换时临时抑制列表动画
const suppressPoolAnim = ref(false)

let filterTimer = null

// ⭐ 筛选延迟应用：等 el-select 关闭动画跑完再切数据，避免同帧竞争卡顿
watch(poolFilter, (val) => {
  if (filterTimer) clearTimeout(filterTimer)
  suppressPoolAnim.value = true
  filterTimer = setTimeout(() => {
    appliedFilter.value = val
    // 下一帧恢复动画（让列表数据更新完再开）
    requestAnimationFrame(() => {
      suppressPoolAnim.value = false
    })
  }, 150)
})

const markRecentlyMoved = (ids) => {
  if (!ids.length) return
  const newSet = new Set(ids)
  recentlyMovedIds.value = recentlyMovedIds.value.filter(id => !newSet.has(id))
    ;[...ids].reverse().forEach(id => {
      recentlyMovedIds.value.unshift(id)
    })
}

const openAssignDialog = async (row) => {
  assignTargetOrg.value = row
  assignSearchKeyword.value = ''
  batchMode.value = false
  selectedPoolIds.value = []
  selectedAssignedIds.value = []
  vehiclePool.value = []
  assignedVehicleIds.value = []
  initialAssignedIds.value = []
  recentlyMovedIds.value = []
  poolFilter.value = 'all'
  appliedFilter.value = 'all'
  assignDialogVisible.value = true
  await loadVehiclesForAssign(row)
}

const loadVehiclesForAssign = async (orgRow) => {
  assignLoading.value = true
  try {
    let query = supabase
      .from('vehicles')
      .select('id, plate, vin, nickname, vehicle_type, fuel_type, org, org_id, customer_id')
      .order('id', { ascending: false })

    if (isCustomer && myCustomerId.value) {
      query = query.eq('customer_id', myCustomerId.value)
    }

    const { data, error } = await query
    if (error) throw error

    const list = data || []
    vehiclePool.value = list

    const orgId = orgRow.id
    const inOrg = list.filter(v => String(v.org_id) === String(orgId)).map(v => v.id)
    assignedVehicleIds.value = [...inOrg]
    initialAssignedIds.value = [...inOrg]

    const latestOrg = allTableData.value.find(o => o.id === orgRow.id)
    if (latestOrg) assignTargetOrg.value = latestOrg
  } catch (e) {
    console.error('加载车辆失败:', e)
    ElMessage.error('加载车辆失败：' + (e?.message || e))
  } finally {
    assignLoading.value = false
  }
}

const poolVehicles = computed(() => {
  const assignedSet = new Set(assignedVehicleIds.value)
  return vehiclePool.value.filter(v => !assignedSet.has(v.id))
})

const assignedVehicles = computed(() => {
  const assignedSet = new Set(assignedVehicleIds.value)
  return vehiclePool.value.filter(v => assignedSet.has(v.id))
})

const matchKeyword = (v) => {
  const kw = assignSearchKeyword.value.trim().toLowerCase()
  if (!kw) return true
  return (v.plate || '').toLowerCase().includes(kw)
    || (v.nickname || '').toLowerCase().includes(kw)
    || (v.vin || '').toLowerCase().includes(kw)
}

const isBelongsToOther = (v) => {
  if (!v.org_id) return false
  return String(v.org_id) !== String(assignTargetOrg.value?.id)
}

// ⭐ 用 appliedFilter 而不是 poolFilter
const poolVehiclesFiltered = computed(() => {
  const list = poolVehicles.value
  const f = appliedFilter.value
  if (f === 'all') return list
  if (f === 'unassigned') return list.filter(v => !v.org_id)
  if (typeof f === 'string' && f.startsWith('org:')) {
    const targetId = f.slice(4)
    return list.filter(v => String(v.org_id) === String(targetId))
  }
  return list
})

const poolCountAll = computed(() => poolVehicles.value.length)
const poolCountUnassigned = computed(() => poolVehicles.value.filter(v => !v.org_id).length)

const otherOrgsWithCount = computed(() => {
  const map = new Map()
  const selfId = String(assignTargetOrg.value?.id || '')
  poolVehicles.value.forEach(v => {
    if (!v.org_id) return
    const k = String(v.org_id)
    if (k === selfId) return
    if (!map.has(k)) {
      map.set(k, { id: v.org_id, name: v.org || '未知机构', count: 0 })
    }
    map.get(k).count++
  })
  return Array.from(map.values()).sort((a, b) => b.count - a.count)
})

const sortByRecentMove = (list) => {
  const moved = recentlyMovedIds.value
  if (!moved.length) return list
  const orderMap = new Map()
  moved.forEach((id, i) => orderMap.set(id, i))
  return [...list].sort((a, b) => {
    const aScore = orderMap.has(a.id) ? orderMap.get(a.id) : 99999
    const bScore = orderMap.has(b.id) ? orderMap.get(b.id) : 99999
    return aScore - bScore
  })
}

const filteredPoolVehicles = computed(() => sortByRecentMove(poolVehiclesFiltered.value.filter(matchKeyword)))
const filteredAssignedVehicles = computed(() => sortByRecentMove(assignedVehicles.value.filter(matchKeyword)))

const changedCount = computed(() => {
  const initial = new Set(initialAssignedIds.value)
  const current = new Set(assignedVehicleIds.value)
  let diff = 0
  current.forEach(id => { if (!initial.has(id)) diff++ })
  initial.forEach(id => { if (!current.has(id)) diff++ })
  return diff
})

const moveToAssigned = (v) => {
  if (assignedVehicleIds.value.includes(v.id)) return
  assignedVehicleIds.value.push(v.id)
  markRecentlyMoved([v.id])
}

const moveToPool = (v) => {
  assignedVehicleIds.value = assignedVehicleIds.value.filter(id => id !== v.id)
  markRecentlyMoved([v.id])
}

const handleCardClick = (v, side) => {
  if (!batchMode.value) return
  if (side === 'pool') togglePoolSelection(v.id)
  else toggleAssignedSelection(v.id)
}

const togglePoolSelection = (id) => {
  const idx = selectedPoolIds.value.indexOf(id)
  if (idx > -1) selectedPoolIds.value.splice(idx, 1)
  else selectedPoolIds.value.push(id)
}

const toggleAssignedSelection = (id) => {
  const idx = selectedAssignedIds.value.indexOf(id)
  if (idx > -1) selectedAssignedIds.value.splice(idx, 1)
  else selectedAssignedIds.value.push(id)
}

const isAllPoolSelected = computed(() => {
  if (!filteredPoolVehicles.value.length) return false
  return filteredPoolVehicles.value.every(v => selectedPoolIds.value.includes(v.id))
})

const isSomePoolSelected = computed(() => {
  return filteredPoolVehicles.value.some(v => selectedPoolIds.value.includes(v.id))
    && !isAllPoolSelected.value
})

const toggleAllPool = () => {
  if (isAllPoolSelected.value) selectedPoolIds.value = []
  else selectedPoolIds.value = filteredPoolVehicles.value.map(v => v.id)
}

const batchMoveIn = () => {
  const ids = [...selectedPoolIds.value]
  const set = new Set(assignedVehicleIds.value)
  ids.forEach(id => set.add(id))
  assignedVehicleIds.value = Array.from(set)
  selectedPoolIds.value = []
  markRecentlyMoved(ids)
}

const batchMoveOut = () => {
  const ids = [...selectedAssignedIds.value]
  const set = new Set(ids)
  assignedVehicleIds.value = assignedVehicleIds.value.filter(id => !set.has(id))
  selectedAssignedIds.value = []
  markRecentlyMoved(ids)
}

const saveAssign = async () => {
  if (!assignTargetOrg.value) return
  assignSaving.value = true
  try {
    const orgName = assignTargetOrg.value.name
    const orgId = assignTargetOrg.value.id
    const initialSet = new Set(initialAssignedIds.value)
    const currentSet = new Set(assignedVehicleIds.value)

    const toAssign = Array.from(currentSet).filter(id => !initialSet.has(id))
    const toRelease = Array.from(initialSet).filter(id => !currentSet.has(id))

    if (!toAssign.length && !toRelease.length) {
      ElMessage.info('没有变更')
      assignDialogVisible.value = false
      return
    }

    const now = new Date().toISOString()

    if (toAssign.length) {
      const { error } = await supabase
        .from('vehicles')
        .update({ org: orgName, org_id: orgId, updated_at: now })
        .in('id', toAssign)
      if (error) throw error
    }
    if (toRelease.length) {
      const { error } = await supabase
        .from('vehicles')
        .update({ org: null, org_id: null, updated_at: now })
        .in('id', toRelease)
      if (error) throw error
    }

    ElMessage.success(`已更新：「${orgName}」新增 ${toAssign.length} 台，移出 ${toRelease.length} 台`)
    recentlyMovedIds.value = []
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
  if (filterTimer) clearTimeout(filterTimer)
})
</script>

<template>
  <div class="org-manage-page">
    <!-- 左侧：组织架构树 -->
    <aside class="org-aside">
      <div class="aside-header">
        <el-icon>
          <Share />
        </el-icon>
        <span>组织架构</span>
      </div>

      <div class="aside-search">
        <el-input v-model="treeSearchKeyword" placeholder="搜索组织" clearable size="default">
          <template #prefix><el-icon>
              <Search />
            </el-icon></template>
        </el-input>
      </div>

      <div class="aside-tree" v-loading="treeLoading">
        <el-tree v-if="orgTreeData.length > 0" ref="orgTreeRef" :data="orgTreeData" node-key="id"
          :props="{ children: 'children', label: 'name' }" :default-expand-all="true"
          :filter-node-method="filterTreeNode" :expand-on-click-node="false" highlight-current
          @node-click="handleTreeClick" class="org-tree">
          <template #default="{ data }">
            <div class="tree-node" :class="{ 'is-root': data.isRoot }">
              <el-icon class="node-icon">
                <component :is="data.isRoot ? OfficeBuilding : Share" />
              </el-icon>
              <span class="node-label">{{ data.name }}</span>
              <span class="node-vehicle-count"
                :class="{ root: data.isRoot, empty: getOrgVehicleCountById(data.id) === 0 }">
                {{ getOrgVehicleCountById(data.id) }} 辆
              </span>
            </div>
          </template>
        </el-tree>

        <div v-else-if="!treeLoading" class="tree-empty">
          <el-icon>
            <Share />
          </el-icon>
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
            <el-tooltip :disabled="!isTableFullscreen" content="请退出全屏后操作" placement="bottom" effect="dark">
              <span>
                <el-button type="primary" class="btn-primary" :disabled="isTableFullscreen" @click="handleAdd">
                  <el-icon>
                    <CirclePlus />
                  </el-icon> 新增组织
                </el-button>
              </span>
            </el-tooltip>
          </div>

          <div class="search-bar">
            <div class="search-item">
              <label>组织名称</label>
              <el-input v-model="searchForm.name" placeholder="请输入组织名称" clearable />
            </div>
            <div class="search-actions">
              <el-button type="primary" class="btn-primary" @click="handleSearch">
                <el-icon>
                  <Search />
                </el-icon> 查询
              </el-button>
              <el-button class="btn-outline" @click="handleReset">
                <el-icon>
                  <Refresh />
                </el-icon> 重置
              </el-button>
            </div>
          </div>

          <div class="toolbar-row">
            <span class="total-hint">共 <b>{{ filteredData.length }}</b> 条</span>
            <div class="toolbar-right">
              <button class="icon-btn" @click="fetchData" title="刷新">
                <el-icon>
                  <Refresh />
                </el-icon>
              </button>

              <el-dropdown trigger="click" popper-class="density-dropdown-red" @command="handleDensityChange">
                <button class="icon-btn" title="密度">
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
                          @click="toggleFix(col, 'left')" title="左固定"><el-icon>
                            <DArrowLeft />
                          </el-icon></button>
                        <button class="fix-btn" :class="{ active: col.fixed === 'right' }"
                          @click="toggleFix(col, 'right')" title="右固定"><el-icon>
                            <DArrowRight />
                          </el-icon></button>
                      </div>
                    </div>
                  </div>
                </div>
              </el-popover>

              <button class="icon-btn" :class="{ active: isTableFullscreen }" @click="toggleTableFullscreen"
                :title="isTableFullscreen ? '退出全屏' : '表格全屏'">
                <el-icon>
                  <component :is="isTableFullscreen ? Close : FullScreen" />
                </el-icon>
              </button>
            </div>
          </div>

          <div class="table-wrap">
            <el-table :data="filteredData" v-loading="loading" element-loading-text="加载中…"
              element-loading-background="rgba(255, 255, 255, 0.88)" border stripe :size="tableSize" height="100%"
              class="custom-table" :header-cell-style="{ background: '#F8FAFC', color: '#0F172A', fontWeight: '700' }">
              <template v-for="col in visibleColumns" :key="col.prop">
                <!-- ⭐ 全屏时隐藏操作列 -->
                <template v-if="!(isTableFullscreen && col.prop === 'action')">
                  <el-table-column v-if="col.prop === 'vehicleCount'" :label="col.label"
                    :min-width="Math.round(col.minWidth * densityMultiplier)" :align="col.align"
                    :fixed="col.fixed || false">
                    <template #default="{ row }">
                      <span class="vehicle-count-tag" :class="{ empty: getOrgVehicleCountById(row.id) === 0 }">
                        {{ getOrgVehicleCountById(row.id) }}
                      </span>
                    </template>
                  </el-table-column>

                  <el-table-column v-else-if="col.prop === 'parent'" :label="col.label"
                    :min-width="Math.round(col.minWidth * densityMultiplier)" :align="col.align"
                    :fixed="col.fixed || false" show-overflow-tooltip>
                    <template #default="{ row }">
                      <span class="text-content">{{ getParentName(row.parent_id) }}</span>
                    </template>
                  </el-table-column>

                  <el-table-column v-else-if="col.prop === 'created_at'" :label="col.label"
                    :min-width="Math.round(col.minWidth * densityMultiplier)" :align="col.align"
                    :fixed="col.fixed || false">
                    <template #default="{ row }">
                      <span class="time-text">
                        {{ row.created_at ? dayjs(row.created_at).format('YYYY-MM-DD HH:mm:ss') : '--' }}
                      </span>
                    </template>
                  </el-table-column>

                  <el-table-column v-else-if="col.prop === 'action'" :label="col.label"
                    :width="col.width ? Math.round(col.width * densityMultiplier) : 250" :align="col.align"
                    :fixed="col.fixed || false">
                    <template #default="{ row }">
                      <div class="action-cell">
                        <el-button type="text" class="action-btn action-edit" @click="handleEdit(row)">
                          <el-icon>
                            <Edit />
                          </el-icon> 编辑
                        </el-button>
                        <el-button type="text" class="action-btn action-assign" @click="openAssignDialog(row)">
                          <el-icon>
                            <Van />
                          </el-icon> 分配车辆
                        </el-button>
                        <el-button type="text" class="action-btn action-delete" @click="handleDelete(row)">
                          <el-icon>
                            <Delete />
                          </el-icon> 删除
                        </el-button>
                      </div>
                    </template>
                  </el-table-column>

                  <el-table-column v-else :prop="col.prop" :label="col.label"
                    :min-width="Math.round(col.minWidth * densityMultiplier)" :align="col.align"
                    :fixed="col.fixed || false" show-overflow-tooltip>
                    <template #default="{ row }">
                      <span v-if="col.prop === 'name'" class="org-name-tag">{{ row.name }}</span>
                      <span v-else class="text-content">{{ row[col.prop] || '--' }}</span>
                    </template>
                  </el-table-column>
                </template>


                <el-table-column v-else :prop="col.prop" :label="col.label"
                  :min-width="Math.round(col.minWidth * densityMultiplier)" :align="col.align"
                  :fixed="col.fixed || false" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span v-if="col.prop === 'name'" class="org-name-tag">{{ row.name }}</span>
                    <span v-else class="text-content">{{ row[col.prop] || '--' }}</span>
                  </template>
                </el-table-column>
              </template>

              <template #empty>
                <div class="empty-state">
                  <el-icon class="empty-icon">
                    <OfficeBuilding />
                  </el-icon>
                  <p>暂无组织数据</p>
                </div>
              </template>
            </el-table>
          </div>
        </div>
      </Teleport>

      <transition name="fs-fade">
        <button v-if="isTableFullscreen" class="fs-exit-btn" @click="toggleTableFullscreen">
          <el-icon>
            <Close />
          </el-icon> 退出全屏
        </button>
      </transition>
    </main>

    <!-- 新增 / 编辑组织弹窗 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑组织' : '新增组织'" width="520px" destroy-on-close
      :close-on-click-modal="false" class="org-dialog">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" class="org-form">
        <el-form-item label="上级组织">
          <el-select v-model="form.parent_id" placeholder="请选择上级组织" filterable clearable style="width: 100%">
            <el-option v-for="o in parentOptions" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="组织名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入组织名称" maxlength="50" clearable />
        </el-form-item>
        <el-form-item label="组织简称" prop="code">
          <el-input v-model="form.code" placeholder="请输入组织简称" maxlength="30" clearable />
        </el-form-item>
        <el-form-item label="备注" prop="description">
          <el-input v-model="form.description" type="textarea" :rows="4" placeholder="请输入备注" maxlength="200"
            show-word-limit />
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
    <!-- ⭐ append-to-body：挂到 body 上，否则会被 .content-wrapper 的 transform 变成
         "固定定位的包含块"，弹窗一高就把整页顶出滚动条 -->
    <el-dialog v-model="assignDialogVisible" width="960px" top="5vh" destroy-on-close :close-on-click-modal="false"
      append-to-body class="assign-vehicle-dialog">
      <template #header>
        <div class="assign-header">
          <span class="assign-title">分配车辆</span>
          <span class="assign-org">
            <el-icon>
              <OfficeBuilding />
            </el-icon>
            {{ assignTargetOrg?.name }}
          </span>
        </div>
      </template>

      <div class="assign-toolbar">
        <el-input v-model="assignSearchKeyword" placeholder="搜索车牌 / 昵称" clearable size="default" class="assign-search">
          <template #prefix><el-icon>
              <Search />
            </el-icon></template>
        </el-input>

        <div class="assign-toolbar-right">
          <label class="batch-toggle">
            <el-switch v-model="batchMode" size="small" active-color="#c8102e" inactive-color="#CBD5E1" />
            <span class="batch-toggle-text">批量模式</span>
          </label>
          <label v-if="batchMode" class="batch-select-all">
            <el-checkbox :model-value="isAllPoolSelected" :indeterminate="isSomePoolSelected" @change="toggleAllPool" />
            <span>全选当前列表</span>
          </label>
        </div>
      </div>

      <div class="assign-board">
        <!-- 左：车辆池 -->
        <div class="board-column pool-column">
          <div class="column-header">
            <span class="column-icon pool-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path
                  d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </span>
            <span class="column-title">车辆池</span>
            <span class="column-count">{{ filteredPoolVehicles.length }}</span>
          </div>

          <!-- ⭐ 筛选下拉（el-select + 分组） -->
          <div class="pool-filter-row">
            <el-select v-model="poolFilter" size="small" class="pool-filter-select" popper-class="pool-filter-popper"
              :prefix-icon="Filter">
              <el-option value="all" label="全部">
                <span class="opt-label">全部</span>
                <span class="opt-count">{{ poolCountAll }}</span>
              </el-option>
              <el-option value="unassigned" label="未分配">
                <span class="opt-label">未分配</span>
                <span class="opt-count">{{ poolCountUnassigned }}</span>
              </el-option>
              <el-option-group v-if="otherOrgsWithCount.length > 0" label="其他机构">
                <el-option v-for="org in otherOrgsWithCount" :key="org.id" :value="'org:' + org.id" :label="org.name">
                  <span class="opt-label">
                    <span class="opt-dot"></span>
                    {{ org.name }}
                  </span>
                  <span class="opt-count">{{ org.count }}</span>
                </el-option>
              </el-option-group>
            </el-select>
            <span class="pool-filter-hint">共 {{ filteredPoolVehicles.length }} 辆</span>
          </div>

          <div class="column-body">
            <div v-if="filteredPoolVehicles.length === 0" class="column-empty">
              <el-icon>
                <Van />
              </el-icon>
              <p>{{ assignSearchKeyword ? '无匹配车辆' : (poolFilter === 'unassigned' ? '没有未分配车辆' : (poolFilter === 'all' ?
                '车辆池为空' : '该机构下无车辆')) }}</p>
            </div>

            <transition-group :name="suppressPoolAnim ? 'none' : 'card-list'" tag="div" class="card-list">
              <div v-for="v in filteredPoolVehicles" :key="v.id" class="vehicle-card" :class="{
                selected: batchMode && selectedPoolIds.includes(v.id),
                'belongs-other': isBelongsToOther(v),
                highlight: recentlyMovedIds.includes(v.id),
              }" @click="handleCardClick(v, 'pool')">
                <el-checkbox v-if="batchMode" class="card-checkbox" :model-value="selectedPoolIds.includes(v.id)"
                  @click.stop @change="togglePoolSelection(v.id)" />
                <div class="card-info">
                  <div class="card-title">
                    <span v-if="v.nickname" class="card-nickname">{{ v.nickname }}</span>
                    <span class="card-plate">{{ v.plate || '--' }}</span>
                  </div>
                  <div v-if="v.org" class="card-org-tag">{{ v.org }}</div>
                  <div v-else class="card-org-tag no-org">未分配</div>
                </div>
                <button type="button" class="card-action move-in" @click.stop="moveToAssigned(v)" title="移入">
                  <el-icon>
                    <ArrowRight />
                  </el-icon>
                </button>
              </div>
            </transition-group>
          </div>
        </div>

        <!-- 中缝 -->
        <div class="board-divider">
          <div class="divider-line"></div>
          <div class="divider-line"></div>
        </div>

        <!-- 右：已分配 -->
        <div class="board-column assigned-column">
          <div class="column-header">
            <span class="column-icon assigned-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <rect x="1" y="3" width="15" height="13" rx="1" />
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
            </span>
            <span class="column-title">已分配给 {{ assignTargetOrg?.name }}</span>
            <span class="column-count">{{ filteredAssignedVehicles.length }}</span>
          </div>
          <div class="column-body">
            <div v-if="filteredAssignedVehicles.length === 0" class="column-empty">
              <el-icon>
                <Van />
              </el-icon>
              <p>暂未分配车辆</p>
            </div>

            <transition-group name="card-list" tag="div" class="card-list">
              <div v-for="v in filteredAssignedVehicles" :key="v.id" class="vehicle-card assigned" :class="{
                selected: batchMode && selectedAssignedIds.includes(v.id),
                highlight: recentlyMovedIds.includes(v.id),
              }" @click="handleCardClick(v, 'assigned')">
                <button type="button" class="card-action move-out" @click.stop="moveToPool(v)" title="移出">
                  <el-icon>
                    <ArrowLeft />
                  </el-icon>
                </button>
                <div class="card-info">
                  <div class="card-title">
                    <span v-if="v.nickname" class="card-nickname">{{ v.nickname }}</span>
                    <span class="card-plate">{{ v.plate || '--' }}</span>
                  </div>
                  <div class="card-org-tag in-org">✓ 属于本机构</div>
                </div>
                <el-checkbox v-if="batchMode" class="card-checkbox" :model-value="selectedAssignedIds.includes(v.id)"
                  @click.stop @change="toggleAssignedSelection(v.id)" />
              </div>
            </transition-group>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="assign-footer">
          <div class="assign-footer-tip">
            <template v-if="batchMode">
              已选 <b>{{ selectedPoolIds.length + selectedAssignedIds.length }}</b> 台
            </template>
            <template v-else>
              已分配 <b>{{ assignedVehicleIds.length }}</b> 台
              <span v-if="changedCount > 0" class="changed-badge">
                本次变更 <b class="changed">{{ changedCount }}</b> 台
              </span>
            </template>
          </div>
          <div class="assign-footer-actions">
            <template v-if="batchMode">
              <button class="action-btn-footer ghost" :disabled="!selectedPoolIds.length" @click="batchMoveIn">
                批量移入 ({{ selectedPoolIds.length }})
              </button>
              <button class="action-btn-footer ghost" :disabled="!selectedAssignedIds.length" @click="batchMoveOut">
                批量移出 ({{ selectedAssignedIds.length }})
              </button>
            </template>
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
  /* ⭐ 整页固定高度：由外壳 .content-wrapper 给满，绝不写 100vh
     （100vh 会多出 header 48 + tabs 36 + 1 + 16 内边距，整页就会上下滚） */
  height: 100%;
  max-height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  background: #F8FAFC;
  font-size: 13px;
  animation: pageIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes pageIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
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

.aside-header .el-icon {
  color: #c8102e;
  font-size: 18px;
}

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

.aside-tree::-webkit-scrollbar {
  width: 4px;
}

.aside-tree::-webkit-scrollbar-thumb {
  background: #E2E8F0;
  border-radius: 2px;
}

.org-tree {
  background: transparent;
}

.org-tree :deep(.el-tree-node__content) {
  height: 36px;
  border-radius: 6px;
  margin: 1px 0;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.org-tree :deep(.el-tree-node__content:hover) {
  background: #FEF2F2;
}

.org-tree :deep(.el-tree-node.is-current > .el-tree-node__content) {
  background: linear-gradient(135deg, #FEE2E2, #FECACA);
  color: #c8102e;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(200, 16, 46, 0.12);
}

.org-tree :deep(.el-tree-node.is-current > .el-tree-node__content .node-icon) {
  color: #c8102e;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  padding-right: 4px;
}

.tree-node.is-root .node-label {
  font-weight: 800;
  color: #0F172A;
  letter-spacing: 0.3px;
}

.tree-node.is-root .node-icon {
  color: #7C3AED;
}

.node-icon {
  font-size: 14px;
  color: #94A3B8;
  flex-shrink: 0;
  transition: color 0.25s;
}

.tree-node:hover .node-icon {
  color: #c8102e;
}

.tree-node.is-root:hover .node-icon {
  color: #7C3AED;
}

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
}

.tree-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 60px 20px;
  color: #94A3B8;
}

.tree-empty .el-icon {
  font-size: 36px;
  color: #CBD5E1;
}

.tree-empty p {
  font-size: 14px;
  font-weight: 600;
  color: #64748B;
  margin: 0;
}

.tree-empty .empty-tip {
  font-size: 12px;
  color: #CBD5E1;
}

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
  animation: fullscreenFadeIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes fullscreenFadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

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

.search-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-item label {
  font-size: 13px;
  color: #334155;
  font-weight: 600;
  white-space: nowrap;
}

.search-item :deep(.el-input) {
  width: 260px;
}

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
}

.search-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.btn-primary {
  background: linear-gradient(135deg, #c8102e, #a00d24) !important;
  border: none !important;
  color: #fff !important;
  font-weight: 600;
  border-radius: 6px !important;
  box-shadow: 0 3px 10px rgba(200, 16, 46, 0.25);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}

.btn-primary {
  background: linear-gradient(135deg, #c8102e, #a00d24) !important;
  border: none !important;
  color: #fff !important;
  font-weight: 600;
  border-radius: 6px !important;
  box-shadow: 0 3px 10px rgba(200, 16, 46, 0.25);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}
.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 5px 14px rgba(200, 16, 46, 0.4);
}
/* ⭐ 新增：全屏时禁用按钮样式 */
.btn-primary:disabled,
.btn-primary.is-disabled {
  background: #CBD5E1 !important;
  box-shadow: none !important;
  cursor: not-allowed !important;
  opacity: 0.75;
  transform: none !important;
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 5px 14px rgba(200, 16, 46, 0.4);
}

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

.total-hint {
  font-size: 13px;
  color: #64748B;
}

.total-hint b {
  color: #c8102e;
  font-family: 'Courier New', monospace;
  font-size: 14px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #E2E8F0;
  background: #fff;
  border-radius: 6px;
  color: #64748B;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.icon-btn:hover {
  border-color: #c8102e;
  color: #c8102e;
  background: #FEF2F2;
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(200, 16, 46, 0.15);
}

.icon-btn.active {
  border-color: #c8102e;
  color: #fff;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  box-shadow: 0 3px 10px rgba(200, 16, 46, 0.35);
}

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

:deep(.custom-table td.el-table__cell) {
  padding: 9px 0;
}

:deep(.custom-table.el-table--large td.el-table__cell) {
  padding: 13px 0;
}

:deep(.custom-table.el-table--small td.el-table__cell) {
  padding: 5px 0;
}

:deep(.custom-table .el-table__row:hover td) {
  background: #FEF2F2 !important;
}

.org-name-tag {
  font-weight: 600;
  color: #0F172A;
  font-size: 13px;
}

.text-content {
  color: #334155;
  font-size: 13px;
}

.time-text {
  color: #475569;
  font-family: 'Courier New', Courier, monospace;
  font-size: 12.5px;
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
}

.vehicle-count-tag.empty {
  background: #F1F5F9;
  color: #94A3B8;
  font-weight: 500;
}

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

.action-btn .el-icon {
  font-size: 13px;
}

.action-edit {
  color: #c8102e;
}

.action-edit:hover {
  color: #7F1D1D;
  background: #FEF2F2;
}

.action-assign {
  color: #0EA5E9;
}

.action-assign:hover {
  color: #0369A1;
  background: #F0F9FF;
}

.action-delete {
  color: #EF4444;
}

.action-delete:hover {
  color: #991B1B;
  background: #FEE2E2;
}

.empty-state {
  padding: 50px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: #94A3B8;
}

.empty-icon {
  font-size: 44px;
  color: #CBD5E1;
}

.empty-state p {
  font-size: 14px;
  margin: 0;
}

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

.fs-fade-enter-active,
.fs-fade-leave-active {
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.fs-fade-enter-from,
.fs-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.9);
}

/* ============================================================
   弹窗基础
   ============================================================ */
:deep(.org-dialog .el-dialog) {
  border-radius: 12px;
  overflow: hidden;
  animation: dialogIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes dialogIn {
  from {
    opacity: 0;
    transform: scale(0.92) translateY(20px);
  }

  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

:deep(.org-dialog .el-dialog__header) {
  padding: 16px 20px;
  border-bottom: 1px solid #F1F5F9;
}

:deep(.org-dialog .el-dialog__title) {
  font-weight: 700;
  color: #0F172A;
  font-size: 15px;
}

:deep(.org-dialog .el-dialog__body) {
  padding: 20px 24px;
}

.org-form :deep(.el-form-item) {
  margin-bottom: 20px;
}

.org-form :deep(.el-form-item__label) {
  font-weight: 600;
  color: #334155;
  font-size: 13px;
}

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
  background: #F1F5F9;
  color: #475569;
  border: 1px solid #E2E8F0;
}

.action-btn-footer.ghost:hover:not(:disabled) {
  background: #E2E8F0;
  color: #1E293B;
  transform: translateY(-2px);
}

.action-btn-footer.ghost:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.action-btn-footer.primary {
  color: #FFFFFF;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  box-shadow: 0 6px 20px rgba(200, 16, 46, 0.4);
  position: relative;
  overflow: hidden;
}

.action-btn-footer.primary::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 60%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent);
  transition: left 0.6s ease;
}

.action-btn-footer.primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 12px 30px rgba(200, 16, 46, 0.55);
}

.action-btn-footer.primary:hover:not(:disabled)::before {
  left: 130%;
}

.action-btn-footer.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ============================================================
   分配车辆弹窗 - 双栏看板
   ============================================================ */
/* ⚠️ 注意：el-dialog 的根元素本身就是 .assign-vehicle-dialog（不是它的子节点），
   而且弹窗加了 append-to-body 后已经脱离 scoped 作用域，
   所以任何 `:deep(.assign-vehicle-dialog .el-dialog)` 都匹配不到。
   弹窗的尺寸/布局规则统一写在文件末尾的全局 <style> 块里。 */

.assign-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.assign-title {
  font-size: 16px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: 0.3px;
}

.assign-org {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 12px;
  border-radius: 999px;
  background: linear-gradient(135deg, #FEF2F2, #FEE2E2);
  color: #c8102e;
  font-size: 12.5px;
  font-weight: 700;
  border: 1px solid #FECACA;
}

.assign-org .el-icon {
  font-size: 13px;
}

.assign-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.assign-search {
  width: 280px;
}

.assign-search :deep(.el-input__wrapper) {
  border-radius: 10px !important;
  background: #fff !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  min-height: 36px;
}

.assign-search :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #FCA5A5 inset !important;
}

.assign-search :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #c8102e inset, 0 0 0 3px rgba(200, 16, 46, 0.12) !important;
  transform: translateY(-1px);
}

.assign-toolbar-right {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.batch-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  padding: 4px 10px;
  border-radius: 8px;
  transition: background 0.2s;
}

.batch-toggle:hover {
  background: #FEF2F2;
}

.batch-toggle-text {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.batch-select-all {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  font-size: 13px;
  color: #334155;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 8px;
  transition: background 0.2s;
}

.batch-select-all:hover {
  background: #FEF2F2;
}

.batch-select-all :deep(.el-checkbox) {
  margin: 0;
  height: auto;
}

.batch-select-all :deep(.el-checkbox__inner) {
  width: 16px !important;
  height: 16px !important;
  border-radius: 4px !important;
  border-color: #CBD5E1;
}

.batch-select-all :deep(.el-checkbox__input.is-checked .el-checkbox__inner),
.batch-select-all :deep(.el-checkbox__input.is-indeterminate .el-checkbox__inner) {
  background-color: #c8102e;
  border-color: #c8102e;
}

/* 双栏看板 */
.assign-board {
  display: grid;
  grid-template-columns: 1fr 40px 1fr;
  background: #fff;
  border-radius: 14px;
  border: 1px solid #E2E8F0;
  overflow: hidden;
  /* ⭐ 常规 520 高；矮屏时允许被压缩（列内部各自滚动），不会顶出弹窗 */
  flex: 0 1 520px;
  min-height: 200px;
  max-height: 520px;
}

.board-divider {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #FAFBFC, #F1F5F9, #FAFBFC);
  border-left: 1px solid #F1F5F9;
  border-right: 1px solid #F1F5F9;
}

.divider-line {
  width: 1px;
  flex: 1;
  background: linear-gradient(180deg, transparent, #CBD5E1, transparent);
  max-height: 200px;
}

.board-column {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.pool-column {
  background: #FEFEFE;
}

.assigned-column {
  background: #FFFDFD;
}

.column-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  border-bottom: 1px solid #F1F5F9;
  flex-shrink: 0;
  background: #fff;
}

.pool-column .column-header {
  background: linear-gradient(180deg, #FFFFFF, #FAFBFC);
  border-bottom: 1px solid #E2E8F0;
}

.assigned-column .column-header {
  background: linear-gradient(180deg, #FFFFFF, #FEF2F2);
  border-bottom: 1px solid #FECACA;
}

.column-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.pool-icon {
  background: linear-gradient(135deg, #E0E7FF, #C7D2FE);
  color: #4F46E5;
  box-shadow: 0 2px 8px rgba(79, 70, 229, 0.25);
}

.assigned-icon {
  background: linear-gradient(135deg, #FEE2E2, #FECACA);
  color: #c8102e;
  box-shadow: 0 2px 8px rgba(200, 16, 46, 0.25);
}

.column-title {
  font-size: 13.5px;
  font-weight: 800;
  color: #0F172A;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 55%;
}

.column-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 22px;
  padding: 0 10px;
  border-radius: 11px;
  background: linear-gradient(135deg, #FEF2F2, #FEE2E2);
  color: #c8102e;
  font-size: 12px;
  font-weight: 800;
  font-family: 'Courier New', monospace;
  border: 1px solid #FECACA;
}

.pool-column .column-count {
  background: linear-gradient(135deg, #EEF2FF, #E0E7FF);
  color: #4F46E5;
  border-color: #C7D2FE;
}

/* ⭐ 筛选下拉行 */
.pool-filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: #F8FAFC;
  border-bottom: 1px solid #F1F5F9;
  flex-shrink: 0;
}

.pool-filter-select {
  flex: 1;
  max-width: 220px;
}

.pool-filter-select :deep(.el-select__wrapper) {
  border-radius: 8px !important;
  background: #FFFFFF !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  min-height: 30px;
  font-size: 12.5px;
  font-weight: 600;
}

.pool-filter-select :deep(.el-select__wrapper:hover) {
  box-shadow: 0 0 0 1px #FCA5A5 inset !important;
}

.pool-filter-select :deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px #c8102e inset, 0 0 0 3px rgba(200, 16, 46, 0.12) !important;
}

.pool-filter-select :deep(.el-select__placeholder),
.pool-filter-select :deep(.el-select__selected-item) {
  color: #0F172A;
  font-weight: 600;
}

.pool-filter-select :deep(.el-select__prefix) {
  color: #c8102e;
  margin-right: 2px;
}

.pool-filter-hint {
  font-size: 12px;
  color: #94A3B8;
  font-weight: 600;
  white-space: nowrap;
  margin-left: auto;
}

/* 下拉选项里的计数徽章（全局，因为弹层在 body 上） */
:global(.pool-filter-popper) {
  border-radius: 10px !important;
  box-shadow: 0 12px 36px rgba(200, 16, 46, 0.18), 0 0 0 1px rgba(200, 16, 46, 0.12) !important;
  border: 2px solid #FFFFFF !important;
  padding: 4px !important;
}

:global(.pool-filter-popper .el-select-dropdown__item) {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  color: #334155 !important;
  border-radius: 6px !important;
  margin: 2px 0 !important;
  padding: 0 12px !important;
  height: 32px !important;
  line-height: 32px !important;
}

:global(.pool-filter-popper .el-select-dropdown__item:hover) {
  background: #FEF2F2 !important;
  color: #c8102e !important;
}

:global(.pool-filter-popper .el-select-dropdown__item.is-selected) {
  background: linear-gradient(135deg, #FEF2F2, #FEE2E2) !important;
  color: #c8102e !important;
  font-weight: 800 !important;
}

:global(.pool-filter-popper .el-select-group__title) {
  font-size: 11.5px !important;
  font-weight: 700 !important;
  color: #94A3B8 !important;
  letter-spacing: 0.5px !important;
  padding: 8px 12px 4px !important;
  line-height: 1 !important;
  text-transform: uppercase;
}

:global(.pool-filter-popper .pool-filter-popper .opt-label),
:global(.pool-filter-popper .opt-label) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.pool-filter-popper .opt-dot) {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #F59E0B;
  flex-shrink: 0;
}

:global(.pool-filter-popper .opt-count) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 18px;
  padding: 0 7px;
  border-radius: 9px;
  background: #F1F5F9;
  color: #64748B;
  font-size: 11px;
  font-weight: 800;
  font-family: 'Courier New', monospace;
  margin-left: 8px;
  flex-shrink: 0;
}

:global(.pool-filter-popper .el-select-dropdown__item.is-selected .opt-count) {
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #fff;
}

:global(.pool-filter-popper .el-select-dropdown__item:hover .opt-count) {
  background: #FEE2E2;
  color: #c8102e;
}

:global(.pool-filter-popper .el-select-dropdown__item:hover.is-selected .opt-count) {
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #fff;
}

.column-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 14px;
  min-height: 0;
}

.column-body::-webkit-scrollbar {
  width: 5px;
}

.column-body::-webkit-scrollbar-thumb {
  background: #E2E8F0;
  border-radius: 3px;
}

.column-body::-webkit-scrollbar-thumb:hover {
  background: #CBD5E1;
}

.card-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
}

.column-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 70px 20px;
  color: #94A3B8;
}

.column-empty .el-icon {
  font-size: 40px;
  color: #CBD5E1;
  opacity: 0.7;
}

.column-empty p {
  font-size: 13px;
  margin: 0;
}

/* 车辆卡片 */
.vehicle-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #fff;
  border: 1.5px solid #E2E8F0;
  cursor: pointer;
  transition: all 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;
  overflow: hidden;
  min-height: 60px;
}

.vehicle-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: #CBD5E1;
  transition: background 0.3s;
}

.vehicle-card.belongs-other::before {
  background: linear-gradient(180deg, #FBBF24, #F59E0B);
}

.vehicle-card.assigned::before {
  background: linear-gradient(180deg, #10B981, #059669);
}

.vehicle-card:hover {
  border-color: rgba(200, 16, 46, 0.4);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(200, 16, 46, 0.12);
}

.vehicle-card.belongs-other:hover {
  border-color: rgba(245, 158, 11, 0.55);
  box-shadow: 0 8px 20px rgba(245, 158, 11, 0.15);
}

.vehicle-card.assigned:hover {
  border-color: rgba(16, 185, 129, 0.5);
  box-shadow: 0 8px 20px rgba(16, 185, 129, 0.12);
}

.vehicle-card.selected {
  border-color: #c8102e;
  background: linear-gradient(135deg, #FEF2F2, #FEE2E2);
  box-shadow: 0 6px 18px rgba(200, 16, 46, 0.18);
}

.vehicle-card.highlight {
  animation: cardHighlight 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
  border-color: #F59E0B;
  background: linear-gradient(135deg, #FFFBEB, #FEF3C7);
}

.vehicle-card.highlight::before {
  background: linear-gradient(180deg, #F59E0B, #D97706);
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.8);
}

@keyframes cardHighlight {
  0% {
    transform: scale(0.85);
  }

  50% {
    transform: scale(1.03);
  }

  100% {
    transform: scale(1);
  }
}

/* 列表动画 */
.card-list-move {
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.card-list-enter-active {
  transition: all 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.card-list-leave-active {
  transition: all 0.3s ease;
  position: absolute;
  width: calc(100% - 28px);
}

.card-list-enter-from {
  opacity: 0;
  transform: translateX(-20px) scale(0.9);
}

.card-list-leave-to {
  opacity: 0;
  transform: translateX(20px) scale(0.9);
}

/* 卡片内部 */
.card-checkbox {
  flex-shrink: 0;
  margin: 0 !important;
  height: auto !important;
}

.card-checkbox :deep(.el-checkbox__inner) {
  width: 16px !important;
  height: 16px !important;
  border-radius: 4px !important;
  border-color: #CBD5E1;
}

.card-checkbox :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background-color: #c8102e;
  border-color: #c8102e;
}

.card-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.card-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}

.card-nickname {
  font-size: 12.5px;
  font-weight: 700;
  color: #64748B;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
  padding: 1px 6px;
  background: #F1F5F9;
  border-radius: 4px;
}

.card-plate {
  font-size: 14.5px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: 0.6px;
  font-family: 'Courier New', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-org-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 4px;
  background: #FEF3C7;
  color: #B45309;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  max-width: fit-content;
  overflow: hidden;
  text-overflow: ellipsis;
  border: 1px solid #FCD34D;
}

.card-org-tag.in-org {
  background: #D1FAE5;
  color: #059669;
  border-color: #6EE7B7;
}

.card-org-tag.no-org {
  background: #F1F5F9;
  color: #94A3B8;
  border-color: #E2E8F0;
}

/* 转移按钮 */
.card-action {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;
  overflow: hidden;
}

.card-action .el-icon {
  font-size: 17px;
}

.card-action.move-in {
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #fff;
  box-shadow: 0 3px 10px rgba(200, 16, 46, 0.3);
}

.card-action.move-in:hover {
  transform: translateX(2px) scale(1.08);
  box-shadow: 0 6px 18px rgba(200, 16, 46, 0.5);
}

.card-action.move-in:active {
  transform: translateX(2px) scale(0.95);
}

.card-action.move-out {
  background: #F1F5F9;
  color: #64748B;
  border: 1px solid #E2E8F0;
}

.card-action.move-out:hover {
  background: linear-gradient(135deg, #64748B, #475569);
  color: #fff;
  border-color: transparent;
  transform: translateX(-2px) scale(1.08);
  box-shadow: 0 6px 18px rgba(71, 85, 105, 0.4);
}

.card-action.move-out:active {
  transform: translateX(-2px) scale(0.95);
}

/* 底部 */
.assign-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px;
  background: #fff;
  gap: 12px;
  flex-wrap: wrap;
}

.assign-footer-tip {
  font-size: 13px;
  color: #64748B;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.assign-footer-tip b {
  color: #c8102e;
  font-family: 'Courier New', monospace;
  font-size: 16px;
  font-weight: 800;
  margin: 0 2px;
}

.changed-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  background: linear-gradient(135deg, #FFFBEB, #FEF3C7);
  border: 1px solid #FCD34D;
  border-radius: 999px;
  color: #92400E;
  font-weight: 700;
}

.assign-footer-tip b.changed {
  color: #D97706;
}

.assign-footer-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* 移动端响应式 */
@media (max-width: 900px) {
  :deep(.assign-vehicle-dialog .el-dialog) {
    width: 96vw !important;
    max-width: 96vw;
    margin-top: 2vh !important;
  }

  :deep(.assign-vehicle-dialog .el-dialog__body) {
    padding: 12px 14px 0;
  }

  .assign-board {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr 32px 1fr;
    flex: 1 1 auto;
    height: auto;
    min-height: 0;
    max-height: none;
  }

  .board-divider {
    flex-direction: row;
    border-left: none;
    border-right: none;
    border-top: 1px solid #F1F5F9;
    border-bottom: 1px solid #F1F5F9;
    height: 32px;
  }

  .divider-line {
    width: auto;
    height: 1px;
    max-height: none;
    max-width: 120px;
    flex: 1;
  }

  .column-body {
    padding: 10px 12px;
  }

  .vehicle-card {
    padding: 10px 12px;
  }

  .assign-search {
    width: 100%;
  }

  .assign-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .assign-toolbar-right {
    justify-content: space-between;
  }

  .assign-footer {
    flex-direction: column;
    align-items: stretch;
    padding: 12px 16px;
  }

  .assign-footer-actions {
    justify-content: flex-end;
  }

  .action-btn-footer {
    padding: 8px 16px;
    font-size: 13px;
  }

  .pool-filter-select {
    max-width: 100%;
  }
}

@media (max-width: 480px) {
  .card-plate {
    font-size: 13px;
  }

  .card-action {
    width: 32px;
    height: 32px;
  }

  .column-title {
    max-width: 40%;
    font-size: 12.5px;
  }

  .pool-filter-row {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }

  .pool-filter-hint {
    margin-left: 0;
  }
}
</style>

<style>
html,
body {
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

.density-dropdown-red .el-dropdown-menu {
  padding: 4px !important;
  background: #FFFFFF !important;
}

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
}

.density-dropdown-red .el-dropdown-menu__item .density-item.active {
  color: #c8102e;
  font-weight: 700;
}

.density-dropdown-red .el-dropdown-menu__item:hover .density-item.active {
  color: #ffffff;
}

.column-setting-popper.el-popover.el-popper {
  padding: 0 !important;
  border-radius: 12px !important;
  box-shadow: 0 12px 36px rgba(200, 16, 46, 0.18), 0 0 0 1px rgba(200, 16, 46, 0.12) !important;
  border: 2px solid #FFFFFF !important;
  overflow: hidden;
  background: #FFFFFF !important;
}

.column-setting-popper .el-popover__title {
  display: none;
}

.column-setting {
  padding: 0;
  background: #FFFFFF;
}

.column-setting-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #FEE2E2;
  background: #FFFFFF;
}

.col-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 700;
  color: #c8102e;
}

.col-title .el-icon {
  color: #c8102e;
  font-size: 14px;
}

.col-reset {
  font-size: 12.5px;
  color: #c8102e;
  cursor: pointer;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.col-reset:hover {
  background: #FEE2E2;
  text-decoration: underline;
  transform: scale(1.05);
}

.column-setting-body {
  max-height: 400px;
  overflow-y: auto;
  padding: 6px;
  background: #FFFFFF;
}

.column-setting-body::-webkit-scrollbar {
  width: 4px;
}

.column-setting-body::-webkit-scrollbar-thumb {
  background: #FCA5A5;
  border-radius: 2px;
}

.column-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: grab;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  user-select: none;
}

.column-item:hover {
  background: #FEF2F2;
}

.column-item.dragging {
  opacity: 0.4;
  cursor: grabbing;
}

.column-item.dragOver {
  background: #FEE2E2;
  transform: scale(1.02);
}

.drag-handle {
  display: flex;
  align-items: center;
  color: #FCA5A5;
  cursor: grab;
  font-size: 14px;
  transition: color 0.2s;
}

.column-item:hover .drag-handle {
  color: #c8102e;
}

.col-checkbox {
  flex: 1;
  font-size: 13px;
}

.col-checkbox :deep(.el-checkbox__label) {
  font-size: 13px;
  color: #c8102e;
  font-weight: 600;
}

.col-checkbox :deep(.el-checkbox__inner) {
  border-color: #FCA5A5;
}

.col-checkbox :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background-color: #c8102e;
  border-color: #c8102e;
}

.col-checkbox :deep(.el-checkbox__input.is-checked + .el-checkbox__label) {
  color: #c8102e;
  font-weight: 700;
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
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.fix-btn:hover {
  color: #c8102e;
  background: #FEE2E2;
  transform: scale(1.1);
}

.fix-btn.active {
  color: #ffffff;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  box-shadow: 0 2px 6px rgba(200, 16, 46, 0.35);
}

.el-message-box__btns .el-button--primary {
  background: linear-gradient(135deg, #c8102e, #a00d24) !important;
  border-color: #c8102e !important;
}

/* ============================================================
   ⭐ 分配车辆弹窗：整体锁在视口内，永不出现上下滚动
   （弹窗根元素就是 .el-dialog.assign-vehicle-dialog，
     append-to-body 后又脱离了 scoped 作用域，所以规则写在全局块）
   ============================================================ */
.el-dialog.assign-vehicle-dialog {
  display: flex;
  flex-direction: column;
  /* top="5vh" 由组件内联给出，这里留 16px 底部呼吸位 */
  max-height: calc(100vh - 5vh - 16px);
  margin-bottom: 0;
  overflow: hidden;
  border-radius: 16px;
  box-shadow: 0 24px 72px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(226, 232, 240, 0.5);
}

.el-dialog.assign-vehicle-dialog>.el-dialog__header {
  flex: 0 0 auto;
}

.el-dialog.assign-vehicle-dialog>.el-dialog__body {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.el-dialog.assign-vehicle-dialog>.el-dialog__footer {
  flex: 0 0 auto;
}

</style>