<template>
  <div class="screen-root" ref="rootRef">
    <div v-if="!allowed" class="deny">
      <div class="deny-box">
        <h2>暂无访问权限</h2>
        <p>当前账号未开通「车辆运行大屏」</p>
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
          <h1>车队运行监控中心</h1>
          <p>VEHICLE OPERATION MONITOR</p>
        </div>
        <div class="hd-r">
          <div class="chip"><i class="cy"></i>在线 {{ sum.online }} / {{ sum.total }}</div>
          <div class="chip"><i class="rd"></i>故障 —</div>
          <ScreenTabs active="fleet" />
          <button class="exit" @click="back">退出大屏</button>
        </div>
      </header>

      <div class="body">
        <!-- ===== 左栏 ===== -->
        <aside class="col">
          <section class="p" style="flex:0 0 288px">
            <div class="p-h" v-on="tip.hot(tipRate())"><i></i><b>车辆总览</b><em>FLEET OVERVIEW</em></div>
            <div class="ov">
              <div class="ring" :style="{ '--p': sum.rate }" v-on="tip.hot(tipRate())">
                <div class="rv"><b>{{ sum.rate }}%</b><span>在线率</span></div>
              </div>
              <div class="ovk">
                <div class="kv" v-on="tip.hot(tipTotal())"><b>{{ sum.total }}</b><span>车辆总数</span></div>
                <div class="kv" v-on="tip.hot(tipOnline())"><b class="cy">{{ sum.online }}</b><span>在线车辆</span></div>
                <div class="kv" v-on="tip.hot(tipStale())"><b class="dm">{{ sum.stale }}</b><span>停更 &gt;30 分钟</span></div>
              </div>
            </div>
            <div class="mini4">
              <div v-on="tip.hot(tipStatus('行驶'))"><b class="gn">{{ sum.running }}</b><span>行驶中</span></div>
              <div v-on="tip.hot(tipStatus('静止'))"><b class="am">{{ sum.idle }}</b><span>静止</span></div>
              <div v-on="tip.hot(tipStatus('离线'))"><b class="dm">{{ sum.offline }}</b><span>离线</span></div>
              <div v-on="tip.hot(tipStatus('故障'))"><b class="rd">—</b><span>故障</span></div>
            </div>
          </section>

          <section class="p" style="flex:1">
            <div class="p-h" v-on="tip.hot(tipTodayMile())"><i></i><b>今日运行</b><em>TODAY</em></div>
            <div class="big" v-on="tip.hot(tipTodayMile())">
              <span class="bn">{{ fmt(mile.total) }}</span><span class="unit">km</span>
              <span v-if="mile.loading" class="loading">轨迹计算中…</span>
            </div>
            <div class="sub">今日行驶里程 · 轨迹实算（{{ mile.counted }} 辆有数据）</div>

            <div class="spark-wrap">
              <svg v-if="trend.km.length" viewBox="0 0 340 78" preserveAspectRatio="none" class="spark">
                <defs>
                  <linearGradient id="gKmArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="#33D6FF" stop-opacity=".38"/>
                    <stop offset="1" stop-color="#33D6FF" stop-opacity="0"/>
                  </linearGradient>
                </defs>
                <path :d="trend.area" fill="url(#gKmArea)"/>
                <path :d="trend.line" fill="none" stroke="#33D6FF" stroke-width="2"/>
                <!-- 逐日热区：鼠标移上去出当天里程 / 电耗 -->
                <rect v-for="(h, i) in trend.hits" :key="'sh' + i"
                  :x="h.x - h.w / 2" y="0" :width="h.w" height="78"
                  fill="rgba(0,0,0,0)" pointer-events="all" v-on="tip.hot(tipSpark(i))"/>
              </svg>
              <div v-else class="empty-tip">近 7 日数据待同步</div>
            </div>
            <div class="axis7">
              <span v-for="d in trend.labels" :key="d">{{ d }}</span>
            </div>

            <div class="grid3">
              <div v-on="tip.hot(tipAttendance())"><b>{{ sum.total ? Math.round((sum.running + sum.idle) / sum.total * 1000) / 10 : 0 }}%</b><span>出勤率</span></div>
              <div v-on="tip.hot(tipFleetAvgSpeed())"><b>{{ avgSpeed }}</b><span>均速 km/h</span></div>
              <div v-on="tip.hot(tipPerCar())"><b>{{ perCar }}</b><span>单车均里程</span></div>
            </div>

            <div class="foot-line" v-on="tip.hot(tipDayEnergy())">
              百公里电耗
              <b class="cy">{{ day.sum && day.sum.rate ? day.sum.rate.toFixed(1) : '--' }}</b>
              <span class="tiny">kWh · {{ day.statDate ? '截至 ' + day.statDate : '东风延迟 1 天' }}</span>
            </div>
          </section>

          <section class="p" style="flex:0 0 196px">
            <div class="p-h" v-on="tip.hot(tipComposition())"><i></i><b>车辆构成</b><em>COMPOSITION</em></div>
            <div class="tiny" style="margin-bottom:8px;letter-spacing:1px">按燃料类型</div>
            <div class="rowbar" v-for="f in fuelBars" :key="f.label" v-on="tip.hot(tipFuelBar(f))">
              <span class="lb">{{ f.label }}</span>
              <span class="tk"><i :style="{ width: f.pct + '%' }" :class="{ r: f.red }"></i></span>
              <span class="vl">{{ f.value }}</span>
            </div>
            <div class="types">
              <span v-for="t in typeTags" :key="t.label" v-on="tip.hot(tipTypeTag(t))">{{ t.label }} <b>{{ t.value }}</b></span>
            </div>
          </section>
        </aside>

        <!-- ===== 中栏 ===== -->
        <main class="col mid">
          <div class="map-wrap">
            <div id="fleet-screen-map" class="map-canvas"></div>
            <div v-if="!mapReady" class="map-mask"><span>地图加载中</span></div>

            <div class="mkpi">
              <div data-kpi="running" :class="{ on: openKey === 'running' }" @click="toggleDetail('running')"
                v-on="tip.hot(tipKpi('running'))">
                <b class="gn">{{ sum.running }}</b><span>行驶中</span>
              </div>
              <div data-kpi="mileage" :class="{ on: openKey === 'mileage' }" @click="toggleDetail('mileage')"
                v-on="tip.hot(tipKpi('mileage'))">
                <b>{{ fmt(mile.total) }}</b><span>今日里程 km</span>
              </div>
              <div data-kpi="speed" :class="{ on: openKey === 'speed' }" @click="toggleDetail('speed')"
                v-on="tip.hot(tipKpi('speed'))">
                <b>{{ avgSpeed }}</b><span>平均车速 km/h</span>
              </div>
              <div data-kpi="fault" :class="{ on: openKey === 'fault' }" @click="toggleDetail('fault')"
                v-on="tip.hot(tipKpi('fault'))">
                <b class="rd">—</b><span>故障车辆</span>
              </div>
            </div>

            <!-- 明细面板 -->
            <transition name="slide">
              <div v-if="openKey" class="detail" :class="{ full: openKey === 'fault' }">
                <div class="d-hd">
                  <span class="d-bar"></span><b>{{ detail.title }}</b>
                  <span class="d-sub">{{ detail.sub }}</span>
                  <span class="d-x" @click="closeDetail">×</span>
                </div>
                <div class="d-body">
                  <div v-if="openKey === 'fault'" class="fault-todo">
                    <div class="ft-ic">!</div>
                    <p>故障码通道尚未接入</p>
                    <span>接入东风故障码 / DTC 接口后，这里会按车牌列出故障码、发生时间、持续时长，并可派单维修。</span>
                  </div>
                  <template v-else>
                    <div class="d-head">
                      <span v-for="c in detail.cols" :key="c.k" :style="colStyle(c)">{{ c.t }}</span>
                    </div>
                    <div class="d-rows">
                      <div v-for="(r, i) in detail.rows" :key="i" class="d-row">
                        <span v-for="c in detail.cols" :key="c.k" :style="colStyle(c)" :class="c.cls">{{ r[c.k] }}</span>
                      </div>
                      <div v-if="!detail.rows.length" class="d-empty">暂无数据</div>
                    </div>
                  </template>
                </div>
                <div class="d-ft">{{ detail.foot }}</div>
              </div>
            </transition>

            <div class="mlegend">
              <span><i style="background:#34D399"></i>行驶</span>
              <span><i style="background:#F59E0B"></i>静止</span>
              <span><i style="background:#6B7F94"></i>离线</span>
              <button class="mfit" title="缩放地图到全部车辆" @click="fitToMarkers()">全览</button>
            </div>
            <div class="mtime">定位更新 <b>{{ updatedAgo }}</b> · 30s 自动刷新</div>
          </div>

          <section class="p chart">
            <div class="p-h" v-on="tip.hot(tipWeek())"><i></i><b>近 7 日里程 / 电耗</b>
              <div class="lg">
                <span><i style="background:#33D6FF"></i>里程</span>
                <span><i style="background:#FF3355"></i>电耗</span>
              </div>
            </div>
            <div class="chart-box">
              <svg viewBox="0 0 1000 110" preserveAspectRatio="none">
                <g stroke="rgba(120,170,220,.10)" stroke-width="1">
                  <line x1="0" y1="30" x2="1000" y2="30"/>
                  <line x1="0" y1="60" x2="1000" y2="60"/>
                  <line x1="0" y1="90" x2="1000" y2="90"/>
                </g>
                <g v-if="chart.bars.length">
                  <rect v-for="(b, i) in chart.bars" :key="'b' + i" :x="b.x" :y="b.y"
                    :width="b.w" :height="b.h" fill="rgba(51,214,255,.62)" v-on="tip.hot(tipDayChart(i))"/>
                </g>
                <polyline v-if="chart.fuelPts" :points="chart.fuelPts" fill="none" stroke="#FF3355" stroke-width="1.8"/>
              </svg>
            </div>
            <div class="axis7" style="padding:0 20px">
              <span v-for="d in trend.labels" :key="'x' + d">{{ d }}</span>
            </div>
          </section>
        </main>

        <!-- ===== 右栏 ===== -->
        <aside class="col">
          <section class="p" style="flex:0 0 318px">
            <div class="p-h" v-on="tip.hot(tipBehavior('speed'))"><i></i><b>驾驶行为汇总</b><em>DAY SUM</em></div>
            <div class="two">
              <div v-on="tip.hot(tipBehavior('speed'))">
                <span>超速{{ behavior.ready ? '（' + behavior.date.slice(5) + '）' : '' }}</span>
                <b class="rd">{{ behavior.ready ? behavior.segments : '--' }}</b><em>段</em>
                <i v-if="behavior.ready" class="n2">{{ behavior.cars }} 辆</i>
              </div>
              <div v-on="tip.hot(tipBehavior('stay'))">
                <span>停留超时</span>
                <b class="am">{{ behavior.ready ? behavior.stayCount : '--' }}</b><em>次</em>
                <i v-if="behavior.ready" class="n2">最长 {{ behavior.stayMaxMin }}′</i>
              </div>
            </div>

            <template v-if="behavior.ready">
              <div class="bhead">
                <span>近 7 日超速段数</span>
                <em>日汇总 · 云函数 behaviorStatsSync</em>
              </div>
              <svg viewBox="0 0 384 58" preserveAspectRatio="none" class="bsvg">
                <rect v-for="(t, i) in behavior.trend" :key="i" :x="12 + i * 53" :y="52 - t.h"
                  width="30" :height="t.h"
                  :fill="i === behavior.trend.length - 1 ? '#FF3355' : 'rgba(255,51,85,.55)'"
                  v-on="tip.hot(tipBehaviorBar(t))"/>
              </svg>
              <div class="axismini">
                <span v-for="t in behavior.trend" :key="t.date">{{ t.date }}</span>
              </div>
            </template>

            <div v-else class="todo-box">
              <p>行为汇总表还没有数据</p>
              <span>已内置云函数 <b>behaviorStatsSync</b>：部署后每天 01:30 跑前一天的超速段 / 停留超时，写入 vehicle_behavior_daily，这里会自动出数。</span>
            </div>

            <div class="thr">
              阈值：超速 <b>{{ alertCfg.speed }}</b> km/h · 停留 <b>{{ alertCfg.stay }}</b> 分钟（读「提醒设置」）
            </div>
          </section>

          <section class="p" style="flex:0 0 292px">
            <div class="p-h" v-on="tip.hot(tipEnergySum())"><i></i><b>能耗 TOP5</b><em>kWh/100km</em></div>
            <div v-if="energyTop.length">
              <div class="rowbar" v-for="(e, i) in energyTop" :key="e.plate" v-on="tip.hot(tipEnergyTop(e, i))">
                <span class="lb">{{ e.plate }}</span>
                <span class="tk"><i class="r" :style="{ width: e.pct + '%' }"></i></span>
                <span class="vl">{{ e.rate }}</span>
              </div>
            </div>
            <div v-else class="empty-tip" style="flex:1">暂无能耗数据（东风延迟 1 天）</div>
            <div class="foot-line" v-if="day.sum">
              车队均值 <b class="cy">{{ day.sum.rate ? day.sum.rate.toFixed(1) : '--' }}</b>
              <span class="tiny">累计 {{ fmt(day.sum.km) }} km</span>
            </div>
          </section>

          <section class="p" style="flex:1">
            <div class="p-h" v-on="tip.hot(tipLiveSum())"><i></i><b>车辆动态</b><em>LIVE</em></div>
            <div class="feed">
              <div v-for="(f, i) in feed" :key="i" class="feed-item" v-on="tip.hot(tipFeed(f))">
                <span class="ft">{{ f.time }}</span>
                <span class="fp">{{ f.plate }}</span>
                <span class="fm">{{ f.text }}</span>
                <span class="fg" :class="f.cls">{{ f.tag }}</span>
              </div>
              <div v-if="!feed.length" class="empty-tip" style="flex:1">暂无动态</div>
            </div>
          </section>
        </aside>
      </div>

      <button v-if="scale < 0.92" class="fs-tip" @click="goFullscreen">
        当前缩放 {{ Math.round(scale * 100) }}% · 点此进入全屏（F11）
      </button>
    </div>

    <!-- 悬停数据卡（所有板块共用一张） -->
    <ScreenTip :tip="tip.tip" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, onActivated, onDeactivated, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import AMapLoader from '@amap/amap-jsapi-loader'
