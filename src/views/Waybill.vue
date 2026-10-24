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
          style="width: 230px"
        />
        <el-input v-model="searchForm.waybillNo" placeholder="运单编号" clearable style="width: 140px" />
        <!-- ⭐ 「发起人」= waybills.creator（谁建的这条运单） -->
        <el-input v-model="searchForm.creator" placeholder="发起人" clearable style="width: 110px" />
        <el-input v-model="searchForm.plate" placeholder="承运车辆" clearable style="width: 120px" />
        <el-input v-model="searchForm.driver" placeholder="司机姓名" clearable style="width: 110px" />

        <!-- ⭐ 待我审批：只看当前审批节点是我的上报（按运单汇总）
             ⚠️ 只在「业务流程 → 费用审批」开着时才出现；关掉审批就没有"待审"这回事 -->
        <button v-if="auditOn" class="mine-chip" :class="{ on: onlyMine }" @click="toggleMine">
          <el-icon><Bell /></el-icon>
          <span>待我审批</span>
          <span class="mine-n" :class="{ zero: !myPendingCount }">{{ myPendingCount }}</span>
        </button>

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

    <!-- ⭐ 待我审批筛选态：明确「现在看到的是子集」+ 一键清除 -->
    <div v-if="auditOn && onlyMine" class="mine-bar fade-up">
      <span class="mine-bar-ic"><el-icon><Bell /></el-icon></span>
      <span class="mine-bar-t">只看<b>待我审批</b>的运单 · 共 {{ myPendingCount }} 笔上报</span>
      <span class="mine-bar-x" @click="toggleMine">清除筛选</span>
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
              ref="tableRef"
              :data="tableData"
              border
              stripe
              :size="tableSize"
              row-key="waybill_no"
              :expand-row-keys="expandedKeys"
              :row-class-name="getRowClassName"
              @expand-change="handleExpandChange"
              height="100%"
              class="custom-table"
            >
              <!-- ⭐ 展开列只作为「明细挂载点」保留（1px 且被 CSS 隐藏）。
                   原来的 46px 独立列里只有一个方框箭头，白占一列还挡在编号和状态之间；
                   触发按钮已挪进「运单编号 / 任务名称」单元格（见 .leg-toggle）。 -->
              <el-table-column type="expand" width="1">
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
                      <!-- ⭐ 任务名称是主信息（用户 2026-10-19 拍板：名称比运单编号重要） -->
                      <div class="task-title">
                        {{ row.task_name || '未命名任务' }}
                        <!-- ⭐ 常驻任务：高辨识度徽标，并在整行左侧加色条 -->
                        <span v-if="row.is_recurring" class="recurring-badge"
                          :title="recurringTooltip(row)">常驻</span>
                        <!-- ⭐ 分车承运 · 展开入口（只有多趟的行才有）
                             挪进首行行尾：首列视线起点、不额外吃列宽，信息量比裸箭头大 -->
                        <button
                          v-if="getTotalItems(row.assignments) > 1"
                          class="leg-toggle"
                          :class="{ open: isExpanded(row) }"
                          :title="isExpanded(row) ? '收起分车明细' : `展开 ${legSummary(row).total} 趟分车明细`"
                          @click.stop="toggleLegs(row)"
                        >
                          <span class="leg-toggle-text">{{ legSummary(row).total }} 趟</span>
                          <el-icon class="leg-toggle-icon"><ArrowDown /></el-icon>
                        </button>
                      </div>
                      <!-- 编号：普通单显示运单号；**常驻任务的编号就是组号**（CZ…），
                           下面小字给「共 N 趟 · 最新第 M 趟」——司机跑的每一趟不算新运单（2026-10-24） -->
                      <div v-if="row.is_recurring" class="waybill-no">
                        <span class="rec-group-no">{{ row.recurring_group_no }}</span>
                        <span class="rec-trip-hint">
                          共 {{ recTripCount(row) }} 趟<template v-if="recLatestSeq(row)"> · 最新第 {{ recLatestSeq(row) }} 趟</template>
                        </span>
                      </div>
                      <div v-else class="waybill-no">{{ row.waybill_no }}</div>
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
                    <span class="time-text">{{ displayTimeText(row) }}</span>
                  </template>
                </el-table-column>

                <el-table-column v-else-if="col.prop === 'fee'" :label="col.label"
                  :min-width="col.minWidth" :align="col.align" :fixed="col.fixed || false">
                  <template #default="{ row }">
                    <div v-if="feeOf(row)" class="fee-cell">
                      <span class="fee-total">¥{{ feeOf(row).total.toFixed(2) }}</span>
                      <span v-if="auditOn && feeOf(row).mine" class="fee-badge is-mine" title="只看待我审批的运单" @click="showMine">待我审 {{ feeOf(row).mine }}</span>
                      <span v-else-if="auditOn && feeOf(row).pending" class="fee-badge">待审 {{ feeOf(row).pending }}</span>
                    </div>
                    <span v-else class="fee-none">—</span>
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
              :page-sizes="PAGE_SIZE_OPTIONS"
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
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Search, Refresh, Download, Plus, Delete, View, Van,
  Operation, Setting, FullScreen, Close,
  Grid, Rank, DArrowLeft, DArrowRight, Bell, ArrowDown,
} from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { supabase } from '@/utils/supabase'
import { canApproveReport as canApproveReportShared } from '@/utils/feeTodo'
import { approvalOn, ensureApprovalMode, currentUserForModules } from '@/utils/modules'

