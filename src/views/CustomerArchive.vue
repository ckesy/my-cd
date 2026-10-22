<template>
  <div class="customer-archive-page">
    <!-- ============================================================
         左：客户列表
         ============================================================ -->
    <section class="ca-panel ca-customer">
      <header class="panel-head">
        <span class="panel-title"><i class="title-dot"></i>客户</span>
        <el-button type="primary" class="btn-primary btn-sm" @click="openCustomerDialog()">
          <el-icon>
            <CirclePlus />
          </el-icon> 新增
        </el-button>
      </header>

      <div class="panel-search">
        <el-input v-model="customerKeyword" placeholder="客户名称 / 负责人 / 电话" clearable class="search-input"
          @keyup.enter="applyCustomerSearch" @clear="applyCustomerSearch">
          <template #prefix>
            <el-icon>
              <Search />
            </el-icon>
          </template>
        </el-input>
        <el-button type="primary" class="btn-primary btn-sm" @click="applyCustomerSearch">查询</el-button>
      </div>

      <div class="status-tabs">
        <button type="button" class="status-tab" :class="{ active: statusTab === 1 }" @click="statusTab = 1">
          正常({{ normalCount }})
        </button>
        <button type="button" class="status-tab" :class="{ active: statusTab === 0 }" @click="statusTab = 0">
          停用({{ disabledCount }})
        </button>
      </div>

      <div v-if="dbHint" class="sql-hint">
        <el-icon>
          <WarningFilled />
        </el-icon>
        <div class="sql-hint-text">
          <div>{{ dbHint.title }}</div>
          <div class="sql-hint-sub">请先在 CloudBase 控制台执行 <code>{{ dbHint.file }}</code>，再点右上角刷新重试。</div>
        </div>
      </div>

      <Teleport to="body" :disabled="!customerFullscreen">
        <div class="table-shell" :class="{ 'is-fullscreen': customerFullscreen }">
          <TableTools v-model:size="customerSize" v-model:fullscreen="customerFullscreen" :columns="customerColumns"
            :total="filteredCustomers.length" storage-key="customer_archive_customer" :refreshing="loadingCustomers"
            @refresh="fetchCustomers" @reset="resetCustomerColumns" />

          <div class="table-wrap">
            <el-table ref="customerTableRef" :data="filteredCustomers" v-loading="loadingCustomers"
              element-loading-text="加载中…" element-loading-background="rgba(255,255,255,0.88)" border stripe
              height="100%" :size="customerSize" class="custom-table" :row-class-name="customerRowClass"
              row-key="id" @row-click="selectCustomer">
              <el-table-column v-for="col in customerVisibleColumns" :key="col.prop" :prop="col.prop"
                :label="col.label"
                :width="col.width ? Math.round(col.width * customerDensity) : undefined"
                :min-width="col.width ? undefined : Math.round((col.minWidth || 100) * customerDensity)"
                :align="col.align || 'center'" :fixed="col.fixed || false" show-overflow-tooltip>
                <template #default="{ row }">
                  <!-- 客户名称 -->
                  <span v-if="col.prop === 'name'" class="customer-name">{{ row.name || '--' }}</span>
                  <!-- 区域 -->
                  <span v-else-if="col.prop === 'region'" class="text-content">
                    {{ formatRegion(row.province, row.city) || '--' }}
                  </span>
                  <!-- 负责人电话 -->
                  <span v-else-if="col.prop === 'manager_phone'" class="mono-text">{{ row.manager_phone || '--' }}</span>
                  <!-- 状态 -->
                  <span v-else-if="col.prop === 'status'" class="status-tag"
                    :class="Number(row.status ?? 1) === 1 ? 'on' : 'off'">
                    {{ Number(row.status ?? 1) === 1 ? '正常' : '停用' }}
                  </span>
                  <!-- 合同 -->
                  <span v-else-if="col.prop === 'contract'" class="contract-cell">
                    <a v-if="row.has_contract" class="contract-link" @click.stop="previewContract(row)">
                      <el-icon>
                        <Document />
                      </el-icon> {{ row.contract_name || '合同' }}
                    </a>
                    <span v-else class="text-muted">--</span>
                  </span>
                  <!-- 操作 -->
                  <div v-else-if="col.prop === 'action'" class="action-cell">
                    <el-button link class="action-btn action-edit" @click.stop="openCustomerDialog(row)">
                      编辑
                    </el-button>
                    <el-button link class="action-btn"
                      :class="Number(row.status ?? 1) === 1 ? 'action-warn' : 'action-view'"
                      @click.stop="toggleCustomerStatus(row)">
                      {{ Number(row.status ?? 1) === 1 ? '停用' : '启用' }}
                    </el-button>
                    <el-button link class="action-btn action-danger" @click.stop="removeCustomer(row)">
                      删除
                    </el-button>
                  </div>
                  <span v-else class="text-content">{{ row[col.prop] || '--' }}</span>
                </template>
              </el-table-column>

              <template #empty>
                <div class="empty-state">
                  <el-icon class="empty-icon">
                    <OfficeBuilding />
                  </el-icon>
                  <p>暂无客户</p>
                  <span class="empty-tip">点击右上角「新增」创建客户档案</span>
                </div>
              </template>
            </el-table>
          </div>

          <transition name="fs-fade">
            <button v-if="customerFullscreen" class="fs-exit-btn" @click="customerFullscreen = false">
              <el-icon>
                <Close />
              </el-icon> 退出全屏
            </button>
          </transition>
        </div>
      </Teleport>
    </section>

    <!-- ============================================================
         右：客户下的员工 / 联系人
         ============================================================ -->
    <section class="ca-panel ca-contact">
      <header class="panel-head">
        <span class="panel-title">
          <i class="title-dot"></i>
          <template v-if="selectedCustomer">
            {{ selectedCustomer.name }}
            <span class="title-sub">· 员工 / 联系人</span>
          </template>
          <template v-else>员工 / 联系人</template>
        </span>
        <el-button type="primary" class="btn-primary btn-sm" :disabled="!selectedCustomer"
          @click="openContactDialog()">
          <el-icon>
            <CirclePlus />
          </el-icon> 新增联系人
        </el-button>
      </header>

      <div class="panel-search">
        <div class="search-field">
          <span class="field-name">姓名</span>
          <el-input v-model="contactKeyword.name" placeholder="姓名" clearable
            @keyup.enter="applyContactSearch" @clear="applyContactSearch" />
        </div>
        <div class="search-field">
          <span class="field-name">手机号</span>
          <el-input v-model="contactKeyword.phone" placeholder="手机号" clearable
            @keyup.enter="applyContactSearch" @clear="applyContactSearch" />
        </div>
        <el-select v-model="contactKeyword.personType" placeholder="类型" clearable class="type-select"
          @change="applyContactSearch">
          <el-option label="全部类型" value="" />
          <el-option label="联系人" value="联系人" />
          <el-option label="员工" value="员工" />
        </el-select>
        <el-button type="primary" class="btn-primary btn-sm" @click="applyContactSearch">
          <el-icon>
            <Search />
          </el-icon> 查询
        </el-button>
        <el-button class="btn-outline btn-sm" @click="resetContactSearch">
          <el-icon>
            <Refresh />
          </el-icon> 重置
        </el-button>
      </div>

      <!-- 未选客户时给个插画空态 -->
      <div v-if="!selectedCustomer" class="pick-empty">
        <svg class="pick-illus" viewBox="0 0 120 104" fill="none">
          <path d="M20 44 60 24l40 20-40 20-40-20Z" fill="#F1F5F9" stroke="#E2E8F0" stroke-width="1.4" />
          <path d="M20 44v28l40 20V64L20 44Z" fill="#E8EEF5" stroke="#E2E8F0" stroke-width="1.4" />
          <path d="M100 44v28l-40 20V64l40-20Z" fill="#DFE7F0" stroke="#E2E8F0" stroke-width="1.4" />
          <path d="M60 24v20" stroke="#FCA5A5" stroke-width="2" stroke-linecap="round" />
          <circle cx="60" cy="20" r="4" fill="#FECACA" />
        </svg>
        <p>请在左侧选择客户</p>
        <span class="empty-tip">选中客户后即可维护它的员工与联系人</span>
      </div>

      <template v-else>
        <Teleport to="body" :disabled="!contactFullscreen">
          <div class="table-shell" :class="{ 'is-fullscreen': contactFullscreen }">
            <TableTools v-model:size="contactSize" v-model:fullscreen="contactFullscreen" :columns="contactColumns"
              :total="filteredContacts.length" storage-key="customer_archive_contact" :refreshing="loadingContacts"
              @refresh="fetchContacts" @reset="resetContactColumns" />

            <div class="table-wrap">
              <el-table :data="filteredContacts" v-loading="loadingContacts" element-loading-text="加载中…"
                element-loading-background="rgba(255,255,255,0.88)" border stripe height="100%" :size="contactSize"
                class="custom-table">
                <el-table-column v-for="col in contactVisibleColumns" :key="col.prop" :prop="col.prop"
                  :label="col.label"
                  :width="col.width ? Math.round(col.width * contactDensity) : undefined"
                  :min-width="col.width ? undefined : Math.round((col.minWidth || 100) * contactDensity)"
                  :align="col.align || 'center'" :fixed="col.fixed || false" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span v-if="col.prop === 'name'" class="contact-name">{{ row.name || '--' }}</span>
                    <span v-else-if="col.prop === 'phone'" class="mono-text">{{ row.phone || '--' }}</span>
                    <span v-else-if="col.prop === 'person_type'" class="type-tag">{{ row.person_type || '联系人' }}</span>
                    <span v-else-if="col.prop === 'roles'" class="role-cell">
                      <template v-if="rolesOf(row).length">
                        <span v-for="r in rolesOf(row)" :key="r" class="role-tag" :class="roleClass(r)">{{ r }}</span>
                      </template>
                      <span v-else class="text-muted">未设置</span>
                    </span>
                    <span v-else-if="col.prop === 'position'" class="text-content">{{ row.position || '--' }}</span>
                    <div v-else-if="col.prop === 'action'" class="action-cell">
                      <el-button link class="action-btn action-edit" @click="openContactDialog(row)">编辑</el-button>
                      <el-button link class="action-btn action-danger" @click="removeContact(row)">删除</el-button>
                    </div>
                    <span v-else class="text-content">{{ row[col.prop] || '--' }}</span>
                  </template>
                </el-table-column>

                <template #empty>
                  <div class="empty-state small">
                    <el-icon class="empty-icon">
                      <UserFilled />
                    </el-icon>
                    <p>该客户下还没有联系人</p>
                    <span class="empty-tip">点击右上角「新增联系人」，勾选「装货 / 卸货 / 唯一」后建运单可自动带入电话</span>
                  </div>
                </template>
              </el-table>
            </div>

            <transition name="fs-fade">
              <button v-if="contactFullscreen" class="fs-exit-btn" @click="contactFullscreen = false">
                <el-icon>
                  <Close />
                </el-icon> 退出全屏
              </button>
            </transition>
          </div>
        </Teleport>
      </template>
    </section>

    <!-- ============================================================
         客户新增 / 编辑
         ============================================================ -->
    <el-dialog v-model="customerDialogVisible" :title="customerDialogMode === 'add' ? '新增客户' : '编辑客户'" width="640px"
      top="8vh" append-to-body destroy-on-close :close-on-click-modal="false" class="ca-dialog">
      <el-form ref="customerFormRef" :model="customerForm" :rules="customerRules" label-width="96px" class="ca-form">
        <el-form-item label="所属组织" prop="org_name">
          <el-select v-model="customerForm.org_name" placeholder="请选择所属组织" clearable filterable style="width:100%">
            <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.name" />
          </el-select>
        </el-form-item>

        <el-form-item label="客户名称" prop="name">
          <el-input v-model="customerForm.name" placeholder="请输入客户名称" clearable maxlength="60" />
        </el-form-item>

        <div class="form-grid">
          <el-form-item label="负责人">
            <el-input v-model="customerForm.manager" placeholder="选填" clearable maxlength="20" />
          </el-form-item>
          <el-form-item label="负责人电话">
            <el-input v-model="customerForm.manager_phone" placeholder="选填" clearable maxlength="30" />
          </el-form-item>
        </div>

        <el-form-item label="所属区域">
          <el-cascader v-model="customerForm.regionPath" :options="REGION_CASCADER" placeholder="选填，请选择省 / 市"
            clearable filterable style="width:100%" popper-class="ca-region-popper" />
        </el-form-item>

        <el-form-item label="上传合同">
          <div class="contract-box">
            <div v-if="customerForm.contract_name" class="contract-file">
              <el-icon class="file-icon">
                <Document />
              </el-icon>
              <span class="file-name">{{ customerForm.contract_name }}</span>
              <span class="file-size">{{ formatSize(customerForm.contract_size) }}</span>
              <el-button link type="primary" size="small" @click="previewFormContract">查看</el-button>
              <el-button link type="danger" size="small" @click="clearContract">移除</el-button>
            </div>
            <div class="contract-actions">
              <el-upload :show-file-list="false" :auto-upload="false" :on-change="handleContractChange"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" class="inline-upload">
                <button type="button" class="upload-btn">
                  <el-icon>
                    <Upload />
                  </el-icon>
                  {{ customerForm.contract_name ? '重新上传' : '上传合同' }}
                </button>
              </el-upload>
              <span class="contract-tip">选填，支持 PDF / Word / 图片，单个 ≤ 5MB</span>
            </div>
          </div>
        </el-form-item>

        <el-form-item label="状态">
          <el-radio-group v-model="customerForm.status">
            <el-radio :value="1">正常</el-radio>
            <el-radio :value="0">停用</el-radio>
          </el-radio-group>
          <span class="form-hint">停用后，新建运单时不可选该客户</span>
        </el-form-item>

        <el-form-item label="备注">
          <el-input v-model="customerForm.remark" type="textarea" :rows="2" placeholder="选填" maxlength="200"
            show-word-limit />
        </el-form-item>
      </el-form>

      <template #footer>
        <button class="btn-ghost" @click="customerDialogVisible = false">取消</button>
        <button class="btn-solid" :disabled="customerSaving" @click="saveCustomer">
          {{ customerSaving ? '保存中…' : '保存' }}
        </button>
      </template>
    </el-dialog>

    <!-- ============================================================
         联系人新增 / 编辑
         ============================================================ -->
    <el-dialog v-model="contactDialogVisible" :title="contactDialogMode === 'add' ? '新增联系人' : '编辑联系人'" width="560px"
      top="10vh" append-to-body destroy-on-close :close-on-click-modal="false" class="ca-dialog">
      <el-form ref="contactFormRef" :model="contactForm" :rules="contactRules" label-width="96px" class="ca-form">
        <el-form-item label="类型">
          <el-radio-group v-model="contactForm.person_type">
            <el-radio value="联系人">联系人</el-radio>
            <el-radio value="员工">员工</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="姓名" prop="name">
          <el-input v-model="contactForm.name" placeholder="请输入姓名" clearable maxlength="20" />
        </el-form-item>

        <el-form-item label="手机号" prop="phone">
          <el-input v-model="contactForm.phone" placeholder="请输入手机号" clearable maxlength="20" />
        </el-form-item>

        <el-form-item label="联系人角色">
          <div class="role-picker">
            <div class="role-options">
              <el-checkbox :model-value="contactForm.roles.includes('装货')" @change="toggleRole('装货')">
                装货联系人
              </el-checkbox>
              <el-checkbox :model-value="contactForm.roles.includes('卸货')" @change="toggleRole('卸货')">
                卸货联系人
              </el-checkbox>
              <el-checkbox :model-value="contactForm.roles.includes('唯一')" @change="toggleRole('唯一')">
                唯一
              </el-checkbox>
              <el-tooltip placement="top" effect="dark">
                <template #content>
                  <div class="tip-lines">
                    <p>· 装货联系人 → 建运单时带入「发货联系电话」</p>
                    <p>· 卸货联系人 → 建运单时带入「收货联系电话」</p>
                    <p>· 唯一：装货、卸货两端都带入</p>
                    <p>· 同一角色只有一个联系人时自动带入，多个时需手动选</p>
                  </div>
                </template>
                <el-icon class="role-help">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </div>
            <div class="role-hint">勾选后将关联到运单，自动带入发货 / 收货联系电话</div>
          </div>
        </el-form-item>

        <el-form-item label="职务">
          <el-input v-model="contactForm.position" placeholder="选填，如：调度 / 库管" clearable maxlength="30" />
        </el-form-item>

        <el-form-item label="备注">
          <el-input v-model="contactForm.remark" type="textarea" :rows="2" placeholder="选填" maxlength="200"
            show-word-limit />
        </el-form-item>
      </el-form>

      <template #footer>
        <button class="btn-ghost" @click="contactDialogVisible = false">取消</button>
        <button class="btn-solid" :disabled="contactSaving" @click="saveContact">
          {{ contactSaving ? '保存中…' : '保存' }}
        </button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CirclePlus, Search, Refresh, Document, Upload, Close,
  OfficeBuilding, UserFilled, WarningFilled, QuestionFilled,
} from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { supabase } from '@/utils/supabase'
import { REGION_CASCADER, formatRegion } from '@/utils/regionData'
import TableTools from '@/components/TableTools.vue'

