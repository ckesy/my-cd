东风车队管理系统 - 开发交接文档
新对话开场白：把本文件完整粘贴给 AI，并说明「接着做 XXX」即可无缝续接。
最后更新：2026-10-15

一、项目概况
项	值
项目名称	东风车队管理系统
技术栈	Vue 3 + Vite + Element Plus + 高德地图 JS API
代码仓库	https://github.com/ckesy/my-cd
线上地址	https://wuxian-token-d0guymjkpadcd1f22-1447716425.tcloudbaseapp.com/
本地路径	/Users/lyn/my-cd
启动命令	cd /Users/lyn/my-cd && npm run dev
部署方式	Git 自动部署（push main → CloudBase 自动构建 + 发布）
二、后端与云服务
平台：腾讯云 CloudBase（个人版）

环境 ID：wuxian-token-d0guymjkpadcd1f22

数据库：CloudBase PostgreSQL

身份认证：CloudBase 匿名登录（signInAnonymously）

SDK：@cloudbase/js-sdk（在 src/utils/supabase.js 初始化）

安全域名：wuxian-token-d0guymjkpadcd1f22-1447716425.tcloudbaseapp.com

SPA 路由：错误码 404 → 替换为 /index.html

HTTP 网关基础 URL
text
https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com
三、🔑 Key / Token 速查
高德
名称	值	用途
JS API Key	273f5c474604b71906674aac159b8f45	前端地图（JS SDK）
Web 服务 Key	491d5475803e65c06ba6169bdaf3e1f3	云函数猎鹰 + 逆地理编码 + 行政区划
猎鹰 SID	1078871	电子围栏实例
数字签名	必须关闭	
猎鹰 API	必须勾选	否则返回 20003
驾车路径规划	必须勾选	否则 JS API 规划失败
IP 白名单	必须留空	云函数无固定 IP
东风
名称	值
Token	c40c7311ff604a598b9fb791a63e9deb
CloudBase
名称	值
环境 ID	wuxian-token-d0guymjkpadcd1f22
HTTP 网关	https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com
旧 Supabase（弃用）
项目 ID：sfwwbcrpouelrjavecfj

四、☁️ 云函数清单
所有云函数：Node.js 18.15，package.json = {}，必须开启公网访问。

云函数名	作用	HTTP 网关路径	环境变量
amap-geofence	新建围栏	/amap-geofence	AMAP_WEB_KEY、AMAP_SID
amap-geofence-update	更新围栏	/amap-geofence-update	同上
amap-geofence-delete	删除围栏	/amap-geofence-delete	同上
amap-geofence-list	查询围栏列表	/amap-geofence-list	同上
dongfeng-lostlocation	东风实时位置中转（8s 超时）	/dongfeng-lostlocation	DONGFENG_TOKEN
dongfeng-overspeed-check	超速提醒：轨迹 + 4形状围栏 + 超速段 + 逆地理编码	/dongfeng-overspeed-check	DONGFENG_TOKEN, AMAP_WEB_KEY
dongfeng-stay-check	停留提醒：stopEvent + 围栏 + 时长过滤 + 拉轨迹补充停留点	/dongfeng-stay-check	DONGFENG_TOKEN, AMAP_WEB_KEY
环境变量值
text
AMAP_WEB_KEY = 491d5475803e65c06ba6169bdaf3e1f3
AMAP_SID = 1078871
DONGFENG_TOKEN = c40c7311ff604a598b9fb791a63e9deb
前端调用（统一 fetch）
js
const API_BASE = 'https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com'
await fetch(`${API_BASE}/dongfeng-overspeed-check`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ vehicles, fences, threshold, startTime, endTime, withAddress: true }),
})
⚠️ 不要用 app.callFunction → 匿名会报 EXCEED_AUTHORITY。

HTTP 网关配置要点
资源类型：云函数

触发路径：以 / 开头

跨域：开启

身份认证：关闭

⚠️ 新建云函数后必须手动配 HTTP 网关 + 环境变量 + 开启公网访问

云函数坑
云函数代码不能粘错：之前 dongfeng-overspeed-check 代码被误粘到 amap-geofence，导致创建围栏报"缺少 vehicles"。

每个云函数代码开头都有注释标明文件路径，粘贴前先看第一行。

五、🌐 高德接口
5.1 猎鹰围栏服务
基础 URL：https://tsapi.amap.com/v1/track/geofence/
方法：POST（application/x-www-form-urlencoded）

