<template>
  <div class="screen-root">
    <div v-if="!allowed" class="deny">
      <div class="deny-box">
        <h2>暂无访问权限</h2>
        <p>当前账号未开通「运单费用大屏」</p>
        <button @click="back">返回工作台</button>
      </div>
    </div>

    <div v-else class="stage" :style="stageStyle">
      <!-- ===== 头部 ===== -->
      <header class="hd">
        <div class="hd-l">
          <div class="clock">{{ clockText }}<small>{{ dateText }}</small></div>
          <div class="chip"><i></i>{{ linkText }}</div>
        </div>
        <div class="hd-c">
          <h1>运单与费用监控中心</h1>
          <p>WAYBILL &amp; COST MONITOR</p>
        </div>
        <div class="hd-r">
          <div class="chip"><i class="cy"></i>今日运单 {{ wb.todayCount }}</div>
          <div class="chip" v-if="vis.canAudit"><i class="rd"></i>待审 {{ feeStatus('待审核').count }}</div>
          <ScreenTabs active="fee" />
          <button class="exit" @click="back">退出大屏</button>
        </div>
      </header>

      <div class="body">
        <!-- ===== 左栏：运单 ===== -->
        <aside class="col">
          <section class="p" style="flex:0 0 288px">
            <div class="p-h"><i></i><b>运单总览</b><em>WAYBILL</em></div>
            <div class="ov">
              <div class="ring" :style="{ '--p': wb.onTimeRate }">
                <div class="rv"><b>{{ wb.onTimeRate }}%</b><span>准时率</span></div>
              </div>
              <div class="ovk">
                <div class="kv"><b>{{ wb.todayCount }}</b><span>今日新增</span></div>
                <div class="kv"><b class="cy">{{ wb.activeCount }}</b><span>当前未完成</span></div>
                <div class="kv"><b class="gn">{{ wb.todayDone }}</b><span>今日送达</span></div>
              </div>
            </div>
            <div class="mini4">
              <div><b class="dm">{{ wb.g.待接单 }}</b><span>待接单</span></div>
              <div><b class="am">{{ wb.g.装车中 }}</b><span>装车中</span></div>
              <div><b class="cy">{{ wb.g.已发车 }}</b><span>已发车</span></div>
              <div><b class="gn">{{ wb.g.已到达 }}</b><span>已到达</span></div>
            </div>
          </section>

          <section class="p" style="flex:0 0 268px">
            <div class="p-h"><i></i><b>近 7 日运单量</b><em>VOLUME</em></div>
            <div class="lg" style="margin:0 0 6px">
              <span><i style="background:#FF3355"></i>新增</span>
              <span><i style="background:#33D6FF"></i>完成</span>
            </div>
            <div class="chart-box">
              <svg viewBox="0 0 384 120" preserveAspectRatio="none">
                <g stroke="rgba(120,170,220,.10)" stroke-width="1">
                  <line x1="0" y1="30" x2="384" y2="30"/>
                  <line x1="0" y1="62" x2="384" y2="62"/>
                  <line x1="0" y1="94" x2="384" y2="94"/>
                </g>
                <g>
                  <rect v-for="(b, i) in mkBars(wb.trendNew, '#FF3355', 0)" :key="'a' + i"
                    :x="b.x" :y="b.y" :width="b.w" :height="b.h" fill="rgba(255,51,85,.75)"/>
                  <rect v-for="(b, i) in mkBars(wb.trendDone, '#33D6FF', 1)" :key="'b' + i"
                    :x="b.x" :y="b.y" :width="b.w" :height="b.h" fill="rgba(51,214,255,.55)"/>
                </g>
              </svg>
            </div>
            <div class="axis7" style="padding:0 6px">
              <span v-for="d in wb.dayLabels" :key="'d' + d">{{ d }}</span>
            </div>
          </section>

          <section class="p" style="flex:1">
            <div class="p-h"><i></i><b>线路 TOP5</b><em>LANE</em></div>
            <div v-if="wb.lanes.length" class="lanes">
              <div v-for="(l, i) in wb.lanes" :key="i" class="lane">
                <span class="ln">
                  <span class="from">{{ l.from }}</span>
                  <span class="arw">→</span>
                  <span class="to">{{ l.to }}</span>
                </span>
                <span class="lc">{{ l.count }}<small>单</small></span>
              </div>
            </div>
            <div v-else class="empty-tip" style="flex:1">暂无线路数据</div>
            <div class="foot-line">
              <span>共 {{ wb.laneTotal }} 条线路</span>
              <span style="margin-left:auto">常驻任务 <b class="cy">{{ wb.recurringGroups }}</b> 组</span>
            </div>
          </section>
        </aside>

        <!-- ===== 中栏：地图 ===== -->
        <main class="col mid">
          <div class="map-wrap">
            <div id="fee-screen-map" class="map-canvas"></div>
            <div v-if="!mapReady" class="map-mask"><span>地图加载中</span></div>

            <div class="mkpi">
              <div :class="{ on: detailKey === 'active' }" @click="toggleDetail('active')">
                <b class="cy">{{ wb.activeCount }}</b><span>在途运单</span>
              </div>
              <div :class="{ on: detailKey === 'cars' }" @click="toggleDetail('cars')">
                <b>{{ wb.taskCars }}</b><span>有任务车辆</span>
              </div>
              <div :class="{ on: detailKey === 'done' }" @click="toggleDetail('done')">
                <b class="gn">{{ wb.todayDone }}</b><span>今日送达</span>
              </div>
              <div :class="{ on: detailKey === 'ontime' }" @click="toggleDetail('ontime')">
                <b>{{ wb.onTimeRate }}%</b><span>准时率</span>
              </div>
            </div>

            <transition name="slide">
              <div v-if="detailKey" class="detail">
                <div class="d-hd">
                  <span class="d-bar"></span><b>{{ detail.title }}</b>
                  <span class="d-sub">{{ detail.sub }}</span>
                  <span class="d-x" @click="detailKey = ''">×</span>
                </div>
                <div class="d-body">
                  <div class="d-head">
                    <span v-for="c in detail.cols" :key="c.k" :style="colStyle(c)">{{ c.t }}</span>
                  </div>
                  <div class="d-rows">
                    <div v-for="(r, i) in detail.rows" :key="i" class="d-row">
                      <span v-for="c in detail.cols" :key="c.k" :style="colStyle(c)" :class="c.cls">{{ r[c.k] }}</span>
                    </div>
                    <div v-if="!detail.rows.length" class="d-empty">暂无数据</div>
                  </div>
                </div>
                <div class="d-ft">{{ detail.foot }}</div>
              </div>
            </transition>

            <div class="map-tabs">
              <button v-for="v in views" :key="v.key" :class="{ on: view === v.key }"
                @click="switchView(v.key)">{{ v.name }}</button>
            </div>

            <div class="mlegend">
              <template v-if="view === 'v1'">
                <span><i style="background:#34D399"></i>行驶</span>
                <span><i style="background:#F59E0B"></i>静止</span>
                <span><i style="background:#6B7F94"></i>离线</span>
              </template>
              <template v-else-if="view === 'v2'">
                <span><i style="background:#FF3355"></i>有任务车辆</span>
                <span><i class="dia" style="background:#FF3355"></i>卸货地</span>
                <span><i class="line" style="background:#FF3355"></i>任务路线</span>
              </template>
              <template v-else>
                <span><i class="line" style="background:#FF3355"></i>线路流量（线宽=单量）</span>
              </template>
            </div>
            <div class="mtime">{{ metaText }}</div>
          </div>

          <section class="p chart">
            <div class="p-h"><i></i><b>今日运单节奏</b>
              <div class="lg">
                <span><i style="background:#FF3355"></i>发车</span>
                <span><i style="background:#33D6FF"></i>到达</span>
              </div>
            </div>
            <div class="chart-box">
              <svg viewBox="0 0 1000 110" preserveAspectRatio="none">
                <g stroke="rgba(120,170,220,.10)" stroke-width="1">
                  <line x1="0" y1="30" x2="1000" y2="30"/>
                  <line x1="0" y1="60" x2="1000" y2="60"/>
                  <line x1="0" y1="90" x2="1000" y2="90"/>
                </g>
                <rect v-for="(b, i) in rhythm.depart" :key="'dp' + i" :x="b.x" :y="b.y"
                  :width="b.w" :height="b.h" fill="rgba(255,51,85,.8)"/>
                <rect v-for="(b, i) in rhythm.arrive" :key="'ar' + i" :x="b.x" :y="b.y"
                  :width="b.w" :height="b.h" fill="rgba(51,214,255,.6)"/>
              </svg>
            </div>
            <div class="axis7" style="padding:0 20px">
              <span v-for="h in rhythm.labels" :key="h">{{ h }}</span>
            </div>
          </section>
        </main>

        <!-- ===== 右栏：费用 ===== -->
        <aside class="col">
          <template v-if="!vis.show">
            <section class="p" style="flex:1;align-items:center;justify-content:center">
              <div class="p-h" style="align-self:stretch"><i></i><b>费用</b><em>COST</em></div>
              <div class="no-fee">
                <div class="nf-ic">·</div>
                <p>该客户未开通费用相关功能</p>
                <span>费用明细 / 审批 / 付款登记均未授权，本区域不展示任何金额。</span>
              </div>
            </section>
          </template>

          <template v-else>
            <section class="p" style="flex:0 0 288px">
              <div class="p-h"><i></i><b>费用总览</b><em>{{ periodLabel }}</em></div>
              <div class="big">
                <span class="cur">¥</span><span class="bn">{{ fmt(fee.total) }}</span>
              </div>
              <div class="sub">上报 {{ fee.count }} 笔 · 本月合计</div>

              <div class="mini4">
                <div v-if="vis.canAudit"><b class="am">{{ feeStatus('待审核').count }}</b><span>待审核</span></div>
                <div v-if="vis.canAudit"><b class="am">{{ feeStatus('审核中').count }}</b><span>审核中</span></div>
                <div v-if="vis.canPay"><b class="cy">{{ feeStatus('待打款').count }}</b><span>待打款</span></div>
                <div v-if="vis.canPay"><b class="gn">{{ feeStatus('已打款').count }}</b><span>已打款</span></div>
                <div v-if="vis.canAudit"><b class="dm">{{ feeStatus('已驳回').count }}</b><span>已驳回</span></div>
                <div v-if="!vis.canAudit && !vis.canPay"><b>--</b><span>未授权</span></div>
              </div>

              <div class="fee-amt" v-if="vis.canAudit || vis.canPay">
                <div v-if="vis.canAudit">
                  <span>待审金额</span>
                  <b class="am">¥{{ fmt(feeStatus('待审核').amount + feeStatus('审核中').amount) }}</b>
                </div>
                <div v-if="vis.canPay">
                  <span>待打款金额</span>
                  <b class="cy">¥{{ fmt(feeStatus('待打款').amount) }}</b>
                </div>
              </div>
              <div class="degrade-note" v-if="vis.degraded">
                审批与付款流程均未开通，仅展示上报汇总
              </div>
            </section>

            <section class="p" style="flex:0 0 252px">
              <div class="p-h"><i></i><b>费用类型构成</b><em>BY TYPE</em></div>
              <div class="rowbar" v-for="t in feeTypeBars" :key="t.key">
                <span class="lb">{{ t.label }}</span>
                <span class="tk"><i :class="{ r: t.red }" :style="{ width: t.pct + '%' }"></i></span>
                <span class="vl">{{ fmt(t.amount) }}</span>
              </div>
              <div v-if="!feeTypeBars.length" class="empty-tip">暂无费用数据</div>
              <div class="foot-line">
                <span>合计 <b>¥{{ fmt(fee.total) }}</b></span>
                <span style="margin-left:auto">单均 ¥{{ fee.count ? fmt(Math.round(fee.total / fee.count)) : '--' }}</span>
              </div>
            </section>

            <section class="p" style="flex:1">
              <div class="p-h"><i></i><b>{{ vis.canAudit ? '审批流转' : '费用状态' }}</b><em>{{ periodLabel }}</em></div>
              <div v-if="funnel.length" class="funnel">
                <div v-for="f in funnel" :key="f.label" class="fn-row">
                  <span class="fn-lb">{{ f.label }}</span>
                  <span class="fn-track">
                    <i class="fn-bar" :style="{ width: f.pct + '%', background: f.bg }">{{ f.count }}</i>
                  </span>
                  <span class="fn-sub">¥{{ fmt(f.amount) }}</span>
                </div>
              </div>
              <div v-else class="empty-tip">暂无数据</div>
              <div class="foot-line" v-if="vis.canAudit">
                <span>平均审批时长 <b>{{ fee.avgHours }}</b> h</span>
                <span style="margin-left:auto" :class="{ warn: fee.staleCount > 0 }">超 24h 未审 {{ fee.staleCount }} 笔</span>
              </div>
            </section>
          </template>
        </aside>
      </div>

      <button v-if="scale < 0.92" class="fs-tip" @click="goFullscreen">
        当前缩放 {{ Math.round(scale * 100) }}% · 点此进入全屏（F11）
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import AMapLoader from '@amap/amap-jsapi-loader'
import ScreenTabs from '@/components/screen/ScreenTabs.vue'
import { ensureModuleFlags, ensureApprovalMode } from '@/utils/modules'
import {
  screenScope, loadScreenVehicles, pullRealtime,
  loadWaybills, groupWaybillStatus, routableWaybills, feeVisibility, loadFeeSummary,
} from '@/utils/screenData'

