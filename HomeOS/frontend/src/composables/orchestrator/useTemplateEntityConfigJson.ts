/**
 * @file useTemplateEntityConfigJson.ts
 * @module frontend/src/composables
 */
import { ref, type Ref } from 'vue'
import { importTemplateEntityConfig } from '@/services/api/orchestrator'
import { flashBuilderResult } from '@/composables/orchestrator/useBuilderUtils'
import {
  buildTemplateEntityExportPayload,
  downloadTemplateEntityJson,
  parseTemplateEntityImportJson,
  type TemplateEntityExportPayload,
} from '@/utils/template/entity-export.util'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { logger } from '@/utils/core/logger'

interface TemplateEntityConfigJsonDeps {
  resultMsg: Ref<string>
  resultOk: Ref<boolean>
  dismissAfter: (ms?: number) => void
  entName: Ref<string>
  entType: Ref<string>
  storedYaml: Ref<string>
  extraUnit: Ref<string>
  extraDeviceClass: Ref<string>
  extraIcon: Ref<string>
  triggerShowRawYaml: Ref<boolean>
  triggerSensorForm: Record<string, unknown>
  slots: Record<string, string>
  slotsList: Array<{
    key: string
    label?: string
    hint?: string
    domain?: string
    icon?: string
    _key?: string
    custom?: boolean
  }>
  yamlPreview: Ref<string>
  slotDefs: Record<string, unknown>
  editingId: Ref<string | null>
  saving: Ref<boolean>
  formSnapshot: Ref<string>
  formSignature: () => string
  yamlValidation: { validate: (yaml: string) => Promise<{ valid: boolean; message?: string }> }
  savedList: Ref<Array<Record<string, unknown>>>
  loadList: () => Promise<void>
  editItem: (item: Record<string, unknown>) => Promise<void>
  clearAllSlots: () => void
  resetTriggerSensorForm: () => void
  applyImportedTrigger: (data: {
    triggerSensor?: Record<string, unknown>
    triggerShowRawYaml?: boolean
  }) => void
  hydrateFromImport: (data: {
    type: string
    yaml: string
    name: string
    slotMapping?: unknown
  }) => void
}

/** 模板实体 JSON 配置导入/导出（useTemplateEntityBuilderCore 拆分模块） */
export function useTemplateEntityConfigJson(deps: TemplateEntityConfigJsonDeps) {
  const {
    resultMsg,
    resultOk,
    dismissAfter,
    entName,
    entType,
    storedYaml,
    extraUnit,
    extraDeviceClass,
    extraIcon,
    triggerShowRawYaml,
    triggerSensorForm,
    slots,
    slotsList,
    yamlPreview,
    slotDefs,
    editingId,
    saving,
    formSnapshot,
    formSignature,
    yamlValidation,
    savedList,
    loadList,
    editItem,
    clearAllSlots,
    resetTriggerSensorForm,
    applyImportedTrigger,
    hydrateFromImport,
  } = deps

  const configImportInput = ref<HTMLInputElement | null>(null)
  const configImportMode = ref<'editor' | 'save'>('editor')

  function exportConfigJson() {
    if (!entType.value) {
      resultMsg.value = '请先选择家电类型'
      resultOk.value = false
      return
    }
    const payload = buildTemplateEntityExportPayload({
      name: entName.value,
      type: entType.value,
      yaml: yamlPreview.value,
      slots: { ...slots },
      slotsList: slotsList.map((s) => ({ ...s })) as never,
      extraUnit: extraUnit.value,
      extraDeviceClass: extraDeviceClass.value,
      extraIcon: extraIcon.value,
      triggerSensor: entType.value === 'trigger_sensor' ? { ...triggerSensorForm } : undefined,
      triggerShowRawYaml: triggerShowRawYaml.value,
    })
    downloadTemplateEntityJson(payload)
    flashBuilderResult(resultMsg, resultOk, '已导出 JSON 配置', true, dismissAfter, 2000)
  }

  function openConfigJsonImport(mode: 'editor' | 'save' = 'editor') {
    configImportMode.value = mode
    configImportInput.value?.click()
  }

  function applyImportedConfig(data: TemplateEntityExportPayload) {
    editingId.value = null
    entName.value = data.name
    entType.value = data.type
    storedYaml.value = data.yaml
    extraUnit.value = data.extraUnit || ''
    extraDeviceClass.value = data.extraDeviceClass || ''
    extraIcon.value = data.extraIcon || ''
    clearAllSlots()
    resetTriggerSensorForm()

    if (data.type === 'trigger_sensor') {
      applyImportedTrigger(data)
    } else if (slotDefs[data.type as keyof typeof slotDefs]) {
      hydrateFromImport({
        type: data.type,
        yaml: data.yaml,
        name: data.name,
        slotMapping: data.slotMapping,
      })
    }

    formSnapshot.value = formSignature()
    flashBuilderResult(resultMsg, resultOk, '已导入 JSON 配置', true, dismissAfter, 2500)
  }

  function applyImportedConfigJson(raw: string) {
    const parsed = parseTemplateEntityImportJson(raw)
    if (!parsed.ok) {
      resultMsg.value = parsed.message
      resultOk.value = false
      return
    }
    applyImportedConfig(parsed.data)
  }

  async function importConfigJsonAndSave(raw: string) {
    const parsed = parseTemplateEntityImportJson(raw)
    if (!parsed.ok) {
      resultMsg.value = parsed.message
      resultOk.value = false
      return
    }
    const data = parsed.data
    saving.value = true
    resultMsg.value = ''
    try {
      const vr = await yamlValidation.validate(data.yaml)
      if (!vr.valid) {
        resultMsg.value = vr.message || 'YAML 校验失败'
        resultOk.value = false
        return
      }
      const created = await importTemplateEntityConfig({
        name: data.name,
        type: data.type,
        yaml: data.yaml,
        slotMapping: data.slotMapping,
        extraUnit: data.extraUnit,
        extraDeviceClass: data.extraDeviceClass,
        extraIcon: data.extraIcon,
      })
      editingId.value = created.data?.id || null
      resultMsg.value = '已从 JSON 导入并保存'
      resultOk.value = true
      await loadList()
      dismissAfter(2500)
      if (editingId.value) {
        const row = savedList.value.find((i) => i.id === editingId.value)
        if (row) await editItem(row)
      }
    } catch (err) {
      logger.warn('JSON 配置导入保存失败', err)
      resultMsg.value = getApiErrorMessage(err, '导入保存失败')
      resultOk.value = false
    } finally {
      saving.value = false
    }
  }

  async function onConfigJsonFileChange(ev: Event) {
    const input = ev.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      const text = await file.text()
      if (configImportMode.value === 'save') {
        await importConfigJsonAndSave(text)
      } else {
        applyImportedConfigJson(text)
      }
    } catch (e) {
      resultMsg.value = getApiErrorMessage(e, '读取文件失败')
      resultOk.value = false
    }
  }

  return {
    configImportInput,
    exportConfigJson,
    openConfigJsonImport,
    onConfigJsonFileChange,
    importConfigJsonAndSave,
    applyImportedConfigJson,
  }
}
