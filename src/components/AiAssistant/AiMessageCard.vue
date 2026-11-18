<template>
  <div class="ai-card" v-if="safeCard">
    <div class="ch">
      <span class="t">{{ safeCard.title || '查询结果' }}</span>
      <span v-if="safeCard.stat" class="n">
        {{ safeCard.stat.label }} <b>{{ money(safeCard.stat.value) }}</b>
      </span>
    </div>

    <!-- 表格 -->
    <div v-if="safeCard.type === 'table'" class="tbl-wrap">
      <table class="tbl">
        <thead>
          <tr>
            <th v-for="c in cols" :key="c.key" :class="c.align">{{ c.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="i">
            <td v-for="c in cols" :key="c.key" :class="[c.align, { num: c.money || c.align === 'right' }]">
              <span v-if="c.money">{{ money(r[c.key]) }}</span>
              <span v-else-if="c.key === 'status'" class="st" :class="statusCls(r[c.key])">
                <i></i>{{ r[c.key] }}
              </span>
              <span v-else :class="{ hi: c.highlight && isHigh(r[c.key]) }">{{ c.key === 'type' ? typeName(r[c.key]) : fmt(r[c.key]) }}</span>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td :colspan="cols.length || 1" class="empty">没有查到记录</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 待办 -->
    <div v-else-if="safeCard.type === 'todo'" class="todo-list">
      <div v-for="(r, i) in rows" :key="i" class="todo">
        <div class="info">
          <div class="t1">{{ r.plate || '—' }} · {{ typeName(r.type) }}</div>
          <div class="t2">{{ fmtTime(r.createTime) }}<template v-if="r.driverName"> · {{ r.driverName }}</template></div>
        </div>
        <div class="amt">{{ money(r.amount) }}</div>
        <button class="go" @click="goRow(r)">去审批</button>
      </div>
      <div v-if="!rows.length" class="empty">当前没有待你处理的事项</div>
    </div>

    <div v-if="safeCard.note" class="note">{{ safeCard.note }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  card: { type: Object, required: true },
})
const emit = defineEmits(['navigate'])

/* 一道硬防御：卡片可能是从 localStorage 恢复的旧数据 / 结构不全的数据，
   模板里直接写 card.cols.length 会抛错，而子组件渲染抛错会让整页白屏。 */
const safeCard = computed(() => (props.card && typeof props.card === 'object' ? props.card : null))
const cols = computed(() =>
  Array.isArray(props.card && props.card.cols) ? props.card.cols.filter((c) => c && c.key) : []
)
const rows = computed(() =>
  Array.isArray(props.card && props.card.rows) ? props.card.rows.filter((r) => r && typeof r === 'object') : []
)

const TYPE_NAME = {
  expense: '支出',
  subsidy: '补贴',
  loan: '借款',
  violation: '违章',
}

const typeName = (t) => TYPE_NAME[t] || t || '费用'

const money = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const fmt = (v) => (v == null || v === '' ? '—' : String(v))

const fmtTime = (v) => {
  if (!v) return '—'
  const s = String(v).replace('T', ' ')
  return s.slice(5, 16)
}

/** 能耗类把偏高的标红，但不用品牌红（品牌红留给品牌动作） */
const isHigh = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 65
}

const statusCls = (s) => {
  const t = String(s || '')
  if (/待审核|审核中/.test(t)) return 'wait'
  if (/已通过|已完成/.test(t)) return 'ok'
  if (/驳回|取消/.test(t)) return 'no'
  if (/待打款|已打款|待接单|待装车|已发车|已到达/.test(t)) return 'blue'
  return ''
}

/**
 * 单行「去审批」
 * ⚠️ 必须只带这一行自己的 id。之前所有行都传 card.jump（含全部 10 笔），
 *    结果点哪一笔都跳到同一批、闪的也永远是同一批行。
 */
const goRow = (r) => {
  const path = (props.card.jump && props.card.jump.path) || '/fee/list'
  if (r && r.id != null) {
    emit('navigate', { path, query: { ids: String(r.id) } })
    return
  }
  if (props.card.jump) emit('navigate', props.card.jump)
}

const go = (jump) => {
  if (jump && jump.path) emit('navigate', jump)
}
</script>

<style scoped>
.ai-card {
  border: 1px solid var(--line2, #e3e8ef);
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
  width: 100%;
}
.ch {
  height: 30px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  background: var(--thead, #f7f9fc);
  border-bottom: 1px solid var(--line, #edf0f4);
  font-size: 11px;
  color: var(--ink2, #475569);
  font-weight: 600;
  gap: 6px;
}
.ch .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ch .n { color: var(--ink3, #94a3b8); font-weight: 400; }
.ch .n b { color: var(--ink, #0f172a); font-weight: 700; font-variant-numeric: tabular-nums; }

.tbl-wrap { max-height: 258px; overflow-y: auto; }
.tbl { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.tbl th {
  position: sticky; top: 0; z-index: 1;
  text-align: left; padding: 6px 10px;
  color: var(--ink3, #94a3b8); font-weight: 600; font-size: 10.5px;
  background: #fff; border-bottom: 1px solid #f4f6f9;
}
.tbl td { padding: 7px 10px; border-bottom: 1px solid #f7f9fc; color: var(--ink, #0f172a); }
.tbl tr:last-child td { border-bottom: 0; }
.tbl .right { text-align: right; }
.tbl .num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
.tbl .hi { color: #c2410c; font-weight: 700; }
.tbl .empty { text-align: center; color: var(--ink3, #94a3b8); padding: 14px; }

.st { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; }
.st i { width: 4px; height: 4px; border-radius: 50%; display: inline-block; background: currentColor; }
.st.wait { color: #d97706; }
.st.ok { color: #0e9f6e; }
.st.no { color: #c8102e; }
.st.blue { color: #2563eb; }

.todo-list { max-height: 260px; overflow-y: auto; }
.todo {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 10px; border-bottom: 1px solid #f4f6f9;
}
.todo:last-child { border-bottom: 0; }
.todo .info { flex: 1; min-width: 0; }
.todo .t1 {
  font-size: 12px; font-weight: 600; color: var(--ink, #0f172a);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.todo .t2 { font-size: 10.5px; color: var(--ink3, #94a3b8); margin-top: 1px; }
.todo .amt { font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
.todo .go {
  height: 24px; padding: 0 9px; border-radius: 5px;
  border: 1px solid #f5d4d9; color: #c8102e; background: #fdf0f2;
  font-size: 11px; font-weight: 600; cursor: pointer; flex: 0 0 auto;
}
.todo .go:hover { background: #fbe3e7; }
.empty { text-align: center; color: var(--ink3, #94a3b8); padding: 16px; font-size: 12px; }

.note {
  font-size: 10.5px; color: var(--ink3, #94a3b8);
  padding: 6px 10px; border-top: 1px solid #f7f9fc; background: #fcfcfd;
  line-height: 1.5;
}
</style>
