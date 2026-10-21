<template>
  <el-container style="height:100vh; overflow: hidden; background-color: #F8FAFC;">
    <!-- 侧边栏：窄条 64px，悬停临时展开，图钉固定 -->
    <el-aside :width="navPinned ? '220px' : '64px'" class="sidebar-container">
      <div class="nav-shell" :class="{ expanded: navPinned || navHover, pinned: navPinned }"
        @mouseenter="navHover = true" @mouseleave="navHover = false">
        <SidebarMenu :active-path="activeMenu" :expanded="navPinned || navHover" :pinned="navPinned"
          :todo-approve="todo.approve" :todo-pay="canPayFee ? todo.pay : 0"
          @menu-select="handleMenuSelect" @toggle-pin="toggleNavPin" />
      </div>
    </el-aside>
    <el-container>
      <!-- 顶部标题栏 -->
      <el-header class="dashboard-header">
        <div class="dashboard-title">车队管理平台</div>
        <div class="dashboard-actions">
          <!-- ⭐ 费用待办：待我审批 + 待打款 合成一个红点 -->
          <div class="todo-wrap">
            <button class="todo-bell" :class="{ on: todoTotal > 0 }" title="费用待办" @click="todoOpen = !todoOpen">
              <el-icon><Bell /></el-icon>
              <span v-if="todoTotal" class="todo-dot">{{ todoTotal > 99 ? '99+' : todoTotal }}</span>
            </button>
            <div v-if="todoOpen" class="todo-mask" @click="todoOpen = false"></div>
            <div v-if="todoOpen" class="todo-panel">
              <div class="tp-head">
                <span>费用待办</span>
                <span class="tp-refresh" @click="loadTodo">刷新</span>
              </div>
              <div class="tp-row" @click="goTodo('approve')">
                <span class="tp-ic wait">审</span>
                <div class="tp-m"><b>待我审批</b><em>当前审批节点是我</em></div>
                <span class="tp-n">{{ todo.approve }}</span>
              </div>
              <div v-if="canPayFee" class="tp-row" @click="goTodo('pay')">
                <span class="tp-ic pay">付</span>
                <div class="tp-m"><b>待付款</b><em>已通过、还没登记付款</em></div>
                <span class="tp-n">{{ todo.pay }}</span>
              </div>
              <div v-if="!todoTotal" class="tp-empty">暂无待办</div>
            </div>
          </div>

          <el-button size="small" plain class="action-btn settings-btn" @click="handleSettings">
            <el-icon>
              <Setting />
            </el-icon> 设置
          </el-button>

          <el-button v-if="isImpersonatingAdmin" size="small" plain class="action-btn back-btn" @click="goBackToPortal">
            返回入口
          </el-button>

          <el-button type="danger" size="small" plain class="action-btn logout-btn" @click="goLogin">退出登录</el-button>
        </div>
      </el-header>

      <!-- 标签页栏 -->
      <div class="page-tabs">
        <el-tag v-for="tab in tabs" :key="tab.path" :type="tab.path === route.path ? 'danger' : 'info'" size="small"
          closable @click="openTab(tab)" @close="closeTab(tab)" class="tab-item">
          {{ tab.title }}
        </el-tag>
      </div>

      <!-- 主内容区 -->
      <el-main class="main-content">
        <div v-if="!isPermitted" class="no-permission">
          <div class="no-permission-icon">🔒</div>
          <h2>暂无访问权限</h2>
          <p>您当前账号未开通「{{ currentPage }}」功能的访问权限</p>
          <button class="back-btn-home" @click="goHome">返回首页</button>
        </div>

        <div v-else class="content-wrapper animate-fade-up">
          <!-- 客户端首页 -->
          <template v-if="isClientHome">
            <ClientHome />
          </template>

          <!-- 全图监控 -->
          <template v-else-if="isFullMap">
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
          <!-- ⭐ 业务流程画布 -->
          <template v-else-if="route.path === '/flow/canvas'">
            <FlowCanvas />
          </template>
          <!-- ⭐ 费用管理 -->
          <template v-else-if="route.path === '/fee/stats'">
            <FeeStats />
          </template>
          <template v-else-if="route.path === '/fee/payout'">
            <FeePayout />
          </template>
          <template v-else-if="route.path === '/fee/config'">
            <FeeApprovalSetting />
          </template>
          <!-- ⭐ 路线管理 -->
          <template v-else-if="route.path === '/route/manage'">
            <RouteManage />
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

          <!-- ⭐ 档案管理 -->
          <template v-else-if="route.path === '/archive/customer'">
            <CustomerArchive />
          </template>
          <template v-else-if="route.path === '/archive/cargo'">
            <CargoArchive />
          </template>

          <!-- 运营管理 -->
          <template v-else-if="route.path === '/operation/summary'">
            <OperationSummary />
          </template>
          <template v-else-if="route.path === '/operation/energy'">
            <OperationEnergy />
          </template>
          <template v-else-if="route.path === '/operation/energy/report'">
            <EnergyReportDetail />
          </template>
          <template v-else-if="route.path === '/operation/driving'">
            <OperationDriving />
          </template>

          <!-- 电子围栏管理 -->
          <template v-else-if="route.path === '/ele-fence/setting'">
            <EleFenceSetting />
          </template>
          <template v-else-if="route.path === '/ele-fence/alert-setting'">
            <EleFenceAlertSetting />
          </template>
          <template v-else-if="route.path === '/ele-fence/alert-query'">
            <EleFenceAlertQuery />
          </template>
          <!-- 系统管理 -->
          <template v-else-if="route.path === '/dashboard/user'">
            <UserManage />
          </template>
          <template v-else-if="route.path === '/dashboard/role'">
            <RoleManage />
          </template>
          <template v-else-if="route.path === '/dashboard/org'">
            <OrgManage />
          </template>

          <!-- 其他页面（占位） -->
          <template v-else>
            <h2>{{ currentPage || '欢迎' }}</h2>
            <p>这是"{{ currentPage || '首页' }}"的占位内容。</p>
          </template>
        </div>
      </el-main>
    </el-container>

    <!-- ========== 个人设置弹窗 ========== -->
    <PersonalSettings v-model="settingsVisible" />

    <!-- ========== 退出登录动画 ========== -->
    <div v-if="showGoodbye" class="goodbye-overlay">
      <h1 class="goodbye-text">感谢使用</h1>
    </div>
  </el-container>
