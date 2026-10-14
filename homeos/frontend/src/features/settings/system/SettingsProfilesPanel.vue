<!--
  用户档案面板入口。通过子导航切换显示方案（终端方案克隆/绑定）与备份（统一全量备份与恢复）
  两个区段。provide 档案上下文，页头提供新建方案入口。
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="profiles"
    icon-key="monitor"
    accent="var(--module-accent-admin)"
    layout="single"
    page-class="profiles-hub"
    body-class="profiles-hub__body"
  >
    <template #actions>
      <button
        v-if="profilesSection === 'profiles'"
        type="button"
        class="settings-btn-accent"
        @click="showCreateProfile = !showCreateProfile"
      >
        <Plus class="w-4 h-4" /> {{ '新建方案' }}
      </button>
    </template>

    <template #subnav>
      <SettingsHubSubnav v-model="profilesSection" :sections="profilesSubnavSections" />
    </template>

    <ProfilesDisplaySection v-show="profilesSection === 'profiles'" />
    <ProfilesBackupSection v-show="profilesSection === 'backup'" />
  </SettingsPageShell>
</template>

<script setup>
import { provide, toRef } from 'vue'
import { Plus } from '@lucide/vue'
import SettingsPageShell from '@/components/common/settings-page-shell/SettingsPageShell.vue'
import SettingsHubSubnav from '@/features/settings/shared/layout/SettingsHubSubnav.vue'
import ProfilesDisplaySection from './profiles/DisplaySection.vue'
import ProfilesBackupSection from './profiles/BackupSection.vue'
import { PROFILES_KEY } from './profiles/context'
import { useProfilesPanel } from './profiles/internals'

const props = defineProps({ activeTab: { type: String, default: 'profiles' } })

const panel = useProfilesPanel(toRef(props, 'activeTab'))
provide(PROFILES_KEY, panel)

const { profilesSection, profilesSubnavSections, showCreateProfile } = panel
</script>
<style src="./profiles/styles/profiles-theme.css"></style>
