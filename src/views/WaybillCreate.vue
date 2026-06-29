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

      <!-- ===== 任务列表（带动画） ===== -->
      <transition-group name="task-list" tag="div">
        <div
          v-for="(task, tIndex) in tasks"
          :key="task.id"
          class="task-card"
          :style="{ backgroundColor: task.color }"
        >
          <!-- 任务头部 -->
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
            </div>
            <el-button
              v-if="tasks.length > 1"
              type="danger"
              plain
              size="small"
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
                <el-select v-model="task.pickupLocation" placeholder="请选择围栏" style="flex:1; min-width:110px;">
                  <el-option label="围栏A" value="A" />
                  <el-option label="围栏B" value="B" />
                </el-select>
              </div>
              <div class="field-item">
                <span class="field-label">计划装货时间：</span>
                <el-date-picker
                  v-model="task.pickupTime"
                  type="datetime"
                  placeholder="请选择时间"
                  style="flex:1; min-width:130px;"
                  value-format="YYYY-MM-DD HH:mm:ss"
                  popper-class="compact-date-picker"
                />
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
                <el-date-picker
                  v-model="task.deliveryTime"
                  type="datetime"
                  placeholder="请选择时间"
                  style="flex:1; min-width:130px;"
                  value-format="YYYY-MM-DD HH:mm:ss"
                  popper-class="compact-date-picker"
                />
              </div>
              <div class="field-item">
                <span class="field-label">收货联系电话：</span>
                <el-input v-model="task.receiverPhone" placeholder="请输入联系电话" style="flex:1; min-width:100px;" />
              </div>
            </div>
          </div>
        </div>
      </transition-group>

      <!-- 添加任务按钮 -->
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

      <!-- 货物列表（带动画） -->
      <transition-group name="task-list" tag="div">
        <div
          v-for="(item, index) in form.cargoList"
          :key="item.id"
          class="cargo-row"
          :style="{ backgroundColor: getTaskColor(item.taskId) }"
        >
          <el-row :gutter="12" align="middle" style="flex-wrap: nowrap;">
            <el-col :span="5" style="white-space: nowrap;">
              <el-form-item :label="`*货物${index+1}`" label-width="80px">
                <el-input v-model="item.name" placeholder="请输入货物名称" />
              </el-form-item>
            </el-col>
            <el-col :span="3" style="white-space: nowrap;">
              <el-form-item label="数量" label-width="50px">
                <el-input-number v-model="item.quantity" :min="0" controls-position="right" style="width:100%;" />
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
                <el-input-number
                  v-model="item.freight"
                  :min="0"
                  :precision="2"
                  :step="1"
                  controls-position="right"
                  style="width:100%;"
                  placeholder="0.00"
                  @focus="$event.target.select()"
                />
              </el-form-item>
            </el-col>
            <el-col v-if="tasks.length > 1" :span="6" style="white-space: nowrap;">
              <el-form-item label="绑定任务" label-width="70px" required>
                <el-select
                  v-model="item.taskId"
                  placeholder="选择任务"
                  style="width:100%; min-width:200px;"
                >
                  <el-option
                    v-for="t in tasks"
                    :key="t.id"
                    :label="`任务${getTaskIndex(t.id) + 1}${t.customName ? ' - ' + t.customName : ''}`"
                    :value="t.id"
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="tasks.length > 1 ? 5 : 11" class="cargo-actions">
              <el-button
                v-if="!(tasks.length === 1 && form.cargoList.length === 1)"
                type="danger"
                plain
                size="small"
                @click="removeCargo(index)"
              >
                删除
              </el-button>
            </el-col>
          </el-row>
        </div>
      </transition-group>
      <el-button type="primary" plain size="small" @click="addCargo">＋ 添加货物</el-button>

      <!-- ===== 指派信息 ===== -->
      <div class="section-title">指派信息</div>
      <!-- 指派列表（带动画） -->
      <transition-group name="task-list" tag="div">
        <div
          v-for="(assign, aIndex) in assignList"
          :key="assign.id"
          class="assign-card"
          :style="{ backgroundColor: getTaskColor(assign.taskId) }"
        >
          <!-- 第一行：指派方式 + 绑定任务 + 删除卡片 -->
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
                <el-select
                  v-model="assign.taskId"
                  placeholder="选择任务"
                  style="width:100%; min-width:200px;"
                >
                  <el-option
                    v-for="t in tasks"
                    :key="t.id"
                    :label="`任务${getTaskIndex(t.id) + 1}${t.customName ? ' - ' + t.customName : ''}`"
                    :value="t.id"
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="tasks.length > 1 ? 12 : 19" class="assign-actions">
              <el-button
                v-if="!(tasks.length === 1 && assignList.length === 1)"
                type="danger"
                plain
                size="small"
                @click="removeAssign(aIndex)"
              >
                删除
              </el-button>
            </el-col>
          </el-row>

          <!-- 第二行：条目列表 -->
          <div class="assign-items">
            <transition-group name="task-list" tag="div">
              <div
                v-for="(item, iIndex) in assign.items"
                :key="item.id"
                class="assign-item"
              >
                <el-row :gutter="12" align="middle" style="flex-wrap: nowrap;">
                  <el-col :span="5" style="white-space: nowrap;">
                    <el-form-item :label="getItemLabel(assign.assignMethod, iIndex + 1)" label-width="80px">
                      <!-- 司机 -->
                      <el-select
                        v-if="assign.assignMethod === 'driver'"
                        v-model="item.target"
                        placeholder="请选择司机"
                        style="width:100%;"
                      >
                        <el-option label="张三" value="张三" />
                        <el-option label="李四" value="李四" />
                        <el-option label="王五" value="王五" />
                      </el-select>
                      <!-- 车辆 -->
                      <el-select
                        v-else-if="assign.assignMethod === 'vehicle'"
                        v-model="item.target"
                        placeholder="请选择车辆"
                        style="width:100%;"
                      >
                        <el-option label="鄂A12345" value="鄂A12345" />
                        <el-option label="鄂B67890" value="鄂B67890" />
                      </el-select>
                      <!-- 车队 -->
                      <el-select
                        v-else-if="assign.assignMethod === 'team'"
                        v-model="item.target"
                        placeholder="请选择车队"
                        style="width:100%;"
                      >
                        <el-option label="第一车队" value="第一车队" />
                        <el-option label="第二车队" value="第二车队" />
                      </el-select>
                      <!-- 未选择时的占位 -->
                      <el-input v-else disabled placeholder="请先选择指派方式" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="3" style="white-space: nowrap;">
                    <el-form-item label="承运量" label-width="60px">
                      <el-input-number
                        v-model="item.carryQuantity"
                        :min="0"
                        :precision="2"
                        :step="1"
                        controls-position="right"
                        style="width:100%;"
                        placeholder="0.00"
                        @focus="$event.target.select()"
                      />
                    </el-form-item>
                  </el-col>
                  <el-col :span="3" style="white-space: nowrap;">
                    <el-form-item label="运费" label-width="40px">
                      <el-input-number
                        v-model="item.carryFreight"
                        :min="0"
                        :precision="2"
                        :step="1"
                        controls-position="right"
                        style="width:100%;"
                        placeholder="0.00"
                        @focus="$event.target.select()"
                      />
                    </el-form-item>
                  </el-col>
                  <el-col :span="3" class="assign-item-actions">
                    <el-button
                      type="danger"
                      plain
                      size="small"
                      @click="removeItem(aIndex, iIndex)"
                    >
                      删除
                    </el-button>
                  </el-col>
                </el-row>
              </div>
            </transition-group>
            <!-- 添加条目按钮 -->
            <div class="add-item-wrapper">
              <el-button
                type="primary"
                plain
                size="small"
                @click="addItem(aIndex)"
              >
                ＋ {{ getAddButtonLabel(assign.assignMethod) }}
              </el-button>
            </div>
          </div>
        </div>
      </transition-group>
      <!-- 添加指派卡片 -->
      <div class="add-assign-wrapper">
        <el-button type="primary" plain size="small" @click="addAssign">＋ 添加指派</el-button>
      </div>

      <!-- 底部按钮 -->
      <div class="form-actions">
        <!-- 设置为常驻任务按钮（黄色醒目，最左） -->
        <el-button
          style="background-color: #f5a623; border-color: #f5a623; color: #fff; font-weight: 600;"
          @click="openRecurringDialog"
        >
          设置为常驻任务
        </el-button>
        <el-button @click="closeForm">关闭</el-button>
        <el-button type="primary" plain style="border-color:#c8102e; color:#c8102e;">发布并创建相同运单</el-button>
        <el-button type="primary" style="background-color:#c8102e; border-color:#c8102e;" @click="publish">发布</el-button>
      </div>
    </el-form>

    <!-- ===== 常驻任务弹窗 ===== -->
    <el-dialog
      v-model="recurringDialogVisible"
      title="设置为常驻任务"
      width="500px"
      destroy-on-close
      :show-close="false"
    >
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
              <el-date-picker
                v-model="recurringStart"
                type="datetime"
                placeholder="选择开始时间"
                :disabled-date="disabledStartDate"
                :default-value="new Date()"
                style="width:100%;"
                value-format="YYYY-MM-DD HH:mm:ss"
              />
            </el-form-item>
            <el-form-item label="结束时间" required>
              <el-date-picker
                v-model="recurringEnd"
                type="datetime"
                placeholder="选择结束时间"
                :disabled-date="disabledEndDate"
                style="width:100%;"
                value-format="YYYY-MM-DD HH:mm:ss"
              />
            </el-form-item>
          </template>
          <template v-if="recurringType === 'count'">
            <el-form-item label="次数上限" required>
              <el-input-number
                v-model="recurringCount"
                :min="1"
                :step="1"
                style="width:100%;"
              />
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
import { reactive, ref, watch, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

const router = useRouter()

// ---------- 任务颜色池 ----------
const taskColors = [
  '#f0f8ff', // 爱丽丝蓝
  '#f0fff0', // 蜜瓜色
  '#fff0f5', // 薰衣草
  '#f5f5dc', // 米色
  '#fafad2', // 金色
  '#e6e6fa', // 淡紫
  '#ffe4e1', // 粉色
  '#f0ffff', // 碧蓝
  '#fff5ee', // 贝壳
  '#fdf5e6', // 亚麻
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
      {
        id: nextItemId++,
        target: '',
        carryQuantity: 0,
        carryFreight: 0
      }
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

const disabledStartDate = (time) => {
  return time.getTime() < new Date().setHours(0, 0, 0, 0)
}
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
      if (!recurringStart.value) {
        ElMessage.warning('请选择开始时间')
        return
      }
      if (!recurringEnd.value) {
        ElMessage.warning('请选择结束时间')
        return
      }
      if (recurringEnd.value.getTime() <= recurringStart.value.getTime()) {
        ElMessage.warning('结束时间必须晚于开始时间')
        return
      }
    } else {
      if (!recurringCount.value || recurringCount.value < 1) {
        ElMessage.warning('请输入有效的次数上限（至少1次）')
        return
      }
    }
  }
  // 保存数据
  console.log('常驻任务设置：', {
    isRecurring: isRecurring.value,
    type: recurringType.value,
    start: recurringType.value === 'time' ? recurringStart.value : null,
    end: recurringType.value === 'time' ? recurringEnd.value : null,
    count: recurringType.value === 'count' ? recurringCount.value : null
  })
  ElMessage.success('常驻任务设置已保存')
  // 标记脏
  markDirty()
  recurringDialogVisible.value = false
}

