/** 智能代理与消息通道 REST API 封装 */
import { apiDelete, apiGet, apiPost, apiPut } from './client'
import { agentChatStream, normalizeResult } from './agent-stream'

export { agentChatStream }
export type { AgentStreamCallbacks, AgentStreamHandle } from './agent-stream'

/** 代理心跳检测结果 */
export interface AgentPingResult {
  /** 后端是否可达 */
  ok: boolean
  /** 实际使用的 LLM 供应商标识 */
  provider: string
  /** 实际使用的模型名（mock / 未配置时为空） */
  model?: string
  /** 代理是否就绪可对话 */
  ready: boolean
  /** 计费口径（元 / 百万 token），source 说明来源 */
  pricing?: {
    inputMissCNY: number
    inputHitCNY: number
    outputCNY: number
    /** provider-default / fallback-deepseek / env */
    source: string
  }
  /** 每日预算配置 */
  budget?: {
    dailyTokenBudget: number
    dailyCostBudgetCNY: number
    source: string
  } | null
  /** 当前登录用户今日用量 */
  usageToday?: {
    day: string
    promptTokens: number
    completionTokens: number
    totalTokens: number
    costCNY: number
    llmRuns: number
    dailyTokenBudget: number
    dailyCostBudgetCNY: number
    budgetSource: string
  } | null
}

/** 单次工具调用轨迹 */
export interface AgentToolCallTrace {
  name: string
  arguments: Record<string, unknown>
  resultPreview: string
}

/** 代理对话结局 */
export type AgentOutcome = 'answer' | 'success' | 'failed' | 'blocked'

/** 操作音效类型（后端 `earcon` 字段；confirm 表示「正在等用户确认」） */
export type AgentEarcon = 'success' | 'error' | 'confirm' | null

/** 对话附件（目前只有摄像头快照） */
export interface AgentChatAttachment {
  kind: 'image'
  /** 可直接喂给 `<img src>` 的同源地址（不含 token） */
  url: string
  entityId?: string
  name?: string
}

/** 结构化确认信息：前端据此渲染「确认 / 取消」按钮 */
export interface AgentChatConfirmation {
  kind: string
  summary: string
  confirmText: string
  cancelText: string
  expiresInSeconds?: number
}

/** 代理对话返回结果 */
export interface AgentChatResult {
  /** 回复正文 */
  reply: string
  /** 是否需要语音播报 */
  speak: boolean
  /** 服务端合成的音频 URL（签名 + 10 分钟有效）；为空表示走本机 / HA 播报 */
  ttsUrl?: string
  /** 对话结局：answer(直接回答) / success(任务成功) / failed(失败) / blocked(被拦截) */
  outcome: AgentOutcome
  /** 提示音类型：success / error / confirm / null */
  earcon: AgentEarcon
  /** 实际使用的 LLM 供应商标识 */
  provider: string
  /** 实际使用的模型名（后端可能不返回） */
  model?: string
  /** 对话总轮数 */
  rounds: number
  /** 本轮工具调用明细 */
  toolCalls: AgentToolCallTrace[]
  /** 附件（摄像头快照等）；为空表示纯文本回复 */
  attachments?: AgentChatAttachment[]
  /** 需要用户确认时的结构化信息；前端渲染确认 / 取消按钮 */
  confirmation?: AgentChatConfirmation
  /** 耗时分布（毫秒） */
  timing: { llmMs: number; toolMs: number; totalMs: number }
  /** Token 用量与预估成本 */
  usage: {
    promptTokens: number
    completionTokens: number
    cachedTokens: number
    estimatedCostCNY: number
    /** 计价口径来源：provider-default / fallback-deepseek / env */
    pricingSource?: string
  }
}

/** 消息通道状态结果 */
export interface ChannelsStatusResult {
  email: {
    enabled: boolean
    configured: boolean
    error?: string
  }
  webpush: {
    enabled: boolean
    configured: boolean
    subscriptionCount?: number
    vapidPublicKey?: string
    error?: string
  }
  wecom?: {
    enabled: boolean
    configured: boolean
    corpId?: string
    agentId?: number
    error?: string
  }
}

/** 流式对话回调：token 增量 / 工具轨迹 / 最终结果 / 错误 */
/** 探测代理服务心跳。 */
export async function agentPing() {
  const pingResponse = await apiGet<AgentPingResult>('/agent/ping')
  return pingResponse.data
}

