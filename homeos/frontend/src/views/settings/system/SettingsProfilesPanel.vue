<!--
组件：SettingsProfilesPanel.vue
所属模块：frontend / src / views / settings / system
职责：用户档案面板入口。通过子导航切换显示方案（终端方案克隆/绑定）与备份（导出/导入/服务端备份）两个区段。
      provide 档案上下文，页头提供新建方案与导入入口。
Props：
  - activeTab：当前 Tab
关键依赖：
  - SettingsPageShell / SettingsHubSubnav：页面骨架与子导航
  - ImportBackupModal：导入备份弹窗
  - DisplaySection / BackupSection：两个子区段
  - PROFILES_KEY / useProfilesPanel：上下文 provide
数据来源：useProfilesPanel() 返回的档案/备份数据
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

    <ImportBackupModal
      :open="showImport"
      :backup-type="importBackupType"
      :sections="importSections"
      :import-json-text="importJsonText"
      :selected-file-name="selectedFileName"
      :is-importing="isImporting || appConfigImporting"
      @close="showImport = false"
      @update:sections="importSections = $event"
      @update:import-json-text="importJsonText = $event"
      @file-select="handleFileSelect"
      @import="handleImport(importBackupType)"
    />
  </SettingsPageShell>
</template>

<script setup>
import { provide, toRef } from 'vue'
import { Plus } from '@lucide/vue'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsHubSubnav from '@/views/settings/shared/layout/SettingsHubSubnav.vue'
import ImportBackupModal from '@/views/settings/shared/ImportBackupModal.vue'
import ProfilesDisplaySection from './profiles/DisplaySection.vue'
import ProfilesBackupSection from './profiles/BackupSection.vue'
import { PROFILES_KEY } from './profiles/context'
import { useProfilesPanel } from './profiles/internals'

const props = defineProps({ activeTab: { type: String, default: 'profiles' } })

const panel = useProfilesPanel(toRef(props, 'activeTab'))
provide(PROFILES_KEY, panel)

const {
  profilesSection,
  profilesSubnavSections,
  showCreateProfile,
  showImport,
  importBackupType,
  importSections,
  importJsonText,
  selectedFileName,
  isImporting,
  appConfigImporting,
  handleFileSelect,
  handleImport,
} = panel
</script>
<style src="./profiles/styles/profiles-theme.css"></style>
