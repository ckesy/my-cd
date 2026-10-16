# 项目长期记忆（my-cd 东风车队管理系统 · Web 端）

> 日常流水记在 `YYYY-MM-DD.md`；本文件只保留跨会话仍需遵守的结论。

## 数据口径（改代码前必读）

- **运单「节点完成时间」= 下一个节点的进入时间**。线性流转链上没有独立的
  「完成」事件，时间轴按此推导。
- **运单装货地 / 卸货地存的是「电子围栏名称」，不是地址**。
  地图取坐标必须先按 `name` 反查 `ele_fences.center`；
  只有文本包含 省/市/区/路/街/道/号/镇/村 等字样才走高德地理编码，
  否则围栏别名会被编码到无关坐标。
- **只有单车牌记录才画车辆实时位置**。`waybills.vehicle` 在多指派时退化为
  `多种` / `N辆` / `--`，必须优先解析 `assignments` 里 `method === 'vehicle'` 的 `target`。
- **指派方式 key 是 `method`**（不是 `assignMethod`）。落库与读取都用 `method`，
  云函数为兼容历史写的是 `a.method || a.assignMethod`，新代码一律用 `method`。
- **常驻任务**：`is_recurring` + `recurring_group_no` 关联多条运输记录。
  次数闸门统计「同分组下 `accept_time` 非空或状态已进入执行中」的运单数，
  **不读** `recurring_accepted_count`（仅展示/兜底）。
- 车辆实时位置链路：`车牌 → vehicles.vin → dongfeng-lostlocation`（Web 走 HTTP 网关，
  8s 超时，成功码是 `code === 1`）。

## 数据库

- CloudBase PostgreSQL 共享版，**没有本地迁移工具**，
  DDL 一律写成 `sql/*.sql` 交给用户在控制台执行。
- ⭐ 前端写新字段时要**做降级容错**：列不存在时去掉新字段重试，
  不要让未执行的迁移把普通业务写崩（WaybillCreate 的 `stripRecurringFields` 是范例）。

## 状态枚举

运单（**9 个**）：`待接单 / 待重新指派 / 待装车 / 装车中 / 装车完成 / 已发车 / 已到达 / 已完成 / 已取消`
（`装车中` 是历史遗留，新流程不再产生）
车辆：`行驶 / 静止 / 离线`

## 运输节点模式与打卡

- `waybills.transport_mode` = `极简`（接单→完成运单）| `详细`（接单→装车完成→确认发车→确认到达→完成运单）。
  动作链的**唯一权威在云函数**（`waybill-detail` / `waybill-list` 返回 `actions[]` + `next_action`），
  小程序端不自建状态机。
- 打卡围栏对应：**装车完成 → 装货地围栏**，**确认到达 → 卸货地围栏**。
  位置取**车辆最后一次上报**（`vehicles.vin` → 东风实时定位），不是手机定位。
- 围栏几何 `ele_fences.shape`：`circle`（center+radius）/ `polygon`（points 射线法）/
  `polyline`（points+bufferradius）/ `district`（无法本地判定 → 放行 + warn）。
- Web 端详情页可把 `check_in_required` 临时置 false 兜底（留痕 `check_in_off_*`）。
  该开关**必须放在 `el-form` 之外**，否则被表单 `disabled` 连带禁用。

## 东风接口

- 历史轨迹：`https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/track/history`，
  `carId` = **完整 VIN**，`beginTime`/`endTime`；成功码 `code === 1`；
  返回 `{longitude, latitude, velocity, direction, sendTime, mileage}`。
  该接口**回显任意 Origin**（CORS 全开），前端可直连；token 支持
  `VITE_DONGFENG_TOKEN` 环境变量覆盖（当前有硬编码兜底）。
- 实时位置：走 `dongfeng-lostlocation` HTTP 网关，`chassisNo` = VIN 后 8 位。

## 运单进度可视化（Web）

- **进度计算的唯一来源是 `src/utils/waybillProgress.js`**，页面与组件统一从那里取，
  **不要在页面里重写一套**。它内置 25 秒轨迹缓存，保护东风接口。
- 组件：`WaybillProgressBar.vue`（单趟计划 vs 实际双条 + ETA）、
  `RecurringTaskGantt.vue`（常驻任务：历次完成情况 + 按天周期甘特 + 当天明细）。
- **物流状态页按 `waybills.is_recurring` 分两条路径**：
  常驻走甘特（**不显示地图**），普通走「进度双条 + 地图 + 节点时间轴」。
  两条都 30 秒自动刷新。
- ⭐ **进度口径**：已行驶 = **从 `depart_time`（确认发车）起算**的轨迹点累加；
  剩余里程 = `plan_distance − 已行驶`（<0 按 0 计并标「已超规划里程」）；
  剩余时间 = `plan_duration × 剩余比例`；定位停更 > 30 分钟则**不给 ETA**。
- `plan_distance` / `plan_duration` / 起终点坐标在**发布运单时用高德算一次落库**，
  刷新链路完全不调高德。
- 同车 / 同司机并发规则：同一车牌或同一司机在同一 `owner_account` 下只能有一条
  未结束的运输记录（未结束 = 不属于 已完成/已取消/待重新指派）。

## 其它

- Web 端禁止 `app.callFunction`（匿名登录会 `EXCEED_AUTHORITY`），云函数走 HTTP 网关；
  小程序端反之，必须用 `wx.cloud.callFunction`。
- 改登录/权限相关文件后必须退出重登再验证。
