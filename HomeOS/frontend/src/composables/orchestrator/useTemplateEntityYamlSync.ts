/**
 * 模板实体 YAML 同步与脏检测 composable
 *
 * 模块：orchestrator（联动器）
 * 职责：
 *  - 计算模板实体表单签名，对比 formSnapshot 判定表单是否脏
 *  - 根据实体类型派生预览 YAML（触发式传感器 / 纯 YAML / 家电槽位）
 *  - 提供复制 YAML 方法
 * 依赖：template-trigger-sensor.util、@homeos/shared（家电 YAML 构建）、useTemplateYamlEditor
 */
import { computed, type Ref } from 'vue'
import { buildTriggerSensorYaml } from '@/utils/template/trigger-sensor.util'
import { buildApplianceTemplateYaml } from '@homeos/shared'
import { useTemplateYamlEditor } from '@/composables/orchestrator/useTemplateYamlEditor'
import { copyBuilderYaml } from '@/composables/orchestrator/useBuilderUtils'
import type { useTemplateEntitySlotEditor } from '@/composables/orchestrator/useTemplateEntitySlotEditor'
import type { useTemplateEntityTriggerForm } from '@/composables/orchestrator/useTemplateEntityTriggerForm'

type SlotEditor = ReturnType<typeof useTemplateEntitySlotEditor>
type TriggerForm = ReturnType<typeof useTemplateEntityTriggerForm>

/** YAML 同步依赖项 */
interface TemplateEntityYamlSyncDeps {
  /** 实体名称 ref */
  entName: Ref<string>
  /** 实体类型 ref */
  entType: Ref<string>
  /** 存储 YAML ref */
  storedYaml: Ref<string>
  /** 表单快照（保存后写入，用于脏检测） */
  formSnapshot: Ref<string>
  /** 扩展单位 ref */
  extraUnit: Ref<string>
  /** 扩展 device_class ref */
  extraDeviceClass: Ref<string>
  /** 扩展图标 ref */
  extraIcon: Ref<string>
  /** 是否纯 YAML 模式 ref */
  isYamlOnlyMode: Ref<boolean>
  /** 结果消息 ref */
  resultMsg: Ref<string>
  /** 结果是否成功 ref */
  resultOk: Ref<boolean>
  /** 自动消失回调 */
  dismissAfter: (ms?: number) => void
  /** 槽位编辑器（仅取 slots/slotsList/签名部分） */
  slotEditor: Pick<SlotEditor, 'slots' | 'slotsList' | 'getSignaturePart'>
  /** 触发式传感器表单（仅取展示模式/表单/签名部分） */
  triggerForm: Pick<TriggerForm, 'triggerShowRawYaml' | 'triggerSensorForm' | 'getSignaturePart'>
}

/**
 * 模板实体 YAML 预览与表单脏检测 composable 入口
 * @param deps 依赖项
 * @returns formSignature / formTouched / buildGeneratedYaml / yamlPreview / copyYaml
 */
export function useTemplateEntityYamlSync(deps: TemplateEntityYamlSyncDeps) {
  const {
    entName,
    entType,
    storedYaml,
    formSnapshot,
    extraUnit,
    extraDeviceClass,
    extraIcon,
    isYamlOnlyMode,
    resultMsg,
    resultOk,
    dismissAfter,
    slotEditor,
    triggerForm,
  } = deps

  const { slots, slotsList, getSignaturePart: getSlotSignaturePart } = slotEditor
  const {
    triggerShowRawYaml,
    triggerSensorForm,
    getSignaturePart: getTriggerSignaturePart,
  } = triggerForm

  /** 计算表单签名：合并名称/类型/存储 YAML/触发器签名/槽位签名/扩展字段 */
  function formSignature() {
    return JSON.stringify({
      entName: entName.value,
      entType: entType.value,
      storedYaml: storedYaml.value,
      ...getTriggerSignaturePart(),
      ...getSlotSignaturePart(),
      extraUnit: extraUnit.value,
      extraDeviceClass: extraDeviceClass.value,
      extraIcon: extraIcon.value,
    })
  }

  /** 表单脏检测：snapshot 非空且与当前签名不一致时视为脏 */
  const formTouched = computed(() => {
    if (!storedYaml.value && !formSnapshot.value) return false
    return formSnapshot.value !== formSignature()
  })

  /**
   * 根据实体类型派生 YAML 字符串
   * @returns 当前模式下的 YAML；类型为空时返回提示文本
   */
  function buildGeneratedYaml() {
    if (!entType.value) return '# 选择家电类型后显示 YAML'
    // 触发式传感器可视化模式：由表单实时构建
    if (entType.value === 'trigger_sensor' && !triggerShowRawYaml.value) {
      return buildTriggerSensorYaml(triggerSensorForm, entName.value)
    }
    // 纯 YAML 模式：直接返回存储值
    if (isYamlOnlyMode.value) return storedYaml.value || '# 请编辑 YAML 配置'
    // 家电槽位模式：基于槽位与扩展字段构建
    return buildApplianceTemplateYaml({
      entType: entType.value,
      entName: entName.value,
      slots: { ...slots },
      slotsList: slotsList.map((s) => ({ ...s })) as never,
      extraUnit: extraUnit.value,
      extraDeviceClass: extraDeviceClass.value,
      extraIcon: extraIcon.value,
    })
  }

  // 委托 useTemplateYamlEditor 计算最终预览（处理槽位未完全回填等边界情况）
  const { yamlPreview } = useTemplateYamlEditor({
    entType,
    triggerShowRawYaml,
    triggerSensorForm,
    entName,
    storedYaml,
    formTouched,
    isYamlOnlyMode,
    buildGeneratedYaml,
    buildTriggerSensorYaml: (form, name) =>
      buildTriggerSensorYaml(form as Record<string, unknown>, name),
  })

  /** 复制当前 YAML 预览到剪贴板 */
  function copyYaml() {
    copyBuilderYaml(yamlPreview.value, resultMsg, resultOk, { dismissAfter })
  }

  return {
    formSignature,
    formTouched,
    buildGeneratedYaml,
    yamlPreview,
    copyYaml,
  }
}