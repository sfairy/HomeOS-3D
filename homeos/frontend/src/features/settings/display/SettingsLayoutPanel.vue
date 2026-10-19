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

<script setup>
import { ref, watch } from 'vue'
import { useLayoutConfigRef } from '@/composables/ui/useLayoutConfigRef'
import SettingsPageShell from '@/components/common/settings-page-shell/SettingsPageShell.vue'
import { useSettingsPendingChanges } from '@/composables/settings-kernel/pending.internals'
import SettingsLayoutEditSection from '@/features/settings/display/layout/SettingsLayoutEditSection.vue'

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

<style>
/* ── Layout 面板主题色 RGB 派生：violet 主色 + cyan 子色 ── */
.layout-hub {
}
</style>
