/**
 * 费用待办（待我审批 / 待打款）—— 侧边栏角标、顶栏红点、运单列表筛选共用
 * ============================================================
 * ⚠️ 判断口径必须和「运单详情 → 费用情况」「运单列表 → 待我审批」一致：
 *    当前节点 = flow[current_level-1]，审批人是我（approver_id）或主账号兜底 owner 节点
 * ⚠️ 待打款只算钱款类（回单 / 磅单 / 超时 / 补卡 不涉及打款）
 */
import { supabase } from '@/utils/supabase'
import { moduleFlags, approvalOn } from '@/utils/modules'

export const MONEY_TYPES = ['expense', 'subsidy', 'loan', 'violation']
export const PAY_PENDING_STATUS = ['已通过', '待打款']

export const masterAccountOf = (u) => (u && (u.masterAccount || u.account)) || ''

export const isMasterUser = (u) => {
  if (!u) return false
  if (u.role === 'admin') return true
  return u.role === 'customer' && !u.isSubAccount
}

/** 能登记打款的人：主账号 / 财务角色 / 被单独勾了「付款登记」权限的角色 */
export const isPayer = (u) => {
  if (!u) return false
  if (isMasterUser(u)) return true
  if (String(u.roleName || '').includes('财务')) return true
  /* ⭐ 2026-10-24：付款登记不再只给主账号/财务 —— 功能配置里勾了 fee_payout 也能付 */
  const perms = u.permissions && u.permissions.client
  return Array.isArray(perms) && perms.includes('fee_payout')
}

/** 财务岗：角色名带「财务」，或主账号亲自兜底（小车队没有专职财务） */
export const isFinanceUser = (u) => {
  if (!u) return false
  if (String(u.roleName || '').includes('财务')) return true
  return isMasterUser(u)
}

/** 这一条上报的当前审批节点是不是我 */
export const canApproveReport = (r, u) => {
  if (!r || r.status !== '审核中') return false
  const flow = Array.isArray(r.flow) ? r.flow : []
  const step = flow[(Number(r.current_level) || 0) - 1]
  if (!step) return false
  if (step.approver_id && u && Number(step.approver_id) === Number(u.id)) return true
  if (step.role === 'owner' && isMasterUser(u)) return true
  /* ⭐ 2026-10-24：财务节点兜底。
     审批链里的 finance 节点记的是「提交那一刻配置的财务账号 id」，
     换人、换账号、或配置里没指定具体人时，老板/财务登录会完全看不到这笔待办
     （用户反馈「管理端找不到待我审批」就是这个）。财务岗或主账号都可以处理。 */
  if (step.role === 'finance' && isFinanceUser(u)) return true
  return false
}

/** 当前登录人（localStorage 里那份，和页面里的口径一致） */
export const currentFeeUser = () => {
  try { return JSON.parse(localStorage.getItem('currentUser') || 'null') } catch { return null }
}

const rowsOf = async (build) => {
  try {
    const { data, error } = await build()
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('[费用待办] 读取失败（不阻断）', e && e.message)
    return []
  }
}

const scoped = (q, u) => (u && u.role === 'customer' && masterAccountOf(u)
  ? q.eq('owner_account', masterAccountOf(u))
  : q)

/**
 * 一次拿两个角标：
 *   approve = 当前审批节点是我的「审核中」条数
 *   pay     = 我能不能打款时的「已通过 / 待打款」钱款类条数
 * ⭐ approve 受「业务流程 → 费用审批」开关约束：审批关了就没有待审这回事，
 *    直接给 0，免得侧边栏/顶栏还挂着红点、点进去却是空列表。
 */
export async function fetchFeeTodo(user) {
  const u = user || currentFeeUser()
  if (!u) return { approve: 0, pay: 0, payableAmount: 0 }

  const [pending, payable] = await Promise.all([
    approvalOn.value
      ? rowsOf(() => scoped(
        supabase.from('reports').select('id,status,current_level,flow').eq('status', '审核中'),
        u
      ))
      : Promise.resolve([]),
    isPayer(u) && moduleFlags.payout
      ? rowsOf(() => scoped(
        supabase
          .from('reports')
          .select('id,amount,status,type')
          .in('type', MONEY_TYPES)
          .in('status', PAY_PENDING_STATUS),
        u
      ))
      : Promise.resolve([]),
  ])

  const approve = pending.filter((r) => canApproveReport(r, u)).length
  const pay = payable.length
  const payableAmount = payable.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  return { approve, pay, payableAmount }
}
