<template>
  <div class="affair-page" style="overflow:auto">
    <div class="af-tool">
      <span class="vbar"></span>
      <h3>车务总览</h3>
      <span class="cnt">{{ summaryText }}</span>
      <div class="right">
        <el-button size="small" plain :loading="loading" @click="refresh">刷新</el-button>
        <el-button size="small" type="danger" @click="goLedger()">证件台账</el-button>
      </div>
    </div>

    <!-- KPI -->
    <div class="af-kpi">
      <div class="k red" :class="{ on: jump === '已逾期' }" @click="goLedger('已逾期')">
        <div class="lb">已逾期</div>
        <div class="vl">{{ kpi.overdue }}<small>项</small></div>
      </div>
      <div class="k orange" :class="{ on: jump === '临近' }" @click="goLedger('临近')">
        <div class="lb">临近 ≤3 天</div>
        <div class="vl">{{ kpi.near }}<small>项</small></div>
      </div>
      <div class="k amber" :class="{ on: jump === '快到期' }" @click="goLedger('快到期')">
        <div class="lb">快到期</div>
        <div class="vl">{{ kpi.soon }}<small>项</small></div>
      </div>
      <div class="k green" :class="{ on: jump === '正常' }" @click="goLedger('正常')">
        <div class="lb">正常</div>
        <div class="vl">{{ kpi.normal }}<small>项</small></div>
      </div>
      <div class="k gray" :class="{ on: jump === '未录入' }" @click="goLedger('未录入')">
        <div class="lb">未录入</div>
        <div class="vl">{{ kpi.missing }}<small>项</small></div>
      </div>
    </div>

    <!-- 月度到期分布 -->
    <div class="af-card">
      <div class="af-tool" style="margin-bottom:12px">
        <span class="vbar" style="height:13px"></span>
        <h3 style="font-size:13.5px">未来 6 个月到期分布</h3>
        <span class="cnt">按月 · 点柱子筛台账</span>
      </div>
      <div v-if="!buckets.some(b => b.count)" class="af-empty" style="padding:22px 0">暂无未来到期数据</div>
      <div v-else class="bars">
        <div v-for="b in buckets" :key="b.key" class="bar-col" @click="goLedger(null, b.key)">
          <div class="bar-n" :style="{ height: barH(b.count) + 'px', background: b.count ? '#F0A8B4' : '#EEF2F7' }"></div>
          <div class="bar-l">{{ b.label }}<span v-if="b.count"> {{ b.count }}</span></div>
        </div>
      </div>
    </div>

    <!-- 待处理提醒 -->
    <div class="af-card">
      <div class="af-tool" style="margin-bottom:11px">
        <span class="vbar" style="height:13px"></span>
        <h3 style="font-size:13.5px">待处理提醒事项</h3>
        <span class="cnt">共 {{ reminders.length }} 条</span>
        <div class="right">
          <el-button size="small" plain @click="goReminders">全部处理</el-button>
        </div>
      </div>

      <div v-if="!reminders.length" class="af-empty">
        <div class="ic">✓</div>没有待处理的到期提醒
      </div>
      <div v-else class="af-rem">
        <div v-for="r in reminders.slice(0, 8)" :key="r.id" class="af-rem-item"
          :style="{ borderLeftColor: meta(r.level).color }" @click="openReminder(r)">
          <div class="ic" :style="{ background: meta(r.level).bg, color: meta(r.level).color }">
            {{ r.cert_type === 'maintain' ? '保' : '证' }}
          </div>
          <div class="m">
            <b>{{ r.plate }} · {{ certName(r.cert_type) }}</b>
            <p>{{ r.content }}</p>
          </div>
          <span class="af-pill" :style="{ background: meta(r.level).bg, color: meta(r.level).color }">
            <i class="d"></i>{{ r.level }}
          </span>
          <span class="tm">{{ dueText(r) }}</span>
        </div>
      </div>
    </div>

    <ReminderDrawer v-model="drawerVisible" :reminder="current" @changed="refresh" />

    <!-- ⭐ 自动生成前先问一次（不做静默创建） -->
    <el-dialog v-model="askOpen" :title="`发现 ${askList.length} 项证件需要提醒`" width="460px" append-to-body class="af-dialog">
      <div style="font-size:13px;color:#475569;line-height:1.75;margin-bottom:11px">
        系统检测到以下证件已进入提醒范围，是否生成提醒事项？
      </div>
      <div class="ask-list">
        <div v-for="a in askList" :key="a.cert.id" class="ask-row"
          :style="{ borderColor: meta(a.level).bg, background: meta(a.level).bg }">
          <div>
            <b>{{ a.cert.plate }} · {{ certName(a.cert.cert_type) }}</b>
            <span class="ask-sub">
              {{ a.cert.cert_type === 'maintain'
                ? `还剩 ${Math.round(a.left)} km`
                : `${a.cert.expire_date}（${fmtLeft(a.left)}）` }}
            </span>
          </div>
          <span class="af-pill" :style="{ color: meta(a.level).color, background: '#fff' }">{{ a.level }}</span>
        </div>
      </div>
      <div style="font-size:11.5px;color:#94A3B8;margin-top:10px">
        生成后进入「提醒事项」，逾期每天提醒；点「暂不生成」今天不再问，明天会再问。
      </div>
      <template #footer>
        <el-button plain @click="askOpen = false">暂不生成</el-button>
        <el-button type="danger" :loading="asking" @click="doCreateReminders">生成提醒事项</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import '@/assets/affair.css'
