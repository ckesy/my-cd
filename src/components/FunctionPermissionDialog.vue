<template>
    <!-- ⭐ append-to-body：脱离 .content-wrapper 的 transform 包含块，
         否则 fixed 定位会相对内容区，弹窗一高就把整页顶出滚动条 -->
    <el-dialog :model-value="modelValue" width="900px" top="8vh" destroy-on-close :close-on-click-modal="false"
        append-to-body class="perm-dialog" @update:model-value="$emit('update:modelValue', $event)">
        <template #header>
            <div class="pd-header">
                <div class="pd-header-left">
                    <div class="pd-header-icon">
                        <el-icon>
                            <Setting />
                        </el-icon>
                    </div>
                    <div class="pd-header-text">
                        <div class="pd-title">功能配置</div>
                        <div class="pd-sub">{{ roleName || '未命名角色' }}</div>
                    </div>
                </div>
                <div class="pd-header-right">
                    <span class="pd-counter">
                        已选 <b>{{ selectedKeys.length }}</b> / {{ totalCount }}
                    </span>
                    <button type="button" class="pd-toggle-all" :class="{ on: isAllSelected }" @click="toggleAll">
                        {{ isAllSelected ? '取消全选' : '全选' }}
                    </button>
                </div>
            </div>
        </template>

        <div class="pd-body">
            <!-- 左侧模块导航 -->
            <aside class="pd-sidebar">
                <div class="pd-sidebar-list">
                    <button v-for="(mod, idx) in modules" :key="mod.key" type="button" class="pd-mod-item" :class="{
                        active: activeModuleKey === mod.key,
                        disabled: mod.disabled,
                    }" :style="{ animationDelay: (idx * 0.03) + 's' }" @click="handleModuleClick(mod)">
                        <span class="pd-mod-icon">
                            <el-icon>
                                <component :is="getIcon(mod.icon)" />
                            </el-icon>
                        </span>
                        <span class="pd-mod-name">{{ mod.name }}</span>
                        <span v-if="mod.disabled" class="pd-mod-lock">
                            <el-icon>
                                <Lock />
                            </el-icon>
                        </span>
                        <span v-else class="pd-mod-count" :class="{ empty: getModuleCount(mod) === 0 }">
                            {{ getModuleCount(mod) }}/{{ mod.items.length }}
                        </span>
                        <span v-if="!mod.disabled && getModuleCount(mod) === mod.items.length" class="pd-mod-done">
                            <el-icon><Select /></el-icon>
                        </span>
                    </button>
                </div>
            </aside>

            <!-- 右侧功能面板 -->
            <section class="pd-main">
                <transition name="panel-fade" mode="out-in">
                    <div :key="activeModuleKey" class="pd-panel">
                        <!-- 面板头 -->
                        <div class="pd-panel-header">
                            <div class="pd-panel-title">
                                <span class="pd-panel-icon" :class="{ disabled: activeModule.disabled }">
                                    <el-icon>
                                        <component :is="getIcon(activeModule.icon)" />
                                    </el-icon>
                                </span>
                                <span class="pd-panel-name">{{ activeModule.name }}</span>
                                <span v-if="activeModule.disabled" class="pd-panel-badge lock">
                                    <el-icon>
                                        <Lock />
                                    </el-icon> 主账号专属，不可配置
                                </span>
                                <span v-else-if="activeModule.adminOnly" class="pd-panel-badge">
                                    <el-icon>
                                        <StarFilled />
                                    </el-icon> 管理员专属
                                </span>
                            </div>
                            <button v-if="!activeModule.disabled" type="button" class="pd-panel-all"
                                @click="toggleModuleAll(activeModule)">
                                {{ isModuleAllSelected(activeModule) ? '取消本模块' : '本模块全选' }}
                            </button>
                        </div>

                        <!-- 功能列表 -->
                        <div class="pd-func-list">
                            <button v-for="(item, idx) in activeModule.items" :key="item.key + '-' + idx" type="button"
                                class="pd-func-item" :class="{
                                    on: isSelected(item.key),
                                    disabled: isItemDisabled(item),
                                }" :style="{ animationDelay: (idx * 0.05) + 's' }" :disabled="isItemDisabled(item)"
                                @click="toggleItem(item.key)">
                                <span class="pd-func-check">
                                    <svg viewBox="0 0 24 24" class="pd-check-svg">
                                        <path d="M5 12.5 L10 17.5 L19 7" fill="none" stroke="currentColor"
                                            stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                                    </svg>
                                </span>
                                <span class="pd-func-name">{{ item.name }}</span>
                                <span class="pd-func-key">{{ item.key }}</span>
                                <span v-if="isItemDisabled(item)" class="pd-func-lock">
                                    <el-icon>
                                        <Lock />
                                    </el-icon>
                                </span>
                                <span class="pd-func-shine"></span>
                            </button>

                            <div v-if="!activeModule.items.length" class="pd-func-empty">
                                该模块暂无功能
                            </div>
                        </div>
                    </div>
                </transition>
            </section>
        </div>

        <template #footer>
            <div class="pd-footer">
                <div class="pd-footer-tip">
                    <el-icon>
                        <InfoFilled />
                    </el-icon>
                    <span>勾选后该角色登录时可见对应菜单（系统管理、费用审批设置不可配置）</span>
                </div>
                <div class="pd-footer-btns">
                    <el-button @click="$emit('update:modelValue', false)">取消</el-button>
                    <el-button type="primary" class="btn-primary" @click="handleConfirm">确定保存</el-button>
                </div>
            </div>
        </template>
    </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import {
    HomeFilled, Van, Location, DataLine, Tickets, User, Setting, FolderOpened,
    Lock, Select, InfoFilled, StarFilled, Wallet, Rank, DataAnalysis,
} from '@element-plus/icons-vue'
import { PERMISSION_MODULES } from '@/config/permissions'

