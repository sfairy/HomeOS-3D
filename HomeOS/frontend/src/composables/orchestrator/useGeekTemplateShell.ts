/**
 * 模板实体壳：薄封装 useTemplateEntityBuilderCore + 画布布局。
 */
import { computed, ref, watch } from 'vue'
import { useTemplateEntityBuilderCore } from '@/composables/orchestrator/useTemplateEntityBuilderCore'
import { TEMPLATE_APP_TYPES, templateTypeIcon } from '@/utils/template/entity-slot-defs.util'
import {
  layoutApplianceStarGraph,
  layoutTriggerSensorChain,
  layoutYamlImportPlaceholder,
  type TemplateCanvasNodeData,
} from '@/utils/template/geek-template-layout'
import type { Edge, Node } from '@vue-flow/core'

type GeekTemplateCanvasMode = 'pick_type' | 'appliance' | 'trigger_sensor' | 'yaml_import'

/** useGeekTemplateShell：函数，按签名入参返回处理结果。 */
export function useGeekTemplateShell(
  props: { initialEditId?: string; embedded?: boolean },
  emit: (e: 'close' | 'saved') => void,
) {
  const core = useTemplateEntityBuilderCore(props, emit)
  const selectedNodeId = ref('')
  const selectedSlotKey = ref<string | null>(null)
  const showSlotDrawer = ref(false)

  const canvasMode = computed<GeekTemplateCanvasMode>(() => {
    if (core.isYamlOnlyMode.value) return 'yaml_import'
    if (core.isTriggerVisualMode.value) return 'trigger_sensor'
    const t = core.entType.value
    if (t && t !== 'yaml_import' && t !== 'trigger_sensor') return 'appliance'
    return 'pick_type'
  })

  const typeLabel = computed(() => {
    const opt = TEMPLATE_APP_TYPES.find((t) => t.value === core.entType.value)
    return opt?.label || core.entType.value || '选择类型'
  })

  const typeIcon = computed(() => templateTypeIcon(core.entType.value))

  const canvasGraph = computed((): { nodes: Node<TemplateCanvasNodeData>[]; edges: Edge[] } => {
    if (canvasMode.value === 'yaml_import') return layoutYamlImportPlaceholder()
    if (canvasMode.value === 'trigger_sensor') {
      const f = core.triggerSensorForm
      const logicDetail =
        f.stateMode === 'power_threshold'
          ? `${f.thresholdOp || '>='} ${f.threshold ?? 80}W → ${f.onValue}/${f.offValue}`
          : f.stateMode === 'direct'
            ? '直接引用 states()'
            : '自定义 Jinja'
      return layoutTriggerSensorChain({
        triggerDetail: f.triggerEntityId || '选择触发实体',
        logicDetail,
        sensorDetail: `${f.platform || 'sensor'} · ${f.uniqueId || 'unique_id'}`,
      })
    }
    if (canvasMode.value === 'appliance') {
      return layoutApplianceStarGraph({
        typeLabel: typeLabel.value,
        typeIcon: typeIcon.value,
        slots: core.slotsList.map((s) => ({
          key: s._key || s.key,
          label: s.label,
          hint: s.hint,
          icon: s.icon,
          required: core.slotIsRequired(s._key || s.key),
        })),
        slotValues: core.slots,
      })
    }
    return { nodes: [], edges: [] }
  })

  function onSelectSlot(slotKey: string) {
    selectedSlotKey.value = slotKey
    showSlotDrawer.value = true
    selectedNodeId.value = `slot_${slotKey}`
    const idx = core.slotsList.findIndex((s) => (s._key || s.key) === slotKey)
    if (idx >= 0) core.cancelAddSlot()
  }

  function onSelectRoot() {
    closeSlotDrawer()
    if (core.showAddSlot.value) core.cancelAddSlot()
    selectedNodeId.value = 'template_root'
  }

  function closeSlotDrawer() {
    showSlotDrawer.value = false
    selectedSlotKey.value = null
  }

  function openAddSlot() {
    closeSlotDrawer()
    selectedNodeId.value = ''
    core.openAddSlot()
  }

  /** 添加成功后回到根节点，保持槽位列表可见 */
  function confirmAddSlot() {
    const ok = core.confirmAddSlot()
    if (ok) onSelectRoot()
    return ok
  }

  /** 从槽位编辑 / 新建表单回到列表（不收起整个 Inspector） */
  function backToSlotList() {
    closeSlotDrawer()
    if (core.showAddSlot.value) core.cancelAddSlot()
    selectedNodeId.value = 'template_root'
  }

  const activeSlot = computed(() => {
    if (!selectedSlotKey.value) return null
    const idx = core.slotsList.findIndex((s) => (s._key || s.key) === selectedSlotKey.value)
    if (idx < 0) return null
    return { idx, slot: core.slotsList[idx] }
  })

  watch(canvasMode, () => {
    selectedNodeId.value = ''
    closeSlotDrawer()
    if (core.showAddSlot.value) core.cancelAddSlot()
  })

  watch(activeSlot, (slot) => {
    if (!slot && showSlotDrawer.value) closeSlotDrawer()
  })

  function removeSlotAndClose(idx: number) {
    core.removeSlot(idx)
    if (!activeSlot.value) {
      closeSlotDrawer()
      selectedNodeId.value = 'template_root'
    }
  }

  return {
    ...core,
    removeSlot: removeSlotAndClose,
    openAddSlot,
    confirmAddSlot,
    backToSlotList,
    canvasMode,
    canvasGraph,
    selectedNodeId,
    selectedSlotKey,
    showSlotDrawer,
    activeSlot,
    typeLabel,
    typeIcon,
    onSelectSlot,
    onSelectRoot,
    closeSlotDrawer,
  }
}
