import { normalizeStudioDocument } from './scene/payload/studio-document-payload'
import { normalizeBaseLightingByTheme as normalizeBaseLightingByTheme2 } from './loaders/studio-normalization'
import { normalizeSceneStyle as normalizeSceneStyle2 } from '../app/shared/scene-styles'
import { previewStyleOrDefault, syncPreviewStyleSelect, syncNaturalWoodForAppCtx } from './ui/preview-style'
import { syncLightingRow } from './ui/lighting'
import { type StudioAppContext } from './app-context'
import { type StudioAppRuntime } from './runtime/studio-app-runtime'
import { remapOpeningsToWalls } from './plan/studio-wall'
import { domElement } from '@app/shared/util/dom-factory'
import {
  clampWindowT as clampWindowT2,
  mergeCollinearWallSegments as mergeCollinearWallSegments2,
  remapWallAttachment as remapWallAttachment2,
} from './plan/geometry'
import {
  remapWindowOrientation as remapWindowOrientation2,
  type WindowWallSegment,
} from '@app/shared/scene/window/window-deletion'
import { syncCourtyardGates as syncCourtyardGates2 } from './plan/courtyard-drawing'
import { navigateInShell } from '@/studio/platform/shell-navigation'
import { shellNotify } from '@/studio/platform/shell-chrome'
import { patchStudioFacadeState, getStudioFacadeState } from '../engine/index'
import { resolveInteractionCleanup } from './ui/studio-interaction-cleanup'
import {
  StudioSaveStore,
  type FlushResult,
  type SaveStoreState,
  type SceneSyncOutcome,
  applyDocumentPatch,
  canApplyDocumentPatch,
  type DocumentPatch,
  diffDocumentPatches,
  describeDocumentPatch,
} from './store/index'
import { refreshStepChecklist } from './ui/onboarding'
import { type StudioApiRequestOptions } from './studio-app-types'
import { validatePlacementChange as validatePlacementChange2 } from './items/studio-placement'
import { buildStudioHistoryPatch } from './ui/studio-history'
import { historyChangePreviewScope, itemPreviewScope, type PreviewScope } from './scene/studio-preview-scope'
import { previewScopeOptions } from './interaction/picking'

export interface ApplyLoadedDraftDeps {
  appCtx: StudioAppContext
  applyBaseLighting: any
  applyCameraSnapshot: any
  captureCameraView: any
  collectScenePayload: any
  collectSelectedFloors: () => any[]
  ensureExternalModelLoaded: (record: any) => any
  finishModelLoad: any
  floorSelectionId: any
  getActiveFloor: any
  getCameraMode: any
  getStudioSaveStore: any
  hideStudioReadonlyBanner: any
  isAutoDiagramEmbed: any
  isEmbeddedStage: any
  loadBackgroundImage: any
  loadModelsForTypes: (payload: any) => any[]
  pendingHistoryScene: any
  preloadPersistentModels: any
  publishModelLoadState: any
  refreshLightAreasFromHa: any
  refreshPreviewScene: any
  refreshScopeItems: any
  refreshSelection: any
  renderFloorList: any
  requestSceneRebuild: any
  resetView: any
  resizePlanStage: any
  scheduleLightPrecompile: any
  scheduleModelLoadFlush: any
  setCameraMode: any
  stageLoadTiming: any
  studioDocumentDeps: any
  studioDocumentStore: any
  studioDraftReadonly: any
  studioHistoryStore: any
  syncStudioHistoryFacade: any
  updateCameraView: any
  updateFloorPreviewButtons: any
}

/**
 * 草稿加载时生效的基础光照：优先**当前预览风格**那一份，老文档回落到文档级 `baseLighting`。
 *
 * 风格来源不直接用 `project.sceneStyle`：编辑器里的预览偏好（localStorage）优先级更高，
 * 与 `#editor-scene-style` 的选择保持一致，否则「选了自然木语但打开是默认光照」。
 */
function draftBaseLighting(
  runtime: { appCtx: { sceneStyle: string } },
  project: Record<string, unknown> | null | undefined,
) {
  const style = previewStyleOrDefault(project?.sceneStyle)
  runtime.appCtx.sceneStyle = style
  const byTheme = normalizeBaseLightingByTheme2(project?.baseLightingByTheme)
  return byTheme[normalizeSceneStyle2(style)] ?? project?.baseLighting
}

