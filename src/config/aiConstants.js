/**
 * AI 助手 · 常量（唯一来源）
 * ============================================================
 * 错误码与云函数 cloudfunctions/ai-gateway/constants.js 保持一致，
 * 改一边必须改另一边。
 */

export const AI_CODE = {
  OK: 0,
  ERR_SESSION: 1001,
  ERR_NO_TENANT: 1002,
  ERR_NO_TOOL: 1003,
  ERR_PARAM: 2001,
  ERR_NOT_FOUND: 2002,
  ERR_TIMEOUT: 3001,
  ERR_FORMAT: 3002,
  ERR_TOOL_FAIL: 3003,
  ERR_QUOTA: 4001,
  ERR_INTERNAL: 5001,
}

/** 按错误码给用户看的文案（不要把原始 message 直接抛给用户） */
export const AI_MSG = {
  [AI_CODE.ERR_SESSION]: '登录已过期，请重新登录',
  [AI_CODE.ERR_NO_TENANT]: '当前账号未绑定车队',
  [AI_CODE.ERR_NO_TOOL]: '当前账号没有开通相关查询功能',
  [AI_CODE.ERR_PARAM]: '没太听懂，能说得具体一点吗',
  [AI_CODE.ERR_NOT_FOUND]: '没有找到对应的记录',
  [AI_CODE.ERR_TIMEOUT]: '查询超时，请稍后再试',
  [AI_CODE.ERR_FORMAT]: '这次没理解对，换个问法试试',
  [AI_CODE.ERR_TOOL_FAIL]: '查询失败，请稍后再试',
  [AI_CODE.ERR_QUOTA]: '今日提问次数已用完',
  [AI_CODE.ERR_INTERNAL]: '服务暂时不可用',
}

/** 助手身份 */
export const AI_AGENT = {
  name: '小御',
  title: '小御 · AI 智能助理',
  greeting: '你好，我是小御。车队里的事可以直接问我，比如「上个月电耗最差的三个车」。',
}

/** 快捷问句（面板空态展示，点一下即发送） */
export const AI_SUGGESTIONS = [
  '上个月电耗最差的三个车',
  '这个月过路费花了多少',
  '有哪些费用等我审批',
  '昨天跑了多少公里',
]

export const AI_STORAGE = {
  TOKEN: 'ai_session_token',
  PANEL_OPEN: 'ai_panel_open',
  /* 对话记录，实际 key 会拼上账号后缀，避免换账号串台 */
  CHAT: 'ai_chat_history',
}

/** 面板尺寸（与设计稿 A 方案一致） */
export const AI_PANEL_WIDTH = 412
