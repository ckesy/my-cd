<template>
  <div class="fee-config-page">
    <!-- 页头 -->
    <div class="fc-head">
      <div class="fc-title">
        <h2>费用审批设置</h2>
        <span class="fc-master">
          <i></i>仅主账号
        </span>
      </div>
      <p class="fc-sub">
        决定司机提交费用上报后要不要走审批、走几级、多少钱必须报到老板。
        <b>改动只影响之后提交的上报</b>，已在审批中的按提交时的快照走完。
      </p>
      <div class="fc-head-actions">
        <span class="fc-updated" v-if="config.updated_at">
          上次修改：{{ config.updated_by || '—' }} · {{ fmtTime(config.updated_at) }}
        </span>
        <el-button type="primary" class="btn-primary" :loading="saving" @click="handleSave">
          保存设置
        </el-button>
      </div>
    </div>

    <!-- 非主账号兜底（正常情况下菜单不会出现） -->
    <el-alert
      v-if="!isMaster"
      title="该页面仅主账号可访问"
      type="error"
      :closable="false"
      show-icon
      description="费用审批的设置只允许主账号修改，请联系主账号。"
      class="fc-alert"
    />

    <el-alert
      v-if="!dbReady"
      title="审批配置表还没有初始化"
      type="warning"
      :closable="false"
      show-icon
      class="fc-alert"
    >
      <template #default>
        当前读不到 <code>fee_approval_configs</code>，页面用的是默认值，保存会失败。
        请先执行项目根目录的 <code>db_migration_fee_approval.sql</code>。
      </template>
    </el-alert>

    <div class="fc-grid">
      <!-- 左列 -->
      <div class="fc-main">
        <!-- ① 策略 -->
        <section class="fc-card">
          <header class="fc-card-head">
            <b>① 策略模式</b>
            <span>决定新运单默认是否走审批</span>
          </header>

          <div class="fc-modes">
            <button
              v-for="m in MODES"
              :key="m.value"
              type="button"
              class="fc-mode"
              :class="{ on: config.mode === m.value }"
              @click="config.mode = m.value"
            >
              <span class="fc-radio"></span>
              <b>{{ m.label }}</b>
              <em>{{ m.desc }}</em>
            </button>
          </div>

          <div v-if="config.mode === 'custom'" class="fc-custom">
            <span class="fc-k">新建运单默认</span>
            <el-radio-group v-model="config.custom_default" size="small">
              <el-radio-button :value="true">开启</el-radio-button>
              <el-radio-button :value="false">关闭</el-radio-button>
            </el-radio-group>

            <span class="fc-divider"></span>

            <span class="fc-k">允许发单人在建单时调整单票</span>
            <el-switch v-model="config.allow_creator_toggle" size="small" />
            <span class="fc-hint">默认关，避免层层开口子</span>
          </div>
        </section>

        <!-- ② 金额阈值 -->
        <section class="fc-card">
          <header class="fc-card-head">
            <b>② 金额阈值</b>
            <span>达到就必须送老板终审</span>
          </header>

          <div class="fc-threshold">
            <div class="fc-money">
              <span>¥</span>
              <el-input-number
                v-model="config.threshold"
                :min="0"
                :max="1000000"
                :step="500"
                controls-position="right"
                size="default"
                style="width: 150px"
              />
            </div>
            <div class="fc-quick">
              <button
                v-for="v in QUICK_THRESHOLDS"
                :key="v.value"
                type="button"
                class="fc-chip"
                :class="{ on: Number(config.threshold) === v.value }"
                @click="config.threshold = v.value"
              >
                {{ v.label }}
              </button>
            </div>
          </div>

          <p class="fc-note">
            按<b>单笔费用合计</b>判断；驳回后金额改了会重新判断。
            主账号自己发单时三级与一级同人，自动去重 —— 由财务终审。填 0 表示不按金额强制。
          </p>
        </section>

        <!-- ③ 审批人 -->
        <section class="fc-card">
          <header class="fc-card-head">
            <b>③ 审批人</b>
            <span>选好即每单默认，单票可临时改</span>
          </header>

          <div class="fc-levels">
            <!-- 一级 -->
            <div class="fc-level">
              <span class="fc-no one">1</span>
              <div class="fc-level-main">
                <div class="fc-level-title">
                  <b>一级审批</b>
                  <el-tag size="small" effect="plain" type="info">可跳过</el-tag>
                </div>
                <div class="fc-level-row">
                  <el-select
                    v-model="config.l1_user_id"
                    clearable
                    placeholder="跟随发单人"
                    size="small"
                    style="width: 220px"
                  >
                    <el-option :value="null" label="跟随发单人（默认）" />
                    <el-option
                      v-for="u in userOptions"
                      :key="'l1-' + u.id"
                      :value="u.id"
                      :label="userLabel(u)"
                    />
                  </el-select>

                  <el-radio-group v-model="config.l1_mode" size="small">
                    <el-radio-button value="self">由我审</el-radio-button>
                    <el-radio-button value="skip">免审直送</el-radio-button>
                  </el-radio-group>
                </div>
                <p class="fc-level-hint">
                  发单人 = 运单创建人；主账号创建的单，一级就是主账号本人。
                </p>
              </div>
            </div>

            <!-- 二级 -->
            <div class="fc-level">
              <span class="fc-no two">2</span>
              <div class="fc-level-main">
                <div class="fc-level-title">
                  <b>二级审批</b>
                  <el-tag size="small" effect="plain" type="primary">财务</el-tag>
                </div>
                <div class="fc-level-row">
                  <el-select
                    v-model="config.l2_user_id"
                    clearable
                    placeholder="选择本机构财务"
                    size="small"
                    style="width: 220px"
                  >
                    <el-option
                      v-for="u in financeOptions"
                      :key="'l2-' + u.id"
                      :value="u.id"
                      :label="userLabel(u)"
                    />
                  </el-select>

                  <span class="fc-inline-switch">
                    <el-switch v-model="config.require_owner" size="small" />
                    允许财务「通过并送老板终审」
                  </span>
                </div>
                <p class="fc-level-hint" v-if="!financeOptions.length">
                  本机构还没有财务角色账号，二级会自动顶到主账号。
                </p>
                <p class="fc-level-hint" v-else>
                  财务在审批时可以单次勾选「送老板」，不改变这里的默认。
                </p>
              </div>
            </div>

            <!-- 三级 -->
            <div class="fc-level">
              <span class="fc-no three">3</span>
              <div class="fc-level-main">
                <div class="fc-level-title">
                  <b>三级审批（主账号）</b>
                  <el-tag size="small" effect="plain">按条件触发</el-tag>
                </div>
                <div class="fc-level-row">
                  <el-input :model-value="ownerName" size="small" disabled style="width: 220px" />
                  <span class="fc-level-cond">
                    {{ Number(config.threshold) > 0 ? `金额 ≥ ¥${fmtNum(config.threshold)} 触发` : '不按金额触发' }}
                  </span>
                </div>
                <p class="fc-level-hint">
                  主账号同时是一级时，本级自动跳过，不重复审。
                </p>
              </div>
            </div>
          </div>
        </section>

        <!-- ④ 功能模块 -->
        <section class="fc-card">
          <header class="fc-card-head">
            <b>④ 功能模块</b>
            <span>按客户开关；关掉之后界面完全看不到，不是灰掉</span>
          </header>

          <div class="fc-module">
            <div class="fc-module-main">
              <b>付款登记</b>
              <em>审批通过后登记付款、上传付款凭据、撤销付款。关掉后菜单、运单详情的入口和顶栏待办数字都会消失。</em>
            </div>
            <el-switch
              v-model="payoutEnabled"
              :loading="moduleSaving"
              active-text="已开通"
              inactive-text="未开通"
              @change="onTogglePayout"
            />
          </div>

          <div v-if="moduleFailed" class="fc-module-warn">
            读不到 <code>tenant_modules</code>，当前按「已开通」降级显示。请先执行
            <code>db_migration_modules_payment.sql</code>。
          </div>
        </section>
        <!-- ⑤ 流程预览：改配置立刻能看到一笔单会怎么走 -->
        <section class="fc-card pv-card">
          <header class="fc-card-head">
            <b>⑤ 完整链路（含付款）</b>
            <span>上一栏只看策略；这里连付款环节一起推演</span>
          </header>

          <div class="pv-amount">
            <span class="pv-l">试算金额</span>
            <el-input-number v-model="previewAmount" :min="0" :step="100" :controls="false"
              size="small" style="width:130px" />
            <span class="pv-hint">改金额看是否触发老板终审</span>
          </div>

          <div class="pv-flow">
            <template v-for="(st, i) in previewSteps" :key="i">
              <div class="pv-node" :class="'k-' + st.kind">
                <span class="pv-t">{{ st.text }}</span>
                <em v-if="st.note" class="pv-n">{{ st.note }}</em>
              </div>
              <span v-if="i < previewSteps.length - 1" class="pv-ar">›</span>
            </template>
          </div>

          <div class="pv-foot">
            <span>最终状态：<b>{{ previewEnd }}</b></span>
            <span v-if="payoutEnabled" class="pv-fin">财务端可见 · 待登记有入口</span>
            <span v-else class="pv-nofin">财务端只有审批，没有付款</span>
          </div>

          <p class="fc-note" v-if="config.mode === 'custom'">
            自定义模式下每张单可单独覆盖，以上按<b>默认值</b>推演；单票设成「不审」则不经过任何一级。
          </p>
        </section>
      </div>

      <!-- 右列 -->
      <aside class="fc-side">
        <section class="fc-side-card">
          <header class="fc-side-head">同一套设置，两笔单的结果</header>

          <div class="fc-preview">
            <div class="fc-preview-amount">调度发单 · 合计 ¥800</div>
            <div class="fc-chain">
              <template v-for="(n, i) in buildChain(800)" :key="'a' + i">
                <span class="fc-node" :class="n.kind">{{ n.label }}</span>
                <span v-if="i < buildChain(800).length - 1" class="fc-arrow">→</span>
              </template>
            </div>
          </div>

          <div class="fc-preview">
            <div class="fc-preview-amount">
              调度发单 · 合计 ¥{{ fmtNum(thresholdProbe) }}
              <span v-if="Number(config.threshold) > 0">（≥ 阈值）</span>
            </div>
            <div class="fc-chain">
              <template v-for="(n, i) in buildChain(thresholdProbe)" :key="'b' + i">
                <span class="fc-node" :class="n.kind">{{ n.label }}</span>
                <span v-if="i < buildChain(thresholdProbe).length - 1" class="fc-arrow">→</span>
              </template>
            </div>
          </div>
        </section>

        <section class="fc-side-card">
          <header class="fc-side-head">生效规则</header>
          <ul class="fc-rules">
            <li>同一人不重复出现在两级</li>
            <li>审批人失效 → 同角色顶替</li>
            <li>自己报的单跳过自己这一级</li>
            <li>未配置财务 → 二级顶成主账号</li>
          </ul>
          <div class="fc-side-tip">
            提交时校验审批人是否在职；审批中被停用会标「审批人已变更」。
          </div>
        </section>

        <section class="fc-side-card" v-if="config.updated_at">
          <header class="fc-side-head">修改留痕</header>
          <div class="fc-history">
            <div class="fc-history-row">
              <span>{{ fmtTime(config.updated_at) }}</span>
              <b>{{ config.updated_by || '—' }}</b>
            </div>
            <div class="fc-history-note">
              策略 {{ modeLabel(config.mode) }} · 阈值 ¥{{ fmtNum(config.threshold) }}
            </div>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import { supabase } from '@/utils/supabase'