/**
 * 把草稿里的光影模式变成**当前管线**（0.8.9）。
 *
 * 只改字段不换管线的话，按钮会显示「轻量柔光」而画面还是标准光影 ——
 * 正是上游注释里说的「切了和没切一样」。抽成函数是为了不给
 * `applyLoadedDraft` 那个超长函数再加一个三元。
 *
 * 顺带把按钮的选中态同步一次：`installLightingRow` 绑定时草稿还没到，那次读到的是缺省值
 * （标准光影）。不同步的话画面已经是草稿里的「轻量柔光」，按钮却停在「标准光影」——
 * 用户点高亮的那个按钮会被 `readDraftLightingMode === requested` 直接吞掉（看起来
 * 「点了没反应」），只能去点另一个（而那个会触发一次整场景重建）。
 */
function applyDraftLightingMode(deps: ApplyLoadedDraftDeps, isEmbeddedStage: boolean): void {
  const appCtx = deps.appCtx,
    draftMode = appCtx.studioState?.settings?.lightingMode === 'region' ? 'region' : 'standard'
  if (((appCtx.previewLightingMode = draftMode), isEmbeddedStage)) return
  // 嵌入舞台的管线由 URL 决定（`isEmbedStageMode`），草稿字段对它无效；
  // 在那里调 `applyLightingPipeline` 会把刚刚建好的区域控制器拆了重建，白丢一次接触阴影预热。
  appCtx.applyLightingPipeline?.(draftMode)
  syncLightingRow(deps)
}

