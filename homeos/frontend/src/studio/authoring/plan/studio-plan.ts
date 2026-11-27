import { dashboardCanvasFont } from '../../app/shared/dashboard-fonts'

/** 平面图坐标（米）：planToScreen / screenToPlan 在同一套坐标系里来回换算。 */
type PlanPoint = { x: number; y: number }

/** 画线样式； */
type PlanLineOptions = {
  color?: string
  width?: number
  cap?: CanvasLineCap
  dash?: number[]
}

export function drawTrackedText(painter: any, text: any, originX: any, originY: any, trackingPx: any, maxWidthPx: any) {
  const characters = [...String(text || '')]
  if (!characters.length) return 0
  const glyphWidths = characters.map((glyph) => painter.measureText(glyph).width),
    totalWidth =
      glyphWidths.reduce((accumulatedWidth, glyphWidth) => accumulatedWidth + glyphWidth, 0) +
      Math.max(characters.length - 1, 0) * trackingPx,
    widthScale = totalWidth > 0 ? Math.min(1, maxWidthPx / totalWidth) : 1
  painter.save(),
    painter.translate(originX, originY),
    painter.scale(widthScale, 1),
    (painter.textAlign = 'left'),
    (painter.textBaseline = 'middle')
  let cursorX = 0
  return (
    characters.forEach((character, characterIndex) => {
      painter.fillText(character, cursorX, 0),
        (cursorX += glyphWidths[characterIndex] + (characterIndex < characters.length - 1 ? trackingPx : 0))
    }),
    painter.restore(),
    totalWidth * widthScale
  )
}
export function createPlanDrawingTools({
  context: canvasPainter,
  planToScreen: planToScreen,
  screenToPlan: screenToPlan,
  pixelsPerMeter: pixelsPerMeter,
  getCanvasSize: getCanvasSize,
  getViewZoom: getViewZoom,
}: any) {
  function drawMetricGrid() {
    const meterScale = pixelsPerMeter()
    if (!meterScale) return
    const { width: canvasWidth, height: canvasHeight } = getCanvasSize(),
      zoom = getViewZoom()
    let gridStep = meterScale * 0.5
    for (; gridStep * zoom < 18; ) gridStep *= 2
    for (; gridStep * zoom > 100; ) gridStep /= 2
    const canvasCorners = (
        [
          { x: 0, y: 0 },
          { x: canvasWidth, y: 0 },
          { x: canvasWidth, y: canvasHeight },
          { x: 0, y: canvasHeight },
        ] as PlanPoint[]
      ).map((corner) => screenToPlan(corner) as PlanPoint),
      minPlanX = Math.min(...canvasCorners.map((cornerForMinX) => cornerForMinX.x)),
      maxPlanX = Math.max(...canvasCorners.map((cornerForMaxX) => cornerForMaxX.x)),
      minPlanY = Math.min(...canvasCorners.map((cornerForMinY) => cornerForMinY.y)),
      maxPlanY = Math.max(...canvasCorners.map((cornerForMaxY) => cornerForMaxY.y))
    canvasPainter.save(), (canvasPainter.lineWidth = 1)
    for (let gridX = Math.floor(minPlanX / gridStep) * gridStep; gridX <= maxPlanX; gridX += gridStep) {
      const screenTop = planToScreen({
          x: gridX,
          y: minPlanY,
        }),
        screenBottom = planToScreen({
          x: gridX,
          y: maxPlanY,
        }),
        halfMeterIndexX = Math.round((gridX / meterScale) * 2)
      ;(canvasPainter.strokeStyle = halfMeterIndexX % 2 === 0 ? 'rgba(91, 119, 139, .13)' : 'rgba(91, 119, 139, .065)'),
        canvasPainter.beginPath(),
        canvasPainter.moveTo(screenTop.x, screenTop.y),
        canvasPainter.lineTo(screenBottom.x, screenBottom.y),
        canvasPainter.stroke()
    }
    for (let gridY = Math.floor(minPlanY / gridStep) * gridStep; gridY <= maxPlanY; gridY += gridStep) {
      const screenLeft = planToScreen({
          x: minPlanX,
          y: gridY,
        }),
        screenRight = planToScreen({
          x: maxPlanX,
          y: gridY,
        }),
        halfMeterIndexY = Math.round((gridY / meterScale) * 2)
      ;(canvasPainter.strokeStyle = halfMeterIndexY % 2 === 0 ? 'rgba(91, 119, 139, .13)' : 'rgba(91, 119, 139, .065)'),
        canvasPainter.beginPath(),
        canvasPainter.moveTo(screenLeft.x, screenLeft.y),
        canvasPainter.lineTo(screenRight.x, screenRight.y),
        canvasPainter.stroke()
    }
    canvasPainter.restore()
  }
  function drawLine(fromPlan: any, toPlan: any, lineOptions: PlanLineOptions = {}) {
    const fromScreen = planToScreen(fromPlan),
      toScreen = planToScreen(toPlan)
    canvasPainter.save(),
      (canvasPainter.strokeStyle = lineOptions.color || '#fff'),
      (canvasPainter.lineWidth = lineOptions.width || 1),
      (canvasPainter.lineCap = lineOptions.cap || 'round'),
      lineOptions.dash && canvasPainter.setLineDash(lineOptions.dash),
      canvasPainter.beginPath(),
      canvasPainter.moveTo(fromScreen.x, fromScreen.y),
      canvasPainter.lineTo(toScreen.x, toScreen.y),
      canvasPainter.stroke(),
      canvasPainter.restore()
  }
  function drawPoint(planPoint: any, strokeColor: any, radiusPx = 4) {
    const screenPoint = planToScreen(planPoint)
    canvasPainter.save(),
      (canvasPainter.fillStyle = '#0e151b'),
      (canvasPainter.strokeStyle = strokeColor),
      (canvasPainter.lineWidth = 2),
      canvasPainter.beginPath(),
      canvasPainter.arc(screenPoint.x, screenPoint.y, radiusPx, 0, Math.PI * 2),
      canvasPainter.fill(),
      canvasPainter.stroke(),
      canvasPainter.restore()
  }
  function drawOpenEndpointWarning(endpointPlan: any) {
    const endpointScreen = planToScreen(endpointPlan)
    canvasPainter.save(),
      (canvasPainter.globalAlpha = 1),
      (canvasPainter.shadowColor = 'rgba(255, 84, 76, .75)'),
      (canvasPainter.shadowBlur = 12),
      (canvasPainter.fillStyle = 'rgba(255, 84, 76, .18)'),
      (canvasPainter.strokeStyle = '#ff6258'),
      (canvasPainter.lineWidth = 2.5),
      canvasPainter.beginPath(),
      canvasPainter.arc(endpointScreen.x, endpointScreen.y, 9, 0, Math.PI * 2),
      canvasPainter.fill(),
      canvasPainter.stroke(),
      (canvasPainter.shadowBlur = 0),
      (canvasPainter.fillStyle = '#ff6258'),
      canvasPainter.beginPath(),
      canvasPainter.arc(endpointScreen.x, endpointScreen.y, 3.2, 0, Math.PI * 2),
      canvasPainter.fill(),
      canvasPainter.restore()
  }
  function drawFloatingLabel(anchorPlan: any, labelText: any, labelColor = '#dce3e8') {
    if (!labelText) return
    const anchorScreen = planToScreen(anchorPlan)
    canvasPainter.save(),
      (canvasPainter.font = dashboardCanvasFont('600 10px', 'ui-monospace, monospace')),
      (canvasPainter.textAlign = 'center'),
      (canvasPainter.textBaseline = 'middle')
    const labelWidth = canvasPainter.measureText(labelText).width + 12
    ;(canvasPainter.fillStyle = 'rgba(8, 13, 18, .88)'),
      (canvasPainter.strokeStyle = 'rgba(255, 255, 255, .11)'),
      (canvasPainter.lineWidth = 1),
      canvasPainter.beginPath(),
      canvasPainter.roundRect(anchorScreen.x - labelWidth / 2, anchorScreen.y - 25, labelWidth, 18, 5),
      canvasPainter.fill(),
      canvasPainter.stroke(),
      (canvasPainter.fillStyle = labelColor),
      canvasPainter.fillText(labelText, anchorScreen.x, anchorScreen.y - 16),
      canvasPainter.restore()
  }
  return {
    drawMetricGrid: drawMetricGrid,
    drawLine: drawLine,
    drawPoint: drawPoint,
    drawOpenEndpointWarning: drawOpenEndpointWarning,
    drawFloatingLabel: drawFloatingLabel,
  }
}

