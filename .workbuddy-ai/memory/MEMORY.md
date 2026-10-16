# 项目长期记忆 · my-cd（东风车队管理系统）

## Element Plus 弹窗样式约定（element-plus 2.14，源码级结论）

- ⭐⭐ **`<el-dialog>` 默认 `append-to-body: false`** → 弹窗渲染在页面内；若某个祖先带 `transform`（如 Dashboard 的 `.content-wrapper.animate-fade-up`），`position: fixed` 的 `.el-overlay` 会被这个祖先当作包含块 → 遮罩不是全视口，弹窗会偏到内容区、右/下溢出，只能拖动看全。
  → **做大弹窗（需要全屏居中/自适应 vw·vh）时必须加 `append-to-body`**。全项目现有 el-dialog 都没加。
- ⭐ `<el-dialog class="xxx">` 的 `xxx` 会被**合并到 `.el-dialog` 元素自身**（DialogContent 根节点，attrs 自动继承）。
  → 写 `.xxx .el-dialog { ... }`（后代选择器）**永远不匹配**；必须写同元素选择器 `.xxx.el-dialog { ... }`。
  → 但 `.xxx .el-dialog__header/__body/__footer` 是后代，**有效**。
- ⭐ `width` prop 写入的是 CSS 变量 `--el-dialog-width`（`addUnit` 原样透传字符串），由 `.el-dialog { width: var(--el-dialog-width,50%) }` 消费。
  → 想自适应直接传响应式值即可：`width="min(1440px, 96vw)"`，无需改 CSS。
  → EP 的 `.el-dialog` **没有 max-width**，固定像素宽在小屏会横向溢出（`.el-overlay-dialog` 是 `overflow:auto`）。
- 已全部修正（2026-10-16）：`StayDetailDialog`、`OverspeedDetailDialog`、`WaybillCreate`(.route-select-dialog)、`RoleManage`(.role-form-dialog)、`AdminVehicle`(.light-dialog) 已改为 `.xxx.el-dialog`；`AddEleFenceDialog` 的 `:deep(.fence-dialog .el-dialog)` 已移到文件末尾全局 `<style>` 块（scoped `:deep()` 需要祖先带 scope 属性，同样不匹配）。
  - 正确写法参照（项目里本来就对的两处）：`PersonalSettings.vue` 的 `.personal-settings-dialog.el-dialog`、`AdminLayout.vue` 的 `.light-dialog.el-dialog`。

## 数据模型关键约定

- ⭐ **drivers 表用 `org`（机构名称文本）关联机构，不是 `org_id`**。`DriverArchive.saveAdd` 的 insertData 只写 `org`，从不写 `org_id`；司机档案列表隔离也是 `q.eq('org', myOrgName.value)`。
  - 反例：`vehicles` 表用 `org_id` 关联机构（`vehicles.org_id` 是归属机构 id）。
  - 因此按机构统计司机时必须按名称聚合（`organizations.name === drivers.org`），按 org_id 会全为空。
- `users` 表无 `org` 字段，只有 `org_id`；要拿用户的机构名需用 org_id 反查 organizations。
- 司机账号判定：`users.role_id IS NULL AND users.owner_account IS NOT NULL`；司机账号不能登 Web、不出现在用户管理列表/组织树（需 `.not('role_id','is',null)` 过滤）。

## 其他
- 项目开发规范见根目录 `开发规范.md`。
- 架构与踩坑权威来源：根目录 `README-DEV.md`。