</template>

<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import { Setting, Bell } from '@element-plus/icons-vue'
import SidebarMenu from '../components/SidebarMenu.vue'
import PersonalSettings from '../components/PersonalSettings.vue'
import ClientHome from '../views/ClientHome.vue'
import FullMap from '../views/FullMap.vue'
import WaybillCreate from '../views/WaybillCreate.vue'
import Waybill from '../views/Waybill.vue'
import Report from '../views/Report.vue'
import VehicleArchive from '../views/VehicleArchive.vue'
import DriverArchive from '../views/DriverArchive.vue'
import CustomerArchive from '../views/CustomerArchive.vue'
import CargoArchive from '../views/CargoArchive.vue'

import EleFenceSetting from '../views/EleFenceSetting.vue'
import EleFenceAlertSetting from '../views/EleFenceAlertSetting.vue'
import EleFenceAlertQuery from '../views/EleFenceAlertQuery.vue'

// ⭐ 运营管理
import OperationSummary from '../views/OperationSummary.vue'
import OperationEnergy from '../views/OperationEnergy.vue'
import EnergyReportDetail from '../views/EnergyReportDetail.vue'
import OperationDriving from '../views/OperationDriving.vue'

import UserManage from '../views/UserManage.vue'
import RoleManage from '../views/RoleManage.vue'
import OrgManage from '../views/OrgManage.vue'

// ⭐ 路线管理
import RouteManage from '../views/RouteManage.vue'
import FeeStats from '../views/FeeStats.vue'
import FeePayout from '../views/FeePayout.vue'
import FeeApprovalSetting from '../views/FeeApprovalSetting.vue'
import FlowCanvas from '../views/FlowCanvas.vue'
import { fetchFeeTodo, isPayer } from '@/utils/feeTodo'
import { moduleFlags, ensureModuleFlags } from '@/utils/modules'

