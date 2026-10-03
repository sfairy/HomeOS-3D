<!--
组件：SettingsWidgetsPanel.vue
所属模块：frontend / src / views / settings / display
职责：微件面板。管理侧栏/仪表盘/右侧面板微件的添加/移除/显隐/排序/配置，
      集成高度配置、Hero 轮播编辑、快捷按钮配置与自定义 HTML 草案。
关键依赖：
  - SettingsPageShell / SettingsPendingSaveAction：页面骨架与待保存动作
  - WidgetsHubSection：微件主区段
  - usePanelWidgets / useQuickButtonConfig：微件与快捷按钮逻辑
  - WIDGET_PANEL_CONFIG_KEY：向子组件 provide 微件配置
  - useLayoutPendingSave：布局待保存状态与保存/取消回调
数据来源：layoutStore.layoutConfig（rightPanelWidgets / dashboardWidgets 等）
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="widgets"
    icon-key="puzzle"
    accent="var(--module-accent-layout)"
    layout="single"
    page-class="widgets-hub"
    body-class="widgets-hub__body"
  >
    <template #actions />

    <template #mobile-save>
      <SettingsPendingSaveAction
        :pending="pending"
        :saving="saving"
        :save-text="saveText"
        @save="save"
        @cancel="cancel"
      />
    </template>

    <WidgetsHubSection
      v-model:show-add-widget="showAddWidget"
      :sidebar-widget-groups="sidebarWidgetGroups"
      :dashboard-widget-groups="dashboardWidgetGroups"
      :right-panel-widgets="rightPanelWidgets"
      :widget-edit-id="widgetEditId"
      :height-edit-id="heightEditId"
      :height-draft="heightDraft"
      :height-preset="heightPreset"
      :quick-button-options="quickButtonOptions"
      :max-quick-buttons="maxQuickButtons"
      :quick-selected-count="quickSelectedCount"
      :quick-buttons-full="quickButtonsFull"
      :is-quick-button-on="isQuickButtonOn"
      :quick-button-order="quickButtonOrder"
      :is-custom-html-draft-dirty="isCustomHtmlDraftDirty"
      @add-widget="addWidget"
      @open-builder="openBuilder"
      @open-config="openWidgetConfig"
      @eject="ejectWidget"
      @open-height="openHeightConfig"
      @move="moveWidget"
      @toggle-visible="toggleWidgetVisible"
      @delete="deleteWidget"
      @save-config="saveWidgetConfig"
      @cancel-config="cancelWidgetConfig"
      @set-hero-slide-type="setHeroSlideType"
      @move-hero-slide="moveHeroSlide"
      @reset-height="resetHeightConfig"
      @save-height="saveHeightConfig"
      @toggle-quick-button="toggleQuickButton"
      @update-height-draft="heightDraft = $event"
    />
  </SettingsPageShell>
</template>

<script setup>
import { computed, provide } from 'vue'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsPendingSaveAction from '@/views/settings/shared/SettingsPendingSaveAction.vue'
import WidgetsHubSection from './widgets/WidgetsHubSection.vue'
import { useLayoutConfigRef } from '@/composables/ui/useLayoutConfigRef'
import { usePanelWidgets } from '@/composables/settings/display/layout-panel-widgets.internals'
import { useQuickButtonConfig, toggleWidgetVisible, WIDGET_PANEL_CONFIG_KEY } from '@/composables/settings/display/layout-panel-widgets.internals'
import { useLayoutPendingSave } from '@/composables/settings/pending.internals'
import { useChromeStore } from '@/stores/chrome.store'

defineProps({ activeTab: { type: String, default: 'widgets' } })

const chrome = useChromeStore()
const { pending, saving, save, cancel, saveText } = useLayoutPendingSave({
  saveText: '保存布局',
  notifySuccess: (msg) => chrome.notify(msg, 'success'),
  notifyError: (msg) => chrome.notify(msg, 'error'),
})

const { layoutConfig } = useLayoutConfigRef()

// 右侧面板微件列表（双向读写 layoutConfig.rightPanelWidgets）
const rightPanelWidgets = computed({
  get: () => layoutConfig.value.rightPanelWidgets || [],
  set: (v) => {
    layoutConfig.value.rightPanelWidgets = v
  },
})

// 微件相关状态与方法（分组、编辑 id、高度配置、Hero 轮播、自定义 HTML 等）
const {
  sidebarWidgetGroups,
  dashboardWidgetGroups,
  showAddWidget,
  widgetEditId,
  widgetConfig,
  heightEditId,
  heightDraft,
  heightPreset,
  openHeightConfig,
  saveHeightConfig,
  resetHeightConfig,
  openWidgetConfig,
  saveWidgetConfig,
  cancelWidgetConfig,
  isCustomHtmlDraftDirty,
  setHeroSlideType,
  moveHeroSlide,
  openBuilder,
  ejectWidget,
  addWidget,
  deleteWidget,
  moveWidget,
} = usePanelWidgets(rightPanelWidgets)

// 向子组件 provide 微件配置
provide(WIDGET_PANEL_CONFIG_KEY, widgetConfig)

// 快捷按钮配置（选项、上限、选中数、是否已满、顺序、切换）
const {
  quickButtonOptions,
  maxQuickButtons,
  quickSelectedCount,
  quickButtonsFull,
  isQuickButtonOn,
  quickButtonOrder,
  toggleQuickButton,
} = useQuickButtonConfig(widgetConfig)
</script>

<style>
/* ── Widgets 面板主题色 RGB 派生：violet 主色 + cyan 子色 ── */
.widgets-hub {
  --page-accent-rgb: var(--module-accent-layout-rgb);
  --page-accent-secondary: var(--module-accent-layout-sub);
  --page-accent-secondary-rgb: var(--module-accent-layout-sub-rgb);
}
</style>
