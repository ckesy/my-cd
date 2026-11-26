/**
 * 数据大屏遥控（挂在 ai-gateway 上的一个 action）
 * ============================================================
 * 为什么在网关里而不是独立云函数：
 *   ① 系统默认域名 *.app.tcloudbase.com 不允许 CLI 新增 HTTP 路由，
 *      独立函数拿不到 Web 端可访问的地址；而 /ai-gateway 这条路已经通了。
 *   ② 鉴权、租户上下文、日志已经在这里算好了，独立函数要重复一遍
 *      resolveSession + buildContext，多两次查库，还容易把 tenant 口径写歪。
 *
 * 动作（body.op）
 *   register  大屏打开时注册/续约
 *   attach    小程序接管：按租户自动匹配在线屏（0/1/多块）
 *   release   交还
 *   pull      大屏长轮询取指令（挂起最多 wait 秒，默认 12）
 *   ack       回执
 *   state     屏状态（在线 / 当前页 / 接管人）
 *
 * ⚠️ tenant 一律来自 ctx（= 主账号 account），绝不接受前端传入。
 * ⚠️ 每个查询强制拼 tenant，anon 角色库权限很宽，数据库不会替你拦越权。
 * ============================================================
 */

const { CODE, TABLE, LIMITS } = require('./constants')
const { dbSelect, dbInsert, dbPatch, enc, isMissingTable } = require('./db')
const { BizError } = require('./guard')

const OPS = ['register', 'attach', 'release', 'pull', 'ack', 'state']

const SCREEN = {
  WAIT_MAX_SEC: 12,          // 长轮询单次挂起上限（云函数超时 20s）
  POLL_INTERVAL_MS: 1200,    // 12s 内约 10 次查询
  ONLINE_MS: LIMITS.SCREEN_ONLINE_MS,
  HOLDER_TTL_MS: 30 * 60 * 1000,
  MAX_CANDIDATES: 10,
}

/** 白名单字段，禁止 select * */
const DEVICE_FIELDS = 'screen_id,name,kind,current_page,holder,holder_name,holder_at,last_seen'

const nowIso = () => new Date().toISOString()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ok = (data) => Object.assign({ code: CODE.OK }, data || {})

/** 屏 id 只允许 scr_ 开头的安全字符，防止拼进 query 注入 */
const normScreenId = (v) => {
  const s = String(v || '').trim()
  return /^scr_[A-Za-z0-9_-]{4,48}$/.test(s) ? s : ''
}

async function getDevice(tenant, screenId) {
  const rows = await dbSelect(
    TABLE.SCREEN_DEVICES,
    `select=${DEVICE_FIELDS}&tenant=eq.${enc(tenant)}&screen_id=eq.${enc(screenId)}&limit=1`
  )
  return rows[0] || null
}

async function listOnline(tenant) {
  const since = new Date(Date.now() - SCREEN.ONLINE_MS).toISOString()
  const rows = await dbSelect(
    TABLE.SCREEN_DEVICES,
    `select=${DEVICE_FIELDS}&tenant=eq.${enc(tenant)}&last_seen=gt.${enc(since)}` +
      `&order=last_seen.desc&limit=${SCREEN.MAX_CANDIDATES}`
  )
  return Array.isArray(rows) ? rows : []
}

/** 超过 30 分钟没有新指令，视为自动释放（避免第二天屏还被占着） */
function activeHolder(dev) {
  if (!dev || !dev.holder) return ''
  const at = dev.holder_at ? Date.parse(dev.holder_at) : 0
  if (!at) return String(dev.holder)
  return Date.now() - at > SCREEN.HOLDER_TTL_MS ? '' : String(dev.holder)
}

async function firstPending(tenant, screenId, skipCommandId) {
  const now = nowIso()
  let q =
    `select=command_id,action,payload,created_at,created_by_name&tenant=eq.${enc(tenant)}` +
    `&screen_id=eq.${enc(screenId)}&status=eq.pending&expires_at=gt.${enc(now)}`
  if (skipCommandId) q += `&command_id=neq.${enc(skipCommandId)}`
  q += '&order=created_at.desc&limit=1'
  const rows = await dbSelect(TABLE.SCREEN_COMMANDS, q)
  return rows[0] || null
}

function toScreen(dev) {
  return {
    screenId: dev.screen_id,
    name: dev.name,
    kind: dev.kind,
    page: dev.current_page || dev.kind || 'fleet',
    holder: activeHolder(dev) || null,
    holderName: dev.holder_name || null,
    lastSeen: dev.last_seen || null,
  }
}

