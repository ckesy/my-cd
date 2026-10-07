<template>
  <el-menu
    class="sidebar-menu"
    :default-active="activePath"
    unique-opened
    @select="handleSelect"
  >
    <el-menu-item index="/dashboard">
      <el-icon><Monitor /></el-icon>
      <span>监控中心</span>
    </el-menu-item>

    <el-sub-menu index="drive-management">
      <template #title>
        <el-icon><Van /></el-icon>
        <span>行车管理</span>
      </template>
      <el-menu-item index="/fullmap">全图监控</el-menu-item>
      <el-menu-item index="/dashboard/车辆故障管理">车辆故障管理</el-menu-item>
      <el-menu-item index="/dashboard/外观巡检管理">外观巡检管理</el-menu-item>
    </el-sub-menu>

    <!-- 👇 新增：电子围栏管理模块 -->
    <el-sub-menu index="ele-fence-management">
      <template #title>
        <el-icon><Location /></el-icon>
        <span>电子围栏管理</span>
      </template>
      <el-menu-item index="/ele-fence/setting">围栏设置</el-menu-item>
      <el-menu-item index="/ele-fence/alert-setting">提醒设置</el-menu-item>
      <el-menu-item index="/ele-fence/alert-query">提醒事件查询</el-menu-item>
    </el-sub-menu>

    <el-menu-item index="/dashboard/运营管理">
      <el-icon><DataLine /></el-icon>
      <span>运营管理</span>
    </el-menu-item>

    <el-sub-menu index="transport-management">
      <template #title>
        <el-icon><Tickets /></el-icon>
        <span>运输管理</span>
      </template>
      <el-menu-item index="/waybill">运单管理</el-menu-item>
      <el-menu-item index="/report">车队运营报告</el-menu-item>
    </el-sub-menu>

    <el-sub-menu index="base-data-management">
      <template #title>
        <el-icon><User /></el-icon>
        <span>基础数据管理</span>
      </template>
      <el-menu-item index="/vehicle-archive">车辆档案</el-menu-item>
      <el-menu-item index="/driver-archive">司机档案</el-menu-item>
    </el-sub-menu>

    <el-menu-item index="/dashboard/系统管理">
      <el-icon><Setting /></el-icon>
      <span>系统管理</span>
    </el-menu-item>
  </el-menu>
</template>

<script setup>
import { Monitor, Van, Location, DataLine, Tickets, User, Setting } from '@element-plus/icons-vue'

defineProps({
  activePath: { type: String, required: true }
})
const emit = defineEmits(['menuSelect'])
const handleSelect = (index) => emit('menuSelect', index)
</script>

<style scoped>
/* ==========================================
   侧边栏基础与滚动条
   ========================================== */
.sidebar-menu {
  height: 100%;
  border-right: none !important;
  background-color: #FFFFFF;
  padding: 12px 8px;
  box-sizing: border-box;
  overflow-y: auto;
  overflow-x: hidden;
}
.sidebar-menu::-webkit-scrollbar { width: 4px; }
.sidebar-menu::-webkit-scrollbar-track { background: transparent; }
.sidebar-menu::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 2px; }

/* ==========================================
   基础菜单项与通用交互
   ========================================== */
.sidebar-menu :deep(.el-menu-item),
.sidebar-menu :deep(.el-sub-menu__title) {
  height: 44px;
  line-height: 44px;
  color: #64748B;
  border-radius: 8px;
  margin: 4px 8px;
  position: relative;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* 图标间距与微动效 */
.sidebar-menu :deep(.el-menu-item .el-icon),
.sidebar-menu :deep(.el-sub-menu__title .el-icon) {
  margin-right: 10px;
  font-size: 16px;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.3s;
}
.sidebar-menu :deep(.el-menu-item:hover .el-icon),
.sidebar-menu :deep(.el-sub-menu__title:hover .el-icon) {
  transform: scale(1.15) translateX(2px);
}

/* 展开箭头旋转动画 */
.sidebar-menu :deep(.el-sub-menu__icon-arrow) {
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.3s;
}
.sidebar-menu :deep(.el-sub-menu.is-opened .el-sub-menu__icon-arrow) {
  transform: rotate(180deg);
}

/* ==========================================
   👇 核心动画1：光晕扩散效果 (Hover)
   ========================================== */
.sidebar-menu :deep(.el-menu-item)::before,
.sidebar-menu :deep(.el-sub-menu__title)::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 120%;
  height: 120%;
  background: radial-gradient(circle, rgba(211, 47, 47, 0.08) 0%, transparent 70%);
  transform: translate(-50%, -50%) scale(0.5);
  opacity: 0;
  transition: transform 0.4s ease-out, opacity 0.3s;
  pointer-events: none;
  z-index: 0;
}
.sidebar-menu :deep(.el-menu-item:hover)::before,
.sidebar-menu :deep(.el-sub-menu__title:hover)::before {
  transform: translate(-50%, -50%) scale(1);
  opacity: 1;
}
.sidebar-menu :deep(.el-menu-item:hover),
.sidebar-menu :deep(.el-sub-menu__title:hover) {
  background-color: transparent !important;
  color: #D32F2F !important;
  transform: translateX(4px);
}

/* ==========================================
   👇 核心动画2：弹性滑入的左侧红条 (Active)
   ========================================== */
.sidebar-menu :deep(.el-menu-item.is-active),
.sidebar-menu :deep(.el-sub-menu .el-menu-item.is-active) {
  background-color: #FEF2F2 !important;
  color: #D32F2F !important;
  font-weight: 600;
}
.sidebar-menu :deep(.el-menu-item.is-active)::after,
.sidebar-menu :deep(.el-sub-menu .el-menu-item.is-active)::after {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  height: 20px;
  width: 3px;
  background: #D32F2F;
  border-radius: 0 4px 4px 0;
  box-shadow: 0 0 8px rgba(211, 47, 47, 0.6); /* 红条发光 */
  transform: translateY(-50%) scaleY(0);
  animation: elasticBar 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
@keyframes elasticBar {
  to { transform: translateY(-50%) scaleY(1); }
}

/* 子菜单选中时，父级标题的轻微高亮和发光 */
.sidebar-menu :deep(.el-sub-menu:has(.el-menu-item.is-active) .el-sub-menu__title) {
  color: #D32F2F !important;
  background-color: #FEF2F2 !important;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(211, 47, 47, 0.05);
}
.sidebar-menu :deep(.el-sub-menu:has(.el-menu-item.is-active) .el-sub-menu__icon-arrow) {
  color: #D32F2F;
}

/* ==========================================
   👇 核心动画3：子菜单展开的平滑坠落 (Staggered)
   ========================================== */
.sidebar-menu :deep(.el-menu--inline) {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}
.sidebar-menu :deep(.el-menu--inline .el-menu-item) {
  height: 38px;
  line-height: 38px;
  margin: 2px 8px 2px 24px;
  font-size: 13px;
  transform-origin: top;
  animation: subMenuFadeIn 0.3s ease-out forwards;
}
@keyframes subMenuFadeIn {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 确保文字在光晕之上 */
.sidebar-menu :deep(.el-menu-item span),
.sidebar-menu :deep(.el-sub-menu__title span) {
  position: relative;
  z-index: 1;
}
</style>