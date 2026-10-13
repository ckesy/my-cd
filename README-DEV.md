下面是完整的、最新的 README.dev.md。全选复制，覆盖保存到项目根目录即可。

markdown
# 东风车队管理系统 - 开发交接文档

> 新对话开场白：把本文件完整粘贴给 AI，并说明「接着做 XXX」即可无缝续接。
> 最后更新：2026-10-14

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
| 部署方式 | Git 自动部署（push main → CloudBase 自动构建 + 发布） |

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
常见错误码：

errcode	含义	处理
10000	成功	-
20001	参数错误	检查必填参数
20002	请求协议非法	检查 GET/POST
20003	未知错误（假错误）	前端把 20003 也算作成功
10001	Key 无效	检查 Key 与 SID 匹配
20800	参数非法	检查名称特殊字符
5.2 高德地图 JS API（前端使用）
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
URL：https://dfcvyl.dfcv.com.cn/api/admin/openapi/api/dataforward/forward/locationData

方法：GET

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
  "code": 1, "msg": "ok", "source": "DF",
  "data": [{
    "plateNo": "辽AW8510", "chassisNo": "L9002833",
    "time": "2020-03-05 20:00:00",
    "lng": 123.123456, "lat": 45.123456,
    "direction": 56, "speed": 91, "status": "行驶",
    "altitude": 50, "accStatus": "ACC 关,定位"
  }]
}
七、📊 数据表结构（public schema）
7.1 已建表
表名	说明	关键字段
admins	管理员账号（旧）	id, phone, password, name, role, status
customers	客户	id, name, phone, password, province, city, contact_person, platforms, permissions
vehicles	车辆	id, plate, vin, customer_id, org, fuel_type, vehicle_type, device_id, driver 等
drivers	司机档案	id, driver_name, phone, org, bound_vehicle, gender, age, license_type, operator
waybills	运单	id, waybill_no, status, create_time
ele_fences	电子围栏	id, name, org, shape, gfid, center, points, radius, bufferradius, adcode, location, updated_at
ele_fence_alerts	围栏告警	id, alert_type
ele_fence_events	围栏事件	id, plate, org, start_time, alert_type
7.2 系统管理表
表名	说明	关键字段
users	统一用户表	id, account, name, phone, email, password, org_id, role_id, status, owner_account, remark, created_at, updated_at
roles	角色表	id, name, code(NOT NULL UNIQUE), description, permissions(JSONB), status, created_at, updated_at
organizations	组织表	id, name, code, parent_id, owner_account, leader, phone, description, status, created_at, updated_at
fleets	车队表	id, name, code, org_id, leader, phone, description, status, created_at, updated_at
user_permissions	用户权限关联	id, user_id, resource_type, resource_id, status, created_at, updated_at
完整建表 SQL 见 db_schema_backup.sql

当前 users 表管理员数据：

id=1, account=15035660677, name=管理员, role_id=?, status=1（role_id 需按 roles 表实际值填）

⚠️ 表级权限（GRANT）： 新建的表必须 GRANT 给 anon 角色，否则报 permission denied for table。

sql
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.roles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organizations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fleets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_permissions TO anon;
-- 一次性全部表：
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
⚠️ 注意： RLS（行级安全）和 GRANT（表级权限）是两回事！RLS 关闭不代表 GRANT 了。

八、📁 前端页面结构
入口与框架
src/views/LoginView.vue — 登录页（从 users 表读取）

src/views/PortalSelect.vue — 管理员登录后的入口选择页

src/views/Dashboard.vue — 客户端主框架

src/views/admin/AdminLayout.vue — 管理端主框架

管理端页面（src/views/admin/）
AdminDashboard.vue — 数据总览

AdminCustomer.vue — 客户管理（含列表视图 + 组织机构可视化）

AdminVehicle.vue — 车辆管理

AdminAccounts.vue — 管理员账号管理

RoleManage.vue — 角色管理（✅ 已完成，含功能配置弹窗）

OrgManage.vue — 组织管理（✅ 已完成，含组织架构树 + 分配车辆）

UserManage.vue — 用户管理（✅ 已完成，列表视图 + 组织机构视图）

