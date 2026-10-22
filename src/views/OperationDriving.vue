<template>
  <div class="placeholder-page">
    <div class="placeholder-card">
      <div class="placeholder-icon">
        <el-icon>
          <Guide />
        </el-icon>
      </div>
      <h2>驾驶行为报表</h2>
      <p>该报表正在建设中，敬请期待。</p>
      <span class="placeholder-tip">将统计急加速 / 急减速 / 超速 / 怠速等驾驶行为，形成司机评分</span>
    </div>
  </div>
</template>

<script setup>
import { Guide } from '@element-plus/icons-vue'
</script>

<style scoped>
.placeholder-page {
  padding: 6px 16px 16px;
  height: calc(100vh - 101px);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #F8FAFC;
}

.placeholder-card {
  width: 100%;
  max-width: 520px;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
  padding: 56px 40px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.placeholder-icon {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--brand-primary-light);
  color: var(--brand-primary);
  font-size: 30px;
  margin-bottom: 4px;
}

.placeholder-card h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #0F172A;
}

.placeholder-card p {
  margin: 0;
  font-size: 13px;
  color: #64748B;
}

.placeholder-tip {
  margin-top: 6px;
  font-size: 12px;
  color: #94A3B8;
  border-top: 1px dashed #E2E8F0;
  padding-top: 14px;
  width: 100%;
}
</style>
