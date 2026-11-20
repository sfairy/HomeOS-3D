/**
 * 降级 / 恢复诊断（0.8.7 `STUDIO_BATCH_FALLBACK` / `STUDIO_LAYER_LIGHT_FALLBACK` 等）。
 *
 * 为什么单独一个模块：0.8.7 给两条「重活」链路（几何合批、分层光照参数）加了同一套语义 ——
 * **失败不销毁原件 + 首次失败报一次 + 恢复后再报一次**。这两处如果各写一遍，
 * 「首次 / 累计 / 恢复归零」的状态机必然写出两个略有差异的版本。
 *
 * 语义要点（与 0.8.7 文案一致）：
 * - 首次失败：`warning`，带 `eventType: 降级提示` 与可执行的 `hint`；
 * - 之后继续失败：只累加计数，**不再刷日志**（否则一次拖动能刷出几十条）；
 * - 恢复成功：`info`，带 `eventType: 状态变化`，并报告累计回退次数，然后归零。
 */

/** 一类可降级能力的诊断描述（文案沿用 0.8.7 原文）。 */
export interface DegradationDescriptor {
  /** 稳定事件码，例如 `STUDIO_BATCH_FALLBACK`。 */
  code: string
  /** 恢复事件的稳定事件码。 */
  recoveredCode?: string
  /** 日志分类（中文，与 `HomeOSLog` 的 tag 一致）。 */
  category: string
  /** 阶段标识，写进 context，便于按 phase 过滤。 */
  phase: string
  /** 首次失败时展示的标题。 */
  message: string
  /** 失败后的处置建议（0.8.7 的 `hint`）。 */
  hint: string
  /** 恢复时展示的标题。 */
  recoveredMessage: string
  /** 恢复明细前缀（0.8.7 两条链路用词不同：合批是「此前失败回退批次」，阴影图集是「此前回退更新次数」）。 */
  recoveredDetailPrefix?: string
}

interface DegradationState {
  /** 累计回退次数；0 表示当前未处于降级态。 */
  fallbackCount: number
  /** 是否已经报过首次 warning（避免重复刷屏）。 */
  warned: boolean
}

/** 按 code 维护状态：同一个 code 在不同运行时实例间共享（页面级单例）。 */
const degradationStates = new Map<string, DegradationState>()

function stateFor(code: string): DegradationState {
  const existing = degradationStates.get(code)
  if (existing) return existing
  const created: DegradationState = { fallbackCount: 0, warned: false }
  degradationStates.set(code, created)
  return created
}

type LogReporter = {
  report?: (
    level: string,
    category: string,
    message: string,
    context?: Record<string, unknown>,
    detail?: string,
  ) => void
}

function reporter(): LogReporter | null {
  return (globalThis as { HomeOSLog?: LogReporter }).HomeOSLog ?? null
}

/**
 * 记录一次降级失败。
 *
 * @param error 原始异常（只取 `stack`，不参与判定）
 * @returns 当前累计回退次数
 */
export function reportDegradation(descriptor: DegradationDescriptor, error?: unknown, detail?: string): number {
  const state = stateFor(descriptor.code)
  state.fallbackCount += 1
  if (state.warned) return state.fallbackCount
  state.warned = true
  try {
    reporter()?.report?.(
      'warning',
      descriptor.category,
      descriptor.message,
      {
        phase: descriptor.phase,
        code: descriptor.code,
        eventType: '降级提示',
        hint: descriptor.hint,
      },
      detail ?? (error as { stack?: string } | undefined)?.stack ?? String(error ?? ''),
    )
  } catch {
    /* 日志失败不得影响主流程 */
  }
  return state.fallbackCount
}

/**
 * 记录一次恢复。
 *
 * @returns 本次恢复前累计的回退次数（0 表示本来就没降级，调用方可以跳过提示）
 */
export function reportDegradationRecovered(descriptor: DegradationDescriptor): number {
  const state = stateFor(descriptor.code)
  const recoveredCount = state.fallbackCount
  state.fallbackCount = 0
  state.warned = false
  if (recoveredCount === 0) return 0
  try {
    reporter()?.report?.(
      'info',
      descriptor.category,
      descriptor.recoveredMessage,
      {
        phase: descriptor.phase,
        code: descriptor.recoveredCode ?? `${descriptor.code}_RECOVERED`,
        eventType: '故障恢复',
      },
      `${descriptor.recoveredDetailPrefix ?? '此前回退次数：'}${recoveredCount}`,
    )
  } catch {
    /* 日志失败不得影响主流程 */
  }
  return recoveredCount
}

/** 当前是否处于降级态（供面板 / 诊断读取）。 */
export function isDegraded(code: string): boolean {
  return stateFor(code).fallbackCount > 0
}

/** 测试用：清空全部状态。 */
export function resetDegradationState(): void {
  degradationStates.clear()
}

/** 几何合批降级：失败时保留原模型绘制。 */
export const BATCH_FALLBACK: DegradationDescriptor = {
  code: 'STUDIO_BATCH_FALLBACK',
  recoveredCode: 'STUDIO_BATCH_PROGRESS_RESUMED',
  category: '3D 图形',
  phase: 'studio-batch-fallback',
  message: '几何合批构建失败，已保留原模型绘制。',
  hint: '原模型仍由原对象绘制；回退可能增加绘制开销，持续异常时保留编辑并导出日志。',
  recoveredMessage: '后续几何合批已有成功结果；此前失败批次仍按原对象绘制。',
  recoveredDetailPrefix: '此前失败回退批次：',
}

/** 分层光照参数降级：失败时回退原生光照。 */
export const LAYER_LIGHT_FALLBACK: DegradationDescriptor = {
  code: 'STUDIO_LAYER_LIGHT_FALLBACK',
  recoveredCode: 'STUDIO_LAYER_LIGHT_RECOVERED',
  category: '灯光',
  phase: 'studio-layer-light-fallback',
  message: '分层光照参数更新失败，已回退原生光照。',
  hint: '可先查看实际画面；若持续出现光照异常或卡顿，保留编辑并导出日志。',
  recoveredMessage: '分层光照参数更新已恢复。',
  recoveredDetailPrefix: '此前回退更新次数：',
}

/** 分层光照回退（短名导出：调用点是 4,900 行的渲染文件，长名会把 import 顶成多行）。 */
export function layerLightFailed(error?: unknown): number {
  return reportDegradation(LAYER_LIGHT_FALLBACK, error)
}

export function layerLightRecovered(): number {
  return reportDegradationRecovered(LAYER_LIGHT_FALLBACK)
}
