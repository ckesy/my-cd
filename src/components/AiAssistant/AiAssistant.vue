<template>
  <Teleport to="body">
    <!-- ===== 浮球 ===== -->
    <Transition name="ai-fab">
    <button
      v-if="!open"
      ref="ballEl"
      class="ai-ball"
      :title="agentTitle"
      @click="toggle(true)"
    >
      <span class="halo"></span>
      <span v-if="todoCount > 0" class="bubble" :class="{ pill: todoCount > 9 }">
        {{ todoCount > 99 ? '99+' : todoCount }}
      </span>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="9.6" r="3.4" stroke="#fff" stroke-width="1.5" />
        <path d="M5 19.8c0-3.3 3.1-5.4 7-5.4s7 2.1 7 5.4" stroke="#fff" stroke-width="1.5" stroke-linecap="round" />
        <path d="M6 9.6a6 6 0 0 1 12 0" stroke="#fff" stroke-width="1.2" opacity=".65" stroke-linecap="round" />
        <circle cx="6" cy="10.2" r="1.05" fill="#fff" opacity=".65" />
        <circle cx="18" cy="10.2" r="1.05" fill="#fff" opacity=".65" />
      </svg>
    </button>
    </Transition>

    <!-- ===== 抽屉面板 ===== -->
    <Transition name="ai-panel">
    <aside v-if="open" ref="panelEl" class="ai-panel" :style="{ width: panelW + 'px' }" role="dialog" aria-label="车队助手">
      <!-- 左边缘拖拽把手：只改宽度，不改布局；双击复位 -->
      <div
        class="rz-handle"
        :class="{ on: resizing }"
        title="拖动调整宽度 · 双击复位"
        @mousedown.prevent="onResizeStart"
        @dblclick="resetPanelW"
      ></div>
      <header class="p-head">
        <div class="avatar">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="9.6" r="3.4" stroke="#fff" stroke-width="1.5" />
            <path d="M5 19.8c0-3.3 3.1-5.4 7-5.4s7 2.1 7 5.4" stroke="#fff" stroke-width="1.5" stroke-linecap="round" />
            <path d="M6 9.6a6 6 0 0 1 12 0" stroke="#fff" stroke-width="1.2" opacity=".65" stroke-linecap="round" />
            <circle cx="6" cy="10.2" r="1.05" fill="#fff" opacity=".65" />
            <circle cx="18" cy="10.2" r="1.05" fill="#fff" opacity=".65" />
          </svg>
        </div>
        <div class="who">
          <div class="n">{{ agentTitle }}</div>
          <div class="s" :class="{ off: !hasToken }"><i></i>{{ hasToken ? '在线' : '未连接' }}</div>
        </div>
        <div class="spacer"></div>
        <button class="ico" title="清空对话" @click="reset">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <button class="ico" title="关闭" @click="toggle(false)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
          </svg>
        </button>
      </header>

      <div ref="scroller" class="p-body">
        <!-- 未建立会话：引导重新登录（凭证只在登录成功那一刻签发） -->
        <div v-if="!hasToken" class="setup">
          <div class="setup-card">
            <div class="st-title">还没连上</div>
            <div class="st-desc">
              助手需要一张<b>登录时签发</b>的会话凭证，本地没有这张凭证，所以先连不上。
              重新登录一次即可恢复，<b>之前的对话记录会保留</b>。
            </div>
            <button class="st-btn" @click="relogin">去登录</button>
          </div>
        </div>

        <!-- 空态 -->
        <div v-else-if="!messages.length" class="empty">
          <div class="hi">{{ agentGreeting }}</div>
          <div class="chips">
            <button v-for="s in agentSuggestions" :key="s" class="chip" @click="send(s)">{{ s }}</button>
          </div>
        </div>

        <div
          v-for="m in messages"
          :key="m.id"
          class="msg"
          :class="{ me: m.role === 'user' }"
        >
          <div v-if="m.role === 'ai'" class="msg-av">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="9.6" r="3.6" stroke="#fff" stroke-width="2" />
              <path d="M4.6 20.2c0-3.5 3.3-5.7 7.4-5.7s7.4 2.2 7.4 5.7" stroke="#fff" stroke-width="2" stroke-linecap="round" />
            </svg>
          </div>
          <div class="col">
            <!-- 思考中 -->
            <div v-if="m.loading" class="bub thinking">
              <span class="dots"><i></i><i></i><i></i></span>
              <span>{{ m.hint || '正在查…' }}</span>
            </div>

            <!-- 导航结果 -->
            <template v-else-if="m.nav && m.nav.length">
              <div class="bub">这几个页面可能是你要的：</div>
              <div class="navlist">
                <button v-for="n in m.nav" :key="n.path" class="navitem" @click="goto(n.path)">
                  <span class="nt">{{ n.label }}</span>
                  <span class="nd">{{ n.desc }}</span>
                  <span class="na">带我去</span>
                </button>
              </div>
            </template>

            <!-- 普通文本 -->
            <template v-else>
              <div v-if="m.text" class="bub" :class="{ err: m.error }">{{ m.text }}</div>
              <AiMessageCard
                v-for="(c, i) in m.cards"
                :key="i"
                :card="c"
                @navigate="onNavigate"
                @redraft="onRedraft($event, m, i)"
                @open-entity="onOpenEntity"
                @create="onCreateDraft"
              />
            </template>

            <div class="time">{{ m.time }}</div>
          </div>
        </div>
      </div>

      <footer class="p-foot">
        <!-- 未连接时给一条明确的出路：先静默重连（设备凭证还在就无感恢复），
             不行再引导重新登录。只靠输入框的 placeholder 提示，用户无路可走。 -->
        <div v-if="!hasToken" class="reconnect-bar">
          <span class="grow">{{ reconnectTip || '助手未连接' }}</span>
          <button :disabled="reconnecting" @click="tryReconnect">
            {{ reconnecting ? '连接中…' : '重新连接' }}
          </button>
          <button class="primary" @click="relogin">去登录</button>
        </div>
        <!-- 自检行：连不上时把关键状态摆出来，排障不用翻控制台 -->
        <div v-if="!hasToken && diag" class="diag-line">{{ diag }}</div>
        <!-- 语音提示行：Web 端暂不接识别，只用一行字把人引到「打字 / 去小程序」
             口径来源：2026-11-27 设计稿「Web 只换图标、不接识别」。
             ⚠️ 不用 ElMessage 弹窗：提示要贴着输入框，用户才知道下一步做什么。 -->
        <div v-if="micHint" class="mic-hint">
          <span class="bar"></span>{{ micHint }}
        </div>
        <div class="inputbox">
          <button
            type="button"
            class="mic"
            :class="{ hot: !!micHint }"
            :disabled="!hasToken"
            aria-label="语音输入（小程序端可用）"
            @click="onMicTap"
          >
            <span class="wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
          </button>
          <textarea
            ref="inputEl"
            v-model="draft"
            rows="1"
            :placeholder="hasToken ? `问${agentName}点什么…` : '未连接，请先重新登录'"
            :disabled="sending || !hasToken"
            @keydown.enter.exact.prevent="send()"
            @input="autoGrow"
          ></textarea>
          <button class="send" :disabled="sending || !hasToken || !draft.trim()" @click="send()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h13M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
        <div class="tip">小御陪伴您每一天</div>
      </footer>
    </aside>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onErrorCaptured, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { AI_AGENT, AI_STORAGE, AI_SUGGESTIONS } from '@/config/aiConstants'
