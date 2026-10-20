# 云函数部署包 · 2026-10-20（含财务端）

业务流程模块化 + 小程序联动 + 财务端。**共 6 个云函数**，改动已全部写入 `index.js`，
目录结构与 `cloudfunctions/` 一致。**只需替换 `index.js`**：`package.json` 没变（无新依赖），
`config.md` 是说明文档。

---

## 一、部署顺序

```
① sql/2026-10-20_flow_modules.sql       ← 先跑（pay_required / config / role_type）
② login-by-account                      ← 先验证返回体
③ report-action                         ← 财务端全部动作都在这里
④ waybill-list / waybill-detail / waybill-action / waybill-admin
⑤ 小程序前端发版
```

顺序反了不会挡死业务（`assertModule` 查表失败会 `catch` 放行、`pay_required` 列不存在会剥字段重试），
但你会看不到真实效果。

---

## 二、本次改了哪些

### 1. `login-by-account`

**返回体新增 6 个字段**：

```json
{
  "modules": { "waybill": true, "route": false, "recurring": false,
               "payout": false, "report": false },
  "tabs": [ ... ],
  "homeUrl": "/pages/finance/home",
  "canFinance": true,
  "financeUrl": "/pages/finance/home",
  "approvalMode": "on"
}
```

**新增拦截**：司机 + 运单未开通 → `code:500, needWaybill:true`，直接拒绝登录。

**财务端三层判定**（`resolveIsFinance` + `loadApprovalMode`）：

```
运单模块开  AND  (审批 mode≠off  OR  付款模块开)  AND  角色是财务/主账号
```

`homeUrl` 优先取 `financeUrl`，所以财务人员登录直接进待办，不用绕管理端。

### 2. `report-action`（改动最大）

**状态机**（`pay_required` 快照）：

| 时机 | 条件 | 状态 |
|---|---|---|
| 提交上报 | 不审 / 一级通过 + `pay_required=false` | `已通过` |
| 提交上报 | 不审 / 一级通过 + `pay_required=true` | **`待打款`** |
| 最后一级通过 | `report.pay_required === true` | **`待打款`** |
| 最后一级通过 | 否则 | `已通过` |
| 登记付款 | `待打款` | `已打款` |
| 撤销付款 | `已打款` | `待打款` |

**新增 4 个 action**：

| action | 作用 | 权限 |
|---|---|---|
| `bootstrap` | 财务端启动一次拉齐：modules/perms/tabs/counts/role | 无 |
| `pay` | 登记付款（支持 ids 批量，条件更新防重复） | `payout` 开 + `fee_pay` |
| `unpay` | 撤销付款（保留原记录，标记 revoked） | 同上 |
| `paidList` | 台账查询（可按 status 过滤） | 审批或付款任一 |

**新增 `loadFinanceConfig`**：读 `fee_approval_configs.mode` + `tenant_modules.payout`，60s 缓存。

**容错**：`reports.pay_required` 列不存在时剥字段重试，不会把上报打挂。

### 3. 其余 4 个（waybill-list / detail / action / admin）

各 +39 行，全是 `assertModule(account,'waybill')`，未开通返回 `403`。无其他改动。

---

## 三、验证方法

### 3.1 返回体

小程序登录后，调试器 → Storage → `currentUser`，应能看到：

```
modules: { waybill: true, route: false, ... }
tabs: [...]
homeUrl: "..."
canFinance: false
financeUrl: ""
```

### 3.2 闸门（不要用"页面上看不到按钮"当标准）

开发者工具 → 云开发控制台 → 云函数 → 测试，入参：

```json
{ "account": "司机账号", "page": 1, "pageSize": 10 }
```

把该车队 `tenant_modules.waybill` 置 `false`，再调，**必须**拿到 `code: 403`。

### 3.3 财务端

```json
{ "account": "财务账号", "action": "bootstrap" }
```

应返回：

```json
{ "code": 0, "data": {
    "modules": { "audit": true, "payment": false },
    "perms": ["fee_audit","fee_pay","fee_stats"],
    "tabs": [{"key":"todo",...},{"key":"ledger",...},{"key":"stats",...},{"key":"mine",...}],
    "visible": true
}}
```

`tabs` 里没有 `pay` 就说明付款模块没开——这是对的。

---

## 四、包里带着的历史改动（注意）

| 函数 | 额外内容 |
|---|---|
| `report-action` | 「指派归属」软校验修复：多司机指派时 `waybills.driver` 是展示串「2 人」，原字符串比对永远不匹配。新增 `parseAssignments`，先按 `assignments` 逐条比姓名/车牌，再退回展示串 |
| `wx-notify` | **不在本包内**，仓库里有未提交改动（77 行），本次未打包 |

---

## 五、回滚

改动都是新增，没有删改原有逻辑。

唯一需要留意的两处拦截：

1. 司机 + 运单未开通 → 拒绝登录（搜 `needWaybill`）
2. 五个函数里的 `assertModule` 调用行

不想要时注释掉这两处即可，其余代码不受影响。

---

## 六、已知边界

- `tenant_modules` 没有记录时：**只有运单按开**，其余按关
- `pay_required` 是**提交时快照**。今天开付款模块，历史「已通过」的单不会涌进待登记
- 财务端页面全部自绘底栏（`components/fin-tabbar.vue`），**不用原生 tabBar**
- 小程序端 `currentUser.modules` 是登录快照，改配置后要重新登录才刷新
