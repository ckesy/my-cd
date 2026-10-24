<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { supabase } from '@/utils/supabase'
import {
  THEMES, DEFAULT_THEME, applyTheme,
  readLocalTheme, writeLocalTheme, saveRemoteTheme,
} from '@/utils/theme'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

// ---------- 当前用户 ----------
const currentUser = ref(null)

const refreshUser = () => {
  try {
    currentUser.value = JSON.parse(localStorage.getItem('currentUser') || 'null')
  } catch {
    currentUser.value = null
  }
}

watch(visible, (val) => {
  if (val) {
    refreshUser()
    /* ⭐ 主题按账号取：同一台电脑换账号登录，各看各的皮肤 */
    themeKey.value = readLocalTheme(currentUser.value?.account) || DEFAULT_THEME
    resetForms()
    resolveCompanyName()
  }
})

// ---------- Tab ----------
const activeTab = ref('profile')

// ---------- 外观 / 换肤 ----------
const themeKey = ref(DEFAULT_THEME)

const themeGroups = computed(() => {
  const order = ['沉稳', '明快']
  const hints = { 沉稳: '低饱和 · 长时间看不累', 明快: '有色彩 · 活泼但不荧光' }
  return order.map((name) => ({
    name,
    hint: hints[name] || '',
    list: THEMES.filter((t) => t.group === name),
  })).filter((g) => g.list.length)
})

/** 点一下立即生效（不用等保存），同时写账号 */
async function pickTheme(key) {
  themeKey.value = key
  applyTheme(key)
  writeLocalTheme(key, currentUser.value?.account)
  const ok = await saveRemoteTheme(supabase, currentUser.value, key)
  if (ok) ElMessage.success('已保存到当前账号')
  else ElMessage.warning('已应用到当前设备（账号同步未生效，需先执行 users.theme 迁移）')
}

// ---------- 基本信息 ----------
/* ⭐ 2026-10-22：主账号可以自定义「昵称」；管理员/财务的名字只能在主账号的「用户管理」里改。
   公司名称来自组织管理，任何角色都只读。 */
const profileForm = reactive({
  name: '',
  nickname: '',
  phone: '',
})

const isMaster = computed(() => {
  const u = currentUser.value
  if (!u) return false
  return u.role !== 'admin' && !u.isSubAccount
})

/* 公司名称：优先取登录时带过来的 orgName（子账号/新登录的主账号都有），
   老会话里没有就按 owner_account 去 organizations 查根机构，
   最后兜底用 users.name（主账号的 name 存的就是公司全称）。 */
const companyName = ref('')

const resolveCompanyName = async () => {
  const u = currentUser.value || {}
  const direct = String(u.orgName || u.org || '').trim()
  if (direct) { companyName.value = direct; return }

  const key = tenantKey.value
  if (key) {
    try {
      const { data } = await supabase
        .from('organizations')
        .select('name, level')
        .eq('owner_account', key)
        .order('level', { ascending: true })
        .limit(1)
      if (data && data[0] && data[0].name) {
        companyName.value = String(data[0].name).trim()
        return
      }
    } catch (e) { /* 查不到继续往下兜 */ }
  }

  if (u.orgId) {
    try {
      const { data } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', u.orgId)
        .maybeSingle()
      if (data && data.name) { companyName.value = String(data.name).trim(); return }
    } catch (e) { }
  }

  companyName.value = String(u.name || '').trim()
}

/* 查重键：主账号用 account（owner_account 为空），员工用 owner_account */
const tenantKey = computed(() => {
  const u = currentUser.value || {}
  return String(u.ownerAccount || u.masterAccount || u.account || '').trim()
})

const nicknameState = reactive({ checking: false, ok: false, msg: '' })
let nickTimer = null

