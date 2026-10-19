-- ============================================================
-- 2026-10-19 · 付款登记（原打款登记）
--   1) reports 增加 payment（付款方式 / 时间 / 流水号 / 凭据 / 撤销痕迹）
--   2) 新增 tenant_modules：客户级模块开关，付款登记默认**关闭**，
--      不配置就没有这个功能；以后其它模块直接往这张表加 module_key
-- 执行位置：腾讯云开发 / Supabase 的 SQL 编辑器（一次执行即可）
-- ============================================================

-- ------------------------------------------------------------
-- 1. 付款信息（jsonb，先放着，后续要拆列再迁）
--    { method, at, serial, note, images:[{fileID,name,size}], by, paid_at,
--      revoked_at, revoked_by, revoke_reason }
-- ------------------------------------------------------------
alter table public.reports
  add column if not exists payment jsonb default '{}'::jsonb;

comment on column public.reports.payment is
  '付款登记快照：方式/时间/流水号/备注/凭据图片；撤销时补 revoked_*，原付款信息保留';

-- ------------------------------------------------------------
-- 2. 客户级模块开关
--    没有行 = 未开启（"不配置就没有"）；enabled=true 才算开通
-- ------------------------------------------------------------
create table if not exists public.tenant_modules (
  id            bigserial primary key,
  owner_account text not null,                 -- 主账号
  module_key    text not null,                 -- payout（付款登记）；以后按模块加
  enabled       boolean not null default false,
  updated_by    text,
  updated_at    timestamptz default now(),
  unique (owner_account, module_key)
);

create index if not exists idx_tenant_modules_owner on public.tenant_modules (owner_account);

comment on table public.tenant_modules is '客户级功能模块开关；无记录视为未开通';
comment on column public.tenant_modules.module_key is '模块标识：payout=付款登记';

-- ------------------------------------------------------------
-- 3. 存量客户平滑：已经用过费用上报的主账号，付款登记先默认开启
--    （新客户 / 还没有任何上报的，保持关闭，去「费用审批设置 → ④ 功能模块」打开）
-- ------------------------------------------------------------
insert into public.tenant_modules (owner_account, module_key, enabled, updated_by)
select owner_account, 'payout', true, 'migration'
from public.fee_approval_configs
on conflict (owner_account, module_key) do nothing;

insert into public.tenant_modules (owner_account, module_key, enabled, updated_by)
select distinct owner_account, 'payout', true, 'migration'
from public.reports
where owner_account is not null and owner_account <> ''
on conflict (owner_account, module_key) do nothing;

-- 如果当前主账号没有 fee_approval_configs 行、又不想等配置页，可以手工开这一行：
-- insert into public.tenant_modules (owner_account, module_key, enabled, updated_by)
-- values ('15035660010', 'payout', true, 'manual')
-- on conflict (owner_account, module_key) do update set enabled = true, updated_at = now();

-- ------------------------------------------------------------
-- 4. 授权（必须执行，否则网关报 42501）
-- ------------------------------------------------------------
grant select, insert, update, delete on table public.tenant_modules to public;
grant usage, select on all sequences in schema public to public;

-- 让 PostgREST 立刻重新加载结构/权限
notify pgrst, 'reload schema';
