<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, onActivated, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox, ElLoading } from 'element-plus'
import {
  Upload, Search, Refresh, Delete, Download,
  User, View, Edit, Operation, Setting, FullScreen, Close,
  Grid, Rank, DArrowLeft, DArrowRight, Van,
} from '@element-plus/icons-vue'
import { supabase } from '@/utils/supabase'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import dayjs from 'dayjs'

const formatDateTime = (d) => d ? dayjs(d).format('YYYY-MM-DD HH:mm:ss') : '--'

// ============================================================
// ⭐ 当前登录用户 & 权限判断
// ============================================================
const currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('currentUser') || '{}') }
  catch { return {} }
})()
const isAdmin = currentUser.role === 'admin'
const isCustomer = !isAdmin                        // ⭐ 非管理员一律按客户处理
const isSubAccount = !!currentUser.isSubAccount    // ⭐ 子账号
const myAccount = currentUser.masterAccount || currentUser.account || ''
const myPhone = currentUser.masterPhone || currentUser.phone || ''

// ⭐ 客户 ID
const myCustomerId = ref(currentUser.customerId || null)
const loadMyCustomerId = async () => {
  if (!isCustomer) return
  if (myCustomerId.value) return
  if (!myPhone) return
  try {
    const { data } = await supabase
      .from('customers').select('id').eq('phone', myPhone).maybeSingle()
    if (data) myCustomerId.value = data.id
  } catch (e) {}
}

// ============================================================
// 缓存（key 加用户区分）
// ============================================================
const userKey = isAdmin ? '_admin' : `_cust_${currentUser.account || 'guest'}`
const CACHE_KEY = 'driver_archive_cache' + userKey
const STATE_KEY = 'driver_archive_state' + userKey
const DENSITY_KEY = 'driver_archive_density' + userKey

const searchForm = reactive({ org: '', driverName: '', phone: '' })
const tableData = ref([])
const total = ref(0)
const pageSize = ref(20)
const currentPage = ref(1)
const gotoPage = ref(1)
const loading = ref(false)
const orgOptions = ref([])
const totalPages = computed(() => Math.ceil(total.value / pageSize.value) || 1)

const restoreState = () => {
  try {
    const s = JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null')
    if (s) {
      Object.assign(searchForm, { org: s.org || '', driverName: s.driverName || '', phone: s.phone || '' })
      currentPage.value = s.currentPage || 1
      pageSize.value = s.pageSize || 20
      gotoPage.value = s.currentPage || 1
    }
  } catch (e) {}
}
const saveState = () => {
  sessionStorage.setItem(STATE_KEY, JSON.stringify({ ...searchForm, currentPage: currentPage.value, pageSize: pageSize.value }))
}
const restoreData = () => {
  try {
    const d = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null')
    if (d) { tableData.value = d.tableData || []; total.value = d.total || 0; return true }
  } catch (e) {}
  return false
}
const saveData = () => {
  sessionStorage.setItem(CACHE_KEY, JSON.stringify({ tableData: tableData.value, total: total.value }))
}

const loadOrgOptions = async () => {
  try {
    let query = supabase.from('organizations').select('name').order('id')
    if (isCustomer) query = query.eq('owner_account', myAccount)
    const { data } = await query
    orgOptions.value = (data || []).map(o => o.name)
  } catch (e) {}
}

// ============================================================
// 密度 / 列设置 / 全屏
// ============================================================
const tableSize = ref(sessionStorage.getItem(DENSITY_KEY) || 'default')
const densityMultiplier = computed(() => tableSize.value === 'large' ? 1.15 : tableSize.value === 'small' ? 0.85 : 1)

const handleDensityChange = (cmd) => {
  tableSize.value = cmd
  sessionStorage.setItem(DENSITY_KEY, cmd)
}

