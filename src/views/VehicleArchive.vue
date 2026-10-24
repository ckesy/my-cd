<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, onActivated, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, ElLoading } from 'element-plus'
import {
  Upload, Search, Refresh, Delete, Download,
  Van, View, Edit, Operation, Setting, FullScreen, Close,
  Grid, Rank, DArrowLeft, DArrowRight,
} from '@element-plus/icons-vue'
import { supabase } from '@/utils/supabase'
import dayjs from 'dayjs'
// ⭐ 车务管理：证件与保险 + 宽表导入导出（一张表 40 列）
import { exportWide, viewRowToLabels } from '@/utils/vehicleExcel'
import VehicleImportDialog from '@/components/affair/VehicleImportDialog.vue'
import { loadCertMap, upsertCert, parseDays, loadSettings } from '@/utils/vehicleAffair'
import { CERT_TYPES, REMIND_DAYS_OPTIONS, VEHICLE_COLUMNS } from '@/config/vehicleColumns'
import { MAINTAIN_KM_OPTIONS } from '@/utils/vehicleAffair'

const formatDateTime = (d) => d ? dayjs(d).format('YYYY-MM-DD HH:mm:ss') : '--'

// ============================================================
// 当前登录用户
// ============================================================
const currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('currentUser') || '{}') }
  catch { return {} }
})()
const isAdmin = currentUser.role === 'admin'
const isCustomer = !isAdmin
const isSubAccount = !!currentUser.isSubAccount
// ⭐ 子账号也用主账号的 owner_account
const myAccount = currentUser.masterAccount || currentUser.account || ''
const myPhone = currentUser.masterPhone || currentUser.phone || ''

const myCustomerId = ref(currentUser.customerId || null)

// ⭐⭐⭐ 子账号机构名 / 层级（直接来自 currentUser，不再查库）
//   orgLevel = 1  → 一级机构 → 等同主账号
//   orgLevel >= 2 → 二级机构 → 只看本机构
// ============================================================
const myOrgName = ref(isSubAccount ? String(currentUser.orgName || '').trim() || null : null)
const myOrgLevel = ref(isSubAccount ? (Number(currentUser.orgLevel) || 1) : null)

const loadMyCustomerId = async () => {
  if (!isCustomer) return
  if (myCustomerId.value) return
  if (!myPhone) return
  try {
    const { data } = await supabase
      .from('customers').select('id').eq('phone', myPhone).maybeSingle()
    if (data) myCustomerId.value = data.id
  } catch (e) { }
}

// ⭐ 兜底：currentUser 里没有 orgName/orgLevel 时，去 organizations 反查
const loadMyOrgInfo = async () => {
  if (!isCustomer || !isSubAccount) return
  if (myOrgName.value && myOrgLevel.value) return
  if (!currentUser.orgId) return
  try {
    const { data } = await supabase
      .from('organizations')
      .select('name, level')
      .eq('id', currentUser.orgId)
      .maybeSingle()
    if (data) {
      if (data.name) myOrgName.value = String(data.name).trim()
      myOrgLevel.value = Number(data.level) || 1
    }
  } catch (e) {
    console.warn('[VehicleArchive] 反查机构失败:', e)
  }
}

// ⭐ 判断子账号是否属于一级机构
const isRootOrgSubAccount = computed(() => {
  return isSubAccount && Number(myOrgLevel.value) === 1
})

// ⭐ 判断子账号是否需要按 org 隔离
const needOrgFilter = computed(() => {
  return isCustomer && isSubAccount && Number(myOrgLevel.value) >= 2
})

// ============================================================
// 缓存
// ============================================================
const userKey = isCustomer
  ? (isSubAccount ? `_sub_${myAccount}` : `_cust_${myAccount}`)
  : '_admin'
const CACHE_KEY = 'vehicle_archive_cache' + userKey
const STATE_KEY = 'vehicle_archive_state' + userKey
const DENSITY_KEY = 'vehicle_archive_density' + userKey

const searchForm = reactive({ org: '', fuelType: '', plate: '', vin: '' })
const tableData = ref([])
const total = ref(0)
const pageSize = ref(20)
const currentPage = ref(1)
const loading = ref(false)
const orgOptions = ref([])

const restoreState = () => {
  try {
    const s = JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null')
    if (s) {
      Object.assign(searchForm, { org: s.org || '', fuelType: s.fuelType || '', plate: s.plate || '', vin: s.vin || '' })
      currentPage.value = s.currentPage || 1
      pageSize.value = s.pageSize || 20
    }
  } catch (e) { }
}
const saveState = () => {
  sessionStorage.setItem(STATE_KEY, JSON.stringify({ ...searchForm, currentPage: currentPage.value, pageSize: pageSize.value }))
}
const saveData = () => {
  sessionStorage.setItem(CACHE_KEY, JSON.stringify({ tableData: tableData.value, total: total.value }))
}

// ⭐ 加载机构下拉（按 level 排序）
const loadOrgOptions = async () => {
  try {
    let query = supabase
      .from('organizations')
      .select('name')
      .order('level', { ascending: true })
      .order('id', { ascending: true })
    if (isCustomer) query = query.eq('owner_account', myAccount)
    const { data } = await query
    orgOptions.value = (data || []).map(o => o.name)
  } catch (e) { }
}

// ============================================================
// 密度 / 列设置 / 全屏
// ============================================================
const tableSize = ref(localStorage.getItem(DENSITY_KEY) || 'default')

const densityMultiplier = computed(() => tableSize.value === 'large' ? 1.15 : tableSize.value === 'small' ? 0.85 : 1)

const handleDensityChange = (cmd) => {
  tableSize.value = cmd
  localStorage.setItem(DENSITY_KEY, cmd)
}

const columnPopoverVisible = ref(false)
/* ⭐ 2026-10-24：列表显示**全部 40 列**（车辆本体 + 证件 + 提醒），
   数据源是宽表视图 v_vehicle_export，所以一行就能取到所有字段。
   列定义与导出/导入共用 vehicleColumns.js，加字段不用改这里 */
const DEFAULT_COLUMNS = [
  ...VEHICLE_COLUMNS.map((c, i) => ({
    prop: c.key,
    label: c.label,
    visible: true,
    fixed: i === 0 ? 'left' : false,
    width: c.width || 110,
    align: i === 0 ? 'left' : 'center',
    field: c,
    isNew: !!c.isNew,
  })),
  { prop: 'action', label: '操作', visible: true, fixed: 'right', width: 148, align: 'center' },
]

/* 单元格文本：宽表里 int[] 可能回数组、也可能回 "{30,7}" 字符串 */
const cellText = (row, col) => {
  if (col.prop === 'action') return ''
  let v = row[col.prop]
  if (v === null || v === undefined || v === '') return '--'
  if (Array.isArray(v)) return v.length ? v.join(' / ') : '--'
  if (typeof v === 'string' && v.startsWith('{')) {
    const t = v.replace(/[{}]/g, '').trim()
    return t ? t.split(',').join(' / ') : '--'
  }
  return String(v)
}
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

const isTableFullscreen = ref(false)
const toggleTableFullscreen = () => { isTableFullscreen.value = !isTableFullscreen.value }
const onEscKeydown = (e) => {
  if (e.key === 'Escape' && isTableFullscreen.value) isTableFullscreen.value = false
}

// ============================================================
// 批量删除
// ============================================================
const batchDeleteMode = ref(false)
const selectedIds = ref([])
const tableRef = ref(null)

const toggleBatchDelete = () => { batchDeleteMode.value = !batchDeleteMode.value; selectedIds.value = [] }
const handleSelectionChange = (sel) => { selectedIds.value = sel.map(r => r.id) }

