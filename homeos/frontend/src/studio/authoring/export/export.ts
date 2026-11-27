/**
 * 导出：预设、对话框、渲染取图、打包与装饰模型守卫。
 * 导出一条链路的每一步都依赖前一步的产物，分散在 6 个文件里无法一次核对。
 */

import { type StudioAppRuntime } from '../runtime/studio-app-runtime'
import {
  courtyardSurfaceRise as courtyardSurfaceRise2,
  sceneModelOrigin as sceneModelOrigin2,
} from '../plan/courtyard-drawing'
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import { clamp as clamp2 } from '../plan/geometry'
import {
  buildLightDeltaPixels as buildLightDeltaPixels2,
  EXPORT_IMAGE_EXTENSION as EXPORT_IMAGE_EXTENSION2,
  EXPORT_IMAGE_MIME_TYPE as EXPORT_IMAGE_MIME_TYPE2,
  EXPORT_IMAGE_QUALITY as EXPORT_IMAGE_QUALITY2,
  buildStoredZip as buildStoredZip2,
  EXPORT_RENDER_SCALE as EXPORT_RENDER_SCALE2,
  scaledExportResolution as scaledExportResolution2,
} from './export-utils'
import {
  MAX_EXPORT_PRESET_COUNT as MAX_EXPORT_PRESET_COUNT2,
  normalizeExportPresetSlots as normalizeExportPresetSlots2,
  normalizeActiveExportPresetSlot as normalizeActiveExportPresetSlot2,
  exportPresetIsEmpty as exportPresetIsEmpty2,
  normalizeExportPreset as normalizeExportPreset2,
} from './export-presets'
import { syncControlValue as syncControlValue2 } from '../ui/ui-controls'
import { syncStudioSelect as syncStudioSelect2 } from '../ui/studio-widgets'
import { finite as finite2, normalizeLabelText as normalizeLabelText2 } from '../loaders/studio-normalization'
import { stripExportFields } from '../lights/strip-light'
import {
  type ExportImageOptions,
  type ExportImageResult,
  type ExportDialogOptions,
  type ApplyExportOptions,
} from '../studio-app-types'
import { shellConfirm } from '@/studio/platform/shell-chrome'
import { renderExportLayers as renderExportLayersCore, sanitizeExportName } from '../ui/studio-export-layers'
import { elementsById, openDialogPromise } from '../ui/dialogs'
import { lampItemTypeSet } from '../items/item-catalog'
import { previewIssues } from '../loaders/preview-diagnostics'
import { refreshStepChecklist } from '../ui/onboarding'
import { type StudioAppContext } from '../app-context'
import { syncExportSceneStyleLabel } from '../ui/preview-style'

/**
 * 导出前的装饰模型体检（对齐 0.8.9）。
 *
 * 上游在导图前会把本次要画的装饰模型全部预载一遍，任何一件拿不到就直接抛
 * `有装饰模型暂时无法载入，请检查后再导图。` —— 因为 `user-decoration` 的网格
 * **完全**来自 GLB，没有程序化兜底几何，缺模型的那件在成品里就是一片空白，
 * 而页面上不会有任何提示（编辑期它是静默不渲染的）。
 *
 * 本仓的加载失败统一记在 `previewIssues()` 里（见 `loaders/preview-diagnostics.ts`，
 * 记的是 `model:<assetId>`），所以这里只做「把两边对上」：**仅当**失败项是
 * `model:<hex>`、**且**本项目里确实摆着引用该 assetId 的装饰时才算缺失。
 * 静态件（`sofa` 等）的加载失败不拦导出 —— 那是另一个问题，不该顺手堵住导图。
 */

/** 用户装饰的动态模型键：`model:` + 32 位 hex（与 `user-decoration-models.ts` 同口径）。 */
const DECORATION_MODEL_KEY = /^model:([0-9a-f]{32})$/i

type IssueLike = { stage?: string; itemType?: string }
type FloorLike = { scene?: { items?: Array<{ type?: string; assetId?: string; name?: string }> } }

/** 从诊断列表里取出「确实是装饰、确实加载失败」的 assetId（小写）。 */
function failedDecorationAssetIds(issues: IssueLike[]): Set<string> {
  const failed = new Set<string>()
  for (const issue of issues) {
    // `fallback` = 回退成功（已画出来了），`render` = 渲染空白（不是加载问题），都不拦。
    if (issue.stage !== 'load' && issue.stage !== 'parse') continue
    const matched = DECORATION_MODEL_KEY.exec(String(issue.itemType || ''))
    if (matched) failed.add(matched[1].toLowerCase())
  }
  return failed
}

/**
 * 本项目里引用了「拿不到的装饰模型」的物件名（去重、保序）。
 *
 * 返回空数组 = 可以导出。调用方只负责把结果变成一句提示，判定留在这里以便单测。
 *
 * 写成声明式（flatMap → filter → map）而不是双层 for + continue：这条判定将来还会长出
 * 新的排除项，嵌套分支每加一条就把复杂度顶到棘轮线上（这个目录的基线是 0）。
 */
export function missingDecorationNames(floors: FloorLike[] | null | undefined, issues: IssueLike[]): string[] {
  const failed = failedDecorationAssetIds(issues)
  if (!failed.size) return []
  const items = (floors || []).flatMap((floor) => floor?.scene?.items || [])
  const names = items
    .filter((item) => item?.type === 'user-decoration' && failed.has(String(item.assetId || '').toLowerCase()))
    .map(decorationNameOf)
  return [...new Set(names)]
}

/** 物件名缺省时给一个可读占位，避免提示里出现「：。请检查」。 */
function decorationNameOf(item: { name?: string }): string {
  return String(item.name || '').trim() || '未命名装饰'
}

/**
 * 导出文件夹名校验。
 *
 * 从 `generateExportBundle` 里抽出来的：那个函数已经很复杂，
 * 再往里加一条 `||` 会让导出流程更难读。校验规则本身（控制字符 / 保留字符 / 隐藏文件 / 末尾点号）
 * 与上游一致，只是搬了个位置。
 *
 * @returns 非法时返回给用户看的文案，合法返回 `null`。
 */
