<template>
  <div class="ele-fence-page">
    <!-- 搜索卡片 -->
    <div class="search-card fade-up">
      <!-- ⭐ 第一行：围栏类型 Tab（带数量）+ 操作按钮 -->
      <div class="search-row type-row">
        <div class="type-tabs">
          <!-- 滑动指示器：位置由 JS 实测，切换时平滑过渡 -->
          <span class="tab-indicator" :style="indicatorStyle"></span>
          <div v-for="(t, i) in typeTabs" :key="t.key" :ref="el => setTabRef(el, i)" class="type-tab"
            :class="[t.key, { on: searchForm.type === t.key }]" @click="handleTypeTab(t.key)">
            <span class="t-sq"></span>
            <span class="t-label">{{ t.label }}</span>
            <span class="t-count">{{ typeCounts[t.key] || 0 }}</span>
          </div>
        </div>

        <div class="search-btns">
          <el-button type="primary" size="default" class="btn-primary" @click="handleSearch">
            <el-icon>
              <Search />
            </el-icon> 搜索
          </el-button>
          <el-button size="default" class="btn-outline" @click="handleReset">
            <el-icon>
              <Refresh />
            </el-icon> 重置
          </el-button>
          <el-button type="primary" size="default" class="btn-primary" @click="handleAdd">
            <el-icon>
              <Plus />
            </el-icon> 新增
          </el-button>
          <el-button type="danger" size="default" plain class="btn-danger-outline" @click="handleExport">
            <el-icon>
              <Download />
            </el-icon> 导出
          </el-button>
        </div>
      </div>

      <!-- 第二行：其他筛选条件 -->
      <div class="search-row sub-row">
        <el-select v-model="searchForm.org" placeholder="请选择所属机构" size="default" class="search-select"
          clearable filterable>
          <el-option v-for="o in orgOptions" :key="o" :label="o" :value="o" />
          <template #empty>
            <div style="padding: 14px; text-align: center; color: #94A3B8; font-size: 12.5px;">
              暂无机构
            </div>
          </template>
        </el-select>
        <el-select v-model="searchForm.shape" placeholder="请选择围栏形状" size="default" class="search-select" clearable>
          <el-option label="圆形" value="circle" />
          <el-option label="多边形" value="polygon" />
          <el-option label="线形" value="polyline" />
          <el-option label="行政区划" value="district" />
        </el-select>
        <el-input v-model="searchForm.name" placeholder="请输入围栏名称" size="default" class="search-input" clearable
          @keyup.enter="handleSearch" />
      </div>
    </div>

    <!-- 表格卡片 -->
    <div class="table-card fade-up" style="animation-delay: 0.1s">
      <div class="table-wrap">
        <el-table :data="tableData" border stripe style="width: 100%;" size="default" v-loading="loading"
          class="custom-table" height="100%"
          :header-cell-style="{ background: '#F1F5F9', color: '#0F172A', fontWeight: '700', fontSize: '13px' }">
          <el-table-column prop="name" label="围栏名称" min-width="200" align="left" show-overflow-tooltip>
            <template #default="{ row }">
              <div class="name-cell">
                <div class="name-wrap" :class="'t-' + (row.fence_type || 'alert')">
                  <span class="name-bar"></span>
                  <span class="type-tag" :class="row.fence_type || 'alert'">{{
                    typeShortText(row.fence_type)
                  }}</span>
                  <span class="name-text">{{ row.name }}</span>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="org" label="所属机构" min-width="140" align="center" show-overflow-tooltip />
          <el-table-column prop="attr" label="围栏属性" min-width="110" align="center" show-overflow-tooltip />
          <el-table-column label="围栏形状" min-width="100" align="center">
            <template #default="{ row }">
              <span class="shape-tag" :class="row.shape">{{ shapeText(row.shape) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="围栏参数" min-width="120" align="center">
            <template #default="{ row }">
              <span v-if="row.shape === 'circle'" class="param-text">{{ row.radius }} 米</span>
              <span v-else-if="row.shape === 'polyline'" class="param-text">偏移 {{ row.bufferradius }} 米</span>
              <span v-else-if="row.shape === 'district'" class="param-text">区划 {{ row.adcode }}</span>
              <span v-else class="param-text">顶点 {{ countPoints(row.points) }} 个</span>
            </template>
          </el-table-column>
          <el-table-column prop="location" label="地址信息" min-width="220" show-overflow-tooltip align="center" />
          <el-table-column label="更新时间" min-width="160" align="center">
            <template #default="{ row }">
              <span class="time-text">{{ formatDateTime(row.updated_at) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" align="center" fixed="right">
            <template #default="{ row }">
              <el-button type="text" size="small" class="action-btn edit" @click="handleEdit(row)">编辑</el-button>
              <el-button type="text" size="small" class="action-btn delete" @click="handleDelete(row)">删除</el-button>
            </template>
          </el-table-column>

          <template #empty>
            <div class="empty-state">
              <el-icon class="empty-icon">
                <MapLocation />
              </el-icon>
              <p>暂无电子围栏数据</p>
              <span class="empty-sub">点击右上角"新增"创建你的第一个围栏吧</span>
            </div>
          </template>
        </el-table>
      </div>
      <div class="pagination-wrapper">
        <span class="total-text">共 {{ total }} 条</span>
        <el-pagination background layout="sizes, prev, pager, next, jumper" :total="total" :page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]" v-model:current-page="currentPage" @size-change="handleSizeChange"
          @current-change="handleCurrentChange" class="custom-pagination" />
      </div>
    </div>

    <AddEleFenceDialog v-model="showFenceDialog" :edit-data="editingRow" @success="handleDialogSuccess" />

    <!-- 删除中动画遮罩 -->
    <transition name="delete-fade">
      <div v-if="deleting" class="delete-loading-overlay">
        <div class="delete-loading-content">
          <div class="delete-ring">
            <svg viewBox="0 0 100 100" width="110" height="110">
              <circle cx="50" cy="50" r="42" class="del-ring-track" />
              <circle cx="50" cy="50" r="42" class="del-ring-progress" :style="{ strokeDashoffset: delRingOffset }" />
            </svg>
            <div class="del-trash">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#D32F2F" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </div>
          </div>
          <div class="delete-text">
            正在删除围栏「<span class="delete-name">{{ deletingName }}</span>」...
          </div>
          <div class="delete-bar">
            <div class="delete-bar-inner" :style="{ width: deleteProgress + '%' }"></div>
          </div>
          <div class="delete-tip">请稍候，正在同步高德服务器</div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, nextTick, watch, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Download, Plus, MapLocation } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { supabase } from '@/utils/supabase'
import AddEleFenceDialog from '@/components/AddEleFenceDialog.vue'

// HTTP 网关地址
const API_BASE = 'https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com'

// ============================================================
// 当前登录用户
// ============================================================
const currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('currentUser') || '{}') }
  catch { return {} }
})()
const isAdmin = currentUser.role === 'admin'
const isCustomer = !isAdmin
const isSubAccount = !!currentUser.isSubAccount
const myAccount = currentUser.masterAccount || currentUser.account || ''

