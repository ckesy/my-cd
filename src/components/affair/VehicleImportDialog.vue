<template>
  <el-dialog v-model="visible" title="导入车辆档案（一张表）" width="760px" append-to-body class="af-dialog"
    :close-on-click-modal="false">
    <div class="imp">
      <div class="af-note info" style="margin-bottom:12px">
        <div>
          <b>一张表、一行一车、40 列</b>。只有「车牌号」必填（新建车时「车架号」也必填）。
          表头按<b>名称</b>识别 —— 删列、调列序、用老的 10 列模板都能导。
        </div>
      </div>

      <div class="imp-bar">
        <el-button plain size="small" @click="downloadTpl">下载模板</el-button>
        <el-upload :auto-upload="false" :show-file-list="false" accept=".xlsx,.xls,.csv"
          :on-change="onFile">
          <el-button type="danger" size="small" :loading="parsing">选择文件</el-button>
        </el-upload>
        <span v-if="fileName" class="imp-file">{{ fileName }}</span>
      </div>

      <div v-if="rows.length" class="imp-sum">
        <span class="ok">可导入 {{ okCount }} 行</span>
        <span v-if="errCount" class="bad">有问题 {{ errCount }} 行</span>
        <span class="sub">{{ newCount }} 台新增 / {{ rows.length - newCount }} 台更新</span>
      </div>

      <div v-if="rows.length" class="imp-list">
        <table class="af-table">
          <thead>
            <tr><th style="width:56px">行</th><th style="width:130px">车牌号</th><th style="width:88px">证件</th><th>校验结果</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.rowNo" :class="{ bad: !r.ok }">
              <td class="sub">{{ r.rowNo }}</td>
              <td>{{ r.plate || '--' }}</td>
              <td class="sub">{{ r.ok ? r.certs.length + ' 项' : '--' }}</td>
              <td>
                <span v-if="r.ok" class="af-pill" style="background:#ECFDF5;color:#047857"><i class="d"></i>可导入</span>
                <span v-else class="err">{{ r.error }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <template #footer>
      <el-button plain @click="visible = false">取消</el-button>
      <el-button v-if="errCount" plain :disabled="!okCount" @click="doImport(true)">只导入正确行</el-button>
      <el-button type="danger" :disabled="!okCount" :loading="importing" @click="doImport(false)">
        {{ importing ? `导入中 ${done}/${okCount}` : `导入 ${okCount} 行` }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import '@/assets/affair.css'
import { readWide, exportTemplate } from '@/utils/vehicleExcel'
import { flattenRow, saveVehicleWithCerts, parseDays } from '@/utils/vehicleAffair'
import { supabase } from '@/utils/supabase'
import { VEHICLE_COLUMNS, REMIND_DAYS_DEFAULT } from '@/config/vehicleColumns'

const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue', 'done'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const rows = ref([])
const fileName = ref('')
const parsing = ref(false)
const importing = ref(false)
const done = ref(0)

const okCount = computed(() => rows.value.filter(r => r.ok).length)
const errCount = computed(() => rows.value.filter(r => !r.ok).length)
const newCount = computed(() => rows.value.filter(r => r.ok && r.isNew).length)

watch(visible, (v) => { if (!v) { rows.value = []; fileName.value = ''; done.value = 0 } })

const downloadTpl = async () => {
  const sample = {}
  VEHICLE_COLUMNS.forEach(c => { sample[c.label] = '' })
  sample['车牌号'] = '沪A·D12345'
  sample['车架号(VIN)'] = 'LGAX3AG59N9009177'
  sample['商业险保单号'] = 'PDAA2025…8821'
  sample['商业险起期'] = '2026-11-01'
  sample['商业险止期'] = '2027-10-31'
  sample['商业险提醒'] = '90,30,7,3'
  await exportTemplate([sample])
}

const onFile = async (file) => {
  const raw = file?.raw
  if (!raw) return
  fileName.value = raw.name
  parsing.value = true
  rows.value = []
  try {
    const aoa = await readWide(raw)
    if (!aoa.length) { ElMessage.warning('文件里没有数据行'); return }

    // 已有车牌，用于判断新增/更新
    const plates = aoa.map(r => String(r['车牌号'] ?? '').trim()).filter(Boolean)
    let exist = new Set()
    if (plates.length) {
      const { data } = await supabase.from('vehicles').select('plate').in('plate', plates)
      exist = new Set((data || []).map(x => x.plate))
    }

    const seen = new Set()
    rows.value = aoa.map(r => {
      const plate = String(r['车牌号'] ?? '').trim()
      const isNew = !exist.has(plate)
      try {
        if (!plate) throw new Error('缺少车牌号')
        if (seen.has(plate)) throw new Error(`同一文件里「${plate}」出现了两次，只能留一行`)
        seen.add(plate)
        const { vehicle, certs } = flattenRow(r, { isNewVehicle: isNew })
        return { rowNo: r.__row, plate, ok: true, vehicle, certs, isNew }
      } catch (e) {
        return { rowNo: r.__row, plate, ok: false, error: e.message || String(e), isNew }
      }
    })
  } catch (e) {
    ElMessage.error('读取失败：' + (e.message || e))
  } finally {
    parsing.value = false
  }
}

const doImport = async (onlyOk) => {
  const list = rows.value.filter(r => (onlyOk ? r.ok : r.ok))
  if (!list.length) return
  importing.value = true
  done.value = 0
  let fail = 0
  const failRows = []
  for (const r of list) {
    try {
      await saveVehicleWithCerts({ vehicle: r.vehicle, certs: r.certs })
      done.value++
    } catch (e) {
      fail++
      r.ok = false
      r.error = '写库失败：' + (e.message || e)
      failRows.push(r.rowNo)
    }
  }
  importing.value = false
  if (fail) {
    ElMessage.error(`${list.length - fail} 行成功，${fail} 行失败（第 ${failRows.join('、')} 行）`)
  } else {
    ElMessage.success(`导入完成：${list.length} 行`)
    visible.value = false
  }
  emit('done')
}
</script>

<style scoped>
.imp-bar { display: flex; align-items: center; gap: 9px; }
.imp-file { font-size: 12px; color: #64748B; }
.imp-sum { display: flex; gap: 14px; align-items: center; margin: 12px 0 8px; font-size: 12.5px; }
.imp-sum .ok { color: #047857; font-weight: 700; }
.imp-sum .bad { color: #C8102E; font-weight: 700; }
.imp-sum .sub { color: #94A3B8; margin-left: auto; }
.imp-list { max-height: 320px; overflow: auto; border: 1px solid #EEF2F7; border-radius: 9px; }
.imp-list .af-table th { background: #F7F9FC; }
.imp-list tr.bad td { background: #FFFCFC; }
.imp-list .err { color: #A32D2D; font-size: 12px; font-weight: 600; }
</style>
