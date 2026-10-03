/**
 * 极客脚本图 → Script YAML 编译
 *
 * 职责：把脚本 GeekGraph 编译为 HA Script YAML，复用 buildScriptYaml。
 *
 * 依赖：
 * - @/utils/orchestrator/script-yaml-builder.util 的 buildScriptYaml。
 * - @/types/orchestrator-builder 的脚本字段表单类型。
 * - @/utils/geek-automation/graph-types 的 GeekGraph。
 *
 * 注意：编译产出的 YAML key 与 HA 脚本字段对齐，不翻译。
 */
import { buildScriptYaml } from '@/utils/orchestrator/script-yaml-builder.util'
import type { ScriptFieldForm } from '@/types/orchestrator-builder'
import type { GeekGraph } from '@/utils/geek-automation/graph-types'

/**
 * 把脚本 GeekGraph 编译为 HA Script YAML。
 *
 * @param graph 脚本流程图（含名称、mode、actions）
 * @param fields 脚本字段表单（供 buildScriptYaml 拼装）
 * @param desc 脚本描述文案
 * @param sbData 可选的 sandbox 数据
 * @returns HA Script YAML 字符串
 */
export function compileGeekScriptGraphToYaml(
  graph: GeekGraph,
  fields: ScriptFieldForm[],
  desc: string,
  sbData: Record<string, unknown> | null = null,
): string {
  return buildScriptYaml({
    scriptName: graph.name,
    scriptDesc: desc,
    scriptMode: graph.mode || 'single',
    fields,
    actions: graph.actions || [],
    sbData,
  })
}
