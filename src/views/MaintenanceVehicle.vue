<template>
  <div class="mv-page">
    <!-- ===== 头部 ===== -->
    <div class="mv-head">
      <button class="mv-back" @click="goBack">‹ 返回</button>
      <span class="mv-plate">{{ plate || '—' }}</span>
      <span v-if="brief.org" class="mv-org">{{ brief.org }}</span>
      <span class="mv-sum">
        累计维保 <b>{{ money(stats.total) }}</b> · 维修 {{ stats.repair }} 次 · 保养 {{ stats.service }} 次 · 轮胎 {{ stats.tire }} 次
      </span>
      <div class="mv-actions">
        <el-button size="small" @click="goLedger">去维保台账</el-button>
      </div>
    </div>

    <div class="mv-body">
      <!-- ===== 左：年月分组 ===== -->
      <div class="mv-main">
        <div v-if="loading" class="mv-state">加载中…</div>
        <div v-else-if="!rows.length" class="mv-state">
          这辆车还没有维保记录
          <el-button link type="primary" @click="goLedger">去台账补一条 ›</el-button>
        </div>

        <div v-else class="mv-groups">
          <div v-for="g in groups" :key="g.key" class="mv-group">
            <div class="mv-gh" @click="toggle(g.key)">
              <span class="chev">{{ g.open ? '⌄' : '›' }}</span>
              <span class="mv-gt">{{ g.title }}</span>
              <span class="mv-gc">{{ g.items.length }} 条 · {{ money(g.amount) }}</span>
            </div>

            <div v-show="g.open" class="mv-gl">
              <div v-for="r in g.items" :key="r.id" class="mv-row">
                <span class="mv-d num">{{ day(r.happen_at).slice(5) }}</span>
                <span class="pill" :style="{ color: KIND_META[r.kind].color, background: KIND_META[r.kind].bg }">
                  {{ KIND_META[r.kind].label }}
                </span>
                <span class="mv-txt">{{ summaryOf(r) }}</span>
                <span v-if="r.status === 'doing'" class="tag-doing">待修</span>
                <span class="mv-km num">{{ r.mileage ? km(r.mileage) : '' }}</span>
                <span class="mv-amt num">{{ r.amount ? money(r.amount) : '--' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 右：车务提醒 + 小结 ===== -->
      <div class="mv-side">
        <div class="side-card" :class="maintainCard.cls">
          <div class="sc-t">
            {{ maintainCard.title }}
            <span class="sc-src">· 来自车务提醒</span>
          </div>
          <div class="sc-b">
            <template v-if="maintainCard.left">
              {{ maintainCard.next }}，<b>{{ maintainCard.left }}</b><br />
            </template>
            <span class="dim">{{ maintainCard.sub }}</span>
          </div>
          <div class="sc-a" @click="goAffair">去车务台账看全部 ›</div>
        </div>

        <div class="side-card">
          <div class="sc-t plain">近 12 个月</div>
          <div class="sc-b">
            维保成本 <b>{{ money(y12.total) }}</b><br />
            <template v-if="y12.perKm">每公里 <b>{{ y12.perKm }}</b><br /></template>
            维修 {{ y12.repair }} 次 · 保养 {{ y12.service }} 次
          </div>
        </div>

        <div class="side-card">
          <div class="sc-t plain">最近一次保养</div>
          <div class="sc-b">
            <template v-if="lastService">
              {{ day(lastService.happen_at) }} · {{ lastService.mileage ? km(lastService.mileage) : '未记里程' }}<br />
              {{ summaryOf(lastService) }}<span v-if="lastService.amount"> · {{ money(lastService.amount) }}</span>
            </template>
            <span v-else class="dim">还没有保养记录</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * 单车维保（车辆档案 → 维保）
 * ------------------------------------------------------------
 * 左：按年月分组折叠（组头带「几条 · 多少钱」）
 * 右：车务提醒的保养状态（同一套 levelOf，不另算）+ 近 12 个月小结
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { loadByPlate, loadVehicleBrief, KIND_META, money, km, day, summaryOf } from '@/utils/maintenance'
import { loadCertMap, fetchCurrentKm, levelOf } from '@/utils/vehicleAffair'

const route = useRoute()
const router = useRouter()

const plate = ref(String(route.query.plate || ''))
const rows = ref([])
const brief = ref({})
const loading = ref(false)
const cert = ref(null)
const curKm = ref(null)
const openKeys = ref([])

const stats = computed(() => {
  const s = { total: 0, repair: 0, service: 0, tire: 0 }
  rows.value.forEach((r) => {
    s.total += Number(r.amount) || 0
    if (s[r.kind] !== undefined) s[r.kind] += 1
  })
  return s
})

const lastService = computed(() => rows.value.find((r) => r.kind === 'service') || null)

const y12 = computed(() => {
  const from = dayjs().subtract(12, 'month').format('YYYY-MM-DD')
  const list = rows.value.filter((r) => day(r.happen_at) >= from)
  const total = list.reduce((n, r) => n + (Number(r.amount) || 0), 0)
  const kms = list.map((r) => Number(r.mileage) || 0).filter(Boolean)
  const span = kms.length > 1 ? Math.max(...kms) - Math.min(...kms) : 0
  return {
    total,
    repair: list.filter((r) => r.kind === 'repair').length,
    service: list.filter((r) => r.kind === 'service').length,
    perKm: span > 0 ? `¥${(total / span).toFixed(2)}` : '',
  }
})

/* 车务保养状态（口径完全复用 vehicleAffair.levelOf，不自己算） */
const maintainCard = computed(() => {
  const c = cert.value
  if (!c) {
    return {
      cls: 'is-gray',
      title: '还没录保养信息',
      next: '',
      left: '',
      sub: '车务里这辆车还没建保养档，去车务台账补「上次保养里程」就能开始提醒。',
    }
  }
  const r = levelOf(c, curKm.value)
  const next = Number(c.last_maintain_km || 0) + Number(c.maintain_interval_km || 10000)
  const cls =
    r.level === '已逾期'
      ? 'is-red'
      : r.level === '临近' || r.level === '快到期'
        ? 'is-amber'
        : r.level === '正常'
          ? 'is-green'
          : 'is-gray'

  if (r.level === '需核对' || r.level === '未录入') {
    return {
      cls: 'is-gray',
      title: '保养状态待核对',
      next: '',
      left: '',
      sub: c.last_maintain_km
        ? '取不到这辆车当前里程（东风接口异常），暂时算不出还剩多少。'
        : '车务里还没填「上次保养里程」，补上就能自动算。',
    }
  }

  const num = (v) => Math.abs(Math.round(v)).toLocaleString('en-US')
  return {
    cls,
    title: r.level === '已逾期' ? '已经该保养了' : r.level === '正常' ? '保养还在期内' : '快要保养了',
    next: `下次 ${next.toLocaleString('en-US')} km`,
    left: r.left > 0 ? `还差 ${num(r.left)} km` : `已超 ${num(r.left)} km`,
    sub: `上次 ${day(c.last_maintain_date)} · ${c.last_maintain_km ? km(c.last_maintain_km) : '未记里程'}`,
  }
})

/* 分组 */
const groups = computed(() => {
  const map = new Map()
  rows.value.forEach((r) => {
    const key = day(r.happen_at).slice(0, 7)
    if (!map.has(key)) map.set(key, { key, items: [], amount: 0 })
    const g = map.get(key)
    g.items.push(r)
    g.amount += Number(r.amount) || 0
  })
  const list = Array.from(map.values()).sort((a, b) => (a.key < b.key ? 1 : -1))
  return list.map((g) => {
    const [y, m] = g.key.split('-')
    return {
      ...g,
      title: `${y} 年 ${Number(m)} 月`,
      open: openKeys.value.includes(g.key),
    }
  })
})

const toggle = (key) => {
  const i = openKeys.value.indexOf(key)
  if (i >= 0) openKeys.value.splice(i, 1)
  else openKeys.value.push(key)
}

const goBack = () => router.back()
const goLedger = () => router.push('/maintenance')
const goAffair = () => router.push('/affair/ledger')

async function load() {
  if (!plate.value) return
  loading.value = true
  try {
    rows.value = await loadByPlate(plate.value)
    /* 默认展开最近两个月 */
    openKeys.value = Array.from(new Set(rows.value.map((r) => day(r.happen_at).slice(0, 7)))).slice(0, 2)
    const bmap = await loadVehicleBrief([plate.value])
    brief.value = bmap[plate.value] || {}
  } catch (e) {
    console.error('加载单车维保失败', e)
    ElMessage.error('加载失败：' + String((e && e.message) || '').slice(0, 60))
  } finally {
    loading.value = false
  }

  /* 车务状态单独拉，失败不影响左边 */
  try {
    const map = await loadCertMap(plate.value)
    cert.value = map.maintain || null
    if (cert.value && cert.value.last_maintain_km) {
      curKm.value = await fetchCurrentKm(plate.value)
    }
  } catch (e) {
    cert.value = null
  }
}

onMounted(load)
</script>

<style scoped>
.mv-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 16px 18px;
  box-sizing: border-box;
  gap: 12px;
}
.mv-head {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fff;
  border: 1px solid #e6ecf3;
  border-radius: 10px;
  padding: 12px 16px;
}
.mv-back {
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 13px;
  cursor: pointer;
  padding: 0 4px 0 0;
}
.mv-back:hover { color: var(--brand-primary); }
.mv-plate {
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0.5px;
  color: #0f172a;
}
.mv-org { font-size: 12px; color: #94a3b8; }
.mv-sum {
  margin-left: 12px;
  font-size: 12.5px;
  color: #64748b;
}
.mv-sum b { color: var(--brand-primary); font-size: 13.5px; }
.mv-actions { margin-left: auto; }

.mv-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
}
.mv-main {
  flex: 1;
  min-width: 0;
  background: #fff;
  border: 1px solid #e6ecf3;
  border-radius: 10px;
  padding: 10px 12px;
  overflow-y: auto;
}
.mv-state {
  padding: 60px 0;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
}

.mv-group + .mv-group { margin-top: 10px; }
.mv-gh {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #f8fafc;
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
}
.mv-gh:hover { background: #f1f5f9; }
.chev { color: #94a3b8; font-size: 12px; width: 10px; }
.mv-gt { font-size: 12.5px; font-weight: 700; color: #334155; }
.mv-gc { margin-left: auto; font-size: 11.5px; color: #94a3b8; font-variant-numeric: tabular-nums; }

.mv-gl { margin-top: 2px; }
.mv-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid #f5f7fa;
  font-size: 12.5px;
}
.mv-row:last-child { border-bottom: none; }
.mv-d { flex: 0 0 48px; color: #94a3b8; font-size: 12px; }
.mv-txt {
  flex: 1;
  min-width: 0;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mv-km { flex: 0 0 92px; text-align: right; color: #94a3b8; font-size: 12px; }
.mv-amt { flex: 0 0 84px; text-align: right; font-weight: 700; color: #0f172a; }

.pill {
  display: inline-flex;
  align-items: center;
  font-size: 10.5px;
  font-weight: 700;
  border-radius: 4px;
  padding: 1px 6px;
  flex: 0 0 auto;
}
.tag-doing {
  font-size: 9.5px;
  font-weight: 700;
  color: #b45309;
  background: #fef3c7;
  border-radius: 3px;
  padding: 1px 4px;
}
.num { font-variant-numeric: tabular-nums; }

/* 右栏 */
.mv-side {
  flex: 0 0 268px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}
.side-card {
  background: #fff;
  border: 1px solid #eef1f5;
  border-radius: 10px;
  padding: 12px 14px;
}
.side-card.is-red { background: #fef2f2; border-color: #fbd5db; }
.side-card.is-amber { background: #fffbeb; border-color: #fde68a; }
.side-card.is-green { background: #f0fdf4; border-color: #bbf7d0; }
.side-card.is-gray { background: #f8fafc; }
.sc-t { font-size: 11.5px; font-weight: 700; color: #0f172a; }
.side-card.is-red .sc-t { color: #c8102e; }
.side-card.is-amber .sc-t { color: #b45309; }
.side-card.is-green .sc-t { color: #15803d; }
.sc-t.plain { color: #94a3b8; font-weight: 600; }
.sc-src { font-weight: 400; color: #94a3b8; }
.sc-b {
  font-size: 12px;
  color: #334155;
  line-height: 1.75;
  margin-top: 6px;
}
.sc-b b { font-weight: 700; }
.sc-b .dim { color: #94a3b8; }
.sc-a {
  margin-top: 8px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--brand-primary);
  cursor: pointer;
}
</style>