import ScreenTabs from '@/components/screen/ScreenTabs.vue'
import ScreenTip from '@/components/screen/ScreenTip.vue'
import { useScreenTip } from '@/utils/screenTip'
import { supabase } from '@/utils/supabase'
import {
  screenScope, loadScreenVehicles, pullRealtime, summarizeRealtime,
  pullTodayMileage, loadDayStats, latestStatDate, loadAffairSummary, loadBehaviorDaily,
} from '@/utils/screenData'
import { reverseGeocode, isLngLatText } from '@/utils/geoAddress'

const AMAP_KEY = '273f5c474604b71906674aac159b8f45'
const router = useRouter()

/* ============================================================
   权限（独立路由，不走 Dashboard 外壳，自己判）
   ============================================================ */
const scope = screenScope()
const allowed = computed(() => {
  if (scope.isAdmin || scope.isMaster) return true
  return scope.perms.includes('screen_fleet')
})

/* ============================================================
   状态
   ============================================================ */
const scale = ref(1)
const stageStyle = computed(() => ({ transform: `scale(${scale.value})` }))
const rootRef = ref(null)
const tip = useScreenTip()
const clockText = ref('')
const dateText = ref('')
const updatedAt = ref(0)
const updatedAgo = ref('--')
const linkText = ref('数据链路正常')
const openKey = ref('')
const mapReady = ref(false)

const sum = reactive({ total: 0, online: 0, running: 0, idle: 0, offline: 0, stale: 0, rate: 0 })
const mile = reactive({ total: 0, counted: 0, rows: [], loading: false })
const day = reactive({ sum: null, statDate: '' })
const trend = reactive({ labels: [], km: [], fuel: [], area: '', line: '', hits: [] })
const chart = reactive({ bars: [], fuelPts: '' })
const energyTop = ref([])
const fuelBars = ref([])
const typeTags = ref([])
const alertCfg = reactive({ speed: '--', stay: '--' })
const feed = ref([])
const behavior = reactive({ ready: false, date: '', segments: 0, cars: 0, stayCount: 0, stayMaxMin: 0, trend: [] })

/* ⭐ rtMap 是普通 Map（非响应式），所有依赖它的派生值都要靠这个版本号触发重算，
   否则「平均车速」会永远停在首次计算时的 0（就是之前截图里恒为 0 的原因）。 */