export async function applyLoadedDraft(deps: ApplyLoadedDraftDeps, draftPayload: any, draftScene: any = null) {
  const {
    appCtx,
    applyBaseLighting,
    applyCameraSnapshot,
    captureCameraView,
    collectScenePayload,
    collectSelectedFloors,
    ensureExternalModelLoaded,
    finishModelLoad,
    floorSelectionId,
    getActiveFloor,
    getCameraMode,
    getStudioSaveStore,
    hideStudioReadonlyBanner,
    isAutoDiagramEmbed,
    isEmbeddedStage,
    loadBackgroundImage,
    loadModelsForTypes,
    preloadPersistentModels,
    publishModelLoadState,
    refreshLightAreasFromHa,
    refreshPreviewScene,
    refreshScopeItems,
    refreshSelection,
    renderFloorList,
    requestSceneRebuild,
    resetView,
    resizePlanStage,
    scheduleLightPrecompile,
    scheduleModelLoadFlush,
    setCameraMode,
    stageLoadTiming,
    studioDocumentDeps,
    studioDocumentStore,
    studioHistoryStore,
    syncStudioHistoryFacade,
    updateCameraView,
    updateFloorPreviewButtons,
  } = deps

  stageLoadTiming('draft-normalize-start')
  const draftApplyRequestId = ++appCtx.draftLoadRequestId
  if (
    (window.clearTimeout(appCtx.modelLoadDebounceId),
    (appCtx.modelLoadDebounceId = null),
    (appCtx.deferredModelTypes = []),
    (appCtx.isExternalModelLoadDeferred = false),
    (window.externalModelLoadsDeferred = false),
    (appCtx.loadedDraft = draftPayload),
    // C3：GET / 冲突载入 / 只读重试的草稿在这里成为新的版本权威与干净基线。
    // C4：全量同步载荷（interaction3d 场景）不带 revision —— 保留当前已载入 revision，
    // 不把保存版本线打回 0（否则下一次 CAS PUT 必然 409）。
    studioDocumentStore.applyLoaded({
      revision:
        typeof draftPayload?.revision === 'number' ? draftPayload.revision : studioDocumentStore.getLoadedRevision(),
      scene: draftPayload?.scene,
    }),
    getStudioSaveStore().acceptLoaded(),
    (deps.studioDraftReadonly = false),
    hideStudioReadonlyBanner(),
    (appCtx.localSaveRevision = 0),
    (appCtx.remoteSaveRevision = 0),
    (appCtx.firstLocalChangeAt = appCtx.lastLocalChangeAt = null),
    (appCtx.pendingConflict = null),
    (appCtx.isSceneStillLoading = isEmbeddedStage),
    (appCtx.studioProject = draftScene || normalizeStudioDocument(draftPayload.scene, studioDocumentDeps())),
    isEmbeddedStage)
  ) {
    for (const livePreviewFloor of appCtx.studioProject.floors)
      livePreviewFloor.scene.settings.livePreviewEnabled = true
  }
  if (
    (applyBaseLighting(draftBaseLighting({ appCtx }, appCtx.studioProject)),
    syncPreviewStyleSelect({ appCtx, isEmbeddedStage }),
    // 载入时风格就已经是自然木语的话，也必须补一次启停（否则贴图与环境永远不加载）。
    syncNaturalWoodForAppCtx(
      appCtx,
      normalizeSceneStyle2(appCtx.sceneStyle),
      (appCtx.studioState?.settings as Record<string, unknown> | undefined)?.warmBackgroundTheme as string | undefined,
    ),
    (appCtx.activeFloorId = appCtx.studioProject.activeFloorId),
    isAutoDiagramEmbed && appCtx.studioProject.floors.length > 1 && (appCtx.studioProject.previewFloorMode = 'all'),
    isAutoDiagramEmbed && floorSelectionId !== null)
  ) {
    const floorSelectionRecord = appCtx.studioProject.floors.find(
      (floorSelectionMatch: any) => floorSelectionMatch.id === floorSelectionId,
    )
    floorSelectionId === 'all' && appCtx.studioProject.floors.length > 1
      ? (appCtx.studioProject.previewFloorMode = 'all')
      : floorSelectionRecord &&
        ((appCtx.studioProject.previewFloorMode = 'active'),
        (appCtx.studioProject.activeFloorId = floorSelectionRecord.id),
        (appCtx.activeFloorId = floorSelectionRecord.id))
  }
  ;(appCtx.studioState = getActiveFloor().scene),
    applyDraftLightingMode(deps, isEmbeddedStage),
    (appCtx.activeLightGroupId = ''),
    refreshSelection(),
    refreshPreviewScene(),
    (appCtx.undoRecords = []),
    (appCtx.redoRecords = []),
    studioHistoryStore?.clear(),
    (deps.pendingHistoryScene = null)
  // 整篇载入 = 新基线，旧历史补丁不再适用。
  syncStudioHistoryFacade()

  // HA 区域只喂灯光面板，与模型选型无关：先发请求、先起模型下载，再等区域落地。
  const lightAreasRefresh = refreshLightAreasFromHa()
  const selectedFloorRecords = collectSelectedFloors()
  if (isEmbeddedStage) {
    appCtx.isExternalModelPending = true
    const sceneModelPayload = collectScenePayload(appCtx.studioProject.floors, {
      includeCurtains: true,
    })
    preloadPersistentModels(sceneModelPayload),
      Promise.allSettled(loadModelsForTypes(sceneModelPayload)).then(
        (modelLoadResults) => (stageLoadTiming('initial-models-ready'), modelLoadResults),
      ),
      stageLoadTiming('initial-models-start')
  }
  await lightAreasRefresh
  const Qe2 = isAutoDiagramEmbed
  Qe2 && (appCtx.isModelLoadDeferred = true)
  let preloadModelPromises: any[] = []
  Qe2 && (preloadModelPromises = selectedFloorRecords.map((modelRecord) => ensureExternalModelLoaded(modelRecord))),
    (appCtx.isExternalModelLoadDeferred = !Qe2 && !isEmbeddedStage),
    (window.externalModelLoadsDeferred = appCtx.isExternalModelLoadDeferred),
    (appCtx.deferredModelTypes = Qe2 ? [] : selectedFloorRecords),
    appCtx.isExternalModelLoadDeferred && scheduleModelLoadFlush(),
    publishModelLoadState(),
    updateFloorPreviewButtons(),
    renderFloorList(),
    (appCtx.planView.rotation = appCtx.studioState.settings.planViewRotation),
    stageLoadTiming('background-start')
  const gu3 = loadBackgroundImage()
  if (
    (isEmbeddedStage || (await gu3),
    stageLoadTiming('background-end'),
    refreshScopeItems(Qe2 ? 'none' : 'all'),
    !Qe2 && !isEmbeddedStage && scheduleLightPrecompile(1200),
    Qe2)
  )
    try {
      const allSettled = Promise.allSettled(preloadModelPromises)
      await Promise.race([
        allSettled,
        new Promise((raceTimeoutResolve) => window.setTimeout(raceTimeoutResolve, 3500)),
      ]),
        Promise.allSettled(preloadModelPromises).then(() => {
          draftApplyRequestId === appCtx.draftLoadRequestId && finishModelLoad()
        })
    } finally {
      draftApplyRequestId === appCtx.draftLoadRequestId &&
        (window.clearTimeout(appCtx.modelLoadTimeoutId),
        (appCtx.modelLoadTimeoutId = null),
        (appCtx.isModelLoadDeferred = false),
        publishModelLoadState())
    }
  else
    requestSceneRebuild({
      force: true,
    }),
      preloadModelPromises.length &&
        Promise.allSettled(preloadModelPromises).then(() => {
          draftApplyRequestId === appCtx.draftLoadRequestId && finishModelLoad()
        })
  resizePlanStage(),
    resetView(),
    !Qe2 &&
      !isEmbeddedStage &&
      requestAnimationFrame(() => {
        captureCameraView()
          ? applyCameraSnapshot({
              recordChange: false,
              silent: true,
            })
          : (setCameraMode(getCameraMode(), {
              preserveView: false,
            }),
            updateCameraView())
      })
}