import { MODULE_PAYOUT, moduleFlags, ensureModuleFlags, setModuleFlag } from '@/utils/modules'

/* ============================================================
   当前用户
   ============================================================ */
const currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('currentUser') || 'null') } catch { return null }
})()

const isMaster = computed(() => {
  if (!currentUser) return false
  if (currentUser.role === 'admin') return true
  return currentUser.role === 'customer' && !currentUser.isSubAccount
})

// 主账号账号：子账号存的是主账号；主账号存自己
const ownerAccount = computed(() => {
  if (!currentUser) return ''
  return currentUser.role === 'admin'
    ? (currentUser.account || '')
    : (currentUser.masterAccount || currentUser.account || '')
})

const ownerName = computed(() => {
  if (!currentUser) return '主账号'
  return currentUser.masterName || currentUser.name || currentUser.account || '主账号'
})

/* ============================================================
   配置
   ============================================================ */
const MODES = [
  { value: 'on', label: '全局开启', desc: '所有运单都走审批，单票不可关' },
  { value: 'off', label: '全局关闭', desc: '提交即通过，不做审批' },
  { value: 'custom', label: '自定义', desc: '每单可开可关，按默认值新建' },
]

const QUICK_THRESHOLDS = [
  { label: '3,000', value: 3000 },
  { label: '5,000', value: 5000 },
  { label: '10,000', value: 10000 },
  { label: '不启用', value: 0 },
]

