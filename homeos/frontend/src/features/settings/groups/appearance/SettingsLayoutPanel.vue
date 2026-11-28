<!--
  布局面板。整合仪表盘编辑器入口与 3D 户型图绘制入口（旧 2D 楼层管理已随楼层模型移除）。
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="layout"
    icon-key="layout"
    accent="var(--hos-color-accent)"
    layout="single"
    page-class="layout-hub"
    body-class="layout-hub__body"
  >
    <template #actions />

    <SettingsLayoutEditSection />
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useLayoutConfigRef } from '@/domain/layout/use-layout-config-ref'
import SettingsPageShell from '@/features/settings/shell/SettingsPageShell.vue'
import { useSettingsPendingChanges } from '@/domain/layout/pending'
import SettingsLayoutEditSection from '@/features/settings/groups/appearance/layout/SettingsLayoutEditSection.vue'

defineProps({ activeTab: { type: String, default: 'layout' } })

const { layoutStore } = useLayoutConfigRef()

const initialLayoutConfig = ref(null)
const { takeSnapshot } = useSettingsPendingChanges({
  snapshot: initialLayoutConfig,
  current: () => layoutStore.layoutConfig,
  ready: () => layoutStore.isConfigLoaded,
})

// 配置加载完成后取初始快照
watch(
  () => layoutStore.isConfigLoaded,
  (loaded) => {
    if (loaded && !initialLayoutConfig.value) {
      takeSnapshot(layoutStore.layoutConfig)
    }
  },
  { immediate: true },
)
</script>