const props = defineProps({
    modelValue: Boolean,
    roleId: { type: [String, Number], default: null },
    roleName: { type: String, default: '' },
    value: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue', 'confirm'])

// 图标映射
const ICON_MAP = {
    HomeFilled, Van, Location, DataLine, Tickets, User, Setting, FolderOpened, Wallet,
    Rank, DataAnalysis,
}
const getIcon = (name) => ICON_MAP[name] || Setting

// ⭐ 不可配置的模块（系统管理）
const DISABLED_MODULE_KEYS = ['system']

// ⭐ 根据 disabled 标记补全模块列表
const modules = computed(() => {
    return [...PERMISSION_MODULES]
        .sort((a, b) => (a.sort || 0) - (b.sort || 0))
        .map(m => ({
            ...m,
            disabled: m.disabled === true
                || m.adminOnly === true
                || DISABLED_MODULE_KEYS.includes(m.key),
        }))
})

// ⭐ 单项是否禁用：模块整体禁用，或该项标记 adminOnly（如「费用审批设置」）
const isItemDisabled = (item) => {
    const mod = activeModule.value
    return !!(mod && mod.disabled) || item?.adminOnly === true
}

// 所有禁用项的 key 集合（模块级 + 单项级）
const disabledKeys = computed(() => {
    const set = new Set()
    modules.value.forEach(m => {
        m.items.forEach(i => {
            if (m.disabled || i.adminOnly === true) set.add(i.key)
        })
    })
    return set
})

// 当前激活模块
const activeModuleKey = ref('')
const activeModule = computed(() =>
    modules.value.find(m => m.key === activeModuleKey.value) || modules.value[0] || { items: [] }
)

// 已选 keys
const selectedKeys = ref([])

// 总功能数（不含禁用模块）
const totalCount = computed(() =>
    modules.value
        .filter(m => !m.disabled)
        .reduce((sum, m) => sum + m.items.filter(i => i.adminOnly !== true).length, 0)
)

// 是否全选（只看可选模块）
const isAllSelected = computed(() =>
    totalCount.value > 0 && selectedKeys.value.length === totalCount.value
)

const isSelected = (key) => selectedKeys.value.includes(key)

// 模块已选数（禁用模块不计）
const getModuleCount = (mod) => {
    if (mod.disabled) return 0
    return mod.items.filter(i => i.adminOnly !== true && isSelected(i.key)).length
}

const isModuleAllSelected = (mod) => {
    if (mod.disabled || !mod.items.length) return false
    const usable = mod.items.filter(i => i.adminOnly !== true)
    return usable.length > 0 && usable.every(i => isSelected(i.key))
}

// 点击模块导航
const handleModuleClick = (mod) => {
    activeModuleKey.value = mod.key
}

/* ============================================================
   ⭐ 老权限展开 / 收拢（2026-10-24）
   ------------------------------------------------------------
   以前「运营管理」三个报表共用一条 operation：勾一个三个全亮，
   看起来像"切页签不刷新"。现在拆成三条独立 key：
     · 读到老的 operation → 展开成三条（都勾上，用户可以单独取消）
     · 三条全勾时保存回单条约 operation，保证老客户端/小程序仍能认
   ============================================================ */
const OPERATION_KEYS = ['operation_summary', 'operation_energy', 'operation_driving']

/* 老数据里「一个大 key 管多个菜单」的，读取时把小弟也点亮点 */
const LEGACY_EXPAND = {
  operation: OPERATION_KEYS,
  fee_stats: ['fee_list'],      // 费用明细以前没有独立 key
  waybill: ['waybill_stats'],   // 运单统计以前跟运单管理共用
}

const expandKeys = (list) => {
    const out = new Set(list || [])
    /* operation 是"三条合一"的老写法：展开后它自己就不该再占一格，
       否则会出现「已选 19/18」这种超过总数的计数 */
    if (out.has('operation')) {
        OPERATION_KEYS.forEach((k) => out.add(k))
        out.delete('operation')
    }
    Object.keys(LEGACY_EXPAND).forEach((legacy) => {
        if (legacy === 'operation' || !out.has(legacy)) return
        LEGACY_EXPAND[legacy].forEach((k) => out.add(k))
    })
    return [...out]
}

const collapseKeys = (list) => {
    const out = (list || []).filter((k) => k !== 'operation')
    const allOn = OPERATION_KEYS.every((k) => out.includes(k))
    if (allOn) {
        OPERATION_KEYS.forEach((k) => {
            const i = out.indexOf(k)
            if (i > -1) out.splice(i, 1)
        })
        out.push('operation')
    }
    return out
}

/* 清单里真实存在的 key（用来过滤历史遗留的无效 key，保证「已选 N/M」不超总数） */
const ALL_ITEM_KEYS = new Set(
    PERMISSION_MODULES.flatMap((m) => m.items.map((i) => i.key))
)

// 弹窗打开初始化
watch(() => props.modelValue, (val) => {
    if (val) {
        // ⭐ 过滤掉禁用项 / 已下线 key，并把老的 operation 展开成三条
        const incoming = expandKeys(Array.isArray(props.value) ? props.value : [])
        selectedKeys.value = incoming.filter(
            (k) => !disabledKeys.value.has(k) && ALL_ITEM_KEYS.has(k)
        )
        if (modules.value.length && !activeModuleKey.value) {
            activeModuleKey.value = modules.value[0].key
        }
    }
})

// 切换单项（禁用模块拦截）
const toggleItem = (key) => {
    if (disabledKeys.value.has(key)) return
    const idx = selectedKeys.value.indexOf(key)
    if (idx === -1) selectedKeys.value.push(key)
    else selectedKeys.value.splice(idx, 1)
}

// 模块全选（禁用模块拦截）
const toggleModuleAll = (mod) => {
    if (mod.disabled) return
    const allSel = isModuleAllSelected(mod)
    const keys = mod.items.filter(i => i.adminOnly !== true).map(i => i.key)
    if (allSel) {
        selectedKeys.value = selectedKeys.value.filter(k => !keys.includes(k))
    } else {
        selectedKeys.value = Array.from(new Set([...selectedKeys.value, ...keys]))
    }
}

// 全局全选（自动跳过禁用模块）
const toggleAll = () => {
    if (isAllSelected.value) {
        selectedKeys.value = []
    } else {
        const all = new Set()
        modules.value.forEach(m => {
            if (m.disabled) return
            m.items.forEach(i => { if (i.adminOnly !== true) all.add(i.key) })
        })
        selectedKeys.value = Array.from(all)
    }
}

const handleConfirm = () => {
    emit('confirm', {
        roleId: props.roleId,
        /* 三条全勾 → 收拢回老的 operation，兼容还没升级的端 */
        permissions: collapseKeys([...selectedKeys.value]),
    })
    emit('update:modelValue', false)
}
</script>

<style scoped>
/* ============================================================
   弹窗外壳
   ============================================================ */
:deep(.perm-dialog .el-dialog) {
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 24px 72px rgba(15, 23, 42, 0.22);
}

:deep(.perm-dialog .el-dialog__header) {
    padding: 0;
    margin: 0;
    border-bottom: 1px solid #F1F5F9;
}

:deep(.perm-dialog .el-dialog__body) {
    padding: 0;
    background: #F8FAFC;
}

:deep(.perm-dialog .el-dialog__footer) {
    padding: 14px 24px;
    border-top: 1px solid #F1F5F9;
    background: #fff;
}

:deep(.perm-dialog .el-dialog__headerbtn) {
    top: 20px;
    right: 20px;
}

/* ============================================================
   头部
   ============================================================ */
.pd-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 24px;
    background: linear-gradient(180deg, #FFFFFF, #FAFBFC);
}

.pd-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
}

.pd-header-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    font-size: 20px;
    box-shadow: 0 6px 16px rgba(var(--brand-rgb), 0.35);
}

