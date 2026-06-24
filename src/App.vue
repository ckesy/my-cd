<script setup>
import { ref, reactive, computed, onBeforeUnmount } from 'vue'

const activeTab = ref('phone')
const phone = ref('13800138000')
const code = ref('123456')
const password = ref('password123')

const cardPosition = reactive({ x: 302, y: -76 })
const dragOffset = reactive({ x: 0, y: 0 })
const isDragging = ref(false)

const cardStyle = computed(() => ({
  transform: `translate(${cardPosition.x}px, ${cardPosition.y}px)`,
  cursor: isDragging.value ? 'grabbing' : 'grab',
}))

const startDrag = (event) => {
  if (event.button !== 0) return
  isDragging.value = true
  dragOffset.x = event.clientX - cardPosition.x
  dragOffset.y = event.clientY - cardPosition.y
  window.addEventListener('mousemove', handleDrag)
  window.addEventListener('mouseup', stopDrag)
}

const handleDrag = (event) => {
  if (!isDragging.value) return
  cardPosition.x = event.clientX - dragOffset.x
  cardPosition.y = event.clientY - dragOffset.y
}

const stopDrag = () => {
  if (!isDragging.value) return
  isDragging.value = false
  window.removeEventListener('mousemove', handleDrag)
  window.removeEventListener('mouseup', stopDrag)
}

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', handleDrag)
  window.removeEventListener('mouseup', stopDrag)
})

const sendCode = () => {
  window.alert('验证码已发送，默认验证码：123456')
}

const handleLogin = () => {
  const type = activeTab.value === 'phone' ? '手机号登录' : '账户密码登录'
  window.alert(`假登录：${type}\n手机号：${phone.value}\n${activeTab.value === 'phone' ? `验证码：${code.value}` : `密码：${password.value}`}`)
}
</script>

<template>
  <div class="app-shell">
    <div class="login-wrapper" :style="cardStyle">
      <div class="login-card" @mousedown="startDrag">
        <div class="login-head">
          <span class="login-guide">车队管理平台</span>
          <span class="login-guide">登录指引</span>
        </div>
        <el-tabs v-model="activeTab" stretch>
          <el-tab-pane label="手机号登录" name="phone"></el-tab-pane>
          <el-tab-pane label="账户密码登录" name="account"></el-tab-pane>
        </el-tabs>

        <el-form label-position="top" size="medium" class="login-form">
          <el-form-item label="手机号">
            <el-input v-model="phone" placeholder="请输入电话号" />
          </el-form-item>

          <el-form-item v-if="activeTab === 'phone'" label="验证码">
            <div class="code-row">
              <el-input v-model="code" placeholder="请输入验证码" />
              <el-button class="send-code-btn" type="primary" @click="sendCode">发送验证码</el-button>
            </div>
          </el-form-item>

          <el-form-item v-else label="密码">
            <el-input v-model="password" placeholder="请输入密码" show-password />
          </el-form-item>

          <el-form-item>
            <el-button class="login-btn" type="primary" @click="handleLogin">登录</el-button>
          </el-form-item>
        </el-form>

        <p class="privacy-text">登录即代表您同意《隐私保护政策》</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  width: 100%;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
}

.login-wrapper {
  width: 100%;
  max-width: 380px;
  margin: 0 auto;
  position: relative;
}

/* 页面标题已移入卡片内部 */
.login-card {
  width: 100%;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 24px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
  padding: 32px;
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255, 255, 255, 0.6);
  user-select: none;
}

.login-card:active {
  box-shadow: 0 26px 60px rgba(15, 23, 42, 0.12);
}

.login-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.login-guide {
  font-size: 16px;
  color: #1e40af; /* deeper blue (option B) */
  font-weight: 600;
}

/* Tabs and buttons contrast tweaks */
:deep(.el-tabs__nav .el-tabs__item) {
  color: #1652b4; /* deeper inactive blue */
  font-weight: 600;
}
:deep(.el-tabs__nav .el-tabs__item.is-active) {
  color: #0b4f8a !important; /* active color changed to a deeper blue */
  font-weight: 800;
}
:deep(.el-tabs__active-bar) {
  background-color: #0b4f8a !important;
  height: 3px;
}

:deep(.el-tabs__header) {
  margin-bottom: 24px;
}

.el-tabs__nav {
  justify-content: center;
}

.code-row {
  display: flex;
  gap: 12px;
  align-items: center;
}

.code-row .el-input {
  flex: 1;
}

.send-code-btn {
  flex-shrink: 0;
  background-color: #1e40af;
  border-color: #1e40af;
  color: #ffffff;
  box-shadow: 0 6px 18px rgba(30,64,175,0.12);
}

.login-btn {
  width: 100%;
  background-color: #1e40af;
  border-color: #1e40af;
  color: #ffffff;
  box-shadow: 0 8px 20px rgba(30,64,175,0.15);
}

.privacy-text {
  margin-top: 20px;
  color: #425b6b;
  font-size: 14px;
  text-align: center;
}

@media (max-width: 480px) {
  .app-shell {
    padding: 24px 12px;
  }
  .login-card {
    padding: 24px;
  }
}
</style>