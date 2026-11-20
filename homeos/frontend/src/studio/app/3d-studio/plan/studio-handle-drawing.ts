/**
 * 平面画布上的选中手柄（0.8.7 `studio-app.js` 选中态绘制的对应实现）。
 *
 * 0.8.7 的形态只有三样：
 * - 旋转矩形四边的 **虚线框**（`#ffb14f`、1.5px、`[5,3]`）；
 * - 四角 + 四边中点（风扇只有四角）的 **圆形标记** `drawPoint(point,'#ffb14f',3.5)`
 *   —— 深底 `#0e151b` + 2px 描边，四角与边中点完全同形；
 * - 顶边（出风口是右侧）一条 **1px 引线** + 半径 3.5 的圆点，就是旋转控制。
 *
 * 上一版在这里画过「一圈旋转环 + 中心十字 + 四角方块 / 四边圆点混用」，
 * 那是照着截图猜的形态：0.8.7 既没有环、也没有中心十字，且手柄样式只有一种。
 * 小尺寸物件的门控也按上游：短边不足 18 屏幕像素时只留旋转圆点，其余手柄收起
 * （否则一个 20px 的插座会被 9 个标记糊死）。
 */

const HANDLE_COLOR = '#ffb14f'
/** 标记底色：深底 + 彩色描边（0.8.7 `drawPoint` 的 `#0e151b`）。标尺端点复用同一常量。 */
export const POINT_MARKER_FILL = '#0e151b'
/** 标记半径（像素）：0.8.7 `drawPoint(..., 3.5)`。 */
const HANDLE_RADIUS = 3.5
/** 手柄线宽（像素）：0.8.7 `drawPoint` 内部固定 2。 */
const HANDLE_STROKE = 2
/** 虚线框线宽 / 节奏：0.8.7 `{width:1.5, dash:[5,3]}`。 */
const FRAME_WIDTH = 1.5
const FRAME_DASH: number[] = [5, 3]
/** 短边小于该屏幕像素数时收起缩放手柄（0.8.7 的 0x12）。 */
const MIN_SIDE_PX = 18

export interface HandleDrawingDeps {
  context: CanvasRenderingContext2D
  planToScreen: (point: { x: number; y: number }) => { x: number; y: number }
  /** `buildHandleGeometry` 的返回（corners / edges / rotationStem / rotationHandle）。 */
  handles: {
    corners: Array<{ point: { x: number; y: number } }>
    edges: Array<{ point: { x: number; y: number } }>
    rotationStem: { x: number; y: number }
    rotationHandle: { x: number; y: number }
  }
  /** 物件中心（平面像素）。 */
  center: { x: number; y: number }
  /** 物件类型：风扇不画四边中点（0.8.7 同）。 */
  type?: string
}

/** 0.8.7 `drawPoint`：深底 + 彩色描边的圆点。 */
function drawMarker(context: CanvasRenderingContext2D, point: { x: number; y: number }, color = HANDLE_COLOR): void {
  context.beginPath()
  context.arc(point.x, point.y, HANDLE_RADIUS, 0, Math.PI * 2)
  context.fillStyle = POINT_MARKER_FILL
  context.fill()
  context.lineWidth = HANDLE_STROKE
  context.strokeStyle = color
  context.stroke()
}

function screenDistance(first: { x: number; y: number }, second: { x: number; y: number }): number {
  return Math.hypot(second.x - first.x, second.y - first.y)
}

export function drawItemHandles(deps: HandleDrawingDeps): void {
  const { context, handles } = deps
  const corners = handles.corners.map((corner) => deps.planToScreen(corner.point))
  if (corners.length < 4) return
  context.save()

  // 虚线框：四段独立的虚线（0.8.7 用 `drawLine` 逐段画，转角处不闭合缺口）。
  context.strokeStyle = HANDLE_COLOR
  context.lineWidth = FRAME_WIDTH
  context.setLineDash(FRAME_DASH)
  context.beginPath()
  corners.forEach((corner, index) => {
    const next = corners[(index + 1) % corners.length]
    context.moveTo(corner.x, corner.y)
    context.lineTo(next.x, next.y)
  })
  context.stroke()
  context.setLineDash([])

  // 短边不足 18px 时只留旋转圆点：小件被 9 个标记盖住就点不中本体。
  const shortSide = Math.min(screenDistance(corners[0], corners[1]), screenDistance(corners[1], corners[2]))
  if (shortSide >= MIN_SIDE_PX) {
    for (const corner of corners) drawMarker(context, corner)
    if (deps.type !== 'fan') {
      for (const edge of handles.edges) drawMarker(context, deps.planToScreen(edge.point))
    }
  }

  // 旋转引线 + 圆点：0.8.7 只画这一根，不画整圈。
  const stem = deps.planToScreen(handles.rotationStem)
  const knob = deps.planToScreen(handles.rotationHandle)
  context.strokeStyle = HANDLE_COLOR
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(stem.x, stem.y)
  context.lineTo(knob.x, knob.y)
  context.stroke()
  drawMarker(context, knob)

  context.restore()
}
