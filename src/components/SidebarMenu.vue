<template>
  <div class="sidebar-wrap" :class="{ collapsed: !expanded }">
    <el-menu class="sidebar-menu" :default-active="activePath" unique-opened @select="handleSelect">
      <el-menu-item v-if="hasPerm('home')" index="/dashboard">
        <el-icon>
          <HomeFilled />
        </el-icon>
        <span class="menu-label">首页</span>
      </el-menu-item>

      <el-sub-menu v-if="hasPerm('driving_fullmap') || hasPerm('vehicle_fault') || hasPerm('appearance_inspect')"
        index="drive-management">
        <template #title>
          <el-icon>
            <Van />
          </el-icon>
          <span class="menu-label">行车管理</span>
        </template>
        <el-menu-item v-if="hasPerm('driving_fullmap')" index="/fullmap">全图监控</el-menu-item>
        <el-menu-item v-if="hasPerm('vehicle_fault')" index="/dashboard/车辆故障管理">车辆故障管理</el-menu-item>
        <el-menu-item v-if="hasPerm('appearance_inspect')" index="/dashboard/外观巡检管理">外观巡检管理</el-menu-item>
      </el-sub-menu>

      <el-sub-menu v-if="hasPerm('ele_fence')" index="ele-fence-management">
        <template #title>
          <el-icon>
            <Location />
          </el-icon>
          <span class="menu-label">电子围栏管理</span>
        </template>
        <el-menu-item index="/ele-fence/setting">围栏设置</el-menu-item>
        <el-menu-item index="/ele-fence/alert-setting">提醒设置</el-menu-item>
        <el-menu-item index="/ele-fence/alert-query">提醒事件查询</el-menu-item>
      </el-sub-menu>

      <el-sub-menu v-if="hasPerm('operation')" index="operation-management">
        <template #title>
          <el-icon>
            <DataLine />
          </el-icon>
          <span class="menu-label">运营管理</span>
        </template>
        <el-menu-item index="/operation/summary">综合报表</el-menu-item>
        <el-menu-item index="/operation/energy">能耗报告</el-menu-item>
        <el-menu-item index="/operation/driving">驾驶行为报表</el-menu-item>
      </el-sub-menu>

      <el-sub-menu v-if="hasPerm('waybill') || hasPerm('report') || hasPerm('route')" index="transport-management">
        <template #title>
          <el-icon>
            <Tickets />
          </el-icon>
          <span class="menu-label">运输管理</span>
        </template>
        <el-menu-item v-if="hasPerm('waybill')" index="/waybill">运单管理</el-menu-item>
        <el-menu-item index="/route/manage">路线管理</el-menu-item>
        <el-menu-item v-if="hasPerm('report')" index="/report">车队运营报告</el-menu-item>
      </el-sub-menu>

      <!-- ⭐ 费用管理：与「运输管理」平级；审批设置只有主账号能看到 -->
      <el-sub-menu v-if="showFeeMenu" index="fee-management">
        <template #title>
          <el-icon>
            <Wallet />
          </el-icon>
          <span class="menu-label">费用管理</span>
          <span v-if="todoApprove" class="menu-badge" :title="`待我审批 ${todoApprove} 笔`">{{ todoApprove }}</span>
        </template>
        <el-menu-item v-if="isMaster || hasPerm('fee_stats')" index="/fee/stats">费用统计</el-menu-item>
        <el-menu-item v-if="(isMaster || isFinance) && payoutOn" index="/fee/payout">
          <span class="mi-label">付款登记</span>
          <span v-if="todoPay" class="menu-badge sm" :title="`待付款 ${todoPay} 笔`">{{ todoPay }}</span>
        </el-menu-item>
        <el-menu-item v-if="isMaster" index="/fee/config">费用审批设置</el-menu-item>
      </el-sub-menu>

      <el-sub-menu v-if="hasPerm('vehicle_archive') || hasPerm('driver_archive')" index="base-data-management">
        <template #title>
          <el-icon>
            <User />
          </el-icon>
          <span class="menu-label">基础数据管理</span>
        </template>
        <el-menu-item v-if="hasPerm('vehicle_archive')" index="/vehicle-archive">车辆档案</el-menu-item>
        <el-menu-item v-if="hasPerm('driver_archive')" index="/driver-archive">司机档案</el-menu-item>
      </el-sub-menu>

      <!-- ⭐ 档案管理：和「系统管理」平级的一级菜单
           ⚠️ 和「路线管理」一样，新功能暂时不挂权限（历史客户的权限数据里还没有
           customer_archive / cargo_archive，一挂就整组菜单都不显示）。
           等权限数据补齐后再把 v-if="hasPerm('customer_archive')" 加回来。 -->
      <el-sub-menu index="archive-management">
        <template #title>
          <el-icon>
            <FolderOpened />
          </el-icon>
          <span class="menu-label">档案管理</span>
        </template>
        <el-menu-item index="/archive/customer">客户档案</el-menu-item>
        <el-menu-item index="/archive/cargo">货物档案</el-menu-item>
      </el-sub-menu>

      <el-sub-menu v-if="hasPerm('system')" index="system-management">
        <template #title>
          <el-icon>
            <Setting />
          </el-icon>
          <span class="menu-label">系统管理</span>
        </template>
        <el-menu-item index="/dashboard/user">用户管理</el-menu-item>
        <el-menu-item index="/dashboard/role">角色管理</el-menu-item>
        <el-menu-item index="/dashboard/org">组织管理</el-menu-item>
      </el-sub-menu>
    </el-menu>

    <!-- ⭐ 底部图钉：固定 / 取消固定 -->
    <div class="nav-pin" :class="{ on: pinned }" @click.stop="emit('toggle-pin')">
      <span class="pin-ic">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 4h6l-1 6 3 3H7l3-3-1-6Z" />
          <path d="M12 13v7" />
        </svg>
      </span>
      <span class="menu-label">{{ pinned ? '取消固定' : '固定菜单' }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { HomeFilled, Van, Location, DataLine, Tickets, User, Setting, FolderOpened, Wallet } from '@element-plus/icons-vue'
import { moduleFlags } from '@/utils/modules'

const props = defineProps({
  activePath: { type: String, required: true },
  expanded: { type: Boolean, default: false },
  pinned: { type: Boolean, default: false },
  /* ⭐ 费用待办角标（由 Dashboard 统一查，避免两处各打一遍接口） */
  todoApprove: { type: Number, default: 0 },
  todoPay: { type: Number, default: 0 },
})
const emit = defineEmits(['menuSelect', 'toggle-pin'])
const handleSelect = (index) => emit('menuSelect', index)

// ============================================================
// 权限控制
// ============================================================
const currentUser = (() => {
  try {
    return JSON.parse(localStorage.getItem('currentUser') || 'null')
  } catch { return null }
})()

// 客户端权限列表：null 表示不过滤（管理员或未登录 → 全部显示）
// ⭐ 空数组也视为"不过滤"（保持向后兼容）
const clientPerms = computed(() => {
  if (currentUser?.role !== 'customer') return null
  const list = currentUser?.permissions?.client
  if (!Array.isArray(list) || list.length === 0) return null  // ⭐ 空数组 / 非数组都全显示
  return list
})

const hasPerm = (key) => {
  if (clientPerms.value === null) return true
  return clientPerms.value.includes(key)
}

// ⭐ 主账号：客户身份且不是子账号（管理员模拟进入也视为可配）
const isMaster = computed(() => {
  if (!currentUser) return false
  if (currentUser.role === 'admin') return true
  return currentUser.role === 'customer' && !currentUser.isSubAccount
})

// 费用管理整组：主账号看全部；财务可进付款登记；其他人只有拿到 fee_stats 才显示
const isFinance = computed(() => String(currentUser?.roleName || '').includes('财务'))
const showFeeMenu = computed(() => isMaster.value || isFinance.value || hasPerm('fee_stats'))
// 付款登记是可配置模块：没开通就完全不显示入口
const payoutOn = computed(() => moduleFlags.payout === true)
</script>

<style scoped>
.sidebar-wrap {
  position: relative;
  height: 100%;
  background: #FFFFFF;
  overflow: hidden;
}

.nav-pin {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 10px;
  height: 34px;
  display: flex;
  align-items: center;
  border-radius: 8px;
  color: #94A3B8;
  cursor: pointer;
  transition: all .22s cubic-bezier(.34, 1.2, .64, 1);
  z-index: 3;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0), #fff 40%);
}

