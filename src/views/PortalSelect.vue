<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { supabase } from '@/utils/supabase'

const router = useRouter()

const showHeader = ref(false)
const showBody = ref(false)
const showGoodbye = ref(false)

const customers = ref([])
const loadingCustomers = ref(false)
const selectedCustomerId = ref('')

// ============================================================
// ⭐ 最近进入的客户（localStorage 记录，最多 3 条）
// ============================================================
const RECENT_KEY = 'portal_recent_customers'
const recentCustomerIds = ref([])

const loadRecentCustomers = () => {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) {
        recentCustomerIds.value = arr.filter(x => typeof x === 'string').slice(0, 3)
      }
    }
  } catch (e) {
    recentCustomerIds.value = []
  }
}

const saveRecentCustomer = (customerId) => {
  if (!customerId) return
  let list = recentCustomerIds.value.filter(id => id !== customerId)
  list.unshift(customerId)
  list = list.slice(0, 3)
  recentCustomerIds.value = list
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch (e) { /* ignore */ }
}

// ⭐ 最近进入的客户对象列表（从近到远，最多 3 条，自动过滤已失效客户）
const recentCustomers = computed(() => {
  return recentCustomerIds.value
    .map(id => customers.value.find(c => c.id === id))
    .filter(Boolean)
})

// ⭐ 其余客户（排除已在"最近进入"里的）
const otherCustomers = computed(() => {
  const recentSet = new Set(recentCustomerIds.value)
  return customers.value.filter(c => !recentSet.has(c.id))
})

// ============================================================
// 客户列表加载
// ============================================================
const selectedCustomer = computed(() => {
  if (!selectedCustomerId.value) return null
  return customers.value.find(c => c.id === selectedCustomerId.value) || null
})

const loadCustomers = async () => {
  loadingCustomers.value = true
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('status', 1)
      .order('created_at', { ascending: false })
    if (error) throw error
    customers.value = data || []
  } catch (e) {
    console.error('加载客户失败：', e)
    ElMessage.error('加载客户列表失败')
  } finally {
    loadingCustomers.value = false
  }
}

onMounted(() => {
  requestAnimationFrame(() => {
    showHeader.value = true
    setTimeout(() => { showBody.value = true }, 150)
  })
  loadRecentCustomers()
  loadCustomers()
})

const cardList = [
  { key: 'client', title: '车队管理系统客户端', sub: '新能源平台', tone: 'green', tagline: 'CLIENT' },
  { key: 'admin',  title: '车队管理系统管理端', sub: '后台管理中心', tone: 'purple', tagline: 'ADMIN' },
]

const onSelectCustomer = (customerId) => {
  if (!customerId) return
}

// ============================================================
// ⭐ 进入客户端 —— 保持 account 结构与 LoginView 一致
// ============================================================
const enterClient = async () => {
  const customer = selectedCustomer.value
  if (!customer) { ElMessage.warning('请先选择客户'); return }

  // ⭐ 1. 查 users 表拿到与客户直接登录一致的 account
  let realAccount = ''
  let masterEmail = ''
  try {
    const { data: u } = await supabase
      .from('users')
      .select('account, email, name')
      .eq('phone', customer.phone)
      .limit(1)
    if (Array.isArray(u) && u[0]) {
      if (u[0].account) realAccount = u[0].account
      if (u[0].email) masterEmail = u[0].email
    }
  } catch (e) {
    console.warn('查询 users.account 失败，降级使用 phone:', e)
  }
  if (!realAccount) realAccount = customer.phone || ''

  // ⭐ 2. 统一 permissions 结构
  let clientPerms = []
  if (Array.isArray(customer.permissions)) {
    clientPerms = customer.permissions
  } else if (customer.permissions && typeof customer.permissions === 'object') {
    clientPerms = Array.isArray(customer.permissions.client) ? customer.permissions.client : []
  }

  // ⭐ 3. 构造 account 对象
  const account = {
    id: customer.id,
    account: realAccount,
    phone: customer.phone,
    name: customer.name,
    email: masterEmail,
    role: 'customer',
    roleId: 0,
    roleName: '',
    orgId: null,
    org: '',
    orgName: '',
    orgLevel: 1,
    isRootOrg: false,
    customerId: customer.id,
    platforms: customer.platforms || [],
    permissions: { client: clientPerms },
    ownerAccount: '',
    masterAccount: '',
    masterName: '',
    masterPhone: '',
    customerName: customer.name || '',
    isSubAccount: false,
  }

  localStorage.setItem('currentUser', JSON.stringify(account))

  // ⭐ 4. 记录最近进入
  saveRecentCustomer(customer.id)

  ElMessage.success(`正在进入「${customer.name}」的客户端`)
  setTimeout(() => { router.push('/dashboard') }, 300)
}

