<template>
  <div class="table-tools">
    <span v-if="showTotal" class="tt-total">
      共 <b>{{ total ?? 0 }}</b> 条
      <slot name="total-extra"></slot>
    </span>

    <div class="tt-right">
      <slot name="before"></slot>

      <!-- 刷新 -->
      <button v-if="showRefresh" class="tt-icon-btn" :class="{ spinning: refreshing }" title="刷新" @click="handleRefresh">
        <el-icon>
          <Refresh />
        </el-icon>
      </button>

      <!-- 密度 -->
      <el-dropdown v-if="showDensity" trigger="click" popper-class="tt-density-dropdown" @command="handleDensity">
        <button class="tt-icon-btn" title="表格密度">
          <el-icon>
            <Operation />
          </el-icon>
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="large">
              <span class="tt-density-item" :class="{ active: size === 'large' }">宽松</span>
            </el-dropdown-item>
            <el-dropdown-item command="default">
              <span class="tt-density-item" :class="{ active: size === 'default' }">默认</span>
            </el-dropdown-item>
            <el-dropdown-item command="small">
              <span class="tt-density-item" :class="{ active: size === 'small' }">紧凑</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <!-- 列设置 -->
      <el-popover v-if="showColumns" v-model:visible="columnVisible" placement="bottom-end" :width="280" trigger="click"
        popper-class="tt-column-popper">
        <template #reference>
          <button class="tt-icon-btn" :class="{ active: columnVisible }" title="列设置">
            <el-icon>
              <Setting />
            </el-icon>
          </button>
        </template>
        <div class="tt-column-setting">
          <div class="tt-column-header">
            <span class="tt-column-title">
              <el-icon>
                <Grid />
              </el-icon> 列展示
            </span>
            <span class="tt-column-reset" @click="emit('reset')">重置</span>
          </div>
          <div class="tt-column-body">
            <div v-for="(col, index) in columns" :key="col.prop" class="tt-column-item"
              :class="{ dragging: dragIndex === index, dragOver: dragOverIndex === index }" draggable="true"
              @dragstart="dragIndex = index" @dragover.prevent="dragOverIndex = index" @drop="onDrop(index)"
              @dragend="resetDrag">
              <span class="tt-drag-handle">
                <el-icon>
                  <Rank />
                </el-icon>
              </span>
              <el-checkbox v-model="col.visible" class="tt-column-checkbox">{{ col.label }}</el-checkbox>
              <div class="tt-fix-actions">
                <button class="tt-fix-btn" :class="{ active: col.fixed === 'left' }" title="左固定"
                  @click="toggleFix(col, 'left')">
                  <el-icon>
                    <DArrowLeft />
                  </el-icon>
                </button>
                <button class="tt-fix-btn" :class="{ active: col.fixed === 'right' }" title="右固定"
                  @click="toggleFix(col, 'right')">
                  <el-icon>
                    <DArrowRight />
                  </el-icon>
                </button>
              </div>
            </div>
          </div>
        </div>
      </el-popover>

      <!-- 全屏 -->
      <button v-if="showFullscreen" class="tt-icon-btn" :class="{ active: fullscreen }" :title="fullscreen ? '退出全屏' : '表格全屏'"
        @click="toggleFullscreen">
        <el-icon>
          <component :is="fullscreen ? Close : FullScreen" />
        </el-icon>
      </button>

      <slot name="after"></slot>
    </div>
  </div>
</template>

<script setup>
/**
 * 列表工具栏「四件套」：刷新 / 密度 / 列设置 / 全屏
 *
 * ⭐ 所有列表页都用这个组件，别再各写一套（样式、交互、持久化保持一致）
 *
 * 用法：
 *   <TableTools
 *     v-model:size="tableSize"
 *     v-model:fullscreen="isTableFullscreen"
 *     :columns="columnConfig"
 *     :total="total"
 *     storage-key="customer_archive"
 *     @refresh="fetchData"
 *     @reset="resetColumns" />
 *
 * 注意：全屏只负责「状态 + ESC 退出」，铺满容器的样式由页面自己加
 *      （页面要把表格包在 :class="{ 'is-fullscreen': isTableFullscreen }" 里）
 */
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  Refresh, Operation, Setting, FullScreen, Close,
  Grid, Rank, DArrowLeft, DArrowRight,
} from '@element-plus/icons-vue'

const props = defineProps({
  total: { type: Number, default: null },
  showTotal: { type: Boolean, default: true },
  refreshing: { type: Boolean, default: false },
  showRefresh: { type: Boolean, default: true },
  showDensity: { type: Boolean, default: true },
  showColumns: { type: Boolean, default: true },
  showFullscreen: { type: Boolean, default: true },
  /** 传了就自动持久化密度（localStorage: <storageKey>_density） */
  storageKey: { type: String, default: '' },
  /** 列配置数组：{ prop, label, visible, fixed?, minWidth?, width?, align? } */
  columns: { type: Array, default: () => [] },
})

const emit = defineEmits(['refresh', 'reset', 'fullscreen-change'])

const size = defineModel('size', { type: String, default: 'default' })
const fullscreen = defineModel('fullscreen', { type: Boolean, default: false })

// ---------------- 密度 ----------------
const densityKey = () => (props.storageKey ? `${props.storageKey}_density` : '')

onMounted(() => {
  const key = densityKey()
  if (!key) return
  const saved = localStorage.getItem(key)
  if (saved) size.value = saved
})

const handleDensity = (cmd) => {
  size.value = cmd
  const key = densityKey()
  if (key) localStorage.setItem(key, cmd)
}

