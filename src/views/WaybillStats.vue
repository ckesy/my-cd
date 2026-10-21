<template>
  <div class="ws-page">
    <!-- ===== 头 ===== -->
    <div class="ws-head fade-up">
      <div class="ws-title">
        <span class="ws-bar"></span>
        <h2>运单统计</h2>
        <span class="ws-sub">只看车和活 · 钱在「费用统计」里</span>
      </div>
      <div class="ws-actions">
        <el-date-picker v-model="dateRange" type="daterange" range-separator="至"
          start-placeholder="开始" end-placeholder="结束" value-format="YYYY-MM-DD"
          unlink-panels :shortcuts="DATE_SHORTCUTS" style="width: 236px" />
        <el-button type="primary" class="btn-primary" :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon> 刷新
        </el-button>
      </div>
    </div>

    <el-tabs v-model="tab" class="ws-tabs">
      <!-- ================= 概览 ================= -->
      <el-tab-pane label="概览" name="overview">
        <div class="kpis">
          <div class="kpi hero">
            <div class="kpi-k">{{ periodLabel }}运单</div>
            <div class="kpi-v num">{{ total }}</div>
            <div class="kpi-s">完成 {{ done }} · 在途 {{ running }} · 取消 {{ cancelled }}</div>
          </div>
          <div class="kpi">
            <div class="kpi-k">完成率</div>
            <div class="kpi-v num" style="color:#15803D">{{ doneRate }}%</div>
            <div class="kpi-s">{{ done }} / {{ total }}</div>
          </div>
          <div class="kpi">
            <div class="kpi-k">总里程</div>
            <div class="kpi-v num">{{ fmtInt(distance) }}</div>
            <div class="kpi-s">公里 · 均 {{ avgDistance }} km/趟</div>
          </div>
          <div class="kpi">
            <div class="kpi-k">平均在途</div>
            <div class="kpi-v num">{{ avgHours }}</div>
            <div class="kpi-s">小时 · 发车到到达</div>
          </div>
        </div>

        <div class="two">
          <div class="panel">
            <div class="p-hd"><span class="p-t">单子卡在哪</span><span class="p-s">当前状态</span></div>
            <div class="funnel">
              <div v-if="!statusRows.length" class="ws-empty">这段时间没有运单</div>
              <div v-for="s in statusRows" :key="s.key" class="fn-row">
                <span class="fn-n">{{ s.key }}</span>
                <span class="fn-t">
                  <i :style="{ width: s.pct + '%', background: s.color }"></i>
                  <span class="fn-v" v-if="s.count">{{ s.count }}</span>
                </span>
                <span class="fn-p">{{ s.pct }}%</span>
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="p-hd"><span class="p-t">谁跑得多</span><span class="p-s">按司机</span></div>
            <div class="bars">
              <div v-for="(d, i) in driverRows" :key="d.name" class="bar-row">
                <span class="bar-n">{{ d.name }}</span>
                <span class="bar-t">
                  <i :style="{ width: d.pct + '%', background: barColor(i) }"></i>
                </span>
                <span class="bar-v">{{ d.count }} 趟</span>
              </div>
              <div v-if="!driverRows.length" class="ws-empty">这段时间没有运单</div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- ================= 客户与线路 ================= -->
      <el-tab-pane label="客户与线路" name="customer">
        <div class="panel" style="margin-bottom:13px">
          <div class="p-hd"><span class="p-t">客户分布</span><span class="p-s">按趟数</span></div>
          <el-table :data="customerRows" class="custom-table" size="small"
            v-loading="loading" element-loading-text="加载中…">
            <el-table-column label="客户" min-width="200">
              <template #default="{ row }">
                <span class="t-name">{{ row.name }}</span>
              </template>
            </el-table-column>
            <el-table-column label="趟数" width="90" align="right">
              <template #default="{ row }"><span class="num">{{ row.count }}</span></template>
            </el-table-column>
            <el-table-column label="占比" width="100" align="right">
              <template #default="{ row }">
                <span class="num t-muted">{{ row.ratio }}%</span>
              </template>
            </el-table-column>
            <el-table-column label="里程" width="120" align="right">
              <template #default="{ row }"><span class="num">{{ fmtInt(row.distance) }} km</span></template>
            </el-table-column>
            <el-table-column label="完成率" width="100" align="right">
              <template #default="{ row }">
                <span class="num" :style="{ color: row.rate >= 80 ? '#15803D' : '#D97706' }">{{ row.rate }}%</span>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div class="panel">
          <div class="p-hd"><span class="p-t">线路表现</span><span class="p-s">按装货地 → 卸货地</span></div>
          <el-table :data="routeRows" class="custom-table" size="small">
            <el-table-column label="线路" min-width="240">
              <template #default="{ row }">
                <span class="t-name">{{ row.from }} → {{ row.to }}</span>
              </template>
            </el-table-column>
            <el-table-column label="趟数" width="90" align="right">
              <template #default="{ row }"><span class="num">{{ row.count }}</span></template>
            </el-table-column>
            <el-table-column label="平均里程" width="120" align="right">
              <template #default="{ row }"><span class="num">{{ fmtInt(row.avgDist) }} km</span></template>
            </el-table-column>
            <el-table-column label="平均在途" width="120" align="right">
              <template #default="{ row }"><span class="num">{{ row.avgHours }} h</span></template>
            </el-table-column>
          </el-table>
          <div v-if="!routeRows.length" class="ws-empty" style="padding:20px 0;text-align:center">
            还没有线路数据
          </div>
        </div>
      </el-tab-pane>

      <!-- ================= 时效 ================= -->
      <el-tab-pane label="时效" name="timing">
        <div class="panel" style="margin-bottom:13px">
          <div class="p-hd"><span class="p-t">各环节平均耗时</span><span class="p-s">基于已完成运单</span></div>
          <el-table :data="stageRows" class="custom-table" size="small">
            <el-table-column label="环节" min-width="160">
              <template #default="{ row }"><span class="t-name">{{ row.name }}</span></template>
            </el-table-column>
            <el-table-column label="平均" width="110" align="right">
              <template #default="{ row }"><span class="num">{{ row.avg }} h</span></template>
            </el-table-column>
            <el-table-column label="最长" width="110" align="right">
              <template #default="{ row }"><span class="num t-muted">{{ row.max }} h</span></template>
            </el-table-column>
            <el-table-column label="样本" width="90" align="right">
              <template #default="{ row }"><span class="num t-muted">{{ row.n }} 单</span></template>
            </el-table-column>
            <el-table-column label="相对占比" min-width="180">
              <template #default="{ row }">
                <span class="stage-bar">
                  <i :style="{ width: row.pct + '%', background: row.color }"></i>
                </span>
              </template>
            </el-table-column>
          </el-table>
          <div class="ws-hint">
            环节时间 = 相邻两个节点时间的差。哪一段最长，晚点就出在哪。
          </div>
        </div>

        <div class="panel">
          <div class="p-hd"><span class="p-t">出车密度</span><span class="p-s">按天</span></div>
          <div class="heat">
            <div v-for="d in heatDays" :key="d.date" class="h-cell" :class="'l' + d.level"
              :title="`${d.date} · ${d.count} 趟`">{{ d.day }}</div>
          </div>
          <div class="h-legend">
            <span>少</span>
            <i style="background:#F1F5F9"></i>
            <i style="background:#DBEAFE"></i>
            <i style="background:#93C5FD"></i>
            <i style="background:#3B82F6"></i>
            <i style="background:#1D4ED8"></i>
            <span>多</span>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { supabase } from '@/utils/supabase'

