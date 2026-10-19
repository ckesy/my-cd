<template>
  <el-dialog
    :model-value="modelValue"
    :title="mode === 'revoke' ? '撤销付款' : '登记付款'"
    width="520px"
    append-to-body
    @update:model-value="close"
  >
    <div class="pd-sum">
      <div>
        <span class="pd-k">{{ mode === 'revoke' ? '撤销' : '本次登记' }}</span>
        <b class="pd-n">{{ targets.length }} 笔</b>
      </div>
      <div class="pd-right">
        <span class="pd-k">合计金额</span>
        <b class="pd-amt">¥{{ money(total) }}</b>
      </div>
    </div>

    <div v-if="targets.length <= 5" class="pd-rows">
      <div v-for="r in targets" :key="r.id" class="pd-row">
        <span class="pd-no">{{ r.waybill_no || r.report_no }}</span>
        <span class="pd-driver">{{ r.driver_name || '--' }}</span>
        <b>¥{{ money(r.amount) }}</b>
      </div>
    </div>

    <!-- ============ 登记付款 ============ -->
    <template v-if="mode === 'pay'">
      <div class="pd-field">
        <label>付款方式</label>
        <div class="pd-chips">
          <button
            v-for="m in METHODS"
            :key="m"
            type="button"
            class="pd-chip"
            :class="{ on: form.method === m }"
            @click="form.method = m"
          >{{ m }}</button>
        </div>
      </div>

      <div class="pd-field">
        <label>付款时间</label>
        <el-date-picker
          v-model="form.at"
          type="datetime"
          value-format="YYYY-MM-DD HH:mm"
          placeholder="选择付款时间"
          style="width: 100%"
        />
      </div>

      <div class="pd-field">
        <label>流水号 / 凭证号 <span class="pd-hint">选填</span></label>
        <el-input v-model="form.serial" maxlength="40" placeholder="方便与银行流水对账" />
      </div>

      <div class="pd-field">
        <label>付款凭据 <span class="pd-hint">照片或文件，最多 5 个，单个不超过 10MB</span></label>
        <label class="pd-up-box">
          <input
            type="file"
            class="pd-up-input"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            @change="onPickNative"
          />
          <span class="pd-up-ic">＋</span>
          <span class="pd-up-t">上传付款凭据</span>
          <span class="pd-up-s">转账截图 / 银行回单 / 收据照片</span>
        </label>

        <div v-if="files.length" class="pd-files">
          <div v-for="(f, i) in files" :key="f.uid || i" class="pd-file">
            <span class="pd-file-ic" :class="{ img: f.isImage }">{{ f.isImage ? '图' : '件' }}</span>
            <span class="pd-file-n" :title="f.name">{{ f.name }}</span>
            <span class="pd-file-s">{{ sizeText(f.size) }}</span>
            <span class="pd-file-x" @click="removeFile(i)">×</span>
          </div>
        </div>
        <div v-else class="pd-empty-hint">没有凭据也能登记，但建议留一张截图，后面查账会省很多事。</div>
      </div>

      <div class="pd-field">
        <label>备注 <span class="pd-hint">选填</span></label>
        <el-input v-model="form.note" type="textarea" :rows="2" maxlength="80" show-word-limit />
      </div>

      <div class="pd-tip">
        登记后状态变为「已打款」，记录付款人、时间、方式与凭据（同时写一条审批流水）。
      </div>
    </template>

    <!-- ============ 撤销付款 ============ -->
    <template v-else>
      <div class="pd-field">
        <label>撤销原因（必填）</label>
        <div class="pd-chips">
          <button
            v-for="r in REVOKE_REASONS"
            :key="r"
            type="button"
            class="pd-chip"
            :class="{ on: revokeReason === r }"
            @click="revokeReason = r"
          >{{ r }}</button>
        </div>
        <el-input
          v-model="revokeNote"
          type="textarea"
          :rows="2"
          maxlength="80"
          show-word-limit
          placeholder="补一句说明（选填），例如「同一笔费用付了两次」"
          style="margin-top: 8px"
        />
      </div>

      <div v-if="revokeTarget" class="pd-old">
        <div class="pd-old-k">原付款记录</div>
        <div class="pd-old-v">
          {{ revokeTarget.paid_at ? fmt(revokeTarget.paid_at) : '--' }} ·
          {{ revokeTarget.paid_by || '--' }}
          <template v-if="revokeTarget.payment && revokeTarget.payment.method">
            · {{ revokeTarget.payment.method }}
          </template>
          <template v-if="revokeTarget.payment && revokeTarget.payment.serial">
            · 流水号 {{ revokeTarget.payment.serial }}
          </template>
        </div>
      </div>

      <div class="pd-tip warn">
        撤销后这笔回到「已通过」，会重新出现在待付款清单里；原付款信息与本次撤销原因都写进审批流水，不会丢。
      </div>
    </template>

    <template #footer>
      <el-button @click="close(false)">取消</el-button>
      <el-button
        :type="mode === 'revoke' ? 'danger' : 'primary'"
        :loading="submitting"
        @click="submit"
      >
        {{ mode === 'revoke' ? '确认撤销' : `确认登记${targets.length ? ' ' + targets.length + ' 笔' : ''}` }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import app, { supabase, ensureAnonymousLogin } from '@/utils/supabase'
import { PAY_PENDING_STATUS, currentFeeUser } from '@/utils/feeTodo'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  targets: { type: Array, default: () => [] },
  mode: { type: String, default: 'pay' }, // pay | revoke
})
const emit = defineEmits(['update:modelValue', 'done'])

