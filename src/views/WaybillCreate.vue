<template>
  <div class="waybill-create">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>新建运单</h2>
      <el-button type="danger" plain size="small" @click="router.push('/waybill')">返回列表</el-button>
    </div>

    <el-form label-width="0" label-position="left" size="default">
      <!-- ⭐ 运输节点：决定司机端要上报几步 -->
      <div class="checkin-row">
        <el-form-item label="*运输节点" label-width="140px">
          <el-radio-group v-model="form.transportMode">
            <el-radio label="极简">极简</el-radio>
            <el-radio label="详细">详细</el-radio>
          </el-radio-group>
          <span class="hint-text">
            {{ form.transportMode === '极简'
              ? '说明：司机只需「接单」和「完成运单」两步，适合短途、无需过程管控的场景'
              : '说明：司机需按「接单 → 装车完成 → 确认发车 → 确认到达 → 完成运单」逐步上报' }}
          </span>
        </el-form-item>
      </div>

      <!-- ⭐ 装卸货地打卡：只有「详细」模式才有过程节点可校验 -->
      <div class="checkin-row" v-if="form.transportMode === '详细'">
        <el-form-item label="*装卸货地打卡" label-width="140px">
          <el-switch v-model="form.checkInRequired" active-text="开启" inactive-text="关闭" />
          <span class="hint-text">说明：开启后，司机需要保证车辆在围栏内，才能进行「装车完成」（校验装货地围栏）与「确认到达」（校验卸货地围栏）的打卡</span>
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
              <!-- ⭐ 常驻任务续建：上一趟的计划时间 +1 天，一键填充 -->
              <el-button
                v-if="task.planFromPickup || task.planFromPlan"
                size="small"
                plain
                class="shift-plan-btn"
                @click="shiftPlanTime(task)"
              >按上一趟 +1 天</el-button>
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

            <!-- ⭐ 右侧操作区：从客户档案填充（右对齐）+ 删除任务 -->
            <div class="task-header-right">
              <button
                v-if="!hasCustomerFill(task)"
                type="button"
                class="customer-fill-btn"
                @click="openCustomerFill(task)"
              >
                <el-icon><User /></el-icon>
                <span>从客户档案填充</span>
              </button>

              <div v-else class="customer-fill-badge" :title="customerFillLabel(task)">
                <button type="button" class="cf-badge-main" @click="openCustomerFill(task)">
                  <el-icon><CircleCheckFilled /></el-icon>
                  <span>已带入客户联系人</span>
                </button>
                <button type="button" class="cf-badge-clear" title="清除客户关联" @click.stop="clearCustomerFill(task)">
                  <el-icon><Close /></el-icon>
                </button>
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
            <el-col :span="cargoSpans.name" style="white-space: nowrap;">
              <el-form-item :label="`*货物${index + 1}`" label-width="80px">
                <el-input v-model="item.name" placeholder="请输入货物名称" @input="triggerDistribute" />
              </el-form-item>
            </el-col>
            <el-col :span="cargoSpans.qty" style="white-space: nowrap;">
              <el-form-item label="数量" label-width="44px">
                <el-input-number v-model="item.quantity" :min="0" :controls="false" style="width:100%;"
                  @change="onCargoQuantityChange(item)" />
              </el-form-item>
            </el-col>
            <el-col :span="cargoSpans.unit" style="white-space: nowrap;">
              <el-form-item label="单位" label-width="40px">
                <UnitSelect v-model="item.unit" mode="compact" placeholder="单位" :show-common="false"
                  style="width:100%;" />
              </el-form-item>
            </el-col>
            <el-col :span="cargoSpans.freight" style="white-space: nowrap;">
              <el-form-item label="运费" label-width="44px">
                <el-input-number v-model="item.freight" :min="0" :precision="2" :controls="false"
                  style="width:100%;" placeholder="0.00" @focus="$event.target.select()"
                  @change="onCargoFreightChange(item)" />
              </el-form-item>
            </el-col>
            <el-col v-if="tasks.length > 1" :span="cargoSpans.task" style="white-space: nowrap;">
              <el-form-item label="绑定任务" label-width="70px" required>
                <el-select v-model="item.taskId" placeholder="选择任务" style="width:100%; min-width:200px;" @change="triggerDistribute">
                  <el-option v-for="t in tasks" :key="t.id"
                    :label="`任务${getTaskIndex(t.id) + 1}${t.customName ? ' - ' + t.customName : ''}`" :value="t.id" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="cargoSpans.actions" class="cargo-actions">
              <!-- ⭐ 从货物档案填充计费规则：带出货物名称 / 单位 / 单价 -->
              <button v-if="!item.ruleName" type="button" class="cargo-fill-btn" @click="openCargoFill(index)">
                <el-icon><Box /></el-icon>
                <span>从货物档案填充</span>
              </button>
              <div v-else class="customer-fill-badge cargo-rule-badge"
                :title="`${item.ruleName}｜含税 ${formatMoney(item.priceTax)} ${priceUnitShort(item.priceUnit)}，${freightFormula(item.priceUnit)}`">
                <button type="button" class="cf-badge-main" @click="openCargoFill(index)">
                  <el-icon><CircleCheckFilled /></el-icon>
                  <span>{{ item.ruleName }}</span>
                </button>
                <button type="button" class="cf-badge-clear" title="清除计费规则" @click.stop="clearCargoRule(item)">
                  <el-icon><Close /></el-icon>
                </button>
              </div>

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
        <el-button :style="recurringButtonStyle"
          @click="openRecurringDialog">{{ isRecurring ? '常驻任务：' + recurringSummary : '设置为常驻任务' }}</el-button>
        <el-button @click="closeForm">关闭</el-button>
        <el-button type="primary" plain style="border-color:#c8102e; color:#c8102e;" @click="publishAndClone">发布并创建相同运单</el-button>
        <el-button type="primary" style="background-color:#c8102e; border-color:#c8102e;" @click="publish">发布</el-button>
      </div>
    </el-form>

    <!-- ===== 常驻任务弹窗 ===== -->
    <el-dialog v-model="recurringDialogVisible" title="设置为常驻任务" width="520px" destroy-on-close :show-close="false" append-to-body>
      <el-form label-width="140px" size="default">
        <el-form-item label="常驻任务开关">
          <el-switch v-model="recurringDraft.isRecurring" active-text="开" inactive-text="关" />
          <span class="recurring-tip">开启后同一任务可产生多条运输记录</span>
        </el-form-item>
        <template v-if="recurringDraft.isRecurring">
          <el-form-item label="常驻方式">
            <el-radio-group v-model="recurringDraft.type">
              <el-radio label="time">按常驻时间</el-radio>
              <el-radio label="count">按接单次数</el-radio>
            </el-radio-group>
          </el-form-item>
          <div class="recurring-hint">
            {{ recurringDraft.type === 'time'
              ? '按常驻时间：在设置的起止时间内，该任务可无限次接单，每次接单产生一条运输记录。'
              : '按接单次数：累计接单达到设定次数后不再可接，常驻状态自动置为「已结束」。' }}
          </div>
          <template v-if="recurringDraft.type === 'time'">
            <el-form-item label="开始时间" required>
              <el-date-picker v-model="recurringDraft.start" type="datetime" placeholder="选择开始时间"
                :disabled-date="disabledStartDate" :default-value="new Date()" style="width:100%"
                value-format="YYYY-MM-DD HH:mm:ss" />
            </el-form-item>
            <el-form-item label="结束时间" required>
              <el-date-picker v-model="recurringDraft.end" type="datetime" placeholder="选择结束时间"
                :disabled-date="disabledEndDate" style="width:100%" value-format="YYYY-MM-DD HH:mm:ss" />
            </el-form-item>
          </template>
          <template v-if="recurringDraft.type === 'count'">
            <el-form-item label="次数上限" required>
              <el-input-number v-model="recurringDraft.count" :min="1" :step="1" style="width:100%" />
            </el-form-item>
          </template>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="recurringDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmRecurring">确定</el-button>
      </template>
    </el-dialog>

    <!-- ===== 从客户档案填充弹窗 ===== -->
    <el-dialog v-model="customerFillVisible" title="从客户档案填充" width="660px" top="10vh" append-to-body
      destroy-on-close :close-on-click-modal="false" class="customer-fill-dialog">
      <div class="cf-intro">
        <el-icon>
          <InfoFilled />
        </el-icon>
        <span>
          选客户 → 选联系人，自动填入发货 / 收货联系电话。同一角色只有一个联系人时自动选中；
          标记为「唯一」的联系人，装货、卸货两端通用。
        </span>
      </div>

      <div class="cf-grid">
        <!-- 装货 -->
        <section class="cf-side">
          <div class="cf-side-head">
            <span class="cf-dot pickup">起</span>
            <span>装货</span>
            <span class="cf-side-sub">发货联系电话</span>
          </div>
          <el-form label-width="62px" size="default" class="cf-form">
            <el-form-item label="客户">
              <el-select v-model="customerFill.pickupCustomerId" placeholder="请选择客户（可不选）" clearable filterable
                popper-class="archive-select-popper" @change="onFillCustomerChange('pickup')">
                <el-option v-for="c in archiveCustomers" :key="c.id" :label="c.name" :value="c.id">
                  <span class="archive-opt">{{ c.name }}</span>
                  <span v-if="c.manager" class="archive-opt-sub">{{ c.manager }}</span>
                </el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="联系人">
              <el-select v-model="customerFill.pickupContactId" placeholder="请选择联系人" clearable
                :disabled="!customerFill.pickupCustomerId" popper-class="archive-select-popper"
                @change="onFillContactChange('pickup')">
                <el-option v-for="c in fillPickupContacts" :key="c.id" :label="c.name" :value="c.id">
                  <span class="archive-opt">
                    {{ c.name }}
                    <em v-if="isUniqueContact(c)" class="uniq-tag">唯一</em>
                  </span>
                  <span class="archive-opt-sub">{{ c.phone }}</span>
                </el-option>
                <template #empty>
                  <div class="contact-empty-tip">该客户暂无装货联系人</div>
                </template>
              </el-select>
            </el-form-item>
            <div class="cf-phone">
              <span class="cf-phone-lbl">将填入</span>
              <span class="cf-phone-val" :class="{ empty: !fillPickupPhone }">
                {{ fillPickupPhone || '未选联系人' }}
              </span>
            </div>
          </el-form>
        </section>

        <!-- 卸货 -->
        <section class="cf-side">
          <div class="cf-side-head">
            <span class="cf-dot delivery">终</span>
            <span>卸货</span>
            <span class="cf-side-sub">收货联系电话</span>
          </div>
          <el-form label-width="62px" size="default" class="cf-form">
            <el-form-item label="客户">
              <el-select v-model="customerFill.deliveryCustomerId" placeholder="请选择客户（可不选）" clearable filterable
                popper-class="archive-select-popper" @change="onFillCustomerChange('delivery')">
                <el-option v-for="c in archiveCustomers" :key="c.id" :label="c.name" :value="c.id">
                  <span class="archive-opt">{{ c.name }}</span>
                  <span v-if="c.manager" class="archive-opt-sub">{{ c.manager }}</span>
                </el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="联系人">
              <el-select v-model="customerFill.deliveryContactId" placeholder="请选择联系人" clearable
                :disabled="!customerFill.deliveryCustomerId" popper-class="archive-select-popper"
                @change="onFillContactChange('delivery')">
                <el-option v-for="c in fillDeliveryContacts" :key="c.id" :label="c.name" :value="c.id">
                  <span class="archive-opt">
                    {{ c.name }}
                    <em v-if="isUniqueContact(c)" class="uniq-tag">唯一</em>
                  </span>
                  <span class="archive-opt-sub">{{ c.phone }}</span>
                </el-option>
                <template #empty>
                  <div class="contact-empty-tip">该客户暂无卸货联系人</div>
                </template>
              </el-select>
            </el-form-item>
            <div class="cf-phone">
              <span class="cf-phone-lbl">将填入</span>
              <span class="cf-phone-val" :class="{ empty: !fillDeliveryPhone }">
                {{ fillDeliveryPhone || '未选联系人' }}
              </span>
            </div>
          </el-form>
        </section>
      </div>

      <template #footer>
        <el-button @click="customerFillVisible = false">取消</el-button>
        <el-button type="primary" style="background-color:#c8102e; border-color:#c8102e;"
          @click="confirmCustomerFill">确认带入</el-button>
      </template>
    </el-dialog>

    <!-- ===== 从货物档案填充计费规则 ===== -->
    <el-dialog v-model="cargoFillVisible" title="从货物档案填充计费规则" width="580px" top="12vh" append-to-body
      destroy-on-close :close-on-click-modal="false" class="cargo-fill-dialog">
      <div class="cf-intro">
        <el-icon>
          <InfoFilled />
        </el-icon>
        <span>
          选货物 → 选计费规则，自动带出货物名称、单位和含税单价；之后改数量会按「数量 × 含税单价」重算运费，
          运费也可以手动改（手动改过就不再自动覆盖）。
        </span>
      </div>

      <el-form label-width="86px" size="default" class="cf-form">
        <el-form-item label="货物">
          <el-select v-model="cargoFill.cargoId" placeholder="请选择货物" clearable filterable
            popper-class="archive-select-popper" @change="onCargoFillCargoChange">
            <el-option v-for="c in cargoArchives" :key="c.id" :label="c.name" :value="c.id">
              <span class="archive-opt">{{ c.name }}</span>
              <span class="archive-opt-sub">{{ c.unit || '--' }}</span>
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item label="计费规则">
          <el-select v-model="cargoFill.ruleId" placeholder="请选择计费规则" clearable :disabled="!cargoFill.cargoId"
            popper-class="archive-select-popper">
            <el-option v-for="r in cargoFillRules" :key="r.id" :label="r.name" :value="r.id">
              <span class="archive-opt">{{ r.name }}</span>
              <span class="archive-opt-sub">{{ formatMoney(r.price_tax) }} {{ priceUnitShort(r.price_unit) }}</span>
            </el-option>
            <template #empty>
              <div class="contact-empty-tip">该货物暂无计费规则</div>
            </template>
          </el-select>
        </el-form-item>
      </el-form>

      <div class="cargo-fill-preview">
        <div class="cfp-item">
          <span class="cfp-lbl">货物名称</span>
          <span class="cfp-val">{{ cargoFillCargo?.name || '--' }}</span>
        </div>
        <div class="cfp-item">
          <span class="cfp-lbl">单位</span>
          <span class="cfp-val">{{ cargoFillCargo?.unit || '--' }}</span>
        </div>
        <div class="cfp-item">
          <span class="cfp-lbl">含税单价</span>
          <span class="cfp-val strong">{{ formatMoney(cargoFillRule?.price_tax) }}<small> {{ priceUnitShort(cargoFillRule?.price_unit) }}</small></span>
        </div>
        <div class="cfp-item">
          <span class="cfp-lbl">计价方式</span>
          <span class="cfp-val">{{ freightFormula(cargoFillRule?.price_unit) }}</span>
        </div>
        <div class="cfp-item">
          <span class="cfp-lbl">当前数量</span>
          <span class="cfp-val">{{ cargoFillItem?.quantity ?? '--' }}</span>
        </div>
        <div class="cfp-item wide">
          <span class="cfp-lbl">预估运费</span>
          <span class="cfp-val price">{{ estimateFreight }}</span>
        </div>
      </div>

      <template #footer>
        <el-button @click="cargoFillVisible = false">取消</el-button>
        <el-button type="primary" style="background-color:#c8102e; border-color:#c8102e;"
          @click="confirmCargoFill">确认带入</el-button>
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
  Guide, Edit, Close, Files, User, CircleCheckFilled, Box,
} from '@element-plus/icons-vue'
import app, { supabase } from '@/utils/supabase'
import dayjs from 'dayjs'
import UnitSelect from '@/components/UnitSelect.vue'
import {
  DEFAULT_UNIT, DEFAULT_PRICE_UNIT, calcFreight, freightFormula, priceUnitShort, unitFull,
} from '@/utils/units'
import AMapLoader from '@amap/amap-jsapi-loader'
import { parseLngLat } from '@/utils/waybillProgress'
import AddEleFenceDialog from '@/components/AddEleFenceDialog.vue'

