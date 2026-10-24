-- ============================================================
-- 维保台账（维修 / 保养 / 轮胎）
-- 日期：2026-10-25
-- 执行位置：CloudBase 控制台 → 数据库 → SQL 执行（PostgreSQL）
--
-- 口径：
--   ① 一张表 + kind 区分三类，不建三张表（tab 只是过滤、时间轴一次查询）
--   ② 保养**不存 next_mileage/next_date**：下次保养由车务 vehicle_certs(maintain)
--      的 maintain_interval_km 推算；保存保养记录时要回写车务（前端 syncMaintainToCert）
--   ③ 金额只记事实；审批与付款仍走「费用管理」的 reports
--   ④ items / images 存快照，改字典不影响历史
-- ============================================================

CREATE TABLE IF NOT EXISTS public.maintenance_records (
  id              bigserial PRIMARY KEY,
  owner_account   varchar(64),
  customer_id     text,
  vehicle_id      text,                    -- vehicles.id（类型不定，统一 text）
  plate           text NOT NULL,
  org             text,

  kind            text NOT NULL,           -- repair 维修 / service 保养 / tire 轮胎
  happen_at       date NOT NULL,           -- 作业日期
  mileage         int,                     -- 作业时表显里程
  amount          numeric(12,2) DEFAULT 0,
  vendor          text,                    -- 自营 / 修理厂名
  vendor_type     text,                    -- self | out

  -- 维修
  fault_desc      text,
  repair_desc     text,
  category        text,                    -- 机修/电修/钣金/事故/三电/其他

  -- 保养
  service_level   text,                    -- daily | level1 | level2
  items           jsonb,                   -- ["换齿轮油","四轮保养"]
  maintain_interval_km int,                -- 本次填了就回写车务，没填沿用原值

  -- 轮胎
  tire_action     text,                    -- 装胎/换胎/补胎/换位/报废
  tire_pos        text,                    -- 左前/右前/左后内/左后外/...（多选用逗号）
  tire_no         text,
  tire_brand      text,
  tire_spec       text,
  tread_mm        numeric(4,1),

  -- 通用
  images          jsonb,                   -- [{key,name,size}]
  remark          text,
  status          text DEFAULT 'done',     -- doing 待修 / done 已完工
  inspection_id   bigint,                  -- 来自外观巡检
  report_id       bigint,                  -- 关联的费用上报
  created_by      text,
  create_time     timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT maintenance_kind_chk CHECK (kind IN ('repair', 'service', 'tire'))
);

CREATE INDEX IF NOT EXISTS idx_mt_owner_time ON public.maintenance_records (owner_account, happen_at DESC);
CREATE INDEX IF NOT EXISTS idx_mt_plate_time ON public.maintenance_records (plate, happen_at DESC);
CREATE INDEX IF NOT EXISTS idx_mt_kind       ON public.maintenance_records (owner_account, kind, happen_at DESC);

COMMENT ON TABLE  public.maintenance_records            IS '维保台账：一行一次作业（维修/保养/轮胎）';
COMMENT ON COLUMN public.maintenance_records.kind       IS 'repair 维修 / service 保养 / tire 轮胎';
COMMENT ON COLUMN public.maintenance_records.happen_at  IS '作业日期';
COMMENT ON COLUMN public.maintenance_records.items      IS '保养项目快照（jsonb 数组）';
COMMENT ON COLUMN public.maintenance_records.images     IS '照片 [{key,name,size}]，走 COS，展示前换临时链接';
COMMENT ON COLUMN public.maintenance_records.status     IS 'doing 待修 / done 已完工；台账录入默认 done';

-- 授权（Web 是匿名登录 anon；漏了这段会 42501）
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'authenticator']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_records TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.maintenance_records_id_seq TO %I', r);
      EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', r);
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.maintenance_records DISABLE ROW LEVEL SECURITY;

SELECT pg_notify('pgrst', 'reload schema');

-- 自检
-- SELECT kind, count(*), sum(amount) FROM public.maintenance_records GROUP BY kind;
