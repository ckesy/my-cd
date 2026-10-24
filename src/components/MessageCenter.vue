<template>
  <div class="mc-wrap">
    <button class="mc-bell" :class="{ on: total > 0 }" :title="`消息中心${total ? '（' + total + '）' : ''}`"
      @click="open = !open">
      <el-icon><Bell /></el-icon>
      <span v-if="total" class="mc-dot">{{ total > 99 ? '99+' : total }}</span>
    </button>

    <div v-if="open" class="mc-mask" @click="open = false"></div>

    <div v-if="open" class="mc-panel">
      <div class="mc-head">
        <b>消息中心</b>
        <span v-if="total" class="af-pill" style="background:#FDF2F4;color:#C8102E">未读 {{ total }}</span>
        <span class="mc-all" @click="markAllRead">全部已读</span>
        <span class="mc-x" @click="open = false">✕</span>
      </div>

      <div class="mc-tabs">
        <span v-for="t in tabs" :key="t.key" :class="{ on: tab === t.key }" @click="tab = t.key">
          {{ t.label }}<em v-if="t.count">{{ t.count }}</em>
        </span>
      </div>

      <div class="mc-body">
        <div v-if="!list.length" class="af-empty" style="padding:34px 0">
          <div class="ic">✓</div>暂无消息
        </div>

        <template v-for="g in groups" :key="g.label">
          <div v-if="g.items.length" class="mc-group">{{ g.label }}</div>
          <div v-for="m in g.items" :key="m.key" class="mc-item" :class="{ unread: m.unread }"
            @click="handleClick(m)">
            <div class="ic" :style="{ background: m.bg, color: m.color }">{{ m.ic }}</div>
            <div class="m">
              <b>{{ m.title }}</b>
              <p>{{ m.desc }}</p>
            </div>
            <span class="tm">{{ m.time }}</span>
          </div>
        </template>
      </div>

      <div class="mc-foot">
        <span class="mc-more" @click="goAll">查看全部消息 →</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import '@/assets/affair.css'
import { loadReminders, LEVEL_META } from '@/utils/vehicleAffair'
import { fetchFeeTodo, isPayer } from '@/utils/feeTodo'
import { approvalOn, moduleFlags } from '@/utils/modules'

const router = useRouter()
const open = ref(false)
const tab = ref('全部')
const reminders = ref([])
const fee = ref({ approve: 0, pay: 0 })
let timer = null

const total = computed(() => reminders.value.length + fee.value.approve + fee.value.pay)

const tabs = computed(() => [
  { key: '全部', label: '全部', count: total.value },
  { key: '到期', label: '到期提醒', count: reminders.value.length },
  { key: '费用', label: '费用待办', count: fee.value.approve + fee.value.pay },
])

/** 统一的消息模型 */
const items = computed(() => {
  const out = []
  reminders.value.forEach(r => {
    const mt = LEVEL_META[r.level] || LEVEL_META['正常']
    out.push({
      key: 'r' + r.id, cat: '到期', unread: true,
      ic: r.cert_type === 'maintain' ? '保' : '证', bg: mt.bg, color: mt.color,
      title: r.title, desc: r.content,
      time: dayjs(r.created_at).isSame(dayjs(), 'day') ? dayjs(r.created_at).format('HH:mm') : dayjs(r.created_at).format('MM-DD'),
      at: r.created_at,
      go: () => router.push({ path: '/affair/reminders' }),
      raw: r,
    })
  })
  const user = (() => { try { return JSON.parse(localStorage.getItem('currentUser') || '{}') } catch { return {} } })()
  if (approvalOn.value && fee.value.approve) {
    out.push({
      key: 'fa', cat: '费用', unread: true, ic: '审', bg: '#EFF4FF', color: '#2563EB',
      title: `待我审批：${fee.value.approve} 笔费用上报`, desc: '当前审批节点是我',
      time: '实时', at: dayjs().toISOString(),
      go: () => router.push({ path: '/waybill', query: { todo: 'approve' } }),
    })
  }
  if (isPayer(user) && moduleFlags.payout && fee.value.pay) {
    out.push({
      key: 'fp', cat: '费用', unread: true, ic: '付', bg: '#FFF7ED', color: '#B45309',
      title: `待付款：${fee.value.pay} 笔`, desc: '已审批通过、还没登记付款',
      time: '实时', at: dayjs().toISOString(),
      go: () => router.push('/fee/payout'),
    })
  }
  return out
})

const list = computed(() => (tab.value === '全部' ? items.value : items.value.filter(m => m.cat === tab.value)))

