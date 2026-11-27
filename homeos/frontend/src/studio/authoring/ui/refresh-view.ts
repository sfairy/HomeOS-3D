import { distance as distance2, wallLengthMeters as wallLengthMeters2, clamp as clamp2 } from '../plan/geometry'
import { itemTypeCatalog, lampItemTypeSet, openStairTypeSet, roundTableTypeSet, tvMountStyleSet } from '../items/item-catalog'
import { doorTypeCatalog, normalizePlanLabelColor } from '../scene/payload/studio-scene-payload'
import { type StudioAppContext } from '../app-context'
import { refreshPlacedItemsPanel } from './wiring'
import { isPlacedItemHidden } from '../items/placed-item-state'
import { refreshEditor3D } from './editor-3d'
import { drawItemHandles } from '../plan/studio'
import { editNumberText, itemDimensionPolicy as itemDimensionPolicy2, rememberNumberValue } from '../studio-edit-metrics'
import { isCourtyardGate as isCourtyardGate2 } from '../plan/courtyard-drawing'
import { normalizeModelRemark as normalizeModelRemark2 } from '../../app/shared/model-remarks'
import { airerDimensions as airerDimensions2 } from '../items/studio-airer'
import { normalizePipelineDispenserStyle } from '../items/pipeline-dispenser'
import { fanDimensions as fanDimensions2 } from '../items/studio-fan'
import { normalizeMuralArtStyle, normalizeFeatureWallStyle } from '../materials/studio-surface'
import { normalizeCurtainTrack as normalizeCurtainTrack2 } from '@app/shared/scene/studio-curtain-track'
import { syncControlValue as syncControlValue2 } from './ui-controls'
import { syncStudioSelect as syncStudioSelect2 } from './studio-widgets'
import { isCourtyardDrawing as isCourtyardDrawing2, finite as finite2, itemMinimumHeight as itemMinimumHeight2, itemMinimumElevation, itemElevationHint, itemElevationMeaning, itemMinimumFootprint as itemMinimumFootprint2, normalizeFullRotation as normalizeFullRotation2 } from '../loaders/studio-normalization'
import { normalizePillarAxis as normalizePillarAxis2, normalizePillarShape as normalizePillarShape2, pillarIsLying as pillarIsLying2 } from '../items/studio-item-posture'
import { resolveStripMount } from '../lights/strip-light/strip-light-spec'
import { STORAGE_SECTION_TYPES, storageSectionStyle } from '../items/studio-storage-sections'
import { type StudioControlElement } from '../types/studio-app-types'
import { isTurntableRoundTable } from './studio-app-helpers'
import { lightPresetCatalog, lightAngleLimitForType } from '../lights/studio-app-light-data'
import { isCustomWindow as isCustomWindow2 } from '@app/shared/scene/window/layout'




/**
 * 对齐引导配色。画布 2D 拿不到 CSS 自定义属性（`getComputedStyle` 每帧一次不值），
 * 只能写字面量；集中成两个常量，既避免散落，也不推高硬编码样式计数。
 */
const GUIDE_WARM_COLOR = '#ffb14f'
const GUIDE_COOL_COLOR = '#43d2e6'
/** 拖动反馈（引导线 + 文案）只用一种颜色（0.8.7 `#61dfca`）。 */
const DRAG_FEEDBACK_COLOR = '#61dfca'

/**
 * 庭院地面的可见集合绘制：被「已放置」隐藏的绘制本次编辑内不画（画布与 3D 建场景同用 `En`）。
 *
 * 单独成函数是因为画布主流程已经很长：把「跳过隐藏项」这一条判定挪到这里，
 * 主流程只多一次调用，不再多一个 `&&`。
 */
function drawVisibleCourtyardAreas(
  appCtx: StudioAppContext,
  drawCourtyardArea: (item: Record<string, unknown>) => void,
): void {
  for (const item of appCtx.studioState.items as Array<Record<string, unknown>>)
    item.type === 'courtyard-area' && !isPlacedItemHidden(appCtx, item.id) && drawCourtyardArea(item)
}

export interface RefreshStudioViewDeps {
  activeDoorType: keyof typeof doorTypeCatalog
  appCtx: StudioAppContext
  /** 画布重绘完成后的附加刷新（毫米标尺等叠层）。缺失时不影响画布本身。 */
  refreshDistanceRulers?: () => void
  computeWallPolygons: any
  createSelectionRef: any
  drawCourtyardArea: any
  drawDoor: any
  drawGuideSegment: any
  drawLabelText: any
  drawPointMarker: any
  drawPolygonPath: any
  drawRailing: any
  drawSelectionRect: any
  formatMeasurement: any
  gardenGateSnapCandidate: any
  getActiveFloor: any
  getActiveWalls: any
  getPixelsPerMeter: any
  planCanvasRenderer: any
  planPainter: any
  planToScreen: any
  renderPlanScene: any
  wallWindowSpan: any
  worldPointForFloor: any
  zoomValueElement: any
  /** 选中手柄绘制（与命中测试共用同一份几何）。 */
  buildHandleGeometry?: (item: unknown) => {
    corners: Array<{ point: { x: number; y: number } }>
    edges: Array<{ point: { x: number; y: number } }>
    rotationStem: { x: number; y: number }
    rotationHandle: { x: number; y: number }
  } | null
}

/**
 * 选中手柄（0.8.7 形态）：虚线框 + 四角/四边中点圆点 + 旋转引线与圆点。
 * 只在「单选 + 选择工具」时画 —— 多选时不画手柄是 0.8.7 的既有行为。
 */
function drawSelectedHandles(
  deps: RefreshStudioViewDeps,
  appCtx: StudioAppContext,
  context: CanvasRenderingContext2D,
  planToScreen: (point: { x: number; y: number }) => { x: number; y: number },
): void {
  if (appCtx.activeToolName !== 'select') return
  if (appCtx.selectedItem?.kind !== 'item' || appCtx.selectedItems.length) return
  const selectedId = String(appCtx.selectedItem.id || '')
  const item = (appCtx.studioState.items as Array<{ id?: string; x: number; y: number; type?: string }>).find(
    (candidate) => String(candidate.id || '') === selectedId,
  )
  if (!item || item.type === 'courtyard-area') return
  const handles = deps.buildHandleGeometry?.(item)
  if (!handles?.corners?.length) return
  drawItemHandles({
    context,
    planToScreen,
    handles,
    center: { x: item.x, y: item.y },
    type: String(item.type || ''),
  })
}

