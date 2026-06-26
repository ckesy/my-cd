<template>
  <div class="vehicle-archive">
    <!-- 搜索区域 -->
    <div class="search-bar">
      <div class="search-row">
        <el-select v-model="searchForm.org" placeholder="请选择所属机构" size="small" class="search-select" clearable>
          <el-option label="西马物流新能源车队" value="西马物流新能源车队" />
          <el-option label="其他机构" value="其他机构" />
        </el-select>
        <el-select v-model="searchForm.fuelType" placeholder="请选择燃料类型" size="small" class="search-select" clearable>
          <el-option label="全部" value="" />
          <el-option label="燃油车" value="燃油车" />
          <el-option label="燃气车" value="燃气车" />
          <el-option label="纯电动" value="纯电动" />
          <el-option label="氢燃料" value="氢燃料" />
        </el-select>
        <el-input v-model="searchForm.plate" placeholder="请输入车牌号" size="small" class="search-input" clearable />
        <el-input v-model="searchForm.vin" placeholder="请输入车架号" size="small" class="search-input" clearable />
        <el-button type="primary" size="small" class="search-btn" @click="handleSearch">搜索</el-button>
        <el-button size="small" @click="handleReset">重置</el-button>
        <el-button size="small" plain class="delete-btn" @click="toggleBatchDelete">
          {{ batchDeleteMode ? '取消' : '删除' }}
        </el-button>
        <el-button
          v-if="batchDeleteMode"
          type="danger"
          size="small"
          @click="confirmDelete"
          :disabled="selectedIds.length === 0"
        >
          确认删除 ({{ selectedIds.length }})
        </el-button>
        <el-button size="small" plain class="import-btn" @click="showImportDialog = true">导入</el-button>
        <el-button size="small" plain class="export-btn" @click="exportData">导出</el-button>
      </div>
    </div>

    <!-- 表格 -->
    <div class="table-wrapper">
      <el-table
        ref="tableRef"
        :data="tableData"
        border
        stripe
        style="width: 100%;"
        size="small"
        max-height="calc(100vh - 260px)"
        v-loading="loading"
        :cell-style="{ whiteSpace: 'nowrap' }"
        @selection-change="handleSelectionChange"
      >
        <el-table-column v-if="batchDeleteMode" type="selection" width="50" align="center" />
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
        <el-table-column label="操作" fixed="right" width="140" align="center">
          <template #default="{ row }">
            <el-button type="text" size="small" style="color: #c8102e;" @click="handleView(row)">查看</el-button>
            <el-button type="text" size="small" style="color: #c8102e;" @click="handleEdit(row)">编辑</el-button>
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
    <el-dialog
      v-model="showImportDialog"
      title="导入车辆档案"
      width="560px"
      destroy-on-close
    >
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

    <!-- 查看详情弹窗 -->
    <el-dialog
      v-model="detailDialogVisible"
      title="车辆详情"
      width="700px"
      class="vehicle-detail-dialog"
      destroy-on-close
      :show-close="false"
    >
      <div v-if="currentDetailRow" class="detail-content">
        <el-descriptions :column="2" border size="large" class="detail-descriptions">
          <el-descriptions-item label="车牌号">{{ currentDetailRow.plate || '--' }}</el-descriptions-item>
          <el-descriptions-item label="VIN码">{{ currentDetailRow.vin || '--' }}</el-descriptions-item>
          <el-descriptions-item label="车辆昵称">{{ currentDetailRow.nickname || '--' }}</el-descriptions-item>
          <el-descriptions-item label="所属机构组织">{{ currentDetailRow.org || '--' }}</el-descriptions-item>
          <el-descriptions-item label="绑定司机">{{ currentDetailRow.driver || '--' }}</el-descriptions-item>
          <el-descriptions-item label="燃料类型">{{ currentDetailRow.fuel_type || '--' }}</el-descriptions-item>
          <el-descriptions-item label="车辆类型">{{ currentDetailRow.vehicle_type || '--' }}</el-descriptions-item>
          <el-descriptions-item label="车辆用途">{{ currentDetailRow.usage || '--' }}</el-descriptions-item>
          <el-descriptions-item label="子母车">{{ currentDetailRow.sub_vehicle || '--' }}</el-descriptions-item>
          <el-descriptions-item label="关联挂车">{{ currentDetailRow.trailer || '--' }}</el-descriptions-item>
          <el-descriptions-item label="车辆购买日">{{ currentDetailRow.purchase_date || '--' }}</el-descriptions-item>
          <el-descriptions-item label="保险购买日">{{ currentDetailRow.insurance_date || '--' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatDateTime(currentDetailRow.created_at) }}</el-descriptions-item>
          <el-descriptions-item label="修改时间">{{ formatDateTime(currentDetailRow.updated_at) }}</el-descriptions-item>
        </el-descriptions>
      </div>
      <template #footer>
        <el-button class="detail-close-btn" @click="detailDialogVisible = false">关闭</el-button>
        <el-button type="primary" class="edit-save-btn" @click="openEditFromView">编辑</el-button>
      </template>
    </el-dialog>

    <!-- 编辑弹窗 -->
    <el-dialog
      v-model="editDialogVisible"
      title="编辑车辆信息"
      width="640px"
      class="vehicle-detail-dialog"
      destroy-on-close
      :show-close="false"
    >
      <div v-if="editFormData" class="detail-content">
        <el-form :model="editFormData" label-width="100px" size="default" class="edit-form">
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="车牌号">
                <el-input v-model="editFormData.plate" placeholder="请输入车牌号" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="VIN码">
                <el-input v-model="editFormData.vin" placeholder="请输入VIN码" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="车辆昵称">
                <el-input v-model="editFormData.nickname" placeholder="请输入车辆昵称" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="所属机构组织">
                <el-input v-model="editFormData.org" placeholder="请输入所属机构组织" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="绑定司机">
                <el-input v-model="editFormData.driver" placeholder="请输入绑定司机" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="燃料类型">
                <el-input v-model="editFormData.fuel_type" placeholder="请输入燃料类型" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="车辆类型">
                <el-input v-model="editFormData.vehicle_type" placeholder="请输入车辆类型" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="车辆用途">
                <el-input v-model="editFormData.usage" placeholder="请输入车辆用途" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="子母车">
                <el-input v-model="editFormData.sub_vehicle" placeholder="请输入子母车" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="关联挂车">
                <el-input v-model="editFormData.trailer" placeholder="请输入关联挂车" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="车辆购买日">
                <el-date-picker
                  v-model="editFormData.purchase_date"
                  type="date"
                  placeholder="选择日期"
                  value-format="YYYY-MM-DD"
                  style="width: 100%;"
                />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="保险购买日">
                <el-date-picker
                  v-model="editFormData.insurance_date"
                  type="date"
                  placeholder="选择日期"
                  value-format="YYYY-MM-DD"
                  style="width: 100%;"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="创建时间">
                <span>{{ formatDateTime(editFormData.created_at) }}</span>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="修改时间">
                <span>{{ formatDateTime(editFormData.updated_at) }}</span>
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
      </div>
      <template #footer>
        <el-button class="detail-close-btn" @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" class="edit-save-btn" @click="saveEdit" :loading="editSaving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox, ElLoading } from 'element-plus'
