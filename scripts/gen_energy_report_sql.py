#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成能耗报告演示数据（车队分析报告 v2）→ sql/2026-10-19_energy_report.sql
   数据口径：电量统一用 MWh（千度），里程 km，电耗 kWh/100km。
"""
import json, datetime, os, math

# ---------- 车辆底表（24 台，按里程降序；设计成「运营强度 U 形」关系） ----------
CARS = [
    # (出勤率, 月里程km, 百公里电耗kWh/100km)
    (0.96, 15200, 140.2),
    (0.95, 14900, 138.9),
    (0.93, 14500, 139.8),
    (0.92, 14100, 138.4),
    (0.90, 13600, 126.1),
    (0.89, 13200, 125.4),
    (0.88, 12900, 124.8),
    (0.87, 12500, 125.9),
    (0.86, 12100, 126.2),
    (0.85, 11700, 124.3),
    (0.86, 11300, 124.9),
    (0.84, 10900, 125.2),
    (0.83, 10500, 124.6),
    (0.82, 10100, 125.0),
    (0.80, 9700, 126.4),
    (0.79, 9300, 127.1),
    (0.78, 8900, 126.8),
    (0.76, 8500, 127.6),
    (0.72, 7600, 130.2),
    (0.70, 7200, 130.9),
    (0.68, 6800, 131.4),
    (0.65, 6300, 142.1),
    (0.62, 5900, 131.8),
    (0.58, 5400, 129.9),
]


def r1(x):
    return round(x + 1e-9, 1)


def build(n_cars, period_start, period_end, fuel_type="纯电动", target_mileage=None, target_kiloil=None,
          target_fuel=None):
    cars = []
    for i, (att, mil, ko) in enumerate(CARS[:n_cars], start=1):
        cars.append({"name": "chasisNum-%02d" % i, "attendance": att,
                     "mileage": float(mil), "kiloil": float(ko)})

    # 校准（只在 A 套数据上做，让它和之前那份对话里的口径对得上）
    if target_fuel:
        cur = sum(c["mileage"] * c["kiloil"] for c in cars) / 100000
        f = target_fuel / cur
        for c in cars:
            c["mileage"] = int(round(c["mileage"] * f / 10) * 10)
    if target_mileage:
        f = target_mileage / sum(c["mileage"] for c in cars)
        for c in cars:
            c["mileage"] = int(round(c["mileage"] * f / 10) * 10)
    if target_kiloil:
        tot_m = sum(c["mileage"] for c in cars)
        w = sum(c["mileage"] * c["kiloil"] for c in cars) / tot_m
        fk = target_kiloil / w
        for c in cars:
            c["kiloil"] = r1(c["kiloil"] * fk)

    for c in cars:
        c["mileage"] = int(c["mileage"])
        c["fuel"] = r1(c["mileage"] * c["kiloil"] / 100 / 1000)   # MWh

    mileage = sum(c["mileage"] for c in cars)
    fuel = sum(c["fuel"] for c in cars)
    k_oil = fuel * 1000 / mileage * 100
    idle_fuel = r1(fuel * 0.0208)             # 怠速占 ~2%
    travel = r1(fuel - idle_fuel)

    # ---- 电耗分布（按百公里电耗分 5 档）----
    buckets = [("<125", lambda k: k < 125), ("125–128", lambda k: 125 <= k < 128),
               ("128–131", lambda k: 128 <= k < 131), ("131–135", lambda k: 131 <= k < 135),
               ("≥135", lambda k: k >= 135)]
    distribution = []
    for label, fn in buckets:
        grp = [c for c in cars if fn(c["kiloil"])]
        distribution.append({"label": label, "count": len(grp), "ratio": round(len(grp) / len(cars), 3)})

    # ---- 运营强度 × 电耗（U 形）----
    tiers = [("<8000", lambda m: m < 8000), ("8000–10000", lambda m: 8000 <= m < 10000),
             ("10000–12000", lambda m: 10000 <= m < 12000), ("12000–14000", lambda m: 12000 <= m < 14000),
             ("≥14000", lambda m: m >= 14000)]
    intensity = []
    for label, fn in tiers:
        grp = [c for c in cars if fn(c["mileage"])]
        intensity.append({
            "label": label,
            "cars": len(grp),
            "mileage": sum(c["mileage"] for c in grp),
            "kiloil": r1(sum(c["kiloil"] for c in grp) / len(grp)) if grp else 0,
        })

    # ---- 日趋势（周末回落）----
    d0 = datetime.date.fromisoformat(period_start)
    d1 = datetime.date.fromisoformat(period_end)
    days = (d1 - d0).days + 1
    weights = []
    for i in range(days):
        d = d0 + datetime.timedelta(days=i)
        w = 0.55 if d.weekday() >= 5 else 1.0
        weights.append(w * (1 + 0.06 * ((i % 7) - 3) / 3))
    total_w = sum(weights)
    daily = []
    for i in range(days):
        d = d0 + datetime.timedelta(days=i)
        share = weights[i] / total_w
        m = int(round(mileage * share))
        # 平滑波动：周末略高（短途多），再叠一层缓慢的季节性起伏（别做成锯齿）
        daily.append({
            "date": d.strftime("%m-%d"),
            "mileage": m,
            "kiloil": r1(k_oil + 1.7 * math.sin(i / 4.3) + 0.5 * math.sin(i / 1.9)
                         + (2.2 if d.weekday() >= 5 else 0)),
        })

    # ---- 能量去向瀑布 ----
    road_share = [("高速", 0.278), ("国道", 0.444), ("省道", 0.169), ("其他", 0.109)]
    roads = []
    acc = 0.0
    for i, (name, share) in enumerate(road_share):
        v = r1(travel * share) if i < len(road_share) - 1 else r1(travel - acc)
        acc += v
        roads.append({"name": name, "value": v})

    # ---- 车速 × 电耗（U 形，53–55km/h 最省）----
    speed_scatter = []
    speeds = [12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 50, 52, 54, 56, 58, 62, 66, 70, 75, 80, 85, 90, 95, 100]
    for i, sp in enumerate(speeds):
        # 抛物线：53–55km/h 最省，100km/h 约 +40%
        base = 124.2 + 0.027 * (sp - 54) ** 2
        for j, k in enumerate((1.0, 1.6, 2.4)):
            kilo = r1(base + (j - 1) * 3.4 + ((i * 7 + j * 3) % 5 - 2) * 0.8)
            speed_scatter.append({
                "speed": sp + (j - 1) * 1.5,
                "kiloil": kilo,
                "mileage": 900 + ((i * 613 + j * 271) % 9) * 420,
            })

    # ---- 驾驶行为（千公里次数）----
    behaviors = [("急加速", 3.2, 847), ("急减速", 2.6, 688), ("急转弯", 1.4, 371),
                 ("超速", 0.9, 238), ("长时间怠速", 4.8, 1271), ("空挡滑行", 0.6, 159)]
    driving = [{"label": a, "per1000": b, "count": c} for a, b, c in behaviors]

    # ---- 帕累托（按电耗贡献）----
    pareto = []
    cum = 0.0
    for c in sorted(cars, key=lambda x: -x["fuel"]):
        cum += c["fuel"]
        pareto.append({"name": c["name"], "kiloil": c["kiloil"], "fuel": c["fuel"],
                       "cum": round(cum / fuel, 4)})

    # ---- 三张排行 ----
    ranking = {
        "attendance": [{"name": c["name"], "value": c["attendance"]}
                       for c in sorted(cars, key=lambda x: -x["attendance"])[:6]],
        "mileage": [{"name": c["name"], "value": c["mileage"]}
                    for c in sorted(cars, key=lambda x: -x["mileage"])[:6]],
        "kilOil": [{"name": c["name"], "value": c["kiloil"]}
                   for c in sorted(cars, key=lambda x: -x["kiloil"])[:6]],
    }

    # ---- 异常车 ----
    anomalies = []
    for c in cars:
        if c["kiloil"] >= 135 and c["attendance"] < 0.8:
            anomalies.append({"name": c["name"], "kiloil": c["kiloil"], "attendance": c["attendance"],
                              "issue": "高电耗 + 低出勤"})
        elif c["kiloil"] >= 138:
            anomalies.append({"name": c["name"], "kiloil": c["kiloil"], "attendance": c["attendance"],
                              "issue": "高电耗 + 高出勤（干线重载）"})

    # ---- 改善建议 ----
    proposals = [
        {"target": "车队整体", "text": "中里程段（8000–12000km）电耗最省，调度上优先把长途干线拆成两段中里程任务，可少 4–6% 电耗。"},
        {"target": "≥14000km 的 4 台车", "text": "这批车电耗 138–140，比车队均值高 9%。建议核查是否长期满载 + 高速巡航 90km/h 以上。"},
        {"target": "chasisNum-22", "text": "电耗 142.1、出勤仅 65%，属于典型的「跑得少还费电」，优先安排三电检测。"},
        {"target": "怠速", "text": "怠速电耗占 2.1%，折合每月 7.1MWh；装卸等待超过 20 分钟建议熄火断电。"},
    ]

    # ---- 6 条洞察 ----
    low = intensity[0]["kiloil"]
    high = intensity[-1]["kiloil"]
    mid = min(intensity, key=lambda x: x["kiloil"])
    n80 = next((i + 1 for i, p in enumerate(pareto) if p["cum"] >= 0.8), len(pareto))
    insights = [
        {"tone": "info", "title": "车队水平", "text": "日均 %.0fkm/台，百公里电耗 %.1f，处同吨位车型中位偏上。" % (mileage / n_cars / days, k_oil)},
        {"tone": "warn", "title": "分布右偏", "text": "%d 台车超过 135，正是它们把均值拉高了 %.1f。" % (distribution[-1]["count"], k_oil - 124.8)},
        {"tone": "warn", "title": "运营强度呈 U 形", "text": "跑最少的一档 %.1f、跑最多的一档 %.1f，中间档最省 %.1f —— 过高过低都不经济。" % (low, high, mid["kiloil"])},
        {"tone": "good", "title": "能量去向", "text": "国道占行程电耗 %.0f%%，一项就相当于省道的 %.1f 倍，路线优化优先级最高。" % (roads[1]["value"] / travel * 100, roads[1]["value"] / roads[2]["value"])},
        {"tone": "info", "title": "经济车速", "text": "车速与电耗同为 U 形，50–58km/h 最省；90km/h 以上电耗抬升约 40%。"},
        {"tone": "good", "title": "无需「抓单点」", "text": "帕累托要 %d 台车才累计到 80%%，说明没有单车异常大户，治理思路应是整体提升。" % n80},
    ]

    return {
        "meta": {"taskType": "车队分析报告", "fuelType": fuel_type, "carCount": n_cars,
                 "periodStart": period_start, "periodEnd": period_end},
        "summary": {
            "carCount": n_cars,
            "mileage": mileage,
            "totalFuel": r1(fuel),
            "travelFuel": travel,
            "idleFuel": idle_fuel,
            "kilOil": r1(k_oil),
            "idleTimePer": 0.021,
            "attendancePer": round(sum(c["attendance"] for c in cars) / n_cars, 3),
            "avgSpeed": 41.2,
            "brakingPer": 0.237,
            "regenEnergy": r1(fuel * 0.113),
            "dailyMileage": int(round(mileage / days)),
            "activeCars": sum(1 for c in cars if c["attendance"] >= 0.8),
            "days": days,
        },
        "distribution": distribution,
        "quadrant": [{"name": c["name"], "attendance": c["attendance"], "kiloil": c["kiloil"],
                      "mileage": c["mileage"], "fuel": c["fuel"]} for c in cars],
        "daily": daily,
        "intensity": intensity,
        "waterfall": {"roads": roads, "travel": travel, "idle": idle_fuel, "total": r1(fuel)},
        "speedScatter": speed_scatter,
        "driving": driving,
        "pareto": pareto,
        "ranking": ranking,
        "anomalies": anomalies[:6],
        "proposals": proposals,
        "insights": insights,
    }


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


TASKS = [
    # (task_no, task_name, fuel, type, status, period_type, start, end, days_ago, data)
    ("20261016001229msjx", "44444", "纯电动", "车队分析报告", "成功", "月", "2026-09-01", "2026-09-30", 3, "A"),
    ("20261016001013nwwb", "瑞鑫物流", "纯电动", "车队分析报告", "成功", "月", "2026-09-01", "2026-09-30", 3, "B"),
    ("20261012101428jsmy", "R9023470", "燃气车", "单车分析报告", "成功", "月", "2026-09-01", "2026-09-30", 7, None),
    ("20261009102332m3n4", "陕西泾河", "纯电动", "车队分析报告", "成功", "月", "2026-08-01", "2026-08-31", 10, "C"),
    ("202610081432324apt", "漯河双汇", "纯电动", "车队分析报告", "成功", "周", "2026-09-21", "2026-09-27", 11, "A"),
    ("202610071041222w7td", "T6007979", "纯电动", "单车分析报告", "成功", "月", "2026-09-01", "2026-09-30", 12, None),
    ("20261007101401sj6s", "9月份", "纯电动", "车队分析报告", "成功", "月", "2026-09-01", "2026-09-30", 12, "A"),
    ("202610071013024jt8", "车队", "纯电动", "车队分析报告", "成功", "月", "2026-09-01", "2026-09-30", 12, "A"),
    ("202610061018453k7d", "dui'bi", "纯电动", "车辆对比报告", "成功", "月", "2026-09-01", "2026-09-30", 13, None),
    ("202610051120107p2m", "氢能示范线", "氢燃料", "同车对比报告", "待生成", "月", "2026-09-01", "2026-09-30", 14, None),
    ("202610040918332x5w", "燃油老线", "燃油车", "单车分析报告", "失败", "月", "2026-09-01", "2026-09-30", 15, None),
]

DATA_SETS = {
    "A": build(24, "2026-09-01", "2026-09-30", target_fuel=341.2),
    "B": build(18, "2026-09-01", "2026-09-30"),
    "C": build(12, "2026-08-01", "2026-08-31"),
}

rows = []
for (no, name, fuel, ttype, status, ptype, ps, pe, ago, ds) in TASKS:
    payload = "NULL"
    if ds:
        payload = q(json.dumps(DATA_SETS[ds], ensure_ascii=False)) + "::jsonb"
    rows.append(
        "  (%s, %s, %s, %s, %s, %s, %s, %s, NULL, %s, %s, now() - interval '%d days', %s)"
        % (q(no), q(name), q(fuel), q(ttype), q(status), q(ptype), q(ps), q(pe),
           q("张伟" if ago % 2 else "管理员"), q("12345612345"), ago, payload)
    )

sql = """-- ============================================================
-- 能耗报告 · 任务表 + 演示数据
-- 日期：2026-10-19
-- 执行位置：CloudBase 控制台 → 数据库 → SQL 执行（PostgreSQL）
--
-- 说明：
--   1. 一个「报告任务」= 一行；report_data 存该任务取回来的报告 JSON。
--   2. 目前东风接口还没接，所以只有车队分析报告的 3 套演示数据（A/B/C），
--      单车 / 对比等任务 status='成功' 但 report_data 为空 —— 详情页会给出占位提示。
--   3. 数据口径：电量 MWh（千度），里程 km，电耗 kWh/100km。
--   4. 可重复执行（ON CONFLICT 忽略）。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.energy_report_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_no         text NOT NULL UNIQUE,          -- 任务编号（页面上的「20261016001229msjx」）
  task_name       text NOT NULL,                 -- 任务名称
  fuel_type       text NOT NULL,                 -- 燃油车 / 燃气车 / 纯电动 / 氢燃料
  task_type       text NOT NULL,                 -- 单车分析报告 / 车队分析报告 / 车辆对比报告 / 同车对比报告
  task_status     text NOT NULL DEFAULT '待生成', -- 成功 / 生成中 / 待生成 / 失败
  period_type     text,                          -- 周 / 月 / 任意
  period_start    date,
  period_end      date,
  owner_account   text,                          -- 账号归属（暂无，页面显示 --）
  creator_name    text,                          -- 创建人
  creator_account text,                          -- 创建账号
  create_time     timestamptz NOT NULL DEFAULT now(),
  report_data     jsonb,                         -- 报告数据（接口接入后由服务端写入）
  updated_at      timestamptz DEFAULT now()
);

