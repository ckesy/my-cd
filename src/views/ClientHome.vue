<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { Van, Location, Warning, Aim, Right } from '@element-plus/icons-vue'

const router = useRouter()

// 当前登录用户
const currentUser = (() => {
  try {
    return JSON.parse(localStorage.getItem('currentUser') || 'null')
  } catch { return null }
})()

// 显示用的数字（滚动动画）
const displayStats = ref({ total: 0, online: 0, offline: 0, alert: 0 })

// 我的车辆列表
const myVehicles = ref([])

const loading = ref(false)

// 数字滚动
const countUp = (target, setter, duration = 900) => {
  const start = performance.now()
  const tick = (now) => {
    const progress = Math.min((now - start) / duration, 1)
    const eased = 1 - Math.pow(1 - progress, 3)
    setter(Math.round(target * eased))
    if (progress < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

const loadData = async () => {
  loading.value = true
  try {
    // 客户只查自己的车辆
    let query = supabase.from('vehicles').select('*').order('updated_at', { ascending: false })
    if (currentUser?.role === 'customer' && currentUser?.customerId) {
      query = query.eq('customer_id', currentUser.customerId)
    }
    const { data, error } = await query
    if (error) throw error

    const list = (data || []).map(v => ({
      id: v.id,
      plate: v.plate,
      vin: v.vin,
      nickname: v.nickname,
      driver: v.driver,
      vehicle_type: v.vehicle_type,
      fuel_type: v.fuel_type,
      device_id: v.device_id,
      updated_at: v.updated_at,
      updatedAt: v.updated_at
        ? new Date(v.updated_at).toLocaleString('zh-CN', { hour12: false })
        : '--',
    }))
    myVehicles.value = list

    const total = list.length
    const online = 0
    const offline = total
    const alert = 0

    countUp(total,   v => { displayStats.value.total = v })
    countUp(online,  v => { displayStats.value.online = v })
    countUp(offline, v => { displayStats.value.offline = v })
    countUp(alert,   v => { displayStats.value.alert = v })
  } catch (e) {
    console.error('加载客户端首页失败：', e)
  } finally {
    loading.value = false
  }
}

const statCards = computed(() => [
  { key: 'total',   label: '我的车辆', value: displayStats.value.total,   tone: 'red',    icon: Van },
  { key: 'online',  label: '在线车辆', value: displayStats.value.online,  tone: 'green',  icon: Aim },
  { key: 'offline', label: '离线车辆', value: displayStats.value.offline, tone: 'slate',  icon: Location },
  { key: 'alert',   label: '今日告警', value: displayStats.value.alert,   tone: 'orange', icon: Warning },
])

// 车辆按燃料分布
const fuelDist = computed(() => {
  const map = new Map()
  myVehicles.value.forEach(v => {
    const key = v.fuel_type || '未设置'
    if (!map.has(key)) map.set(key, { name: key, count: 0 })
    map.get(key).count++
  })
  const arr = Array.from(map.values()).sort((a, b) => b.count - a.count)
  const max = arr[0]?.count || 1
  return arr.map(x => ({ ...x, percent: Math.round((x.count / max) * 100) }))
})

// 最近添加的车辆
const recentVehicles = computed(() => myVehicles.value.slice(0, 6))

// 进入地图
const goMap = () => router.push('/fullmap')

onMounted(loadData)
</script>

<template>
  <div class="client-home">
    <!-- 顶部欢迎条 -->
    <div class="welcome-banner">
      <div class="welcome-avatar">
        <el-icon><Van /></el-icon>
      </div>
      <div class="welcome-text">
        <h2>您好，{{ currentUser?.name || '客户' }}</h2>
        <p>欢迎使用东风车队管理系统 · 客户端</p>
      </div>
      <button class="enter-btn" @click="goMap">
        进入全图监控
        <el-icon><Right /></el-icon>
      </button>
    </div>

    <!-- 4 个统计卡片 -->
    <div class="stat-grid">
      <div
        v-for="(card, i) in statCards"
        :key="card.key"
        class="stat-card"
        :class="'tone-' + card.tone"
        :style="{ animationDelay: (i * 0.1) + 's' }"
      >
        <div class="stat-shine"></div>
        <div class="stat-icon">
          <el-icon><component :is="card.icon" /></el-icon>
        </div>
        <div class="stat-body">
          <div class="stat-value">{{ card.value }}</div>
          <div class="stat-label">{{ card.label }}</div>
        </div>
        <div class="stat-bg-circle"></div>
      </div>
    </div>

    <!-- 中下部：分布 + 最近车辆 -->
    <div class="chart-row">
      <!-- 车辆燃料分布 -->
      <section class="light-panel dist-panel">
        <div class="panel-title">
          <span class="dot"></span>
          <span>车辆燃料分布</span>
          <span class="count">共 {{ myVehicles.length }} 辆</span>
        </div>

        <div v-if="fuelDist.length === 0" class="empty-tip">暂无车辆数据</div>

        <div v-else class="bar-list">
          <div
            v-for="(item, i) in fuelDist"
            :key="item.name"
            class="bar-item"
            :style="{ '--i': i }"
          >
            <div class="bar-label">{{ item.name }}</div>
            <div class="bar-track">
              <div class="bar-fill" :style="{ width: item.percent + '%' }">
                <span class="bar-count">{{ item.count }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 最近车辆 -->
      <section class="light-panel recent-panel">
        <div class="panel-title">
          <span class="dot"></span>
          <span>我的车辆</span>
          <span class="count">最近 6 辆</span>
        </div>

        <div v-if="recentVehicles.length === 0" class="empty-tip">暂无车辆</div>

        <div v-else class="recent-list">
          <div
            v-for="(v, i) in recentVehicles"
            :key="v.id"
            class="recent-item"
            :style="{ animationDelay: (i * 0.06) + 's' }"
          >
            <div class="recent-head">
              <span class="recent-plate">{{ v.plate }}</span>
              <span v-if="v.nickname" class="recent-nick">{{ v.nickname }}</span>
            </div>
            <div class="recent-meta">
              <span class="meta-item">{{ v.vehicle_type || '--' }}</span>
              <span class="meta-dot">·</span>
              <span class="meta-item">{{ v.fuel_type || '--' }}</span>
              <span v-if="v.driver" class="meta-dot">·</span>
              <span v-if="v.driver" class="meta-item">司机 {{ v.driver }}</span>
            </div>
            <div class="recent-vin">{{ v.vin || '--' }}</div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.client-home {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  min-height: 100%;
  animation: pageIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes pageIn {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ============ 顶部欢迎条 ============ */
.welcome-banner {
  position: relative;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 22px 26px;
  background: linear-gradient(120deg, #FFFFFF 0%, #FEF2F2 60%, #FFFFFF 100%);
  border: 1px solid #E2E8F0;
  border-radius: 12px;
  overflow: hidden;
  animation: bannerIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes bannerIn {
  from { opacity: 0; transform: translateY(-12px); }
  to   { opacity: 1; transform: translateY(0); }
}
.welcome-banner::before {
  content: '';
  position: absolute;
  top: 0; left: -60%;
  width: 50%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(200, 16, 46, 0.06), transparent);
  animation: shine 5s ease-in-out infinite;
}
@keyframes shine {
  0%   { left: -60%; }
  100% { left: 120%; }
}

.welcome-avatar {
  width: 52px; height: 52px;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #FFFFFF;
  border-radius: 12px;
  font-size: 26px;
  box-shadow: 0 8px 20px rgba(200, 16, 46, 0.25);
  flex-shrink: 0;
}
.welcome-text { flex: 1; min-width: 0; }
.welcome-text h2 {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: 1px;
}
.welcome-text p {
  margin: 0;
  font-size: 13px;
  color: #64748B;
}

.enter-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 22px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #FFFFFF;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(200, 16, 46, 0.3);
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: inherit;
  position: relative;
  overflow: hidden;
}
.enter-btn::before {
  content: '';
  position: absolute;
  top: 0; left: -100%;
  width: 60%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent);
  transition: left 0.65s ease;
}
.enter-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(200, 16, 46, 0.45);
}
.enter-btn:hover::before { left: 130%; }
.enter-btn :deep(.el-icon) { transition: transform 0.3s; }
.enter-btn:hover :deep(.el-icon) { transform: translateX(4px); }

/* ============ 4 个统计卡片 ============ */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.stat-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 22px;
  border-radius: 12px;
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.04);
  overflow: hidden;
  opacity: 0;
  transform: translateY(20px);
  animation: cardIn 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
              box-shadow 0.35s;
}
@keyframes cardIn {
  to { opacity: 1; transform: translateY(0); }
}
.stat-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
}
.stat-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; bottom: 0;
  width: 4px;
  background: currentColor;
  border-radius: 12px 0 0 12px;
}
.stat-card.tone-red    { color: #c8102e; }
.stat-card.tone-green  { color: #059669; }
.stat-card.tone-slate  { color: #475569; }
.stat-card.tone-orange { color: #EA580C; }

.stat-shine {
  position: absolute;
  top: 0; left: -60%;
  width: 50%; height: 100%;
  background: linear-gradient(90deg, transparent, currentColor, transparent);
  opacity: 0;
}
.stat-card:hover .stat-shine {
  animation: cardShine 0.9s ease;
}
@keyframes cardShine {
  0%   { left: -60%; opacity: 0.15; }
  100% { left: 120%; opacity: 0; }
}

.stat-icon {
  width: 56px; height: 56px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 12px;
  font-size: 26px;
  color: #FFFFFF;
  flex-shrink: 0;
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.stat-card.tone-red    .stat-icon { background: linear-gradient(135deg, #c8102e, #a00d24); box-shadow: 0 8px 20px rgba(200, 16, 46, 0.22); }
.stat-card.tone-green  .stat-icon { background: linear-gradient(135deg, #10B981, #059669); box-shadow: 0 8px 20px rgba(16, 185, 129, 0.22); }
.stat-card.tone-slate  .stat-icon { background: linear-gradient(135deg, #64748B, #334155); box-shadow: 0 8px 20px rgba(71, 85, 105, 0.22); }
.stat-card.tone-orange .stat-icon { background: linear-gradient(135deg, #F97316, #EA580C); box-shadow: 0 8px 20px rgba(249, 115, 22, 0.22); }
.stat-card:hover .stat-icon { transform: scale(1.1) rotate(-5deg); }

.stat-body { flex: 1; min-width: 0; }
.stat-value {
  font-size: 28px;
  font-weight: 800;
  color: #0F172A;
  font-family: 'Courier New', monospace;
  line-height: 1.1;
  letter-spacing: -0.5px;
}
.stat-label {
  font-size: 12.5px;
  color: #64748B;
  margin-top: 4px;
  letter-spacing: 0.5px;
}

.stat-bg-circle {
  position: absolute;
  right: -30px; bottom: -30px;
  width: 120px; height: 120px;
  border-radius: 50%;
  background: radial-gradient(circle, currentColor 0%, transparent 70%);
  opacity: 0.06;
  pointer-events: none;
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.stat-card:hover .stat-bg-circle { transform: scale(1.3); }

/* ============ 中下部布局 ============ */
.chart-row {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 16px;
  min-height: 320px;
}

/* ============ 车辆燃料分布 ============ */
.dist-panel { display: flex; flex-direction: column; }
.bar-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  max-height: 380px;
  padding-right: 4px;
}
.bar-list::-webkit-scrollbar { width: 6px; }
.bar-list::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }

.bar-item {
  display: grid;
  grid-template-columns: 100px 1fr;
  align-items: center;
  gap: 12px;
  opacity: 0;
  animation: barItemIn 0.5s ease forwards;
  animation-delay: calc(var(--i) * 0.08s + 0.2s);
}
@keyframes barItemIn {
  from { opacity: 0; transform: translateX(-10px); }
  to   { opacity: 1; transform: translateX(0); }
}
.bar-label {
  font-size: 13px;
  color: #334155;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bar-track {
  position: relative;
  height: 26px;
  background: #F1F5F9;
  border-radius: 8px;
  overflow: hidden;
}
.bar-fill {
  position: relative;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 12px;
  background: linear-gradient(90deg, #FCA5A5, #c8102e);
  border-radius: 8px;
  min-width: 42px;
  animation: barGrow 1s cubic-bezier(0.4, 0, 0.2, 1) both;
  animation-delay: calc(var(--i) * 0.08s + 0.3s);
  box-shadow: 0 2px 8px rgba(200, 16, 46, 0.25);
}
.bar-fill::after {
  content: '';
  position: absolute;
  top: 0; left: -100%;
  width: 100%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
  animation: barShine 2.5s ease-in-out infinite;
}
@keyframes barGrow { from { width: 0 !important; } }
@keyframes barShine {
  0%   { left: -100%; }
  100% { left: 200%; }
}
.bar-count {
  font-size: 12px;
  font-weight: 800;
  color: #FFFFFF;
  font-family: 'Courier New', monospace;
  letter-spacing: 0.5px;
  position: relative;
  z-index: 1;
}

/* ============ 最近车辆 ============ */
.recent-panel { display: flex; flex-direction: column; }
.recent-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  max-height: 380px;
  padding-right: 4px;
}
.recent-list::-webkit-scrollbar { width: 6px; }
.recent-list::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }

.recent-item {
  padding: 12px 14px;
  border-radius: 10px;
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  opacity: 0;
  animation: recentIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes recentIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.recent-item:hover {
  background: #FFFFFF;
  border-color: rgba(200, 16, 46, 0.35);
  transform: translateX(4px);
  box-shadow: 0 4px 16px rgba(200, 16, 46, 0.1);
}
.recent-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.recent-plate {
  font-size: 14px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: 0.8px;
}
.recent-nick {
  font-size: 11px;
  color: #64748B;
  background: #F1F5F9;
  padding: 1px 6px;
  border-radius: 4px;
}
.recent-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #64748B;
  margin-bottom: 4px;
}
.meta-item { color: #475569; }
.meta-dot { color: #CBD5E1; }
.recent-vin {
  font-size: 11px;
  color: #94A3B8;
  font-family: 'Courier New', monospace;
}

/* ============ 空状态 ============ */
.empty-tip {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94A3B8;
  font-size: 13px;
  padding: 40px 0;
}

/* ============ 响应式 ============ */
@media (max-width: 1200px) {
  .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .chart-row { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .stat-grid { grid-template-columns: 1fr; }
  .stat-value { font-size: 22px; }
  .welcome-banner { flex-direction: column; align-items: flex-start; }
  .enter-btn { align-self: stretch; justify-content: center; }
}
</style>