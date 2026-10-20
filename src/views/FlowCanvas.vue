<template>
  <div class="flow-page">
    <!-- 工具条 -->
    <div class="flow-bar">
      <div class="fb-left">
        <h2>业务流程</h2>
        <span class="fb-sub">
          {{ isPreviewClient
            ? '客户看到的样子：灰色的还没开通'
            : (isAdmin
              ? '所有节点都可启停 · 连线会跳过未开通的'
              : '开通过的可以自己启停 · 未开通的在左侧') }}
        </span>
      </div>
      <div class="fb-right">
        <el-switch v-if="isAdmin" v-model="previewClient" size="small"
          active-text="预览客户视角" style="margin-right:14px" />
        <span v-if="moduleFlags.folded && Object.keys(moduleFlags.folded).length" class="fb-warn">
          {{ Object.keys(moduleFlags.folded).length }} 个模块因依赖未满足而不可用
        </span>
        <div class="zoom">
          <button class="z-btn" title="缩小" @click="zoomBy(-1)">−</button>
          <span class="z-val" @click="resetZoom">{{ Math.round(scale * 100) }}%</span>
          <button class="z-btn" title="放大" @click="zoomBy(1)">+</button>
          <button class="z-fit" @click="fitWidth">适应宽度</button>
        </div>
        <span v-if="overflowX" class="fb-hint" title="画布比窗口宽，右侧还有内容">↔ 可左右拖动</span>
        <el-button size="small" plain @click="reload">刷新</el-button>
      </div>
    </div>

    <div v-if="moduleFlags.failed" class="flow-alert">
      模块配置读取失败，已按「全部开启」降级显示。请确认已执行
      <code>sql/2026-10-20_flow_modules.sql</code>
    </div>

    <!-- 画布 -->
    <div ref="scrollRef" class="flow-scroll">
      <div class="canvas-scaler" :style="{ width: W * scale + 'px', height: H * scale + 'px' }">
      <div class="flow-canvas" :style="{ transform: `scale(${scale})` }">
        <!-- 背景网格 -->
        <svg class="bg-grid" :width="W" :height="H">
          <defs>
            <pattern id="fcDots" width="16" height="16" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="#E9EFF6" />
            </pattern>
            <linearGradient id="fcBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#FDFEFF" />
              <stop offset="1" stop-color="#F6F9FD" />
            </linearGradient>
          </defs>
          <rect :width="W" :height="H" fill="url(#fcBg)" />
          <rect :width="W" :height="H" fill="url(#fcDots)" opacity=".7" />
        </svg>

        <!-- 左栏：数据底座 + 未开通池 -->
        <aside class="base-col" :style="{ height: H + 'px' }">
          <div class="bc-hd">
            <span class="bc-t">数据底座</span>
            <span class="bc-tag">必选 · 不可关</span>
          </div>
          <p class="bc-sub">不参与流程配置，所有客户都有</p>

          <div v-for="b in BASE_MODULES" :key="b.key" class="bc-card"
            :style="{ '--bar': b.color }" @click="openBase(b)">
            <div class="bc-name">{{ b.name }}</div>
            <div class="bc-desc">{{ b.desc }}</div>
            <div class="bc-chips">
              <span v-for="c in b.chips" :key="c">{{ c }}</span>
            </div>
          </div>

          <!-- 客户视角：未开通清单 -->
          <template v-if="!isAdmin && offModules.length">
            <div class="bc-divider"></div>
            <div class="bc-pool-t">未开通 · {{ offModules.length }} 项</div>
            <div v-for="m in offModules" :key="m.key" class="bc-pool-item"
              :class="{ 'can-open': m.configured }">
              {{ m.name }}
              <em v-if="m.configured">可开启</em>
            </div>
            <div class="bc-pool-hint">
              如需开通，请联系<br>您的服务顾问
            </div>
          </template>

          <div v-else-if="isAdmin && offModules.length" class="bc-pool-hint" style="margin-top:14px">
            未开通的 {{ offModules.length }} 项留在右侧<br>流程原位，便于判断影响
          </div>
        </aside>

        <!-- 泳道底 -->
        <div v-for="(lane, i) in lanes" v-show="laneHasNode(i)" :key="'band-' + lane.key"
          class="lane-band" :style="{ top: LANE_Y[i] + 'px', background: laneBand(i) }"></div>

        <!-- 泳道标题 -->
        <div v-for="(lane, i) in lanes" v-show="laneHasNode(i)" :key="'hd-' + lane.key"
          class="lane-hd" :style="{ top: LANE_Y[i] + 8 + 'px', left: LANE_X + 'px' }">
          <i :style="{ background: lane.color }"></i>{{ lane.name }}
        </div>

        <!-- 连线 -->
        <svg class="wires" :key="wireKey" :width="W" :height="H">
          <defs>
            <linearGradient id="wireGrad" x1="440" y1="20" x2="440" :y2="H - 10" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#3B7DE8" />
              <stop offset=".33" stop-color="#6D46E8" />
              <stop offset=".66" stop-color="#A63BC8" />
              <stop offset="1" stop-color="#C8102E" />
            </linearGradient>
            <filter id="wireGlow" filterUnits="userSpaceOnUse" x="0" y="0" :width="W" :height="H">
              <feGaussianBlur stdDeviation="4" />
            </filter>
            <filter id="wirePillar" filterUnits="userSpaceOnUse" x="0" y="0" :width="W" :height="H">
              <feGaussianBlur stdDeviation="3" />
            </filter>
            <path v-for="p in paths" :key="'def-' + p.id" :id="'wp-' + p.id" :d="p.d" />
          </defs>

          <!-- 柔光 -->
          <g fill="none" stroke="url(#wireGrad)" stroke-width="9" opacity=".18"
            stroke-linecap="round" stroke-linejoin="round" filter="url(#wireGlow)">
            <use v-for="p in paths.filter(x => !x.dash)" :key="'g-' + p.id" :href="'#wp-' + p.id" />
          </g>
          <!-- 旁支虚线 -->
          <g fill="none" stroke="url(#wireGrad)" stroke-width="2.2" opacity=".5"
            stroke-dasharray="5 4" stroke-linecap="round">
            <path v-for="p in paths.filter(x => x.dash)" :key="'d-' + p.id" :d="p.d" />
          </g>

          <!-- 管体 -->
          <g fill="none" stroke="url(#wireGrad)" stroke-width="3.4" opacity=".8"
            stroke-linecap="round" stroke-linejoin="round">
            <use v-for="p in paths.filter(x => !x.dash)" :key="'t-' + p.id" :href="'#wp-' + p.id" />
          </g>
          <!-- 白芯 -->
          <g fill="none" stroke="#fff" stroke-width="1.2" opacity=".38"
            stroke-linecap="round" stroke-linejoin="round">
            <use v-for="p in paths.filter(x => !x.dash)" :key="'c-' + p.id" :href="'#wp-' + p.id" />
          </g>
          <!-- 光柱（占路径约 24%） -->
          <g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round"
            opacity=".42" filter="url(#wirePillar)">
            <path v-for="p in paths.filter(x => !x.dash)" :key="'pw-' + p.id" :d="p.d" stroke-width="8"
              :stroke-dasharray="`${p.seg} ${p.L - p.seg}`">
              <animate attributeName="stroke-dashoffset" :from="p.L" to="0"
                :dur="p.dur + 's'" calcMode="linear" repeatCount="indefinite" />
            </path>
          </g>
          <g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" opacity=".9">
            <path v-for="p in paths.filter(x => !x.dash)" :key="'pb-' + p.id" :d="p.d" stroke-width="2.6"
              :stroke-dasharray="`${p.seg} ${p.L - p.seg}`">
              <animate attributeName="stroke-dashoffset" :from="p.L" to="0"
                :dur="p.dur + 's'" calcMode="linear" repeatCount="indefinite" />
            </path>
          </g>
          <!-- 箭头 -->
          <g fill="url(#wireGrad)">
            <path v-for="p in paths.filter(x => x.arrow)" :key="'ar-' + p.id" :d="p.arrow" />
          </g>
        </svg>

        <!-- 节点卡片 -->
        <div v-for="n in visibleNodes" :key="n.uid" class="fnode"
          :class="{ ghost: n.disabled, locked: !n.interactive, 'has-menu': n.interactive }"
          :style="{ left: n.x + 'px', top: n.y + 'px', width: LANE_W + 'px', height: NODE_H + 'px', '--bar': n.color }"
          @click="openNode(n)">
          <span class="bar"></span>
          <div class="fn-t">
            <span v-if="!n.enabled && !previewClient" class="fn-warn" title="该模块未开启">!</span>
            {{ n.name }}
            <em v-if="n.badge">{{ n.badge }}</em>
          </div>
          <div class="fn-c">
            <span v-for="c in n.chips" :key="c">{{ c }}</span>
          </div>
          <span v-if="isAdmin" class="fn-menu" :class="{ dim: !n.interactive }"><i></i><i></i><i></i></span>
          <span v-else-if="n.enabled" class="fn-dot"></span>
        </div>
      </div>
      </div>
    </div>

    <!-- 配置抽屉 -->
    <el-drawer v-model="drawer" :size="360" :with-header="false" append-to-body>
      <div v-if="active" class="drawer-body">
        <div class="db-hd">
          <span class="db-bar" :style="{ background: active.color }"></span>
          <div>
            <div class="db-name">{{ active.name }}</div>
            <div class="db-desc">{{ active.desc || '流程步骤，随运单模块启停' }}</div>
          </div>
        </div>

        <!-- 状态 -->
        <div class="db-sec">
          <div class="db-label">当前状态</div>
          <div v-if="active.module" class="db-state" :class="active.enabled ? 'on' : 'off'">
            <span>{{ active.enabled ? '已开通' : '未开通' }}</span>
            <em v-if="!isAdmin">如需{{ active.enabled ? '关闭' : '开通' }}请联系服务顾问</em>
            <em v-else>{{ active.enabled ? '关闭后整块功能消失' : '开通后立即对客户可见' }}</em>
          </div>
          <div v-else class="db-state on">
            <span>随运单模块</span>
            <em>运单开启时此类步骤自动可用</em>
          </div>
        </div>

        <!-- 依赖缺失 -->
        <div v-if="active.foldedBy && active.foldedBy.length" class="db-sec">
          <div class="db-alert">
            依赖未满足：{{ active.foldedBy.map(k => moduleName(k)).join('、') }} 未开通，
            本模块当前不可用
          </div>
        </div>

        <!-- 启停：管理员不限制；客户只能改「管理员配过」的 -->
        <div v-if="active.module" class="db-sec">
          <div class="db-label">启停</div>
          <template v-if="active.canToggle">
            <el-button :type="active.enabled ? 'danger' : 'primary'" plain size="small"
              :loading="saving" @click="toggleModule(active)">
              {{ active.enabled ? '停用此模块' : '开启此模块' }}
            </el-button>
            <div class="db-hint">
              {{ active.enabled
                ? '停用只影响之后的使用，历史数据不会删除；重新开启后原配置保留'
                : '开启后立即可用，无需重启' }}
            </div>
          </template>
          <div v-else class="db-locked">
            <el-icon><Lock /></el-icon>
            <div>
              <b>该功能尚未开通</b>
              <p>如需使用请联系您的服务顾问开通</p>
            </div>
          </div>
        </div>

        <!-- 参数 -->
        <div class="db-sec">
          <div class="db-label">参数</div>
          <div v-if="!active.module" class="db-hint">该节点没有独立参数</div>
          <template v-else>
            <div v-for="f in active.fields" :key="f.key" class="db-field">
              <label>{{ f.label }}</label>
              <el-input v-model="form[f.key]" size="small" :placeholder="f.ph || ''"
                :disabled="!active.enabled" />
            </div>
            <el-button v-if="active.fields && active.fields.length" size="small" type="primary"
              plain :loading="saving" :disabled="!active.enabled" @click="saveConfig(active)">
              保存参数
            </el-button>
            <div v-if="!active.fields || !active.fields.length" class="db-hint">
              该模块暂无可调参数（阈值、审批链在「费用审批设置」里）
            </div>
          </template>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Lock } from '@element-plus/icons-vue'