// ---------- 获取条目标签 ----------
const getItemLabel = (method, index) => {
  const map = {
    driver: '选择司机',
    vehicle: '选择车辆',
    team: '选择车队'
  }
  return `${map[method] || '选择'}${index}`
}

const getAddButtonLabel = (method) => {
  const map = {
    driver: '添加司机',
    vehicle: '添加车辆',
    team: '添加车队'
  }
  return map[method] || '添加'
}

// ---------- 计算总计 ----------
const totalQuantity = computed(() => {
  return form.cargoList.reduce((sum, item) => sum + (item.quantity || 0), 0)
})
const totalFreight = computed(() => {
  return form.cargoList.reduce((sum, item) => sum + (item.freight || 0), 0)
})

// ---------- 平均分配 ----------
const distributeTotals = () => {
  const allItems = []
  assignList.value.forEach(assign => {
    assign.items.forEach(item => {
      allItems.push(item)
    })
  })
  const count = allItems.length
  if (count === 0) return
  const qty = totalQuantity.value / count
  const freight = totalFreight.value / count
  allItems.forEach(item => {
    item.carryQuantity = parseFloat(qty.toFixed(2))
    item.carryFreight = parseFloat(freight.toFixed(2))
  })
}

watch(
  [totalQuantity, totalFreight],
  () => {
    if (assignList.value.some(a => a.items.length > 0)) {
      distributeTotals()
    }
  },
  { immediate: true }
)
watch(
  () => {
    let count = 0
    assignList.value.forEach(a => count += a.items.length)
    return count
  },
  () => {
    distributeTotals()
  },
  { immediate: true }
)

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