import { Upload } from '@element-plus/icons-vue'
import { supabase } from '@/utils/supabase'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import dayjs from 'dayjs'

const formatDateTime = (dateStr) => {
  if (!dateStr) return '--'
  return dayjs(dateStr).format('YYYY-MM-DD HH:mm:ss')
}

// ---------- 缓存 ----------
const CACHE_KEY = 'vehicle_archive_cache'
const STATE_KEY = 'vehicle_archive_state'

const restoreState = () => {
  try {
    const saved = sessionStorage.getItem(STATE_KEY)
    if (saved) {
      const state = JSON.parse(saved)
      searchForm.org = state.org || ''
      searchForm.fuelType = state.fuelType || ''
      searchForm.plate = state.plate || ''
      searchForm.vin = state.vin || ''
      currentPage.value = state.currentPage || 1
      pageSize.value = state.pageSize || 20
      gotoPage.value = state.currentPage || 1
    }
  } catch (e) {}
}

const saveState = () => {
  const state = {
    org: searchForm.org,
    fuelType: searchForm.fuelType,
    plate: searchForm.plate,
    vin: searchForm.vin,
    currentPage: currentPage.value,
    pageSize: pageSize.value
  }
  sessionStorage.setItem(STATE_KEY, JSON.stringify(state))
}

