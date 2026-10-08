<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { supabase } from '@/utils/supabase'

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
    resetForms()
  }
})

// ---------- Tab ----------
const activeTab = ref('profile')

// ---------- 基本信息 ----------
const profileForm = reactive({
  name: '',
  phone: '',
})

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
    profileForm.phone = u.phone || ''
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

// ---------- 角色（用于决定写哪张表）----------
const isCustomer = computed(() => currentUser.value?.role === 'customer')
const tableName = computed(() => (isCustomer.value ? 'customers' : 'admins'))

// ---------- 保存基本信息 ----------
const saveProfile = async () => {
  if (!profileForm.name.trim()) {
    ElMessage.warning('请输入昵称')
    return
  }
  if (!currentUser.value?.id) {
    ElMessage.error('登录信息异常，请重新登录')
    return
  }

  savingProfile.value = true
  try {
    const { error } = await supabase
      .from(tableName.value)
      .update({
        name: profileForm.name.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentUser.value.id)

    if (error) throw error

    const updated = { ...currentUser.value, name: profileForm.name.trim() }
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
    const { data: userData, error: queryError } = await supabase
      .from(tableName.value)
      .select('password')
      .eq('id', currentUser.value.id)
      .maybeSingle()

    if (queryError) throw queryError
    if (!userData) throw new Error('用户不存在')
    if (userData.password !== passwordForm.oldPassword) {
      ElMessage.error('原密码不正确')
      savingPassword.value = false
      return
    }

    const { error: updateError } = await supabase
      .from(tableName.value)
      .update({
        password: passwordForm.newPassword,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentUser.value.id)

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
    </div>

    <!-- ==================== 基本信息 ==================== -->
    <div v-show="activeTab === 'profile'" class="tab-body">
      <div class="field">
        <label class="field-label">昵称</label>
        <el-input
          v-model="profileForm.name"
          placeholder="请输入昵称"
          maxlength="20"
          show-word-limit
        />
      </div>

      <div class="field">
        <label class="field-label">手机号</label>
        <el-input v-model="profileForm.phone" disabled />
        <div class="field-hint">手机号为登录账号，不可修改</div>
      </div>

      <div class="field-actions">
        <button class="action-btn ghost" @click="visible = false">取消</button>
        <button class="action-btn primary" @click="saveProfile" :disabled="savingProfile">
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
  </el-dialog>
</template>

<style scoped>
/* ============ 顶部用户条 ============ */
.user-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
  background: linear-gradient(120deg, #FEF2F2 0%, #FFFFFF 100%);
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
  background: linear-gradient(135deg, #c8102e, #a00d24);
  box-shadow: 0 6px 18px rgba(200, 16, 46, 0.3);
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
  color: #c8102e;
}
.tab.active::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -1px;
  transform: translateX(-50%);
  width: 28px;
  height: 3px;
  background: linear-gradient(90deg, #c8102e, #a00d24);
  border-radius: 3px 3px 0 0;
  box-shadow: 0 0 10px rgba(200, 16, 46, 0.5);
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
  color: #c8102e;
  border-color: rgba(200, 16, 46, 0.5);
  background: #FEF2F2;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.12);
}
.action-btn.primary {
  color: #FFFFFF;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  border-color: transparent;
  box-shadow: 0 3px 10px rgba(200, 16, 46, 0.28);
}
.action-btn.primary:hover:not(:disabled) {
  color: #FFFFFF;
  background: linear-gradient(135deg, #d41432, #b01029);
  border-color: transparent;
  box-shadow: 0 6px 18px rgba(200, 16, 46, 0.45);
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
  box-shadow: 0 0 0 1px rgba(200, 16, 46, 0.4) inset !important;
  background: #FFFFFF !important;
}
.personal-settings-dialog .light-form .el-input__wrapper.is-focus {
  background: #FFFFFF !important;
  box-shadow: 0 0 0 1px #c8102e inset, 0 0 0 3px rgba(200, 16, 46, 0.1) !important;
}
.personal-settings-dialog .light-form .el-input__wrapper.is-disabled {
  background: #F1F5F9 !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
}
.personal-settings-dialog .light-form .el-input__inner.is-disabled {
  color: #94A3B8 !important;
  -webkit-text-fill-color: #94A3B8 !important;
}
</style>