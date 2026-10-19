<template>
  <div class="waybill-detail">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>运单详情</h2>
      <el-button type="danger" plain size="small" @click="router.push('/waybill')">返回列表</el-button>
    </div>

    <div class="detail-body">
      <!-- ===== 左侧常驻摘要（切 tab 不消失） ===== -->
      <aside class="detail-aside">
        <div class="as-card">
          <div class="as-top">
            <span class="as-no">{{ waybillNo || '—' }}</span>
            <span class="as-status" :style="statusStyle(asideStatus)">{{ asideStatus }}</span>
          </div>
          <div class="as-route">
            <span>{{ (activeRecord && activeRecord.pickup) || '—' }}</span>
            <i>→</i>
            <span>{{ (activeRecord && activeRecord.delivery) || '—' }}</span>
          </div>
          <div class="as-sub">{{ asideCargo }}</div>
        </div>

        <div class="as-card">
          <div class="as-row"><span>车辆 / 司机</span><b>{{ asideVehicle }}</b></div>
          <div class="as-row"><span>计划装货</span><b>{{ fmtTime(activeRecord && activeRecord.pickup_time) }}</b></div>
          <div class="as-row"><span>计划到达</span><b>{{ fmtTime(activeRecord && activeRecord.plan_time) }}</b></div>
        </div>

        <div class="as-fee" @click="switchTab('fee')">
          <div class="as-fee-top">
            <span>本单费用</span>
            <span>{{ feeReports.length }} 笔上报</span>
          </div>
          <div class="as-fee-v">¥{{ money(feeSummary.total) }}</div>
          <div class="as-fee-r">
            <span>待审 {{ feePendingTotal }}</span>
            <span>已通过 {{ feeSummary.approved }}</span>
            <span>已付款 ¥{{ money(feeSummary.paid) }}</span>
          </div>
        </div>

        <div class="as-hint">审批完一笔，这里的数字会跟着刷新；点费用卡直接跳到费用情况。</div>
      </aside>

      <div class="detail-main">
        <!-- ===== ⭐ 标签页切换 ===== -->
        <div class="detail-tabs">
          <button class="detail-tab" :class="{ active: activeTab === 'info' }" @click="switchTab('info')">
            运单信息
          </button>
          <button class="detail-tab" :class="{ active: activeTab === 'logistics' }" @click="switchTab('logistics')">
            物流状态
            <em class="detail-tab-dot" v-if="activeRecord"></em>
          </button>
          <button class="detail-tab" :class="{ active: activeTab === 'fee' }" @click="switchTab('fee')">
            费用情况
            <em class="detail-tab-dot" v-if="feePendingCount"></em>
          </button>
          <span class="detail-tabs-hint" v-if="waybillNo">运单号 {{ waybillNo }}</span>
        </div>

    <!-- ============================================================
         标签页 1：运单信息
         ============================================================ -->
    <div v-show="activeTab === 'info'">

    <!-- ============================================================
         ⭐ 运输节点与打卡管控
         放在 el-form 之外，按钮才不受表单 disabled 影响
         ============================================================ -->
    <div class="checkin-row">
      <div class="checkin-line">
        <span class="checkin-label">运输节点：</span>
        <el-tag :type="form.transportMode === '极简' ? 'info' : 'success'" effect="plain" size="small">
          {{ form.transportMode || '详细' }}
        </el-tag>
        <span class="hint-text">{{ transportModeHint }}</span>
      </div>

      <div class="checkin-line" v-if="form.transportMode === '详细'">
        <span class="checkin-label">装卸货地打卡：</span>
        <el-tag :type="form.checkInRequired ? 'success' : 'danger'" effect="plain" size="small">
          {{ form.checkInRequired ? '开启' : '已关闭' }}
        </el-tag>
        <el-button
          v-if="form.checkInRequired"
          type="danger"
          plain
          size="small"
          :loading="checkInSaving"
          @click="openCheckInOffDialog"
        >临时关闭打卡</el-button>
        <el-button
          v-else
          type="primary"
          plain
          size="small"
          :loading="checkInSaving"
          @click="restoreCheckIn"
        >恢复打卡</el-button>
        <span class="hint-text">
          {{ form.checkInRequired
            ? '司机「装车完成」需在装货地围栏内、「确认到达」需在卸货地围栏内'
            : '已临时关闭，司机无需在围栏内即可打卡' }}
        </span>
      </div>

      <!-- ⭐ 常驻任务：计划时间一键填充（没有计划时间就画不出计划条） -->
      <div class="checkin-line" v-if="isRecurringWaybill">
        <span class="checkin-label">计划时间：</span>
        <span class="checkin-value">{{ planTimeBrief }}</span>
        <el-button
          size="small"
          plain
          :loading="planSaving"
          :disabled="!prevTrip"
          @click="fillPlanTimeFromPrev"
        >按上一趟 +1 天</el-button>
        <span class="hint-text" v-if="prevTrip">
          上一趟：{{ fmtTime(prevTrip.pickup_time) }} ~ {{ fmtTime(prevTrip.plan_time) }}
        </span>
        <span class="hint-text" v-else>同组内没有可参考的上一趟</span>
      </div>

      <!-- 临时关闭留痕 -->
      <div class="checkin-off-tip" v-if="form.transportMode === '详细' && !form.checkInRequired && checkInOffText">
        {{ checkInOffText }}
      </div>
    </div>

    <el-form label-width="0" label-position="left" size="default" disabled>

      <!-- ===== ⭐ 拒单信息（仅「待重新指派」状态展示） ===== -->
      <div v-if="rejectInfo" class="reject-alert">
        <div class="reject-alert-title">
          <el-icon class="reject-alert-icon"><WarningFilled /></el-icon>
          <span>该运单已被司机拒单，等待重新指派</span>
          <span v-if="rejectInfo.count > 0" class="reject-count">累计被拒 {{ rejectInfo.count }} 次</span>
        </div>
        <div class="reject-alert-body">
          <div class="reject-line">
            <span class="reject-key">拒单原因</span>
            <span class="reject-val">{{ rejectInfo.reason }}</span>
          </div>
          <div v-if="rejectInfo.note" class="reject-line">
            <span class="reject-key">补充说明</span>
            <span class="reject-val">{{ rejectInfo.note }}</span>
          </div>
          <div class="reject-line">
            <span class="reject-key">拒单司机</span>
            <span class="reject-val">{{ rejectInfo.by || '--' }}</span>
          </div>
          <div class="reject-line">
            <span class="reject-key">拒单时间</span>
            <span class="reject-val reject-mono">{{ rejectInfo.timeText }}</span>
          </div>
        </div>
      </div>

      <!-- ===== 运输信息大标题 ===== -->
      <div class="section-title">运输信息</div>

      <!-- ===== 任务列表（只读） ===== -->
      <div v-for="(task, tIndex) in tasks" :key="task.id" class="task-card" :style="{ backgroundColor: task.color }">
        <div class="task-header">
          <div class="task-name-wrapper">
            <span class="task-label">任务{{ tIndex + 1 }}</span>
            <span class="task-name-display">{{ task.customName || '未命名任务' }}</span>
          </div>
        </div>

        <!-- 起 -->
        <div class="row-wrapper">
          <span class="badge-circle">起</span>
          <div class="field-group">
            <div class="field-item">
              <span class="field-label"><span class="required-star">*</span>装货地点：</span>
              <el-select v-model="task.pickupLocation" placeholder="请选择围栏" style="flex:1; min-width:110px;" disabled>
                <el-option label="围栏A" value="A" />
                <el-option label="围栏B" value="B" />
              </el-select>
            </div>
            <div class="field-item">
              <span class="field-label">计划装货时间：</span>
              <el-date-picker v-model="task.pickupTime" type="datetime" placeholder="请选择时间"
                style="flex:1; min-width:130px;" value-format="YYYY-MM-DD HH:mm:ss" disabled />
            </div>
            <div class="field-item">
              <span class="field-label">发货联系电话：</span>
              <el-input v-model="task.senderPhone" placeholder="请输入联系电话" style="flex:1; min-width:100px;" disabled />
            </div>
            <div v-if="task.pickupCustomer" class="field-item">
              <span class="field-label">装货客户：</span>
              <el-input v-model="task.pickupCustomer" style="flex:1; min-width:100px;" disabled />
            </div>
          </div>
        </div>

        <!-- 终 -->
        <div class="row-wrapper">
          <span class="badge-circle">终</span>
          <div class="field-group">
            <div class="field-item">
              <span class="field-label"><span class="required-star">*</span>卸货地点：</span>
              <el-select v-model="task.deliveryLocation" placeholder="请选择围栏" style="flex:1; min-width:110px;" disabled>
                <el-option label="围栏C" value="C" />
                <el-option label="围栏D" value="D" />
              </el-select>
            </div>
            <div class="field-item">
              <span class="field-label">计划到达时间：</span>
              <el-date-picker v-model="task.deliveryTime" type="datetime" placeholder="请选择时间"
                style="flex:1; min-width:130px;" value-format="YYYY-MM-DD HH:mm:ss" disabled />
            </div>
            <div class="field-item">
              <span class="field-label">收货联系电话：</span>
              <el-input v-model="task.receiverPhone" placeholder="请输入联系电话" style="flex:1; min-width:100px;" disabled />
            </div>
            <div v-if="task.deliveryCustomer" class="field-item">
              <span class="field-label">卸货客户：</span>
              <el-input v-model="task.deliveryCustomer" style="flex:1; min-width:100px;" disabled />
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 货物信息 ===== -->
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

      <!-- 货物列表（只读） -->
      <div v-for="(item, index) in form.cargoList" :key="item.id" class="cargo-row"
        :style="{ backgroundColor: getTaskColor(item.taskId) }">
        <el-row :gutter="12" align="middle" style="flex-wrap: nowrap;">
          <el-col :span="5" style="white-space: nowrap;">
            <el-form-item :label="`*货物${index + 1}`" label-width="80px">
              <el-input v-model="item.name" placeholder="请输入货物名称" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="3" style="white-space: nowrap;">
            <el-form-item label="数量" label-width="50px">
              <el-input-number v-model="item.quantity" :min="0" controls-position="right" style="width:100%;" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="2" style="white-space: nowrap;">
            <el-form-item label="单位" label-width="40px">
              <el-input :model-value="unitFull(item.unit)" :title="unitFull(item.unit)" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="3" style="white-space: nowrap;">
            <el-form-item label="运费" label-width="50px">
              <el-input-number v-model="item.freight" :min="0" :precision="2" :step="1" controls-position="right"
                style="width:100%;" placeholder="0.00" disabled />
            </el-form-item>
          </el-col>
          <el-col v-if="tasks.length > 1" :span="6" style="white-space: nowrap;">
            <el-form-item label="绑定任务" label-width="70px">
              <el-select v-model="item.taskId" placeholder="选择任务" style="width:100%; min-width:200px;" disabled>
                <el-option v-for="t in tasks" :key="t.id"
                  :label="`任务${getTaskIndex(t.id) + 1}${t.customName ? ' - ' + t.customName : ''}`" :value="t.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="tasks.length > 1 ? 5 : 11" class="cargo-actions">
            <!-- 只读，无操作按钮 -->
          </el-col>
        </el-row>
      </div>

      <!-- ===== 指派信息 ===== -->
      <div class="section-title">指派信息</div>
      <div v-for="(assign, aIndex) in assignList" :key="assign.id" class="assign-card"
        :style="{ backgroundColor: getTaskColor(assign.taskId) }">
        <el-row :gutter="12" align="middle" style="flex-wrap: nowrap; margin-bottom: 8px;">
          <el-col :span="5" style="white-space: nowrap;">
            <el-form-item label="*指派方式" label-width="80px">
              <el-select v-model="assign.assignMethod" placeholder="请选择" style="width:100%;" disabled>
                <el-option label="指派司机" value="driver" />
                <el-option label="指派车辆" value="vehicle" />
                <el-option label="指派车队" value="team" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col v-if="tasks.length > 1" :span="7" style="white-space: nowrap;">
            <el-form-item label="绑定任务" label-width="70px">
              <el-select v-model="assign.taskId" placeholder="选择任务" style="width:100%; min-width:200px;" disabled>
                <el-option v-for="t in tasks" :key="t.id"
                  :label="`任务${getTaskIndex(t.id) + 1}${t.customName ? ' - ' + t.customName : ''}`" :value="t.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="tasks.length > 1 ? 12 : 19" class="assign-actions">
            <!-- 只读 -->
          </el-col>
        </el-row>

        <div class="assign-items">
          <div v-for="(item, iIndex) in assign.items" :key="item.id" class="assign-item">
            <el-row :gutter="12" align="middle" style="flex-wrap: nowrap;">
              <el-col :span="5" style="white-space: nowrap;">
                <el-form-item :label="getItemLabel(assign.assignMethod, iIndex + 1)" label-width="80px">
                  <el-select v-if="assign.assignMethod === 'driver'" v-model="item.target" placeholder="请选择司机"
                    style="width:100%;" disabled>
                    <el-option label="张三" value="张三" />
                    <el-option label="李四" value="李四" />
                    <el-option label="王五" value="王五" />
                  </el-select>
                  <el-select v-else-if="assign.assignMethod === 'vehicle'" v-model="item.target" placeholder="请选择车辆"
                    style="width:100%;" disabled>
                    <el-option label="鄂A12345" value="鄂A12345" />
                    <el-option label="鄂B67890" value="鄂B67890" />
                  </el-select>
                  <el-select v-else-if="assign.assignMethod === 'team'" v-model="item.target" placeholder="请选择车队"
                    style="width:100%;" disabled>
                    <el-option label="第一车队" value="第一车队" />
                    <el-option label="第二车队" value="第二车队" />
                  </el-select>
                  <el-input v-else disabled placeholder="请先选择指派方式" />
                </el-form-item>
              </el-col>
              <el-col :span="3" style="white-space: nowrap;">
                <el-form-item label="承运量" label-width="60px">
                  <el-input-number v-model="item.carryQuantity" :min="0" :precision="2" :step="1"
                    controls-position="right" style="width:100%;" placeholder="0.00" disabled />
                </el-form-item>
              </el-col>
              <el-col :span="3" style="white-space: nowrap;">
                <el-form-item label="运费" label-width="40px">
                  <el-input-number v-model="item.carryFreight" :min="0" :precision="2" :step="1"
                    controls-position="right" style="width:100%;" placeholder="0.00" disabled />
                </el-form-item>
              </el-col>
              <el-col :span="3" class="assign-item-actions">
                <!-- 只读 -->
              </el-col>
            </el-row>
          </div>
        </div>
      </div>
    </el-form>

    <!-- 底部按钮（移出 el-form，确保不受 disabled 影响） -->
    <div class="form-actions">
      <el-button @click="router.push('/waybill')">关闭</el-button>
      <el-button type="primary" plain style="border-color:#c8102e; color:#c8102e;" @click="createSameWaybill">
        创建相同运单
      </el-button>
    </div>
    </div>

    <!-- ============================================================
         ⭐ 标签页 2：物流状态
         · 常驻运单  → 历次完成情况 + 周期甘特（按天）+ 当天明细（不显示地图）
         · 普通运单  → 实际进度双条 + 地图轨迹 + 节点时间轴
         ============================================================ -->
    <div v-show="activeTab === 'logistics'" class="lg-panel">

      <!-- ⭐ 刷新工具条（常驻与普通两条路径共用） -->
      <div class="lg-toolbar">
        <span class="lg-updated">更新于 {{ refreshedAtText }}</span>
        <el-button
          size="small"
          plain
          :loading="loadingLogistics"
          @click="refreshLogistics"
        >
          <el-icon v-if="!loadingLogistics" class="lg-refresh-icon"><Refresh /></el-icon>
          刷新
        </el-button>
      </div>

      <!-- ===== 常驻任务：任务级操作条（暂停 / 恢复 / 结束） =====
           ⭐ 用户 2026-10-17：常驻任务可以暂停、可以结束；
              有趟次在进行中（待装车…已到达）时**不允许**，会提示「有任务在进行中」 -->
      <div class="rec-task-bar" v-if="isRecurringWaybill">
        <div class="rec-task-left">
          <span class="rec-task-name">常驻任务 {{ recGroupNo }}</span>
          <span class="rec-task-status" :style="recStatusStyle">{{ recTaskStatus }}</span>
        </div>
        <div class="rec-task-right">
          <el-button
            v-if="recTaskStatus === '生效中'"
            size="small"
            plain
            :disabled="recHasRunning || settingRecStatus"
            @click="setRecurringStatus('已暂停')"
          >暂停</el-button>
          <el-button
            v-else-if="recTaskStatus === '已暂停'"
            size="small"
            type="primary"
            plain
            :disabled="settingRecStatus"
            @click="setRecurringStatus('生效中')"
          >恢复</el-button>
          <el-button
            v-if="recTaskStatus !== '已结束'"
            size="small"
            type="danger"
            plain
            :disabled="recHasRunning || settingRecStatus"
            @click="setRecurringStatus('已结束')"
          >结束</el-button>
        </div>
        <div class="rec-task-hint" v-if="recTaskHint">{{ recTaskHint }}</div>
      </div>

      <!-- ===== 常驻任务：周期甘特 ===== -->
      <RecurringTaskGantt
        v-if="isRecurringWaybill"
        :records="records"
        :task="mainRecord"
        :progress-map="progressMap"
      />

      <!-- ============================================================
           ⭐ 分车承运（一货多车）
           结构 = 上方「每趟一条甘特」 + 左侧「一图叠多车」 + 右侧「该趟节点时间」
           ⚠️ 图例、车辆实时位置、轨迹概况一律**移出地图**：它们原本浮在地图右下角，
              会和高德注入的车牌气泡压在同一个像素上（用户 2026-10-17 反馈的「重合」）
           ============================================================ -->
      <div v-else-if="isMultiLegWaybill" class="lg-multi">
        <div class="lg-legs-head">
          <span class="lg-legs-title">分车承运 · 共 {{ multiLegs.length }} 趟</span>
          <span class="lg-legs-sub">
            已完成 {{ multiLegDone }}/{{ multiLegs.length }} ·
            承运合计 {{ multiLegCarrySum }}/{{ Number(mainRecord.quantity) || 0 }}
          </span>
          <span class="lg-legs-hint">
            {{ legFocus === null ? '点甘特行可只看这一辆车' : '再点同一行看全部车辆' }}
          </span>
        </div>

        <!-- 地图上方：每趟一条甘特（计划 vs 实际），点一行 = 切面板 + 只看这一辆 -->
        <div class="lg-leg-gantt">
          <div
            v-for="(leg, i) in multiLegs"
            :key="leg.progressKey"
            class="lg-gantt-row"
            :class="{
              'is-on': legFocus === i,
              'is-dim': legFocus !== null && legFocus !== i,
              'is-done': leg.status === '已完成',
            }"
            @click="selectLeg(i)"
          >
            <div class="lg-gantt-head">
              <span class="lg-leg-dot" :style="{ background: leg.color }"></span>
              <span class="lg-gantt-name">{{ leg.title }}</span>
              <span class="lg-status-tag" :style="statusStyle(leg.status)">{{ leg.status }}</span>
              <span class="lg-gantt-carry">承运 {{ leg.qty }}</span>
              <span class="lg-gantt-times">
                接单 {{ fmtTime(leg.acceptTime) }} → 完成 {{ fmtTime(leg.finishTime) }}
              </span>
            </div>
            <WaybillProgressBar
              :trip="legRecordOf(leg)"
              :progress="legProgressOf(leg)"
              :dense="true"
              :label="''"
              :sublabel="''"
              :show-legend="i === multiLegs.length - 1"
            />
            <div class="lg-gantt-reject" v-if="leg.status === '待重新指派'">
              {{ leg.rejectReason || '已拒单' }}
            </div>
          </div>
          <div class="lg-empty" v-if="!multiLegs.length">
            <span class="lg-empty-text">这单没有指派明细</span>
          </div>
        </div>

        <!-- 地图工具条：图例 + 当前聚焦的车辆（替代原来压在地图上的浮层） -->
        <div class="lg-map-tools">
          <span><i class="lg-lg-dot start"></i>装货地</span>
          <span><i class="lg-lg-dot end"></i>卸货地</span>
          <span><i class="lg-lg-line"></i>行驶轨迹</span>
          <span><i class="lg-lg-dot car"></i>车辆位置</span>
          <span class="lg-map-tip">滚轮滚页面 · 双击地图放大</span>
          <span class="lg-map-focus">
            地图：
            <template v-if="legFocus === null">全部 {{ multiLegs.length }} 辆车</template>
            <template v-else>仅 {{ multiLegs[legFocus] ? multiLegs[legFocus].title : '--' }}</template>
            <button v-if="legFocus !== null" class="lg-map-clear" @click="clearLegFocus">看全部</button>
          </span>
        </div>

        <div class="lg-main">
          <div class="lg-map-wrap lg-map-wrap-multi">
            <div id="wb-map" class="lg-map"></div>
            <div class="lg-map-mask" v-if="mapHint"><span>{{ mapHint }}</span></div>
          </div>

          <!-- 右侧：该趟的节点时间（与普通运单同一套口径，页签切趟） -->
          <div class="lg-timeline" v-if="activeLeg">
            <div class="lg-tl-head lg-tl-head-legs">
              <span class="lg-tl-title">节点时间</span>
              <span class="lg-tl-tabs">
                <button
                  v-for="(leg, i) in multiLegs"
                  :key="leg.progressKey"
                  class="lg-tl-tab"
                  :class="{ active: legTab === i }"
                  @click="selectLeg(i)"
                >
                  <i :style="{ background: leg.color }"></i>{{ leg.tabLabel }}
                </button>
              </span>
            </div>

            <!-- 这一趟的车辆实时位置（原来是浮在地图上的车辆卡） -->
            <div class="lg-tl-live">
              <template v-if="activeLegLive">
                <div class="lg-vc-head">
                  <span class="lg-vc-plate">{{ activeLegLive.plate }}</span>
                  <span class="lg-status-tag" :style="statusStyle(activeLegLive.status)">{{ activeLegLive.status }}</span>
                </div>
                <div class="lg-vc-line">
                  {{ activeLegLive.locationText }}
                  <em class="lg-vc-extra" v-if="activeLegTrackInfo">
                    · 轨迹 {{ activeLegTrackInfo.total }} 点 · {{ activeLegTrackInfo.from }} ~ {{ activeLegTrackInfo.to }}
                  </em>
                </div>
                <div class="lg-vc-line lg-vc-mono">
                  上报 {{ fmtTime(activeLegLive.reportTime) }} · 速度 {{ activeLegLive.speed }} km/h
                </div>
              </template>
              <div class="lg-vc-line" v-else>{{ activeLegTripHint || '暂无车辆定位' }}</div>
            </div>

            <div class="lg-tl-body">
              <!-- 拒单提示 -->
              <div class="lg-reassign" v-if="activeLeg.status === '待重新指派'">
                <div class="lg-reassign-title">已被司机拒单，等待重新指派</div>
                <div class="lg-reassign-line" v-if="activeLeg.rejectReason">原因：{{ activeLeg.rejectReason }}</div>
                <div class="lg-reassign-line" v-if="activeLeg.rejectBy">司机：{{ activeLeg.rejectBy }}</div>
              </div>

              <template v-for="node in legTimelineNodes" :key="node.key">
                <!-- 「已接单」分组标题 -->
                <div v-if="node.isGroup" class="lg-group" :class="'is-' + node.state">
                  <span class="lg-group-label">{{ node.label }}</span>
                  <span class="lg-group-time">{{ node.timeText }}</span>
                  <span class="lg-group-operator" v-if="node.operator">{{ node.operator }}</span>
                </div>

                <!-- 普通节点 -->
                <div
                  v-else
                  class="lg-node"
                  :class="['is-' + node.state, node.indent ? 'is-sub' : 'is-root']"
                >
                  <span class="lg-node-dot"></span>
                  <div class="lg-node-body">
                    <div class="lg-node-label">
                      <span class="lg-node-name">{{ node.label }}</span>
                      <span class="lg-node-badge" v-if="node.state === 'active'">进行中</span>
                      <span class="lg-node-badge is-done" v-else-if="node.state === 'done'">已完成</span>
                    </div>
                    <div class="lg-node-time">
                      <span>进入 <b>{{ fmtTime(node.enterAt) }}</b></span>
                      <span class="lg-node-sep">·</span>
                      <span>
                        完成
                        <b v-if="node.doneAt">{{ fmtTime(node.doneAt) }}</b>
                        <b v-else-if="node.state === 'active'" class="lg-running">{{ node.stayText }}</b>
                        <b v-else class="lg-pending">--</b>
                      </span>
                    </div>
                    <div class="lg-node-remark" v-if="node.remark">{{ node.remark }}</div>
                  </div>
                </div>
              </template>
            </div>

            <div class="lg-tl-foot">
              <div class="lg-foot-line">
                <span>计划装货</span><b>{{ fmtTime(mainRecord.pickup_time) }}</b>
              </div>
              <div class="lg-foot-line">
                <span>计划到达</span><b>{{ fmtTime(mainRecord.plan_time) }}</b>
              </div>
              <div class="lg-foot-line" v-if="mainRecord.plan_distance">
                <span>规划里程</span><b class="lg-mono">{{ mainRecord.plan_distance }} km</b>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 普通运单 ===== -->
      <template v-else>

      <!-- 一级状态筛选 -->
      <div class="lg-filter-bar">
        <button
          v-for="f in topFilters"
          :key="f.key"
          class="lg-pill"
          :class="{ active: statusFilter === f.key }"
          @click="setStatusFilter(f.key)"
        >
          <span>{{ f.label }}</span>
          <em v-if="f.count > 0">{{ f.count }}</em>
        </button>
      </div>

      <!-- 二级筛选：已接单下的四个节点 -->
      <div class="lg-sub-bar" v-if="statusFilter === 'accepted'">
        <span class="lg-sub-branch">已接单</span>
        <span class="lg-sub-connector"></span>
        <button
          v-for="s in subFilters"
          :key="s.key"
          class="lg-seg"
          :class="{ active: subFilter === s.key }"
          @click="subFilter = s.key"
        >
          {{ s.label }}<em v-if="s.count > 0">{{ s.count }}</em>
        </button>
      </div>

      <!-- ⭐ 实际进度：计划 vs 实际双条 + 剩余里程 / 剩余时间 / 预计到达 -->
      <div class="lg-progress-card" v-if="activeRecord">
        <WaybillProgressBar
          :trip="activeRecord"
          :progress="progressOf(activeRecord)"
          :label="'运单 ' + activeRecord.waybill_no"
          :sublabel="activeRecord.status + ' · ' + (activeRecord.pickup || '--') + ' → ' + (activeRecord.delivery || '--')"
          show-legend
        />
      </div>

      <!-- 运输记录卡片（多条运输记录时才需要切换） -->
      <div class="lg-records" v-if="filteredRecords.length > 1">
        <div
          v-for="rec in filteredRecords"
          :key="rec.id"
          class="lg-record"
          :class="{ active: activeRecord && rec.waybill_no === activeRecord.waybill_no }"
          @click="selectRecord(rec)"
        >
          <div class="lg-record-head">
            <span class="lg-record-no">{{ rec.waybill_no }}</span>
            <span class="lg-status-tag" :style="statusStyle(rec.status)">{{ rec.status }}</span>
          </div>
          <div class="lg-record-route">
            {{ rec.pickup || '--' }} <i>→</i> {{ rec.delivery || '--' }}
          </div>
          <div class="lg-record-meta">{{ recordMetaText(rec) }}</div>
          <div class="lg-record-flag" v-if="rec.is_recurring">常驻</div>
        </div>
      </div>
      <div class="lg-empty" v-else-if="filteredRecords.length === 0">
        <span class="lg-empty-text">该筛选条件下暂无运输记录</span>
        <el-button size="small" plain @click="setStatusFilter('all')">查看全部</el-button>
      </div>

      <!-- 地图 + 节点时间轴 -->
      <div class="lg-main" v-if="activeRecord">
        <div class="lg-map-wrap">
          <div id="wb-map" class="lg-map"></div>

          <div class="lg-map-mask" v-if="mapHint">
            <span>{{ mapHint }}</span>
          </div>

          <!-- 车辆实时位置浮层 -->
          <div class="lg-vehicle-card" v-if="vehicleLive">
            <div class="lg-vc-head">
              <span class="lg-vc-plate">{{ vehicleLive.plate }}</span>
              <span class="lg-status-tag" :style="statusStyle(vehicleLive.status)">{{ vehicleLive.status }}</span>
            </div>
            <div class="lg-vc-line">{{ vehicleLive.locationText }}</div>
            <div class="lg-vc-line lg-vc-mono">
              上报 {{ vehicleLive.reportTime }} · 速度 {{ vehicleLive.speed }} km/h
            </div>
          </div>
          <div class="lg-vehicle-card is-empty" v-else-if="vehicleHint">
            <span class="lg-vc-line">{{ vehicleHint }}</span>
          </div>

          <!-- 行驶轨迹信息 -->
          <div class="lg-track-info" v-if="trackInfo">
            <span class="lg-ti-label">行驶轨迹</span>
            <span class="lg-ti-mono">{{ trackInfo.total }} 个点</span>
            <span class="lg-ti-mono">{{ trackInfo.from }} ~ {{ trackInfo.to }}</span>
          </div>

          <!-- 图例 -->
          <div class="lg-legend">
            <span><i class="lg-lg-dot start"></i>装货地</span>
            <span><i class="lg-lg-dot end"></i>卸货地</span>
            <span><i class="lg-lg-line"></i>行驶轨迹</span>
            <span><i class="lg-lg-dot car"></i>车辆位置</span>
          </div>
        </div>

        <div class="lg-timeline">
          <div class="lg-tl-head">
            <span class="lg-tl-title">节点时间</span>
            <span class="lg-status-tag" :style="statusStyle(activeRecord.status)">{{ activeRecord.status }}</span>
          </div>

          <div class="lg-tl-body">
            <!-- 拒单提示 -->
            <div class="lg-reassign" v-if="activeRecord.status === '待重新指派'">
              <div class="lg-reassign-title">已被司机拒单，等待重新指派</div>
              <div class="lg-reassign-line" v-if="activeRecord.reject_reason">
                原因：{{ activeRecord.reject_reason }}
              </div>
              <div class="lg-reassign-line" v-if="activeRecord.reject_by">
                司机：{{ activeRecord.reject_by }}
              </div>
            </div>

            <template v-for="node in timelineNodes" :key="node.key">
              <!-- 「已接单」分组标题 -->
              <div v-if="node.isGroup" class="lg-group" :class="'is-' + node.state">
                <span class="lg-group-label">{{ node.label }}</span>
                <span class="lg-group-time">{{ node.timeText }}</span>
                <span class="lg-group-operator" v-if="node.operator">{{ node.operator }}</span>
              </div>

              <!-- 普通节点 -->
              <div
                v-else
                class="lg-node"
                :class="['is-' + node.state, node.indent ? 'is-sub' : 'is-root']"
              >
                <span class="lg-node-dot"></span>
                <div class="lg-node-body">
                  <div class="lg-node-label">
                    <span class="lg-node-name">{{ node.label }}</span>
                    <span class="lg-node-badge" v-if="node.state === 'active'">进行中</span>
                    <span class="lg-node-badge is-done" v-else-if="node.state === 'done'">已完成</span>
                  </div>
                  <div class="lg-node-time">
                    <span>进入 <b>{{ fmtTime(node.enterAt) }}</b></span>
                    <span class="lg-node-sep">·</span>
                    <span>
                      完成
                      <b v-if="node.doneAt">{{ fmtTime(node.doneAt) }}</b>
                      <b v-else-if="node.state === 'active'" class="lg-running">{{ node.stayText }}</b>
                      <b v-else class="lg-pending">--</b>
                    </span>
                  </div>
                  <div class="lg-node-remark" v-if="node.remark">{{ node.remark }}</div>
                </div>
              </div>
            </template>
          </div>

          <div class="lg-tl-foot">
            <div class="lg-foot-line">
              <span>计划装货</span><b>{{ fmtTime(activeRecord.pickup_time) }}</b>
            </div>
            <div class="lg-foot-line">
              <span>计划到达</span><b>{{ fmtTime(activeRecord.plan_time) }}</b>
            </div>
            <div class="lg-foot-line" v-if="activeRecord.plan_distance">
              <span>规划里程</span><b class="lg-mono">{{ activeRecord.plan_distance }} km</b>
            </div>
          </div>
        </div>
      </div>
      </template>
    </div>


    <!-- ===== ⭐ 标签页 3：费用情况（上报列表 + 就地审批） ===== -->
    <div v-show="activeTab === 'fee'" class="fee-panel">
      <div class="fee-strip">
        <div class="fee-stat">
          <span>本单费用</span>
          <b>¥{{ money(feeSummary.total) }}</b>
        </div>
        <div class="fee-stat">
          <span>待我审批</span>
          <b class="is-warn">{{ feePendingCount }}</b>
        </div>
        <div class="fee-stat">
          <span>已通过</span>
          <b class="is-ok">{{ feeSummary.approved }}</b>
        </div>
        <div class="fee-stat">
          <span>已付款</span>
          <b>¥{{ money(feeSummary.paid) }}</b>
        </div>
        <div class="fee-strip-right">
          <el-tag v-if="feeApprovalEnabled" size="small" type="success" effect="plain">费用审批已开启</el-tag>
          <el-tag v-else size="small" type="info" effect="plain">本单免审</el-tag>
          <el-select v-model="feeFilter" size="small" style="width: 118px">
            <el-option label="全部" value="all" />
            <el-option label="待我审批" value="mine" />
            <el-option label="审核中" value="审核中" />
            <el-option label="已通过" value="已通过" />
            <el-option label="已驳回" value="已驳回" />
          </el-select>
          <el-button size="small" plain :loading="feeLoading" @click="loadFeeReports">刷新</el-button>
        </div>
      </div>

      <el-alert
        v-if="feeError"
        type="warning"
        :closable="false"
        show-icon
        class="fee-alert"
        title="上报数据读不到（reports 表可能还没初始化）"
        :description="feeError"
      />

      <div v-loading="feeLoading" class="fee-list">
        <div v-if="!feeLoading && !filteredReports.length" class="fee-empty">
          <div class="fee-empty-ic">
            <el-icon><Tickets /></el-icon>
          </div>
          <p>本单还没有上报记录</p>
          <span>司机在小程序「上报」里提交费用后，会出现在这里</span>
        </div>

        <div
          v-for="r in filteredReports"
          :key="r.id"
          class="fee-report"
          :class="{ open: expandedFee === r.id }"
        >
          <div class="fr-head" @click="toggleFee(r)">
            <span class="fr-type" :class="'t-' + (r.type || 'expense')">{{ typeShort(r.type) }}</span>
            <div class="fr-main">
              <div class="fr-title">
                <b>{{ typeLabel(r.type) }}</b>
                <span v-if="hasAmount(r.type)" class="fr-amount">¥{{ money(r.amount) }}</span>
                <el-tag v-if="r.reject_count" size="small" type="danger" effect="plain">
                  驳回过 {{ r.reject_count }} 次
                </el-tag>
              </div>
              <div class="fr-meta">
                {{ r.driver_name || r.plate || '—' }} · {{ fmtTime(r.create_time) }} ·
                <template v-if="Number(r.current_level) > 0">第 {{ r.current_level }} 级审批中</template>
                <template v-else>免审</template>
              </div>
            </div>
            <el-tag size="small" effect="light" :type="statusTagType(r.status)">{{ r.status }}</el-tag>
            <el-icon class="fr-arrow" :class="{ up: expandedFee === r.id }"><ArrowDown /></el-icon>
          </div>

          <div v-show="expandedFee === r.id" class="fr-body">
            <div class="fr-cols">
              <div class="fr-col">
                <div class="fr-col-title">明细</div>
                <div v-if="reportItems(r).length" class="fr-items">
                  <div v-for="(it, i) in reportItems(r)" :key="i" class="fr-item">
                    <span>{{ it.name || it.type || '费用' }}</span>
                    <b>¥{{ money(it.amount) }}</b>
                  </div>
                </div>
                <div v-else-if="r.type === 'expense'" class="fr-none">无明细</div>
                <div v-else class="fr-extra">
                  <template v-if="r.type === 'weigh'">
                    毛重 {{ r.payload?.gross ?? '—' }} kg · 皮重 {{ r.payload?.tare ?? '—' }} kg ·
                    <text class="fr-net">净重 {{ r.payload?.net ?? '—' }} kg</text>
                  </template>
                  <template v-else-if="r.type === 'receipt'">
                    回单号 {{ r.payload?.receipt_no || '—' }} · {{ r.payload?.receipt_date || '—' }}
                  </template>
                  <template v-else-if="r.type === 'overtime'">
                    {{ r.payload?.overtime_type || '超时' }} ·
                    <text class="fr-net">超 {{ r.payload?.duration_min || 0 }} 分钟</text> ·
                    原因 {{ r.payload?.reason || '—' }}
                  </template>
                  <template v-else>—</template>
                </div>
                <div v-if="reportImages(r).length" class="fr-imgs">
                  <template v-for="(img, i) in reportImages(r)" :key="i">
                    <el-image
                      v-if="imageUrls[img.fileID]"
                      :src="imageUrls[img.fileID]"
                      :preview-src-list="reportImageUrls(r)"
                      :initial-index="i"
                      fit="cover"
                      class="fr-thumb"
                      preview-teleported
                    />
                    <span v-else class="fr-img">凭证 {{ i + 1 }}</span>
                  </template>
                </div>
                <div v-if="r.payload && r.payload.note" class="fr-note">{{ r.payload.note }}</div>
              </div>

              <div class="fr-col">
                <div class="fr-col-title">审批链</div>
                <div class="fr-chain">
                  <div v-for="(st, i) in (r.flow || [])" :key="i" class="fr-step" :class="stepClass(st)">
                    <span class="fr-dot"></span>
                    <div>
                      <b>{{ st.level }} 级 · {{ st.name || roleLabel(st.role) }}</b>
                      <em>{{ stepText(st) }}</em>
                    </div>
                  </div>
                  <div v-if="!r.flow || !r.flow.length" class="fr-step done">
                    <span class="fr-dot"></span>
                    <div><b>免审</b><em>提交即通过</em></div>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="r.reject_reason" class="fr-rejectbar">
              <span class="fr-reject-k">{{ r.status === '已驳回' ? '驳回理由' : '上次驳回' }}</span>
              <span class="fr-reject-t">{{ r.reject_reason }}</span>
              <span v-if="r.reject_count" class="fr-reject-n">第 {{ r.reject_count }} 次</span>
            </div>
            <div v-if="r.status === '已打款' && r.paid_at" class="fr-paid">
              <span class="fr-paid-k">已付款</span>
              <span>{{ fmtTime(r.paid_at) }}</span>
              <span class="fr-paid-by">{{ r.paid_by || '--' }}</span>
              <span v-if="r.payment && r.payment.method" class="fr-paid-method">{{ r.payment.method }}</span>
              <span v-if="r.payment && r.payment.serial" class="fr-paid-serial">流水 {{ r.payment.serial }}</span>
              <span
                v-if="voucherCount(r)"
                class="fr-paid-voucher"
                @click="openVouchers(r)"
              >凭据 {{ voucherCount(r) }} 个 ›</span>
            </div>
            <div v-if="canApprove(r)" class="fr-actions">
              <span class="fr-hint">驳回必选理由，会原文回给司机</span>
              <el-button size="small" @click="openReject(r)">驳回</el-button>
              <el-button size="small" :disabled="Number(r.current_level) < 2" @click="escalateReport(r)">
                送老板
              </el-button>
              <el-button size="small" type="primary" :loading="actingId === r.id" @click="approveReport(r)">
                通过{{ hasAmount(r.type) ? ' · ¥' + money(r.amount) : '' }}
              </el-button>
            </div>
            <div v-else-if="canPay(r)" class="fr-actions">
              <span class="fr-hint">审批已通过，登记付款后这笔费用就闭环了</span>
              <el-button size="small" type="primary" plain @click="openPay(r)">
                登记付款{{ hasAmount(r.type) ? ' · ¥' + money(r.amount) : '' }}
              </el-button>
            </div>
            <div v-else-if="r.status === '已打款'" class="fr-actions">
              <span class="fr-hint">这笔已登记付款{{ r.payment && r.payment.revoked_at ? '（曾被撤销过一次）' : '' }}</span>
              <el-button v-if="voucherCount(r)" size="small" plain @click="openVouchers(r)">查看凭据</el-button>
              <el-button v-if="canRevoke(r)" size="small" type="danger" plain @click="openRevoke(r)">撤销付款</el-button>
            </div>
          </div>
        </div>
      </div>
    </div>

      </div>
    </div>

    <!-- ===== ⭐ 驳回上报 ===== -->
    <el-dialog v-model="rejectVisible" title="驳回这笔上报" width="460px" append-to-body>
      <div class="rj-tip">驳回后司机可在小程序里补齐材料重新提交，不会新建一条。</div>
      <div class="rj-chips">
        <button
          v-for="s in REJECT_REASONS"
          :key="s"
          type="button"
          class="rj-chip"
          :class="{ on: rejectReason === s }"
          @click="rejectReason = s"
        >
          {{ s }}
        </button>
      </div>
      <el-input
        v-model="rejectNote"
        type="textarea"
        :rows="3"
        maxlength="100"
        show-word-limit
        placeholder="补一句说明（选填），例如「停车费那笔没有票据，请补拍」"
      />
      <template #footer>
        <el-button @click="rejectVisible = false">取消</el-button>
        <el-button type="danger" :loading="actingId === rejectTarget?.id" @click="confirmReject">
          确认驳回
        </el-button>
      </template>
    </el-dialog>

    <!-- ===== ⭐ 登记付款 / 撤销付款 / 凭据（共用组件） ===== -->
    <PaymentDialog v-model="payVisible" :targets="payTargets" mode="pay" @done="onPayDone" />
    <PaymentDialog v-model="revokeVisible" :targets="revokeTargets" mode="revoke" @done="onRevokeDone" />
    <PaymentVouchers v-model="voucherVisible" :images="voucherImages" :title="voucherTitle" />

    <!-- ===== ⭐ 临时关闭装卸货地打卡 ===== -->
    <el-dialog v-model="checkInOffDialogVisible" title="临时关闭装卸货地打卡" width="460px">
      <div class="co-tip">
        关闭后，司机不需要车辆在围栏内即可完成「装车完成」与「确认到达」的打卡。
        仅用于现场围栏坐标不准、车辆定位漂移等打不了卡的兜底场景，建议事后恢复。
      </div>
      <el-input
        v-model="checkInOffRemark"
        type="textarea"
        :rows="3"
        maxlength="100"
        show-word-limit
        placeholder="关闭原因（选填，但建议写清楚，便于事后复盘）"
      />
      <template #footer>
        <el-button @click="checkInOffDialogVisible = false">取消</el-button>
        <el-button type="danger" :loading="checkInSaving" @click="confirmCheckInOff">确认关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { WarningFilled, Refresh, ArrowDown, Tickets } from '@element-plus/icons-vue'
