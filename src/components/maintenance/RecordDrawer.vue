<template>
  <el-drawer
    v-model="visible"
    size="520px"
    append-to-body
    :with-header="false"
    class="mt-record-drawer"
    destroy-on-close
    :close-on-click-modal="true"
    :close-on-press-escape="true"
    :before-close="handleBeforeClose"
    @closed="onClosed"
  >
    <div class="mr2">
      <div class="mr2-hd">
        <span class="mr2-t">{{ isEdit ? '编辑' : '新增' }}{{ meta.label }}记录</span>
        <span class="mr2-kind" :style="{ color: meta.color, background: meta.bg }">{{ meta.short }}</span>
        <span class="mr2-x" @click="requestClose">×</span>
      </div>

      <div class="mr2-bd">
        <!-- ===== 基本信息 ===== -->
        <div class="sec-lb">基本信息</div>
        <div class="frow">
          <el-form-item label="车辆" required class="fld">
            <el-select v-model="form.plate" filterable default-first-option
              :no-data-text="vehicles.length ? '没有匹配的车牌' : '你名下还没有车辆档案'"
              placeholder="选车牌" style="width:100%" @change="onPlateChange">
              <el-option v-for="v in vehicles" :key="v.plate" :label="v.plate" :value="v.plate">
                <span>{{ v.plate }}</span>
                <span class="opt-sub">{{ v.org || '' }}</span>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item label="日期" required class="fld" style="flex:0 0 172px">
            <el-date-picker v-model="form.happen_at" type="date" value-format="YYYY-MM-DD"
              placeholder="作业日期" style="width:100%" />
          </el-form-item>
        </div>
        <div class="frow">
          <el-form-item label="里程（km）" class="fld">
            <el-input v-model="form.mileage" placeholder="表显里程" />
          </el-form-item>

          <!-- 维修：类别 -->
          <el-form-item v-if="kind === 'repair'" label="类别" class="fld">
            <el-select v-model="form.category" placeholder="选择类别" style="width:100%">
              <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
            </el-select>
          </el-form-item>

          <!-- 保养：级别 -->
          <el-form-item v-if="kind === 'service'" label="保养级别" required class="fld">
            <el-select v-model="form.service_level" placeholder="选择级别" style="width:100%">
              <el-option v-for="l in levels" :key="l.value" :label="l.label" :value="l.value" />
            </el-select>
          </el-form-item>

          <!-- 轮胎：动作 -->
          <el-form-item v-if="kind === 'tire'" label="动作" required class="fld">
            <el-select v-model="form.tire_action" placeholder="选择动作" style="width:100%">
              <el-option v-for="a in actions" :key="a" :label="a" :value="a" />
            </el-select>
          </el-form-item>
        </div>

        <!-- ===== 作业内容 ===== -->
        <div class="sec-lb">作业内容</div>

        <!-- 维修 -->
        <template v-if="kind === 'repair'">
          <el-form-item label="故障现象" required class="fld block">
            <el-input v-model="form.fault_desc" type="textarea" :rows="2" maxlength="200" show-word-limit
              placeholder="如：右后轮异响，刹车时加重" />
          </el-form-item>
          <el-form-item label="维修项目" required class="fld block">
            <el-input v-model="form.repair_desc" type="textarea" :rows="2" maxlength="200" show-word-limit
              placeholder="如：更换右后轮轴承，检查同轴另一侧" />
          </el-form-item>
        </template>

        <!-- 保养 -->
        <template v-if="kind === 'service'">
          <el-form-item label="保养项目" class="fld block">
            <el-select v-model="form.items" multiple filterable allow-create default-first-option
              placeholder="多选，也可自己输入" style="width:100%">
              <el-option v-for="it in serviceItems" :key="it" :label="it" :value="it" />
            </el-select>
          </el-form-item>
          <div class="tip-line">
            保存后会自动更新车务里这辆车的「上次保养里程 / 日期」，并按间隔里程重算下次保养提醒。
          </div>
          <el-form-item label="间隔里程（km）" class="fld block">
            <el-input v-model="form.maintain_interval_km" placeholder="留空 = 沿用该车原设置（默认 10000）" />
          </el-form-item>
        </template>

        <!-- 轮胎 -->
        <template v-if="kind === 'tire'">
          <el-form-item label="装在哪（可多选）" class="fld block">
            <div class="pos-grid">
              <span v-for="p in positions" :key="p" class="pos-chip"
                :class="{ on: (form.tire_pos || []).includes(p) }" @click="togglePos(p)">{{ p }}</span>
            </div>
          </el-form-item>
          <div class="frow">
            <el-form-item label="规格" class="fld">
              <el-input v-model="form.tire_spec" placeholder="如 12R22.5" />
            </el-form-item>
            <el-form-item label="品牌" class="fld">
              <el-input v-model="form.tire_brand" placeholder="如 三角" />
            </el-form-item>
            <el-form-item label="胎面 mm" class="fld" style="flex:0 0 100px">
              <el-input v-model="form.tread_mm" placeholder="15.0" />
            </el-form-item>
          </div>
          <el-form-item label="胎号" class="fld block">
            <el-input v-model="form.tire_no" placeholder="选填，填了以后能算单公里成本" />
          </el-form-item>
        </template>

        <!-- ===== 费用与照片 ===== -->
        <div class="sec-lb">费用与照片</div>
        <div class="frow">
          <el-form-item :label="kind === 'service' ? '金额（¥）' : '金额（¥）'" class="fld" style="flex:0 0 172px">
            <el-input v-model="form.amount" placeholder="0.00" />
          </el-form-item>
          <el-form-item :label="kind === 'tire' ? '地点' : '维修厂 / 地点'" class="fld">
            <el-input v-model="form.vendor" placeholder="自营 或 修理厂名" />
          </el-form-item>
        </div>

        <el-form-item label="照片" class="fld block">
          <div class="shots">
            <div v-for="(p, i) in form.images" :key="p.key || i" class="shot" @click="preview(i)">
              <img v-if="p.url" :src="p.url" alt="" />
              <span v-else class="shot-hold">图</span>
              <span class="shot-x" @click.stop="removeImage(i)">×</span>
            </div>
            <label v-if="form.images.length < 6" class="shot shot-add">
              <span>＋</span>
              <input type="file" accept="image/*" multiple style="display:none" @change="onPick" />
            </label>
          </div>
        </el-form-item>

        <el-form-item label="备注" class="fld block">
          <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="200"
            placeholder="选填" />
        </el-form-item>

        <!-- 关联 -->
        <template v-if="linkText">
          <div class="sec-lb">关联</div>
          <div class="link-row">
            <span class="link-chip">{{ linkText }}</span>
          </div>
        </template>
      </div>

      <div class="mr2-ft">
        <span v-if="fromInspection" class="ft-hint">由巡检生成 · 状态：待修</span>
        <button class="b-ghost" @click="requestClose">取消</button>
        <button class="b-solid" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
      </div>
    </div>
  </el-drawer>
  <!-- 未保存确认（自己弹，保证能盖在抽屉上） -->
  <el-dialog v-model="askVisible" title="还没保存" width="392px" append-to-body
    :close-on-click-modal="false" align-center class="mt-ask-dialog" @closed="answerAsk(false)">
    <div class="ask-body">这条记录还没保存，关闭后填写的内容会丢失。</div>
    <template #footer>
      <button class="b-ghost" @click="answerAsk(false)">继续填写</button>
      <button class="b-solid" @click="answerAsk(true)">放弃填写</button>
    </template>
  </el-dialog>
