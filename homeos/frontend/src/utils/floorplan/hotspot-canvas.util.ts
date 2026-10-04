/**
 * 户型图热点 Canvas2D 绘制工具
 *
 * 职责：
 * - 在户型图 Canvas 上绘制热点（圆点 + 标签 + 状态图标 + HUD 进度），与 DOM
 *   HotspotNode 保持视觉 parity（一致外观）。
 * - 处理长按进度、暗淡 HUD、状态语义色、徽章读数前置图标等绘制细节。
 *
 * 依赖：
 * - ./widget.util 提供 resolveStateIconUrl。
 * - @/constants/entity-state-meta 提供 entityStateColor 语义色。
 * - @/utils/ui/color.util 提供 buildDotThemeFromColor 圆点主题构建。
 * - ./hotspot-layout.util 提供热点布局度量与锚点解析。
 * - ./badge-reading-icon.util 提供徽章读数前置图标绘制。
 *
 * 注意：Canvas 坐标 / 像素 / 进度值为运行时数值，不翻译；状态色为 CSS 颜色值，不翻译。
 */
import { resolveStateIconUrl } from '@/utils/floorplan/widget.util'
import { entityStateColor } from '@/constants/entity-state-meta'
import { buildDotThemeFromColor } from '@/utils/ui/color.util'
import {
  HOTSPOT_DOT_PX,
  HOTSPOT_LABEL_FONT_PX,
  measureHotspotLayout,
  resolveHotspotAnchorPct,
} from '@/utils/floorplan/hotspot-layout.util'
import { drawBadgeReadingIcon } from '@/utils/floorplan/badge-reading-icon.util'

/** 热点布局度量结果（圆点 / 标签位置等，来自 measureHotspotLayout） */
type HotspotLayout = ReturnType<typeof measureHotspotLayout>

/** 热点绘制可选项：长按目标 widget、长按进度、暗淡 HUD（widgetId + 进度） */
interface HotspotDrawOptions {
  longPressWidgetId?: string | null
  longPressProgress?: number
  dimHud?: { widgetId: string; pct: number } | null
}

/** 圆点主题：内色 / 外色 / 辉光 / 边框色 */
interface DotTheme {
  inner: string
  outer: string
  glow: string
  border: string
}

/** 热点锚点部件类型（与 resolveHotspotAnchorPct 入参对齐） */
type HotspotAnchorWidget = Parameters<typeof resolveHotspotAnchorPct>[0]

/** 户型图热点部件配置结构（含位置、缩放、状态图标映射等） */
interface FloorplanHotspotWidget {
  id?: string
  type?: string
  x?: number
  y?: number
  xPct?: number
  yPct?: number
  iconScale?: number
  stateIcons?: Record<string, string>
  hotspotAnchor?: string
  config?: Record<string, unknown>
  [key: string]: unknown
}

interface HotspotDisplayState {
  label?: string
  stateText?: string
  state?: string
  isOn?: boolean
  iconUrl?: string | null
  stateColor?: string | null
  readingKind?: string | null
  [key: string]: unknown
}

type ImageCacheEntry = HTMLImageElement | 'loading' | 'error'

const BADGE_FONT_PX = HOTSPOT_LABEL_FONT_PX

const imageCache = new Map<string, ImageCacheEntry>()

const imageLoadWaiters = new Set<(url: string) => void>()

function notifyImageLoaded(url: string) {
  for (const fn of imageLoadWaiters) fn(url)
}

function getCachedHotspotImage(url: string): HTMLImageElement | null {
  const v = imageCache.get(url)
  return v instanceof HTMLImageElement ? v : null
}

function preloadHotspotImage(url: string, onLoad?: () => void) {
  if (!url) return
  const cached = imageCache.get(url)
  if (cached instanceof HTMLImageElement) {
    onLoad?.()
    return
  }
  if (cached === 'loading') {
    if (onLoad) {
      const waiter = (loadedUrl: string) => {
        if (loadedUrl === url) {
          imageLoadWaiters.delete(waiter)
          onLoad()
        }
      }
      imageLoadWaiters.add(waiter)
    }
    return
  }
  if (cached === 'error') return

  imageCache.set(url, 'loading')
  const img = new Image()
  img.decoding = 'async'
  img.onload = () => {
    imageCache.set(url, img)
    notifyImageLoaded(url)
    onLoad?.()
  }
  img.onerror = () => {
    imageCache.set(url, 'error')
    notifyImageLoaded(url)
  }
  img.src = url
}

