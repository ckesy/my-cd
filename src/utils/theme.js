/**
 * 换肤主题定义
 * ------------------------------------------------------------
 * 每套主题给四档品牌色：
 *   main    主色：按钮、选中态、强调数字、图标
 *   hover   悬浮/按下
 *   light   浅底：选中行、标签背景、色块
 *   dark    深色：主卡渐变终点、正文强调
 *
 * 状态色不单独配 —— 由 main 和固定的语义色用 color-mix 混出来，
 * 这样换肤后状态色会自动带一点主色的色相，看起来是同一个体系。
 */

export const THEMES = [
  /* ============ 默认 ============ */
  {
    key: 'crimson', name: '品牌红', group: '常用',
    main: '#C8102E', hover: '#A00D24', light: '#FEF2F2', dark: '#7F1D1D',
    desc: '系统默认红',
  },

  /* ============ 沉稳组 ============ */
  {
    key: 'graphite', name: '石墨', group: '沉稳',
    main: '#1F2937', hover: '#374151', light: '#F1F5F9', dark: '#0F172A',
    desc: '零色彩倾向，最耐看',
  },
  {
    key: 'navy', name: '藏青', group: '沉稳',
    main: '#1E3A8A', hover: '#2B4BA8', light: '#EFF6FF', dark: '#152C6B',
    desc: '最正统的商务蓝',
  },
  {
    key: 'forest', name: '墨绿', group: '沉稳',
    main: '#14532D', hover: '#1B6B3A', light: '#F0FDF4', dark: '#0B3A1E',
    desc: '沉稳、有生命力',
  },
  {
    key: 'indigo', name: '靛紫', group: '沉稳',
    main: '#4338CA', hover: '#5449D8', light: '#EEF2FF', dark: '#332BA0',
    desc: '科技感强',
  },
  {
    key: 'teal', name: '深青', group: '沉稳',
    main: '#0F766E', hover: '#0D9488', light: '#F0FDFA', dark: '#134E4A',
    desc: '清爽不轻浮',
  },
  {
    key: 'charcoal', name: '炭黑', group: '沉稳',
    main: '#1C1917', hover: '#292524', light: '#F5F5F4', dark: '#0C0A09',
    desc: '暖调近黑，有质感',
  },

  /* ============ 明快组 ============ */
  {
    key: 'sky', name: '天蓝', group: '明快',
    main: '#0284C7', hover: '#0EA5E9', light: '#F0F9FF', dark: '#075985',
    desc: '清新不压抑',
  },
  {
    key: 'cyan', name: '湖蓝', group: '明快',
    main: '#0891B2', hover: '#06B6D4', light: '#ECFEFF', dark: '#155E75',
    desc: '干净通透',
  },
  {
    key: 'mint', name: '青绿', group: '明快',
    main: '#0D9488', hover: '#14B8A6', light: '#F0FDFA', dark: '#115E59',
    desc: '薄荷感，有活力',
  },
  {
    key: 'emerald', name: '薄荷绿', group: '明快',
    main: '#059669', hover: '#10B981', light: '#ECFDF5', dark: '#065F46',
    desc: '积极健康',
  },
  {
    key: 'coral', name: '珊瑚红', group: '明快',
    main: '#E11D48', hover: '#F43F5E', light: '#FFF1F2', dark: '#9F1239',
    desc: '比原来的红柔和',
  },
  {
    key: 'violet', name: '紫罗兰', group: '明快',
    main: '#7C3AED', hover: '#8B5CF6', light: '#F5F3FF', dark: '#5B21B6',
    desc: '年轻活泼',
  },
]

export const DEFAULT_THEME = 'crimson'
const STORAGE_KEY = 'app_theme' // 老版本：全局一份（只作迁移兜底）

export const findTheme = (key) => THEMES.find((t) => t.key === key) || THEMES.find((t) => t.key === DEFAULT_THEME)

/* ============================================================
   版式（data-scheme）：决定骨架，跟颜色是两个独立维度
   ------------------------------------------------------------
   f 云白 = 线上现状，作为「随时退回原样」的兜底；
   其余五套见 style.css 末尾的 [data-scheme] 变量组。
   ============================================================ */
export const SCHEMES = [
  { key: 'f', name: '云白', tag: '当前原样', desc: '白顶栏 + 白卡，改版前的样子' },
  { key: 'b', name: '深框浅台', tag: '推荐', desc: '深色外壳收边，视线锁在内容' },
  { key: 'd', name: '晨雾', tag: '自然系', desc: '绿灰天光 + 大圆角 + 胶囊控件' },
  { key: 'e', name: '林间', tag: '自然系', desc: '绿得更沉一档' },
  { key: 'a', name: '暖灰纸感', tag: '纸感', desc: '米色底，最不刺眼' },
]