// ---------------- 刷新 ----------------
const handleRefresh = () => emit('refresh')

// ---------------- 列设置 ----------------
const columnVisible = ref(false)

const toggleFix = (col, side) => {
  col.fixed = col.fixed === side ? false : side
}

const dragIndex = ref(-1)
const dragOverIndex = ref(-1)
const resetDrag = () => { dragIndex.value = -1; dragOverIndex.value = -1 }

const onDrop = (index) => {
  if (dragIndex.value === -1 || dragIndex.value === index) { resetDrag(); return }
  const list = [...props.columns]
  const [moved] = list.splice(dragIndex.value, 1)
  list.splice(index, 0, moved)
  props.columns.splice(0, props.columns.length, ...list)
  resetDrag()
}

// ---------------- 全屏 ----------------
const toggleFullscreen = () => { fullscreen.value = !fullscreen.value }

watch(fullscreen, (val) => emit('fullscreen-change', val))

const onKeydown = (e) => {
  if (e.key === 'Escape' && fullscreen.value) fullscreen.value = false
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
.table-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
  min-height: 32px;
}

.tt-total {
  font-size: 12.5px;
  color: #64748B;
  white-space: nowrap;
}

.tt-total b {
  color: var(--brand-primary);
  font-size: 13.5px;
  font-weight: 700;
  margin: 0 1px;
}

.tt-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-wrap: wrap;
}

.tt-icon-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #E2E8F0;
  background: #fff;
  border-radius: 6px;
  color: #64748B;
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  transition: all .25s cubic-bezier(.34, 1.56, .64, 1);
}

.tt-icon-btn:hover {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
  background: var(--brand-primary-light);
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(var(--brand-rgb), .15);
}

.tt-icon-btn.active {
  border-color: var(--brand-primary);
  color: #fff;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  box-shadow: 0 3px 10px rgba(var(--brand-rgb), .35);
}

.tt-icon-btn.spinning :deep(.el-icon) {
  animation: tt-spin .8s linear infinite;
}

@keyframes tt-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

<!-- 弹层要挂到 body，样式必须全局 -->
<style>
.tt-density-dropdown.el-dropdown__popper.el-popper {
  border: 2px solid #FFFFFF !important;
  box-shadow: 0 10px 32px rgba(var(--brand-rgb), 0.18), 0 0 0 1px rgba(var(--brand-rgb), 0.15) !important;
  border-radius: 10px !important;
  overflow: hidden;
  background: #FFFFFF !important;
}

.tt-density-dropdown .el-dropdown-menu {
  padding: 4px !important;
  background: #FFFFFF !important;
}

.tt-density-dropdown .el-dropdown-menu__item {
  font-size: 13px !important;
  color: var(--brand-primary) !important;
  font-weight: 600 !important;
  border-radius: 6px !important;
  padding: 6px 16px !important;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}

.tt-density-dropdown .el-dropdown-menu__item:hover {
  color: #ffffff !important;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark)) !important;
  transform: translateX(2px);
}

.tt-density-dropdown .tt-density-item {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
}

.tt-density-dropdown .tt-density-item.active {
  color: var(--brand-primary);
  font-weight: 700;
}

.tt-density-dropdown .el-dropdown-menu__item:hover .tt-density-item.active {
  color: #ffffff;
}

.tt-column-popper.el-popover.el-popper {
  padding: 0 !important;
  border-radius: 12px !important;
  box-shadow: 0 12px 36px rgba(var(--brand-rgb), 0.18), 0 0 0 1px rgba(var(--brand-rgb), 0.12) !important;
  border: 2px solid #FFFFFF !important;
  overflow: hidden;
  background: #FFFFFF !important;
}

.tt-column-popper .el-popover__title {
  display: none;
}

.tt-column-setting {
  background: #FFFFFF;
}

.tt-column-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #FEE2E2;
}

.tt-column-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 700;
  color: var(--brand-primary);
}

.tt-column-title .el-icon {
  font-size: 14px;
}

.tt-column-reset {
  font-size: 12.5px;
  color: var(--brand-primary);
  cursor: pointer;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.tt-column-reset:hover {
  background: #FEE2E2;
  text-decoration: underline;
  transform: scale(1.05);
}

.tt-column-body {
  max-height: 380px;
  overflow-y: auto;
  padding: 6px;
}

.tt-column-body::-webkit-scrollbar {
  width: 4px;
}

.tt-column-body::-webkit-scrollbar-thumb {
  background: #FCA5A5;
  border-radius: 2px;
}

.tt-column-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: grab;
  user-select: none;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.tt-column-item:hover {
  background: var(--brand-primary-light);
}

.tt-column-item.dragging {
  opacity: 0.4;
}

.tt-column-item.dragOver {
  box-shadow: inset 0 2px 0 var(--brand-primary);
}

.tt-drag-handle {
  color: #CBD5E1;
  font-size: 13px;
  display: flex;
  cursor: grab;
}

.tt-column-checkbox {
  flex: 1;
  min-width: 0;
}

.tt-column-checkbox .el-checkbox__label {
  font-size: 13px !important;
  color: #334155 !important;
}

.tt-fix-actions {
  display: flex;
  gap: 2px;
}

.tt-fix-btn {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #CBD5E1;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  transition: all 0.2s;
}

.tt-fix-btn:hover {
  color: var(--brand-primary);
  background: #FEE2E2;
}

.tt-fix-btn.active {
  color: var(--brand-primary);
  background: #FEE2E2;
}
</style>
