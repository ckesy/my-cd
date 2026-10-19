<template>
  <div class="energy-report-detail-page">
    <div class="wrap">
      <!-- ================= 顶栏 ================= -->
      <div class="top">
        <div class="brand">
          <div class="logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"
              stroke-linejoin="round">
              <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z" />
            </svg>
          </div>
          <div class="brand-txt">
            <h1>{{ task.task_name || '车队分析报告' }}<span class="h1-sub"> · {{ task.task_type || '车队分析报告' }}</span></h1>
            <p>
              {{ task.fuel_type || '--' }} ·
              {{ periodText }} · 共 {{ s.days || 0 }} 天<template v-if="report"> · {{ s.carCount }} 台车</template>
            </p>
          </div>
        </div>

        <div class="pills">
          <span class="pill ghost" @click="goBack">← 返回列表</span>
          <span class="pill">在册车辆 <b>{{ s.carCount || '--' }} 台</b></span>
          <span class="pill">数据源 <b>{{ sourceName }}</b></span>
          <span class="pill go" :class="{ disabled: !report }" @click="exportCars">导出报告</span>
        </div>
      </div>

      <!-- ================= 加载 / 空状态 ================= -->
      <div v-if="loading" class="card state">
        <div class="spinner"></div>
        报告加载中…
      </div>

      <div v-else-if="!report" class="card state empty">
        <h3>这条任务还没有报告数据</h3>
        <p>报告数据由取数接口在「提交」后写入；当前接口尚未接入，只有内置演示数据的车队分析报告能打开。</p>
        <p class="hint">任务编号 {{ task.task_no }} · {{ task.task_type }} · {{ task.task_status }}</p>
        <span class="pill go" @click="goBack">返回任务列表</span>
      </div>

      <!-- ================= 正文 ================= -->
      <template v-else>
        <!-- ---------- 01 统计数据 ---------- -->
        <div class="sec-hd">
          <span class="no">01</span>
          <h2>统计数据</h2>
          <span class="sub">本期全量指标，从报告原文直接取</span>
          <span class="rule"></span>
        </div>

        <div class="card">
          <div class="strip">
            <div class="m">
              <div class="lab">在册车辆</div>
              <div class="v">{{ s.carCount }}<small>台</small></div>
              <div class="n">活跃 {{ s.activeCars }} 台</div>
            </div>
            <div class="m">
              <div class="lab">时间段总里程</div>
              <div class="v">{{ fmt(s.mileage) }}<small>km</small></div>
              <div class="n">{{ s.carCount }} 台车合计</div>
            </div>
            <div class="m">
              <div class="lab">时间段总电耗</div>
              <div class="v">{{ s.totalFuel }}<small>MWh</small></div>
              <div class="n">行程 {{ s.travelFuel }} + 怠速 {{ s.idleFuel }}</div>
            </div>
            <div class="m">
              <div class="lab">百公里行程电耗</div>
              <div class="v">{{ s.kilOil }}<small>kWh</small></div>
              <div class="n">每 100km 用电量</div>
            </div>
            <div class="m">
              <div class="lab">车队出勤率</div>
              <div class="v">{{ pct(s.attendancePer) }}<small>%</small></div>
              <div class="n">{{ s.activeCars }}/{{ s.carCount }} 台出勤 ≥80%</div>
            </div>
          </div>

          <div class="databody">
            <div class="col">
              <div class="grp"><i></i>车队档案</div>
              <div class="kv"><span class="k">车队名称</span><span class="v">{{ task.task_name || '--' }}</span></div>
              <div class="kv"><span class="k">日期</span><span class="v">{{ periodText }}</span></div>
              <div class="kv"><span class="k">车辆数</span><span class="v">{{ s.carCount }}<em>台</em></span></div>
              <div class="kv"><span class="k">燃料类型</span><span class="v">{{ task.fuel_type || '--' }}</span></div>
              <div class="kv"><span class="k">统计天数</span><span class="v">{{ s.days }}<em>天</em></span></div>
              <div class="kv"><span class="k">平均环境温度</span><span class="v nil">—</span></div>
            </div>

            <div class="col">
              <div class="grp"><i></i>行驶统计</div>
              <div class="kv"><span class="k">时间段总里程</span><span class="v">{{ fmt(s.mileage) }}<em>km</em></span></div>
              <div class="kv"><span class="k">日均里程</span><span class="v">{{ fmt(s.dailyMileage) }}<em>km/天</em></span></div>
              <div class="kv"><span class="k">单车日均里程</span><span class="v">{{ fmt(perCarDaily) }}<em>km/天</em></span></div>
              <div class="kv"><span class="k">驾驶平均速度</span><span class="v">{{ s.avgSpeed }}<em>km/h</em></span></div>
              <div class="kv"><span class="k">活跃车辆</span><span class="v">{{ s.activeCars }}<em>台</em></span></div>
              <div class="kv"><span class="k">单台月均里程</span><span class="v">{{ fmt(perCarMileage) }}<em>km</em></span></div>
            </div>

            <div class="col">
              <div class="grp"><i></i>能耗统计</div>
              <div class="kv"><span class="k">时间段总电耗</span><span class="v">{{ s.totalFuel }}<em>MWh</em></span></div>
              <div class="kv"><span class="k">时间段行程电耗</span><span class="v">{{ s.travelFuel }}<em>MWh</em></span></div>
              <div class="kv"><span class="k">怠速电耗</span><span class="v">{{ s.idleFuel }}<em>MWh</em></span></div>
              <div class="kv"><span class="k">百公里行程电耗</span><span class="v">{{ s.kilOil }}<em>kWh/100km</em></span></div>
              <div class="kv"><span class="k">动能回收能量</span><span class="v">{{ s.regenEnergy }}<em>MWh</em></span></div>
              <div class="kv"><span class="k">制动里程占比</span><span class="v">{{ pct(s.brakingPer) }}<em>%</em></span></div>
            </div>
          </div>

          <div class="datarow2">
            <div>
              <div class="grp"><i style="background: #8b7cc8"></i>分路段电耗</div>
              <div class="roadbar">
                <span v-for="(r, i) in wf.roads" :key="r.name"
                  :style="{ width: (r.value / wf.travel * 100) + '%', background: roadColors[i] }"></span>
              </div>
              <div v-for="(r, i) in wf.roads" :key="'k' + r.name" class="kv">
                <span class="k">{{ r.name }}路段</span>
                <span class="v">{{ r.value }}<em>MWh · {{ pct(r.value / wf.travel) }}%</em></span>
              </div>
              <div class="kv"><span class="k">四段合计</span><span class="v">{{ wf.travel }}<em>MWh</em></span></div>
            </div>

            <div>
              <div class="grp"><i style="background: #5fbf6b"></i>能量构成</div>
              <div class="big2">
                <div class="b">
                  <div class="t">行程电耗</div>
                  <div class="n">{{ s.travelFuel }}<small>MWh</small></div>
                </div>
                <div class="b">
                  <div class="t">怠速电耗</div>
                  <div class="n">{{ s.idleFuel }}<small>MWh</small></div>
                </div>
              </div>
              <div class="tiny">
                怠速占比 {{ pctTo(s.idleFuel / (s.totalFuel || 1) * 100) }}%，折合每台车每天
                {{ (s.idleFuel / (s.carCount || 1) / (s.days || 1)).toFixed(2) }} MWh。
                装卸等待超过 20 分钟建议熄火断电。
              </div>
            </div>
          </div>
        </div>

        <!-- ---------- 02 分析视图 ---------- -->
        <div class="sec-hd">
          <span class="no">02</span>
          <h2>分析视图</h2>
          <span class="sub">以下图表由上述统计数据与车辆明细计算生成</span>
          <span class="rule"></span>
        </div>

        <div class="bento">
          <div class="c span12">
            <h3><span class="dot" style="background: #0f9b8e"></span>日里程与百公里电耗<span class="src">按日 · {{ s.days }} 天</span></h3>
            <div class="cap">
              柱形为当日车队总里程，折线为当日百公里电耗。<b>周末里程回落但电耗反而略高</b>，短途出车占比变大、冷启动更费电。
            </div>
            <div class="plot"><SvgPlot :draw="drawTrend" :deps="report" /></div>
            <div class="legend">
              <span><i style="background: #9fded4"></i>日里程 (km)</span>
              <span><i style="background: #ff7a59"></i>百公里电耗 (kWh/100km)</span>
            </div>
          </div>

          <div class="c span5">
            <h3><span class="dot" style="background: #3ea8d6"></span>运营强度 × 电耗<span class="src">按单车月里程分档</span></h3>
            <div class="cap">
              柱=该档车辆数，线=该档平均电耗。<b>呈 U 形</b>：跑最少的 {{ report.intensity[0].kiloil }}、跑最多的
              {{ report.intensity[4].kiloil }}，中间档最省 {{ minIntensity.kiloil }}。
            </div>
            <div class="plot"><SvgPlot :draw="drawIntensity" :deps="report" /></div>
            <div class="legend">
              <span><i style="background: #9fded4"></i>车辆数 (台)</span>
              <span><i style="background: #ff7a59"></i>百公里电耗</span>
            </div>
          </div>

          <div class="c span4">
            <h3><span class="dot" style="background: #8b7cc8"></span>分路段电耗构成<span class="src">来自统计数据</span></h3>
            <div class="cap">
              国道单一路段占 <b>{{ pct(wf.roads[1].value / wf.travel) }}%</b>，高速仅
              {{ pct(wf.roads[0].value / wf.travel) }}%，说明线路以国省道干线为主。
            </div>
            <div class="plot"><SvgPlot :draw="drawRoads" :deps="report" /></div>
            <div class="legend"><span><i style="background: #0f9b8e"></i>合计 {{ wf.travel }} MWh</span></div>
          </div>

          <div class="c span3">
            <h3><span class="dot" style="background: #ff7a59"></span>单车电耗分布</h3>
            <div class="cap">按百公里电耗分 5 档，看整体是否右偏。</div>
            <div class="plot"><SvgPlot :draw="drawDist" :deps="report" /></div>
            <div class="legend tight">
              <span v-for="(d, i) in report.distribution" :key="d.label">
                <i :style="{ background: distColors[i] }"></i>{{ d.label }} {{ d.count }} 台
              </span>
            </div>
          </div>

          <div class="c span7">
            <h3><span class="dot" style="background: #ff7a59"></span>驾驶行为<span class="src">次数 / 千公里</span></h3>
            <div class="cap">
              按里程归一化后才可比。<b>长时间怠速 {{ drivingTop.per1000 }} 次</b>最密，和怠速电耗互相印证。
            </div>
            <div class="plot"><SvgPlot :draw="drawDriving" :deps="report" /></div>
          </div>

          <div class="c span5">
            <h3><span class="dot" style="background: #0f9b8e"></span>车队六维评分<span class="src">满分 100</span></h3>
            <div class="cap">
              拆解「为什么费电」。<b>{{ radarWeak.name }} {{ radarWeak.value }} 分最弱</b>，是主要改进方向。
            </div>
            <div class="plot"><SvgPlot :draw="drawRadar" :deps="report" /></div>
            <div class="legend center">
              <span><i style="background: #0f9b8e"></i>本车队</span>
              <span><i style="background: #c9d8d3"></i>同吨位参考</span>
            </div>
          </div>

          <div class="c span12">
            <h3><span class="dot" style="background: #5fbf6b"></span>电耗贡献帕累托<span class="src">按单车电耗降序</span></h3>
            <div class="cap">
              柱为单车电耗贡献、线为累计占比。<b>要 {{ pareto80 }} 台车才累计到 80%</b>，说明没有单车异常大户，应整体提升而非抓单点。
            </div>
            <div class="plot"><SvgPlot :draw="drawPareto" :deps="report" /></div>
            <div class="legend">
              <span><i style="background: #9fded4"></i>单车电耗 (MWh)</span>
              <span><i style="background: #ff7a59"></i>累计占比 (%)</span>
            </div>
          </div>
        </div>

        <!-- ---------- 洞察 ---------- -->
        <div class="insight">
          <h3>关键洞察</h3>
          <ul>
            <li v-for="(it, i) in report.insights" :key="i" :class="{ warn: it.tone === 'warn' }">
              <span v-html="highlight(it.text)"></span>
            </li>
          </ul>
        </div>

        <div class="foot">
          <span>数据源：queryFleetInfo（车队分析报告）· 统计数据取自报告原文，趋势 / 分布类图表为示意</span>
          <span>方案 C2 · 青绿能源（数据前置）</span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import { supabase } from '@/utils/supabase'
