/**
 * 素材库悬停预览（0.8.7 `createAssetPreview` 的对应实现）。
 *
 * 结构与上游一致，五段式：
 *   resolve（卡片 → 物件记录） → 延迟 220ms → 渲染缩略图（带缓存） → 填 DOM → 视口内定位
 *
 * 三条与 0.8.7 对齐的行为细节：
 * - **220ms** 延迟出现（不是 400ms）：扫过一排卡片不会闪出一串浮层；
 * - **贴卡片右侧**（`rect.right + 10`），左边夹在 `innerWidth - 248`，避免右侧被裁；
 * - **键盘 focus 立即出现**：Tab 到卡片也要能看预览。
 */
import type { AssetThumbnailRenderer } from './studio-asset-thumbnail'

const HOVER_DELAY_MS = 220
const VIEWPORT_MARGIN_PX = 8
/** 浮层宽度 240 + 贴边 8：右侧夹取用的常量（与 CSS 同值）。 */
const PANEL_RESERVE_PX = 248

export interface AssetPreviewRecord {
  type: string
  width: number
  depth: number
  height: number
  /** 名称（素材卡中文名 / 灯光名）。 */
  previewName: string
  /** 灯带类：文案改成「发光区域示意」。 */
  previewSchematic?: boolean
  /** 组合品（茶桌 / 茶几 / 双屏 / 摆件组）：尺寸后缀「整组尺寸」。 */
  previewGroup?: boolean
  [key: string]: unknown
}

export interface AssetPreviewOptions {
  /** `#asset-preview`（已挂在 body 上）。 */
  host: HTMLElement
  /** 指针下的元素 → 物件记录；返回 `null` 表示不预览。 */
  resolve: (target: HTMLElement) => AssetPreviewRecord | null
  thumbnail: AssetThumbnailRenderer
  /** 主题键：换场景风格 / 换前端版本会让缓存整体失效。 */
  themeKey: () => string
  /** 渲染失败上报（写全局日志）。 */
  onError?: (error: unknown, record: AssetPreviewRecord) => void
}

export interface AssetPreview {
  hide: () => void
  /** 重渲染当前锚点（主题变化后调用）。 */
  refresh: () => void
  destroy: () => void
}

/** 缓存键：剔除会随手改的字段，否则改个备注就重渲染。 */
export function assetPreviewImageKey(themeKey: string, record: AssetPreviewRecord): string {
  const { remark, previewName, previewGroup, lightGroupId, ...rest } = record as Record<string, unknown>
  void remark
  void previewName
  void previewGroup
  void lightGroupId
  return JSON.stringify([themeKey, rest])
}

/** 尺寸统一保留 2 位小数：实例尺寸可能是浮点尾巴（0.4583833），直接展示不可读。 */
function meters(value: number): string {
  return (Number.isFinite(Number(value)) ? Number(value) : 0).toFixed(2)
}

function formatSize(record: AssetPreviewRecord): string {
  if (record.previewSchematic) {
    return `发光区域示意 · 宽 ${meters(record.width)} × 深 ${meters(record.depth)} m`
  }
  const base = `宽 ${meters(record.width)} × 深 ${meters(record.depth)} × 高 ${meters(record.height)} m`
  return record.previewGroup ? `${base} · 整组尺寸` : base
}

interface PanelNodes {
  title: HTMLElement
  size: HTMLElement
  image: HTMLImageElement
  status: HTMLElement
}

/** DOM 顺序与 0.8.7 一致：strong → small(尺寸) → img → span(状态)。 */
function createPanelNodes(host: HTMLElement): PanelNodes {
  const documentNode = host.ownerDocument
  host.replaceChildren()
  const title = documentNode.createElement('strong')
  const size = documentNode.createElement('small')
  const image = documentNode.createElement('img')
  image.alt = ''
  image.width = 224
  image.height = 168
  const status = documentNode.createElement('span')
  host.append(title, size, image, status)
  return { title, size, image, status }
}

/** 贴卡片右侧；右侧空间不足时夹回视口内（0.8.7 的定位公式）。 */
function placePanel(panel: HTMLElement, anchor: HTMLElement): void {
  const box = anchor.getBoundingClientRect()
  const view = panel.ownerDocument.defaultView
  const viewWidth = view?.innerWidth ?? 0
  const viewHeight = view?.innerHeight ?? 0
  panel.style.left = `${Math.round(Math.max(VIEWPORT_MARGIN_PX, Math.min(viewWidth - PANEL_RESERVE_PX, box.right + 10)))}px`
  panel.style.top = `${Math.round(Math.max(VIEWPORT_MARGIN_PX, Math.min(viewHeight - panel.offsetHeight - VIEWPORT_MARGIN_PX, box.top)))}px`
}

/** 目标元素：素材卡（`data-item-type`）或「已放置」行（`data-preview-item-id`）。 */
function previewTarget(eventTarget: EventTarget | null): HTMLElement | null {
  return (eventTarget as Element | null)?.closest?.('[data-item-type],[data-preview-item-id]') ?? null
}

