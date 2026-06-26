<template>
  <el-menu class="sidebar-menu" router default-active="/dashboard" unique-opened>
    <el-menu-item index="/dashboard">监控中心</el-menu-item>

    <el-sub-menu index="drive-management">
      <template #title>行车管理</template>
      <el-menu-item index="/fullmap">全图监控</el-menu-item>
      <el-menu-item index="/dashboard/车辆故障管理">车辆故障管理</el-menu-item>
      <el-menu-item index="/dashboard/外观巡检管理">外观巡检管理</el-menu-item>
      <el-menu-item index="/dashboard/电子围栏管理">电子围栏管理</el-menu-item>
    </el-sub-menu>

    <el-menu-item index="/dashboard/运营管理">运营管理</el-menu-item>

    <el-sub-menu index="transport-management">
  <template #title>运输管理</template>
  <el-menu-item index="/waybill">运单管理</el-menu-item>
  <el-menu-item index="/report">车队运营报告</el-menu-item>
</el-sub-menu>
    <el-menu-item index="/dashboard/基础数据管理">基础数据管理</el-menu-item>
    <el-menu-item index="/dashboard/系统管理">系统管理</el-menu-item>
  </el-menu>
</template>

<script setup>
</script>

<style scoped>
.sidebar-menu {
  height: 100%;
  border-right: 1px solid rgba(0,0,0,0.04);
}
</style>
