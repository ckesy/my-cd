<template>
  <div class="vehicle-archive">
    <!-- 搜索区域 -->
    <div class="search-bar">
      <div class="search-row">
        <el-select v-model="searchForm.org" placeholder="请选择所属机构" size="small" class="search-select">
          <el-option label="西马物流新能源车队" value="西马物流新能源车队" />
          <el-option label="其他机构" value="其他机构" />
        </el-select>
        <el-input v-model="searchForm.plate" placeholder="请输入车牌号" size="small" class="search-input" clearable />
        <el-input v-model="searchForm.vin" placeholder="请输入车架号" size="small" class="search-input" clearable />
        <el-button type="primary" size="small" class="search-btn" @click="handleSearch">搜索</el-button>
        <el-button size="small" @click="handleReset">重置</el-button>
        <el-button size="small" plain class="import-btn" @click="showImportDialog = true">导入</el-button>
        <el-button size="small" plain class="export-btn" @click="exportData">导出</el-button>
      </div>
    </div>

    <!-- 表格 -->
    <div class="table-wrapper">
      <el-table
        :data="tableData"
        border
        stripe
        style="width: 100%;"
        size="small"
        max-height="calc(100vh - 260px)"
        v-loading="loading"
        :cell-style="{ whiteSpace: 'nowrap' }"
      >
        <el-table-column prop="plate" label="车牌号" width="110" fixed show-overflow-tooltip />
        <el-table-column prop="vin" label="VIN码" width="180" show-overflow-tooltip />
        <el-table-column prop="nickname" label="车辆昵称" width="100" show-overflow-tooltip />
        <el-table-column prop="org" label="所属机构组织" width="120" show-overflow-tooltip />
        <el-table-column prop="driver" label="绑定司机" width="90" show-overflow-tooltip />
        <el-table-column prop="fuel_type" label="燃料类型" width="80" show-overflow-tooltip />
        <el-table-column prop="vehicle_type" label="车辆类型" width="80" show-overflow-tooltip />
        <el-table-column prop="usage" label="车辆用途" width="80" show-overflow-tooltip />
        <el-table-column prop="sub_vehicle" label="子母车" width="70" show-overflow-tooltip />
        <el-table-column prop="trailer" label="关联挂车" width="80" show-overflow-tooltip />
        <el-table-column prop="purchase_date" label="车辆购买日" width="100" show-overflow-tooltip />
        <el-table-column prop="insurance_date" label="保险购买日" width="100" show-overflow-tooltip />
        <el-table-column prop="created_at" label="创建时间" width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column prop="updated_at" label="修改时间" width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ formatDateTime(row.updated_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="140">
          <template #default>
            <el-button type="text" size="small" style="color: #c8102e;">编辑</el-button>
            <el-button type="text" size="small" style="color: #c8102e;">查看</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 分页 -->
    <div class="pagination-wrapper">
      <span class="total">共 {{ total }} 条</span>
      <el-pagination
        background
        layout="sizes, prev, pager, next"
        :total="total"
        :page-size="pageSize"
        :page-sizes="[20, 50, 100]"
        v-model:current-page="currentPage"
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
      />
      <span class="goto">
        前往
        <el-input-number
          v-model="gotoPage"
          :min="1"
          :max="Math.max(1, totalPages)"
          size="small"
          controls-position="right"
          @change="handleGotoPage"
        />
        页
      </span>
    </div>

    <!-- 导入弹窗 -->
    <el-dialog v-model="showImportDialog" title="导入车辆档案" width="560px" destroy-on-close>
      <div style="margin-bottom: 16px;">
        <el-button type="primary" plain size="small" @click="downloadTemplate">📥 下载导入模板</el-button>
        <span style="font-size:12px; color:#999; margin-left:12px;">支持 .csv / .xlsx</span>
      </div>
      <el-upload
        ref="uploadRef"
        action="#"
        :auto-upload="false"
        :on-change="handleFileChange"
        :on-remove="handleFileRemove"
        :limit="1"
        accept=".csv,.xlsx,.xls"
        drag
      >
        <div style="padding: 20px 0;">
          <el-icon><Upload /></el-icon>
          <div style="margin-top: 8px; font-size: 14px;">点击或拖拽上传文件</div>
        </div>
      </el-upload>
      <div v-if="uploadFileName" style="margin-top: 8px; font-size: 13px; color: #333;">
        已选文件：{{ uploadFileName }}
      </div>
      <div v-if="importErrors.length" style="margin-top: 8px; max-height: 150px; overflow-y: auto; background: #fef0f0; padding: 8px; border-radius: 4px; font-size: 12px; color: #c8102e;">
        <div v-for="(err, idx) in importErrors" :key="idx">{{ err }}</div>
      </div>
      <template #footer>
        <el-button @click="showImportDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmImport" :loading="importing">确认导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Upload } from '@element-plus/icons-vue'
