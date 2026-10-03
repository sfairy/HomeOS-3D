/**
 * @file useTemplateEntityOperations.ts
 * @module composables/orchestrator
 * @description 模板实体 builder 的同步 / 漂移修复 / 导入 / 删除操作 composable
 *（从 useTemplateEntityBuilderCore 拆分出来的纯操作模块）。
 *
 * 职责：
 * - doSync / doSyncAll：单项 / 批量推送本地 YAML 到 HA（含占位校验）；
 * - doRepair / doRepairPull / doRepairAll：单项漂移修复（push / pull）与批量修复；
 * - doPullAll：从 HA 拉回全部配置覆盖本地；
 * - openPasteYaml / submitPasteYaml：粘贴 YAML 创建模板实体；
 * - applyStoredYamlToDb：把编辑区 YAML 直接写入数据库（绕过画布）；
 * - doReimport / doImport：从 HA 重新导入 / 导入单个配置；
 * - confirmHaDelete / delConfirm / closeDeleteConfirm / executeDelete：本地 / HA 删除流程。
 *
 * 依赖：
 * - vue（ComputedRef、Ref）
 * - @/services/api（apiGet、apiPut）
 * - @/services/api/orchestrator（deleteTemplateEntity、importTemplateEntityYaml、updateTemplateEntity）
 * - @/composables/orchestrator/useBuilderUtils（flashBuilderResult）
 * - @/utils/template/*（entity-context、yaml-parser、trigger-sensor、template-yaml-import）
 * - @/utils/core/error-message、logger
 * - @/stores/chrome.store、entities.store（类型）
 * - @/types/orchestrator-builder（OrchestratorSavedItem、SubmitPasteYamlOptions）
 */
import { type ComputedRef, type Ref } from 'vue'
import { apiGet, apiPut } from '@/services/api'
import {
  deleteTemplateEntity,
  importTemplateEntityYaml,
  updateTemplateEntity,
} from '@/services/api/orchestrator'
import { flashBuilderResult } from '@/composables/orchestrator/useBuilderUtils'
import { syncImportedTemplateRecord } from '@/utils/template/entity-context.util'
import { resolveEditEntityTypeFromItem } from '@/utils/template/yaml-parser.util'
import { canVisualEditTriggerYaml } from '@/utils/template/trigger-sensor.util'
import {
  formatTemplateImportHint,
  summarizeTemplateBulkImport,
} from '@/utils/template/template-yaml-import.util'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { logger } from '@/utils/core/logger'
import type { useChromeStore } from '@/stores/chrome.store'
import type { useEntitiesStore } from '@/stores/entities.store'
import type {
  OrchestratorSavedItem,
  SubmitPasteYamlOptions,
} from '@/types/orchestrator-builder'

/** 单项推送是否被阻塞：YAML 不完整时禁止推送。 */
function shouldBlockTemplateEntitySync(
  item: { yamlComplete?: boolean } | null | undefined,
): boolean {
  return item?.yamlComplete === false
}

/** 批量推送是否被阻塞：存在占位实体时禁止批量推送。 */
function shouldBlockTemplateEntitySyncAll(stubItemCount: number): boolean {
  return stubItemCount > 0
}

const TEMPLATE_ENTITY_INCOMPLETE_YAML_MSG = 'YAML 不完整，请先补全后再推送'

/** 批量推送阻塞提示文案。 */
function templateEntitySyncAllBlockedMessage(stubItemCount: number) {
  return `有 ${stubItemCount} 条占位实体，请先补全 YAML 再全部推送`
}

type ChromeStore = ReturnType<typeof useChromeStore>
type EntitiesStore = ReturnType<typeof useEntitiesStore>

