<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, onActivated, watch } from 'vue'
import { ElMessage, ElMessageBox, ElLoading } from 'element-plus'
import {
  Upload, Search, Refresh, Delete, Download,
  Van, View, Edit, Operation, Setting, FullScreen, Close,
  Grid, Rank, DArrowLeft, DArrowRight,
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
const isCustomer = !isAdmin                    // ⭐ 非管理员一律按客户处理
const isSubAccount = !!currentUser.isSubAccount
const myAccount = currentUser.masterAccount || currentUser.account || ''
const myPhone = currentUser.masterPhone || currentUser.phone || ''

// ⭐ 客户 ID（优先用 LoginView 已查好的）
const myCustomerId = ref(currentUser.customerId || null)
// ⭐ 子账号所属组织名
const myOrgName = ref(null)

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

const loadMyOrgName = async () => {
  if (!isCustomer || !isSubAccount) return
  if (!currentUser.orgId) return
  try {
    const { data } = await supabase
      .from('organizations').select('name').eq('id', currentUser.orgId).maybeSingle()
    if (data) myOrgName.value = data.name
  } catch (e) {
    console.warn('[VehicleArchive] 查询所属组织失败:', e)
  }
}

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
const restoreData = () => {
  try {
    const d = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null')
    if (d) { tableData.value = d.tableData || []; total.value = d.total || 0; return true }
  } catch (e) { }
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
  } catch (e) { }
}

// ============================================================
// 密度（持久化）/ 列设置 / 全屏
// ============================================================
const tableSize = ref(localStorage.getItem(DENSITY_KEY) || 'default')

const densityMultiplier = computed(() => tableSize.value === 'large' ? 1.15 : tableSize.value === 'small' ? 0.85 : 1)

const handleDensityChange = (cmd) => {
  tableSize.value = cmd
  localStorage.setItem(DENSITY_KEY, cmd)
}