watch(
  () => tableData.value,
  () => {
    if (batchDeleteMode.value) {
      tableRef.value?.clearSelection?.()
      selectedIds.value = []
    }
  },
  { deep: true }
)

const confirmDelete = async () => {
  if (!selectedIds.value.length) return
  try {
    await ElMessageBox.confirm(`确定删除选中的 ${selectedIds.value.length} 条车辆档案？`, '删除确认', {
      confirmButtonText: '确定删除', cancelButtonText: '取消', type: 'warning',
    })
    const li = ElLoading.service({ fullscreen: true, text: '正在删除...', background: 'rgba(0,0,0,0.6)' })
    try {
      const { error } = await supabase.from('vehicles').delete().in('id', selectedIds.value)
      if (error) throw error
      ElMessage.success(`成功删除 ${selectedIds.value.length} 条数据`)
      batchDeleteMode.value = false; selectedIds.value = []
      await fetchVehicles()
    } finally { li.close() }
  } catch (err) {
    if (err === 'cancel') return
    ElMessage.error('删除失败：' + err.message)
  }
}

// ============================================================
// 查看 / 编辑
// ============================================================
const detailDialogVisible = ref(false)
const currentDetailRow = ref(null)
const router = useRouter()
/* 车辆档案 → 维保记录（单车维保页） */
const goMaintenance = () => {
  const row = currentDetailRow.value
  if (!row || !row.plate) return
  detailDialogVisible.value = false
  router.push({ path: '/maintenance/vehicle', query: { plate: row.plate } })
}
const handleView = (row) => { currentDetailRow.value = row; detailDialogVisible.value = true }

const editDialogVisible = ref(false)
const editFormData = ref(null)
const editSaving = ref(false)
const originalOrgWhenEdit = ref(null)   // ⭐ 记录编辑时的原始 org

const handleEdit = (row) => {
  const data = JSON.parse(JSON.stringify(row))
  const names = data.driver ? data.driver.split(',').map(s => s.trim()).filter(Boolean) : []
  data.driverDisplay = !names.length ? '' : names.length <= 2 ? names.join('；') : `已选 ${names.length} 名司机`
  originalOrgWhenEdit.value = String(row.org || '').trim() || null   // ⭐ 记录
  editFormData.value = data
  editTab.value = 'base'
  editDialogVisible.value = true
  loadCertsForEdit(row.plate)
}
const openEditFromView = () => {
  if (currentDetailRow.value) { handleEdit(currentDetailRow.value); detailDialogVisible.value = false }
}

// ============================================================
// 证件与保险（⭐ 存 vehicle_certs，一台车多条）
// ============================================================
const editTab = ref('base')
/* ⭐ 租户在「提醒设置」里配的各类证件默认提醒节点，新建证件时套用 */
const affairDefaults = ref(null)
loadSettings().then((st) => { affairDefaults.value = st.default_days || null }).catch(() => {})
const certsLoading = ref(false)
const certForm = ref({})
const certDueCount = ref(0)

const remindPool = (k) => (k === 'maintain' ? MAINTAIN_KM_OPTIONS : REMIND_DAYS_OPTIONS)
const blankCert = (k) => ({
  cert_no: '', start_date: '', expire_date: '',
  last_maintain_km: null, maintain_interval_km: 10000,
  remind_days: (affairDefaults.value?.[k]?.length
    ? [...affairDefaults.value[k]]
    : (k === 'maintain' ? [1000] : [30])),
  remind_enabled: true, remark: '', _id: null,
})
const initCertForm = () => {
  const o = {}
  CERT_TYPES.forEach(t => { o[t.key] = blankCert(t.key) })
  return o
}
const loadCertsForEdit = async (plate) => {
  certsLoading.value = true
  certForm.value = initCertForm()
  certDueCount.value = 0
  try {
    if (!plate) return
    const map = await loadCertMap(plate)
    Object.keys(map).forEach(k => {
      if (!certForm.value[k]) return
      const c = map[k]
      const days = parseDays(c.remind_days)
      certForm.value[k] = {
        cert_no: c.cert_no || '',
        start_date: c.start_date || '',
        expire_date: c.expire_date || '',
        last_maintain_km: c.last_maintain_km ?? null,
        maintain_interval_km: c.maintain_interval_km ?? 10000,
        remind_days: days.length ? days : blankCert(k).remind_days,
        remind_enabled: c.remind_enabled !== false,
        remark: c.remark || '',
        _id: c.id,
      }
      // 快到期/逾期 的项在 Tab 上挂个数字
      if (c.expire_date) {
        const left = dayjs(c.expire_date).startOf('day').diff(dayjs().startOf('day'), 'day')
        if (left <= 30) certDueCount.value++
      }
    })
  } catch (e) {
    console.warn('[车辆档案] 读证件失败', e)
  } finally { certsLoading.value = false }
}
const toggleCertDay = (k, d) => {
  const a = certForm.value[k].remind_days
  const i = a.indexOf(d)
  i >= 0 ? a.splice(i, 1) : a.push(d)
  a.sort((x, y) => y - x)
}
const certState = (k) => {
  const f = certForm.value[k]
  if (!f) return { text: '', color: '#94A3B8' }
  if (k === 'maintain') {
    if (!f.last_maintain_km) return { text: '未录入', color: '#94A3B8' }
    return { text: `上次 ${Number(f.last_maintain_km).toLocaleString('zh-CN')} km`, color: '#64748B' }
  }
  if (!f.expire_date) return { text: '未录入', color: '#94A3B8' }
  const left = dayjs(f.expire_date).startOf('day').diff(dayjs().startOf('day'), 'day')
  if (left < 0) return { text: `已逾期 ${Math.abs(left)} 天`, color: '#C8102E' }
  if (left <= 3) return { text: `${left} 天后到期`, color: '#EA580C' }
  return { text: `剩 ${left} 天`, color: '#047857' }
}

// ============================================================
// 司机选择
// ============================================================
const driverSelectDialogVisible = ref(false)
const driverList = ref([])
const filteredDriverList = ref([])
const driverSearchKeyword = ref('')
const selectedDriverNames = ref([])
const driverTarget = ref(null)

const loadDriverList = async () => {
  if (driverList.value.length) return
  const { data, error } = await supabase.from('drivers').select('driver_name')
  if (!error) { driverList.value = data || []; filteredDriverList.value = [...driverList.value] }
}

const openDriverSelect = (target) => {
  if (!target) return
  driverTarget.value = target
  loadDriverList()
  selectedDriverNames.value = target.driver ? target.driver.split(',').map(s => s.trim()).filter(Boolean) : []
  driverSearchKeyword.value = ''
  filteredDriverList.value = [...driverList.value]
  driverSelectDialogVisible.value = true
}

const filterDriverList = () => {
  const kw = driverSearchKeyword.value.trim().toLowerCase()
  filteredDriverList.value = kw ? driverList.value.filter(d => d.driver_name.toLowerCase().includes(kw)) : [...driverList.value]
}
const selectAllDrivers = () => {
  const names = filteredDriverList.value.map(d => d.driver_name)
  selectedDriverNames.value = [...new Set([...selectedDriverNames.value, ...names])]
}
const clearAllDrivers = () => {
  const names = filteredDriverList.value.map(d => d.driver_name)
  selectedDriverNames.value = selectedDriverNames.value.filter(n => !names.includes(n))
}
const confirmDriverSelect = () => {
  const names = selectedDriverNames.value
  const t = driverTarget.value
  if (!t) return
  t.driver = names.join(',')
  t.driverDisplay = !names.length ? '' : names.length <= 2 ? names.join('；') : `已选 ${names.length} 名司机`
  driverSelectDialogVisible.value = false
}
const clearDriverSelection = (t) => { if (t) { t.driver = ''; t.driverDisplay = '' } }

