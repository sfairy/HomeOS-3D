<!--
组件：ConfigPanel.vue
所属模块：frontend / src / views / settings / system
职责：高级参数（系统配置）面板入口。整合参数侧栏、工作区、校验横幅、审计卡片与操作栏，
      支持全局搜索、专家模式、开发 key 显示、保存/重置与导出。
Props：
  - activeTab：当前 Tab
关键依赖：
  - SettingsPageShell：页面骨架
  - SystemConfigParamsSidebar / SystemConfigWorkspace / SystemConfigValidationBanner / SystemConfigSearchView：子组件
  - SystemConfigActionsBar / SettingsPendingSaveAction / SystemConfigAuditCard：操作栏与审计
  - useSystemConfigPanel / useSystemConfigPanelShell：配置面板逻辑
  - useRegisterSettingsTabPending：Tab 级离开拦截
数据来源：useSystemConfigPanel() 返回的配置/审计/搜索状态
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="params"
    icon-key="sliders"
    accent="var(--module-accent-admin)"
    layout="single"
    :scroll-body="false"
    body-class="params-page__workspace"
  >
    <template #actions>
      <SystemConfigActionsBar
        :loading="loading"
        :saving="saving"
        :exporting="exporting"
        :importing="importing"
        :pending-changes="pendingChanges"
        :pending-hint="pendingChangesHint"
        :saved-tip="savedTip"
        :saved-tip-ok="savedTipOk"
        :conflict-reload="configConflict"
        @export="exportConfig"
        @reload="reload"
        @save="save"
        @cancel="cancelChanges"
        @import-file="onImportFileFromBar"
      />
    </template>

    <ApiQueryState
      :loading="loading"
      :error="loadError"
      error-title="运行参数加载失败"
      tone="sky"
      @retry="reload"
    >
      <div v-if="sectionList.length" class="params-shell">
        <SystemConfigParamsSidebar
          ref="paramsDockRef"
          v-model:global-search="globalSearch"
          v-model:active-section="activeSection"
          v-model:active-category="activeCategory"
          :expert-mode="expertMode"
          :show-dev-keys="showDevKeys"
          :section-list="visibleSectionList"
          :search-result-count="searchResults.length"
          :search-match-map="searchMatchMap"
          :section-pending-map="visibleSectionPendingMap"
          @update:expert-mode="setExpertMode"
          @update:show-dev-keys="showDevKeys = $event"
        />

        <div class="params-main">
          <SystemConfigValidationBanner
            v-if="validationErrors.length"
            :errors="validationErrors"
            :section-label="sectionLabel"
            :field-label="fieldLabel"
            @navigate="navigateToValidationError"
          />

          <p class="params-deeplink-hint">
            HA 连接、语音、房间与常用设备请到对应设置页修改，这里只保留运行阈值与专家项。
            <RouterLink class="params-deeplink-hint__link" :to="SETTINGS_ROUTES.connection()">连接</RouterLink>
            ·
            <RouterLink class="params-deeplink-hint__link" :to="SETTINGS_ROUTES.voice()">语音</RouterLink>
            ·
            <RouterLink class="params-deeplink-hint__link" :to="SETTINGS_ROUTES.rooms()">房间</RouterLink>
            ·
            <RouterLink class="params-deeplink-hint__link" :to="SETTINGS_ROUTES.favorites()">常用设备</RouterLink>
          </p>

          <div v-if="isSearchMode" class="params-inline-head params-section-toolbar params-section-toolbar--search">
            <div class="params-inline-head__main">
              <div class="params-inline-head__title-row">
                <h3 class="params-inline-head__title">{{ '搜索结果' }}</h3>
                <span class="params-inline-head__meta">{{ `${searchResults.length} 项` }}</span>
              </div>
            </div>
          </div>

          <div class="params-main__scroll" ref="mainScrollRef">
            <SystemConfigSearchView
              v-if="isSearchMode"
              :results="searchResults"
              :show-dev-keys="showDevKeys"
              :search-field-id="searchFieldId"
              :field-label="fieldLabel"
              :field-hint="fieldHint"
              :is-field-pending="isFieldPending"
              @field-value="onFieldValueUpdate"
              @field-masked="onFieldMaskedUpdate"
              @jump-section="onOpenSectionFromSearch"
            />

            <SystemConfigWorkspace
              v-else-if="currentSection"
              :section="currentSection"
              :display-field-count="displayFields.length"
              :filtered-field-count="filteredSectionFields.length"
              :boolean-fields="booleanFields"
              :input-fields="inputFields"
              :input-field-entries="inputFieldEntries"
              :show-dev-keys="showDevKeys"
              :field-id="fieldId"
              :field-label="fieldLabel"
              :field-hint="fieldHint"
              :is-field-pending="isFieldPending"
              @field-value="onFieldValueUpdate"
              @field-masked="onFieldMaskedUpdate"
            />

            <details v-if="!isSearchMode && configAudit.length" class="params-audit-details">
              <summary class="params-audit-details__summary">
                {{ '变更审计' }}
                <span class="params-audit-details__meta">{{ `最近 ${configAudit.length} 条` }}</span>
              </summary>
              <SystemConfigAuditCard
                :entries="configAudit"
                :section-label="sectionLabel"
                :field-label="fieldLabel"
              />
            </details>

            <div v-if="!isSearchMode" class="params-main__foot">
              <button type="button" class="params-reset-all" @click="onResetAll">
                <RotateCcw class="w-3.5 h-3.5" aria-hidden="true" />
                {{ '全部恢复默认' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="!loadError" class="settings-premium-empty settings-premium-empty--sky params-page-empty">
        <SlidersHorizontal class="settings-premium-empty__icon" />
        <p class="settings-premium-empty__title">{{ '暂无运行参数' }}</p>
        <p class="settings-premium-empty__desc">{{ '当前没有可展示的运行参数分区，可尝试切换专家模式或重新加载' }}</p>
        <div class="settings-premium-empty__actions">
          <button
            type="button"
            class="settings-premium-empty__btn settings-premium-empty__btn--accent"
            @click="reload"
          >
            {{ '重新加载' }}
          </button>
        </div>
      </div>
    </ApiQueryState>
  </SettingsPageShell>
</template>

<script setup>
import { ref, toRef } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import { SlidersHorizontal, RotateCcw } from '@lucide/vue'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { useSystemConfigPanel } from '@/features/settings/composables/system/system-config-panel.internals'
import { useRegisterSettingsTabPending } from '@/features/settings/composables/pending.internals'
import SystemConfigActionsBar from '@/features/settings/shared/system-config/SystemConfigActionsBar.vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import SystemConfigParamsSidebar from '@/features/settings/shared/system-config/SystemConfigParamsSidebar.vue'
import SystemConfigAuditCard from '@/features/settings/shared/system-config/SystemConfigAuditCard.vue'
import SystemConfigValidationBanner from './system-config/SystemConfigValidationBanner.vue'
import SystemConfigSearchView from './system-config/SystemConfigSearchView.vue'
import SystemConfigWorkspace from './system-config/SystemConfigWorkspace.vue'
import { useSystemConfigPanelShell } from './system-config/useSystemConfigPanelShell'

const props = defineProps({ activeTab: { type: String, default: '' } })
const route = useRoute()
const paramsDockRef = ref(null)

const panel = useSystemConfigPanel({ route, paramsDockRef })
const {
  configAudit,
  loading,
  loadError,
  saving,
  savedTip,
  savedTipOk,
  configConflict,
  sectionList,
  visibleSectionList,
  activeSection,
  activeCategory,
  globalSearch,
  showDevKeys,
  expertMode,
  exporting,
  importing,
  currentSection,
  isSearchMode,
  searchResults,
  searchMatchMap,
  booleanFields,
  inputFields,
  filteredSectionFields,
  pendingChanges,
  visibleSectionPendingMap,
  pendingChangesHint,
  isFieldPending,
  goPrevSection,
  goNextSection,
  validationErrors,
  sectionLabel,
  fieldLabel,
  fieldHint,
  fieldId,
  searchFieldId,
  reload,
  save,
  cancelChanges,
  exportConfig,
  onImportFileFromBar,
  onResetAll,
  setExpertMode,
  navigateToValidationError,
  ensureLoaded,
} = panel

useRegisterSettingsTabPending('params', () => pendingChanges.value > 0)

const {
  mainScrollRef,
  displayFields,
  inputFieldEntries,
  onFieldValueUpdate,
  onFieldMaskedUpdate,
} = useSystemConfigPanelShell({
  activeTab: toRef(props, 'activeTab'),
  ensureLoaded,
  activeSection,
  currentSection,
  inputFields,
  goPrevSection,
  goNextSection,
  isSearchMode,
})

/** 搜索结果「打开分区」：退出搜索并进入该分区 */
/** 搜索结果「打开分区」：退出搜索并进入该分区 */
function onOpenSectionFromSearch(sectionKey) {
  globalSearch.value = ''
  paramsDockRef.value?.selectSection?.(sectionKey)
}
</script>
<style src="./system-config/styles/system-config-panel.css"></style>
