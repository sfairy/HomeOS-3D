import { normalizeStudioDocument } from '../../scene/payload/studio-document-payload'
import { normalizeBaseLightingByTheme as normalizeBaseLightingByTheme2 } from '../../../loaders/studio-normalization'
import { normalizeSceneStyle as normalizeSceneStyle2 } from '../../../../shared/scene-styles'
import { previewStyleOrDefault, syncPreviewStyleSelect } from '../ui/studio-preview-style'
import { syncNaturalWoodForAppCtx } from '../ui/studio-natural-wood-runtime'
import { syncLightingRow } from '../ui/lighting-row-install'

import type { StudioAppContext } from '../studio-app-context'
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