// ============================================================
// 保存
// ============================================================
const syncFromVehiclesToDrivers = async () => {
  try {
    let vq = supabase.from('vehicles').select('plate, driver')
    if (isCustomer && myCustomerId.value) {
      vq = vq.eq('customer_id', myCustomerId.value)
      // ⭐ 只有二级机构才按 org 过滤
      if (needOrgFilter.value && myOrgName.value) vq = vq.eq('org', myOrgName.value)
    }
    const { data: vehicles } = await vq
    const plateToDrivers = {}
      ; (vehicles || []).forEach(v => {
        if (v.driver) {
          const ds = v.driver.split(',').map(s => s.trim()).filter(Boolean)
          if (ds.length) plateToDrivers[v.plate] = ds
        }
      })
    const driverToPlates = {}
    Object.keys(plateToDrivers).forEach(p => {
      plateToDrivers[p].forEach(d => {
        if (!driverToPlates[d]) driverToPlates[d] = []
        if (!driverToPlates[d].includes(p)) driverToPlates[d].push(p)
      })
    })
    const updates = []
    for (const [d, plates] of Object.entries(driverToPlates)) {
      updates.push(supabase.from('drivers').update({ bound_vehicle: plates.join(',') }).eq('driver_name', d))
    }
    const { data: allDrivers } = await supabase.from('drivers').select('driver_name')
      ; (allDrivers || []).forEach(d => {
        if (!driverToPlates[d.driver_name]) {
          updates.push(supabase.from('drivers').update({ bound_vehicle: '' }).eq('driver_name', d.driver_name))
        }
      })
    await Promise.all(updates)
  } catch (e) { console.error(e) }
}

const saveEdit = async () => {
  if (!editFormData.value) return

  // ⭐ 校验：原值有机构，不允许清空
  const newOrg = String(editFormData.value.org || '').trim() || null
  if (originalOrgWhenEdit.value && !newOrg) {
    ElMessage.warning(`该车辆已归属机构「${originalOrgWhenEdit.value}」，不允许清空所属机构`)
    return
  }

  editSaving.value = true
  try {
    const { id, created_at, updated_at, driverDisplay, ...fields } = editFormData.value
    const { error } = await supabase.from('vehicles').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error

    /* ⭐ 证件：逐项 upsert；整组空且从未存过 → 不建记录 */
    const plate = fields.plate || editFormData.value.plate
    for (const t of CERT_TYPES) {
      const f = certForm.value[t.key]
      if (!f) continue
      const hasData = t.key === 'maintain'
        ? (f.last_maintain_km || f.start_date)
        : (f.cert_no || f.expire_date)
      if (!hasData && !f._id) continue
      await upsertCert({
        plate,
        org: fields.org || null,
        cert_type: t.key,
        cert_no: f.cert_no || null,
        start_date: f.start_date || null,
        expire_date: t.key === 'maintain' ? null : (f.expire_date || null),
        last_maintain_km: t.key === 'maintain' ? (f.last_maintain_km || null) : null,
        maintain_interval_km: t.key === 'maintain' ? (f.maintain_interval_km || 10000) : null,
        remind_days: f.remind_days,
        remind_enabled: f.remind_enabled !== false,
        remark: f.remark || null,
        vehicle_id: String(id),
        customer_id: myCustomerId.value ? String(myCustomerId.value) : null,
        owner_account: myAccount || null,
      })
    }

    ElMessage.success('更新成功')
    editDialogVisible.value = false
    await syncFromVehiclesToDrivers()
    await fetchVehicles()
  } catch (err) {
    ElMessage.error('更新失败：' + err.message)
  } finally { editSaving.value = false }
}

// ============================================================
// 导出
// ============================================================
const exportData = async () => {
  const li = ElLoading.service({ fullscreen: true, text: '正在导出...', background: 'rgba(0,0,0,0.6)' })
  try {
    /* ⭐ 导出走宽表视图 v_vehicle_export：一行一车 40 列，
       车辆本体 + 6 类证件一次取全，前端只做字段映射 */
    let q = supabase.from('v_vehicle_export').select('*').order('updated_at', { ascending: false })

    if (isCustomer) {
      if (!myCustomerId.value) { ElMessage.warning('未关联客户，无法导出'); return }
      q = q.eq('customer_id', myCustomerId.value)
      if (needOrgFilter.value) {
        if (!myOrgName.value) { ElMessage.warning('未关联组织，无法导出'); return }
        q = q.eq('org', myOrgName.value)
      }
    }

    if (searchForm.org) q = q.eq('org', searchForm.org)
    if (searchForm.fuelType) q = q.eq('fuel_type', searchForm.fuelType)
    if (searchForm.plate) q = q.ilike('plate', `%${searchForm.plate}%`)
    if (searchForm.vin) q = q.ilike('vin', `%${searchForm.vin}%`)
    const { data, error } = await q
    if (error) throw error
    if (!data?.length) { ElMessage.warning('没有数据可导出'); return }

    await exportWide(data.map(viewRowToLabels), `车辆档案_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`)
    ElMessage.success(`成功导出 ${data.length} 条数据`)
  } catch (err) { ElMessage.error('导出失败：' + err.message) }
  finally { li.close() }
}

// ============================================================
// 获取数据
// ============================================================
const fetchVehicles = async () => {
  // ⭐ 客户视角必须有 customerId
  if (isCustomer && !myCustomerId.value) {
    console.warn('[VehicleArchive] 客户账号未关联 customers，返回空')
    tableData.value = []; total.value = 0; saveData(); return
  }
  // ⭐ 二级机构子账号必须有 orgName
  if (needOrgFilter.value && !myOrgName.value) {
    console.warn('[VehicleArchive] 二级机构子账号 orgName 缺失，返回空')
    tableData.value = []; total.value = 0; saveData(); return
  }

  loading.value = true
  try {
    /* ⭐ 列表走宽表视图：一行一车 40 列，证件字段直接可读 */
    let q = supabase.from('v_vehicle_export').select('*', { count: 'exact' }).order('updated_at', { ascending: false })

    if (isCustomer) {
      q = q.eq('customer_id', myCustomerId.value)
      // ⭐⭐⭐ 子账号隔离：level=1 等同主账号；level>=2 按 org
      if (isRootOrgSubAccount.value) {
        console.log('[VehicleArchive] 子账号挂一级机构 → 等同主账号')
      } else if (needOrgFilter.value) {
        console.log('[VehicleArchive] 子账号挂 level=' + myOrgLevel.value + ' 机构 → 隔离 org =', myOrgName.value)
        q = q.eq('org', myOrgName.value)
      }
    }

    if (searchForm.org) q = q.eq('org', searchForm.org)
    if (searchForm.fuelType) q = q.eq('fuel_type', searchForm.fuelType)
    if (searchForm.plate) q = q.ilike('plate', `%${searchForm.plate}%`)
    if (searchForm.vin) q = q.ilike('vin', `%${searchForm.vin}%`)
    const from = (currentPage.value - 1) * pageSize.value
    const { data, error, count } = await q.range(from, from + pageSize.value - 1)
    if (error) throw error
    tableData.value = data || []; total.value = count || 0
    saveData(); saveState()
  } catch (err) { ElMessage.error('加载数据失败：' + err.message) }
  finally { loading.value = false }
}