// ⭐ 子账号机构信息
const myOrgName = ref(isSubAccount ? String(currentUser.orgName || '').trim() || null : null)
const myOrgLevel = ref(isSubAccount ? (Number(currentUser.orgLevel) || 1) : null)

// 一级机构子账号 → 等同主账号
const isRootOrgSubAccount = computed(() =>
  isSubAccount && Number(myOrgLevel.value) === 1
)
// 二级及以下 → 按 org 隔离
const needOrgFilter = computed(() =>
  isCustomer && isSubAccount && Number(myOrgLevel.value) >= 2
)

// ⭐ 兜底反查
const loadMyOrgInfo = async () => {
  if (!isCustomer || !isSubAccount) return
  if (myOrgName.value && myOrgLevel.value) return
  if (!currentUser.orgId) return
  try {
    const { data } = await supabase
      .from('organizations')
      .select('name, level')
      .eq('id', currentUser.orgId)
      .maybeSingle()
    if (data) {
      if (data.name) myOrgName.value = String(data.name).trim()
      myOrgLevel.value = Number(data.level) || 1
    }
  } catch (e) { }
}

/* ============================================================
   ⭐ 所属机构下拉：读真实机构，不再用硬编码的假选项
   选项 = organizations 表里的机构 ∪ 围栏数据里实际出现过的 org
   （合并是为了防止某些围栏的 org 在机构表里已被删/改名，导致筛不到）
   ============================================================ */
