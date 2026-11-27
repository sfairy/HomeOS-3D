import { type StudioAppRuntime } from '../runtime/studio-app-runtime'
import { armEditor3D, disposeEditor3D, exactHeightBoundsOf, refreshEditor3D } from './editor-3d'
import { bindPreviewStyleSelect } from './preview-style'
import { bindWorkspaceView } from './workspace'
import { installPreviewCameraPanel } from './preview-camera-panel'
import { installLightingRow } from './lighting'
import { type StudioControlElement } from '../studio-app-types'
import {
  clampWindowT as clampWindowT2,
  closedWallFloorPolygons,
  doorInteriorSide,
  pointInRotatedRectangle as pointInRotatedRectangle2,
} from '../plan/geometry'
import { isCustomWindow, windowWallLimits } from '@app/shared/scene/window/layout'
import { windowSceneError } from '../plan/window/window-scene-guard'
import { itemWithPlanFootprint as itemWithPlanFootprint2 } from '../items/studio-item-posture'
import {
  isPlacedItemHidden,
  isPlacedItemLocked,
  registerPlacedVisibilitySource,
} from '../items/placement/placed-item-state'
import { itemTypeCatalog, lampItemTypeSet } from '../items/item-catalog'
import { itemElevationMeaning } from '../loaders/studio-normalization'
import { editNumberText } from '../studio-edit-metrics'
import { createOverlapPicker, type OverlapCandidate, type OverlapPicker } from './studio-overlap-picker'
import {
  createAssetPreview,
  type AssetPreview,
  type AssetPreviewRecord,
  createAssetThumbnailRenderer,
  type AssetThumbnailRenderer,
} from './asset-preview'
import { type StudioAppContext } from '../app-context'
import {
  createItemSession,
  createPlacedItemsPanel,
  itemIdOf,
  type PlacedItemsPanel,
  type PlacedItemsState,
} from './studio-placed-items'
import { rememberLibraryMode } from './asset-library'

/**
 * 编辑器壳层里「挂 DOM」的几件事，集中在一个入口完成：
 * 3D 视口编辑叠层、预览风格选择器、工作区主视图切换、相机设置折叠面板。
 *
 * 为什么抽出来：`boot.ts` 触到行数预算（4200）。这三者都属于「绑定页面元素」，
 * 与引导流程本身无关；合成一个 `bindStudioChrome` 后 boot 只留一行，
 * 回收也只有一行，不会再因为加一个绑定就顶破预算。
 */

/**
 * 相机设置面板的焦段可用性同步（摄影模式切换时调用）。
 *
 * 从本模块转出而不是让 `boot.ts` 直接 import 新文件：boot 的 import 已经很多，
 * 「新增一个 UI 绑定」不该继续扩大它的扇出。
 */
export { syncCameraFocalAvailability } from './preview-camera-panel'

/**
 * 用户装饰模型的动态注册（0.8.9）。
 *
 * 从本模块转出而不是让 `boot.ts` 直接 import 新文件：boot 的 import 已经很多，
 * 「多一个加载期常量」不该继续扩大它的扇出。
 */
export {
  decorationPlacementFields,
  registerUserDecorationModel,
  setUserDecorationStageContext,
} from '../loaders/external-models/user-decoration-models'

export interface StudioChromeBindings {
  dispose: () => void
}

export function bindStudioChrome(runtime: StudioAppRuntime): StudioChromeBindings {
  armEditor3D(runtime)
  bindPreviewStyleSelect(runtime)
  // 0.8.9：相机设置折叠面板（点击 / Esc / aria-expanded 三处同步都在模块内）。
  installPreviewCameraPanel()
  // 0.8.9：标准光影 / 轻量柔光切换（换渲染管线 + 重建灯光层，见 lighting-row-install）。
  installLightingRow(runtime)
  const workspaceView = bindWorkspaceView(runtime)
  return {
    dispose: () => {
      disposeEditor3D(runtime.appCtx)
      workspaceView.dispose()
    },
  }
}

/* 工具面板选项（门/窗/栏杆/家具/电器/庭院/灯光/楼梯…）与「轻量变更」入口。
 *
 * 从 `studio-app/boot.ts` 整块搬出：读 `appCtx` 与 DOM 句柄，写 `appCtx.*` / 文档，
 * 不回写闭包里的可变绑定。
 */

