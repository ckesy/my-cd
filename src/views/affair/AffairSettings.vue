<template>
  <div class="affair-page" style="overflow:auto">
    <div class="af-tool">
      <span class="vbar"></span>
      <h3>提醒设置</h3>
      <span class="cnt">全局口径 · 逐项的提醒节点请到证件台账改</span>
      <div class="right">
        <el-button size="small" plain :loading="loading" @click="load">重置</el-button>
        <el-button size="small" type="danger" :loading="saving" @click="save">保存设置</el-button>
      </div>
    </div>

    <div class="af-card">
      <div class="af-sec-title">提醒时间</div>
      <div class="row2">
        <div class="fld">
          <label>每天提醒时间</label>
          <el-select v-model="form.remind_hour" style="width:100%">
            <el-option v-for="h in hours" :key="h" :label="`${String(h).padStart(2, '0')}:00`" :value="h" />
          </el-select>
        </div>
        <div class="fld">
          <label>周末是否提醒</label>
          <div style="display:flex;align-items:center;gap:10px;height:32px">
            <el-switch v-model="form.weekend" />
            <span class="hint">{{ form.weekend ? '周六日照常提醒' : '周末不提醒，周一补' }}</span>
          </div>
        </div>
      </div>
      <div class="af-note" style="margin-top:4px">
        逾期后<b>每天</b>都会提醒一次，直到有人处理或取消；不会自动停。
      </div>

      <div class="af-sec-title">接收人</div>
      <div class="recv">
        <div class="recv-row">
          <div class="recv-m">
            <b>主账号</b>
            <p>不可关闭 —— 证件过期是老板必须知道的事</p>
          </div>
          <el-switch :model-value="true" disabled />
        </div>
        <div class="recv-row">
          <div class="recv-m">
            <b>管理员</b>
            <p>角色里勾了「管理员」且模块已开通的账号自动收到，只看本机构的车</p>
          </div>
          <span class="af-pill" style="background:#EFF4FF;color:#1D4ED8">按权限自动</span>
        </div>
      </div>

      <div class="af-sec-title">各类证件默认提醒节点（新建车辆时套用，可逐车改）</div>
      <div class="defs">
        <div v-for="t in CERT_TYPES" :key="t.key" class="def-row">
          <span class="af-ctype" :style="{ background: t.bg, color: t.color }">{{ t.name }}</span>
          <div class="af-chips">
            <span v-for="d in poolOf(t.key)" :key="d" class="af-chip"
              :class="{ on: (form.default_days[t.key] || []).includes(d) }" @click="toggle(t.key, d)">
              {{ d }}{{ t.key === 'maintain' ? ' km' : ' 天' }}
            </span>
          </div>
          <span class="hint">{{ t.key === 'maintain' ? '按里程判定' : '留空 = 默认 30 天' }}</span>
        </div>
      </div>

      <div class="af-sec-title">保养</div>
      <div class="row2">
        <div class="fld">
          <label>默认间隔里程</label>
          <el-input v-model.number="form.maintain_interval_km" placeholder="10000">
            <template #append>km</template>
          </el-input>
        </div>
        <div class="fld">
          <label>当前里程来源</label>
          <div class="src">东风车联网 · 当天最大里程（每 10 分钟缓存）</div>
        </div>
      </div>
    </div>

    <div class="af-card" style="margin-bottom:2px">
      <div class="af-sec-title">口径说明</div>
      <table class="af-table" style="font-size:12.5px">
        <thead><tr><th style="width:110px">级别</th><th style="width:230px">判定</th><th>提醒频率</th></tr></thead>
        <tbody>
          <tr><td><span class="af-pill" style="background:#ECFDF5;color:#047857"><i class="d"></i>正常</span></td>
            <td class="sub">剩余 &gt; 最大提醒节点</td><td class="sub">不提醒</td></tr>
          <tr><td><span class="af-pill" style="background:#FFF7ED;color:#B45309"><i class="d"></i>快到期</span></td>
            <td class="sub">剩余 ≤ 勾选节点（90/30/15/7/3）</td><td class="sub">每个节点各 1 次</td></tr>
          <tr><td><span class="af-pill" style="background:#FFF4ED;color:#EA580C"><i class="d"></i>临近</span></td>
            <td class="sub">0 &lt; 剩余 ≤ 3 天</td><td class="sub">每天 1 次</td></tr>
          <tr><td><span class="af-pill" style="background:#FDF2F4;color:#C8102E"><i class="d"></i>已逾期</span></td>
            <td class="sub">剩余 &lt; 0</td><td class="sub">每天 1 次，直到处理</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import '@/assets/affair.css'
import { loadSettings, saveSettings, DEFAULT_SETTINGS, MAINTAIN_KM_OPTIONS } from '@/utils/vehicleAffair'
import { CERT_TYPES, REMIND_DAYS_OPTIONS } from '@/config/vehicleColumns'

const hours = [6, 7, 8, 9, 10, 11, 12]
const loading = ref(false)
const saving = ref(false)
const form = ref(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)))

const poolOf = (key) => (key === 'maintain' ? MAINTAIN_KM_OPTIONS : REMIND_DAYS_OPTIONS)

const load = async () => {
  loading.value = true
  try {
    const s = await loadSettings()
    form.value = {
      remind_hour: s.remind_hour ?? 9,
      weekend: s.weekend !== false,
      receivers: { master: true, platform: !!s.receivers?.platform },
      default_days: { ...DEFAULT_SETTINGS.default_days, ...(s.default_days || {}) },
      maintain_interval_km: s.maintain_interval_km ?? 10000,
    }
  } finally { loading.value = false }
}

const toggle = (key, d) => {
  const arr = form.value.default_days[key] || []
  const i = arr.indexOf(d)
  i >= 0 ? arr.splice(i, 1) : arr.push(d)
  arr.sort((a, b) => b - a)
  form.value.default_days[key] = arr
}

const save = async () => {
  saving.value = true
  try {
    await saveSettings({
      remind_hour: form.value.remind_hour,
      weekend: form.value.weekend,
      receivers: { ...form.value.receivers, master: true },
      default_days: form.value.default_days,
      maintain_interval_km: Number(form.value.maintain_interval_km) || 10000,
    })
    ElMessage.success('已保存')
  } catch (e) {
    ElMessage.error('保存失败：' + (e.message || e))
  } finally { saving.value = false }
}

onMounted(load)
</script>

<style scoped>
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.fld label { display: block; font-size: 12.5px; color: #64748B; font-weight: 600; margin-bottom: 6px; }
.hint { font-size: 11.5px; color: #94A3B8; }
.recv { display: flex; flex-direction: column; gap: 8px; }
.recv-row {
  display: flex; align-items: center; gap: 12px; padding: 11px 13px;
  border: 1px solid #EEF2F7; border-radius: 9px;
}
.recv-m { flex: 1; }
.recv-m b { font-size: 13px; }
.recv-m p { margin: 2px 0 0; font-size: 11.5px; color: #94A3B8; }
.defs { display: flex; flex-direction: column; gap: 9px; }
.def-row { display: flex; align-items: center; gap: 12px; }
.def-row .af-ctype { flex: 0 0 auto; min-width: 58px; justify-content: center; }
.def-row .hint { margin-left: auto; }
.src {
  height: 32px; display: flex; align-items: center; padding: 0 11px;
  border: 1px dashed #E2E8F0; border-radius: 8px; font-size: 12px; color: #94A3B8;
}
</style>
