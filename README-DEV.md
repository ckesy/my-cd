东风车队管理系统 — 开发交接文档（含小程序端）
新对话开场白：把本文件完整粘贴给 AI，并说明「接着做 XXX」即可无缝续接。

最后更新：2026-10-16（第六版 · 小程序端司机端骨架 + Web 端司机账号治理）

一、项目概况
项	Web 端	小程序端
项目名称	东风车队管理系统	东风车队（司机端）
技术栈	Vue 3 + Vite + Element Plus + 高德 JS API	uni-app (Vue 3 + Vite) → 微信小程序
代码仓库	https://github.com/ckesy/my-cd	https://github.com/ckesy/my-cd-miniprogram
本地路径	/Users/lyn/my-cd	/Users/lyn/my-cd-miniprogram
启动命令	npm run dev	npm run dev:mp-weixin
部署方式	push main → CloudBase 自动构建	微信开发者工具手动上传 → 设为体验版
线上地址	https://wuxian-token-d0guymjkpadcd1f22-1447716425.tcloudbaseapp.com/	体验版二维码（暂无正式地址）
AppID	—	wx88a7b64684f68cef
开发者工具导入目录	—	/Users/lyn/my-cd-miniprogram/dist/dev/mp-weixin
小程序关键信息：

微信云开发个人版（19.9 元/月）已开通 + 关联腾讯云环境

CloudBase 环境 ID：wuxian-token-d0guymjkpadcd1f22

匿名登录：已开启

服务类目：工具 → 实用工具 → 办公效率

二、后端与云服务
平台：腾讯云 CloudBase（个人版）

环境 ID：wuxian-token-d0guymjkpadcd1f22

数据库：CloudBase PostgreSQL（共享版）

身份认证：CloudBase 匿名登录（signInAnonymously）

Web SDK：@cloudbase/js-sdk（src/utils/supabase.js 初始化）

小程序 SDK：wx.cloud 原生调用，云函数内用 Node 18 内置 fetch（不用 axios）

安全域名：wuxian-token-d0guymjkpadcd1f22-1447716425.tcloudbaseapp.com

HTTP 网关：https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com

API 网关（小程序 HTTP 用）：https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com

认证端点：/auth/v1/signin/anonymously

数据库 REST：/v1/rdb/rest

三、🔑 Key / Token 速查
高德
名称	值
JS API Key	273f5c474604b71906674aac159b8f45
Web 服务 Key	491d5475803e65c06ba6169bdaf3e1f3
猎鹰 SID	1078871
数字签名	必须关闭
猎鹰 API	必须勾选
驾车路径规划	必须勾选
IP 白名单	必须留空
东风
名称	值
Token	c40c7311ff604a598b9fb791a63e9deb
旧 Supabase（已弃用）
项目 ID：sfwwbcrpouelrjavecfj

四、☁️ 云函数清单
所有云函数：Node.js 18.15，在 CloudBase 控制台直接建（本地没有 cloudfunctions 目录）。

云函数名	作用	调用方式	环境变量/备注
amap-geofence	新建围栏	HTTP 网关 /amap-geofence	AMAP_WEB_KEY、AMAP_SID
amap-geofence-update	更新围栏	HTTP 网关	同上
amap-geofence-delete	删除围栏	HTTP 网关	同上
amap-geofence-list	查询围栏列表	HTTP 网关	同上
dongfeng-lostlocation	东风实时位置中转（8s 超时）	HTTP 网关	DONGFENG_TOKEN
dongfeng-overspeed-check	超速提醒	HTTP 网关	DONGFENG_TOKEN, AMAP_WEB_KEY
dongfeng-stay-check	停留提醒	HTTP 网关	DONGFENG_TOKEN, AMAP_WEB_KEY
login-by-account	小程序账号密码登录 + 返回用户权限 + 司机档案	wx.cloud.callFunction	改用 Node 18 fetch
vehicle-list	小程序车辆列表 + 实时定位（司机只看绑定车）	wx.cloud.callFunction	改用 Node 18 fetch，超时 60s
小程序云函数环境变量：

text
DONGFENG_TOKEN = c40c7311ff604a598b9fb791a63e9deb
⚠️ 关键坑：

Web 端不用 app.callFunction（匿名会报 EXCEED_AUTHORITY），必须走 HTTP 网关

小程序反过来：必须用 wx.cloud.callFunction，不能用 HTTP 网关

云函数不要依赖 axios——控制台建函数时装不上，用 Node 18 内置 fetch + AbortController

五、🌐 高德接口
5.1 猎鹰围栏服务
基础 URL：https://tsapi.amap.com/v1/track/geofence/

方法：POST（application/x-www-form-urlencoded）