export function bindToolOptionWiring(deps: Record<string, any>): void {
  const {
    appCtx,
    applyMaterialToSameModelItems,
    applyToolSetting,
    deleteCustomMaterialStyle,
    deselectAll,
    getSelectedObject,
    inspectorGroupsElement,
    markDocumentDirty,
    materialApplyCancelButton,
    materialApplyCountElement,
    materialApplyDialogElement,
    materialApplyFormElement,
    materialApplySameButton,
    materialEditModelType,
    materialPresetCancelButton,
    materialPresetDialogElement,
    materialPresetFormElement,
    materialPresetNameInput,
    materialResetAllButton,
    materialSameModelPeerCount,
    materialSavePresetButton,
    materialSlotListElement,
    materialStyleDeleteButton,
    materialStyleGroupFor,
    materialStyleLabel,
    materialStyleStripElement,
    normalizeMaterialStyle,
    refreshScopeItems,
    resetItemMaterialAll,
    resolvePreviewScope,
    saveCurrentItemMaterialStyle,
    selectElement,
    selectedMaterialEditTarget,
    selectionInspectorElement,
    setItemMaterialOverride,
    setItemMaterialStyle,
    setItemMaterialSurfaceOverride,
    shoeCabinetMirrorButton,
    syncHtmlRangeProgress2,
    toggleInspectorGroup,
  } = deps
  selectElement('#stair-direction').addEventListener('change', () => applyToolSetting('item')),
    selectElement('#tv-mount-style').addEventListener('change', () => applyToolSetting('item')),
    selectElement('#smart-display-mount').addEventListener('change', () => applyToolSetting('item')),
    selectElement('#storage-section').addEventListener('change', () => applyToolSetting('item')),
    selectElement('#pillar-shape').addEventListener('change', () => applyToolSetting('item')),
    selectElement('#pillar-axis').addEventListener('change', () => applyToolSetting('item')),
    selectElement('#pipeline-dispenser-style').addEventListener('change', () => applyToolSetting('item')),
    selectElement('#strip-mount').addEventListener('change', () => applyToolSetting('item')),
    selectElement('#mural-style').addEventListener('change', () => applyToolSetting('item')),
    selectElement('#featurewall-style').addEventListener('change', () => applyToolSetting('item')),
    materialSlotListElement.addEventListener('input', (materialColorInputEvent: any) => {
      const materialColorInput = materialColorInputEvent.target.closest('[data-material-slot-color]'),
        materialSlotRow = materialColorInput?.closest('.material-slot'),
        materialHexInput = materialSlotRow?.querySelector('[data-material-slot-hex]')
      materialHexInput &&
        materialColorInput &&
        ((materialHexInput.value = String(materialColorInput.value).toLowerCase()),
        materialHexInput.classList.remove('is-invalid'))

      const materialSurfaceRange = materialColorInputEvent.target.closest('[data-material-slot-surface-key]')
      if (materialSurfaceRange) {
        const materialSurfaceOutput = materialSurfaceRange
          .closest('.material-slot-surface-field')
          ?.querySelector('output')
        materialSurfaceOutput && (materialSurfaceOutput.textContent = Number(materialSurfaceRange.value).toFixed(2))
        /* 拖拽时轨道上的金色段要跟着圆点走，否则读数变了、填充还停在旧位置。 */
        syncHtmlRangeProgress2(materialSurfaceRange)
      }
    }),
    materialSlotListElement.addEventListener('change', (materialSlotChangeEvent: any) => {
      const materialColorInput = materialSlotChangeEvent.target.closest('[data-material-slot-color]')
      if (materialColorInput) {
        setItemMaterialOverride(materialColorInput.dataset.materialSlotColor, materialColorInput.value)
        return
      }

      const materialHexInput = materialSlotChangeEvent.target.closest('[data-material-slot-hex]')
      if (materialHexInput) {
        const hexColorValue = String(materialHexInput.value).trim().toLowerCase(),
          normalizedHexValue = /^[0-9a-f]{6}$/.test(hexColorValue) ? '#' + hexColorValue : hexColorValue
        if (!/^#[0-9a-f]{6}$/.test(normalizedHexValue)) {
          const materialRowColorInput =
            materialHexInput.closest('.material-slot-variant')?.querySelector('[data-material-slot-color]') ||
            materialHexInput.closest('.material-slot')?.querySelector('[data-material-slot-color]')
          materialHexInput.classList.add('is-invalid'),
            materialRowColorInput && (materialHexInput.value = String(materialRowColorInput.value).toLowerCase())
          return
        }
        materialHexInput.classList.remove('is-invalid'),
          (materialHexInput.value = normalizedHexValue),
          setItemMaterialOverride(materialHexInput.dataset.materialSlotHex, normalizedHexValue)
        return
      }
      const materialSurfaceRange = materialSlotChangeEvent.target.closest('[data-material-slot-surface-key]')
      materialSurfaceRange &&
        setItemMaterialSurfaceOverride(
          materialSurfaceRange.dataset.materialSlotSurfaceName,
          materialSurfaceRange.dataset.materialSlotSurfaceKey,
          Number(materialSurfaceRange.value),
        )
    }),
    materialSlotListElement.addEventListener('click', (materialSlotClickEvent: any) => {
      const materialResetButton = materialSlotClickEvent.target.closest('[data-material-slot-reset]')
      if (materialResetButton) {
        setItemMaterialOverride(materialResetButton.dataset.materialSlotReset, '')
        return
      }
      const materialSurfaceResetButton = materialSlotClickEvent.target.closest('[data-material-slot-surface-reset]')
      if (materialSurfaceResetButton) {
        const surfaceResetSlotName = materialSurfaceResetButton.dataset.materialSlotSurfaceReset
        setItemMaterialSurfaceOverride(surfaceResetSlotName, 'roughness', null)
        setItemMaterialSurfaceOverride(surfaceResetSlotName, 'metalness', null)
        return
      }
      const materialSurfaceToggle = materialSlotClickEvent.target.closest('[data-material-slot-surface-toggle]')
      if (!materialSurfaceToggle) return

      const surfaceToggleSlotName = materialSurfaceToggle.dataset.materialSlotSurfaceToggle
      appCtx.expandedMaterialSurfaceSlots.has(surfaceToggleSlotName)
        ? appCtx.expandedMaterialSurfaceSlots.delete(surfaceToggleSlotName)
        : appCtx.expandedMaterialSurfaceSlots.add(surfaceToggleSlotName)
      const materialSlotRow = materialSurfaceToggle.closest('.material-slot'),
        materialSurfacePanel = materialSlotRow?.querySelector('[data-material-slot-surface]'),
        isSurfaceExpanded = appCtx.expandedMaterialSurfaceSlots.has(surfaceToggleSlotName)
      materialSurfaceToggle.setAttribute('aria-expanded', String(isSurfaceExpanded)),
        materialSurfacePanel && (materialSurfacePanel.hidden = !isSurfaceExpanded)
    }),
    materialStyleStripElement.addEventListener('click', (materialStyleClickEvent: any) => {
      const materialStyleChip = materialStyleClickEvent.target.closest('[data-material-style-id]')
      materialStyleChip && setItemMaterialStyle(materialStyleChip.dataset.materialStyleId)
    }),
    materialStyleDeleteButton.addEventListener('click', () => {
      const materialEditTarget = selectedMaterialEditTarget(),
        selectedModelType = materialEditModelType(materialEditTarget?.record, materialEditTarget?.kind),
        selectedStyle = normalizeMaterialStyle(selectedModelType, materialEditTarget?.record?.materialStyle)
      selectedStyle.startsWith('custom:') && deleteCustomMaterialStyle(selectedStyle)
    }),
    materialResetAllButton.addEventListener('click', () => resetItemMaterialAll()),
    materialSavePresetButton.addEventListener('click', () => {
      const materialEditTarget = selectedMaterialEditTarget(),
        modelType = materialEditModelType(materialEditTarget?.record, materialEditTarget?.kind)
      if (!materialEditTarget || !materialStyleGroupFor(modelType)) return
      materialPresetNameInput &&
        (materialPresetNameInput.value = materialStyleLabel(modelType, materialEditTarget.record.materialStyle)),
        materialPresetDialogElement?.showModal(),
        materialPresetNameInput?.focus(),
        materialPresetNameInput?.select()
    }),
    materialPresetFormElement.addEventListener('submit', () => {
      const presetLabel = String(materialPresetNameInput?.value || '').trim()
      presetLabel && saveCurrentItemMaterialStyle(presetLabel.slice(0, 16))
    }),
    materialPresetCancelButton.addEventListener('click', () => materialPresetDialogElement?.close()),
    materialApplySameButton.addEventListener('click', () => {
      const peerCount = materialSameModelPeerCount(selectedMaterialEditTarget())
      if (!peerCount) return
      materialApplyCountElement && (materialApplyCountElement.textContent = peerCount + ' 件同类物件'),
        materialApplyDialogElement?.showModal()
    }),
    materialApplyFormElement.addEventListener('submit', () => {
      materialApplyDialogElement?.close()
      applyMaterialToSameModelItems()
    }),
    materialApplyCancelButton.addEventListener('click', () => materialApplyDialogElement?.close()),
    inspectorGroupsElement.forEach((inspectorGroupElement: StudioControlElement) => {
      const inspectorGroupHeader = inspectorGroupElement.querySelector('.inspector-group-header')
      inspectorGroupHeader?.addEventListener('click', () => toggleInspectorGroup(inspectorGroupElement))
    }),
    shoeCabinetMirrorButton.addEventListener('click', () => {
      const shoeCabinetElement = getSelectedObject()
      !shoeCabinetElement ||
        appCtx.selectedItem?.kind !== 'item' ||
        shoeCabinetElement.type !== 'shoecabinet' ||
        (deselectAll(),
        (shoeCabinetElement.shoeCabinetMirrored = shoeCabinetElement.shoeCabinetMirrored !== true),
        refreshScopeItems(resolvePreviewScope(shoeCabinetElement)),
        markDocumentDirty())
    }),
    selectionInspectorElement.addEventListener('submit', (optionsSubmitEvent: any) =>
      optionsSubmitEvent.preventDefault(),
    ),
    selectElement('#door-hinge').addEventListener('click', () => {
      const doorElement = getSelectedObject()
      !doorElement ||
        appCtx.selectedItem?.kind !== 'door' ||
        ['double', 'roller-shutter', 'frame-only'].includes(doorElement.doorType) ||
        (deselectAll(),
        (doorElement.hinge = doorElement.hinge === 'right' ? 'left' : 'right'),
        refreshScopeItems('architecture'),
        markDocumentDirty())
    }),
    selectElement('#door-swing').addEventListener('click', () => {
      const swingDoorElement = getSelectedObject()
      !swingDoorElement ||
        appCtx.selectedItem?.kind !== 'door' ||
        ['sliding-glass', 'frame-only'].includes(swingDoorElement.doorType) ||
        (deselectAll(),
        (swingDoorElement.swing = swingDoorElement.swing === -1 ? 1 : -1),
        refreshScopeItems('architecture'),
        markDocumentDirty())
    })
}

