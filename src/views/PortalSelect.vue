<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

const router = useRouter()

const showHeader = ref(false)
const showBody = ref(false)

onMounted(() => {
  requestAnimationFrame(() => {
    showHeader.value = true
    setTimeout(() => { showBody.value = true }, 200)
  })
})

// TODO: 后续从 supabase 拉取真实客户列表
const customers = ref([
  { id: 'c001', name: '示例客户 A 有限公司' },
  { id: 'c002', name: '示例客户 B 物流集团' },
  { id: 'c003', name: '示例客户 C 运输公司' },
])

const selections = reactive({ fuel: '', newenergy: '' })

const cardList = [
  { key: 'fuel',      title: '车队管理系统客户端', sub: '燃油平台',   tone: 'red' },
  { key: 'newenergy', title: '车队管理系统客户端', sub: '新能源平台', tone: 'blue' },
  { key: 'admin',     title: '车队管理系统管理端', sub: '后台管理中心', tone: 'slate' },
]

const enterCard = (key) => {
  if (key === 'admin') { router.push('/admin'); return }
  const cid = selections[key]
  if (!cid) { ElMessage.warning('请先选择客户'); return }
  router.push({ path: '/dashboard', query: { type: key, customer: cid } })
}

// ============================================================
// 退出登录 · 模糊至黑屏 + 欢迎使用 + 放大转场
// ============================================================
const showGoodbye = ref(false)

const goLogout = () => {
  if (showGoodbye.value) return
  showGoodbye.value = true
  setTimeout(() => {
    router.push('/')
    setTimeout(() => { showGoodbye.value = false }, 200)
  }, 1250)
}
</script>

<template>
  <div class="portal-page">
    <div class="bg-grid"></div>
    <div class="bg-orb orb-red"></div>
    <div class="bg-orb orb-blue"></div>

    <!-- 顶部栏 -->
    <header class="portal-header" :class="{ show: showHeader }">
      <div class="header-logo">
        <img src="/DFLOGO.png" alt="东风商用车" />
      </div>

      <div class="header-title">
        <span class="title-line"></span>
        <h1>车 队 管 理 平 台</h1>
        <span class="title-line"></span>
      </div>

      <button class="logout-btn" @click="goLogout">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        退出登录
      </button>
    </header>

    <!-- 卡片区 -->
    <main class="portal-body" :class="{ show: showBody }">
      <div
        v-for="(card, i) in cardList"
        :key="card.key"
        class="portal-card"
        :class="'tone-' + card.tone"
        :style="{ animationDelay: (i * 0.15) + 's' }"
      >
        <div class="card-shine"></div>
        <div class="card-body">
          <div class="card-icon">
            <svg v-if="card.key === 'fuel'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2 C12 2 5 10 5 15 a7 7 0 0 0 14 0 c0-5-7-13-7-13z" />
            </svg>
            <svg v-else-if="card.key === 'newenergy'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </div>

          <h3 class="card-title">{{ card.title }}</h3>
          <p class="card-sub">{{ card.sub }}</p>

          <div class="card-divider"></div>

          <div v-if="card.key !== 'admin'" class="card-select">
            <el-select
              v-model="selections[card.key]"
              placeholder="请选择客户"
              popper-class="portal-select-popper"
            >
              <el-option
                v-for="c in customers"
                :key="c.id"
                :label="c.name"
                :value="c.id"
              />
            </el-select>
          </div>
          <div v-else class="card-select placeholder">
            <span>管理员后台</span>
          </div>

          <button class="enter-btn" @click="enterCard(card.key)">
            <span>进入</span>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      </div>
    </main>

    <!-- ========== 退出登录动画 ========== -->
    <div v-if="showGoodbye" class="goodbye-overlay">
      <h1 class="goodbye-text">感谢使用</h1>
    </div>
  </div>
</template>

<style scoped>
.portal-page {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #F8FAFC;
  font-family: system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: #0F172A;
}