export const DEFAULT_SCHEME = 'f'
export const findScheme = (key) => SCHEMES.find((s) => s.key === key) || SCHEMES.find((s) => s.key === DEFAULT_SCHEME)

/**
 * 解析主题值。两种格式都认：
 *   "b:teal"  → { scheme:'b', color:'teal' }
 *   "teal"    → { scheme:'f', color:'teal' }   ← 老数据：只存了颜色，版式按原样
 * 空值 / 无法识别 → { scheme:'f', color:'crimson' }
 */
export function parseTheme(v) {
  const raw = String(v || '').trim()
  if (!raw) return { scheme: DEFAULT_SCHEME, color: DEFAULT_THEME }
  if (raw.includes(':')) {
    const [sk, ck] = raw.split(':')
    return {
      scheme: findScheme(sk).key,
      color: findTheme(ck) ? ck : DEFAULT_THEME,
    }
  }
  /* 老值：只有颜色，没有版式 → 版式保持"原样"，只还原用户当时选的色 */
  if (THEMES.some((t) => t.key === raw)) return { scheme: DEFAULT_SCHEME, color: raw }
  return { scheme: DEFAULT_SCHEME, color: DEFAULT_THEME }
}

/** 拼回存储用的字符串 */
export const serializeTheme = (scheme, color) => `${scheme}:${color}`

/* ⭐ 2026-10-24：主题改成**跟账号走**。
   以前存的是 app_theme 一个全局 key，同一个浏览器里换个账号登录还是上一个人的皮肤，
   看起来像"改皮肤影响到了别人"。现在 key 带上账号：app_theme:15035660020 */
/* ⚠️ account 为空时**绝不能**退到全局 key —— 那会让"管理员设一次，
   所有没设过的账号全跟着变"。空账号写进独立的 __anon__ 桶。 */
const ANON_KEY = `${STORAGE_KEY}:__anon__`
const keyOf = (account) => {
  const a = String(account || '').trim()
  return a ? `${STORAGE_KEY}:${a}` : ANON_KEY
}

/**
 * 本地缓存（严格按账号）。
 * ⭐ 2026-11-18：去掉了「读不到就读全局 app_theme」的兜底。
 *   那条兜底是这次"管理员换肤后每个客户端都跟着变"的元凶：
 *   管理员账号 account 为空时把主题写进了全局 key，
 *   其他账号自己没有记录 → 全部命中兜底 → 全都变成管理员那套。
 *   现在全局 key 只做**一次性迁移**，迁完立即删除，不再污染其他账号。
 */
export function readLocalTheme(account) {
  try {
    const a = String(account || '').trim()
    if (!a) return ''
    const hit = localStorage.getItem(keyOf(a))
    if (hit) return hit
    /* ⚠️ 老版本的全局 key 一律**直接清掉，不做迁移**：
       它可能正是管理员写进去的那一份，谁先登录谁就把它继承走 ——
       宁可让那个人回一次默认皮肤，也不能让一个设置到处传染。 */
    if (localStorage.getItem(STORAGE_KEY) !== null) {
      localStorage.removeItem(STORAGE_KEY)
    }
    return ''
  } catch {
    return ''
  }
}

export function writeLocalTheme(key, account) {
  try {
    /* 没有账号标识就不写：宁可用默认皮肤，也不能写全局去影响别人 */
    if (!String(account || '').trim()) return
    localStorage.setItem(keyOf(account), key)
  } catch {
    /* 隐私模式忽略 */
  }
}

/**
 * 「皮肤归谁」—— 决定读/写哪一份主题。
 * ------------------------------------------------------------
 * ⭐⭐ 管理员代看客户时（originalUser 是 admin、currentUser 是 customer），
 *   **皮肤仍然跟管理员走**。理由：
 *   - 皮肤是"这台电脑前坐的人"的偏好，不是"被查看的数据"的属性；
 *   - 管理员要轮着进十几个客户，每进一个换一套色，界面一直在跳，
 *     反而看不清业务数据（用户原话：「皮肤不应该同步」）。
 *   客户自己设的皮肤存在客户账号下，只有客户本人登录时才生效。
 */
export function themeUserOf(user) {
  try {
    const orig = JSON.parse(localStorage.getItem('originalUser') || 'null')
    if (orig && orig.role === 'admin' && user && user.role === 'customer') return orig
  } catch { /* 读不到就按当前用户 */ }
  return user
}

/** 当前账号标识：**不再取 masterAccount** —— 同租户的账号各存各的。
 *  ⭐ 必须 export：组件里以前直接取 user.account，管理员账号常常只有 phone，
 *  取到空串就会把主题写到全局 key 上。统一走这里。 */