export function preloadHotspotImages(
  widgets: FloorplanHotspotWidget[],
  getDisplay: (widget: FloorplanHotspotWidget) => HotspotDisplayState,
  onAnyLoad?: () => void,
) {
  const urls = new Set<string>()
  for (let i = 0; i < widgets.length; i++) {
    const w = widgets[i]
    if (w.stateIcons && typeof w.stateIcons === 'object') {
      const icons = w.stateIcons as Record<string, unknown>
      for (const key of Object.keys(icons)) {
        const url = resolveStateIconUrl(icons[key] as string | null | undefined)
        if (url) urls.add(url)
      }
    } else {
      const display = getDisplay(w)
      const icons = (w.stateIcons || {}) as Record<string, unknown>
      const stateKey = String(display.state ?? '')
      const url = resolveStateIconUrl(icons[stateKey] as string | null | undefined)
      if (url) urls.add(url)
    }
  }
  urls.forEach((url) => preloadHotspotImage(url, onAnyLoad))
}

/** @type {Record<string, { inner: string, outer: string, glow: string, border: string }>} */
const DOT_THEMES: Record<string, DotTheme> = {
  default: {
    inner: '#FFD60A',
    outer: '#F5A623',
    glow: 'rgba(255,214,10,0.5)',
    border: 'rgba(255,214,10,0.6)',
  },
  ClimateWidget: {
    inner: '#60a5fa',
    outer: '#2563eb',
    glow: 'rgba(59,130,246,0.45)',
    border: 'rgba(96,165,250,0.6)',
  },
  WaterHeaterWidget: {
    inner: '#fbbf24',
    outer: '#f59e0b',
    glow: 'rgba(245,158,11,0.45)',
    border: 'rgba(245,158,11,0.6)',
  },
  MediaWidget: {
    inner: '#c084fc',
    outer: '#7c3aed',
    glow: 'rgba(139,92,246,0.45)',
    border: 'rgba(168,85,247,0.6)',
  },
  CoverWidget: {
    inner: '#818cf8',
    outer: '#4f46e5',
    glow: 'rgba(99,102,241,0.45)',
    border: 'rgba(129,140,248,0.6)',
  },
  WaterPurifierWidget: {
    inner: '#38bdf8',
    outer: '#0284c7',
    glow: 'rgba(14,165,233,0.45)',
    border: 'rgba(56,189,248,0.6)',
  },
  DispenserWidget: {
    inner: '#22d3ee',
    outer: '#0891b2',
    glow: 'rgba(6,182,212,0.45)',
    border: 'rgba(34,211,238,0.6)',
  },
  FridgeWidget: {
    inner: '#34d399',
    outer: '#059669',
    glow: 'rgba(16,185,129,0.45)',
    border: 'rgba(52,211,153,0.6)',
  },
  FreshAirWidget: {
    inner: '#5eead4',
    outer: '#0d9488',
    glow: 'rgba(13,148,136,0.45)',
    border: 'rgba(94,234,212,0.6)',
  },
  WashingMachineWidget: {
    inner: '#60a5fa',
    outer: '#2563eb',
    glow: 'rgba(37,99,235,0.45)',
    border: 'rgba(96,165,250,0.6)',
  },
  RangeHoodWidget: {
    inner: '#94a3b8',
    outer: '#475569',
    glow: 'rgba(71,85,105,0.45)',
    border: 'rgba(148,163,184,0.6)',
  },
  GasStoveWidget: {
    inner: '#fb923c',
    outer: '#ea580c',
    glow: 'rgba(234,88,12,0.45)',
    border: 'rgba(251,146,60,0.6)',
  },
  MotionSensorWidget: {
    inner: '#c4b5fd',
    outer: '#6d28d9',
    glow: 'rgba(109,40,217,0.45)',
    border: 'rgba(196,181,253,0.6)',
  },
  LeakSensorWidget: {
    inner: '#7dd3fc',
    outer: '#0284c7',
    glow: 'rgba(2,132,199,0.45)',
    border: 'rgba(125,211,252,0.6)',
  },
  GasSensorWidget: {
    inner: '#fdba74',
    outer: '#ea580c',
    glow: 'rgba(234,88,12,0.45)',
    border: 'rgba(253,186,116,0.6)',
  },
  SmokeSensorWidget: {
    inner: '#fca5a5',
    outer: '#dc2626',
    glow: 'rgba(220,38,38,0.45)',
    border: 'rgba(252,165,165,0.6)',
  },
  CoSensorWidget: {
    inner: '#fcd34d',
    outer: '#b45309',
    glow: 'rgba(180,83,9,0.45)',
    border: 'rgba(252,211,77,0.6)',
  },
  EnvironmentSensorWidget: {
    inner: '#5eead4',
    outer: '#0d9488',
    glow: 'rgba(13,148,136,0.45)',
    border: 'rgba(94,234,212,0.6)',
  },
  LockWidget: {
    inner: '#fbbf24',
    outer: '#d97706',
    glow: 'rgba(245,158,11,0.45)',
    border: 'rgba(251,191,36,0.6)',
  },
  VacuumWidget: {
    inner: '#a78bfa',
    outer: '#6d28d9',
    glow: 'rgba(139,92,246,0.45)',
    border: 'rgba(167,139,250,0.6)',
  },
  CameraWidget: {
    inner: '#f472b6',
    outer: '#be185d',
    glow: 'rgba(236,72,153,0.45)',
    border: 'rgba(244,114,182,0.6)',
  },
  HumidifierWidget: {
    inner: '#38bdf8',
    outer: '#0369a1',
    glow: 'rgba(14,165,233,0.45)',
    border: 'rgba(56,189,248,0.6)',
  },
  AlarmWidget: {
    inner: '#ef4444',
    outer: '#b91c1c',
    glow: 'rgba(239,68,68,0.45)',
    border: 'rgba(239,68,68,0.6)',
  },
  SirenWidget: {
    inner: '#f43f5e',
    outer: '#9f1239',
    glow: 'rgba(244,63,94,0.5)',
    border: 'rgba(244,63,94,0.6)',
  },
  ValveWidget: {
    inner: '#2dd4bf',
    outer: '#0f766e',
    glow: 'rgba(20,184,166,0.45)',
    border: 'rgba(45,212,191,0.6)',
  },
  RemoteWidget: {
    inner: '#94a3b8',
    outer: '#334155',
    glow: 'rgba(100,116,139,0.45)',
    border: 'rgba(148,163,184,0.6)',
  },
}

