/* ============================================================
   小程序遥控数据大屏 · 建表脚本
   执行方式：CloudBase 控制台 → 数据库 → SQL 编辑器，整段执行
   执行后必须看到最后的 pg_notify 无报错，否则 PostgREST 的 schema 缓存不刷新，
   会出现「SELECT 通、INSERT 被拒」的怪现象。
   ============================================================ */

-- ① 屏幕注册表：一块物理屏一行（浏览器 localStorage 里的 screen_id 唯一）
CREATE TABLE IF NOT EXISTS screen_devices (
  id             bigserial PRIMARY KEY,
  -- ⚠️ tenant 是「主账号 account」，与 ai-gateway 的 ctx.tenant 完全同口径。
  --    绝不是 customers.id（那是 integer），也不要写成 owner_account 之外的任何东西。
  tenant         text        NOT NULL,
  screen_id      text        NOT NULL,                 -- scr_xxxxxxxx，浏览器生成后固定
  name           text        NOT NULL DEFAULT '数据大屏', -- 会议室大屏 / 展厅大屏
  kind           text        NOT NULL DEFAULT 'fleet',  -- fleet | fee（初始进入的页）
  current_page   text        NOT NULL DEFAULT 'fleet',  -- 大屏此刻停在哪一页
  holder         text,                                  -- 当前接管人 account，NULL = 无人接管
  holder_name    text,
  holder_at      timestamptz,
  last_seen      timestamptz,                           -- 每次 pull 刷新；>30s 视为离线
  pair_code      text,                                  -- 兜底：跨账号配对码（本期不用）
  pair_expire    timestamptz,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (tenant, screen_id)
);

-- ② 指令队列：一条指令一行，大屏取走并回写 ack
CREATE TABLE IF NOT EXISTS screen_commands (
  id              bigserial PRIMARY KEY,
  command_id      text        NOT NULL UNIQUE,          -- uuid，前端幂等键
  tenant          text        NOT NULL,
  screen_id       text        NOT NULL,
  action          text        NOT NULL,                 -- 见 guard 的动作白名单
  payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status          text        NOT NULL DEFAULT 'pending', -- pending|consumed|expired|failed
  source          text        NOT NULL DEFAULT 'miniprogram',
  created_by      text,
  created_by_name text,
  created_at      timestamptz DEFAULT now(),
  expires_at      timestamptz NOT NULL,                 -- created_at + 60s，过期不执行
  consumed_at     timestamptz,
  ack             jsonb
);

-- 拉取用：同屏同状态按时间倒序
CREATE INDEX IF NOT EXISTS idx_screen_cmd_pull
  ON screen_commands (tenant, screen_id, status, created_at DESC);

-- 清理用：按时间删旧记录
CREATE INDEX IF NOT EXISTS idx_screen_cmd_time
  ON screen_commands (created_at DESC);

-- ============================================================
-- 授权段（缺了会出现：SELECT 返回 0 行不报错、INSERT 300 权限不足）
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON screen_devices  TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON screen_commands TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE screen_devices_id_seq  TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE screen_commands_id_seq TO anon, authenticated;

-- ============================================================
-- 刷新 PostgREST 的 schema 缓存（必须执行）
-- ============================================================
SELECT pg_notify('pgrst', 'reload schema');

-- ============================================================
-- 自检（可选，执行后应返回两行表名）
-- ============================================================
-- SELECT table_name FROM information_schema.tables
--  WHERE table_name IN ('screen_devices','screen_commands');
