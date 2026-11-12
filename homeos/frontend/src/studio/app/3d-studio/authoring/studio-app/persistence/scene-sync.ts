import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { navigateInShell } from '@/studio/platform/shell-navigation'
import type { StudioApiRequestOptions } from '../../types/studio-app-types'
import type { SceneSyncOutcome } from '../../store/scene-sync-controller'

/**
 * C4 —— 场景同步接线（task-11）。
 *
 * 约束：
 * 1. 轮询只读运行时快照 `appCtx.studioProject`，**绝不读写** `loadedDraft` / document-store 的
 *    `loadedRevision` / `dirty`：非全量推送只就地更新楼层内容、baseLighting 与楼层名。
 * 2. 全量推送且本地脏时先保存；保存冲突 / 失败时**不覆盖**本地（交给 409 三出口）；
 *    保存成功后本轮载荷已是保存前的陈旧快照，直接丢弃，不用它回滚本地。
 * 3. 本地干净的全量推送由 `readSceneUpdate` 把规范化后的远端载荷交回 stage 的 adopt 流程
 *    （保留相机 / 活动楼层 / 灯光过渡），最终由 `replaceScene` → `applyLoadedDraft` 成为
 *    新保存基线；revision 按“载荷带则用、不带则沿用”处理，绝不打回 0。
 */
export function sceneSyncFlushIsDirty(runtime: StudioAppRuntime): boolean {
  if (runtime.studioDocumentStore.isDirty()) return true
  const runtimeSaveStore = runtime.studioSaveStore
  return !!runtimeSaveStore && (runtimeSaveStore.hasUnsavedChanges() || runtimeSaveStore.getState().isSaveInFlight)
}

export async function flushSceneSyncRuntime(runtime: StudioAppRuntime): Promise<'saved' | 'conflict' | 'failed'> {
  try {
    const sceneSyncFlushResult = await runtime.runStudioSaveOnce('autosave')
    if (sceneSyncFlushResult.ok) return 'saved'
    return sceneSyncFlushResult.reason === 'conflict' || sceneSyncFlushResult.reason === 'confirmation-required'
      ? 'conflict'
      : 'failed'
  } catch (sceneSyncFlushError: any) {
    window.HomeOSLog?.error!(sceneSyncFlushError, { phase: 'studio-scene-sync-flush' })
    return 'failed'
  }
}

export function currentSceneSyncSinceKey(runtime: StudioAppRuntime): string {
  if (runtime.sceneSyncSinceKey !== null) return runtime.sceneSyncSinceKey
  return typeof runtime.appCtx.loadedDraft?.syncKey === 'string' ? runtime.appCtx.loadedDraft.syncKey : ''
}

export function rememberSceneSyncKey(runtime: StudioAppRuntime, sceneUpdateResponse: any): void {
  if (typeof sceneUpdateResponse?.syncKey === 'string' && sceneUpdateResponse.syncKey)
    runtime.sceneSyncSinceKey = sceneUpdateResponse.syncKey
}

/** 非全量同步后就地刷新派生视图（不触碰保存版本线）。 */
export function refreshAfterSceneSyncOutcome(runtime: StudioAppRuntime, sceneSyncOutcome: SceneSyncOutcome) {
  if (sceneSyncOutcome.kind === 'merge-floors') {
    if (sceneSyncOutcome.floorIds.length > 0) {
      const activeFloorRecord = runtime.getActiveFloor()
      if (activeFloorRecord && sceneSyncOutcome.floorIds.includes(activeFloorRecord.id))
        runtime.appCtx.studioState = activeFloorRecord.scene
      runtime.syncFloorGroups(new Set(sceneSyncOutcome.floorIds))
      Promise.allSettled(runtime.preloadDefaultModels())
      runtime.refreshSelection()
      runtime.refreshPreviewScene()
      runtime.refreshScopeItems()
    }
    if (sceneSyncOutcome.lighting) runtime.refreshSceneSyncLightingDerived?.()
  } else if (sceneSyncOutcome.kind === 'lighting-only') {
    if (sceneSyncOutcome.lighting) runtime.refreshSceneSyncLightingDerived?.()
  }
  if (
    (sceneSyncOutcome.kind === 'metadata-only' ||
      sceneSyncOutcome.kind === 'lighting-only' ||
      sceneSyncOutcome.kind === 'merge-floors') &&
    sceneSyncOutcome.floorNameChanges.length > 0
  )
    runtime.renderFloorList()
}

export async function fetchStudioApi(
  runtime: StudioAppRuntime,
  apiPath: any,
  requestOptions: StudioApiRequestOptions = {},
  responsePromise: any = null,
) {
  if (runtime.isEmbeddedStage && requestOptions.method && requestOptions.method !== 'GET')
    throw new Error('交互户型为只读视图。')
  const httpResponse = await (responsePromise ||
      fetch('/api/v1' + apiPath, {
        cache: 'no-store',
        ...requestOptions,
        headers: requestOptions.body
          ? {
              'Content-Type': 'application/json',
              ...(requestOptions.headers || {}),
            }
          : requestOptions.headers,
      })),
    responseTextBody = httpResponse.status === 204 ? '' : await httpResponse.text()
  let errorBody: any = null
  if (responseTextBody)
    try {
      errorBody = JSON.parse(responseTextBody)
    } catch {
      errorBody = null
    }
  if (httpResponse.status === 401) {
    navigateInShell('/login?next=' + encodeURIComponent(window.location.pathname))
    const ru2 = new runtime.StudioApiError('登录状态已失效。', httpResponse.status, errorBody)
    throw window.HomeOSLog?.linkError!(ru2, httpResponse)! || ru2
  }
  if (httpResponse.status === 403 && errorBody?.detail?.code === 'LICENSE_RESTRICTED') {
    navigateInShell('/activate')
    const ru3 = new runtime.StudioApiError('当前授权无法使用户型图绘制。', httpResponse.status, errorBody)
    throw window.HomeOSLog?.linkError!(ru3, httpResponse)! || ru3
  }
  if (!httpResponse.ok) {
    const errorDetail = errorBody?.detail,
      ru4 = new runtime.StudioApiError(
        typeof errorDetail == 'string'
          ? errorDetail
          : errorDetail?.message || '请求失败（HTTP ' + httpResponse.status + '）',
        httpResponse.status,
        errorBody,
      )
    throw window.HomeOSLog?.linkError!(ru4, httpResponse)! || ru4
  }
  return errorBody
}