const DEFAULTS = {
  mode: 'on',
  custom_default: true,
  allow_creator_toggle: false,
  threshold: 5000,
  l1_mode: 'self',
  l1_user_id: null,
  l2_user_id: null,
  require_owner: false,
  updated_by: '',
  updated_at: '',
}

/* ============================================================
   功能模块（客户级开关）
   目前只有「付款登记」；以后加模块就往 tenant_modules 加 key。
   ============================================================ */
const payoutEnabled = ref(false)
const moduleSaving = ref(false)
const moduleFailed = computed(() => moduleFlags.failed)

async function onTogglePayout(val) {
  if (!isMaster.value) {
    payoutEnabled.value = !val
    ElMessage.error('仅主账号可修改模块开关')
    return
  }
  moduleSaving.value = true
  try {
    await setModuleFlag(MODULE_PAYOUT, val, currentUser)
    ElMessage.success(
      val
        ? '已开通「付款登记」'
        : '已关闭「付款登记」：菜单、运单入口与顶栏待办会立即消失'
    )
  } catch (e) {
    payoutEnabled.value = !val
    console.error('[功能模块] 保存失败', e)
    ElMessage.error(
      '保存失败：' +
      ((e && e.message) || '') +
      (String((e && e.message) || '').includes('tenant_modules')
        ? '（请先执行 db_migration_modules_payment.sql）'
        : '')
    )
  } finally {
    moduleSaving.value = false
  }
}