const AMAP_KEY = '273f5c474604b71906674aac159b8f45'
const router = useRouter()

const scope = screenScope()
const allowed = computed(() => {
  if (scope.isAdmin || scope.isMaster) return true
  return scope.perms.includes('screen_fee')
})

/* ============================================================
   状态
   ============================================================ */
const scale = ref(1)
const clockText = ref('')
const dateText = ref('')
const linkText = ref('数据链路正常')
const stageStyle = computed(() => ({ transform: `scale(${scale.value})` }))

const view = ref('v1')
const mapReady = ref(false)
const views = [
  { key: 'v1', name: '车辆定位' },
  { key: 'v2', name: '任务路线' },
  { key: 'v3', name: '运单流向' },
]
const META = {
  v1: '定位更新 30s · 高德暗色底图',
  v2: '任务路线 · 卸货地坐标取自运单',
  v3: '运单流向 · 按装卸地坐标聚合',
}
const metaText = computed(() => META[view.value])

const wb = reactive({
  todayCount: 0, activeCount: 0, todayDone: 0, onTimeRate: 0,
  g: { 待接单: 0, 装车中: 0, 已发车: 0, 已到达: 0, 已完成: 0, 已取消: 0 },
  dayLabels: [], trendNew: [], trendDone: [], barsNew: [],
  lanes: [], laneTotal: 0, recurringGroups: 0, taskCars: 0,
})