import { askAi, redraftDraft, getAiToken, setAiToken, setAiDevice, clearAiToken, resumeAiToken, ensureAiToken } from '@/utils/aiClient'
import { matchPage, looksLikeNav } from '@/utils/aiPageIndex'
import { routeOfField, withFromAi } from '@/config/aiEntityRoutes'
import { deriveMissing, normalizeMissing, emitAiDraft } from '@/utils/aiDraftMissing'
import AiMessageCard from './AiMessageCard.vue'

const emit = defineEmits(['toggle'])
const router = useRouter()

/* ============================================================
   外部常量一律做兜底
   ------------------------------------------------------------
   曾经出现过「Cannot read properties of undefined (reading 'title')」：
   模板里直接写 AI_AGENT.title，一旦模块解析拿到 undefined 就整个面板崩，
   再把 Dashboard 带走变白屏。助手是增强功能，不该有这种杀伤力。
   ============================================================ */
const AGENT = (AI_AGENT && typeof AI_AGENT === 'object') ? AI_AGENT : {}
const agentTitle = AGENT.title || 'AI 智能助理'
const agentName = AGENT.name || '助手'
const agentGreeting = AGENT.greeting || '有什么可以帮你？'
const agentSuggestions = Array.isArray(AI_SUGGESTIONS) ? AI_SUGGESTIONS : []
const PANEL_KEY = (AI_STORAGE && AI_STORAGE.PANEL_OPEN) || 'ai_panel_open'
const CHAT_KEY_BASE = (AI_STORAGE && AI_STORAGE.CHAT) || 'ai_chat_history'

const open = ref(false)
const draft = ref('')
const messages = ref([])
const sending = ref(false)
const todoCount = ref(0)
const hasToken = ref(!!getAiToken())
const scroller = ref(null)
const inputEl = ref(null)

let seq = 0
let timer = null

/* ---------------- 当前用户与权限 ---------------- */
const currentUser = () => {
  try { return JSON.parse(localStorage.getItem('currentUser') || '{}') } catch (e) { return {} }
}

const hasPerm = (key) => {
  const u = currentUser()
  if (!u || !key) return false
  if (u.isAdmin || u.role === 'admin') return true
  const perms = (u.permissions && u.permissions.client) || []
  return Array.isArray(perms) && perms.includes(key)
}

/* ---------------- 待办角标 ---------------- */
/**
 * 直接复用 feeTodo 的口径（同源），不另写一套判定。
 * 失败静默：角标拿不到不影响对话。
 */
async function loadTodo() {
  try {
    const { fetchFeeTodo } = await import('@/utils/feeTodo')
    const u = currentUser()
    if (!u || !u.account) return
    const r = await fetchFeeTodo(u)
    todoCount.value = Number(r.approve || 0) + Number(r.pay || 0)
  } catch (e) {
    /* 角标失败不打扰用户 */
  }
}

/* ---------------- 面板开关 ---------------- */
function toggle(v) {
  open.value = v === undefined ? !open.value : !!v
  hasToken.value = !!getAiToken()
  refreshDiag()
  try { localStorage.setItem(PANEL_KEY, open.value ? '1' : '0') } catch (e) { /* 忽略 */ }
  emit('toggle', open.value)
  if (open.value) {
    loadTodo()
    /* ⭐ 打开就停在最新一条：v-if 渲染完才有 DOM，所以放 nextTick 里。
       不这么做的话每次打开都回到最早那句，用户得自己滚到底。 */
    nextTick(() => {
      scrollBottom()
      if (inputEl.value) inputEl.value.focus()
    })
  }
}

