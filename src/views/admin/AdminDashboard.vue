<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/utils/supabase'
import { UserFilled, Van, Odometer, Lightning, DataBoard } from '@element-plus/icons-vue'

const displayStats = ref({ customers: 0, vehicles: 0, fuel: 0, newEnergy: 0 })
const customerDist = ref([])
const recentVehicles = ref([])
const loading = ref(false)

const countUp = (target, setter, duration = 900) => {
  const startTime = performance.now()
  const tick = (now) => {
    const progress = Math.min((now - startTime) / duration, 1)
    const eased = 1 - Math.pow(1 - progress, 3)
    setter(Math.round(target * eased))
    if (progress < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

const loadStats = async () => {
  loading.value = true
  try {
    const [
      { count: customerCount },
      { count: vehicleCount },
      { count: fuelCount },
      { count: newEnergyCount },
    ] = await Promise.all([
      supabase.from('customers').select('*', { count: 'exact', head: true }),
      supabase.from('vehicles').select('*', { count: 'exact', head: true }),
      supabase.from('vehicles').select('*', { count: 'exact', head: true }).eq('fuel_type', '燃油'),
      supabase.from('vehicles').select('*', { count: 'exact', head: true }).eq('fuel_type', '新能源'),
    ])

    const { data: vehicles } = await supabase.from('vehicles').select('org, plate')
    const groupMap = new Map()
    ;(vehicles || []).forEach(v => {
      const key = v.org || '未分配客户'
      if (!groupMap.has(key)) groupMap.set(key, { name: key, count: 0 })
      groupMap.get(key).count++
    })
    const groups = Array.from(groupMap.values()).sort((a, b) => b.count - a.count)
    const maxCount = groups[0]?.count || 1
    customerDist.value = groups.map(g => ({
      ...g,
      percent: Math.round((g.count / maxCount) * 100),
    }))

    const { data: recent } = await supabase
      .from('vehicles')
      .select('plate, org, vehicle_type, fuel_type, created_at')
      .order('created_at', { ascending: false })
      .limit(6)
    recentVehicles.value = (recent || []).map(v => ({
      ...v,
      createdAt: v.created_at
        ? new Date(v.created_at).toLocaleString('zh-CN', { hour12: false })
        : '--',
    }))

    countUp(customerCount || 0, v => { displayStats.value.customers = v })
    countUp(vehicleCount || 0, v => { displayStats.value.vehicles = v })
    countUp(fuelCount || 0, v => { displayStats.value.fuel = v })
    countUp(newEnergyCount || 0, v => { displayStats.value.newEnergy = v })
  } catch (e) {
    console.error('加载统计失败：', e)
  } finally {
    loading.value = false
  }
}

const statCards = computed(() => [
  { key: 'customers', label: '客户总数', value: displayStats.value.customers, tone: 'red',    icon: UserFilled },
  { key: 'vehicles',  label: '车辆总数', value: displayStats.value.vehicles,  tone: 'blue',   icon: Van },
  { key: 'fuel',      label: '燃油车辆', value: displayStats.value.fuel,      tone: 'orange', icon: Odometer },
  { key: 'newEnergy', label: '新能源车', value: displayStats.value.newEnergy, tone: 'green',  icon: Lightning },
])

onMounted(loadStats)
</script>

<template>
  <div class="admin-dashboard">
    <div class="welcome-banner">
      <div class="welcome-icon">
        <el-icon><DataBoard /></el-icon>
      </div>
      <div class="welcome-text">
        <h2>数据总览</h2>
        <p>实时掌握客户与车辆资产全貌</p>
      </div>
      <div class="welcome-deco"></div>
    </div>

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

    <div class="chart-row">
      <section class="light-panel dist-panel">
        <div class="panel-title">
          <span class="dot"></span>
          <span>客户车辆分布</span>
          <span class="count">共 {{ customerDist.length }} 个客户</span>
        </div>

        <div v-if="customerDist.length === 0" class="empty-tip">暂无数据</div>

        <div v-else class="bar-list">
          <div
            v-for="(item, i) in customerDist"
            :key="item.name"
            class="bar-item"
            :style="{ '--i': i }"
          >
            <div class="bar-label" :title="item.name">{{ item.name }}</div>
            <div class="bar-track">
              <div class="bar-fill" :style="{ width: item.percent + '%' }">
                <span class="bar-count">{{ item.count }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="light-panel recent-panel">
        <div class="panel-title">
          <span class="dot"></span>
          <span>最近添加的车辆</span>
        </div>

        <div v-if="recentVehicles.length === 0" class="empty-tip">暂无数据</div>

        <div v-else class="recent-list">
          <div
            v-for="(v, i) in recentVehicles"
            :key="v.plate + i"
            class="recent-item"
            :style="{ animationDelay: (i * 0.06) + 's' }"
          >
            <div class="recent-plate">{{ v.plate }}</div>
            <div class="recent-meta">
              <span class="meta-org">{{ v.org || '未分配' }}</span>
              <span class="meta-dot">·</span>
              <span class="meta-type">{{ v.vehicle_type || '--' }}</span>
              <span class="meta-dot">·</span>
              <span class="meta-fuel">{{ v.fuel_type || '--' }}</span>
            </div>
            <div class="recent-time">{{ v.createdAt }}</div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.admin-dashboard {
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: pageIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes pageIn {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}

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

.welcome-icon {
  width: 52px; height: 52px;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #FFFFFF;
  border-radius: 12px;
  font-size: 26px;
  box-shadow: 0 8px 20px rgba(200, 16, 46, 0.25);
  flex-shrink: 0;
}
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
  padding: 22px 22px;
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
.stat-card.tone-blue   { color: #2563EB; }
.stat-card.tone-orange { color: #EA580C; }
.stat-card.tone-green  { color: #059669; }

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
.stat-card.tone-blue   .stat-icon { background: linear-gradient(135deg, #2563EB, #1d4ed8); box-shadow: 0 8px 20px rgba(37, 99, 235, 0.22); }
.stat-card.tone-orange .stat-icon { background: linear-gradient(135deg, #F97316, #EA580C); box-shadow: 0 8px 20px rgba(249, 115, 22, 0.22); }
.stat-card.tone-green  .stat-icon { background: linear-gradient(135deg, #10B981, #059669); box-shadow: 0 8px 20px rgba(16, 185, 129, 0.22); }
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
  right: -30px;
  bottom: -30px;
  width: 120px; height: 120px;
  border-radius: 50%;
  background: radial-gradient(circle, currentColor 0%, transparent 70%);
  opacity: 0.06;
  pointer-events: none;
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.stat-card:hover .stat-bg-circle { transform: scale(1.3); }

.chart-row {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 16px;
  min-height: 320px;
}

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
  grid-template-columns: 140px 1fr;
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
@keyframes barGrow {
  from { width: 0 !important; }
}
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
  cursor: default;
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

.recent-plate {
  font-size: 14px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: 0.8px;
  margin-bottom: 4px;
}

.recent-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #64748B;
  margin-bottom: 4px;
}
.meta-org { color: #c8102e; font-weight: 600; }
.meta-dot { color: #CBD5E1; }

.recent-time {
  font-size: 11px;
  color: #94A3B8;
  font-family: 'Courier New', monospace;
}

.empty-tip {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94A3B8;
  font-size: 13px;
  padding: 40px 0;
}

@media (max-width: 1200px) {
  .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .chart-row { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .stat-grid { grid-template-columns: 1fr; }
  .stat-value { font-size: 22px; }
}
</style>