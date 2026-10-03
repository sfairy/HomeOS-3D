/**
 * @file useTemplateEntityBuilderCore.ts
 * @module frontend/src/composables
 */
import { hasOrchestratorPlaceholder } from '@homeos/shared'
import { ref, computed, onMounted, watch, onScopeDispose } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import { flashBuilderResult } from '@/composables/orchestrator/useBuilderUtils'
import { useOrchestratorBuilderBase } from '@/composables/orchestrator/useOrchestratorBuilderBase'
import { useOrchestratorImportFlow } from '@/composables/orchestrator/useOrchestratorImportFlow'
import { useInitialOrchestratorEdit } from '@/composables/orchestrator/useInitialOrchestratorEdit'
import { useYamlValidation } from '@/composables/orchestrator/useYamlValidation'
import { useTemplateEntityHaConfig } from '@/composables/orchestrator/useTemplateEntityHaConfig'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { useTemplateEntitySlotEditor } from '@/composables/orchestrator/useTemplateEntitySlotEditor'
import { useTemplateEntityTriggerForm } from '@/composables/orchestrator/useTemplateEntityTriggerForm'
import { useTemplateEntityTypeSelector } from '@/composables/orchestrator/useTemplateEntityTypeSelector'
import { isIncompleteTemplateYaml } from '@/utils/template/trigger-sensor.util'
import { useTemplateEntityYamlSync } from '@/composables/orchestrator/useTemplateEntityYamlSync'
import { useTemplateEntityCrud } from '@/composables/orchestrator/useTemplateEntityCrud'
import { useTemplateEntityOperations } from '@/composables/orchestrator/useTemplateEntityOperations'
import { useTemplateEntityConfigJson } from '@/composables/orchestrator/useTemplateEntityConfigJson'
import { useTemplateEntitySlotValidation } from '@/composables/orchestrator/useTemplateEntitySlotValidation'
import { APPLIANCE_TYPE_GROUPS, TEMPLATE_APP_TYPES } from '@/utils/template/entity-slot-defs.util'
import { setOrchestratorBuilderDirty, hasOrchestratorBuilderDirty } from '@/composables/settings/hub-backup-orchestrator.internals'

