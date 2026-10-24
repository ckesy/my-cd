/**
 * 云函数：vehicleReminderCron
 * ============================================================
 * 车务证件到期扫描 → 生成/更新「提醒事项」(reminders)
 *
 * 触发方式：
 *   1) 定时触发器：Cron `0 0 9 * * * *`（每天 09:00，时区 Asia/Shanghai）
 *   2) 控制台测试：{} 正式跑 / {"dryRun":true} 只看不写 / {"plates":["沪A·D12345"]} 只跑指定车
 *   3) HTTP 访问：POST /vehicleReminderCron
 *
 * 口径（与前端 src/utils/vehicleAffair.js 完全一致，不要各写一份）：
 *   正常   ：剩余 > 最大提醒节点          → 不提醒；把还开着的待办关掉（续保了）
 *   快到期 ：剩余 ≤ 勾选节点              → 命中节点当天各 1 次
 *   临近   ：0 < 剩余 ≤ 3 天（保养 ≤ 500km）→ 每天 1 次
 *   已逾期 ：剩余 < 0                     → 每天 1 次，直到人工处理
 *   提醒单位：5 类证照 = 天（90/30/15/7/3）；保养 = 公里（2000/1000/500/200）
 *   一个证件最多一条「待处理」提醒：有就更新级别，没有才新建
 *
 * 环境变量（都可不配）：
 *   TCB_ENV           默认当前项目环境
 *   RDB_SCHEMA        默认 public（node-sdk 会把 env 当 schema 发，必须显式指定）
 *   CLOUDBASE_APIKEY  不配就用云函数内置权限，更稳
 *   DONGFENG_TOKEN    东风接口 token，默认内置
 *   KM_CONCURRENCY    取里程并发，默认 4（别调太高，东风网关会限流）
 *
 * ⚠️ 用 https 模块而不是 fetch：云函数 Node 16 及以下没有全局 fetch。
 * ⚠️ 所有异常都 return 出去，否则网关只回 FUNCTIONS_INVOCATION_FAILED。
 * ============================================================
 */
const https = require('https')

let tcb = null
try {
  tcb = require('@cloudbase/node-sdk')
} catch (e) {
  tcb = null
}

const DF_TRACK_URL = 'https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/track/history'
const DF_TOKEN = process.env.DONGFENG_TOKEN || 'c40c7311ff604a598b9fb791a63e9deb'
const KM_CONCURRENCY = Number(process.env.KM_CONCURRENCY) || 4
const REQ_TIMEOUT = 20000

const NEAR_DAYS = 3
const MAINTAIN_NEAR_KM = 500
const DEFAULT_DAYS = [30]
const DEFAULT_MAINTAIN_KM = [1000]

const CERT_NAME = {
  driving: '行驶证',
  transport: '营运证',
  jq_insurance: '交强险',
  sy_insurance: '商业险',
  excess_insurance: '超赔险',
  maintain: '保养',
}

let db = null
function getDb() {
  if (db) return db
  if (!tcb) {
    throw new Error('缺少依赖 @cloudbase/node-sdk：请在云函数面板点「云端安装依赖」后重试')
  }
  const app = tcb.init({
    env: process.env.TCB_ENV || 'wuxian-token-d0guymjkpadcd1f22',
    ...(process.env.CLOUDBASE_APIKEY ? { accessKey: process.env.CLOUDBASE_APIKEY } : {}),
  })
  db = app.rdb({ database: process.env.RDB_SCHEMA || 'public' })
  return db
}

/* ============================================================
 * 工具
 * ============================================================ */

/** 北京时间当天 00:00（云函数默认 UTC，直接用 Date 会差 8 小时） */
function todayCN() {
  const now = new Date()
  const cn = new Date(now.getTime() + 8 * 3600 * 1000)
  return cn.toISOString().slice(0, 10)
}

/** YYYY-MM-DD → 距今天数（正数=未来，负数=已过期） */
function daysLeft(dateStr, today) {
  if (!dateStr) return null
  const a = Date.parse(`${String(dateStr).slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${today}T00:00:00Z`)
  if (isNaN(a) || isNaN(b)) return null
  return Math.round((a - b) / 86400000)
}

/** int[] 可能是数组，也可能是 "{30,7}" 字符串 */
function parseDays(v, fallback) {
  let arr = []
  if (Array.isArray(v)) arr = v.map(Number)
  else if (typeof v === 'number') arr = [v]
  else if (typeof v === 'string') {
    arr = v.replace(/[{}]/g, '').split(',').map((x) => Number(String(x).trim()))
  }
  arr = arr.filter((n) => !isNaN(n))
  return arr.length ? arr : fallback.slice()
}

function daysText(arr) {
  return Array.isArray(arr) ? arr.join(',') : String(arr || '')
}

/** 极简 GET JSON（云函数没有 fetch 时也能用） */
function getJson(urlStr, timeoutMs = REQ_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const req = https.get(urlStr, { timeout: timeoutMs }, (res) => {
      let buf = ''
      res.setEncoding('utf8')
      res.on('data', (c) => { buf += c })
      res.on('end', () => {
        try { resolve(JSON.parse(buf)) } catch (e) { reject(new Error('返回不是 JSON：' + buf.slice(0, 120))) }
      })
    })
    req.on('timeout', () => { req.destroy(new Error('请求超时')) })
    req.on('error', reject)
  })
}