</template>

<script setup>
/**
 * 维保录单抽屉（统一组件，按 kind 切字段）
 * ------------------------------------------------------------
 * 维修 / 保养 / 轮胎共用：从台账哪个 tab 点新增，就带哪个 kind。
 * 保存保养记录时会自动回写车务（见 utils/maintenance.syncMaintainToCert）。
 */
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { supabase } from '@/utils/supabase'
import { signPut, putToCos, cosKey, signGetCached } from '@/utils/cos'
import {
  KIND_META, REPAIR_CATEGORIES, SERVICE_LEVELS, SERVICE_ITEMS, TIRE_ACTIONS, TIRE_POSITIONS,
  saveRecord, syncMaintainToCert, loadVehicleBrief, scopeVehicles,
} from '@/utils/maintenance'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  kind: { type: String, default: 'repair' },
  record: { type: Object, default: null },
  presetPlate: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'saved'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const meta = computed(() => KIND_META[props.kind] || KIND_META.repair)
const categories = REPAIR_CATEGORIES
const levels = SERVICE_LEVELS
const serviceItems = SERVICE_ITEMS
const actions = TIRE_ACTIONS
const positions = TIRE_POSITIONS

const isEdit = computed(() => !!(props.record && props.record.id))
const fromInspection = computed(() => !!(props.record && props.record.inspection_id))
const linkText = computed(() => {
  const r = props.record
  if (!r) return ''
  if (r.inspection_id) return '来自外观巡检 · 已回写巡检为「已处理」'
  if (r.report_id) return '已生成费用上报'
  return ''
})