.pd-title {
    font-size: 16px;
    font-weight: 800;
    color: #0F172A;
    letter-spacing: 0.3px;
}

.pd-sub {
    font-size: 12px;
    color: #94A3B8;
    font-weight: 500;
    margin-top: 2px;
}

.pd-header-right {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-right: 36px;
}

.pd-counter {
    font-size: 13px;
    color: #64748B;
    font-weight: 600;
}

.pd-counter b {
    color: var(--brand-primary);
    font-size: 16px;
    font-family: 'Courier New', monospace;
    font-weight: 900;
    margin: 0 2px;
}

.pd-toggle-all {
    padding: 6px 14px;
    border-radius: 20px;
    border: 1.5px solid #CBD5E1;
    background: #fff;
    color: #475569;
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.pd-toggle-all:hover {
    border-color: var(--brand-primary);
    color: var(--brand-primary);
    background: var(--brand-primary-light);
    transform: translateY(-1px);
}

.pd-toggle-all.on {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    border-color: var(--brand-primary);
    color: #fff;
    box-shadow: 0 4px 12px rgba(var(--brand-rgb), 0.35);
}

/* ============================================================
   主体
   ============================================================ */
.pd-body {
    display: grid;
    grid-template-columns: 220px 1fr;
    height: 480px;
    overflow: hidden;
}

/* 左侧模块导航 */
.pd-sidebar {
    background: #FFFFFF;
    border-right: 1px solid #F1F5F9;
    overflow-y: auto;
}

.pd-sidebar::-webkit-scrollbar {
    width: 4px;
}

.pd-sidebar::-webkit-scrollbar-thumb {
    background: #E2E8F0;
    border-radius: 2px;
}

.pd-sidebar-list {
    padding: 10px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.pd-mod-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 10px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    color: #475569;
    transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
    text-align: left;
    width: 100%;
    animation: modItemIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
}

@keyframes modItemIn {
    from {
        opacity: 0;
        transform: translateX(-12px);
    }

    to {
        opacity: 1;
        transform: translateX(0);
    }
}

.pd-mod-item:hover:not(.disabled) {
    background: var(--brand-primary-light);
    color: var(--brand-primary);
    transform: translateX(2px);
}

.pd-mod-item.active {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    box-shadow: 0 6px 16px rgba(var(--brand-rgb), 0.28);
}

.pd-mod-item.active::before {
    content: '';
    position: absolute;
    left: -8px;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 20px;
    background: linear-gradient(180deg, var(--brand-primary), var(--brand-primary-dark));
    border-radius: 2px;
    box-shadow: 0 0 8px rgba(var(--brand-rgb), 0.5);
}

/* ⭐ 禁用态 */
.pd-mod-item.disabled {
    cursor: not-allowed;
    opacity: 0.55;
}

.pd-mod-item.disabled:hover {
    background: #F8FAFC;
    color: #475569;
    transform: none;
}

.pd-mod-item.disabled.active {
    background: linear-gradient(135deg, #94A3B8, #64748B);
    box-shadow: 0 6px 16px rgba(100, 116, 139, 0.25);
}

.pd-mod-item.disabled.active::before {
    background: linear-gradient(180deg, #94A3B8, #64748B);
    box-shadow: 0 0 8px rgba(100, 116, 139, 0.5);
}

.pd-mod-icon {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #F1F5F9;
    color: #64748B;
    font-size: 13px;
    flex-shrink: 0;
    transition: all 0.28s;
}

.pd-mod-item.active .pd-mod-icon {
    background: rgba(255, 255, 255, 0.25);
    color: #fff;
}

.pd-mod-item:hover:not(.disabled) .pd-mod-icon {
    transform: scale(1.1) rotate(-6deg);
}

.pd-mod-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 700;
    letter-spacing: 0.2px;
}

.pd-mod-count {
    font-size: 11px;
    font-weight: 800;
    font-family: 'Courier New', monospace;
    color: var(--brand-primary);
    background: var(--brand-primary-light);
    padding: 1px 7px;
    border-radius: 8px;
    flex-shrink: 0;
    transition: all 0.28s;
}

.pd-mod-item.active .pd-mod-count {
    background: rgba(255, 255, 255, 0.25);
    color: #fff;
}

.pd-mod-count.empty {
    color: #94A3B8;
    background: #F1F5F9;
}

.pd-mod-item.active .pd-mod-count.empty {
    background: rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.75);
}

.pd-mod-lock {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #F1F5F9;
    color: #94A3B8;
    font-size: 11px;
    flex-shrink: 0;
}

.pd-mod-item.active .pd-mod-lock {
    background: rgba(255, 255, 255, 0.25);
    color: #fff;
}

.pd-mod-done {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #10B981;
    color: #fff;
    font-size: 10px;
    flex-shrink: 0;
    animation: doneIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.pd-mod-item.active .pd-mod-done {
    background: #fff;
    color: var(--brand-primary);
}

@keyframes doneIn {
    from {
        opacity: 0;
        transform: scale(0) rotate(-90deg);
    }

    to {
        opacity: 1;
        transform: scale(1) rotate(0);
    }
}

/* 右侧功能面板 */
.pd-main {
    overflow-y: auto;
    padding: 20px 24px;
}

.pd-main::-webkit-scrollbar {
    width: 5px;
}

.pd-main::-webkit-scrollbar-thumb {
    background: #CBD5E1;
    border-radius: 3px;
}

.pd-panel {
    animation: panelIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes panelIn {
    from {
        opacity: 0;
        transform: translateY(10px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.panel-fade-enter-active,
.panel-fade-leave-active {
    transition: opacity 0.22s ease, transform 0.22s ease;
}

.panel-fade-enter-from {
    opacity: 0;
    transform: translateY(8px);
}

.panel-fade-leave-to {
    opacity: 0;
    transform: translateY(-8px);
}

.pd-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid #F1F5F9;
}

.pd-panel-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    font-weight: 800;
    color: #0F172A;
}

.pd-panel-icon {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    font-size: 14px;
    box-shadow: 0 3px 8px rgba(var(--brand-rgb), 0.3);
}

.pd-panel-icon.disabled {
    background: linear-gradient(135deg, #94A3B8, #64748B);
    box-shadow: 0 3px 8px rgba(100, 116, 139, 0.3);
}

.pd-panel-name {
    font-size: 14px;
    letter-spacing: 0.3px;
}

.pd-panel-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 8px;
    border-radius: 8px;
    background: #FEF3C7;
    color: #92400E;
    border: 1px solid #FCD34D;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.2px;
}

.pd-panel-badge.lock {
    background: #F1F5F9;
    color: #64748B;
    border-color: #E2E8F0;
}

.pd-panel-badge .el-icon {
    font-size: 11px;
}

.pd-panel-all {
    padding: 5px 12px;
    border-radius: 16px;
    border: 1.5px solid #FCA5A5;
    background: var(--brand-primary-light);
    color: var(--brand-primary);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.pd-panel-all:hover {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    border-color: var(--brand-primary);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(var(--brand-rgb), 0.35);
}

/* 功能列表 */
.pd-func-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.pd-func-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 10px;
    border: 1.5px solid #E2E8F0;
    background: #FFFFFF;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    width: 100%;
    transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
    overflow: hidden;
    animation: funcItemIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
}

@keyframes funcItemIn {
    from {
        opacity: 0;
        transform: translateY(8px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.pd-func-item::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: linear-gradient(180deg, var(--brand-primary), var(--brand-primary-dark));
    opacity: 0;
    transition: opacity 0.3s;
}

.pd-func-item:hover:not(.disabled) {
    border-color: #FCA5A5;
    transform: translateY(-2px);
    box-shadow: 0 6px 18px rgba(var(--brand-rgb), 0.08);
}

.pd-func-item:hover:not(.disabled)::before {
    opacity: 0.5;
}

.pd-func-item.on {
    border-color: var(--brand-primary);
    background: linear-gradient(135deg, var(--brand-primary-light), #FFFFFF);
    box-shadow: 0 6px 18px rgba(var(--brand-rgb), 0.12);
}

.pd-func-item.on::before {
    opacity: 1;
    width: 4px;
}

/* ⭐ 禁用态 */
.pd-func-item.disabled {
    cursor: not-allowed;
    opacity: 0.55;
    background: #F8FAFC;
    border-style: dashed;
}

.pd-func-item.disabled:hover {
    transform: none;
    border-color: #E2E8F0;
    box-shadow: none;
}

.pd-func-item.disabled:hover::before {
    opacity: 0;
}

.pd-func-check {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid #CBD5E1;
    background: #FFFFFF;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.pd-func-item.on .pd-func-check {
    border-color: var(--brand-primary);
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    box-shadow: 0 0 0 4px rgba(var(--brand-rgb), 0.15),
        0 4px 12px rgba(var(--brand-rgb), 0.35);
}

.pd-func-item.disabled .pd-func-check {
    border-color: #CBD5E1;
    background: #F1F5F9;
}

.pd-check-svg {
    width: 14px;
    height: 14px;
    color: #fff;
    transform: scale(0) rotate(-45deg);
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.pd-func-item.on .pd-check-svg {
    transform: scale(1) rotate(0);
}

.pd-func-name {
    flex: 1;
    min-width: 0;
    font-size: 13.5px;
    font-weight: 700;
    color: #0F172A;
    letter-spacing: 0.2px;
}

.pd-func-item.on .pd-func-name {
    color: #991B1B;
}

.pd-func-key {
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: #94A3B8;
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    padding: 2px 8px;
    border-radius: 6px;
    flex-shrink: 0;
    letter-spacing: 0.2px;
}

.pd-func-item.on .pd-func-key {
    background: var(--brand-primary-light);
    color: var(--brand-primary);
    border-color: #FCA5A5;
}

.pd-func-lock {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #94A3B8;
    font-size: 13px;
    flex-shrink: 0;
}

.pd-func-shine {
    position: absolute;
    top: 0;
    left: -100%;
    width: 60%;
    height: 100%;
    background: linear-gradient(100deg, transparent, rgba(var(--brand-rgb), 0.12), transparent);
    transition: left 0.6s ease;
    pointer-events: none;
}

.pd-func-item:hover:not(.disabled) .pd-func-shine {
    left: 120%;
}

.pd-func-empty {
    padding: 40px 20px;
    text-align: center;
    color: #94A3B8;
    font-size: 13px;
    background: #FAFBFC;
    border: 1px dashed #E2E8F0;
    border-radius: 10px;
}

/* 底部 */
.pd-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
}

.pd-footer-tip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12.5px;
    color: #64748B;
    font-weight: 500;
}

.pd-footer-tip .el-icon {
    color: var(--brand-primary);
    font-size: 13px;
}

.pd-footer-btns {
    display: flex;
    gap: 10px;
}

.pd-footer-btns .el-button {
    border-radius: 10px;
    font-weight: 600;
    padding: 9px 22px;
}

.pd-footer-btns .btn-primary {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    border: none;
    color: #fff;
    box-shadow: 0 6px 16px rgba(var(--brand-rgb), 0.3);
    transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.pd-footer-btns .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 24px rgba(var(--brand-rgb), 0.45);
}
</style>

<style>
/* ============================================================
   ⭐ 功能配置弹窗：整体锁在视口内，页面上不会出现滚动
   （弹窗根元素就是 .el-dialog.perm-dialog，append-to-body 后脱离 scoped 作用域）
   ============================================================ */
.el-dialog.perm-dialog {
    display: flex;
    flex-direction: column;
    /* top="8vh" 由组件内联给出 */
    max-height: calc(100vh - 8vh - 16px);
    margin-bottom: 0;
}

.el-dialog.perm-dialog>.el-dialog__header,
.el-dialog.perm-dialog>.el-dialog__footer {
    flex: 0 0 auto;
}

.el-dialog.perm-dialog>.el-dialog__body {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

/* 看板常规 480 高；矮屏时压缩（左右两块内部各自滚动） */
.el-dialog.perm-dialog .pd-body {
    flex: 0 1 480px;
    min-height: 220px;
}
</style>