/**
 * 重新登录
 * ⚠️ 必须清掉 currentUser —— 凭证只能靠重新输密码换取，不清的话登录页会直接放行，
 *    用户会以为"点了没反应"。
 */
function relogin() {
  clearAiToken()
  try {
    localStorage.removeItem('currentUser')
    localStorage.removeItem('originalUser')
  } catch (e) { /* 忽略 */ }
  open.value = false
  try { router.push('/') } catch (e) { window.location.href = '/' }
}

/**
 * 静默重连：凭设备凭证换一张新 token（不需要密码）。
 * 场景：token 被清 / 被别处的 renew 轮换掉 / 页面放久了 —— 只要设备凭证还在就能自愈。
 * 设备凭证也没了（登录时签发失败就从没种下过）→ 就地要一次密码补发，
 * 不让用户为了一个助手跑一整遍退出再登录。
 */
const reconnecting = ref(false)
/* 登录时签发失败的原因（LoginView 写进 ai_last_error），面板直接把原因摆出来，
   用户不用去翻控制台才知道为什么连不上 */
const reconnectTip = ref((() => {
  try { return localStorage.getItem('ai_last_error') || '' } catch (e) { return '' }
})())

const currentAccount = () => {
  try {
    const u = JSON.parse(localStorage.getItem('currentUser') || 'null') || {}
    return String(u.account || '')
  } catch (e) { return '' }
}

const diag = ref('')

function refreshDiag() {
  try {
    const t = !!localStorage.getItem('ai_session_token')
    const d = !!localStorage.getItem('ai_device_key')
    const a = localStorage.getItem('ai_session_account') || '—'
    const c = currentAccount() || '—'
    const e = localStorage.getItem('ai_last_error') || '—'
    diag.value = `令牌${t ? '有' : '无'} · 设备${d ? '有' : '无'} · 归属${a} · 当前${c} · 上次${e}`
  } catch (err) { diag.value = '' }
}

async function tryReconnect() {
  if (reconnecting.value) return
  reconnecting.value = true
  reconnectTip.value = ''
  try {
    /* ① 免密续签 */
    const r = await resumeAiToken()
    if (r.ok && getAiToken()) { hasToken.value = true; return }

    /* ② 设备凭证不可用 → 就地输一次密码补发 */
    const acc = currentAccount()
    if (!acc) {
      reconnectTip.value = '登录信息已失效，请点「去登录」重新登录'
      return
    }
    let pwd = ''
    try {
      const { value } = await ElMessageBox.prompt(
        `为「${acc}」获取助手会话凭证，输入该账号的登录密码即可，不影响当前登录状态。`,
        '连接助手',
        {
          confirmButtonText: '连接',
          cancelButtonText: '取消',
          inputType: 'password',
          inputPlaceholder: '请输入登录密码',
          inputValidator: (v) => (String(v || '').trim().length >= 4 ? true : '请输入密码'),
        }
      )
      pwd = String(value || '')
    } catch (e) {
      reconnectTip.value = '已取消连接'
      return
    }

    const r2 = await ensureAiToken(acc, pwd)
    hasToken.value = !!getAiToken()
    if (!r2.ok) reconnectTip.value = r2.message || '凭证获取失败，请确认密码'
  } catch (e) {
    reconnectTip.value = '连接异常，请稍后再试'
  } finally {
    reconnecting.value = false
    refreshDiag()
  }
}

/* ============================================================
   语音入口（Web 端：只做音波样式，不接识别）
   ------------------------------------------------------------
   口径来源：2026-11-27《小御语音输入设计稿》定稿 ——
   小程序走微信同声传译（端上直连）；Web 端先不接 ASR，
   等腾讯云「一句话识别」开通后再补，所以这里**没有**录音逻辑。
   为什么要留按钮而不是删掉：将来接 ASR 不改版式，`.mic.rec` 状态类已备好。
   ============================================================ */
const MIC_HINT_TEXT = '语音输入在小程序端可用；这里直接打字更快'
const MIC_HINT_MS = 3500
const micHint = ref('')
let micHintTimer = null

/**
 * 点音波按钮：出提示行 → 焦点交回输入框 → 3.5s 自动收起。
 * ⚠️ 三件事缺一不可：只弹提示用户不知道改去哪；只跳焦点用户不知道为什么没反应。
 */
function onMicTap() {
  if (!hasToken.value) return
  micHint.value = MIC_HINT_TEXT
  if (micHintTimer) clearTimeout(micHintTimer)
  micHintTimer = setTimeout(() => {
    micHint.value = ''
    micHintTimer = null
  }, MIC_HINT_MS)
  nextTick(() => {
    if (inputEl.value) inputEl.value.focus()
  })
}

function onKeydown(e) {
  const meta = e.metaKey || e.ctrlKey
  if (meta && String(e.key).toLowerCase() === 'j') {
    e.preventDefault()
    toggle()
  }
  if (e.key === 'Escape' && open.value) toggle(false)
}

/* ---------------- 消息 ---------------- */
const nowTime = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const scrollBottom = async () => {
  await nextTick()
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
}

/* ---------------- 对话持久化 ----------------
   刷新页面不该丢掉上下文。按账号分别存，换账号不会串。
   只留最近 20 条，卡片行数截到 12 行，超 300KB 直接不存（隐私模式也会抛）。 */
const chatKey = () => `${CHAT_KEY_BASE}:${currentUser().account || 'anon'}`

