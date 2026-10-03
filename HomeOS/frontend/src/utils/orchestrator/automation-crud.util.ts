/**
 * 自动化 CRUD 适配层（薄封装）。
 *
 * 所属模块：联动器 / Orchestrator
 * 职责：作为自动化（automation）模块对外的 CRUD 入口，将自动化特定的入参
 *   适配为通用联动器校验/载荷/历史映射函数所需的结构，再委托
 *   `orchestrator-crud.util` 中的实现完成具体逻辑。
 * 依赖：`@/utils/orchestrator/crud.util` 提供通用实现。
 *
 * 设计说明：本文件仅做"类型/形状"适配，不重复业务逻辑，便于自动化与
 *   脚本（script）等不同 kind 共享同一套底层校验/序列化代码。
 */
import {
  mapOrchestratorExecutionHistory,
  orchestratorResultMessage,
} from '@/utils/orchestrator/crud.util'

/**
 * 将后端返回的自动化执行历史行映射为前端展示所需结构。
 *
 * @param row - 原始历史记录行，包含 id、名称、自动化 ID、是否成功、执行时间、错误信息等。
 * @returns 通用联动器历史展示对象。
 */
export function mapAutomationExecutionHistory(row: {
  id: string
  name?: string
  automationId?: string
  success: boolean
  executedAt: string
  error?: string
}) {
  return mapOrchestratorExecutionHistory('automation', row)
}

/**
 * 根据触发执行结果数据生成展示用的消息与成功标志。
 *
 * 调用场景：手动触发自动化后，根据后端返回结果展示 Toast / 通知文案。
 *
 * @param data - 后端返回的结果对象，可能包含 message 与 success 字段。
 * @returns 包含 `message`（展示文案）与 `ok`（是否成功）的结果对象。
 */
export function automationTriggerResultMessage(
  data: { message?: string; success?: boolean } | undefined,
): { message: string; ok: boolean } {
  return orchestratorResultMessage({ kind: 'automation', data })
}