export function accountOf(user) {
  if (!user) return ''
  return String(user.account || user.phone || '').trim()
}

/**
 * 把主题写到 <html data-theme>，并在根节点注入 CSS 变量。
 * ⚠️ 品牌色走 CSS 变量，不要再往组件里写死色值。
 */
const hexToRgb = (hex) => {
  const h = String(hex || '').replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

/** 与白色混色：p 为混入比例（0~1） */
const mixWhite = (hex, p) => {
  const h = String(hex || '').replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const m = (v) => Math.round(v + (255 - v) * p).toString(16).padStart(2, '0')
  return `#${m(r)}${m(g)}${m(b)}`
}

/**
 * 把主题写到 <html data-scheme> + <html data-theme>，并注入品牌色变量。
 * ⚠️ 品牌色走 CSS 变量，不要再往组件里写死色值。
 *
 * 参数既可以是复合值 "b:teal"，也可以是老值 "teal"。
 * 返回 { scheme, color }（老代码若拿它当主题对象用，请改读 findTheme(color)）。
 */
export function applyTheme(value) {
  const { scheme, color } = parseTheme(value)
  const t = findTheme(color)

  const main = t.main

  const el = document.documentElement
  /* ⭐ 换肤时先关掉所有过渡，否则会看到"半深半浅"的中间帧（用户会当成闪屏） */
  el.classList.add('theme-switching')
  el.setAttribute('data-scheme', scheme)
  el.setAttribute('data-theme', t.key)
  el.style.setProperty('--brand-primary', main)
  el.style.setProperty('--brand-rgb', hexToRgb(main))
  el.style.setProperty('--brand-primary-hover', t.hover)
  el.style.setProperty('--brand-primary-light', t.light)
  el.style.setProperty('--brand-primary-dark', t.dark)
  /* 两帧之后再放开过渡，确保新配色已经落绘 */
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('theme-switching')))
  return { scheme, color: t.key }
}

/** 本地缓存（保证刷新不闪、也不用等接口） */

/**
 * 从数据库读账号绑定的主题
 * ⭐ 2026-10-24：改成存 **users.theme（每个账号一行，各存各的）**。
 *   以前存 customers.theme（一个租户一行）→ 同公司的账号共用一个皮肤，
 *   换账号登录还是上一个人的色，用户要求「只跟账号相关」。
 *   新列还没加（SQL 未执行）时静默降级为「只存本地」，不影响使用。
 */
const NO_COL_KEY = 'theme_col_missing'

/** 列还没加（SQL 没跑）时记一笔，避免每次刷新都发一个必失败的请求 */
function markNoColumn() {
  try { localStorage.setItem(NO_COL_KEY, '1') } catch { /* 忽略 */ }
}
function clearNoColumn() {
  try { localStorage.removeItem(NO_COL_KEY) } catch { /* 忽略 */ }
}
function hasNoColumn() {
  try { return localStorage.getItem(NO_COL_KEY) === '1' } catch { return false }
}

export async function loadRemoteTheme(supabase, user) {
  const acc = accountOf(user)
  if (!acc || !supabase) return ''
  if (hasNoColumn()) return ''
  try {
    const { data, error } = await supabase
      .from('users')
      .select('theme')
      .eq('account', acc)
      .maybeSingle()
    if (error) {
      const msg = String((error && (error.message || error.details)) || '')
      if (/theme|42703|does not exist|column/i.test(msg)) markNoColumn()
      return ''
    }
    return (data && data.theme) || ''
  } catch {
    return ''
  }
}

/** 保存到账号 */
/**
 * 保存到账号（users.theme，按 account 精确定位到本人）
 * ⚠️ 这里**不检查** hasNoColumn() 标记 —— 用户主动点保存时值得重试一次，
 *    上一次失败可能是因为 SQL 还没跑，跑完就该能用了。
 */
export async function saveRemoteTheme(supabase, user, key) {
  const acc = accountOf(user)
  if (!acc || !supabase) return false
  try {
    const { data, error } = await supabase
      .from('users')
      .update({ theme: key })
      .eq('account', acc)
      .select('id')
    if (error) {
      const msg = String((error && (error.message || error.details)) || '')
      if (/theme|42703|does not exist|column/i.test(msg)) markNoColumn()
      else clearNoColumn()
      console.warn('[主题] 保存失败:', msg)
      return false
    }
    if (!data || !data.length) {
      console.warn('[主题] 没有匹配到账号记录，account =', acc)
      return false
    }
    clearNoColumn()
    return true
  } catch (e) {
    console.warn('[主题] 保存异常:', e && (e.message || e))
    return false
  }
}
