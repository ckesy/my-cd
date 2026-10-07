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
  // 👇 新增：电子围栏管理模块
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
        // 统一指向 Dashboard.vue，由 Dashboard.vue 内部的条件渲染决定加载哪个具体组件
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
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router