/** 车牌 → 当天最大里程(km)。失败返回 null（该车保养显示「需核对」，不误报） */
async function fetchCurrentKm(vin, today) {
  if (!vin) return null
  const qs = new URLSearchParams({
    token: DF_TOKEN,
    carId: vin,
    beginTime: `${today} 00:00:00`,
    endTime: `${today} 23:59:59`,
  })
  try {
    const json = await getJson(`${DF_TRACK_URL}?${qs.toString()}`)
    if (json.code !== 1 || !Array.isArray(json.data)) return null
    let max = 0
    for (const p of json.data) {
      const m = Number(p.mileage) || 0
      if (m > max) max = m
    }
    return max > 0 ? max / 1000 : null
  } catch (e) {
    return null
  }
}

/* ============================================================
 * 级别判定（与前端 levelOf 同口径）
 * ============================================================ */
function levelOf(cert, currentKm, today) {
  if (!cert) return { level: '未录入', left: null }

  if (cert.cert_type === 'maintain') {
    const last = Number(cert.last_maintain_km) || 0
    const gap = Number(cert.maintain_interval_km) || 10000
    const max = Math.max(...parseDays(cert.remind_days, DEFAULT_MAINTAIN_KM))
    if (!last || !currentKm) return { level: '需核对', left: null }
    const kmLeft = last + gap - Number(currentKm)
    if (kmLeft <= 0) return { level: '已逾期', left: kmLeft }
    if (kmLeft <= MAINTAIN_NEAR_KM) return { level: '临近', left: kmLeft }
    if (kmLeft <= max) return { level: '快到期', left: kmLeft }
    return { level: '正常', left: kmLeft }
  }

  const left = daysLeft(cert.expire_date, today)
  if (left === null) return { level: '未录入', left: null }
  const max = Math.max(...parseDays(cert.remind_days, DEFAULT_DAYS))
  if (left < 0) return { level: '已逾期', left }
  if (left <= NEAR_DAYS) return { level: '临近', left }
  if (left <= max) return { level: '快到期', left }
  return { level: '正常', left }
}

/** 是否该生成提醒；快到期只在命中节点那天算 */
function shouldRemind(cert, currentKm, today) {
  const r = levelOf(cert, currentKm, today)
  if (!['快到期', '临近', '已逾期'].includes(r.level)) return null
  if (r.level === '快到期') {
    const days = parseDays(cert.remind_days, cert.cert_type === 'maintain' ? DEFAULT_MAINTAIN_KM : DEFAULT_DAYS)
    if (!days.includes(r.left)) return null
  }
  return r
}

function titleOf(cert, level) {
  const name = CERT_NAME[cert.cert_type] || '证件'
  const tail = level === '已逾期' ? '已逾期' : level === '临近' ? '临近到期' : '快到期'
  return `${cert.plate} · ${name}${tail}`
}

function contentOf(cert, level, left) {
  const name = CERT_NAME[cert.cert_type] || '证件'
  const due = cert.expire_date ? String(cert.expire_date).slice(0, 10) : ''
  if (cert.cert_type === 'maintain') {
    if (level === '已逾期') return `${name}已超里程 ${Math.abs(Math.round(left)).toLocaleString('en-US')} km，请尽快安排保养`
    if (level === '临近') return `${name}还剩 ${Math.round(left)} km 到期，请预约保养`
    return `${name}还剩 ${Math.round(left).toLocaleString('en-US')} km 到期`
  }
  if (level === '已逾期') return `${name}已于 ${due} 到期，已逾期 ${Math.abs(left)} 天`
  if (level === '临近') return `${name}${left} 天后到期（${due}），进入倒计时`
  return `${name}${left} 天后到期（${due}）`
}

function reminderNo(today, seq) {
  const t = String(Date.now()).slice(-5)
  return `TX${today.replace(/-/g, '')}-${t}${String(seq % 100).padStart(2, '0')}`
}

/* ============================================================
 * 主流程
 * ============================================================ */
