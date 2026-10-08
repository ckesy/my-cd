<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { supabase } from '@/utils/supabase'

const router = useRouter()

// ---------- 登录框显隐 ----------
const showLogin = ref(false)
const openLogin = () => { showLogin.value = true }
const closeLogin = () => { showLogin.value = false }

// ---------- 表单状态 ----------
const activeTab = ref('password')
const phone = ref('')
const password = ref('')
const code = ref('')
const agreed = ref(true)
const showPassword = ref(false)

// ---------- 发送验证码倒计时 ----------
const codeCountdown = ref(0)
let codeTimer = null

const sendCode = () => {
  if (codeCountdown.value > 0) return
  if (!phone.value) { ElMessage.warning('请先输入手机号'); return }
  codeCountdown.value = 60
  codeTimer = setInterval(() => {
    codeCountdown.value--
    if (codeCountdown.value <= 0) {
      clearInterval(codeTimer)
      codeTimer = null
    }
  }, 1000)
}

onBeforeUnmount(() => {
  if (codeTimer) clearInterval(codeTimer)
})

// ============================================================
// 登录
// ============================================================
const handleLogin = async () => {
  if (!phone.value) { ElMessage.warning('请输入手机号'); return }
  if (!agreed.value) { ElMessage.warning('请先阅读并同意用户协议'); return }

  if (activeTab.value === 'password') {
    if (!password.value) { ElMessage.warning('请输入密码'); return }
  } else {
    if (!code.value) { ElMessage.warning('请输入验证码'); return }
  }

  try {
    // ============================================================
    // ① 先查 admins 表（不加 status 过滤，查到再判断）
    // ============================================================
    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select('*')
      .eq('phone', phone.value)
      .maybeSingle()

    if (adminError && adminError.code !== 'PGRST116') throw adminError

    if (adminData) {
      // 密码校验
      if (activeTab.value === 'password' && adminData.password !== password.value) {
        ElMessage.error('手机号或密码不正确')
        return
      }
      // 密码正确后，再判断状态
      if (Number(adminData.status) !== 1) {
        ElMessage.error('账号已被禁用，请联系管理员')
        return
      }

      const account = {
        id: adminData.id,
        phone: adminData.phone,
        name: adminData.name,
        role: 'admin',
      }
      localStorage.setItem('currentUser', JSON.stringify(account))
      playWelcome('/portal')
      return
    }

    // ============================================================
    // ② 再查 customers 表（不加 status 过滤）
    // ============================================================
    const { data: customerData, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', phone.value)
      .maybeSingle()

    if (customerError && customerError.code !== 'PGRST116') throw customerError

    if (!customerData) {
      ElMessage.error('手机号或密码不正确')
      return
    }

    // 密码校验
    if (activeTab.value === 'password' && customerData.password !== password.value) {
      ElMessage.error('手机号或密码不正确')
      return
    }

    // 👇 密码正确后，再判断是否被禁用
    if (Number(customerData.status) !== 1) {
      ElMessage.error('账号已被禁用，请联系管理员')
      return
    }

    const account = {
      id: customerData.id,
      phone: customerData.phone,
      name: customerData.name,
      role: 'customer',
      customerId: customerData.id,
      platforms: customerData.platforms || [],
      permissions: customerData.permissions || {},
    }
    localStorage.setItem('currentUser', JSON.stringify(account))
    playWelcome('/dashboard')
  } catch (e) {
    console.error(e)
    ElMessage.error('登录异常：' + (e?.message || e))
  }
}

const handleRegister = () => ElMessage.info('注册功能开发中')
const handleWechat = () => ElMessage.info('微信登录功能开发中')

const handleBackdropClick = (e) => {
  if (e.target.classList.contains('backdrop')) closeLogin()
}

// ============================================================
// 欢迎动画
// ============================================================
const showWelcome = ref(false)
const welcomeLeaving = ref(false)

const particles = Array.from({ length: 18 }, () => ({
  left: Math.random() * 100,
  top: 55 + Math.random() * 45,
  size: 2 + Math.random() * 3,
  delay: Math.random() * 4,
  duration: 4 + Math.random() * 4,
}))

const playWelcome = (target = '/dashboard') => {
  showWelcome.value = true
  setTimeout(() => { welcomeLeaving.value = true }, 1000)
  setTimeout(() => { router.push(target) }, 1400)
}
</script>

<template>
  <div class="login-page">
    <!-- ========== 全屏背景视频 ========== -->
    <video
      class="bg-video"
      autoplay
      muted
      loop
      playsinline
      webkit-playsinline
      preload="auto"
    >
      <source src="/login-bg.mp4" type="video/mp4" />
    </video>

    <!-- ========== 顶部栏：Logo + 用户图标 ========== -->
    <div class="top-bar">
      <div class="logo-wrap">
        <img src="/DFLOGO.png" alt="东风商用车" class="logo-img" />
      </div>

      <button class="user-btn" @click="openLogin" title="登录">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        </svg>
      </button>
    </div>

    <!-- ========== 登录弹层 ========== -->
    <transition name="backdrop">
      <div v-if="showLogin" class="backdrop" @click="handleBackdropClick">
        <transition name="login-card" appear>
          <div class="login-card">
            <button class="close-btn" @click="closeLogin">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>

            <div class="tabs">
              <button class="tab-item" :class="{ active: activeTab === 'password' }" @click="activeTab = 'password'">密码登录</button>
              <button class="tab-item" :class="{ active: activeTab === 'code' }" @click="activeTab = 'code'">验证码登录</button>
            </div>

            <div class="form-body">
              <div class="input-wrap">
                <div class="prefix">
                  <span>+86</span>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
                <input v-model="phone" type="tel" placeholder="请输入手机号" class="field" maxlength="11" />
              </div>

              <div v-if="activeTab === 'password'" class="input-wrap">
                <input v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="请输入密码" class="field" />
                <button class="eye-btn" @click="showPassword = !showPassword" type="button">
                  <svg v-if="!showPassword" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>

              <div v-else class="input-wrap">
                <input v-model="code" type="text" placeholder="请输入验证码" class="field" maxlength="6" />
                <button class="code-btn" type="button" :disabled="codeCountdown > 0" @click="sendCode">
                  {{ codeCountdown > 0 ? `${codeCountdown}s 后重发` : '获取验证码' }}
                </button>
              </div>

              <div class="btn-row">
                <button class="btn btn-outline" @click="handleRegister">注册</button>
                <button class="btn btn-dark" @click="handleLogin">登录</button>
              </div>

              <div class="divider">
                <span class="line"></span>
                <span class="text">或</span>
                <span class="line"></span>
              </div>

              <button class="btn-wechat" @click="handleWechat">
                <svg viewBox="0 0 24 24" width="22" height="22" xmlns="http://www.w3.org/2000/svg">
                  <path fill="#07C160" d="M8.5 3C4.36 3 1 5.91 1 9.5c0 2.02 1.03 3.82 2.66 5.02-.13.5-.42 1.28-.83 1.98-.08.13-.27.5.24.6.44.09 1.94-.3 3.08-.85.75.15 1.54.25 2.35.25.34 0 .68-.02 1.01-.05a5.5 5.5 0 0 1-.01-.35c0-3.5 3.2-6.35 7.15-6.35.24 0 .48.01.71.03C16.9 5.83 13.03 3 8.5 3zM5.75 7.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm5.5 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
                  <path fill="#07C160" d="M23 15.5c0-2.76-2.69-5-6-5s-6 2.24-6 5 2.69 5 6 5c.66 0 1.3-.09 1.9-.25.93.43 2.1.72 2.44.66.4-.08.26-.36.2-.46-.31-.55-.55-1.18-.65-1.56A4.72 4.72 0 0 0 23 15.5zm-8.5-1.25a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zm5 0a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5z" />
                </svg>
                微信登录
              </button>

              <div class="agreement" @click="agreed = !agreed">
                <span class="checkbox" :class="{ checked: agreed }">
                  <svg v-if="agreed" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <span class="agreement-text">
                  我已阅读并同意
                  <a href="#" @click.stop>用户许可协议</a>、
                  <a href="#" @click.stop>用户隐私政策</a>
                </span>
              </div>
            </div>
          </div>
        </transition>
      </div>
    </transition>

    <!-- ========== 登录成功 · 全屏欢迎动画 ========== -->
    <div v-if="showWelcome" class="welcome-overlay" :class="{ leaving: welcomeLeaving }">
      <div class="welcome-particles">
        <span
          v-for="(p, i) in particles"
          :key="i"
          :style="{
            left: p.left + '%',
            top: p.top + '%',
            width: p.size + 'px',
            height: p.size + 'px',
            animationDelay: p.delay + 's',
            animationDuration: p.duration + 's',
          }"
        ></span>
      </div>

      <div class="welcome-rings">
        <span></span>
        <span></span>
        <span></span>
      </div>

      <div class="welcome-glow"></div>

      <div class="welcome-content">
        <div class="welcome-logo">
          <img src="/DFLOGO.png" alt="东风商用车" />
        </div>
        <h1 class="welcome-title">欢迎使用东风车队管理系统</h1>
        <p class="welcome-sub">DongFeng Fleet Management System</p>
        <div class="welcome-loader"><span></span></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ==========================================
   页面基础
   ========================================== */
