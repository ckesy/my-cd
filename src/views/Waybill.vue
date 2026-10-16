<template>
  <div class="waybill-page">
    <!-- 筛选卡片（统计 + 搜索） -->
    <div class="filter-card fade-up">
      <!-- 统计胶囊 -->
      <div class="stats-tabs">
        <button
          v-for="(item, index) in stats"
          :key="index"
          class="stat-pill"
          :class="{ active: item.active }"
          @click="setActive(index)"
        >
          <span class="stat-label">{{ item.label }}</span>
          <span class="stat-count">{{ item.count }}</span>
        </button>
      </div>

      <!-- 搜索行 -->
      <div class="search-row">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          unlink-panels
          style="width: 240px"
        />
        <el-select v-model="searchForm.org" placeholder="所属机构" clearable style="width: 140px">
          <el-option label="机构A" value="A" />
          <el-option label="机构B" value="B" />
        </el-select>
        <el-select v-model="searchForm.source" placeholder="运单来源" clearable style="width: 130px">
          <el-option label="来源1" value="1" />
          <el-option label="来源2" value="2" />
        </el-select>
        <el-input v-model="searchForm.waybillNo" placeholder="运单编号" clearable style="width: 150px" />
        <el-input v-model="searchForm.receiveNo" placeholder="接单编号" clearable style="width: 150px" />
        <el-input v-model="searchForm.plate" placeholder="车牌号码" clearable style="width: 130px" />
        <el-input v-model="searchForm.driver" placeholder="司机姓名" clearable style="width: 120px" />

        <div class="search-btns">
          <el-button type="primary" class="btn-primary" @click="handleSearch">
            <el-icon><Search /></el-icon> 搜索
          </el-button>
          <el-button class="btn-outline" @click="handleReset">
            <el-icon><Refresh /></el-icon> 重置
          </el-button>
        </div>
      </div>
    </div>

    <!-- 表格卡片 -->
    <Teleport to="body" :disabled="!isTableFullscreen">
      <div class="table-card-wrap" :class="{ 'is-fullscreen': isTableFullscreen }">
        <div class="table-card">
          <!-- 工具栏 -->
          <div class="toolbar">
            <div class="toolbar-left">
              <span class="toolbar-bar"></span>
              <span class="toolbar-title">运单列表</span>
              <span class="toolbar-total">共 {{ total }} 条</span>
            </div>

            <div class="toolbar-right">
              <el-button class="btn-outline" @click="handleExport">
                <el-icon><Download /></el-icon> 导出
              </el-button>

              <!-- ⭐ 刷新 -->
              <button class="icon-btn" @click="handleRefresh" title="刷新">
                <el-icon><Refresh /></el-icon>
              </button>

              <!-- ⭐ 密度（滑块图标） -->
              <el-dropdown trigger="click" popper-class="density-dropdown-red" @command="handleDensityChange">
                <button class="icon-btn" title="表格密度">
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

              <!-- ⭐ 列设置（齿轮图标） -->
              <el-popover
                v-model:visible="columnPopoverVisible"
                placement="bottom-end"
                :width="280"
                trigger="click"
                popper-class="column-setting-popper"
              >
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
                        <button class="fix-btn" :class="{ active: col.fixed === 'left' }"
                          @click.stop="toggleFix(col, 'left')"><el-icon><DArrowLeft /></el-icon></button>
                        <button class="fix-btn" :class="{ active: col.fixed === 'right' }"
                          @click.stop="toggleFix(col, 'right')"><el-icon><DArrowRight /></el-icon></button>
                      </div>
                    </div>
                  </div>
                </div>
              </el-popover>

              <!-- ⭐ 全屏 -->
              <button class="icon-btn" @click="toggleTableFullscreen" :title="isTableFullscreen ? '退出全屏' : '全屏'">
                <el-icon><component :is="isTableFullscreen ? Close : FullScreen" /></el-icon>
              </button>

              <el-button type="primary" class="btn-primary" @click="router.push('/waybill/create')">
                <el-icon><Plus /></el-icon> 新建运单
              </el-button>
            </div>
          </div>

          <!-- 表格 -->
          <div class="table-wrap">
            <el-table
              :data="tableData"
              border
              stripe
              :size="tableSize"
              row-key="waybill_no"
              :row-class-name="getRowClassName"
              @expand-change="handleExpandChange"
              height="100%"
              class="custom-table"
            >
              <el-table-column type="expand" width="46">
                <template #default="{ row }">
                  <div v-if="getTotalItems(row.assignments) > 1" class="expand-content">
                    <!-- ⭐ 一单多司机/多车（分车承运）：每趟各自的份额与进度。
                         ⚠️ 明细**自带表头**，不再假装和外层表格的列对齐 ——
                            外层是 min-width 自适应列宽，用固定像素去凑永远对不齐。 -->
                    <div class="leg-table">
                      <div class="leg-table-head">
                        <span class="leg-table-title">分车承运</span>
                        <span class="leg-table-sub">
                          共 {{ legSummary(row).total }} 趟 · 已完成 {{ legSummary(row).done }} 趟<template
                            v-if="legSummary(row).running"
                          > · 执行中 {{ legSummary(row).running }} 趟</template><template
                            v-if="legSummary(row).rejected"
                          > · 待重新指派 {{ legSummary(row).rejected }} 趟</template>
                        </span>
                      </div>
                      <div class="leg-row leg-row-head">
                        <span>车辆 / 司机</span>
                        <span>角色</span>
                        <span>承运数量</span>
                        <span>状态</span>
                        <span>接单时间</span>
                        <span>完成时间</span>
                      </div>
                      <div v-for="(leg, idx) in legRows(row)" :key="idx" class="leg-row">
                        <span class="leg-name">{{ leg.vehicle || leg.target }}</span>
                        <span class="leg-role">{{ leg.methodLabel }}</span>
                        <span class="leg-qty">{{ leg.carryQuantity }}</span>
                        <span class="leg-status">
                          <el-tag size="small" :type="statusTagType(leg.status)" effect="light">{{ leg.status }}</el-tag>
                          <span v-if="leg.status === '待重新指派' && leg.rejectReason" class="leg-reject">
                            {{ leg.rejectReason }}
                          </span>
                        </span>
                        <span class="leg-time">{{ leg.acceptTime ? new Date(leg.acceptTime).toLocaleString() : '--' }}</span>
                        <span class="leg-time">{{ leg.finishTime ? new Date(leg.finishTime).toLocaleString() : '--' }}</span>
                      </div>
                    </div>
                  </div>
                  <div v-else class="expand-empty">（单一指派，无详情）</div>
                </template>
              </el-table-column>

              <template v-for="col in visibleColumns" :key="col.prop">
                <el-table-column v-if="col.prop === 'waybillNo'" :label="col.label"
                  :min-width="col.minWidth" :align="col.align" :fixed="col.fixed || false" show-overflow-tooltip>
                  <template #default="{ row }">
                    <div class="waybill-no-cell">
                      <div class="waybill-no">
                        {{ row.waybill_no }}
                        <!-- ⭐ 常驻任务：高辨识度徽标，并在整行左侧加色条 -->
                        <span v-if="row.is_recurring" class="recurring-badge"
                          :title="recurringTooltip(row)">常驻</span>
                      </div>
                      <div class="task-name">{{ row.task_name || '未命名任务' }}</div>
                    </div>
                  </template>
                </el-table-column>

                <el-table-column v-else-if="col.prop === 'status'" prop="status" :label="col.label"
                  :min-width="col.minWidth" :align="col.align" :fixed="col.fixed || false">
                  <template #default="{ row }">
                    <el-tooltip
                      v-if="hasRejectInfo(row)"
                      :content="rejectTooltipText(row)"
                      placement="right"
                      effect="dark"
                      :show-after="200"
                    >
                      <span class="status-cell">
                        <el-tag :type="statusTagType(displayStatus(row))" size="small" effect="light">{{ displayStatus(row) }}</el-tag>
                        <span class="reject-reason">拒单：{{ row.reject_reason }}</span>
                      </span>
                    </el-tooltip>
                    <el-tag v-else :type="statusTagType(displayStatus(row))" size="small" effect="light">{{ displayStatus(row) }}</el-tag>
                  </template>
                </el-table-column>

                <el-table-column v-else-if="col.prop === 'pickupTime'" :label="col.label"
                  :min-width="col.minWidth" :align="col.align" :fixed="col.fixed || false">
                  <template #default="{ row }">
                    <span class="time-text">{{ row.pickup_time ? new Date(row.pickup_time).toLocaleString() : '未设置' }}</span>
                  </template>
                </el-table-column>

                <el-table-column v-else-if="col.prop === 'planTime'" :label="col.label"
                  :min-width="col.minWidth" :align="col.align" :fixed="col.fixed || false">
                  <template #default="{ row }">
                    <span class="time-text">{{ row.plan_time ? new Date(row.plan_time).toLocaleString() : '未设置' }}</span>
                  </template>
                </el-table-column>

                <el-table-column v-else-if="col.prop === 'quantity'" :label="col.label"
                  :min-width="col.minWidth" :align="col.align" :fixed="col.fixed || false">
                  <template #default="{ row }">{{ row.quantity || 0 }}</template>
                </el-table-column>

                <el-table-column v-else-if="col.prop === 'freight'" :label="col.label"
                  :min-width="col.minWidth" :align="col.align" :fixed="col.fixed || false">
                  <template #default="{ row }">
                    <span class="freight-text">¥{{ row.freight || 0 }}</span>
                  </template>
                </el-table-column>

                <el-table-column v-else-if="col.prop === 'vehicle'" :label="col.label"
                  :min-width="col.minWidth" :align="col.align" :fixed="col.fixed || false" show-overflow-tooltip>
                  <template #default="{ row }">
                    <!-- ⭐ 子母车：把每一趟的车列出来（≤2 辆显示全名） -->
                    <span v-if="isMultiLegRow(row)">{{ legVehicleText(row) || '--' }}</span>
                    <span v-else-if="getVehicleList(row.assignments).length === 1">{{ getVehicleList(row.assignments)[0] }}</span>
                    <span v-else-if="getVehicleList(row.assignments).length > 1" class="count-badge">
                      {{ getVehicleList(row.assignments).length }} 辆
                    </span>
                    <span v-else class="text-muted">--</span>
                  </template>
                </el-table-column>

                <el-table-column v-else-if="col.prop === 'driver'" :label="col.label"
                  :min-width="col.minWidth" :align="col.align" :fixed="col.fixed || false" show-overflow-tooltip>
                  <template #default="{ row }">
                    <!-- ⭐ 子母车：把每一趟的司机列出来（≤2 人显示全名） -->
                    <span v-if="isMultiLegRow(row)">{{ legDriverText(row) || '--' }}</span>
                    <span v-else-if="getDriverList(row.assignments).length === 1">{{ getDriverList(row.assignments)[0] }}</span>
                    <span v-else-if="getDriverList(row.assignments).length > 1" class="count-badge">
                      {{ getDriverList(row.assignments).length }} 人
                    </span>
                    <span v-else class="text-muted">--</span>
                  </template>
                </el-table-column>

                <el-table-column v-else-if="col.prop === 'carryQuantity'" :label="col.label"
                  :min-width="col.minWidth" :align="col.align" :fixed="col.fixed || false">
                  <template #default="{ row }">{{ getTotalCarryQuantity(row.assignments) }}</template>
                </el-table-column>

                <el-table-column v-else-if="col.prop === 'createTime'" :label="col.label"
                  :min-width="col.minWidth" :align="col.align" :fixed="col.fixed || false">
                  <template #default="{ row }">
                    <span class="time-text">{{ new Date(row.create_time).toLocaleString() }}</span>
                  </template>
                </el-table-column>

                <el-table-column v-else-if="col.prop === 'action'" :label="col.label"
                  :width="col.width || 100" :align="col.align" :fixed="col.fixed || false">
                  <template #default="{ row }">
                    <div class="action-cell">
                      <el-button type="text" class="action-btn action-view" @click="handleView(row)">
                        <el-icon><View /></el-icon> 查看
                      </el-button>
                      <!-- ⭐ 删除闸门：只有 待接单/已完成/已取消/待重新指派 能删，
                           其余状态（执行中的在途单）禁用并说明原因，避免误删导致在途数据断链 -->
                      <el-tooltip v-if="canDelete(row)" content="删除运单" placement="top" :show-after="300">
                        <el-button type="text" class="action-btn action-delete" @click="handleDelete(row)">
                          <el-icon><Delete /></el-icon> 删除
                        </el-button>
                      </el-tooltip>
                      <el-tooltip v-else :content="deleteBlockReason(row)" placement="top" :show-after="200">
                        <span class="action-btn action-delete-off">
                          <el-icon><Delete /></el-icon> 删除
                        </span>
                      </el-tooltip>
                    </div>
                  </template>
                </el-table-column>

                <el-table-column v-else :prop="col.prop" :label="col.label"
                  :min-width="col.minWidth" :align="col.align" :fixed="col.fixed || false" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span :class="row[col.prop] ? 'text-content' : 'text-muted'">
                      {{ row[col.prop] || '--' }}
                    </span>
                  </template>
                </el-table-column>
              </template>

              <template #empty>
                <div class="empty-state">
                  <el-icon class="empty-icon"><Van /></el-icon>
                  <p>暂无运单</p>
                  <span class="empty-tip">点击右上角「新建运单」创建第一条</span>
                </div>
              </template>
            </el-table>
          </div>

          <!-- 分页 -->
          <div class="pagination-wrapper">
            <span class="total-text">共 {{ total }} 条</span>
            <el-pagination
              background
              layout="sizes, prev, pager, next, jumper"
              :total="total"
              :page-size="pageSize"
              :page-sizes="[10, 20, 50, 100]"
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
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Search, Refresh, Download, Plus, Delete, View, Van,
  Operation, Setting, FullScreen, Close,
  Grid, Rank, DArrowLeft, DArrowRight,
} from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { supabase } from '@/utils/supabase'

