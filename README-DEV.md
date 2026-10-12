# 东风车队管理系统 - 开发交接文档

> 本文件用于记录项目关键信息，方便开发者或 AI 助手快速了解项目。
> 新对话时，请将本文件内容完整粘贴，即可无缝续接开发。

## 一、项目概况

- **项目名称**：东风车队管理系统
- **技术栈**：Vue 3 + Vite + Element Plus
- **代码仓库**：https://github.com/ckesy/my-cd
- **线上地址**：https://wuxian-token-d0guymjkpadcd1f22-1447716425.tcloudbaseapp.com/
- **部署方式**：Git 自动部署（push 到 main 分支后，CloudBase 自动构建 + 发布）

## 二、后端与云服务

- **云平台**：腾讯云 CloudBase（个人版）
- **环境 ID**：`wuxian-token-d0guymjkpadcd1f22`
- **数据库**：CloudBase PostgreSQL
- **身份认证**：CloudBase 匿名登录（`signInAnonymously`）
- **SDK**：`@cloudbase/js-sdk`（在 `src/utils/supabase.js` 中初始化）
- **安全域名**：`wuxian-token-d0guymjkpadcd1f22-1447716425.tcloudbaseapp.com`
- **SPA 路由配置**：错误码 `404` → 替换为 `/index.html`
- **CDN 流量**：个人版每月约 190GB（按资源点换算）
- **数据库连接串**：已迁移完成，不再需要 Supabase

### 旧 Supabase 信息（已弃用）
- 项目 ID：`sfwwbcrpouelrjavecfj`
- 已迁移到 CloudBase，本地仅保留旧 `.env` 备份（已删除）

## 三、数据表结构（public schema）

| 表名 | 说明 | 关键字段 |
|---|---|---|
| `admins` | 管理员账号 | id, phone, password, name, role, status |
| `customers` | 客户 | id, name, phone, password, province, city, contact_person, platforms, permissions |
| `vehicles` | 车辆 | id, plate, vin, customer_id, org, fuel_type, vehicle_type, device_id 等 |
| `drivers` | 司机档案 | id, driver_name, phone, org, bound_vehicle |
| `waybills` | 运单 | id, waybill_no, status, create_time |
| `ele_fences` | 电子围栏 | id, name, org, shape, gfid |
| `ele_fence_alerts` | 围栏告警 | id, alert_type |
| `ele_fence_events` | 围栏事件 | id, plate, org, start_time, alert_type |

**RLS 状态**：
- 目前所有策略均为 `USING (true)`（开发用，**上线前必须收紧**）
- `vehicles`、`drivers`、`waybills` 未启用 RLS

## 四、前端页面结构

### 入口与框架
- `src/views/LoginView.vue` — 登录页（管理员/客户）
- `src/views/PortalSelect.vue` — 管理员登录后的入口选择页
- `src/views/Dashboard.vue` — 客户端主框架（包含 ClientHome、FullMap 等）
- `src/views/admin/AdminLayout.vue` — 管理端主框架

### 管理端页面（`src/views/admin/`）
- `AdminDashboard.vue` — 数据总览
- `AdminCustomer.vue` — 客户管理
- `AdminVehicle.vue` — 车辆管理（含批量导入、批量分配客户）
- `AdminAccounts.vue` — 管理员账号管理

### 客户端页面
- `src/views/ClientHome.vue` — 客户端首页
- `src/views/FullMap.vue` — 全图监控（高德地图 + 东风定位接口）
- `src/views/Waybill.vue`、`WaybillCreate.vue`、`Report.vue` 等

### 公共组件
- `src/components/SidebarMenu.vue` — 客户端侧边栏菜单
- `src/components/PersonalSettings.vue` — 个人设置（改昵称、改密码）

### 关键工具文件
- `src/utils/supabase.js` — 初始化 CloudBase SDK，导出 `supabase`（即 `app.rdb()`）和 `auth`
- `src/router/index.js` — 路由配置
- `vite.config.js` — 代理配置（**仅开发环境有效**）

## 五、已完成事项 ✅

- [x] 从 Supabase 迁移数据到 CloudBase PostgreSQL（8 张表 + 数据）
- [x] 前端 SDK 从 Supabase 切换到 CloudBase
- [x] 匿名登录打通，数据读写正常
- [x] CloudBase 静态托管部署
- [x] Git 自动部署配置（push → 自动构建发布）
- [x] SPA 路由 404 重定向配置
- [x] Web 安全域名配置
- [x] 登录页视频压缩（HEVC → H.264，21MB → 5.2MB）
- [x] 管理员/客户端登录、权限区分、欢迎/退出动画
- [x] 管理端客户管理（增删改、停用/启用、批量导入车辆）
- [x] 管理端车辆管理（列表、批量分配客户、批量导入）
- [x] 管理端数据总览
- [x] 客户端首页、全图监控
- [x] 个人设置（改昵称、改密码）

## 六、待办事项 ⏳

- [ ] **全图监控的东风定位接口**：`vite.config.js` 中的 `/api-dongfeng` 代理仅开发环境有效，生产环境需要**云函数中转**（目前未处理）
- [ ] **RLS 策略收紧**：为 `vehicles`、`customers` 等表编写更严格的策略（如客户只能看自己的车）
- [ ] **微信小程序**（如需）：需要注册小程序、认证、备案、配置合法域名
- [ ] 清理本地迁移临时文件（已删除，备份在桌面）
- [ ] 删除本地备份视频 `login-bg-original.mp4`（确认线上无问题后）

## 七、部署与开发流程

### 本地开发
```bash
cd /Users/lyn/my-cd
npm run dev