const route = useRoute()
const router = useRouter()
const waybillCreateRef = ref(null)

const activeMenu = ref(route.path)

// ============================================================
// 当前用户 & 权限
// ============================================================
const currentUser = (() => {
  try {
    return JSON.parse(localStorage.getItem('currentUser') || 'null')
  } catch { return null }
})()

// 👇 原始登录用户（判断是否管理员模拟进入客户端）
const originalUser = (() => {
  try {
    return JSON.parse(localStorage.getItem('originalUser') || 'null')
  } catch { return null }
})()

// 👇 是否由管理员模拟进入客户端
const isImpersonatingAdmin = computed(() => {
  return originalUser?.role === 'admin' && currentUser?.role === 'customer'
})

// 👇 返回入口（恢复管理员身份后跳 /portal）
const goBackToPortal = () => {
  if (originalUser) {
    localStorage.setItem('currentUser', JSON.stringify(originalUser))
  }
  router.push('/portal')
}

const clientPerms = computed(() => {
  if (currentUser?.role !== 'customer') return null
  return currentUser?.permissions?.client || []
})

// 路由 → 权限 key
const routePermissionMap = {
  '/dashboard': 'home',
  '/fullmap': 'driving_fullmap',
  '/dashboard/车辆故障管理': 'vehicle_fault',
  '/dashboard/外观巡检管理': 'appearance_inspect',
  '/ele-fence/setting': 'ele_fence',
  '/ele-fence/alert-setting': 'ele_fence',
  '/ele-fence/alert-query': 'ele_fence',
  '/dashboard/运营管理': 'operation',
  '/operation/summary': 'operation',
  '/operation/energy': 'operation',
  '/operation/energy/report': 'operation',
  '/operation/driving': 'operation',
  '/waybill': 'waybill',
  '/waybill/create': 'waybill',
  '/waybill/detail': 'waybill',
  '/fee/stats': 'fee_stats',
  // ⭐ 路线管理暂时不做权限限制（新功能，等业务明确后再加 'route'）
  // '/route/manage': 'route',
  '/report': 'report',
  '/vehicle-archive': 'vehicle_archive',
  '/driver-archive': 'driver_archive',
  // ⭐ 档案管理暂时不做权限限制（新功能，等权限数据补齐后再放开这两行）
  // '/archive/customer': 'customer_archive',
  // '/archive/cargo': 'cargo_archive',
  // '/dashboard/档案管理': 'customer_archive',
  '/dashboard/系统管理': 'system',
  '/dashboard/user': 'system',
  '/dashboard/role': 'system',
  '/dashboard/org': 'system',
}

// ⭐ 主账号：客户身份且不是子账号（管理员模拟进入也放行，便于配置）
const isMaster = computed(() => {
  if (!currentUser) return false
  if (currentUser.role === 'admin') return true
  return currentUser.role === 'customer' && !currentUser.isSubAccount
})

// ⭐ 财务：角色名里带「财务」即可登记付款（与审批链「找财务」同一口径）
const isFinance = computed(() => String(currentUser?.roleName || '').includes('财务'))

/* ⭐ 模块闸门：菜单藏掉之外的第二道（直接敲 URL / 收藏夹进来）
   管理员在 modules.js 里被当作全开，所以这里不影响服务商 */
const MODULE_GATE = {
  '/waybill': 'waybill',
  '/waybill/create': 'waybill',
  '/waybill/detail': 'waybill',
  '/route/manage': 'route',
  '/report': 'report',
  '/fee/payout': 'payout',
}

const isPermitted = computed(() => {
  if (clientPerms.value === null) return true
  const gate = MODULE_GATE[route.path]
  if (gate && moduleFlags[gate] !== true && moduleFlags.waybill !== undefined) return false
  if (route.path === '/dashboard' && !route.params.page) return true
  // 业务流程画布：主账号可进（管理员可编辑，客户只读调参）
  if (route.path === '/flow/canvas') return isMaster.value
  // 费用审批设置只给主账号：不看权限 key，避免被误配给其他角色
  if (route.path === '/fee/config') return isMaster.value
  // 付款登记：主账号 + 财务 + 模块已开通（其余人看不到入口，也别让他们直接敲地址）
  if (route.path === '/fee/payout') return (isMaster.value || isFinance.value) && moduleFlags.payout
  // 费用统计：主账号始终可见；其他人看功能配置
  if (route.path === '/fee/stats') return isMaster.value || clientPerms.value.includes('fee_stats')
  const permKey = routePermissionMap[route.path]
  if (!permKey) return true
  return clientPerms.value.includes(permKey)
})

