<template>
  <div class="waybill-create">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>新建运单</h2>
      <el-button type="danger" plain size="small" @click="router.push('/waybill')">返回列表</el-button>
    </div>

    <el-form label-width="0" label-position="left" size="default">
      <!-- 装卸货地打卡 -->
      <div class="checkin-row">
        <el-form-item label="*装卸货地打卡" label-width="140px">
          <el-switch v-model="form.checkInRequired" active-text="开启" inactive-text="关闭" />
          <span class="hint-text">说明：开启后，司机需要保证车辆在围栏内，才能进行确认装车、装车完成、确认到达的打卡</span>
        </el-form-item>
      </div>

      <!-- 运输信息 -->
      <div class="section-title">运输信息</div>

      <!-- 任务列表 -->
      <transition-group name="task-list" tag="div">
        <div v-for="(task, tIndex) in tasks" :key="task.id" class="task-card" :style="{ backgroundColor: task.color }">
          <!-- ⭐ 任务头：标签 + 输入框 + 路线按钮 紧贴，删除任务单独右对齐 -->
          <div class="task-header">
            <div class="task-name-wrapper">
              <span class="task-label">任务{{ tIndex + 1 }}</span>
              <el-input
                v-model="task.customName"
                placeholder="请输入任务名称"
                size="small"
                class="task-name-input"
                clearable
              />

              <!-- 从路线填充按钮 -->
              <button
                v-if="!task.routeId"
                type="button"
                class="route-fill-btn"
                @click="openRouteDialog(task.id)"
              >
                <el-icon><Guide /></el-icon>
                <span>从路线填充</span>
              </button>

              <!-- 已应用路线徽章 -->
              <div
                v-else
                class="route-badge"
                :style="{ '--route-color': task.planColor || '#c8102e' }"
              >
                <button
                  type="button"
                  class="route-badge-main"
                  @click="openRouteDialog(task.id)"
                  :title="`${task.routeName} · ${task.planName}（点击更换）`"
                >
                  <span class="badge-color"></span>
                  <span class="badge-text">
                    <span class="badge-route">{{ task.routeName }}</span>
                    <span class="badge-dot">·</span>
                    <span class="badge-plan">{{ task.planName }}</span>
                  </span>
                  <el-icon class="badge-edit"><Edit /></el-icon>
                </button>
                <button
                  type="button"
                  class="route-badge-clear"
                  @click.stop="clearTaskRoute(task.id)"
                  title="取消路线"
                >
                  <el-icon><Close /></el-icon>
                </button>
              </div>
            </div>

            <el-button
              v-if="tasks.length > 1"
              type="danger"
              plain
              size="small"
              class="del-task-btn"
              @click="removeTask(task.id)"
            >
              删除任务
            </el-button>
          </div>

          <!-- 起 -->
          <div class="row-wrapper">
            <span class="badge-circle">起</span>
            <div class="field-group">
              <div class="field-item">
                <span class="field-label"><span class="required-star">*</span>装货地点：</span>
                <div class="select-with-badge">
                  <el-select
                    :ref="el => setSelectRef('pickup', task.id, el)"
                    v-model="task.pickupLocation"
                    :disabled="!!task.routeId"
                    placeholder="请选择围栏"
                    style="flex:1; min-width:110px;"
                    popper-class="fence-select-popper pickup-fence-popper"
                  >
                    <el-option v-for="f in fenceList" :key="f.id" :label="f.name" :value="f.name" />
                    <template v-if="!task.routeId" #footer>
                      <div
                        class="fence-cta fence-cta-pickup"
                        @mousedown.stop.prevent
                        @click.stop.prevent="openCreateFence('pickup', task.id)"
                      >
                        <span class="fence-cta-hint">
                          <el-icon class="hint-icon"><InfoFilled /></el-icon>
                          没有合适围栏？
                        </span>
                        <span class="fence-cta-action">
                          <span class="plus-bubble"><el-icon><Plus /></el-icon></span>
                          <span class="action-text">去新建装货围栏</span>
                          <el-icon class="arrow-icon"><ArrowRight /></el-icon>
                        </span>
                      </div>
                    </template>
                  </el-select>
                  <span v-if="task.routeId" class="from-route-tag pickup">
                    <el-icon><Guide /></el-icon> 来自路线
                  </span>
                </div>
              </div>
              <div class="field-item">
                <span class="field-label">计划装货时间：</span>
                <el-date-picker v-model="task.pickupTime" type="datetime" placeholder="请选择时间"
                  style="flex:1; min-width:130px;" value-format="YYYY-MM-DD HH:mm:ss"
                  popper-class="compact-date-picker" />
              </div>
              <div class="field-item">
                <span class="field-label">发货联系电话：</span>
                <el-input v-model="task.senderPhone" placeholder="请输入联系电话" style="flex:1; min-width:100px;" />
              </div>
            </div>
          </div>

          <!-- 终 -->
          <div class="row-wrapper">
            <span class="badge-circle">终</span>
            <div class="field-group">
              <div class="field-item">
                <span class="field-label"><span class="required-star">*</span>卸货地点：</span>
                <div class="select-with-badge">
                  <el-select
                    :ref="el => setSelectRef('delivery', task.id, el)"
                    v-model="task.deliveryLocation"
                    :disabled="!!task.routeId"
                    placeholder="请选择围栏"
                    style="flex:1; min-width:110px;"
                    popper-class="fence-select-popper delivery-fence-popper"
                  >
                    <el-option v-for="f in fenceList" :key="f.id" :label="f.name" :value="f.name" />
                    <template v-if="!task.routeId" #footer>
                      <div
                        class="fence-cta fence-cta-delivery"
                        @mousedown.stop.prevent
                        @click.stop.prevent="openCreateFence('delivery', task.id)"
                      >
                        <span class="fence-cta-hint">
                          <el-icon class="hint-icon"><InfoFilled /></el-icon>
                          没有合适围栏？
                        </span>
                        <span class="fence-cta-action">
                          <span class="plus-bubble"><el-icon><Plus /></el-icon></span>
                          <span class="action-text">去新建卸货围栏</span>
                          <el-icon class="arrow-icon"><ArrowRight /></el-icon>
                        </span>
                      </div>
                    </template>
                  </el-select>
                  <span v-if="task.routeId" class="from-route-tag delivery">
                    <el-icon><Guide /></el-icon> 来自路线
                  </span>
                </div>
              </div>
              <div class="field-item">
                <span class="field-label">计划到达时间：</span>
                <el-date-picker v-model="task.deliveryTime" type="datetime" placeholder="请选择时间"
                  style="flex:1; min-width:130px;" value-format="YYYY-MM-DD HH:mm:ss"
                  popper-class="compact-date-picker" />
              </div>
              <div class="field-item">
                <span class="field-label">收货联系电话：</span>
                <el-input v-model="task.receiverPhone" placeholder="请输入联系电话" style="flex:1; min-width:100px;" />
              </div>
            </div>
          </div>

          <!-- 方案信息条 -->
          <div v-if="task.routeId && task.planInfo" class="plan-info-strip">
            <div class="plan-info-color" :style="{ background: task.planColor }"></div>
            <div class="plan-info-item">
              <span class="info-lbl">里程</span>
              <span class="info-val">{{ task.planInfo.distance || '--' }}<small v-if="task.planInfo.distance"> km</small></span>
            </div>
            <div class="plan-info-divider"></div>
            <div class="plan-info-item">
              <span class="info-lbl">时间</span>
              <span class="info-val">{{ task.planInfo.duration || '--' }}</span>
            </div>
            <div class="plan-info-divider"></div>
            <div class="plan-info-item">
              <span class="info-lbl">高速费</span>
              <span class="info-val">
                <template v-if="task.planInfo.toll">¥{{ task.planInfo.toll }}</template>
                <template v-else>--</template>
              </span>
            </div>
            <div class="plan-info-tag">来自路线</div>
          </div>
        </div>
      </transition-group>

      <div class="add-task-wrapper">
        <el-button type="primary" plain size="small" @click="addTask">＋ 添加任务</el-button>
      </div>

      <!-- 货物信息 -->
      <div class="section-title">货物信息</div>
      <div class="info-row">
        <div class="info-item">
          <span class="info-label">总计数量：</span>
          <span class="info-value">{{ totalQuantity }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">总计运费：</span>
          <span class="info-value">{{ totalFreight }}</span>
        </div>
      </div>

      <transition-group name="task-list" tag="div">
        <div v-for="(item, index) in form.cargoList" :key="item.id" class="cargo-row"
          :style="{ backgroundColor: getTaskColor(item.taskId) }">
          <el-row :gutter="12" align="middle" style="flex-wrap: nowrap;">
            <el-col :span="5" style="white-space: nowrap;">
              <el-form-item :label="`*货物${index + 1}`" label-width="80px">
                <el-input v-model="item.name" placeholder="请输入货物名称" @input="triggerDistribute" />
              </el-form-item>
            </el-col>
            <el-col :span="3" style="white-space: nowrap;">
              <el-form-item label="数量" label-width="50px">
                <el-input-number v-model="item.quantity" :min="0" controls-position="right" style="width:100%;" @change="triggerDistribute" />
              </el-form-item>
            </el-col>
            <el-col :span="2" style="white-space: nowrap;">
              <el-form-item label="单位" label-width="40px">
                <el-select v-model="item.unit" placeholder="单位" style="width:100%;">
                  <el-option label="吨" value="吨" />
                  <el-option label="件" value="件" />
                  <el-option label="方" value="方" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="3" style="white-space: nowrap;">
              <el-form-item label="运费" label-width="50px">
                <el-input-number v-model="item.freight" :min="0" :precision="2" :step="1" controls-position="right"
                  style="width:100%;" placeholder="0.00" @focus="$event.target.select()" @change="triggerDistribute" />
              </el-form-item>
            </el-col>
            <el-col v-if="tasks.length > 1" :span="6" style="white-space: nowrap;">
              <el-form-item label="绑定任务" label-width="70px" required>
                <el-select v-model="item.taskId" placeholder="选择任务" style="width:100%; min-width:200px;" @change="triggerDistribute">
                  <el-option v-for="t in tasks" :key="t.id"
                    :label="`任务${getTaskIndex(t.id) + 1}${t.customName ? ' - ' + t.customName : ''}`" :value="t.id" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="tasks.length > 1 ? 5 : 11" class="cargo-actions">
              <el-button v-if="!(tasks.length === 1 && form.cargoList.length === 1)" type="danger" plain size="small"
                @click="removeCargo(index)">删除</el-button>
            </el-col>
          </el-row>
        </div>
      </transition-group>
      <el-button type="primary" plain size="small" @click="addCargo">＋ 添加货物</el-button>

      <!-- 指派信息 -->
      <div class="section-title">指派信息</div>
      <transition-group name="task-list" tag="div">
        <div v-for="(assign, aIndex) in assignList" :key="assign.id" class="assign-card"
          :style="{ backgroundColor: getTaskColor(assign.taskId) }">
          <el-row :gutter="12" align="middle" style="flex-wrap: nowrap; margin-bottom: 8px;">
            <el-col :span="5" style="white-space: nowrap;">
              <el-form-item label="*指派方式" label-width="80px">
                <el-select v-model="assign.assignMethod" placeholder="请选择" style="width:100%;" @change="handleAssignMethodChange(assign)">
                  <el-option label="指派司机" value="driver" />
                  <el-option label="指派车辆" value="vehicle" />
                  <el-option label="指派车队" value="team" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col v-if="tasks.length > 1" :span="7" style="white-space: nowrap;">
              <el-form-item label="绑定任务" label-width="70px" required>
                <el-select v-model="assign.taskId" placeholder="选择任务" style="width:100%; min-width:200px;" @change="triggerDistribute">
                  <el-option v-for="t in tasks" :key="t.id"
                    :label="`任务${getTaskIndex(t.id) + 1}${t.customName ? ' - ' + t.customName : ''}`" :value="t.id" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="tasks.length > 1 ? 12 : 19" class="assign-actions">
              <el-button v-if="!(tasks.length === 1 && assignList.length === 1)" type="danger" plain size="small"
                @click="removeAssign(aIndex)">删除</el-button>
            </el-col>
          </el-row>

          <div class="assign-items">
            <transition-group name="task-list" tag="div">
              <div v-for="(item, iIndex) in assign.items" :key="item.id" class="assign-item">
                <el-row :gutter="12" align="middle" style="flex-wrap: nowrap;">
                  <el-col :span="5" style="white-space: nowrap;">
                    <el-form-item :label="getItemLabel(assign.assignMethod, iIndex + 1)" label-width="80px">
                      <el-select
                        v-if="assign.assignMethod === 'driver'"
                        v-model="item.target"
                        placeholder="请选择司机"
                        style="width:100%;"
                        filterable
                        :loading="loadingDrivers"
                      >
                        <el-option
                          v-for="d in driverList"
                          :key="d.id || d.driver_name"
                          :label="d.driver_name"
                          :value="d.driver_name"
                        />
                        <template #empty>
                          <div class="picker-empty-tip">
                            {{ loadingDrivers ? '加载中...' : '暂无司机，请先去「司机档案」添加' }}
                          </div>
                        </template>
                      </el-select>

                      <el-select
                        v-else-if="assign.assignMethod === 'vehicle'"
                        v-model="item.target"
                        placeholder="请选择车辆"
                        style="width:100%;"
                        filterable
                        :loading="loadingVehicles"
                      >
                        <el-option
                          v-for="v in vehicleList"
                          :key="v.id || v.plate"
                          :label="v.plate"
                          :value="v.plate"
                        >
                          <span class="option-plate">{{ v.plate }}</span>
                          <span v-if="v.org" class="option-org">{{ v.org }}</span>
                        </el-option>
                        <template #empty>
                          <div class="picker-empty-tip">
                            {{ loadingVehicles ? '加载中...' : '暂无车辆，请先去「车辆档案」添加' }}
                          </div>
                        </template>
                      </el-select>

                      <el-select
                        v-else-if="assign.assignMethod === 'team'"
                        v-model="item.target"
                        placeholder="请选择车队"
                        style="width:100%;"
                        filterable
                        :loading="loadingTeams"
                      >
                        <el-option
                          v-for="t in teamList"
                          :key="t.id || t.name"
                          :label="t.name"
                          :value="t.name"
                        />
                        <template #empty>
                          <div class="picker-empty-tip">
                            {{ loadingTeams ? '加载中...' : '暂无组织，请先去「组织管理」添加' }}
                          </div>
                        </template>
                      </el-select>

                      <el-input v-else disabled placeholder="请先选择指派方式" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="3" style="white-space: nowrap;">
                    <el-form-item label="承运量" label-width="60px">
                      <el-input-number v-model="item.carryQuantity" :min="0" :precision="2" :step="1"
                        controls-position="right" style="width:100%;" placeholder="0.00"
                        @focus="$event.target.select()" @change="item._manual = true; triggerDistribute()" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="3" style="white-space: nowrap;">
                    <el-form-item label="运费" label-width="40px">
                      <el-input-number v-model="item.carryFreight" :min="0" :precision="2" :step="1"
                        controls-position="right" style="width:100%;" placeholder="0.00"
                        @focus="$event.target.select()" @change="item._manual = true; triggerDistribute()" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="3" class="assign-item-actions">
                    <el-button type="danger" plain size="small" @click="removeItem(aIndex, iIndex)">删除</el-button>
                  </el-col>
                </el-row>
              </div>
            </transition-group>
            <div class="add-item-wrapper">
              <el-button type="primary" plain size="small" @click="addItem(aIndex)">
                ＋ {{ getAddButtonLabel(assign.assignMethod) }}
              </el-button>
            </div>
          </div>
        </div>
      </transition-group>
      <div class="add-assign-wrapper">
        <el-button type="primary" plain size="small" @click="addAssign">＋ 添加指派</el-button>
      </div>

      <!-- 底部按钮 -->
      <div class="form-actions">
        <el-button style="background-color: #f5a623; border-color: #f5a623; color: #fff; font-weight: 600;"
          @click="openRecurringDialog">设置为常驻任务</el-button>
        <el-button @click="closeForm">关闭</el-button>
        <el-button type="primary" plain style="border-color:#c8102e; color:#c8102e;" @click="publishAndClone">发布并创建相同运单</el-button>
        <el-button type="primary" style="background-color:#c8102e; border-color:#c8102e;" @click="publish">发布</el-button>
      </div>
    </el-form>

    <!-- ===== 常驻任务弹窗 ===== -->
    <el-dialog v-model="recurringDialogVisible" title="设置为常驻任务" width="500px" destroy-on-close :show-close="false">
      <el-form label-width="140px" size="default">
        <el-form-item label="常驻任务开关">
          <el-switch v-model="isRecurring" active-text="开" inactive-text="关" />
        </el-form-item>
        <template v-if="isRecurring">
          <el-form-item label="常驻方式">
            <el-radio-group v-model="recurringType">
              <el-radio label="time">按常驻时间</el-radio>
              <el-radio label="count">按接单次数</el-radio>
            </el-radio-group>
          </el-form-item>
          <template v-if="recurringType === 'time'">
            <el-form-item label="开始时间" required>
              <el-date-picker v-model="recurringStart" type="datetime" placeholder="选择开始时间"
                :disabled-date="disabledStartDate" :default-value="new Date()" style="width:100%;"
                value-format="YYYY-MM-DD HH:mm:ss" />
            </el-form-item>
            <el-form-item label="结束时间" required>
              <el-date-picker v-model="recurringEnd" type="datetime" placeholder="选择结束时间"
                :disabled-date="disabledEndDate" style="width:100%;" value-format="YYYY-MM-DD HH:mm:ss" />
            </el-form-item>
          </template>
          <template v-if="recurringType === 'count'">
            <el-form-item label="次数上限" required>
              <el-input-number v-model="recurringCount" :min="1" :step="1" style="width:100%;" />
            </el-form-item>
          </template>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="recurringDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmRecurring">确定</el-button>
      </template>
    </el-dialog>

    <!-- 新建围栏弹窗 -->
    <AddEleFenceDialog
      v-model="showFenceDialog"
      :edit-data="null"
      @success="handleFenceSuccess"
    />

    <!-- ============================================================
         ⭐ 选择路线弹窗（居中弹窗替代原抽屉）
         ============================================================ -->
    <el-dialog
      v-model="routeDialogVisible"
      width="920px"
      top="6vh"
      :close-on-click-modal="true"
      :destroy-on-close="false"
      class="route-select-dialog"
      @closed="handleRouteDialogClosed"
    >
      <template #header>
        <div class="rsd-header">
          <div class="rsd-header-left">
            <div class="rsd-header-icon">
              <el-icon><Guide /></el-icon>
            </div>
            <div class="rsd-header-text">
              <div class="rsd-title">选择路线</div>
              <div class="rsd-sub">为该任务快速带入装货点、卸货点及方案信息</div>
            </div>
          </div>
          <div class="rsd-header-right">
            <el-input
              v-model="routeSearchKeyword"
              placeholder="搜索路线名称 / 装货点 / 卸货点..."
              clearable
              size="default"
              class="rsd-search"
            >
              <template #prefix><el-icon><Search /></el-icon></template>
            </el-input>
          </div>
        </div>
      </template>

      <div class="rsd-body">
        <!-- 加载中 -->
        <div v-if="loadingRoutes" class="route-loading">
          <div class="route-loading-ring"></div>
          <p>正在加载路线…</p>
        </div>

        <!-- 空状态 -->
        <div v-else-if="filteredRoutes.length === 0" class="route-empty">
          <el-icon><Guide /></el-icon>
          <p>{{ routeSearchKeyword ? '没有匹配的路线' : '暂无路线' }}</p>
          <span v-if="!routeSearchKeyword">请先去「路线管理」创建路线</span>
        </div>

        <!-- 路线列表 -->
        <div v-else class="route-list">
          <div
            v-for="route in filteredRoutes"
            :key="route.id"
            class="route-item"
            :class="{ expanded: expandedRouteId === route.id }"
          >
            <!-- 路线头部 -->
            <div class="route-item-header" @click="toggleRouteExpand(route.id)">
              <div class="route-icon-wrap">
                <el-icon><Guide /></el-icon>
              </div>
              <div class="route-info">
                <div class="route-name">{{ route.name }}</div>
                <div class="route-path">
                  <span class="path-point pickup">{{ route.pickup_point || '--' }}</span>
                  <el-icon class="path-arrow"><ArrowRight /></el-icon>
                  <span class="path-point delivery">{{ route.delivery_point || '--' }}</span>
                </div>
              </div>
              <div class="route-meta">
                <span class="plan-count">
                  <el-icon><Files /></el-icon>
                  {{ (route.plans || []).length }}
                </span>
                <el-icon class="expand-icon" :class="{ expanded: expandedRouteId === route.id }">
                  <ArrowDown />
                </el-icon>
              </div>
            </div>

            <!-- 方案列表（展开时） -->
            <transition name="expand">
              <div v-if="expandedRouteId === route.id" class="plan-list">
                <div
                  v-for="(plan, pIdx) in (route.plans || [])"
                  :key="pIdx"
                  class="plan-card"
                  :class="{ selected: selectedRouteId === route.id && selectedPlanIdx === pIdx }"
                  :style="{ '--plan-color': getPlanColorByIndex(pIdx) }"
                  @click="selectPlan(route, pIdx)"
                >
                  <div class="plan-card-radio">
                    <span class="radio-outer">
                      <span class="radio-inner"></span>
                    </span>
                  </div>
                  <div class="plan-card-body">
                    <div class="plan-card-header">
                      <span class="plan-card-name">{{ plan.name || `方案${pIdx + 1}` }}</span>
                      <span class="plan-color-chip" :style="{ background: getPlanColorByIndex(pIdx) }">
                        方案 {{ pIdx + 1 }}
                      </span>
                    </div>
                    <div class="plan-card-meta">
                      <div class="plan-meta-cell">
                        <span class="meta-lbl">里程</span>
                        <span class="meta-val">
                          <template v-if="plan.distance">{{ plan.distance }}<small>km</small></template>
                          <template v-else>--</template>
                        </span>
                      </div>
                      <div class="plan-meta-cell">
                        <span class="meta-lbl">时间</span>
                        <span class="meta-val">{{ plan.duration || '--' }}</span>
                      </div>
                      <div class="plan-meta-cell">
                        <span class="meta-lbl">高速费</span>
                        <span class="meta-val">
                          <template v-if="plan.toll">¥{{ plan.toll }}</template>
                          <template v-else>--</template>
                        </span>
                      </div>
                    </div>
                    <div v-if="plan.waypoints && plan.waypoints.length" class="plan-waypoints">
                      <span class="wp-chip" v-for="(wp, wIdx) in plan.waypoints" :key="wIdx">
                        <span class="wp-idx">{{ wIdx + 1 }}</span>
                        {{ typeof wp === 'string' ? wp : (wp.value || '') }}
                      </span>
                    </div>
                  </div>
                </div>
                <div v-if="!(route.plans || []).length" class="plan-empty">
                  该路线还没有方案，请先去「路线管理」规划
                </div>
              </div>
            </transition>
          </div>
        </div>
      </div>

      <!-- 底部 -->
      <template #footer>
        <div class="rsd-footer">
          <div class="rsd-selected" :class="{ empty: !selectedRoute || selectedPlanIdx === null }">
            <template v-if="selectedRoute && selectedPlanIdx !== null">
              <span class="selected-chip" :style="{ background: getPlanColorByIndex(selectedPlanIdx) }"></span>
              <span class="selected-text">
                已选：<b>{{ selectedRoute.name }}</b> · {{ selectedRoute.plans[selectedPlanIdx]?.name || `方案${selectedPlanIdx + 1}` }}
              </span>
            </template>
            <template v-else>
              <el-icon><InfoFilled /></el-icon>
              <span>请选择路线并选中一个方案</span>
            </template>
          </div>
          <div class="rsd-btns">
            <el-button size="default" @click="routeDialogVisible = false">取消</el-button>
            <el-button
              type="primary"
              size="default"
              class="btn-primary"
              :disabled="!selectedRoute || selectedPlanIdx === null"
              @click="applyRouteToTask"
            >
              确认应用
            </el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, watch, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Plus, ArrowRight, ArrowDown, InfoFilled, Search,
  Guide, Edit, Close, Files,
} from '@element-plus/icons-vue'
import { supabase } from '@/utils/supabase'
import AddEleFenceDialog from '@/components/AddEleFenceDialog.vue'

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
const myCustomerId = ref(currentUser.customerId || null)
const myOrgName = ref(null)