import {
  moduleFlags, ensureModuleFlags, setModuleFlag, setModuleConfig,
  isFlowAdmin, currentUserForModules, moduleOwner,
} from '@/utils/modules'
import { supabase } from '@/utils/supabase'
import { BASE_MODULES, MODULES as MODULES_FOR_FLAGS, foldDeps } from '@/config/modules'

/* ============ 几何常量（与视觉稿一致） ============ */
const LANE_X = 276
const LANE_W = 232
const GAP = 70
const LANE_Y = [28, 144, 260, 376]
const BAND_H = 92
const NODE_DY = 22
const NODE_H = 68
const W = 1240
const H = 480

const colX = (i) => LANE_X + i * (LANE_W + GAP)

/* ============ 泳道与节点 ============ */
const LANES = [
  {
    key: 'dispatch', name: '调度', color: '#22C55E',
    nodes: [
      { key: 'waybill', name: '接单建单', module: 'waybill', chips: ['客户下单', '自建运单'] },
      { key: 'dispatch', name: '派单配载', chips: ['司机指派', '车辆指派'] },
      { key: 'recurring', name: '常驻任务', module: 'recurring', badge: '旁支', main: false, chips: ['按时间', '按次数'] },
    ],
  },
  {
    key: 'execute', name: '执行', color: '#3B82F6',
    nodes: [
      { key: 'accept', name: '司机接单', chips: ['接单 / 拒单'] },
      { key: 'load', name: '装货发车', chips: ['装车完成', '确认发车'] },
      { key: 'arrive', name: '卸货完成', chips: ['确认到达', '完成运单'] },
    ],
  },
  {
    key: 'settle', name: '费用', color: '#C8102E',
    nodes: [
      { key: 'report_fee', name: '司机上报', chips: ['费用', '回单'] },
      { key: 'audit', name: '费用审批', chips: ['多级审批', '阈值'] },
      { key: 'payout', name: '付款记录', module: 'payout', chips: ['登记付款', '撤销'] },
    ],
  },
  {
    key: 'report', name: '运单报表', color: '#F59E0B',
    nodes: [
      { key: 'fleet_report', name: '车队运营报告', module: 'report', chips: ['运单汇总', '按客户'] },
    ],
  },
]