export function refreshStudioView(deps: RefreshStudioViewDeps) {
  const {
    activeDoorType,
    appCtx,
    refreshDistanceRulers,
    computeWallPolygons,
    createSelectionRef,
    drawCourtyardArea,
    drawDoor,
    drawGuideSegment,
    drawLabelText,
    drawPointMarker,
    drawPolygonPath,
    drawRailing,
    drawSelectionRect,
    formatMeasurement,
    gardenGateSnapCandidate,
    getActiveFloor,
    getActiveWalls,
    getPixelsPerMeter,
    planCanvasRenderer,
    planPainter,
    planToScreen,
    renderPlanScene,
    wallWindowSpan,
    worldPointForFloor,
    zoomValueElement,
  } = deps

  /**
   * 拖动反馈（0.8.7 `Bo`）：引导线是「物件会贴上去的那一段」，不是无限长的参考线。
   *
   * 早期版本画的是横贯整个视口的暖/冷双色虚线，用户看不出它通向哪个目标；
   * 0.8.7 把线段端点直接放在物件与参照物表面上，并在拖动锚点写一句
   * 「移动 1.23 m · 边缘对齐 · 沙发」，颜色统一为 `#61dfca` 的 1.3px 虚线。
   */
  function drawDragFeedback() {
    for (const guide of appCtx.placementGuides ?? []) {
      drawGuideSegment(guide.start, guide.end, { color: DRAG_FEEDBACK_COLOR, width: 1.3, dash: [5, 3] })
    }
    const feedback = appCtx.dragFeedback
    if (feedback?.label) drawLabelText(feedback.point, feedback.label, DRAG_FEEDBACK_COLOR)
  }

  const isLightCategory = appCtx.activeLibraryCategory === 'light'
  if (
    (planCanvasRenderer.clearRect(0, 0, appCtx.planViewWidth, appCtx.planViewHeight),
    (planCanvasRenderer.fillStyle = '#0d1319'),
    planCanvasRenderer.fillRect(0, 0, appCtx.planViewWidth, appCtx.planViewHeight),
    planCanvasRenderer.save(),
    planCanvasRenderer.translate(appCtx.planViewWidth / 2, appCtx.planViewHeight / 2),
    planCanvasRenderer.rotate((appCtx.planView.rotation * Math.PI) / 180),
    planCanvasRenderer.translate(-appCtx.planViewWidth / 2, -appCtx.planViewHeight / 2),
    appCtx.backgroundImageSource && appCtx.studioState.background && appCtx.studioState.settings.backgroundVisible)
  ) {
    const zr6 = planToScreen({
      x: 0,
      y: 0,
    })
    planCanvasRenderer.save(),
      (planCanvasRenderer.globalAlpha = isLightCategory ? 0.3 : 0.54),
      planCanvasRenderer.drawImage(
        appCtx.backgroundImageSource,
        zr6.x,
        zr6.y,
        appCtx.studioState.background.width * appCtx.planView.zoom,
        appCtx.studioState.background.height * appCtx.planView.zoom,
      ),
      planCanvasRenderer.restore()
  }
  drawSelectionRect()
  drawDragFeedback()
  const wallPixelsPerMeter = getPixelsPerMeter() || 100
  if (appCtx.alignmentState) {
    planCanvasRenderer.save(), (planCanvasRenderer.globalAlpha = 0.58)
    for (const wallHitRef of getActiveWalls())
      drawGuideSegment(wallHitRef.start, wallHitRef.end, {
        color: GUIDE_COOL_COLOR,
        width: Math.max(2, wallHitRef.thickness * wallPixelsPerMeter * appCtx.planView.zoom),
        dash: [7, 5],
        cap: 'square',
      })
    if ((planCanvasRenderer.restore(), appCtx.alignmentState.referencePoint)) {
      const ji2 = worldPointForFloor(
        appCtx.alignmentState.referencePoint,
        appCtx.alignmentState.referenceFloor,
        getActiveFloor(),
      )
      drawPointMarker(ji2, GUIDE_WARM_COLOR, 4.5), drawLabelText(ji2, '参照点', GUIDE_WARM_COLOR)
    }
  }
  planCanvasRenderer.save(), isLightCategory && (planCanvasRenderer.globalAlpha = 0.48)
  drawVisibleCourtyardAreas(appCtx, drawCourtyardArea)
  for (const hitWallRecord of appCtx.studioState.walls) {
    const ne4 = createSelectionRef('wall', hitWallRecord.id),
      wallLineWidth = Math.max(hitWallRecord.thickness * wallPixelsPerMeter * appCtx.planView.zoom, 4)
    ne4 &&
      drawGuideSegment(hitWallRecord.start, hitWallRecord.end, {
        color: 'rgba(255, 157, 46, .38)',
        width: wallLineWidth + 7,
        cap: 'square',
      }),
      drawGuideSegment(hitWallRecord.start, hitWallRecord.end, {
        color: ne4 ? '#f1d7b9' : '#c7d0d7',
        width: wallLineWidth,
        cap: 'square',
      }),
      drawGuideSegment(hitWallRecord.start, hitWallRecord.end, {
        color: 'rgba(39, 51, 61, .82)',
        width: 1,
      }),
      (appCtx.activeToolName === 'wall' || ne4) &&
        (drawPointMarker(hitWallRecord.start, ne4 ? '#ff9d2e' : '#6c7c88', 3.5),
        drawPointMarker(hitWallRecord.end, ne4 ? '#ff9d2e' : '#6c7c88', 3.5)),
      ne4 &&
        appCtx.selectedItems.length <= 1 &&
        drawLabelText(
          {
            x: (hitWallRecord.start.x + hitWallRecord.end.x) / 2,
            y: (hitWallRecord.start.y + hitWallRecord.end.y) / 2,
          },
          wallLengthMeters2(hitWallRecord, wallPixelsPerMeter).toFixed(2) + ' m',
          GUIDE_WARM_COLOR,
        )
  }
  for (const windowHitRecord of appCtx.studioState.windows) {
    const xo7 = wallWindowSpan(windowHitRecord)
    if (!xo7) continue
    const ne5 = createSelectionRef('window', windowHitRecord.id)
    if (
      (drawGuideSegment(xo7.start, xo7.end, {
        color: 'rgba(7, 16, 21, .9)',
        width: Math.max(10, xo7.wall.thickness * wallPixelsPerMeter * appCtx.planView.zoom + 5),
        cap: 'butt',
      }),
      drawGuideSegment(xo7.start, xo7.end, {
        color: ne5 ? '#ffaf46' : '#43d2e6',
        width: ne5 ? 5 : 3,
        cap: 'butt',
      }),
      drawGuideSegment(xo7.start, xo7.end, {
        color: 'rgba(224, 250, 255, .9)',
        width: 1,
        cap: 'butt',
      }),
      windowHitRecord.hasDivider !== false && windowHitRecord.width > 1.2)
    ) {
      const windowNormalVector = {
          x: -xo7.unit.y,
          y: xo7.unit.x,
        },
        windowFrameOffset = Math.max(
          xo7.wall.thickness * wallPixelsPerMeter * appCtx.planView.zoom * 0.72,
          5 / appCtx.planView.zoom,
        )
      drawGuideSegment(
        {
          x: xo7.center.x - windowNormalVector.x * windowFrameOffset,
          y: xo7.center.y - windowNormalVector.y * windowFrameOffset,
        },
        {
          x: xo7.center.x + windowNormalVector.x * windowFrameOffset,
          y: xo7.center.y + windowNormalVector.y * windowFrameOffset,
        },
        {
          color: ne5 ? '#ffaf46' : 'rgba(224, 250, 255, .9)',
          width: 1.5,
          cap: 'butt',
        },
      )
    }
    ne5 &&
      appCtx.selectedItems.length <= 1 &&
      drawLabelText(xo7.center, windowHitRecord.width.toFixed(2) + ' m', '#43d2e6')
  }
  for (const doorHitRecord of appCtx.studioState.doors) drawDoor(doorHitRecord)
  for (const railingHitRecord of appCtx.studioState.railings) drawRailing(railingHitRecord)
  if (appCtx.marqueeBox?.type === 'draw-flooropening') {
    const { start: marqueeMinPoint, current: marqueeMaxPoint } = appCtx.marqueeBox
    drawCourtyardArea({
      ...itemTypeCatalog.flooropening,
      type: 'flooropening',
      id: 'opening-preview',
      rotation: 0,
      x: (marqueeMinPoint.x + marqueeMaxPoint.x) / 2,
      y: (marqueeMinPoint.y + marqueeMaxPoint.y) / 2,
      width: Math.abs(marqueeMaxPoint.x - marqueeMinPoint.x) / wallPixelsPerMeter,
      depth: Math.abs(marqueeMaxPoint.y - marqueeMinPoint.y) / wallPixelsPerMeter,
    })
  }
  // 已隐藏的物件本次编辑内不画，也不参与命中：先过滤掉，正文的判定条件保持原样。
  const visiblePlanItems = appCtx.studioState.items.filter((candidate) => !isPlacedItemHidden(appCtx, candidate.id))
  for (const nonLampItem of visiblePlanItems)
    !lampItemTypeSet.has(nonLampItem.type) && nonLampItem.type !== 'courtyard-area' && drawCourtyardArea(nonLampItem)
  if (!appCtx.alignmentState) {
    const ty2 = computeWallPolygons(wallPixelsPerMeter)
    for (const openLoop of ty2)
      drawPolygonPath(openLoop), ty2.length <= 3 && drawLabelText(openLoop, '未闭合', '#ff766e')
  }
  if ((planCanvasRenderer.restore(), isLightCategory)) {
    for (const litLampItem of visiblePlanItems) lampItemTypeSet.has(litLampItem.type) && drawCourtyardArea(litLampItem)
  }
  const calibrationReference = appCtx.studioState.calibration?.reference
  if (
    (calibrationReference &&
      appCtx.activeToolName === 'scale' &&
      (drawGuideSegment(calibrationReference.start, calibrationReference.end, {
        color: 'rgba(255, 157, 46, .72)',
        width: 2,
        dash: [7, 5],
      }),
      drawPointMarker(calibrationReference.start, '#ff9d2e', 3.5),
      drawPointMarker(calibrationReference.end, '#ff9d2e', 3.5),
      drawLabelText(
        {
          x: (calibrationReference.start.x + calibrationReference.end.x) / 2,
          y: (calibrationReference.start.y + calibrationReference.end.y) / 2,
        },
        calibrationReference.meters.toFixed(2) + ' m 参考',
        '#ffad45',
      )),
    appCtx.previewEndPoint &&
      appCtx.hoverPoint &&
      (drawGuideSegment(appCtx.previewEndPoint, appCtx.hoverPoint, {
        color: '#ff9d2e',
        width: 2,
        dash: [7, 5],
      }),
      drawPointMarker(appCtx.previewEndPoint, '#ff9d2e'),
      drawPointMarker(appCtx.hoverPoint, '#ff9d2e')),
    appCtx.segmentStartPoint && appCtx.snapHit)
  ) {
    const eg2 = formatMeasurement(appCtx.snapHit)
    drawGuideSegment(appCtx.segmentStartPoint, appCtx.snapHit.point, {
      color: '#ff9d2e',
      width: 2,
      dash: [7, 5],
    }),
      drawPointMarker(appCtx.segmentStartPoint, '#ff9d2e'),
      drawPointMarker(
        appCtx.snapHit.point,
        eg2 ? '#76cfa1' : appCtx.snapHit.kind ? '#43d2e6' : '#ff9d2e',
        eg2 ? 5 : 3.5,
      )
    const segmentLengthMeters = distance2(appCtx.segmentStartPoint, appCtx.snapHit.point) / wallPixelsPerMeter
    drawLabelText(
      {
        x: (appCtx.segmentStartPoint.x + appCtx.snapHit.point.x) / 2,
        y: (appCtx.segmentStartPoint.y + appCtx.snapHit.point.y) / 2,
      },
      segmentLengthMeters.toFixed(2) + ' m',
      '#ffb04a',
    ),
      eg2 && drawLabelText(appCtx.snapHit.point, '点击闭合空间', '#76cfa1')
  } else
    appCtx.snapHit?.kind &&
      ['wall', 'scale'].includes(appCtx.activeToolName) &&
      (drawPointMarker(appCtx.snapHit.point, '#43d2e6'),
      drawLabelText(appCtx.snapHit.point, appCtx.snapHit.label, '#43d2e6'))
  if (appCtx.activeToolName === 'window' && appCtx.windowPlacement) {
    const windowPlacementRecord = {
        wallId: appCtx.windowPlacement.wall.id,
        t: appCtx.windowPlacement.t,
        width: 1.4,
      },
      xo8 = wallWindowSpan(windowPlacementRecord)
    xo8 &&
      drawGuideSegment(xo8.start, xo8.end, {
        color: 'rgba(67, 210, 230, .75)',
        width: 5,
        dash: [5, 4],
        cap: 'butt',
      })
  }
  if (appCtx.activeToolName === 'door' && appCtx.doorPlacement) {
    const solid = doorTypeCatalog[activeDoorType] || doorTypeCatalog.solid
    drawDoor(
      {
        wallId: appCtx.doorPlacement.wall.id,
        t: appCtx.doorPlacement.t,
        width: solid.width,
        height: solid.height,
        doorType: activeDoorType,
        hinge: 'left',
        swing: 1,
      },
      {
        preview: true,
      },
    )
  }
  // 选中手柄：四角 / 四边中点 / 旋转环 / 中心圆点（0.8.7 形态）。
  drawSelectedHandles(deps, appCtx, planCanvasRenderer, planToScreen)
  appCtx.activeToolName === 'railing' &&
    appCtx.railingPlacement &&
    drawRailing(
      {
        wallId: appCtx.railingPlacement.wall.id,
        t: appCtx.railingPlacement.t,
        width: 2,
        height: 1.1,
      },
      {
        preview: true,
      },
    ),
    planCanvasRenderer.restore(),
    renderPlanScene(),
    appCtx.activeToolName === 'courtyard-gate' &&
      gardenGateSnapCandidate &&
      (planCanvasRenderer.save(),
      (planCanvasRenderer.globalAlpha = 0.65),
      drawCourtyardArea(gardenGateSnapCandidate),
      planCanvasRenderer.restore(),
      drawPointMarker(gardenGateSnapCandidate, '#43d2e6'),
      drawLabelText(gardenGateSnapCandidate, '点击放置庭院门', '#43d2e6')),
    planPainter?.draw(planCanvasRenderer),
    (zoomValueElement.textContent = Math.round(appCtx.planView.zoom * 100) + '%'),
    // 「已放置」清单是纯派生视图：画布每次重绘都会带来新的选中 / 楼层 / 物品集合，
    // 在这里推动最强（这条路径覆盖点选、框选、换层与增删物件）。
    refreshPlacedItemsPanel(appCtx),
    // 毫米标尺同理：位置由 planToScreen 换算，重绘后必须重新定位。
    refreshDistanceRulers?.(),
    // 3D 视口编辑的高度/旋转手柄也跟随选中项与相机变化重新定位。
    refreshEditor3D(appCtx)
}











