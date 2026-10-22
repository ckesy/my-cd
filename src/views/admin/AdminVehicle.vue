<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox, ElLoading } from 'element-plus'
import {
  Search, Plus, Upload, Download, Delete, Edit, User,
  Refresh, Operation, Setting, FullScreen, Close,
  Grid, Rank, DArrowLeft, DArrowRight,
} from '@element-plus/icons-vue'
import { supabase } from '@/utils/supabase'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'

// ============================================================
// 超时防御
// ============================================================
const withTimeout = (promise, timeoutMs = 10000, errorMessage = '请求超时，请稍后重试') => {
  let timeoutId
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId))
}

// ---------- 筛选条件 ----------
const filters = ref({
  customer: '',
  plate: '',
  vin: '',
  deviceId: '',
  bound: '',
  fuelType: '',
})

// ---------- 客户下拉 ----------
const customers = ref([])
const loadCustomers = async () => {
  const { data, error } = await supabase.from('customers').select('id, name').order('name')
  if (!error) customers.value = data || []
}

const fuelOptions = ['燃油车', '燃气车', '纯电动', '氢燃料']
const boundOptions = [
  { label: '已绑定', value: '1' },
  { label: '未绑定', value: '0' },
]

// ============================================================
// 反查客户根节点 id
// ============================================================
const customerRootOrgMap = ref({})

const loadCustomerRootOrgs = async () => {
  try {
    const { data, error } = await supabase
      .from('organizations')
      .select('id, customer_id')
      .eq('is_root', true)
    if (error) throw error
    const map = {}
      ; (data || []).forEach(o => {
        if (o.customer_id) map[o.customer_id] = o.id
      })
    customerRootOrgMap.value = map
  } catch (e) {
    console.warn('[admin-vehicle] 加载客户根节点失败:', e)
  }
}

const getRootOrgId = (customerId) => {
  if (!customerId) return null
  return customerRootOrgMap.value[customerId] || null
}

// ---------- 表格数据 ----------
const tableData = ref([])
const loading = ref(false)
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const selectedRows = ref([])

const fetchData = async () => {
  loading.value = true
  try {
    let query = supabase.from('vehicles').select('*', { count: 'exact' })

    if (filters.value.customer) query = query.eq('customer_id', filters.value.customer)
    if (filters.value.plate) query = query.ilike('plate', `%${filters.value.plate}%`)
    if (filters.value.vin) query = query.ilike('vin', `%${filters.value.vin}%`)
    if (filters.value.deviceId) query = query.ilike('device_id', `%${filters.value.deviceId}%`)
    if (filters.value.fuelType) query = query.eq('fuel_type', filters.value.fuelType)
    if (filters.value.bound === '1') query = query.not('customer_id', 'is', null)
    if (filters.value.bound === '0') query = query.is('customer_id', null)

    const from = (currentPage.value - 1) * pageSize.value
    const to = from + pageSize.value - 1
    query = query.order('updated_at', { ascending: false }).range(from, to)

    const { data, error, count } = await query
    if (error) throw error

    tableData.value = (data || []).map(row => ({
      id: row.id,
      plate: row.plate,
      vin: row.vin,
      nickname: row.nickname,
      org: row.org,
      orgId: row.org_id,
      customerId: row.customer_id,
      driver: row.driver,
      vehicleType: row.vehicle_type,
      fuelType: row.fuel_type,
      usage: row.usage,
      subVehicle: row.sub_vehicle,
      trailer: row.trailer,
      purchaseDate: row.purchase_date,
      insuranceDate: row.insurance_date,
      deviceId: row.device_id,
      terminalId: row.terminal_id,
      remark: row.remark,
      updatedAt: row.updated_at
        ? new Date(row.updated_at).toLocaleString('zh-CN', { hour12: false })
        : '--',
    }))
    total.value = count || 0
  } catch (e) {
    console.error(e)
    ElMessage.error('加载车辆失败：' + (e?.message || e))
  } finally {
    loading.value = false
  }
}

const handleSearch = () => { currentPage.value = 1; fetchData() }

const handleReset = () => {
  filters.value = { customer: '', plate: '', vin: '', deviceId: '', bound: '', fuelType: '' }
  currentPage.value = 1
  fetchData()
}

const handleRefresh = async () => {
  await fetchData()
  ElMessage.success({ message: '已刷新', duration: 1200 })
}

const handleSelectionChange = (rows) => { selectedRows.value = rows }

// ============================================================
// 密度
// ============================================================
const DENSITY_KEY = 'admin_vehicle_density'
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

