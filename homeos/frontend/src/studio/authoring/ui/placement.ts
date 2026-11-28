import { type StudioAppRuntime } from '../runtime/studio-app-runtime'
import { syncHtmlRangeProgress as syncHtmlRangeProgress2 } from '../../app/shared/util/range-progress'
import { clamp as clamp2 } from '../plan/geometry'
import { syncControlValue as syncControlValue2 } from './ui-controls'
import { finite as finite2 } from '../loaders/studio-normalization'
import { setUserDecorationStageContext, decorationPlacementFields, registerUserDecorationModel } from './wiring'
import { isPlacedItemHidden, isPlacedItemLocked } from '../items/placement/placed-item-state'
import { cachePanelRatios } from './workspace'

/**
 * 平面画布的 2D 上下文（0.8.9 起从 `boot.ts` 切出）。
 *
 * 嵌入舞台可能只挂一个隐藏 stub，缺节点时用离屏 canvas —— 否则 `bootStudio` 会在
 * 同步阶段抛异常，表现为「永不出图且没有报错」。
 */
export function planCanvasContext(canvas: HTMLCanvasElement | null): CanvasRenderingContext2D | null {
  return (canvas || document.createElement('canvas')).getContext('2d')
}

export function isSnapEnabled(runtime: StudioAppRuntime) {
  return runtime.appCtx.studioState.settings.snapEnabled !== false && !runtime.appCtx.isSnapTemporarilyOff
}

export function setSnapSettingsOpen(runtime: StudioAppRuntime, settingsOpen: any) {
  ;(runtime.snapSettingsPanel.hidden = !settingsOpen),
    runtime.snapSettingsToggleButton.setAttribute('aria-expanded', String(settingsOpen))
}

export function syncSnapControls(runtime: StudioAppRuntime) {
  const isSnapOn = runtime.appCtx.studioState.settings.snapEnabled !== false
  runtime.snapToggleButton.classList.toggle('active', isSnapOn),
    runtime.snapToggleButton.setAttribute('aria-pressed', String(isSnapOn)),
    (runtime.snapToggleStateElement.textContent = isSnapOn ? '开' : '关')
  for (const snapSettingInput of runtime.snapSettingControls)
    snapSettingInput.checked =
      (runtime.appCtx.studioState.settings as any)[snapSettingInput.dataset.snapSetting!] !== false
  syncControlValue2(
    runtime.snapToleranceInput,
    clamp2(Math.round(finite2(runtime.appCtx.studioState.settings.snapTolerance, 13)), 6, 24),
  ),
    /* `hos-range-ui` 的左侧金色段靠 `--progress-pct` 裁切：每次回填数值都要同步一次，
       否则改档位后条子还停在旧进度。 */
    syncHtmlRangeProgress2(runtime.snapToleranceInput),
    (runtime.snapToleranceValueElement.textContent = runtime.snapToleranceInput.value + ' px'),
    runtime.appCtx.activeSnapTarget ||
      (runtime.snapIndicatorElement.textContent = isSnapOn ? '吸附：开启' : '吸附：关闭')
}

export function applySnapTolerance(runtime: StudioAppRuntime, resizeMoveEvent: any) {
  if (!runtime.appCtx.dragStart) return
  const draggedDetailsPanelRect = runtime.detailsPanelElement.getBoundingClientRect(),
    draggedStudioShellRect = runtime.studioShellElement.getBoundingClientRect()
  if (draggedDetailsPanelRect.height <= 0 || draggedStudioShellRect.width <= 0) return
  const yl4 = runtime.getPanelRatioLimits(),
    dragDeltaX = resizeMoveEvent.clientX - runtime.appCtx.dragStart.startX,
    dragDeltaY = resizeMoveEvent.clientY - runtime.appCtx.dragStart.startY
  if (Math.hypot(dragDeltaX, dragDeltaY) < 2) return
  runtime.detailsResizerElement.dataset.resizeAxis = 'both'
  const heightRatioDelta = dragDeltaY / draggedDetailsPanelRect.height,
    widthRatioDelta = dragDeltaX / draggedStudioShellRect.width
  ;(runtime.appCtx.studioState.settings.previewPanelRatio = clamp2(
    runtime.appCtx.dragStart.startPreviewRatio + heightRatioDelta,
    yl4.minimumHeightRatio,
    yl4.maximumHeightRatio,
  )),
    (runtime.appCtx.studioState.settings.detailsPanelWidthRatio = clamp2(
      runtime.appCtx.dragStart.startWidthRatio - widthRatioDelta,
      yl4.minimumWidthRatio,
      yl4.maximumWidthRatio,
    )),
    runtime.applyPanelRatios(),
    runtime.applyDetailsRatio(),
    cachePanelRatios(runtime)
}

