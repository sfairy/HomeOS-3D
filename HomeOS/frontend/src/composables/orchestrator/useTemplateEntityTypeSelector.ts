/**
 * 模板实体类型选择与模式判定 composable
 *
 * 模块：orchestrator（联动器）
 * 职责：
 *  - 派生家电类型选项 / 分组 / 选中类型元信息
 *  - 计算 YAML 模式相关标志（触发式 / 可视化 / 纯 YAML）
 *  - 处理类型切换：清理槽位、迁移到触发式或 YAML 导入模式
 * 依赖：template-entity-slot-labels.util（选项与分组）、template-yaml-parser.util、template-trigger-sensor.util
 */
import { computed, type Ref } from 'vue'
import { getApplianceType } from '@homeos/shared'
import { flashBuilderResult } from '@/composables/orchestrator/useBuilderUtils'
import {
  getAppTypeOptions,
  getAppTypeOptionGroups,
} from '@/utils/template/entity-slot-labels.util'
import { isTriggerBasedTemplateYaml } from '@/utils/template/yaml-parser.util'
import { canVisualEditTriggerYaml } from '@/utils/template/trigger-sensor.util'
import type { useTemplateEntitySlotEditor } from '@/composables/orchestrator/useTemplateEntitySlotEditor'
import type { useTemplateEntityTriggerForm } from '@/composables/orchestrator/useTemplateEntityTriggerForm'

type SlotEditor = ReturnType<typeof useTemplateEntitySlotEditor>
type TriggerForm = ReturnType<typeof useTemplateEntityTriggerForm>

/** 类型选择器依赖项 */
interface TemplateEntityTypeSelectorDeps {
  /** 实体类型 ref */
  entType: Ref<string>
  /** 存储 YAML ref */
  storedYaml: Ref<string>
  /** 当前编辑 id ref */
  editingId: Ref<string | null>
  /** 扩展单位 ref */
  extraUnit: Ref<string>
  /** 扩展 device_class ref */
  extraDeviceClass: Ref<string>
  /** 扩展图标 ref */
  extraIcon: Ref<string>
  /** 结果消息 ref */
  resultMsg: Ref<string>
  /** 结果是否成功 ref */
  resultOk: Ref<boolean>
  /** 自动消失回调 */
  dismissAfter: (ms?: number) => void
  /** 槽位编辑器（仅取定义、清空、按类型初始化） */
  slotEditor: Pick<SlotEditor, 'slotDefs' | 'clearAllSlots' | 'initSlotsForType'>
  /** 触发式传感器表单（仅取模式/表单/重置/加载/uniqueId 派生） */
  triggerForm: Pick<
    TriggerForm,
    | 'triggerShowRawYaml'
    | 'triggerSensorForm'
    | 'resetTriggerSensorForm'
    | 'ensureUniqueIdFromName'
    | 'loadTriggerSensorFromYaml'
  >
}

/**
 * 模板实体类型选择与模式 computed composable 入口
 * @param deps 依赖项
 * @returns 类型选项、选中类型元信息、模式标志、onTypeChange 切换处理
 */
