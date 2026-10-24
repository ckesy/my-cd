<template>
  <div class="alert-setting-page">
    <!-- ⭐ 只读提示横幅 -->
    <div v-if="isReadonly" class="readonly-banner">
      <el-icon><Lock /></el-icon>
      <span>提醒配置由主账号统一管理，您当前为<strong>只读模式</strong>（仅可查看，无法修改）</span>
    </div>

    <!-- 顶部标题条 -->
    <div class="page-header fade-up">
      <div class="header-left">
        <div class="header-icon-wrap">
          <el-icon class="header-icon"><Bell /></el-icon>
          <div class="header-icon-pulse"></div>
        </div>
        <div class="header-title-text">
          <h2>提醒设置</h2>
          <p>配置围栏超速和停留行为提醒</p>
        </div>
      </div>
      <div class="header-actions">
        <el-button class="btn-outline" @click="handleReset" :disabled="isReadonly">
          <el-icon><Refresh /></el-icon> 重置
        </el-button>
        <el-button type="primary" class="btn-primary" @click="handleSave" :loading="saving" :disabled="isReadonly">
          <el-icon><Check /></el-icon> 提交保存
        </el-button>
      </div>
    </div>

    <!-- 开关卡片区 -->
    <div class="switch-cards-grid">
      <div
        class="switch-card speeding-card fade-up"
        :class="{ active: speeding.enabled, readonly: isReadonly }"
        style="animation-delay: 0.1s"
        @click="!isReadonly && (speeding.enabled = !speeding.enabled, handleSwitchChange('speeding', speeding.enabled))"
      >
        <div class="switch-card-bg-ring"></div>
        <div class="switch-card-content">
          <div class="switch-card-icon speeding-icon" :class="{ spinning: speeding.enabled }">
            <el-icon><Odometer /></el-icon>
          </div>
          <div class="switch-card-text">
            <h3>超速提醒</h3>
            <p>监控超速行为</p>
          </div>
          <div class="switch-card-status">
            <span class="status-dot" :class="{ active: speeding.enabled }"></span>
            <span class="status-text">{{ speeding.enabled ? '开启' : '关闭' }}</span>
          </div>
        </div>
        <div class="switch-card-glow"></div>
      </div>

      <div
        class="switch-card staying-card fade-up"
        :class="{ active: staying.enabled, readonly: isReadonly }"
        style="animation-delay: 0.2s"
        @click="!isReadonly && (staying.enabled = !staying.enabled, handleSwitchChange('staying', staying.enabled))"
      >
        <div class="switch-card-bg-ring staying-ring"></div>
        <div class="switch-card-content">
          <div class="switch-card-icon staying-icon" :class="{ bouncing: staying.enabled }">
            <el-icon><Location /></el-icon>
          </div>
          <div class="switch-card-text">
            <h3>停留提醒</h3>
            <p>监控停留次数和时长</p>
          </div>
          <div class="switch-card-status">
            <span class="status-dot staying-dot" :class="{ active: staying.enabled }"></span>
            <span class="status-text">{{ staying.enabled ? '开启' : '关闭' }}</span>
          </div>
        </div>
        <div class="switch-card-glow staying-glow"></div>
      </div>
    </div>

    <!-- 超速提醒详细配置区 -->
    <transition name="block-expand">
      <div v-if="speeding.enabled" class="config-section speeding-section">
        <div class="section-banner speeding-banner">
          <div class="banner-left">
            <div class="banner-icon-wrap speeding-banner-icon">
              <el-icon><Odometer /></el-icon>
            </div>
            <div class="banner-text">
              <h3>超速提醒 · 详细配置</h3>
              <p>超过设定阈值时触发提醒</p>
            </div>
          </div>
          <div class="banner-badge speeding-badge">
            <span class="badge-dot"></span>
            <span>超速监控</span>
          </div>
        </div>

        <div class="config-grid">
          <!-- 提醒围栏（多选） -->
          <div
            class="config-block speeding-block fade-up"
            style="animation-delay: 0.05s; grid-column: span 2;"
          >
            <div class="block-header">
              <div class="block-icon-wrap speeding-icon-small">
                <el-icon><MapLocation /></el-icon>
              </div>
              <span class="block-label">提醒围栏</span>
              <span v-if="speeding.fence_ids.length > 0" class="block-badge speeding-block-badge">
                {{ speeding.fence_ids.length }} 个
              </span>
              <span v-else class="block-badge global-badge">
                全域提醒
              </span>
            </div>
            <div class="block-body">
              <el-popover
                v-model:visible="speedingPickerVisible"
                placement="bottom-start"
                :width="380"
                trigger="click"
                :disabled="isReadonly"
                popper-class="fence-picker-popper speeding-picker-popper"
                :hide-after="0"
              >
                <template #reference>
                  <div
                    class="fence-select-trigger"
                    :class="{ active: speeding.fence_ids.length > 0, readonly: isReadonly }"
                    :title="isReadonly ? '只读模式：提醒配置由主账号统一管理' : ''"
                    @click="!isReadonly && openPicker('speeding')"
                  >
                    <el-icon class="trigger-icon"><MapLocation /></el-icon>
                    <span v-if="speeding.fence_ids.length === 0" class="trigger-text">
                      点击选择围栏（不选 = 全域提醒）
                    </span>
                    <span v-else class="trigger-text active-text">
                      已选 {{ speeding.fence_ids.length }} 个围栏
                    </span>
                    <el-icon class="trigger-arrow" :class="{ rotate: speedingPickerVisible }">
                      <ArrowDown />
                    </el-icon>
                  </div>
                </template>

                <div class="fence-picker-content">
                  <div class="picker-search">
                    <el-input
                      v-model="speedingSearch"
                      placeholder="搜索围栏名称..."
                      clearable
                      size="small"
                    >
                      <template #prefix>
                        <el-icon><Search /></el-icon>
                      </template>
                    </el-input>
                  </div>

                  <div class="picker-toolbar">
                    <el-checkbox
                      :model-value="isAllSelected('speeding')"
                      :indeterminate="isIndeterminate('speeding')"
                      @change="(val) => toggleAll('speeding', val)"
                    >
                      全选
                    </el-checkbox>
                    <span class="picker-count">
                      已选 <b>{{ speedingTempSelected.length }}</b> / {{ filteredFences('speeding').length }}
                    </span>
                  </div>

                  <div class="picker-list">
                    <transition-group name="picker-item">
                      <div
                        v-for="f in filteredFences('speeding')"
                        :key="f.id"
                        class="picker-item"
                        :class="{ selected: speedingTempSelected.includes(f.id) }"
                        @click="toggleFence('speeding', f.id)"
                      >
                        <el-checkbox
                          :model-value="speedingTempSelected.includes(f.id)"
                          @click.stop
                          @change="() => toggleFence('speeding', f.id)"
                        />
                        <span class="picker-item-name">
                          <span class="ftype-tag alert">提醒</span>
                          <span class="ftype-name">{{ f.name }}</span>
                        </span>
                        <span v-if="speedingTempSelected.includes(f.id)" class="picker-item-check">
                          <el-icon><Select /></el-icon>
                        </span>
                      </div>
                    </transition-group>
                    <div v-if="filteredFences('speeding').length === 0" class="picker-empty">
                      <el-icon><Search /></el-icon>
                      <span>{{ fenceList.length === 0 ? '暂无提醒围栏，请先去创建' : '没有匹配的围栏' }}</span>
                    </div>
                  </div>

                  <div class="picker-footer">
                    <el-button size="small" @click="cancelPick('speeding')">取消</el-button>
                    <el-button type="primary" size="small" class="speeding-confirm-btn" @click="confirmPick('speeding')">
                      确定
                    </el-button>
                  </div>
                </div>
              </el-popover>

              <transition-group name="tag-fade" tag="div" class="selected-tags">
                <span
                  v-for="(id, idx) in speeding.fence_ids"
                  :key="id"
                  class="selected-tag speeding-tag"
                >
                  {{ speeding.fence_names[idx] }}
                  <el-icon v-if="!isReadonly" class="tag-close" @click.stop="removeFence('speeding', id)">
                    <Close />
                  </el-icon>
                </span>
              </transition-group>

              <div v-if="fenceList.length === 0" class="empty-hint">
                没有提醒围栏？
                <a class="link-btn" @click.stop="goToFenceSetting">去创建 →</a>
              </div>
              <div v-else-if="speeding.fence_ids.length === 0" class="global-hint speeding-global-hint">
                <el-icon><InfoFilled /></el-icon>
                未选择围栏 = <b>全域提醒</b>，所有车辆不分位置都会监控超速
              </div>
            </div>
          </div>

          <div class="config-block speeding-block fade-up" style="animation-delay: 0.1s">
            <div class="block-header">
              <div class="block-icon-wrap speeding-icon-small">
                <el-icon><Odometer /></el-icon>
              </div>
              <span class="block-label">超速阈值</span>
            </div>
            <div class="block-body">
              <div class="value-display">
                <span class="value-number speeding-number">{{ speeding.speed_threshold }}</span>
                <span class="value-unit">km/h</span>
              </div>
              <el-slider
                v-model="speeding.speed_threshold"
                :min="30" :max="120" :step="5"
                :show-tooltip="false"
                :disabled="isReadonly"
                class="block-slider"
              />
              <div class="slider-labels"><span>30</span><span>120</span></div>
            </div>
          </div>

          <div class="config-block speeding-block fade-up" style="animation-delay: 0.15s">
            <div class="block-header">
              <div class="block-icon-wrap time-icon-small">
                <el-icon><Clock /></el-icon>
              </div>
              <span class="block-label">开始时间</span>
            </div>
            <div class="block-body">
              <el-time-picker
                v-model="speeding.monitor_start"
                placeholder="选择时间"
                format="HH:mm:ss"
                value-format="HH:mm:ss"
                size="small"
                :disabled="isReadonly"
                style="width: 100%;"
              />
            </div>
          </div>

          <div class="config-block speeding-block fade-up" style="animation-delay: 0.2s">
            <div class="block-header">
              <div class="block-icon-wrap time-icon-small">
                <el-icon><Clock /></el-icon>
              </div>
              <span class="block-label">结束时间</span>
            </div>
            <div class="block-body">
              <el-time-picker
                v-model="speeding.monitor_end"
                placeholder="选择时间"
                format="HH:mm:ss"
                value-format="HH:mm:ss"
                size="small"
                :disabled="isReadonly"
                style="width: 100%;"
              />
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- 停留提醒详细配置区 -->
    <transition name="block-expand">
      <div v-if="staying.enabled" class="config-section staying-section">
        <div class="section-banner staying-banner">
          <div class="banner-left">
            <div class="banner-icon-wrap staying-banner-icon">
              <el-icon><Location /></el-icon>
            </div>
            <div class="banner-text">
              <h3>停留提醒 · 详细配置</h3>
              <p>停留时长或次数超过阈值时触发提醒</p>
            </div>
          </div>
          <div class="banner-badge staying-badge">
            <span class="badge-dot"></span>
            <span>停留监控</span>
          </div>
        </div>

        <div class="config-grid">
          <!-- 提醒围栏（多选） -->
          <div
            class="config-block staying-block fade-up"
            style="animation-delay: 0.05s; grid-column: span 2;"
          >
            <div class="block-header">
              <div class="block-icon-wrap staying-icon-small">
                <el-icon><MapLocation /></el-icon>
              </div>
              <span class="block-label">提醒围栏</span>
              <span v-if="staying.fence_ids.length > 0" class="block-badge staying-block-badge">
                {{ staying.fence_ids.length }} 个
              </span>
              <span v-else class="block-badge global-badge staying-global-badge">
                全域提醒
              </span>
            </div>
            <div class="block-body">
              <el-popover
                v-model:visible="stayingPickerVisible"
                placement="bottom-start"
                :width="380"
                trigger="click"
                :disabled="isReadonly"
                popper-class="fence-picker-popper staying-picker-popper"
                :hide-after="0"
              >
                <template #reference>
                  <div
                    class="fence-select-trigger staying-trigger"
                    :class="{ active: staying.fence_ids.length > 0, readonly: isReadonly }"
                    :title="isReadonly ? '只读模式：提醒配置由主账号统一管理' : ''"
                    @click="!isReadonly && openPicker('staying')"
                  >
                    <el-icon class="trigger-icon"><MapLocation /></el-icon>
                    <span v-if="staying.fence_ids.length === 0" class="trigger-text">
                      点击选择围栏（不选 = 全域提醒）
                    </span>
                    <span v-else class="trigger-text active-text">
                      已选 {{ staying.fence_ids.length }} 个围栏
                    </span>
                    <el-icon class="trigger-arrow" :class="{ rotate: stayingPickerVisible }">
                      <ArrowDown />
                    </el-icon>
                  </div>
                </template>

                <div class="fence-picker-content">
                  <div class="picker-search">
                    <el-input
                      v-model="stayingSearch"
                      placeholder="搜索围栏名称..."
                      clearable
                      size="small"
                    >
                      <template #prefix>
                        <el-icon><Search /></el-icon>
                      </template>
                    </el-input>
                  </div>

                  <div class="picker-toolbar">
                    <el-checkbox
                      :model-value="isAllSelected('staying')"
                      :indeterminate="isIndeterminate('staying')"
                      @change="(val) => toggleAll('staying', val)"
                    >
                      全选
                    </el-checkbox>
                    <span class="picker-count">
                      已选 <b>{{ stayingTempSelected.length }}</b> / {{ filteredFences('staying').length }}
                    </span>
                  </div>

                  <div class="picker-list">
                    <transition-group name="picker-item">
                      <div
                        v-for="f in filteredFences('staying')"
                        :key="f.id"
                        class="picker-item"
                        :class="{ selected: stayingTempSelected.includes(f.id) }"
                        @click="toggleFence('staying', f.id)"
                      >
                        <el-checkbox
                          :model-value="stayingTempSelected.includes(f.id)"
                          @click.stop
                          @change="() => toggleFence('staying', f.id)"
                        />
                        <span class="picker-item-name">
                          <span class="ftype-tag alert">提醒</span>
                          <span class="ftype-name">{{ f.name }}</span>
                        </span>
                        <span v-if="stayingTempSelected.includes(f.id)" class="picker-item-check">
                          <el-icon><Select /></el-icon>
                        </span>
                      </div>
                    </transition-group>
                    <div v-if="filteredFences('staying').length === 0" class="picker-empty">
                      <el-icon><Search /></el-icon>
                      <span>{{ fenceList.length === 0 ? '暂无提醒围栏，请先去创建' : '没有匹配的围栏' }}</span>
                    </div>
                  </div>

                  <div class="picker-footer">
                    <el-button size="small" @click="cancelPick('staying')">取消</el-button>
                    <el-button type="primary" size="small" class="staying-confirm-btn" @click="confirmPick('staying')">
                      确定
                    </el-button>
                  </div>
                </div>
              </el-popover>

              <transition-group name="tag-fade" tag="div" class="selected-tags">
                <span
                  v-for="(id, idx) in staying.fence_ids"
                  :key="id"
                  class="selected-tag staying-tag"
                >
                  {{ staying.fence_names[idx] }}
                  <el-icon v-if="!isReadonly" class="tag-close" @click.stop="removeFence('staying', id)">
                    <Close />
                  </el-icon>
                </span>
              </transition-group>

              <div v-if="staying.fence_ids.length === 0" class="global-hint staying-global-hint">
                <el-icon><InfoFilled /></el-icon>
                未选择围栏 = <b>全域提醒</b>，所有车辆不分位置都会监控停留
              </div>
            </div>
          </div>

          <div class="config-block staying-block fade-up" style="animation-delay: 0.1s">
            <div class="block-header">
              <div class="block-icon-wrap staying-icon-small">
                <el-icon><Refresh /></el-icon>
              </div>
              <span class="block-label">停留次数</span>
            </div>
            <div class="block-body">
              <div class="value-display">
                <span class="value-number staying-number">{{ staying.stay_count }}</span>
                <span class="value-unit">次</span>
              </div>
              <el-slider
                v-model="staying.stay_count"
                :min="1" :max="20" :step="1"
                :show-tooltip="false"
                :disabled="isReadonly"
                class="block-slider staying-slider"
              />
              <div class="slider-labels"><span>1</span><span>20</span></div>
            </div>
          </div>

          <div class="config-block staying-block fade-up" style="animation-delay: 0.15s">
            <div class="block-header">
              <div class="block-icon-wrap staying-icon-small">
                <el-icon><Timer /></el-icon>
              </div>
              <span class="block-label">停留时长</span>
            </div>
            <div class="block-body">
              <div class="value-display">
                <span class="value-number staying-number">{{ staying.stay_duration }}</span>
                <span class="value-unit">分钟</span>
              </div>
              <el-slider
                v-model="staying.stay_duration"
                :min="1" :max="120" :step="1"
                :show-tooltip="false"
                :disabled="isReadonly"
                class="block-slider staying-slider"
              />
              <div class="slider-labels"><span>1</span><span>120</span></div>
            </div>
          </div>

          <div class="config-block staying-block fade-up" style="animation-delay: 0.2s">
            <div class="block-header">
              <div class="block-icon-wrap staying-icon-small">
                <el-icon><Aim /></el-icon>
              </div>
              <span class="block-label">停留半径</span>
            </div>
            <div class="block-body">
              <div class="value-display">
                <span class="value-number staying-number">{{ staying.stay_radius }}</span>
                <span class="value-unit">米</span>
              </div>
              <el-slider
                v-model="staying.stay_radius"
                :min="5" :max="500" :step="5"
                :show-tooltip="false"
                :disabled="isReadonly"
                class="block-slider staying-slider"
              />
              <div class="slider-labels"><span>5</span><span>500</span></div>
            </div>
          </div>

          <div class="config-block staying-block fade-up" style="animation-delay: 0.25s">
            <div class="block-header">
              <div class="block-icon-wrap time-icon-small">
                <el-icon><Clock /></el-icon>
              </div>
              <span class="block-label">开始时间</span>
            </div>
            <div class="block-body">
              <el-time-picker
                v-model="staying.monitor_start"
                placeholder="选择时间"
                format="HH:mm:ss"
                value-format="HH:mm:ss"
                size="small"
                :disabled="isReadonly"
                style="width: 100%;"
              />
            </div>
          </div>

          <div class="config-block staying-block fade-up" style="animation-delay: 0.3s">
            <div class="block-header">
              <div class="block-icon-wrap time-icon-small">
                <el-icon><Clock /></el-icon>
              </div>
              <span class="block-label">结束时间</span>
            </div>
            <div class="block-body">
              <el-time-picker
                v-model="staying.monitor_end"
                placeholder="选择时间"
                format="HH:mm:ss"
                value-format="HH:mm:ss"
                size="small"
                :disabled="isReadonly"
                style="width: 100%;"
              />
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- 空状态 -->
    <div v-if="!speeding.enabled && !staying.enabled" class="empty-state fade-up" style="animation-delay: 0.3s">
      <div class="empty-icon-wrap">
        <el-icon><Bell /></el-icon>
      </div>
      <h3>开启一个提醒吧</h3>
      <p>点击上方的开关卡片，配置超速或停留提醒</p>
    </div>

    <!-- 保存成功动画 -->
    <Teleport to="body">
      <transition name="success">
        <div v-if="showSuccess" class="success-overlay">
          <div class="success-particles">
            <span v-for="i in 12" :key="i" class="particle" :style="{ '--i': i }"></span>
          </div>
          <div class="success-card">
            <div class="success-circle">
              <svg viewBox="0 0 52 52" class="checkmark">
                <circle cx="26" cy="26" r="25" fill="none" />
                <path fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
              </svg>
            </div>
            <p>设置保存成功！</p>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Bell, Refresh, Check, Odometer, Location,
  MapLocation, Clock, Timer, Aim, Search, Close, ArrowDown, Select, InfoFilled, Lock
} from '@element-plus/icons-vue'
import { supabase } from '@/utils/supabase'