export function applyWallHeightInput(runtime: StudioAppRuntime, wallHeightValue: any) {
  runtime.appCtx.activePointerId &&
    runtime.appCtx.activePointerId !== wallHeightValue &&
    runtime.applyWallOpacityInput(),
    !runtime.appCtx.activePointerId &&
      (runtime.deselectAll(), (runtime.appCtx.activePointerId = wallHeightValue), runtime.resetPlanInteraction())
}

export function applyWallThicknessInput(runtime: StudioAppRuntime) {
  runtime.appCtx.pointerMoveCount ||
    (runtime.appCtx.pointerMoveCount = requestAnimationFrame(() => {
      ;(runtime.appCtx.pointerMoveCount = 0), runtime.refreshStudioView()
    }))
}

export function applyWallOpacityInput(runtime: StudioAppRuntime) {
  window.clearTimeout(runtime.appCtx.pointerReleaseTimeoutId),
    (runtime.appCtx.pointerReleaseTimeoutId = null),
    runtime.appCtx.activePointerId &&
      ((runtime.appCtx.activePointerId = null),
      syncControlValue2(runtime.globalWallHeightInput, runtime.appCtx.studioState.settings.wallHeight.toFixed(2)),
      syncControlValue2(runtime.globalWallThicknessInput, runtime.appCtx.studioState.settings.wallThickness.toFixed(2)),
      syncControlValue2(
        runtime.globalWallOpacityInput,
        Math.round(runtime.appCtx.studioState.settings.wallOpacity * 100),
      ),
      runtime.refreshStudioUi(),
      runtime.requestSceneRebuild({
        scope: 'all',
      }),
      runtime.endStudioGesture())
}

export function scheduleWallApply(runtime: StudioAppRuntime, wallApplyDelayMs = 80) {
  window.clearTimeout(runtime.appCtx.pointerReleaseTimeoutId),
    (runtime.appCtx.pointerReleaseTimeoutId = window.setTimeout(runtime.applyWallOpacityInput, wallApplyDelayMs))
}

export function commitWallHeight(runtime: StudioAppRuntime) {
  const committedWallHeight = clamp2(
    finite2(runtime.globalWallHeightInput.value, runtime.appCtx.studioState.settings.wallHeight),
    0.01,
    6,
  )
  if (
    !(
      Math.abs(committedWallHeight - runtime.appCtx.studioState.settings.wallHeight) < 1e-8 &&
      runtime.appCtx.studioState.walls.every(
        (checkedWallHeightTarget) => Math.abs(checkedWallHeightTarget.height - committedWallHeight) < 1e-8,
      )
    )
  ) {
    runtime.applyWallHeightInput(runtime.globalWallHeightInput),
      (runtime.appCtx.studioState.settings.wallHeight = committedWallHeight)
    for (const heightUpdateWall of runtime.appCtx.studioState.walls) heightUpdateWall.height = committedWallHeight
    runtime.markDocumentDirty()
  }
}

export function commitWallThickness(runtime: StudioAppRuntime) {
  const committedWallThickness = clamp2(
    finite2(runtime.globalWallThicknessInput.value, runtime.appCtx.studioState.settings.wallThickness),
    0.01,
    3,
  )
  if (
    !(
      Math.abs(committedWallThickness - runtime.appCtx.studioState.settings.wallThickness) < 1e-8 &&
      runtime.appCtx.studioState.walls.every(
        (checkedWallThicknessTarget) => Math.abs(checkedWallThicknessTarget.thickness - committedWallThickness) < 1e-8,
      )
    )
  ) {
    runtime.applyWallHeightInput(runtime.globalWallThicknessInput),
      (runtime.appCtx.studioState.settings.wallThickness = committedWallThickness)
    for (const thicknessUpdateWall of runtime.appCtx.studioState.walls)
      thicknessUpdateWall.thickness = committedWallThickness
    runtime.applyWallThicknessInput(), runtime.markDocumentDirty()
  }
}

export function commitWallOpacity(runtime: StudioAppRuntime) {
  const committedWallOpacity =
    clamp2(
      finite2(runtime.globalWallOpacityInput.value, runtime.appCtx.studioState.settings.wallOpacity * 100),
      0,
      100,
    ) / 100
  Math.abs(committedWallOpacity - runtime.appCtx.studioState.settings.wallOpacity) < 1e-8 ||
    (runtime.applyWallHeightInput(runtime.globalWallOpacityInput),
    (runtime.appCtx.studioState.settings.wallOpacity = committedWallOpacity),
    /**
     * 全局值必须**写穿**到每面墙。
     *
     * 场景解算时 `wall.opacity ?? settings.wallOpacity` —— 单面墙一旦存过自定义值（`DIY`
     * 沿用户型、或者早先拖过单墙滑条），它就会永久盖住全局值：用户在「通用墙体透明度」
     * 拖到 100%，那几面墙仍然停在 0.25，看上去就是「调到 100% 也不显示墙体」。
     * 和 `commitWallThickness` 一样按「全局字段 = 全屋统一」处理：改全局就把单墙的覆盖
     * 清掉，让它们回到跟随全局。要单独调某面墙，之后在墙面属性里再设即可。
     */
    runtime.appCtx.studioState.walls.forEach((opacityResetWall: { opacity?: number | null }) => {
      opacityResetWall.opacity === null || opacityResetWall.opacity === undefined || (opacityResetWall.opacity = null)
    }),
    runtime.markDocumentDirty(),
    // 滑条拖动时只有 `input` 事件，`change` 要等松手才来。这里按 80ms 合并一次重建，
    // 墙才会跟着手指变浓变淡；否则整段拖动期间场景一直是旧透明度，看着像「调了没反应」。
    runtime.scheduleWallApply(80))
}

