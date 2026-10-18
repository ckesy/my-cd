<template>
  <div class="cargo-archive-page">
    <!-- ============================================================
         左：货物列表
         ============================================================ -->
    <section class="ca-panel ca-cargo">
      <header class="panel-head">
        <span class="panel-title"><i class="title-dot"></i>货物</span>
        <el-button type="primary" class="btn-primary btn-sm" @click="openCargoDialog()">
          <el-icon>
            <CirclePlus />
          </el-icon> 新增
        </el-button>
      </header>

      <div class="panel-search">
        <el-input v-model="cargoKeyword" placeholder="货物名称 / 单位" clearable class="search-input"
          @keyup.enter="applyCargoSearch" @clear="applyCargoSearch">
          <template #prefix>
            <el-icon>
              <Search />
            </el-icon>
          </template>
        </el-input>
        <el-button type="primary" class="btn-primary btn-sm" @click="applyCargoSearch">查询</el-button>
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

      <Teleport to="body" :disabled="!cargoFullscreen">
        <div class="table-shell" :class="{ 'is-fullscreen': cargoFullscreen }">
          <TableTools v-model:size="cargoSize" v-model:fullscreen="cargoFullscreen" :columns="cargoColumns"
            :total="filteredCargos.length" storage-key="cargo_archive_cargo" :refreshing="loadingCargos"
            @refresh="fetchCargos" @reset="resetCargoColumns" />

          <div class="table-wrap">
            <el-table :data="filteredCargos" v-loading="loadingCargos" element-loading-text="加载中…"
              element-loading-background="rgba(255,255,255,0.88)" border stripe height="100%" :size="cargoSize"
              class="custom-table" :row-class-name="cargoRowClass" row-key="id" @row-click="selectCargo">
              <el-table-column v-for="col in cargoVisibleColumns" :key="col.prop" :prop="col.prop" :label="col.label"
                :width="col.width ? Math.round(col.width * cargoDensity) : undefined"
                :min-width="col.width ? undefined : Math.round((col.minWidth || 100) * cargoDensity)"
                :align="col.align || 'center'" :fixed="col.fixed || false" show-overflow-tooltip>
                <template #default="{ row }">
                  <span v-if="col.prop === 'name'" class="cargo-name">{{ row.name || '--' }}</span>
                  <span v-else-if="col.prop === 'unit'" class="unit-cell"
                    :title="row.unit ? `${unitFull(row.unit)} · ${unitGroupLabel(row.unit)}` : '未设置单位'">
                    <span class="text-content">{{ unitText(row.unit) }}</span>
                    <em v-if="unitSymbolDisplay(row.unit)" class="unit-sym">{{ unitSymbolDisplay(row.unit) }}</em>
                  </span>
                  <span v-else-if="col.prop === 'status'" class="status-tag"
                    :class="Number(row.status ?? 1) === 1 ? 'on' : 'off'">
                    {{ Number(row.status ?? 1) === 1 ? '正常' : '停用' }}
                  </span>
                  <div v-else-if="col.prop === 'action'" class="action-cell">
                    <el-button link class="action-btn action-edit" @click.stop="openCargoDialog(row)">编辑</el-button>
                    <el-button link class="action-btn"
                      :class="Number(row.status ?? 1) === 1 ? 'action-warn' : 'action-view'"
                      @click.stop="toggleCargoStatus(row)">
                      {{ Number(row.status ?? 1) === 1 ? '停用' : '启用' }}
                    </el-button>
                    <el-button link class="action-btn action-danger" @click.stop="removeCargo(row)">删除</el-button>
                  </div>
                  <span v-else class="text-content">{{ row[col.prop] || '--' }}</span>
                </template>
              </el-table-column>

              <template #empty>
                <div class="empty-state">
                  <el-icon class="empty-icon">
                    <Box />
                  </el-icon>
                  <p>暂无货物</p>
                  <span class="empty-tip">点击右上角「新增」创建货物档案</span>
                </div>
              </template>
            </el-table>
          </div>

          <transition name="fs-fade">
            <button v-if="cargoFullscreen" class="fs-exit-btn" @click="cargoFullscreen = false">
              <el-icon>
                <Close />
              </el-icon> 退出全屏
            </button>
          </transition>
        </div>
      </Teleport>
    </section>

    <!-- ============================================================
         右：计费规则
         ============================================================ -->
    <section class="ca-panel ca-rule">
      <header class="panel-head">
        <span class="panel-title">
          <i class="title-dot"></i>
          <template v-if="selectedCargo">
            {{ selectedCargo.name }}
            <span class="title-sub">· 计费规则</span>
          </template>
          <template v-else>计费规则</template>
        </span>
        <el-button type="primary" class="btn-primary btn-sm" :disabled="!selectedCargo" @click="openRuleDialog()">
          <el-icon>
            <CirclePlus />
          </el-icon> 新增计费规则
        </el-button>
      </header>

      <div class="panel-search">
        <el-input v-model="ruleKeyword" placeholder="规则名称" clearable class="search-input"
          @keyup.enter="applyRuleSearch" @clear="applyRuleSearch">
          <template #prefix>
            <el-icon>
              <Search />
            </el-icon>
          </template>
        </el-input>
        <el-button type="primary" class="btn-primary btn-sm" @click="applyRuleSearch">
          <el-icon>
            <Search />
          </el-icon> 查询
        </el-button>
        <el-button class="btn-outline btn-sm" @click="resetRuleSearch">
          <el-icon>
            <Refresh />
          </el-icon> 重置
        </el-button>
      </div>

      <div v-if="!selectedCargo" class="pick-empty">
        <svg class="pick-illus" viewBox="0 0 120 104" fill="none">
          <path d="M20 44 60 24l40 20-40 20-40-20Z" fill="#F1F5F9" stroke="#E2E8F0" stroke-width="1.4" />
          <path d="M20 44v28l40 20V64L20 44Z" fill="#E8EEF5" stroke="#E2E8F0" stroke-width="1.4" />
          <path d="M100 44v28l-40 20V64l40-20Z" fill="#DFE7F0" stroke="#E2E8F0" stroke-width="1.4" />
          <path d="M60 24v20" stroke="#FCA5A5" stroke-width="2" stroke-linecap="round" />
          <circle cx="60" cy="20" r="4" fill="#FECACA" />
        </svg>
        <p>请在左侧选择货物</p>
        <span class="empty-tip">选中货物后即可维护它的计费规则</span>
      </div>

      <template v-else>
        <Teleport to="body" :disabled="!ruleFullscreen">
          <div class="table-shell" :class="{ 'is-fullscreen': ruleFullscreen }">
            <TableTools v-model:size="ruleSize" v-model:fullscreen="ruleFullscreen" :columns="ruleColumns"
              :total="filteredRules.length" storage-key="cargo_archive_rule" :refreshing="loadingRules"
              @refresh="fetchRules" @reset="resetRuleColumns" />

            <div class="table-wrap">
              <el-table :data="filteredRules" v-loading="loadingRules" element-loading-text="加载中…"
                element-loading-background="rgba(255,255,255,0.88)" border stripe height="100%" :size="ruleSize"
                class="custom-table">
                <el-table-column v-for="col in ruleVisibleColumns" :key="col.prop" :prop="col.prop" :label="col.label"
                  :width="col.width ? Math.round(col.width * ruleDensity) : undefined"
                  :min-width="col.width ? undefined : Math.round((col.minWidth || 100) * ruleDensity)"
                  :align="col.align || 'center'" :fixed="col.fixed || false" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span v-if="col.prop === 'name'" class="rule-name">{{ row.name || '--' }}</span>
                    <span v-else-if="col.prop === 'price_tax'" class="price-text">
                      {{ formatPrice(row.price_tax) }}<em class="price-unit">{{ priceUnitShort(row.price_unit) }}</em>
                    </span>
                    <span v-else-if="col.prop === 'price_no_tax'" class="price-text muted">
                      {{ formatPrice(row.price_no_tax) }}<em class="price-unit">{{ priceUnitShort(row.price_unit) }}</em>
                    </span>
                    <span v-else-if="col.prop === 'updated_at'" class="time-text">
                      {{ row.updated_at ? dayjs(row.updated_at).format('YYYY-MM-DD HH:mm') : '--' }}
                    </span>
                    <span v-else-if="col.prop === 'price_unit'" class="text-content">
                      {{ priceUnitShort(row.price_unit) }}
                    </span>
                    <span v-else-if="col.prop === 'updated_by'" class="text-content">{{ row.updated_by || '--' }}</span>
                    <div v-else-if="col.prop === 'action'" class="action-cell">
                      <el-button link class="action-btn action-edit" @click="openRuleDialog(row)">编辑</el-button>
                      <el-button link class="action-btn action-danger" @click="removeRule(row)">删除</el-button>
                    </div>
                    <span v-else class="text-content">{{ row[col.prop] || '--' }}</span>
                  </template>
                </el-table-column>

                <template #empty>
                  <div class="empty-state small">
                    <el-icon class="empty-icon">
                      <Money />
                    </el-icon>
                    <p>该货物还没有计费规则</p>
                    <span class="empty-tip">点击右上角「新增计费规则」，建运单时可直接带入单价、按数量算运费</span>
                  </div>
                </template>
              </el-table>
            </div>

            <transition name="fs-fade">
              <button v-if="ruleFullscreen" class="fs-exit-btn" @click="ruleFullscreen = false">
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
         货物新增 / 编辑
         ============================================================ -->
    <el-dialog v-model="cargoDialogVisible" :title="cargoDialogMode === 'add' ? '新增货物' : '编辑货物'" width="560px"
      top="10vh" append-to-body destroy-on-close :close-on-click-modal="false" class="ca-dialog">
      <el-form ref="cargoFormRef" :model="cargoForm" :rules="cargoFormRules" label-width="96px" class="ca-form">
        <el-form-item label="货物名称" prop="name">
          <el-input v-model="cargoForm.name" placeholder="请输入货物名称" clearable maxlength="60" />
        </el-form-item>

        <el-form-item label="单位" prop="unit">
          <UnitSelect v-model="cargoForm.unit" placeholder="请选择计量单位" style="width:100%" />
          <div class="form-hint-line">按重量 / 体积 / 包装件数 / 大件分组，可搜索；建运单时会带到货物行，也能直接输入自定义单位</div>
        </el-form-item>

        <el-form-item label="状态">
          <el-radio-group v-model="cargoForm.status">
            <el-radio :value="1">正常</el-radio>
            <el-radio :value="0">停用</el-radio>
          </el-radio-group>
          <span class="form-hint">停用后，新建运单时不可选该货物</span>
        </el-form-item>

        <el-form-item label="备注">
          <el-input v-model="cargoForm.remark" type="textarea" :rows="2" placeholder="选填" maxlength="200"
            show-word-limit />
        </el-form-item>
      </el-form>

      <template #footer>
        <button class="btn-ghost" @click="cargoDialogVisible = false">取消</button>
        <button class="btn-solid" :disabled="cargoSaving" @click="saveCargo">
          {{ cargoSaving ? '保存中…' : '保存' }}
        </button>
      </template>
    </el-dialog>

    <!-- ============================================================
         计费规则新增 / 编辑
         ============================================================ -->
    <el-dialog v-model="ruleDialogVisible" :title="ruleDialogMode === 'add' ? '新增计费规则' : '编辑计费规则'" width="560px"
      top="10vh" append-to-body destroy-on-close :close-on-click-modal="false" class="ca-dialog">
      <el-form ref="ruleFormRef" :model="ruleForm" :rules="ruleFormRules" label-width="120px" class="ca-form">
        <el-form-item label="规则名称" prop="name">
          <el-input v-model="ruleForm.name" placeholder="如：太原—临汾 标准运价" clearable maxlength="60" />
        </el-form-item>

        <el-form-item label="计价单位">
          <UnitSelect v-model="ruleForm.price_unit" type="price" placeholder="请选择计价单位" :allow-create="false"
            style="width:100%" />
          <div class="form-hint-line">决定运费怎么算：{{ freightFormula(ruleForm.price_unit) }}</div>
        </el-form-item>

        <el-form-item label="含税单价" prop="price_tax">
          <el-input-number v-model="ruleForm.price_tax" :min="0" :precision="2" :step="0.1" controls-position="right"
            style="width:100%" placeholder="0.00" />
          <div class="form-hint-line">单位：{{ priceUnitShort(ruleForm.price_unit) }}；建运单时按「{{ freightFormula(ruleForm.price_unit) }}」自动算运费</div>
        </el-form-item>

        <el-form-item label="未含税单价">
          <el-input-number v-model="ruleForm.price_no_tax" :min="0" :precision="2" :step="0.1" controls-position="right"
            style="width:100%" placeholder="0.00" />
          <div class="form-hint-line">单位：{{ priceUnitShort(ruleForm.price_unit) }}；选填，仅供对账展示</div>
        </el-form-item>

        <el-form-item label="备注">
          <el-input v-model="ruleForm.remark" type="textarea" :rows="2" placeholder="选填" maxlength="200"
            show-word-limit />
        </el-form-item>
      </el-form>

      <template #footer>
        <button class="btn-ghost" @click="ruleDialogVisible = false">取消</button>
        <button class="btn-solid" :disabled="ruleSaving" @click="saveRule">
          {{ ruleSaving ? '保存中…' : '保存' }}
        </button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CirclePlus, Search, Refresh, Close, Box, Money, WarningFilled,
} from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { supabase } from '@/utils/supabase'
import TableTools from '@/components/TableTools.vue'
import UnitSelect from '@/components/UnitSelect.vue'
import {
  DEFAULT_UNIT, DEFAULT_PRICE_UNIT, unitText, unitSymbolDisplay, unitFull, unitGroupLabel, unitMatches,
  priceUnitShort, freightFormula,
} from '@/utils/units'

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
const myName = currentUser.name || currentUser.masterName || currentUser.account || '系统'