const rtTick = ref(0)
/** 车牌 → 真实地址（逆地理编码结果，用于替代东风返回的「纬度,经度」） */
const addrMap = reactive({})
const geoPending = new Set()

let vehicles = []
let rtMap = new Map()
let map = null
let AMapRef = null
let tClock = null, tRefresh = null, tMile = null, tAgo = null

/* ============================================================
   工具
   ============================================================ */
const fmt = (n) => (n == null ? '--' : Number(n).toLocaleString('zh-CN'))
const perCar = computed(() => {
  if (!mile.counted) return '--'
  return (mile.total / mile.counted).toFixed(1)
})
const avgSpeed = computed(() => {
  rtTick.value                       /* 依赖版本号，rtMap 换过才重算 */
  let s = 0, n = 0
  rtMap.forEach((rt) => {
    if (rt && rt.status === '行驶' && rt.speed > 0) { s += rt.speed; n++ }
  })
  return n ? Math.round(s / n) : 0
})

/* ============================================================
   位置文案（东风的 address 是「纬度,经度」，必须自己反查）
   ============================================================ */
/** 触发一次逆地理（同车同位置只查一次；失败可重试） */
function enrichAddr(plate, rt) {
  if (!plate || !rt || addrMap[plate] || geoPending.has(plate)) return
  if (!Number.isFinite(Number(rt.lng)) || !Number.isFinite(Number(rt.lat))) return
  geoPending.add(plate)
  reverseGeocode(rt.lng, rt.lat)
    .then((addr) => {
      if (addr) {
        addrMap[plate] = addr
        refreshInfoIfOpen(plate)
      }
    })
    .catch(() => {})
    .finally(() => geoPending.delete(plate))
}

/** 界面用：有真实地址就显示地址；还在查就提示；本来就是文字就原样用 */
function locText(plate, rt) {
  if (!rt) return '--'
  const hit = addrMap[plate]
  if (hit) return hit
  const raw = rt.locationText || ''
  if (isLngLatText(raw)) {
    enrichAddr(plate, rt)
    return geoPending.has(plate) ? '定位解析中…' : '--'
  }
  return raw || '--'
}

function fit() {
  scale.value = Math.min(window.innerWidth / 1920, window.innerHeight / 1080)
}
function back() { router.push('/dashboard') }

/** 浏览器窗口小于设计稿时整屏会被等比缩小，字号随之变小 —— 引导进全屏 */
async function goFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen()
  } catch (e) { /* 用户拒绝或浏览器不支持，忽略 */ }
}

/* ============================================================
   地图
   ============================================================ */
/* ⭐ 初始视野 = 整个中国（不是山西）：进屏先看到全国底图，车辆再一点点落上去。
   bounds 用 [西南, 东北]，纬度只到 18°N —— 南海诸岛高德自带插图，不必拉进来。 */
const MAP_HOME = {
  zoom: 4,
  center: [104.4, 35.2],
  bounds: [[73.4, 18.0], [135.1, 53.6]],
}
const markerByPlate = new Map()   // plate -> Marker（复用，30s 刷新不再清屏重画）
const addedSet = new Set()
let didChina = false              // 全国视野只铺一次：setBounds 会触发二次 complete，别死循环
let didFit = false                // 定位到齐后按车辆实际位置缩放，只做一次（之后不抢用户视野）

/** 全国视野（首屏默认，不随车辆位置自动缩放） */
function fitChina() {
  if (!map || !AMapRef) return
  try {
    map.setBounds(new AMapRef.Bounds(MAP_HOME.bounds[0], MAP_HOME.bounds[1]), false, [16, 16, 16, 16])
  } catch (e) {
    try { map.setZoomAndCenter(MAP_HOME.zoom, MAP_HOME.center) } catch (e2) { /* 忽略 */ }
  }
}

async function initMap() {
  try {
    AMapRef = await AMapLoader.load({
      key: AMAP_KEY,
      version: '2.0',
      plugins: [],
    })
    map = new AMapRef.Map('fleet-screen-map', {
      zoom: MAP_HOME.zoom,
      center: MAP_HOME.center,
      mapStyle: 'amap://styles/darkblue',
      viewMode: '2D',
      features: ['bg', 'road', 'building'],
      showLabel: true,
    })
    map.on('complete', () => {
      flushMarkers()
      /* ★ 底图就绪时有两种情况：定位已回来 → 直接按车贴合；还没回来 → 先铺全国 */
      if (markerByPlate.size && !didFit) didFit = fitToMarkers()
      else if (!didChina) { didChina = true; fitChina() }
      /* 图块刚 complete 时还会补绘一帧，留 260ms 再揭开，彻底防白闪 */
      setTimeout(() => { mapReady.value = true }, 260)
    })
    flushMarkers()
    setTimeout(() => { mapReady.value = true }, 4000)
  } catch (e) {
    console.warn('[大屏] 地图加载失败', e)
  }
}

const STATUS_COLOR = { 行驶: '#34D399', 静止: '#F59E0B', 离线: '#6B7F94' }

function markerContent(rt) {
  const c = STATUS_COLOR[rt.status] || '#6B7F94'
  return `<div class="vp-dot" style="--c:${c}"></div>`
}

/** 把 Map 里还没挂上地图的点补挂（地图没就绪时先攒着） */
function flushMarkers() {
  if (!map) return
  const pending = []
  markerByPlate.forEach((m) => { if (!addedSet.has(m)) pending.push(m) })
  if (!pending.length) return
  map.add(pending)
  pending.forEach((m) => addedSet.add(m))
}

/** 单台车落点：没有就新建，有就原位更新（省掉整屏 remove/add） */
function upsertMarker(plate, rt) {
  if (!AMapRef || !rt) return
  const lng = Number(rt.lng)
  const lat = Number(rt.lat)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
  const title = `${plate} ${Math.round(rt.speed || 0)}km/h`
  const z = rt.status === '行驶' ? 120 : 100
  let m = markerByPlate.get(plate)
  if (!m) {
    m = new AMapRef.Marker({
      position: [lng, lat],
      content: markerContent(rt),
      offset: new AMapRef.Pixel(-11, -11),
      title,
      zIndex: z,
    })
    /* 点击时再取最新一帧，避免闭包里拿到旧速度/旧状态 */
    m.on('click', () => openVehicleInfo(vehByPlate.get(plate) || { plate }, rtMap.get(plate) || rt))
    /* 悬停直接出数据卡（不用点） */
    m.on('mouseover', (e) => markerTip(plate, e))
    m.on('mouseout', () => tip.hide())
    markerByPlate.set(plate, m)
  } else {
    m.setPosition([lng, lat])
    m.setContent(markerContent(rt))
    m.setTitle(title)
    if (typeof m.setzIndex === 'function') m.setzIndex(z)
  }
  if (map && !addedSet.has(m)) { map.add(m); addedSet.add(m) }
}

/** 地图点位悬停：车牌 / 状态 / 速度 / 位置 / 上报时间 */
function markerTip(plate, e) {
  const rt = rtMap.get(plate)
  const v = vehByPlate.get(plate) || { plate }
  const oe = e && (e.originEvent || e)
  if (!rt || !oe) return
  tip.set(oe, {
    title: plate,
    sub: `${rt.status} · ${Math.round(rt.speed || 0)} km/h`,
    rows: [
      { k: '位置', v: locText(plate, rt) },
      { k: '司机', v: v.driver || '未绑定' },
      { k: '上报', v: rt.reportTime ? dayjs(rt.reportTime).format('MM-DD HH:mm') : '--' },
    ],
    foot: '点击点位可看完整车辆档案',
  })
}

/** 清理：车已不在清单 / 已无定位的点移除 */
function syncMarkers() {
  markerByPlate.forEach((m, plate) => {
    const rt = rtMap.get(plate)
    if (vehByPlate.has(plate) && rt) return
    if (map) map.remove(m)
    markerByPlate.delete(plate)
    addedSet.delete(m)
  })
  rtMap.forEach((rt, plate) => { if (rt && vehByPlate.has(plate)) upsertMarker(plate, rt) })
}

/** ★ 全览车辆：点左下角「全览」随时可手动贴合；首屏定位到齐后也会自动调一次 */
function fitToMarkers() {
  if (!map || !AMapRef) return false
  const arr = [...markerByPlate.values()]
  if (!arr.length) { fitChina(); return false }
  try {
    /* avoid=[上,右,下,左]：避开顶部 KPI 卡与底部图例；
       maxZoom 13 —— 车辆集中在一个城市时也别怼到楼栋级（「显示全的基础上尽量大」） */
    map.setFitView(arr, false, [70, 50, 70, 50], 13)
  } catch (e) {
    try { map.setFitView(arr) } catch (e2) { return false }
  }
  return true
}

