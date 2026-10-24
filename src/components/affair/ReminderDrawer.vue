<template>
  <el-drawer v-model="visible" size="460px" :with-header="false" append-to-body destroy-on-close>
    <div v-if="r" class="rd">
      <div class="rd-head">
        <div class="rd-title">{{ r.title }}</div>
        <div class="rd-tags">
          <span class="af-pill" :style="{ background: meta(r.level).bg, color: meta(r.level).color }">
            <i class="d"></i>{{ r.level }}
          </span>
          <span class="af-pill" style="background:#F1F5F9;color:#64748B">{{ r.source === 'manual' ? '人工添加' : '自动生成' }}</span>
          <span class="af-pill" style="background:#F1F5F9;color:#64748B">{{ recvText }}</span>
          <span class="rd-no">{{ r.reminder_no }}</span>
        </div>
      </div>

      <div class="rd-box">
        <div class="row"><span>车辆</span><b>{{ r.plate }}</b><em v-if="r.org">{{ r.org }}</em></div>
        <div class="row"><span>证件</span><b>{{ certName(r.cert_type) }}</b></div>
        <div class="row" v-if="r.due_date"><span>到期日</span><b class="num">{{ r.due_date }}</b>
          <em :style="{ color: meta(r.level).color, fontWeight: 800 }">{{ fmtLeft(dayLeft) }}</em>
        </div>
        <div class="row"><span>下次提醒</span><b class="num">{{ r.next_remind_at ? fmtTime(r.next_remind_at) : '—' }}</b></div>
        <div class="row" v-if="r.remind_days?.length">
          <span>提醒节点</span><b>{{ r.remind_days.join(' / ') }}{{ r.cert_type === 'maintain' ? ' km' : ' 天' }}</b>
        </div>
      </div>

      <div class="rd-label">提醒内容（可编辑）</div>
      <el-input v-model="content" type="textarea" :rows="3" resize="none" />

      <div class="rd-actions">
        <el-button plain @click="postponeOpen = true">设置下次提醒</el-button>
        <el-button plain @click="cancelRemind">取消提醒</el-button>
        <el-button type="danger" @click="renewOpen = true">已续保 · 更新到期日</el-button>
      </div>

      <div class="af-note" style="margin-top:14px">
        <div>
          <b>取消提醒 ≠ 已换证</b><br>
          取消只是关掉这条待办，档案里的到期日不变。明天扫描时若仍过期，会<b>重新生成并再问一次</b>。
          要彻底不提醒，请到证件台账把该项的提醒开关关掉。
        </div>
      </div>

      <div class="rd-foot">
        <el-button text @click="visible = false">关闭</el-button>
      </div>
    </div>

    <!-- 设置下次提醒 -->
    <el-dialog v-model="postponeOpen" title="设置下次提醒时间" width="380px" append-to-body class="af-dialog">
      <div class="af-chips" style="margin-bottom:12px">
        <span v-for="o in quickTimes" :key="o.label" class="af-chip" :class="{ on: quick === o.label }"
          @click="pickQuick(o)">{{ o.label }}</span>
      </div>
      <el-date-picker v-model="postponeAt" type="datetime" value-format="YYYY-MM-DD HH:mm:ss"
        placeholder="选择具体时间" style="width:100%" />
      <template #footer>
        <el-button plain @click="postponeOpen = false">取消</el-button>
        <el-button type="danger" @click="doPostpone">确定</el-button>
      </template>
    </el-dialog>

    <!-- 更新到期日 -->
    <el-dialog v-model="renewOpen" :title="`更新${certName(r?.cert_type)}信息`" width="460px" append-to-body class="af-dialog">
      <el-form label-width="88px" class="af-form">
        <el-form-item v-if="r?.cert_type !== 'maintain'" label="证号/保单号">
          <el-input v-model="renewForm.cert_no" placeholder="可不填" />
        </el-form-item>
        <el-form-item v-if="r?.cert_type !== 'maintain'" label="起期">
          <el-date-picker v-model="renewForm.start_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item :label="r?.cert_type === 'maintain' ? '下次保养里程' : '到期日'" required>
          <el-input v-if="r?.cert_type === 'maintain'" v-model.number="renewForm.last_maintain_km"
            placeholder="填当前里程即可" />
          <el-date-picker v-else v-model="renewForm.expire_date" type="date" value-format="YYYY-MM-DD"
            style="width:100%" />
        </el-form-item>
        <el-form-item label="提前提醒">
          <div class="af-chips">
            <span v-for="d in remindPool" :key="d" class="af-chip"
              :class="{ on: renewForm.remind_days.includes(d) }" @click="toggleDay(d)">{{ d }}</span>
          </div>
        </el-form-item>
      </el-form>
      <div class="af-note info" style="margin-top:4px">
        保存后会关闭当前提醒，并按新日期重新排期。
      </div>
      <template #footer>
        <el-button plain @click="renewOpen = false">取消</el-button>
        <el-button type="danger" :loading="saving" @click="doRenew">保存并关闭待办</el-button>
      </template>
    </el-dialog>

    <!-- 更新后二次询问 -->
    <el-dialog v-model="askOpen" title="新日期已进入提醒窗口" width="420px" append-to-body class="af-dialog">
      <div style="font-size:13px;line-height:1.8">
        已更新为 <b>{{ renewForm.expire_date || renewForm.last_maintain_km }}</b>，但新日期仍在提醒范围内。<br>
        是否立即生成一条新的提醒事项？
      </div>
      <template #footer>
        <el-button plain @click="askOpen = false">暂不生成</el-button>
        <el-button type="danger" @click="doAskCreate">立即生成</el-button>
      </template>
    </el-dialog>
  </el-drawer>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  LEVEL_META, cancelReminder, postponeReminder, renewCert,
  updateReminder, daysLeft, fmtLeft, syncReminders, parseDays, MAINTAIN_KM_OPTIONS,
} from '@/utils/vehicleAffair'
import { CERT_NAME, REMIND_DAYS_OPTIONS } from '@/config/vehicleColumns'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  reminder: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'changed'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})
const r = computed(() => props.reminder)
const meta = (lv) => LEVEL_META[lv] || LEVEL_META['正常']
const certName = (k) => CERT_NAME[k] || '证件'
const dayLeft = computed(() => (r.value?.due_date ? daysLeft(r.value.due_date) : null))
const fmtTime = (t) => dayjs(t).format('MM-DD HH:mm')
const recvText = computed(() => (r.value?.receiver_scope === 'platform' ? '管理端' : '主账号 + 车务管理员'))
const remindPool = computed(() => (r.value?.cert_type === 'maintain' ? MAINTAIN_KM_OPTIONS : REMIND_DAYS_OPTIONS))

