import { type BackgroundViewSettings, type StudioAppRuntime } from '../runtime/studio-app-runtime'
import {
  prepareBackground as prepareBackground2,
  loadImportedImage as loadImportedImage2,
  backgroundFailure as backgroundFailure2,
  type BackgroundImportDiagnostics,
} from '../plan/background-import'
import { WARM_WOOD_STYLE as WARM_WOOD_STYLE2 } from '../scene/studio-scene-style'
import { NATURAL_WOOD_STYLE } from '../scene/studio-natural-wood-style'
import { withRequestTimeout as withRequestTimeout2 } from '../../app/shared/util/request-timeout'
import { defaultViewSettings } from '../scene/payload/studio-view-settings'
import { syncControlValue as syncControlValue2 } from '../ui/ui-controls'
import { isCourtyardDrawing as isCourtyardDrawing2 } from '../loaders/studio-normalization'
import { refreshStepChecklist } from '../ui/onboarding'

export async function loadBackgroundImage(runtime: StudioAppRuntime) {
  const backgroundLoadToken = ++runtime.appCtx.backgroundLoadRequestId
  if (((runtime.appCtx.backgroundImageSource = null), !runtime.appCtx.studioState.background?.url)) return
  const url = runtime.appCtx.studioState.background.url
  await new Promise<void>((resolveLoad) => {
    let isLoadResolved = false
    const handleLoadTimeout = () => {
        isLoadResolved || ((isLoadResolved = true), resolveLoad())
      },
      image = new Image(),
      loadTimeoutId = window.setTimeout(handleLoadTimeout, 2000)
    image.addEventListener(
      'load',
      () => {
        if (
          backgroundLoadToken !== runtime.appCtx.backgroundLoadRequestId ||
          runtime.appCtx.studioState.background?.url !== url
        ) {
          handleLoadTimeout()
          return
        }
        ;(runtime.appCtx.backgroundImageSource = image),
          window.clearTimeout(loadTimeoutId),
          isLoadResolved ? runtime.refreshStudioView() : handleLoadTimeout()
      },
      {
        once: true,
      },
    ),
      image.addEventListener(
        'error',
        () => {
          window.clearTimeout(loadTimeoutId),
            backgroundLoadToken === runtime.appCtx.backgroundLoadRequestId &&
              runtime.showToast('底图加载失败，请重新导入。', 'error'),
            handleLoadTimeout()
        },
        {
          once: true,
        },
      ),
      (image.src = url)
  })
}

export async function importBackgroundFile(runtime: StudioAppRuntime, backgroundFile: any) {
  if (!backgroundFile || runtime.importPlanButton.disabled) return
  const importOptions: BackgroundImportDiagnostics = {},
    ae8 = runtime.getActiveFloor(),
    background = runtime.appCtx.studioState.background,
    backgroundImportErrorElement = runtime.selectElement('#background-import-error')
  ;(backgroundImportErrorElement.hidden = true),
    (runtime.importPlanButton.disabled = true),
    (runtime.importPlanButton.textContent = '处理中…')
  try {
    const preparedBackground = await prepareBackground2(backgroundFile, importOptions)
    ;(importOptions.stage = '上传图片'), (runtime.importPlanButton.textContent = '上传中…')
    const uploadResponse = await withRequestTimeout2(120000, (abortSignal) =>
      runtime.fetchStudioApi('/assets/user', {
        method: 'POST',
        body: preparedBackground.file,
        signal: abortSignal,
        headers: {
          'Content-Type': preparedBackground.file.type,
          'X-File-Name': encodeURIComponent(preparedBackground.file.name),
        },
      }),
    )
    ;(importOptions.stage = '加载底图'),
      (importOptions.uploadSize = uploadResponse.width + ' × ' + uploadResponse.height),
      (runtime.importPlanButton.textContent = '加载中…')
    const importedImage = await loadImportedImage2(uploadResponse.url),
      width3 = importedImage.naturalWidth || uploadResponse.width,
      height3 = importedImage.naturalHeight || uploadResponse.height
    if (runtime.getActiveFloor() !== ae8 || runtime.appCtx.studioState.background !== background) {
      runtime.showToast('当前户型已切换或底图已改变，请重新导入。', 'warning')
      return
    }
    runtime.deselectAll(),
      (runtime.appCtx.studioState.background = {
        assetId: uploadResponse.assetId,
        url: uploadResponse.url,
        name: uploadResponse.name,
        width: width3,
        height: height3,
      })
    const ae9 = runtime.getActiveFloor()
    ae9 &&
      !ae9.originInitialized &&
      ((ae9.originX = width3 / 2), (ae9.originY = height3 / 2), (ae9.originInitialized = true)),
      (runtime.appCtx.studioState.settings.backgroundVisible = true),
      ++runtime.appCtx.backgroundLoadRequestId,
      (runtime.appCtx.backgroundImageSource = importedImage),
      runtime.resetView(),
      runtime.refreshScopeItems(),
      runtime.markDocumentDirty(),
      runtime.selectStudioTool('scale')
    const join2 = preparedBackground.adjustments.join('，')
    runtime.showToast(
      (join2 ? join2 + '。' : '') + '底图已导入，请在图上画一条已知长度的参考线。',
      join2 ? 'warning' : '',
    )
  } catch (importError: any) {
    const backgroundFailure = backgroundFailure2(importError, importOptions)
    ;(runtime.selectElement('#background-import-message').textContent = backgroundFailure.message),
      (runtime.selectElement('#background-import-details').value = backgroundFailure.details),
      (backgroundImportErrorElement.hidden = false),
      runtime.showToast(backgroundFailure.message, 'error')
  } finally {
    ;(runtime.importPlanButton.disabled = false), (runtime.importPlanButton.textContent = '导入')
  }
}

