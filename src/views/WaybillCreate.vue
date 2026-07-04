<template>
  <div class="waybill-create">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>新建运单</h2>
      <el-button type="danger" plain size="small" @click="router.push('/waybill')">返回列表</el-button>
    </div>

    <el-form label-width="0" label-position="left" size="default">
      <!-- ===== 装卸货地打卡 ===== -->
      <div class="checkin-row">
        <el-form-item label="*装卸货地打卡" label-width="140px">
          <el-switch v-model="form.checkInRequired" active-text="开启" inactive-text="关闭" />
          <span class="hint-text">说明：开启后，司机需要保证车辆在围栏内，才能进行确认装车、装车完成、确认到达的打卡</span>
        </el-form-item>
      </div>

      <!-- ===== 运输信息大标题 ===== -->
      <div class="section-title">运输信息</div>

      <!-- ===== 任务列表 ===== -->
      <transition-group name="task-list" tag="div">
        <div v-for="(task, tIndex) in tasks" :key="task.id" class="task-card" :style="{ backgroundColor: task.color }">
          <div class="task-header">
            <div class="task-name-wrapper">
              <span class="task-label">任务{{ tIndex + 1 }}</span>
              <el-input v-model="task.customName" placeholder="请输入任务名称" size="small" class="task-name-input" clearable />
            </div>
            <el-button v-if="tasks.length > 1" type="danger" plain size="small" @click="removeTask(task.id)">删除任务</el-button>
          </div>

          <!-- 起 -->
          <div class="row-wrapper">
            <span class="badge-circle">起</span>
            <div class="field-group">
              <div class="field-item">
                <span class="field-label"><span class="required-star">*</span>装货地点：</span>
                <el-select v-model="task.pickupLocation" placeholder="请选择围栏" style="flex:1; min-width:110px;">
                  <el-option label="围栏A" value="A" />
                  <el-option label="围栏B" value="B" />
                </el-select>
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
                <el-select v-model="task.deliveryLocation" placeholder="请选择围栏" style="flex:1; min-width:110px;">
                  <el-option label="围栏C" value="C" />
                  <el-option label="围栏D" value="D" />
                </el-select>
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
        </div>
      </transition-group>

      <div class="add-task-wrapper">
        <el-button type="primary" plain size="small" @click="addTask">＋ 添加任务</el-button>
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

      <!-- ===== 指派信息 ===== -->
      <div class="section-title">指派信息</div>
      <transition-group name="task-list" tag="div">
        <div v-for="(assign, aIndex) in assignList" :key="assign.id" class="assign-card"
          :style="{ backgroundColor: getTaskColor(assign.taskId) }">
          <el-row :gutter="12" align="middle" style="flex-wrap: nowrap; margin-bottom: 8px;">
            <el-col :span="5" style="white-space: nowrap;">
              <el-form-item label="*指派方式" label-width="80px">
                <el-select v-model="assign.assignMethod" placeholder="请选择" style="width:100%;">
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
                      <el-select v-if="assign.assignMethod === 'driver'" v-model="item.target" placeholder="请选择司机"
                        style="width:100%;">
                        <el-option label="张三" value="张三" />
                        <el-option label="李四" value="李四" />
                        <el-option label="王五" value="王五" />
                      </el-select>
                      <el-select v-else-if="assign.assignMethod === 'vehicle'" v-model="item.target" placeholder="请选择车辆"
                        style="width:100%;">
                        <el-option label="鄂A12345" value="鄂A12345" />
                        <el-option label="鄂B67890" value="鄂B67890" />
                      </el-select>
                      <el-select v-else-if="assign.assignMethod === 'team'" v-model="item.target" placeholder="请选择车队"
                        style="width:100%;">
                        <el-option label="第一车队" value="第一车队" />
                        <el-option label="第二车队" value="第二车队" />
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
  </div>
</template>

<script setup>
import { reactive, ref, watch, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { supabase } from '@/utils/supabase'

const router = useRouter()
const route = useRoute()

// ---------- 任务颜色池 ----------
const taskColors = [
  '#f0f8ff', '#f0fff0', '#fff0f5', '#f5f5dc', '#fafad2',
  '#e6e6fa', '#ffe4e1', '#f0ffff', '#fff5ee', '#fdf5e6'
]

let nextTaskId = 1
let nextCargoId = 1
let nextAssignId = 1
let nextItemId = 1
let colorIndex = 0

// ---------- 表单数据 ----------
const form = reactive({
  checkInRequired: true,
  cargoList: [
    { id: nextCargoId++, name: '', quantity: null, unit: '吨', freight: 0.00, taskId: 1 }
  ],
})

// ---------- 指派列表 ----------
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

// ---------- 常驻任务 ----------
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
  console.log('常驻任务设置：', { isRecurring: isRecurring.value, type: recurringType.value, start: recurringStart.value, end: recurringEnd.value, count: recurringCount.value })
  ElMessage.success('常驻任务设置已保存')
  markDirty()
  recurringDialogVisible.value = false
}