const content = ref('')
watch(() => props.reminder, (v) => { content.value = v?.content || '' }, { immediate: true })

/* ---------- 设置下次提醒 ---------- */
const postponeOpen = ref(false)
const postponeAt = ref('')
const quick = ref('')
const quickTimes = [
  { label: '今天 18:00', at: () => dayjs().hour(18).minute(0).second(0) },
  { label: '明天 09:00', at: () => dayjs().add(1, 'day').hour(9).minute(0).second(0) },
  { label: '3 天后', at: () => dayjs().add(3, 'day').hour(9).minute(0).second(0) },
  { label: '下周同一时间', at: () => dayjs().add(7, 'day').hour(9).minute(0).second(0) },
]
const pickQuick = (o) => {
  quick.value = o.label
  postponeAt.value = o.at().format('YYYY-MM-DD HH:mm:ss')
}
const doPostpone = async () => {
  if (!postponeAt.value) return ElMessage.warning('请选择时间')
  await postponeReminder(r.value.id, postponeAt.value)
  if (content.value !== r.value.content) await updateReminder(r.value.id, { content: content.value })
  ElMessage.success('已改到 ' + postponeAt.value.slice(5, 16))
  postponeOpen.value = false
  emit('changed')
  visible.value = false
}

/* ---------- 取消提醒 ---------- */
const cancelRemind = async () => {
  try {
    await ElMessageBox.confirm(
      '取消后档案里的到期日不会变。明天扫描时若仍过期，会重新生成提醒。确定取消？',
      '取消提醒', { confirmButtonText: '确定取消', cancelButtonText: '再想想', type: 'warning' },
    )
    const u = JSON.parse(localStorage.getItem('currentUser') || '{}')
    await cancelReminder(r.value.id, u.name || u.account || '')
    ElMessage.success('已取消这条提醒')
    emit('changed')
    visible.value = false
  } catch (e) { /* 取消 */ }
}

