<template>
  <div class="fee-list-page">
    <!-- ===== 状态标签 ===== -->
    <div class="fl-tabs fade-up">
      <button v-for="t in STATUS_TABS" :key="t.key" class="fl-tab"
        :class="{ on: statusFilter === t.key }" @click="statusFilter = t.key">
        {{ t.label }}
        <span class="fl-tab-n" v-if="countOf(t.key)">{{ countOf(t.key) }}</span>
      </button>
    </div>

    <!-- ===== 筛选 ===== -->
    <div class="fl-filter fade-up">
      <el-date-picker v-model="dateRange" type="daterange" range-separator="至"
        start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD"
        unlink-panels :shortcuts="DATE_SHORTCUTS" style="width: 250px" />
      <el-input v-model="keyword" placeholder="运单号 / 司机 / 车牌" clearable
        style="width: 210px" @keyup.enter="reload">
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-select v-model="typeFilter" placeholder="费用类型" clearable style="width: 130px">
        <el-option v-for="t in TYPE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
      </el-select>
      <el-button type="primary" class="btn-primary" :loading="loading" @click="reload">查询</el-button>
      <el-button @click="handleReset">重置</el-button>
    </div>

    <!-- ===== 工具行 ===== -->
    <div class="fl-toolbar fade-up">
      <span class="tl-bar"></span>
      <h2>费用明细</h2>
      <span class="tl-hint">一行一趟车 · 金额为该车费用合计</span>
      <TableTools v-model:size="tableSize" v-model:fullscreen="isFullscreen"
        :columns="columnConfig" :total="filteredRows.length" storage-key="fee_list"
        :refreshing="loading" @refresh="reload" @reset="resetColumns" />
    </div>

    <!-- ===== 表格 ===== -->
    <div class="fl-card fade-up" :class="{ 'is-fullscreen': isFullscreen }">
      <el-table :data="pagedRows" :size="tableSize" stripe height="100%"
        v-loading="loading" element-loading-text="加载中…"
        element-loading-background="rgba(255,255,255,.88)" class="custom-table"
        :row-key="(r) => r.key">

        <!-- 费用 -->
        <el-table-column v-if="colOn('fee')" label="费用" min-width="200">
          <template #default="{ row }">
            <div class="cell-amt">
              <span class="amt num">¥{{ fmtMoney(row.total) }}</span>
              <span v-if="row.pendingCount" class="amt-tag">{{ row.pendingCount }} 笔待审</span>
            </div>
            <div class="cell-types">
              <span v-for="t in row.types" :key="t" class="tp">{{ TYPE_LABEL[t] || t }}</span>
            </div>
          </template>
        </el-table-column>

        <!-- 状态 -->
        <el-table-column v-if="colOn('status')" label="费用状态" width="120">
          <template #default="{ row }">
            <span class="st" :class="statusCls(row.status)">
              <i></i>{{ row.status }}
            </span>
          </template>
        </el-table-column>

        <!-- 运单 -->
        <el-table-column v-if="colOn('waybill')" label="运单 / 任务" min-width="180">
          <template #default="{ row }">
            <div class="cell-main">{{ row.task_name || '—' }}</div>
            <div class="cell-sub num">{{ row.waybill_no || '—' }}</div>
          </template>
        </el-table-column>

        <!-- 司机车牌 -->
        <el-table-column v-if="colOn('driver')" label="司机 · 车牌" min-width="150">
          <template #default="{ row }">
            <div class="cell-main">{{ row.driver_name || '—' }}</div>
            <div class="cell-sub num">{{ row.plate || '—' }}</div>
          </template>
        </el-table-column>

        <!-- 完成时间 -->
        <el-table-column v-if="colOn('time')" label="完成时间" width="140">
          <template #default="{ row }">
            <span class="cell-time num">{{ fmtDate(row.last_time) }}</span>
          </template>
        </el-table-column>

        <!-- 操作 -->
        <el-table-column label="操作" width="90" align="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openDetail(row)">明细</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="fl-pager">
        <el-pagination v-model:current-page="page" v-model:page-size="pageSize"
          :page-sizes="[20, 50, 100]" :total="filteredRows.length"
          layout="total, sizes, prev, pager, next, jumper" background
          @size-change="page = 1" />
      </div>
    </div>

    <!-- ===== 明细抽屉 ===== -->
    <!-- 点遮罩空白处关闭（close-on-click-modal 默认开，这里显式声明 + 自定义遮罩点击） -->
    <el-drawer v-model="drawer" size="440px" append-to-body :with-header="false"
      :close-on-click-modal="true" :close-on-press-escape="true"
      class="fee-detail-drawer" destroy-on-close>
      <div v-if="cur" class="dt" @click.self="drawer = false">
        <div class="dt-hd">
          <div style="flex:1;min-width:0">
            <div class="dt-t">
              {{ cur.task_name || '未命名任务' }}
              <span class="dt-amt-inline num">· ¥{{ fmtMoney(cur.total) }}</span>
            </div>
            <div class="dt-s num">
              {{ cur.waybill_no || '—' }} · {{ cur.driver_name || '—' }} · {{ cur.plate || '—' }}
            </div>
          </div>
          <span class="dt-x" @click="drawer = false">×</span>
        </div>

        <div class="dt-body">
          <div class="dt-label">费用明细 · {{ cur.items.length }} 笔</div>

          <!-- ⭐ 每笔费用一张卡：上半是这笔的信息，下半只放这笔自己的凭证，
               这样图片和费用天然对应，不用靠顺序去猜 -->
          <div class="dt-cards">
            <div v-for="c in curCards" :key="c.id" class="fc">
              <div class="fc-hd">
                <span class="fc-ico">{{ (TYPE_LABEL[c.type] || '费').slice(0, 1) }}</span>
                <div class="fc-tt">
                  <div class="fc-t">
                    <b>{{ TYPE_LABEL[c.type] || c.type }}</b>
                    <span class="st fc-st" :class="statusCls(normalizeStatus(c.status))">
                      <i></i>{{ normalizeStatus(c.status) }}
                    </span>
                  </div>
                  <div class="fc-d num">{{ itemDesc(c) }}</div>
                </div>
                <span class="fc-amt num">¥{{ fmtMoney(c.amount) }}</span>
              </div>

              <div class="fc-vch">
                <template v-if="c.imgs.length">
                  <div class="fc-vch-hd">凭证 · {{ c.imgs.length }} 张</div>
                  <div class="dt-imgs">
                    <template v-for="im in c.imgs" :key="im.key">
                      <!-- 图片：预览列表只含本笔的图，左右切换不会串到别的费用 -->
                      <el-image v-if="im.isImage && im.url" :src="im.url" fit="cover"
                        class="dt-img" :preview-src-list="c.previewUrls"
                        :initial-index="im.idx" preview-teleported>
                        <template #error><div class="dt-img-err">加载失败</div></template>
                      </el-image>
                      <!-- 非图片（pdf / 表格等）：给个可点的文件块 -->
                      <a v-else-if="im.url" :href="im.url" target="_blank" rel="noopener"
                        class="dt-file" :title="im.name">
                        <span class="dt-file-ic">件</span>
                        <span class="dt-file-n">{{ im.name }}</span>
                      </a>
                      <!-- 链接还没签下来 / 签名失败：保留占位，别让凭证凭空消失 -->
                      <div v-else class="dt-img dt-img-ph">
                        {{ imgLoading ? '加载中' : '未取到' }}
                      </div>
                    </template>
                  </div>
                </template>
                <div v-else class="fc-novch"><i></i>这笔费用没有上传凭证</div>
              </div>
            </div>
          </div>

          <div class="dt-sum">
            合计 <b class="num">¥{{ fmtMoney(cur.total) }}</b>
          </div>
        </div>

        <!-- 底部操作：按钮随「状态 × 开关」变化 -->
        <div v-if="drawerActions.length" class="dt-foot">
          <el-button v-for="a in drawerActions" :key="a.key"
            :class="'dt-' + a.cls" :loading="acting && a.key === actingKey"
            @click="doAction(a.key)">
            {{ a.label }}
          </el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { moduleFlags, approvalOn } from '@/utils/modules'