export function markWallsChanged(runtime: StudioAppRuntime) {
  const tf3 = remapOpeningsToWalls(
    runtime.appCtx.studioState.walls,
    runtime.appCtx.studioState.windows,
    runtime.appCtx.studioState.doors,
    runtime.getPixelsPerMeter() || 1,
    runtime.appCtx.studioState.railings,
  )
  ;(runtime.appCtx.studioState.walls = tf3.walls),
    (runtime.appCtx.studioState.windows = tf3.windows),
    (runtime.appCtx.studioState.doors = tf3.doors),
    (runtime.appCtx.studioState.railings = tf3.railings)
}

export function rebuildWallIndex(runtime: StudioAppRuntime) {
  const wallByIdBeforeMerge = new Map(runtime.appCtx.studioState.walls.map((wallEntry) => [wallEntry.id, wallEntry])),
    mergedWallResult = mergeCollinearWallSegments2(runtime.appCtx.studioState.walls, 0.000001)
  if (mergedWallResult.walls.length === runtime.appCtx.studioState.walls.length) return 0
  const wallByIdAfterMerge = new Map(
      mergedWallResult.walls.map((mergedWallEntry: any) => [mergedWallEntry.id, mergedWallEntry]),
    ),
    remapWallAttachment = (attachmentRecord: any) => {
      const mergedWallId = mergedWallResult.wallIdMap.get(attachmentRecord.wallId),
        sourceWallRecord = wallByIdBeforeMerge.get(attachmentRecord.wallId),
        targetWallRecord = wallByIdAfterMerge.get(mergedWallId)
      if (!mergedWallId || !sourceWallRecord || !targetWallRecord) return attachmentRecord
      const remappedAttachment = remapWallAttachment2(attachmentRecord, sourceWallRecord, targetWallRecord)
      return (
        (remappedAttachment.t = clampWindowT2(targetWallRecord, remappedAttachment, runtime.getPixelsPerMeter() || 1)),
        remappedAttachment
      )
    },
    /**
     * 窗的 `t` 重算之后还要修正**朝向**：合并可能把墙的 start/end 对调，
     * 位置不变但「内开 / 外开」会翻面（见 `remapWindowOrientation`）。
     * 只对窗做 —— 门没有 `wallDirection`，栏杆也没有。
     */
    remapWindowAttachment = (windowRecord: Record<string, unknown> & { wallId?: string }) => {
      const remappedWindow = remapWallAttachment(windowRecord),
        sourceWallRecord = wallByIdBeforeMerge.get(windowRecord.wallId) as WindowWallSegment | undefined,
        targetWallRecord = wallByIdAfterMerge.get(mergedWallResult.wallIdMap.get(windowRecord.wallId)) as
          | WindowWallSegment
          | undefined
      if (!sourceWallRecord || !targetWallRecord) return remappedWindow
      return remapWindowOrientation2(remappedWindow as never, sourceWallRecord, targetWallRecord)
    },
    removedWallCount = runtime.appCtx.studioState.walls.length - mergedWallResult.walls.length
  return (
    (runtime.appCtx.studioState.walls = mergedWallResult.walls),
    (runtime.appCtx.studioState.windows = runtime.appCtx.studioState.windows.map(remapWindowAttachment)),
    (runtime.appCtx.studioState.doors = runtime.appCtx.studioState.doors.map(remapWallAttachment)),
    (runtime.appCtx.studioState.railings = runtime.appCtx.studioState.railings.map(remapWallAttachment)),
    removedWallCount
  )
}

