-- ============================================================
-- 客户档案 · 修正外键字段类型（跑完就能保存）
-- 日期：2026-10-18
-- 执行位置：CloudBase 控制台 → 数据库 → SQL 执行（PostgreSQL）
--
-- 现象：保存客户报
--   「invalid input syntax for type uuid: "5"」
-- 原因：建表时把 customer_id / org_id 写成了 uuid，
--       但本项目 customers.id、organizations.id 都是**整数**（5、8…），
--       写进去 uuid 解析不了。
-- 解决：把这两列改成 text（兼容整数/UUID 两种历史 ID）。
--
-- 可重复执行，跑完不用重启服务。
-- ============================================================

DO $$
BEGIN
  -- customer_archives.customer_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'customer_archives'
       AND column_name = 'customer_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.customer_archives
      ALTER COLUMN customer_id TYPE text USING customer_id::text;
  END IF;

  -- customer_archives.org_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'customer_archives'
       AND column_name = 'org_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.customer_archives
      ALTER COLUMN org_id TYPE text USING org_id::text;
  END IF;

  -- customer_contacts.customer_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'customer_contacts'
       AND column_name = 'customer_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.customer_contacts
      ALTER COLUMN customer_id TYPE text USING customer_id::text;
  END IF;
END $$;

SELECT pg_notify('pgrst', 'reload schema');

-- 验证（可选）：data_type 应当都是 text
-- SELECT table_name, column_name, data_type
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name IN ('customer_archives', 'customer_contacts')
--    AND column_name IN ('customer_id', 'org_id', 'archive_id');
