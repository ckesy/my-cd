-- ============================================
-- 东风车队管理系统 - 数据库结构备份
-- 生成时间：2026-10-13
-- ============================================

-- 1. organizations 组织表
CREATE TABLE IF NOT EXISTS organizations (...);
-- 2. roles 角色表
CREATE TABLE IF NOT EXISTS roles (...);
-- 3. fleets 车队表
CREATE TABLE IF NOT EXISTS fleets (...);
-- 4. users 用户表
CREATE TABLE IF NOT EXISTS users (...);
-- 5. user_permissions 用户权限关联表
CREATE TABLE IF NOT EXISTS user_permissions (...);

-- 初始化数据
INSERT INTO roles ...;
INSERT INTO organizations ...;
INSERT INTO fleets ...;