import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { syncCourtyardGates as syncCourtyardGates2 } from '../../../plan/courtyard-drawing'
import { navigateInShell } from '@/studio/platform/shell-navigation'
import { shellNotify } from '@/studio/platform/shell-chrome'
import { patchStudioFacadeState } from '../../../../../engine/index'
import { resolveInteractionCleanup } from '../../ui/studio-interaction-cleanup'
import { StudioSaveStore } from '../../store/save-store'
import type { FlushResult, SaveStoreState } from '../../store/save-store'
import { refreshStepChecklist } from '../ui/step-checklist'

export function hideStudioReadonlyBanner(runtime: StudioAppRuntime): void {
  if (runtime.studioReadonlyBannerElement) runtime.studioReadonlyBannerElement.hidden = true
}

/** 保存状态机 → 旧 header 文案 / appCtx 兼容字段 / 退出按钮 / 只读横幅。 */
export function applyStudioSaveState(runtime: StudioAppRuntime, saveState: SaveStoreState): void {
  runtime.appCtx.isSaveInFlight = saveState.isSaveInFlight
  if (saveState.status === 'saved') {
    runtime.appCtx.remoteSaveRevision = runtime.appCtx.localSaveRevision
    runtime.studioDraftReadonly = false
    runtime.hideStudioReadonlyBanner()
  }
  switch (saveState.status) {
    case 'loading':
      runtime.showSaveState('正在载入…', 'saving')
      break
    case 'blocked-readonly':
      runtime.studioDraftReadonly = true
      runtime.showSaveState('只读：草稿载入失败', 'error')
      runtime.renderStudioReadonlyBanner('草稿载入失败，当前为只读视图：修改不会保存。可重试载入，或导出本地副本。')
      break
    case 'saved':
      runtime.showSaveState('已自动保存', 'saved')
      break
    case 'dirty':
      runtime.showSaveState('有未保存修改', 'saving')
      break
    case 'saving':
      runtime.showSaveState('正在保存…', 'saving')
      break
    case 'retrying':
      runtime.showSaveState('保存失败，稍后自动重试', 'error')
      break
    case 'failed':
      runtime.showSaveState('保存失败，修改后重试', 'error')
      break
    case 'offline':
      runtime.showSaveState('网络不可用，修改尚未保存', 'error')
      break
    case 'conflict':
      runtime.showSaveState('等待处理保存冲突', 'error')
      break
    case 'blocked':
      runtime.showSaveState('删除未确认，尚未保存', 'error')
      break
    default:
      break
  }
  runtime.refreshExitDialogButtons()
}

/** 保存状态机（transport 走 fetchStudioApi，保留 401/403 跳转与错误归一化；beacon 走 keepalive）。 */
export function getStudioSaveStore(runtime: StudioAppRuntime): StudioSaveStore {
  if (runtime.studioSaveStore) return runtime.studioSaveStore
  runtime.studioSaveStore = new StudioSaveStore({
    documentStore: runtime.studioDocumentStore,
    transport: {
      load: () => runtime.studioDraftRepository.load(),
      put: async (saveRequest) => {
        try {
          const savedPayload = await runtime.fetchStudioApi('/studio3d', {
            method: 'PUT',
            hbLogContext: { phase: 'studio-save' },
            body: JSON.stringify({
              revision: saveRequest.revision,
              scene: saveRequest.scene,
              interactionConfirmation: saveRequest.interactionConfirmation || '',
            }),
          })
          if (!savedPayload || typeof savedPayload !== 'object' || !('revision' in savedPayload)) {
            return { ok: false, error: { message: '保存响应缺少 revision。' } }
          }
          return {
            ok: true,
            payload: {
              revision: Math.max(0, Math.trunc(Number((savedPayload as any).revision) || 0)),
              scene: (savedPayload as any).scene ?? saveRequest.scene,
              updatedAt: (savedPayload as any).updatedAt ?? null,
            },
          }
        } catch (saveError: any) {
          return {
            ok: false,
            error: {
              status: typeof saveError?.status === 'number' ? saveError.status : undefined,
              detail: saveError?.payload?.detail ?? saveError?.detail,
              message: saveError?.message || '保存失败。',
            },
          }
        }
      },
      beacon: (beaconRequest) =>
        runtime.studioDraftRepository.beacon ? runtime.studioDraftRepository.beacon(beaconRequest) : false,
    },
    timers: {
      setTimeout: (timerHandler, delayMs) => window.setTimeout(timerHandler, delayMs),
      clearTimeout: (timerHandle) => window.clearTimeout(timerHandle),
    },
    isEmbedded: () => runtime.isEmbeddedStage,
    isPageSuspended: () => !!runtime.appCtx.isPageSuspended,
    isOnline: () => navigator.onLine !== false,
    getScene: () => (runtime.appCtx.loadedDraft ? runtime.getLocalSaveRevision() : null),
    exportLocalCopy: (localScene) => {
      runtime.downloadStudioLocalCopy(localScene)
    },
    onStateChange: runtime.applyStudioSaveState,
  })
  return runtime.studioSaveStore
}