export function getPixelsPerMeter(runtime: StudioAppRuntime) {
  return runtime.appCtx.studioState.calibration?.pixelsPerMeter || 0
}

export function historyUndoDepth(runtime: StudioAppRuntime): number {
  return runtime.studioHistoryStore?.undoDepth ?? 0
}

export function historyRedoDepth(runtime: StudioAppRuntime): number {
  return runtime.studioHistoryStore?.redoDepth ?? 0
}

export function isStudioDraftReadonly(runtime: StudioAppRuntime): boolean {
  return runtime.studioDraftReadonly
}

/** 保存草稿副本：409 第三出口、只读横幅入口共用（纯本地下载，不动服务器状态）。 */
export function downloadStudioLocalCopy(runtime: StudioAppRuntime, localSceneOverride?: any): boolean {
  try {
    let localScene = localSceneOverride
    if (localScene === undefined) {
      try {
        localScene = runtime.getLocalSaveRevision()
      } catch {
        localScene = runtime.appCtx.studioProject || null
      }
    }
    const exportedCopy = {
      revision: runtime.studioDocumentStore.getLoadedRevision(),
      exportedAt: new Date().toISOString(),
      scene: localScene,
    }
    const localCopyBlob = new Blob([JSON.stringify(exportedCopy, null, 2)], {
      type: 'application/json',
    })
    const localCopyUrl = URL.createObjectURL(localCopyBlob)
    const downloadAnchor = document.createElement('a')
    downloadAnchor.href = localCopyUrl
    downloadAnchor.download = 'studio-draft-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'
    downloadAnchor.rel = 'noopener'
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(localCopyUrl), 1000)
    runtime.showToast('本地副本已导出。', 'success')
    return true
  } catch (exportFailure: any) {
    runtime.showToast(exportFailure?.message || '导出本地副本失败。', 'error')
    return false
  }
}

export function renderStudioReadonlyBanner(runtime: StudioAppRuntime, bannerMessage: string): void {
  if (runtime.isEmbeddedStage) return
  if (!runtime.studioReadonlyBannerElement) {
    const banner = document.createElement('div')
    banner.id = 'studio-readonly-banner'
    banner.setAttribute('role', 'status')
    banner.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:80;display:flex;gap:12px;align-items:center;' +
      'justify-content:center;padding:8px 16px;background:#7a2e2e;color:#fff;font-size:13px;'
    const bannerLabel = domElement(document, 'span', 'studio-readonly-message')
    const retryLoadButton = document.createElement('button')
    retryLoadButton.type = 'button'
    retryLoadButton.textContent = '重试载入'
    retryLoadButton.addEventListener('click', () => {
      void runtime.retryStudioDraftLoad()
    })
    const exportCopyButton = document.createElement('button')
    exportCopyButton.type = 'button'
    exportCopyButton.textContent = '导出本地副本'
    exportCopyButton.addEventListener('click', () => {
      runtime.downloadStudioLocalCopy()
    })
    banner.append(bannerLabel, retryLoadButton, exportCopyButton)
    document.body.appendChild(banner)
    runtime.studioReadonlyBannerElement = banner
  }
  const bannerMessageElement = runtime.studioReadonlyBannerElement.querySelector('.studio-readonly-message')
  bannerMessageElement && (bannerMessageElement.textContent = bannerMessage)
  runtime.studioReadonlyBannerElement.hidden = false
}

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

export function syncStudioHistoryFacade(runtime: StudioAppRuntime) {
  patchStudioFacadeState({
    history: buildStudioHistoryPatch(runtime.historyUndoDepth(), runtime.historyRedoDepth()),
    activeTool: runtime.appCtx.activeToolName,
  })
}

/**
 * 复制 / 粘贴按钮的可用性。
 *
 * 选择或剪贴板一变就 patch —— 但**先比对**当前 facade 值，相同则不派发：
 * `refreshStudioUi` 在一次点击里会被调多次，无脑 patch 会让壳层每个事件都整体换一份
 * state 对象，按钮的 `:disabled` 也跟着抖。剪贴板内容不参与比较（不可枚举）。
 */
export function syncStudioClipboardFacade(runtime: StudioAppRuntime) {
  const canCopy = runtime.collectSelectedPlanItems().length > 0
  const canPaste = runtime.appCtx.clipboardItems.length > 0
  const currentClipboard = getStudioFacadeState().clipboard
  if (currentClipboard?.canCopy === canCopy && currentClipboard?.canPaste === canPaste) return
  patchStudioFacadeState({ clipboard: { canCopy, canPaste } })
}