function persist() {
  try {
    const data = messages.value
      .filter((m) => !m.loading)
      .slice(-20)
      .map((m) => ({
        id: m.id,
        role: m.role,
        text: m.text || '',
        time: m.time || '',
        error: !!m.error,
        nav: m.nav || null,
        cards: (m.cards || []).map((c) => ({ ...c, rows: (c.rows || []).slice(0, 12) })),
      }))
    const s = JSON.stringify(data)
    if (s.length > 300000) {
      try { localStorage.removeItem(chatKey()) } catch (e) { /* 忽略 */ }
      return
    }
    localStorage.setItem(chatKey(), s)
  } catch (e) {
    /* 隐私模式 / 配额满：静默放弃，不影响对话 */
  }
}

function restore() {
  const key = chatKey()
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) {
      localStorage.removeItem(key)
      return
    }
    /* 逐条校验：localStorage 里可能是旧版本结构，直接塞进渲染会抛错 →
       子组件渲染错误会让整个 Dashboard 白屏。 */
    const safe = arr
      .filter((m) => m && typeof m === 'object' && (m.text || m.nav || (Array.isArray(m.cards) && m.cards.length)))
      .map((m) => ({
        id: Number(m.id) || 0,
        role: m.role === 'user' ? 'user' : 'ai',
        text: typeof m.text === 'string' ? m.text : '',
        time: typeof m.time === 'string' ? m.time : '',
        error: !!m.error,
        nav: Array.isArray(m.nav) ? m.nav : null,
        cards: (Array.isArray(m.cards) ? m.cards : []).filter(
          (c) => c && typeof c === 'object' && c.type
        ),
      }))
    if (!safe.length) {
      localStorage.removeItem(key)
      return
    }
    messages.value = safe
    seq = safe.reduce((mx, x) => Math.max(mx, x.id || 0), 0)
  } catch (e) {
    /* 解析失败 → 直接清掉，避免每次刷新都崩在同一处 */
    try { localStorage.removeItem(chatKey()) } catch (e2) { /* 忽略 */ }
  }
}

const push = (m) => {
  const item = { id: ++seq, time: nowTime(), ...m }
  messages.value.push(item)
  scrollBottom()
  persist()
  return item
}

const reset = () => {
  messages.value = []
  try { localStorage.removeItem(chatKey()) } catch (e) { /* 忽略 */ }
  nextTick(() => inputEl.value && inputEl.value.focus())
}

const autoGrow = () => {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 96) + 'px'
}

/** 只取文本轮次作为上下文（卡片内容不回填，避免上下文膨胀） */
const historyOf = () => messages.value
  .filter((m) => !m.loading && m.text)
  .slice(-6)
  .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }))

/* ---------------- 发送 ---------------- */
async function send(preset) {
  const text = String(preset || draft.value || '').trim()
  if (!text || sending.value) return

  if (!hasToken.value) {
    push({ role: 'ai', text: '还没连上。点上面的「去登录」重登一次即可，对话记录不会丢。', error: true })
    return
  }

  draft.value = ''
  autoGrow()
  push({ role: 'user', text })

  /* ① 导航类问题：本地索引直接答，20ms 出结果，不过模型 */
  if (looksLikeNav(text)) {
    const hits = matchPage(text, hasPerm)
    if (hits.length) {
      const t = setTimeout(() => push({ role: 'ai', nav: hits }), 120)
      timer = t
      return
    }
  }

  /* ② 其余走模型 */
  sending.value = true
  const loading = push({ role: 'ai', loading: true, hint: '正在查…' })

  const res = await askAi({ text: captureSession(), history: historyOf() })

  /* 用返回结果替换 loading 那条 */
  const idx = messages.value.findIndex((m) => m.id === loading.id)
  if (idx >= 0) {
    messages.value[idx] = {
      id: loading.id,
      time: nowTime(),
      role: 'ai',
      text: res.ok ? res.answer : res.message,
      cards: res.ok ? res.cards : [],
      error: !res.ok,
    }
  }
  /* 凭证真的失效（重试 + 免密续签都没救回来）→ 同步把状态打到「未连接」，
     让输入框禁用、红卡出现，而不是只弹一条错误气泡却仍显示「在线」 */
  if (res.needLogin) hasToken.value = false

  sending.value = false
  persist()
  scrollBottom()
}

const captureSession = () => {
  try {
    const u = currentUser()
    return String(u.account || '') + '|' + new Date().toDateString()
  } catch (e) { return '' }
}

function goto(path) {
  if (!path) return
  try { router.push(path) } catch (e) { /* 忽略 */ }
}

function onNavigate(jump) {
  if (!jump || !jump.path) return
  /* ⚠️ 这里**不关闭面板**：用户要求跳转后助手继续留着，
     只有点 × 或点面板以外的地方才收起。 */
  const query = { ...(jump.query || {}), _t: Date.now() }
  router.push({ path: jump.path, query }).catch(() => {})
}

/* ============================================================
   面板宽度：可拖拽 + 本地记忆
   ------------------------------------------------------------
   ⚠️ 只存本地（ai_panel_w），不写 users 表 —— 宽度是设备偏好，
      笔记本和外接屏本来就不一样，跟着浏览器走更合理。
   ⚠️ 拖拽只改宽度，不动消息数组；SvgPlot 自带 ResizeObserver，
      图卡会跟着重画，不需要额外通知。
   ============================================================ */
const PANEL_W_KEY = 'ai_panel_w'
const PANEL_W_DEF = 412
const panelW = ref(PANEL_W_DEF)
const resizing = ref(false)
let rzStartX = 0
let rzStartW = PANEL_W_DEF

const clampW = (w) => {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const max = Math.max(360, Math.min(720, vw - 80))
  const n = Math.round(Number(w) || PANEL_W_DEF)
  return Math.max(360, Math.min(n, max))
}