const columnPopoverVisible = ref(false)
const DEFAULT_COLUMNS = [
  { prop: 'driver_name',   label: '司机姓名',   visible: true, fixed: 'left', minWidth: 110, align: 'left' },
  { prop: 'org',           label: '所属组织结构', visible: true, fixed: false, minWidth: 140, align: 'left' },
  { prop: 'gender',        label: '性别',       visible: true, fixed: false, minWidth: 70,  align: 'center' },
  { prop: 'age',           label: '年龄',       visible: true, fixed: false, minWidth: 60,  align: 'center' },
  { prop: 'license_type',  label: '驾照类型',   visible: true, fixed: false, minWidth: 90,  align: 'center' },
  { prop: 'phone',         label: '手机号',     visible: true, fixed: false, minWidth: 120, align: 'center' },
  { prop: 'bound_vehicle', label: '绑定车辆',   visible: true, fixed: false, minWidth: 130, align: 'left' },
  { prop: 'updated_at',    label: '修改时间',   visible: true, fixed: false, minWidth: 150, align: 'center' },
  { prop: 'operator',      label: '操作人',     visible: true, fixed: false, minWidth: 90,  align: 'center' },
  { prop: 'action',        label: '操作',       visible: true, fixed: 'right', width: 200, align: 'center' },
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

const isTableFullscreen = ref(false)
const toggleTableFullscreen = () => { isTableFullscreen.value = !isTableFullscreen.value }
const onEscKeydown = (e) => {
  if (e.key === 'Escape' && isTableFullscreen.value) isTableFullscreen.value = false
}

// ============================================================
// 批量删除（仅主账号/管理员）
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
  if (isSubAccount) { ElMessage.warning('子账号无权删除'); return }
  if (!selectedIds.value.length) return
  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedIds.value.length} 条司机档案吗？此操作不可恢复！`,
      '删除确认',
      { confirmButtonText: '确定删除', cancelButtonText: '取消', type: 'warning' }
    )
    const li = ElLoading.service({ fullscreen: true, text: '正在删除...', background: 'rgba(0,0,0,0.6)' })
    try {
      const { error } = await supabase.from('drivers').delete().in('id', selectedIds.value)
      if (error) throw error
      ElMessage.success(`成功删除 ${selectedIds.value.length} 条数据`)
      batchDeleteMode.value = false; selectedIds.value = []
      await fetchDrivers()
    } finally { li.close() }
  } catch (err) {
    if (err === 'cancel') return
    ElMessage.error('删除失败：' + err.message)
  }
}

// ============================================================
// 查看 / 编辑 / 新增
// ============================================================
const detailDialogVisible = ref(false)
const currentDetailRow = ref(null)
const handleView = (row) => { currentDetailRow.value = row; detailDialogVisible.value = true }

const editDialogVisible = ref(false)
const editFormData = ref(null)
const editSaving = ref(false)

const handleEdit = (row) => {
  if (isSubAccount) { ElMessage.warning('子账号无权编辑'); return }
  const data = JSON.parse(JSON.stringify(row))
  const plates = data.bound_vehicle ? data.bound_vehicle.split(',').map(s => s.trim()).filter(Boolean) : []
  data.vehicleDisplay = !plates.length ? '' : plates.length <= 2 ? plates.join('；') : `已选 ${plates.length} 辆车`
  editFormData.value = data
  editDialogVisible.value = true
}
const openEditFromView = () => {
  if (isSubAccount) return
  if (currentDetailRow.value) { handleEdit(currentDetailRow.value); detailDialogVisible.value = false }
}

const saveEdit = async () => {
  if (isSubAccount) { ElMessage.warning('子账号无权编辑'); return }
  if (!editFormData.value) return
  editSaving.value = true
  try {
    const { id, created_at, updated_at, vehicleDisplay, customer_id, ...fields } = editFormData.value
    const { error } = await supabase.from('drivers').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    ElMessage.success('更新成功')
    editDialogVisible.value = false
    await fetchDrivers()
    await syncVehicleBoundDriver()
  } catch (err) {
    ElMessage.error('更新失败：' + err.message)
  } finally { editSaving.value = false }
}

const addDialogVisible = ref(false)
const addFormData = reactive({
  driver_name: '', org: '', gender: '', age: null, license_type: '', phone: '',
  bound_vehicle: '', vehicleDisplay: '', operator: '管理员',
})
const addSaving = ref(false)

const handleAdd = () => {
  if (isSubAccount) { ElMessage.warning('子账号无权新增'); return }
  Object.assign(addFormData, {
    driver_name: '', org: '', gender: '', age: null, license_type: '', phone: '',
    bound_vehicle: '', vehicleDisplay: '', operator: currentUser.name || '管理员',
  })
  addDialogVisible.value = true
}

const saveAdd = async () => {
  if (isSubAccount) { ElMessage.warning('子账号无权新增'); return }
  if (!addFormData.driver_name || !addFormData.phone) {
    ElMessage.warning('司机姓名和手机号为必填项')
    return
  }
  addSaving.value = true
  try {
    // ⭐ 查重也按客户隔离
    let checkQ = supabase.from('drivers').select('phone').eq('phone', addFormData.phone)
    if (isCustomer && myCustomerId.value) checkQ = checkQ.eq('customer_id', myCustomerId.value)
    const { data: existing, error: checkError } = await checkQ
    if (checkError) throw checkError
    if (existing && existing.length > 0) {
      ElMessage.error(`手机号 ${addFormData.phone} 已存在`)
      addSaving.value = false
      return
    }
    const insertData = {
      driver_name: addFormData.driver_name,
      org: addFormData.org || null,
      gender: addFormData.gender || null,
      age: addFormData.age || null,
      license_type: addFormData.license_type || null,
      phone: addFormData.phone,
      bound_vehicle: addFormData.bound_vehicle || null,
      operator: addFormData.operator || '管理员',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    // ⭐ 客户新增：写入 customer_id
    if (isCustomer && myCustomerId.value) {
      insertData.customer_id = myCustomerId.value
    }
    const { error } = await supabase.from('drivers').insert([insertData])
    if (error) throw error
    ElMessage.success('新增司机成功')
    addDialogVisible.value = false
    await fetchDrivers()
    await syncVehicleBoundDriver()
  } catch (err) {
    ElMessage.error('新增失败：' + err.message)
  } finally { addSaving.value = false }
}

// ============================================================
// 车辆选择（司机绑定车辆）
// ============================================================
const vehicleSelectDialogVisible = ref(false)
const vehicleList = ref([])
const filteredVehicleList = ref([])
const vehicleSearchKeyword = ref('')
const selectedVehiclePlates = ref([])
const vehicleTarget = ref(null)
const isBindingMode = ref(false)

const sortVehiclesBySelected = (list) => {
  const selected = selectedVehiclePlates.value
  return [...list].sort((a, b) => {
    const aS = selected.includes(a.plate)
    const bS = selected.includes(b.plate)
    if (aS && !bS) return -1
    if (!aS && bS) return 1
    return 0
  })
}

const loadVehicleList = async () => {
  if (vehicleList.value.length) return
  try {
    let q = supabase.from('vehicles').select('plate')
    if (isCustomer && myCustomerId.value) {
      q = q.eq('customer_id', myCustomerId.value)
    }
    const { data, error } = await q
    if (error) {
      const { data: d2 } = await supabase.from('vehicles').select('plate')
      vehicleList.value = d2 || []
    } else {
      vehicleList.value = data || []
    }
    filteredVehicleList.value = sortVehiclesBySelected(vehicleList.value)
  } catch (e) { console.error(e) }
}

const openVehicleSelect = async (target, binding = false) => {
  if (isSubAccount) { ElMessage.warning('子账号无权操作'); return }
  if (!target) return
  vehicleTarget.value = target
  isBindingMode.value = binding
  await loadVehicleList()
  filteredVehicleList.value = sortVehiclesBySelected(vehicleList.value)
  const bound = target.bound_vehicle || ''
  selectedVehiclePlates.value = bound ? bound.split(',').map(s => s.trim()).filter(Boolean) : []
  vehicleSearchKeyword.value = ''
  vehicleSelectDialogVisible.value = true
}

const filterVehicleList = () => {
  if (!vehicleSearchKeyword.value) {
    filteredVehicleList.value = sortVehiclesBySelected(vehicleList.value)
  } else {
    const kw = vehicleSearchKeyword.value.trim().toLowerCase()
    const matched = vehicleList.value.filter(v => v.plate.toLowerCase().includes(kw))
    filteredVehicleList.value = sortVehiclesBySelected(matched)
  }
}

const selectAllVehicles = () => {
  const all = filteredVehicleList.value.map(v => v.plate)
  selectedVehiclePlates.value = [...new Set([...selectedVehiclePlates.value, ...all])]
}
const clearAllVehicles = () => {
  const all = filteredVehicleList.value.map(v => v.plate)
  selectedVehiclePlates.value = selectedVehiclePlates.value.filter(p => !all.includes(p))
}

const confirmVehicleSelect = async () => {
  const plates = selectedVehiclePlates.value
  const target = vehicleTarget.value
  if (!target) return

  target.bound_vehicle = plates.join(',')
  target.vehicleDisplay = !plates.length ? '' : plates.length <= 2 ? plates.join('；') : `已选 ${plates.length} 辆车`

  if (isBindingMode.value) {
    if (isSubAccount) { ElMessage.warning('子账号无权绑定'); return }
    if (!target.id) {
      ElMessage.error('数据异常，无法更新')
      vehicleSelectDialogVisible.value = false
      return
    }
    try {
      const { error } = await supabase
        .from('drivers')
        .update({ bound_vehicle: target.bound_vehicle, updated_at: new Date().toISOString() })
        .eq('id', target.id)
      if (error) throw error
      ElMessage.success('绑定车辆更新成功')
      await fetchDrivers()
      await syncVehicleBoundDriver()
    } catch (err) {
      ElMessage.error('更新失败：' + err.message)
    }
    vehicleSelectDialogVisible.value = false
    isBindingMode.value = false
    return
  }
  vehicleSelectDialogVisible.value = false
}

const clearVehicleSelection = (target) => {
  if (!target) return
  target.bound_vehicle = ''
  target.vehicleDisplay = ''
}

const handleBindVehicle = (row) => {
  if (isSubAccount) { ElMessage.warning('子账号无权绑定'); return }
  openVehicleSelect(row, true)
}

// ============================================================
// 同步：司机绑定车辆 → 车辆档案 driver 字段
// ============================================================
const syncVehicleBoundDriver = async () => {
  try {
    // ⭐ 只查当前客户下的 drivers
    let dq = supabase.from('drivers').select('driver_name, bound_vehicle')
    if (isCustomer && myCustomerId.value) {
      dq = dq.eq('customer_id', myCustomerId.value)
    }
    const { data: drivers, error } = await dq
    if (error) throw error

    const plateToDrivers = {}
    ;(drivers || []).forEach(d => {
      if (d.bound_vehicle) {
        d.bound_vehicle.split(',').map(s => s.trim()).filter(Boolean).forEach(p => {
          if (!plateToDrivers[p]) plateToDrivers[p] = []
          plateToDrivers[p].push(d.driver_name)
        })
      }
    })

    // ⭐ 只查当前客户下的 vehicles
    let vq = supabase.from('vehicles').select('plate')
    if (isCustomer && myCustomerId.value) {
      vq = vq.eq('customer_id', myCustomerId.value)
    }
    const { data: allVehicles } = await vq

    const updates = []
    for (const plate of Object.keys(plateToDrivers)) {
      updates.push(supabase.from('vehicles').update({ driver: plateToDrivers[plate].join(',') }).eq('plate', plate))
    }
    ;(allVehicles || []).forEach(v => {
      if (!plateToDrivers[v.plate]) {
        updates.push(supabase.from('vehicles').update({ driver: '' }).eq('plate', v.plate))
      }
    })
    await Promise.all(updates)
  } catch (err) { console.error('同步失败', err) }
}

// ============================================================
// 导出
// ============================================================
const exportData = async () => {
  const li = ElLoading.service({ fullscreen: true, text: '正在导出...', background: 'rgba(0,0,0,0.6)' })
  try {
    let q = supabase.from('drivers').select('*').order('updated_at', { ascending: false })

    // ⭐⭐⭐ 客户隔离
    if (isCustomer) {
      if (!myCustomerId.value) { ElMessage.warning('未关联客户，无法导出'); return }
      q = q.eq('customer_id', myCustomerId.value)
    }

    if (searchForm.org) q = q.eq('org', searchForm.org)
    if (searchForm.driverName) q = q.ilike('driver_name', `%${searchForm.driverName}%`)
    if (searchForm.phone) q = q.ilike('phone', `%${searchForm.phone}%`)
    const { data, error } = await q
    if (error) throw error
    if (!data?.length) { ElMessage.warning('没有数据可导出'); return }

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('司机档案')
    const headers = ['司机姓名','所属组织结构','性别','年龄','驾照类型','手机号','绑定车辆','操作人','创建时间','修改时间']
    const hr = ws.addRow(headers)
    hr.eachCell(c => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8102E' } }
      c.alignment = { horizontal: 'center', vertical: 'middle' }
      c.border = { top:{style:'thin',color:{argb:'FFCCCCCC'}}, left:{style:'thin',color:{argb:'FFCCCCCC'}}, bottom:{style:'thin',color:{argb:'FFCCCCCC'}}, right:{style:'thin',color:{argb:'FFCCCCCC'}} }
    })
    data.forEach(r => {
      const dr = ws.addRow([r.driver_name||'', r.org||'', r.gender||'', r.age||'', r.license_type||'', r.phone||'', r.bound_vehicle||'', r.operator||'', formatDateTime(r.created_at), formatDateTime(r.updated_at)])
      dr.eachCell(c => { c.border = { top:{style:'thin',color:{argb:'FFCCCCCC'}}, left:{style:'thin',color:{argb:'FFCCCCCC'}}, bottom:{style:'thin',color:{argb:'FFCCCCCC'}}, right:{style:'thin',color:{argb:'FFCCCCCC'}} } })
    })
    ws.columns = headers.map(() => ({ width: 18 }))
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `司机档案_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`
    document.body.appendChild(link); link.click(); document.body.removeChild(link)
    URL.revokeObjectURL(link.href)
    ElMessage.success(`成功导出 ${data.length} 条数据`)
  } catch (err) { ElMessage.error('导出失败：' + err.message) }
  finally { li.close() }
}

// ============================================================
// 获取数据
// ============================================================
const fetchDrivers = async () => {
  // ⭐⭐⭐ 客户必须有 customerId，否则返回空（防止越权）
  if (isCustomer && !myCustomerId.value) {
    console.warn('[DriverArchive] 客户账号未关联 customers，返回空')
    tableData.value = []; total.value = 0; saveData(); return
  }
  loading.value = true
  try {
    let q = supabase.from('drivers').select('*', { count: 'exact' }).order('updated_at', { ascending: false })

    // ⭐⭐⭐ 客户隔离：主账号+子账号都按主账号的 customer_id 过滤
    if (isCustomer) {
      q = q.eq('customer_id', myCustomerId.value)
    }

    if (searchForm.org) q = q.eq('org', searchForm.org)
    if (searchForm.driverName) q = q.ilike('driver_name', `%${searchForm.driverName}%`)
    if (searchForm.phone) q = q.ilike('phone', `%${searchForm.phone}%`)
    const from = (currentPage.value - 1) * pageSize.value
    const { data, error, count } = await q.range(from, from + pageSize.value - 1)
    if (error) throw error
    tableData.value = data || []; total.value = count || 0
    saveData(); saveState()
  } catch (err) { ElMessage.error('加载数据失败：' + err.message) }
  finally { loading.value = false }
}

const refreshData = () => {
  if (currentPage.value !== 1) { currentPage.value = 1; gotoPage.value = 1 }
  fetchDrivers()
}
const handleSearch = () => refreshData()
const handleReset = () => {
  Object.assign(searchForm, { org: '', driverName: '', phone: '' })
  currentPage.value = 1; gotoPage.value = 1
  refreshData()
}
const handleSizeChange = (v) => { pageSize.value = v; currentPage.value = 1; gotoPage.value = 1; fetchDrivers() }
const handleCurrentChange = (v) => { currentPage.value = v; gotoPage.value = v; fetchDrivers() }
const handleGotoPage = (v) => {
  if (v >= 1 && v <= totalPages.value) { currentPage.value = v; fetchDrivers() }
}

// ============================================================
// 导入（仅主账号/管理员）
// ============================================================
const showImportDialog = ref(false)
const uploadRef = ref(null)
const uploadFile = ref(null)
const uploadFileName = ref('')
const importErrors = ref([])
const importing = ref(false)

const templateHeaders = ['司机姓名','所属组织结构','性别','年龄','驾照类型','手机号','绑定车辆','操作人']

const downloadTemplate = async () => {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('司机档案导入模板')
  const hr = ws.addRow(templateHeaders)
  hr.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8102E' } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
  })
  ws.addRow(['张三', '西马物流新能源车队', '男', '35', 'B2', '13800138000', '鄂A12345', '管理员'])
  ws.columns = templateHeaders.map(() => ({ width: 18 }))
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = '司机档案导入模板.xlsx'
  document.body.appendChild(link); link.click(); document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}

const handleFileChange = (f) => { uploadFile.value = f.raw; uploadFileName.value = f.name; importErrors.value = [] }
const handleFileRemove = () => { uploadFile.value = null; uploadFileName.value = ''; importErrors.value = [] }

const confirmImport = async () => {
  if (isSubAccount) { ElMessage.warning('子账号无权导入'); return }
  if (!uploadFile.value) { ElMessage.warning('请先选择文件'); return }
  if (isCustomer && !myCustomerId.value) { ElMessage.error('未关联客户，无法导入'); return }

  importing.value = true; importErrors.value = []
  try {
    const file = uploadFile.value
    const ext = file.name.split('.').pop().toLowerCase()
    let rows = []
    if (ext === 'csv') {
      const txt = await file.text()
      rows = txt.split('\n').filter(l => l.trim()).slice(1).map(l => l.split(',').map(c => c.trim()))
    } else if (['xlsx', 'xls'].includes(ext)) {
      const data = await file.arrayBuffer()
      const wb = XLSX.read(data, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }).slice(1)
    } else { ElMessage.error('不支持的文件格式'); return }

    const validData = [], errors = []
    rows.forEach((row, i) => {
      const n = i + 2
      const [driverName, org, gender, age, licenseType, phone, boundVehicle, operator] = row.map(c => (c || '').toString().trim())
      if (!driverName || !phone) { errors.push(`第 ${n} 行：缺少必填字段`); return }
      const obj = {
        driver_name: driverName,
        org: org || null,
        gender: gender || null,
        age: age ? parseInt(age) : null,
        license_type: licenseType || null,
        phone,
        bound_vehicle: boundVehicle || null,
        operator: operator || '管理员',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      // ⭐ 客户导入：写入 customer_id
      if (isCustomer && myCustomerId.value) {
        obj.customer_id = myCustomerId.value
      }
      validData.push(obj)
    })
    if (errors.length) { importErrors.value = errors.slice(0, 20); ElMessage.error(`存在 ${errors.length} 条错误`); return }
    if (!validData.length) { ElMessage.warning('没有有效数据'); return }

    // ⭐ 查重按客户隔离
    const existingPhones = new Set()
    let eq = supabase.from('drivers').select('phone').in('phone', validData.map(v => v.phone))
    if (isCustomer && myCustomerId.value) {
      eq = eq.eq('customer_id', myCustomerId.value)
    }
    const { data: ex } = await eq
    ;(ex || []).forEach(i => existingPhones.add(i.phone))

    const upd = [], ins = []
    validData.forEach(item => existingPhones.has(item.phone) ? upd.push(item) : ins.push(item))

    // ⭐ 更新时也按客户隔离（避免跨客户更新）
    for (const item of upd) {
      let uq = supabase.from('drivers').update(item).eq('phone', item.phone)
      if (isCustomer && myCustomerId.value) {
        uq = uq.eq('customer_id', myCustomerId.value)
      }
      const { error } = await uq
      if (error) throw error
    }
    if (ins.length) { const { error } = await supabase.from('drivers').insert(ins); if (error) throw error }

    ElMessage.success(`导入完成：更新 ${upd.length} 条，新增 ${ins.length} 条`)
    showImportDialog.value = false
    uploadFile.value = null; uploadFileName.value = ''; importErrors.value = []
    refreshData()
  } catch (err) { ElMessage.error('导入失败：' + err.message) }
  finally { importing.value = false }
}

// ============================================================
// 生命周期
// ============================================================
watch(() => [searchForm.org, searchForm.driverName, searchForm.phone, currentPage.value, pageSize.value], saveState, { deep: true })

onMounted(async () => {
  document.addEventListener('keydown', onEscKeydown)
  if (isCustomer) await loadMyCustomerId()
  await loadOrgOptions()
  restoreState()
  // ⭐ 每次进入页面都主动拉取最新数据（不走缓存短路）
  await fetchDrivers()
})

// ⭐ 兼容 keep-alive 场景
onActivated(async () => {
  if (isCustomer && !myCustomerId.value) await loadMyCustomerId()
  await fetchDrivers()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onEscKeydown)
})
</script>

<template>
  <div class="driver-archive-page">
    <!-- 搜索栏 -->
    <div class="search-card">
      <div class="search-row">
        <el-select v-model="searchForm.org" placeholder="所属机构" clearable style="width: 160px">
          <el-option v-for="o in orgOptions" :key="o" :label="o" :value="o" />
        </el-select>
        <el-input v-model="searchForm.driverName" placeholder="司机姓名" clearable style="width: 140px" />
        <el-input v-model="searchForm.phone" placeholder="手机号" clearable style="width: 160px" />
        <el-button type="primary" class="btn-primary" @click="handleSearch">
          <el-icon><Search /></el-icon> 搜索
        </el-button>
        <el-button class="btn-outline" @click="handleReset">
          <el-icon><Refresh /></el-icon> 重置
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
              <!-- ⭐ 子账号不显示"新增" -->
              <el-button v-if="!isSubAccount" type="primary" class="btn-primary" @click="handleAdd">
                <el-icon><User /></el-icon> 新增
              </el-button>

              <!-- ⭐ 子账号不显示"删除" -->
              <template v-if="!isSubAccount">
                <el-button class="btn-outline" @click="toggleBatchDelete">
                  <el-icon><Delete /></el-icon> {{ batchDeleteMode ? '取消' : '删除' }}
                </el-button>
                <el-button v-if="batchDeleteMode" type="danger" @click="confirmDelete" :disabled="!selectedIds.length">
                  确认删除 ({{ selectedIds.length }})
                </el-button>
              </template>

              <!-- ⭐ 子账号不显示"导入" -->
              <el-button v-if="!isSubAccount" class="btn-outline" @click="showImportDialog = true">
                <el-icon><Download /></el-icon> 导入
              </el-button>
              <!-- ⭐ 导出对子账号开放 -->
              <el-button class="btn-outline" @click="exportData">
                <el-icon><Upload /></el-icon> 导出
              </el-button>

              <button class="icon-btn" @click="fetchDrivers" title="刷新">
                <el-icon><Refresh /></el-icon>
              </button>

              <el-dropdown trigger="click" popper-class="density-dropdown-red" @command="handleDensityChange">
                <button class="icon-btn" title="密度"><el-icon><Operation /></el-icon></button>
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
                  <button class="icon-btn" :class="{ active: columnPopoverVisible }" title="列设置"><el-icon><Setting /></el-icon></button>
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
                        <button class="fix-btn" :class="{ active: col.fixed === 'left' }" @click="toggleFix(col, 'left')"><el-icon><DArrowLeft /></el-icon></button>
                        <button class="fix-btn" :class="{ active: col.fixed === 'right' }" @click="toggleFix(col, 'right')"><el-icon><DArrowRight /></el-icon></button>
                      </div>
                    </div>
                  </div>
                </div>
              </el-popover>

              <button class="icon-btn" :class="{ active: isTableFullscreen }" @click="toggleTableFullscreen">
                <el-icon><component :is="isTableFullscreen ? Close : FullScreen" /></el-icon>
              </button>
            </div>
          </div>

          <div class="table-wrap">
            <el-table
              ref="tableRef"
              :data="tableData"
              v-loading="loading"
              element-loading-text="加载中…"
              element-loading-background="rgba(255,255,255,0.88)"
              border
              stripe
              :size="tableSize"
              height="100%"
              class="custom-table"
              @selection-change="handleSelectionChange"
            >
              <el-table-column v-if="batchDeleteMode && !isSubAccount" type="selection" width="46" align="center" />

              <template v-for="col in visibleColumns" :key="col.prop">
                <el-table-column
                  v-if="col.prop === 'action'"
                  :label="col.label"
                  :width="col.width ? Math.round(col.width * densityMultiplier) : 200"
                  :align="col.align"
                  :fixed="col.fixed || false"
                >
                  <template #default="{ row }">
                    <div class="action-cell">
                      <!-- ⭐ 子账号不显示"绑定车辆" -->
                      <el-button v-if="!isSubAccount" type="text" class="action-btn action-bind" @click="handleBindVehicle(row)">
                        <el-icon><Van /></el-icon> 绑定车辆
                      </el-button>
                      <!-- ⭐ 查看：所有人可见 -->
                      <el-button type="text" class="action-btn action-view" @click="handleView(row)">
                        <el-icon><View /></el-icon> 查看
                      </el-button>
                      <!-- ⭐ 子账号不显示"编辑" -->
                      <el-button v-if="!isSubAccount" type="text" class="action-btn action-edit" @click="handleEdit(row)">
                        <el-icon><Edit /></el-icon> 编辑
                      </el-button>
                    </div>
                  </template>
                </el-table-column>

                <el-table-column
                  v-else-if="col.prop === 'updated_at'"
                  :label="col.label"
                  :min-width="Math.round(col.minWidth * densityMultiplier)"
                  :align="col.align"
                  :fixed="col.fixed || false"
                  show-overflow-tooltip
                >
                  <template #default="{ row }"><span class="time-text">{{ formatDateTime(row.updated_at) }}</span></template>
                </el-table-column>

                <el-table-column
                  v-else-if="col.prop === 'phone'"
                  :label="col.label"
                  :min-width="Math.round(col.minWidth * densityMultiplier)"
                  :align="col.align"
                  :fixed="col.fixed || false"
                  show-overflow-tooltip
                >
                  <template #default="{ row }"><span class="mono-text">{{ row.phone || '--' }}</span></template>
                </el-table-column>

                <el-table-column
                  v-else-if="col.prop === 'bound_vehicle'"
                  :label="col.label"
                  :min-width="Math.round(col.minWidth * densityMultiplier)"
                  :align="col.align"
                  :fixed="col.fixed || false"
                  show-overflow-tooltip
                >
                  <template #default="{ row }">
                    <span v-if="row.bound_vehicle" class="vehicle-text">{{ row.bound_vehicle }}</span>
                    <span v-else class="text-muted">未绑定</span>
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
                    <span :class="col.prop === 'driver_name' ? 'driver-text' : 'text-content'">{{ row[col.prop] || '--' }}</span>
                  </template>
                </el-table-column>
              </template>

              <template #empty>
                <div class="empty-state">
                  <el-icon class="empty-icon"><User /></el-icon>
                  <p>暂无司机档案</p>
                  <span class="empty-tip">{{ isSubAccount ? '暂无数据' : (isCustomer ? '点击右上角「新增」或「导入」添加司机' : '暂无数据') }}</span>
                </div>
              </template>
            </el-table>
          </div>

          <div class="pagination-wrapper">
            <span class="total-text">共 {{ total }} 条</span>
            <el-pagination
              background
              layout="sizes, prev, pager, next, jumper"
              :total="total"
              :page-size="pageSize"
              :page-sizes="[20, 50, 100]"
              v-model:current-page="currentPage"
              @size-change="handleSizeChange"
              @current-change="handleCurrentChange"
              class="custom-pagination"
            />
          </div>
        </div>

        <transition name="fs-fade">
          <button v-if="isTableFullscreen" class="fs-exit-btn" @click="toggleTableFullscreen">
            <el-icon><Close /></el-icon> 退出全屏
          </button>
        </transition>
      </div>
    </Teleport>

    <!-- 导入 -->
    <el-dialog v-model="showImportDialog" title="导入司机档案" width="560px" destroy-on-close :close-on-click-modal="false" class="va-dialog">
      <div class="import-step">
        <div class="step-header"><span class="step-num">1</span><span class="step-title">下载模板</span></div>
        <div class="step-body">
          <el-button type="primary" class="btn-primary" size="small" @click="downloadTemplate">
            <el-icon><Download /></el-icon> 下载模板
          </el-button>
          <span class="step-tip">支持 .csv / .xlsx</span>
        </div>
      </div>

      <div class="import-step">
        <div class="step-header"><span class="step-num">2</span><span class="step-title">上传文件</span></div>
        <div class="step-body step-col">
          <el-upload ref="uploadRef" action="#" :auto-upload="false" :on-change="handleFileChange" :on-remove="handleFileRemove" :limit="1" accept=".csv,.xlsx,.xls" drag class="import-upload">
            <div class="upload-inner">
              <el-icon class="upload-icon"><Upload /></el-icon>
              <div class="upload-text">点击或拖拽上传</div>
            </div>
          </el-upload>
          <div v-if="uploadFileName" class="upload-filename">已选：{{ uploadFileName }}</div>
        </div>
      </div>

      <div v-if="importErrors.length" class="import-errors">
        <div class="error-title">错误：</div>
        <div class="error-list"><div v-for="(e, i) in importErrors" :key="i">{{ e }}</div></div>
      </div>

      <template #footer>
        <button class="action-btn-footer ghost" @click="showImportDialog = false">取消</button>
        <button class="action-btn-footer primary" :disabled="importing" @click="confirmImport">
          {{ importing ? '导入中...' : '确认导入' }}
        </button>
      </template>
    </el-dialog>

    <!-- 详情 -->
    <el-dialog v-model="detailDialogVisible" width="720px" top="8vh" destroy-on-close :close-on-click-modal="false" class="va-dialog">
      <template #header>
        <div class="detail-header">
          <span class="detail-title">司机详情</span>
          <span v-if="currentDetailRow" class="detail-plate">{{ currentDetailRow.driver_name }}</span>
        </div>
      </template>
      <div v-if="currentDetailRow" class="detail-grid">
        <div class="detail-item"><span class="label">司机姓名</span><span class="value strong">{{ currentDetailRow.driver_name || '--' }}</span></div>
        <div class="detail-item"><span class="label">所属组织结构</span><span class="value">{{ currentDetailRow.org || '--' }}</span></div>
        <div class="detail-item"><span class="label">性别</span><span class="value">{{ currentDetailRow.gender || '--' }}</span></div>
        <div class="detail-item"><span class="label">年龄</span><span class="value">{{ currentDetailRow.age || '--' }}</span></div>
        <div class="detail-item"><span class="label">驾照类型</span><span class="value">{{ currentDetailRow.license_type || '--' }}</span></div>
        <div class="detail-item"><span class="label">手机号</span><span class="value mono">{{ currentDetailRow.phone || '--' }}</span></div>
        <div class="detail-item"><span class="label">绑定车辆</span><span class="value">{{ currentDetailRow.bound_vehicle || '--' }}</span></div>
        <div class="detail-item"><span class="label">操作人</span><span class="value">{{ currentDetailRow.operator || '--' }}</span></div>
        <div class="detail-item"><span class="label">创建时间</span><span class="value time-text">{{ formatDateTime(currentDetailRow.created_at) }}</span></div>
        <div class="detail-item"><span class="label">修改时间</span><span class="value time-text">{{ formatDateTime(currentDetailRow.updated_at) }}</span></div>
      </div>
      <template #footer>
        <button class="action-btn-footer ghost" @click="detailDialogVisible = false">关闭</button>
        <!-- ⭐ 子账号不显示"编辑"按钮 -->
        <button v-if="!isSubAccount" class="action-btn-footer primary" @click="openEditFromView">编辑</button>
      </template>
    </el-dialog>

    <!-- 编辑（仅主账号可用） -->
    <el-dialog v-model="editDialogVisible" width="720px" top="6vh" destroy-on-close :close-on-click-modal="false" class="va-dialog">
      <template #header>
        <div class="detail-header">
          <span class="detail-title">编辑司机信息</span>
          <span v-if="editFormData" class="detail-plate">{{ editFormData.driver_name }}</span>
        </div>
      </template>
      <div v-if="editFormData" class="edit-content">
        <el-form :model="editFormData" label-width="100px" class="edit-form">
          <div class="form-section">
            <div class="section-title">基本信息</div>
            <el-row :gutter="16">
              <el-col :span="12"><el-form-item label="司机姓名"><el-input v-model="editFormData.driver_name" /></el-form-item></el-col>
              <el-col :span="12">
                <el-form-item label="所属组织结构">
                  <el-select v-model="editFormData.org" placeholder="请选择" clearable style="width: 100%">
                    <el-option v-for="o in orgOptions" :key="o" :label="o" :value="o" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="12"><el-form-item label="性别"><el-input v-model="editFormData.gender" /></el-form-item></el-col>
              <el-col :span="12">
                <el-form-item label="年龄">
                  <el-input-number v-model="editFormData.age" :min="0" controls-position="right" style="width: 100%" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="12"><el-form-item label="驾照类型"><el-input v-model="editFormData.license_type" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="手机号"><el-input v-model="editFormData.phone" /></el-form-item></el-col>
            </el-row>
          </div>
          <div class="form-section">
            <div class="section-title">绑定信息</div>
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="绑定车辆">
                  <el-input v-model="editFormData.vehicleDisplay" placeholder="点击选择车辆" readonly @click="openVehicleSelect(editFormData, false)">
                    <template #suffix>
                      <el-icon v-if="editFormData.vehicleDisplay" class="clear-icon" @click.stop="clearVehicleSelection(editFormData)"><Delete /></el-icon>
                    </template>
                  </el-input>
                </el-form-item>
              </el-col>
              <el-col :span="12"><el-form-item label="操作人"><el-input v-model="editFormData.operator" /></el-form-item></el-col>
            </el-row>
          </div>
          <div class="form-section">
            <div class="section-title">时间信息</div>
            <el-row :gutter="16">
              <el-col :span="12"><el-form-item label="创建时间"><span class="time-text">{{ formatDateTime(editFormData.created_at) }}</span></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="修改时间"><span class="time-text">{{ formatDateTime(editFormData.updated_at) }}</span></el-form-item></el-col>
            </el-row>
          </div>
        </el-form>
      </div>
      <template #footer>
        <button class="action-btn-footer ghost" @click="editDialogVisible = false">取消</button>
        <button class="action-btn-footer primary" :disabled="editSaving" @click="saveEdit">{{ editSaving ? '保存中...' : '保存' }}</button>
      </template>
    </el-dialog>

    <!-- 新增（仅主账号可用） -->
    <el-dialog v-model="addDialogVisible" width="720px" top="6vh" destroy-on-close :close-on-click-modal="false" class="va-dialog">
      <template #header>
        <div class="detail-header">
          <span class="detail-title">新增司机</span>
        </div>
      </template>
      <div class="edit-content">
        <el-form :model="addFormData" label-width="100px" class="edit-form">
          <div class="form-section">
            <div class="section-title">基本信息</div>
            <el-row :gutter="16">
              <el-col :span="12"><el-form-item label="司机姓名" required><el-input v-model="addFormData.driver_name" /></el-form-item></el-col>
              <el-col :span="12">
                <el-form-item label="所属组织结构">
                  <el-select v-model="addFormData.org" placeholder="请选择" clearable style="width: 100%">
                    <el-option v-for="o in orgOptions" :key="o" :label="o" :value="o" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="12"><el-form-item label="性别"><el-input v-model="addFormData.gender" /></el-form-item></el-col>
              <el-col :span="12">
                <el-form-item label="年龄">
                  <el-input-number v-model="addFormData.age" :min="0" controls-position="right" style="width: 100%" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="12"><el-form-item label="驾照类型"><el-input v-model="addFormData.license_type" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="手机号" required><el-input v-model="addFormData.phone" /></el-form-item></el-col>
            </el-row>
          </div>
          <div class="form-section">
            <div class="section-title">绑定信息</div>
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="绑定车辆">
                  <el-input v-model="addFormData.vehicleDisplay" placeholder="点击选择车辆" readonly @click="openVehicleSelect(addFormData, false)">
                    <template #suffix>
                      <el-icon v-if="addFormData.vehicleDisplay" class="clear-icon" @click.stop="clearVehicleSelection(addFormData)"><Delete /></el-icon>
                    </template>
                  </el-input>
                </el-form-item>
              </el-col>
              <el-col :span="12"><el-form-item label="操作人"><el-input v-model="addFormData.operator" /></el-form-item></el-col>
            </el-row>
          </div>
        </el-form>
      </div>
      <template #footer>
        <button class="action-btn-footer ghost" @click="addDialogVisible = false">取消</button>
        <button class="action-btn-footer primary" :disabled="addSaving" @click="saveAdd">{{ addSaving ? '保存中...' : '保存' }}</button>
      </template>
    </el-dialog>

    <!-- 车辆选择 -->
    <el-dialog v-model="vehicleSelectDialogVisible" width="520px" destroy-on-close :close-on-click-modal="false" append-to-body class="va-dialog">
      <template #header>
        <div class="detail-header">
          <span class="detail-title">选择绑定车辆</span>
        </div>
      </template>
      <div class="driver-toolbar">
        <el-input v-model="vehicleSearchKeyword" placeholder="输入车牌号模糊搜索" clearable class="driver-search" @input="filterVehicleList">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <button class="action-btn-footer ghost small" @click="selectAllVehicles">全选</button>
        <button class="action-btn-footer ghost small" @click="clearAllVehicles">取消全选</button>
      </div>
      <div class="driver-list-wrap">
        <el-checkbox-group v-model="selectedVehiclePlates" class="driver-checkbox-group">
          <div v-for="v in filteredVehicleList" :key="v.plate" class="driver-item">
            <el-checkbox :label="v.plate">{{ v.plate }}</el-checkbox>
          </div>
        </el-checkbox-group>
        <div v-if="!filteredVehicleList.length" class="driver-empty">暂无车辆</div>
      </div>
      <template #footer>
        <button class="action-btn-footer ghost" @click="vehicleSelectDialogVisible = false">取消</button>
        <button class="action-btn-footer primary" @click="confirmVehicleSelect">确定</button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ============================================================
   页面布局：固定高度，不上下拖动
   ============================================================ */
.driver-archive-page {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100vh;
  max-height: 100vh;
  box-sizing: border-box;
  overflow: hidden;
  background: #F8FAFC;
  font-size: 13px;
}

.search-card {
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
  padding: 12px 16px;
  flex-shrink: 0;
}
.search-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
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
  background: #FEF2F2 !important;
  box-shadow: 0 0 0 1px #FCA5A5 inset !important;
}
.search-row :deep(.el-input__wrapper.is-focus),
.search-row :deep(.el-select__wrapper.is-focused) {
  background: #fff !important;
  box-shadow: 0 0 0 2px rgba(200,16,46,0.15), 0 0 0 1px #c8102e inset !important;
}

.btn-primary {
  background: linear-gradient(135deg, #c8102e, #a00d24) !important;
  border: none !important;
  color: #fff !important;
  font-weight: 600;
  border-radius: 6px !important;
  box-shadow: 0 3px 10px rgba(200,16,46,0.25);
  transition: all 0.25s;
}
.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 5px 14px rgba(200,16,46,0.4); }
.btn-outline {
  border-radius: 6px !important;
  border-color: #CBD5E1 !important;
  color: #334155;
  background: #fff !important;
  transition: all 0.25s;
}
.btn-outline:hover {
  border-color: #c8102e !important;
  color: #c8102e !important;
  background: #FEF2F2 !important;
  transform: translateY(-1px);
}

.table-card-wrap { display: flex; flex-direction: column; flex: 1; min-height: 0; }

.table-card-wrap.is-fullscreen {
  position: fixed; inset: 0; z-index: 9999; padding: 24px;
  background: rgba(248,250,252,0.85);
  backdrop-filter: blur(20px) saturate(180%);
  animation: fs-fade-in 0.3s;
}
@keyframes fs-fade-in { from { opacity: 0; } to { opacity: 1; } }
.table-card-wrap.is-fullscreen .table-card { border-radius: 14px; box-shadow: 0 20px 60px rgba(200,16,46,0.18); }

.table-card {
  flex: 1; min-height: 0;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
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
.total-hint { font-size: 13px; color: #64748B; }
.total-hint b { color: #c8102e; font-family: 'Courier New', monospace; font-size: 14px; }
.toolbar-right { display: flex; align-items: center; gap: 8px; margin-left: auto; flex-wrap: wrap; }

.icon-btn {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid #E2E8F0; background: #fff;
  border-radius: 6px; color: #64748B; font-size: 15px;
  cursor: pointer;
  transition: all 0.25s;
}
.icon-btn:hover {
  border-color: #c8102e; color: #c8102e; background: #FEF2F2;
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(200,16,46,0.15);
}
.icon-btn.active {
  border-color: #c8102e; color: #fff;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  box-shadow: 0 3px 10px rgba(200,16,46,0.35);
}

.table-wrap { flex: 1; min-height: 0; overflow: hidden; border-radius: 8px; }

/* ============================================================
   表格
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
:deep(.custom-table.el-table--large td.el-table__cell) { padding: 13px 0; }
:deep(.custom-table.el-table--default td.el-table__cell) { padding: 9px 0; }
:deep(.custom-table.el-table--small td.el-table__cell) { padding: 5px 0; }
:deep(.custom-table .el-table__row:hover td) { background: #FEF2F2 !important; }

.driver-text {
  font-size: 12.5px;
  font-weight: 600;
  color: #0F172A;
  letter-spacing: 0.2px;
  white-space: nowrap;
}
.text-content { color: #334155; font-size: 12.5px; }
.text-muted { color: #94A3B8; font-size: 12.5px; }
.mono-text {
  font-family: 'Courier New', Courier, monospace;
  color: #475569;
  font-size: 12px;
  font-weight: 500;
}
.vehicle-text {
  color: #334155;
  font-size: 12.5px;
  font-family: 'Courier New', Courier, monospace;
}
.time-text {
  color: #475569;
  font-family: 'Courier New', Courier, monospace;
  font-size: 12px;
  font-weight: 500;
}

.action-cell { display: flex; align-items: center; justify-content: center; gap: 6px; }
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
.action-btn .el-icon { font-size: 12.5px; }
.action-bind { color: #c8102e; }
.action-bind:hover { color: #7F1D1D; background: #FEF2F2; }
.action-view { color: #0EA5E9; }
.action-view:hover { color: #0369A1; background: #F0F9FF; }
.action-edit { color: #c8102e; }
.action-edit:hover { color: #7F1D1D; background: #FEF2F2; }

.empty-state {
  padding: 50px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.empty-icon { font-size: 44px; color: #CBD5E1; }
.empty-state p { font-size: 14px; margin: 0; color: #64748B; font-weight: 600; }
.empty-tip { font-size: 12px; color: #CBD5E1; }

.pagination-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px solid #E2E8F0;
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
  box-shadow: 0 2px 6px rgba(200,16,46,0.35);
}

.fs-exit-btn {
  position: fixed; top: 36px; right: 40px; z-index: 10001;
  display: flex; align-items: center; gap: 4px;
  padding: 8px 16px;
  border: none;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #fff; font-size: 13px; font-weight: 600;
  border-radius: 8px; cursor: pointer;
  box-shadow: 0 6px 20px rgba(200,16,46,0.4);
  transition: all 0.25s;
  font-family: inherit;
}
.fs-exit-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(200,16,46,0.55); }
.fs-fade-enter-active, .fs-fade-leave-active { transition: all 0.3s; }
.fs-fade-enter-from, .fs-fade-leave-to { opacity: 0; transform: translateY(-10px); }

:deep(.va-dialog .el-dialog) {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(15,23,42,0.18);
  animation: dialog-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes dialog-in {
  from { opacity: 0; transform: scale(0.92) translateY(20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
:deep(.va-dialog .el-dialog__header) {
  padding: 16px 22px;
  margin: 0;
  border-bottom: 1px solid #F1F5F9;
}
:deep(.va-dialog .el-dialog__title) { font-weight: 700; color: #0F172A; font-size: 15px; }
:deep(.va-dialog .el-dialog__body) { padding: 20px 22px; }
:deep(.va-dialog .el-dialog__footer) { padding: 14px 22px; background: #FAFBFC; border-top: 1px solid #F1F5F9; }

.import-step { padding: 10px 0; border-bottom: 1px dashed #E2E8F0; }
.import-step:last-of-type { border-bottom: none; }
.step-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.step-num {
  width: 22px; height: 22px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #fff; font-size: 12px; font-weight: 800;
  box-shadow: 0 3px 8px rgba(200,16,46,0.3);
}
.step-title { font-size: 13px; font-weight: 700; color: #0F172A; }
.step-body { padding-left: 32px; display: flex; align-items: center; gap: 12px; }
.step-body.step-col { flex-direction: column; align-items: stretch; gap: 8px; }
.step-tip { font-size: 12px; color: #94A3B8; }
.import-upload :deep(.el-upload) { width: 100%; }
.import-upload :deep(.el-upload-dragger) {
  border-radius: 8px;
  border: 1.5px dashed #CBD5E1;
  background: #F8FAFC;
  padding: 18px 0;
  transition: all 0.25s;
}
.import-upload :deep(.el-upload-dragger:hover) { border-color: #c8102e; background: #FEF2F2; }
.upload-inner { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.upload-icon { font-size: 32px; color: #94A3B8; transition: color 0.25s; }
.import-upload :deep(.el-upload-dragger:hover) .upload-icon { color: #c8102e; }
.upload-text { font-size: 13px; color: #475569; }
.upload-filename { font-size: 12px; color: #475569; font-family: 'Courier New', monospace; }
.import-errors {
  margin-top: 12px;
  padding: 10px 14px;
  background: #FEF2F2;
  border: 1px solid #FCA5A5;
  border-radius: 8px;
  max-height: 140px;
  overflow-y: auto;
}
.error-title { font-size: 12px; font-weight: 700; color: #991B1B; margin-bottom: 6px; }
.error-list { font-size: 12px; color: #B91C1C; line-height: 1.6; font-family: 'Courier New', monospace; }

.detail-header { display: flex; align-items: center; gap: 12px; }
.detail-title { font-size: 16px; font-weight: 700; color: #0F172A; letter-spacing: 0.3px; }
.detail-plate {
  display: inline-flex; align-items: center;
  padding: 3px 12px;
  border-radius: 999px;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #fff; font-size: 12.5px; font-weight: 700;
  letter-spacing: 0.5px;
  box-shadow: 0 3px 10px rgba(200,16,46,0.35);
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
.detail-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #fff; transition: background 0.2s; }
.detail-item:hover { background: #FAFBFC; }
.detail-item .label { flex-shrink: 0; width: 90px; font-size: 13px; color: #64748B; font-weight: 600; }
.detail-item .value { flex: 1; font-size: 13.5px; color: #0F172A; font-weight: 500; word-break: break-all; }
.detail-item .value.strong { font-weight: 600; font-size: 14px; letter-spacing: 0.3px; }
.detail-item .value.mono { font-family: 'Courier New', Courier, monospace; font-size: 13px; }

.form-section { margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px dashed #F1F5F9; }
.form-section:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
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
  left: 0; top: 50%;
  transform: translateY(-50%);
  width: 3px; height: 12px;
  border-radius: 2px;
  background: #c8102e;
}
.edit-form :deep(.el-form-item) { margin-bottom: 14px; }
.edit-form :deep(.el-form-item__label) { font-weight: 600; color: #334155; font-size: 13px; }
.edit-form :deep(.el-input__wrapper),
.edit-form :deep(.el-select__wrapper),
.edit-form :deep(.el-input-number) {
  border-radius: 8px !important;
  background: #F8FAFC !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  transition: all 0.25s;
}
.edit-form :deep(.el-input__wrapper:hover),
.edit-form :deep(.el-select__wrapper:hover) {
  background: #fff !important;
  box-shadow: 0 0 0 1px rgba(200,16,46,0.4) inset !important;
}
.edit-form :deep(.el-input__wrapper.is-focus),
.edit-form :deep(.el-select__wrapper.is-focused) {
  background: #fff !important;
  box-shadow: 0 0 0 1px #c8102e inset, 0 0 0 3px rgba(200,16,46,0.1) !important;
}
.clear-icon { cursor: pointer; color: #94A3B8; transition: color 0.2s; }
.clear-icon:hover { color: #c8102e; }

.driver-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.driver-search { flex: 1; }
.driver-list-wrap {
  max-height: 300px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid #F1F5F9;
  border-radius: 8px;
  background: #FAFBFC;
}
.driver-checkbox-group { display: flex; flex-direction: column; }
.driver-item { padding: 6px 10px; border-radius: 6px; transition: background 0.2s; }
.driver-item:hover { background: #FEF2F2; }
.driver-checkbox-group :deep(.el-checkbox__label) { font-size: 13px; color: #334155; font-weight: 500; }
.driver-checkbox-group :deep(.el-checkbox__input.is-checked + .el-checkbox__label) { color: #c8102e; font-weight: 700; }
.driver-checkbox-group :deep(.el-checkbox__inner) { border-color: #CBD5E1; border-radius: 3px; }
.driver-checkbox-group :deep(.el-checkbox__input.is-checked .el-checkbox__inner) { background-color: #c8102e; border-color: #c8102e; }
.driver-empty { text-align: center; color: #94A3B8; padding: 30px 0; font-size: 13px; }

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
.action-btn-footer.small { padding: 6px 14px; font-size: 12.5px; }
.action-btn-footer.ghost { background: #F1F5F9; color: #475569; border: 1px solid #E2E8F0; }
.action-btn-footer.ghost:hover { background: #E2E8F0; color: #1E293B; transform: translateY(-2px); }
.action-btn-footer.primary {
  color: #FFFFFF;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  box-shadow: 0 6px 20px rgba(200,16,46,0.4);
}
.action-btn-footer.primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 30px rgba(200,16,46,0.55); }
.action-btn-footer.primary:disabled { opacity: 0.6; cursor: not-allowed; }

:deep(.el-loading-mask) {
  background: rgba(255,255,255,0.88) !important;
  backdrop-filter: blur(3px);
  transition: opacity 0.3s;
}
:deep(.el-loading-spinner) { display: flex; flex-direction: column; align-items: center; gap: 14px; top: 50%; }
:deep(.el-loading-spinner .circular) { width: 44px; height: 44px; animation: loading-rotate 1.6s linear infinite; }
:deep(.el-loading-spinner .path) {
  stroke: #c8102e;
  stroke-width: 3;
  stroke-linecap: round;
  animation: loading-dash 1.5s ease-in-out infinite;
  filter: drop-shadow(0 2px 6px rgba(200,16,46,0.35));
}
@keyframes loading-rotate { 100% { transform: rotate(360deg); } }
@keyframes loading-dash {
  0%   { stroke-dasharray: 1, 200; stroke-dashoffset: 0; }
  50%  { stroke-dasharray: 90, 200; stroke-dashoffset: -35px; }
  100% { stroke-dasharray: 90, 200; stroke-dashoffset: -124px; }
}
:deep(.el-loading-text) {
  color: #64748B;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 1.5px;
  margin: 0;
  animation: loading-text-pulse 1.8s ease-in-out infinite;
}
@keyframes loading-text-pulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }

@media (max-width: 900px) { .detail-grid { grid-template-columns: 1fr; } }
</style>

<style>
/* ============================================================
   全局兜底
   ============================================================ */
html, body {
  height: 100%;
  overflow: hidden;
}

.density-dropdown-red.el-dropdown__popper.el-popper,
.column-setting-popper.el-popover.el-popper {
  border: 2px solid #FFFFFF !important;
  box-shadow: 0 10px 32px rgba(200,16,46,0.18), 0 0 0 1px rgba(200,16,46,0.12) !important;
  border-radius: 10px !important;
  overflow: hidden;
  background: #FFFFFF !important;
}
.column-setting-popper.el-popover.el-popper { padding: 0 !important; }
.density-dropdown-red .el-dropdown-menu { padding: 4px !important; background: #FFFFFF !important; }
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
.density-dropdown-red .density-item { display: inline-block; padding: 2px 6px; border-radius: 4px; }
.density-dropdown-red .density-item.active { color: #c8102e; font-weight: 700; }
.density-dropdown-red .el-dropdown-menu__item:hover .density-item.active { color: #fff; }

.column-setting-popper .el-popover__title { display: none; }
.column-setting { padding: 0; background: #FFFFFF; }
.column-setting-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #FEE2E2;
}
.col-title { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 700; color: #c8102e; }
.col-title .el-icon { color: #c8102e; font-size: 14px; }
.col-reset {
  font-size: 12.5px; color: #c8102e; cursor: pointer;
  font-weight: 700; padding: 2px 6px; border-radius: 4px;
  transition: all 0.25s;
}
.col-reset:hover { background: #FEE2E2; text-decoration: underline; }
.column-setting-body { max-height: 400px; overflow-y: auto; padding: 6px; }
.column-setting-body::-webkit-scrollbar { width: 4px; }
.column-setting-body::-webkit-scrollbar-thumb { background: #FCA5A5; border-radius: 2px; }
.column-item {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 8px; border-radius: 6px;
  cursor: grab;
  transition: all 0.25s;
  user-select: none;
}
.column-item:hover { background: #FEF2F2; }
.column-item.dragging { opacity: 0.4; }
.column-item.dragOver { background: #FEE2E2; transform: scale(1.02); }
.drag-handle { display: flex; align-items: center; color: #FCA5A5; cursor: grab; font-size: 14px; transition: color 0.2s; }
.column-item:hover .drag-handle { color: #c8102e; }
.col-checkbox { flex: 1; font-size: 13px; }
.col-checkbox :deep(.el-checkbox__label) { font-size: 13px; color: #c8102e; font-weight: 600; }
.col-checkbox :deep(.el-checkbox__inner) { border-color: #FCA5A5; border-radius: 3px; }
.col-checkbox :deep(.el-checkbox__input.is-checked .el-checkbox__inner) { background-color: #c8102e; border-color: #c8102e; }
.col-checkbox :deep(.el-checkbox__input.is-checked + .el-checkbox__label) { color: #c8102e; font-weight: 700; }
.fix-actions { display: flex; gap: 2px; }
.fix-btn {
  width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent;
  border-radius: 4px; color: #FCA5A5; font-size: 13px;
  cursor: pointer;
  transition: all 0.25s;
}
.fix-btn:hover { color: #c8102e; background: #FEE2E2; transform: scale(1.1); }
.fix-btn.active { color: #fff; background: linear-gradient(135deg, #c8102e, #a00d24); }

.el-message-box__btns .el-button--primary {
  background: linear-gradient(135deg, #c8102e, #a00d24) !important;
  border-color: #c8102e !important;
}
</style>