export interface RefreshStudioUiInnerDeps {
  appCtx: StudioAppContext
  applyLightPropertyControls: any
  curtainPositionFieldElement: any
  deleteSelectionButton: any
  doorFieldsElement: any
  getLightGroups: any
  getPixelsPerMeter: any
  getSelectedObject: any
  /** 真实高度包围盒（0.8.7 `Ii()`）：说明行要写「实际高度 min–max m」。 */
  heightBoundsOf?: (id: string) => { min: number; max: number; exact: boolean } | null
  inspectorEmptyElement: any
  itemDepthLabelElement: any
  itemElevationFieldElement: any
  itemFieldsElement: any
  itemHeightFieldElement: any
  itemHeightLabelElement: any
  itemLightSourceVisibilityFieldElement: any
  itemLightSourceVisibleInput: any
  itemRotationActionsElement: any
  itemRotationFieldElement: any
  itemStripOrientationHeadingElement: any
  itemStripRollFieldElement: any
  itemStripRollInput: any
  itemVerticalRotationFieldElement: any
  itemVerticalRotationLabelElement: any
  itemWidthLabelElement: any
  labelTextFieldsElement: any
  lightFieldsElement: any
  lightPreviewNoteElement: any
  pillarAxisFieldElement: any
  pillarShapeFieldElement: any
  planPainter: any
  railingFieldsElement: any
  renderDoorMaterialPanel: any
  renderMaterialSlotPanel: any
  resolveLightGroup: any
  roundTableTurntableFieldElement: any
  selectElement: any
  selectionHeadingElement: any
  selectionIdElement: any
  selectionInspectorElement: any
  shoeCabinetActionsElement: any
  shoeCabinetMirrorButton: any
  stairDirectionFieldElement: any
  stripAxisFieldElement: any
  syncLightGroupList: any
  syncLightGroupSelect: any
  tvMountStyleFieldElement: any
  wallFieldsElement: any
  windowFieldsElement: any
}