import { supabase } from '@/utils/supabase'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import dayjs from 'dayjs'

// ---------- 时间格式化 ----------
const formatDateTime = (dateStr) => {
  if (!dateStr) return '--'
  return dayjs(dateStr).format('YYYY-MM-DD HH:mm:ss')
}

// ---------- 缓存键 ----------
const CACHE_KEY = 'vehicle_archive_cache'
const STATE_KEY = 'vehicle_archive_state'

// ---------- 从缓存恢复状态 ----------
const restoreState = () => {
  try {
    const saved = sessionStorage.getItem(STATE_KEY)
    if (saved) {
      const state = JSON.parse(saved)
      searchForm.org = state.org || ''
      searchForm.plate = state.plate || ''
      searchForm.vin = state.vin || ''
      currentPage.value = state.currentPage || 1
      pageSize.value = state.pageSize || 20
      gotoPage.value = state.currentPage || 1  // 恢复跳转输入框
    }
  } catch (e) {
    // 忽略解析错误
  }
}

// ---------- 保存状态到缓存 ----------
const saveState = () => {
  const state = {
    org: searchForm.org,
    plate: searchForm.plate,
    vin: searchForm.vin,
    currentPage: currentPage.value,
    pageSize: pageSize.value
  }
  sessionStorage.setItem(STATE_KEY, JSON.stringify(state))
}

// ---------- 从缓存恢复数据 ----------
const restoreData = () => {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY)
    if (cached) {
      const data = JSON.parse(cached)
      tableData.value = data.tableData || []
      total.value = data.total || 0
      return true
    }
  } catch (e) {
    // 忽略
  }
  return false
}

// ---------- 保存数据到缓存 ----------
const saveData = () => {
  const data = {
    tableData: tableData.value,
    total: total.value
  }
  sessionStorage.setItem(CACHE_KEY, JSON.stringify(data))
}

// ---------- 搜索表单 ----------
const searchForm = reactive({
  org: '',
  plate: '',
  vin: '',
})

// ---------- 表格数据 ----------
const tableData = ref([])
const total = ref(0)
const pageSize = ref(20)
const currentPage = ref(1)
const gotoPage = ref(1)
const loading = ref(false)

const totalPages = computed(() => Math.ceil(total.value / pageSize.value) || 1)

// ---------- 从 Supabase 获取数据 ----------
const fetchVehicles = async () => {
  loading.value = true
  try {
    let query = supabase
      .from('vehicles')
      .select('*', { count: 'exact' })

    if (searchForm.org) query = query.eq('org', searchForm.org)
    if (searchForm.plate) query = query.ilike('plate', `%${searchForm.plate}%`)
    if (searchForm.vin) query = query.ilike('vin', `%${searchForm.vin}%`)

    const from = (currentPage.value - 1) * pageSize.value
    const to = from + pageSize.value - 1

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error
    tableData.value = data || []
    total.value = count || 0

    // 保存数据到缓存
    saveData()
    // 保存状态到缓存
    saveState()
  } catch (err) {
    ElMessage.error('加载数据失败：' + err.message)
  } finally {
    loading.value = false
  }
}

// ---------- 主动刷新（搜索、重置、导入成功后调用） ----------
const refreshData = () => {
  // 重置到第一页（搜索时）
  if (currentPage.value !== 1) {
    currentPage.value = 1
    gotoPage.value = 1
  }
  fetchVehicles()
}

// ---------- 搜索 ----------
const handleSearch = () => {
  refreshData()
}

// ---------- 重置 ----------
const handleReset = () => {
  searchForm.org = ''
  searchForm.plate = ''
  searchForm.vin = ''
  currentPage.value = 1
  gotoPage.value = 1
  refreshData()
}

// ---------- 分页事件 ----------
const handleSizeChange = (val) => {
  pageSize.value = val
  currentPage.value = 1
  gotoPage.value = 1
  fetchVehicles()
}

const handleCurrentChange = (val) => {
  currentPage.value = val
  gotoPage.value = val
  fetchVehicles()
}

const handleGotoPage = (val) => {
  if (val >= 1 && val <= totalPages.value) {
    currentPage.value = val
    fetchVehicles()
  }
}

// ---------- 导出（占位） ----------
const exportData = () => {
  ElMessage.info('导出功能待开发')
}

// ---------- 导入 ----------
const showImportDialog = ref(false)
const uploadRef = ref(null)
const uploadFile = ref(null)
const uploadFileName = ref('')
const importErrors = ref([])
const importing = ref(false)

