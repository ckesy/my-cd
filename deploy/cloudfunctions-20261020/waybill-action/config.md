# waybill-action 配置快照

| 项 | 值 |
| --- | --- |
| 函数名 | `waybill-action` |
| 运行时 | Node.js 18.15 |
| 超时时间 | 建议 20 秒（围栏校验会顺带查车辆定位，8s 超时） |
| 调用方式 | `wx.cloud.callFunction`（**不需要** HTTP 网关） |
| 环境变量 | `DONGFENG_TOKEN`（不配则用代码里的兜底常量） |

## ⚠️ 前置条件

以下字段**必须先在 CloudBase 控制台建好**，否则 PATCH 会报
`PATCH waybills 失败 HTTP 400`：

1. 拒单 5 字段（`reject_reason` / `reject_note` / `reject_by` / `reject_time` / `reject_count`）
2. 常驻任务 + 节点时间 + 运输节点模式，共 23 字段

合并在一份脚本里：`my-cd/sql/2026-10-16_recurring_task_and_status_log.sql`

## 入参

```js
{
  account,           // 当前登录账号（司机）
  id,                // 运单 id
  action,            // 见下表
  reason,            // action=reject 时必填
  note,              // action=reject 且 reason='其他' 时必填
  vehicle,           // action=accept / claim / setVehicle 时可选：本次开哪辆车
}
```

## 动作集与状态流转

| action | 适用模式 | 允许的当前状态 | 目标状态 | 写入的节点时间 | 围栏校验 |
| --- | --- | --- | --- | --- | --- |
| `accept` | 极简 / 详细 | `待接单` | `待装车` | `accept_time` + `accept_by` | — |
| `claim` | 极简 / 详细 | `待接单` | `待装车` | `accept_time` + `accept_by` | — |
| `reject` | 极简 / 详细 | `待接单` | `待重新指派` | `reject_time` | — |
| `confirmLoad` | 仅详细 | `待装车` / `装车中` | `装车完成` | `load_end_time` | **装货地** |
| `confirmDepart` | 仅详细 | `装车完成` / `装车中` | `已发车` | `depart_time` | — |
| `confirmArrive` | 仅详细 | `已发车` / `装车完成` | `已到达` | `arrive_time` | **卸货地** |
| `finish` | 极简 / 详细 | `待装车` / `装车中` / `装车完成` / `已发车` / `已到达` | `已完成` | `finish_time` | — |
| `setVehicle` | 极简 / 详细 | `待装车` / `装车中` / `装车完成` / `已发车` / `已到达` / `已完成` | **不变** | — | — |

### ⭐ `claim`（车队抢单）—— 原子抢占

运单按「车队」指派时，组织下所有司机会同时收到。`claim` 的语义与 `accept` 完全相同，
**唯一的区别是落库用条件 PATCH**：

```
PATCH waybills?id=eq.<id>&status=eq.待接单   → 返回行数 = 0 即说明被别人抢先
```

被抢先时返回 `409` + `conflict: 'claimed_by_other'`，文案「手慢了，这趟已被其他司机接走」。

> ⚠️ 这一步**必须**放服务端。先查后写会有两个司机同时「抢到」的竞态。
> 实测本环境 PostgREST 在匹配 0 行时返回 `HTTP 200 []`（已用真实网关验证）。

### `setVehicle`（补写 / 更改本次用车）

**不改状态**，只写 `waybills.vehicle`。两个场景需要它：

1. 抢单是「先抢占成功 → 再问选哪辆车」，抢到手时还不知道用哪辆；
2. 司机跳过选车 → `vehicle` 为空 → **打卡围栏校验要车牌去查 VIN 和定位，会直接失败**
   （返回「该运单未指定单车，无法校验装货地围栏位置」）→ 从卡片「选本次用车」补上。

只接受司机自己绑定的车牌，否则 `400`。

## ⭐ 抢单归属守卫（关键）

`isAssignedToDriver` 只判断「这条单是否指派给了我」。
按**车队**指派时，组织下**每个**司机都能通过这个校验 —— 所以必须在它之外再确认一次
「这条单是不是**我**抢到的」：