/* 高德 JS API Key（与 FullMap / RouteFormDialog 一致） */
const AMAP_KEY = '273f5c474604b71906674aac159b8f45'

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
      .select('id, name, center, location')
      .order('updated_at', { ascending: false })
    if (isCustomer && myAccount) q = q.eq('owner_account', myAccount)
    const { data, error } = await q
    if (error) throw error
    fenceList.value = data || []
  } catch (e) {
    console.warn('加载围栏失败', e)
  }
}

/* ⭐ 围栏名 → 中心坐标（发布时用来算规划里程，避免每次刷新反查围栏） */
const fenceCenterOf = (name) => {
  const n = String(name || '').trim()
  if (!n) return null
  const hit = (fenceList.value || []).find(f => String(f.name || '').trim() === n)
  if (!hit) return null
  return parseLngLat(hit.center) || parseLngLat(hit.location)
}

/* ⭐ 高德驾车规划：发布时算一次，结果落 waybills.plan_distance / plan_duration */
let _amapForPlan = null
const planRoute = async (from, to) => {
  if (!from || !to) return null
  try {
    if (!_amapForPlan) {
      _amapForPlan = await AMapLoader.load({
        key: AMAP_KEY,
        version: '2.0',
        plugins: ['AMap.Driving'],
      })
    }
    return await new Promise((resolve) => {
      const driving = new _amapForPlan.Driving({
        policy: _amapForPlan.DrivingPolicy.LEAST_TIME,
      })
      const timer = setTimeout(() => resolve(null), 10000)
      driving.search(from, to, (status, result) => {
        clearTimeout(timer)
        if (status === 'complete' && result && result.routes && result.routes.length) {
          const r = result.routes[0]
          resolve({ distance: Number(r.distance) || 0, duration: Number(r.time) || 0 })
        } else {
          resolve(null)
        }
      })
    })
  } catch (e) {
    console.warn('规划路线计算失败', e)
    return null
  }
}

