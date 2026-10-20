# waybill-list 配置快照

| 项 | 值 |
| --- | --- |
| 函数名 | `waybill-list` |
| 运行时 | Node.js 18.15 |
| 超时时间 | 建议 20 秒 |
| 调用方式 | `wx.cloud.callFunction`（**不需要** HTTP 网关） |
| 环境变量 | 无 |

## 入参

```js
{ account, page = 1, pageSize = 20 }
```

## 出参

```js
{
  code: 0,
  list: [{
    id, waybill_no, status, task_name, receive_no,
    pickup, delivery, pickup_time, plan_time,
    vehicle,            // 已解析为「本次派给我的那辆」，取不到为空串
    cargo, quantity, freight, carry_quantity, create_time,
    assign_method,      // 'driver' | 'vehicle' | 'team'，即这条是「怎么派给我的」
    assign_target,
  }],
  total, hasMore,
  driver: { driver_name, org, plates }
}
```

## 关键行为

- **不返回** `待重新指派` 状态的运单（司机已拒单，等 Web 端重派）
- 匹配**必须解析 `assignments`**，`driver` / `vehicle` 两个标量字段不可靠（多指派时会写成 `'多种'` / `'N辆'` / `'--'`）
- 「指派车队」会匹配**我的机构 + 全部祖先机构名**（指派给上级车队，下级司机也能收到）
- 车牌取值优先级：`assignments` 里指派给我的车 → `vehicle` 字段 → 我只绑了一辆车时用它 → 空串

## 已知限制

候选集为**近 90 天 / 最多 300 条**，然后内存过滤。若某客户运单量很大导致漏单，
建议 Web 端发布时把匹配结果**反范式化**写入 `assigned_drivers`（逗号分隔司机姓名），
再把查询改成 `or=(assigned_drivers.ilike.*我*,assigned_orgs.ilike.*我的机构*)`。

## 排查

看函数日志这几行：

1. `waybill-list：<账号> 司机=… 车牌=… 机构=… 祖先=N`
2. `waybill-list：候选 N 条`
3. `waybill-list：命中 M 条`

命中 0 时优先检查：① 司机 `bound_vehicle` 是否填了；② `drivers.phone` 与登录账号是否一致；
③ 运单的 `assignments` 里 `target` 文案与 `driver_name` / 车牌 / 机构名是否**完全一致**（空格、全半角）。