const router = useRouter()

// ============================================================
// 数据隔离
// ============================================================
const currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('currentUser') || '{}') }
  catch { return {} }
})()
const isAdmin = currentUser.role === 'admin'
const isCustomer = !isAdmin
const isSubAccount = !!currentUser.isSubAccount
const myAccount = currentUser.masterAccount || currentUser.account || ''
const myPhone = currentUser.masterPhone || currentUser.phone || ''

// ⭐ 子账号机构信息
const myOrgName = ref(isSubAccount ? String(currentUser.orgName || '').trim() || null : null)
const myOrgLevel = ref(isSubAccount ? (Number(currentUser.orgLevel) || 1) : null)

const isRootOrgSubAccount = computed(() =>
  isSubAccount && Number(myOrgLevel.value) === 1
)
const needOrgFilter = computed(() =>
  isCustomer && isSubAccount && Number(myOrgLevel.value) >= 2
)

// 兜底反查
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
  } catch (e) {}
}

// ============================================================
// 统计标签
// ============================================================
const stats = ref([
  { label: '全部', count: 0, active: true },
  { label: '待接单', count: 0, active: false },
  { label: '待重新指派', count: 0, active: false },
  { label: '待装车', count: 0, active: false },
  { label: '装车中', count: 0, active: false },
  { label: '装车完成', count: 0, active: false },
  { label: '已发车', count: 0, active: false },
  { label: '已到达', count: 0, active: false },
  { label: '已完成', count: 0, active: false },
  { label: '已取消', count: 0, active: false },
])