import SvgPlot from '@/components/charts/SvgPlot.vue'
import { combo, hbars, radar, donut, COLORS } from '@/utils/svgCharts'

const route = useRoute()
const router = useRouter()

const task = ref({})
const report = ref(null)
const loading = ref(true)

const roadColors = ['#b9e4dc', '#0f9b8e', '#5fbf6b', '#f5b544']
const distColors = ['#9fded4', '#39bda9', '#0f9b8e', '#f5b544', '#ff7a59']
const driveColors = ['#ff7a59', '#ff8a6c', '#ff9a7f', '#f5b544', '#f7c46a', '#0f9b8e']

const fmt = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v).toLocaleString() : '--')
const pct = (v) => Math.round((Number(v) || 0) * 1000) / 10
const pctTo = (v) => Math.round((Number(v) || 0) * 10) / 10

const s = computed(() => report.value?.summary || {})
const wf = computed(() => report.value?.waterfall || {
  roads: [{ name: '高速', value: 0 }, { name: '国道', value: 0 }, { name: '省道', value: 0 }, { name: '其他', value: 0 }],
  travel: 1, idle: 0, total: 0,
})

const periodText = computed(() => {
  const t = task.value
  if (!t.period_start || !t.period_end) return t.period_type ? `按${t.period_type}` : '--'
  return `${dayjs(t.period_start).format('YYYY-MM-DD')} 至 ${dayjs(t.period_end).format('YYYY-MM-DD')}`
})