// ============================================================
// 当前用户 / 数据隔离
// ============================================================
const currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('currentUser') || '{}') } catch { return {} }
})()
const isAdmin = currentUser.role === 'admin'
const isCustomer = !isAdmin
const myAccount = currentUser.masterAccount || currentUser.account || ''
const myCustomerId = currentUser.customerId || null

// ============================================================
// 列配置
// ============================================================
const DEFAULT_CUSTOMER_COLUMNS = [
  // ⭐ 窄列用固定 width（空表时不会被压扁），宽列用 minWidth 自适应
  { prop: 'name', label: '客户', visible: true, minWidth: 130, align: 'left' },
  { prop: 'manager', label: '负责人', visible: true, width: 76, align: 'center' },
  { prop: 'manager_phone', label: '电话', visible: true, minWidth: 108, align: 'center' },
  // ⭐ 区域 / 合同默认收起：左侧面板窄，需要时在「列设置」里打开
  { prop: 'region', label: '所属区域', visible: false, minWidth: 120, align: 'center' },
  { prop: 'contract', label: '合同', visible: false, minWidth: 130, align: 'left' },
  { prop: 'status', label: '状态', visible: true, width: 68, align: 'center' },
  { prop: 'action', label: '操作', visible: true, width: 136, align: 'center', fixed: 'right' },
]