const templateHeaders = [
  '车牌号', 'VIN码', '车辆昵称',
  '燃料类型', '车辆类型', '车辆用途', '子母车', '关联挂车',
  '车辆购买日', '保险购买日'
]

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
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
    }
  })

  const sampleData = [
    '粤A12345', 'LGAX3AG59N9009177', '我的车',
    '纯电动', '', '快递快运', '否', '无',
    '2026-01-01', '2026-01-01'
  ]
  const dataRow = worksheet.addRow(sampleData)
  dataRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
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
  if (!uploadFile.value) {
    ElMessage.warning('请先选择文件')
    return
  }

  importing.value = true
  importErrors.value = []

  try {
    const file = uploadFile.value
    const fileExt = file.name.split('.').pop().toLowerCase()
    let rows = []

    if (fileExt === 'csv') {
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())
      if (lines.length < 2) {
        ElMessage.error('文件为空或格式不正确')
        return
      }
      const dataRows = lines.slice(1).map(line => line.split(',').map(cell => cell.trim()))
      rows = dataRows
    } else if (['xlsx', 'xls'].includes(fileExt)) {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1 })
      if (json.length < 2) {
        ElMessage.error('文件为空或格式不正确')
        return
      }
      rows = json.slice(1)
    } else {
      ElMessage.error('不支持的文件格式，请上传 .csv 或 .xlsx')
      return
    }

    const validData = []
    const errors = []

    rows.forEach((row, index) => {
      const rowNum = index + 2
      const [
        plate, vin, nickname,
        fuelType, vehicleType, usage, subVehicle, trailer,
        purchaseDate, insuranceDate
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
        org: '西马物流新能源车队',
        driver: null,
        fuel_type: fuelType || null,
        vehicle_type: vehicleType || null,
        usage: usage || null,
        sub_vehicle: subVehicle || null,
        trailer: trailer || null,
        purchase_date: purchaseDate || null,
        insurance_date: insuranceDate || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
    })

    if (errors.length) {
      importErrors.value = errors.slice(0, 20)
      ElMessage.error(`存在 ${errors.length} 条错误，请修正后重试`)
      importing.value = false
      return
    }

    if (validData.length === 0) {
      ElMessage.warning('没有有效数据可导入')
      importing.value = false
      return
    }

    const { data, error } = await supabase.from('vehicles').insert(validData)
    if (error) throw error

    ElMessage.success(`成功导入 ${validData.length} 条数据`)
    showImportDialog.value = false
    uploadFile.value = null
    uploadFileName.value = ''
    importErrors.value = []
    // 导入成功后刷新列表（会更新缓存）
    refreshData()
  } catch (err) {
    ElMessage.error('导入失败：' + err.message)
  } finally {
    importing.value = false
  }
}

// ---------- 监听状态变化，保存缓存 ----------
watch(
  () => [searchForm.org, searchForm.plate, searchForm.vin, currentPage.value, pageSize.value],
  () => {
    saveState()
  },
  { deep: true }
)

// ---------- 组件挂载 ----------
onMounted(() => {
  // 恢复状态（搜索条件、分页）
  restoreState()
  // 尝试恢复数据
  const hasCache = restoreData()
  if (!hasCache) {
    // 无缓存则首次加载
    fetchVehicles()
  }
  // 如果有缓存，直接使用缓存数据，不发起请求
})
</script>

<style scoped>
.vehicle-archive {
  padding: 0;
  background: #ffffff;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.search-bar {
  padding: 8px 20px;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
}
.search-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.search-select {
  width: 180px;
}
.search-input {
  width: 160px;
}
.search-btn {
  background-color: #c8102e;
  border-color: #c8102e;
  color: #fff;
}
.search-btn:hover {
  background-color: #a00d24;
  border-color: #a00d24;
}
.import-btn,
.export-btn {
  border-color: #c8102e;
  color: #c8102e;
}
.import-btn:hover,
.export-btn:hover {
  background-color: #c8102e;
  color: #fff;
}
.import-btn {
  margin-left: auto;
}

.table-wrapper {
  flex: 1;
  padding: 0 20px;
  overflow: hidden;
}
:deep(.el-table th.el-table__cell) {
  background-color: #fafafa;
  color: #333;
  font-weight: 600;
}
:deep(.el-table .cell) {
  font-size: 12px;
  white-space: nowrap;
}

.pagination-wrapper {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  padding: 8px 20px;
  border-top: 1px solid #f0f0f0;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.total {
  font-size: 13px;
  color: #555;
  margin-right: auto;
}
.goto {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #555;
}
.goto .el-input-number {
  width: 70px;
}
:deep(.el-pagination .btn-prev),
:deep(.el-pagination .btn-next) {
  color: #333;
}
:deep(.el-pagination .el-pager li.active) {
  background-color: #409eff;
  color: #fff;
}
:deep(.el-pagination .el-pager li:hover) {
  color: #c8102e;
}
</style>