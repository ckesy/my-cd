/**
 * AI 助手 · 本地页面索引
 * ============================================================
 * "哪个功能在哪儿"这类问题**不该走大模型**：答案在代码里，不在数据库里。
 * 本地匹配约 20ms 出结果，比过一遍模型快两个数量级。
 *
 * ⚠️ 新增页面时同步这里一行（和 config/permissions.js 一样，是"要记得加"的地方）。
 *    漏了不会报错，只是问「XX在哪儿」时答不上来。
 */

/** path 必须与 src/router/index.js 完全一致 */
export const PAGES = [
  { path: '/dashboard', label: '首页', aliases: ['数据总览', '看板', '首页'], initials: 'sy', perm: 'home' },
  { path: '/waybill', label: '运单管理', aliases: ['运单', '单子', '派单', '运输任务'], initials: 'yd', perm: 'waybill' },
  { path: '/waybill/create', label: '新建运单', aliases: ['建单', '开单', '新建运单', '发单'], initials: 'xjyd', perm: 'waybill' },
  { path: '/waybill/stats', label: '运单统计', aliases: ['运单报表', '单量统计'], initials: 'ydtj', perm: 'waybill_stats' },
  { path: '/report', label: '费用上报', aliases: ['上报', '报销', '登记费用'], initials: 'fysb', perm: 'report' },
  { path: '/fee/list', label: '费用列表', aliases: ['费用审批', '待审', '审核', '报销单', '核销'], initials: 'fylb', perm: 'fee_list' },
  { path: '/fee/payout', label: '付款记录', aliases: ['打款', '付款', '付款登记'], initials: 'fkjl', perm: 'fee_payout' },
  { path: '/fee/stats', label: '费用统计', aliases: ['费用分析', '费用报表'], initials: 'fytj', perm: 'fee_list' },
  { path: '/fee/config', label: '费用审批设置', aliases: ['审批流', '审批配置', '审批人'], initials: 'fyspsz', perm: 'fee_list' },
  { path: '/flow/canvas', label: '业务流程', aliases: ['流程', '画布', '审批流程', '模块开关'], initials: 'ywlc', perm: 'flow' },
  { path: '/operation/summary', label: '运营总览', aliases: ['运营', '日报', '运营数据'], initials: 'yyzl', perm: 'operation_summary' },
  { path: '/operation/energy', label: '能耗分析', aliases: ['电耗', '油耗', '能耗', '百公里'], initials: 'nhfx', perm: 'operation_energy' },
  { path: '/operation/driving', label: '行车分析', aliases: ['驾驶行为', '超速', '怠速'], initials: 'xcfx', perm: 'operation_driving' },
  { path: '/ele-fence/setting', label: '电子围栏', aliases: ['围栏', '打卡点', '装货地'], initials: 'dzwl', perm: 'ele_fence' },
  { path: '/ele-fence/alert-query', label: '围栏告警查询', aliases: ['围栏报警', '进出提醒'], initials: 'wlgj', perm: 'ele_fence' },
  { path: '/archive/vehicle', label: '车辆档案', aliases: ['车辆', '车', '车牌'], initials: 'clda', perm: 'vehicle_archive' },
  { path: '/archive/driver', label: '司机档案', aliases: ['司机', '驾驶员', '师傅'], initials: 'sjda', perm: 'driver_archive' },
  { path: '/archive/customer', label: '客户档案', aliases: ['客户', '货主', '发货人'], initials: 'khda', perm: 'customer_archive' },
  { path: '/archive/cargo', label: '货物档案', aliases: ['货物', '品名', '货品'], initials: 'hwda', perm: 'cargo_archive' },
  { path: '/fullmap', label: '全图监控', aliases: ['地图', '实时位置', '车在哪', '车辆位置'], initials: 'qtjk', perm: 'driving_fullmap' },
  { path: '/maintenance/vehicle', label: '车务总览', aliases: ['维修', '保养', '车务'], initials: 'cwzl', perm: 'vehicle_affair' },
]

const norm = (s) => String(s || '')
  .replace(/[\s\u3000，。、？！,.?!:：；;'"“”‘’()（）[\]【】]/g, '')
  .toLowerCase()

/**
 * 匹配页面
 * @param {string} query 用户原话
 * @param {(perm:string)=>boolean} hasPerm 权限判定（无权限的条目直接过滤，避免推荐越权入口）
 * @returns {Array<{path,label,aliases,score}>} 最多 4 条，按相关度降序
 */
export function matchPage(query, hasPerm) {
  const q = norm(query)
  if (!q || q.length < 2) return []
  const allow = typeof hasPerm === 'function' ? hasPerm : () => true

  const hits = []
  for (const p of PAGES) {
    if (!allow(p.perm)) continue
    const label = norm(p.label)
    let score = 0

    if (label === q) score = 100
    else if (label.includes(q)) score = 82
    else if (q.includes(label)) score = 74
    else if (p.aliases.some((a) => norm(a).includes(q) || q.includes(norm(a)))) score = 62
    else if (q.length >= 2 && q.length <= 4 && p.initials.startsWith(q)) score = 40

    if (score) hits.push({ path: p.path, label: p.label, desc: p.aliases[0] || '', score })
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 4)
}

/** 看起来像"在哪儿 / 怎么用"的问句，先走本地索引 */
export function looksLikeNav(text) {
  const s = String(text || '')
  if (s.length > 24) return false
  return /在哪|哪儿|哪里|怎么进|怎么去|怎么用|入口|打开|跳转|找一下/.test(s)
}
