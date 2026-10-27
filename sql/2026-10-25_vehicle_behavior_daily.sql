-- ============================================================
-- 车辆驾驶行为日汇总（大屏用）
-- 由云函数 behaviorStatsSync 每日写入；大屏只读，不在前端跑轨迹。
-- 超速阈值 / 停留时长取自 ele_fence_alerts 的提醒配置。
-- ============================================================

create table if not exists public.vehicle_behavior_daily (
  id              bigserial primary key,
  vin             text not null,
  stat_date       date not null,
  plate           text,
  org             text,
  customer_id     text,
  owner_account   text,

  -- 超速
  overspeed_segments   integer default 0,        -- 超速段数
  overspeed_points     integer default 0,        -- 超速轨迹点数
  overspeed_max_speed  numeric(8,2),             -- 段内最高速度 km/h
  overspeed_seconds    integer default 0,        -- 超速累计秒数

  -- 停留
  stay_count      integer default 0,             -- 超过阈值的停留次数
  stay_max_min    integer default 0,             -- 最长停留（分钟）
  stay_total_min  integer default 0,             -- 累计停留（分钟）

  max_speed       numeric(8,2),                  -- 当日最高速度（不限阈值）
  track_points    integer default 0,
  has_data        boolean default false,
  source          text default 'df',
  updated_at      timestamptz default now()
);

-- 一车一天一行，云函数按这个唯一键 upsert
create unique index if not exists uq_behavior_vin_date
  on public.vehicle_behavior_daily (vin, stat_date);

create index if not exists idx_behavior_date
  on public.vehicle_behavior_daily (stat_date desc);

create index if not exists idx_behavior_customer
  on public.vehicle_behavior_daily (customer_id, stat_date desc);

-- ⭐ Web 走匿名登录（anon），不授权会出现「SELECT 返回 0 条、写入被拒」
grant select, insert, update, delete on public.vehicle_behavior_daily to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

select pg_notify('pgrst', 'reload schema');