const setActive = (index) => {
  stats.value.forEach((item, i) => { item.active = i === index })
  fetchData()
}

// ============================================================
// 搜索表单
// ============================================================
const searchForm = reactive({
  org: '',
  source: '',
  waybillNo: '',
  receiveNo: '',
  plate: '',
  driver: '',
})
const dateRange = ref([])

// ============================================================
// 表格数据
// ============================================================
const tableData = ref([])
const total = ref(0)
const pageSize = ref(10)
const currentPage = ref(1)

// ============================================================
// 密度
// ============================================================
const tableSize = ref('default')
const handleDensityChange = (cmd) => { tableSize.value = cmd }

// ============================================================
// 列设置
// ============================================================
const columnPopoverVisible = ref(false)

const DEFAULT_COLUMNS = [
  { prop: 'waybillNo', label: '运单编号 / 任务名称', visible: true, fixed: 'left', minWidth: 220, align: 'center' },
  { prop: 'status', label: '物流状态', visible: true, fixed: false, minWidth: 110, align: 'center' },
  { prop: 'pickup', label: '装货地', visible: true, fixed: false, minWidth: 110, align: 'center' },
  { prop: 'delivery', label: '卸货地', visible: true, fixed: false, minWidth: 110, align: 'center' },
  { prop: 'pickupTime', label: '计划装货时间', visible: true, fixed: false, minWidth: 160, align: 'center' },
  { prop: 'planTime', label: '计划送达时间', visible: true, fixed: false, minWidth: 160, align: 'center' },
  { prop: 'cargo', label: '货物名称', visible: true, fixed: false, minWidth: 110, align: 'center' },
  { prop: 'quantity', label: '货物数量', visible: true, fixed: false, minWidth: 100, align: 'center' },
  { prop: 'freight', label: '运费', visible: true, fixed: false, minWidth: 90, align: 'center' },
  { prop: 'vehicle', label: '承运车辆', visible: true, fixed: false, minWidth: 120, align: 'center' },
  { prop: 'driver', label: '承运司机', visible: true, fixed: false, minWidth: 120, align: 'center' },
  { prop: 'carryQuantity', label: '承运数量', visible: true, fixed: false, minWidth: 100, align: 'center' },
  { prop: 'receiveNo', label: '接单编号', visible: true, fixed: false, minWidth: 130, align: 'center' },
  { prop: 'source', label: '运单来源', visible: true, fixed: false, minWidth: 100, align: 'center' },
  { prop: 'createTime', label: '创建运单时间', visible: true, fixed: false, minWidth: 170, align: 'center' },
  { prop: 'action', label: '操作', visible: true, fixed: 'right', width: 130, align: 'center' },
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

// ============================================================
// 全屏
// ============================================================
const isTableFullscreen = ref(false)
const toggleTableFullscreen = () => { isTableFullscreen.value = !isTableFullscreen.value }
const onEscKeydown = (e) => {
  if (e.key === 'Escape' && isTableFullscreen.value) isTableFullscreen.value = false
}

// ============================================================
// 辅助函数
// ============================================================
const getTotalItems = (assignments) => {
  if (!assignments || !Array.isArray(assignments)) return 0
  let count = 0
  assignments.forEach(a => {
    if (a.items && Array.isArray(a.items)) count += a.items.length
  })
  return count
}

const flattenAssignments = (assignments) => {
  if (!assignments || !Array.isArray(assignments)) return []
  const result = []
  assignments.forEach(a => {
    const method = a.method || 'driver'
    const items = a.items || []
    items.forEach(item => {
      result.push({
        method,
        target: item.target || '未指定',
        carryQuantity: item.carryQuantity || 0,
        carryFreight: item.carryFreight || 0,
      })
    })
  })
  return result
}

const getVehicleList = (assignments) => {
  if (!assignments || !Array.isArray(assignments)) return []
  const list = []
  assignments.forEach(a => {
    if (a.method === 'vehicle' && a.items) {
      a.items.forEach(item => { if (item.target) list.push(item.target) })
    }
  })
  return list
}

const getDriverList = (assignments) => {
  if (!assignments || !Array.isArray(assignments)) return []
  const list = []
  assignments.forEach(a => {
    if (a.method === 'driver' && a.items) {
      a.items.forEach(item => { if (item.target) list.push(item.target) })
    }
  })
  return list
}

const getTotalCarryQuantity = (assignments) => {
  if (!assignments || !Array.isArray(assignments)) return 0
  let total = 0
  assignments.forEach(a => {
    if (a.items) {
      a.items.forEach(item => { total += (item.carryQuantity || 0) })
    }
  })
  return total
}

const getRowClassName = ({ row }) => {
  // ⭐ 常驻任务优先高亮：与普通运单在整行层面拉开区分度
  if (row && row.is_recurring) return 'is-recurring'
  if (getTotalItems(row.assignments) > 1) return 'has-multiple-assign'
  return ''
}

/* ⭐ 常驻任务提示文案 */
const recurringTooltip = (row) => {
  if (!row || !row.is_recurring) return ''
  const lines = ['常驻任务：' + (row.recurring_group_no || '--')]
  if (row.recurring_type === 'count') {
    lines.push('常驻方式：按接单次数（上限 ' + (Number(row.recurring_max_count) || 0) + ' 次）')
  } else {
    lines.push('常驻方式：按常驻时间')
    lines.push('生效时间：' + (row.recurring_start_time || '--') + ' ~ ' + (row.recurring_end_time || '--'))
  }
  lines.push('常驻状态：' + (row.recurring_status || '生效中'))
  lines.push('任务状态：' + displayStatus(row))
  return lines.join('\n')
}

/* ============================================================
   ⭐ 常驻任务的「任务级」物流状态（用户 2026-10-17 拍板）
   ------------------------------------------------------------
   一个常驻任务 = 一个 recurring_group_no = 组下若干趟运输记录。
   列表里每条常驻行原本显示的是**它自己那一条趟次**的状态，于是组主那条会一直挂着
   「待接单」—— 其实任务早就被司机接走、在跑了。
   口径：任务下**任意一趟被接过**（有接单时间 / 已进入执行）→ 任务就是「执行中」；
        已暂停 / 已结束优先显示。
   ============================================================ */
const REC_ACCEPTED_STATUSES = ['待装车', '装车中', '装车完成', '已发车', '已到达', '已完成']
/* { recurring_group_no: { status, accepted, tripCount } } */
const recTaskMap = ref({})

const loadRecurringTaskStatus = async (rows) => {
  const groups = [
    ...new Set(
      (rows || [])
        .filter((r) => r && r.is_recurring && r.recurring_group_no)
        .map((r) => r.recurring_group_no)
    ),
  ]
  if (!groups.length) {
    recTaskMap.value = {}
    return
  }
  try {
    let q = supabase
      .from('waybills')
      .select('recurring_group_no,status,accept_time,recurring_status')
      .in('recurring_group_no', groups)
    /* ⚠️ 这里只做 owner_account 隔离，**不要**叠 applyIsolation 的「机构指派」二次过滤：
       判定「这个任务有没有被接过」必须看到组内**全部**趟次，
       被机构条件筛掉几条会误判成「还没人接」。 */
    if (!isAdmin && myAccount) q = q.eq('owner_account', myAccount)
    const { data, error } = await q
    if (error) throw error
    const map = {}
    for (const g of groups) {
      const trips = (data || []).filter((t) => String(t.recurring_group_no) === String(g))
      const withStatus = trips.find((t) => String(t.recurring_status || '').trim())
      map[g] = {
        status: String((withStatus && withStatus.recurring_status) || '生效中').trim() || '生效中',
        accepted: trips.some(
          (t) =>
            !!t.accept_time ||
            REC_ACCEPTED_STATUSES.includes(String(t.status || '').trim())
        ),
        tripCount: trips.length,
      }
    }
    recTaskMap.value = map
  } catch (e) {
    console.warn('常驻任务状态加载失败：', e)
    recTaskMap.value = {}
  }
}

/* ============================================================
   ⭐ 子母车：一个任务派给多个司机 / 车辆，每人跑自己那一趟
   ------------------------------------------------------------
   · 每个人的状态与时间记在他**自己的指派项**上
     （`leg_status` / `leg_accept_time` / `leg_vehicle` / `leg_finish_time` …）；
   · 列表**一个任务一行**，状态列显示聚合：待接单 / 执行中 1/2 / 已完成 2/2；
   · 展开行里能看到每一趟的承运数量、状态、接单与完成时间。
   ⚠️ 这套判断与小程序三个云函数（waybill-list / waybill-action / waybill-detail）
      是同一口径，改一处要一起改。
   ============================================================ */
const LEG_TODO = '待接单'
const LEG_RUNNING = ['待装车', '装车中', '装车完成', '已发车', '已到达']

const legItems = (row) =>
  (row && row.assignments ? row.assignments : []).flatMap((a) =>
    (a.items || []).map((it) => ({ method: a.method, item: it }))
  )
/* 是不是「一单多司机/多车」：非常驻、没有车队指派、driver/vehicle 条目 ≥2 */
const isMultiLegRow = (row) => {
  if (!row || row.is_recurring) return false
  const items = legItems(row)
  if (items.length < 2) return false
  return items.every((x) => x.method === 'driver' || x.method === 'vehicle')
}
const legRows = (row) =>
  legItems(row).map(({ method, item }) => ({
    method,
    methodLabel: method === 'vehicle' ? '车辆' : method === 'driver' ? '司机' : '车队',
    target: String(item.target || '').trim() || '未指定',
    carryQuantity: Number(item.carryQuantity || 0),
    carryFreight: Number(item.carryFreight || 0),
    status: String(item.leg_status || '').trim() || LEG_TODO,
    vehicle:
      String(item.leg_vehicle || '').trim() ||
      (method === 'vehicle' ? String(item.target || '') : ''),
    acceptTime: item.leg_accept_time || null,
    finishTime: item.leg_finish_time || null,
    rejectReason: item.leg_reject_reason || '',
  }))
const legSummary = (row) => {
  const legs = legRows(row)
  return {
    legs,
    total: legs.length,
    done: legs.filter((l) => l.status === '已完成').length,
    running: legs.filter((l) => LEG_RUNNING.includes(l.status)).length,
    rejected: legs.filter((l) => l.status === '待重新指派').length,
  }
}
/* 承运车辆 / 承运司机列：子母车直接把每趟的车、人列出来（≤2 个显示全名） */
const legVehicleText = (row) => {
  const v = legRows(row).map((l) => l.vehicle).filter(Boolean)
  if (!v.length) return ''
  return v.length <= 2 ? v.join('、') : `${v.length} 辆`
}
const legDriverText = (row) => {
  const legs = legRows(row)
  const d = legs.filter((l) => l.method === 'driver').map((l) => l.target).filter(Boolean)
  if (d.length) return d.length <= 2 ? d.join('、') : `${d.length} 人`
  return legVehicleText(row)
}

/* 列表「物流状态」列实际显示什么 */
const displayStatus = (row) => {
  if (!row) return ''
  /* ⭐ 子母车：按趟聚合（执行中 1/2 = 2 趟里有 1 趟已完成） */
  if (isMultiLegRow(row)) {
    const s = legSummary(row)
    if (s.done === s.total) return `已完成 ${s.done}/${s.total}`
    if (s.done > 0 || s.running > 0) return `执行中 ${s.done}/${s.total}`
    return row.status || '待接单'
  }
  if (!row.is_recurring) return row.status
  const t = recTaskMap.value[row.recurring_group_no]
  if (t) {
    if (t.status === '已暂停') return '已暂停'
    if (t.status === '已结束') return '已结束'
    /* 还没开始跑的那条（组主 / 待重新指派）显示任务级状态：
       任务已经有人接了就不是「待接单」了 */
    if (t.accepted && (row.status === '待接单' || row.status === '待重新指派')) return '执行中'
  }
  return row.status
}

const handleExpandChange = (row, expandedRows) => { /* 保留 */ }

// ============================================================
// ⭐⭐ 数据隔离（含 org）
// ============================================================
const applyIsolation = (query) => {
  if (isAdmin) return query
  if (myAccount) {
    query = query.eq('owner_account', myAccount)
  }
  // ⭐ 二级机构子账号：只看「指派到本机构」的运单（assigned_orgs 含本机构名）
  //   兼容旧数据兜底：org 等于本机构名
  if (needOrgFilter.value && myOrgName.value) {
    query = query.or(`assigned_orgs.ilike.%${myOrgName.value}%,org.eq.${myOrgName.value}`)
  }
  return query
}
// ============================================================
// 数据获取
// ============================================================
const fetchData = async () => {
  try {
    let query = supabase
      .from('waybills')
      .select('*', { count: 'exact' })
      .order('create_time', { ascending: false })
      .range((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value - 1)

    query = applyIsolation(query)

    if (searchForm.waybillNo) query = query.ilike('waybill_no', '%' + searchForm.waybillNo + '%')
    if (searchForm.receiveNo) query = query.ilike('receive_no', '%' + searchForm.receiveNo + '%')
    if (searchForm.plate) query = query.ilike('vehicle', '%' + searchForm.plate + '%')
    if (searchForm.driver) query = query.ilike('driver', '%' + searchForm.driver + '%')
    if (searchForm.source) query = query.eq('source', searchForm.source)
    if (dateRange.value && dateRange.value.length === 2) {
      const start = dateRange.value[0]
      const end = dateRange.value[1]
      query = query.gte('create_time', start).lt('create_time', end + ' 23:59:59')
    }
    const activeStat = stats.value.find(s => s.active)
    if (activeStat && activeStat.label !== '全部') {
      query = query.eq('status', activeStat.label)
    }

    const { data, count, error } = await query
    if (error) throw error

    tableData.value = data || []
    total.value = count || 0
    /* ⭐ 常驻行的「物流状态」按**任务**算（有人接过就是执行中），见 loadRecurringTaskStatus */
    await loadRecurringTaskStatus(data || [])
    updateStats()
  } catch (err) {
    console.error('加载数据失败', err)
    ElMessage.error('加载数据失败：' + err.message)
  }
}

// ============================================================
// 更新统计（含隔离）
// ============================================================
const updateStats = async () => {
  try {
    const buildBase = () => {
  let q = supabase.from('waybills').select('*', { count: 'exact', head: true })
  if (isCustomer && myAccount) q = q.eq('owner_account', myAccount)
  if (needOrgFilter.value && myOrgName.value) {
    q = q.or(`assigned_orgs.ilike.%${myOrgName.value}%,org.eq.${myOrgName.value}`)
  }
  return q
}

    const { count: all } = await buildBase()

    const statuses = ['待接单', '待重新指派', '待装车', '装车中', '装车完成', '已发车', '已到达', '已完成', '已取消']
    const counts = {}
    for (const s of statuses) {
      const { count } = await buildBase().eq('status', s)
      counts[s] = count || 0
    }

    stats.value[0].count = all || 0
    // ⭐ 按 label 对齐而不是下标，避免以后增删状态时错位
    stats.value.forEach((item, i) => {
      if (i === 0) return
      item.count = counts[item.label] || 0
    })
  } catch (e) {
    console.warn('更新统计失败', e)
  }
}

// ============================================================
// 状态标签颜色
// ============================================================
const statusTagType = (status) => {
  const s = String(status || '').trim()
  const map = {
    '待接单': 'info', '待重新指派': 'danger', '待装车': 'warning', '装车中': 'primary',
    '装车完成': 'success', '已发车': 'success', '已到达': 'success', '已完成': 'success', '已取消': 'danger',
    /* ⭐ 常驻任务的任务级状态（见 displayStatus） */
    '执行中': 'primary', '已暂停': 'info', '已结束': 'info',
  }
  if (map[s]) return map[s]
  /* ⭐ 子母车的聚合状态带计数后缀（「执行中 1/2」「已完成 2/2」） */
  if (s.indexOf('执行中') === 0) return 'primary'
  if (s.indexOf('已完成') === 0) return 'success'
  return 'info'
}

/* ⭐ 拒单提示：仅在「待重新指派」且有拒单记录时展示 */
const hasRejectInfo = (row) =>
  row && row.status === '待重新指派' && !!String(row.reject_reason || '').trim()

const rejectTooltipText = (row) => {
  const lines = ['拒单原因：' + (row.reject_reason || '--')]
  if (row.reject_note) lines.push('补充说明：' + row.reject_note)
  if (row.reject_by) lines.push('拒单司机：' + row.reject_by)
  if (row.reject_time) {
    const t = new Date(row.reject_time)
    lines.push('拒单时间：' + (isNaN(t.getTime()) ? row.reject_time : t.toLocaleString()))
  }
  if (row.reject_count) lines.push('累计被拒：' + row.reject_count + ' 次')
  return lines.join('\n')
}

// ============================================================
// 搜索 / 重置 / 刷新
// ============================================================
const handleSearch = () => { currentPage.value = 1; fetchData() }
const handleReset = () => {
  Object.assign(searchForm, { org: '', source: '', waybillNo: '', receiveNo: '', plate: '', driver: '' })
  dateRange.value = []
  currentPage.value = 1
  fetchData()
}
const handleRefresh = async () => {
  await fetchData()
  ElMessage.success({ message: '已刷新', duration: 1200 })
}

// ============================================================
// 导出
// ============================================================
const handleExport = () => {
  if (!tableData.value.length) { ElMessage.warning('没有数据可导出'); return }
  const rows = tableData.value.map(r => ({
    '运单编号': r.waybill_no, '任务名称': r.task_name || '', '物流状态': r.status,
    '装货地': r.pickup, '卸货地': r.delivery,
    '计划装货时间': r.pickup_time || '', '计划送达时间': r.plan_time || '',
    '货物名称': r.cargo, '货物数量': r.quantity, '运费': r.freight,
    '承运车辆': r.vehicle || '', '承运司机': r.driver || '',
    '承运数量': r.carry_quantity || 0, '接单编号': r.receive_no || '',
    '运单来源': r.source || '', '创建时间': r.create_time || '',
    '拒单原因': r.reject_reason || '', '拒单补充说明': r.reject_note || '',
    '拒单司机': r.reject_by || '', '拒单时间': r.reject_time || '',
    '累计被拒': r.reject_count || 0,
  }))
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map(row => headers.map(h => {
      const v = row[h] == null ? '' : String(row[h])
      return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v
    }).join(','))
  ].join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `运单列表_${dayjs().format('YYYYMMDD_HHmmss')}.csv`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success(`已导出 ${rows.length} 条`)
}

// ============================================================
// 分页
// ============================================================
const handleSizeChange = (val) => { pageSize.value = val; currentPage.value = 1; fetchData() }
const handleCurrentChange = (val) => { currentPage.value = val; fetchData() }

// ============================================================
// 查看 / 删除
// ============================================================
const handleView = (row) => {
  router.push({ path: '/waybill/detail', query: { waybill_no: row.waybill_no } })
}

/* ⭐ 删除闸门（已拍板）
   只有下面 4 个状态允许删除，其余状态一律不给删：
     待接单   —— 还没派出去的，删了没有后遗症
     已完成   —— 运输闭环，允许清理
     已取消   —— 本来就是作废单
     待重新指派 —— 司机已拒单，等同作废
   ⚠️ 执行中的状态（待装车/装车中/装车完成/已发车/已到达）不能删：
      它们是「在途」记录，删掉会让小程序端的运单、司机占用闸门、
      围栏打卡与费用上报全部对不上号。 */
const DELETE_ALLOWED_STATUS = ['待接单', '已完成', '已取消', '待重新指派']
const canDelete = (row) =>
  DELETE_ALLOWED_STATUS.includes(String((row && row.status) || '').trim())
const deleteBlockReason = (row) => {
  const s = String((row && row.status) || '').trim() || '未知'
  return `「${s}」不能删除，只有 ${DELETE_ALLOWED_STATUS.join(' / ')} 状态下才允许删除`
}

const handleDelete = async (row) => {
  /* 模板上已经禁用，这里再守一道：防止别处复用 handleDelete 绕过闸门 */
  if (!canDelete(row)) {
    ElMessage.warning(deleteBlockReason(row))
    return
  }
  try {
    await ElMessageBox.confirm('确定删除运单 ' + row.waybill_no + ' 吗？', '提示', { type: 'warning' })
    let q = supabase.from('waybills').delete().eq('id', row.id)
if (isCustomer && myAccount) q = q.eq('owner_account', myAccount)
if (needOrgFilter.value && myOrgName.value) {
  q = q.or(`assigned_orgs.ilike.%${myOrgName.value}%,org.eq.${myOrgName.value}`)
}
    const { error } = await q
    if (error) throw error
    ElMessage.success('删除成功')
    fetchData()
  } catch (err) {
    if (err !== 'cancel') ElMessage.error('删除失败：' + err.message)
  }
}

// ============================================================
// 生命周期
// ============================================================
onMounted(async () => {
  document.addEventListener('keydown', onEscKeydown)
  if (isCustomer && isSubAccount) await loadMyOrgInfo()
  fetchData()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onEscKeydown)
})
</script>