const config = reactive({ ...DEFAULTS })

/* ============ 流程预览 ============
   口径与云函数 buildFlow 一致：
     一级 = 发单人（l1_mode='skip' 时免审）
     二级 = 财务（同人去重）
     三级 = 老板：require_owner 为真，或 金额 ≥ threshold
   注意 threshold 决定的是「要不要老板终审」，不是「要不要审批」 */
const previewAmount = ref(800)

const previewSteps = computed(() => {
  const out = []
  if (config.mode === 'off') {
    out.push({ text: '提交即通过', kind: 'skip', note: '全局关闭，不建审批链' })
  } else {
    if (config.l1_mode === 'skip') {
      out.push({ text: '一级免审', kind: 'skip', note: '配置跳过' })
    } else {
      out.push({ text: '发单人审批', kind: 'step', note: '一级' })
    }
    out.push({ text: '财务审批', kind: 'step', note: '二级' })

    const th = Number(config.threshold) || 0
    const needOwner =
      config.require_owner === true || (th > 0 && Number(previewAmount.value) >= th)
    if (needOwner) {
      out.push({
        text: '老板终审',
        kind: 'step',
        note: config.require_owner === true
          ? '配置要求'
          : `≥ ¥${Number(th).toLocaleString()}`,
      })
    } else if (th > 0) {
      out.push({ text: '不到阈值，无老板终审', kind: 'muted', note: `< ¥${Number(th).toLocaleString()}` })
    }
  }

  out.push({
    text: payoutEnabled.value ? '待打款' : '已通过',
    kind: 'end',
    note: payoutEnabled.value ? '等财务登记' : '终态',
  })
  if (payoutEnabled.value) {
    out.push({ text: '登记付款', kind: 'fin', note: '已打款' })
  }
  return out
})

const previewEnd = computed(() => (payoutEnabled.value ? '已打款' : '已通过'))
const dbReady = ref(true)
const saving = ref(false)
const users = ref([])
const roles = ref([])

/* ============================================================
   审批人候选
   ============================================================ */
const userOptions = computed(() => users.value)
const financeOptions = computed(() => {
  const financeRoleIds = new Set(
    roles.value
      .filter((r) => String(r.name || '').includes('财务'))
      .map((r) => Number(r.id))
  )
  const list = users.value.filter((u) => financeRoleIds.has(Number(u.role_id)))
  return list.length ? list : users.value
})