操作	路径	关键参数
创建圆形	/add/circle	key, sid, name, center="lng,lat", radius
创建多边形	/add/polygon	key, sid, name, points="lng,lat;..."
创建线形	/add/polyline	key, sid, name, points, bufferradius
创建行政区划	/add/district	key, sid, name, adcode
更新	/update/xxx	key, sid, gfid, name, ...
删除	/delete	key, sid, gfids
查询列表	/list	key, sid（GET）
常见错误码：10000 成功 / 20001 参数错误 / 20003 假错误（前端也算成功）/ 10001 Key 无效 / 20800 参数非法

⭐ 多边形必坑：首尾闭合、外接矩形 ≤ 500km²、≥ 3 个点

5.2 逆地理编码
https://restapi.amap.com/v3/geocode/regeo?key=xxx&location=lng,lat&extensions=base&radius=200
配额 5000 次/天。

5.3 行政区划查询
https://restapi.amap.com/v3/config/district?key=xxx&keywords=140700&extensions=all&subdistrict=0
配额 30000 次/天。

5.4 驾车路线规划（JS API 插件）
js
const AMap = await AMapLoader.load({
  key: '273f5c474604b71906674aac159b8f45',
  version: '2.0',
  plugins: ['AMap.Geocoder', 'AMap.TileLayer.Satellite', 'AMap.TileLayer.RoadNet', 'AMap.Driving'],
})
const driving = new AMap.Driving({ policy: AMap.DrivingPolicy.LEAST_TIME })
driving.search(originLngLat, destLngLat, { waypoints: [...] }, (status, result) => {})
途径点最多 16 个

未勾选权限 → INVALID_USER_SCODE

5.5 地图主题样式 ID
草色青 amap://styles/fresh / 远山黛 amap://styles/whitesmoke / 月光银 amap://styles/light / 雅士灰 amap://styles/grey / 靛青蓝 amap://styles/blue / 暗黑 amap://styles/dark

六、🚚 东风接口
6.1 实时位置（dongfeng-lostlocation 中转）
https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/dataforward/forward/locationData
GET：token、chassisNo（VIN 后 8 位）、startTime、endTime
循环 3 天（今/昨/前天），命中即返回。

6.2 历史轨迹
https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/track/history
GET：token、carId（完整 VIN）、beginTime、endTime（URL 编码）

返回示例：

json
{
  "code": 1, "source": "DF",
  "data": [{
    "longitude": "111.897497", "latitude": "37.067806",
    "velocity": "53", "direction": "216",
    "sendTime": "2026-10-14 01:50:14", "mileage": "260665300"
  }]
}
6.3 停留事件
https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/track/stopEvent
返回：longitude / latitude / duration(分钟) / startTime / endTime / address

七、📊 数据表结构
7.1 已建表
表	说明	关键字段
admins	管理员档案（旧）	id, phone, password, name, role, status
customers	客户档案	id(uuid), name, phone, password, province, city, contact_person, platforms, permissions
vehicles	车辆	id, plate, vin, customer_id(uuid), org_id(integer), org, fuel_type, vehicle_type, device_id, driver, nickname, usage, sub_vehicle, trailer, purchase_date, insurance_date
drivers	司机档案	id, driver_name, phone, org, org_id(integer), bound_vehicle, gender, age, license_type, customer_id(uuid), operator
waybills	运单	id, waybill_no, status, create_time, owner_account, org(text), assigned_orgs(text)
ele_fences	电子围栏	id, name, org, shape, points, center, radius, bufferradius, adcode, location, gfid, owner_account
ele_fence_alerts	围栏告警配置	id, alert_type, enabled, fence_id(JSON), fence_gfid, fence_name, speed_threshold, stay_duration, stay_radius, monitor_start, monitor_end, owner_account
ele_fence_events	围栏事件（旧，弃用）	id, plate, org, start_time, alert_type
routes	路线管理	id, name, org, org_id, pickup_point, delivery_point, remark, plans(jsonb), plan_count, creator, status, owner_account, customer_id
organizations	组织	id, name, parent_id, owner_account, leader, phone, level(integer), is_root(boolean), customer_id(uuid)
users	系统用户	id, account, name, phone, email, password, org_id, role_id, status, owner_account, wx_openid
roles	角色	id, name, code(NOT NULL UNIQUE), description, permissions(JSONB), status, owner_account
fleets	车队	id, name, code, org_id, leader, phone
user_permissions	用户权限	id, user_id, resource_type, resource_id, status
7.2 ⭐ users 表 role_id 规则（关键）
场景	role_id	owner_account
客户主账号	NULL	NULL
司机账号（司机档案创建）	NULL	有值
管理员/子账号（用户管理创建）	有值	视情况
判断逻辑：

司机账号 = role_id IS NULL AND owner_account IS NOT NULL

管理员/子账号 = role_id IS NOT NULL