import app, { supabase } from '@/utils/supabase'
import { unitFull } from '@/utils/units'
import { isPayer } from '@/utils/feeTodo'
import { moduleFlags, ensureModuleFlags } from '@/utils/modules'
import PaymentDialog from '@/components/PaymentDialog.vue'
import PaymentVouchers from '@/components/PaymentVouchers.vue'
import dayjs from 'dayjs'
import AMapLoader from '@amap/amap-jsapi-loader'
import WaybillProgressBar from '@/components/WaybillProgressBar.vue'
import RecurringTaskGantt from '@/components/RecurringTaskGantt.vue'
import {
  loadVehicleTrip,
  traveledMetersSince,
  computeProgress,
  downsamplePoints,
  parseLngLat,
  pickVehiclePlate,
  parseTimeMs,
} from '@/utils/waybillProgress'

const router = useRouter()
const route = useRoute()

// ============================================================
// ⭐ 数据隔离
// ============================================================
const currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('currentUser') || '{}') }
  catch { return {} }
})()
const isAdmin = currentUser.role === 'admin'
const isCustomer = !isAdmin
const isSubAccount = !!currentUser.isSubAccount
const myAccount = currentUser.masterAccount || currentUser.account || ''

// ⭐ 子账号机构信息
const myOrgName = ref(isSubAccount ? String(currentUser.orgName || '').trim() || null : null)
const myOrgLevel = ref(isSubAccount ? (Number(currentUser.orgLevel) || 1) : null)

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

