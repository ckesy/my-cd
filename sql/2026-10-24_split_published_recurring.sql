-- ============================================================
-- 2026-10-24 拆分「Web 连续发布」造成的同组多趟
-- ------------------------------------------------------------
-- 背景：以前从「创建相同运单」发布常驻任务时，会沿用旧分组号、
--       把自己变成"第 N 趟"（trip_seq = 2、3、4…）。
--       用户定稿：**每次发布都是一个独立的常驻运单**（新组号）；
--       同一常驻运单下的多趟只能由司机在小程序「接一趟」产生。
--
-- 本脚本把「发布产生、且从未被司机接过」的趟次拆成独立运单：
--   · trip_seq > 1
--   · accept_time IS NULL（司机没接过）
--   · status IN ('待接单','已取消')（还没进入运输流程）
--   · 最近 3 天（避免动到历史老数据，需要更早请自行调整）
--
-- ⚠️ 执行前先跑下面的「预览」确认影响范围；确认无误再跑 UPDATE。
-- ============================================================

-- ① 预览：会被拆成独立运单的趟次
SELECT id, waybill_no, recurring_group_no, trip_seq, status, create_time
FROM waybills
WHERE is_recurring
  AND trip_seq > 1
  AND accept_time IS NULL
  AND status IN ('待接单', '已取消')
  AND create_time >= now() - interval '3 days'
ORDER BY create_time;

-- ② 执行拆分：组号换成自己的单号（CZ + 单号后 12 位），trip_seq 归 1
UPDATE waybills
SET recurring_group_no = 'CZ' || substring(waybill_no from 3),
    trip_seq = 1
WHERE is_recurring
  AND trip_seq > 1
  AND accept_time IS NULL
  AND status IN ('待接单', '已取消')
  AND create_time >= now() - interval '3 days';

-- ③ 校验：拆分后每个组应该只剩 1 条（除非司机真的接过）
SELECT recurring_group_no, count(*) AS n, min(trip_seq) AS min_seq, max(trip_seq) AS max_seq
FROM waybills
WHERE is_recurring
GROUP BY recurring_group_no
HAVING count(*) > 1
ORDER BY recurring_group_no;

SELECT pg_notify('pgrst', 'reload schema');