const router = useRouter()
const route = useRoute()

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
  /* 点了状态胶囊就退出「待我审批」，两个条件不叠加 */
  if (onlyMine.value) {
    onlyMine.value = false
    router.replace({ path: '/waybill', query: {} })
  }
  currentPage.value = 1
  fetchData()
}

// ============================================================
// 搜索表单
// ============================================================
const searchForm = reactive({
  waybillNo: '',
  creator: '',      // 发起人（waybills.creator）
  plate: '',        // 承运车辆（匹配 waybills.vehicle）
  driver: '',
})
const dateRange = ref([])

// ============================================================
// 表格数据
// ============================================================
const tableData = ref([])
const total = ref(0)
/* ⭐ 默认每页 20 条；可选 20 / 30 / 50（用户 2026-10-19 拍板） */
const PAGE_SIZE_OPTIONS = [20, 30, 50]
const pageSize = ref(20)
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
  { prop: 'waybillNo', label: '任务名称 / 运单编号', visible: true, fixed: 'left', minWidth: 220, align: 'center' },
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
  { prop: 'creator', label: '发起人', visible: true, fixed: false, minWidth: 100, align: 'center' },
  { prop: 'createTime', label: '创建运单时间', visible: true, fixed: false, minWidth: 170, align: 'center' },
  /* ⭐ 费用列放在最末，与操作列一起右侧固定，横向滚动时始终可见 */
  { prop: 'fee', label: '费用', visible: true, fixed: 'right', minWidth: 150, align: 'center' },
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
   ⭐ 常驻任务 = 一单（2026-10-24 19:17 定稿）
   ------------------------------------------------------------
   · 列表里一个 recurring_group_no 只占一行（组主 trip_seq=1）；
   · 司机接的每一趟不算新运单，只看详情页的「趟次」；
   · 但组主的 create_time 是"建任务那天"，所以时间列要显示**最新一趟**的下发时间，
     否则今天续派的一趟看起来还是昨天的。
   ============================================================ */
const REC_ACCEPTED_STATUSES = ['待装车', '装车中', '装车完成', '已发车', '已到达', '已完成']
const recTaskMap = ref({})

