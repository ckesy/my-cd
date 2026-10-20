-- ============================================================
-- 部署自检脚本 · 2026-10-20
-- 用途：部署完跑一遍，逐条看「期望」，有一条不符就说明迁移或数据有问题
-- 只读，不修改任何数据，可以反复执行
-- ============================================================

-- ------------------------------------------------------------
-- ① 三个新列是否都在
-- 期望：3 行（config / role_type / pay_required）
-- ------------------------------------------------------------
select table_name, column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public'
   and (table_name, column_name) in (
        ('tenant_modules', 'config'),
        ('roles',          'role_type'),
        ('reports',        'pay_required'))
 order by table_name, column_name;

-- ------------------------------------------------------------
-- ② pay_required 存量回填是否合理
-- 期望：需要付款 ≤ 总数；且 status ∈ (待打款, 已打款) 的行一定为 true
-- ------------------------------------------------------------
select
  count(*)                                                   as 费用单总数,
  count(*) filter (where pay_required is true)               as 需要付款,
  count(*) filter (where status in ('待打款','已打款')
                     and pay_required is not true)           as 应为true却是false,
  count(*) filter (where pay_required is null)               as 空值
from reports;

-- ------------------------------------------------------------
-- ③ 模块表内容
-- 期望：每个车队至少有 waybill=true 一行；没有重复的 (owner_account, module_key)
-- ------------------------------------------------------------
select owner_account, module_key, enabled, 
       coalesce(config::text, '{}') as config, updated_by
  from tenant_modules
 order by owner_account, module_key;

-- 重复行检查，期望：0 行
select owner_account, module_key, count(*)
  from tenant_modules
 group by 1,2
having count(*) > 1;

-- 有运单但没 waybill 模块行的车队，期望：0 行
-- （代码有 DEFAULT_ON 兜底，但数据缺行会让后台看不到）
select distinct w.owner_account
  from waybills w
 where w.owner_account is not null
   and w.owner_account <> ''
   and not exists (
     select 1 from tenant_modules m
      where m.owner_account = w.owner_account
        and m.module_key = 'waybill'
   );

-- ------------------------------------------------------------
-- ④ 财务角色是否打标
-- 期望：名字带「财务」的都应该是 finance
-- ------------------------------------------------------------
select id, name, role_type
  from roles
 where name like '%财务%' or role_type = 'finance'
 order by id;

-- 期望：0 行（名字带财务但没打标）
select id, name, role_type
  from roles
 where name like '%财务%'
   and coalesce(role_type, 'normal') <> 'finance';

-- ------------------------------------------------------------
-- ⑤ 当前在途单（用来评估「关运单会不会卡单」）
-- 期望：关运单前这两列应该都是 0
-- ------------------------------------------------------------
select
  count(*) filter (where status = '审核中')                    as 待审,
  count(*) filter (where status = '待打款'
                     and pay_required is true)                 as 待付款,
  count(*) filter (where status = '待打款'
                     and pay_required is not true)             as 待打款但无需付款_异常
from reports;

-- ------------------------------------------------------------
-- ⑥ 审批配置里 mode 的分布
-- 期望：没有 mode 为空的行；空值会被代码按 'on' 处理
-- ------------------------------------------------------------
select coalesce(mode, '(空)') as mode, count(*)
  from fee_approval_configs
 group by 1;

-- ------------------------------------------------------------
-- ⑦ 权限位自检：财务角色是否配了 fee_* 三项
-- 期望：finance 角色的 permissions 里能看到 fee_audit / fee_pay / fee_stats
-- ------------------------------------------------------------
select id, name, role_type,
       coalesce(permissions::text, '{}') as permissions
  from roles
 where role_type = 'finance'
    or name like '%财务%'
 order by id;

-- ============================================================
-- 全部看完后，重点确认三件事：
--   1. ② 的「应为true却是false」= 0
--   2. ③ 的「重复行」= 0、「缺 waybill 行」= 0
--   3. ⑤ 的「待审 / 待付款」= 0（再去做关运单的测试，才不会卡单）
-- ============================================================