// ============================================================
// 列配置
// ============================================================
const DEFAULT_CARGO_COLUMNS = [
  { prop: 'name', label: '货物名称', visible: true, minWidth: 130, align: 'left' },
  { prop: 'unit', label: '单位', visible: true, width: 88, align: 'center' },
  { prop: 'status', label: '状态', visible: true, width: 68, align: 'center' },
  { prop: 'action', label: '操作', visible: true, width: 136, align: 'center', fixed: 'right' },
]

const DEFAULT_RULE_COLUMNS = [
  { prop: 'name', label: '规则名称', visible: true, minWidth: 150, align: 'left' },
  { prop: 'price_tax', label: '含税单价', visible: true, minWidth: 128, align: 'center' },
  { prop: 'price_no_tax', label: '未含税单价', visible: true, minWidth: 132, align: 'center' },
  { prop: 'price_unit', label: '计价单位', visible: true, width: 96, align: 'center' },
  { prop: 'updated_at', label: '更新时间', visible: true, minWidth: 150, align: 'center' },
  { prop: 'updated_by', label: '更新人', visible: true, width: 92, align: 'center' },
  { prop: 'action', label: '操作', visible: true, width: 110, align: 'center', fixed: 'right' },
]

const cargoColumns = ref(JSON.parse(JSON.stringify(DEFAULT_CARGO_COLUMNS)))
const ruleColumns = ref(JSON.parse(JSON.stringify(DEFAULT_RULE_COLUMNS)))