// ---------- 任务颜色池 ----------
const taskColors = [
  '#f0f8ff', '#f0fff0', '#fff0f5', '#f5f5dc', '#fafad2',
  '#e6e6fa', '#ffe4e1', '#f0ffff', '#fff5ee', '#fdf5e6'
]

// ---------- 数据 ----------
const tasks = ref([])
const form = reactive({
  // 运输节点模式：'极简'（接单→完成运单）| '详细'（接单→装车完成→确认发车→确认到达→完成运单）
  transportMode: '详细',
  // 是否要求装卸货地打卡，仅「详细」模式有意义
  checkInRequired: true,
  cargoList: [],
})
const assignList = ref([])

/* ⭐ 拒单信息：仅「待重新指派」且有拒单记录时非空 */
const rejectInfo = ref(null)
const formatRejectTime = (t) => {
  if (!t) return '--'
  const d = new Date(t)
  return isNaN(d.getTime()) ? String(t) : d.toLocaleString()
}

// ---------- 辅助函数 ----------
const getTaskIndex = (taskId) => tasks.value.findIndex(t => t.id === taskId)
const getTaskColor = (taskId) => {
  const task = tasks.value.find(t => t.id === taskId)
  return task ? task.color : taskColors[0]
}
const getItemLabel = (method, index) => {
  const map = { driver: '选择司机', vehicle: '选择车辆', team: '选择车队' }
  return `${map[method] || '选择'}${index}`
}

// ---------- 计算总计 ----------
const totalQuantity = computed(() => form.cargoList.reduce((sum, item) => sum + (item.quantity || 0), 0))
const totalFreight = computed(() => form.cargoList.reduce((sum, item) => sum + (item.freight || 0), 0))

// ============================================================
// ⭐ 标签页
// ============================================================
const activeTab = ref('info')
const waybillNo = ref('')

// ============================================================
// ⭐ 装卸货地打卡管控（详情页可临时关闭）
// ============================================================
const checkInSaving = ref(false)
const checkInOffDialogVisible = ref(false)
const checkInOffRemark = ref('')
const checkInOffInfo = reactive({ by: '', time: '', remark: '' })

const transportModeHint = computed(() =>
  form.transportMode === '极简'
    ? '司机只需「接单」和「完成运单」两步'
    : '司机需按「接单 → 装车完成 → 确认发车 → 确认到达 → 完成运单」逐步上报'
)

const checkInOffText = computed(() => {
  if (!checkInOffInfo.time && !checkInOffInfo.by && !checkInOffInfo.remark) return ''
  const parts = []
  if (checkInOffInfo.time) parts.push('已于 ' + fmtTime(checkInOffInfo.time))
  if (checkInOffInfo.by) parts.push('由 ' + checkInOffInfo.by)
  parts.push('临时关闭')
  const head = parts.join(' ')
  return checkInOffInfo.remark ? head + '（原因：' + checkInOffInfo.remark + '）' : head
})

const openCheckInOffDialog = () => {
  checkInOffRemark.value = ''
  checkInOffDialogVisible.value = true
}

/* 打卡开关只改「当前这一条运输记录」；常驻任务下每条记录各自独立 */
const updateCheckInRequired = async (required, remark) => {
  const rec = mainRecord.value
  if (!rec || checkInSaving.value) return
  checkInSaving.value = true
  try {
    const patch = {
      check_in_required: required,
      check_in_off_by: required ? null : currentUser.name || currentUser.account || '未知用户',
      check_in_off_time: required ? null : new Date().toISOString(),
      check_in_off_remark: required ? null : remark || null,
    }
    const { error } = await supabase.from('waybills').update(patch).eq('id', rec.id)
    if (error) throw error

    form.checkInRequired = required
    checkInOffInfo.by = patch.check_in_off_by || ''
    checkInOffInfo.time = patch.check_in_off_time || ''
    checkInOffInfo.remark = remark || ''
    Object.assign(rec, patch)
    const hit = records.value.find(r => r.waybill_no === rec.waybill_no)
    if (hit) Object.assign(hit, patch)

    ElMessage.success(required ? '已恢复装卸货地打卡' : '已临时关闭装卸货地打卡')
    checkInOffDialogVisible.value = false
    checkInOffRemark.value = ''
  } catch (err) {
    if (/column|does not exist|不存在/i.test(err.message || '')) {
      ElMessage.error('数据库缺少打卡管控字段，请先在控制台执行迁移脚本')
    } else {
      ElMessage.error('操作失败：' + err.message)
    }
  } finally {
    checkInSaving.value = false
  }
}

const confirmCheckInOff = () => updateCheckInRequired(false, checkInOffRemark.value)
const restoreCheckIn = () => updateCheckInRequired(true, '')

// ============================================================
// ⭐ 物流状态（方案 D：地图轨迹 + 节点时间轴）
// ============================================================
const AMAP_KEY = '273f5c474604b71906674aac159b8f45'

/* 「已接单」组内的节点，数组顺序即流转顺序。
   legacy 表示历史流程遗留节点（新流程不再产生），只有真走过才展示 */
const ACCEPTED_NODE_DEFS = [
  { key: '待装车', field: 'accept_time', remark: '司机已接单，等待到达装货地' },
  { key: '装车中', field: 'load_start_time', remark: '历史流程的「确认装车」节点', legacy: true },
  { key: '装车完成', field: 'load_end_time', remark: '装货地围栏内打卡完成' },
  { key: '已发车', field: 'depart_time', remark: '车辆已驶离装货地' },
  { key: '已到达', field: 'arrive_time', remark: '卸货地围栏内打卡到达' },
]
const ACCEPTED_STATUSES = ACCEPTED_NODE_DEFS.map(n => n.key)

/* 状态色板：与小程序端 数据契约.md 的四组口径一致 */
const STATUS_COLORS = {
  '待接单': { text: '#B45309', bg: '#FEF3C7' },
  '待重新指派': { text: '#A32D2D', bg: '#FCEBEB' },
  '待装车': { text: '#1D4ED8', bg: '#DBEAFE' },
  '装车中': { text: '#1D4ED8', bg: '#DBEAFE' },
  '装车完成': { text: '#1D4ED8', bg: '#DBEAFE' },
  '已发车': { text: '#1D4ED8', bg: '#DBEAFE' },
  '已到达': { text: '#1D4ED8', bg: '#DBEAFE' },
  '已完成': { text: '#15803D', bg: '#DCFCE7' },
  '已取消': { text: '#64748B', bg: '#F1F5F9' },
  '行驶': { text: '#15803D', bg: '#DCFCE7' },
  '静止': { text: '#B45309', bg: '#FEF3C7' },
  '离线': { text: '#64748B', bg: '#F1F5F9' },
}
const statusStyle = (status) => {
  const c = STATUS_COLORS[String(status || '').trim()] || { text: '#475569', bg: '#F1F5F9' }
  return { color: c.text, background: c.bg }
}

// ---------- 物流状态数据 ----------
const mainRecord = ref(null)        // 当前详情页主体运单
const records = ref([])             // 运输记录（非常驻任务只有 1 条）
const activeRecordNo = ref('')
const statusFilter = ref('all')
const subFilter = ref('all')
const loadingLogistics = ref(false)
const refreshedAtText = ref('--')

/* ⭐ 进度结果：{ waybill_no: computeProgress(...) }，由轨迹 + 规划里程算出 */
const progressMap = ref({})
const setProgress = (waybillNo, p) => {
  if (!waybillNo) return
  progressMap.value = { ...progressMap.value, [waybillNo]: p }
}
const progressOf = (rec) => (rec ? progressMap.value[rec.waybill_no] || null : null)