const loadRecurringTaskStatus = async (rows) => {
  const groups = [...new Set(
    (rows || [])
      .filter((r) => r && r.is_recurring && r.recurring_group_no)
      .map((r) => r.recurring_group_no)
  )]
  if (!groups.length) { recTaskMap.value = {}; return }
  try {
    let q = supabase
      .from('waybills')
      .select('recurring_group_no,status,accept_time,recurring_status,trip_seq,create_time,finish_time')
      .in('recurring_group_no', groups)
    if (!isAdmin && myAccount) q = q.eq('owner_account', myAccount)
    const { data, error } = await q
    if (error) throw error

    const map = {}
    for (const g of groups) {
      const trips = (data || []).filter((t) => String(t.recurring_group_no) === String(g))
      const withStatus = trips.find((t) => String(t.recurring_status || '').trim())
      const status = String((withStatus && withStatus.recurring_status) || '生效中').trim() || '生效中'
      const latest = trips
        .slice()
        .sort((a, b) => (Number(b.trip_seq) || 0) - (Number(a.trip_seq) || 0))[0]
      const lastFinishTime = trips.reduce(
        (m, t) => Math.max(m, t.finish_time ? new Date(t.finish_time).getTime() : 0),
        0
      )
      const liveTrips = trips.filter((t) => {
        const s = String(t.status || '').trim()
        return s === '待接单' || REC_ACCEPTED_STATUSES.includes(s)
      })
      map[g] = {
        status,
        accepted: trips.some(
          (t) => !!t.accept_time || REC_ACCEPTED_STATUSES.includes(String(t.status || '').trim())
        ),
        latestTime: (latest && latest.create_time) || '',
        latestSeq: Number((latest && latest.trip_seq) || 0),
        lastFinishTime,
        todoCount: trips.filter((t) => String(t.status || '').trim() === '待接单').length,
        liveCount: liveTrips.length,
        tripCount: trips.length,
      }
    }
    recTaskMap.value = map
  } catch (e) {
    console.warn('[运单列表] 常驻任务状态读取失败', e)
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

/* 列表「物流状态」列实际显示什么
   ⭐ 常驻是**一单**（一个组一行）→ 显示任务级状态（待接单 / 执行中 / 已暂停 / 已结束），
      组主那一趟自己的状态不代表任务。 */
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
    /* 组里只剩还没接的趟次（比如刚续派了一趟）→ 待接单 */
    if (t.todoCount && t.todoCount === t.liveCount) return '待接单'
    if (t.accepted) return '执行中'
    return '待接单'
  }
  return row.status
}

/* 发单时间：常驻行显示**组内最新一趟**的下发时刻（今天续派的一趟要能看出来）；
   已结束 / 已暂停的组显示最近完成时刻，跟着落到结束那天。 */
const displayTime = (row) => {
  if (row && row.is_recurring && row.recurring_group_no) {
    const t = recTaskMap.value[row.recurring_group_no]
    if (t && (t.status === '已结束' || t.status === '已暂停')) {
      return t.lastFinishTime ? new Date(t.lastFinishTime).toISOString() : row.create_time
    }
    if (t && t.latestTime) return t.latestTime
  }
  return (row && row.create_time) || ''
}
const displayTimeText = (row) => {
  const t = displayTime(row)
  if (!t) return '--'
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? '--' : d.toLocaleString()
}

/* 常驻任务：编号列显示组号 + 趟次规模（司机每跑一趟不单独算运单） */
const recTripCount = (row) => {
  const t = row && recTaskMap.value[row.recurring_group_no]
  return (t && t.tripCount) || 0
}
const recLatestSeq = (row) => {
  const t = row && recTaskMap.value[row.recurring_group_no]
  return (t && t.latestSeq) || 0
}

/* ⭐ 分车承运展开：按钮挪进编号行尾后，展开状态改由这里托管。
   Element 的 expand-change 在「点按钮 / 点行内其他入口」两种情况下都会触发，
   所以箭头方向永远和实际展开状态一致。 */
const tableRef = ref(null)
const expandedKeys = ref([])
const isExpanded = (row) => !!row && expandedKeys.value.includes(row.waybill_no)
const toggleLegs = (row) => {
  if (tableRef.value) tableRef.value.toggleRowExpansion(row)
}
const handleExpandChange = (row, expandedRows) => {
  expandedKeys.value = (expandedRows || []).map((r) => r.waybill_no)
}

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
// ⭐ 待我审批
//   取「审核中」的上报 → 按 flow/current_level 判断当前节点是不是我
//   → 拿 waybill_no 在**查询层**过滤（分页与 total 才准）
// ⚠️ 总闸是「业务流程 → 费用审批」开关（fee_approval_configs.mode）：
//    关掉审批后不存在"待审"这回事，入口不显示、也不去查库。
// ============================================================
const auditOn = computed(() => approvalOn.value)
const onlyMine = ref(route.query.mine === '1')
const myPendingCount = ref(0)

