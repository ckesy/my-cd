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

- ⭐ **列表页版式（2026-10-19 起，照「综合报表 · 明细表」）**：
  一行筛选（**控件不写 label，用 placeholder**，搜索红/重置·导出白，按钮紧跟控件不右对齐）→
  次要条件放第二行（前缀「更多」）→ **工具行（红色竖条 + 标题 + `共 N 条`，右上角主操作 + TableTools 四件套）**
  → 白卡表格（表头 #F7F9FC、行 padding 13px、状态用**圆点+文字**）→ 卡片内右下分页。
  ⚠️ 工具行在**筛选下方、表格正上方**（不是页面顶部），且要和表格一起放进 Teleport 包裹层，
  这样全屏时工具行也铺满。页面底色 #F5F7FA、控件高 32 圆角 8。
  参考实现：`src/views/OperationEnergy.vue`。
- 菜单：运营管理 → 综合报表 `/operation/summary`、能耗报告 `/operation/energy`、
  驾驶行为报表 `/operation/driving`，三项共用 `operation` 权限 key。
- ⭐ **能耗报告已不是占位页**（2026-10-19）：`energy_report_tasks`（`sql/2026-10-19_energy_report.sql`）
  一个任务一行，**报告数据整包存 `report_data jsonb`**；新建只落「待生成」，取数接口还没接。
  详情页 `/operation/energy/report?task_no=` 是车队分析报告，版式照设计稿
  `设计-方案C2-青绿能源-数据前置.html` 1:1（青绿 Bento：01 统计数据 + 02 分析视图 + 关键洞察）。
  图表用 `src/utils/svgCharts.js`（手写 SVG：combo/hbars/radar/donut/area/scatter）+
  `components/charts/SvgPlot.vue` 挂载，**不要再用 echarts** 重画这套（EChart.vue 已删）。
  ⚠️ 电耗折线轴不能 0 基线，用 `lineBand()` 给 ±2 窗口，否则曲线是一条直线。
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

- ⭐ **`reports.images` 存的是 COS 对象 `{ key, name, size }`，不是能直接显示的地址**。
  要展示必须先 `signGet([key])`（`@/utils/cos`）换临时链接，
  直接塞 `<el-image :src>` 会 100% 走 error 插槽（现象：全部显示"无图/加载失败"）。
  签名 1 小时过期，缓存加 TTL（50 分钟）否则页面挂久了变 403。
  参考实现：`FeeList.vue` 的 `normImgs` / `loadImgUrls` / `curCards`，
  以及 `PaymentVouchers.vue`、`waybill-detail.vue` 的 `imageUrls`。
  ⚠️ 且**不要跨费用项汇总图片**：一张图属于哪笔费用必须就地展示，
  否则用户分不清对应关系（费用明细抽屉已改为「一笔费用一张卡 + 卡内凭证」）。

- ⭐ el-table 动态列两个坑：
  1. `el-table-column` 外层包 `<template v-for>` 会被拆成 Fragment，列注册不上
     （表头空、行渲染成空 tr）→ 直接对 `el-table-column` 用 `v-for`；
  2. 列配置必须显式写 `visible: true`，否则 `filter(c => c.visible)` 会把列全部过滤掉。
- ⭐ el-table 展开列（`type="expand"`）是**唯一**能挂展开内容的入口，但它天生占一列。
  要「按钮换个地方」：列留 `width="1"` 当挂载点 + 只藏 `.el-table__expand-icon`，
  触发按钮画到别的单元格里，用 `:expand-row-keys` + `toggleRowExpansion(row)` 受控。
  **绝不能对 `.el-table__expand-column` 的 td 写 `display:none`** —— 该行后续 td 会整体
  左移一格，和 fixed 左列错位（状态列被盖住）。EP 2.14 展开行类名是
  `.el-table__expanded-cell`（没有 `el-table__expanded-row`）。
- 表格里的数字统一 `font-family: var(--num-font)`（系统无衬线）+ `tabular-nums`，
  **不要用 Courier 等宽**：13px 下笔画太细，屏幕上看不清。`--num-font` 定义在页面根节点。
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
- ⭐ 页面里**含表格**时（如用户管理）：`.page{height:100%;min-height:0;overflow:hidden}` +
  卡片 `flex:1;min-height:0` + `<el-table height="100%">` → 表格内部滚、页面不动。
- ⚠️ 子元素 `height:100%` 要求父级高度确定：`.content-wrapper` 只有 `min-height:100%`，
  必须在 Dashboard 里补 `.content-wrapper:has(.xxx-page){padding:0;height:100%;overflow:hidden}`。
- ⚠️ **AMap 2.0 的 marker 用 `hide()/show()`**，`setVisible()` 不生效；
  `map.setMapStyle('amap://styles/xxx')` 在当前 key 下也不生效（实测无反应），
  要深色底图就上 CSS `filter`（但会连折线一起反相 → 折线改画独立 SVG 图层）。
- ⚠️ 全屏（fixed 铺满视口）必须去掉祖先 transform：
  `.content-wrapper:has(.fullmap.is-fs){transform:none!important;animation:none!important}`。
- 左侧导航：`el-aside` 宽 64/220 + 内部 `.nav-shell` 绝对定位做宽度动画，
  悬停浮层不推挤、`pinned` 才真加宽；状态存 `localStorage.nav_pinned`。