const cargoVisibleColumns = computed(() => cargoColumns.value.filter(c => c.visible))
const ruleVisibleColumns = computed(() => ruleColumns.value.filter(c => c.visible))

const cargoSize = ref('default')
const ruleSize = ref('default')
const cargoDensity = computed(() => cargoSize.value === 'large' ? 1.12 : cargoSize.value === 'small' ? 0.88 : 1)
const ruleDensity = computed(() => ruleSize.value === 'large' ? 1.12 : ruleSize.value === 'small' ? 0.88 : 1)

const resetCargoColumns = () => {
  cargoColumns.value = JSON.parse(JSON.stringify(DEFAULT_CARGO_COLUMNS))
  ElMessage.success('已重置列设置')
}
const resetRuleColumns = () => {
  ruleColumns.value = JSON.parse(JSON.stringify(DEFAULT_RULE_COLUMNS))
  ElMessage.success('已重置列设置')
}

// ============================================================
// 数据
// ============================================================
const cargos = ref([])
const rules = ref([])
const loadingCargos = ref(false)
const loadingRules = ref(false)
const dbHint = ref(null)

const selectedId = ref('')
const selectedCargo = computed(() => cargos.value.find(c => c.id === selectedId.value) || null)

const cargoKeyword = ref('')
const appliedCargoKeyword = ref('')
const statusTab = ref(1)

