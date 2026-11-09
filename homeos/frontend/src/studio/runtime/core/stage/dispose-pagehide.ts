/**
 * P5（部分）：stage pagehide 回收的可门禁小块。
 *
 * 完整 `mountStage` / dispose 上帝文件拆分回归面极大，本轮不做 mega-split。
 * 这里只抽出「按序调用 dispose 步骤」的薄封装，便于后续继续把 `stage.ts` 里的
 * `onPermanentPageHide` 闭包按子系统迁出；`check:studio-split` 仍以既有 phase 预算为准。
 */

export type StageDisposeStep = {
  label: string
  run: () => void
}

/** 顺序执行回收步骤；单步失败不阻断后续（显存/上下文可能已丢失）。 */
export function runStageDisposeSteps(steps: StageDisposeStep[]): void {
  for (const step of steps) {
    try {
      step.run()
    } catch (error) {
      console.warn(`[stage] pagehide dispose failed: ${step.label}`, error)
    }
  }
}
