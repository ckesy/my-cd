# 项目长期记忆（my-cd 东风车队管理系统 · Web 端）

> 日常流水记在 `YYYY-MM-DD.md`；本文件只留跨会话仍需遵守的结论。

## 数据口径（改代码前必读）

- **运单「节点完成时间」= 下一个节点的进入时间**（链路里没有独立「完成」事件）。
- **装货地/卸货地存的是「电子围栏名称」，不是地址**：取坐标先按 `name` 反查
  `ele_fences.center`；只有文本含 省/市/区/路/街/道/号/镇/村 才走高德地理编码，
  否则围栏别名会被编码到无关坐标。
- **只有单车牌才画实时位置**：`waybills.vehicle` 多指派时退化为 `多种`/`N辆`/`--`，
  必须解析 `assignments` 里 `method === 'vehicle'` 的 `target`。
- 指派方式 key 是 **`method`**（不是 `assignMethod`）；新代码一律用 `method`。
- **常驻任务**：`is_recurring` + `recurring_group_no` 关联多条记录；次数闸门统计
  「同分组下 `accept_time` 非空或已进入执行中」的条数，**不读** `recurring_accepted_count`。
- 实时位置：`车牌 → vehicles.vin → dongfeng-lostlocation`（HTTP 网关，8s 超时，成功码 `code===1`）。

## 数据库

- CloudBase PostgreSQL 共享版，**无本地迁移工具**，DDL 写 `sql/*.sql` 交用户在控制台执行。
- ⭐ 写新字段要**降级容错**：列不存在时剥字段重试（范例 `stripRecurringFields` /
  `stripNewFields`、`CustomerArchive` 的 `insertArchive/updateArchive`）。
- ⭐ **新表必须带授权段**：Web 走匿名登录（anon），只授控制台账号会 `permission denied`。
  末尾跟 `GRANT SELECT,INSERT,UPDATE,DELETE ... TO anon,authenticated`（模板
  `sql/2026-10-18_customer_archive_grant.sql`）+ `SELECT pg_notify('pgrst','reload schema')`。
  现象：SELECT 通（列表 0 条）、写被拒。
- ⭐ **`organizations.id` / `customers.id` 是整数**：新表引用一律 `text` + 写入前 `String()`；
  声明 uuid 会报 `invalid input syntax for type uuid: "5"`。

## 状态枚举

运单（9 个）：`待接单 / 待重新指派 / 待装车 / 装车中 / 装车完成 / 已发车 / 已到达 / 已完成 / 已取消`
（`装车中` 是历史遗留）；车辆：`行驶 / 静止 / 离线`。

## 运输节点与打卡

- `transport_mode` = `极简`（接单→完成）| `详细`（接单→装车完成→确认发车→确认到达→完成）。
  动作链**唯一权威在云函数**（`actions[]` + `next_action`），小程序端不自建状态机。
- 打卡：**装车完成 → 装货地围栏**，**确认到达 → 卸货地围栏**；位置取车辆最后上报，不是手机定位。
- 几何 `ele_fences.shape`：`circle`(center+radius) / `polygon`(射线法) / `polyline`(points+bufferradius)
  / `district`(无法本地判定 → 放行 + warn)。
- Web 详情页可把 `check_in_required` 临时置 false 兜底（留痕 `check_in_off_*`）；
  该开关**必须放在 `el-form` 之外**，否则被表单 `disabled` 连带禁用。

## 电子围栏（2026-10-22 起做类型）

- 已有 `shape`（形状）+ `attr`（正常运营区域/禁行/限速），2026-10-22 新增 `fence_type`：
  `pickup / delivery / alert`（英文 key，中文仅展示），列 DEFAULT `'alert'` + CHECK 约束，
  SQL 在 `sql/2026-10-22_ele_fence_type.sql`。配色 装货 `#2563EB` / 卸货 `#0E9F6E`（文字 `#047857`）
  / 提醒 `#D97706`，**避开品牌红 `#c8102e`**。
- 列表筛选**纯本地过滤**（`applyLocalFilter` 读 `fullList`）；Tab 计数基于 `baseFiltered()`
  （类型以外的条件），否则选中某一类后其他 Tab 会变 0。
- ⭐ 坑：`WaybillCreate.vue` 装货/卸货下拉（~152/~204 行）都 `v-for="f in fenceList"`，
  **全部围栏混在一起**，选错会算错规划里程。**但过滤必须等老围栏标注完类型后再开**，
  否则老数据（全 alert）会从下拉消失、直接卡住建运单。

## 东风接口

- 轨迹 `.../api/track/history`：`carId` = **完整 VIN**，成功码 `code===1`，
  返回 `{longitude,latitude,velocity,direction,sendTime,mileage}`；CORS 全开可前端直连；
  token 支持 `VITE_DONGFENG_TOKEN` 覆盖。
