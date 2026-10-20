# waybill-detail 配置快照

| 项 | 值 |
| --- | --- |
| 函数名 | `waybill-detail` |
| 运行时 | Node.js 18.15 |
| 超时时间 | 建议 15 秒 |
| 调用方式 | `wx.cloud.callFunction`（**不需要** HTTP 网关） |
| 环境变量 | 无 |

## 入参

```js
{ account, id }   // 当前登录账号（司机）+ 运单 id
```

## 返回

```js
{
  code: 0,
  message: 'ok',
  waybill: {
    id, waybill_no, status, task_name, receive_no, source, create_time,
    // 运输信息
    pickup, delivery, pickup_time, plan_time, vehicle,
    // 货物信息
    cargo, quantity, freight, carry_quantity,
    // 指派信息
    assignments: [{ method, methodLabel, items: [{ target, carryQuantity, carryFreight }] }],
    my_assign: { method, target },        // 这条是「怎么派给我的」
    assigner: { name, phone, isBoss, account },   // 指派人
    // 可执行动作
    can_accept, can_reject, can_complete,
  },
}
```

失败：`{ code: 400|403|404|500, message: '…' }`

## ⭐ 指派人（assigner）规则

`waybills.owner_account` 是发布者账号（Web 端 `doPublish()` 写的是
`currentUser.masterAccount || currentUser.account`），管理员发布则为 `null`。

| `owner_account` | 显示姓名 | 显示手机号 |
| --- | --- | --- |
| 顶级账号（自身无 `owner_account`、无 `role_id`） | **大BOSS** | 该账号的 `phone` |
| 其他账号 | 该账号的 `name` | 该账号的 `phone` |
| `null`（管理员发布） | 平台管理员 | `--` |

> ⚠️ 管理员发布时 `waybills` 里**没有记录是哪个管理员**，所以无法还原姓名/手机号，
> 只能显示「平台管理员 / --」。要修需要 Web 端发布时补一个 `created_by` 字段。

## 安全校验

与 `waybill-list` / `waybill-action` **完全一致**（同一套代码复制）：

1. **客户隔离**：`waybills.owner_account` 必须与调用者的主账号一致，否则 `403`
2. **归属校验**：解析 `assignments`，确认确实指派给该司机（含管理员单的跨客户重名消歧）
3. 只读接口，不产生副作用

> ⚠️ 改动归属校验逻辑时，**三个函数必须同步改**：
> `waybill-list`（列表） / `waybill-action`（操作） / `waybill-detail`（详情）。
> 云函数之间不能共享本地模块，只能复制。