const DEFAULT_CONTACT_COLUMNS = [
  { prop: 'name', label: '姓名', visible: true, minWidth: 96, align: 'center' },
  { prop: 'phone', label: '手机号', visible: true, minWidth: 120, align: 'center' },
  { prop: 'person_type', label: '类型', visible: true, width: 78, align: 'center' },
  { prop: 'roles', label: '联系人角色', visible: true, minWidth: 140, align: 'left' },
  { prop: 'position', label: '职务', visible: true, width: 100, align: 'center' },
  { prop: 'action', label: '操作', visible: true, width: 108, align: 'center', fixed: 'right' },
]

const customerColumns = ref(JSON.parse(JSON.stringify(DEFAULT_CUSTOMER_COLUMNS)))
const contactColumns = ref(JSON.parse(JSON.stringify(DEFAULT_CONTACT_COLUMNS)))

const customerVisibleColumns = computed(() => customerColumns.value.filter(c => c.visible))
const contactVisibleColumns = computed(() => contactColumns.value.filter(c => c.visible))

const customerSize = ref('default')
const contactSize = ref('default')
const customerDensity = computed(() => customerSize.value === 'large' ? 1.12 : customerSize.value === 'small' ? 0.88 : 1)
const contactDensity = computed(() => contactSize.value === 'large' ? 1.12 : contactSize.value === 'small' ? 0.88 : 1)