const loadMyCustomerId = async () => {
  if (!isCustomer || myCustomerId.value || !myPhone) return
  try {
    const { data } = await supabase.from('customers').select('id').eq('phone', myPhone).maybeSingle()
    if (data) myCustomerId.value = data.id
  } catch (e) { }
}
const loadMyOrgName = async () => {
  if (!isCustomer || !isSubAccount || !currentUser.orgId) return
  try {
    const { data } = await supabase.from('organizations').select('name').eq('id', currentUser.orgId).maybeSingle()
    if (data) myOrgName.value = data.name
  } catch (e) { }
}

// ============================================================
// 围栏列表 & 新建围栏弹窗
// ============================================================
const fenceList = ref([])
const showFenceDialog = ref(false)
const pickupSelectRefs = ref({})
const deliverySelectRefs = ref({})
const pendingFence = ref(null)

const setSelectRef = (type, taskId, el) => {
  const container = type === 'pickup' ? pickupSelectRefs.value : deliverySelectRefs.value
  if (el) container[taskId] = el
  else delete container[taskId]
}

const loadFenceList = async () => {
  try {
    let q = supabase
      .from('ele_fences')
      .select('id, name')
      .order('updated_at', { ascending: false })
    if (isCustomer && myAccount) q = q.eq('owner_account', myAccount)
    const { data, error } = await q
    if (error) throw error
    fenceList.value = data || []
  } catch (e) {
    console.warn('加载围栏失败', e)
  }
}

