import { distance as distance2, wallLengthMeters as wallLengthMeters2 } from '../../../plan/geometry'

import { itemTypeCatalog, lampItemTypeSet } from '../../items/item-catalog'

import { doorTypeCatalog } from '../../scene/payload/studio-scene-payload'

import type { StudioAppContext } from '../studio-app-context'
import { refreshPlacedItemsPanel } from './placed-items-wiring'
import { isPlacedItemHidden } from '../../items/placed-item-state'
import { refreshEditor3D } from './editor-3d-wiring'
import { drawItemHandles } from '../../../plan/studio-handle-drawing'
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
