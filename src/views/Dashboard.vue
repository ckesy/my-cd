<template>
  <el-container style="height:100vh; overflow: hidden;">
    <el-aside width="240px">
      <SidebarMenu />
    </el-aside>
    <el-container>
      <el-header class="dashboard-header">
        <div class="dashboard-title">车队管理平台</div>
        <div class="dashboard-actions">
          <div>{{ currentPage }}</div>
          <el-button type="primary" size="small" @click="goLogin">返回登录</el-button>
        </div>
      </el-header>
      <div class="page-tabs">
        <el-tag
          v-for="tab in tabs"
          :key="tab.path"
          :type="tab.path === route.path ? 'success' : 'info'"
          closable
          @click="openTab(tab)"
          @close="closeTab(tab)"
        >
          {{ tab.title }}
        </el-tag>
      </div>
      <el-main class="main-content">
        <template v-if="currentPage === '全图监控' || route.path === '/fullmap'">
          <FullMap />
        </template>
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
import SidebarMenu from '../components/SidebarMenu.vue'
import FullMap from '../views/FullMap.vue'

const route = useRoute()
const router = useRouter()

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
</script>

<style scoped>
.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 16px;
  min-height: 40px;
}

.dashboard-title {
  font-size: 15px;
  font-weight: 600;
}

.dashboard-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.page-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-start;
  align-items: center;
  padding: 0 16px 6px;
  min-height: 28px;
}

.page-tabs .el-tag {
  font-size: 11px;
  height: 26px;
  line-height: 22px;
}

.main-content {
  height: calc(100vh - 68px);
  max-height: calc(100vh - 68px);
  padding: 12px 16px;
  overflow: hidden;
}

.el-main > *,
.main-content > * {
  max-height: calc(100vh - 74px);
  overflow: hidden;
}

h2 {
  margin: 0 0 12px 0;
}
</style>