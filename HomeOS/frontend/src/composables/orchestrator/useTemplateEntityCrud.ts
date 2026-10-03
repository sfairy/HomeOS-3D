/**
 * @file useTemplateEntityCrud.ts
 * @module frontend/src/composables
 */
import { type Ref } from 'vue'
import { apiGet } from '@/services/api'
import { createTemplateEntity, updateTemplateEntity } from '@/services/api/orchestrator'
import { flashBuilderResult } from '@/composables/orchestrator/useBuilderUtils'
import {
  buildTemplateEntitySavePayload,
  templateEntityPostSaveHint,
} from '@/utils/template/entity-crud.util'
import { validateTemplateEntityForm } from '@/utils/template/entity-validate.util'
import {
  guessTriggerEntityFromStore,
  resolveTemplateContext,
  shouldReplaceTriggerYaml,
} from '@/utils/template/entity-context.util'
import { resolveEditEntityTypeFromItem } from '@/utils/template/yaml-parser.util'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { logger } from '@/utils/core/logger'
import type { useEntitiesStore } from '@/stores/entities.store'
import type { useChromeStore } from '@/stores/chrome.store'
import type { useTemplateEntitySlotEditor } from '@/composables/orchestrator/useTemplateEntitySlotEditor'
import type { useTemplateEntityTriggerForm } from '@/composables/orchestrator/useTemplateEntityTriggerForm'
import type { OrchestratorSavedItem } from '@/types/orchestrator-builder'

type EntitiesStore = ReturnType<typeof useEntitiesStore>
type ChromeStore = ReturnType<typeof useChromeStore>
type SlotEditor = ReturnType<typeof useTemplateEntitySlotEditor>
type TriggerForm = ReturnType<typeof useTemplateEntityTriggerForm>

interface TemplateEntityCrudDeps {
  chrome: ChromeStore
  entitiesStore: EntitiesStore
  isAdmin: Ref<boolean>
  entName: Ref<string>
  entType: Ref<string>
  storedYaml: Ref<string>
  formSnapshot: Ref<string>
  editingId: Ref<string | null>
  saving: Ref<boolean>
  resultMsg: Ref<string>
  resultOk: Ref<boolean>
  yamlPreview: Ref<string>
  haConfigReadable: Ref<boolean>
  savedList: Ref<Array<Record<string, unknown>>>
  slots: SlotEditor['slots']
  triggerShowRawYaml: Ref<boolean>
  triggerSensorForm: TriggerForm['triggerSensorForm']
  extraUnit: Ref<string>
  extraDeviceClass: Ref<string>
  extraIcon: Ref<string>
  formSignature: () => string
  resetForm: () => void
  buildSlotMappingPayload: () => unknown
  loadList: () => Promise<void>
  dismissAfter: (ms?: number) => void
  validateYaml: (yaml: string) => Promise<{ valid: boolean; message?: string }>
  doSync: (item: Record<string, unknown>) => Promise<void>
  slotEditor: Pick<SlotEditor, 'slotDefs' | 'hydrateFromItem'>
  triggerForm: Pick<
    TriggerForm,
    | 'loadTriggerSensorFromYaml'
    | 'commitTriggerSensorYaml'
    | 'resetTriggerSensorForm'
    | 'triggerSensorForm'
  >
  /** 保存成功后回调（如关闭 LinkageHub 抽屉） */
  onSaved?: () => void
}