const ruleKeyword = ref('')
const appliedRuleKeyword = ref('')

const cargoFullscreen = ref(false)
const ruleFullscreen = ref(false)

const normalize = (v) => String(v || '').trim().toLowerCase()
const formatPrice = (v) => (v === null || v === undefined || v === '' ? '--' : Number(v).toFixed(2))

const filteredCargos = computed(() => {
  const kw = normalize(appliedCargoKeyword.value)
  return cargos.value.filter(row => {
    if (Number(row.status ?? 1) !== Number(statusTab.value)) return false
    if (!kw) return true
    if (normalize(row.name).includes(kw)) return true
    return unitMatches(row.unit, kw)
  })
})

const normalCount = computed(() => cargos.value.filter(r => Number(r.status ?? 1) === 1).length)
const disabledCount = computed(() => cargos.value.filter(r => Number(r.status ?? 1) === 0).length)

const filteredRules = computed(() => {
  const kw = normalize(appliedRuleKeyword.value)
  if (!kw) return rules.value
  return rules.value.filter(r => normalize(r.name).includes(kw))
})

const applyCargoSearch = () => {
  appliedCargoKeyword.value = cargoKeyword.value
  if (filteredCargos.value.length && !filteredCargos.value.some(c => c.id === selectedId.value)) {
    selectedId.value = filteredCargos.value[0].id
    fetchRules()
  }
}