/** PUT 成功：document store 已 applySaved，把 appCtx.loadedDraft 对齐成服务器返回的 revision/scene。 */
export function syncDraftPayloadAfterSave(runtime: StudioAppRuntime): void {
  runtime.appCtx.loadedDraft = {
    ...(runtime.appCtx.loadedDraft || {}),
    revision: runtime.studioDocumentStore.getLoadedRevision(),
    scene: runtime.studioDocumentStore.getDocument(),
  }
}

/** 409 冲突：取服务器最新版本并打开三出口对话框（GET 失败也打开，载入按钮会重取）。 */
export async function recordSaveConflictFromServer(runtime: StudioAppRuntime): Promise<void> {
  try {
    const latestConflictPayload = await runtime.fetchStudioApi('/studio3d')
    runtime.recordSaveConflict(
      latestConflictPayload,
      runtime.getLocalSaveRevision(),
      runtime.studioDocumentStore.getLoadedRevision(),
    )
  } catch (conflictLoadFailure: any) {
    runtime.recordSaveConflict(null, runtime.getLocalSaveRevision(), runtime.studioDocumentStore.getLoadedRevision())
    window.HomeOSLog?.error!(conflictLoadFailure, { phase: 'studio-save-conflict-load' })
  }
}

/** 统一收尾：成功同步 loadedDraft；冲突开对话框；428 先确认交互清理；失败只 toast 一次。 */
export async function settleStudioSaveResult(runtime: StudioAppRuntime, saveResult: FlushResult): Promise<FlushResult> {
  const saveStore = runtime.getStudioSaveStore()
  if (saveResult.ok) {
    runtime.syncDraftPayloadAfterSave()
    runtime.appCtx.pendingConflict = null
    return saveResult
  }
  if (saveResult.reason === 'conflict') {
    await runtime.recordSaveConflictFromServer()
    return saveResult
  }
  if (saveResult.reason === 'confirmation-required') {
    const pendingConfirmation = saveStore.getState().pendingConfirmation
    const confirmationDetail = {
      code: 'STUDIO3D_INTERACTION_CONFIRMATION',
      token: pendingConfirmation?.token || saveResult.token,
      message: pendingConfirmation?.message || '',
      impacts: pendingConfirmation?.impacts ?? null,
      projects: pendingConfirmation?.projects ?? null,
    }
    const shouldConfirmCleanup = await resolveInteractionCleanup(
      confirmationDetail,
      runtime.undoStudioHistory,
      runtime.showToast,
    )
    if (!shouldConfirmCleanup) {
      saveStore.cancelConfirmation()
      runtime.showSaveState('删除未确认，尚未保存', 'error')
      return { ok: false, reason: 'blocked' }
    }
    return runtime.settleStudioSaveResult(await saveStore.confirmInteraction(confirmationDetail.token))
  }
  if (saveResult.reason === 'fatal') {
    runtime.showToast(saveResult.error?.message || '3D 草稿保存失败。', 'error')
  } else if (saveResult.reason === 'retry-scheduled' && saveStore.getState().attempt === 1) {
    runtime.showToast(saveResult.error?.message || '3D 草稿保存失败，稍后自动重试。', 'error')
  }
  return saveResult
}

