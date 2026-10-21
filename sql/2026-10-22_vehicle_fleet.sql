-- ============================================================
-- 车辆 / 运单 加「车队」字段
-- ------------------------------------------------------------
-- ⚠️ vehicles 表没有 owner_account，它的归属字段是 org / customer_id
--    （见 FullMap.vue: select('plate, org, customer_id, driver, nickname')）
--    waybills 才是 owner_account
-- ============================================================

-- ---------- 第 1 批：加字段（已执行成功） ----------
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS fleet_name text;
ALTER TABLE waybills ADD COLUMN IF NOT EXISTS fleet_name text;

-- ---------- 第 2 批：加索引 ----------
CREATE INDEX IF NOT EXISTS idx_vehicles_fleet_name ON vehicles (org, fleet_name);
CREATE INDEX IF NOT EXISTS idx_waybills_fleet_name ON waybills (owner_account, fleet_name);

-- ---------- 第 3 批：授权 ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON vehicles TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON waybills TO anon, authenticated;

-- ---------- 第 4 批：刷新 schema 缓存 ----------
SELECT pg_notify('pgrst', 'reload schema');

-- ---------- 校验：确认两列都在 ----------
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE column_name = 'fleet_name'
ORDER BY table_name;
