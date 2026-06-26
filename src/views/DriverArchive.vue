<template>
  <div class="driver-archive">
    <!-- 搜索区域 -->
    <div class="search-bar">
      <div class="search-row">
        <el-select v-model="searchForm.org" placeholder="请选择所属机构" size="small" class="search-select" clearable>
          <el-option label="西马物流新能源车队" value="西马物流新能源车队" />
          <el-option label="其他机构" value="其他机构" />
        </el-select>
        <el-input v-model="searchForm.driverName" placeholder="请输入司机姓名" size="small" class="search-input" clearable />
        <el-input v-model="searchForm.phone" placeholder="请输入手机号" size="small" class="search-input" clearable />
        <el-button type="primary" size="small" class="search-btn" @click="handleSearch">搜索</el-button>
        <el-button size="small" @click="handleReset">重置</el-button>
        <el-button type="primary" size="small" class="search-btn" @click="handleAdd">新增</el-button>
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
        @selection-change="handleSelectionChange"
      >
        <el-table-column v-if="batchDeleteMode" type="selection" width="50" align="center" />
        <el-table-column prop="driver_name" label="司机姓名" min-width="110" fixed show-overflow-tooltip />
        <el-table-column prop="org" label="所属组织结构" min-width="120" show-overflow-tooltip />
        <el-table-column prop="gender" label="性别" min-width="70" show-overflow-tooltip />
        <el-table-column prop="age" label="年龄" min-width="60" show-overflow-tooltip />
        <el-table-column prop="license_type" label="驾照类型" min-width="90" show-overflow-tooltip />
        <el-table-column prop="phone" label="手机号" min-width="110" show-overflow-tooltip />
        <el-table-column prop="bound_vehicle" label="绑定车辆" min-width="110" show-overflow-tooltip />
        <el-table-column prop="updated_at" label="修改时间" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ formatDateTime(row.updated_at) }}</template>
        </el-table-column>
        <el-table-column prop="operator" label="操作人" min-width="80" show-overflow-tooltip />
        <el-table-column label="操作" fixed="right" width="220" align="center">
          <template #default="{ row }">
            <el-button type="text" size="small" style="color: #c8102e;" @click="handleBindVehicle(row)">绑定车辆</el-button>
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
    <el-dialog v-model="showImportDialog" title="导入司机档案" width="560px" destroy-on-close>
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
      title="司机详情"
      width="700px"
      class="vehicle-detail-dialog"
      destroy-on-close
      :show-close="false"
    >
      <div v-if="currentDetailRow" class="detail-content">
        <el-descriptions :column="1" border size="large" class="detail-descriptions">
          <el-descriptions-item label="司机姓名">{{ currentDetailRow.driver_name || '--' }}</el-descriptions-item>
          <el-descriptions-item label="所属组织结构">{{ currentDetailRow.org || '--' }}</el-descriptions-item>
          <el-descriptions-item label="性别">{{ currentDetailRow.gender || '--' }}</el-descriptions-item>
          <el-descriptions-item label="年龄">{{ currentDetailRow.age || '--' }}</el-descriptions-item>
          <el-descriptions-item label="驾照类型">{{ currentDetailRow.license_type || '--' }}</el-descriptions-item>
          <el-descriptions-item label="手机号">{{ currentDetailRow.phone || '--' }}</el-descriptions-item>
          <el-descriptions-item label="绑定车辆">{{ currentDetailRow.bound_vehicle || '--' }}</el-descriptions-item>
          <el-descriptions-item label="操作人">{{ currentDetailRow.operator || '--' }}</el-descriptions-item>
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
      title="编辑司机信息"
      width="640px"
      class="vehicle-detail-dialog"
      destroy-on-close
      :show-close="false"
    >
      <div v-if="editFormData" class="detail-content">
        <el-form :model="editFormData" label-width="100px" size="default" class="edit-form">
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="司机姓名">
                <el-input v-model="editFormData.driver_name" placeholder="请输入司机姓名" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="所属组织结构">
                <el-input v-model="editFormData.org" placeholder="请输入所属组织结构" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="性别">
                <el-input v-model="editFormData.gender" placeholder="请输入性别" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="年龄">
                <el-input-number v-model="editFormData.age" :min="0" controls-position="right" style="width:100%;" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="驾照类型">
                <el-input v-model="editFormData.license_type" placeholder="请输入驾照类型" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="手机号">
                <el-input v-model="editFormData.phone" placeholder="请输入手机号" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="绑定车辆">
                <el-input
                  v-model="editFormData.vehicleDisplay"
                  placeholder="点击输入框选择车辆"
                  readonly
                  clearable
                  @click="openVehicleSelect(editFormData, false)"
                  @clear="clearVehicleSelection(editFormData)"
                />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="操作人">
                <el-input v-model="editFormData.operator" placeholder="请输入操作人" />
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

    <!-- 新增司机弹窗 -->
    <el-dialog
      v-model="addDialogVisible"
      title="新增司机"
      width="640px"
      class="vehicle-detail-dialog"
      destroy-on-close
      :show-close="false"
    >
      <div class="detail-content">
        <el-form :model="addFormData" label-width="100px" size="default" class="edit-form">
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="司机姓名" required>
                <el-input v-model="addFormData.driver_name" placeholder="请输入司机姓名" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="所属组织结构">
                <el-input v-model="addFormData.org" placeholder="请输入所属组织结构" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="性别">
                <el-input v-model="addFormData.gender" placeholder="请输入性别" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="年龄">
                <el-input-number v-model="addFormData.age" :min="0" controls-position="right" style="width:100%;" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="驾照类型">
                <el-input v-model="addFormData.license_type" placeholder="请输入驾照类型" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="手机号" required>
                <el-input v-model="addFormData.phone" placeholder="请输入手机号" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="绑定车辆">
                <el-input
                  v-model="addFormData.vehicleDisplay"
                  placeholder="点击输入框选择车辆"
                  readonly
                  clearable
                  @click="openVehicleSelect(addFormData, false)"
                  @clear="clearVehicleSelection(addFormData)"
                />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="操作人">
                <el-input v-model="addFormData.operator" placeholder="请输入操作人" />
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
      </div>
      <template #footer>
        <el-button class="detail-close-btn" @click="addDialogVisible = false">取消</el-button>
        <el-button type="primary" class="edit-save-btn" @click="saveAdd" :loading="addSaving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 车辆选择对话框 -->
    <el-dialog
      v-model="vehicleSelectDialogVisible"
      title="选择绑定车辆"
      width="500px"
      class="vehicle-detail-dialog"
      destroy-on-close
      :show-close="false"
      append-to-body
    >
      <div style="margin-bottom: 12px; display: flex; gap: 12px; align-items: center;">
        <el-input
          v-model="vehicleSearchKeyword"
          placeholder="输入车牌号模糊搜索"
          clearable
          style="flex:1;"
          @input="filterVehicleList"
        />
        <el-button type="primary" size="small" @click="selectAllVehicles">全选</el-button>
        <el-button size="small" @click="clearAllVehicles">取消全选</el-button>
      </div>
      <div style="max-height: 300px; overflow-y: auto;">
        <el-checkbox-group v-model="selectedVehiclePlates" class="vehicle-checkbox-group">
          <div v-for="v in filteredVehicleList" :key="v.plate" style="padding: 4px 0;">
            <el-checkbox :label="v.plate">{{ v.plate }}</el-checkbox>
          </div>
        </el-checkbox-group>
        <div v-if="filteredVehicleList.length === 0" style="text-align:center; color:#999; padding:20px 0;">暂无车辆</div>
      </div>
      <template #footer>
        <el-button class="detail-close-btn" @click="vehicleSelectDialogVisible = false">取消</el-button>
        <el-button type="primary" class="edit-save-btn" @click="confirmVehicleSelect">确定</el-button>
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
const CACHE_KEY = 'driver_archive_cache'
const STATE_KEY = 'driver_archive_state'