.login-page {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #0a1a2a;
}

.bg-video {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
  pointer-events: none;
}

/* ==========================================
   顶部栏
   ========================================== */
.top-bar {
  position: absolute;
  top: -50px;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 40px;
  pointer-events: none;
}

.logo-wrap {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 20px;
}

.logo-img {
  height: 270px;
  width: auto;
  display: block;
  background: transparent;
  user-select: none;
}

.user-btn {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.15);
  border: 1.5px solid rgba(255, 255, 255, 0.65);
  border-radius: 50%;
  color: #ffffff;
  cursor: pointer;
  pointer-events: auto;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.user-btn:hover {
  background: rgba(255, 255, 255, 0.28);
  border-color: #ffffff;
  transform: scale(1.12) rotate(-6deg);
  box-shadow: 0 0 0 6px rgba(255, 255, 255, 0.12),
              0 8px 24px rgba(0, 0, 0, 0.25);
}
.user-btn:active { transform: scale(0.95); }
.user-btn svg { transition: transform 0.3s; }
.user-btn:hover svg { transform: scale(1.08); }

/* ==========================================
   登录弹层
   ========================================== */
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
.backdrop-enter-active, .backdrop-leave-active { transition: opacity 0.35s ease; }
.backdrop-enter-from, .backdrop-leave-to { opacity: 0; }

