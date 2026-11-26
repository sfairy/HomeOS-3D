import * as three from '/static/vendor/three/0.187.0/three.module.min.js'
import { lampItemTypeSet } from '../../items/item-catalog'

/**
 * 素材悬停预览的离屏缩略图（0.8.7 `studio-asset-preview.js` 的渲染部分）。
 *
 * 0.8.7 的做法是「一个常驻的 224×168 离屏 WebGL 渲染器 + LRU 图片缓存」：
 * 鼠标停在卡片上一会儿才渲染一次，之后命中缓存直接换 `img.src`。
 * 这样既有真实模型缩略图，又不会把 hover 变成连续渲染事故。
 *
 * 三条硬约束（踩过就不想再踩）：
 * 1. **不能 dispose 共享几何 / 材质**：模型克隆体引用的是外部模型管理器的共享资源，
 *    在这里 dispose 会让编辑区里的同一件家具一起消失。只做 `remove`。
 * 2. **渲染器单例**：每次 hover 建一个 WebGLRenderer 会很快耗尽上下文（浏览器上限约 16 个）。
 * 3. **取景按包围盒**：模型原点各不相同，必须先居中再套正交相机，否则缩略图偏到画外。
 */

/** 缩略图尺寸（与 0.8.7 的 CSS 一致，`img` 固定 224×168）。 */
const THUMBNAIL_WIDTH = 224
const THUMBNAIL_HEIGHT = 168
/** LRU 上限：覆盖素材库一屏的量即可，再多就是白占内存。 */
const CACHE_LIMIT = 64
/** 发光材质的默认颜色（0.8.7 同值）。 */
const LIGHT_EMISSIVE_COLOR = 0xffdcaa

export interface ThumbnailItem {
  type: string
  width?: number
  depth?: number
  height?: number
  color?: string
  [key: string]: unknown
}

export interface AssetThumbnailRenderer {
  /** 命中缓存立即返回；未命中时渲染并写入缓存。 */
  render: (key: string, item: ThumbnailItem) => Promise<string>
  dispose: () => void
}

/** 极简 LRU：Map 的插入顺序即使用顺序，命中时重新 set 一次提到队尾。 */
function remember(cache: Map<string, string>, key: string, value: string): void {
  cache.delete(key)
  cache.set(key, value)
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

/** 灯带 / 筒灯的「发光区域示意」：一个薄盒或圆柱 + 自发光面。 */
function buildLightAreaPreview(item: ThumbnailItem): three.Group {
  const group = new three.Group()
  const width = Number(item.width || 0.3)
  const depth = Number(item.depth || 0.3)
  const bodyColor = item.color ? new three.Color(item.color).getHex() : 0x9aa5b7
  const body = new three.MeshStandardMaterial({ color: bodyColor, roughness: 0.65 })
  const glow = new three.MeshStandardMaterial({
    color: LIGHT_EMISSIVE_COLOR,
    emissive: LIGHT_EMISSIVE_COLOR,
    emissiveIntensity: 0.6,
    roughness: 0.8,
  })
  if (item.type === 'downlight') {
    group.add(new three.Mesh(new three.CylinderGeometry(width / 2, width / 2, 0.035, 40), body))
    const disc = new three.Mesh(new three.CylinderGeometry(width * 0.42, width * 0.42, 0.005, 40), glow)
    disc.position.y = 0.02
    group.add(disc)
    return group
  }
  group.add(new three.Mesh(new three.BoxGeometry(width, 0.035, depth), body))
  const panel = new three.Mesh(new three.BoxGeometry(width * 0.92, 0.005, depth * 0.92), glow)
  panel.position.y = 0.02
  group.add(panel)
  return group
}

/** 无外部模型时的兜底：用目录尺寸画一个盒子，至少形状比例是对的。 */
function buildFallbackBox(item: ThumbnailItem): three.Group {
  const group = new three.Group()
  const material = new three.MeshStandardMaterial({
    color: item.color ? new three.Color(item.color).getHex() : 0x9aa5b7,
    roughness: 0.72,
  })
  const mesh = new three.Mesh(
    new three.BoxGeometry(Number(item.width || 0.4), Number(item.height || 0.4), Number(item.depth || 0.4)),
    material,
  )
  group.add(mesh)
  return group
}

interface ModelManagerLike {
  modelTypeForItem: (item: unknown) => string
  hasExternalModelForItem: (item: unknown) => boolean
  loadExternalItemModel: (modelType: string) => Promise<unknown>
  addExternalItemModel: (parent: unknown, item: unknown, options?: unknown) => boolean
}

/**
 * 缩略图只需要两样东西：外部模型管理器 + 材质取参。
 *
 * **管理器挂在 runtime 上**（`boot` 对象字面量里的 getter），不在 `appCtx` 里。
 * 早先这里按 `appCtx.externalModelRegistry` 取，永远拿不到管理器，
 * 于是每张卡片都走进 `buildFallbackBox` —— 悬停看到的是一块与实物无关的灰盒子。
 */
type RuntimeLike = {
  externalModelRegistry?: ModelManagerLike
  /** 与场景里同一套材质取参（场景风格 / 材质风格 / 逐槽覆盖）。 */
  materialLoadOptionsForItem?: (item: unknown) => unknown
}

function createRendererContext(): { renderer: three.WebGLRenderer; scene: three.Scene } {
  const renderer = new three.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false })
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2))
  renderer.setSize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT)
  renderer.outputColorSpace = three.SRGBColorSpace
  renderer.toneMapping = three.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  const scene = new three.Scene()
  scene.add(new three.HemisphereLight(0xffffff, 0x82796d, 2.4))
  const keyLight = new three.DirectionalLight(0xffffff, 3)
  keyLight.position.set(4, 7, 5)
  scene.add(keyLight)
  return { renderer, scene }
}