/** 撤销 / 重做：先 canApply 再出栈；失败不出栈，应用失败由历史 store 压回并回调提示。 */
export function historyFailureMessage(_runtime: StudioAppRuntime, direction: 'undo' | 'redo', reason: string): string {
  const historyActionName = direction === 'undo' ? '撤销' : '重做'
  return reason === 'not-applicable'
    ? '无法' + historyActionName + '：该操作与后续改动冲突（例如合并墙上新增了门窗或栏杆）。'
    : historyActionName + '失败：历史状态已失效，未做修改。'
}

export async function undoStudioHistory(runtime: StudioAppRuntime) {
  await runtime.applyStudioHistoryDirection('undo')
}

export async function redoStudioHistory(runtime: StudioAppRuntime) {
  await runtime.applyStudioHistoryDirection('redo')
}

export async function applyStudioHistoryDirection(runtime: StudioAppRuntime, direction: 'undo' | 'redo') {
  const historyStore = runtime.studioHistoryStore
  if (!historyStore) return
  if (runtime.isStudioDraftReadonly()) {
    runtime.showToast('只读：草稿载入失败，无法撤销 / 重做。', 'error')
    return
  }
  runtime.pendingHistoryScene = null
  // 补丁是在 `undo()` / `redo()` 内部就地应用的，所以「改前」必须提前拍快照，
  // 否则撤销重做只能保守地整屏重建（`historyChangePreviewScope` 需要前后两份场景）。
  const previousScene = captureHistoryScene(runtime)
  const historyResult = direction === 'undo' ? historyStore.undo() : historyStore.redo()
  if (!historyResult.ok) {
    if (historyResult.reason !== 'empty')
      runtime.showToast(runtime.historyFailureMessage(direction, historyResult.reason), 'warning')
    runtime.syncStudioHistoryFacade()
    return
  }
  runtime.refreshAfterHistoryChange(historyResult.entry.patch, previousScene)
  runtime.syncStudioHistoryFacade()
}

/** 撤销 / 重做前的场景快照；克隆失败时返回 null，调用方退回整屏重建。 */
function captureHistoryScene(runtime: StudioAppRuntime): Record<string, unknown> | null {
  const scene = runtime.appCtx.studioState
  if (!scene) return null
  try {
    return structuredClone(scene) as unknown as Record<string, unknown>
  } catch {
    return null
  }
}

/** 补丁影响到的楼层 id（batch 递归展开），用于刷新楼层缩略图与楼层组。 */
export function collectPatchFloorIds(
  runtime: StudioAppRuntime,
  documentPatch: DocumentPatch,
  affectedFloorIds = new Set<string>(),
): Set<string> {
  if (documentPatch.kind === 'batch') {
    for (const nestedPatch of documentPatch.patches) runtime.collectPatchFloorIds(nestedPatch, affectedFloorIds)
    return affectedFloorIds
  }
  if (documentPatch.floorId) affectedFloorIds.add(documentPatch.floorId)
  return affectedFloorIds
}

/** 合并墙保护：撤销会改写活动楼层的墙，而当前墙上已有新增门窗 / 栏杆时判定不可应用。 */
export function canApplyHistoryPatch(runtime: StudioAppRuntime, documentPatch: DocumentPatch): boolean {
  try {
    const currentProject = runtime.appCtx.studioProject
    if (!currentProject || !canApplyDocumentPatch(currentProject, documentPatch)) return false
    const targetProject = structuredClone(currentProject)
    if (!applyDocumentPatch(targetProject, documentPatch)) return false
    const activeFloor = runtime.getActiveFloor()
    const targetFloor = targetProject.floors?.find(
      (floorRecord: any) => floorRecord.id === (activeFloor?.id ?? runtime.appCtx.activeFloorId),
    )
    if (!activeFloor?.scene || !targetFloor?.scene) return true
    const targetWallById = new Map<string, any>(
      (targetFloor.scene.walls || []).map((targetWall: any) => [targetWall.id, targetWall]),
    )
    const changedWallIds = new Set<string>()
    for (const currentWall of activeFloor.scene.walls || []) {
      const targetWall = targetWallById.get(currentWall?.id)
      if (
        targetWall &&
        (targetWall.start?.x !== currentWall.start?.x ||
          targetWall.start?.y !== currentWall.start?.y ||
          targetWall.end?.x !== currentWall.end?.x ||
          targetWall.end?.y !== currentWall.end?.y)
      )
        changedWallIds.add(currentWall.id)
    }
    if (!changedWallIds.size) return true
    for (const attachmentKey of ['windows', 'doors', 'railings']) {
      const targetAttachmentIds = new Set(
        (targetFloor.scene[attachmentKey] || []).map((attachmentRecord: any) => attachmentRecord.id),
      )
      if (
        (activeFloor.scene[attachmentKey] || []).some(
          (attachmentRecord: any) =>
            changedWallIds.has(attachmentRecord.wallId) && !targetAttachmentIds.has(attachmentRecord.id),
        )
      )
        return false
    }
    return true
  } catch {
    return false
  }
}

