/**
 * @file useGeekYamlPreview.ts
 * @module composables/orchestrator
 * @description 联动器 Builder YAML 预览高亮 composable。
 *
 * 职责：将原始 YAML 字符串先格式化美化、再做语法高亮，供预览面板渲染。
 *
 * 依赖：
 * - vue（computed、Ref、ComputedRef）
 * - @/utils/orchestrator/yaml-preview-helpers.util（Yaml 美化与高亮工具）
 */
import { computed, type Ref, type ComputedRef } from 'vue'
import { beautifyYamlForPreview, highlightYamlForPreview } from '@/utils/orchestrator/yaml-preview-helpers.util'

/**
 * 构建 YAML 预览的 computed 高亮字符串。
 *
 * @param yamlPreview 原始 YAML 文本（ref 或 computed，空值视为空串）
 * @returns 高亮后的 HTML 字符串 computed
 */
export function useGeekYamlPreview(yamlPreview: Ref<string> | ComputedRef<string>) {
  return computed(() => highlightYamlForPreview(beautifyYamlForPreview(String(yamlPreview.value || ''))))
}