const columnPopoverVisible = ref(false)
const DEFAULT_COLUMNS = [
  { prop: 'plate', label: '车牌号', visible: true, fixed: 'left', minWidth: 130, align: 'left' },
  { prop: 'vin', label: 'VIN码', visible: true, fixed: false, minWidth: 180, align: 'left' },
  { prop: 'nickname', label: '车辆昵称', visible: true, fixed: false, minWidth: 100, align: 'center' },
  { prop: 'org', label: '所属机构组织', visible: true, fixed: false, minWidth: 140, align: 'center' },
  { prop: 'driver', label: '绑定司机', visible: true, fixed: false, minWidth: 120, align: 'center' },
  { prop: 'fuel_type', label: '燃料类型', visible: true, fixed: false, minWidth: 90, align: 'center' },
  { prop: 'vehicle_type', label: '车辆类型', visible: true, fixed: false, minWidth: 90, align: 'center' },
  { prop: 'usage', label: '车辆用途', visible: true, fixed: false, minWidth: 90, align: 'center' },
  { prop: 'sub_vehicle', label: '子母车', visible: true, fixed: false, minWidth: 80, align: 'center' },
  { prop: 'trailer', label: '关联挂车', visible: true, fixed: false, minWidth: 90, align: 'center' },
  { prop: 'purchase_date', label: '车辆购买日', visible: true, fixed: false, minWidth: 110, align: 'center' },
  { prop: 'insurance_date', label: '保险购买日', visible: true, fixed: false, minWidth: 110, align: 'center' },
  { prop: 'created_at', label: '创建时间', visible: true, fixed: false, minWidth: 150, align: 'center' },
  { prop: 'updated_at', label: '修改时间', visible: true, fixed: false, minWidth: 150, align: 'center' },
  { prop: 'action', label: '操作', visible: true, fixed: 'right', width: 120, align: 'center' },
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
const handleView = (row) => { currentDetailRow.value = row; detailDialogVisible.value = true }

const editDialogVisible = ref(false)
const editFormData = ref(null)
const editSaving = ref(false)

const handleEdit = (row) => {
  const data = JSON.parse(JSON.stringify(row))
  const names = data.driver ? data.driver.split(',').map(s => s.trim()).filter(Boolean) : []
  data.driverDisplay = !names.length ? '' : names.length <= 2 ? names.join('；') : `已选 ${names.length} 名司机`
  editFormData.value = data
  editDialogVisible.value = true
}
const openEditFromView = () => {
  if (currentDetailRow.value) { handleEdit(currentDetailRow.value); detailDialogVisible.value = false }
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
      if (isSubAccount && myOrgName.value) vq = vq.eq('org', myOrgName.value)
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
  editSaving.value = true
  try {
    const { id, created_at, updated_at, driverDisplay, ...fields } = editFormData.value
    const { error } = await supabase.from('vehicles').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
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
    let q = supabase.from('vehicles').select('*').order('updated_at', { ascending: false })

    // ⭐⭐⭐ 客户隔离：按 customer_id 过滤
    if (isCustomer) {
      if (!myCustomerId.value) { ElMessage.warning('未关联客户，无法导出'); return }
      q = q.eq('customer_id', myCustomerId.value)
      // ⭐ 子账号：按所属组织过滤
      if (isSubAccount) {
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

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('车辆档案')
    const headers = ['车牌号', 'VIN码', '车辆昵称', '所属机构组织', '绑定司机', '燃料类型', '车辆类型', '车辆用途', '子母车', '关联挂车', '车辆购买日', '保险购买日', '创建时间', '修改时间']
    const hr = ws.addRow(headers)
    hr.eachCell(c => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8102E' } }
      c.alignment = { horizontal: 'center', vertical: 'middle' }
      c.border = { top: { style: 'thin', color: { argb: 'FFCCCCCC' } }, left: { style: 'thin', color: { argb: 'FFCCCCCC' } }, bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } }, right: { style: 'thin', color: { argb: 'FFCCCCCC' } } }
    })
    data.forEach(r => {
      const dr = ws.addRow([r.plate || '', r.vin || '', r.nickname || '', r.org || '', r.driver || '', r.fuel_type || '', r.vehicle_type || '', r.usage || '', r.sub_vehicle || '', r.trailer || '', r.purchase_date || '', r.insurance_date || '', formatDateTime(r.created_at), formatDateTime(r.updated_at)])
      dr.eachCell(c => { c.border = { top: { style: 'thin', color: { argb: 'FFCCCCCC' } }, left: { style: 'thin', color: { argb: 'FFCCCCCC' } }, bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } }, right: { style: 'thin', color: { argb: 'FFCCCCCC' } } } })
    })
    ws.columns = headers.map(() => ({ width: 18 }))
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `车辆档案_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`
    document.body.appendChild(link); link.click(); document.body.removeChild(link)
    URL.revokeObjectURL(link.href)
    ElMessage.success(`成功导出 ${data.length} 条数据`)
  } catch (err) { ElMessage.error('导出失败：' + err.message) }
  finally { li.close() }
}

