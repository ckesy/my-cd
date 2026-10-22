-- ============================================================
-- 电子围栏增加「围栏类型」字段（装货 / 卸货 / 提醒）
-- 2026-10-22
--
--   pickup   = 装货围栏（运单装货地）
--   delivery = 卸货围栏（运单卸货地）
--   alert    = 提醒围栏（只用于进出提醒，不进运单）
--
-- 设计说明：
--   1. 值存英文 key，中文只在页面上展示 —— 以后加类型或给小程序 / 大屏复用都不用改数据；
--   2. 历史数据统一刷成 alert（最安全的默认值：老围栏不会被误塞进运单的装货地/卸货地下拉）；
--   3. 列上给 DEFAULT 'alert'，避免旧版本前端（不带该字段）写入时报 not-null / null 脏数据。
-- ============================================================

-- 1. 加字段
ALTER TABLE public.ele_fences
  ADD COLUMN IF NOT EXISTS fence_type text DEFAULT 'alert';

COMMENT ON COLUMN public.ele_fences.fence_type IS '围栏类型：pickup=装货围栏 delivery=卸货围栏 alert=提醒围栏';

-- 2. 历史数据补默认值（只补空值，不动已有类型）
UPDATE public.ele_fences
SET fence_type = 'alert'
WHERE fence_type IS NULL OR fence_type = '';

-- 3. 约束：只允许三个值（再加类型时记得同步改这里）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ele_fences_fence_type_check'
  ) THEN
    ALTER TABLE public.ele_fences
      ADD CONSTRAINT ele_fences_fence_type_check
      CHECK (fence_type IN ('pickup', 'delivery', 'alert'));
  END IF;
END $$;

-- 4. 索引：列表页按 owner_account + 类型过滤
CREATE INDEX IF NOT EXISTS idx_ele_fences_owner_type
  ON public.ele_fences (owner_account, fence_type);

-- 5. ⭐ 授权（Web 端走匿名登录 anon 角色，不授会 permission denied）
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ele_fences TO anon, authenticated;

-- 6. 让 PostgREST 重新加载 schema（否则前端拿不到新列）
SELECT pg_notify('pgrst', 'reload schema');

-- ============================================================
-- 校验（执行后手动跑一下确认）
-- ============================================================
-- SELECT fence_type, count(*) FROM public.ele_fences GROUP BY fence_type ORDER BY 2 DESC;