const orgNamesFromDb = ref([])

const loadOrgOptions = async () => {
  try {
    let q = supabase
      .from('organizations')
      .select('id, name, level')
      .order('level', { ascending: true })
      .order('id', { ascending: true })
    if (isCustomer) q = q.eq('owner_account', myAccount)
    // 二级机构子账号：只有本机构可选
    if (needOrgFilter.value && myOrgName.value) q = q.eq('name', myOrgName.value)

    const { data, error } = await q
    if (error) throw error
    orgNamesFromDb.value = (data || [])
      .map(o => String(o.name || '').trim())
      .filter(Boolean)
  } catch (e) {
    console.warn('[围栏设置] 加载机构列表失败：', e)
    orgNamesFromDb.value = []
  }
}

const orgOptions = computed(() => {
  const set = new Set(orgNamesFromDb.value)
  fullList.value.forEach(r => {
    const v = String(r.org || '').trim()
    if (v) set.add(v)
  })
  return [...set]
})

const formatDateTime = (dateStr) => {
  if (!dateStr) return '--'
  return dayjs(dateStr).format('YYYY-MM-DD HH:mm:ss')
}

const shapeText = (shape) => {
  const map = { circle: '圆形', polygon: '多边形', polyline: '线形', district: '行政区划' }
  return map[shape] || shape
}

/* ============================================================
   ⭐ 围栏类型（pickup 装货 / delivery 卸货 / alert 提醒）
   值存英文 key，中文只用于展示；
   历史数据没有类型时统一按 alert（提醒围栏）兜底。
   ============================================================ */
const FENCE_TYPES = [
  { key: 'pickup', label: '装货围栏', short: '装货', color: '#2563EB' },
  { key: 'delivery', label: '卸货围栏', short: '卸货', color: '#0E9F6E' },
  { key: 'alert', label: '提醒围栏', short: '提醒', color: '#D97706' },
]
const typeTabs = [{ key: 'all', label: '全部' }, ...FENCE_TYPES]

const typeShortText = (type) => {
  const hit = FENCE_TYPES.find(t => t.key === (type || 'alert'))
  return hit ? hit.short : '提醒'
}

const countPoints = (points) => {
  if (!points) return 0
  return points.split(';').filter(Boolean).length
}

const showFenceDialog = ref(false)
const editingRow = ref(null)
const loading = ref(false)
const tableData = ref([])
const total = ref(0)
const pageSize = ref(10)
const currentPage = ref(1)

const fullList = ref([])

const searchForm = reactive({ type: 'all', org: '', shape: '', name: '' })

const deleting = ref(false)
const deletingName = ref('')
const deleteProgress = ref(0)
let deleteTimer = null

const DEL_RING_LENGTH = 263.89
const delRingOffset = computed(() => DEL_RING_LENGTH * (1 - deleteProgress.value / 100))

const startDeleteAnimation = (name) => {
  deleting.value = true
  deletingName.value = name
  deleteProgress.value = 0
  deleteTimer = setInterval(() => {
    if (deleteProgress.value < 80) {
      deleteProgress.value = Math.min(80, deleteProgress.value + Math.random() * 8 + 3)
    }
  }, 200)
}

const finishDeleteAnimation = () => {
  if (deleteTimer) { clearInterval(deleteTimer); deleteTimer = null }
  deleteProgress.value = 100
}

const resetDeleteAnimation = () => {
  if (deleteTimer) { clearInterval(deleteTimer); deleteTimer = null }
  deleting.value = false
  deletingName.value = ''
  deleteProgress.value = 0
}

