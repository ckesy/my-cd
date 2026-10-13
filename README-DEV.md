# 东风车队管理系统 - 开发交接文档

> 新对话开场白：把本文件完整粘贴给 AI，并说明「接着做 XXX」即可无缝续接。

---

## 一、项目概况

| 项 | 值 |
|---|---|
| 项目名称 | 东风车队管理系统 |
| 技术栈 | Vue 3 + Vite + Element Plus + 高德地图 JS API |
| 代码仓库 | https://github.com/ckesy/my-cd |
| 线上地址 | https://wuxian-token-d0guymjkpadcd1f22-1447716425.tcloudbaseapp.com/ |
| 本地路径 | /Users/lyn/my-cd |
| 启动命令 | cd /Users/lyn/my-cd && npm run dev |
| 部署方式 | Git 自动部署（push 到 main 分支 → CloudBase 自动构建 + 发布） |

---

## 二、后端与云服务

- 平台：腾讯云 CloudBase（个人版）
- 环境 ID：`wuxian-token-d0guymjkpadcd1f22`
- 数据库：CloudBase PostgreSQL
- 身份认证：CloudBase 匿名登录（signInAnonymously）
- SDK：`@cloudbase/js-sdk`（在 `src/utils/supabase.js` 中初始化）
- 安全域名：`wuxian-token-d0guymjkpadcd1f22-1447716425.tcloudbaseapp.com`
- SPA 路由配置：错误码 404 → 替换为 /index.html

### HTTP 网关基础 URL
https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com

text

---

## 三、🔑 所有 Key / Token / 凭证速查表

### 高德相关
| 名称 | 值 | 用途 |
|---|---|---|
| 高德地图 JS API Key | `273f5c474604b71906674aac159b8f45` | 前端地图展示（JS SDK） |
| 高德 Web 服务 Key | `491d5475803e65c06ba6169bdaf3e1f3` | 云函数调用猎鹰服务 |
| 高德猎鹰 SID | `1078871` | 电子围栏服务实例 ID |
| 数字签名 | **必须关闭** | 云函数不做签名 |
| 猎鹰服务 API | **必须在控制台勾选** | 否则返回 20003 |

### 东风相关
| 名称 | 值 | 用途 |
|---|---|---|
| 东风 Token | `c40c7311ff604a598b9fb791a63e9deb` | 车辆位置接口鉴权 |

### CloudBase 相关
| 名称 | 值 |
|---|---|
| 环境 ID | `wuxian-token-d0guymjkpadcd1f22` |
| HTTP 网关基础 URL | `https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com` |

### 旧 Supabase（已弃用）
- 项目 ID：`sfwwbcrpouelrjavecfj`
- 已迁移，本地旧 `.env` 已删除

---

## 四、☁️ 云函数清单

所有云函数都是**普通云函数（事件函数）**，运行环境 **Node.js 18.15**，`package.json` 内容为 `{}`。每个云函数都必须**开启公网访问**。

### 4.1 云函数一览

| 云函数名 | 作用 | HTTP 网关路径 | 环境变量 |
|---|---|---|---|
| `amap-geofence` | 新建围栏 | `/amap-geofence` | AMAP_WEB_KEY、AMAP_SID |
| `amap-geofence-update` | 更新围栏 | `/amap-geofence-update` | 同上 |
| `amap-geofence-delete` | 删除围栏 | `/amap-geofence-delete` | 同上 |
| `amap-geofence-list` | 查询围栏列表 | `/amap-geofence-list` | 同上 |
| `dongfeng-lostlocation` | 东风车辆位置数据中转 | `/dongfeng-lostlocation` | DONGFENG_TOKEN |

### 4.2 环境变量值
AMAP_WEB_KEY = 491d5475803e65c06ba6169bdaf3e1f3
AMAP_SID = 1078871
DONGFENG_TOKEN = c40c7311ff604a598b9fb791a63e9deb

text