const handleSearch = () => { currentPage.value = 1; fetchVehicles() }
const handleReset = () => {
  Object.assign(searchForm, { org: '', fuelType: '', plate: '', vin: '' })
  currentPage.value = 1
  fetchVehicles()
}
const handleSizeChange = (v) => { pageSize.value = v; currentPage.value = 1; fetchVehicles() }
const handleCurrentChange = (v) => { currentPage.value = v; fetchVehicles() }

// ============================================================
// 导入（⭐ 一张宽表，40 列，按表头名解析）
// ============================================================
const showImportDialog = ref(false)

// ============================================================
// 生命周期
// ============================================================
watch(() => [searchForm.org, searchForm.fuelType, searchForm.plate, searchForm.vin, currentPage.value, pageSize.value], saveState, { deep: true })

onMounted(async () => {
  document.addEventListener('keydown', onEscKeydown)
  if (isCustomer) {
    await loadMyCustomerId()
    await loadMyOrgInfo()
  }
  await loadOrgOptions()
  restoreState()
  await fetchVehicles()
})

onActivated(async () => {
  if (isCustomer && !myCustomerId.value) await loadMyCustomerId()
  if (isCustomer && isSubAccount && (!myOrgName.value || !myOrgLevel.value)) await loadMyOrgInfo()
  await fetchVehicles()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onEscKeydown)
})
</script>