// ============================================
// ⭐ 数据源：从数据库查
// ============================================
const fetchData = async () => {
  loading.value = true
  try {
    let q = supabase
      .from('ele_fences')
      .select('*')
      .order('updated_at', { ascending: false })

    if (isCustomer) {
      q = q.eq('owner_account', myAccount)
      // ⭐⭐⭐ 二级机构子账号：只看本机构 + 主账号/一级机构创建的（org 为 NULL）
      if (needOrgFilter.value && myOrgName.value) {
        q = q.eq('org', myOrgName.value)
      }
    }

    const { data, error } = await q
    if (error) throw error

    fullList.value = (data || []).map(row => ({
      id: row.id,
      gfid: row.gfid,
      name: row.name,
      desc: row.desc,
      shape: row.shape,
      // ⭐ 列不存在（迁移未执行）时按提醒围栏兜底，不让整页崩
      fence_type: row.fence_type || 'alert',
      org: row.org,
      attr: row.attr || row.desc || '',
      radius: row.radius,
      bufferradius: row.bufferradius,
      center: row.center,
      points: row.points,
      adcode: row.adcode,
      location: row.location || '',
      owner_account: row.owner_account,
      updated_at: row.updated_at,
    }))

    console.log('[围栏设置] 从数据库加载', fullList.value.length, '条')
    applyLocalFilter()
  } catch (err) {
    console.error('加载围栏数据失败：', err)
    ElMessage.error('加载围栏数据失败：' + err.message)
  } finally {
    loading.value = false
  }
}

/* 除「类型」以外的筛选条件（Tab 计数要基于这个集合，否则选中装货后其他 Tab 就变 0 了） */
const baseFiltered = () => {
  let list = fullList.value
  if (searchForm.org) list = list.filter(r => r.org === searchForm.org)
  if (searchForm.shape) list = list.filter(r => r.shape === searchForm.shape)
  if (searchForm.name) {
    const kw = searchForm.name.toLowerCase()
    list = list.filter(r => (r.name || '').toLowerCase().includes(kw))
  }
  return list
}

/* Tab 上的数量：跟着其他筛选条件联动，选中项不参与自身过滤 */
const typeCounts = computed(() => {
  const base = baseFiltered()
  const counts = { all: base.length, pickup: 0, delivery: 0, alert: 0 }
  base.forEach(r => {
    const k = r.fence_type || 'alert'
    if (counts[k] !== undefined) counts[k]++
  })
  return counts
})

// 本地搜索 + 分页
const applyLocalFilter = () => {
  let filtered = baseFiltered()
  if (searchForm.type && searchForm.type !== 'all') {
    filtered = filtered.filter(r => (r.fence_type || 'alert') === searchForm.type)
  }
  total.value = filtered.length
  const from = (currentPage.value - 1) * pageSize.value
  const to = from + pageSize.value
  tableData.value = filtered.slice(from, to)
}

const handleTypeTab = (key) => {
  searchForm.type = key
  currentPage.value = 1
  applyLocalFilter()
}

/* ============================================================
   Tab 滑动指示器：位置按实际元素测量（各 Tab 文案宽度不同，不能用百分比）
   ============================================================ */
const tabEls = []
const setTabRef = (el, i) => { if (el) tabEls[i] = el }

const indicator = reactive({ left: 0, top: 0, width: 0, height: 0 })

const indicatorStyle = computed(() => ({
  left: indicator.left + 'px',
  top: indicator.top + 'px',
  width: indicator.width + 'px',
  height: indicator.height + 'px',
  opacity: indicator.width ? 1 : 0,
}))

const updateIndicator = () => {
  const i = typeTabs.findIndex(t => t.key === searchForm.type)
  const el = tabEls[i]
  if (!el) return
  indicator.left = el.offsetLeft
  indicator.top = el.offsetTop
  indicator.width = el.offsetWidth
  indicator.height = el.offsetHeight
}

// 切换 / 数量变化（宽度会变）都要重测
watch(() => searchForm.type, () => nextTick(updateIndicator))
watch(typeCounts, () => nextTick(updateIndicator))

const handleSearch = async () => {
  currentPage.value = 1
  await fetchData()
  applyLocalFilter()
}

