/**
 * 脚本图 / 表单 → HA Script YAML 构建器
 *
 * 职责：把脚本字段表单与动作序列编译为 HA Script YAML（alias / description / mode / fields / sequence）。
 *
 * 依赖：
 * - ./yaml-preview-helpers.util 的 YAML 标量与占位工具。
 * - ./action-yaml-builder.util 的动作 YAML 行生成。
 * - @/types/orchestrator-builder 的脚本构建入参类型。
 *
 * 注意：YAML key 与 HA Script 字段对齐，不翻译；空序列以占位符返回。
 */
import { formatYamlScalar, yamlPreviewPlaceholder } from './yaml-preview-helpers.util'
import { formatOrchestratorActionYamlLines } from './action-yaml-builder.util'
import type { BuildScriptYamlInput } from '@/types/orchestrator-builder'
/**
 * 从脚本表单 / 图画布状态生成 HA script YAML。
 *
 * 入参：
 * - scriptName / scriptDesc：脚本别名与描述。
 * - scriptMode：single / restart / queued / single（HA 脚本模式）。
 * - fields：脚本输入字段（selector + default + description）。
 * - actions：动作序列，note 类型自动过滤。
 * - sbData：脚本字段面板下钻数据。
 *
 * 返回：YAML 字符串。无任何可执行动作时返回占位文案。
 */
export function buildScriptYaml({
  scriptName,
  scriptDesc,
  scriptMode,
  fields,
  actions,
  sbData,
}: BuildScriptYamlInput) {
  const executable = actions.filter((a) => a && String(a.type || '') !== 'note')
  if (executable.length === 0) return yamlPreviewPlaceholder('addActions')
  const L: string[] = []
  L.push(`alias: ${formatYamlScalar(scriptName || '脚本')}`)
  if (scriptDesc) L.push(`description: ${formatYamlScalar(scriptDesc)}`)
  L.push(`mode: ${scriptMode}`)
  if (fields.length > 0) {
    L.push('fields:')
    for (const f of fields) {
      if (!f.name) continue
      L.push(`  ${f.name}:`)
      if (f.description) L.push(`    description: ${formatYamlScalar(f.description)}`)
      L.push('    selector:')
      L.push(`      ${f.selector}:`)
      const opts = f.selectorOptions
      if (opts && typeof opts === 'object' && !Array.isArray(opts)) {
        for (const [ok, ov] of Object.entries(opts)) {
          if (ov == null) continue
          if (typeof ov === 'object') {
            L.push(`        ${ok}: ${JSON.stringify(ov)}`)
          } else {
            L.push(`        ${ok}: ${formatYamlScalar(ov)}`)
          }
        }
      }
      if (f.default !== '' && f.default !== undefined) {
        if (f.selector === 'number') L.push(`    default: ${formatYamlScalar(Number(f.default))}`)
        else if (f.selector === 'boolean') L.push(`    default: ${f.default === 'true'}`)
        else L.push(`    default: ${formatYamlScalar(f.default)}`)
      }
    }
  }
  L.push('sequence:')
  for (const a of executable) {
    L.push(
      ...formatOrchestratorActionYamlLines(a, {
        dataPanel: sbData,
        panelOpen: !!a._showSbParams,
        variant: 'script',
      }),
    )
  }
  return L.join('\n')
}