const vehicles = ref([])
const saving = ref(false)

/* ============================================================
   ⭐ 未保存二次确认
   ------------------------------------------------------------
   点遮罩 / 按 ESC 现在会关抽屉（用户要求），但填到一半容易误触。
   这里对「有内容没保存」拦一道：快照比对，只比业务字段，
   `images[].url`（签名出来的临时链接）不算改动。
   ============================================================ */
const baseline = ref('')
const snap = (f) =>
  JSON.stringify({
    plate: f.plate || '',
    happen_at: f.happen_at || '',
    mileage: String(f.mileage == null ? '' : f.mileage),
    amount: String(f.amount == null ? '' : f.amount),
    vendor: f.vendor || '',
    category: f.category || '',
    fault_desc: f.fault_desc || '',
    repair_desc: f.repair_desc || '',
    service_level: f.service_level || '',
    items: f.items || [],
    maintain_interval_km: String(f.maintain_interval_km == null ? '' : f.maintain_interval_km),
    tire_action: f.tire_action || '',
    tire_pos: f.tire_pos || [],
    tire_no: f.tire_no || '',
    tire_brand: f.tire_brand || '',
    tire_spec: f.tire_spec || '',
    tread_mm: String(f.tread_mm == null ? '' : f.tread_mm),
    remark: f.remark || '',
    images: (f.images || []).map((im) => im.key),
  })
const dirty = computed(() => !!baseline.value && snap(form.value) !== baseline.value)

/* ⚠️ 这里用组件内的 el-dialog，不用 ElMessageBox：
   点遮罩触发的是 el-drawer 的 before-close，不在本组件的渲染上下文里，
   ElMessageBox 拿不到 appContext 会**静默不弹**（实测），
   那抽屉就关不掉了。自己弹最稳。 */
const askVisible = ref(false)
let askResolve = null

/** 返回 true = 可以关 */
const confirmDiscard = () => {
  if (!dirty.value) return Promise.resolve(true)
  return new Promise((resolve) => {
    askResolve = resolve
    askVisible.value = true
  })
}

/* 点了「继续填写 / 放弃填写 / 右上角 ×」都走这里 */
const answerAsk = (ok) => {
  askVisible.value = false
  if (askResolve) {
    askResolve(!!ok)
    askResolve = null
  }
}

/* el-drawer 的 before-close：点遮罩 / ESC / 头部关闭按钮 */
const handleBeforeClose = async (done) => {
  if (await confirmDiscard()) done()
}

/* 自己的 × 和「取消」按钮（直接改 v-model 不会触发 before-close） */
const requestClose = async () => {
  if (await confirmDiscard()) visible.value = false
}

const blank = () => ({
  id: null,
  plate: props.presetPlate || '',
  happen_at: new Date().toISOString().slice(0, 10),
  mileage: '',
  amount: '',
  vendor: '',
  vendor_type: 'out',
  category: props.kind === 'repair' ? '机修' : '',
  fault_desc: '',
  repair_desc: '',
  service_level: props.kind === 'service' ? 'level1' : '',
  items: [],
  maintain_interval_km: '',
  tire_action: props.kind === 'tire' ? '换胎' : '',
  tire_pos: [],
  tire_no: '',
  tire_brand: '',
  tire_spec: '',
  tread_mm: '',
  images: [],
  remark: '',
  status: 'done',
  inspection_id: null,
  report_id: null,
  org: '',
  vehicle_id: null,
})

const form = ref(blank())

/* 打开时初始化 */
watch(
  () => props.modelValue,
  async (v) => {
    if (!v) return
    form.value = blank()
    if (props.record) {
      const r = props.record
      form.value = {
        ...blank(),
        ...r,
        mileage: r.mileage ?? '',
        amount: r.amount ?? '',
        tread_mm: r.tread_mm ?? '',
        maintain_interval_km: r.maintain_interval_km ?? '',
        items: Array.isArray(r.items) ? [...r.items] : [],
        tire_pos: r.tire_pos ? String(r.tire_pos).split(/[,，]/).filter(Boolean) : [],
        images: (r.images || []).map((im) => ({ ...im })),
      }
      if (form.value.images.length) loadImageUrls()
    }
    loadVehicles()
    baseline.value = snap(form.value)
  },
  { immediate: true }
)

