# login-by-account 配置快照

> ⚠️ 以下为**参考值**，请以 CloudBase 控制台的实际配置为准。拿到线上配置后请更新本文件。

## 基本

| 项 | 值 |
| --- | --- |
| 函数名 | `login-by-account` |
| 运行时 | Node.js 18.15 |
| 超时时间 | 待核对（建议 20 秒） |
| 调用方式 | `wx.cloud.callFunction`（**不需要** HTTP 网关） |
| 环境变量 | 无 |

## 返回契约要点

`user` 对象必须与 Web 端 `account` 对齐：

```js
{ id, account, name, phone, roleId, orgId, orgName, orgLevel, isSubAccount, ownerAccount, platform }
```

外加 `driver` 对象：

```js
{ driver_name, phone, org, org_id, bound_vehicle }
```

外加 `session` 对象（2026-10-17 起 · 单设备登录）：

```js
{ token, enforced, loginAt, deviceLabel, previous: { deviceLabel, loginAt } | null, degraded? }
```

- **入参**多带 `deviceId`（安装级 UUID）/ `deviceLabel`（机型 + 微信版本）；
- 登录成功即把 `user_sessions` 里该账号那一行覆盖成新 token → 别的设备心跳比对不上就被顶下线；
- `enforced: false`（+ `degraded: true`）= 会话表没建或写失败，**登录照常成功**，只是不限制设备；
- `previous` 只有「上一次登录是另一台设备」时非空，用来告诉新设备「已把谁顶掉」。

> ⚠️ `isSubAccount` / `orgName` / `ownerAccount` 三个字段直接决定 `vehicle-list` 的隔离结果。
> 缺任意一个都可能导致小程序端查询被过滤成空。

## 角色判定

| 场景 | `role_id` | `owner_account` | 本函数返回的 `platform` |
| --- | --- | --- | --- |
| 客户主账号 | NULL | NULL | `miniprogram` |
| 司机账号 | NULL | 有值 | `miniprogram` |
| 管理员 / 子账号 | 有值 | 视情况 | `miniprogram` |

## 注意

- 登录校验的是 **`users.password`**，不是 `customers.password` 或 `admins.password`
- 改密码一定要写回 `users` 表
- 主账号 `orgName` 为空时，用 `user.name` 兜底（与 Web 端 `LoginView` 口径一致）
