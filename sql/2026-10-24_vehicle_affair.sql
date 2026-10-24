-- ============================================================
-- 车务管理 · 证件到期提醒 + 消息中心
-- 日期：2026-10-24
-- 执行位置：CloudBase 控制台 → 数据库 → SQL 执行（PostgreSQL）
--
-- 内容：
--   ① vehicle_certs   车辆证件（一车多行：行驶证/营运证/交强/商业/超赔/保养）
--   ② reminders       提醒事项（待办，自动 + 人工）
--   ③ notices         消息通知（只读：围栏/系统/审批结果）
--   ④ vehicles 补 4 个纯档案字段
--   ⑤ v_vehicle_export 宽表视图（一行一车 40 列，导入导出都用它）
--
-- ⚠️ 本脚本已包含授权段（Web 端匿名登录 anon 必须能读写），一次跑完即可。
-- ⚠️ 全部语句可重复执行（IF NOT EXISTS / OR REPLACE）。
-- ⚠️ owner_account 是租户隔离键；customer_id 是整数，统一存 text。
-- ============================================================

-- ------------------------------------------------------------
-- ① 车辆证件（一车多行）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehicle_certs (
  id                    bigserial PRIMARY KEY,
  vehicle_id            text,                          -- vehicles.id（类型不定，统一 text）
  plate                 text NOT NULL,                 -- 车牌号（与 vehicles.plate 对齐）
  org                   text,                          -- 所属机构/车队（冗余，列表筛选快）
  owner_account         varchar(64),                   -- 租户（主账号）；平台建的为 NULL
  customer_id           text,                          -- customers.id（整数，存 text）

  cert_type             text NOT NULL,                 -- 见 CHECK
  cert_no               text,                          -- 行驶证号 / 营运证号 / 保单号
  issuer                text,                          -- 发证机关 / 保险公司
  start_date            date,                          -- 起期（保养 = 最近保养日期）
  expire_date           date,                          -- 到期日（保养 = 下次保养日）

  remind_enabled        boolean NOT NULL DEFAULT true,
  remind_days           int[]   NOT NULL DEFAULT '{30}',  -- 90/30/15/7/3 多选

  last_maintain_date    date,                          -- 保养专用
  last_maintain_km      int,                           -- 保养专用：上次保养里程
  maintain_interval_km  int DEFAULT 10000,             -- 保养专用：间隔里程

  remark                text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vehicle_certs_type_chk CHECK (cert_type IN
    ('driving', 'transport', 'jq_insurance', 'sy_insurance', 'excess_insurance', 'maintain'))
);

-- ⭐ 幂等键：同一车同一证件只有一条，重复导入 = 覆盖，不会变多条
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_certs_plate_type
  ON public.vehicle_certs (plate, cert_type);

CREATE INDEX IF NOT EXISTS idx_vehicle_certs_expire  ON public.vehicle_certs (expire_date);
CREATE INDEX IF NOT EXISTS idx_vehicle_certs_owner   ON public.vehicle_certs (owner_account, cert_type);
CREATE INDEX IF NOT EXISTS idx_vehicle_certs_org     ON public.vehicle_certs (org);

COMMENT ON TABLE  public.vehicle_certs                IS '车辆证件与保险：一车多行，一行一个证件';
COMMENT ON COLUMN public.vehicle_certs.cert_type       IS 'driving 行驶证 / transport 营运证 / jq_insurance 交强险 / sy_insurance 商业险 / excess_insurance 超赔险 / maintain 保养';
COMMENT ON COLUMN public.vehicle_certs.remind_days     IS '提前提醒节点（天），可多选 90/30/15/7/3，默认 {30}';
COMMENT ON COLUMN public.vehicle_certs.expire_date     IS '到期日：提醒的唯一日期依据；保养为下次保养日';
COMMENT ON COLUMN public.vehicle_certs.last_maintain_km IS '上次保养里程（km），保养按里程提醒时用';

