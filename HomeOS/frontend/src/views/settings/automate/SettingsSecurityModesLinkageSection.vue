/**
 * 组件：SettingsSecurityModesLinkageSection.vue
 *
 * 所属模块：frontend / src / views / settings / automate
 * 职责：全屋联动面板入口。组合概览 Hero、Tab（人员判定 / 安防↔家庭模式 / 跨模块联动）
 *      与对应子面板，并复用 presence / linkage composable 提供数据与回调。
 * 关键依赖：
 *  - usePresenceEntityConfig：人员配置加载/保存/刷新
 *  - useSecurityLinkage：联动预设与开关
 *  - useSettingsSecurityModesLinkageDisplay：派生人员计数与展示标签
 *  - linkage 子组件：Hero / Presence / HomeModeMatrix / Automation / LoadErrorBanner
 * 数据来源：presence / linkage composable + 各子组件内部状态
 */
<script setup>
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/SettingsSecurityModesLinkageSection 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { computed, onMounted, ref } from 'vue'
import { Users, Home, Link2 } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsOrchTabs from '@/views/settings/shared/layout/SettingsOrchTabs.vue'
import { usePresenceEntityConfig } from '@/composables/advisor/hub-presence-advisor.internals'
import { useSecurityLinkage, useSettingsSecurityModesLinkageDisplay } from '@/composables/settings/automate/security-modes-core.internals'
import LinkageLoadErrorBanner from '@/views/settings/automate/linkage/LoadErrorBanner.vue'
import LinkageHeroSection from '@/views/settings/automate/linkage/HeroSection.vue'
import LinkagePresenceSection from '@/views/settings/automate/linkage/PresenceSection.vue'
import LinkageHomeModeMatrixSection from '@/views/settings/automate/linkage/HomeModeMatrixSection.vue'
import LinkageAutomationSection from '@/views/settings/automate/linkage/AutomationSection.vue'

// 全屋联动 Tab 定义：人员判定 / 安防对照 / 跨模块联动
const LINKAGE_TABS = [
  { id: 'presence', label: '人员在线判定', icon: Users },
  { id: 'matrix', label: '安防 ↔ 家庭模式', icon: Home },
  { id: 'automation', label: '跨模块联动', icon: Link2 },
]

// 当前激活的联动 Tab，默认人员判定
const activeLinkageTab = ref('presence')

const {
  loading: presenceLoading,
  saving: presenceSaving,
  presencePersons,
  autoMode,
  presencePreview,
  refresh: refreshPresence,
  save: savePresence,
} = usePresenceEntityConfig()

const {
  loading: linkageLoading,
  loadError: linkageLoadError,
  security: linkageSecurity,
  presets: linkagePresets,
  paramRows,
  flagRows,
  enabledCount: linkageEnabledCount,
  togglePreset,
  toggleFlag,
  ensureFlagOn,
  refresh: refreshLinkage,
} = useSecurityLinkage()

const {
  personStatCount,
  atHomeCount,
  presenceModeLabel,
  presenceStatusLabel,
  presetIcon,
  paramRoute,
} = useSettingsSecurityModesLinkageDisplay({
  presencePersons,
  autoMode,
  presencePreview,
})

/** 预设卡片已覆盖的开关不再重复进列表；对照页主开关与预设同键可并存 */
const automationFlagRows = computed(() => {
  const covered = new Set(linkagePresets.value.map((p) => p.configKey))
  return flagRows.value.filter((f) => !covered.has(f.key))
})

// 在 Tab 上叠加计数徽标：人员判定显示人员数，跨模块联动显示已启用联动数
const linkageTabs = computed(() =>
  LINKAGE_TABS.map((tab) => {
    if (tab.id === 'presence') {
      return { ...tab, count: personStatCount.value || undefined }
    }
    if (tab.id === 'automation') {
      return { ...tab, count: linkageEnabledCount.value || undefined }
    }
    return { ...tab }
  }),
)

// 挂载时拉取人员配置，bootRetry 表示首次失败可重试
onMounted(() => {
  refreshPresence({ bootRetry: true })
})
</script>

<template>
  <SettingsCard static nested extra-class="link-workspace svc-workspace hub-workspace">
    <LinkageLoadErrorBanner
      v-if="linkageLoadError"
      class="linkage-load-error"
      :error="linkageLoadError"
      :loading="linkageLoading"
      @retry="refreshLinkage({ bootRetry: true })"
    />

    <div class="link-glance-band">
      <LinkageHeroSection
        :active-tab="activeLinkageTab"
        :presence-mode-label="presenceModeLabel"
        :presence-status-label="presenceStatusLabel"
        :linkage-enabled-count="linkageEnabledCount"
        :linkage-presets-length="linkagePresets.length"
        :person-stat-count="personStatCount"
        :at-home-count="atHomeCount"
        :param-rows-length="paramRows.length"
      />
    </div>

    <div class="link-body link-body--tabs">
      <div class="link-tabs-dock">
        <SettingsOrchTabs v-model="activeLinkageTab" :tabs="linkageTabs" plain />
      </div>

      <div class="link-tab-panels">
        <div
          v-show="activeLinkageTab === 'presence'"
          class="link-tab-panel"
          role="tabpanel"
        >
          <LinkagePresenceSection
            v-model:presence-persons="presencePersons"
            hide-head
            :loading="presenceLoading"
            :saving="presenceSaving"
            :auto-mode="autoMode"
            :presence-preview="presencePreview"
            @save="savePresence"
            @refresh="refreshPresence"
          />
        </div>

        <div
          v-show="activeLinkageTab === 'matrix'"
          class="link-tab-panel"
          role="tabpanel"
        >
          <LinkageHomeModeMatrixSection
            hide-head
            :loading="linkageLoading"
            :linkage-security="linkageSecurity"
            @toggle-flag="toggleFlag"
            @ensure-flag-on="ensureFlagOn"
          />
        </div>

        <div
          v-show="activeLinkageTab === 'automation'"
          class="link-tab-panel"
          role="tabpanel"
        >
          <LinkageAutomationSection
            hide-head
            :loading="linkageLoading"
            :linkage-security="linkageSecurity"
            :linkage-presets="linkagePresets"
            :flag-rows="automationFlagRows"
            :param-rows="paramRows"
            :preset-icon="presetIcon"
            :param-route="paramRoute"
            @toggle-preset="togglePreset"
            @toggle-flag="toggleFlag"
          />
        </div>
      </div>
    </div>
  </SettingsCard>
</template>
<style src="./linkage/styles/linkage.css"></style>