// ============================================================
// 当前登录用户 & 隔离
// ============================================================
const currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('currentUser') || '{}') }
  catch { return {} }
})()
const isAdmin = currentUser.role === 'admin'
const isCustomer = !isAdmin
const isSubAccount = !!currentUser.isSubAccount
const myAccount = currentUser.masterAccount || currentUser.account || ''

// ⭐ 子账号机构信息
const myOrgName = ref(isSubAccount ? String(currentUser.orgName || '').trim() || null : null)
const myOrgLevel = ref(isSubAccount ? (Number(currentUser.orgLevel) || 1) : null)

// 一级机构子账号 → 等同主账号
const isRootOrgSubAccount = computed(() =>
  isSubAccount && Number(myOrgLevel.value) === 1
)
// 二级及以下 → 按 org 隔离
const needOrgFilter = computed(() =>
  isCustomer && isSubAccount && Number(myOrgLevel.value) >= 2
)

// ⭐ 二级机构子账号：只读（不能修改配置）
const isReadonly = computed(() => needOrgFilter.value)

// 兜底反查
const loadMyOrgInfo = async () => {
  if (!isCustomer || !isSubAccount) return
  if (myOrgName.value && myOrgLevel.value) return
  if (!currentUser.orgId) return
  try {
    const { data } = await supabase
      .from('organizations')
      .select('name, level')
      .eq('id', currentUser.orgId)
      .maybeSingle()
    if (data) {
      if (data.name) myOrgName.value = String(data.name).trim()
      myOrgLevel.value = Number(data.level) || 1
    }
  } catch (e) { }
}

