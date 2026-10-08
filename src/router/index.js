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
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router