-- ============================================================
-- 运营报表 · 车辆逐日统计缓存表
-- 日期：2026-10-18
-- 执行位置：CloudBase 控制台 → 数据库 → SQL 执行（PostgreSQL）
--
-- 为什么要这张表：
--   东风 tripAnalysisOil 只有「区间聚合」，没有逐日序列。
--   工作台首屏需要 150+ 次实时调用（40~60 秒），既慢又浪费接口配额。
--   改成：定时任务每天批量拉一次 → 落库 → 前端一次查询搞定。
--
-- 全部语句都是 IF NOT EXISTS，可重复执行。
-- ============================================================

CREATE TABLE IF NOT EXISTS vehicle_daily_stats (
  id            bigserial PRIMARY KEY,
  vin           text        NOT NULL,             -- 完整 VIN
  stat_date     date        NOT NULL,             -- 统计日期（车辆本地日）
  plate         text,                             -- 车牌（冗余，便于筛选/展示）
  org           text,                             -- 机构（冗余，便于按机构聚合）
  customer_id   text,                             -- 所属客户，用于隔离
  km            numeric(10,2),                    -- 行驶里程 km
  fuel          numeric(10,2),                    -- 行驶电耗 kWh
  rate          numeric(10,2),                    -- 百公里电耗 kWh/100km（fuel/km*100 现算）
  run_min       integer,                          -- 运行时长（分钟）
  off_min       integer,                          -- 下电时长（分钟）=(结束-开始)-运行
  avg_speed     numeric(6,1),                     -- 平均车速 km/h
  start_time    timestamptz,                      -- 运行开始
  end_time      timestamptz,                      -- 运行结束
  has_data      boolean     DEFAULT true,         -- false = 当天确实无运行（东风返回 code 3000）
  source        text        DEFAULT 'df',         -- df / manual
  synced_at     timestamptz DEFAULT now(),
  CONSTRAINT uq_vehicle_daily UNIQUE (vin, stat_date)
);

CREATE INDEX IF NOT EXISTS idx_vds_date       ON vehicle_daily_stats (stat_date);
CREATE INDEX IF NOT EXISTS idx_vds_vin_date   ON vehicle_daily_stats (vin, stat_date);
CREATE INDEX IF NOT EXISTS idx_vds_cust_date  ON vehicle_daily_stats (customer_id, stat_date);

COMMENT ON TABLE  vehicle_daily_stats IS '东风能耗逐日缓存：定时任务写入，运营报表只读';
COMMENT ON COLUMN vehicle_daily_stats.has_data IS 'false 表示当天无运行记录（接口返回 data:null），用于区分“没跑”和“没同步”';

-- 同步日志（可选，方便排查“为什么今天没数据”）
CREATE TABLE IF NOT EXISTS op_stats_sync_log (
  id           bigserial PRIMARY KEY,
  started_at   timestamptz DEFAULT now(),
  finished_at  timestamptz,
  date_from    date,
  date_to      date,
  vehicles     integer     DEFAULT 0,
  ok_count     integer     DEFAULT 0,
  fail_count   integer     DEFAULT 0,
  note         text
);

-- 说明：本项目其余业务表未启用 RLS，这里保持一致；
--       写入走 Edge Function 的 service_role，前端只用 anon key 读。

-- ============================================================
-- 定时同步（二选一）
-- ------------------------------------------------------------
-- 方式 A：Supabase 控制台 → Edge Functions → op-stats-sync → Schedules
--         新建一条：Cron = "0 6 * * *"（每天 06:00），Body = {"days": 2}
--
-- 方式 B：pg_cron + pg_net（把下面的 project-ref 和 service_role 换掉）
-- ============================================================
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- select cron.schedule(
--   'op-stats-sync',
--   '0 6 * * *',
--   $$
--     select net.http_post(
--       url     := 'https://<project-ref>.supabase.co/functions/v1/op-stats-sync',
--       headers := jsonb_build_object(
--                    'Content-Type','application/json',
--                    'Authorization','Bearer <SERVICE_ROLE_KEY>'
--                  ),
--       body    := jsonb_build_object('days', 2)
--     );
--   $$
-- );

-- ============================================================
-- 部署清单
-- 1) 执行本文件（建表）
-- 2) supabase functions deploy op-stats-sync --no-verify-jwt=false
-- 3) 配置 Secrets：DONGFENG_TOKEN（可选，默认已内置兜底 token）
-- 4) 手动跑一次：POST /functions/v1/op-stats-sync  { "days": 3 }
-- 5) 配定时任务（方式 A 或 B）
-- 6) 前端「同步数据」按钮也可随时手动补数据
-- ============================================================