async function loadVehicles() {
  try {
    let q = supabase.from('vehicles').select('id,plate,org').order('plate').limit(1000)
    q = scopeVehicles(q)   /* ⭐ 只列本租户（二级机构只列本机构）的车 */
    const { data } = await q
    vehicles.value = data || []
  } catch (e) {
    vehicles.value = []
  }
}

async function onPlateChange(plate) {
  const hit = vehicles.value.find((v) => v.plate === plate)
  if (hit) {
    form.value.vehicle_id = hit.id ? String(hit.id) : null
    form.value.org = hit.org || ''
  }
}

/* ---------- 照片 ---------- */
async function loadImageUrls() {
  const keys = form.value.images.map((im) => im.key).filter(Boolean)
  if (!keys.length) return
  try {
    const map = await signGetCached(keys)
    form.value.images = form.value.images.map((im) => ({ ...im, url: map[im.key] || '' }))
  } catch (e) {
    console.warn('维保照片签名失败', e)
  }
}

async function onPick(e) {
  const files = Array.from(e.target.files || []).slice(0, 6 - form.value.images.length)
  e.target.value = ''
  if (!files.length) return
  const ok = []
  for (const f of files) {
    if (f.size > 10 * 1024 * 1024) {
      ElMessage.warning(`${f.name} 超过 10MB，已跳过`)
      continue
    }
    try {
      const key = cosKey('maintenance', f.name)
      const url = await signPut(key)
      await putToCos(url, f)
      ok.push({ key, name: f.name, size: f.size })
    } catch (err) {
      ElMessage.error('上传失败：' + (err.message || ''))
    }
  }
  if (ok.length) {
    form.value.images = form.value.images.concat(ok)
    await loadImageUrls()
  }
}

function removeImage(i) {
  form.value.images.splice(i, 1)
}

function preview(i) {
  const urls = form.value.images.map((im) => im.url).filter(Boolean)
  if (!urls.length) return
  const cur = form.value.images[i] && form.value.images[i].url
  openPreview(urls, cur)
}