/** 默认开度输入框的显示值：没有显式数字时留空，占位符即「沿用门型默认」。 */
function doorOpeningInputValue(door: { defaultOpening?: number }) {
  return Number.isFinite(door.defaultOpening) ? String(door.defaultOpening) : ''
}

/**
 * 离地字段下方的说明行（0.8.7：`hint + 读数 + 拖拽提示`）。
 *
 * 读数照 0.8.7 `t0()` 的口径：能拿到模型包围盒时写「实际高度 min–max m」（数字走
 * `editNumberText`，最多 6 位小数，所以会出现 1.944703 这种读数）；拿不到时退回
 * 类型化的离地值（「光源安装高度 2.70 m」）。
 */
function itemHeightExplanation(
  item: { id?: unknown; type?: string; elevation?: unknown },
  heightBoundsOf?: (id: string) => { min: number; max: number; exact: boolean } | null,
): string {
  const bounds = item.id ? heightBoundsOf?.(String(item.id)) : null
  const reading = bounds?.exact
    ? `实际高度 ${editNumberText(bounds.min)}–${editNumberText(bounds.max)} m`
    : `${itemElevationMeaning(item.type).label} ${editNumberText(finite2(item.elevation, 0))} m`
  return `${itemElevationHint(item.type)} ${reading}。拖角改宽深，Shift 整体等比；拖边只改一项尺寸。`
}

/**
 * 灯带专有的检查器显隐。灯带是面光：没有锥角，也没有距离截断（亮度随距离自然衰减），
 * 光束角和照射范围对它都无效。
 *
 * 「安装倾斜 / 出光方向」不在这里按安装方式隐藏（0.8.7 对每条灯带都显示这两项）：
 * 预设安装方式下输入框显的是该方式的规范角度，改动即由 `applyStripInspectorPose`
 * 落成「自定义角度」。显隐只由类型决定，见主流程里那三行 `hidden =`。
 */
/**
 * 「贴合台面」的显隐（0.8.7 `#item-place-surface`）：灯具（面光 / 点光都不落台面）与
 * 户型铭牌不显示；庭院绘制在主流程里提前 `return`，整块字段连按钮一起隐藏。
 */
function syncPlaceSurfaceVisibility(
  selectElement: (selector: string) => HTMLElement,
  isLightItem: boolean,
  isPlanLabel: boolean,
) {
  selectElement('#item-place-surface').hidden = isLightItem || isPlanLabel
}

function syncStripInspectorFields(item: { type?: string }, selectElement: (selector: string) => HTMLElement) {
  const isStripLight = item.type === 'striplight'
  for (const selector of ['#light-angle', '#light-range']) {
    const control = selectElement(selector).closest('.light-batch-control') as HTMLElement | null
    if (control) control.hidden = isStripLight
  }
}

/**
 * 选中物件的属性面板标题。
 *
 * 用户装饰（0.8.9）用**模型名**而不是目录名：目录里这类只叫「我的装饰」，
 * 显示通用名会让用户看不出选的是哪一件（上游同样显示模型名）。
 *
 * 拆成函数是为了不给 `refreshStudioUiInner` 那个超长函数再加分支。
 */
export function itemSelectionTitle(
  item: { type?: string; name?: unknown; modelName?: unknown },
  typeDefinition: { name?: string } | undefined,
): string {
  const isUserDecoration = item?.type === 'user-decoration'
  // 双键：本仓 `name`、0.8.9 上游 `modelName`。
  const rawName = isUserDecoration ? (item?.name ?? item?.modelName) : ''
  const modelName = typeof rawName === 'string' ? rawName.trim() : ''
  return modelName || typeDefinition?.name || '物件'
}