<template>
  <div class="vehicle-archive-page">
    <!-- 搜索栏 -->
    <div class="search-card">
      <div class="search-row">
        <el-select v-model="searchForm.org" placeholder="所属机构" clearable style="width: 160px">
          <el-option v-for="o in orgOptions" :key="o" :label="o" :value="o" />
        </el-select>
        <el-select v-model="searchForm.fuelType" placeholder="燃料类型" clearable style="width: 130px">
          <el-option label="燃油车" value="燃油车" />
          <el-option label="燃气车" value="燃气车" />
          <el-option label="纯电动" value="纯电动" />
          <el-option label="氢燃料" value="氢燃料" />
        </el-select>
        <el-input v-model="searchForm.plate" placeholder="车牌号" clearable style="width: 140px" />
        <el-input v-model="searchForm.vin" placeholder="VIN码" clearable style="width: 160px" />
        <el-button type="primary" class="btn-primary" @click="handleSearch">
          <el-icon>
            <Search />
          </el-icon> 搜索
        </el-button>
        <el-button class="btn-outline" @click="handleReset">
          <el-icon>
            <Refresh />
          </el-icon> 重置
        </el-button>
      </div>
    </div>

    <!-- 表格卡片 -->
    <Teleport to="body" :disabled="!isTableFullscreen">
      <div class="table-card-wrap" :class="{ 'is-fullscreen': isTableFullscreen }">
        <div class="table-card">
          <div class="toolbar">
            <span class="total-hint">共 <b>{{ total }}</b> 条</span>

            <div class="toolbar-right">
              <template v-if="isAdmin">
                <el-button class="btn-outline" @click="toggleBatchDelete">
                  <el-icon>
                    <Delete />
                  </el-icon> {{ batchDeleteMode ? '取消' : '删除' }}
                </el-button>
                <el-button v-if="batchDeleteMode" type="danger" @click="confirmDelete" :disabled="!selectedIds.length">
                  确认删除 ({{ selectedIds.length }})
                </el-button>
              </template>

              <!-- ⭐ 导入用 Download（向下箭头） -->
              <el-button v-if="!isSubAccount" class="btn-outline" @click="showImportDialog = true">
                <el-icon>
                  <Download />
                </el-icon> 导入
              </el-button>
              <!-- ⭐ 导出用 Upload（向上箭头） -->
              <el-button class="btn-outline" @click="exportData">
                <el-icon>
                  <Upload />
                </el-icon> 导出
              </el-button>

              <button class="icon-btn" @click="fetchVehicles" title="刷新">
                <el-icon>
                  <Refresh />
                </el-icon>
              </button>

              <el-dropdown trigger="click" popper-class="density-dropdown-red" @command="handleDensityChange">
                <button class="icon-btn" title="密度"><el-icon>
                    <Operation />
                  </el-icon></button>
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
                  <button class="icon-btn" :class="{ active: columnPopoverVisible }" title="列设置"><el-icon>
                      <Setting />
                    </el-icon></button>
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
                          @click="toggleFix(col, 'left')"><el-icon>
                            <DArrowLeft />
                          </el-icon></button>
                        <button class="fix-btn" :class="{ active: col.fixed === 'right' }"
                          @click="toggleFix(col, 'right')"><el-icon>
                            <DArrowRight />
                          </el-icon></button>
                      </div>
                    </div>
                  </div>
                </div>
              </el-popover>

              <button class="icon-btn" :class="{ active: isTableFullscreen }" @click="toggleTableFullscreen">
                <el-icon>
                  <component :is="isTableFullscreen ? Close : FullScreen" />
                </el-icon>
              </button>
            </div>
          </div>

          <div class="table-wrap">
            <el-table ref="tableRef" :data="tableData" v-loading="loading" element-loading-text="加载中…"
              element-loading-background="rgba(255,255,255,0.88)" border stripe :size="tableSize" height="100%"
              class="custom-table" @selection-change="handleSelectionChange">
              <el-table-column v-if="batchDeleteMode" type="selection" width="46" align="center" />

              <template v-for="col in visibleColumns" :key="col.prop">
                <!-- 操作列 -->
                <el-table-column v-if="col.prop === 'action'" :label="col.label"
                  :width="Math.round((col.width || 118) * densityMultiplier)" :align="col.align"
                  :fixed="col.fixed || false">
                  <template #default="{ row }">
                    <div class="action-cell">
                      <el-button type="text" class="action-btn action-view" @click="handleView(row)">
                        <el-icon>
                          <View />
                        </el-icon> 查看
                      </el-button>
                      <el-button type="text" class="action-btn action-edit" @click="handleEdit(row)">
                        <el-icon>
                          <Edit />
                        </el-icon> 编辑
                      </el-button>
                    </div>
                  </template>
                </el-table-column>

                <!-- 车架号：等宽字 -->
                <el-table-column v-else-if="col.prop === 'vin'" :label="col.label"
                  :width="Math.round((col.width || 168) * densityMultiplier)" :align="col.align"
                  :fixed="col.fixed || false" show-overflow-tooltip>
                  <template #default="{ row }"><span class="mono-text">{{ row.vin || '--' }}</span></template>
                </el-table-column>

                <!-- 其余 38 列：统一文本；到期日/提醒由 cellText 处理数组 -->
                <el-table-column v-else :label="col.label" :width="Math.round((col.width || 110) * densityMultiplier)"
                  :align="col.align" :fixed="col.fixed || false" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span :class="col.prop === 'plate' ? 'plate-text' : 'text-content'">{{ cellText(row, col) }}</span>
                  </template>
                </el-table-column>
              </template>

              <template #empty>
                <div class="empty-state">
                  <el-icon class="empty-icon">
                    <Van />
                  </el-icon>
                  <p>暂无车辆档案</p>
                  <span class="empty-tip">{{ isCustomer ? '点击右上角「导入」上传您的车辆' : '暂无数据' }}</span>
                </div>
              </template>
            </el-table>
          </div>

          <div class="pagination-wrapper">
            <span class="total-text">共 {{ total }} 条</span>
            <el-pagination background layout="sizes, prev, pager, next, jumper" :total="total" :page-size="pageSize"
              :page-sizes="[20, 50, 100]" v-model:current-page="currentPage" @size-change="handleSizeChange"
              @current-change="handleCurrentChange" class="custom-pagination" />
          </div>
        </div>

        <transition name="fs-fade">
          <button v-if="isTableFullscreen" class="fs-exit-btn" @click="toggleTableFullscreen">
            <el-icon>
              <Close />
            </el-icon> 退出全屏
          </button>
        </transition>
      </div>
    </Teleport>

    <!-- 导入（⭐ 一张宽表 40 列，按表头名解析，老 10 列模板也能导） -->
    <VehicleImportDialog v-model="showImportDialog" @done="fetchVehicles" />

    <!-- 详情 -->
    <el-dialog v-model="detailDialogVisible" width="720px" top="8vh" destroy-on-close :close-on-click-modal="false"
      class="va-dialog">
      <template #header>
        <div class="detail-header">
          <span class="detail-title">车辆详情</span>
          <span v-if="currentDetailRow" class="detail-plate">{{ currentDetailRow.plate }}</span>
        </div>
      </template>
      <div v-if="currentDetailRow" class="detail-grid">
        <div class="detail-item"><span class="label">车牌号</span><span class="value strong">{{ currentDetailRow.plate ||
          '--'
        }}</span></div>
        <div class="detail-item"><span class="label">VIN码</span><span class="value mono">{{ currentDetailRow.vin || '--'
        }}</span></div>
        <div class="detail-item"><span class="label">车辆昵称</span><span class="value">{{ currentDetailRow.nickname || '--'
        }}</span></div>
        <div class="detail-item"><span class="label">所属机构组织</span><span class="value">{{ currentDetailRow.org || '--'
        }}</span></div>
        <div class="detail-item"><span class="label">绑定司机</span><span class="value">{{ currentDetailRow.driver || '--'
        }}</span></div>
        <div class="detail-item"><span class="label">燃料类型</span><span class="value">{{ currentDetailRow.fuel_type ||
          '--'
        }}</span></div>
        <div class="detail-item"><span class="label">车辆类型</span><span class="value">{{ currentDetailRow.vehicle_type ||
          '--'
        }}</span></div>
        <div class="detail-item"><span class="label">车辆用途</span><span class="value">{{ currentDetailRow.usage || '--'
        }}</span></div>
        <div class="detail-item"><span class="label">子母车</span><span class="value">{{ currentDetailRow.sub_vehicle ||
          '--'
        }}</span></div>
        <div class="detail-item"><span class="label">关联挂车</span><span class="value">{{ currentDetailRow.trailer || '--'
        }}</span></div>
        <div class="detail-item"><span class="label">车辆购买日</span><span class="value time-text">{{
          currentDetailRow.purchase_date || '--' }}</span></div>
        <div class="detail-item"><span class="label">保险购买日</span><span class="value time-text">{{
          currentDetailRow.insurance_date || '--' }}</span></div>
        <div class="detail-item"><span class="label">创建时间</span><span class="value time-text">{{
          formatDateTime(currentDetailRow.created_at) }}</span></div>
        <div class="detail-item"><span class="label">修改时间</span><span class="value time-text">{{
          formatDateTime(currentDetailRow.updated_at) }}</span></div>
      </div>
      <template #footer>
        <button class="action-btn-footer ghost" @click="goMaintenance">维保记录</button>
        <button class="action-btn-footer ghost" @click="detailDialogVisible = false">关闭</button>
        <button class="action-btn-footer primary" @click="openEditFromView">编辑</button>
      </template>
    </el-dialog>

    <!-- 编辑 -->
    <el-dialog v-model="editDialogVisible" width="720px" top="6vh" destroy-on-close :close-on-click-modal="false"
      class="va-dialog">
      <template #header>
        <div class="detail-header">
          <span class="detail-title">编辑车辆信息</span>
          <span v-if="editFormData" class="detail-plate">{{ editFormData.plate }}</span>
        </div>
      </template>
      <div v-if="editFormData" class="edit-content">
        <el-form :model="editFormData" label-width="100px" class="edit-form">
          <div class="edit-tabs">
            <span :class="{ on: editTab === 'base' }" @click="editTab = 'base'">基本信息</span>
            <span :class="{ on: editTab === 'cert' }" @click="editTab = 'cert'">
              证件与保险<span class="dot" v-if="certDueCount">{{ certDueCount }}</span>
            </span>
          </div>

          <div v-show="editTab === 'base'">
          <div class="form-section">
            <div class="section-title">基本信息</div>
            <el-row :gutter="16">
              <el-col :span="12"><el-form-item label="车牌号"><el-input
                    v-model="editFormData.plate" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="VIN码"><el-input
                    v-model="editFormData.vin" /></el-form-item></el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="12"><el-form-item label="车辆昵称"><el-input
                    v-model="editFormData.nickname" /></el-form-item></el-col>
              <el-col :span="12">
                <el-form-item label="所属机构组织（即车队）">
                  <el-select v-model="editFormData.org" placeholder="请选择" :clearable="!originalOrgWhenEdit"
                    style="width: 100%">
                    <el-option v-for="o in orgOptions" :key="o" :label="o" :value="o" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="绑定司机">
                  <el-input v-model="editFormData.driverDisplay" placeholder="点击选择司机" readonly
                    @click="openDriverSelect(editFormData)">
                    <template #suffix>
                      <el-icon v-if="editFormData.driverDisplay" class="clear-icon"
                        @click.stop="clearDriverSelection(editFormData)">
                        <Delete />
                      </el-icon>
                    </template>
                  </el-input>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="燃料类型">
                  <el-select v-model="editFormData.fuel_type" placeholder="请选择" clearable style="width: 100%">
                    <el-option label="燃油车" value="燃油车" />
                    <el-option label="燃气车" value="燃气车" />
                    <el-option label="纯电动" value="纯电动" />
                    <el-option label="氢燃料" value="氢燃料" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
          </div>
          <div class="form-section">
            <div class="section-title">车辆参数</div>
            <el-row :gutter="16">
              <el-col :span="12"><el-form-item label="车辆类型"><el-input
                    v-model="editFormData.vehicle_type" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="车辆用途"><el-input
                    v-model="editFormData.usage" /></el-form-item></el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="12"><el-form-item label="子母车"><el-input
                    v-model="editFormData.sub_vehicle" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="关联挂车"><el-input
                    v-model="editFormData.trailer" /></el-form-item></el-col>
            </el-row>
          </div>
          <div class="form-section">
            <div class="section-title">日期信息</div>
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="车辆购买日">
                  <el-date-picker v-model="editFormData.purchase_date" type="date" value-format="YYYY-MM-DD"
                    style="width: 100%" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="保险购买日">
                  <el-date-picker v-model="editFormData.insurance_date" type="date" value-format="YYYY-MM-DD"
                    style="width: 100%" />
                </el-form-item>
              </el-col>
            </el-row>
          </div>
          <div class="form-section">
            <div class="section-title">时间信息</div>
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="创建时间"><span class="time-text">{{ formatDateTime(editFormData.created_at)
                }}</span></el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="修改时间"><span class="time-text">{{ formatDateTime(editFormData.updated_at)
                }}</span></el-form-item>
              </el-col>
            </el-row>
          </div>
          </div><!-- /base -->

          <!-- ⭐ 证件与保险：一行一个证件，存 vehicle_certs（不占 vehicles 列） -->
          <div v-show="editTab === 'cert'" class="cert-pane">
            <div v-if="certsLoading" class="cert-loading">正在读取证件…</div>
            <div v-for="t in CERT_TYPES" :key="t.key" class="cert-block">
              <div class="cert-head">
                <span class="cert-tag" :style="{ background: t.bg, color: t.color }">{{ t.name }}</span>
                <span class="cert-state" :style="{ color: certState(t.key).color }">{{ certState(t.key).text }}</span>
                <span class="cert-switch">
                  <el-switch v-model="certForm[t.key].remind_enabled" size="small" />
                  <em>提醒</em>
                </span>
              </div>

              <el-row :gutter="12">
                <el-col :span="12">
                  <el-form-item :label="t.key === 'maintain' ? '最近保养日期' : '证号 / 保单号'">
                    <el-date-picker v-if="t.key === 'maintain'" v-model="certForm[t.key].start_date"
                      type="date" value-format="YYYY-MM-DD" style="width:100%" />
                    <el-input v-else v-model="certForm[t.key].cert_no" placeholder="可不填" />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item :label="t.key === 'maintain' ? '上次保养里程' : (t.key === 'driving' ? '有效期至' : '到期日')">
                    <el-input v-if="t.key === 'maintain'" v-model.number="certForm[t.key].last_maintain_km"
                      placeholder="km"><template #append>km</template></el-input>
                    <el-date-picker v-else v-model="certForm[t.key].expire_date" type="date"
                      value-format="YYYY-MM-DD" style="width:100%" />
                  </el-form-item>
                </el-col>
              </el-row>

              <el-row :gutter="12" v-if="t.key === 'maintain'">
                <el-col :span="12">
                  <el-form-item label="间隔里程">
                    <el-input v-model.number="certForm[t.key].maintain_interval_km" placeholder="10000">
                      <template #append>km</template>
                    </el-input>
                  </el-form-item>
                </el-col>
              </el-row>
              <el-row :gutter="12" v-else-if="t.key !== 'driving'">
                <el-col :span="12">
                  <el-form-item label="起期">
                    <el-date-picker v-model="certForm[t.key].start_date" type="date"
                      value-format="YYYY-MM-DD" style="width:100%" />
                  </el-form-item>
                </el-col>
              </el-row>

              <div class="cert-days">
                <span class="cert-days-lb">{{ t.key === 'maintain' ? '提前提醒(km)' : '提前提醒(天)' }}</span>
                <span v-for="d in remindPool(t.key)" :key="d" class="cert-chip"
                  :class="{ on: certForm[t.key].remind_days.includes(d) }"
                  @click="toggleCertDay(t.key, d)">{{ d }}</span>
              </div>
            </div>
            <div class="cert-tip">
              证件单独存一张表（一台车多条），到期提醒按这里的日期走。留空 = 这车没有该项证件。
            </div>
          </div>
        </el-form>
      </div>
      <template #footer>
        <button class="action-btn-footer ghost" @click="editDialogVisible = false">取消</button>
        <button class="action-btn-footer primary" :disabled="editSaving" @click="saveEdit">{{ editSaving ? '保存中...' :
          '保存' }}</button>
      </template>
    </el-dialog>

    <!-- 司机选择 -->
    <el-dialog v-model="driverSelectDialogVisible" title="选择绑定司机" width="520px" destroy-on-close
      :close-on-click-modal="false" append-to-body class="va-dialog">
      <div class="driver-toolbar">
        <el-input v-model="driverSearchKeyword" placeholder="搜索司机姓名" clearable class="driver-search"
          @input="filterDriverList">
          <template #prefix><el-icon>
              <Search />
            </el-icon></template>
        </el-input>
        <button class="action-btn-footer ghost small" @click="selectAllDrivers">全选</button>
        <button class="action-btn-footer ghost small" @click="clearAllDrivers">取消全选</button>
      </div>
      <div class="driver-list-wrap">
        <el-checkbox-group v-model="selectedDriverNames" class="driver-checkbox-group">
          <div v-for="d in filteredDriverList" :key="d.driver_name" class="driver-item">
            <el-checkbox :label="d.driver_name">{{ d.driver_name }}</el-checkbox>
          </div>
        </el-checkbox-group>
        <div v-if="!filteredDriverList.length" class="driver-empty">暂无司机</div>
      </div>
      <template #footer>
        <button class="action-btn-footer ghost" @click="driverSelectDialogVisible = false">取消</button>
        <button class="action-btn-footer primary" @click="confirmDriverSelect">确定</button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ============================================================
   ⭐ 页面布局：锁死高度，不能上下拖动
   ============================================================ */
