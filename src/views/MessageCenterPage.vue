<template>
  <div class="affair-page">
    <div class="af-tool">
      <span class="vbar"></span>
      <h3>消息中心</h3>
      <span class="cnt">到期提醒 · 费用待办 · 系统通知</span>
      <div class="right">
        <el-button size="small" plain :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <div class="mc3">
      <!-- 分类 -->
      <div class="col-cat af-card" style="padding:10px 8px">
        <div class="cat-title">收件箱</div>
        <div v-for="c in cats" :key="c.key" class="cat" :class="{ on: cat === c.key }" @click="cat = c.key">
          <span>{{ c.label }}</span>
          <em v-if="c.count" :style="{ color: c.color || '#94A3B8' }">{{ c.count }}</em>
        </div>
      </div>

      <!-- 列表 -->
      <div class="col-list af-card" style="padding:0;overflow:hidden">
        <div class="list-head">
          <el-input v-model="kw" placeholder="搜索车牌 / 内容" size="small" clearable style="width:170px" />
          <span class="sub" style="margin-left:auto">{{ list.length }} 条</span>
        </div>
        <div class="list-body">
          <div v-if="!list.length" class="af-empty"><div class="ic">✓</div>暂无消息</div>
          <div v-for="m in list" :key="m.key" class="mc-row" :class="{ on: sel?.key === m.key }"
            :style="{ borderLeftColor: m.color }" @click="sel = m">
            <div class="ic" :style="{ background: m.bg, color: m.color }">{{ m.ic }}</div>
            <div class="m">
              <b>{{ m.title }}</b>
              <p>{{ m.desc }}</p>
            </div>
            <span class="tm">{{ m.time }}</span>
          </div>
        </div>
      </div>

      <!-- 详情 -->
      <div class="col-detail af-card">
        <div v-if="!sel" class="af-empty"><div class="ic">☰</div>选一条消息查看详情</div>
        <template v-else>
          <div class="d-title">{{ sel.title }}</div>
          <div class="d-tags">
            <span class="af-pill" :style="{ background: sel.bg, color: sel.color }">{{ sel.cat }}</span>
            <span class="af-pill" style="background:#F1F5F9;color:#64748B">{{ sel.source || '自动' }}</span>
          </div>
          <div class="d-body">{{ sel.desc }}</div>

          <div v-if="sel.cat === '到期'" class="d-box">
            <div class="row"><span>车辆</span><b>{{ sel.raw.plate }}</b></div>
            <div class="row"><span>证件</span><b>{{ certName(sel.raw.cert_type) }}</b></div>
            <div class="row" v-if="sel.raw.due_date"><span>到期日</span><b class="num">{{ sel.raw.due_date }}</b></div>
            <div class="row"><span>下次提醒</span><b class="num">{{ sel.raw.next_remind_at?.slice(5, 16) || '—' }}</b></div>
          </div>

          <div class="d-actions">
            <el-button v-if="sel.cat === '到期'" type="danger" style="width:100%" @click="handleDue">处理这条提醒</el-button>
            <el-button v-else plain style="width:100%" @click="sel.go()">前往处理</el-button>
          </div>
        </template>
      </div>
    </div>

    <ReminderDrawer v-model="drawerVisible" :reminder="current" @changed="load" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import '@/assets/affair.css'
import { loadReminders, LEVEL_META } from '@/utils/vehicleAffair'
import { CERT_NAME } from '@/config/vehicleColumns'
import { fetchFeeTodo, isPayer } from '@/utils/feeTodo'
import { approvalOn, moduleFlags } from '@/utils/modules'
import ReminderDrawer from '@/components/affair/ReminderDrawer.vue'

const router = useRouter()
const loading = ref(false)
const reminders = ref([])
const fee = ref({ approve: 0, pay: 0 })
const cat = ref('全部')
const kw = ref('')
const sel = ref(null)
const drawerVisible = ref(false)
const current = ref(null)

const certName = (k) => CERT_NAME[k] || '证件'

