<template>
  <div class="fee-stats-page">
    <div class="fs-head">
      <div>
        <h2>费用统计</h2>
        <p>按客户、司机、费用类型与月份汇总上报金额，支持导出对账单。</p>
      </div>
      <el-tag type="warning" effect="plain" size="small">P2 · 审批跑通后再做</el-tag>
    </div>

    <div class="fs-empty">
      <div class="fs-icon">
        <el-icon><DataAnalysis /></el-icon>
      </div>
      <h3>费用统计正在建设</h3>
      <p>这一版先把「运单详情 → 费用情况」的审批链路跑通，统计与导出放在下一阶段。</p>

      <div class="fs-preview">
        <div class="fp-item">
          <span>本月上报</span>
          <b>—</b>
        </div>
        <div class="fp-item">
          <span>待审批</span>
          <b>—</b>
        </div>
        <div class="fp-item">
          <span>已打款</span>
          <b>—</b>
        </div>
        <div class="fp-item">
          <span>驳回率</span>
          <b>—</b>
        </div>
      </div>

      <el-button v-if="isMaster" type="danger" plain @click="router.push('/fee/config')">
        先去看费用审批设置
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { DataAnalysis } from '@element-plus/icons-vue'

const router = useRouter()

const currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('currentUser') || 'null') } catch { return null }
})()

const isMaster = computed(() => {
  if (!currentUser) return false
  if (currentUser.role === 'admin') return true
  return currentUser.role === 'customer' && !currentUser.isSubAccount
})
</script>

<style scoped>
.fee-stats-page {
  min-height: 100%;
  padding: 22px 24px 30px;
  box-sizing: border-box;
}

.fs-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 18px;
}

.fs-head h2 {
  margin: 0 0 5px;
  font-size: 19px;
  font-weight: 600;
  color: var(--text-primary);
}

.fs-head p {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-tertiary);
}

.fs-empty {
  background: #fff;
  border: 1px solid var(--border-base);
  border-radius: 14px;
  padding: 56px 32px 44px;
  text-align: center;
  max-width: 720px;
  margin: 26px auto 0;
}

.fs-icon {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: #FEF2F2;
  color: #c8102e;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 18px;
  font-size: 27px;
}

.fs-empty h3 {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.fs-empty p {
  margin: 0 auto 22px;
  max-width: 460px;
  font-size: 12.5px;
  line-height: 1.85;
  color: var(--text-tertiary);
}

.fs-preview {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  max-width: 520px;
  margin: 0 auto 24px;
}

.fp-item {
  background: #F8FAFC;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  padding: 12px 8px;
}

.fp-item span {
  display: block;
  font-size: 11px;
  color: var(--text-placeholder);
  margin-bottom: 4px;
}

.fp-item b {
  font-size: 18px;
  color: var(--text-placeholder);
  letter-spacing: -.3px;
}
</style>
