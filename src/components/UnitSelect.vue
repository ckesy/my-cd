<template>
  <el-select :model-value="modelValue" :placeholder="placeholder" :clearable="clearable" filterable
    :allow-create="allowCreate" default-first-option :disabled="disabled" :size="size"
    :popper-class="type === 'price' ? 'unit-select-popper price-unit-popper' : 'unit-select-popper'"
    @update:model-value="onChange">
    <!-- 货物单位：分组 + 常用置顶 -->
    <template v-if="type === 'cargo'">
      <el-option-group v-if="showCommon && !isCompact" label="常用">
        <el-option v-for="u in commonOptions" :key="'c-' + u.value" :label="u.label" :value="u.value">
          <span class="unit-opt">{{ u.value }}</span>
          <span v-if="unitSymbolDisplay(u.value)" class="unit-opt-sym">{{ unitSymbolDisplay(u.value) }}</span>
        </el-option>
      </el-option-group>

      <el-option-group v-for="g in UNIT_GROUPS" :key="g.key" :label="g.label">
        <el-option v-for="u in g.options" :key="u.value" :label="labelOf(u)" :value="u.value">
          <span class="unit-opt">{{ u.value }}</span>
          <span v-if="unitSymbolDisplay(u.value)" class="unit-opt-sym">{{ unitSymbolDisplay(u.value) }}</span>
        </el-option>
      </el-option-group>
    </template>

    <!-- 计价单位：元/km、元/吨 … -->
    <template v-else>
      <el-option v-for="p in PRICE_UNITS" :key="p.value" :label="p.value" :value="p.value">
        <span class="unit-opt">{{ p.value }}</span>
        <span class="unit-opt-sym">{{ p.hint }}</span>
      </el-option>
    </template>
  </el-select>
</template>

<script setup>
/**
 * 单位选择器（货物单位 / 计价单位）
 *
 *   <UnitSelect v-model="form.unit" />                        档案弹窗：吨 (t)
 *   <UnitSelect v-model="item.unit" mode="compact" />         运单行：吨
 *   <UnitSelect v-model="form.price_unit" type="price" />     计费规则：元/km
 */
import { computed } from 'vue'
import { UNIT_GROUPS, COMMON_UNITS, UNIT_MAP, PRICE_UNITS, normalizeUnit, unitSymbolDisplay } from '@/utils/units'

const props = defineProps({
  modelValue: { type: [String, null], default: '' },
  type: { type: String, default: 'cargo' },        // cargo | price
  mode: { type: String, default: 'full' },         // full | compact
  placeholder: { type: String, default: '请选择单位' },
  showCommon: { type: Boolean, default: true },
  allowCreate: { type: Boolean, default: true },
  clearable: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
  size: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'change'])

const isCompact = computed(() => props.mode === 'compact')

const commonOptions = computed(() => COMMON_UNITS.map(v => UNIT_MAP[v]).filter(Boolean))

const labelOf = (u) => (isCompact.value ? u.value : u.label)

const onChange = (val) => {
  if (val === '' || val === null || val === undefined) {
    emit('update:modelValue', '')
    emit('change', '')
    return
  }
  const next = props.type === 'cargo' ? normalizeUnit(val) : val
  emit('update:modelValue', next)
  emit('change', next)
}
</script>

<style scoped>
:deep(.unit-opt) {
  font-size: 13px;
}

:deep(.unit-opt-sym) {
  float: right;
  font-size: 11.5px;
  color: #94A3B8;
  margin-left: 12px;
}
</style>

<!-- 选项在 body 里渲染，符号样式要全局 -->
<style>
.unit-select-popper .el-select-group__title {
  font-size: 11.5px !important;
  color: #94A3B8 !important;
  font-weight: 600;
  padding: 6px 12px 2px !important;
  line-height: 18px;
}

.unit-select-popper .el-select-dropdown__item {
  height: 32px;
  line-height: 32px;
}

.unit-select-popper .unit-opt {
  float: left;
  font-size: 13px;
  color: #1E293B;
}

.unit-select-popper .unit-opt-sym {
  float: right;
  font-size: 11.5px;
  color: #94A3B8;
}

.unit-select-popper .el-select-dropdown__item.is-selected .unit-opt {
  color: #c8102e;
  font-weight: 600;
}

.unit-select-popper .el-select-dropdown__item.is-selected .unit-opt-sym {
  color: #E11D48;
}
</style>