const lanes = LANES
const user = currentUserForModules()
const isAdmin = isFlowAdmin(user)
const previewClient = ref(false)

/* ============ 缩放 ============
   画布是固定 1240×480，窗口不够时以前会整体等比缩小（字跟着变小）。
   现在改成：按 scale 放大/缩小，容器滚动，字号不再被动缩小。 */
const scrollRef = ref(null)
const scale = ref(1.3)   /* 默认 130%：100% 时字偏小 */
/* 画布比可视区宽时给个提示，不然用户以为右边没了 */
const overflowX = ref(false)

function checkOverflow() {
  const box = scrollRef.value
  if (!box) return
  overflowX.value = box.scrollWidth > box.clientWidth + 4
}
const MIN_SCALE = 0.6
const MAX_SCALE = 2

const clamp = (v) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(v * 10) / 10))

function zoomBy(dir) {
  scale.value = clamp(scale.value + dir * 0.1)
  nextTick(checkOverflow)
}

const DEFAULT_SCALE = 1.3
function resetZoom() {
  scale.value = DEFAULT_SCALE
  nextTick(checkOverflow)
}

/** 适应宽度：不缩到 100% 以下，宁可变大或滚动 */
function fitWidth() {
  const box = scrollRef.value
  if (!box) return
  const avail = box.clientWidth - 32
  scale.value = clamp(Math.max(1, avail / W))
  nextTick(checkOverflow)
}