// ============================================================
// 列设置
// ============================================================
const columnPopoverVisible = ref(false)
const DEFAULT_COLUMNS = [
  { prop: 'plate', label: '车牌号', visible: true, fixed: 'left', minWidth: 110, align: 'center' },
  { prop: 'vin', label: '车架号', visible: true, fixed: false, minWidth: 170, align: 'center' },
  { prop: 'nickname', label: '别名', visible: true, fixed: false, minWidth: 100, align: 'center' },
  { prop: 'org', label: '所属客户', visible: true, fixed: false, minWidth: 150, align: 'center' },
  { prop: 'driver', label: '司机', visible: true, fixed: false, minWidth: 100, align: 'center' },
  { prop: 'vehicleType', label: '车型', visible: true, fixed: false, minWidth: 100, align: 'center' },
  { prop: 'fuelType', label: '燃料', visible: true, fixed: false, minWidth: 80, align: 'center' },
  { prop: 'usage', label: '用途', visible: true, fixed: false, minWidth: 100, align: 'center' },
  { prop: 'deviceId', label: '设备号', visible: true, fixed: false, minWidth: 140, align: 'center' },
  { prop: 'terminalId', label: '终端编号', visible: true, fixed: false, minWidth: 120, align: 'center' },
  { prop: 'purchaseDate', label: '购买日期', visible: true, fixed: false, minWidth: 120, align: 'center' },
  { prop: 'insuranceDate', label: '保险日期', visible: true, fixed: false, minWidth: 120, align: 'center' },
  { prop: 'updatedAt', label: '最后更新时间', visible: true, fixed: false, minWidth: 160, align: 'center' },
  { prop: 'action', label: '操作', visible: true, fixed: 'right', width: 150, align: 'center' },
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
const onDragEnd = () => { dragIndex.value = -1; dragOverIndex.value = -1 }

// ============================================================
// 全屏
// ============================================================
const isTableFullscreen = ref(false)
const toggleTableFullscreen = () => { isTableFullscreen.value = !isTableFullscreen.value }
const onEscKeydown = (e) => {
  if (e.key === 'Escape' && isTableFullscreen.value) isTableFullscreen.value = false
}

// ============================================================
// 弹窗：新增 / 编辑
// ============================================================
const dialogVisible = ref(false)
const dialogMode = ref('add')
const formRef = ref(null)
const form = reactive({
  id: '', plate: '', vin: '', nickname: '', customerId: '',
  driver: '', vehicleType: '', fuelType: '', usage: '',
  subVehicle: '', trailer: '', purchaseDate: '', insuranceDate: '',
  deviceId: '', terminalId: '', remark: '',
})
const formRules = {
  plate: [{ required: true, message: '请输入车牌号', trigger: 'blur' }],
  customerId: [{ required: true, message: '请选择所属客户', trigger: 'change' }],
}

const openAdd = () => {
  if (isTableFullscreen.value) {
    ElMessage.warning('请退出全屏后操作')
    return
  }
  dialogMode.value = 'add'
  Object.assign(form, {
    id: '', plate: '', vin: '', nickname: '', customerId: '',
    driver: '', vehicleType: '', fuelType: '', usage: '',
    subVehicle: '', trailer: '', purchaseDate: '', insuranceDate: '',
    deviceId: '', terminalId: '', remark: '',
  })
  dialogVisible.value = true
  formRef.value?.clearValidate?.()
}

const openEdit = (row) => {
  if (isTableFullscreen.value) {
    ElMessage.warning('请退出全屏后操作')
    return
  }
  dialogMode.value = 'edit'
  Object.assign(form, {
    id: row.id, plate: row.plate || '', vin: row.vin || '', nickname: row.nickname || '',
    customerId: row.customerId || '', driver: row.driver || '',
    vehicleType: row.vehicleType || '', fuelType: row.fuelType || '',
    usage: row.usage || '', subVehicle: row.subVehicle || '', trailer: row.trailer || '',
    purchaseDate: row.purchaseDate || '', insuranceDate: row.insuranceDate || '',
    deviceId: row.deviceId || '', terminalId: row.terminalId || '', remark: row.remark || '',
  })
  dialogVisible.value = true
  formRef.value?.clearValidate?.()
}

const handleSubmit = async () => {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
    const customerName = customers.value.find(c => c.id === form.customerId)?.name || null
    const rootOrgId = getRootOrgId(form.customerId)

    const payload = {
      plate: form.plate,
      vin: form.vin || null,
      nickname: form.nickname || null,
      org: customerName,
      org_id: rootOrgId,
      customer_id: form.customerId || null,
      driver: form.driver || null,
      vehicle_type: form.vehicleType || null,
      fuel_type: form.fuelType || null,
      usage: form.usage || null,
      sub_vehicle: form.subVehicle || null,
      trailer: form.trailer || null,
      purchase_date: form.purchaseDate || null,
      insurance_date: form.insuranceDate || null,
      device_id: form.deviceId || null,
      terminal_id: form.terminalId || null,
      remark: form.remark || null,
      updated_at: new Date().toISOString(),
    }

    if (dialogMode.value === 'add') {
      const { error } = await supabase.from('vehicles').insert(payload)
      if (error) throw error
      ElMessage.success('车辆添加成功')
    } else {
      const { error } = await supabase.from('vehicles').update(payload).eq('id', form.id)
      if (error) throw error
      ElMessage.success('车辆信息已更新')
    }
    dialogVisible.value = false
    fetchData()
  } catch (e) {
    if (e?.message) ElMessage.error('操作失败：' + e.message)
  }
}

const handleDelete = (row) => {
  const ids = row?.id ? [row.id] : selectedRows.value.map(r => r.id)
  if (!ids.length) { ElMessage.warning('请先勾选要删除的车辆'); return }
  ElMessageBox.confirm(
    `确定删除选中的 ${ids.length} 条车辆？删除后不可恢复。`,
    '删除确认',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
  ).then(async () => {
    const { error } = await supabase.from('vehicles').delete().in('id', ids)
    if (error) { ElMessage.error('删除失败：' + error.message); return }
    ElMessage.success('删除成功')
    selectedRows.value = []
    fetchData()
  }).catch(() => { })
}