const sourceName = computed(() => {
  const map = {
    车队分析报告: 'queryFleetInfo',
    单车分析报告: 'queryCarInfo',
    车辆对比报告: 'queryTwiceInfo',
    同车对比报告: 'queryTwiceInfo',
  }
  return map[task.value.task_type] || '--'
})

const perCarDaily = computed(() => (s.value.dailyMileage || 0) / (s.value.carCount || 1))
const perCarMileage = computed(() => (s.value.mileage || 0) / (s.value.carCount || 1))

const minIntensity = computed(() => {
  const list = report.value?.intensity || []
  return list.reduce((a, b) => (b.kiloil < a.kiloil ? b : a), list[0] || { kiloil: 0 })
})

const drivingTop = computed(() => {
  const list = report.value?.driving || []
  return list.reduce((a, b) => (b.per1000 > a.per1000 ? b : a), list[0] || { label: '--', per1000: 0 })
})

const pareto80 = computed(() => {
  const p = report.value?.pareto || []
  const i = p.findIndex((x) => x.cum >= 0.8)
  return i === -1 ? p.length : i + 1
})

/* 六维评分：由真实比值算出，不是写死的 */
const radarScores = computed(() => {
  const x = s.value
  const clamp = (v) => Math.max(35, Math.min(98, Math.round(v)))
  const driveSum = (report.value?.driving || []).reduce((a, b) => a + b.per1000, 0)
  const roadShare = (wf.value.roads[1]?.value || 0) / (wf.value.travel || 1)
  const badRatio = (report.value?.anomalies?.length || 0) / (x.carCount || 1)
  return [
    clamp(100 - (x.kilOil - 115) * 2.2),
    clamp((x.attendancePer || 0) * 100),
    clamp(100 - Math.abs((x.avgSpeed || 0) - 55) * 1.2),
    clamp(100 - driveSum * 3.2),
    clamp(100 - roadShare * 90),
    clamp(100 - badRatio * 150),
  ]
})