/**
 * 历史补丁已就地改完文档，这里只同步运行时派生视图（活动楼层场景 / 旋转 / 预览 / 楼层组）。
 *
 * `previousScene` 是补丁应用**之前**的活动楼层场景快照。有了它就能按
 * `historyChangePreviewScope` 精确决定重绘范围：只改备注 / 选择 → `'none'`，改了灯 → `'lights'`，
 * 改了物品 → `'items'`；拿不到快照或判定不出来时退回 `'all'`（保守）。
 */
export function refreshAfterHistoryChange(
  runtime: StudioAppRuntime,
  documentPatch: DocumentPatch,
  previousScene?: Record<string, unknown> | null,
) {
  const affectedFloorIds = runtime.collectPatchFloorIds(documentPatch)
  const activeFloor = runtime.getActiveFloor()
  if (activeFloor && affectedFloorIds.has(activeFloor.id)) {
    runtime.appCtx.studioState = activeFloor.scene
    runtime.appCtx.planView.rotation =
      runtime.appCtx.studioState?.settings?.planViewRotation ?? runtime.appCtx.planView.rotation
  }
  runtime.selectStudioTool('select'),
    runtime.refreshSelection(),
    runtime.refreshPreviewScene(),
    runtime.refreshScopeItems(resolveHistoryPreviewScope(runtime, previousScene)),
    void runtime.loadBackgroundImage(),
    runtime.syncFloorGroups(affectedFloorIds),
    runtime.renderFloorList(),
    runtime.markDocumentDirty()
}

/** 撤销 / 重做需要重绘的作用域；快照缺失或判定失败时保守返回 `'all'`。 */
function resolveHistoryPreviewScope(
  runtime: StudioAppRuntime,
  previousScene?: Record<string, unknown> | null,
): PreviewScope {
  const nextScene = runtime.appCtx.studioState as unknown as Record<string, unknown> | undefined
  if (!previousScene || !nextScene) return 'all'
  try {
    const options = previewScopeOptions(runtime)
    return historyChangePreviewScope(previousScene, nextScene, {
      itemScope: (item) => itemPreviewScope(item, options),
      selectionScope: () => runtime.getCurrentPreviewScope(),
    })
  } catch {
    return 'all'
  }
}

export function validateSelectionChange(runtime: StudioAppRuntime, placementChange: any) {
  const placementError = validatePlacementChange2(
    placementChange,
    runtime.appCtx.studioState,
    runtime.getPixelsPerMeter() || 100,
  )
  return placementError
    ? (runtime.showToast(placementError, 'error'),
      runtime.appCtx.selectedItem && !runtime.getSelectedObject() && runtime.refreshSelection(),
      (runtime.appCtx.selectedItems = runtime.appCtx.selectedItems.filter(
        (selectionEntry: any) =>
          selectionEntry.kind !== 'item' ||
          runtime.appCtx.studioState.items.some((selectedItemMatch) => selectedItemMatch.id === selectionEntry.id),
      )),
      false)
    : true
}

/** 编辑前快照：同一楼层只保留最早一份（一次操作 = 一个事务）；切楼层后按新楼层重挂。 */
export function primeHistorySnapshot(runtime: StudioAppRuntime, snapshotScene: any = undefined) {
  const floorId = runtime.getActiveFloor()?.id ?? runtime.appCtx.activeFloorId
  if (!floorId) return
  if (runtime.pendingHistoryScene?.floorId === floorId) return
  runtime.pendingHistoryScene = {
    floorId,
    scene: snapshotScene === undefined ? runtime.captureUndoSnapshot() : snapshotScene,
  }
}