/** 模板实体加载 / 保存 API（useTemplateEntityBuilderCore 拆分模块） */
export function useTemplateEntityCrud(deps: TemplateEntityCrudDeps) {
  const {
    chrome,
    entitiesStore,
    isAdmin,
    entName,
    entType,
    storedYaml,
    formSnapshot,
    editingId,
    saving,
    resultMsg,
    resultOk,
    yamlPreview,
    haConfigReadable,
    savedList,
    slots,
    triggerShowRawYaml,
    triggerSensorForm,
    extraUnit,
    extraDeviceClass,
    extraIcon,
    formSignature,
    resetForm,
    buildSlotMappingPayload,
    loadList,
    dismissAfter,
    validateYaml,
    doSync,
    slotEditor,
    triggerForm,
  } = deps

  const { slotDefs, hydrateFromItem } = slotEditor
  const { loadTriggerSensorFromYaml, commitTriggerSensorYaml, resetTriggerSensorForm } = triggerForm

  async function editItem(item: Record<string, unknown>) {
    resetForm()
    editingId.value = String(item.id || '')
    entName.value = String(item.name || '')

    const ctx =
      item.haConfigId || item.haEntityId
        ? await resolveTemplateContext(item as OrchestratorSavedItem, {
            remote: true,
            haConfigReadable: haConfigReadable.value,
            apiGet: (url: string, cfg?: Record<string, unknown>) => apiGet(url, cfg),
            entities: entitiesStore.entities,
          })
        : {
            yaml: String(item.yaml || ''),
            triggerEntityId: String(item.trigger_entity_id || ''),
          }
    const yaml = ctx.yaml
    storedYaml.value = yaml

    const workItem = {
      ...item,
      yaml,
      trigger_entity_id: ctx.triggerEntityId || item.trigger_entity_id,
    }
    const resolved = resolveEditEntityTypeFromItem(workItem)
    const { type, parsed, meta } = resolved
    if (!meta.triggerEntityId) {
      meta.triggerEntityId = guessTriggerEntityFromStore(
        parsed.uniqueId || item.haConfigId,
        item.name,
        entitiesStore.entities,
      )
    }
    if (parsed.entName && !item.name) entName.value = String(parsed.entName)
    entType.value = String(type)

    if (type === 'trigger_sensor') {
      loadTriggerSensorFromYaml(yaml, meta)
      if (parsed.uniqueId && !triggerSensorForm.uniqueId)
        triggerSensorForm.uniqueId = String(parsed.uniqueId)
      if (!triggerSensorForm.uniqueId && item.haConfigId)
        triggerSensorForm.uniqueId = String(item.haConfigId)
      if (shouldReplaceTriggerYaml(yaml, item.yamlComplete) || triggerSensorForm.triggerEntityId) {
        commitTriggerSensorYaml()
      } else {
        storedYaml.value = yaml
      }
    } else {
      resetTriggerSensorForm()
    }

    if (slotDefs[entType.value as keyof typeof slotDefs]) {
      hydrateFromItem({
        entType: entType.value,
        yaml,
        item,
        parsed,
      })
    }

    extraUnit.value = String(parsed.extraUnit || '')
    extraDeviceClass.value = String(parsed.extraDeviceClass || '')
    extraIcon.value = String(parsed.extraIcon || '')

    try {
      formSnapshot.value = formSignature()
      flashBuilderResult(resultMsg, resultOk, '已加载', true, dismissAfter, 2000)
    } catch (err) {
      logger.warn('YAML 解析失败', err)
      resultMsg.value = getApiErrorMessage(err, '加载失败')
      resultOk.value = false
    }
  }

  async function saveBtn() {
    const formCheck = validateTemplateEntityForm({
      entName: entName.value,
      entType: entType.value,
      yaml: yamlPreview.value,
      slots: { ...slots },
      triggerEntityId: triggerSensorForm.triggerEntityId,
      triggerShowRawYaml: triggerShowRawYaml.value,
    })
    if (!formCheck.valid) {
      resultMsg.value = formCheck.message
      resultOk.value = false
      return
    }
    const y = yamlPreview.value
    saving.value = true
    resultMsg.value = ''
    try {
      const slotMapping = buildSlotMappingPayload()
      const vr = await validateYaml(y)
      if (!vr.valid) {
        resultMsg.value = vr.message || 'YAML 校验失败'
        resultOk.value = false
        return
      }
      const payload = buildTemplateEntitySavePayload(entName.value, entType.value, y, slotMapping)
      if (editingId.value) {
        await updateTemplateEntity(editingId.value, payload)
        resultMsg.value = '已更新'
      } else {
        const created = await createTemplateEntity(payload)
        editingId.value = created.data?.id || null
        resultMsg.value = '已保存'
      }
      storedYaml.value = y
      formSnapshot.value = formSignature()
      resultOk.value = true
      await loadList()
      dismissAfter(2000)
      deps.onSaved?.()

      const row = savedList.value.find((i) => i.id === editingId.value)
      const hint = templateEntityPostSaveHint(isAdmin.value, editingId.value, row)
      if (hint.kind === 'push_ha') {
        const pushNow = await chrome.confirm(
          '模板已保存到 HomeOS。是否立即推送到 Home Assistant？\n\n未推送前，场景/自动化无法引用该实体。',
          '推送到 HA',
        )
        if (pushNow && row) await doSync(row)
      } else if (hint.kind === 'incomplete_yaml') {
        flashBuilderResult(
          resultMsg,
          resultOk,
          'YAML 不完整，请先补全后再推送 HA',
          false,
          dismissAfter,
          4000,
        )
      } else if (hint.kind === 'non_admin_saved') {
        flashBuilderResult(
          resultMsg,
          resultOk,
          '已保存（需管理员推送到 HA 后生效）',
          true,
          dismissAfter,
          3500,
        )
      }
    } catch (err) {
      logger.warn('模板实体保存失败', err)
      resultMsg.value = getApiErrorMessage(err, '保存失败')
      resultOk.value = false
    } finally {
      saving.value = false
    }
  }

  return {
    editItem,
    saveBtn,
  }
}