const restoreData = () => {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY)
    if (cached) {
      const data = JSON.parse(cached)
      tableData.value = data.tableData || []
      total.value = data.total || 0
      return true
    }
  } catch (e) {}
  return false
}

const saveData = () => {
  const data = {
    tableData: tableData.value,
    total: total.value
  }
  sessionStorage.setItem(CACHE_KEY, JSON.stringify(data))
}

const searchForm = reactive({
  org: '',
  fuelType: '',
  plate: '',
  vin: '',
})

const tableData = ref([])
const total = ref(0)
const pageSize = ref(20)
const currentPage = ref(1)
const gotoPage = ref(1)
const loading = ref(false)
const totalPages = computed(() => Math.ceil(total.value / pageSize.value) || 1)

// ---------- 批量删除 ----------
const batchDeleteMode = ref(false)
const selectedIds = ref([])
const tableRef = ref(null)

const toggleBatchDelete = () => {
  if (batchDeleteMode.value) {
    batchDeleteMode.value = false
    selectedIds.value = []
  } else {
    batchDeleteMode.value = true
    selectedIds.value = []
  }
}

const handleSelectionChange = (selection) => {
  selectedIds.value = selection.map(row => row.id)
}

const confirmDelete = async () => {
  if (selectedIds.value.length === 0) return
  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedIds.value.length} 条车辆档案吗？此操作不可恢复！`,
      '删除确认',
      {
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    const loadingInstance = ElLoading.service({
      fullscreen: true,
      text: `正在删除 ${selectedIds.value.length} 条数据...`,
      background: 'rgba(0, 0, 0, 0.7)'
    })
    try {
      const { error } = await supabase
        .from('vehicles')
        .delete()
        .in('id', selectedIds.value)
      if (error) throw error
      ElMessage.success(`成功删除 ${selectedIds.value.length} 条数据`)
      batchDeleteMode.value = false
      selectedIds.value = []
      await fetchVehicles()
    } finally {
      loadingInstance.close()
    }
  } catch (err) {
    if (err === 'cancel') return
    ElMessage.error('删除失败：' + err.message)
  }
}

watch(
  () => tableData.value,
  () => {
    if (batchDeleteMode.value) {
      nextTick(() => {
        if (tableRef.value) {
          tableRef.value.clearSelection()
        }
        selectedIds.value = []
      })
    }
  },
  { deep: true }
)

// ---------- 查看详情 ----------
const detailDialogVisible = ref(false)
const currentDetailRow = ref(null)

const handleView = (row) => {
  currentDetailRow.value = row
  detailDialogVisible.value = true
}

// ---------- 编辑 ----------
const editDialogVisible = ref(false)
const editFormData = ref(null)
const editSaving = ref(false)

const handleEdit = (row) => {
  editFormData.value = JSON.parse(JSON.stringify(row))
  editDialogVisible.value = true
}

const openEditFromView = () => {
  if (currentDetailRow.value) {
    editFormData.value = JSON.parse(JSON.stringify(currentDetailRow.value))
    editDialogVisible.value = true
    detailDialogVisible.value = false
  }
}

const saveEdit = async () => {
  if (!editFormData.value) return
  editSaving.value = true
  try {
    const { id, created_at, updated_at, ...updateFields } = editFormData.value
    const { error } = await supabase
      .from('vehicles')
      .update({
        ...updateFields,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
    if (error) throw error

    ElMessage.success('更新成功')
    editDialogVisible.value = false
    await fetchVehicles()
  } catch (err) {
    ElMessage.error('更新失败：' + err.message)
  } finally {
    editSaving.value = false
  }
}

// ---------- 导出 ----------
const exportData = async () => {
  const loadingInstance = ElLoading.service({
    fullscreen: true,
    text: '正在导出数据...',
    background: 'rgba(0, 0, 0, 0.7)'
  })
  try {
    // 构建查询（遵循当前筛选条件）
    let query = supabase
      .from('vehicles')
      .select('*')
      .order('updated_at', { ascending: false })

    if (searchForm.org) query = query.eq('org', searchForm.org)
    if (searchForm.fuelType) query = query.eq('fuel_type', searchForm.fuelType)
    if (searchForm.plate) query = query.ilike('plate', `%${searchForm.plate}%`)
    if (searchForm.vin) query = query.ilike('vin', `%${searchForm.vin}%`)

    const { data, error } = await query
    if (error) throw error

    if (!data || data.length === 0) {
      ElMessage.warning('没有数据可导出')
      return
    }

    // 创建工作簿
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('车辆档案')

    // 表头
    const headers = [
      '车牌号', 'VIN码', '车辆昵称', '所属机构组织', '绑定司机',
      '燃料类型', '车辆类型', '车辆用途', '子母车', '关联挂车',
      '车辆购买日', '保险购买日', '创建时间', '修改时间'
    ]

    const headerRow = worksheet.addRow(headers)
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

    // 数据行
    data.forEach(row => {
      const rowData = [
        row.plate || '',
        row.vin || '',
        row.nickname || '',
        row.org || '',
        row.driver || '',
        row.fuel_type || '',
        row.vehicle_type || '',
        row.usage || '',
        row.sub_vehicle || '',
        row.trailer || '',
        row.purchase_date || '',
        row.insurance_date || '',
        formatDateTime(row.created_at),
        formatDateTime(row.updated_at)
      ]
      const dataRow = worksheet.addRow(rowData)
      dataRow.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
        }
        cell.alignment = { horizontal: 'left', vertical: 'middle' }
      })
    })

    // 设置列宽
    worksheet.columns = headers.map(() => ({ width: 18 }))

    // 生成并下载
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `车辆档案_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(link.href)

    ElMessage.success(`成功导出 ${data.length} 条数据`)
  } catch (err) {
    ElMessage.error('导出失败：' + err.message)
  } finally {
    loadingInstance.close()
  }
}