export function useTemplateEntityTypeSelector(deps: TemplateEntityTypeSelectorDeps) {
  const {
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
  } = deps

  const { slotDefs, clearAllSlots, initSlotsForType } = slotEditor
  const {
    triggerShowRawYaml,
    triggerSensorForm,
    resetTriggerSensorForm,
    loadTriggerSensorFromYaml,
    ensureUniqueIdFromName,
  } = triggerForm

  /** 所有家电类型选项列表 */
  const appTypes = computed(() => getAppTypeOptions())
  /** 家电类型分组（用于下拉分组展示） */
  const appTypeGroups = computed(() => getAppTypeOptionGroups())
  /** 类型下拉分组数据：将 deployMode 映射为 'Helper'/'YAML' 提示 */
  const typeSelectGroups = computed(() =>
    appTypeGroups.value.map((g) => ({
      id: g.id,
      label: g.label,
      options: g.options.map((o) => ({
        id: o.value,
        label: o.label,
        // 提示信息按部署模式派生：helper 显示 'Helper'，config_yaml 显示 'YAML'
        hint:
          o.deployMode === 'helper'
            ? 'Helper'
            : o.deployMode === 'config_yaml'
              ? 'YAML'
              : undefined,
        sub: o.platform,
        keywords: o.keywords,
      })),
    })),
  )
  /** 选中类型的元信息（kind、deployMode 等） */
  const selectedTypeMeta = computed(() => getApplianceType(entType.value))
  /** 选中类型对应的选项对象 */
  const selectedTypeOption = computed(() => appTypes.value.find((a) => a.value === entType.value))
  /** 选中类型的 kind 中文标签：control → 可控制、display → 状态展示 */
  const selectedKindLabel = computed(() => {
    const k = selectedTypeMeta.value?.kind
    if (k === 'control') return '可控制'
    if (k === 'display') return '状态展示'
    return ''
  })

  /** 当前 YAML 是否为触发式模板（含 trigger 配置） */
  const isTriggerYaml = computed(() => isTriggerBasedTemplateYaml(storedYaml.value))
  /** 是否处于触发式传感器可视化模式 */
  const isTriggerVisualMode = computed(
    () => entType.value === 'trigger_sensor' && !triggerShowRawYaml.value,
  )
  /** 是否处于纯 YAML 模式（触发器原始 YAML、yaml_import、未定义槽位的类型） */
  const isYamlOnlyMode = computed(() => {
    if (entType.value === 'trigger_sensor') return triggerShowRawYaml.value
    if (entType.value === 'yaml_import') return true
    if (isTriggerYaml.value) return true
    // 类型非空但不在槽位定义表中：只能走 YAML 模式
    return !!(entType.value && !slotDefs[entType.value as keyof typeof slotDefs])
  })
  /** 是否允许从纯 YAML 切换到触发式可视化（仅当 YAML 可被可视化编辑时） */
  const canSwitchToTriggerVisual = computed(
    () =>
      entType.value === 'yaml_import' &&
      storedYaml.value?.trim() &&
      canVisualEditTriggerYaml(storedYaml.value),
  )
  /** 名称输入框占位符：基于选中类型示例生成「如：xxx」 */
  const namePlaceholder = computed(() => {
    const opt = appTypes.value.find((a) => a.value === entType.value)
    if (!opt) return '实体名称'
    // 去掉非中文/英文/数字字符，使示例更简洁
    const example = opt.label.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').trim() || opt.label
    return `如：${example}`
  })
  /**
   * 类型切换处理：清理旧模式状态、迁移到新模式
   * @sideEffect 触发式模式清空槽位并派生 uniqueId；含 trigger 的非 YAML 类型迁移到 trigger_sensor
   */
  function onTypeChange() {
    if (entType.value === 'trigger_sensor') {
      clearAllSlots()
      // 编辑已有项时保留原 triggerEntityId；新建时重置表单
      if (!triggerSensorForm.triggerEntityId && !editingId.value) resetTriggerSensorForm()
      ensureUniqueIdFromName()
      return
    }
    // 当前 YAML 含 trigger 但类型不是 yaml_import/trigger_sensor：尝试迁移到可视化触发器
    if (
      isTriggerYaml.value &&
      entType.value !== 'yaml_import' &&
      entType.value !== 'trigger_sensor'
    ) {
      if (canVisualEditTriggerYaml(storedYaml.value)) {
        loadTriggerSensorFromYaml(storedYaml.value)
        entType.value = 'trigger_sensor'
        return
      }
      // 无法可视化时回退到 yaml_import，并提示用户
      flashBuilderResult(
        resultMsg,
        resultOk,
        '含 trigger 的模板请使用「触发式模板传感器」或 YAML 导入模式',
        false,
        dismissAfter,
        2500,
      )
      entType.value = 'yaml_import'
      return
    }
    // yaml_import 或无对应槽位定义：仅清理槽位
    if (entType.value === 'yaml_import' || !slotDefs[entType.value as keyof typeof slotDefs]) {
      clearAllSlots()
      return
    }
    // 普通家电类型：重置触发器表单并按类型初始化槽位
    resetTriggerSensorForm()
    initSlotsForType(entType.value)
    // 新建时清空扩展字段，避免上一类型残留
    if (!editingId.value) {
      extraUnit.value = ''
      extraDeviceClass.value = ''
      extraIcon.value = ''
    }
  }

  return {
    appTypes,
    typeSelectGroups,
    selectedTypeMeta,
    selectedTypeOption,
    selectedKindLabel,
    isTriggerYaml,
    isTriggerVisualMode,
    isYamlOnlyMode,
    canSwitchToTriggerVisual,
    namePlaceholder,
    onTypeChange,
  }
}