const checkNickname = () => {
  const v = String(profileForm.nickname || '').trim()
  nicknameState.ok = false
  nicknameState.msg = ''
  if (!isMaster.value) return
  if (!v) return
  if (v.length < 2) {
    nicknameState.msg = '昵称至少 2 个字'
    return
  }
  if (nickTimer) clearTimeout(nickTimer)
  nickTimer = setTimeout(async () => {
    nicknameState.checking = true
    try {
      const key = tenantKey.value
      // ⭐ 排除自己：users.id 是整数，老会话的 currentUser.id 可能是 uuid，
      //    直接用会把查重接口打挂（报 invalid input syntax for type integer）
      const uid = await resolveUserId()
      let q = supabase
        .from('users')
        .select('id, account, name, nickname')
        .or(`owner_account.eq.${key},account.eq.${key}`)
      if (uid) q = q.neq('id', uid)
      const { data } = await q
      const low = v.toLowerCase()
      const hit = (data || []).find(
        (x) =>
          String(x.name || '').trim().toLowerCase() === low ||
          String(x.nickname || '').trim().toLowerCase() === low
      )
      if (hit) {
        nicknameState.msg = `该昵称已被本公司的「${hit.nickname || hit.name} / ${hit.account}」使用，请换一个`
      } else {
        nicknameState.ok = true
        nicknameState.msg = '可用'
      }
    } catch (e) {
      /* 查不到就放行，别把保存卡死 */
      nicknameState.ok = true
      nicknameState.msg = ''
    } finally {
      nicknameState.checking = false
    }
  }, 300)
}

// ---------- 密码 ----------
const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const passwordFormRef = ref(null)
const passwordRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 32, message: '密码长度 6~32 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== passwordForm.newPassword) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
}

const resetForms = () => {
  const u = currentUser.value
  if (u) {
    profileForm.name = u.name || ''
    profileForm.nickname = u.nickname || ''
    profileForm.phone = u.phone || ''
    nicknameState.ok = false
    nicknameState.msg = ''
  }
  passwordForm.oldPassword = ''
  passwordForm.newPassword = ''
  passwordForm.confirmPassword = ''
  activeTab.value = 'profile'
  passwordFormRef.value?.clearValidate?.()
}

// ---------- 状态 ----------
const savingProfile = ref(false)
const savingPassword = ref(false)

/* ============================================================
   ⭐ 定位 users 行（2026-10-22 修「保存失败：invalid input syntax for type integer」）
   根因：users.id 是整数（如 9），但老会话的 localStorage 里 currentUser.id
   存的是 customers 表的 uuid（678b9759-...），拿它去 eq('id', ...) 会被 PG 拒。
   做法：是纯数字就直接用，否则按 account（登录也是用 account 查的）回查真实 id。
   ============================================================ */
const resolveUserId = async () => {
  const u = currentUser.value || {}
  const raw = u.id
  if (raw !== null && raw !== undefined && /^\d+$/.test(String(raw))) return Number(raw)

  const acc = String(u.account || u.phone || '').trim()
  if (!acc) return null
  try {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('account', acc)
      .maybeSingle()
    return data?.id ?? null
  } catch (e) {
    console.warn('[个人设置] 回查 users.id 失败：', e)
    return null
  }
}

// ---------- 保存基本信息 ----------
// ⭐ 所有角色（管理员/主账号/子账号）都改 users 表
//    理由：登录读 users.name、校验 users.password，一切以 users 为准
const saveProfile = async () => {
  if (!isMaster.value) return
  const nick = String(profileForm.nickname || '').trim()
  if (!nick) {
    ElMessage.warning('请输入昵称')
    return
  }
  if (nick.length < 2 || nick.length > 12) {
    ElMessage.warning('昵称 2~12 个字')
    return
  }
  if (nicknameState.msg && !nicknameState.ok && !nicknameState.checking) {
    ElMessage.error(nicknameState.msg)
    return
  }
  if (!currentUser.value?.id) {
    ElMessage.error('登录信息异常，请重新登录')
    return
  }

  savingProfile.value = true
  try {
    const uid = await resolveUserId()
    if (!uid) throw new Error('登录信息异常，请重新登录')

    const { error } = await supabase
      .from('users')
      .update({
        nickname: nick,
        updated_at: new Date().toISOString(),
      })
      .eq('id', uid)

    if (error) throw error

    // ⭐ 顺手把脏 id 修正成 users 的真实整数 id，避免下次再犯
    const updated = { ...currentUser.value, id: uid, nickname: nick, displayName: nick }
    localStorage.setItem('currentUser', JSON.stringify(updated))
    currentUser.value = updated

    ElMessage.success('保存成功')
  } catch (e) {
    ElMessage.error('保存失败：' + (e?.message || e))
  } finally {
    savingProfile.value = false
  }
}

