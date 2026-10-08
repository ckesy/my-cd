<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus, Delete, Edit, Key } from '@element-plus/icons-vue'
import { supabase } from '@/utils/supabase'

// 当前登录账号（用于防止删除自己）
const currentUser = (() => {
  try {
    return JSON.parse(localStorage.getItem('currentUser') || 'null')
  } catch { return null }
})()

// ---------- 筛选 ----------
const filters = ref({ name: '', phone: '' })

// ---------- 表格 ----------
const tableData = ref([])
const loading = ref(false)
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(10)

const fetchData = async () => {
  loading.value = true
  try {
    let query = supabase.from('admins').select('*', { count: 'exact' })
    if (filters.value.name)  query = query.ilike('name', `%${filters.value.name}%`)
    if (filters.value.phone) query = query.ilike('phone', `%${filters.value.phone}%`)

    const from = (currentPage.value - 1) * pageSize.value
    const to = from + pageSize.value - 1
    query = query.order('created_at', { ascending: false }).range(from, to)

    const { data, error, count } = await query
    if (error) throw error

    tableData.value = (data || []).map(row => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      status: row.status,
      remark: row.remark,
      createdAt: row.created_at
        ? new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })
        : '--',
    }))
    total.value = count || 0
  } catch (e) {
    console.error(e)
    ElMessage.error('加载管理员失败：' + (e?.message || e))
  } finally {
    loading.value = false
  }
}

const handleSearch = () => { currentPage.value = 1; fetchData() }
const handleReset = () => {
  filters.value = { name: '', phone: '' }
  currentPage.value = 1
  fetchData()
}

// ---------- 弹窗 ----------
const dialogVisible = ref(false)
const dialogMode = ref('add')
const formRef = ref(null)
const form = reactive({
  id: '', name: '', phone: '', password: '', status: 1, remark: '',
})
const formRules = {
  name:  [{ required: true, message: '请输入管理员名称', trigger: 'blur' }],
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入登录密码', trigger: 'blur' },
    { min: 6, max: 32, message: '密码长度 6~32 位', trigger: 'blur' },
  ],
}

const openAdd = () => {
  dialogMode.value = 'add'
  Object.assign(form, { id: '', name: '', phone: '', password: '', status: 1, remark: '' })
  dialogVisible.value = true
  formRef.value?.clearValidate?.()
}

const openEdit = (row) => {
  dialogMode.value = 'edit'
  Object.assign(form, {
    id: row.id, name: row.name, phone: row.phone,
    password: '', status: row.status, remark: row.remark || '',
  })
  dialogVisible.value = true
  formRef.value?.clearValidate?.()
}

const handleSubmit = async () => {
  if (!formRef.value) return
  try {
    await formRef.value.validate()

    if (dialogMode.value === 'add') {
      const { error } = await supabase.from('admins').insert({
        name: form.name,
        phone: form.phone,
        password: form.password,
        role: 'admin',
        status: form.status,
        remark: form.remark || null,
      })
      if (error) throw error
      ElMessage.success('管理员创建成功')
    } else {
      const updateData = {
        name: form.name,
        phone: form.phone,
        status: form.status,
        remark: form.remark || null,
        updated_at: new Date().toISOString(),
      }
      if (form.password) updateData.password = form.password

      const { error } = await supabase.from('admins').update(updateData).eq('id', form.id)
      if (error) throw error
      ElMessage.success('管理员信息已更新')
    }
    dialogVisible.value = false
    fetchData()
  } catch (e) {
    if (e?.message) ElMessage.error('操作失败：' + e.message)
  }
}

const handleDelete = (row) => {
  if (row.id === currentUser?.id) {
    ElMessage.warning('不能删除当前登录的账号')
    return
  }
  ElMessageBox.confirm(
    `确定删除管理员「${row.name}」？删除后该账号将无法登录。`,
    '删除确认',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
  ).then(async () => {
    const { error } = await supabase.from('admins').delete().eq('id', row.id)
    if (error) { ElMessage.error('删除失败：' + error.message); return }
    ElMessage.success('删除成功')
    fetchData()
  }).catch(() => {})
}

// ---------- 重置密码 ----------
const passwordDialogVisible = ref(false)
const passwordFormRef = ref(null)
const passwordForm = reactive({ id: '', name: '', newPassword: '' })
const passwordRules = {
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 32, message: '密码长度 6~32 位', trigger: 'blur' },
  ],
}

const openResetPassword = (row) => {
  Object.assign(passwordForm, { id: row.id, name: row.name, newPassword: '' })
  passwordDialogVisible.value = true
  passwordFormRef.value?.clearValidate?.()
}