7.3 ⭐ 关键字段类型
表.字段	类型
customers.id	uuid
vehicles.customer_id	uuid
drivers.customer_id	uuid
users.owner_account	text NULL
users.role_id	integer NULL
users.wx_openid	text NULL
ele_fences.owner_account	text NULL
waybills.owner_account	text NULL
waybills.assigned_orgs	text NULL（多个机构名逗号分隔）
organizations.level	integer
organizations.is_root	boolean
7.4 表级权限
sql
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
⚠️ RLS ≠ GRANT。

八、🔴 机构层级 + 数据隔离（核心架构）
8.1 全项目统一判断函数
js
const isSubAccount = !!currentUser.isSubAccount
const myOrgName = ref(isSubAccount ? String(currentUser.orgName || '').trim() || null : null)
const myOrgLevel = ref(isSubAccount ? (Number(currentUser.orgLevel) || 1) : null)

const isRootOrgSubAccount = computed(() =>
  isSubAccount && Number(myOrgLevel.value) === 1
)
const needOrgFilter = computed(() =>
  isCustomer && isSubAccount && Number(myOrgLevel.value) >= 2
)
8.2 隔离规则对照表
角色	customer_id	owner_account	org 过滤	orgLevel
管理员	❌	❌	❌	—
主账号	✅	✅	❌	—
一级机构子账号	✅	✅	❌	=1
二级+子账号	✅	✅	✅	≥2
关键区分：

客户级数据（按 owner_account 隔离）：waybills / ele_fences / ele_fence_alerts / roles

客户级 + org 隔离：vehicles / drivers / routes

围栏特殊：二级机构子账号严格只看本机构（org = 我的机构名），不含 org IS NULL

8.3 ⭐ 运单特殊隔离（assigned_orgs）
二级机构子账号：owner_account = 主账号 AND (assigned_orgs LIKE '%机构名%' OR org = 我的机构名)

发布时：WaybillCreate.vue 从指派车队提取 → 写入 assigned_orgs

主账号/一级子账号：不受 assigned_orgs 限制

8.4 ⭐ 车辆-机构绑定（org_id）
vehicles.org_id 是车辆归属机构 id

组织树的「车辆数」= 递归求和（本机构 + 所有子孙）→ 仅限 OrgManage.vue / AdminCustomer.vue

UserManage.vue 组织树显示的是「司机数」，只统计本机构，不递归（2026-10-16 更新）

九、📁 前端页面结构
9.1 Web 端
入口 & 框架：

LoginView.vue — 登录页（三层角色判断 + customers.permissions 优先 + 注入 orgLevel/orgName/isRootOrg）

PortalSelect.vue — 管理员门户（最近进入客户分组，localStorage 最多 3 条）

Dashboard.vue — ⭐ 客户端所有页面的壳

admin/AdminLayout.vue — 管理端主框架

⭐ Dashboard.vue 路由挂载方式（关键坑）：
加新页面必须改 3 处：

router/index.js 加独立路由（指向 Dashboard.vue）

Dashboard.vue 加 <template v-else-if="route.path === '/xxx'"><Xxx /></template>

Dashboard.vue import + pathLabels + routePermissionMap

管理端：AdminDashboard / AdminCustomer / AdminVehicle / AdminAccounts / RoleManage / OrgManage / UserManage

客户端：ClientHome / FullMap / Waybill / WaybillCreate / waybill-detail / VehicleArchive / DriverArchive / RouteManage

电子围栏：EleFenceSetting / EleFenceAlertSetting / EleFenceAlertQuery / AddEleFenceDialog / OverspeedDetailDialog / StayDetailDialog

公共组件：SidebarMenu / PersonalSettings / FunctionPermissionDialog

9.2 小程序端（截至第六版）
text
my-cd-miniprogram/
├── src/
│   ├── custom-tab-bar/
│   │   ├── index.js          # 自定义 tabBar 组件（原生，不用 .vue）
│   │   ├── index.json
│   │   ├── index.wxml
│   │   └── index.wxss
│   ├── pages/
│   │   ├── login/login.vue       # ⭐ 登录页（方案 A 风格）
│   │   ├── vehicle/list.vue      # ⭐ 车辆管理（地图+抽屉，方案 C）
│   │   ├── waybill/list.vue      # 运单列表（占位）
│   │   ├── waybill/detail.vue    # 运单详情（占位）
│   │   └── mine/mine.vue         # ⭐ 我的（方案 C 数说）
│   ├── components/
│   │   └── vehicle-drawer.vue    # ⭐ 底部抽屉组件
│   ├── static/
│   │   └── map/                  # marker 图标（4 张 PNG）
│   ├── App.vue                   # ⭐ wx.cloud.init
│   ├── pages.json                # ⭐ tabBar custom: true
│   └── manifest.json             # ⭐ AppID
├── dist/dev/mp-weixin/           # 编译产物
└── project.config.json           # ⚠️ 不要开 packNpmManually
自定义 tabBar 三 tab：