let infoWin = null
let openPlate = ''

/** 车辆详情卡 HTML（地址加载完成后会用它就地重刷） */
function vehicleInfoHtml(v, rt) {
  const c = STATUS_COLOR[rt.status] || '#6B7F94'
  const plate = v.plate || ''
  const ago = rt.reportAt ? Math.max(0, Math.round((Date.now() - rt.reportAt) / 60000)) : null
  return `
    <div class="v-info">
      <div class="vi-hd">
        <span class="vi-plate">${plate || '--'}</span>
        <span class="vi-st" style="color:${c}">${rt.status || '--'}</span>
      </div>
      <div class="vi-row"><span class="vi-k">速度</span><span class="vi-v">${Math.round(rt.speed || 0)} km/h</span></div>
      <div class="vi-row"><span class="vi-k">位置</span><span class="vi-v">${locText(plate, rt)}</span></div>
      <div class="vi-row"><span class="vi-k">司机</span><span class="vi-v">${v.driver || '未绑定'}</span></div>
      <div class="vi-row"><span class="vi-k">机构</span><span class="vi-v">${v.org || '--'}</span></div>
      <div class="vi-row"><span class="vi-k">车型</span><span class="vi-v">${v.vehicle_type || '--'}${v.fuel_type ? ' · ' + v.fuel_type : ''}</span></div>
      <div class="vi-row"><span class="vi-k">上报</span><span class="vi-v">${rt.reportTime ? dayjs(rt.reportTime).format('MM-DD HH:mm:ss') : '--'}${ago != null ? '（' + ago + ' 分钟前）' : ''}</span></div>
      <div class="vi-ft"><span>VIN ${v.vin || '未配置'}</span></div>
    </div>`
}

/** 点击车辆 → 详情卡（跟着地图走，用 AMap InfoWindow） */
function openVehicleInfo(v, rt) {
  if (!AMapRef || !map || !rt) return
  openPlate = v.plate || ''
  if (!infoWin) {
    infoWin = new AMapRef.InfoWindow({
      isCustom: true,
      offset: new AMapRef.Pixel(0, -18),
      closeWhenClickMap: true,
      autoMove: true,
    })
  }
  infoWin.setContent(vehicleInfoHtml(v, rt))
  infoWin.open(map, [rt.lng, rt.lat])
  enrichAddr(openPlate, rt)      /* 经纬度 → 真实地址（查回来再刷一次内容） */
}

/** 地址查回来后，若详情卡正开着同一台车，就地刷新 */
function refreshInfoIfOpen(plate) {
  if (!infoWin || !openPlate || openPlate !== plate) return
  const rt = rtMap.get(plate)
  if (!rt) return
  let open = true
  try { open = typeof infoWin.getIsOpen === 'function' ? !!infoWin.getIsOpen() : true } catch (e) { open = true }
  if (!open) return
  infoWin.setContent(vehicleInfoHtml(vehByPlate.get(plate) || { plate }, rt))
}

/* ============================================================
   取数
   ============================================================ */
let vehByPlate = new Map()
let vehiclesAt = 0
const VEH_TTL = 5 * 60 * 1000   /* 车辆清单 5 分钟一读：30s 刷新只刷定位，少一次往返 */

/** 车辆清单（带缓存；换车/改机构才会在 5 分钟后体现） */
async function ensureVehicles() {
  if (vehicles.length && Date.now() - vehiclesAt < VEH_TTL) return vehicles
  vehicles = await loadScreenVehicles(scope)
  vehiclesAt = Date.now()
  vehByPlate = new Map(vehicles.map((v) => [v.plate, v]))
  buildComposition()
  return vehicles
}

/**
 * 实时定位
 * ⭐ 逐台返回逐台落点（onVehicle），首屏不再等整批跑完才有车出现
 * ⭐ 上一轮的定位先留着：单台失败不会让地图上的车凭空消失
 */
async function refreshRealtime() {
  const list = await ensureVehicles()
  const next = new Map(rtMap)
  await pullRealtime(list, {
    concurrency: 12,
    onVehicle: (plate, rt, v, failed) => {
      /* 请求失败（网络/超时）→ 保留上一轮，别让车在地图上闪没 */
      if (failed) return
      next.set(plate, rt || null)   /* 接口正常但无数据 → 掉离线，交给 syncMarkers 摘点 */
      if (rt) upsertMarker(plate, rt)
    },
  })
  rtMap = next
  rtTick.value++                    /* 通知 avgSpeed / 明细面板重算 */
  Object.assign(sum, summarizeRealtime(list, rtMap))
  updatedAt.value = Date.now()
  syncMarkers()
  buildFeed()
  /* ★ 定位到齐后：在「车辆全部可见」的前提下把视图放到最大（只做一次） */
  if (!didFit) didFit = fitToMarkers()
}

async function refreshMileage() {
  if (!vehicles.length) await ensureVehicles()
  if (!vehicles.length) return
  mile.loading = true
  try {
    const r = await pullTodayMileage(vehicles, rtMap)
    mile.total = r.total
    mile.counted = r.counted
    mile.rows = r.rows
  } finally {
    mile.loading = false
  }
}

