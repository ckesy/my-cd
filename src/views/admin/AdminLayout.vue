<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Van, UserFilled, Fold, Expand, Setting, DataBoard, Avatar } from '@element-plus/icons-vue'
import PersonalSettings from '../../components/PersonalSettings.vue'

const route = useRoute()
const router = useRouter()
const collapsed = ref(false)

const menuList = [
  { path: '/admin/dashboard', title: '数据总览',   icon: DataBoard },
  { path: '/admin/vehicle',   title: '车辆管理',   icon: Van },
  { path: '/admin/customer',  title: '客户管理',   icon: UserFilled },
  { path: '/admin/accounts',  title: '管理员账号', icon: Avatar },
]

const activeMenu = computed(() => route.path)
const selectMenu = (p) => router.push(p)
const goPortal = () => router.push('/portal')

// 个人设置弹窗
const settingsVisible = ref(false)
const handleSettings = () => { settingsVisible.value = true }

// 当前登录用户
const currentUser = (() => {
  try {
    return JSON.parse(localStorage.getItem('currentUser') || 'null')
  } catch { return null }
})()

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
  <div class="admin-layout">
    <!-- 顶部栏 -->
    <header class="admin-header">
      <div class="header-left">
        <img src="/DFLOGO.png" class="admin-logo" alt="东风商用车" />
        <button class="icon-btn" @click="collapsed = !collapsed" title="折叠菜单">
          <el-icon><Fold v-if="!collapsed" /><Expand v-else /></el-icon>
        </button>
      </div>

      <div class="header-center">
        <span class="title-line"></span>
        <h1>车队管理平台 · 管理端 · {{ currentUser?.name || '管理员' }}</h1>
        <span class="title-line"></span>
      </div>

      <div class="header-right">
        <button class="header-btn" @click="handleSettings">
          <el-icon><Setting /></el-icon> 设置
        </button>
        <button class="header-btn" @click="goPortal">返回入口</button>
        <button class="header-btn danger" @click="goLogout">退出登录</button>
      </div>
    </header>

    <!-- 主体 -->
    <div class="admin-body">
      <aside class="admin-sidebar" :class="{ collapsed }">
        <nav class="menu-list">
          <div
            v-for="item in menuList"
            :key="item.path"
            class="menu-item"
            :class="{ active: activeMenu === item.path }"
            @click="selectMenu(item.path)"
          >
            <el-icon class="menu-icon"><component :is="item.icon" /></el-icon>
            <span v-show="!collapsed" class="menu-text">{{ item.title }}</span>
          </div>
        </nav>
      </aside>

      <main class="admin-content">
        <router-view v-slot="{ Component }">
          <transition name="fade-slide" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>

    <!-- ========== 个人设置弹窗 ========== -->
    <PersonalSettings v-model="settingsVisible" />

    <!-- ========== 退出登录动画 ========== -->
    <div v-if="showGoodbye" class="goodbye-overlay">
      <h1 class="goodbye-text">感谢使用</h1>
    </div>
  </div>
</template>

<style scoped>
.admin-layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #F8FAFC;
  color: #0F172A;
  font-family: system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  overflow: hidden;
}

/* ============ 顶部栏 ============ */
.admin-header {
  position: relative;
  height: 62px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: #FFFFFF;
  border-bottom: 1px solid #E2E8F0;
  z-index: 20;
}
.admin-header::after {
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: -1px;
  height: 2px;
  background: linear-gradient(90deg,
    rgba(200, 16, 46, 0) 0%,
    rgba(200, 16, 46, 0.85) 50%,
    rgba(200, 16, 46, 0) 100%
  );
  box-shadow: 0 2px 8px rgba(200, 16, 46, 0.15);
  animation: headerLine 3s ease-in-out infinite;
}
@keyframes headerLine {
  0%, 100% { opacity: 0.5; }
  50%      { opacity: 1; }
}

.header-left, .header-right { display: flex; align-items: center; gap: 10px; }

.admin-logo { height: 38px; width: auto; }

.icon-btn {
  width: 34px; height: 34px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid #E2E8F0;
  background: #FFFFFF;
  color: #64748B;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.28s;
}
.icon-btn:hover {
  color: #c8102e;
  border-color: rgba(200, 16, 46, 0.5);
  background: #FEF2F2;
  transform: scale(1.05);
}