/**
 * 主视图切换时的「平面取景保持」（0.8.7 `createEditorWorkspace` 的 centre / revision 协议）。
 *
 * 背景：`plan` / `three` 两个模式是把 `.plan-panel` 与 `.preview-card` **物理对调**，
 * 平面画布宽高会从 554×738 变成 434×444。此前的做法是切完直接「适应画布」（`resetView`），
 * 于是每切一次主视图，用户的缩放与平移都被重置 —— 画到一半切去看 3D 再回来，得重新对位。
 *
 * 上游的做法是：切换前记下**画布中心对应的平面坐标**，切换后用同一个 `zoom` 反算偏移量：
 * `offset = 画布尺寸 / 2 - centre * zoom`（`planToScreen` 就是 `plan * zoom + offset`）。
 *
 * 这里只放纯函数，方便门禁脚本单独加载断言（不依赖 runtime / three）。
 */

export interface PlanCentre {
  x: number
  y: number
}

export interface PlanViewportSize {
  width: number
  height: number
}

/**
 * 用「想保持在画布中心的平面坐标 + 缩放」反算视图偏移。
 *
 * @param centre 要落在画布中心的平面坐标（像素）
 * @param zoom 当前缩放（必须 > 0）
 * @param width 画布宽度（CSS 像素）
 * @param height 画布高度（CSS 像素）
 */
