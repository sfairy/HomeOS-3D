<!--
组件：SettingsAccessPanel.vue
所属模块：frontend / src / views / settings / system
职责：账户与访问面板入口。通过子导航切换安全（锁定/MFA/个人偏好）、成员管理、访客访问、审计日志四个区段。
      页头提供保存/取消；管理修改密码弹窗与未保存拦截。
Props：
  - activeTab：当前 Tab
关键依赖：
  - SettingsPageShell / SettingsHubSubnav：页面骨架与子导航
  - ChangePasswordModal / SettingsAccessSecuritySection / SettingsAccessMembersSection / SettingsAccessGuestSection / SettingsAccessAuditSection / SettingsAccessMemberModal：子区段与弹窗
  - SettingsPendingSaveAction：保存条
  - useRegisterSettingsTabPending：布局保存与离开拦截
  - useAccessPanel：访问面板聚合
数据来源：useAccessPanel() 返回的成员/访客/审计数据
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="access"
    icon-key="user"
    accent="var(--module-accent-admin)"
    layout="single"
    page-class="access-hub"
    body-class="access-hub__body"
  >
    <template #actions>
      <button
        v-if="accessSection === 'members' && isAdmin"
        type="button"
        class="settings-btn-accent"
        @click="openCreate"
      >
        <UserPlus class="w-3.5 h-3.5" /> {{ '添加成员' }}
      </button>
      <div
        v-else-if="accessSection === 'audit' && isAdmin"
        class="flex flex-wrap items-center gap-2"
      >
        <button
          type="button"
          class="settings-btn-ghost"
          style="color: var(--premium-accent-red)"
          :disabled="auditClearing || auditLoading"
          @click="clearAuditLogs"
        >
          <Loader2 v-if="auditClearing" class="w-3.5 h-3.5 animate-spin" />
          <Trash2 v-else class="w-3.5 h-3.5" />
          {{ auditClearing ? '清除中…' : '清除记录' }}
        </button>
        <button
          type="button"
          class="settings-btn-accent"
          :disabled="auditExporting"
          @click="exportAuditCsv"
        >
          <Loader2 v-if="auditExporting" class="w-3.5 h-3.5 animate-spin" />
          {{ auditExporting ? '导出中…' : '导出 CSV' }}
        </button>
      </div>
    </template>

    <template #subnav>
      <SettingsHubSubnav
        v-model="accessSection"
        :sections="accessSubnavSections"
        nav-class="access-top-subnav"
      />
    </template>

    <SettingsAccessSecuritySection
      v-show="accessSection === 'security'"
      v-model:show-change-password="showChangePassword"
      v-model:session-expire-days="sessionExpireDays"
      v-model:lockout-max-attempts="lockoutMaxAttempts"
      v-model:lockout-minutes="lockoutMinutes"
      v-model:session-refresh-hours="sessionRefreshHours"
      v-model:mfa-confirm-code="mfaConfirmCode"
      v-model:mfa-disable-code="mfaDisableCode"
      :auth-store="authStore"
      :user-initials="userInitials"
      :session-eyebrow="sessionEyebrow"
      :lock-enabled="lockEnabled"
      :security-score="securityScore"
      :security-level-class="securityLevelClass"
      :security-level-label="securityLevelLabel"
      :users="users"
      :admin-count="adminCount"
      :user-prefs="userPrefs"
      :presence-person-options="presencePersonOptions"
      :is-admin="isAdmin"
      :pin-length="pinLength"
      :pin-strength-percent="pinStrengthPercent"
      :pin-strength-variant="pinStrengthVariant"
      :pin-strength-label="pinStrengthLabel"
      :is-weak-pin="isWeakPin"
      :mfa-enabled="mfaEnabled"
      :mfa-qr="mfaQr"
      :auth-security-saving="authSecuritySaving"
      :auth-security-dirty="authSecurityDirty"
      :auth-security-preset-id="authSecurityPresetId"
      :auth-security-summary="authSecuritySummary"
      :login-audit-ok-count="loginAuditOkCount"
      :login-audit-fail-count="loginAuditFailCount"
      :recent-login-fail="recentLoginFail"
      :login-audit-loading="loginAuditLoading"
      :prefs-saving="prefsSaving"
      :prefs-dirty="accessPrefsDirty"
      @update:prefs-dirty="accessPrefsDirty = $event"
      :role-meta="roleMeta"
      :sanitize-pin="sanitizePin"
      :toggle-settings-lock="toggleSettingsLock"
      :start-mfa-setup="startMfaSetup"
      :confirm-mfa-setup="confirmMfaSetup"
      :disable-mfa="disableMfa"
      :save-auth-security-config="saveAuthSecurityConfig"
      :apply-auth-security-preset="applyAuthSecurityPreset"
      :format-audit-time="formatAuditTime"
      :set-temperature-unit="setTemperatureUnit"
      :save-preferences="savePreferences"
    />

    <SettingsAccessMembersSection
      v-if="accessSection === 'members'"
      :loading="loading"
      :load-error="membersLoadError"
      :is-admin="isAdmin"
      :current-user="authStore.user"
      :member-role-filter="memberRoleFilter"
      :member-role-tabs="memberRoleTabs"
      :filtered-users="filteredUsers"
      :role-meta="roleMeta"
      :user-initials-of="userInitialsOf"
      @update:member-role-filter="memberRoleFilter = $event"
      @create="openCreate"
      @edit="openEdit"
      @remove="removeUser"
    />

    <SettingsAccessGuestSection
      v-if="accessSection === 'guest'"
      v-model:guest-hours="guestHours"
      v-model:guest-restrictions-str="guestRestrictionsStr"
      :guest-hour-presets="guestHourPresets"
      :guest-generating="guestGenerating"
      :guest-share-url="guestShareUrl"
      :guest-expires-at="guestExpiresAt"
      :guest-preset-label="guestPresetLabel"
      :format-guest-expiry="formatGuestExpiry"
      @create="createGuestLink"
      @copy="copyGuestUrl"
    />

    <SettingsAccessAuditSection
      v-if="accessSection === 'audit' && isAdmin"
      v-model:audit-user-filter="auditUserFilter"
      v-model:audit-entity-filter="auditEntityFilter"
      :audit-success-count="auditSuccessCount"
      :audit-fail-count="auditFailCount"
      :audit-logs="auditLogs"
      :login-audits="loginAudits"
      :login-audit-loading="loginAuditLoading"
      :login-audit-error="loginAuditError"
      :login-audit-page="loginAuditPage"
      :login-audit-total-pages="loginAuditTotalPages"
      :go-login-audit-page="goLoginAuditPage"
      :audit-user-options="auditUserOptions"
      :audit-loading="auditLoading"
      :audit-page="auditPage"
      :audit-total-pages="auditTotalPages"
      :query-audit="queryAudit"
      :go-audit-page="goAuditPage"
      :on-audit-entity-pick="onAuditEntityPick"
      :format-audit-time="formatAuditTime"
    />

    <SettingsAccessMemberModal
      :editing="editing"
      :role-options="roleOptions"
      :member-saving="memberSaving"
      @close="editing = null"
      @save="saveUser"
    />

    <ChangePasswordModal :open="showChangePassword" @close="showChangePassword = false" />
  </SettingsPageShell>