/** 服务端 TTS 试听参数（省略字段表示沿用当前语音配置） */
export interface AgentTtsPreviewOptions {
  text?: string
  engine?: 'edge' | 'openai'
  voice?: string
  rate?: number
  pitch?: number
  /** OpenAI 兼容接入点（草稿值：不必先保存就能试听） */
  apiBase?: string
  /** OpenAI 兼容密钥（草稿值；后端只用于本次合成，不落库） */
  apiKey?: string
  /** OpenAI 兼容模型名（草稿值） */
  model?: string
}

/** 服务端 TTS 试听结果 */
export interface AgentTtsPreviewResult {
  ok: boolean
  /** 可直接喂给 `<audio src>` 的签名 URL */
  ttsUrl: string
  cacheKey: string
  exp: number
}

/** 签发一段试听音频（设置页「试听」用）。 */
export async function previewAgentTts(options: AgentTtsPreviewOptions = {}) {
  const response = await apiPost<AgentTtsPreviewResult>('/agent/tts/preview', {
    ...(options.text ? { text: options.text } : {}),
    ...(options.engine ? { engine: options.engine } : {}),
    ...(options.voice ? { voice: options.voice } : {}),
    ...(typeof options.rate === 'number' ? { rate: options.rate } : {}),
    ...(typeof options.pitch === 'number' ? { pitch: options.pitch } : {}),
    ...(options.apiBase ? { apiBase: options.apiBase } : {}),
    ...(options.apiKey ? { apiKey: options.apiKey } : {}),
    ...(options.model ? { model: options.model } : {}),
  })
  return response.data
}

/** 发送对话消息给 AI 代理。 */
export async function agentChat(
  message: string,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  sessionId?: string,
) {
  const chatResponse = await apiPost<AgentChatResult>('/agent/chat', {
    message,
    ...(history?.length ? { history } : {}),
    ...(sessionId ? { sessionId } : {}),
  })
  return normalizeResult(chatResponse.data)
}

/** 查询消息通道状态。 */
export async function channelsStatus() {
  const channelsResponse = await apiGet<ChannelsStatusResult>('/channels/status')
  return channelsResponse.data
}

/** 发送一条通道测试消息；`state` 为 ok / failed / skipped（区分「没配好」与「发不出去」）。 */
export async function testMessageChannel(channel: 'email' | 'webpush' | 'wecom', message?: string) {
  const response = await apiPost<{ ok: boolean; state: string; results: Record<string, string> }>('/channels/test', {
    channel,
    ...(message ? { message } : {}),
  })
  return response.data
}

// --- 自动化：家规 / 计划任务 / 巡检 / 诊断 ------------------------------------
// 这些数据由设置页独立即时 CRUD（不进布局保存），与对话里 LLM 调用的工具
// 共用同一套后端服务，因此冲突检测、权限与执行日志天然一致。

/** 家规：房间长期无人时提醒 / 自动关停低危设备 */
/** 写入者快照（只用于展示「谁改的」，不参与权限判定） */
export interface AgentActorSnapshot {
  userId?: string | null
  username?: string | null
}

export interface AgentPolicyRule {
  id: string
  name: string
  description: string
  enabled: boolean
  /** 规则类型（当前只有 watchdog 空转巡检） */
  kind: string
  /** 目标区域；空字符串表示全屋 */
  areaId: string
  areaName: string
  /** 目标设备域（light / switch / fan / climate） */
  targetDomains: string[]
  /** 无人多少分钟后命中；0 表示沿用主动管家全局阈值 */
  idleMinutes: number
  /** 命中后是否自动关停（仍受主动管家总开关约束） */
  autoClose: boolean
  actionTool: string
  actionArgs: Record<string, unknown>
  /** 最后一次修改者（userId / username）；空对象表示由系统写入 */
  updatedBy: AgentActorSnapshot
  lastTriggeredAt: string | null
  triggerCount: number
  createdAt: string | null
  updatedAt: string | null
}

/** 家规冲突项（同区域 + 设备域重叠） */
export interface AgentPolicyConflict {
  ruleId: string
  ruleName: string
  overlapDomains: string[]
  reason: string
}

/** 家规写入请求（``forceOverride`` 仅在确认覆盖冲突时传 true） */
export interface AgentPolicyPayload {
  name?: string
  description?: string
  enabled?: boolean
  areaId?: string
  areaName?: string
  targetDomains?: string[]
  idleMinutes?: number
  autoClose?: boolean
  forceOverride?: boolean
}

/** 家规写入结果 */
export interface AgentPolicyWriteResult {
  ok: boolean
  message?: string
  rule?: AgentPolicyRule
  conflicts?: AgentPolicyConflict[]
}