/* ⭐ 常驻任务与普通运单走两条不同的渲染路径 */
const isRecurringWaybill = computed(() => !!(mainRecord.value && mainRecord.value.is_recurring))

/* ============================================================
   ⭐ 子母车：一个任务派给多个司机 / 车辆，每人跑自己那一趟
   ------------------------------------------------------------
   每个人的状态与时间记在他自己的指派项上
   （`leg_status` / `leg_accept_time` / `leg_vehicle` / `leg_finish_time`）。
   物流状态页按趟展示，顶部给「共 N 趟 · 已完成 x」的聚合。
   ⚠️ 与小程序三个云函数（waybill-list / waybill-action / waybill-detail）同口径，改一处要一起改。
   ============================================================ */
const LEG_TODO = '待接单'
/* 分车承运的颜色：按指派顺序固定取，轨迹 / 车辆卡色点 / 图例三处一致
   （红只给第一辆，避免和「异常告警」的红混在一起） */
const LEG_COLORS = ['#c8102e', '#2563eb', '#0e7490', '#7c3aed']
const legItemsOf = (row) =>
  (row && row.assignments ? row.assignments : []).flatMap((a) =>
    (a.items || []).map((it) => ({ method: a.method, item: it }))
  )
const isMultiLegWaybill = computed(() => {
  const row = mainRecord.value
  if (!row || row.is_recurring) return false
  const items = legItemsOf(row)
  if (items.length < 2) return false
  return items.every((x) => x.method === 'driver' || x.method === 'vehicle')
})
const multiLegs = computed(() => {
  if (!isMultiLegWaybill.value) return []
  const row = mainRecord.value
  return legItemsOf(row).map(({ method, item }, i) => {
    const qty = Number(item.carryQuantity || 0)
    const plate =
      String(item.leg_vehicle || '').trim() ||
      (method === 'vehicle' ? String(item.target || '').trim() : '')
    const driver = method === 'driver' ? String(item.target || '').trim() : ''
    const title = [plate, driver].filter(Boolean).join(' · ') || driver || plate || '未指定'
    return {
      title,
      qty,
      /* 画地图要用：这趟的车 + 各节点时间（造「只含这一辆车」的假记录） */
      plate,
      driver,
      /* 右侧面板 / 甘特行上的小标签 */
      tabLabel: plate || driver || `第 ${i + 1} 趟`,
      color: LEG_COLORS[i % LEG_COLORS.length],
      progressKey: `${row.waybill_no || row.id}#${i + 1}`,
      status: String(item.leg_status || '').trim() || LEG_TODO,
      meta:
        (method === 'vehicle' ? '车辆指派' : '司机指派') +
        ` · 承运 ${qty}` +
        (driver && plate ? ` · 司机 ${driver}` : ''),
      acceptTime: item.leg_accept_time || null,
      acceptBy: String(item.leg_accept_by || '').trim(),
      loadStartTime: item.leg_load_start_time || null,
      loadEndTime: item.leg_load_end_time || null,
      departTime: item.leg_depart_time || null,
      arriveTime: item.leg_arrive_time || null,
      finishTime: item.leg_finish_time || null,
      rejectTime: item.leg_reject_time || null,
      rejectBy: String(item.leg_reject_by || '').trim(),
      rejectReason: item.leg_reject_reason || '',
    }
  })
})
const multiLegDone = computed(() => multiLegs.value.filter((l) => l.status === '已完成').length)
const multiLegCarrySum = computed(() => multiLegs.value.reduce((s, l) => s + (l.qty || 0), 0))

/* ============================================================
   ⭐ 分车承运：右侧「节点时间」面板选中哪一趟 + 地图聚焦哪一趟
   ------------------------------------------------------------
   · legTab   = 右侧面板看的那一趟（默认第一趟）
   · legFocus = 地图只画哪一趟（null = 全部叠在一起看，默认）
   点甘特行 / 面板页签：切到那一趟并聚焦；再点同一行 = 回到「全部」
   ============================================================ */
const legTab = ref(0)
const legFocus = ref(null)
/* 每趟的轨迹结果 { [progressKey]: { current, points, error } }，右侧面板展示当前位置 / 轨迹点数 */
const legTripMap = ref({})
/* 一次进页面内的轨迹缓存：切换聚焦不需要重新打东风接口 */
const legTripCache = new Map()

const activeLeg = computed(() => multiLegs.value[legTab.value] || multiLegs.value[0] || null)

/* 把一趟「腿」拼成一条像运单一样的记录：右侧时间轴、进度条、地图查定位都吃它 */
const legRecordOf = (leg) => {
  const row = mainRecord.value || {}
  if (!leg) return row
  return {
    ...row,
    status: leg.status,
    vehicle: leg.plate || '',
    /* 地图按「只含这一辆车」查定位 */
    assignments: leg.plate ? [{ method: 'vehicle', items: [{ target: leg.plate }] }] : row.assignments,
    accept_time: leg.acceptTime,
    load_start_time: leg.loadStartTime,
    load_end_time: leg.loadEndTime,
    depart_time: leg.departTime,
    arrive_time: leg.arriveTime,
    finish_time: leg.finishTime,
    accept_by: leg.acceptBy || '',
    reject_time: leg.rejectTime,
    reject_reason: leg.rejectReason || '',
    reject_by: leg.rejectBy || '',
  }
}
const legProgressOf = (leg) => (leg ? progressMap.value[leg.progressKey] || null : null)
const legTripOf = (leg) => (leg ? legTripMap.value[leg.progressKey] || null : null)
const activeLegTrip = computed(() => legTripOf(activeLeg.value))
const activeLegLive = computed(() => {
  const t = activeLegTrip.value
  return t && t.current ? t.current : null
})
const activeLegTripHint = computed(() => {
  const leg = activeLeg.value
  if (!leg) return ''
  if (!leg.plate) return '这一趟还没定车，暂时没有定位'
  const t = activeLegTrip.value
  if (!t) return '正在获取车辆定位…'
  return t.error || ''
})
/* 这趟的行驶轨迹概况：几个点、从什么时候到什么时候 */
const activeLegTrackInfo = computed(() => {
  const t = activeLegTrip.value
  if (!t || !t.points || t.points.length < 2) return null
  return {
    total: t.points.length,
    from: fmtTime(t.points[0].time),
    to: fmtTime(t.points[t.points.length - 1].time),
  }
})
/* 这趟自己的节点时间轴（不借整单的 status_log 兜底） */
const legTimelineNodes = computed(() =>
  buildTimelineNodes(legRecordOf(activeLeg.value), { noLog: true })
)

const selectLeg = (i) => {
  if (legTab.value === i) {
    legFocus.value = legFocus.value === i ? null : i
  } else {
    legTab.value = i
    legFocus.value = i
  }
  drawMultiLegOnMap()
}
const clearLegFocus = () => {
  legFocus.value = null
  drawMultiLegOnMap()
}

/* 进行中的状态（这几个才需要算剩余里程 / ETA） */
const RUNNING_STATUSES = ['待装车', '装车中', '装车完成', '已发车', '已到达']
const isRunningStatus = (rec) => RUNNING_STATUSES.includes(String((rec && rec.status) || '').trim())


const activeRecord = computed(
  () => records.value.find(r => r.waybill_no === activeRecordNo.value) || records.value[0] || null
)

// ---------- 通用工具 ----------
const fmtTime = (t) => {
  if (!t) return '--'
  const d = dayjs(t)
  return d.isValid() ? d.format('MM-DD HH:mm') : String(t)
}
const fmtDuration = (ms) => {
  const min = Math.floor(ms / 60000)
  if (min < 1) return '不足 1 分钟'
  if (min < 60) return min + ' 分钟'
  const hour = Math.floor(min / 60)
  if (hour < 24) return hour + ' 小时 ' + (min % 60) + ' 分'
  return Math.floor(hour / 24) + ' 天 ' + (hour % 24) + ' 小时'
}
const parseList = (raw) => {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const v = JSON.parse(raw)
      return Array.isArray(v) ? v : []
    } catch (e) { return [] }
  }
  return []
}
const parseStatusLog = (rec) => parseList(rec && rec.status_log)
const logNode = (log, status) =>
  log.find(x => x && String(x.status || '').trim() === status) || null

// ---------- 两级筛选 ----------
const TOP_FILTER_DEFS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待接单' },
  { key: 'accepted', label: '已接单' },
  { key: 'done', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
  { key: 'reassign', label: '待重新指派' },
]
const matchesTop = (key, status) => {
  const s = String(status || '').trim()
  if (key === 'all') return true
  if (key === 'pending') return s === '待接单'
  if (key === 'accepted') return ACCEPTED_STATUSES.includes(s)
  if (key === 'done') return s === '已完成'
  if (key === 'cancelled') return s === '已取消'
  if (key === 'reassign') return s === '待重新指派'
  return true
}
const topFilters = computed(() =>
  TOP_FILTER_DEFS.map(d => ({
    ...d,
    count: records.value.filter(r => matchesTop(d.key, r.status)).length,
  }))
)
const subFilters = computed(() => {
  const base = records.value.filter(r => matchesTop('accepted', r.status))
  return [{ key: 'all', label: '全部', count: base.length }].concat(
    ACCEPTED_STATUSES.map(k => ({
      key: k,
      label: k,
      count: base.filter(r => String(r.status || '').trim() === k).length,
    }))
  )
})
const filteredRecords = computed(() => {
  let list = records.value.filter(r => matchesTop(statusFilter.value, r.status))
  if (statusFilter.value === 'accepted' && subFilter.value !== 'all') {
    list = list.filter(r => String(r.status || '').trim() === subFilter.value)
  }
  return list
})
const setStatusFilter = (key) => {
  statusFilter.value = key
  subFilter.value = 'all'
}
const selectRecord = (rec) => { activeRecordNo.value = rec.waybill_no }

const recordMetaText = (rec) => {
  const st = String(rec.status || '').trim()
  if (st === '待接单') return '计划装货 ' + fmtTime(rec.pickup_time)
  if (st === '待重新指派') return '拒单 ' + fmtTime(rec.reject_time)
  if (st === '已取消') return '取消 ' + fmtTime(rec.cancel_time)
  if (st === '已完成') return '完成 ' + fmtTime(rec.arrive_time)
  return '接单 ' + fmtTime(rec.accept_time)
}

/* 常驻任务累计接单次数：按分组内的运输记录数统计，不依赖单条记录上的冗余计数 */
const recurringAcceptedCount = computed(
  () => records.value.filter(r => {
    const s = String(r.status || '').trim()
    return ACCEPTED_STATUSES.includes(s) || s === '已完成'
  }).length
)

const recurringBrief = (rec) => {
  const type = String(rec.recurring_type || '').trim()
  const used = recurringAcceptedCount.value
  if (type === 'count') {
    return '按次数 ' + used + '/' + (Number(rec.recurring_max_count) || 0) + ' 次 · ' +
      (rec.recurring_status || '生效中')
  }
  return '按时间 ' + fmtTime(rec.recurring_start_time) + ' ~ ' +
    fmtTime(rec.recurring_end_time) + ' · 已接 ' + used + ' 次'
}

/* ============================================================
   ⭐ 常驻任务：暂停 / 恢复 / 结束（用户 2026-10-17 拍板）
   ------------------------------------------------------------
   · 入口放**运单详情页**（列表上看一眼就操作太危险：结束不可逆）
   · 有趟次在进行中（待装车 / 装车中 / 装车完成 / 已发车 / 已到达）**不允许**暂停或结束，
     只提示「有任务在进行中」—— 正在跑的车不能被后台一句话掐掉
   · recurring_status 写在组内**所有**趟次上：Web 直连库、小程序走云函数读的是同一条字段，
     两端必须一致（小程序也据此隐藏「接一趟」并显示「已暂停」）
   · 已暂停 / 已结束的任务，小程序侧接单会被云端拒绝
   ============================================================ */
const recGroupNo = computed(() =>
  String((mainRecord.value && mainRecord.value.recurring_group_no) || '').trim()
)
const recTaskStatus = computed(() => {
  const rec = mainRecord.value
  return String((rec && rec.recurring_status) || '生效中').trim() || '生效中'
})
/* 组里还在跑的趟次 */
const recRunningTrips = computed(() =>
  (records.value || []).filter((r) => isRunningStatus(r))
)
const recHasRunning = computed(() => recRunningTrips.value.length > 0)
const recStatusStyle = computed(() => statusStyle(recTaskStatus.value))
const recTaskHint = computed(() => {
  if (recHasRunning.value) {
    const nos = recRunningTrips.value.map((r) => r.waybill_no).slice(0, 3).join('、')
    return `有 ${recRunningTrips.value.length} 趟任务正在进行中（${nos}），需先跑完才能暂停或结束`
  }
  if (recTaskStatus.value === '已暂停') {
    return '已暂停：司机端接不了新趟次，已经在跑的趟次照常完成'
  }
  if (recTaskStatus.value === '已结束') {
    return '已结束：司机端不再展示这个常驻任务，历史趟次仍然保留'
  }
  return '生效中：司机端可以继续接新趟次'
})

const settingRecStatus = ref(false)
const setRecurringStatus = async (next) => {
  const groupNo = recGroupNo.value
  if (!groupNo) return
  if (next !== '生效中' && recHasRunning.value) {
    ElMessage.warning('有任务在进行中，不能暂停或结束该常驻任务')
    return
  }
  if (next === '已结束') {
    try {
      await ElMessageBox.confirm(
        '结束后司机端不再展示该常驻任务，也不能再接新趟次。确定结束吗？',
        '结束常驻任务',
        { type: 'warning', confirmButtonText: '确定结束', cancelButtonText: '取消' }
      )
    } catch (e) {
      return
    }
  }
  const label = next === '生效中' ? '恢复' : next
  settingRecStatus.value = true
  try {
    const { error } = await supabase
      .from('waybills')
      .update({ recurring_status: next })
      .eq('recurring_group_no', groupNo)
    if (error) throw error
    /* 本地同步：主体 + 组内所有趟次（下次进页面会重新拉） */
    if (mainRecord.value) mainRecord.value.recurring_status = next
    records.value = records.value.map((r) => ({ ...r, recurring_status: next }))
    ElMessage.success('已' + label + '该常驻任务')

    /* ⭐ 常驻结束：整组只推一次订阅消息（司机逐趟完成时不推） */
    if (next === '已结束') {
      app.callFunction({ name: 'wx-notify', data: { action: 'recurring_end', group_no: groupNo } })
        .catch((e) => console.warn('[常驻结束提醒] 发送失败（不阻断）', e))
    }
  } catch (e) {
    console.error('常驻任务状态更新失败：', e)
    ElMessage.error(label + '失败：' + (e.message || '未知错误'))
  } finally {
    settingRecStatus.value = false
  }
}

// ---------- 节点时间轴 ----------
/* 每个节点展示「进入时间」与「完成时间」；
   完成时间 = 下一个节点的进入时间（这是「每个节点完成时间」的业务口径） */
const buildTimelineNodes = (rec, opts) => {
  if (!rec) return []
  const st = String(rec.status || '').trim()
  /* ⭐ 分车承运：每一趟没有自己的 status_log，用整单日志兜底会把别人的时间算进来 →
     造腿记录时必须关掉兜底（opts.noLog） */
  const allowLog = !(opts && opts.noLog)
  const log = allowLog ? parseStatusLog(rec) : []
  const pick = (field, logKey) => {
    if (rec[field]) return rec[field]
    if (!allowLog) return null
    const hit = logNode(log, logKey)
    return hit ? hit.time || null : null
  }

  const timeOf = {
    '待接单': pick('create_time', '待接单'),
    '待装车': pick('accept_time', '待装车'),
    '装车中': pick('load_start_time', '装车中'),
    '装车完成': pick('load_end_time', '装车完成'),
    '已发车': pick('depart_time', '已发车'),
    '已到达': pick('arrive_time', '已到达'),
    '已完成': pick('finish_time', '已完成'),
  }
  /* 历史流程里 arrive_time 曾被当作「已完成」时间；
     若这单是那个阶段产生的（没有 finish_time 但状态已是已完成），沿用 arrive_time */
  if (!timeOf['已完成'] && st === '已完成' && rec.arrive_time) {
    timeOf['已完成'] = rec.arrive_time
    timeOf['已到达'] = null
  }
  const acceptedTimes = ACCEPTED_STATUSES.map(k => timeOf[k]).filter(Boolean)

  /* 当前「进行中」的节点；已完成 / 已取消 是终态，没有进行中的节点 */
  let currentKey = ''
  if (ACCEPTED_STATUSES.includes(st)) currentKey = st
  else if (st === '待接单' || st === '待重新指派') currentKey = '待接单'

  const stayText = (enterAt) => {
    if (!enterAt) return '进行中'
    const ms = Date.now() - dayjs(enterAt).valueOf()
    if (isNaN(ms) || ms < 0) return '进行中'
    return '已停留 ' + fmtDuration(ms)
  }

  const out = []

  /* 1. 待接单 */
  out.push({
    key: '待接单',
    label: '待接单',
    indent: 0,
    state: currentKey === '待接单' ? 'active' : (timeOf['待接单'] ? 'done' : 'pending'),
    enterAt: rec.create_time || timeOf['待接单'],
    doneAt: timeOf['待装车'] || null,
    stayText: stayText(rec.create_time || timeOf['待接单']),
    remark: st === '待重新指派' ? '已被司机拒单，等待重新指派' : '',
  })

  /* 2.「已接单」分组标题 */
  let groupState = 'pending'
  if (ACCEPTED_STATUSES.includes(st)) groupState = 'active'
  else if (st === '已完成' || acceptedTimes.length) groupState = 'done'
  out.push({
    key: 'group-accepted',
    isGroup: true,
    label: '已接单',
    state: groupState,
    timeText: groupState === 'pending'
      ? '尚未接单'
      : '接单 ' + fmtTime(timeOf['待装车'] || rec.accept_time),
    operator: String(rec.accept_by || '').trim(),
  })

  /* 3. 已接单组内的子节点（历史遗留节点只有在真走过时才展示） */
  ACCEPTED_NODE_DEFS.forEach((def, i) => {
    const key = def.key
    const entered = timeOf[key]
    const isCurrent = currentKey === key
    if (def.legacy && !entered && !isCurrent) return

    const nextDef = ACCEPTED_NODE_DEFS[i + 1]
    const nextAt = nextDef ? timeOf[nextDef.key] : timeOf['已完成']
    const state = isCurrent ? 'active' : (entered ? 'done' : 'pending')
    out.push({
      key,
      label: key,
      indent: 1,
      state,
      enterAt: entered,
      doneAt: entered ? nextAt || null : null,
      stayText: stayText(entered),
      remark: state === 'pending' ? '' : def.remark || '',
    })
  })

  /* 4. 终点：已完成 / 已取消 */
  if (st === '已取消') {
    const cancelLog = logNode(log, '已取消')
    out.push({
      key: '已取消',
      label: '已取消',
      indent: 0,
      state: 'cancelled',
      enterAt: rec.cancel_time || (cancelLog ? cancelLog.time : null),
      doneAt: null,
      stayText: '',
      remark: rec.cancel_reason ? '取消原因：' + rec.cancel_reason : '',
    })
  } else {
    const finishAt = timeOf['已完成']
    out.push({
      key: '已完成',
      label: '已完成',
      indent: 0,
      state: finishAt ? 'done' : 'pending',
      enterAt: finishAt,
      doneAt: null,
      stayText: '',
      remark: finishAt ? '司机「完成运单」后结单' : '',
    })
  }

  return out
}

