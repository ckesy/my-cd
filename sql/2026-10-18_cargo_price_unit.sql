-- ============================================================
-- 货物档案 · 计费规则加「计价单位」+ 历史单位归一
-- 日期：2026-10-18
-- 执行位置：CloudBase 控制台 → 数据库 → SQL 执行（PostgreSQL）
--
-- 背景：计费规则原来写死「元/km」，现在支持
--   元/km（里程 × 单价）、元/吨、元/件、元/箱、元/车（数量 × 单价）、
--   元/趟（取单价）、元/小时、元/天（人工填）
--
-- 可重复执行。
-- ============================================================

-- 1. 计费规则：计价单位
ALTER TABLE public.cargo_rules ADD COLUMN IF NOT EXISTS price_unit text;
UPDATE public.cargo_rules SET price_unit = '元/km' WHERE price_unit IS NULL;
ALTER TABLE public.cargo_rules ALTER COLUMN price_unit SET DEFAULT '元/km';

COMMENT ON COLUMN public.cargo_rules.price_unit IS '计价单位：元/km、元/吨、元/件、元/箱、元/车、元/趟、元/小时、元/天';

-- 2. 运单：计价单位快照（对账用）
ALTER TABLE public.waybills ADD COLUMN IF NOT EXISTS cargo_price_unit text;
COMMENT ON COLUMN public.waybills.cargo_price_unit IS '货物计价单位快照，如 元/km';

-- 3. 历史货物单位归一（老数据里的简称 → 标准值）
--    只改明确的别名，自定义单位保持原样
UPDATE public.cargo_archives SET unit = '立方米'
 WHERE unit IN ('方', '立方', 'm3', 'm³', 'CBM', 'cbm');
UPDATE public.cargo_archives SET unit = '托盘'
 WHERE unit IN ('托', '板');
UPDATE public.cargo_archives SET unit = '千克'
 WHERE unit IN ('kg', 'KG', 'Kg');
UPDATE public.cargo_archives SET unit = '吨'
 WHERE unit IN ('t', 'T');

-- 4. 授权兜底（新列不影响权限，这里只是防止表权限被重置）
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'authenticator']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.cargo_rules TO %I', r);
    END IF;
  END LOOP;
END $$;

SELECT pg_notify('pgrst', 'reload schema');

-- 查看历史单位分布（可选）
-- SELECT unit, count(*) FROM public.cargo_archives GROUP BY unit ORDER BY 2 DESC;