// ---------- 辅助函数 ----------
const getItemLabel = (method, index) => {
  const map = { driver: '选择司机', vehicle: '选择车辆', team: '选择车队' }
  return `${map[method] || '选择'}${index}`
}
const getAddButtonLabel = (method) => {
  const map = { driver: '添加司机', vehicle: '添加车辆', team: '添加车队' }
  return map[method] || '添加'
}

// ---------- 计算总计 ----------
const totalQuantity = computed(() => form.cargoList.reduce((sum, item) => sum + (item.quantity || 0), 0))
const totalFreight = computed(() => form.cargoList.reduce((sum, item) => sum + (item.freight || 0), 0))

// ---------- 智能平均分配（按任务分组，先扣减已填写值，再分配剩余） ----------
const distributeTotals = () => {
  // 按任务分组
  const taskMap = new Map()
  tasks.value.forEach(task => {
    taskMap.set(task.id, {
      taskId: task.id,
      cargoList: form.cargoList.filter(c => c.taskId === task.id),
      assignItems: []
    })
  })

  // 收集每个任务的指派条目
  assignList.value.forEach(assign => {
    const taskId = assign.taskId
    if (taskMap.has(taskId)) {
      assign.items.forEach(item => {
        taskMap.get(taskId).assignItems.push(item)
      })
    }
  })

  // 对每个任务进行分配
  taskMap.forEach((taskData) => {
    const { cargoList, assignItems } = taskData
    // 计算该任务的总数量和总运费
    const totalQty = cargoList.reduce((sum, c) => sum + (c.quantity || 0), 0)
    const totalFrt = cargoList.reduce((sum, c) => sum + (c.freight || 0), 0)

    // 计算已手动填写的条目的总和
    let manualQtySum = 0
    let manualFrtSum = 0
    const manualItems = []
    const autoItems = []
    assignItems.forEach(item => {
      if (item._manual) {
        manualItems.push(item)
        manualQtySum += (item.carryQuantity || 0)
        manualFrtSum += (item.carryFreight || 0)
      } else {
        autoItems.push(item)
      }
    })

    // 计算剩余量
    const remainingQty = totalQty - manualQtySum
    const remainingFrt = totalFrt - manualFrtSum

    // 如果剩余量小于0，则设为0（防止因精度问题出现负值）
    const finalQty = Math.max(0, remainingQty)
    const finalFrt = Math.max(0, remainingFrt)

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

// 触发分配的防抖
let distributeTimer = null
const triggerDistribute = () => {
  if (distributeTimer) clearTimeout(distributeTimer)
  distributeTimer = setTimeout(() => {
    distributeTotals()
  }, 100)
}

// ---------- 任务管理 ----------
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
    receiverPhone: ''
  }
])

const getTaskIndex = (taskId) => tasks.value.findIndex(t => t.id === taskId)
const getTaskColor = (taskId) => {
  const task = tasks.value.find(t => t.id === taskId)
  return task ? task.color : taskColors[0]
}

// ---------- 脏标记 ----------
const isDirty = ref(false)
const markDirty = () => { isDirty.value = true }
let isInitializing = true

// ---------- 应用克隆数据 ----------
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
    nextTick(() => {
      distributeTotals()
    })
    return true
  } catch (err) {
    console.error('应用克隆数据失败', err)
    return false
  }
}