import { signGet } from '@/utils/cos'
import TableTools from '@/components/TableTools.vue'

/* ================= 用户与范围 ================= */
/** 当前登录用户（模拟进入客户时 currentUser 已经是客户账号） */
const currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('currentUser') || 'null') || {} } catch { return {} }
})()
const isAdmin = currentUser.role === 'admin'
const myAccount = currentUser.masterAccount || currentUser.account || ''
const scope = (q) => (isAdmin ? q : q.eq('owner_account', myAccount))

/* ================= 常量 ================= */
const TYPE_LABEL = {
  expense: '费用上报', weigh: '过磅单', subsidy: '补贴申请', violation: '违章处理',
  overtime: '超时报备', receipt: '回单', loan: '借款申请', cardfix: '油卡补录',
}
const TYPE_OPTIONS = Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))

/**
 * 状态枚举取决于两个模块开关：
 * ┌ 审批开 + 付款开 → 待审核 / 待打款 / 已打款 / 已驳回
 * ├ 审批开 + 付款关 → 待审核 / 已通过 / 已驳回
 * ├ 审批关 + 付款开 → 待打款 / 已打款
 * └ 审批关 + 付款关 → 已上报（没有流程可走，只有"报没报"）
 */
const STATUS_ORDER = computed(() => {
  /* 审批一开就有「已通过」—— 审批过了但还没进入付款（或不需要付款）的单子停在这里 */
  if (auditOn.value && payoutOn.value) return ['待审核', '已通过', '待打款', '已打款', '已驳回']
  if (auditOn.value) return ['待审核', '已通过', '已驳回']
  if (payoutOn.value) return ['待打款', '已打款']
  return ['已上报']
})