exports.main = async (event = {}) => {
  const today = todayCN()
  const dryRun = event.dryRun === true
  const onlyPlates = Array.isArray(event.plates) ? event.plates : null

  try {
    const rdb = getDb()

    /* ---------- 1. 租户设置（周末是否提醒、提醒小时） ---------- */
    const settingsRes = await rdb.from('vehicle_affair_settings').select('*')
    const settingsMap = {}
    ;(settingsRes.data || []).forEach((s) => { settingsMap[s.owner_account] = s })

    const isWeekend = [0, 6].includes(new Date(`${today}T00:00:00Z`).getUTCDay())

    /* ---------- 2. 所有启用提醒的证件 ---------- */
    /* ⚠️ 不用 .in()：node-sdk 对数组参数的序列化不稳，取全量后本地筛更保险 */
    const certRes = await rdb.from('vehicle_certs').select('*').eq('remind_enabled', true)
    if (certRes.error) {
      return { ok: false, error: `读 vehicle_certs 失败：${certRes.error.message || JSON.stringify(certRes.error)}` }
    }
    let certs = certRes.data || []
    if (onlyPlates) certs = certs.filter((c) => onlyPlates.includes(c.plate))
    if (!certs.length) return { ok: true, today, scanned: 0, note: '没有需要扫描的证件' }

    /* 周末不提醒的租户整批跳过 */
    if (isWeekend) {
      certs = certs.filter((c) => {
        const s = settingsMap[c.owner_account]
        return !s || s.weekend !== false
      })
    }

    /* ---------- 3. 保养要当前里程：按 VIN 取（并发受控，失败不算错） ---------- */
    const maintainCerts = certs.filter((c) => c.cert_type === 'maintain' && Number(c.last_maintain_km) > 0)
    const plateToVin = {}
    const kmMap = {}
    if (maintainCerts.length) {
      const plates = [...new Set(maintainCerts.map((c) => c.plate))]
      const vres = await rdb.from('vehicles').select('plate,vin')
      ;(vres.data || []).forEach((v) => { if (plates.includes(v.plate)) plateToVin[v.plate] = v.vin })

      let cursor = 0
      const worker = async () => {
        while (cursor < plates.length) {
          const p = plates[cursor++]
          kmMap[p] = await fetchCurrentKm(plateToVin[p], today)
        }
      }
      await Promise.all(Array.from({ length: Math.min(KM_CONCURRENCY, plates.length) }, worker))
    }

    /* ---------- 4. 现有「待处理」提醒 ---------- */
    const openRes = await rdb.from('reminders').select('*').eq('status', '待处理')
    const openByCert = {}
    ;(openRes.data || []).forEach((r) => { if (r.cert_id) openByCert[r.cert_id] = r })

    /* ---------- 5. 逐个证件判定 ---------- */
    const nowIso = new Date().toISOString()
    const stats = { scanned: certs.length, created: 0, updated: 0, closed: 0, failed: 0, needAsk: 0 }
    const errors = []
    let seq = 0

    for (const cert of certs) {
      const km = cert.cert_type === 'maintain' ? kmMap[cert.plate] : null
      const hit = shouldRemind(cert, km, today)
      const exist = openByCert[cert.id]

      try {
        if (!hit) {
          if (exist && !dryRun) {
            /* ⚠️ 用 upsert 而不是 update：node-sdk 的 update 签名各版本不一致，
               upsert(id) 是 opStatsSync 已验证过的写法 */
            const w = await rdb.from('reminders').upsert([{
              ...exist,
              status: '已处理', handle_action: 'auto',
              handled_by: '系统', handled_at: nowIso,
            }], { onConflict: 'id' })
            if (w.error) throw new Error(w.error.message || JSON.stringify(w.error))
            stats.closed++
          }
          continue
        }

        const nextRemind = `${today} 09:00:00`
        const payload = {
          biz_type: 'vehicle_cert',
          cert_id: cert.id,
          cert_type: cert.cert_type,
          vehicle_id: cert.vehicle_id ? String(cert.vehicle_id) : null,
          plate: cert.plate,
          org: cert.org || null,
          owner_account: cert.owner_account || null,
          customer_id: cert.customer_id ? String(cert.customer_id) : null,
          due_date: cert.cert_type === 'maintain' ? null : cert.expire_date,
          level: hit.level,
          title: titleOf(cert, hit.level),
          content: contentOf(cert, hit.level, hit.left),
          receiver_scope: 'tenant',
          remind_days: parseDays(cert.remind_days, DEFAULT_DAYS),
          next_remind_at: nextRemind,
          status: '待处理',
        }

        if (exist) {
          if (!dryRun) {
            const w = await rdb.from('reminders').upsert([{
              ...exist,
              level: payload.level,
              due_date: payload.due_date,
              title: payload.title,
              content: payload.content,
              next_remind_at: payload.next_remind_at,
            }], { onConflict: 'id' })
            if (w.error) throw new Error(w.error.message || JSON.stringify(w.error))
          }
          stats.updated++
        } else {
          if (!dryRun) {
            const w = await rdb.from('reminders').insert([{
              ...payload,
              reminder_no: reminderNo(today, ++seq),
            }])
            if (w.error) throw new Error(w.error.message || JSON.stringify(w.error))
          }
          stats.created++
          stats.needAsk++
        }
      } catch (e) {
        stats.failed++
        if (errors.length < 10) errors.push(`${cert.plate} ${CERT_NAME[cert.cert_type] || cert.cert_type}: ${e.message}`)
      }
    }

    return {
      ok: true,
      today,
      dryRun,
      weekend: isWeekend,
      ...stats,
      kmChecked: Object.keys(kmMap).length,
      kmMissing: Object.values(kmMap).filter((v) => v === null).length,
      errors: errors.length ? errors : undefined,
    }
  } catch (e) {
    return { ok: false, error: e.message || String(e), stack: e.stack }
  }
}