const fetchPendingMine = async () => {
  /* 审批关了：不查库、数字归零（历史"审核中"的单子也不再冒出入口） */
  if (!auditOn.value) {
    myPendingCount.value = 0
    return []
  }
  let q = supabase
    .from('reports')
    .select('id,waybill_no,type,amount,status,current_level,flow')
    .eq('status', '审核中')
  if (isCustomer && myAccount) q = q.eq('owner_account', myAccount)

  const { data, error } = await q
  if (error) throw error

  const hit = (data || []).filter(canApproveReport)
  myPendingCount.value = hit.length
  return [...new Set(hit.map((r) => r.waybill_no).filter(Boolean))]
}

const toggleMine = async () => {
  if (!auditOn.value) return
  onlyMine.value = !onlyMine.value
  /* 待我审批与状态胶囊互斥：开了就回到「全部」，免得两个条件交叉出空表 */
  if (onlyMine.value) stats.value.forEach((it, i) => { it.active = i === 0 })
  currentPage.value = 1
  /* 地址栏跟着变，从顶栏铃铛点进来 / 直接分享链接都能直达筛选态 */
  router.replace({ path: '/waybill', query: onlyMine.value ? { mine: '1' } : {} })
  await fetchData()
}

const showMine = () => { if (!onlyMine.value) toggleMine() }

/* 顶栏「待我审批」跳过来时（可能已经在本页）同步筛选态 */
watch(() => route.query.mine, (v) => {
  const on = v === '1'
  if (on === onlyMine.value) return
  onlyMine.value = on
  if (on) stats.value.forEach((it, i) => { it.active = i === 0 })
  currentPage.value = 1
  fetchData()
})

/* 审批开关被关掉（业务流程画布那边）→ 退出「待我审批」，否则会留一个空列表 */
watch(auditOn, (on) => {
  if (on || !onlyMine.value) return
  onlyMine.value = false
  router.replace({ path: '/waybill', query: {} })
  fetchData()
})