/**
 * 「自定义窗型…」入口（0.8.4）。
 *
 * 只做三件事：把当前窗户 + 楼层快照交给绘制器、把绘制结果写回场景、把「使用普通窗户」
 * 改成普通模式。写回时重新贴回墙上（`t` 要按新宽度重新夹），并且整场景过一遍
 * `windowSceneError` —— 窗型合法但尺寸超出墙体时不能落盘，否则 3D 里窗框会穿墙。
 *
 * 绘制器是动态加载的：窗户是低频功能，没必要把 three 预览 + SVG 编辑器打进首屏。
 */

export function bindWindowDesignerWiring(deps: Record<string, any>): void {
  const {
    appCtx,
    applyPlacementChange,
    captureUndoSnapshot,
    getActiveFloor,
    getPixelsPerMeter,
    getSelectedObject,
    isEmbeddedStage,
    markDocumentDirty,
    refreshScopeItems,
    selectElement,
    showToast,
  } = deps

  let designerHandle: any = null
  let openingDesigner = false

  const currentFloorId = () => getActiveFloor?.()?.id ?? appCtx.activeFloorId
  const pixelsPerMeter = () => getPixelsPerMeter() || 100

  /**
   * 把绘制结果写回当前场景。抛错时绘制器留在原地并把 message 显示在自己的提示条里。
   * 快照不一致说明期间改过楼层或这扇窗，继续写回会把别的改动覆盖掉。
   *
   * 这里**不能**用 `showToast` 报错：绘制器是模态 `<dialog>`（top layer），外壳通知层
   * 在 backdrop 后面，用户只会看到「点了应用窗型没反应」。
   */
  const applyWindowDesign = (draft: any, openedWindow: any) => {
    if (currentFloorId() !== openedWindow.floorId) throw Error('窗户或楼层已变化，请关闭后重新打开窗型绘制。')
    const sceneState = appCtx.studioState,
      targetWindow = sceneState.windows.find((windowEntry: any) => windowEntry.id === openedWindow.id)
    if (!targetWindow || JSON.stringify(targetWindow) !== openedWindow.snapshot)
      throw Error('窗户或楼层已变化，请关闭后重新打开窗型绘制。')

    // 先按候选对象验证整场景，通过了才真的落改动（失败时不留半截状态）。
    const candidateWindow = {
        ...targetWindow,
        width: draft.width,
        height: draft.height,
        windowDesign: structuredClone(draft.windowDesign),
      },
      anchorWall = sceneState.walls.find((wall: any) => wall.id === targetWindow.wallId)
    if (anchorWall) candidateWindow.t = clampWindowT2(anchorWall, candidateWindow, pixelsPerMeter())
    const sceneError = windowSceneError(
      {
        walls: sceneState.walls,
        windows: sceneState.windows.map((windowEntry: any) =>
          windowEntry === targetWindow ? candidateWindow : windowEntry,
        ),
      },
      pixelsPerMeter(),
    )
    if (sceneError) throw Error(sceneError)
    if (JSON.stringify(candidateWindow) === JSON.stringify(targetWindow)) return true

    const undoSnapshot = captureUndoSnapshot()
    Object.assign(targetWindow, candidateWindow)
    applyPlacementChange(undoSnapshot), refreshScopeItems('architecture'), markDocumentDirty()
    return true
  }

  selectElement('#window-customize').addEventListener('click', () => {
    if (openingDesigner || designerHandle?.isOpen) return
    const selectedWindow = getSelectedObject()
    if (appCtx.selectedItem?.kind !== 'window' || !selectedWindow) return
    // 只有「这扇窗自己越界」时**不能**拦：绘制器正是修它的地方（缩窄窗宽 / 降窗高）。
    // 拦在这里会让用户无路可走 —— 检查器改尺寸同样要过 `validateSelectionChange`，
    // 而后者会因为同一处越界把改动回滚。
    const selectedError = windowSceneError(
      { walls: appCtx.studioState.walls, windows: [selectedWindow] },
      pixelsPerMeter(),
    )
    if (!selectedError) {
      // 这扇窗没问题，但户型里别的窗越界：提前说明（文案已指名是哪一扇），
      // 免得用户画完才在「应用窗型」被拒。
      const sceneError = windowSceneError(appCtx.studioState, pixelsPerMeter())
      if (sceneError) {
        showToast(sceneError, 'error')
        return
      }
    }
    const openedWindow = {
        id: selectedWindow.id,
        floorId: currentFloorId(),
        snapshot: JSON.stringify(selectedWindow),
      },
      anchorWall = appCtx.studioState.walls.find((wall: any) => wall.id === selectedWindow.wallId),
      interiorSide =
        (anchorWall &&
          doorInteriorSide(
            anchorWall,
            selectedWindow,
            closedWallFloorPolygons(appCtx.studioState.walls, 1),
            pixelsPerMeter(),
          )) ||
        1
    openingDesigner = true
    import('../plan/window/designer')
      .then(({ openWindowDesigner }) => {
        const latestWindow = appCtx.studioState.windows.find((windowEntry: any) => windowEntry.id === openedWindow.id)
        if (
          isEmbeddedStage ||
          currentFloorId() !== openedWindow.floorId ||
          appCtx.selectedItem?.kind !== 'window' ||
          appCtx.selectedItem.id !== openedWindow.id ||
          !latestWindow ||
          JSON.stringify(latestWindow) !== openedWindow.snapshot
        )
          return
        designerHandle = openWindowDesigner({
          record: latestWindow,
          style: deps.backgroundSettings?.(),
          interiorSide,
          wallLimits: windowWallLimits(latestWindow, anchorWall, pixelsPerMeter()),
          onApply: (appliedDraft: any) => applyWindowDesign(appliedDraft, openedWindow),
          onClose: () => {
            designerHandle = null
            selectElement('#window-customize').focus()
          },
        })
      })
      .catch((designerError: any) => {
        showToast(designerError?.message || '窗型绘制器加载失败。', 'error')
      })
      .finally(() => {
        openingDesigner = false
      })
  })

  selectElement('#window-ordinary').addEventListener('click', () => {
    const selectedWindow = getSelectedObject()
    if (appCtx.selectedItem?.kind !== 'window' || !selectedWindow || !isCustomWindow(selectedWindow)) return
    // 只把模式切回普通窗：分格树留着，下次「编辑自定义窗型…」还能接着改。
    const undoSnapshot = captureUndoSnapshot()
    selectedWindow.windowDesign = {
      ...structuredClone(selectedWindow.windowDesign),
      mode: 'ordinary',
    }
    applyPlacementChange(undoSnapshot), refreshScopeItems('architecture'), markDocumentDirty()
  })
}

