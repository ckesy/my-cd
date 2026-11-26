<template>
  <div class="ai-card" v-if="safeCard">
    <!-- 草稿卡自带标题栏（含完成度与「重新对齐」），这里不再重复一行 -->
    <div v-if="safeCard.type !== 'draft'" class="ch">
      <span class="t">{{ safeCard.title || '查询结果' }}</span>
      <span v-if="safeCard.range" class="rg">{{ safeCard.range }}</span>
      <span v-else-if="safeCard.stat" class="n">
        {{ safeCard.stat.label }} <b>{{ money(safeCard.stat.value) }}</b>
      </span>
    </div>

    <!-- ==================== 表格 ==================== -->
    <div v-if="safeCard.type === 'table'" class="tbl-wrap">
      <table class="tbl">
        <thead>
          <tr>
            <th v-for="c in cols" :key="c.key" :class="c.align">{{ c.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="i">
            <td v-for="c in cols" :key="c.key" :class="[c.align, { num: c.money || c.align === 'right' }]">
              <span v-if="c.money">{{ money(r[c.key]) }}</span>
              <span v-else-if="c.key === 'status'" class="st" :class="statusCls(r[c.key])">
                <i></i>{{ r[c.key] }}
              </span>
              <span v-else :class="{ hi: c.highlight && isHigh(r[c.key]) }">{{ c.key === 'type' ? typeName(r[c.key]) : fmt(r[c.key]) }}</span>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td :colspan="cols.length || 1" class="empty">没有查到记录</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ==================== 待办 ==================== -->
    <div v-else-if="safeCard.type === 'todo'" class="todo-list">
      <div v-for="(r, i) in rows" :key="i" class="todo" :class="{ wb: isWaybillRow(r) }">
        <div class="info">
          <div class="t1">{{ rowTitle(r) }}</div>
          <div class="t2">{{ rowSub(r) }}</div>
        </div>
        <div v-if="!isWaybillRow(r)" class="amt">{{ money(r.amount) }}</div>
        <div v-else-if="r.tripSeq > 1" class="seq">第 {{ r.tripSeq }} 趟</div>
        <button class="go" @click="goRow(r)">{{ isWaybillRow(r) ? '去处理' : '去审批' }}</button>
      </div>
      <div v-if="!rows.length" class="empty">{{ card.emptyText || emptyTodoText }}</div>
    </div>

    <!-- ==================== 派单草稿 ====================
         版式：时间轴（装货 → 卸货）+ 货物卡 + 承运 2×2 + 提示 + 底栏。
         设计定稿 2026-11-26（V3 内容补全版）。 -->
    <div v-else-if="safeCard.type === 'draft'" class="draft">
      <!-- 标题栏：完成度 + 重新对齐（低频动作收到右上角，不占整条） -->
      <div class="dc-head">
        <span class="dh-t">派单草稿</span>
        <span class="dh-m">{{ taskCount }} 个任务</span>
        <span class="dh-r">
          <span class="prog">
            <span class="pbar"><i :style="{ width: fillPct + '%' }"></i></span>
            已填 {{ filledCount }}/{{ fieldTotal }}
          </span>
          <button class="sync-btn" :disabled="refreshing" @click="refresh" :title="refreshing ? '对齐中…' : '重新对齐档案'">
            <span :class="{ spin: refreshing }">↻</span>
            <span v-if="!refreshing">重新对齐</span>
          </button>
        </span>
      </div>

      <!-- 行程时间轴 -->
      <div class="rail">
        <div class="rrow">
          <div class="rrail"><span class="rnode b"></span><span class="rline"></span></div>
          <div class="rmain">
            <div class="rtime">
              <template v-if="pickupClock">{{ pickupClock }}<em>{{ pickupDay }}</em></template>
              <span v-else class="ph">时间未定</span>
            </div>
            <div class="rcard" :class="{ miss: !pickupName }">
              <div class="rh">
                <span class="rl">装 货</span>
                <span class="nm" :class="{ ph: !pickupName }">{{ pickupName || '待补充' }}</span>
                <span v-if="pickupTag" class="sr">{{ pickupTag }}</span>
                <button class="mini edit" @click="pickExistingByKey('pickup')">{{ pickupName ? '改' : '选已有' }}</button>
              </div>
              <div v-if="pickupSub" class="mt">{{ pickupSub }}</div>
              <div class="rsub">
                <span>联系人</span>
                <b :class="{ ph: !pickupContact }">{{ pickupContact || '未填' }}</b>
                <span class="dot"></span>
                <b :class="{ ph: !pickupPhone }">{{ pickupPhone || '电话未填' }}</b>
                <span class="r">建单页可补 ›</span>
              </div>
            </div>
          </div>
        </div>

        <div class="hop"><span :class="{ ph: !tripText }">{{ tripText || '时间未定' }}</span></div>

        <div class="rrow">
          <div class="rrail"><span class="rnode g"></span></div>
          <div class="rmain">
            <div class="rtime">
              <template v-if="deliveryClock">{{ deliveryClock }}<em>{{ deliveryDay }}</em></template>
              <span v-else class="ph">时间未定</span>
            </div>
            <div class="rcard g" :class="{ miss: !deliveryName }">
              <div class="rh">
                <span class="rl">卸 货</span>
                <span class="nm" :class="{ ph: !deliveryName }">{{ deliveryName || '待补充' }}</span>
                <span v-if="deliveryTag" class="sr">{{ deliveryTag }}</span>
                <button class="mini edit" @click="pickExistingByKey('delivery')">{{ deliveryName ? '改' : '选已有' }}</button>
              </div>
              <div v-if="deliverySub" class="mt">{{ deliverySub }}</div>
              <div class="rsub">
                <span>收货人</span>
                <b :class="{ ph: !deliveryContact }">{{ deliveryContact || '未填' }}</b>
                <span class="dot"></span>
                <b :class="{ ph: !deliveryPhone }">{{ deliveryPhone || '电话未填' }}</b>
                <span class="r">建单页可补 ›</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 候选：装/卸货围栏 -->
      <div v-if="picking === 'pickup' || picking === 'delivery'" class="cand">
        <div v-if="loading" class="cand-empty">正在找…</div>
        <template v-else>
          <button v-for="c in cands" :key="c.id || c.name" class="cand-item" @click="chooseByKey(picking, c)">
            <b>{{ c.name }}</b>
            <em v-if="c.extra">{{ c.extra }}</em>
          </button>
          <div v-if="!cands.length" class="cand-empty">档案里没有相似的，可以直接去新建</div>
        </template>
        <button class="cand-new" @click="openEntityByKey(picking)">＋ 新建{{ labelOf(picking) }}</button>
      </div>

      <!-- 货物 -->
      <div class="gh">货 物<span class="ln"></span><span v-if="cargoMissing" class="gr">差 1 项</span></div>
      <div class="cargo" :class="{ bad: cargoMissing }">
        <span class="cic">货</span>
        <div class="cbd">
          <div class="cnm" :class="{ ph: cargoMissing }">{{ cargoName || '待补充' }}</div>
          <div class="csub">{{ cargoSub }}</div>
        </div>
        <div v-if="cargoMissing" class="cacts">
          <button class="mini" @click="pickExistingByKey('cargo')">选已有</button>
          <button class="mini pri" @click="openEntityByKey('cargo')">新建货物</button>
        </div>
        <div v-else class="crt">
          <div class="cqty">{{ qtyText || '数量未填' }}</div>
          <div class="cfee">{{ freightText || '运费未填' }}</div>
        </div>
      </div>

      <!-- 候选：货物 -->
      <div v-if="picking === 'cargo'" class="cand cand-inline">
        <div v-if="loading" class="cand-empty">正在找…</div>
        <template v-else>
          <button v-for="c in cands" :key="c.id || c.name" class="cand-item" @click="chooseByKey('cargo', c)">
            <b>{{ c.name }}</b>
            <em v-if="c.extra">{{ c.extra }}</em>
          </button>
          <div v-if="!cands.length" class="cand-empty">档案里没有相似的，可以直接去新建</div>
        </template>
        <button class="cand-new" @click="openEntityByKey('cargo')">＋ 新建货物</button>
      </div>

      <!-- 承运 2×2 -->
      <div class="gh">承 运<span class="ln"></span></div>
      <div class="tiles2">
        <button
          v-for="t in tileList"
          :key="t.key"
          type="button"
          class="tile2"
          :class="t.state"
          @click="pickExistingByKey(t.key)"
        >
          <span class="ic2">{{ t.icon }}</span>
          <span class="tbd">
            <span class="k2">{{ t.label }}</span>
            <span class="v2" :class="{ ph: t.placeholder }">{{ t.value }}</span>
          </span>
          <span v-if="t.tag" class="tag">{{ t.tag }}</span>
        </button>
      </div>

      <!-- 候选：承运四类 -->
      <div v-if="picking === 'vehicle' || picking === 'driver' || picking === 'customer' || picking === 'route'" class="cand cand-inline">
        <div v-if="loading" class="cand-empty">正在找…</div>
        <template v-else>
          <button v-for="c in cands" :key="c.id || c.name" class="cand-item" @click="chooseByKey(picking, c)">
            <b>{{ c.name }}</b>
            <em v-if="c.extra">{{ c.extra }}</em>
          </button>
          <div v-if="!cands.length" class="cand-empty">档案里没有相似的，可以直接去新建</div>
        </template>
        <button class="cand-new" @click="openEntityByKey(picking)">＋ 新建{{ labelOf(picking) }}</button>
      </div>

      <!-- 运输模式 -->
      <div class="moderow">
        <span class="mk">运输模式</span>
        <span class="segsm">
          <button
            v-for="m in MODE_OPTIONS"
            :key="m"
            type="button"
            :class="{ on: modeValue === m }"
            :disabled="refreshing"
            @click="setMode(m)"
          >{{ m }}</button>
        </span>
        <span class="mv">{{ modeValue === '详细' ? '接单 → 装车 → 发车 → 到达 → 完成' : '接单 → 完成' }}</span>
      </div>

      <!-- 冲突 / 疑似重复：最多 2 条，其余收成一行 -->
      <div v-if="shownTips.length" class="tips">
        <div v-for="(t, i) in shownTips" :key="i" class="tip" :class="t.kind">
          <i class="bar"></i>
          <div><b>{{ t.title }}</b>{{ t.text }}</div>
        </div>
        <div v-if="restTips" class="tips-more">还有 {{ restTips }} 条提醒（冲突 / 重复），去建单页核对</div>
      </div>

      <div class="d-foot">
        <button class="btn pri" @click="goCreate">去建单页确认 →</button>
        <span class="sp" :class="{ bad: !canCreate }">
          <template v-if="canCreate">
            不写库 · 仍需人工发布<template v-if="restTips || shownTips.length"><br><span class="soft">另有 {{ shownTips.length + restTips }} 条提醒</span></template>
          </template>
          <template v-else-if="blockMissing.length">还差 {{ blockMissing.map((m) => m.label).join('、') }}<br><span class="soft">去建单页补</span></template>
          <template v-else>有字段对上了多个候选<br><span class="soft">选一个再继续</span></template>
        </span>
      </div>
    </div>

    <!-- ==================== 图表 ==================== -->
    <div v-else-if="safeCard.type === 'chart'" class="chart-wrap">
      <div v-if="kpi" class="kpi">
        <b class="num">{{ fmtNum(kpi.value) }}</b>
        <span class="unit">{{ kpi.unit }}</span>
        <span v-if="kpi.delta != null" class="delta" :class="{ down: Number(kpi.delta) < 0 }">
          {{ Number(kpi.delta) > 0 ? '↑' : '↓' }}{{ Math.abs(Number(kpi.delta)) }}%
        </span>
      </div>

      <SvgPlot v-if="canDraw" :draw="drawFn" :deps="safeCard.chart" />

      <!-- 无 DOM（小程序）或没有数据时降级成表 -->
      <div v-else class="tbl-wrap">
        <table class="tbl">
          <thead>
            <tr><th v-for="c in chartCols" :key="c.key">{{ c.label }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in chartRows" :key="i">
              <td v-for="c in chartCols" :key="c.key">{{ fmt(r[c.key]) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 明细折叠：同源的表格卡已被后端合并进来（fold），图给结论、表给核对 -->
      <div v-if="foldInfo" class="fold">
        <button type="button" class="fold-h" @click="foldOpen = !foldOpen">
          <span class="fold-t">{{ foldInfo.title || '明细' }} · {{ foldInfo.rows.length }} 行</span>
          <span class="fold-ar" :class="{ open: foldOpen }">▾</span>
        </button>
        <div v-if="foldOpen" class="fold-b">
          <table class="tbl">
            <thead>
              <tr><th v-for="c in foldInfo.cols" :key="c.key">{{ c.label }}</th></tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in foldInfo.rows" :key="i">
                <td v-for="c in foldInfo.cols" :key="c.key" :class="{ r: c.align === 'right' }">{{ cellText(r, c) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-if="safeCard.note && safeCard.type !== 'draft'" class="note">{{ safeCard.note }}</div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import SvgPlot from '@/components/charts/SvgPlot.vue'
import { combo, hbars, donut } from '@/utils/svgCharts'
import { ENTITY_ROUTE, PATCH_KEY_OF } from '@/config/aiEntityRoutes'
import { resolveEntity } from '@/utils/aiClient'

const props = defineProps({
  card: { type: Object, required: true },
})
const emit = defineEmits(['navigate', 'redraft', 'open-entity', 'create'])

/* 一道硬防御：卡片可能是从 localStorage 恢复的旧数据 / 结构不全的数据，
   模板里直接写 card.cols.length 会抛错，而子组件渲染抛错会让整页白屏。 */
const safeCard = computed(() => (props.card && typeof props.card === 'object' ? props.card : null))
const cols = computed(() =>
  Array.isArray(props.card && props.card.cols) ? props.card.cols.filter((c) => c && c.key) : []
)
const rows = computed(() =>
  Array.isArray(props.card && props.card.rows) ? props.card.rows.filter((r) => r && typeof r === 'object') : []
)

/* ---------------- 草稿卡 ---------------- */
const picking = ref('')
const cands = ref([])
const loading = ref(false)
const refreshing = ref(false)

const draftFields = computed(() =>
  Array.isArray(props.card && props.card.fields) ? props.card.fields.filter((f) => f && f.key) : []
)
const draftConflicts = computed(() =>
  Array.isArray(props.card && props.card.conflicts) ? props.card.conflicts : []
)
const draftDuplicates = computed(() =>
  Array.isArray(props.card && props.card.duplicates) ? props.card.duplicates : []
)
/* 只有主数据字段才配「从档案选 / 新建」；
   数量、计划时间、运费、运输模式在建单页改，跳档案页没有意义。 */

const FIELD_LABEL = {
  pickup: '装货地', delivery: '卸货地', customer: '客户', cargo: '货物',
  vehicle: '车辆', driver: '司机', route: '路线',
  quantity: '数量',
  /* 2026-11-26 拆分：原来的「计划发车」分成装货 / 到达两个时间 */
  pickupTime: '计划装货', deliveryTime: '计划到达', planTime: '计划到达',
  mode: '运输模式', freight: '运费',
}

/** 运输模式可选项（与云函数 enum 一致） */
const MODE_OPTIONS = ['极简', '详细']

/* ============================================================
   视图模型：把 fields（带来源标记）与 draft（结构）归一成模板要的形状
   ============================================================ */

/** key → 草稿字段对象（含 src 来源标记 / candidates） */
const fm = computed(() => {
  const map = {}
  draftFields.value.forEach((f) => { map[f.key] = f })
  return map
})

/** 草稿里的「空值占位」统一按没填处理，避免模板里到处判断 */
const PLACEHOLDERS = ['未指定', '未填', '未识别', '待补充']
const clean = (v) => {
  const t = String(v == null ? '' : v).trim()
  return PLACEHOLDERS.includes(t) ? '' : t
}
const valOf = (key) => clean(fm.value[key] && fm.value[key].value)

/** 来源徽标：围栏 / 档案 / 原文 / 默认（缺项不显示） */
const srcTagOf = (key) => {
  const src = fm.value[key] && fm.value[key].src
  if (src === 'fence') return '围栏'
  if (src === 'archive') return '档案'
  if (src === 'text') return '原文'
  if (src === 'default') return '默认'
  return ''
}

const missingOf = (key) => {
  const arr = Array.isArray(props.card && props.card.missing) ? props.card.missing : []
  return arr.find((m) => m && m.field === key) || null
}

/** 缺口原因：内部措辞（原文未提及）换成给用户看的话 */
const missingText = (key, fallback) => {
  const m = missingOf(key)
  const reason = String((m && m.reason) || '')
  if (!reason) return fallback
  if (reason.includes('未提及')) return ''
  return reason
}

/* ---------- 草稿结构 ---------- */
const D = computed(() => (props.card && props.card.draft) || {})
const T0 = computed(() => (Array.isArray(D.value.tasks) && D.value.tasks[0]) || {})
const C0 = computed(() => (Array.isArray(D.value.cargoList) && D.value.cargoList[0]) || {})
const A0 = computed(() => (Array.isArray(D.value.assignList) && D.value.assignList[0]) || {})
const itemsOf = computed(() => (Array.isArray(A0.value.items) ? A0.value.items : []))
const taskCount = computed(() => (Array.isArray(D.value.tasks) ? D.value.tasks.length : 1))

/* ---------- 时间 ----------
   草稿里是北京时间字符串 'YYYY-MM-DD HH:mm:ss'；
   老卡片（拆分前）可能是 ISO，所以字段值优先，草稿值只用来补「周几」。 */
const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const RE_TIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/
const clockOf = (s) => {
  const m = String(s || '').match(RE_TIME)
  if (!m) return { clock: '', day: '' }
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return { clock: `${m[4]}:${m[5]}`, day: `${m[2]}-${m[3]} ${WD[dt.getDay()]}` }
}
const clockFromField = (key) => {
  const m = String(valOf(key) || '').match(/(\d{2}-\d{2})\s+(\d{2}:\d{2})/)
  return m ? { clock: m[2], day: m[1] } : { clock: '', day: '' }
}
const timeParts = (fieldKey, draftValue) => {
  const f = clockFromField(fieldKey)
  const d = clockOf(draftValue)
  if (f.clock) return { clock: f.clock, day: d.clock ? d.day : f.day }
  return d
}
const pickupP = computed(() => timeParts('pickupTime', T0.value.pickupTime))
const deliveryP = computed(() => timeParts('deliveryTime', T0.value.deliveryTime))
const pickupClock = computed(() => pickupP.value.clock)
const pickupDay = computed(() => pickupP.value.day)
const deliveryClock = computed(() => deliveryP.value.clock)
const deliveryDay = computed(() => deliveryP.value.day)

/** 只算「计划装货 → 计划到达」的时长，不编里程（里程是发布时高德算的） */
const tripText = computed(() => {
  const a = String(T0.value.pickupTime || '').match(RE_TIME)
  const b = String(T0.value.deliveryTime || '').match(RE_TIME)
  if (!a || !b) return ''
  const ta = new Date(+a[1], +a[2] - 1, +a[3], +a[4], +a[5]).getTime()
  const tb = new Date(+b[1], +b[2] - 1, +b[3], +b[4], +b[5]).getTime()
  if (!ta || !tb || tb <= ta) return ''
  const mins = Math.round((tb - ta) / 60000)
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  const parts = []
  if (d) parts.push(`${d} 天`)
  if (h) parts.push(`${h} 小时`)
  if (m) parts.push(`${m} 分`)
  return `全程 ${parts.join(' ')}（计划）`
})

/* ---------- 装 / 卸货 ---------- */
const pickupName = computed(() => valOf('pickup') || clean(T0.value.pickupLocation))
const deliveryName = computed(() => valOf('delivery') || clean(T0.value.deliveryLocation))
const pickupTag = computed(() => srcTagOf('pickup'))
const deliveryTag = computed(() => srcTagOf('delivery'))
const pickupSub = computed(() => {
  if (!pickupName.value) return missingText('pickup', '没匹配到围栏') || '没匹配到围栏'
  const sub = (fm.value.pickup && fm.value.pickup.sub) || ''
  /* 「装货围栏」这类和来源徽标重复，就不再占一行 */
  return sub === '装货围栏' || sub === '围栏' ? '' : sub
})
const deliverySub = computed(() => {
  if (!deliveryName.value) return missingText('delivery', '没匹配到围栏') || '没匹配到围栏'
  const sub = (fm.value.delivery && fm.value.delivery.sub) || ''
  return sub === '卸货围栏' || sub === '围栏' ? '' : sub
})
/* 联系人目前草稿不带，明确显示「未填」，别让人到建单页才发现 */
const pickupContact = computed(() => clean(T0.value.pickupContactName || T0.value.pickupContact))
const pickupPhone = computed(() => clean(T0.value.pickupPhone))
const deliveryContact = computed(() => clean(T0.value.deliveryContactName || T0.value.deliveryContact))
const deliveryPhone = computed(() => clean(T0.value.deliveryPhone))

/* ---------- 货物 ---------- */
const cargoName = computed(() => valOf('cargo') || clean(C0.value.name))
const cargoMissing = computed(() => !cargoName.value)
const cargoSub = computed(() => {
  if (cargoMissing.value) {
    const why = missingText('cargo', '') || '档案里没有'
    return `${why} · 必填`
  }
  const f = fm.value.cargo
  return (f && f.sub) || '档案已匹配'
})
const unitText = computed(() => clean(C0.value.unit) || '吨')
const qtyText = computed(() => {
  const q = Number(C0.value.quantity)
  return q > 0 ? `${q} ${unitText.value}` : ''
})
const freightText = computed(() => {
  const v = Number(C0.value.freight)
  return v > 0 ? `¥${v.toFixed(2)}` : ''
})

/* ---------- 承运 ---------- */
const assignMethod = computed(() => String(A0.value.assignMethod || 'driver'))
const vehicleText = computed(() => valOf('vehicle')
  || (assignMethod.value === 'vehicle' ? clean(itemsOf.value[0] && itemsOf.value[0].target) : ''))
const driverText = computed(() => valOf('driver')
  || (assignMethod.value === 'driver' ? clean(itemsOf.value[0] && itemsOf.value[0].target) : ''))
const customerText = computed(() => valOf('customer') || clean(D.value.customerArchiveName))
const routeText = computed(() => valOf('route') || clean(T0.value.routeName))
const vehicleCandCount = computed(() => {
  const f = fm.value.vehicle
  return f && Array.isArray(f.candidates) ? f.candidates.length : 0
})

/** 瓷砖底色：蓝=已定/待选，绿=档案命中，灰=可后补，红虚线=必须补 */
const tileState = (key) => {
  const f = fm.value[key]
  if (f && f.src !== 'missing' && valOf(key)) {
    return key === 'customer' || key === 'route' ? 'green' : 'blue'
  }
  const n = f && Array.isArray(f.candidates) ? f.candidates.length : 0
  if (n > 1) return 'blue'
  return key === 'customer' || key === 'route' ? 'grey' : 'bad'
}

const tileList = computed(() => {
  const n = vehicleCandCount.value
  const vehicleShow = vehicleText.value || (n > 1 ? `${n} 选 1` : '')
  return [
    { key: 'vehicle', icon: '车', label: '车辆', value: vehicleShow || '待补充', placeholder: !vehicleShow, state: tileState('vehicle') },
    { key: 'driver', icon: '司', label: '司机', value: driverText.value || '待补', placeholder: !driverText.value, state: tileState('driver') },
    { key: 'customer', icon: '客', label: '客户', value: customerText.value || '可后补', placeholder: !customerText.value, state: tileState('customer') },
    { key: 'route', icon: '线', label: '路线', value: routeText.value || '可后补', placeholder: !routeText.value, state: tileState('route') },
  ]
})

const modeValue = computed(() => valOf('mode') || clean(D.value.transportMode) || '极简')

/* ---------- 完成度 ---------- */
const fieldTotal = computed(() => draftFields.value.length)
const filledCount = computed(() =>
  draftFields.value.filter((f) => f.src !== 'missing' && clean(f.value)).length
)
const fillPct = computed(() =>
  fieldTotal.value ? Math.round((filledCount.value / fieldTotal.value) * 100) : 0
)

/* ---------- 冲突 / 重复：最多显示 2 条 ---------- */
const shownTips = computed(() => {
  const out = []
  draftConflicts.value.forEach((c) => {
    out.push({
      kind: 'red',
      title: conflictTitle(c),
      text: `${c.reason || ''}${c.waybillNo ? `（${c.waybillNo} ${c.status || ''}）` : ''}`,
    })
  })
  draftDuplicates.value.forEach((d) => {
    out.push({
      kind: 'amber',
      title: '疑似重复：',
      text: `${d.waybillNo || ''}${d.diffMin != null ? `，${d.diffMin} 分钟前` : ''}${d.sameBy ? `，${d.sameBy}一致` : ''}`,
    })
  })
  return out.slice(0, 2)
})
const restTips = computed(() => Math.max(
  0,
  draftConflicts.value.length + draftDuplicates.value.length - shownTips.value.length
))

const canCreate = computed(() => {
  const s = String((props.card && props.card.status) || '')
  return s === 'ready' || s === 'conflict'
})

/* 父组件刷新后会换一张新卡 → 复位「刷新中」 */
watch(() => props.card, () => {
  refreshing.value = false
  if (rfTimer) { clearTimeout(rfTimer); rfTimer = null }
})

/* 兜底：请求失败时父组件不会换卡，3 秒后自动解除「刷新中」，
   否则按钮会永远转圈 */
let rfTimer = null
const startRefresh = () => {
  refreshing.value = true
  if (rfTimer) clearTimeout(rfTimer)
  rfTimer = setTimeout(() => { refreshing.value = false; rfTimer = null }, 3000)
}

const labelOf = (key) => (ENTITY_ROUTE[key] && ENTITY_ROUTE[key].label) || '档案'
const kindOf = (key) => (ENTITY_ROUTE[key] && ENTITY_ROUTE[key].kind) || ''

const conflictTitle = (c) => {
  if (!c) return ''
  if (c.code === 'VEHICLE_BUSY') return '车辆冲突：'
  if (c.code === 'DRIVER_BUSY') return '司机冲突：'
  if (c.code === 'TIME_PAST') return '时间冲突：'
  return ''
}

/** 展开候选：优先用随卡下发的（多候选场景），否则现查一次 */
const pickExisting = async (f) => {
  if (picking.value === f.key) { picking.value = ''; return }
  picking.value = f.key
  const inline = Array.isArray(f.candidates) ? f.candidates : []
  if (inline.length) { cands.value = inline; return }

  cands.value = []
  loading.value = true
  try {
    const text = f.src === 'missing' || f.value === '未指定' ? '' : String(f.value || '')
    const r = await resolveEntity({ kind: kindOf(f.key), text })
    cands.value = (r && Array.isArray(r.candidates)) ? r.candidates : []
  } catch (e) {
    cands.value = []
  } finally {
    loading.value = false
  }
}

/** 选中候选 → 父组件带着 patch 重算草稿（只改这一项） */
const choose = (f, c) => {
  const key = PATCH_KEY_OF[f.key]
  if (!key) return
  picking.value = ''
  startRefresh()
  emit('redraft', { patch: { [key]: c.name } })
}

/** 全量刷新（补完档案回来点） */
const refresh = () => {
  if (refreshing.value) return
  startRefresh()
  emit('redraft', { patch: {} })
}

/** 去对应档案页新建（父组件负责 window.open 与降级） */
const openEntity = (f) => {
  picking.value = ''
  emit('open-entity', {
    key: f.key,
    kind: kindOf(f.key),
    name: f.value && f.value !== '未指定' ? String(f.value) : '',
  })
}

/** 真正挡住建单的项（block 级）—— 底部文案用 */
const blockMissing = computed(() => {
  const list = Array.isArray(props.card && props.card.missing) ? props.card.missing : []
  return list
    .filter((m) => m && m.level === 'block')
    .map((m) => ({ field: m.field, label: FIELD_LABEL[m.field] || m.field, reason: m.reason || '' }))
})

/** 改运输模式 → 带 patch 重算草稿（服务端白名单里有 transportMode） */
const setMode = (m) => {
  if (refreshing.value) return
  if (modeValue.value === m) return
  startRefresh()
  emit('redraft', { patch: { transportMode: m } })
}

/* 模板里按 key 触发，内部换成「字段对象」给原来的候选逻辑用 */
const fldOf = (key) => fm.value[key] || {
  key, label: FIELD_LABEL[key] || key, src: 'missing', value: '', level: 'block',
}
const pickExistingByKey = (key) => { if (key) pickExisting(fldOf(key)) }
const chooseByKey = (key, c) => choose({ ...fldOf(key), key }, c)
const openEntityByKey = (key) => openEntity({ ...fldOf(key), value: valOf(key) })

/** 去建单页（父组件把草稿转成 cloneData 推过去） */
const goCreate = () => emit('create', props.card)

/* ---------------- 图表卡 ---------------- */
const noDom = typeof window === 'undefined'
const chartData = computed(() => (props.card && props.card.chart) || {})
const kpi = computed(() => (props.card && props.card.kpi) || null)
const chartType = computed(() => String((props.card && props.card.chartType) || 'trend'))
const points = computed(() => {
  const c = chartData.value
  return (c.labels || c.items || []).length
})
const canDraw = computed(() => !noDom && points.value > 0)

/* 后端 2026-11-27 起把同源表卡合并进 fold 并删掉了 table，
   这里两个都认，避免降级表格变空 */
const chartSource = computed(() => {
  const c = props.card || {}
  return c.fold || c.table || null
})
const chartCols = computed(() => {
  const t = chartSource.value
  return t && Array.isArray(t.cols) ? t.cols : []
})
const chartRows = computed(() => {
  const t = chartSource.value
  return t && Array.isArray(t.rows) ? t.rows : []
})

/* ---------------- 明细折叠（图 + 表合成一张卡） ---------------- */
const foldOpen = ref(false)
const foldInfo = computed(() => {
  const f = props.card && props.card.fold
  if (!f || !Array.isArray(f.rows) || !f.rows.length) return null
  return f
})
/** 明细单元格：金额带 ¥ 与千分位，其余交给 fmt */
function cellText(row, col) {
  const v = row ? row[col.key] : null
  if (v == null || v === '') return '—'
  if (col && col.money) {
    const n = Number(v)
    return Number.isFinite(n)
      ? '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : String(v)
  }
  return fmt(v)
}

/** null 点用前值补齐：折线遇到 null 会画到 0，视觉上像暴跌 */
const carryForward = (arr) => {
  const out = []
  let last = 0
  for (const v of arr || []) {
    const n = v == null ? null : Number(v)
    if (n == null || !Number.isFinite(n)) out.push(last)
    else { out.push(n); last = n }
  }
  return out
}

const drawFn = (host, W) => {
  const c = chartData.value || {}
  if (chartType.value === 'rank') {
    hbars(host, W, { items: c.items || [], color: '#0F9B8E', rowH: 24 })
    return
  }
  if (chartType.value === 'share') {
    donut(host, W, {
      items: c.items || [],
      centerTop: kpi.value ? fmtNum(kpi.value.value) : '',
      centerSub: (kpi.value && kpi.value.unit) || '',
    })
    return
  }
  const series = Array.isArray(c.series) ? c.series : []
  const bar = series.find((s) => s.type === 'bar') || { data: [] }
  const line = series.find((s) => s.type === 'line') || { data: [] }
  combo(host, W, {
    labels: c.labels || [],
    bar: { data: carryForward(bar.data), color: bar.color || '#9FDED4', digits: 0 },
    line: { data: carryForward(line.data), color: line.color || '#0F9B8E', digits: 1 },
    h: 190,
    rot: (c.labels || []).length > 6,
  })
}

/* ---------------- 公共 ---------------- */
const TYPE_NAME = {
  expense: '支出',
  subsidy: '补贴',
  loan: '借款',
  violation: '违章',
}

const typeName = (t) => TYPE_NAME[t] || t || '费用'

const money = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const fmtNum = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 1 })
}

const fmt = (v) => (v == null || v === '' ? '—' : String(v))

const fmtTime = (v) => {
  if (!v) return '—'
  const s = String(v).replace('T', ' ')
  return s.slice(5, 16)
}

/** 能耗类把偏高的标红，但不用品牌红（品牌红留给品牌动作） */
const isHigh = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 65
}

const statusCls = (s) => {
  const t = String(s || '')
  if (/待审核|审核中/.test(t)) return 'wait'
  if (/已通过|已完成/.test(t)) return 'ok'
  if (/驳回|取消/.test(t)) return 'no'
  if (/待打款|已打款|待接单|待装车|已发车|已到达/.test(t)) return 'blue'
  return ''
}

/**
 * 单行「去审批」
 * ⚠️ 必须只带这一行自己的 id。之前所有行都传 card.jump（含全部 10 笔），
 *    结果点哪一笔都跳到同一批、闪的也永远是同一批行。
 */
/** 待办行分两种：费用（默认）/ 运单（kind='waybill'） */
const isWaybillRow = (r) => !!(r && (r.kind === 'waybill' || r.waybillNo && r.amount == null))

const rowTitle = (r) => {
  if (isWaybillRow(r)) return `${r.waybillNo || '—'} · ${r.status || '待处理'}`
  return `${r.plate || '—'} · ${typeName(r.type)}`
}

const rowSub = (r) => {
  if (isWaybillRow(r)) {
    const route = r.pickup || r.delivery ? `${r.pickup || '—'} → ${r.delivery || '—'}` : ''
    const t = fmtTime(r.time)
    return [route, t].filter(Boolean).join(' · ')
  }
  return [fmtTime(r.createTime), r.driverName].filter(Boolean).join(' · ')
}

/** 空态文案：运单类待办说「没有待派单」比「没有待你处理的事项」准 */
const emptyTodoText = computed(() => {
  const k = String((props.card && props.card.kind) || '')
  if (k === 'waybill_assign') return '当前没有待派单的运单'
  if (k === 'recurring_accept') return '当前没有等司机接单的趟次'
  return '当前没有待你处理的事项'
})

const goRow = (r) => {
  const jump = props.card.jump || {}
  const path = jump.path || '/fee/list'
  /* 运单类：跳列表并按状态筛（详情页在列表里点，不单独给深链） */
  if (isWaybillRow(r)) {
    emit('navigate', { path, query: { ...(jump.query || {}) } })
    return
  }
  if (r && r.id != null) {
    emit('navigate', { path, query: { ids: String(r.id) } })
    return
  }
  if (props.card.jump) emit('navigate', props.card.jump)
}
</script>

<style scoped>
.ai-card {
  border: 1px solid var(--line2, #e3e8ef);
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
  width: 100%;
  margin-bottom: 8px;
}
.ch {
  height: 30px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  background: var(--thead, #f7f9fc);
  border-bottom: 1px solid var(--line, #edf0f4);
  font-size: 11px;
  color: var(--ink2, #475569);
  font-weight: 600;
  gap: 6px;
}
.ch .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ch .n { color: var(--ink3, #94a3b8); font-weight: 400; }
.ch .n b { color: var(--ink, #0f172a); font-weight: 700; font-variant-numeric: tabular-nums; }
.ch .rg { color: var(--ink3, #94a3b8); font-weight: 400; font-size: 10.5px; }

/* ---------- 表格 ---------- */
.tbl-wrap { max-height: 258px; overflow-y: auto; }
.tbl { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.tbl th {
  position: sticky; top: 0; z-index: 1;
  text-align: left; padding: 6px 10px;
  color: var(--ink3, #94a3b8); font-weight: 600; font-size: 10.5px;
  background: #fff; border-bottom: 1px solid #f4f6f9;
}
.tbl td { padding: 7px 10px; border-bottom: 1px solid #f7f9fc; color: var(--ink, #0f172a); }
.tbl tr:last-child td { border-bottom: 0; }
.tbl .right { text-align: right; }
.tbl .num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
.tbl .hi { color: #c2410c; font-weight: 700; }
.tbl .empty { text-align: center; color: var(--ink3, #94a3b8); padding: 14px; }

.st { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; }
.st i { width: 4px; height: 4px; border-radius: 50%; display: inline-block; background: currentColor; }
.st.wait { color: #d97706; }
.st.ok { color: #0e9f6e; }
.st.no { color: #c8102e; }
.st.blue { color: #2563eb; }

/* ---------- 待办 ---------- */
.todo-list { max-height: 260px; overflow-y: auto; }
.todo {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 10px; border-bottom: 1px solid #f4f6f9;
}
.todo:last-child { border-bottom: 0; }
.todo .info { flex: 1; min-width: 0; }
.todo .t1 {
  font-size: 12px; font-weight: 600; color: var(--ink, #0f172a);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.todo .t2 { font-size: 10.5px; color: var(--ink3, #94a3b8); margin-top: 1px; }
.todo .amt { font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
.todo .go {
  height: 24px; padding: 0 9px; border-radius: 5px;
  border: 1px solid #f5d4d9; color: #c8102e; background: #fdf0f2;
  font-size: 11px; font-weight: 600; cursor: pointer; flex: 0 0 auto;
}
.todo .go:hover { background: #fbe3e7; }
.empty { text-align: center; color: var(--ink3, #94a3b8); padding: 16px; font-size: 12px; }

/* ---------- 草稿卡（V3 时间轴 · 2026-11-26 定稿） ---------- */
.dc-head {
  display: flex; align-items: center; gap: 7px;
  padding: 8px 11px; border-bottom: 1px solid #edf0f4;
}
.dc-head .dh-t { font-size: 11.5px; font-weight: 700; color: var(--ink, #0f172a); }
.dc-head .dh-m { font-size: 10px; color: var(--ink3, #94a3b8); }
.dc-head .dh-r { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.prog {
  display: flex; align-items: center; gap: 5px;
  font-size: 9.5px; font-weight: 700; color: #64748b; white-space: nowrap;
}
.prog .pbar { width: 34px; height: 4px; border-radius: 2px; background: #eaeff6; overflow: hidden; display: block; }
.prog .pbar i { display: block; height: 100%; border-radius: 2px; background: #c8102e; }
.sync-btn {
  display: inline-flex; align-items: center; gap: 3px;
  font: inherit; font-size: 10px; font-weight: 700;
  padding: 2px 6px; border-radius: 5px; cursor: pointer;
  border: 1px solid #f0ddbb; background: #fffdf7; color: #9a6b14; white-space: nowrap;
}
.sync-btn:hover:not(:disabled) { background: #fef4e6; }
.sync-btn:disabled { opacity: .65; cursor: default; }
.sync-btn .spin { display: inline-block; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* 时间轴 */
.rail { padding: 10px 11px 6px; }
.rrow { display: flex; gap: 9px; }
.rrail { width: 14px; flex: none; display: flex; flex-direction: column; align-items: center; }
.rnode { width: 10px; height: 10px; border-radius: 50%; border: 2.5px solid #fff; flex: none; }
.rnode.b { background: #2563eb; box-shadow: 0 0 0 2px #bfd3fa; }
.rnode.g { background: #0e9f6e; box-shadow: 0 0 0 2px #bbe8d6; }
.rline { flex: 1; width: 0; border-left: 1.5px dashed #d3ddea; margin: 3px 0; min-height: 12px; }
.rmain { flex: 1; min-width: 0; padding-bottom: 8px; }
.rtime { font-size: 11px; font-weight: 800; color: var(--ink, #0f172a); letter-spacing: .2px; margin-bottom: 4px; }
.rtime em { font-style: normal; font-weight: 500; color: var(--ink3, #94a3b8); font-size: 9.5px; margin-left: 5px; }
.rtime .ph { font-size: 10px; font-weight: 600; }

.rcard {
  border-radius: 9px; padding: 8px 10px 9px;
  border: 1px solid #d8e3fb;
  background: linear-gradient(135deg, #f6f9ff, #ecf2ff);
}
.rcard.g { border-color: #cdebdd; background: linear-gradient(135deg, #f5fcf9, #e8f7f0); }
.rcard.miss { border-style: dashed; border-color: #f3c9d0; background: #fff8f8; }
.rh { display: flex; align-items: center; gap: 6px; }
.rl { font-size: 8.5px; font-weight: 800; letter-spacing: .4px; color: #1d4ed8; flex: none; }
.rcard.g .rl { color: #0b7f58; }
.rh .nm { font-size: 13.5px; font-weight: 800; color: var(--ink, #0f172a); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rh .nm.ph { color: #c8102e; font-weight: 700; }
.sr {
  margin-left: auto; flex: none; font-size: 8px; font-weight: 700;
  color: #1d4ed8; background: #fff; border: 1px solid #d8e3fb; border-radius: 3px; padding: 0 4px;
}
.rcard.g .sr { color: #0b7f58; border-color: #cdebdd; }
.rh .edit { margin-left: 4px; flex: none; }
.mt { font-size: 9.5px; color: #5b6879; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rsub {
  display: flex; align-items: center; gap: 6px; margin-top: 6px; padding-top: 5px;
  border-top: 1px dashed rgba(15, 23, 42, .08); font-size: 9px; color: #64748b;
}
.rsub b { font-size: 9.5px; font-weight: 700; color: var(--ink, #0f172a); }
.rsub b.ph { color: #b9c4d2; font-weight: 500; }
.rsub .dot { width: 2px; height: 2px; border-radius: 50%; background: #c0cbd9; flex: none; }
.rsub .r { margin-left: auto; color: #1d4ed8; font-weight: 700; white-space: nowrap; }
.rcard.g .rsub .r { color: #0b7f58; }

.hop { display: flex; align-items: center; justify-content: center; height: 20px; position: relative; }
.hop::before { content: ""; position: absolute; left: 50%; top: 0; bottom: 0; border-left: 1.5px dashed #d3ddea; }
.hop span {
  position: relative; background: #fff; border: 1px solid #e3e8ef; border-radius: 999px;
  font-size: 9px; font-weight: 700; color: #64748b; padding: 1px 8px; white-space: nowrap;
}
.hop span.ph { color: #b9c4d2; }

/* 分组标题 */
.gh {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 11px 4px; font-size: 9px; font-weight: 800; letter-spacing: .5px; color: #94a3b8;
}
.gh .ln { flex: 1; height: 1px; background: #f1f5f9; }
.gh .gr { color: #c8102e; letter-spacing: 0; }

/* 货物卡 */
.cargo {
  margin: 0 11px 4px; border: 1px solid #e3e8ef; border-radius: 10px;
  padding: 9px 10px; display: flex; align-items: center; gap: 9px; background: #fbfcfe;
}
.cargo.bad { border-style: dashed; border-color: #f3c9d0; background: #fff8f8; }
.cic {
  width: 26px; height: 26px; border-radius: 7px; flex: none;
  background: #eef2f7; color: #64748b; font-size: 10px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
}
.cargo.bad .cic { background: #fbe2e6; color: #c8102e; }
.cbd { min-width: 0; flex: 1; }
.cnm { font-size: 12.5px; font-weight: 800; color: var(--ink, #0f172a); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cnm.ph { color: #c8102e; }
.csub { font-size: 9px; color: var(--ink3, #94a3b8); margin-top: 1px; }
.cacts { display: flex; gap: 5px; flex: none; }
.crt { text-align: right; flex: none; }
.cqty { font-size: 12.5px; font-weight: 800; color: var(--ink, #0f172a); }
.cfee { font-size: 9.5px; color: var(--ink3, #94a3b8); margin-top: 1px; }

/* 候选 */
.cand { margin: 0 11px 6px; border: 1px solid #e3e8ef; border-radius: 8px; overflow: hidden; background: #fff; box-shadow: 0 6px 16px -10px rgba(15, 23, 42, .25); }
.cand-inline { margin-top: 2px; }
.cand-item {
  display: flex; align-items: baseline; gap: 6px; width: 100%;
  padding: 6px 9px; border: 0; background: #fff; cursor: pointer;
  font: inherit; font-size: 11.5px; text-align: left; color: var(--ink, #0f172a);
  border-bottom: 1px solid #f7f9fc;
}
.cand-item:hover { background: #f7f9fc; }
.cand-item b { font-weight: 600; }
.cand-item em { font-style: normal; font-size: 10px; color: #94a3b8; margin-left: auto; }
.cand-empty { padding: 8px 9px; font-size: 10.5px; color: #94a3b8; }
.cand-new {
  width: 100%; padding: 7px 9px; border: 0; cursor: pointer;
  background: #fdfcfd; color: #c8102e; font: inherit; font-size: 11px; font-weight: 600;
  text-align: left; border-top: 1px solid #edf0f4;
}
.cand-new:hover { background: #fdf0f2; }

/* 承运 2×2 */
.tiles2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 0 11px 4px; }
.tile2 {
  display: flex; align-items: center; gap: 7px; min-width: 0;
  padding: 7px 9px; border-radius: 9px; border: 1px solid transparent;
  background: #f7f9fc; cursor: pointer; text-align: left;
  font: inherit; color: inherit;
}
.tile2.blue { background: #eff4ff; border-color: #dce7fb; }
.tile2.green { background: #edf9f4; border-color: #d3eee2; }
.tile2.grey { background: #f7f9fc; border-color: #e9eef5; }
.tile2.bad { background: #fff6f6; border-color: #f3c9d0; border-style: dashed; }
.ic2 {
  width: 22px; height: 22px; border-radius: 6px; flex: none;
  color: #fff; font-size: 10px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
}
.tile2.blue .ic2 { background: #2563eb; }
.tile2.green .ic2 { background: #0e9f6e; }
.tile2.grey .ic2 { background: #c7d2e0; }
.tile2.bad .ic2 { background: #c8102e; }
.tbd { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.k2 { font-size: 8.5px; color: var(--ink3, #94a3b8); }
.v2 { font-size: 11.5px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tile2.blue .v2 { color: #1d4ed8; }
.tile2.green .v2 { color: #0b7f58; }
.tile2.grey .v2 { color: #b9c4d2; }
.tile2.bad .v2 { color: #c8102e; }

/* 运输模式 */
.moderow {
  display: flex; align-items: center; gap: 7px;
  padding: 8px 11px; border-top: 1px dashed #edf0f4; font-size: 9.5px; color: var(--ink3, #94a3b8);
}
.moderow .mk { font-weight: 600; flex: none; }
.moderow .mv { margin-left: auto; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.segsm { display: flex; flex: none; }
.segsm button {
  font: inherit; font-size: 9px; font-weight: 700;
  padding: 2px 6px; border: 1px solid #e3e8ef; background: #fff; color: #94a3b8; cursor: pointer;
}
.segsm button:first-child { border-radius: 4px 0 0 4px; }
.segsm button:last-child { border-radius: 0 4px 4px 0; border-left: 0; }
.segsm button.on { background: #c8102e; border-color: #c8102e; color: #fff; }
.segsm button:disabled { opacity: .6; cursor: default; }

/* 提示 */
.tips { padding: 6px 11px 2px; display: flex; flex-direction: column; gap: 5px; }
.tip {
  display: flex; align-items: flex-start; gap: 6px;
  font-size: 9.5px; line-height: 1.55; color: #8a5a12;
  background: #fff8ed; border: 1px solid #f5e0be; border-radius: 7px; padding: 5px 8px;
}
.tip .bar { width: 2px; align-self: stretch; border-radius: 2px; background: #d97706; flex: none; }
.tip.red { color: #a50d25; background: #fff6f6; border-color: #f7dcdc; }
.tip.red .bar { background: #c8102e; }
.tip b { font-weight: 800; }
.tips-more { font-size: 9px; color: #94a3b8; padding: 0 2px; }

/* 底栏 */
.d-foot { display: flex; align-items: center; gap: 8px; padding: 9px 11px; border-top: 1px solid #edf0f4; background: #fff; }
.d-foot .sp { margin-left: auto; font-size: 10px; color: var(--ink3, #94a3b8); text-align: right; line-height: 1.4; }
.d-foot .sp.bad { color: #c8102e; font-weight: 600; }
.d-foot .sp .soft { font-weight: 500; color: #b4545f; }
.btn {
  font: inherit; font-size: 11.5px; font-weight: 600; height: 28px; padding: 0 12px;
  border-radius: 6px; cursor: pointer; border: 1px solid #e3e8ef; background: #fff; color: var(--ink2, #475569);
}
.btn.pri { background: #c8102e; border-color: #c8102e; color: #fff; }
.btn.pri:hover { background: #a50d25; border-color: #a50d25; }
.mini {
  font: inherit; font-size: 9px; font-weight: 700;
  padding: 2px 6px; border-radius: 4px; cursor: pointer;
  border: 1px solid #e3e8ef; background: #fff; color: #64748b; white-space: nowrap;
}
.mini:hover { border-color: #f5d4d9; color: #c8102e; background: #fdf0f2; }
.mini.pri { border-color: #f5d4d9; color: #c8102e; background: #fff8f9; }
.mini.pri:hover { background: #fbe3e7; }

/* ---------- 图表卡 ---------- */
.chart-wrap { padding: 9px 10px 4px; }
/* ---------- 明细折叠（图 + 表合成一张卡） ---------- */
.fold { margin-top: 7px; border-top: 1px solid var(--line, #edf0f4); }
.fold-h {
  display: flex; align-items: center; gap: 6px; width: 100%;
  padding: 7px 0 1px; border: 0; background: none; cursor: pointer;
  font-size: 10.5px; color: #64748b; font-family: inherit;
}
.fold-h:hover { color: var(--brand-primary, #c8102e); }
.fold-t { font-weight: 700; }
.fold-ar { margin-left: auto; color: #cbd5e1; font-size: 10px; transition: transform .15s; }
.fold-ar.open { transform: rotate(180deg); }
.fold-b { margin-top: 5px; max-height: 200px; overflow: auto; }
.fold-b .tbl td.r { text-align: right; font-variant-numeric: tabular-nums; }
.kpi { display: flex; align-items: baseline; gap: 6px; margin-bottom: 2px; }
.kpi b { font-size: 19px; font-weight: 800; letter-spacing: -.3px; font-variant-numeric: tabular-nums; }
.kpi .unit { font-size: 10.5px; color: var(--ink3, #94a3b8); }
.kpi .delta {
  font-size: 10.5px; font-weight: 700; padding: 1px 5px; border-radius: 4px;
  background: #fdf0f2; color: #c8102e;
}
.kpi .delta.down { background: #e8f5ef; color: #0e9f6e; }

.note {
  font-size: 10.5px; color: var(--ink3, #94a3b8);
  padding: 6px 10px; border-top: 1px solid #f7f9fc; background: #fcfcfd;
  line-height: 1.5;
}


/* 待办行：运单类的「第 N 趟」标签（常驻一单多趟） */
.todo .seq {
  flex: none;
  font-size: 9.5px;
  font-weight: 700;
  color: #1d4ed8;
  background: #eff4ff;
  border: 1px solid #dce7fb;
  border-radius: 4px;
  padding: 1px 5px;
}
</style>