export function backgroundSettings(runtime: StudioAppRuntime): BackgroundViewSettings {
  if (runtime.appCtx.sceneStyle === 'natural-wood') {
    return {
      ...defaultViewSettings,
      ...NATURAL_WOOD_STYLE,
    }
  }
  return runtime.appCtx.sceneStyle === 'warm-wood'
    ? {
        ...defaultViewSettings,
        ...WARM_WOOD_STYLE2,
      }
    : defaultViewSettings
}

export function refreshBackground(runtime: StudioAppRuntime) {
  const planTitleText = runtime.appCtx.studioState.items.some(
    (drawingItem) => isCourtyardDrawing2(drawingItem) || drawingItem.type.startsWith('garden-'),
  )
    ? runtime.appCtx.studioState.walls.length
      ? '户型与庭院绘制'
      : '庭院绘制'
    : '户型图绘制'
  ;(runtime.projectNameElement.textContent = planTitleText),
    (document.title = planTitleText),
    runtime.syncSnapControls(),
    runtime.syncGlobalControls(),
    (runtime.toggleBackgroundButton.disabled = !runtime.appCtx.studioState.background),
    (runtime.toggleBackgroundButton.textContent = runtime.appCtx.studioState.settings.backgroundVisible
      ? '隐藏'
      : '显示'),
    (runtime.removePlanButton.disabled = !runtime.appCtx.studioState.background),
    syncControlValue2(runtime.globalWallHeightInput, runtime.appCtx.studioState.settings.wallHeight.toFixed(2)),
    syncControlValue2(runtime.globalWallThicknessInput, runtime.appCtx.studioState.settings.wallThickness.toFixed(2)),
    syncControlValue2(
      runtime.globalWallOpacityInput,
      Math.round(runtime.appCtx.studioState.settings.wallOpacity * 100),
    ),
    (runtime.toggleFloorEdgeButton.textContent =
      runtime.appCtx.studioState.settings.floorEdgeVisible === false ? '隐藏' : '显示'),
    runtime.toggleFloorEdgeButton.setAttribute(
      'aria-pressed',
      String(runtime.appCtx.studioState.settings.floorEdgeVisible !== false),
    ),
    (runtime.canvasEmptyElement.hidden = !!(
      runtime.appCtx.studioState.background ||
      runtime.appCtx.studioState.walls.length ||
      runtime.appCtx.studioState.items.length
    )),
    (runtime.sceneCountsElement.textContent =
      runtime.appCtx.studioState.walls.length +
      ' 墙 · ' +
      runtime.appCtx.studioState.windows.length +
      ' 窗 · ' +
      runtime.appCtx.studioState.doors.length +
      ' 门 · ' +
      runtime.appCtx.studioState.railings.length +
      ' 栏杆 · ' +
      runtime.appCtx.studioState.items.length +
      ' 物件'),
    runtime.syncLightGroupList(),
    runtime.applyPanelRatios(),
    runtime.applyDetailsRatio(),
    runtime.setCameraMode(runtime.getCameraMode()),
    runtime.setCameraView(runtime.getCameraView()),
    runtime.refreshPreviewSync(),
    runtime.refreshFloorControls(),
    runtime.refreshBaseLighting(),
    refreshStepChecklist(runtime.appCtx)
}

/** 刷新整个属性检查器：先跑「按选中类型逐个开关字段」的逻辑，再统一收敛一次分组。 */
export function refreshStudioUi(runtime: StudioAppRuntime, shouldClearActiveElement = false) {
  runtime.refreshStudioUiInner(shouldClearActiveElement)
  runtime.syncInspectorGroups()
  // 复制按钮跟随选择：属性和选择都在这里刷新，剪贴板可用性也搭同一趟车。
  runtime.syncStudioClipboardFacade()
}
