import { createRouter, createWebHistory } from 'vue-router'

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
}
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router