车辆管理 pages/vehicle/list（selected: 0）

任务中心 pages/waybill/list（selected: 1）

我的 pages/mine/mine（selected: 2）

十、🔐 权限体系
10.1 三层角色判断（Web LoginView.vue）
js
const ownerAccount = String(userData.owner_account || '').trim()
const isSubAccount = !!ownerAccount && ownerAccount !== userData.account
const roleId = Number(userData.role_id) || 0
let isAdmin = false
if (!isSubAccount) {
  if (roleCode === 'admin' || roleName.includes('管理员')) isAdmin = true
  if (!roleId && (userName === '管理员' || userName === 'admin')) isAdmin = true
  if ([1, 2].includes(roleId)) isAdmin = true
}
10.2 account 对象（LoginView 注入）
js
{
  id, account, phone, name, email,
  role: 'admin' | 'customer',
  roleId, roleName,
  orgId,          // users.org_id
  orgName,        // organizations.name
  orgLevel,       // 1/2/3...
  isRootOrg,      // orgLevel === 1
  platforms,
  permissions: { client: [] },
  isSubAccount,
  ownerAccount, masterAccount, masterName, masterPhone,
  customerName, customerId,
}
10.3 ⭐ Web 端登录拒绝司机账号（待做）
司机账号（role_id IS NULL + owner_account 有值）不能登 Web。未完成，待办。

10.4 ⭐ 小程序端 user 对象
login-by-account 返回的 user 对象必须与 Web 端 account 对齐：

js
{ id, account, name, phone, roleId, orgId, orgName, orgLevel, isSubAccount, ownerAccount, platform }
外加 driver 对象：

js
{ driver_name, phone, org, org_id, bound_vehicle }
十一、⚡ 超速提醒模块
流程：提醒设置 → 前端 EleFenceAlertQuery → 云函数 dongfeng-overspeed-check → 前端表格 → 详情弹窗

云函数关键参数：CONCURRENCY=20、GEO_CONCURRENCY=3、SEGMENT_GAP_MS=5分钟

围栏形状判断：circle（Haversine）/ polygon（射线法，首尾闭合）/ polyline（点到线段最短距离）/ district（高德行政区划 API）

前端缓存：sessionStorage 标志 + 5 分钟 TTL，key = alert_cache_${alertType}_${userPart}_${rangePart}

十二、🚧 全域提醒
触发：不选任何围栏 + 提交时弹确认框；保存：fence_id = '[]'；云函数：isGlobal = true，跳过围栏判断

十三、⭐ 路线管理模块
数据表见 §7；菜单挂在运输管理分组；routes.org_id 从 orgList 反查。

十四、🎨 UI 规范
14.1 品牌色
主色（红）#c8102e / 渐变 linear-gradient(135deg, #c8102e, #a00d24) / 深 #7F1D1D / 淡红底 #FEF2F2

停留提醒蓝 #3B82F6 / 渐变 linear-gradient(135deg, #3B82F6, #1D4ED8) / 淡蓝底 #EFF6FF

行驶绿 #22C55E / 静止橙 #F59E0B / 离线灰 #94A3B8

