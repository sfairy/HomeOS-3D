<!--
组件：SettingsLifeAccountsPanel.vue
所属模块：frontend / src / views / settings / home
职责：生活账户面板入口。基于 SettingsBindingsAccountSection 展示账户分类、绑定模式、
      可映射字段与图表字段，支持从实体推断与填充默认属性。页头链接阶梯电价并提供保存/取消。
关键依赖：
  - SettingsPageShell / SettingsPendingSaveAction：页面骨架与保存条
  - SettingsBindingsAccountSection：账户绑定子区段
  - useSettingsLifeAccountsHub：聚合分类、字段、保存/取消
数据来源：useSettingsLifeAccountsHub() 返回的 categoryTabs / activeMappableFields 等
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="life-accounts"
    icon-key="zap"
    accent="var(--module-accent-energy)"
    layout="single"
    page-class="life-accounts-hub"
    body-class="life-accounts-hub__body"
  >
    <template #actions>
      <RouterLink
        :to="SETTINGS_ROUTES.params('pricing')"
        class="settings-btn-ghost text-xs shrink-0"
      >
        {{ '阶梯电价' }}
      </RouterLink>
      <SettingsPendingSaveAction
        :pending="pendingChanges"
        :saving="layoutSaving"
        save-text="保存生活账户"
        saving-text="同步中..."
        @save="saveLayoutConfig"
        @cancel="cancelLayoutChanges"
      />
    </template>

    <template #mobile-save>
      <SettingsPendingSaveAction
        :pending="pendingChanges"
        :saving="layoutSaving"
        save-text="保存生活账户"
        saving-text="同步中..."
        @save="saveLayoutConfig"
        @cancel="cancelLayoutChanges"
      />
    </template>

    <div v-if="pendingChanges > 0" class="settings-inline-save-bar">
      <SettingsPendingSaveAction
        :pending="pendingChanges"
        :saving="layoutSaving"
        save-text="保存生活账户"
        saving-text="同步中..."
        @save="saveLayoutConfig"
        @cancel="cancelLayoutChanges"
      />
    </div>

    <SettingsBindingsAccountSection
      v-model:category-tab="categoryTab"
      :category-tabs="categoryTabs"
      :mode-options="modeOptions"
      :active-meta="activeMeta"
      :active-mappable-fields="activeMappableFields"
      :active-chart-fields="activeChartFields"
      :composite-entity-attrs="compositeEntityAttrs"
      @set-binding-mode="setBindingMode"
      @fill-default-attrs="fillDefaultAttrs"
      @infer-from-entity="inferFromEntity"
    />
  </SettingsPageShell>
</template>

<script setup>
import { RouterLink } from 'vue-router'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsPendingSaveAction from '@/views/settings/shared/SettingsPendingSaveAction.vue'
import SettingsBindingsAccountSection from '@/views/settings/connect/bindings/SettingsBindingsAccountSection.vue'
import { useSettingsLifeAccountsHub } from '@/composables/settings/connect/bindings.internals'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

// 入参：当前激活的 Tab id
const props = defineProps({ activeTab: { type: String, default: 'life-accounts' } })

const {
  categoryTab,
  categoryTabs,
  modeOptions,
  activeMeta,
  activeMappableFields,
  activeChartFields,
  compositeEntityAttrs,
  pendingChanges,
  layoutSaving,
  setBindingMode,
  fillDefaultAttrs,
  inferFromEntity,
  saveLayoutConfig,
  cancelLayoutChanges,
} = useSettingsLifeAccountsHub(() => props.activeTab)
</script>
<style src="../shared/styles/bindings-theme.css"></style>