<style scoped>
/* ============================================================
   页面布局
   ============================================================ */
.waybill-page {
  padding: 6px 16px 16px;
  background-color: #F8FAFC;
  height: calc(100vh - 101px);
  max-height: calc(100vh - 101px);
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 13px;
  color: #1E293B;
}

/* ========== 筛选卡片 ========== */
.filter-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  padding: 14px 16px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ========== 统计胶囊 ========== */
.stats-tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.stat-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px solid transparent;
  border-radius: 18px;
  background: #F1F5F9;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  color: #64748B;
  line-height: 1;
  white-space: nowrap;
}
.stat-pill:hover {
  background: #FEF2F2;
  color: #c8102e;
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(200, 16, 46, 0.08);
}
.stat-pill.active {
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #fff;
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.35);
}
.stat-pill.active:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(200, 16, 46, 0.45);
}
.stat-label {
  font-size: 12.5px;
  font-weight: 600;
}
.stat-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 16px;
  padding: 0 5px;
  border-radius: 8px;
  background: rgba(100, 116, 139, 0.12);
  font-size: 11px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
  color: #64748B;
  transition: all 0.25s;
  line-height: 1;
}
.stat-pill:hover .stat-count {
  background: rgba(200, 16, 46, 0.12);
  color: #c8102e;
}
.stat-pill.active .stat-count {
  background: rgba(255, 255, 255, 0.28);
  color: #fff;
}