// ============================================================
// 数据获取
// ============================================================
const fetchData = async () => {
  try {    /* 待我审批命中哪些运单（顺带刷新胶囊上的数字） */
    let mineNos = null
    try {
      mineNos = await fetchPendingMine()
    } catch (e) {
      console.warn('[运单列表] 待审批数读取失败', e)
    }

    if (onlyMine.value && (!mineNos || !mineNos.length)) {
      tableData.value = []
      total.value = 0
      feeMap.value = {}
      updateStats()
      return
    }

    let query = supabase
      .from('waybills')
      .select('*', { count: 'exact' })
      .order('create_time', { ascending: false })
      .range((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value - 1)

    query = applyIsolation(query)

    /* 待我审批：只留命中的运单 */
    if (onlyMine.value && mineNos) query = query.in('waybill_no', mineNos)

    /* ⭐⭐ 2026-10-24 19:17 用户最终口径：
       「每一个常驻任务算一单，里面司机接的每一趟不算新的运单，都包含在这一个常驻运单内，
         但每一个常驻运单是独立的。」
       → 常驻按 recurring_group_no 聚合成一行（组主 trip_seq=1），趟次只在详情页看；
         组主行的时间/状态由 displayTime / displayStatus 换成"最新一趟 / 任务级"。
       ⚠️ 待我审批时不叠加（上报可能挂在某一趟上，会被整条滤掉）。 */
    if (!onlyMine.value) {
      query = query.or('is_recurring.is.null,is_recurring.eq.false,trip_seq.eq.1')
    }

    if (searchForm.waybillNo) query = query.ilike('waybill_no', '%' + searchForm.waybillNo + '%')
    if (searchForm.creator) query = query.ilike('creator', '%' + searchForm.creator + '%')
    if (searchForm.plate) query = query.ilike('vehicle', '%' + searchForm.plate + '%')
    if (searchForm.driver) query = query.ilike('driver', '%' + searchForm.driver + '%')
    if (dateRange.value && dateRange.value.length === 2) {
      const start = dateRange.value[0]
      const end = dateRange.value[1]
      query = query.gte('create_time', start).lt('create_time', end + ' 23:59:59')
    }
    const activeStat = stats.value.find(s => s.active)
    const statusLabel = activeStat && activeStat.label !== '全部' ? activeStat.label : ''
    if (statusLabel) {
      if (statusLabel === '待接单') {
        /* 常驻组主那趟往往已经完成，但组内新派的趟次是「待接单」→ 放行常驻行，
           否则一出新活就整个任务被筛掉（前端再按任务级状态收窄） */
        query = query.or('status.eq.待接单,is_recurring.eq.true')
      } else {
        query = query.eq('status', statusLabel)
      }
    }

    const { data, count, error } = await query
    if (error) throw error

    let rows = data || []
    /* 「待接单」放行的常驻行，按任务级状态再收窄一次（已结束 / 已暂停不该出现在待接单里） */
    if (statusLabel === '待接单') {
      rows = rows.filter(
        (r) => !r.is_recurring || !['已结束', '已暂停'].includes(String(r.recurring_status || '').trim())
      )
    }

    tableData.value = rows
    total.value = count || 0
    /* ⭐ 一次性聚合本页费用，别在单元格里逐行查 */
    loadFeeSummary(rows)
    /* ⭐ 常驻行的任务级状态 + 最新一趟时间（displayStatus / displayTime 都读它） */
    await loadRecurringTaskStatus(rows)
    updateStats()
    lastFetchAt.value = Date.now()
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
/* ============================================================
   ⭐ 费用列：本页运单的上报汇总（一次 in 查询）
   ============================================================ */
const feeMap = ref({})

const feeOf = (row) => feeMap.value[row.waybill_no] || null

const meInfo = (() => {
  try { return JSON.parse(localStorage.getItem('currentUser') || '{}') } catch { return {} }
})()

const canApproveReport = (r) => canApproveReportShared(r, meInfo)

const loadFeeSummary = async (rows) => {
  /* ⭐ 常驻是「一单」：司机把费用报在**某一趟**上，列表只显示组主那一行，
     所以要把组内全部趟次的上报合到这一行（与详情页「费用 = 这个任务所有趟次的合计」一致）。
     普通运单只算自己那一单。 */
  const list = rows || []
  const recGroups = Array.from(new Set(
    list.filter((r) => r && r.is_recurring && r.recurring_group_no).map((r) => r.recurring_group_no)
  ))
  const groupNos = {}
  if (recGroups.length) {
    try {
      const { data, error } = await supabase
        .from('waybills')
        .select('waybill_no,recurring_group_no')
        .in('recurring_group_no', recGroups)
      if (error) throw error
      ;(data || []).forEach((w) => {
        const g = w.recurring_group_no
        if (!g || !w.waybill_no) return
        ;(groupNos[g] || (groupNos[g] = [])).push(w.waybill_no)
      })
    } catch (e) {
      console.warn('[运单列表] 常驻组趟次读取失败（费用按组主单算）', e)
    }
  }

  const nos = list.map((r) => r.waybill_no).filter(Boolean)
  Object.values(groupNos).forEach((arr) => arr.forEach((n) => n && nos.push(n)))
  const uniq = Array.from(new Set(nos))
  if (!uniq.length) { feeMap.value = {}; return }
  try {
    const { data, error } = await supabase
      .from('reports')
      .select('waybill_no,type,status,amount,current_level,flow')
      .in('waybill_no', uniq)
    if (error) throw error

    const map = {}
    ;(data || []).forEach((r) => {
      const m = map[r.waybill_no] || (map[r.waybill_no] = { total: 0, pending: 0, mine: 0 })
      if (['expense', 'subsidy', 'loan', 'violation'].includes(r.type)) m.total += Number(r.amount) || 0
      if (r.status === '审核中') m.pending += 1
      if (canApproveReport(r)) m.mine += 1
    })

    /* 常驻：把组内所有趟次的上报合并回组主那一行（覆盖，不累加 —— 组主自己也在组里） */
    const out = { ...map }
    list.forEach((r) => {
      if (!r || !r.is_recurring || !r.recurring_group_no) return
      const arr = groupNos[r.recurring_group_no] || []
      if (!arr.length) return
      const agg = { total: 0, pending: 0, mine: 0 }
      arr.forEach((n) => {
        const m = map[n]
        if (!m) return
        agg.total += m.total
        agg.pending += m.pending
        agg.mine += m.mine
      })
      if (agg.total || agg.pending || agg.mine) out[r.waybill_no] = agg
    })

    feeMap.value = out
  } catch (e) {
    console.warn('[运单列表] 费用汇总失败（reports 表未初始化？）', e)
    feeMap.value = {}
  }
}

const handleSearch = () => { currentPage.value = 1; fetchData() }
const handleReset = () => {
  Object.assign(searchForm, { waybillNo: '', creator: '', plate: '', driver: '' })
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
    '承运数量': r.carry_quantity || 0,
    '发起人': r.creator || '',
    '创建时间': r.create_time || '',
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
    /* ⭐ 常驻任务：列表里这一行是组主，删它必须连带整组趟次，
       否则「头没了、趟次还在」，司机端还会看到这个组（用户 2026-10-18 报的 bug） */
    if (row.is_recurring && row.recurring_group_no) {
      const { error: e2 } = await supabase
        .from('waybills')
        .delete()
        .eq('recurring_group_no', row.recurring_group_no)
      if (e2) {
        ElMessage.error('删除失败：' + e2.message)
        return
      }
      ElMessage.success('已删除这个常驻任务（含全部趟次）')
      await fetchData()
      return
    }
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
  /* ⭐ 回到这个页面 / 切回浏览器标签时静默刷新一次（2026-10-24 用户反馈
     「状态不会刷新」：司机在外面改了状态，列表一直挂着打开时的旧值） */
  document.addEventListener('visibilitychange', onPageVisible)
  window.addEventListener('focus', onPageVisible)
  /* ⭐ 审批开关来自「业务流程」画布：先读回来再取数，避免「待我审批」入口闪一下 */
  await ensureApprovalMode(currentUserForModules())
  if (!auditOn.value && onlyMine.value) {
    onlyMine.value = false
    router.replace({ path: '/waybill', query: {} })
  }
  if (isCustomer && isSubAccount) await loadMyOrgInfo()
  fetchData()
})

/* 页面重新可见 / 窗口重新聚焦 → 距上次取数超过 5 秒就静默刷一次（不打扰、不闪） */
const lastFetchAt = ref(0)
const onPageVisible = () => {
  if (document.hidden) return
  if (Date.now() - lastFetchAt.value < 5000) return
  fetchData()
}

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onEscKeydown)
  document.removeEventListener('visibilitychange', onPageVisible)
  window.removeEventListener('focus', onPageVisible)
})
</script>