-- ------------------------------------------------------------
-- ② 提醒事项（待办）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reminders (
  id                bigserial PRIMARY KEY,
  reminder_no       text UNIQUE,                   -- TX20261024-0007

  biz_type          text NOT NULL DEFAULT 'vehicle_cert',
  cert_id           bigint,                        -- vehicle_certs.id
  cert_type         text,
  vehicle_id        text,
  plate             text,
  org               text,
  owner_account     varchar(64),
  customer_id       text,

  due_date          date,                          -- 证件到期日（保养按里程时为空）
  due_mileage_km    int,                           -- 保养里程型：到期时的里程读数
  level             text,                          -- 快到期 / 临近 / 已逾期
  title             text NOT NULL,
  content           text,

  source            text NOT NULL DEFAULT 'auto',  -- auto 自动 / manual 人工
  receiver_scope    text NOT NULL DEFAULT 'tenant',-- tenant 租户 / platform 管理端
  remind_days       int[],                         -- 生成时快照，便于回溯
  remind_date       date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::date,
  next_remind_at    timestamptz,                   -- 下次提醒时间（用户可改）
  snooze_until      timestamptz,                   -- 「今天不再问」

  status            text NOT NULL DEFAULT '待处理', -- 待处理 / 已处理 / 已忽略
  handle_action     text,                          -- renew 更新到期日 / cancel 取消 / ignore 忽略
  handled_by        text,
  handled_at        timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ⭐ 幂等键：同一证件 + 同一到期日 + 同一级别 + 同一天，只允许一条
CREATE UNIQUE INDEX IF NOT EXISTS uq_reminders_idem
  ON public.reminders (cert_id, due_date, level, remind_date);

CREATE INDEX IF NOT EXISTS idx_reminders_owner  ON public.reminders (owner_account, status);
CREATE INDEX IF NOT EXISTS idx_reminders_next   ON public.reminders (next_remind_at);
CREATE INDEX IF NOT EXISTS idx_reminders_plate  ON public.reminders (plate);
CREATE INDEX IF NOT EXISTS idx_reminders_scope  ON public.reminders (receiver_scope, status);

COMMENT ON TABLE  public.reminders                IS '提醒事项（待办）：证件到期自动生成，也可人工添加';
COMMENT ON COLUMN public.reminders.level          IS '快到期（命中勾选节点）/ 临近（剩余≤3天）/ 已逾期（<0天）';
COMMENT ON COLUMN public.reminders.receiver_scope IS 'tenant=主账号与车务管理员；platform=管理端';
COMMENT ON COLUMN public.reminders.status         IS '待处理 / 已处理（renew）/ 已忽略（cancel）';

-- ------------------------------------------------------------
-- ③ 消息通知（只读，不做待办）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notices (
  id                bigserial PRIMARY KEY,
  type              text NOT NULL,                 -- cert / fence / fee / system
  level             text DEFAULT 'info',           -- info / warn / danger
  title             text NOT NULL,
  content           text,
  link              text,                          -- 点击跳转的前端路径
  receiver_scope    text NOT NULL DEFAULT 'tenant',
  receiver_account  varchar(64),
  read_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notices_recv ON public.notices (receiver_account, read_at);
CREATE INDEX IF NOT EXISTS idx_notices_scope ON public.notices (receiver_scope, created_at DESC);

COMMENT ON TABLE public.notices IS '消息中心通知：围栏提醒 / 系统公告 / 审批结果，只读';

-- ------------------------------------------------------------
-- ④ vehicles 补 4 个纯档案字段
-- ------------------------------------------------------------
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS engine_no           text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS first_register_date date;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS owner_name          text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS biz_status          text;

COMMENT ON COLUMN public.vehicles.engine_no           IS '发动机号（档案信息，不参与提醒）';
COMMENT ON COLUMN public.vehicles.first_register_date IS '初次登记日期（≠ purchase_date 购买日）';
COMMENT ON COLUMN public.vehicles.owner_name          IS '车主姓名（挂靠车必填）';
COMMENT ON COLUMN public.vehicles.biz_status          IS '营运状态：营运 / 停运 / 报废';

-- ------------------------------------------------------------
-- ⑤ 宽表视图：一行一车（导入导出 / 列表都用它）
--    ⭐ 40 列，分组顺序：车辆信息 → 行驶证 → 营运证 → 交强 → 商业 → 超赔 → 保养 → 提醒
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_vehicle_export AS
SELECT
  v.*,

  dr.cert_no      AS driving_no,
  dr.expire_date  AS driving_expire,
  dr.remind_days  AS driving_remind,

  tr.cert_no      AS transport_no,
  tr.start_date   AS transport_start,
  tr.expire_date  AS transport_expire,
  tr.remind_days  AS transport_remind,

  jq.cert_no      AS jq_no,
  jq.start_date   AS jq_start,
  jq.expire_date  AS jq_end,
  jq.remind_days  AS jq_remind,

  sy.cert_no      AS sy_no,
  sy.start_date   AS sy_start,
  sy.expire_date  AS sy_end,
  sy.remind_days  AS sy_remind,

  ex.cert_no      AS excess_no,
  ex.start_date   AS excess_start,
  ex.expire_date  AS excess_end,
  ex.remind_days  AS excess_remind,

  mt.last_maintain_date   AS maintain_date,
  mt.last_maintain_km     AS maintain_km,
  mt.maintain_interval_km AS maintain_interval,
  mt.expire_date          AS maintain_expire,
  mt.remind_days          AS maintain_remind

FROM public.vehicles v
LEFT JOIN public.vehicle_certs dr ON dr.plate = v.plate AND dr.cert_type = 'driving'
LEFT JOIN public.vehicle_certs tr ON tr.plate = v.plate AND tr.cert_type = 'transport'
LEFT JOIN public.vehicle_certs jq ON jq.plate = v.plate AND jq.cert_type = 'jq_insurance'
LEFT JOIN public.vehicle_certs sy ON sy.plate = v.plate AND sy.cert_type = 'sy_insurance'
LEFT JOIN public.vehicle_certs ex ON ex.plate = v.plate AND ex.cert_type = 'excess_insurance'
LEFT JOIN public.vehicle_certs mt ON mt.plate = v.plate AND mt.cert_type = 'maintain';

COMMENT ON VIEW public.v_vehicle_export IS '车辆档案宽表：一行一车，导入导出与列表共用；只读';

-- ------------------------------------------------------------
-- ⑥ 车务提醒设置（每租户一条）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehicle_affair_settings (
  id                   bigserial PRIMARY KEY,
  owner_account        varchar(64) NOT NULL UNIQUE,   -- 租户主账号
  remind_hour          smallint NOT NULL DEFAULT 9,   -- 每天几点提醒
  weekend              boolean  NOT NULL DEFAULT true,-- 周末是否提醒
  receivers            jsonb    NOT NULL DEFAULT '{"master":true,"admins":[],"platform":false}'::jsonb,
  default_days         jsonb    NOT NULL DEFAULT '{}'::jsonb,  -- cert_type -> int[]
  maintain_interval_km int      NOT NULL DEFAULT 10000,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.vehicle_affair_settings IS '车务提醒全局设置：提醒时间、接收人、各类证件默认提醒节点';

-- ------------------------------------------------------------
-- ⑦ 授权（必须，Web 端是匿名登录 anon 角色）
-- ------------------------------------------------------------
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'authenticator']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_certs TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminders TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.notices TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_affair_settings TO %I', r);
      EXECUTE format('GRANT SELECT ON public.v_vehicle_export TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.vehicle_certs_id_seq TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.reminders_id_seq TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.notices_id_seq TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.vehicle_affair_settings_id_seq TO %I', r);
      EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', r);
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.vehicle_certs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notices        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_affair_settings DISABLE ROW LEVEL SECURITY;

SELECT pg_notify('pgrst', 'reload schema');

-- ------------------------------------------------------------
-- ⑧ 自检（跑完看这几行，应该全部有值）
-- ------------------------------------------------------------
SELECT 'vehicle_certs' AS obj, count(*) AS rows FROM public.vehicle_certs
UNION ALL SELECT 'reminders', count(*) FROM public.reminders
UNION ALL SELECT 'notices',   count(*) FROM public.notices
UNION ALL SELECT 'v_vehicle_export', count(*) FROM public.v_vehicle_export;
