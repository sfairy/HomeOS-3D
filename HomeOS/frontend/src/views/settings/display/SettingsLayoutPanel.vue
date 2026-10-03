<!--
组件：SettingsLayoutPanel.vue
所属模块：frontend / src / views / settings / display
职责：布局面板。按子导航切换：楼层管理、布局编辑、显示缩放、底部信息栏、消息墙；
      整合楼层管理、缩放配置、底部信息栏编辑与楼层素材拾取。
关键依赖：
  - SettingsPageShell / SettingsHubSubnav：页面骨架与子导航
  - SettingsLayoutEditSection / SettingsLayoutDisplaySection / SettingsLayoutEventlogSection /
    SettingsLayoutFooterSection / SettingsLayoutFloorsSection：五个子区段
  - useScaling：显示缩放派生
  - useFloorManager / useDashboardFooterEditor：楼层与底部信息栏编辑逻辑
  - useSettingsPendingChanges / useSettingsSave：待保存变更与保存逻辑
数据来源：layoutStore.layoutConfig（floors / pageMaxWidth / dashboardFooter 等）
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

    <template #mobile-save>
      <SettingsPendingSaveAction
        :pending="pendingChanges"
        :saving="saving"
        save-text="保存布局"
        @save="handleSave"
      />
    </template>

    <template #subnav>
      <SettingsHubSubnav v-model="layoutSection" :sections="layoutSubnavSections" />
    </template>

    <SettingsLayoutEditSection
      v-show="layoutSection === 'edit'"
      :is-edit-mode="layoutStore.isEditMode"
      @toggle-edit-mode="layoutStore.toggleEditMode()"
    />

    <SettingsLayoutDisplaySection
      v-show="layoutSection === 'display'"
      :scaling-enabled="scalingEnabled"
      :scale="scale"
      :active-design-width="activeDesignWidth"
      :design-height="DESIGN_HEIGHT"
      :viewport-w="viewportW"
      :viewport-h="viewportH"
      :width-presets="widthPresets"
      :screen-hint="screenHint"
      :screen-height-hint="screenHeightHint"
      @toggle-scaling="toggleScaling()"
      @apply-width-preset="applyWidthPreset"
      @auto-match-resolution="autoMatchResolution"
    />

    <SettingsLayoutEventlogSection
      v-show="layoutSection === 'eventlog'"
      @toggle-event-log="toggleEventLog"
    />

    <SettingsLayoutFooterSection
      v-show="layoutSection === 'footer'"
      v-model:preset-to-add="presetToAdd"
      v-model:active-footer-item-id="activeFooterItemId"
      :preset-options="presetOptions"
      :source-options="sourceOptions"
      :footer-item-tabs="footerItemTabs"
      :footer-items-order-key="footerItemsOrderKey"
      :field-options="fieldOptions"
      @toggle-dashboard-footer="toggleDashboardFooter"
      @reset-dashboard-footer="resetDashboardFooter"
      @add-preset="onAddPreset"
      @add-custom-entity="onAddCustomEntity"
      @footer-items-reorder="onFooterItemsReorder"
      @remove-footer-item="onRemoveFooterItem"
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
import { ref, computed, watch, defineAsyncComponent, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useLayoutConfigRef } from '@/composables/ui/useLayoutConfigRef'
import { useChromeStore } from '@/stores/chrome.store'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsHubSubnav from '@/views/settings/shared/layout/SettingsHubSubnav.vue'
import { useScaling } from '@/composables/ui/useScaling'
import { reloadFrontendConfig } from '@/utils/config/frontend-config'
import {
  handleSystemConfigPatchError,
  useSystemConfig,
} from '@/composables/config/system-config-core.internals'
import { useFloorManager } from '@/composables/settings/display/layout-dashboard.internals'
import { useDashboardFooterEditor } from '@/composables/settings/display/layout-dashboard.internals'
import { useSettingsHubRouteSection } from '@/composables/settings/hub-ui.internals'
import { useSettingsPendingChanges } from '@/composables/settings/pending.internals'
import { useSettingsSave } from '@/composables/settings/hub-ui.internals'
import { syncGlobalLayoutPendingSnapshot } from '@/composables/settings/pending.internals'
import SettingsLayoutEditSection from '@/views/settings/display/layout/SettingsLayoutEditSection.vue'
import SettingsLayoutDisplaySection from '@/views/settings/display/layout/SettingsLayoutDisplaySection.vue'
import SettingsLayoutEventlogSection from '@/views/settings/display/layout/SettingsLayoutEventlogSection.vue'
import SettingsLayoutFooterSection from '@/views/settings/display/layout/SettingsLayoutFooterSection.vue'
import SettingsLayoutFloorsSection from '@/views/settings/display/layout/SettingsLayoutFloorsSection.vue'
import SettingsPendingSaveAction from '@/views/settings/shared/SettingsPendingSaveAction.vue'

const AssetPickerModal = defineAsyncComponent(
  () => import('@/components/common/AssetPickerModal.vue'),
)

const props = defineProps({ activeTab: { type: String, default: 'layout' } })

const router = useRouter()
const { layoutStore, layoutConfig } = useLayoutConfigRef()
const chrome = useChromeStore()
// 当前激活的子导航区段
const layoutSection = ref('edit')
const presetToAdd = ref('')

const initialLayoutConfig = ref(null)
const { pendingCount: pendingChanges, takeSnapshot } = useSettingsPendingChanges({
  snapshot: initialLayoutConfig,
  current: () => layoutStore.layoutConfig,
  ready: () => layoutStore.isConfigLoaded,
})

const { saving, onSave } = useSettingsSave()

