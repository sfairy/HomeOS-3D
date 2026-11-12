import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { patchStudioFacadeState } from '../../../../../engine/index'

export async function waitForStageReady(runtime: StudioAppRuntime) {
  if (!runtime.areLightsEnabled()) return
  runtime.scheduleStudioRender(0)
  const stageReadyDeadline = performance.now() + 1800
  for (
    ;
    runtime.areLightsEnabled() &&
    (!runtime.appCtx.isCacheReady || runtime.appCtx.isFrameDirty || runtime.previewLightCacheCanvasElement.hidden) &&
    performance.now() < stageReadyDeadline;
  )
    await new Promise(requestAnimationFrame)
}

export function jumpWorkflowStep(runtime: StudioAppRuntime, step: string) {
  patchStudioFacadeState({ workflowStep: step })
  if (step === 'background') {
    runtime.importPlanButton?.focus?.()
    runtime.importPlanButton?.click?.()
    return
  }
  if (step === 'scale') {
    runtime.selectStudioTool('scale')
    return
  }
  if (step === 'walls') {
    runtime.selectStudioTool('wall')
    return
  }
  if (step === 'items') {
    try {
      runtime.setAssetCategory?.('home')
    } catch {
      /* 可选注入钩子未提供或抛错：调用方继续后续流程 */
    }
    runtime.selectStudioTool('select')
    return
  }
  if (step === 'lights') {
    try {
      runtime.setAssetCategory?.('light')
    } catch {
      /* 可选注入钩子未提供或抛错：调用方继续后续流程 */
    }
    runtime.selectStudioTool('select')
    return
  }
  if (step === 'export') {
    runtime.openExportPanel()
  }
}
