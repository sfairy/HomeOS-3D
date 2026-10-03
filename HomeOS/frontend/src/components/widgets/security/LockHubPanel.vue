<template>
  <div class="widget-hub-root">
    <!-- 门锁中心 Hub 头部：在门锁管理与访客访问之间切换 -->
    <WidgetHubHeader
      v-model="activeTab"
      title="门锁中心"
      accent="var(--premium-accent-amber)"
      :tabs="hubTabs"
    >
      <template #icon>
        <Lock
          :class="[
            'w-3.5 h-3.5',
            activeTab === 'locks' && anyUnlocked ? 'lh-icon-warn' : 'lh-icon-ok',
          ]"
        />
      </template>
    </WidgetHubHeader>
    <!-- 门锁管理 Tab -->
    <LockManagementPanel v-if="activeTab === 'locks'" class="widget-hub-panel lh-embed" embedded />
    <!-- 访客访问 Tab -->
    <GuestAccessPanel v-else class="widget-hub-panel lh-embed" embedded />
  </div>
</template>

<script setup>
/**
 * @file 门锁中心面板 (LockHubPanel)
 * @module widgets/security
 * @description
 *   门锁中心 Hub，提供"门锁管理"与"访客访问"两个 Tab。
 *   当门锁 Tab 存在未锁定设备时，头部图标显示警告色。
 * @dependencies
 *   - @/components/widgets/shared/WidgetHubHeader Hub 头部组件
 *   - ./LockManagementPanel 门锁管理子面板
 *   - @/components/widgets/care/GuestAccessPanel 访客访问面板
 *   - @/composables/widget/useHubTabs Hub Tab 状态管理
 */
import { computed } from 'vue'
import { Lock } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import LockManagementPanel from './LockManagementPanel.vue'
import GuestAccessPanel from '@/components/widgets/care/GuestAccessPanel.vue'
import WidgetHubHeader from '@/components/widgets/shared/WidgetHubHeader.vue'
import { useHubTabs } from '@/composables/widget/useHubTabs'

const props = defineProps({
  /** 默认激活的 Tab */
  defaultTab: { type: String, default: '' },
  /** Hub 配置对象 */
  config: { type: Object, default: () => ({}) },
})

/** Hub 全部 Tab 定义：门锁 / 访客 */
const ALL_HUB_TABS = [
  { key: 'locks', label: '门锁' },
  { key: 'guest', label: '访客' },
]

const { hubTabs, activeTab } = useHubTabs({
  hubType: 'lockHub',
  config: () => props.config,
  defaultTabProp: () => props.defaultTab,
  allTabs: ALL_HUB_TABS,
})

const es = useEntitiesStore()

/**
 * 是否存在未锁定的门锁（仅门锁 Tab 激活时检测），
 * 用于头部图标颜色提示。
 * @returns {boolean}
 */
const anyUnlocked = computed(() => {
  if (activeTab.value !== 'locks') return false
  void es.getDomainEpoch('lock')
  return Object.entries(es.entities).some(
    ([k, e]) => k.startsWith('lock.') && e?.state === 'unlocked',
  )
})
</script>

<style scoped src="../styles/widget-hub-embeds.css"></style>