/** 模板实体操作依赖：来自 useTemplateEntityBuilderCore 的注入项。 */
interface TemplateEntityOperationsDeps {
  chrome: ChromeStore
  entitiesStore: EntitiesStore
  resultMsg: Ref<string>
  resultOk: Ref<boolean>
  dismissAfter: (ms?: number) => void
  withSyncFeedback: (
    fn: () => Promise<{ ok: boolean; message?: string }>,
    opts?: {
      reload?: () => Promise<void> | void
      ttlMs?: number
      after?: (r: { ok: boolean; message?: string }) => Promise<void> | void
    },
  ) => Promise<unknown>
  stubItemCount: ComputedRef<number>
  syncStatusMap: Ref<Record<string, unknown>>
  savedList: Ref<Array<Record<string, unknown>>>
  editingId: Ref<string | null>
  deleting: Ref<boolean>
  deletingHaId: Ref<unknown>
  showDeleteConfirm: Ref<boolean>
  deleteTarget: Ref<Record<string, unknown> | null>
  deleteMode: Ref<string>
  syncItem: (item: Record<string, unknown>) => Promise<{ ok: boolean; message?: string }>
  repairDriftItem: (
    item: Record<string, unknown>,
    direction: string,
    opts?: Record<string, unknown>,
  ) => Promise<{ ok: boolean; message?: string }>
  repairAllDrift: (
    direction: string,
    items: Array<Record<string, unknown>>,
  ) => Promise<{ ok: boolean; message?: string }>
  syncAllToHa: () => Promise<{ ok: boolean; message?: string }>
  pullAllFromHa: () => Promise<{ ok: boolean; message?: string }>
  importFromHa: (
    key: string,
    extra?: Record<string, unknown>,
    opts?: Record<string, unknown>,
  ) => Promise<{ ok: boolean; message?: string; templateId?: string }>
  removeFromHa: (item: Record<string, unknown>) => Promise<{ ok: boolean; message?: string }>
  loadList: () => Promise<void>
  discoverHA: (force?: boolean) => Promise<void>
  importingId: Ref<string | null>
  haConfigReadable: Ref<boolean>
  importFlow: {
    pasteYamlOpen: Ref<boolean>
    pasteYamlText: Ref<string>
    submitPasteYaml: (opts: SubmitPasteYamlOptions) => Promise<unknown>
  }
  entName: Ref<string>
  entType: Ref<string>
  storedYaml: Ref<string>
  pasteYamlName: Ref<string>
  pasteYamlHaConfigId: Ref<string>
  pasteYamlEntityId: Ref<string>
  saving: Ref<boolean>
  formSnapshot: Ref<string>
  formSignature: () => string
  buildSlotMappingPayload: () => unknown
  yamlValidation: { validate: (yaml: string) => Promise<{ valid: boolean; message?: string }> }
  resetForm: () => void
  editItem: (item: Record<string, unknown>) => Promise<void>
}

/**
 * 模板实体 HA 同步 / 导入 / 删除 composable（useTemplateEntityBuilderCore 拆分模块）。
 *
 * @param deps 来自 useTemplateEntityBuilderCore 的注入依赖（见 TemplateEntityOperationsDeps）
 * @returns doSync / doRepair / doRepairPull / doSyncAll / doRepairAll / doPullAll /
 *          openPasteYaml / closePasteYaml / submitPasteYaml / applyStoredYamlToDb /
 *          doReimport / doImport / confirmHaDelete / delConfirm / closeDeleteConfirm / executeDelete
 */
