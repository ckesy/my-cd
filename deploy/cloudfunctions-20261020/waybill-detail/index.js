/**
 * 云函数：waybill-detail
 * ============================================================
 * 作用：小程序「运单详情」——返回单条运单的完整信息 + 指派人
 * 调用：wx.cloud.callFunction({ name: 'waybill-detail', data: { account, id } })
 * 运行时：Node.js 18.15（只用内置 fetch，无 npm 依赖）
 * 环境变量：无
 *
 * ⚠️ 归属校验与 waybill-list / waybill-action 完全一致：
 *    云函数之间不能共享本地模块（各自独立打包），公共逻辑只能复制，
 *    改这里时**必须同步改另两个函数**，否则会出现「列表看得到、详情打不开」。
 *
 * ⭐ 指派人（assigner）规则
 *    waybills.owner_account = 发布者账号（Web 端 doPublish 写的是
 *    masterAccount || account），管理员发布则为 null。
 *    - 发布者是「顶级账号」（自身无 owner_account 且无 role_id）→ 姓名显示「大BOSS」
 *    - 其他账号 → 显示该账号的 name
 *    - 手机号一律取该账号的 phone
 *    - owner_account 为 null（管理员发布）时无法识别具体是谁，显示「平台管理员」
 */

const { randomUUID } = require('crypto')

const API_BASE = 'https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com'
const DEVICE_ID = randomUUID()

/* 指派方式文案 */
const METHOD_LABEL = {
  driver: '指定司机',
  vehicle: '指定车辆',
  team: '指定车队',
}

/* 司机侧可执行的动作所对应的状态 */
const ACTION_STATES = {
  accept: ['待接单'],
  reject: ['待接单'],
  /* 旧名，等价于 finish（已上线的司机端还在发 complete） */
  complete: ['待装车', '装车中', '装车完成', '已发车', '已到达'],
  /* 新动作集 */
  confirmLoad: ['待装车', '装车中'],
  confirmDepart: ['装车完成', '装车中'],
  confirmArrive: ['已发车', '装车完成'],
  finish: ['待装车', '装车中', '装车完成', '已发车', '已到达'],
}

/* 动作文案（司机端按钮直接用，避免两端各写一套） */
const ACTION_LABEL = {
  accept: '确认接单',
  reject: '拒单',
  confirmLoad: '装车完成',
  confirmDepart: '确认发车',
  confirmArrive: '确认到达',
  finish: '完成运单',
}

/* 运输节点模式 → 动作链（数组顺序即司机端展示顺序）
   极简：只有接单与完成运单
   详细：接单 → 装车完成 → 确认发车 → 确认到达 → 完成运单 */
const ACTION_CHAIN = {
  极简: ['accept', 'finish'],
  详细: ['accept', 'confirmLoad', 'confirmDepart', 'confirmArrive', 'finish'],
}

/* ============================================================
   基础工具
   ============================================================ */
const enc = encodeURIComponent

let _token = null
let _tokenExp = 0 // 匿名 access token 的过期时间戳（ms）

/* ⭐ 匿名 token 只有 2 小时（expires_in=7200）。原来只判 `if (_token) return _token`，
   容器热过 2 小时后所有查询都 401 ACCESS_TOKEN_EXPIRED
   （前端看到「查询 users 失败 HTTP 401 ... Access token has expired」）。
   现在按过期时间取，并支持 401 时强制换 token 重试。 */
async function getToken(force) {
  if (_token && !force && Date.now() < _tokenExp) return _token
  _token = null
  const res = await fetch(`${API_BASE}/auth/v1/signin/anonymously`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-device-id': DEVICE_ID },
    body: JSON.stringify({}),
  })
  if (!res.ok) throw new Error(`匿名登录失败 HTTP ${res.status}`)
  const json = await res.json()
  _token =
    json.access_token || json.accessToken || (json.data && json.data.access_token)
  if (!_token) throw new Error('匿名登录未返回 access_token')
  const ttl = Number(json.expires_in) || 7200
  _tokenExp = Date.now() + Math.max(60, ttl - 300) * 1000 // 提前 5 分钟换
  return _token
}