function userLabel(u) {
  const roleName = roles.value.find((r) => Number(r.id) === Number(u.role_id))?.name
  return `${u.name || u.account}${roleName ? ' · ' + roleName : ''}`
}

function nameOf(id) {
  if (!id) return ''
  const u = users.value.find((x) => Number(x.id) === Number(id))
  return u ? (u.name || u.account) : ''
}

/* ============================================================
   链路预览（与云函数规则同口径）
   ============================================================ */
function buildChain(amount) {
  if (config.mode === 'off') {
    return [{ label: '免审 · 直接通过', kind: 'ok' }]
  }

  const chain = []

  // 一级
  if (config.l1_mode === 'skip') {
    chain.push({ label: '一级 免审', kind: 'skip' })
  } else {
    const who = config.l1_user_id ? nameOf(config.l1_user_id) : '发单人'
    chain.push({ label: `1 · ${who}`, kind: 'one' })
  }

  // 二级：没配财务时直接顶成主账号
  const l2Name = nameOf(config.l2_user_id)
  const l2IsOwner = !l2Name
  chain.push(
    l2Name
      ? { label: `2 · ${l2Name}`, kind: 'two' }
      : { label: `2 · ${ownerName.value}（未配财务）`, kind: 'two' }
  )

  // 三级：财务已顶成主账号时不再重复
  const needOwner =
    !l2IsOwner &&
    (config.require_owner || (Number(config.threshold) > 0 && Number(amount) >= Number(config.threshold)))
  if (needOwner) {
    chain.push({ label: `3 · ${ownerName.value}`, kind: 'three' })
  }

  // 同一个人的相邻两级去重
  const dedup = []
  chain.forEach((n) => {
    const prev = dedup[dedup.length - 1]
    const same = prev && prev.label.split('·').pop().trim() === n.label.split('·').pop().trim()
    if (!same) dedup.push(n)
  })
  return dedup
}

const thresholdProbe = computed(() => {
  const t = Number(config.threshold) || 0
  return t > 0 ? t + 1200 : 6200
})

function modeLabel(v) {
  return MODES.find((m) => m.value === v)?.label || v
}

function fmtNum(v) {
  return Number(v || 0).toLocaleString('en-US')
}

function fmtTime(v) {
  if (!v) return '—'
  const d = dayjs(v)
  return d.isValid() ? d.format('MM-DD HH:mm') : String(v)
}

/* ============================================================
   读取
   ============================================================ */
async function loadUsers() {
  if (!ownerAccount.value) return
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, account, name, role_id, owner_account, org_id, status')
      .or(`owner_account.eq.${ownerAccount.value},account.eq.${ownerAccount.value}`)
      .limit(200)
    if (error) throw error
    users.value = Array.isArray(data) ? data : []
  } catch (e) {
    console.warn('[费用审批] 读取用户失败', e)
  }

  try {
    const { data, error } = await supabase
      .from('roles')
      .select('id, name, code')
      .limit(100)
    if (error) throw error
    roles.value = Array.isArray(data) ? data : []
  } catch (e) {
    console.warn('[费用审批] 读取角色失败', e)
  }
}

async function loadConfig() {
  if (!ownerAccount.value) {
    dbReady.value = false
    return
  }
  try {
    const { data, error } = await supabase
      .from('fee_approval_configs')
      .select('*')
      .eq('owner_account', ownerAccount.value)
      .maybeSingle()

    if (error) throw error
    if (data) {
      Object.assign(config, {
        mode: data.mode || 'on',
        custom_default: data.custom_default !== false,
        allow_creator_toggle: data.allow_creator_toggle === true,
        threshold: Number(data.threshold ?? 5000),
        l1_mode: data.l1_mode === 'skip' ? 'skip' : 'self',
        l1_user_id: data.l1_user_id ?? null,
        l2_user_id: data.l2_user_id ?? null,
        require_owner: data.require_owner === true,
        updated_by: data.updated_by || '',
        updated_at: data.updated_at || '',
      })
    }
  } catch (e) {
    console.warn('[费用审批] 读取配置失败（表可能未建）', e)
    dbReady.value = false
  }
}

