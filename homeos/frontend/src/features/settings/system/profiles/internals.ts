import { ref, computed, watch, onMounted, type Ref } from 'vue'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useProfileManagement } from '@/features/settings/shared/composables/hub-backup-orchestrator.internals'
import { useSettingsHubRouteSection } from '@/features/settings/shared/composables/hub-ui.internals'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { downloadBlob } from '@/shared/utils/core/misc.util'
import { navigateAfterRestore, resolvePostRestoreDestination } from '@/shared/utils/core/post-restore.util'
import {
  fetchServerBackupFiles,
  downloadServerBackupFile,
  deleteServerBackupFile,
  restoreServerBackupFile,
  createServerBackup,
  fetchAutoBackupStatus,
} from '@/services/api/system'
import { handleSystemConfigPatchError, patchSystemConfig } from '@/composables/config/system-config-core.internals'
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
import { copyTextWithNotify } from '@/services/notify'

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
  /** 是否已在服务端登记（本机尚未登记时列表里看不到自己） */
  registered?: boolean
}

function useProfilesServerBackups() {
  const chrome = useChromeStore()

  const backupRunNowLoading = ref(false)
  const backupFiles = ref<Array<{ name: string; size: number; mtime: string; path: string }>>([])
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
    const ok = await chrome.confirm(`确定删除服务器上的备份包「${name}」？此操作不可撤销。`, '删除备份包')
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
  /** 后台默认方案：后端任务（AI / 通知 / 安防事件 / 内嵌代理）读取的方案 */
  const serverDefaultProfile = ref('')
  /** 点保存时的上一次值，用于判断是否真的改过 */
  const savedServerDefaultProfile = ref('')
  const defaultsLoading = ref(false)
  const defaultsSaving = ref(false)

  const localBinding = computed<TerminalBindingRow>(() => {
    const fromServer = terminalBindings.value.find((binding) => binding.clientId === localClientId)
    if (fromServer) return { ...fromServer, registered: true }
    // 没登记时不能假装「已绑定」：这里显示的只是本机当前生效的方案，
    // 云端并不知道这台设备的存在，管理员也就无法给它换方案。
    return {
      clientId: localClientId,
      profileId: layoutStore.activeProfileId,
      label: localTerminalLabel,
      updatedAt: '',
      registered: false,
    }
  })

  function shortClientId(id: string) {
    const clientIdText = String(id || '')
    if (clientIdText.length <= 12) return clientIdText
    return `${clientIdText.slice(0, 8)}…${clientIdText.slice(-4)}`
  }

  /**
   * 复制本机完整终端 ID。
   *
   * 终端身份存在浏览器 localStorage 里（按 origin 隔离），换地址 / 清缓存都会变成新终端；
   * 复制出来后在设备访问地址上带 ``?terminal=<ID>`` 打开即可把身份钉死。
   */
  async function copyLocalClientId() {
    if (!localClientId) return
    await copyTextWithNotify(localClientId, {
      successMessage: '终端 ID 已复制：在设备访问地址后加 ?terminal=<ID> 可固定身份',
      emptyMessage: '读取终端 ID 失败',
    })
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
      if (payload?.newTerminalDefault === 'default' || payload?.newTerminalDefault === 'activeProfile') {
        newTerminalDefault.value = payload.newTerminalDefault
      }
      const active = String(payload?.activeProfileId || '').trim()
      serverDefaultProfile.value = active || 'default'
      savedServerDefaultProfile.value = serverDefaultProfile.value
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

  /**
   * 保存后台默认方案。
   *
   * 只在用户显式操作时写入：这个值决定服务端后台任务读哪份 layout，
   * 若跟着「本终端切换」自动改，多设备下会互相抢。
   */
  async function saveServerDefaultProfile() {
    const next = String(serverDefaultProfile.value || '').trim()
    if (!next || next === savedServerDefaultProfile.value) return
    defaultsSaving.value = true
    try {
      const ok = await layoutStore.setServerDefaultProfile(next)
      if (ok) savedServerDefaultProfile.value = next
      else serverDefaultProfile.value = savedServerDefaultProfile.value
    } finally {
      defaultsSaving.value = false
    }
  }

  async function bindCurrentTerminal() {
    bindingActionLoading.value = true
    try {
      const ok = await bindSelfTerminalProfile(layoutStore.activeProfileId, localTerminalLabel)
      if (!ok) {
        chrome.notify('绑定失败，请检查网络或后端服务', 'error')
        return
      }
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
      chrome.notify(
        clientId === localClientId ? '已解除本机绑定：本机继续使用当前方案，但云端不再管理这台设备' : '终端绑定已解除',
        'success',
      )
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
      // 改的是本机：绑定虽然是云端权威，但没必要让用户再刷新一次页面才看到变化
      if (clientId === localClientId && next !== layoutStore.activeProfileId) {
        await layoutStore.switchProfile(next, true)
      }
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
    copyLocalClientId,
    terminalBindings,
    localBinding,
    bindingsLoading,
    bindingsError,
    bindingActionLoading,
    newTerminalDefault,
    serverDefaultProfile,
    savedServerDefaultProfile,
    defaultsLoading,
    defaultsSaving,
    fetchTerminalBindings,
    fetchProfileDefaults,
    saveNewTerminalDefault,
    saveServerDefaultProfile,
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

  /**
   * 删除方案后刷新终端绑定：后端会顺带清理指向该方案的绑定，
   * 不重新拉取的话列表里会残留一个「指向已删方案」的终端。
   */
  async function deleteProfileAndRefreshBindings(id: string) {
    const deleted = await profile.onDeleteProfile(id)
    if (deleted) await terminal.fetchTerminalBindings()
    return deleted
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
    // 覆盖 ...profile 里的同名实现：删除方案后要顺带刷新「已注册终端」列表
    onDeleteProfile: deleteProfileAndRefreshBindings,
  }
}