const timelineNodes = computed(() => buildTimelineNodes(activeRecord.value))

// ---------- 地图 ----------
let wbMap = null
let wbAMap = null
let drawSeq = 0
const mapHint = ref('')
const vehicleLive = ref(null)
const vehicleHint = ref('')
const trackInfo = ref(null)
const fenceCache = new Map()

const initWaybillMap = async () => {
  if (wbMap) return true
  try {
    wbAMap = await AMapLoader.load({
      key: AMAP_KEY,
      version: '2.0',
      plugins: ['AMap.Geocoder', 'AMap.ToolBar'],
    })
    if (!document.getElementById('wb-map')) {
      mapHint.value = '地图容器未就绪'
      return false
    }
    wbMap = new wbAMap.Map('wb-map', {
      zoom: 8,
      center: [107, 33],
      viewMode: '2D',
      mapStyle: 'amap://styles/whitesmoke',
      /* ⚠️ 滚轮缩放必须关掉（用户 2026-10-17 反馈「页面不能上下拖动」）：
         地图有 520px 高、又占满首屏下半部分，开着滚轮缩放时指针落在地图上，
         两指上下滑只会缩放地图、页面一动不动。关掉后滚轮照样滚页面，
         缩放改走右上角工具栏 / 双击。 */
      scrollWheel: false,
      dragEnable: true,
      doubleClickZoom: true,
    })
    /* 关掉滚轮缩放后补一个缩放工具栏（liteStyle = 紧凑竖条） */
    try {
      wbMap.addControl(new wbAMap.ToolBar({ liteStyle: true, position: { top: '10px', right: '10px' } }))
    } catch (e) {
      /* 工具栏加载失败不影响地图主体 */
    }
    mapHint.value = ''
    return true
  } catch (err) {
    mapHint.value = '地图加载失败：' + (err && err.message ? err.message : err)
    return false
  }
}

/* 装货地 / 卸货地存的是围栏名称，先按名称反查围栏中心点。
   只有看起来像地址的文本才走地理编码，避免把围栏别名编码到无关坐标。 */
const resolvePoint = async (name) => {
  const n = String(name || '').trim()
  if (!n) return null
  if (fenceCache.has(n)) return fenceCache.get(n)

  let point = null
  try {
    let q = supabase.from('ele_fences').select('name,center,location').eq('name', n).limit(1)
    if (isCustomer && myAccount) q = q.eq('owner_account', myAccount)
    const { data } = await q
    if (data && data.length) {
      point = parseLngLat(data[0].center) || parseLngLat(data[0].location)
    }
  } catch (e) { /* 围栏查不到不影响主流程 */ }

  if (!point && /[省市区县路街道号镇村]/.test(n)) point = await geocodeText(n)

  fenceCache.set(n, point)
  return point
}

const geocodeText = (text) =>
  new Promise((resolve) => {
    if (!wbAMap || !wbAMap.Geocoder) return resolve(null)
    try {
      const geocoder = new wbAMap.Geocoder()
      geocoder.getLocation(text, (status, result) => {
        if (status === 'complete' && result && result.geocodes && result.geocodes.length) {
          const loc = result.geocodes[0].location
          resolve([loc.lng, loc.lat])
        } else {
          resolve(null)
        }
      })
    } catch (e) { resolve(null) }
  })

const makeMarker = (point, text, color, isCar, label, labelOffsetY) =>
  new wbAMap.Marker(
    label
      /* ⭐ 分车承运：当前位置用「车牌气泡」（带一个同色圆点），一眼能认出是哪辆车
         ⚠️ 两辆车停在同一位置时，用 labelOffsetY 把气泡往上错开，否则会互相盖住 */
      ? {
          position: point,
          anchor: 'center',
          offset: new wbAMap.Pixel(0, labelOffsetY || 0),
          zIndex: isCar ? 220 : 150,
          content:
            '<div class="wb-marker is-plate" style="border-color:' + color + ';color:' + color + '">' +
            '<i style="background:' + color + '"></i>' + label + '</div>',
        }
      : {
          position: point,
          offset: new wbAMap.Pixel(-14, -14),
          zIndex: isCar ? 200 : 150,
          content:
            '<div class="wb-marker' + (isCar ? ' is-car' : '') +
            '" style="border-color:' + color + ';color:' + color + '">' + text + '</div>',
        }
  )

/* 画一次「一条运输记录」：起终点 + 真实行驶轨迹 + 车辆当前位置 */
const drawRecordOnMap = async (rec) => {
  if (!rec) return
  const seq = ++drawSeq
  const ok = await initWaybillMap()
  if (!ok || !wbMap || seq !== drawSeq) return

  wbMap.clearMap()
  vehicleLive.value = null
  vehicleHint.value = ''
  trackInfo.value = null

  const start = await resolvePoint(rec.pickup)
  const end = await resolvePoint(rec.delivery)
  if (seq !== drawSeq) return

  const overlays = []
  if (start) overlays.push(makeMarker(start, '起', '#0F6E56', false))
  if (end) overlays.push(makeMarker(end, '终', '#c8102e', false))

  const vehicle = await loadVehicleTrip(rec)
  if (seq !== drawSeq) return

  if (vehicle.points.length >= 2) {
    const line = buildTrackLine(downsamplePoints(vehicle.points))
    if (line) overlays.push(line)
  }
  if (vehicle.current) {
    overlays.push(makeMarker([vehicle.current.lng, vehicle.current.lat], '车', '#C8102E', true))
    vehicleLive.value = vehicle.current
    vehicleHint.value = vehicle.error || ''
    trackInfo.value = vehicle.points.length
      ? {
          total: vehicle.points.length,
          from: fmtTime(vehicle.points[0].time),
          to: fmtTime(vehicle.points[vehicle.points.length - 1].time),
        }
      : null
  } else {
    vehicleHint.value = vehicle.error || ''
  }

  /* ⭐ 顺带算出这一趟的进度，供上方进度条使用 */
  setProgress(
    rec.waybill_no,
    computeProgress({
      traveledMeters: traveledMetersSince(vehicle.points, rec.depart_time),
      planDistance: rec.plan_distance,
      planDuration: rec.plan_duration,
      lastReportAt: vehicle.current ? vehicle.current.reportAt : 0,
    })
  )
  if (seq !== drawSeq) return

  if (overlays.length) {
    wbMap.add(overlays)
    wbMap.setFitView(overlays, false, [70, 70, 70, 70])
  }
  if (!start && !end && !vehicle.current && !vehicle.points.length) {
    mapHint.value = '装货地 / 卸货地未匹配到坐标，且车辆无定位数据，无法在地图上定位'
    return
  }
  mapHint.value = ''
}

/* 真实行驶轨迹（东风 track/history），实线
   轨迹接口没有「是否在围栏内」这类字段，只画点序列
   ⭐ 分车承运会给每辆车传自己的颜色与透明度 */
const buildTrackLine = (points, color, opacity) => {
  if (!wbAMap || !wbMap) return null
  try {
    return new wbAMap.Polyline({
      path: points.map(p => [p.lng, p.lat]),
      strokeColor: color || '#c8102e',
      strokeWeight: 4,
      strokeOpacity: opacity === undefined ? 0.75 : opacity,
      lineJoin: 'round',
      lineCap: 'round',
      zIndex: 120,
    })
  } catch (e) {
    console.warn('行驶轨迹绘制失败', e)
    return null
  }
}

/* ============================================================
   ⭐ 分车承运（一货多车）：把**每辆车**都画到同一张地图上（方案 A）
   ------------------------------------------------------------
   · 一条指派 = 一台车 = 一条轨迹：一辆车查一次东风定位，颜色按指派顺序固定取
     （`LEG_COLORS`），轨迹、当前位置气泡、下方车辆卡的色点、图例四处同一个颜色；
   · 点车辆卡 / 图例 → 地图**只画那一辆**并缩放到它；再点一次回到「全部叠加」；
   · 未接单 / 没定车的趟次只参与下方卡片，不上图。
   ============================================================ */
/* 一趟的轨迹：本次进页面内缓存，切换「只看这一辆」不用重新打东风接口 */
const loadLegTrip = async (leg, force) => {
  const key = leg.progressKey
  if (!force && legTripCache.has(key)) return legTripCache.get(key)
  let trip = null
  try {
    trip = await loadVehicleTrip(legRecordOf(leg))
  } catch (e) {
    trip = null
  }
  legTripCache.set(key, trip)
  return trip
}

const drawMultiLegOnMap = async (force) => {
  const row = mainRecord.value
  if (!row) return
  const legs = multiLegs.value
  if (legTab.value >= legs.length) legTab.value = 0
  if (legFocus.value !== null && legFocus.value >= legs.length) legFocus.value = null
  const seq = ++drawSeq
  const ok = await initWaybillMap()
  if (!ok || !wbMap || seq !== drawSeq) return

  wbMap.clearMap()
  mapHint.value = ''

  const start = await resolvePoint(row.pickup)
  const end = await resolvePoint(row.delivery)
  if (seq !== drawSeq) return

  const overlays = []
  if (start) overlays.push(makeMarker(start, '起', '#0F6E56', false))
  if (end) overlays.push(makeMarker(end, '终', '#c8102e', false))

  const focus = legFocus.value
  const nextTrips = {}
  /* 两辆车停在同一位置时，把后一辆的车牌气泡往上错开，避免互相压住 */
  const seenPos = new Map()
  let located = 0

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]
    if (!leg.plate) continue // 还没定车（没接单）→ 这条趟次不上图
    const trip = await loadLegTrip(leg, force)
    if (seq !== drawSeq) return
    if (!trip) {
      nextTrips[leg.progressKey] = { current: null, points: [], error: '车辆轨迹获取失败' }
      continue
    }
    nextTrips[leg.progressKey] = trip

    /* 每趟的进度：地图上方的甘特是「每趟一行」→ 不分聚焦与否都要算 */
    setProgress(
      leg.progressKey,
      computeProgress({
        traveledMeters: traveledMetersSince(trip.points, leg.departTime || leg.acceptTime),
        planDistance: row.plan_distance,
        planDuration: row.plan_duration,
        lastReportAt: trip.current ? trip.current.reportAt : 0,
      })
    )

    /* 聚焦某一辆时，其余的只算数据、不上图 */
    if (focus !== null && i !== focus) continue

    if (trip.points && trip.points.length >= 2) {
      const line = buildTrackLine(
        downsamplePoints(trip.points),
        leg.color,
        focus === null ? 0.8 : 0.95
      )
      if (line) overlays.push(line)
    }
    if (trip.current) {
      const posKey = trip.current.lng.toFixed(3) + ',' + trip.current.lat.toFixed(3)
      const dup = seenPos.get(posKey) || 0
      seenPos.set(posKey, dup + 1)
      overlays.push(
        makeMarker(
          [trip.current.lng, trip.current.lat],
          '',
          leg.color,
          true,
          leg.plate,
          dup ? -26 * dup : 0
        )
      )
      located++
    }
  }

  legTripMap.value = nextTrips

  if (seq !== drawSeq) return
  if (overlays.length) {
    wbMap.add(overlays)
    wbMap.setFitView(overlays, false, [70, 70, 70, 70])
  }
  if (!located && !start && !end) {
    mapHint.value = '装货地 / 卸货地未匹配到坐标，且各车暂无定位数据'
  } else if (!located) {
    mapHint.value =
      focus === null
        ? '各车暂时没有定位数据（可能还没接单，或车辆熄火离线）'
        : '这一趟暂时没有定位数据（可能还没接单，或车辆熄火离线）'
  }
}

/* 物流状态页统一的绘制入口：分车承运 → 多车叠加；常驻 → 无地图；普通 → 单车 */
const drawLogisticsMap = (opts) => {
  if (isRecurringWaybill.value) return refreshProgressForRunningTrips()
  if (isMultiLegWaybill.value) return drawMultiLegOnMap(!!(opts && opts.force))
  return drawRecordOnMap(activeRecord.value)
}

// ---------- 物流状态数据加载 ----------
const loadRecords = async () => {
  const main = mainRecord.value
  if (!main) return
  loadingLogistics.value = true
  try {
    const groupNo = String(main.recurring_group_no || '').trim()
    if (main.is_recurring && groupNo) {
      try {
        let q = supabase
          .from('waybills')
          .select('*')
          .eq('recurring_group_no', groupNo)
          .order('create_time', { ascending: true })
        if (isCustomer && myAccount) q = q.eq('owner_account', myAccount)
        const { data, error } = await q
        if (error) throw error
        records.value = data && data.length ? data : [main]
      } catch (e) {
        console.warn('常驻任务运输记录加载失败，降级为单条', e)
        records.value = [main]
      }
    } else {
      records.value = [main]
    }

    if (!records.value.some(r => r.waybill_no === activeRecordNo.value)) {
      activeRecordNo.value = records.value[0] ? records.value[0].waybill_no : ''
    }
    refreshedAtText.value = dayjs().format('HH:mm')
    if (activeTab.value === 'logistics') {
      nextTick(() => drawLogisticsMap())
    }
  } finally {
    loadingLogistics.value = false
  }
}

/* ⭐ 常驻任务没有地图，进度靠轨迹单独算；只算「进行中」的趟次 */
const refreshProgressForRunningTrips = async () => {
  const running = records.value.filter(isRunningStatus)
  if (!running.length) return
  loadingLogistics.value = true
  try {
    for (const rec of running) {
      if (!pickVehiclePlate(rec)) continue
      try {
        const trip = await loadVehicleTrip(rec)
        setProgress(
          rec.waybill_no,
          computeProgress({
            traveledMeters: traveledMetersSince(trip.points, rec.depart_time),
            planDistance: rec.plan_distance,
            planDuration: rec.plan_duration,
            lastReportAt: trip.current ? trip.current.reportAt : 0,
          })
        )
      } catch (e) {
        /* 单辆车失败不影响其他趟次 */
        console.warn('进度计算失败', rec.waybill_no, e)
      }
    }
    refreshedAtText.value = dayjs().format('HH:mm')
  } finally {
    loadingLogistics.value = false
  }
}

/* ============================================================
   ⭐ 标签页 3：费用情况（上报列表 + 就地审批）
   数据来源：reports（按 waybill_no）
   审批口径：flow[current_level-1] 的 approver_id 是否等于当前登录人
   ============================================================ */
const feeReports = ref([])
const feeLoading = ref(false)
const feeFilter = ref('all')
const feeError = ref('')
const feeApprovalEnabled = ref(true)
const expandedFee = ref(null)
const actingId = ref(null)

const rejectVisible = ref(false)
const rejectTarget = ref(null)
const rejectReason = ref('缺凭证照片')
const rejectNote = ref('')
const REJECT_REASONS = ['缺凭证照片', '金额与票据不符', '运单号不符', '重复上报', '超过规定期限', '其它']

const TYPE_LABEL = {
  expense: '费用上报', weigh: '磅单上报', subsidy: '补贴申请', violation: '违章上报',
  overtime: '超时报备', receipt: '回单上报', loan: '借款申请', cardfix: '补卡申请',
}
const TYPE_SHORT = {
  expense: '费', weigh: '磅', subsidy: '补', violation: '违',
  overtime: '超', receipt: '回', loan: '借', cardfix: '卡',
}
const MONEY_TYPES = ['expense', 'subsidy', 'loan', 'violation']