const applyRuleSearch = () => { appliedRuleKeyword.value = ruleKeyword.value }
const resetRuleSearch = () => {
  ruleKeyword.value = ''
  applyRuleSearch()
}

const cargoRowClass = ({ row }) => (row.id === selectedId.value ? 'is-selected-row' : '')

const selectCargo = (row) => {
  if (!row || row.id === selectedId.value) return
  selectedId.value = row.id
  fetchRules()
}

// ============================================================
// 读取
// ============================================================
const PERM_DENIED = /permission denied|not authorized|权限/i

const friendlyError = (e, fallback = '操作失败') => {
  const msg = String(e?.message || e || '')
  if (PERM_DENIED.test(msg)) return '数据库没有读写权限，请执行 sql/2026-10-18_cargo_archive.sql'
  if (/invalid input syntax for type uuid/i.test(msg)) {
    return '数据库字段类型不匹配，请执行 sql/2026-10-18_cargo_archive.sql'
  }
  return `${fallback}：${msg}`
}

const handleTableError = (e) => {
  const msg = String(e?.message || e || '')
  if (PERM_DENIED.test(msg) || /relation|does not exist|不存在|undefined table|42P01|fetch/i.test(msg)) {
    dbHint.value = {
      title: '货物档案表读取失败（多半是还没建表 / 没授权）',
      file: 'sql/2026-10-18_cargo_archive.sql',
    }
    return
  }
  ElMessage.error('加载失败：' + msg)
}

const fetchCargos = async (retry = 0) => {
  loadingCargos.value = true
  try {
    let q = supabase
      .from('cargo_archives')
      .select('id, name, unit, status, remark, created_at, updated_at')
      .order('created_at', { ascending: false })
    if (isCustomer) q = q.eq('owner_account', myAccount)
    const { data, error } = await q
    if (error) throw error
    dbHint.value = null
    cargos.value = data || []

    if (selectedId.value && !cargos.value.some(c => c.id === selectedId.value)) {
      selectedId.value = ''
    }
    if (!selectedId.value) {
      const first = filteredCargos.value[0] || cargos.value[0]
      if (first) {
        selectedId.value = first.id
        await fetchRules()
        return
      }
    }
    await fetchRules()
  } catch (e) {
    /* 首次进页面时匿名登录态可能还没就绪（FetchError），等一下重试一次 */
    if (retry < 1 && /fetch/i.test(String(e?.message || e))) {
      await new Promise(r => setTimeout(r, 900))
      loadingCargos.value = false
      return fetchCargos(retry + 1)
    }
    handleTableError(e)
  } finally {
    loadingCargos.value = false
  }
}

