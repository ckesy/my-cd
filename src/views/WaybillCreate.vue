<template>
  <div class="waybill-create">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>新建运单</h2>
      <el-button type="danger" plain size="small" @click="router.push('/waybill')">返回列表</el-button>
    </div>

    <el-form label-width="0" label-position="left" size="default">
      <!-- ===== 运输信息（浅色背景框） ===== -->
      <div class="transport-section">
        <div class="section-title">运输信息</div>

        <!-- 起（三个字段水平排列） -->
        <div class="row-wrapper">
          <span class="badge-circle">起</span>
          <div class="field-group">
            <div class="field-item">
              <span class="field-label">*装货地点：</span>
              <el-select v-model="form.pickupLocation" placeholder="请选择围栏" style="flex:1; min-width:120px;">
                <el-option label="围栏A" value="A" />
                <el-option label="围栏B" value="B" />
              </el-select>
            </div>
            <div class="field-item">
              <span class="field-label">计划装货时间：</span>
              <el-date-picker
                v-model="form.pickupTime"
                type="datetime"
                placeholder="请选择时间"
                style="flex:1; min-width:140px;"
                value-format="YYYY-MM-DD HH:mm:ss"
              />
            </div>
            <div class="field-item">
              <span class="field-label">发货联系电话：</span>
              <el-input v-model="form.senderPhone" placeholder="请输入联系电话" style="flex:1; min-width:110px;" />
            </div>
          </div>
        </div>

        <!-- 终（三个字段水平排列） -->
        <div class="row-wrapper">
          <span class="badge-circle">终</span>
          <div class="field-group">
            <div class="field-item">
              <span class="field-label">*卸货地点：</span>
              <el-select v-model="form.deliveryLocation" placeholder="请选择围栏" style="flex:1; min-width:120px;">
                <el-option label="围栏C" value="C" />
                <el-option label="围栏D" value="D" />
              </el-select>
            </div>
            <div class="field-item">
              <span class="field-label">计划到达时间：</span>
              <el-date-picker
                v-model="form.deliveryTime"
                type="datetime"
                placeholder="请选择时间"
                style="flex:1; min-width:140px;"
                value-format="YYYY-MM-DD HH:mm:ss"
              />
            </div>
            <div class="field-item">
              <span class="field-label">收货联系电话：</span>
              <el-input v-model="form.receiverPhone" placeholder="请输入联系电话" style="flex:1; min-width:110px;" />
            </div>
          </div>
        </div>

        <!-- 打卡开关 -->
        <div class="checkin-row">
          <el-form-item label="*装卸货地打卡" label-width="140px">
            <el-switch v-model="form.checkInRequired" active-text="开启" inactive-text="关闭" />
            <span class="hint-text">说明：开启后，司机需要保证车辆在围栏内，才能进行确认装车、装车完成、确认到达的打卡</span>
          </el-form-item>
        </div>
      </div>

      <!-- ===== 发货信息 ===== -->
      <div class="section-title">发货信息</div>
      <div class="info-row">
        <div class="info-item">
          <span class="info-label">总计数里：</span>
          <span class="info-value">{{ form.totalQuantity || 0.00 }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">总计运费：</span>
          <span class="info-value">{{ form.totalFreight || 0.00 }}</span>
        </div>
      </div>

      <!-- 货物列表 -->
      <div
        v-for="(item, index) in form.cargoList"
        :key="index"
        class="cargo-row"
      >
        <el-row :gutter="20" align="middle">
          <el-col :span="6">
            <el-form-item :label="`*货物${index+1}`" label-width="80px">
              <el-input v-model="item.name" placeholder="请输入货物名称" />
            </el-form-item>
          </el-col>
          <el-col :span="5">
            <el-form-item label="*数量" label-width="60px">
              <el-input-number v-model="item.quantity" :min="0" controls-position="right" style="width:100%;" />
            </el-form-item>
          </el-col>
          <el-col :span="5">
            <el-form-item label="运费" label-width="60px">
              <el-input-number v-model="item.freight" :min="0" controls-position="right" style="width:100%;" />
            </el-form-item>
          </el-col>
          <el-col :span="8" class="cargo-actions">
            <el-button type="danger" plain size="small" @click="removeCargo(index)">删除</el-button>
          </el-col>
        </el-row>
      </div>
      <el-button type="primary" plain size="small" @click="addCargo">＋ 添加货物</el-button>

      <!-- ===== 指派信息 ===== -->
      <div class="section-title">指派信息</div>
      <!-- 第一行：指派方式单独占一行 -->
      <div class="info-row">
        <div class="info-item" style="flex:0 0 auto;">
          <span class="info-label" style="font-weight:500;">*指派方式：</span>
          <el-select v-model="form.assignMethod" placeholder="请选择" style="width:180px;">
            <el-option label="指派司机" value="driver" />
            <el-option label="指派车队" value="team" />
          </el-select>
        </div>
      </div>
      <!-- 第二行：三个字段同行（与发货信息样式一致） -->
      <div class="info-row">
        <div class="info-item">
          <span class="info-label">*指派司机1：</span>
          <el-select v-model="form.driver" placeholder="请选择司机" style="width:160px;">
            <el-option label="张三" value="zhangsan" />
            <el-option label="李四" value="lisi" />
          </el-select>
        </div>
        <div class="info-item">
          <span class="info-label">*承运量（货物1）：</span>
          <el-input-number v-model="form.carryQuantity" :min="0" controls-position="right" style="width:140px;" />
        </div>
        <div class="info-item">
          <span class="info-label">运费（货物1）：</span>
          <el-input-number v-model="form.carryFreight" :min="0" controls-position="right" style="width:140px;" />
        </div>
      </div>

      <!-- 底部按钮 -->
      <div class="form-actions">
        <el-button @click="closeForm">关闭</el-button>
        <el-button type="primary" plain style="border-color:#c8102e; color:#c8102e;">发布并创建相同运单</el-button>
        <el-button type="primary" style="background-color:#c8102e; border-color:#c8102e;" @click="publish">发布</el-button>
      </div>
    </el-form>
  </div>
</template>

<script setup>
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

const router = useRouter()

const form = reactive({
  pickupLocation: '',
  pickupTime: '',
  senderPhone: '',
  deliveryLocation: '',
  deliveryTime: '',
  receiverPhone: '',
  checkInRequired: true,
  totalQuantity: 0,
  totalFreight: 0,
  cargoList: [{ name: '', quantity: 0, freight: 0 }],
  assignMethod: 'driver',
  driver: '',
  carryQuantity: 0,
  carryFreight: 0
})

const addCargo = () => {
  form.cargoList.push({ name: '', quantity: 0, freight: 0 })
}

const removeCargo = (index) => {
  if (form.cargoList.length > 1) {
    form.cargoList.splice(index, 1)
  } else {
    ElMessage.warning('至少保留一个货物')
  }
}

const closeForm = () => {
  router.push('/waybill')
}

const publish = () => {
  ElMessage.success('运单发布成功！')
  router.push('/waybill')
}
</script>

<style scoped>
.waybill-create {
  height: 100%;
  overflow-y: auto !important;
  padding: 16px 20px;
  box-sizing: border-box;
  background: #ffffff;
}

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

/* 运输信息浅色背景框 */
.transport-section {
  background: #f7f9fc;
  border-radius: 8px;
  padding: 12px 16px 16px 16px;
  margin-bottom: 8px;
}

/* 行容器：徽章 + 字段组水平对齐 */
.row-wrapper {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}
.row-wrapper:last-of-type {
  margin-bottom: 0;
}

.badge-circle {
  display: inline-block;
  width: 28px;
  height: 28px;
  line-height: 28px;
  border-radius: 50%;
  background-color: #c8102e;
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  text-align: center;
  flex-shrink: 0;
  margin-top: 2px;
}

.field-group {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.field-item {
  flex: 1;
  min-width: 160px;
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
.field-item .el-select,
.field-item .el-date-picker,
.field-item .el-input {
  flex: 1;
  min-width: 100px;
}

/* 打卡行 */
.checkin-row {
  margin-top: 12px;
}
.hint-text {
  font-size: 12px;
  color: #888;
  margin-left: 12px;
}

/* 发货信息 & 指派信息共用 */
.info-row {
  display: flex;
  flex-wrap: wrap;
  gap: 24px 40px;
  margin: 0 0 12px 0;
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

/* 货物行 */
.cargo-row {
  background: #f9f9f9;
  border-radius: 8px;
  padding: 8px 16px;
  margin-bottom: 8px;
  border: 1px solid #eee;
}
.cargo-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

/* 底部按钮 */
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 30px;
  padding-top: 16px;
  border-top: 1px solid #e8e8e8;
}

/* 响应式 */
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
}
</style>