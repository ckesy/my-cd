东风车队管理系统 — 开发交接文档（含小程序端）
最后更新：2026-10-16（新增微信小程序端）

一、项目概况
项	Web 端	小程序端
项目名称	东风车队管理系统	东风车队（运单管理）
技术栈	Vue 3 + Vite + Element Plus + 高德地图 JS API	uni-app (Vue 3 + Vite) 编译到微信小程序
代码仓库	https://github.com/ckesy/my-cd	https://github.com/ckesy/my-cd-miniprogram
本地路径	/Users/lyn/my-cd	/Users/lyn/my-cd-miniprogram
启动命令	npm run dev	npm run dev:mp-weixin
部署方式	Git 自动部署（push main → CloudBase 自动构建 + 发布）	手动上传（微信开发者工具 → 上传 → 设为体验版）
线上地址	https://wuxian-token-d0guymjkpadcd1f22-1447716425.tcloudbaseapp.com/	体验版二维码（暂无正式地址）
小程序端关键信息速查
项	值
小程序 AppID	wx88a7b64684f68cef
微信开发者工具导入目录	/Users/lyn/my-cd-miniprogram/dist/dev/mp-weixin
微信云开发环境	已开通个人版（19.9 元/月）
CloudBase 环境 ID	wuxian-token-d0guymjkpadcd1f22
匿名登录	已在 CloudBase 控制台开启
云函数名称	login-by-account
小程序调用方式	wx.cloud.callFunction（不能用 HTTP 网关，匿名会报 EXCEED_AUTHORITY）
二、后端与云服务
平台：腾讯云 CloudBase（个人版）

环境 ID：wuxian-token-d0guymjkpadcd1f22

数据库：CloudBase PostgreSQL（共享版，无内网/外网 IP）

身份认证：CloudBase 匿名登录（signInAnonymously）

Web SDK：@cloudbase/js-sdk（在 src/utils/supabase.js 初始化）

小程序 SDK：wx.cloud 原生调用 + 云函数 @cloudbase/node-sdk 或 axios 调 HTTP API

安全域名：wuxian-token-d0guymjkpadcd1f22-1447716425.tcloudbaseapp.com

SPA 路由：错误码 404 → 替换为 /index.html

HTTP 网关基础 URL：https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com

三、🔑 Key / Token 速查
高德
名称	值	用途
JS API Key	273f5c474604b71906674aac159b8f45	前端地图（JS SDK）
Web 服务 Key	491d5475803e65c06ba6169bdaf3e1f3	云函数猎鹰 + 逆地理编码 + 行政区划
猎鹰 SID	1078871	电子围栏实例
数字签名	必须关闭	—
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
旧 Supabase（已弃用）
项目 ID：sfwwbcrpouelrjavecfj

四、☁️ 云函数清单（Web 端已有）
所有云函数：Node.js 18.15，package.json = {}，必须开启公网访问。

云函数名	作用	HTTP 网关路径	环境变量
amap-geofence	新建围栏	/amap-geofence	AMAP_WEB_KEY、AMAP_SID
amap-geofence-update	更新围栏	/amap-geofence-update	同上
amap-geofence-delete	删除围栏	/amap-geofence-delete	同上
amap-geofence-list	查询围栏列表	/amap-geofence-list	同上
dongfeng-lostlocation	东风实时位置中转（8s 超时）	/dongfeng-lostlocation	DONGFENG_TOKEN
dongfeng-overspeed-check	超速提醒	/dongfeng-overspeed-check	DONGFENG_TOKEN, AMAP_WEB_KEY
dongfeng-stay-check	停留提醒	/dongfeng-stay-check	DONGFENG_TOKEN, AMAP_WEB_KEY
环境变量值：

text
AMAP_WEB_KEY = 491d5475803e65c06ba6169bdaf3e1f3
AMAP_SID = 1078871
DONGFENG_TOKEN = c40c7311ff604a598b9fb791a63e9deb
Web 端调用（统一 fetch）：

js
const API_BASE = 'https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com'
await fetch(`${API_BASE}/dongfeng-overspeed-check`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ vehicles, fences, threshold, startTime, endTime, withAddress: true }),
})
小程序端新增云函数：login-by-account
项	说明
作用	账号密码
本回答由 AI 生成，内容仅供参考，请仔细甄别
更新一下
用户希望我更新开发交接文档，加入小程序端的开发进展。我需要把这次对话中关于小程序的所有信息整合进现有文档。

让我梳理一下小程序端的关键进展和踩过的坑：

项目信息：

仓库：https://github.com/ckesy/my-cd-miniprogram

本地路径：/Users/lyn/my-cd-miniprogram

AppID：wx88a7b64684f68cef

技术栈：uni-app (Vue 3 + Vite) + 微信小程序

启动命令：npm run dev:mp-weixin

微信开发者工具导入目录：dist/dev/mp-weixin

关键坑：

小程序必须用 wx.cloud.callFunction，不能用 HTTP 网关（匿名会 EXCEED_AUTHORITY）

云开发环境要关联腾讯云环境

云函数用 @cloudbase/node-sdk 报 Invalid schema

用 axios 调 HTTP API 也报 400，缺少 x-device-id header

匿名登录需要 x-device-id

PostgREST API 端点：https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com

认证端点：/auth/v1/signin/anonymously

数据库 REST：/v1/rdb/rest

已完成：

环境搭建

登录页 UI

云函数 login-by-account 创建

wx.cloud 调用链路打通

待解决：

云函数查询数据库（HTTP API 需要 x-device-id）

目录结构：

src/pages/login/login.vue

src/pages/waybill/list.vue

src/pages/waybill/detail.vue

src/utils/cloudbase.js

src/App.vue

src/manifest.json（含 AppID）

src/pages.json

project.config.json（注意不要开启 packNpmManually）

我应该把这些信息加到交接文档里，作为附录章节，保持原有 Web 端的内容不变。文档结构上，我可以在开头项目概况部分补充小程序的信息，然后新增一个专门的小程序章节。

我写一份更新版，把小程序相关的都加进去。

东风车队管理系统 - 开发交接文档
新对话开场白：把本文件完整粘贴给 AI，并说明「接着做 XXX」即可无缝续接。

最后更新：2026-10-16（第五版 · 新增微信小程序端）

一、项目概况
项	Web 端	小程序端
项目名称	东风车队管理系统	东风车队（运单管理小程序）
技术栈	Vue 3 + Vite + Element Plus + 高德地图 JS API	uni-app（Vue 3 + Vite）编译到微信小程序
代码仓库	https://github.com/ckesy/my-cd	https://github.com/ckesy/my-cd-miniprogram
线上地址	https://wuxian-token-d0guymjkpadcd1f22-1447716425.tcloudbaseapp.com/	体验版二维码（暂无正式地址）
本地路径	/Users/lyn/my-cd	/Users/lyn/my-cd-miniprogram
启动命令	cd /Users/lyn/my-cd && npm run dev	cd /Users/lyn/my-cd-miniprogram && npm run dev:mp-weixin
部署方式	Git 自动部署（push main → CloudBase 自动构建 + 发布）	手动上传（微信开发者工具 → 上传 → 设为体验版）
小程序 AppID	—	wx88a7b64684f68cef
微信开发者工具导入目录	—	/Users/lyn/my-cd-miniprogram/dist/dev/mp-weixin
二、后端与云服务
平台：腾讯云 CloudBase（个人版）

