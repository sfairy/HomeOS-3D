/**
 * 灯带（`striplight`）的平面符号：卧装画圆角发光条 + 高亮中线，立装画双线矩形。
 *
 * 画法取自 0.8.5（提交 `cd7a927c2` 曾把灯带符号从平面图里去掉，导致 2D 上只剩选中框和角点，
 * 看起来像「灯带不见了」）。
 *
 * 为什么单独成文件、而不是塞回 `studio-plan-item-drawing.ts`：该文件 1658 行，
 * `check:file-size` 对 ≥800 行的文件不允许增长，往里加 51 行必然撞棘轮；
 * 同时 `drawCourtyardArea` 的圈复杂度也容不下再多一个分支。
 *
 * 返回 `true` 表示「这个标记的灯符号已经画完」，调用方据此跳过通用灯符号 —— 于是
 * 主文件里原来的 `if (planItem.type !== 'striplight')` 守卫可以原地换成一次调用，行数不变。
 */

import { stripIsStanding } from '../authoring/items/studio-item-posture'

/**
 * 画灯带平面符号。
 *
 * @param planCanvasRenderer 平面图画布上下文（调用方传的是宿主注入的绘制器）
 * @param planItem 平面标记条目（只有 `type` / `stripAxis` 参与判断）
 * @param itemPixelWidth 该标记在平面上的像素宽
 * @param itemPixelDepth 该标记在平面上的像素深
 * @param lampOn 灯是否点亮（决定发光色）
 * @returns 是否已按灯带画完（非灯带返回 `false`，由调用方继续画通用灯符号）
 */
export function drawStripLightPlanGlyph(
  planCanvasRenderer: CanvasRenderingContext2D,
  planItem: unknown,
  itemPixelWidth: number,
  itemPixelDepth: number,
  lampOn: boolean,
): boolean {
  if (!stripIsStanding(planItem)) {
    // 卧装的灯带也有专属画法（发光条），只有「不是灯带」才交给调用方。
    if ((planItem as { type?: string } | null | undefined)?.type !== 'striplight') return false
    const lampBodyRadius = Math.min(7, itemPixelDepth * 0.42)
    planCanvasRenderer.beginPath()
    planCanvasRenderer.roundRect(
      -itemPixelWidth / 2,
      -itemPixelDepth * 0.34,
      itemPixelWidth,
      itemPixelDepth * 0.68,
      lampBodyRadius,
    )
    planCanvasRenderer.fill()
    planCanvasRenderer.stroke()
    planCanvasRenderer.strokeStyle = lampOn ? 'rgba(255, 238, 195, .95)' : 'rgba(196, 207, 216, .42)'
    planCanvasRenderer.lineWidth = Math.max(2, itemPixelDepth * 0.12)
    planCanvasRenderer.beginPath()
    planCanvasRenderer.moveTo(-itemPixelWidth * 0.42, 0)
    planCanvasRenderer.lineTo(itemPixelWidth * 0.42, 0)
    planCanvasRenderer.stroke()
    return true
  }

  const standingStripInset = Math.min(itemPixelWidth, itemPixelDepth) * 0.3
  planCanvasRenderer.beginPath()
  planCanvasRenderer.rect(-itemPixelWidth / 2, -itemPixelDepth / 2, itemPixelWidth, itemPixelDepth)
  planCanvasRenderer.fill()
  planCanvasRenderer.stroke()
  planCanvasRenderer.strokeStyle = lampOn ? 'rgba(255, 193, 116, .95)' : 'rgba(25, 34, 43, .5)'
  planCanvasRenderer.lineWidth = 1
  planCanvasRenderer.beginPath()
  planCanvasRenderer.rect(
    -itemPixelWidth / 2 + standingStripInset,
    -itemPixelDepth / 2 + standingStripInset,
    Math.max(itemPixelWidth - standingStripInset * 2, 0.6),
    Math.max(itemPixelDepth - standingStripInset * 2, 0.6),
  )
  planCanvasRenderer.stroke()
  return true
}