const resetCustomerColumns = () => {
  customerColumns.value = JSON.parse(JSON.stringify(DEFAULT_CUSTOMER_COLUMNS))
  ElMessage.success('已重置列设置')
}
const resetContactColumns = () => {
  contactColumns.value = JSON.parse(JSON.stringify(DEFAULT_CONTACT_COLUMNS))
  ElMessage.success('已重置列设置')
}

// ============================================================
// 数据
// ============================================================
const CUSTOMER_SELECT = 'id, org_id, org_name, name, manager, manager_phone, province, city, status, remark, contract_name, contract_type, contract_size, has_contract, created_at, updated_at'

const customers = ref([])
const contacts = ref([])
const loadingCustomers = ref(false)
const loadingContacts = ref(false)
const dbHint = ref(null)

const selectedId = ref('')
const selectedCustomer = computed(() => customers.value.find(c => c.id === selectedId.value) || null)

const customerKeyword = ref('')
const appliedCustomerKeyword = ref('')
const statusTab = ref(1)

const contactKeyword = reactive({ name: '', phone: '', personType: '' })
const appliedContactKeyword = ref({ name: '', phone: '', personType: '' })

const customerFullscreen = ref(false)
const contactFullscreen = ref(false)

const normalize = (v) => String(v || '').trim().toLowerCase()

const filteredCustomers = computed(() => {
  const kw = normalize(appliedCustomerKeyword.value)
  return customers.value.filter(row => {
    if (Number(row.status ?? 1) !== Number(statusTab.value)) return false
    if (!kw) return true
    return [row.name, row.manager, row.manager_phone, formatRegion(row.province, row.city)]
      .some(v => normalize(v).includes(kw))
  })
})

const normalCount = computed(() => customers.value.filter(r => Number(r.status ?? 1) === 1).length)
const disabledCount = computed(() => customers.value.filter(r => Number(r.status ?? 1) === 0).length)

const filteredContacts = computed(() => {
  const { name, phone, personType } = appliedContactKeyword.value
  const n = normalize(name)
  const p = normalize(phone)
  return contacts.value.filter(row => {
    if (n && !normalize(row.name).includes(n)) return false
    if (p && !normalize(row.phone).includes(p)) return false
    if (personType && (row.person_type || '联系人') !== personType) return false
    return true
  })
})

const applyCustomerSearch = () => {
  appliedCustomerKeyword.value = customerKeyword.value
  /* 搜完当前选中的客户被过滤掉了 → 自动落到第一条，右栏不会「悬空」 */
  if (filteredCustomers.value.length && !filteredCustomers.value.some(c => c.id === selectedId.value)) {
    selectedId.value = filteredCustomers.value[0].id
    fetchContacts()
  }
}
const applyContactSearch = () => {
  appliedContactKeyword.value = { ...contactKeyword }
}
const resetContactSearch = () => {
  contactKeyword.name = ''
  contactKeyword.phone = ''
  contactKeyword.personType = ''
  applyContactSearch()
}

const customerRowClass = ({ row }) => (row.id === selectedId.value ? 'is-selected-row' : '')

const selectCustomer = (row) => {
  if (!row || row.id === selectedId.value) return
  selectedId.value = row.id
  fetchContacts()
}

// ============================================================
// 组织下拉
// ============================================================
const orgOptions = ref([])
const loadOrgOptions = async () => {
  try {
    let q = supabase.from('organizations').select('id, name, level, parent_id').order('level', { ascending: true })
    if (isCustomer) q = q.eq('owner_account', myAccount)
    const { data, error } = await q
    if (error) throw error
    orgOptions.value = data || []
  } catch (e) {
    console.warn('[客户档案] 组织加载失败', e)
  }
}

// ============================================================
// 读取
// ============================================================
/* 数据库/权限类报错统一翻译成人话，别把 PostgREST 原文甩给用户 */
const PERM_DENIED = /permission denied|not authorized|权限/i
const friendlyError = (e, fallback = '操作失败') => {
  const msg = String(e?.message || e || '')
  if (PERM_DENIED.test(msg)) return '数据库没有读写权限，请执行 sql/2026-10-18_customer_archive_grant.sql'
  if (/invalid input syntax for type uuid/i.test(msg)) {
    return '数据库字段类型不匹配（customer_id / org_id），请执行 sql/2026-10-18_customer_archive_fix_ids.sql'
  }
  return `${fallback}：${msg}`
}

const handleTableError = (e) => {
  const msg = String(e?.message || e || '')
  if (PERM_DENIED.test(msg)) {
    dbHint.value = {
      title: '客户档案表没有读写权限',
      file: 'sql/2026-10-18_customer_archive_grant.sql',
    }
    return
  }
  /* 表没建 / 数据源未就绪 */
  if (/relation|does not exist|不存在|undefined table|42P01|fetch/i.test(msg)) {
    dbHint.value = {
      title: '客户档案表读取失败（多半是还没建表）',
      file: 'sql/2026-10-18_customer_archive.sql',
    }
    return
  }
  ElMessage.error('加载失败：' + msg)
}

const fetchCustomers = async (retry = 0) => {
  loadingCustomers.value = true
  try {
    let q = supabase.from('customer_archives').select(CUSTOMER_SELECT).order('created_at', { ascending: false })
    if (isCustomer) q = q.eq('owner_account', myAccount)
    const { data, error } = await q
    if (error) throw error
    dbHint.value = null
    customers.value = data || []

    if (selectedId.value && !customers.value.some(c => c.id === selectedId.value)) {
      selectedId.value = ''
    }
    if (!selectedId.value) {
      const first = filteredCustomers.value[0] || customers.value[0]
      if (first) {
        selectedId.value = first.id
        await fetchContacts()
        return
      }
    }
    await fetchContacts()
  } catch (e) {
    /* ⭐ 首次进页面时匿名登录态可能还没就绪（FetchError），等一下重试一次 */
    if (retry < 1 && /fetch/i.test(String(e?.message || e))) {
      await new Promise(r => setTimeout(r, 900))
      loadingCustomers.value = false
      return fetchCustomers(retry + 1)
    }
    handleTableError(e)
  } finally {
    loadingCustomers.value = false
  }
}