watch(isPermitted, (val) => {
  if (!val) {
    ElMessage.warning('您没有权限访问该页面')
    setTimeout(() => {
      router.replace('/dashboard')
    }, 1200)
  }
}, { immediate: false })

const goHome = () => router.push('/dashboard')

// ============================================================
// ⭐ 费用待办角标：待我审批 + 待付款
//    ⚠️ 和「运单列表 → 待我审批」「付款登记」同一口径（utils/feeTodo.js），
//       别在这里另写一套 flow 判断。
// ============================================================
const todoOpen = ref(false)
const todo = ref({ approve: 0, pay: 0 })
const canPayFee = computed(() => isPayer(currentUser) && moduleFlags.payout === true)
const todoTotal = computed(() =>
  Number(todo.value.approve || 0) + (canPayFee.value ? Number(todo.value.pay || 0) : 0)
)

const loadTodo = async () => {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  /* 模块开关先就位：付款登记没开通时，待付款这一项不该出现 */
  await ensureModuleFlags(currentUser)
  todo.value = await fetchFeeTodo(currentUser)
}

const goTodo = (kind) => {
  todoOpen.value = false
  if (kind === 'pay') {
    router.push('/fee/payout')
    return
  }
  router.push({ path: '/waybill', query: { mine: '1' } })
}

let todoTimer = null
onMounted(() => {
  loadTodo()
  todoTimer = setInterval(loadTodo, 60000)
})
onBeforeUnmount(() => {
  if (todoTimer) clearInterval(todoTimer)
  todoTimer = null
})
watch(() => route.path, () => { loadTodo() })

// ============================================================
// 页面识别
// ============================================================
const isClientHome = computed(() => {
  return route.path === '/dashboard' && !route.params.page
})

const isFullMap = computed(() => {
  return route.path === '/fullmap' || route.params.page === 'fullmap'
})

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
  '/dashboard': '首页',
  '/fullmap': '全图监控',
  '/dashboard/车辆故障管理': '车辆故障管理',
  '/dashboard/外观巡检管理': '外观巡检管理',
  '/dashboard/电子围栏管理': '电子围栏管理',
  '/dashboard/运营管理': '运营管理',
  '/operation/summary': '综合报表',
  '/operation/energy': '能耗报告',
  '/operation/energy/report': '能耗报告',
  '/operation/driving': '驾驶行为报表',
  '/dashboard/运输管理': '运输管理',
  '/dashboard/基础数据管理': '基础数据管理',
  '/dashboard/系统管理': '系统管理',
  '/waybill': '运单管理',
  // ⭐ 路线管理标签
  '/route/manage': '路线管理',
  '/report': '车队运营报告',
  '/flow/canvas': '业务流程',
  '/waybill/create': '新建运单',
  '/fee/stats': '费用统计',
  '/fee/payout': '付款登记',
  '/fee/config': '费用审批设置',
  '/vehicle-archive': '车辆档案',
  '/driver-archive': '司机档案',
  '/archive/customer': '客户档案',
  '/archive/cargo': '货物档案',
  '/dashboard/档案管理': '档案管理',
  '/ele-fence/setting': '围栏设置',
  '/ele-fence/alert-setting': '提醒设置',
  '/ele-fence/alert-query': '提醒事件查询',
  '/dashboard/user': '用户管理',
  '/dashboard/role': '角色管理',
  '/dashboard/org': '组织管理',
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

