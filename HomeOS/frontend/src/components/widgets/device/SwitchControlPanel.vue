<!--
  SwitchControlPanel.vue / components/widgets/device
  设备总控 Hub（开关面板）：顶部页签式结构，异步懒加载 FunctionSwitchesWidget，
  按域聚合可切换实体（light/switch/fan/climate 等），带搜索与全局全开/全关。
  Props: defaultTab 默认页签 key / tabSelectToken 外部切页令牌
         / compact 紧凑态隐藏 hub header / config 布局配置
  依赖：composables: useHubTabs tab 持久化；
        Pinia: useEntitiesStore domainIndexToArray 域枚举；
        lucide: Zap 图标；
        子组件：WidgetHubHeader 统一页签头 + FunctionSwitchesWidget（defineAsyncComponent）。
  注意：异步组件加载失败时外层 ErrorBoundary 兜底。
-->
<template>
  <div class="widget-hub-root sc-hub">
    <WidgetHubHeader
      v-if="!compact"
      v-model="activeTab"
      title="开关控制"
      accent="var(--premium-accent-amber)"
      :tabs="tabsWithBadge"
    >
      <template #icon>
        <span :class="['sc-hub-glyph', anyOn && 'sc-hub-glyph--on']">
          <Zap :class="['w-3.5 h-3.5', anyOn ? 'sc-icon-active' : 'sc-icon-idle']" />
        </span>
      </template>
      <template v-if="hubMeta" #actions>
        <span :class="['sc-hub-status', anyOn ? 'sc-hub-status--on' : 'sc-hub-status--off']">
          {{ hubMeta }}
        </span>
      </template>
    </WidgetHubHeader>
    <SwitchGroupPanel v-if="activeTab === 'groups'" class="widget-hub-panel sc-embed" />
    <QuickSwitchesWidget
      v-else-if="activeTab === 'shortcuts'"
      class="widget-hub-panel sc-embed sc-embed--shortcuts"
      :config="config"
      :panel-visible="panelVisible"
    />
    <FunctionSwitchesWidget
      v-else
      class="widget-hub-panel sc-embed sc-embed--features"
      :config="config"
      :panel-visible="panelVisible"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @file SwitchControlPanel.vue
 * @module widgets/device
 * @description 开关控制 Hub 面板：聚合「分组 / 快捷 / 功能」三个 tab，
 *              分组 tab 复用 SwitchGroupPanel，快捷 tab 复用 QuickSwitchesWidget，
 *              功能 tab 异步加载 FunctionSwitchesWidget；通过 useHubTabs 维护 tab 持久化。
 * @dependencies
 *  - vue: computed/defineAsyncComponent 响应式与异步组件
 *  - @lucide/vue: Zap 图标
 *  - ./SwitchGroupPanel.vue: 开关分组面板
 *  - ./QuickSwitchesWidget.vue: 快捷开关部件
 *  - ./FunctionSwitchesWidget.vue: 功能开关部件（异步加载）
 *  - @/components/widgets/shared/WidgetHubHeader.vue: 通用 Hub 头部
 *  - @/stores/entities.store: 实体状态与域索引
 *  - @/composables/widget/useHubTabs: Hub tab 持久化 composable
 *  - @/utils/entity/derived.util: 实体友好名与域索引工具
 */
import { computed, defineAsyncComponent } from 'vue'
import { Zap } from '@lucide/vue'
import SwitchGroupPanel from './SwitchGroupPanel.vue'
import QuickSwitchesWidget from './QuickSwitchesWidget.vue'
import WidgetHubHeader from '@/components/widgets/shared/WidgetHubHeader.vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useHubTabs } from '@/composables/widget/useHubTabs'
import { getEntityDisplayName, domainIndexToArray } from '@/utils/entity/derived.util'
import type { HaEntityState } from '@/types/entity-store'

const FunctionSwitchesWidget = defineAsyncComponent(() => import('./FunctionSwitchesWidget.vue'))

const props = defineProps({
  config: { type: Object, default: () => ({}) },
  panelVisible: { type: Boolean, default: true },
  defaultTab: { type: String, default: '' },
  compact: { type: Boolean, default: false },
})

const ALL_HUB_TABS = [
  { key: 'groups', label: '分组' },
  { key: 'shortcuts', label: '快捷' },
  { key: 'features', label: '功能' },
]

const { hubTabs, activeTab } = useHubTabs({
  hubType: 'switchGroup',
  config: () => props.config,
  defaultTabProp: () => props.defaultTab,
  allTabs: ALL_HUB_TABS,
})

const es = useEntitiesStore()

function isOutletSwitch(entityId: string, entity: HaEntityState | null | undefined) {
  const name = getEntityDisplayName(entityId, entity).toLowerCase()
  if (name.includes('灯') && !name.includes('插座') && !name.includes('排插')) return false
  return true
}

function listSwitchIds() {
  void es.getDomainEpoch('switch')
  void es.derivedEpoch
  const indexed = domainIndexToArray(es.domainEntityIndex.get('switch'))
  if (indexed.length) return indexed
  return Object.keys(es.entities).filter((id) => id.startsWith('switch.'))
}