// ---------- 修改密码 ----------
// ⭐ 同上，改 users.password
const savePassword = async () => {
  if (!passwordFormRef.value) return
  if (!currentUser.value?.id) {
    ElMessage.error('登录信息异常，请重新登录')
    return
  }

  try {
    await passwordFormRef.value.validate()
  } catch {
    return
  }

  savingPassword.value = true
  try {
    const uid = await resolveUserId()
    if (!uid) throw new Error('登录信息异常，请重新登录')

    const { data: userData, error: queryError } = await supabase
      .from('users')
      .select('password')
      .eq('id', uid)
      .maybeSingle()

    if (queryError) throw queryError
    if (!userData) throw new Error('用户不存在')
    if (userData.password !== passwordForm.oldPassword) {
      ElMessage.error('原密码不正确')
      savingPassword.value = false
      return
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({
        password: passwordForm.newPassword,
        updated_at: new Date().toISOString(),
      })
      .eq('id', uid)

    if (updateError) throw updateError

    ElMessage.success('密码修改成功，下次登录请使用新密码')
    passwordForm.oldPassword = ''
    passwordForm.newPassword = ''
    passwordForm.confirmPassword = ''
    passwordFormRef.value.clearValidate()
  } catch (e) {
    ElMessage.error('修改失败：' + (e?.message || e))
  } finally {
    savingPassword.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="个人设置"
    width="560px"
    class="personal-settings-dialog"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <!-- 顶部用户条 -->
    <div class="user-header">
      <div class="avatar">
        <span class="avatar-text">{{ (currentUser?.name || '?').slice(0, 1) }}</span>
      </div>
      <div class="user-meta">
        <div class="user-name">{{ currentUser?.name || '未登录' }}</div>
        <div class="user-sub">
          <span class="user-phone">{{ currentUser?.phone || '--' }}</span>
        </div>
      </div>
    </div>

    <!-- Tab 切换 -->
    <div class="tabs">
      <button
        class="tab"
        :class="{ active: activeTab === 'profile' }"
        @click="activeTab = 'profile'"
      >
        基本信息
      </button>
      <button
        class="tab"
        :class="{ active: activeTab === 'password' }"
        @click="activeTab = 'password'"
      >
        修改密码
      </button>
      <button
        class="tab"
        :class="{ active: activeTab === 'appearance' }"
        @click="activeTab = 'appearance'"
      >
        外观
      </button>
    </div>

    <!-- ==================== 基本信息 ==================== -->
    <div v-show="activeTab === 'profile'" class="tab-body">
      <!-- 公司名称：来自组织管理，任何角色都只读 -->
      <div class="field">
        <label class="field-label">公司名称</label>
        <el-input :model-value="companyName || '—'" disabled />
        <div class="field-hint">由管理端创建，不可修改</div>
      </div>

      <!-- 主账号：可自定义昵称（派单/审批/代操作都显示它） -->
      <div class="field" v-if="isMaster">
        <label class="field-label">昵称</label>
        <el-input
          v-model="profileForm.nickname"
          placeholder="设定一个称呼，如 王老板"
          maxlength="12"
          show-word-limit
          @input="checkNickname"
        />
        <div
          class="field-hint"
          :class="{ ok: nicknameState.ok, err: !nicknameState.ok && !!nicknameState.msg }"
        >
          {{ nicknameState.msg || '派单、审批、代操作里的处理人都显示这个名字' }}
        </div>
      </div>

      <!-- 其他角色：姓名只读，由主账号维护 -->
      <div class="field" v-else>
        <label class="field-label">姓名</label>
        <el-input :model-value="profileForm.name || '—'" disabled />
        <div class="field-hint warn">姓名由主账号在「用户管理」里维护，这里不能改</div>
      </div>

      <div class="field">
        <label class="field-label">手机号</label>
        <el-input v-model="profileForm.phone" disabled />
        <div class="field-hint">手机号为登录账号，不可修改</div>
      </div>

      <div class="field-actions">
        <button class="action-btn ghost" @click="visible = false">{{ isMaster ? '取消' : '关闭' }}</button>
        <button
          v-if="isMaster"
          class="action-btn primary"
          @click="saveProfile"
          :disabled="savingProfile || nicknameState.checking"
        >
          {{ savingProfile ? '保存中...' : '保存' }}
        </button>
      </div>
    </div>

    <!-- ==================== 修改密码 ==================== -->
    <div v-show="activeTab === 'password'" class="tab-body">
      <el-form
        ref="passwordFormRef"
        :model="passwordForm"
        :rules="passwordRules"
        label-width="100px"
        class="light-form"
      >
        <el-form-item label="原密码" prop="oldPassword">
          <el-input
            v-model="passwordForm.oldPassword"
            type="password"
            show-password
            placeholder="请输入原密码"
          />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="passwordForm.newPassword"
            type="password"
            show-password
            placeholder="请输入 6~32 位新密码"
          />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="passwordForm.confirmPassword"
            type="password"
            show-password
            placeholder="请再次输入新密码"
          />
        </el-form-item>
      </el-form>

      <div class="field-actions">
        <button class="action-btn ghost" @click="visible = false">取消</button>
        <button class="action-btn primary" @click="savePassword" :disabled="savingPassword">
          {{ savingPassword ? '提交中...' : '确认修改' }}
        </button>
      </div>
    </div>

    <!-- ==================== 外观 / 换肤 ==================== -->
    <div v-show="activeTab === 'appearance'" class="tab-body">
      <p class="theme-hint">
        选一套配色，会保存到你的账号 —— 换电脑、换浏览器打开都是这套。
      </p>

      <div v-for="grp in themeGroups" :key="grp.name" class="theme-group">
        <div class="theme-group-t">{{ grp.name }}<span>{{ grp.hint }}</span></div>
        <div class="theme-grid">
          <button
            v-for="t in grp.list" :key="t.key"
            class="theme-card" :class="{ on: themeKey === t.key }"
            @click="pickTheme(t.key)"
          >
            <div class="tc-preview" :style="{ background: `linear-gradient(135deg, ${t.hover}, ${t.dark})` }">
              <span class="tc-name">{{ t.name }}</span>
              <span v-if="themeKey === t.key" class="tc-check">✓</span>
            </div>
            <div class="tc-ramp">
              <i :style="{ background: t.light }"></i>
              <i :style="{ background: t.main }"></i>
              <i :style="{ background: t.hover }"></i>
              <i :style="{ background: t.dark }"></i>
            </div>
            <div class="tc-desc">{{ t.desc }}</div>
          </button>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
/* ============ 外观 / 换肤 ============ */
.theme-hint {
  margin: 0 0 16px;
  font-size: 12.5px;
  color: #64748B;
  line-height: 1.75;
}
.theme-group { margin-bottom: 20px; }
.theme-group:last-child { margin-bottom: 0; }
.theme-group-t {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 12.5px;
  font-weight: 800;
  color: #0F172A;
}
.theme-group-t span {
  font-size: 11px;
  font-weight: 400;
  color: #94A3B8;
}
.theme-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.theme-card {
  padding: 0;
  border: 1.5px solid #E6ECF3;
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
  cursor: pointer;
  text-align: left;
  transition: border-color .18s, box-shadow .18s, transform .18s;
}
.theme-card:hover {
  border-color: #CBD5E1;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px -4px rgba(15, 23, 42, .16);
}
.theme-card.on {
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 3px var(--brand-primary-light);
}
.tc-preview {
  height: 46px;
  display: flex;
  align-items: center;
  padding: 0 10px;
}
.tc-name {
  font-size: 12px;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, .18);
}
.tc-check {
  margin-left: auto;
  width: 17px; height: 17px;
  border-radius: 50%;
  background: rgba(255, 255, 255, .95);
  color: #0F172A;
  font-size: 11px;
  font-weight: 800;
  display: flex; align-items: center; justify-content: center;
}
.tc-ramp { display: flex; gap: 3px; padding: 7px 8px 4px; }
.tc-ramp i { flex: 1; height: 13px; border-radius: 3px; display: block; }
.tc-desc {
  padding: 0 9px 8px;
  font-size: 9.5px;
  color: #94A3B8;
  line-height: 1.5;
}

/* ============ 顶部用户条 ============ */
.user-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
  background: linear-gradient(120deg, var(--brand-primary-light) 0%, #FFFFFF 100%);
  border-radius: 12px;
  border: 1px solid #E2E8F0;
  margin-bottom: 18px;
}

.avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  box-shadow: 0 6px 18px rgba(var(--brand-rgb), 0.3);
  flex-shrink: 0;
}

.avatar-text {
  font-size: 24px;
  font-weight: 800;
  color: #FFFFFF;
  letter-spacing: 0.5px;
}

.user-meta {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-size: 17px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.user-sub {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-phone {
  font-size: 13px;
  color: #64748B;
  font-family: 'Courier New', monospace;
}

/* ============ Tab ============ */
.tabs {
  display: flex;
  gap: 32px;
  border-bottom: 1px solid #E2E8F0;
  margin-bottom: 20px;
}

.tab {
  position: relative;
  padding: 8px 4px 12px 4px;
  font-size: 14px;
  font-weight: 700;
  color: #94A3B8;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: inherit;
  transition: color 0.28s;
}
.tab:hover {
  color: #475569;
}
.tab.active {
  color: var(--brand-primary);
}
.tab.active::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -1px;
  transform: translateX(-50%);
  width: 28px;
  height: 3px;
  background: linear-gradient(90deg, var(--brand-primary), var(--brand-primary-dark));
  border-radius: 3px 3px 0 0;
  box-shadow: 0 0 10px rgba(var(--brand-rgb), 0.5);
  animation: tabSlide 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes tabSlide {
  from { width: 0; }
  to   { width: 28px; }
}

/* ============ 表单区 ============ */
.tab-body {
  padding: 4px 0;
  animation: bodyFadeIn 0.35s ease;
}
@keyframes bodyFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

.field {
  margin-bottom: 18px;
}

.field-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 8px;
}

.field-hint.ok { color: #67C23A; }
.field-hint.err { color: #F56C6C; }
.field-hint.warn { color: #B45309; }
.field-hint {
  font-size: 12px;
  color: #94A3B8;
  margin-top: 6px;
  padding-left: 2px;
}

/* ============ 底部按钮 ============ */
.field-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px dashed #E2E8F0;
}

/* ============ 通用按钮 ============ */
.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: inherit;
}
.action-btn:hover:not(:disabled) {
  color: var(--brand-primary);
  border-color: rgba(var(--brand-rgb), 0.5);
  background: var(--brand-primary-light);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(var(--brand-rgb), 0.12);
}
.action-btn.primary {
  color: #FFFFFF;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  border-color: transparent;
  box-shadow: 0 3px 10px rgba(var(--brand-rgb), 0.28);
}
.action-btn.primary:hover:not(:disabled) {
  color: #FFFFFF;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  border-color: transparent;
  box-shadow: 0 6px 18px rgba(var(--brand-rgb), 0.45);
}
.action-btn.ghost {
  background: transparent;
  color: #94A3B8;
  border-color: #E2E8F0;
}
.action-btn.ghost:hover:not(:disabled) {
  background: #F8FAFC;
  color: #475569;
  border-color: #CBD5E1;
}
.action-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>

<!-- ===== 全局：弹窗浅色表单 ===== -->
<style>
.personal-settings-dialog.el-dialog {
  border-radius: 12px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
}
.personal-settings-dialog .el-dialog__header {
  padding: 18px 24px;
  border-bottom: 1px solid #F1F5F9;
}
.personal-settings-dialog .el-dialog__title {
  color: #0F172A;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.personal-settings-dialog .el-dialog__body {
  padding: 20px 24px 8px;
}
.personal-settings-dialog .el-dialog__footer {
  display: none;
}

.personal-settings-dialog .light-form .el-form-item__label {
  color: #475569;
  font-weight: 600;
}
.personal-settings-dialog .light-form .el-input__wrapper {
  border-radius: 8px !important;
  background: #F8FAFC !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  transition: all 0.25s;
}
.personal-settings-dialog .light-form .el-input__wrapper:hover {
  box-shadow: 0 0 0 1px rgba(var(--brand-rgb), 0.4) inset !important;
  background: #FFFFFF !important;
}
.personal-settings-dialog .light-form .el-input__wrapper.is-focus {
  background: #FFFFFF !important;
  box-shadow: 0 0 0 1px var(--brand-primary) inset, 0 0 0 3px rgba(var(--brand-rgb), 0.1) !important;
}
.personal-settings-dialog .light-form .el-input__wrapper.is-disabled {
  background: #F1F5F9 !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
}
.personal-settings-dialog .light-form .el-input__inner.is-disabled {
  color: #94A3B8 !important;
  -webkit-text-fill-color: #94A3B8 !important;
}

/* ⭐ 只读字段（公司名称 / 手机号 / 姓名）文字别太淡，要能一眼读清 */
.personal-settings-dialog .field .el-input.is-disabled .el-input__inner {
  color: #334155 !important;
  -webkit-text-fill-color: #334155 !important;
  font-weight: 600;
}

.personal-settings-dialog .field .el-input.is-disabled .el-input__wrapper {
  background: #F1F5F9 !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
}
</style>