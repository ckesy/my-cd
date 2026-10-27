-- ============================================================
-- 大屏统计表 · 写权限补齐
-- ============================================================
-- 现象：云函数 opStatsSync（HTTP 调用）报
--   permission denied for table vehicle_daily_stats / 42501
-- 原因：vehicle_daily_stats 建表时漏了授权段，只有建表角色能写。
--       云函数用定时触发器跑（系统身份）时能写，走 HTTP 访问服务调用时是匿名身份，
--       于是「补历史数据」这条路径一直失败。
--
-- 执行：CloudBase 控制台 → 数据库 → SQL 编辑器，整段执行一次即可。
-- ============================================================

grant select, insert, update, delete on public.vehicle_daily_stats    to anon, authenticated;
grant select, insert, update, delete on public.vehicle_behavior_daily to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

select pg_notify('pgrst', 'reload schema');