- 实时位置 `dongfeng-lostlocation`，`chassisNo` = VIN 后 8 位。
- ⭐ `track/tripAnalysisOil`：**只能 POST，参数放 query，body 传 `{}`**；参数进 body 恒返 `2101 入参错误`。
- ⭐ 能耗单位：`tripMileage` 米、`sumTravelFuel` Wh、`travelSumDuration` 分钟、
  `travelAvgDuration` m/s（×3.6）、`hundredSumTravelFuel` **恒 0.02 不可用** →
  百公里电耗用「行驶电耗 ÷ 行驶里程 × 100」现算。
- ⭐ 东风能耗数据有 **1 天延迟**（当天/昨天常返 `code:3000 data:null`）→ 显示 `--` + 延迟提示。
- 里程表读数取 `track/history` 当天最大 `mileage`（米）÷1000。
- `lostlocation` 的 `address` 实际是「纬度,经度」，要真地址得用高德 Geocoder 逆编码（坐标缓存）。

## 运单进度可视化（Web）

- **唯一来源 `src/utils/waybillProgress.js`**（25s 轨迹缓存），页面别重写。
- 组件 `WaybillProgressBar.vue`（计划 vs 实际双条 + ETA）、`RecurringTaskGantt.vue`。
- 物流状态页按 `is_recurring` 分两路：常驻走甘特（**不显示地图**）、普通走「双条+地图+时间轴」，
  都 30s 刷新。
- ⭐ 已行驶 = **从 `depart_time` 起算**的轨迹点累加；剩余里程 = `plan_distance − 已行驶`
  （<0 按 0 标「已超规划里程」）；剩余时间 = `plan_duration × 剩余比例`；
  定位停更 > 30min **不给 ETA**。
- `plan_distance`/`plan_duration`/起终点坐标在**发布时用高德算一次落库**，刷新链路不调高德。
- 同车/同司机并发：同一车牌或司机在同一 `owner_account` 下只能一条未结束记录
  （未结束 = 不属于 已完成/已取消/待重新指派）。

## 运营报表（Web）

- ⭐ 列表页版式（参考 `OperationEnergy.vue`）：一行筛选（**不写 label，用 placeholder**；
  搜索红、重置/导出白，按钮紧跟控件不右对齐）→ 次要条件第二行（前缀「更多」）→
  **工具行（红色竖条 + 标题 + `共 N 条`，右上角主操作 + TableTools 四件套）** → 白卡表格
  （表头 #F7F9FC、行 padding 13px、状态圆点+文字）→ 卡片内右下分页。
  ⚠️ 工具行在**筛选下方、表格正上方**，与表格一起进 Teleport 包裹层，全屏才铺满。
  页面底 #F5F7FA、控件高 32 圆角 8。
- 菜单共用 `operation` 权限 key：综合报表 `/operation/summary`、能耗 `/operation/energy`、
  驾驶行为 `/operation/driving`。
- 能耗报告用 `energy_report_tasks`（`sql/2026-10-19_energy_report.sql`），一任务一行，
  **数据整包存 `report_data jsonb`**；详情页 `/operation/energy/report?task_no=` 照
  `设计-方案C2-青绿能源-数据前置.html` 1:1。
- 🚫 **不要再用 echarts**：图表用 `src/utils/svgCharts.js`（combo/hbars/radar/donut/area/scatter）
  + `components/charts/SvgPlot.vue`（`EChart.vue` 已删）。⚠️ 电耗折线不能 0 基线，
  用 `lineBand()` 给 ±2 窗口，否则是直线。
- 接口封装统一 `src/utils/dongfengReport.js`。

## 档案管理（客户 / 货物档案）

- 菜单在 `系统管理` 上方，权限 key `customer_archive` / `cargo_archive`。
- ⭐ **客户档案 ≠ `customers` 表**（后者是登录租户）：用 `customer_archives` + `customer_contacts`
  （`sql/2026-10-18_customer_archive.sql`）。角色 `roles` 存 CSV：`装货`/`卸货`/`唯一`
  （唯一 = 两端都带入）；建运单时同角色 1 个自动带入、多个让用户选。
- ⭐ **四件套统一 `components/TableTools.vue`**（刷新/密度/列设置/全屏），别手写；
  全屏只给状态，铺满样式页面自己加。
- 省市区数据在 `src/utils/regionData.js`；合同附件存 `contract_data`（base64 ≤5MB）+ `has_contract`。

## 图片 / el-table 坑

- ⭐ **`reports.images` 存 COS 对象 `{key,name,size}`，不是可显示地址**：展示前必须
  `signGet([key])`（`@/utils/cos`）换临时链接，直接塞 `<el-image :src>` 100% 走 error 插槽。
  签名 1h 过期 → 缓存 TTL 50min。参考 `FeeList.vue` 的 `normImgs`/`loadImgUrls`。
  ⚠️ **不要跨费用项汇总图片**：一笔费用一张卡 + 卡内凭证。
