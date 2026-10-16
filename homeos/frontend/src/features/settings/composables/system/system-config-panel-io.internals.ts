/**
 * @file system-config-panel-io.internals.ts
 * @module frontend/src/views
 */
/** 高级参数：重载 / 导入导出 / 保存 / 恢复默认 */
import { applyEditableSnapshotToSections, fromEditableSectionsPending } from '@/composables/config/system-config-edit.util'
import {
  fetchSystemConfigFresh,
  handleSystemConfigPatchError,
} from '@/composables/config/system-config-core.internals'
import type { useSystemConfig } from '@/composables/config/system-config-core.internals'
import type { useChromeStore } from '@/stores/chrome.store'
import { resetSystemConfig } from '@/services/api/system'
import { reloadFrontendConfig } from '@/shared/utils/config/frontend-config'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { logger } from '@/shared/utils/core/logger'
import type { EditableConfigSection } from '@/shared/types/system-config-editor'
import { ref, type Ref } from 'vue'

type ConfigValidationError = { section: string; key: string; message?: string }
type ChromeStore = ReturnType<typeof useChromeStore>
type SystemConfigPatchSave = ReturnType<typeof useSystemConfig>['save']

export function useSystemConfigPanelIo(opts: {
  chrome: ChromeStore
  runSave: (fn: () => unknown, hooks?: { onError?: (e: unknown) => unknown }) => Promise<unknown>
  load: (opts?: { force?: boolean }) => Promise<void>
  getLoaded: () => boolean
  setLoaded: (v: boolean) => void
  invalidateSystemConfig: () => void
  saveSystemConfig: SystemConfigPatchSave
  loadAudit: (fallback: unknown) => Promise<void>
  captureSnapshot: () => void
  sectionLabel: (key: string) => string
  sectionList: Ref<EditableConfigSection[]>
  pendingChanges: Ref<number>
  pendingFieldKeys: Ref<Set<string>> | { value: Set<string> }
  validationErrors: Ref<ConfigValidationError[]>
  savedTip: Ref<string>
  savedTipOk: Ref<boolean>
  loadError: Ref<string>
  savedSnapshot: Ref<string | null>
  exportAppConfig: () => Promise<boolean>
  importAppConfigFromText: (text: string) => Promise<'replace' | 'merge' | false | null | undefined>
}) {
  const {
    chrome,
    runSave,
    load,
    getLoaded,
    setLoaded,
    invalidateSystemConfig,
    saveSystemConfig,
    loadAudit,
    captureSnapshot,
    sectionLabel,
    sectionList,
    pendingChanges,
    pendingFieldKeys,
    validationErrors,
    savedTip,
    savedTipOk,
    loadError,
    savedSnapshot,
    exportAppConfig,
    importAppConfigFromText,
  } = opts
  const configConflict = ref(false)

  async function reload() {
    setLoaded(false)
    configConflict.value = false
    loadError.value = ''
    invalidateSystemConfig()
    await load({ force: true })
  }

  function ensureLoaded(activeTab: string) {
    if (activeTab === 'params' && !getLoaded()) return load()
    return undefined
  }

  async function exportConfig() {
    savedTip.value = ''
    const ok = await exportAppConfig()
    savedTipOk.value = ok
    savedTip.value = ok ? '已导出' : '导出失败'
    if (savedTip.value)
      setTimeout(() => {
        savedTip.value = ''
      }, 2800)
  }

  async function onImportFileFromBar(file: File | null | undefined) {
    if (!file) return
    savedTip.value = ''
    try {
      const mode = await importAppConfigFromText(await file.text())
      if (mode) {
        await reload()
        savedTipOk.value = true
        savedTip.value = mode === 'replace' ? '已全量导入' : '已合并导入'
        setTimeout(() => {
          savedTip.value = ''
        }, 2800)
      } else {
        savedTipOk.value = false
        savedTip.value = '导入失败'
      }
    } catch (e) {
      logger.error('导入系统参数失败', e)
      savedTipOk.value = false
      savedTip.value = '导入失败'
    }
  }

  async function save() {
    savedTip.value = ''
    validationErrors.value = []
    configConflict.value = false
    await runSave(
      async () => {
        const pending = pendingFieldKeys.value
        let patch
        try {
          patch = fromEditableSectionsPending(sectionList.value, pending)
        } catch (e) {
          const msg = String((e as { message?: string })?.message || '')
          const match = /^([\w]+)\.([\w]+)\s+JSON/.exec(msg)
          if (match) {
            validationErrors.value = [
              { section: match[1], key: match[2], message: 'JSON 格式无效' },
            ]
            savedTipOk.value = false
            savedTip.value = 'JSON 格式无效'
            return
          }
          throw e
        }
        await fetchSystemConfigFresh()
        const data = await saveSystemConfig(patch)
        captureSnapshot()
        await loadAudit(data?._configAudit)
        await reloadFrontendConfig()
        savedTipOk.value = true
        savedTip.value = '已保存'
        setTimeout(() => {
          savedTip.value = ''
        }, 2800)
      },
      {
        onError: async (e) => {
          logger.error('保存系统参数失败', e)
          savedTipOk.value = false
          const err = e as {
            message?: string
            response?: { status?: number; data?: { fieldErrors?: ConfigValidationError[] } }
          }
          const fe = err?.response?.data?.fieldErrors
          if (Array.isArray(fe) && fe.length) {
            validationErrors.value = fe
            savedTip.value = '校验失败，请查看下方错误列表'
          } else if (err?.response?.status === 409) {
            const handled = await handleSystemConfigPatchError(e, chrome)
            configConflict.value = !handled
            savedTip.value = handled
              ? '配置已被其他终端修改，已重新加载'
              : getApiErrorMessage(e, '配置已被他人修改，请刷新后重试')
            if (handled) await load({ force: true })
          } else {
            savedTip.value = err?.message?.includes('JSON')
              ? err.message
              : getApiErrorMessage(e, '保存失败')
          }
        },
      },
    )
  }

  async function onResetSection(key: string) {
    const label = sectionLabel(key)
    const ok = await chrome.confirm(`确定将「${label}」恢复为默认值？`, '恢复默认')
    if (!ok) return
    try {
      await resetSystemConfig(key)
      await reload()
      await reloadFrontendConfig()
      chrome.notify(`「${label}」已恢复默认`, 'success')
    } catch (e) {
      logger.error('恢复分区默认失败', e)
      chrome.notify(getApiErrorMessage(e, '恢复默认失败'), 'error')
    }
  }

  async function onResetAll() {
    const ok = await chrome.confirm('确定将全部运行参数恢复为默认值？此操作不可撤销。', '恢复默认')
    if (!ok) return
    try {
      await resetSystemConfig()
      await reload()
      await reloadFrontendConfig()
      chrome.notify('全部运行参数已恢复默认', 'success')
    } catch (e) {
      logger.error('恢复全部默认失败', e)
      chrome.notify(getApiErrorMessage(e, '恢复默认失败'), 'error')
    }
  }

  async function cancelChanges() {
    if (pendingChanges.value === 0) return
    const ok = await chrome.confirm('确定放弃未保存的更改？此操作不可撤销。', '放弃更改', {
      type: 'danger',
      confirmText: '放弃更改',
      cancelText: '继续编辑',
    })
    if (!ok) return
    if (!applyEditableSnapshotToSections(sectionList.value, savedSnapshot.value)) return
    validationErrors.value = []
    chrome.notify('已取消修改', 'info')
  }

  return {
    configConflict,
    reload,
    ensureLoaded,
    exportConfig,
    onImportFileFromBar,
    save,
    onResetSection,
    onResetAll,
    cancelChanges,
  }
}
