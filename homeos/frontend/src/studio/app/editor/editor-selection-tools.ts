/**
 * 仪表盘编辑器：框选几何 + 多选对齐/分布（纯函数，供 home.ts 调用）。
 */

import { normalizeMarquee, rectIntersects, type MarqueeRect } from './editor-canvas-navigation'

export type AlignMode =
  | 'left'
  | 'center'
  | 'right'
  | 'top'
  | 'middle'
  | 'bottom'
  | 'distribute-x'
  | 'distribute-y'

export interface ComponentBounds {
  id: string
  x: number
  y: number
  width: number
  height: number
}

/** 视口客户坐标 → 画布文档坐标（考虑 CSS zoom）。 */
export function clientPointToCanvas(
  clientX: number,
  clientY: number,
  canvasEl: HTMLElement,
  documentWidth: number,
  documentHeight: number,
): { x: number; y: number } {
  const rect = canvasEl.getBoundingClientRect()
  const zoom = Number(document.documentElement.style.getPropertyValue('--sc-canvas-zoom')) || 1
  const localX = (clientX - rect.left) / Math.max(zoom, 0.01)
  const localY = (clientY - rect.top) / Math.max(zoom, 0.01)
  const scaleX = documentWidth / Math.max(rect.width / Math.max(zoom, 0.01), 1)
  const scaleY = documentHeight / Math.max(rect.height / Math.max(zoom, 0.01), 1)
  return { x: localX * scaleX, y: localY * scaleY }
}

export function pickComponentsInMarquee(
  components: ComponentBounds[],
  marquee: MarqueeRect,
): string[] {
  return components
    .filter((component) =>
      rectIntersects(marquee, {
        x: component.x,
        y: component.y,
        width: component.width,
        height: component.height,
      }),
    )
    .map((component) => component.id)
}

export function computeAlignedPositions(
  components: ComponentBounds[],
  mode: AlignMode,
): Array<{ id: string; x: number; y: number }> {
  if (components.length < 2) return []
  const minX = Math.min(...components.map((c) => c.x))
  const maxX = Math.max(...components.map((c) => c.x + c.width))
  const minY = Math.min(...components.map((c) => c.y))
  const maxY = Math.max(...components.map((c) => c.y + c.height))
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  if (mode === 'distribute-x') {
    const sorted = [...components].sort((a, b) => a.x - b.x)
    if (sorted.length < 3) return []
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const span = last.x + last.width - first.x
    const totalWidth = sorted.reduce((sum, c) => sum + c.width, 0)
    const gap = (span - totalWidth) / (sorted.length - 1)
    let cursor = first.x
    return sorted.map((c, index) => {
      if (index === 0) {
        cursor = c.x + c.width + gap
        return { id: c.id, x: c.x, y: c.y }
      }
      if (index === sorted.length - 1) return { id: c.id, x: c.x, y: c.y }
      const x = cursor
      cursor = x + c.width + gap
      return { id: c.id, x, y: c.y }
    })
  }

  if (mode === 'distribute-y') {
    const sorted = [...components].sort((a, b) => a.y - b.y)
    if (sorted.length < 3) return []
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const span = last.y + last.height - first.y
    const totalHeight = sorted.reduce((sum, c) => sum + c.height, 0)
    const gap = (span - totalHeight) / (sorted.length - 1)
    let cursor = first.y
    return sorted.map((c, index) => {
      if (index === 0) {
        cursor = c.y + c.height + gap
        return { id: c.id, x: c.x, y: c.y }
      }
      if (index === sorted.length - 1) return { id: c.id, x: c.x, y: c.y }
      const y = cursor
      cursor = y + c.height + gap
      return { id: c.id, x: c.x, y }
    })
  }

  return components.map((c) => {
    switch (mode) {
      case 'left':
        return { id: c.id, x: minX, y: c.y }
      case 'right':
        return { id: c.id, x: maxX - c.width, y: c.y }
      case 'center':
        return { id: c.id, x: centerX - c.width / 2, y: c.y }
      case 'top':
        return { id: c.id, x: c.x, y: minY }
      case 'bottom':
        return { id: c.id, x: c.x, y: maxY - c.height }
      case 'middle':
        return { id: c.id, x: c.x, y: centerY - c.height / 2 }
      default:
        return { id: c.id, x: c.x, y: c.y }
    }
  })
}

export { normalizeMarquee, type MarqueeRect }