<style scoped>
/* ============================================================
   页面布局
   ============================================================ */
.waybill-page {
  /* ⭐ 表格里的数字（运单号 / 时间 / 运费）统一用系统无衬线 + 等宽数字。
     原来用 Courier New，笔画太细，13px 下屏幕上看不清。 */
  --num-font: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue',
    'PingFang SC', 'HarmonyOS Sans SC', 'Source Han Sans SC', 'Microsoft YaHei', Arial, sans-serif;
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
  background: var(--brand-primary-light);
  color: var(--brand-primary);
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(var(--brand-rgb), 0.08);
}
.stat-pill.active {
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  color: #fff;
  box-shadow: 0 4px 12px rgba(var(--brand-rgb), 0.35);
}
.stat-pill.active:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(var(--brand-rgb), 0.45);
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
  background: rgba(var(--brand-rgb), 0.12);
  color: var(--brand-primary);
}
.stat-pill.active .stat-count {
  background: rgba(255, 255, 255, 0.28);
  color: #fff;
}

/* ⭐ 待我审批：琥珀色，和「状态胶囊」区分开 */
.mine-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  padding: 9px 14px;
  border-radius: 10px;
  border: 1px solid #FDE68A;
  background: linear-gradient(90deg, #FFFBEB, #FEF9F3);
  color: #92400E;
  font-size: 12.5px;
}
.mine-bar-ic {
  display: inline-flex;
  color: #D97706;
}
.mine-bar-t b {
  color: #B45309;
  margin: 0 2px;
}
.mine-bar-x {
  margin-left: auto;
  color: #B45309;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 6px;
  transition: background 0.2s;
}
.mine-bar-x:hover {
  background: #FEF3C7;
}