.vehicle-archive-page {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: calc(100vh - 101px);
  max-height: calc(100vh - 101px);
  box-sizing: border-box;
  overflow: hidden;
  background: #F8FAFC;
  font-size: 13px;
}

.search-card {
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  padding: 12px 16px;
  flex-shrink: 0;
}

.search-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.search-row :deep(.el-input__wrapper),
.search-row :deep(.el-select__wrapper) {
  border-radius: 6px !important;
  background: #F8FAFC !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  transition: all 0.25s;
  min-height: 32px;
}

.search-row :deep(.el-input__wrapper:hover),
.search-row :deep(.el-select__wrapper:hover) {
  background: var(--brand-primary-light) !important;
  box-shadow: 0 0 0 1px #FCA5A5 inset !important;
}

.search-row :deep(.el-input__wrapper.is-focus),
.search-row :deep(.el-select__wrapper.is-focused) {
  background: #fff !important;
  box-shadow: 0 0 0 2px rgba(var(--brand-rgb), 0.15), 0 0 0 1px var(--brand-primary) inset !important;
}

.btn-primary {
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark)) !important;
  border: none !important;
  color: #fff !important;
  font-weight: 600;
  border-radius: 6px !important;
  box-shadow: 0 3px 10px rgba(var(--brand-rgb), 0.25);
  transition: all 0.25s;
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 5px 14px rgba(var(--brand-rgb), 0.4);
}

.btn-outline {
  border-radius: 6px !important;
  border-color: #CBD5E1 !important;
  color: #334155;
  background: #fff !important;
  transition: all 0.25s;
}

.btn-outline:hover {
  border-color: var(--brand-primary) !important;
  color: var(--brand-primary) !important;
  background: var(--brand-primary-light) !important;
  transform: translateY(-1px);
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
  box-shadow: 0 20px 60px rgba(var(--brand-rgb), 0.18);
}

.table-card {
  flex: 1;
  min-height: 0;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
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
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.total-hint {
  font-size: 13px;
  color: #64748B;
}

.total-hint b {
  color: var(--brand-primary);
  font-family: 'Courier New', monospace;
  font-size: 14px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-wrap: wrap;
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
  transition: all 0.25s;
}

.icon-btn:hover {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
  background: var(--brand-primary-light);
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(var(--brand-rgb), 0.15);
}

.icon-btn.active {
  border-color: var(--brand-primary);
  color: #fff;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  box-shadow: 0 3px 10px rgba(var(--brand-rgb), 0.35);
}

.table-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border-radius: 8px;
}

/* ============================================================
   表格样式
   ============================================================ */
.custom-table {
  border-radius: 8px;
  overflow: hidden;
  font-size: 12.5px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
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

:deep(.custom-table.el-table--large td.el-table__cell) {
  padding: 13px 0;
}

:deep(.custom-table.el-table--default td.el-table__cell) {
  padding: 9px 0;
}

:deep(.custom-table.el-table--small td.el-table__cell) {
  padding: 5px 0;
}

:deep(.custom-table .el-table__row:hover td) {
  background: var(--brand-primary-light) !important;
}

.plate-text {
  font-size: 12.5px;
  font-weight: 500;
  color: #0F172A;
  letter-spacing: 0.2px;
  white-space: nowrap;
}

.mono-text {
  font-family: 'Courier New', Courier, monospace;
  color: #475569;
  font-size: 12px;
  font-weight: 500;
}

.text-content {
  color: #334155;
  font-size: 12.5px;
}

.time-text {
  color: #475569;
  font-family: 'Courier New', Courier, monospace;
  font-size: 12px;
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
  font-size: 12.5px;
}

.action-view {
  color: #0EA5E9;
}

.action-view:hover {
  color: #0369A1;
  background: #F0F9FF;
}

.action-edit {
  color: var(--brand-primary);
}

.action-edit:hover {
  color: #7F1D1D;
  background: var(--brand-primary-light);
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
}

.empty-state p {
  font-size: 14px;
  margin: 0;
  color: #64748B;
  font-weight: 600;
}

.empty-tip {
  font-size: 12px;
  color: #CBD5E1;
}

.pagination-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px solid #E2E8F0;
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
  color: var(--brand-primary);
  transform: scale(1.08);
}

