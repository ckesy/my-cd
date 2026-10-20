-- ============================================================
-- 2026-10-20 · 业务流程模块化（画布 / 开关 / 权限分层）
--   1) tenant_modules 加 config jsonb（存节点参数，不存开关）
--   2) roles 加 role_type（finance 打标，替代"名字里带财务"）
--   3) reports 加 pay_required（提交时快照付款模块开关）
--   4) 存量客户补 waybill 行（代码里另有 defaultOn 兜底，双保险）
-- 执行位置：腾讯云开发 / Supabase 的 SQL 编辑器（一次执行即可）
-- 顺序：必须先跑本文件，再发云函数（云函数会读 config / pay_required）
-- ============================================================

-- ------------------------------------------------------------
-- 1. 节点参数（口径 / 阈值 / 通知人等），与 enabled 分开
--    enabled = 这个功能有没有
--    config  = 这个功能怎么跑
-- ------------------------------------------------------------
alter table public.tenant_modules
  add column if not exists config jsonb default '{}'::jsonb;

comment on column public.tenant_modules.config is
  '节点级参数快照，如 {"threshold":5000,"notifyTo":["财务1"]}；开关只看 enabled，参数不看 enabled';

-- ------------------------------------------------------------
-- 2. 角色类型：财务角色显式打标
--    ⚠️ 之前靠 roles.name like '%财务%' 找审批人，
--       客户把角色改名成「会计」就会静默掉到老板兜底
-- ------------------------------------------------------------
alter table public.roles
  add column if not exists role_type text default 'normal';

comment on column public.roles.role_type is
  'normal / finance / boss；finance 用于财务端可见性判定与审批链兜底';

-- 存量按名字回填一次（只回填还没打过标的）
update public.roles
   set role_type = 'finance'
 where role_type = 'normal'
   and name like '%财务%';

-- ------------------------------------------------------------
-- 3. 付款是否需要：提交时按「付款记录」模块开关快照
--    ⚠️ 必须是快照。若实时判断，今天一开付款模块，
--       历史所有「已通过」的单会突然涌进待登记
-- ------------------------------------------------------------
alter table public.reports
  add column if not exists pay_required boolean default false;

comment on column public.reports.pay_required is
  '提交时快照：true 则审批通过后进「待打款」，false 则终态「已通过」';

update public.reports
   set pay_required = true
 where pay_required = false
   and (status in ('待打款', '已打款') or payment is not null);

-- ------------------------------------------------------------
-- 4. 存量客户补一行 waybill=true
--    代码里 DEFAULT_ON 也会兜底（没有记录时按开处理），
--    这里只是让后台/画布能直接看到这一行
-- ------------------------------------------------------------
insert into public.tenant_modules (owner_account, module_key, enabled, updated_by)
select distinct owner_account, 'waybill', true, 'migration'
  from public.tenant_modules
 where owner_account is not null and owner_account <> ''
on conflict (owner_account, module_key) do nothing;

-- 有运单数据的客户也补一遍（可能从没配置过任何模块）
insert into public.tenant_modules (owner_account, module_key, enabled, updated_by)
select distinct owner_account, 'waybill', true, 'migration'
  from public.waybills
 where owner_account is not null and owner_account <> ''
on conflict (owner_account, module_key) do nothing;

-- ------------------------------------------------------------
-- 5. 授权（必须执行，否则前端写 config 会 42501）
-- ------------------------------------------------------------
grant select, insert, update, delete on table public.tenant_modules to public;
grant select, update on table public.roles to public;
grant usage, select on all sequences in schema public to public;

notify pgrst, 'reload schema';