/**
 * 重叠拾取与素材悬停预览的接线。
 *
 * 两者都是**纯附加**的交互层：不改命中测试的返回值，也不改模型库的卡片结构 ——
 * 命中测试仍返回一个 id（画布绘制与选择性重绘都依赖它），这里只是额外问一次
 * 「光标下还有没有别的」，以及在卡片上挂悬停预览。
 *
 * 为什么要单独一次 `collectOverlapCandidates`：真正的「所有命中」只能从命中测试的
 * 过滤条件倒推出来。与其把 `hitTestPlanItem` 改成返回数组（会波及所有调用方），
 * 不如在这里用同一套几何重复算一遍 —— 计算量是 O(物件数)，只在**按下鼠标**时跑一次。
 *
 * 0.8.7 的两个浮层都**挂在 body 上**（`position: fixed`）：它们的锚点在左栏素材库，
 * 若留在 `#plan-stage` 里，绝对定位会先被包含块偏移、再被 `overflow: hidden` 裁掉。
 */

type Wiring = {
  runtime: StudioAppRuntime
  picker: OverlapPicker
  preview: AssetPreview
  thumbnail: AssetThumbnailRenderer
}
const wirings = new WeakMap<object, Wiring>()

/** 「整组尺寸」的四类组合品（0.8.7 同列表）。 */
const GROUP_PREVIEW_TYPES = new Set(['tea-table-set', 'coffeetable', 'dual-monitors', 'figurine-set'])

function typeNames(): Record<string, string> {
  const names: Record<string, string> = {}
  for (const [type, entry] of Object.entries(itemTypeCatalog)) {
    const name = (entry as { name?: string } | undefined)?.name
    if (name) names[type] = name
  }
  return names
}

/**
 * 懒构建：模块初始化时遍历 `itemTypeCatalog` 会踩到循环 import（目录还没装配完），
 * 结果是浮层里所有候选都显示成类型 id。首次使用时再建。
 */
let typeNamesCache: Record<string, string> | null = null
function cachedTypeNames(): Record<string, string> {
  typeNamesCache ??= typeNames()
  return typeNamesCache
}

/** 物件的最小形状：判断命中只需要尺寸与类型。 */
type PlanItemLike = {
  id: string
  type: string
  width: number
  depth: number
  remark?: unknown
  elevation?: unknown
  /** 用户装饰的模型名（本仓键）；浮层与属性标题都靠它区分同名条目。 */
  name?: unknown
  /** 用户装饰的模型名（0.8.9 上游键）。 */
  modelName?: unknown
}

