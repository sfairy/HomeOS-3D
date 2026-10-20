/**
 * @file editor-actions.internals.ts
 * @module frontend/src/features/home-mode/composables
 */
/** 家居模式：动作段落编辑 */

import { computed, nextTick, reactive, ref, type Ref } from 'vue'
import { sceneEntityIdFromRecord, scriptEntityIdFromRecord } from '@/shared/utils/ha/scene-script.util'
import {
  useHomeModeItemExpansion,
  useHomeModeItemFocus,
} from './editor-expansion.internals'

interface HomeModeActionDraft {
  kind?: string
  entity_id?: string
  domain?: string
  service?: string
  delay?: number
  service_data?: string
}

interface HomeModeActionsDraft {
  actions?: HomeModeActionDraft[]
  isNew?: boolean
}

interface HomeModeActionsSectionProps {
  actionKindOptions: Array<{ id: string; label: string }>
  savedScenes: Array<{ id: string; name: string }>
  savedScripts: Array<{ id: string; name: string }>
  actionFocusEpoch: number
  actionFocusIndex: number | null
}

export function useHomeModeActionsSection(
  activeDraft: Ref<HomeModeActionsDraft>,
  props: HomeModeActionsSectionProps,
) {
  const dragIndex = ref<number | null>(null)
  const dragOverIndex = ref<number | null>(null)
  const advancedMap = reactive<Record<number, boolean>>({})
  const skipDomainCascade = ref(false)

  const actionCount = computed(() => activeDraft.value?.actions?.length ?? 0)
  const {
    isCompact,
    expandedAll,
    activeTabIndex,
    selectItem,
    focusItem,
    expandAll,
    collapseAll,
    syncIndexAfterMove,
  } = useHomeModeItemExpansion(actionCount)

  const cardRefs = ref<Record<number, HTMLElement>>({})

  function setCardRef(index: number, el: unknown) {
    if (el instanceof HTMLElement) cardRefs.value[index] = el
    else delete cardRefs.value[index]
  }

  const { pulseIndex } = useHomeModeItemFocus(
    () => props.actionFocusEpoch,
    () => props.actionFocusIndex,
    async (index) => {
      focusItem(index)
      await nextTick()
      await nextTick()
      const card = cardRefs.value[index]
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    },
  )

  const actionNavItems = computed(() =>
    (activeDraft.value?.actions ?? []).map((act, i) => {
      const kindLabel = props.actionKindOptions.find((k) => k.id === act.kind)?.label || act.kind
      const meta = actionDisplayLabel(act)
      const placeholder =
        meta === '未填写实体' ||
        meta === '未填写通知文案' ||
        meta === '未选择' ||
        meta === '未选择场景' ||
        meta === '未选择脚本'
      return {
        index: i,
        label: kindLabel,
        meta,
        placeholder,
      }
    }),
  )

  const renderedActions = computed(() => {
    const actions = activeDraft.value?.actions ?? []
    if (!isCompact.value || expandedAll.value) {
      return actions.map((act, aidx) => ({ act, aidx }))
    }
    if (activeTabIndex.value != null && actions[activeTabIndex.value]) {
      return [{ act: actions[activeTabIndex.value], aidx: activeTabIndex.value }]
    }
    return []
  })

  function onSecurityChange(act: HomeModeActionDraft) {
    act.domain = 'security'
    act.service = act.entity_id === 'disarmed' ? 'disarm' : 'arm'
  }

  function onDomainChange(act: HomeModeActionDraft) {
    if (skipDomainCascade.value) return
    act.service = ''
    act.entity_id = ''
  }

  function onEntityChange(act: HomeModeActionDraft, entityId: string) {
    act.service = ''
    if (entityId) {
      const parts = entityId.split('.')
      if (parts.length >= 2) {
        const newDomain = parts[0]
        if (act.domain !== newDomain) {
          skipDomainCascade.value = true
          act.domain = newDomain
          skipDomainCascade.value = false
        }
      }
    }
  }

  function onKindChange(act: HomeModeActionDraft) {
    if (act.kind === 'entity') {
      if (!act.domain && !act.entity_id && !act.service) {
        act.domain = ''
        act.entity_id = ''
        act.service = ''
      }
    } else {
      act.domain = ''
      act.entity_id = ''
      act.service = ''
    }
  }

  function actionDisplayLabel(act: HomeModeActionDraft) {
    if (act.kind === 'notify') return act.entity_id || '未填写通知文案'
    if (act.kind === 'security') {
      const map: Record<string, string> = {
        disarmed: '撤防',
        armed_home: '在家布防',
        armed_away: '外出布防',
        armed_night: '夜间布防',
      }
      return map[act.entity_id ?? ''] || '未选择'
    }
    if (act.kind === 'scene') {
      const s = props.savedScenes.find((x) => sceneEntityIdFromRecord(x) === act.entity_id)
      return s?.name || act.entity_id || '未选择场景'
    }
    if (act.kind === 'script') {
      const s = props.savedScripts.find((x) => scriptEntityIdFromRecord(x) === act.entity_id)
      return s?.name || act.entity_id || '未选择脚本'
    }
    return act.entity_id || '未填写实体'
  }

  function toggleAdvanced(advancedIndex: number) {
    advancedMap[advancedIndex] = !advancedMap[advancedIndex]
  }

  function moveAction(idx: number, actionIndex: number) {
    const actions = activeDraft.value.actions
    if (!actions) return
    const newIdx = idx + actionIndex
    if (newIdx < 0 || newIdx >= actions.length) return
    const [item] = actions.splice(idx, 1)
    actions.splice(newIdx, 0, item)
    syncIndexAfterMove(idx, newIdx)
  }

  function onDragStart(idx: number, dragFromIndex: DragEvent) {
    dragIndex.value = idx
    if (dragFromIndex.dataTransfer) {
      dragFromIndex.dataTransfer.effectAllowed = 'move'
      dragFromIndex.dataTransfer.setData('text/plain', String(idx))
    }
  }

  function onDragEnd() {
    if (
      dragIndex.value !== null &&
      dragOverIndex.value !== null &&
      dragIndex.value !== dragOverIndex.value
    ) {
      const from = dragIndex.value
      const actions = activeDraft.value.actions
      if (!actions) return
      const [item] = actions.splice(from, 1)
      const insertIdx = dragOverIndex.value > from ? dragOverIndex.value - 1 : dragOverIndex.value
      actions.splice(insertIdx, 0, item)
      syncIndexAfterMove(from, insertIdx)
    }
    dragIndex.value = null
    dragOverIndex.value = null
  }

  function onDragOver(idx: number, hoverIndex: DragEvent) {
    if (dragIndex.value === null) return
    dragOverIndex.value = idx
    if (hoverIndex.dataTransfer) {
      hoverIndex.dataTransfer.dropEffect = 'move'
    }
  }

  function onDragLeave() {
    dragOverIndex.value = null
  }

  return {
    dragIndex,
    dragOverIndex,
    advancedMap,
    isCompact,
    expandedAll,
    activeTabIndex,
    selectItem,
    expandAll,
    collapseAll,
    pulseIndex,
    setCardRef,
    actionNavItems,
    renderedActions,
    onSecurityChange,
    onDomainChange,
    onEntityChange,
    onKindChange,
    actionDisplayLabel,
    toggleAdvanced,
    moveAction,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
  }
}