const typeLabel = (t) => TYPE_LABEL[t] || '上报'
const typeShort = (t) => TYPE_SHORT[t] || '报'
const hasAmount = (t) => MONEY_TYPES.includes(t)
const money = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const roleLabel = (r) => ({ creator: '发单人', finance: '财务', owner: '主账号' }[r] || '审批人')

const isMasterUser = isAdmin || !isSubAccount

const reportItems = (r) => {
  const p = r?.payload || {}
  const list = p.items || p.detail || p.expenses || []
  return Array.isArray(list) ? list : []
}
const reportImages = (r) => (Array.isArray(r?.images) ? r.images : [])

/* ⭐ fileID → 临时链接（失败就保留文字占位，不影响主流程） */
const imageUrls = ref({})
const reportImageUrls = (r) =>
  reportImages(r).map((img) => imageUrls.value[img.fileID]).filter(Boolean)

async function loadImageUrls(list) {
  const ids = []
  ;(list || []).forEach((r) => {
    reportImages(r).forEach((img) => {
      if (img && img.fileID && !imageUrls.value[img.fileID]) ids.push(img.fileID)
    })
  })
  if (!ids.length) return
  try {
    const res = await app.getTempFileURL({ fileList: ids })
    const map = { ...imageUrls.value }
    ;(res.fileList || []).forEach((f) => {
      if (f.tempFileURL) map[f.fileID] = f.tempFileURL
    })
    imageUrls.value = map
  } catch (e) {
    console.warn('[费用情况] 凭证临时链接获取失败（仍显示文字占位）', e)
  }
}

const statusTagType = (st) => {
  if (st === '已通过' || st === '已打款') return 'success'
  if (st === '已驳回') return 'danger'
  if (st === '待打款') return 'primary'
  if (st === '草稿' || st === '已撤回') return 'info'
  return 'warning'
}

const currentStep = (r) => {
  const lv = Number(r?.current_level) || 0
  if (!lv) return null
  return (r.flow || [])[lv - 1] || null
}

const canApprove = (r) => {
  if (!r || r.status !== '审核中') return false
  const st = currentStep(r)
  if (!st) return false
  if (st.approver_id && Number(st.approver_id) === Number(currentUser.id)) return true
  // 主账号节点没指定具体人时，由主账号兜底
  return st.role === 'owner' && isMasterUser
}

const stepClass = (st) => {
  if (!st) return ''
  if (st.status === '已通过') return 'done'
  if (st.status === '待处理') return 'cur'
  if (st.status === '已跳过') return 'skip'
  return ''
}
const stepText = (st) => {
  if (!st) return ''
  if (st.status === '已通过') return `${fmtTime(st.acted_at)} 通过`
  if (st.status === '已跳过') return '免审跳过'
  if (st.status === '已驳回') return `${fmtTime(st.acted_at)} 驳回`
  return '待处理'
}

const feeSummary = computed(() => {
  let total = 0
  let paid = 0
  let approved = 0
  feeReports.value.forEach((r) => {
    const amt = Number(r.amount) || 0
    if (hasAmount(r.type)) total += amt
    if (['已通过', '待打款', '已打款'].includes(r.status)) approved += 1
    if (r.status === '已打款') paid += amt
  })
  return { total, paid, approved }
})

const feePendingCount = computed(() => feeReports.value.filter((r) => canApprove(r)).length)
const feePendingTotal = computed(() => feeReports.value.filter((r) => r.status === '审核中').length)

/* ===== 左侧摘要 ===== */
const asideStatus = computed(
  () => (activeRecord.value && activeRecord.value.status) || (mainRecord.value && mainRecord.value.status) || '—'
)
const asideCargo = computed(() => {
  const m = mainRecord.value || {}
  const first = (form.cargoList && form.cargoList[0]) || {}
  const name = m.cargo || first.name || ''
  const qty = m.quantity || first.quantity || ''
  return [name, qty].filter(Boolean).join(' · ') || '—'
})
const asideVehicle = computed(() => {
  const m = mainRecord.value || {}
  const a = (assignList.value || [])[0] || {}
  const v = m.vehicle || (a.method === 'vehicle' ? a.target : '')
  const d = m.driver || (a.method === 'driver' ? a.target : '')
  if (v || d) return [v, d].filter(Boolean).join(' · ')
  return a.target || '—'
})

const filteredReports = computed(() => {
  const list = feeReports.value
  if (feeFilter.value === 'all') return list
  if (feeFilter.value === 'mine') return list.filter((r) => canApprove(r))
  return list.filter((r) => r.status === feeFilter.value)
})

const toggleFee = (r) => {
  expandedFee.value = expandedFee.value === r.id ? null : r.id
}

const openReject = (r) => {
  rejectTarget.value = r
  rejectReason.value = '缺凭证照片'
  rejectNote.value = ''
  rejectVisible.value = true
}

async function loadFeeReports() {
  if (!waybillNo.value) return
  feeLoading.value = true
  feeError.value = ''
  try {
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .eq('waybill_no', waybillNo.value)
      .order('create_time', { ascending: false })
    if (error) throw error
    feeReports.value = Array.isArray(data) ? data : []
    if (mainRecord.value && mainRecord.value.fee_approval === 'off') feeApprovalEnabled.value = false
    if (!feeReports.value.length && expandedFee.value) expandedFee.value = null
    loadImageUrls(feeReports.value)
  } catch (e) {
    console.warn('[费用情况] 读取上报失败', e)
    feeError.value = e?.message || String(e)
    feeReports.value = []
  } finally {
    feeLoading.value = false
  }
}

async function writeFlow(r, mutate, action, comment) {
  actingId.value = r.id
  try {
    const flow = JSON.parse(JSON.stringify(r.flow || []))
    const level = Number(r.current_level) || 1
    const idx = Math.max(0, level - 1)
    mutate(flow, idx)

    const nextIdx = flow.findIndex((st, i) => i > idx && st.status === '待处理')
    const status = nextIdx === -1 ? '已通过' : '审核中'
    const nextLevel = nextIdx === -1 ? 0 : Number(flow[nextIdx].level) || nextIdx + 1

    const { error } = await supabase
      .from('reports')
      .update({
        flow,
        status,
        current_level: nextLevel,
        update_time: new Date().toISOString(),
      })
      .eq('id', r.id)
    if (error) throw error

    try {
      await supabase.from('report_approval_logs').insert({
        report_id: r.id,
        level,
        actor_id: currentUser.id,
        actor_name: currentUser.name || currentUser.account,
        action,
        comment: comment || '',
      })
    } catch (logErr) {
      console.warn('[费用情况] 审批日志写入失败（不影响主流程）', logErr)
    }

    Object.assign(r, { flow, status, current_level: nextLevel })
    ElMessage.success(status === '已通过' ? '已通过，流程结束' : `已通过，转第 ${nextLevel} 级`)
  } catch (e) {
    console.error('[费用情况] 审批失败', e)
    ElMessage.error('操作失败：' + (e?.message || '未知错误'))
  } finally {
    actingId.value = null
  }
}

const approveReport = (r) => writeFlow(r, (flow, idx) => {
  if (!flow[idx]) return
  flow[idx].status = '已通过'
  flow[idx].acted_at = new Date().toISOString()
  flow[idx].name = currentUser.name || currentUser.account || flow[idx].name
}, 'approve')

const escalateReport = (r) => writeFlow(r, (flow, idx) => {
  if (flow[idx]) {
    flow[idx].status = '已通过'
    flow[idx].acted_at = new Date().toISOString()
  }
  if (!flow.some((st) => Number(st.level) === 3)) {
    flow.push({
      level: 3,
      role: 'owner',
      approver_id: null,
      name: currentUser.masterName || '主账号',
      status: '待处理',
    })
  }
}, 'escalate', '要求老板终审')

const confirmReject = async () => {
  const r = rejectTarget.value
  if (!r) return
  const text = rejectNote.value.trim()
  const reason = text ? `${rejectReason.value}：${text}` : rejectReason.value
  actingId.value = r.id
  try {
    const { error } = await supabase
      .from('reports')
      .update({
        status: '已驳回',
        reject_reason: reason,
        reject_count: (Number(r.reject_count) || 0) + 1,
        update_time: new Date().toISOString(),
      })
      .eq('id', r.id)
    if (error) throw error

    try {
      await supabase.from('report_approval_logs').insert({
        report_id: r.id,
        level: Number(r.current_level) || 1,
        actor_id: currentUser.id,
        actor_name: currentUser.name || currentUser.account,
        action: 'reject',
        comment: reason,
      })
    } catch (logErr) {
      console.warn('[费用情况] 驳回日志写入失败', logErr)
    }

    r.status = '已驳回'
    r.reject_reason = reason
    r.reject_count = (Number(r.reject_count) || 0) + 1
    rejectVisible.value = false
    ElMessage.success('已驳回，司机可在小程序补齐后重提')
  } catch (e) {
    console.error('[费用情况] 驳回失败', e)
    ElMessage.error('驳回失败：' + (e?.message || '未知错误'))
  } finally {
    actingId.value = null
  }
}

/* ============================================================
   ⭐ 登记付款 / 撤销付款 / 凭据
   弹窗抽到 components/PaymentDialog.vue（和「费用管理 → 付款登记」共用一套逻辑）
   ============================================================ */
const payVisible = ref(false)
const payTargets = ref([])
const revokeVisible = ref(false)
const revokeTargets = ref([])
const voucherVisible = ref(false)
const voucherImages = ref([])
const voucherTitle = ref('付款凭据')

const canPay = (r) => {
  if (!r || !['已通过', '待打款'].includes(r.status)) return false
  if (!hasAmount(r.type)) return false
  return isPayer(currentUser) && moduleFlags.payout
}

const canRevoke = (r) => !!r && r.status === '已打款' && isPayer(currentUser) && moduleFlags.payout
const voucherCount = (r) => (Array.isArray(r?.payment?.images) ? r.payment.images.length : 0)

const openPay = (r) => {
  if (!moduleFlags.payout) return ElMessage.warning('付款登记未开通，请先在费用审批设置里打开')
  if (!canPay(r)) return ElMessage.warning('只有主账号或财务可以登记付款')
  payTargets.value = [r]
  payVisible.value = true
}

const openRevoke = (r) => {
  if (!canRevoke(r)) return ElMessage.warning('只有主账号或财务可以撤销付款')
  revokeTargets.value = [r]
  revokeVisible.value = true
}

const openVouchers = (r) => {
  const imgs = Array.isArray(r?.payment?.images) ? r.payment.images : []
  if (!imgs.length) return
  voucherImages.value = imgs
  voucherTitle.value = `付款凭据 · ${r.waybill_no || r.report_no || ''}`
  voucherVisible.value = true
}

const onPayDone = async () => { await loadFeeReports() }
const onRevokeDone = async () => { await loadFeeReports() }

const switchTab = (tab) => {
  activeTab.value = tab
  if (tab === 'fee') {
    if (!feeReports.value.length) loadFeeReports()
    return
  }
  if (tab !== 'logistics') return
  nextTick(() => drawLogisticsMap({ force: true }))
}

/* ============================================================
   ⭐ 刷新：手动触发，不自动轮询（避免持续打东风接口）
   常驻任务 → 重拉运输记录 + 算在途趟次进度
   普通运单 → 重画地图轨迹 + 重算进度
   ============================================================ */
const refreshLogistics = async () => {
  if (loadingLogistics.value) return
  if (isRecurringWaybill.value) {
    await loadRecords()
  } else {
    await drawLogisticsMap({ force: true })
  }
  refreshedAtText.value = dayjs().format('HH:mm')
}

/* ============================================================
   ⭐ 一键填充：按同组上一趟的计划时间 +1 天
   ============================================================ */
const planSaving = ref(false)

/* 同组内「上一趟」= 序号比当前小、且已有计划时间的那一条 */
const prevTrip = computed(() => {
  const rec = mainRecord.value
  if (!rec) return null
  const list = records.value
    .filter(r => r.waybill_no !== rec.waybill_no)
    .filter(r => parseTimeMs(r.create_time) <= parseTimeMs(rec.create_time) || !rec.create_time)
    .filter(r => r.pickup_time || r.plan_time)
    .sort((a, b) => parseTimeMs(b.create_time) - parseTimeMs(a.create_time))
  return list[0] || null
})

const planTimeBrief = computed(() => {
  const rec = mainRecord.value
  if (!rec) return '--'
  return '计划装货 ' + fmtTime(rec.pickup_time) + ' · 计划到达 ' + fmtTime(rec.plan_time)
})

const fillPlanTimeFromPrev = async () => {
  const rec = mainRecord.value
  const prev = prevTrip.value
  if (!rec || planSaving.value) return
  if (!prev) {
    ElMessage.warning('没有找到上一趟的计划时间，无法填充')
    return
  }
  planSaving.value = true
  try {
    const shift = (t) => (t ? dayjs(t).add(1, 'day').format('YYYY-MM-DD HH:mm:ss') : null)
    const patch = { pickup_time: shift(prev.pickup_time), plan_time: shift(prev.plan_time) }
    if (!patch.pickup_time && !patch.plan_time) {
      ElMessage.warning('上一趟没有填写计划时间，无法填充')
      return
    }
    const { error } = await supabase.from('waybills').update(patch).eq('id', rec.id)
    if (error) throw error

    Object.assign(rec, patch)
    const hit = records.value.find(r => r.waybill_no === rec.waybill_no)
    if (hit) Object.assign(hit, patch)
    tasks.value.forEach(t => {
      if (patch.pickup_time) t.pickupTime = patch.pickup_time
      if (patch.plan_time) t.deliveryTime = patch.plan_time
    })
    ElMessage.success('已按上一趟 +1 天填充计划时间')
  } catch (e) {
    ElMessage.error('填充失败：' + e.message)
  } finally {
    planSaving.value = false
  }
}

/* 筛选后原选中记录被过滤掉时，自动落到第一条 */
watch(filteredRecords, (list) => {
  if (!list.length) return
  if (!list.some(r => r.waybill_no === activeRecordNo.value)) {
    activeRecordNo.value = list[0].waybill_no
  }
})

watch(
  () => (activeRecord.value ? activeRecord.value.waybill_no : ''),
  () => {
    if (activeTab.value === 'logistics') drawLogisticsMap()
  }
)

onBeforeUnmount(() => {
  if (wbMap) {
    try { wbMap.destroy() } catch (e) { /* 忽略 */ }
  }
  wbMap = null
  wbAMap = null
})

// ---------- 从数据库加载运单（含隔离） ----------
const loadWaybill = async () => {
  const no = route.query.waybill_no
  if (!no) {
    ElMessage.error('缺少运单编号')
    router.push('/waybill')
    return
  }
  waybillNo.value = String(no)

  try {
        // ⭐ 加隔离过滤
    let q = supabase
      .from('waybills')
      .select('*')
      .eq('waybill_no', no)

    if (isCustomer && myAccount) {
      q = q.eq('owner_account', myAccount)
    }

    // ⭐ 二级机构子账号：按 assigned_orgs 隔离
    if (needOrgFilter.value && myOrgName.value) {
      q = q.or(`assigned_orgs.ilike.%${myOrgName.value}%,org.eq.${myOrgName.value}`)
    }

    const { data, error } = await q.single()

    if (error) throw error
    if (!data) {
      ElMessage.error('运单不存在或无权限访问')
      router.push('/waybill')
      return
    }

    // 填充数据
    // ⭐ 运输节点模式与打卡开关（老数据没有这两个字段时按「详细 + 开启」兜底）
    form.transportMode = data.transport_mode === '极简' ? '极简' : '详细'
    form.checkInRequired =
      form.transportMode === '详细' ? data.check_in_required !== false : false
    checkInOffInfo.by = data.check_in_off_by || ''
    checkInOffInfo.time = data.check_in_off_time || ''
    checkInOffInfo.remark = data.check_in_off_remark || ''

    // ⭐ 拒单信息（仅「待重新指派」状态展示，其余状态一律清空）
    rejectInfo.value =
      data.status === '待重新指派' && String(data.reject_reason || '').trim()
        ? {
            reason: data.reject_reason,
            note: data.reject_note || '',
            by: data.reject_by || '',
            timeText: formatRejectTime(data.reject_time),
            count: Number(data.reject_count) || 0,
          }
        : null

    // ⭐ 物流状态标签页：主体运单 + 其常驻任务下的全部运输记录
    waybillNo.value = data.waybill_no || String(no)
    mainRecord.value = data
    // ⭐ 预取上报：让「费用情况」tab 的红点一进来就有数（失败也只影响该 tab）
    loadFeeReports()

    const taskId = 1
    tasks.value = [{
      id: taskId,
      customName: data.task_name || '',
      color: taskColors[0],
      pickupLocation: data.pickup || '',
      pickupTime: data.pickup_time || '',
      senderPhone: data.pickup_contact_phone || '',
      pickupCustomer: data.customer_archive_name
        ? `${data.customer_archive_name}${data.pickup_contact_name ? ' · ' + data.pickup_contact_name : ''}`
        : '',
      deliveryLocation: data.delivery || '',
      deliveryTime: data.plan_time || '',
      receiverPhone: data.delivery_contact_phone || '',
      deliveryCustomer: data.customer_archive_name
        ? `${data.customer_archive_name}${data.delivery_contact_name ? ' · ' + data.delivery_contact_name : ''}`
        : '',
    }]

    // 货物列表
    form.cargoList = []
    if (data.cargo && data.cargo !== '无') {
      // 简单解析，默认一个货物（实际可存结构化，这里简化）
      form.cargoList.push({
        id: 1,
        name: data.cargo || '',
        quantity: data.quantity || 0,
        unit: '吨',
        freight: data.freight || 0,   // 从数据库读取运费
        taskId: taskId
      })
    } else {
      form.cargoList.push({
        id: 1,
        name: '',
        quantity: 0,
        unit: '吨',
        freight: 0,
        taskId: taskId
      })
    }

    // 指派列表
    const assignments = data.assignments || []
    if (assignments.length > 0) {
      assignList.value = assignments.map((a, idx) => ({
        id: idx + 1,
        assignMethod: a.method || 'driver',
        taskId: taskId,
        items: a.items.map((item, i) => ({
          id: i + 1,
          target: item.target || '',
          carryQuantity: item.carryQuantity || 0,
          carryFreight: item.carryFreight || 0
        }))
      }))
    } else {
      // 默认占位
      assignList.value = [{
        id: 1,
        assignMethod: 'driver',
        taskId: taskId,
        items: [{ id: 1, target: '', carryQuantity: 0, carryFreight: 0 }]
      }]
    }

    // ⭐ 物流状态标签页数据（常驻任务会带出同组的多条运输记录）
    await loadRecords()

  } catch (err) {
    console.error('加载运单失败', err)
    ElMessage.error('加载运单失败：' + err.message)
  }
}