// ============================================================
// 批量分配客户
// ============================================================
const batchDialogVisible = ref(false)
const batchCustomerId = ref('')

const currentOwnership = computed(() => {
  const map = new Map()
  selectedRows.value.forEach(r => {
    const key = r.customerId || '__unassigned__'
    const name = r.org || '未分配客户'
    if (!map.has(key)) map.set(key, { id: key, name, count: 0 })
    map.get(key).count++
  })
  return Array.from(map.values()).sort((a, b) => {
    if (a.id === '__unassigned__') return 1
    if (b.id === '__unassigned__') return -1
    return b.count - a.count
  })
})

const isRebind = computed(() =>
  currentOwnership.value.some(o => o.id !== '__unassigned__')
)

const openBatchAssign = () => {
  if (!selectedRows.value.length) { ElMessage.warning('请先勾选要分配的车辆'); return }
  if (isTableFullscreen.value) {
    ElMessage.warning('请退出全屏后操作')
    return
  }
  batchCustomerId.value = ''
  batchDialogVisible.value = true
}

const handleBatchAssign = async () => {
  if (!batchCustomerId.value) { ElMessage.warning('请选择目标客户'); return }
  const customer = customers.value.find(c => c.id === batchCustomerId.value)
  if (!customer) return

  if (isRebind.value) {
    const summary = currentOwnership.value
      .filter(o => o.id !== '__unassigned__')
      .map(o => `${o.name}（${o.count} 台）`).join('、')
    try {
      await ElMessageBox.confirm(
        `以下车辆将从原客户名下移除：${summary}\n确定要换绑到「${customer.name}」吗？`,
        '换绑确认',
        { type: 'warning', confirmButtonText: '确定换绑', cancelButtonText: '取消' }
      )
    } catch { return }
  }

  const ids = selectedRows.value.map(r => r.id)
  const rootOrgId = getRootOrgId(customer.id)

  try {
    const { error } = await supabase
      .from('vehicles')
      .update({
        customer_id: customer.id,
        org: customer.name,
        org_id: rootOrgId,
        updated_at: new Date().toISOString(),
      })
      .in('id', ids)
    if (error) throw error
    ElMessage.success(`已将 ${ids.length} 台车辆分配给「${customer.name}」`)
    batchDialogVisible.value = false
    selectedRows.value = []
    fetchData()
  } catch (e) {
    ElMessage.error('批量分配失败：' + (e?.message || e))
  }
}

// ============================================================
// 批量导入
// ============================================================
const showImportDialog = ref(false)
const uploadRef = ref(null)
const uploadFile = ref(null)
const uploadFileName = ref('')
const importErrors = ref([])
const importing = ref(false)
const importCustomerId = ref('')

const templateHeaders = [
  '车牌号', 'VIN码', '车辆昵称',
  '燃料类型', '车辆类型', '车辆用途', '子母车', '关联挂车',
  '车辆购买日', '保险购买日',
]

const handleImport = () => {
  if (isTableFullscreen.value) {
    ElMessage.warning('请退出全屏后操作')
    return
  }
  showImportDialog.value = true
  importCustomerId.value = ''
  uploadFile.value = null
  uploadFileName.value = ''
  importErrors.value = []
}

const downloadTemplate = async () => {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('车辆档案导入模板')

  const headerRow = worksheet.addRow(templateHeaders)
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8102E' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    }
  })

  const sampleData = [
    '粤A12345', 'LGAX3AG59N9009177', '我的车',
    '纯电动', '牵引车', '快递快运', '否', '无',
    '2026-01-01', '2026-01-01',
  ]
  const dataRow = worksheet.addRow(sampleData)
  dataRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    }
  })
  worksheet.columns = templateHeaders.map(() => ({ width: 18 }))

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = '车辆档案导入模板.xlsx'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}

const handleFileChange = (file) => {
  uploadFile.value = file.raw
  uploadFileName.value = file.name
  importErrors.value = []
}

const handleFileRemove = () => {
  uploadFile.value = null
  uploadFileName.value = ''
  importErrors.value = []
}

