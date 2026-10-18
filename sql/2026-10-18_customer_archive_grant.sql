-- ============================================================
-- 客户档案 · 授权修复（跑完就能保存）
-- 日期：2026-10-18
-- 执行位置：CloudBase 控制台 → 数据库 → SQL 执行（PostgreSQL）
--
-- 现象：新建客户点保存报
--   「保存失败：permission denied for table customer_archives」
-- 原因：表建好了，但 Web 端走的是**匿名登录**（anon 角色），
--       新表默认只给了建表人（控制台账号）权限，anon 没写权限。
-- 解决：把 SELECT/INSERT/UPDATE/DELETE 授给 anon 等角色（只授存在的角色）。
--
-- 可重复执行，跑完不用重启服务；前端重新点一次保存即可。
-- ============================================================

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'authenticator']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_archives TO %I', r
      );
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_contacts TO %I', r
      );
    END IF;
  END LOOP;
END $$;

-- 与本项目其它业务表保持一致：不启用 RLS（数据隔离走应用层的 owner_account）
ALTER TABLE public.customer_archives DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_contacts DISABLE ROW LEVEL SECURITY;

-- schema 使用权限（某些环境 anon 连 public 的 USAGE 都没有，一并补上）
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'authenticator']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', r);
    END IF;
  END LOOP;
END $$;

-- 让 PostgREST 立刻感知权限变更
SELECT pg_notify('pgrst', 'reload schema');

-- ------------------------------------------------------------
-- 验证（可选）：应当返回 4 行，privilege 里有 INSERT/UPDATE/DELETE
-- ------------------------------------------------------------
-- SELECT grantee, privilege_type
--   FROM information_schema.role_table_grants
--  WHERE table_name = 'customer_archives'
--  ORDER BY grantee, privilege_type;