/** 计划任务：一次性或周期执行一个设备动作 */
export interface AgentScheduledTask {
  id: string
  name: string
  enabled: boolean
  scheduleType: 'ONCE' | 'RECURRING'
  /** 一次性任务的执行时间（ISO） */
  runAt: string | null
  /** 周期任务的 cron 表达式 */
  cron: string
  timezone: string
  actionTool: string
  actionArgs: Record<string, unknown>
  /** 前置条件（如 ``{ expectedState: {...} }``，已满足则跳过） */
  precondition: Record<string, unknown>
  lastRunAt: string | null
  nextRunAt: string | null
  /** success / skipped / failed；空字符串表示还没跑过 */
  lastStatus: string
  lastError: string
  runCount: number
  /** 最后一次修改者（userId / username）；空对象表示由系统写入 */
  updatedBy: AgentActorSnapshot
  createdAt: string | null
}

/** 长期记忆 API（类型与函数在 agent-memory.ts，拆分以满足单文件行数门禁） */
export type { AgentMemoryItem, AgentMemoryPayload } from './agent-memory'
export {
  clearAgentMemories,
  forgetAgentMemory,
  listAgentMemories,
  saveAgentMemory,
} from './agent-memory'

/** 计划任务执行日志 */
export interface AgentScheduleLog {
  id: string
  taskId: string
  startedAt: string | null
  finishedAt: string | null
  status: string
  message: string
  result: Record<string, unknown>
}

/** 计划任务写入请求 */
export interface AgentSchedulePayload {
  name?: string
  enabled?: boolean
  scheduleType?: 'ONCE' | 'RECURRING'
  /** 一次性任务：ISO 时间 */
  runAt?: string
  /** 一次性任务：多少分钟后执行 */
  delayMinutes?: number
  /** 周期任务：每天 HH:MM */
  time?: string
  /** 周期任务：5 段 cron 表达式 */
  cron?: string
  timezone?: string
  actionTool?: string
  actionArgs?: Record<string, unknown>
  precondition?: Record<string, unknown>
}

/** 计划任务写入结果 */
export interface AgentScheduleWriteResult {
  ok: boolean
  message?: string
  task?: AgentScheduledTask
}

/** 巡检关停动作 */
interface AgentPatrolAction {
  entityId: string
  name: string
  areaId: string
  ok: boolean
  message: string
  ruleIds: string[]
}

/** 手动巡检结果 */
export interface AgentPatrolResult {
  ok: boolean
  /** disabled：看门狗未开启时整次跳过 */
  skipped?: string
  sent?: boolean
  message?: string
  /** 人类可读的告警信号 */
  signals: string[]
  /** 实际执行的自动关停动作 */
  actions: AgentPatrolAction[]
  /** 本轮判定的无人区域 */
  areas: Array<{ id: string; name: string; idleMinutes: number | null }>
}

/** 诊断日志条目（离线 / 恢复 / 低电量 / 连接） */
export interface AgentDiagnosticEvent {
  id: string
  level: string
  message: string
  timestamp: string | null
  /** offline / recovered / low_battery / connectivity */
  kind: string
  entityId: string
  context: Record<string, unknown>
}

/** 列出家规（最新在前）。 */
export async function listAgentPolicies() {
  const response = await apiGet<{ items: AgentPolicyRule[] }>('/agent/policies')
  return response.data?.items ?? []
}

/** 创建家规；冲突且未强制覆盖时返回 `ok=false` + `conflicts`。 */
export async function createAgentPolicy(payload: AgentPolicyPayload) {
  const response = await apiPost<AgentPolicyWriteResult>('/agent/policies', payload)
  return response.data
}

/** 更新家规（只改传入字段）。 */
export async function updateAgentPolicy(policyId: string, payload: AgentPolicyPayload) {
  const response = await apiPut<AgentPolicyWriteResult>(`/agent/policies/${encodeURIComponent(policyId)}`, payload)
  return response.data
}

/** 启用 / 停用家规；省略 `enabled` 表示取反。 */
export async function toggleAgentPolicy(policyId: string, enabled?: boolean) {
  const response = await apiPost<AgentPolicyWriteResult>(
    `/agent/policies/${encodeURIComponent(policyId)}/toggle`,
    enabled === undefined ? {} : { enabled },
  )
  return response.data
}

/** 删除家规。 */
export async function deleteAgentPolicy(policyId: string) {
  const response = await apiDelete<{ ok: boolean; message?: string }>(`/agent/policies/${encodeURIComponent(policyId)}`)
  return response.data
}