```js
const acceptBy = String(wb.accept_by || '').trim()
if (acceptBy && ![ctx.driverName, account].includes(acceptBy)) {
  return { code: 403, message: '这趟已被其他司机接走，你不能再操作它' }
}
```

放在**状态校验之前**，所有动作（含 `claim` / `setVehicle`）统一拦截。
少了这道校验，同事 A 抢走的单，同事 B 照样能装车、发车（真踩过）。

## ⭐ 车牌（本次用哪辆车）与「必须选车」闸门

任何动作都可以带 `vehicle` 参数（这样「确认发车」可以一次调用同时定车）。
`vehicle` 不在司机绑定车牌里 → `400 只能选择你自己绑定的车辆`。

**绑 ≥2 辆车**时按下面的规则卡住：

| 动作 | 是否必须已定车 | 不满足时 |
| --- | --- | --- |
| `accept` / `claim` | 仅当 `transport_mode = 极简` | `400 该运单是「极简」模式，接单前请先选择本次用哪辆车` |
| `confirmLoad` | 当 `check_in_required !== false` | `400 还没有选择本次用哪辆车，装货地打卡无法校验，请先选车` |
| `confirmDepart` | 总是 | `400 还没有选择本次用哪辆车，请先选车再发车` |

失败响应里带 `need_vehicle: true`，前端据此弹不可跳过的选车面板。

> 只绑 1 辆车 → 接单时自动带上，不打扰司机。
> `confirmLoad` 那一条是必须的：打卡要靠车牌查 VIN 和车辆定位，
> 没车牌会退化成「该运单未指定单车」这种更难懂的错误。


**旧动作名兼容**：`complete → finish`、`loadEnd → confirmLoad`、`depart → confirmDepart`。
已上线的司机端只发 `accept / reject / complete`，不用改也能继续跑。

**运输节点模式**（`waybills.transport_mode`）：

| 模式 | 司机端动作链 |
| --- | --- |
| `极简` | 接单 → 完成运单 |
| `详细` | 接单 → 装车完成 → 确认发车 → 确认到达 → 完成运单 |

极简模式下调用 `confirmLoad` / `confirmDepart` / `confirmArrive` 会被拒绝（`409`）。

每次流转都会往 `waybills.status_log` **追加**一条：

```jsonc
{ "status": "装车完成", "time": "2026-10-16T09:12:00.000Z",
  "operator": "李亚楠", "account": "15035660050",
  "remark": "装货地围栏校验通过" }
```

## 装卸货地打卡围栏校验

`waybills.check_in_required = true` 且 `transport_mode = '详细'` 时生效：

| 动作 | 校验围栏 | 围栏名称来源 |
| --- | --- | --- |
| `confirmLoad` | 装货地 | `waybills.pickup` |
| `confirmArrive` | 卸货地 | `waybills.delivery` |

判定流程：`ele_fences.name` 反查围栏 → 取车辆 `vehicles.vin` →
东风实时位置（`chassisNo = VIN 后 8 位`，循环今/昨/前天）→ 判断是否在围栏内。

支持三种形状（`ele_fences.shape`）：

| shape | 几何 | 判定 |
| --- | --- | --- |
| `circle` | `center` + `radius` | 球面距离 ≤ radius |
| `polygon` | `points` | 射线法判断点在多边形内 |
| `polyline` | `points` + `bufferradius` | 点到折线最短距离 ≤ bufferradius |
| `district` | `adcode` | **不做校验**，放行并写 warn |

失败返回 `409`，文案直接给司机看：

- `车辆不在「测试围栏」装货地围栏范围内，暂时无法打卡`
- `未获取到车辆 <车牌> 的定位，无法校验装货地围栏位置`
- `该运单未指定单车，无法校验装货地围栏位置`

> ⚠️ 围栏校验用的是**车辆最后一次上报的位置**，不是司机手机定位。
> 车辆熄火 / 离线时位置可能是旧的。这正是 Web 端
> 「运单详情 → 临时关闭装卸货地打卡」存在的意义。

