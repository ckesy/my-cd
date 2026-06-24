<template>
  <el-container style="height:100vh;">
    <el-aside width="260px">
      <SidebarMenu />
    </el-aside>
    <el-container>
          <el-header style="display:flex;align-items:center;justify-content:space-between;padding:12px 24px">
            <div>车队管理平台</div>
            <div style="display:flex;align-items:center;gap:12px">
              <div>{{ currentPage || '首页' }}</div>
              <el-button type="primary" size="mini" @click="goLogin">返回登录</el-button>
            </div>
          </el-header>
      <el-main style="padding:24px;">
        <h2>{{ currentPage || '欢迎' }}</h2>
        <p>这是“{{ currentPage || '首页' }}”的占位内容。</p>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SidebarMenu from '../components/SidebarMenu.vue'

const route = useRoute()
const router = useRouter()
const currentPage = computed(() => route.params.page)
const goLogin = () => {
  router.push('/')
}
</script>

<style scoped>
/* 简单布局样式 */
h2 { margin: 0 0 12px 0 }
</style>