环境 ID：wuxian-token-d0guymjkpadcd1f22

数据库：CloudBase PostgreSQL（共享版，无内网/外网 IP）

身份认证：CloudBase 匿名登录（signInAnonymously）；小程序端已开通微信云开发个人版（19.9 元/月）

Web SDK：@cloudbase/js-sdk（在 src/utils/supabase.js 初始化）

小程序 SDK：wx.cloud 原生调用 + 云函数内用 axios 调 HTTP API（见 § 二十五）

安全域名：wuxian-token-d0guymjkpadcd1f22-1447716425.tcloudbaseapp.com

SPA 路由：错误码 404 → 替换为 /index.html

HTTP 网关基础 URL：https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com

CloudBase API 网关（小程序端 HTTP API 用）：https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com

三、🔑 Key / Token 速查
高德
名称	值	用途
JS API Key	273f5c474604b71906674aac159b8f45	前端地图（JS SDK）
Web 服务 Key	491d5475803e65c06ba6169bdaf3e1f3	云函数猎鹰 + 逆地理编码 + 行政区划
猎鹰 SID	1078871	电子围栏实例
数字签名	必须关闭	—
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
API 网关（小程序）	https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com
认证端点	/auth/v1/signin/anonymously
数据库 REST	/v1/rdb/rest
旧 Supabase（已弃用）
项目 ID：sfwwbcrpouelrjavecfj

四、☁️ 云函数清单
所有云函数：Node.js 18.15，package.json = {}，必须开启公网访问。

云函数名	作用	HTTP 网关路径	环境变量
amap-geofence	新建围栏	/amap-geofence	AMAP_WEB_KEY、AMAP_SID
amap-geofence-update	更新围栏	/amap-geofence-update	同上
amap-geofence-delete	删除围栏	/amap-geofence-delete	同上
amap-geofence-list	查询围栏列表	/amap-geofence-list	同上
dongfeng-lostlocation	东风实时位置中转（8s 超时）	/dongfeng-lostlocation	DONGFENG_TOKEN
dongfeng-overspeed-check	超速提醒	/dongfeng-overspeed-check	DONGFENG_TOKEN, AMAP_WEB_KEY
dongfeng-stay-check	停留提醒	/dongfeng-stay-check	DONGFENG_TOKEN, AMAP_WEB_KEY
login-by-account（小程序新增）	小程序账号密码登录 + 返回用户权限	走 wx.cloud.callFunction	无（用 API Key 方式）
环境变量值：

text
AMAP_WEB_KEY = 491d5475803e65c06ba6169bdaf3e1f3
AMAP_SID = 1078871
DONGFENG_TOKEN = c40c7311ff604a598b9fb791a63e9deb
Web 端调用（统一 fetch）：

js
const API_BASE = 'https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com'
await fetch(`${API_BASE}/dongfeng-overspeed-check`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ vehicles, fences, threshold, startTime, endTime, withAddress: true }),
})
⚠️ Web 端不用 app.callFunction → 匿名会报 EXCEED_AUTHORITY。
⚠️ 小程序端反过来：必须用 wx.cloud.callFunction，不能用 HTTP 网关。

HTTP 网关配置要点：

资源类型：云函数

触发路径：以 / 开头

跨域：开启

身份认证：关闭

⚠️ 新建云函数后必须手动配 HTTP 网关 + 环境变量 + 开启公网访问。

云函数坑：

云函数代码不能粘错：之前 dongfeng-overspeed-check 代码被误粘到 amap-geofence，导致创建围栏报"缺少 vehicles"

每个云函数代码开头都有注释标明文件路径，粘贴前先看第一行

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
10000	成功	—
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
返回 regeocode.formatted_address。配额：个人版 5000 次/天。

5.3 行政区划查询
text
https://restapi.amap.com/v3/config/district?key=xxx&keywords=140700&extensions=all&subdistrict=0
返回 districts[0].polyline，格式："lng,lat;lng,lat|...|..."

多段用 | 分隔，每段是闭合多边形

配额：个人版 30000 次/天

5.4 ⭐ 驾车路线规划（JS API 插件）
js
const AMap = await AMapLoader.load({
  key: '273f5c474604b71906674aac159b8f45',
  version: '2.0',
  plugins: ['AMap.Geocoder', 'AMap.TileLayer.Satellite', 'AMap.TileLayer.RoadNet', 'AMap.Driving'],
})