// ---------- 创建相同运单 ----------
const createSameWaybill = () => {
  // 构建完整的克隆数据
  const cloneData = {
    tasks: tasks.value.map(t => ({
      customName: t.customName,
      pickupLocation: t.pickupLocation,
      pickupTime: t.pickupTime,
      senderPhone: t.senderPhone,
      deliveryLocation: t.deliveryLocation,
      deliveryTime: t.deliveryTime,
      receiverPhone: t.receiverPhone,
      // ⭐ 续建下一趟时，用来做「按上一趟 +1 天」
      planFromPickup: (mainRecord.value && mainRecord.value.pickup_time) || '',
      planFromPlan: (mainRecord.value && mainRecord.value.plan_time) || ''
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
    checkInRequired: form.checkInRequired,
    // ⭐ 常驻任务配置随克隆带走，续建的是同一常驻任务下的新运输记录
    recurring: mainRecord.value
      ? {
          isRecurring: !!mainRecord.value.is_recurring,
          type: mainRecord.value.recurring_type || 'time',
          start: mainRecord.value.recurring_start_time || '',
          end: mainRecord.value.recurring_end_time || '',
          count: Number(mainRecord.value.recurring_max_count) || 1,
          groupNo: mainRecord.value.recurring_group_no || ''
        }
      : null
  }

  // 通过 history state 传递数据
  router.push({
    path: '/waybill/create',
    state: { cloneData }
  })
}

onMounted(async () => {
  if (isCustomer && isSubAccount) await loadMyOrgInfo()
  /* ⭐ 付款登记是可配置模块：先确认开关，避免直接深链进来看到禁用入口 */
  ensureModuleFlags(currentUser)
  loadWaybill()
  // ⭐ 深链：/waybill/detail?waybill_no=xxx&tab=fee
  const tabQ = String(route.query.tab || '')
  if (['info', 'logistics', 'fee'].includes(tabQ)) switchTab(tabQ)
})
</script>

<style scoped>
/* ===== 页面容器 =====
   ⚠️ 这个页面是**独立路由**（/waybill/detail，不在 Dashboard 里），
   外层没有 .main-content 那种滚动容器；页面自己必须滚，
   否则内容一超一屏就拖不动（运单信息 / 物流状态两个 tab 都会卡住）。 */
.waybill-detail {
  height: 100vh;
  height: 100dvh;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 20px 40px;
  box-sizing: border-box;
  background: #f8fafc;
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
}

/* ===== 页面头部 ===== */
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

/* ===== ⭐ 拒单信息提示块 ===== */
.reject-alert {
  margin: 14px 0 4px 0;
  background: #FCEBEB;
  border: 1px solid #F7C1C1;
  border-left: 4px solid #A32D2D;
  border-radius: 8px;
  padding: 12px 16px;
}
.reject-alert-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 800;
  color: #791F1F;
  margin-bottom: 10px;
}
.reject-alert-icon {
  color: #A32D2D;
  font-size: 15px;
}
.reject-count {
  margin-left: auto;
  font-size: 11px;
  font-weight: 500;
  color: #A32D2D;
  background: #F7C1C1;
  border-radius: 999px;
  padding: 2px 9px;
  white-space: nowrap;
}
.reject-alert-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.reject-line {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 12.5px;
  line-height: 1.6;
}
.reject-key {
  flex-shrink: 0;
  width: 60px;
  color: #94A3B8;
}
.reject-val {
  color: #1E293B;
  font-weight: 500;
  word-break: break-all;
}
.reject-mono {
  font-family: 'Courier New', Courier, monospace;
  font-size: 12px;
  color: #475569;
}

/* ===== 分区标题 ===== */
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

/* ===== 打卡行 ===== */
.checkin-row {
  margin-bottom: 16px;
  padding: 12px 16px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
}
.checkin-row .el-form-item {
  margin-bottom: 0;
}
.hint-text {
  font-size: 12px;
  color: #94A3B8;
  margin-left: 12px;
  font-weight: 500;
}

/* ===== ⭐ 运输节点与打卡管控 ===== */
.checkin-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 5px 0;
}
.checkin-label {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  white-space: nowrap;
}
.checkin-off-tip {
  margin-top: 8px;
  padding: 6px 10px;
  font-size: 12px;
  color: #A32D2D;
  background: #FCEBEB;
  border-left: 3px solid #A32D2D;
  border-radius: 6px;
}
.checkin-value {
  font-size: 12px;
  color: #475569;
  font-family: 'Courier New', monospace;
}

/* ===== ⭐ 实际进度卡（普通运单） ===== */
.lg-progress-card {
  padding: 12px 18px 10px 18px;
  margin-bottom: 10px;
  background: #ffffff;
  border: 1px solid #E2E8F0;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
}
.co-tip {
  margin-bottom: 12px;
  padding: 10px 12px;
  font-size: 12.5px;
  line-height: 1.7;
  color: #A32D2D;
  background: #FEF2F2;
  border-left: 3px solid #c8102e;
  border-radius: 6px;
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
.task-card:hover::before {
  opacity: 1;
}
.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.task-name-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
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
}
.task-name-display {
  font-size: 14px;
  color: #0F172A;
  font-weight: 600;
}

/* ===== 起/终行 ===== */
.row-wrapper {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}
.row-wrapper:last-of-type {
  margin-bottom: 0;
}
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
.badge-circle:hover {
  transform: scale(1.1) rotate(-6deg);
}
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

/* ===== 货物信息 & 指派信息共用 ===== */
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
.info-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}
.info-label {
  color: #475569;
  white-space: nowrap;
  font-weight: 600;
}
.info-value {
  font-weight: 800;
  color: #c8102e;
  font-size: 16px;
  font-family: 'Courier New', monospace;
}

/* ===== 货物行 ===== */
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
.cargo-row .el-row {
  flex-wrap: nowrap;
}
.cargo-row .el-form-item {
  margin-bottom: 0;
}
.cargo-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  height: 100%;
}

/* ===== 指派卡片 ===== */
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
.assign-card .el-row {
  flex-wrap: nowrap;
}
.assign-card .el-form-item {
  margin-bottom: 0;
}
.assign-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  height: 100%;
}
.assign-items {
  padding-left: 0;
}
.assign-item {
  margin-bottom: 8px;
}
.assign-item-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  height: 100%;
}

/* ===== 底部按钮（吸底） ===== */
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

/* ===== 响应式 ===== */
@media (max-width: 768px) {
  .field-group {
    flex-direction: column;
    gap: 8px;
  }
  .field-item {
    min-width: unset;
  }
  .info-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .form-actions {
    flex-wrap: wrap;
    justify-content: center;
  }
  .hint-text {
    display: block;
    margin-left: 0;
    margin-top: 4px;
  }
  .task-header {
    flex-wrap: wrap;
    gap: 8px;
  }
  .cargo-row .el-row,
  .assign-card .el-row,
  .assign-item .el-row {
    flex-wrap: wrap;
  }
  .cargo-row .el-col,
  .assign-card .el-col,
  .assign-item .el-col {
    margin-bottom: 6px;
  }
}

/* ============================================================
   ⭐ 标签页切换
   ============================================================ */
.detail-tabs {
  display: flex;
  align-items: center;
  margin-bottom: 14px;
  padding: 0 20px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
}
.detail-tab {
  position: relative;
  padding: 14px 2px 13px 2px;
  margin-right: 24px;
  border: none;
  background: transparent;
  font-size: 14px;
  font-weight: 600;
  color: #94A3B8;
  cursor: pointer;
  transition: color 0.2s;
  font-family: inherit;
}
.detail-tab:hover { color: #475569; }
.detail-tab.active { color: #0F172A; }
.detail-tab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 6px;
  height: 2px;
  border-radius: 1px;
  background: #c8102e;
}
.detail-tab-dot {
  display: inline-block;
  width: 5px;
  height: 5px;
  margin-left: 5px;
  border-radius: 50%;
  background: #c8102e;
  vertical-align: middle;
}
.detail-tabs-hint {
  margin-left: auto;
  font-size: 12px;
  color: #94A3B8;
  font-family: 'Courier New', monospace;
}

/* ============================================================
   ⭐ 物流状态标签页（方案 D）
   ============================================================ */
.lg-panel { padding-bottom: 8px; }

/* ---- 一级筛选 ---- */
.lg-filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 12px 16px;
  margin-bottom: 10px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
}
.lg-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 12px;
  border-radius: 13px;
  border: 1px solid transparent;
  background: #F1F5F9;
  color: #475569;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}
