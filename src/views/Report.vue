<template>
  <div class="op-page">
    <!-- ===== 顶部：粒度 + 范围 ===== -->
    <div class="op-head fade-up">
      <div class="op-title">
        <span class="op-bar"></span>
        <h2>车队运营分析</h2>
        <span class="op-sub">运单 × 费用 · 单公里成本是核心指标</span>
      </div>

      <div class="op-ctrl">
        <div class="seg">
          <button v-for="g in GRANS" :key="g.key" class="seg-i"
            :class="{ on: gran === g.key }" @click="gran = g.key">{{ g.label }}</button>
        </div>

        <div class="seg">
          <button class="seg-i" :class="{ on: scopeType === 'all' }" @click="scopeType = 'all'">全部</button>
          <button class="seg-i" :class="{ on: scopeType === 'fleet' }" @click="scopeType = 'fleet'">车队</button>
          <button class="seg-i" :class="{ on: scopeType === 'vehicle' }" @click="scopeType = 'vehicle'">单车</button>
        </div>

        <el-select v-if="scopeType === 'fleet'" v-model="curFleet" filterable
          placeholder="选车队" size="small" style="width: 148px">
          <el-option v-for="f in fleetOptions" :key="f" :label="f" :value="f" />
        </el-select>
        <el-select v-if="scopeType === 'vehicle'" v-model="curPlate" filterable
          placeholder="选车辆" size="small" style="width: 148px">
          <el-option v-for="v in plateList" :key="v" :label="v" :value="v" />
        </el-select>

        <el-button size="small" :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </div>
    </div>

    <template v-if="ready">
      <!-- ① 全部 -->
      <template v-if="scopeType === 'all'">
        <div class="kpis fade-up">
          <div class="kpi hero">
            <div class="kpi-k">运单</div>
            <div class="kpi-v num">{{ total.trips }}</div>
            <div class="kpi-d">完成 {{ total.done }} · 在途 {{ total.running }}</div>
          </div>
          <div class="kpi">
            <div class="kpi-k">总里程</div>
            <div class="kpi-v num">{{ fmtInt(total.km) }}</div>
            <div class="kpi-d">km · 均 {{ total.avgKm }} km/趟</div>
          </div>
          <div class="kpi">
            <div class="kpi-k">费用支出</div>
            <div class="kpi-v num" style="color:#C8102E">¥{{ fmtMoney(total.fee) }}</div>
            <div class="kpi-d" :class="total.feeMom === null ? '' : (total.feeMom >= 0 ? 'up' : 'down')">
              {{ total.feeMom === null ? '上月无数据' : '环比 ' + signed(total.feeMom) + '%' }}
            </div>
          </div>
          <div class="kpi" :class="Number(total.costPerKm) <= Number(total.prevCostPerKm) ? 'good' : 'warn'">
            <div class="kpi-k">单公里成本</div>
            <div class="kpi-v num">¥{{ total.costPerKm || '—' }}</div>
            <div class="kpi-d" :class="total.costMom === null ? '' : (total.costMom <= 0 ? 'down' : 'up')">
              {{ total.costMom === null ? '上月无数据' : '环比 ' + signed(total.costMom) + '%' }}
            </div>
          </div>
          <div class="kpi">
            <div class="kpi-k">准时率</div>
            <div class="kpi-v num">{{ total.onTime === null ? '—' : total.onTime + '%' }}</div>
            <div class="kpi-d">按到达时间判定</div>
          </div>
        </div>

        <div class="two fade-up">
          <div class="panel">
            <div class="p-hd">
              <span class="p-t">运单量 vs 费用</span>
              <span class="p-s">{{ rangeLabel }} · 按{{ granLabel }}</span>
            </div>
            <div class="chart">
              <svg :viewBox="`0 0 ${CH.w} ${CH.h}`" preserveAspectRatio="none">
                <g v-for="(b, i) in bars" :key="'b' + i">
                  <rect :x="b.x" y="0" :width="b.w" :height="b.tripH" rx="2" fill="#DBEAFE" />
                  <rect :x="b.x + b.w + 2" y="0" :width="b.fw" :height="b.feeH" rx="2" fill="#FBB6C0" />
                </g>
              </svg>
            </div>
            <div class="axis-x">
              <span v-for="b in bars" :key="'x' + b.label">{{ b.label }}</span>
            </div>
            <div class="legend-row">
              <span><i style="background:#DBEAFE"></i>运单量</span>
              <span><i style="background:#FBB6C0"></i>费用</span>
            </div>
          </div>

          <div class="panel">
            <div class="p-hd"><span class="p-t">费用结构</span><span class="p-s">按类型</span></div>
            <div style="display:flex;align-items:center;gap:14px">
              <div class="donut" :style="{ background: donutBg }">
                <div class="donut-c num">¥{{ fmtShort(total.fee) }}</div>
              </div>
              <div class="legend">
                <span v-for="t in feeTypes" :key="t.type">
                  <i :style="{ background: t.color }"></i>{{ t.label }} {{ t.pct }}%
                </span>
                <span v-if="!feeTypes.length" class="muted">这段时间没有费用</span>
              </div>
            </div>
          </div>
        </div>

        <div class="panel fade-up" style="margin-top:12px">
          <div class="p-hd">
            <span class="p-t">车辆表现</span>
            <span class="p-s">按单公里成本升序（越低越好）</span>
          </div>
          <el-table :data="vehicleRows" class="custom-table" size="small">
            <el-table-column label="车辆" min-width="116">
              <template #default="{ row }"><span class="t-name num">{{ row.plate }}</span></template>
            </el-table-column>
            <el-table-column label="趟数" prop="trips" width="70" align="right" sortable />
            <el-table-column label="里程" prop="km" width="94" align="right" sortable>
              <template #default="{ row }"><span class="num">{{ fmtInt(row.km) }}</span></template>
            </el-table-column>
            <el-table-column label="费用" prop="fee" width="116" align="right" sortable>
              <template #default="{ row }"><span class="num">¥{{ fmtMoney(row.fee) }}</span></template>
            </el-table-column>
            <el-table-column label="单公里成本" prop="costPerKm" width="110" align="right" sortable>
              <template #default="{ row }">
                <span class="num" :style="{ color: colorOf(row.costPerKm), fontWeight: 800 }">
                  {{ row.costPerKm ? '¥' + row.costPerKm : '—' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="准时率" prop="onTime" width="84" align="right" sortable>
              <template #default="{ row }">
                <span class="num" :class="{ muted: row.onTime === null }">
                  {{ row.onTime === null ? '—' : row.onTime + '%' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="判断" width="84">
              <template #default="{ row }">
                <span class="judge" :class="row.judge.cls">{{ row.judge.text }}</span>
              </template>
            </el-table-column>
            <el-table-column label="" width="54" align="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="drillInto(row.plate)">明细</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </template>

      <!-- ② 车队 -->
      <template v-else-if="scopeType === 'fleet'">
        <div class="kpis fade-up" style="grid-template-columns:repeat(4,1fr)">
          <div class="kpi hero">
            <div class="kpi-k">{{ curFleet }} · 运单</div>
            <div class="kpi-v num">{{ total.trips }}</div>
            <div class="kpi-d">{{ fleetPlates.length }} 台车 · 完成 {{ total.done }}</div>
          </div>
          <div class="kpi">
            <div class="kpi-k">里程</div>
            <div class="kpi-v num">{{ fmtInt(total.km) }}</div>
            <div class="kpi-d">km · 均 {{ total.avgKm }}/趟</div>
          </div>
          <div class="kpi">
            <div class="kpi-k">费用支出</div>
            <div class="kpi-v num" style="color:#C8102E">¥{{ fmtMoney(total.fee) }}</div>
            <div class="kpi-d" :class="total.feeMom === null ? '' : (total.feeMom >= 0 ? 'up' : 'down')">
              {{ total.feeMom === null ? '上月无数据' : '环比 ' + signed(total.feeMom) + '%' }}
            </div>
          </div>
          <div class="kpi" :class="costClass">
            <div class="kpi-k">队内单公里</div>
            <div class="kpi-v num">¥{{ total.costPerKm || '—' }}</div>
            <div class="kpi-d">{{ allAvgCost ? '全局均值 ¥' + allAvgCost : '—' }}</div>
          </div>
        </div>

        <div class="panel fade-up" style="margin-bottom:12px">
          <div class="p-hd">
            <span class="p-t">队内车辆</span>
            <span class="p-s">
              按单公里成本升序 · 点「明细」看单车

            </span>
          </div>
          <el-table :data="fleetVehicleRows" class="custom-table" size="small">
            <el-table-column label="车辆" min-width="116">
              <template #default="{ row }"><span class="t-name num">{{ row.plate }}</span></template>
            </el-table-column>
            <el-table-column label="趟数" prop="trips" width="70" align="right" sortable />
            <el-table-column label="里程" prop="km" width="94" align="right" sortable>
              <template #default="{ row }"><span class="num">{{ fmtInt(row.km) }}</span></template>
            </el-table-column>
            <el-table-column label="费用" prop="fee" width="116" align="right" sortable>
              <template #default="{ row }"><span class="num">¥{{ fmtMoney(row.fee) }}</span></template>
            </el-table-column>
            <el-table-column label="单公里成本" prop="costPerKm" width="110" align="right" sortable>
              <template #default="{ row }">
                <span class="num" :style="{ color: colorOf(row.costPerKm), fontWeight: 800 }">
                  {{ row.costPerKm ? '¥' + row.costPerKm : '—' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="准时率" prop="onTime" width="84" align="right" sortable>
              <template #default="{ row }">
                <span class="num" :class="{ muted: row.onTime === null }">
                  {{ row.onTime === null ? '—' : row.onTime + '%' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="判断" width="84">
              <template #default="{ row }"><span class="judge" :class="row.judge.cls">{{ row.judge.text }}</span></template>
            </el-table-column>
            <el-table-column label="" width="54" align="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="drillInto(row.plate)">明细</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div class="two fade-up">
          <div class="panel">
            <div class="p-hd"><span class="p-t">队内费用构成</span><span class="p-s">¥{{ fmtShort(total.fee) }}</span></div>
            <div style="display:flex;align-items:center;gap:14px">
              <div class="donut" :style="{ background: donutBg }">
                <div class="donut-c num">¥{{ fmtShort(total.fee) }}</div>
              </div>
              <div class="legend">
                <span v-for="t in feeTypes" :key="t.type">
                  <i :style="{ background: t.color }"></i>{{ t.label }} {{ t.pct }}%
                </span>
                <span v-if="!feeTypes.length" class="muted">这段时间没有费用</span>
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="p-hd"><span class="p-t">队内异常</span></div>
            <div class="concl-list">
              <p v-for="(c, i) in fleetAlerts" :key="i" :class="c.cls">
                <b>{{ c.k }}</b>{{ c.text }}
              </p>
              <p v-if="!fleetAlerts.length" class="muted">这个队没有明显异常</p>
            </div>
          </div>
        </div>
      </template>

      <!-- ③ 单车 -->
      <template v-else>
        <div class="kpis fade-up">
          <div class="kpi hero">
            <div class="kpi-k">{{ curPlate }} · 趟数</div>
            <div class="kpi-v num">{{ total.trips }}</div>
            <div class="kpi-d">完成 {{ total.done }}</div>
          </div>
          <div class="kpi">
            <div class="kpi-k">里程</div>
            <div class="kpi-v num">{{ fmtInt(total.km) }}</div>
            <div class="kpi-d">km · 均 {{ total.avgKm }}/趟</div>
          </div>
          <div class="kpi">
            <div class="kpi-k">费用</div>
            <div class="kpi-v num" style="color:#C8102E">¥{{ fmtMoney(total.fee) }}</div>
            <div class="kpi-d" :class="total.feeMom === null ? '' : (total.feeMom >= 0 ? 'up' : 'down')">
              {{ total.feeMom === null ? '上月无数据' : '环比 ' + signed(total.feeMom) + '%' }}
            </div>
          </div>
          <div class="kpi" :class="costClass">
            <div class="kpi-k">单公里成本</div>
            <div class="kpi-v num">¥{{ total.costPerKm || '—' }}</div>
            <div class="kpi-d">{{ allAvgCost ? '全局均值 ¥' + allAvgCost : '—' }}</div>
          </div>
          <div class="kpi">
            <div class="kpi-k">准时率</div>
            <div class="kpi-v num">{{ total.onTime === null ? '—' : total.onTime + '%' }}</div>
            <div class="kpi-d">按到达时间判定</div>
          </div>
        </div>

        <div class="panel fade-up" style="margin-bottom:12px">
          <div class="p-hd">
            <span class="p-t">成本走势</span>
            <span class="p-s">{{ curPlate }} · 按{{ granLabel }}</span>
          </div>
          <div class="chart tall">
            <svg :viewBox="`0 0 ${CH.w} ${CH.h}`" preserveAspectRatio="none">
              <line v-if="avgY !== null" x1="0" :y1="avgY" :x2="CH.w" :y2="avgY"
                stroke="#CBD5E1" stroke-width="1" stroke-dasharray="4 3" />
              <text v-if="avgY !== null" x="4" :y="avgY > 12 ? avgY - 4 : avgY + 10"
                font-size="10" fill="#64748B">全局均值 ¥{{ allAvgCost }}</text>
              <polyline v-if="costLine" :points="costLine" fill="none"
                stroke="#C8102E" stroke-width="2.4" stroke-linejoin="round" />
              <g v-if="costLine" fill="#C8102E">
                <circle v-for="(p, i) in costPts" :key="'cc' + i" :cx="p.x" :cy="p.y" r="2.4" />
              </g>
            </svg>
          </div>
          <div class="axis-x">
            <span v-for="b in bars" :key="'bx' + b.label">{{ b.label }}</span>
          </div>
          <div v-if="trendText" class="concl" :class="trendCls">{{ trendText }}</div>
        </div>

        <div class="three fade-up">
          <div class="panel">
            <div class="p-hd"><span class="p-t">跑什么线</span></div>
            <div class="bars">
              <div v-for="r in routeRows" :key="r.key" class="bar-row">
                <span class="bar-n">{{ r.key }}</span>
                <span class="bar-t"><i :style="{ width: r.pct + '%', background: '#1D4ED8' }"></i></span>
                <span class="bar-v">{{ r.count }} 趟</span>
              </div>
              <div v-if="!routeRows.length" class="muted" style="font-size:11px">没有线路数据</div>
            </div>
          </div>

          <div class="panel">
            <div class="p-hd"><span class="p-t">钱花在哪</span></div>
            <div class="legend" style="gap:7px">
              <span v-for="t in feeTypes" :key="'f' + t.type">
                <i :style="{ background: t.color }"></i>{{ t.label }} ¥{{ fmtMoney(t.amount) }}（{{ t.pct }}%）
              </span>
              <span v-if="!feeTypes.length" class="muted">这段时间没有费用</span>
            </div>
          </div>

          <div class="panel">
            <div class="p-hd"><span class="p-t">结论</span></div>
            <div class="concl-list">
              <p v-for="(c, i) in conclusions" :key="i" :class="c.cls">
                <b>{{ c.k }}</b>{{ c.text }}
              </p>
              <p v-if="!conclusions.length" class="muted">数据太少，暂时给不出结论</p>
            </div>
          </div>
        </div>
      </template>
    </template>

    <div v-else-if="!loading" class="op-empty">
      <div class="op-empty-t">这段时间没有运单</div>
      <div class="op-empty-s">换个时间段或粒度试试</div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { supabase } from '@/utils/supabase'
import { moduleFlags, ensureModuleFlags } from '@/utils/modules'

/* ================= 用户与隔离 ================= */
const currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('currentUser') || 'null') || {} } catch { return {} }
})()
const isAdmin = currentUser.role === 'admin'
const myAccount = currentUser.masterAccount || currentUser.account || ''
/** ⭐ 所有查询都过这层：客户之间不能串数据 */
const scope = (q) => (isAdmin ? q : q.eq('owner_account', myAccount))

/* ================= 常量 ================= */
const GRANS = [
  { key: 'day', label: '日', days: 14, unit: 'day' },
  { key: 'week', label: '周', days: 84, unit: 'week' },
  { key: 'month', label: '月', days: 365, unit: 'month' },
  { key: 'quarter', label: '季', days: 730, unit: 'quarter' },
  { key: 'half', label: '半年', days: 1460, unit: 'half' },
  { key: 'year', label: '年', days: 1825, unit: 'year' },
]

const FEE_TYPES = [
  { key: 'expense', label: '费用上报', color: '#C8102E' },
  { key: 'subsidy', label: '补贴', color: '#15803D' },
  { key: 'weigh', label: '过磅', color: '#7C3AED' },
  { key: 'loan', label: '借款', color: '#1D4ED8' },
  { key: 'violation', label: '违章', color: '#B45309' },
]
const MONEY_TYPES = FEE_TYPES.map((t) => t.key)

const CH = { w: 460, h: 92, pad: 8 }

/* ================= 状态 ================= */
const loading = ref(false)
const gran = ref('month')
/** 日期范围：null = 按粒度自动推（日14天/周84天/月365天…）；选了就按选的 */
const dateRange = ref(null)
const scopeType = ref('all')
const curPlate = ref('')
const curFleet = ref('')
/** 车牌 → 车队（运单上没写 fleet_name 时的兜底） */
const fleetMap = ref({})

const bills = ref([])
const fees = ref([])
const prevBills = ref([])
const prevFees = ref([])

const granConf = computed(() => GRANS.find((g) => g.key === gran.value) || GRANS[2])
const granLabel = computed(() => granConf.value.label)
const rangeLabel = computed(() => {
  const [a, b] = currentRange()
  const ya = dayjs(a).year()
  const yb = dayjs(b).year()
  /* 跨年才带年，同一年只显示月日，省地方 */
  const f = (d, withYear) => dayjs(d).format(withYear ? 'YYYY.M.D' : 'M.D')
  const cross = ya !== yb
  return `${f(a, cross)} – ${f(b, cross)}`
})

/* ================= 取数 ================= */
/**
 * 取数区间
 * ⭐ 用户手选了日期就以日期为准；没选才按粒度推（日 14 天 / 月 365 天…）
 */
function currentRange() {
  if (dateRange.value && dateRange.value.length === 2) {
    return [dateRange.value[0], dateRange.value[1]]
  }
  const d = granConf.value.days
  return [dayjs().subtract(d, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')]
}

/** 对比区间：等长的前一段（环比用） */
function prevRange(from, to) {
  const days = dayjs(to).diff(dayjs(from), 'day') + 1
  return [
    dayjs(from).subtract(days, 'day').format('YYYY-MM-DD'),
    dayjs(from).subtract(1, 'day').format('YYYY-MM-DD'),
  ]
}

async function fetchBills([from, to]) {
  let q = supabase.from('waybills').select('*')
    .gte('create_time', from).lte('create_time', to + ' 23:59:59').limit(5000)
  q = scope(q)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

async function fetchFees([from, to]) {
  let q = supabase.from('reports')
    .select('id,type,amount,status,create_time,plate,waybill_no')
    .gte('create_time', from).lte('create_time', to + ' 23:59:59')
    .in('type', MONEY_TYPES).limit(5000)
  q = scope(q)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

async function load() {
  loading.value = true
  try {
    const cur = currentRange()
    const prev = prevRange(cur[0], cur[1])
    const [b, f, pb, pf] = await Promise.all([
      fetchBills(cur), fetchFees(cur),
      fetchBills(prev), fetchFees(prev),
    ])
    bills.value = b
    fees.value = f

    /* 车队映射：运单自己带 fleet_name 最好；老运单没有，就用车牌反查 vehicles */
    try {
      /* ⭐ 车队 = 车辆的组织（vehicles.org）。
         运单本身没有车队字段，靠「车牌 → 车辆 → 组织」关联出来。
         ⚠️ vehicles 的隔离字段是 customer_id / org（不是 owner_account），
         拿不到归属就不查 —— 宁可全部显示「未分组」，也不能跨租户读车牌。 */
      const cid = currentUser.customerId || currentUser.customer_id || currentUser.cid || ''
      if (isAdmin || cid) {
        let vq = supabase.from('vehicles').select('plate,org')
        if (!isAdmin) vq = vq.eq('customer_id', cid)
        const { data: vs } = await vq
        const m = {}
        ;(vs || []).forEach((v) => {
          const p = String((v && v.plate) || '').trim()
          /* org 优先；fleet_name 留着兼容（万一以后单独维护车队） */
          const fn = String((v && v.org) || (v && v.fleet_name) || '').trim()
          if (p && fn) m[p] = fn
        })
        fleetMap.value = m
      }
    } catch (e) { /* 查不到就都用「未分组」 */ }
    prevBills.value = pb
    prevFees.value = pf
    if (!curPlate.value && b.length) curPlate.value = plateOf(b[0])
  } catch (e) {
    ElMessage.error(e.message || '加载失败')
    bills.value = []
    fees.value = []
  } finally {
    loading.value = false
  }
}

/* ================= 聚合 ================= */
const DONE = '已完成'
/**
 * 车牌解析
 * ⚠️ 多指派时 waybills.vehicle 会退化成「多种」「N辆」「--」，不是真车牌。
 *    先看 assignments 里 method === 'vehicle' 的 target。
 */
function plateOf(b) {
  const as = b.assignments || []
  const hit = as.find((a) => (a.method || a.assignMethod) === 'vehicle')
  if (hit && hit.target) return hit.target
  const raw = b.vehicle || b.plate || ''
  if (raw && !['多种', '--', '—', ''].includes(raw) && !/^\d+辆$/.test(raw)) return raw
  /* 多指派（分车承运）的运单分摊不到单一车牌，单独归类 */
  return '多车'
}
const kmOf = (b) => Number(b.plan_distance) || 0

/**
 * 准时判定
 * ⭐ 库里没有 plan_arrive_time，但发布运单时高德算过 plan_duration（**分钟**）：
 *    计划到达 = depart_time + plan_duration
 *    容差给 15%，物流路上堵一下不该算晚点
 */
function isOnTime(b) {
  if (!b.depart_time || !b.arrive_time) return null
  const dur = Number(b.plan_duration) || 0
  if (!dur) return null
  const actual = dayjs(b.arrive_time).diff(dayjs(b.depart_time), 'minute')
  if (actual <= 0) return null
  return actual <= dur * 1.15 ? 1 : 0
}

function agg(list, feeList, plate) {
  /* plate 传字符串 = 按车；传函数 = 自定义过滤（车队用）；空 = 不过滤 */
  const fn = typeof plate === 'function' ? plate : (plate ? (o) => plateOf(o) === plate : null)
  const bs = fn ? list.filter(fn) : list
  const fs = fn ? feeList.filter(fn) : feeList
  const trips = bs.length
  const km = bs.reduce((s, b) => s + kmOf(b), 0)
  const fee = fs.reduce((s, f) => s + (Number(f.amount) || 0), 0)
  const ot = bs.map(isOnTime).filter((v) => v !== null)
  return {
    trips,
    done: bs.filter((b) => b.status === DONE).length,
    running: bs.filter((b) => !['已完成', '已取消'].includes(b.status)).length,
    km,
    fee,
    onTime: ot.length ? Math.round((ot.reduce((a, b) => a + b, 0) / ot.length) * 100) : null,
    costPerKm: km > 0 ? (fee / km).toFixed(1) : 0,
    avgKm: trips ? Math.round(km / trips) : 0,
  }
}

const total = computed(() => {
  const fn = curFilter()
  const cur = agg(bills.value, fees.value, fn)
  const prev = agg(prevBills.value, prevFees.value, fn)
  /** 基准为 0 时返回 null：「新增」比「+100%」诚实 */
  const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : (a > 0 ? null : 0))
  return {
    ...cur,
    prevCostPerKm: prev.costPerKm,
    feeMom: pct(cur.fee, prev.fee),
    costMom: pct(Number(cur.costPerKm), Number(prev.costPerKm)),
  }
})

/**
 * 这条记录属于哪个车队（= 车辆所属组织）
 * ⭐ 业务前提：管理端加车时车辆就挂在最大机构下，只能往下分，不存在「没有组织」的车。
 *    所以查不到组织 = 这台车不在车辆档案里（历史/测试数据），直接返回空，
 *    这类运单不参与车队维度统计，也不出现在车队下拉里。
 */
function fleetOf(o) {
  const own = String((o && o.fleet_name) || '').trim()
  if (own) return own
  const p = plateOf(o || {})
  return fleetMap.value[p] || ''
}

/** 当前范围对应的过滤函数（null = 不过滤） */
function curFilter() {
  if (scopeType.value === 'vehicle') return (o) => plateOf(o || {}) === curPlate.value
  if (scopeType.value === 'fleet') return (o) => fleetOf(o) === curFleet.value
  return null
}

const allAvgCost = computed(() => agg(bills.value, fees.value, '').costPerKm)

/**
 * 单公里成本的卡片配色：三档，中间保持中性
 * ⭐ 之前是「大于均值就标红」，导致 16.4 vs 16.37 这种浮点差异也变红。
 *    成本本来就没有绝对好坏，只有「明显低于均值」和「明显高于均值」才值得标色。
 */
const costClass = computed(() => {
  const c = Number(total.value.costPerKm) || 0
  const a = Number(allAvgCost.value) || 0
  if (!c || !a) return ''
  if (c <= a * 0.9) return 'good'
  if (c >= a * 1.15) return 'warn'
  return ''
})

const ready = computed(() => bills.value.length > 0)
/** 所有出现过的车队 */
const fleetOptions = computed(() => {
  const set = new Set()
  bills.value.forEach((b) => {
    const f = fleetOf(b)
    if (f) set.add(f)
  })
  return [...set].sort()
})

/** 当前车队的车牌集合 */
const fleetPlates = computed(() =>
  [...new Set(bills.value.filter((b) => fleetOf(b) === curFleet.value).map(plateOf))].filter(Boolean)
)

/** 队内车辆表现（和「全部」那张表结构一致，只是限定在队内） */
const fleetVehicleRows = computed(() =>
  vehicleRows.value.filter((r) => fleetMap.value[r.plate] === curFleet.value)
)

/** 队内异常：成本最高的车、违章多的车、准时率低的 */
const fleetAlerts = computed(() => {
  if (scopeType.value !== 'fleet') return []
  const rows = fleetVehicleRows.value.filter((r) => r.plate !== '多车' && r.costPerKm > 0)
  if (!rows.length) return []
  const out = []
  const worst = rows[rows.length - 1]
  const best = rows[0]
  if (worst && worst.costPerKm > best.costPerKm * 1.3) {
    out.push({ k: '成本最高的车：', text: `${worst.plate} 单公里 ¥${worst.costPerKm}，队内最低是 ${best.plate} ¥${best.costPerKm}`, cls: 'bad' })
  }
  const viol = fees.value.filter((f) => f.type === 'violation' && fleetOf(f) === curFleet.value)
  if (viol.length) {
    out.push({ k: '违章：', text: `${viol.length} 笔，合计 ¥${fmtMoney(viol.reduce((s, f) => s + Number(f.amount || 0), 0))}`, cls: 'bad' })
  }
  const lowOt = rows.filter((r) => r.onTime !== null && r.onTime < 80)
  if (lowOt.length) {
    out.push({ k: '准时率偏低：', text: `${lowOt.map((r) => r.plate).slice(0, 2).join('、')} 低于 80%`, cls: '' })
  }
  return out.slice(0, 3)
})

const plateList = computed(() => [...new Set(bills.value.map(plateOf))].filter(Boolean).sort())

/* ================= 分桶 ================= */
function bucketKey(d) {
  const dt = dayjs(d)
  const u = granConf.value.unit
  if (u === 'day') return dt.format('YYYY-MM-DD')
  if (u === 'week') return dt.startOf('week').format('YYYY-MM-DD')
  if (u === 'month') return dt.format('YYYY-MM')
  if (u === 'quarter') return `${dt.year()}-Q${Math.floor(dt.month() / 3) + 1}`
  if (u === 'half') return `${dt.year()}-H${dt.month() < 6 ? 1 : 2}`
  return String(dt.year())
}

function bucketLabel(k) {
  const u = granConf.value.unit
  if (u === 'day' || u === 'week') return dayjs(k).format('MM-DD')
  if (u === 'month') return dayjs(k + '-01').format('M月')
  if (u === 'quarter') return k.replace('-Q', ' Q')
  if (u === 'half') return k.replace('-H', ' H')
  return k
}

const buckets = computed(() => {
  const fn = curFilter()
  const bs = fn ? bills.value.filter(fn) : bills.value
  const fs = fn ? fees.value.filter(fn) : fees.value
  const map = {}
  const get = (t) => {
    const k = bucketKey(t)
    if (!map[k]) map[k] = { trips: 0, fee: 0, km: 0 }
    return map[k]
  }
  bs.forEach((b) => { const g = get(b.create_time); g.trips += 1; g.km += kmOf(b) })
  fs.forEach((f) => { const g = get(f.create_time); g.fee += Number(f.amount) || 0 })
  return Object.keys(map).sort().map((k) => ({
    key: k,
    label: bucketLabel(k),
    ...map[k],
    cost: map[k].km > 0 ? map[k].fee / map[k].km : 0,
  }))
})

const bars = computed(() => {
  const list = buckets.value
  if (!list.length) return []
  const n = list.length
  const gap = 8
  const slot = (CH.w - gap * (n - 1)) / n
  const bw = Math.min(34, Math.max(4, slot * 0.62))
  const fw = Math.min(11, Math.max(2, slot * 0.22))
  const maxTrip = Math.max(...list.map((b) => b.trips), 1)
  const maxFee = Math.max(...list.map((b) => b.fee), 1)
  return list.map((b, i) => ({
    label: b.label,
    x: i * (slot + gap) + (slot - bw - fw - 2) / 2,
    w: bw,
    fw,
    tripH: Math.max(2, (b.trips / maxTrip) * (CH.h - 6)),
    feeH: Math.max(2, (b.fee / maxFee) * (CH.h - 6)),
  }))
})

/** 单车视角：单公里成本折线 + 全局均值虚线 */
const costPts = computed(() => {
  const list = buckets.value.filter((b) => b.cost > 0)
  if (list.length < 2) return []
  const max = Math.max(...list.map((b) => b.cost))
  const min = Math.min(...list.map((b) => b.cost))
  const span = Math.max(max - min, 1)
  const step = CH.w / Math.max(list.length - 1, 1)
  return list.map((b, i) => ({
    x: i * step,
    y: CH.h - 8 - ((b.cost - min) / span) * (CH.h - 20),
  }))
})
const costLine = computed(() => (scopeType.value === 'vehicle' && costPts.value.length
  ? costPts.value.map((p) => `${p.x},${p.y}`).join(' ') : ''))

const avgY = computed(() => {
  const list = buckets.value.filter((b) => b.cost > 0)
  if (!list.length || !allAvgCost.value) return null
  const max = Math.max(...list.map((b) => b.cost))
  const min = Math.min(...list.map((b) => b.cost))
  const span = Math.max(max - min, 1)
  return CH.h - 8 - ((Number(allAvgCost.value) - min) / span) * (CH.h - 20)
})

/* ================= 费用结构 ================= */
const feeTypes = computed(() => {
  const fn = curFilter()
  const fs = fn ? fees.value.filter(fn) : fees.value
  const sum = fs.reduce((s, f) => s + (Number(f.amount) || 0), 0)
  return FEE_TYPES.map((t) => {
    const amount = fs.filter((f) => f.type === t.key).reduce((s, f) => s + (Number(f.amount) || 0), 0)
    return { ...t, amount, pct: sum > 0 ? Math.round((amount / sum) * 100) : 0 }
  }).filter((t) => t.amount > 0).sort((a, b) => b.amount - a.amount)
})

const donutBg = computed(() => {
  const list = feeTypes.value
  if (!list.length) return '#F1F5F9'
  let acc = 0
  const parts = list.map((t) => {
    const from = acc
    acc += t.pct
    return `${t.color} ${from}% ${acc}%`
  })
  return `conic-gradient(${parts.join(', ')})`
})

/* ================= 车辆表 ================= */
function judgeOf(r, median) {
  if (r.plate === '多车') return { text: '分车', cls: 'n' }
  if (!r.costPerKm) return { text: '—', cls: 'n' }
  if (r.trips <= 1) return { text: '样本少', cls: 'n' }
  if (r.costPerKm <= median * 0.85) return { text: '最省', cls: 'g' }
  if (r.costPerKm >= median * 1.3) return { text: '要查', cls: 'r' }
  if (r.costPerKm >= median * 1.1) return { text: '偏贵', cls: 'y' }
  return { text: '稳', cls: 'g' }
}

const vehicleRows = computed(() => {
  const plates = [...new Set(bills.value.map(plateOf))]
  const rows = plates.map((p) => {
    const g = agg(bills.value, fees.value, p)
    return { plate: p, ...g, costPerKm: Number(g.costPerKm) || 0 }
  }).filter((r) => r.trips > 0)

  const costs = rows.map((r) => r.costPerKm).filter((v) => v > 0).sort((a, b) => a - b)
  const median = costs.length ? costs[Math.floor(costs.length / 2)] : 0

  return rows.map((r) => ({ ...r, judge: judgeOf(r, median) }))
    .sort((a, b) => {
      if (a.plate === '多车') return 1
      if (b.plate === '多车') return -1
      if (!a.costPerKm) return 1
      if (!b.costPerKm) return -1
      return a.costPerKm - b.costPerKm
    })
})

const medianCost = computed(() => {
  const costs = vehicleRows.value.map((r) => r.costPerKm).filter((v) => v > 0).sort((a, b) => a - b)
  return costs.length ? costs[Math.floor(costs.length / 2)] : 0
})

function colorOf(v) {
  if (!v) return '#B4BECB'
  const med = medianCost.value || v
  if (v <= med * 0.9) return '#15803D'
  if (v >= med * 1.25) return '#A00D24'
  if (v >= med * 1.08) return '#D97706'
  return '#0F172A'
}

/* ================= 单车：线路 / 结论 ================= */
const routeRows = computed(() => {
  if (scopeType.value !== 'vehicle') return []
  const bs = bills.value.filter((b) => plateOf(b) === curPlate.value)
  const map = {}
  bs.forEach((b) => {
    const k = `${b.pickup || '—'} → ${b.delivery || '—'}`
    map[k] = (map[k] || 0) + 1
  })
  const max = Math.max(...Object.values(map), 1)
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([key, count]) => ({ key, count, pct: Math.round((count / max) * 100) }))
})

const trendInfo = computed(() => {
  const list = buckets.value.filter((b) => b.cost > 0)
  if (list.length < 3) return { text: '', cls: '' }
  const first = list[0].cost
  const last = list[list.length - 1].cost
  const pct = Math.round(((last - first) / first) * 100)
  const avg = Number(allAvgCost.value) || 0
  if (pct > 10) {
    return {
      text: `${curPlate.value} 的单公里成本从 ¥${first.toFixed(1)} 涨到 ¥${last.toFixed(1)}（+${pct}%），全局均值 ¥${avg}`,
      cls: 'bad',
    }
  }
  if (pct < -10) {
    return {
      text: `${curPlate.value} 的单公里成本从 ¥${first.toFixed(1)} 降到 ¥${last.toFixed(1)}（${pct}%），在变好`,
      cls: 'good',
    }
  }
  return { text: `${curPlate.value} 的单公里成本基本平稳（${signed(pct)}%），全局均值 ¥${avg}`, cls: '' }
})
const trendText = computed(() => trendInfo.value.text)
const trendCls = computed(() => trendInfo.value.cls)

const conclusions = computed(() => {
  if (scopeType.value !== 'vehicle') return []
  const out = []
  const c = Number(total.value.costPerKm) || 0
  const avg = Number(allAvgCost.value) || 0

  if (c && avg) {
    const diff = Math.round(((c - avg) / avg) * 100)
    if (diff > 15) out.push({ k: '成本偏高：', text: `单公里 ¥${c}，比全局均值高 ${diff}%`, cls: 'bad' })
    else if (diff < -15) out.push({ k: '成本优秀：', text: `单公里 ¥${c}，比全局均值低 ${Math.abs(diff)}%`, cls: 'good' })
    else out.push({ k: '成本正常：', text: `单公里 ¥${c}，接近全局均值`, cls: '' })
  }

  const viol = fees.value.filter((f) => f.plate === curPlate.value && f.type === 'violation')
  if (viol.length) {
    out.push({
      k: '有违章：',
      text: `${viol.length} 笔违章，合计 ¥${fmtMoney(viol.reduce((s, f) => s + Number(f.amount || 0), 0))}`,
      cls: 'bad',
    })
  }

  if (total.value.onTime && total.value.onTime < 80) {
    out.push({ k: '准时率偏低：', text: `${total.value.onTime}%，建议查线路和卸货时长`, cls: 'bad' })
  }

  const best = vehicleRows.value[0]
  if (best && best.plate !== curPlate.value && best.costPerKm) {
    out.push({ k: '可参考：', text: `${best.plate} 单公里只有 ¥${best.costPerKm}，可对比它的线路和排班`, cls: '' })
  }

  return out.slice(0, 3)
})

/* ================= 工具 ================= */
const fmtMoney = (v) => (Number(v) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtInt = (v) => Math.round(Number(v) || 0).toLocaleString('zh-CN')
const fmtShort = (v) => {
  const n = Number(v) || 0
  return n >= 10000 ? (n / 10000).toFixed(1) + '万' : Math.round(n).toString()
}
const signed = (v) => (v > 0 ? '+' : '') + (Number(v) || 0)
const dash = (v) => (v === null || v === undefined || v === '' ? '—' : v)

function drillInto(plate) {
  curPlate.value = plate
  scopeType.value = 'vehicle'
}

watch(gran, () => load())
watch(dateRange, () => load())
watch(scopeType, (v) => {
  if (v === 'vehicle' && !curPlate.value && plateList.value.length) curPlate.value = plateList.value[0]
  if (v === 'fleet' && !curFleet.value && fleetOptions.value.length) curFleet.value = fleetOptions.value[0]
})

/* 车队数据回来后自动选第一个（放最后，避开 TDZ） */
watch([fleetOptions, scopeType], () => {
  if (scopeType.value === 'fleet' && !curFleet.value && fleetOptions.value.length) {
    curFleet.value = fleetOptions.value[0]
  }
})

onMounted(async () => {
  try { await ensureModuleFlags(currentUser, { force: true }) } catch (e) { /* 忽略 */ }
  await load()
})
</script>

<style scoped>
.op-page { display: flex; flex-direction: column; gap: 12px; padding: 18px 20px 26px; }

.op-head {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  background: #fff; border: 1px solid #E6ECF3; border-radius: 11px; padding: 13px 16px;
}
.op-title { display: flex; align-items: center; gap: 9px; }
.op-bar { width: 3px; height: 15px; border-radius: 2px; background: #1D4ED8; }
.op-title h2 { margin: 0; font-size: 14px; font-weight: 800; color: #0F172A; }
.op-sub { font-size: 12px; color: #64748B; }
.op-ctrl { margin-left: auto; display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }

.seg { display: flex; gap: 2px; background: #EEF2F7; border-radius: 7px; padding: 2px; }
.seg-i {
  font: inherit; font-size: 12.5px; color: #475569; background: transparent; border: none;
  padding: 4px 10px; border-radius: 5px; cursor: pointer; transition: .15s;
}
.seg-i:hover { color: #0F172A; }
.seg-i.on { background: #fff; color: #0F172A; font-weight: 700; box-shadow: 0 1px 2px rgba(15,23,42,.08); }

.kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 11px; }
.kpi { border: 1px solid #EDF1F6; border-radius: 10px; padding: 12px 14px; background: #fff; }
.kpi.hero { background: linear-gradient(135deg, var(--brand-primary-hover), var(--brand-primary-dark)); border-color: transparent; }
.kpi.good { background: #F0FDF4; border-color: #BBF7D0; }
.kpi.warn { background: #FEF2F4; border-color: #FECDD3; }
.kpi-k { font-size: 12px; color: #64748B; }
.kpi.hero .kpi-k { color: rgba(255, 255, 255, .72); }
.kpi.good .kpi-k { color: #166534; }
.kpi.warn .kpi-k { color: #A00D24; }
.kpi-v { font-size: 22px; font-weight: 800; letter-spacing: -.6px; margin-top: 5px; color: #0F172A;
  font-family: var(--num, inherit); font-variant-numeric: tabular-nums; }
.kpi.hero .kpi-v { color: #fff; }
.kpi-d { font-size: 11.5px; margin-top: 5px; color: #64748B; }
.kpi.hero .kpi-d { color: rgba(255, 255, 255, .6); }
.kpi-d.up { color: var(--brand-primary); }
.kpi-d.down { color: #15803D; }

.panel { border: 1px solid #EDF1F6; border-radius: 10px; background: #fff; padding: 13px 15px; }
.p-hd { display: flex; align-items: center; gap: 8px; margin-bottom: 11px; }
.p-t { font-size: 13.5px; font-weight: 800; }
.p-s { font-size: 11.5px; color: #94A3B8; margin-left: auto; }
.two { display: grid; grid-template-columns: 1.5fr 1fr; gap: 12px; }
.three { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }

.chart { height: 96px; }
.chart.tall { height: 112px; }
.chart svg { width: 100%; height: 100%; display: block; overflow: visible; }
.axis-x { display: flex; justify-content: space-between; font-size: 11px; color: #94A3B8; margin-top: 6px; }
.legend-row { display: flex; gap: 14px; margin-top: 10px; font-size: 12px; color: #475569; }
.legend-row i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; margin-right: 4px; }

.donut { width: 92px; height: 92px; border-radius: 50%; position: relative; flex: 0 0 auto; }
.donut::after { content: ''; position: absolute; inset: 21px; background: #fff; border-radius: 50%; }
.donut-c { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 11.5px; font-weight: 800; z-index: 1; }
.legend { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: #475569; }
.legend span { display: flex; align-items: center; gap: 5px; }
.legend i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }

.bars { display: flex; flex-direction: column; gap: 7px; }
.bar-row { display: flex; align-items: center; gap: 9px; font-size: 12px; }
.bar-n { width: 96px; color: #334155; flex: 0 0 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-t { flex: 1; height: 8px; border-radius: 4px; background: #F1F5F9; overflow: hidden; }
.bar-t i { display: block; height: 100%; border-radius: 4px; }
.bar-v { width: 58px; text-align: right; font-weight: 700; color: #0F172A; flex: 0 0 auto; }

.concl { margin-top: 10px; padding: 9px 11px; border-radius: 7px; background: #FAFBFD;
  font-size: 12.5px; color: #334155; line-height: 1.75; }
.concl.bad { background: #FEF2F4; color: #A00D24; }
.concl.good { background: #F0FDF4; color: #166534; }
.concl-list p { margin: 0 0 7px; font-size: 12.5px; line-height: 1.8; color: #334155; }
.concl-list p:last-child { margin-bottom: 0; }
.concl-list b { font-weight: 800; }
.concl-list p.bad { color: #A00D24; }
.concl-list p.good { color: #166534; }

.judge { font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 4px; }
.judge.g { color: #15803D; background: #F0FDF4; }
.judge.y { color: #B45309; background: #FFFBEB; }
.judge.r { color: #A00D24; background: #FEF2F4; }
.judge.n { color: #94A3B8; background: #F5F7FA; }

.t-name { font-size: 13px; font-weight: 700; color: #0F172A; }
.muted { color: #94A3B8; }

.op-empty { padding: 60px 0; text-align: center; }
.op-empty-t { font-size: 14px; font-weight: 700; color: #475569; }
.op-empty-s { font-size: 12.5px; color: #94A3B8; margin-top: 7px; }

:deep(.el-table th.el-table__cell) { font-size: 12px; color: #475569; font-weight: 700; }
:deep(.el-table td.el-table__cell) { padding: 11px 0; }
</style>