:deep(.custom-pagination .el-pager li.is-active) {
  background-color: var(--brand-primary) !important;
  color: #fff !important;
  box-shadow: 0 2px 6px rgba(var(--brand-rgb), 0.35);
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
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(var(--brand-rgb), 0.4);
  transition: all 0.25s;
  font-family: inherit;
}

.fs-exit-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 28px rgba(var(--brand-rgb), 0.55);
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

:deep(.va-dialog .el-dialog) {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.18);
  animation: dialog-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes dialog-in {
  from {
    opacity: 0;
    transform: scale(0.92) translateY(20px);
  }

  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

:deep(.va-dialog .el-dialog__header) {
  padding: 16px 22px;
  margin: 0;
  border-bottom: 1px solid #F1F5F9;
}

:deep(.va-dialog .el-dialog__title) {
  font-weight: 700;
  color: #0F172A;
  font-size: 15px;
}

:deep(.va-dialog .el-dialog__body) {
  padding: 20px 22px;
}

:deep(.va-dialog .el-dialog__footer) {
  padding: 14px 22px;
  background: #FAFBFC;
  border-top: 1px solid #F1F5F9;
}

.import-step {
  padding: 10px 0;
  border-bottom: 1px dashed #E2E8F0;
}

.import-step:last-of-type {
  border-bottom: none;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.step-num {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  box-shadow: 0 3px 8px rgba(var(--brand-rgb), 0.3);
}

.step-title {
  font-size: 13px;
  font-weight: 700;
  color: #0F172A;
}

.step-body {
  padding-left: 32px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.step-body.step-col {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.step-tip {
  font-size: 12px;
  color: #94A3B8;
}

.import-upload :deep(.el-upload) {
  width: 100%;
}

.import-upload :deep(.el-upload-dragger) {
  border-radius: 8px;
  border: 1.5px dashed #CBD5E1;
  background: #F8FAFC;
  padding: 18px 0;
  transition: all 0.25s;
}

.import-upload :deep(.el-upload-dragger:hover) {
  border-color: var(--brand-primary);
  background: var(--brand-primary-light);
}

.upload-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.upload-icon {
  font-size: 32px;
  color: #94A3B8;
  transition: color 0.25s;
}

.import-upload :deep(.el-upload-dragger:hover) .upload-icon {
  color: var(--brand-primary);
}

.upload-text {
  font-size: 13px;
  color: #475569;
}

.upload-filename {
  font-size: 12px;
  color: #475569;
  font-family: 'Courier New', monospace;
}

.import-errors {
  margin-top: 12px;
  padding: 10px 14px;
  background: var(--brand-primary-light);
  border: 1px solid #FCA5A5;
  border-radius: 8px;
  max-height: 140px;
  overflow-y: auto;
}

.error-title {
  font-size: 12px;
  font-weight: 700;
  color: #991B1B;
  margin-bottom: 6px;
}

.error-list {
  font-size: 12px;
  color: #B91C1C;
  line-height: 1.6;
  font-family: 'Courier New', monospace;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.detail-title {
  font-size: 16px;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: 0.3px;
}

.detail-plate {
  display: inline-flex;
  align-items: center;
  padding: 3px 12px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  color: #fff;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  box-shadow: 0 3px 10px rgba(var(--brand-rgb), 0.35);
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  background: #F1F5F9;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #F1F5F9;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #fff;
  transition: background 0.2s;
}

.detail-item:hover {
  background: #FAFBFC;
}

.detail-item .label {
  flex-shrink: 0;
  width: 90px;
  font-size: 13px;
  color: #64748B;
  font-weight: 600;
}

.detail-item .value {
  flex: 1;
  font-size: 13.5px;
  color: #0F172A;
  font-weight: 500;
  word-break: break-all;
}

.detail-item .value.strong {
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 0.3px;
}

.detail-item .value.mono {
  font-family: 'Courier New', Courier, monospace;
  font-size: 13px;
}

.form-section {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px dashed #F1F5F9;
}

.form-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.section-title {
  position: relative;
  padding-left: 12px;
  margin-bottom: 14px;
  font-size: 13.5px;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: 0.3px;
}

.section-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 12px;
  border-radius: 2px;
  background: var(--brand-primary);
}

.edit-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.edit-form :deep(.el-form-item__label) {
  font-weight: 600;
  color: #334155;
  font-size: 13px;
}

.edit-form :deep(.el-input__wrapper),
.edit-form :deep(.el-select__wrapper) {
  border-radius: 8px !important;
  background: #F8FAFC !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  transition: all 0.25s;
}

.edit-form :deep(.el-input__wrapper:hover),
.edit-form :deep(.el-select__wrapper:hover) {
  background: #fff !important;
  box-shadow: 0 0 0 1px rgba(var(--brand-rgb), 0.4) inset !important;
}

.edit-form :deep(.el-input__wrapper.is-focus),
.edit-form :deep(.el-select__wrapper.is-focused) {
  background: #fff !important;
  box-shadow: 0 0 0 1px var(--brand-primary) inset, 0 0 0 3px rgba(var(--brand-rgb), 0.1) !important;
}

.clear-icon {
  cursor: pointer;
  color: #94A3B8;
  transition: color 0.2s;
}

.clear-icon:hover {
  color: var(--brand-primary);
}

.driver-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.driver-search {
  flex: 1;
}

.driver-list-wrap {
  max-height: 300px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid #F1F5F9;
  border-radius: 8px;
  background: #FAFBFC;
}

.driver-checkbox-group {
  display: flex;
  flex-direction: column;
}

.driver-item {
  padding: 6px 10px;
  border-radius: 6px;
  transition: background 0.2s;
}

.driver-item:hover {
  background: var(--brand-primary-light);
}

.driver-checkbox-group :deep(.el-checkbox__label) {
  font-size: 13px;
  color: #334155;
  font-weight: 500;
}

.driver-checkbox-group :deep(.el-checkbox__input.is-checked + .el-checkbox__label) {
  color: var(--brand-primary);
  font-weight: 700;
}

.driver-checkbox-group :deep(.el-checkbox__inner) {
  border-color: #CBD5E1;
  border-radius: 3px;
}

.driver-checkbox-group :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background-color: var(--brand-primary);
  border-color: var(--brand-primary);
}

.driver-empty {
  text-align: center;
  color: #94A3B8;
  padding: 30px 0;
  font-size: 13px;
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
  transition: all 0.25s;
}

.action-btn-footer.small {
  padding: 6px 14px;
  font-size: 12.5px;
}

.action-btn-footer.ghost {
  background: #F1F5F9;
  color: #475569;
  border: 1px solid #E2E8F0;
}

.action-btn-footer.ghost:hover {
  background: #E2E8F0;
  color: #1E293B;
  transform: translateY(-2px);
}

.action-btn-footer.primary {
  color: #FFFFFF;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  box-shadow: 0 6px 20px rgba(var(--brand-rgb), 0.4);
}

.action-btn-footer.primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 12px 30px rgba(var(--brand-rgb), 0.55);
}

.action-btn-footer.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

:deep(.el-loading-mask) {
  background: rgba(255, 255, 255, 0.88) !important;
  backdrop-filter: blur(3px);
  transition: opacity 0.3s;
}

:deep(.el-loading-spinner) {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  top: 50%;
}

:deep(.el-loading-spinner .circular) {
  width: 44px;
  height: 44px;
  animation: loading-rotate 1.6s linear infinite;
}

:deep(.el-loading-spinner .path) {
  stroke: var(--brand-primary);
  stroke-width: 3;
  stroke-linecap: round;
  animation: loading-dash 1.5s ease-in-out infinite;
  filter: drop-shadow(0 2px 6px rgba(var(--brand-rgb), 0.35));
}

@keyframes loading-rotate {
  100% {
    transform: rotate(360deg);
  }
}

@keyframes loading-dash {
  0% {
    stroke-dasharray: 1, 200;
    stroke-dashoffset: 0;
  }

  50% {
    stroke-dasharray: 90, 200;
    stroke-dashoffset: -35px;
  }

  100% {
    stroke-dasharray: 90, 200;
    stroke-dashoffset: -124px;
  }
}

:deep(.el-loading-text) {
  color: #64748B;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 1.5px;
  margin: 0;
  animation: loading-text-pulse 1.8s ease-in-out infinite;
}

@keyframes loading-text-pulse {

  0%,
  100% {
    opacity: 0.45;
  }

  50% {
    opacity: 1;
  }
}

@media (max-width: 900px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>

<style>
/* ============================================================
   ⭐ 全局兜底：锁死 html / body 的滚动（不影响弹窗内部滚动）
   ============================================================ */
html,
body {
  height: 100%;
  overflow: hidden;
}

/* 全局下拉/弹层样式 */
.density-dropdown-red.el-dropdown__popper.el-popper,
.column-setting-popper.el-popover.el-popper {
  border: 2px solid #FFFFFF !important;
  box-shadow: 0 10px 32px rgba(var(--brand-rgb), 0.18), 0 0 0 1px rgba(var(--brand-rgb), 0.12) !important;
  border-radius: 10px !important;
  overflow: hidden;
  background: #FFFFFF !important;
}

.column-setting-popper.el-popover.el-popper {
  padding: 0 !important;
}

.density-dropdown-red .el-dropdown-menu {
  padding: 4px !important;
  background: #FFFFFF !important;
}

.density-dropdown-red .el-dropdown-menu__item {
  font-size: 13px !important;
  color: var(--brand-primary) !important;
  font-weight: 600 !important;
  border-radius: 6px !important;
  padding: 6px 16px !important;
  transition: all 0.25s;
}

.density-dropdown-red .el-dropdown-menu__item:hover {
  color: #fff !important;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark)) !important;
  transform: translateX(2px);
}

.density-dropdown-red .density-item {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
}

.density-dropdown-red .density-item.active {
  color: var(--brand-primary);
  font-weight: 700;
}

.density-dropdown-red .el-dropdown-menu__item:hover .density-item.active {
  color: #fff;
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
}

.col-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 700;
  color: var(--brand-primary);
}

.col-title .el-icon {
  color: var(--brand-primary);
  font-size: 14px;
}

.col-reset {
  font-size: 12.5px;
  color: var(--brand-primary);
  cursor: pointer;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.25s;
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
  transition: all 0.25s;
  user-select: none;
}

.column-item:hover {
  background: var(--brand-primary-light);
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
  align-items: center;
  color: #FCA5A5;
  cursor: grab;
  font-size: 14px;
  transition: color 0.2s;
}

.column-item:hover .drag-handle {
  color: var(--brand-primary);
}

.col-checkbox {
  flex: 1;
  font-size: 13px;
}

.col-checkbox :deep(.el-checkbox__label) {
  font-size: 13px;
  color: var(--brand-primary);
  font-weight: 600;
}

.col-checkbox :deep(.el-checkbox__inner) {
  border-color: #FCA5A5;
  border-radius: 3px;
}

.col-checkbox :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background-color: var(--brand-primary);
  border-color: var(--brand-primary);
}

.col-checkbox :deep(.el-checkbox__input.is-checked + .el-checkbox__label) {
  color: var(--brand-primary);
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
  transition: all 0.25s;
}

.fix-btn:hover {
  color: var(--brand-primary);
  background: #FEE2E2;
  transform: scale(1.1);
}

.fix-btn.active {
  color: #fff;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
}

.el-message-box__btns .el-button--primary {
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark)) !important;
  border-color: var(--brand-primary) !important;
}

