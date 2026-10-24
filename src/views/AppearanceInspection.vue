<template>
  <div class="insp-page">
    <!-- ============================================================
         KPI：今日巡检 / 有异常 / 待处理 / 今日覆盖
         ⚠️ 与筛选条件无关，单独查一次（否则筛个历史区间，今日数字全变 0）
         ============================================================ -->
    <div class="ip-kpis fade-up">
      <div class="kpi">
        <div class="kpi-v">{{ stats.today }}</div>
        <div class="kpi-l">今日巡检</div>
      </div>
      <div class="kpi is-red">
        <div class="kpi-v">{{ stats.todayAbn }}</div>
        <div class="kpi-l">今日有异常</div>
      </div>
      <div class="kpi is-amber">
        <div class="kpi-v">{{ stats.pending }}</div>
        <div class="kpi-l">异常待处理</div>
      </div>
      <div class="kpi is-green">
        <div class="kpi-v">{{ stats.cover }}<span class="kpi-of">/{{ stats.vehicles }}</span></div>
        <div class="kpi-l">今日覆盖车辆</div>
      </div>
    </div>

    <!-- ===== 筛选 ===== -->
    <div class="ip-filter fade-up">
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        value-format="YYYY-MM-DD"
        unlink-panels
        :shortcuts="DATE_SHORTCUTS"
        style="width: 250px"
        @change="onDateChange"
      />
      <el-input
        v-model="keyword"
        placeholder="车牌 / 司机 / 车号"
        clearable
        style="width: 200px"
        @keyup.enter="applyFilter"
        @clear="applyFilter"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-select v-model="resultFilter" placeholder="结果" clearable style="width: 128px" @change="applyFilter">
        <el-option label="全部正常" value="normal" />
        <el-option label="有异常" value="abnormal" />
      </el-select>
      <el-select v-model="handleFilter" placeholder="处理状态" clearable style="width: 128px" @change="applyFilter">
        <el-option label="待处理" value="pending" />
        <el-option label="已处理" value="done" />
      </el-select>
      <el-button type="primary" class="btn-primary" :loading="loading" @click="reload">查询</el-button>
      <el-button @click="handleReset">重置</el-button>
    </div>

    <!-- ===== 建表提示（SQL 没跑时） ===== -->
    <div v-if="dbHint" class="ip-hint fade-up">
      <el-icon><WarningFilled /></el-icon>
      <div class="ip-hint-t">
        <div>{{ dbHint }}</div>
        <div class="ip-hint-s">
          请先在 CloudBase 控制台执行 <code>db_migration_inspection.sql</code>，再点右上角刷新重试。
        </div>
      </div>
    </div>

    <!-- ============================================================
         表格卡片：工具条（四件套）**在卡片里面**，和其它列表页一致；
         全屏时整张卡 Teleport 到 body 铺满，工具条跟着走 → 才有退出按钮。
         ⚠️ 工具条放卡片外面 = 全屏后看不见四件套，进去就出不来了（2026-10-24 修）。
         ============================================================ -->
    <Teleport to="body" :disabled="!isFullscreen">
      <div class="ip-card" :class="{ 'is-fullscreen': isFullscreen }">
        <div class="ip-toolbar">
          <span class="tl-bar"></span>
          <h2>巡检记录</h2>
          <span class="tl-hint">一行一次巡检 · 点任意一行看逐项结果与照片</span>
          <TableTools
            v-model:size="tableSize"
            v-model:fullscreen="isFullscreen"
            :columns="columnConfig"
            :total="filteredRows.length"
            storage-key="appearance_inspection"
            :refreshing="loading"
            @refresh="reload"
            @reset="resetColumns"
          />
        </div>

        <div class="ip-table-wrap">
        <el-table
          :data="pagedRows"
          v-loading="loading"
          element-loading-text="加载中…"
          element-loading-background="rgba(255,255,255,0.86)"
          :size="tableSize"
          stripe
          height="100%"
          row-key="id"
          :row-class-name="rowClass"
          @row-click="openDetail"
        >
        <el-table-column
          v-for="col in visibleColumns"
          :key="col.prop"
          :prop="col.prop"
          :label="col.label"
          :width="col.width"
          :min-width="col.width ? undefined : col.minWidth || 100"
          :fixed="col.fixed || false"
          :align="col.align || 'left'"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <span v-if="col.prop === 'create_time'" class="cell-time num">{{ fmtTime(row.create_time) }}</span>

            <div v-else-if="col.prop === 'plate'" class="cell-plate">
              <span class="plate-t">{{ row.plate }}</span>
              <span v-if="row.trailer_included" class="plate-tag">挂车</span>
            </div>

            <span v-else-if="col.prop === 'driver_name'" class="cell-main">{{ row.driver_name || '--' }}</span>

            <span v-else-if="col.prop === 'result'" class="pill" :class="row.result === 'abnormal' ? 'bad' : 'ok'">
              {{ row.result === 'abnormal' ? row.abnormal_count + ' 项异常' : '全部正常' }}
            </span>

            <span v-else-if="col.prop === 'total_count'" class="num cell-dim">{{ row.total_count }} 项</span>

            <span v-else-if="col.prop === 'org'" class="cell-dim">{{ row.org || '--' }}</span>

            <span v-else-if="col.prop === 'handle_status'" class="cell-handle">
              <span v-if="row.result !== 'abnormal'" class="cell-dim">—</span>
              <span v-else class="pill" :class="row.handle_status === 'done' ? 'done' : 'wait'">
                {{ row.handle_status === 'done' ? '已处理' : '待处理' }}
              </span>
            </span>

            <el-button v-else-if="col.prop === 'action'" link type="primary" size="small" @click.stop="openDetail(row)">
              查看
            </el-button>

            <span v-else class="cell-dim">{{ row[col.prop] || '--' }}</span>
          </template>
        </el-table-column>

        <template #empty>
          <div class="ip-empty">
            <el-icon class="ip-empty-ic"><DocumentChecked /></el-icon>
            <p>{{ dbHint ? '读不到巡检数据' : '暂无巡检记录' }}</p>
            <span>司机在小程序「车辆管理 → 车辆卡片 → 去巡检」提交后，这里就会出现记录</span>
          </div>
        </template>
      </el-table>
      </div>

      <div class="ip-pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :page-sizes="[20, 50, 100]"
          :total="filteredRows.length"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @size-change="page = 1"
        />
        </div>

        <!-- 全屏时额外给一个明确的退出按钮（四件套里的图标会变成 Close，这个是双保险） -->
        <transition name="fs-fade">
          <button v-if="isFullscreen" class="fs-exit-btn" @click="isFullscreen = false">
            <el-icon><Close /></el-icon> 退出全屏
          </button>
        </transition>
      </div>
    </Teleport>

    <!-- ============================================================
         详情抽屉
         ============================================================ -->
    <el-drawer
      v-model="drawer"
      size="470px"
      append-to-body
      :with-header="false"
      class="insp-detail-drawer"
      destroy-on-close
      @closed="onDrawerClosed"
    >
      <div v-if="cur" class="dt">
        <!-- 头 -->
        <div class="dt-hd">
          <div class="dt-hd-main">
            <div class="dt-t">
              <span class="dt-plate">{{ cur.plate }}</span>
              <span class="pill" :class="cur.result === 'abnormal' ? 'bad' : 'ok'">
                {{ cur.result === 'abnormal' ? cur.abnormal_count + ' 项异常' : '全部正常' }}
              </span>
            </div>
            <div class="dt-s">
              {{ cur.driver_name || '—' }}
              <template v-if="cur.org"> · {{ cur.org }}</template>
              <template v-if="cur.trailer_included"> · 含挂车</template>
            </div>
            <div class="dt-s num">
              {{ fmtTime(cur.create_time) }}
              <template v-if="cur.vin"> · 车号 {{ cur.vin }}</template>
            </div>
          </div>
          <span class="dt-x" @click="drawer = false">×</span>
        </div>

        <div class="dt-body">
          <!-- 逐项结果：按组分行 -->
          <div class="dt-sec">
            <div class="dt-sec-hd">
              <span class="dt-sec-t">逐项结果</span>
              <span class="dt-sec-r">{{ cur.total_count }} 项 · {{ cur.abnormal_count }} 异常</span>
            </div>

            <div v-for="g in groupBlocks" :key="g.key" class="dt-group">
              <div class="dt-g-label">{{ g.label }}</div>
              <div class="dt-chips">
                <span
                  v-for="it in g.items"
                  :key="it.key"
                  class="mchip"
                  :class="{ bad: it.status === 'abnormal' }"
                >{{ it.label }}</span>
                <span v-if="!g.items.length" class="mchip off">本车无挂车 · 未检</span>
              </div>

              <!-- 异常项：描述 + 照片就地展开 -->
              <div v-for="it in g.badItems" :key="'n-' + it.key" class="dt-note">
                <div class="dt-note-hd">
                  <span class="dt-note-t">{{ it.label }}</span>
                  <span class="dt-note-c">已拍 {{ it.photos || 0 }} 张</span>
                </div>
                <div class="dt-note-b">{{ it.note || '（司机未填写描述）' }}</div>
                <div v-if="photosOf(it.key).length" class="dt-shots">
                  <el-image
                    v-for="(u, i) in photosOf(it.key)"
                    :key="i"
                    :src="u"
                    :preview-src-list="photosOf(it.key)"
                    :initial-index="i"
                    fit="cover"
                    class="dt-shot"
                    preview-teleported
                  >
                    <template #error><div class="dt-shot-hold">图</div></template>
                  </el-image>
                </div>
              </div>
            </div>
          </div>

          <!-- 整单照片 -->
          <div v-if="overallPhotos.length" class="dt-sec">
            <div class="dt-sec-hd">
              <span class="dt-sec-t">照片凭证</span>
              <span class="dt-sec-r">{{ overallPhotos.length }} 张</span>
            </div>
            <div class="dt-shots">
              <el-image
                v-for="(u, i) in overallPhotos"
                :key="i"
                :src="u"
                :preview-src-list="overallPhotos"
                :initial-index="i"
                fit="cover"
                class="dt-shot big"
                preview-teleported
              >
                <template #error><div class="dt-shot-hold">图</div></template>
              </el-image>
            </div>
          </div>

          <!-- 备注 -->
          <div v-if="cur.remark" class="dt-sec">
            <div class="dt-sec-hd"><span class="dt-sec-t">司机备注</span></div>
            <div class="dt-note-b">{{ cur.remark }}</div>
          </div>

          <!-- 处理 -->
          <div class="dt-sec" :class="{ 'is-ok': cur.handle_status === 'done' }">
            <div class="dt-sec-hd">
              <span class="dt-sec-t">处理</span>
              <span class="dt-sec-r">
                {{ cur.handle_status === 'done' ? '已处理' : (cur.result === 'abnormal' ? '待处理' : '无需处理') }}
              </span>
            </div>

            <template v-if="cur.result !== 'abnormal'">
              <div class="dt-note-b">本次巡检没有异常项，不需要处理。</div>
            </template>

            <template v-else-if="cur.handle_status === 'done'">
              <div class="dt-note-b">{{ cur.handle_note || '—' }}</div>
              <div class="dt-done-meta">
                {{ cur.handle_by || '—' }} · {{ cur.handle_at ? fmtTime(cur.handle_at) : '—' }}
              </div>
            </template>

            <template v-else>
              <el-input
                v-model="handleNote"
                type="textarea"
                :rows="3"
                maxlength="200"
                show-word-limit
                placeholder="写处理结果，如：已通知修理厂，25 日进厂更换"
              />
              <div class="dt-handle-row">
                <el-button plain :loading="creatingRepair" @click="createRepair">生成维修单</el-button>
                <el-button type="primary" class="btn-primary" :loading="handling" @click="markDone">
                  标记已处理
                </el-button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
