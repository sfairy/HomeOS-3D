/**
 * @file useGeekTracePlayback.ts
 * @module composables/orchestrator
 * @description 执行轨迹回放组合式函数：最近一次执行轨迹的加载、逐步回放与选中详情。
 *
 * 职责：
 * - 拉取联动器最近一次执行记录（GET /automation/history/executions）；
 * - 提供 traceStep 控制回放进度（-1 显示全部，>=0 高亮到该步）；
 * - 暴露 playbackTrace 当前回放切片、traceHint 文案、selectedTraceDetail 选中详情。
 *
 * 依赖：
 * - vue（computed、ref）
 * - @/services/api-client（apiGet）
 * - @/utils/orchestrator/automation-crud.util（mapAutomationExecutionHistory）
 * - @/utils/orchestrator/execution-trace-display.util（formatTraceStep）
 */
import { computed, ref } from 'vue'
import { apiGet } from '@/services/api-client'
import { mapAutomationExecutionHistory } from '@/utils/orchestrator/automation-crud.util'
import { formatTraceStep } from '@/utils/orchestrator/execution-trace-display.util'

/**
 * 执行轨迹回放 composable。
 *
 * @returns lastTrace 最近一次轨迹步骤数组；lastSuccess 是否成功（null=未知）；
 *          traceStep 当前回放步骤索引（-1=全部）；playbackTrace 当前回放切片；traceHint 文案；selectedTraceDetail 选中详情；
 *          traceStepPrev/Next/Reset/jumpTraceStep 步进方法；loadHistory 拉取历史
 */
export function useGeekTracePlayback() {
  const lastTrace = ref<unknown[]>([])
  // 最近一次执行是否成功（null=未知/未拉取）
  const lastSuccess = ref<boolean | null>(null)
  // 回放步骤索引：-1 显示全部；>=0 只高亮到该步
  const traceStep = ref(-1)

  /** 逐步回放：-1 显示全部；>=0 只高亮到该步 */
  const playbackTrace = computed(() => {
    if (traceStep.value < 0) return lastTrace.value
    return lastTrace.value.slice(0, traceStep.value + 1)
  })

  // 顶部状态文案：根据是否有轨迹与成功状态显示
  const traceHint = computed(() => {
    if (!lastTrace.value.length) return ''
    if (lastSuccess.value === true) return '最近执行：成功'
    if (lastSuccess.value === false) return '最近执行：失败'
    return '最近执行'
  })

  // 当前选中步骤的详情文案（-1 或无轨迹时为空串）
  const selectedTraceDetail = computed(() => {
    if (traceStep.value < 0 || !lastTrace.value.length) return ''
    const step = lastTrace.value[traceStep.value]
    if (!step) return ''
    return formatTraceStep(step)
  })

  /** 上一步：若当前为"显示全部"则跳到末尾，否则递减（下界 0） */
  function traceStepPrev() {
    if (traceStep.value < 0) traceStep.value = lastTrace.value.length - 1
    else traceStep.value = Math.max(0, traceStep.value - 1)
  }
  /** 下一步：若当前为"显示全部"则跳到第 0 步，否则递增（上界 length-1） */
  function traceStepNext() {
    if (traceStep.value < 0) traceStep.value = 0
    else traceStep.value = Math.min(lastTrace.value.length - 1, traceStep.value + 1)
  }
  /** 重置为"显示全部"模式（-1）。 */
  function traceStepReset() {
    traceStep.value = -1
  }
  /**
   * 跳转到指定步骤；输入会被夹紧到 [0, length-1]。
   * @param i 目标步骤索引
   */
  function jumpTraceStep(i: number) {
    traceStep.value = Math.max(0, Math.min(Number(i) || 0, lastTrace.value.length - 1))
  }

  /**
   * 拉取最近一次执行记录并填充轨迹（失败静默，画布状态条可选）。
   *
   * @param id 联动器 ID
   */
  async function loadHistory(id: string) {
    lastTrace.value = []
    lastSuccess.value = null
    traceStep.value = -1
    if (!id) return
    try {
      const { data } = await apiGet('/automation/history/executions', {
        params: { automationId: id, limit: 1 },
      })
      // 兼容数组 / items 包装 / 单对象三种形态
      const row = Array.isArray(data) ? data[0] : data?.items?.[0] || data?.[0]
      if (!row) return
      // map 结果不含 trace（仅用于 success/triggerNote 等展示字段），轨迹取自原始行
      const mapped = mapAutomationExecutionHistory(row) as unknown as { success: boolean }
      lastTrace.value = (row as { trace?: unknown[] }).trace || []
      lastSuccess.value = mapped.success ?? row.success ?? null
      traceStep.value = -1
    } catch {
      /* 忽略：失败时不阻塞画布 */
    }
  }

  return {
    lastTrace,
    lastSuccess,
    traceStep,
    playbackTrace,
    traceHint,
    selectedTraceDetail,
    traceStepPrev,
    traceStepNext,
    traceStepReset,
    jumpTraceStep,
    loadHistory,
  }
}
