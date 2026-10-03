/**
 * 联动器 CRUD 共用逻辑（automation / scene / script）
 *
 * 职责：
 * - 提供自动化 / 场景 / 脚本三类联动器共用的增删改查与保存前校验逻辑。
 * - 处理占位 entity_id 检测、场景实体校验、保存前的字段补全。
 *
 * 依赖：
 * - @homeos/shared 的占位 entity_id 检测工具。
 * - @/utils/orchestrator/scene-yaml-form.util 的场景实体校验。
 *
 * 注意：
 * - 联动器类型 key（automation / scene / script）为配置 key，不翻译。
 */
/** 联动器 CRUD 共用逻辑（automation / scene / script） */
import {
  findPlaceholderEntityIdsInYaml,
  hasOrchestratorPlaceholder,
} from '@homeos/shared'
import {
  validateSceneEntitiesForSave,
  type SceneEntityForm,
} from '@/utils/orchestrator/scene-yaml-form.util'
import {
  createOrchestratorItem,
  updateOrchestratorItem,
} from '@/services/api/orchestrator'
import { getApiErrorMessage } from '@/utils/core/error-message'

type OrchestratorCrudKind = 'automation' | 'scene' | 'script'

interface AutomationValidateInput {
  triggerCount: number
  actionCount: number
  yamlText: string
}

interface ScriptValidateInput {
  actionCount: number
  yamlText: string
}

interface SceneValidateInput {
  entities: SceneEntityForm[]
}

type OrchestratorValidateInput =
  | { kind: 'automation'; input: AutomationValidateInput }
  | { kind: 'script'; input: ScriptValidateInput }
  | { kind: 'scene'; input: SceneValidateInput }

/** 保存前校验（按 kind 分发） */
export function validateOrchestratorForSave(args: OrchestratorValidateInput): string | null {
  switch (args.kind) {
    case 'automation': {
      const { triggerCount, actionCount, yamlText } = args.input
      if (triggerCount === 0 || actionCount === 0) return '请添加触发器和动作'
      if (
        hasOrchestratorPlaceholder(yamlText) ||
        findPlaceholderEntityIdsInYaml(yamlText).length > 0
      ) {
        return 'YAML 含占位实体（_placeholder），请替换为真实 entity_id 后再保存'
      }
      return null
    }
    case 'script': {
      const { actionCount, yamlText } = args.input
      if (actionCount === 0) return '请至少添加一个动作'
      if (
        hasOrchestratorPlaceholder(yamlText) ||
        findPlaceholderEntityIdsInYaml(yamlText).length > 0
      ) {
        return 'YAML 含占位实体（_placeholder），请替换后再保存'
      }
      return null
    }
    case 'scene': {
      return validateSceneEntitiesForSave(args.input.entities)
    }
  }
}

/** 保存 API 前清洗场景实体列表 */
export function serializeSceneEntitiesForSave(entities: SceneEntityForm[]) {
  return entities.map((e) => ({
    entityId: e.entityId,
    state: e.state,
    customState: e.customState,
    brightness: e.brightness,
    colorTemp: e.colorTemp,
    rgbColor: e.rgbColor,
    transition: e.transition,
    effect: e.effect,
    position: e.position,
    temperature: e.temperature,
    hvacMode: e.hvacMode,
    volume: e.volume,
    source: e.source,
    percentage: e.percentage,
    code: e.code,
    option: e.option,
    value: e.value,
    humidity: e.humidity,
    fanSpeed: e.fanSpeed,
  }))
}

type OrchestratorSavePayload =
  | {
      kind: 'automation' | 'script'
      name: string
      yaml: string
      runOnHa: boolean
      /** 自动化/脚本：未传 geekGraph 时默认 null，避免 YAML 与陈旧画布分叉 */
      geekGraph?: unknown
    }
  | {
      kind: 'scene'
      name: string
      entities: SceneEntityForm[]
      runOnHa: boolean
      /** 叠加执行：仅改变声明实体，执行前采集快照（支持取消恢复） */
      overlay?: boolean
      /** 场景 YAML 原文（与 Script.yaml 对齐） */
      yaml?: string
      geekSceneGraph?: unknown
    }

/** 构建保存 payload（按 kind 分发） */
export function buildOrchestratorSavePayload(
  args: OrchestratorSavePayload,
): Record<string, unknown> {
  if (args.kind === 'scene') {
    const payload: Record<string, unknown> = {
      name: args.name,
      entities: JSON.stringify(serializeSceneEntitiesForSave(args.entities)),
      runOnHa: args.runOnHa,
    }
    if (typeof args.overlay === 'boolean') payload.overlay = args.overlay
    if (args.yaml != null) payload.yaml = args.yaml
    if (Object.prototype.hasOwnProperty.call(args, 'geekSceneGraph')) {
      payload.geekSceneGraph = args.geekSceneGraph
    }
    return payload
  }
  const payload: Record<string, unknown> = {
    name: args.name,
    yaml: args.yaml,
    runOnHa: args.runOnHa,
  }
  // 经典 Builder 只编 YAML：显式清空 geekGraph，与后端 update 契约一致
  if (args.kind === 'automation' || args.kind === 'script') {
    payload.geekGraph =
      Object.prototype.hasOwnProperty.call(args, 'geekGraph') ? args.geekGraph : null
  }
  return payload
}

type AutomationHistoryRow = {
  id: string
  name?: string
  automationId?: string
  success: boolean
  executedAt: string
  error?: string
  trace?: unknown[]
}

type ScriptHistoryRow = {
  id: string
  scriptName: string
  success: boolean
  executedAt: string
  executed: number
  total: number
}