const openCreateFence = async (type, taskId) => {
  const container = type === 'pickup' ? pickupSelectRefs.value : deliverySelectRefs.value
  const sel = container[taskId]
  if (sel) { try { sel.blur?.() } catch (e) { /* noop */ } }
  pendingFence.value = { type, taskId }
  await nextTick()
  showFenceDialog.value = true
}

const handleFenceSuccess = async (newFence) => {
  const pending = pendingFence.value
  await loadFenceList()
  try {
    let targetFence = newFence
    if (!targetFence) {
      let q = supabase
        .from('ele_fences')
        .select('id, name')
        .order('updated_at', { ascending: false })
        .limit(1)
      if (isCustomer && myAccount) q = q.eq('owner_account', myAccount)
      const { data } = await q
      targetFence = data?.[0]
    }
    if (targetFence && pending) {
      const task = tasks.value.find(t => t.id === pending.taskId)
      if (task) {
        if (pending.type === 'pickup') task.pickupLocation = targetFence.name
        else if (pending.type === 'delivery') task.deliveryLocation = targetFence.name
        ElMessage.success(`已自动选择围栏：${targetFence.name}`)
      }
    }
  } catch (e) {
    console.warn('获取新围栏失败', e)
  }
  pendingFence.value = null
}

watch(showFenceDialog, (val) => {
  if (!val) setTimeout(() => { pendingFence.value = null }, 500)
})

// ============================================================
// 司机 / 车辆 / 组织列表
// ============================================================
const driverList = ref([])
const vehicleList = ref([])
const teamList = ref([])
const loadingDrivers = ref(false)
const loadingVehicles = ref(false)
const loadingTeams = ref(false)
const loadedDrivers = ref(false)
const loadedVehicles = ref(false)
const loadedTeams = ref(false)

const loadDriverList = async () => {
  if (loadedDrivers.value) return
  loadingDrivers.value = true
  try {
    let q = supabase
      .from('drivers')
      .select('id, driver_name, customer_id, org')
      .order('driver_name', { ascending: true })
    if (isCustomer && myCustomerId.value) {
      q = q.eq('customer_id', myCustomerId.value)
      if (isSubAccount && myOrgName.value) q = q.eq('org', myOrgName.value)
    }
    const { data, error } = await q
    if (error) throw error
    driverList.value = data || []
    loadedDrivers.value = true
  } catch (e) {
    console.warn('加载司机失败', e)
  } finally {
    loadingDrivers.value = false
  }
}

const loadVehicleList = async () => {
  if (loadedVehicles.value) return
  loadingVehicles.value = true
  try {
    let q = supabase
      .from('vehicles')
      .select('id, plate, org, customer_id')
      .order('plate', { ascending: true })
    if (isCustomer && myCustomerId.value) {
      q = q.eq('customer_id', myCustomerId.value)
      if (isSubAccount && myOrgName.value) q = q.eq('org', myOrgName.value)
    }
    const { data, error } = await q
    if (error) throw error
    vehicleList.value = data || []
    loadedVehicles.value = true
  } catch (e) {
    console.warn('加载车辆失败', e)
  } finally {
    loadingVehicles.value = false
  }
}