const enterAdmin = () => { router.push('/admin') }

// ============================================================
// 退出登录
// ============================================================
const goLogout = () => {
  if (showGoodbye.value) return
  showGoodbye.value = true
  setTimeout(() => {
    localStorage.removeItem('originalUser')
    router.push('/')
    setTimeout(() => { showGoodbye.value = false }, 200)
  }, 1250)
}
</script>

<template>
  <div class="portal-page">
    <div class="bg-grid"></div>
    <div class="bg-orb orb-green"></div>
    <div class="bg-orb orb-purple"></div>
    <div class="bg-orb orb-red"></div>

    <header class="portal-header" :class="{ show: showHeader }">
      <div class="header-logo">
        <img src="/DFLOGO1.png" alt="东风商用车" />
      </div>
      <div class="header-title">
        <span class="title-line"></span>
        <h1>车 队 管 理 平 台</h1>
        <span class="title-line"></span>
      </div>
      <button class="logout-btn" @click="goLogout">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        退出登录
      </button>
    </header>

    <main class="portal-body" :class="{ show: showBody }">
      <div
        v-for="(card, i) in cardList"
        :key="card.key"
        class="portal-card"
        :class="['tone-' + card.tone, { active: card.key === 'client' && selectedCustomer }]"
        :style="{ animationDelay: (0.1 + i * 0.18) + 's' }"
      >
        <div class="card-border-glow"></div>
        <div class="card-bg-orb"></div>

        <div class="card-body">
          <div class="card-tag">{{ card.tagline }}</div>

          <div class="card-icon-wrap">
            <span class="icon-ring ring-1"></span>
            <span class="icon-ring ring-2"></span>
            <div class="card-icon">
              <svg v-if="card.key === 'client'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
          </div>

          <h3 class="card-title">{{ card.title }}</h3>
          <p class="card-sub">{{ card.sub }}</p>
          <div class="card-divider"></div>

          <div v-if="card.key === 'client'" class="card-select">
            <el-select
              v-model="selectedCustomerId"
              placeholder="点击选择客户"
              popper-class="portal-select-popper"
              filterable
              clearable
              :loading="loadingCustomers"
              style="width: 100%;"
              @change="onSelectCustomer"
            >
              <!-- ⭐ 最近进入分组 -->
              <el-option-group v-if="recentCustomers.length > 0" label="最近进入">
                <el-option
                  v-for="c in recentCustomers"
                  :key="'recent-' + c.id"
                  :label="c.name"
                  :value="c.id"
                >
                  <div class="option-row">
                    <span class="option-name">{{ c.name }}</span>
                    <span class="option-recent-tag">最近进入</span>
                    <span class="option-phone">{{ c.phone }}</span>
                  </div>
                </el-option>
              </el-option-group>

              <!-- ⭐ 全部客户分组 -->
              <el-option-group v-if="otherCustomers.length > 0" label="全部客户">
                <el-option
                  v-for="c in otherCustomers"
                  :key="'all-' + c.id"
                  :label="c.name"
                  :value="c.id"
                >
                  <div class="option-row">
                    <span class="option-name">{{ c.name }}</span>
                    <span class="option-phone">{{ c.phone }}</span>
                  </div>
                </el-option>
              </el-option-group>

              <template #empty>
                <div class="select-empty">暂无可用客户</div>
              </template>
            </el-select>

            <transition name="btn-slide">
              <button v-if="selectedCustomer" class="enter-btn green" @click="enterClient">
                <span class="btn-text">进入客户端</span>
                <span class="btn-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </span>
                <span class="btn-shine"></span>
              </button>
            </transition>
          </div>

          <div v-else class="card-select placeholder">
            <span>管理员后台</span>
          </div>

          <button v-if="card.key === 'admin'" class="enter-btn purple" @click="enterAdmin">
            <span class="btn-text">进入管理端</span>
            <span class="btn-icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </span>
            <span class="btn-shine"></span>
          </button>
        </div>
      </div>
    </main>

    <div v-if="showGoodbye" class="goodbye-overlay">
      <h1 class="goodbye-text">感谢使用</h1>
    </div>
  </div>