/** 命中盒：小件（插座）有一个最小像素下限，必须与 `hitTestPlanItem` 保持一致。 */
function hitBoxFor(item: PlanItemLike, pixelsPerMeter: number, zoom: number) {
  if (item.type !== 'smart-socket-86') return itemWithPlanFootprint2(item, pixelsPerMeter)
  const minimum = 12 / (pixelsPerMeter * zoom)
  return { ...item, width: Math.max(item.width, minimum), depth: Math.max(item.depth, minimum) }
}

/**
 * 「重叠物件」浮层里的候选名。
 *
 * 用户装饰显示**模型名**：目录里这类统一叫「我的装饰」，只取目录名会让
 * 六件装饰在浮层里同名，用户点了也不知道选中哪一件。
 *
 * 抽成函数是为了与属性面板标题（`itemSelectionTitle`）、已放置清单
 * （`placedItemName`）保持同一口径 —— 三处各写一份必然漂移（本轮就是这么漏的）。
 */
export function overlapCandidateLabel(
  item: Pick<PlanItemLike, 'type' | 'name' | 'modelName'>,
  typeNames: Record<string, string>,
): string {
  const modelName = item.type === 'user-decoration' ? String(item.name ?? item.modelName ?? '').trim() : ''
  return modelName || typeNames[item.type] || String(item.type || '物件')
}

/** 该物件是否参与重叠候选（隐藏项、庭院地面、非当前分类都要排除）。 */
function isOverlapCandidateItem(runtime: StudioAppRuntime, item: PlanItemLike): boolean {
  if (item.type === 'courtyard-area') return false
  if (isPlacedItemHidden(runtime.appCtx, item.id)) return false
  // 0.8.7 `Di()` 要求「未锁定」：锁定件本来就不能拖动，列进候选只会让人点完没反应。
  if (isPlacedItemLocked(runtime.appCtx, item.id)) return false
  return runtime.isPlanItemVisible(item)
}

/** 候选的详情文案：与「已放置」清单同一套（`实际高度 min–max m`）。 */
function candidateDetail(runtime: StudioAppRuntime, item: PlanItemLike): string | undefined {
  const bounds = exactHeightBoundsOf(runtime, item.id)
  if (bounds?.exact) return `实际高度 ${editNumberText(bounds.min)}–${editNumberText(bounds.max)} m`
  const elevation = Number(item.elevation)
  return Number.isFinite(elevation)
    ? `${itemElevationMeaning(item.type).label} ${editNumberText(elevation)} m`
    : undefined
}

/**
 * 光标位置下的全部物件候选（含被压在下面的）。
 *
 * 判定与 `hitTestPlanItem` 同源：同样的 `itemWithPlanFootprint` 与
 * `pointInRotatedRectangle`，所以「看起来选得到」和「这里列出来」永远一致。
 */
export function collectOverlapCandidates(
  runtime: StudioAppRuntime,
  planPoint: { x: number; y: number },
): OverlapCandidate[] {
  const appCtx = runtime.appCtx
  const pixelsPerMeter = runtime.getPixelsPerMeter() || 100
  const zoom = appCtx.planView.zoom
  const hits: Array<{ item: PlanItemLike; index: number; bounds: { min: number; max: number } | null }> = []
  const allItems = appCtx.studioState.items as unknown as PlanItemLike[]
  allItems.forEach((item, index) => {
    if (!isOverlapCandidateItem(runtime, item)) return
    if (!pointInRotatedRectangle2(planPoint, hitBoxFor(item, pixelsPerMeter, zoom), pixelsPerMeter)) return
    hits.push({ item, index, bounds: exactHeightBoundsOf(runtime, item.id) })
  })
  // 与「已放置」清单同序（高度上限 → 下限 → 楼层内原序），列表与浮层的顺序才一致。
  hits.sort(
    (left, right) =>
      (left.bounds?.max ?? 0) - (right.bounds?.max ?? 0) ||
      (left.bounds?.min ?? 0) - (right.bounds?.min ?? 0) ||
      left.index - right.index,
  )
  return hits.map(({ item }) => ({
    id: String(item.id),
    // 与属性面板标题同一口径（见 `overlapCandidateLabel`）。
    label: overlapCandidateLabel(item, cachedTypeNames()),
    remark: String(item.remark || '') || undefined,
    height: candidateDetail(runtime, item),
  }))
}

function findItem(runtime: StudioAppRuntime, id: string): Record<string, unknown> | null {
  const found = (runtime.appCtx.studioState.items as Array<Record<string, unknown>>).find(
    (candidate) => String(candidate.id) === id,
  )
  return found ?? null
}

/** 尺寸三元组：实例优先（已放置件可能改过尺寸），否则取目录默认值。 */
function previewDimensions(
  item: Record<string, unknown> | null,
  catalog: Record<string, unknown> | undefined,
): { width: number; depth: number; height: number } | null {
  const width = Number(item?.width ?? catalog?.width ?? 0)
  const depth = Number(item?.depth ?? catalog?.depth ?? 0)
  const height = Number(item?.height ?? catalog?.height ?? 0)
  return width > 0 && depth > 0 && height > 0 ? { width, depth, height } : null
}

/**
 * 指针下的元素 → 预览记录。
 *
 * 两种来源：素材卡只有 `data-item-type`（取目录尺寸）；「已放置」行带
 * `data-preview-item-id`（取实例尺寸，沙发 / 电视 / 窗帘还要看变体字段）。
 */
function resolvePreviewRecord(runtime: StudioAppRuntime, target: HTMLElement): AssetPreviewRecord | null {
  const previewId = target.dataset.previewItemId
  const item = previewId ? findItem(runtime, previewId) : null
  const type = String(item?.type || target.dataset.itemType || '')
  // 楼板洞口没有可渲染模型；目录里没有的类型（本项目自有）也不预览。
  if (!type || type === 'flooropening') return null
  const catalog = (itemTypeCatalog as Record<string, Record<string, unknown>>)[type]
  if (!catalog && !item) return null
  const dimensions = previewDimensions(item, catalog)
  if (!dimensions) return null
  return {
    ...(catalog || {}),
    ...(item || {}),
    type,
    ...dimensions,
    previewName: String(
      target.dataset.libraryName || item?.note || item?.name || catalog?.name || cachedTypeNames()[type] || type,
    ),
    previewSchematic: lampItemTypeSet.has(type),
    previewGroup: GROUP_PREVIEW_TYPES.has(type),
  }
}