const router = useRouter()

const saving = ref(false)
const showSuccess = ref(false)
const fenceList = ref([])

// 弹层可见性 & 搜索关键字 & 临时选中
const speedingPickerVisible = ref(false)
const stayingPickerVisible = ref(false)
const speedingSearch = ref('')
const stayingSearch = ref('')
const speedingTempSelected = ref([])
const stayingTempSelected = ref([])

// 超速设置
const speeding = reactive({
  enabled: false,
  fence_ids: [],
  fence_names: [],
  speed_threshold: 80,
  monitor_start: '05:00:00',
  monitor_end: '23:00:00',
})

// 停留设置
const staying = reactive({
  enabled: false,
  fence_ids: [],
  fence_names: [],
  stay_count: 1,
  stay_duration: 30,
  stay_radius: 200,
  monitor_start: '05:00:00',
  monitor_end: '23:00:00',
})

// ============================================
// 过滤围栏列表
// ============================================
const filteredFences = (type) => {
  const keyword = (type === 'speeding' ? speedingSearch.value : stayingSearch.value).trim().toLowerCase()
  if (!keyword) return fenceList.value
  return fenceList.value.filter(f => f.name.toLowerCase().includes(keyword))
}

// ============================================
// 全选/半选状态
// ============================================
const isAllSelected = (type) => {
  const filtered = filteredFences(type)
  if (filtered.length === 0) return false
  const temp = type === 'speeding' ? speedingTempSelected.value : stayingTempSelected.value
  return filtered.every(f => temp.includes(f.id))
}