import {
  loadCerts, loadReminders, syncReminders, summarize, dueBuckets, fetchKmMap,
  levelOf, LEVEL_META, fmtLeft, fmtKm, previewDueReminders,
} from '@/utils/vehicleAffair'
import { CERT_NAME } from '@/config/vehicleColumns'
import ReminderDrawer from '@/components/affair/ReminderDrawer.vue'

const router = useRouter()
const loading = ref(false)
const certs = ref([])
const reminders = ref([])
const buckets = ref([])
const jump = ref('')
const drawerVisible = ref(false)
const current = ref(null)
const askOpen = ref(false)
const asking = ref(false)
const askList = ref([])
const lastKmMap = ref({})

const meta = (lv) => LEVEL_META[lv] || LEVEL_META['正常']
const certName = (k) => CERT_NAME[k] || '证件'
const dueText = (r) => {
  if (r.cert_type === 'maintain') return '按里程'
  const l = dayjs(r.due_date)
  return l.isValid() ? l.format('YYYY-MM-DD') : '--'
}

const kpi = ref({ overdue: 0, near: 0, soon: 0, normal: 0, missing: 0 })
const summaryText = computed(() => {
  const plates = new Set(certs.value.map(c => c.plate))
  return `${plates.size} 台车 · ${certs.value.length} 项证件`
})
const barH = (n) => {
  const max = Math.max(...buckets.value.map(b => b.count), 1)
  return Math.max(6, Math.round((n / max) * 82))
}

const goLedger = (status, month) => {
  jump.value = status || ''
  const q = {}
  if (status) q.status = status
  if (month) q.month = month
  router.push({ path: '/affair/ledger', query: q })
}
const goReminders = () => router.push('/affair/reminders')
const openReminder = (r) => { current.value = r; drawerVisible.value = true }

const doCreateReminders = async () => {
  asking.value = true
  try {
    const rows = certs.value
    await syncReminders(rows, lastKmMap.value)
    reminders.value = await loadReminders({ status: '待处理' })
    askOpen.value = false
    askList.value = []
    ElMessage.success('已生成提醒事项')
  } catch (e) {
    ElMessage.error('生成失败：' + (e.message || e))
  } finally { asking.value = false }
}

const refresh = async () => {
  loading.value = true
  try {
    const rows = await loadCerts()
    // 保养要里程，只对保养行取（限制并发）
    const maintainPlates = rows.filter(r => r.cert_type === 'maintain' && r.last_maintain_km).map(r => r.plate)
    const kmMap = maintainPlates.length ? await fetchKmMap(maintainPlates) : {}

    rows.forEach(c => {
      const { level, left } = levelOf(c, c.cert_type === 'maintain' ? kmMap[c.plate] : null)
      c._level = level
      c._left = left
    })
    certs.value = rows
    kpi.value = summarize(rows, kmMap).kpi
    buckets.value = dueBuckets(rows, 6)

    lastKmMap.value = kmMap
    reminders.value = await loadReminders({ status: '待处理' })

    /* ⭐ 先问再生成：只把"该提醒但还没建待办"的挑出来，用户点确定才写库 */
    askList.value = rows.length ? await previewDueReminders(rows, kmMap) : []
    if (askList.value.length) askOpen.value = true
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
</script>

<style scoped>
.bars { display: flex; align-items: flex-end; gap: 14px; height: 108px; padding: 0 4px; }
.bar-col { flex: 1; text-align: center; cursor: pointer; }
.bar-n { width: 100%; border-radius: 4px 4px 0 0; min-height: 6px; transition: all .2s; }
.bar-col:hover .bar-n { filter: brightness(1.06); }
.bar-l { font-size: 11.5px; color: #94A3B8; margin-top: 6px; font-weight: 600; }
.ask-list { display: flex; flex-direction: column; gap: 7px; max-height: 240px; overflow: auto; }
.ask-row {
  display: flex; align-items: center; gap: 10px; padding: 9px 11px;
  border: 1px solid #EEF2F7; border-radius: 8px;
}
.ask-row > div { flex: 1; }
.ask-row b { font-size: 12.5px; }
.ask-sub { display: block; font-size: 11.5px; color: #64748B; margin-top: 2px; }
</style>