/** 换场景风格 / 换前端修订后缩略图必须重渲染，所以主题键两者都要带。 */
function themeKeyOf(runtime: StudioAppRuntime): string {
  const style = (runtime.appCtx as { sceneStyle?: unknown }).sceneStyle
  return JSON.stringify([typeof style === 'string' ? style : 'default', new URL(import.meta.url).search])
}

/** 预览失败写全局日志（0.8.7 同一句文案与 phase）。 */
function reportPreviewFailure(error: unknown, record: AssetPreviewRecord): void {
  const name = record.previewName || record.type
  globalThis.window?.HomeOSLog?.warn?.(`模型悬停预览未能生成：${name}，名称和尺寸仍可使用`, {
    phase: 'model-hover-preview',
    code: 'MODEL_PREVIEW_FAILED',
    modelType: record.type,
    hint: '此记录仅表示悬停预览未生成；放置后的模型显示结果需在实际画面核对。',
    reason: (error as Error)?.message || String(error),
  })
}

/** 安装（幂等）。 */
export function installOverlapAndPreview(runtime: StudioAppRuntime): void {
  const appCtx = runtime.appCtx
  if (wirings.has(appCtx)) return
  const documentNode = globalThis.document
  const overlapHost = documentNode.getElementById('overlap-items')
  const previewHost = documentNode.getElementById('asset-preview')
  if (!overlapHost || !previewHost) return
  // 0.8.7 两个浮层都是 body 的直接子节点：fixed 定位才能超出左栏 / 画布的裁剪边界。
  if (overlapHost.parentElement !== documentNode.body) documentNode.body.append(overlapHost)
  if (previewHost.parentElement !== documentNode.body) documentNode.body.append(previewHost)
  overlapHost.hidden = true
  const thumbnail = createAssetThumbnailRenderer(runtime)
  wirings.set(appCtx, {
    runtime,
    picker: createOverlapPicker({
      host: overlapHost,
      onPick(id) {
        runtime.selectSceneObject('item', id)
        // 属性面板由 `refreshStudioUi` 驱动：只刷画布会「选中了但右侧还停在上一件 / 空面板」。
        runtime.refreshStudioUi?.()
        runtime.refreshStudioView()
      },
      onClose() {
        overlapHost.hidden = true
      },
    }),
    thumbnail,
    preview: createAssetPreview({
      host: previewHost,
      resolve: (target) => resolvePreviewRecord(runtime, target),
      thumbnail,
      themeKey: () => themeKeyOf(runtime),
      onError: reportPreviewFailure,
    }),
  })
}

/**
 * 重叠区域按下时「这次拖谁」：光标下的候选里有当前选中的那件，就返回它。
 *
 * 命中测试只会返回最上面那件。若用户刚从浮层里选了被压住的那件，再按下去仍按命中结果
 * 取最上面那件，就会「选中的那件永远拖不动」—— 只能在原地点一下重新弹浮层。
 *
 * 只在单选时生效：多选拖动本来就该整体移动（命中其中任一件都算）。
 */
export function overlapDragTarget(runtime: StudioAppRuntime, planPoint: unknown): string | null {
  const { appCtx } = runtime
  if (appCtx.selectedItems?.length) return null
  const selected = appCtx.selectedItem
  if (!selected || selected.kind !== 'item') return null
  const selectedId = String(selected.id)
  const candidates = collectOverlapCandidates(runtime, planPoint as { x: number; y: number })
  return candidates.some((candidate) => candidate.id === selectedId) ? selectedId : null
}

/**
 * 画布上**单击**（按下 → 抬起没拖动）时：有 ≥2 个重叠候选就弹选择器。返回是否已接管本次点击。
 *
 * 不能在按下时弹：那一刻画布已经 `setPointerCapture`，捕获期间的点击到不了浮层，
 * 于是按下只弹窗、拖动永远起不来。放到松手之后，拖动照常，单击仍能选到被压住的那件。
 */
export function offerOverlapPicker(runtime: StudioAppRuntime, planPoint: unknown, screenPoint: unknown): boolean {
  const wiring = wirings.get(runtime.appCtx)
  if (!wiring) return false
  const candidates = collectOverlapCandidates(runtime, planPoint as { x: number; y: number })
  if (candidates.length < 2) {
    wiring.picker.hide()
    return false
  }
  wiring.picker.show(candidates, screenPoint as { x: number; y: number })
  return true
}

/**
 * 松手后列候选（`pointer-input` 的入口：它只拿得到 `appCtx`）。
 *
 * 按 `appCtx` 反查这次运行时的接线：否则要给 `StudioAppRuntime` 再加一个成员，
 * 而 `boot.ts` 已经很大，不该再往里加成员。
 */
export function offerOverlapPickerFor(appCtx: object, planPoint: unknown, screenPoint: unknown): boolean {
  const wiring = wirings.get(appCtx)
  return wiring ? offerOverlapPicker(wiring.runtime, planPoint, screenPoint) : false
}

/** 换楼层 / 选择变化时收起：候选集合已失效。 */
export function dismissOverlapPicker(runtime: StudioAppRuntime): void {
  wirings.get(runtime.appCtx)?.picker.hide()
}

/** 隐藏 / 锁定后收起悬停预览（0.8.7 `oo?.hide()`）：预览的是旧位姿，留着会误导。 */
export function dismissAssetPreview(runtime: StudioAppRuntime): void {
  wirings.get(runtime.appCtx)?.preview.hide()
}

/**
 * 兼容入口：早期版本在这里逐卡挂 enter/leave。
 * 0.8.7 改成 document 委托（素材卡 + 已放置行共用），因此这里只需保证预览已安装。
 */
