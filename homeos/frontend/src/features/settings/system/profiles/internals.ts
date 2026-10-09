/**
 * 文件：internals.ts
 * 职责：档案面板 internals。聚合档案/备份/导入/服务端备份文件管理逻辑，提供 useProfilesPanel 入口。
 *       包含布局备份导出/导入、应用配置备份、服务端备份文件 CRUD 与自动备份状态。
 * 关键依赖：
 *   - vue 的 ref / computed / watch / onMounted / Ref
 *   - useAuthStore / useChromeStore / useLayoutStore：账户/通知/布局状态
 *   - useProfileBackup / refreshAfterBundleRestore：备份导出/导入与恢复
 *   - useSettingsHubRouteSection：子导航路由同步
 *   - fetchServerBackupFiles / createServerBackup / restoreServerBackupFile 等：服务端备份 API
 */
import { ref, computed, watch, onMounted, type Ref } from 'vue'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import {
  useProfileBackup,
  refreshAfterBundleRestore,
} from '@/features/settings/composables/hub-backup-orchestrator.internals'
import { useSettingsHubRouteSection } from '@/features/settings/composables/hub-ui.internals'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { downloadBlob } from '@/utils/core/misc.util'
import {
  fetchServerBackupFiles,
  downloadServerBackupFile,
  importServerBackupFile,
  deleteServerBackupFile,
  restoreServerBackupFile,
  createServerBackup,
  fetchAutoBackupStatus,
} from '@/services/api/system'
import {
  handleSystemConfigPatchError,
  patchSystemConfig,
} from '@/composables/config/system-config-core.internals'
import { formatAuditTime, formatFullDateTime } from '@/utils/format/locale-format.util'
import {
  deleteTerminalBinding,
  fetchActiveProject,
  fetchTerminalBindings as fetchTerminalBindingsApi,
  updateProjectDefaults,
  upsertTerminalBinding,
} from '@/services/api/config'
import { getClientDeviceId } from '@/utils/client/system.util'
import { inferTerminalLabel } from '@/utils/client/infer-terminal-label.util'
import { bindSelfTerminalProfile } from '@/utils/config/resolve-active-profile.util'

function profileLabel(projectId: string) {
  return projectId === 'default' ? '默认系统方案' : projectId
}

function formatLastSaved(updatedAt: string | null | undefined) {
  if (!updatedAt) return '尚未保存'
  try {
    const t = new Date(updatedAt)
    if (Number.isNaN(t.getTime())) return '时间未知'
    return '上次保存: {time}'.replace('{time}', formatFullDateTime(t))
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
  const authStore = useAuthStore()
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const isAdmin = computed(() => authStore.role === 'admin')

  const backupRunNowLoading = ref(false)
  const backupFiles = ref<
    Array<{ name: string; size: number; mtime: string; path: string }>
  >([])
  const backupFilesLoading = ref(false)
  const backupFileActionName = ref('')
  const backupFileActionKind = ref<'restore' | 'export' | 'delete' | ''>('')
  const backupImportLoading = ref(false)

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
    if (!isAdmin.value) return
    autoBackupLoading.value = true
    try {
      const { data } = await fetchAutoBackupStatus()
      const s = data?.data ?? data
      if (s && typeof s === 'object') {
        autoBackup.value = {
          enabled: s.enabled !== false,
          retainDays: Number.isFinite(s.retainDays) ? s.retainDays : 7,
          lastRunAt: s.lastRunAt ?? null,
          lastError: s.lastError ?? null,
          nextRunAt: s.nextRunAt ?? '',
        }
      }
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '加载自动备份状态失败'), 'error')
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
    } catch (e) {
      if (await handleSystemConfigPatchError(e, chrome)) {
        await loadAutoBackupStatus()
        return
      }
      chrome.notify(getApiErrorMessage(e, '保存自动备份设置失败'), 'error')
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
    if (!isAdmin.value) return
    backupFilesLoading.value = true
    try {
      const { data } = await fetchServerBackupFiles()
      const list = data?.data ?? data
      backupFiles.value = Array.isArray(list) ? list : []
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '加载备份文件列表失败'), 'error')
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
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '立即备份失败'), 'error')
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
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '删除失败'), 'error')
    } finally {
      backupFileActionName.value = ''
      backupFileActionKind.value = ''
    }
  }

  async function restoreBackupFile(name: string) {
    const ok = await chrome.confirm(
      `确定从「${name}」还原完整备份包？将覆盖当前 UI 布局与系统参数（默认不含用户账号）。建议先另存一份当前备份。`,
      '从服务器还原',
      { confirmText: '确认还原', type: 'danger' },
    )
    if (!ok) return
    backupFileActionName.value = name
    backupFileActionKind.value = 'restore'
    try {
      const { data } = await restoreServerBackupFile({
        name,
        confirm: true,
        appConfigMode: 'replace',
      })
      const sections = data?.sections ?? data?.data?.sections ?? []
      // 与客户端整包导入一致：还原后即时重载前端配置与方案，避免界面残留旧状态
      await refreshAfterBundleRestore(layoutStore, sections)
      await loadBackupFiles()
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '还原失败'), 'error')
    } finally {
      backupFileActionName.value = ''
      backupFileActionKind.value = ''
    }
  }

  async function exportBackupFile(name: string) {
    backupFileActionName.value = name
    backupFileActionKind.value = 'export'
    try {
      const { data } = await downloadServerBackupFile(name)
      const payload = data?.data ?? data
      const bundle = payload?.bundle ?? payload
      const filename =
        typeof payload?.name === 'string' && payload.name ? payload.name : name
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: 'application/json',
      })
      downloadBlob(blob, filename)
      chrome.notify('备份包已导出到本地', 'success')
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '导出失败'), 'error')
    } finally {
      backupFileActionName.value = ''
      backupFileActionKind.value = ''
    }
  }

  async function importBackupFromLocalFile(file: File | null | undefined) {
    if (!file) return
    backupImportLoading.value = true
    try {
      const text = await file.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        chrome.notify('无效的备份包 JSON', 'error')
        return
      }
      const { data } = await importServerBackupFile({
        bundle: parsed,
        name: file.name,
      })
      const saved = data?.data?.name ?? data?.name
      chrome.notify(
        saved ? `本地备份包已导入服务器：${saved}` : '本地备份包已导入服务器',
        'success',
        5000,
      )
      await loadBackupFiles()
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '本地导入失败'), 'error')
    } finally {
      backupImportLoading.value = false
    }
  }

  function pickLocalBackupFile() {
    if (backupImportLoading.value) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      void importBackupFromLocalFile(file)
    }
    input.click()
  }

  return {
    backupRunNowLoading,
    backupFiles,
    backupFilesLoading,
    backupFileActionName,
    backupFileActionKind,
    backupImportLoading,
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
    pickLocalBackupFile,
  }
}

