<template>
  <el-container style="height:100vh; overflow: hidden;">
    <!-- 侧边栏 -->
    <el-aside width="200px" class="sidebar-white">
      <SidebarMenu />
    </el-aside>
    <el-container>
      <!-- 顶部标题栏 -->
      <el-header class="dashboard-header">
        <div class="dashboard-title">车队管理平台</div>
        <div class="dashboard-actions">
          <!-- 设置按钮 + Popover -->
          <el-popover
            placement="bottom"
            :width="110"
            trigger="click"
            popper-class="settings-popover"
          >
            <template #reference>
              <el-button size="small" plain class="settings-btn">
                <el-icon><Setting /></el-icon>
                设置
              </el-button>
            </template>
            <div style="padding: 2px 0; text-align: center;">
              <el-button type="text" size="small" class="settings-option" @click="handleSettings">
                个人设置
              </el-button>
            </div>
          </el-popover>
          <el-button type="danger" size="small" plain @click="goLogin">退出登录</el-button>
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
        >
          {{ tab.title }}
        </el-tag>
      </div>

      <!-- 主内容区 -->
      <!-- 主内容区 -->
<el-main class="main-content">
  <!-- 全图监控 -->
  <template v-if="route.path === '/fullmap'">
    <FullMap />
  </template>
  <!-- 运单管理 -->
  <template v-else-if="route.path === '/waybill'">
    <Waybill />
  </template>
  <!-- 新建运单 -->
  <template v-else-if="route.path === '/waybill/create'">
    <WaybillCreate />
  </template>
  <!-- 车队运营报告 -->
  <template v-else-if="route.path === '/report'">
    <Report />
  </template>
  <!-- 其他页面（占位） -->
  <template v-else>
    <h2>{{ currentPage || '欢迎' }}</h2>
    <p>这是“{{ currentPage || '首页' }}”的占位内容。</p>
  </template>
</el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Setting } from '@element-plus/icons-vue'
import SidebarMenu from '../components/SidebarMenu.vue'
import FullMap from '../views/FullMap.vue'
import WaybillCreate from '../views/WaybillCreate.vue'
// 新增两个组件导入
import Waybill from '../views/Waybill.vue'
import Report from '../views/Report.vue'

const route = useRoute()
const router = useRouter()

// 页面路径与标题映射（新增两条）
const pathLabels = {
  '/dashboard': '监控中心',
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

const openTab = (tab) => {
  router.push(tab.path)
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

const goLogin = () => {
  router.push('/')
}

const handleSettings = () => {
  console.log('打开个人设置')
}
</script>

<style scoped>
/* ===== 全局 ===== */
.el-container {
  background: #f5f5f5;
}

/* ----- 侧边栏（白底） ----- */
.sidebar-white {
  background: #ffffff;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.06);
  border-right: 1px solid #e8e8e8;
}

.sidebar-white :deep(.el-menu) {
  background: #ffffff !important;
  border-right: none !important;
}

.sidebar-white :deep(.el-menu-item) {
  color: #333333 !important;
  background: #ffffff !important;
  height: 48px;
  line-height: 48px;
  font-size: 14px;
  border-bottom: 1px solid #f0f0f0;
  margin: 0;
  padding: 0 20px;
  transition: background 0.15s, color 0.15s;
}
.sidebar-white :deep(.el-menu-item:hover) {
  background: #f7f7f7 !important;
  color: #c8102e !important;
}
.sidebar-white :deep(.el-menu-item.is-active) {
  background: #c8102e !important;
  color: #ffffff !important;
  font-weight: 600;
  border-bottom-color: #c8102e;
}
.sidebar-white :deep(.el-menu-item.is-active:hover) {
  background: #b00d24 !important;
  color: #ffffff !important;
}

.sidebar-white :deep(.el-sub-menu .el-sub-menu__title) {
  color: #333333 !important;
  background: #ffffff !important;
  border-bottom: 1px solid #f0f0f0;
  height: 48px;
  line-height: 48px;
}
.sidebar-white :deep(.el-sub-menu .el-sub-menu__title:hover) {
  background: #f7f7f7 !important;
}
.sidebar-white :deep(.el-menu-item .el-menu-item) {
  padding-left: 40px !important;
}

/* ----- 顶部标题栏 ----- */
.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 44px;
  background: #ffffff;
  border-bottom: 2px solid #c8102e;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
}
.dashboard-title {
  font-size: 16px;
  font-weight: 700;
  color: #c8102e;
  letter-spacing: 0.5px;
}
.dashboard-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #333;
}

/* 设置按钮样式 */
.settings-btn {
  border-color: #c8102e;
  color: #c8102e;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.settings-btn:hover {
  background: #c8102e;
  color: #ffffff;
}

/* 退出登录按钮 */
.dashboard-actions .el-button--danger.is-plain {
  border-color: #c8102e;
  color: #c8102e;
}
.dashboard-actions .el-button--danger.is-plain:hover {
  background: #c8102e;
  color: #ffffff;
}

/* ----- 标签页栏 ----- */
.page-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  padding: 4px 20px;
  min-height: 32px;
  background: #ffffff;
  border-bottom: 1px solid #e8e8e8;
}
.page-tabs .el-tag {
  font-size: 12px;
  height: 24px;
  line-height: 20px;
  border-radius: 12px;
  cursor: pointer;
  border: 1px solid #d9d9d9;
  background: #fafafa;
  color: #555;
  transition: all 0.2s;
}
.page-tabs .el-tag:hover {
  border-color: #c8102e;
  color: #c8102e;
}
.page-tabs .el-tag--danger {
  background: #c8102e;
  border-color: #c8102e;
  color: #ffffff;
}
.page-tabs .el-tag--danger:hover {
  background: #a00d24;
  border-color: #a00d24;
}
.page-tabs .el-tag .el-tag__close {
  color: #999;
}
.page-tabs .el-tag--danger .el-tag__close {
  color: #ffffff;
}
.page-tabs .el-tag--danger .el-tag__close:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* ----- 主内容区 ----- */
.main-content {
  height: calc(100vh - 44px - 32px - 1px);
  max-height: calc(100vh - 44px - 32px - 1px);
  padding: 16px 20px;
  overflow: hidden;
  background: #ffffff;
}
.el-main > *,
.main-content > * {
  max-height: 100%;
  overflow: hidden;
}
h2 {
  margin: 0 0 12px 0;
  color: #c8102e;
  font-weight: 600;
}
</style>

<!-- ===== 全局样式（用于 popover） ===== -->
<style>
/* 设置弹窗样式：缩小尺寸，红色边框 */
.settings-popover {
  border: 2px solid #c8102e !important;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  padding: 6px 12px !important;
  min-width: 80px !important;
  max-width: 110px !important;
}
.settings-popover .el-popover__title {
  display: none;
}

/* 弹窗内 “个人设置” 文字红色 */
.settings-option {
  color: #c8102e !important;
  font-weight: 500;
  padding: 4px 0;
}
.settings-option:hover {
  color: #a00d24 !important;
  background: transparent;
}
</style>