</template>

<style scoped>
.portal-page {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: radial-gradient(ellipse at 50% 30%, #F0F4FA 0%, #F8FAFC 50%, #EFF2F7 100%);
  font-family: system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: #0F172A;
}

.bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(15, 23, 42, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(15, 23, 42, 0.04) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse at 50% 45%, #000 0%, transparent 78%);
  -webkit-mask-image: radial-gradient(ellipse at 50% 45%, #000 0%, transparent 78%);
  pointer-events: none;
  animation: gridDrift 36s linear infinite;
}
@keyframes gridDrift {
  from { background-position: 0 0, 0 0; }
  to   { background-position: 48px 48px, 48px 48px; }
}

.bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  pointer-events: none;
  animation: orbFloat 16s ease-in-out infinite;
}
.orb-green  { width: 720px; height: 720px; top: -220px; left: -180px; background: radial-gradient(circle, rgba(16, 185, 129, 0.22) 0%, transparent 70%); }
.orb-purple { width: 760px; height: 760px; bottom: -260px; right: -200px; background: radial-gradient(circle, rgba(139, 92, 246, 0.22) 0%, transparent 70%); animation-delay: -8s; }
.orb-red    { width: 480px; height: 480px; top: 45%; left: 50%; transform: translate(-50%, -50%); background: radial-gradient(circle, rgba(200, 16, 46, 0.08) 0%, transparent 70%); animation-delay: -4s; animation-name: orbFloatCenter; }
@keyframes orbFloat {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50%      { transform: translate(40px, -30px) scale(1.1); }
}
@keyframes orbFloatCenter {
  0%, 100% { transform: translate(-50%, -50%) scale(1); }
  50%      { transform: translate(-50%, -50%) scale(1.15); }
}

.portal-header {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 88px;
  padding: 0 40px;
  opacity: 0;
  transform: translateY(-24px);
  transition: opacity 0.7s ease, transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.portal-header.show { opacity: 1; transform: translateY(0); }

.header-logo img {
  height: 45px;
  width: auto;
  display: block;
  animation: logoIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes logoIn {
  from { opacity: 0; transform: translateX(-30px) scale(0.9); }
  to   { opacity: 1; transform: translateX(0) scale(1); }
}

.header-title {
  position: absolute;
  left: 50%;
  top: 0;
  transform: translateX(-50%);
  height: 88px;
  display: flex;
  align-items: center;
  gap: 20px;
}
.header-title h1 {
  position: relative;
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 8px;
  background: linear-gradient(120deg, #0F172A 0%, #334155 50%, #0F172A 100%);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
  animation: titleShine 4s ease-in-out infinite;
}
@keyframes titleShine {
  0%, 100% { background-position: 0% 0; }
  50%      { background-position: 100% 0; }
}
.header-title h1::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -12px;
  transform: translateX(-50%);
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg, transparent, #c8102e, #c8102e, #c8102e, transparent);
  border-radius: 2px;
  animation: titleBarPulse 2.6s ease-in-out infinite;
}
@keyframes titleBarPulse {
  0%, 100% { opacity: 0.55; width: 100%; }
  50%      { opacity: 1;    width: 118%; }
}
.title-line {
  display: block;
  width: 60px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(200, 16, 46, 0.5), transparent);
}

.logout-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 600;
  color: #c8102e;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(200, 16, 46, 0.35);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: inherit;
  box-shadow: 0 2px 10px rgba(200, 16, 46, 0.06);
}
.logout-btn:hover {
  color: #FFFFFF;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  border-color: transparent;
  box-shadow: 0 8px 22px rgba(200, 16, 46, 0.35);
  transform: translateY(-2px);
}

.portal-body {
  position: relative;
  z-index: 5;
  display: grid;
  grid-template-columns: repeat(2, minmax(320px, 400px));
  justify-content: center;
  align-items: center;
  gap: 80px;
  padding: 40px;
  height: calc(100vh - 88px);
}

.portal-card {
  position: relative;
  border-radius: 32px;
  opacity: 0;
  transform: translateY(60px);
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.portal-body.show .portal-card {
  animation: cardEnter 0.85s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
@keyframes cardEnter {
  from { opacity: 0; transform: translateY(60px) scale(0.92); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.portal-card:hover {
  transform: translateY(-10px);
}

.card-border-glow {
  position: absolute;
  inset: -2px;
  border-radius: 34px;
  opacity: 0;
  transition: opacity 0.9s cubic-bezier(0.4, 0, 0.2, 1),
              transform 0.9s cubic-bezier(0.4, 0, 0.2, 1),
              filter 0.9s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  z-index: -1;
}
.tone-green .card-border-glow {
  background: linear-gradient(135deg, #10B981, #34D399, #06B6D4, #10B981);
  background-size: 300% 300%;
}
.tone-purple .card-border-glow {
  background: linear-gradient(135deg, #8B5CF6, #A78BFA, #6366F1, #8B5CF6);
  background-size: 300% 300%;
}

.portal-card:hover .card-border-glow {
  opacity: 0.85;
  animation:
    borderBreath 2.2s ease-in-out infinite 0.5s,
    glowGradientShift 5s ease-in-out infinite;
}
@keyframes borderBreath {
  0%, 100% { transform: scale(1); opacity: 0.45; filter: blur(18px); }
  50%      { transform: scale(1.035); opacity: 0.95; filter: blur(28px); }
}
@keyframes glowGradientShift {
  0%, 100% { background-position: 0% 50%; }
  50%      { background-position: 100% 50%; }
}

.card-border-glow::after {
  content: '';
  position: absolute;
  inset: -12px;
  border-radius: 44px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.9s cubic-bezier(0.4, 0, 0.2, 1);
}
.tone-green .card-border-glow::after {
  background: radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.5) 0%, transparent 70%);
}
.tone-purple .card-border-glow::after {
  background: radial-gradient(circle at 50% 50%, rgba(139, 92, 246, 0.5) 0%, transparent 70%);
}
.portal-card:hover .card-border-glow::after {
  animation: borderBreathOuter 2.2s ease-in-out infinite 0.9s;
}
@keyframes borderBreathOuter {
  0%, 100% { opacity: 0.15; transform: scale(1); filter: blur(20px); }
  50%      { opacity: 0.55; transform: scale(1.1); filter: blur(32px); }
}

.card-bg-orb {
  position: absolute;
  top: -60px; right: -60px;
  width: 220px; height: 220px;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.35;
  pointer-events: none;
  transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.tone-green  .card-bg-orb { background: radial-gradient(circle, rgba(16, 185, 129, 0.6) 0%, transparent 70%); }
.tone-purple .card-bg-orb { background: radial-gradient(circle, rgba(139, 92, 246, 0.6) 0%, transparent 70%); }
.portal-card:hover .card-bg-orb { transform: scale(1.5) translate(-20px, 20px); }

.card-body {
  position: relative;
  overflow: hidden;
  background: #FFFFFF;
  border-radius: 32px;
  padding: 44px 36px 36px;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 460px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  box-shadow:
    0 4px 20px rgba(15, 23, 42, 0.05),
    0 0 0 1px rgba(255, 255, 255, 0.6) inset;
  transition: box-shadow 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.tone-green:hover .card-body {
  box-shadow:
    0 24px 60px rgba(16, 185, 129, 0.18),
    0 8px 24px rgba(15, 23, 42, 0.06);
}
.tone-purple:hover .card-body {
  box-shadow:
    0 24px 60px rgba(139, 92, 246, 0.18),
    0 8px 24px rgba(15, 23, 42, 0.06);
}

.portal-card.tone-green.active .card-body {
  box-shadow:
    0 0 0 3px rgba(16, 185, 129, 0.12),
    0 24px 60px rgba(16, 185, 129, 0.2);
}

.card-tag {
  position: absolute;
  top: 18px;
  right: 18px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1.5px;
  padding: 3px 10px;
  border-radius: 999px;
  color: #FFFFFF;
  z-index: 2;
}
.tone-green  .card-tag { background: linear-gradient(135deg, #10B981, #059669); }
.tone-purple .card-tag { background: linear-gradient(135deg, #8B5CF6, #7C3AED); }

.card-icon-wrap {
  position: relative;
  width: 100px;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 28px;
}
.icon-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  pointer-events: none;
}
.tone-green  .icon-ring { border: 2px solid rgba(16, 185, 129, 0.5); }
.tone-purple .icon-ring { border: 2px solid rgba(139, 92, 246, 0.5); }
.icon-ring.ring-1 { animation: ringPulse 2.8s ease-out infinite; }
.icon-ring.ring-2 { animation: ringPulse 2.8s ease-out infinite; animation-delay: 1.4s; }
@keyframes ringPulse {
  0%   { transform: scale(0.9); opacity: 0.9; }
  100% { transform: scale(1.8);  opacity: 0; }
}

.card-icon {
  position: relative;
  z-index: 2;
  width: 88px; height: 88px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #FFFFFF;
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.tone-green .card-icon {
  background: radial-gradient(circle at 30% 30%, #34D399 0%, #10B981 50%, #059669 100%);
  box-shadow: 0 10px 30px rgba(16, 185, 129, 0.35), 0 0 0 6px rgba(16, 185, 129, 0.08);
}
.tone-purple .card-icon {
  background: radial-gradient(circle at 30% 30%, #A78BFA 0%, #8B5CF6 50%, #7C3AED 100%);
  box-shadow: 0 10px 30px rgba(139, 92, 246, 0.35), 0 0 0 6px rgba(139, 92, 246, 0.08);
}
.portal-card:hover .card-icon { transform: scale(1.12) rotate(-8deg); }
.card-icon svg { width: 42px; height: 42px; filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.15)); }

.card-title {
  margin: 0 0 8px;
  font-size: 19px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: 0.8px;
  text-align: center;
}
.card-sub {
  margin: 0;
  font-size: 13px;
  color: #64748B;
  letter-spacing: 2px;
  font-weight: 500;
}
.card-divider {
  width: 48px; height: 1px;
  margin: 26px 0;
  background: linear-gradient(90deg, transparent, #CBD5E1, transparent);
}

.card-select { width: 100%; }
.card-select.placeholder {
  display: flex; align-items: center; justify-content: center;
  height: 46px;
  color: #94A3B8;
  font-size: 13px;
  letter-spacing: 2px;
  border: 1.5px dashed #CBD5E1;
  border-radius: 10px;
  background: #F8FAFC;
  margin-bottom: 20px;
}
.card-select :deep(.el-select__wrapper) {
  border-radius: 10px !important;
  min-height: 46px;
  box-shadow: 0 0 0 1.5px #E2E8F0 inset !important;
  background: #F8FAFC !important;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.tone-green .card-select :deep(.el-select__wrapper:hover) {
  box-shadow: 0 0 0 1.5px rgba(16, 185, 129, 0.5) inset !important;
  background: #FFFFFF !important;
  transform: translateY(-1px);
}
.tone-green .card-select :deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1.5px #10B981 inset, 0 0 0 4px rgba(16, 185, 129, 0.12) !important;
  background: #FFFFFF !important;
}
.select-empty { padding: 16px 0; text-align: center; color: #94A3B8; font-size: 13px; }

.option-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.option-name { font-weight: 600; color: #0F172A; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.option-recent-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  background: linear-gradient(135deg, #10B981, #059669);
  color: #FFFFFF;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.5px;
  flex-shrink: 0;
  margin-left: 6px;
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);
}
.option-phone { font-size: 11px; color: #94A3B8; font-family: 'Courier New', monospace; flex-shrink: 0; }

.enter-btn {
  margin-top: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px 40px;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 2px;
  color: #FFFFFF;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  font-family: inherit;
  width: 100%;
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.enter-btn.green { background: linear-gradient(135deg, #10B981, #059669); box-shadow: 0 8px 24px rgba(16, 185, 129, 0.35); }
.enter-btn.purple { background: linear-gradient(135deg, #8B5CF6, #7C3AED); box-shadow: 0 8px 24px rgba(139, 92, 246, 0.35); }
.enter-btn:hover { transform: translateY(-3px) scale(1.02); }
.enter-btn.green:hover { box-shadow: 0 16px 40px rgba(16, 185, 129, 0.5); }
.enter-btn.purple:hover { box-shadow: 0 16px 40px rgba(139, 92, 246, 0.5); }
.enter-btn:active { transform: translateY(-1px) scale(0.98); }

.enter-btn .btn-text { position: relative; z-index: 2; transition: transform 0.3s; }
.enter-btn .btn-icon { position: relative; z-index: 2; display: inline-flex; transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }
.enter-btn:hover .btn-icon { transform: translateX(6px); }
.enter-btn .btn-shine {
  position: absolute;
  top: 0; left: -100%;
  width: 60%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.55), transparent);
  pointer-events: none;
}
.enter-btn:hover .btn-shine { animation: btnShine 0.75s ease; }
@keyframes btnShine {
  0%   { left: -100%; }
  100% { left: 130%; }
}

.btn-slide-enter-active { transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }
.btn-slide-leave-active { transition: all 0.28s ease; }
.btn-slide-enter-from { opacity: 0; transform: translateY(16px) scale(0.92); }
.btn-slide-leave-to { opacity: 0; transform: translateY(8px) scale(0.95); }

.goodbye-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: rgba(0, 0, 0, 0);
  backdrop-filter: blur(0px);
  -webkit-backdrop-filter: blur(0px);
  animation: goodbyeBlackout 1.25s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
@keyframes goodbyeBlackout {
  0%   { background: rgba(0, 0, 0, 0); backdrop-filter: blur(0px); -webkit-backdrop-filter: blur(0px); }
  70%  { background: rgba(0, 0, 0, 1); backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px); }
  100% { background: rgba(0, 0, 0, 1); backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px); }
}

.goodbye-text {
  position: relative;
  z-index: 2;
  margin: 0;
  font-family: inherit;
  font-size: 46px;
  font-weight: 700;
  letter-spacing: 14px;
  text-indent: 14px;
  color: #ffffff;
  user-select: none;
  white-space: nowrap;
  text-shadow:
    0 0 24px rgba(255, 255, 255, 0.55),
    0 0 60px rgba(211, 47, 47, 0.35);
  transform-origin: center center;
  will-change: transform, opacity, filter;
  animation: goodbyeTextFocus 1.25s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
@keyframes goodbyeTextFocus {
  0%   { opacity: 0; filter: blur(20px); letter-spacing: 32px; transform: scale(1.1); }
  55%  { opacity: 1; filter: blur(0);    letter-spacing: 14px; transform: scale(1); }
  70%  { opacity: 1; filter: blur(0);    letter-spacing: 14px; transform: scale(1); }
  100% { opacity: 0; filter: blur(4px);  letter-spacing: 14px; transform: scale(4); }
}

@media (max-width: 1100px) {
  .portal-body { grid-template-columns: 1fr; overflow-y: auto; gap: 30px; padding: 30px 40px 60px; }
  .header-title h1 { font-size: 18px; letter-spacing: 4px; }
  .title-line { width: 24px; }
}
@media (max-width: 768px) {
  .portal-header { height: 72px; padding: 0 20px; }
  .header-logo img { height: 34px; }
  .portal-body { height: calc(100vh - 72px); }
  .card-body { padding: 36px 24px 28px; min-height: 420px; border-radius: 24px; }
  .portal-card { border-radius: 24px; }

  .goodbye-text { font-size: 28px; letter-spacing: 8px; text-indent: 8px; }
  @keyframes goodbyeTextFocus {
    0%   { opacity: 0; filter: blur(16px); letter-spacing: 22px; transform: scale(1.1); }
    55%  { opacity: 1; filter: blur(0);    letter-spacing: 8px;  transform: scale(1); }
    70%  { opacity: 1; filter: blur(0);    letter-spacing: 8px;  transform: scale(1); }
    100% { opacity: 0; filter: blur(4px);  letter-spacing: 8px;  transform: scale(4); }
  }
}
</style>

<style>
.portal-select-popper {
  border-radius: 10px !important;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.15) !important;
  border: 1px solid #E2E8F0 !important;
  padding: 6px !important;
}
.portal-select-popper .el-select-dropdown__item {
  font-size: 13px;
  color: #334155;
  border-radius: 8px;
  margin: 2px 0;
  padding: 8px 12px;
  height: auto;
  line-height: 1.4;
}
.portal-select-popper .el-select-dropdown__item.is-hovering,
.portal-select-popper .el-select-dropdown__item:hover {
  background: #ECFDF5 !important;
  color: #10B981 !important;
}
.portal-select-popper .el-select-dropdown__item.is-selected {
  color: #10B981 !important;
  font-weight: 700;
  background: #ECFDF5 !important;
}

/* ⭐ 分组标题样式 */
.portal-select-popper .el-select-group__title {
  font-size: 11.5px !important;
  font-weight: 800 !important;
  color: #94A3B8 !important;
  letter-spacing: 1px !important;
  padding: 8px 12px 4px !important;
  line-height: 1 !important;
}
.portal-select-popper .el-select-group:first-child .el-select-group__title {
  color: #10B981 !important;
}
</style>