// ============================================================
// 获取数据
// ============================================================
const fetchVehicles = async () => {
  // ⭐⭐⭐ 客户视角必须有 customerId，否则返回空（防止越权）
  if (isCustomer && !myCustomerId.value) {
    console.warn('[VehicleArchive] 客户账号未关联 customers，返回空')
    tableData.value = []; total.value = 0; saveData(); return
  }
  // ⭐ 子账号必须有组织名，否则返回空
  if (isCustomer && isSubAccount && !myOrgName.value) {
    console.warn('[VehicleArchive] 子账号组织未查到，返回空')
    tableData.value = []; total.value = 0; saveData(); return
  }

  loading.value = true
  try {
    let q = supabase.from('vehicles').select('*', { count: 'exact' }).order('updated_at', { ascending: false })

    // ⭐⭐⭐ 客户隔离
    if (isCustomer) {
      q = q.eq('customer_id', myCustomerId.value)
      // ⭐ 子账号：只看所属组织下的车辆
      if (isSubAccount) {
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
// 导入
// ============================================================
const showImportDialog = ref(false)
const uploadRef = ref(null)
const uploadFile = ref(null)
const uploadFileName = ref('')
const importErrors = ref([])
const importing = ref(false)

const templateHeaders = ['车牌号', 'VIN码', '车辆昵称', '燃料类型', '车辆类型', '车辆用途', '子母车', '关联挂车', '车辆购买日', '保险购买日']

const downloadTemplate = async () => {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('车辆档案导入模板')
  const hr = ws.addRow(templateHeaders)
  hr.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8102E' } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
  })
  ws.addRow(['粤A12345', 'LGAX3AG59N9009177', '我的车', '纯电动', '', '快递快运', '否', '无', '2026-01-01', '2026-01-01'])
  ws.columns = templateHeaders.map(() => ({ width: 18 }))
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = '车辆档案导入模板.xlsx'
  document.body.appendChild(link); link.click(); document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}

const handleFileChange = (f) => { uploadFile.value = f.raw; uploadFileName.value = f.name; importErrors.value = [] }
const handleFileRemove = () => { uploadFile.value = null; uploadFileName.value = ''; importErrors.value = [] }

const confirmImport = async () => {
  if (!uploadFile.value) { ElMessage.warning('请先选择文件'); return }

  // ⭐⭐⭐ 客户/子账号导入前必须有 customerId
  if (isCustomer && !myCustomerId.value) {
    ElMessage.error('未关联客户，无法导入')
    return
  }
  if (isCustomer && isSubAccount && !myOrgName.value) {
    ElMessage.error('未关联组织，无法导入')
    return
  }

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
      const [plate, vin, nickname, fuelType, vehicleType, usage, subVehicle, trailer, purchaseDate, insuranceDate] = row.map(c => (c || '').toString().trim())
      if (!plate || !vin) { errors.push(`第 ${n} 行：缺少必填字段`); return }
      const dr = /^\d{4}-\d{2}-\d{2}$/
      if (purchaseDate && !dr.test(purchaseDate)) { errors.push(`第 ${n} 行：车辆购买日格式错误`); return }
      if (insuranceDate && !dr.test(insuranceDate)) { errors.push(`第 ${n} 行：保险购买日格式错误`); return }
      const obj = {
        plate, vin,
        nickname: nickname || null,
        org: null,
        driver: '',
        fuel_type: fuelType || null, vehicle_type: vehicleType || null, usage: usage || null,
        sub_vehicle: subVehicle || null, trailer: trailer || null,
        purchase_date: purchaseDate || null, insurance_date: insuranceDate || null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }
      // ⭐⭐⭐ 客户导入：自动写入 customer_id
      if (isCustomer) {
        obj.customer_id = myCustomerId.value
        // ⭐ 子账号导入：自动写入 org
        if (isSubAccount) {
          obj.org = myOrgName.value
        }
      }
      validData.push(obj)
    })

    if (errors.length) { importErrors.value = errors.slice(0, 20); ElMessage.error(`存在 ${errors.length} 条错误`); return }
    if (!validData.length) { ElMessage.warning('没有有效数据'); return }

    // ⭐⭐⭐ 查重也要按客户隔离
    const existing = new Set()
    let eq = supabase.from('vehicles').select('plate').in('plate', validData.map(v => v.plate))
    if (isCustomer) {
      eq = eq.eq('customer_id', myCustomerId.value)
      if (isSubAccount) {
        eq = eq.eq('org', myOrgName.value)
      }
    }
    const { data: ex } = await eq
      ; (ex || []).forEach(i => existing.add(i.plate))

    const upd = [], ins = []
    validData.forEach(item => existing.has(item.plate) ? upd.push(item) : ins.push(item))

    // ⭐ 更新时也加隔离条件（防止跨客户更新）
    for (const item of upd) {
      let uq = supabase.from('vehicles').update(item).eq('plate', item.plate)
      if (isCustomer) {
        uq = uq.eq('customer_id', myCustomerId.value)
        if (isSubAccount) uq = uq.eq('org', myOrgName.value)
      }
      const { error } = await uq
      if (error) throw error
    }
    if (ins.length) {
      const { error } = await supabase.from('vehicles').insert(ins)
      if (error) throw error
    }

    ElMessage.success(`导入完成：更新 ${upd.length} 条，新增 ${ins.length} 条`)
    showImportDialog.value = false
    uploadFile.value = null; uploadFileName.value = ''; importErrors.value = []
    handleSearch()
  } catch (err) { ElMessage.error('导入失败：' + err.message) }
  finally { importing.value = false }
}