## ⭐ 同车 / 同司机并发拦截（仅 `accept` 校验）

同一个车牌或同一个司机，在同一个客户范围内只能有一条「**未结束**」的运输记录：

| 状态 | 是否占用 |
| --- | --- |
| `待装车` / `装车中` / `装车完成` / `已发车` / `已到达` | ✅ 占用 |
| `待接单` | ✅ 占用 |
| `已完成` / `已取消` / `待重新指派` | ❌ 不占用 |

命中时返回 `409`：

```
车辆 鄂CM1658 还有未结束的运输记录（YD202610160001 · 已发车），请先完成或取消后再接单
司机 李亚楠 还有未结束的运输记录（YD202610160001 · 已发车），请先完成或取消后再接单
```

判定口径：

- **车牌**：用 `pickVehiclePlate()` 解析 `assignments` 里 `method === 'vehicle'` 的 target
  （不看 `waybills.vehicle`，多指派时它退化成「多种」/「N辆」）
- **司机**：解析 `assignments` 里 `method === 'driver'` 的 target，兜底看 `waybills.driver`
- 查询范围为**同 `owner_account`**（管理员发布的运单 `owner_account` 为空，按 `is.null` 查）
- 查询失败时**放行**并写 warn，不因校验本身故障挡住司机干活

> ⚠️ 历史遗留的「卡在待装车」运单会占用车辆/司机，需要调度在 Web 端取消。
> 这是预期行为，但上线前建议先清一遍历史未结束的单。

## 常驻任务闸门（仅 `accept` 校验）

`waybills.is_recurring = true` 时才生效：

| `recurring_type` | 规则 | 超出时 |
| --- | --- | --- |
| `time` | 当前时间须落在 `recurring_start_time` ~ `recurring_end_time` 内，**次数不限** | `409 该常驻任务尚未到生效时间` / `409 该常驻任务已过有效期，无法再接单` |
| `count` | 同 `recurring_group_no` 下已接单的运单数须 `< recurring_max_count` | `409 该常驻任务接单次数已用尽（N/M）` |

- 接单成功后写 `recurring_accepted_count = 已用 + 1`；用满时把 `recurring_status` 置为 `已结束`
- 次数以「同分组下 `accept_time` 非空 或 状态已进入执行中」的运单数统计

## 拒单原因预设项

`车辆故障` / `时间冲突` / `路线不熟` / `其他`

- **必选**，空值会被拒绝（`code: 400`）
- 选「其他」时补充说明**变必填**
- 服务端对非预设原因只记警告，不拦截

## 安全校验

1. **归属校验**：用与 `waybill-list` 一致的规则确认该运单确实指派给了此司机，否则返回 `403`
2. **客户隔离**：`waybills.owner_account` 必须与调用者的主账号一致
3. **状态校验**：当前状态不在允许列表内时返回 `409`
4. **模式校验**：极简模式不支持过程节点
5. **常驻闸门**：接单前校验常驻任务的时间窗 / 次数上限
6. **围栏闸门**：打卡节点校验车辆是否在对应围栏内
7. **并发闸门**：接单前校验该车牌 / 该司机是否还有未结束的运输记录

## 返回

```js
{
  code: 0, message: 'ok', id,
  status: '装车完成',
  waybill_no: 'YD…',
  node_time: '2026-10-16T09:12:00.000Z',
  recurring_status: '生效中' | '已结束' | null
}
```

失败：`{ code: 400|403|404|409|500, message: '…' }`

## 待改进

- `reject_count` / `recurring_accepted_count` 用「读-改-写」非原子累加，并发概率极低可接受；
  要严格原子需改用 PostgREST 的 RPC 函数
- `status_log` 每次 append 都是「读全量 + 写全量」，量大后建议改为独立日志表
- 围栏校验依赖东风定位接口，接口不稳会导致司机打不了卡；后续可考虑加
  「打卡位置由小程序端上报 + 服务端做合理范围校验」的降级路径