/* ============ 网格背景 ============ */
.bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(15, 23, 42, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(15, 23, 42, 0.035) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(ellipse at 50% 45%, #000 0%, transparent 78%);
  -webkit-mask-image: radial-gradient(ellipse at 50% 45%, #000 0%, transparent 78%);
  pointer-events: none;
  animation: gridDrift 32s linear infinite;
}
@keyframes gridDrift {
  from { background-position: 0 0, 0 0; }
  to   { background-position: 44px 44px, 44px 44px; }
}

/* ============ 背景光晕 ============ */
.bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  pointer-events: none;
  animation: orbFloat 14s ease-in-out infinite;
}
.orb-red  { width: 620px; height: 620px; top: -180px; left: -140px; background: radial-gradient(circle, rgba(200, 16, 46, 0.18) 0%, transparent 70%); }
.orb-blue { width: 680px; height: 680px; bottom: -240px; right: -180px; background: radial-gradient(circle, rgba(30, 100, 200, 0.16) 0%, transparent 70%); animation-delay: -7s; }
@keyframes orbFloat {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50%      { transform: translate(30px, -22px) scale(1.08); }
}

/* ============ 顶部栏 ============ */
.portal-header {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 88px;
  padding: 0 40px;
  opacity: 0;
  transform: translateY(-24px);
  transition: opacity 0.7s ease, transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.portal-header.show { opacity: 1; transform: translateY(0); }

.header-logo img {
  height: 58px;
  width: auto;
  display: block;
}

.header-title {
  position: absolute;
  left: 50%;
  top: 0;
  transform: translateX(-50%);
  height: 88px;
  display: flex;
  align-items: center;
  gap: 20px;
}
.header-title h1 {
  position: relative;
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 8px;
  color: #0F172A;
}
.header-title h1::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -12px;
  transform: translateX(-50%);
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg, transparent, #c8102e, #c8102e, #c8102e, transparent);
  border-radius: 2px;
  animation: titleBarPulse 2.6s ease-in-out infinite;
}
@keyframes titleBarPulse {
  0%, 100% { opacity: 0.55; width: 100%; }
  50%      { opacity: 1;    width: 118%; }
}
.title-line {
  display: block;
  width: 60px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(200, 16, 46, 0.5), transparent);
}

.logout-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 600;
  color: #c8102e;
  background: #FFFFFF;
  border: 1px solid rgba(200, 16, 46, 0.35);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: inherit;
  box-shadow: 0 2px 10px rgba(200, 16, 46, 0.06);
}
.logout-btn:hover {
  color: #FFFFFF;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  border-color: transparent;
  box-shadow: 0 8px 22px rgba(200, 16, 46, 0.35);
  transform: translateY(-2px);
}

/* ============ 卡片区 ============ */
.portal-body {
  position: relative;
  z-index: 5;
  display: grid;
  grid-template-columns: repeat(3, minmax(260px, 340px));
  justify-content: center;
  align-items: center;
  gap: 56px;
  padding: 40px;
  height: calc(100vh - 88px);
}

