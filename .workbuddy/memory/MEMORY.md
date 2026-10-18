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

## 运营报表（Web）

- 菜单：运营管理 → 综合报表 `/operation/summary`、能耗报告 `/operation/energy`、
  驾驶行为报表 `/operation/driving`，三项共用 `operation` 权限 key。
- 接口封装统一在 `src/utils/dongfengReport.js`，**别在页面里另写一套**。
- ⭐ `track/tripAnalysisOil`：**只能 POST，参数放 query，body 传 `{}`**；
  参数写进 body 会一直返回 `2101 入参错误`（东风侧报错）。
- ⭐ 能耗接口单位：`tripMileage` 米、`sumTravelFuel` Wh、`travelSumDuration` 分钟、
  `travelAvgDuration` m/s（×3.6 → km/h）、`hundredSumTravelFuel` **恒为 0.02 不可用**，
  百公里电耗用「行驶电耗 ÷ 行驶里程 × 100」现算。
- 累计里程（里程表读数）不在能耗接口里，取 `track/history` 当天最大 `mileage`（米）÷1000。
- 当前位置：`dongfeng-lostlocation` 的 `address` 实际是「纬度,经度」，
  要真实地址得用高德 JS Geocoder 逆地理编码（坐标缓存，别每刷一次都请求）。
- ⭐ 东风能耗数据有 **1 天左右延迟**：查「当天/昨天」常返回 `code:3000 查询成功 data:null`，
  按「无数据」处理（显示 `--`），页面要给出延迟提示，别让用户以为系统坏了。
- 表格数字字体统一用 `--num-font`（系统无衬线，不用 Courier 等宽）。
- 数据呈现方案稿：`综合报表-呈现方案.html`（日历热力 / 车辆×日期矩阵 / KPI+双轴 /
  排行 / 24h 剖面 五个版本）。

## 其它

- ⭐ el-table 动态列两个坑：
  1. `el-table-column` 外层包 `<template v-for>` 会被拆成 Fragment，列注册不上
     （表头空、行渲染成空 tr）→ 直接对 `el-table-column` 用 `v-for`；
  2. 列配置必须显式写 `visible: true`，否则 `filter(c => c.visible)` 会把列全部过滤掉。
- Web 端禁止 `app.callFunction`（匿名登录会 `EXCEED_AUTHORITY`），云函数走 HTTP 网关；
  小程序端反之，必须用 `wx.cloud.callFunction`。
- 改登录/权限相关文件后必须退出重登再验证。

## 布局 / 弹窗（Web 外壳）

- ⭐ **页面根节点高度不要写 `100vh`**。外壳吃掉了 48(header) + 36(tabs) + 1 + 16(内边距)，
  写 `100vh` 必定整页上下滚。做法二选一：`calc(100vh - 101px)`，或更稳的
  `.content-wrapper:has(.xxx-page){height:100%;overflow:hidden;padding:0}` + 页面 `height:100%`。
- ⭐ **`el-dialog` 放在主内容区里必须加 `append-to-body`**：`.content-wrapper` 上有
  `animate-fade-up` 的 transform（keyframes 结束后仍是 `matrix(...)`），
  会让 `position: fixed` 变成「相对该祖先定位」，弹窗一高就把 `el-main` 撑出滚动条、底部被切。
- ⭐ `el-dialog` 的**根元素就是**你传进去的 class（`.el-dialog.my-dialog`），
  所以 `:deep(.my-dialog .el-dialog)` 永远匹配不到；而且 `append-to-body` 后脱离 scoped，
  这类样式只能写进**全局 `<style>`**。
- 弹窗要「永不滚动」的写法：`.el-dialog` 用 flex 列 + `max-height: calc(100vh - 5vh - 16px)`
  + `margin-bottom: 0`；header/footer `flex:0 0 auto`；body `flex:1;min-height:0;overflow:hidden`；
  内部主区块 `flex: 0 1 520px; min-height: 200px`（矮屏压缩内容，不撑出滚动）。
- 验证手段：headless Edge（`--headless=new --remote-debugging-port`）+ 原生 WebSocket 走 CDP，
  先注入 `localStorage.currentUser` 再 `Page.navigate`，量 `scrollHeight - clientHeight`。
