# 项目长期记忆（my-cd 东风车队管理系统 · Web 端）

> 日常流水记在 `YYYY-MM-DD.md`；这里只留跨会话必须遵守的结论。

## 数据口径（改代码前必读）

- 🔴 `waybills` **没有 update_time / updated_at**（74 列）。写 PostgREST select 前先 `select=*&limit=1` 核对真实列名，凭记忆加列 → 整页 42703。
- `vehicles` 实际 21 列：id, plate, vin, nickname, org, driver, fuel_type, vehicle_type, usage,
  sub_vehicle, trailer, purchase_date, insurance_date, created_at, updated_at, customer_id,
  device_id, terminal_id, **remark**, org_id, fleet_name。**没有任何证件/到期字段**。
- **常驻任务收口只认 `recurring_status`**；续建复活由写入侧（`WaybillCreate`）负责，读取侧不要用"组里还有活"覆盖状态。
- 运单「节点完成时间」= 下一个节点的进入时间（链路里没有独立"完成"事件）。
- 装货/卸货地存的是**电子围栏名称**不是地址：先按 `name` 反查 `ele_fences.center`；只有文本含 省/市/区/路/街/道/号/镇/村 才走高德地理编码。
- 只有**单车牌**才画实时位置：多指派时 `waybills.vehicle` 退化为 `多种/N辆/--`，必须解析 `assignments` 里 `method === 'vehicle'` 的 target。指派方式 key 是 **`method`**。
- 常驻次数闸门统计「同组下 accept_time 非空或已进入执行中」的条数，不读 `recurring_accepted_count`。
- 实时位置：`车牌 → vehicles.vin → dongfeng-lostlocation`（HTTP 网关，8s 超时，`code===1`）。

## 数据库

- CloudBase PostgreSQL 共享版，**无本地迁移工具**，DDL 写 `sql/*.sql` 交用户在控制台执行。
- ⭐ 写新字段/新表要**降级容错**：列不存在时剥字段重试（范例 `stripRecurringFields`、`CustomerArchive.insertArchive`）。
- ⭐ **新表必须带授权段**：Web 走匿名登录（anon），末尾跟
  `GRANT SELECT,INSERT,UPDATE,DELETE ... TO anon,authenticated;` + `SELECT pg_notify('pgrst','reload schema');`
  （模板 `sql/2026-10-18_customer_archive_grant.sql`）。现象：SELECT 通（0 条）、写被拒。
- ⭐ **`organizations.id` / `customers.id` 是整数**：新表引用一律 `text` + 写入前 `String()`，声明 uuid 会报语法错。

## 权限 / 皮肤 / 审批

- ⭐ `tenant_modules.granted`（运营授权，只有服务商能写 true）与 `enabled`（客户开关）分离；客户只能改 enabled 且要求 granted=true。
- ⭐ 客户主账号在 `admins` 里也是 `role='admin'`；登录命中 `customers`（按 phone）标 `isTenantOwner`，
  `isFlowAdmin` 对这类账号**只认 `isImpersonating()`**。改完必须重新登录（身份写进 localStorage）。
- ⭐ **`config/permissions.js` 是权限唯一来源，必须与侧边栏菜单一一对应**：加菜单就要加一行，否则配置弹窗没有、角色永远勾不上。老 key 兼容统一走 `PERM_ALIAS` + `permHit()`（SidebarMenu 与 Dashboard 共用）。
- 独立 key：`operation_summary/energy/driving`、`waybill_stats`、`fee_list`、`report`、`flow`、`fee_payout`、`customer_archive`、`cargo_archive`。`system` 仍是共用 key 且不可配。
- 放开「业务流程/付款登记」要同改 4 处：permissions.js、SidebarMenu、Dashboard.isPermitted、`feeTodo.isPayer`。
- 皮肤按账号存：本地 `app_theme:<account>`，远端 `users.theme`；`accountOf` 不取 masterAccount。
- ⭐ 审批链 `flow[].approver_id` 是提交那一刻的账号 id；`role==='finance'` 节点必须允许「财务岗/主账号」兜底，三处同口径：`feeTodo.canApproveReport`、`waybill-detail.canApprove`、`FeeList.drawerActions`。
- 费用勾选只对「待审核」开放；已打款要驳回必须先撤销付款。驳回可选笔，未勾=整组。
- 运单列表「待我审批」**不能叠加**「常驻只留 trip_seq=1」过滤，否则会整条滤掉。