/**
 * 外观巡检管理（Web）
 * ============================================================
 * 数据来自小程序 `inspection` 云函数写入的 vehicle_inspections；
 * Web 只读 + 只改「处理状态」（日常检查不做审批链）。
 *
 * 口径：
 *   · 隔离按 owner_account（与 waybills / reports 一致）
 *   · 列表 / 详情一张表，items 是提交时的快照（改模板不影响历史）
 *   · KPI 单独查一次，不跟筛选联动（否则筛历史区间今日数字变 0）
 */
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, WarningFilled, DocumentChecked, Close } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { supabase } from '@/utils/supabase'
import { signGetCached } from '@/utils/cos'
import TableTools from '@/components/TableTools.vue'
import { repairFromInspection } from '@/utils/maintenance'

/* ================= 用户与范围 ================= */
const currentUser = (() => {
  try {
    return JSON.parse(localStorage.getItem('currentUser') || 'null') || {}
  } catch {
    return {}
  }
})()
const isAdmin = currentUser.role === 'admin'
const myAccount = currentUser.masterAccount || currentUser.account || ''
const myName = currentUser.name || currentUser.account || ''
const scope = (q) => (isAdmin ? q : q.eq('owner_account', myAccount))

/* ================= 常量 ================= */
const DATE_SHORTCUTS = [
  { text: '今天', value: () => [dayjs().format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')] },
  { text: '近 7 天', value: () => [dayjs().subtract(6, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')] },
  { text: '本月', value: () => [dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')] },
  { text: '上月', value: () => [dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD'), dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD')] },
]
const LIST_FIELDS =
  'id,vehicle_id,plate,vin,org,driver_name,trailer_included,result,total_count,abnormal_count,' +
  'items,images,remark,handle_status,handle_note,handle_by,handle_at,create_time'

/* ================= 状态 ================= */
const rows = ref([])
const loading = ref(false)
const dbHint = ref('')
const dateRange = ref([dayjs().subtract(29, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')])
const keyword = ref('')
const resultFilter = ref('')
const handleFilter = ref('')
const page = ref(1)
const pageSize = ref(20)
const tableSize = ref('default')
const isFullscreen = ref(false)

const drawer = ref(false)
const cur = ref(null)
const handleNote = ref('')
const handling = ref(false)
const creatingRepair = ref(false)

const stats = ref({ today: 0, todayAbn: 0, pending: 0, cover: 0, vehicles: 0 })

/* 图片 key → 临时链接 */
const urlMap = ref({})

/* ================= 列 ================= */
const columnConfig = ref([
  { prop: 'create_time', label: '巡检时间', visible: true, width: 122 },
  { prop: 'plate', label: '车牌', visible: true, width: 128 },
  { prop: 'driver_name', label: '司机', visible: true, width: 84 },
  { prop: 'result', label: '结果', visible: true, width: 104 },
  { prop: 'total_count', label: '项数', visible: true, width: 78 },
  { prop: 'org', label: '机构', visible: true, minWidth: 130 },
  { prop: 'handle_status', label: '处理状态', visible: true, width: 104 },
  { prop: 'action', label: '操作', visible: true, width: 70, fixed: 'right' },
])
const visibleColumns = computed(() => columnConfig.value.filter((c) => c.visible !== false))
const resetColumns = () => columnConfig.value.forEach((c) => { c.visible = true })

/* ================= 筛选（客户端） ================= */
const filteredRows = computed(() => {
  const kw = keyword.value.trim()
  return rows.value.filter((r) => {
    if (resultFilter.value && r.result !== resultFilter.value) return false
    if (handleFilter.value) {
      if (r.result !== 'abnormal') return false
      if (r.handle_status !== handleFilter.value) return false
    }
    if (kw) {
      const hay = `${r.plate || ''} ${r.driver_name || ''} ${r.vin || ''}`.toLowerCase()
      if (!hay.includes(kw.toLowerCase())) return false
    }
    return true
  })
})

const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredRows.value.slice(start, start + pageSize.value)
})

/* ================= 取数 ================= */
const isMissingTable = (msg) => /42P01|does not exist|permission denied|42501/i.test(String(msg || ''))

async function loadRows() {
  loading.value = true
  try {
    let q = supabase
      .from('vehicle_inspections')
      .select(LIST_FIELDS)
      .order('create_time', { ascending: false })
      .limit(1000)
    q = scope(q)
    if (dateRange.value && dateRange.value.length === 2) {
      q = q
        .gte('create_time', dateRange.value[0] + ' 00:00:00')
        .lte('create_time', dateRange.value[1] + ' 23:59:59')
    }

    const { data, error } = await q
    if (error) throw error

    dbHint.value = ''
    rows.value = (data || []).map((r) => ({
      ...r,
      total_count: Number(r.total_count) || 0,
      abnormal_count: Number(r.abnormal_count) || 0,
      items: Array.isArray(r.items) ? r.items : [],
      images: Array.isArray(r.images) ? r.images : [],
    }))
  } catch (e) {
    const msg = String((e && (e.message || e.error_description)) || e || '')
    console.error('加载巡检记录失败：', e)
    /* 分不清「没建表」还是「网络抖动」时，一律给可执行的提示（建表 SQL），
       别只弹一句 FetchError —— 这个网关对 404 的包装经常拿不到 message */
    if (isMissingTable(msg)) {
      dbHint.value = '巡检表还不存在或没有授权'
    } else {
      dbHint.value = '读不到巡检数据：可能还没建表，或网络异常'
    }
    rows.value = []
    if (msg && !/FetchError/i.test(msg)) {
      ElMessage.error('加载失败：' + msg.slice(0, 60))
    }
  } finally {
    loading.value = false
  }
}

async function loadStats() {
  const start = dayjs().startOf('day').format('YYYY-MM-DD HH:mm:ss')
  try {
    const [todayRes, pendRes, vehRes] = await Promise.all([
      scope(supabase.from('vehicle_inspections').select('id,plate,result').gte('create_time', start).limit(1000)),
      scope(
        supabase
          .from('vehicle_inspections')
          .select('id')
          .eq('result', 'abnormal')
          .eq('handle_status', 'pending')
          .limit(1000)
      ),
      scope(supabase.from('vehicles').select('id').limit(2000)),
    ])

    const today = todayRes.data || []
    const plates = new Set(today.map((r) => r.plate).filter(Boolean))
    stats.value = {
      today: today.length,
      todayAbn: today.filter((r) => r.result === 'abnormal').length,
      pending: (pendRes.data || []).length,
      cover: plates.size,
      vehicles: (vehRes.data || []).length,
    }
  } catch (e) {
    /* KPI 拿不到不影响列表，静默降级 */
    console.warn('巡检 KPI 读取失败（不阻断）', e)
  }
}

const reload = async () => {
  urlMap.value = {}
  await Promise.all([loadRows(), loadStats()])
}

/* 日期范围影响服务端查询 → 必须重新拉 */
const onDateChange = async () => {
  page.value = 1
  urlMap.value = {}
  await loadRows()
}

const applyFilter = () => {
  page.value = 1
}

const handleReset = () => {
  dateRange.value = [dayjs().subtract(29, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')]
  keyword.value = ''
  resultFilter.value = ''
  handleFilter.value = ''
  page.value = 1
  reload()
}

/* ================= 展示 ================= */
const fmtTime = (t) => {
  if (!t) return '--'
  const d = dayjs(t)
  return d.isValid() ? d.format('MM-DD HH:mm') : String(t).slice(5, 16)
}

const rowClass = ({ row }) => (row.result === 'abnormal' && row.handle_status === 'pending' ? 'is-todo' : '')

/* ================= 抽屉 ================= */
const groupBlocks = computed(() => {
  if (!cur.value) return []
  const map = new Map()
  ;(cur.value.items || []).forEach((it) => {
    const key = it.group || 'other'
    if (!map.has(key)) {
      map.set(key, { key, label: it.groupLabel || it.group || '其他', items: [], badItems: [] })
    }
    const g = map.get(key)
    g.items.push(it)
    if (it.status === 'abnormal') g.badItems.push(it)
  })
  const list = Array.from(map.values())
  /* 挂车组没检时补一行说明，别让人以为漏了 */
  if (!list.some((g) => g.key === 'trailer') && cur.value.trailer_included === false) {
    list.push({ key: 'trailer', label: '挂车巡检', items: [], badItems: [] })
  }
  return list
})

const photosOf = (itemKey) => {  if (!cur.value) return []
  return (cur.value.images || [])
    .filter((im) => (im.item || 'overall') === itemKey)
    .map((im) => urlMap.value[im.key || im.fileID] || '')
    .filter(Boolean)
}

const overallPhotos = computed(() => photosOf('overall'))

/* 图片签名：只在抽屉打开时按需签，避免列表页一次签几百个 */
async function signForRecord(row) {
  const keys = (row.images || []).map((im) => im.key || im.fileID).filter(Boolean)
  if (!keys.length) return
  const need = keys.filter((k) => !urlMap.value[k])
  if (!need.length) return
  try {
    const map = await signGetCached(need)
    urlMap.value = { ...urlMap.value, ...(map || {}) }
  } catch (e) {
    console.warn('巡检照片签名失败（保留占位）', e)
  }
}

const openDetail = async (row) => {
  cur.value = row
  handleNote.value = ''
  drawer.value = true
  await signForRecord(row)
}

const onDrawerClosed = () => {
  cur.value = null
  handleNote.value = ''
}

/* ================= 生成维修单（巡检异常 → 维保台账） ================= */
const createRepair = async () => {
  if (!cur.value) return
  const n = cur.value.abnormal_count || (cur.value.items || []).filter((i) => i.status === 'abnormal').length
  try {
    await ElMessageBox.confirm(
      `按这 ${n} 项异常生成一条维修单？异常描述和照片会带过去，生成后这条巡检标记为「已处理」。`,
      '生成维修单',
      { type: 'info', confirmButtonText: '生成', cancelButtonText: '取消' }
    )
  } catch (e) {
    return
  }
  creatingRepair.value = true
  try {
    const saved = await repairFromInspection(cur.value)
    const note = `已生成维修单 #${saved.id}`
    rows.value = rows.value.map((r) => (r.id === cur.value.id ? { ...r, handle_status: 'done', handle_note: note } : r))
    cur.value = { ...cur.value, handle_status: 'done', handle_note: note }
    await loadStats()
    ElMessage.success(`已生成维修单 #${saved.id}，去「车务管理 › 维保台账」补金额和维修项目`)
  } catch (e) {
    console.error('生成维修单失败', e)
    ElMessage.error('生成失败：' + String((e && e.message) || '').slice(0, 60))
  } finally {
    creatingRepair.value = false
  }
}

/* ================= 标记已处理 ================= */
const markDone = async () => {
  if (!cur.value) return
  const note = handleNote.value.trim()
  if (note.length < 2) {
    ElMessage.warning('请先写处理说明')
    return
  }
  handling.value = true
  try {
    /* ⚠️ 条件更新：只有还在待处理的行才改（两个人同时点不会重复记账）；
       非管理员还要挂 owner_account —— 只靠 id 来自已过滤的列表不够。 */
    let q = supabase
      .from('vehicle_inspections')
      .update({
        handle_status: 'done',
        handle_note: note,
        handle_by: myName,
        handle_at: new Date().toISOString(),
      })
      .eq('id', cur.value.id)
      .eq('handle_status', 'pending')
    if (!isAdmin) q = q.eq('owner_account', myAccount)

    const { error } = await q
    if (error) throw error

    /* 回读一次拿最终值：条件更新的成败看数据，不看返回条数 */
    const { data, error: e2 } = await supabase
      .from('vehicle_inspections')
      .select('id,handle_status,handle_note,handle_by,handle_at')
      .eq('id', cur.value.id)
      .limit(1)
    if (e2) throw e2

    const fresh = data && data[0]
    if (!fresh) {
      ElMessage.warning('这条记录不见了，请刷新')
      await loadRows()
      return
    }

    rows.value = rows.value.map((r) => (r.id === fresh.id ? { ...r, ...fresh } : r))
    cur.value = { ...cur.value, ...fresh }
    handleNote.value = ''

    if (fresh.handle_by && fresh.handle_by !== myName) {
      ElMessage.warning('这条刚被别人处理了，已显示最新状态')
    } else {
      ElMessage.success('已标记为已处理')
    }
    await loadStats()
  } catch (e) {
    console.error('标记处理失败：', e)
    ElMessage.error('保存失败：' + String((e && e.message) || '').slice(0, 60))
  } finally {
    handling.value = false
  }
}

/* ================= 生命周期 ================= */
onMounted(reload)

/* 客户端筛选变了就回第一页（否则停在第 5 页会看到空表） */
watch([keyword, resultFilter, handleFilter], () => {
  page.value = 1
})

/* 全屏时把抽屉关掉，避免遮住 */
watch(isFullscreen, (v) => {
  if (v) drawer.value = false
})
</script>

<style scoped>
/* ========== 页面骨架 ========== */
.insp-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 12px;
  padding: 16px 18px;
  box-sizing: border-box;
}

/* ========== KPI ========== */
.ip-kpis {
  display: flex;
  gap: 10px;
}
.kpi {
  flex: 1;
  background: #fff;
  border: 1px solid #e6ecf3;
  border-radius: 10px;
  padding: 12px 16px;
}
.kpi-v {
  font-size: 22px;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.4px;
}
.kpi-of {
  font-size: 13px;
  font-weight: 600;
  color: #94a3b8;
  margin-left: 2px;
}
.kpi-l {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 3px;
}
.kpi.is-red .kpi-v {
  color: #c8102e;
}
.kpi.is-amber .kpi-v {
  color: #b45309;
}
.kpi.is-green .kpi-v {
  color: #15803d;
}

/* ========== 筛选 ========== */
.ip-filter {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  background: #fff;
  border: 1px solid #e6ecf3;
  border-radius: 10px;
  padding: 12px 14px;
}

/* ========== 工具行（在卡片里，和其它列表页一致） ========== */
.ip-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px 8px;
  border-bottom: 1px solid #f1f5f9;
}
.tl-bar {
  width: 3px;
  height: 15px;
  border-radius: 2px;
  background: var(--brand-primary);
}
.ip-toolbar h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
  color: #0f172a;
}
.tl-hint {
  font-size: 11px;
  color: #b4becb;
}
.ip-toolbar :deep(.table-tools) {
  margin-left: auto;
}

/* ========== 提示 ========== */
.ip-hint {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 10px;
  padding: 12px 14px;
  color: #b45309;
}
.ip-hint-t {
  font-size: 12.5px;
  line-height: 1.7;
}
.ip-hint-s {
  color: #92400e;
}
.ip-hint code {
  background: #fef3c7;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 11.5px;
}

/* ========== 表格 ========== */
.ip-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #e6ecf3;
  border-radius: 10px;
  overflow: hidden;
}
.ip-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.ip-card.is-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 2000;
  border-radius: 0;
  border: none;
  background: #fff;
}
.ip-pager {
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  padding: 10px 14px;
  border-top: 1px solid #f1f5f9;
  background: #fff;
}

/* 全屏退出按钮：四件套里的图标也会变成 Close，这个是更明显的兜底 */
.fs-exit-btn {
  position: fixed;
  right: 26px;
  /* 抬到分页条上面：bottom:26 会压住「前往 x 页」输入框 */
  bottom: 66px;
  z-index: 2100;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 16px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark, #a00d24));
  color: #fff;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 8px 22px rgba(200, 16, 46, 0.34);
  transition: all 0.25s;
}
.fs-exit-btn:hover {
  transform: translateY(-1px);
}
.fs-fade-enter-active,
.fs-fade-leave-active {
  transition: opacity 0.18s ease;
}
.fs-fade-enter-from,
.fs-fade-leave-to {
  opacity: 0;
}

.ip-card :deep(.el-table th.el-table__cell) {
  font-size: 12px;
  color: #475569;
  font-weight: 700;
}
.ip-card :deep(.el-table td.el-table__cell) {
  padding: 12px 0;
}
.ip-card :deep(.el-table__row) {
  cursor: pointer;
}
.ip-card :deep(.el-table .is-todo) {
  background: #fffbfb;
}

.cell-time {
  font-size: 12.5px;
  color: #64748b;
}
.cell-plate {
  display: flex;
  align-items: center;
  gap: 6px;
}
.plate-t {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: 0.3px;
}
.plate-tag {
  font-size: 10px;
  font-weight: 700;
  color: #b45309;
  background: #fef3c7;
  border-radius: 4px;
  padding: 1px 5px;
}
.cell-main {
  font-size: 13px;
  color: #0f172a;
  font-weight: 600;
}
.cell-dim {
  font-size: 12.5px;
  color: #64748b;
}
.num {
  font-variant-numeric: tabular-nums;
}

.pill {
  display: inline-flex;
  align-items: center;
  font-size: 11.5px;
  font-weight: 700;
  border-radius: 5px;
  padding: 2px 8px;
  line-height: 1.6;
}
.pill.ok {
  background: #dcfce7;
  color: #15803d;
}
.pill.bad {
  background: #fef2f2;
  color: #c8102e;
}
.pill.wait {
  background: #fef3c7;
  color: #b45309;
}
.pill.done {
  background: #f1f5f9;
  color: #64748b;
}

/* 空态 */
.ip-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 40px 0;
  color: #b4becb;
}
.ip-empty-ic {
  font-size: 30px;
  color: #e2e8f0;
}
.ip-empty p {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  font-weight: 600;
}
.ip-empty span {
  font-size: 12px;
  color: #b4becb;
}

/* ========== 抽屉 ========== */
.dt {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.dt-hd {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 18px 15px;
  border-bottom: 1px solid #f1f5f9;
}
.dt-hd-main {
  flex: 1;
  min-width: 0;
}
.dt-t {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dt-plate {
  font-size: 18px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: 0.4px;
}
.dt-s {
  font-size: 12.5px;
  color: #64748b;
  margin-top: 6px;
}
.dt-x {
  color: #c4cdd9;
  font-size: 21px;
  cursor: pointer;
  line-height: 1;
}
.dt-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dt-sec {
  border: 1px solid #e9eef5;
  border-radius: 11px;
  padding: 12px 13px;
}
.dt-sec.is-ok {
  background: #fcfdfe;
}
.dt-sec-hd {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}
.dt-sec-t {
  font-size: 12.5px;
  font-weight: 800;
  color: #334155;
  letter-spacing: 0.3px;
}
.dt-sec-r {
  margin-left: auto;
  font-size: 11.5px;
  color: #94a3b8;
}

/* 逐项矩阵 */
.dt-group + .dt-group {
  margin-top: 12px;
}
.dt-g-label {
  font-size: 11.5px;
  color: #94a3b8;
  margin-bottom: 6px;
}
.dt-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.mchip {
  font-size: 11.5px;
  line-height: 1.7;
  padding: 2px 8px;
  border-radius: 5px;
  background: #dcfce7;
  color: #15803d;
}
.mchip.bad {
  background: #fef2f2;
  color: #c8102e;
  font-weight: 700;
  border: 1px solid #fbd5db;
}
.mchip.off {
  background: #f8fafc;
  color: #b4becb;
}

.dt-note {
  margin-top: 9px;
  background: #fffbfb;
  border-left: 2px solid #c8102e;
  border-radius: 0 7px 7px 0;
  padding: 9px 11px;
}
.dt-note-hd {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dt-note-t {
  font-size: 12px;
  font-weight: 700;
  color: #c8102e;
}
.dt-note-c {
  margin-left: auto;
  font-size: 11px;
  color: #b4becb;
}
.dt-note-b {
  font-size: 12.5px;
  color: #334155;
  line-height: 1.65;
  margin-top: 5px;
  white-space: pre-wrap;
  word-break: break-word;
}

.dt-shots {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.dt-shot {
  width: 62px;
  height: 62px;
  border-radius: 7px;
  overflow: hidden;
  cursor: zoom-in;
}
.dt-shot.big {
  width: 78px;
  height: 78px;
}
.dt-shot-hold {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #eef2f7;
  color: #b4becb;
  font-size: 11px;
}
.dt-done-meta {
  font-size: 11.5px;
  color: #94a3b8;
  margin-top: 6px;
}
.dt-handle-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}
</style>

<style>
/* ===== 巡检详情抽屉：浮岛样式（同费用明细）
   ⚠️ 抽屉 append-to-body 脱离 scoped，这段必须是全局样式；
      el-drawer 用内联样式设 top/bottom，普通规则盖不住，要 !important。 ===== */
.insp-detail-drawer.el-drawer {
  top: 12px !important;
  bottom: 12px !important;
  right: 12px !important;
  height: auto !important;
  border-radius: 13px !important;
  overflow: hidden;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.06), 0 20px 50px -10px rgba(15, 23, 42, 0.3);
}
.insp-detail-drawer .el-drawer__body {
  padding: 0;
  overflow: hidden;
}
.el-overlay:has(.insp-detail-drawer) {
  background-color: rgba(15, 23, 42, 0.14);
}
</style>
