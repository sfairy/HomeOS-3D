import { ref, computed, watch, onMounted, type Ref } from 'vue'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useProfileManagement } from '@/features/settings/shared/composables/hub-backup-orchestrator.internals'
import { useSettingsHubRouteSection } from '@/features/settings/shared/composables/hub-ui.internals'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { downloadBlob } from '@/shared/utils/core/misc.util'
import {
  navigateAfterRestore,
  resolvePostRestoreDestination,
} from '@/shared/utils/core/post-restore.util'
import {
  fetchServerBackupFiles,
  downloadServerBackupFile,
  deleteServerBackupFile,
  restoreServerBackupFile,
  createServerBackup,
  fetchAutoBackupStatus,
} from '@/services/api/system'
import {
  handleSystemConfigPatchError,
  patchSystemConfig,
} from '@/composables/config/system-config-core.internals'
import { formatAuditTime, formatFullDateTime } from '@/shared/utils/format/locale-format.util'
import {
  deleteTerminalBinding,
  fetchActiveProject,
  fetchTerminalBindings as fetchTerminalBindingsApi,
  updateProjectDefaults,
  upsertTerminalBinding,
} from '@/services/api/config'
import { getClientDeviceId } from '@/shared/client/utils/system.util'
import { inferTerminalLabel } from '@/shared/client/utils/infer-terminal-label.util'
import { bindSelfTerminalProfile } from '@/composables/config/resolve-active-profile.util'

function profileLabel(projectId: string) {
  return projectId === 'default' ? '默认系统方案' : projectId
}

function formatLastSaved(updatedAt: string | null | undefined) {
  if (!updatedAt) return '尚未保存'
  try {
    const updatedDate = new Date(updatedAt)
    if (Number.isNaN(updatedDate.getTime())) return '时间未知'
    return '上次保存: {time}'.replace('{time}', formatFullDateTime(updatedDate))
  } catch {
    return '时间未知'
  }
}

type TerminalBindingRow = {
  clientId: string
  profileId: string
  label?: string
  updatedAt: string
}

