<!--
  QuickActionsCard.vue / components/widgets
  快捷操作统计卡片：右侧面板聚合型网格按钮，展示设备在线、低电量、
  开灯、气候激活等计数，并作为打开对应分组详情弹窗的快捷入口。
  Props: config 布局配置透传对象
  Emit: open-group 点击按钮时触发，由外层打开 DeviceGroupModal
  依赖：Pinia — useEntitiesStore 实体状态、useLayoutStore 快捷按钮选择；
        utils: quick-action-counts.util / group-counts.util 分类计数；
        quick-actions.config.ts 按钮图标与元数据；RouterLink 跳设置页。
  注意：stat 数量自适应 grid 列数，按钮 active 态基于 count > 0 判断。
-->
<template>
  <div class="quick-actions-card">
    <VEmptyState
      v-if="!stats.length"
      compact
      tone="violet"
      title="未配置快捷操作"
      description="请在设置 → 面板部件 中选择要展示的统计按钮"
    >
      <template #action>
        <RouterLink :to="SETTINGS_ROUTES.widgets()" class="qac-link text-xs underline">{{
          '前往配置'
        }}</RouterLink>
      </template>
    </VEmptyState>
    <div
      v-else
      class="quick-actions-grid"
      :style="{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }"
    >
      <button
        v-for="stat in stats"
        :key="stat.id"
        type="button"
        :aria-label="`${stat.label} ${stat.count}`"
        :class="[
          'action-btn tap-active glass-shine',
          `action-btn--${stat.id}`,
          stat.count > 0 ? 'action-btn--active' : 'action-btn--idle',
        ]"
        @click="stat.onClick"
      >
        <span v-if="stat.count > 0" class="stat-count" aria-hidden="true">{{
          stat.count > 99 ? '99+' : stat.count
        }}</span>
        <div class="icon-wrapper">
          <component :is="stat.icon" class="stat-icon" />
        </div>
        <span class="stat-label">{{ stat.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * @file QuickActionsCard.vue
 * @module widgets
 * @description 快捷操作卡片：右侧面板中的设备状态概览与快捷入口，
 *              计数与 DeviceGroupModal 共用 resolveDeviceGroupEntityIds，随实体 WebSocket 推送实时更新。
 * @dependencies
 *  - vue: computed 计算属性
 *  - vue-router: RouterLink 路由跳转
 *  - @/components/common/base/VEmptyState.vue: 空态组件
 *  - @/utils/registry/settings-route.util: 设置页路由常量
 *  - @/stores/entities.store: 实体状态
 *  - @/stores/layout.store: 布局配置（读取快捷按钮选择）
 *  - @/utils/widget/quick-action-counts.util: 各类快捷计数工具
 *  - ./quick-actions.config.ts: 按钮元数据
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import VEmptyState from '@/components/common/base/VEmptyState.vue'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import {
  countQuickActionBatteryLow,
  countQuickActionClimateActive,
  countQuickActionLightsOn,
  countQuickActionOffline,
  countQuickActionDomainActive,
} from '@/utils/device/group-counts.util'
import { QUICK_BUTTON_META, normalizeQuickButtons } from '@/components/widgets/quick-actions.config'

const props = defineProps({ config: {} })
const emit = defineEmits(['open-group'])

const entitiesStore = useEntitiesStore()
const layoutStore = useLayoutStore()

const statsSensors = computed(() => ({
  ...layoutStore.layoutConfig.statsSensors,
  ...props.config?.statsSensors,
}))

const batteryCount = computed(() => countQuickActionBatteryLow(entitiesStore, layoutStore))

const offlineCount = computed(() =>
  countQuickActionOffline(entitiesStore, layoutStore, statsSensors.value),
)

const lightCount = computed(() =>
  countQuickActionLightsOn(entitiesStore, layoutStore, statsSensors.value),
)

const climateCount = computed(() =>
  countQuickActionClimateActive(entitiesStore, layoutStore, statsSensors.value),
)

/** 用户配置的按钮集合（默认四项，可在「设置 → 面板部件 → 配置统计源」自定义） */
const selectedButtons = computed(() => normalizeQuickButtons(props.config?.quickButtons))

/** 各按钮当前角标计数：核心域用专用计数器，扩展域用通用活跃数统计 */
function buttonCount(id) {
  if (id === 'lights') return lightCount.value
  if (id === 'climates') return climateCount.value
  if (id === 'battery') return batteryCount.value
  if (id === 'offline') return offlineCount.value
  const meta = QUICK_BUTTON_META[id]
  if (!meta) return 0
  return countQuickActionDomainActive(
    meta.domain,
    meta.activeStates || ['on'],
    entitiesStore,
    layoutStore,
    statsSensors.value,
  )
}

const stats = computed(() =>
  selectedButtons.value
    .map((id) => QUICK_BUTTON_META[id])
    .filter(Boolean)
    .map((meta) => ({
      id: meta.id,
      label: meta.label,
      icon: meta.icon,
      count: buttonCount(meta.id),
      onClick: () => emit('open-group', meta.domain, null),
    })),
)

defineExpose({ stats })
</script>

<style scoped src="./styles/QuickActionsCard.css"></style>