const getTaskIndex = (taskId) => {
  return tasks.value.findIndex(t => t.id === taskId)
}
const getTaskColor = (taskId) => {
  const task = tasks.value.find(t => t.id === taskId)
  return task ? task.color : taskColors[0]
}

// ---------- 脏标记 ----------
const isDirty = ref(false)
const markDirty = () => { isDirty.value = true }

let isInitializing = true
onMounted(() => {
  setTimeout(() => { isInitializing = false }, 100)
  window.addEventListener('beforeunload', handleBeforeUnload)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
const handleBeforeUnload = (e) => {
  if (isDirty.value) {
    e.preventDefault()
    e.returnValue = '您有未保存的更改，确定要离开吗？'
  }
}

// ---------- 数据修改函数（均需设置 isDirty = true） ----------
const addTask = () => {
  const newId = nextTaskId++
  tasks.value.push({
    id: newId,
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
}

const removeTask = (taskId) => {
  if (tasks.value.length <= 1) {
    ElMessage.warning('至少保留一个任务')
    return
  }
  const index = tasks.value.findIndex(t => t.id === taskId)
  if (index === -1) return
  tasks.value.splice(index, 1)
  if (tasks.value.length > 0) {
    const firstTaskId = tasks.value[0].id
    form.cargoList.forEach(item => {
      if (item.taskId === taskId) {
        item.taskId = firstTaskId
      }
    })
    assignList.value.forEach(assign => {
      if (assign.taskId === taskId) {
        assign.taskId = firstTaskId
      }
    })
  }
  markDirty()
}

const addAssign = () => {
  const newId = nextAssignId++
  const firstTaskId = tasks.value[0]?.id || 1
  assignList.value.push({
    id: newId,
    assignMethod: 'driver',
    taskId: firstTaskId,
    items: [
      {
        id: nextItemId++,
        target: '',
        carryQuantity: 0,
        carryFreight: 0
      }
    ]
  })
  markDirty()
}

const removeAssign = (index) => {
  if (assignList.value.length <= 1) {
    ElMessage.warning('至少保留一个指派卡片')
    return
  }
  assignList.value.splice(index, 1)
  markDirty()
}

const addItem = (assignIndex) => {
  const assign = assignList.value[assignIndex]
  assign.items.push({
    id: nextItemId++,
    target: '',
    carryQuantity: 0,
    carryFreight: 0
  })
  markDirty()
}

const removeItem = (assignIndex, itemIndex) => {
  const assign = assignList.value[assignIndex]
  if (assign.items.length <= 1) {
    ElMessage.warning('至少保留一个条目')
    return
  }
  assign.items.splice(itemIndex, 1)
  markDirty()
}

const addCargo = () => {
  const firstTaskId = tasks.value[0]?.id || 1
  form.cargoList.push({
    id: nextCargoId++,
    name: '',
    quantity: null,
    unit: '吨',
    freight: 0.00,
    taskId: firstTaskId
  })
  markDirty()
}

const removeCargo = (index) => {
  if (form.cargoList.length > 1) {
    form.cargoList.splice(index, 1)
  } else {
    ElMessage.warning('至少保留一个货物')
  }
  markDirty()
}

// ---------- 关闭和发布 ----------
const closeForm = () => {
  isDirty.value = false
  router.push('/waybill')
}

const publish = () => {
  ElMessage.success('运单发布成功！')
  isDirty.value = false
  router.push('/waybill')
}

// ---------- 监听深层数据变化（兜底） ----------
watch(
  () => [form, tasks.value, assignList.value],
  () => {
    if (!isInitializing) {
      markDirty()
    }
  },
  { deep: true }
)

// ---------- 监听任务数量变化，修复无效的taskId ----------
watch(
  () => tasks.value.length,
  () => {
    const validIds = tasks.value.map(t => t.id)
    form.cargoList.forEach(item => {
      if (!validIds.includes(item.taskId)) {
        item.taskId = tasks.value[0]?.id || 1
      }
    })
    assignList.value.forEach(assign => {
      if (!validIds.includes(assign.taskId)) {
        assign.taskId = tasks.value[0]?.id || 1
      }
    })
    // 此修改由外部删除任务触发，已 markDirty，无需重复标记
  },
  { immediate: true }
)

// 暴露 isDirty 给父组件
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

/* ===== 任务列表动画（同时用于货物、指派卡片和条目） ===== */
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

<!-- ===== 全局样式（字体加粗 + 日期选择器缩小） ===== -->
<style>
/* 所有输入框内文字加粗 */
.waybill-create .el-input__inner {
  font-weight: 600 !important;
}
.waybill-create .el-textarea__inner {
  font-weight: 600 !important;
}
.waybill-create .el-select .el-input__inner {
  font-weight: 600 !important;
}
/* 确保 placeholder 不加粗 */
.waybill-create .el-input__inner::placeholder,
.waybill-create .el-textarea__inner::placeholder {
  font-weight: 400 !important;
}
/* 日期选择器弹出面板缩小 */
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