function getDotTheme(widget: FloorplanHotspotWidget, state?: string): DotTheme {
  const fromState = entityStateColor(state)
  if (fromState) return buildDotThemeFromColor(fromState)
  return DOT_THEMES[String(widget.type)] || DOT_THEMES.default
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @param {number} progress 0-100
 * @param {number} dpr
 */
function drawLongPressRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  progress: number,
  dpr: number,
) {
  const r = radius * dpr
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
  ctx.lineWidth = 3 * dpr
  ctx.stroke()

  if (progress > 0) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (progress / 100) * Math.PI * 2)
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)'
    ctx.lineWidth = 3 * dpr
    ctx.lineCap = 'round'
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {boolean} isOn
 * @param {object} widget
 * @param {number} dpr
 */
function drawDot(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  isOn: boolean,
  widget: FloorplanHotspotWidget,
  dpr: number,
  state?: string,
) {
  const radius = r * dpr
  ctx.save()
  const theme = getDotTheme(widget, state)
  if (isOn && !widget.overlayImage) {
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
    grad.addColorStop(0, theme.inner)
    grad.addColorStop(1, theme.outer)
    ctx.fillStyle = grad
    ctx.shadowColor = theme.glow
    ctx.shadowBlur = 14 * dpr
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = theme.border
    ctx.lineWidth = 1.5 * dpr
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.fillStyle = theme.inner.length === 7 ? `${theme.inner}61` : 'rgba(100,116,139,0.38)'
    ctx.fill()
    ctx.strokeStyle = theme.border
    ctx.lineWidth = 1.5 * dpr
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} widget
 * @param {object} display
 * @param {number} cx CSS px * dpr
 * @param {number} cy
 * @param {number} dpr
 * @param {object} layout from measureHotspotLayout
 */
function drawBody(
  ctx: CanvasRenderingContext2D,
  widget: FloorplanHotspotWidget,
  display: HotspotDisplayState,
  cx: number,
  cy: number,
  dpr: number,
  layout: HotspotLayout,
) {
  const iconY = cy
  const stateIcons = widget.stateIcons as Record<string, string | null | undefined> | undefined
  const iconUrl = resolveStateIconUrl(stateIcons?.[String(display.state ?? '')])
  const img = iconUrl ? getCachedHotspotImage(iconUrl) : null

  if (widget.type === 'BadgeWidget' && !img) {
    const text = display.stateText || '—'
    const accent =
      (typeof display.stateColor === 'string' && display.stateColor) ||
      entityStateColor(String(display.state ?? '')) ||
      '#e2e8f0'
    const readingKind = String(display.readingKind || '')
    const showReadingIcon = readingKind === 'temperature' || readingKind === 'humidity'

    ctx.save()
    ctx.font = `600 ${BADGE_FONT_PX * dpr}px system-ui, -apple-system, sans-serif`
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)'
    ctx.shadowBlur = 6 * dpr
    ctx.fillStyle = accent

    if (showReadingIcon) {
      const iconSize = BADGE_FONT_PX * 0.92 * dpr
      const gap = 4 * dpr
      const textW = ctx.measureText(text).width
      const totalW = iconSize + gap + textW
      const left = cx - totalW / 2
      drawBadgeReadingIcon(ctx, readingKind, left + iconSize / 2, iconY, iconSize, accent)
      ctx.textAlign = 'left'
      ctx.fillText(text, left + iconSize + gap, iconY)
    } else {
      ctx.textAlign = 'center'
      ctx.fillText(text, cx, iconY)
    }
    ctx.restore()
    return
  }

  if (img) {
    const size = layout.iconSize * dpr
    const rotate = ((Number(widget.iconRotate) || 0) * Math.PI) / 180
    const accent =
      (typeof display.stateColor === 'string' && display.stateColor) ||
      entityStateColor(String(display.state ?? ''))
    ctx.save()
    ctx.translate(cx, iconY)
    ctx.rotate(rotate)
    if (accent) {
      ctx.shadowColor = buildDotThemeFromColor(accent).glow
      ctx.shadowBlur = 12 * dpr
    } else {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
      ctx.shadowBlur = 10 * dpr
      ctx.shadowOffsetY = 3 * dpr
    }
    ctx.drawImage(img, -size / 2, -size / 2, size, size)
    ctx.restore()
    return
  }

  const stateKey = String(display.state ?? '')
  if (iconUrl) {
    // 图标加载中：暂用圆点占位
    drawDot(ctx, cx, iconY, HOTSPOT_DOT_PX / 2, Boolean(display.isOn), widget, dpr, stateKey)
    return
  }

  drawDot(ctx, cx, iconY, HOTSPOT_DOT_PX / 2, Boolean(display.isOn), widget, dpr, stateKey)
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} label
 * @param {number} cx
 * @param {number} cy
 * @param {number} dpr
 * @param {object} layout
 */
function drawLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  cx: number,
  cy: number,
  dpr: number,
  layout: HotspotLayout,
) {
  if (!label) return
  const ly = cy + layout.labelY * dpr
  ctx.save()
  ctx.font = `500 ${HOTSPOT_LABEL_FONT_PX * dpr}px system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)'
  ctx.shadowBlur = 6 * dpr
  ctx.fillText(label, cx, ly)
  ctx.restore()
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} cx
 * @param {number} cy
 * @param {number} dpr
 * @param {object} layout
 */
function drawDimHud(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  dpr: number,
  layout: HotspotLayout,
) {
  ctx.save()
  ctx.font = `700 ${10 * dpr}px ui-monospace, monospace`
  const tw = ctx.measureText(text).width
  const padX = 8 * dpr
  const padY = 2 * dpr
  const bw = tw + padX * 2
  const bh = 10 * dpr + padY * 2
  const bx = cx - bw / 2
  const by = cy + layout.bodyTop * dpr - bh - 6 * dpr
  roundRect(ctx, bx, by, bw, bh, 8 * dpr)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)'
  ctx.fill()
  ctx.fillStyle = '#fbbf24'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, cx, by + bh / 2)
  ctx.restore()
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} widget
 * @param {object} display
 * @param {number} cx canvas px
 * @param {number} cy canvas px
 * @param {number} dpr
 * @param {object} [opts]
 * @param {string|null} [opts.longPressWidgetId]
 * @param {number} [opts.longPressProgress]
 * @param {{ widgetId: string, pct: number }|null} [opts.dimHud]
 */
export function drawHotspot(
  ctx: CanvasRenderingContext2D,
  widget: FloorplanHotspotWidget,
  display: HotspotDisplayState,
  cx: number,
  cy: number,
  dpr: number,
  opts: HotspotDrawOptions = {},
) {
  const layout = measureHotspotLayout(widget, dpr)

  if (opts.longPressWidgetId === widget.id && (opts.longPressProgress ?? 0) > 0) {
    drawLongPressRing(ctx, cx, cy, 22, opts.longPressProgress ?? 0, dpr)
  }

  drawBody(ctx, widget, display, cx, cy, dpr, layout)
  drawLabel(ctx, String(display.label ?? ''), cx, cy, dpr, layout)

  const dimHud = opts.dimHud
  if (dimHud && dimHud.widgetId === widget.id) {
    drawDimHud(ctx, `${dimHud.pct}%`, cx, cy, dpr, layout)
  }
}

/**
 * @param {object} widget
 * @param {number} px
 * @param {number} py
 * @param {number} rectW - transform 后 CSS 矩形宽度
 * @param {number} rectH - transform 后 CSS 矩形高度
 * @param {number} [scaleFactor=1] - 缩放系数 = 当前 canvas.getBoundingClientRect().width / 父容器未 transform 布局宽度，对应 map-viewport 的 zoom（含 getBoundingClientRect 舍入误差）
 */
function hitTestHotspot(
  widget: FloorplanHotspotWidget,
  px: number,
  py: number,
  rectW: number,
  _rectH: number,
  scaleFactor: number = 1,
) {
  const anchor = resolveHotspotAnchorPct(widget as HotspotAnchorWidget)
  const wx = (anchor.xPct / 100) * rectW
  const wy = (anchor.yPct / 100) * _rectH
  const layout = measureHotspotLayout(widget, 1)
  // scaleFactor 含义 = 当前 canvas.getBoundingClientRect().width / 父容器未 transform 布局宽度，对应 map-viewport 的 zoom（含 getBoundingClientRect 舍入误差）
  return Math.abs(px - wx) <= layout.hitHalfW * scaleFactor && Math.abs(py - wy) <= layout.hitHalfH * scaleFactor
}

/**
 * @param {Array<object>} widgets
 * @param {number} px
 * @param {number} py
 * @param {number} rectW - transform 后 CSS 矩形宽度
 * @param {number} rectH - transform 后 CSS 矩形高度
 * @param {(id: string) => boolean} isVisible
 * @param {number} [scaleFactor=1] - 缩放系数 = 当前 canvas.getBoundingClientRect().width / 父容器未 transform 布局宽度，对应 map-viewport 的 zoom（含 getBoundingClientRect 舍入误差）
 */
export function hitTestHotspots(
  widgets: FloorplanHotspotWidget[],
  px: number,
  py: number,
  rectW: number,
  rectH: number,
  isVisible: (id: string) => boolean,
  scaleFactor: number = 1,
) {
  let best: FloorplanHotspotWidget | null = null
  let bestDist = Infinity
  for (let i = 0; i < widgets.length; i++) {
    const widget = widgets[i]
    if (!widget.id || !isVisible(widget.id)) continue
    if (!hitTestHotspot(widget, px, py, rectW, rectH, scaleFactor)) continue
    const anchor = resolveHotspotAnchorPct(widget as HotspotAnchorWidget)
    const wx = (anchor.xPct / 100) * rectW
    const wy = (anchor.yPct / 100) * rectH
    const dist = Math.hypot(px - wx, py - wy)
    if (dist < bestDist) {
      best = widget
      bestDist = dist
    }
  }
  return best
}