const fee = reactive({
  total: 0, count: 0, byStatus: {}, byType: {},
  avgHours: '--', staleCount: 0,
})
const vis = reactive({
  show: false, approvalOn: true, payoutOn: false,
  canReport: false, canAudit: false, canPay: false, degraded: false,
})
const periodLabel = ref('本月')

const rhythm = reactive({ labels: [], depart: [], arrive: [] })

/* 明细面板（4 个 KPI 共用） */
const detailKey = ref('')
const wbList = reactive({ active: [], cars: [], done: [], ontime: [] })

let vehicles = []
let rtMap = new Map()
let waybills = []
let map = null
let AMapRef = null
let overlays = []
let tClock = null, tRefresh = null

/* ============================================================
   工具
   ============================================================ */
const fmt = (n) => (n == null || n === '' ? '--' : Number(n).toLocaleString('zh-CN'))

function back() { router.push('/dashboard') }

/** 浏览器窗口小于设计稿时整屏会被等比缩小，字号随之变小 —— 引导进全屏 */
async function goFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen()
  } catch (e) { /* 用户拒绝或浏览器不支持，忽略 */ }
}
function fit() { scale.value = Math.min(window.innerWidth / 1920, window.innerHeight / 1080) }

function feeStatus(s) {
  const x = fee.byStatus[s] || { count: 0, amount: 0 }
  return { count: x.count || 0, amount: x.amount || 0 }
}

const TYPE_LABEL = { expense: '费用上报', subsidy: '补贴', loan: '借款', violation: '违章', weigh: '过磅' }

