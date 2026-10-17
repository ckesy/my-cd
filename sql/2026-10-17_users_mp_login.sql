-- ============================================================
-- 迁移：小程序管理端登录开关
-- 日期：2026-10-17
-- 执行位置：CloudBase 控制台 → 数据库 → SQL 执行（PostgreSQL）
--
-- 语义：users.mp_login_enabled = true 的「管理员 / 员工」账号（role_id 非空）
--       才能登录小程序管理端；司机账号（role_id 为空）不受影响。
--
-- ⚠️ 必须先执行本脚本，再部署新的 login-by-account：
--    新函数会读这一列，列不存在时查询会报 400/42703。
--
-- 可重复执行。
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS mp_login_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.mp_login_enabled IS
  '是否允许登录小程序管理端；只对 role_id 非空的账号生效，司机账号不看这一列';

-- 按需：把现有的管理员 / 员工账号一次性开通（不想全开就保持注释）
-- UPDATE public.users SET mp_login_enabled = true WHERE role_id IS NOT NULL;

-- 让 PostgREST 立刻感知新列（没有监听者也不会报错）
SELECT pg_notify('pgrst', 'reload schema');