### 4.3 前端调用方式（统一 fetch）
```javascript
const API_BASE = 'https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com'
await fetch(`${API_BASE}/amap-geofence-delete`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ gfids: row.gfid }),
})
⚠️ 不要用 app.callFunction（SDK 调用），匿名用户会报 EXCEED_AUTHORITY。一律用 HTTP 网关 + fetch。

4.4 HTTP 网关配置要点
资源类型：云函数

触发路径：见上表（以 / 开头）

跨域：必须开启

身份认证：关闭

五、🌐 高德接口详情
5.1 猎鹰服务 - 围栏接口（云函数中转）
基础 URL：https://tsapi.amap.com/v1/track/geofence/
方法：POST（表单格式 application/x-www-form-urlencoded）

操作	完整路径	关键参数
创建圆形	/add/circle	key, sid, name, center="lng,lat", radius
创建多边形	/add/polygon	key, sid, name, points="lng,lat;lng,lat;..."
创建线形	/add/polyline	key, sid, name, points, bufferradius
创建行政区划	/add/district	key, sid, name, adcode
更新圆形	/update/circle	key, sid, gfid, name, center, radius
更新多边形	/update/polygon	key, sid, gfid, name, points
更新线形	/update/polyline	key, sid, gfid, name, points, bufferradius
更新行政区划	/update/district	key, sid, gfid, name, adcode
删除围栏	/delete	key, sid, gfids（多个用逗号分隔）
查询列表	/list	key, sid（GET 方法）
查询列表响应示例：

json
{
  "errcode": 10000,
  "errmsg": "OK",
  "data": {
    "count": 2,
    "results": [
      { "gfid": 1592615, "name": "测试圆形", "desc": "...", "createtime": 1791371079119, "modifytime": 1791371079119 }
    ]
  }
}
常见错误码：

errcode	含义	处理
10000	成功	-
20001	参数错误	检查必填参数
20002	请求协议非法	检查 GET/POST
20003	未知错误（假错误）	前端把 20003 也算作成功
10001	Key 无效	检查 Key 与 SID 匹配
20800	参数非法	检查名称特殊字符
5.2 高德地图 JS API（前端使用）
加载方式：

javascript
import AMapLoader from '@amap/amap-jsapi-loader'
const AMap = await AMapLoader.load({
  key: '273f5c474604b71906674aac159b8f45',
  version: '2.0',
  plugins: ['AMap.Geocoder', 'AMap.TileLayer.Satellite', 'AMap.TileLayer.RoadNet', ...]
})
地图主题样式 ID：

主题名	样式 ID
草色青	amap://styles/fresh
远山黛	amap://styles/whitesmoke
月光银	amap://styles/light
雅士灰	amap://styles/grey
靛青蓝	amap://styles/blue
暗黑	amap://styles/dark
六、🚚 东风接口详情
车辆位置数据接口
URL：https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/dataforward/forward/locationData

方法：GET

入参：

参数	类型	说明
token	string	c40c7311ff604a598b9fb791a63e9deb
chassisNo	string	VIN 后 8 位（代码里 vin.slice(-8)）
startTime	string	格式 YYYY-MM-DD HH:mm:ss
endTime	string	格式 YYYY-MM-DD HH:mm:ss
时间范围：当天 00:00:00 ~ 23:59:59（中国时区）

云函数内部循环 3 天（当天、昨天、前天），命中即返回

返回额外字段 dayOffset：0=今天、1=昨天、2=前天、-1=3 天无数据

响应示例：

json
{
  "code": 1,
  "msg": "ok",
  "source": "DF",
  "data": [
    {
      "plateNo": "辽AW8510",
      "chassisNo": "L9002833",
      "time": "2020-03-05 20:00:00",
      "lng": 123.123456,
      "lat": 45.123456,
      "direction": 56,
      "speed": 91,
      "status": "行驶",
      "altitude": 50,
      "accStatus": "ACC 关,定位"
    }
  ]
}
字段映射（前端使用）：

前端字段	来源
direction（方向）	latest.direction
speed（速度 km/h）	latest.speed
altitude（海拔 m）	latest.altitude
accStatus	latest.accStatus（含"开"/"关"）
七、📊 数据表结构（public schema）
表名	说明	关键字段
admins	管理员账号	id, phone, password, name, role, status
customers	客户	id, name, phone, password, province, city, contact_person, platforms, permissions
vehicles	车辆	id, plate, vin, customer_id, org, fuel_type, vehicle_type, device_id 等
drivers	司机档案	id, driver_name, phone, org, bound_vehicle
waybills	运单	id, waybill_no, status, create_time
ele_fences	电子围栏	id, name, org, shape, gfid, center, points, radius, bufferradius, adcode, location, updated_at
ele_fence_alerts	围栏告警	id, alert_type
ele_fence_events	围栏事件	id, plate, org, start_time, alert_type
RLS 状态：目前所有策略均为 USING (true)（开发用，上线前必须收紧）。

八、📁 前端页面结构
入口与框架
src/views/LoginView.vue — 登录页（管理员/客户）

src/views/PortalSelect.vue — 管理员登录后的入口选择页

src/views/Dashboard.vue — 客户端主框架

src/views/admin/AdminLayout.vue — 管理端主框架

管理端页面（src/views/admin/）
AdminDashboard.vue — 数据总览

AdminCustomer.vue — 客户管理

AdminVehicle.vue — 车辆管理

AdminAccounts.vue — 管理员账号管理

客户端页面
src/views/ClientHome.vue — 客户端首页

src/views/FullMap.vue — 全图监控（功能最多）

src/views/Waybill.vue、WaybillCreate.vue、Report.vue

电子围栏列表页（含 handleDelete，已用 HTTP 网关）

公共组件
src/components/SidebarMenu.vue — 客户端侧边栏

src/components/PersonalSettings.vue — 个人设置

src/components/AddEleFenceDialog.vue — 新增/编辑围栏

关键工具
src/utils/supabase.js — 初始化 CloudBase SDK，导出 supabase 和 auth

src/router/index.js — 路由

vite.config.js — 开发代理（仅开发环境有效）

九、🗺️ 全图监控（FullMap.vue）功能清单
1. 顶部栏（三块布局）
左侧：统计胶囊（全部/行驶/静止/离线）+ 刷新定位按钮

右侧：地图控制胶囊

主题下拉（6 种主题）

卫星按钮（独立叠加卫星图层）

路网按钮（独立叠加路网图层）

测距按钮（开启后高亮）

2. 左侧车辆列表（可折叠 + 可拖拽调宽）
3. 车辆箭头 icon
SVG 箭头，无白边框，颜色随主题自适应

三种状态：行驶（绿）/ 静止（橙）/ 离线（灰）

按 direction 字段旋转

hover 有平滑缩放 + 阴影

4. 车辆卡片（点击箭头弹出）
VIN、当前速度、海拔高度、所属机构、司机、燃料类型、行驶方向、ACC 状态、上报时间、当前位置

昨天的数据会有黄标签提示

5. 三态判断逻辑
javascript
const speed = parseFloat(latest.speed) || 0
const accOn = isAccOn(latest.accStatus)  // 含"开"为true，"关"为false
let status = '离线'
if (accOn) status = speed > 0 ? '行驶' : '静止'
6. 缓存机制
sessionStorage 缓存，TTL = 3 分钟

再次进入页面：3 分钟内直接读缓存，秒开

点「刷新定位」：强制跳过缓存

7. 并发数
CONCURRENCY = 5

8. 自定义测距工具（已替代高德 RangingTool）
点击测距按钮 → 开启测距，按钮高亮

点击地图 → 加点，节点用不同颜色标记：起（绿）/ 1、2、3...（蓝）/ 终（红）

每段显示距离 + 线条有流光动画（SVG 覆盖层）

鼠标跟随：未确定新点时有虚线跟随鼠标 + 实时距离预览

点右键 → 结束当前线段，显示该段总距离标签（橙色 ∑），可继续在同一地图开始新段

再点测距按钮 → 关闭测距 + 清除所有测距标记

不重建地图

十、✅ 已完成事项
☑ 从 Supabase 迁移数据到 CloudBase PostgreSQL
☑ 前端 SDK 从 Supabase 切换到 CloudBase
☑ 匿名登录打通，数据读写正常
☑ CloudBase 静态托管 + Git 自动部署
☑ SPA 路由 404 重定向
☑ Web 安全域名配置
☑ 登录页视频压缩（HEVC → H.264，21MB → 5.2MB）
☑ 管理员/客户端登录、权限区分、欢迎/退出动画
☑ 管理端客户管理、车辆管理、数据总览、管理员账号
☑ 客户端首页、全图监控
☑ 个人设置（改昵称、改密码）
☑ 电子围栏增删改查（云函数 + HTTP 网关打通）
☑ 高德假错误处理：errcode === 20003 也算成功
☑ 全图监控东风定位接口：云函数 dongfeng-lostlocation 中转
☑ 全图监控 UI 大改版：箭头 icon + 主题/卫星/路网切换 + 自定义测距
☑ 自定义测距工具：起点/途径点/终点、每段距离、流光动画、总和标签、鼠标跟随预览
十一、⏳ 待办事项
□ RLS 策略收紧：为 vehicles、customers 等表编写更严格的策略
□ 云函数内存/超时优化：目前 256MB / 30s
□ 预置并发：车多时可购买避免冷启动
□ 微信小程序（如需）：注册、认证、备案、配置合法域名
□ 删除本地备份视频 login-bg-original.mp4
□ 全图监控「实时跟踪」「轨迹回放」按钮目前是占位（点了弹「开发中」）
十二、🔧 常见问题排查
1. 云函数报 EXCEED_AUTHORITY
原因：用 SDK app.callFunction 调用云函数，匿名用户没权限

解决：改用 HTTP 网关 + fetch

2. 高德报 20003 UNKNOWN_ERROR
原因：高德"假错误"，实际已成功

解决：前端把 20003 也算作成功

3. 高德报 INVALID_USER_KEY (10001)
原因：Key 和 SID 不匹配，或猎鹰服务 API 没勾选，或数字签名没关闭

解决：去高德控制台逐项检查

4. 云函数日志为 "No invocation logs"
原因：CloudBase 平台侧临时故障 / 日志索引未开启

解决：稍等重试；或去云函数代码页重新保存部署

5. 前端调用 /api-dongfeng 生产环境 404
原因：vite 代理仅开发环境有效

解决：已改用云函数 dongfeng-lostlocation 中转

6. 测距线条清不掉
原因：高德 RangingTool 内部绘制私有画布层，clearMap() 清不掉

解决：已改为完全自定义测距，不再用 RangingTool

7. 云开发资源点消耗快
原因：高频调试、频繁重建云函数、并发过高

解决：降低 CONCURRENCY（建议 5）、拉长缓存 TTL、减少重建次数

8. 车辆位置全部获取失败
检查项：

云函数 dongfeng-lostlocation 公网访问是否开启
DONGFENG_TOKEN 环境变量是否配置
vin 是否为空或长度不足
云函数日志里 [东风位置] 返回: 的输出
十三、🚀 部署与开发流程
bash
# 本地开发
cd /Users/lyn/my-cd
npm run dev

# 上线
git add .
git commit -m "feat: xxx"
git push origin main
# CloudBase 会自动构建并发布，约 1-2 分钟
十四、📌 关键常量速查
名称	值
CloudBase 环境 ID	wuxian-token-d0guymjkpadcd1f22
HTTP 网关基础 URL	https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com
高德地图 JS Key	273f5c474604b71906674aac159b8f45
高德 Web 服务 Key	491d5475803e65c06ba6169bdaf3e1f3
高德猎鹰 SID	1078871
东风 token	c40c7311ff604a598b9fb791a63e9deb
前端并发数	CONCURRENCY = 5
前端缓存 TTL	3 * 60 * 1000（3 分钟）
高德猎鹰基础 URL	https://tsapi.amap.com/v1/track/geofence
东风位置接口	https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/dataforward/forward/locationData
最后更新：2026-10-13
状态：全图监控主要功能已完成，电子围栏云函数链路已打通，可正常运行。