export function exportFolderNameError(rawFolderName: string): string | null {
  const folderName = rawFolderName.trim()
  if (!folderName) return '请输入有效的文件夹名'
  // biome-ignore lint/suspicious/noControlCharactersInRegex: 导出名校验：控制字符属于必须拒绝的非法文件名范围
  if (/[<>:"/\\|?*\x00-\x1f\x7f]/.test(folderName)) return '请输入有效的文件夹名'
  if (folderName.startsWith('.')) return '请输入有效的文件夹名'
  if (/[. ]$/.test(folderName)) return '请输入有效的文件夹名'
  return null
}

export function saveAsNewPreset(runtime: StudioAppRuntime) {
  if (!runtime.appCtx.pendingRuntimeSettings || runtime.appCtx.isInteractionLocked) return
  if (
    (runtime.saveExportPreset(),
    (runtime.appCtx.studioProject.exportPresets = normalizeExportPresetSlots2(
      runtime.appCtx.studioProject.exportPresets,
    )),
    runtime.appCtx.studioProject.exportPresets.length >= MAX_EXPORT_PRESET_COUNT2)
  ) {
    runtime.showToast('最多可以保存 8 个导出存档。')
    return
  }
  const nextPresetSlotIndex = runtime.appCtx.studioProject.exportPresets.length,
    newPresetName =
      runtime.getPreviewFloorMode() === 'all'
        ? '全楼'
        : runtime.getActiveFloor()?.name || '存档 ' + (nextPresetSlotIndex + 1),
    hf2 = runtime.makeUniquePresetName(newPresetName + '视角'),
    lastExportPreset = runtime.appCtx.studioProject.exportPresets.slice(0, nextPresetSlotIndex).reverse().find(Boolean),
    vf2 = runtime.buildExportPreset({
      name: hf2,
    })
  lastExportPreset &&
    ((vf2!.width = lastExportPreset.width),
    (vf2!.height = lastExportPreset.height),
    (vf2!.lockRatio = lastExportPreset.lockRatio)),
    runtime.appCtx.studioProject.exportPresets.push(vf2),
    (runtime.appCtx.studioProject.activeExportPresetSlot = nextPresetSlotIndex),
    (runtime.appCtx.isExportPresetDirty = false),
    runtime.renderExportPresetSlots(),
    runtime.markDocumentDirty(),
    (runtime.exportStatusElement.textContent = '已新增“' + hf2 + '”'),
    runtime.showToast('已新增“' + hf2 + '”，可以继续调整楼层和视角。', 'success')
}

export function ensureSceneRendered(runtime: StudioAppRuntime, renderAttempt = 0) {
  !runtime.isAutoDiagramEmbed ||
    !runtime.autoDiagramComponentId ||
    window.parent === window ||
    requestAnimationFrame(() => {
      if (
        !runtime.appCtx.pendingRuntimeSettings ||
        !runtime.appCtx.threeRenderer ||
        !runtime.appCtx.threeScene ||
        !runtime.appCtx.threeCamera ||
        !runtime.appCtx.orbitControls
      )
        return
      runtime.resizeRenderCanvas(), runtime.appCtx.sceneRootNode?.children?.length || runtime.rebuildFloorLayers()
      const hasUsableViewport =
          runtime.exportPreviewStageElement.clientWidth > 1 && runtime.exportPreviewStageElement.clientHeight > 1,
        hasSceneChildren = !!runtime.appCtx.sceneRootNode?.children?.length
      let isSceneReady = false
      if (hasUsableViewport && hasSceneChildren) {
        runtime.refreshSceneRender({
          shadows: true,
        }),
          runtime.appCtx.orbitControls.update()
        for (let renderRetryIndex = 0; renderRetryIndex < 2; renderRetryIndex += 1)
          runtime.appCtx.threeRenderer.render(runtime.appCtx.threeScene, runtime.appCtx.threeCamera)
        const render2 = runtime.appCtx.threeRenderer.info.render
        ;(isSceneReady = render2.calls > 0 && render2.triangles > 0),
          (runtime.appCtx.threeRenderer.domElement.dataset.renderCalls = String(render2.calls)),
          (runtime.appCtx.threeRenderer.domElement.dataset.renderTriangles = String(render2.triangles)),
          (runtime.appCtx.threeRenderer.domElement.dataset.renderLines = String(render2.lines)),
          (runtime.appCtx.isLightCacheReady = false),
          (runtime.appCtx.isLightCachePending = isSceneReady),
          runtime.updateRenderStatsHud()
      }
      if (!isSceneReady && renderAttempt < 7) {
        runtime.ensureSceneRendered(renderAttempt + 1)
        return
      }
      if (!isSceneReady) {
        window.parent.postMessage(
          {
            type: 'homeos-floorplan-auto-diagram-error',
            componentId: runtime.autoDiagramComponentId,
            message: '3D户型首帧渲染失败，请刷新后重试。',
          },
          window.location.origin,
        )
        return
      }
      window.parent.postMessage(
        {
          type: 'homeos-floorplan-auto-diagram-ready',
          componentId: runtime.autoDiagramComponentId,
          floors: runtime.appCtx.studioProject.floors.map((exportFloorEntry: any) => ({
            id: exportFloorEntry.id,
            name: exportFloorEntry.name,
          })),
          floorSelection:
            runtime.getPreviewFloorMode() === 'all'
              ? 'all'
              : runtime.getActiveFloor()?.id || runtime.appCtx.activeFloorId,
        },
        window.location.origin,
      )
    })
}

export function prepareFreeCameraCapture(runtime: StudioAppRuntime) {
  const isExportAllFloors = runtime.getPreviewFloorMode() === 'all',
    captureFloorId = isExportAllFloors ? 'all' : runtime.getActiveFloor()?.id || runtime.appCtx.activeFloorId
  runtime.exportFloorSelectElement.replaceChildren(
    ...runtime.appCtx.studioProject.floors.map((captureFloor: any) => {
      const floorOptionElement = document.createElement('option')
      return (
        (floorOptionElement.value = captureFloor.id),
        (floorOptionElement.textContent = captureFloor.name),
        floorOptionElement
      )
    }),
    ...(runtime.appCtx.studioProject.floors.length > 1
      ? [
          Object.assign(document.createElement('option'), {
            value: 'all',
            textContent: '全楼合并',
          }),
        ]
      : []),
  ),
    (runtime.exportFloorSelectElement.value = captureFloorId),
    syncStudioSelect2(runtime.exportFloorSelectElement),
    (runtime.exportFloorGapControlElement.hidden =
      !isExportAllFloors || runtime.appCtx.studioProject.floors.length <= 1),
    syncControlValue2(runtime.exportFloorGapInput, finite2(runtime.appCtx.studioProject.exportFloorGap, 3).toFixed(1)),
    runtime.refreshFloorControls()
}

export function selectPreviewFloor(runtime: StudioAppRuntime, selectedFloorId: any) {
  if (!runtime.appCtx.pendingRuntimeSettings || runtime.appCtx.isInteractionLocked) return
  const isAllFloorsPreview = selectedFloorId === 'all' && runtime.appCtx.studioProject.floors.length > 1
  if (!isAllFloorsPreview) {
    const selectedFloor = runtime.appCtx.studioProject.floors.find(
      (floorCandidate: any) => floorCandidate.id === selectedFloorId,
    )
    if (!selectedFloor) return
    ;(runtime.appCtx.pendingRuntimeSettings.selectedFloorId = selectedFloor.id),
      (runtime.appCtx.studioState = selectedFloor.scene)
  }
  ;(runtime.appCtx.studioProject.previewFloorMode = isAllFloorsPreview ? 'all' : 'active'),
    runtime.prepareFreeCameraCapture(),
    runtime.updateFloorPreviewButtons(),
    runtime.refreshFloorControls(),
    runtime.rebuildFloorLayers(),
    runtime.captureCameraView()
      ? runtime.openExportDialog({
          silent: true,
        })
      : (runtime.setCameraMode(runtime.getCameraMode(), {
          preserveView: false,
        }),
        runtime.updateCameraView()),
    runtime.renderExportLayers(),
    (runtime.exportStatusElement.textContent =
      runtime.getPreviewFloorMode() === 'all'
        ? '正在构图：全楼合并'
        : '正在构图：' + (runtime.getActiveFloor()?.name || '当前层')),
    runtime.syncCanvasSizeInputs()
}

export function collectSelectedExportFiles(runtime: StudioAppRuntime) {
  return new Set(
    [...runtime.exportDialogElement.querySelectorAll('input[data-export-file]:checked')].map(
      (exportFileCheckbox) => exportFileCheckbox.dataset.exportFile,
    ),
  )
}

export function restorePreviewAfterExport(runtime: StudioAppRuntime) {
  if (!runtime.appCtx.pendingRuntimeSettings || runtime.appCtx.isInteractionLocked) return
  runtime.openLightingDialog(),
    runtime.baseLightControlsElement?.parentElement !== document.body &&
      document.body.append(runtime.baseLightControlsElement),
    runtime.saveExportPreset()
  const exportSessionState = runtime.appCtx.pendingRuntimeSettings
  for (const sessionFloor of runtime.appCtx.studioProject.floors) {
    const floorCameraSettings = exportSessionState.floorCameraSettings.get(sessionFloor.id)
    floorCameraSettings &&
      ((sessionFloor.scene.settings.cameraMode = floorCameraSettings.mode),
      (sessionFloor.scene.settings.cameraView = floorCameraSettings.view),
      (sessionFloor.scene.settings.cameraTopRotation = floorCameraSettings.topRotation),
      (sessionFloor.scene.settings.cameraFocalLength = floorCameraSettings.focalLength))
  }
  ;(runtime.appCtx.studioProject.combinedCameraSettings = {
    ...exportSessionState.combinedCameraSettings,
  }),
    (runtime.appCtx.pendingRuntimeSettings = null),
    (runtime.appCtx.studioProject.previewFloorMode = exportSessionState.floorMode),
    (runtime.appCtx.studioState =
      runtime.appCtx.studioProject.floors.find(
        (sessionFloorCandidate: any) => sessionFloorCandidate.id === runtime.appCtx.activeFloorId,
      )?.scene || runtime.appCtx.studioProject.floors[0].scene),
    exportSessionState.canvasParent?.append(runtime.appCtx.threeRenderer.domElement)
  const ut5 = runtime.cameraSettings()
  ;(ut5.cameraMode = exportSessionState.cameraSettings.mode),
    (ut5.cameraView = exportSessionState.cameraSettings.view),
    (ut5.cameraTopRotation = exportSessionState.cameraSettings.topRotation),
    (ut5.cameraFocalLength = exportSessionState.cameraSettings.focalLength),
    runtime.applyCameraState(exportSessionState.camera, exportSessionState.camera.viewportAspect),
    runtime.syncCameraModeControls(exportSessionState.cameraSettings.mode),
    runtime.syncCameraViewControls(exportSessionState.cameraSettings.view),
    (runtime.appCtx.selectedItem = exportSessionState.selected),
    (runtime.appCtx.selectedItems = exportSessionState.selectedMany)
  for (const { key: sessionGroupKey, group: sessionGroup } of runtime.listLightGroupRows())
    exportSessionState.groupStates.has(sessionGroupKey) &&
      (sessionGroup.enabled = exportSessionState.groupStates.get(sessionGroupKey))
  for (const { key: sessionTelevisionKey, item: sessionTelevisionItem } of runtime.listScreenRows())
    exportSessionState.tvStates.has(sessionTelevisionKey) &&
      (sessionTelevisionItem.screenEnabled = exportSessionState.tvStates.get(sessionTelevisionKey))
  for (const { key: sessionChargingKey, item: sessionChargingItem } of runtime.listChargingRows())
    exportSessionState.carChargingStates.has(sessionChargingKey) &&
      (sessionChargingItem.chargingEnabled = exportSessionState.carChargingStates.get(sessionChargingKey))
  runtime.appCtx.threeRenderer.setPixelRatio(exportSessionState.pixelRatio),
    runtime.rebuildFloorLayers(),
    runtime.requestStudioRender(),
    runtime.resizeStudioRenderer(),
    runtime.refreshStudioUi(),
    runtime.refreshStudioView()
}

export function setExportBusy(runtime: StudioAppRuntime, isBusy: any) {
  runtime.appCtx.isInteractionLocked = isBusy
  const exportBusyNoticeElement = runtime.selectElement('#export-busy-notice')
  exportBusyNoticeElement && (exportBusyNoticeElement.hidden = !isBusy),
    (runtime.exportPackageButton.disabled = isBusy),
    (runtime.selectElement('#export-close').disabled = isBusy)
  for (const exportControl of runtime.exportDialogElement.querySelectorAll('input, button'))
    exportControl.id !== 'export-close' && exportControl.id !== 'export-package' && (exportControl.disabled = isBusy)
  isBusy || (runtime.refreshFloorControls(), runtime.renderExportPresetSlots()),
    (runtime.appCtx.orbitControls.enabled = !isBusy)
}

export function prepareExportRender(runtime: StudioAppRuntime) {
  runtime.appCtx.orbitControls.update()
  for (let exportRenderPassIndex = 0; exportRenderPassIndex < 3; exportRenderPassIndex += 1)
    runtime.appCtx.threeRenderer.render(runtime.appCtx.threeScene, runtime.appCtx.threeCamera)
}

export function canvasToBlob(_runtime: StudioAppRuntime, blobCanvas: any): Promise<Blob> {
  return new Promise((resolveBlob, rejectBlob) => {
    blobCanvas.toBlob(
      (resultBlob: any) => {
        resultBlob ? resolveBlob(resultBlob) : rejectBlob(new Error('无法生成导出图像。'))
      },
      EXPORT_IMAGE_MIME_TYPE2,
      EXPORT_IMAGE_QUALITY2,
    )
  })
}

export async function renderExportImage(
  runtime: StudioAppRuntime,
  imageWidth: any,
  imageHeight: any,
  renderImageOptions: ExportImageOptions = {},
): Promise<ExportImageResult> {
  runtime.prepareExportRender()
  const exportCanvas = document.createElement('canvas')
  ;(exportCanvas.width = imageWidth), (exportCanvas.height = imageHeight)
  const exportCanvasPainter = exportCanvas.getContext('2d', {
    willReadFrequently: renderImageOptions.pixels === true,
  })
  if (!exportCanvasPainter) throw new Error('当前浏览器无法创建导出画布。')
  exportCanvasPainter.drawImage(runtime.appCtx.threeRenderer.domElement, 0, 0, imageWidth, imageHeight)
  const exportImageResult: ExportImageResult = {}
  return (
    renderImageOptions.pixels &&
      (exportImageResult.imageData = exportCanvasPainter.getImageData(0, 0, imageWidth, imageHeight)),
    renderImageOptions.blob && (exportImageResult.blob = await runtime.canvasToBlob(exportCanvas)),
    exportImageResult
  )
}

export async function renderLightDeltaLayer(runtime: StudioAppRuntime, basePixelBuffer: any, litPixelBuffer: any) {
  const shadowDeltaCanvas = document.createElement('canvas')
  ;(shadowDeltaCanvas.width = basePixelBuffer.width), (shadowDeltaCanvas.height = basePixelBuffer.height)
  const shadowDeltaPainter = shadowDeltaCanvas.getContext('2d')
  if (!shadowDeltaPainter) throw new Error('当前浏览器无法创建透明灯光层。')
  const deltaPixels = buildLightDeltaPixels2(basePixelBuffer.data, litPixelBuffer.data)
  return (
    shadowDeltaPainter.putImageData(new ImageData(deltaPixels, basePixelBuffer.width, basePixelBuffer.height), 0, 0),
    runtime.canvasToBlob(shadowDeltaCanvas)
  )
}

export async function renderLightShadowLayer(
  runtime: StudioAppRuntime,
  shadowBasePixels: any,
  shadowLightGroup: any,
  shadowWidth: any,
  shadowHeight: any,
  shadowLightIndex: any,
  shadowLightTotal: any,
) {
  const lightShadowCanvas = document.createElement('canvas')
  ;(lightShadowCanvas.width = shadowWidth), (lightShadowCanvas.height = shadowHeight)
  const lightShadowPainter = lightShadowCanvas.getContext('2d'),
    shadowMaskCanvas = document.createElement('canvas')
  ;(shadowMaskCanvas.width = shadowWidth), (shadowMaskCanvas.height = shadowHeight)
  const shadowMaskPainter = shadowMaskCanvas.getContext('2d')
  if (!lightShadowPainter || !shadowMaskPainter) throw new Error('当前浏览器无法合成逐灯阴影。')
  const shadowLightList = shadowLightGroup.lights.filter(
    (shadowLightEntry: any) => finite2(shadowLightEntry.lightBrightness, 0) > 0,
  )
  try {
    for (let shadowLightListIndex = 0; shadowLightListIndex < shadowLightList.length; shadowLightListIndex += 1) {
      const shadowLightItem = shadowLightList[shadowLightListIndex]
      ;(runtime.exportStatusElement.textContent =
        '正在渲染灯组 ' +
        (shadowLightIndex + 1) +
        '/' +
        shadowLightTotal +
        '：' +
        shadowLightGroup.name +
        '（' +
        (shadowLightListIndex + 1) +
        '/' +
        shadowLightList.length +
        '）'),
        (runtime.appCtx.overriddenFloorIds = new Set([shadowLightItem.id])),
        runtime.getPreviewFloorMode() === 'all'
          ? runtime.rebuildFloorLayers({
              preserveLightCache: true,
            })
          : runtime.buildLightsLayer({
              preserveLightCache: true,
            })
      const ja3 = await runtime.renderExportImage(shadowWidth, shadowHeight, {
          pixels: true,
        }),
        shadowDeltaPixels = buildLightDeltaPixels2(shadowBasePixels.data, ja3.imageData!.data)
      shadowMaskPainter.clearRect(0, 0, shadowWidth, shadowHeight),
        shadowMaskPainter.putImageData(new ImageData(shadowDeltaPixels, shadowWidth, shadowHeight), 0, 0),
        lightShadowPainter.drawImage(shadowMaskCanvas, 0, 0),
        await runtime.ensureRenderReady()
    }
  } finally {
    runtime.appCtx.overriddenFloorIds = null
  }
  return runtime.canvasToBlob(lightShadowCanvas)
}

export async function renderBackgroundLayer(
  runtime: StudioAppRuntime,
  backgroundWidth: any,
  backgroundHeight: any,
  backgroundPixelBuffer: any = null,
) {
  const backgroundCanvas = document.createElement('canvas')
  ;(backgroundCanvas.width = backgroundWidth), (backgroundCanvas.height = backgroundHeight)
  const backgroundPainter = backgroundCanvas.getContext('2d')
  if (!backgroundPainter) throw new Error('当前浏览器无法创建导出底图。')
  if (
    ((backgroundPainter.fillStyle = '#' + runtime.backgroundSettings().background.toString(16).padStart(6, '0')),
    backgroundPainter.fillRect(0, 0, backgroundWidth, backgroundHeight),
    backgroundPixelBuffer)
  ) {
    const backgroundPlanCanvas = document.createElement('canvas')
    ;(backgroundPlanCanvas.width = backgroundWidth), (backgroundPlanCanvas.height = backgroundHeight)
    const backgroundPlanPainter = backgroundPlanCanvas.getContext('2d')
    if (!backgroundPlanPainter) throw new Error('当前浏览器无法合成户型底图。')
    backgroundPlanPainter.putImageData(backgroundPixelBuffer, 0, 0),
      backgroundPainter.drawImage(backgroundPlanCanvas, 0, 0)
  }
  return runtime.canvasToBlob(backgroundCanvas)
}

export function makeUniqueFileName(
  _runtime: StudioAppRuntime,
  fileBaseName: any,
  fileNameIndex: any,
  usedFileNameSet: any,
  fileExtension = EXPORT_IMAGE_EXTENSION2,
) {
  const dc2 = sanitizeExportName(fileBaseName, '灯组-' + (fileNameIndex + 1)),
    replace = String(fileExtension).replace(/^\./, '')
  let fileNameSuffix = 1,
    candidateFileName = dc2 + '.' + replace
  for (; usedFileNameSet.has(candidateFileName.toLocaleLowerCase()); )
    (fileNameSuffix += 1), (candidateFileName = dc2 + '-' + fileNameSuffix + '.' + replace)
  return (usedFileNameSet.add(candidateFileName.toLocaleLowerCase()), candidateFileName)
}

export function buildExportCamera(runtime: StudioAppRuntime, cameraWidth: any, cameraHeight: any) {
  const exportTargetVector = runtime.appCtx.orbitControls.target
  return {
    mode: runtime.appCtx.threeCamera.isPerspectiveCamera ? 'perspective' : 'orthographic',
    position: {
      x: runtime.appCtx.threeCamera.position.x,
      y: runtime.appCtx.threeCamera.position.y,
      z: runtime.appCtx.threeCamera.position.z,
    },
    target: {
      x: exportTargetVector.x,
      y: exportTargetVector.y,
      z: exportTargetVector.z,
    },
    aspect: cameraWidth / cameraHeight,
    visibleHeight: runtime.computeVisibleHeight(runtime.appCtx.threeCamera, exportTargetVector),
    frameSize: runtime.computeOrthoFrameSize(runtime.appCtx.threeCamera, exportTargetVector),
    fov: runtime.appCtx.threeCamera.isPerspectiveCamera ? runtime.appCtx.threeCamera.fov : null,
  }
}

export function buildLightExportEntry(
  runtime: StudioAppRuntime,
  exportLightItem: any,
  exportLightFloor = runtime.getActiveFloor(),
) {
  const floorPixelsPerMeter = exportLightFloor?.scene?.calibration?.pixelsPerMeter || 1
  return {
    id: exportLightItem.id,
    floorId: exportLightFloor?.id || null,
    type: exportLightItem.type,
    position: {
      x: exportLightItem.x / floorPixelsPerMeter,
      z: exportLightItem.y / floorPixelsPerMeter,
      elevation: runtime.floorElevationFor(exportLightFloor) + (exportLightItem.elevation || 0),
    },
    rotation: exportLightItem.rotation || 0,
    verticalRotation: exportLightItem.verticalRotation || 0,
    stripRollRotation: (exportLightItem.type === 'striplight' && exportLightItem.stripRollRotation) || 0,
    size: { width: exportLightItem.width, depth: exportLightItem.depth, height: exportLightItem.height },
    ...(exportLightItem.type === 'striplight' ? stripExportFields(exportLightItem) : {}),
    temperature: exportLightItem.lightTemperature,
    ...(exportLightItem.lightColorRgb
      ? {
          color: exportLightItem.lightColorRgb,
        }
      : {}),
    brightness: exportLightItem.lightBrightness,
    range: exportLightItem.lightRange,
    angle: exportLightItem.lightAngle,
  }
}

export function projectItemAnchor(
  runtime: StudioAppRuntime,
  anchorItem: any,
  anchorFloor: any,
  anchorFloors = runtime.getOrderedFloorList(),
) {
  if (!anchorItem || !anchorFloor || !runtime.appCtx.threeCamera) return null
  const anchorPixelsPerMeter = anchorFloor.scene?.calibration?.pixelsPerMeter || 1
  let anchorLocalX = 0,
    anchorElevationY =
      finite2(anchorItem.elevation, 0) +
      ((anchorItem.type === 'airer' ? -1 : 1) * Math.max(0.02, finite2(anchorItem.height, 0.1))) / 2
  anchorItem.type === 'courtyard-area' &&
    (anchorElevationY = Math.max(0, finite2(anchorItem.elevation, 0)) + courtyardSurfaceRise2(anchorItem) - 0.006)
  let anchorLocalZ = 0
  if (runtime.getPreviewFloorMode() === 'all') {
    const itemRelativeX = (finite2(anchorItem.x, 0) - finite2(anchorFloor.originX, 0)) / anchorPixelsPerMeter,
      itemRelativeY = (finite2(anchorItem.y, 0) - finite2(anchorFloor.originY, 0)) / anchorPixelsPerMeter,
      anchorFloorsItemRotationRad = -ns2.MathUtils.degToRad(finite2(anchorFloor.rotation, 0))
    ;(anchorLocalX =
      itemRelativeX * Math.cos(anchorFloorsItemRotationRad) +
      itemRelativeY * Math.sin(anchorFloorsItemRotationRad) +
      finite2(anchorFloor.offsetX, 0)),
      (anchorLocalZ =
        -itemRelativeX * Math.sin(anchorFloorsItemRotationRad) +
        itemRelativeY * Math.cos(anchorFloorsItemRotationRad) +
        finite2(anchorFloor.offsetZ, 0))
    const sort2 = [...anchorFloors].sort(
        (sortLeftItem, sortRightItem) => sortLeftItem.elevation - sortRightItem.elevation,
      ),
      floorGapOffset = Math.max(
        0,
        sort2.findIndex((indexItem) => indexItem.id === anchorFloor.id),
      )
    anchorElevationY += floorGapOffset * finite2(runtime.appCtx.studioProject.exportFloorGap, 3)
  } else {
    const anchorModelOrigin = sceneModelOrigin2(anchorFloor.scene, anchorFloor)
    ;(anchorLocalX = (finite2(anchorItem.x, 0) - anchorModelOrigin.x) / anchorPixelsPerMeter),
      (anchorLocalZ = (finite2(anchorItem.y, 0) - anchorModelOrigin.y) / anchorPixelsPerMeter)
  }
  runtime.appCtx.threeCamera.updateMatrixWorld(true)
  const project = new ns2.Vector3(anchorLocalX, anchorElevationY, anchorLocalZ).project(runtime.appCtx.threeCamera)
  return ![project.x, project.y, project.z].every(Number.isFinite) || project.z < -1 || project.z > 1
    ? null
    : {
        x: clamp2((project.x + 1) / 2, 0, 1),
        y: clamp2((1 - project.y) / 2, 0, 1),
      }
}

export function projectLightGroupAnchor(
  runtime: StudioAppRuntime,
  anchorLights: any,
  anchorGroupFloor: any,
  anchorGroupFloors = runtime.getOrderedFloorList(),
) {
  for (const anchorLightItem of anchorLights || []) {
    const zu2 = runtime.projectItemAnchor(anchorLightItem, anchorGroupFloor, anchorGroupFloors)
    if (zu2) return zu2
  }
  return null
}

export async function blobToBytes(_runtime: StudioAppRuntime, sourceBlob: any) {
  return new Uint8Array(await sourceBlob.arrayBuffer())
}

export function applyExportVisibility(
  runtime: StudioAppRuntime,
  groupKeyFilter = '',
  screenKeyFilter = '',
  vehicleKeyFilter = '',
) {
  for (const { key: visibleGroupKey, group: visibleGroup } of runtime.listLightGroupRows())
    visibleGroup.enabled = groupKeyFilter === '*' || visibleGroupKey === groupKeyFilter
  for (const { key: visibleScreenKey, item: visibleScreenItem } of runtime.listScreenRows())
    visibleScreenItem.screenEnabled = screenKeyFilter === '*' || visibleScreenKey === screenKeyFilter
  for (const { key: visibleVehicleKey, item: visibleVehicleItem } of runtime.listChargingRows())
    visibleVehicleItem.chargingEnabled = vehicleKeyFilter === '*' || visibleVehicleKey === vehicleKeyFilter
  runtime.rebuildFloorLayers()
}

export function setExportRoleVisibility(runtime: StudioAppRuntime, exportRole: any, isRoleVisible: any) {
  runtime.appCtx.sceneRootNode &&
    (runtime.appCtx.sceneRootNode.traverse((roleObject: any) => {
      roleObject.userData?.exportRole === exportRole &&
        (isRoleVisible
          ? runtime.exportVisibilityByObject.has(roleObject) &&
            ((roleObject.visible = runtime.exportVisibilityByObject.get(roleObject)),
            runtime.exportVisibilityByObject.delete(roleObject))
          : (runtime.exportVisibilityByObject.has(roleObject) ||
              runtime.exportVisibilityByObject.set(roleObject, roleObject.visible),
            (roleObject.visible = false)))
    }),
    runtime.refreshSceneRender({
      shadows: exportRole === 'plan',
    }))
}

export function resolveOverwriteChoice(runtime: StudioAppRuntime, overwriteChoice = 'cancel') {
  const bl3 = runtime.appCtx.overwriteResolver
  ;(runtime.appCtx.overwriteResolver = null),
    runtime.exportOverwriteDialogElement.open && runtime.exportOverwriteDialogElement.close(),
    bl3?.(overwriteChoice)
}

export async function showConflictDialog(_runtime: StudioAppRuntime, dialogWindowHost: any, conflictFolderName: any) {
  /* 同窗（含 iframe 自身）走外壳确认；跨到 parent 文档时仍用 hos-modal 结构，避免 Pinia 弹在子帧里。 */
  if (!dialogWindowHost || dialogWindowHost === window || dialogWindowHost.document === document) {
    const confirmed = await shellConfirm({
      title: '同名导图已经存在',
      message:
        '文件夹“' +
        conflictFolderName +
        '”已经存在。覆盖会整体替换原文件夹，原来存在但本次未导出的文件也会删除，已有仪表盘引用的同名图片会更新。',
      confirmLabel: '覆盖更新',
      cancelLabel: '不覆盖',
      tone: 'danger',
    })
    return confirmed ? 'overwrite' : 'cancel'
  }
  const document2 = dialogWindowHost.document,
    conflictDialogElement = document2.createElement('dialog')
  conflictDialogElement.className = 'hos-modal-native-dialog'
  conflictDialogElement.setAttribute('aria-label', '同名导图已经存在')
  conflictDialogElement.innerHTML =
    '<form method="dialog" class="hos-modal-panel hos-modal-panel--sm hos-modal-panel--danger">' +
    '<div class="hos-modal-head"><h3 class="hos-modal-title">同名导图已经存在</h3></div>' +
    '<div class="hos-modal-body"><p>文件夹“<strong data-export-folder></strong>”已经存在。覆盖会整体替换原文件夹，原来存在但本次未导出的文件也会删除，已有仪表盘引用的同名图片会更新。</p></div>' +
    '<div class="hos-modal-footer">' +
    '<button type="button" class="hos-modal-btn hos-modal-btn--ghost" data-export-choice="cancel">不覆盖</button>' +
    '<button type="button" class="hos-modal-btn hos-modal-btn--danger" data-export-choice="overwrite">覆盖更新</button>' +
    '</div></form>'
  conflictDialogElement.querySelector('[data-export-folder]')!.textContent = conflictFolderName
  return new Promise((resolveConflict, rejectConflict) => {
    let isConflictSettled = false
    const settleConflictChoice = (chosenExportChoice: any) => {
      if (isConflictSettled) return
      isConflictSettled = true
      window.removeEventListener('pagehide', cancelConflictDialog)
      dialogWindowHost.removeEventListener('pagehide', cancelConflictDialog)
      conflictDialogElement.open && conflictDialogElement.close()
      conflictDialogElement.remove()
      resolveConflict(chosenExportChoice)
    }
    const cancelConflictDialog = () => settleConflictChoice('cancel')
    conflictDialogElement.addEventListener('cancel', (event: any) => {
      event.preventDefault()
      cancelConflictDialog()
    })
    conflictDialogElement.addEventListener('close', cancelConflictDialog)
    for (const conflictChoiceButton of conflictDialogElement.querySelectorAll('[data-export-choice]'))
      conflictChoiceButton.addEventListener('click', () =>
        settleConflictChoice((conflictChoiceButton as HTMLElement).dataset.exportChoice),
      )
    window.addEventListener('pagehide', cancelConflictDialog)
    dialogWindowHost.addEventListener('pagehide', cancelConflictDialog)
    try {
      document2.body.append(conflictDialogElement)
      conflictDialogElement.showModal()
      ;(conflictDialogElement.querySelector('[data-export-choice="cancel"]') as HTMLElement | null)?.focus()
    } catch (conflictDialogError: any) {
      window.removeEventListener('pagehide', cancelConflictDialog)
      dialogWindowHost.removeEventListener('pagehide', cancelConflictDialog)
      conflictDialogElement.remove()
      rejectConflict(conflictDialogError)
    }
  })
}

export function beginExportFlow(runtime: StudioAppRuntime, exportFolderName: any) {
  return (
    runtime.appCtx.overwriteResolver && runtime.resolveOverwriteChoice('cancel'),
    runtime.isAutoDiagramEmbed && runtime.autoDiagramComponentId && window.parent !== window
      ? runtime.showConflictDialog(window.parent, exportFolderName)
      : ((runtime.exportOverwriteNameElement.textContent = exportFolderName),
        runtime.exportOverwriteDialogElement.showModal(),
        new Promise((resolveOverwrite) => {
          runtime.appCtx.overwriteResolver = resolveOverwrite
        }))
  )
}

export function reportExportFailure(runtime: StudioAppRuntime, failureReason: any, failureMessage: any) {
  !runtime.isAutoDiagramEmbed ||
    !runtime.autoDiagramComponentId ||
    window.parent === window ||
    window.parent.postMessage(
      {
        type: 'homeos-floorplan-auto-diagram-stopped',
        componentId: runtime.autoDiagramComponentId,
        reason: failureReason,
        message: failureMessage,
      },
      window.location.origin,
    )
}

export function showExportResult(runtime: StudioAppRuntime, exportResult: any) {
  if (runtime.isAutoDiagramEmbed && runtime.autoDiagramComponentId && window.parent !== window) return
  const isOverwritten = exportResult?.overwritten === true
  ;(runtime.exportCompleteTitleElement.textContent = isOverwritten ? '导图覆盖完成' : '导图保存完成'),
    (runtime.exportCompleteMessageElement.textContent = isOverwritten
      ? '新导图已经安全替换原文件夹，已有仪表盘中的同名图片会自动更新。'
      : '导出的图片和数据已经保存到 NAS，可以在编辑器素材中继续使用。'),
    (runtime.exportCompletePathElement.textContent = 'data/' + (exportResult?.relativePath || 'exports')),
    runtime.exportCompleteDialogElement.open || runtime.exportCompleteDialogElement.showModal()
}

/** 导出图层清单渲染（原 studio-app 直系声明，P4 搬进 `ui/studio-export-layers`，此处绑定容器与取数助手）。 */
export function renderExportLayers(runtime: StudioAppRuntime) {
  return renderExportLayersCore(runtime.studioExportLayerDeps())
}

/** 导出存档的重命名 / 删除对话框。 */

export function closePresetRenameDialog(runtime: StudioAppRuntime) {
  runtime.exportPresetRenameDialogElement.open && runtime.exportPresetRenameDialogElement.close()
}

export function openPresetRenameDialog(runtime: StudioAppRuntime) {
  if (runtime.appCtx.isInteractionLocked) return
  runtime.saveExportPreset()
  const renamePresetSlots = normalizeExportPresetSlots2(runtime.appCtx.studioProject?.exportPresets),
    renameActiveSlot = normalizeActiveExportPresetSlot2(
      runtime.appCtx.studioProject?.activeExportPresetSlot,
      renamePresetSlots.length,
    )
  renamePresetSlots[renameActiveSlot] &&
    ((runtime.exportPresetRenameInputElement.value = runtime.formatPresetLabel(
      renamePresetSlots[renameActiveSlot],
      renameActiveSlot,
    )),
    runtime.exportPresetRenameDialogElement.showModal(),
    requestAnimationFrame(() => runtime.exportPresetRenameInputElement.select()))
}

export async function openPresetDeleteDialog(runtime: StudioAppRuntime) {
  if (runtime.appCtx.isInteractionLocked) return
  const deletePresetSlots = normalizeExportPresetSlots2(runtime.appCtx.studioProject?.exportPresets)
  if (deletePresetSlots.length <= 1) return
  const deleteActiveSlot = normalizeActiveExportPresetSlot2(
    runtime.appCtx.studioProject?.activeExportPresetSlot,
    deletePresetSlots.length,
  )
  const presetLabel = runtime.formatPresetLabel(deletePresetSlots[deleteActiveSlot], deleteActiveSlot)
  const confirmed = await confirmPresetDeletion(presetLabel)
  if (confirmed) confirmDeletePreset(runtime)
}

/**
 * 删除存档确认：优先用 0.8.7 的页面内 `#export-preset-delete-dialog`。
 *
 * 用页面内 `<dialog>` 而不是外壳 `shellConfirm` 的原因与楼层删除相同：
 * 0.8.7 的这两个提示是 studio 自己的窄版弹窗（DELETE PRESET 小标 + 红色确认按钮），
 * 换成通用确认框后宽度、位置与按钮层级都会和参考站不一致。
 */
function confirmPresetDeletion(presetLabel: string): Promise<boolean> {
  const documentNode = globalThis.document
  const dialog = documentNode.getElementById('export-preset-delete-dialog') as HTMLDialogElement | null
  const nameElement = documentNode.getElementById('export-preset-delete-name')
  const confirmButton = documentNode.getElementById('export-preset-delete-confirm')
  if (!dialog || !nameElement || !confirmButton) {
    return shellConfirm({
      title: '删除这个导出存档？',
      message: '确定删除“' + presetLabel + '”吗？只会删除保存的导出视角和设置，不会删除楼层或户型。',
      confirmLabel: '删除存档',
      cancelLabel: '取消',
      tone: 'danger',
    })
  }
  return openDialogPromise({
    dialog,
    confirm: confirmButton,
    cancels: elementsById(['export-preset-delete-cancel', 'export-preset-delete-close']),
    prepare: () => {
      nameElement.textContent = presetLabel
    },
  })
}

export function confirmDeletePreset(runtime: StudioAppRuntime) {
  const updatedPresetSlots = normalizeExportPresetSlots2(runtime.appCtx.studioProject?.exportPresets)
  if (updatedPresetSlots.length <= 1) return
  const deletedSlotIndex = normalizeActiveExportPresetSlot2(
      runtime.appCtx.studioProject?.activeExportPresetSlot,
      updatedPresetSlots.length,
    ),
    ja2 = runtime.formatPresetLabel(updatedPresetSlots[deletedSlotIndex], deletedSlotIndex)
  window.clearTimeout(runtime.appCtx.exportPreviewTimeoutId),
    (runtime.appCtx.exportPreviewTimeoutId = null),
    (runtime.appCtx.isExportPresetDirty = false),
    updatedPresetSlots.splice(deletedSlotIndex, 1),
    (runtime.appCtx.studioProject.exportPresets = updatedPresetSlots),
    (runtime.appCtx.studioProject.activeExportPresetSlot = Math.min(deletedSlotIndex, updatedPresetSlots.length - 1))
  const du3 = runtime.applyExportPreset(runtime.appCtx.studioProject.activeExportPresetSlot, {
    silent: true,
  })
  runtime.renderExportPresetSlots(),
    runtime.markDocumentDirty(),
    (runtime.exportStatusElement.textContent = du3 ? '已切换到相邻存档' : '当前存档尚未设置'),
    runtime.showToast('已删除“' + ja2 + '”，楼层和户型未受影响。', 'success')
}

export function openExportDialog(runtime: StudioAppRuntime, exportDialogOptions: ExportDialogOptions = {}) {
  const cs3 = runtime.captureCameraView()
  if (!cs3 || !runtime.appCtx.pendingRuntimeSettings) return
  const exportAspect =
      runtime.stateViewportAspectGetCanvasSize().width / runtime.stateViewportAspectGetCanvasSize().height,
    ut3 = runtime.cameraSettings()
  if (
    ((ut3.cameraMode = cs3.mode),
    (ut3.cameraView = cs3.view),
    (ut3.cameraTopRotation = cs3.topRotation),
    cs3.focalLength !== null && (ut3.cameraFocalLength = cs3.focalLength),
    runtime.applyCameraState(
      {
        mode: cs3.mode,
        cameraView: cs3.view,
        topRotation: cs3.topRotation,
        position: new ns2.Vector3(cs3.position.x, cs3.position.y, cs3.position.z),
        target: new ns2.Vector3(cs3.target.x, cs3.target.y, cs3.target.z),
        up: cs3.view === 'top' ? runtime.buildCameraUpVector(cs3.topRotation) : new ns2.Vector3(0, 1, 0),
        zoom: 1,
        visibleHeight: cs3.visibleHeight,
        frameSize: runtime.resolveFrameSize(cs3, exportAspect),
        viewportAspect: exportAspect,
        fov: cs3.fov,
        near: 0.02,
        far: Math.max(
          new ns2.Vector3(cs3.position.x, cs3.position.y, cs3.position.z).distanceTo(
            new ns2.Vector3(cs3.target.x, cs3.target.y, cs3.target.z),
          ) * (cs3.mode === 'perspective' ? 8 : 5),
          100,
        ),
      },
      exportAspect,
    ),
    runtime.syncCameraModeControls(cs3.mode),
    runtime.syncCameraViewControls(cs3.view),
    !exportDialogOptions.silent)
  ) {
    const exportViewLabel = runtime.getPreviewFloorMode() === 'all' ? '总览视角' : '当前层视角'
    ;(runtime.exportStatusElement.textContent = '已恢复上次保存的' + exportViewLabel),
      runtime.showToast('已恢复上次保存的' + exportViewLabel + '。')
  }
}

export function renderExportPresetSlots(runtime: StudioAppRuntime) {
  const normalizedExportPresets = normalizeExportPresetSlots2(runtime.appCtx.studioProject?.exportPresets),
    normalizedActiveSlot = normalizeActiveExportPresetSlot2(
      runtime.appCtx.studioProject?.activeExportPresetSlot,
      normalizedExportPresets.length,
    )
  ;(runtime.appCtx.studioProject.exportPresets = normalizedExportPresets),
    (runtime.appCtx.studioProject.activeExportPresetSlot = normalizedActiveSlot)
  const floorNameById = new Map(
    (runtime.appCtx.studioProject?.floors || []).map((presetFloor: any) => [presetFloor.id, presetFloor.name]),
  )
  runtime.exportPresetSlotsElement.replaceChildren(
    ...normalizedExportPresets.map((exportPreset, presetSlotIndex) => {
      const presetSlotButton = document.createElement('button')
      ;(presetSlotButton.type = 'button'),
        (presetSlotButton.dataset.exportPresetSlot = String(presetSlotIndex)),
        presetSlotButton.setAttribute('role', 'tab')
      const presetSlotNameLabel = document.createElement('strong'),
        presetSlotStateLabel = document.createElement('small')
      ;(presetSlotNameLabel.textContent = (exportPreset?.name ||
        floorNameById.get(exportPreset?.floorId) ||
        '未命名存档') as string),
        (presetSlotStateLabel.textContent = exportPreset ? '已设置' : '未设置')
      const isActivePresetSlot = presetSlotIndex === normalizedActiveSlot
      return (
        presetSlotButton.classList.toggle('active', isActivePresetSlot),
        presetSlotButton.classList.toggle('has-value', !!exportPreset),
        presetSlotButton.setAttribute('aria-selected', String(isActivePresetSlot)),
        (presetSlotButton.title = exportPreset
          ? presetSlotNameLabel.textContent + '：已设置'
          : presetSlotNameLabel.textContent + '：未设置'),
        presetSlotButton.append(presetSlotNameLabel, presetSlotStateLabel),
        presetSlotButton
      )
    }),
  )
  const activePreset = normalizedExportPresets[normalizedActiveSlot]
  ;(runtime.exportPresetAddButton.disabled = normalizedExportPresets.length >= MAX_EXPORT_PRESET_COUNT2),
    (runtime.exportPresetRenameButton.disabled = !activePreset),
    (runtime.exportPresetDeleteButton.disabled = normalizedExportPresets.length <= 1)
  const isPresetEmpty = exportPresetIsEmpty2(activePreset, runtime.appCtx.isExportPresetDirty)
  ;(runtime.exportPresetEmptyStateElement.hidden = !isPresetEmpty),
    (runtime.exportPresetEmptyTitleElement.textContent = activePreset
      ? runtime.formatPresetLabel(activePreset, normalizedActiveSlot) + '已设置'
      : '当前存档尚未设置')
}

export function buildExportPreset(runtime: StudioAppRuntime, { name: presetName = '' } = {}) {
  if (runtime.appCtx.threeCamera.isPerspectiveCamera) {
    const cameraFocalLengthInput = runtime.selectElement('#camera-focal-length'),
      inputFocalLength = clamp2(finite2(cameraFocalLengthInput?.value, runtime.getCameraFocalLength()), 18, 120)
    runtime.cameraSettings().cameraFocalLength = inputFocalLength
    for (const focalLengthControl of runtime.cameraFocalLengthControls)
      focalLengthControl.value = String(Math.round(inputFocalLength))
    runtime.applyCameraFocalLength(runtime.appCtx.threeCamera, inputFocalLength)
  }
  const { width: wn8, height: wn9 } = runtime.stateViewportAspectGetCanvasSize(),
    exportCameraTarget = runtime.appCtx.orbitControls.target
  return normalizeExportPreset2({
    name: presetName,
    width: wn8,
    height: wn9,
    lockRatio: runtime.exportLockRatioInput.checked,
    floorMode: runtime.getPreviewFloorMode() === 'all' ? 'all' : 'floor',
    floorId: runtime.getActiveFloor()?.id || runtime.appCtx.activeFloorId,
    floorGap: finite2(runtime.appCtx.studioProject.exportFloorGap, 3),
    camera: {
      mode: runtime.appCtx.threeCamera.isPerspectiveCamera ? 'perspective' : 'orthographic',
      view: runtime.getCameraView(),
      topRotation: runtime.getCameraTopRotation(),
      position: {
        x: runtime.appCtx.threeCamera.position.x,
        y: runtime.appCtx.threeCamera.position.y,
        z: runtime.appCtx.threeCamera.position.z,
      },
      target: {
        x: exportCameraTarget.x,
        y: exportCameraTarget.y,
        z: exportCameraTarget.z,
      },
      visibleHeight: runtime.computeVisibleHeight(runtime.appCtx.threeCamera, exportCameraTarget),
      frameSize: runtime.computeOrthoFrameSize(runtime.appCtx.threeCamera, exportCameraTarget),
      fov: runtime.appCtx.threeCamera.isPerspectiveCamera ? runtime.appCtx.threeCamera.fov : 36,
      focalLength: runtime.appCtx.threeCamera.isPerspectiveCamera ? runtime.getCameraFocalLength() : null,
    },
    folderName: runtime.exportFolderNameInput.value,
    selectedFiles: [...runtime.collectSelectedExportFiles()],
  })
}

export function importCameraPreset(runtime: StudioAppRuntime, cameraPresetSpec: any) {
  const presetAspect =
      runtime.stateViewportAspectGetCanvasSize().width / runtime.stateViewportAspectGetCanvasSize().height,
    ut4 = runtime.cameraSettings()
  ;(ut4.cameraMode = cameraPresetSpec.mode),
    (ut4.cameraView = cameraPresetSpec.view),
    (ut4.cameraTopRotation = cameraPresetSpec.topRotation),
    cameraPresetSpec.focalLength !== null && (ut4.cameraFocalLength = cameraPresetSpec.focalLength)
  const presetPosition = new ns2.Vector3(
      cameraPresetSpec.position.x,
      cameraPresetSpec.position.y,
      cameraPresetSpec.position.z,
    ),
    presetTarget = new ns2.Vector3(cameraPresetSpec.target.x, cameraPresetSpec.target.y, cameraPresetSpec.target.z)
  runtime.applyCameraState(
    {
      mode: cameraPresetSpec.mode,
      cameraView: cameraPresetSpec.view,
      topRotation: cameraPresetSpec.topRotation,
      position: presetPosition,
      target: presetTarget,
      up:
        cameraPresetSpec.view === 'top'
          ? runtime.buildCameraUpVector(cameraPresetSpec.topRotation)
          : new ns2.Vector3(0, 1, 0),
      zoom: 1,
      visibleHeight: cameraPresetSpec.visibleHeight,
      frameSize: runtime.resolveFrameSize(cameraPresetSpec, presetAspect),
      viewportAspect: presetAspect,
      fov: cameraPresetSpec.fov,
      near: 0.02,
      far: Math.max(presetPosition.distanceTo(presetTarget) * (cameraPresetSpec.mode === 'perspective' ? 8 : 5), 100),
    },
    presetAspect,
  ),
    runtime.syncCameraModeControls(cameraPresetSpec.mode),
    runtime.syncCameraViewControls(cameraPresetSpec.view)
}

export function applyExportPreset(
  runtime: StudioAppRuntime,
  presetSlotIndexToApply: any,
  applyOptions: ApplyExportOptions = {},
) {
  const appliedPreset = normalizeExportPreset2(runtime.appCtx.studioProject?.exportPresets?.[presetSlotIndexToApply])
  if (!appliedPreset || !runtime.appCtx.pendingRuntimeSettings) return false
  ;(runtime.exportWidthInput.value = String(appliedPreset.width)),
    (runtime.exportHeightInput.value = String(appliedPreset.height)),
    (runtime.exportLockRatioInput.checked = appliedPreset.lockRatio),
    (runtime.appCtx.exportAspectRatio = appliedPreset.width / appliedPreset.height),
    (runtime.appCtx.studioProject.exportFloorGap = appliedPreset.floorGap)
  const presetFloorEntry = runtime.appCtx.studioProject.floors.find(
      (applyOptionsMatchedFloor: any) => applyOptionsMatchedFloor.id === appliedPreset.floorId,
    ),
    presetFloorId =
      appliedPreset.floorMode === 'all' && runtime.appCtx.studioProject.floors.length > 1
        ? 'all'
        : presetFloorEntry?.id || runtime.getActiveFloor()?.id || runtime.appCtx.activeFloorId
  runtime.selectPreviewFloor(presetFloorId),
    (runtime.exportFloorGapInput.value = appliedPreset.floorGap.toFixed(1)),
    (runtime.exportFolderNameInput.value = appliedPreset.folderName)
  const selectedExportFileSet = new Set(appliedPreset.selectedFiles),
    hasTelevisionFile = selectedExportFileSet.has('televisionOn'),
    hasVehicleFile = selectedExportFileSet.has('vehicleCharging')
  for (const exportFileInput of runtime.exportDialogElement.querySelectorAll('input[data-export-file]')) {
    const exportFile = exportFileInput.dataset.exportFile
    exportFileInput.checked =
      selectedExportFileSet.has(exportFile) ||
      (hasTelevisionFile && exportFile.startsWith('screen:')) ||
      (hasVehicleFile && exportFile.startsWith('vehicle:'))
  }
  return (
    runtime.importCameraPreset(appliedPreset.camera),
    runtime.refreshCanvasSizeUi(),
    runtime.refreshFloorControls(),
    applyOptions.silent ||
      ((runtime.exportStatusElement.textContent =
        '已切换到档位 ' + String(presetSlotIndexToApply + 1).padStart(2, '0')),
      runtime.showToast('已应用导出档位 ' + String(presetSlotIndexToApply + 1).padStart(2, '0') + '。', 'success')),
    runtime.syncCanvasSizeInputs(),
    true
  )
}

export function selectExportPresetSlot(runtime: StudioAppRuntime, slotIndex: any) {
  const exportPresetCount = runtime.appCtx.studioProject?.exportPresets?.length || 0
  if (
    !Number.isInteger(slotIndex) ||
    slotIndex < 0 ||
    slotIndex >= exportPresetCount ||
    runtime.appCtx.isInteractionLocked
  )
    return
  runtime.saveExportPreset(), (runtime.appCtx.studioProject.activeExportPresetSlot = slotIndex)
  const du2 = runtime.applyExportPreset(slotIndex)
  ;(runtime.appCtx.isExportPresetDirty = false),
    runtime.renderExportPresetSlots(),
    runtime.markDocumentDirty(),
    du2 || (runtime.exportStatusElement.textContent = '存档 ' + String(slotIndex + 1).padStart(2, '0') + ' 没有设置')
}

export function saveExportPreset(runtime: StudioAppRuntime) {
  if (
    (window.clearTimeout(runtime.appCtx.exportPreviewTimeoutId),
    (runtime.appCtx.exportPreviewTimeoutId = null),
    !runtime.appCtx.isExportPresetDirty)
  )
    return false
  const targetPresetSlot = normalizeActiveExportPresetSlot2(
    runtime.appCtx.studioProject?.activeExportPresetSlot,
    runtime.appCtx.studioProject?.exportPresets?.length,
  )
  if (!runtime.appCtx.pendingRuntimeSettings || runtime.appCtx.isInteractionLocked) return false
  runtime.appCtx.studioProject.exportPresets = normalizeExportPresetSlots2(runtime.appCtx.studioProject.exportPresets)
  const currentPresetName = runtime.appCtx.studioProject.exportPresets[targetPresetSlot]?.name || ''
  return (
    (runtime.appCtx.studioProject.exportPresets[targetPresetSlot] = runtime.buildExportPreset({
      name: currentPresetName,
    })),
    (runtime.appCtx.isExportPresetDirty = false),
    runtime.renderExportPresetSlots(),
    runtime.markDocumentDirty(),
    true
  )
}

export function syncExportControls(runtime: StudioAppRuntime) {
  !runtime.appCtx.pendingRuntimeSettings ||
    runtime.appCtx.isInteractionLocked ||
    ((runtime.appCtx.isExportPresetDirty = true),
    runtime.renderExportPresetSlots(),
    window.clearTimeout(runtime.appCtx.exportPreviewTimeoutId),
    (runtime.appCtx.exportPreviewTimeoutId = window.setTimeout(runtime.saveExportPreset, 360)))
}

export function formatPresetLabel(runtime: StudioAppRuntime, labelPreset: any, labelSlotIndex: any) {
  if (!labelPreset) return '存档 ' + String(labelSlotIndex + 1).padStart(2, '0')
  const presetFloorName = (runtime.appCtx.studioProject?.floors || []).find(
    (labelFloor: any) => labelFloor.id === labelPreset.floorId,
  )?.name
  return labelPreset.name || presetFloorName || '存档 ' + String(labelSlotIndex + 1).padStart(2, '0')
}

export function makeUniquePresetName(runtime: StudioAppRuntime, basePresetName: any, ignoredSlotIndex = -1) {
  const normalizedPresetName = normalizeLabelText2(basePresetName, '导出视角', 24),
    presetNameSet = new Set(
      (runtime.appCtx.studioProject?.exportPresets || [])
        .map((nameSlotPreset: any, nameSlotIndex: any) =>
          nameSlotIndex === ignoredSlotIndex ? '' : runtime.formatPresetLabel(nameSlotPreset, nameSlotIndex),
        )
        .filter(Boolean),
    )
  if (!presetNameSet.has(normalizedPresetName)) return normalizedPresetName
  let ignoredSlotIndexDuplicateNameSuffix = 2
  for (; presetNameSet.has(normalizedPresetName + ' ' + ignoredSlotIndexDuplicateNameSuffix); )
    ignoredSlotIndexDuplicateNameSuffix += 1
  return (normalizedPresetName + ' ' + ignoredSlotIndexDuplicateNameSuffix).slice(0, 24)
}

export interface GenerateExportBundleDeps {
  appCtx: StudioAppContext
  applyCameraState: any
  applyExportVisibility: any
  autoDiagramComponentId: any
  beginExportFlow: any
  blobToBytes: any
  buildExportCamera: any
  buildLightExportEntry: any
  captureOverviewCamera: any
  captureStudioSnapshot: any
  captureUndoSnapshot: any
  collectSelectedExportFiles: any
  exportFolderNameInput: any
  exportStatusElement: any
  fetchStudioApi: any
  floorElevationFor: any
  getOrderedFloorList: any
  getPreviewFloorMode: any
  isAutoDiagramEmbed: any
  listChargingRows: any
  listLightGroupRows: any
  listScreenRows: any
  makeUniqueFileName: any
  projectItemAnchor: any
  projectLightGroupAnchor: any
  rebuildFloorLayers: any
  renderBackgroundLayer: any
  renderExportImage: any
  renderLightDeltaLayer: any
  renderLightShadowLayer: any
  reportExportFailure: any
  saveExportPreset: any
  setExportBusy: any
  setExportRoleVisibility: any
  setShadowQualityHigh: any
  showExportResult: any
  showToast: any
  stateViewportAspectGetCanvasSize: any
  syncCanvasSizeInputs: any
}

export async function generateExportBundle(deps: GenerateExportBundleDeps) {
  const {
    appCtx,
    applyCameraState,
    applyExportVisibility,
    autoDiagramComponentId,
    beginExportFlow,
    blobToBytes,
    buildExportCamera,
    buildLightExportEntry,
    captureOverviewCamera,
    captureStudioSnapshot,
    captureUndoSnapshot,
    collectSelectedExportFiles,
    exportFolderNameInput,
    exportStatusElement,
    fetchStudioApi,
    floorElevationFor,
    getOrderedFloorList,
    getPreviewFloorMode,
    isAutoDiagramEmbed,
    listChargingRows,
    listLightGroupRows,
    listScreenRows,
    makeUniqueFileName,
    projectItemAnchor,
    projectLightGroupAnchor,
    rebuildFloorLayers,
    renderBackgroundLayer,
    renderExportImage,
    renderLightDeltaLayer,
    renderLightShadowLayer,
    reportExportFailure,
    saveExportPreset,
    setExportBusy,
    setExportRoleVisibility,
    setShadowQualityHigh,
    showExportResult,
    showToast,
    stateViewportAspectGetCanvasSize,
    syncCanvasSizeInputs,
  } = deps

  if (!appCtx.pendingRuntimeSettings || appCtx.isInteractionLocked) return
  saveExportPreset()
  const trim = exportFolderNameInput.value.trim(),
    folderNameErrorText = exportFolderNameError(exportFolderNameInput.value)
  if (folderNameErrorText) {
    exportFolderNameInput.classList.add('invalid'),
      exportFolderNameInput.focus(),
      (exportStatusElement.textContent = folderNameErrorText)
    return
  }
  exportFolderNameInput.classList.remove('invalid')
  const qf2 = collectSelectedExportFiles()
  if (!qf2.size) {
    exportStatusElement.textContent = '请至少勾选一项图片'
    return
  }
  /**
   * 装饰模型缺失就先拦下（上游同款文案）。
   *
   * 编辑期它静默不渲染（`user-decoration` 没有程序化兜底几何），不拦的话导出的底图里
   * 那一块就是空的，而用户拿到的是一份「看起来成功」的成品。放在最前面：
   * 后面还有构图、逐层渲染、阴影复制，这些都做完再报错等于白跑一遍。
   */
  const missingDecorationNameList = missingDecorationNames(appCtx.studioProject?.floors, previewIssues())
  if (missingDecorationNameList.length) {
    const missingDetail = missingDecorationNameList.slice(0, 3).join('、')
    exportStatusElement.textContent = '有装饰模型暂时无法载入，请检查后再导图。'
    showToast(`有装饰模型暂时无法载入：${missingDetail}。请检查后再导图。`, 'error')
    return
  }
  const exportBaseSize = stateViewportAspectGetCanvasSize(),
    { width: exportTargetWidth, height: exportTargetHeight } = scaledExportResolution2(
      exportBaseSize.width,
      exportBaseSize.height,
      EXPORT_RENDER_SCALE2,
    ),
    tu3 = captureOverviewCamera(),
    exportFileNames = {
      background: '00底图.' + EXPORT_IMAGE_EXTENSION2,
      backgroundWithPlan: '00底图带户型.' + EXPORT_IMAGE_EXTENSION2,
      floorPlan: '00户型图.' + EXPORT_IMAGE_EXTENSION2,
    },
    usedExportNameSet = new Set(
      Object.values(exportFileNames).map((exportNameValue) => exportNameValue.toLocaleLowerCase()),
    ),
    wl3 = getOrderedFloorList(),
    exportGroups = listLightGroupRows(wl3)
      .map(({ floor: exportGroupFloor, group: exportGroup, index: exportGroupIndex, key: exportGroupKey }: any) => ({
        id: exportGroupKey,
        groupId: exportGroup.id,
        floor: exportGroupFloor,
        name: wl3.length > 1 ? exportGroupFloor.name + '-' + exportGroup.name : exportGroup.name,
        enabledInEditor: appCtx.pendingRuntimeSettings.groupStates.get(exportGroupKey) !== false,
        file: makeUniqueFileName(
          wl3.length > 1 ? exportGroupFloor.name + '-' + exportGroup.name : exportGroup.name,
          exportGroupIndex,
          usedExportNameSet,
        ),
        lights: exportGroupFloor.scene.items.filter(
          (groupLightItem: any) =>
            lampItemTypeSet.has(groupLightItem.type) && groupLightItem.lightGroupId === exportGroup.id,
        ),
      }))
      .filter((filteredGroup: any) => qf2.has('group:' + filteredGroup.id)),
    exportScreenEntries = listScreenRows(wl3).map(
      ({
        floor: generateExportBundleScreenFloor,
        item: screenEntryItem,
        index: screenEntryIndex,
        key: screenEntryKey,
      }: any) => ({
        id: 'screen-' + screenEntryKey,
        key: screenEntryKey,
        floorId: generateExportBundleScreenFloor.id,
        itemId: screenEntryItem.id,
        name:
          '' +
          (wl3.length > 1 ? generateExportBundleScreenFloor.name + '-' : '') +
          (screenEntryItem.screenLayerName || '电视画面 ' + (screenEntryIndex + 1)),
        enabledInEditor: appCtx.pendingRuntimeSettings.tvStates.get(screenEntryKey) !== false,
        floor: generateExportBundleScreenFloor,
        item: screenEntryItem,
        file: null as any,
      }),
    ),
    exportVehicleEntries = listChargingRows(wl3).map(
      ({ floor: vehicleFloor, item: vehicleEntryItem, index: vehicleEntryIndex, key: vehicleEntryKey }: any) => ({
        id: 'vehicle-' + vehicleEntryKey,
        key: vehicleEntryKey,
        floorId: vehicleFloor.id,
        itemId: vehicleEntryItem.id,
        name:
          '' +
          (wl3.length > 1 ? vehicleFloor.name + '-' : '') +
          (vehicleEntryItem.chargingLayerName || '汽车充电 ' + (vehicleEntryIndex + 1)),
        chargingInEditor: appCtx.pendingRuntimeSettings.carChargingStates.get(vehicleEntryKey) === true,
        floor: vehicleFloor,
        item: vehicleEntryItem,
        file: null as any,
      }),
    )
  for (let screenFileIndex = 0; screenFileIndex < exportScreenEntries.length; screenFileIndex += 1) {
    const screenFileEntry = exportScreenEntries[screenFileIndex]
    screenFileEntry.file = makeUniqueFileName(screenFileEntry.name, screenFileIndex, usedExportNameSet)
  }
  for (let vehicleFileIndex = 0; vehicleFileIndex < exportVehicleEntries.length; vehicleFileIndex += 1) {
    const vehicleFileEntry = exportVehicleEntries[vehicleFileIndex]
    vehicleFileEntry.file = makeUniqueFileName(vehicleFileEntry.name, vehicleFileIndex, usedExportNameSet)
  }
  const selectedScreenEntries = exportScreenEntries.filter((selectedScreenEntry: any) =>
      qf2.has('screen:' + selectedScreenEntry.key),
    ),
    selectedVehicleEntries = exportVehicleEntries.filter((selectedVehicleEntry: any) =>
      qf2.has('vehicle:' + selectedVehicleEntry.key),
    ),
    hasAnyLayer =
      qf2.has('backgroundWithPlan') ||
      qf2.has('floorPlan') ||
      selectedScreenEntries.length > 0 ||
      selectedVehicleEntries.length > 0 ||
      exportGroups.length > 0
  let isOverwriting = false
  setExportBusy(true)
  try {
    if (
      ((exportStatusElement.textContent = '正在检查文件夹名…'),
      (
        await fetchStudioApi('/studio3d/exports/check', {
          headers: {
            'X-Export-Folder': encodeURIComponent(trim),
          },
        })
      )?.exists)
    ) {
      exportStatusElement.textContent = '同名导图“' + trim + '”已经存在'
      const zf2 = await beginExportFlow(trim)
      if (zf2 === 'rename') {
        ;(exportStatusElement.textContent = '请修改文件夹名后重新保存'),
          window.setTimeout(() => {
            exportFolderNameInput.focus(), exportFolderNameInput.select()
          }, 0),
          reportExportFailure('rename', '请在属性中修改文件夹名称后重新生成。')
        return
      }
      if (zf2 !== 'overwrite') {
        ;(exportStatusElement.textContent = '已取消覆盖，原导图保持不变'),
          reportExportFailure('cancel', '已取消覆盖，原导图保持不变。')
        return
      }
      isOverwriting = true
    }
    appCtx.threeRenderer.setPixelRatio(1),
      appCtx.threeRenderer.setSize(exportTargetWidth, exportTargetHeight, false),
      applyCameraState(tu3, exportTargetWidth / exportTargetHeight),
      setShadowQualityHigh(true),
      (exportStatusElement.textContent = '正在生成精细阴影导出图层…'),
      applyExportVisibility()
    let onStateImage: any = null,
      baseStateImage: any = null
    qf2.has('background') &&
      (setExportRoleVisibility('plan', false),
      setExportRoleVisibility('label', false),
      setExportRoleVisibility('outline', false),
      (onStateImage = await renderExportImage(exportTargetWidth, exportTargetHeight, {
        pixels: true,
      })),
      setExportRoleVisibility('plan', true),
      setExportRoleVisibility('label', true),
      setExportRoleVisibility('outline', true)),
      hasAnyLayer &&
        (baseStateImage = await renderExportImage(exportTargetWidth, exportTargetHeight, {
          pixels: true,
        }))
    const generatedFileEntries: any[] = []
    if (onStateImage) {
      const yf2 = await renderBackgroundLayer(exportTargetWidth, exportTargetHeight, onStateImage.imageData)
      generatedFileEntries.push({
        name: exportFileNames.background,
        data: await blobToBytes(yf2),
      })
    }
    if (qf2.has('backgroundWithPlan')) {
      const yf3 = await renderBackgroundLayer(exportTargetWidth, exportTargetHeight, baseStateImage.imageData)
      generatedFileEntries.push({
        name: exportFileNames.backgroundWithPlan,
        data: await blobToBytes(yf3),
      })
    }
    if (qf2.has('floorPlan')) {
      setExportRoleVisibility('background', false), setExportRoleVisibility('grid', false)
      const ja4 = await renderExportImage(exportTargetWidth, exportTargetHeight, {
        blob: true,
      })
      setExportRoleVisibility('background', true),
        setExportRoleVisibility('grid', true),
        generatedFileEntries.push({
          name: exportFileNames.floorPlan,
          data: await blobToBytes(ja4.blob),
        })
    }
    for (let groupFileIndex = 0; groupFileIndex < exportGroups.length; groupFileIndex += 1) {
      const generatedGroupEntry = exportGroups[groupFileIndex],
        lv2 = await renderLightShadowLayer(
          baseStateImage.imageData,
          generatedGroupEntry,
          exportTargetWidth,
          exportTargetHeight,
          groupFileIndex,
          exportGroups.length,
        )
      generatedFileEntries.push({
        name: generatedGroupEntry.file,
        data: await blobToBytes(lv2),
      })
    }
    for (let screenLayerIndex = 0; screenLayerIndex < selectedScreenEntries.length; screenLayerIndex += 1) {
      const generatedScreenEntry = selectedScreenEntries[screenLayerIndex]
      ;(exportStatusElement.textContent =
        '正在生成电视图层 ' +
        (screenLayerIndex + 1) +
        '/' +
        selectedScreenEntries.length +
        '：' +
        generatedScreenEntry.name),
        applyExportVisibility('', generatedScreenEntry.key)
      const ja5 = await renderExportImage(exportTargetWidth, exportTargetHeight, {
          pixels: true,
        }),
        uf2 = await renderLightDeltaLayer(baseStateImage.imageData, ja5.imageData)
      generatedFileEntries.push({
        name: generatedScreenEntry.file,
        data: await blobToBytes(uf2),
      })
    }
    for (let vehicleLayerIndex = 0; vehicleLayerIndex < selectedVehicleEntries.length; vehicleLayerIndex += 1) {
      const generatedVehicleEntry = selectedVehicleEntries[vehicleLayerIndex]
      ;(exportStatusElement.textContent =
        '正在生成汽车图层 ' +
        (vehicleLayerIndex + 1) +
        '/' +
        selectedVehicleEntries.length +
        '：' +
        generatedVehicleEntry.name),
        applyExportVisibility('', '', generatedVehicleEntry.key)
      const ja6 = await renderExportImage(exportTargetWidth, exportTargetHeight, {
          pixels: true,
        }),
        uf3 = await renderLightDeltaLayer(baseStateImage.imageData, ja6.imageData)
      generatedFileEntries.push({
        name: generatedVehicleEntry.file,
        data: await blobToBytes(uf3),
      })
    }
    const exportManifest = {
      schemaVersion: 3,
      exportName: trim,
      floorMode: getPreviewFloorMode(),
      floorPresentationGap: getPreviewFloorMode() === 'all' ? finite2(appCtx.studioProject.exportFloorGap, 3) : 0,
      floors: wl3.map((manifestFloor: any) => ({
        id: manifestFloor.id,
        name: manifestFloor.name,
        elevation: floorElevationFor(manifestFloor),
        offsetX: manifestFloor.offsetX,
        offsetZ: manifestFloor.offsetZ,
        rotation: manifestFloor.rotation,
      })),
      generatedAt: new Date().toISOString(),
      resolution: {
        width: exportTargetWidth,
        height: exportTargetHeight,
      },
      sourceResolution: exportBaseSize,
      renderScale: EXPORT_RENDER_SCALE2,
      imageFormat: {
        extension: EXPORT_IMAGE_EXTENSION2,
        mimeType: EXPORT_IMAGE_MIME_TYPE2,
        quality: EXPORT_IMAGE_QUALITY2,
      },
      camera: buildExportCamera(exportTargetWidth, exportTargetHeight),
      backgroundImage: qf2.has('background') ? exportFileNames.background : null,
      baseImage: qf2.has('backgroundWithPlan') ? exportFileNames.backgroundWithPlan : null,
      floorPlanImage: qf2.has('floorPlan') ? exportFileNames.floorPlan : null,
      televisionOnImage: selectedScreenEntries.length === 1 ? selectedScreenEntries[0].file : null,
      televisionOnImages: selectedScreenEntries.map((manifestScreen: any) => manifestScreen.file),
      vehicleChargingImage: selectedVehicleEntries.length === 1 ? selectedVehicleEntries[0].file : null,
      vehicleChargingImages: selectedVehicleEntries.map((manifestVehicle: any) => manifestVehicle.file),
      exportedFiles: generatedFileEntries.map((manifestFile) => manifestFile.name),
      groups: exportGroups.map((manifestGroup: any) => ({
        id: manifestGroup.id,
        groupId: manifestGroup.groupId,
        floorId: manifestGroup.floor.id,
        name: manifestGroup.name,
        file: manifestGroup.file,
        anchor: projectLightGroupAnchor(manifestGroup.lights, manifestGroup.floor, wl3),
        enabledInEditor: manifestGroup.enabledInEditor,
        lights: manifestGroup.lights.map((manifestLight: any) =>
          buildLightExportEntry(manifestLight, manifestGroup.floor),
        ),
      })),
      screens: exportScreenEntries.map(
        ({
          key: manifestScreenKey,
          floor: manifestScreenFloor,
          item: manifestScreenItem,
          ...manifestScreenRest
        }: any) => ({
          ...manifestScreenRest,
          anchor: projectItemAnchor(manifestScreenItem, manifestScreenFloor, wl3),
          file: qf2.has('screen:' + manifestScreenKey) ? manifestScreenRest.file : null,
        }),
      ),
      vehicles: exportVehicleEntries.map(
        ({
          key: manifestVehicleKey,
          floor: manifestVehicleFloor,
          item: manifestVehicleItem,
          ...manifestVehicleRest
        }: any) => ({
          ...manifestVehicleRest,
          anchor: projectItemAnchor(manifestVehicleItem, manifestVehicleFloor, wl3),
          file: qf2.has('vehicle:' + manifestVehicleKey) ? manifestVehicleRest.file : null,
        }),
      ),
    }
    if (
      (qf2.has('dataLights') &&
        generatedFileEntries.push({
          name: 'lights.json',
          data: new TextEncoder().encode(JSON.stringify(exportManifest, null, 2) + '\n'),
        }),
      qf2.has('dataScene'))
    ) {
      const exportScenePayload = getPreviewFloorMode() === 'all' ? captureStudioSnapshot() : captureUndoSnapshot()
      generatedFileEntries.push({
        name: 'scene.json',
        data: new TextEncoder().encode(JSON.stringify(exportScenePayload, null, 2) + '\n'),
      })
    }
    exportStatusElement.textContent = '正在打包 ZIP…'
    const zipBytes = buildStoredZip2(generatedFileEntries)
    exportStatusElement.textContent = '正在保存到 NAS data…'
    const blob = new Blob([zipBytes], {
        type: 'application/zip',
      }),
      saveExportBundle = (shouldOverwrite = false) =>
        fetchStudioApi('/studio3d/exports', {
          method: 'POST',
          body: blob,
          headers: {
            'Content-Type': 'application/zip',
            'X-Export-Folder': encodeURIComponent(trim),
            ...(shouldOverwrite
              ? {
                  'X-Export-Overwrite': 'true',
                }
              : {}),
          },
        })
    let saveResult
    try {
      saveResult = await saveExportBundle(isOverwriting)
    } catch (saveConflictError: any) {
      if (saveConflictError?.status !== 409 || saveConflictError?.payload?.detail?.code !== 'STUDIO3D_EXPORT_EXISTS')
        throw saveConflictError
      exportStatusElement.textContent = '同名导图“' + trim + '”已经存在'
      const zf3 = await beginExportFlow(trim)
      if (zf3 === 'rename') {
        ;(exportStatusElement.textContent = '请修改文件夹名后重新保存'),
          window.setTimeout(() => {
            exportFolderNameInput.focus(), exportFolderNameInput.select()
          }, 0),
          reportExportFailure('rename', '请在属性中修改文件夹名称后重新生成。')
        return
      }
      if (zf3 !== 'overwrite') {
        ;(exportStatusElement.textContent = '已取消覆盖，原导图保持不变'),
          reportExportFailure('cancel', '已取消覆盖，原导图保持不变。')
        return
      }
      ;(exportStatusElement.textContent = '正在安全覆盖原导图…'), (saveResult = await saveExportBundle(true))
    }
    ;(exportStatusElement.textContent = '已保存到 data/' + saveResult.relativePath),
      showToast('导图已保存到 data/' + saveResult.relativePath, 'success')
    const parent = isAutoDiagramEmbed ? window.parent : window.opener
    autoDiagramComponentId &&
      parent &&
      (isAutoDiagramEmbed || !parent.closed) &&
      parent.postMessage(
        {
          type: 'homeos-floorplan-auto-diagram-export',
          componentId: autoDiagramComponentId,
          folderName: trim,
          manifest: exportManifest,
          saved: {
            relativePath: String(saveResult?.relativePath || 'exports/' + trim),
            overwritten: saveResult?.overwritten === true,
          },
        },
        window.location.origin,
      ),
      (appCtx.isExporting = true),
      refreshStepChecklist(appCtx),
      showExportResult(saveResult)
  } catch (exportFlowError: any) {
    window.HomeOSLog?.error!(exportFlowError, {
      phase: 'studio-export',
      componentId: autoDiagramComponentId || '',
    }),
      console.error(exportFlowError),
      (exportStatusElement.textContent = exportFlowError?.message || '导出失败，请重试。'),
      showToast(exportFlowError?.message || '导图失败。', 'error'),
      isAutoDiagramEmbed &&
        autoDiagramComponentId &&
        window.parent !== window &&
        window.parent.postMessage(
          {
            type: 'homeos-floorplan-auto-diagram-error',
            componentId: autoDiagramComponentId,
            message: exportFlowError?.message || '后台生成失败，请重试。',
          },
          window.location.origin,
        )
  } finally {
    setShadowQualityHigh(false)
    for (const { key: restoreGroupKey, group: restoreGroup } of listLightGroupRows())
      appCtx.pendingRuntimeSettings?.groupStates.has(restoreGroupKey) &&
        (restoreGroup.enabled = appCtx.pendingRuntimeSettings.groupStates.get(restoreGroupKey))
    for (const { key: restoreScreenKey, item: restoreScreenItem } of listScreenRows())
      appCtx.pendingRuntimeSettings?.tvStates.has(restoreScreenKey) &&
        (restoreScreenItem.screenEnabled = appCtx.pendingRuntimeSettings.tvStates.get(restoreScreenKey))
    for (const { key: restoreVehicleKey, item: restoreVehicleItem } of listChargingRows())
      appCtx.pendingRuntimeSettings?.carChargingStates.has(restoreVehicleKey) &&
        (restoreVehicleItem.chargingEnabled = appCtx.pendingRuntimeSettings.carChargingStates.get(restoreVehicleKey))
    rebuildFloorLayers(),
      applyCameraState(tu3, exportTargetWidth / exportTargetHeight),
      setExportBusy(false),
      syncCanvasSizeInputs()
  }
}

export interface OpenExportPanelDeps {
  appCtx: StudioAppContext
  applyExportPreset: any
  captureCameraView: any
  captureOverviewCamera: any
  ensureSceneRendered: any
  exportDialogElement: any
  exportFolderNameInput: any
  exportFolderQueryValue: any
  exportHeightInput: any
  exportLockRatioInput: any
  exportPackageButton: any
  exportPreviewStageElement: any
  exportStatusElement: any
  exportWidthInput: any
  floorSelectionId: any
  getActiveFloor: any
  getCameraFocalLength: any
  getCameraMode: any
  getCameraTopRotation: any
  getCameraView: any
  getPreviewFloorMode: any
  isAutoDiagramEmbed: any
  listChargingRows: any
  listLightGroupRows: any
  listScreenRows: any
  openExportDialog: any
  prepareFreeCameraCapture: any
  rebuildFloorLayers: any
  refreshCanvasSizeUi: any
  refreshFloorControls: any
  refreshSelection: any
  renderExportLayers: any
  renderExportPresetSlots: any
  selectPreviewFloor: any
  setCameraMode: any
  stateViewportAspectGetCanvasSize: any
  syncCanvasSizeInputs: any
  updateCameraView: any
}

export function openExportPanel(deps: OpenExportPanelDeps) {
  const {
    appCtx,
    applyExportPreset,
    captureCameraView,
    captureOverviewCamera,
    ensureSceneRendered,
    exportDialogElement,
    exportFolderNameInput,
    exportFolderQueryValue,
    exportHeightInput,
    exportLockRatioInput,
    exportPackageButton,
    exportPreviewStageElement,
    exportStatusElement,
    exportWidthInput,
    floorSelectionId,
    getActiveFloor,
    getCameraFocalLength,
    getCameraMode,
    getCameraTopRotation,
    getCameraView,
    getPreviewFloorMode,
    isAutoDiagramEmbed,
    listChargingRows,
    listLightGroupRows,
    listScreenRows,
    openExportDialog,
    prepareFreeCameraCapture,
    rebuildFloorLayers,
    refreshCanvasSizeUi,
    refreshFloorControls,
    refreshSelection,
    renderExportLayers,
    renderExportPresetSlots,
    selectPreviewFloor,
    setCameraMode,
    stateViewportAspectGetCanvasSize,
    syncCanvasSizeInputs,
    updateCameraView,
  } = deps

  if (appCtx.pendingRuntimeSettings || !appCtx.threeRenderer || !appCtx.threeCamera || !appCtx.orbitControls) return
  window.clearTimeout(appCtx.exportPreviewTimeoutId),
    (appCtx.exportPreviewTimeoutId = null),
    (appCtx.isExportPresetDirty = false)
  const va2 = listLightGroupRows(),
    televisionEntries = listScreenRows(),
    na2 = listChargingRows()
  ;(appCtx.pendingRuntimeSettings = {
    canvasParent: appCtx.threeRenderer.domElement.parentElement,
    camera: captureOverviewCamera(),
    selected: appCtx.selectedItem
      ? {
          ...appCtx.selectedItem,
        }
      : null,
    selectedMany: appCtx.selectedItems.map((selectedSceneItem: any) => ({
      ...selectedSceneItem,
    })),
    floorMode: getPreviewFloorMode(),
    selectedFloorId: appCtx.activeFloorId,
    floorCameraSettings: new Map(
      appCtx.studioProject.floors.map((floorCameraEntry: any) => [
        floorCameraEntry.id,
        {
          mode: floorCameraEntry.scene.settings.cameraMode,
          view: floorCameraEntry.scene.settings.cameraView,
          topRotation: floorCameraEntry.scene.settings.cameraTopRotation,
          focalLength: floorCameraEntry.scene.settings.cameraFocalLength,
        },
      ]),
    ),
    combinedCameraSettings: {
      ...appCtx.studioProject.combinedCameraSettings,
    },
    groupStates: new Map(
      va2.map(({ key: groupStateKey, group: groupStateGroup }: any) => [groupStateKey, groupStateGroup.enabled]),
    ),
    tvStates: new Map(
      televisionEntries.map(({ key: televisionStateKey, item: televisionStateItem }: any) => [
        televisionStateKey,
        televisionStateItem.screenEnabled !== false,
      ]),
    ),
    carChargingStates: new Map(
      na2.map(({ key: chargingStateKey, item: chargingStateItem }: any) => [
        chargingStateKey,
        chargingStateItem.chargingEnabled === true,
      ]),
    ),
    cameraSettings: {
      mode: getCameraMode(),
      view: getCameraView(),
      topRotation: getCameraTopRotation(),
      focalLength: getCameraFocalLength(),
    },
    pixelRatio: appCtx.threeRenderer.getPixelRatio(),
  }),
    appCtx.lightPrecompileController?.setEnabled(false)
  for (const { group: disabledGroup } of va2) disabledGroup.enabled = false
  if (
    (refreshSelection(),
    (exportStatusElement.textContent = '准备保存到 NAS'),
    exportFolderNameInput.classList.remove('invalid'),
    renderExportLayers(),
    prepareFreeCameraCapture(),
    refreshFloorControls(),
    renderExportPresetSlots(),
    (exportPackageButton.disabled = false),
    isAutoDiagramEmbed)
  ) {
    document.body.classList.add('auto-diagram-embedded')
    const uRLSearchParams = new URLSearchParams(window.location.search),
      exportWidth = clamp2(
        finite2(
          uRLSearchParams.get('dashboard-width'),
          finite2(uRLSearchParams.get('component-width'), exportWidthInput.value),
        ),
        320,
        4096,
      ),
      exportHeight = clamp2(
        finite2(
          uRLSearchParams.get('dashboard-height'),
          finite2(uRLSearchParams.get('component-height'), exportHeightInput.value),
        ),
        320,
        4096,
      )
    ;(exportWidthInput.value = String(Math.round(exportWidth))),
      (exportHeightInput.value = String(Math.round(exportHeight))),
      (exportLockRatioInput.checked = true),
      exportFolderQueryValue && (exportFolderNameInput.value = exportFolderQueryValue),
      refreshCanvasSizeUi()
  }
  syncExportSceneStyleLabel({ appCtx } as never)
  exportDialogElement.showModal(), exportPreviewStageElement.append(appCtx.threeRenderer.domElement)
  const resolvedPresetSlot = normalizeActiveExportPresetSlot2(
      appCtx.studioProject.activeExportPresetSlot,
      appCtx.studioProject.exportPresets.length,
    ),
    du4 =
      resolvedPresetSlot !== null &&
      applyExportPreset(resolvedPresetSlot, {
        silent: true,
      })
  if (isAutoDiagramEmbed && floorSelectionId !== null) {
    const exportFloorMatch = appCtx.studioProject.floors.find(
        (exportFloorCandidate: any) => exportFloorCandidate.id === floorSelectionId,
      ),
      exportFloorId =
        floorSelectionId === 'all' && appCtx.studioProject.floors.length > 1
          ? 'all'
          : exportFloorMatch?.id || getActiveFloor()?.id || appCtx.activeFloorId
    selectPreviewFloor(exportFloorId)
  }
  du4 ||
    (rebuildFloorLayers(),
    captureCameraView()
      ? openExportDialog({
          silent: true,
        })
      : isAutoDiagramEmbed &&
        (setCameraMode(getCameraMode(), {
          preserveView: false,
        }),
        updateCameraView())),
    (appCtx.exportAspectRatio = stateViewportAspectGetCanvasSize().width / stateViewportAspectGetCanvasSize().height),
    renderExportPresetSlots(),
    syncCanvasSizeInputs(),
    ensureSceneRendered()
}
