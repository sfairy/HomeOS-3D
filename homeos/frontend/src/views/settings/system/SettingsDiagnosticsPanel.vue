<!--
组件：SettingsDiagnosticsPanel.vue
所属模块：frontend / src / views / settings / system
职责：诊断面板入口。通过子导航切换总览、运行日志、调度作业、诊断日志四个区段。
      provide 诊断上下文，页头提供刷新/复制入口。
Props：
  - activeTab：当前 Tab
关键依赖：
  - SettingsPageShell / SettingsHubSubnav：页面骨架与子导航
  - OverviewSection / RuntimeLogsSection / JobsSection / LogSection：四个子区段
  - DIAGNOSTICS_KEY / useDiagnosticsPanel：上下文 provide
数据来源：useDiagnosticsPanel() 返回的诊断数据
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="diagnostics"
    icon-key="activity"
    accent="var(--module-accent-admin)"
    layout="single"
    page-class="diagnostics-hub"
    body-class="diagnostics-hub__body"
  >
    <template #actions>
      <button type="button" class="settings-btn-accent" :disabled="loading" @click="refreshCurrentSection">
        <RefreshCw :class="['w-5 h-5', loading && 'animate-spin']" /> {{ '刷新' }}
      </button>
      <button v-if="diag?.copyText" type="button" class="settings-btn-ghost" @click="copyDiag">
        <Copy class="w-5 h-5" /> {{ '复制诊断' }}
      </button>
    </template>

    <template #subnav>
      <SettingsHubSubnav v-model="section" :sections="subnavSections" nav-class="diag-top-subnav" />
    </template>

    <div
      v-if="loadError"
      class="settings-premium-empty settings-premium-empty--amber diagnostics-load-error"
    >
      <AlertCircle class="settings-premium-empty__icon" />
      <p class="settings-premium-empty__title">{{ '诊断数据加载失败' }}</p>
      <p class="settings-premium-empty__desc">{{ loadError }}</p>
      <div class="settings-premium-empty__actions">
        <button
          type="button"
          class="settings-premium-empty__btn settings-premium-empty__btn--accent"
          :disabled="loading"
          @click="refreshCurrentSection"
        >
          <RefreshCw :class="['w-3.5 h-3.5', loading && 'animate-spin']" />
          {{ '重试' }}
        </button>
      </div>
    </div>

    <DiagnosticsOverviewSection v-if="section === 'overview'" />
    <DiagnosticsRuntimeLogsSection v-else-if="section === 'runtime'" :active="section === 'runtime'" />
    <DiagnosticsJobsSection v-else-if="section === 'jobs'" :active="section === 'jobs'" />
    <DiagnosticsLogSection v-else-if="section === 'log'" />
  </SettingsPageShell>
</template>

<script setup>
import { provide } from 'vue'
import { RefreshCw, Copy, AlertCircle } from '@lucide/vue'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsHubSubnav from '@/views/settings/shared/layout/SettingsHubSubnav.vue'
import DiagnosticsOverviewSection from './diagnostics/OverviewSection.vue'
import DiagnosticsRuntimeLogsSection from './diagnostics/RuntimeLogsSection.vue'
import DiagnosticsJobsSection from './diagnostics/JobsSection.vue'
import DiagnosticsLogSection from './diagnostics/LogSection.vue'
import { DIAGNOSTICS_KEY } from './diagnostics/context'
import { useDiagnosticsPanel } from './diagnostics/internals'

defineProps({
  activeTab: { type: String, default: 'diagnostics' },
})

const panel = useDiagnosticsPanel()
provide(DIAGNOSTICS_KEY, panel)

const { section, subnavSections, loadError, loading, diag, refreshCurrentSection, copyDiag } =
  panel
</script>

<style src="./diagnostics/styles/diagnostics-theme.css"></style>