客户端页面
ClientHome.vue — 客户端首页

FullMap.vue — 全图监控

Waybill.vue、WaybillCreate.vue、Report.vue

ClientVehicleArchive.vue — 车辆档案（✅ 已重写，客户只显示自己车辆）

ClientDriverArchive.vue — 司机档案（✅ 已重写，风格与车辆档案统一）

公共组件
src/components/SidebarMenu.vue — 客户端侧边栏（权限控制）

src/components/PersonalSettings.vue — 个人设置

src/components/AddEleFenceDialog.vue — 新增/编辑围栏

关键工具
src/utils/supabase.js — 初始化 CloudBase SDK，导出 supabase、auth、ensureAnonymousLogin

src/router/index.js — 路由

vite.config.js — 开发代理（仅开发环境有效）

九、🎨 全系统 UI 统一规范
所有管理页面（UserManage / RoleManage / OrgManage / ClientVehicleArchive / ClientDriverArchive）统一遵循以下规范：

9.1 页面结构
text
[搜索卡片]  ← 白色圆角卡片 + 阴影
[表格卡片]  ← 白色圆角卡片 + 工具栏 + 表格 + 分页
   ├─ 工具栏左：共 X 条
   └─ 工具栏右：[业务按钮] + [刷新] [密度] [列设置] [全屏]  ← 4 个图标按钮
