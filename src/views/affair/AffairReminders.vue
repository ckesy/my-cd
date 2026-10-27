<template>
  <div class="affair-page">
    <div class="af-card" style="padding:12px 14px">
      <div class="af-filter">
        <el-input v-model="q.plate" placeholder="车牌号" clearable style="width:150px" />
        <el-select v-model="q.level" placeholder="级别" clearable style="width:130px">
          <el-option v-for="l in ['已逾期', '临近', '快到期']" :key="l" :label="l" :value="l" />
        </el-select>
        <el-select v-model="q.certType" placeholder="证件类型" clearable style="width:130px">
          <el-option v-for="t in CERT_TYPES" :key="t.key" :label="t.name" :value="t.key" />
        </el-select>
        <span class="sub" style="color:#94A3B8;font-size:12px">共 {{ filtered.length }} 条</span>
        <div style="margin-left:auto;display:flex;gap:7px">
          <el-button size="small" plain :loading="loading" @click="refresh">刷新</el-button>
          <el-button size="small" type="danger" @click="addOpen = true">+ 人工添加</el-button>
        </div>
      </div>
    </div>

    <div class="af-card flex1">
      <div class="af-tool" style="margin-bottom:11px">
        <span class="vbar"></span>
        <h3>提醒事项</h3>
        <span class="cnt">逾期每天提醒，直到处理或取消</span>
      </div>

      <div class="tabs">
        <span v-for="t in tabs" :key="t.key" :class="{ on: status === t.key }" @click="status = t.key">
          {{ t.label }}<em :style="{ color: t.color || '#94A3B8' }">{{ t.count }}</em>
        </span>
      </div>

      <div class="af-table-wrap" style="padding-right:2px">
        <div v-if="!filtered.length" class="af-empty">
          <div class="ic">✓</div>{{ status === '待处理' ? '没有待处理的提醒事项' : '暂无记录' }}
        </div>
        <div v-else class="af-rem">
          <div v-for="r in filtered" :key="r.id" class="af-rem-item"
            :style="{ borderLeftColor: meta(r.level).color }" @click="open(r)">
            <div class="ic" :style="{ background: meta(r.level).bg, color: meta(r.level).color }">
              {{ r.cert_type === 'maintain' ? '保' : '证' }}
            </div>
            <div class="m">
              <b>{{ r.title }}</b>
              <p>{{ r.content }}</p>
            </div>
            <span class="af-pill" :style="{ background: meta(r.level).bg, color: meta(r.level).color }">
              <i class="d"></i>{{ r.level }}
            </span>
            <span class="af-pill" style="background:#F1F5F9;color:#64748B">
              {{ r.source === 'manual' ? '人工' : '自动' }}
            </span>
            <span class="tm">{{ r.due_date || '按里程' }}</span>
            <span v-if="status !== '待处理'" class="af-pill"
              :style="r.status === '已处理' ? 'background:#ECFDF5;color:#047857' : 'background:#F1F5F9;color:#64748B'">
              {{ r.status }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <ReminderDrawer v-model="drawerVisible" :reminder="current" @changed="refresh" />

    <!-- 人工添加 -->
    <el-dialog v-model="addOpen" title="人工添加提醒事项" width="520px" append-to-body class="af-dialog">
      <el-form label-width="96px" class="af-form">
        <el-form-item label="车辆">
          <el-select v-model="addForm.plate" filterable allow-create clearable placeholder="选车牌（可不选）"
            style="width:100%" @change="onPickPlate">
            <el-option v-for="p in plateOptions" :key="p" :label="p" :value="p" />
          </el-select>
        </el-form-item>
        <el-form-item label="提醒标题" required>
          <el-input v-model="addForm.title" placeholder="例如：沪A·D12345 年检到期" />
        </el-form-item>
        <el-form-item label="到期日">
          <el-date-picker v-model="addForm.due_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="下次提醒">
          <el-date-picker v-model="addForm.next_remind_at" type="datetime" value-format="YYYY-MM-DD HH:mm:ss"
            style="width:100%" />
        </el-form-item>
        <!-- ⭐ 接收对象不再让用户选：车务提醒固定给「主账号 + 车务管理员」 -->
        <el-form-item label="内容">
          <el-input v-model="addForm.content" type="textarea" :rows="3" resize="none" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button plain @click="addOpen = false">取消</el-button>
        <el-button type="danger" :loading="adding" @click="doAdd">确定添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import '@/assets/affair.css'
import {
  loadReminders, createManualReminder, LEVEL_META, loadVehiclePlates, nextRemindAt,
} from '@/utils/vehicleAffair'
import { CERT_TYPES, CERT_NAME } from '@/config/vehicleColumns'
import ReminderDrawer from '@/components/affair/ReminderDrawer.vue'

const loading = ref(false)
const all = ref([])
const status = ref('待处理')
const q = ref({ plate: '', level: '', certType: '' })
const drawerVisible = ref(false)
const current = ref(null)
const plateOptions = ref([])

const meta = (lv) => LEVEL_META[lv] || LEVEL_META['正常']

const filtered = computed(() => all.value.filter(r => {
  if (q.value.plate && !String(r.plate || '').includes(q.value.plate)) return false
  if (q.value.level && r.level !== q.value.level) return false
  if (q.value.certType && r.cert_type !== q.value.certType) return false
  return true
}))

const tabs = computed(() => {
  const n = (s) => all.value.filter(r => r.status === s).length
  return [
    { key: '待处理', label: '待处理', count: n('待处理'), color: '#C8102E' },
    { key: '已处理', label: '已处理', count: n('已处理'), color: '#047857' },
    { key: '已忽略', label: '已忽略', count: n('已忽略') },
    { key: '', label: '全部', count: all.value.length },
  ]
})

const refresh = async () => {
  loading.value = true
  try {
    all.value = await loadReminders({ status: status.value || null })
  } finally { loading.value = false }
}
watch(status, refresh)

const open = (r) => {
  if (r.status !== '待处理') {
    ElMessage.info(`这条已经「${r.status}」${r.handled_at ? '，处理于 ' + dayjs(r.handled_at).format('MM-DD HH:mm') : ''}`)
    return
  }
  current.value = r
  drawerVisible.value = true
}

/* ---------- 人工添加 ---------- */
const addOpen = ref(false)
const adding = ref(false)
/* 接收对象已从表单去掉：车务提醒恒为 tenant（主账号 + 车务管理员），
   由 createManualReminder 的默认值兜住，这里不再传 receiver_scope */
const addForm = ref({ plate: '', title: '', due_date: '', next_remind_at: '', content: '' })

const onPickPlate = () => {
  if (addForm.value.plate && !addForm.value.title) {
    addForm.value.title = `${addForm.value.plate} 提醒`
  }
}

const doAdd = async () => {
  const f = addForm.value
  if (!f.title.trim()) return ElMessage.warning('请填提醒标题')
  adding.value = true
  try {
    await createManualReminder({
      ...f,
      next_remind_at: f.next_remind_at || nextRemindAt(),
    })
    ElMessage.success('已添加')
    addOpen.value = false
    addForm.value = { plate: '', title: '', due_date: '', next_remind_at: '', content: '' }
    await refresh()
  } catch (e) {
    ElMessage.error('添加失败：' + (e.message || e))
  } finally { adding.value = false }
}

onMounted(async () => {
  /* 车牌下拉（人工添加用）：证件台账 ∩ 车辆档案 —— 只读证件会漏掉没录证件的车，
     之前「车辆找不到/无数据」就是这个原因 */
  try {
    plateOptions.value = await loadVehiclePlates()
  } catch { /* ignore */ }
  await refresh()
})
</script>

<style scoped>
.tabs { display: flex; gap: 5px; margin-bottom: 11px; flex-wrap: wrap; }
.tabs span { font-size: 12.5px; font-weight: 700; color: #64748B; padding: 6px 12px; border-radius: 8px; cursor: pointer; user-select: none; }
.tabs span:hover { background: #F8FAFC; }
.tabs span.on { background: #FDF2F4; color: #C8102E; }
.tabs em { font-style: normal; margin-left: 5px; font-weight: 800; font-family: var(--num-font, Arial, sans-serif); }
</style>