const switchStats = computed(() => {
  let total = 0
  let on = 0
  for (const k of listSwitchIds()) {
    const e = es.entities[k]
    if (!e || e.state === 'unavailable') continue
    if (!isOutletSwitch(k, e)) continue
    total += 1
    if (e.state === 'on') on += 1
  }
  return { total, on }
})

const anyOn = computed(() => switchStats.value.on > 0)

const hubMeta = computed(() => {
  if (props.compact || activeTab.value !== 'groups') return ''
  const { total, on } = switchStats.value
  if (!total) return ''
  return on > 0 ? `${on}/${total} 开启` : '全部关闭'
})

const tabsWithBadge = computed(() =>
  hubTabs.value.map((tab) => {
    if (tab.key !== 'groups' || !switchStats.value.on) return tab
    return { ...tab, badge: switchStats.value.on }
  }),
)
</script>

<style scoped src="./styles/SwitchControlPanel.css"></style>

<style scoped>
/* 紧凑单行 Hub 头 */
.sc-hub :deep(.widget-hub-head) {
  padding: 4px 6px 8px;
  gap: 4px;
}

.sc-hub :deep(.widget-hub-head__left) {
  gap: 5px;
}

.sc-hub :deep(.widget-hub-subnav) {
  padding: 1px;
  gap: 1px;
  max-width: min(78%, 100%);
}

.sc-hub :deep(.widget-hub-subnav__btn) {
  padding: 2px 7px;
  font-size: var(--premium-fs-micro);
  border-radius: 6px;
}

.sc-hub :deep(.widget-hub-subnav__badge) {
  min-width: 12px;
  height: 12px;
  line-height: 12px;
  font-size: var(--premium-fs-micro);
  padding: 0 3px;
}

.sc-hub :deep(.widget-hub-panel) {
  padding: 0 2px 0 0;
}

/* 分组 / 快捷：打进子组件根与内部 */
.sc-hub :deep(.sc-embed.sg-root),
.sc-hub :deep(.sc-embed.quick-switches-widget) {
  padding: 0 4px 6px;
  height: auto;
  min-height: 0;
  gap: 5px;
}

.sc-hub :deep(.sc-embed .sg-header) {
  display: none;
}

.sc-hub :deep(.sc-embed .sg-body) {
  gap: 5px;
}

.sc-hub :deep(.sc-embed .sg-global) {
  gap: 5px;
}

.sc-hub :deep(.sc-embed .sg-global-btn) {
  padding: 6px 8px;
}

.sc-hub :deep(.sc-embed--shortcuts .quick-switches-widget__title) {
  display: none;
}

.sc-hub :deep(.sc-embed--shortcuts .quick-switches-widget__head:not(:has(.quick-switches-widget__collapse))) {
  display: none;
}

.sc-hub :deep(.sc-embed--shortcuts .quick-switches-widget__head) {
  margin-bottom: 0;
  justify-content: flex-end;
}

.sc-hub :deep(.sc-embed--shortcuts .quick-switches-widget__search-wrap) {
  padding: 4px 8px;
  border-radius: 8px;
}

.sc-hub :deep(.sc-embed--shortcuts .quick-switches-widget__grid) {
  gap: 5px;
}

.sc-hub :deep(.sc-embed--shortcuts .quick-switch-chip) {
  padding: 7px 8px;
  min-height: 40px;
  gap: 7px;
  border-radius: var(--hos-radius-card);
}

.sc-hub :deep(.sc-embed--shortcuts .quick-switch-chip__glyph) {
  width: 24px;
  height: 24px;
  border-radius: 7px;
}

/* 功能页：去掉卡套卡，列表贴满 */
.sc-hub :deep(.sc-embed--features.function-switches) {
  flex: 1;
  max-height: none;
  height: 100%;
  min-height: 0;
  padding: 2px 2px 4px;
  gap: 6px;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.sc-hub :deep(.sc-embed--features .fs-section) {
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.sc-hub :deep(.sc-embed--features .fs-section-head),
.sc-hub :deep(.sc-embed--features .notify-head) {
  padding: 0 2px 4px;
}

.sc-hub :deep(.sc-embed--features .notify-row) {
  padding: 6px 4px;
  border-radius: 8px;
}

.sc-hub :deep(.sc-embed--features .notify-row__main) {
  gap: 7px;
}

.sc-hub :deep(.sc-embed--features .notify-more-link) {
  margin-top: 0;
  padding: 4px 4px 2px;
}

@media (min-width: 380px) {
  .sc-hub :deep(.sc-embed--shortcuts .quick-switch-chip) {
    flex-direction: column;
    align-items: flex-start;
    padding: 7px 7px 6px;
    min-height: 58px;
    gap: 5px;
  }

  .sc-hub :deep(.sc-embed--shortcuts .quick-switch-chip__meta) {
    width: 100%;
  }

  .sc-hub :deep(.sc-embed--shortcuts .quick-switch-chip__label) {
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
}
</style>