type SceneHistoryRow = {
  id: string
  sceneName: string
  success: boolean
  executedAt: string
  executed: number
  total: number
}

type OrchestratorHistoryRow = AutomationHistoryRow | ScriptHistoryRow | SceneHistoryRow

interface OrchestratorHistoryEntry {
  id: string
  type: OrchestratorCrudKind
  name: string
  success: boolean
  executedAt: string
  detail: string | undefined
  /** 自动化触发来源（如实体状态变更 / 事件 / 手动触发），供「多次触发对比」展示 */
  triggerNote?: string
}

/** 从自动化执行 trace 中提取触发来源（首条「触发：」步骤） */
function extractAutomationTriggerNote(trace: unknown[] | undefined): string | undefined {
  if (!Array.isArray(trace)) return undefined
  for (const step of trace) {
    if (!step || typeof step !== 'object') continue
    const row = step as { step?: unknown }
    const text = typeof row.step === 'string' ? row.step : ''
    if (text.startsWith('触发：')) {
      const note = text.slice('触发：'.length).trim()
      return note || undefined
    }
  }
  return undefined
}

/** 执行历史行映射（按 kind 分发） */
export function mapOrchestratorExecutionHistory(
  kind: OrchestratorCrudKind,
  row: OrchestratorHistoryRow,
): OrchestratorHistoryEntry {
  switch (kind) {
    case 'automation': {
      const r = row as AutomationHistoryRow
      return {
        id: r.id,
        type: 'automation',
        name: r.name || r.automationId || '',
        success: r.success,
        executedAt: r.executedAt,
        detail: r.error,
        triggerNote: extractAutomationTriggerNote(r.trace),
      }
    }
    case 'script': {
      const r = row as ScriptHistoryRow
      return {
        id: r.id,
        type: 'script',
        name: r.scriptName,
        success: r.success,
        executedAt: r.executedAt,
        detail: `${r.executed}/${r.total}`,
      }
    }
    case 'scene': {
      const r = row as SceneHistoryRow
      return {
        id: r.id,
        type: 'scene',
        name: r.sceneName,
        success: r.success,
        executedAt: r.executedAt,
        detail: `${r.executed}/${r.total}`,
      }
    }
  }
}

type OrchestratorResultInput =
  | { kind: 'automation'; data?: { message?: string; success?: boolean } }
  | { kind: 'script'; success: boolean; executed?: number; total?: number }
  | { kind: 'scene'; sceneName: string; success: boolean }

/** 触发/执行结果消息（按 kind 分发） */
export function orchestratorResultMessage(args: OrchestratorResultInput): {
  message: string
  ok: boolean
} {
  switch (args.kind) {
    case 'automation':
      return {
        message: args.data?.message || '已触发',
        ok: !!args.data?.success,
      }
    case 'script':
      if (args.success) {
        return {
          message: `脚本已执行 (${args.executed ?? 0}/${args.total ?? 0})`,
          ok: true,
        }
      }
      return { message: '部分步骤失败', ok: false }
    case 'scene':
      if (args.success) {
        return { message: `场景「${args.sceneName}」已执行`, ok: true }
      }
      return { message: '部分实体执行失败', ok: false }
  }
}

type BuilderRef<T> = { value: T }

/** 联动器 Builder 共用保存流程（校验 → HA YAML check → create/update → 刷列表） */
export async function saveOrchestratorBuilderItem(opts: {
  kind: OrchestratorCrudKind
  editingId: BuilderRef<string | null>
  saving: BuilderRef<boolean>
  resultMsg: BuilderRef<string>
  resultOk: BuilderRef<boolean>
  storedYaml: BuilderRef<string>
  formSnapshot: BuilderRef<string>
  isAdmin: boolean
  yamlText: string
  payload: Record<string, unknown>
  validateForm: () => string | null
  checkHaExecution?: () => string | null
  validateYaml?: (yaml: string) => Promise<{ valid: boolean; message?: string }>
  formSignature: () => string
  loadList: () => Promise<void>
  dismissAfter: (ms: number) => void
  onSaved: () => void
}): Promise<void> {
  if (opts.saving.value) return
  const validationError = opts.validateForm()
  if (validationError) {
    opts.resultMsg.value = validationError
    opts.resultOk.value = false
    return
  }
  const haMismatch = opts.checkHaExecution?.()
  if (haMismatch) {
    opts.resultMsg.value = haMismatch
    opts.resultOk.value = false
    return
  }

  opts.saving.value = true
  opts.resultMsg.value = ''
  try {
    if (opts.isAdmin && opts.validateYaml) {
      const v = await opts.validateYaml(opts.yamlText)
      if (!v.valid) {
        opts.resultMsg.value = `YAML 校验未通过: ${v.message || ''}`
        opts.resultOk.value = false
        return
      }
    }
    if (opts.editingId.value) {
      await updateOrchestratorItem(opts.kind, opts.editingId.value, opts.payload)
      opts.resultMsg.value = '已更新'
    } else {
      const created = await createOrchestratorItem(opts.kind, opts.payload)
      opts.editingId.value = created.data?.id || null
      opts.resultMsg.value = '已保存'
    }
    opts.storedYaml.value = opts.yamlText
    opts.formSnapshot.value = opts.formSignature()
    opts.resultOk.value = true
    await opts.loadList()
    opts.onSaved()
    opts.dismissAfter(2000)
  } catch (e) {
    opts.resultMsg.value = getApiErrorMessage(e, '保存失败')
    opts.resultOk.value = false
  } finally {
    opts.saving.value = false
  }
}