## 常驻任务（is_recurring）显示口径

- ⭐⭐⭐ **常驻任务 = 一单**（2026-10-24 定稿）：一个 `recurring_group_no` 列表只占一行；**Web 每发布一次 = 新组号（`CZ+单号后12位`）**，`reuseGroup` 恒 false；第 N 趟只能由司机在小程序「接一趟」产生。
- Web 查询加 `or(is_recurring.is.null,is_recurring.eq.false,trip_seq.eq.1)`；编号列显示组号 `CZ…` + 「共 N 趟·最新第 M 趟」；`displayTime` 取组内最新一趟；`displayStatus` 用任务级状态；费用按整组合计；「待接单」筛选要 `or('status.eq.待接单,is_recurring.eq.true')`。
- 管理端 `waybill-admin.actionList = [...liveRec, ...normal, ...settledRec]`；组卡日期：未收口→最近动静那天，已结束/暂停→最近完成那天。⚠️ 改完必须重新部署云函数。

## 交付习惯（用户明确要求）

- ⭐ **每次改了云函数都要给完整代码**：`present_files` 打开 `cloudfunctions/<name>/index.js` + 打 `<name>.zip`（index.js / package.json 放 zip 根目录，别带目录前缀）。只给 diff 不算交付。

## 状态枚举

- 运单 9 态：待接单/待重新指派/待装车/装车中/装车完成/已发车/已到达/已完成/已取消（`装车中` 是历史遗留）
- 车辆：行驶/静止/离线

## 运输节点与打卡

- `transport_mode` = 极简（接单→完成）| 详细（接单→装车完成→确认发车→确认到达→完成）；动作链**唯一权威在云函数**（`actions[]` + `next_action`）。
- 打卡：装车完成→装货地围栏，确认到达→卸货地围栏；位置取车辆最后上报。
- 几何 `ele_fences.shape`：circle/polygon（射线法）/polyline（points+bufferradius）/district（放行+warn）。
- Web 详情可临时置 `check_in_required=false` 兜底（留痕 `check_in_off_*`）；该开关**必须在 el-form 之外**，否则被 disabled 连带。

## 电子围栏

- `fence_type`：`pickup/delivery/alert`（英文 key，中文仅展示），DEFAULT `'alert'` + CHECK。配色装货 `#2563EB` / 卸货 `#0E9F6E` / 提醒 `#D97706`，**避开品牌红**。
- 列表筛选**纯本地**（`applyLocalFilter` 读 `fullList`）；Tab 计数基于 `baseFiltered()`。
- ⭐ `WaybillCreate` 装货/卸货下拉共用 `fenceList`（全部围栏混在一起），**过滤必须等老围栏标注完类型后再开**，否则老数据消失、卡住建单。

## 东风接口

- 轨迹 `.../api/track/history`：`carId` = **完整 VIN**，`code===1`，返回 `{longitude,latitude,velocity,direction,sendTime,mileage}`；CORS 全开可前端直连。
- 实时位置 `dongfeng-lostlocation`，`chassisNo` = VIN 后 8 位。
- ⭐ `track/tripAnalysisOil`：**只能 POST，参数放 query，body 传 `{}`**；参数进 body 恒返 `2101`。
- ⭐ 能耗单位：`tripMileage` 米、`sumTravelFuel` Wh、`travelSumDuration` 分钟、`travelAvgDuration` m/s(×3.6)、`hundredSumTravelFuel` 恒 0.02 不可用 → 百公里电耗现算。
- ⭐ 能耗数据有 **1 天延迟**（当天/昨天返 `code:3000 data:null`）→ 显示 `--` + 延迟提示。里程表读数取当天最大 `mileage`(m)÷1000。
- `lostlocation.address` 实际是「纬度,经度」，真地址要逆地理编码（缓存）。