// ---------- 获取数据 ----------
const fetchVehicles = async () => {
  loading.value = true
  try {
    let query = supabase
      .from('vehicles')
      .select('*', { count: 'exact' })

    if (searchForm.org) query = query.eq('org', searchForm.org)
    if (searchForm.fuelType) query = query.eq('fuel_type', searchForm.fuelType)
    if (searchForm.plate) query = query.ilike('plate', `%${searchForm.plate}%`)
    if (searchForm.vin) query = query.ilike('vin', `%${searchForm.vin}%`)

    const from = (currentPage.value - 1) * pageSize.value
    const to = from + pageSize.value - 1

    const { data, error, count } = await query
      .order('updated_at', { ascending: false })
      .range(from, to)

    if (error) throw error
    tableData.value = data || []
    total.value = count || 0
    saveData()
    saveState()
  } catch (err) {
    ElMessage.error('加载数据失败：' + err.message)
  } finally {
    loading.value = false
  }
}

const refreshData = () => {
  if (currentPage.value !== 1) {
    currentPage.value = 1
    gotoPage.value = 1
  }
  fetchVehicles()
}

const handleSearch = () => {
  refreshData()
}

const handleReset = () => {
  searchForm.org = ''
  searchForm.fuelType = ''
  searchForm.plate = ''
  searchForm.vin = ''
  currentPage.value = 1
  gotoPage.value = 1
  refreshData()
}

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

    ElMessage.success(`校验通过，共 ${validData.length} 条有效数据，即将导入`)

    const existingPlates = new Set()
    const { data: existingData } = await supabase
      .from('vehicles')
      .select('plate')
      .in('plate', validData.map(v => v.plate))
    if (existingData) {
      existingData.forEach(item => existingPlates.add(item.plate))
    }

    const updateData = []
    const insertData = []
    validData.forEach(item => {
      if (existingPlates.has(item.plate)) {
        updateData.push(item)
      } else {
        insertData.push(item)
      }
    })

    for (const item of updateData) {
      const { error } = await supabase
        .from('vehicles')
        .update(item)
        .eq('plate', item.plate)
      if (error) throw error
    }

    if (insertData.length > 0) {
      const { error } = await supabase.from('vehicles').insert(insertData)
      if (error) throw error
    }

    ElMessage.success(`导入完成：更新 ${updateData.length} 条，新增 ${insertData.length} 条`)
    showImportDialog.value = false
    uploadFile.value = null
    uploadFileName.value = ''
    importErrors.value = []
    refreshData()
  } catch (err) {
    ElMessage.error('导入失败：' + err.message)
  } finally {
    importing.value = false
  }
}