/* ============================================================
   动作
   ============================================================ */

/**
 * 谁能遥控大屏
 * ------------------------------------------------------------
 * ⭐ 只放行主账号（含平台管理员）。staff / driver 一律拒绝，即使角色权限里勾了
 *    screen_fleet 也不行 —— 大屏是会议室的公共设备，子账号能接管就会出现
 *    「两个人在各自手机上抢同一块屏」，画面来回跳，现场谁也说不清。
 * ⚠️ 判定用 ctx.kind（= buildContext 算出来的 master/staff/driver），
 *    不要自己拿 account 和 tenant 比字符串 —— 平台管理员的 tenant 是它自己，
 *    客户子账号的 tenant 是主账号，两种都合法，比字符串会误判。
 */
function assertController(ctx) {
  if (!ctx || ctx.kind !== 'master') {
    throw new BizError(CODE.ERR_NO_TOOL, '只有主账号可以操作大屏')
  }
}

async function doRegister(ctx, body) {
  const screenId = normScreenId(body.screenId)
  if (!screenId) throw new BizError(CODE.ERR_PARAM, 'screenId 格式不对（应为 scr_ 开头）')

  const name = String(body.name || '').trim().slice(0, 40) || '数据大屏'
  const kind = body.kind === 'fee' ? 'fee' : 'fleet'
  const now = nowIso()

  const rows = await dbSelect(
    TABLE.SCREEN_DEVICES,
    `select=id,${DEVICE_FIELDS}&tenant=eq.${enc(ctx.tenant)}&screen_id=eq.${enc(screenId)}&limit=1`
  )

  if (rows[0]) {
    await dbPatch(
      TABLE.SCREEN_DEVICES,
      `tenant=eq.${enc(ctx.tenant)}&screen_id=eq.${enc(screenId)}`,
      { name, last_seen: now }
    )
    return ok({ screenId, name, page: rows[0].current_page || kind })
  }

  await dbInsert(TABLE.SCREEN_DEVICES, {
    tenant: ctx.tenant,
    screen_id: screenId,
    name,
    kind,
    current_page: kind,
    last_seen: now,
  })
  console.log(`[screen] register 新建 tenant=${ctx.tenant} screen=${screenId}`)
  return ok({ screenId, name, page: kind })
}

async function doAttach(ctx, body) {
  assertController(ctx)

  const online = await listOnline(ctx.tenant)
  if (!online.length) return ok({ screen: null, needPick: false, hint: 'no_screen_online' })

  const preferId = normScreenId(body.screenId)
  let target = null
  if (preferId) target = online.find((d) => d.screen_id === preferId) || null
  if (!target && online.length === 1) target = online[0]

  if (!target) {
    return ok({ screen: null, needPick: true, candidates: online.map(toScreen) })
  }

  const prev = activeHolder(target)
  const now = nowIso()
  await dbPatch(
    TABLE.SCREEN_DEVICES,
    `tenant=eq.${enc(ctx.tenant)}&screen_id=eq.${enc(target.screen_id)}`,
    { holder: ctx.account, holder_name: ctx.name, holder_at: now }
  )

  const takenOver = prev && prev !== ctx.account ? { from: prev } : null
  console.log(
    `[screen] attach tenant=${ctx.tenant} screen=${target.screen_id} by=${ctx.account}` +
      (takenOver ? ` 覆盖 ${takenOver.from}` : '')
  )
  return ok({
    screen: toScreen(Object.assign({}, target, { holder: ctx.account, holder_at: now })),
    needPick: false,
    takenOver,
  })
}

async function doRelease(ctx, body) {
  assertController(ctx)

  const screenId = normScreenId(body.screenId)
  if (!screenId) throw new BizError(CODE.ERR_PARAM, 'screenId 必填')
  await dbPatch(
    TABLE.SCREEN_DEVICES,
    `tenant=eq.${enc(ctx.tenant)}&screen_id=eq.${enc(screenId)}&holder=eq.${enc(ctx.account)}`,
    { holder: null, holder_name: null, holder_at: null }
  )
  return ok({ released: true })
}