// 保存：成功后刷新快照与全局待保存镜像
async function handleSave() {
  const ok = await onSave()
  if (ok) {
    takeSnapshot(layoutStore.layoutConfig)
    syncGlobalLayoutPendingSnapshot(layoutStore.layoutConfig)
  }
  return ok
}

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
  { id: 'display', label: '显示缩放', emoji: '🖥️' },
  { id: 'footer', label: '底部信息栏', emoji: '📊' },
  { id: 'eventlog', label: '消息墙', emoji: '💬' },
])

useSettingsHubRouteSection(layoutSection, layoutSubnavSections, {
  tabId: 'layout',
  activeTab: () => props.activeTab,
})

// 跳转到主页编辑
function goDashboard() {
  router.push('/')
}

// 缩放派生：基于 pageMaxWidth 计算缩放比与设计尺寸
const {
  scalingEnabled,
  toggleScaling,
  scale,
  activeDesignWidth,
  DESIGN_HEIGHT,
  vw: viewportW,
  vh: viewportH,
} = useScaling(computed(() => layoutStore.layoutConfig.pageMaxWidth))

const { save: saveSystemConfig } = useSystemConfig()

// 宽度预设
const widthPresets = [
  { label: 'iPad 1366', w: 1366 },
  { label: 'FHD 1920', w: 1920 },
  { label: '2K 2560', w: 2560 },
  { label: '4K 3840', w: 3840 },
]
// 应用宽度预设：写入 pageMaxWidth，缩放未启用时一并启用
function applyWidthPreset(w) {
  layoutStore.layoutConfig.pageMaxWidth = w
  if (!scalingEnabled.value) toggleScaling()
}

// 屏幕宽度提示（限制在 1024–3840 之间）
const screenHint = computed(() => Math.min(3840, Math.max(1024, window.screen?.width || 1920)))

// 屏幕高度提示（限制在 600–2160 之间）
const screenHeightHint = computed(() =>
  Math.min(2160, Math.max(600, window.screen?.height || 1024)),
)

// 自动匹配屏幕分辨率：写入宽度并保存高度到系统配置，失败时仅提示宽度已生效
async function autoMatchResolution() {
  const w = screenHint.value
  const h = screenHeightHint.value
  layoutStore.layoutConfig.pageMaxWidth = w
  if (!scalingEnabled.value) toggleScaling()
  try {
    await saveSystemConfig({ ui: { scaleBaseHeight: h } })
    await reloadFrontendConfig()
    chrome.notify(
      '已匹配屏幕 {w}×{h}px 并启用等比缩放'.replace('{w}', String(w)).replace('{h}', String(h)),
      'success',
    )
  } catch (e) {
    if (await handleSystemConfigPatchError(e, chrome)) return
    chrome.notify(
      '已匹配宽度 {w}px；高度配置保存失败，请稍后在系统配置中设置 scaleBaseHeight'.replace(
        '{w}',
        String(w),
      ),
      'warn',
    )
  }
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
  toggleEventLog,
} = useFloorManager(layoutConfig)

// 底部信息栏编辑：开关/重置/预设与自定义实体/移除/重排/字段与来源选项
const {
  footerCfg,
  toggleDashboardFooter,
  resetDashboardFooter,
  addPreset,
  addCustomEntity,
  removeItem,
  reorderItems,
  fieldOptions,
  sourceOptions,
  presetOptions,
  buildItemTabs,
} = useDashboardFooterEditor(layoutConfig)

const activeFooterItemId = ref('')

// 底部信息栏项 Tab（每项一个 Tab）
const footerItemTabs = computed(() => buildItemTabs(footerCfg.value.items ?? []))

// 底部信息栏排序 key（用于触发重渲染）
const footerItemsOrderKey = computed(() =>
  (footerCfg.value.items ?? []).map((it) => it.id).join(','),
)

// 项列表变化时自动选中首个或保持当前选中
watch(
  () => (footerCfg.value.items ?? []).map((it) => it.id).join(','),
  () => {
    const items = footerCfg.value.items
    if (!items.length) {
      activeFooterItemId.value = ''
      return
    }
    if (!items.some((it) => it.id === activeFooterItemId.value)) {
      activeFooterItemId.value = items[0].id
    }
  },
  { immediate: true },
)

// 重排底部信息栏项
function onFooterItemsReorder({ fromIndex, toIndex }) {
  reorderItems(fromIndex, toIndex)
}

// 添加预设项：清空输入并选中新添加的项
function onAddPreset() {
  if (!presetToAdd.value) return
  const before = footerCfg.value.items.length
  addPreset(presetToAdd.value)
  presetToAdd.value = ''
  nextTick(() => {
    const added = footerCfg.value.items[before]
    if (added) activeFooterItemId.value = added.id
  })
}

// 添加自定义实体项并选中
function onAddCustomEntity() {
  const before = footerCfg.value.items.length
  addCustomEntity()
  nextTick(() => {
    const added = footerCfg.value.items[before]
    if (added) activeFooterItemId.value = added.id
  })
}

// 移除底部信息栏项：若移除的是当前选中项，则切换到相邻项
function onRemoveFooterItem(idx) {
  const removedId = footerCfg.value.items[idx]?.id
  removeItem(idx)
  if (activeFooterItemId.value === removedId) {
    const items = footerCfg.value.items
    activeFooterItemId.value = items[Math.min(idx, items.length - 1)]?.id || ''
  }
}
</script>

<style>
/* ── Layout 面板主题色 RGB 派生：violet 主色 + cyan 子色 ── */
.layout-hub {
  --page-accent-rgb: var(--module-accent-layout-rgb);
  --page-accent-secondary: var(--module-accent-layout-sub);
  --page-accent-secondary-rgb: var(--module-accent-layout-sub-rgb);
}
</style>