const handleReset = () => {
  searchForm.type = 'all'
  searchForm.org = ''
  searchForm.shape = ''
  searchForm.name = ''
  currentPage.value = 1
  applyLocalFilter()
}

const handleAdd = () => {
  editingRow.value = null
  showFenceDialog.value = true
}

const handleEdit = (row) => {
  editingRow.value = { ...row }
  showFenceDialog.value = true
}

const handleDialogSuccess = () => { fetchData() }

const handleExport = () => { ElMessage.info('正在导出数据...') }

const handleDelete = (row) => {
  ElMessageBox.confirm(
    `是否继续删除围栏「${row.name}」`,
    '删除确认',
    {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'btn-danger-confirm',
      customClass: 'delete-confirm-box',
    }
  ).then(async () => {
    startDeleteAnimation(row.name)
    try {
      const response = await fetch(`${API_BASE}/amap-geofence-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gfids: row.gfid }),
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const data = await response.json()

      const isSuccess = data.errcode === 0 || data.errcode === 10000 || data.errcode === 20003
      if (!isSuccess) {
        finishDeleteAnimation()
        setTimeout(() => {
          resetDeleteAnimation()
          ElMessage.error('高德删除失败：errcode=' + data.errcode + '，errmsg=' + (data.errmsg || '未知'))
        }, 400)
        return
      }

      // ⭐ 删数据库时也加隔离（防越权）
      if (row.id) {
        let dq = supabase.from('ele_fences').delete().eq('id', row.id)
        if (isCustomer && myAccount) dq = dq.eq('owner_account', myAccount)
        if (needOrgFilter.value && myOrgName.value) {
          dq = dq.eq('org', myOrgName.value)
        }
        const { error: dbError } = await dq
        if (dbError) {
          console.warn('清理数据库记录失败：', dbError)
          ElMessage.warning('信息暂时没有同步成功哈～～')
        }
      }

      finishDeleteAnimation()
      setTimeout(() => {
        resetDeleteAnimation()
        ElMessage.success('删除成功')
        fetchData()
      }, 400)
    } catch (err) {
      finishDeleteAnimation()
      setTimeout(() => {
        resetDeleteAnimation()
        ElMessage.error('删除失败：' + (err.message || err.errMsg || '未知错误'))
      }, 400)
    }
  }).catch(() => { })
}

const handleSizeChange = (val) => {
  pageSize.value = val
  currentPage.value = 1
  applyLocalFilter()
}
const handleCurrentChange = (val) => {
  currentPage.value = val
  applyLocalFilter()
}

onMounted(async () => {
  if (isCustomer && isSubAccount) await loadMyOrgInfo()
  loadOrgOptions()
  fetchData()
  nextTick(updateIndicator)
  window.addEventListener('resize', updateIndicator)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateIndicator)
})
</script>

<style scoped>
.ele-fence-page {
  padding: 6px 16px 16px;
  background-color: #f8fafc;
  height: calc(100vh - 101px);
  max-height: calc(100vh - 101px);
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 14px;
  color: #1E293B;
}

.search-card,
.table-card {
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  padding: 16px;
  transition: box-shadow 0.3s ease;
}

/* 搜索卡片固定高度，不参与伸缩 */
.search-card {
  flex-shrink: 0;
}

/* 表格卡片占满剩余高度，内部滚动 */
.table-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 表格区域撑满卡片剩余空间，表体内部滚动（表头固定） */
.table-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.search-card:hover,
.table-card:hover {
  box-shadow: 0 6px 24px rgba(var(--brand-rgb), 0.06);
}

.search-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.sub-row {
  margin-top: 12px;
}

/* ============================================================
   ⭐ 围栏类型 Tab（带数量）+ 滑动指示器
   ============================================================ */
.type-tabs {
  position: relative;
  display: inline-flex;
  gap: 4px;
  background: #F1F5F9;
  padding: 3px;
  border-radius: 9px;
}

/* 白色滑块：位置/宽度由 JS 实测，切换时平滑滑动 */
.tab-indicator {
  position: absolute;
  border-radius: 7px;
  background: #FFFFFF;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
  pointer-events: none;
  z-index: 0;
  transition:
    left 0.3s cubic-bezier(0.34, 1.2, 0.64, 1),
    width 0.3s cubic-bezier(0.34, 1.2, 0.64, 1),
    top 0.2s ease,
    height 0.2s ease,
    opacity 0.2s ease;
}

.type-tab {
  position: relative;
  z-index: 1;
  height: 28px;
  padding: 0 10px;
  border-radius: 7px;
  font-size: 12.5px;
  font-weight: 700;
  color: #64748B;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  transition: color 0.22s ease;
  user-select: none;
}

.type-tab:hover {
  color: #0F172A;
}

.type-tab:active {
  transform: scale(0.97);
}

.type-tab .t-sq {
  width: 7px;
  height: 7px;
  border-radius: 2px;
  background: #94A3B8;
  flex: 0 0 auto;
  transition: transform 0.22s ease;
}

.type-tab.on .t-sq {
  transform: scale(1.15);
}

.type-tab .t-count {
  font-family: var(--num-font, -apple-system, sans-serif);
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  font-weight: 800;
  min-width: 18px;
  padding: 1px 5px;
  border-radius: 20px;
  text-align: center;
  background: #E2E8F0;
  color: #64748B;
  transition: background 0.22s ease, color 0.22s ease;
}

.type-tab.on {
  color: #0F172A;
}

.type-tab.on .t-count {
  background: #0F172A;
  color: #fff;
}

/* 各类颜色（未选中时只给色块上色，选中时文字+计数一起变色） */
.type-tab.all .t-sq {
  background: #0F172A;
}

.type-tab.pickup .t-sq {
  background: #2563EB;
}

.type-tab.delivery .t-sq {
  background: #0E9F6E;
}

.type-tab.alert .t-sq {
  background: #D97706;
}

.type-tab.pickup.on {
  color: #2563EB;
}

.type-tab.pickup.on .t-count {
  background: #2563EB;
}

.type-tab.delivery.on {
  color: #0E9F6E;
}

.type-tab.delivery.on .t-count {
  background: #0E9F6E;
}

.type-tab.alert.on {
  color: #D97706;
}

.type-tab.alert.on .t-count {
  background: #D97706;
}

.search-select {
  width: 180px;
}

.search-input {
  width: 200px;
}

.search-btns {
  display: flex;
  gap: 10px;
  margin-left: auto;
}

:deep(.el-button) {
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  border-radius: 6px;
  font-weight: 600;
}

:deep(.el-button:hover) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(var(--brand-rgb), 0.15);
}

:deep(.btn-primary) {
  background-color: var(--brand-primary);
  border-color: var(--brand-primary);
  color: #fff;
}

:deep(.btn-primary:hover) {
  background-color: #a00d24;
  border-color: #a00d24;
}

:deep(.btn-outline) {
  border-color: #CBD5E1;
  color: #334155;
}

:deep(.btn-outline:hover) {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
  background-color: var(--brand-primary-light);
}

:deep(.btn-danger-outline) {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
}

:deep(.btn-danger-outline:hover) {
  background-color: var(--brand-primary);
  color: #fff;
}

:deep(.el-input__wrapper.is-focus),
:deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 2px rgba(var(--brand-rgb), 0.15), 0 0 0 1px var(--brand-primary) inset !important;
}

/* ========== 表格 ========== */
.custom-table {
  border-radius: 8px;
  overflow: hidden;
}

:deep(.custom-table .el-table__cell) {
  color: #1E293B;
  font-weight: 500;
  font-size: 13px;
}

:deep(.custom-table th.el-table__cell) {
  color: #0F172A !important;
  font-weight: 700 !important;
  font-size: 13px;
  background: #F1F5F9 !important;
  border-bottom: 2px solid #E2E8F0;
}

:deep(.el-table__row) {
  transition: background-color 0.3s ease, transform 0.2s ease;
}

:deep(.el-table__row:hover) {
  background-color: var(--brand-primary-light) !important;
  transform: scale(1.002);
  box-shadow: 0 2px 8px rgba(var(--brand-rgb), 0.08);
}

:deep(.el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell) {
  background: #FAFBFC;
}

/* ⭐ 名称列左对齐，且与表格左边框留出间隔 */
.name-cell {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding-left: 8px;
  min-width: 0;
}

.name-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 3px 10px 3px 8px;
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  max-width: 100%;
}

.name-wrap:hover {
  border-color: #FCA5A5;
  box-shadow: 0 3px 10px rgba(var(--brand-rgb), 0.12);
  transform: translateY(-1px);
}

.name-bar {
  display: inline-block;
  width: 3px;
  height: 16px;
  background: linear-gradient(180deg, #FBBF24, #D97706);
  border-radius: 2px;
  box-shadow: 0 0 4px rgba(217, 119, 6, 0.4);
  flex-shrink: 0;
}

/* ⭐ 色条按围栏类型染色（装货蓝 / 卸货绿 / 提醒琥珀，都避开品牌红） */
.name-wrap.t-pickup .name-bar {
  background: linear-gradient(180deg, #60A5FA, #2563EB);
  box-shadow: 0 0 4px rgba(37, 99, 235, 0.4);
}

.name-wrap.t-delivery .name-bar {
  background: linear-gradient(180deg, #34D399, #0E9F6E);
  box-shadow: 0 0 4px rgba(14, 159, 110, 0.4);
}

.name-wrap.t-alert .name-bar {
  background: linear-gradient(180deg, #FBBF24, #D97706);
  box-shadow: 0 0 4px rgba(217, 119, 6, 0.4);
}

.name-wrap.t-pickup:hover {
  border-color: #BFD4FE;
}

.name-wrap.t-delivery:hover {
  border-color: #A7E8CE;
}

.name-wrap.t-alert:hover {
  border-color: #FBD5A5;
}

/* 名称前的类型文字标签 */
.type-tag {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.3px;
  flex-shrink: 0;
  line-height: 1;
}

.type-tag.pickup {
  background: #EFF4FF;
  color: #2563EB;
  border: 1px solid #BFD4FE;
}

.type-tag.delivery {
  background: #ECFDF5;
  color: #047857;
  border: 1px solid #A7E8CE;
}

.type-tag.alert {
  background: #FFF7ED;
  color: #B45309;
  border: 1px solid #FBD5A5;
}

.name-text {
  font-size: 13px;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: 0.3px;
  line-height: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shape-tag {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.3px;
}

.shape-tag.circle {
  background: #DBEAFE;
  color: #1E40AF;
  border: 1px solid #93C5FD;
}

.shape-tag.polygon {
  background: #D1FAE5;
  color: #065F46;
  border: 1px solid #6EE7B7;
}

.shape-tag.polyline {
  background: #FEF3C7;
  color: #92400E;
  border: 1px solid #FCD34D;
}

.shape-tag.district {
  background: #EDE9FE;
  color: #5B21B6;
  border: 1px solid #C4B5FD;
}

.param-text {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.time-text {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #334155;
  font-weight: 600;
}

.action-btn {
  font-weight: 700;
  transition: all 0.2s;
  padding: 0 4px;
}

.action-btn.edit {
  color: var(--brand-primary);
}

.action-btn.edit:hover {
  color: #7F1D1D;
  text-decoration: underline;
}

.action-btn.delete {
  color: #64748B;
}

.action-btn.delete:hover {
  color: var(--brand-primary);
  text-decoration: underline;
}

.empty-state {
  padding: 40px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.empty-icon {
  font-size: 48px;
  color: #94A3B8;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {

  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-10px);
  }
}

.empty-state p {
  margin: 0;
  font-size: 15px;
  color: #334155;
  font-weight: 700;
}

.empty-sub {
  font-size: 13px;
  color: #64748B;
}

.pagination-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 16px;
  border-top: 1px solid #E2E8F0;
  margin-top: 16px;
  flex-shrink: 0;
}

.total-text {
  font-size: 13px;
  color: #334155;
  font-weight: 700;
}

:deep(.custom-pagination .el-pager li) {
  transition: all 0.2s;
  font-weight: 600;
  color: #334155;
}

:deep(.custom-pagination .el-pager li:hover) {
  color: var(--brand-primary);
  transform: scale(1.1);
}

:deep(.custom-pagination .el-pager li.is-active) {
  background-color: var(--brand-primary) !important;
  color: #fff !important;
  box-shadow: 0 2px 6px rgba(var(--brand-rgb), 0.35);
}

:deep(.custom-pagination button:hover) {
  color: var(--brand-primary);
}

.delete-loading-overlay {
  position: fixed;
  inset: 0;
  background: rgba(248, 250, 252, 0.75);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.delete-loading-content {
  background: #ffffff;
  border-radius: 16px;
  padding: 32px 40px;
  box-shadow: 0 20px 60px rgba(211, 47, 47, 0.15), 0 0 0 1px rgba(211, 47, 47, 0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  animation: deleteContentIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes deleteContentIn {
  from {
    opacity: 0;
    transform: scale(0.85) translateY(20px);
  }

  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.delete-ring {
  position: relative;
  width: 110px;
  height: 110px;
}

.delete-ring svg {
  transform: rotate(-90deg);
}

.del-ring-track {
  fill: none;
  stroke: #FEE2E2;
  stroke-width: 6;
}

.del-ring-progress {
  fill: none;
  stroke: var(--brand-primary);
  stroke-width: 6;
  stroke-linecap: round;
  stroke-dasharray: 263.89;
  transition: stroke-dashoffset 0.3s ease-out;
  filter: drop-shadow(0 2px 6px rgba(211, 47, 47, 0.4));
}

.del-trash {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation: trashShake 1.2s ease-in-out infinite;
}

@keyframes trashShake {

  0%,
  100% {
    transform: translate(-50%, -50%) rotate(0deg);
  }

  25% {
    transform: translate(-50%, -50%) rotate(-8deg);
  }

  75% {
    transform: translate(-50%, -50%) rotate(8deg);
  }
}

.delete-text {
  font-size: 15px;
  color: #0F172A;
  font-weight: 600;
}

.delete-name {
  color: var(--brand-primary);
  font-weight: 800;
}

.delete-bar {
  width: 240px;
  height: 6px;
  background: #FEE2E2;
  border-radius: 3px;
  overflow: hidden;
}

.delete-bar-inner {
  height: 100%;
  background: linear-gradient(90deg, #EF4444, #B91C1C);
  border-radius: 3px;
  transition: width 0.3s ease-out;
  position: relative;
}

.delete-bar-inner::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent);
  animation: barShine 1.5s ease-in-out infinite;
}

@keyframes barShine {
  0% {
    transform: translateX(-100%);
  }

  100% {
    transform: translateX(100%);
  }
}

.delete-tip {
  font-size: 12px;
  color: #64748B;
  font-weight: 500;
  animation: textPulse 1.6s ease-in-out infinite;
}

@keyframes textPulse {

  0%,
  100% {
    opacity: 0.6;
  }

  50% {
    opacity: 1;
  }
}

.delete-fade-enter-active,
.delete-fade-leave-active {
  transition: opacity 0.35s ease;
}

.delete-fade-enter-from,
.delete-fade-leave-to {
  opacity: 0;
}

.fade-up {
  animation: fadeUp 0.5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
  opacity: 0;
  transform: translateY(20px);
}

@keyframes fadeUp {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>

<style>
.btn-danger-confirm {
  background-color: var(--brand-primary) !important;
  border-color: var(--brand-primary) !important;
  color: #ffffff !important;
  font-weight: 700 !important;
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.btn-danger-confirm:hover {
  background-color: #B91C1C !important;
  border-color: #B91C1C !important;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(211, 47, 47, 0.35);
}

.delete-confirm-box .el-message-box__header {
  padding: 16px 20px 8px;
}

.delete-confirm-box .el-message-box__title {
  font-weight: 700;
  color: #0F172A;
  font-size: 16px;
}

.delete-confirm-box .el-message-box__content {
  padding: 8px 20px 16px;
  font-size: 14px;
  color: #334155;
  font-weight: 500;
}
</style>