.lg-pill:hover { background: #E2E8F0; }
.lg-pill.active { background: #FCEBEB; color: #A32D2D; border-color: #E24B4A; }
.lg-pill em {
  font-style: normal;
  font-size: 11px;
  font-weight: 700;
  padding: 0 5px;
  border-radius: 8px;
  background: #ffffff;
  color: inherit;
  opacity: 0.85;
}
/* ===== ⭐ 刷新工具条（常驻与普通共用） ===== */
.lg-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-bottom: 10px;
}
.lg-updated {
  font-size: 12px;
  color: #94A3B8;
  font-family: 'Courier New', monospace;
}
.lg-refresh-icon {
  margin-right: 4px;
  font-size: 13px;
  vertical-align: -2px;
}

/* ---- 已接单二级筛选 ---- */
.lg-sub-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 16px;
  margin-bottom: 10px;
  background: #ffffff;
  border-radius: 12px;
  border-left: 3px solid #c8102e;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
}
.lg-sub-branch { font-size: 12px; font-weight: 700; color: #A32D2D; }
.lg-sub-connector { width: 14px; height: 1px; background: #E2E8F0; }
.lg-seg {
  height: 24px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: #F8FAFC;
  color: #64748B;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}
.lg-seg:hover { background: #F1F5F9; }
.lg-seg.active {
  background: #ffffff;
  border-color: #E2E8F0;
  color: #0F172A;
  font-weight: 600;
}
.lg-seg em { font-style: normal; margin-left: 4px; font-size: 11px; color: #94A3B8; }

/* ---- 运输记录卡片 ---- */
.lg-records {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 4px;
  margin-bottom: 10px;
}
.lg-record {
  position: relative;
  flex: 0 0 auto;
  width: 220px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #ffffff;
  border: 1px solid #E2E8F0;
  cursor: pointer;
  transition: all 0.25s;
}
.lg-record:hover {
  border-color: #FCA5A5;
  box-shadow: 0 6px 18px rgba(200, 16, 46, 0.08);
}
.lg-record.active {
  border-color: #c8102e;
  box-shadow: 0 6px 18px rgba(200, 16, 46, 0.14);
}
.lg-record-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.lg-record-no {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  font-weight: 700;
  color: #0F172A;
}
.lg-status-tag {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 9px;
  white-space: nowrap;
}
.lg-record-route {
  margin-top: 6px;
  font-size: 12.5px;
  color: #1E293B;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lg-record-route i { font-style: normal; color: #c8102e; margin: 0 2px; }
.lg-record-meta { margin-top: 4px; font-size: 11.5px; color: #94A3B8; }
.lg-record-flag {
  position: absolute;
  top: -1px;
  right: -1px;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 700;
  color: #ffffff;
  background: #f5a623;
  border-radius: 0 10px 0 8px;
}
.lg-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 0;
  margin-bottom: 10px;
  background: #ffffff;
  border: 1px dashed #E2E8F0;
  border-radius: 12px;
}
.lg-empty-text { font-size: 13px; color: #94A3B8; }

/* ---- 地图 + 时间轴 ---- */
.lg-main { display: flex; gap: 12px; align-items: stretch; }
.lg-map-wrap {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  height: 520px;
  border-radius: 12px;
  overflow: hidden;
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
}
.lg-map { width: 100%; height: 100%; }
.lg-map-mask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 40px;
  text-align: center;
  font-size: 13px;
  color: #64748B;
  background: rgba(248, 250, 252, 0.93);
  z-index: 5;
}
.lg-vehicle-card {
  position: absolute;
  left: 12px;
  bottom: 12px;
  min-width: 220px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid #E2E8F0;
  border-radius: 10px;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
  z-index: 6;
}
.lg-vehicle-card.is-empty {
  min-width: 0;
  max-width: 78%;
  background: rgba(248, 250, 252, 0.97);
}
.lg-vc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.lg-vc-plate {
  font-family: 'Courier New', monospace;
  font-size: 13px;
  font-weight: 700;
  color: #0F172A;
  white-space: nowrap;
}
.lg-vc-line { margin-top: 4px; font-size: 12px; color: #475569; }
.lg-vc-mono {
  font-family: 'Courier New', monospace;
  font-size: 11.5px;
  color: #94A3B8;
}
.lg-legend {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: flex;
  gap: 12px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 11.5px;
  color: #64748B;
  z-index: 6;
}
.lg-legend span { display: inline-flex; align-items: center; gap: 5px; }
.lg-lg-dot { width: 8px; height: 8px; border-radius: 50%; }
.lg-lg-dot.start { background: #0F6E56; }
.lg-lg-dot.end { background: #c8102e; }
.lg-lg-dot.car { background: #C8102E; box-shadow: 0 0 0 3px rgba(200, 16, 46, 0.18); }
.lg-lg-line {
  width: 12px;
  height: 3px;
  border-radius: 2px;
  background: #c8102e;
}

/* ---- 行驶轨迹信息条 ---- */
.lg-track-info {
  position: absolute;
  left: 12px;
  top: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 11.5px;
  color: #475569;
  z-index: 6;
}
.lg-ti-label { font-weight: 700; color: #0F172A; }
.lg-ti-mono { font-family: 'Courier New', monospace; color: #64748B; }

/* ---- 节点时间轴 ---- */
.lg-timeline {
  flex: 0 0 306px;
  display: flex;
  flex-direction: column;
  height: 520px;
  background: #ffffff;
  border: 1px solid #E2E8F0;
  border-radius: 12px;
  overflow: hidden;
}
.lg-tl-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #F1F5F9;
}
.lg-tl-title { font-size: 13px; font-weight: 700; color: #0F172A; }
.lg-tl-body { flex: 1; overflow-y: auto; padding: 12px 16px 6px 16px; }
.lg-tl-foot {
  flex-shrink: 0;
  padding: 10px 16px;
  background: #F8FAFC;
  border-top: 1px solid #F1F5F9;
}
.lg-foot-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  line-height: 1.9;
  color: #94A3B8;
}
.lg-foot-line b { color: #334155; font-weight: 600; }
.lg-mono { font-family: 'Courier New', monospace; font-size: 11.5px; }

/* ---- 已接单分组标题 ---- */
.lg-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0 8px 0;
  padding: 6px 10px;
  border-radius: 8px;
  background: #F8FAFC;
  border-left: 3px solid #CBD5E1;
}
.lg-group.is-active { background: #FCEBEB; border-left-color: #c8102e; }
.lg-group.is-done { background: #F1F5F9; border-left-color: #0F6E56; }
.lg-group-label { font-size: 12.5px; font-weight: 700; color: #0F172A; }
.lg-group-time { font-size: 11.5px; color: #64748B; }
.lg-group-operator { margin-left: auto; font-size: 11.5px; color: #94A3B8; }

/* ---- 节点 ---- */
.lg-node {
  position: relative;
  display: flex;
  gap: 10px;
  padding: 6px 0 10px 0;
}
.lg-node.is-sub {
  margin-left: 5px;
  padding-left: 14px;
  border-left: 1px dashed #E2E8F0;
}
.lg-node-dot {
  flex: 0 0 auto;
  width: 9px;
  height: 9px;
  margin-top: 4px;
  border-radius: 50%;
  background: #ffffff;
  border: 2px solid #CBD5E1;
}
.lg-node.is-done .lg-node-dot { background: #0F6E56; border-color: #0F6E56; }
.lg-node.is-active .lg-node-dot {
  background: #c8102e;
  border-color: #c8102e;
  box-shadow: 0 0 0 4px rgba(200, 16, 46, 0.14);
}
.lg-node.is-cancelled .lg-node-dot { background: #94A3B8; border-color: #94A3B8; }
.lg-node-body { flex: 1; min-width: 0; }
.lg-node-label { display: flex; align-items: center; gap: 6px; }
.lg-node-name { font-size: 12.5px; font-weight: 600; color: #0F172A; }
.lg-node.is-pending .lg-node-name { color: #94A3B8; font-weight: 500; }
.lg-node-badge {
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 700;
  border-radius: 8px;
  background: #FCEBEB;
  color: #A32D2D;
}
.lg-node-badge.is-done { background: #E1F5EE; color: #0F6E56; }
.lg-node-time {
  margin-top: 3px;
  font-size: 11.5px;
  line-height: 1.7;
  color: #94A3B8;
}
.lg-node-time b {
  font-family: 'Courier New', monospace;
  font-weight: 600;
  color: #475569;
}
.lg-node-sep { margin: 0 5px; }
.lg-running { color: #c8102e !important; }
.lg-pending { color: #CBD5E1 !important; }
.lg-node-remark { margin-top: 2px; font-size: 11px; color: #B4B2A9; }

.lg-reassign {
  margin-bottom: 10px;
  padding: 10px 12px;
  background: #FCEBEB;
  border: 1px solid #F7C1C1;
  border-radius: 8px;
}
.lg-reassign-title { font-size: 12px; font-weight: 700; color: #791F1F; }
.lg-reassign-line { margin-top: 3px; font-size: 11.5px; color: #A32D2D; }

/* ---- 地图标记（高德注入的 DOM，需 :deep 才能命中） ---- */
:deep(.wb-marker) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid;
  background: #ffffff;
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.18);
}
:deep(.wb-marker.is-car) { animation: wbPulse 1.8s ease-out infinite; }
/* ⭐ 分车承运：当前位置用「车牌气泡」，颜色 = 该趟的颜色（和轨迹 / 车辆卡一致） */
:deep(.wb-marker.is-plate) {
  box-sizing: border-box;
  width: auto;
  height: 24px;
  padding: 0 9px 0 7px;
  gap: 5px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.2);
  animation: none;
}
:deep(.wb-marker.is-plate i) {
  display: block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
@keyframes wbPulse {
  0% { box-shadow: 0 0 0 0 rgba(200, 16, 46, 0.35); }
  70% { box-shadow: 0 0 0 12px rgba(200, 16, 46, 0); }
  100% { box-shadow: 0 0 0 0 rgba(200, 16, 46, 0); }
}

/* 窄屏：地图与时间轴由左右并排改为上下堆叠 */
@media (max-width: 1280px) {
  .lg-main { flex-direction: column; }
  .lg-map-wrap { height: 400px; }
  .lg-timeline { flex: 0 0 auto; width: 100%; height: 420px; }
}

/* ===== 全局样式（输入框禁用状态保留样式） ===== */
.waybill-detail .el-input.is-disabled .el-input__wrapper {
  background-color: #f5f7fa;
}
.waybill-detail .el-input.is-disabled .el-input__inner {
  color: #606266;
}
.waybill-detail .el-select.is-disabled .el-input__wrapper {
  background-color: #f5f7fa;
}
.waybill-detail .el-date-editor.is-disabled .el-input__wrapper {
  background-color: #f5f7fa;
}
.waybill-detail .el-input-number.is-disabled .el-input__wrapper {
  background-color: #f5f7fa;
}

/* ===== ⭐ 常驻任务：任务级操作条（暂停 / 恢复 / 结束） ===== */
.rec-task-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  margin-bottom: 12px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-left: 3px solid #c8102e;
  border-radius: 12px;
}
.rec-task-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.rec-task-name {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}
.rec-task-status {
  flex-shrink: 0;
  font-size: 11.5px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
}
.rec-task-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.rec-task-hint {
  flex: 1 0 100%;
  font-size: 11.5px;
  color: #94a3b8;
  line-height: 1.6;
}

/* ============================================================
   ⭐ 分车承运（一货多车）：一图叠多车 + 车辆卡联动（方案 A）
   ============================================================ */
.lg-multi {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px 14px 16px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}
/* 多车地图：和右侧「节点时间」面板等高，左右对齐 */
.lg-map-wrap-multi {
  flex: 1 1 auto;
  height: 520px;
}

/* ---- 地图上方：每趟一条甘特（计划 vs 实际） ---- */
.lg-leg-gantt {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px 4px 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}
.lg-gantt-row {
  padding: 4px 8px 2px 8px;
  border-radius: 8px;
  border-left: 3px solid transparent;
  cursor: pointer;
  transition: background 0.2s, opacity 0.2s, box-shadow 0.2s;
}
.lg-gantt-row + .lg-gantt-row { border-top: 1px dashed #e2e8f0; }
.lg-gantt-row:hover { background: #eef2f7; }
/* 当前聚焦这一辆：白底浮起来，其余淡出（与地图联动） */
.lg-gantt-row.is-on {
  background: #ffffff;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
}
.lg-gantt-row.is-dim { opacity: 0.5; }
.lg-gantt-row.is-done { border-left-color: #22c55e; }
.lg-gantt-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 2px;
}
.lg-gantt-name {
  font-size: 12.5px;
  font-weight: 700;
  color: #0f172a;
}
.lg-gantt-carry {
  font-size: 11.5px;
  color: #64748b;
}
.lg-gantt-times {
  margin-left: auto;
  font-size: 11.5px;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.lg-gantt-reject {
  margin: 0 2px 4px 2px;
  font-size: 11.5px;
  color: #a32d2d;
}

/* ---- 地图工具条：图例 + 当前聚焦车辆（原来浮在地图上，会压住车牌气泡） ---- */
.lg-map-tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  padding: 0 2px;
  font-size: 11.5px;
  color: #64748b;
}
.lg-map-tools > span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.lg-map-focus { margin-left: auto; color: #334155; }
.lg-map-tip { color: #94a3b8; }
.lg-map-clear {
  margin-left: 6px;
  padding: 1px 8px;
  font-size: 11px;
  color: #a32d2d;
  background: #ffffff;
  border: 1px solid #e24b4a;
  border-radius: 999px;
  cursor: pointer;
}
.lg-map-clear:hover { background: #fcebeb; }

/* ---- 右侧：趟次页签 + 该趟车辆实时位置 ---- */
/* 页签并进标题行，省一行高度给节点时间；趟次多时自动换行 */
.lg-tl-head-legs {
  flex-wrap: wrap;
  row-gap: 8px;
}
.lg-tl-tabs {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  flex: 1 1 auto;
}
.lg-tl-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  font-size: 11.5px;
  color: #475569;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}
.lg-tl-tab i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.lg-tl-tab:hover { background: #f1f5f9; }
.lg-tl-tab.active {
  color: #a32d2d;
  background: #fcebeb;
  border-color: #e24b4a;
  font-weight: 700;
}
.lg-tl-live {
  flex-shrink: 0;
  margin: 10px 16px 0 16px;
  padding: 8px 10px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 8px;
}
.lg-vc-extra {
  font-style: normal;
  color: #94a3b8;
}
.lg-legs-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding-bottom: 8px;
  border-bottom: 1px dashed #e2e8f0;
}
.lg-legs-title {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}
.lg-legs-sub {
  font-size: 11.5px;
  color: #94a3b8;
}
.lg-legs-hint {
  margin-left: auto;
  font-size: 11.5px;
  color: #94a3b8;
}
/* 趟次色点：甘特行、右侧页签、地图轨迹同一颜色 */
.lg-leg-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* ============================================================
   ⭐ 费用情况
   ============================================================ */
.fee-panel {
  background: #F8FAFC;
  border: 1px solid #E9EEF5;
  border-radius: 10px;
  padding: 12px 14px 16px;
}

.fee-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  background: #fff;
  border: 1px solid #E9EEF5;
  border-radius: 9px;
  padding: 9px 12px;
  margin-bottom: 10px;
}

.fee-stat {
  min-width: 108px;
  padding-right: 12px;
  border-right: 1px solid #F1F5F9;
}

.fee-stat:last-of-type {
  border-right: none;
}

.fee-stat span {
  display: block;
  font-size: 10.5px;
  color: #94A3B8;
  margin-bottom: 1px;
}

.fee-stat b {
  font-size: 16px;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: -.3px;
}

.fee-stat b.is-warn { color: #B45309; }
.fee-stat b.is-ok { color: #15803D; }

.fee-strip-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.fee-alert {
  margin-bottom: 10px;
}

.fee-list {
  min-height: 160px;
}

.fee-empty {
  background: #fff;
  border: 1px dashed #DDE5EF;
  border-radius: 10px;
  padding: 42px 20px;
  text-align: center;
}

.fee-empty-ic {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: #FEF2F2;
  color: #c8102e;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px;
  font-size: 21px;
}

.fee-empty p {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.fee-empty span {
  font-size: 11.5px;
  color: #94A3B8;
}

.fee-report {
  background: #fff;
  border: 1px solid #E9EEF5;
  border-radius: 10px;
  margin-bottom: 8px;
  overflow: hidden;
  transition: border-color .18s, box-shadow .18s;
}

.fee-report.open {
  border-color: #F6DDE2;
  box-shadow: 0 0 0 3px rgba(200, 16, 46, .04);
}

.fr-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
}

.fr-type {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: #FEF2F2;
  color: #c8102e;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
}

.fr-type.t-weigh { background: #EFF6FF; color: #1D4ED8; }
.fr-type.t-overtime { background: #FEF3C7; color: #B45309; }
.fr-type.t-receipt { background: #EFF6FF; color: #1D4ED8; }
.fr-type.t-cardfix { background: #F1F5F9; color: #64748B; }
.fr-type.t-violation { background: #FEE2E2; color: #B91C1C; }

.fr-main {
  flex: 1;
  min-width: 0;
}

.fr-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.fr-title b {
  font-size: 12.5px;
  font-weight: 600;
  color: #0F172A;
}

.fr-amount {
  font-size: 13px;
  font-weight: 700;
  color: #c8102e;
  letter-spacing: -.2px;
}

.fr-meta {
  font-size: 10.5px;
  color: #94A3B8;
  margin-top: 2px;
}

.fr-arrow {
  color: #CBD5E1;
  font-size: 13px;
  transition: transform .2s;
}

.fr-arrow.up {
  transform: rotate(180deg);
}

.fr-body {
  border-top: 1px solid #F1F5F9;
  background: #FCFDFF;
  padding: 11px 12px;
}

.fr-cols {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 16px;
}

.fr-col-title {
  font-size: 10px;
  color: #94A3B8;
  margin-bottom: 6px;
}

.fr-items {
  border: 1px solid #EDF1F7;
  border-radius: 7px;
  overflow: hidden;
}

.fr-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 9px;
  font-size: 11.5px;
  color: #475569;
  border-bottom: 1px solid #F4F7FA;
}

.fr-item:last-child { border-bottom: none; }
.fr-item b { color: #0F172A; }

.fr-none {
  font-size: 11.5px;
  color: #94A3B8;
}

.fr-imgs {
  display: flex;
  gap: 6px;
  margin-top: 7px;
}

.fr-img {
  font-size: 10px;
  color: #475569;
  background: #EEF2F7;
  border-radius: 5px;
  padding: 3px 8px;
}

.fr-note {
  margin-top: 7px;
  font-size: 11px;
  color: #94A3B8;
  line-height: 1.6;
}

/* 审批链 */
.fr-chain {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.fr-step {
  display: flex;
  gap: 7px;
  position: relative;
}

.fr-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 2px solid #CBD5E1;
  background: #fff;
  margin-top: 3px;
}

.fr-step.done .fr-dot { border-color: #22C55E; background: #22C55E; }
.fr-step.cur .fr-dot { border-color: #c8102e; background: #c8102e; box-shadow: 0 0 0 3px rgba(200, 16, 46, .12); }
.fr-step.skip .fr-dot { border-color: #CBD5E1; }

.fr-step b {
  display: block;
  font-size: 11.5px;
  font-weight: 600;
  color: #334155;
  line-height: 1.4;
}

.fr-step em {
  display: block;
  font-style: normal;
  font-size: 10px;
  color: #94A3B8;
  margin-top: 1px;
}

.fr-step.cur b { color: #c8102e; }

.fr-actions {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px solid #F1F5F9;
}

.fr-hint {
  margin-right: auto;
  font-size: 10.5px;
  color: #94A3B8;
}

.fr-reject {
  font-size: 11px;
  color: #B91C1C;
}

/* 驳回理由条：重提后也保留，审批人复核时能看到上一次为什么被退回 */
.fr-rejectbar {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 10px 0 2px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #FEF2F2;
  border: 1px solid #FBD5DB;
}
.fr-reject-k {
  flex: 0 0 auto;
  font-size: 10px;
  font-weight: 700;
  color: #B91C1C;
  background: #FEE2E2;
  border-radius: 4px;
  padding: 1px 6px;
  line-height: 1.7;
}
.fr-reject-t {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  color: #9F1239;
  line-height: 1.7;
  word-break: break-all;
}
.fr-reject-n {
  flex: 0 0 auto;
  font-size: 10.5px;
  color: #B45309;
}

/* 已打款信息条 */
.fr-paid {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0 2px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #F0FDF4;
  border: 1px solid #BBF7D0;
  font-size: 11.5px;
  color: #15803D;
}
.fr-paid-k {
  flex: 0 0 auto;
  font-size: 10px;
  font-weight: 700;
  color: #15803D;
  background: #DCFCE7;
  border-radius: 4px;
  padding: 1px 6px;
  line-height: 1.7;
}
.fr-paid-by {
  color: #166534;
}

/* 已付款信息条里的补充字段 */
.fr-paid-method {
  flex: 0 0 auto;
  font-size: 10.5px;
  color: #15803D;
  background: #DCFCE7;
  border-radius: 4px;
  padding: 1px 6px;
  line-height: 1.7;
}
.fr-paid-serial {
  font-size: 10.5px;
  color: #166534;
  font-family: var(--num-font, monospace);
}
.fr-paid-voucher {
  margin-left: auto;
  font-size: 11.5px;
  color: #c8102e;
  font-weight: 600;
  cursor: pointer;
}
.fr-paid-voucher:hover {
  text-decoration: underline;
}

/* 驳回弹窗 */
.rj-tip {
  font-size: 12px;
  color: #64748B;
  line-height: 1.7;
  margin-bottom: 10px;
}

.rj-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-bottom: 10px;
}

.rj-chip {
  border: 1px solid #E2E8F0;
  background: #F8FAFC;
  color: #475569;
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 11.5px;
  cursor: pointer;
  font-family: inherit;
  transition: all .16s;
}

.rj-chip:hover { border-color: #F3C6CF; color: #c8102e; }
.rj-chip.on { background: #FEF2F2; border-color: #FBD5DB; color: #c8102e; font-weight: 600; }

@media (max-width: 1100px) {
  .fr-cols { grid-template-columns: 1fr; gap: 12px; }
}


.fr-extra {
  font-size: 11.5px;
  color: #475569;
  line-height: 1.8;
}
.fr-net { color: #c8102e; font-weight: 700; }


/* ============================================================
   ⭐ 左摘要 + 右标签
   ============================================================ */
.detail-body {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.detail-aside {
  flex: 0 0 300px;
  width: 300px;
  position: sticky;
  top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-main {
  flex: 1;
  min-width: 0;
}

.as-card {
  background: #fff;
  border: 1px solid #e9eef5;
  border-radius: 12px;
  padding: 13px 14px;
}

.as-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.as-no {
  font-size: 11px;
  color: #64748b;
  letter-spacing: 0.3px;
  font-family: var(--font-num);
}

.as-status {
  font-size: 10.5px;
  border-radius: 5px;
  padding: 2px 8px;
  flex: 0 0 auto;
}

.as-route {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.4px;
  color: #0f172a;
  margin: 7px 0 4px;
  line-height: 1.3;
}

.as-route i {
  font-style: normal;
  color: #c8102e;
  font-size: 14px;
}

.as-sub {
  font-size: 11px;
  color: #94a3b8;
}

.as-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  font-size: 11.5px;
  padding: 5px 0;
  border-bottom: 1px solid #f4f7fa;
}

.as-row:last-child {
  border-bottom: none;
}

.as-row span {
  color: #94a3b8;
  flex: 0 0 auto;
}

.as-row b {
  font-weight: 600;
  color: #334155;
  text-align: right;
  word-break: break-all;
}

.as-fee {
  background: linear-gradient(135deg, #fff6f7, #fff);
  border: 1px solid #f6e3e7;
  border-radius: 12px;
  padding: 12px 14px;
  cursor: pointer;
  transition: transform 0.16s, box-shadow 0.16s;
}

.as-fee:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(200, 16, 46, 0.08);
}

.as-fee-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10.5px;
  color: #94a3b8;
}

.as-fee-v {
  font-size: 24px;
  font-weight: 700;
  color: #c8102e;
  letter-spacing: -0.6px;
  margin: 2px 0 4px;
  font-family: var(--font-num);
}

.as-fee-r {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 10px;
  color: #64748b;
}

.as-hint {
  font-size: 10px;
  color: #94a3b8;
  line-height: 1.7;
  padding: 0 2px;
}

@media (max-width: 1100px) {
  .detail-body {
    flex-direction: column;
  }

  .detail-aside {
    position: static;
    width: 100%;
    flex: none;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 8px;
  }

  .detail-aside > * {
    flex: 1 1 240px;
  }

  .as-hint {
    display: none;
  }
}


.fr-thumb {
  width: 72px;
  height: 54px;
  border-radius: 6px;
  overflow: hidden;
  background: #eef2f7;
  cursor: zoom-in;
}

</style>