import { createRouter, createWebHistory } from 'vue-router'
import WaybillDetail from '@/views/waybill-detail.vue'

const routes = [
  {
    path: '/',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
  },
  {
    path: '/dashboard/:page?',
    name: 'Dashboard',
    component: () => import('../views/Dashboard.vue'),
  },
  {
    path: '/fullmap',
    name: 'FullMap',
    component: () => import('../views/Dashboard.vue'),
  },
  {
    path: '/waybill',
    name: 'Waybill',
    component: () => import('../views/Dashboard.vue'),
  },
  {
    path: '/report',
    name: 'Report',
    component: () => import('../views/Dashboard.vue'),
  },
  {
    path: '/waybill/create',
    name: 'WaybillCreate',
    component: () => import('../views/Dashboard.vue'),
  },
  // ⭐ 费用管理（与运输管理平级）
  // ⭐ 业务流程画布（管理员可编辑 / 客户只读调参）
  {
    path: '/flow/canvas',
    name: 'FlowCanvas',
    component: () => import('../views/Dashboard.vue'),
  },
  {
    path: '/fee/stats',
    name: 'FeeStats',
    component: () => import('../views/Dashboard.vue'),
  },
  {
    path: '/fee/config',
    name: 'FeeApprovalSetting',
    component: () => import('../views/Dashboard.vue'),
  },
  {
    path: '/fee/payout',
    name: 'FeePayout',
    component: () => import('../views/Dashboard.vue'),
  },
  {
    path: '/waybill/detail',
    name: 'WaybillDetail',
    component: WaybillDetail,
  },
  {
    path: '/vehicle-archive',
    name: 'VehicleArchive',
    component: () => import('../views/Dashboard.vue'),
  },
  {
    path: '/driver-archive',
    name: 'DriverArchive',
    component: () => import('../views/Dashboard.vue'),
  },

  // ⭐ 路线管理（客户端布局，和 waybill 平级）
  {
    path: '/route/manage',
    name: 'RouteManage',
    component: () => import('../views/Dashboard.vue'),
  },

  // ==========================================
  // 👇 电子围栏管理模块
  // ==========================================
  {
    path: '/ele-fence',
    name: 'EleFence',
    redirect: '/ele-fence/setting',
    meta: { title: '电子围栏管理', icon: 'Location' },
    children: [
      {
        path: 'setting',
        name: 'EleFenceSetting',
        component: () => import('../views/Dashboard.vue'),
        meta: { title: '围栏设置' }
      },
      {
        path: 'alert-setting',
        name: 'EleFenceAlertSetting',
        component: () => import('../views/Dashboard.vue'),
        meta: { title: '提醒设置' }
      },
      {
        path: 'alert-query',
        name: 'EleFenceAlertQuery',
        component: () => import('../views/Dashboard.vue'),
        meta: { title: '提醒事件查询' }
      }
    ]
  },

  // ==========================================
  // 👇 运营管理（综合报表 / 能耗报告 / 驾驶行为报表）
  // ==========================================
  {
    path: '/operation',
    name: 'Operation',
    redirect: '/operation/summary',
    meta: { title: '运营管理', icon: 'DataLine' },
    children: [
      {
        path: 'summary',
        name: 'OperationSummary',
        component: () => import('../views/Dashboard.vue'),
        meta: { title: '综合报表' }
      },
      {
        path: 'energy',
        name: 'OperationEnergy',
        component: () => import('../views/Dashboard.vue'),
        meta: { title: '能耗报告' }
      },
      {
        // ⭐ 报告详情（挂在同一个外壳里，左侧菜单不变）
        path: 'energy/report',
        name: 'EnergyReportDetail',
        component: () => import('../views/Dashboard.vue'),
        meta: { title: '能耗报告' }
      },
      {
        path: 'driving',
        name: 'OperationDriving',
        component: () => import('../views/Dashboard.vue'),
        meta: { title: '驾驶行为报表' }
      }
    ]
  },

  // ==========================================
  // 👇 档案管理（客户档案 / 货物档案）
  // ==========================================
  {
    path: '/archive',
    name: 'Archive',
    redirect: '/archive/customer',
    meta: { title: '档案管理', icon: 'FolderOpened' },
    children: [
      {
        path: 'customer',
        name: 'CustomerArchive',
        component: () => import('../views/Dashboard.vue'),
        meta: { title: '客户档案' }
      },
      {
        path: 'cargo',
        name: 'CargoArchive',
        component: () => import('../views/Dashboard.vue'),
        meta: { title: '货物档案' }
      }
    ]
  },

  // ==========================================
  // 👇 入口选择页（管理员登录后进入）
  // ==========================================
  {
    path: '/portal',
    name: 'Portal',
    component: () => import('../views/PortalSelect.vue'),
  },

  // ==========================================
  // 👇 管理端（含数据总览、车辆管理、客户管理、管理员账号）
  // ==========================================
  {
    path: '/admin',
    component: () => import('../views/admin/AdminLayout.vue'),
    redirect: '/admin/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'AdminDashboard',
        component: () => import('../views/admin/AdminDashboard.vue'),
      },
      {
        path: 'vehicle',
        name: 'AdminVehicle',
        component: () => import('../views/admin/AdminVehicle.vue'),
      },
      {
        path: 'customer',
        name: 'AdminCustomer',
        component: () => import('../views/admin/AdminCustomer.vue'),
      },
      {
        path: 'accounts',
        name: 'AdminAccounts',
        component: () => import('../views/admin/AdminAccounts.vue'),
      },
      // ⭐ 原来在这里的 /route/manage 已挪到客户端区域
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router