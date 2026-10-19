<template>
  <div ref="hostRef" class="svg-plot"></div>
</template>

<script setup>
/**
 * SVG 图表挂载点：把 draw(host, width) 画进来，并在容器宽度变化时重画。
 * draw 里用的是 src/utils/svgCharts.js 那套手写 SVG（和设计稿同一套视觉）。
 */
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'

const props = defineProps({
  draw: { type: Function, required: true },
  /* 数据变化时传一个新值即可触发重画 */
  deps: { type: null, default: null },
})

const hostRef = ref(null)
let ro = null

const paint = () => {
  const host = hostRef.value
  if (!host) return
  const w = Math.max(180, Math.floor(host.clientWidth) || 420)
  host.innerHTML = ''
  props.draw(host, w)
}

onMounted(async () => {
  await nextTick()
  paint()
  ro = new ResizeObserver(() => paint())
  if (hostRef.value) ro.observe(hostRef.value)
})

watch(() => props.deps, () => nextTick(paint), { deep: true })

onBeforeUnmount(() => {
  if (ro) ro.disconnect()
})
</script>

<style scoped>
.svg-plot {
  width: 100%;
  line-height: 0;
}
</style>
