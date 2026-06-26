<template>
  <el-menu
    class="sidebar-menu"
    :default-active="activePath"
    unique-opened
    @select="handleSelect"
  >
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

    <!-- 基础数据管理改为二级菜单 -->
    <el-sub-menu index="base-data-management">
      <template #title>基础数据管理</template>
      <el-menu-item index="/vehicle-archive">车辆档案</el-menu-item>
      <el-menu-item index="/driver-archive">司机档案</el-menu-item>
    </el-sub-menu>

    <el-menu-item index="/dashboard/系统管理">系统管理</el-menu-item>
  </el-menu>
</template>

<script setup>
defineProps({
  activePath: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['menuSelect'])

const handleSelect = (index) => {
  emit('menuSelect', index)
}
</script>

<style scoped>
.sidebar-menu {
  height: 100%;
  border-right: none !important;
}
.sidebar-menu .el-menu-item,
.sidebar-menu .el-sub-menu .el-sub-menu__title {
  border-bottom: none !important;
}
</style>