/* ---------- 更新到期日 ---------- */
const renewOpen = ref(false)
const askOpen = ref(false)
const saving = ref(false)
const renewForm = ref({ cert_no: '', start_date: '', expire_date: '', last_maintain_km: null, remind_days: [] })

watch(renewOpen, (v) => {
  if (!v || !r.value) return
  renewForm.value = {
    cert_no: '',
    start_date: '',
    expire_date: r.value.due_date || '',
    last_maintain_km: null,
    remind_days: parseDays(r.value.remind_days),
  }
})
const toggleDay = (d) => {
  const a = renewForm.value.remind_days
  const i = a.indexOf(d)
  i >= 0 ? a.splice(i, 1) : a.push(d)
  a.sort((x, y) => y - x)
}
const doRenew = async () => {
  const f = renewForm.value
  if (r.value.cert_type === 'maintain') {
    if (!f.last_maintain_km) return ElMessage.warning('请填当前保养里程')
  } else if (!f.expire_date) {
    return ElMessage.warning('请选择到期日')
  }
  saving.value = true
  try {
    const u = JSON.parse(localStorage.getItem('currentUser') || '{}')
    const res = await renewCert(r.value, { ...f, by: u.name || u.account || '' })
    saving.value = false
    renewOpen.value = false
    if (res.needAsk) { askOpen.value = true; return }
    ElMessage.success('已更新到期日并关闭提醒')
    emit('changed')
    visible.value = false
  } catch (e) {
    saving.value = false
    ElMessage.error('保存失败：' + (e.message || e))
  }
}
const doAskCreate = async () => {
  try {
    const f = renewForm.value
    const cert = {
      id: r.value.cert_id, plate: r.value.plate, org: r.value.org,
      cert_type: r.value.cert_type, expire_date: f.expire_date,
      remind_days: f.remind_days, remind_enabled: true,
    }
    await syncReminders([cert], {}, {})
    ElMessage.success('已生成新的提醒事项')
    askOpen.value = false
    emit('changed')
    visible.value = false
  } catch (e) {
    ElMessage.error('生成失败：' + (e.message || e))
  }
}
</script>

<style scoped>
.rd { padding: 18px 20px 20px; font-size: 13px; }
.rd-head { margin-bottom: 14px; }
.rd-title { font-size: 15.5px; font-weight: 800; letter-spacing: -.2px; line-height: 1.45; }
.rd-tags { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 9px; }
.rd-no { margin-left: auto; font-size: 11.5px; color: #B6C0CC; font-family: var(--num-font, Arial, sans-serif); }
.rd-box { background: #FAFCFF; border: 1px solid #EEF2F7; border-radius: 9px; padding: 11px 13px; }
.rd-box .row { display: flex; align-items: center; gap: 8px; line-height: 2; }
.rd-box .row span { width: 74px; color: #94A3B8; font-size: 12px; flex: 0 0 auto; }
.rd-box .row b { color: #0F172A; }
.rd-box .row em { font-style: normal; color: #94A3B8; font-size: 12px; }
.rd-label { font-size: 11.5px; font-weight: 800; color: #94A3B8; letter-spacing: 1px; margin: 14px 0 7px; }
.rd-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 16px; }
.rd-actions :deep(.el-button) { width: 100%; height: 34px; margin: 0; font-size: 12.5px; font-weight: 700; }
.rd-foot { margin-top: 16px; text-align: right; }
</style>