/** 第一次进来：容器够宽就填满，不够就保持 100%（可滚动），不压缩 */
onMounted(() => {
  /* 不做自适应：默认就是 130%，窄窗口靠滚动 */
  nextTick(checkOverflow)
  window.addEventListener('resize', () => { nextTick(checkOverflow) })
})

/* 某条泳道当前有没有可见节点（客户视角下可能整条空掉，空泳道不要留色带） */
const laneHasNode = (li) => visibleNodes.value.some((n) => n.li === li)

const laneBand = (i) => {
  const c = LANES[i].color
  return `linear-gradient(90deg, ${c}14, ${c}03)`
}

/**
 * 模块是否有效
 * ⭐ 不管谁在看，都读 effective（真实开关状态）。
 *    以前管理员走 intent !== false（没记录也算开），导致画布上看着全开、
 *    实际客户是关的 —— 管理员就没法判断该配什么。
 */
const modOn = (key) => {
  if (!key) return true
  return moduleFlags.effective[key] === true
}

/** 拍平成可渲染节点（带坐标） */
const allNodes = computed(() => {
  const out = []
  LANES.forEach((lane, li) => {
    lane.nodes.forEach((n, ci) => {
      const enabled = n.module ? modOn(n.module) : moduleFlags.effective.waybill === true
      out.push({
        ...n,
        uid: `${lane.key}-${n.key}`,
        lane: lane.key,
        color: lane.color,
        x: colX(ci),
        y: LANE_Y[li] + NODE_DY,
        ci, li,
        enabled,
        /* 管理员不灰（只靠连线断开提示）；预览客户和真实客户才灰 */
        disabled: !!n.module && !enabled && (!isAdmin || previewClient.value),
        interactive: !!n.module && (isAdmin || isConfigured(n.module)),
      })
    })
  })
  return out
})

/**
 * 三种视角的显示规则（2026-10-20 二次调整）
 * ────────────────────────────────────────────────
 * ① 管理员（含模拟进入）：**全部节点都亮着**，关闭的也不变灰 ——
 *    但连线会跳过它（见 paths），所以一眼能看出「流程在这个模块这里断了」
 * ② 管理员点「预览客户视角」：关闭的节点**变灰**，位置不动
 * ③ 真实客户：关闭的模块**不留在流程里**，收到左栏数据底座下面，置灰
 */
const isPreviewClient = computed(() => isAdmin && previewClient.value)

const visibleNodes = computed(() => {
  /* 管理员 / 预览：全部渲染 */
  if (isAdmin) return allNodes.value
  /* 真实客户：只留已开通的，关掉的去左栏 */
  return allNodes.value.filter((n) => n.enabled)
})

/** 这个模块管理员配置过没有（tenant_modules 里有记录 = 配过） */
const isConfigured = (key) =>
  !!key && Object.prototype.hasOwnProperty.call(moduleFlags.intent || {}, key)

/** 当前用户能不能开关这个节点 */
const canToggle = (n) => {
  if (!n || !n.module) return false
  if (isAdmin) return true            // 服务商：随便改
  return isConfigured(n.module)       // 客户：只能改配过的
}

/** 客户视角下未开通的模块（放左栏池子） */
const offModules = computed(() => {
  const seen = new Set()
  const out = []
  allNodes.value.forEach((n) => {
    if (!n.module || n.enabled || seen.has(n.module)) return
    seen.add(n.module)
    out.push({ key: n.module, name: n.name, configured: isConfigured(n.module) })
  })
  return out
})

/* ============ 连线 ============ */
function pathLen(d) {
  const toks = [...d.matchAll(/([MHV])\s*(-?[\d.]+)(?:\s+(-?[\d.]+))?/g)]
  let total = 0; let cx = 0; let cy = 0
  toks.forEach((t) => {
    const c = t[1]; const a = parseFloat(t[2]); const b = t[3] !== undefined ? parseFloat(t[3]) : null
    if (c === 'M') { cx = a; cy = b }
    else if (c === 'H') { total += Math.abs(a - cx); cx = a }
    else if (c === 'V') { total += Math.abs(a - cy); cy = a }
  })
  return total
}