async function queryTable(table, query) {
  const url = `${API_BASE}/v1/rdb/rest/${table}?${query}`
  const doFetch = (token) =>
    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-device-id': DEVICE_ID,
        'Accept-Profile': 'public',
        'Content-Profile': 'public',
      },
    })

  let res = await doFetch(await getToken())
  if (res.status === 401) res = await doFetch(await getToken(true)) // token 过期 → 换一张重试
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`查询 ${table} 失败 HTTP ${res.status}: ${txt.slice(0, 200)}`)
  }
  return res.json()
}

const splitPlates = (raw) =>
  String(raw || '')
    .split(/[,，、;；\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)

function parseAssignments(raw) {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const v = JSON.parse(raw)
      return Array.isArray(v) ? v : []
    } catch (e) {
      return []
    }
  }
  return []
}

/**
 * 取指派方式。
 * ⚠️ Web 端落库的 key 是 `method`（不是文档里写的 `assignMethod`），两者都认。
 */
const readAssignMethod = (a) =>
  String((a && (a.method || a.assignMethod)) || '').trim()

/* ============================================================
   组织树：我的机构 + 全部祖先机构名
   ============================================================ */
async function loadOrgNameSet(ownerAccount, myOrgName) {
  const set = new Set()
  if (myOrgName) set.add(myOrgName)
  if (!ownerAccount) return set

  let orgs = []
  try {
    orgs = await queryTable(
      'organizations',
      `owner_account=eq.${enc(ownerAccount)}&select=id,name,parent_id&limit=500`
    )
  } catch (e) {
    console.warn('加载组织树失败，车队匹配将只按本机构名:', e.message)
    return set
  }

  const byId = new Map()
  const byName = new Map()
  orgs.forEach((o) => {
    if (o && o.id !== undefined && o.id !== null) byId.set(o.id, o)
    const n = String((o && o.name) || '').trim()
    if (n) byName.set(n, o)
  })

  let cur = byName.get(myOrgName)
  let guard = 0
  while (cur && cur.parent_id !== null && cur.parent_id !== undefined && guard++ < 30) {
    const parent = byId.get(cur.parent_id)
    if (!parent) break
    const n = String(parent.name || '').trim()
    if (n) set.add(n)
    cur = parent
  }
  return set
}

/* ============================================================
   管理员运单的消歧守卫（与 waybill-list / waybill-action 一致）
   ------------------------------------------------------------
   管理员跨客户派单时 owner_account 记 null，target 仍是名称，
   名称可能跨客户重名，只有「唯一归属我所在客户」才认。
   ============================================================ */
async function buildAdminSafeTargets(customerId, ownerAccount) {
  const drivers = new Set()
  const orgs = new Set()
  try {
    const rows = await queryTable('drivers', 'select=driver_name,customer_id&limit=2000')
    const byName = new Map()
    for (const d of rows) {
      const n = String((d && d.driver_name) || '').trim()
      const c = String((d && d.customer_id) || '').trim()
      if (!n || !c) continue
      if (!byName.has(n)) byName.set(n, new Set())
      byName.get(n).add(c)
    }
    byName.forEach((owners, n) => {
      if (owners.size === 1 && owners.has(customerId)) drivers.add(n)
    })
  } catch (e) {
    console.warn('管理员运单消歧（司机）构建失败:', e.message)
  }
  try {
    const rows = await queryTable('organizations', 'select=name,owner_account&limit=2000')
    const byName = new Map()
    for (const o of rows) {
      const n = String((o && o.name) || '').trim()
      const a = String((o && o.owner_account) || '').trim()
      if (!n || !a) continue
      if (!byName.has(n)) byName.set(n, new Set())
      byName.get(n).add(a)
    }
    byName.forEach((owners, n) => {
      if (owners.size === 1 && owners.has(ownerAccount)) orgs.add(n)
    })
  } catch (e) {
    console.warn('管理员运单消歧（机构）构建失败:', e.message)
  }
  return { drivers, orgs }
}

function targetMatchesMe(method, target, ctx) {
  if (method === 'driver') return !!ctx.driverName && target === ctx.driverName
  if (method === 'vehicle') return ctx.plates.includes(target)
  if (method === 'team') return ctx.orgNames.has(target)
  return false
}