/* ========== 搜索行 ========== */
.search-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid #F1F5F9;
}
.search-row :deep(.el-input__wrapper),
.search-row :deep(.el-select__wrapper) {
  border-radius: 8px !important;
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
.search-btns {
  display: flex;
  gap: 10px;
  margin-left: auto;
}

/* ========== 按钮 ========== */
:deep(.el-button) {
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  border-radius: 8px;
  font-weight: 600;
}
:deep(.el-button:hover) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.15);
}
:deep(.btn-primary) {
  background-color: #c8102e;
  border-color: #c8102e;
  color: #fff;
}
:deep(.btn-primary:hover) { background-color: #a00d24; border-color: #a00d24; }
:deep(.btn-outline) {
  border-color: #CBD5E1;
  color: #334155;
  background: #fff;
}
:deep(.btn-outline:hover) {
  border-color: #c8102e;
  color: #c8102e;
  background-color: #FEF2F2;
}

/* ========== 表格卡片 ========== */
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
  from { opacity: 0; }
  to { opacity: 1; }
}
.table-card-wrap.is-fullscreen .table-card {
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(200, 16, 46, 0.18);
}
.table-card {
  flex: 1;
  min-height: 0;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}

/* ========== 工具栏 ========== */
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
.toolbar-bar {
  width: 4px;
  height: 18px;
  border-radius: 2px;
  background: linear-gradient(180deg, #c8102e, #a00d24);
  box-shadow: 0 0 8px rgba(200, 16, 46, 0.35);
}
.toolbar-title {
  font-size: 15px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: 0.3px;
}
.toolbar-total {
  font-size: 12.5px;
  color: #94A3B8;
  font-weight: 500;
  padding-left: 8px;
  border-left: 1px solid #E2E8F0;
}
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-wrap: wrap;
}