const feeTypeBars = computed(() => {
  const rows = Object.entries(fee.byType || {})
    .map(([key, v]) => ({ key, label: TYPE_LABEL[key] || key, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount)
  const max = rows.length ? rows[0].amount : 1
  return rows.map((r, i) => ({
    ...r,
    pct: Math.max(4, Math.round((r.amount / max) * 100)),
    red: i === rows.length - 1 && rows.length > 2,
  }))
})

/** 审批漏斗：只放当前开关允许的环节 */
const funnel = computed(() => {
  const order = []
  if (vis.canAudit) order.push('待审核', '审核中')
  if (vis.canAudit) order.push('已通过')
  if (vis.canPay) order.push('待打款', '已打款')
  if (vis.canAudit) order.push('已驳回')
  const list = order.map((s) => ({ label: s, ...feeStatus(s) })).filter((x) => x.count > 0)
  const max = Math.max(...list.map((x) => x.count), 1)
  const BG = {
    待审核: 'linear-gradient(90deg,rgba(255,176,32,.75),rgba(255,176,32,.4))',
    审核中: 'linear-gradient(90deg,rgba(255,138,61,.75),rgba(255,138,61,.4))',
    已通过: 'linear-gradient(90deg,rgba(51,214,255,.75),rgba(51,214,255,.35))',
    待打款: 'linear-gradient(90deg,rgba(43,224,138,.75),rgba(43,224,138,.35))',
    已打款: 'linear-gradient(90deg,rgba(255,51,85,.8),rgba(255,51,85,.35))',
    已驳回: 'linear-gradient(90deg,rgba(107,127,148,.6),rgba(107,127,148,.3))',
  }
  return list.map((x) => ({ ...x, pct: Math.max(8, Math.round((x.count / max) * 100)), bg: BG[x.label] }))
})

function colStyle(c) {
  if (!c || c.w === '1fr') return { flex: '1 1 0', minWidth: 0 }
  return { width: c.w, flex: '0 0 auto' }
}

function toggleDetail(k) {
  detailKey.value = detailKey.value === k ? '' : k
}

const detail = computed(() => {
  const k = detailKey.value
  if (k === 'active') {
    return {
      title: '在途运单', sub: `共 ${wbList.active.length} 单`,
      cols: [
        { k: 'no', t: '运单号', w: '130px', cls: 'num' },
        { k: 'plate', t: '车牌', w: '96px', cls: 'num' },
        { k: 'status', t: '状态', w: '70px', cls: '' },
        { k: 'route', t: '线路', w: '1fr', cls: 'clip' },
        { k: 'plan', t: '计划到达', w: '92px', cls: 'num' },
      ],
      rows: wbList.active,
      foot: '不含已完成 / 已取消 · 按计划到达升序',
    }
  }
  if (k === 'cars') {
    return {
      title: '有任务车辆', sub: `共 ${wbList.cars.length} 辆`,
      cols: [
        { k: 'plate', t: '车牌', w: '104px', cls: 'num' },
        { k: 'count', t: '在途单', w: '72px', cls: 'num' },
        { k: 'status', t: '当前状态', w: '84px', cls: '' },
        { k: 'dest', t: '最近卸货地', w: '1fr', cls: 'clip' },
      ],
      rows: wbList.cars,
      foot: '车牌取自运单指派（多指派取 method=vehicle 的那辆）',
    }
  }
  if (k === 'done') {
    return {
      title: '今日送达', sub: `共 ${wbList.done.length} 单`,
      cols: [
        { k: 'no', t: '运单号', w: '140px', cls: 'num' },
        { k: 'plate', t: '车牌', w: '104px', cls: 'num' },
        { k: 'dest', t: '卸货地', w: '1fr', cls: 'clip' },
        { k: 'time', t: '完成时间', w: '74px', cls: 'num' },
      ],
      rows: wbList.done,
      foot: '按完成时间倒序',
    }
  }
  if (k === 'ontime') {
    return {
      title: '准时率明细', sub: `已完成 ${wbList.ontime.length} 单 · 准时 ${wb.onTimeRate}%`,
      cols: [
        { k: 'no', t: '运单号', w: '124px', cls: 'num' },
        { k: 'plate', t: '车牌', w: '92px', cls: 'num' },
        { k: 'plan', t: '计划到达', w: '96px', cls: 'num' },
        { k: 'real', t: '实际到达', w: '96px', cls: 'num' },
        { k: 'result', t: '结果', w: '84px', cls: '' },
      ],
      rows: wbList.ontime,
      foot: '口径：实际到达 ≤ 计划到达 记为准时',
    }
  }
  return { title: '', sub: '', cols: [], rows: [], foot: '' }
})

function mkBars(data, color, offset) {
  const n = Math.max(data.length, 1)
  const slot = 384 / n
  const w = slot * 0.36
  const max = Math.max(...data, 1)
  return data.map((v, i) => {
    const h = (v / max) * 82
    const x = slot * i + slot * 0.12 + offset * (slot * 0.42)
    return { x, y: 104 - h, w, h }
  })
}

/* ============================================================
   地图
   ============================================================ */
async function initMap() {
  try {
    AMapRef = await AMapLoader.load({ key: AMAP_KEY, version: '2.0', plugins: [] })
    map = new AMapRef.Map('fee-screen-map', {
      zoom: 7, center: [112.3, 37.6],
      mapStyle: 'amap://styles/darkblue',
      viewMode: '2D',
      features: ['bg', 'road', 'building'],
    })
    map.on('complete', () => {
      /* 图块刚 complete 时还会补绘一帧，留 260ms 再揭开，彻底防白闪 */
      setTimeout(() => { mapReady.value = true }, 260)
    })
    setTimeout(() => { mapReady.value = true }, 4000)
  } catch (e) {
    console.warn('[费用大屏] 地图加载失败', e)
  }
}

function clearOverlays() {
  if (!map) return
  if (overlays.length) { map.remove(overlays); overlays = [] }
}

function curvePoints(a, b, bend = 0.16) {
  const [x1, y1] = a
  const [x2, y2] = b
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  const dx = x2 - x1, dy = y2 - y1
  const cx = mx - dy * bend, cy = my + dx * bend
  const pts = []
  for (let t = 0; t <= 1.0001; t += 0.06) {
    const k = 1 - t
    pts.push([k * k * x1 + 2 * k * t * cx + t * t * x2, k * k * y1 + 2 * k * t * cy + t * t * y2])
  }
  return pts
}

function addLine(path, weight, opacity) {
  const line = new AMapRef.Polyline({
    path,
    strokeColor: '#FF3355',
    strokeWeight: weight,
    strokeOpacity: opacity,
    lineJoin: 'round',
    lineCap: 'round',
    zIndex: weight > 3 ? 60 : 80,
  })
  return line
}

const STATUS_COLOR = { 行驶: '#34D399', 静止: '#F59E0B', 离线: '#6B7F94' }

function markerDot(rt) {
  const c = STATUS_COLOR[rt.status] || '#6B7F94'
  return `<div class="vp-dot" style="--c:${c}"></div>`
}

let infoWin = null

function openVehicleInfo(v, rt) {
  if (!AMapRef || !map || !rt) return
  const c = STATUS_COLOR[rt.status] || '#6B7F94'
  const ago = rt.reportAt ? Math.max(0, Math.round((Date.now() - rt.reportAt) / 60000)) : null
  const html = `
    <div class="v-info">
      <div class="vi-hd">
        <span class="vi-plate">${v.plate || '--'}</span>
        <span class="vi-st" style="color:${c}">${rt.status || '--'}</span>
      </div>
      <div class="vi-row"><span class="vi-k">速度</span><span class="vi-v">${Math.round(rt.speed || 0)} km/h</span></div>
      <div class="vi-row"><span class="vi-k">位置</span><span class="vi-v">${rt.locationText || '--'}</span></div>
      <div class="vi-row"><span class="vi-k">司机</span><span class="vi-v">${v.driver || '未绑定'}</span></div>
      <div class="vi-row"><span class="vi-k">机构</span><span class="vi-v">${v.org || '--'}</span></div>
      <div class="vi-row"><span class="vi-k">上报</span><span class="vi-v">${rt.reportTime ? dayjs(rt.reportTime).format('MM-DD HH:mm:ss') : '--'}${ago != null ? '（' + ago + ' 分钟前）' : ''}</span></div>
      <div class="vi-ft"><span>VIN ${v.vin || '未配置'}</span></div>
    </div>`
  if (!infoWin) {
    infoWin = new AMapRef.InfoWindow({
      isCustom: true,
      offset: new AMapRef.Pixel(0, -18),
      closeWhenClickMap: true,
      autoMove: true,
    })
  }
  infoWin.setContent(html)
  infoWin.open(map, [rt.lng, rt.lat])
}

function renderView() {
  if (!map || !AMapRef) return
  clearOverlays()

  if (view.value === 'v1') {
    vehicles.forEach((v) => {
      const rt = rtMap.get(v.plate)
      if (!rt || !Number.isFinite(rt.lng)) return
      const mk = new AMapRef.Marker({
        position: [rt.lng, rt.lat], content: markerDot(rt),
        offset: new AMapRef.Pixel(-11, -11), title: v.plate,
      })
      mk.on('click', () => openVehicleInfo(v, rt))
      overlays.push(mk)
    })
    if (overlays.length) map.add(overlays)
    return
  }

  if (view.value === 'v2') {
    const tasks = routableWaybills(waybills)
    tasks.forEach((w) => {
      const plate = singlePlate(w)
      if (!plate) return
      const rt = rtMap.get(plate)
      if (!rt || !Number.isFinite(rt.lng)) return
      const end = [Number(w.delivery_lng), Number(w.delivery_lat)]
      const pts = curvePoints([rt.lng, rt.lat], end)
      overlays.push(addLine(pts, 5, 0.1), addLine(pts, 1.8, 0.9))
      overlays.push(new AMapRef.Marker({
        position: end,
        content: `<div style="width:9px;height:9px;background:#FF3355;transform:rotate(45deg);
          box-shadow:0 0 0 3px rgba(255,51,85,.18)"></div>`,
        offset: new AMapRef.Pixel(-4.5, -4.5),
      }))
      const carMk = new AMapRef.Marker({
        position: [rt.lng, rt.lat], content: markerDot({ status: '行驶' }),
        offset: new AMapRef.Pixel(-11, -11), title: plate,
      })
      carMk.on('click', () => openVehicleInfo(vehicles.find((x) => x.plate === plate) || { plate }, rt))
      overlays.push(carMk)
    })
    if (overlays.length) map.add(overlays)
    return
  }

  /* v3：按装卸地坐标聚合成线路，线宽 = 单量 */
  const groups = new Map()
  const all = waybills.filter((w) => {
    const a = Number(w.pickup_lng), b = Number(w.pickup_lat)
    const c = Number(w.delivery_lng), d = Number(w.delivery_lat)
    return a && b && c && d
  })
  all.forEach((w) => {
    const key = `${Math.round(w.pickup_lng * 10)}_${Math.round(w.pickup_lat * 10)}__` +
      `${Math.round(w.delivery_lng * 10)}_${Math.round(w.delivery_lat * 10)}`
    if (!groups.has(key)) {
      groups.set(key, {
        count: 0,
        from: [Number(w.pickup_lng), Number(w.pickup_lat)],
        to: [Number(w.delivery_lng), Number(w.delivery_lat)],
        name: w.pickup || '装货地',
      })
    }
    groups.get(key).count++
  })
  const list = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 12)
  const maxCount = list.length ? list[0].count : 1
  list.forEach((g) => {
    const w = 1.2 + (g.count / maxCount) * 1.6
    const pts = curvePoints(g.from, g.to)
    overlays.push(addLine(pts, w * 2.4, 0.1), addLine(pts, w, 0.85))
    overlays.push(new AMapRef.Marker({
      position: g.to,
      content: `<div style="width:7px;height:7px;border-radius:50%;background:#FF3355;
        box-shadow:0 0 0 3px rgba(255,51,85,.16)"></div>`,
      offset: new AMapRef.Pixel(-3.5, -3.5),
    }))
  })
  if (overlays.length) {
    map.add(overlays)
    try { map.setFitView(overlays, false, [80, 80, 80, 80]) } catch (e) { /* ignore */ }
  }
}

function singlePlate(w) {
  const v = String(w.vehicle || '').trim()
  const bad = !v || v === '--' || v.includes('/') || v.includes('多')
  if (!bad) return v
  try {
    const arr = typeof w.assignments === 'string' ? JSON.parse(w.assignments) : w.assignments
    if (Array.isArray(arr)) {
      const one = arr.find((a) => a && a.method === 'vehicle' && a.target)
      if (one) return String(one.target).trim()
    }
  } catch (e) { /* ignore */ }
  return ''
}

function switchView(k) {
  view.value = k
  renderView()
}

/* ============================================================
   取数
   ============================================================ */
async function loadWaybillData() {
  waybills = await loadWaybills(scope)
  const today = dayjs().format('YYYY-MM-DD')
  const now = Date.now()

  const g = groupWaybillStatus(waybills)
  Object.assign(wb.g, g)

  wb.todayCount = waybills.filter((w) => (w.create_time || '').slice(0, 10) === today).length
  wb.activeCount = waybills.filter((w) => !['已完成', '已取消'].includes(w.status)).length
  wb.todayDone = waybills.filter((w) => (w.finish_time || '').slice(0, 10) === today).length

  /* 准时率：已完成单里 实际到达 <= 计划到达 */
  const done = waybills.filter((w) => w.status === '已完成' && w.arrive_time && w.plan_time)
  const onTime = done.filter((w) => new Date(w.arrive_time) <= new Date(w.plan_time)).length
  wb.onTimeRate = done.length ? Math.round((onTime / done.length) * 100) : 0

  /* 有任务车辆 */
  const carSet = new Set()
  waybills.forEach((w) => {
    if (['已完成', '已取消'].includes(w.status)) return
    const p = singlePlate(w)
    if (p) carSet.add(p)
  })
  wb.taskCars = carSet.size

  /* 常驻任务组 */
  const rg = new Set()
  waybills.forEach((w) => { if (w.is_recurring && w.recurring_group_no) rg.add(w.recurring_group_no) })
  wb.recurringGroups = rg.size

  /* 近 7 日新增 / 完成 */
  const labels = [], tn = [], td = []
  for (let i = 6; i >= 0; i--) {
    const d = dayjs().subtract(i, 'day').format('YYYY-MM-DD')
    labels.push(d.slice(5))
    tn.push(waybills.filter((w) => (w.create_time || '').slice(0, 10) === d).length)
    td.push(waybills.filter((w) => (w.finish_time || '').slice(0, 10) === d).length)
  }
  wb.dayLabels = labels
  wb.trendNew = tn
  wb.trendDone = td
  wb.barsNew = mkBars(tn, '#FF3355', 0)

  /* 线路 TOP5 */
  const laneMap = new Map()
  waybills.forEach((w) => {
    const f = (w.pickup || '').trim()
    const t = (w.delivery || '').trim()
    if (!f || !t) return
    const k = `${f}→${t}`
    if (!laneMap.has(k)) laneMap.set(k, { from: f, to: t, count: 0 })
    laneMap.get(k).count++
  })
  wb.laneTotal = laneMap.size
  wb.lanes = [...laneMap.values()].sort((a, b) => b.count - a.count).slice(0, 5)

  /* ---------- 明细数据 ---------- */
  const act = waybills
    .filter((w) => !['已完成', '已取消'].includes(w.status))
    .sort((a, b) => String(a.plan_time || '9').localeCompare(String(b.plan_time || '9')))

  wbList.active = act.map((w) => ({
    no: w.waybill_no || '--',
    plate: singlePlate(w) || '--',
    status: w.status || '--',
    route: `${w.pickup || '--'} → ${w.delivery || '--'}`,
    plan: w.plan_time ? dayjs(w.plan_time).format('MM-DD HH:mm') : '--',
  }))

  const carMap = new Map()
  act.forEach((w) => {
    const p = singlePlate(w)
    if (!p) return
    if (!carMap.has(p)) carMap.set(p, { plate: p, count: 0, dest: w.delivery || '--' })
    const it = carMap.get(p)
    it.count++
    it.dest = w.delivery || it.dest
  })
  wbList.cars = [...carMap.values()]
    .sort((a, b) => b.count - a.count)
    .map((c) => {
      const rt = rtMap.get(c.plate)
      return { plate: c.plate, count: String(c.count), status: rt ? rt.status : '无定位', dest: c.dest }
    })

  wbList.done = waybills
    .filter((w) => (w.finish_time || '').slice(0, 10) === today)
    .sort((a, b) => String(b.finish_time || '').localeCompare(String(a.finish_time || '')))
    .map((w) => ({
      no: w.waybill_no || '--',
      plate: singlePlate(w) || '--',
      dest: w.delivery || '--',
      time: w.finish_time ? dayjs(w.finish_time).format('HH:mm') : '--',
    }))

  wbList.ontime = waybills
    .filter((w) => w.arrive_time && w.plan_time)
    .map((w) => {
      const diff = Math.round((new Date(w.arrive_time) - new Date(w.plan_time)) / 60000)
      return {
        no: w.waybill_no || '--',
        plate: singlePlate(w) || '--',
        plan: dayjs(w.plan_time).format('MM-DD HH:mm'),
        real: dayjs(w.arrive_time).format('MM-DD HH:mm'),
        result: diff <= 0 ? '准时' : `延迟 ${diff} 分`,
        late: diff,
      }
    })
    .sort((a, b) => b.late - a.late)
    .slice(0, 60)

  /* 今日运单节奏（按发车 / 到达小时） */
  const dep = new Array(14).fill(0)
  const arr = new Array(14).fill(0)
  const base = 6
  waybills.forEach((w) => {
    const d = w.depart_time ? dayjs(w.depart_time) : null
    if (d && d.format('YYYY-MM-DD') === today) {
      const h = d.hour() - base
      if (h >= 0 && h < 14) dep[h]++
    }
    const a = w.arrive_time ? dayjs(w.arrive_time) : null
    if (a && a.format('YYYY-MM-DD') === today) {
      const h = a.hour() - base
      if (h >= 0 && h < 14) arr[h]++
    }
  })
  buildRhythm(dep, arr)
}

function buildRhythm(dep, arr) {
  const n = 14
  const slot = 1000 / n
  const w = slot * 0.4
  const max = Math.max(...dep, ...arr, 1)
  const mk = (data, offset) => data.map((v, i) => {
    const h = (v / max) * 82
    return { x: slot * i + slot * 0.1 + offset, y: 104 - h, w, h }
  })
  rhythm.depart = mk(dep, 0)
  rhythm.arrive = mk(arr, slot * 0.45)
  rhythm.labels = []
  for (let i = 0; i < n; i += 2) {
    rhythm.labels.push(`${String(6 + i).padStart(2, '0')}:00`)
  }
}

async function loadFeeData() {
  Object.assign(vis, feeVisibility(scope))
  if (!vis.show) return

  const start = dayjs().startOf('month').toISOString()
  const end = dayjs().endOf('month').toISOString()
  const r = await loadFeeSummary(scope, vis, start, end)
  fee.total = Math.round(r.total)
  fee.count = r.count
  fee.byStatus = r.byStatus
  fee.byType = r.byType

  /* 平均审批时长 / 超 24h 未审：只有拿得到 flow 与时间时才估 */
  if (vis.canAudit) {
    const pending = r.list.filter((x) => x.status === '待审核' || x.status === '审核中')
    fee.staleCount = pending.filter((x) => {
      const t = x.create_time ? new Date(x.create_time).getTime() : 0
      return t && Date.now() - t > 24 * 3600 * 1000
    }).length
  } else {
    fee.staleCount = 0
  }
  fee.avgHours = '--'
}

async function refreshVehicles() {
  vehicles = await loadScreenVehicles(scope)
  rtMap = await pullRealtime(vehicles)
  renderView()
}

/* ============================================================
   生命周期
   ============================================================ */
function tickClock() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  clockText.value = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  dateText.value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${wd}`
}

onMounted(async () => {
  if (!allowed.value) return
  fit()
  window.addEventListener('resize', fit)
  tickClock()
  tClock = setInterval(tickClock, 1000)

  /* ⭐ 费用两把开关必须先就位，否则 vis 全是默认值 */
  try {
    await ensureModuleFlags()
    await ensureApprovalMode()
  } catch (e) {
    console.warn('[费用大屏] 模块开关读取失败，按默认口径降级', e)
  }

  await initMap()
  await refreshVehicles()
  await loadWaybillData()
  renderView()
  await loadFeeData()

  tRefresh = setInterval(async () => {
    await refreshVehicles()
    await loadWaybillData()
    renderView()
  }, 60000)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', fit)
  clearInterval(tClock); clearInterval(tRefresh)
  if (map) { map.destroy(); map = null }
})
</script>

<style scoped>
.screen-root{position:absolute;inset:0;background:#04060B;overflow:hidden;display:flex;
  align-items:center;justify-content:center;font-family:'PingFang SC',-apple-system,sans-serif}
.stage{position:relative;width:1920px;height:1080px;flex:none;background:#050A14;color:#DCE9F9;
  display:flex;flex-direction:column;transform-origin:center center;overflow:hidden}
.stage::before{content:'';position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(1000px 520px at 50% -6%,rgba(22,78,150,.3),transparent 72%),
    radial-gradient(760px 420px at 50% 104%,rgba(130,10,34,.2),transparent 72%)}

.hd{position:relative;z-index:3;flex:0 0 86px;height:86px;display:flex;align-items:center;
  padding:0 26px;border-bottom:1px solid rgba(90,150,220,.13)}
.hd::after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:1px;
  background:linear-gradient(90deg,transparent,rgba(255,45,75,.55) 50%,transparent)}
.hd-l{display:flex;flex-direction:column;gap:5px;min-width:260px}
.clock{font-family:var(--num-font,ui-monospace);font-size:26px;font-weight:700;color:#F2F8FF;letter-spacing:1.5px}
.clock small{font-size:13.5px;color:#6E88A6;margin-left:8px;font-weight:400}
.chip{display:inline-flex;align-items:center;gap:7px;height:24px;padding:0 10px;font-size:12px;
  color:#9DB6D2;border:1px solid rgba(90,150,220,.22);background:rgba(10,22,40,.6);border-radius:3px;width:fit-content}
.chip i{width:6px;height:6px;border-radius:50%;background:#2BE08A}
.chip i.cy{background:#33D6FF}.chip i.rd{background:#FF3355}
.hd-c{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);text-align:center}
.hd-c h1{font-size:32px;font-weight:800;letter-spacing:11px;text-indent:11px;margin:0;
  background:linear-gradient(180deg,#fff 25%,#9EC4E8 100%);-webkit-background-clip:text;
  background-clip:text;color:transparent}
.hd-c p{margin:5px 0 0;font-size:11.5px;letter-spacing:3.2px;color:#5A7695}
.hd-r{margin-left:auto;display:flex;gap:9px;align-items:center}
.exit{border:1px solid rgba(90,150,220,.3);background:rgba(10,22,40,.6);color:#9DB6D2;
  font-size:13.5px;padding:5px 13px;border-radius:3px;cursor:pointer;font-family:inherit}
.exit:hover{color:#fff;border-color:rgba(255,45,75,.5)}

.body{position:relative;z-index:2;flex:1;min-height:0;display:grid;
  grid-template-columns:442px 1fr 442px;gap:14px;padding:14px 16px}
.col{display:flex;flex-direction:column;gap:10px;min-height:0}
.p{position:relative;display:flex;flex-direction:column;min-height:0;padding:10px 12px;
  background:linear-gradient(160deg,rgba(12,24,42,.82),rgba(7,14,26,.72));
  border:1px solid rgba(84,144,214,.16)}
.p::before,.p::after{content:'';position:absolute;width:11px;height:11px;
  border:1px solid rgba(255,45,75,.65);pointer-events:none}
.p::before{left:-1px;top:-1px;border-right:0;border-bottom:0}
.p::after{right:-1px;bottom:-1px;border-left:0;border-top:0}
.p-h{flex:0 0 auto;display:flex;align-items:center;gap:9px;margin-bottom:10px}
.p-h i{width:3px;height:14px;background:linear-gradient(180deg,#FF6B81,#FF1F3D)}
.p-h b{font-size:16.5px;font-weight:700;letter-spacing:1.4px;color:#EAF4FF}
.p-h em{font-style:normal;margin-left:auto;font-size:11.5px;letter-spacing:1.6px;color:#4E6885}

.ov{display:flex;align-items:center;gap:18px}
.ring{position:relative;width:140px;height:140px;border-radius:50%;flex:none;
  background:conic-gradient(from -90deg,#33D6FF 0 calc(var(--p) * 1%),rgba(255,255,255,.055) 0)}
.ring::after{content:'';position:absolute;inset:14px;border-radius:50%;background:#07101C}
.rv{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:3px}
.rv b{font-family:var(--num-font,ui-monospace);font-size:32px;color:#fff;line-height:1}
.rv span{font-size:12px;color:#6E88A6}
.ovk{display:flex;flex-direction:column;gap:13px}
.kv b{display:block;font-family:var(--num-font,ui-monospace);font-size:25px;color:#fff;line-height:1.1}
.kv span{font-size:12px;color:#7089A6}
.mini4{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;margin-top:14px;
  background:rgba(90,150,220,.14);border:1px solid rgba(90,150,220,.14)}
.mini4>div{background:rgba(8,17,30,.9);padding:9px 6px;text-align:center}
.mini4 b{display:block;font-family:var(--num-font,ui-monospace);font-size:23px;color:#EAF4FF}
.mini4 span{display:block;font-size:12px;color:#6E88A6;margin-top:5px}
.cy{color:#33D6FF!important}.dm{color:#6B7F94!important}.rd{color:#FF4D66!important}
.am{color:#FFB020!important}.gn{color:#2BE08A!important}

.lanes{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-start}
.lane{display:flex;align-items:center;gap:8px;padding:7px 0;
  border-bottom:1px dashed rgba(90,150,220,.12);font-size:13.5px}
.lane:last-child{border-bottom:none}
.ln{display:flex;align-items:center;gap:6px;min-width:0;flex:1}
.ln .from,.ln .to{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:118px;color:#B7CBE0}
.ln .to{color:#FFB3BE}
.ln .arw{color:#FF3355;font-size:11.5px}
.lc{font-family:var(--num-font,ui-monospace);font-size:14px;color:#EAF4FF}
.lc small{font-size:11.5px;color:#6E88A6;margin-left:2px}

.lg{display:flex;gap:14px;font-size:11.5px;color:#7E97B4}
.lg i{display:inline-block;width:14px;height:3px;margin-right:5px;vertical-align:middle}
.chart-box{flex:1;min-height:0;position:relative}
.chart-box svg{position:absolute;inset:0;width:100%;height:100%}
.axis7{display:flex;justify-content:space-between;font-size:11.5px;color:#5E7895;
  font-family:var(--num-font,ui-monospace);padding:0 2px}
.foot-line{margin-top:11px;padding-top:9px;border-top:1px dashed rgba(90,150,220,.18);
  font-size:12px;color:#6E88A6;display:flex;align-items:center;gap:8px}
.foot-line b{font-family:var(--num-font,ui-monospace);font-size:14.5px;color:#EAF4FF}
.foot-line .warn{color:#FF7A8E}
.empty-tip{font-size:13.5px;color:#4E6885;text-align:center;padding:20px 0;flex:1;
  display:flex;align-items:center;justify-content:center}

.big{display:flex;align-items:baseline;gap:4px}
.big .cur{font-size:17.5px;color:#6E88A6}
.bn{font-family:var(--num-font,ui-monospace);font-size:38px;font-weight:700;color:#fff;line-height:1;letter-spacing:-1px}
.sub{font-size:12px;color:#6E88A6;margin-top:6px}
.fee-amt{display:grid;grid-template-columns:1fr 1fr;gap:1px;margin-top:10px;
  background:rgba(90,150,220,.14);border:1px solid rgba(90,150,220,.14)}
.fee-amt>div{background:rgba(8,17,30,.9);padding:8px 10px}
.fee-amt span{display:block;font-size:11.5px;color:#6E88A6}
.fee-amt b{font-family:var(--num-font,ui-monospace);font-size:16.5px;margin-top:3px;display:block}
.degrade-note{margin-top:10px;font-size:11.5px;color:#4E6885;border-left:2px dashed rgba(124,143,169,.4);padding-left:8px}

.funnel{flex:1;display:flex;flex-direction:column;justify-content:center;gap:6px}
.fn-row{display:flex;align-items:center;gap:8px}
.fn-lb{width:56px;flex:none;font-size:12px;color:#8AA4C0}
.fn-track{flex:1;height:20px}
.fn-bar{display:flex;align-items:center;justify-content:flex-end;height:20px;padding-right:7px;
  font-family:var(--num-font,ui-monospace);font-size:12px;color:#fff;
  clip-path:polygon(0 0,100% 0,calc(100% - 8px) 100%,0 100%)}
.fn-sub{width:76px;flex:none;text-align:right;font-family:var(--num-font,ui-monospace);font-size:12px;color:#7E97B4}

.mid{gap:12px}
.map-wrap{position:relative;flex:1;min-height:0;border:1px solid rgba(51,214,255,.28);overflow:hidden}
.map-canvas{position:absolute;inset:0;background:#04070F}
.map-mask{position:absolute;inset:0;z-index:3;background:#04070F;display:flex;
  align-items:center;justify-content:center;color:#4E6885;font-size:13.5px;letter-spacing:2px}
.mkpi{position:absolute;z-index:5;top:11px;left:11px;right:11px;display:flex;gap:9px}
.mkpi>div{position:relative;flex:1;padding:7px 12px;background:rgba(6,14,26,.84);
  border:1px solid rgba(84,144,214,.22);cursor:pointer;transition:border-color .2s,background .2s}
.mkpi>div::after{content:'详情';position:absolute;right:9px;top:7px;font-size:11px;color:#3F5773}
.mkpi>div:hover{border-color:rgba(255,45,75,.5);background:rgba(24,34,54,.9)}
.mkpi>div.on{border-color:rgba(255,45,75,.75);background:rgba(40,18,26,.9)}
.mkpi>div.on::after{content:'展开中';color:#FF3355}

.detail{position:absolute;z-index:8;top:72px;right:0;bottom:0;width:640px;display:flex;
  flex-direction:column;background:linear-gradient(160deg,rgba(9,18,32,.97),rgba(5,10,18,.97));
  border-left:1px solid rgba(255,45,75,.38);box-shadow:-28px 0 64px rgba(0,0,0,.6)}
.d-hd{flex:0 0 46px;display:flex;align-items:center;gap:9px;padding:0 14px;
  border-bottom:1px solid rgba(255,45,75,.22);background:rgba(255,45,75,.06)}
.d-bar{width:3px;height:15px;background:linear-gradient(180deg,#FF6B81,#FF1F3D)}
.d-hd b{font-size:16.5px;letter-spacing:1.2px;color:#EAF4FF}
.d-sub{font-size:12px;color:#6E88A6}
.d-x{margin-left:auto;width:22px;height:22px;display:flex;align-items:center;justify-content:center;
  border:1px solid rgba(255,45,75,.3);color:#C98A95;cursor:pointer;font-size:15px}
.d-body{flex:1;min-height:0;overflow:auto}
.d-head{position:sticky;top:0;z-index:2;display:flex;gap:8px;padding:9px 14px;font-size:11.5px;
  color:#5E7895;background:rgba(6,12,22,.97);border-bottom:1px solid rgba(90,150,220,.14)}
.d-row{display:flex;gap:8px;padding:8px 14px;font-size:13.5px;color:#B7CBE0;
  border-bottom:1px solid rgba(90,150,220,.07)}
.d-row:hover{background:rgba(51,214,255,.05)}
.d-row .num{font-family:var(--num-font,ui-monospace);color:#EAF4FF}
.d-row .clip{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#8AA4C0}
.d-empty{text-align:center;color:#4E6885;font-size:13.5px;padding:30px 0}
.d-ft{flex:0 0 30px;display:flex;align-items:center;padding:0 14px;font-size:11.5px;color:#4E6885;
  border-top:1px solid rgba(90,150,220,.12)}
.slide-enter-active,.slide-leave-active{transition:transform .3s cubic-bezier(.22,1,.36,1),opacity .3s}
.slide-enter-from,.slide-leave-to{transform:translateX(30px);opacity:0}
.mkpi b{display:block;font-family:var(--num-font,ui-monospace);font-size:25px;color:#fff;line-height:1.1}
.mkpi span{display:block;font-size:12px;color:#6E88A6;margin-top:3px}
.map-tabs{position:absolute;z-index:6;top:70px;left:11px;display:flex;gap:3px;padding:3px;
  background:rgba(6,14,26,.86);border:1px solid rgba(84,144,214,.24)}
.map-tabs button{border:0;background:transparent;font-family:inherit;font-size:13.5px;font-weight:600;
  color:#7C93AC;padding:6px 14px;cursor:pointer;letter-spacing:.6px;border-radius:1px;transition:.2s}
.map-tabs button:hover{color:#DCE9F9}
.map-tabs button.on{background:linear-gradient(135deg,#FF3355,#B00D22);color:#fff}
.mlegend{position:absolute;z-index:5;left:12px;bottom:11px;display:flex;gap:14px;padding:6px 12px;
  background:rgba(6,14,26,.84);border:1px solid rgba(84,144,214,.18);font-size:12px;color:#8AA4C0}
.mlegend i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:middle}
.mlegend i.dia{border-radius:0;transform:rotate(45deg)}
.mlegend i.line{width:14px;height:2px;border-radius:1px;vertical-align:middle}
.mtime{position:absolute;z-index:5;right:12px;bottom:11px;padding:6px 12px;
  background:rgba(6,14,26,.84);border:1px solid rgba(84,144,214,.18);font-size:12px;color:#7E97B4}
.chart{flex:0 0 168px}

.no-fee{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px}
.nf-ic{width:46px;height:46px;border-radius:50%;border:2px solid rgba(124,143,169,.35);
  display:flex;align-items:center;justify-content:center;color:#6B7F94;font-size:25px}
.no-fee p{margin:0;font-size:15px;color:#C6D6E8}
.no-fee span{font-size:12px;color:#6E88A6;max-width:280px;text-align:center;line-height:1.6}

.fs-tip{position:absolute;z-index:30;right:16px;bottom:8px;display:inline-flex;align-items:center;
  padding:6px 14px;font-size:12.5px;font-weight:600;color:#fff;background:rgba(225,29,72,.86);
  border:1px solid rgba(255,150,175,.5);border-radius:3px;cursor:pointer;font-family:inherit;
  letter-spacing:.4px;box-shadow:0 6px 20px rgba(0,0,0,.45)}
.fs-tip:hover{background:rgba(225,29,72,1)}

.deny{width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#0B1220}
.deny-box{text-align:center;color:#DCE9F9}
.deny-box h2{font-size:20px;margin:0 0 8px}
.deny-box p{font-size:14.5px;color:#7E97B4;margin:0 0 20px}
.deny-box button{padding:8px 22px;border-radius:6px;border:1px solid rgba(255,255,255,.18);
  background:transparent;color:#DCE9F9;cursor:pointer;font-family:inherit}
</style>