</template>

<script setup>
import { ref, toRef } from 'vue'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsHubSubnav from '@/views/settings/shared/layout/SettingsHubSubnav.vue'
import ChangePasswordModal from '@/views/settings/shared/ChangePasswordModal.vue'
import SettingsAccessSecuritySection from '@/views/settings/system/SettingsAccessSecuritySection.vue'
import SettingsAccessMembersSection from '@/views/settings/system/SettingsAccessMembersSection.vue'
import SettingsAccessGuestSection from '@/views/settings/system/SettingsAccessGuestSection.vue'
import SettingsAccessAuditSection from '@/views/settings/system/SettingsAccessAuditSection.vue'
import SettingsAccessMemberModal from '@/views/settings/system/SettingsAccessMemberModal.vue'
import { useRegisterSettingsTabPending } from '@/composables/settings/pending.internals'
import { useAccessPanel } from '@/composables/access/useAccessPanel'


/** 个人偏好草稿 dirty（由 SecuritySection 同步；切 subsection 后仍保留） */
const accessPrefsDirty = ref(false)

const props = defineProps({ activeTab: { type: String, default: 'access' } })

const {
  guestHourPresets,
  authStore,
  isAdmin,
  roleOptions,
  accessSection,
  showChangePassword,
  users,
  loading,
  membersLoadError,
  editing,
  memberSaving,
  memberRoleFilter,
  guestHours,
  guestRestrictionsStr,
  guestShareUrl,
  guestExpiresAt,
  guestGenerating,
  auditLogs,
  auditLoading,
  auditPage,
  auditTotalPages,
  auditEntityFilter,
  auditUserFilter,
  auditExporting,
  auditClearing,
  userPrefs,
  prefsSaving,
  presencePersonOptions,
  mfaEnabled,
  mfaQr,
  mfaConfirmCode,
  mfaDisableCode,
  loginAudits,
  loginAuditLoading,
  loginAuditError,
  loginAuditPage,
  loginAuditTotalPages,
  goLoginAuditPage,
  sessionExpireDays,
  lockoutMaxAttempts,
  lockoutMinutes,
  sessionRefreshHours,
  authSecuritySaving,
  authSecurityDirty,
  authSecurityPresetId,
  authSecuritySummary,
  loginAuditOkCount,
  loginAuditFailCount,
  recentLoginFail,
  applyAuthSecurityPreset,
  lockEnabled,
  pinLength,
  isWeakPin,
  adminCount,
  userInitials,
  securityScore,
  securityLevelLabel,
  securityLevelClass,
  sessionEyebrow,
  pinStrengthPercent,
  pinStrengthLabel,
  pinStrengthVariant,
  accessSubnavSections,
  memberRoleTabs,
  filteredUsers,
  auditSuccessCount,
  auditFailCount,
  auditUserOptions,
  onAuditEntityPick,
  roleMeta,
  userInitialsOf,
  guestPresetLabel,
  formatGuestExpiry,
  sanitizePin,
  startMfaSetup,
  confirmMfaSetup,
  disableMfa,
  saveAuthSecurityConfig,
  setTemperatureUnit,
  savePreferences,
  formatAuditTime,
  queryAudit,
  goAuditPage,
  clearAuditLogs,
  exportAuditCsv,
  toggleSettingsLock,
  createGuestLink,
  copyGuestUrl,
  openCreate,
  openEdit,
  saveUser,
  removeUser,
  UserPlus,
  Loader2,
  Trash2,
} = useAccessPanel(toRef(props, 'activeTab'))

useRegisterSettingsTabPending(
  'access',
  () => Boolean(authSecurityDirty.value) || accessPrefsDirty.value,
)
</script>
<style src="./styles/admin-hubs.css"></style>