const fetchRules = async () => {
  if (!selectedId.value) { rules.value = []; return }
  loadingRules.value = true
  try {
    const { data, error } = await supabase
      .from('cargo_rules')
      .select('*')
      .eq('cargo_id', selectedId.value)
      .order('updated_at', { ascending: false })
    if (error) throw error
    rules.value = data || []
  } catch (e) {
    handleTableError(e)
  } finally {
    loadingRules.value = false
  }
}

// ============================================================
// 货物新增 / 编辑
// ============================================================
const cargoDialogVisible = ref(false)
const cargoDialogMode = ref('add')
const cargoSaving = ref(false)
const cargoFormRef = ref(null)

const emptyCargoForm = () => ({ id: '', name: '', unit: DEFAULT_UNIT, status: 1, remark: '' })
const cargoForm = reactive(emptyCargoForm())

const cargoFormRules = {
  name: [
    { required: true, message: '请输入货物名称', trigger: 'blur' },
    { min: 1, max: 60, message: '货物名称 1~60 个字符', trigger: 'blur' },
  ],
  unit: [{ required: true, message: '请选择或输入单位', trigger: 'change' }],
}

const openCargoDialog = (row) => {
  Object.assign(cargoForm, emptyCargoForm())
  cargoDialogMode.value = row ? 'edit' : 'add'
  if (row) {
    cargoForm.id = row.id
    cargoForm.name = row.name || ''
    cargoForm.unit = row.unit || ''
    cargoForm.status = Number(row.status ?? 1)
    cargoForm.remark = row.remark || ''
  }
  cargoDialogVisible.value = true
}

const saveCargo = async () => {
  if (!cargoFormRef.value) return
  try {
    await cargoFormRef.value.validate()
  } catch { return }

  const dup = cargos.value.find(c => normalize(c.name) === normalize(cargoForm.name) && c.id !== cargoForm.id)
  if (dup) ElMessage.warning(`已存在同名货物「${dup.name}」，请确认是否重复`)

  cargoSaving.value = true
  try {
    const payload = {
      name: cargoForm.name.trim(),
      unit: cargoForm.unit || null,
      status: cargoForm.status,
      remark: cargoForm.remark?.trim() || null,
      updated_at: new Date().toISOString(),
    }

    if (cargoDialogMode.value === 'add') {
      payload.owner_account = isAdmin ? null : myAccount
      payload.customer_id = myCustomerId != null ? String(myCustomerId) : null
      payload.created_at = new Date().toISOString()
      const { error } = await supabase.from('cargo_archives').insert(payload)
      if (error) throw error
      ElMessage.success('货物创建成功')
      cargoDialogVisible.value = false
      await fetchCargos()
      const created = cargos.value.find(c => normalize(c.name) === normalize(payload.name))
      if (created) {
        selectedId.value = created.id
        await fetchRules()
      }
      return
    }

    const { error } = await supabase.from('cargo_archives').update(payload).eq('id', cargoForm.id)
    if (error) throw error
    ElMessage.success('货物已更新')
    cargoDialogVisible.value = false
    await fetchCargos()
  } catch (e) {
    ElMessage.error(friendlyError(e, '保存失败'))
  } finally {
    cargoSaving.value = false
  }
}

const toggleCargoStatus = async (row) => {
  const next = Number(row.status ?? 1) === 1 ? 0 : 1
  const actionText = next === 1 ? '启用' : '停用'
  try {
    await ElMessageBox.confirm(
      next === 1 ? `确定启用货物「${row.name}」吗？` : `停用后，新建运单时不可选「${row.name}」，确定停用吗？`,
      `${actionText}确认`,
      { confirmButtonText: `确定${actionText}`, cancelButtonText: '取消', type: next === 1 ? 'success' : 'warning' }
    )
    const { error } = await supabase
      .from('cargo_archives')
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (error) throw error
    ElMessage.success(`已${actionText}「${row.name}」`)
    await fetchCargos()
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(friendlyError(e, `${actionText}失败`))
  }
}

