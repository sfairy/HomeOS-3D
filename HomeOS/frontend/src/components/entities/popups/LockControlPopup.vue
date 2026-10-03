/**
 * @file LockControlPopup.vue
 * @module components/entities/popups
 * @brief 门锁控制弹窗
 *
 * 职责：
 * - 基于 EntityPopupShell 渲染 lock 域控制面板
 * - 提供锁定/解锁模式卡片切换（EntityModeCardGrid）
 * - 展示当前锁状态（locked/unlocked/jammed）与状态色
 *
 * 依赖：
 * - vue（computed）、@lucide/vue（Lock/Unlock）
 * - ./EntityPopupShell、./PopupHead、./EntityModeCardGrid
 * - @/composables/entity/useEntityPopupBase（useEntityPopupBase/useEntityPopupHeader）
 * - @/stores/chrome.store
 */
<template>
  <!-- LockControlPopup 门锁控制弹窗：控制门锁实体的开关 -->
  <EntityPopupShell
    :entity="liveEntity"
    :x-pct="xPct"
    :y-pct="yPct"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :width="320"
    :height="300"
    accent="#fbbf24"
    accent-rgb="251, 191, 36"
    @close="$emit('close')"
  >
    <PopupHead :title="entityName" :icon="Lock">
      <template #status>
        <span :class="stateColor">{{ stateLabel }}</span>
        <span
          v-if="isActive"
          class="popup-status-dot popup-status-dot--pulse lcp-state-dot lcp-state-dot--on"
        />
      </template>
    </PopupHead>

    <EntityModeCardGrid :modes="lockModes" @select="callLockService" />

    <div class="flex items-center justify-between px-1">
      <div class="flex items-center gap-2">
        <div
          class="w-2 h-2 rounded-full"
          :class="isLocked ? 'lcp-status-dot--locked' : 'lcp-status-dot--unlocked'"
        />
        <span class="text-xs font-semibold lcp-lbl">{{ statusText }}</span>
      </div>
    </div>
  </EntityPopupShell>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 LockControlPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * LockControlPopup - 门锁控制弹窗组件
 * 功能特性：
 * - 控制门锁的锁定/解锁
 * - 显示当前锁状态
 * - 可能包含用户信息
 * - 弹出式面板
 */
import { computed } from 'vue'
import { Lock, Unlock } from '@lucide/vue'
import EntityPopupShell from '@/components/entities/popups/EntityPopupShell.vue'
import PopupHead from '@/components/entities/popups/PopupHead.vue'
import EntityModeCardGrid from '@/components/entities/popups/EntityModeCardGrid.vue'
import { useChromeStore } from '@/stores/chrome.store'
import {
  defineEntityPopupProps,
  useEntityPopupBase,
  useEntityPopupHeader,
} from '@/composables/entity/useEntityPopupBase'

const props = defineProps(defineEntityPopupProps())
defineEmits(['close'])

const { liveEntity, entityRef, entityName, callService } = useEntityPopupBase(props)

const { stateLabel, stateColor, isActive, state } = useEntityPopupHeader(entityRef, {
  stateLabelDomain: 'lock',
  stateColorMap: {
    locked: 'lcp-state-locked',
    unlocked: 'lcp-state-unlocked',
    jammed: 'lcp-state-jammed',
  },
})

const isLocked = computed(() => state.value === 'locked')
const isUnlocked = computed(() => state.value === 'unlocked')
const statusText = computed(() => {
  if (state.value === 'jammed') return '⚠ 门锁异常'
  return isLocked.value ? '门已上锁' : '门已解锁'
})

const lockModes = computed(() => [
  { key: 'lock', label: '锁定', icon: Lock, iconClass: 'lcp-ic-locked', active: isLocked.value },
  {
    key: 'unlock',
    label: '解锁',
    icon: Unlock,
    iconClass: 'lcp-ic-unlocked',
    active: isUnlocked.value,
  },
])

const chrome = useChromeStore()

async function callLockService(svc) {
  // 解锁为高危操作（墙面误触即开门），与安防布防/撤防同级的二次确认
  if (svc === 'unlock') {
    const ok = await chrome.confirm(
      `确定解锁「${entityName.value}」？解锁后门将可直接打开。`,
      '解锁确认',
      { type: 'danger', confirmText: '确认解锁' },
    )
    if (!ok) return
  }
  await callService('lock', svc, liveEntity.value.entity_id, undefined, '门锁操作失败')
}
</script>

<style src="./styles/PopupAccents.css"></style>
<style scoped>
:deep(.popup-shell) {
  --accent: #fbbf24;
  --accent-rgb: 251, 191, 36;
}
</style>