// ============================================================
// ⭐ 左侧导航：窄条 / 悬停临时展开 / 图钉固定
// ============================================================
const navPinned = ref(localStorage.getItem('nav_pinned') === '1')
const navHover = ref(false)
const toggleNavPin = () => {
  navPinned.value = !navPinned.value
  localStorage.setItem('nav_pinned', navPinned.value ? '1' : '0')
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
// 个人设置
// ============================================================
const settingsVisible = ref(false)
const handleSettings = () => { settingsVisible.value = true }

// ============================================================
// 退出登录 · 模糊至黑屏 + 感谢使用 + 放大快切
// ============================================================
const showGoodbye = ref(false)

const goLogin = () => {
  if (showGoodbye.value) return
  showGoodbye.value = true
  setTimeout(() => {
    localStorage.removeItem('originalUser')
    router.push('/')
    setTimeout(() => { showGoodbye.value = false }, 200)
  }, 1250)
}
</script>

<style scoped>
.el-container {
  background-color: #F8FAFC;
}

.sidebar-container {
  background: #FFFFFF;
  box-shadow: 1px 0 8px rgba(0, 0, 0, 0.03);
  border-right: 1px solid #E2E8F0;
  z-index: 30;
  overflow: visible !important;
  position: relative;
  transition: width .28s cubic-bezier(.34, 1.2, .64, 1) !important;
}

/* ⭐ 窄条导航：默认 64px；悬停/固定时展开为 220px（悬停是浮层，不推挤右侧内容） */
.nav-shell {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 64px;
  background: #FFFFFF;
  overflow: hidden;
  transition: width .28s cubic-bezier(.34, 1.2, .64, 1), box-shadow .28s ease;
  z-index: 31;
}

.nav-shell.expanded {
  width: 220px;
}

.nav-shell.expanded:not(.pinned) {
  box-shadow: 14px 0 36px rgba(15, 23, 42, .12);
}

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

/* ===== 费用待办：铃铛 + 下拉面板 ===== */
.todo-wrap {
  position: relative;
}

.todo-bell {
  position: relative;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #E2E8F0;
  background: #fff;
  border-radius: 8px;
  color: #64748B;
  font-size: 15px;
  cursor: pointer;
  padding: 0;
  transition: all 0.2s;
}

.todo-bell:hover {
  border-color: #c8102e;
  color: #c8102e;
  background: #FEF2F2;
}

.todo-bell.on {
  color: #c8102e;
  border-color: #FBD5DB;
  background: #FEF2F2;
}

.todo-dot {
  position: absolute;
  top: -5px;
  right: -6px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: #c8102e;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
  box-shadow: 0 2px 6px rgba(200, 16, 46, 0.35);
}

.todo-mask {
  position: fixed;
  inset: 0;
  z-index: 50;
}

.todo-panel {
  position: absolute;
  top: 38px;
  right: 0;
  width: 268px;
  z-index: 51;
  background: #fff;
  border: 1px solid #E8EDF4;
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.14);
  padding: 8px;
}

.tp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px 8px;
  font-size: 12.5px;
  font-weight: 700;
  color: #0F172A;
  border-bottom: 1px solid #F1F5F9;
  margin-bottom: 4px;
}

.tp-refresh {
  font-size: 11.5px;
  font-weight: 500;
  color: #94A3B8;
  cursor: pointer;
}

.tp-refresh:hover { color: #c8102e; }

.tp-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 7px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.18s;
}