const isIndeterminate = (type) => {
  const filtered = filteredFences(type)
  const temp = type === 'speeding' ? speedingTempSelected.value : stayingTempSelected.value
  const selectedCount = filtered.filter(f => temp.includes(f.id)).length
  return selectedCount > 0 && selectedCount < filtered.length
}

// ============================================
// 全选/取消全选
// ============================================
const toggleAll = (type, val) => {
  const filtered = filteredFences(type).map(f => f.id)
  const temp = type === 'speeding' ? speedingTempSelected.value : stayingTempSelected.value
  if (val) {
    const merged = [...new Set([...temp, ...filtered])]
    if (type === 'speeding') speedingTempSelected.value = merged
    else stayingTempSelected.value = merged
  } else {
    const next = temp.filter(id => !filtered.includes(id))
    if (type === 'speeding') speedingTempSelected.value = next
    else stayingTempSelected.value = next
  }
}

// ============================================
// 单个勾选/取消
// ============================================
const toggleFence = (type, id) => {
  const temp = type === 'speeding' ? speedingTempSelected.value : stayingTempSelected.value
  const idx = temp.indexOf(id)
  const next = idx === -1 ? [...temp, id] : temp.filter(i => i !== id)
  if (type === 'speeding') speedingTempSelected.value = next
  else stayingTempSelected.value = next
}

// ============================================
// 打开弹层
// ============================================
const openPicker = (type) => {
  if (type === 'speeding') {
    speedingTempSelected.value = [...speeding.fence_ids]
    speedingSearch.value = ''
  } else {
    stayingTempSelected.value = [...staying.fence_ids]
    stayingSearch.value = ''
  }
}

// ============================================
// 取消
// ============================================
const cancelPick = (type) => {
  if (type === 'speeding') speedingPickerVisible.value = false
  else stayingPickerVisible.value = false
}

// ============================================
// 确定
// ============================================
const confirmPick = (type) => {
  const temp = type === 'speeding' ? speedingTempSelected.value : stayingTempSelected.value
  const target = type === 'speeding' ? speeding : staying
  target.fence_ids = [...temp]
  target.fence_names = temp.map(id => fenceList.value.find(f => f.id === id)?.name || '未命名围栏')
  if (type === 'speeding') speedingPickerVisible.value = false
  else stayingPickerVisible.value = false

  ElMessage.success({
    message: `已选择 ${temp.length} 个围栏`,
    duration: 1500,
  })
}

// ============================================
// 移除 tag
// ============================================
const removeFence = (type, id) => {
  const target = type === 'speeding' ? speeding : staying
  const idx = target.fence_ids.indexOf(id)
  if (idx === -1) return
  target.fence_ids.splice(idx, 1)
  target.fence_names.splice(idx, 1)
}

// ============================================
// ⭐ 加载围栏列表（按 orgLevel 隔离）
// ============================================
const loadFenceList = async () => {
  try {
    let q = supabase
      .from('ele_fences')
      .select('id, name, gfid, org, fence_type')
      .order('updated_at', { ascending: false })

    if (isCustomer) {
      q = q.eq('owner_account', myAccount)
      // ⭐⭐⭐ 二级机构子账号：只看本机构的围栏
      if (needOrgFilter.value && myOrgName.value) {
        q = q.eq('org', myOrgName.value)
        console.log('[AlertSetting] 子账号挂 level=' + myOrgLevel.value + ' 机构 → 隔离围栏 org =', myOrgName.value)
      }
    }

    const { data, error } = await q
    if (error) throw error
    // ⭐ 提醒设置只能选「提醒围栏」；列缺失或空值按提醒兜底（与列表页口径一致）
    const all = data || []
    fenceList.value = all.filter(f => (f.fence_type || 'alert') === 'alert')
    console.log('[AlertSetting] 加载围栏:', all.length, '条 → 提醒围栏', fenceList.value.length, '条')
  } catch (e) {
    console.error('加载围栏列表失败：', e)
  }
}

// ============================================
// 加载已保存的提醒设置
// ⚠️ 提醒配置是"客户级"共享的（一个客户一套），不按机构隔离
//    ele_fence_alerts 表没有 org 字段，主账号和一级机构子账号等价
//    二级机构子账号目前会读到主账号的配置（保持旧行为）
// ============================================
const loadAlertSettings = async () => {
  try {
    let q = supabase.from('ele_fence_alerts').select('*')
    if (isCustomer) q = q.eq('owner_account', myAccount)
    const { data, error } = await q
    if (error) throw error

    console.log('[AlertSetting] 加载配置:', data?.length || 0, '条')

    if (data && data.length > 0) {
      data.forEach(item => {
        if (item.alert_type === 'speeding') {
          speeding.enabled = item.enabled
          speeding.fence_ids = parseJsonArray(item.fence_id)
          speeding.fence_names = parseJsonArray(item.fence_name)
          speeding.speed_threshold = item.speed_threshold || 80
          speeding.monitor_start = item.monitor_start || '05:00:00'
          speeding.monitor_end = item.monitor_end || '23:00:00'
        } else if (item.alert_type === 'staying') {
          staying.enabled = item.enabled
          staying.fence_ids = parseJsonArray(item.fence_id)
          staying.fence_names = parseJsonArray(item.fence_name)
          staying.stay_count = item.stay_count || 1
          staying.stay_duration = item.stay_duration || 30
          staying.stay_radius = item.stay_radius || 200
          staying.monitor_start = item.monitor_start || '05:00:00'
          staying.monitor_end = item.monitor_end || '23:00:00'
        }
      })
    }
  } catch (e) {
    console.error('加载提醒设置失败：', e)
  }
}

// 兼容旧数据
const parseJsonArray = (str) => {
  if (!str) return []
  try {
    const arr = JSON.parse(str)
    return Array.isArray(arr) ? arr : [str]
  } catch (e) {
    return str ? [str] : []
  }
}

const handleSwitchChange = (type, val) => {
  if (val) {
    ElMessage.success({
      message: (type === 'speeding' ? '超速' : '停留') + '提醒已开启',
      duration: 1500,
    })
  } else {
    ElMessage.info({
      message: (type === 'speeding' ? '超速' : '停留') + '提醒已关闭',
      duration: 1500,
    })
  }
}

const goToFenceSetting = () => {
  router.push('/ele-fence/setting')
}