const restoreState = () => {
  try {
    const saved = sessionStorage.getItem(STATE_KEY)
    if (saved) {
      const state = JSON.parse(saved)
      searchForm.org = state.org || ''
      searchForm.driverName = state.driverName || ''
      searchForm.phone = state.phone || ''
      currentPage.value = state.currentPage || 1
      pageSize.value = state.pageSize || 20
      gotoPage.value = state.currentPage || 1
    }
  } catch (e) {}
}

const saveState = () => {
  const state = {
    org: searchForm.org,
    driverName: searchForm.driverName,
    phone: searchForm.phone,
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

// ---------- 搜索表单 ----------
const searchForm = reactive({
  org: '',
  driverName: '',
  phone: '',
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
      `确定要删除选中的 ${selectedIds.value.length} 条司机档案吗？此操作不可恢复！`,
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
        .from('drivers')
        .delete()
        .in('id', selectedIds.value)
      if (error) throw error
      ElMessage.success(`成功删除 ${selectedIds.value.length} 条数据`)
      batchDeleteMode.value = false
      selectedIds.value = []
      await fetchDrivers()
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
  const data = JSON.parse(JSON.stringify(row))
  const plates = data.bound_vehicle ? data.bound_vehicle.split(',').map(s => s.trim()).filter(Boolean) : []
  data.vehicleDisplay = plates.length === 0 ? '' : plates.length <= 2 ? plates.join('；') : `已选 ${plates.length} 辆车`
  editFormData.value = data
  editDialogVisible.value = true
}

const openEditFromView = () => {
  if (currentDetailRow.value) {
    handleEdit(currentDetailRow.value)
    detailDialogVisible.value = false
  }
}

const saveEdit = async () => {
  if (!editFormData.value) return
  editSaving.value = true
  try {
    const { id, created_at, updated_at, vehicleDisplay, ...updateFields } = editFormData.value
    const { error } = await supabase
      .from('drivers')
      .update({
        ...updateFields,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
    if (error) throw error

    ElMessage.success('更新成功')
    editDialogVisible.value = false
    await fetchDrivers()
    // 同步车辆档案
    await syncVehicleBoundDriver()
  } catch (err) {
    ElMessage.error('更新失败：' + err.message)
  } finally {
    editSaving.value = false
  }
}

// ---------- 新增 ----------
const addDialogVisible = ref(false)
const addFormData = reactive({
  driver_name: '',
  org: '',
  gender: '',
  age: null,
  license_type: '',
  phone: '',
  bound_vehicle: '',
  vehicleDisplay: '',
  operator: '管理员'
})
const addSaving = ref(false)

const handleAdd = () => {
  Object.assign(addFormData, {
    driver_name: '',
    org: '',
    gender: '',
    age: null,
    license_type: '',
    phone: '',
    bound_vehicle: '',
    vehicleDisplay: '',
    operator: '管理员'
  })
  addDialogVisible.value = true
}

// ---------- 车辆选择通用逻辑（已选车辆优先展示） ----------
const vehicleSelectDialogVisible = ref(false)
const vehicleList = ref([])
const filteredVehicleList = ref([])
const vehicleSearchKeyword = ref('')
const selectedVehiclePlates = ref([])
const vehicleTarget = ref(null)
const isBindingMode = ref(false)

// 排序函数：已选车牌排前面
const sortVehiclesBySelected = (list) => {
  const selected = selectedVehiclePlates.value
  return [...list].sort((a, b) => {
    const aSelected = selected.includes(a.plate)
    const bSelected = selected.includes(b.plate)
    if (aSelected && !bSelected) return -1
    if (!aSelected && bSelected) return 1
    return 0
  })
}

const openVehicleSelect = (target, binding = false) => {
  if (!target) return
  vehicleTarget.value = target
  isBindingMode.value = binding

  // 加载车辆列表（仅首次）
  if (vehicleList.value.length === 0) {
    supabase.from('vehicles').select('plate')
      .then(({ data, error }) => {
        if (!error) {
          vehicleList.value = data || []
          filteredVehicleList.value = sortVehiclesBySelected(vehicleList.value)
        } else {
          ElMessage.error('加载车辆列表失败')
        }
      })
      .catch(() => {})
  } else {
    filteredVehicleList.value = sortVehiclesBySelected(vehicleList.value)
  }

  // 设置当前已选
  const bound = target.bound_vehicle || ''
  selectedVehiclePlates.value = bound ? bound.split(',').map(s => s.trim()).filter(Boolean) : []
  vehicleSearchKeyword.value = ''
  vehicleSelectDialogVisible.value = true
}

const filterVehicleList = () => {
  if (!vehicleSearchKeyword.value) {
    filteredVehicleList.value = sortVehiclesBySelected(vehicleList.value)
  } else {
    const keyword = vehicleSearchKeyword.value.trim().toLowerCase()
    const matched = vehicleList.value.filter(v => v.plate.toLowerCase().includes(keyword))
    filteredVehicleList.value = sortVehiclesBySelected(matched)
  }
}

const selectAllVehicles = () => {
  const allPlates = filteredVehicleList.value.map(v => v.plate)
  selectedVehiclePlates.value = [...new Set([...selectedVehiclePlates.value, ...allPlates])]
}

const clearAllVehicles = () => {
  const allPlates = filteredVehicleList.value.map(v => v.plate)
  selectedVehiclePlates.value = selectedVehiclePlates.value.filter(p => !allPlates.includes(p))
}

const confirmVehicleSelect = async () => {
  const plates = selectedVehiclePlates.value
  const target = vehicleTarget.value
  if (!target) return

  target.bound_vehicle = plates.join(',')
  if (plates.length === 0) {
    target.vehicleDisplay = ''
  } else if (plates.length <= 2) {
    target.vehicleDisplay = plates.join('；')
  } else {
    target.vehicleDisplay = `已选 ${plates.length} 辆车`
  }

  if (isBindingMode.value) {
    const id = target.id
    if (!id) {
      ElMessage.error('数据异常，无法更新')
      vehicleSelectDialogVisible.value = false
      return
    }
    try {
      const { error } = await supabase
        .from('drivers')
        .update({ bound_vehicle: target.bound_vehicle, updated_at: new Date().toISOString() })
        .eq('id', id)
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

// 行内绑定车辆
const handleBindVehicle = (row) => {
  openVehicleSelect(row, true)
}

// ---------- 同步函数：根据司机绑定车辆更新车辆档案的 driver 字段 ----------
const syncVehicleBoundDriver = async () => {
  try {
    // 获取所有司机
    const { data: drivers, error } = await supabase.from('drivers').select('driver_name, bound_vehicle')
    if (error) throw error

    // 构建 车牌号 -> 司机姓名列表 的映射
    const plateToDrivers = {}
    drivers.forEach(d => {
      if (d.bound_vehicle) {
        const plates = d.bound_vehicle.split(',').map(s => s.trim()).filter(Boolean)
        plates.forEach(p => {
          if (!plateToDrivers[p]) plateToDrivers[p] = []
          plateToDrivers[p].push(d.driver_name)
        })
      }
    })

    // 更新车辆表的 driver 字段（注意列名是 driver）
    const updatePromises = []
    // 更新存在的车牌
    for (const plate of Object.keys(plateToDrivers)) {
      const boundDriverStr = plateToDrivers[plate].join(',')
      updatePromises.push(
        supabase.from('vehicles').update({ driver: boundDriverStr }).eq('plate', plate)
      )
    }
    // 查所有车辆，将不在映射中的车牌 driver 置空
    const { data: allVehicles } = await supabase.from('vehicles').select('plate')
    if (allVehicles) {
      allVehicles.forEach(v => {
        if (!plateToDrivers[v.plate]) {
          updatePromises.push(
            supabase.from('vehicles').update({ driver: '' }).eq('plate', v.plate)
          )
        }
      })
    }
    await Promise.all(updatePromises)
  } catch (err) {
    console.error('同步车辆绑定司机失败', err)
  }
}

// ---------- 保存新增 ----------
const saveAdd = async () => {
  if (!addFormData.driver_name || !addFormData.phone) {
    ElMessage.warning('司机姓名和手机号为必填项')
    return
  }
  addSaving.value = true
  try {
    const { data: existing, error: checkError } = await supabase
      .from('drivers')
      .select('phone')
      .eq('phone', addFormData.phone)
    if (checkError) throw checkError
    if (existing && existing.length > 0) {
      ElMessage.error(`手机号 ${addFormData.phone} 已存在，请勿重复添加`)
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
      updated_at: new Date().toISOString()
    }
    const { error } = await supabase.from('drivers').insert([insertData])
    if (error) throw error

    ElMessage.success('新增司机成功')
    addDialogVisible.value = false
    await fetchDrivers()
    await syncVehicleBoundDriver()
  } catch (err) {
    ElMessage.error('新增失败：' + err.message)
  } finally {
    addSaving.value = false
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
    let query = supabase
      .from('drivers')
      .select('*')
      .order('updated_at', { ascending: false })

    if (searchForm.org) query = query.eq('org', searchForm.org)
    if (searchForm.driverName) query = query.ilike('driver_name', `%${searchForm.driverName}%`)
    if (searchForm.phone) query = query.ilike('phone', `%${searchForm.phone}%`)

    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) {
      ElMessage.warning('没有数据可导出')
      return
    }

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('司机档案')

    const headers = [
      '司机姓名', '所属组织结构', '性别', '年龄', '驾照类型', '手机号',
      '绑定车辆', '操作人', '创建时间', '修改时间'
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

    data.forEach(row => {
      const rowData = [
        row.driver_name || '',
        row.org || '',
        row.gender || '',
        row.age || '',
        row.license_type || '',
        row.phone || '',
        row.bound_vehicle || '',
        row.operator || '',
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

    worksheet.columns = headers.map(() => ({ width: 18 }))

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `司机档案_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`
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

// ---------- 获取数据（按修改时间降序） ----------
const fetchDrivers = async () => {
  loading.value = true
  try {
    let query = supabase
      .from('drivers')
      .select('*', { count: 'exact' })
      .order('updated_at', { ascending: false })

    if (searchForm.org) query = query.eq('org', searchForm.org)
    if (searchForm.driverName) query = query.ilike('driver_name', `%${searchForm.driverName}%`)
    if (searchForm.phone) query = query.ilike('phone', `%${searchForm.phone}%`)

    const from = (currentPage.value - 1) * pageSize.value
    const to = from + pageSize.value - 1

    const { data, error, count } = await query
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
  fetchDrivers()
}

const handleSearch = () => {
  refreshData()
}

const handleReset = () => {
  searchForm.org = ''
  searchForm.driverName = ''
  searchForm.phone = ''
  currentPage.value = 1
  gotoPage.value = 1
  refreshData()
}

const handleSizeChange = (val) => {
  pageSize.value = val
  currentPage.value = 1
  gotoPage.value = 1
  fetchDrivers()
}

const handleCurrentChange = (val) => {
  currentPage.value = val
  gotoPage.value = val
  fetchDrivers()
}

const handleGotoPage = (val) => {
  if (val >= 1 && val <= totalPages.value) {
    currentPage.value = val
    fetchDrivers()
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
  '司机姓名', '所属组织结构', '性别', '年龄', '驾照类型', '手机号', '绑定车辆', '操作人'
]

const downloadTemplate = async () => {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('司机档案导入模板')

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
    '张三', '西马物流新能源车队', '男', '35', 'B2', '13800138000', '鄂A12345', '管理员'
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
  link.download = '司机档案导入模板.xlsx'
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
        driverName, org, gender, age, licenseType, phone, boundVehicle, operator
      ] = row.map(cell => (cell || '').toString().trim())

      const missing = []
      if (!driverName) missing.push('司机姓名')
      if (!phone) missing.push('手机号')

      if (missing.length) {
        errors.push(`第 ${rowNum} 行：缺少必填字段：${missing.join('、')}`)
        return
      }

      validData.push({
        driver_name: driverName,
        org: org || null,
        gender: gender || null,
        age: age ? parseInt(age) : null,
        license_type: licenseType || null,
        phone: phone || null,
        bound_vehicle: boundVehicle || null,
        operator: operator || '管理员',
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

    const existingPhones = new Set()
    const { data: existingData } = await supabase
      .from('drivers')
      .select('phone')
      .in('phone', validData.map(v => v.phone))
    if (existingData) {
      existingData.forEach(item => existingPhones.add(item.phone))
    }

    const updateData = []
    const insertData = []
    validData.forEach(item => {
      if (existingPhones.has(item.phone)) {
        updateData.push(item)
      } else {
        insertData.push(item)
      }
    })

    for (const item of updateData) {
      const { error } = await supabase
        .from('drivers')
        .update(item)
        .eq('phone', item.phone)
      if (error) throw error
    }

    if (insertData.length > 0) {
      const { error } = await supabase.from('drivers').insert(insertData)
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
  () => [searchForm.org, searchForm.driverName, searchForm.phone, currentPage.value, pageSize.value],
  () => {
    saveState()
  },
  { deep: true }
)

onMounted(() => {
  restoreState()
  const hasCache = restoreData()
  if (!hasCache) {
    fetchDrivers()
  }
})
</script>

<style scoped>
.driver-archive {
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

/* ===== 弹窗通用样式 ===== */
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
  white-space: nowrap;
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

/* ===== 表单 ===== */
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

/* ===== 车辆选择复选框列表 ===== */
.vehicle-checkbox-group {
  display: flex;
  flex-direction: column;
}
.vehicle-checkbox-group .el-checkbox {
  height: 32px;
}
</style>