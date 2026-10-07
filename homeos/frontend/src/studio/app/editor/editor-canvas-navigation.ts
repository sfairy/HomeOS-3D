/**
 * 仪表盘编辑器画布导航辅助（从 home.ts 渐进剥离）。
 * Zoom 通过 CSS 变量 --sc-canvas-zoom 作用在 #editor-canvas。
 */

export function clampEditorZoom(zoom: number): number {
  return Math.min(3, Math.max(0.25, Number(zoom) || 1))
}

export function applyEditorZoomCss(zoom: number, canvasEls: Array<Element | null | undefined>): number {
  const next = clampEditorZoom(zoom)
  document.documentElement.style.setProperty('--sc-canvas-zoom', String(next))
  for (const el of canvasEls) {
    el?.classList?.add('sc-canvas-zoom')
  }
  return next
}

/** 空白拖拽框选矩形（画布坐标，调用方负责与组件 hit-test）。 */
export interface MarqueeRect {
  x: number
  y: number
  width: number
  height: number
}

export function normalizeMarquee(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): MarqueeRect {
  const left = Math.min(x0, x1)
  const top = Math.min(y0, y1)
  return {
    x: left,
    y: top,
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  }
}

export function rectIntersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}