14.2 Web 端页面固定高度
css
.xxx-page {
  height: calc(100vh - 101px);
  max-height: calc(100vh - 101px);
  overflow: hidden;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
html, body { height: 100%; overflow: hidden; }
⚠️ 2026-10-16 更新：司机档案 / 车辆档案 / 用户管理 都已改成 calc(100vh - 101px)，不能上下滚动。

14.3 表格样式
表头：#F8FAFC 背景 / #0F172A 色 / 700 / 13px

单元格：12.5px / #1E293B

行 hover：#FEF2F2

分页：红高亮

14.4 ⭐ 4 个图标按钮（列表页通用）
🔄 刷新 / ⚙️ 密度 / ▦ 列设置 / ⛶ 全屏
全屏时新增/编辑/导入按钮用 :disabled + el-tooltip

14.5 ⭐ 小程序端样式
单位用 rpx

<view> <text> 替代 <div> <span>

品牌红保持一致

图标用 SVG data URI（background-image: url("data:image/svg+xml,...")），不用 emoji

页面底部给 tabBar 留位：padding-bottom: calc(108rpx + env(safe-area-inset-bottom))

十五、✅ 已完成
Web 端（本次新增）
⭐ 司机档案 + 小程序账号联动

新增对话框：加「启用小程序」开关 + 密码 + 确认密码

编辑对话框：反查 users 表判断是否已开通；开关可开可关；填密码即改密码

查看详情：显示「已开通 / 未开通」绿/灰胶囊

批量删除司机时：同步删除对应 users 账号（只删属于当前客户的）

新增 syncDriverUserAccount() 和 disableDriverUserAccount() 函数

手机号安全校验：拒绝管理员手机号、其他客户手机号、主账号手机号

⭐ 司机档案 / 车辆档案：锁死高度不能上下滚动

height: calc(100vh - 101px)（原 100vh）

⭐ 用户管理（UserManage.vue）

列表视图 + 组织机构视图都加 .not('role_id', 'is', null)，排除司机账号

组织树「车辆数」改成「司机数」徽章（绿色系）

只统计本机构下司机，不递归叠加子孙机构

用户节点显示所属机构下的司机数

登录页修复（Web）：redirectTo 跳 tabBar 页报错，改 switchTab（已有）

小程序端（本次新增）
⭐ 登录页完整重做（方案 A 白底 + 红云朵 + 御风行 + 标签）

白底 + 红色云朵线条图标（无背景无方框）

「御风行」+「东风云智慧管理平台」红胶囊同行

手机号 + 密码输入框

记住手机号 / 记住密码（上下两行勾选）

手机号输入框右侧下拉箭头 → 展示最近登录 3 条（带「最近登录」绿标签 + × 删除）

密码显示切换：v-if/v-else 拆两个 input，微信端用 password 布尔属性

登录成功后 switchTab 跳车辆管理

⭐ 我的页（方案 C 数说）

头部：白底 + 红色渐变圆角方块头像 + 名字 + 机构名（不是平台名）

统计数据卡（在途任务 / 本月里程 / 在线时长，目前静态）

字段卡：手机号 / 绑定车辆

已删除「所属组织机构」字段（因为头部已有）

退出登录：白底红字胶囊 + 线条图标

menuBottom 用 wx.getMenuButtonBoundingClientRect() 动态计算，避开右上角胶囊

⭐ 车辆管理页（方案 C 全屏地图 + 底部抽屉）

全屏 <map> 组件

顶部 4 个状态筛选 pill：全部 / 行驶 / 静止 / 离线

底部抽屉组件 vehicle-drawer.vue：

三档高度：收起（48px）/ 半开（45% 屏高）/ 全开（78% 屏高）

拖拽手势 + 吸附动画

车辆卡片：状态点 + 车牌 + 状态胶囊 + 司机 + 速度 + 上报时间

选中卡片滚动到可视区

右下角悬浮按钮：刷新 / 全图

marker 用 marker-driving.png / marker-parked.png / marker-offline.png / marker-selected.png

⭐ 自定义 tabBar（原生 4 文件方案）

src/custom-tab-bar/index.js / .json / .wxml / .wxss

⚠️ 不能用 .vue（uni-app 编译不识别），必须放原生文件

线条 SVG 图标，选中态红色 + 上浮

⭐ 云函数 login-by-account（小程序）

改用 Node 18 内置 fetch（不用 axios）

匿名登录带 x-device-id（randomUUID）

返回 user + driver 对象

主账号兜底：orgName 为空时用 user.name

⭐ 云函数 vehicle-list（小程序）

改用 Node 18 fetch

司机账号逻辑：如果 drivers 表匹配 phone 且有 bound_vehicle，只返回绑定车辆

非司机账号：走客户 customer_id + 机构 org 隔离

超时 60s，并发 15

早期完成（第五版及之前）
Web 端基础、登录 & 权限、机构层级重构、管理端 5 文件、客户端、电子围栏、超速/停留提醒、路线管理、个人设置、数据治理、UI 重构全部完成 ✅

十六、⏳ 待办清单
小程序端（最优先）
☐ 1. 车辆管理页接真实数据定位：云函数 vehicle-list 已建，但定位数据可能拉不到（Console 显示「有定位：0」），需排查 dongfeng-lostlocation 或 fetch 是否生效

☐ 2. Web 端登录页拒绝司机账号：role_id IS NULL + owner_account 有值 的账号登 Web 时弹「司机账号请使用小程序端登录」

☐ 3. 运单列表页 pages/waybill/list.vue：复用 needOrgFilter + assigned_orgs 隔离，卡片式列表

☐ 4. 运单详情页 pages/waybill/detail.vue：接单 / 上报 / 完成

☐ 5. 小程序上传体验版：微信开发者工具「上传」→ 公众平台「设为体验版」→ 加体验成员

☐ 6. 运单实时推送 db.collection('waybills').watch()

Web 端原始待办
☐ 1. RLS 策略收紧（上线前必做）

☐ 2. 云函数预置并发（性能优化）

☐ 3. 逆地理编码降级策略（超速段 > 200 时只对前 N 段做）

☐ 4. 用户管理权限配置弹窗真实对接（FunctionPermissionDialog 保存逻辑）

☐ 5. 老旧 admins 表清理（orphan 记录）

☐ 6. 全图监控「实时跟踪」「轨迹回放」按钮落地

☐ 7. 删除本地备份视频 login-bg-original.mp4

☐ 8. 路线管理：地址 → 坐标映射

☐ 9. 路线管理：方案对比地图视图

十七、🎯 关键约定（不能违反）
Web 端
云函数必须走 HTTP 网关，不能用 app.callFunction（匿名会 EXCEED_AUTHORITY）

currentUser 依赖 LoginView 注入，改动后必须退出重登

子账号永远不是管理员

子账号权限必须剔除 system

登录校验的是 users.password，改密码一定写 users 表

数据隔离三件套：customer_id + owner_account + org

全项目统一判断：isRootOrgSubAccount / needOrgFilter

运单额外按 assigned_orgs 隔离

提醒配置是客户级共享的，二级子账号只读

围栏改名时同步 ele_fence_alerts.fence_name

分配车辆弹窗筛选切换延迟 150ms

全屏时新增/编辑/导入按钮用 :disabled + el-tooltip

⭐ 页面高度统一 calc(100vh - 101px)，不能上下滚

⭐ 司机档案创建的账号：role_id = NULL，不能登 Web，不显示在用户管理

⭐ 用户管理组织树显示「司机数」且只统计本机构，不递归

小程序端
必须用 wx.cloud.callFunction，不用 HTTP 网关

App.vue 必须 wx.cloud.init({ env: 'wuxian-token-d0guymjkpadcd1f22', traceUser: true })

不用 @cloudbase/js-sdk（被微信拦截）

云函数内查 PostgreSQL 走 HTTP API，带 x-device-id 请求头

⭐ 云函数不要依赖 axios，用 Node 18 内置 fetch

微信开发者工具导入 dist/dev/mp-weixin

不要用微信开发者工具「构建 npm」

project.config.json 不要开 packNpmManually

⭐ custom-tab-bar 必须放 src/custom-tab-bar/index.vue，和 pages 平级；如果编译产物还是 .vue 未转成 4 文件，就手写原生 4 文件

⭐ 微信 <input> 没有 type="password"，要用 password 布尔属性 + 条件编译

⭐ 微信 <input> 动态改 type 不重渲染，用 v-if/v-else 拆两个节点

⭐ 自定义 tabBar 每个页面 onShow 里要 getTabBar().setData({ selected: n })

⭐ 微信 <map> 组件的 marker 只能用图片，不能 HTML，不能旋转

⭐ wx.getSystemInfoSync 已废弃，用 wx.getWindowInfo() 或 wx.getMenuButtonBoundingClientRect()

⭐ 云函数在 CloudBase 控制台建（本地没有 cloudfunctions/ 目录）

十八、🔧 快速验证清单
Web 端
主账号 15035660010 登录：

js
// 期望：role='customer', orgId=null, orgLevel=null, isSubAccount=false
→ 首页显示该客户全部车辆
→ 车辆档案：编辑任意车，"所属机构组织"清空按钮消失（有机构的车）
→ 提醒设置：无只读横幅
→ 运单：看到全部运单
二级子账号 15035660020 登录（orgLevel=2，机构"管理员名下车辆"）：

js
// 期望：orgId=4, orgName='管理员名下车辆', orgLevel=2, isSubAccount=true
→ 车辆档案：只能看本机构车
→ 提醒设置：黄色只读横幅 + 控件禁用
→ 运单：只看到 assigned_orgs 匹配的
司机账号 15035660050：

✅ 能登小程序

✅ 只能看自己绑定车（晋K1H001、晋K1H003）

❌ 不能登 Web（待做）

❌ 不显示在用户管理列表 / 组织树

司机档案 + 小程序联动：

主账号 → 司机档案 → 编辑 → 看到「小程序账号」区块（已开通/未开通）

新增司机勾选「启用小程序」+ 填密码 → 保存

CloudBase users 表多一条：account=手机号, password=密码, role_id=NULL, owner_account=主账号

司机能用手机号+密码登小程序

小程序端
登录：15035660050 / 123456

Console：司机档案已保存: {driver_name, phone, org, bound_vehicle}

跳转车辆管理，地图出现 marker

「我的」页：头像、名字、机构、手机号、绑定车辆

车辆管理：

顶部状态 pill 筛选

底部抽屉拖拽（收起/半开/全开）

点 marker → 抽屉展开 + 卡片高亮 + 地图居中

点卡片 → 地图居中 + marker 变红

tabBar：三 tab 切换，选中态跟手

十九、📋 数据库现状
organizations：

id	name	level	parent_id	is_root	customer_id
5	山西卡友新能源运输有限公司	1	NULL	true	678b9759-...
4	管理员名下车辆	2	5	false	678b9759-...
8	车队演示账号	1	NULL	true	ff786331-...
9	湖北分公司	2	8	false	ff786331-...
10	山西分公司	2	8	false	ff786331-...
users：

id	account	name	org_id	owner_account	role_id
9	15035660010	山西卡友新能源运输有限公司	NULL	NULL	NULL（主账号）
11	15035660020	lyn	4	15035660010	19（二级子账号）
19	15035660050	李亚楠	4	15035660010	NULL（司机账号）
—	15035660040	lyn	5	15035660010	NULL（司机账号）
—	15035669999	张雪	—	15035660010	NULL（司机账号）
测试账号：

15035660010 / 123456!（主账号）

15035660020 / 密码待确认（二级子账号）

15035660050 / 123456!（司机账号，绑车 晋K1H001 + 晋K1H003）

二十、🔧 常见问题
Web 端
现象	原因	修法
Failed to fetch	云函数没配 HTTP 网关 / 没开公网	配网关 + 公网访问
白屏	语法错误	F12 Console 看红色报错
云函数报 EXCEED_AUTHORITY	用了 app.callFunction	改用 HTTP 网关
登录"账号或密码不正确"	.or() 语法问题	拆分 .eq() + .limit(1)
客户登录 0 辆车	customerId 类型不匹配	ClientHome 强制按 phone 反查
页面能上下拖动	高度用了 100vh	改 calc(100vh - 101px) + overflow: hidden
改完密码没生效	写到了 customers/admins 表	改回写 users 表
子账号看不到数据	currentUser.orgLevel 缺失	退出重登
用户管理显示司机账号	没加 role_id 过滤	.not('role_id', 'is', null)
机构树司机数不对	递归叠加了子孙	改成只统计本机构
司机档案编译报错 Unexpected token	括号未闭合	检查 loadUsers/loadOrgTree 括号
小程序端
现象	原因	修法
app.json 未找到	导入了源码根目录	导入 dist/dev/mp-weixin
NPM packages not found	开了 packNpmManually	删掉该配置
-601034 没有权限	未关联腾讯云环境	微信云开发开通 + 关联
cloud.callFunction is required	App.vue 未初始化	onLaunch 里 wx.cloud.init
Invalid schema: <envId>	@cloudbase/node-sdk 的 bug	改用 Node 18 fetch
Credentials missing	HTTP API 缺认证	加 Authorization: Bearer <token>
INVALID_ARGUMENT / 请在请求头添加设备id	缺 x-device-id	加随机 UUID
Cannot find module 'axios'	云函数没装 axios	改用 Node 18 内置 fetch
登录跳转报 redirectTo:fail can not redirectTo a tabbar page	用了 redirectTo	改 uni.switchTab
密码框点了眼睛不切换	微信 <input> 没有 type="password"	用 password 布尔属性 + v-if/v-else 拆两节点
自定义 tabBar 不显示	路径不对 或 .vue 未编译	放 src/custom-tab-bar/ 根级；改用原生 4 文件
tabBar 不显示（产物只有 .vue）	uni-app 未识别	手写 index.js/json/wxml/wxss
头像被右上角胶囊挡住	没用 menuBottom	wx.getMenuButtonBoundingClientRect().bottom + 12
悬浮按钮跟着抽屉动	动态绑定了 bottom	固定 bottom，不动
车辆 marker 不显示	图标路径不对 / 没下载	检查 src/static/map/*.png 是否存在
车辆管理「有定位：0」	东风接口返回空	看云函数日志 fetchLocation 结果
二十一、🚀 部署流程
Web 端
bash
cd /Users/lyn/my-cd
npm run dev
git add . && git commit -m "feat: xxx" && git push origin main
# CloudBase 自动构建 + 发布，1-2 分钟
⚠️ 改登录相关文件后必须退出重登
⚠️ 新建云函数后必须配 HTTP 网关 + 环境变量 + 公网访问

小程序端
bash
cd /Users/lyn/my-cd-miniprogram
npm run dev:mp-weixin    # 实时编译到 dist/dev/mp-weixin
# VSCode 另一个窗口打开微信开发者工具，导入 dist/dev/mp-weixin
# 改代码 → Vite 自动编译 → 微信开发者工具点「编译」

git add . && git commit -m "feat: xxx" && git push origin main
# 小程序端 Git 提交不触发自动部署
⚠️ 上传后去公众平台「版本管理」→「设为体验版」→ 生成二维码 → 加体验成员
⚠️ 体验版无需审核，改完代码重新上传 + 重新生成二维码

二十二、📌 关键常量
名称	值
CloudBase 环境 ID	wuxian-token-d0guymjkpadcd1f22
HTTP 网关	https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com
API 网关（小程序）	https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com
高德 JS Key	273f5c474604b71906674aac159b8f45
高德 Web Key	491d5475803e65c06ba6169bdaf3e1f3
高德猎鹰 SID	1078871
东风 Token	c40c7311ff604a598b9fb791a63e9deb
FullMap 并发	15
超速/停留云函数并发	20
vehicle-list 并发	15
逆地理编码并发	3
前端缓存 TTL	5 分钟
前端 fetch 超时	8000ms
超速段合并间隔	5 分钟
管理端页面高度	calc(100vh - 101px)
小程序 AppID	wx88a7b64684f68cef
小程序编译产物目录	/Users/lyn/my-cd-miniprogram/dist/dev/mp-weixin
tabBar 高度	108rpx + env(safe-area-inset-bottom)
二十三、📁 关键文件
Web 端（本次重点）
文件	说明
src/views/DriverArchive.vue	⭐ 司机档案（含小程序账号联动，高度锁死）
src/views/VehicleArchive.vue	⭐ 车辆档案（高度锁死）
src/views/UserManage.vue	⭐ 用户管理（列表 + 组织树都过滤司机账号；组织树显示本机构司机数）
src/views/LoginView.vue	登录页（待加：拒绝司机账号）
src/views/OrgManage.vue	组织管理（递归车辆数）
src/views/AdminCustomer.vue	客户管理（递归车辆数）
src/views/FullMap.vue	全图监控
src/views/Dashboard.vue	⭐ 客户端所有页面的壳
src/views/admin/AdminLayout.vue	管理端壳
小程序端（本次重点）
文件	说明
src/pages/login/login.vue	⭐ 登录页（方案 A 白底 + 云朵）
src/pages/mine/mine.vue	⭐ 我的（方案 C 数说）
src/pages/vehicle/list.vue	⭐ 车辆管理（全屏地图 + 底部抽屉）
src/components/vehicle-drawer.vue	⭐ 底部抽屉组件（拖拽 + 三档吸附）
src/custom-tab-bar/index.js/json/wxml/wxss	⭐ 自定义 tabBar（原生 4 文件）
src/static/map/*.png	marker 图标（4 张）
src/App.vue	⭐ 全局 wx.cloud.init
src/pages.json	⭐ tabBar custom: true
src/manifest.json	⭐ AppID
云函数（CloudBase 控制台）
云函数	说明
login-by-account	小程序登录，返回 user + driver，用 Node 18 fetch
vehicle-list	车辆列表 + 定位，司机只看绑定车，用 Node 18 fetch
二十四、🎯 下次推荐方向
最优先（小程序端）
【小程序 1】修复车辆管理页「有定位：0」

排查 vehicle-list 云函数日志：fetchLocation(${vin}) day-0 失败 或 近 3 天无数据

确认 vehicles.vin 字段是完整 VIN（不是空的）

东风接口 chassisNo 取 vin.slice(-8)

确认返回的 result.code === 1 且 result.data.length > 0

【小程序 2】Web 端登录页拒绝司机账号

LoginView.vue 写 localStorage 前加判断：

js
const hasRole = userData.role_id !== null && userData.role_id !== undefined && userData.role_id !== ''
const ownerAcc = String(userData.owner_account || '').trim()
if (!hasRole && ownerAcc) {
  ElMessage.error('司机账号请使用小程序端登录')
  loading.value = false
  return
}
【小程序 3】运单列表页

pages/waybill/list.vue

状态筛选 tab（全部 / 待接单 / 运输中 / 已完成）

卡片式列表 + 下拉刷新 + 上拉加载

复用 needOrgFilter + assigned_orgs 隔离

云函数 waybill-list（待建）

【小程序 4】运单详情页

接单 / 上报 / 完成

拍照上传（wx.chooseMedia + wx.cloud.uploadFile）

【小程序 5】上传体验版

微信开发者工具「上传」→ 公众平台「版本管理」→「设为体验版」→ 加体验成员

Web 端
老旧 admins 表清理

全图监控「实时跟踪」「轨迹回放」

RLS 策略收紧（上线前必做）

最后更新：2026-10-16（第六版）

状态：

✅ Web 端：司机档案小程序联动 + 用户管理司机账号过滤 + 机构树司机数统计 + 高度锁死，全部完成

✅ 小程序端：登录页 + 我的页 + 车辆管理页（地图+抽屉）+ 自定义 tabBar + 2 个云函数，全部完成

⏳ 小程序端：车辆定位数据拉不到（「有定位：0」），需排查云函数

⏳ Web 端：登录页拒绝司机账号（待做）

⏳ 小程序端：运单列表 / 运单详情（待做）

🎯 下次推荐：先修小程序车辆管理页的定位数据，然后做运单列表页