.nav-pin:hover {
  color: #475569;
  background: #F8FAFC;
  transform: translateY(-1px);
}

.nav-pin.on {
  color: #D32F2F;
  background: #FEF2F2;
}

.nav-pin .pin-ic {
  width: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  transition: transform .3s cubic-bezier(.34, 1.56, .64, 1);
}

.nav-pin:hover .pin-ic {
  transform: rotate(-12deg) scale(1.08);
}

.nav-pin.on .pin-ic {
  transform: rotate(0deg);
}

.sidebar-menu {
  height: calc(100% - 46px);
  border-right: none !important;
  background-color: #FFFFFF;
  padding: 10px 0 0;
  box-sizing: border-box;
  overflow-y: auto;
  overflow-x: hidden;
  width: 220px;
}

.sidebar-menu::-webkit-scrollbar {
  width: 4px;
}

.sidebar-menu::-webkit-scrollbar-track {
  background: transparent;
}

.sidebar-menu::-webkit-scrollbar-thumb {
  background: #E2E8F0;
  border-radius: 2px;
}

/* ⭐ 图标槽固定 48px：窄条时图标居中，展开时位置不跳 */
.sidebar-menu :deep(.el-menu-item),
.sidebar-menu :deep(.el-sub-menu__title) {
  height: 44px;
  line-height: 44px;
  color: #64748B;
  border-radius: 8px;
  margin: 4px 8px;
  position: relative;
  overflow: hidden;
  padding-left: 16px !important;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.sidebar-menu :deep(.el-menu-item .el-icon),
.sidebar-menu :deep(.el-sub-menu__title .el-icon) {
  margin-right: 10px;
  font-size: 17px;
  flex: 0 0 auto;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.3s;
}

.menu-label {
  white-space: nowrap;
  opacity: 1;
  transition: opacity .18s ease;
}

/* ⭐ 待办角标：父菜单（待我审批）与子项（待打款）共用 */
.menu-badge {
  margin-left: auto;
  min-width: 18px;
  height: 16px;
  padding: 0 5px;
  border-radius: 8px;
  background: #c8102e;
  color: #fff;
  font-size: 10.5px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
  flex: 0 0 auto;
  box-shadow: 0 2px 6px rgba(200, 16, 46, 0.28);
}

.menu-badge.sm {
  min-width: 16px;
  height: 15px;
  line-height: 15px;
  font-size: 10px;
  background: #D97706;
  box-shadow: 0 2px 6px rgba(217, 119, 6, 0.26);
}

.sidebar-wrap.collapsed .menu-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  min-width: 12px;
  height: 12px;
  padding: 0;
  font-size: 0;
  line-height: 12px;
  border-radius: 50%;
  box-shadow: 0 0 0 2px #fff;
}

