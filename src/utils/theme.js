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

export const DEFAULT_THEME = 'teal'
const STORAGE_KEY = 'app_theme'

export const findTheme = (key) => THEMES.find((t) => t.key === key) || THEMES.find((t) => t.key === DEFAULT_THEME)

/**
 * 把主题写到 <html data-theme>，并在根节点注入 CSS 变量。
 * ⚠️ 品牌色走 CSS 变量，不要再往组件里写死色值。
 */
const hexToRgb = (hex) => {
  const h = String(hex || '').replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

export function applyTheme(key) {
  const t = findTheme(key)
  const el = document.documentElement
  el.setAttribute('data-theme', t.key)
  el.style.setProperty('--brand-primary', t.main)
  el.style.setProperty('--brand-rgb', hexToRgb(t.main))
  el.style.setProperty('--brand-primary-hover', t.hover)
  el.style.setProperty('--brand-primary-light', t.light)
  el.style.setProperty('--brand-primary-dark', t.dark)
  return t
}

/** 本地缓存（保证刷新不闪、也不用等接口） */
export function readLocalTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function writeLocalTheme(key) {
  try {
    localStorage.setItem(STORAGE_KEY, key)
  } catch {
    /* 隐私模式忽略 */
  }
}

/** 当前用户能用来存主题的账号标识 */
function accountOf(user) {
  if (!user) return ''
  return String(user.masterAccount || user.account || user.phone || '').trim()
}

/**
 * 从数据库读账号绑定的主题
 * 存在 customers.theme（主账号一行），子账号读同一个主账号的记录 —— 全家视觉统一
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
  if (hasNoColumn()) return ''   // 之前已经确认过列不存在
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('theme')
      .eq('phone', acc)
      .maybeSingle()
    if (error) {
      /* 42703 = column does not exist；这类错误重试也没用，直接记下来 */
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
 * 保存到账号
 * ⚠️ 这里**不检查** hasNoColumn() 标记 —— 用户主动点保存时值得重试一次，
 *    上一次失败可能是因为 SQL 还没跑，跑完就该能用了。
 */
export async function saveRemoteTheme(supabase, user, key) {
  const acc = accountOf(user)
  if (!acc || !supabase) return false
  try {
    const { data, error } = await supabase
      .from('customers')
      .update({ theme: key })
      .eq('phone', acc)
      .select('id')
    if (error) {
      const msg = String((error && (error.message || error.details)) || '')
      if (/theme|42703|does not exist|column/i.test(msg)) markNoColumn()
      else clearNoColumn()
      console.warn('[主题] 保存失败:', msg)
      return false
    }
    /* update 影响 0 行 → customers 里没有这个手机号的记录 */
    if (!data || !data.length) {
      console.warn('[主题] 没有匹配到账号记录，phone =', acc)
      return false
    }
    clearNoColumn()
    return true
  } catch (e) {
    console.warn('[主题] 保存异常:', e && (e.message || e))
    return false
  }
}