const loadTeamList = async () => {
  if (loadedTeams.value) return
  loadingTeams.value = true
  try {
    let q = supabase
      .from('organizations')
      .select('id, name, owner_account')
      .order('name', { ascending: true })
    if (isCustomer && myAccount) q = q.eq('owner_account', myAccount)
    const { data, error } = await q
    if (error) throw error
    teamList.value = data || []
    loadedTeams.value = true
  } catch (e) {
    console.warn('加载组织失败', e)
  } finally {
    loadingTeams.value = false
  }
}

const handleAssignMethodChange = (assign) => {
  if (!assign) return
  assign.items.forEach(item => { item.target = '' })
  if (assign.assignMethod === 'driver') loadDriverList()
  else if (assign.assignMethod === 'vehicle') loadVehicleList()
  else if (assign.assignMethod === 'team') loadTeamList()
}

// ============================================================
// ⭐ 路线选择弹窗相关
// ============================================================
const PLAN_COLORS = [
  '#2563EB', '#8B5CF6', '#EC4899', '#06B6D4',
  '#F97316', '#6366F1', '#14B8A6', '#A855F7',
]
const getPlanColorByIndex = (idx) => PLAN_COLORS[(idx || 0) % PLAN_COLORS.length]

const routeDialogVisible = ref(false)
const routeList = ref([])
const loadingRoutes = ref(false)
const loadedRoutes = ref(false)
const routeSearchKeyword = ref('')
const expandedRouteId = ref(null)
const selectedRouteId = ref(null)
const selectedPlanIdx = ref(null)
const pendingRouteTaskId = ref(null)

const selectedRoute = computed(() =>
  routeList.value.find(r => r.id === selectedRouteId.value) || null
)

const filteredRoutes = computed(() => {
  const kw = routeSearchKeyword.value.trim().toLowerCase()
  if (!kw) return routeList.value
  return routeList.value.filter(r =>
    (r.name || '').toLowerCase().includes(kw)
    || (r.pickup_point || '').toLowerCase().includes(kw)
    || (r.delivery_point || '').toLowerCase().includes(kw)
  )
})

const loadRoutes = async (force = false) => {
  if (loadedRoutes.value && !force) return
  loadingRoutes.value = true
  try {
    let q = supabase
      .from('routes')
      .select('id, name, org, pickup_point, delivery_point, plans, plan_count, status')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
    if (isCustomer && myAccount) q = q.eq('owner_account', myAccount)
    if (isCustomer && isSubAccount && myOrgName.value) q = q.eq('org', myOrgName.value)
    const { data, error } = await q
    if (error) throw error
    routeList.value = data || []
    loadedRoutes.value = true
  } catch (e) {
    console.warn('加载路线失败', e)
    ElMessage.error('加载路线失败：' + e.message)
  } finally {
    loadingRoutes.value = false
  }
}

const openRouteDialog = async (taskId) => {
  pendingRouteTaskId.value = taskId
  routeDialogVisible.value = true
  routeSearchKeyword.value = ''
  expandedRouteId.value = null
  selectedRouteId.value = null
  selectedPlanIdx.value = null

  const task = tasks.value.find(t => t.id === taskId)
  await loadRoutes()
  if (task && task.routeId) {
    const r = routeList.value.find(x => x.id === task.routeId)
    if (r) {
      expandedRouteId.value = r.id
      selectedRouteId.value = r.id
      selectedPlanIdx.value = typeof task.planIdx === 'number' ? task.planIdx : 0
    }
  }
}

const toggleRouteExpand = (routeId) => {
  if (expandedRouteId.value === routeId) expandedRouteId.value = null
  else expandedRouteId.value = routeId
}

const selectPlan = (routeItem, planIdx) => {
  selectedRouteId.value = routeItem.id
  selectedPlanIdx.value = planIdx
}

const applyRouteToTask = () => {
  const taskId = pendingRouteTaskId.value
  const r = selectedRoute.value
  const pIdx = selectedPlanIdx.value
  if (!taskId || !r || pIdx === null) return

  const plan = (r.plans || [])[pIdx] || {}
  const task = tasks.value.find(t => t.id === taskId)
  if (!task) return

  task.pickupLocation = r.pickup_point || ''
  task.deliveryLocation = r.delivery_point || ''
  task.routeId = r.id
  task.routeName = r.name
  task.planIdx = pIdx
  task.planName = plan.name || `方案${pIdx + 1}`
  task.planColor = getPlanColorByIndex(pIdx)
  task.planInfo = {
    distance: plan.distance || '',
    duration: plan.duration || '',
    toll: plan.toll || '',
  }

  routeDialogVisible.value = false
  markDirty()
  ElMessage.success(`已应用路线：${r.name} · ${task.planName}`)
}

const clearTaskRoute = (taskId) => {
  const task = tasks.value.find(t => t.id === taskId)
  if (!task) return
  task.routeId = null
  task.routeName = ''
  task.planIdx = null
  task.planName = ''
  task.planColor = ''
  task.planInfo = null
  markDirty()
  ElMessage.info('已取消路线绑定')
}

const handleRouteDialogClosed = () => {
  pendingRouteTaskId.value = null
  expandedRouteId.value = null
  selectedRouteId.value = null
  selectedPlanIdx.value = null
  routeSearchKeyword.value = ''
}

// ============================================================
// 任务颜色池
// ============================================================
const taskColors = [
  '#f0f8ff', '#f0fff0', '#fff0f5', '#f5f5dc', '#fafad2',
  '#e6e6fa', '#ffe4e1', '#f0ffff', '#fff5ee', '#fdf5e6'
]

let nextTaskId = 1
let nextCargoId = 1
let nextAssignId = 1
let nextItemId = 1
let colorIndex = 0

const form = reactive({
  checkInRequired: true,
  cargoList: [
    { id: nextCargoId++, name: '', quantity: null, unit: '吨', freight: 0.00, taskId: 1 }
  ],
})

const assignList = ref([
  {
    id: nextAssignId++,
    assignMethod: 'driver',
    taskId: 1,
    items: [
      { id: nextItemId++, target: '', carryQuantity: null, carryFreight: null, _manual: false }
    ]
  }
])

// 常驻任务
const recurringDialogVisible = ref(false)
const isRecurring = ref(false)
const recurringType = ref('time')
const recurringStart = ref(new Date())
const recurringEnd = ref(null)
const recurringCount = ref(1)

const disabledStartDate = (time) => time.getTime() < new Date().setHours(0, 0, 0, 0)
const disabledEndDate = (time) => {
  if (!recurringStart.value) return false
  return time.getTime() < recurringStart.value.getTime()
}

const openRecurringDialog = () => {
  recurringDialogVisible.value = true
  isRecurring.value = false
  recurringType.value = 'time'
  recurringStart.value = new Date()
  recurringEnd.value = null
  recurringCount.value = 1
}

const confirmRecurring = () => {
  if (isRecurring.value) {
    if (recurringType.value === 'time') {
      if (!recurringStart.value || !recurringEnd.value) {
        ElMessage.warning('请选择完整的时间范围')
        return
      }
      if (recurringEnd.value.getTime() <= recurringStart.value.getTime()) {
        ElMessage.warning('结束时间必须晚于开始时间')
        return
      }
    } else {
      if (!recurringCount.value || recurringCount.value < 1) {
        ElMessage.warning('请输入有效的次数上限')
        return
      }
    }
  }
  ElMessage.success('常驻任务设置已保存')
  markDirty()
  recurringDialogVisible.value = false
}

const getItemLabel = (method, index) => {
  const map = { driver: '选择司机', vehicle: '选择车辆', team: '选择车队' }
  return `${map[method] || '选择'}${index}`
}
const getAddButtonLabel = (method) => {
  const map = { driver: '添加司机', vehicle: '添加车辆', team: '添加车队' }
  return map[method] || '添加'
}

const totalQuantity = computed(() => form.cargoList.reduce((sum, item) => sum + (item.quantity || 0), 0))
const totalFreight = computed(() => form.cargoList.reduce((sum, item) => sum + (item.freight || 0), 0))

const distributeTotals = () => {
  const taskMap = new Map()
  tasks.value.forEach(task => {
    taskMap.set(task.id, {
      taskId: task.id,
      cargoList: form.cargoList.filter(c => c.taskId === task.id),
      assignItems: []
    })
  })

  assignList.value.forEach(assign => {
    const taskId = assign.taskId
    if (taskMap.has(taskId)) {
      assign.items.forEach(item => { taskMap.get(taskId).assignItems.push(item) })
    }
  })

  taskMap.forEach((taskData) => {
    const { cargoList, assignItems } = taskData
    const totalQty = cargoList.reduce((sum, c) => sum + (c.quantity || 0), 0)
    const totalFrt = cargoList.reduce((sum, c) => sum + (c.freight || 0), 0)

    let manualQtySum = 0
    let manualFrtSum = 0
    const autoItems = []
    assignItems.forEach(item => {
      if (item._manual) {
        manualQtySum += (item.carryQuantity || 0)
        manualFrtSum += (item.carryFreight || 0)
      } else {
        autoItems.push(item)
      }
    })

    const finalQty = Math.max(0, totalQty - manualQtySum)
    const finalFrt = Math.max(0, totalFrt - manualFrtSum)

    const autoCount = autoItems.length
    if (autoCount === 0) return

    const qtyPerItem = finalQty / autoCount
    const frtPerItem = finalFrt / autoCount

    autoItems.forEach(item => {
      item.carryQuantity = parseFloat(qtyPerItem.toFixed(2))
      item.carryFreight = parseFloat(frtPerItem.toFixed(2))
    })
  })
}

let distributeTimer = null
const triggerDistribute = () => {
  if (distributeTimer) clearTimeout(distributeTimer)
  distributeTimer = setTimeout(() => { distributeTotals() }, 100)
}