const submitResetPassword = async () => {
  if (!passwordFormRef.value) return
  try {
    await passwordFormRef.value.validate()
    const { error } = await supabase
      .from('admins')
      .update({ password: passwordForm.newPassword, updated_at: new Date().toISOString() })
      .eq('id', passwordForm.id)
    if (error) throw error
    ElMessage.success(`管理员「${passwordForm.name}」密码已重置`)
    passwordDialogVisible.value = false
  } catch (e) {
    if (e?.message) ElMessage.error('重置失败：' + e.message)
  }
}

onMounted(fetchData)
</script>

<template>
  <div class="admin-accounts">
    <!-- 筛选面板 -->
    <section class="light-panel">
      <div class="filter-grid two">
        <el-input v-model="filters.name" placeholder="请输入管理员名称" clearable />
        <el-input v-model="filters.phone" placeholder="请输入手机号" clearable />
      </div>

      <div class="filter-actions">
        <button class="action-btn primary" @click="handleSearch">
          <el-icon><Search /></el-icon> 搜索
        </button>
        <button class="action-btn" @click="openAdd">
          <el-icon><Plus /></el-icon> 新增管理员
        </button>
        <button class="action-btn ghost" @click="handleReset">重置</button>
      </div>
    </section>

    <!-- 表格面板 -->
    <section class="light-panel table-panel">
      <div class="panel-title">
        <span class="dot"></span>
        <span>管理员列表</span>
        <span class="count">共 {{ total }} 条</span>
      </div>

      <el-table
        :data="tableData"
        v-loading="loading"
        class="light-table"
        empty-text="暂无管理员"
        stripe
      >
        <el-table-column prop="name" label="管理员名称" min-width="180" />
        <el-table-column prop="phone" label="登录手机号" min-width="160" />
        <el-table-column label="状态" width="120" align="center">
          <template #default="{ row }">
            <span class="status-tag" :class="row.status === 1 ? 'on' : 'off'">
              {{ row.status === 1 ? '启用' : '停用' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" min-width="200" />
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <button class="row-btn" @click="openEdit(row)">
              <el-icon><Edit /></el-icon> 编辑
            </button>
            <button class="row-btn" @click="openResetPassword(row)">
              <el-icon><Key /></el-icon> 重置密码
            </button>
            <button class="row-btn danger" @click="handleDelete(row)">
              <el-icon><Delete /></el-icon> 删除
            </button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          @size-change="fetchData"
          @current-change="fetchData"
        />
      </div>
    </section>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'add' ? '新增管理员' : '编辑管理员'"
      width="520px"
      class="light-dialog"
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px" class="light-form">
        <el-form-item label="管理员名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入管理员名称" />
        </el-form-item>
        <el-form-item label="手机号" prop="phone">
          <el-input v-model="form.phone" placeholder="请输入登录手机号" maxlength="11" />
        </el-form-item>
        <el-form-item label="登录密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            :placeholder="dialogMode === 'add' ? '请输入登录密码' : '不修改请留空'"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch
            v-model="form.status"
            :active-value="1"
            :inactive-value="0"
            active-text="启用"
            inactive-text="停用"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="选填" />
        </el-form-item>
      </el-form>

      <template #footer>
        <button class="action-btn ghost" @click="dialogVisible = false">取消</button>
        <button class="action-btn primary" @click="handleSubmit">确定</button>
      </template>
    </el-dialog>

    <!-- 重置密码弹窗 -->
    <el-dialog
      v-model="passwordDialogVisible"
      title="重置密码"
      width="440px"
      class="light-dialog"
      :close-on-click-modal="false"
    >
      <div class="reset-tip">
        <span class="tip-icon-red">!</span>
        正在为管理员「<b>{{ passwordForm.name }}</b>」重置登录密码
      </div>

      <el-form ref="passwordFormRef" :model="passwordForm" :rules="passwordRules" label-width="90px" class="light-form">
        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="passwordForm.newPassword"
            type="password"
            show-password
            placeholder="请输入 6~32 位新密码"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <button class="action-btn ghost" @click="passwordDialogVisible = false">取消</button>
        <button class="action-btn primary" @click="submitResetPassword">确认重置</button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-accounts {
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: pageIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.table-panel { display: flex; flex-direction: column; }

@keyframes pageIn {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* 状态标签 */
.status-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
}
.status-tag.on  { color: #059669; background: #D1FAE5; }
.status-tag.off { color: #64748B; background: #F1F5F9; }

/* 重置密码提示 */
.reset-tip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: #FEF2F2;
  border: 1px solid rgba(200, 16, 46, 0.18);
  border-radius: 8px;
  font-size: 13px;
  color: #475569;
  margin-bottom: 18px;
}
.reset-tip b { color: #c8102e; }
.tip-icon-red {
  width: 20px; height: 20px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: #c8102e; color: #fff;
  font-weight: 700; font-size: 12px;
  flex-shrink: 0;
}
</style>