const driving = new AMap.Driving({
  policy: AMap.DrivingPolicy.LEAST_TIME,
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
endTime	同上
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
vehicles	车辆	id, plate, vin, customer_id(uuid), org_id(integer), org, fuel_type, vehicle_type, device_id, driver
drivers	司机档案	id, driver_name, phone, org, org_id(integer), bound_vehicle, ..., customer_id(uuid)
waybills	运单	id, waybill_no, status, create_time, owner_account, org(text), assigned_orgs(text, 已用)
ele_fences	电子围栏	id, name, org, shape, points, center, radius, bufferradius, adcode, location, gfid, owner_account(text), updated_at
ele_fence_alerts	围栏告警配置	id, alert_type, enabled, fence_id(JSON), fence_gfid, fence_name, speed_threshold, stay_duration, stay_radius, stay_count, monitor_start, monitor_end, owner_account
ele_fence_events	围栏事件（旧，弃用）	id, plate, org, start_time, alert_type
routes	路线管理	id, name, org, org_id(integer), pickup_point, delivery_point, remark, plans(jsonb), plan_count, creator, status, owner_account, customer_id, created_at, updated_at
organizations	组织	id, name, parent_id, owner_account, leader, phone, level(integer), is_root(boolean), customer_id(uuid)
users	系统用户	id, account, name, phone, email, password, org_id, role_id, status, owner_account, wx_openid(新增)
roles	角色	id, name, code(NOT NULL UNIQUE), description, permissions(JSONB), status, owner_account
fleets	车队	id, name, code, org_id, leader, phone
user_permissions	用户权限	id, user_id, resource_type, resource_id, status
7.2 ⭐ routes 表建表语句
sql
CREATE TABLE IF NOT EXISTS routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  org text,
  org_id integer,
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
CREATE INDEX IF NOT EXISTS idx_routes_org ON routes(org_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON routes TO anon;
CREATE UNIQUE INDEX IF NOT EXISTS routes_owner_name_unique ON routes (COALESCE(owner_account, ''), name);
ALTER TABLE routes ALTER COLUMN gfid DROP NOT NULL;
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
org             text      -- 二级机构子账号新增时写本机构名；其他情况为 NULL
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
fence_id        text      -- JSON 数组字符串 '["uuid1","uuid2"]'，空数组 '[]' = 全域提醒
fence_name      text      -- JSON 数组字符串（与 fence_id 位置对齐）
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
users.wx_openid	text NULL（小程序 OPENID）
ele_fences.owner_account	text NULL
ele_fence_alerts.owner_account	text NULL
waybills.owner_account	text NULL
waybills.assigned_orgs	text NULL（多个机构名逗号分隔）
routes.owner_account	text NULL
organizations.customer_id	uuid
organizations.level	integer
organizations.is_root	boolean
7.7 表级权限
sql
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
⚠️ RLS ≠ GRANT。RLS 关了不代表 GRANT 了。

7.8 唯一约束
sql
CREATE UNIQUE INDEX IF NOT EXISTS roles_owner_name_unique ON roles (owner_account, name);
7.9 小程序新增字段
sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS wx_openid text;
八、🔴 机构层级 + 数据隔离（核心架构）
8.1 背景
原系统用 users.org_id 是否为 NULL 判断子账号层级，且 organizations 表无 level 概念。导致：

一级机构子账号看不到数据

业务表按 org 名字符串匹配，机构改名就失效

前端虚拟根（客户名）与真实机构混用

8.2 改造目标
一个客户 = organizations 里一条真实根节点（is_root=true, level=1）

业务数据隔离统一按 users.org_id → organizations.level 判断

一级机构子账号等同主账号，二级及以下只看本机构

8.3 数据层变更 SQL
sql
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS level integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS is_root boolean DEFAULT false;

ALTER TABLE routes   ADD COLUMN IF NOT EXISTS org_id integer;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS org_id integer;
ALTER TABLE drivers  ADD COLUMN IF NOT EXISTS org_id integer;

ALTER TABLE waybills ADD COLUMN IF NOT EXISTS org text;
ALTER TABLE waybills ADD COLUMN IF NOT EXISTS assigned_orgs text;
8.4 全项目统一判断函数（所有业务页复制这段）
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

const loadMyOrgInfo = async () => {
  if (!isCustomer || !isSubAccount) return
  if (myOrgName.value && myOrgLevel.value) return
  if (!currentUser.orgId) return
  const { data } = await supabase.from('organizations')
    .select('name, level').eq('id', currentUser.orgId).maybeSingle()
  if (data) {
    if (data.name) myOrgName.value = String(data.name).trim()
    myOrgLevel.value = Number(data.level) || 1
  }
}
8.5 隔离规则对照表
角色	customer_id	owner_account	org 过滤	orgLevel
管理员	❌	❌	❌	—
主账号	✅	✅	❌	—
一级机构子账号	✅	✅	❌	=1
二级+子账号	✅	✅	✅	≥2
关键区分：

客户级数据（按 owner_account 隔离）：waybills / ele_fences / ele_fence_alerts / roles

客户级 + org 隔离：vehicles / drivers / routes

围栏特殊口径：二级机构子账号严格只看本机构（org = 我的机构名），不含 org IS NULL

8.6 ⭐ 运单特殊隔离（assigned_orgs）
二级机构子账号：owner_account = 主账号 AND (assigned_orgs LIKE '%机构名%' OR org = 我的机构名)

发布时：WaybillCreate.vue 从指派的车队名提取 → 写入 assigned_orgs

二级子账号自己创建时：兜底把自己机构名加进去（保证自己能看见）

主账号/一级子账号：不受 assigned_orgs 限制（只看 owner_account）

8.7 ⭐ 车辆-机构绑定（org_id 递归）
vehicles.org_id 是车辆归属机构的 id

机构树的"车辆数" = 递归求和（本机构 + 所有子孙机构）

OrgManage.vue / UserManage.vue / AdminCustomer.vue 都走这个递归

分配车辆弹窗：点 [→] 或 [←] 直接把车辆 org_id 挂到目标机构

九、📁 前端页面结构
Web 端 — 入口 & 框架
LoginView.vue — 登录页（三层角色判断 + 子账号识别 + customers.permissions 优先 + 注入 orgLevel/orgName/isRootOrg）

PortalSelect.vue — 管理员门户（⭐ 最近进入客户分组，localStorage 记录最多 3 条）

Dashboard.vue — 客户端主框架（⭐ 所有客户端页面的壳）

admin/AdminLayout.vue — 管理端主框架

⭐ Dashboard.vue 路由挂载方式（关键坑）
客户端所有页面都是 component: Dashboard.vue，真实页面由 Dashboard 内部根据 route.path 渲染。
加新页面必须改 3 个地方：

router/index.js 里加独立路由（指向 Dashboard.vue）

Dashboard.vue 里加 <template v-else-if="route.path === '/xxx'"><Xxx /></template>

Dashboard.vue 里 import Xxx + pathLabels 加标题 + routePermissionMap 加权限映射

Web 端 — 管理端
AdminDashboard.vue — 数据总览

AdminCustomer.vue — 客户管理（同步建 organizations 根节点 + ⭐ 组织机构树显示车辆数）

AdminVehicle.vue — 车辆管理（⭐ 卡片式布局 + 4 图标按钮）

AdminAccounts.vue — 管理员账号（写入 users.role_id + 反查 users 校验脏数据）

RoleManage.vue — 角色管理

OrgManage.vue — 组织管理（⭐ 双栏看板分配车辆 + 筛选下拉 + 全屏锁定）

UserManage.vue — 用户管理（⭐ 组织机构树显示车辆数）

Web 端 — 客户端
ClientHome.vue — 首页

FullMap.vue — 全图监控

Waybill.vue / WaybillCreate.vue / waybill-detail.vue / Report.vue（占位）

VehicleArchive.vue — 车辆档案

DriverArchive.vue — 司机档案

Web 端 — 电子围栏
EleFenceSetting.vue — 围栏设置

EleFenceAlertSetting.vue — 提醒设置（⭐ 二级子账号只读）

EleFenceAlertQuery.vue — 提醒事件查询

components/AddEleFenceDialog.vue — 新增/编辑围栏（⭐ 改名同步提醒配置）

components/OverspeedDetailDialog.vue — 超速详情弹窗

components/StayDetailDialog.vue — 停留详情弹窗

Web 端 — 路线管理
views/RouteManage.vue — 路线管理列表页

components/RouteFormDialog.vue — 路线表单（新增/编辑/详情三态）

Web 端 — 公共组件
SidebarMenu.vue — 侧边栏

PersonalSettings.vue — 个人设置

FunctionPermissionDialog.vue — 权限配置弹窗

小程序端 — 页面结构
text
my-cd-miniprogram/
├── src/
│   ├── pages/
│   │   ├── login/login.vue       # 登录页
│   │   ├── waybill/list.vue      # 运单列表（待开发）
│   │   └── waybill/detail.vue    # 运单详情（待开发）
│   ├── utils/
│   │   └── cloudbase.js          # CloudBase 初始化（可选）
│   ├── App.vue                   # 全局 wx.cloud.init
│   ├── main.js
│   ├── manifest.json             # ⭐ 小程序 AppID 配置
│   └── pages.json                # ⭐ 页面路由
├── dist/dev/mp-weixin/           # 编译产物，微信开发者工具导入此目录
├── project.config.json           # ⚠️ 不要开 packNpmManually
└── package.json
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
10.2 权限来源统一
customers.permissions 是权威来源：

js
if (!isAdmin && !isSubAccount && userData.phone) {
  const { data: c } = await supabase.from('customers')
    .select('id, permissions, platforms')
    .eq('phone', userData.phone).limit(1)
}
if (isSubAccount) {
  mergedPermissions = mergedPermissions.filter(p => p !== 'system')
}
10.3 account 对象（LoginView 注入）
js
{
  id, account, phone, name, email,
  role: 'admin' | 'customer',
  roleId, roleName,
  orgId,          // users.org_id
  org,            // 兼容旧字段（空）
  orgName,        // ⭐ organizations.name（真实机构名）
  orgLevel,       // ⭐ organizations.level（1/2/3...）
  isRootOrg,      // ⭐ orgLevel === 1
  platforms,
  permissions: { client: [] },
  isSubAccount,
  ownerAccount, masterAccount, masterName, masterPhone,
  customerName, customerId,
}
10.4 SidebarMenu.vue 权限控制
js
const clientPerms = computed(() => {
  if (currentUser?.role !== 'customer') return null
  const list = currentUser?.permissions?.client
  if (!Array.isArray(list) || list.length === 0) return null  // 空数组也全显示
  return list
})

const hasPerm = (key) => {
  if (clientPerms.value === null) return true
  return clientPerms.value.includes(key)
}
10.5 ⭐ 小程序端权限
小程序 login-by-account 云函数返回的 user 对象结构必须与 Web 端 account 对象对齐（至少包含下列字段）：

js
{
  id, account, name, phone,
  roleId, orgId, orgName, orgLevel,
  isSubAccount, ownerAccount
}
小程序端各页面用同样的 needOrgFilter 逻辑做数据隔离。

十一、⚡ 超速提醒模块
11.1 整体流程
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
11.2 云函数关键参数
参数	值
CONCURRENCY	20
GEO_CONCURRENCY	3
SEGMENT_GAP_MS	5 * 60 * 1000
11.3 围栏形状支持
形状	判断算法
circle	Haversine 距离 < radius
polygon	射线法（首尾闭合）
polyline	点到线段最短距离 < bufferradius
district	高德行政区划 API 拿边界 → 射线法
11.4 前端缓存策略
首次进页面：sessionStorage 标志检查 → 强制拉取

切回页面：读缓存（5 分钟 TTL），命中秒开

点"搜索"/"重置"：强制重拉

缓存 key：alert_cache_${alertType}_${userPart}_${rangePart}

十二、🚧 全域提醒
触发：提醒设置不选任何围栏 + 提交时弹确认框

保存：fence_id = '[]'

云函数：isGlobal = true，跳过围栏判断

前端：黄色"全域提醒"徽章 + 提示条

十三、⭐ 路线管理模块
13.1 数据表
见 § 7.2 routes 表。

13.2 菜单 & 路由挂载
SidebarMenu.vue 里运输管理分组下加：

vue
<el-menu-item v-if="hasPerm('route')" index="/route/manage">路线管理</el-menu-item>
router/index.js 里加：

js
{
  path: '/route/manage',
  name: 'RouteManage',
  component: () => import('../views/Dashboard.vue'),
}
Dashboard.vue 里加 import + 模板 + pathLabels + routePermissionMap。
⚠️ 不要挂在 AdminLayout 下。

13.3 RouteFormDialog.vue 核心功能
功能	说明
所属机构	从真实 organizations 读，二级机构子账号只显示本机构
装货点/卸货点	从 ele_fences 拉，下拉底部可"去新建围栏"
交换按钮	<button type="button"> 防 submit
方案卡	多方案 + 途径点 + 里程/时间/过路费
规划路线	AMap.Driving 插件，优先用围栏真实坐标
多方案颜色	蓝/紫/粉/青/橙/靛/青绿/紫罗兰
详情模式	readonly + 自动规划所有方案
保存	写 routes.org_id（从 orgList 反查）
十四、🎨 UI 规范
14.1 品牌色
用途	色值
主色（红）	#c8102e
主色渐变	linear-gradient(135deg, #c8102e, #a00d24)
主色深	#7F1D1D
淡红背景	#FEF2F2
边框	#E2E8F0
14.2 停留提醒蓝色
用途	色值
主色（蓝）	#3B82F6
蓝色渐变	linear-gradient(135deg, #3B82F6, #1D4ED8)
淡蓝背景	#EFF6FF
14.3 页面固定高度
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
14.4 加载动画（品牌红 + 4 阶段）
蒙层：rgba(248,250,252,0.75) + backdrop-filter: blur(16px)

车图标浮动 + 光环脉冲

进度条 + 百分比数字

4 阶段：读取配置 → 加载车辆 → 拉取轨迹 → 解析结果

14.5 弹窗背景滚动锁
js
const lockPageScroll = () => {
  document.body.style.overflow = 'hidden'
  document.documentElement.style.overflow = 'hidden'
  const mainContent = document.querySelector('.main-content')
  if (mainContent) mainContent.style.overflow = 'hidden'
}
14.6 表格样式（对齐路线风格）
表头：#F8FAFC 背景，#0F172A 色，字重 700，13px

单元格：12.5px，#1E293B

行 hover：#FEF2F2

分页：红色高亮

14.7 ⭐ 4 个图标按钮（列表页通用）
🔄 刷新：重拉数据

⚙️ 密度：大/中/小三档，影响表格行高和列宽

▦ 列设置：勾选显示哪些列 + 拖拽排序 + 左右固定

⛶ 全屏：表格卡片整个全屏，工具栏跟着进去

全屏状态下：新增/编辑/导入/批量分配按钮全部禁用

提示用 el-tooltip（:disabled="!isTableFullscreen" 只在全屏时触发）

按钮被 <span> 包裹以支持 disabled 状态下的 hover

14.8 ⭐ 门户最近进入客户分组
localStorage key：portal_recent_customers，值是 ["id1", "id2", "id3"] 有序数组

进入客户后调用 saveRecentCustomer(customer.id)（去重 + unshift + slice(0,3)）

el-select 用 <el-option-group label="最近进入"> + <el-option-group label="全部客户">

"最近进入"标签：绿色胶囊，带 box-shadow

14.9 小程序端样式规范
单位用 rpx（1rpx ≈ 0.5px on 375px 屏）

模板用 <view> <text> 替代 <div> <span>

品牌红 #c8102e 保持一致

登录页卡片宽度 80%，圆角 20rpx

十五、✅ 已完成
Web 端基础
CloudBase 迁移 + 匿名登录 + 静态托管 + Git 自动部署

SPA 404 重定向 + Web 安全域名

Web 端登录 & 权限
三层角色判断兜底

子账号识别 + 强制降级

权限来源 customers.permissions

管理员判定只看 code

角色停用拦截（isRoleActive）

注入 orgLevel/orgName/isRootOrg

Web 端机构层级重构
organizations 加 level/is_root/customer_id

每个客户一条真实根节点

业务表加 org_id

全项目统一用 orgLevel 判断隔离

OrgManage.vue 自动计算 level + 级联更新子孙

UserManage.vue 去虚拟根

AdminCustomer.vue 新增/改名/删除客户时同步 organizations 根节点

Web 端管理端
客户管理（双表同步 + 批量导入车辆 + org 根节点同步）

管理员账号（admins + users 双表同步 + role_id 写入 + 手机号查重 + 反查 users 校验脏数据）

角色管理（客户隔离 + 只 code 判管理员）

组织管理（组织树 + 分配车辆 + level 自动计算）

用户管理（去虚拟根）

数据总览（燃料统计口径修复）

Web 端客户端
ClientHome（按 orgLevel 隔离）

FullMap（8s 超时 + 并发 15 + 缓存 key + 按 orgLevel 隔离）

车辆档案（按 orgLevel 隔离 + 写 org_id + 编辑时不允许清空已有 org）

司机档案（按 orgLevel 隔离）

运单管理（按 assigned_orgs 指派机构可见）

路线管理（按 orgLevel 隔离 + 写 org_id）

Web 端电子围栏
4 个围栏云函数（增删改查）

AddEleFenceDialog：二级机构子账号强制写本机构 org + 改名同步 ele_fence_alerts.fence_name

云函数支持 4 种形状判断

二级机构严格隔离（eq('org', 我的机构名)）

Web 端超速提醒
云函数 dongfeng-overspeed-check

前端 EleFenceAlertQuery.vue（5 分钟缓存）

OverspeedDetailDialog.vue（曲线 + hover tooltip + 前端地址兜底）

全域提醒

按 orgLevel 隔离（loadVehicles / loadFences 都按 needOrgFilter 分支）

Web 端停留提醒
云函数 dongfeng-stay-check

前端 EleFenceAlertQuery.vue 加"提醒类型" tab

StayDetailDialog.vue：地图画停留点 + 编号 + 连线 + 停留半径圆

按 orgLevel 隔离

Web 端提醒设置隔离
EleFenceAlertSetting.vue：二级机构子账号只读模式（横幅 + 控件全禁用 + 保存/重置拦截）

Web 端运单指派机构可见
waybills.assigned_orgs 字段落地

WaybillCreate.vue：从指派车队提取机构名写入，二级子账号兜底加自己机构

Waybill.vue / waybill-detail.vue：二级子账号按 assigned_orgs 过滤

handleDelete 同样加隔离

Web 端围栏改名联动
AddEleFenceDialog.vue 编辑保存成功后调用 syncFenceNameToAlerts

遍历 ele_fence_alerts，位置对齐替换 fence_name 数组中的旧名

Web 端路线管理
routes 表 + 索引 + 唯一约束

RouteManage.vue：状态 tab + 工具栏 + 操作列

RouteFormDialog.vue：地图铺满 + 多方案 + 途径点 + AMap.Driving 规划

详情模式：只读 + 自动规划所有方案

写 routes.org_id

Web 端个人设置
修复严重 bug：改密码写错了表（原写 customers/admins，应写 users）

Web 端数据治理
vehicles.fuel_type：51 条 NULL → 纯电动（山西卡友新能源全部晋K****D 绿牌车）

users.role_id：无脏管理员（0 行，客户主账号 role_id=NULL 是正常的）

AdminAccounts.vue：fetchData 反查 users 标记 _noUser，脏数据只允许删除

⭐ Web 端组织管理页 UI 重构（OrgManage.vue）
车辆数递归计算：本机构 + 所有子孙机构，一次性预计算 Map（性能优化）

分配车辆弹窗：双栏看板

左：车辆池（未分配 + 其他机构的车）

右：已分配给当前机构

每卡片：[车牌号] + 昵称（如有）+ 转移按钮

单卡转移：点 [→] 或 [←]

批量模式：开关 → 卡片出现 checkbox → 底部批量按钮

筛选下拉：el-select + el-option-group（全部 / 未分配 / 其他机构 + 具体机构名）

筛选延迟 150ms 应用（appliedFilter）

移动的车辆金色高亮 + 最新置顶（保存前一直保持）

全屏锁定：新增按钮禁用 + el-tooltip 提示

⭐ Web 端车辆管理页 UI 重构（AdminVehicle.vue）
布局对齐车辆档案：卡片式

工具栏：左侧"共 X 条"，右侧所有动作按钮 + 4 图标按钮

表格：浅灰表头 + 品牌红 hover

分页：默认 20 条，大小选项 [20, 50, 100]

高度 calc(100vh - 101px) 锁死

⭐ Web 端门户最近进入客户分组（PortalSelect.vue）
localStorage 记录最近进入的 3 个客户

下拉分两组：「最近进入」（绿色标签） + 「全部客户」

⭐ Web 端组织机构树车辆数显示（UserManage.vue + AdminCustomer.vue）
每个机构/账号节点显示车辆数

递归计算（含所有子孙）

无车显示"暂无车辆"（灰色徽章）

⭐ 小程序端已完成（第五版新增）
uni-app 项目初始化（my-cd-miniprogram，独立 GitHub 仓库）

微信小程序个人主体注册（AppID wx88a7b64684f68cef）

服务类目：工具 → 实用工具 → 办公效率

微信开发者工具安装 + 导入项目（导入 dist/dev/mp-weixin）

CloudBase SDK 依赖安装

manifest.json 配置 AppID + 关闭 urlCheck

pages.json 配置登录 + 运单列表 + 运单详情三个路由

登录页 UI（品牌红标题 + 输入框 + 登录按钮，与 Web 端风格统一）

App.vue 中 wx.cloud.init({ env: 'wuxian-token-d0guymjkpadcd1f22', traceUser: true })

微信云开发个人版开通（19.9 元/月）+ 关联腾讯云环境

云函数 login-by-account 部署（Node.js 18.15）

小程序端通过 wx.cloud.callFunction 成功调用云函数（errMsg: "cloud.callFunction:ok"）

云函数中 @cloudbase/node-sdk 报 Invalid schema 后，改用 axios 调 CloudBase HTTP API

定位到匿名登录 400 的根因：缺 x-device-id 请求头

小程序端技术坑（重要）
必须用 wx.cloud.callFunction，不能用 HTTP 网关（匿名会报 EXCEED_AUTHORITY）

云函数 @cloudbase/node-sdk 有 bug：rdb() 无论传 schema 还是 searchPath 都报 Invalid schema: <envId>，暂改用 axios 调 HTTP API 绕过

匿名登录 API 需要 x-device-id 请求头：官方文档未提及，报错为 INVALID_ARGUMENT / 请在请求头添加设备id

API 网关地址：https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com

PostgREST 请求需要 Accept-Profile: public + Content-Profile: public 请求头

微信小程序的 request 合法域名白名单：必须在小程序后台配置 https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com

个人主体小程序无法使用微信支付、getPhoneNumber 等高级接口，登录必须走账号密码

uni-app 项目不要用微信开发者工具的「构建 npm」，Vite 会自动处理依赖

project.config.json 不要开 packNpmManually，否则会去解析 node_modules 里的 H5 代码导致崩溃

体验版不需官方审核，上传后在小程序后台"设为体验版"+ 添加体验成员即可扫码使用

十六、⏳ 待办清单
【专项待办 1-9】已全部完成 ✅
【本轮 UI 重构】已全部完成 ✅

原始待办（仍未做）

☐ 1. RLS 策略收紧（上线前必做）

☐ 2. 云函数预置并发（性能优化）

☐ 3. 逆地理编码降级策略（超速段 > 200 时只对前 N 段做）

☐ 4. 用户管理权限配置弹窗真实对接（FunctionPermissionDialog 保存逻辑）

☐ 5. 老旧 admins 表清理（orphan 记录）

☐ 6. 全图监控「实时跟踪」「轨迹回放」按钮落地

☐ 7. 删除本地备份视频 login-bg-original.mp4

☐ 8. 微信小程序端功能落地（进行中，见下方）

☐ 9. 路线管理：装货/卸货点做地址 → 坐标映射

☐ 10. 路线管理：方案对比地图视图

⭐ 小程序端待办（第五版新增）
☐ 1. 云函数 login-by-account 修复匿名登录 400（加 x-device-id 请求头）

☐ 2. 云函数查 PostgreSQL 数据（走 HTTP API + Accept-Profile: public）

☐ 3. 小程序后台配置 request 合法域名

☐ 4. 登录页联调真实账号（15035660010 / 123456!）

☐ 5. 运单列表页 pages/waybill/list.vue（复用 owner_account + assigned_orgs 隔离）

☐ 6. 运单详情页 pages/waybill/detail.vue（状态更新）

☐ 7. 运单实时推送（db.collection('waybills').watch()）

☐ 8. 车辆列表页（可选，司机端可能只看运单）

☐ 9. 上传体验版 + 添加体验成员扫码测试

十七、🎯 关键约定（不能违反）
Web 端
云函数必须走 HTTP 网关，不能用 app.callFunction（匿名会 EXCEED_AUTHORITY）

currentUser 依赖 LoginView 注入，任何改动都要退出重登才生效

子账号永远不是管理员（LoginView 强制判定）

子账号权限必须剔除 system（LoginView 里 filter）

CloudBase HTTP 网关基础 URL：https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com

登录校验的是 users.password，改密码一定写 users 表，别写 customers / admins

数据隔离三件套：customer_id + owner_account + org（按 role/level 组合）

全项目隔离统一判断：isRootOrgSubAccount 和 needOrgFilter 两个 computed

运单额外按 assigned_orgs 隔离

提醒配置是客户级共享的，二级子账号只读

围栏改名时要同步 ele_fence_alerts.fence_name（位置对齐替换 JSON 数组）

分配车辆弹窗里筛选切换要延迟 150ms（appliedFilter）

全屏时新增/编辑/导入按钮用 :disabled + el-tooltip 方案

小程序端（第五版新增）
必须用 wx.cloud.callFunction，不用 HTTP 网关（匿名会 EXCEED_AUTHORITY）

App.vue 必须 wx.cloud.init({ env: 'wuxian-token-d0guymjkpadcd1f22', traceUser: true })

小程序端不需要 @cloudbase/js-sdk 和 @cloudbase/wx-cloud-client-sdk（前端直连数据库被微信拦截）

云函数内查 PostgreSQL 走 HTTP API（API 网关 + Accept-Profile: public + Authorization: Bearer <token>）

匿名登录 API 必须带 x-device-id 请求头

微信开发者工具导入 dist/dev/mp-weixin，不是项目根目录

改完代码后，Vite 自动编译，微信开发者工具点「编译」刷新

uni-app 项目不要用微信开发者工具「构建 npm」

project.config.json 不要开 packNpmManually

小程序端 user 对象结构必须与 Web 端 account 对齐（含 orgId / orgLevel / orgName / isSubAccount / ownerAccount）

十八、🔧 快速验证清单
主账号 15035660010 登录（Web 端）
js
const u = JSON.parse(localStorage.currentUser)
// 期望：role='customer', orgId=null, orgLevel=null, isRootOrg=false, isSubAccount=false
→ 首页应显示该客户全部车辆
→ 车辆档案：编辑任意车，"所属机构组织"清空按钮应消失（有机构的车）
→ 提醒设置：无只读横幅，所有控件正常
→ 运单：能看到自己全部运单

子账号 15035660020 登录（Web 端，orgLevel=2，机构"管理员名下车辆"）
js
// 期望：orgId=4, orgName='管理员名下车辆', orgLevel=2, isRootOrg=false, isSubAccount=true
→ 车辆档案：只能看到本机构车
→ 提醒设置：顶部黄色只读横幅 + 所有控件禁用 + 保存/重置拦截
→ 运单：只能看到 assigned_orgs 含"管理员名下车辆" 或 org 匹配的运单
→ 路线管理：只能看到本机构路线

围栏改名验证（Web 端）
主账号登录 → 编辑一个已用于提醒配置的围栏 → 改名 → 保存

去提醒设置，已选 tag 应显示新名字

SQL 验证：

sql
SELECT id, fence_id, fence_name FROM ele_fence_alerts 
WHERE fence_id LIKE '%<围栏UUID>%';
组织管理页 UI（Web 端）
左侧树节点显示含子孙车辆数

点"分配车辆" → 双栏看板 → 点 [→] 转移 → 金色高亮置顶

筛选下拉：全部 / 未分配 / 其他机构 / 具体机构名

全屏时"新增组织"按钮禁用 + hover 提示

车辆管理页 UI（Web 端）
布局对齐车辆档案

4 图标按钮：刷新/密度/列设置/全屏

默认 20 条，页大小选项 [20, 50, 100]

页面不上下滚动

门户最近进入客户（Web 端）
进入某客户 → 返回门户 → 下拉列表顶部出现"最近进入"分组 + 绿色标签

小程序端登录验证
在微信开发者工具中导入 /Users/lyn/my-cd-miniprogram/dist/dev/mp-weixin

输入账号 15035660010 / 密码 123456!

期望：Console 打印 === 登录按钮被点击了 === → 云函数返回 code: 0 + user 对象

期望：弹出"登录成功" → 1 秒后跳转 /pages/waybill/list

如报错：看 Console 里 res.result.debug 数组，按错误码定位

十九、📋 数据库现状（截至 2026-10-16 第五版）
organizations
id	name	level	parent_id	is_root	customer_id
5	山西卡友新能源运输有限公司	1	NULL	true	678b9759-...
4	管理员名下车辆	2	5	false	678b9759-...
8	车队演示账号	1	NULL	true	ff786331-...
9	湖北分公司	2	8	false	ff786331-...
10	山西分公司	2	8	false	ff786331-...
users
id	account	name	org_id	owner_account	role_id
9	15035660010	山西卡友新能源运输有限公司	NULL	NULL	NULL（客户主账号）
11	15035660020	lyn	4	15035660010	19（二级机构子账号）
customers
id	name	phone
678b9759-...	山西卡友新能源运输有限公司	15035660010
ff786331-...	车队演示账号	15035661111
vehicles
org_id 分布：4（12 辆） / 5（43 辆） / 8（30 辆）

fuel_type：51 纯电动 + 4 燃气车（已填充）

测试账号密码
15035660010 / 123456!（主账号）

15035660020 / 密码待确认（二级子账号）

二十、🔧 常见问题
现象	原因	修法
Failed to fetch	云函数没配 HTTP 网关 / 没开公网访问	配 HTTP 网关 + 公网访问
myAccount is not defined	报错文件里没定义	加 const myAccount = currentUser.masterAccount || currentUser.account || ''
Missing semicolon / Unexpected token	代码被改乱	全选覆盖完整文件
白屏	语法错误	F12 Console 看红色报错
缺少 vehicles（创建围栏时）	云函数代码粘错了	恢复 amap-geofence 原始代码
多边形 INVALID_PARAMS	首尾没闭合 / 面积超限	闭合首尾点
云函数报 EXCEED_AUTHORITY	用了 app.callFunction	改用 HTTP 网关
高德 20003 UNKNOWN_ERROR	假错误	前端也算成功
高德 INVALID_USER_KEY	Key/SID 不匹配	检查猎鹰 API 勾选、数字签名关闭、IP 白名单留空
登录"账号或密码不正确"	.or() 语法问题	拆分 .eq()；.limit(1) 去重
客户登录 0 辆车	customerId 类型不匹配	ClientHome 强制按 phone 反查
客户权限为空	权限配错位置	客户权限配在 customers.permissions
电子围栏客户不隔离	没加 owner_account	ele_fences 加 owner_account，查询加 .eq
超速提醒 0 段	时段/围栏/阈值问题	调试时阈值改成 10
详情弹窗地址部分显示经纬度	云函数逆地理编码限流	GEO_CONCURRENCY = 3；前端有 AMap.Geocoder 兜底
页面能上下拖动	高度没锁	height: calc(100vh - 101px) + overflow: hidden
弹窗打开背景还能滚动	没锁 body	watch(modelValue) 里锁 .main-content 和 document.body
云函数日志看不到	代码粘错位置	检查文件首行注释
路线管理菜单不显示	权限没配 route	客户权限配 route，或 hasPerm 逻辑放宽
路线管理跑到管理端	路由挂在 AdminLayout 下	挂到 Dashboard 下
路线交换按钮点击退出来	<button> 默认 type=submit	加 type="button"
路线起点跟围栏位置对不上	没用围栏真实坐标	getFenceCoord 优先读 ele_fences.center / points
路线详情模式卡片没有隐藏按钮	误加 v-if="!readonly"	删掉
规划路线 INVALID_USER_SCODE	高德 Key 没开通"驾车路径规划"	开通权限
方案卡片点击不触发高亮	事件被输入框吃掉	e.target.closest() 过滤
子账号看不到数据	currentUser.orgLevel 缺失	退出重登 / 检查 LoginView
一级机构子账号被误隔离	用了 currentUser.orgId 判断	改用 isRootOrgSubAccount + needOrgFilter
管理员登录进不了管理端	users.role_id 为 null 且 name 不含"管理员"	补 role_id / 改 name
改完密码没生效	写到了 customers/admins 表	改回写 users 表
客户新增后子账号无法绑定机构	organizations 无根节点	检查 AdminCustomer.vue 的 syncCreateOrgRoot
客户改名后界面不一致	organizations 根节点 name 未同步	同上
车辆筛选"燃油车" 0 条	旧数据存的是"燃油"	数据迁移 SQL（已完成）
二级子账号看不到某条运单	assigned_orgs 未包含其机构名	发布时选"指派车队"选机构 / 或直接改 assigned_orgs
二级子账号改了提醒设置影响主账号	已加只读模式拦截	如仍能改，检查 isReadonly computed 是否生效
围栏改名后提醒配置显示旧名	编辑围栏时同步失败	检查 syncFenceNameToAlerts 是否调用 / fence_id 是否匹配
⭐ 分配车辆弹窗筛选卡顿	el-select 关闭动画和列表重渲染同帧竞争	用 appliedFilter + 150ms 延迟
⭐ 全屏时新增按钮提示被遮挡	ElMessage z-index 低于全屏层 stacking context	改用 :disabled + el-tooltip 方案
⭐ 机构树车辆数不对	org_id 和 parent_id 类型不匹配（string vs number）	全部 String() 化比较
⭐ el-select 显示 org:9 而不是机构名	el-option 未设 :label	加 label / :label
⭐ 门户下拉没有"最近进入"	未记录 localStorage	调 saveRecentCustomer，key = portal_recent_customers
⭐ 车辆管理页能上下滚动	高度用了 100vh 而不是 calc(100vh - 101px)	改用 calc(100vh - 101px) + overflow: hidden
⭐ 分页默认 10 条	pageSize 初始值	改成 20，:page-sizes="[20, 50, 100]"
小程序端常见问题（第五版新增）
现象	原因	修法
app.json 未找到	微信开发者工具导入了源码根目录	导入 dist/dev/mp-weixin
NPM packages not found	开了 packNpmManually 但路径不对	project.config.json 里删掉 packNpmManually
uni-h5.cjs.js parse failed	微信开发者工具解析了 node_modules 的 H5 代码	同上，不要用「构建 npm」
-601034 没有权限	小程序和 CloudBase 环境未关联	微信云开发开通 + 关联腾讯云环境
cloud.callFunction is required	App.vue 未初始化 wx.cloud	onLaunch 里加 wx.cloud.init
Invalid schema: <envId>	@cloudbase/node-sdk 的 rdb() bug	改用 axios 调 HTTP API
Credentials missing	HTTP API 请求缺认证	加 Authorization: Bearer <access_token>
INVALID_ARGUMENT / 请在请求头添加设备id	匿名登录 API 缺 x-device-id	加 x-device-id 请求头（随机 UUID）
FetchError: undefined	微信拦截了未白名单的域名请求	小程序后台配 request 合法域名
登录按钮点击无反应	cloudbaseApp 未挂载 / App.vue 未执行	Console 看 App onLaunch 开始执行 是否打印
Invalid value "undefined" for header "Accept-Profile"	PostgREST 请求缺 schema 头	加 Accept-Profile: public + Content-Profile: public
体验版不自动更新	微信版本管理机制	每次上传后重新「设为体验版」+ 重新扫码
二十一、🚀 部署流程
Web 端
bash
cd /Users/lyn/my-cd
npm run dev    # 本地
git add .
git commit -m "feat: xxx"
git push origin main
# CloudBase 自动构建 + 发布，1-2 分钟
⚠️ 改完登录相关文件后必须退出重登
⚠️ 新建云函数后必须配 HTTP 网关 + 环境变量 + 公网访问

小程序端
bash
cd /Users/lyn/my-cd-miniprogram
npm run dev:mp-weixin    # 本地实时编译到 dist/dev/mp-weixin
# VSCode 另一个窗口打开微信开发者工具，导入 dist/dev/mp-weixin
# 改代码 → Vite 自动编译 → 微信开发者工具点「编译」刷新

# 保存进度
git add .
git commit -m "feat: xxx"
git push origin main
⚠️ 小程序端 Git 提交不触发自动部署，需要手动在微信开发者工具里「上传」
⚠️ 上传后去微信公众平台「版本管理」→「设为体验版」→ 生成二维码 → 加体验成员
⚠️ 体验版无需官方审核，改完代码要重新上传 + 重新生成二维码

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
逆地理编码并发	3
前端缓存 TTL	5 分钟
前端 fetch 超时	8000ms
超速段合并间隔	5 分钟
路线方案配色池	#2563EB / #8B5CF6 / #EC4899 / #06B6D4 / #F97316 / #6366F1 / #14B8A6 / #A855F7
门户最近进入客户	最多 3 条，key = portal_recent_customers
分配车辆筛选延迟	150ms（appliedFilter）
管理端页面高度	calc(100vh - 101px)
AdminVehicle 分页	默认 20，选项 [20, 50, 100]
小程序 AppID	wx88a7b64684f68cef
小程序编译产物目录	/Users/lyn/my-cd-miniprogram/dist/dev/mp-weixin
小程序服务类目	工具 → 实用工具 → 办公效率
微信云开发版本	个人版（19.9 元/月）
二十三、📁 关键文件
Web 端
文件	说明
src/utils/supabase.js	CloudBase 初始化
src/router/index.js	路由表
src/views/Dashboard.vue	⭐ 客户端所有页面的壳
src/views/LoginView.vue	登录页（三层角色 + 机构注入）
src/views/PortalSelect.vue	管理员门户（⭐ 最近进入分组）
src/views/ClientHome.vue	客户端首页
src/views/FullMap.vue	全图监控
src/views/UserManage.vue	用户管理（⭐ 组织机构树显示车辆数）
src/views/RoleManage.vue	角色管理
src/views/OrgManage.vue	组织管理（⭐ 双栏看板分配车辆）
src/views/admin/AdminLayout.vue	管理端壳
src/views/admin/AdminDashboard.vue	数据总览
src/views/admin/AdminCustomer.vue	客户管理（含 org 同步 + ⭐ 组织机构树显示车辆数）
src/views/admin/AdminVehicle.vue	车辆管理（⭐ 卡片式布局 + 4 图标按钮）
src/views/admin/AdminAccounts.vue	管理员账号（含 _noUser 脏数据校验）
src/views/Waybill.vue	运单管理（含 assigned_orgs 隔离）
src/views/WaybillCreate.vue	新建运单（写 assigned_orgs）
src/views/waybill-detail.vue	运单详情（含 assigned_orgs 隔离）
src/views/VehicleArchive.vue	车辆档案（含禁止清空 org）
src/views/DriverArchive.vue	司机档案
src/views/EleFenceSetting.vue	围栏设置
src/views/EleFenceAlertSetting.vue	提醒设置（二级子账号只读）
src/views/EleFenceAlertQuery.vue	提醒事件查询
src/views/RouteManage.vue	路线管理
src/components/RouteFormDialog.vue	路线表单弹窗
src/components/AddEleFenceDialog.vue	新增/编辑围栏（含改名同步）
src/components/OverspeedDetailDialog.vue	超速详情弹窗
src/components/StayDetailDialog.vue	停留详情弹窗
src/components/SidebarMenu.vue	侧边栏菜单
src/components/PersonalSettings.vue	个人设置
src/components/FunctionPermissionDialog.vue	权限配置弹窗
src/views/Report.vue	⚠️ 占位文件，未开发
小程序端（第五版新增）
文件	说明
src/App.vue	⭐ 全局 wx.cloud.init
src/pages.json	⭐ 页面路由（login / waybill/list / waybill/detail）
src/manifest.json	⭐ AppID 配置（mp-weixin 节点）
src/pages/login/login.vue	⭐ 登录页（调 login-by-account）
src/pages/waybill/list.vue	运单列表（待开发）
src/pages/waybill/detail.vue	运单详情（待开发）
src/utils/cloudbase.js	CloudBase SDK 初始化（当前未用，保留）
dist/dev/mp-weixin/	⭐ 编译产物，微信开发者工具导入此目录
project.config.json	⚠️ 不要开 packNpmManually
二十四、🎯 下次推荐方向
【专项待办 1-9】+ 本轮 UI 重构 已全部清零。第五版新增小程序端，当前处于「联调阶段」。

优先级排序（Web 端遗留）
【原始 5】老旧 admins 表清理（SQL 一把梭，快）

【原始 7】删除本地备份视频（rm 一行，快）

【原始 3】逆地理编码降级（云函数加几行，稳健性）

【原始 4】权限配置弹窗真实对接（功能补全）

【原始 6】全图监控「实时跟踪」「轨迹回放」按钮（功能补全）

【原始 9】路线管理：地址 → 坐标映射

【原始 1】RLS 策略收紧（上线前必做）

【原始 2】云函数预置并发（用户量上来再做）

【原始 10】方案对比地图视图

【原始 8】微信小程序（进行中，见下）

小程序端下一步（最优先）
【小程序 1】修复匿名登录 400：给 /auth/v1/signin/anonymously 请求头加 x-device-id（随机 UUID）

【小程序 2】云函数查 PostgreSQL：用 axios 调 /v1/rdb/rest/users?... + Accept-Profile: public

【小程序 3】配置 request 合法域名：微信公众平台加 https://wuxian-token-d0guymjkpadcd1f22.api.tcloudbasegateway.com

【小程序 4】登录联调：输入 15035660010 / 123456!，期望返回真实 user 对象（含 orgId / orgLevel / orgName）

【小程序 5】运单列表页：复用 needOrgFilter 逻辑 + 卡片式列表

【小程序 6】运单详情页：接单 / 上报 / 完成

【小程序 7】实时推送：watch() 监听 waybills 集合

最后更新：2026-10-16（第五版 · 新增微信小程序端）

状态：
✅ Web 端：数据层改造 + 机构隔离 + 管理端 5 文件 + 个人设置 + 专项待办 1-9 + UI 重构全部完成
✅ 小程序端：环境搭建 + 登录页 UI + 云函数调用链路 + 微信云开发开通 + 关联腾讯云环境全部完成
⏳ 小程序端：卡在云函数查 PostgreSQL（@cloudbase/node-sdk 的 Invalid schema bug，改用 axios HTTP API 后缺 x-device-id 头）
⏳ Web 端：剩余 10 项原始待办

🎯 下次推荐：继续修小程序云函数 —— 第一步给匿名登录 API 加 x-device-id 请求头，然后跑通 users 表查询