function useProfilesServerBackups() {
  const chrome = useChromeStore()

  const backupRunNowLoading = ref(false)
  const backupFiles = ref<
    Array<{ name: string; size: number; mtime: string; path: string }>
  >([])
  const backupFilesLoading = ref(false)
  const backupFileActionName = ref('')
  const backupFileActionKind = ref<'restore' | 'export' | 'delete' | ''>('')

  const autoBackup = ref<{
    enabled: boolean
    retainDays: number
    lastRunAt: string | null
    lastError: string | null
    nextRunAt: string
  }>({ enabled: true, retainDays: 7, lastRunAt: null, lastError: null, nextRunAt: '' })
  const autoBackupLoading = ref(false)
  const autoBackupSaving = ref(false)

  async function loadAutoBackupStatus() {
    autoBackupLoading.value = true
    try {
      const { data } = await fetchAutoBackupStatus()
      const statusData = data?.data ?? data
      if (statusData && typeof statusData === 'object') {
        autoBackup.value = {
          enabled: statusData.enabled !== false,
          retainDays: Number.isFinite(statusData.retainDays) ? statusData.retainDays : 7,
          lastRunAt: statusData.lastRunAt ?? null,
          lastError: statusData.lastError ?? null,
          nextRunAt: statusData.nextRunAt ?? '',
        }
      }
    } catch (error) {
      chrome.notify(getApiErrorMessage(error, '加载自动备份状态失败'), 'error')
    } finally {
      autoBackupLoading.value = false
    }
  }

  async function saveAutoBackup(patch: { enabled?: boolean; retainDays?: number }) {
    autoBackupSaving.value = true
    try {
      const ops: { autoBackupEnabled?: boolean; autoBackupRetainDays?: number } = {}
      if (patch.enabled !== undefined) ops.autoBackupEnabled = patch.enabled
      if (patch.retainDays !== undefined) ops.autoBackupRetainDays = patch.retainDays
      await patchSystemConfig({ ops })
      await loadAutoBackupStatus()
      chrome.notify('自动备份设置已保存', 'success')
    } catch (error) {
      if (await handleSystemConfigPatchError(error, chrome)) {
        await loadAutoBackupStatus()
        return
      }
      chrome.notify(getApiErrorMessage(error, '保存自动备份设置失败'), 'error')
    } finally {
      autoBackupSaving.value = false
    }
  }

  function toggleAutoBackup() {
    if (autoBackupSaving.value) return
    void saveAutoBackup({ enabled: !autoBackup.value.enabled })
  }

  function setAutoBackupRetainDays(days: number) {
    if (autoBackupSaving.value || days === autoBackup.value.retainDays) return
    void saveAutoBackup({ retainDays: days })
  }

  function formatBackupTime(iso: string) {
    if (!iso) return '—'
    return formatAuditTime(iso)
  }

  function formatBackupSize(bytes: number) {
    if (!bytes || bytes < 0) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  async function loadBackupFiles() {
    backupFilesLoading.value = true
    try {
      const { data } = await fetchServerBackupFiles()
      const list = data?.data ?? data
      backupFiles.value = Array.isArray(list) ? list : []
    } catch (error) {
      chrome.notify(getApiErrorMessage(error, '加载备份文件列表失败'), 'error')
      backupFiles.value = []
    } finally {
      backupFilesLoading.value = false
    }
  }

  async function runBackupNow() {
    backupRunNowLoading.value = true
    try {
      const { data } = await createServerBackup()
      const name = data?.name ?? data?.data?.name
      chrome.notify(name ? `备份包已写入 ${name}` : '备份包已写入服务器', 'success', 5000)
      await loadBackupFiles()
    } catch (error) {
      chrome.notify(getApiErrorMessage(error, '立即备份失败'), 'error')
    } finally {
      backupRunNowLoading.value = false
    }
  }

  async function deleteBackupFile(name: string) {
    const ok = await chrome.confirm(
      `确定删除服务器上的备份包「${name}」？此操作不可撤销。`,
      '删除备份包',
    )
    if (!ok) return
    backupFileActionName.value = name
    backupFileActionKind.value = 'delete'
    try {
      await deleteServerBackupFile(name)
      chrome.notify('备份包已删除', 'success')
      await loadBackupFiles()
    } catch (error) {
      chrome.notify(getApiErrorMessage(error, '删除失败'), 'error')
    } finally {
      backupFileActionName.value = ''
      backupFileActionKind.value = ''
    }
  }

  async function restoreBackupFile(name: string, adminPassword: string) {
    const ok = await chrome.confirm(
      `确定从「${name}」还原全量备份？将用备份中的数据库、账号、授权与素材整体覆盖当前数据，无法撤销。建议先另存一份当前备份。还原后需要重新登录；换机还原还需在本机重新激活授权。`,
      '全量还原',
      { confirmText: '确认还原', type: 'danger' },
    )
    if (!ok) return
    backupFileActionName.value = name
    backupFileActionKind.value = 'restore'
    try {
      await restoreServerBackupFile({ name, confirm: true, adminPassword })
      // 整库（含会话与授权绑定）已被替换：原地刷新会撞上授权门禁的 JSON 401，
      // 由 post-restore 统一送去登录 / 激活引导页。
      const destination = await resolvePostRestoreDestination()
      chrome.notify(destination.message, 'success', 5000)
      navigateAfterRestore(destination)
    } catch (error) {
      chrome.notify(getApiErrorMessage(error, '还原失败'), 'error')
      backupFileActionName.value = ''
      backupFileActionKind.value = ''
    }
  }

  async function exportBackupFile(name: string) {
    backupFileActionName.value = name
    backupFileActionKind.value = 'export'
    try {
      const { data } = await downloadServerBackupFile(name)
      const blob = data instanceof Blob ? data : new Blob([data as BlobPart])
      downloadBlob(blob, name)
      chrome.notify('备份包已下载到本地', 'success')
    } catch (error) {
      chrome.notify(getApiErrorMessage(error, '下载失败'), 'error')
    } finally {
      backupFileActionName.value = ''
      backupFileActionKind.value = ''
    }
  }

  return {
    backupRunNowLoading,
    backupFiles,
    backupFilesLoading,
    backupFileActionName,
    backupFileActionKind,
    autoBackup,
    autoBackupLoading,
    autoBackupSaving,
    loadAutoBackupStatus,
    toggleAutoBackup,
    setAutoBackupRetainDays,
    formatBackupTime,
    formatBackupSize,
    loadBackupFiles,
    runBackupNow,
    deleteBackupFile,
    restoreBackupFile,
    exportBackupFile,
  }
}

function useProfilesTerminalBindings() {
  const authStore = useAuthStore()
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()

  const localClientId = getClientDeviceId()
  const localTerminalLabel = inferTerminalLabel()

  const terminalBindings = ref<TerminalBindingRow[]>([])
  const bindingsLoading = ref(false)
  const bindingsError = ref('')
  const bindingActionLoading = ref(false)
  const newTerminalDefault = ref<'activeProfile' | 'default'>('activeProfile')
  const defaultsLoading = ref(false)
  const defaultsSaving = ref(false)

  const localBinding = computed(() => {
    const fromServer = terminalBindings.value.find((binding) => binding.clientId === localClientId)
    if (fromServer) return fromServer
    return {
      clientId: localClientId,
      profileId: layoutStore.activeProfileId,
      label: localTerminalLabel,
      updatedAt: '',
    }
  })

  function shortClientId(id: string) {
    const clientIdText = String(id || '')
    if (clientIdText.length <= 12) return clientIdText
    return `${clientIdText.slice(0, 8)}…${clientIdText.slice(-4)}`
  }

  async function fetchTerminalBindings() {
    bindingsLoading.value = true
    bindingsError.value = ''
    try {
      const { data } = await fetchTerminalBindingsApi()
      terminalBindings.value = data?.data ?? data ?? []
    } catch (error) {
      bindingsError.value = getApiErrorMessage(error, '加载终端绑定失败')
      chrome.notify(bindingsError.value, 'error')
      terminalBindings.value = []
    } finally {
      bindingsLoading.value = false
    }
  }

  async function fetchProfileDefaults() {
    defaultsLoading.value = true
    try {
      const { data } = await fetchActiveProject()
      const payload = data?.data ?? data
      if (
        payload?.newTerminalDefault === 'default' ||
        payload?.newTerminalDefault === 'activeProfile'
      ) {
        newTerminalDefault.value = payload.newTerminalDefault
      }
    } catch (error) {
      chrome.notify(getApiErrorMessage(error, '加载新终端默认策略失败'), 'error')
    } finally {
      defaultsLoading.value = false
    }
  }

  async function saveNewTerminalDefault() {
    defaultsSaving.value = true
    try {
      await updateProjectDefaults({ newTerminalDefault: newTerminalDefault.value })
      chrome.notify('新终端默认策略已保存', 'success')
    } catch (error) {
      chrome.notify(getApiErrorMessage(error, '保存失败'), 'error')
    } finally {
      defaultsSaving.value = false
    }
  }

  async function bindCurrentTerminal() {
    bindingActionLoading.value = true
    try {
      await bindSelfTerminalProfile(layoutStore.activeProfileId, localTerminalLabel)
      chrome.notify('本终端已绑定到当前方案', 'success')
      await fetchTerminalBindings()
    } catch (error) {
      chrome.notify(getApiErrorMessage(error, '绑定失败'), 'error')
    } finally {
      bindingActionLoading.value = false
    }
  }

  async function removeTerminalBinding(clientId: string) {
    bindingActionLoading.value = true
    try {
      await deleteTerminalBinding(clientId)
      chrome.notify('终端绑定已解除', 'success')
      await fetchTerminalBindings()
    } catch (error) {
      chrome.notify(getApiErrorMessage(error, '解除绑定失败'), 'error')
    } finally {
      bindingActionLoading.value = false
    }
  }

  async function updateTerminalBindingProfile(clientId: string, profileId: string, label?: string) {
    const next = String(profileId || '').trim()
    if (!next) return
    bindingActionLoading.value = true
    try {
      await upsertTerminalBinding({
        clientId,
        profileId: next,
        label: label || undefined,
      })
      chrome.notify('终端方案已更新', 'success')
      await fetchTerminalBindings()
    } catch (error) {
      chrome.notify(getApiErrorMessage(error, '更新终端绑定失败'), 'error')
    } finally {
      bindingActionLoading.value = false
    }
  }

  onMounted(() => {
    if (authStore.isAuthenticated) {
      void fetchProfileDefaults()
      void fetchTerminalBindings()
    }
  })

  return {
    localClientId,
    localTerminalLabel,
    shortClientId,
    terminalBindings,
    localBinding,
    bindingsLoading,
    bindingsError,
    bindingActionLoading,
    newTerminalDefault,
    defaultsLoading,
    defaultsSaving,
    fetchTerminalBindings,
    fetchProfileDefaults,
    saveNewTerminalDefault,
    bindCurrentTerminal,
    removeTerminalBinding,
    updateTerminalBindingProfile,
  }
}

export function useProfilesPanel(activeTab: Ref<string>) {
  const authStore = useAuthStore()
  const layoutStore = useLayoutStore()
  const profilesSection = ref('profiles')

  const profilesSubnavSections = computed(() => {
    const sections = [
      {
        id: 'profiles',
        label: '显示方案',
        emoji: '🖥️',
        badge: layoutStore.availableProfiles?.length || '',
      },
      { id: 'backup', label: '备份与恢复', emoji: '💾' },
    ]
    return sections
  })

  useSettingsHubRouteSection(profilesSection, profilesSubnavSections, {
    tabId: 'profiles',
    activeTab: () => activeTab.value,
  })

  const profile = useProfileManagement()
  const serverBackups = useProfilesServerBackups()
  const terminal = useProfilesTerminalBindings()

  async function switchToProfile(id: string) {
    await profile.switchToProfile(id)
    await terminal.fetchTerminalBindings()
  }

  watch(
    activeTab,
    (tab) => {
      if (tab === 'profiles' && authStore.isAuthenticated && !layoutStore.availableProfiles?.length) {
        layoutStore.fetchProfiles()
      }
      if (tab === 'profiles' && authStore.isAuthenticated) {
        terminal.fetchTerminalBindings()
        terminal.fetchProfileDefaults()
      }
    },
    { immediate: true },
  )

  watch(
    profilesSection,
    (section) => {
      if (!authStore.isAuthenticated) return
      if (section === 'backup') {
        serverBackups.loadBackupFiles()
        serverBackups.loadAutoBackupStatus()
      }
    },
    { immediate: true },
  )

  return {
    profilesSection,
    profilesSubnavSections,
    authStore,
    layoutStore,
    profileLabel,
    formatLastSaved,
    ...profile,
    ...serverBackups,
    ...terminal,
    switchToProfile,
  }
}
