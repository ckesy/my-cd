<template>
  <div class="screen-tabs">
    <button :class="{ on: active === 'fleet' }" @click="go('fleet')">
      <span class="dot"></span>车辆运行
    </button>
    <button :class="{ on: active === 'fee' }" @click="go('fee')">
      <span class="dot"></span>运单费用
    </button>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'

const props = defineProps({
  active: { type: String, default: 'fleet' },
})
const router = useRouter()

const PATH = { fleet: '/screen/fleet', fee: '/screen/fee' }

function go(key) {
  if (key === props.active) return
  router.replace(PATH[key])
}
</script>

<style scoped>
.screen-tabs{display:inline-flex;gap:3px;padding:3px;border:1px solid rgba(90,150,220,.24);
  background:rgba(10,22,40,.62);border-radius:4px}
.screen-tabs button{display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;
  font-family:inherit;font-size:12px;font-weight:600;color:#7C93AC;padding:5px 14px;
  letter-spacing:.6px;cursor:pointer;border-radius:2px;transition:.2s}
.screen-tabs button:hover{color:#DCE9F9}
.screen-tabs button.on{background:linear-gradient(135deg,#FF3355,#B00D22);color:#fff;
  box-shadow:0 0 14px rgba(255,45,75,.4)}
.screen-tabs .dot{width:4px;height:4px;border-radius:50%;background:currentColor;opacity:.7}
.screen-tabs button.on .dot{opacity:1;background:#fff}
</style>
