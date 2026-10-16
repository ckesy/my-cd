-- ============================================================
-- 迁移：常驻任务 + 运输节点模式 + 运单节点时间 + 状态流转日志
-- 日期：2026-10-16
-- 执行位置：CloudBase 控制台 → 数据库 → SQL 执行（PostgreSQL）
--
-- ⚠️ 必须先执行本脚本，再发布运单，否则：
--    - 常驻任务字段写入失败（前端已做降级，但功能不可用）
--    - 运输节点模式 / 打卡开关无法保存
--    - 「物流状态」时间轴的节点时间全为空
--
-- 全部语句都是 IF NOT EXISTS，可以重复执行。
--
-- 影响范围（共 30 个新字段 + 1 个索引）：
--   1) 「常驻任务」8 个
--   2) 「节点时间」9 个
--   3) 「运输节点模式 / 打卡开关」5 个
--   4) 「计划里程 / 起终点坐标 / 趟次」7 个
--   5) status_log（状态流转日志，供时间轴兜底与展示操作人）
-- ============================================================

ALTER TABLE waybills
  -- ---------- 常驻任务 ----------
  ADD COLUMN IF NOT EXISTS is_recurring            boolean      DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_group_no      text,
  ADD COLUMN IF NOT EXISTS recurring_type          text,
  ADD COLUMN IF NOT EXISTS recurring_start_time    timestamptz,
  ADD COLUMN IF NOT EXISTS recurring_end_time      timestamptz,
  ADD COLUMN IF NOT EXISTS recurring_max_count     integer,
  ADD COLUMN IF NOT EXISTS recurring_accepted_count integer     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recurring_status        text,

  -- ---------- 节点时间（物流状态时间轴的数据源） ----------
  ADD COLUMN IF NOT EXISTS accept_time      timestamptz,
  ADD COLUMN IF NOT EXISTS accept_by        text,
  ADD COLUMN IF NOT EXISTS load_start_time  timestamptz,
  ADD COLUMN IF NOT EXISTS load_end_time    timestamptz,
  ADD COLUMN IF NOT EXISTS depart_time      timestamptz,
  ADD COLUMN IF NOT EXISTS arrive_time      timestamptz,
  ADD COLUMN IF NOT EXISTS finish_time      timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_time      timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason    text,

  -- ---------- 运输节点模式 ----------
  ADD COLUMN IF NOT EXISTS transport_mode   text         DEFAULT '详细',
  -- '极简'：接单 → 完成运单          （只有 2 步）
  -- '详细'：接单 → 装车完成 → 确认发车 → 确认到达 → 完成运单
  ADD COLUMN IF NOT EXISTS check_in_required boolean     DEFAULT true,
  -- 是否要求装卸货地打卡（只有 transport_mode='详细' 才有意义）
  -- 详情页可以「临时关闭」，用于司机到了现场却打不了卡的兜底
  ADD COLUMN IF NOT EXISTS check_in_off_by     text,
  ADD COLUMN IF NOT EXISTS check_in_off_time   timestamptz,
  ADD COLUMN IF NOT EXISTS check_in_off_remark text,

  -- ---------- 计划里程 / 起终点坐标 / 趟次 ----------
  ADD COLUMN IF NOT EXISTS plan_distance  numeric(10,2),
  -- 发布时用高德驾车规划算一次的总里程（km）。
  -- 「剩余里程 = plan_distance − 已行驶里程」，刷新时不再调高德。
  ADD COLUMN IF NOT EXISTS plan_duration  integer,
  -- 计划总时长（分钟），同一次规划返回。
  ADD COLUMN IF NOT EXISTS pickup_lng     numeric(10,6),
  ADD COLUMN IF NOT EXISTS pickup_lat     numeric(10,6),
  ADD COLUMN IF NOT EXISTS delivery_lng   numeric(10,6),
  ADD COLUMN IF NOT EXISTS delivery_lat   numeric(10,6),
  -- 起终点坐标来自「装/卸货地围栏中心」（ele_fences.center），
  -- 发布时落库，避免每次刷新都按围栏名反查。
  ADD COLUMN IF NOT EXISTS trip_seq       integer,
  -- 同一常驻任务（recurring_group_no）内的第几趟，从 1 开始。

  -- ---------- 状态流转日志 ----------
  ADD COLUMN IF NOT EXISTS status_log       jsonb        DEFAULT '[]'::jsonb;

-- ------------------------------------------------------------
-- 字段口径说明
-- ------------------------------------------------------------
-- recurring_type             'time' | 'count'
--                            time  = 按常驻时间，时间窗内接单次数不限
--                            count = 按接单次数，接满 recurring_max_count 次后不再可接
-- recurring_group_no         常驻任务编号（CZ+年月日+4位序号），同一常驻任务的多条运输
--                            记录共享该编号，是「一个任务多条运输记录」的关联键
-- recurring_accepted_count   该常驻任务累计被接单次数（跨多条运输记录累加）
-- recurring_status           '生效中' | '已结束' | '已停用'
-- status_log                 [{"status":"待装车","time":"2026-10-16T09:12:00Z",
--                              "operator":"李亚楠","account":"15035660050","remark":""}]
--                            append-only，由云函数 waybill-action 写入
--
-- 节点 ↔ 字段对应关系
--   待接单   → create_time
--   已接单   → accept_time（同时写入 accept_by）
--   待装车   → accept_time（接单后即进入待装车）
--   装车中   → load_start_time（历史流程遗留，新流程不再产生该状态）
--   装车完成 → load_end_time   ←「详细」模式打卡点，校验【装货地】围栏
--   已发车   → depart_time
--   已到达   → arrive_time     ←「详细」模式打卡点，校验【卸货地】围栏
--   已完成   → finish_time     ←「完成运单」
--   已取消   → cancel_time + cancel_reason
--   待重新指派 → reject_time + reject_reason + reject_by（字段已存在）
--
-- transport_mode 与可用动作集
--   极简：accept(接单) → finish(完成运单)
--   详细：accept → confirmLoad(装车完成) → confirmDepart(确认发车)
--                → confirmArrive(确认到达) → finish(完成运单)
--
-- check_in_required = true 时，「装车完成」「确认到达」必须车辆在对应围栏内才允许打卡。
-- 现状打不了卡时，Web 端运单详情页可临时把 check_in_required 置为 false，
-- 并写入 check_in_off_by / check_in_off_time / check_in_off_remark 留痕。

-- ------------------------------------------------------------
-- 索引：物流状态页按常驻任务分组查询运输记录
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_waybills_recurring_group_no
  ON waybills (recurring_group_no)
  WHERE recurring_group_no IS NOT NULL;

-- ------------------------------------------------------------
-- 表级权限（与现有表保持一致，见 开发规范.md §6.3）
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON waybills TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

-- ------------------------------------------------------------
-- 校验：执行完可跑一下，应返回 30 行
-- ------------------------------------------------------------
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'waybills'
--   AND column_name IN (
--     'is_recurring','recurring_group_no','recurring_type','recurring_start_time',
--     'recurring_end_time','recurring_max_count','recurring_accepted_count','recurring_status',
--     'accept_time','accept_by','load_start_time','load_end_time','depart_time',
--     'arrive_time','finish_time','cancel_time','cancel_reason',
--     'transport_mode','check_in_required','check_in_off_by','check_in_off_time',
--     'check_in_off_remark',
--     'plan_distance','plan_duration','pickup_lng','pickup_lat',
--     'delivery_lng','delivery_lat','trip_seq','status_log'
--   )
-- ORDER BY column_name;