const METHODS = ['银行转账', '微信', '支付宝', '现金', '其他']
const REVOKE_REASONS = ['金额付错', '重复付款', '收款人不对', '账户信息有误', '其它']
const MAX_FILES = 5
const MAX_SIZE = 10 * 1024 * 1024

const currentUser = currentFeeUser() || {}
const actor = currentUser.name || currentUser.account || ''
const submitting = ref(false)
const files = ref([])

const form = reactive({
  method: '银行转账',
  at: dayjs().format('YYYY-MM-DD HH:mm'),
  serial: '',
  note: '',
})
const revokeReason = ref('金额付错')
const revokeNote = ref('')

const money = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '--')
const sizeText = (n) => {
  const b = Number(n) || 0
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)}MB`
  return `${Math.max(1, Math.round(b / 1024))}KB`
}

const total = computed(() => props.targets.reduce((s, r) => s + (Number(r.amount) || 0), 0))
const revokeTarget = computed(() => props.targets[0] || null)

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    form.method = '银行转账'
    form.at = dayjs().format('YYYY-MM-DD HH:mm')
    form.serial = ''
    form.note = ''
    revokeReason.value = '金额付错'
    revokeNote.value = ''
    files.value = []
  }
)

const close = (v = false) => emit('update:modelValue', v)

function onPickNative(e) {
  const picked = Array.from(e.target.files || [])
  picked.forEach((raw) => {
    if (files.value.length >= MAX_FILES) {
      ElMessage.warning(`最多上传 ${MAX_FILES} 个凭据`)
      return
    }
    if (raw.size > MAX_SIZE) {
      ElMessage.warning(`「${raw.name}」超过 10MB，请压缩后再传`)
      return
    }
    if (files.value.some((f) => f.name === raw.name && f.size === raw.size)) {
      ElMessage.warning(`「${raw.name}」已经选过了`)
      return
    }
    files.value.push({
      raw,
      name: raw.name,
      size: raw.size,
      isImage: String(raw.type || '').startsWith('image/'),
    })
  })
  /* 清空原生 input，才能连续选同一个文件 */
  e.target.value = ''
}

const removeFile = (i) => { files.value.splice(i, 1) }

/* 错误翻译：列/表不存在时直接告诉用户去跑迁移；存储没开通/没权限要说清楚 */
const friendly = (e) => {
  const msg = String((e && e.message) || e || '')
  if (msg.includes('payment') && (msg.includes('column') || msg.includes('42703') || msg.includes('PGRST204'))) {
    return '数据库还没加 payment 列，请先执行 db_migration_modules_payment.sql'
  }
  if (msg.includes('tenant_modules') || msg.includes('42P01')) {
    return '数据库还没建 tenant_modules，请先执行 db_migration_modules_payment.sql'
  }
  if (msg.includes('42501') || /permission denied for (table|relation)/i.test(msg)) {
    return '数据库未授权：先执行迁移脚本里的 grant 段（grant ... to public）'
  }
  if (msg.includes('-501000') || /STORAGE_OPEN_FAIL/i.test(msg) || /storage bucket/i.test(msg)) {
    return '云存储没开通：云开发控制台 → 存储 → 开通存储桶后再传'
  }
  if (msg.includes('-502001') || /STORAGE_EXCEED_AUTHORITY/i.test(msg)) {
    return '云存储权限不足：存储「安全规则」要允许当前登录用户写入'
  }
  if (/cors|跨域/i.test(msg)) {
    return '浏览器跨域被拦：在存储设置里给当前域名加 CORS'
  }
  return msg || '操作失败'
}

async function uploadFiles() {
  if (!files.value.length) return []
  try { await ensureAnonymousLogin() } catch (e) { /* 已有登录态时忽略 */ }

  const out = []
  for (let i = 0; i < files.value.length; i++) {
    const f = files.value[i]
    const ext = (String(f.name).split('.').pop() || 'bin').toLowerCase().slice(0, 6)
    const cloudPath = `reports/payment/${dayjs().format('YYYYMM')}/${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}.${ext}`
    const res = await app.uploadFile({ cloudPath, filePath: f.raw })
    if (!res || !res.fileID) throw new Error(`「${f.name}」上传失败`)
    out.push({ fileID: res.fileID, name: f.name, size: Number(f.size) || 0 })
  }
  return out
}

async function writeLogs(ids, action, comment) {
  if (!ids.length) return
  try {
    await supabase.from('report_approval_logs').insert(
      ids.map((id) => ({
        report_id: id,
        level: 0,
        actor_id: currentUser.id || null,
        actor_name: actor,
        action,
        comment,
      }))
    )
  } catch (e) {
    console.warn('[付款登记] 流水写入失败（不影响主流程）', e)
  }
}

async function submitPay() {
  const ids = props.targets
    .filter((r) => r && PAY_PENDING_STATUS.includes(r.status))
    .map((r) => r.id)
  if (!ids.length) return ElMessage.warning('这些上报已经不在待付款状态，请刷新')
  if (!form.at) return ElMessage.warning('请选择付款时间')

  submitting.value = true
  try {
    const images = await uploadFiles()
    const paidAt = dayjs(form.at).toISOString()
    const payment = {
      method: form.method,
      at: paidAt,
      serial: form.serial.trim(),
      note: form.note.trim(),
      images,
      by: actor,
      paid_at: paidAt,
    }

    const { data, error } = await supabase
      .from('reports')
      .update({
        status: '已打款',
        paid_at: paidAt,
        paid_by: actor,
        payment,
        update_time: new Date().toISOString(),
      })
      .in('id', ids)
      .in('status', PAY_PENDING_STATUS)
      .select('id')
    if (error) throw error

    const doneIds = (data || []).map((x) => x.id)
    if (!doneIds.length) {
      ElMessage.warning('没有可登记的单（可能已被处理），请刷新')
      emit('done', { mode: 'pay', count: 0 })
      close(false)
      return
    }

    await writeLogs(
      doneIds,
      'pay',
      [
        form.method,
        form.serial.trim() ? `流水号 ${form.serial.trim()}` : '',
        images.length ? `凭据 ${images.length} 个` : '',
        form.note.trim(),
      ].filter(Boolean).join(' · ')
    )

    ElMessage.success(`已登记 ${doneIds.length} 笔付款 · ¥${money(total.value)}`)
    emit('done', { mode: 'pay', count: doneIds.length })
    close(false)
  } catch (e) {
    console.error('[付款登记] 失败', e)
    ElMessage.error('登记失败：' + friendly(e))
  } finally {
    submitting.value = false
  }
}

async function submitRevoke() {
  const r = revokeTarget.value
  if (!r) return
  const reason = revokeNote.value.trim()
    ? `${revokeReason.value}：${revokeNote.value.trim()}`
    : revokeReason.value
  if (!revokeReason.value) return ElMessage.warning('请选择撤销原因')

  submitting.value = true
  try {
    const now = new Date().toISOString()
    const payment = {
      ...(r.payment && typeof r.payment === 'object' ? r.payment : {}),
      revoked_at: now,
      revoked_by: actor,
      revoke_reason: reason,
    }

    const { data, error } = await supabase
      .from('reports')
      .update({
        status: '已通过',
        paid_at: null,
        paid_by: null,
        payment,
        update_time: now,
      })
      .eq('id', r.id)
      .eq('status', '已打款')
      .select('id')
    if (error) throw error
    if (!data || !data.length) {
      ElMessage.warning('这笔付款已被处理，请刷新')
      emit('done', { mode: 'revoke', count: 0 })
      close(false)
      return
    }

    await writeLogs([r.id], 'unpay', reason)

    ElMessage.success('已撤销付款，这笔回到待付款')
    emit('done', { mode: 'revoke', count: 1 })
    close(false)
  } catch (e) {
    console.error('[撤销付款] 失败', e)
    ElMessage.error('撤销失败：' + friendly(e))
  } finally {
    submitting.value = false
  }
}

const submit = () => (props.mode === 'revoke' ? submitRevoke() : submitPay())
</script>

<style scoped>
.pd-sum {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-radius: 10px;
  background: linear-gradient(135deg, #fef2f2, #fff7f8);
  border: 1px solid #fbd5db;
  margin-bottom: 12px;
}

.pd-k {
  font-size: 11.5px;
  color: #94a3b8;
  margin-right: 6px;
}

.pd-n {
  font-family: var(--num-font, monospace);
  font-size: 16px;
  color: #0f172a;
}

.pd-amt {
  font-family: var(--num-font, monospace);
  font-size: 20px;
  color: #c8102e;
}

.pd-rows {
  max-height: 132px;
  overflow-y: auto;
  border: 1px solid #f1f5f9;
  border-radius: 8px;
  margin-bottom: 12px;
}

.pd-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  font-size: 12px;
  border-bottom: 1px solid #f8fafc;
}

.pd-row:last-child { border-bottom: none; }

.pd-no {
  font-family: var(--num-font, monospace);
  font-weight: 600;
  color: #0f172a;
}

.pd-driver {
  flex: 1;
  color: #94a3b8;
  font-size: 11.5px;
}

.pd-row b {
  font-family: var(--num-font, monospace);
  color: #c8102e;
}

.pd-field { margin-bottom: 12px; }

.pd-field label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  margin-bottom: 6px;
}

.pd-hint {
  font-weight: 400;
  color: #94a3b8;
  font-size: 11px;
  margin-left: 4px;
}

.pd-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.pd-chip {
  padding: 5px 12px;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  background: #fff;
  font-size: 12px;
  color: #475569;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;
}

.pd-chip:hover { border-color: #c8102e; color: #c8102e; }

.pd-chip.on {
  background: linear-gradient(135deg, #c8102e, #a00d24);
  border-color: transparent;
  color: #fff;
  font-weight: 600;
}

/* 上传区 */
.pd-up-input {
  display: none;
}

.pd-up-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  height: 84px;
  border: 1px dashed #d5deea;
  border-radius: 10px;
  background: #fafbfd;
  cursor: pointer;
  transition: all 0.2s;
}

.pd-up-box:hover {
  border-color: #c8102e;
  background: #fffafa;
}

.pd-up-ic {
  font-size: 20px;
  color: #c8102e;
  line-height: 1;
}

.pd-up-t {
  font-size: 12.5px;
  font-weight: 600;
  color: #475569;
}

.pd-up-s {
  font-size: 11px;
  color: #94a3b8;
}

.pd-files {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pd-file {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
}

.pd-file-ic {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  background: #e2e8f0;
  color: #475569;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.pd-file-ic.img { background: #fee2e2; color: #b91c1c; }

.pd-file-n {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pd-file-s {
  font-size: 11px;
  color: #94a3b8;
  flex: 0 0 auto;
}

.pd-file-x {
  width: 18px;
  height: 18px;
  line-height: 16px;
  text-align: center;
  border-radius: 50%;
  color: #94a3b8;
  cursor: pointer;
  flex: 0 0 auto;
}

.pd-file-x:hover { background: #fee2e2; color: #b91c1c; }

.pd-empty-hint {
  margin-top: 8px;
  font-size: 11.5px;
  color: #b45309;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 6px 10px;
  line-height: 1.6;
}

.pd-old {
  padding: 10px 12px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  margin-bottom: 12px;
}

.pd-old-k {
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 4px;
}

.pd-old-v {
  font-size: 12.5px;
  color: #334155;
  line-height: 1.6;
}

.pd-tip {
  font-size: 11.5px;
  color: #94a3b8;
  line-height: 1.7;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f8fafc;
}

.pd-tip.warn {
  background: #fff7f8;
  border: 1px solid #fbd5db;
  color: #9f1239;
}
</style>