const paths = computed(() => {
  const out = []
  let idx = 0
  const rows = LANES.map((lane, li) => {
    /* ⭐ 连线只串「已开通」的节点：关掉的模块会让流程线在这里断开，
       而不是绕过去连上（绕过去就看不出它没开了） */
    const nodes = visibleNodes.value
      .filter((n) => n.li === li && n.main !== false && n.enabled)
      .sort((a, b) => a.ci - b.ci)
    return { li, nodes }
  })

  rows.forEach(({ li, nodes }, ri) => {
    const cy = LANE_Y[li] + NODE_DY + NODE_H / 2
    // 行内横向
    for (let i = 0; i < nodes.length - 1; i++) {
      const x1 = nodes[i].x + LANE_W
      const x2 = nodes[i + 1].x
      if (x2 - x1 < 6) continue
      out.push({ id: `h${idx++}`, d: `M${x1} ${cy} H${x2 - 2}`, arrow: arrowH(x2, cy) })
    }
    // 回绕到下一行
    const next = rows[ri + 1]
    if (next && next.nodes.length) {
      const from = nodes[nodes.length - 1]
      const to = next.nodes[0]
      const x1 = from.x + LANE_W / 2
      const y1 = LANE_Y[li] + NODE_DY + NODE_H
      const midY = LANE_Y[li + 1] - 10
      const x2 = to.x + LANE_W / 2
      const y2 = LANE_Y[li + 1] + NODE_DY - 2
      out.push({
        id: `r${idx++}`,
        d: `M${x1} ${y1} V${midY} H${x2} V${y2}`,
        arrow: arrowV(x2, y2),
      })
    }
  })

  /* ⭐ 旁支（常驻任务这种 main:false 的）单独拉一条虚线，从左边最近的主节点接过来。
     不并进主链路，否则会让人以为流程必须经过它。 */
  LANES.forEach((lane, li) => {
    const vis = visibleNodes.value
      .filter((n) => n.li === li && n.enabled)
      .sort((a, b) => a.ci - b.ci)
    vis.forEach((n) => {
      if (n.main !== false) return
      const left = vis.filter((x) => x.ci < n.ci && x.main !== false)
      const prev = left[left.length - 1]
      if (!prev) return
      const y = LANE_Y[li] + NODE_DY + NODE_H / 2
      const x1 = prev.x + LANE_W
      const x2 = n.x
      if (x2 - x1 < 8) return
      out.push({ id: `b${idx++}`, d: `M${x1} ${y} H${x2 - 2}`, dash: true })
    })
  })

  return out.map((p) => {
    const L = pathLen(p.d)
    const seg = Math.max(8, L * 0.24)
    return { ...p, L, seg, dur: Math.max(2.6, +(L / 160).toFixed(1)) }
  })
})

/* ⭐ 连线强制重建：只看 computed 的引用变化不可靠（<use> 引用的 <path> 是复用的），
   用节点开关状态拼一个 key，任何模块启停都会重建整组连线 */
const wireKey = computed(() =>
  visibleNodes.value.map((n) => n.uid + (n.enabled ? '1' : '0')).join('|')
)

const arrowH = (x, y) => `M${x - 9} ${y - 4.2} L${x + 1} ${y} L${x - 9} ${y + 4.2} Z`
const arrowV = (x, y) => `M${x - 4.2} ${y - 9} L${x} ${y + 1} L${x + 4.2} ${y - 9} Z`

/* ============ 抽屉 ============ */
const drawer = ref(false)
const active = ref(null)
const saving = ref(false)
const preLoading = ref(false)
const form = ref({})

const FIELDS = {
  payout: [
    { key: 'method', label: '默认付款方式', ph: '银行转账 / 现金' },
    { key: 'note', label: '默认备注', ph: '选填' },
  ],
  report: [
    { key: 'caliber', label: '统计口径', ph: 'waybill / vehicle' },
  ],
  recurring: [
    { key: 'pattern', label: '默认周期', ph: '每天 / 每周一' },
  ],
  waybill: [],
  route: [],
}

function openNode(n) {
  const def = n.module ? { ...n } : { ...n, module: null }
  active.value = {
    ...def,
    desc: n.module ? undefined : '流程步骤，随运单模块启停',
    foldedBy: moduleFlags.folded?.[n.module] || [],
    fields: n.module ? (FIELDS[n.module] || []) : [],
    canToggle: canToggle(n),
    configured: n.module ? isConfigured(n.module) : false,
  }
  form.value = n.module ? { ...(moduleFlags.config?.[n.module] || {}) } : {}
  drawer.value = true
}

function openBase(b) {
  active.value = {
    ...b, module: null, interactive: false,
    desc: b.desc, foldedBy: [], fields: [],
  }
  form.value = {}
  drawer.value = true
}

const moduleName = (k) => LANES.flatMap((l) => l.nodes).find((n) => n.module === k)?.name || k

/* ============ 影响预览：这个模块关掉会卡住多少单 ============ */
const countBy = async (status, extra) => {
  const owner = moduleOwner(user)
  if (!owner) return 0
  try {
    let q = supabase.from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('owner_account', owner)
      .eq('status', status)
    if (extra) q = extra(q)
    const { count } = await q
    return count || 0
  } catch (e) {
    return 0
  }
}