/* ========== 图标按钮 ========== */
.icon-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #E2E8F0;
  background: #fff;
  border-radius: 8px;
  color: #64748B;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  padding: 0;
  font-family: inherit;
}
.icon-btn:hover {
  border-color: #c8102e;
  color: #c8102e;
  background: #FEF2F2;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.15);
}
.icon-btn:active { transform: translateY(0); }
.icon-btn.active {
  border-color: #c8102e;
  color: #fff;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.35);
}

/* ========== 表格 ========== */
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

:deep(.custom-table .el-table__row:hover td) {
  background: #FEF2F2 !important;
}
:deep(.custom-table .el-table__body tr.el-table__row--striped td.el-table__cell) {
  background: #FAFBFC;
}

/* 运单编号 cell */
.waybill-no-cell {
  text-align: left;
  padding-left: 8px;
}

/* ⭐ 状态 cell：待重新指派时附带拒单原因 */
.status-cell {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  cursor: help;
}
.reject-reason {
  font-size: 11px;
  color: #A32D2D;
  background: #FCEBEB;
  border: 1px solid #F7C1C1;
  border-radius: 4px;
  padding: 1px 6px;
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.waybill-no {
  font-weight: 700;
  color: #0F172A;
  font-family: 'Courier New', monospace;
  font-size: 13px;
}
.task-name {
  font-size: 11.5px;
  color: #64748B;
  margin-top: 2px;
}

.time-text {
  font-family: 'Courier New', Courier, monospace;
  font-size: 12px;
  color: #475569;
}
.freight-text {
  color: #c8102e;
  font-weight: 700;
  font-family: 'Courier New', monospace;
}
.count-badge {
  display: inline-block;
  padding: 2px 10px;
  background: #FEF2F2;
  color: #991B1B;
  border: 1px solid #FCA5A5;
  border-radius: 10px;
  font-weight: 700;
  font-size: 11.5px;
}
.text-content {
  color: #334155;
  font-size: 12.5px;
}
.text-muted {
  color: #CBD5E1;
  font-size: 12.5px;
}

/* 展开行 */
.expand-content {
  padding: 8px 0;
  background: #F8FAFC;
}
/* ⭐ 一单多司机/多车（分车承运）：展开明细**自带表头**，和外层表格的列解耦
   ⚠️ 别再用「固定像素的假列」去对齐外层表头：外层是 min-width 自适应列宽，凑不齐。 */
.leg-table {
  margin: 0 12px 4px 46px;
  border: 1px solid #e8edf3;
  border-radius: 8px;
  overflow: hidden;
  background: #ffffff;
}
.leg-table-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 12px;
  background: #fdf2f4;
}
.leg-table-title {
  font-size: 12px;
  font-weight: 700;
  color: #c8102e;
}
.leg-table-sub {
  font-size: 11.5px;
  color: #94a3b8;
}
.leg-row {
  display: grid;
  grid-template-columns: 180px 70px 90px 110px 160px 160px;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 12px;
  color: #475569;
  border-top: 1px solid #f1f5f9;
}
.leg-row-head {
  background: #f8fafc;
  color: #94a3b8;
}
.leg-name {
  font-weight: 600;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.leg-qty {
  font-weight: 700;
  color: #0f172a;
}
.leg-time {
  color: #64748b;
  font-variant-numeric: tabular-nums;
}
.leg-status {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.leg-reject {
  color: #a32d2d;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sub-row-wrapper {
  padding-left: 46px;
  overflow: hidden;
  width: 100%;
}
.sub-row {
  display: flex;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px dashed #E2E8F0;
  min-height: 32px;
  background: #F8FAFC;
}
.sub-row:last-child { border-bottom: none; }
.sub-cell {
  display: inline-block;
  padding: 0 4px;
  font-size: 12px;
  color: #555;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-sizing: border-box;
  flex-shrink: 0;
  text-align: center;
}
.expand-empty {
  padding: 12px 16px;
  color: #94A3B8;
  font-size: 12.5px;
  text-align: center;
}
:deep(.el-table__row:not(.has-multiple-assign) .el-table__expand-icon) {
  visibility: hidden;
}

/* ============================================================
   ⭐ 常驻任务高亮：左侧红色色条 + 淡红底 + 徽标，与普通运单强区分
   ============================================================ */
:deep(.el-table__row.is-recurring) {
  background: #FFFBF3;
}
:deep(.el-table__row.is-recurring td:first-child) {
  position: relative;
}
:deep(.el-table__row.is-recurring td:first-child::before) {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, #f5a623, #e08a00);
  
}
:deep(.el-table__row.is-recurring:hover > td.el-table__cell) {
  background: #FFF6E5 !important;
}
.recurring-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 700;
  line-height: 15px;
  color: #ffffff;
  background: linear-gradient(135deg, #f5a623, #e08a00);
  border-radius: 4px;
  vertical-align: middle;
  cursor: help;
  box-shadow: 0 1px 4px rgba(224, 138, 0, 0.35);
}

/* 操作按钮 */
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
.action-btn .el-icon { font-size: 12.5px; }
.action-view { color: #2563EB; }
.action-view:hover { color: #1D4ED8; background: #EFF6FF; }
.action-delete { color: #c8102e; }
.action-delete:hover { color: #7F1D1D; background: #FEF2F2; }
/* ⭐ 不允许删除的状态：灰掉 + 禁用光标，鼠标悬停出 tooltip 说明原因 */
.action-delete-off {
  color: #C0C4CC;
  cursor: not-allowed;
}
.action-delete-off:hover { color: #C0C4CC; background: transparent; }

/* 空状态 */
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
  animation: float 3s ease-in-out infinite;
}
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
.empty-state p {
  font-size: 14px;
  margin: 0;
  color: #334155;
  font-weight: 700;
}
.empty-tip {
  font-size: 12px;
  color: #94A3B8;
}

/* ========== 分页 ========== */
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
  color: #c8102e;
  transform: scale(1.08);
}
:deep(.custom-pagination .el-pager li.is-active) {
  background-color: #c8102e !important;
  color: #fff !important;
  box-shadow: 0 2px 6px rgba(200, 16, 46, 0.35);
}

/* ========== 全屏退出按钮 ========== */
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
.fs-fade-leave-active { transition: all 0.3s; }
.fs-fade-enter-from,
.fs-fade-leave-to { opacity: 0; transform: translateY(-10px); }

/* ========== 入场动画 ========== */
.fade-up {
  animation: fadeUp 0.5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
  opacity: 0;
  transform: translateY(20px);
}
@keyframes fadeUp {
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 900px) {
  .search-row { flex-direction: column; align-items: stretch; }
  .search-row :deep(.el-input),
  .search-row :deep(.el-select),
  .search-row :deep(.el-date-editor) { width: 100% !important; }
  .search-btns { margin-left: 0; }
  .toolbar { flex-direction: column; align-items: stretch; }
  .toolbar-right { justify-content: flex-end; }
}
</style>

<style>
/* 全局兜底：锁死滚动 */
html, body {
  height: 100%;
  overflow: hidden;
}

/* ========== 密度下拉 ========== */
.density-dropdown-red.el-dropdown__popper.el-popper {
  border: 2px solid #FFFFFF !important;
  box-shadow: 0 10px 32px rgba(200, 16, 46, 0.18), 0 0 0 1px rgba(200, 16, 46, 0.12) !important;
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

/* ========== 列设置弹层 ========== */
.column-setting-popper.el-popover.el-popper {
  border: 2px solid #FFFFFF !important;
  box-shadow: 0 10px 32px rgba(200, 16, 46, 0.18), 0 0 0 1px rgba(200, 16, 46, 0.12) !important;
  border-radius: 10px !important;
  overflow: hidden;
  background: #FFFFFF !important;
  padding: 0 !important;
}
.column-setting-popper .el-popover__title { display: none; }
.column-setting { padding: 0; background: #FFFFFF; }
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
.col-title .el-icon { color: #c8102e; font-size: 14px; }
.col-reset {
  font-size: 12.5px;
  color: #c8102e;
  cursor: pointer;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.25s;
}
.col-reset:hover { background: #FEE2E2; text-decoration: underline; }
.column-setting-body {
  max-height: 420px;
  overflow-y: auto;
  padding: 6px;
}
.column-setting-body::-webkit-scrollbar { width: 4px; }
.column-setting-body::-webkit-scrollbar-thumb { background: #FCA5A5; border-radius: 2px; }
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
.column-item:hover { background: #FEF2F2; }
.column-item.dragging { opacity: 0.4; }
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
.column-item:hover .drag-handle { color: #c8102e; }
.col-checkbox { flex: 1; font-size: 13px; }
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
.fix-actions { display: flex; gap: 2px; }
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