9.2 品牌色
用途	色值
主色（红）	#c8102e
主色渐变	linear-gradient(135deg, #c8102e, #a00d24)
主色深	#7F1D1D
淡红背景	#FEF2F2
边框	#E2E8F0
悬浮背景	#FEF2F2
9.3 表格规范
表头：#F8FAFC 背景，#0F172A 深色，字重 700，字号 12.5px

单元格：字号 12.5px，字重 500，颜色 #1E293B

行 hover：#FEF2F2 淡红背景

行 padding：默认 9px、宽松 13px、紧凑 5px

分页：红色高亮，hover 缩放 1.08

9.4 4 个图标按钮（刷新 / 密度 / 列设置 / 全屏）
尺寸：32x32px，圆角 6px

默认：白底 + 灰边 + 灰字

hover：红边 + 红字 + 淡红底 + 上浮 1px

active：红底渐变 + 白字

9.5 密度设置（重要）
统一用 sessionStorage 持久化，key 加用户区分后缀：

javascript
const DENSITY_KEY = 'xxx_density' + (isCustomer ? `_cust_${myAccount}` : '_admin')
const tableSize = ref(sessionStorage.getItem(DENSITY_KEY) || 'default')
const handleDensityChange = (cmd) => {
  tableSize.value = cmd
  sessionStorage.setItem(DENSITY_KEY, cmd)
}
操作	效果
切换选项卡/菜单	保持
切换浏览器标签	保持
F5 刷新页面	恢复默认
关闭浏览器	sessionStorage 清空
各页面对应的 key：

user_manage_density_xxx

role_manage_density

org_manage_density_xxx

vehicle_archive_density_xxx

driver_archive_density_xxx

9.6 加载动画
蒙层：rgba(255,255,255,0.88) + 3px 背景模糊

弧线：品牌红 #c8102e，呼吸节奏（loading-dash）

文字："加载中…" 呼吸脉冲（loading-text-pulse）

表格行：rowFadeIn 轻微上移淡入

9.7 页面固定高度
所有管理页面都用：

css
.xxx-page {
  height: 100vh;
  max-height: 100vh;
  overflow: hidden;
  box-sizing: border-box;
}
html, body { height: 100%; overflow: hidden; }
只有表格内部和左侧树能滚动，整页不上下拖动。

9.8 操作列按钮
统一用无边框文字按钮 + 图标：

css
.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 24px;
  padding: 0 4px;
  font-size: 12.5px;
  font-weight: 600;
  color: #c8102e;  /* 品牌红 */
}
.action-btn:hover { color: #7F1D1D; background: #FEF2F2; }
编辑：红色

查看：蓝色 #0EA5E9

删除：红色 #c8102e

十、🗺️ 全图监控（FullMap.vue）功能清单
顶部栏（三块布局）

左侧：统计胶囊（全部/行驶/静止/离线）+ 刷新定位按钮

右侧：地图控制胶囊（主题下拉 / 卫星 / 路网 / 测距）

左侧车辆列表（可折叠 + 可拖拽调宽）

折叠时高度 56px

按状态优先级排序：行驶 > 静止 > 离线 > 无数据

车辆箭头 icon

SVG 箭头，颜色随状态：行驶（绿）/ 静止（橙）/ 离线（灰）

按 direction 字段旋转

车辆卡片（点击箭头弹出）

VIN、速度、海拔、机构、司机、燃料、方向、ACC、上报时间、位置

三态判断

javascript
const speed = parseFloat(latest.speed) || 0
const accOn = isAccOn(latest.accStatus)  // 含"开"为true
let status = '离线'
if (accOn) status = speed > 0 ? '行驶' : '静止'
缓存：sessionStorage，TTL = 3 分钟，刷新定位强制跳过缓存

并发数：CONCURRENCY = 5

自定义测距工具（已替代高德 RangingTool）

起点（绿）/ 途径点（蓝）/ 终点（红）

每段距离 + 流光动画

鼠标跟随预览

右键结束当前段，显示 ∑ 总距离

再点测距按钮关闭 + 清除

十一、👥 用户管理（UserManage.vue）功能清单
视图切换
列表视图（默认）：搜索 + 表格

组织机构视图：树形展示，客户根节点=客户名，管理员根节点="全部组织"

搜索卡片
登录账号、用户姓名、角色、所属组织、状态、展开/收起

工具栏
新增用户（主按钮）

4 个图标按钮：刷新 / 密度 / 列设置 / 全屏

表格
列：登录账号、用户姓名、手机号、邮箱、所属组织、角色、所属客户、状态、创建时间、操作

操作：编辑 / 禁用·启用 / 更多（下拉：权限配置、重置密码）

所属客户列：系统创建（蓝标签）/ 客户名（黄标签）

新增/编辑弹窗
登录账号（必填）、用户姓名（必填）、手机号、邮箱

所属组织：el-tree-select，根节点为客户名称（可选）

角色（必填）、密码、备注

权限配置弹窗
三个 Tab：组织 / 车队 / 车辆

每个 Tab：搜索、启用/禁用、表格、分页、密度、列设置

十二、🔐 角色管理（RoleManage.vue）功能清单
列表
列：角色名称、备注、创建时间、更新时间、操作

操作：编辑 / 功能配置 / 删除（管理员角色不显示功能配置）

表头、行、字号与用户管理一致

新增/编辑
角色名称（必填，max 50）

备注（max 200，带字数统计）

新增时自动生成唯一 code（role_时间戳随机数）

编辑时若原 code 为空自动补上

功能配置弹窗（简洁版）
头部：标题 + 角色名

工具条：全选 checkbox + "已选 X / N"

7 个权限分组：

首页（1项）

行车管理（3项）

电子围栏管理（1项）

运营管理（1项）

运输管理（2项）

基础数据管理（2项）

系统管理（1项）

每个分组：标题栏 + 组内全选按钮

权限项：三列网格，勾选后文字变红加粗

保存到 roles.permissions（JSONB 数组）

兼容读取数组 / {client:[]} / NULL

十三、🏢 组织管理（OrgManage.vue）功能清单
左侧：组织架构树
根节点：客户名称（客户视角）/ "全部组织"（管理员视角）

每个节点后显示 X 辆 车辆数标签

有车：红底红字

0 辆：灰底灰字

根节点：紫底紫字（总数）

车辆数只统计当前账号名下的车辆（vehicles.customer_id 匹配）

搜索、点击选中、切页保持

右侧：组织列表
标题：「XX - 组织列表」/「全部组织 - 组织列表」

搜索栏：组织名称

工具栏：4 个图标按钮

表格列：组织名称、组织简称、车辆数、上级组织、备注、创建时间、操作

操作：编辑 / 分配车辆

新增/编辑组织弹窗
上级组织（新增时可选，客户名或已有组织）

组织名称（必填，max 50）

组织简称（max 30）

备注（max 200）

分配车辆弹窗
搜索：车牌 / VIN / 车型

全选 / 单选 / 多选

车辆列表：车牌 + VIN + 车型 + 归属标签

标签：绿="已属于本组织"，灰="属于 XXX"

客户视角只显示自己名下的车辆

保存逻辑：

勾选且 org !== 组织名 → vehicles.org = 组织名

原属于该组织但取消勾选 → vehicles.org = null

保存后自动刷新组织树和表格

十四、🚗 车辆档案（客户端）功能清单
数据隔离（重要）
客户视角只显示自己名下的车辆：

登录时 currentUser.role === 'customer' + currentUser.phone

用 customers.phone = currentUser.phone 查出 customers.id

查询车辆时加 .eq('customer_id', myCustomerId.value)

导入车辆时自动写入 customer_id

导出时只导自己车辆

页面结构
搜索卡片：所属机构 / 燃料类型 / 车牌号 / VIN码 + 搜索 + 重置

表格卡片：工具栏 + 表格 + 分页

工具栏
共 X 条

批量删除（仅管理员）、导入、导出

4 个图标按钮

表格
车牌号列 minWidth: 130，左对齐，不加粗，12.5px

VIN、时间用等宽字体，12px

密度切换 12.5px 表头/正文

导入/导出图标
导入用 <Download />（向下箭头）

导出用 <Upload />（向上箭头）

编辑/详情弹窗
分组表单：基本信息 / 车辆参数 / 日期信息 / 时间信息

车牌号：顶部红色胶囊标签

详情：网格布局，一行两列

十五、🚙 司机档案（客户端）功能清单
页面结构
与车辆档案完全统一：

搜索卡片：所属机构 / 司机姓名 / 手机号 + 搜索 + 重置

表格卡片：工具栏 + 表格 + 分页

工具栏
共 X 条

新增、删除（批量）、导入、导出

4 个图标按钮

表格
司机姓名左对齐加粗 600，12.5px

手机号、时间等宽字体

绑定车辆列：无绑定显示灰色"未绑定"

操作列
绑定车辆（红）/ 查看（蓝）/ 编辑（红）

弹窗
详情弹窗：2 列网格

编辑/新增弹窗：分组表单（基本信息 / 绑定信息 / 时间信息）

车辆选择弹窗：模糊搜索 + 全选/取消全选 + 客户视角只显示自己车辆

同步函数
syncVehicleBoundDriver：根据 drivers.bound_vehicle 更新 vehicles.driver 字段

十六、🔑 登录逻辑（LoginView.vue）
查询用户
先按 account 精确查

没查到再按 phone 查，.limit(1) 取第一条

不要用 .or()（CloudBase 兼容层不稳定）

判断角色（三层兜底，重要）
javascript
const roleId = Number(userData.role_id) || 0
let isAdmin = false

// 第一层：查 roles 表
if (roleId > 0) {
  const { data: roleData } = await supabase
    .from('roles')
    .select('code, name, permissions')
    .eq('id', roleId)
    .maybeSingle()
  if (roleData) {
    const roleCode = String(roleData.code || '').toLowerCase().trim()
    const roleName = String(roleData.name || '')
    isAdmin = roleCode === 'admin' || roleName.includes('管理员')
  }
}

// 第二层：看 users.name
if (!isAdmin) {
  const userName = String(userData.name || '').toLowerCase()
  if (userName.includes('管理员') || userName.includes('admin')) isAdmin = true
}

// 第三层：旧约定 [1, 2]
if (!isAdmin && [1, 2].includes(roleId)) isAdmin = true
角色权限合并
javascript
const parseRolePerms = (p) => {
  if (Array.isArray(p)) return p
  if (p && typeof p === 'object' && Array.isArray(p.client)) return p.client
  return []
}
const rolePermissions = parseRolePerms(roleData?.permissions)
const userPermissions = parseRolePerms(userData.permissions)
const mergedPermissions = Array.from(new Set([...rolePermissions, ...userPermissions]))

const clientPerms = isAdmin ? [] : mergedPermissions
account.permissions = { client: clientPerms }
存储与跳转
javascript
localStorage.setItem('currentUser', JSON.stringify(account))
localStorage.setItem('originalUser', JSON.stringify(account))

if (isAdmin) router.push('/portal')  // 管理员 → 入口选择页
else router.push('/dashboard')       // 客户 → 客户端框架
十七、✅ 已完成事项
☑ 从 Supabase 迁移到 CloudBase PostgreSQL

☑ 前端 SDK 从 Supabase 切到 CloudBase

☑ 匿名登录打通

☑ CloudBase 静态托管 + Git 自动部署

☑ SPA 路由 404 重定向

☑ Web 安全域名配置

☑ 登录页视频压缩（21MB → 5.2MB）

☑ 管理员/客户端登录、权限区分、欢迎/退出动画

☑ 管理端客户管理、车辆管理、数据总览、管理员账号

☑ 客户端首页、全图监控

☑ 个人设置（改昵称、改密码）

☑ 电子围栏增删改查（4 云函数 + HTTP 网关）

☑ 高德假错误处理：errcode === 20003 也算成功

☑ 全图监控东风定位走云函数中转

☑ 全图监控 UI 大改版

☑ 自定义测距工具

☑ 数据库建表：users / roles / organizations / fleets / user_permissions

☑ 登录改造：从 users 表读取，三层角色判断兜底

☑ 用户管理页面：列表视图 + 组织机构视图，真实数据库读写

☑ 角色管理页面：完整 CRUD + 简洁版功能配置弹窗

☑ 组织管理页面：组织架构树 + 客户名作为根节点 + 分配车辆

☑ 组织管理车辆数：只统计当前账号下的车辆，与车辆档案一致

☑ 车辆档案（客户端）：只显示自己名下车辆，UI 重做

☑ 司机档案（客户端）：UI 重做，与车辆档案统一

☑ 全系统 UI 统一：卡片式布局 + 4 个图标按钮 + 品牌红主题

☑ 加载动画优化：品牌红弧线 + 呼吸文字 + 行淡入

☑ 密度持久化：sessionStorage，切换页面保持，刷新恢复默认

☑ 页面固定高度：所有管理页面 100vh 锁死，表格内滚动

☑ AdminCustomer 组织机构可视化：视图切换 + 树形展示

☑ 表格字体优化：12.5px 紧凑，车牌号左对齐不加粗

☑ 导入/导出箭头修正：导入 ↓，导出 ↑

十八、⏳ 待办事项
□ Dashboard.vue 挂载系统管理路由：给三个管理页面加路由分支 + pathLabels + routePermissionMap

□ SidebarMenu.vue 加子菜单：系统管理下加用户/角色/组织三个子项

□ RLS 策略收紧：为 vehicles、customers、users 等表编写更严格的策略

□ 云函数内存/超时优化：目前 256MB / 30s

□ 预置并发：车多时可购买避免冷启动

□ 微信小程序（如需）：注册、认证、备案、配置合法域名

□ 删除本地备份视频 login-bg-original.mp4

□ 全图监控「实时跟踪」「轨迹回放」按钮目前是占位

□ 司机档案数据隔离：drivers 表加 customer_id 字段并按客户过滤

十九、🔧 常见问题排查
1. 云函数报 EXCEED_AUTHORITY
原因：用 SDK app.callFunction 调用
解决：改用 HTTP 网关 + fetch

2. 高德报 20003 UNKNOWN_ERROR
原因：高德"假错误"
解决：前端把 20003 也算成功

3. 高德报 INVALID_USER_KEY (10001)
解决：检查 Key 和 SID 匹配、猎鹰 API 勾选、数字签名关闭

4. 云函数日志 "No invocation logs"
解决：稍等重试；或去云函数代码页重新保存部署

5. 前端调用 /api-dongfeng 生产环境 404
原因：vite 代理仅开发环境有效
解决：已改用云函数 dongfeng-lostlocation 中转

6. 测距线条清不掉
解决：已改为完全自定义测距

7. 登录报"账号或密码不正确"
原因 A：.or() 兼容问题 → 拆两次 .eq()

原因 B：phone 重复 → 用 .limit(1)

原因 C：密码字段值不匹配 → 检查明文

8. 车辆位置全部获取失败
检查项：

云函数 dongfeng-lostlocation 公网访问是否开启

DONGFENG_TOKEN 环境变量是否配置

vin 是否为空或长度不足

9. 其他电脑登录报 401
解决：用 signInAnonymously()（导出 ensureAnonymousLogin）

10. permission denied for table roles/organizations/users 等
原因：表级权限（GRANT）没给匿名用户，RLS 关闭不代表 GRANT 了
解决：CloudBase SQL 窗口执行：

sql
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
如果不知道角色名：SELECT rolname FROM pg_roles WHERE rolname NOT LIKE 'pg_%';

11. 保存角色报 null value in column "code"
原因：roles.code 是 NOT NULL
解决：新增时自动生成 role_时间戳随机数；编辑时若原 code 为空补上

12. 管理员登录后进 /dashboard 而不是 /portal
原因：role_id 是 NULL 或与 roles 表不匹配
解决：三层兜底判断 + 修数据：

sql
UPDATE users SET role_id = <管理员角色id> WHERE account = '15035660677';
13. 页面可以上下拖动
解决：

css
.xxx-page {
  height: 100vh;
  max-height: 100vh;
  overflow: hidden;
}
html, body { height: 100%; overflow: hidden; }
14. 密度切换后切页面变回默认
解决：用 sessionStorage 持久化，key 加用户区分后缀

15. 客户能看到别人的车辆
解决：查询加 .eq('customer_id', myCustomerId.value)，myCustomerId 通过 customers.phone = currentUser.phone 查得

二十、🚀 部署与开发流程
bash
# 本地开发
cd /Users/lyn/my-cd
npm run dev

# 上线
git add .
git commit -m "feat: xxx"
git push origin main
# CloudBase 会自动构建并发布，约 1-2 分钟
二十一、📌 关键常量速查
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
系统管理权限 key	system
二十二、📁 关键文件路径速查
文件	说明
src/utils/supabase.js	CloudBase 初始化 + ensureAnonymousLogin
src/views/LoginView.vue	登录页（三层角色判断 + 权限合并）
src/views/FullMap.vue	全图监控
src/views/UserManage.vue	用户管理（列表视图 + 组织视图）
src/views/admin/RoleManage.vue	角色管理（CRUD + 功能配置弹窗）
src/views/admin/OrgManage.vue	组织管理（组织树 + 分配车辆）
src/views/admin/AdminCustomer.vue	客户管理（列表 + 组织可视化）
src/views/ClientVehicleArchive.vue	车辆档案（客户端）
src/views/ClientDriverArchive.vue	司机档案（客户端）
src/views/Dashboard.vue	客户端主框架
src/components/SidebarMenu.vue	侧边栏菜单（权限控制）
README.dev.md	本文件
db_schema_backup.sql	建表 SQL 备份
二十三、🎯 下次对话推荐方向
按重要性排序：

把三个系统管理页面挂到路由（Dashboard.vue + SidebarMenu.vue）——让它们在页面里能点到

UserManage.vue 权限配置弹窗真实对接（目前是 UI，未接数据库）

司机档案数据隔离（drivers 表加 customer_id 字段）

RLS 策略收紧（上线前必做）

云函数性能优化（内存/超时/预置并发）

最后更新：2026-10-14
状态：系统管理三大页面（用户/角色/组织）全部完成，UI 与交互统一，客户视角数据隔离已实现。下一步是路由挂载。

text

---

## 📌 保存步骤

1. 打开 VS Code
2. 打开 `/Users/lyn/my-cd/README.dev.md`
3. **全选（Cmd+A）→ 粘贴上面内容 → 保存（Cmd+S）**

然后：

```bash
cd /Users/lyn/my-cd
git add README.dev.md db_schema_backup.sql
git commit -m "docs: 更新交接文档，同步系统管理模块与 UI 统一进度"
git push origin main
🎯 下次新对话开场白模板
text
这是我的项目交接文档，请先完整读一遍，然后接着做【XXX】：

（粘贴 README.dev.md 完整内容）
推荐下一步：路由挂载（Dashboard.vue 加系统管理分支 + SidebarMenu.vue 加子菜单）。

保存好再开新对话，我们无缝续上！💪