/** 简单预览：新窗口打开（不引 el-image-viewer 依赖） */
function openPreview(urls, cur) {
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#0f172a;display:flex;align-items:center;justify-content:center;height:100vh">
  <img src="${cur || urls[0]}" style="max-width:96vw;max-height:96vh"></body>`
  const w = window.open('', '_blank')
  if (w) w.document.write(html)
}

function togglePos(p) {
  const list = form.value.tire_pos || []
  const i = list.indexOf(p)
  if (i >= 0) list.splice(i, 1)
  else list.push(p)
  form.value.tire_pos = [...list]
}

/* ---------- 保存 ---------- */
const validate = () => {
  if (!form.value.plate) return '请选择车辆'
  if (!form.value.happen_at) return '请选择作业日期'
  if (props.kind === 'repair') {
    if (!String(form.value.fault_desc || '').trim()) return '请填写故障现象'
    if (!String(form.value.repair_desc || '').trim()) return '请填写维修项目'
  }
  if (props.kind === 'service' && !form.value.service_level) return '请选择保养级别'
  if (props.kind === 'tire' && !form.value.tire_action) return '请选择轮胎动作'
  return ''
}

async function save() {
  const err = validate()
  if (err) return ElMessage.warning(err)
  if (saving.value) return
  saving.value = true
  try {
    const payload = {
      ...form.value,
      kind: props.kind,
      amount: Number(form.value.amount) || 0,
      tire_pos: props.kind === 'tire' ? (form.value.tire_pos || []).join(',') : null,
      images: (form.value.images || []).map(({ key, name, size }) => ({ key, name, size })),
    }
    if (props.kind !== 'repair') {
      payload.fault_desc = null
      payload.repair_desc = null
      payload.category = null
    }
    if (props.kind !== 'service') {
      payload.service_level = null
      payload.items = []
      payload.maintain_interval_km = null
    }
    if (props.kind !== 'tire') {
      payload.tire_action = null
      payload.tire_pos = null
      payload.tire_no = null
      payload.tire_brand = null
      payload.tire_spec = null
      payload.tread_mm = null
    }

    const saved = await saveRecord(payload)

    /* ⭐ 保养：回写车务 + 结掉待办 */
    let tip = '已保存'
    if (props.kind === 'service') {
      const res = await syncMaintainToCert(saved)
      if (res.ok) {
        tip = res.closed ? `已保存 · 已同步车务并结掉 ${res.closed} 条保养提醒` : '已保存 · 已同步车务'
      } else {
        tip = '已保存（车务同步失败，可去车务台账手动改）'
      }
    }

    ElMessage.success(tip)
    emit('saved', saved)
    visible.value = false
  } catch (e) {
    console.error('保存维保记录失败', e)
    ElMessage.error('保存失败：' + String((e && e.message) || '').slice(0, 80))
  } finally {
    saving.value = false
  }
}

function onClosed() {
  form.value = blank()
  baseline.value = ''
}
</script>

<style scoped>
.ask-body {
  font-size: 13px;
  color: #334155;
  line-height: 1.7;
}
.mt-ask-dialog .el-dialog__header {
  padding-bottom: 6px;
}
.mr2 {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.mr2-hd {
  flex: 0 0 50px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 18px;
  border-bottom: 1px solid #f1f5f9;
}
.mr2-t {
  font-size: 14px;
  font-weight: 700;
}
.mr2-kind {
  font-size: 10.5px;
  font-weight: 700;
  border-radius: 999px;
  padding: 2px 8px;
}
.mr2-x {
  margin-left: auto;
  color: #c4cdd9;
  font-size: 20px;
  cursor: pointer;
  line-height: 1;
}
.mr2-bd {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 18px 6px;
}
.mr2-ft {
  flex: 0 0 56px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 18px;
  border-top: 1px solid #f1f5f9;
}
.ft-hint {
  margin-right: auto;
  font-size: 11.5px;
  color: #b45309;
}
.sec-lb {
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  letter-spacing: 0.5px;
  margin: 6px 0 2px;
}
.frow {
  display: flex;
  gap: 10px;
}
.fld {
  flex: 1;
  min-width: 0;
}
.fld.block {
  display: block;
}
.fld :deep(.el-form-item) {
  margin-bottom: 10px;
}
.fld :deep(.el-form-item__label) {
  font-size: 12px;
  color: #64748b;
  padding-bottom: 2px;
  white-space: nowrap;
}
.opt-sub {
  float: right;
  color: #b4becb;
  font-size: 11.5px;
}
.tip-line {
  font-size: 11.5px;
  color: #15803d;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 7px;
  padding: 7px 9px;
  margin-bottom: 10px;
  line-height: 1.6;
}
.pos-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pos-chip {
  font-size: 12px;
  color: #475569;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  transition: 0.15s;
}
.pos-chip:hover {
  border-color: #cbd5e1;
}
.pos-chip.on {
  background: #fef2f2;
  border-color: #c8102e;
  color: #c8102e;
  font-weight: 700;
}
.shots {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.shot {
  position: relative;
  width: 62px;
  height: 62px;
  border-radius: 8px;
  overflow: hidden;
  background: #eef2f7;
  cursor: pointer;
}
.shot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.shot-hold {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #b4becb;
  font-size: 12px;
}
.shot-x {
  position: absolute;
  right: 0;
  top: 0;
  width: 18px;
  height: 18px;
  line-height: 18px;
  text-align: center;
  background: rgba(15, 23, 42, 0.55);
  color: #fff;
  font-size: 12px;
  border-radius: 0 0 0 8px;
}
.shot-add {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed #e2b7be;
  background: #fff;
  color: #c8102e;
  font-size: 20px;
  cursor: pointer;
}
.link-row {
  margin-bottom: 10px;
}
.link-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #c8102e;
  background: #fef2f2;
  border: 1px solid #fbd5db;
  border-radius: 6px;
  padding: 5px 9px;
}
.b-ghost {
  height: 32px;
  padding: 0 15px;
  border-radius: 7px;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #475569;
  font-size: 12.5px;
  cursor: pointer;
}
.b-solid {
  height: 32px;
  padding: 0 18px;
  border-radius: 7px;
  border: none;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark, #a00d24));
  color: #fff;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
.b-solid:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>

<style>
/* 抽屉 append-to-body，浮岛样式要全局 */
.mt-record-drawer.el-drawer {
  top: 12px !important;
  bottom: 12px !important;
  right: 12px !important;
  height: auto !important;
  border-radius: 13px !important;
  overflow: hidden;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.06), 0 20px 50px -10px rgba(15, 23, 42, 0.3);
}
.mt-record-drawer .el-drawer__body {
  padding: 0;
  overflow: hidden;
}
.el-overlay:has(.mt-record-drawer) {
  background-color: rgba(15, 23, 42, 0.14);
}
</style>