const radarWeak = computed(() => {
  const axes = ['能耗水平', '出勤率', '车速控制', '驾驶技巧', '路面结构', '车况']
  const v = radarScores.value
  const i = v.indexOf(Math.min(...v))
  return { name: axes[i], value: v[i] }
})

/* 洞察里把数字加粗，读起来更有重点 */
const highlight = (txt) => String(txt || '').replace(/(\d+(?:\.\d+)?%?)/g, '<b>$1</b>')

// ---------------- 图表 ----------------
/* ⭐ 折线轴不做 0 基线：电耗都在 125~140 之间，从 0 起就是一条直线，看不出波动 */
const lineBand = (arr) => {
  const v = arr.filter((x) => typeof x === 'number' && isFinite(x))
  if (!v.length) return {}
  return { min: Math.floor(Math.min(...v) - 2), max: Math.ceil(Math.max(...v) + 2) }
}

const drawTrend = (host, w) => {
  const d = report.value?.daily || []
  combo(host, w, {
    id: 'trend',
    h: 250,
    labels: d.map((x) => x.date),
    step: 3,
    bar: { data: d.map((x) => x.mileage), color: COLORS.teal2, unit: ' km' },
    line: {
      data: d.map((x) => x.kiloil), color: COLORS.coral, unit: ' kWh/100km', digits: 1,
      ...lineBand(d.map((x) => x.kiloil)),
    },
  })
}

