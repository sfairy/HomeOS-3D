<!--
组件：SettingsLayoutPanel.vue
所属模块：frontend / src / views / settings / display
职责：布局面板。按子导航切换：楼层管理、布局编辑；
      整合楼层管理、布局编辑与楼层素材拾取。
关键依赖：
  - SettingsPageShell / SettingsHubSubnav：页面骨架与子导航
  - SettingsLayoutEditSection / SettingsLayoutFloorsSection：两个子区段
  - useFloorManager：楼层编辑逻辑
  - useSettingsPendingChanges / useSettingsSave：待保存变更与保存逻辑
数据来源：layoutStore.layoutConfig（floors 等）
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
    <template #actions>
      <button
        v-if="layoutSection === 'edit' && layoutStore.isEditMode"
        type="button"
        class="settings-btn-accent"
        @click="goDashboard"
      >
        {{ '前往主页编辑' }}
      </button>
      <button
        v-if="layoutSection === 'floors'"
        type="button"
        class="settings-btn-accent"
        @click="addFloor"
      >
        {{ '+ 新增楼层' }}
      </button>
    </template>

    <template #subnav>
      <SettingsHubSubnav v-model="layoutSection" :sections="layoutSubnavSections" />
    </template>

    <SettingsLayoutEditSection
      v-show="layoutSection === 'edit'"
      :is-edit-mode="layoutStore.isEditMode"
      @toggle-edit-mode="layoutStore.toggleEditMode()"
    />

    <SettingsLayoutFloorsSection
      v-show="layoutSection === 'floors'"
      @delete-floor="onDeleteFloor"
      @open-floor-asset-pick="openFloorAssetPick"
      @toggle-switcher-lock="toggleSwitcherLock"
      @set-switcher-dir="setSwitcherDir"
      @save-layout="layoutStore.saveLayout()"
    />

    <AssetPickerModal
      v-if="showAssetPicker"
      :is-open="showAssetPicker"
      type="floorplan"
      @close="showAssetPicker = false"
      @select="onSelectFloorAsset"
    />
  </SettingsPageShell>
</template>

<script setup>
import { ref, computed, watch, defineAsyncComponent } from 'vue'
import { useRouter } from 'vue-router'
import { useLayoutConfigRef } from '@/composables/ui/useLayoutConfigRef'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsHubSubnav from '@/views/settings/shared/layout/SettingsHubSubnav.vue'
import { useFloorManager } from '@/composables/settings/display/layout-dashboard.internals'
import { useSettingsHubRouteSection } from '@/composables/settings/hub-ui.internals'
import { useSettingsPendingChanges } from '@/composables/settings/pending.internals'
import SettingsLayoutEditSection from '@/views/settings/display/layout/SettingsLayoutEditSection.vue'
import SettingsLayoutFloorsSection from '@/views/settings/display/layout/SettingsLayoutFloorsSection.vue'

const AssetPickerModal = defineAsyncComponent(
  () => import('@/components/common/AssetPickerModal.vue'),
)

const props = defineProps({ activeTab: { type: String, default: 'layout' } })

const router = useRouter()
const { layoutStore, layoutConfig } = useLayoutConfigRef()
// 当前激活的子导航区段
const layoutSection = ref('edit')

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

// 子导航区段配置（含楼层 badge）
const layoutSubnavSections = computed(() => [
  {
    id: 'floors',
    label: '楼层管理',
    emoji: '🏢',
    badge: layoutStore.layoutConfig.floors?.length || '',
  },
  { id: 'edit', label: '布局编辑', emoji: '✏️' },
])

useSettingsHubRouteSection(layoutSection, layoutSubnavSections, {
  tabId: 'layout',
  activeTab: () => props.activeTab,
})

// 跳转到主页编辑
function goDashboard() {
  router.push('/')
}

// 楼层管理：增删/素材拾取/切换器锁定/方向/消息墙开关
const {
  showAssetPicker,
  addFloor,
  onDeleteFloor,
  openFloorAssetPick,
  onSelectFloorAsset,
  toggleSwitcherLock,
  setSwitcherDir,
} = useFloorManager(layoutConfig)
</script>

<style>
/* ── Layout 面板主题色 RGB 派生：violet 主色 + cyan 子色 ── */
.layout-hub {
  --page-accent-rgb: var(--module-accent-layout-rgb);
  --page-accent-secondary: var(--module-accent-layout-sub);
  --page-accent-secondary-rgb: var(--module-accent-layout-sub-rgb);
}
</style>