export function deselectAll(runtime: StudioAppRuntime) {
  runtime.primeHistorySnapshot()
}

export function applyPlacementChange(runtime: StudioAppRuntime, undoSnapshot: any) {
  runtime.primeHistorySnapshot(undoSnapshot)
}

/** markDocumentDirty 时把「编辑前快照 → 当前文档」的差异记成一条历史；纯选择没有 diff 条目。 */
export function flushPendingHistory(runtime: StudioAppRuntime) {
  const pendingSnapshot = runtime.pendingHistoryScene
  runtime.pendingHistoryScene = null
  const historyStore = runtime.studioHistoryStore
  if (!pendingSnapshot || !historyStore) return
  const currentProject = runtime.appCtx.studioProject
  if (!currentProject?.floors?.some((floorRecord: any) => floorRecord.id === pendingSnapshot.floorId)) return
  let beforeDocument: any
  try {
    beforeDocument = structuredClone(currentProject)
  } catch {
    return
  }
  const beforeFloor = beforeDocument.floors.find((floorRecord: any) => floorRecord.id === pendingSnapshot.floorId)
  if (!beforeFloor) return
  beforeFloor.scene = pendingSnapshot.scene
  const documentPatch = diffDocumentPatches(beforeDocument, currentProject)
  if (!documentPatch) return
  historyStore.record(documentPatch, describeDocumentPatch(documentPatch))
  runtime.syncStudioHistoryFacade()
}

/**
 * `persistence` 域的对外出口：本目录各文件的导出在此汇总。
 *
 * 存在意义：`boot.ts` 是转发层，需要本域的全部实现函数；逐文件 import 会把它
 * 的导入段撑到几百行（拆分子域后一度涨到 126 个 import 块）。按域导入让
 * 「这个域提供什么」在调用点一眼可见，同时把导入行数压回可控范围。
 * 域内文件之间仍直接相对 import，不经 barrel（避免环与无谓的间接层）。
 */

/**
 * Q03：首帧后闲时对近场 lite→full（聚焦类型若有则优先）。
 *
 * 从 `scene-layers-and-floor-build.ts` 的 waitForSceneReady 拆出。
 */

type NearbyUpgradeRuntime = {
  appCtx: {
    selectedItems?: unknown[]
    scheduleNearbyModelUpgrades?: (() => void) | null
  }
  externalModelRegistry?: {
    modelTypeForItem?: (item: unknown) => string | null | undefined
    upgradeModelsNearCamera?: (opts: {
      camera: unknown
      root: unknown
      nearDistance: number
      maxUpgrades: number
      focusTypes: string[]
    }) => Promise<string[] | void> | undefined
  }
  requestSceneRebuild?: (opts: { force: boolean; externalModelsOnly: boolean; scope: string }) => void
}

/** 绑定近场升级调度；idle 时跑一轮，并把同一函数挂到 appCtx 供运动静止后复用。 */
export function scheduleNearbyModelUpgradesAfterReady(params: {
  runtime: NearbyUpgradeRuntime
  isSceneStable: () => boolean
  camera: unknown
  sceneRoot: unknown
}): void {
  const { runtime, isSceneStable, camera, sceneRoot } = params
  const scheduleNearbyUpgrades = () => {
    if (!isSceneStable()) return
    const focusTypes = (runtime.appCtx.selectedItems || [])
      .map((item) => runtime.externalModelRegistry?.modelTypeForItem?.(item))
      .filter(Boolean) as string[]
    runtime.externalModelRegistry
      ?.upgradeModelsNearCamera?.({
        camera,
        root: sceneRoot,
        nearDistance: 4,
        maxUpgrades: 2,
        focusTypes,
      })
      ?.then?.((upgraded: string[] | void) => {
        upgraded?.length &&
          runtime.requestSceneRebuild?.({
            force: true,
            externalModelsOnly: true,
            scope: 'items',
          })
      })
  }
  const idleWindow = globalThis.window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
  }
  if (typeof idleWindow?.requestIdleCallback === 'function') {
    idleWindow.requestIdleCallback(scheduleNearbyUpgrades, { timeout: 4000 })
  } else {
    globalThis.window?.setTimeout?.(scheduleNearbyUpgrades, 400)
  }
  runtime.appCtx.scheduleNearbyModelUpgrades = scheduleNearbyUpgrades
}