/** 模板实体联动器核心逻辑（薄 facade，组合各拆分 composable） */
export function useTemplateEntityBuilderCore(
  props: { initialEditId?: string; embedded?: boolean },
  emit: (e: 'close' | 'saved') => void,
) {
  const entitiesStore = useEntitiesStore()
  const authStore = useAuthStore()
  const chrome = useChromeStore()
  const isAdmin = computed(() => authStore.role === 'admin')
  const haConfigReadableRef = ref(false)

  const {
    savedList,
    haImportList,
    haDiscovering,
    showDeleteConfirm,
    deleteTarget,
    deleteMode,
    deletingLocal: deleting,
    resultMsg,
    resultOk,
    withSyncFeedback,
    dismissAfter,
    loadList,
    discoverHA,
    editingId,
    showSidebar,
    syncing,
    syncStatusMap,
    repairProgress,
    deletingHaId,
    syncItem,
    repairDriftItem,
    repairAllDrift,
    syncAllToHa,
    pullAllFromHa,
    importFromHa,
    removeFromHa,
  } = useOrchestratorBuilderBase({
    kind: 'template-entity',
    apiPath: '/template-entity',
    haImportPath: '/ha-sync/templates/import',
    defaultShowSidebar: !props.embedded,
    trackDiscovering: true,
    discoverRequestOptions: { timeout: 60_000, params: { resolve: '0' } },
    getDiscoverParams: () => ({ resolve: haConfigReadableRef.value ? '1' : '0' }),
    onDiscoverError(err: unknown) {
      flashBuilderResult(
        resultMsg,
        resultOk,
        getApiErrorMessage(err, 'HA 模板发现超时，请稍后点刷新重试'),
        false,
        dismissAfter,
        4000,
      )
    },
  })

  const yamlValidation = useYamlValidation({ endpoint: '/template-entity/validate' })

  const crudBridge: { editItem: (item: Record<string, unknown>) => Promise<void> } = {
    editItem: async () => {},
  }

  const importFlow = useOrchestratorImportFlow({
    chrome,
    entityLabel: '模板实体',
    validateYaml: (yaml: string) => yamlValidation.validate(yaml),
    onImported: async (created: unknown) => {
      await loadList()
      const c = created as { templateId?: string } | null
      if (c?.templateId) {
        const row = savedList.value.find((i) => i.id === c.templateId)
        if (row) await crudBridge.editItem(row)
      }
    },
  })

  const saving = ref(false)
  const stubItemCount = computed(
    () => savedList.value.filter((i) => i.yamlSource === 'stub' || i.yamlComplete === false).length,
  )
  const deleteLocalMessage = computed(() => `确定要删除「${deleteTarget.value?.name}」吗？`)
  const deleteHaMessage = computed(
    () =>
      `确定从 Home Assistant 删除模板实体「${deleteTarget.value?.name || deleteTarget.value?.entity_id}」吗？此操作将删除 HA 中的配置，不可恢复。`,
  )

  const entName = ref('')
  const entType = ref('')
  const storedYaml = ref('')
  const formSnapshot = ref('')
  const importingId = ref<string | null>(null)
  const pasteYamlName = ref('')
  const pasteYamlHaConfigId = ref('')
  const pasteYamlEntityId = ref('')
  const extraUnit = ref('')
  const extraDeviceClass = ref('')
  const extraIcon = ref('')

  const slotEditor = useTemplateEntitySlotEditor()
  const triggerForm = useTemplateEntityTriggerForm({ entName, entType, storedYaml })

  const typeSelector = useTemplateEntityTypeSelector({
    entType,
    storedYaml,
    editingId,
    extraUnit,
    extraDeviceClass,
    extraIcon,
    resultMsg,
    resultOk,
    dismissAfter,
    slotEditor,
    triggerForm,
  })

  const allDomains = computed(() => [...entitiesStore.domains].sort())

  function resetForm() {
    entName.value = ''
    entType.value = ''
    editingId.value = null
    resultMsg.value = ''
    storedYaml.value = ''
    formSnapshot.value = ''
    slotEditor.clearAllSlots()
    triggerForm.resetTriggerSensorForm()
    extraUnit.value = ''
    extraDeviceClass.value = ''
    extraIcon.value = ''
  }

  const yamlSync = useTemplateEntityYamlSync({
    entName,
    entType,
    storedYaml,
    formSnapshot,
    extraUnit,
    extraDeviceClass,
    extraIcon,
    isYamlOnlyMode: typeSelector.isYamlOnlyMode,
    resultMsg,
    resultOk,
    dismissAfter,
    slotEditor,
    triggerForm,
  })

  watch(yamlSync.formTouched, (dirty) => setOrchestratorBuilderDirty('template', dirty), {
    immediate: true,
  })
  onScopeDispose(() => setOrchestratorBuilderDirty('template', false))

  const showIncompleteYamlBanner = computed(() => {
    const yaml = yamlSync.yamlPreview.value
    if (editingId.value) {
      const item = savedList.value.find((i) => i.id === editingId.value)
      if (item?.yamlComplete === false || item?.yamlSource === 'stub') return true
    }
    return isIncompleteTemplateYaml(yaml, false) || hasOrchestratorPlaceholder(String(yaml || ''))
  })

  const buildSlotMappingPayload = () => slotEditor.buildSlotMappingPayload(entType.value)

  const opsBridge: { doSync: (item: Record<string, unknown>) => Promise<void> } = {
    doSync: async () => {},
  }

  const operations = useTemplateEntityOperations({
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
    haConfigReadable: haConfigReadableRef,
    importFlow,
    entName,
    entType,
    storedYaml,
    pasteYamlName,
    pasteYamlHaConfigId,
    pasteYamlEntityId,
    saving,
    formSnapshot,
    formSignature: yamlSync.formSignature,
    buildSlotMappingPayload,
    yamlValidation,
    resetForm,
    editItem: (item) => crudBridge.editItem(item),
  })

  opsBridge.doSync = operations.doSync

  const crud = useTemplateEntityCrud({
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
    yamlPreview: yamlSync.yamlPreview,
    haConfigReadable: haConfigReadableRef,
    savedList,
    slots: slotEditor.slots,
    triggerShowRawYaml: triggerForm.triggerShowRawYaml,
    triggerSensorForm: triggerForm.triggerSensorForm,
    extraUnit,
    extraDeviceClass,
    extraIcon,
    formSignature: yamlSync.formSignature,
    resetForm,
    buildSlotMappingPayload,
    loadList,
    dismissAfter,
    validateYaml: (yaml) => yamlValidation.validate(yaml),
    doSync: (item) => opsBridge.doSync(item),
    slotEditor,
    triggerForm,
    onSaved: () => emit('saved'),
  })

  crudBridge.editItem = crud.editItem

  const {
    haConfigStatus,
    configFileBusy,
    haConfigReady,
    haConfigReadable,
    loadHaConfigStatus,
    doWriteHaConfig,
    doPullHaConfig,
    doWriteHaConfigItem,
    doPullHaConfigItem,
  } = useTemplateEntityHaConfig({
    isAdmin,
    resultMsg,
    resultOk,
    dismissAfter,
    editingId,
    formTouched: yamlSync.formTouched,
    yamlPreview: yamlSync.yamlPreview,
    entName,
    entType,
    formSnapshot,
    formSignatureFn: yamlSync.formSignature,
    savedList,
    loadList,
    editItem: crud.editItem,
    buildSlotMappingPayload,
  })

  watch(
    haConfigReadable,
    (v) => {
      haConfigReadableRef.value = !!v
    },
    { immediate: true },
  )

  const configJson = useTemplateEntityConfigJson({
    resultMsg,
    resultOk,
    dismissAfter,
    entName,
    entType,
    storedYaml,
    extraUnit,
    extraDeviceClass,
    extraIcon,
    triggerShowRawYaml: triggerForm.triggerShowRawYaml,
    triggerSensorForm: triggerForm.triggerSensorForm,
    slots: slotEditor.slots,
    slotsList: slotEditor.slotsList,
    yamlPreview: yamlSync.yamlPreview,
    slotDefs: slotEditor.slotDefs,
    editingId,
    saving,
    formSnapshot,
    formSignature: yamlSync.formSignature,
    yamlValidation,
    savedList,
    loadList,
    editItem: crud.editItem,
    clearAllSlots: slotEditor.clearAllSlots,
    resetTriggerSensorForm: triggerForm.resetTriggerSensorForm,
    applyImportedTrigger: triggerForm.applyImportedTrigger,
    hydrateFromImport: slotEditor.hydrateFromImport,
  })

  const slotValidation = useTemplateEntitySlotValidation(entType, slotEditor.slots)

  const appliancePresetGroups = computed(() =>
    APPLIANCE_TYPE_GROUPS.filter((g) => g.id !== 'advanced').map((g) => ({
      id: g.id,
      label: g.label,
      options: g.typeIds
        .map((id) => TEMPLATE_APP_TYPES.find((t) => t.value === id))
        .filter(Boolean) as typeof TEMPLATE_APP_TYPES,
    })),
  )

  async function tryChangeEntType(nextType: string): Promise<boolean> {
    if (nextType === entType.value) return true
    const hasFilled = slotEditor.filledCount.value > 0
    if (entType.value && hasFilled) {
      const ok = await chrome.confirm(
        '切换家电类型将重置已填写的实体映射，是否继续？',
        '切换家电类型',
        { type: 'warning', confirmText: '继续切换' },
      )
      if (!ok) return false
    }
    entType.value = nextType
    typeSelector.onTypeChange()
    return true
  }

  function onEntTypeUpdate(nextType: string) {
    void tryChangeEntType(nextType)
  }

  async function applyAppliancePreset(typeId: string) {
    if (!(await tryChangeEntType(typeId))) return
    if (!entName.value.trim()) {
      const opt = typeSelector.appTypes.value.find((a) => a.value === typeId)
      if (opt?.shortLabel) entName.value = opt.shortLabel
    }
    flashBuilderResult(resultMsg, resultOk, '已应用家电模板', true, dismissAfter, 1800)
  }

  function startNew() {
    resetForm()
    flashBuilderResult(resultMsg, resultOk, '新建', true, dismissAfter, 2000)
  }

  async function close() {
    if (hasOrchestratorBuilderDirty()) {
      const ok = await chrome.confirm(
        '当前联动有未保存的修改，继续将丢弃更改。是否继续？',
        '未保存的修改',
        { confirmText: '丢弃并继续', cancelText: '继续编辑', type: 'warning' },
      )
      if (!ok) return
    }
    resetForm()
    emit('close')
  }

  useInitialOrchestratorEdit(() => props.initialEditId, savedList, editingId, crud.editItem)

  onMounted(() => {
    loadList()
    loadHaConfigStatus()
    discoverHA()
  })

  return {
    savedList,
    haImportList,
    haDiscovering,
    showDeleteConfirm,
    deleteTarget,
    deleteMode,
    deleting,
    resultMsg,
    resultOk,
    editingId,
    showSidebar,
    saving,
    syncing,
    syncStatusMap,
    repairProgress,
    deletingHaId,
    stubItemCount,
    showIncompleteYamlBanner,
    deleteLocalMessage,
    deleteHaMessage,
    entName,
    entType,
    storedYaml,
    extraUnit,
    extraDeviceClass,
    extraIcon,
    triggerShowRawYaml: triggerForm.triggerShowRawYaml,
    triggerSensorForm: triggerForm.triggerSensorForm,
    slots: slotEditor.slots,
    slotsList: slotEditor.slotsList,
    showAddSlot: slotEditor.showAddSlot,
    newIcon: slotEditor.newIcon,
    newLabel: slotEditor.newLabel,
    newHint: slotEditor.newHint,
    newDomain: slotEditor.newDomain,
    editSlotIdx: slotEditor.editSlotIdx,
    editSlot: slotEditor.editSlot,
    importingId,
    pasteYamlName,
    pasteYamlHaConfigId,
    pasteYamlEntityId,
    appTypes: typeSelector.appTypes,
    typeSelectGroups: typeSelector.typeSelectGroups,
    selectedTypeMeta: typeSelector.selectedTypeMeta,
    selectedTypeOption: typeSelector.selectedTypeOption,
    selectedKindLabel: typeSelector.selectedKindLabel,
    allDomains,
    isTriggerYaml: typeSelector.isTriggerYaml,
    isTriggerVisualMode: typeSelector.isTriggerVisualMode,
    isYamlOnlyMode: typeSelector.isYamlOnlyMode,
    canSwitchToTriggerVisual: typeSelector.canSwitchToTriggerVisual,
    filledCount: slotEditor.filledCount,
    namePlaceholder: typeSelector.namePlaceholder,
    hasMissingRequired: slotValidation.hasMissingRequired,
    missingRequiredCount: slotValidation.missingRequiredCount,
    slotIsRequired: slotValidation.slotIsRequired,
    slotRowClass: slotValidation.slotRowClass,
    appliancePresetGroups,
    applyAppliancePreset,
    onEntTypeUpdate,
    yamlPreview: yamlSync.yamlPreview,
    haConfigStatus,
    configFileBusy,
    haConfigReady,
    haConfigReadable,
    isAdmin,
    pasteYamlOpen: importFlow.pasteYamlOpen,
    pasteYamlText: importFlow.pasteYamlText,
    importFlowImporting: importFlow.importing,
    onTypeChange: typeSelector.onTypeChange,
    resetForm,
    removeSlot: slotEditor.removeSlot,
    openAddSlot: slotEditor.openAddSlot,
    cancelAddSlot: slotEditor.cancelAddSlot,
    startEditSlot: slotEditor.startEditSlot,
    applyEditSlot: slotEditor.applyEditSlot,
    cancelEditSlot: slotEditor.cancelEditSlot,
    confirmAddSlot: slotEditor.confirmAddSlot,
    startNew,
    switchToTriggerVisual: triggerForm.switchToTriggerVisual,
    switchToTriggerRawYaml: triggerForm.switchToTriggerRawYaml,
    switchFromTriggerRawYaml: triggerForm.switchFromTriggerRawYaml,
    copyYaml: yamlSync.copyYaml,
    saveBtn: crud.saveBtn,
    doSync: operations.doSync,
    doRepair: operations.doRepair,
    doRepairPull: operations.doRepairPull,
    doSyncAll: operations.doSyncAll,
    doRepairAll: operations.doRepairAll,
    doPullAll: operations.doPullAll,
    openPasteYaml: operations.openPasteYaml,
    closePasteYaml: operations.closePasteYaml,
    submitPasteYaml: operations.submitPasteYaml,
    applyStoredYamlToDb: operations.applyStoredYamlToDb,
    doReimport: operations.doReimport,
    doImport: operations.doImport,
    confirmHaDelete: operations.confirmHaDelete,
    editItem: crud.editItem,
    delConfirm: operations.delConfirm,
    closeDeleteConfirm: operations.closeDeleteConfirm,
    executeDelete: operations.executeDelete,
    close,
    doWriteHaConfig,
    doPullHaConfig,
    doWriteHaConfigItem,
    doPullHaConfigItem,
    loadList,
    discoverHA,
    exportConfigJson: configJson.exportConfigJson,
    openConfigJsonImport: configJson.openConfigJsonImport,
    onConfigJsonFileChange: configJson.onConfigJsonFileChange,
    configImportInput: configJson.configImportInput,
    importConfigJsonAndSave: configJson.importConfigJsonAndSave,
  }
}