const confirmImport = async () => {
  if (!uploadFile.value) { ElMessage.warning('请先选择文件'); return }

  importing.value = true
  importErrors.value = []

  const loadingInstance = ElLoading.service({
    fullscreen: true,
    text: '正在导入数据...',
    background: 'rgba(0, 0, 0, 0.7)',
  })

  try {
    const file = uploadFile.value
    const fileExt = file.name.split('.').pop().toLowerCase()
    let rows = []

    if (fileExt === 'csv') {
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())
      if (lines.length < 2) { ElMessage.error('文件为空或格式不正确'); return }
      rows = lines.slice(1).map(line => line.split(',').map(cell => cell.trim()))
    } else if (['xlsx', 'xls'].includes(fileExt)) {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1 })
      if (json.length < 2) { ElMessage.error('文件为空或格式不正确'); return }
      rows = json.slice(1)
    } else {
      ElMessage.error('不支持的文件格式，请上传 .csv 或 .xlsx')
      return
    }

    const customer = importCustomerId.value
      ? customers.value.find(c => c.id === importCustomerId.value)
      : null
    const rootOrgId = customer ? getRootOrgId(customer.id) : null

    const validData = []
    const errors = []

    rows.forEach((row, index) => {
      const rowNum = index + 2
      const [
        plate, vin, nickname,
        fuelType, vehicleType, usage, subVehicle, trailer,
        purchaseDate, insuranceDate,
      ] = row.map(cell => (cell || '').toString().trim())

      const missing = []
      if (!plate) missing.push('车牌号')
      if (!vin) missing.push('VIN码')
      if (missing.length) {
        errors.push(`第 ${rowNum} 行：缺少必填字段：${missing.join('、')}`)
        return
      }

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (purchaseDate && !dateRegex.test(purchaseDate)) {
        errors.push(`第 ${rowNum} 行：车辆购买日格式错误，应为 YYYY-MM-DD`)
        return
      }
      if (insuranceDate && !dateRegex.test(insuranceDate)) {
        errors.push(`第 ${rowNum} 行：保险购买日格式错误，应为 YYYY-MM-DD`)
        return
      }

      validData.push({
        plate,
        vin,
        nickname: nickname || null,
        org: customer?.name || null,
        org_id: rootOrgId,
        customer_id: customer?.id || null,
        driver: null,
        fuel_type: fuelType || null,
        vehicle_type: vehicleType || null,
        usage: usage || null,
        sub_vehicle: subVehicle || null,
        trailer: trailer || null,
        purchase_date: purchaseDate || null,
        insurance_date: insuranceDate || null,
        updated_at: new Date().toISOString(),
      })
    })

    if (errors.length) {
      importErrors.value = errors.slice(0, 20)
      ElMessage.error(`存在 ${errors.length} 条错误，请修正后重试`)
      return
    }

    if (validData.length === 0) {
      ElMessage.warning('没有有效数据可导入')
      return
    }

    const existingPlates = new Set()
    const { data: existingData } = await withTimeout(
      supabase.from('vehicles').select('plate').in('plate', validData.map(v => v.plate)),
      15000,
      '查询已有车辆超时'
    )
    if (existingData) existingData.forEach(item => existingPlates.add(item.plate))

    const updateData = []
    const insertData = []
    validData.forEach(item => {
      if (existingPlates.has(item.plate)) {
        updateData.push(item)
      } else {
        insertData.push({ ...item, created_at: new Date().toISOString() })
      }
    })

    for (const item of updateData) {
      const { error } = await withTimeout(
        supabase.from('vehicles').update(item).eq('plate', item.plate),
        10000,
        `更新车牌 ${item.plate} 超时`
      )
      if (error) throw error
    }

    if (insertData.length > 0) {
      const { error } = await withTimeout(
        supabase.from('vehicles').insert(insertData),
        15000,
        '批量插入数据超时'
      )
      if (error) throw error
    }

    ElMessage.success(`导入完成：更新 ${updateData.length} 条，新增 ${insertData.length} 条`)
    showImportDialog.value = false
    uploadFile.value = null
    uploadFileName.value = ''
    importErrors.value = []
    fetchData()
  } catch (err) {
    ElMessage.error('导入失败：' + err.message)
  } finally {
    importing.value = false
    loadingInstance.close()
  }
}

const handleExport = () => ElMessage.info('导出功能开发中')

// ============================================================
// 生命周期
// ============================================================
onMounted(async () => {
  document.addEventListener('keydown', onEscKeydown)
  await loadCustomers()
  await loadCustomerRootOrgs()
  fetchData()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onEscKeydown)
})
</script>

