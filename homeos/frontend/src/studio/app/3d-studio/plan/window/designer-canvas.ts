/**
 * 窗型绘制器的正立面渲染（从 `designer.ts` 拆出）。
 *
 * 这一块是**纯渲染**：只读传入的窗型快照，往给定的 `<svg>` 里铺元素，返回这次用的
 * 缩放/偏移（拖动分隔线时要把指针坐标换算回米）。它不碰撤销栈、不改闭包里的选中态，
 * 所以拆出去没有任何时序风险 —— 拆之前它是 `openWindowDesigner` 这个 900 行闭包里
 * 最大的一段（约 200 行），也是唯一不需要共享可变状态的一段。
 *
 * 绘制顺序（与拆出前一致，改顺序会改变命中优先级）：窗格 → 开合示意 → 外框 →
 * 分隔线（分隔线最后画，压在窗格上方便点选）→ 绘制预览线。
 */

import {
  entries,
  find,
  isHung,
  windowSplitSegment,
  type WindowLeaf,
  type WindowRecord,
  type WindowSplit,
} from './layout'

/** 画布留白：四周各留一圈给尺寸标注。 */
const CANVAS_PADDING_X = 88
const CANVAS_PADDING_Y = 90

/** 正立面坐标换算：`screen = (local * scale) + offset`。 */
interface WindowCanvasScale {
  scale: number
  ox: number
  oy: number
  /** `<svg>` 视口尺寸（画尺寸标注要用）。 */
  w: number
  h: number
}

interface WindowCanvasDrawOptions {
  /** 目标 `<svg>`（调用方负责传入 `#wd-drawing`）。 */
  drawing: SVGSVGElement
  /** 当前窗型快照（已通过 `validateWindowRecord`）。 */
  record: WindowRecord
  /** 当前选中的分格 / 分隔线 id，用于高亮。 */
  selectedSashId: string
  /** 分隔线拖动的相对位置（0–1），只用于高亮「要落在这里」的那一段。 */
  segmentRatio: number
  /** 拖动新分隔线时的落点预览。 */
  drawPreview: { id: string; axis: 'x' | 'y'; position: number } | null
}

/**
 * 重画正立面；`<svg>` 还没有尺寸（弹窗未布局完）时返回 `null`，调用方应保留旧的缩放。
 */