onMounted(() => {
  setTimeout(() => isInitializing = false, 100)
  window.addEventListener('beforeunload', handleBeforeUnload)

  const cloneData = history.state?.cloneData
  console.log('克隆数据：', cloneData)
  if (cloneData) {
    applyCloneData(cloneData)
  } else {
    // 初始分配
    nextTick(() => {
      distributeTotals()
    })
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

// ---------- 数据修改函数 ----------
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
    receiverPhone: ''
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

// ---------- 生成运单编号 ----------
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
  if (!data || data.length === 0) {
    return 0
  }
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

// ---------- 表单校验 ----------
const validateForm = () => {
  // 特殊校验：如果只有一个任务但有多个货物，则提示错误
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
      // 数量非必填，只有填了值才检查
      if (cargo.quantity !== null && cargo.quantity !== undefined && cargo.quantity < 0) {
        ElMessage.error(`任务${tIndex + 1} 的货物${cIndex + 1} 数量不能为负数`)
        return false
      }
      // 运费非必填，只有填了值才检查
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

// ---------- 核心发布逻辑 ----------
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
        carry_quantity: 0
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

// ---------- 发布（仅发布，跳转到列表） ----------
const publish = async () => {
  if (!validateForm()) return
  const success = await doPublish()
  if (success) {
    router.push('/waybill')
  }
}

// ---------- 发布并创建相同运单 ----------
const publishAndClone = async () => {
  if (!validateForm()) return
  const success = await doPublish()
  if (success) {
    // 准备克隆数据
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
    router.push({
      path: '/waybill/create',
      state: { cloneData }
    })
    // 提示“已自动填充”会在新页面加载时由 applyCloneData 显示
  }
}

// ---------- 关闭 ----------
const closeForm = () => {
  isDirty.value = false
  router.push('/waybill')
}

// ---------- 监听任务数量变化，修复无效的taskId ----------
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
  background: #ffffff;
}

/* ===== 页面头部 ===== */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  border-bottom: 2px solid #c8102e;
  padding-bottom: 10px;
}
.page-header h2 {
  margin: 0;
  color: #c8102e;
  font-weight: 600;
  font-size: 20px;
}

/* ===== 分区标题 ===== */
.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #c8102e;
  margin: 20px 0 12px 0;
  padding-left: 10px;
  border-left: 4px solid #c8102e;
  line-height: 1.2;
  text-align: left;
}

/* ===== 打卡行 ===== */
.checkin-row {
  margin-bottom: 16px;
}
.hint-text {
  font-size: 12px;
  color: #888;
  margin-left: 12px;
}

/* ===== 任务卡片 ===== */
.task-card {
  border-radius: 8px;
  padding: 12px 16px 8px 16px;
  margin-bottom: 16px;
  border: 1px solid #e8e8e8;
}
.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.task-name-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}
.task-label {
  font-weight: 600;
  font-size: 14px;
  color: #333;
  white-space: nowrap;
}
.task-name-input {
  flex: 1;
  min-width: 120px;
  max-width: 300px;
}
.task-name-input :deep(.el-input__inner) {
  font-size: 13px;
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
  font-weight: 700;
  font-size: 13px;
  text-align: center;
  flex-shrink: 0;
  margin-top: 2px;
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
  color: #333;
  font-weight: 500;
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

/* ===== 添加任务按钮 ===== */
.add-task-wrapper {
  margin-bottom: 16px;
}

/* ===== 货物信息 & 指派信息共用 ===== */
.info-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px 32px;
  margin: 0 0 10px 0;
  align-items: center;
}
.info-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}
.info-label {
  color: #555;
  white-space: nowrap;
}
.info-value {
  font-weight: 600;
  color: #c8102e;
  font-size: 16px;
}

/* ===== 货物行 ===== */
.cargo-row {
  border-radius: 8px;
  padding: 8px 16px;
  margin-bottom: 8px;
  border: 1px solid #eee;
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
  border-radius: 8px;
  padding: 8px 16px;
  margin-bottom: 8px;
  border: 1px solid #eee;
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
.add-assign-wrapper {
  margin-bottom: 16px;
}

/* ===== 条目列表 ===== */
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
.add-item-wrapper {
  display: flex;
  justify-content: flex-start;
  margin-top: 4px;
}

/* ===== 底部按钮 ===== */
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 30px;
  padding-top: 16px;
  border-top: 1px solid #e8e8e8;
  flex-wrap: wrap;
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
  .task-name-input {
    max-width: 100%;
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

/* ===== 任务列表动画 ===== */
.task-list-move {
  transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.task-list-enter-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.task-list-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: absolute;
  width: 100%;
}
.task-list-enter-from {
  opacity: 0;
  transform: translateY(-30px) scale(0.95);
}
.task-list-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(-20px);
}
.task-list-leave-active {
  position: absolute;
  z-index: 0;
}
.task-list-enter-to {
  opacity: 1;
  transform: translateY(0) scale(1);
}
.task-list-leave-active + .task-card,
.task-list-leave-active + .cargo-row,
.task-list-leave-active + .assign-card,
.task-list-leave-active + .assign-item {
  transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}
</style>

<style>
/* 全局样式 */
.waybill-create .el-input__inner {
  font-weight: 600 !important;
}
.waybill-create .el-textarea__inner {
  font-weight: 600 !important;
}
.waybill-create .el-select .el-input__inner {
  font-weight: 600 !important;
}
.waybill-create .el-input__inner::placeholder,
.waybill-create .el-textarea__inner::placeholder {
  font-weight: 400 !important;
}
.compact-date-picker .el-picker-panel {
  font-size: 13px;
  --el-date-picker-header-padding: 6px 12px;
  --el-date-picker-cell-size: 26px;
}
.compact-date-picker .el-picker-panel .el-date-picker__header {
  padding: 6px 12px;
}
.compact-date-picker .el-picker-panel .el-date-table td {
  padding: 4px 0;
}
.compact-date-picker .el-picker-panel .el-date-table td .el-date-table-cell {
  height: 26px;
  width: 26px;
  line-height: 26px;
}
.compact-date-picker .el-picker-panel .el-time-panel {
  max-height: 180px;
}
.compact-date-picker .el-picker-panel .el-time-panel .el-time-panel__content {
  padding: 4px 0;
}
.compact-date-picker .el-picker-panel .el-time-spinner__item {
  height: 26px;
  line-height: 26px;
}
</style>