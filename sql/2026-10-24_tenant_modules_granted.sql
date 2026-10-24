-- ============================================================
-- 2026-10-24 模块授权（granted）与客户开关分离
-- ------------------------------------------------------------
-- 背景：tenant_modules.enabled 既表示"管理员开通过"又表示"客户当前开着"，
--       客户关掉后无法区分「管理员从没授权」和「客户自己关的」，
--       于是客户能把运营人员没配的功能自己打开（用户 2026-10-24 报）。
--
-- 新语义：
--   granted = 运营人员是否给这个租户授权过（只有服务商/管理员能写 true）
--   enabled = 客户当前开关（客户可在 granted=true 的前提下自由开关）
--
-- 存量数据：把「当前开着的」视为已授权；enabled=false 的保持未授权
--   （payout 这类一直关着的就是"没配过"，客户不能自己开）。
-- ============================================================

ALTER TABLE tenant_modules
  ADD COLUMN IF NOT EXISTS granted boolean NOT NULL DEFAULT false;

-- 已经开着的模块，视为运营人员授权过
UPDATE tenant_modules
SET granted = true
WHERE enabled = true;

-- Web 走匿名登录，列加了要保证读写权限
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_modules TO anon, authenticated;

SELECT pg_notify('pgrst', 'reload schema');

-- 校验：应当只有 enabled=true 的那几条 granted=true
SELECT owner_account, module_key, enabled, granted
FROM tenant_modules
ORDER BY owner_account, module_key;