const tasks = ref([
  {
    id: nextTaskId++,
    customName: '',
    color: taskColors[colorIndex++ % taskColors.length],
    pickupLocation: '',
    pickupTime: '',
    senderPhone: '',
    deliveryLocation: '',
    deliveryTime: '',
    receiverPhone: '',
    routeId: null,
    routeName: '',
    planIdx: null,
    planName: '',
    planColor: '',
    planInfo: null,
  }
])

const getTaskIndex = (taskId) => tasks.value.findIndex(t => t.id === taskId)
const getTaskColor = (taskId) => {
  const task = tasks.value.find(t => t.id === taskId)
  return task ? task.color : taskColors[0]
}

const isDirty = ref(false)
const markDirty = () => { isDirty.value = true }
let isInitializing = true

const applyCloneData = (cloneData) => {
  if (!cloneData) return false
  try {
    nextTaskId = 1
    nextCargoId = 1
    nextAssignId = 1
    nextItemId = 1
    colorIndex = 0

    if (cloneData.tasks && cloneData.tasks.length > 0) {
      tasks.value = cloneData.tasks.map(t => ({
        ...t,
        id: nextTaskId++,
        color: taskColors[colorIndex++ % taskColors.length]
      }))
    }

    if (cloneData.cargoList && cloneData.cargoList.length > 0) {
      form.cargoList = cloneData.cargoList.map(c => ({
        ...c,
        id: nextCargoId++,
        taskId: tasks.value[0]?.id || 1
      }))
    } else {
      form.cargoList = [{ id: nextCargoId++, name: '', quantity: null, unit: '吨', freight: 0.00, taskId: tasks.value[0]?.id || 1 }]
    }

    if (cloneData.assignList && cloneData.assignList.length > 0) {
      assignList.value = cloneData.assignList.map(a => ({
        ...a,
        id: nextAssignId++,
        taskId: tasks.value[0]?.id || 1,
        items: a.items.map(item => ({
          ...item,
          id: nextItemId++,
          _manual: false
        }))
      }))
    } else {
      assignList.value = [{
        id: nextAssignId++,
        assignMethod: 'driver',
        taskId: tasks.value[0]?.id || 1,
        items: [{ id: nextItemId++, target: '', carryQuantity: null, carryFreight: null, _manual: false }]
      }]
    }

    if (cloneData.checkInRequired !== undefined) {
      form.checkInRequired = cloneData.checkInRequired
    }

    markDirty()
    ElMessage.success('已自动填充相同数据')
    nextTick(() => { distributeTotals() })
    return true
  } catch (err) {
    console.error('应用克隆数据失败', err)
    return false
  }
}

