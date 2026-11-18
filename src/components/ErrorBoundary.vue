<template>
  <slot v-if="!err" />
  <div v-else class="eb-box">
    <div class="eb-title">这块内容加载出错了</div>
    <div class="eb-msg">{{ msg }}</div>
    <button class="eb-btn" @click="reset">重试</button>
  </div>
</template>

<script setup>
import { onErrorCaptured, ref } from 'vue'

/* ============================================================
   错误边界
   ------------------------------------------------------------
   为什么需要：Dashboard 里的页面是 `v-if` 直接渲染的（不是 router-view），
   任何一个页面渲染时抛错，都会一路冒泡把整棵树卸载 —— 表现就是整屏白，
   连侧边栏和顶栏都没了，用户完全无法自救。

   包一层之后：出错只显示这一块，其余功能照常可用。
   ⚠️ 它捕获的是**子组件**的错误，包不住自身的渲染错误。
   ============================================================ */
const err = ref(false)
const msg = ref('')

onErrorCaptured((e) => {
  err.value = true
  msg.value = String((e && e.message) || e || '未知错误').slice(0, 200)
  console.error('[ErrorBoundary] 已拦截渲染错误：', e)
  return false
})

const reset = () => {
  err.value = false
  msg.value = ''
}
</script>

<style scoped>
.eb-box {
  margin: 24px;
  padding: 20px;
  border: 1px solid #f5d4d9;
  background: #fdf0f2;
  border-radius: 10px;
}
.eb-title {
  font-size: 13px;
  font-weight: 600;
  color: #a50d25;
  margin-bottom: 6px;
}
.eb-msg {
  font-size: 12px;
  color: #7c2d3a;
  line-height: 1.7;
  word-break: break-all;
}
.eb-btn {
  margin-top: 12px;
  height: 30px;
  padding: 0 14px;
  border-radius: 7px;
  border: none;
  background: #c8102e;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
</style>
