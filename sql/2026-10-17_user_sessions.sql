-- ============================================================
-- 迁移：小程序单设备登录（顶号）
-- 日期：2026-10-17
-- 执行位置：CloudBase 控制台 → 数据库 → SQL 执行（PostgreSQL）
--
-- 一个 account 一行 = 一个「当前有效会话」。最后一次登录写入的 token 生效，
-- 老设备心跳时 token 不匹配 → 被顶下线并提示「该账号已在其他设备登录」。
--
-- ⚠️ 不执行本脚本也能跑：login-by-account / session-guard 都会降级成「不限制设备」，
--    只是顶号功能不生效（日志里会打 user_sessions 不存在）。
--
-- 全部语句可重复执行。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_sessions (
  account       varchar(64)  PRIMARY KEY,
  platform      varchar(16)  NOT NULL DEFAULT 'miniprogram',
  token         varchar(64)  NOT NULL,
  device_id     varchar(64)  DEFAULT '',
  device_label  varchar(120) DEFAULT '',
  login_at      timestamptz  NOT NULL DEFAULT now(),
  last_seen     timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.user_sessions            IS '小程序/端上登录会话（一个账号一行，最后一次登录生效）';
COMMENT ON COLUMN public.user_sessions.token      IS '登录时生成，只回给登录的那台设备；心跳比对用';
COMMENT ON COLUMN public.user_sessions.device_id  IS '客户端安装级 UUID（不是微信设备号，微信拿不到）';
COMMENT ON COLUMN public.user_sessions.device_label IS '机型 + 微信版本，用来提示「谁顶了你」';
COMMENT ON COLUMN public.user_sessions.last_seen  IS '最后心跳时间（120s 节流写入），仅供排查';

/* 按需清理僵尸会话（可选） */
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_seen ON public.user_sessions (last_seen);

-- ------------------------------------------------------------
-- 权限 / RLS：云函数走匿名 token（anon），必须放行，否则心跳一律查不到行
-- ------------------------------------------------------------
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_sessions_all ON public.user_sessions;
CREATE POLICY user_sessions_all ON public.user_sessions
  FOR ALL USING (true) WITH CHECK (true);

-- 给网关实际使用的数据库角色授权（角色名各环境不同，只授存在的）
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'authenticator']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sessions TO %I', r
      );
    END IF;
  END LOOP;
END $$;

-- 让 PostgREST 立刻感知新表（没有监听者也不会报错）
SELECT pg_notify('pgrst', 'reload schema');