// ============================================
// ⭐ 保存（支持全域提醒：不选围栏弹确认）
// ⚠️ 提醒配置是"客户级"共享的，不按机构隔离（保持旧行为）
// ============================================
const handleSave = async () => {
  // ⭐ 只读模式拦截
  if (isReadonly.value) {
    ElMessage.warning('提醒配置由主账号统一管理，您当前为只读模式')
    return
  }

  // ⭐ 超速：未选围栏 → 弹确认框
  if (speeding.enabled && speeding.fence_ids.length === 0) {
    try {
      await ElMessageBox.confirm(
        '超速提醒未选择任何围栏，将启用【全域提醒】——所有车辆不分位置都会监控超速行为。是否确认提交？',
        '全域提醒确认',
        {
          confirmButtonText: '确认提交',
          cancelButtonText: '返回选择',
          type: 'warning',
          confirmButtonClass: 'btn-warn-confirm',
          customClass: 'global-alert-confirm-box',
        }
      )
    } catch { return }
  }

  // ⭐ 停留：未选围栏 → 弹确认框
  if (staying.enabled && staying.fence_ids.length === 0) {
    try {
      await ElMessageBox.confirm(
        '停留提醒未选择任何围栏，将启用【全域提醒】——所有车辆不分位置都会监控停留行为。是否确认提交？',
        '全域提醒确认',
        {
          confirmButtonText: '确认提交',
          cancelButtonText: '返回选择',
          type: 'warning',
          confirmButtonClass: 'btn-warn-confirm',
          customClass: 'global-alert-confirm-box',
        }
      )
    } catch { return }
  }

  saving.value = true
  try {
    const now = new Date().toISOString()
    const records = [
      {
        alert_type: 'speeding',
        enabled: speeding.enabled,
        fence_id: JSON.stringify(speeding.fence_ids),
        fence_name: JSON.stringify(speeding.fence_names),
        fence_gfid: null,
        speed_threshold: speeding.speed_threshold,
        monitor_start: speeding.monitor_start,
        monitor_end: speeding.monitor_end,
        updated_at: now,
        owner_account: myAccount,
      },
      {
        alert_type: 'staying',
        enabled: staying.enabled,
        fence_id: JSON.stringify(staying.fence_ids),
        fence_name: JSON.stringify(staying.fence_names),
        fence_gfid: null,
        stay_count: staying.stay_count,
        stay_duration: staying.stay_duration,
        stay_radius: staying.stay_radius,
        monitor_start: staying.monitor_start,
        monitor_end: staying.monitor_end,
        updated_at: now,
        owner_account: myAccount,
      },
    ]

    // ⭐ 只删当前客户的记录
    let deleteQ = supabase.from('ele_fence_alerts').delete().in('alert_type', ['speeding', 'staying'])
    if (isCustomer) deleteQ = deleteQ.eq('owner_account', myAccount)
    await deleteQ
    const { error } = await supabase.from('ele_fence_alerts').insert(records)
    if (error) throw error

    showSuccess.value = true
    setTimeout(() => { showSuccess.value = false }, 2000)

    if (speeding.enabled && speeding.fence_ids.length === 0) {
      ElMessage.info({ message: '已启用超速全域提醒', duration: 2000 })
    }
    if (staying.enabled && staying.fence_ids.length === 0) {
      ElMessage.info({ message: '已启用停留全域提醒', duration: 2000 })
    }
  } catch (e) {
    console.error(e)
    ElMessage.error('保存失败：' + e.message)
  } finally {
    saving.value = false
  }
}

const handleReset = () => {
  // ⭐ 只读模式拦截
  if (isReadonly.value) {
    ElMessage.warning('提醒配置由主账号统一管理，您当前为只读模式')
    return
  }

  speeding.enabled = false
  speeding.fence_ids = []
  speeding.fence_names = []
  speeding.speed_threshold = 80
  speeding.monitor_start = '05:00:00'
  speeding.monitor_end = '23:00:00'

  staying.enabled = false
  staying.fence_ids = []
  staying.fence_names = []
  staying.stay_count = 1
  staying.stay_duration = 30
  staying.stay_radius = 200
  staying.monitor_start = '05:00:00'
  staying.monitor_end = '23:00:00'

  ElMessage.info('已重置，请重新配置')
}

onMounted(async () => {
  if (isCustomer && isSubAccount) await loadMyOrgInfo()
  await loadFenceList()
  await loadAlertSettings()
})
</script>

<style scoped>
.alert-setting-page {
  padding: 6px 16px 16px;
  background-color: #f8fafc;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-size: 14px;
  color: #1E293B;
}

/* ========== 只读提示横幅 ========== */
.readonly-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  background: linear-gradient(135deg, #FEF3C7, #FDE68A);
  border: 1px solid #FCD34D;
  border-left: 4px solid #F59E0B;
  border-radius: 12px;
  color: #92400E;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 4px 16px rgba(245, 158, 11, 0.15);
  animation: bannerFadeIn 0.5s ease-out;
}
.readonly-banner .el-icon {
  font-size: 18px;
  color: #D97706;
  flex-shrink: 0;
}
.readonly-banner strong {
  color: #B45309;
  font-weight: 800;
  margin: 0 2px;
}
@keyframes bannerFadeIn {
  from { opacity: 0; transform: translateY(-10px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ========== 页面头部 ⭐ 滚动时固定 ========== */
.page-header {
  background: #ffffff;
  border-radius: 12px;
  padding: 14px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  position: sticky;
  top: 0;
  z-index: 100;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 6px;
}
.header-icon-wrap {
  position: relative;
  padding: 6px;
  background: #FEE2E2;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.header-icon {
  font-size: 24px;
  color: #991B1B;
  position: relative;
  z-index: 1;
  animation: bellShake 3s ease-in-out infinite;
}
@keyframes bellShake {
  0%, 90%, 100% { transform: rotate(0); }
  92%, 96% { transform: rotate(-15deg); }
  94%, 98% { transform: rotate(15deg); }
}
.header-icon-pulse {
  position: absolute;
  inset: 0;
  border-radius: 10px;
  background: rgba(211, 47, 47, 0.3);
  animation: iconPulse 2s ease-out infinite;
}
@keyframes iconPulse {
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(1.4); opacity: 0; }
}
.header-title-text h2 {
  font-size: 18px;
  font-weight: 700;
  color: #0F172A;
  margin: 0 0 2px 0;
  line-height: 1.2;
}
.header-title-text p {
  font-size: 12px;
  color: #64748B;
  margin: 0;
  line-height: 1.2;
  font-weight: 500;
}
.header-actions {
  display: flex;
  gap: 10px;
}

:deep(.el-button) {
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  border-radius: 6px;
  font-weight: 600;
}
:deep(.el-button:hover) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(var(--brand-rgb), 0.15);
}
:deep(.btn-primary) {
  background-color: var(--brand-primary);
  border-color: var(--brand-primary);
  color: #fff;
}
:deep(.btn-primary:hover) {
  background-color: #a00d24;
  border-color: #a00d24;
}
:deep(.btn-outline) {
  border-color: #CBD5E1;
  color: #334155;
}
:deep(.btn-outline:hover) {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
  background-color: var(--brand-primary-light);
}

/* ========== 开关卡片区 ========== */
.switch-cards-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: flex-start;
}

