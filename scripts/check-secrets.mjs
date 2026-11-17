#!/usr/bin/env node
/**
 * 密钥哨兵 · 构建前扫描
 * ============================================================
 * 目的：把「明文密钥进入代码」这件事挡在构建之前，而不是等上线后被人发现。
 *
 * 用法
 *   node scripts/check-secrets.mjs          # 手动扫
 *   npm run build                           # prebuild 自动扫，命中即中断
 *   node scripts/check-secrets.mjs --warn    # 只告警不退出（本地调试用）
 *
 * 规则来源：2026-11-17 安全整改中实际发生过泄露的类型。
 * 新增凭据类型时，往 RULES 里加一条即可。
 * ============================================================
 */
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const WARN_ONLY = process.argv.includes('--warn')

const TARGETS = [
  'src',
  'public',
  'cloudfunctions',
  'supabase/functions',
  'tools',
  'scripts',
  'index.html',
  'README-DEV.md',
  '.env.example',
]

const EXTS = new Set(['.js', '.mjs', '.cjs', '.ts', '.vue', '.json', '.html', '.md', '.example'])
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.workbuddy', 'coverage', '.vite'])
const SELF = path.join('scripts', 'check-secrets.mjs')

/* 误报豁免：CloudBase 官方函数模板的元数据文件，里面是模板 onlineId 与 zip 校验码，非凭据 */
const SKIP_FILE_RE = /cloudbase-template(\.en)?\.json$/

/* ---------- 规则 ---------- */
const RULES = [
  {
    id: '腾讯云 AccessKey',
    re: /AKID[A-Za-z0-9]{13,}/g,
  },
  {
    id: '32 位十六进制密钥（东风/高德一类开放平台 Token）',
    re: /['"`][a-f0-9]{32}['"`]/g,
  },
  {
    id: 'JWT / Supabase Key',
    re: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g,
  },
  {
    id: '大模型 sk- 密钥',
    re: /sk-[A-Za-z0-9]{20,}/g,
  },
  {
    id: '数据库连接串',
    re: /(postgres|postgresql|mysql|mongodb(\+srv)?|redis):\/\/[^\s'"`]{8,}/g,
  },
  {
    id: 'SecretKey / SecretId 字面量赋值',
    re: /(SecretId|SecretKey|accessKeySecret|appSecret)\s*[:=]\s*['"][A-Za-z0-9_\-+/=]{12,}['"]/g,
  },
]

/* 允许出现的白名单（误报豁免）：目前靠 SKIP_FILE_RE 与行内占位符判断，
   如需按单行豁免，在这里加 { file, line } 匹配规则即可。 */

function walk(dir, out) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (e) {
    return
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name)
    const rel = path.relative(ROOT, full)
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue
      walk(full, out)
    } else if (ent.isFile()) {
      if (rel === SELF) continue
      if (SKIP_FILE_RE.test(ent.name)) continue
      const ext = path.extname(ent.name)
      if (EXTS.has(ext) || ent.name === '.env.example') out.push(full)
    }
  }
}

function mask(v) {
  const s = String(v).replace(/^['"`]|['"`]$/g, '')
  if (s.length <= 8) return s[0] + '***'
  return s.slice(0, 4) + '***' + s.slice(-2) + ` (len=${s.length})`
}

const files = []
for (const t of TARGETS) {
  const abs = path.join(ROOT, t)
  if (!fs.existsSync(abs)) continue
  const st = fs.statSync(abs)
  if (st.isDirectory()) walk(abs, files)
  else files.push(abs)
}

const hits = []
for (const file of files) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (e) {
    continue
  }
  const lines = text.split('\n')
  for (const rule of RULES) {
    rule.re.lastIndex = 0
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      /* 占位符与注释里的说明性文字跳过 */
      if (/<[^>]*(配置|获取|见|env|变量)[^>]*>/.test(line)) continue
      rule.re.lastIndex = 0
      let m
      while ((m = rule.re.exec(line)) !== null) {
        hits.push({
          file: path.relative(ROOT, file),
          line: i + 1,
          rule: rule.id,
          sample: mask(m[0]),
        })
      }
    }
  }
}

if (!hits.length) {
  console.log(`✅ 密钥扫描通过：${files.length} 个文件，未发现明文凭据`)
  process.exit(0)
}

console.error(`\n🚨 发现 ${hits.length} 处疑似明文凭据：\n`)
for (const h of hits) {
  console.error(`  ${h.file}:${h.line}  [${h.rule}]  ${h.sample}`)
}
console.error(`
处理方式：
  1) 前端可见的（VITE_ 前缀）→ 移到 .env，代码改读 import.meta.env
  2) 服务端用的 → 移到云函数环境变量，代码改读 process.env
  3) 确认是误报 → 在 scripts/check-secrets.mjs 的 ALLOW 中加豁免规则

强制放行（不推荐）：node scripts/check-secrets.mjs --warn
`)

if (!WARN_ONLY) process.exit(1)