onMounted(async () => {
  setTimeout(() => isInitializing = false, 100)
  window.addEventListener('beforeunload', handleBeforeUnload)

  if (isCustomer) {
    await loadMyCustomerId()
    await loadMyOrgName()
  }

  await loadFenceList()
  await loadDriverList()

  const cloneData = history.state?.cloneData
  if (cloneData) {
    applyCloneData(cloneData)
    const hasVehicle = assignList.value.some(a => a.assignMethod === 'vehicle')
    const hasTeam = assignList.value.some(a => a.assignMethod === 'team')
    if (hasVehicle) await loadVehicleList()
    if (hasTeam) await loadTeamList()
  } else {
    nextTick(() => { distributeTotals() })
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  if (distributeTimer) clearTimeout(distributeTimer)
})
const handleBeforeUnload = (e) => {
  if (isDirty.value) {
    e.preventDefault()
    e.returnValue = '您有未保存的更改，确定要离开吗？'
  }
}

const addTask = () => {
  tasks.value.push({
    id: nextTaskId++,
    customName: '',
    color: taskColors[colorIndex++ % taskColors.length],
    pickupLocation: '',
    pickupTime: '',
    senderPhone: '',
    deliveryLocation: '',
    deliveryTime: '',
    receiverPhone: '',
    routeId: null,
    routeName: '',
    planIdx: null,
    planName: '',
    planColor: '',
    planInfo: null,
  })
  markDirty()
  triggerDistribute()
}

const removeTask = (taskId) => {
  if (tasks.value.length <= 1) { ElMessage.warning('至少保留一个任务'); return }
  const index = tasks.value.findIndex(t => t.id === taskId)
  if (index === -1) return
  tasks.value.splice(index, 1)
  const firstTaskId = tasks.value[0].id
  form.cargoList.forEach(item => { if (item.taskId === taskId) item.taskId = firstTaskId })
  assignList.value.forEach(assign => { if (assign.taskId === taskId) assign.taskId = firstTaskId })
  markDirty()
  triggerDistribute()
}

const addAssign = () => {
  const firstTaskId = tasks.value[0]?.id || 1
  assignList.value.push({
    id: nextAssignId++,
    assignMethod: 'driver',
    taskId: firstTaskId,
    items: [{ id: nextItemId++, target: '', carryQuantity: null, carryFreight: null, _manual: false }]
  })
  markDirty()
  triggerDistribute()
}
const removeAssign = (index) => {
  if (assignList.value.length <= 1) { ElMessage.warning('至少保留一个指派卡片'); return }
  assignList.value.splice(index, 1)
  markDirty()
  triggerDistribute()
}
const addItem = (assignIndex) => {
  assignList.value[assignIndex].items.push({ id: nextItemId++, target: '', carryQuantity: null, carryFreight: null, _manual: false })
  markDirty()
  triggerDistribute()
}
const removeItem = (assignIndex, itemIndex) => {
  const assign = assignList.value[assignIndex]
  if (assign.items.length <= 1) { ElMessage.warning('至少保留一个条目'); return }
  assign.items.splice(itemIndex, 1)
  markDirty()
  triggerDistribute()
}
const addCargo = () => {
  const firstTaskId = tasks.value[0]?.id || 1
  form.cargoList.push({ id: nextCargoId++, name: '', quantity: null, unit: '吨', freight: 0.00, taskId: firstTaskId })
  markDirty()
  triggerDistribute()
}
const removeCargo = (index) => {
  if (form.cargoList.length > 1) { form.cargoList.splice(index, 1) } else { ElMessage.warning('至少保留一个货物') }
  markDirty()
  triggerDistribute()
}

const getMaxSeqForToday = async (todayStr) => {
  const { data, error } = await supabase
    .from('waybills')
    .select('waybill_no')
    .ilike('waybill_no', `YD${todayStr}%`)
    .order('waybill_no', { ascending: false })
    .limit(1)
  if (error) {
    console.warn('查询最大序号失败，使用0', error)
    return 0
  }
  if (!data || data.length === 0) return 0
  const lastNo = data[0].waybill_no
  const seq = parseInt(lastNo.slice(-4), 10)
  return isNaN(seq) ? 0 : seq
}

const generateWaybillNos = async (count) => {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const datePart = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`
  const maxSeq = await getMaxSeqForToday(datePart)
  const startSeq = maxSeq + 1
  const nos = []
  for (let i = 0; i < count; i++) {
    const seq = startSeq + i
    const no = `YD${datePart}${String(seq).padStart(4, '0')}`
    nos.push(no)
  }
  return nos
}

const validateForm = () => {
  if (tasks.value.length === 1 && form.cargoList.length > 1) {
    ElMessage.error('一个任务只能对应一个货物信息，请添加任务重试')
    return false
  }
  for (let tIndex = 0; tIndex < tasks.value.length; tIndex++) {
    const task = tasks.value[tIndex]
    if (!task.pickupLocation) {
      ElMessage.error(`任务${tIndex + 1} 装货地点未选择`)
      return false
    }
    if (!task.deliveryLocation) {
      ElMessage.error(`任务${tIndex + 1} 卸货地点未选择`)
      return false
    }
    const taskCargos = form.cargoList.filter(c => c.taskId === task.id)
    for (let cIndex = 0; cIndex < taskCargos.length; cIndex++) {
      const cargo = taskCargos[cIndex]
      if (!cargo.name || cargo.name.trim() === '') {
        ElMessage.error(`任务${tIndex + 1} 的货物${cIndex + 1} 名称未填写`)
        return false
      }
      if (cargo.quantity !== null && cargo.quantity !== undefined && cargo.quantity < 0) {
        ElMessage.error(`任务${tIndex + 1} 的货物${cIndex + 1} 数量不能为负数`)
        return false
      }
      if (cargo.freight !== null && cargo.freight !== undefined && cargo.freight < 0) {
        ElMessage.error(`任务${tIndex + 1} 的货物${cIndex + 1} 运费不能为负数`)
        return false
      }
    }
    const taskAssigns = assignList.value.filter(a => a.taskId === task.id)
    for (let aIndex = 0; aIndex < taskAssigns.length; aIndex++) {
      const assign = taskAssigns[aIndex]
      if (!assign.assignMethod) {
        ElMessage.error(`任务${tIndex + 1} 的指派方式未选择`)
        return false
      }
      for (let iIndex = 0; iIndex < assign.items.length; iIndex++) {
        const item = assign.items[iIndex]
        if (!item.target || item.target.trim() === '') {
          let targetLabel = '目标'
          if (assign.assignMethod === 'driver') targetLabel = '司机'
          else if (assign.assignMethod === 'vehicle') targetLabel = '车辆'
          else if (assign.assignMethod === 'team') targetLabel = '车队'
          ElMessage.error(`任务${tIndex + 1} 的指派方式第${iIndex + 1}个${targetLabel}未选择`)
          return false
        }
      }
    }
  }
  return true
}

const doPublish = async () => {
  try {
    const rawRecords = []
    tasks.value.forEach((task, index) => {
      const taskCargos = form.cargoList.filter(c => c.taskId === task.id)
      const taskAssigns = assignList.value.filter(a => a.taskId === task.id)

      const assignments = taskAssigns.map(a => ({
        method: a.assignMethod,
        items: a.items.map(item => ({
          target: item.target || '未指定',
          carryQuantity: item.carryQuantity || 0,
          carryFreight: item.carryFreight || 0
        }))
      }))

      const totalFreight = taskCargos.reduce((sum, c) => sum + (c.freight || 0), 0)

      const record = {
        task_name: task.customName || `任务${index + 1}`,
        pickup: task.pickupLocation || '未指定',
        delivery: task.deliveryLocation || '未指定',
        pickup_time: task.pickupTime || null,
        plan_time: task.deliveryTime || null,
        cargo: taskCargos.map(c => c.name || '未命名').join('、') || '无',
        quantity: taskCargos.reduce((sum, c) => sum + (c.quantity || 0), 0),
        freight: totalFreight,
        remaining: 0,
        receive_no: `RC${Date.now().toString().slice(-6)}${String(Math.floor(Math.random() * 900) + 100)}`,
        source: '手动',
        create_time: new Date().toISOString(),
        status: '待接单',
        assignments: assignments,
        vehicle: '',
        driver: '',
        carry_quantity: 0,
        owner_account: isAdmin ? null : myAccount,
      }

      if (taskAssigns.length === 1 && taskAssigns[0].items.length === 1) {
        const assign = taskAssigns[0]
        const first = assign.items[0]
        if (assign.assignMethod === 'vehicle') record.vehicle = first.target || '未指定'
        else if (assign.assignMethod === 'driver') record.driver = first.target || '未指定'
        record.carry_quantity = first.carryQuantity || 0
      } else {
        if (taskAssigns.length > 1) {
          record.vehicle = '多种'
          record.driver = '多种'
        } else {
          const assign = taskAssigns[0]
          if (assign.assignMethod === 'vehicle') {
            record.vehicle = `${assign.items.length}辆`
            record.driver = '--'
          } else if (assign.assignMethod === 'driver') {
            record.driver = `${assign.items.length}人`
            record.vehicle = '--'
          } else {
            record.vehicle = '--'
            record.driver = '--'
          }
        }
        record.carry_quantity = taskAssigns.reduce((sum, a) => sum + a.items.reduce((s, i) => s + (i.carryQuantity || 0), 0), 0)
      }

      rawRecords.push(record)
    })

    const count = rawRecords.length
    const waybillNos = await generateWaybillNos(count)

    const waybillList = rawRecords.map((record, idx) => ({
      ...record,
      waybill_no: waybillNos[idx]
    }))

    const { data, error } = await supabase
      .from('waybills')
      .insert(waybillList)
      .select()

    if (error) throw error

    ElMessage.success(`运单发布成功！共生成 ${waybillList.length} 条运单`)
    isDirty.value = false
    return true
  } catch (err) {
    console.error('发布失败', err)
    ElMessage.error('发布失败：' + err.message)
    return false
  }
}

const publish = async () => {
  if (!validateForm()) return
  const success = await doPublish()
  if (success) router.push('/waybill')
}

const publishAndClone = async () => {
  if (!validateForm()) return
  const success = await doPublish()
  if (success) {
    const cloneData = {
      tasks: tasks.value.map(t => ({
        customName: t.customName,
        pickupLocation: t.pickupLocation,
        pickupTime: t.pickupTime,
        senderPhone: t.senderPhone,
        deliveryLocation: t.deliveryLocation,
        deliveryTime: t.deliveryTime,
        receiverPhone: t.receiverPhone,
        routeId: t.routeId,
        routeName: t.routeName,
        planIdx: t.planIdx,
        planName: t.planName,
        planColor: t.planColor,
        planInfo: t.planInfo,
      })),
      cargoList: form.cargoList.map(c => ({
        name: c.name,
        quantity: c.quantity,
        unit: c.unit,
        freight: c.freight,
        taskId: c.taskId
      })),
      assignList: assignList.value.map(a => ({
        assignMethod: a.assignMethod,
        taskId: a.taskId,
        items: a.items.map(item => ({
          target: item.target,
          carryQuantity: item.carryQuantity,
          carryFreight: item.carryFreight
        }))
      })),
      checkInRequired: form.checkInRequired
    }
    router.push({
      path: '/waybill/create',
      state: { cloneData }
    })
  }
}

const closeForm = () => {
  isDirty.value = false
  router.push('/waybill')
}

watch(
  () => tasks.value.length,
  () => {
    const validIds = tasks.value.map(t => t.id)
    form.cargoList.forEach(item => {
      if (!validIds.includes(item.taskId)) item.taskId = tasks.value[0]?.id || 1
    })
    assignList.value.forEach(assign => {
      if (!validIds.includes(assign.taskId)) assign.taskId = tasks.value[0]?.id || 1
    })
    triggerDistribute()
  },
  { immediate: true }
)

defineExpose({ isDirty })
</script>

<style scoped>
/* ===== 页面容器 ===== */
.waybill-create {
  height: 100%;
  overflow-y: auto !important;
  padding: 16px 20px;
  box-sizing: border-box;
  background: #f8fafc;
}

/* 页面头部 */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  padding: 14px 20px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  position: sticky;
  top: 0;
  z-index: 10;
}
.page-header h2 {
  margin: 0;
  color: #0F172A;
  font-weight: 800;
  font-size: 18px;
  display: flex;
  align-items: center;
  gap: 8px;
  letter-spacing: 0.3px;
}
.page-header h2::before {
  content: '';
  width: 4px;
  height: 18px;
  background: linear-gradient(180deg, #c8102e, #a00d24);
  border-radius: 2px;
  box-shadow: 0 0 8px rgba(200, 16, 46, 0.35);
}

/* 分区标题 */
.section-title {
  font-size: 15px;
  font-weight: 800;
  color: #0F172A;
  margin: 16px 0 12px 0;
  padding: 10px 14px;
  background: linear-gradient(90deg, #FEF2F2 0%, #ffffff 100%);
  border-radius: 8px;
  border-left: 4px solid #c8102e;
  line-height: 1.2;
  text-align: left;
  box-shadow: 0 2px 8px rgba(200, 16, 46, 0.05);
  letter-spacing: 0.3px;
}

/* 打卡行 */
.checkin-row {
  margin-bottom: 16px;
  padding: 12px 16px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
}
.checkin-row .el-form-item { margin-bottom: 0; }
.hint-text {
  font-size: 12px;
  color: #94A3B8;
  margin-left: 12px;
  font-weight: 500;
}

/* ===== 任务卡片 ===== */
.task-card {
  position: relative;
  border-radius: 12px;
  padding: 14px 18px 10px 18px;
  margin-bottom: 16px;
  border: 1px solid #E2E8F0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  overflow: hidden;
}
.task-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, #c8102e, #a00d24);
  opacity: 0;
  transition: opacity 0.3s;
}
.task-card:hover {
  box-shadow: 0 8px 24px rgba(200, 16, 46, 0.1);
  transform: translateY(-2px);
  border-color: #FCA5A5;
}
.task-card:hover::before { opacity: 1; }

/* ============================================================
   ⭐ 任务头：名称 + 输入框 + 按钮 紧贴
   ============================================================ */
.task-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.task-name-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.task-label {
  font-weight: 800;
  font-size: 14px;
  white-space: nowrap;
  padding: 4px 12px;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #fff;
  border-radius: 6px;
  box-shadow: 0 2px 6px rgba(200, 16, 46, 0.25);
  letter-spacing: 0.3px;
  flex-shrink: 0;
}
.task-name-input {
  width: 260px;
  max-width: 260px;
  flex-shrink: 0;
}
.task-name-input :deep(.el-input__inner) {
  font-size: 13px;
}
.del-task-btn {
  flex-shrink: 0;
}

/* ============================================================
   ⭐ 「从路线填充」按钮
   ============================================================ */
.route-fill-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 14px;
  background: #FFFFFF;
  border: 1.5px dashed #93C5FD;
  border-radius: 20px;
  color: #2563EB;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: inherit;
  white-space: nowrap;
  line-height: 1;
  flex-shrink: 0;
}
.route-fill-btn:hover {
  background: linear-gradient(135deg, #EFF6FF, #DBEAFE);
  border-color: #3B82F6;
  border-style: solid;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
}
.route-fill-btn .el-icon { font-size: 13px; }

/* ============================================================
   ⭐ 已应用路线徽章
   ============================================================ */
.route-badge {
  display: inline-flex;
  align-items: stretch;
  height: 24px;
  border-radius: 20px;
  overflow: hidden;
  background: #FFFFFF;
  border: 1.5px solid var(--route-color, #c8102e);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  max-width: 320px;
  flex-shrink: 0;
}
.route-badge:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);
}
.route-badge-main {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  color: #0F172A;
  line-height: 1;
  min-width: 0;
}
.route-badge-main .badge-color {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--route-color, #c8102e);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--route-color, #c8102e) 20%, transparent);
  flex-shrink: 0;
}
.route-badge-main .badge-text {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
}
.route-badge-main .badge-route {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 130px;
}
.route-badge-main .badge-dot { color: #94A3B8; flex-shrink: 0; }
.route-badge-main .badge-plan {
  color: var(--route-color, #c8102e);
  font-family: 'Courier New', monospace;
  flex-shrink: 0;
}
.route-badge-main .badge-edit {
  font-size: 11px;
  color: #94A3B8;
  flex-shrink: 0;
}
.route-badge-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  background: color-mix(in srgb, var(--route-color, #c8102e) 8%, #fff);
  border: none;
  border-left: 1px solid color-mix(in srgb, var(--route-color, #c8102e) 25%, transparent);
  color: #94A3B8;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.2s;
  font-family: inherit;
  padding: 0;
}
.route-badge-clear:hover {
  background: #FEE2E2;
  color: #c8102e;
}

/* ============================================================
   装/卸货点：只读 + 来自路线标签
   ============================================================ */
.select-with-badge {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.from-route-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 800;
  letter-spacing: 0.3px;
  white-space: nowrap;
  flex-shrink: 0;
  line-height: 1;
  animation: badgeIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes badgeIn {
  from { opacity: 0; transform: scale(0.6); }
  to { opacity: 1; transform: scale(1); }
}
.from-route-tag.pickup {
  background: #EFF6FF;
  color: #2563EB;
  border: 1px solid #93C5FD;
}
.from-route-tag.delivery {
  background: #ECFDF5;
  color: #059669;
  border: 1px solid #6EE7B7;
}
.from-route-tag .el-icon { font-size: 12px; }

/* ============================================================
   方案信息条
   ============================================================ */
.plan-info-strip {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 12px;
  padding: 8px 14px 8px 18px;
  background: linear-gradient(135deg, #FAFBFC, #F1F5F9);
  border: 1px solid #E2E8F0;
  border-radius: 10px;
  overflow: hidden;
  animation: stripIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes stripIn {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}
.plan-info-color {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: #2563EB;
}
.plan-info-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 13px;
}
.plan-info-item .info-lbl {
  font-size: 11px;
  color: #94A3B8;
  font-weight: 700;
  letter-spacing: 0.3px;
}
.plan-info-item .info-val {
  font-size: 14px;
  color: #0F172A;
  font-weight: 800;
  font-family: 'Courier New', monospace;
}
.plan-info-item .info-val small {
  font-size: 10px;
  color: #94A3B8;
  font-weight: 600;
  margin-left: 1px;
}
.plan-info-divider {
  width: 1px;
  height: 14px;
  background: #E2E8F0;
}
.plan-info-tag {
  margin-left: auto;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  color: #64748B;
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  letter-spacing: 0.3px;
  flex-shrink: 0;
}

/* 起/终行 */
.row-wrapper {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}
.row-wrapper:last-of-type { margin-bottom: 0; }
.badge-circle {
  display: inline-block;
  width: 26px;
  height: 26px;
  line-height: 26px;
  border-radius: 50%;
  background-color: #c8102e;
  color: #fff;
  font-weight: 800;
  font-size: 13px;
  text-align: center;
  flex-shrink: 0;
  margin-top: 2px;
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.35);
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.badge-circle:hover { transform: scale(1.1) rotate(-6deg); }
.field-group {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.field-item {
  flex: 1;
  min-width: 140px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.field-label {
  white-space: nowrap;
  font-size: 13px;
  color: #334155;
  font-weight: 600;
}
.required-star {
  color: #c8102e;
  font-weight: 700;
  margin-right: 2px;
}
.field-item .el-select,
.field-item .el-date-picker,
.field-item .el-input {
  flex: 1;
  min-width: 90px;
}

.add-task-wrapper { margin-bottom: 16px; }

/* 货物信息 & 指派信息共用 */
.info-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px 32px;
  margin: 0 0 10px 0;
  align-items: center;
  padding: 12px 16px;
  background: #ffffff;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
}
.info-item { display: flex; align-items: center; gap: 6px; font-size: 14px; }
.info-label { color: #475569; white-space: nowrap; font-weight: 600; }
.info-value {
  font-weight: 800;
  color: #c8102e;
  font-size: 16px;
  font-family: 'Courier New', monospace;
}

.cargo-row {
  border-radius: 10px;
  padding: 8px 16px;
  margin-bottom: 8px;
  border: 1px solid #E2E8F0;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.cargo-row:hover {
  box-shadow: 0 6px 20px rgba(200, 16, 46, 0.08);
  border-color: #FCA5A5;
}
.cargo-row .el-row { flex-wrap: nowrap; }
.cargo-row .el-form-item { margin-bottom: 0; }
.cargo-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  height: 100%;
}

.assign-card {
  border-radius: 10px;
  padding: 8px 16px;
  margin-bottom: 8px;
  border: 1px solid #E2E8F0;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.assign-card:hover {
  box-shadow: 0 6px 20px rgba(200, 16, 46, 0.08);
  border-color: #FCA5A5;
}
.assign-card .el-row { flex-wrap: nowrap; }
.assign-card .el-form-item { margin-bottom: 0; }
.assign-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  height: 100%;
}
.add-assign-wrapper { margin-bottom: 16px; }

.assign-items { padding-left: 0; }
.assign-item { margin-bottom: 8px; }
.assign-item-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  height: 100%;
}
.add-item-wrapper {
  display: flex;
  justify-content: flex-start;
  margin-top: 4px;
}

.option-plate {
  font-family: 'Courier New', monospace;
  font-weight: 700;
  color: #0F172A;
  margin-right: 8px;
}
.option-org { font-size: 12px; color: #94A3B8; font-weight: 500; }
.picker-empty-tip {
  padding: 20px 12px;
  text-align: center;
  font-size: 12.5px;
  color: #94A3B8;
}

/* 底部按钮 */
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
  padding: 14px 20px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.04);
  flex-wrap: wrap;
  position: sticky;
  bottom: 0;
  z-index: 10;
}

@media (max-width: 768px) {
  .field-group { flex-direction: column; gap: 8px; }
  .field-item { min-width: unset; }
  .info-row { flex-direction: column; align-items: flex-start; gap: 8px; }
  .form-actions { flex-wrap: wrap; justify-content: center; }
  .hint-text { display: block; margin-left: 0; margin-top: 4px; }
  .task-header { flex-wrap: wrap; gap: 8px; }
  .task-name-input { width: 100%; max-width: 100%; }
  .cargo-row .el-row,
  .assign-card .el-row,
  .assign-item .el-row { flex-wrap: wrap; }
  .cargo-row .el-col,
  .assign-card .el-col,
  .assign-item .el-col { margin-bottom: 6px; }
}

/* 任务列表动画 */
.task-list-move { transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }
.task-list-enter-active { transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
.task-list-leave-active { transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); position: absolute; width: 100%; }
.task-list-enter-from { opacity: 0; transform: translateY(-30px) scale(0.95); }
.task-list-leave-to { opacity: 0; transform: scale(0.9) translateY(-20px); }
.task-list-leave-active { position: absolute; z-index: 0; }
.task-list-enter-to { opacity: 1; transform: translateY(0) scale(1); }
.task-list-leave-active + .task-card,
.task-list-leave-active + .cargo-row,
.task-list-leave-active + .assign-card,
.task-list-leave-active + .assign-item { transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }
</style>

<style>
/* 全局样式 */
.waybill-create .el-input__inner,
.waybill-create .el-textarea__inner,
.waybill-create .el-select .el-input__inner {
  font-weight: 600 !important;
}
.waybill-create .el-input__inner::placeholder,
.waybill-create .el-textarea__inner::placeholder {
  font-weight: 400 !important;
}

/* 围栏下拉 CTA */
.fence-select-popper .el-select-dropdown__list { padding-bottom: 0 !important; }
.fence-select-popper .el-select-dropdown__footer,
.fence-select-popper .el-select-dropdown__empty { padding: 0 !important; }

.fence-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  margin-top: 4px;
  border-top: 1px dashed #E2E8F0;
  cursor: pointer;
  user-select: none;
  position: relative;
  overflow: hidden;
  transition: background 0.28s ease;
}
.fence-cta::before {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 0.28s ease;
  pointer-events: none;
}
.fence-cta-pickup::before {
  background: linear-gradient(90deg, rgba(254, 242, 242, 0) 0%, rgba(254, 242, 242, 0.7) 40%, rgba(254, 226, 226, 0.9) 100%);
}
.fence-cta-delivery::before {
  background: linear-gradient(90deg, rgba(239, 246, 255, 0) 0%, rgba(239, 246, 255, 0.7) 40%, rgba(219, 234, 254, 0.9) 100%);
}
.fence-cta:hover::before { opacity: 1; }
.fence-cta > * { position: relative; z-index: 1; }

.fence-cta-hint {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  color: #94A3B8;
  font-weight: 500;
  transition: color 0.28s;
  white-space: nowrap;
}
.fence-cta-hint .hint-icon {
  font-size: 12px;
  color: #CBD5E1;
  transition: color 0.28s;
}
.fence-cta-pickup:hover .fence-cta-hint,
.fence-cta-pickup:hover .fence-cta-hint .hint-icon { color: #c8102e; }
.fence-cta-delivery:hover .fence-cta-hint,
.fence-cta-delivery:hover .fence-cta-hint .hint-icon { color: #2563EB; }

.fence-cta-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px 5px 6px;
  border-radius: 20px;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.2px;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  white-space: nowrap;
}
.fence-cta-pickup .fence-cta-action {
  color: #c8102e;
  background: #FFFFFF;
  border: 1px solid #FCA5A5;
  box-shadow: 0 2px 6px rgba(200, 16, 46, 0.06);
}
.fence-cta-delivery .fence-cta-action {
  color: #2563EB;
  background: #FFFFFF;
  border: 1px solid #93C5FD;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.06);
}
.fence-cta-pickup:hover .fence-cta-action {
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #fff;
  border-color: #c8102e;
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.35);
  transform: translateY(-1px);
}
.fence-cta-delivery:hover .fence-cta-action {
  background: linear-gradient(135deg, #3B82F6, #1D4ED8);
  color: #fff;
  border-color: #2563EB;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);
  transform: translateY(-1px);
}
.plus-bubble {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 11px;
  transition: all 0.28s;
}
.fence-cta-pickup .plus-bubble { background: #FEE2E2; color: #c8102e; }
.fence-cta-delivery .plus-bubble { background: #DBEAFE; color: #2563EB; }
.fence-cta-pickup:hover .plus-bubble,
.fence-cta-delivery:hover .plus-bubble {
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
  transform: rotate(90deg);
}
.action-text { font-size: 12.5px; }
.arrow-icon {
  font-size: 11px;
  transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.fence-cta-pickup:hover .arrow-icon,
.fence-cta-delivery:hover .arrow-icon { transform: translateX(3px); }

/* 日期选择器紧凑样式 */
.compact-date-picker .el-picker-panel {
  font-size: 13px;
  --el-date-picker-header-padding: 6px 12px;
  --el-date-picker-cell-size: 26px;
}
.compact-date-picker .el-picker-panel .el-date-picker__header { padding: 6px 12px; }
.compact-date-picker .el-picker-panel .el-date-table td { padding: 4px 0; }
.compact-date-picker .el-picker-panel .el-date-table td .el-date-table-cell {
  height: 26px;
  width: 26px;
  line-height: 26px;
}
.compact-date-picker .el-picker-panel .el-time-panel { max-height: 180px; }
.compact-date-picker .el-picker-panel .el-time-panel .el-time-panel__content { padding: 4px 0; }
.compact-date-picker .el-picker-panel .el-time-spinner__item {
  height: 26px;
  line-height: 26px;
}

/* ============================================================
   ⭐ 选择路线弹窗（居中 dialog）
   ============================================================ */
.route-select-dialog .el-dialog {
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 24px 72px rgba(15, 23, 42, 0.22);
  max-width: 96vw;
  display: flex;
  flex-direction: column;
  max-height: 88vh;
}
.route-select-dialog .el-dialog__header {
  padding: 18px 24px;
  margin: 0;
  border-bottom: 1px solid #F1F5F9;
  background: linear-gradient(180deg, #FFFFFF, #FAFBFC);
}
.route-select-dialog .el-dialog__body {
  padding: 0;
  background: #F8FAFC;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.route-select-dialog .el-dialog__footer {
  padding: 14px 24px;
  background: #fff;
  border-top: 1px solid #F1F5F9;
  flex-shrink: 0;
}
.route-select-dialog .el-dialog__headerbtn {
  top: 16px;
  right: 16px;
}

/* 头部 */
.rsd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}
.rsd-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.rsd-header-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #60A5FA, #2563EB);
  color: #fff;
  font-size: 20px;
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.35);
}
.rsd-title {
  font-size: 16px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: 0.3px;
}
.rsd-sub {
  font-size: 12px;
  color: #94A3B8;
  font-weight: 500;
  margin-top: 2px;
}
.rsd-header-right {
  flex: 1;
  max-width: 360px;
  min-width: 200px;
}
.rsd-search :deep(.el-input__wrapper) {
  border-radius: 10px !important;
  background: #F8FAFC !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  min-height: 36px;
}
.rsd-search :deep(.el-input__wrapper:hover) {
  background: #FEF2F2 !important;
  box-shadow: 0 0 0 1px #FCA5A5 inset !important;
}
.rsd-search :deep(.el-input__wrapper.is-focus) {
  background: #fff !important;
  box-shadow: 0 0 0 1px #c8102e inset, 0 0 0 3px rgba(200, 16, 46, 0.12) !important;
}

/* 主体 */
.rsd-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 加载 / 空 */
.route-loading,
.route-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #94A3B8;
  font-size: 13px;
  padding: 60px 20px;
}
.route-loading-ring {
  width: 32px;
  height: 32px;
  border: 3px solid #FEE2E2;
  border-top-color: #c8102e;
  border-radius: 50%;
  animation: rdrawerSpin 1s linear infinite;
}
@keyframes rdrawerSpin { to { transform: rotate(360deg); } }
.route-empty .el-icon { font-size: 48px; color: #CBD5E1; }
.route-empty p { margin: 0; font-size: 14px; color: #334155; font-weight: 700; }
.route-empty span { font-size: 12.5px; color: #94A3B8; }

/* 列表 */
.route-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.route-list::-webkit-scrollbar { width: 5px; }
.route-list::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }
.route-list::-webkit-scrollbar-thumb:hover { background: #94A3B8; }

/* 路线卡片 */
.route-item {
  background: #FFFFFF;
  border: 1.5px solid #E2E8F0;
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.route-item:hover {
  border-color: #FCA5A5;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.06);
}
.route-item.expanded {
  border-color: #2563EB;
  box-shadow: 0 8px 22px rgba(37, 99, 235, 0.12);
}

.route-item-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  cursor: pointer;
  transition: background 0.2s;
}
.route-item-header:hover { background: #F8FAFC; }
.route-item.expanded .route-item-header {
  background: linear-gradient(135deg, #EFF6FF, #F8FAFC);
}

.route-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #60A5FA, #2563EB);
  color: #FFF;
  font-size: 18px;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}
.route-item.expanded .route-icon-wrap {
  animation: iconBounce 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes iconBounce {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.15) rotate(-6deg); }
}

.route-info { flex: 1; min-width: 0; }
.route-name {
  font-size: 14px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: 0.3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 4px;
}
.route-path {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #64748B;
}
.path-point {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
  font-weight: 600;
}
.path-point.pickup { color: #2563EB; }
.path-point.delivery { color: #059669; }
.path-arrow { font-size: 11px; color: #94A3B8; flex-shrink: 0; }

.route-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.plan-count {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 999px;
  background: #EFF6FF;
  color: #2563EB;
  font-size: 11.5px;
  font-weight: 800;
  border: 1px solid #BFDBFE;
  font-family: 'Courier New', monospace;
}
.plan-count .el-icon { font-size: 12px; }

.expand-icon {
  font-size: 14px;
  color: #94A3B8;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.expand-icon.expanded {
  transform: rotate(180deg);
  color: #2563EB;
}

/* 方案列表：两列自适应 */
.plan-list {
  padding: 4px 14px 14px 14px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 10px;
  background: #FFFFFF;
  border-top: 1px dashed #E2E8F0;
}

.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  overflow: hidden;
}
.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

/* 方案卡片 */
.plan-card {
  display: flex;
  align-items: stretch;
  gap: 10px;
  padding: 12px 14px;
  background: #FAFBFC;
  border: 1.5px solid #E2E8F0;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;
  overflow: hidden;
}
.plan-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--plan-color, #2563EB);
  opacity: 0.5;
  transition: opacity 0.3s, width 0.3s;
}
.plan-card:hover {
  border-color: var(--plan-color, #FCA5A5);
  background: #FFFFFF;
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
}
.plan-card:hover::before { opacity: 1; }
.plan-card.selected {
  border-color: var(--plan-color, #2563EB);
  background: #FFFFFF;
  box-shadow: 0 8px 22px color-mix(in srgb, var(--plan-color, #2563EB) 25%, transparent),
              0 0 0 3px color-mix(in srgb, var(--plan-color, #2563EB) 15%, transparent);
}
.plan-card.selected::before {
  width: 5px;
  opacity: 1;
  box-shadow: 0 0 12px var(--plan-color, #2563EB);
}

.plan-card-radio {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  padding-top: 3px;
}
.radio-outer {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid #CBD5E1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  background: #FFF;
}
.radio-inner {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--plan-color, #2563EB);
  transform: scale(0);
  transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.plan-card.selected .radio-outer {
  border-color: var(--plan-color, #2563EB);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--plan-color, #2563EB) 15%, transparent);
}
.plan-card.selected .radio-inner { transform: scale(1); }

.plan-card-body { flex: 1; min-width: 0; }

.plan-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.plan-card-name {
  font-size: 13.5px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: 0.3px;
}
.plan-color-chip {
  margin-left: auto;
  padding: 2px 9px;
  border-radius: 999px;
  color: #FFF;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.3px;
  font-family: 'Courier New', monospace;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.15);
}

.plan-card-meta {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
}
.plan-meta-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  background: #FFFFFF;
  border: 1px solid #F1F5F9;
  border-radius: 6px;
}
.plan-meta-cell .meta-lbl {
  font-size: 10px;
  color: #94A3B8;
  font-weight: 700;
  letter-spacing: 0.3px;
}
.plan-meta-cell .meta-val {
  font-size: 12.5px;
  color: #0F172A;
  font-weight: 800;
  font-family: 'Courier New', monospace;
  display: flex;
  align-items: baseline;
  gap: 1px;
  line-height: 1.2;
}
.plan-meta-cell .meta-val small {
  font-size: 9.5px;
  color: #94A3B8;
  font-weight: 600;
}

.plan-waypoints {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #E2E8F0;
}
.wp-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 3px;
  border-radius: 999px;
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  font-size: 11px;
  color: #475569;
  font-weight: 600;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wp-chip .wp-idx {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--plan-color, #2563EB);
  color: #FFF;
  font-size: 9px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: 'Courier New', monospace;
  flex-shrink: 0;
}

.plan-empty {
  padding: 16px;
  text-align: center;
  font-size: 12.5px;
  color: #94A3B8;
  background: #FAFBFC;
  border-radius: 8px;
  border: 1px dashed #E2E8F0;
  grid-column: 1 / -1;
}

/* 底部 */
.rsd-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.rsd-selected {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #475569;
  flex: 1;
  min-width: 0;
}
.rsd-selected.empty { color: #94A3B8; }
.rsd-selected .selected-chip {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.08);
}
.rsd-selected .selected-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rsd-selected .selected-text b {
  color: #0F172A;
  font-weight: 800;
}
.rsd-btns {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}
.rsd-btns .el-button {
  border-radius: 10px;
  font-weight: 600;
  padding: 9px 22px;
}
.rsd-btns .btn-primary {
  background: linear-gradient(135deg, #c8102e, #a00d24);
  border: none;
  color: #fff;
  box-shadow: 0 6px 16px rgba(200, 16, 46, 0.3);
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.rsd-btns .btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(200, 16, 46, 0.45);
}
.rsd-btns .btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}
</style>