export function bindAssetHoverPreview(runtime: StudioAppRuntime): void {
  installOverlapAndPreview(runtime)
}

export function disposeOverlapAndPreview(runtime: StudioAppRuntime): void {
  const wiring = wirings.get(runtime.appCtx)
  if (!wiring) return
  wiring.picker.destroy()
  wiring.preview.destroy()
  wiring.thumbnail.dispose()
  wirings.delete(runtime.appCtx)
}

/**
 * 「已放置」面板的接线：把 DOM 壳层（素材库卡片 / 模式页签）与运行时状态连起来。
 *
 * 为什么是「安装一次 + 弱表索引」而不是把面板挂在 runtime 上：引擎闭包里没有地方再塞
 * 新字段（`boot.ts` 有行数预算），而刷新点分散在 `refreshStudioView`。用
 * `WeakMap<appCtx, panel>` 做索引后，任何拿到 `appCtx` 的刷新点都能推动面板更新，
 * 不必为了一个面板去改引擎的状态形状。
 *
 * 交互边界（与 0.8.7 一致）：
 * - **选择**：走 `selectSceneObject('item', id)` 并刷新画布，与在画布上点选同一条链路；
 * - **定位**：选中 + 把清单行滚进视口。**不平移相机**（上游 `j2` 只在自动导图里居中）；
 * - **隐藏 / 锁定**：只写本会话的 `session`，不进户型文档；隐藏或「显示全部」后
 *   必须**重建场景**（`scope:'all'`），否则画布上仍留着被隐藏的网格。
 */

type PlaceWiring = {
  panel: PlacedItemsPanel
  session: ReturnType<typeof createItemSession>
  card: HTMLElement
  panelElement: HTMLElement
  setMode: (mode: 'assets' | 'placed') => void
}

const placeWirings = new WeakMap<StudioAppContext, PlaceWiring>()

/**
 * 物品类型 → 中文名（模型库词表）。
 *
 * **懒构建**：模块初始化时就遍历 `itemTypeCatalog` 会踩到循环 import ——
 * 那一刻目录可能还没装配完，`Object.entries` 拿到的是空表，
 * 于是清单里所有行都退化成类型 id（`tvstand` 而不是「电视柜」）。
 * 改成首次渲染时构建，目录早已就绪。
 */
let placeTypeNamesCache: Record<string, string> | null = null
function placeTypeNames(): Record<string, string> {
  if (placeTypeNamesCache) return placeTypeNamesCache
  const names: Record<string, string> = {}
  for (const [type, entry] of Object.entries(itemTypeCatalog)) {
    const name = (entry as { name?: string } | undefined)?.name
    if (name) names[type] = name
  }
  placeTypeNamesCache = names
  return names
}

function selectedItemIds(appCtx: StudioAppContext): Set<string> {
  const ids = new Set<string>()
  for (const selected of appCtx.selectedItems ?? []) {
    if (selected?.kind === 'item' && selected.id) ids.add(String(selected.id))
  }
  if (appCtx.selectedItem?.kind === 'item' && appCtx.selectedItem.id) {
    ids.add(String(appCtx.selectedItem.id))
  }
  return ids
}

/**
 * 行详情文案（0.8.7 `t0`）：
 * - 有精确包围盒 → `实际高度 0–1.8 m`（en dash，去尾零）；
 * - 否则 → 类型化的离地字段（`底部离地 0 m` / `光源安装高度 3.5 m`）。
 */
function describeItem(
  item: Record<string, unknown>,
  bounds: { min: number; max: number; exact: boolean } | null,
): string {
  if (bounds?.exact) return `实际高度 ${editNumberText(bounds.min)}–${editNumberText(bounds.max)} m`
  const elevation = Number(item.elevation ?? 0)
  return `${itemElevationMeaning(item.type).label} ${editNumberText(Number.isFinite(elevation) ? elevation : 0)} m`
}

/** 删除后重建场景（隐藏 / 显示全部都会改变「这一层该画什么」）。 */
function rebuildAllScenes(runtime: StudioAppRuntime): void {
  runtime.requestSceneRebuild?.({ scope: 'all', force: true })
  runtime.refreshStudioUi?.()
  runtime.refreshStudioView()
}

/**
 * 隐藏之后：如果要隐藏的正是当前选中项，先取消选中。
 *
 * 不取消的话，属性面板会继续编辑一件画布上已经不存在的物件（用户以为「没反应」）。
 * 只在**确实变成隐藏**时执行（0.8.7 判的是切换后的 `Ci(item).hidden`）：点「显示」把
 * 选中项放回来时不该顺手清掉选择。
 */
function dropSelectionIfHidden(runtime: StudioAppRuntime, item: Record<string, unknown>): void {
  const id = itemIdOf(item)
  const appCtx = runtime.appCtx
  if (!isPlacedItemHidden(appCtx, id)) return
  const selected = selectedItemIds(appCtx)
  if (!selected.has(id)) return
  appCtx.selectedItems = (appCtx.selectedItems ?? []).filter(
    (entry: { id?: unknown } | null) => String(entry?.id ?? '') !== id,
  )
  if (String(appCtx.selectedItem?.id ?? '') === id) runtime.refreshSelection()
}

/** 面板挂载点：页签容器 + 卡片 + 面板的兄弟关系（缺一不可）。 */
interface PanelHosts {
  libraryPanel: HTMLElement
  card: HTMLElement
  list: HTMLElement
  search: HTMLInputElement
  panelElement: HTMLElement
}

/** 收集挂载点；缺任何一个就说明不在编辑器页面（嵌入舞台等），直接放弃。 */
function collectPanelHosts(): PanelHosts | null {
  const documentNode = globalThis.document
  // 0.8.7：页签在 `.library-panel` 下，素材库卡片与「已放置」面板是它的兄弟节点。
  const libraryPanel = documentNode.querySelector('.library-panel') as HTMLElement | null
  const card = documentNode.querySelector('.asset-library-card') as HTMLElement | null
  const list = documentNode.getElementById('placed-items-list')
  const search = documentNode.getElementById('placed-search') as HTMLInputElement | null
  const panelElement = documentNode.getElementById('placed-items-panel') as HTMLElement | null
  if (!libraryPanel || !card || !list || !search || !panelElement) return null
  return { libraryPanel, card, list, search, panelElement }
}