/* ============================================================
   保存
   ============================================================ */
async function handleSave() {
  if (!isMaster.value) {
    ElMessage.error('仅主账号可修改费用审批设置')
    return
  }
  if (!dbReady.value) {
    ElMessage.error('审批配置表未初始化，请先执行 db_migration_fee_approval.sql')
    return
  }

  const prevMode = config.mode
  if (prevMode === 'off') {
    try {
      await ElMessageBox.confirm(
        '切换为「全局关闭」后，新提交的费用上报不再审批，司机提交即视为通过；已在审批中的会按原流程走完。',
        '确认关闭费用审批？',
        { confirmButtonText: '确认切换', cancelButtonText: '取消', type: 'warning' }
      )
    } catch {
      return
    }
  }

  saving.value = true
  try {
    const payload = {
      owner_account: ownerAccount.value,
      mode: config.mode,
      custom_default: config.custom_default,
      allow_creator_toggle: config.allow_creator_toggle,
      threshold: Number(config.threshold) || 0,
      l1_mode: config.l1_mode,
      l1_user_id: config.l1_user_id || null,
      l2_user_id: config.l2_user_id || null,
      require_owner: config.require_owner,
      updated_by: currentUser?.name || currentUser?.account || '',
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('fee_approval_configs')
      .upsert(payload, { onConflict: 'owner_account' })
    if (error) throw error

    Object.assign(config, {
      updated_by: payload.updated_by,
      updated_at: payload.updated_at,
    })
    ElMessage.success('已保存，之后提交的费用上报按新设置执行')
  } catch (e) {
    console.error('[费用审批] 保存失败', e)
    ElMessage.error('保存失败：' + (e?.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  if (!isMaster.value) return
  await loadUsers()
  await loadConfig()
  await ensureModuleFlags(currentUser, { force: true })
  payoutEnabled.value = moduleFlags.payout === true
})
</script>

<style scoped>
.fee-config-page {
  min-height: 100%;
  padding: 20px 24px 34px;
  box-sizing: border-box;
}

/* ===== 页头 ===== */
.fc-head {
  position: relative;
  background: #fff;
  border: 1px solid var(--border-base);
  border-radius: 14px;
  padding: 16px 18px;
  margin-bottom: 14px;
  overflow: hidden;
}

.fc-head::after {
  content: '';
  position: absolute;
  right: -40px;
  top: -60px;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(200, 16, 46, .06), transparent 68%);
  pointer-events: none;
}

.fc-title {
  display: flex;
  align-items: center;
  gap: 9px;
}

.fc-title h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.fc-master {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #0F172A;
  color: #fff;
  font-size: 10.5px;
  font-weight: 600;
  border-radius: 5px;
  padding: 2px 7px;
  letter-spacing: .3px;
}

.fc-master i {
  width: 7px;
  height: 7px;
  border: 1.4px solid currentColor;
  border-radius: 2px;
  position: relative;
}

.fc-master i::after {
  content: '';
  position: absolute;
  left: 1.2px;
  top: -4px;
  width: 4px;
  height: 3px;
  border: 1.4px solid currentColor;
  border-bottom: none;
  border-radius: 3px 3px 0 0;
}

.fc-sub {
  margin: 6px 0 0;
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--text-tertiary);
  max-width: 820px;
}

.fc-sub b {
  color: var(--text-secondary);
}

.fc-head-actions {
  position: absolute;
  right: 18px;
  top: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.fc-updated {
  font-size: 11.5px;
  color: var(--text-placeholder);
}

.fc-alert {
  margin-bottom: 12px;
}

.fc-alert code {
  background: #F8FAFC;
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 11.5px;
}

/* ===== 布局 ===== */
.fc-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 330px;
  gap: 14px;
  align-items: start;
}

.fc-main {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.fc-card {
  background: #fff;
  border: 1px solid var(--border-base);
  border-radius: 12px;
  padding: 14px 16px;
}

.fc-card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 11px;
}

.fc-card-head b {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.fc-card-head span {
  font-size: 11.5px;
  color: var(--text-placeholder);
}

/* ===== 功能模块开关 ===== */
.fc-module {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid var(--border-base);
  border-radius: 10px;
  background: #FAFBFC;
}

.fc-module-main {
  flex: 1;
  min-width: 0;
}

.fc-module-main b {
  display: block;
  font-size: 13px;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.fc-module-main em {
  font-style: normal;
  font-size: 11.5px;
  color: var(--text-placeholder);
  line-height: 1.7;
}

.fc-module-warn {
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #FFFBEB;
  border: 1px solid #FDE68A;
  font-size: 11.5px;
  color: #92400E;
  line-height: 1.7;
}

/* ===== 模式卡 ===== */
.fc-modes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 9px;
}

.fc-mode {
  text-align: left;
  border: 1px solid var(--border-base);
  background: #fff;
  border-radius: 10px;
  padding: 10px 11px;
  cursor: pointer;
  transition: all .18s cubic-bezier(.22, 1, .36, 1);
  font-family: inherit;
}

.fc-mode:hover {
  border-color: #F3C6CF;
  transform: translateY(-1px);
}

.fc-mode.on {
  border-color: #c8102e;
  background: #FFF9FA;
  box-shadow: 0 0 0 3px rgba(200, 16, 46, .05);
}

.fc-radio {
  display: inline-block;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 1.5px solid #CBD5E1;
  vertical-align: -1px;
  margin-right: 6px;
}

.fc-mode.on .fc-radio {
  border-color: #c8102e;
  background: #c8102e;
  box-shadow: inset 0 0 0 2.5px #fff;
}

.fc-mode b {
  font-size: 12.5px;
  color: var(--text-primary);
}

.fc-mode em {
  display: block;
  font-style: normal;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-placeholder);
  margin-top: 5px;
}

.fc-custom {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
  margin-top: 12px;
  padding-top: 11px;
  border-top: 1px dashed var(--border-base);
}

.fc-k {
  font-size: 12px;
  color: var(--text-tertiary);
}

.fc-divider {
  width: 1px;
  height: 14px;
  background: var(--border-base);
  margin: 0 3px;
}

.fc-hint {
  font-size: 11px;
  color: var(--text-placeholder);
}

/* ===== 阈值 ===== */
.fc-threshold {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.fc-money {
  display: flex;
  align-items: center;
  gap: 5px;
}

.fc-money > span {
  font-size: 13px;
  font-weight: 600;
  color: #c8102e;
}

.fc-quick {
  display: flex;
  gap: 6px;
}

.fc-chip {
  border: 1px solid var(--border-base);
  background: #F8FAFC;
  color: var(--text-tertiary);
  border-radius: 6px;
  font-size: 11.5px;
  padding: 4px 10px;
  cursor: pointer;
  font-family: inherit;
  transition: all .16s;
}

.fc-chip:hover {
  border-color: #F3C6CF;
  color: #c8102e;
}

.fc-chip.on {
  background: #FEF2F2;
  border-color: #FBD5DB;
  color: #c8102e;
  font-weight: 600;
}

.fc-note {
  margin: 9px 0 0;
  font-size: 11.5px;
  line-height: 1.75;
  color: var(--text-placeholder);
}

.fc-note b {
  color: var(--text-secondary);
}

/* ===== 审批人 ===== */
.fc-levels {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fc-level {
  display: flex;
  gap: 10px;
}

.fc-no {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-size: 10.5px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 1px;
}

.fc-no.one { background: #FEF2F2; color: #c8102e; }
.fc-no.two { background: #EFF6FF; color: #1D4ED8; }
.fc-no.three { background: #F5F3FF; color: #6D28D9; }

.fc-level-main {
  flex: 1;
  min-width: 0;
}

.fc-level-title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 7px;
}

.fc-level-title b {
  font-size: 12.5px;
  font-weight: 600;
}

.fc-level-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.fc-inline-switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.fc-level-hint {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--text-placeholder);
  line-height: 1.65;
}

.fc-level-cond {
  font-size: 11.5px;
  color: var(--text-tertiary);
}

/* ===== 右列 ===== */
.fc-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fc-side-card {
  background: #fff;
  border: 1px solid var(--border-base);
  border-radius: 12px;
  padding: 13px 14px;
}

.fc-side-head {
  font-size: 11.5px;
  color: var(--text-placeholder);
  margin-bottom: 9px;
}

.fc-preview {
  background: #F8FAFC;
  border: 1px solid var(--border-light);
  border-radius: 9px;
  padding: 9px 10px;
  margin-bottom: 8px;
}

.fc-preview:last-child {
  margin-bottom: 0;
}

.fc-preview-amount {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-bottom: 7px;
}

.fc-chain {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
}

.fc-node {
  font-size: 10.5px;
  border: 1px solid var(--border-base);
  border-radius: 6px;
  padding: 3px 7px;
  background: #fff;
  white-space: nowrap;
}

.fc-node.one { border-color: #FBD5DB; background: #FEF2F2; color: #c8102e; font-weight: 600; }
.fc-node.two { border-color: #DBEAFE; background: #EFF6FF; color: #1D4ED8; font-weight: 600; }
.fc-node.three { border-color: #E9D5FF; background: #F5F3FF; color: #6D28D9; font-weight: 600; }
.fc-node.skip { color: var(--text-placeholder); text-decoration: line-through; }
.fc-node.ok { border-color: #BBF7D0; background: #F0FDF4; color: #15803D; font-weight: 600; }

.fc-arrow {
  color: #CBD5E1;
  font-size: 11px;
}

.fc-rules {
  margin: 0;
  padding-left: 16px;
}

.fc-rules li {
  font-size: 11.5px;
  line-height: 1.9;
  color: var(--text-tertiary);
}

.fc-side-tip {
  margin-top: 9px;
  padding-top: 9px;
  border-top: 1px dashed var(--border-base);
  font-size: 11px;
  line-height: 1.7;
  color: var(--text-placeholder);
}

.fc-history-row {
  display: flex;
  justify-content: space-between;
  font-size: 11.5px;
  color: var(--text-tertiary);
  margin-bottom: 4px;
}

.fc-history-row b {
  color: var(--text-secondary);
  font-weight: 600;
}

.fc-history-note {
  font-size: 11px;
  color: var(--text-placeholder);
}

@media (max-width: 1100px) {
  .fc-grid { grid-template-columns: 1fr; }
  .fc-head-actions { position: static; margin-top: 12px; }
}

/* ⑤ 流程预览 */
.pv-card { border-color: #FBD5DB; background: #FFFCFD; }
.pv-amount {
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 16px; flex-wrap: wrap;
}
.pv-l { font-size: 12px; color: #64748B; }
.pv-hint { font-size: 11px; color: #A9B4C2; }

.pv-flow {
  display: flex; align-items: center; gap: 6px;
  flex-wrap: wrap; padding: 4px 0 14px;
}
.pv-node {
  position: relative;
  padding: 8px 12px;
  border-radius: 9px;
  background: #fff;
  border: 1px solid #E4EBF3;
  min-width: 92px;
  text-align: center;
}
.pv-node .pv-t { display: block; font-size: 12px; font-weight: 700; color: #0F172A; }
.pv-node .pv-n { display: block; font-style: normal; font-size: 9.5px; color: #94A3B8; margin-top: 2px; }
.pv-node.k-step { border-color: #CBD5E1; }
.pv-node.k-skip { background: #F8FAFC; }
.pv-node.k-skip .pv-t { color: #94A3B8; }
.pv-node.k-muted { background: #FBFCFE; border-style: dashed; }
.pv-node.k-muted .pv-t { color: #A9B4C2; font-weight: 600; }
.pv-node.k-end { border-color: #BBF7D0; background: #F0FDF4; }
.pv-node.k-end .pv-t { color: #15803D; }
.pv-node.k-fin { border-color: #BFDBFE; background: #EFF6FF; }
.pv-node.k-fin .pv-t { color: #1D4ED8; }
.pv-ar { color: #CBD5E1; font-size: 16px; }

.pv-foot {
  display: flex; align-items: center; gap: 12px;
  font-size: 12px; color: #64748B;
  padding-top: 12px; border-top: 1px dashed #F1F4F8;
}
.pv-foot b { color: #0F172A; }
.pv-fin { font-size: 11px; color: #1D4ED8; background: #EFF6FF; padding: 2px 8px; border-radius: 5px; }
.pv-nofin { font-size: 11px; color: #92400E; background: #FEF3C7; padding: 2px 8px; border-radius: 5px; }

</style>