const STATUS_TABS = computed(() => ([
  { key: '', label: '全部' },
  ...STATUS_ORDER.value.map((k) => ({ key: k, label: k })),
]))

const DATE_SHORTCUTS = [
  { text: '近 7 天', value: () => [dayjs().subtract(6, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')] },
  { text: '本月', value: () => [dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')] },
  { text: '上月', value: () => [dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD'), dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD')] },
]

/* ================= 状态 ================= */
const raw = ref([])
const loading = ref(false)
const dateRange = ref(null)
const keyword = ref('')
const typeFilter = ref('')
const statusFilter = ref('')
const page = ref(1)
const pageSize = ref(20)
const tableSize = ref('default')
const isFullscreen = ref(false)
const drawer = ref(false)
const cur = ref(null)
const router = useRouter()

/* 费用审批 / 付款记录 是否开启 —— 决定状态枚举和可用按钮 */
const auditOn = computed(() => approvalOn.value)
const payoutOn = computed(() => moduleFlags.payout === true)

const columnConfig = ref([
  { prop: 'fee', label: '费用', visible: true },
  { prop: 'status', label: '费用状态', visible: true },
  { prop: 'waybill', label: '运单 / 任务', visible: true },
  { prop: 'driver', label: '司机 · 车牌', visible: true },
  { prop: 'time', label: '完成时间', visible: true },
])
const colOn = (p) => {
  const c = columnConfig.value.find((x) => x.prop === p)
  return c ? c.visible !== false : true
}
const resetColumns = () => columnConfig.value.forEach((c) => { c.visible = true })

/* ================= 取数 + 按运单聚合 ================= */
async function load() {
  loading.value = true
  try {
    let q = supabase
      .from('reports')
      .select('id,type,amount,status,create_time,paid_at,payment,driver_name,plate,waybill_no,current_level,flow,payload,images')
      .order('create_time', { ascending: false })
      .limit(3000)
    q = scope(q)
    if (dateRange.value && dateRange.value.length === 2) {
      q = q.gte('create_time', dateRange.value[0]).lte('create_time', dateRange.value[1] + ' 23:59:59')
    }
    if (typeFilter.value) q = q.eq('type', typeFilter.value)

    const { data, error } = await q
    if (error) throw error

    /* ⚠️ reports 表没有 task_name（那是运单上的），单独查一次 waybills 补上 */
    const list = data || []
    const nos = [...new Set(list.map((r) => r.waybill_no).filter(Boolean))]
    const nameMap = {}
    if (nos.length) {
      try {
        let wq = supabase.from('waybills').select('waybill_no,task_name').in('waybill_no', nos.slice(0, 500))
        wq = scope(wq)
        const { data: wbs } = await wq
        ;(wbs || []).forEach((w) => { if (w.waybill_no) nameMap[w.waybill_no] = w.task_name || '' })
      } catch (e) {
        /* 拿不到就只显示运单号，不影响主流程 */
      }
    }
    raw.value = list.map((r) => ({ ...r, task_name: nameMap[r.waybill_no] || '' }))
  } catch (e) {
    ElMessage.error(e.message || '加载失败')
    raw.value = []
  } finally {
    loading.value = false
  }
}

/** 按运单号聚合：一趟车一行 */
const groups = computed(() => {
  const map = new Map()
  raw.value.forEach((r) => {
    const key = r.waybill_no || ('NO-' + r.id)
    if (!map.has(key)) {
      map.set(key, {
        key,
        waybill_no: r.waybill_no || '',
        task_name: r.task_name || '',
        driver_name: r.driver_name || '',
        plate: r.plate || '',
        items: [],
        total: 0,
        types: [],
        status: '',
        last_time: '',
        flow: [],
        payMethod: '',
        paid_at: '',
        pendingCount: 0,
      })
    }
    const g = map.get(key)
    g.items.push(r)
    g.total += Number(r.amount) || 0
    if (!g.types.includes(r.type)) g.types.push(r.type)
    if (r.status === '审核中' || r.status === '待审核') g.pendingCount += 1
    if (!g.last_time || r.create_time > g.last_time) g.last_time = r.create_time
    if (r.payment && r.payment.method) g.payMethod = r.payment.method
    if (r.paid_at) g.paid_at = r.paid_at
    if (r.flow && r.flow.length && !g.flow.length) g.flow = r.flow
  })

  return [...map.values()].map((g) => {
    /* 状态取「最靠前」的那个：有待审就显示待审，D 一眼看到最急的 */
    const set = new Set(g.items.map((x) => normalizeStatus(x.status)))
    let main = STATUS_ORDER.value[0] || '已上报'
    for (const s of STATUS_ORDER.value) { if (set.has(s)) { main = s; break } }
    return { ...g, status: main }
  })
})

function normalizeStatus(s) {
  const isWaitAudit = s === '审核中' || s === '待审核'

  /* 审批没开：上报即通过，不留在"待审核" */
  if (!auditOn.value) {
    if (isWaitAudit || s === '已通过') return payoutOn.value ? '待打款' : '已上报'
    if (s === '已驳回') return '已上报'
    if (s === '待打款') return '待打款'
    if (s === '已打款') return payoutOn.value ? '已打款' : '已上报'
    return '已上报'
  }

  /* 审批开着：已通过是独立状态，不再并进「待打款」 */
  if (isWaitAudit) return '待审核'
  if (s === '已通过') return '已通过'
  if (s === '待打款') return payoutOn.value ? '待打款' : '已通过'
  if (s === '已打款') return payoutOn.value ? '已打款' : '已通过'
  if (s === '已驳回') return '已驳回'
  return s
}

const filteredRows = computed(() => {
  const kw = keyword.value.trim()
  return groups.value.filter((g) => {
    if (statusFilter.value && g.status !== statusFilter.value) return false
    if (!kw) return true
    return (g.waybill_no || '').includes(kw)
      || (g.driver_name || '').includes(kw)
      || (g.plate || '').includes(kw)
      || (g.task_name || '').includes(kw)
  })
})

const pagedRows = computed(() => {
  const s = (page.value - 1) * pageSize.value
  return filteredRows.value.slice(s, s + pageSize.value)
})

/* 模块开关变了 → 状态枚举会缩，当前选中的状态可能已经不合法，重置掉 */
watch(STATUS_ORDER, (list) => {
  if (statusFilter.value && !list.includes(statusFilter.value)) statusFilter.value = ''
})

const countOf = (k) => {
  if (!k) return groups.value.length
  return groups.value.filter((g) => g.status === k).length
}

/* ================= 展示工具 ================= */
const fmtMoney = (v) => (Number(v) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (v) => (v ? dayjs(v).format('MM-DD HH:mm') : '—')

const statusCls = (s) => ({
  待审核: 'wait', 已通过: 'pass', 待打款: 'pay', 已打款: 'done', 已驳回: 'no',
}[s] || '')

const stepCls = (s) => {
  if (s.status === '已通过') return 'ok'
  if (s.status === '已驳回') return 'no'
  if (s.status === '待处理') return 'wait'
  return ''
}

function itemDesc(it) {
  const p = it.payload || {}
  const parts = []
  if (p.route_from || p.route_to) parts.push(`${p.route_from || ''}${p.route_from && p.route_to ? ' → ' : ''}${p.route_to || ''}`)
  if (p.station) parts.push(p.station)
  if (p.liters) parts.push(`${p.liters}L`)
  if (!parts.length && p.note) parts.push(p.note)
  return parts.length ? parts.join(' · ') + ' · ' + fmtDate(it.create_time) : fmtDate(it.create_time)
}

/* ================= 凭证：key → 临时链接 =================
   ⚠️ reports.images 里存的是 COS 的 `{ key, name, size }`，**不是**能直接塞 <img> 的地址；
      老数据里也可能只剩一串 fileID 或裸字符串，这里统一归一化后再签链接。
      （不签直接用 → 每张都会走 error 插槽，也就是之前"全部显示无图"的原因） */
const imgUrls = ref({})
const imgAt = ref({})               // key → 拿到链接的时间，用于 TTL
const IMG_TTL = 50 * 60 * 1000      // COS 签名 1 小时有效，缓存留 10 分钟余量
const imgLoading = ref(false)

/** 明确是附件（不当图片渲染）的扩展名；判断不出来的一律按图片试 */
const FILE_EXT = /\.(pdf|docx?|xlsx?|csv|zip|rar|7z|txt|ppt|pptx)$/i

function normImgs(raw) {
  const list = Array.isArray(raw) ? raw : []
  return list
    .map((x) => {
      const isStr = typeof x === 'string'
      const direct = isStr ? (/^https?:/i.test(x) ? x : '') : (/^https?:/i.test(x?.url || '') ? x.url : '')
      const key = isStr ? (direct ? '' : x) : (x?.key || x?.fileID || '')
      const id = key || direct
      const name = (!isStr && x?.name) || key || direct || '凭证'
      return { key: id, name, isImage: !FILE_EXT.test(name) }
    })
    .filter((x) => !!x.key)
}

const imgsOf = (it) => normImgs(it && it.images)

/** 抽屉里的费用卡：把每笔费用的凭证就地展开成 { url, isImage, idx }
 *  —— 图片永远跟着它所属的那笔费用，不汇总、不混排。
 *  依赖 imgUrls，所以签名链接一回来会自动重渲染。 */
const curCards = computed(() => {
  const items = (cur.value && cur.value.items) || []
  return items.map((it) => {
    const imgs = imgsOf(it).map((im) => ({
      ...im,
      url: imgUrls.value[im.key] || (/^https?:/i.test(im.key) ? im.key : ''),
    }))
    const previewUrls = imgs.filter((x) => x.isImage && x.url).map((x) => x.url)
    imgs.forEach((x) => { x.idx = Math.max(0, previewUrls.indexOf(x.url)) })
    return { ...it, imgs, previewUrls }
  })
})

async function loadImgUrls(items) {
  const keys = []
  const now = Date.now()
  ;(items || []).forEach((it) => {
    imgsOf(it).forEach((im) => {
      if (!im.key || /^https?:/i.test(im.key)) return
      /* 没签过，或者缓存已经接近签名有效期 → 重新签 */
      if (!imgUrls.value[im.key] || now - (imgAt.value[im.key] || 0) > IMG_TTL) keys.push(im.key)
    })
  })
  if (!keys.length) return
  imgLoading.value = true
  try {
    const map = await signGet([...new Set(keys)])
    const stamp = {}
    Object.keys(map).forEach((k) => { stamp[k] = Date.now() })
    imgUrls.value = { ...imgUrls.value, ...map }
    imgAt.value = { ...imgAt.value, ...stamp }
  } catch (e) {
    console.warn('[费用明细] 凭证临时链接获取失败', e)
  } finally {
    imgLoading.value = false
  }
}

/**
 * 抽屉底部按钮 —— 由「当前状态 × 两个开关」决定：
 *   待审核（审批开）→ 驳回 / 通过（付款也开时多一个「通过并付款」一步到位）
 *   待打款（付款开）→ 通过并付款
 *   已通过 / 已打款 / 已驳回 / 已上报 → 没有可做的动作
 */
const acting = ref(false)
const actingKey = ref('')

const drawerActions = computed(() => {
  const st = cur.value && cur.value.status
  const out = []
  /* 还在等审批：三种动作 */
  if (auditOn.value && st === '待审核') {
    out.push({ key: 'reject', label: '驳回', cls: 'ghost' })
    out.push({ key: 'approve', label: '通过', cls: 'ok' })
    if (payoutOn.value) out.push({ key: 'approvePay', label: '通过并付款', cls: 'warn' })
    return out
  }

  /* 审批过了、只差付款：给一个去付款的入口（「已通过」和「待打款」都算） */
  if (payoutOn.value && (st === '已通过' || st === '待打款')) {
    out.push({ key: 'goPay', label: '去付款', cls: 'warn' })
  }
  return out
})

/** 这笔运单下「还在等审批」的记录 id */
const pendingIdsOf = (row) =>
  (row.items || [])
    .filter((i) => i.status === '审核中' || i.status === '待审核')
    .map((i) => i.id)

/**
 * 统一改状态
 * ⚠️ 写操作同样要挂 owner_account 过滤 —— 只靠"id 来自已过滤的列表"不够，
 *    万一 id 被构造，没有 where 就会改到别人的单子。
 */
async function updateReports(ids, patch) {
  if (!ids.length) return
  let q = supabase.from('reports').update(patch).in('id', ids)
  if (!isAdmin) q = q.eq('owner_account', myAccount)
  const { error } = await q
  if (error) throw error
}

/** 刷新后把抽屉里的 cur 换成最新数据，抽屉保持打开 */
async function refreshAndKeep() {
  const key = cur.value && cur.value.key
  await load()
  if (key) {
    const fresh = groups.value.find((g) => g.key === key)
    cur.value = fresh || null
    if (!fresh) drawer.value = false
    else loadImgUrls(fresh.items)
  }
}

/** 点按钮做动作，不再跳走 */
async function doAction(action) {
  const row = cur.value
  if (!row) return

  /* 已通过 / 待打款 → 直接去付款登记页 */
  if (action === 'goPay') {
    drawer.value = false
    router.push('/fee/payout')
    return
  }

  const ids = pendingIdsOf(row)
  if (!ids.length) {
    ElMessage.info('这笔已经处理过了')
    await refreshAndKeep()
    return
  }

  acting.value = true
  actingKey.value = action
  try {
    if (action === 'reject') {
      const { value } = await ElMessageBox.prompt('填写驳回原因', '驳回', {
        confirmButtonText: '确认驳回',
        cancelButtonText: '取消',
        inputPlaceholder: '比如：票据不清晰、金额与运单不符',
        inputValidator: (v) => (v && v.trim() ? true : '请填写驳回原因'),
      })
      /* reject_reason 不一定是既有列，写不进去就只改状态，别让驳回失败 */
      try {
        await updateReports(ids, {
          status: '已驳回',
          reject_reason: value.trim(),
          update_time: new Date().toISOString(),
        })
      } catch (e) {
        await updateReports(ids, { status: '已驳回', update_time: new Date().toISOString() })
      }
      ElMessage.success('已驳回')
      await refreshAndKeep()
      return
    }

    /* 通过：付款开着 → 待打款；付款关着 → 已通过 */
    const nextStatus = payoutOn.value ? '待打款' : '已通过'
    await updateReports(ids, {
      status: nextStatus,
      update_time: new Date().toISOString(),
    })
    ElMessage.success(action === 'approvePay' ? '已通过，去登记付款' : '已通过')
    await refreshAndKeep()

    if (action === 'approvePay') {
      drawer.value = false
      router.push('/fee/payout')
    }
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error(e.message || '操作失败')
    }
  } finally {
    acting.value = false
    actingKey.value = ''
  }
}

function openDetail(row) {
  cur.value = row
  drawer.value = true
  loadImgUrls(row.items)
}

/* ================= 交互 ================= */
function reload() {
  page.value = 1
  load()
}

function handleReset() {
  dateRange.value = null
  keyword.value = ''
  typeFilter.value = ''
  statusFilter.value = ''
  page.value = 1
  load()
}

onMounted(load)
</script>

<style scoped>
.fee-list-page {
  display: flex; flex-direction: column;
  height: 100%; min-height: 0;
  gap: 12px; padding: 16px 18px;
  box-sizing: border-box;
}

/* 状态标签 */
.fl-tabs { display: flex; gap: 6px; flex-wrap: wrap; padding: 0 2px; }
.fl-tab {
  font: inherit; font-size: 13px; color: #475569;
  background: #fff; border: 1px solid #E6ECF3;
  border-radius: 8px; padding: 6px 13px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px; transition: .15s;
}
.fl-tab:hover { border-color: #CBD5E1; color: #0F172A; }
.fl-tab.on { background: var(--brand-primary); border-color: var(--brand-primary); color: #fff; font-weight: 700; }
.fl-tab-n {
  font-size: 10.5px; font-weight: 700; padding: 0 5px; border-radius: 4px;
  background: rgba(15,23,42,.06); color: inherit;
}
.fl-tab.on .fl-tab-n { background: rgba(255,255,255,.22); }

/* 筛选 */
.fl-filter {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  background: #fff; border: 1px solid #E6ECF3; border-radius: 10px; padding: 12px 14px;
}

/* 工具行 */
.fl-toolbar { display: flex; align-items: center; gap: 10px; padding: 0 2px; }
.tl-bar { width: 3px; height: 15px; border-radius: 2px; background: var(--brand-primary); }
.fl-toolbar h2 { margin: 0; font-size: 14px; font-weight: 800; color: #0F172A; }
.tl-hint { font-size: 11px; color: #B4BECB; }
.fl-toolbar :deep(.table-tools) { margin-left: auto; }

/* 表格卡片 */
.fl-card {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column;
  background: #fff; border: 1px solid #E6ECF3; border-radius: 10px;
  overflow: hidden;
}
.fl-card.is-fullscreen {
  position: fixed; inset: 0; z-index: 2000; border-radius: 0;
}
.fl-pager {
  flex: 0 0 auto; display: flex; justify-content: flex-end;
  padding: 10px 14px; border-top: 1px solid #F1F5F9; background: #fff;
}

/* 单元格 */
/* 表头：12px / 深一档，原来 11px 灰字在浅底上发虚 */
.fl-card :deep(.el-table th.el-table__cell) {
  font-size: 12px;
  color: #475569;
  font-weight: 700;
}
/* 行高松一点，字大了需要呼吸 */
.fl-card :deep(.el-table td.el-table__cell) { padding: 13px 0; }

.cell-amt { display: flex; align-items: baseline; gap: 8px; }
.amt { font-size: 15.5px; font-weight: 800; color: #0F172A; letter-spacing: -.3px; }
.amt-tag {
  font-size: 11px; font-weight: 700; color: #92400E;
  background: #FEF3C7; border-radius: 4px; padding: 2px 7px;
}
.cell-types { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.tp {
  font-size: 11px; font-weight: 600; color: #475569;
  background: #EEF2F7; border-radius: 4px; padding: 2px 7px;
}
.cell-main { font-size: 13px; color: #0F172A; font-weight: 600; }
.cell-sub { font-size: 12px; color: #94A3B8; margin-top: 3px; }
.cell-time { font-size: 12.5px; color: #64748B; }

/* 状态 */
.st { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 700; }
.st i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.st.wait { color: #B45309; }
.st.pay { color: #1D4ED8; }
.st.pass { color: #0E7490; }
.st.done { color: #15803D; }
.st.no { color: #A00D24; }

/* ===== 抽屉 ===== */
.dt { display: flex; flex-direction: column; height: 100%; }
.dt-hd {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 18px 18px 15px; border-bottom: 1px solid #F1F5F9;
}
.dt-t { font-size: 17.5px; font-weight: 800; color: #0F172A; letter-spacing: -.2px; }
.dt-s { font-size: 13.5px; color: #64748B; margin-top: 6px; }
.dt-amt-inline { font-size: 15px; font-weight: 800; color: var(--brand-primary); margin-left: 5px; }
.dt-x { margin-left: auto; color: #C4CDD9; font-size: 21px; cursor: pointer; line-height: 1; }

.dt-body { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 16px 16px; }
.dt-label {
  font-size: 12.5px; font-weight: 800; color: #64748B;
  letter-spacing: .4px; margin-bottom: 9px;
}

/* ===== 每笔费用一张卡（信息 + 自己的凭证，绑在一起） ===== */
.dt-cards { display: flex; flex-direction: column; gap: 10px; }
.fc {
  border: 1px solid #E9EEF5; border-radius: 11px;
  background: #fff; overflow: hidden;
}
.fc-hd { display: flex; align-items: flex-start; gap: 11px; padding: 13px 13px 12px; }
.fc-ico {
  width: 30px; height: 30px; border-radius: 8px; flex: 0 0 auto;
  background: #EEF2F7; color: #475569; font-size: 12.5px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
}
.fc-tt { flex: 1; min-width: 0; }
.fc-t { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.fc-t b { font-size: 14.5px; color: #0F172A; font-weight: 700; }
.fc-st { font-size: 11.5px; }
.fc-d { font-size: 12px; color: #94A3B8; margin-top: 4px; line-height: 1.5; }
.fc-amt { font-size: 16.5px; font-weight: 800; color: #0F172A; letter-spacing: -.3px; white-space: nowrap; }

.fc-vch { border-top: 1px dashed #E9EEF5; background: #FAFBFD; padding: 11px 13px 13px; }
.fc-vch-hd { font-size: 11.5px; font-weight: 700; color: #64748B; letter-spacing: .2px; margin-bottom: 9px; }
.fc-novch { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #94A3B8; }
.fc-novch i { width: 5px; height: 5px; border-radius: 50%; background: #CBD5E1; }

.dt-sum {
  display: flex; justify-content: flex-end; align-items: baseline; gap: 8px;
  margin-top: 12px; padding: 12px 14px; border-radius: 11px;
  background: #F7F9FC; border: 1px solid #EDF1F6;
  font-size: 12.5px; color: #64748B;
}
.dt-sum b { font-size: 20px; color: var(--brand-primary); letter-spacing: -.4px; }

.dt-flow { padding-left: 2px; }
.dt-step { display: flex; gap: 8px; padding: 5px 0; }
.dt-dot {
  width: 7px; height: 7px; border-radius: 50%; margin-top: 5px; flex: 0 0 auto;
  background: #CBD5E1;
}
.dt-dot.ok { background: #15803D; box-shadow: 0 0 0 2.5px rgba(21,128,61,.13); }
.dt-dot.no { background: #A00D24; box-shadow: 0 0 0 2.5px rgba(160,13,36,.13); }
.dt-dot.wait { background: #B45309; box-shadow: 0 0 0 2.5px rgba(180,83,9,.13); }
.dt-step-txt { font-size: 11px; color: #64748B; line-height: 1.6; }
.dt-step-txt b { color: #0F172A; }
.dt-step-txt em { font-style: normal; color: #B4BECB; margin-left: 6px; }
.dt-empty { font-size: 11px; color: #C4CDD9; }

.dt-kv { display: flex; justify-content: space-between; padding: 5px 0; font-size: 11.5px; color: #64748B; }
.dt-kv b { color: #0F172A; font-weight: 700; }

/* 底部操作栏 */
.dt-foot {
  flex: 0 0 auto;
  display: flex; gap: 10px;
  padding: 14px 16px 16px;
  border-top: 1px solid #F1F5F9;
  background: #fff;
}
.dt-foot :deep(.el-button) { flex: 1; margin: 0; height: 44px; font-size: 14px; border-radius: 10px; padding: 0 14px; }
.dt-ghost { background: #fff; border: 1px solid #E2E8F0; color: #64748B; }
/* 通过 = 绿 */
.dt-ok { background: #15803D; border-color: #15803D; color: #fff; font-weight: 700; }
.dt-ok:hover { background: #166534; border-color: #166534; }
/* 通过并付款 = 黄 */
.dt-warn { background: #D97706; border-color: #D97706; color: #fff; font-weight: 700; }
.dt-warn:hover { background: #B45309; border-color: #B45309; }
.dt-main { background: #0F172A; border-color: #0F172A; color: #fff; font-weight: 700; }

.dt-imgs { display: flex; gap: 9px; flex-wrap: wrap; }
.dt-img-err {
  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  font-size: 11px; color: #B4BECB; background: #F7F9FC;
}
.dt-img { width: 76px; height: 76px; border-radius: 9px; border: 1px solid #E9EEF5; background: #fff; cursor: zoom-in; }
/* 链接没签下来 / 签名失败的占位：灰块 + 文字，别留空白 */
.dt-img-ph {
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; color: #B4BECB; background: #F7F9FC; cursor: default;
}
/* 非图片凭证（pdf / 表格等）：可点的文件块 */
.dt-file {
  display: inline-flex; align-items: center; gap: 7px; height: 76px;
  max-width: 100%; padding: 0 12px; border-radius: 9px;
  border: 1px solid #E9EEF5; background: #fff; text-decoration: none;
}
.dt-file-ic {
  width: 24px; height: 24px; border-radius: 6px; flex: 0 0 auto;
  background: #E2E8F0; color: #475569; font-size: 10.5px;
  display: flex; align-items: center; justify-content: center;
}
.dt-file-n {
  font-size: 12px; color: #334155; max-width: 190px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
</style>

<style>
/* ===== 费用明细抽屉：浮岛样式 =====
   el-drawer 默认贴右边通到底、直角、带深遮罩；
   设计稿是「离边 12px 的圆角卡片」，所以要把外壳改掉。
   ⚠️ 抽屉 append-to-body 脱离 scoped，这段必须是全局样式。 */
/* ⚠️ 加 !important：el-drawer 用内联样式设了 top/bottom/height，普通规则盖不住 */
.fee-detail-drawer.el-drawer {
  top: 12px !important;
  bottom: 12px !important;
  right: 12px !important;
  height: auto !important;
  border-radius: 13px !important;
  overflow: hidden;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, .06), 0 20px 50px -10px rgba(15, 23, 42, .3);
}
.fee-detail-drawer .el-drawer__body {
  padding: 0;
  overflow: hidden;
}

/* 遮罩淡一点：设计稿里左边的列表还能看清 */
.el-overlay:has(.fee-detail-drawer) {
  background-color: rgba(15, 23, 42, .14);
}
</style>
