<template>
  <div class="waybill-detail">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>运单详情</h2>
      <el-button type="danger" plain size="small" @click="router.push('/waybill')">返回列表</el-button>
    </div>

    <el-form label-width="0" label-position="left" size="default" disabled>
      <!-- ===== 装卸货地打卡 ===== -->
      <div class="checkin-row">
        <el-form-item label="*装卸货地打卡" label-width="140px">
          <el-switch v-model="form.checkInRequired" active-text="开启" inactive-text="关闭" disabled />
          <span class="hint-text">说明：开启后，司机需要保证车辆在围栏内，才能进行确认装车、装车完成、确认到达的打卡</span>
        </el-form-item>
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
              <el-select v-model="item.unit" placeholder="单位" style="width:100%;" disabled>
                <el-option label="吨" value="吨" />
                <el-option label="件" value="件" />
                <el-option label="方" value="方" />
              </el-select>
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
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { supabase } from '@/utils/supabase'

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
const myAccount = currentUser.masterAccount || currentUser.account || ''

// ---------- 任务颜色池 ----------
const taskColors = [
  '#f0f8ff', '#f0fff0', '#fff0f5', '#f5f5dc', '#fafad2',
  '#e6e6fa', '#ffe4e1', '#f0ffff', '#fff5ee', '#fdf5e6'
]

// ---------- 数据 ----------
const tasks = ref([])
const form = reactive({
  checkInRequired: true,
  cargoList: [],
})
const assignList = ref([])

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

// ---------- 从数据库加载运单（含隔离） ----------
const loadWaybill = async () => {
  const waybillNo = route.query.waybill_no
  if (!waybillNo) {
    ElMessage.error('缺少运单编号')
    router.push('/waybill')
    return
  }

  try {
    // ⭐ 加隔离过滤
    let q = supabase
      .from('waybills')
      .select('*')
      .eq('waybill_no', waybillNo)

    if (isCustomer && myAccount) {
      q = q.eq('owner_account', myAccount)
    }

    const { data, error } = await q.single()

    if (error) throw error
    if (!data) {
      ElMessage.error('运单不存在或无权限访问')
      router.push('/waybill')
      return
    }

    // 填充数据
    form.checkInRequired = true

    const taskId = 1
    tasks.value = [{
      id: taskId,
      customName: data.task_name || '',
      color: taskColors[0],
      pickupLocation: data.pickup || '',
      pickupTime: data.pickup_time || '',
      senderPhone: '',
      deliveryLocation: data.delivery || '',
      deliveryTime: data.plan_time || '',
      receiverPhone: '',
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
      receiverPhone: t.receiverPhone
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

  // 通过 history state 传递数据
  router.push({
    path: '/waybill/create',
    state: { cloneData }
  })
}

onMounted(() => {
  loadWaybill()
})
</script>

<style scoped>
/* ===== 页面容器 ===== */
.waybill-detail {
  height: 100%;
  overflow-y: auto !important;
  padding: 16px 20px;
  box-sizing: border-box;
  background: #f8fafc;
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
</style>