/* ================= 用户 ================= */
const currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('currentUser') || 'null') || {} } catch { return {} }
})()
const isAdmin = currentUser.role === 'admin'
const myAccount = currentUser.masterAccount || currentUser.account || ''
const scope = (q) => (isAdmin ? q : q.eq('owner_account', myAccount))

/* ================= 状态 ================= */
const loading = ref(false)
const tab = ref('overview')
const rows = ref([])
const dateRange = ref([dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')])

const DATE_SHORTCUTS = [
  { text: '本月', value: () => [dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')] },
  { text: '上月', value: () => [dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD'), dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD')] },
  { text: '近 30 天', value: () => [dayjs().subtract(29, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')] },
]

const range = computed(() => {
  if (dateRange.value && dateRange.value.length === 2) return dateRange.value
  return [dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')]
})

const periodLabel = computed(() => {
  const [s, e] = range.value
  if (s === dayjs().startOf('month').format('YYYY-MM-DD') && e === dayjs().format('YYYY-MM-DD')) return '本月'
  return `${dayjs(s).format('M月D日')} 起`
})

/* ================= 取数 ================= */
async function load() {
  loading.value = true
  try {
    let q = supabase
      .from('waybills')
      .select('*')
      .gte('create_time', range.value[0])
      .lte('create_time', range.value[1] + ' 23:59:59')
      .order('create_time', { ascending: false })
      .limit(5000)
    q = scope(q)
    const { data, error } = await q
    if (error) throw error
    rows.value = data || []
  } catch (e) {
    ElMessage.error(e.message || '加载失败')
    rows.value = []
  } finally {
    loading.value = false
  }
}

/* ================= 聚合 ================= */
const DONE = '已完成'
const CANCEL = '已取消'
const RUNNING_STATUS = ['待装车', '装车中', '装车完成', '已发车', '已到达']

const total = computed(() => rows.value.length)
const done = computed(() => rows.value.filter((r) => r.status === DONE).length)
const cancelled = computed(() => rows.value.filter((r) => r.status === CANCEL).length)
const running = computed(() => rows.value.filter((r) => RUNNING_STATUS.includes(r.status)).length)
const doneRate = computed(() => (total.value ? Math.round((done.value / total.value) * 100) : 0))

const distance = computed(() =>
  rows.value.reduce((s, r) => s + (Number(r.plan_distance) || 0), 0)
)
const avgDistance = computed(() =>
  total.value ? Math.round(distance.value / total.value) : 0
)

/** 在途时长：depart_time → arrive_time（分钟） */
function transitHours(r) {
  if (!r.depart_time || !r.arrive_time) return null
  const m = dayjs(r.arrive_time).diff(dayjs(r.depart_time), 'minute')
  return m > 0 ? m : null
}

const avgHours = computed(() => {
  const list = rows.value.map(transitHours).filter(Boolean)
  if (!list.length) return '—'
  return (list.reduce((a, b) => a + b, 0) / list.length / 60).toFixed(1)
})

/* 状态漏斗 */
const STATUS_COLORS = {
  已完成: '#15803D', 已到达: '#0E7490', 已发车: '#1D4ED8',
  装车完成: '#7C3AED', 装车中: '#8B5CF6', 待装车: '#D97706',
  待接单: '#B45309', 待重新指派: '#EA580C', 已取消: '#94A3B8',
}
const statusRows = computed(() => {
  const map = {}
  rows.value.forEach((r) => { map[r.status] = (map[r.status] || 0) + 1 })
  const t = total.value || 1
  return Object.keys(STATUS_COLORS)
    .filter((k) => map[k])
    .map((k) => ({
      key: k,
      count: map[k],
      pct: Math.max(1, Math.round((map[k] / t) * 100)),
      color: STATUS_COLORS[k],
    }))
    .sort((a, b) => b.count - a.count)
})

/* 司机排行 */
const driverRows = computed(() => {
  const map = {}
  rows.value.forEach((r) => {
    const name = r.driver_name || r.vehicle || '未指派'
    if (!map[name]) map[name] = 0
    map[name] += 1
  })
  const list = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const max = list.length ? list[0][1] : 1
  return list.map(([name, count]) => ({ name, count, pct: Math.round((count / max) * 100) }))
})

const barColor = (i) => ['#1D4ED8', '#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE'][i] || '#BFDBFE'

/* 客户分布 */
const customerRows = computed(() => {
  const map = {}
  rows.value.forEach((r) => {
    const name = r.customer_archive_name || r.customer || '未指定客户'
    if (!map[name]) map[name] = { count: 0, distance: 0, done: 0 }
    map[name].count += 1
    map[name].distance += Number(r.plan_distance) || 0
    if (r.status === DONE) map[name].done += 1
  })
  const t = total.value || 1
  return Object.entries(map)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, g]) => ({
      name,
      count: g.count,
      distance: g.distance,
      ratio: Math.round((g.count / t) * 100),
      rate: g.count ? Math.round((g.done / g.count) * 100) : 0,
    }))
})

/* 线路 */
const routeRows = computed(() => {
  const map = {}
  rows.value.forEach((r) => {
    const from = r.pickup || '—'
    const to = r.delivery || '—'
    const key = `${from}|${to}`
    if (!map[key]) map[key] = { from, to, count: 0, dist: 0, hours: [] }
    map[key].count += 1
    map[key].dist += Number(r.plan_distance) || 0
    const h = transitHours(r)
    if (h) map[key].hours.push(h)
  })
  return Object.values(map)
    .filter((g) => g.count >= 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((g) => ({
      from: g.from,
      to: g.to,
      count: g.count,
      avgDist: g.count ? Math.round(g.dist / g.count) : 0,
      avgHours: g.hours.length ? (g.hours.reduce((a, b) => a + b, 0) / g.hours.length / 60).toFixed(1) : '—',
    }))
})

/* 时效：相邻节点差 */
const STAGES = [
  { key: 'a2l', name: '接单 → 装车', from: 'accept_time', to: 'load_time', color: '#3B82F6' },
  { key: 'l2d', name: '装车 → 发车', from: 'load_time', to: 'depart_time', color: '#7C3AED' },
  { key: 'd2a', name: '发车 → 到达', from: 'depart_time', to: 'arrive_time', color: '#1D4ED8' },
  { key: 'a2f', name: '到达 → 完成', from: 'arrive_time', to: 'finish_time', color: '#15803D' },
]

const stageRows = computed(() => {
  const out = STAGES.map((s) => {
    const vals = rows.value
      .map((r) => (r[s.from] && r[s.to] ? dayjs(r[s.to]).diff(dayjs(r[s.from]), 'minute') : null))
      .filter((v) => v && v > 0)
    return {
      name: s.name,
      color: s.color,
      n: vals.length,
      avgNum: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length / 60 : 0,
      maxNum: vals.length ? Math.max(...vals) / 60 : 0,
    }
  })
  const maxAvg = Math.max(...out.map((o) => o.avgNum), 1)
  return out.map((o) => ({
    name: o.name,
    color: o.color,
    n: o.n,
    avg: o.n ? o.avgNum.toFixed(1) : '—',
    max: o.n ? o.maxNum.toFixed(1) : '—',
    pct: Math.round((o.avgNum / maxAvg) * 100),
  }))
})

/* 热力：按创建日 */
const heatDays = computed(() => {
  const [s, e] = range.value
  const days = dayjs(e).diff(dayjs(s), 'day') + 1
  const map = {}
  rows.value.forEach((r) => {
    const d = dayjs(r.create_time).format('YYYY-MM-DD')
    map[d] = (map[d] || 0) + 1
  })
  const max = Math.max(...Object.values(map), 1)
  const out = []
  for (let i = 0; i < Math.min(days, 31); i++) {
    const d = dayjs(s).add(i, 'day')
    const date = d.format('YYYY-MM-DD')
    const count = map[date] || 0
    const level = count === 0 ? 0 : count >= max * 0.8 ? 4 : count >= max * 0.5 ? 3 : count >= max * 0.25 ? 2 : 1
    out.push({ date, day: d.format('D'), count, level })
  }
  return out
})

/* ================= 工具 ================= */
const fmtInt = (v) => Math.round(Number(v) || 0).toLocaleString('zh-CN')

onMounted(load)
</script>

<style scoped>
.ws-page { display: flex; flex-direction: column; gap: 13px; padding: 18px 20px 24px; }

.ws-head {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  background: #fff; border: 1px solid #E6ECF3; border-radius: 11px; padding: 13px 16px;
}
.ws-title { display: flex; align-items: center; gap: 9px; }
.ws-bar { width: 3px; height: 15px; border-radius: 2px; background: #1D4ED8; }
.ws-title h2 { margin: 0; font-size: 14px; font-weight: 800; color: #0F172A; }
.ws-sub { font-size: 11px; color: #94A3B8; }
.ws-actions { margin-left: auto; display: flex; align-items: center; gap: 9px; }

.ws-tabs :deep(.el-tabs__header) { margin: 0 0 13px; }
.ws-tabs :deep(.el-tabs__nav-wrap::after) { height: 1px; background: #E6ECF3; }
.ws-tabs :deep(.el-tabs__item) { font-size: 13px; color: #64748B; height: 38px; }
.ws-tabs :deep(.el-tabs__item.is-active) { color: #1D4ED8; font-weight: 700; }
.ws-tabs :deep(.el-tabs__active-bar) { background: #1D4ED8; height: 2.5px; border-radius: 2px; }

.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 13px; }
.kpi { border: 1px solid #EDF1F6; border-radius: 11px; padding: 14px 16px; background: #fff; }
.kpi.hero { background: linear-gradient(135deg, #1E3A8A, #152C6B); border-color: transparent; }
.kpi-k { font-size: 11px; color: #94A3B8; }
.kpi.hero .kpi-k { color: rgba(255, 255, 255, .72); }
.kpi-v { font-size: 22px; font-weight: 800; letter-spacing: -.6px; margin-top: 6px; color: #0F172A; }
.kpi.hero .kpi-v { color: #fff; }
.kpi-s { font-size: 10.5px; color: #B4BECB; margin-top: 4px; }
.kpi.hero .kpi-s { color: rgba(255, 255, 255, .6); }

.panel { border: 1px solid #EDF1F6; border-radius: 11px; background: #fff; padding: 14px 16px; }
.p-hd { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.p-t { font-size: 12.5px; font-weight: 800; color: #0F172A; }
.p-s { font-size: 10px; color: #B4BECB; margin-left: auto; }
.two { display: grid; grid-template-columns: 1.25fr 1fr; gap: 13px; }

/* 漏斗 */
.funnel { display: flex; flex-direction: column; gap: 8px; }
.fn-row { display: flex; align-items: center; gap: 10px; font-size: 11.5px; }
.fn-n { width: 72px; color: #475569; flex: 0 0 auto; }
.fn-t { flex: 1; height: 24px; border-radius: 5px; background: #F1F5F9; overflow: hidden; position: relative; }
.fn-t i { display: block; height: 100%; border-radius: 5px; transition: width .3s; }
.fn-v {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
  font-family: var(--num, inherit); font-size: 11px; font-weight: 800; color: #fff;
}
.fn-p { width: 40px; text-align: right; color: #94A3B8; font-size: 11px; flex: 0 0 auto; }

/* 条形 */
.bars { display: flex; flex-direction: column; gap: 10px; }
.bar-row { display: flex; align-items: center; gap: 10px; font-size: 11.5px; }
.bar-n { width: 76px; color: #475569; flex: 0 0 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-t { flex: 1; height: 9px; border-radius: 5px; background: #F1F5F9; overflow: hidden; }
.bar-t i { display: block; height: 100%; border-radius: 5px; }
.bar-v { width: 54px; text-align: right; font-weight: 700; color: #0F172A; flex: 0 0 auto; }

.t-name { font-size: 12.5px; font-weight: 600; color: #0F172A; }
.t-muted { color: #64748B; }
.ws-empty { font-size: 11.5px; color: #B4BECB; padding: 10px 0; }
.ws-hint { margin-top: 10px; padding-top: 9px; border-top: 1px solid #F1F5F9; font-size: 10.5px; color: #94A3B8; }

/* 时效条 */
.stage-bar { display: block; height: 9px; border-radius: 5px; background: #F1F5F9; overflow: hidden; }
.stage-bar i { display: block; height: 100%; border-radius: 5px; }

/* 热力 */
.heat { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; }
.h-cell {
  aspect-ratio: 1; border-radius: 4px; background: #F1F5F9;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; color: #94A3B8;
}
.h-cell.l1 { background: #DBEAFE; color: #1E40AF; }
.h-cell.l2 { background: #93C5FD; color: #1E3A8A; }
.h-cell.l3 { background: #3B82F6; color: #fff; }
.h-cell.l4 { background: #1D4ED8; color: #fff; }
.h-legend { display: flex; align-items: center; gap: 5px; margin-top: 10px; font-size: 10px; color: #94A3B8; }
.h-legend i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }

:deep(.el-table th.el-table__cell) { font-size: 11.5px; color: #475569; font-weight: 700; }
</style>
