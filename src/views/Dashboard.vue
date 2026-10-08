<template>
  <el-container style="height:100vh; overflow: hidden; background-color: #F8FAFC;">
    <!-- 侧边栏 -->
    <el-aside width="220px" class="sidebar-container">
      <SidebarMenu
        :active-path="activeMenu"
        @menu-select="handleMenuSelect"
      />
    </el-aside>
    <el-container>
      <!-- 顶部标题栏 -->
      <el-header class="dashboard-header">
        <div class="dashboard-title">车队管理平台</div>
        <div class="dashboard-actions">
          <el-popover placement="bottom" :width="110" trigger="click" popper-class="settings-popover">
            <template #reference>
              <el-button size="small" plain class="action-btn settings-btn">
                <el-icon><Setting /></el-icon> 设置
              </el-button>
            </template>
            <div style="padding: 2px 0; text-align: center;">
              <el-button type="text" size="small" class="settings-option" @click="handleSettings">个人设置</el-button>
            </div>
          </el-popover>
          <el-button type="danger" size="small" plain class="action-btn logout-btn" @click="goLogin">退出登录</el-button>
        </div>
      </el-header>

      <!-- 标签页栏 -->
      <div class="page-tabs">
        <el-tag
          v-for="tab in tabs"
          :key="tab.path"
          :type="tab.path === route.path ? 'danger' : 'info'"
          size="small"
          closable
          @click="openTab(tab)"
          @close="closeTab(tab)"
          class="tab-item"
        >
          {{ tab.title }}
        </el-tag>
      </div>

      <!-- 主内容区 -->
      <el-main class="main-content">
        <div class="content-wrapper animate-fade-up">
          <!-- 全图监控（默认首页 /dashboard 与 /fullmap 均渲染） -->
          <template v-if="route.path === '/fullmap' || route.path === '/dashboard'">
            <FullMap />
          </template>
          <!-- 运单管理 -->
          <template v-else-if="route.path === '/waybill'">
            <Waybill />
          </template>
          <!-- 新建运单 -->
          <template v-else-if="route.path === '/waybill/create'">
            <WaybillCreate ref="waybillCreateRef" />
          </template>
          <!-- 车队运营报告 -->
          <template v-else-if="route.path === '/report'">
            <Report />
          </template>
          <!-- 车辆档案 -->
          <template v-else-if="route.path === '/vehicle-archive'">
            <VehicleArchive />
          </template>
          <!-- 司机档案 -->
          <template v-else-if="route.path === '/driver-archive'">
            <DriverArchive />
          </template>

          <!-- 👇 电子围栏管理 - 三个子页面 -->
          <template v-else-if="route.path === '/ele-fence/setting'">
            <EleFenceSetting />
          </template>
          <template v-else-if="route.path === '/ele-fence/alert-setting'">
            <EleFenceAlertSetting />
          </template>
          <template v-else-if="route.path === '/ele-fence/alert-query'">
            <EleFenceAlertQuery />
          </template>

          <!-- 其他页面（占位） -->
          <template v-else>
            <h2>{{ currentPage || '欢迎' }}</h2>
            <p>这是"{{ currentPage || '首页' }}"的占位内容。</p>
          </template>
        </div>
      </el-main>
    </el-container>

    <!-- ========== 退出登录 · 模糊至黑屏 + 欢迎使用 + 放大快切 ========== -->
    <div v-if="showGoodbye" class="goodbye-overlay">
      <h1 class="goodbye-text">欢迎使用</h1>
    </div>
  </el-container>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { Setting } from '@element-plus/icons-vue'
import SidebarMenu from '../components/SidebarMenu.vue'
import FullMap from '../views/FullMap.vue'
import WaybillCreate from '../views/WaybillCreate.vue'
import Waybill from '../views/Waybill.vue'
import Report from '../views/Report.vue'
import VehicleArchive from '../views/VehicleArchive.vue'
import DriverArchive from '../views/DriverArchive.vue'

// 👇 电子围栏管理三个子页面
import EleFenceSetting from '../views/EleFenceSetting.vue'
import EleFenceAlertSetting from '../views/EleFenceAlertSetting.vue'
import EleFenceAlertQuery from '../views/EleFenceAlertQuery.vue'

const route = useRoute()
const router = useRouter()
const waybillCreateRef = ref(null)

const activeMenu = ref(route.path)

const getMenuIndex = (path) => {
  if (path === '/waybill/create') return '/waybill'
  return path
}

const updateActiveMenu = (path) => {
  activeMenu.value = getMenuIndex(path)
}

watch(
  () => route.path,
  (newPath) => {
    updateActiveMenu(newPath)
  },
  { immediate: true }
)