/** 退出保存要等交互结束（拖拽 / 画墙期间的场景快照不稳定）。 */
export async function waitForStudioInteractionIdle(runtime: StudioAppRuntime): Promise<void> {
  if (!runtime.isInteractionBusy()) return
  await new Promise<void>((resolve) => runtime.exitWaiterResolvers.add(resolve))
}

export async function flushStudioSaveOnce(
  runtime: StudioAppRuntime,
  saveTrigger: 'autosave' | 'exit' | 'overwrite',
): Promise<FlushResult> {
  const saveStore = runtime.getStudioSaveStore()
  if (saveTrigger === 'exit') {
    await runtime.waitForStudioInteractionIdle()
    // 等待交互期间用户可能已取消退出：不要再偷偷保存一次。
    if (!runtime.studioExitDialogElement.open) return { ok: false, reason: 'deferred' }
    return runtime.settleStudioSaveResult(await saveStore.requestExit())
  }
  const rawResult =
    saveTrigger === 'overwrite' ? await saveStore.resolveConflictOverwrite() : await saveStore.flushNow()
  return runtime.settleStudioSaveResult(rawResult)
}

/** 初载失败（boot 的 GET 抛错）：进入只读，横幅提示重试 / 导出本地副本，不谎报待保存。 */
export function notifyStudioDraftLoadFailure(runtime: StudioAppRuntime, loadError: any): void {
  if (runtime.isEmbeddedStage) return
  runtime.studioDraftReadonly = true
  runtime.getStudioSaveStore().markLoadFailed({
    status: typeof loadError?.status === 'number' ? loadError.status : undefined,
    detail: loadError?.payload?.detail ?? loadError?.detail,
    message: loadError?.message || '草稿载入失败。',
  })
  // boot 的 catch 会随后写「载入失败」，这里补一次只读状态，确保最终文案是只读。
  window.setTimeout(() => {
    runtime.isStudioDraftReadonly() && runtime.showSaveState('只读：草稿载入失败', 'error')
  }, 0)
}

export async function retryStudioDraftLoad(runtime: StudioAppRuntime): Promise<void> {
  try {
    const latestDraftPayload = await runtime.fetchStudioApi('/studio3d')
    await runtime.applyLoadedDraft(latestDraftPayload)
    runtime.getStudioSaveStore().acceptLoaded()
    runtime.studioDraftReadonly = false
    runtime.hideStudioReadonlyBanner()
    runtime.showSaveState('已自动保存', 'saved')
    runtime.showToast('草稿已重新载入。', 'success')
  } catch (retryFailure: any) {
    runtime.notifyStudioDraftLoadFailure(retryFailure)
    runtime.showToast(retryFailure?.message || '草稿载入失败，可稍后重试。', 'error')
  }
}

export async function flushStudioSaveBeforeTeardown(runtime: StudioAppRuntime): Promise<void> {
  if (runtime.isEmbeddedStage || runtime.appCtx.isLeavingStudio || runtime.isStudioDraftReadonly()) return
  const pendingSaveStore = runtime.studioSaveStore
  if (!pendingSaveStore) return
  if (!pendingSaveStore.hasUnsavedChanges() && !pendingSaveStore.getState().isSaveInFlight) return
  try {
    await pendingSaveStore.requestExit()
  } catch (flushFailure: any) {
    window.HomeOSLog?.error!(flushFailure, { phase: 'studio-teardown-save' })
  }
}