const loadPanelW = () => {
  try {
    const raw = localStorage.getItem(PANEL_W_KEY)
    if (raw == null) return
    const n = Number(raw)
    if (Number.isFinite(n)) panelW.value = clampW(n)
  } catch (e) { /* 忽略 */ }
}
loadPanelW()

function onResizeStart(e) {
  resizing.value = true
  rzStartX = e.clientX
  rzStartW = panelW.value
  try { document.body.style.userSelect = 'none' } catch (err) { /* 忽略 */ }
}

function onResizeMove(e) {
  if (!resizing.value) return
  panelW.value = clampW(rzStartW - (e.clientX - rzStartX))
}

function onResizeEnd() {
  if (!resizing.value) return
  resizing.value = false
  try {
    document.body.style.userSelect = ''
    localStorage.setItem(PANEL_W_KEY, String(panelW.value))
  } catch (e) { /* 忽略 */ }
}

function resetPanelW() {
  panelW.value = PANEL_W_DEF
  try { localStorage.setItem(PANEL_W_KEY, String(PANEL_W_DEF)) } catch (e) { /* 忽略 */ }
}

/* ============================================================
   草稿卡：刷新 / 去建档 / 去建单页
   ============================================================ */

/** 刷新草稿：不走模型，只把上次参数重跑一遍，原地替换这张卡 */
async function onRedraft(payload, m, i) {
  const card = m && Array.isArray(m.cards) ? m.cards[i] : null
  if (!card || !card.params) return
  const patch = (payload && payload.patch) || {}
  const r = await redraftDraft({ draft: card.params, patch, sessionId: captureSession() })
  if (!r.ok) {
    ElMessage.warning(r.message || '刷新失败，稍后再试')
    return
  }
  const next = (r.cards || []).find((c) => c && c.type === 'draft')
  if (!next) return
  const msg = messages.value.find((x) => x.id === m.id)
  if (msg && Array.isArray(msg.cards)) {
    msg.cards[i] = next
    persist()
    scrollBottom()
  }
}

/**
 * 去对应档案页新建。
 * 优先开新标签（主窗口的对话和草稿卡原样保留）；被拦截时降级为同标签跳转，
 * 草稿参数存 sessionStorage，回来还能恢复。
 * ⚠️ 不要在 windowFeatures 里写 'noopener' —— 那样 window.open 一律返回 null，
 *    会把"正常打开"误判成"被拦截"。拿到引用后手动置 opener 即可。
 */
function onOpenEntity(e) {
  const def = routeOfField(e && e.key)
  if (!def) return
  const url = withFromAi(def.path)
  let win = null
  try { win = window.open(url, '_blank') } catch (err) { win = null }
  if (!win) {
    try {
      sessionStorage.setItem('ai_pending_draft', JSON.stringify({ key: e.key, at: Date.now() }))
    } catch (err) { /* 忽略 */ }
    ElMessage.info('已跳到档案页，建完回来自动恢复草稿')
    router.push(url).catch(() => {})
    return
  }
  try { win.opener = null } catch (err) { /* 跨域时忽略 */ }
  ElMessage.success(`已打开${def.label}档案，建完切回来点「刷新草稿」`)
}

/** 去建单页：草稿结构本来就是 cloneData，直接推过去预填 */
let creating = false
function onCreateDraft(card) {
  /* 防连点：用户在抽屉里连点两次会连着跳两次（上一版就出现过） */
  if (creating) return
  const cloneData = card && card.draft
  if (!cloneData) {
    ElMessage.warning('草稿数据缺失，请重新说一遍')
    return
  }
  creating = true
  setTimeout(() => { creating = false }, 1200)
  /* ⚠️ 不拦「没填完」：用户在页面上补比在抽屉里补顺手，
     未填的区块到建单页会闪三次提示。只有草稿本身没有数据才拦。 */
  /* 未填项：建单页据此闪三次 + 保持高亮 + 感叹号，直到填上。
     两个来源合并，缺一不可：
       ① 云函数 missing[]（level=block/confirm）—— 业务语义更准
       ② deriveMissing(cloneData) —— 按草稿结构自己算，卡片从历史恢复时 ① 可能丢了
     ⚠️ 必须塞进 cloneData（`_missing`）一起走 —— 只放 sessionStorage 的话，
        用户中途刷新页面就丢了，高亮和感叹号全没了。
     ⚠️ `_fromAi` 同理：fromAi 标记不能只靠 history.state 透传，
        实测它偶尔读不到 → 建单页判定成「普通新建」，提示全不出现。 */
  const miss = normalizeMissing([
    ...(Array.isArray(card.missing) ? card.missing : [])
      .filter((m) => m && (m.level === 'block' || m.level === 'confirm'))
      .map((m) => m.field),
    ...deriveMissing(cloneData),
  ])
  const payload = { ...cloneData, _missing: miss, _fromAi: true }

  /* ⭐ 双通道传参：
     ① history.state —— 首选，页面刷新即失效，不会污染下一次建单
     ② sessionStorage —— 兜底。实测只走 state 会出现「点了按钮、建单页全空」
     两条都写，建单页先读 state 再读这个。 */
  try {
    sessionStorage.setItem('ai_clone_data', JSON.stringify({ cloneData: payload, fromAi: true }))
    if (miss.length) sessionStorage.setItem('ai_missing_fields', JSON.stringify(miss))
    else sessionStorage.removeItem('ai_missing_fields')
  } catch (e) { /* 隐私模式可能写不进去，不影响 state 通道 */ }

  const target = '/waybill/create'
  const cur = router.currentRoute.value
  const onPage = !!(cur && cur.path === target)
  closePanel()

  /* ⭐ 已经在建单页：就地投递，不跳转、不重载。
     同路径 push 会被判成重复导航（组件不重新挂载、onMounted 不跑），
     以前用 location.assign 强刷绕过，会丢掉用户已填的内容。 */
  if (onPage) {
    if (emitAiDraft({ cloneData: payload, statedMiss: miss })) {
      ElMessage.success('已把草稿填到当前页面')
      return
    }
    /* 万一页面没接住（组件异常），退回强刷兜底，至少数据能填上 */
    window.location.assign(target)
    return
  }

  try {
    router.push({ path: target, state: { cloneData: payload, fromAi: true } })
  } catch (e) {
    router.push(target).catch(() => {})
  }
}

