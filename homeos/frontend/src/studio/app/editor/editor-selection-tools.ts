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

interface ComponentBounds {
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
  const minX = Math.min(...components.map((component) => component.x))
  const maxX = Math.max(...components.map((component) => component.x + component.width))
  const minY = Math.min(...components.map((component) => component.y))
  const maxY = Math.max(...components.map((component) => component.y + component.height))
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  if (mode === 'distribute-x') {
    const sorted = [...components].sort((left, right) => left.x - right.x)
    if (sorted.length < 3) return []
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const span = last.x + last.width - first.x
    const totalWidth = sorted.reduce((sum, component) => sum + component.width, 0)
    const gap = (span - totalWidth) / (sorted.length - 1)
    let cursor = first.x
    return sorted.map((component, index) => {
      if (index === 0) {
        cursor = component.x + component.width + gap
        return { id: component.id, x: component.x, y: component.y }
      }
      if (index === sorted.length - 1) return { id: component.id, x: component.x, y: component.y }
      const x = cursor
      cursor = x + component.width + gap
      return { id: component.id, x, y: component.y }
    })
  }

  if (mode === 'distribute-y') {
    const sorted = [...components].sort((left, right) => left.y - right.y)
    if (sorted.length < 3) return []
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const span = last.y + last.height - first.y
    const totalHeight = sorted.reduce((sum, component) => sum + component.height, 0)
    const gap = (span - totalHeight) / (sorted.length - 1)
    let cursor = first.y
    return sorted.map((component, index) => {
      if (index === 0) {
        cursor = component.y + component.height + gap
        return { id: component.id, x: component.x, y: component.y }
      }
      if (index === sorted.length - 1) return { id: component.id, x: component.x, y: component.y }
      const y = cursor
      cursor = y + component.height + gap
      return { id: component.id, x: component.x, y }
    })
  }

  return components.map((component) => {
    switch (mode) {
      case 'left':
        return { id: component.id, x: minX, y: component.y }
      case 'right':
        return { id: component.id, x: maxX - component.width, y: component.y }
      case 'center':
        return { id: component.id, x: centerX - component.width / 2, y: component.y }
      case 'top':
        return { id: component.id, x: component.x, y: minY }
      case 'bottom':
        return { id: component.id, x: component.x, y: maxY - component.height }
      case 'middle':
        return { id: component.id, x: component.x, y: centerY - component.height / 2 }
      default:
        return { id: component.id, x: component.x, y: component.y }
    }
  })
}

/** 控件旋转后的轴对齐包围盒（画布坐标）。 */
export function componentBounds(boundsComponent: any) {
  const boundsPosition = boundsComponent.position || {},
    boundsWidth = Math.max(0.01, Number(boundsPosition.width || 100)),
    boundsHeight = Math.max(0.01, Number(boundsPosition.height || 100)),
    boundsScale = Math.max(0.01, Math.min(5, Number(boundsComponent.style?.scale || 1))),
    boundsRotationRad = (Number(boundsPosition.rotation || 0) * Math.PI) / 180,
    boundsHalfWidth =
      (Math.abs(Math.cos(boundsRotationRad)) * boundsWidth * boundsScale +
        Math.abs(Math.sin(boundsRotationRad)) * boundsHeight * boundsScale) /
      2,
    boundsHalfHeight =
      (Math.abs(Math.sin(boundsRotationRad)) * boundsWidth * boundsScale +
        Math.abs(Math.cos(boundsRotationRad)) * boundsHeight * boundsScale) /
      2,
    boundsCenterX = Number(boundsPosition.x || 0) + boundsWidth / 2,
    boundsCenterY = Number(boundsPosition.y || 0) + boundsHeight / 2;
  return {
    left: boundsCenterX - boundsHalfWidth,
    top: boundsCenterY - boundsHalfHeight,
    right: boundsCenterX + boundsHalfWidth,
    bottom: boundsCenterY + boundsHalfHeight,
  };
}

export { normalizeMarquee, type MarqueeRect }