/**
 * 关掉某模块的后果。
 * ⭐ 关键：运单关掉后财务端进不去，在途的待审/待付款单会「卡在那里没人能处理」，
 *    必须让操作者当场看到这个数字，而不是事后解释。
 */
async function impactOf(moduleKey) {
  if (moduleKey === 'waybill') {
    const [audit, pay] = await Promise.all([
      countBy('审核中'),
      countBy('待打款', (q) => q.eq('pay_required', true)),
    ])
    const lines = []
    lines.push('关闭后：车队运营报告、费用 4 项、路线、司机端全部消失')
    if (audit || pay) {
      lines.push(`⚠️ 当前还有 ${audit} 笔待审、${pay} 笔待付款——关闭后财务端进不去，这些单会卡住`)
    } else {
      lines.push('当前没有待处理的费用单，可以安全关闭')
    }
    lines.push('历史数据不会删除，重新开启后原配置保留')
    return lines
  }
  if (moduleKey === 'payout') {
    const pay = await countBy('待打款', (q) => q.eq('pay_required', true))
    const lines = ['关闭后：付款登记入口消失，费用单停在「待打款」不再往下走']
    if (pay) lines.push(`⚠️ 当前有 ${pay} 笔待付款，关闭后无法登记`)
    lines.push('重新开启后这些单会回到待登记')
    return lines
  }
  if (moduleKey === 'report') {
    return ['关闭后：车队运营报告入口消失（数据本身不受影响）', '重新开启即恢复']
  }
  if (moduleKey === 'recurring') {
    return ['关闭后：常驻任务入口消失，已生成的运单不受影响', '重新开启即恢复']
  }
  return ['关闭后该功能入口消失', '历史数据不会删除']
}