const drawIntensity = (host, w) => {
  const d = report.value?.intensity || []
  combo(host, w, {
    id: 'intensity',
    h: 236,
    labels: d.map((x) => x.label),
    bar: { data: d.map((x) => x.cars), color: COLORS.teal2, unit: ' 台' },
    line: {
      data: d.map((x) => x.kiloil), color: COLORS.coral, digits: 1,
      ...lineBand(d.map((x) => x.kiloil)),
    },
  })
}

const drawRoads = (host, w) => {
  const roads = [...wf.value.roads].sort((a, b) => b.value - a.value)
  hbars(host, w, {
    rowH: 34,
    labW: 44,
    valW: 100,
    max: Math.max(...roads.map((r) => r.value)),
    items: roads.map((r) => ({
      label: r.name,
      value: r.value,
      note: `${r.value} · ${pct(r.value / wf.value.travel)}%`,
      color: roadColors[wf.value.roads.findIndex((x) => x.name === r.name)] || roadColors[1],
    })),
  })
}

const drawDist = (host, w) => {
  const d = report.value?.distribution || []
  donut(host, w, {
    centerTop: `${d[4]?.count || 0} 台`,
    centerSub: '电耗 ≥135',
    items: d.map((x, i) => ({ label: x.label, value: x.count, color: distColors[i] })),
  })
}

const drawDriving = (host, w) => {
  const d = [...(report.value?.driving || [])].sort((a, b) => b.per1000 - a.per1000)
  hbars(host, w, {
    rowH: 26,
    labW: 88,
    valW: 66,
    items: d.map((x, i) => ({
      label: x.label,
      value: x.per1000,
      note: `${x.per1000} 次 · 共 ${x.count}`,
      color: driveColors[i] || COLORS.teal,
    })),
  })
}

const drawRadar = (host, w) => {
  radar(host, w, {
    axes: ['能耗水平', '出勤率', '车速控制', '驾驶技巧', '路面结构', '车况'],
    series: [
      { values: [72, 74, 78, 74, 70, 76], color: '#c9d8d3', fill: false },
      { values: radarScores.value, color: COLORS.teal, fill: true },
    ],
  })
}

const drawPareto = (host, w) => {
  const p = report.value?.pareto || []
  combo(host, w, {
    id: 'pareto',
    h: 300,
    labels: p.map((x) => x.name),
    step: 1,
    rot: 42,
    bar: { data: p.map((x) => x.fuel), color: COLORS.teal2, unit: ' MWh', digits: 1 },
    line: { data: p.map((x) => +(x.cum * 100).toFixed(1)), color: COLORS.coral, max: 100, unit: '%', digits: 1 },
  })
}