const fetchContacts = async () => {
  if (!selectedId.value) { contacts.value = []; return }
  loadingContacts.value = true
  try {
    const { data, error } = await supabase
      .from('customer_contacts')
      .select('*')
      .eq('archive_id', selectedId.value)
      .order('created_at', { ascending: true })
    if (error) throw error
    contacts.value = data || []
  } catch (e) {
    handleTableError(e)
  } finally {
    loadingContacts.value = false
  }
}

// ============================================================
// 客户新增 / 编辑
// ============================================================
const customerDialogVisible = ref(false)
const customerDialogMode = ref('add')
const customerSaving = ref(false)
const customerFormRef = ref(null)

const emptyCustomerForm = () => ({
  id: '',
  org_name: '',
  name: '',
  manager: '',
  manager_phone: '',
  regionPath: [],
  status: 1,
  remark: '',
  contract_name: '',
  contract_type: '',
  contract_size: 0,
  contract_data: '',
  has_contract: false,
})

const customerForm = reactive(emptyCustomerForm())
let contractTouched = false

const customerRules = {
  org_name: [{ required: true, message: '请选择所属组织', trigger: 'change' }],
  name: [
    { required: true, message: '请输入客户名称', trigger: 'blur' },
    { min: 2, max: 60, message: '客户名称 2~60 个字符', trigger: 'blur' },
  ],
}

const openCustomerDialog = (row) => {
  Object.assign(customerForm, emptyCustomerForm())
  contractTouched = false
  customerDialogMode.value = row ? 'edit' : 'add'
  if (row) {
    customerForm.id = row.id
    customerForm.org_name = row.org_name || ''
    customerForm.name = row.name || ''
    customerForm.manager = row.manager || ''
    customerForm.manager_phone = row.manager_phone || ''
    customerForm.regionPath = row.province ? [row.province, row.city].filter(Boolean) : []
    customerForm.status = Number(row.status ?? 1)
    customerForm.remark = row.remark || ''
    customerForm.contract_name = row.contract_name || ''
    customerForm.contract_type = row.contract_type || ''
    customerForm.contract_size = row.contract_size || 0
    customerForm.has_contract = !!row.has_contract
  }
  customerDialogVisible.value = true
}

// ---------------- 合同 ----------------
const formatSize = (bytes) => {
  const n = Number(bytes) || 0
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

const readFileAsDataURL = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result || ''))
  reader.onerror = reject
  reader.readAsDataURL(file)
})

const handleContractChange = async (uploadFile) => {
  const raw = uploadFile?.raw
  if (!raw) return
  if (raw.size > 5 * 1024 * 1024) {
    ElMessage.warning('合同文件不能超过 5MB')
    return
  }
  try {
    const dataUrl = await readFileAsDataURL(raw)
    customerForm.contract_name = raw.name
    customerForm.contract_type = raw.type || ''
    customerForm.contract_size = raw.size
    customerForm.contract_data = dataUrl
    customerForm.has_contract = true
    contractTouched = true
  } catch (e) {
    ElMessage.error('读取文件失败：' + (e?.message || e))
  }
}

const clearContract = () => {
  customerForm.contract_name = ''
  customerForm.contract_type = ''
  customerForm.contract_size = 0
  customerForm.contract_data = ''
  customerForm.has_contract = false
  contractTouched = true
}

const previewFormContract = async () => {
  if (customerForm.contract_data) {
    downloadDataUrl(customerForm.contract_data, customerForm.contract_name)
    return
  }
  if (!customerForm.id) return
  await previewContract({ id: customerForm.id, contract_name: customerForm.contract_name })
}