/** 统一收口：改状态 + 落本地 + 通知父级 */
function closePanel() {
  open.value = false
  try { localStorage.setItem(PANEL_KEY, '0') } catch (e) { /* 忽略 */ }
  emit('toggle', false)
}

/* ---------------- 点面板以外的地方收起 ----------------
   用 mousedown + 捕获阶段：比 click 早，也不会被页面里的 stopPropagation 挡掉。
   ⚠️ 不能给页面盖遮罩层 —— 那样用户得先关面板才能操作页面，多一次点击。 */
const panelEl = ref(null)
const ballEl = ref(null)

function onDocDown(e) {
  if (!open.value) return
  const t = e.target
  if (panelEl.value && panelEl.value.contains(t)) return
  if (ballEl.value && ballEl.value.contains(t)) return
  closePanel()
}

/* 错误边界：卡片渲染出错时只丢这一块，不能让整个 Dashboard 陪葬。
   （Vue 3 里子组件渲染抛错会向上冒泡，最终清空整棵树 → 白屏） */
onErrorCaptured((err, instance, info) => {
  console.error('[AiAssistant] 子组件渲染出错，已拦截：', info, err)
  return false
})

/**
 * 一次性令牌注入：地址栏带 ?ai_token=xxx 时写进本地并立刻抹掉参数。
 * 用途：本地/应急恢复 —— 不必重新输密码。
 * ⚠️ 写完必须 replaceState 去掉参数，否则会留在浏览器历史里。
 */
function takeTokenFromUrl() {
  try {
    const u = new URL(window.location.href)
    const tk = u.searchParams.get('ai_token')
    const dk = u.searchParams.get('ai_device')
    if (!tk || tk.length < 16) return false
    setAiToken(tk)
    /* 一并种下设备凭证：之后 token 再丢也能自动续，不用再麻烦用户 */
    if (dk && dk.length >= 16) setAiDevice(dk)
    u.searchParams.delete('ai_token')
    u.searchParams.delete('ai_device')
    window.history.replaceState({}, '', u.pathname + (u.search || '') + u.hash)
    return true
  } catch (e) {
    return false
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('mousedown', onDocDown, true)
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', onResizeEnd)

  /* ① 地址栏注入 → ② 设备凭证免密续签 → ③ 都没有才引导登录
     token 被清（换设备、清缓存、浏览器策略）时自动恢复，用户无感。 */
  takeTokenFromUrl()
  if (!getAiToken()) {
    const r = await resumeAiToken()
    if (!r.ok) console.info('[AI] 免密续签未成功：', r.message)
  }
  hasToken.value = !!getAiToken()
  refreshDiag()
  restore()
  try {
    if (localStorage.getItem(PANEL_KEY) === '1') toggle(true)
  } catch (e) { /* 忽略 */ }
  loadTodo()
  /* 5 分钟刷一次角标，够用且不打扰 */
  timer = setInterval(loadTodo, 5 * 60 * 1000)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('mousedown', onDocDown, true)
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
  if (timer) clearInterval(timer)
  if (micHintTimer) { clearTimeout(micHintTimer); micHintTimer = null }
})

defineExpose({ toggle, open })
</script>

