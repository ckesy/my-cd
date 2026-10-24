<template>
  <div class="affair-page">
    <!-- 筛选 -->
    <div class="af-card" style="padding:12px 14px">
      <div class="af-filter">
        <el-input v-model="q.plate" placeholder="车牌号" clearable style="width:150px" @keyup.enter="applyFilter" />
        <el-select v-model="q.org" placeholder="所属机构" clearable style="width:150px">
          <el-option v-for="o in orgOptions" :key="o" :label="o" :value="o" />
        </el-select>
        <el-select v-model="q.certType" placeholder="证件类型" clearable style="width:130px">
          <el-option v-for="t in CERT_TYPES" :key="t.key" :label="t.name" :value="t.key" />
        </el-select>
        <el-select v-model="q.status" placeholder="到期状态" clearable style="width:130px">
          <el-option v-for="s in STATUS_LIST" :key="s" :label="s" :value="s" />
        </el-select>
        <el-date-picker v-model="q.range" type="daterange" value-format="YYYY-MM-DD"
          start-placeholder="到期起" end-placeholder="到期止" style="width:240px" />
        <el-button type="danger" size="small" @click="applyFilter">查询</el-button>
        <el-button size="small" plain @click="resetFilter">重置</el-button>
        <div style="margin-left:auto;display:flex;gap:7px">
          <el-button size="small" plain :loading="loading" @click="refresh">刷新</el-button>
          <el-button size="small" plain @click="importVisible = true">批量导入</el-button>
        </div>
      </div>
    </div>

    <!-- 工具行 + Tab -->
    <div class="af-card flex1">
      <div class="af-tool" style="margin-bottom:11px">
        <span class="vbar"></span>
        <h3>证件台账</h3>
        <span class="cnt">共 {{ filtered.length }} 项 · {{ plateCount }} 台车</span>
      </div>

      <div class="tabs">
        <span v-for="t in tabs" :key="t.key" :class="{ on: tab === t.key }" @click="tab = t.key">
          {{ t.label }}<em :style="{ color: t.color || '#94A3B8' }">{{ t.count }}</em>
        </span>
      </div>

      <div class="af-table-wrap">
        <table class="af-table">
          <thead>
            <tr>
              <th style="width:112px">车牌号</th>
              <th style="width:110px">所属机构</th>
              <th style="width:92px">证件类型</th>
              <th style="width:170px">证号 / 保单号</th>
              <th style="width:104px">起期</th>
              <th style="width:104px">到期日</th>
              <th style="width:100px">剩余</th>
              <th style="width:110px">提醒节点</th>
              <th style="width:96px">状态</th>
              <th style="width:96px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in pageRows" :key="c.id">
              <td>{{ c.plate }}</td>
              <td class="sub">{{ c.org || '--' }}</td>
              <td>
                <span class="af-ctype" :style="{ background: typeMeta(c.cert_type).bg, color: typeMeta(c.cert_type).color }">
                  {{ typeMeta(c.cert_type).name }}
                </span>
              </td>
              <td class="sub">{{ c.cert_no || '--' }}</td>
              <td class="sub num">{{ c.cert_type === 'maintain' ? fmtDate(c.start_date) : fmtDate(c.start_date) || '--' }}</td>
              <td class="num">
                <span v-if="c.cert_type === 'maintain'" class="sub">按里程</span>
                <span v-else :style="{ color: c._level === '已逾期' ? '#C8102E' : c._level === '临近' ? '#EA580C' : '' }">
                  {{ fmtDate(c.expire_date) || '未录入' }}
                </span>
              </td>
              <td class="num" :style="{ color: meta(c._level).color, fontWeight: 800 }">
                {{ c.cert_type === 'maintain' ? fmtKm(c._left) : fmtLeft(c._left) }}
              </td>
              <td>
                <span class="sub">{{ remindText(c) }}</span>
              </td>
              <td>
                <span class="af-pill" :style="{ background: meta(c._level).bg, color: meta(c._level).color }">
                  <i class="d"></i>{{ c._level }}
                </span>
              </td>
              <td>
                <el-button link type="danger" size="small" @click="openEdit(c)">编辑</el-button>
                <el-button link size="small" @click="openAdd(c.plate)">加证件</el-button>
              </td>
            </tr>
            <tr v-if="!pageRows.length">
              <td colspan="10" class="empty">{{ loading ? '加载中…' : '没有符合条件的证件' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pager">
        <el-pagination background small layout="total, sizes, prev, pager, next" :total="filtered.length"
          :page-size="pageSize" :current-page="page" :page-sizes="[20, 50, 100]"
          @update:page-size="v => (pageSize = v, page = 1)" @update:current-page="v => (page = v)" />
      </div>
    </div>

    <!-- 编辑证件 -->
    <el-dialog v-model="editVisible" title="编辑证件" width="520px" append-to-body class="af-dialog">
      <el-form v-if="form" label-width="104px" class="af-form">
        <el-form-item label="车牌号"><b>{{ form.plate }}</b></el-form-item>
        <el-form-item label="证件类型">
          <el-select v-model="form.cert_type" style="width:100%" :disabled="!!form.id">
            <el-option v-for="t in CERT_TYPES" :key="t.key" :label="t.name" :value="t.key" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.cert_type !== 'maintain'" label="证号 / 保单号">
          <el-input v-model="form.cert_no" placeholder="可不填" />
        </el-form-item>
        <el-form-item v-if="form.cert_type !== 'maintain'" label="起期">
          <el-date-picker v-model="form.start_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item v-if="form.cert_type !== 'maintain'" label="到期日">
          <el-date-picker v-model="form.expire_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>

        <template v-if="form.cert_type === 'maintain'">
          <el-form-item label="最近保养日期">
            <el-date-picker v-model="form.start_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
          </el-form-item>
          <el-form-item label="上次保养里程">
            <el-input v-model.number="form.last_maintain_km" placeholder="km"><template #append>km</template></el-input>
          </el-form-item>
          <el-form-item label="间隔里程">
            <el-input v-model.number="form.maintain_interval_km" placeholder="10000"><template #append>km</template></el-input>
          </el-form-item>
        </template>

        <el-form-item :label="form.cert_type === 'maintain' ? '提前提醒(km)' : '提前提醒(天)'">
          <div class="af-chips">
            <span v-for="d in remindPool" :key="d" class="af-chip"
              :class="{ on: form.remind_days.includes(d) }" @click="toggleDay(d)">{{ d }}</span>
          </div>
        </el-form-item>
        <el-form-item label="启用提醒">
          <el-switch v-model="form.remind_enabled" />
          <span class="sub" style="margin-left:9px;font-size:12px;color:#94A3B8">关掉 = 该项彻底不提醒</span>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button v-if="form?.id" type="danger" plain style="float:left" @click="doDelete">删除</el-button>
        <el-button plain @click="editVisible = false">取消</el-button>
        <el-button type="danger" :loading="saving" @click="doSave">保存</el-button>
      </template>
    </el-dialog>

    <VehicleImportDialog v-model="importVisible" @done="refresh" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import '@/assets/affair.css'
import {
  loadCerts, fetchKmMap, levelOf, LEVEL_META, parseDays,
  upsertCert, deleteCert, syncReminders, fmtDate, fmtLeft, fmtKm,
  MAINTAIN_KM_OPTIONS,
} from '@/utils/vehicleAffair'
import { CERT_TYPES, CERT_META, REMIND_DAYS_OPTIONS, REMIND_DAYS_DEFAULT } from '@/config/vehicleColumns'
import VehicleImportDialog from '@/components/affair/VehicleImportDialog.vue'

const route = useRoute()
const STATUS_LIST = ['已逾期', '临近', '快到期', '正常', '未录入', '需核对']

const loading = ref(false)
const all = ref([])
const kmMap = ref({})
const q = ref({ plate: '', org: '', certType: '', status: '', range: null })
const applied = ref({ ...q.value })
const tab = ref('全部')
const page = ref(1)
const pageSize = ref(20)
const importVisible = ref(false)

const meta = (lv) => LEVEL_META[lv] || LEVEL_META['正常']
const typeMeta = (k) => CERT_META[k] || { name: '证件', color: '#64748B', bg: '#F1F5F9' }
const remindText = (c) => {
  const a = parseDays(c.remind_days)
  if (!a.length) return '默认'
  return a.join('/') + (c.cert_type === 'maintain' ? ' km' : ' 天')
}
const plateCount = computed(() => new Set(filtered.value.map(c => c.plate)).size)

const filtered = computed(() => {
  const f = applied.value
  return all.value.filter(c => {
    if (tab.value !== '全部' && c._level !== tab.value) return false
    if (f.plate && !String(c.plate || '').includes(f.plate)) return false
    if (f.org && c.org !== f.org) return false
    if (f.certType && c.cert_type !== f.certType) return false
    if (f.status && c._level !== f.status) return false
    if (f.range?.length === 2 && c.expire_date) {
      if (c.expire_date < f.range[0] || c.expire_date > f.range[1]) return false
    }
    return true
  })
})
const pageRows = computed(() => {
  const s = (page.value - 1) * pageSize.value
  return filtered.value.slice(s, s + pageSize.value)
})
const orgOptions = computed(() => [...new Set(all.value.map(c => c.org).filter(Boolean))])

const tabs = computed(() => {
  const base = all.value.filter(c => {
    const f = applied.value
    if (f.plate && !String(c.plate || '').includes(f.plate)) return false
    if (f.org && c.org !== f.org) return false
    if (f.certType && c.cert_type !== f.certType) return false
    return true
  })
  const n = (lv) => base.filter(c => c._level === lv).length
  return [
    { key: '全部', label: '全部', count: base.length },
    { key: '已逾期', label: '已逾期', count: n('已逾期'), color: '#C8102E' },
    { key: '临近', label: '临近 ≤3天', count: n('临近'), color: '#EA580C' },
    { key: '快到期', label: '快到期', count: n('快到期'), color: '#B45309' },
    { key: '正常', label: '正常', count: n('正常') },
    { key: '未录入', label: '未录入', count: n('未录入') + n('需核对') },
  ]
})
watch(tab, () => { page.value = 1 })

const applyFilter = () => { applied.value = { ...q.value }; page.value = 1 }

const resetFilter = () => {
  q.value = { plate: '', org: '', certType: '', status: '', range: null }
  applyFilter()
}

const refresh = async () => {
  loading.value = true
  try {
    const rows = await loadCerts()
    const plates = rows.filter(r => r.cert_type === 'maintain').map(r => r.plate)
    kmMap.value = plates.length ? await fetchKmMap(plates) : {}
    rows.forEach(c => {
      const { level, left } = levelOf(c, c.cert_type === 'maintain' ? kmMap.value[c.plate] : null)
      c._level = level; c._left = left
    })
    all.value = rows
    if (rows.length) await syncReminders(rows, kmMap.value)
  } finally { loading.value = false }
}

/* ---------- 编辑 ---------- */
const editVisible = ref(false)
const saving = ref(false)
const form = ref(null)
const remindPool = computed(() => (form.value?.cert_type === 'maintain' ? MAINTAIN_KM_OPTIONS : REMIND_DAYS_OPTIONS))

const openEdit = (c) => {
  form.value = {
    id: c.id, plate: c.plate, org: c.org, cert_type: c.cert_type,
    cert_no: c.cert_no || '', start_date: c.start_date || '', expire_date: c.expire_date || '',
    last_maintain_km: c.last_maintain_km || null,
    maintain_interval_km: c.maintain_interval_km || 10000,
    remind_days: parseDays(c.remind_days).length ? parseDays(c.remind_days) : [...REMIND_DAYS_DEFAULT],
    remind_enabled: c.remind_enabled !== false,
    remark: c.remark || '',
    owner_account: c.owner_account, customer_id: c.customer_id, vehicle_id: c.vehicle_id,
  }
  editVisible.value = true
}
const openAdd = (plate) => {
  openEdit({ plate, cert_type: 'sy_insurance', remind_days: [30], remind_enabled: true, org: '' })
  form.value.id = null
}
const toggleDay = (d) => {
  const a = form.value.remind_days
  const i = a.indexOf(d)
  i >= 0 ? a.splice(i, 1) : a.push(d)
  a.sort((x, y) => y - x)
}
const doSave = async () => {
  const f = form.value
  if (f.cert_type !== 'maintain' && !f.expire_date) return ElMessage.warning('请选择到期日')
  if (f.cert_type === 'maintain' && !f.last_maintain_km) return ElMessage.warning('请填上次保养里程')
  saving.value = true
  try {
    const row = { ...f }
    delete row.id
    if (f.id) { row.id = f.id }
    await upsertCert(row)
    ElMessage.success('已保存')
    editVisible.value = false
    await refresh()
  } catch (e) {
    ElMessage.error('保存失败：' + (e.message || e))
  } finally { saving.value = false }
}
const doDelete = async () => {
  try {
    await ElMessageBox.confirm(`删除「${form.value.plate} · ${typeMeta(form.value.cert_type).name}」这一项证件？`, '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
    await deleteCert(form.value.id)
    ElMessage.success('已删除')
    editVisible.value = false
    await refresh()
  } catch (e) { /* 取消 */ }
}

onMounted(async () => {
  if (route.query.status) { q.value.status = String(route.query.status); applied.value = { ...q.value } }
  await refresh()
})
</script>

<style scoped>
.tabs { display: flex; gap: 5px; margin-bottom: 11px; flex-wrap: wrap; }
.tabs span {
  font-size: 12.5px; font-weight: 700; color: #64748B; padding: 6px 12px;
  border-radius: 8px; cursor: pointer; user-select: none;
}
.tabs span:hover { background: #F8FAFC; }
.tabs span.on { background: #FDF2F4; color: #C8102E; }
.tabs em { font-style: normal; margin-left: 5px; font-weight: 800; font-family: var(--num-font, Arial, sans-serif); }
.pager { display: flex; justify-content: flex-end; padding-top: 11px; }
</style>
