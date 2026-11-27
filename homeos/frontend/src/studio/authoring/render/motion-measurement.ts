import type { StudioAppRuntime } from '../runtime/studio-app-runtime'

export function beginMotionMeasurement(runtime: StudioAppRuntime, motionActivity: any) {
  if (!runtime.isPerformanceDiagnostics || !motionActivity) return false
  const xt2 = runtime.diagnosticsState,
    gpuContext = xt2.gpuContext,
    gpuExtension = xt2.gpuExtension
  if (
    !gpuContext ||
    !gpuExtension ||
    xt2.gpuQueryActive ||
    xt2.gpuQueriesPending.length >= runtime.maxPendingGpuQueries
  )
    return false
  try {
    const query = gpuContext.createQuery()
    return query
      ? (gpuContext.beginQuery(gpuExtension.TIME_ELAPSED_EXT, query),
        (xt2.gpuQueryActive = query),
        (xt2.gpuStatus = '采样中'),
        true)
      : false
  } catch {
    return ((xt2.gpuStatus = '不可用'), false)
  }
}

export function endMotionMeasurement(runtime: StudioAppRuntime, motionSession: any) {
  if (!motionSession) return
  const xt3 = runtime.diagnosticsState,
    gpuContext2 = xt3.gpuContext,
    gpuExtension2 = xt3.gpuExtension,
    gpuQueryActive = xt3.gpuQueryActive
  if (((xt3.gpuQueryActive = null), !(!gpuContext2 || !gpuExtension2 || !gpuQueryActive)))
    try {
      gpuContext2.endQuery(gpuExtension2.TIME_ELAPSED_EXT), xt3.gpuQueriesPending.push(gpuQueryActive)
    } catch {
      gpuContext2.deleteQuery?.(gpuQueryActive), (xt3.gpuStatus = '不可用')
    }
}

export function updateMotionStats(runtime: StudioAppRuntime, motionTimestamp: any, isMotionActive: any) {
  runtime.isPerformanceDiagnostics &&
    ((runtime.diagnosticsState.motionActive = isMotionActive),
    isMotionActive || (runtime.diagnosticsState.lastMotionRenderAt = 0),
    runtime.flushGpuQueries(),
    runtime.publishRenderStats(motionTimestamp))
}

export function needsMotionPresentation(runtime: StudioAppRuntime) {
  return !runtime.appCtx.isDisposed && !document.hidden && runtime.appCtx.isHighDetailQuality
}