.switch-card {
  position: relative;
  background: #ffffff;
  border-radius: 14px;
  padding: 14px 16px;
  cursor: pointer;
  overflow: hidden;
  border: 2px solid #E2E8F0;
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  width: 260px;
  flex-shrink: 0;
}

.switch-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08);
}

.speeding-card.active {
  border-color: #FCA5A5;
  box-shadow: 0 8px 24px rgba(211, 47, 47, 0.15);
}
.staying-card.active {
  border-color: #93C5FD;
  box-shadow: 0 8px 24px rgba(37, 99, 235, 0.15);
}

/* ⭐ 只读态开关卡片 */
.switch-card.readonly {
  cursor: not-allowed;
}
.switch-card.readonly:hover {
  transform: none;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
}
.switch-card.readonly .switch-card-bg-ring,
.switch-card.readonly .switch-card-icon {
  animation: none;
}

.switch-card-bg-ring {
  position: absolute;
  top: -50%;
  right: -30%;
  width: 160px;
  height: 160px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(211, 47, 47, 0.08) 0%, transparent 70%);
  transition: transform 0.6s ease;
}
.switch-card:hover .switch-card-bg-ring {
  transform: scale(1.3);
}
.switch-card.active .switch-card-bg-ring {
  background: radial-gradient(circle, rgba(211, 47, 47, 0.15) 0%, transparent 70%);
  animation: ringRotate 8s linear infinite;
}
.switch-card-bg-ring.staying-ring {
  background: radial-gradient(circle, rgba(37, 99, 235, 0.08) 0%, transparent 70%);
}
.switch-card.active .switch-card-bg-ring.staying-ring {
  background: radial-gradient(circle, rgba(37, 99, 235, 0.15) 0%, transparent 70%);
}
@keyframes ringRotate {
  from { transform: rotate(0deg) scale(1.3); }
  to { transform: rotate(360deg) scale(1.3); }
}

.switch-card-content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 10px;
}

.switch-card-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  flex-shrink: 0;
}

.speeding-icon {
  background: linear-gradient(135deg, var(--brand-primary-light), var(--brand-primary-light));
  color: #991B1B;
}
.staying-icon {
  background: linear-gradient(135deg, #DBEAFE, #93C5FD);
  color: #1E40AF;
}
.switch-card.active .speeding-icon {
  animation: iconSpin 2s ease-in-out infinite;
}
.switch-card.active .staying-icon {
  animation: iconBounce 1.5s ease-in-out infinite;
}
@keyframes iconSpin {
  0%, 100% { transform: rotate(0) scale(1); }
  50% { transform: rotate(15deg) scale(1.1); }
}
@keyframes iconBounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

.switch-card-text {
  flex: 1;
  min-width: 0;
}
.switch-card-text h3 {
  font-size: 15px;
  font-weight: 700;
  color: #0F172A;
  margin: 0 0 2px 0;
  transition: color 0.3s;
}
.speeding-card.active .switch-card-text h3 {
  color: #991B1B;
}
.staying-card.active .switch-card-text h3 {
  color: #1E40AF;
}
.switch-card-text p {
  font-size: 11px;
  color: #64748B;
  margin: 0;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.switch-card-status {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #94A3B8;
  transition: all 0.3s;
}
.status-dot.active {
  background: #059669;
  box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.2);
  animation: dotPulse 1.5s ease-in-out infinite;
}
.status-dot.staying-dot.active {
  background: #2563EB;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
}
@keyframes dotPulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.2); }
  50% { box-shadow: 0 0 0 7px rgba(5, 150, 105, 0.05); }
}
.status-text {
  font-size: 11px;
  font-weight: 700;
  color: #64748B;
  transition: color 0.3s;
  letter-spacing: 0.3px;
}
.speeding-card.active .status-text {
  color: #991B1B;
}
.staying-card.active .status-text {
  color: #1E40AF;
}

.switch-card-glow {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 0;
  height: 3px;
  background: linear-gradient(90deg, #EF4444, #B91C1C);
  transition: width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.switch-card.active .switch-card-glow {
  width: 100%;
}
.switch-card-glow.staying-glow {
  background: linear-gradient(90deg, #3B82F6, #1D4ED8);
}

/* ========== 详细配置区 ========== */
.config-section {
  position: relative;
  border-radius: 16px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.speeding-section {
  background: linear-gradient(135deg, var(--brand-primary-light) 0%, var(--brand-primary-light) 100%);
  border: 1px solid #FECACA;
  box-shadow: 0 4px 20px rgba(211, 47, 47, 0.06);
}
.speeding-section::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: linear-gradient(180deg, #EF4444, #B91C1C);
  border-radius: 16px 0 0 16px;
  box-shadow: 0 0 12px rgba(211, 47, 47, 0.3);
}

.staying-section {
  background: linear-gradient(135deg, #F5FAFF 0%, #EFF6FF 100%);
  border: 1px solid #BFDBFE;
  box-shadow: 0 4px 20px rgba(37, 99, 235, 0.06);
}
.staying-section::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: linear-gradient(180deg, #3B82F6, #1D4ED8);
  border-radius: 16px 0 0 16px;
  box-shadow: 0 0 12px rgba(37, 99, 235, 0.3);
}

.section-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-radius: 10px;
  position: relative;
  z-index: 1;
}

.speeding-banner {
  background: #ffffff;
  border: 1px dashed #FCA5A5;
}
.staying-banner {
  background: #ffffff;
  border: 1px dashed #93C5FD;
}

.banner-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.banner-icon-wrap {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.speeding-banner-icon {
  background: linear-gradient(135deg, var(--brand-primary-light), var(--brand-primary-light));
  color: #991B1B;
  animation: bannerIconPulse 2s ease-in-out infinite;
}
.staying-banner-icon {
  background: linear-gradient(135deg, #DBEAFE, #93C5FD);
  color: #1E40AF;
  animation: bannerIconBounce 2s ease-in-out infinite;
}
@keyframes bannerIconPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); }
}
@keyframes bannerIconBounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

.banner-text h3 {
  font-size: 14px;
  font-weight: 700;
  color: #0F172A;
  margin: 0 0 2px 0;
}
.banner-text p {
  font-size: 11px;
  color: #64748B;
  margin: 0;
  font-weight: 500;
}

.banner-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
}
.speeding-badge {
  background: #FEE2E2;
  color: #991B1B;
  border: 1px solid #FCA5A5;
}
.staying-badge {
  background: #DBEAFE;
  color: #1E40AF;
  border: 1px solid #93C5FD;
}

.badge-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  animation: badgeDotPulse 1.5s ease-in-out infinite;
}
@keyframes badgeDotPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.8); }
}

/* 配置网格 */
.config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
  position: relative;
  z-index: 1;
}

.config-block {
  background: #ffffff;
  border-radius: 12px;
  padding: 12px;
  border: 1px solid #E2E8F0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;
  overflow: hidden;
}

.speeding-block::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: linear-gradient(90deg, #EF4444, #B91C1C);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.speeding-block:hover::before {
  transform: scaleX(1);
}
.speeding-block:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 28px rgba(211, 47, 47, 0.12);
  border-color: #FCA5A5;
}

.staying-block::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: linear-gradient(90deg, #3B82F6, #1D4ED8);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.staying-block:hover::before {
  transform: scaleX(1);
}
.staying-block:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 28px rgba(37, 99, 235, 0.12);
  border-color: #93C5FD;
}