function adminTargetAllowed(method, target, isAdminWaybill, ctx) {
  if (!isAdminWaybill) return true
  const safe = ctx.adminSafe
  if (!safe) return false
  if (method === 'vehicle') return true
  if (method === 'driver') return safe.drivers.has(target)
  if (method === 'team') return safe.orgs.has(target)
  return false
}

/* 这条指派的目标是不是我；命中返回 { method, target } */
function matchWaybill(wb, ctx) {
  const isAdminWaybill = !String((wb && wb.owner_account) || '').trim()
  for (const a of parseAssignments(wb.assignments)) {
    if (!a) continue
    const method = readAssignMethod(a)
    const items = Array.isArray(a.items) ? a.items : []
    for (const it of items) {
      const target = String((it && it.target) || '').trim()
      if (!target) continue
      if (!targetMatchesMe(method, target, ctx)) continue
      if (!adminTargetAllowed(method, target, isAdminWaybill, ctx)) continue
      return { method, target }
    }
  }
  return null
}

/* ============================================================
   指派人：owner_account → users → 姓名 / 手机号
   ------------------------------------------------------------
   顶级账号（自身无 owner_account 且无 role_id）显示「大BOSS」。
   ============================================================ */
async function resolveAssigner(wb) {
  /* ⭐ 优先用建单时写下的发起人：主账号/管理员都能显示到「具体是谁」，
     以前只能按 owner_account 反查，主账号一律显示「大BOSS」（用户 2026-10-18 反馈）。 */
  const creator = String((wb && wb.creator) || '').trim()
  const creatorAcc = String((wb && wb.creator_account) || '').trim()
  if (creator) {
    let phone = '--'
    if (creatorAcc) {
      try {
        const rows = await queryTable(
          'users',
          `account=eq.${enc(creatorAcc)}&select=phone,name&limit=1`
        )
        phone = String((rows[0] && rows[0].phone) || '') || '--'
      } catch (e) {
        /* 查不到就用 -- */
      }
    }
    return { name: creator, phone, isBoss: false, account: creatorAcc || null }
  }

  const ownerAccount = wb && wb.owner_account
  const acc = String(ownerAccount || '').trim()
  if (!acc) {
    // 老数据：没记发起人、也没 owner_account，无法还原是谁发的
    return { name: '平台管理员', phone: '--', isBoss: false, account: null }
  }
  let u = null
  try {
    const rows = await queryTable(
      'users',
      `account=eq.${enc(acc)}&select=account,name,phone,role_id,owner_account&limit=1`
    )
    u = rows[0] || null
  } catch (e) {
    console.warn('查询指派人失败:', e.message)
  }
  if (!u) return { name: acc, phone: '--', isBoss: false, account: acc }

  const hasRole = u.role_id !== null && u.role_id !== undefined && u.role_id !== ''
  const upOwner = String(u.owner_account || '').trim()
  const isBoss = !hasRole && !upOwner // 主账号 = 自己这棵树的顶点

  return {
    name: isBoss ? '大BOSS' : String(u.name || acc),
    phone: String(u.phone || '') || '--',
    isBoss,
    account: u.account,
  }
}

/* ============================================================
   ⭐ 子母车：一单多司机 / 多车，每人各自跑自己那一趟
   ------------------------------------------------------------
   场景（用户 2026-10-17）：一个运单、一种货物，派给 2 个及以上的司机 / 车辆，
   每人承运数量之和 = 总货物量。司机端详情页要显示**我这一趟**的状态、份额、节点时间。
   ⚠️ 这套判断在 waybill-list / waybill-action / waybill-detail 三份里各有一份，
      改一处必须同步三处。
   ============================================================ */
const LEG_TODO = '待接单'
const LEG_EXCLUSIVE_METHODS = ['driver', 'vehicle']

function collectLegs(wb) {
  const out = []
  for (const a of parseAssignments(wb && wb.assignments)) {
    const method = readAssignMethod(a)
    for (const it of Array.isArray(a.items) ? a.items : []) {
      out.push({ method, item: it || {}, target: String((it && it.target) || '').trim() })
    }
  }
  return out
}

function isMultiLegWaybill(wb) {
  if (!wb || wb.is_recurring) return false
  const legs = collectLegs(wb)
  if (legs.length < 2) return false
  return legs.every((l) => LEG_EXCLUSIVE_METHODS.includes(l.method))
}