watch(
  () => [searchForm.org, searchForm.fuelType, searchForm.plate, searchForm.vin, currentPage.value, pageSize.value],
  () => {
    saveState()
  },
  { deep: true }
)

onMounted(() => {
  restoreState()
  const hasCache = restoreData()
  if (!hasCache) {
    fetchVehicles()
  }
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
.delete-btn {
  border-color: #c8102e;
  color: #c8102e;
}
.delete-btn:hover {
  background-color: #c8102e;
  color: #fff;
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

/* ===== 查看/编辑弹窗通用样式 ===== */
:deep(.vehicle-detail-dialog .el-dialog) {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}
:deep(.vehicle-detail-dialog .el-dialog__header) {
  background: #ffffff;
  padding: 16px 24px;
  margin: 0;
  border-bottom: 2px solid #c8102e;
}
:deep(.vehicle-detail-dialog .el-dialog__title) {
  color: #c8102e;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-align: left;
}
:deep(.vehicle-detail-dialog .el-dialog__headerbtn) {
  display: none;
}
:deep(.vehicle-detail-dialog .el-dialog__body) {
  padding: 20px 24px;
  background: #ffffff;
}
:deep(.vehicle-detail-dialog .el-dialog__footer) {
  padding: 12px 24px 20px 24px;
  background: #fafafa;
  border-top: 1px solid #f0f0f0;
}
.detail-content {
  padding: 0;
}
.detail-descriptions :deep(.el-descriptions__label) {
  font-weight: 600;
  color: #333;
  background-color: #f9f9f9;
}
.detail-descriptions :deep(.el-descriptions__content) {
  color: #1a1a1a;
}

/* ===== 底部按钮 ===== */
.detail-close-btn {
  border-color: #c8102e;
  color: #c8102e;
  background: #ffffff;
  min-width: 80px;
}
.detail-close-btn:hover {
  background: #c8102e;
  color: #ffffff;
}
.edit-save-btn {
  background: #c8102e;
  color: #ffffff;
  border-color: #c8102e;
  min-width: 80px;
}
.edit-save-btn:hover {
  background: #a00d24;
  border-color: #a00d24;
}

/* ===== 编辑表单（两列布局） ===== */
.edit-form :deep(.el-form-item) {
  margin-bottom: 12px;
}
.edit-form :deep(.el-form-item__label) {
  font-weight: 500;
  color: #333;
}
.edit-form :deep(.el-input),
.edit-form :deep(.el-date-picker) {
  width: 100%;
}
</style>