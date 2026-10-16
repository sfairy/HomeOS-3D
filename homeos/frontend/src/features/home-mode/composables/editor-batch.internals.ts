/**
 * @file editor-batch.internals.ts
 * @module frontend/src/features/home-mode/composables
 */
/** 家居模式编辑器：批量添加设备动作 */

import { ref, type Ref } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { domainIndexToArray, getEntityDisplayName } from '@/shared/entity/utils/derived.util'
import type { ModeDraft } from './draft.internals'

/** 家居模式编辑器：批量添加设备动作 */
export function useHomeModeEditorBatch(options: {
  activeDraft: Ref<ModeDraft | null | undefined>
  focusActionAt: (index: number) => void
}) {
  const entitiesStore = useEntitiesStore()
  const showBatch = ref(false)
  const batchDomain = ref<string>('')
  const batchService = ref<string>('')
  const batchChecked = ref<string[]>([])

  function batchEntities() {
    const domain = batchDomain.value
    if (!domain) return []
    return domainIndexToArray(entitiesStore.domainEntityIndex.get(domain))
      .sort()
      .map((entityId) => {
        const entity = entitiesStore.entities[entityId]
        return { eid: entityId, name: getEntityDisplayName(entityId, entity) }
      })
  }

  function toggleBatchCheck(entityId: string) {
    const index = batchChecked.value.indexOf(entityId)
    if (index >= 0) batchChecked.value.splice(index, 1)
    else batchChecked.value.push(entityId)
  }

  function onBatchDomainChange() {
    batchService.value = ''
    batchChecked.value = []
  }

  function applyBatch() {
    const draft = options.activeDraft.value
    if (!draft || !batchDomain.value || !batchService.value) return
    const startLen = draft.actions.length
    for (const entityId of batchChecked.value) {
      draft.actions.push({
        kind: 'entity',
        entity_id: entityId,
        domain: batchDomain.value,
        service: batchService.value,
        delay: 0,
        service_data: '',
      })
    }
    if (draft.actions.length > startLen) {
      options.focusActionAt(draft.actions.length - 1)
    }
    batchChecked.value = []
    showBatch.value = false
  }

  function cancelBatch() {
    showBatch.value = false
    batchDomain.value = ''
    batchService.value = ''
    batchChecked.value = []
  }

  return {
    showBatch,
    batchDomain,
    batchService,
    batchChecked,
    batchEntities,
    toggleBatchCheck,
    onBatchDomainChange,
    applyBatch,
    cancelBatch,
  }
}
