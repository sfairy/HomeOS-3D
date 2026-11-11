/**
 * 普通窗（矩形框 + 中梃）的盒体拆解。
 *
 * 框料深度以前写死 60mm，而默认墙厚 200mm —— 窗框像一张**悬在洞口中间的卡片**，
 * 两侧各留 70mm 的空腔，斜看时能从缝里看见墙体内部。现在按墙厚收口：两侧各留 5mm
 * 避免和墙面 z-fighting，薄墙保底 60mm、厚墙最多 200mm（再深就成了窗套）。
 *
 * 玻璃不动（25mm），始终居中 —— 玻璃跟着加厚只会让窗更像一块实心板。
 */

/** 框料向洞口内收一圈，避免和墙面共面闪烁。 */
function windowFrameBounds(width: number, height: number, sill = 0) {
  const inset = Math.min(0.001, width / 100, height / 100)
  return { width: width - 2 * inset, height: height - 2 * inset, sill: sill + inset }
}

/** 框料深度：按墙厚收口，`wallThickness` 缺省时沿用旧的 60mm。 */
export function openingFrameDepth(wallThickness?: number) {
  const thickness = Number(wallThickness)
  if (!Number.isFinite(thickness) || thickness <= 0) return 0.06
  return Math.max(0.06, Math.min(thickness - 0.01, 0.2))
}

export function windowGeometryParts(
  width: any,
  height: any,
  sillHeight: any,
  hasMullions = true,
  wallThickness?: number,
) {
  if (![width, height, sillHeight].every(Number.isFinite) || width <= 0 || height <= 0) return null
  const framed = windowFrameBounds(width, height, sillHeight)
  width = framed.width
  height = framed.height
  sillHeight = framed.sill
  const frameThickness = Math.min(0.045, width / 4, height / 4),
    frameDepth = openingFrameDepth(wallThickness),
    centerY = sillHeight + height / 2,
    glassParts = [[width - frameThickness, height - frameThickness, 0.025, 0, centerY, 0]],
    frameParts = [
      [width, frameThickness, frameDepth, 0, sillHeight + frameThickness / 2, 0],
      [width, frameThickness, frameDepth, 0, sillHeight + height - frameThickness / 2, 0],
      [frameThickness, height - 2 * frameThickness, frameDepth, -(width - frameThickness) / 2, centerY, 0],
      [frameThickness, height - 2 * frameThickness, frameDepth, (width - frameThickness) / 2, centerY, 0],
    ],
    isDivided = hasMullions && width > 1.2
  return (
    isDivided &&
      frameParts.push([
        frameThickness * 0.7,
        height - 2 * frameThickness,
        Math.max(frameDepth - 0.005, 0.04),
        0,
        centerY,
        0,
      ]),
    {
      glass: glassParts,
      frames: frameParts,
      divided: isDivided,
      frameDepth,
    }
  )
}