## 运单进度可视化

- **唯一来源 `src/utils/waybillProgress.js`**（25s 轨迹缓存）；组件 `WaybillProgressBar`（双条+ETA）、`RecurringTaskGantt`。
- 物流状态页：常驻走甘特（不显示地图），普通走「双条+地图+时间轴」，30s 刷新。
- 已行驶 = 从 `depart_time` 起算累加；剩余里程 = `plan_distance − 已行驶`（<0 标「已超规划里程」）；定位停更 >30min 不给 ETA。
- `plan_distance/plan_duration/起终点坐标` 在发布时用高德算一次落库，刷新链路不调高德。
- 同车/同司机在同一 `owner_account` 下只能一条未结束记录（未结束 ≠ 已完成/已取消/待重新指派）。

## 列表页版式（参考 OperationEnergy.vue）

- 一行筛选（**不写 label，用 placeholder**；主按钮红、重置/导出白、紧跟控件不右对齐）→ 次要条件第二行（前缀「更多」）→ **工具行（红竖条+标题+`共 N 条`，右上角主操作 + TableTools 四件套）** → 白卡表格（表头 #F7F9FC、`td padding 13px`、状态圆点+文字）→ 卡片内右下分页。
- ⚠️ 工具行在**筛选下方、表格正上方**，与表格一起进 Teleport 包裹层，全屏才铺满。页面底 #F5F7FA、控件高 32 圆角 8。
- 🚫 **不要用 echarts**：图表用 `src/utils/svgCharts.js`（combo/hbars/radar/donut/area/scatter）+ `components/charts/SvgPlot.vue`。⚠️ 电耗折线不能 0 基线，用 `lineBand()` 给 ±2 窗口。
- 运营报表接口统一 `src/utils/dongfengReport.js`；能耗报告存 `energy_report_tasks.report_data jsonb`。

## 档案管理

- 菜单在「系统管理」上方，**一个一级分组装四项**：车辆档案 / 司机档案 / 客户档案 / 货物档案（2026-10-25 车辆+司机从原「基础数据管理」整组并入，该分组已删除）。
- 路由统一 `/archive/vehicle|driver|customer|cargo`；老地址 `/vehicle-archive`、`/driver-archive` 保留成 redirect，别删。要同步改 5 处：router、SidebarMenu、Dashboard 的模板判定 / `routePermissionMap` / `pathLabels`、`config/permissions.js`。
- 权限：车辆 `vehicle_archive`、司机 `driver_archive`（老数据里有，菜单项照挂 v-if）；客户 `customer_archive`、货物 `cargo_archive`（历史权限数据里没有 → 分组与这两项**暂时不挂 v-if**，一挂整组消失）。
- ⭐ **客户档案 ≠ `customers` 表**：用 `customer_archives` + `customer_contacts`。`roles` 存 CSV（装货/卸货/唯一），建运单时同角色 1 个自动带入、多个让选。
- ⭐ **四件套统一 `components/TableTools.vue`**（刷新/密度/列设置/全屏），别手写。
- 省市区在 `src/utils/regionData.js`；合同附件存 `contract_data`（base64 ≤5MB）+ `has_contract`。

## 图片 / el-table 坑