function findMyLeg(wb, ctx) {
  if (!isMultiLegWaybill(wb)) return null
  return (
    collectLegs(wb).find((l) => {
      if (l.method === 'driver') return !!ctx.driverName && l.target === ctx.driverName
      if (l.method === 'vehicle') return ctx.plates.includes(l.target)
      return false
    }) || null
  )
}

/* 腿的状态（兼容上线前的老数据：状态只在行级、accept_by 是第一个接单人） */
function legStatusOf(leg, wb) {
  const own = String((leg && leg.item && leg.item.leg_status) || '').trim()
  if (own) return own
  if (leg && wb) {
    const ab = String(wb.accept_by || '').trim()
    const st = String(wb.status || '').trim()
    if (ab && st && st !== LEG_TODO && leg.method === 'driver' && ab === leg.target) return st
  }
  return LEG_TODO
}

/* 腿的节点时间（没写过且还没开始 → null；历史数据回退行级） */
function legTimeOf(leg, key, wb) {
  if (!leg) return (wb && wb[key]) || null
  const own = leg.item && leg.item[`leg_${key}`]
  if (own) return own
  if (legStatusOf(leg, wb) === LEG_TODO) return null
  return (wb && wb[key]) || null
}

/* ============================================================
   入口
   ============================================================ */

/* ============================================================
   ⭐ 模块闸门（口径与 Web src/config/modules.js 一致）
   ------------------------------------------------------------
   云函数之间不共享代码，这段在每个业务函数里各存一份。
   为什么必须做：前端藏掉入口挡不住 callFunction，司机拿自己账号就能调。
   ============================================================ */
const MODULE_DEFAULT_ON = { waybill: true }

async function assertModule(account, key) {
  try {
    if (!account) return true
    const rows = await queryTable(
      'users',
      `account=eq.${enc(account)}&select=account,owner_account&limit=1`
    )
    const u = rows[0]
    if (!u) return true
    const owner = String(u.owner_account || '').trim() || String(u.account || '').trim()
    if (!owner) return true
    const mods = await queryTable(
      'tenant_modules',
      `owner_account=eq.${enc(owner)}&select=module_key,enabled`
    )
    const hit = (mods || []).find((m) => m.module_key === key)
    /* 没有记录 → 按 defaultOn（只有运单默认开） */
    if (!hit) return MODULE_DEFAULT_ON[key] === true
    return hit.enabled === true
  } catch (e) {
    /* 表不存在 / 查询失败 → 放行，避免一次迁移把业务全挡死 */
    return true
  }
}

