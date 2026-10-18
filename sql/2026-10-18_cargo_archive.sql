-- ============================================================
-- 档案管理 · 货物档案 + 计费规则
-- 日期：2026-10-18
-- 执行位置：CloudBase 控制台 → 数据库 → SQL 执行（PostgreSQL）
--
-- 货物档案：一票货物的基础信息（名称、单位、状态）
-- 计费规则：挂在货物下面，按公里计价（含税 / 未含税），建运单时带出运费
--
-- ⚠️ 本脚本已包含授权段（anon 匿名登录要写权限），一次跑完即可。
-- 全部语句可重复执行。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 货物档案
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cargo_archives (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_account  varchar(64),                 -- 所属租户（主账号手机号）；admin 建的为 NULL
  customer_id    text,                        -- 租户 customers.id（本项目是整数，统一存 text）
  name           text NOT NULL,               -- 货物名称
  unit           text,                        -- 单位：吨 / 件 / 方 / 车 …
  status         smallint NOT NULL DEFAULT 1, -- 1 正常 / 0 停用
  remark         text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cargo_arch_owner ON public.cargo_archives (owner_account, status);
CREATE INDEX IF NOT EXISTS idx_cargo_arch_name  ON public.cargo_archives (name);

COMMENT ON TABLE  public.cargo_archives         IS '货物档案：货物名称 + 计量单位';
COMMENT ON COLUMN public.cargo_archives.unit    IS '计量单位，建运单时带入货物行';
COMMENT ON COLUMN public.cargo_archives.status  IS '1 正常 / 0 停用（停用后建运单不可选）';

-- ------------------------------------------------------------
-- 2. 计费规则（一个货物可有多条）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cargo_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo_id       uuid NOT NULL REFERENCES public.cargo_archives(id) ON DELETE CASCADE,
  owner_account  varchar(64),
  customer_id    text,
  name           text NOT NULL,               -- 规则名称
  price_tax      numeric(12,2),               -- 含税单价（元/km）
  price_no_tax   numeric(12,2),               -- 未含税单价（元/km）
  updated_by     text,                        -- 更新人（当前登录人姓名）
  remark         text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cargo_rule_cargo ON public.cargo_rules (cargo_id);
CREATE INDEX IF NOT EXISTS idx_cargo_rule_owner ON public.cargo_rules (owner_account);

COMMENT ON TABLE  public.cargo_rules              IS '货物计费规则：按公里单价，建运单时用于自动算运费';
COMMENT ON COLUMN public.cargo_rules.price_tax    IS '含税单价（元/km）';
COMMENT ON COLUMN public.cargo_rules.price_no_tax IS '未含税单价（元/km）';

-- ------------------------------------------------------------
-- 3. 运单货物行关联字段（可不执行也能发运单，前端会降级）
-- ------------------------------------------------------------
ALTER TABLE public.waybills ADD COLUMN IF NOT EXISTS cargo_rule_name text;
ALTER TABLE public.waybills ADD COLUMN IF NOT EXISTS cargo_price_tax numeric(12,2);

COMMENT ON COLUMN public.waybills.cargo_rule_name IS '货物计费规则名称（选填，来自货物档案）';
COMMENT ON COLUMN public.waybills.cargo_price_tax IS '含税单价（元/km），用于对账追溯';

-- ------------------------------------------------------------
-- 4. 授权（必须，Web 端是匿名登录 anon 角色）
-- ------------------------------------------------------------
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'authenticator']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.cargo_archives TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.cargo_rules TO %I', r);
      EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', r);
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.cargo_archives DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cargo_rules    DISABLE ROW LEVEL SECURITY;

SELECT pg_notify('pgrst', 'reload schema');