const groups = computed(() => {
  const todayStr = dayjs().format('YYYY-MM-DD')
  const yStr = dayjs().subtract(1, 'day').format('YYYY-MM-DD')
  const g = { 今天: [], 昨天: [], 更早: [] }
  list.value.forEach(m => {
    const d = dayjs(m.at).format('YYYY-MM-DD')
    if (d === todayStr) g.今天.push(m)
    else if (d === yStr) g.昨天.push(m)
    else g.更早.push(m)
  })
  return Object.entries(g).map(([label, arr]) => ({ label, items: arr }))
})

const load = async () => {
  try {
    reminders.value = await loadReminders({ status: '待处理' })
    const user = (() => { try { return JSON.parse(localStorage.getItem('currentUser') || '{}') } catch { return null } })()
    const t = await fetchFeeTodo(user)
    fee.value = { approve: t.approve || 0, pay: t.pay || 0 }
  } catch (e) { /* 不阻断 */ }
}

const markAllRead = () => {
  // 提醒事项的"已读"= 处理；这里只收起面板并给个提示，避免误解为已处理
  open.value = false
}
const handleClick = (m) => { m.go && m.go(); open.value = false }
const goAll = () => { router.push('/message'); open.value = false }

onMounted(() => {
  load()
  timer = setInterval(load, 120000)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.mc-wrap { position: relative; }
.mc-bell {
  position: relative; width: 32px; height: 32px; border-radius: 8px;
  border: 1px solid #E2E8F0; background: #fff; color: #64748B;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  transition: all .16s;
}
.mc-bell:hover { border-color: #C8102E; color: #C8102E; }
.mc-bell.on { color: #C8102E; border-color: #F3B7C2; background: #FDF2F4; }
.mc-dot {
  position: absolute; top: -6px; right: -6px; min-width: 16px; height: 16px;
  border-radius: 9px; background: #C8102E; color: #fff; font-size: 10px; font-weight: 800;
  display: flex; align-items: center; justify-content: center; padding: 0 4px;
  border: 1.5px solid #fff; font-family: var(--num-font, Arial, sans-serif);
}
.mc-mask { position: fixed; inset: 0; z-index: 900; }
.mc-panel {
  position: absolute; top: 40px; right: 0; width: 400px; z-index: 901;
  background: #fff; border-radius: 12px; border: 1px solid #E2E8F0;
  box-shadow: 0 16px 44px rgba(15, 23, 42, .16);
  display: flex; flex-direction: column; max-height: 560px; overflow: hidden;
}
.mc-head {
  display: flex; align-items: center; gap: 8px; padding: 12px 14px 10px;
  border-bottom: 1px solid #EEF2F7;
}
.mc-head b { font-size: 13.5px; }
.mc-all { margin-left: auto; font-size: 12px; color: #64748B; cursor: pointer; }
.mc-all:hover { color: #C8102E; }
.mc-x { font-size: 13px; color: #94A3B8; cursor: pointer; }
.mc-tabs { display: flex; gap: 4px; padding: 9px 12px; border-bottom: 1px solid #EEF2F7; }
.mc-tabs span {
  font-size: 12px; font-weight: 700; color: #64748B; padding: 5px 10px;
  border-radius: 7px; cursor: pointer;
}
.mc-tabs span.on { background: #FDF2F4; color: #C8102E; }
.mc-tabs em { font-style: normal; margin-left: 4px; font-weight: 800; }
.mc-body { flex: 1; min-height: 0; overflow: auto; }
.mc-group {
  padding: 7px 14px; font-size: 11px; font-weight: 800; color: #94A3B8;
  letter-spacing: 1px; background: #FAFCFF;
}
.mc-item {
  display: flex; gap: 10px; padding: 11px 14px; border-bottom: 1px solid #F4F7FA;
  cursor: pointer; transition: background .14s;
}
.mc-item:hover { background: #FCFDFE; }
.mc-item.unread { border-left: 3px solid #C8102E; }
.mc-item .ic {
  width: 26px; height: 26px; border-radius: 8px; flex: 0 0 auto;
  display: flex; align-items: center; justify-content: center; font-size: 11.5px; font-weight: 800;
}
.mc-item .m { flex: 1; min-width: 0; }
.mc-item .m b { font-size: 12.5px; display: block; line-height: 1.5; }
.mc-item .m p {
  margin: 2px 0 0; font-size: 11.5px; color: #94A3B8;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mc-item .tm { font-size: 11px; color: #B6C0CC; flex: 0 0 auto; font-family: var(--num-font, Arial, sans-serif); }
.mc-foot { padding: 9px 14px; border-top: 1px solid #EEF2F7; text-align: center; }
.mc-more { font-size: 12px; color: #64748B; cursor: pointer; }
.mc-more:hover { color: #C8102E; }
</style>