// ============================================================
// 生命周期
// ============================================================
watch(() => [searchForm.org, searchForm.fuelType, searchForm.plate, searchForm.vin, currentPage.value, pageSize.value], saveState, { deep: true })

onMounted(async () => {
  document.addEventListener('keydown', onEscKeydown)
  if (isCustomer) {
    await loadMyCustomerId()
    await loadMyOrgName()
  }
  await loadOrgOptions()
  restoreState()
  // ⭐ 每次进入页面都主动拉取最新数据（不走缓存短路）
  await fetchVehicles()
})

// ⭐ 兼容 keep-alive 场景（若以后加了 keep-alive，切回 tab 也刷新）
onActivated(async () => {
  if (isCustomer && !myCustomerId.value) await loadMyCustomerId()
  if (isCustomer && isSubAccount && !myOrgName.value) await loadMyOrgName()
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
                <el-table-column v-if="col.prop === 'action'" :label="col.label"
                  :width="col.width ? Math.round(col.width * densityMultiplier) : 120" :align="col.align"
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

                <el-table-column v-else-if="col.prop === 'created_at' || col.prop === 'updated_at'" :label="col.label"
                  :min-width="Math.round(col.minWidth * densityMultiplier)" :align="col.align"
                  :fixed="col.fixed || false" show-overflow-tooltip>
                  <template #default="{ row }"><span class="time-text">{{ formatDateTime(row[col.prop])
                      }}</span></template>
                </el-table-column>

                <el-table-column v-else-if="col.prop === 'vin'" :label="col.label"
                  :min-width="Math.round(col.minWidth * densityMultiplier)" :align="col.align"
                  :fixed="col.fixed || false" show-overflow-tooltip>
                  <template #default="{ row }"><span class="mono-text">{{ row.vin || '--' }}</span></template>
                </el-table-column>

                <el-table-column v-else :prop="col.prop" :label="col.label"
                  :min-width="Math.round(col.minWidth * densityMultiplier)" :align="col.align"
                  :fixed="col.fixed || false" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span :class="col.prop === 'plate' ? 'plate-text' : 'text-content'">{{ row[col.prop] || '--'
                      }}</span>
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

    <!-- 导入 -->
    <el-dialog v-model="showImportDialog" title="导入车辆档案" width="560px" destroy-on-close :close-on-click-modal="false"
      class="va-dialog">
      <div class="import-step">
        <div class="step-header"><span class="step-num">1</span><span class="step-title">下载模板</span></div>
        <div class="step-body">
          <el-button type="primary" class="btn-primary" size="small" @click="downloadTemplate">
            <el-icon>
              <Download />
            </el-icon> 下载模板
          </el-button>
          <span class="step-tip">支持 .csv / .xlsx</span>
        </div>
      </div>

      <div class="import-step">
        <div class="step-header"><span class="step-num">2</span><span class="step-title">上传文件</span></div>
        <div class="step-body step-col">
          <el-upload ref="uploadRef" action="#" :auto-upload="false" :on-change="handleFileChange"
            :on-remove="handleFileRemove" :limit="1" accept=".csv,.xlsx,.xls" drag class="import-upload">
            <div class="upload-inner">
              <el-icon class="upload-icon">
                <Upload />
              </el-icon>
              <div class="upload-text">点击或拖拽上传</div>
            </div>
          </el-upload>
          <div v-if="uploadFileName" class="upload-filename">已选：{{ uploadFileName }}</div>
        </div>
      </div>

      <div v-if="importErrors.length" class="import-errors">
        <div class="error-title">错误：</div>
        <div class="error-list">
          <div v-for="(e, i) in importErrors" :key="i">{{ e }}</div>
        </div>
      </div>

      <template #footer>
        <button class="action-btn-footer ghost" @click="showImportDialog = false">取消</button>
        <button class="action-btn-footer primary" :disabled="importing" @click="confirmImport">
          {{ importing ? '导入中...' : '确认导入' }}
        </button>
      </template>
    </el-dialog>

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
                <el-form-item label="所属机构组织">
                  <el-select v-model="editFormData.org" placeholder="请选择" clearable style="width: 100%">
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
  background: #FEF2F2 !important;
  box-shadow: 0 0 0 1px #FCA5A5 inset !important;
}