操作	路径	关键参数
创建圆形	/add/circle	key, sid, name, center="lng,lat", radius
创建多边形	/add/polygon	key, sid, name, points="lng,lat;..."
创建线形	/add/polyline	key, sid, name, points, bufferradius
创建行政区划	/add/district	key, sid, name, adcode
更新（同上 4 种）	/update/xxx	key, sid, gfid, name, ...
删除	/delete	key, sid, gfids
查询列表	/list	key, sid（GET）
常见错误码：

errcode	含义	处理
10000	成功	-
20001	参数错误	检查必填参数
20003	未知错误（假错误）	前端也算成功
10001	Key 无效	检查 Key/SID 匹配
20800	参数非法	检查名称特殊字符
⭐ 多边形必坑：

首尾点必须闭合（最后一个点 = 第一个点）

外接矩形面积不能超上限（约 500km²）

至少 3 个点

5.2 逆地理编码
text
https://restapi.amap.com/v3/geocode/regeo?key=xxx&location=lng,lat&extensions=base&radius=200
返回 regeocode.formatted_address

配额：个人版 5000 次/天

5.3 行政区划查询
text
https://restapi.amap.com/v3/config/district?key=xxx&keywords=140700&extensions=all&subdistrict=0
返回 districts[0].polyline，格式："lng,lat;lng,lat|...|..."

多段用 | 分隔

每段是闭合多边形

配额：个人版 30000 次/天

5.4 ⭐ 驾车路线规划（JS API 插件）
js
const AMap = await AMapLoader.load({
  key: '273f5c474604b71906674aac159b8f45',
  version: '2.0',
  plugins: ['AMap.Geocoder', 'AMap.TileLayer.Satellite', 'AMap.TileLayer.RoadNet', 'AMap.Driving'],
})

const driving = new AMap.Driving({
  policy: AMap.DrivingPolicy.LEAST_TIME,   // 最快捷
  // 不加 map 参数 → 不自动绘制，自己控制样式
})

driving.search(originLngLat, destLngLat, { waypoints: [...] }, (status, result) => {
  if (status === 'complete' && result.routes?.length) {
    const route = result.routes[0]
    // route.distance  米
    // route.time      秒
    // route.tolls     过路费（元）
    // route.steps[].path  完整路径点数组
  }
})
途径点最多 16 个

未勾选"驾车路径规划"权限 → INVALID_USER_SCODE

用 Promise 包装可以 await，方便串联多方案

5.5 地图主题样式 ID
主题名	ID
草色青	amap://styles/fresh
远山黛	amap://styles/whitesmoke
月光银	amap://styles/light
雅士灰	amap://styles/grey
靛青蓝	amap://styles/blue
暗黑	amap://styles/dark
六、🚚 东风接口
6.1 实时位置（dongfeng-lostlocation 中转）
text
https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/dataforward/forward/locationData
GET 参数：

参数	说明
token	c40c7311ff604a598b9fb791a63e9deb
chassisNo	VIN 后 8 位
startTime	YYYY-MM-DD HH:mm:ss
endTime	YYYY-MM-DD HH:mm:ss
循环 3 天（今/昨/前天），命中即返回。

6.2 历史轨迹（dongfeng-overspeed-check / dongfeng-stay-check 中转）⭐
text
https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/track/history
GET 参数：

参数	说明
token	同上
carId	完整 VIN（不是后 8 位！）
beginTime	YYYY-MM-DD HH:mm:ss（URL 编码）
endTime	同上
返回示例：

json
{
  "code": 1, "source": "DF",
  "data": [{
    "longitude": "111.897497",
    "latitude": "37.067806",
    "velocity": "53",
    "direction": "216",
    "sendTime": "2026-10-14 01:50:14",
    "mileage": "260665300"
  }]
}
6.3 停留事件（dongfeng-stay-check 中转）
text
https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/track/stopEvent
返回每个停留事件：longitude / latitude / duration(分钟) / startTime / endTime / address