/** 面板状态（页签模式要在 `getState` 与 `setMode` 之间共享）。 */
interface PanelModeState {
  mode: 'assets' | 'placed'
}

/** 组装面板选项：每次渲染现算，不缓存副本。 */
function createPanelOptions(
  runtime: StudioAppRuntime,
  hosts: PanelHosts,
  session: ReturnType<typeof createItemSession>,
  state: PanelModeState,
) {
  const appCtx = runtime.appCtx
  return {
    host: hosts.list,
    search: hosts.search,
    // 侧栏头部已固定，整栏不再滚动：定位时滚的是清单本身。
    scrollHost: hosts.list,
    session,
    describe: describeItem,
    getState(): PlacedItemsState {
      const items = (appCtx.studioState?.items ?? []) as Array<Record<string, unknown>>
      return {
        floorId: String(appCtx.activeFloorId ?? ''),
        items,
        names: placeTypeNames(),
        groups: (appCtx.studioState?.lightGroups ?? []) as Array<{ id?: unknown; name?: unknown }>,
        selectedIds: selectedItemIds(appCtx),
        // 面板只在「已放置」页签下才有意义：没显示时不算可见，省掉每次刷新的整列重算。
        visible: state.mode === 'placed',
        heightBounds: (item) => exactHeightBoundsOf(runtime, itemIdOf(item)),
      }
    },
    onSelect(item: Record<string, unknown>) {
      runtime.selectSceneObject('item', itemIdOf(item))
      // 属性面板必须跟着走：否则「已放置」里选中的物件，右侧还停在上一件。
      runtime.refreshStudioUi?.()
      runtime.refreshStudioView()
    },
    onLocate(item: Record<string, unknown>) {
      runtime.selectSceneObject('item', itemIdOf(item))
      runtime.refreshStudioUi?.()
      runtime.refreshStudioView()
    },
    onState(item: Record<string, unknown>, flag: 'hidden' | 'locked') {
      // 与上游 `onState` 一致：先结束手势、收起浮层与悬停预览；只有「隐藏」才需要重建场景
      // （锁定只影响可拖动性，画面不变，重建反而会让手柄闪一下）。
      runtime.endStudioGesture?.()
      dismissOverlapPicker(runtime)
      dismissAssetPreview(runtime)
      if (flag !== 'hidden') {
        runtime.refreshStudioUi?.()
        runtime.refreshStudioView()
        return
      }
      dropSelectionIfHidden(runtime, item)
      rebuildAllScenes(runtime)
    },
  }
}

/** 页签按钮的视觉态（`hidden` 交替 + active / aria-pressed）。 */
function syncModeTabs(hosts: PanelHosts, next: 'assets' | 'placed'): void {
  hosts.card.hidden = next === 'placed'
  hosts.panelElement.hidden = next !== 'placed'
  for (const tab of hosts.libraryPanel.querySelectorAll<HTMLElement>('[data-library-mode]')) {
    const active = tab.dataset.libraryMode === next
    tab.classList.toggle('active', active)
    tab.setAttribute('aria-pressed', String(active))
  }
}

/** 绑定页签切换与「显示全部」。 */
function bindPanelActions(
  runtime: StudioAppRuntime,
  hosts: PanelHosts,
  session: ReturnType<typeof createItemSession>,
  panel: PlacedItemsPanel,
  state: PanelModeState,
): void {
  const setMode = (next: 'assets' | 'placed') => {
    // 与 0.8.7 一致：两个面板互为兄弟，用 `hidden` 交替（不是给卡片加模式类）。
    state.mode = next
    rememberLibraryMode(runtime.appCtx, next)
    // 切页签会改变「可见集合」与预览范围，先结束手势再按新范围重建。
    runtime.endStudioGesture?.()
    const scope = runtime.getPreviewScopeSelection?.()
    syncModeTabs(hosts, next)
    if (scope) runtime.requestSceneRebuild?.({ scope, preserveLightCache: true })
    panel.update({ followSelection: true })
    runtime.refreshStudioUi?.()
    runtime.refreshStudioView()
    // 3D 叠层（高度手柄 / 中心十字）要按新的可见集合重投影一次。
    refreshEditor3D(runtime.appCtx)
  }
  for (const tab of hosts.libraryPanel.querySelectorAll<HTMLElement>('[data-library-mode]')) {
    tab.addEventListener('click', () => {
      const next = tab.dataset.libraryMode === 'placed' ? 'placed' : 'assets'
      if (next !== state.mode) setMode(next)
    })
  }
  globalThis.document.getElementById('show-all-items')?.addEventListener('click', () => {
    runtime.endStudioGesture?.()
    session.showAll(String(runtime.appCtx.activeFloorId ?? ''))
    panel.update({ followSelection: false })
    rebuildAllScenes(runtime)
  })
}

/** 安装（幂等）：重复调用只返回已有实例。 */
export function installPlacedItemsPanel(runtime: StudioAppRuntime): void {
  const appCtx = runtime.appCtx
  if (placeWirings.has(appCtx)) return
  const hosts = collectPanelHosts()
  if (!hosts) return
  const session = createItemSession()
  const state: PanelModeState = { mode: 'assets' }
  const panel = createPlacedItemsPanel(createPanelOptions(runtime, hosts, session, state))
  bindPanelActions(runtime, hosts, session, panel, state)
  placeWirings.set(appCtx, {
    panel,
    session,
    card: hosts.card,
    panelElement: hosts.panelElement,
    setMode: (mode) => {
      state.mode = mode
      rememberLibraryMode(appCtx, mode)
      syncModeTabs(hosts, mode)
    },
  })
  // 引擎侧（绘制 / 命中 / 拖拽）只认这份只读读取口，不直接摸面板实例。
  registerPlacedVisibilitySource(appCtx, session)
}

/** 由画布刷新路径推动（选中、换层、增删物品都会走到这里）。 */
export function refreshPlacedItemsPanel(appCtx: StudioAppContext): void {
  placeWirings.get(appCtx)?.panel.update()
}
