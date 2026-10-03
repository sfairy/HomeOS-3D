/**
 * @file useTemplateEntityHaConfig.ts
 * @module frontend/src/composables
 */
import { ref, computed, type ComputedRef, type Ref } from 'vue'
import {
  fetchTemplateEntityHaConfigStatus,
  pullTemplateEntityHaConfig,
  updateTemplateEntity,
  writeTemplateEntityHaConfig,
} from '@/services/api/orchestrator'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { flashBuilderResult } from '@/composables/orchestrator/useBuilderUtils'
import { useYamlValidation } from '@/composables/orchestrator/useYamlValidation'

interface HaConfigStatus {
  configured?: boolean
  writable?: boolean
  readable?: boolean
  message?: string
  [key: string]: unknown
}

interface SavedTemplateEntityRow {
  id: string
  [key: string]: unknown
}

interface TemplateEntityHaConfigDeps {
  isAdmin: Ref<boolean> | ComputedRef<boolean>
  resultMsg: Ref<string>
  resultOk: Ref<boolean>
  dismissAfter: (ms?: number) => void
  editingId: Ref<string | null | undefined>
  formTouched: Ref<boolean> | ComputedRef<boolean>
  yamlPreview: Ref<string> | ComputedRef<string>
  entName: Ref<string>
  entType: Ref<string>
  formSnapshot: Ref<string>
  formSignatureFn: () => string
  savedList: Ref<Array<Record<string, unknown>>>
  loadList: () => void | Promise<void>
  editItem: (row: SavedTemplateEntityRow | Record<string, unknown>) => void | Promise<void>
  buildSlotMappingPayload?: () => unknown
}

/** HA configuration.yaml 目录状态与读写（目录凭据在「高级参数 → automation.haConfigDir」配置） */
export function useTemplateEntityHaConfig({
  isAdmin,
  resultMsg,
  resultOk,
  dismissAfter,
  editingId,
  formTouched,
  yamlPreview,
  entName,
  entType,
  formSnapshot,
  formSignatureFn,
  savedList,
  loadList,
  editItem,
  buildSlotMappingPayload,
}: TemplateEntityHaConfigDeps) {
  const haConfigStatus = ref<HaConfigStatus | null>(null)
  const configFileBusy = ref(false)
  const templateYamlValidation = useYamlValidation({
    endpoint: '/template-entity/validate',
    buildBody: (yaml: string) => ({ yaml }),
  })
  const haConfigReady = computed(
    () =>
      !!haConfigStatus.value?.configured &&
      haConfigStatus.value?.writable &&
      haConfigStatus.value?.readable,
  )
  const haConfigReadable = computed(
    () => !!haConfigStatus.value?.configured && haConfigStatus.value?.readable,
  )
  function flash(msg: string, ok: boolean, ms = 4000) {
    flashBuilderResult(resultMsg, resultOk, msg, ok, dismissAfter, ms)
  }
  async function loadHaConfigStatus() {
    if (!isAdmin.value) return
    try {
      const r = await fetchTemplateEntityHaConfigStatus()
      haConfigStatus.value = (r.data as HaConfigStatus) || null
    } catch {
      haConfigStatus.value = null
    }
  }
  async function persistEditorBeforeHaWrite() {
    if (!formTouched.value) return true
    const y = yamlPreview.value
    const vr = await templateYamlValidation.validate(y)
    if (!vr.valid) {
      flash(vr.message || 'YAML 校验失败', false)
      return false
    }
    await updateTemplateEntity(editingId.value!, {
      name: entName.value,
      type: entType.value || 'yaml_import',
      yaml: y,
      slotMapping: buildSlotMappingPayload?.() ?? undefined,
    })
    formSnapshot.value = formSignatureFn()
    return true
  }
  async function doWriteHaConfig() {
    if (!editingId.value) return
    configFileBusy.value = true
    try {
      if (!(await persistEditorBeforeHaWrite())) return
      const r = await writeTemplateEntityHaConfig(editingId.value)
      flash(
        r.data?.message || (r.data?.success ? '已写入 configuration.yaml' : '写入失败'),
        !!r.data?.success,
      )
      if (r.data?.success) await loadList()
    } catch (e) {
      flash(getApiErrorMessage(e, '写入 configuration.yaml 失败'), false)
    } finally {
      configFileBusy.value = false
    }
  }
  async function doPullHaConfig() {
    if (!editingId.value) return
    configFileBusy.value = true
    try {
      const r = await pullTemplateEntityHaConfig(editingId.value)
      flash(
        r.data?.message || (r.data?.success ? '已从 configuration.yaml 读取' : '读取失败'),
        !!r.data?.success,
      )
      if (r.data?.success) {
        await loadList()
        const row = savedList.value.find((i) => i.id === editingId.value)
        if (row) await editItem(row)
      }
    } catch (e) {
      flash(getApiErrorMessage(e, '读取 configuration.yaml 失败'), false)
    } finally {
      configFileBusy.value = false
    }
  }
  async function doWriteHaConfigItem(item: SavedTemplateEntityRow | null | undefined) {
    if (!item?.id) return
    configFileBusy.value = true
    try {
      const r = await writeTemplateEntityHaConfig(item.id)
      flash(
        r.data?.message || (r.data?.success ? '已写入 configuration.yaml' : '写入失败'),
        !!r.data?.success,
      )
      await loadList()
    } catch (e) {
      flash(getApiErrorMessage(e, '写入失败'), false)
    } finally {
      configFileBusy.value = false
    }
  }
  async function doPullHaConfigItem(item: SavedTemplateEntityRow | null | undefined) {
    if (!item?.id) return
    configFileBusy.value = true
    try {
      const r = await pullTemplateEntityHaConfig(item.id)
      flash(
        r.data?.message || (r.data?.success ? '已从 configuration.yaml 读取' : '读取失败'),
        !!r.data?.success,
      )
      await loadList()
      if (r.data?.success && editingId.value === item.id) {
        const row = savedList.value.find((i) => i.id === item.id)
        if (row) await editItem(row)
      }
    } catch (e) {
      flash(getApiErrorMessage(e, '读取失败'), false)
    } finally {
      configFileBusy.value = false
    }
  }
  return {
    haConfigStatus,
    configFileBusy,
    haConfigReady,
    haConfigReadable,
    loadHaConfigStatus,
    doWriteHaConfig,
    doPullHaConfig,
    doWriteHaConfigItem,
    doPullHaConfigItem,
  }
}
