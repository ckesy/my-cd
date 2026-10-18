-- ============================================================
-- 费用上报 + 费用审批 数据表
-- 执行位置：腾讯云开发 / Supabase 的 SQL 编辑器（一次执行即可）
-- 说明：
--   1) 项目现有表未启用 RLS，这里保持一致；隔离由前端查询条件 + 云函数保证
--   2) 所有时间用 timestamptz，前端统一 Date.parse（不要直接切片）
-- ============================================================

-- ------------------------------------------------------------
-- 1. 上报主表（8 类共用，差异放 payload）
-- ------------------------------------------------------------
create table if not exists public.reports (
  id                bigserial primary key,
  report_no         text unique,
  type              text not null,                 -- expense / weigh / subsidy / violation / overtime / receipt / loan / cardfix
  waybill_id        bigint,
  waybill_no        text,
  owner_account     text,                          -- 主账号（隔离用）
  org_id            bigint,
  driver_name       text,
  driver_phone      text,
  plate             text,
  amount            numeric(14, 2) default 0,      -- 钱款类合计，服务端重算
  payload           jsonb default '{}'::jsonb,     -- 明细 / 重量 / 原因等
  images            jsonb default '[]'::jsonb,     -- [{fileID,name,size}]
  status            text not null default '审核中', -- 草稿/审核中/已通过/已驳回/待打款/已打款/已撤回
  approval_enabled  boolean default true,          -- 提交时快照
  current_level     int default 1,                 -- 0=免审
  flow              jsonb default '[]'::jsonb,     -- [{level,role,approver_id,name,mode,status,acted_at,comment}]
  reject_reason     text,
  reject_count      int default 0,
  paid_at           timestamptz,
  paid_by           text,
  create_time       timestamptz default now(),
  update_time       timestamptz default now()
);

create index if not exists idx_reports_waybill_no on public.reports (waybill_no);
create index if not exists idx_reports_owner      on public.reports (owner_account);
create index if not exists idx_reports_status     on public.reports (status);

-- ------------------------------------------------------------
-- 2. 审批动作流水（审计 + 「我已审批」）
-- ------------------------------------------------------------
create table if not exists public.report_approval_logs (
  id          bigserial primary key,
  report_id   bigint not null,
  level       int,
  actor_id    bigint,
  actor_name  text,
  action      text not null,        -- approve / reject / forward / skip / escalate / pay / withdraw
  comment     text,
  created_at  timestamptz default now()
);

create index if not exists idx_report_logs_report on public.report_approval_logs (report_id);

-- ------------------------------------------------------------
-- 3. 费用审批配置（一个主账号一行）
-- ------------------------------------------------------------
create table if not exists public.fee_approval_configs (
  id                    bigserial primary key,
  owner_account         text not null unique,
  mode                  text not null default 'on',   -- on / off / custom
  custom_default        boolean default true,         -- 自定义模式下新建运单默认开/关
  allow_creator_toggle  boolean default false,        -- 允许发单人建单时改单票
  threshold             numeric(14, 2) default 5000,  -- ≥ 该金额强制送老板；0 = 不按金额
  l1_mode               text default 'self',          -- self=由发单人审 / skip=免审直送
  l1_user_id            bigint,                       -- null = 跟随发单人
  l2_user_id            bigint,                       -- 财务
  require_owner         boolean default false,        -- 财务始终送老板终审
  updated_by            text,
  updated_at            timestamptz default now()
);

-- ------------------------------------------------------------
-- 4. 运单上的单票开关（仅自定义模式读取）
--    inherit = 跟随全局；on / off = 单票指定
-- ------------------------------------------------------------
alter table public.waybills
  add column if not exists fee_approval text default 'inherit';

comment on column public.waybills.fee_approval is '费用审批单票开关：inherit/on/off，仅 mode=custom 时生效';

-- ------------------------------------------------------------
-- 5. 可选：把现有上报记录的时间字段统一
-- ------------------------------------------------------------
-- update public.reports set update_time = now() where update_time is null;

-- ============================================================
-- 说明：审批链由服务端在提交时生成并写入 reports.flow
--   一级 = 发单人（或配置指定人 / 免审）
--   二级 = 本机构财务（未配置则顶到主账号）
--   三级 = 主账号（阈值触发 / 财务要求 / 配置始终终审）
--   同一人不重复出现在两级；一级 = 上报人时跳过
-- ============================================================

-- ============================================================
-- 6. 授权（必须执行，否则网关会报 42501 permission denied）
--    本项目现有表是开放给匿名网关的，新表沿用同一口径
-- ============================================================
grant usage on schema public to public;
grant select, insert, update, delete on table public.reports to public;
grant select, insert, update, delete on table public.report_approval_logs to public;
grant select, insert, update, delete on table public.fee_approval_configs to public;
grant usage, select on all sequences in schema public to public;

-- 如果执行完仍报 42501，检查是否有 RLS 拦住：
--   select relname, relrowsecurity from pg_class where relname in ('reports','report_approval_logs','fee_approval_configs');
-- 若 relrowsecurity = true，执行：
--   alter table public.reports disable row level security;
--   alter table public.report_approval_logs disable row level security;
--   alter table public.fee_approval_configs disable row level security;

-- 让 PostgREST 立刻重新加载权限（不执行也能生效，只是可能延迟几秒）
notify pgrst, 'reload schema';