七、📊 数据表结构
7.1 已建表
表	说明	关键字段
admins	管理员档案（旧）	id, phone, password, name, role, status
customers	客户档案	id(uuid), name, phone, password, province, city, contact_person, platforms, permissions
vehicles	车辆	id, plate, vin, customer_id(uuid), org, fuel_type, vehicle_type, device_id, driver
drivers	司机档案	id, driver_name, phone, org, bound_vehicle, ..., customer_id(uuid)
waybills	运单	id, waybill_no, status, create_time, owner_account
ele_fences	电子围栏	id, name, org, shape, points, center, radius, bufferradius, adcode, location, gfid, owner_account(text), updated_at
ele_fence_alerts	围栏告警配置	id, alert_type, enabled, fence_id(JSON), fence_gfid, fence_name, speed_threshold, stay_duration, stay_radius, stay_count, monitor_start, monitor_end, owner_account
ele_fence_events	围栏事件（旧，弃用）	id, plate, org, start_time, alert_type
routes	⭐ 路线管理（本次新增）	id, name, org, pickup_point, delivery_point, remark, plans(jsonb), plan_count, creator, status, owner_account, customer_id, created_at, updated_at
organizations	组织	id, name, parent_id, owner_account, leader, phone
users	系统用户	id, account, name, phone, email, password, org_id, role_id, status, owner_account
roles	角色	id, name, code(NOT NULL UNIQUE), description, permissions(JSONB), status, owner_account
fleets	车队	id, name, code, org_id, leader, phone
user_permissions	用户权限	id, user_id, resource_type, resource_id, status
7.2 ⭐ routes 表建表语句
sql
CREATE TABLE IF NOT EXISTS routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  org text,
  pickup_point text,
  delivery_point text,
  remark text,
  plans jsonb DEFAULT '[]'::jsonb,
  plan_count integer DEFAULT 0,
  creator text,
  status text DEFAULT 'active',    -- active | disabled
  owner_account text,
  customer_id uuid,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_routes_owner ON routes(owner_account);