<style scoped>
/* ===== 浮球 ===== */
.ai-ball {
  position: fixed;
  right: 24px;
  bottom: 24px;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  border: none;
  background: var(--brand-primary, #c8102e);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 3000;
  box-shadow: 0 6px 18px -4px rgba(200, 16, 46, 0.45), 0 2px 6px rgba(200, 16, 46, 0.2);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.ai-ball:hover {
  transform: scale(1.06);
  box-shadow: 0 10px 26px -6px rgba(200, 16, 46, 0.56), 0 3px 8px rgba(200, 16, 46, 0.24);
}
.ai-ball:active { transform: scale(0.97); }
.ai-ball svg { width: 29px; height: 29px; }
.ai-ball .halo {
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  border: 1.5px solid var(--brand-primary, #c8102e);
  opacity: 0.18;
  pointer-events: none;
}
.ai-ball .bubble {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background: #fff;
  border: 1.5px solid var(--brand-primary, #c8102e);
  color: var(--brand-primary, #c8102e);
  font-size: 10.5px;
  font-weight: 700;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-variant-numeric: tabular-nums;
}
.ai-ball .bubble.pill { padding: 0 5px; }

/* ===== 面板 ===== */
.ai-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 412px;
  max-width: 100vw;
  background: #fff;
  border-left: 1px solid var(--line2, #e3e8ef);
  display: flex;
  flex-direction: column;
  z-index: 3001;
  box-shadow: -12px 0 32px -18px rgba(15, 23, 42, 0.22);
}

/* ===== 左边缘拖拽把手 =====
   静默时完全透明（不打扰视觉），悬停/拖拽中才显形；
   宽度由 :style 绑定的 panelW 控制，这里是热区。 */
.rz-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 9px;
  z-index: 4;
  cursor: col-resize;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rz-handle::before {
  content: "";
  width: 3px;
  height: 42px;
  border-radius: 2px;
  background: transparent;
  transition: background 0.14s ease, height 0.14s ease;
}
.rz-handle:hover::before,
.rz-handle.on::before {
  background: #c8102e;
  height: 62px;
}

/* ===== 展开 / 收起动画 =====
   面板整幅从右侧滑入滑出；浮球缩放淡入淡出（回弹一点更有生气）。
   ⚠️ 用 <Transition> 而不是 CSS animation：v-if 会立刻销毁节点，
      只有 transition 类才能拿到「离场」时机。 */
.ai-panel-enter-active {
  transition: transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.24s ease;
}
.ai-panel-leave-active {
  transition: transform 0.22s cubic-bezier(0.4, 0, 1, 1), opacity 0.18s ease;
}
.ai-panel-enter-from,
.ai-panel-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.ai-fab-enter-active {
  transition: transform 0.26s cubic-bezier(0.34, 1.45, 0.64, 1), opacity 0.2s ease;
}
.ai-fab-leave-active {
  transition: transform 0.16s ease-in, opacity 0.16s ease-in;
}
.ai-fab-enter-from,
.ai-fab-leave-to {
  transform: scale(0.5);
  opacity: 0;
}

/* 系统里开了「减弱动态效果」就不动，避免前庭不适 */
@media (prefers-reduced-motion: reduce) {
  .ai-panel-enter-active,
  .ai-panel-leave-active,
  .ai-fab-enter-active,
  .ai-fab-leave-active {
    transition: opacity 0.12s linear;
  }
  .ai-panel-enter-from,
  .ai-panel-leave-to {
    transform: none;
  }
  .ai-fab-enter-from,
  .ai-fab-leave-to {
    transform: none;
  }
}

.p-head {
  height: 54px;
  flex: 0 0 54px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  border-bottom: 1px solid var(--line, #edf0f4);
}
.p-head .avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--brand-primary, #c8102e);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 32px;
}
.p-head .avatar svg { width: 19px; height: 19px; }
.p-head .who .n { font-size: 13px; font-weight: 600; color: var(--ink, #0f172a); line-height: 1.3; }
.p-head .who .s {
  font-size: 11px; color: #0e9f6e; display: flex; align-items: center; gap: 4px;
}
.p-head .who .s i { width: 5px; height: 5px; border-radius: 50%; background: #0e9f6e; }
.p-head .who .s.off { color: #94a3b8; }
.p-head .who .s.off i { background: #94a3b8; }
.p-head .spacer { flex: 1; }
.p-head .ico {
  width: 26px; height: 26px; border-radius: 6px; border: 1px solid transparent;
  background: transparent; color: var(--ink3, #94a3b8); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.p-head .ico:hover { background: #f4f6f9; border-color: var(--line2, #e3e8ef); color: var(--ink2, #475569); }
.p-head .ico svg { width: 15px; height: 15px; }

.p-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #fcfcfd;
}

.empty { display: flex; flex-direction: column; gap: 14px; padding-top: 8px; }

/* 未建立会话 */
.setup { padding-top: 8px; }
.setup-card {
  border: 1px solid #f5d4d9;
  background: #fdf0f2;
  border-radius: 10px;
  padding: 14px;
}
.setup-card .st-title {
  font-size: 13px; font-weight: 600; color: #a50d25; margin-bottom: 6px;
}
.setup-card .st-desc {
  font-size: 12px; color: #7c2d3a; line-height: 1.7; margin-bottom: 12px;
}
.setup-card .st-desc b { color: #a50d25; }
.setup-card .st-btn {
  height: 32px; padding: 0 14px; border-radius: 8px; border: none;
  background: var(--brand-primary, #c8102e); color: #fff;
  font-size: 12.5px; font-weight: 600; cursor: pointer;
}
.setup-card .st-btn:hover { filter: brightness(1.06); }
.empty .hi {
  font-size: 12.5px; color: var(--ink2, #475569); line-height: 1.7;
  background: #fff; border: 1px solid var(--line, #edf0f4);
  border-radius: 10px; padding: 11px 12px;
}
.empty .chips { display: flex; flex-direction: column; gap: 8px; }
.empty .chip {
  text-align: left; height: 34px; padding: 0 12px; border-radius: 8px;
  border: 1px solid var(--line2, #e3e8ef); background: #fff;
  font-size: 12px; color: var(--ink2, #475569); cursor: pointer;
}
.empty .chip:hover { border-color: var(--brand-primary, #c8102e); color: var(--brand-primary, #c8102e); }

.msg { display: flex; gap: 8px; align-items: flex-start; }
.msg.me { flex-direction: row-reverse; }
.msg-av {
  width: 32px; height: 32px; border-radius: 50%;
  background: var(--brand-primary, #c8102e);
  display: flex; align-items: center; justify-content: center; flex: 0 0 32px;
}
.msg-av svg { width: 19px; height: 19px; }
.msg .col { max-width: calc(100% - 40px); display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.msg.me .col { align-items: flex-end; }

.bub {
  background: #fff;
  border: 1px solid var(--line2, #e3e8ef);
  border-radius: 12px;
  border-top-left-radius: 4px;
  padding: 9px 12px;
  font-size: 12.5px;
  color: var(--ink, #0f172a);
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}
.msg.me .bub {
  background: var(--brand-primary, #c8102e);
  border-color: var(--brand-primary, #c8102e);
  color: #fff;
  border-radius: 12px;
  border-top-right-radius: 4px;
  border-top-left-radius: 12px;
}
.bub.err { border-color: #f5d4d9; background: #fdf0f2; color: #a50d25; }
.bub.thinking { display: flex; align-items: center; gap: 9px; color: var(--ink2, #475569); }

.dots { display: inline-flex; gap: 3px; align-items: center; height: 14px; }
.dots i {
  width: 4px; height: 4px; border-radius: 50%;
  background: var(--ink3, #94a3b8);
  animation: bnc 1.2s infinite ease-in-out;
}
.dots i:nth-child(2) { animation-delay: 0.15s; }
.dots i:nth-child(3) { animation-delay: 0.3s; }
@keyframes bnc {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.45; }
  30% { transform: translateY(-3px); opacity: 1; }
}

.navlist { display: flex; flex-direction: column; gap: 6px; }
.navitem {
  display: flex; align-items: center; gap: 8px;
  height: 34px; padding: 0 10px; border-radius: 8px;
  border: 1px solid var(--line2, #e3e8ef); background: #fff; cursor: pointer;
  text-align: left; width: 100%;
}
.navitem:hover { border-color: var(--brand-primary, #c8102e); }
.navitem .nt { font-size: 12.5px; font-weight: 600; color: var(--ink, #0f172a); }
.navitem .nd { font-size: 10.5px; color: var(--ink3, #94a3b8); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.navitem .na { font-size: 11px; font-weight: 600; color: var(--brand-primary, #c8102e); }

.time { font-size: 10.5px; color: #cbd5e1; }

.p-foot {
  flex: 0 0 auto;
  padding: 10px 12px 12px;
  border-top: 1px solid var(--line, #edf0f4);
  background: #fff;
}
/* 未连接提示条：贴在输入框上方，给「重新连接 / 去登录」两个动作 */
.reconnect-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  padding: 7px 10px;
  border-radius: 8px;
  background: #fff6f6;
  border: 1px solid #f5d5d5;
  font-size: 12px;
  color: #a13c3c;
}
.reconnect-bar .grow {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.reconnect-bar button {
  flex: 0 0 auto;
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid #f0c4c4;
  background: #fff;
  color: #c0392b;
  font-size: 12px;
  cursor: pointer;
}
.reconnect-bar button.primary {
  background: #e03131;
  border-color: #e03131;
  color: #fff;
}
.reconnect-bar button:disabled {
  opacity: .6;
  cursor: default;
}
/* 自检行：一排小字，把令牌/设备/归属/当前账号/上次错误摊开 */
.diag-line {
  margin: -4px 0 8px;
  padding: 0 2px;
  font-size: 11px;
  line-height: 1.5;
  color: #9aa3af;
  word-break: break-all;
}
.inputbox {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  border: 1px solid var(--line2, #e3e8ef);
  border-radius: 10px;
  padding: 7px 8px 7px 6px;
  background: #fff;
}
.inputbox:focus-within { border-color: var(--brand-primary, #c8102e); }
/* 音波图标（18×16，5 根圆角细柱）—— 替换原来的 🎤 emoji，
   原因：emoji 会跳出细线图标色系，还随系统字体变形。 */
.inputbox .mic {
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color .15s, background .15s, border-color .15s;
}
.inputbox .mic:hover:not(:disabled) {
  color: var(--brand-primary, #c8102e);
  background: #fdf0f2;
  border-color: #f5d4d9;
}
.inputbox .mic:disabled { opacity: .45; cursor: not-allowed; }
.inputbox .mic .wave { display: flex; align-items: center; gap: 2px; height: 16px; }
.inputbox .mic .wave i {
  display: block; width: 2px; height: 5px;
  border-radius: 2px; background: currentColor;
}
.inputbox .mic .wave i:nth-child(2) { height: 10px; }
.inputbox .mic .wave i:nth-child(3) { height: 15px; }
.inputbox .mic .wave i:nth-child(4) { height: 10px; }
/* 录音态：Web 端接 ASR 后复用（现在不会触发，先留好状态类不改版式） */
.inputbox .mic.rec { background: var(--brand-primary, #c8102e); border-color: var(--brand-primary, #c8102e); color: #fff; }
.mic-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 2px 7px;
  font-size: 11.5px;
  color: #7c8797;
  line-height: 1.5;
}
.mic-hint .bar { width: 2px; height: 11px; border-radius: 2px; background: #f5d4d9; flex: none; }
.inputbox textarea {
  flex: 1; border: none; outline: none; resize: none;
  font-size: 12.5px; line-height: 1.5; color: var(--ink, #0f172a);
  background: transparent; max-height: 96px; padding: 3px 0;
  font-family: inherit;
}
.inputbox textarea::placeholder { color: #cbd5e1; }
.inputbox .send {
  width: 26px; height: 26px; border-radius: 6px; border: none; flex: 0 0 26px;
  background: var(--brand-primary, #c8102e); color: #fff; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.inputbox .send:disabled { opacity: 0.4; cursor: not-allowed; }
.inputbox .send svg { width: 15px; height: 15px; }
.tip { font-size: 10.5px; color: #cbd5e1; text-align: center; margin-top: 7px; }

@media (max-width: 520px) {
  /* 移动端一律铺满，内联宽度让位（!important 才能压过 :style） */
  .ai-panel { width: 100vw !important; }
  .rz-handle { display: none; }
  .ai-ball { right: 16px; bottom: 16px; }
}
</style>