const downloadDataUrl = (dataUrl, name) => {
  if (!dataUrl) { ElMessage.warning('合同内容为空'); return }
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = name || '合同'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

const previewContract = async (row) => {
  try {
    const { data, error } = await supabase
      .from('customer_archives')
      .select('contract_name, contract_data')
      .eq('id', row.id)
      .maybeSingle()
    if (error) throw error
    if (!data?.contract_data) { ElMessage.warning('该客户没有上传合同'); return }
    downloadDataUrl(data.contract_data, data.contract_name || row.contract_name)
  } catch (e) {
    ElMessage.error(friendlyError(e, '获取合同失败'))
  }
}

// ---------------- 保存 ----------------
/* ⭐ 若 customer_id / org_id 还是 uuid 类型（没跑 fix_ids.sql），
   去掉这两个字段重试，保证客户先能存下来；跑过脚本后就会正常落库 */
const isUuidTypeError = (e) => /invalid input syntax for type uuid/i.test(String(e?.message || e))

const insertArchive = async (payload) => {
  let res = await supabase.from('customer_archives').insert(payload).select('id').single()
  if (res.error && isUuidTypeError(res.error)) {
    console.warn('[客户档案] customer_id / org_id 仍是 uuid 类型，本次跳过这两个字段落库；' +
      '建议执行 sql/2026-10-18_customer_archive_fix_ids.sql')
    const { customer_id, org_id, ...rest } = payload
    res = await supabase.from('customer_archives').insert(rest).select('id').single()
  }
  return res
}

const updateArchive = async (payload, id) => {
  let res = await supabase.from('customer_archives').update(payload).eq('id', id)
  if (res.error && isUuidTypeError(res.error)) {
    console.warn('[客户档案] customer_id / org_id 仍是 uuid 类型，本次跳过这两个字段更新')
    const { customer_id, org_id, ...rest } = payload
    res = await supabase.from('customer_archives').update(rest).eq('id', id)
  }
  return res
}

const insertContact = async (payload) => {
  let res = await supabase.from('customer_contacts').insert(payload)
  if (res.error && isUuidTypeError(res.error)) {
    const { customer_id, ...rest } = payload
    res = await supabase.from('customer_contacts').insert(rest)
  }
  return res
}

const updateContact = async (payload, id) => {
  let res = await supabase.from('customer_contacts').update(payload).eq('id', id)
  if (res.error && isUuidTypeError(res.error)) {
    const { customer_id, ...rest } = payload
    res = await supabase.from('customer_contacts').update(rest).eq('id', id)
  }
  return res
}

const saveCustomer = async () => {
  if (!customerFormRef.value) return
  try {
    await customerFormRef.value.validate()
  } catch { return }

  const dup = customers.value.find(c =>
    normalize(c.name) === normalize(customerForm.name) && c.id !== customerForm.id
  )
  if (dup) {
    ElMessage.warning(`已存在同名客户「${dup.name}」，请确认是否重复`)
  }

  customerSaving.value = true
  try {
    const [province = '', city = ''] = customerForm.regionPath || []
    const org = orgOptions.value.find(o => o.name === customerForm.org_name)
    const payload = {
      org_id: org?.id != null ? String(org.id) : null,
      org_name: customerForm.org_name || null,
      name: customerForm.name.trim(),
      manager: customerForm.manager?.trim() || null,
      manager_phone: customerForm.manager_phone?.trim() || null,
      province: province || null,
      city: city || null,
      status: customerForm.status,
      remark: customerForm.remark?.trim() || null,
      contract_name: customerForm.contract_name || null,
      contract_type: customerForm.contract_type || null,
      contract_size: customerForm.contract_size || null,
      has_contract: !!customerForm.contract_name,
      updated_at: new Date().toISOString(),
    }
    if (contractTouched) payload.contract_data = customerForm.contract_data || null

    if (customerDialogMode.value === 'add') {
      payload.owner_account = isAdmin ? null : myAccount
      payload.customer_id = myCustomerId != null ? String(myCustomerId) : null
      payload.created_at = new Date().toISOString()
      const { data, error } = await insertArchive(payload)
      if (error) throw error
      ElMessage.success('客户创建成功')
      customerDialogVisible.value = false
      await fetchCustomers()
      if (data?.id) {
        selectedId.value = data.id
        await fetchContacts()
      }
      return
    }

    const { error } = await updateArchive(payload, customerForm.id)
    if (error) throw error
    ElMessage.success('客户信息已更新')
    customerDialogVisible.value = false
    await fetchCustomers()
  } catch (e) {
    ElMessage.error(friendlyError(e, '保存失败'))
  } finally {
    customerSaving.value = false
  }
}

// ---------------- 状态 / 删除 ----------------
const toggleCustomerStatus = async (row) => {
  const next = Number(row.status ?? 1) === 1 ? 0 : 1
  const actionText = next === 1 ? '启用' : '停用'
  try {
    await ElMessageBox.confirm(
      next === 1 ? `确定启用客户「${row.name}」吗？` : `停用后，新建运单时不可选「${row.name}」，确定停用吗？`,
      `${actionText}确认`,
      { confirmButtonText: `确定${actionText}`, cancelButtonText: '取消', type: next === 1 ? 'success' : 'warning' }
    )
    const { error } = await supabase
      .from('customer_archives')
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (error) throw error
    ElMessage.success(`已${actionText}「${row.name}」`)
    await fetchCustomers()
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(friendlyError(e, `${actionText}失败`))
  }
}

const removeCustomer = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定删除客户「${row.name}」吗？该客户下的联系人和合同会一并删除，且不可恢复。`,
      '删除确认',
      { confirmButtonText: '确定删除', cancelButtonText: '取消', type: 'warning' }
    )
  } catch { return }

  try {
    // 先删联系人（防止外键未级联时留下孤儿数据）
    await supabase.from('customer_contacts').delete().eq('archive_id', row.id)
    const { error } = await supabase.from('customer_archives').delete().eq('id', row.id)
    if (error) throw error
    ElMessage.success('已删除')
    if (selectedId.value === row.id) selectedId.value = ''
    await fetchCustomers()
  } catch (e) {
    ElMessage.error(friendlyError(e, '删除失败'))
  }
}

// ============================================================
// 联系人新增 / 编辑
// ============================================================
const contactDialogVisible = ref(false)
const contactDialogMode = ref('add')
const contactSaving = ref(false)
const contactFormRef = ref(null)

const emptyContactForm = () => ({
  id: '',
  person_type: '联系人',
  name: '',
  phone: '',
  roles: [],
  position: '',
  remark: '',
})
const contactForm = reactive(emptyContactForm())

const contactRules = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { pattern: /^[0-9\-+\s]{6,20}$/, message: '手机号格式不正确', trigger: 'blur' },
  ],
}

const rolesOf = (row) => String(row?.roles || '').split(',').map(s => s.trim()).filter(Boolean)
const roleClass = (role) => ({ '装货': 'role-load', '卸货': 'role-unload', '唯一': 'role-only' }[role] || '')

const toggleRole = (role) => {
  const list = contactForm.roles
  if (role === '唯一') {
    contactForm.roles = list.includes('唯一') ? [] : ['唯一']
    return
  }
  contactForm.roles = list.includes(role)
    ? list.filter(r => r !== role)
    : [...list.filter(r => r !== '唯一'), role]
}

const openContactDialog = (row) => {
  if (!selectedCustomer.value) {
    ElMessage.warning('请先在左侧选择客户')
    return
  }
  Object.assign(contactForm, emptyContactForm())
  contactDialogMode.value = row ? 'edit' : 'add'
  if (row) {
    contactForm.id = row.id
    contactForm.person_type = row.person_type || '联系人'
    contactForm.name = row.name || ''
    contactForm.phone = row.phone || ''
    contactForm.roles = rolesOf(row)
    contactForm.position = row.position || ''
    contactForm.remark = row.remark || ''
  }
  contactDialogVisible.value = true
}

const saveContact = async () => {
  if (!contactFormRef.value || !selectedCustomer.value) return
  try {
    await contactFormRef.value.validate()
  } catch { return }

  contactSaving.value = true
  try {
    const payload = {
      archive_id: selectedCustomer.value.id,
      owner_account: isAdmin ? null : myAccount,
      customer_id: myCustomerId != null ? String(myCustomerId) : null,
      person_type: contactForm.person_type || '联系人',
      name: contactForm.name.trim(),
      phone: contactForm.phone.trim(),
      roles: contactForm.roles.length ? contactForm.roles.join(',') : null,
      position: contactForm.position?.trim() || null,
      remark: contactForm.remark?.trim() || null,
      status: 1,
      updated_at: new Date().toISOString(),
    }

    if (contactDialogMode.value === 'add') {
      payload.created_at = new Date().toISOString()
      const { error } = await insertContact(payload)
      if (error) throw error
      ElMessage.success('联系人已添加')
    } else {
      const { error } = await updateContact(payload, contactForm.id)
      if (error) throw error
      ElMessage.success('联系人已更新')
    }
    contactDialogVisible.value = false
    await fetchContacts()
  } catch (e) {
    ElMessage.error(friendlyError(e, '保存失败'))
  } finally {
    contactSaving.value = false
  }
}

const removeContact = async (row) => {
  try {
    await ElMessageBox.confirm(`确定删除联系人「${row.name}」吗？`, '删除确认', {
      confirmButtonText: '确定删除', cancelButtonText: '取消', type: 'warning',
    })
  } catch { return }
  try {
    const { error } = await supabase.from('customer_contacts').delete().eq('id', row.id)
    if (error) throw error
    ElMessage.success('已删除')
    await fetchContacts()
  } catch (e) {
    ElMessage.error(friendlyError(e, '删除失败'))
  }
}

// ============================================================
// 生命周期
// ============================================================
watch(statusTab, () => {
  // 切到停用页时，若当前选中的客户不在该页，自动选第一条
  if (!filteredCustomers.value.some(c => c.id === selectedId.value)) {
    selectedId.value = filteredCustomers.value[0]?.id || ''
    fetchContacts()
  }
})

onMounted(async () => {
  await loadOrgOptions()
  await fetchCustomers()
})

defineExpose({ fetchCustomers })
</script>

<style scoped>
/* ============================================================
   页面骨架
   ============================================================ */
.customer-archive-page {
  display: flex;
  gap: 12px;
  height: 100%;
  padding: 12px;
  box-sizing: border-box;
  overflow: hidden;
  background: #F8FAFC;
  font-size: 13px;
}

.ca-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  min-width: 0;
  padding: 12px 14px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.ca-customer {
  /* 46% ≈ 1440 屏下 620px，正好放得下 5 列不挤压 */
  flex: 0 0 clamp(452px, 46%, 700px);
}

.ca-contact {
  flex: 1;
}

/* ---------- 面板头部 ---------- */
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
}

.panel-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
  font-weight: 700;
  color: #0F172A;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.title-dot {
  width: 4px;
  height: 14px;
  border-radius: 2px;
  background: linear-gradient(180deg, var(--brand-primary), var(--brand-primary-dark));
  flex: 0 0 auto;
}

.title-sub {
  font-size: 12.5px;
  font-weight: 400;
  color: #94A3B8;
}

/* ---------- 搜索 ---------- */
.panel-search {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  min-width: 140px;
}

.search-field {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 160px;
}

.field-name {
  font-size: 12.5px;
  color: #475569;
  white-space: nowrap;
}

.search-field :deep(.el-input) {
  flex: 1;
  min-width: 90px;
}

.type-select {
  width: 120px;
  flex: 0 0 auto;
}

.search-label {
  font-size: 12px;
  color: #94A3B8;
  margin-right: 2px;
  white-space: nowrap;
}

.panel-search :deep(.el-input__wrapper),
.panel-search :deep(.el-select__wrapper) {
  border-radius: 6px !important;
  background: #F8FAFC !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  transition: all .25s;
  min-height: 30px;
}

.panel-search :deep(.el-input__wrapper:hover),
.panel-search :deep(.el-select__wrapper:hover) {
  background: var(--brand-primary-light) !important;
  box-shadow: 0 0 0 1px #FCA5A5 inset !important;
}

.panel-search :deep(.el-input__wrapper.is-focus),
.panel-search :deep(.el-select__wrapper.is-focused) {
  background: #fff !important;
  box-shadow: 0 0 0 2px rgba(var(--brand-rgb), 0.15), 0 0 0 1px var(--brand-primary) inset !important;
}

.btn-primary {
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark)) !important;
  border: none !important;
  color: #fff !important;
  font-weight: 600;
  border-radius: 6px !important;
  box-shadow: 0 3px 10px rgba(var(--brand-rgb), 0.22);
  transition: all .25s;
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 5px 14px rgba(var(--brand-rgb), 0.35);
}

.btn-primary.is-disabled {
  box-shadow: none;
  opacity: .5;
}

.btn-sm {
  height: 30px;
  padding: 0 12px;
  font-size: 12.5px;
}

.btn-outline {
  border-radius: 6px !important;
  border-color: #CBD5E1 !important;
  color: #334155;
  background: #fff !important;
  transition: all .25s;
}

.btn-outline:hover {
  border-color: var(--brand-primary) !important;
  color: var(--brand-primary) !important;
  background: var(--brand-primary-light) !important;
}

/* ---------- 状态页签 ---------- */
.status-tabs {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.status-tab {
  border: 1px solid transparent;
  background: #F8FAFC;
  color: #64748B;
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition: all .22s cubic-bezier(.34, 1.2, .64, 1);
  font-family: inherit;
}

.status-tab:hover {
  color: var(--brand-primary);
  background: var(--brand-primary-light);
}

.status-tab.active {
  background: var(--brand-primary-light);
  color: var(--brand-primary);
  border-color: #FECACA;
  font-weight: 700;
}

/* ---------- 表格 ---------- */
.table-shell {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
}

.table-shell.is-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 9999;
  padding: 18px 20px;
  background: #fff;
  box-shadow: 0 20px 60px rgba(var(--brand-rgb), 0.12);
  animation: fs-fade-in .25s ease;
}

@keyframes fs-fade-in {
  from {
    opacity: 0;
    transform: scale(.995);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

.table-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border-radius: 8px;
}

.custom-table {
  border-radius: 8px;
  overflow: hidden;
  font-size: 12.5px;
  -webkit-font-smoothing: antialiased;
}

:deep(.custom-table th.el-table__cell) {
  background: #F8FAFC !important;
  color: #0F172A;
  font-weight: 700;
  font-size: 12.5px;
  border-bottom: 1px solid #E2E8F0;
  padding: 8px 0;
}

:deep(.custom-table td.el-table__cell) {
  color: #1E293B;
  font-size: 12.5px;
  font-weight: 500;
  border-bottom: 1px solid #F1F5F9;
}

:deep(.custom-table.el-table--large td.el-table__cell) {
  padding: 12px 0;
}

:deep(.custom-table.el-table--default td.el-table__cell) {
  padding: 8px 0;
}

:deep(.custom-table.el-table--small td.el-table__cell) {
  padding: 4px 0;
}

:deep(.custom-table .el-table__row:hover td) {
  background: var(--brand-primary-light) !important;
}

:deep(.custom-table .is-selected-row td) {
  background: var(--brand-primary-light) !important;
}

:deep(.custom-table .is-selected-row td:first-child) {
  box-shadow: inset 3px 0 0 var(--brand-primary);
}

.customer-name {
  color: #0F172A;
  font-weight: 600;
}

.contact-name {
  color: #1E293B;
  font-weight: 600;
}

.text-content {
  color: #334155;
}

.text-muted {
  color: #CBD5E1;
}

.mono-text {
  font-variant-numeric: tabular-nums;
  color: #475569;
  letter-spacing: .2px;
}

/* 状态 */
.status-tag {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 10px;
  font-size: 11.5px;
  font-weight: 600;
}

.status-tag.on {
  color: #047857;
  background: #ECFDF5;
}

.status-tag.off {
  color: #94A3B8;
  background: #F1F5F9;
}

/* 类型 / 角色 */
.type-tag {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 7px;
  border-radius: 4px;
  font-size: 11.5px;
  color: #475569;
  background: #F1F5F9;
}

.role-cell {
  display: inline-flex;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: center;
}

.role-tag {
  display: inline-flex;
  align-items: center;
  height: 19px;
  padding: 0 7px;
  border-radius: 4px;
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
}

.role-load {
  color: #0369A1;
  background: #F0F9FF;
}

.role-unload {
  color: #B45309;
  background: #FFFBEB;
}

.role-only {
  color: var(--brand-primary);
  background: var(--brand-primary-light);
}

/* 合同 */
.contract-cell {
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

.contract-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #0369A1;
  cursor: pointer;
  font-size: 12px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contract-link:hover {
  color: var(--brand-primary);
  text-decoration: underline;
}

/* 操作 */
.action-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.action-cell :deep(.el-button) {
  margin: 0 !important;
  padding: 0 3px !important;
  border: none !important;
  background: transparent !important;
  height: 22px !important;
}

.action-btn {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1;
  border-radius: 4px;
  transition: all .2s;
}

.action-edit {
  color: var(--brand-primary);
}

.action-edit:hover {
  color: #7F1D1D;
  background: var(--brand-primary-light);
}

.action-warn {
  color: #B45309;
}

.action-warn:hover {
  color: #92400E;
  background: #FFFBEB;
}

.action-view {
  color: #0EA5E9;
}

.action-view:hover {
  color: #0369A1;
  background: #F0F9FF;
}

.action-danger {
  color: #94A3B8;
}

.action-danger:hover {
  color: #B91C1C;
  background: var(--brand-primary-light);
}

/* 空态 */
.empty-state {
  padding: 46px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.empty-state.small {
  padding: 34px 16px;
}

.empty-icon {
  font-size: 40px;
  color: #E2E8F0;
}

.empty-state p {
  margin: 0;
  font-size: 13px;
  color: #94A3B8;
}

.empty-tip {
  font-size: 12px;
  color: #CBD5E1;
  text-align: center;
  line-height: 1.5;
}

/* 未选客户插画 */
.pick-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 0;
}

.pick-illus {
  width: 132px;
  height: 114px;
  opacity: .95;
}

.pick-empty p {
  margin: 0;
  font-size: 13.5px;
  color: #94A3B8;
}

/* 全屏退出按钮 */
.fs-exit-btn {
  position: fixed;
  right: 26px;
  bottom: 26px;
  z-index: 10000;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 16px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  color: #fff;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 8px 22px rgba(var(--brand-rgb), .35);
  transition: all .25s;
  font-family: inherit;
}

.fs-exit-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(var(--brand-rgb), .45);
}

.fs-fade-enter-active,
.fs-fade-leave-active {
  transition: opacity .2s;
}

.fs-fade-enter-from,
.fs-fade-leave-to {
  opacity: 0;
}

/* SQL 未执行提示 */
.sql-hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 8px;
  background: #FFFBEB;
  border: 1px solid #FDE68A;
  color: #92400E;
  font-size: 12px;
  line-height: 1.6;
  flex-shrink: 0;
}

.sql-hint-text {
  min-width: 0;
  word-break: break-word;
}

.sql-hint-sub {
  margin-top: 2px;
}

.sql-hint code {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 4px;
  background: #FEF3C7;
  font-size: 11.5px;
  white-space: nowrap;
}

/* ============================================================
   弹窗
   ============================================================ */
.ca-form {
  padding-right: 6px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 12px;
}

.form-hint {
  margin-left: 10px;
  font-size: 12px;
  color: #94A3B8;
}

.ca-form :deep(.el-form-item__label) {
  font-size: 13px;
  color: #334155;
  font-weight: 600;
}

.contract-box {
  width: 100%;
}

.contract-file {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  margin-bottom: 8px;
}

.file-icon {
  color: var(--brand-primary);
  font-size: 15px;
}

.file-name {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: #334155;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 11.5px;
  color: #94A3B8;
}

.contract-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.inline-upload {
  display: inline-flex;
}

.upload-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px dashed #CBD5E1;
  background: #fff;
  color: #475569;
  font-size: 12.5px;
  cursor: pointer;
  transition: all .22s;
  font-family: inherit;
}

.upload-btn:hover {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
  background: var(--brand-primary-light);
}

.contract-tip {
  font-size: 11.5px;
  color: #94A3B8;
}

/* 角色选择 */
.role-picker {
  width: 100%;
}

.role-options {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.role-help {
  color: #94A3B8;
  font-size: 14px;
  cursor: help;
  transition: color .2s;
}

.role-help:hover {
  color: var(--brand-primary);
}

.role-hint {
  margin-top: 2px;
  font-size: 11.5px;
  color: #94A3B8;
  line-height: 1.5;
}

.tip-lines p {
  margin: 0 0 3px;
  font-size: 12px;
  line-height: 1.6;
}

.tip-lines p:last-child {
  margin-bottom: 0;
}

/* 弹窗底部按钮（自定义，跟系统其它页一致） */
.btn-ghost,
.btn-solid {
  height: 32px;
  padding: 0 18px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all .22s;
  font-family: inherit;
}

.btn-ghost {
  border: 1px solid #E2E8F0;
  background: #fff;
  color: #64748B;
  margin-right: 8px;
}

.btn-ghost:hover {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
}

.btn-solid {
  border: none;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  color: #fff;
  box-shadow: 0 4px 12px rgba(var(--brand-rgb), .28);
}

.btn-solid:hover {
  transform: translateY(-1px);
  box-shadow: 0 7px 18px rgba(var(--brand-rgb), .38);
}

.btn-solid:disabled {
  opacity: .6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

@media (max-width: 1320px) {
  .ca-customer {
    flex: 0 0 452px;
  }

  .type-select {
    width: 100px;
  }
}
</style>

<!-- 弹窗 / 级联面板挂到 body，样式必须全局 -->
<style>
.ca-dialog.el-dialog {
  border-radius: 12px;
  overflow: hidden;
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  margin-bottom: 0;
}

.ca-dialog .el-dialog__header {
  flex: 0 0 auto;
  margin-right: 0;
  padding: 16px 20px 12px;
  border-bottom: 1px solid #F1F5F9;
}

.ca-dialog .el-dialog__title {
  font-size: 15px;
  font-weight: 700;
  color: #0F172A;
}

.ca-dialog .el-dialog__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px;
}

.ca-dialog .el-dialog__footer {
  flex: 0 0 auto;
  padding: 12px 20px 16px;
  border-top: 1px solid #F1F5F9;
}

.ca-region-popper .el-cascader-node:hover {
  background: var(--brand-primary-light);
}

.ca-region-popper .el-cascader-node.in-active-path,
.ca-region-popper .el-cascader-node.is-active {
  color: var(--brand-primary);
  font-weight: 600;
}
</style>