.mine-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 18px;
  border: 1px solid #FCD34D;
  background: #FFFBEB;
  color: #B45309;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.mine-chip:hover {
  background: #FEF3C7;
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(180, 83, 9, 0.12);
}
.mine-chip.on {
  background: linear-gradient(135deg, #D97706, #B45309);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 4px 12px rgba(180, 83, 9, 0.3);
}
.mine-n {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 16px;
  padding: 0 5px;
  border-radius: 8px;
  background: var(--brand-primary);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
  line-height: 1;
}
.mine-n.zero {
  background: rgba(100, 116, 139, 0.14);
  color: #64748B;
}
.mine-chip.on .mine-n {
  background: rgba(255, 255, 255, 0.26);
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
  background: var(--brand-primary-light) !important;
  box-shadow: 0 0 0 1px #FCA5A5 inset !important;
}
.search-row :deep(.el-input__wrapper.is-focus),
.search-row :deep(.el-select__wrapper.is-focused) {
  background: #fff !important;
  box-shadow: 0 0 0 2px rgba(var(--brand-rgb), 0.15), 0 0 0 1px var(--brand-primary) inset !important;
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
  box-shadow: 0 4px 12px rgba(var(--brand-rgb), 0.15);
}
:deep(.btn-primary) {
  background-color: var(--brand-primary);
  border-color: var(--brand-primary);
  color: #fff;
}
:deep(.btn-primary:hover) { background-color: #a00d24; border-color: #a00d24; }
:deep(.btn-outline) {
  border-color: #CBD5E1;
  color: #334155;
  background: #fff;
}
:deep(.btn-outline:hover) {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
  background-color: var(--brand-primary-light);
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
  box-shadow: 0 20px 60px rgba(var(--brand-rgb), 0.18);
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
  background: linear-gradient(180deg, var(--brand-primary), var(--brand-primary-dark));
  box-shadow: 0 0 8px rgba(var(--brand-rgb), 0.35);
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
  border-color: var(--brand-primary);
  color: var(--brand-primary);
  background: var(--brand-primary-light);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(var(--brand-rgb), 0.15);
}
.icon-btn:active { transform: translateY(0); }
.icon-btn.active {
  border-color: var(--brand-primary);
  color: #fff;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  box-shadow: 0 4px 12px rgba(var(--brand-rgb), 0.35);
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
  background: var(--brand-primary-light) !important;
}
:deep(.custom-table .el-table__body tr.el-table__row--striped td.el-table__cell) {
  background: #FAFBFC;
}

/* 运单编号 cell：整列居中（编号 + 任务名称一起居中） */
.waybill-no-cell {
  text-align: center;
  padding-left: 0;
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
  /* 运单编号已降为副信息：小一号、灰色、等宽数字（上下行对得齐，但不再抢视线） */
  font-family: var(--num-font);
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0.2px;
  color: #94A3B8;
  line-height: 1.3;
  margin-top: 1px;
}
/* 常驻任务：编号是组号（CZ…），后面跟趟次规模 */
.rec-group-no {
  color: #B45309;
  font-weight: 700;
}
.rec-trip-hint {
  margin-left: 6px;
  font-size: 11px;
  color: #94A3B8;
}
/* 任务名称 = 主信息（用户 2026-10-19：名称比编号重要，主副对调） */
.task-title {
  font-size: 13.5px;
  font-weight: 600;
  color: #0F172A;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ⭐ 分车承运 · 展开入口（替代原来独占 46px 一列的方框箭头）
   形态：任务名称行尾的小胶囊「N 趟 ▾」，信息量 > 裸箭头，且完全不额外占列宽。
   状态：默认淡红描边 → 悬停加深 → 展开时填品牌红、箭头翻转。 */
.leg-toggle {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  height: 18px;
  margin-left: 6px;
  padding: 0 4px 0 6px;
  border: 1px solid #FCA5A5;
  border-radius: 9px;
  background: var(--brand-primary-light);
  color: #B91C1C;
  font-family: var(--num-font);
  font-size: 10.5px;
  font-weight: 700;
  line-height: 16px;
  letter-spacing: 0.2px;
  vertical-align: middle;
  cursor: pointer;
  transition: background .16s, color .16s, border-color .16s, box-shadow .16s;
}
.leg-toggle:hover {
  background: #FEE2E2;
  border-color: #EF4444;
  color: #991B1B;
  box-shadow: 0 1px 5px rgba(var(--brand-rgb), .18);
}
.leg-toggle .leg-toggle-icon {
  font-size: 10px;
  transition: transform .2s ease;
}
.leg-toggle.open {
  background: var(--brand-primary);
  border-color: var(--brand-primary);
  color: #fff;
  box-shadow: 0 1px 5px rgba(var(--brand-rgb), .28);
}
.leg-toggle.open .leg-toggle-icon {
  transform: rotate(180deg);
}

.time-text {
  /* 与运单编号同一字体栈，数字等宽 → 两行时间上下对得齐 */
  font-family: var(--num-font);
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  font-size: 12.5px;
  letter-spacing: 0.2px;
  color: #475569;
}
.freight-text {
  color: var(--brand-primary);
  font-weight: 700;
  font-family: var(--num-font);
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
}
.count-badge {
  display: inline-block;
  padding: 2px 10px;
  background: var(--brand-primary-light);
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
  color: var(--brand-primary);
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
/* ⭐ 展开列已瘦身成 1px 的「挂载点」：只把里面那个方框箭头藏掉，
   ⚠️ 千万不能对 td 用 display:none —— 那会让该行后面的 td 整体左移一格，
      和外层 fixed 列（运单编号）错位，状态列直接被盖住。
   触发按钮在「运单编号」单元格里（.leg-toggle）。 */
:deep(.custom-table .el-table__cell.el-table__expand-column .el-table__expand-icon) {
  display: none;
}
:deep(.custom-table .el-table__cell.el-table__expand-column) {
  padding: 0;
  border-right: none;
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
.action-delete { color: var(--brand-primary); }
.action-delete:hover { color: #7F1D1D; background: var(--brand-primary-light); }
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
  color: var(--brand-primary);
  transform: scale(1.08);
}
:deep(.custom-pagination .el-pager li.is-active) {
  background-color: var(--brand-primary) !important;
  color: #fff !important;
  box-shadow: 0 2px 6px rgba(var(--brand-rgb), 0.35);
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
  box-shadow: 0 10px 32px rgba(var(--brand-rgb), 0.18), 0 0 0 1px rgba(var(--brand-rgb), 0.12) !important;
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

/* ========== 列设置弹层 ========== */
.column-setting-popper.el-popover.el-popper {
  border: 2px solid #FFFFFF !important;
  box-shadow: 0 10px 32px rgba(var(--brand-rgb), 0.18), 0 0 0 1px rgba(var(--brand-rgb), 0.12) !important;
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
  color: var(--brand-primary);
}
.col-title .el-icon { color: var(--brand-primary); font-size: 14px; }
.col-reset {
  font-size: 12.5px;
  color: var(--brand-primary);
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
.column-item:hover { background: var(--brand-primary-light); }
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
.column-item:hover .drag-handle { color: var(--brand-primary); }
.col-checkbox { flex: 1; font-size: 13px; }
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

.fee-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  line-height: 1.2;
}

.fee-total {
  font-size: 12.5px;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: -.2px;
}

.fee-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #FEF3C7;
  color: #B45309;
  white-space: nowrap;
}

.fee-badge.is-mine {
  background: var(--brand-primary-light);
  color: var(--brand-primary);
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, box-shadow 0.2s;
}

.fee-badge.is-mine:hover {
  background: #FEE2E2;
  box-shadow: 0 0 0 2px rgba(var(--brand-rgb), 0.12);
}

.fee-none {
  color: #CBD5E1;
}

</style>