const removeCargo = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定删除货物「${row.name}」吗？它下面的计费规则会一并删除，且不可恢复。`,
      '删除确认',
      { confirmButtonText: '确定删除', cancelButtonText: '取消', type: 'warning' }
    )
  } catch { return }

  try {
    await supabase.from('cargo_rules').delete().eq('cargo_id', row.id)
    const { error } = await supabase.from('cargo_archives').delete().eq('id', row.id)
    if (error) throw error
    ElMessage.success('已删除')
    if (selectedId.value === row.id) selectedId.value = ''
    await fetchCargos()
  } catch (e) {
    ElMessage.error(friendlyError(e, '删除失败'))
  }
}

// ============================================================
// 计费规则新增 / 编辑
// ============================================================
const ruleDialogVisible = ref(false)
const ruleDialogMode = ref('add')
const ruleSaving = ref(false)
const ruleFormRef = ref(null)

const emptyRuleForm = () => ({ id: '', name: '', price_unit: DEFAULT_PRICE_UNIT, price_tax: null, price_no_tax: null, remark: '' })
const ruleForm = reactive(emptyRuleForm())

const ruleFormRules = {
  name: [{ required: true, message: '请输入规则名称', trigger: 'blur' }],
  price_tax: [{ required: true, message: '请输入含税单价', trigger: 'blur' }],
}

const openRuleDialog = (row) => {
  if (!selectedCargo.value) {
    ElMessage.warning('请先在左侧选择货物')
    return
  }
  Object.assign(ruleForm, emptyRuleForm())
  ruleDialogMode.value = row ? 'edit' : 'add'
  if (row) {
    ruleForm.id = row.id
    ruleForm.name = row.name || ''
    ruleForm.price_unit = row.price_unit || DEFAULT_PRICE_UNIT
    ruleForm.price_tax = row.price_tax === null ? null : Number(row.price_tax)
    ruleForm.price_no_tax = row.price_no_tax === null ? null : Number(row.price_no_tax)
    ruleForm.remark = row.remark || ''
  }
  ruleDialogVisible.value = true
}

const saveRule = async () => {
  if (!ruleFormRef.value || !selectedCargo.value) return
  try {
    await ruleFormRef.value.validate()
  } catch { return }

  ruleSaving.value = true
  try {
    const payload = {
      cargo_id: selectedCargo.value.id,
      owner_account: isAdmin ? null : myAccount,
      customer_id: myCustomerId != null ? String(myCustomerId) : null,
      name: ruleForm.name.trim(),
      price_unit: ruleForm.price_unit || DEFAULT_PRICE_UNIT,
      price_tax: ruleForm.price_tax === null || ruleForm.price_tax === '' ? null : Number(ruleForm.price_tax),
      price_no_tax: ruleForm.price_no_tax === null || ruleForm.price_no_tax === '' ? null : Number(ruleForm.price_no_tax),
      updated_by: myName,
      remark: ruleForm.remark?.trim() || null,
      updated_at: new Date().toISOString(),
    }

    if (ruleDialogMode.value === 'add') {
      payload.created_at = new Date().toISOString()
      const { error } = await supabase.from('cargo_rules').insert(payload)
      if (error) throw error
      ElMessage.success('计费规则已添加')
    } else {
      const { error } = await supabase.from('cargo_rules').update(payload).eq('id', ruleForm.id)
      if (error) throw error
      ElMessage.success('计费规则已更新')
    }
    ruleDialogVisible.value = false
    await fetchRules()
  } catch (e) {
    ElMessage.error(friendlyError(e, '保存失败'))
  } finally {
    ruleSaving.value = false
  }
}

const removeRule = async (row) => {
  try {
    await ElMessageBox.confirm(`确定删除计费规则「${row.name}」吗？`, '删除确认', {
      confirmButtonText: '确定删除', cancelButtonText: '取消', type: 'warning',
    })
  } catch { return }
  try {
    const { error } = await supabase.from('cargo_rules').delete().eq('id', row.id)
    if (error) throw error
    ElMessage.success('已删除')
    await fetchRules()
  } catch (e) {
    ElMessage.error(friendlyError(e, '删除失败'))
  }
}

// ============================================================
// 生命周期
// ============================================================
watch(statusTab, () => {
  if (!filteredCargos.value.some(c => c.id === selectedId.value)) {
    selectedId.value = filteredCargos.value[0]?.id || ''
    fetchRules()
  }
})

onMounted(async () => {
  await fetchCargos()
})

defineExpose({ fetchCargos })
</script>

<style scoped>
/* ============================================================
   页面骨架（与客户档案保持一致）
   ============================================================ */
.cargo-archive-page {
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

.ca-cargo {
  flex: 0 0 clamp(400px, 34%, 520px);
}

.ca-rule {
  flex: 1;
}

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
  background: linear-gradient(180deg, #c8102e, #a00d24);
  flex: 0 0 auto;
}

.title-sub {
  font-size: 12.5px;
  font-weight: 400;
  color: #94A3B8;
}

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
  background: #FEF2F2 !important;
  box-shadow: 0 0 0 1px #FCA5A5 inset !important;
}

.panel-search :deep(.el-input__wrapper.is-focus),
.panel-search :deep(.el-select__wrapper.is-focused) {
  background: #fff !important;
  box-shadow: 0 0 0 2px rgba(200, 16, 46, 0.15), 0 0 0 1px #c8102e inset !important;
}

.btn-primary {
  background: linear-gradient(135deg, #c8102e, #a00d24) !important;
  border: none !important;
  color: #fff !important;
  font-weight: 600;
  border-radius: 6px !important;
  box-shadow: 0 3px 10px rgba(200, 16, 46, 0.22);
  transition: all .25s;
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 5px 14px rgba(200, 16, 46, 0.35);
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
  border-color: #c8102e !important;
  color: #c8102e !important;
  background: #FEF2F2 !important;
}

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
  color: #c8102e;
  background: #FEF2F2;
}

.status-tab.active {
  background: #FEF2F2;
  color: #c8102e;
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
  box-shadow: 0 20px 60px rgba(200, 16, 46, 0.12);
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
  background: #FEF2F2 !important;
}

:deep(.custom-table .is-selected-row td) {
  background: #FEF2F2 !important;
}

:deep(.custom-table .is-selected-row td:first-child) {
  box-shadow: inset 3px 0 0 #c8102e;
}

.cargo-name,
.rule-name {
  color: #0F172A;
  font-weight: 600;
}

.text-content {
  color: #334155;
}

.time-text {
  color: #475569;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.price-text {
  color: #0F172A;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: .2px;
}

.price-text.muted {
  color: #64748B;
  font-weight: 600;
}

.price-unit {
  margin-left: 3px;
  font-style: normal;
  font-size: 11px;
  font-weight: 400;
  color: #94A3B8;
}

.unit-cell {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
}

.unit-sym {
  font-style: normal;
  font-size: 11px;
  color: #94A3B8;
}

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
  color: #c8102e;
}

.action-edit:hover {
  color: #7F1D1D;
  background: #FEF2F2;
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
  background: #FEF2F2;
}

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
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #fff;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 8px 22px rgba(200, 16, 46, .35);
  transition: all .25s;
  font-family: inherit;
}

.fs-exit-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(200, 16, 46, .45);
}

.fs-fade-enter-active,
.fs-fade-leave-active {
  transition: opacity .2s;
}

.fs-fade-enter-from,
.fs-fade-leave-to {
  opacity: 0;
}

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

.form-hint {
  margin-left: 10px;
  font-size: 12px;
  color: #94A3B8;
}

.form-hint-line {
  margin-top: 2px;
  font-size: 11.5px;
  color: #94A3B8;
  line-height: 1.5;
}

.ca-form :deep(.el-form-item__label) {
  font-size: 13px;
  color: #334155;
  font-weight: 600;
}

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
  border-color: #c8102e;
  color: #c8102e;
}

.btn-solid {
  border: none;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #fff;
  box-shadow: 0 4px 12px rgba(200, 16, 46, .28);
}

.btn-solid:hover {
  transform: translateY(-1px);
  box-shadow: 0 7px 18px rgba(200, 16, 46, .38);
}

.btn-solid:disabled {
  opacity: .6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

@media (max-width: 1320px) {
  .ca-cargo {
    flex: 0 0 400px;
  }
}
</style>

<!-- 弹窗挂到 body，样式必须全局 -->
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
</style>