.block-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.block-badge {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
}
.speeding-block-badge {
  background: #FEE2E2;
  color: #991B1B;
  border: 1px solid #FCA5A5;
}
.staying-block-badge {
  background: #DBEAFE;
  color: #1E40AF;
  border: 1px solid #93C5FD;
}
.global-badge {
  background: #FEF3C7;
  color: #92400E;
  border: 1px solid #FCD34D;
  animation: badgePulse 2s ease-in-out infinite;
}
.staying-global-badge {
  background: #EFF6FF;
  color: #1E40AF;
  border: 1px solid #93C5FD;
}
@keyframes badgePulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4); }
  50% { box-shadow: 0 0 0 4px rgba(245, 158, 11, 0); }
}

.block-icon-wrap {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: transform 0.3s;
}
.config-block:hover .block-icon-wrap {
  transform: scale(1.15) rotate(-5deg);
}

.speeding-icon-small {
  background: #FEE2E2;
  color: #991B1B;
}
.staying-icon-small {
  background: #DBEAFE;
  color: #1E40AF;
}
.time-icon-small {
  background: #D1FAE5;
  color: #065F46;
}

.block-label {
  font-size: 12px;
  font-weight: 700;
  color: #334155;
}

.block-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 围栏选择触发器 */
.fence-select-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #F1F5F9;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  user-select: none;
}

.fence-select-trigger:hover {
  background: #ffffff;
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 3px rgba(var(--brand-rgb), 0.08);
  transform: translateY(-1px);
}

.fence-select-trigger.staying-trigger:hover {
  border-color: #2563EB;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.08);
}

.fence-select-trigger.active {
  background: var(--brand-primary-light);
  border-color: #FCA5A5;
}
.fence-select-trigger.active.staying-trigger {
  background: #EFF6FF;
  border-color: #93C5FD;
}

/* ⭐ 只读态围栏触发器 */
.fence-select-trigger.readonly {
  cursor: not-allowed;
  opacity: 0.85;
}
.fence-select-trigger.readonly:hover {
  background: #F1F5F9;
  border-color: transparent;
  box-shadow: none;
  transform: none;
}

.trigger-icon {
  font-size: 14px;
  color: #64748B;
}
.fence-select-trigger.active .trigger-icon {
  color: var(--brand-primary);
}
.fence-select-trigger.active.staying-trigger .trigger-icon {
  color: #2563EB;
}

.trigger-text {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: #64748B;
}
.fence-select-trigger.active .trigger-text {
  color: #0F172A;
}
.active-text {
  color: #991B1B;
}
.staying-trigger .active-text {
  color: #1E40AF;
}

.trigger-arrow {
  font-size: 12px;
  color: #94A3B8;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.trigger-arrow.rotate {
  transform: rotate(180deg);
  color: var(--brand-primary);
}
.staying-trigger .trigger-arrow.rotate {
  color: #2563EB;
}

/* 已选 tag 展示 */
.selected-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

.selected-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.2px;
  transition: all 0.2s;
}

.speeding-tag {
  background: #FEE2E2;
  color: #991B1B;
  border: 1px solid #FCA5A5;
}
.speeding-tag:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(211, 47, 47, 0.2);
}

.staying-tag {
  background: #DBEAFE;
  color: #1E40AF;
  border: 1px solid #93C5FD;
}
.staying-tag:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.2);
}

.tag-close {
  cursor: pointer;
  font-size: 12px;
  color: currentColor;
  opacity: 0.6;
  transition: all 0.2s;
}
.tag-close:hover {
  opacity: 1;
  transform: scale(1.2);
}

.tag-fade-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.tag-fade-leave-active {
  transition: all 0.2s ease;
}
.tag-fade-enter-from {
  opacity: 0;
  transform: translateY(-8px) scale(0.8);
}
.tag-fade-leave-to {
  opacity: 0;
  transform: translateX(10px) scale(0.9);
}

/* 全域提示 */
.global-hint {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  background: #FEF3C7;
  color: #92400E;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 600;
  border-left: 3px solid #F59E0B;
}
.global-hint b {
  color: #B45309;
  font-weight: 800;
  margin: 0 2px;
}
.global-hint .el-icon { font-size: 13px; flex-shrink: 0; }