.tp-row:hover { background: #F8FAFC; }

.tp-ic {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex: 0 0 auto;
}

.tp-ic.wait { background: #FEF2F2; color: #c8102e; }
.tp-ic.pay { background: #FFFBEB; color: #B45309; }

.tp-m {
  flex: 1;
  min-width: 0;
}

.tp-m b {
  display: block;
  font-size: 12.5px;
  color: #0F172A;
}

.tp-m em {
  display: block;
  font-style: normal;
  font-size: 11px;
  color: #94A3B8;
  margin-top: 1px;
}

.tp-n {
  font-size: 14px;
  font-weight: 700;
  color: #c8102e;
  font-family: var(--num-font, monospace);
}

.tp-empty {
  padding: 14px 6px 8px;
  text-align: center;
  font-size: 12px;
  color: #94A3B8;
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

.settings-btn {
  border-color: #E2E8F0;
  color: #64748B;
}

.settings-btn:hover {
  border-color: #D32F2F;
  color: #D32F2F;
  background: #FEF2F2;
}

.back-btn {
  border-color: #E2E8F0 !important;
  color: #64748B !important;
  background: #FFFFFF !important;
}

.back-btn:hover {
  border-color: #D32F2F !important;
  color: #D32F2F !important;
  background: #FEF2F2 !important;
  transform: translateY(-1px) !important;
  box-shadow: 0 4px 12px rgba(211, 47, 47, 0.12) !important;
}

.back-btn:active {
  transform: translateY(0) scale(0.98) !important;
}

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

/* 标签栏 */
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

.page-tabs::-webkit-scrollbar {
  display: none;
}

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
      rgba(211, 47, 47, 0) 100%);
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

.content-wrapper:has(.client-home),
.content-wrapper:has(.fullmap),
.content-wrapper:has(.summary-page),
.content-wrapper:has(.placeholder-page) {
  padding: 0;
}

/* ⭐ 业务流程画布：整页定高，画布区自己横向滚动 */
.content-wrapper:has(.flow-page) {
  padding: 0;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
}

/* ⭐ 组织管理：整页固定高度，页面本身不滚动（内部左右两栏各自滚） */
.content-wrapper:has(.org-manage-page) {
  padding: 0;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
}

/* ⭐ 用户管理：同上，表格改内部滚动 */
.content-wrapper:has(.user-manage-page) {
  padding: 0;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
}

/* ⭐ 档案管理（客户档案 / 货物档案）：整页定高，内部各自滚 */
.content-wrapper:has(.customer-archive-page),
.content-wrapper:has(.cargo-archive-page) {
  padding: 0;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
}

/* ⭐ 能耗报告：列表页整页定高、表格内部滚；详情是长报告，交给外壳滚 */
.content-wrapper:has(.energy-report-page) {
  padding: 0;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
}

.content-wrapper:has(.energy-report-detail-page) {
  padding: 0;
}

.animate-fade-up {
  animation: fadeUp 0.5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
}

@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(15px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.main-content::-webkit-scrollbar {
  width: 6px;
}

.main-content::-webkit-scrollbar-track {
  background: transparent;
}

.main-content::-webkit-scrollbar-thumb {
  background: #CBD5E1;
  border-radius: 3px;
}

.main-content::-webkit-scrollbar-thumb:hover {
  background: #94A3B8;
}

h2 {
  margin: 0 0 12px 0;
  color: #1E293B;
  font-weight: 600;
}

/* 无权限提示 */
.no-permission {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: 14px;
  padding: 40px 20px;
  animation: noPermIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes noPermIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.no-permission-icon {
  font-size: 64px;
  line-height: 1;
  filter: drop-shadow(0 6px 16px rgba(200, 16, 46, 0.25));
  animation: noPermFloat 3s ease-in-out infinite;
}

@keyframes noPermFloat {

  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-10px);
  }
}

.no-permission h2 {
  font-size: 20px;
  color: #0F172A;
  margin: 0;
}

.no-permission p {
  font-size: 13px;
  color: #64748B;
  margin: 0;
}

.back-btn-home {
  margin-top: 8px;
  padding: 10px 28px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #FFFFFF;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(200, 16, 46, 0.3);
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: inherit;
}

.back-btn-home:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(200, 16, 46, 0.45);
}

/* 退出登录动画 */
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

<!-- ===== 全局样式 ===== -->
<style>
.settings-popover {
  border: 1px solid #E2E8F0 !important;
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
  padding: 6px 12px !important;
  min-width: 80px !important;
  max-width: 110px !important;
}

.settings-popover .el-popover__title {
  display: none;
}

.settings-option {
  color: #D32F2F !important;
  font-weight: 500;
  padding: 4px 0;
}

.settings-option:hover {
  color: #B91C1C !important;
  background: transparent;
}

.dirty-confirm-box .el-overlay-dialog {
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.dirty-confirm-box .el-message-box {
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}

.light-panel {
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 12px;
  padding: 18px 20px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.04);
  transition: box-shadow 0.3s;
}

.light-panel:hover {
  box-shadow: 0 6px 22px rgba(15, 23, 42, 0.06);
}

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
  width: 8px;
  height: 8px;
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
</style>