export function planCenterOffsets(
  centre: PlanCentre,
  zoom: number,
  width: number,
  height: number,
): { offsetX: number; offsetY: number } {
  if (!(zoom > 0) || !(width > 0) || !(height > 0)) return { offsetX: 0, offsetY: 0 }
  return { offsetX: width / 2 - centre.x * zoom, offsetY: height / 2 - centre.y * zoom }
}

/** `planCenterOffsets` 的逆运算：画布中心当前对着哪个平面坐标。 */
export function planCentreAtViewCenter(
  offsetX: number,
  offsetY: number,
  zoom: number,
  width: number,
  height: number,
): PlanCentre {
  if (!(zoom > 0) || !(width > 0) || !(height > 0)) return { x: 0, y: 0 }
  return { x: (width / 2 - offsetX) / zoom, y: (height / 2 - offsetY) / zoom }
}

/** 画布尺寸变化倍率上限：超过它就别硬套旧偏移了，直接「适应画布」。 */
export const PLAN_CENTRE_SIZE_LIMIT = 3

/**
 * 尺寸剧变时放弃保持：从极小的副视图放大到主视图（或反之）时，同一 zoom 下
 * 旧中心可能落在视口之外很远，硬套偏移会让户型整块跑出画布。
 */
export function shouldRestorePlanCenter(
  before: PlanViewportSize,
  after: PlanViewportSize,
  limit = PLAN_CENTRE_SIZE_LIMIT,
): boolean {
  if (!(before.width > 0) || !(before.height > 0) || !(after.width > 0) || !(after.height > 0)) return false
  const ratio = Math.max(
    after.width / before.width,
    after.height / before.height,
    before.width / after.width,
    before.height / after.height,
  )
  return Number.isFinite(ratio) && ratio <= limit
}