/** 按包围盒居中 + 正交取景，返回相机（0.8.7 同一套公式）。 */
function frameObject(object: three.Object3D): three.OrthographicCamera | null {
  const box = new three.Box3().setFromObject(object)
  if (box.isEmpty()) return null
  const center = box.getCenter(new three.Vector3())
  const size = box.getSize(new three.Vector3())
  object.position.sub(center)
  const extent = Math.max(size.x, size.y, size.z, 0.05) * 1.1
  const aspect = THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT
  const camera = new three.OrthographicCamera(-extent * aspect, extent * aspect, extent, -extent, 0.001, extent * 30)
  camera.position.set(extent * 4, extent * 3, extent * 4)
  camera.lookAt(0, 0, 0)
  camera.updateProjectionMatrix()
  return camera
}

export function createAssetThumbnailRenderer(runtime: RuntimeLike): AssetThumbnailRenderer {
  const cache = new Map<string, string>()
  let context: { renderer: three.WebGLRenderer; scene: three.Scene } | null = null
  let disposed = false
  /** 串行化：同一时刻只允许一次渲染，避免多张卡片同时抢一个 WebGL 上下文。 */
  let queue: Promise<unknown> = Promise.resolve()

  const ensureContext = () => {
    context ||= createRendererContext()
    return context
  }

  /** 取模型：外部 GLB 优先，程序化 / 灯光走几何体。返回可直接加进 scene 的对象。 */
  const buildObject = async (item: ThumbnailItem): Promise<three.Object3D | null> => {
    if (lampItemTypeSet.has(item.type)) return buildLightAreaPreview(item)
    const manager = runtime.externalModelRegistry
    if (!manager || !manager.hasExternalModelForItem(item)) return buildFallbackBox(item)
    try {
      await manager.loadExternalItemModel(manager.modelTypeForItem(item))
    } catch {
      return null
    }
    const group = new three.Group()
    // 材质取参与场景同源：漏了这一层，缩略图就是默认冷色，和实际摆放的暖木色对不上。
    const loadOptions = runtime.materialLoadOptionsForItem?.(item) ?? {}
    // 少数类型（电视走程序化机身）即使登记了 GLB 也拒绝挂载：此时退回按尺寸画的盒子，
    // 至少比例正确，也比「预览暂不可用」更接近实物。
    return manager.addExternalItemModel(group, item, loadOptions) ? group : buildFallbackBox(item)
  }

  const renderOnce = async (item: ThumbnailItem): Promise<string> => {
    const object = await buildObject(item)
    if (!object) throw new Error('模型尚未就绪')
    const { renderer, scene } = ensureContext()
    try {
      const camera = frameObject(object)
      if (!camera) throw new Error('模型未就绪')
      scene.add(object)
      renderer.render(scene, camera)
      return renderer.domElement.toDataURL('image/png')
    } finally {
      scene.remove(object)
      // 只摘除父子关系：几何 / 材质属于外部模型管理器的共享缓存，dispose 会误伤编辑区。
      renderer.renderLists.dispose()
    }
  }

  return {
    render(key, item) {
      const cached = cache.get(key)
      if (cached) {
        remember(cache, key, cached)
        return Promise.resolve(cached)
      }
      const task = queue
        .then(() => {
          if (disposed) throw new Error('预览已释放')
          return renderOnce(item)
        })
        .then((dataUrl) => {
          remember(cache, key, dataUrl)
          return dataUrl
        })
      queue = task.catch(() => undefined)
      return task
    },
    dispose() {
      disposed = true
      cache.clear()
      context?.renderer.dispose()
      context?.renderer.forceContextLoss()
      context = null
    },
  }
}

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
      // 0.8.8 把「模型还没准备好」与「渲染失败」分成两种状态：前者等模型加载完再悬停一次就会好，
      // 后者要看 `previewError`（目前只有「预览已释放」这类）。缩略图渲染器抛出的是
      // `模型尚未就绪` / `模型未就绪`，据此区分。
      const previewFailureReason = (error as Error)?.message || String(error)
      nodes.status.textContent = /^模型/.test(previewFailureReason) ? '模型未就绪' : '预览暂不可用，移开后可重试'
      panel.dataset.previewError = previewFailureReason
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