.login-card {
  position: relative;
  width: 420px;
  max-width: calc(100vw - 32px);
  background: #ffffff;
  border-radius: 0;
  padding: 40px 40px 32px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.25);
  animation: cardPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes cardPop {
  from { opacity: 0; transform: scale(0.85) translateY(20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.login-card-enter-active { transition: all 0.45s cubic-bezier(0.34, 1.56, 0.64, 1); }
.login-card-leave-active { transition: all 0.3s ease; }
.login-card-enter-from { opacity: 0; transform: scale(0.85) translateY(20px); }
.login-card-leave-to { opacity: 0; transform: scale(0.95); }

.close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.25s;
}
.close-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
  transform: rotate(90deg);
}

.tabs { display: flex; gap: 32px; margin-bottom: 32px; padding-bottom: 2px; }
.tab-item {
  position: relative;
  padding: 0 0 8px 0;
  font-size: 22px;
  font-weight: 700;
  color: #cbd5e1;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.3s;
  font-family: inherit;
}
.tab-item.active { color: #0f172a; }
.tab-item.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 32px;
  height: 3px;
  background: #0f172a;
  border-radius: 2px;
  animation: tabUnderline 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes tabUnderline { from { width: 0; } to { width: 32px; } }

.form-body { display: flex; flex-direction: column; gap: 16px; }

.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  background: #f1f3f5;
  border: 2px solid transparent;
  border-radius: 8px;
  padding: 0 16px;
  height: 60px;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.input-wrap:focus-within {
  background: #ffffff;
  border-color: #0f172a;
  box-shadow: 0 0 0 4px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}
.prefix {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 14px;
  margin-right: 14px;
  border-right: 1px solid #d1d5db;
  color: #0f172a;
  font-size: 16px;
  font-weight: 600;
  user-select: none;
  cursor: pointer;
}
.prefix svg { color: #64748b; }
.field {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-size: 16px;
  color: #0f172a;
  font-family: inherit;
}
.field::placeholder { color: #b6bfc9; font-weight: 400; }
.eye-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
}
.eye-btn:hover { color: #0f172a; background: rgba(0, 0, 0, 0.05); }
.code-btn {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 6px;
  background: #0f172a;
  color: #fff;
  border: none;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s;
  font-family: inherit;
}
.code-btn:hover:not(:disabled) { background: #1e293b; transform: translateY(-1px); }
.code-btn:disabled { background: #cbd5e1; cursor: not-allowed; }

.btn-row { display: flex; gap: 12px; margin-top: 8px; }
.btn {
  flex: 1;
  height: 56px;
  border-radius: 8px;
  font-size: 17px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: inherit;
  letter-spacing: 0.5px;
}
.btn-outline { background: #ffffff; border: 2px solid #e2e8f0; color: #0f172a; }
.btn-outline:hover { border-color: #0f172a; transform: translateY(-2px); box-shadow: 0 8px 20px rgba(15, 23, 42, 0.1); }
.btn-dark { background: #1e293b; border: 2px solid #1e293b; color: #ffffff; }
.btn-dark:hover { background: #0f172a; border-color: #0f172a; transform: translateY(-2px); box-shadow: 0 12px 28px rgba(15, 23, 42, 0.3); }
.btn:active { transform: translateY(0) scale(0.98); }

.divider { display: flex; align-items: center; gap: 16px; margin: 8px 0; }
.divider .line { flex: 1; height: 1px; background: #e2e8f0; }
.divider .text { color: #94a3b8; font-size: 14px; font-weight: 500; }

.btn-wechat {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 56px;
  width: 100%;
  background: #ffffff;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  color: #0f172a;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: inherit;
}
.btn-wechat:hover { border-color: #07c160; background: #f0fdf4; transform: translateY(-2px); box-shadow: 0 8px 20px rgba(7, 193, 96, 0.15); }
.btn-wechat:active { transform: translateY(0) scale(0.98); }
.btn-wechat svg { transition: transform 0.3s; }
.btn-wechat:hover svg { transform: scale(1.15); }

.agreement { display: flex; align-items: center; gap: 10px; margin-top: 8px; cursor: pointer; user-select: none; font-size: 13px; color: #64748b; }
.checkbox {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  border: 2px solid #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.checkbox.checked { background: #0f172a; border-color: #0f172a; transform: scale(1.05); }
.agreement-text { line-height: 1.4; }
.agreement-text a { color: #0f172a; text-decoration: none; font-weight: 600; transition: color 0.2s; }
.agreement-text a:hover { color: #1e40af; text-decoration: underline; }

/* ==========================================
   登录成功 · 全屏欢迎动画
   ========================================== */
.welcome-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: rgba(6, 10, 18, 0.82);
  backdrop-filter: blur(16px) saturate(160%);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  animation: welcomeFadeIn 0.3s ease both;
  transition: opacity 0.35s ease, transform 0.35s ease, filter 0.35s ease;
}
.welcome-overlay.leaving {
  opacity: 0;
  transform: scale(1.06);
  filter: blur(6px);
  pointer-events: none;
}
@keyframes welcomeFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.welcome-particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.welcome-particles span {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 214, 221, 0.95);
  box-shadow: 0 0 10px rgba(200, 16, 46, 0.9), 0 0 22px rgba(200, 16, 46, 0.45);
  opacity: 0;
  animation-name: particleRise;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
@keyframes particleRise {
  0%   { opacity: 0; transform: translateY(0) scale(0.5); }
  15%  { opacity: 1; }
  80%  { opacity: 0.9; }
  100% { opacity: 0; transform: translateY(-160px) scale(1.15); }
}

.welcome-rings {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.welcome-rings span {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 200px;
  height: 200px;
  margin: -100px 0 0 -100px;
  border-radius: 50%;
  border: 2px solid rgba(200, 16, 46, 0.55);
  box-shadow: 0 0 30px rgba(200, 16, 46, 0.35), inset 0 0 30px rgba(200, 16, 46, 0.2);
  animation: ringExpand 2.8s cubic-bezier(0.22, 0.61, 0.36, 1) infinite;
}
.welcome-rings span:nth-child(1) { animation-delay: 0s; }
.welcome-rings span:nth-child(2) { animation-delay: 0.6s; }
.welcome-rings span:nth-child(3) { animation-delay: 1.2s; }
@keyframes ringExpand {
  0%   { transform: scale(0.35); opacity: 0; }
  20%  { opacity: 0.9; }
  100% { transform: scale(3.4); opacity: 0; }
}

.welcome-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 480px;
  height: 480px;
  margin: -240px 0 0 -240px;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    transparent 0deg,
    rgba(200, 16, 46, 0.35) 55deg,
    transparent 130deg,
    transparent 360deg
  );
  filter: blur(38px);
  animation: glowSpin 5s linear infinite;
  pointer-events: none;
}
@keyframes glowSpin {
  to { transform: rotate(360deg); }
}

.welcome-content {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
  padding: 0 24px;
  animation: welcomeContentIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  animation-delay: 0.05s;
}
@keyframes welcomeContentIn {
  from { opacity: 0; transform: translateY(34px) scale(0.9); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.welcome-logo img {
  height: 130px;
  width: auto;
  display: block;
  filter: drop-shadow(0 10px 32px rgba(200, 16, 46, 0.6))
          drop-shadow(0 2px 8px rgba(0, 0, 0, 0.45));
  animation: logoFloat 3s ease-in-out infinite;
}
@keyframes logoFloat {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-9px); }
}

.welcome-title {
  margin: 0;
  font-size: 34px;
  font-weight: 800;
  letter-spacing: 3px;
  line-height: 1.3;
  background: linear-gradient(
    100deg,
    #ffffff 0%,
    #ffd6dd 22%,
    #c8102e 46%,
    #ff8fa3 58%,
    #ffd6dd 74%,
    #ffffff 100%
  );
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
  animation: titleShine 2.2s linear infinite;
  filter: drop-shadow(0 4px 18px rgba(200, 16, 46, 0.45));
}
@keyframes titleShine {
  0%   { background-position: 220% 0; }
  100% { background-position: -220% 0; }
}

.welcome-sub {
  margin: 0;
  font-size: 12px;
  letter-spacing: 7px;
  font-weight: 500;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.42);
  animation: subFade 0.6s ease both;
  animation-delay: 0.15s;
}
@keyframes subFade {
  from { opacity: 0; letter-spacing: 14px; }
  to   { opacity: 1; letter-spacing: 7px; }
}

.welcome-loader {
  margin-top: 12px;
  width: 220px;
  height: 3px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
  position: relative;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06) inset;
}
.welcome-loader span {
  position: absolute;
  inset: 0;
  border-radius: 3px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    #c8102e 30%,
    #ff8fa3 50%,
    #c8102e 70%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: loaderRun 0.9s linear infinite;
  box-shadow: 0 0 12px rgba(200, 16, 46, 0.9);
}
@keyframes loaderRun {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* ==========================================
   响应式
   ========================================== */
@media (max-width: 1024px) {
  .logo-img { height: 180px; }
}

@media (max-width: 768px) {
  .top-bar { top: -20px; padding: 0 20px; }
  .logo-wrap { padding: 8px 14px; }
  .logo-img { height: 100px; }
  .user-btn { width: 44px; height: 44px; }
  .login-card { padding: 32px 24px 24px; }
  .tab-item { font-size: 18px; }

  .welcome-logo img { height: 88px; }
  .welcome-title { font-size: 21px; letter-spacing: 2px; }
  .welcome-sub { font-size: 10px; letter-spacing: 4px; }
  .welcome-loader { width: 170px; }
  .welcome-glow { width: 320px; height: 320px; margin: -160px 0 0 -160px; }
}
</style>