/* ⭐ 常驻任务续建时取下一个趟次序号 */
const nextTripSeq = async (groupNo) => {
  if (!groupNo) return 1
  try {
    const { data } = await supabase
      .from('waybills')
      .select('trip_seq')
      .eq('recurring_group_no', groupNo)
    const max = Math.max(0, ...(data || []).map(r => Number(r.trip_seq) || 0))
    return max + 1
  } catch (e) {
    return 1
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
  // ⭐ 运输节点模式：'极简'（接单→完成运单）| '详细'（接单→装车完成→确认发车→确认到达→完成运单）
  // ⭐ 默认值 = 「极简」（用户 2026-10-17 拍板）：绝大多数场景是短途、不需要过程管控，
  //    司机少点四步；需要过程管控的再手动切「详细」。
  transportMode: '极简',
  // 是否要求装卸货地打卡，仅「详细」模式生效
  checkInRequired: true,
  cargoList: [
    {
      id: nextCargoId++, name: '', quantity: null, unit: DEFAULT_UNIT, freight: 0.00, taskId: 1,
      // ⭐ 货物档案计费规则（选填）
      ruleId: '', ruleName: '', priceUnit: DEFAULT_PRICE_UNIT, priceTax: null, priceNoTax: null, autoFreight: true,
    }
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

// ============================================================
// ⭐ 常驻任务
// 按常驻时间：时间窗内接单次数不限
// 按接单次数：接满设定次数后不再产生新的运输记录
// 同一常驻任务的多条运输记录靠 recurring_group_no 关联
// ============================================================
const TZ_FMT = 'YYYY-MM-DD HH:mm:ss'

const recurringDialogVisible = ref(false)
const isRecurring = ref(false)
const recurringType = ref('time')
const recurringStart = ref('')
const recurringEnd = ref('')
const recurringCount = ref(1)
/* 克隆 / 续建时沿用上一趟的分组号，保证落在同一个常驻任务下 */
const recurringGroupNo = ref('')

const shortTime = (t) => (t ? dayjs(t).format('MM-DD HH:mm') : '--')

const recurringSummary = computed(() => {
  if (!isRecurring.value) return '未开启'
  if (recurringType.value === 'count') return `按次数 · 上限 ${recurringCount.value} 次`
  return `按时间 · ${shortTime(recurringStart.value)} ~ ${shortTime(recurringEnd.value)}`
})

const recurringButtonStyle = computed(() =>
  isRecurring.value
    ? 'background-color:#c8102e; border-color:#c8102e; color:#fff; font-weight:600;'
    : 'background-color:#f5a623; border-color:#f5a623; color:#fff; font-weight:600;'
)

const disabledStartDate = (time) => time.getTime() < new Date().setHours(0, 0, 0, 0)
const disabledEndDate = (time) => {
  if (!recurringStart.value) return false
  const s = dayjs(recurringStart.value)
  return s.isValid() ? time.getTime() < s.startOf('day').valueOf() : false
}

/* 弹窗内先用草稿，点「取消」不会破坏已保存的常驻设置 */
const recurringDraft = reactive({
  isRecurring: false,
  type: 'time',
  start: '',
  end: '',
  count: 1,
})

const openRecurringDialog = () => {
  recurringDraft.isRecurring = isRecurring.value
  recurringDraft.type = recurringType.value
  recurringDraft.start = recurringStart.value || dayjs().format(TZ_FMT)
  recurringDraft.end = recurringEnd.value || dayjs().add(30, 'day').format(TZ_FMT)
  recurringDraft.count = recurringCount.value || 1
  recurringDialogVisible.value = true
}

const confirmRecurring = () => {
  if (recurringDraft.isRecurring) {
    if (recurringDraft.type === 'time') {
      if (!recurringDraft.start || !recurringDraft.end) {
        ElMessage.warning('请选择完整的常驻时间范围')
        return
      }
      const s = dayjs(recurringDraft.start)
      const e = dayjs(recurringDraft.end)
      if (!s.isValid() || !e.isValid()) {
        ElMessage.warning('常驻时间格式不正确')
        return
      }
      if (e.valueOf() <= s.valueOf()) {
        ElMessage.warning('结束时间必须晚于开始时间')
        return
      }
    } else if (!recurringDraft.count || recurringDraft.count < 1) {
      ElMessage.warning('请输入有效的次数上限')
      return
    }
  }

  isRecurring.value = recurringDraft.isRecurring
  recurringType.value = recurringDraft.type
  recurringStart.value = recurringDraft.start
  recurringEnd.value = recurringDraft.end
  recurringCount.value = recurringDraft.count

  ElMessage.success(
    isRecurring.value ? '已设为常驻任务：' + recurringSummary.value : '已关闭常驻任务'
  )
  markDirty()
  recurringDialogVisible.value = false
}

/* 发布时写入 waybills 的常驻字段 */
const buildRecurringFields = (waybillNo, overrideGroupNo) => {
  if (!isRecurring.value) return { is_recurring: false }
  return {
    is_recurring: true,
    recurring_group_no:
      overrideGroupNo || recurringGroupNo.value || 'CZ' + String(waybillNo || '').slice(2),
    recurring_type: recurringType.value,
    recurring_start_time: recurringType.value === 'time' ? recurringStart.value : null,
    recurring_end_time: recurringType.value === 'time' ? recurringEnd.value : null,
    recurring_max_count: recurringType.value === 'count' ? recurringCount.value : null,
    recurring_accepted_count: 0,
    recurring_status: '生效中',
  }
}

/* 数据库尚未执行迁移时，去掉尚未建列的新字段重试，保证普通运单仍能发布 */
const OPTIONAL_NEW_COLUMNS = [
  'is_recurring', 'recurring_group_no', 'recurring_type', 'recurring_start_time',
  'recurring_end_time', 'recurring_max_count', 'recurring_accepted_count', 'recurring_status',
  'transport_mode', 'check_in_required',
  'plan_distance', 'plan_duration',
  'pickup_lng', 'pickup_lat', 'delivery_lng', 'delivery_lat', 'trip_seq',
  'customer_archive_id', 'customer_archive_name',
  'pickup_contact_name', 'pickup_contact_phone',
  'delivery_contact_name', 'delivery_contact_phone',
  'cargo_rule_name', 'cargo_price_tax', 'cargo_price_unit',
]

const stripNewFields = (list) =>
  list.map(row => {
    const copy = { ...row }
    OPTIONAL_NEW_COLUMNS.forEach(k => { delete copy[k] })
    return copy
  })

/* ⭐ 按上一趟 +1 天：常驻任务续建时快速填计划时间
   没有计划时间，「物流状态」里就画不出计划条、没法做计划 vs 实际对比 */
const shiftPlanTime = (task) => {
  if (!task) return
  const shift = (t) => (t ? dayjs(t).add(1, 'day').format('YYYY-MM-DD HH:mm:ss') : '')
  const pickup = shift(task.planFromPickup)
  const plan = shift(task.planFromPlan)
  if (!pickup && !plan) {
    ElMessage.warning('上一趟没有填写计划时间，无法填充')
    return
  }
  if (pickup) task.pickupTime = pickup
  if (plan) task.deliveryTime = plan
  markDirty()
  ElMessage.success('已按上一趟 +1 天填充计划时间')
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

/* ============================================================
   ⭐ 档案管理 → 客户档案：选客户 → 自动带入联系人电话
   ------------------------------------------------------------
   规则（和客户档案页的约定一致）：
     · 联系人角色 = 装货 → 带入「发货联系电话」
     · 联系人角色 = 卸货 → 带入「收货联系电话」
     · 联系人角色 = 唯一 → 两端都带入，并把客户同步到另一端
     · 同角色只有 1 个联系人 → 自动带入；多个 → 由用户自己选
   客户档案表不存在时整段静默降级，不影响发运单
   ============================================================ */
const archiveCustomers = ref([])
const archiveContacts = ref([])

/* 货物档案 + 计费规则 */
const cargoArchives = ref([])
const cargoRuleList = ref([])

const loadArchiveData = async () => {
  /* 客户档案 */
  try {
    let cq = supabase.from('customer_archives').select('id, name, manager, status').order('name', { ascending: true })
    if (isCustomer) cq = cq.eq('owner_account', myAccount)
    const { data: cs, error } = await cq
    if (error) throw error
    archiveCustomers.value = (cs || []).filter(c => Number(c.status ?? 1) === 1)

    if (archiveCustomers.value.length) {
      const { data: ct, error: cerr } = await supabase
        .from('customer_contacts')
        .select('id, archive_id, name, phone, roles, person_type')
        .in('archive_id', archiveCustomers.value.map(c => c.id))
        .order('created_at', { ascending: true })
      if (cerr) throw cerr
      archiveContacts.value = ct || []
    }
  } catch (e) {
    console.warn('[运单] 客户档案不可用（多半是没执行 sql/2026-10-18_customer_archive.sql）:', e?.message || e)
    archiveCustomers.value = []
    archiveContacts.value = []
  }

  /* 货物档案 + 计费规则 */
  try {
    let gq = supabase.from('cargo_archives').select('id, name, unit, status').order('name', { ascending: true })
    if (isCustomer) gq = gq.eq('owner_account', myAccount)
    const { data: gs, error } = await gq
    if (error) throw error
    cargoArchives.value = (gs || []).filter(c => Number(c.status ?? 1) === 1)

    if (cargoArchives.value.length) {
      const { data: rs, error: rerr } = await supabase
        .from('cargo_rules')
        .select('id, cargo_id, name, price_tax, price_no_tax, updated_at')
        .in('cargo_id', cargoArchives.value.map(c => c.id))
        .order('updated_at', { ascending: false })
      if (rerr) throw rerr
      cargoRuleList.value = rs || []
    }
  } catch (e) {
    console.warn('[运单] 货物档案不可用（多半是没执行 sql/2026-10-18_cargo_archive.sql）:', e?.message || e)
    cargoArchives.value = []
    cargoRuleList.value = []
  }
}

const rolesArray = (roles) => String(roles || '').split(',').map(s => s.trim()).filter(Boolean)

/* 某客户下能当「装货 / 卸货」用的联系人 */
const contactPool = (customerId, side) => {
  if (!customerId) return []
  return archiveContacts.value.filter(c => {
    if (c.archive_id !== customerId) return false
    const rs = rolesArray(c.roles)
    if (rs.includes('唯一')) return true
    return rs.includes(side === 'pickup' ? '装货' : '卸货')
  })
}

const isUniqueContact = (contact) => rolesArray(contact?.roles).includes('唯一')

const customerNameOf = (id) => archiveCustomers.value.find(c => c.id === id)?.name || ''

/* ---------- 「从客户档案填充」弹窗 ---------- */
const customerFillVisible = ref(false)
const customerFillTaskId = ref(null)
const customerFill = reactive({
  pickupCustomerId: '',
  pickupContactId: '',
  deliveryCustomerId: '',
  deliveryContactId: '',
})

const fillTask = computed(() => tasks.value.find(t => t.id === customerFillTaskId.value) || null)
const contactById = (id) => archiveContacts.value.find(c => c.id === id) || null
const fillPickupContacts = computed(() => contactPool(customerFill.pickupCustomerId, 'pickup'))
const fillDeliveryContacts = computed(() => contactPool(customerFill.deliveryCustomerId, 'delivery'))
const fillPickupPhone = computed(() => contactById(customerFill.pickupContactId)?.phone || '')
const fillDeliveryPhone = computed(() => contactById(customerFill.deliveryContactId)?.phone || '')

const hasCustomerFill = (task) => !!(task?.pickupCustomerId || task?.deliveryCustomerId)

/* 任务头上只显示「有没有带」，不显示客户名（行里要干净） */
const customerFillLabel = (task) => {
  if (!task) return ''
  const lines = []
  const push = (sideLabel, cid, contactId) => {
    const c = customerNameOf(cid)
    if (!c) return
    const contact = contactById(contactId)
    lines.push(`${sideLabel}：${c}${contact ? ' · ' + contact.name : ''}`)
  }
  push('装货', task.pickupCustomerId, task.pickupContactId)
  push('卸货', task.deliveryCustomerId, task.deliveryContactId)
  return lines.join('\n') + '\n（点击可修改）'
}

const openCustomerFill = (task) => {
  if (!task) return
  if (!archiveCustomers.value.length) {
    ElMessage.info('客户档案里还没有客户，可到「档案管理 → 客户档案」新增')
    return
  }
  customerFillTaskId.value = task.id
  customerFill.pickupCustomerId = task.pickupCustomerId || ''
  customerFill.pickupContactId = task.pickupContactId || ''
  customerFill.deliveryCustomerId = task.deliveryCustomerId || ''
  customerFill.deliveryContactId = task.deliveryContactId || ''
  autoPickContact('pickup')
  autoPickContact('delivery')
  customerFillVisible.value = true
}

/* 同角色只有一个联系人就自动选中 */
const autoPickContact = (side) => {
  const pool = side === 'pickup' ? fillPickupContacts.value : fillDeliveryContacts.value
  const curKey = side === 'pickup' ? 'pickupContactId' : 'deliveryContactId'
  if (pool.length === 1) {
    customerFill[curKey] = pool[0].id
    return
  }
  if (customerFill[curKey] && !pool.some(c => c.id === customerFill[curKey])) {
    customerFill[curKey] = ''
  }
}

/* 「唯一」联系人：另一端还空着就一起带上 */
const mirrorIfUnique = (side) => {
  const contactKey = side === 'pickup' ? 'pickupContactId' : 'deliveryContactId'
  const customerKey = side === 'pickup' ? 'pickupCustomerId' : 'deliveryCustomerId'
  const otherContactKey = side === 'pickup' ? 'deliveryContactId' : 'pickupContactId'
  const otherCustomerKey = side === 'pickup' ? 'deliveryCustomerId' : 'pickupCustomerId'

  const contact = contactById(customerFill[contactKey])
  if (!contact || !isUniqueContact(contact)) return
  if (customerFill[otherContactKey]) return      // 另一端已经选过，尊重用户选择
  customerFill[otherCustomerKey] = customerFill[customerKey]
  customerFill[otherContactKey] = contact.id
}

const onFillCustomerChange = (side) => {
  const contactKey = side === 'pickup' ? 'pickupContactId' : 'deliveryContactId'
  customerFill[contactKey] = ''
  autoPickContact(side)
  mirrorIfUnique(side)
}

const onFillContactChange = (side) => {
  mirrorIfUnique(side)
}

const confirmCustomerFill = () => {
  const task = fillTask.value
  if (!task) return

  const pc = contactById(customerFill.pickupContactId)
  const dc = contactById(customerFill.deliveryContactId)

  task.pickupCustomerId = customerFill.pickupCustomerId || ''
  task.pickupCustomerName = customerNameOf(task.pickupCustomerId)
  task.pickupContactId = pc?.id || ''
  task.pickupContactName = pc?.name || ''
  if (pc?.phone) task.senderPhone = pc.phone

  task.deliveryCustomerId = customerFill.deliveryCustomerId || ''
  task.deliveryCustomerName = customerNameOf(task.deliveryCustomerId)
  task.deliveryContactId = dc?.id || ''
  task.deliveryContactName = dc?.name || ''
  if (dc?.phone) task.receiverPhone = dc.phone

  markDirty()
  customerFillVisible.value = false

  const names = [pc?.name, dc?.name].filter(Boolean)
  if (names.length) {
    ElMessage.success(`已带入联系人「${[...new Set(names)].join('、')}」的联系电话`)
  } else if (!task.pickupCustomerId && !task.deliveryCustomerId) {
    ElMessage.info('已清除客户关联，联系电话保留可手动改')
  } else {
    ElMessage.warning('该客户还没有对应角色的联系人，电话未带入，可手动填写')
  }
}

const clearCustomerFill = (task) => {
  if (!task) return
  task.pickupCustomerId = ''
  task.pickupCustomerName = ''
  task.pickupContactId = ''
  task.pickupContactName = ''
  task.deliveryCustomerId = ''
  task.deliveryCustomerName = ''
  task.deliveryContactId = ''
  task.deliveryContactName = ''
  markDirty()
  ElMessage.info('已清除客户关联，联系电话保留可手动改')
}

/* ============================================================
   ⭐ 货物档案 → 计费规则：带出名称 / 单位 / 含税单价，按数量算运费
   ============================================================ */
const cargoFillVisible = ref(false)
const cargoFillIndex = ref(-1)
const cargoFill = reactive({ cargoId: '', ruleId: '' })

const cargoFillItem = computed(() => (cargoFillIndex.value >= 0 ? form.cargoList[cargoFillIndex.value] : null))
const cargoFillCargo = computed(() => cargoArchives.value.find(c => c.id === cargoFill.cargoId) || null)
const cargoFillRules = computed(() => cargoRuleList.value.filter(r => r.cargo_id === cargoFill.cargoId))
const cargoFillRule = computed(() => cargoFillRules.value.find(r => r.id === cargoFill.ruleId) || null)

const formatMoney = (v) => (v === null || v === undefined || v === '' ? '--' : Number(v).toFixed(2))

const estimateFreight = computed(() => {
  const item = cargoFillItem.value
  const rule = cargoFillRule.value
  if (!item || !rule) return '--'
  const next = calcFreight({
    priceUnit: rule.price_unit,
    price: rule.price_tax,
    quantity: item.quantity,
    distance: taskDistanceOf(item),
  })
  return next === null ? '--' : `¥${next.toFixed(2)}`
})

const autoPickCargoRule = () => {
  const list = cargoFillRules.value
  if (list.length === 1) { cargoFill.ruleId = list[0].id; return }
  if (cargoFill.ruleId && !list.some(r => r.id === cargoFill.ruleId)) cargoFill.ruleId = ''
}

const openCargoFill = (index) => {
  if (!cargoArchives.value.length) {
    ElMessage.info('货物档案里还没有货物，可到「档案管理 → 货物档案」新增')
    return
  }
  const item = form.cargoList[index]
  if (!item) return
  cargoFillIndex.value = index
  const rule = cargoRuleList.value.find(r => r.id === item.ruleId)
  cargoFill.cargoId = rule?.cargo_id || ''
  cargoFill.ruleId = item.ruleId || ''
  if (cargoFill.cargoId) autoPickCargoRule()
  cargoFillVisible.value = true
}

const onCargoFillCargoChange = () => {
  cargoFill.ruleId = ''
  autoPickCargoRule()
}

/* 该货物行所属任务的规划里程（来自「从路线填充」，没有就是 0） */
const taskDistanceOf = (item) => {
  const t = tasks.value.find(x => x.id === item?.taskId)
  return Number(t?.planInfo?.distance) || 0
}

/* 运费按计价单位算：数量×单价 / 里程×单价 / 取单价 / 手填
   （手动改过运费就不再自动覆盖） */
const recalcCargoFreight = (item) => {
  if (!item || !item.ruleId || item.autoFreight === false) return
  const next = calcFreight({
    priceUnit: item.priceUnit,
    price: item.priceTax,
    quantity: item.quantity,
    distance: taskDistanceOf(item),
  })
  if (next === null) return
  item.freight = next
  triggerDistribute()
}

const onCargoQuantityChange = (item) => {
  recalcCargoFreight(item)
  triggerDistribute()
}

const onCargoFreightChange = (item) => {
  item.autoFreight = false
  triggerDistribute()
}

const confirmCargoFill = () => {
  const item = cargoFillItem.value
  const cargo = cargoFillCargo.value
  const rule = cargoFillRule.value
  if (!item || !cargo || !rule) {
    ElMessage.warning('请选择货物和计费规则')
    return
  }
  item.name = cargo.name
  if (cargo.unit) item.unit = cargo.unit
  item.ruleId = rule.id
  item.ruleName = rule.name
  item.priceUnit = rule.price_unit || DEFAULT_PRICE_UNIT
  item.priceTax = rule.price_tax === null || rule.price_tax === undefined ? null : Number(rule.price_tax)
  item.priceNoTax = rule.price_no_tax === null || rule.price_no_tax === undefined ? null : Number(rule.price_no_tax)
  item.autoFreight = true
  recalcCargoFreight(item)

  const qty = Number(item.quantity) || 0
  const dist = taskDistanceOf(item)
  const formula = freightFormula(item.priceUnit)
  markDirty()
  cargoFillVisible.value = false
  ElMessage.success(
    formula === '需人工填写'
      ? `已带入「${rule.name}」，该规则按${priceUnitShort(item.priceUnit)}计价，运费请手动填写`
      : `已带入「${rule.name}」，运费按「${formula}」自动计算${qty || dist ? '' : '，填好数量后生效'}`
  )
}

const clearCargoRule = (item) => {
  item.ruleId = ''
  item.ruleName = ''
  item.priceUnit = DEFAULT_PRICE_UNIT
  item.priceTax = null
  item.priceNoTax = null
  item.autoFreight = true
  markDirty()
  ElMessage.info('已清除计费规则，货物名称和单位保留')
}

const tasks = ref([
  {
    id: nextTaskId++,
    customName: '',
    color: taskColors[colorIndex++ % taskColors.length],
    pickupLocation: '',
    pickupTime: '',
    senderPhone: '',
    pickupCustomerId: '',
    pickupContactId: '',
    pickupContactName: '',
    deliveryLocation: '',
    deliveryTime: '',
    receiverPhone: '',
    deliveryCustomerId: '',
    deliveryContactId: '',
    deliveryContactName: '',
    routeId: null,
    routeName: '',
    planIdx: null,
    planName: '',
    planColor: '',
    planInfo: null,
  }
])

/* ⭐ 货物行列宽：单任务时把右侧操作列收窄，把空间让给「货物名称 / 运费」，
   避免窄屏下输入框被压成只剩两个箭头 */
const cargoSpans = computed(() => {
  if (tasks.value.length > 1) {
    return { name: 4, qty: 3, unit: 3, freight: 3, task: 6, actions: 5 }
  }
  const needDelete = !(tasks.value.length === 1 && form.cargoList.length === 1)
  if (needDelete) {
    return { name: 6, qty: 4, unit: 4, freight: 4, actions: 6 }
  }
  return { name: 7, qty: 4, unit: 4, freight: 4, actions: 5 }
})

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
      form.cargoList = [{
        id: nextCargoId++, name: '', quantity: null, unit: DEFAULT_UNIT, freight: 0.00, taskId: tasks.value[0]?.id || 1,
        ruleId: '', ruleName: '', priceUnit: DEFAULT_PRICE_UNIT, priceTax: null, priceNoTax: null, autoFreight: true,
      }]
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
    if (cloneData.transportMode) {
      form.transportMode = cloneData.transportMode
    }

    /* ⭐ 常驻设置一并还原（类型 / 有效期 / 次数上限），但**分组号不要沿用**：
       每次发布都是一个独立的常驻运单（2026-10-24 19:56 用户定稿），
       组号在发布时按新单号生成 `CZ + 单号后 12 位`。 */
    if (cloneData.recurring) {
      isRecurring.value = !!cloneData.recurring.isRecurring
      recurringType.value = cloneData.recurring.type || 'time'
      recurringStart.value = cloneData.recurring.start || ''
      recurringEnd.value = cloneData.recurring.end || ''
      recurringCount.value = cloneData.recurring.count || 1
      recurringGroupNo.value = ''
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
  await loadArchiveData()

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
    pickupCustomerId: '',
    pickupContactId: '',
    pickupContactName: '',
    deliveryLocation: '',
    deliveryTime: '',
    receiverPhone: '',
    deliveryCustomerId: '',
    deliveryContactId: '',
    deliveryContactName: '',
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
  form.cargoList.push({
    id: nextCargoId++, name: '', quantity: null, unit: DEFAULT_UNIT, freight: 0.00, taskId: firstTaskId,
    ruleId: '', ruleName: '', priceUnit: DEFAULT_PRICE_UNIT, priceTax: null, priceNoTax: null, autoFreight: true,
  })
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

    /* ⭐ 子母车（一个任务派给多个司机/车辆）：每个指派的承运数量**之和必须等于货物总量**
       （默认平分、也可以单独改；改到不等于总量就会丢货/多货，这里直接拦掉） */
    const taskQty = form.cargoList
      .filter(c => c.taskId === task.id)
      .reduce((sum, c) => sum + (Number(c.quantity) || 0), 0)
    if (taskQty > 0 && taskAssigns.length) {
      const carrySum = taskAssigns.reduce(
        (sum, a) => sum + a.items.reduce((s, i) => s + (Number(i.carryQuantity) || 0), 0),
        0
      )
      if (carrySum > 0 && Math.abs(carrySum - taskQty) > 0.01) {
        ElMessage.error(
          `任务${tIndex + 1} 的承运数量之和 ${carrySum} 与货物总量 ${taskQty} 不一致，` +
          `请调整各司机/车辆的装货量（合计必须等于 ${taskQty}）`
        )
        return false
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
        // ⭐ 货物档案计费规则（选填，用于对账追溯）
        cargo_rule_name: taskCargos.map(c => c.ruleName).filter(Boolean)[0] || null,
        cargo_price_tax: taskCargos.find(c => c.priceTax !== null && c.priceTax !== undefined)?.priceTax ?? null,
        cargo_price_unit: taskCargos.find(c => c.priceTax !== null && c.priceTax !== undefined)?.priceUnit || null,
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
        // ⭐ 客户档案关联（选填）：客户 + 装货/卸货联系人电话
        customer_archive_id: task.pickupCustomerId || task.deliveryCustomerId || null,
        customer_archive_name:
          task.pickupCustomerName ||
          customerNameOf(task.pickupCustomerId) ||
          task.deliveryCustomerName ||
          customerNameOf(task.deliveryCustomerId) ||
          null,
        pickup_contact_name: task.pickupContactName || null,
        pickup_contact_phone: task.senderPhone || null,
        delivery_contact_name: task.deliveryContactName || null,
        delivery_contact_phone: task.receiverPhone || null,
        // ⭐ 运输节点模式：决定司机端要上报几步
        transport_mode: form.transportMode || '极简',
        // 打卡只在「详细」模式下有意义
        check_in_required: form.transportMode === '详细' ? !!form.checkInRequired : false,
      }
            // ⭐ 从指派里提取「车队/机构」目标，写入 assigned_orgs
      const assignedOrgsSet = new Set()
      taskAssigns.forEach(a => {
        if (a.assignMethod === 'team') {
          a.items.forEach(item => {
            const t = String(item.target || '').trim()
            if (t) assignedOrgsSet.add(t)
          })
        }
      })
      // ⭐ 二级机构子账号创建的运单，默认把自己机构也加进去（保证自己能看见）
      if (isSubAccount && myOrgName.value) {
        assignedOrgsSet.add(myOrgName.value)
      }
      record.assigned_orgs = assignedOrgsSet.size > 0 ? Array.from(assignedOrgsSet).join(',') : null

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

    /* ⭐⭐ 2026-10-24 19:56 用户定稿：**每次发布都是一个独立的常驻运单**（新编号）。
       以前从「创建相同运单」进来会沿用旧的分组号、把自己变成"第 N 趟"，
       用户的原话：「每个常驻运单不要成组，每一个都是对应的一条」。
       同一个常驻运单下的多趟，只能由司机在小程序点「接一趟」产生（trip_seq 才会 +1）。 */
    const reuseGroup = false
    const baseTripSeq = 1

    /* ⭐ 规划里程与起终点坐标：发布时算一次，
       之后「物流状态」刷新只拉东风轨迹，不再调高德 */
    const plans = []
    for (const task of tasks.value) {
      const from = fenceCenterOf(task.pickupLocation)
      const to = fenceCenterOf(task.deliveryLocation)
      const route = await planRoute(from, to)
      plans.push({
        pickup_lng: from ? from[0] : null,
        pickup_lat: from ? from[1] : null,
        delivery_lng: to ? to[0] : null,
        delivery_lat: to ? to[1] : null,
        plan_distance: route ? Math.round((route.distance / 1000) * 100) / 100 : null,
        plan_duration: route ? Math.round(route.duration / 60) : null,
      })
    }

    const waybillList = rawRecords.map((record, idx) => ({
      ...record,
      waybill_no: waybillNos[idx],
      ...(plans[idx] || {}),
      trip_seq: reuseGroup ? baseTripSeq : 1,
      ...buildRecurringFields(waybillNos[idx], reuseGroup ? recurringGroupNo.value : '')
    }))

    let res = await supabase
      .from('waybills')
      .insert(waybillList)
      .select()

    /* ⭐ 数据库还没执行 sql/2026-10-16_recurring_task_and_status_log.sql 时降级：
       去掉常驻字段重试，保证普通运单仍然能发布 */
    if (res.error && /column|字段|does not exist|不存在/i.test(res.error.message || '')) {
      console.warn(
        '[运单新字段] waybills 缺少常驻任务 / 运输节点字段，本次降级发布。' +
        '请在 CloudBase 控制台执行 sql/2026-10-16_recurring_task_and_status_log.sql'
      )
      ElMessage.warning('数据库尚未支持常驻任务 / 运输节点字段，本次已按普通运单发布')
      res = await supabase.from('waybills').insert(stripNewFields(waybillList)).select()
    }

    const { data, error } = res
    if (error) throw error

    ElMessage.success(`运单发布成功！共生成 ${waybillList.length} 条运单`)

    /* ⭐⭐ 续建到同一个组（reuseGroup）时，把**组级配置**刷新到最新，并把「已结束」刷回「生效中」：
       · 组主那条的 recurring_status 常常已经因为「次数用满 / 过期」被收口成已结束，
         续建的新趟次派出去后，司机端会把整组沉到「已结束」段、点接一趟还会 409；
       · 有效期 / 次数上限也写在组主上，不刷新的话司机端显示的还是老期限。
       （2026-10-24 用户报「web 发了常驻运单，三端都不显示」就是这条链路） */
    if (reuseGroup && recurringGroupNo.value) {
      try {
        const patch = { recurring_status: '生效中' }
        if (isRecurring.value) {
          patch.recurring_type = recurringType.value
          if (recurringType.value === 'time') {
            patch.recurring_start_time = recurringStart.value || null
            patch.recurring_end_time = recurringEnd.value || null
          } else {
            patch.recurring_max_count = Number(recurringCount.value) || null
          }
        }
        await supabase
          .from('waybills')
          .update(patch)
          .eq('recurring_group_no', recurringGroupNo.value)
      } catch (e) {
        console.warn('[常驻] 刷新任务级配置失败（不影响已发布的运单）', e)
      }
    }

    /* ⭐ 派单提醒：直接指派了司机的运单，调云函数发订阅消息（没配模板会自动跳过）。
       fire-and-forget，失败不影响发布结果。 */
    try {
      const nos = (Array.isArray(data) ? data : []).map((r) => r.waybill_no).filter(Boolean).slice(0, 10)
      nos.forEach((no) => {
        app.callFunction({ name: 'wx-notify', data: { action: 'assigned', waybill_no: no } })
          .catch((e) => console.warn('[派单提醒] 发送失败（不阻断）', no, e))
      })
    } catch (e) {
      console.warn('[派单提醒] 触发异常（不阻断）', e)
    }

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
        // ⭐ 客户档案关联一并带走
        pickupCustomerId: t.pickupCustomerId || '',
        pickupContactId: t.pickupContactId || '',
        pickupContactName: t.pickupContactName || '',
        deliveryCustomerId: t.deliveryCustomerId || '',
        deliveryContactId: t.deliveryContactId || '',
        deliveryContactName: t.deliveryContactName || '',
        routeId: t.routeId,
        routeName: t.routeName,
        planIdx: t.planIdx,
        planName: t.planName,
        planColor: t.planColor,
        planInfo: t.planInfo,
        // ⭐ 续建时用来做「按上一趟 +1 天」，固定记源值，重复点不会累积
        planFromPickup: t.pickupTime || '',
        planFromPlan: t.deliveryTime || '',
      })),
      cargoList: form.cargoList.map(c => ({
        name: c.name,
        quantity: c.quantity,
        unit: c.unit,
        freight: c.freight,
        taskId: c.taskId,
        // ⭐ 计费规则一并带走，续建时还能按数量自动算运费
        ruleId: c.ruleId || '',
        ruleName: c.ruleName || '',
        priceUnit: c.priceUnit || DEFAULT_PRICE_UNIT,
        priceTax: c.priceTax ?? null,
        priceNoTax: c.priceNoTax ?? null,
        autoFreight: c.autoFreight !== false,
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
      checkInRequired: form.checkInRequired,
      transportMode: form.transportMode,
      // ⭐ 常驻任务随克隆一起带走（含分组号），续建的是同一常驻任务的新运输记录
      recurring: {
        isRecurring: isRecurring.value,
        type: recurringType.value,
        start: recurringStart.value,
        end: recurringEnd.value,
        count: recurringCount.value,
        groupNo: recurringGroupNo.value
      }
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
  background: linear-gradient(180deg, var(--brand-primary), var(--brand-primary-dark));
  border-radius: 2px;
  box-shadow: 0 0 8px rgba(var(--brand-rgb), 0.35);
}

/* 分区标题 */
.section-title {
  font-size: 15px;
  font-weight: 800;
  color: #0F172A;
  margin: 16px 0 12px 0;
  padding: 10px 14px;
  background: linear-gradient(90deg, var(--brand-primary-light) 0%, #ffffff 100%);
  border-radius: 8px;
  border-left: 4px solid var(--brand-primary);
  line-height: 1.2;
  text-align: left;
  box-shadow: 0 2px 8px rgba(var(--brand-rgb), 0.05);
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
  background: linear-gradient(180deg, var(--brand-primary), var(--brand-primary-dark));
  opacity: 0;
  transition: opacity 0.3s;
}
.task-card:hover {
  box-shadow: 0 8px 24px rgba(var(--brand-rgb), 0.1);
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
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  color: #fff;
  border-radius: 6px;
  box-shadow: 0 2px 6px rgba(var(--brand-rgb), 0.25);
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
.task-header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
  flex-shrink: 0;
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
   ⭐ 从客户档案填充（任务头按钮 / 已带徽章）
   ============================================================ */
.customer-fill-btn,
.cargo-fill-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 14px;
  background: #FFFFFF;
  border: 1.5px dashed #FCA5A5;
  border-radius: 20px;
  color: var(--brand-primary);
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: inherit;
  white-space: nowrap;
  line-height: 1;
  flex-shrink: 0;
}

.customer-fill-btn:hover,
.cargo-fill-btn:hover {
  background: linear-gradient(135deg, var(--brand-primary-light), var(--brand-primary-light));
  border-color: var(--brand-primary);
  border-style: solid;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(var(--brand-rgb), 0.2);
}

.customer-fill-btn .el-icon,
.cargo-fill-btn .el-icon {
  font-size: 13px;
}

.customer-fill-badge {
  display: inline-flex;
  align-items: stretch;
  height: 24px;
  border-radius: 20px;
  overflow: hidden;
  background: #FFFFFF;
  border: 1.5px solid #FECACA;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  flex-shrink: 0;
}

.customer-fill-badge:hover {
  border-color: var(--brand-primary);
  box-shadow: 0 4px 12px rgba(var(--brand-rgb), 0.15);
}

.cf-badge-main {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  border: none;
  background: var(--brand-primary-light);
  color: var(--brand-primary);
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  line-height: 1;
  white-space: nowrap;
}

.cf-badge-main .el-icon {
  font-size: 13px;
}

.cf-badge-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  border: none;
  border-left: 1px solid #FECACA;
  background: #FFFFFF;
  color: #F87171;
  cursor: pointer;
  transition: all 0.2s;
  padding: 0;
}

.cf-badge-clear:hover {
  background: #FEE2E2;
  color: #B91C1C;
}

.cf-badge-clear .el-icon {
  font-size: 12px;
}

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
  border: 1.5px solid var(--route-color, var(--brand-primary));
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
  background: var(--route-color, var(--brand-primary));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--route-color, var(--brand-primary)) 20%, transparent);
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
  color: var(--route-color, var(--brand-primary));
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
  background: color-mix(in srgb, var(--route-color, var(--brand-primary)) 8%, #fff);
  border: none;
  border-left: 1px solid color-mix(in srgb, var(--route-color, var(--brand-primary)) 25%, transparent);
  color: #94A3B8;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.2s;
  font-family: inherit;
  padding: 0;
}
.route-badge-clear:hover {
  background: #FEE2E2;
  color: var(--brand-primary);
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
  background-color: var(--brand-primary);
  color: #fff;
  font-weight: 800;
  font-size: 13px;
  text-align: center;
  flex-shrink: 0;
  margin-top: 2px;
  box-shadow: 0 4px 12px rgba(var(--brand-rgb), 0.35);
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
  color: var(--brand-primary);
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
  color: var(--brand-primary);
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
  box-shadow: 0 6px 20px rgba(var(--brand-rgb), 0.08);
  border-color: #FCA5A5;
}
.cargo-row .el-row { flex-wrap: nowrap; }
.cargo-row .el-form-item { margin-bottom: 0; }
.cargo-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  height: 100%;
  min-width: 0;
}

/* 计费规则徽章：规则名太长就省略 */
.cargo-rule-badge {
  max-width: 250px;
}

.cargo-rule-badge .cf-badge-main span {
  max-width: 176px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.assign-card {
  border-radius: 10px;
  padding: 8px 16px;
  margin-bottom: 8px;
  border: 1px solid #E2E8F0;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.assign-card:hover {
  box-shadow: 0 6px 20px rgba(var(--brand-rgb), 0.08);
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
.fence-cta-pickup:hover .fence-cta-hint .hint-icon { color: var(--brand-primary); }
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
  color: var(--brand-primary);
  background: #FFFFFF;
  border: 1px solid #FCA5A5;
  box-shadow: 0 2px 6px rgba(var(--brand-rgb), 0.06);
}
.fence-cta-delivery .fence-cta-action {
  color: #2563EB;
  background: #FFFFFF;
  border: 1px solid #93C5FD;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.06);
}
.fence-cta-pickup:hover .fence-cta-action {
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  color: #fff;
  border-color: var(--brand-primary);
  box-shadow: 0 4px 12px rgba(var(--brand-rgb), 0.35);
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
.fence-cta-pickup .plus-bubble { background: #FEE2E2; color: var(--brand-primary); }
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

/* 日期选择器紧凑样式
   ⚠️ popper 是 teleport 到 body 的，SFC 里的 scoped 样式**够不到**它。
   所以这批紧凑样式已经搬到全局 src/style.css 里（并顺手修掉了
   「给 .el-time-panel 设 max-height 把底部按钮挤到数字上」的 bug），
   这里只留一句说明，避免以后有人在两个地方各改一半。
   真正的实现见：src/style.css 的「日期时间选择器」小节。 */

/* ============================================================
   ⭐ 选择路线弹窗（居中 dialog）
   ============================================================ */
/* ⭐ el-dialog 会把 class 合并到 .el-dialog 自身，必须用同元素选择器 */
.route-select-dialog.el-dialog {
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
  background: var(--brand-primary-light) !important;
  box-shadow: 0 0 0 1px #FCA5A5 inset !important;
}
.rsd-search :deep(.el-input__wrapper.is-focus) {
  background: #fff !important;
  box-shadow: 0 0 0 1px var(--brand-primary) inset, 0 0 0 3px rgba(var(--brand-rgb), 0.12) !important;
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
  border-top-color: var(--brand-primary);
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
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  border: none;
  color: #fff;
  box-shadow: 0 6px 16px rgba(var(--brand-rgb), 0.3);
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.rsd-btns .btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(var(--brand-rgb), 0.45);
}
.rsd-btns .btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

/* ===== ⭐ 常驻任务弹窗 ===== */
.recurring-tip {
  margin-left: 12px;
  font-size: 12px;
  color: #94A3B8;
}
.shift-plan-btn {
  flex-shrink: 0;
  color: #A32D2D !important;
  border-color: #F7C1C1 !important;
  background: var(--brand-primary-light) !important;
  font-weight: 600;
}
.shift-plan-btn:hover {
  background: #FCEBEB !important;
  border-color: #E24B4A !important;
}
.recurring-hint {
  margin: -4px 0 14px 140px;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.7;
  color: #A32D2D;
  background: var(--brand-primary-light);
  border-left: 3px solid var(--brand-primary);
  border-radius: 6px;
}
/* ===== 客户档案下拉（选项渲染在 body，必须全局） ===== */
.archive-select-popper .el-select-dropdown__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.archive-opt {
  font-size: 13px;
  color: #1E293B;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-opt-sub {
  font-size: 11.5px;
  color: #94A3B8;
  flex: 0 0 auto;
}

.archive-select-popper .el-select-dropdown__item.is-selected .archive-opt,
.archive-select-popper .el-select-dropdown__item.is-selected .archive-opt-sub {
  color: var(--brand-primary);
}

.contact-empty-tip {
  padding: 14px 12px;
  font-size: 12.5px;
  color: #94A3B8;
  text-align: center;
}
/* ===== 从客户档案填充弹窗 ===== */
.customer-fill-dialog .el-dialog__body {
  padding-top: 12px;
}

.customer-fill-dialog .cf-intro,
.cargo-fill-dialog .cf-intro {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 11px;
  margin-bottom: 14px;
  border-radius: 8px;
  background: var(--brand-primary-light);
  border: 1px solid #FEE2E2;
  color: #9F1239;
  font-size: 12px;
  line-height: 1.7;
}

.customer-fill-dialog .cf-intro .el-icon,
.cargo-fill-dialog .cf-intro .el-icon {
  margin-top: 2px;
  flex: 0 0 auto;
}

.customer-fill-dialog .cf-intro span,
.cargo-fill-dialog .cf-intro span {
  word-break: keep-all;
  overflow-wrap: anywhere;
}

.customer-fill-dialog .cf-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.customer-fill-dialog .cf-side {
  padding: 12px 12px 4px;
  border: 1px solid #EEF2F7;
  border-radius: 10px;
  background: #FCFDFF;
}

.customer-fill-dialog .cf-side-head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 12px;
  font-size: 13.5px;
  font-weight: 700;
  color: #0F172A;
}

.customer-fill-dialog .cf-side-sub {
  margin-left: auto;
  font-size: 11.5px;
  font-weight: 400;
  color: #94A3B8;
}

.customer-fill-dialog .cf-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11.5px;
  font-weight: 800;
  color: #fff;
  flex: 0 0 auto;
}

.customer-fill-dialog .cf-dot.pickup {
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
}

.customer-fill-dialog .cf-dot.delivery {
  background: linear-gradient(135deg, #475569, #1E293B);
}

.customer-fill-dialog .cf-form .el-form-item,
.cargo-fill-dialog .cf-form .el-form-item {
  margin-bottom: 14px;
}

.customer-fill-dialog .cf-form .el-form-item__label,
.cargo-fill-dialog .cf-form .el-form-item__label {
  font-size: 12.5px;
  color: #475569;
  font-weight: 600;
}

.customer-fill-dialog .cf-phone {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px 62px;
  font-size: 12px;
}

.customer-fill-dialog .cf-phone-lbl {
  color: #94A3B8;
}

.customer-fill-dialog .cf-phone-val {
  font-weight: 700;
  color: var(--brand-primary);
  letter-spacing: 0.3px;
}

.customer-fill-dialog .cf-phone-val.empty {
  font-weight: 400;
  color: #CBD5E1;
  letter-spacing: 0;
}

.cargo-fill-dialog .cargo-fill-preview {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 14px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #F8FAFC;
  border: 1px solid #EEF2F7;
}

.cargo-fill-dialog .cfp-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.cargo-fill-dialog .cfp-item.wide {
  grid-column: 1 / -1;
}

.cargo-fill-dialog .cfp-lbl {
  font-size: 11.5px;
  color: #94A3B8;
}

.cargo-fill-dialog .cfp-val {
  font-size: 13px;
  color: #1E293B;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cargo-fill-dialog .cfp-val.strong {
  color: #0F172A;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.cargo-fill-dialog .cfp-val.strong small {
  font-weight: 400;
  color: #94A3B8;
}

.cargo-fill-dialog .cfp-val.price {
  color: var(--brand-primary);
  font-size: 15px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.customer-fill-dialog .uniq-tag {
  display: inline-block;
  margin-left: 5px;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--brand-primary-light);
  color: var(--brand-primary);
  font-style: normal;
  font-size: 10.5px;
  font-weight: 700;
  line-height: 15px;
}

.customer-fill-dialog .archive-select-popper {
  min-width: 220px;
}
</style>