// ---------------- 数据 ----------------
const taskNo = computed(() => String(route.query.task_no || ''))

const load = async () => {
  const no = taskNo.value
  if (!no) { loading.value = false; return }
  loading.value = true
  try {
    const { data, error } = await supabase
      .from('energy_report_tasks')
      .select('*')
      .eq('task_no', no)
      .maybeSingle()
    if (error) throw error
    task.value = data || {}
    report.value = data?.report_data || null
  } catch (e) {
    console.warn('[能耗报告] 详情加载失败', e)
    task.value = {}
    report.value = null
  } finally {
    loading.value = false
  }
}

const goBack = () => router.push('/operation/energy')

const exportCars = () => {
  const cars = report.value?.quadrant || []
  if (!cars.length) { ElMessage.warning('没有可导出的车辆明细'); return }
  const head = ['底盘号', '出勤率', '月里程(km)', '百公里电耗(kWh/100km)', '耗电量(MWh)']
  const lines = [head.join(',')].concat(cars.map((c) => [c.name, c.attendance, c.mileage, c.kiloil, c.fuel].join(',')))
  const blob = new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${task.value.task_name}_车辆明细.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

onMounted(load)
watch(taskNo, load)
</script>

<style scoped>
/* ============================================================
   方案 C2 · 青绿能源（数据前置）—— 与设计稿 1:1
   ⭐ 对比度整体调高一档：muted / ink2 压深，10px 小字放大到 11 左右
   ============================================================ */
.energy-report-detail-page {
  --bg: #edf5f1;
  --card: #fff;
  --ink: #0a2621;
  --ink2: #1f403a;
  --muted: #476860;
  --faint: #6d8981;
  --line: #dbe9e4;
  --line2: #e9f2ee;
  --teal: #0f9b8e;
  --teal2: #39bda9;
  --lime: #5fbf6b;
  --coral: #ff7a59;
  --amber: #f5b544;
  --sky: #3ea8d6;
  --plum: #8b7cc8;
  min-height: 100%;
  background: var(--bg);
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', Arial, sans-serif;
  font-size: 14px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  background-image:
    radial-gradient(760px 420px at 8% -6%, rgba(15, 155, 142, .13), transparent 62%),
    radial-gradient(680px 400px at 96% 0%, rgba(95, 191, 107, .13), transparent 60%);
  background-attachment: fixed;
}

.wrap {
  max-width: 1340px;
  margin: 0 auto;
  padding: 22px 26px 40px;
  box-sizing: border-box;
}

/* ---------- 顶栏 ---------- */
.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.brand { display: flex; align-items: center; gap: 13px; min-width: 0; }

.logo {
  width: 42px;
  height: 42px;
  border-radius: 13px;
  background: linear-gradient(135deg, var(--teal), var(--lime));
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 16px rgba(15, 155, 142, .28);
  flex: none;
}

.logo svg { width: 22px; height: 22px; }

.brand-txt { min-width: 0; }

.brand h1 {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: .2px;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.brand h1 .h1-sub { font-size: 15px; font-weight: 600; color: var(--ink2); }

.brand p { font-size: 12px; color: var(--muted); margin-top: 2px; }

.pills { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

.pill {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 6px 13px;
  font-size: 12.2px;
  color: var(--muted);
  box-shadow: 0 1px 2px rgba(16, 60, 52, .04);
}

.pill b { color: var(--ink2); font-weight: 700; }

.pill.ghost { cursor: pointer; transition: .18s; }

.pill.ghost:hover { color: var(--teal); border-color: #a9dbd1; background: #f4fbf9; }

.pill.go {
  background: linear-gradient(135deg, var(--teal), #18ab97);
  color: #fff;
  border: none;
  cursor: pointer;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(15, 155, 142, .3);
}

.pill.go:hover { filter: brightness(1.04); }

.pill.go.disabled { opacity: .55; cursor: not-allowed; }

/* ---------- 章节标题 ---------- */
.sec-hd { display: flex; align-items: center; gap: 11px; margin: 22px 0 11px; }

.sec-hd .no {
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, var(--teal), var(--teal2));
  border-radius: 6px;
  padding: 2px 8px;
  letter-spacing: .5px;
}

.sec-hd h2 { font-size: 15px; font-weight: 700; letter-spacing: .4px; color: var(--ink); }

.sec-hd .sub { font-size: 12px; color: var(--muted); margin-left: 2px; }

.sec-hd .rule { flex: 1; height: 1px; background: var(--line); }

/* ---------- 数据卡 ---------- */
.card {
  background: var(--card);
  border-radius: 20px;
  border: 1px solid rgba(219, 233, 228, .95);
  box-shadow: 0 2px 4px rgba(16, 60, 52, .03), 0 10px 26px rgba(16, 60, 52, .045);
  overflow: hidden;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 64px 30px;
  color: var(--muted);
  text-align: center;
}

.state h3 { margin: 0; font-size: 16px; color: var(--ink); }
.state p { margin: 0; font-size: 13px; max-width: 560px; line-height: 1.75; color: var(--muted); }
.state .hint { font-size: 12px; color: var(--faint); }
.state .pill.go { margin-top: 6px; }

.spinner {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid var(--teal);
  border-top-color: transparent;
  animation: spin .8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.strip {
  background: linear-gradient(118deg, #0d9187 0%, #12a894 46%, #31b98f 100%);
  color: #fff;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  position: relative;
  overflow: hidden;
}

.strip::after {
  content: '';
  position: absolute;
  right: -60px;
  top: -80px;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: rgba(255, 255, 255, .07);
}

.strip .m {
  padding: 16px 18px 15px;
  border-right: 1px solid rgba(255, 255, 255, .18);
  position: relative;
  z-index: 2;
}

.strip .m:last-child { border-right: none; }

.strip .lab { font-size: 11.6px; opacity: .96; letter-spacing: .5px; white-space: nowrap; }

.strip .v {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -.9px;
  line-height: 1.15;
  margin-top: 3px;
  font-variant-numeric: tabular-nums;
}

.strip .v small { font-size: 11.5px; font-weight: 500; opacity: .95; letter-spacing: 0; margin-left: 3px; }

.strip .n { font-size: 11px; opacity: .9; margin-top: 3px; }

.databody { display: grid; grid-template-columns: repeat(3, 1fr); }

.col { padding: 15px 20px 16px; border-right: 1px solid var(--line2); }

.col:last-child { border-right: none; }

.grp {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.8px;
  font-weight: 700;
  color: var(--ink2);
  letter-spacing: .5px;
  margin-bottom: 8px;
}

.grp i { width: 5px; height: 5px; border-radius: 50%; background: var(--teal); flex: none; }

.kv {
  display: flex;
  gap: 10px;
  padding: 5.5px 0;
  border-bottom: 1px dashed var(--line2);
  align-items: baseline;
}

.kv:last-child { border-bottom: none; }

.kv .k {
  width: 100px;
  flex: none;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.35;
}

.kv .v {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
  word-break: break-word;
}

.kv .v em { font-style: normal; font-size: 11px; color: var(--muted); font-weight: 500; margin-left: 2px; }

.kv .v.nil { color: #9db3ad; font-weight: 500; }

.datarow2 { display: grid; grid-template-columns: 1.22fr 1fr; border-top: 1px solid var(--line); }

.datarow2 > div { padding: 15px 20px 17px; border-right: 1px solid var(--line2); }

.datarow2 > div:last-child { border-right: none; }

.roadbar { display: flex; height: 9px; border-radius: 5px; overflow: hidden; margin: 4px 0 10px; gap: 2px; }

.roadbar span { display: block; height: 100%; }

.big2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.big2 .b {
  background: linear-gradient(150deg, #f4fbf9, #eef7f3);
  border: 1px solid #d3e9e2;
  border-radius: 12px;
  padding: 10px 12px;
}

.big2 .b .t { font-size: 11.4px; color: var(--muted); letter-spacing: .3px; }

.big2 .b .n {
  font-size: 21px;
  font-weight: 700;
  letter-spacing: -.7px;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  margin-top: 2px;
  color: var(--ink);
}

.big2 .b .n small { font-size: 10.5px; color: var(--muted); font-weight: 600; margin-left: 2px; }

.tiny { font-size: 11.2px; color: var(--faint); margin-top: 10px; line-height: 1.6; }

/* ---------- 图表网格 ---------- */
.bento { display: grid; grid-template-columns: repeat(12, 1fr); gap: 13px; }

.c {
  background: var(--card);
  border-radius: 18px;
  padding: 15px 17px 13px;
  border: 1px solid rgba(219, 233, 228, .95);
  box-shadow: 0 2px 4px rgba(16, 60, 52, .03), 0 8px 22px rgba(16, 60, 52, .04);
  display: flex;
  flex-direction: column;
  transition: .2s;
}

.c:hover {
  box-shadow: 0 4px 8px rgba(16, 60, 52, .05), 0 12px 28px rgba(16, 60, 52, .07);
  transform: translateY(-1px);
}

.c h3 {
  font-size: 13.2px;
  font-weight: 700;
  color: var(--ink2);
  letter-spacing: .2px;
  display: flex;
  align-items: center;
  gap: 7px;
}

.c h3 .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--teal); flex: none; }

.c h3 .src { font-size: 10.6px; font-weight: 500; color: var(--faint); margin-left: auto; letter-spacing: 0; }

.c .cap { font-size: 11.8px; color: var(--muted); margin: 4px 0 8px; line-height: 1.55; }

.c .cap b { color: var(--ink); font-weight: 700; }

.plot { flex: 1; display: flex; flex-direction: column; justify-content: center; min-height: 0; }

.legend {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 8px;
  font-size: 11.2px;
  color: var(--muted);
}

.legend.tight { gap: 6px 10px; font-size: 10.8px; }

.legend.center { justify-content: center; }

.legend i {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 3px;
  margin-right: 5px;
  vertical-align: 0;
}

.span3 { grid-column: span 3; }
.span4 { grid-column: span 4; }
.span5 { grid-column: span 5; }
.span7 { grid-column: span 7; }
.span12 { grid-column: span 12; }

/* ---------- 洞察 ---------- */
.insight {
  background: linear-gradient(120deg, #f2fbf8, #eef7f2);
  border: 1px solid #cfe6de;
  border-radius: 20px;
  padding: 16px 20px;
  margin-top: 14px;
}

.insight h3 {
  font-size: 13px;
  color: #0b7a6f;
  font-weight: 700;
  letter-spacing: .6px;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 7px;
}

.insight ul { list-style: none; display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 24px; margin: 0; padding: 0; }

.insight li {
  font-size: 12.6px;
  color: #24443d;
  line-height: 1.65;
  padding-left: 15px;
  position: relative;
}

.insight li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 7px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--lime);
}

.insight li.warn::before { background: var(--coral); }

.insight li b { color: var(--ink); font-weight: 700; }

.foot {
  margin-top: 16px;
  display: flex;
  justify-content: space-between;
  font-size: 11.2px;
  color: var(--faint);
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 1180px) {
  .strip { grid-template-columns: repeat(3, 1fr); }
  .strip .m:nth-child(3) { border-right: none; }
  .databody { grid-template-columns: 1fr 1fr; }
  .col:nth-child(2) { border-right: none; }
  .col:nth-child(3) { border-top: 1px solid var(--line2); }
  .datarow2 { grid-template-columns: 1fr; }
  .datarow2 > div:first-child { border-right: none; border-bottom: 1px solid var(--line2); }
  .span3, .span4, .span5 { grid-column: span 6; }
  .span7, .span12 { grid-column: span 12; }
  .insight ul { grid-template-columns: 1fr; }
}
</style>