.portal-card {
  position: relative;
  border-radius: 16px;
  opacity: 0;
  transform: translateY(40px);
}
.portal-body.show .portal-card {
  animation: cardEnter 0.75s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
@keyframes cardEnter {
  from { opacity: 0; transform: translateY(40px) scale(0.94); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.card-body {
  position: relative;
  background: #FFFFFF;
  border-radius: 16px;
  padding: 40px 28px 30px;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 380px;
  border: 1px solid #E2E8F0;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05);
  transition: all 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
  overflow: hidden;
}
.portal-card:hover .card-body {
  transform: translateY(-10px);
  border-color: rgba(200, 16, 46, 0.35);
  box-shadow:
    0 20px 50px rgba(200, 16, 46, 0.15),
    0 6px 18px rgba(15, 23, 42, 0.06);
}
.portal-card.tone-blue:hover .card-body {
  border-color: rgba(30, 100, 200, 0.35);
  box-shadow:
    0 20px 50px rgba(30, 100, 200, 0.15),
    0 6px 18px rgba(15, 23, 42, 0.06);
}
.portal-card.tone-slate:hover .card-body {
  border-color: rgba(71, 85, 105, 0.35);
  box-shadow:
    0 20px 50px rgba(71, 85, 105, 0.15),
    0 6px 18px rgba(15, 23, 42, 0.06);
}

.card-shine {
  position: absolute;
  top: 0; left: -60%;
  width: 60%; height: 3px;
  background: linear-gradient(90deg, transparent, currentColor, transparent);
  color: #c8102e;
  opacity: 0.85;
  transition: left 0.9s ease;
  border-radius: 3px;
  z-index: 2;
}
.portal-card.tone-blue  .card-shine { color: #2563EB; }
.portal-card.tone-slate .card-shine { color: #475569; }
.portal-card:hover .card-shine { left: 100%; }

.card-icon {
  width: 82px; height: 82px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  margin-bottom: 24px;
  transition: all 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;
}
.tone-red .card-icon {
  background: radial-gradient(circle at 30% 30%, #FCA5A5 0%, #C8102E 100%);
  color: #FFFFFF;
  box-shadow: 0 8px 24px rgba(200, 16, 46, 0.3);
}
.tone-blue .card-icon {
  background: radial-gradient(circle at 30% 30%, #93C5FD 0%, #2563EB 100%);
  color: #FFFFFF;
  box-shadow: 0 8px 24px rgba(37, 99, 235, 0.3);
}
.tone-slate .card-icon {
  background: radial-gradient(circle at 30% 30%, #94A3B8 0%, #334155 100%);
  color: #FFFFFF;
  box-shadow: 0 8px 24px rgba(51, 65, 85, 0.3);
}
.portal-card:hover .card-icon {
  transform: scale(1.1) rotate(-5deg);
}
.portal-card:hover .card-icon::after {
  content: '';
  position: absolute;
  inset: -12px;
  border-radius: 50%;
  border: 2px solid currentColor;
  color: inherit;
  opacity: 0.4;
  animation: iconRing 1.6s ease-out infinite;
}
.tone-red   .card-icon::after { color: #C8102E; }
.tone-blue  .card-icon::after { color: #2563EB; }
.tone-slate .card-icon::after { color: #334155; }
@keyframes iconRing {
  0%   { transform: scale(0.85); opacity: 0.5; }
  100% { transform: scale(1.6);  opacity: 0; }
}
.card-icon svg { width: 38px; height: 38px; }

.card-title {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: 0.8px;
  text-align: center;
}
.card-sub {
  margin: 0;
  font-size: 13px;
  color: #64748B;
  letter-spacing: 1.6px;
}
.card-divider {
  width: 40px; height: 1px;
  margin: 22px 0;
  background: linear-gradient(90deg, transparent, #CBD5E1, transparent);
}

.card-select { width: 100%; margin-bottom: 22px; }
.card-select.placeholder {
  display: flex; align-items: center; justify-content: center;
  height: 40px;
  color: #94A3B8;
  font-size: 13px;
  letter-spacing: 2px;
  border: 1px dashed #CBD5E1;
  border-radius: 8px;
  background: #F8FAFC;
}
.card-select :deep(.el-select__wrapper) {
  border-radius: 8px !important;
  min-height: 40px;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  background: #F8FAFC !important;
  transition: all 0.28s;
}
.card-select :deep(.el-select__wrapper:hover) {
  box-shadow: 0 0 0 1px rgba(200, 16, 46, 0.45) inset !important;
  background: #FFFFFF !important;
}
.card-select :deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px #c8102e inset, 0 0 0 3px rgba(200, 16, 46, 0.12) !important;
  background: #FFFFFF !important;
}

.enter-btn {
  margin-top: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 34px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 3px;
  color: #FFFFFF;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow: 0 6px 20px rgba(200, 16, 46, 0.3);
  font-family: inherit;
}
.tone-blue .enter-btn {
  background: linear-gradient(135deg, #2563EB, #1d4ed8);
  box-shadow: 0 6px 20px rgba(37, 99, 235, 0.3);
}
.tone-slate .enter-btn {
  background: linear-gradient(135deg, #475569, #1e293b);
  box-shadow: 0 6px 20px rgba(51, 65, 85, 0.3);
}
.enter-btn::before {
  content: '';
  position: absolute;
  top: 0; left: -100%;
  width: 60%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent);
  transition: left 0.65s ease;
}
.enter-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(200, 16, 46, 0.4);
}
.tone-blue .enter-btn:hover { box-shadow: 0 12px 28px rgba(37, 99, 235, 0.4); }
.tone-slate .enter-btn:hover { box-shadow: 0 12px 28px rgba(51, 65, 85, 0.4); }
.enter-btn:hover::before { left: 130%; }
.enter-btn:active { transform: translateY(0) scale(0.97); }
.enter-btn svg { transition: transform 0.3s; }
.enter-btn:hover svg { transform: translateX(4px); }

/* ==========================================
   退出登录 · 模糊至黑屏 + 欢迎使用 + 放大转场
   ========================================== */
.goodbye-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: rgba(0, 0, 0, 0);
  backdrop-filter: blur(0px);
  -webkit-backdrop-filter: blur(0px);
  animation: goodbyeBlackout 1.25s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
@keyframes goodbyeBlackout {
  0% {
    background: rgba(0, 0, 0, 0);
    backdrop-filter: blur(0px);
    -webkit-backdrop-filter: blur(0px);
  }
  70% {
    background: rgba(0, 0, 0, 1);
    backdrop-filter: blur(30px);
    -webkit-backdrop-filter: blur(30px);
  }
  100% {
    background: rgba(0, 0, 0, 1);
    backdrop-filter: blur(30px);
    -webkit-backdrop-filter: blur(30px);
  }
}

.goodbye-text {
  position: relative;
  z-index: 2;
  margin: 0;
  font-family: inherit;
  font-size: 46px;
  font-weight: 700;
  letter-spacing: 14px;
  text-indent: 14px;
  color: #ffffff;
  user-select: none;
  white-space: nowrap;
  text-shadow:
    0 0 24px rgba(255, 255, 255, 0.55),
    0 0 60px rgba(211, 47, 47, 0.35);
  transform-origin: center center;
  will-change: transform, opacity, filter;
  animation: goodbyeTextFocus 1.25s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
@keyframes goodbyeTextFocus {
  0% {
    opacity: 0;
    filter: blur(20px);
    letter-spacing: 32px;
    transform: scale(1.1);
  }
  55% {
    opacity: 1;
    filter: blur(0);
    letter-spacing: 14px;
    transform: scale(1);
  }
  70% {
    opacity: 1;
    filter: blur(0);
    letter-spacing: 14px;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    filter: blur(4px);
    letter-spacing: 14px;
    transform: scale(4);
  }
}

/* ============ 响应式 ============ */
@media (max-width: 1100px) {
  .portal-body {
    grid-template-columns: 1fr;
    overflow-y: auto;
    gap: 30px;
    padding: 30px 40px 60px;
  }
  .header-title h1 { font-size: 18px; letter-spacing: 4px; }
  .title-line { width: 24px; }
}
@media (max-width: 768px) {
  .goodbye-text {
    font-size: 28px;
    letter-spacing: 8px;
    text-indent: 8px;
  }
  @keyframes goodbyeTextFocus {
    0%   { opacity: 0; filter: blur(16px); letter-spacing: 22px; transform: scale(1.1); }
    55%  { opacity: 1; filter: blur(0);    letter-spacing: 8px;  transform: scale(1); }
    70%  { opacity: 1; filter: blur(0);    letter-spacing: 8px;  transform: scale(1); }
    100% { opacity: 0; filter: blur(4px);  letter-spacing: 8px;  transform: scale(4); }
  }
}
</style>

<!-- 全局：下拉 popper -->
<style>
.portal-select-popper {
  border-radius: 8px !important;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12) !important;
  border: 1px solid #E2E8F0 !important;
}
.portal-select-popper .el-select-dropdown__item { font-size: 13px; color: #334155; }
.portal-select-popper .el-select-dropdown__item.is-hovering,
.portal-select-popper .el-select-dropdown__item:hover {
  background: #FEF2F2 !important;
  color: #c8102e !important;
}
.portal-select-popper .el-select-dropdown__item.is-selected {
  color: #c8102e !important;
  font-weight: 700;
}
</style>