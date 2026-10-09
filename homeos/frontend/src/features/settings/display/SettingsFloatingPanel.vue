<!--
组件：SettingsFloatingPanel.vue
所属模块：frontend / src / views / settings / display
职责：浮动组件面板。管理浮动组件（添加/移除/显隐/编辑），并集成安防区域编辑入口
      （AFH 编辑器锁定、Hub Tabs、保存/取消）。
关键依赖：
  - SettingsPageShell / SettingsCard：页面骨架
  - FloatingPanelHeaderSection：面板头部（添加组件、拖拽锁定）
  - FloatingWidgetRow：浮动组件行（含 AFH 编辑器）
  - useFloatingWidgets / useFloatingPanelDisplay：浮动组件逻辑与展示派生
数据来源：layoutStore.layoutConfig（浮窗 / afhConfig 等）
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="floating"
    icon-key="grip"
    accent="var(--module-accent-layout)"
    layout="single"
    page-class="floating-hub"
  >
    <template #actions />

    <div class="settings-hub-section fp-hub">
      <SettingsCard full static extra-class="fp-overview-card overflow-visible">
        <FloatingPanelHeaderSection
          v-model:show-add-floating="showAddFloating"
          :widget-count="floatingWidgets.length"
          :is-afh-locked="isAfhLocked"
          :floating-catalog-groups="floatingCatalogGroups"
          @toggle-afh-lock="toggleAfhLock"
          @add-widget="addFloatingWidgetByType"
        />
      </SettingsCard>

      <SettingsCard full static extra-class="fp-workspace-card overflow-visible">
        <div class="fp-workspace-card__body">
          <div
            v-if="floatingWidgets.length === 0"
            class="settings-premium-empty settings-premium-empty--violet"
          >
            <Grip class="settings-premium-empty__icon" />
            <p class="settings-premium-empty__title">{{ '暂无浮动组件' }}</p>
            <p class="settings-premium-empty__desc">{{ '点击上方「添加组件」开始配置' }}</p>
          </div>

          <div v-else class="fp-widget-list">
            <FloatingWidgetRow
              v-for="fw in floatingWidgets"
              :key="fw.id"
              v-model:open-section="openSection"
              v-model:afh-config="afhConfig"
              v-model:afh-hub-tabs="afhHubTabs"
              :fw="fw"
              :afh-edit-id="afhEditId"
              :is-afh-editor-dirty="isAfhEditorDirty"
              :get-afh-icon="getAfhIcon"
              :is-valid-floating-type="isValidFloatingType"
              :toggle-afh-editor="toggleAfhEditor"
              :toggle-floating-visible="toggleFloatingVisible"
              :remove-floating-widget-by-id="removeFloatingWidgetById"
              :add-security-zone="addSecurityZone"
              :go-security-modes="goSecurityModes"
              :save-afh-config="saveAfhConfig"
              :cancel-afh-editor="cancelAfhEditor"
            />
          </div>
        </div>
      </SettingsCard>
    </div>
  </SettingsPageShell>
</template>

<script setup>
import { computed } from 'vue'
import { Grip } from '@lucide/vue'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import FloatingPanelHeaderSection from './floating/PanelHeaderSection.vue'
import FloatingWidgetRow from './floating/WidgetRow.vue'
import { useLayoutConfigRef } from '@/composables/ui/useLayoutConfigRef'
import { useFloatingWidgets } from '@/features/settings/composables/display/layout-floating.internals'
import { useFloatingPanelDisplay } from '@/features/settings/composables/display/layout-floating.internals'
import './floating/styles/floating.css'

defineProps({ activeTab: { type: String, default: 'floating' } })

const { layoutStore, layoutConfig } = useLayoutConfigRef()

// 浮动组件相关状态与方法（编辑 id、Hub Tabs、添加/移除等）
const {
  showAddFloating,
  afhEditId,
  afhConfig,
  afhHubTabs,
  floatingWidgets,
  toggleAfhLock,
  addFloatingWidgetByType,
  toggleAfhEditor,
  cancelAfhEditor,
  isAfhEditorDirty,
  addSecurityZone,
  saveAfhConfig,
  removeFloatingWidgetById,
  getAfhIcon,
  isValidFloatingType,
  goSecurityModes,
} = useFloatingWidgets(layoutConfig)

// 浮动面板展示派生：展开区段、目录分组、切换显隐
const { openSection, floatingCatalogGroups, toggleFloatingVisible } = useFloatingPanelDisplay({
  layoutStore,
  afhEditId,
})

// AFH 编辑器是否锁定（默认锁定）
const isAfhLocked = computed(() => layoutConfig.value.isAfhLocked !== false)
</script>

<style>
/* ── Floating 面板主题色 RGB 派生：violet 主色 + cyan 子色 ── */
.floating-hub {
  --page-accent-rgb: var(--module-accent-layout-rgb);
  --page-accent-secondary: var(--module-accent-layout-sub);
  --page-accent-secondary-rgb: var(--module-accent-layout-sub-rgb);
}
</style>