async function toggleModule(node) {
  if (!isAdmin) return
  const turningOff = node.enabled
  if (turningOff) {
    /* ⭐ 影响预览：先算清会卡住多少单，再让操作者确认 */
    preLoading.value = true
    let lines = []
    try {
      lines = await impactOf(node.module)
    } finally {
      preLoading.value = false
    }
    const html = `<div style="line-height:1.9;font-size:13px;color:#334155">`
      + lines.map((t) => `<div${t.startsWith('⚠️') ? ' style="color:#A00D24;font-weight:600"' : ''}>${t}</div>`).join('')
      + `</div>`
    try {
      await ElMessageBox.confirm(html, `停用「${node.name}」`, {
        type: 'warning',
        dangerouslyUseHTMLString: true,
        confirmButtonText: '我已了解，确认停用',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger',
      })
    } catch { return }
  }
  saving.value = true
  try {
    const next = !node.enabled
    await setModuleFlag(node.module, next, user)

    /* ⭐ 兜底：setModuleFlag 内部会 force 重读一次，但重读可能受 RLS / 缓存影响
       没拿到最新值 → 界面看着开关拨了、连线却没变。
       这里本地强制同步一次，保证「开启后线一定连上」。 */
    if (moduleFlags.effective[node.module] !== next) {
      console.warn('[画布] 重读模块状态未生效，本地兜底同步', node.module, next)
      const intent = { ...(moduleFlags.intent || {}), [node.module]: next }
      moduleFlags.intent = intent
      moduleFlags.effective = foldDeps(intent)
      MODULES_FOR_FLAGS.forEach((m) => {
        if (m.key in moduleFlags) moduleFlags[m.key] = moduleFlags.effective[m.key] === true
      })
    }

    ElMessage.success(node.enabled ? '已停用' : '已开通')
    drawer.value = false
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function saveConfig(node) {
  saving.value = true
  try {
    await setModuleConfig(node.module, form.value, user)
    ElMessage.success('参数已保存')
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function reload() {
  await ensureModuleFlags(user, { force: true })
  ElMessage.success('已刷新')
}

onMounted(async () => {
  await ensureModuleFlags(user)
})
</script>

<style scoped>
.flow-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #F5F7FA;
}

/* 工具条 */
.flow-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  background: #fff;
  border-bottom: 1px solid #EEF1F5;
}
.fb-left { display: flex; align-items: baseline; gap: 10px; }
.fb-left h2 { margin: 0; font-size: 15px; font-weight: 800; color: #0F172A; }
.fb-sub { font-size: 11.5px; color: #94A3B8; }
.fb-right { display: flex; align-items: center; gap: 10px; }
.fb-warn {
  font-size: 11px; color: #B45309; background: #FEF3C7;
  padding: 3px 9px; border-radius: 5px;
}
.fb-hint {
  font-size: 11px; color: #94A3B8;
  background: #F5F8FB; border-radius: 5px; padding: 3px 8px;
  white-space: nowrap;
}
.zoom {
  display: flex; align-items: center; gap: 2px;
  border: 1px solid var(--line2, #E6ECF3); border-radius: 7px; overflow: hidden;
  background: #fff;
}
.z-btn {
  border: none; background: transparent; cursor: pointer;
  width: 26px; height: 26px; line-height: 1;
  font-size: 15px; color: #64748B;
}
.z-btn:hover { background: #F5F8FB; color: #0F172A; }
.z-val {
  min-width: 42px; text-align: center; cursor: pointer;
  font-size: 11.5px; font-family: var(--num, monospace);
  font-variant-numeric: tabular-nums; color: #475569;
}
.z-val:hover { color: #C8102E; }
.z-fit {
  border: none; border-left: 1px solid #EEF1F6; background: transparent;
  cursor: pointer; height: 26px; padding: 0 10px;
  font-size: 11.5px; color: #64748B;
}
.z-fit:hover { background: #F5F8FB; color: #0F172A; }

.flow-alert {
  flex: 0 0 auto;
  padding: 8px 18px; font-size: 11.5px; color: #92400E;
  background: #FFFBEB; border-bottom: 1px solid #FDE68A;
}
.flow-alert code {
  background: rgba(0,0,0,.05); padding: 1px 5px; border-radius: 3px;
  font-family: Consolas, monospace;
}

/* 画布滚动区 */
.flow-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
  /* 画布固定 1240 宽，窗口窄时要横向滚。macOS 默认隐藏滚动条，
     这里常驻一条，用户才知道右边还有内容 */
  scrollbar-width: thin;
  scrollbar-color: #CBD5E1 #F1F5F9;
}
.flow-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
.flow-scroll::-webkit-scrollbar-track { background: #F1F5F9; border-radius: 5px; }
.flow-scroll::-webkit-scrollbar-thumb {
  background: #CBD5E1; border-radius: 5px; border: 2px solid #F1F5F9;
}
.flow-scroll::-webkit-scrollbar-thumb:hover { background: #94A3B8; }
.flow-scroll::-webkit-scrollbar-corner { background: #F1F5F9; }
.canvas-scaler {
  position: relative;
  margin: 0 auto;
}
.flow-canvas {
  position: relative;
  width: 1240px;
  height: 480px;
  transform-origin: top left;
  background: #FDFEFF;
  border: 1px solid #E2E8F0;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 12px 34px rgba(15, 23, 42, .08);
}

.bg-grid { position: absolute; inset: 0; z-index: 0; }

/* 左栏 */
.base-col {
  position: absolute;
  left: 0; top: 0;
  width: 240px;
  padding: 16px 14px;
  background: #F6F9FE;
  border-right: 1px dashed #DCE3EA;
  z-index: 3;
}
.bc-hd { display: flex; align-items: center; gap: 7px; }
.bc-t { font-size: 11.5px; font-weight: 800; color: #334155; }
.bc-tag {
  font-size: 8.5px; font-weight: 800; color: #1D4ED8;
  background: #EFF6FF; border-radius: 4px; padding: 1px 5px;
}
.bc-sub { margin: 4px 0 10px; font-size: 8.6px; color: #A9B4C2; line-height: 1.5; }

.bc-card {
  position: relative;
  margin-bottom: 8px;
  padding: 10px 12px 10px 14px;
  background: #fff;
  border: 1px solid #E4EBF3;
  border-radius: 12px;
  cursor: pointer;
  box-shadow: 0 1.5px 5px rgba(15, 23, 42, .05);
  transition: box-shadow .16s, transform .16s;
}
.bc-card:hover { box-shadow: 0 5px 16px rgba(15, 23, 42, .09); transform: translateY(-1px); }
.bc-card::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4.2px;
  background: var(--bar); border-radius: 12px 0 0 12px;
}
.bc-name { font-size: 11px; font-weight: 800; color: #0F172A; }
.bc-desc { font-size: 8.2px; color: #8A98AA; margin-top: 3px; }
.bc-chips { display: flex; gap: 4px; margin-top: 7px; flex-wrap: wrap; }
.bc-chips span {
  font-size: 7.8px; color: #64748B; background: #F7F9FC;
  border: 1px solid #E9EEF5; border-radius: 4px; padding: 1px 5px;
}

.bc-divider { margin: 14px 0 10px; border-top: 1px dashed #E2E8F0; }
.bc-pool-t { font-size: 9px; font-weight: 800; color: #94A3B8; margin-bottom: 7px; }
.bc-pool-item {
  font-size: 9.5px; font-weight: 600; color: #9AA5B4;
  background: #F2F6FA; border: 1px dashed #E5EBF2; border-radius: 7px;
  padding: 6px 10px; margin-bottom: 6px;
}
.bc-pool-hint { font-size: 8.4px; color: #B4BECB; line-height: 1.6; margin-top: 10px; }

/* 泳道 */
.lane-band {
  position: absolute;
  left: 248px; right: 14px;
  height: 92px;
  border-radius: 10px;
  z-index: 1;
}
.lane-hd {
  position: absolute;
  display: flex; align-items: center; gap: 6px;
  font-size: 10px; font-weight: 800; color: #475569;
  z-index: 4;
}
.lane-hd i { width: 3px; height: 10px; border-radius: 1.5px; }

.wires { position: absolute; inset: 0; z-index: 2; pointer-events: none; }

/* 节点 */
.fnode {
  position: absolute;
  background: #fff;
  border: 1px solid #E5ECF4;
  border-radius: 12px;
  padding: 9px 12px 8px 14px;
  cursor: pointer;
  z-index: 5;
  box-shadow: 0 1.5px 6px rgba(15, 23, 42, .07);
  transition: box-shadow .16s, transform .16s, border-color .16s;
  overflow: hidden;
}
.fnode:hover { box-shadow: 0 6px 18px rgba(15, 23, 42, .11); transform: translateY(-1px); }
.fnode .bar {
  position: absolute; left: 0; top: 0; bottom: 0; width: 4.2px;
  background: var(--bar);
}
.fnode .fn-t {
  display: flex; align-items: center; gap: 5px;
  font-size: 12px; font-weight: 800; letter-spacing: -.2px; color: #0F172A;
  padding-right: 20px;
}
.fnode .fn-t em {
  font-size: 7.4px; font-style: normal; font-weight: 600;
  color: #B0BBC8; letter-spacing: 0;
}
.fnode .fn-c { display: flex; gap: 5px; margin-top: 6px; flex-wrap: wrap; }
.fnode .fn-c span {
  font-size: 8.4px; color: #64748B; background: #F7F9FC;
  border: 1px solid #E9EEF5; border-radius: 5px; padding: 1px 6px;
}
/* 未开启的警示：放在标题前面，跟着标题走，不受定位影响 */
.fnode .fn-warn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin-right: 5px;
  border-radius: 50%;
  background: #C8102E;
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  vertical-align: middle;
  flex: 0 0 auto;
  animation: warnPulse 2.4s ease-in-out infinite;
}
@keyframes warnPulse {
  0%, 100% { box-shadow: 0 0 0 2.5px rgba(200, 16, 46, .16); }
  50% { box-shadow: 0 0 0 5px rgba(200, 16, 46, .05); }
}

.fnode .fn-menu {
  position: absolute; right: 10px; top: 13px;
  display: flex; gap: 2.4px;
}
.fnode .fn-menu i { width: 3px; height: 3px; border-radius: 50%; background: #BCC7D5; }
.fnode .fn-dot {
  position: absolute; right: 12px; top: 15px;
  width: 6px; height: 6px; border-radius: 50%;
  background: #22C55E;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, .14);
}

/* 未开通 */
.fnode.ghost {
  background: #FCFDFE;
  border-style: dashed;
  border-color: #CFD9E4;
  box-shadow: none;
}
.fnode.ghost .bar { background: #CBD5E1; }
.fnode.ghost .fn-t { color: #94A3B8; }
.fnode.ghost .fn-c span { color: #B4BECB; background: #FBFCFE; border-color: #F0F4F9; }

/* 抽屉 */
.drawer-body { padding: 4px 2px; }
.db-hd { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 18px; }
.db-bar { width: 4px; align-self: stretch; border-radius: 2px; min-height: 34px; }
.db-name { font-size: 14px; font-weight: 800; color: #0F172A; }
.db-desc { font-size: 11px; color: #94A3B8; margin-top: 3px; line-height: 1.6; }
.db-sec { margin-bottom: 20px; }
.db-label {
  font-size: 11px; font-weight: 800; color: #475569;
  margin-bottom: 8px; padding-left: 8px; position: relative;
}
.db-label::before {
  content: ''; position: absolute; left: 0; top: 2px;
  width: 3px; height: 10px; border-radius: 2px; background: #C8102E;
}
.db-state {
  background: #F8FAFC; border: 1px solid #EDF1F6;
  border-radius: 9px; padding: 10px 12px;
}
.db-state span { font-size: 12px; font-weight: 800; color: #15803D; }
.db-state.off span { color: #B45309; }
.db-state em {
  display: block; font-style: normal; font-size: 10px;
  color: #94A3B8; margin-top: 4px; line-height: 1.6;
}
.db-alert {
  font-size: 11px; color: #92400E; background: #FFFBEB;
  border: 1px solid #FDE68A; border-radius: 8px; padding: 9px 11px; line-height: 1.7;
}
.db-locked {
  display: flex; align-items: flex-start; gap: 9px;
  padding: 11px 12px; border-radius: 9px;
  background: #F8FAFC; border: 1px dashed #DCE3EC;
}
.db-locked .el-icon { color: #94A3B8; margin-top: 2px; }
.db-locked b { font-size: 12px; color: #64748B; }
.db-locked p { margin: 3px 0 0; font-size: 10.5px; color: #A9B4C2; line-height: 1.6; }

.bc-pool-item.can-open { color: #1D4ED8; border-color: #BFDBFE; background: #F5F9FF; }
.bc-pool-item em {
  font-style: normal; font-size: 8.5px; font-weight: 700;
  background: #DBEAFE; color: #1D4ED8; border-radius: 4px;
  padding: 0 5px; margin-left: 6px;
}

.db-hint { font-size: 10px; color: #A9B4C2; line-height: 1.7; margin-top: 8px; }
.db-field { margin-bottom: 10px; }
.db-field label { display: block; font-size: 10.5px; color: #64748B; margin-bottom: 4px; }
</style>
