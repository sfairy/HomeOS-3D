/**
 * 触发式模板传感器表单 composable
 *
 * 模块：orchestrator（联动器）
 * 职责：
 *  - 维护触发式模板传感器（trigger_sensor）表单状态与原始 YAML 切换
 *  - 提供 YAML ↔ 表单双向同步：从 YAML 解析回填、将表单提交为 YAML
 *  - 处理唯一 id 自动派生（基于实体名规范化）
 * 依赖：template-trigger-sensor.util（表单默认值、YAML 解析/构建）
 */
import { ref, reactive, type Ref } from 'vue'
import {
  defaultTriggerSensorForm,
  parseTriggerSensorYaml,
  buildTriggerSensorYaml,
} from '@/utils/template/trigger-sensor.util'

/** 触发式模板传感器表单依赖项 */
interface TemplateEntityTriggerFormDeps {
  /** 实体名称 ref */
  entName: Ref<string>
  /** 实体类型 ref */
  entType: Ref<string>
  /** 存储 YAML 字符串 ref */
  storedYaml: Ref<string>
}

/**
 * 触发式模板传感器表单 composable 入口
 * @param deps 依赖项（实体名称、类型、存储 YAML）
 * @returns 表单状态、签名计算、YAML 解析/提交、模式切换方法
 */
export function useTemplateEntityTriggerForm(deps: TemplateEntityTriggerFormDeps) {
  const { entName, entType, storedYaml } = deps

  /** 是否展示原始 YAML 模式（true 时直接编辑 YAML，不显示可视化表单） */
  const triggerShowRawYaml = ref(false)
  /** 触发式传感器可视化表单数据 */
  const triggerSensorForm = reactive(defaultTriggerSensorForm())

  /** 计算表单签名（用于脏检测，由父级 formSignature 合并调用） */
  function getSignaturePart() {
    return {
      triggerShowRawYaml: triggerShowRawYaml.value,
      triggerSensorForm: { ...triggerSensorForm },
    }
  }

  /** 重置触发式传感器表单到默认值 */
  function resetTriggerSensorForm() {
    Object.assign(triggerSensorForm, defaultTriggerSensorForm())
    triggerShowRawYaml.value = false
  }

  /**
   * 从 YAML 字符串解析并回填触发式传感器表单
   * @param yamlStr YAML 字符串
   * @param meta 额外元信息（uniqueId 等）
   * @sideEffect 当 YAML 无法被识别为可视化结构时，自动切换到原始 YAML 模式
   */
  function loadTriggerSensorFromYaml(yamlStr: string, meta: Record<string, unknown> = {}) {
    const parsed = parseTriggerSensorYaml(yamlStr, meta)
    Object.assign(triggerSensorForm, defaultTriggerSensorForm(), parsed)
    // 无法识别为可视化结构时回退到原始 YAML 模式，避免表单丢失信息
    triggerShowRawYaml.value = !parsed.recognized
  }

  /**
   * 将表单数据提交为 YAML 并写回 storedYaml
   * @returns 当前 storedYaml（在 yaml-only 模式下不重写，原样返回）
   */
  function commitTriggerSensorYaml() {
    if (entType.value !== 'trigger_sensor' || triggerShowRawYaml.value) return storedYaml.value
    const y = buildTriggerSensorYaml(triggerSensorForm, entName.value)
    storedYaml.value = y
    return y
  }

  /**
   * 切换到触发式传感器可视化模式
   * @sideEffect 解析当前 YAML 回填表单；缺失 uniqueId 时基于实体名派生
   */
  function switchToTriggerVisual() {
    loadTriggerSensorFromYaml(storedYaml.value)
    entType.value = 'trigger_sensor'
    triggerShowRawYaml.value = false
    if (!triggerSensorForm.uniqueId && entName.value) {
      triggerSensorForm.uniqueId = entName.value
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^\w]/g, '')
    }
  }

  /**
   * 切换到原始 YAML 模式
   * @sideEffect 先将表单提交为 YAML，避免可视化模式下的编辑丢失
   */
  function switchToTriggerRawYaml() {
    storedYaml.value = buildTriggerSensorYaml(triggerSensorForm, entName.value)
    triggerShowRawYaml.value = true
  }

  /** 从原始 YAML 模式切回可视化：解析 YAML 回填表单 */
  function switchFromTriggerRawYaml() {
    loadTriggerSensorFromYaml(storedYaml.value)
    triggerShowRawYaml.value = false
  }

  /** 确保 uniqueId 存在：缺失时基于实体名派生（小写、下划线、去特殊字符） */
  function ensureUniqueIdFromName() {
    if (!triggerSensorForm.uniqueId && entName.value) {
      triggerSensorForm.uniqueId = entName.value
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^\w]/g, '')
    }
  }

  /**
   * 应用导入的触发式传感器数据
   * @param data 导入数据（triggerSensor 表单字段、是否原始 YAML 模式）
   * @sideEffect 重置表单后写入导入数据；非原始模式时同步提交为 YAML
   */
  function applyImportedTrigger(data: {
    triggerSensor?: Record<string, unknown>
    triggerShowRawYaml?: boolean
  }) {
    resetTriggerSensorForm()
    if (data.triggerSensor) {
      Object.assign(triggerSensorForm, defaultTriggerSensorForm(), data.triggerSensor)
    }
    triggerShowRawYaml.value = !!data.triggerShowRawYaml
    if (!triggerShowRawYaml.value) commitTriggerSensorYaml()
  }

  return {
    triggerShowRawYaml,
    triggerSensorForm,
    getSignaturePart,
    resetTriggerSensorForm,
    loadTriggerSensorFromYaml,
    commitTriggerSensorYaml,
    switchToTriggerVisual,
    switchToTriggerRawYaml,
    switchFromTriggerRawYaml,
    ensureUniqueIdFromName,
    applyImportedTrigger,
  }
}