COMMENT ON TABLE public.energy_report_tasks IS '能耗报告任务（任务管理列表 + 报告数据）';

CREATE INDEX IF NOT EXISTS idx_energy_report_tasks_time ON public.energy_report_tasks (create_time DESC);
CREATE INDEX IF NOT EXISTS idx_energy_report_tasks_type ON public.energy_report_tasks (task_type);

-- ------------------------------------------------------------
-- 演示任务（与页面截图一致，另补 3 条覆盖其它任务类型 / 状态）
-- ------------------------------------------------------------
INSERT INTO public.energy_report_tasks
  (task_no, task_name, fuel_type, task_type, task_status, period_type, period_start, period_end,
   owner_account, creator_name, creator_account, create_time, report_data)
VALUES
%s
ON CONFLICT (task_no) DO NOTHING;

-- ------------------------------------------------------------
-- 授权（Web 端是匿名登录，不授权会 permission denied）
-- ------------------------------------------------------------
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'authenticator']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.energy_report_tasks TO %%I', r);
      EXECUTE format('GRANT USAGE ON SCHEMA public TO %%I', r);
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.energy_report_tasks DISABLE ROW LEVEL SECURITY;

SELECT pg_notify('pgrst', 'reload schema');

-- 验证：应当返回 11 行，其中 6 行车队报告 report_data 不为空
-- SELECT task_no, task_name, task_type, task_status, report_data IS NOT NULL AS has_data
--   FROM public.energy_report_tasks ORDER BY create_time DESC;
""" % ",\n".join(rows)

out = os.path.join(os.path.dirname(__file__), "..", "sql", "2026-10-19_energy_report.sql")
out = os.path.normpath(out)
with open(out, "w", encoding="utf-8") as f:
    f.write(sql)

print("written", out, len(sql), "bytes")
d = DATA_SETS["A"]
print("A cars=%d mileage=%d fuel=%.1f kilOil=%.1f" % (
    d["summary"]["carCount"], d["summary"]["mileage"], d["summary"]["totalFuel"], d["summary"]["kilOil"]))
print("distribution", [(x["label"], x["count"]) for x in d["distribution"]])
print("intensity", [(x["label"], x["kiloil"]) for x in d["intensity"]])
print("roads", [(x["name"], x["value"]) for x in d["waterfall"]["roads"]],
      "travel", d["waterfall"]["travel"], "idle", d["waterfall"]["idle"], "total", d["waterfall"]["total"])
n80 = next(i + 1 for i, p in enumerate(d["pareto"]) if p["cum"] >= 0.8)
print("pareto 80%% at", n80, "of", len(d["pareto"]))
print("anomalies", len(d["anomalies"]))
