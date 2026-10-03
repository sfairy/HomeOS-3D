/**
 * 脚本 CRUD / 执行参数工具
 *
 * 职责：
 * - 复用 crud.util 的通用保存校验、保存载荷、执行历史、执行结果消息，按脚本维度薄封装。
 * - 提供脚本执行弹窗的变量转换与默认值初始化。
 *
 * 依赖：@/utils/orchestrator/crud.util 的通用编排器 CRUD 实现。
 *
 * 注意：脚本执行变量名 / selector 名为配置值，不翻译；仅消息文案使用简体中文。
 */
import {
  validateOrchestratorForSave,
  buildOrchestratorSavePayload,
  mapOrchestratorExecutionHistory,
  orchestratorResultMessage,
} from '@/utils/orchestrator/crud.util'

/** 保存前校验脚本表单（动作数、YAML 完整性），返回错误文案或 null */
export function validateScriptForSave(actionCount: number, yamlText: string): string | null {
  return validateOrchestratorForSave({
    kind: 'script',
    input: { actionCount, yamlText },
  })
}

/** 构造脚本保存 API 载荷：name / yaml / runOnHa / 可选 geekGraph */
export function buildScriptSavePayload(
  name: string,
  yaml: string,
  runOnHa: boolean,
  geekGraph?: unknown,
): Record<string, string | boolean | unknown> {
  return buildOrchestratorSavePayload({
    kind: 'script',
    name,
    yaml,
    runOnHa,
    ...(geekGraph !== undefined ? { geekGraph } : {}),
  })
}

/** 把脚本执行历史行映射为通用展示结构 */
export function mapScriptExecutionHistory(row: {
  id: string
  scriptName: string
  success: boolean
  executedAt: string
  executed: number
  total: number
}) {
  return mapOrchestratorExecutionHistory('script', row)
}

/** 脚本执行结果消息：根据 success / executed / total 输出文案与 ok 状态 */
export function scriptExecuteResultMessage(
  success: boolean,
  executed?: number,
  total?: number,
): { message: string; ok: boolean } {
  return orchestratorResultMessage({ kind: 'script', success, executed, total })
}

/** 执行弹窗字段定义：name / selector / default */
export interface ScriptExecField {
  name: string
  selector?: string
  default?: unknown
}

/**
 * 将执行弹窗表单值转为 API variables。
 *
 * 按 selector 做类型转换：number → Number，boolean → 'true'/true 判定，其它原样。
 */
export function buildScriptExecVariables(
  execFields: ScriptExecField[],
  execVars: Record<string, unknown>,
): Record<string, unknown> {
  const vars: Record<string, unknown> = {}
  for (const f of execFields) {
    const v = execVars[f.name]
    if (f.selector === 'number') vars[f.name] = Number(v)
    else if (f.selector === 'boolean') vars[f.name] = v === 'true' || v === true
    else vars[f.name] = v
  }
  return vars
}

/**
 * 从脚本 fields 初始化执行弹窗默认值。
 *
 * 无 default 时：boolean 选择器回退为 'false'，其它回退为空字符串。
 */
export function initScriptExecVars(execFields: ScriptExecField[]): Record<string, unknown> {
  const vars: Record<string, unknown> = {}
  for (const f of execFields) {
    vars[f.name] = f.default ?? (f.selector === 'boolean' ? 'false' : '')
  }
  return vars
}