/** 列出计划任务。 */
export async function listAgentSchedules() {
  const response = await apiGet<{ items: AgentScheduledTask[] }>('/agent/schedules')
  return response.data?.items ?? []
}

/** 创建计划任务（一次性 / 周期）。 */
export async function createAgentSchedule(payload: AgentSchedulePayload) {
  const response = await apiPost<AgentScheduleWriteResult>('/agent/schedules', payload)
  return response.data
}

/** 更新计划任务（会重算下次执行时间）。 */
export async function updateAgentSchedule(taskId: string, payload: AgentSchedulePayload) {
  const response = await apiPut<AgentScheduleWriteResult>(`/agent/schedules/${encodeURIComponent(taskId)}`, payload)
  return response.data
}

/** 启用 / 停用计划任务；省略 `enabled` 表示取反。 */
export async function toggleAgentSchedule(taskId: string, enabled?: boolean) {
  const response = await apiPost<AgentScheduleWriteResult>(
    `/agent/schedules/${encodeURIComponent(taskId)}/toggle`,
    enabled === undefined ? {} : { enabled },
  )
  return response.data
}

/** 删除计划任务。 */
export async function deleteAgentSchedule(taskId: string) {
  const response = await apiDelete<{ ok: boolean; message?: string }>(`/agent/schedules/${encodeURIComponent(taskId)}`)
  return response.data
}

/** 查询计划任务执行日志（最新在前）。 */
export async function listAgentScheduleLogs(taskId = '', limit = 20) {
  const response = await apiGet<{ items: AgentScheduleLog[] }>('/agent/schedules/logs', {
    params: { taskId, limit },
  })
  return response.data?.items ?? []
}

/**
 * 手动执行一次主动巡检。
 *
 * @param autoClose 省略表示跟随「主动管家」自动关停总开关；`false` 表示只检查不动设备。
 */
export async function runAgentPatrol(autoClose?: boolean) {
  const query = autoClose === undefined ? '' : `?autoClose=${autoClose ? 'true' : 'false'}`
  const response = await apiPost<AgentPatrolResult>(`/agent/patrol/run${query}`)
  return response.data
}

/** 查询诊断日志（离线 / 恢复 / 低电量 / 连接），按实体可见性过滤。 */
export async function listAgentDiagnostics(
  options: { category?: string; level?: string; kind?: string; search?: string; limit?: number } = {},
) {
  const response = await apiGet<{ items: AgentDiagnosticEvent[] }>('/agent/diagnostics', {
    params: {
      category: options.category ?? '',
      level: options.level ?? '',
      kind: options.kind ?? '',
      search: options.search ?? '',
      limit: options.limit ?? 50,
    },
  })
  return response.data?.items ?? []
}

/** 立即执行一次计划任务（不改排程；结果照常写执行日志）。 */
export async function runAgentScheduleNow(taskId: string) {
  const response = await apiPost<{ ok: boolean; status: string; message: string }>(
    `/agent/schedules/${encodeURIComponent(taskId)}/run`,
  )
  return response.data
}

/** 主动巡检结果（手动触发） */
export interface AgentProactiveRunResult {
  ok: boolean
  /** disabled / quiet_hours / dnd / cooldown */
  skipped?: string
  sent?: boolean
  message?: string
  signals: string[]
}

/**
 * 手动执行一次主动巡检。
 *
 * 返回 `skipped`（disabled / quiet_hours / dnd / cooldown）时不会推送；
 * 用于保存配置后立刻验证通知链路，不必等下一个巡检周期。
 */
export async function runAgentProactive() {
  const response = await apiPost<AgentProactiveRunResult>('/agent/proactive/run')
  return response.data
}

/** 清空服务端会话上下文：前端「清空记录 / 删除对话」必须同步，否则下一句仍带上文。 */
export async function clearAgentSession(sessionId: string) {
  const response = await apiPost<{ ok: boolean }>('/agent/session/clear', { sessionId })
  return response.data
}

/* 学习与观测：实现移到 `agent-learning.ts`，这里保留聚合出口，调用方 import 路径不变。 */
export type {
  AgentCommandCacheEntry,
  AgentCommandMetrics,
  AgentHabitCandidate,
  AgentIntentReplay,
  AgentLearningConfig,
} from './agent-learning'
export {
  actOnAgentHabit,
  deleteAgentCommandCache,
  deleteAgentLearning,
  getAgentCommandMetrics,
  getAgentIntentReplay,
  listAgentCommandCache,
  listAgentHabits,
  listAgentLearning,
  revertAgentLearning,
  setAgentLearningActive,
} from './agent-learning'