const all = computed(() => {
  const out = []
  reminders.value.forEach(r => {
    const mt = LEVEL_META[r.level] || LEVEL_META['正常']
    out.push({
      key: 'r' + r.id, cat: '到期', source: r.source === 'manual' ? '人工' : '自动',
      ic: r.cert_type === 'maintain' ? '保' : '证', bg: mt.bg, color: mt.color,
      title: r.title, desc: r.content,
      time: dayjs(r.created_at).isSame(dayjs(), 'day') ? dayjs(r.created_at).format('HH:mm') : dayjs(r.created_at).format('MM-DD'),
      go: () => router.push('/affair/reminders'), raw: r,
    })
  })
  const user = (() => { try { return JSON.parse(localStorage.getItem('currentUser') || '{}') } catch { return {} } })()
  if (approvalOn.value && fee.value.approve) {
    out.push({
      key: 'fa', cat: '费用', source: '实时', ic: '审', bg: '#EFF4FF', color: '#2563EB',
      title: `待我审批：${fee.value.approve} 笔费用上报`, desc: '当前审批节点是我的费用上报，去运单列表处理',
      time: '实时', go: () => router.push({ path: '/waybill', query: { todo: 'approve' } }),
    })
  }
  if (isPayer(user) && moduleFlags.payout && fee.value.pay) {
    out.push({
      key: 'fp', cat: '费用', source: '实时', ic: '付', bg: '#FFF7ED', color: '#B45309',
      title: `待付款：${fee.value.pay} 笔`, desc: '已审批通过、还没登记付款',
      time: '实时', go: () => router.push('/fee/payout'),
    })
  }
  return out
})

const cats = computed(() => [
  { key: '全部', label: '全部消息', count: all.value.length },
  { key: '到期', label: '到期提醒', count: reminders.value.length, color: '#C8102E' },
  { key: '费用', label: '费用待办', count: fee.value.approve + fee.value.pay, color: '#2563EB' },
])

const list = computed(() => {
  let arr = cat.value === '全部' ? all.value : all.value.filter(m => m.cat === cat.value)
  if (kw.value) {
    const k = kw.value.trim()
    arr = arr.filter(m => String(m.title + m.desc + (m.raw?.plate || '')).includes(k))
  }
  return arr
})

const load = async () => {
  loading.value = true
  try {
    reminders.value = await loadReminders({ status: '待处理' })
    const user = (() => { try { return JSON.parse(localStorage.getItem('currentUser') || '{}') } catch { return null } })()
    const t = await fetchFeeTodo(user)
    fee.value = { approve: t.approve || 0, pay: t.pay || 0 }
    if (!sel.value && list.value.length) sel.value = list.value[0]
  } finally { loading.value = false }
}

const handleDue = () => { current.value = sel.value.raw; drawerVisible.value = true }

onMounted(load)
</script>

<style scoped>
.mc3 { flex: 1; min-height: 0; display: grid; grid-template-columns: 180px 1fr 320px; gap: 12px; }
.col-cat, .col-list, .col-detail { min-height: 0; }
.cat-title { font-size: 11px; font-weight: 800; color: #94A3B8; letter-spacing: 1px; padding: 3px 9px 8px; }
.cat {
  display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-radius: 7px;
  font-size: 12.5px; font-weight: 600; color: #64748B; cursor: pointer;
}
.cat:hover { background: #F8FAFC; }
.cat.on { background: #FDF2F4; color: #C8102E; font-weight: 800; }
.cat em { margin-left: auto; font-style: normal; font-weight: 800; font-family: var(--num-font, Arial, sans-serif); }
.list-head { display: flex; align-items: center; gap: 9px; padding: 10px 12px; border-bottom: 1px solid #EEF2F7; }
.list-head .sub { font-size: 11.5px; color: #94A3B8; }
.list-body { height: calc(100% - 49px); overflow: auto; }
.mc-row {
  display: flex; gap: 10px; padding: 11px 13px; border-bottom: 1px solid #F4F7FA;
  border-left: 3px solid transparent; cursor: pointer;
}
.mc-row:hover { background: #FCFDFE; }
.mc-row.on { background: #FAFCFF; }
.mc-row .ic { width: 26px; height: 26px; border-radius: 8px; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; font-size: 11.5px; font-weight: 800; }
.mc-row .m { flex: 1; min-width: 0; }
.mc-row .m b { font-size: 12.5px; display: block; line-height: 1.5; }
.mc-row .m p { margin: 2px 0 0; font-size: 11.5px; color: #94A3B8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mc-row .tm { font-size: 11px; color: #B6C0CC; flex: 0 0 auto; font-family: var(--num-font, Arial, sans-serif); }
.d-title { font-size: 15px; font-weight: 800; line-height: 1.5; letter-spacing: -.2px; }
.d-tags { display: flex; gap: 6px; margin: 9px 0 12px; }
.d-body { font-size: 12.5px; color: #475569; line-height: 1.85; }
.d-box { background: #FAFCFF; border: 1px solid #EEF2F7; border-radius: 9px; padding: 10px 12px; margin-top: 12px; }
.d-box .row { display: flex; gap: 8px; line-height: 2; }
.d-box .row span { width: 68px; color: #94A3B8; font-size: 12px; }
.d-actions { margin-top: 16px; }
.col-detail { overflow: auto; }
</style>