const pathLabels = {
  // 👇 dashboard 与 fullmap 都指向全图监控
  '/dashboard': '全图监控',
  '/fullmap': '全图监控',
  '/dashboard/车辆故障管理': '车辆故障管理',
  '/dashboard/外观巡检管理': '外观巡检管理',
  '/dashboard/电子围栏管理': '电子围栏管理',
  '/dashboard/运营管理': '运营管理',
  '/dashboard/运输管理': '运输管理',
  '/dashboard/基础数据管理': '基础数据管理',
  '/dashboard/系统管理': '系统管理',
  '/waybill': '运单管理',
  '/report': '车队运营报告',
  '/waybill/create': '新建运单',
  '/vehicle-archive': '车辆档案',
  '/driver-archive': '司机档案',

  // 👇 电子围栏子页面
  '/ele-fence/setting': '围栏设置',
  '/ele-fence/alert-setting': '提醒设置',
  '/ele-fence/alert-query': '提醒事件查询',
}

const currentPage = computed(() => {
  return pathLabels[route.path] || route.params.page || '监控中心'
})

const tabs = ref([])

const addTab = (path) => {
  const title = pathLabels[path] || '新页面'
  if (!tabs.value.find((tab) => tab.path === path)) {
    tabs.value.push({ path, title })
  }
}

// ---------- 未保存检查并导航 ----------
const checkAndNavigate = async (targetPath) => {
  if (targetPath === route.path) return

  if (route.path === '/waybill/create' && waybillCreateRef.value && waybillCreateRef.value.isDirty) {
    try {
      await ElMessageBox.confirm(
        '该操作未保存，切换页面将导致数据丢失，是否继续编辑？',
        '提示',
        {
          confirmButtonText: '继续编辑',
          cancelButtonText: '放弃',
          type: 'warning',
          distinguishCancelAndClose: true,
          closeOnClickModal: false,
          closeOnPressEscape: false,
          customClass: 'dirty-confirm-box',
        }
      )
      return
    } catch (action) {
      if (action === 'cancel' || action === 'close') {
        router.push(targetPath)
      }
      return
    }
  }

  router.push(targetPath)
}

const openTab = (tab) => {
  checkAndNavigate(tab.path)
}

const handleMenuSelect = (index) => {
  activeMenu.value = index
  checkAndNavigate(index)
}

const closeTab = (tab) => {
  const index = tabs.value.findIndex((t) => t.path === tab.path)
  if (index === -1) return
  tabs.value.splice(index, 1)
  if (route.path === tab.path) {
    const nextTab = tabs.value[index] || tabs.value[index - 1]
    if (nextTab) {
      router.push(nextTab.path)
    } else {
      router.push('/dashboard')
    }
  }
}

watch(
  () => route.path,
  (path) => {
    addTab(path)
  },
  { immediate: true }
)

// ============================================================
// 退出登录 · 模糊至黑屏 + 欢迎使用 + 放大快切
// ============================================================
const showGoodbye = ref(false)

const goLogin = () => {
  if (showGoodbye.value) return
  showGoodbye.value = true
  // 1.25s：文字放大到最大时触发跳转，与动画高潮卡点
  setTimeout(() => {
    router.push('/')
    // 稍后重置状态，避免返回时残留
    setTimeout(() => { showGoodbye.value = false }, 200)
  }, 1250)
}

const handleSettings = () => {
  console.log('打开个人设置')
}
</script>

<style scoped>
/* ==========================================
   全局底色与布局
   ========================================== */
.el-container {
  background-color: #F8FAFC;
}

.sidebar-container {
  background: #FFFFFF;
  box-shadow: 1px 0 8px rgba(0, 0, 0, 0.03);
  border-right: 1px solid #E2E8F0;
  z-index: 10;
}

/* ==========================================
   顶部标题栏
   ========================================== */
.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 48px;
  background: #FFFFFF;
  border-bottom: 1px solid #F1F5F9;
  z-index: 9;
}
.dashboard-title {
  font-size: 16px;
  font-weight: 600;
  color: #1E293B;
  letter-spacing: 0.5px;
}
.dashboard-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-btn {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 12px;
}
.action-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(211, 47, 47, 0.1);
}
.action-btn:active {
  transform: translateY(0) scale(0.98);
}
.settings-btn { border-color: #E2E8F0; color: #64748B; }
.settings-btn:hover { border-color: #D32F2F; color: #D32F2F; background: #FEF2F2; }

.logout-btn {
  background-color: #D32F2F;
  color: #FFFFFF;
  border-color: #D32F2F;
}
.logout-btn:hover {
  background-color: #B91C1C;
  border-color: #B91C1C;
  box-shadow: 0 4px 12px rgba(211, 47, 47, 0.25);
}

/* ==========================================
   标签页栏
   ========================================== */
.page-tabs {
  position: relative;
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  gap: 6px;
  align-items: center;
  padding: 6px 16px;
  min-height: 36px;
  background: #FFFFFF;
}
.page-tabs::-webkit-scrollbar { display: none; }

.page-tabs::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: 0;
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg,
    rgba(211, 47, 47, 0) 0%,
    rgba(211, 47, 47, 0.8) 50%,
    rgba(211, 47, 47, 0) 100%
  );
  box-shadow: 0 2px 6px rgba(211, 47, 47, 0.15);
  z-index: 1;
}