## 档案管理（客户档案 / 货物档案）

- 菜单在 `系统管理` 上方，权限 key：`customer_archive` / `cargo_archive`。
- ⭐ **客户档案 ≠ `customers` 表**。`customers` 是登录租户（手机号+密码+平台权限）；
  客户档案是业务发货/收货方，用 `customer_archives` + `customer_contacts`
  （`sql/2026-10-18_customer_archive.sql`）。
- 联系人角色 `roles` 存 CSV：`装货` / `卸货` / `唯一`（唯一 = 两端都带入）。
  建运单时按角色过滤：同角色 1 个自动带入，多个让用户选；`唯一` 会连另一端的
  客户和电话一起填。字段落在 waybills 的 `customer_archive_*` / `*_contact_*`。
- ⭐ **列表四件套统一用 `components/TableTools.vue`**（刷新 / 密度 / 列设置 / 全屏），
  别再在页面里手写一遍；全屏只给状态，铺满样式由页面自己加。
- ⚠️ **el-table 列宽超出容器时是「压扁」不是横向滚动**：窄列（状态/操作）用固定
  `width`，宽列用 `minWidth`，且宽度合计要小于容器宽度并留余量。
- 省市区数据统一在 `src/utils/regionData.js`（`PROVINCE_OPTIONS` / `REGION_CASCADER`）。
- 合同附件临时存 `contract_data`（base64，≤5MB）+ `has_contract`，列表不拉内容。

## 数据库授权与 ID 类型（踩过两次）

- ⭐ **新建业务表必须带授权段**：Web 端走匿名登录（anon 角色），表建完只授了控制台账号，
  前端 INSERT/UPDATE/DELETE 一律 `permission denied`。建表脚本末尾必须跟
  `GRANT SELECT, INSERT, UPDATE, DELETE ... TO anon/authenticated`（模板见
  `sql/2026-10-18_customer_archive_grant.sql`），并 `SELECT pg_notify('pgrst','reload schema')`。
  现象提示：SELECT 通（列表 0 条）、写操作被拒。
- ⭐ **`organizations.id` / `customers.id` 是整数**（不是 uuid）。新表引用它们一律 `text`，
  前端写入前 `String()`；声明成 uuid 会报 `invalid input syntax for type uuid: "5"`。
  自建表的 `id` 若用 `gen_random_uuid()` 则确实是 uuid（如 `customer_archives.id`）。
- 前端对新字段/新表一律做**降级重试**（WaybillCreate 的 `stripNewFields`、
  CustomerArchive 的 `insertArchive/updateArchive`）：命中类型/列不存在错误就剥字段重试，
  别让没跑迁移的环境直接不可用。

## 列表页字号与对比度（2026-10-21 起）

用户反馈"看不清"，实测是**字号偏小 + 次要文字太淡**。统一规范：

| 元素 | 字号 | 颜色 | 字重 |
|---|---|---|---|
| 表头 | 12px | `#475569` | 700 |
| 主数字（金额） | 15.5px | `#0F172A` | 800 |
| 主文字（名称） | 13px | `#0F172A` | 600 |
| 次要文字（单号/车牌） | 12px | `#94A3B8` | 400 |
| 时间 | 12.5px | `#64748B` | 400 |
| 状态 | 12.5px | 语义色 | 700 |
| 小标签（类型） | 11px | `#475569` / `#EEF2F7` 底 | 600 |
| 行高 | `td padding 13px` | — | — |

⭐ 三条硬规矩：
1. **正文不小于 11.5px**，10px 及以下只有在徽标里才允许
2. **次要文字不要用 `#B4BECB` / `#C4CDD9`** —— 浅色底上基本看不见，
   最低用 `#94A3B8`
3. 表头别用 11px + `#64748B`，加粗到 700 + `#475569` 才立得住

## ⭐ CloudBase 必须在启动时匿名登录（2026-10-21 修）

**现象**：整站查询全失败（`FetchError: undefined`），所有列表像"没数据"。

**根因**：`ensureAnonymousLogin()` 只在两个地方调：
- `LoginView.vue`（点登录时）
- `OperationTable.vue`（综合报表页挂载时）

`main.js` 启动时**直接查库**，没有先登录。所以：
- 走登录页进来的 → 有登录态，正常
- **直接从书签/上次会话进业务页**（localStorage 还有 currentUser，跳过登录）→
  CloudBase 登录态已过期 → 每次查询都失败，整站数据为空

**修**：`main.js` 启动即 `ensureAnonymousLogin()`，成功后再查 `vehicles` 做连通性检查：
```js
ensureAnonymousLogin()
  .then(() => supabase.from('vehicles').select('*', { count: 'exact', head: true }))
  .then(({ error }) => error ? console.error('❌ 数据库查询失败:', error.message)
                            : console.log('✅ 数据库连接成功'))
```

⭐ 前端只有 `app.rdb()`（CloudBase），**不是真 Supabase**。
`curl` 带 `.env` 里的 anon key 直连 REST 一定 401（网关不认那个 key），
别用它判断"有没有连上库" —— 要在浏览器里看 console 的 `✅ 数据库连接成功`。