async function loadDaily() {
  const end = dayjs().subtract(1, 'day').format('YYYY-MM-DD')
  const start = dayjs().subtract(7, 'day').format('YYYY-MM-DD')
  const r = await loadDayStats(scope, start, end)
  day.sum = r.sum
  day.statDate = latestStatDate(r.rows)

  /* 近 7 日：按日聚合里程 */
  const byDay = {}
  r.rows.forEach((x) => {
    const d = x.stat_date
    if (!byDay[d]) byDay[d] = { km: 0, fuel: 0 }
    byDay[d].km += Number(x.km) || 0
    byDay[d].fuel += Number(x.fuel) || 0
  })
  const days = Object.keys(byDay).sort().slice(-7)
  trend.labels = days.map((d) => d.slice(5))
  trend.km = days.map((d) => byDay[d].km)
  trend.fuel = days.map((d) => byDay[d].fuel)
  buildTrend()

  /* 能耗 TOP5 */
  const rateMap = {}
  r.rows.forEach((x) => {
    const rate = Number(x.rate)
    if (!Number.isFinite(rate) || rate <= 0) return
    if (!rateMap[x.plate] || rate > rateMap[x.plate]) rateMap[x.plate] = rate
  })
  const top = Object.entries(rateMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  const max = top.length ? top[0][1] : 1
  energyTop.value = top.map(([plate, rate]) => ({
    plate, rate: rate.toFixed(1),
    pct: Math.max(8, Math.round((rate / max) * 100)),
  }))
}

function buildTrend() {
  const km = trend.km
  if (!km.length) return
  const max = Math.max(...km, 1)
  const w = 340, h = 78, n = km.length
  const step = n > 1 ? w / (n - 1) : w
  const pts = km.map((v, i) => [i * step, h - (v / max) * (h - 12)])
  trend.line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  trend.area = `${trend.line} L${w} ${h} L0 ${h} Z`
  /* 逐日热区（悬停出数用） */
  trend.hits = km.map((v, i) => ({ x: i * step, w: Math.max(step, 8) }))

  /* 底部柱：里程；折线：电耗（各自归一化，电耗线永远贴着柱顶走，只表达趋势） */
  const barW = (1000 / Math.max(n, 1)) * 0.42
  const cxOf = (i) => (1000 / n) * i + (1000 / n) / 2
  chart.bars = km.map((v, i) => {
    const bh = (v / max) * 78
    return { x: cxOf(i) - barW / 2, y: 104 - bh, w: barW, h: bh }
  })

  const fuel = trend.fuel || []
  const fMax = Math.max(...fuel, 1)
  chart.fuelPts = fuel.length
    ? fuel.map((v, i) => `${cxOf(i).toFixed(1)},${(104 - (v / fMax) * 80).toFixed(1)}`).join(' ')
    : ''
}

function buildComposition() {
  const fuel = {}
  const type = {}
  vehicles.forEach((v) => {
    const f = v.fuel_type || '未标注'
    fuel[f] = (fuel[f] || 0) + 1
    const t = v.vehicle_type || '未标注'
    type[t] = (type[t] || 0) + 1
  })
  const fEntries = Object.entries(fuel).sort((a, b) => b[1] - a[1])
  const fMax = fEntries.length ? fEntries[0][1] : 1
  fuelBars.value = fEntries.slice(0, 3).map(([label, value], i) => ({
    label, value,
    pct: Math.max(6, Math.round((value / fMax) * 100)),
    red: i > 0,
  }))
  const tEntries = Object.entries(type).sort((a, b) => b[1] - a[1]).slice(0, 3)
  typeTags.value = tEntries.map(([label, value]) => ({ label, value }))
}

function buildFeed() {
  const list = []
  vehicles.forEach((v) => {
    const rt = rtMap.get(v.plate)
    if (!rt) {
      list.push({ time: '--', plate: v.plate, text: '无定位数据', tag: '离线', cls: 'dm', at: 0,
        status: '离线', speed: null, org: v.org || '--', color: '#6B7F94' })
      return
    }
    if (rt.status === '行驶' && rt.speed >= 80) {
      list.push({
        time: dayjs(rt.reportAt || undefined).format('HH:mm'),
        plate: v.plate, text: `行驶 ${Math.round(rt.speed)} km/h`, tag: '高速', cls: 'r', at: rt.reportAt || 0,
        status: '行驶', speed: Math.round(rt.speed), org: v.org || '--', color: '#FF7A8E',
      })
    } else if (rt.status === '离线') {
      list.push({
        time: dayjs(rt.reportAt || undefined).format('HH:mm'),
        plate: v.plate, text: '定位中断', tag: '定位', cls: 'c', at: rt.reportAt || 0,
        status: '离线', speed: 0, org: v.org || '--', color: '#6B7F94',
      })
    }
  })
  list.sort((a, b) => b.at - a.at)
  feed.value = list.slice(0, 7)
}

async function loadBehavior() {
  const r = await loadBehaviorDaily(scope, { days: 7 })
  if (!r.ready) return
  const max = Math.max(...r.trend.map((t) => t.segments), 1)
  behavior.ready = true
  behavior.date = r.date
  behavior.segments = r.segments
  behavior.cars = r.cars
  behavior.stayCount = r.stayCount
  behavior.stayMaxMin = r.stayMaxMin
  behavior.trend = r.trend.map((t) => ({
    date: t.date,
    h: Math.max(3, Math.round((t.segments / max) * 44)),
    segments: t.segments,
    stay: t.stay,
  }))
}

async function loadAlertCfg() {
  try {
    let q = supabase.from('ele_fence_alerts').select('alert_type,speed_threshold,stay_duration')
    if (scope.account) q = q.eq('owner_account', scope.account)
    const { data } = await q
    const rows = data || []
    const sp = rows.find((r) => r.alert_type === 'speeding')
    const st = rows.find((r) => r.alert_type === 'staying')
    alertCfg.speed = sp && sp.speed_threshold ? sp.speed_threshold : '未配置'
    alertCfg.stay = st && st.stay_duration ? st.stay_duration : '未配置'
  } catch (e) { /* 配置表读不到不影响 */ }
}

/* ============================================================
   悬停数据卡内容（每个板块一份口径说明 + 明细）
   ============================================================ */
const T = (k, v, c) => ({ k, v, c })
const pctOf = (n) => (sum.total ? ((n / sum.total) * 100).toFixed(1) + '%' : '--')

/** 停更车辆（>30 分钟没上报） */
const staleList = computed(() => {
  rtTick.value
  const now = Date.now()
  const out = []
  rtMap.forEach((rt, plate) => {
    if (rt && rt.reportAt && now - rt.reportAt > 30 * 60 * 1000) {
      out.push({ plate, min: Math.round((now - rt.reportAt) / 60000) })
    }
  })
  return out.sort((a, b) => b.min - a.min)
})

function platesBy(status, limit = 5) {
  rtTick.value
  const out = []
  rtMap.forEach((rt, plate) => {
    if (out.length >= limit) return
    if (rt && rt.status === status) out.push(plate)
  })
  return out
}

function tipRate() {
  return {
    title: '在线率', sub: `${sum.online} / ${sum.total}`,
    rows: [
      T('在线车辆', `${sum.online} 辆`, '#33D6FF'),
      T('离线车辆', `${sum.offline} 辆`, '#6B7F94'),
      T('停更 >30 分钟', `${sum.stale} 辆`, '#FF4D66'),
    ],
    foot: '口径：ACC 开且 30 分钟内有定位上报算在线',
  }
}

function tipTotal() {
  return {
    title: '车辆总数', sub: '本账号可见',
    rows: [
      T('台账车辆', `${sum.total} 辆`),
      T('已配 VIN', `${sum.total - (sum.noVin || 0)} 辆`, '#2BE08A'),
      T('无 VIN', `${sum.noVin || 0} 辆`, '#FF4D66'),
    ],
    foot: '范围＝客户 + 二级机构过滤后的车辆台账',
  }
}

function tipOnline() {
  return {
    title: '在线车辆', sub: `占比 ${pctOf(sum.online)}`,
    rows: [
      T('行驶中', `${sum.running} 辆`, '#34D399'),
      T('静止（ACC 开）', `${sum.idle} 辆`, '#F59E0B'),
      T('停更 >30 分钟', `${sum.stale} 辆`, '#FF4D66'),
    ],
    foot: '离线车不计入在线，但仍在总数里',
  }
}

function tipStale() {
  const list = staleList.value.slice(0, 5)
  return {
    title: '停更车辆', sub: `共 ${staleList.value.length} 辆`,
    rows: list.length
      ? list.map((x) => T(x.plate, `${x.min >= 60 ? (x.min / 60).toFixed(1) + ' 小时' : x.min + ' 分钟'}`, '#FF4D66'))
      : [T('暂无', '全部在线')],
    foot: '定位超过 30 分钟没更新 → 标记停更，ETA 不给数',
  }
}

function tipStatus(st) {
  const map = {
    行驶: { n: sum.running, c: '#34D399', desc: 'ACC 开且速度 > 0' },
    静止: { n: sum.idle, c: '#F59E0B', desc: 'ACC 开但速度为 0' },
    离线: { n: sum.offline, c: '#6B7F94', desc: 'ACC 关或超 30 分钟无上报' },
  }
  if (st === '故障') {
    return {
      title: '故障车辆', sub: '通道未接入',
      rows: [T('状态', '待接入', '#FF4D66'), T('数据源', '东风 DTC 故障码')],
      foot: '接入后按车牌列出故障码 / 发生时间 / 持续时长',
    }
  }
  const m = map[st] || { n: 0, c: '#8AA4C0', desc: '' }
  const plates = st === '离线' ? [] : platesBy(st)
  return {
    title: st, sub: `${m.n} 辆 · ${pctOf(m.n)}`,
    rows: [
      T('车辆数', `${m.n} 辆`, m.c),
      ...plates.map((p) => T(p, '在途')),
    ],
    foot: m.desc,
  }
}

function tipTodayMile() {
  return {
    title: '今日行驶里程', sub: '轨迹实算',
    rows: [
      T('合计', `${fmt(mile.total)} km`, '#33D6FF'),
      T('有数据车辆', `${mile.counted} / ${vehicles.length} 辆`),
      T('单车均里程', perCar.value + ' km'),
    ],
    foot: '口径：当天轨迹里程表最大值 − 最小值（东风延迟 1 天，故今日自己算）',
  }
}

function tipSpark(i) {
  const km = trend.km[i]
  const fuel = trend.fuel[i]
  return {
    title: `${trend.labels[i] || '--'} 里程`,
    rows: [
      T('里程', `${fmt(Math.round(km || 0))} km`, '#33D6FF'),
      T('电耗', `${fmt(Math.round(fuel || 0))} kWh`, '#FF7A8E'),
      T('百公里', km ? ((fuel / km) * 100).toFixed(1) + ' kWh' : '--'),
    ],
    foot: '近 7 日 · 全天合计（仅在线运营车辆）',
  }
}

function tipAttendance() {
  const n = sum.running + sum.idle
  return {
    title: '出勤率', sub: pctOf(n),
    rows: [
      T('出勤车辆', `${n} 辆`, '#2BE08A'),
      T('行驶 + 静止', `合计 ${n} 辆`),
      T('分母', `车辆总数 ${sum.total} 辆`),
    ],
    foot: '出勤率 =（行驶中 + 静止）/ 车辆总数',
  }
}

function tipFleetAvgSpeed() {
  return {
    title: '平均车速', sub: '在途车辆',
    rows: [
      T('行驶中车辆', `${sum.running} 辆`, '#34D399'),
      T('均速', `${avgSpeed.value} km/h`, '#33D6FF'),
    ],
    foot: '只统计「行驶中」车辆，静止 / 离线不计入',
  }
}

function tipPerCar() {
  return {
    title: '单车均里程',
    rows: [
      T('今日里程', `${fmt(mile.total)} km`),
      T('有数据车辆', `${mile.counted} 辆`),
      T('单车均', `${perCar.value} km`, '#2BE08A'),
    ],
    foot: '分母只算有轨迹数据的车，不拿全车队摊',
  }
}

function tipDayEnergy() {
  return {
    title: '百公里电耗', sub: day.statDate ? `截至 ${day.statDate}` : '东风延迟 1 天',
    rows: [
      T('车队均值', day.sum && day.sum.rate ? day.sum.rate.toFixed(1) + ' kWh' : '--', '#33D6FF'),
      T('统计里程', day.sum ? `${fmt(Math.round(day.sum.km))} km` : '--'),
      T('统计电耗', day.sum ? `${fmt(Math.round(day.sum.fuel))} kWh` : '--'),
    ],
    foot: '数据源：东风 tripAnalysisOil（当天 / 昨天恒无数据）',
  }
}

function tipFuelBar(f) {
  const total = fuelBars.value.reduce((s, x) => s + x.value, 0) || 1
  return {
    title: `燃料类型 · ${f.label}`,
    rows: [
      T('车辆数', `${f.value} 辆`, '#33D6FF'),
      T('占已标注', ((f.value / total) * 100).toFixed(1) + '%'),
      T('车队占比', pctOf(f.value)),
    ],
    foot: '只列前 3 类，未标注单独统计',
  }
}

function tipTypeTag(t) {
  return {
    title: `车型 · ${t.label}`,
    rows: [
      T('车辆数', `${t.value} 辆`, '#EAF4FF'),
      T('车队占比', pctOf(t.value)),
    ],
    foot: '取自车辆档案的「车型」字段',
  }
}

function tipKpi(k) {
  if (k === 'running') {
    return {
      title: '行驶中', sub: `${sum.running} 辆`,
      rows: [T('均速', `${avgSpeed.value} km/h`, '#2BE08A'), T('占比', pctOf(sum.running))],
      foot: '点击查看行驶中车辆明细（速度 / 位置 / 上报时间）',
    }
  }
  if (k === 'mileage') {
    return {
      title: '今日里程', sub: `${fmt(mile.total)} km`,
      rows: [T('有数据车辆', `${mile.counted} 辆`), T('单车均', `${perCar.value} km`, '#33D6FF')],
      foot: '点击查看逐车今日里程',
    }
  }
  if (k === 'speed') {
    return {
      title: '平均车速', sub: `${avgSpeed.value} km/h`,
      rows: [T('行驶中车辆', `${sum.running} 辆`), T('区间', '0–20 / 20–40 / 40–60 / 60–80 / 80+')],
      foot: '点击查看车速分布',
    }
  }
  return {
    title: '故障车辆', sub: '未接入',
    rows: [T('状态', '待接入', '#FF4D66')],
    foot: '东风 DTC 故障码通道接好后在这里出数',
  }
}

function tipDayChart(i) {
  const km = trend.km[i] || 0
  const fuel = trend.fuel[i] || 0
  return {
    title: trend.labels[i] || '--',
    rows: [
      T('里程', `${fmt(Math.round(km))} km`, '#33D6FF'),
      T('电耗', `${fmt(Math.round(fuel))} kWh`, '#FF3355'),
      T('百公里', km ? ((fuel / km) * 100).toFixed(1) + ' kWh' : '--'),
    ],
    foot: day.statDate && trend.labels[i] === day.statDate.slice(5) ? '最近有数据的一天' : '近 7 日逐日汇总',
  }
}

function tipBehavior(kind) {
  if (kind === 'speed') {
    return {
      title: '超速段数', sub: behavior.date ? `截至 ${behavior.date}` : '',
      rows: [
        T('超速段', `${behavior.segments} 段`, '#FF3355'),
        T('涉及车辆', `${behavior.cars} 辆`),
        T('阈值', `>${alertCfg.speed} km/h`),
      ],
      foot: '连续超阈值的轨迹点合并为一段；阈值读「提醒设置」',
    }
  }
  return {
    title: '停留超时', sub: behavior.date ? `截至 ${behavior.date}` : '',
    rows: [
      T('超时次数', `${behavior.stayCount} 次`, '#FFB020'),
      T('最长停留', `${behavior.stayMaxMin} 分钟`),
      T('阈值', `≥${alertCfg.stay} 分钟`),
    ],
    foot: '静止且在半径内的一簇算一次停留',
  }
}

function tipBehaviorBar(t) {
  return {
    title: `${t.date} 超速`,
    rows: [
      T('超速段', `${t.segments || 0} 段`, '#FF3355'),
      T('停留超时', `${t.stay || 0} 次`, '#FFB020'),
    ],
    foot: '每日汇总（云函数 behaviorStatsSync 01:30 跑前一天）',
  }
}

function tipEnergyTop(e, i) {
  return {
    title: e.plate, sub: `第 ${i + 1} 名`,
    rows: [
      T('百公里电耗', `${e.rate} kWh`, '#FF3355'),
      T('相对最高', `${e.pct}%`),
      T('车队均值', day.sum && day.sum.rate ? day.sum.rate.toFixed(1) : '--'),
    ],
    foot: '取最近有数据的一天，逐车最高值',
  }
}

function tipFeed(f) {
  return {
    title: f.plate, sub: f.tag,
    rows: [
      T('时间', f.time),
      T('状态', f.status || '--', f.color || '#8AA4C0'),
      T('速度', f.speed != null ? `${f.speed} km/h` : '--'),
      T('机构', f.org || '--'),
    ],
    foot: '车辆动态取本轮定位最新 7 条',
  }
}

/* ---------- 面板标题栏汇总 ---------- */
function tipComposition() {
  return {
    title: '车辆构成', sub: `${vehicles.length} 辆`,
    rows: fuelBars.value.map((f) => T(f.label, `${f.value} 辆`, f.red ? '#FF3355' : '#33D6FF')),
    foot: '按车辆档案的燃料类型 / 车型统计',
  }
}

function tipWeek() {
  const km = trend.km.reduce((s, x) => s + (Number(x) || 0), 0)
  const fuel = trend.fuel.reduce((s, x) => s + (Number(x) || 0), 0)
  return {
    title: '近 7 日里程 / 电耗', sub: `${trend.labels.length} 天`,
    rows: [
      T('累计里程', `${fmt(Math.round(km))} km`, '#33D6FF'),
      T('累计电耗', `${fmt(Math.round(fuel))} kWh`, '#FF3355'),
      T('百公里', km ? ((fuel / km) * 100).toFixed(1) + ' kWh' : '--'),
      T('单车日均', vehicles.length && trend.labels.length
        ? `${(km / vehicles.length / trend.labels.length).toFixed(1)} km` : '--'),
    ],
    foot: '悬停柱子看单日明细',
  }
}

function tipEnergySum() {
  if (!energyTop.value.length) return { title: '能耗 TOP5', rows: [T('状态', '暂无数据')], foot: '东风能耗有 1 天延迟' }
  return {
    title: '能耗 TOP5', sub: 'kWh/100km',
    rows: [
      T('最高', `${energyTop.value[0].plate} ${energyTop.value[0].rate}`, '#FF3355'),
      T('车队均值', day.sum && day.sum.rate ? day.sum.rate.toFixed(1) : '--', '#33D6FF'),
      T('统计里程', day.sum ? `${fmt(Math.round(day.sum.km))} km` : '--'),
    ],
    foot: '悬停每行看该车明细',
  }
}

function tipLiveSum() {
  return {
    title: '车辆动态', sub: `${feed.value.length} 条`,
    rows: [
      T('行驶中（≥80）', `${feed.value.filter((f) => f.tag === '高速').length} 条`, '#FF7A8E'),
      T('定位中断', `${feed.value.filter((f) => f.tag === '定位').length} 条`, '#6FE0FF'),
      T('在线 / 总数', `${sum.online} / ${sum.total}`),
    ],
    foot: '只挑「高速行驶」与「定位中断」两类异常动态',
  }
}

/* ============================================================
   明细面板
   ============================================================ */
const detail = computed(() => {
  rtTick.value                     /* 面板开着时也要跟着 30s 刷新重算 */
  if (openKey.value === 'running') {
    const rows = vehicles
      .map((v) => ({ v, rt: rtMap.get(v.plate) }))
      .filter((x) => x.rt && x.rt.status === '行驶')
      .sort((a, b) => (b.rt.speed || 0) - (a.rt.speed || 0))
      .map((x) => ({
        plate: x.v.plate,
        speed: Math.round(x.rt.speed || 0),
        loc: locText(x.v.plate, x.rt),
        time: x.rt.reportTime ? dayjs(x.rt.reportTime).format('HH:mm') : '--',
      }))
    return {
      title: '行驶中车辆', sub: `共 ${rows.length} 辆 · 均速 ${avgSpeed.value} km/h`,
      cols: [
        { k: 'plate', t: '车牌', w: '104px', cls: 'num' },
        { k: 'speed', t: '速度 km/h', w: '80px', cls: 'num gn2' },
        { k: 'loc', t: '所在位置', w: '1fr', cls: 'clip' },
        { k: 'time', t: '上报', w: '56px', cls: 'num' },
      ],
      rows,
      foot: '按实时定位速度降序 · 30s 刷新',
    }
  }
  if (openKey.value === 'mileage') {
    const rows = mile.rows.map((r) => ({
      plate: r.plate,
      km: r.km.toFixed(1),
      org: r.org || '--',
    }))
    return {
      title: '今日里程明细',
      sub: `合计 ${fmt(mile.total)} km · ${mile.counted} 辆有数据`,
      cols: [
        { k: 'plate', t: '车牌', w: '110px', cls: 'num' },
        { k: 'km', t: '今日里程 km', w: '100px', cls: 'num' },
        { k: 'org', t: '所属机构', w: '1fr', cls: 'clip' },
      ],
      rows,
      foot: '今日里程 = 当天轨迹里程表差值（max−min）· 5 分钟缓存',
    }
  }
  if (openKey.value === 'speed') {
    const segs = [
      { label: '0–20', min: 0, max: 20, color: 'rgba(107,127,148,.75)' },
      { label: '20–40', min: 20, max: 40, color: 'rgba(51,214,255,.6)' },
      { label: '40–60', min: 40, max: 60, color: '#33D6FF' },
      { label: '60–80', min: 60, max: 80, color: '#FFB020' },
      { label: '80+', min: 80, max: 999, color: '#FF3355' },
    ]
    const running = []
    rtMap.forEach((rt, plate) => { if (rt && rt.status === '行驶') running.push({ plate, ...rt }) })
    running.sort((a, b) => b.speed - a.speed)
    const rows = running.map((r) => ({
      plate: r.plate,
      speed: Math.round(r.speed),
      seg: (segs.find((s) => r.speed >= s.min && r.speed < s.max) || segs[0]).label,
      loc: locText(r.plate, r),
    }))
    return {
      title: '在途车速分布', sub: `${rows.length} 辆在途 · 均速 ${avgSpeed.value} km/h`,
      segs,
      cols: [
        { k: 'plate', t: '车牌', w: '104px', cls: 'num' },
        { k: 'speed', t: '当前速度 km/h', w: '110px', cls: 'num' },
        { k: 'seg', t: '区间', w: '64px', cls: '' },
        { k: 'loc', t: '所在位置', w: '1fr', cls: 'clip' },
      ],
      rows,
      foot: '仅统计行驶中车辆 · 静止/离线不计入',
    }
  }
  return { title: '故障车辆', sub: '', cols: [], rows: [], foot: '' }
})

function colStyle(c) {
  if (!c || c.w === '1fr') return { flex: '1 1 0', minWidth: 0 }
  return { width: c.w, flex: '0 0 auto' }
}

function toggleDetail(k) {
  openKey.value = openKey.value === k ? '' : k
  if (!openKey.value) return
  /* 面板一打开就把在途车的地址批量反查（命中缓存的不重复请求，上限 40 台防限流） */
  let n = 0
  rtMap.forEach((rt, plate) => {
    if (n >= 40) return
    if (rt && rt.status === '行驶') { n++; enrichAddr(plate, rt) }
  })
}
function closeDetail() { openKey.value = '' }

/* ============================================================
   生命周期
   ============================================================ */
function startTimers() {
  if (tClock) return
  tickClock()
  tClock = setInterval(tickClock, 1000)
  tAgo = setInterval(tickClock, 5000)
  tRefresh = setInterval(() => { refreshRealtime() }, 30000)
  tMile = setInterval(refreshMileage, 5 * 60 * 1000)
}

function stopTimers() {
  clearInterval(tClock); clearInterval(tRefresh); clearInterval(tMile); clearInterval(tAgo)
  tClock = tRefresh = tMile = tAgo = null
}

function tickClock() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  clockText.value = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  dateText.value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${wd}`
  if (updatedAt.value) {
    const s = Math.floor((Date.now() - updatedAt.value) / 1000)
    updatedAgo.value = s < 60 ? `${s}s 前` : `${Math.floor(s / 60)}m 前`
  }
}

onMounted(async () => {
  if (!allowed.value) return
  tip.bind(rootRef.value)
  fit()
  window.addEventListener('resize', fit)

  /* ⭐ 四个面板互不依赖，一起发出去，别再串行等 */
  loadAlertCfg()
  loadBehavior()
  loadDaily()

  /* ⭐ 地图与取数并行：地图在加载底图时定位已经在路上 */
  initMap()                    /* complete 时：无车先铺全国，有车直接贴合 */
  await ensureVehicles()
  refreshRealtime()            /* 不 await：逐台落点，不用等整批 */
  refreshMileage()             /* 今日里程与定位并行 */

  startTimers()
})

/* keep-alive：切走时暂停轮询，切回来先 resize 再补一次数据（地图实例不销毁） */
onActivated(async () => {
  if (!map) return                       /* 首次挂载由 onMounted 负责 */
  await nextTick()                       /* 等 DOM 挂回文档再量尺寸 */
  try { map.resize() } catch (e) { /* 忽略 */ }
  startTimers()
  if (Date.now() - updatedAt.value > 20000) refreshRealtime()
})

onDeactivated(() => { stopTimers() })

onBeforeUnmount(() => {
  window.removeEventListener('resize', fit)
  stopTimers()
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

/* header */
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

/* layout */
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

/* 总览 */
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

/* 今日运行 */
.big{display:flex;align-items:baseline;gap:5px}
.bn{font-family:var(--num-font,ui-monospace);font-size:42px;font-weight:700;color:#fff;line-height:1;letter-spacing:-1px}
.unit{font-size:13.5px;color:#6E88A6}
.loading{font-size:12px;color:#4E6885;margin-left:6px}
.sub{font-size:12px;color:#6E88A6;margin-top:6px}
.spark-wrap{min-height:78px;display:flex;align-items:center;margin-top:8px}
.spark{width:100%;height:78px}
.empty-tip{font-size:12px;color:#4E6885;text-align:center;padding:16px 0;flex:1;
  display:flex;align-items:center;justify-content:center}
.axis7{display:flex;justify-content:space-between;font-size:11.5px;color:#5E7895;
  font-family:var(--num-font,ui-monospace);padding:0 2px}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;margin-top:auto;
  background:rgba(90,150,220,.14);border:1px solid rgba(90,150,220,.14)}
.grid3>div{background:rgba(8,17,30,.9);padding:9px 6px;text-align:center}
.grid3 b{display:block;font-family:var(--num-font,ui-monospace);font-size:19px;color:#EAF4FF}
.grid3 span{display:block;font-size:11.5px;color:#6E88A6;margin-top:4px}
.foot-line{margin-top:11px;padding-top:9px;border-top:1px dashed rgba(90,150,220,.18);
  font-size:12px;color:#7089A6;display:flex;align-items:center;gap:8px}
.foot-line b{font-family:var(--num-font,ui-monospace);font-size:16.5px}
.tiny{font-size:11.5px;color:#4E6885;letter-spacing:.3px}

/* 构成 */
.rowbar{display:grid;grid-template-columns:78px 1fr 54px;align-items:center;gap:9px;margin-bottom:8px}
.rowbar .lb{font-size:13.5px;color:#9DB4CC;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rowbar .tk{position:relative;height:9px;background:rgba(255,255,255,.05)}
.rowbar .tk i{position:absolute;left:0;top:0;bottom:0;min-width:4px;
  background:linear-gradient(90deg,rgba(51,214,255,.35),#33D6FF)}
.rowbar .tk i.r{background:linear-gradient(90deg,rgba(255,45,75,.3),#FF3355)}
.rowbar .vl{text-align:right;font-family:var(--num-font,ui-monospace);font-size:13.5px;color:#C8DAEE}
.types{display:flex;gap:14px;font-size:13.5px;color:#9DB4CC;padding-top:7px;
  border-top:1px dashed rgba(90,150,220,.18);margin-top:auto}
.types b{font-family:var(--num-font,ui-monospace);color:#EAF4FF}

/* 地图 */
.mid{gap:12px}
.map-wrap{position:relative;flex:1;min-height:0;border:1px solid rgba(51,214,255,.28);overflow:hidden}
.map-canvas{position:absolute;inset:0;background:#04070F}
.map-mask{position:absolute;inset:0;z-index:3;background:#04070F;display:flex;
  align-items:center;justify-content:center;color:#4E6885;font-size:13.5px;letter-spacing:2px}
.mkpi{position:absolute;z-index:5;top:11px;left:11px;right:11px;display:flex;gap:9px}
.mkpi>div{position:relative;flex:1;padding:7px 12px;background:rgba(6,14,26,.82);
  border:1px solid rgba(84,144,214,.22);cursor:pointer;transition:.2s}
.mkpi>div::after{content:'详情';position:absolute;right:9px;top:7px;font-size:11px;color:#3F5773}
.mkpi>div:hover{border-color:rgba(255,45,75,.5);background:rgba(24,34,54,.9)}
.mkpi>div.on{border-color:rgba(255,45,75,.75);background:rgba(40,18,26,.9)}
.mkpi>div.on::after{content:'展开中';color:#FF3355}
.mkpi b{display:block;font-family:var(--num-font,ui-monospace);font-size:25px;color:#fff;line-height:1.1}
.mkpi span{display:block;font-size:12px;color:#6E88A6;margin-top:3px}
.mlegend{position:absolute;z-index:5;left:12px;bottom:11px;display:flex;gap:14px;padding:6px 12px;
  background:rgba(6,14,26,.82);border:1px solid rgba(84,144,214,.18);font-size:12px;color:#8AA4C0}
.mlegend i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:middle}
.mfit{margin-left:6px;padding:2px 9px;font-size:11.5px;font-family:inherit;color:#8AA4C0;cursor:pointer;
  background:rgba(51,214,255,.08);border:1px solid rgba(84,144,214,.28);border-radius:2px;
  transition:.18s;line-height:1.5}
.mfit:hover{color:#fff;background:rgba(51,214,255,.18);border-color:rgba(51,214,255,.55)}
.mtime{position:absolute;z-index:5;right:12px;bottom:11px;padding:6px 12px;
  background:rgba(6,14,26,.82);border:1px solid rgba(84,144,214,.18);font-size:12px;color:#7E97B4}
.mtime b{color:#33D6FF}

/* 明细 */
.detail{position:absolute;z-index:6;top:72px;right:0;bottom:0;width:624px;display:flex;
  flex-direction:column;background:linear-gradient(160deg,rgba(9,18,32,.97),rgba(5,10,18,.97));
  border-left:1px solid rgba(255,45,75,.38);box-shadow:-28px 0 64px rgba(0,0,0,.6)}
.detail.full{top:0;width:100%;border-left:none}
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
.d-row .gn2{color:#2BE08A}
.d-row .clip{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#8AA4C0}
.d-empty{text-align:center;color:#4E6885;font-size:13.5px;padding:30px 0}
.d-ft{flex:0 0 30px;display:flex;align-items:center;padding:0 14px;font-size:11.5px;color:#4E6885;
  border-top:1px solid rgba(90,150,220,.12)}
.fault-todo{display:flex;flex-direction:column;align-items:center;gap:12px;padding:60px 60px}
.ft-ic{width:52px;height:52px;border-radius:50%;border:2px solid rgba(255,51,85,.5);
  display:flex;align-items:center;justify-content:center;font-size:26px;color:#FF3355}
.fault-todo p{margin:0;font-size:16.5px;color:#EAF4FF}
.fault-todo span{font-size:13.5px;color:#7E97B4;line-height:1.7;text-align:center;max-width:520px}

/* 趋势 */
.chart{flex:0 0 168px}
.lg{display:flex;gap:14px;font-size:11.5px;color:#7E97B4;margin-left:auto}
.lg i{display:inline-block;width:14px;height:3px;margin-right:5px;vertical-align:middle}
.chart-box{flex:1;min-height:0;position:relative}
.chart-box svg{position:absolute;inset:0;width:100%;height:100%}

/* 右栏 */
.two{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:rgba(90,150,220,.14);
  border:1px solid rgba(90,150,220,.14)}
.two>div{background:rgba(8,17,30,.9);padding:11px 12px;display:flex;align-items:baseline;gap:5px;flex-wrap:wrap}
.two span{font-size:12px;color:#6E88A6;width:100%}
.two b{font-family:var(--num-font,ui-monospace);font-size:28px;line-height:1}
.two em{font-style:normal;font-size:12px;color:#8A6B75}
.todo-box{margin-top:12px;padding:11px 12px;background:rgba(90,150,220,.05);
  border-left:2px dashed rgba(124,143,169,.4)}
.todo-box p{margin:0 0 6px;font-size:13.5px;color:#C6D6E8}
.todo-box span{font-size:12px;color:#7E97B4;line-height:1.65;display:block}
.two .n2{font-style:normal;font-size:11.5px;color:#8AA4C0;margin-left:auto}
.bhead{display:flex;align-items:center;margin:12px 0 6px;font-size:11.5px;color:#5E7895;letter-spacing:1px}
.bhead em{font-style:normal;margin-left:auto;font-size:11px;color:#3F5773;letter-spacing:0}
.bsvg{width:100%;height:56px;display:block}
.axismini{display:flex;justify-content:space-between;font-size:11px;color:#5E7895;
  font-family:var(--num-font,ui-monospace);padding:0 4px}
.thr{margin-top:auto;padding-top:9px;border-top:1px dashed rgba(90,150,220,.18);
  font-size:11.5px;color:#4E6885}
.thr b{color:#8AA4C0;font-family:var(--num-font,ui-monospace)}

/* 动态 */
.feed{flex:1;min-height:0;display:flex;flex-direction:column;gap:6px;overflow:hidden}
.feed-item{display:flex;align-items:center;gap:9px;padding:6px 9px;font-size:13.5px;
  background:rgba(255,255,255,.022);border-left:2px solid rgba(51,214,255,.45)}
.feed-item .ft{font-family:var(--num-font,ui-monospace);font-size:12px;color:#5E7895;width:40px}
.feed-item .fp{font-family:var(--num-font,ui-monospace);font-size:13.5px;color:#EAF4FF;width:80px}
.feed-item .fm{flex:1;color:#B7CBE0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.feed-item .fg{font-size:11.5px;padding:1px 6px;border:1px solid currentColor;color:#6FE0FF}
.fg.r{color:#FF7A8E}.fg.c{color:#6FE0FF}.fg.dm{color:#6B7F94}

/* 过渡 */
.slide-enter-active,.slide-leave-active{transition:transform .3s cubic-bezier(.22,1,.36,1),opacity .3s}
.slide-enter-from,.slide-leave-to{transform:translateX(30px);opacity:0}

/* 小窗全屏提示 */
.fs-tip{position:absolute;z-index:30;right:16px;bottom:8px;display:inline-flex;align-items:center;
  padding:6px 14px;font-size:12.5px;font-weight:600;color:#fff;background:rgba(225,29,72,.86);
  border:1px solid rgba(255,150,175,.5);border-radius:3px;cursor:pointer;font-family:inherit;
  letter-spacing:.4px;box-shadow:0 6px 20px rgba(0,0,0,.45)}
.fs-tip:hover{background:rgba(225,29,72,1)}

/* 无权限 */
.deny{width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#0B1220}
.deny-box{text-align:center;color:#DCE9F9;font-family:'PingFang SC',sans-serif}
.deny-box h2{font-size:20px;margin:0 0 8px}
.deny-box p{font-size:14.5px;color:#7E97B4;margin:0 0 20px}
.deny-box button{padding:8px 22px;border-radius:6px;border:1px solid rgba(255,255,255,.18);
  background:transparent;color:#DCE9F9;cursor:pointer;font-family:inherit}
</style>