<template>
  <div class="admin-vehicle">
    <!-- ============================================================ -->
    <!-- 筛选卡片 -->
    <!-- ============================================================ -->
    <div class="search-card">
      <div class="search-row">
        <el-select v-model="filters.customer" placeholder="请选择所属客户" clearable popper-class="light-select-popper"
          style="width: 200px;">
          <el-option v-for="c in customers" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-input v-model="filters.plate" placeholder="请输入车牌号" clearable style="width: 140px;" />
        <el-input v-model="filters.vin" placeholder="请输入车架号" clearable style="width: 180px;" />
        <el-input v-model="filters.deviceId" placeholder="请输入设备号" clearable style="width: 150px;" />
        <el-select v-model="filters.bound" placeholder="是否绑定客户" clearable popper-class="light-select-popper"
          style="width: 150px;">
          <el-option v-for="b in boundOptions" :key="b.value" :label="b.label" :value="b.value" />
        </el-select>
        <el-select v-model="filters.fuelType" placeholder="请选择燃料类型" clearable popper-class="light-select-popper"
          style="width: 150px;">
          <el-option v-for="f in fuelOptions" :key="f" :label="f" :value="f" />
        </el-select>

        <div class="search-actions">
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
    </div>

    <!-- ============================================================ -->
    <!-- 表格卡片 -->
    <!-- ============================================================ -->
    <Teleport to="body" :disabled="!isTableFullscreen">
      <div class="table-card-wrap" :class="{ 'is-fullscreen': isTableFullscreen }">
        <div class="table-card">
          <!-- 工具栏 -->
          <div class="toolbar">
            <div class="toolbar-left">
              <span class="total-hint">共 <b>{{ total }}</b> 条</span>
            </div>

            <div class="toolbar-right">
              <el-button type="primary" class="btn-primary" @click="openAdd" :disabled="isTableFullscreen">
                <el-icon>
                  <Plus />
                </el-icon> 添加车辆
              </el-button>
              <el-button class="btn-outline" @click="handleImport" :disabled="isTableFullscreen">
                <el-icon>
                  <Upload />
                </el-icon> 批量导入
              </el-button>
              <el-button class="btn-outline" @click="handleExport">
                <el-icon>
                  <Download />
                </el-icon> 导出
              </el-button>
              <el-button class="btn-outline assign-btn" @click="openBatchAssign"
                :disabled="!selectedRows.length || isTableFullscreen">
                <el-icon>
                  <User />
                </el-icon> 批量分配
                <span v-if="selectedRows.length" class="selected-badge">{{ selectedRows.length }}</span>
              </el-button>
              <el-button class="btn-outline danger-btn" @click="handleDelete" :disabled="!selectedRows.length">
                <el-icon>
                  <Delete />
                </el-icon> 删除
              </el-button>

              <!-- 4 个图标按钮 -->
              <button class="icon-btn" @click="handleRefresh" title="刷新">
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
                      @dragstart="onDragStart(index)" @dragover.prevent="onDragOver(index)" @drop="onDrop(index)"
                      @dragend="onDragEnd">
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

          <!-- 表格 -->
          <div class="table-wrap">
            <el-table :data="tableData" v-loading="loading" element-loading-text="加载中…"
              element-loading-background="rgba(255, 255, 255, 0.88)" border stripe :size="tableSize" height="100%"
              class="custom-table" :header-cell-style="{ background: '#F8FAFC', color: '#0F172A', fontWeight: '700' }"
              @selection-change="handleSelectionChange">
              <el-table-column type="selection" width="46" align="center" fixed="left" />

              <template v-for="col in visibleColumns" :key="col.prop">
                <el-table-column v-if="col.prop === 'action'" :label="col.label"
                  :width="col.width ? Math.round(col.width * densityMultiplier) : 150" :align="col.align"
                  :fixed="col.fixed || false">
                  <template #default="{ row }">
                    <div class="action-cell">
                      <button class="action-btn action-edit" @click="openEdit(row)">
                        <el-icon>
                          <Edit />
                        </el-icon>
                        <span>编辑</span>
                      </button>
                      <button class="action-btn action-delete" @click="handleDelete(row)">
                        <el-icon>
                          <Delete />
                        </el-icon>
                        <span>删除</span>
                      </button>
                    </div>
                  </template>
                </el-table-column>

                <el-table-column v-else :prop="col.prop" :label="col.label"
                  :min-width="Math.round(col.minWidth * densityMultiplier)" :align="col.align"
                  :fixed="col.fixed || false" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span :class="row[col.prop] ? 'text-content' : 'text-muted'">
                      {{ row[col.prop] || '--' }}
                    </span>
                  </template>
                </el-table-column>
              </template>

              <template #empty>
                <div class="empty-state">
                  <el-icon class="empty-icon">
                    <Van />
                  </el-icon>
                  <p>暂无车辆数据</p>
                </div>
              </template>
            </el-table>
          </div>

          <!-- 分页 -->
          <div class="pagination-wrapper">
            <span class="total-text">共 {{ total }} 条</span>
            <el-pagination background layout="sizes, prev, pager, next, jumper" :total="total"
              v-model:current-page="currentPage" v-model:page-size="pageSize" :page-sizes="[20, 50, 100]"
              @size-change="fetchData" @current-change="fetchData" class="custom-pagination" />
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

    <!-- ============================================================ -->
    <!-- 新增/编辑弹窗 -->
    <!-- ============================================================ -->
    <el-dialog v-model="dialogVisible" :title="dialogMode === 'add' ? '添加车辆' : '编辑车辆'" width="680px"
      class="light-dialog" :close-on-click-modal="false" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px" class="light-form">
        <div class="form-grid">
          <el-form-item label="车牌号" prop="plate">
            <el-input v-model="form.plate" placeholder="请输入车牌号" />
          </el-form-item>
          <el-form-item label="车架号" prop="vin">
            <el-input v-model="form.vin" placeholder="请输入车架号" />
          </el-form-item>
          <el-form-item label="别名">
            <el-input v-model="form.nickname" placeholder="请输入别名" />
          </el-form-item>
          <el-form-item label="所属客户" prop="customerId">
            <el-select v-model="form.customerId" placeholder="请选择所属客户" style="width:100%;"
              popper-class="light-select-popper">
              <el-option v-for="c in customers" :key="c.id" :label="c.name" :value="c.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="司机">
            <el-input v-model="form.driver" placeholder="请输入司机姓名" />
          </el-form-item>
          <el-form-item label="车型">
            <el-input v-model="form.vehicleType" placeholder="请输入车型" />
          </el-form-item>
          <el-form-item label="燃料类型">
            <el-select v-model="form.fuelType" placeholder="请选择" style="width:100%;" clearable
              popper-class="light-select-popper">
              <el-option v-for="f in fuelOptions" :key="f" :label="f" :value="f" />
            </el-select>
          </el-form-item>
          <el-form-item label="用途">
            <el-input v-model="form.usage" placeholder="请输入用途" />
          </el-form-item>
          <el-form-item label="子车">
            <el-input v-model="form.subVehicle" placeholder="请输入子车" />
          </el-form-item>
          <el-form-item label="挂车">
            <el-input v-model="form.trailer" placeholder="请输入挂车" />
          </el-form-item>
          <el-form-item label="购买日期">
            <el-date-picker v-model="form.purchaseDate" type="date" value-format="YYYY-MM-DD" placeholder="请选择日期"
              style="width:100%;" />
          </el-form-item>
          <el-form-item label="保险日期">
            <el-date-picker v-model="form.insuranceDate" type="date" value-format="YYYY-MM-DD" placeholder="请选择日期"
              style="width:100%;" />
          </el-form-item>
          <el-form-item label="设备号">
            <el-input v-model="form.deviceId" placeholder="请输入设备号" />
          </el-form-item>
          <el-form-item label="终端编号">
            <el-input v-model="form.terminalId" placeholder="请输入终端编号" />
          </el-form-item>
        </div>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="选填" />
        </el-form-item>
      </el-form>

      <template #footer>
        <button class="action-btn-footer ghost" @click="dialogVisible = false">取消</button>
        <button class="action-btn-footer primary" @click="handleSubmit">确定</button>
      </template>
    </el-dialog>

    <!-- ============================================================ -->
    <!-- 批量分配客户弹窗 -->
    <!-- ============================================================ -->
    <el-dialog v-model="batchDialogVisible" title="批量分配客户" width="500px" class="light-dialog"
      :close-on-click-modal="false">
      <div class="assign-tip">
        <span class="tip-icon">!</span>
        即将把选中的 <b>{{ selectedRows.length }}</b> 台车辆分配给指定客户
      </div>

      <div class="assign-preview">
        <div class="preview-label">已选车辆：</div>
        <div class="preview-list">
          <span v-for="r in selectedRows.slice(0, 8)" :key="r.id" class="preview-tag">{{ r.plate }}</span>
          <span v-if="selectedRows.length > 8" class="preview-more">等 {{ selectedRows.length }} 台</span>
        </div>
      </div>

      <div class="ownership-section" :class="{ rebind: isRebind }">
        <div class="ownership-header">
          <span class="ownership-title">
            <span v-if="isRebind" class="ownership-icon warning">⚠</span>
            <span v-else class="ownership-icon info">ⓘ</span>
            {{ isRebind ? '当前归属（换绑警告）' : '当前归属' }}
          </span>
          <span v-if="isRebind" class="ownership-hint">换绑后将从原客户名下移除</span>
        </div>
        <div class="ownership-list">
          <div v-for="o in currentOwnership" :key="o.id" class="ownership-item"
            :class="{ unassigned: o.id === '__unassigned__' }">
            <span class="ownership-name">{{ o.name }}</span>
            <span class="ownership-count">{{ o.count }} 台</span>
          </div>
        </div>
      </div>

      <el-form label-width="90px" class="light-form" style="margin-top: 16px;">
        <el-form-item label="目标客户" required>
          <el-select v-model="batchCustomerId" placeholder="请选择目标客户" style="width:100%;" filterable
            popper-class="light-select-popper">
            <el-option v-for="c in customers" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <button class="action-btn-footer ghost" @click="batchDialogVisible = false">取消</button>
        <button class="action-btn-footer primary" @click="handleBatchAssign">
          {{ isRebind ? '确定换绑' : '确定分配' }}
        </button>
      </template>
    </el-dialog>

    <!-- ============================================================ -->
    <!-- 批量导入弹窗 -->
    <!-- ============================================================ -->
    <el-dialog v-model="showImportDialog" title="批量导入车辆" width="600px" class="light-dialog" destroy-on-close>
      <div class="import-step">
        <div class="step-header">
          <span class="step-num">1</span>
          <span class="step-title">下载导入模板</span>
        </div>
        <div class="step-body">
          <button class="action-btn-footer ghost" @click="downloadTemplate">
            <el-icon>
              <Download />
            </el-icon> 下载模板
          </button>
          <span class="step-tip">支持 .csv / .xlsx / .xls</span>
        </div>
      </div>

      <div class="import-step">
        <div class="step-header">
          <span class="step-num">2</span>
          <span class="step-title">选择所属客户（可选）</span>
        </div>
        <div class="step-body step-body-col">
          <el-select v-model="importCustomerId" placeholder="导入的车辆统一分配给该客户" clearable filterable style="width:100%;"
            popper-class="light-select-popper">
            <el-option v-for="c in customers" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
          <div class="step-hint">不选择则导入的车辆默认为「未分配」，后续可在列表中批量分配</div>
        </div>
      </div>

      <div class="import-step">
        <div class="step-header">
          <span class="step-num">3</span>
          <span class="step-title">上传文件</span>
        </div>
        <div class="step-body step-body-col">
          <el-upload ref="uploadRef" action="#" :auto-upload="false" :on-change="handleFileChange"
            :on-remove="handleFileRemove" :limit="1" accept=".csv,.xlsx,.xls" drag class="import-upload">
            <div class="upload-inner">
              <el-icon class="upload-icon">
                <Upload />
              </el-icon>
              <div class="upload-text">点击或拖拽上传文件</div>
            </div>
          </el-upload>
          <div v-if="uploadFileName" class="upload-filename">
            已选文件：{{ uploadFileName }}
          </div>
        </div>
      </div>

      <div v-if="importErrors.length" class="import-errors">
        <div class="error-title">发现错误：</div>
        <div class="error-list">
          <div v-for="(err, idx) in importErrors" :key="idx">{{ err }}</div>
        </div>
      </div>

      <template #footer>
        <button class="action-btn-footer ghost" @click="showImportDialog = false">取消</button>
        <button class="action-btn-footer primary" @click="confirmImport" :disabled="importing">
          {{ importing ? '导入中...' : '确认导入' }}
        </button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ============================================================
   页面容器
   ============================================================ */