/**
 * 把舞台上下文写入用户装饰的模型登记表（0.8.9）。
 *
 * 嵌入舞台时用户装饰必须走**场景内**的模型 URL：编辑器那条 `/studio3d/models/{id}`
 * 只判登录，而舞台只该拿到「这份户型真的引用的」模型。不设置的实际表现是
 * 仪表盘 3D 控件里装饰全部缺失（请求被 404 拒绝）。
 */

export function applyUserDecorationStageContext(isStage: boolean): void {
  if (!isStage) return
  const stageSearchParams = new URLSearchParams(window.location.search)
  setUserDecorationStageContext(stageSearchParams.get('sceneId') || '', stageSearchParams.get('projectId') || '')
}

/**
 * 「我的装饰」放进户型（0.8.9）。
 *
 * 从 `boot.ts` 切出来：该文件在 studio split 预算（4200 行）上，而这段是封闭的一小块
 * （注册模型 URL → 在视图中心建物品 → 用占位尺寸）。依赖以显式参数传入、不回头读
 * boot 的闭包，因此它可以在 node 里单测。
 */

/** 用户装饰的占位尺寸（米）：真实包围盒由加载后的 GLB 写回。 */
export const DECORATION_DEFAULT_SIZE = 0.4

export type UserDecorationPlacementDeps = {
  /** 屏幕坐标 → 平面坐标（宿主提供，含视图缩放与平移）。 */
  screenToPlan: (point: { x: number; y: number }) => { x: number; y: number }
  /** 视图中心（像素）。 */
  viewCenter: () => { x: number; y: number }
  /** 在平面上建一件物品。 */
  createSceneItem: (type: string, point: { x: number; y: number }, options: Record<string, unknown>) => void
  /** 提示。 */
  showToast: (message: string, tone: string) => void
}

/**
 * 把一件「我的装饰」放进户型中心。
 *
 * 三步顺序不能变：
 * 1. **先注册模型 URL**（`model:<assetId>`）—— 建场景时靠它把 `user-decoration`
 *    映射到真实 GLB；没注册会得到一件看不见的物品；
 * 2. 再在**当前视图中心**建物品（与资源库卡片点击放置同一套坐标口径）；
 * 3. 尺寸用保守占位，真实包围盒由加载后的模型写回。
 */
export function placeUserDecorationAtViewCenter(
  model: { assetId: string; name?: string },
  deps: UserDecorationPlacementDeps,
): void {
  const decorationModelKey = registerUserDecorationModel(model.assetId, {
    width: DECORATION_DEFAULT_SIZE,
    height: DECORATION_DEFAULT_SIZE,
    depth: DECORATION_DEFAULT_SIZE,
  })
  if (!decorationModelKey) {
    deps.showToast('这个装饰模型不可用，请重新上传。', 'error')
    return
  }
  const centerPoint = deps.screenToPlan(deps.viewCenter())
  deps.createSceneItem('user-decoration', centerPoint, {
    width: DECORATION_DEFAULT_SIZE,
    depth: DECORATION_DEFAULT_SIZE,
    // 与拖拽放置共用同一份字段构造（两条路径各写一份必然漂移）。
    extraFields: decorationPlacementFields(model.assetId, model.name),
  })
}

/**
 * 属性面板里的「贴合台面」动作（0.8.7 `#item-place-surface`）。
 *
 * 单独成模块而不是写在 `boot.ts` 里：`boot.ts` 有 4200 行的拆分预算，
 * 而这段逻辑需要一圈引擎依赖 —— 塞回去会把预算顶破，摊平又会变成一串裸调用。
 *
 * 与 0.8.7 逐条对齐的三处口径（早期实现三处都偏了）：
 * 1. **显式吸附**：上游 `h0(item, state, { explicit: true })` 会跳过「吸附」总开关与
 *    `snapSurfaces` 设置。用户关掉吸附是不想要「拖到哪都自动吸」，不是禁止主动贴台面；
 *    之前复用拖动路径导致「关了吸附 → 点按钮毫无反应」。
 * 2. **位置没变就什么都不做**：上游先比 `elevation`，相等直接 `return`。之前无条件
 *    `applyPlacementChange + markDocumentDirty`，于是「已经在台面上」也会把文档标脏。
 * 3. **只有找不到台面才提示**：之前用「几何校验失败」当代理信号，而无台面时几何根本没变、
 *    校验必然通过，于是提示永远不弹、用户只看到一颗没反应的按钮。
 */

