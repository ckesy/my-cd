-- ============================================================
-- 账号绑定皮肤主题
-- 用途：换肤后保存到账号，换设备打开也是同一套
-- ============================================================

ALTER TABLE customers ADD COLUMN IF NOT EXISTS theme text;

COMMENT ON COLUMN customers.theme IS '主题 key，对应 src/utils/theme.js 的 THEMES';

-- CloudBase 匿名登录需要授权
GRANT SELECT, INSERT, UPDATE, DELETE ON customers TO anon, authenticated;

SELECT pg_notify('pgrst', 'reload schema');