/* ============================================================
   ⭐ 证件与保险 Tab
   ============================================================ */
.edit-tabs { display: flex; gap: 6px; margin: 0 0 14px; border-bottom: 1px solid #EEF2F7; padding-bottom: 10px; }
.edit-tabs span {
  position: relative; font-size: 13px; font-weight: 700; color: #64748B;
  padding: 6px 13px; border-radius: 8px; cursor: pointer; user-select: none;
}
.edit-tabs span:hover { background: #F8FAFC; }
.edit-tabs span.on { background: #FDF2F4; color: #C8102E; }
.edit-tabs span .dot {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 16px; height: 16px; border-radius: 9px; background: #C8102E; color: #fff;
  font-size: 10px; font-weight: 800; margin-left: 5px; padding: 0 4px; vertical-align: 1px;
}
.cert-pane { padding-bottom: 4px; }
.cert-loading { font-size: 12px; color: #94A3B8; padding: 6px 0 12px; }
.cert-block {
  border: 1px solid #EEF2F7; border-radius: 10px;
  padding: 11px 13px 4px; margin-bottom: 10px; background: #FCFDFE;
}
.cert-head { display: flex; align-items: center; gap: 9px; margin-bottom: 9px; }
.cert-tag { font-size: 11.5px; font-weight: 800; padding: 2px 8px; border-radius: 5px; }
.cert-state { font-size: 12px; font-weight: 700; }
.cert-switch { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.cert-switch em { font-style: normal; font-size: 11.5px; color: #94A3B8; font-weight: 600; }
.cert-days { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 2px 0 9px; }
.cert-days-lb { font-size: 12px; color: #94A3B8; font-weight: 600; margin-right: 3px; }
.cert-chip {
  height: 24px; padding: 0 10px; border-radius: 12px; border: 1px solid #E2E8F0;
  background: #fff; font-size: 11.5px; font-weight: 700; color: #64748B;
  display: inline-flex; align-items: center; cursor: pointer;
}
.cert-chip.on { background: #C8102E; border-color: #C8102E; color: #fff; }
.cert-tip { font-size: 11.5px; color: #94A3B8; line-height: 1.7; padding: 2px 0 6px; }
.cert-pane :deep(.el-form-item) { margin-bottom: 12px; }
.cert-pane :deep(.el-form-item__label) { font-size: 12.5px; color: #64748B; }

/* ============================================================
   ⭐ 编辑弹窗内容变多（基本信息 + 6 组证件）
   锁高度、body 内滚、footer 常驻
   ⚠️ va-dialog 这个 class 就落在 .el-dialog 自己身上（不是祖先），
      所以只能写 .va-dialog.el-dialog；scoped 里的 :deep(.va-dialog .el-dialog) 永不命中。
   ============================================================ */
.va-dialog.el-dialog {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 6vh - 16px);
  margin-bottom: 0;
}
.va-dialog .el-dialog__header { flex: 0 0 auto; }
.va-dialog .el-dialog__footer { flex: 0 0 auto; }
.va-dialog .el-dialog__body { flex: 1; min-height: 0; overflow: auto; }
</style>