exports.main = async (event) => {
    /* ⭐ 模块闸门：未开通直接 403 */
    if (!(await assertModule(String((event && event.account) || '').trim(), 'waybill'))) {
      return { code: 403, message: '该功能未开通，请联系车队管理员' }
    }

  try {
    const account = String((event && event.account) || '').trim()
    let id = event && event.id
    const noIn = String((event && event.waybill_no) || '').trim()
    if (!account) return { code: 400, message: '未登录' }
    if ((id === undefined || id === null || id === '') && !noIn) {
      return { code: 400, message: '缺少运单 id' }
    }

    /* 1. 用户行 */
    const users = await queryTable(
      'users',
      `account=eq.${enc(account)}&select=account,phone,owner_account&limit=1`
    )
    const user = users[0]
    if (!user) return { code: 403, message: '未找到用户记录' }

    /* 只给了运单号（从上报记录点进来）：先换出 id */
    if (id === undefined || id === null || id === '') {
      const hit = await queryTable('waybills', `waybill_no=eq.${enc(noIn)}&select=id&limit=1`)
      if (!hit || !hit.length) return { code: 404, message: '运单不存在' }
      id = hit[0].id
    }

    /* 2. 司机档案（口径与 login-by-account 对齐） */
    const driverPhone = String(user.phone || '').trim() || account
    const drivers = await queryTable(
      'drivers',
      `phone=eq.${enc(driverPhone)}&select=driver_name,phone,org,bound_vehicle,customer_id&limit=1`
    )
    const driver = drivers[0]
    if (!driver) return { code: 403, message: '未找到司机档案' }

    const ctx = {
      driverName: String(driver.driver_name || '').trim(),
      myOrgName: String(driver.org || '').trim(),
      plates: splitPlates(driver.bound_vehicle),
      customerId: String(driver.customer_id || '').trim(),
      orgNames: new Set(),
      adminSafe: null,
    }

    /* 3. 取运单 */
    const rows = await queryTable('waybills', `id=eq.${enc(id)}&limit=1`)
    const wb = rows[0]
    if (!wb) return { code: 404, message: '运单不存在' }

    /* 4. 归属校验（防越权，与 waybill-action 一致） */
    const ownerAccount = String(user.owner_account || '').trim() || account
    if (wb.owner_account && String(wb.owner_account) !== ownerAccount) {
      return { code: 403, message: '无权查看该运单' }
    }
    ctx.orgNames = await loadOrgNameSet(ownerAccount, ctx.myOrgName)
    if (!String(wb.owner_account || '').trim()) {
      ctx.adminSafe = await buildAdminSafeTargets(ctx.customerId, ownerAccount)
    }
    const myAssign = matchWaybill(wb, ctx)
    if (!myAssign) return { code: 403, message: '该运单未指派给你' }

    /* ⭐ 子母车：我这一趟单独算（详情页显示的是我这趟的状态与时间） */
    const multi = isMultiLegWaybill(wb)
    const myLeg = multi ? findMyLeg(wb, ctx) : null
    if (multi && !myLeg) {
      return { code: 403, message: '这趟没有派给你（子母车任务每人只跑自己那份）' }
    }
    const legs = multi ? collectLegs(wb) : []
    const legIndex = myLeg ? legs.findIndex((l) => l.target === myLeg.target) + 1 : 1

    /* 5. 指派明细（全量，供详情页展示）—— 子母车顺带把每趟的状态带出去 */
    const assignments = parseAssignments(wb.assignments).map((a) => {
      const method = readAssignMethod(a)
      return {
        method,
        methodLabel: METHOD_LABEL[method] || method || '未指定',
        items: (Array.isArray(a.items) ? a.items : []).map((it) => {
          const target = String((it && it.target) || '').trim() || '未指定'
          const leg = multi
            ? { method, item: it || {}, target }
            : null
          return {
            target,
            carryQuantity: Number((it && it.carryQuantity) || 0),
            carryFreight: Number((it && it.carryFreight) || 0),
            /* 子母车：这一趟归谁跑、跑到哪一步了 */
            leg_status: leg ? legStatusOf(leg, wb) : '',
            leg_vehicle: leg ? String((it && it.leg_vehicle) || '').trim() : '',
            leg_accept_time: leg ? legTimeOf(leg, 'accept_time', wb) : null,
            leg_finish_time: leg ? legTimeOf(leg, 'finish_time', wb) : null,
            is_mine: !!(leg && leg.target === myLeg.target),
          }
        }),
      }
    })

    /* 5.5 老单可能没有经纬度 → 按围栏名现查（导航要用；只读不落库） */
    let geoFix = null
    if (!wb.pickup_lng || !wb.delivery_lng) {
      const names = [wb.pickup, wb.delivery].map((x) => String(x || '').trim()).filter(Boolean)
      if (names.length) {
        try {
          const inList = names.map((n) => `"${n.replace(/"/g, '')}"`).join(',')
          const fs2 = await queryTable(
            'ele_fences',
            `select=name,center&name=in.(${inList})&limit=50`
          )
          geoFix = {}
          ;(fs2 || []).forEach((r) => {
            const parts = String(r.center || '').split(',').map(Number)
            const nm = String(r.name || '').trim()
            if (nm && parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
              geoFix[nm] = { lng: parts[0], lat: parts[1] }
            }
          })
        } catch (e) {
          console.warn('详情缺坐标、围栏反查失败:', e.message)
        }
      }
    }
    const geoOf = (name) => (geoFix && geoFix[String(name || '').trim()]) || null

    /* 6. 指派人 */
    const assigner = await resolveAssigner(wb)

    /* ⭐ 常驻任务：把同组所有趟次带出来（用户 2026-10-18：进度看整组，不是只看组主） */
    let groupTrips = []
    if (wb.is_recurring && String(wb.recurring_group_no || '').trim()) {
      try {
        const gno = String(wb.recurring_group_no).trim()
        const rows2 = await queryTable(
          'waybills',
          `select=id,waybill_no,trip_seq,status,accept_time,finish_time,create_time,driver,vehicle,carry_quantity` +
            `&recurring_group_no=eq.${enc(gno)}` +
            `&or=(owner_account.eq.${enc(ownerAccount)},owner_account.is.null)&order=trip_seq.asc&limit=200`
        )
        const ACTIVE = ['待装车', '装车中', '装车完成', '已发车', '已到达']
        groupTrips = (rows2 || []).map((t) => {
          const st = String(t.status || '').trim()
          return {
            id: t.id,
            waybill_no: t.waybill_no || '',
            seq: Number(t.trip_seq) || 0,
            status: st,
            accept_time: t.accept_time || null,
            finish_time: t.finish_time || null,
            driver: String(t.driver || '').trim(),
            vehicle: String(t.vehicle || '').trim(),
            cls:
              st === '已完成'
                ? 'done'
                : ACTIVE.includes(st)
                  ? 'now'
                  : 'todo',
          }
        })
      } catch (e) {
        console.warn('常驻趟次查询失败:', e.message)
      }
    }


    /* ⭐ 子母车：状态 / 节点时间 / 车牌 / 承运数量一律取**我这一趟** */
    const view = myLeg
      ? {
          ...wb,
          status: legStatusOf(myLeg, wb),
          accept_time: legTimeOf(myLeg, 'accept_time', wb),
          load_end_time: legTimeOf(myLeg, 'load_end_time', wb),
          depart_time: legTimeOf(myLeg, 'depart_time', wb),
          arrive_time: legTimeOf(myLeg, 'arrive_time', wb),
          finish_time: legTimeOf(myLeg, 'finish_time', wb),
        }
      : wb
    const status = String(view.status || '').trim()
    const myVehicle = myLeg
      ? (String(myLeg.item.leg_vehicle || '').trim() ||
          (myLeg.method === 'vehicle' ? myLeg.target : '') ||
          (ctx.plates.length === 1 ? ctx.plates[0] : ''))
      : String(wb.vehicle || '')
    const myCarry = myLeg
      ? Number(myLeg.item.carryQuantity || 0)
      : Number(wb.carry_quantity || 0)

    /* ⭐ 车队单（可抢）和常驻单**不给拒单**（用户 2026-10-17 拍板）：
       · 车队指派 = 一条活谁抢到归谁，不接就放着让别人接，没有"拒绝"的语义
       · 常驻任务 = 组织下谁都能接、各接各的，同样不该出现拒单
       普通运单（专门派给某个司机 / 某辆车）仍然可以拒单。 */
    const isTeamAssign = parseAssignments(wb.assignments).some(
      (a) => readAssignMethod(a) === 'team'
    )
    const noReject = !!wb.is_recurring || isTeamAssign

    const can = (k) => {
      if (k === 'reject' && noReject) return false
      return ACTION_STATES[k].includes(status)
    }

    /* ⭐ 按运输节点模式给出完整动作链与当前可执行动作 */
    const transportMode = String(wb.transport_mode || '详细').trim() === '极简' ? '极简' : '详细'
    const chain = ACTION_CHAIN[transportMode]
    const actions = chain.map((key) => ({
      key,
      label: ACTION_LABEL[key] || key,
      enabled: ACTION_STATES[key].includes(status),
      done: !!(view[
        { accept: 'accept_time', confirmLoad: 'load_end_time', confirmDepart: 'depart_time',
          confirmArrive: 'arrive_time', finish: 'finish_time' }[key]
      ]),
    }))

    console.log(
      `waybill-detail：${account} 查看运单 ${wb.waybill_no || id}（${status}/${transportMode}）` +
        ` 指派人=${assigner.name}`
    )

    return {
      code: 0,
      message: 'ok',
      waybill: {
        id: wb.id,
        waybill_no: wb.waybill_no || '',
        status,
        task_name: wb.task_name || '',
        receive_no: wb.receive_no || '',
        source: wb.source || '',
        create_time: wb.create_time || null,
        /* 发单信息（用户 2026-10-18：详情要能看出谁发的、什么时候发的） */
        creator: String(wb.creator || '').trim(),
        creator_account: String(wb.creator_account || '').trim(),
        /* 装卸货联系人 / 电话（导航、拨号用） */
        pickup_contact: String(wb.pickup_contact || '').trim(),
        pickup_phone: String(wb.pickup_phone || '').trim(),
        delivery_contact: String(wb.delivery_contact || '').trim(),
        delivery_phone: String(wb.delivery_phone || '').trim(),
        /* 运输信息 */
        pickup: wb.pickup || '',
        delivery: wb.delivery || '',
        pickup_time: wb.pickup_time || null,
        plan_time: wb.plan_time || null,
        vehicle: myVehicle,
        /* ⭐ 起终点坐标（司机端「导航」用；老数据可能为 null） */
        pickup_lng:
          wb.pickup_lng === null || wb.pickup_lng === undefined
            ? (geoOf(wb.pickup) || {}).lng ?? null
            : Number(wb.pickup_lng),
        pickup_lat:
          wb.pickup_lat === null || wb.pickup_lat === undefined
            ? (geoOf(wb.pickup) || {}).lat ?? null
            : Number(wb.pickup_lat),
        delivery_lng:
          wb.delivery_lng === null || wb.delivery_lng === undefined
            ? (geoOf(wb.delivery) || {}).lng ?? null
            : Number(wb.delivery_lng),
        delivery_lat:
          wb.delivery_lat === null || wb.delivery_lat === undefined
            ? (geoOf(wb.delivery) || {}).lat ?? null
            : Number(wb.delivery_lat),
        /* 货物信息 */
        cargo: wb.cargo || '',
        quantity: Number(wb.quantity || 0),
        freight: Number(wb.freight || 0),
        carry_quantity: myCarry,
        /* ⭐ 子母车：一单多司机/多车（详情页据此显示「我这趟 · 第 n/N 趟」） */
        multi_leg: !!myLeg,
        leg_count: legs.length || 1,
        leg_index: legIndex,
        total_carry_quantity: legs.length
          ? legs.reduce((s, l) => s + (Number(l.item.carryQuantity) || 0), 0)
          : Number(wb.carry_quantity || 0),
        /* 指派信息 */
        assignments,
        my_assign: myAssign,
        assigner,
        /* 常驻：整组趟次 */
        trips: groupTrips,
        /* 司机侧可执行动作 */
        can_accept: can('accept'),
        can_reject: can('reject'),
        can_complete: can('complete'),
        /* ⭐ 运输节点模式与打卡开关 */
        transport_mode: transportMode,
        check_in_required: wb.check_in_required !== false,
        /* ⭐ 节点时间（司机端步骤条用它判断哪些节点已完成）—— 子母车取我这趟的 */
        accept_time: view.accept_time || null,
        load_end_time: view.load_end_time || null,
        depart_time: view.depart_time || null,
        arrive_time: view.arrive_time || null,
        finish_time: view.finish_time || null,
        /* ⭐ 动作链与当前可执行动作：司机端直接渲染，不用自己维护状态机 */
        actions,
        /* ⭐ 我绑定的车牌：接单/抢单后要选「本次开哪辆」 */
        plates: ctx.plates,
        /* ⭐ 常驻任务（司机端表头加徽标） */
        is_recurring: !!wb.is_recurring,
        recurring_group_no: wb.recurring_group_no || '',
        recurring_type: wb.recurring_type || '',
        recurring_start_time: wb.recurring_start_time || null,
        recurring_end_time: wb.recurring_end_time || null,
        recurring_max_count: Number(wb.recurring_max_count || 0),
        recurring_accepted_count: Number(wb.recurring_accepted_count || 0),
        recurring_status: wb.recurring_status || '',
        trip_seq: Number(wb.trip_seq || 0),
      },
    }
  } catch (e) {
    console.error('waybill-detail error:', e && (e.stack || e.message || e))
    return {
      code: 500,
      message: '服务异常：' + (e && e.message ? e.message : '未知'),
    }
  }
}

/* ============================================================
   备注
   ------------------------------------------------------------
   1. 归属校验逻辑与 waybill-list / waybill-action 三份重复。云函数之间不能
      require 本地模块（各自独立打包），只能复制 —— 改动必须三处同步。
   2. 详情页只读，不产生副作用；接单 / 拒单 / 确认到达仍走 waybill-action。
   ============================================================ */