export function useTemplateEntityOperations(deps: TemplateEntityOperationsDeps) {
  const {
    chrome,
    entitiesStore,
    resultMsg,
    resultOk,
    dismissAfter,
    withSyncFeedback,
    stubItemCount,
    syncStatusMap,
    savedList,
    editingId,
    deleting,
    deletingHaId,
    showDeleteConfirm,
    deleteTarget,
    deleteMode,
    syncItem,
    repairDriftItem,
    repairAllDrift,
    syncAllToHa,
    pullAllFromHa,
    importFromHa,
    removeFromHa,
    loadList,
    discoverHA,
    importingId,
    haConfigReadable,
    importFlow,
    entName,
    storedYaml,
    pasteYamlName,
    pasteYamlHaConfigId,
    pasteYamlEntityId,
    saving,
    formSnapshot,
    formSignature,
    buildSlotMappingPayload,
    yamlValidation,
    resetForm,
    editItem,
    entType,
  } = deps

  function notifyTemplateImportHint(
    yaml: string,
    meta?: {
      type?: string
      yamlComplete?: boolean
      yamlSource?: string
      name?: string
      haConfigId?: string
    },
  ) {
    const hint = formatTemplateImportHint(yaml, {
      type: meta?.type || entType.value,
      yamlComplete: meta?.yamlComplete,
      yamlSource: meta?.yamlSource,
      entName: meta?.name || entName.value,
      haConfigId: meta?.haConfigId,
    })
    if (hint) chrome.notify(hint, 'warning', 6000)
  }

  async function doSync(item: Record<string, unknown>) {
    if (shouldBlockTemplateEntitySync(item)) {
      flashBuilderResult(
        resultMsg,
        resultOk,
        TEMPLATE_ENTITY_INCOMPLETE_YAML_MSG,
        false,
        dismissAfter,
        3500,
      )
      openPasteYaml(item)
      return
    }
    await withSyncFeedback(() => syncItem(item), {
      reload: loadList,
      after: () => discoverHA(true),
    })
  }

  async function doRepair(item: Record<string, unknown>) {
    const st = (syncStatusMap.value as Record<string, { localHash?: string; haHash?: string }>)[
      String(item.id)
    ]
    const hashHint =
      st?.localHash && st?.haHash
        ? `本地 ${st.localHash.slice(0, 8)}… / HA ${String(st.haHash).slice(0, 8)}…`
        : ''
    const hash = hashHint ? `\n哈希: ${hashHint}` : ''
    if (!(await chrome.confirm(`将本地 YAML 推送到 HA 覆盖「${item.name || item.id}」？${hash}`)))
      return
    await withSyncFeedback(() => repairDriftItem(item, 'push'), {
      reload: loadList,
      after: () => discoverHA(true),
    })
  }

  async function doRepairPull(item: Record<string, unknown>) {
    if (
      !(await chrome.confirm(
        `从 HA 拉回配置覆盖本地「${item.name || item.id}」？未保存的编辑将丢失。`,
      ))
    )
      return
    await withSyncFeedback(() => repairDriftItem(item, 'pull'), {
      reload: loadList,
      after: () => discoverHA(true),
    })
  }

  async function doSyncAll() {
    if (shouldBlockTemplateEntitySyncAll(stubItemCount.value)) {
      flashBuilderResult(
        resultMsg,
        resultOk,
        templateEntitySyncAllBlockedMessage(stubItemCount.value),
        false,
        dismissAfter,
        3500,
      )
      return
    }
    await withSyncFeedback(() => syncAllToHa(), {
      reload: loadList,
      ttlMs: 3000,
      after: () => discoverHA(true),
    })
  }

  async function doRepairAll() {
    await withSyncFeedback(() => repairAllDrift('push', savedList.value), {
      reload: loadList,
      ttlMs: 3000,
      after: () => discoverHA(true),
    })
  }

  async function doPullAll() {
    const beforeIds = new Set(savedList.value.map((i) => String(i.id)))
    const r = await pullAllFromHa()
    await loadList()
    await discoverHA()
    if (r.ok) {
      const importedItems = savedList.value.filter((i) => !beforeIds.has(String(i.id)))
      if (importedItems.length) {
        const summary = summarizeTemplateBulkImport(importedItems)
        chrome.notify(summary.message, summary.notifyType)
      }
    }
    flashBuilderResult(resultMsg, resultOk, r.message || '', r.ok, dismissAfter, 3000)
  }

  function openPasteYaml(item?: Record<string, unknown>) {
    importFlow.pasteYamlText.value = ''
    pasteYamlName.value = String(item?.name || entName.value || '')
    pasteYamlHaConfigId.value = String(item?.haConfigId || item?.ha_config_id || '')
    pasteYamlEntityId.value = String(item?.haEntityId || item?.entity_id || '')
    importFlow.pasteYamlOpen.value = true
  }

  function closePasteYaml() {
    importFlow.pasteYamlOpen.value = false
  }

  async function submitPasteYaml() {
    if (!pasteYamlName.value?.trim()) {
      resultMsg.value = '请输入名称'
      resultOk.value = false
      return
    }
    const created = await importFlow.submitPasteYaml({
      createFn: async (yaml: string) => {
        const r = await importTemplateEntityYaml({
          name: pasteYamlName.value.trim(),
          yaml,
          haConfigId: pasteYamlHaConfigId.value || undefined,
          entity_id: pasteYamlEntityId.value || undefined,
        })
        if (!r.data?.success) throw new Error(r.data?.message || '导入失败')
        resultMsg.value = r.data?.message || '已导入'
        resultOk.value = true
        dismissAfter(3500)
        return r.data
      },
      successHint: (yaml) =>
        formatTemplateImportHint(yaml, {
          entName: pasteYamlName.value.trim(),
          haConfigId: pasteYamlHaConfigId.value || undefined,
        }),
    })
    if (!created) {
      resultMsg.value = resultMsg.value || '导入失败'
      resultOk.value = false
      dismissAfter(3500)
    }
  }

  async function applyStoredYamlToDb() {
    if (!editingId.value || !storedYaml.value?.trim()) return
    saving.value = true
    try {
      const vr = await yamlValidation.validate(storedYaml.value)
      if (!vr.valid) {
        resultMsg.value = vr.message || 'YAML 校验失败'
        resultOk.value = false
        return
      }
      await updateTemplateEntity(editingId.value, {
        name: entName.value,
        type: entType.value || 'yaml_import',
        yaml: storedYaml.value,
        slotMapping: buildSlotMappingPayload(),
      })
      formSnapshot.value = formSignature()
      resultMsg.value = 'YAML 已保存'
      resultOk.value = true
      await loadList()
    } catch (e) {
      logger.warn('模板 YAML 保存失败', e)
      resultMsg.value = getApiErrorMessage(e, '保存失败')
      resultOk.value = false
    } finally {
      saving.value = false
      dismissAfter(2500)
    }
  }

  async function finishImportFromHa(
    item: Record<string, unknown>,
    r: { ok: boolean; message?: string; templateId?: string },
  ) {
    if (r.ok && r.templateId) {
      let row = savedList.value.find((i) => i.id === r.templateId)
      if (row) {
        row = await syncImportedTemplateRecord(row as OrchestratorSavedItem, {
          apiGet: (url: string, cfg?: Record<string, unknown>) => apiGet(url, cfg),
          apiPut: (url: string, body: Record<string, unknown>) => apiPut(url, body),
          haConfigReadable: haConfigReadable.value,
          entities: entitiesStore.entities,
        })
        await editItem(row)
        const resolved = resolveEditEntityTypeFromItem(row)
        if (
          (row.yamlComplete === false || String(row.yaml || '').includes('占位片段')) &&
          resolved.type !== 'trigger_sensor'
        ) {
          openPasteYaml(row)
        }
      }
    } else if (
      r.message?.includes('不完整') &&
      !canVisualEditTriggerYaml(item.yaml, {
        name: item.name,
        haConfigId: item.haConfigId || item.ha_config_id,
      })
    ) {
      openPasteYaml(item)
    }
  }

  async function doReimport(item: Record<string, unknown>) {
    const haConfigId = item.haConfigId
    const entityId = item.haEntityId
    if (!haConfigId && !entityId) {
      resultMsg.value = '未关联 HA'
      resultOk.value = false
      return
    }
    const r = await importFromHa(String(haConfigId || entityId), {
      name: item.name,
      entity_id: entityId || undefined,
      type: 'yaml_import',
    })
    resultMsg.value = r.message || ''
    resultOk.value = r.ok
    await loadList()
    if (r.ok) {
      const row =
        (r.templateId && savedList.value.find((i) => i.id === r.templateId)) ||
        savedList.value.find(
          (i) =>
            String(i.haConfigId || i.ha_config_id || '') === String(item.haConfigId || '') ||
            String(i.haEntityId || i.entity_id || '') === String(item.haEntityId || ''),
        )
      notifyTemplateImportHint(String(row?.yaml || item.yaml || ''), {
        type: String(row?.type || item.type || ''),
        yamlComplete:
          typeof (row?.yamlComplete ?? item.yamlComplete) === 'boolean'
            ? Boolean(row?.yamlComplete ?? item.yamlComplete)
            : undefined,
        yamlSource: String(row?.yamlSource || item.yamlSource || ''),
        name: String(row?.name || item.name || ''),
        haConfigId: String(row?.haConfigId || item.haConfigId || ''),
      })
    }
    await finishImportFromHa(item, r)
    dismissAfter(3500)
  }

  async function doImport(item: Record<string, unknown>) {
    const haConfigId = (item.ha_config_id || item.entity_id) as string | undefined
    const importKey = haConfigId || (item.config_entry_id as string | undefined)
    if (!importKey || importingId.value) {
      if (!importKey) {
        resultMsg.value = '未关联 HA'
        resultOk.value = false
        dismissAfter(3500)
      }
      return
    }
    importingId.value = importKey
    resultMsg.value = '正在从 HA 导入（约 10 秒内完成）…'
    resultOk.value = true
    try {
      const r = await importFromHa(
        String(haConfigId || item.entity_id || item.config_entry_id),
        {
          name: item.name,
          entity_id: item.entity_id,
          type: 'yaml_import',
          ha_config_entry_id: item.config_entry_id,
          trigger_entity_id: item.trigger_entity_id,
        },
        { useSyncing: false, timeoutMs: 30_000 },
      )
      resultMsg.value =
        r.message?.includes('不完整') || item.yaml_complete === false
          ? `${r.message}。可在编辑区用可视化表单补全，或配置 haConfigDir 后点「从 configuration.yaml 读取」`
          : r.message || ''
      resultOk.value = r.ok
      await loadList()
      if (r.ok) await discoverHA(true)
      if (r.ok && r.templateId) {
        const imported = savedList.value.find((i) => i.id === r.templateId)
        if (imported) {
          notifyTemplateImportHint(String(imported.yaml || ''), {
            type: String(imported.type || ''),
            yamlComplete:
              typeof imported.yamlComplete === 'boolean' ? imported.yamlComplete : undefined,
            yamlSource: String(imported.yamlSource || ''),
            name: String(imported.name || ''),
            haConfigId: String(imported.haConfigId || ''),
          })
          await editItem(imported)
          const resolved = resolveEditEntityTypeFromItem(imported)
          if (
            (imported.yamlComplete === false || String(imported.yaml || '').includes('占位片段')) &&
            resolved.type !== 'trigger_sensor'
          ) {
            openPasteYaml({
              ...imported,
              name: imported.name,
              haConfigId: imported.haConfigId,
              haEntityId: imported.haEntityId,
            })
          }
        }
      } else {
        await finishImportFromHa(item, r)
      }
    } finally {
      importingId.value = null
      dismissAfter(5000)
    }
  }

  function confirmHaDelete(item: Record<string, unknown>) {
    if (!item.ha_config_id && !item.config_entry_id) return
    deleteTarget.value = item
    deleteMode.value = 'ha'
    showDeleteConfirm.value = true
  }

  function delConfirm(item: Record<string, unknown>) {
    deleteTarget.value = item
    deleteMode.value = 'local'
    showDeleteConfirm.value = true
  }

  function closeDeleteConfirm() {
    if (deleting.value || deletingHaId.value) return
    showDeleteConfirm.value = false
    deleteTarget.value = null
    deleteMode.value = 'local'
  }

  async function executeDelete() {
    if (!deleteTarget.value || deleting.value || deletingHaId.value) return
    const item = deleteTarget.value
    if (deleteMode.value === 'ha') {
      const r = await removeFromHa(item)
      showDeleteConfirm.value = false
      deleteTarget.value = null
      deleteMode.value = 'local'
      flashBuilderResult(resultMsg, resultOk, r.message || '', r.ok, dismissAfter, 4000)
      if (r.ok) {
        await discoverHA(true)
        await loadList()
      }
      return
    }
    deleting.value = true
    try {
      const res = await deleteTemplateEntity(String(item.id), { timeout: 20_000 })
      showDeleteConfirm.value = false
      deleteTarget.value = null
      deleteMode.value = 'local'
      await loadList()
      resultMsg.value = res.data?.alreadyDeleted
        ? `「${item.name}」已不存在`
        : `已删除「${item.name}」`
      resultOk.value = true
      if (editingId.value === item.id) resetForm()
      dismissAfter(2000)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status
      resultMsg.value = status === 403 ? '删除需要管理员权限' : getApiErrorMessage(err, '删除失败')
      resultOk.value = false
    } finally {
      deleting.value = false
    }
  }

  return {
    doSync,
    doRepair,
    doRepairPull,
    doSyncAll,
    doRepairAll,
    doPullAll,
    openPasteYaml,
    closePasteYaml,
    submitPasteYaml,
    applyStoredYamlToDb,
    doReimport,
    doImport,
    confirmHaDelete,
    delConfirm,
    closeDeleteConfirm,
    executeDelete,
  }
}
