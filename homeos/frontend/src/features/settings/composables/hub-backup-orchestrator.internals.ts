/**
 * @file hub-backup-orchestrator.internals.ts
 * @module frontend/src/views
 */
/** composables：配置与档案备份 */
import { exportSystemConfig, importSystemConfig } from '@/services/api/system'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { reloadFrontendConfig } from '@/shared/utils/config/frontend-config'
import { downloadBlob } from '@/shared/utils/core/misc.util'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import type { NotifyType } from '@/shared/types/notify'
import { ref } from 'vue'

// ── useAppConfigBackup ──
/** AppConfig 备份③：导出 / 导入（与 SystemConfigPanel 共用 API） */
export function useAppConfigBackup(options: { notify?: boolean } = {}) {
  const { notify = true } = options
  const chrome = useChromeStore()
  const appConfigExporting = ref(false)
  const appConfigImporting = ref(false)

  function tip(message: string, type: NotifyType, duration?: number) {
    if (notify) chrome.notify(message, type, duration)
  }

  async function exportAppConfig() {
    appConfigExporting.value = true
    try {
      const { data } = await exportSystemConfig()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      downloadBlob(blob, `homeos-appconfig-${new Date().toISOString().slice(0, 10)}.json`)
      tip('系统参数已导出', 'success')
      return true
    } catch (e) {
      tip(getApiErrorMessage(e, '系统参数导出失败'), 'error')
      return false
    } finally {
      appConfigExporting.value = false
    }
  }

  async function importAppConfigFromText(raw: unknown) {
    const text = String(raw || '').trim()
    if (!text) {
      tip('请选择备份文件或粘贴 JSON', 'warning')
      return false
    }
    appConfigImporting.value = true
    try {
      const payload = JSON.parse(text)
      const config = payload.config || payload
      const replace = await chrome.confirm(
        '选择「确定」= 全量替换（需 confirm）；「取消」= 合并更新已有分区',
        '系统参数导入',
        { type: 'danger' },
      )
      const body = replace
        ? { config, schemaVersion: payload.schemaVersion, mode: 'replace', confirm: true }
        : { config, schemaVersion: payload.schemaVersion, mode: 'merge' }
      await importSystemConfig(body)
      await reloadFrontendConfig()
      tip(replace ? '系统参数已全量导入' : '系统参数已合并导入', 'success', 5000)
      return replace ? 'replace' : 'merge'
    } catch (e) {
      const errorMessage = getApiErrorMessage(e, '')
      tip(typeof errorMessage === 'string' ? errorMessage.slice(0, 120) : '系统参数导入失败', 'error')
      return false
    } finally {
      appConfigImporting.value = false
    }
  }

  return {
    appConfigExporting,
    appConfigImporting,
    exportAppConfig,
    importAppConfigFromText,
  }
}

// ── useProfileManagement ──
/** 显示方案管理：新建 / 切换 / 删除（备份与还原由统一的「备份与恢复」入口承载）。 */
export function useProfileManagement() {
  const authStore = useAuthStore()
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()

  const showCreateProfile = ref(false)
  const newProfileName = ref<string>('')

  async function switchToProfile(id: string) {
    if (!authStore.isAuthenticated) return
    const name = id === 'default' ? '默认系统方案' : id
    const confirmed = await chrome.confirm(
      `确定要切换到方案 "${name}" 吗？切换后页面可能需要重新加载。`,
      '切换显示方案',
    )
    if (confirmed) {
      try {
        await layoutStore.switchProfile(id)
        chrome.notify(`已成功加载方案: ${name}`, 'success')
      } catch (e) {
        chrome.notify(getApiErrorMessage(e, '切换方案失败'), 'error')
      }
    }
  }

  async function onDeleteProfile(id: string) {
    const name = id === 'default' ? '默认系统方案' : id
    const confirmed = await chrome.confirm(
      `确定要彻底删除方案 "${name}" 吗？此操作不可撤销！`,
      '危险操作',
      { type: 'danger' },
    )
    if (confirmed && authStore.isAuthenticated) {
      try {
        await layoutStore.deleteProfile(id)
        chrome.notify(`方案 ${name} 已被移除`, 'success')
      } catch (e) {
        chrome.notify(getApiErrorMessage(e, '删除方案失败'), 'error')
      }
    }
  }

  async function createNewProfile() {
    if (!newProfileName.value.trim()) {
      chrome.notify('请输入方案 ID', 'warning')
      return
    }
    if (authStore.isAuthenticated) {
      try {
        await layoutStore.createProfile(newProfileName.value.trim())
        newProfileName.value = ''
        showCreateProfile.value = false
      } catch (e) {
        chrome.notify(getApiErrorMessage(e, '创建方案失败'), 'error')
      }
    }
  }

  return {
    showCreateProfile,
    newProfileName,
    switchToProfile,
    onDeleteProfile,
    createNewProfile,
  }
}