/** 引擎依赖签名：这些绑定在 boot 里都是 `(...args) => impl(runtime, ...args)` 形态。 */
type EngineCall = (...args: unknown[]) => unknown

export type PlaceSurfaceDeps = {
  appCtx: StudioAppRuntime['appCtx']
  getSelectedObject: EngineCall
  captureUndoSnapshot: EngineCall
  validateSelectionChange: EngineCall
  applyPlacementChange: EngineCall
  refreshScopeItems: EngineCall
  resolvePreviewScope: EngineCall
  markDocumentDirty: EngineCall
  refreshStudioView: EngineCall
  /** 台面吸附解析（`finalizeAddedItem`）；第三个参数为 `true` 时强制解析，返回 `null` 表示没有台面。 */
  finalizeAddedItem: EngineCall
  showToast: EngineCall
  /** 模型装载状态：有 pending 时先别改几何（改了也看不到，用户会以为没生效）。 */
  modelLoadState: () => { pending?: number; queued?: number; active?: number }
}

/** 离地高度的比较容差（米）：吸附会带来 1e-9 级的浮点抖动，不该被当成「位置变了」。 */
const ELEVATION_EPSILON = 1e-4

const NO_SURFACE_MESSAGE = '当前位置没有可用台面；请先将物件移动到支撑物上方。'

/** 模型装载中：台面识别要量模型，缺模型只会得出「没有台面」的错误结论。 */
function isModelLoading(deps: PlaceSurfaceDeps): boolean {
  const loadState = deps.modelLoadState?.()
  return Boolean(loadState && ((loadState.pending ?? 0) > 0 || (loadState.queued ?? 0) > 0))
}

/** 可贴台面（0.8.7 `Rt()`）：隐藏的物件没有可点的支撑面，锁定的物件拒绝改几何。 */
function isPlaceable(deps: PlaceSurfaceDeps, itemId: string): boolean {
  return !isPlacedItemHidden(deps.appCtx, itemId) && !isPlacedItemLocked(deps.appCtx, itemId)
}

/** 解析结果里的离地高度；没有台面 / 值不可用时为 `null`。 */
function surfaceElevationOf(resolved: { elevation?: number } | null): number | null {
  const elevation = Number(resolved?.elevation)
  return resolved && Number.isFinite(elevation) ? elevation : null
}

/**
 * 把选中物件的离地高度落到当前支撑面上。
 *
 * 复用「拖放新物件」的台面吸附，因此支撑面识别与拖动松手完全一致；差别只在
 * `explicit`（见文件头）与「没变就不动」。
 */
export function placeSelectedItemOnSurface(deps: PlaceSurfaceDeps): void {
  const item = deps.getSelectedObject() as { id?: string; elevation?: number } | null | undefined
  if (!item?.id || deps.appCtx.selectedItem?.kind !== 'item') return
  if (!isPlaceable(deps, item.id)) return
  if (isModelLoading(deps)) {
    deps.showToast('模型正在准备，请稍后再操作', 'warning')
    return
  }
  const previousElevation = Number(item.elevation) || 0
  // 快照必须在吸附解析**之前**取：解析本身会写 `item.elevation`，之后再拍就撤不回去了。
  const snapshot = deps.captureUndoSnapshot()
  const nextElevation = surfaceElevationOf(
    deps.finalizeAddedItem(item, [item.id], true) as {
      elevation?: number
    } | null,
  )
  if (nextElevation === null) {
    // 解析失败时把可能被写过的离地高度还原，宁可不动也不要留下半截状态。
    item.elevation = previousElevation
    deps.showToast(NO_SURFACE_MESSAGE)
    return
  }
  if (Math.abs(nextElevation - previousElevation) < ELEVATION_EPSILON) {
    // 已经在台面上：不记历史、不标脏、不提示（0.8.7 同）。
    item.elevation = previousElevation
    return
  }
  item.elevation = nextElevation
  if (!deps.validateSelectionChange(snapshot)) {
    item.elevation = previousElevation
    deps.refreshScopeItems(deps.resolvePreviewScope(item))
    deps.refreshStudioView()
    return
  }
  deps.applyPlacementChange(snapshot)
  deps.refreshScopeItems(deps.resolvePreviewScope(item))
  deps.markDocumentDirty()
  deps.refreshStudioView()
}