export function showToast(_runtime: StudioAppRuntime, toastMessage: any, toastKind = '') {
  // 走外壳 chrome toast（App 根挂载的 VNotification），不再操作本页 .toast DOM。
  shellNotify(String(toastMessage ?? ''), String(toastKind ?? ''))
}

export function showSaveState(runtime: StudioAppRuntime, saveStateText: any, saveStateKind = '') {
  ;(runtime.saveStateElement.className = ('save-state ' + saveStateKind).trim()),
    (runtime.saveStateElement.innerHTML = '<i></i>' + saveStateText)
  const mapped =
    saveStateKind === 'saving'
      ? 'saving'
      : saveStateKind === 'error'
        ? 'error'
        : saveStateKind === 'saved'
          ? 'saved'
          : saveStateText?.includes?.('未保存') || saveStateKind === 'saving'
            ? 'dirty'
            : 'idle'
  patchStudioFacadeState({
    dirty: mapped === 'dirty' || mapped === 'saving',
    saveState: mapped as any,
    history: {
      canUndo: runtime.historyUndoDepth() > 0,
      canRedo: runtime.historyRedoDepth() > 0,
      undoDepth: runtime.historyUndoDepth(),
      redoDepth: runtime.historyRedoDepth(),
    },
    activeTool: runtime.appCtx.activeToolName,
  })
}

export function markDocumentDirty(runtime: StudioAppRuntime) {
  if (runtime.isEmbeddedStage) {
    runtime.pendingHistoryScene = null
    return
  }
  if (runtime.isStudioDraftReadonly()) {
    runtime.pendingHistoryScene = null
    runtime.showSaveState('只读：草稿载入失败，修改不会保存', 'error')
    return
  }
  // C5：编辑真正落地时才把编辑前快照 diff 成 DocumentPatch 入栈。
  runtime.flushPendingHistory()
  syncCourtyardGates2(runtime.appCtx.studioState.items, runtime.getPixelsPerMeter() || 100),
    (runtime.appCtx.isExporting = false),
    (runtime.appCtx.localSaveRevision += 1),
    (runtime.appCtx.firstLocalChangeAt ??= Date.now()),
    (runtime.appCtx.lastLocalChangeAt = Date.now()),
    // C3：版本权威在 document store；marked 不产生补丁，但必须让 isDirty 为真。
    runtime.studioDocumentStore.markWholeDocumentDirty(),
    runtime.getStudioSaveStore().markDirty(),
    runtime.showSaveState('有未保存修改', 'saving'),
    runtime.scheduleAutosave(),
    refreshStepChecklist(runtime.appCtx)
}

/** 自动保存调度：宿主只保留闸门，防抖 / 首次 15s 兜底 / 退避重试全部交给 save-store。 */
export function scheduleAutosave(runtime: StudioAppRuntime, explicitDelayMs?: number) {
  const pendingSaveStore = runtime.studioSaveStore
  if (
    runtime.isEmbeddedStage ||
    runtime.appCtx.isPageSuspended ||
    navigator.onLine === false ||
    !runtime.appCtx.loadedDraft ||
    runtime.isStudioDraftReadonly() ||
    !pendingSaveStore ||
    !runtime.studioDocumentStore.isDirty() ||
    pendingSaveStore.getState().isSaveInFlight ||
    pendingSaveStore.getState().status === 'conflict' ||
    pendingSaveStore.getState().status === 'blocked' ||
    runtime.studioExitDialogElement.open
  )
    return
  if (document.hidden && pendingSaveStore.getState().nextRetryAt !== null) return
  pendingSaveStore.scheduleAutosave(explicitDelayMs)
}

/** 交互（平面拖拽 / 渲染抑制 / 庭院绘制）结束后：释放退出等待者，并补一次被推迟的自动保存。 */
export function handleInteractionEnded(runtime: StudioAppRuntime) {
  if (!runtime.isInteractionBusy()) {
    for (const exitWaiter of runtime.exitWaiterResolvers) exitWaiter()
    runtime.exitWaiterResolvers.clear(),
      runtime.appCtx.isInteractionDeferredSave &&
        ((runtime.appCtx.isInteractionDeferredSave = false), runtime.scheduleAutosave())
  }
}