function useProfilesTerminalBindings() {
  const authStore = useAuthStore()
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const isAdmin = computed(() => authStore.role === 'admin')

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
    const fromServer = terminalBindings.value.find((b) => b.clientId === localClientId)
    if (fromServer) return fromServer
    return {
      clientId: localClientId,
      profileId: layoutStore.activeProfileId,
      label: localTerminalLabel,
      updatedAt: '',
    }
  })

  function shortClientId(id: string) {
    const s = String(id || '')
    if (s.length <= 12) return s
    return `${s.slice(0, 8)}…${s.slice(-4)}`
  }

  async function fetchTerminalBindings() {
    if (!isAdmin.value) return
    bindingsLoading.value = true
    bindingsError.value = ''
    try {
      const { data } = await fetchTerminalBindingsApi()
      terminalBindings.value = data?.data ?? data ?? []
    } catch (e) {
      bindingsError.value = getApiErrorMessage(e, '加载终端绑定失败')
      chrome.notify(bindingsError.value, 'error')
      terminalBindings.value = []
    } finally {
      bindingsLoading.value = false
    }
  }

  async function fetchProfileDefaults() {
    if (!isAdmin.value) return
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
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '加载新终端默认策略失败'), 'error')
    } finally {
      defaultsLoading.value = false
    }
  }

  async function saveNewTerminalDefault() {
    defaultsSaving.value = true
    try {
      await updateProjectDefaults({ newTerminalDefault: newTerminalDefault.value })
      chrome.notify('新终端默认策略已保存', 'success')
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '保存失败'), 'error')
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
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '绑定失败'), 'error')
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
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '解除绑定失败'), 'error')
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
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '更新终端绑定失败'), 'error')
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
    isAdmin,
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
  const isAdmin = computed(() => authStore.role === 'admin')
  const profilesSection = ref('profiles')

  const profilesSubnavSections = computed(() => {
    const sections = [
      {
        id: 'profiles',
        label: '显示方案',
        emoji: '🖥️',
        badge: layoutStore.availableProfiles?.length || '',
      },
      { id: 'backup', label: '备份与还原', emoji: '💾' },
    ]
    return sections
  })

  useSettingsHubRouteSection(profilesSection, profilesSubnavSections, {
    tabId: 'profiles',
    activeTab: () => activeTab.value,
  })

  const backup = useProfileBackup()
  const serverBackups = useProfilesServerBackups()
  const terminal = useProfilesTerminalBindings()

  const importBackupType = ref('ui')

  function openImport(type: string) {
    importBackupType.value = type
    backup.showImport.value = true
  }

  async function switchToProfile(id: string) {
    await backup.switchToProfile(id)
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
        backup.fetchBackupSummaries()
        if (isAdmin.value) {
          serverBackups.loadBackupFiles()
          serverBackups.loadAutoBackupStatus()
        }
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
    importBackupType,
    openImport,
    ...backup,
    ...serverBackups,
    ...terminal,
    isAdmin,
    switchToProfile,
  }
}