- ⭐ **凭证图加载不出来先查 COS 欠费（HTTP 451）**：签名服务照常返 URL 但 GET 返回 451。诊断 `uploadPhoto{action:'signGet'}` → `curl -w %{http_code}`。云函数 `signGet` 单次只签 20 个 key，前后端都要分批；展示统一 `signGetCached`（50min TTL + `forgetCosUrl`），`@error` 重签 ≤2 次并用 `:key` 逼重建。
- ⭐ `reports.images` 存 COS 对象 `{key,name,size}`，展示前必须 `signGet([key])`；不要跨费用项汇总图片（一笔一张卡）。
- ⭐ 一单多司机费用按上报人区分：`reports` 无 driver_id，认 `driver_name|plate|driver_phone`；小程序非管理端必须补 `driver_phone=eq.`。文案叫「上报人/我的上报」，别写「子母车」。
- ⭐ 动态列：`el-table-column` 外层别包 `<template v-for>`（会变 Fragment 注册不上）；列配置须显式 `visible:true`。
- ⭐ 展开列 `type="expand"` 天生占一列：要换触发位置就 `width="1"` + 只藏 `.el-table__expand-icon`，用 `:expand-row-keys` + `toggleRowExpansion` 受控。**绝不能对展开列 td 写 display:none**。
- ⚠️ 列宽超容器是「压扁」不是横向滚动：窄列固定 `width`，宽列 `minWidth`。

## 字号与对比度

| 元素 | 字号 | 颜色 | 字重 |
|---|---|---|---|
| 表头 | 12px | #475569 | 700 |
| 主数字（金额） | 15.5px | #0F172A | 800 |
| 主文字 | 13px | #0F172A | 600 |
| 次要文字 | 12px | #94A3B8 | 400 |
| 时间 | 12.5px | #64748B | 400 |
| 状态 | 12.5px | 语义色 | 700 |
| 小标签 | 11px | #475569 / #EEF2F7 | 600 |

⭐ 正文 ≥11.5px（≤10px 只许徽标）；次要文字最低 `#94A3B8`；数字统一 `var(--num-font)` + `tabular-nums`，别用 Courier。

## 布局 / 弹窗

- ⭐ **页面根节点别写 `100vh`**（外壳吃 101px）：用 `calc(100vh - 101px)`，或 `.content-wrapper:has(.xxx-page){height:100%;overflow:hidden;padding:0}` + 页面 `height:100%`。
- 含表格页面：`.page{height:100%;min-height:0;overflow:hidden}` + 卡片 `flex:1;min-height:0` + `<el-table height="100%">`。
- ⭐ 主内容区 `el-dialog` **必须 append-to-body**（`.content-wrapper` 上的 transform 会把 fixed 变相对祖先定位）；样式写进**全局 `<style>`**（`append-to-body` 后脱离 scoped，`:deep(.my-dialog .el-dialog)` 永不命中）。
- 「永不滚动」：dialog flex 列 + `max-height: calc(100vh - 5vh - 16px)`；body `flex:1;min-height:0;overflow:hidden`。
- ⚠️ AMap 2.0 marker 用 `hide()/show()`，`setVisible()` 无效；深色底图用 CSS filter（折线要独立 SVG 图层）。
- 全屏必须去祖先 transform：`.content-wrapper:has(.fullmap.is-fs){transform:none!important;animation:none!important}`。
- 左侧导航：`el-aside` 64/220 + `.nav-shell` 绝对定位做宽度动画，`pinned` 才真加宽；状态存 `localStorage.nav_pinned`。

## 启动 / 登录态

- ⭐ `main.js` 启动即 `ensureAnonymousLogin()`，成功后再查 `vehicles` 做连通性检查。以前只在登录页登录 → 书签直进业务页全是 `FetchError: undefined`，列表像"没数据"。
- ⭐ 前端只有 `app.rdb()`（CloudBase），**不是真 Supabase**：`curl` 带 anon key 直连 REST 一定 401，别用它判断连库；看 console 的 `✅ 数据库连接成功`。
- Web 禁止 `app.callFunction`（匿名登录会 `EXCEED_AUTHORITY`），云函数走 HTTP 网关；小程序反之必须 `wx.cloud.callFunction`。
- 可用脚本：`tools/db-doctor.mjs`（只读体检，含匿名登录 + REST 通道，可直接改写成临时查询脚本）。