.admin-vehicle {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: calc(100vh - 101px);
  max-height: calc(100vh - 101px);
  padding: 12px 16px 16px;
  box-sizing: border-box;
  overflow: hidden;
  background: #F8FAFC;
  font-size: 13px;
  color: #1E293B;
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
   搜索卡片
   ============================================================ */
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
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
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

.search-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.btn-primary {
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark)) !important;
  border: none !important;
  color: #fff !important;
  font-weight: 600;
  border-radius: 6px !important;
  box-shadow: 0 3px 10px rgba(var(--brand-rgb), 0.25);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 5px 14px rgba(var(--brand-rgb), 0.4);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-outline {
  border-radius: 6px !important;
  border-color: #CBD5E1 !important;
  color: #334155;
  background: #fff !important;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}

.btn-outline:hover:not(:disabled) {
  border-color: var(--brand-primary) !important;
  color: var(--brand-primary) !important;
  background: var(--brand-primary-light) !important;
  transform: translateY(-1px);
}

.btn-outline:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.danger-btn {
  color: #EF4444 !important;
  border-color: rgba(239, 68, 68, 0.35) !important;
}

.danger-btn:hover:not(:disabled) {
  color: #fff !important;
  background: linear-gradient(135deg, #EF4444, #DC2626) !important;
  border-color: transparent !important;
}

/* ============================================================
   表格卡片
   ============================================================ */
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

/* ============================================================
   工具栏
   ============================================================ */
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

.total-hint {
  font-size: 13px;
  color: #64748B;
}

.total-hint b {
  color: var(--brand-primary);
  font-family: 'Courier New', monospace;
  font-size: 14px;
  margin: 0 2px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-wrap: wrap;
}

/* 批量分配按钮 */
.assign-btn {
  position: relative;
  color: #2563EB !important;
  border-color: rgba(37, 99, 235, 0.35) !important;
}

.assign-btn:hover:not(:disabled) {
  color: #FFFFFF !important;
  background: linear-gradient(135deg, #2563EB, #1d4ed8) !important;
  border-color: transparent !important;
  box-shadow: 0 6px 18px rgba(37, 99, 235, 0.35);
}

.selected-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  margin-left: 4px;
  border-radius: 9px;
  background: var(--brand-primary);
  color: #FFFFFF;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
  animation: badgePop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.assign-btn:hover:not(:disabled) .selected-badge {
  background: #FFFFFF;
  color: #2563EB;
}

@keyframes badgePop {
  from {
    transform: scale(0);
  }

  to {
    transform: scale(1);
  }
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
  border-radius: 6px;
  color: #64748B;
  font-size: 15px;
  cursor: pointer;
  padding: 0;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: inherit;
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

.icon-btn:active {
  transform: translateY(0) scale(0.95);
}

/* ============================================================
   表格
   ============================================================ */
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
  gap: 4px;
}

.action-cell :deep(.el-button) {
  margin: 0 !important;
  padding: 0 !important;
  border: none !important;
  background: transparent !important;
  height: auto !important;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 24px;
  padding: 0 6px;
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

.action-edit {
  color: var(--brand-primary);
}

.action-edit:hover {
  color: #7F1D1D;
  background: var(--brand-primary-light);
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
  gap: 8px;
}

.empty-icon {
  font-size: 44px;
  color: #CBD5E1;
}

.empty-state p {
  font-size: 14px;
  margin: 0;
  color: #334155;
  font-weight: 700;
}

/* ============================================================
   分页
   ============================================================ */
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
  color: var(--brand-primary);
  transform: scale(1.08);
}

:deep(.custom-pagination .el-pager li.is-active) {
  background-color: var(--brand-primary) !important;
  color: #fff !important;
  box-shadow: 0 2px 6px rgba(var(--brand-rgb), 0.35);
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
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(var(--brand-rgb), 0.4);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: inherit;
}

.fs-exit-btn:hover {
  transform: translateY(-2px) scale(1.03);
  box-shadow: 0 10px 28px rgba(var(--brand-rgb), 0.55);
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
   通用弹窗/表单
   ============================================================ */
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 12px;
}

/* ⭐ el-dialog 会把 class 合并到 .el-dialog 自身，必须用同元素选择器 */
.light-dialog.el-dialog {
  border-radius: 12px;
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

/* 批量分配弹窗 */
.assign-tip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: #EFF6FF;
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 8px;
  font-size: 13px;
  color: #475569;
}

.assign-tip b {
  color: #2563EB;
  font-weight: 800;
}

.tip-icon {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #2563EB;
  color: #fff;
  font-weight: 700;
  font-size: 12px;
  flex-shrink: 0;
}

.assign-preview {
  margin-top: 12px;
  padding: 10px 14px;
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  max-height: 120px;
  overflow-y: auto;
}

.preview-label {
  font-size: 12px;
  color: #64748B;
  margin-bottom: 6px;
}

.preview-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.preview-tag {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 6px;
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  color: #334155;
  font-size: 12px;
  font-weight: 600;
  font-family: 'Courier New', monospace;
}

.preview-more {
  font-size: 12px;
  color: #94A3B8;
  align-self: center;
  padding-left: 4px;
}

.ownership-section {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 8px;
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  transition: all 0.3s;
}

.ownership-section.rebind {
  background: #FFFBEB;
  border-color: rgba(217, 119, 6, 0.35);
  animation: rebindPulse 0.5s ease;
}

@keyframes rebindPulse {
  0% {
    box-shadow: 0 0 0 0 rgba(217, 119, 6, 0.4);
  }

  100% {
    box-shadow: 0 0 0 8px rgba(217, 119, 6, 0);
  }
}

.ownership-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.ownership-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #334155;
}

.ownership-section.rebind .ownership-title {
  color: #92400E;
}

.ownership-icon {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
}

.ownership-icon.warning {
  background: #F59E0B;
  color: #FFFFFF;
}

.ownership-icon.info {
  background: #64748B;
  color: #FFFFFF;
}

.ownership-hint {
  font-size: 11px;
  color: #B45309;
  background: #FEF3C7;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
}

.ownership-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ownership-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  border-radius: 6px;
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  font-size: 13px;
  transition: all 0.25s;
}

.ownership-item:hover {
  border-color: rgba(var(--brand-rgb), 0.35);
  transform: translateX(2px);
}

.ownership-item.unassigned {
  background: #F1F5F9;
  border-style: dashed;
}

.ownership-item.unassigned .ownership-name {
  color: #94A3B8;
  font-style: italic;
}

.ownership-name {
  color: #0F172A;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 8px;
}

.ownership-count {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 800;
  color: var(--brand-primary);
  font-family: 'Courier New', monospace;
  background: var(--brand-primary-light);
  padding: 1px 8px;
  border-radius: 10px;
}

.ownership-section.rebind .ownership-count {
  color: #B45309;
  background: #FEF3C7;
}

.ownership-item.unassigned .ownership-count {
  color: #64748B;
  background: #E2E8F0;
}

/* 批量导入弹窗 */
.import-step {
  padding: 12px 0;
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
  color: #FFFFFF;
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
  display: flex;
  align-items: center;
  gap: 12px;
  padding-left: 32px;
}

.step-body.step-body-col {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.step-tip {
  font-size: 12px;
  color: #94A3B8;
}

.step-hint {
  font-size: 12px;
  color: #94A3B8;
  line-height: 1.5;
}

.import-upload :deep(.el-upload) {
  width: 100%;
}

.import-upload :deep(.el-upload-dragger) {
  border-radius: 8px;
  border: 1.5px dashed #CBD5E1;
  background: #F8FAFC;
  padding: 20px 0;
  transition: all 0.28s;
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
  transition: color 0.3s;
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
  padding-left: 32px;
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

@media (max-width: 900px) {

  .search-row :deep(.el-input),
  .search-row :deep(.el-select) {
    width: 100% !important;
  }

  .search-actions {
    margin-left: 0;
    width: 100%;
    justify-content: flex-end;
  }

  .toolbar-right {
    justify-content: flex-end;
  }
}

@media (max-width: 768px) {
  .form-grid {
    grid-template-columns: 1fr;
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
  box-shadow: 0 10px 32px rgba(var(--brand-rgb), 0.18), 0 0 0 1px rgba(var(--brand-rgb), 0.15) !important;
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
  color: var(--brand-primary) !important;
  font-weight: 600 !important;
  border-radius: 6px !important;
  padding: 6px 16px !important;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}

.density-dropdown-red .el-dropdown-menu__item:hover {
  color: #ffffff !important;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark)) !important;
  transform: translateX(2px);
}

.density-dropdown-red .el-dropdown-menu__item .density-item {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
}

.density-dropdown-red .el-dropdown-menu__item .density-item.active {
  color: var(--brand-primary);
  font-weight: 700;
}

.density-dropdown-red .el-dropdown-menu__item:hover .density-item.active {
  color: #ffffff;
}

.column-setting-popper.el-popover.el-popper {
  padding: 0 !important;
  border-radius: 12px !important;
  box-shadow: 0 12px 36px rgba(var(--brand-rgb), 0.18), 0 0 0 1px rgba(var(--brand-rgb), 0.12) !important;
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
  background: var(--brand-primary-light);
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
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.fix-btn:hover {
  color: var(--brand-primary);
  background: #FEE2E2;
  transform: scale(1.1);
}

.fix-btn.active {
  color: #ffffff;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  box-shadow: 0 2px 6px rgba(var(--brand-rgb), 0.35);
}
</style>