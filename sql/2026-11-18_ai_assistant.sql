-- ============================================================
-- AI 助手基础表（P0）
-- 2026-11-18
-- ============================================================
-- 执行方式：CloudBase 控制台 → 数据库 → SQL 编辑器，整段执行。
-- 项目无本地迁移工具，DDL 只能手跑。
--
-- ⚠️ 末尾的授权段不能省。没有它会出现「SELECT 通、写被拒」：
--    前端能读到 0 条不报错，但云函数 INSERT 直接 401。
-- ============================================================

-- ---------- 1. 会话令牌（连桥：Web 登录后签发，ai-gateway 只认它） ----------
create table if not exists ai_sessions (
  token       text primary key,
  account     text not null,
  tenant      text not null,
  kind        text,                          -- master | staff | driver
  expires_at  timestamptz not null,
  created_at  timestamptz default now()
);

create index if not exists idx_ai_sessions_account on ai_sessions (account);
create index if not exists idx_ai_sessions_expire  on ai_sessions (expires_at);

-- ---------- 2. 审计日志（同时用于配额统计与成本核算） ----------
create table if not exists ai_assistant_logs (
  id                bigserial primary key,
  trace_id          text not null,
  session_id        text,
  account_id        text not null,
  owner_account     text not null,
  client            text,                    -- web | miniprogram | wechat
  question          text,                    -- 已脱敏，<=200 字
  intent            text,                    -- 工具名，逗号分隔
  tool_calls        jsonb,
  rows_returned     int default 0,
  prompt_tokens     int default 0,
  completion_tokens int default 0,
  cached_tokens     int default 0,
  latency_ms        int default 0,
  status            text,                    -- ok | error | quota | denied
  error_code        text,
  created_at        timestamptz default now()
);

create index if not exists idx_ai_logs_owner_time on ai_assistant_logs (owner_account, created_at desc);
create index if not exists idx_ai_logs_account    on ai_assistant_logs (account_id, created_at desc);
create index if not exists idx_ai_logs_trace      on ai_assistant_logs (trace_id);

-- ---------- 3. 授权（Web 走匿名登录 anon，云函数同样用 anon） ----------
grant select, insert, update, delete on ai_sessions        to anon, authenticated;
grant select, insert, update          on ai_assistant_logs to anon, authenticated;
grant usage, select on sequence ai_assistant_logs_id_seq   to anon, authenticated;

-- 让 PostgREST 立刻感知新表，否则会一直报 PGRST205
select pg_notify('pgrst', 'reload schema');

-- ============================================================
-- 自检（执行完后逐条跑，全部应有结果）
-- ============================================================
-- select count(*) from ai_sessions;
-- select count(*) from ai_assistant_logs;
-- select column_name, data_type from information_schema.columns
--   where table_name = 'ai_assistant_logs' order by ordinal_position;
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_name = 'ai_assistant_logs';
