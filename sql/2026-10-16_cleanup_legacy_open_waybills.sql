-- ============================================================
-- 历史遗留「未结束」运单 —— 诊断 + 清理
-- 日期：2026-10-16
-- 执行位置：CloudBase 控制台 → 数据库 → SQL 执行（PostgreSQL）
--
-- ⚠️⚠️ 本脚本第 3 步是**生产数据的写操作**，会改运单状态，不可逆（除恢复备份）。
--   请务必按顺序执行：
--     第 1 步（只读诊断）→ 看清结果 →
--     第 2 步（备份）→
--     第 3 步（处置，语句默认是注释掉的，确认后才逐条放开）→
--     第 4 步（校验）
--
-- 为什么要清理：
--   waybill-action 新增了「同车 / 同司机并发拦截」——同一车牌或同一司机，
--   在同一客户范围内只能有一条「未结束」的运输记录。
--   历史上卡在 待接单 / 待装车 / 装车中 / 装车完成 / 已发车 / 已到达 的老单，
--   会把车辆和司机占住，导致司机接不了新单。
--
-- 「未结束」= status NOT IN ('已完成', '已取消')
-- ⚠️ 注意：「待重新指派」在云函数里**不占用**（已离开当前司机），
--    所以本脚本的 WHERE 条件用 NOT IN ('已完成','已取消') 会把它也算进来，
--    诊断时请留意，处置时可按需排除。
--
-- ⚠️ 前置条件：必须先执行
--    sql/2026-10-16_recurring_task_and_status_log.sql
--    否则 cancel_time / cancel_reason / status_log 这些列不存在。
-- ============================================================


-- ============================================================
-- 第 1 步：诊断（只读，先看清楚再动手）
-- ============================================================

-- 1.1 全部未结束的运单（按创建时间倒序，逐条确认哪些是真在跑、哪些是僵尸单）
SELECT
  waybill_no,
  status,
  owner_account,
  vehicle,
  driver,
  pickup,
  delivery,
  create_time,
  accept_time,
  depart_time,
  finish_time,
  CASE
    WHEN status = '待重新指派' THEN '不占用（已离开当前司机）'
    ELSE '占用车辆/司机'
  END AS occupied
FROM waybills
WHERE status NOT IN ('已完成', '已取消')
ORDER BY create_time DESC;


-- 1.2 被多条未结束单占用的车牌（并发规则的实际冲突点）
SELECT
  vehicle AS 车牌,
  COUNT(*) AS 未结束条数,
  string_agg(waybill_no, ', ' ORDER BY create_time) AS 运单号,
  MIN(create_time) AS 最早,
  MAX(create_time) AS 最晚
FROM waybills
WHERE status NOT IN ('已完成', '已取消')
  AND vehicle IS NOT NULL
  AND vehicle <> ''
  AND vehicle <> '多种'
  AND vehicle <> '--'
  AND vehicle !~ '^\d+辆$'
GROUP BY vehicle
HAVING COUNT(*) > 1
ORDER BY 未结束条数 DESC, 最晚 DESC;


-- 1.3 被多条未结束单占用的司机
SELECT
  driver AS 司机,
  COUNT(*) AS 未结束条数,
  string_agg(waybill_no, ', ' ORDER BY create_time) AS 运单号,
  MIN(create_time) AS 最早,
  MAX(create_time) AS 最晚
FROM waybills
WHERE status NOT IN ('已完成', '已取消')
  AND driver IS NOT NULL
  AND driver <> ''
  AND driver <> '多种'
  AND driver <> '--'
  AND driver !~ '^\d+人$'
GROUP BY driver
HAVING COUNT(*) > 1
ORDER BY 未结束条数 DESC, 最晚 DESC;


-- 1.4 汇总：一共多少条未结束单、涉及多少车牌与司机
SELECT
  COUNT(*) AS 未结束总条数,
  COUNT(DISTINCT vehicle) AS 涉及车牌数,
  COUNT(DISTINCT driver) AS 涉及司机数,
  MIN(create_time) AS 最早一单,
  MAX(create_time) AS 最晚一单
FROM waybills
WHERE status NOT IN ('已完成', '已取消');


-- 1.5 按状态分布（了解僵尸单集中卡在哪个环节）
SELECT status AS 状态, COUNT(*) AS 条数
FROM waybills
WHERE status NOT IN ('已完成', '已取消')
GROUP BY status
ORDER BY 条数 DESC;


-- ============================================================
-- 第 2 步：备份（必做，别跳）
-- ============================================================

CREATE TABLE IF NOT EXISTS waybills_backup_20261016 AS
SELECT * FROM waybills;

-- 备份行数应与原表一致
SELECT
  (SELECT COUNT(*) FROM waybills) AS 原表行数,
  (SELECT COUNT(*) FROM waybills_backup_20261016) AS 备份行数;

-- 恢复方式（真出问题时才用；先确认备份表还在）：
-- TRUNCATE waybills;
-- INSERT INTO waybills SELECT * FROM waybills_backup_20261016;


-- ============================================================
-- 第 3 步：处置 —— 三个方案，按需选一个，**默认全部注释**
--   确认第 1 步结果后，删掉对应语句行首的 "-- " 再执行
-- ============================================================