export function drawWindowCanvas(options: WindowCanvasDrawOptions): WindowCanvasScale | null {
  const { drawing, record: current, selectedSashId, segmentRatio, drawPreview } = options
  const bounds = drawing.getBoundingClientRect()
  if (!bounds.width || !bounds.height) return null
  const scale = Math.max(
    0.1,
    Math.min((bounds.width - CANVAS_PADDING_X) / current.width, (bounds.height - CANVAS_PADDING_Y) / current.height),
  )
  const offsetX = (bounds.width - current.width * scale) / 2
  const offsetY = (bounds.height - current.height * scale) / 2
  const canvasScale: WindowCanvasScale = { scale, ox: offsetX, oy: offsetY, w: bounds.width, h: bounds.height }
  drawing.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`)
  drawing.replaceChildren()

  const svgElement = (tag: string, attributes: Record<string, string | number> = {}, text?: string) => {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag)
    for (const [name, attributeValue] of Object.entries(attributes)) element.setAttribute(name, String(attributeValue))
    if (text !== undefined) element.textContent = text
    drawing.append(element)
    return element
  }

  const svgText = (x: number, y: number, text: string, attributes: Record<string, string | number> = {}) =>
    svgElement('text', { x, y, fill: '#a7b7c4', 'font-size': 11, 'text-anchor': 'middle', ...attributes }, text)

  svgElement('title', {}, '窗户正立面。分格可通过下方按钮选择。')

  const allEntries = entries(current)
  const leaves = allEntries.filter((entry) => !entry.node.children)
  for (const [index, entry] of leaves.entries()) {
    const leafNode = entry.node as WindowLeaf
    const x = offsetX + entry.x * scale
    const y = offsetY + entry.y * scale
    const width = entry.width * scale
    const height = entry.height * scale
    const selected = entry.node.id === selectedSashId
    svgElement('rect', {
      x: x + 2,
      y: y + 2,
      width: Math.max(1, width - 4),
      height: Math.max(1, height - 4),
      fill: selected ? '#48321f' : '#18303b',
      stroke: selected ? '#ff9d2e' : '#385966',
      'stroke-width': selected ? 2 : 1,
      'data-cell': entry.node.id,
      class: 'cell-shape',
    })
    if (leafNode.kind === 'casement') {
      // 窗扇开启示意：铰链在左就从左边画 V 形，在右就镜像。
      const hingeLeft = leafNode.hinge === 'left'
      const hingeX = hingeLeft ? x + 7 : x + width - 7
      const farX = hingeLeft ? x + width - 7 : x + 7
      svgElement('path', {
        d: `M ${hingeX} ${y + 7} L ${farX} ${y + height / 2} L ${hingeX} ${y + height - 7}`,
        fill: 'none',
        stroke: selected ? '#cf8d4c' : '#6592a5',
        'stroke-width': 1,
        'stroke-dasharray': leafNode.swing === 'out' ? '4 3' : 'none',
        'pointer-events': 'none',
      })
    }
    if (isHung(leafNode.kind)) {
      const topHung = leafNode.kind === 'top-hung'
      const hingeY = topHung ? y + 7 : y + height - 7
      const farY = topHung ? y + height - 7 : y + 7
      svgElement('path', {
        d: `M ${x + 7} ${hingeY} L ${x + width / 2} ${farY} L ${x + width - 7} ${hingeY}`,
        fill: 'none',
        stroke: selected ? '#cf8d4c' : '#6592a5',
        'stroke-width': 1,
        'stroke-dasharray': leafNode.swing === 'out' ? '4 3' : 'none',
        'pointer-events': 'none',
      })
      if (width > 75 && height > 85)
        svgText(x + width / 2, topHung ? y + 22 : y + height - 14, topHung ? '顶铰链' : '底铰链', {
          'font-size': 10,
          'pointer-events': 'none',
        })
    }
    if (leafNode.kind === 'sliding') {
      for (let panelIndex = 1; panelIndex < leafNode.count; panelIndex += 1)
        svgElement('line', {
          x1: x + (width * panelIndex) / leafNode.count,
          y1: y + 5,
          x2: x + (width * panelIndex) / leafNode.count,
          y2: y + height - 5,
          stroke: '#6a8a97',
          'pointer-events': 'none',
        })
      svgText(x + width / 2, y + height * 0.7, leafNode.slide === 'right' ? '→' : '←', {
        'font-size': 19,
        'pointer-events': 'none',
      })
    }
    svgText(x + width / 2, y + height / 2 - 5, '窗格 ' + (index + 1), {
      fill: selected ? '#ffd4a7' : '#d0e5ed',
      'pointer-events': 'none',
    })
    if (width > 65 && height > 55)
      svgText(
        x + width / 2,
        y + height / 2 + 14,
        `${Math.round(entry.width * 1000)} × ${Math.round(entry.height * 1000)}`,
        { 'font-size': 10, 'pointer-events': 'none' },
      )
  }

  svgElement('rect', {
    x: offsetX,
    y: offsetY,
    width: current.width * scale,
    height: current.height * scale,
    fill: 'none',
    stroke: '#94a9b6',
    'stroke-width': 4,
    'pointer-events': 'none',
  })

  for (const entry of allEntries.filter((candidate) => candidate.node.children)) {
    const splitNode = entry.node as WindowSplit
    const x = offsetX + entry.x * scale
    const y = offsetY + entry.y * scale
    const geometry =
      splitNode.axis === 'x'
        ? {
            x1: x + entry.width * splitNode.ratio * scale,
            x2: x + entry.width * splitNode.ratio * scale,
            y1: y,
            y2: y + entry.height * scale,
          }
        : {
            x1: x,
            x2: x + entry.width * scale,
            y1: y + entry.height * splitNode.ratio * scale,
            y2: y + entry.height * splitNode.ratio * scale,
          }
    svgElement('line', { ...geometry, stroke: '#94a9b6', 'stroke-width': 4, 'pointer-events': 'none' })
    if (selectedSashId === splitNode.id) {
      const segment = windowSplitSegment(current, splitNode.id, segmentRatio)
      if (segment)
        svgElement('line', {
          ...(segment.vertical
            ? {
                x1: offsetX + segment.coordinate * scale,
                x2: offsetX + segment.coordinate * scale,
                y1: offsetY + segment.start * scale,
                y2: offsetY + segment.end * scale,
              }
            : {
                x1: offsetX + segment.start * scale,
                x2: offsetX + segment.end * scale,
                y1: offsetY + segment.coordinate * scale,
                y2: offsetY + segment.coordinate * scale,
              }),
          stroke: '#ff9d2e',
          'stroke-width': 5,
          'pointer-events': 'none',
        })
    }
    svgElement('line', {
      ...geometry,
      'data-split': splitNode.id,
      class: 'split-hit ' + (splitNode.axis === 'y' ? 'horizontal' : ''),
    })
  }

  svgText(bounds.width / 2, offsetY - 18, Math.round(current.width * 1000) + ' mm')
  svgText(bounds.width / 2, offsetY + current.height * scale + 24, '窗户正立面')
  svgText(offsetX + current.width * scale + 18, bounds.height / 2, String(Math.round(current.height * 1000)), {
    transform: `rotate(90 ${offsetX + current.width * scale + 18} ${bounds.height / 2})`,
  })

  if (drawPreview) {
    const target = find(current, drawPreview.id)
    if (target) {
      const position = drawPreview.position
      const geometry =
        drawPreview.axis === 'x'
          ? {
              x1: offsetX + (target.x + position) * scale,
              x2: offsetX + (target.x + position) * scale,
              y1: offsetY + target.y * scale,
              y2: offsetY + (target.y + target.height) * scale,
            }
          : {
              x1: offsetX + target.x * scale,
              x2: offsetX + (target.x + target.width) * scale,
              y1: offsetY + (target.y + position) * scale,
              y2: offsetY + (target.y + position) * scale,
            }
      svgElement('line', {
        ...geometry,
        stroke: '#ff9d2e',
        'stroke-width': 2,
        'stroke-dasharray': '5 4',
        'pointer-events': 'none',
      })
    }
  }
  return canvasScale
}
