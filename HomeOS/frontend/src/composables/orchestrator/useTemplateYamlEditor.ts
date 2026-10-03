/**
 * 模板实体 YAML 预览编辑器 composable
 *
 * 模块：orchestrator（联动器）
 * 职责：
 *  - 在触发式传感器/纯 YAML/家电槽位三种模式下计算 YAML 预览
 *  - 家电槽位模式下若编辑加载后槽位未完全回填，暂用库中完整 YAML 避免预览缺参
 * 依赖：yaml-preview-helpers.util（预览选择）、@homeos/shared（实体 id 提取）
 */
import { computed, type ComputedRef, type Ref } from 'vue'
import { pickYamlPreview } from '@/utils/orchestrator/yaml-preview-helpers.util'
import { APPLIANCE_TYPE_IDS, extractEntityIdsFromTemplateYaml } from '@homeos/shared'

/** 模板 YAML 编辑器配置项 */
interface TemplateYamlEditorOpts {
  /** 实体类型 ref */
  entType: Ref<string>
  /** 是否原始 YAML 模式 ref */
  triggerShowRawYaml: Ref<boolean>
  /** 触发式传感器表单数据 */
  triggerSensorForm: unknown
  /** 实体名称 ref */
  entName: Ref<string>
  /** 存储 YAML ref */
  storedYaml: Ref<string>
  /** 表单是否脏 ref */
  formTouched: Ref<boolean> | ComputedRef<boolean>
  /** 是否纯 YAML 模式 ref */
  isYamlOnlyMode: Ref<boolean> | ComputedRef<boolean>
  /** 生成家电模式 YAML 的函数 */
  buildGeneratedYaml: () => string
  /** 构建触发式传感器 YAML 的函数 */
  buildTriggerSensorYaml: (form: unknown, name: string) => string
}

/**
 * TemplateEntityBuilder YAML 预览逻辑
 * @param opts 配置项
 * @returns yamlPreview 计算后的预览 YAML
 */
export function useTemplateYamlEditor(opts: TemplateYamlEditorOpts) {
  const {
    entType,
    triggerShowRawYaml,
    triggerSensorForm,
    entName,
    storedYaml,
    formTouched,
    isYamlOnlyMode,
    buildGeneratedYaml,
    buildTriggerSensorYaml,
  } = opts

  /** YAML 预览：根据当前模式分支计算最终展示文本 */
  const yamlPreview = computed(() => {
    // 触发式传感器可视化模式：实时由表单构建 YAML
    if (entType.value === 'trigger_sensor' && !triggerShowRawYaml.value) {
      return buildTriggerSensorYaml(triggerSensorForm, entName.value)
    }
    // 纯 YAML 模式优先返回存储值，便于用户直接编辑
    if (isYamlOnlyMode.value && storedYaml.value) {
      return storedYaml.value
    }
    // 家电槽位：实时生成；编辑加载后若槽位未完全回填，暂用库中完整 YAML 避免预览缺参
    if (entType.value && APPLIANCE_TYPE_IDS.has(entType.value)) {
      const generated = buildGeneratedYaml()
      if (storedYaml.value && !formTouched.value) {
        const storedCount = extractEntityIdsFromTemplateYaml(storedYaml.value).length
        const generatedCount = extractEntityIdsFromTemplateYaml(generated).length
        // 存储值实体更多说明槽位尚未完全回填，使用存储值保证预览完整
        if (storedCount > generatedCount) return storedYaml.value
      }
      return generated
    }
    return pickYamlPreview(storedYaml.value, formTouched.value, buildGeneratedYaml())
  })

  return { yamlPreview }
}