export function isInteractionBusy(runtime: StudioAppRuntime) {
  return runtime.appCtx.isWindowHidden || runtime.appCtx.isRenderSuppressed || !!runtime.planPainter?.isDragging?.()
}

/** 退出前的未保存判定：以 save-store / document-store 为权威；只读载入失败时不谎报待保存。 */
export function hasUnsavedChanges(runtime: StudioAppRuntime) {
  const pendingSaveStore = runtime.studioSaveStore
  const saveState = pendingSaveStore?.getState()
  return (
    runtime.appCtx.isExportPresetDirty ||
    !!runtime.appCtx.marqueeBox?.moved ||
    !!runtime.planPainter?.hasPendingChange?.() ||
    !!(
      pendingSaveStore &&
      (pendingSaveStore.hasUnsavedChanges() || saveState?.isSaveInFlight || saveState?.status === 'conflict')
    )
  )
}

export function refreshExitDialogButtons(runtime: StudioAppRuntime) {
  const isSavingNow = !!runtime.appCtx.isSaveInFlight || !!runtime.studioSaveStore?.getState().isSaveInFlight
  ;(runtime.studioExitSaveButton.disabled = runtime.appCtx.isExitSaveInFlight),
    (runtime.studioExitDiscardButton.disabled = isSavingNow || runtime.appCtx.isExitSaveInFlight),
    (runtime.studioExitSaveButton.textContent = runtime.appCtx.isExitSaveInFlight ? '正在保存…' : '保存并退出')
}

/** 「继续编辑」/ Esc：作废当前退出请求，释放等待者并关闭对话框。 */
export function closeExitDialog(runtime: StudioAppRuntime) {
  ;(runtime.appCtx.exitSaveRequestId += 1), (runtime.appCtx.isExitSaveInFlight = false)
  for (const exitWaiter of runtime.exitWaiterResolvers) exitWaiter()
  runtime.exitWaiterResolvers.clear(),
    runtime.studioExitDialogElement.close(),
    runtime.refreshExitDialogButtons(),
    runtime.scheduleAutosave()
}

/** 「不保存并退出」：标记离开状态并跳转回编辑器。 */
export function leaveStudio(runtime: StudioAppRuntime) {
  ;(runtime.appCtx.isLeavingStudio = true),
    window.clearTimeout(runtime.appCtx.autosaveTimeoutId),
    (runtime.appCtx.autosaveTimeoutId = null),
    navigateInShell(runtime.studioBackLinkElement.href)
}

/**
 * 立即保存（自动保存 / 退出 / 手动保存共用）：闸门在本文件，状态机与退避在 save-store。
 * 在途 PUT 由 save-store 去重；409 / 428 的结果统一在 settleStudioSaveResult 里处理。
 */
export async function flushAutosave(runtime: StudioAppRuntime): Promise<void> {
  if (
    runtime.isEmbeddedStage ||
    runtime.appCtx.isPageSuspended ||
    !runtime.appCtx.loadedDraft ||
    runtime.isStudioDraftReadonly()
  )
    return
  if (runtime.isInteractionBusy()) {
    runtime.appCtx.isInteractionDeferredSave = true
    return
  }
  runtime.appCtx.isInteractionDeferredSave = false
  window.clearTimeout(runtime.appCtx.autosaveTimeoutId), (runtime.appCtx.autosaveTimeoutId = null)
  try {
    await runtime.runStudioSaveOnce('autosave')
  } finally {
    for (const saveWaiter of runtime.saveWaiterResolvers) saveWaiter()
    runtime.saveWaiterResolvers.clear(), runtime.scheduleAutosave()
  }
}