.tab-item {
  font-size: 12px;
  height: 24px;
  line-height: 22px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid transparent;
  background: #F8FAFC;
  color: #64748B;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
}
.tab-item:hover {
  background: #F1F5F9;
  color: #1E293B;
  transform: translateY(-1px);
}
.tab-item.el-tag--danger {
  background: #FEF2F2;
  color: #D32F2F;
  border: 1px solid #FECACA;
  font-weight: 600;
}
.tab-item.el-tag--danger:hover {
  background: #FEE2E2;
  border-color: #FCA5A5;
  color: #B91C1C;
}

.tab-item .el-tag__close {
  color: #94A3B8;
  font-size: 12px;
  margin-left: 2px;
  opacity: 0;
  width: 0;
  transition: all 0.2s;
  overflow: hidden;
}
.tab-item:hover .el-tag__close {
  opacity: 1;
  width: 14px;
}
.tab-item.el-tag--danger .el-tag__close {
  color: #D32F2F;
}
.tab-item .el-tag__close:hover {
  background: rgba(211, 47, 47, 0.1);
  color: #B91C1C;
  border-radius: 50%;
}

/* ==========================================
   主内容区
   ========================================== */
.main-content {
  height: calc(100vh - 48px - 36px - 1px);
  max-height: calc(100vh - 48px - 36px - 1px);
  padding: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: #F8FAFC;
}

.content-wrapper {
  padding: 0 16px 16px 0;
  min-height: 100%;
}

/* ==========================================
   页面切换动画
   ========================================== */
.animate-fade-up {
  animation: fadeUp 0.5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(15px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 滚动条美化 */
.main-content::-webkit-scrollbar { width: 6px; }
.main-content::-webkit-scrollbar-track { background: transparent; }
.main-content::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }
.main-content::-webkit-scrollbar-thumb:hover { background: #94A3B8; }

h2 {
  margin: 0 0 12px 0;
  color: #1E293B;
  font-weight: 600;
}

/* ==========================================
   退出登录 · 模糊至黑屏 + 欢迎使用 + 放大快切
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
  /* 动画总时长 1.25s，与跳转时机对齐 */
  animation: goodbyeBlackout 1.25s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

/* 背景逐渐模糊 → 变黑：前 70% 完成，后面保持全黑等待文字放大 */
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

/* “欢迎使用”四个字：聚焦出现 → 停留一拍 → 放大淡出 */
.goodbye-text {
  position: relative;
  z-index: 2;
  margin: 0;
  font-family: inherit;
  font-size: 46px;
  font-weight: 700;
  letter-spacing: 14px;
  /* 文字本身的视觉居中（左缩进补足字距） */
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
  /* 阶段1：从模糊拉近聚焦 */
  0% {
    opacity: 0;
    filter: blur(20px);
    letter-spacing: 32px;
    transform: scale(1.1);
  }
  /* 阶段2：完全聚焦（动画"展示完成"） */
  55% {
    opacity: 1;
    filter: blur(0);
    letter-spacing: 14px;
    transform: scale(1);
  }
  /* 阶段3：停留一拍（卡点蓄力） */
  70% {
    opacity: 1;
    filter: blur(0);
    letter-spacing: 14px;
    transform: scale(1);
  }
  /* 阶段4：放大 + 淡出，与跳转同步 */
  100% {
    opacity: 0;
    filter: blur(4px);
    letter-spacing: 14px;
    transform: scale(4);
  }
}

/* ==========================================
   响应式
   ========================================== */
@media (max-width: 768px) {
  .goodbye-text {
    font-size: 28px;
    letter-spacing: 8px;
    text-indent: 8px;
  }
  @keyframes goodbyeTextFocus {
    0% {
      opacity: 0;
      filter: blur(16px);
      letter-spacing: 22px;
      transform: scale(1.1);
    }
    55% {
      opacity: 1;
      filter: blur(0);
      letter-spacing: 8px;
      transform: scale(1);
    }
    70% {
      opacity: 1;
      filter: blur(0);
      letter-spacing: 8px;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      filter: blur(4px);
      letter-spacing: 8px;
      transform: scale(4);
    }
  }
}
</style>

<!-- ===== 全局样式（用于 popover 和 确认框高斯模糊） ===== -->
<style>
.settings-popover {
  border: 1px solid #E2E8F0 !important;
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
  padding: 6px 12px !important;
  min-width: 80px !important;
  max-width: 110px !important;
}
.settings-popover .el-popover__title { display: none; }
.settings-option { color: #D32F2F !important; font-weight: 500; padding: 4px 0; }
.settings-option:hover { color: #B91C1C !important; background: transparent; }

.dirty-confirm-box .el-overlay-dialog {
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
.dirty-confirm-box .el-message-box {
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}
</style>