-- ------------------------------------------------------------
-- 方案 A：取消「指定日期之前、且从未被接单」的占位单
--   适用：老运单已经作废，只是没人去点取消。最保守的一档。
-- ------------------------------------------------------------
-- UPDATE waybills
-- SET status = '已取消',
--     cancel_time = now(),
--     cancel_reason = '历史遗留未结束单清理（并发规则上线）',
--     status_log = COALESCE(status_log, '[]'::jsonb) || jsonb_build_object(
--       'status', '已取消',
--       'time', to_char(now() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD"T"HH24:MI:SS'),
--       'operator', '系统清理',
--       'account', 'system',
--       'remark', '历史遗留未结束单清理（方案A：按日期 + 未接单）'
--     )
-- WHERE status NOT IN ('已完成', '已取消')
--   AND create_time < '2026-10-01'      -- ⭐ 改成你要的截止日期
--   AND accept_time IS NULL;            -- 从未接单，安全


-- ------------------------------------------------------------
-- 方案 B：同一车牌有多条未结束时，只保留「推进得最靠后」的那条，其余取消
--   保留优先级：已到达 > 已发车 > 装车完成 > 装车中 > 待装车 > 待接单
--   适用：确实有车在跑，但历史上遗留了重复单。
-- ------------------------------------------------------------
-- WITH ranked AS (
--   SELECT
--     id,
--     ROW_NUMBER() OVER (
--       PARTITION BY vehicle
--       ORDER BY
--         CASE status
--           WHEN '已到达'   THEN 1
--           WHEN '已发车'   THEN 2
--           WHEN '装车完成' THEN 3
--           WHEN '装车中'   THEN 4
--           WHEN '待装车'   THEN 5
--           WHEN '待接单'   THEN 6
--           ELSE 7
--         END,
--         create_time DESC
--     ) AS rn
--   FROM waybills
--   WHERE status NOT IN ('已完成', '已取消')
--     AND vehicle IS NOT NULL
--     AND vehicle <> ''
--     AND vehicle <> '多种'
--     AND vehicle <> '--'
--     AND vehicle !~ '^\d+辆$'
-- )
-- UPDATE waybills w
-- SET status = '已取消',
--     cancel_time = now(),
--     cancel_reason = '同车并发清理：仅保留推进最靠后的一条',
--     status_log = COALESCE(w.status_log, '[]'::jsonb) || jsonb_build_object(
--       'status', '已取消',
--       'time', to_char(now() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD"T"HH24:MI:SS'),
--       'operator', '系统清理',
--       'account', 'system',
--       'remark', '同车并发清理（方案B：同车牌仅保留一条）'
--     )
-- FROM ranked r
-- WHERE w.id = r.id
--   AND r.rn > 1;


-- ------------------------------------------------------------
-- 方案 C：按运单号逐条点名取消（最精确，推荐用这个收尾）
--   把第 1.1 / 1.2 步查出来的僵尸单号填进去
-- ------------------------------------------------------------
-- UPDATE waybills
-- SET status = '已取消',
--     cancel_time = now(),
--     cancel_reason = '历史遗留未结束单清理（逐条确认）',
--     status_log = COALESCE(status_log, '[]'::jsonb) || jsonb_build_object(
--       'status', '已取消',
--       'time', to_char(now() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD"T"HH24:MI:SS'),
--       'operator', '系统清理',
--       'account', 'system',
--       'remark', '逐条确认后取消'
--     )
-- WHERE waybill_no IN (
--   'YD202610160001',
--   'YD202610160002'
--   -- ⭐ 按需补充
-- );


-- ------------------------------------------------------------
-- 附：只想给「待重新指派」的老单收尾（这类不占用车辆/司机，可选做）
-- ------------------------------------------------------------
-- UPDATE waybills
-- SET status = '已取消',
--     cancel_time = now(),
--     cancel_reason = '历史待重新指派单归档（无人重新派单）',
--     status_log = COALESCE(status_log, '[]'::jsonb) || jsonb_build_object(
--       'status', '已取消',
--       'time', to_char(now() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD"T"HH24:MI:SS'),
--       'operator', '系统清理',
--       'account', 'system',
--       'remark', '历史待重新指派单归档'
--     )
-- WHERE status = '待重新指派'
--   AND reject_time < '2026-10-01';    -- ⭐ 改成你要的截止日期


-- ============================================================
-- 第 4 步：校验
-- ============================================================

-- 4.1 状态分布（看未结束的是否已清干净）
SELECT status AS 状态, COUNT(*) AS 条数
FROM waybills
GROUP BY status
ORDER BY 条数 DESC;

-- 4.2 再跑一次并发冲突检查，应返回 0 行
SELECT vehicle AS 车牌, COUNT(*) AS 未结束条数
FROM waybills
WHERE status NOT IN ('已完成', '已取消')
  AND vehicle IS NOT NULL
  AND vehicle <> ''
  AND vehicle <> '多种'
  AND vehicle <> '--'
  AND vehicle !~ '^\d+辆$'
GROUP BY vehicle
HAVING COUNT(*) > 1;

-- 4.3 确认备份表还在（清理完成后至少保留一段时间再删）
SELECT COUNT(*) AS 备份行数 FROM waybills_backup_20261016;


-- ============================================================
-- ⚠️ 最后提醒
--   1. 第 3 步执行前务必确认第 1 步结果里**没有一条是真在跑的**。
--      如果某辆车确实在路上，别取消它，让司机走完流程。
--   2. 备份表 waybills_backup_20261016 建议保留到确认业务正常后再删：
--      DROP TABLE waybills_backup_20261016;
--   3. 老运单的 plan_distance / plan_duration 为空，
--      「物流状态」的进度条会显示「缺少规划里程」。要补齐需按围栏坐标
--      逐单调高德算一次，属于另一件事，不在本脚本范围内。
-- ============================================================