async function doPull(ctx, body) {
  const screenId = normScreenId(body.screenId)
  if (!screenId) throw new BizError(CODE.ERR_PARAM, 'screenId 必填')

  const dev = await getDevice(ctx.tenant, screenId)
  if (!dev) throw new BizError(CODE.ERR_PARAM, '屏幕未注册，请刷新大屏页面')

  const page = body.page === 'fee' ? 'fee' : 'fleet'
  const skip = String(body.skipCommandId || '').trim().slice(0, 64)
  const reqWait = Number(body.wait)
  const wait = Math.min(
    Math.max(Number.isFinite(reqWait) ? reqWait : SCREEN.WAIT_MAX_SEC, 1),
    SCREEN.WAIT_MAX_SEC
  )

  /* 心跳：进循环前必须写一次，否则长轮询期间这块屏会被判离线 */
  await dbPatch(
    TABLE.SCREEN_DEVICES,
    `tenant=eq.${enc(ctx.tenant)}&screen_id=eq.${enc(screenId)}`,
    { last_seen: nowIso(), current_page: page }
  )

  const deadline = Date.now() + wait * 1000
  let cmd = null
  let rounds = 0
  while (Date.now() < deadline) {
    cmd = await firstPending(ctx.tenant, screenId, skip)
    if (cmd) break
    rounds += 1
    if (deadline - Date.now() < SCREEN.POLL_INTERVAL_MS) break
    await sleep(SCREEN.POLL_INTERVAL_MS)
  }

  if (!cmd) return ok({ command: null, page, rounds })

  return ok({
    command: {
      commandId: cmd.command_id,
      action: cmd.action,
      payload: cmd.payload || {},
      by: cmd.created_by_name || '',
      createdAt: cmd.created_at,
    },
    page,
    rounds,
  })
}

async function doAck(ctx, body) {
  const commandId = String(body.commandId || '').trim().slice(0, 64)
  if (!commandId) throw new BizError(CODE.ERR_PARAM, 'commandId 必填')

  const success = body.ok !== false
  await dbPatch(
    TABLE.SCREEN_COMMANDS,
    `tenant=eq.${enc(ctx.tenant)}&command_id=eq.${enc(commandId)}`,
    {
      status: success ? 'consumed' : 'failed',
      consumed_at: nowIso(),
      ack: {
        ok: success,
        ms: Math.max(0, Math.min(60000, Number(body.ms) || 0)),
        error: success ? null : String(body.error || '').slice(0, 200),
      },
    }
  )

  /* 回执顺便上报当前页：切大屏这类指令一执行完，小程序就能查到新页 */
  const screenId = normScreenId(body.screenId)
  if (screenId) {
    await dbPatch(
      TABLE.SCREEN_DEVICES,
      `tenant=eq.${enc(ctx.tenant)}&screen_id=eq.${enc(screenId)}`,
      { current_page: body.page === 'fee' ? 'fee' : 'fleet', last_seen: nowIso() }
    )
  }
  return ok({ acked: true })
}

async function doState(ctx, body) {
  assertController(ctx)

  const screenId = normScreenId(body.screenId)
  if (!screenId) throw new BizError(CODE.ERR_PARAM, 'screenId 必填')

  const dev = await getDevice(ctx.tenant, screenId)
  if (!dev) throw new BizError(CODE.ERR_PARAM, '屏幕不存在')

  return ok({
    online: !!dev.last_seen && Date.now() - Date.parse(dev.last_seen) < SCREEN.ONLINE_MS,
    page: dev.current_page || 'fleet',
    holder: activeHolder(dev) || null,
    holderName: dev.holder_name || null,
    lastSeen: dev.last_seen || null,
  })
}

/* ============================================================
   入口
   ============================================================ */
async function handleScreen(op, body, ctx) {
  if (OPS.indexOf(op) < 0) {
    throw new BizError(CODE.ERR_PARAM, `不支持的屏控动作：${op || '(空)'}`)
  }
  if (!ctx || !ctx.tenant) {
    throw new BizError(CODE.ERR_NO_TENANT, '缺少租户上下文，无法操作大屏')
  }

  try {
    switch (op) {
      case 'register': return await doRegister(ctx, body)
      case 'attach': return await doAttach(ctx, body)
      case 'release': return await doRelease(ctx, body)
      case 'pull': return await doPull(ctx, body)
      case 'ack': return await doAck(ctx, body)
      case 'state': return await doState(ctx, body)
      default: throw new BizError(CODE.ERR_PARAM, '不支持的动作')
    }
  } catch (e) {
    if (isMissingTable(e)) {
      console.error('[screen] 表不存在，请先执行 sql/2026-11-27_screen_remote.sql')
      throw new BizError(CODE.ERR_INTERNAL, '大屏遥控尚未初始化，请联系管理员执行建表脚本')
    }
    throw e
  }
}

module.exports = { handleScreen }