.staying-global-hint {
  background: #EFF6FF;
  color: #1E40AF;
  border-left-color: #3B82F6;
}
.staying-global-hint b { color: #1D4ED8; }

/* 数值显示 */
.value-display {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 2px;
}
.value-number {
  font-size: 22px;
  font-weight: 800;
  font-family: 'Courier New', monospace;
  transition: transform 0.2s;
  display: inline-block;
}
.speeding-number { color: #991B1B; }
.staying-number { color: #1E40AF; }
.config-block:hover .value-number { transform: scale(1.08); }
.value-unit {
  font-size: 11px;
  color: #64748B;
  margin-left: 2px;
  font-weight: 600;
}

.block-slider { margin: 0; }
:deep(.block-slider .el-slider__runway) {
  background: linear-gradient(90deg, var(--brand-primary-light) 0%, var(--brand-primary-light) 100%);
  height: 5px;
  border-radius: 3px;
}
:deep(.block-slider .el-slider__bar) {
  background: linear-gradient(90deg, #EF4444, #B91C1C);
  height: 5px;
}
:deep(.staying-slider .el-slider__runway) {
  background: linear-gradient(90deg, #DBEAFE 0%, #93C5FD 100%);
}
:deep(.staying-slider .el-slider__bar) {
  background: linear-gradient(90deg, #3B82F6, #1D4ED8);
}
:deep(.block-slider .el-slider__button) {
  width: 14px;
  height: 14px;
  border: 3px solid var(--brand-primary);
  background: #FFFFFF;
  box-shadow: 0 2px 8px rgba(211, 47, 47, 0.35);
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
:deep(.staying-slider .el-slider__button) {
  border-color: #2563EB;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.35);
}
:deep(.block-slider .el-slider__button:hover) { transform: scale(1.3); }

.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #94A3B8;
  margin-top: 2px;
  font-weight: 600;
}

.empty-hint {
  font-size: 11px;
  color: #64748B;
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
}
.link-btn {
  color: var(--brand-primary);
  cursor: pointer;
  font-weight: 700;
  transition: all 0.2s;
}
.link-btn:hover {
  color: #7F1D1D;
  text-decoration: underline;
}

/* ========== 空状态 ========== */
.empty-state {
  background: #ffffff;
  border-radius: 16px;
  padding: 60px 20px;
  text-align: center;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
}
.empty-icon-wrap {
  display: inline-flex;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--brand-primary-light), var(--brand-primary-light));
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  animation: emptyFloat 3s ease-in-out infinite;
}
.empty-icon-wrap .el-icon {
  font-size: 40px;
  color: #991B1B;
}
@keyframes emptyFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
.empty-state h3 {
  font-size: 16px;
  color: #0F172A;
  margin: 0 0 8px 0;
  font-weight: 700;
}
.empty-state p {
  font-size: 13px;
  color: #64748B;
  margin: 0;
  font-weight: 500;
}

/* ========== 展开动画 ========== */
.block-expand-enter-active {
  transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.block-expand-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.block-expand-enter-from {
  opacity: 0;
  transform: translateY(-20px) scale(0.95);
}
.block-expand-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.98);
}

/* ========== 页面入场动画 ========== */
.fade-up {
  animation: fadeUp 0.5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
  opacity: 0;
  transform: translateY(20px);
}
@keyframes fadeUp {
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 768px) {
  .switch-cards-grid { flex-direction: column; }
  .switch-card { width: 100%; }
  .config-grid { grid-template-columns: 1fr; }
  .section-banner {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
}
</style>

<style>
/* ========== 围栏选择弹层 ========== */
.fence-picker-popper.el-popover {
  padding: 0 !important;
  border-radius: 12px !important;
  border: 1px solid #E2E8F0 !important;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12) !important;
  overflow: hidden;
  background: #ffffff;
}

.fence-picker-content {
  display: flex;
  flex-direction: column;
  max-height: 420px;
}

.picker-search {
  padding: 12px 12px 8px;
  border-bottom: 1px solid #F1F5F9;
}

.picker-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #F8FAFC;
  border-bottom: 1px solid #F1F5F9;
}
.picker-toolbar .el-checkbox__label {
  font-size: 13px !important;
  font-weight: 700 !important;
  color: #334155 !important;
}
.speeding-picker-popper .picker-toolbar .el-checkbox__input.is-checked .el-checkbox__inner,
.speeding-picker-popper .picker-toolbar .el-checkbox__input.is-indeterminate .el-checkbox__inner {
  background-color: var(--brand-primary) !important;
  border-color: var(--brand-primary) !important;
}
.staying-picker-popper .picker-toolbar .el-checkbox__input.is-checked .el-checkbox__inner,
.staying-picker-popper .picker-toolbar .el-checkbox__input.is-indeterminate .el-checkbox__inner {
  background-color: #2563EB !important;
  border-color: #2563EB !important;
}

.picker-count {
  font-size: 12px;
  color: #64748B;
  font-weight: 600;
}
.picker-count b {
  color: var(--brand-primary);
  font-weight: 800;
  margin: 0 2px;
}
.staying-picker-popper .picker-count b {
  color: #2563EB;
}

.picker-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
  max-height: 240px;
}

.picker-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;
}
.picker-item:hover {
  background: #F8FAFC;
  transform: translateX(2px);
}
.picker-item.selected {
  background: var(--brand-primary-light);
}
.staying-picker-popper .picker-item.selected {
  background: #EFF6FF;
}
.picker-item.selected .el-checkbox__input.is-checked .el-checkbox__inner {
  background-color: var(--brand-primary) !important;
  border-color: var(--brand-primary) !important;
}
.staying-picker-popper .picker-item.selected .el-checkbox__input.is-checked .el-checkbox__inner {
  background-color: #2563EB !important;
  border-color: #2563EB !important;
}
.picker-item.selected .el-checkbox__input.is-checked + .el-checkbox__label {
  color: var(--brand-primary) !important;
}
.staying-picker-popper .picker-item.selected .el-checkbox__input.is-checked + .el-checkbox__label {
  color: #2563EB !important;
}

.picker-item-name {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
  color: #1E293B;
}

.ftype-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ⭐ 围栏类型标签：与「围栏设置」列表里的样式保持一致 */
.ftype-tag {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.3px;
  line-height: 1;
  flex: 0 0 auto;
}

.ftype-tag.alert {
  background: #FFF7ED;
  color: #B45309;
  border: 1px solid #FBD5A5;
}

.picker-item-check {
  color: var(--brand-primary);
  font-size: 14px;
  animation: checkPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.staying-picker-popper .picker-item-check {
  color: #2563EB;
}
@keyframes checkPop {
  from { opacity: 0; transform: scale(0.5); }
  to { opacity: 1; transform: scale(1); }
}

.picker-empty {
  padding: 40px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #94A3B8;
  font-size: 13px;
}
.picker-empty .el-icon {
  font-size: 32px;
  color: #CBD5E1;
}

.picker-item-enter-active,
.picker-item-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.picker-item-enter-from {
  opacity: 0;
  transform: translateX(-10px);
}
.picker-item-leave-to {
  opacity: 0;
  transform: translateX(10px);
}
.picker-item-move {
  transition: transform 0.3s;
}

.picker-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid #F1F5F9;
  background: #F8FAFC;
}
.speeding-confirm-btn {
  background-color: var(--brand-primary) !important;
  border-color: var(--brand-primary) !important;
}
.speeding-confirm-btn:hover {
  background-color: #a00d24 !important;
  border-color: #a00d24 !important;
}
.staying-confirm-btn {
  background-color: #2563EB !important;
  border-color: #2563EB !important;
}
.staying-confirm-btn:hover {
  background-color: #1D4ED8 !important;
  border-color: #1D4ED8 !important;
}

/* ========== 全域提醒确认框 ========== */
.global-alert-confirm-box {
  border-radius: 12px !important;
}
.global-alert-confirm-box .el-message-box__title {
  font-weight: 700 !important;
  color: #0F172A !important;
  font-size: 16px !important;
}
.global-alert-confirm-box .el-message-box__content {
  font-size: 14px !important;
  color: #334155 !important;
  line-height: 1.6 !important;
  font-weight: 500 !important;
}
.btn-warn-confirm {
  background: linear-gradient(135deg, #F59E0B, #D97706) !important;
  border-color: #F59E0B !important;
  color: #ffffff !important;
  font-weight: 700 !important;
}
.btn-warn-confirm:hover {
  background: linear-gradient(135deg, #D97706, #B45309) !important;
  border-color: #D97706 !important;
}

/* ========== 保存成功动画 ========== */
.success-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
  pointer-events: none;
}
.success-overlay .success-card {
  position: relative;
  background: #ffffff;
  border-radius: 20px;
  padding: 32px 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  box-shadow: 0 20px 60px rgba(5, 150, 105, 0.25);
  animation: successCardPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes successCardPop {
  from { opacity: 0; transform: scale(0.85); }
  to { opacity: 1; transform: scale(1); }
}
.success-overlay .success-card p {
  font-size: 16px;
  font-weight: 700;
  color: #059669;
  margin: 0;
  animation: successTextIn 0.5s ease-out 0.6s both;
}
@keyframes successTextIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.success-circle {
  width: 64px;
  height: 64px;
  position: relative;
  z-index: 2;
}
.checkmark {
  width: 100%;
  height: 100%;
  stroke: #059669;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
  filter: drop-shadow(0 4px 12px rgba(5, 150, 105, 0.3));
}
.checkmark circle {
  stroke-dasharray: 166;
  stroke-dashoffset: 166;
  animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
}
.checkmark path {
  stroke-dasharray: 48;
  stroke-dashoffset: 48;
  animation: stroke 0.4s cubic-bezier(0.65, 0, 0.45, 1) 0.5s forwards;
}
@keyframes stroke { 100% { stroke-dashoffset: 0; } }

.success-particles {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 0;
  height: 0;
  z-index: 1;
}
.particle {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #059669;
  animation: particleBurst 1.2s ease-out forwards;
  animation-delay: 0.3s;
}
.particle:nth-child(3n) { background: #10B981; }
.particle:nth-child(3n+1) { background: #34D399; }
.particle:nth-child(3n+2) { background: #6EE7B7; }

@keyframes particleBurst {
  0% {
    transform: rotate(calc(var(--i) * 30deg)) translateY(0) scale(1);
    opacity: 1;
  }
  100% {
    transform: rotate(calc(var(--i) * 30deg)) translateY(-140px) scale(0);
    opacity: 0;
  }
}

.success-enter-active { transition: opacity 0.3s; }
.success-leave-active { transition: opacity 0.3s; }
.success-enter-from,
.success-leave-to { opacity: 0; }
</style>