- ⭐ 动态列：① `el-table-column` 外层包 `<template v-for>` 会被拆成 Fragment，列注册不上 →
  直接对 `el-table-column` 用 `v-for`；② 列配置须显式 `visible: true`。
- ⭐ 展开列 `type="expand"` 天生占一列：要换触发位置就留 `width="1"` + 只藏
  `.el-table__expand-icon`，用 `:expand-row-keys` + `toggleRowExpansion(row)` 受控。
  **绝不能对 `.el-table__expand-column` 的 td 写 `display:none`**（后续 td 左移、与 fixed 列错位）。
- ⚠️ 列宽超出容器是**「压扁」不是横向滚动**：窄列固定 `width`，宽列 `minWidth`，合计留余量。

## 字号与对比度（用户反馈"看不清"后定的规范）

| 元素 | 字号 | 颜色 | 字重 |
|---|---|---|---|
| 表头 | 12px | `#475569` | 700 |
| 主数字（金额） | 15.5px | `#0F172A` | 800 |
| 主文字 | 13px | `#0F172A` | 600 |
| 次要文字（单号/车牌） | 12px | `#94A3B8` | 400 |
| 时间 | 12.5px | `#64748B` | 400 |
| 状态 | 12.5px | 语义色 | 700 |
| 小标签 | 11px | `#475569` / `#EEF2F7` 底 | 600 |
| 行高 | `td padding 13px` | — | — |

⭐ ① 正文不小于 11.5px（≤10px 只许用在徽标）；② 次要文字最低 `#94A3B8`，不要
`#B4BECB`/`#C4CDD9`；③ 表头必须 700 + `#475569`。
⭐ 数字统一 `var(--num-font)`（系统无衬线）+ `tabular-nums`，**别用 Courier 等宽**。

## 布局 / 弹窗（Web 外壳）

- ⭐ **页面根节点别写 `100vh`**（外壳吃掉 48+36+1+16）：用 `calc(100vh - 101px)`，或
  `.content-wrapper:has(.xxx-page){height:100%;overflow:hidden;padding:0}` + 页面 `height:100%`。
  ⚠️ 子元素 `height:100%` 要求父级高度确定，`.content-wrapper` 只有 `min-height:100%`。
- ⭐ 含表格的页面：`.page{height:100%;min-height:0;overflow:hidden}` + 卡片 `flex:1;min-height:0`
  + `<el-table height="100%">` → 表格内部滚、页面不动。
- ⭐ **主内容区的 `el-dialog` 必须 `append-to-body`**：`.content-wrapper` 上 `animate-fade-up`
  的 transform（结束后仍是 `matrix(...)`）会把 `position:fixed` 变成相对祖先定位。
- ⭐ `el-dialog` 根元素就是传入的 class，`:deep(.my-dialog .el-dialog)` 永不命中；
  且 `append-to-body` 后脱离 scoped → 这类样式写进**全局 `<style>`**。
- 「永不滚动」：`.el-dialog` flex 列 + `max-height: calc(100vh - 5vh - 16px)` + `margin-bottom:0`；
  header/footer `flex:0 0 auto`；body `flex:1;min-height:0;overflow:hidden`；
  主区块 `flex:0 1 520px;min-height:200px`。
- ⚠️ **AMap 2.0 marker 用 `hide()/show()`**，`setVisible()` 不生效；`setMapStyle` 当前 key 下无效
  → 深色底图上 CSS `filter`（会连折线反相，折线改画独立 SVG 图层）。
- ⚠️ 全屏必须去祖先 transform：
  `.content-wrapper:has(.fullmap.is-fs){transform:none!important;animation:none!important}`。
- 左侧导航：`el-aside` 64/220 + `.nav-shell` 绝对定位做宽度动画，`pinned` 才真加宽；
  状态存 `localStorage.nav_pinned`。
- 验证：headless Edge + CDP（先注入 `localStorage.currentUser` 再 `Page.navigate`），
  量 `scrollHeight - clientHeight`。

## 启动 / 登录态

- ⭐ **`main.js` 启动即 `ensureAnonymousLogin()`，成功后再查 `vehicles` 做连通性检查**。
  以前只在登录页和综合报表挂载时登录 → 从书签直进业务页时登录态已过期 → 整站查询全失败
  （`FetchError: undefined`），列表像"没数据"。
- ⭐ 前端只有 `app.rdb()`（CloudBase），**不是真 Supabase**：`curl` 带 anon key 直连 REST 一定 401，
  别用它判断连库；看 console 的 `✅ 数据库连接成功`。
- Web 端禁止 `app.callFunction`（匿名登录会 `EXCEED_AUTHORITY`），云函数走 HTTP 网关；
  小程序端反之必须 `wx.cloud.callFunction`。改登录/权限后必须退出重登再验证。