.search-row :deep(.el-input__wrapper.is-focus),
.search-row :deep(.el-select__wrapper.is-focused) {
  background: #fff !important;
  box-shadow: 0 0 0 2px rgba(200, 16, 46, 0.15), 0 0 0 1px #c8102e inset !important;
}

.btn-primary {
  background: linear-gradient(135deg, #c8102e, #a00d24) !important;
  border: none !important;
  color: #fff !important;
  font-weight: 600;
  border-radius: 6px !important;
  box-shadow: 0 3px 10px rgba(200, 16, 46, 0.25);
  transition: all 0.25s;
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
  transition: all 0.25s;
}

.btn-outline:hover {
  border-color: #c8102e !important;
  color: #c8102e !important;
  background: #FEF2F2 !important;
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
  box-shadow: 0 20px 60px rgba(200, 16, 46, 0.18);
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
  color: #c8102e;
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
  background: #FEF2F2 !important;
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
  color: #c8102e;
}

.action-edit:hover {
  color: #7F1D1D;
  background: #FEF2F2;
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
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  box-shadow: 0 3px 8px rgba(200, 16, 46, 0.3);
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
  border-color: #c8102e;
  background: #FEF2F2;
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
  color: #c8102e;
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
  background: #FEF2F2;
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
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #fff;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  box-shadow: 0 3px 10px rgba(200, 16, 46, 0.35);
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
  background: #c8102e;
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
  box-shadow: 0 0 0 1px rgba(200, 16, 46, 0.4) inset !important;
}

.edit-form :deep(.el-input__wrapper.is-focus),
.edit-form :deep(.el-select__wrapper.is-focused) {
  background: #fff !important;
  box-shadow: 0 0 0 1px #c8102e inset, 0 0 0 3px rgba(200, 16, 46, 0.1) !important;
}

.clear-icon {
  cursor: pointer;
  color: #94A3B8;
  transition: color 0.2s;
}

.clear-icon:hover {
  color: #c8102e;
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
  background: #FEF2F2;
}

.driver-checkbox-group :deep(.el-checkbox__label) {
  font-size: 13px;
  color: #334155;
  font-weight: 500;
}

.driver-checkbox-group :deep(.el-checkbox__input.is-checked + .el-checkbox__label) {
  color: #c8102e;
  font-weight: 700;
}

.driver-checkbox-group :deep(.el-checkbox__inner) {
  border-color: #CBD5E1;
  border-radius: 3px;
}

.driver-checkbox-group :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background-color: #c8102e;
  border-color: #c8102e;
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
  background: linear-gradient(135deg, #c8102e, #a00d24);
  box-shadow: 0 6px 20px rgba(200, 16, 46, 0.4);
}

.action-btn-footer.primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 12px 30px rgba(200, 16, 46, 0.55);
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
  stroke: #c8102e;
  stroke-width: 3;
  stroke-linecap: round;
  animation: loading-dash 1.5s ease-in-out infinite;
  filter: drop-shadow(0 2px 6px rgba(200, 16, 46, 0.35));
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
  box-shadow: 0 10px 32px rgba(200, 16, 46, 0.18), 0 0 0 1px rgba(200, 16, 46, 0.12) !important;
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

.density-dropdown-red .density-item {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
}

.density-dropdown-red .density-item.active {
  color: #c8102e;
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
  border-radius: 3px;
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

.el-message-box__btns .el-button--primary {
  background: linear-gradient(135deg, #c8102e, #a00d24) !important;
  border-color: #c8102e !important;
}
</style>