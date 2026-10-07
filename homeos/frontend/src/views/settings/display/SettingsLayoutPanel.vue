<!--
组件：SettingsLayoutPanel.vue
所属模块：frontend / src / views / settings / display
职责：布局面板。整合仪表盘编辑器入口与 3D 户型图绘制入口（旧 2D 楼层管理已随楼层模型移除）。
关键依赖：
  - SettingsPageShell：页面骨架
  - SettingsLayoutEditSection：布局编辑入口区段
  - useSettingsPendingChanges：待保存变更快照
数据来源：layoutStore.layoutConfig
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="layout"
    icon-key="layout"
    accent="var(--module-accent-layout)"
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
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import { useSettingsPendingChanges } from '@/composables/settings/pending.internals'
import SettingsLayoutEditSection from '@/views/settings/display/layout/SettingsLayoutEditSection.vue'

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
  --page-accent-rgb: var(--module-accent-layout-rgb);
  --page-accent-secondary: var(--module-accent-layout-sub);
  --page-accent-secondary-rgb: var(--module-accent-layout-sub-rgb);
}
</style>