.header-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
}
.header-center h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 3px;
  color: #0F172A;
  white-space: nowrap;
}
.title-line {
  display: block;
  width: 42px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(200, 16, 46, 0.5), transparent);
}

.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: inherit;
}
.header-btn:hover {
  color: #c8102e;
  border-color: rgba(200, 16, 46, 0.5);
  background: #FEF2F2;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.12);
}
.header-btn.danger {
  color: #FFFFFF;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  border-color: transparent;
  box-shadow: 0 3px 10px rgba(200, 16, 46, 0.28);
}
.header-btn.danger:hover {
  box-shadow: 0 6px 18px rgba(200, 16, 46, 0.45);
  transform: translateY(-2px);
}

/* ============ 主体 ============ */
.admin-body { flex: 1; display: flex; min-height: 0; }

/* ============ 侧边栏 ============ */
.admin-sidebar {
  width: 220px;
  background: #FFFFFF;
  border-right: 1px solid #E2E8F0;
  transition: width 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  padding: 14px 10px;
  overflow: hidden;
  flex-shrink: 0;
}
.admin-sidebar.collapsed { width: 64px; }

.menu-list { display: flex; flex-direction: column; gap: 4px; }

.menu-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 10px;
  cursor: pointer;
  color: #475569;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.5px;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  overflow: hidden;
}
.menu-item:hover {
  color: #c8102e;
  background: #FEF2F2;
  transform: translateX(3px);
}
.menu-item.active {
  color: #c8102e;
  background: linear-gradient(90deg, #FEF2F2, rgba(254, 242, 242, 0.4));
  font-weight: 700;
}
.menu-item.active::before {
  content: '';
  position: absolute;
  left: 0; top: 20%; bottom: 20%;
  width: 3px;
  background: linear-gradient(180deg, #c8102e, #a00d24);
  border-radius: 0 3px 3px 0;
  box-shadow: 0 0 10px rgba(200, 16, 46, 0.6);
}
.menu-icon {
  font-size: 18px;
  flex-shrink: 0;
  color: inherit;
  transition: transform 0.3s;
}
.menu-item:hover .menu-icon { transform: scale(1.12); }
.menu-text { white-space: nowrap; }

/* ============ 内容区 ============ */
.admin-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 20px;
  background: #F8FAFC;
}
.admin-content::-webkit-scrollbar { width: 8px; }
.admin-content::-webkit-scrollbar-thumb {
  background: #CBD5E1;
  border-radius: 4px;
}
.admin-content::-webkit-scrollbar-thumb:hover { background: #94A3B8; }

.fade-slide-enter-active, .fade-slide-leave-active {
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.fade-slide-enter-from { opacity: 0; transform: translateY(16px); }
.fade-slide-leave-to   { opacity: 0; transform: translateY(-10px); }

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
  0%   { background: rgba(0, 0, 0, 0); backdrop-filter: blur(0px); -webkit-backdrop-filter: blur(0px); }
  70%  { background: rgba(0, 0, 0, 1); backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px); }
  100% { background: rgba(0, 0, 0, 1); backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px); }
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
  0%   { opacity: 0; filter: blur(20px); letter-spacing: 32px; transform: scale(1.1); }
  55%  { opacity: 1; filter: blur(0);    letter-spacing: 14px; transform: scale(1); }
  70%  { opacity: 1; filter: blur(0);    letter-spacing: 14px; transform: scale(1); }
  100% { opacity: 0; filter: blur(4px);  letter-spacing: 14px; transform: scale(4); }
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

<!-- ===== 全局：管理端公共样式（浅色） ===== -->
<style>
.light-panel {
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 12px;
  padding: 18px 20px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.04);
  transition: box-shadow 0.3s;
}
.light-panel:hover { box-shadow: 0 6px 22px rgba(15, 23, 42, 0.06); }