/* 收起态角标要贴在本行右上角 */
.sidebar-wrap.collapsed .sidebar-menu :deep(.el-sub-menu__title),
.sidebar-wrap.collapsed .sidebar-menu :deep(.el-menu-item) {
  position: relative;
}

.sidebar-wrap.collapsed .menu-label {
  opacity: 0;
  pointer-events: none;
}

.sidebar-wrap.collapsed .sidebar-menu :deep(.el-sub-menu__icon-arrow) {
  opacity: 0;
}

.sidebar-menu :deep(.el-menu-item:hover .el-icon),
.sidebar-menu :deep(.el-sub-menu__title:hover .el-icon) {
  transform: scale(1.15) translateX(2px);
}

.sidebar-menu :deep(.el-sub-menu__icon-arrow) {
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.3s, opacity .18s;
}

.sidebar-menu :deep(.el-sub-menu.is-opened .el-sub-menu__icon-arrow) {
  transform: rotate(180deg);
}

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
  box-shadow: 0 0 8px rgba(211, 47, 47, 0.6);
  transform: translateY(-50%) scaleY(0);
  animation: elasticBar 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

@keyframes elasticBar {
  to {
    transform: translateY(-50%) scaleY(1);
  }
}

.sidebar-menu :deep(.el-sub-menu:has(.el-menu-item.is-active) .el-sub-menu__title) {
  color: #D32F2F !important;
  background-color: #FEF2F2 !important;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(211, 47, 47, 0.05);
}

.sidebar-menu :deep(.el-sub-menu:has(.el-menu-item.is-active) .el-sub-menu__icon-arrow) {
  color: #D32F2F;
}

.sidebar-menu :deep(.el-menu--inline) {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

/* 窄条时子菜单内容不占位（避免出现空白行） */
.sidebar-wrap.collapsed .sidebar-menu :deep(.el-menu--inline) {
  display: none;
}

.sidebar-menu :deep(.el-menu--inline .el-menu-item) {
  height: 38px;
  line-height: 38px;
  margin: 2px 8px 2px 24px;
  font-size: 13px;
  padding-left: 16px !important;
  transform-origin: top;
  animation: subMenuFadeIn 0.3s ease-out forwards;
}

@keyframes subMenuFadeIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.sidebar-menu :deep(.el-menu-item span),
.sidebar-menu :deep(.el-sub-menu__title span) {
  position: relative;
  z-index: 1;
}
</style>