<!--
组件：SettingsSmartServicesPanel.vue
所属模块：frontend / src / views / settings / interact
职责：智能服务面板入口。通过子导航切换 advisor（智能顾问+用量统计）、lifespan（设备健康）、
      schedule（日程提醒+预设）三个区段。页头提供「刷新」统一刷新所有区段数据。
关键依赖：
  - SettingsPageShell / SettingsHubSubnav：页面骨架与子导航
  - SmartServicesAdvisorSection / SmartServicesLifespanSection / SmartServicesScheduleSection：三个子区段
  - useSmartServices：聚合顾问/健康/提醒数据与操作
  - useSettingsHubRouteSection：子导航路由同步
  - useAuthStore：判断是否可管理提醒/用量
数据来源：useSmartServices() 返回的 dailyAdvice / lifespan / reminders 等
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="smart-services"
    icon-key="sparkles"
    accent="var(--module-accent-smart-services)"
    page-class="smart-services-hub"
    body-class="smart-services-hub__body"
    layout="single"
  >
    <template #actions>
      <button type="button" class="settings-btn-accent" :disabled="loading" @click="refreshAll">
        <RefreshCw :class="['w-4 h-4', loading && 'animate-spin']" /> {{ '刷新' }}
      </button>
    </template>

    <template #subnav>
      <SettingsHubSubnav v-model="section" :sections="subnavSections" />
    </template>

    <SmartServicesAdvisorSection
      v-show="section === 'advisor'"
      :refresh-all="refreshAll"
      :advisor-loading="advisorLoading"
      :advisor-error="advisorError"
      :daily-advice="dailyAdvice"
      :speak-result="speakResult"
      :usage-report="usageReport"
      :clearing-usage="clearingUsage"
      :can-manage-usage="canManageUsage"
      :test-daily-speak="testDailySpeak"
      :clear-usage-stats="clearUsageStats"
    />

    <SmartServicesLifespanSection
      v-show="section === 'lifespan'"
      :lifespan-loading="lifespanLoading"
      :lifespan-error="lifespanError"
      :lifespan="lifespan"
      :refresh-all="refreshAll"
    />

    <SmartServicesScheduleSection
      v-show="section === 'schedule'"
      :can-manage-reminders="canManageReminders"
      :reminders-load-error="remindersLoadError"
      :reminders="reminders"
      :schedule-presets="schedulePresets"
      :applying-preset-id="applyingPresetId"
      :clearing-reminders="clearingReminders"
      :add-reminder="addReminder"
      :update-reminder="updateReminder"
      :delete-reminder="deleteReminder"
      :clear-all-reminders="clearAllReminders"
      :apply-schedule-preset="applySchedulePreset"
      :refresh-all="refreshAll"
    />
  </SettingsPageShell>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth.store'
import { RefreshCw } from '@lucide/vue'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsHubSubnav from '@/views/settings/shared/layout/SettingsHubSubnav.vue'
import SmartServicesAdvisorSection from '@/views/settings/interact/smart-services/SmartServicesAdvisorSection.vue'
import SmartServicesLifespanSection from '@/views/settings/interact/smart-services/SmartServicesLifespanSection.vue'
import SmartServicesScheduleSection from '@/views/settings/interact/smart-services/SmartServicesScheduleSection.vue'
import { useSmartServices } from '@/composables/settings/interact/smart-services.internals'
import { useSettingsHubRouteSection } from '@/composables/settings/hub-ui.internals'

const authStore = useAuthStore()
const canManageReminders = computed(() => ['admin', 'adult'].includes(authStore.role))
const canManageUsage = canManageReminders

const props = defineProps({
  activeTab: { type: String, default: 'smart-services' },
})

const section = ref('advisor')

const {
  loading,
  advisorLoading,
  advisorError,
  lifespanLoading,
  lifespanError,
  remindersLoadError,
  dailyAdvice,
  usageReport,
  lifespan,
  reminders,
  schedulePresets,
  applyingPresetId,
  speakResult,
  clearingUsage,
  clearingReminders,
  refreshAll,
  testDailySpeak,
  clearUsageStats,
  clearAllReminders,
  applySchedulePreset,
  addReminder,
  updateReminder,
  deleteReminder,
} = useSmartServices()

const subnavSections = computed(() => [
  { id: 'advisor', label: '智能顾问', emoji: '🧠' },
  { id: 'lifespan', label: '设备健康', emoji: '💓' },
  { id: 'schedule', label: '日程提醒', emoji: '📅' },
])

useSettingsHubRouteSection(section, subnavSections, {
  tabId: 'smart-services',
  activeTab: () => props.activeTab,
})

onMounted(refreshAll)
</script>

<style src="./styles/SettingsSmartServicesPanel.css"></style>