.filter-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}
.filter-grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.filter-actions { display: flex; flex-wrap: wrap; gap: 10px; }

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 16px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: inherit;
}
.action-btn:hover:not(:disabled) {
  color: #c8102e;
  border-color: rgba(200, 16, 46, 0.5);
  background: #FEF2F2;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(200, 16, 46, 0.15);
}
.action-btn.primary {
  color: #FFFFFF;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  border-color: transparent;
  box-shadow: 0 3px 10px rgba(200, 16, 46, 0.28);
}
.action-btn.primary:hover:not(:disabled) {
  box-shadow: 0 8px 22px rgba(200, 16, 46, 0.45);
  transform: translateY(-2px);
}
.action-btn.danger {
  color: #c8102e;
  border-color: rgba(200, 16, 46, 0.4);
  background: #FFFFFF;
}
.action-btn.danger:hover:not(:disabled) {
  color: #FFFFFF;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  border-color: transparent;
}
.action-btn.ghost { background: transparent; color: #94A3B8; border-color: #E2E8F0; }
.action-btn.ghost:hover:not(:disabled) {
  background: #F8FAFC;
  color: #475569;
  border-color: #CBD5E1;
}
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  color: #0F172A;
  margin-bottom: 14px;
}
.panel-title .dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #c8102e;
  box-shadow: 0 0 0 3px rgba(200, 16, 46, 0.15);
}
.panel-title .count {
  font-size: 12px;
  color: #94A3B8;
  font-weight: 400;
  margin-left: auto;
}

.filter-grid .el-input__wrapper,
.filter-grid .el-select__wrapper {
  border-radius: 8px !important;
  background: #F8FAFC !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  transition: all 0.25s;
}
.filter-grid .el-input__wrapper:hover,
.filter-grid .el-select__wrapper:hover {
  box-shadow: 0 0 0 1px rgba(200, 16, 46, 0.4) inset !important;
  background: #FFFFFF !important;
}
.filter-grid .el-input__wrapper.is-focus,
.filter-grid .el-select__wrapper.is-focused {
  background: #FFFFFF !important;
  box-shadow: 0 0 0 1px #c8102e inset, 0 0 0 3px rgba(200, 16, 46, 0.1) !important;
}

.light-select-popper {
  border-radius: 8px !important;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12) !important;
  border: 1px solid #E2E8F0 !important;
}
.light-select-popper .el-select-dropdown__item { font-size: 13px; color: #334155; }
.light-select-popper .el-select-dropdown__item.is-hovering,
.light-select-popper .el-select-dropdown__item:hover {
  background: #FEF2F2 !important;
  color: #c8102e !important;
}
.light-select-popper .el-select-dropdown__item.is-selected {
  color: #c8102e !important;
  font-weight: 700;
}

.light-table.el-table {
  --el-table-bg-color: #FFFFFF;
  --el-table-tr-bg-color: #FFFFFF;
  --el-table-header-bg-color: #F8FAFC;
  --el-table-border-color: #E2E8F0;
  --el-table-text-color: #334155;
  --el-table-header-text-color: #475569;
  --el-table-row-hover-bg-color: #FEF2F2;
  background: #FFFFFF !important;
  border-radius: 8px;
  overflow: hidden;
}
.light-table .el-table__inner-wrapper::before { display: none; }
.light-table .el-table__header th { font-weight: 700; letter-spacing: 0.4px; }
.light-table .el-checkbox__input.is-checked .el-checkbox__inner {
  background: #c8102e;
  border-color: #c8102e;
}
.light-table .el-checkbox__inner:hover { border-color: #c8102e; }

.row-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  margin-right: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.25s;
  font-family: inherit;
}
.row-btn:hover:not(:disabled) {
  color: #c8102e;
  border-color: rgba(200, 16, 46, 0.5);
  background: #FEF2F2;
}
.row-btn.danger { color: #c8102e; }
.row-btn.danger:hover:not(:disabled) {
  color: #FFFFFF;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  border-color: transparent;
}
.row-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
.pagination-wrap .el-pagination.is-background .el-pager li.is-active {
  background: linear-gradient(135deg, #c8102e, #a00d24);
  border-color: transparent;
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.3);
}

.light-dialog.el-dialog {
  border-radius: 12px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
}
.light-dialog .el-dialog__title {
  color: #0F172A;
  font-weight: 700;
  letter-spacing: 1px;
}
.light-form .el-input__wrapper,
.light-form .el-textarea__inner {
  border-radius: 8px !important;
  background: #F8FAFC !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  transition: all 0.25s;
}
.light-form .el-input__wrapper:hover,
.light-form .el-textarea__inner:hover {
  box-shadow: 0 0 0 1px rgba(200, 16, 46, 0.4) inset !important;
  background: #FFFFFF !important;
}
.light-form .el-input__wrapper.is-focus,
.light-form .el-textarea__inner:focus {
  background: #FFFFFF !important;
  box-shadow: 0 0 0 1px #c8102e inset, 0 0 0 3px rgba(200, 16, 46, 0.1) !important;
}
</style>