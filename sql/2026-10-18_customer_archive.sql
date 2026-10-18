-- ============================================================
-- 档案管理 · 客户档案 / 客户联系人（员工）
-- 日期：2026-10-18
-- 执行位置：CloudBase 控制台 → 数据库 → SQL 执行（PostgreSQL）
--
-- 为什么要新建表而不是复用 customers：
--   customers 是「租户/登录账号」表（手机号 + 密码 + 平台权限），
--   一个租户对应一个登录主体，不能拿来当「业务客户档案」用。
--   客户档案是发货方/收货方的业务档案，一个租户下可以有很多条。
--
-- 全部语句可重复执行。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 客户档案
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_archives (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_account  varchar(64),                    -- 所属租户（主账号手机号）；admin 建的为 NULL
  customer_id    text,                           -- 租户 customers.id（本项目该 id 是整数，统一存 text）
  org_id         text,                           -- 所属组织 organizations.id（同上，整数）
  org_name       text,                           -- 所属组织名称（冗余，便于展示/筛选）
  name           text NOT NULL,                  -- 客户名称（必填）
  manager        text,                           -- 负责人（选填）
  manager_phone  text,                           -- 负责人电话（选填）
  province       text,                           -- 所属区域-省（选填）
  city           text,                           -- 所属区域-市（选填）
  status         smallint NOT NULL DEFAULT 1,    -- 1 正常 / 0 停用
  remark         text,
  contract_name  text,                           -- 合同文件名
  contract_type  text,                           -- 合同 MIME
  contract_size  bigint,                         -- 合同字节数
  has_contract   boolean NOT NULL DEFAULT false, -- 列表查询用它判断有没有合同，避免拉 base64
  contract_data  text,                           -- 合同内容（dataURL）；后续可迁到云存储
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cust_arch_owner  ON public.customer_archives (owner_account, status);
CREATE INDEX IF NOT EXISTS idx_cust_arch_name   ON public.customer_archives (name);

COMMENT ON TABLE  public.customer_archives              IS '客户档案：发货方/收货方业务档案（不是登录租户）';
COMMENT ON COLUMN public.customer_archives.owner_account IS '所属租户主账号；admin 创建为 NULL';
COMMENT ON COLUMN public.customer_archives.status        IS '1 正常 / 0 停用（停用后建运单不可选）';
COMMENT ON COLUMN public.customer_archives.has_contract  IS 'true 表示有合同附件，列表只查它，不查 contract_data';

-- ------------------------------------------------------------
-- 2. 客户联系人 / 员工
--    roles：装货 / 卸货 / 唯一（唯一 = 装货+卸货都带入）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_contacts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_id     uuid NOT NULL REFERENCES public.customer_archives(id) ON DELETE CASCADE,
  owner_account  varchar(64),
  customer_id    text,
  person_type    text NOT NULL DEFAULT '联系人',  -- 员工 / 联系人
  name           text NOT NULL,                   -- 姓名
  phone          text,                            -- 手机号
  position       text,                            -- 职务/岗位
  roles          text,                            -- 装货 / 卸货 / 唯一 / 装货,卸货
  remark         text,
  status         smallint NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cust_contact_archive ON public.customer_contacts (archive_id);
CREATE INDEX IF NOT EXISTS idx_cust_contact_owner   ON public.customer_contacts (owner_account);

COMMENT ON TABLE  public.customer_contacts           IS '客户下的员工/联系人；roles 决定建运单时自动带入哪一端电话';
COMMENT ON COLUMN public.customer_contacts.roles      IS '装货 / 卸货 / 唯一；唯一表示装货、卸货都带入';
COMMENT ON COLUMN public.customer_contacts.person_type IS '员工 / 联系人';

-- ------------------------------------------------------------
-- 3. 运单关联字段（发布运单时写入）
--    不执行也能发运单：前端会去掉这些字段重试（降级）
-- ------------------------------------------------------------
ALTER TABLE public.waybills ADD COLUMN IF NOT EXISTS customer_archive_id  uuid;
ALTER TABLE public.waybills ADD COLUMN IF NOT EXISTS customer_archive_name text;
ALTER TABLE public.waybills ADD COLUMN IF NOT EXISTS pickup_contact_name   text;
ALTER TABLE public.waybills ADD COLUMN IF NOT EXISTS pickup_contact_phone  text;
ALTER TABLE public.waybills ADD COLUMN IF NOT EXISTS delivery_contact_name  text;
ALTER TABLE public.waybills ADD COLUMN IF NOT EXISTS delivery_contact_phone text;

COMMENT ON COLUMN public.waybills.customer_archive_id   IS '关联的客户档案 customer_archives.id（选填）';
COMMENT ON COLUMN public.waybills.pickup_contact_phone  IS '装货联系人电话（发货联系电话）';
COMMENT ON COLUMN public.waybills.delivery_contact_phone IS '卸货联系人电话（收货联系电话）';

-- ------------------------------------------------------------
-- 4. 授权（必须）
--    Web 端走匿名登录（anon 角色），新建的表默认没写权限，
--    不授权会报 permission denied for table customer_archives
-- ------------------------------------------------------------
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'authenticator']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_archives TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_contacts TO %I', r);
      EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', r);
    END IF;
  END LOOP;
END $$;

-- 让 PostgREST 立刻感知新表 / 新权限
SELECT pg_notify('pgrst', 'reload schema');