interface TriggerBinding {
  documentNode: Document
  panel: HTMLElement
  anchor: () => HTMLElement | null
  open: (target: HTMLElement) => void
  hide: () => void
  place: (target: HTMLElement) => void
}

/**
 * 触发规则（0.8.7）：document 级委托 + 220ms 延迟 + focus 立即 + 滚动重定位。
 * 抽成独立函数是为了让 `createAssetPreview` 只负责状态与渲染。
 */
function bindPreviewTriggers(binding: TriggerBinding): () => void {
  const { documentNode, panel } = binding
  let timer = 0
  const clearTimer = () => {
    if (timer) globalThis.clearTimeout(timer)
    timer = 0
  }
  const onPointerOver = (event: PointerEvent) => {
    const target = previewTarget(event.target)
    if (!target || target.contains(event.relatedTarget as Node | null) || target === binding.anchor()) return
    clearTimer()
    timer = globalThis.setTimeout(() => {
      timer = 0
      if (target.isConnected) binding.open(target)
    }, HOVER_DELAY_MS) as unknown as number
  }
  const onLeave = (event: Event) => {
    const target = previewTarget(event.target)
    if (target && !target.contains((event as PointerEvent).relatedTarget as Node | null)) binding.hide()
  }
  const onFocusIn = (event: FocusEvent) => {
    const target = previewTarget(event.target)
    if (target) binding.open(target)
  }
  const onScroll = () => {
    const anchor = binding.anchor()
    if (anchor && documentNode.activeElement === anchor) binding.place(anchor)
    else binding.hide()
  }
  const listeners: Array<[string, EventListener, boolean]> = [
    ['pointerover', onPointerOver as EventListener, false],
    ['pointerout', onLeave, false],
    ['focusin', onFocusIn as EventListener, false],
    ['focusout', onLeave, false],
    ['pointerdown', () => binding.hide(), false],
  ]
  for (const [type, listener, capture] of listeners) documentNode.addEventListener(type, listener, capture)
  globalThis.addEventListener('scroll', onScroll, true)
  void panel
  return () => {
    clearTimer()
    for (const [type, listener, capture] of listeners) documentNode.removeEventListener(type, listener, capture)
    globalThis.removeEventListener('scroll', onScroll, true)
  }
}

/** 渲染一张预览并填入面板；失败写失败态与日志。 */
function createPreviewPresenter(
  panel: HTMLElement,
  nodes: PanelNodes,
  options: AssetPreviewOptions,
  epochOf: () => number,
): (target: HTMLElement, record: AssetPreviewRecord) => Promise<void> {
  return async (target, record) => {
    const current = epochOf()
    panel.dataset.previewType = record.type
    delete panel.dataset.previewError
    nodes.title.textContent = record.previewName || record.type
    nodes.size.textContent = formatSize(record)
    nodes.image.hidden = true
    nodes.status.textContent = '正在生成预览…'
    panel.hidden = false
    placePanel(panel, target)
    try {
      const dataUrl = await options.thumbnail.render(assetPreviewImageKey(options.themeKey(), record), record)
      if (current !== epochOf()) return
      nodes.image.src = dataUrl
      nodes.image.hidden = false
      nodes.status.textContent = ''
    } catch (error) {
      if (current !== epochOf()) return
      nodes.image.hidden = true
      nodes.status.textContent = '预览暂不可用，移开后可重试'
      panel.dataset.previewError = (error as Error)?.message || String(error)
      options.onError?.(error, record)
    }
    placePanel(panel, target)
  }
}

export function createAssetPreview(options: AssetPreviewOptions): AssetPreview {
  const documentNode = options.host.ownerDocument
  const panel = options.host
  panel.classList.add('studio-asset-preview')
  panel.setAttribute('role', 'tooltip')
  panel.hidden = true
  const nodes = createPanelNodes(panel)

  let anchor: HTMLElement | null = null
  /** 每次显示 / 隐藏都自增：异步渲染回来时若代际已变，结果直接丢弃。 */
  let epoch = 0

  const hide = (): void => {
    epoch += 1
    anchor = null
    panel.hidden = true
  }

  const show = createPreviewPresenter(panel, nodes, options, () => epoch)

  const open = (target: HTMLElement): void => {
    const record = options.resolve(target)
    if (!record) {
      hide()
      return
    }
    anchor = target
    void show(target, record)
  }

  const unbind = bindPreviewTriggers({
    documentNode,
    panel,
    anchor: () => anchor,
    open,
    hide,
    place: (target) => placePanel(panel, target),
  })

  return {
    hide,
    refresh() {
      const current = anchor
      hide()
      if (current?.isConnected) open(current)
    },
    destroy() {
      hide()
      unbind()
      panel.replaceChildren()
      panel.hidden = true
    },
  }
}