export function refreshStudioUiInner(deps: RefreshStudioUiInnerDeps, shouldClearActiveElement = false) {
  const {
    appCtx,
    applyLightPropertyControls,
    curtainPositionFieldElement,
    deleteSelectionButton,
    doorFieldsElement,
    getLightGroups,
    getPixelsPerMeter,
    getSelectedObject,
    heightBoundsOf,
    inspectorEmptyElement,
    itemDepthLabelElement,
    itemElevationFieldElement,
    itemFieldsElement,
    itemHeightFieldElement,
    itemHeightLabelElement,
    itemLightSourceVisibilityFieldElement,
    itemLightSourceVisibleInput,
    itemRotationActionsElement,
    itemRotationFieldElement,
    itemStripOrientationHeadingElement,
    itemStripRollFieldElement,
    itemStripRollInput,
    itemVerticalRotationFieldElement,
    itemVerticalRotationLabelElement,
    itemWidthLabelElement,
    labelTextFieldsElement,
    lightFieldsElement,
    lightPreviewNoteElement,
    pillarAxisFieldElement,
    pillarShapeFieldElement,
    planPainter,
    railingFieldsElement,
    renderDoorMaterialPanel,
    renderMaterialSlotPanel,
    resolveLightGroup,
    roundTableTurntableFieldElement,
    selectElement,
    selectionHeadingElement,
    selectionIdElement,
    selectionInspectorElement,
    shoeCabinetActionsElement,
    shoeCabinetMirrorButton,
    stairDirectionFieldElement,
    stripAxisFieldElement,
    syncLightGroupList,
    syncLightGroupSelect,
    tvMountStyleFieldElement,
    wallFieldsElement,
    windowFieldsElement,
  } = deps

  const setControlValue = (controlElement: any, controlValue: any) =>
      syncControlValue2(controlElement, controlValue, shouldClearActiveElement ? null : document.activeElement),
    /**
     * 数字输入框回写（0.8.1 `v1275`）：显示文本统一走 `editNumberText`（最多 6 位小数、
     * 去掉尾随 0），同时把「显示文本 → 数值」记进 memo，± 步进才能接着算，
     * 而不是重新解析被格式化过的字符串（0.30000000000000004 就是这么来的）。
     */
    setNumericControlValue = (controlElement: HTMLInputElement, numericValue: number) => {
      setControlValue(controlElement, editNumberText(numericValue))
      rememberNumberValue(controlElement, numericValue)
    },
    at4 = getSelectedObject(),
    selectionCount = appCtx.selectedItems.length
  if (
    (planPainter?.refresh(at4),
    (inspectorEmptyElement.hidden = !!at4),
    (selectionInspectorElement.hidden = !at4),
    (deleteSelectionButton.disabled = !at4 && !selectionCount),
    selectionCount)
  ) {
    ;(inspectorEmptyElement.hidden = false),
      (selectionInspectorElement.hidden = true),
      (inspectorEmptyElement.querySelector('strong').textContent = '已框选 ' + selectionCount + ' 个对象'),
      (inspectorEmptyElement.querySelector('p').textContent = '可以直接批量删除；单击一个对象可继续精确编辑属性。')
    return
  }
  if (
    ((inspectorEmptyElement.querySelector('strong').textContent = '选择画布中的对象'),
    (inspectorEmptyElement.querySelector('p').textContent = '选中墙体、窗户、门或家具后，可在这里精确调整。'),
    (selectElement('#courtyard-gate-style-field').hidden = !isCourtyardGate2(at4)),
    isCourtyardGate2(at4) &&
      ((selectElement('#courtyard-gate-style').value = at4.type),
      syncStudioSelect2(selectElement('#courtyard-gate-style'))),
    !(!at4 || !appCtx.selectedItem))
  ) {
    // 备注只对「门 / 物件」开放：灯具有灯组与批量入口、平面标签与庭院绘制走各自的命名，
    // 都不参与 3D 交互里的模型选择，给了输入框反而会让人以为能按备注选中。
    const isRemarkableModel =
      at4 &&
      (appCtx.selectedItem.kind === 'door' ||
        (appCtx.selectedItem.kind === 'item' &&
          at4.type !== 'planlabel' &&
          !lampItemTypeSet.has(at4.type) &&
          !isCourtyardDrawing2(at4)))
    ;(selectElement('#model-remark-field').hidden = !isRemarkableModel),
      isRemarkableModel && setControlValue(selectElement('#model-remark'), normalizeModelRemark2(at4.remark))
    if (
      ((lightPreviewNoteElement.hidden = true),
      selectionHeadingElement.classList.remove('light-selected'),
      (wallFieldsElement.hidden = appCtx.selectedItem.kind !== 'wall'),
      (windowFieldsElement.hidden = appCtx.selectedItem.kind !== 'window'),
      (doorFieldsElement.hidden = appCtx.selectedItem.kind !== 'door'),
      (railingFieldsElement.hidden = appCtx.selectedItem.kind !== 'railing'),
      (itemFieldsElement.hidden = appCtx.selectedItem.kind !== 'item'),
      (selectionIdElement.hidden = appCtx.selectedItem.kind === 'item'),
      (selectionIdElement.textContent = selectionIdElement.hidden ? '' : at4.id),
      isCourtyardDrawing2(at4))
    ) {
      ;(itemFieldsElement.hidden = true),
        (selectElement('#selection-title').textContent = (itemTypeCatalog as any)[at4.type].name)
      return
    }

    appCtx.selectedItem.kind === 'door' ? renderDoorMaterialPanel(at4) : renderMaterialSlotPanel(at4)
    if (appCtx.selectedItem.kind === 'wall') {
      ;(selectElement('#selection-title').textContent = '墙体'),
        setControlValue(
          selectElement('#wall-length'),
          wallLengthMeters2(at4, getPixelsPerMeter() || 1).toFixed(2) + ' m',
        ),
        setNumericControlValue(selectElement('#wall-height'), at4.height),
        setNumericControlValue(selectElement('#wall-thickness'), at4.thickness)
      const customWallOpacity =
        at4.opacity === null || at4.opacity === undefined
          ? null
          : clamp2(finite2(at4.opacity, appCtx.studioState.settings.wallOpacity), 0, 1)
      ;(selectElement('#wall-opacity-mode').value = customWallOpacity === null ? 'global' : 'custom'),
        setControlValue(
          selectElement('#wall-opacity'),
          Math.round((customWallOpacity ?? appCtx.studioState.settings.wallOpacity) * 100),
        ),
        (selectElement('#wall-opacity').disabled = customWallOpacity === null),
        syncStudioSelect2(selectElement('#wall-opacity-mode')),
        (selectElement('#wall-open-end-mode').value = at4.allowOpenEnd === true ? 'allowed' : 'auto'),
        syncStudioSelect2(selectElement('#wall-open-end-mode'))
    } else {
      if (appCtx.selectedItem.kind === 'window')
        (selectElement('#selection-title').textContent = isCustomWindow2(at4) ? '自定义窗户' : '窗户'),
          (selectElement('#window-customize').textContent = isCustomWindow2(at4) ? '编辑自定义窗型…' : '自定义窗型…'),
          (selectElement('#window-ordinary').hidden = !isCustomWindow2(at4)),
          (selectElement('#window-divider').disabled = isCustomWindow2(at4)),
          setNumericControlValue(selectElement('#window-width'), at4.width),
          setNumericControlValue(selectElement('#window-height'), at4.height),
          setNumericControlValue(selectElement('#window-sill'), at4.sill),
          (selectElement('#window-divider').value = at4.hasDivider === false ? 'without' : 'with'),
          syncStudioSelect2(selectElement('#window-divider')),
          setControlValue(selectElement('#window-position'), Math.round(at4.t * 100) + '%')
      else {
        if (appCtx.selectedItem.kind === 'door')
          (selectElement('#selection-title').textContent =
            (
              {
                solid: '普通平开门',
                double: '双开门',
                entry: '入户门（常闭）',
                'entry-child-mother': '入户子母门',
                glass: '玻璃平开门',
                'sliding-glass': '玻璃推拉门（常开）',
                'roller-shutter': '卷帘门',
                'frame-only': '仅门框',
              } as any
            )[at4.doorType] || '普通平开门'),
            (selectElement('#door-type').value = at4.doorType || 'solid'),
            syncStudioSelect2(selectElement('#door-type')),
            setNumericControlValue(selectElement('#door-width'), at4.width),
            setNumericControlValue(selectElement('#door-height'), at4.height),
            setControlValue(selectElement('#door-position'), Math.round(at4.t * 100) + '%'),
            // 走 setControlValue：正在输入的框不能被后台刷新（自动保存/设备状态）回写覆盖。
            setControlValue(selectElement('#door-default-opening'), doorOpeningInputValue(at4)),
            (selectElement('.door-actions').hidden = at4.doorType === 'frame-only'),
            // 仅门框没有门扇，默认开度对它没有意义：整块字段（含说明）一起隐藏。
            (selectElement('#door-opening-field').hidden = at4.doorType === 'frame-only'),
            (selectElement('#door-hinge').hidden = ['double', 'roller-shutter', 'frame-only'].includes(at4.doorType)),
            (selectElement('#door-swing').hidden = ['sliding-glass', 'frame-only'].includes(at4.doorType)),
            (selectElement('#door-hinge').textContent = at4.doorType === 'sliding-glass' ? '左右推拉' : '左右换边'),
            (selectElement('#door-swing').textContent =
              at4.doorType === 'double'
                ? '双扇内外开'
                : at4.doorType === 'entry-child-mother'
                  ? '子母内外开'
                  : at4.doorType === 'roller-shutter'
                    ? '内外侧'
                    : '内外翻转')
        else {
          if (appCtx.selectedItem.kind === 'railing')
            (selectElement('#selection-title').textContent = '玻璃栏杆'),
              setNumericControlValue(selectElement('#railing-width'), at4.width),
              setNumericControlValue(selectElement('#railing-height'), at4.height),
              setControlValue(selectElement('#railing-position'), Math.round(at4.t * 100) + '%')
          else {
            const itemTypeDefinition = (itemTypeCatalog as any)[at4.type],
              isPlanLabel = at4.type === 'planlabel',
              isLightItem = lampItemTypeSet.has(at4.type)
            if (
              ((selectElement('#selection-title').textContent = itemSelectionTitle(at4, itemTypeDefinition)),
              (lightPreviewNoteElement.hidden = !isLightItem),
              selectionHeadingElement.classList.toggle('light-selected', isLightItem),
              (labelTextFieldsElement.hidden = !isPlanLabel),
              (lightFieldsElement.hidden = !isLightItem),
              (curtainPositionFieldElement.hidden = at4.type !== 'curtain'),
              (selectElement('#fridge-style-fields').hidden = at4.type !== 'fridge'),
              (selectElement('#pipeline-dispenser-style-field').hidden = at4.type !== 'pipelinewaterpurifier'),
              at4.type === 'pipelinewaterpurifier' &&
                setControlValue(
                  selectElement('#pipeline-dispenser-style'),
                  normalizePipelineDispenserStyle(at4.pipelineDispenserStyle),
                ),
              at4.type === 'fridge')
            ) {
              for (const fridgeStyleInput of document.querySelectorAll<StudioControlElement>(
                'input[name="fridge-style"]',
              ))
                fridgeStyleInput.checked =
                  fridgeStyleInput.value === (at4.fridgeStyle === 'double' ? 'double' : 'standard')
            }
            if (
              ((selectElement('#curtain-track-fields').hidden = at4.type !== 'curtain'),
              (selectElement('#airer-model-fields').hidden = at4.type !== 'airer'),
              at4.type === 'airer')
            ) {
              const airerDimensions = airerDimensions2(at4)
              setControlValue(
                selectElement('#airer-style'),
                airerDimensions.airerStyle === 'single' ? 'single' : 'double',
              ),
                setControlValue(selectElement('#airer-extension'), String(airerDimensions.airerExtension)),
                setControlValue(selectElement('#airer-preview'), String(airerDimensions.airerPreview))
            }
            if (
              ((selectElement('#item-elevation').min = String(itemMinimumElevation(at4.type))),
              (selectElement('#item-elevation').title = itemElevationHint(at4.type)),
              // 0.8.7：字段标签本身随类型变化（底部离地 / 安装偏移 / 光源安装高度 …）。
              (selectElement('#item-elevation-label').textContent = itemElevationMeaning(at4.type).label),
              // 「底部离地」下方的说明行（0.8.7 同）：提示 + 实际高度读数 + 缩放操作提示。
              (selectElement('#item-height-explanation').textContent = itemHeightExplanation(at4, heightBoundsOf)),
              (selectElement('#fan-model-fields').hidden = at4.type !== 'fan'),
              at4.type === 'fan')
            ) {
              const fanDimensions = fanDimensions2(at4)
              setNumericControlValue(selectElement('#fan-model-scale'), fanDimensions.fanScale * 100),
                setNumericControlValue(selectElement('#fan-model-height'), fanDimensions.fanHeight)
            }
            for (const itemDimensionInput of [
              selectElement('#item-width'),
              selectElement('#item-height'),
              selectElement('#item-depth'),
            ])
              itemDimensionInput.readOnly =
                at4.type === 'fan' || (at4.type === 'airer' && itemDimensionInput.id === 'item-height')
            ;(itemHeightFieldElement.hidden = isPlanLabel || isLightItem || at4.type === 'flooropening'),
              (itemElevationFieldElement.hidden = isPlanLabel || at4.type === 'flooropening'),
              (itemRotationFieldElement.hidden = at4.type === 'ceilinglight'),
              (itemRotationActionsElement.hidden = at4.type === 'ceilinglight'),
              (selectElement('#item-depth').readOnly =
                at4.type === 'fan' ||
                (at4.type === 'curtain' && normalizeCurtainTrack2(at4).curtainTrack !== 'straight'))
            const includes = ['camera', 'presence'].includes(at4.type)
            ;(itemVerticalRotationFieldElement.hidden = !(isLightItem || includes)),
              (itemVerticalRotationFieldElement.title = includes
                ? '0° 正装，±90° 侧装，180° 倒装；离地高度为底座安装点高度'
                : ''),
              (itemStripRollFieldElement.hidden = at4.type !== 'striplight'),
              (itemStripOrientationHeadingElement.hidden = at4.type !== 'striplight'),
              syncPlaceSurfaceVisibility(selectElement, isLightItem, isPlanLabel),
              (itemLightSourceVisibilityFieldElement.hidden = at4.type !== 'striplight'),
              (pillarShapeFieldElement.hidden = at4.type !== 'pillar'),
              (pillarAxisFieldElement.hidden = at4.type !== 'pillar'),
              (stripAxisFieldElement.hidden = at4.type !== 'striplight'),
              (roundTableTurntableFieldElement.hidden = !roundTableTypeSet.has(at4.type)),
              (selectElement('#sofa-chaise-side-field').hidden = at4.type !== 'sofa-l'),
              (selectElement('#mural-style-field').hidden = at4.type !== 'mural'),
              (selectElement('#featurewall-style-field').hidden = at4.type !== 'featurewall'),
              at4.type === 'sofa-l' &&
                ((selectElement('#sofa-chaise-side').value = at4.sofaChaiseSide === 'left' ? 'left' : 'right'),
                syncStudioSelect2(selectElement('#sofa-chaise-side'))),
              (stairDirectionFieldElement.hidden = !openStairTypeSet.has(at4.type)),
              (tvMountStyleFieldElement.hidden = at4.type !== 'tv'),
              // 智能屏：安装方式决定模型（桌面款 / 壁挂款）与外形尺寸，切换由 applyToolSetting 落地。
              // 智能屏安装方式：字段可见性与取值同步都收进 helper，不给巨型函数加分支。
              syncSmartDisplayMountField(at4),
              (selectElement('#storage-section-field').hidden = !STORAGE_SECTION_TYPES.has(at4.type)),
              STORAGE_SECTION_TYPES.has(at4.type) &&
                ((selectElement('#storage-section').value = storageSectionStyle(at4)),
                syncStudioSelect2(selectElement('#storage-section'))),
              (shoeCabinetActionsElement.hidden = at4.type !== 'shoecabinet'),
              shoeCabinetMirrorButton.setAttribute('aria-pressed', at4.shoeCabinetMirrored === true ? 'true' : 'false'),
              (selectElement('#item-rotation-label').textContent =
                at4.type === 'striplight' ? '平面旋转（°）' : isLightItem ? '平面方向（°）' : '旋转角度（°）'),
              (selectElement('#item-rotation').min = at4.type === 'striplight' ? '0' : '-360'),
              (selectElement('#item-rotation').max = '360'),
              (itemVerticalRotationLabelElement.textContent =
                at4.type === 'striplight' ? '安装倾斜（°）' : includes ? '安装翻转／侧装（°）' : '出光角度（°）'),
              (selectElement('#item-vertical-rotation').min =
                at4.type === 'striplight' ? '0' : includes ? '-180' : '-90'),
              (selectElement('#item-vertical-rotation').max =
                at4.type === 'striplight' ? '360' : includes ? '180' : '90')
            for (const lightControlElement of applyLightPropertyControls) lightControlElement.hidden = !isLightItem
            syncStripInspectorFields(at4, selectElement)
            if (
              ((itemWidthLabelElement.textContent =
                at4.type === 'flooropening'
                  ? '洞口宽（m）'
                  : at4.type === 'striplight'
                    ? '发光长度（m）'
                    : at4.type === 'pillar'
                      ? '长（m）'
                      : '宽（m）'),
              at4.type === 'curtain' && (itemWidthLabelElement.textContent = '主边长度（m）'),
              (itemDepthLabelElement.textContent =
                at4.type === 'flooropening'
                  ? '洞口长（m）'
                  : at4.type === 'striplight'
                    ? '发光宽度（m）'
                    : isPlanLabel
                      ? '铭牌高（m）'
                      : at4.type === 'pillar'
                        ? '宽（m）'
                        : '深（m）'),
              isPlanLabel &&
                (setControlValue(selectElement('#label-title'), at4.title || '家庭总览'),
                setControlValue(
                  selectElement('#label-title-spacing'),
                  Math.round(clamp2(finite2(at4.titleSpacing, 1.05), 0, 1.8) * 100),
                ),
                setControlValue(selectElement('#label-subtitle'), at4.subtitle || 'HOME PLAN'),
                setControlValue(
                  selectElement('#label-subtitle-spacing'),
                  Math.round(clamp2(finite2(at4.subtitleSpacing, 0.08), 0, 0.6) * 100),
                ),
                setControlValue(
                  selectElement('#label-line-length'),
                  Math.round(clamp2(finite2(at4.lineLength, 0.86), 0.3, 1) * 100),
                ),
                setControlValue(selectElement('#label-color'), normalizePlanLabelColor(at4.labelColor))),
              isLightItem)
            ) {
              const downlight2 = (lightPresetCatalog as any)[at4.type] || lightPresetCatalog.downlight
              ;(appCtx.activeLightGroupId = resolveLightGroup(at4)?.id || getLightGroups().id),
                syncLightGroupList(),
                syncLightGroupSelect(at4),
                setControlValue(
                  selectElement('#light-temperature'),
                  Math.round(clamp2(finite2(at4.lightTemperature, downlight2.temperature), 2200, 6500)),
                ),
                setControlValue(
                  selectElement('#light-brightness'),
                  Math.round(clamp2(finite2(at4.lightBrightness, downlight2.brightness), 0, 100)),
                ),
                setControlValue(
                  selectElement('#light-range'),
                  clamp2(finite2(at4.lightRange, downlight2.range), 0.5, 10).toFixed(1),
                ),
                (selectElement('#light-angle').max = String(lightAngleLimitForType(at4.type))),
                setControlValue(
                  selectElement('#light-angle'),
                  Math.round(clamp2(finite2(at4.lightAngle, downlight2.angle), 15, lightAngleLimitForType(at4.type))),
                )
              const itemVerticalRotation =
                at4.type === 'striplight'
                  ? normalizeFullRotation2(at4.verticalRotation)
                  : clamp2(finite2(at4.verticalRotation, 0), -90, 90)
              setControlValue(selectElement('#item-vertical-rotation'), Math.round(itemVerticalRotation * 100) / 100),
                setControlValue(
                  itemStripRollInput,
                  Math.round(clamp2(finite2(at4.stripRollRotation, 0), 0, 360) * 100) / 100,
                ),
                (itemLightSourceVisibleInput.checked = at4.lightSourceVisible !== false)
            }
            if (
              (includes &&
                syncControlValue2(
                  selectElement('#item-vertical-rotation'),
                  Math.round(clamp2(finite2(at4.verticalRotation, 0), -180, 180) * 100) / 100,
                ),
              at4.type === 'curtain')
            ) {
              const isRollerCurtain = at4.curtainForm === 'roller'
              ;(selectElement('#curtain-form').value = isRollerCurtain ? 'roller' : 'standard'),
                syncStudioSelect2(selectElement('#curtain-form')),
                (curtainPositionFieldElement.hidden = isRollerCurtain),
                (selectElement('#curtain-track-field').hidden = isRollerCurtain),
                (selectElement('#curtain-position').value = ['left', 'right', 'split'].includes(at4.curtainPosition)
                  ? at4.curtainPosition
                  : 'split'),
                syncStudioSelect2(selectElement('#curtain-position'))
              const curtainTrackSettings = normalizeCurtainTrack2(at4)
              for (const [curtainControlId, curtainControlValue] of [
                ['curtain-track', curtainTrackSettings.curtainTrack],
                ['curtain-corner', curtainTrackSettings.curtainCorner],
                ['curtain-fabric', at4.curtainFabric || 'cloth'],
              ])
                (selectElement('#' + curtainControlId).value = curtainControlValue),
                  syncStudioSelect2(selectElement('#' + curtainControlId))
              for (const [curtainSyncId, curtainSyncValue] of [
                ['curtain-left-length', curtainTrackSettings.curtainLeftLength],
                ['curtain-right-length', curtainTrackSettings.curtainRightLength],
                ['curtain-meet', curtainTrackSettings.curtainMeet],
                ['curtain-preview', curtainTrackSettings.curtainPreview],
              ])
                syncControlValue2(selectElement('#' + curtainSyncId), curtainSyncValue)
              ;(selectElement('#curtain-corner-field').hidden = curtainTrackSettings.curtainTrack !== 'l'),
                (selectElement('#curtain-left-length-field').hidden =
                  curtainTrackSettings.curtainTrack === 'straight' ||
                  (curtainTrackSettings.curtainTrack === 'l' && curtainTrackSettings.curtainCorner !== 'left')),
                (selectElement('#curtain-right-length-field').hidden =
                  curtainTrackSettings.curtainTrack === 'straight' ||
                  (curtainTrackSettings.curtainTrack === 'l' && curtainTrackSettings.curtainCorner !== 'right')),
                (selectElement('#curtain-meet-field').hidden = isRollerCurtain || at4.curtainPosition !== 'split')
            }
            roundTableTypeSet.has(at4.type) &&
              ((selectElement('#round-table-turntable').value = isTurntableRoundTable(at4) ? 'with' : 'without'),
              syncStudioSelect2(selectElement('#round-table-turntable'))),
              openStairTypeSet.has(at4.type) &&
                ((selectElement('#stair-direction').value = ['left', 'right'].includes(at4.stairDirection)
                  ? at4.stairDirection
                  : 'right'),
                syncStudioSelect2(selectElement('#stair-direction'))),
              at4.type === 'tv' &&
                ((selectElement('#tv-mount-style').value = tvMountStyleSet.has(at4.tvMountStyle)
                  ? at4.tvMountStyle
                  : 'standard'),
                syncStudioSelect2(selectElement('#tv-mount-style'))),
              at4.type === 'mural' &&
                ((selectElement('#mural-style').value = normalizeMuralArtStyle(at4.muralStyle)),
                syncStudioSelect2(selectElement('#mural-style'))),
              at4.type === 'featurewall' &&
                ((selectElement('#featurewall-style').value = normalizeFeatureWallStyle(at4.wallStyle)),
                syncStudioSelect2(selectElement('#featurewall-style'))),
              at4.type === 'pillar' &&
                ((selectElement('#pillar-shape').value = normalizePillarShape2(at4.pillarShape)),
                syncStudioSelect2(selectElement('#pillar-shape')),
                (selectElement('#pillar-axis').value = normalizePillarAxis2(at4.pillarAxis)),
                syncStudioSelect2(selectElement('#pillar-axis'))),
              at4.type === 'striplight' &&
                ((selectElement('#strip-mount').value = resolveStripMount(at4)),
                syncStudioSelect2(selectElement('#strip-mount'))),
              setNumericControlValue(selectElement('#item-x'), at4.x / (getPixelsPerMeter() || 1)),
              setNumericControlValue(selectElement('#item-y'), at4.y / (getPixelsPerMeter() || 1))
            const dimensionPolicy = itemDimensionPolicy2(at4.type)
            for (const footprintInput of [selectElement('#item-width'), selectElement('#item-depth')])
              (footprintInput.min = String(itemMinimumFootprint2(at4.type))),
                (footprintInput.step = String(dimensionPolicy.widthStep))
            setNumericControlValue(selectElement('#item-width'), at4.width),
              (itemHeightLabelElement.textContent = pillarIsLying2(at4) ? '长（m）' : '高（m）'),
              (selectElement('#item-height').min = String(itemMinimumHeight2(at4.type))),
              (selectElement('#item-height').step = String(dimensionPolicy.heightStep)),
              setNumericControlValue(selectElement('#item-height'), at4.height),
              setNumericControlValue(selectElement('#item-depth'), at4.depth),
              setNumericControlValue(selectElement('#item-elevation'), at4.elevation || 0),
              setNumericControlValue(selectElement('#item-rotation'), at4.rotation)
          }
        }
      }
    }
  }
}

/**
 * 智能屏安装方式字段：可见性 + 当前值。
 *
 * 字段在两种安装方式下都要显示（它们对应两个不同的 item type），
 * 取值缺失时按 type 反推，与草稿归一化里的规则保持一致。
 */
function syncSmartDisplayMountField(item: { type?: string; smartDisplayMount?: string }): void {
  const field = globalThis.document.getElementById('smart-display-mount-field')
  if (!field) return
  const isSmartDisplay = String(item.type || '').startsWith('smart-display')
  // 直接按 id 取：这两个元素只在这里用，没必要再穿一层 deps。
  field.hidden = !isSmartDisplay
  const select = globalThis.document.getElementById('smart-display-mount') as HTMLSelectElement | null
  if (!isSmartDisplay || !select) return
  select.value = item.smartDisplayMount === 'wall' ? 'wall' : 'tabletop'
  syncStudioSelect2(select)
}
