-- ============================================================
-- 主题（皮肤）从「一个租户一行」改成「一个账号一行」
-- 执行位置：CloudBase PostgreSQL 控制台 SQL 编辑器
-- ------------------------------------------------------------
-- 背景：以前主题存在 customers.theme（一个租户一行），
--       同公司的所有账号共用一套皮肤，换账号登录还是上一个人的配色。
--       现在存 users.theme，按 account 精确定位到本人。
--
-- 说明：
--   1) 不加默认值 —— 没设置过的账号读出来是 NULL，前端回落到默认主题（teal）
--   2) 前端已做降级：列不存在时只存浏览器本地，不会报错，所以打不执行都能上线
-- ============================================================

alter table public.users
  add column if not exists theme text;

comment on column public.users.theme is '个人皮肤（themes.js 里的 key，如 teal / navy / graphite），为空则用默认主题';

-- 让 PostgREST 立刻刷新 schema 缓存（不执行也能生效，只是可能延迟几秒）
notify pgrst, 'reload schema';

-- 可选：把老的主账号皮肤搬过来，避免用户升级后看到默认色
-- update public.users u
--    set theme = c.theme
--   from public.customers c
--  where u.account = c.phone
--    and u.theme is null
--    and c.theme is not null;