CREATE INDEX IF NOT EXISTS idx_routes_status ON routes(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON routes TO anon;

CREATE UNIQUE INDEX IF NOT EXISTS routes_owner_name_unique
ON routes (COALESCE(owner_account, ''), name);

ALTER TABLE routes ALTER COLUMN gfid DROP NOT NULL;  -- 若非空报错
7.3 plans jsonb 结构
json
[
  {
    "name": "方案一",
    "type": "auto",
    "waypoints": [
      { "value": "途径点名称", "lng": 116.407, "lat": 39.904 }
    ],
    "distance": "158.6",
    "duration": "2小时15分",
    "toll": "128"
  }
]
7.4 ele_fences 关键字段
sql
id              uuid
name            text
org             text
shape           text      -- 'polygon' / 'circle' / 'polyline' / 'district'
points          text      -- 多边形：'lng,lat;lng,lat;...'（首尾闭合）
center          text      -- 圆形：'lng,lat'
radius          integer   -- 圆形：米
bufferradius    integer   -- 线形：米
adcode          text      -- 行政区划：6 位数字
gfid            text      -- 高德围栏 ID（允许 NULL）
owner_account   text      -- 客户归属
7.5 ele_fence_alerts 关键字段
sql
alert_type      text      -- 'speeding' / 'staying'
enabled         boolean
fence_id        text      -- JSON 数组字符串 '["uuid1","uuid2"]'
                          -- 空数组 '[]' = 全域提醒
speed_threshold integer   -- 超速阈值（默认 80）
stay_duration   integer   -- 停留时长（默认 30 分钟）
stay_radius     integer   -- 停留半径（默认 200 米）
monitor_start   text      -- 'HH:mm:ss'
monitor_end     text      -- 'HH:mm:ss'
owner_account   text      -- 客户归属
7.6 ⚠️ 关键字段类型
表.字段	类型
customers.id	uuid
vehicles.customer_id	uuid
drivers.customer_id	uuid
users.owner_account	text NULL（NULL=主账号）
ele_fences.owner_account	text NULL
ele_fence_alerts.owner_account	text NULL
waybills.owner_account	text NULL
routes.owner_account	text NULL
7.7 表级权限
sql
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
⚠️ RLS ≠ GRANT。RLS 关了不代表 GRANT 了。

7.8 唯一约束
sql
CREATE UNIQUE INDEX IF NOT EXISTS roles_owner_name_unique
ON roles (owner_account, name);
八、📁 前端页面结构
入口 & 框架
LoginView.vue — 登录页（三层角色判断 + 子账号识别 + customers.permissions 优先）

PortalSelect.vue — 管理员门户（进客户视角需补齐 account 字段）

Dashboard.vue — 客户端主框架（⭐ 所有客户端页面的壳）

admin/AdminLayout.vue — 管理端主框架

⭐ Dashboard.vue 路由挂载方式（关键坑）
客户端所有页面都是 component: Dashboard.vue，真实页面由 Dashboard 内部根据 route.path 渲染。

加新页面必须改 3 个地方：

router/index.js 里加独立路由（指向 Dashboard.vue）

Dashboard.vue 里加 <template v-else-if="route.path === '/xxx'"><Xxx /></template>

Dashboard.vue 里 import Xxx from '@/views/Xxx.vue' + pathLabels 加标题 + routePermissionMap 加权限映射

管理端
AdminDashboard.vue — 数据总览

AdminCustomer.vue — 客户管理

AdminVehicle.vue — 车辆管理

AdminAccounts.vue — 管理员账号

RoleManage.vue — 角色管理

OrgManage.vue — 组织管理

UserManage.vue — 用户管理

客户端
ClientHome.vue — 首页（强制按 phone 反查 customerId）

FullMap.vue — 全图监控（8s 超时 + 并发 15 + 缓存 key + 组织过滤）

Waybill.vue / WaybillCreate.vue / WaybillDetail.vue / Report.vue

ClientVehicleArchive.vue — 车辆档案

ClientDriverArchive.vue — 司机档案

电子围栏
EleFenceSetting.vue — 围栏设置

EleFenceAlertSetting.vue — 提醒设置

EleFenceAlertQuery.vue — 提醒事件查询（超速 + 停留 tab）

components/AddEleFenceDialog.vue — 新增/编辑围栏

components/OverspeedDetailDialog.vue — 超速详情弹窗

components/StayDetailDialog.vue — 停留详情弹窗

⭐ 路线管理（本次新增）
views/RouteManage.vue — 路线管理列表页

components/RouteFormDialog.vue — 路线表单（新增/编辑/详情三态）

公共组件
SidebarMenu.vue — 侧边栏

PersonalSettings.vue — 个人设置

九、🔐 权限体系
9.1 三层角色判断（LoginView.vue）
js
const ownerAccount = String(userData.owner_account || '').trim()
const isSubAccount = !!ownerAccount && ownerAccount !== userData.account

const roleId = Number(userData.role_id) || 0
let isAdmin = false

// ⭐ 子账号一定不是管理员
if (!isSubAccount) {
  if (roleCode === 'admin' || roleName.includes('管理员')) isAdmin = true
  if (!roleId && (userName === '管理员' || userName === 'admin')) isAdmin = true
  if ([1, 2].includes(roleId)) isAdmin = true
}
9.2 权限来源统一
customers.permissions 是权威来源

js
if (!isAdmin && !isSubAccount && userData.phone) {
  const { data: c } = await supabase.from('customers')
    .select('id, permissions, platforms')
    .eq('phone', userData.phone).limit(1)
  // 覆盖 account.permissions.client
}
if (isSubAccount) {
  mergedPermissions = mergedPermissions.filter(p => p !== 'system')
}
9.3 account 对象
js
{
  id, account, phone, name, email,
  role: 'admin' | 'customer',
  roleId, roleName, orgId, org,
  platforms, permissions: { client: [] },
  isSubAccount, ownerAccount, masterAccount, masterName, masterPhone,
  customerName, customerId,
}
9.4 数据隔离原则
场景	判断	查询过滤
管理员	role === 'admin'	无过滤
主账号（车辆/司机/路线）	customer && !subAccount	customer_id = myCustomerId
子账号（车辆/司机）	customer && subAccount	customer_id = myCustomerId AND org = myOrgName
客户（围栏/提醒/路线）	isCustomer	owner_account = myAccount
拿不到 customerId	—	返回空（防越权）
myAccount 变量统一写法：

js
const myAccount = currentUser.masterAccount || currentUser.account || ''
9.5 SidebarMenu 权限控制
js
const clientPerms = computed(() => {
  if (currentUser?.role !== 'customer') return null  // 管理员全显示
  const list = currentUser?.permissions?.client
  if (!Array.isArray(list) || list.length === 0) return null  // 空数组也全显示
  return list
})

const hasPerm = (key) => {
  if (clientPerms.value === null) return true
  return clientPerms.value.includes(key)
}
十、⚡ 超速提醒模块
10.1 整体流程
text
1. 提醒设置：选围栏（多选，不选=全域）+ 阈值 + 每日时段
      ↓
2. 前端 EleFenceAlertQuery.vue：日期时间范围（默认今天 00:00~23:59）
      ↓
3. 云函数 dongfeng-overspeed-check：
   ┌──────────────────────────────────────┐
   │ 0. 若含 district 围栏 → 预加载边界   │
   │ 1. 并发 20 拉每辆车轨迹              │
   │ 2. 围栏判断（circle/polygon/polyline │
   │    /district，或全域跳过）            │
   │ 3. velocity > threshold → 超速点     │
   │ 4. 相邻点间隔 < 5min 合并成段        │
   │ 5. 段中心点逆地理编码（并发 3）      │
   └──────────────────────────────────────┘
      ↓
4. 前端表格：超速段列表 + 报警位置
      ↓
5. 查看详情 → OverspeedDetailDialog
10.2 云函数关键参数
参数	值
CONCURRENCY	20
GEO_CONCURRENCY	3
SEGMENT_GAP_MS	5 * 60 * 1000
10.3 围栏形状支持
形状	判断算法
circle	Haversine 距离 < radius
polygon	射线法（首尾闭合）
polyline	点到线段最短距离 < bufferradius
district	高德行政区划 API 拿边界 → 射线法
10.4 前端缓存策略
首次进页面：sessionStorage 标志检查 → 强制拉取

切回页面：读缓存（5 分钟 TTL），命中秒开

点"搜索"/"重置"：强制重拉

缓存 key：overspeed_alerts_cache_${userPart}_${rangePart}

十一、🚧 全域提醒
触发：提醒设置不选任何围栏 + 提交时弹确认框

保存：fence_id = '[]'

云函数：isGlobal = true，跳过围栏判断

前端：黄色"全域提醒"徽章 + 提示条

十二、⭐ 路线管理模块（本次新增）
12.1 数据表
见 § 7.2 routes 表。

12.2 菜单 & 路由挂载
SidebarMenu.vue 里运输管理分组下加：

vue
<el-menu-item v-if="hasPerm('route')" index="/route/manage">路线管理</el-menu-item>
或（暂时不做权限时）：

vue
<el-menu-item index="/route/manage">路线管理</el-menu-item>
router/index.js 里加（独立路由，指向 Dashboard.vue）：

js
{
  path: '/route/manage',
  name: 'RouteManage',
  component: () => import('../views/Dashboard.vue'),
}
Dashboard.vue 里加 3 处：

js
// 1. import
import RouteManage from '../views/RouteManage.vue'

// 2. 模板加
<template v-else-if="route.path === '/route/manage'">
  <RouteManage />
</template>

// 3. pathLabels 加
'/route/manage': '路线管理',

// 4. routePermissionMap 加（可选）
'/route/manage': 'route',
⚠️ 不要挂在 AdminLayout 下，否则会显示"管理端"壳子。要挂在 Dashboard 下。

12.3 RouteManage.vue 列表页
功能	实现
状态 tab	正常/停用（status = 'active'/'disabled'）
工具栏	新增/导出/刷新/密度/列设置/全屏
操作列	详情 / 编辑 / 停用（active）/ 启用+删除（disabled）
全屏	Teleport to body + is-fullscreen class
操作按钮	胶囊按钮，各色描边 + hover 实底 + 上浮
详情	formReadonly = true 传给弹窗
删除	仅 disabled 状态显示，红色确认框
12.4 RouteFormDialog.vue 表单弹窗
三态：新增 / 编辑 / 详情（readonly prop）

布局：地图铺满 + 左上基础信息卡 + 右上方案卡列

核心功能：

功能	说明
所属机构	只查当前账号 owner_account；currentUser.customerName 硬塞到最前作为虚拟根
装货点/卸货点	从 ele_fences 拉，下拉底部可"去新建围栏"（复用 AddEleFenceDialog）
交换按钮	装/卸货点之间的圆形按钮，type="button" 防 submit，hover 旋转 180°
方案卡	可增删多方案；每个方案有名称/类型/途径点/里程/时间/过路费
途径点	手动添加 or 地图选点（反查地址自动填入）
规划路线	AMap.Driving 插件，优先用围栏真实坐标（center/points），退化为地理编码
多方案颜色	蓝/紫/粉/青/橙/靛/青绿/紫罗兰（避开红黄绿，不影响看堵车）
路线同时显示	所有已规划方案的路线同时在地图上显示
起终点围栏	画对应围栏形状（圆形/多边形/线形）；起点实线+15%填充，终点虚线+8%
标记	起终点：胶囊 marker 带方案号 + "起/终"；途径点：数字标签 1-1 1-2
点击方案卡	高亮该方案路线（变粗 100%），其他方案变淡 22%；再点取消
详情模式	readonly=true：自动规划所有方案（静默，不弹提示），所有路线同时展示；输入框禁用；卡片可折叠
折叠按钮	详情模式也保留（可收起看地图）
12.5 规划算法核心
js
// 优先用围栏坐标
const pickupFence = findFenceByName(form.pickup_point)
let originLngLat = getFenceCoord(pickupFence)  // circle: center, polygon/polyline: points[0]
if (!originLngLat) {
  originLngLat = await geocodeLocation(geocoder, form.pickup_point)  // 退化
}
12.6 详情模式自动规划
js
const handleOpened = async () => {
  // ...
  await initMap()
  if (props.readonly && form.pickup_point && form.delivery_point && form.plans.length > 0) {
    setTimeout(() => { autoPlanAllRoutes() }, 200)
  }
}

const autoPlanAllRoutes = async () => {
  autoPlanning.value = true
  for (let i = 0; i < form.plans.length; i++) {
    await handlePlanRoute(i, true)   // silent=true
  }
  activePlanKey.value = null
  updatePlanHighlight()
  autoPlanning.value = false
}
handlePlanRoute(idx, silent) 用 Promise 包装 driving.search，方便 await。

12.7 交换按钮坑 ⚠️
vue
<button type="button" @click.stop.prevent="swapPickupDelivery">
必须加 type="button" —— 否则默认为 submit，在 el-form 内会触发页面刷新/弹窗关闭

加 .stop.prevent 双重保险

12.8 卡片折叠
卡片头部 collapse-btn（< / >）：始终显示

卡片收起后的小圆按钮 collapsed-trigger：始终显示（详情模式也显示）

toggleInfoCard / togglePlanPanel：去掉 if (props.readonly) return（详情也能折叠）

十三、🎨 UI 规范
13.1 品牌色
用途	色值
主色（红）	#c8102e
主色渐变	linear-gradient(135deg, #c8102e, #a00d24)
主色深	#7F1D1D
淡红背景	#FEF2F2
边框	#E2E8F0
13.2 停留提醒蓝色
用途	色值
主色（蓝）	#3B82F6
蓝色渐变	linear-gradient(135deg, #3B82F6, #1D4ED8)
淡蓝背景	#EFF6FF
13.3 页面固定高度
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
13.4 加载动画（品牌红 + 4 阶段）
蒙层：rgba(248,250,252,0.75) + backdrop-filter: blur(16px)

车图标浮动 + 光环脉冲

进度条 + 百分比数字

4 阶段：读取配置 → 加载车辆 → 拉取轨迹 → 解析结果

13.5 弹窗背景滚动锁
js
const lockPageScroll = () => {
  document.body.style.overflow = 'hidden'
  document.documentElement.style.overflow = 'hidden'
  const mainContent = document.querySelector('.main-content')
  if (mainContent) mainContent.style.overflow = 'hidden'
}
13.6 表格样式（对齐路线的风格）
表头：#F8FAFC 背景，#0F172A 色，字重 700，13px

单元格：12.5px，#1E293B

行 hover：#FEF2F2

分页：红色高亮

十四、✅ 已完成
基础
CloudBase 迁移 + 匿名登录 + 静态托管 + Git 自动部署

SPA 404 重定向 + Web 安全域名

登录 & 权限
三层角色判断兜底

子账号识别 + 强制降级

权限来源 customers.permissions

管理员判定只看 code

管理端
客户管理（双表同步 + 批量导入车辆）

管理员账号（admins + users 双表同步）

角色管理（客户隔离 + 只 code 判管理员）

组织管理（组织树 + 分配车辆）

用户管理

客户端
ClientHome（phone 反查 customerId）

FullMap（8s 超时 + 并发 15 + 缓存 key + 组织过滤）

车辆档案（客户隔离 + 子账号禁止导入）

司机档案（客户隔离 + 子账号只读）

运单管理（列表 + 新建 + 详情 + 隔离）

电子围栏
4 个围栏云函数（增删改查）

AddEleFenceDialog：动态机构 + 根节点 + 4 形状

云函数支持 4 种形状判断

客户隔离：ele_fences.owner_account

⚡ 超速提醒
云函数 dongfeng-overspeed-check

前端 EleFenceAlertQuery.vue（5 分钟缓存）

组件 OverspeedDetailDialog.vue（曲线 + hover tooltip + 前端地址兜底）

全域提醒

客户隔离

⭐ 停留提醒（前端 + 云函数）
云函数 dongfeng-stay-check（stopEvent + 围栏 + 时长 + 拉轨迹补充 points + 每点逆地理编码）

前端 EleFenceAlertQuery.vue 加"提醒类型" tab

停留表格加"停留点数"列

StayDetailDialog.vue：地图画停留点 + 编号 + 连线 + 停留半径圆（以第一个点为圆心）

时间线卡片显示地点（云函数返回的 address）

点击卡片 → 地图定位到对应点

⭐ 路线管理（本次新增）
routes 表 + 索引 + 唯一约束

RouteManage.vue：状态 tab + 工具栏（新增/导出/刷新/密度/列设置/全屏）+ 操作列（详情/编辑/停用/启用/删除）

RouteFormDialog.vue：

地图铺满 + 左上基础信息卡 + 右上方案卡列

所属机构（当前账号 + 客户名根节点）

装货点/卸货点（可新建围栏）

一键交换按钮

多方案 + 途径点 + 地图选点

AMap.Driving 规划，优先用围栏坐标

方案配色（8 色避开红黄绿）

起终点围栏形状绘制（实线/虚线）

点击方案卡高亮对应路线

详情模式：只读 + 自动规划所有方案 + 卡片可折叠

页面滚动锁

UI
全系统统一（卡片 + 4 图标 + 品牌红）

品牌红加载动画（4 阶段 + 进度条）

页面固定高度 + 弹窗背景滚动锁

十五、⏳ 待办
☐ RLS 策略收紧

☐ 云函数预置并发

☐ 逆地理编码降级策略（超速段 > 200 时只对前 N 段做）

☐ 用户管理权限配置弹窗真实对接

☐ 老旧 admins 表清理

☐ 全图监控「实时跟踪」「轨迹回放」按钮

☐ 删除本地备份视频 login-bg-original.mp4

☐ 微信小程序（如需）

☐ 路线管理：装货/卸货点做地址 → 坐标映射（当前依赖围栏坐标，非围栏来源时退化）

☐ 路线管理：方案对比地图视图

十六、🔧 常见问题
Failed to fetch — 云函数没配 HTTP 网关 / 没开公网访问

myAccount is not defined — 报错文件里加：const myAccount = currentUser.masterAccount || currentUser.account || ''

Missing semicolon / Unexpected token — 代码被改乱，全选覆盖完整文件

白屏 — F12 Console 看红色报错

缺少 vehicles（创建围栏时） — 云函数代码粘错了，恢复 amap-geofence 原始代码

多边形 INVALID_PARAMS — 首尾没闭合 / 面积超限

云函数报 EXCEED_AUTHORITY — 不能用 app.callFunction，改 HTTP 网关

高德 20003 UNKNOWN_ERROR — 假错误，前端也算成功

高德 INVALID_USER_KEY — 检查 Key/SID 匹配、猎鹰 API 勾选、数字签名关闭、IP 白名单留空

登录"账号或密码不正确" — 拆分 .eq() 不用 .or()；.limit(1) 去重

客户登录 0 辆车 — customerId 传整数但字段是 uuid，ClientHome 强制按 phone 反查

客户权限为空 — 客户权限配在 customers.permissions

电子围栏客户不隔离 — ele_fences 加 owner_account，所有查询加 .eq

提醒设置/查询客户不隔离 — ele_fence_alerts 加 owner_account

超速提醒 0 段 — 检查监控时段 / 围栏覆盖 / 阈值；调试时阈值改成 10

district 围栏查不到 — 前端 loadFences 必须 select adcode；云函数环境变量 AMAP_WEB_KEY；IP 白名单留空

详情弹窗地址部分显示经纬度 — 云函数逆地理编码限流，GEO_CONCURRENCY = 3；前端有 AMap.Geocoder 兜底

页面能上下拖动 — height: calc(100vh - 101px) + overflow: hidden + html, body { overflow: hidden }

弹窗打开背景还能滚动 — 弹窗组件的 watch(modelValue) 里锁 .main-content 和 document.body

云函数日志看不到 — 云函数代码可能粘错了（去了别的云函数）

⭐ 路线管理菜单不显示 — 客户权限没配 route，或 hasPerm 逻辑要放宽（空数组视为不过滤）

⭐ 路线管理跑到管理端 — 路由挂在了 AdminLayout 下，要挂在 Dashboard 下

⭐ 路线交换按钮点击退出来 — <button> 默认 type=submit，加 type="button"

⭐ 路线起点跟围栏位置对不上 — 云函数没用围栏真实坐标，getFenceCoord 优先读 ele_fences.center / points

⭐ 路线详情模式卡片没有隐藏按钮 — 上一轮误加 v-if="!readonly"，要删掉

⭐ 路线详情模式还要点"查看路线" — 要加 autoPlanAllRoutes 自动规划

⭐ 规划路线 INVALID_USER_SCODE — 高德 Key 没开通"驾车路径规划"权限

⭐ 方案卡片点击不触发高亮 — 事件冒泡被输入框/按钮吃掉，用 e.target.closest() 过滤

十七、🚀 部署流程
bash
cd /Users/lyn/my-cd
npm run dev    # 本地
git add .
git commit -m "feat: xxx"
git push origin main
# CloudBase 自动构建 + 发布，1-2 分钟
⚠️ 改完登录相关文件后必须退出重登
⚠️ 新建云函数后必须配 HTTP 网关 + 环境变量 + 公网访问

十八、📌 关键常量
名称	值
CloudBase 环境 ID	wuxian-token-d0guymjkpadcd1f22
HTTP 网关	https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com
高德 JS Key	273f5c474604b71906674aac159b8f45
高德 Web Key	491d5475803e65c06ba6169bdaf3e1f3
高德猎鹰 SID	1078871
东风 Token	c40c7311ff604a598b9fb791a63e9deb
FullMap 并发	15
超速/停留云函数并发	20
逆地理编码并发	3
前端缓存 TTL	5 分钟
前端 fetch 超时	8000ms
超速段合并间隔	5 分钟
路线方案配色池	#2563EB / #8B5CF6 / #EC4899 / #06B6D4 / #F97316 / #6366F1 / #14B8A6 / #A855F7
十九、📁 关键文件
文件	说明
src/utils/supabase.js	CloudBase 初始化
src/router/index.js	路由表
src/views/Dashboard.vue	⭐ 客户端所有页面的壳
src/views/LoginView.vue	登录页
src/views/PortalSelect.vue	管理员门户
src/views/ClientHome.vue	客户端首页
src/views/FullMap.vue	全图监控
src/views/UserManage.vue	用户管理
src/views/admin/RoleManage.vue	角色管理
src/views/admin/OrgManage.vue	组织管理
src/views/admin/AdminCustomer.vue	客户管理
src/views/admin/AdminAccounts.vue	管理员账号
src/views/Waybill.vue	运单管理
src/views/WaybillCreate.vue	新建运单
src/views/WaybillDetail.vue	运单详情
src/views/ClientVehicleArchive.vue	车辆档案
src/views/ClientDriverArchive.vue	司机档案
src/views/EleFenceSetting.vue	围栏设置
src/views/EleFenceAlertSetting.vue	提醒设置
src/views/EleFenceAlertQuery.vue	提醒事件查询
⭐ src/views/RouteManage.vue	路线管理
⭐ src/components/RouteFormDialog.vue	路线表单弹窗
src/components/AddEleFenceDialog.vue	新增/编辑围栏
src/components/OverspeedDetailDialog.vue	超速详情弹窗
src/components/StayDetailDialog.vue	停留详情弹窗
src/components/SidebarMenu.vue	侧边栏菜单
二十、🎯 下次推荐方向
路线管理完善：

装货/卸货点 → 地址 → 坐标映射（不依赖围栏）

方案对比（多条路线同时高亮对比）

路线规划结果缓存（避免每次打开都重算）

RLS 策略收紧（上线前必做）

云函数预置并发（避免冷启动）

逆地理编码降级策略（超速段 > 200）

全图监控「实时跟踪」「轨迹回放」按钮落地

用户管理权限配置弹窗对接

最后更新：2026-10-15
状态：
✅ 客户/子账号数据隔离完整闭环
✅ 登录权限来源 customers.permissions
✅ 车辆/司机/围栏/提醒/路线 客户隔离
✅ 超速提醒全流程
✅ 停留提醒全流程
✅ 路线管理完整（含自动规划、多方案颜色、围栏绘制、详情只读）