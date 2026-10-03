/**
 * 模板实体槽位编辑 composable
 *
 * 模块：orchestrator（联动器）
 * 职责：
 *  - 维护模板实体的 slot 字典与 slot 列表（含自定义 slot）
 *  - 提供槽位的增删改、按类型初始化、从历史项/导入数据回填
 *  - 构建 slot mapping payload 供保存与同步
 * 依赖：@homeos/shared（slot payload 构建、回填）、template-entity-slot-labels.util（标签与提示）
 */
import { ref, reactive, computed } from 'vue'
import { buildSlotPayload, hydrateTemplateEntitySlots } from '@homeos/shared'
import { getSlotDefs, customSlotHint } from '@/utils/template/entity-slot-labels.util'
import { mapEntityIdsToSlots } from '@/utils/template/yaml-parser.util'
import { TEMPLATE_SLOT_DEFS } from '@/utils/template/entity-slot-defs.util'

/**
 * 模板实体 slot 列表编辑 composable 入口（useTemplateEntityBuilderCore 拆分模块）
 * @returns slot 字典、slot 列表、新增/编辑表单状态、增删改与回填方法
 */
export function useTemplateEntitySlotEditor() {
  /** slot 字典：key -> entity_id */
  const slots = reactive<Record<string, string>>({})
  /** slot 列表：定义每个槽位的展示信息（label/hint/domain/icon） */
  const slotsList = reactive<
    Array<{
      key: string
      label: string
      hint: string
      domain: string
      icon: string
      _key?: string
      custom?: boolean
      required?: boolean
    }>
  >([])
  /** 是否展示新增 slot 弹层 */
  const showAddSlot = ref(false)
  /** 新建 slot 的图标 */
  const newIcon = ref('📌')
  /** 新建 slot 的标签 */
  const newLabel = ref('')
  /** 新建 slot 的提示 */
  const newHint = ref('')
  /** 新建 slot 的 domain */
  const newDomain = ref('sensor')
  /** 当前编辑 slot 的索引（-1 表示未进入编辑） */
  const editSlotIdx = ref(-1)
  /** 编辑 slot 的临时表单 */
  const editSlot = reactive({ icon: '', label: '', hint: '', domain: '' })
  // 自定义 slot 的自增计数器，避免 key 冲突
  let slotCounter = 0

  /** 按已有 custom_N 同步计数器（hydrate 后必须调用，否则会撞 key） */
  function syncSlotCounter() {
    let max = 0
    for (const s of slotsList) {
      for (const raw of [s._key, s.key]) {
        const m = /^custom_(\d+)$/.exec(String(raw || ''))
        if (m) max = Math.max(max, Number(m[1]) || 0)
      }
    }
    slotCounter = max
  }

  /** 槽位定义表（按 entType 索引），用于判断某类型是否支持槽位模式 */
  const slotDefs = TEMPLATE_SLOT_DEFS
  /** 已填值的 slot 数量 */
  const filledCount = computed(() => slotsList.filter((s) => slots[s._key || s.key]).length)

  /** 重置新增/编辑表单到默认值 */
  function resetSlotForm() {
    showAddSlot.value = false
    editSlotIdx.value = -1
    newIcon.value = '📌'
    newLabel.value = ''
    newHint.value = ''
    newDomain.value = 'sensor'
  }

  /** 清空所有 slot：字典与列表都重置，计数器归零 */
  function clearAllSlots() {
    Object.keys(slots).forEach((k) => delete slots[k])
    slotsList.length = 0
    slotCounter = 0
    resetSlotForm()
  }

  /**
   * 按类型初始化 slot 列表
   * @param type 实体类型
   * @sideEffect 清空旧 slot，按类型定义填充新 slot 列表
   */
  function initSlotsForType(type: string) {
    clearAllSlots()
    const defs = getSlotDefs(type) as Array<{
      key: string
      label: string
      hint: string
      domain: string
      icon: string
    }>
    // _key 与 key 一致，便于后续通过 slots[key] 取值
    defs.forEach((d) => slotsList.push({ ...d, _key: d.key }))
  }

  /** 计算 slot 部分的签名（用于父级 formSignature 合并） */
  function getSignaturePart() {
    return {
      slots: { ...slots },
      slotsList: slotsList.map((s) => ({ ...s })),
    }
  }

  /**
   * 移除指定索引的 slot
   * @param idx slot 在 slotsList 中的索引
   * @sideEffect 同步删除字典中的 key；若处于编辑则退出编辑
   */
  function removeSlot(idx: number) {
    const s = slotsList[idx]
    if (s) {
      const key = s._key || s.key
      delete slots[key]
      slotsList.splice(idx, 1)
      if (editSlotIdx.value === idx) editSlotIdx.value = -1
    }
  }

  /** 打开新增 slot 弹层（同时关闭编辑） */
  function openAddSlot() {
    cancelEditSlot()
    showAddSlot.value = true
  }

  /** 取消新增 slot */
  function cancelAddSlot() {
    resetSlotForm()
  }
  /**
   * 进入指定 slot 的编辑模式
   * @param idx slot 索引
   * @sideEffect 关闭新增弹层，将 slot 数据拷贝到 editSlot
   */
  function startEditSlot(idx: number) {
    showAddSlot.value = false
    const s = slotsList[idx]
    if (s) {
      editSlotIdx.value = idx
      editSlot.icon = s.icon || ''
      editSlot.label = s.label || ''
      editSlot.hint = s.hint || ''
      editSlot.domain = s.domain || ''
    }
  }

  /**
   * 应用编辑结果到指定 slot
   * @param idx slot 索引
   * @sideEffect 仅更新非空字段，避免清空已有值
   */
  function applyEditSlot(idx: number) {
    const s = slotsList[idx]
    if (s) {
      s.icon = editSlot.icon || s.icon
      s.label = editSlot.label.trim() || s.label
      s.hint = editSlot.hint || s.hint
      s.domain = editSlot.domain || s.domain
    }
    editSlotIdx.value = -1
  }

  /** 取消编辑 slot */
  function cancelEditSlot() {
    editSlotIdx.value = -1
  }

  /**
   * 确认新增自定义 slot
   * @returns 是否添加成功（标签为空时返回 false）
   * @sideEffect 生成不冲突的 custom_N 并加入 slotsList
   */
  function confirmAddSlot() {
    if (!newLabel.value.trim()) return false
    syncSlotCounter()
    slotCounter++
    let finalKey = `custom_${slotCounter}`
    while (slotsList.some((s) => (s._key || s.key) === finalKey) || finalKey in slots) {
      slotCounter++
      finalKey = `custom_${slotCounter}`
    }
    slotsList.push({
      key: finalKey,
      _key: finalKey,
      icon: newIcon.value || '📌',
      label: newLabel.value.trim(),
      hint: newHint.value || customSlotHint(),
      domain: newDomain.value,
      custom: true,
    })
    resetSlotForm()
    return true
  }

  /**
   * 从历史项回填 slot：基于 YAML 与 slotMapping 重建 slot 列表与字典
   * @param params 实体类型、YAML、原始 item、解析后的 uniqueId/entityIds
   * @sideEffect 当 slotMapping 为空时回退到按 entityIds 自动映射
   */
  function hydrateFromItem(params: {
    entType: string
    yaml: string
    item: { slotMapping?: unknown; type?: string; name?: string }
    parsed: { uniqueId?: string; entityIds?: string[] }
  }) {
    const { entType, yaml, item, parsed } = params
    if (!slotDefs[entType as keyof typeof slotDefs]) return

    const hydrated = hydrateTemplateEntitySlots(entType, yaml, item.slotMapping, {
      storedType: item.type,
      entName: item.name,
      uniqueId: parsed.uniqueId,
    })
    slotsList.length = 0
    // 合并本地化标签，使 hydrate 后的 slot 显示中文标签
    const localized = getSlotDefs(entType) as Array<{ key: string; label: string; hint: string }>
    const labelMap = Object.fromEntries(localized.map((d) => [d.key, d]))
    hydrated.slotsList.forEach((s) => {
      const loc = labelMap[s.key]
      slotsList.push(loc ? { ...s, label: loc.label, hint: loc.hint } : { ...s })
    })
    Object.keys(slots).forEach((k) => delete slots[k])
    Object.assign(slots, hydrated.slots)
    // 回填后 slot 字典仍为空：基于 entityIds 自动映射兜底
    if (!Object.keys(hydrated.slots).length) {
      Object.assign(
        slots,
        mapEntityIdsToSlots(
          parsed.entityIds || [],
          slotDefs[entType as keyof typeof slotDefs] as unknown as Array<{
            key: string
            domain?: string
            [k: string]: unknown
          }>,
          yaml,
          entType,
        ),
      )
    }
    syncSlotCounter()
  }

  /**
   * 从导入数据回填 slot（与 hydrateFromItem 类似，但来源是导入 JSON）
   * @param data 类型、YAML、名称、slotMapping
   * @sideEffect 不清空 slotsList，追加导入项并合并本地化标签
   */
  function hydrateFromImport(data: {
    type: string
    yaml: string
    name: string
    slotMapping?: unknown
  }) {
    if (!slotDefs[data.type as keyof typeof slotDefs]) return
    const hydrated = hydrateTemplateEntitySlots(data.type, data.yaml, data.slotMapping, {
      storedType: data.type,
      entName: data.name,
    })
    const localized = getSlotDefs(data.type) as Array<{ key: string; label: string; hint: string }>
    const labelMap = Object.fromEntries(localized.map((d) => [d.key, d]))
    hydrated.slotsList.forEach((s) => {
      const loc = labelMap[s.key]
      slotsList.push(loc ? { ...s, label: loc.label, hint: loc.hint } : { ...s })
    })
    Object.assign(slots, hydrated.slots)
    syncSlotCounter()
  }

  /**
   * 构建保存用的 slot mapping payload
   * @param entType 实体类型
   * @returns 槽位映射 payload；yaml_import/trigger_sensor 或无定义时返回 undefined
   */
  function buildSlotMappingPayload(entType: string) {
    if (!entType || entType === 'yaml_import' || entType === 'trigger_sensor') return undefined
    if (!slotDefs[entType as keyof typeof slotDefs]) return undefined
    const payload = buildSlotPayload(
      { ...slots },
      slotsList.map((s) => ({ ...s })) as never,
    )
    return payload.mapping && Object.keys(payload.mapping).length ? payload : undefined
  }

  return {
    slots,
    slotsList,
    showAddSlot,
    newIcon,
    newLabel,
    newHint,
    newDomain,
    editSlotIdx,
    editSlot,
    slotDefs,
    filledCount,
    resetSlotForm,
    clearAllSlots,
    initSlotsForType,
    getSignaturePart,
    removeSlot,
    openAddSlot,
    cancelAddSlot,
    startEditSlot,
    applyEditSlot,
    cancelEditSlot,
    confirmAddSlot,
    hydrateFromItem,
    hydrateFromImport,
    buildSlotMappingPayload,
  }
}