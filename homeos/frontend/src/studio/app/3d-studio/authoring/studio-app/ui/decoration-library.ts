/**
 * 「我的装饰」面板（0.8.9）：列出 / 上传 / 删除 / 拖入。
 *
 * 为什么是一个控制器而不是一段模板逻辑：卡片是**动态**的（数量随用户上传变化），
 * 而这一页其余资产卡片都是静态标记。把「拉列表 → 建卡片 → 绑上传/删除/拖拽」
 * 收在一个模块里，宿主只需要在切到「我的装饰」时调一次 `refreshDecorationLibrary`。
 *
 * 三条必须保持的行为：
 *
 * 1. **额度来自服务端**（`maxBytes` / `maxModels` / `totalBytes`），前端不写死；
 *    服务端没给上限时按「不限制」处理而不是按 0（那会让人永远传不上去）；
 * 2. **失败要能看见**：状态行 `[role=status]` 写具体原因（太大 / 不是 GLB / 数量满），
 *    而不是只把按钮变灰；
 * 3. **本模块只做库管理**：列出 / 上传 / 删除。把模型放进户型需要渲染层支持
 *    「按 assetId 动态取 GLB」，而当前的 `addExternalItemModel` 只按**类型**查静态模型表；
 *    在它支持按 URL 取件之前，卡片故意不可拖 —— 拖进去只会得到一件看不见的物品。
 */

import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import {
  DECORATION_NAME_LIMIT,
  decorationErrorMessage,
  decorationUploadIssue,
  normalizeDecorationLibrary,
  type DecorationLibraryState,
  type DecorationModel,
} from '../../items/studio-user-decorations'
import { deleteStudioModel, listStudioModels, uploadStudioModel } from '@/domain/api/studio-models'
import { USER_DECORATION_DRAG_TYPE } from '../interaction/drag-and-drop'
import { shellConfirm } from '@/studio/platform/shell-chrome'
import { installAssetNameScroll } from './asset-library'
import {
  forgetDecorationModelName,
  registerDecorationModelNames,
} from '@app/3d-studio/loaders/external-models/user-decoration-models'

/** 面板元素 id（与 `StudioView.vue` 标记一致）。 */
const PANEL_ID = 'decoration-library'
const LIST_SELECTOR = '[data-decoration-list]'
const STATUS_SELECTOR = '.decoration-status'
const UPLOAD_SELECTOR = '[data-decoration-upload]'

/** 一次会话内的库状态（避免每次切分类都重复请求）。 */
const panelState: {
  library: DecorationLibraryState | null
  bound: boolean
  loading: boolean
} = { library: null, bound: false, loading: false }

/** 清空缓存（上传/删除后强制重拉）。 */
function invalidate(): void {
  panelState.library = null
}

/** 人类可读的体积（1 位小数，MiB）。 */
export function decorationSizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  const mib = bytes / (1024 * 1024)
  return mib >= 1 ? `${mib.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * 状态行文案。
 *
 * 空库时给一句**引导**（上游原文：「上传一个 GLB 后，即可将它放进户型。」）——
 * 比「已上传 0 件」有用得多：新用户看到的是下一步该做什么，而不是一个为零的计数。
 * 有条目时报条数与额度占用百分比（用户关心「还能不能传」，不是精确字节数）。
 */
export function decorationStatusText(library: DecorationLibraryState): string {
  // 有条目时状态行为**空**（上游 `items.length ? '' : '上传一个 GLB 后…'`）。
  //
  // 我此前在这里常驻「已上传 N / M 件 · 占用 X%」，与上游不一致：
  // 列表已经能看到有几件，再顶一行计数器会把首屏卡片挤下去。
  // 额度信息属于「上传说明」弹窗（那里逐条列出），不需要在列表里常驻。
  if (library.models.length > 0) return ''
  return '上传一个 GLB 后，即可将它放入户型。'
}

/** 上传是否已达上限（用于禁用按钮，不用于判定能否选文件）。 */
export function decorationUploadBlocked(library: DecorationLibraryState): boolean {
  return library.maxModels > 0 && library.models.length >= library.maxModels
}

/**
 * 刷新面板：首次调用会绑定上传/删除事件，之后只重建卡片。
 */
export async function refreshDecorationLibrary(runtime: StudioAppRuntime): Promise<void> {
  const panel = document.getElementById(PANEL_ID)
  if (!panel) return
  bindPanelOnce(runtime, panel)
  if (panelState.loading) return
  if (panelState.library) {
    renderCards(panel, panelState.library)
    return
  }
  panelState.loading = true
  writeStatus(panel, '正在读取装饰模型…')
  try {
    const response = await listStudioModels()
    panelState.library = normalizeDecorationLibrary(response.data)
    renderCards(panel, panelState.library)
  } catch (error) {
    writeStatus(panel, decorationErrorMessage(error, '装饰模型读取失败，请稍后重试。'), true)
  } finally {
    panelState.loading = false
  }
}

function bindPanelOnce(runtime: StudioAppRuntime, panel: HTMLElement): void {
  if (panelState.bound) return
  panelState.bound = true
  panel.querySelector(UPLOAD_SELECTOR)?.addEventListener('click', () => pickAndUpload(runtime, panel))
  panel.querySelector('[data-decoration-help]')?.addEventListener('click', () => openHelpDialog())
  bindPanelClicks(runtime, panel)
  bindCardDrag(panel)
}

/**
 * 卡片拖拽：把 assetId 写进**专用 MIME**（上游 `x-ha-bridge-3d-item`）。
 *
 * 不能复用资源库的 `application/x-homeos-item`：那个通道的有效负载是**类型名**，
 * 画布会拿它去 `itemTypeCatalog` 查尺寸，传 assetId 过去只会建出一件未知类型的空物体。
 */
function bindCardDrag(panel: HTMLElement): void {
  panel.addEventListener('dragstart', (dragEvent) => {
    const target = dragEvent.target
    const card = target instanceof Element ? target.closest<HTMLElement>('[data-place-decoration]') : null
    const assetId = card?.dataset.placeDecoration
    if (!assetId || !dragEvent.dataTransfer) return
    dragEvent.dataTransfer.effectAllowed = 'copy'
    dragEvent.dataTransfer.setData(USER_DECORATION_DRAG_TYPE, assetId)
  })
}

/**
 * 面板内的点击分派（三路，顺序有讲究）。
 *
 * 1. 菜单项「删除模型」→ 确认后删除；
 * 2. 「管理」按钮 → 在该按钮下方打开菜单（**不是**直接删除，删除是菜单里的一项）；
 * 3. 卡片本体 → 放置。
 *
 * 为什么必须先判菜单项：菜单挂在 `document.body`（`position: fixed`），
 * 它的点击会冒泡到 `document` 而不是面板；只有把它挂在面板上才会有这个顺序问题。
 */
function bindPanelClicks(runtime: StudioAppRuntime, panel: HTMLElement): void {
  const menu = document.querySelector<HTMLElement>('[data-decoration-menu]')
  panel.addEventListener('click', (clickEvent) => {
    const target = clickEvent.target
    if (!(target instanceof Element)) return

    const manageButton = target.closest<HTMLElement>('[data-decoration-options]')
    if (manageButton) {
      clickEvent.preventDefault()
      openDecorationMenu(menu, manageButton)
      return
    }
    const placeTarget = target.closest<HTMLElement>('[data-place-decoration]')
    const placeAssetId = placeTarget?.dataset.placeDecoration
    if (placeAssetId) void placeDecoration(runtime, panel, placeAssetId)
  })
  bindMenuOpeners(panel, menu)
  // 点击面板外部关闭菜单（菜单在 body 上，不会自己收起来）。
  document.addEventListener('pointerdown', (pointerDownEvent) => {
    if (!menu || menu.hidden) return
    const pointerTarget = pointerDownEvent.target
    if (!(pointerTarget instanceof Node)) return
    if (
      menu.contains(pointerTarget) ||
      (pointerTarget instanceof Element && pointerTarget.closest('[data-decoration-options]'))
    )
      return
    closeDecorationMenu(menu)
  })
  bindMenuAction(runtime, panel, menu)
}

/**
 * 菜单的两个额外入口：右键与键盘。
 *
 * 抽成独立函数而不是塞进 `bindPanelClicks`：那个函数已在复杂度上限附近，
 * 多两个 `if` 就会顶破基线（实测 gt10 从 0 涨到 1）。
 *
 * - 右键卡片 → 在**指针位置**开菜单（上游 `contextmenu` 处理器同口径）；
 * - `ContextMenu` 键 / `Shift+F10` → 在按钮位置开菜单（纯键盘用户的唯一入口）。
 */
function bindMenuOpeners(panel: HTMLElement, menu: HTMLElement | null): void {
  panel.addEventListener('contextmenu', (contextMenuEvent) => {
    const card = closestDecorativeCard(contextMenuEvent.target)
    if (!card) return
    contextMenuEvent.preventDefault()
    openDecorationMenu(menu, card, { x: contextMenuEvent.clientX, y: contextMenuEvent.clientY })
  })
  panel.addEventListener('keydown', (keyDownEvent) => {
    const isMenuKey = keyDownEvent.key === 'ContextMenu' || (keyDownEvent.shiftKey && keyDownEvent.key === 'F10')
    if (!isMenuKey) return
    const card = closestDecorativeCard(keyDownEvent.target)
    if (!card) return
    keyDownEvent.preventDefault()
    openDecorationMenu(menu, card)
  })
}

/** 事件目标所在的装饰卡片（放置按钮），没有则 `null`。 */
function closestDecorativeCard(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>('[data-place-decoration]') : null
}

/**
 * 打开菜单。
 *
 * 两个入口共用：点「管理」按钮 → 贴在按钮右下；右键卡片 → 贴在**指针位置**
 * （上游同样优先用 `clientX/clientY`，取不到才回落到卡片矩形）。
 * 越界时左移/上翻，保证菜单始终在视口内。
 *
 * `anchor` 只用来取 assetId 与「展开态」标记 —— 右键时触发的是放置按钮，
 * 它没有 `aria-expanded`，下面的 `setAttribute` 会落在它身上（读屏能读出来「已展开」）。
 */
function openDecorationMenu(
  menu: HTMLElement | null,
  anchor: HTMLElement,
  pointerPosition?: { x: number; y: number },
): void {
  if (!menu) return
  const assetId = anchor.dataset.placeDecoration || anchor.dataset.decorationOptions
  if (!assetId) return
  menu.dataset.currentAssetId = assetId
  menu.hidden = false
  anchor.setAttribute('aria-expanded', 'true')
  const anchorRect = anchor.getBoundingClientRect()
  const menuRect = menu.getBoundingClientRect()
  const margin = 8
  const wantedLeft = pointerPosition ? pointerPosition.x : anchorRect.left
  const wantedTop = pointerPosition ? pointerPosition.y : anchorRect.bottom + 4
  menu.style.left = `${Math.max(margin, Math.min(wantedLeft, window.innerWidth - menuRect.width - margin))}px`
  menu.style.top = `${Math.max(margin, Math.min(wantedTop, window.innerHeight - menuRect.height - margin))}px`
  menu.querySelector<HTMLElement>('[data-delete-decoration]')?.focus({ preventScroll: true })
}

/**
 * 关闭菜单并复位展开态。
 *
 * 展开态可能落在两个元素上：点「管理」时是管理按钮，右键/键盘时是放置按钮
 * （`openDecorationMenu` 把标记写在传入的 anchor 上），所以两个选择器都要复位。
 */
function closeDecorationMenu(menu: HTMLElement | null, { restoreFocus = false } = {}): void {
  if (!menu || menu.hidden) return
  const assetId = menu.dataset.currentAssetId
  menu.hidden = true
  delete menu.dataset.currentAssetId
  resetCardExpandedState(assetId, restoreFocus)
}

/** 复位卡片上所有展开态标记；`restoreFocus` 时把焦点还给对应按钮。 */
function resetCardExpandedState(assetId: string | undefined, restoreFocus: boolean): void {
  const buttons = document.querySelectorAll<HTMLElement>('[data-decoration-options], [data-place-decoration]')
  for (const button of buttons) {
    const buttonAssetId = button.dataset.decorationOptions || button.dataset.placeDecoration
    if (assetId && buttonAssetId !== assetId) continue
    button.setAttribute('aria-expanded', 'false')
    if (restoreFocus && assetId === buttonAssetId) button.focus({ preventScroll: true })
  }
}

/** 菜单项动作（只绑一次）。 */
function bindMenuAction(runtime: StudioAppRuntime, panel: HTMLElement, menu: HTMLElement | null): void {
  if (!menu || menu.dataset.decorationMenuBound === '1') return
  menu.dataset.decorationMenuBound = '1'
  menu.addEventListener('click', (clickEvent) => {
    const target = clickEvent.target
    const deleteItem = target instanceof Element ? target.closest<HTMLElement>('[data-delete-decoration]') : null
    if (!deleteItem) return
    const assetId = menu.dataset.currentAssetId
    closeDecorationMenu(menu)
    if (assetId) void confirmAndRemove(runtime, assetId, panel)
  })
  document.addEventListener('keydown', (keyEvent) => {
    if (keyEvent.key !== 'Escape' || menu.hidden) return
    keyEvent.preventDefault()
    keyEvent.stopPropagation()
    closeDecorationMenu(menu, { restoreFocus: true })
  })
}

/**
 * 卡片拖拽：把 assetId 写进**专用 MIME**（上游 `x-ha-bridge-3d-item`）。
 *
 * 不能复用资源库的 `application/x-homeos-item`：那个通道的有效负载是**类型名**，
 * 画布会拿它去 `itemTypeCatalog` 查尺寸，传 assetId 过去只会建出一件未知类型的空物体。
 */
/**
 * 该模型是否仍被本项目的户型引用（0.8.9 上游 `deleteBlockReason`）。
 *
 * 返回引用处数；> 0 时**不允许删除**。放任删除的后果：场景里还留着 `assetId`，
 * 字节已经没了 → 那件装饰在 3D 里直接消失，只能靠用户自己发现（表现为 404）。
 *
 * 只看**当前项目**的楼层：跨项目引用在别的项目里由后端 409 兜住（前端拿不到那些文档）。
 */
export function decorationUsageCount(runtime: StudioAppRuntime, assetId: string): number {
  const floors = runtime.appCtx.studioProject?.floors || []
  let count = 0
  for (const floor of floors) {
    for (const item of floor?.scene?.items || []) {
      // 双键：0.8.9 上游存 `modelAssetId`（带 `model:` 前缀）。
      const itemAssetId = String(item?.assetId || item?.modelAssetId || '')
        .replace(/^model:/i, '')
        .toLowerCase()
      if (item?.type === 'user-decoration' && itemAssetId === assetId) count += 1
    }
  }
  return count
}

async function confirmAndRemove(runtime: StudioAppRuntime, assetId: string, panel: HTMLElement): Promise<void> {
  const name = panelState.library?.models.find((entry) => entry.assetId === assetId)?.name || '这个模型'
  // 先判引用再弹确认框（上游同样顺序）：让用户看到「为什么不能删」，
  // 而不是先确认再报错——那会让人以为删除失败是网络问题。
  const usedCount = decorationUsageCount(runtime, assetId)
  if (usedCount > 0) {
    writeStatus(panel, `「${name}」已被户型引用 ${usedCount} 处，请先删除这些物件再删模型。`, true)
    return
  }
  const confirmed = await shellConfirm({
    title: '删除装饰模型',
    message: `删除模型“${name}”？`,
    detail: '删除后无法恢复；已经放进户型的物件会显示为丢失状态。',
    confirmLabel: '删除',
    cancelLabel: '取消',
    tone: 'danger',
  })
  if (!confirmed) return
  writeStatus(panel, '正在删除模型…')
  await removeModel(assetId, panel)
}

/**
 * 把一件装饰放到户型里（0.8.9 上游行为：「已上传，选择模型即可放置」）。
 *
 * 三步的顺序是有意的：
 * 1. **先注册模型 URL** —— 建场景时 `resolveModelTypeForItem` 要靠这条登记把
 *    `user-decoration` 映射到 `model:<assetId>`，没注册就会得到一件看不见的物品；
 * 2. 再建物品记录（尺寸用保守占位，真实包围盒由加载后的模型写回）；
 * 3. 最后落到当前视图中心，失败也要把状态行说清楚。
 */
async function placeDecoration(runtime: StudioAppRuntime, panel: HTMLElement, assetId: string): Promise<void> {
  const model = panelState.library?.models.find((entry) => entry.assetId === assetId)
  if (!model) {
    writeStatus(panel, '这个装饰模型已不在库中，请刷新后重试。')
    return
  }
  writeStatus(panel, '正在加载装饰模型…')
  try {
    runtime.placeUserDecoration?.(model)
    writeStatus(panel, '已放置装饰。')
  } catch (error) {
    writeStatus(panel, decorationErrorMessage(error, '放置失败，请稍后重试。'), true)
  }
}

async function removeModel(assetId: string, panel: HTMLElement): Promise<void> {
  try {
    await deleteStudioModel(assetId)
    // 名字表也要清：不清的话，同 assetId 若被重新上传，拖拽会带旧名。
    forgetDecorationModelName(assetId)
    invalidate()
    writeStatus(panel, '已删除该装饰模型。')
    await reloadInto(panel)
  } catch (error) {
    writeStatus(panel, decorationErrorMessage(error, '删除失败，请稍后重试。'), true)
  }
}

async function reloadInto(panel: HTMLElement): Promise<void> {
  try {
    const response = await listStudioModels()
    panelState.library = normalizeDecorationLibrary(response.data)
    renderCards(panel, panelState.library)
  } catch (error) {
    writeStatus(panel, decorationErrorMessage(error, '装饰模型读取失败，请稍后重试。'))
  }
}

/**
 * 打开「上传说明」并填入额度行。
 *
 * 额度行在库里没有数据时不显示（而不是显示 0）：还没读到上限时写「0 件」会让人以为
 * 一件都不能传。
 */
function openHelpDialog(): void {
  const dialog = document.getElementById('decoration-upload-dialog') as HTMLDialogElement | null
  if (!dialog) return
  const limits = document.getElementById('decoration-limits')
  const library = panelState.library
  if (limits) {
    const text = library ? decorationLimitsText(library) : ''
    limits.textContent = text
    limits.hidden = !text
  }
  if (typeof dialog.showModal === 'function') dialog.showModal()
  else dialog.open = true
}

/**
 * 额度行的正文（无上限时返回空串 → 整行隐藏）。
 *
 * 逐条对齐上游「上传说明」的文案与分组：
 *
 * ```
 * 单个文件最多 12 MiB
 * 三角面最多 60,000 个 · 网格部件最多 4,096 个
 * 节点（含分组）最多 2,048 个
 * 最多 32 张贴图，单张长边最多 2,048 像素
 * 贴图合计最多 16,777,216 像素
 * ```
 *
 * 少列一条的后果是「上传失败但不知道为什么」—— 用户只看到「模型不合规」，
 * 而真正撞的是某条没写出来的限制。数字用千分位（与上游 `toLocaleString` 一致），
 * 六位数以上不加分隔很难一眼读出量级。
 */
export function decorationLimitsText(library: DecorationLibraryState): string {
  const lines = [
    singleFileLine(library),
    geometryLine(library.uploadLimits),
    nodesLine(library.uploadLimits),
    textureLine(library.uploadLimits),
    texturePixelsLine(library.uploadLimits),
    libraryUsageLine(library),
  ]
  // 空行直接跳过：服务端少声明某一项时，不该留一条空白（`white-space: pre-line` 会把它显示成空隙）。
  return lines.filter((line) => line.length > 0).join('\n')
}

/** 「单个文件最多 N MiB」；两个字段都缺省时返回空串。 */
function singleFileLine(library: DecorationLibraryState): string {
  const maxUploadBytes = library.maxUploadBytes > 0 ? library.maxUploadBytes : library.maxBytes
  return maxUploadBytes > 0 ? `单个文件最多 ${Math.round(maxUploadBytes / (1024 * 1024))} MiB` : ''
}

/** 「三角面最多 N 个 · 网格部件最多 M 个」（上游把这两项合成一句）。 */
function geometryLine(limits: DecorationLibraryState['uploadLimits']): string {
  const parts: string[] = []
  if (limits.triangles > 0) parts.push(`三角面最多 ${formatCount(limits.triangles)} 个`)
  if (limits.meshParts > 0) parts.push(`网格部件最多 ${formatCount(limits.meshParts)} 个`)
  return parts.join(' · ')
}

/** 「节点（含分组）最多 N 个」。 */
function nodesLine(limits: DecorationLibraryState['uploadLimits']): string {
  return limits.nodes > 0 ? `节点（含分组）最多 ${formatCount(limits.nodes)} 个` : ''
}

/** 「最多 N 张贴图，单张长边最多 M 像素」。 */
function textureLine(limits: DecorationLibraryState['uploadLimits']): string {
  const parts: string[] = []
  if (limits.images > 0) parts.push(`最多 ${formatCount(limits.images)} 张贴图`)
  if (limits.imageSide > 0) parts.push(`单张长边最多 ${formatCount(limits.imageSide)} 像素`)
  return parts.join('，')
}

/** 「贴图合计最多 N 像素」。 */
function texturePixelsLine(limits: DecorationLibraryState['uploadLimits']): string {
  return limits.imagePixels > 0 ? `贴图合计最多 ${formatCount(limits.imagePixels)} 像素` : ''
}

/**
 * 库级用量（「最多 N 件；合计不超过 M MB。当前 X 件，占用 Y。」）。
 *
 * 与上面几行不是同一问题：那些说「单个模型能多大」，这条说「还能传几个」。
 */
function libraryUsageLine(library: DecorationLibraryState): string {
  const limits: string[] = []
  if (library.maxModels > 0) limits.push(`最多 ${library.maxModels} 件`)
  if (library.maxBytes > 0) limits.push(`合计不超过 ${Math.round(library.maxBytes / (1024 * 1024))} MB`)
  if (limits.length === 0) return ''
  return `${limits.join('；')}。当前 ${library.models.length} 件，占用 ${decorationSizeLabel(library.totalBytes)}。`
}

/** 千分位（与上游 `toLocaleString('zh-CN')` 同口径）。 */
function formatCount(value: number): string {
  return Math.round(value).toLocaleString('zh-CN')
}

/**
 * 选文件并上传。
 *
 * 用临时 `<input type=file>` 而不是常驻隐藏 input：常驻 input 在切换分类后仍保留
 * 上次的文件，用户再次点上传会「没有任何反应」（change 不触发）。
 */
function pickAndUpload(runtime: StudioAppRuntime, panel: HTMLElement): void {
  const library = panelState.library
  if (library && decorationUploadBlocked(library)) {
    writeStatus(panel, '装饰模型数量已达上限，请先删除不用的模型。')
    return
  }
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.glb,model/gltf-binary'
  input.hidden = true
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    input.remove()
    if (file) void uploadFile(runtime, panel, file)
  })
  document.body.appendChild(input)
  input.click()
}

async function uploadFile(runtime: StudioAppRuntime, panel: HTMLElement, file: File): Promise<void> {
  const library = panelState.library ?? normalizeDecorationLibrary({})
  const issue = decorationUploadIssue(file, { ...library, modelCount: library.models.length })
  if (issue) {
    writeStatus(panel, issue, true)
    return
  }
  writeStatus(panel, '正在上传并校验模型…')
  try {
    const name = file.name.replace(/\.glb$/i, '').slice(0, DECORATION_NAME_LIMIT)
    await uploadStudioModel(name, file)
    invalidate()
    await reloadInto(panel)
    runtime.showToast?.('装饰模型已上传。', 'success')
  } catch (error) {
    writeStatus(panel, decorationErrorMessage(error, '上传失败，请稍后重试。'), true)
  }
}

function renderCards(panel: HTMLElement, library: DecorationLibraryState): void {
  // 先把名字登记进 assetId → name 表：拖拽放置只有 assetId，靠它补 name。
  registerDecorationModelNames(library.models)
  const list = panel.querySelector<HTMLElement>(LIST_SELECTOR)
  if (!list) return
  // 空库不插占位卡片：上游只用状态行给引导（「上传一个 GLB 后，即可将它放进户型。」）。
  // 这里再放一段占位文案等于同一句话出现两次。
  const cards = library.models.map((model) => createCard(model))
  list.replaceChildren(...cards)
  // 名称溢出时悬停滚动；`prefers-reduced-motion` 下不动（见模块内说明）。
  installAssetNameScroll(cards.map((card) => card.querySelector<HTMLElement>('.asset-card')).filter(isElement))
  writeStatus(panel, decorationStatusText(library))
  const uploadButton = panel.querySelector<HTMLButtonElement>(UPLOAD_SELECTOR)
  if (uploadButton) uploadButton.disabled = decorationUploadBlocked(library)
}

/**
 * 一张装饰卡片（结构对齐上游）。
 *
 * ```html
 * <div class="decoration-card">
 *   <button class="asset-card" data-place-decoration=… draggable aria-haspopup="menu">名称</button>
 *   <button class="decoration-card-options" data-decoration-options=… >管理</button>
 * </div>
 * ```
 *
 * 三个刻意与上游不同的地方（都在注释里说明原因，避免后来者「顺手改回去」）：
 * 1. **不用 `<span class="decoration-remove">×</span>`**：那个假按钮既不可聚焦也没有
 *    可访问名，键盘与读屏都用不了；
 * 2. 「管理」是真实 `<button>`，`aria-label` 带模型名（多个同名模型时读屏能区分）；
 * 3. 大小写在 `title` 里而不是卡片正文：卡片正文只有名称，与上游一致（列表要能扫读）。
 */
function createCard(model: DecorationModel): HTMLElement {
  const card = document.createElement('div')
  card.className = 'decoration-card'

  const placeButton = document.createElement('button')
  placeButton.type = 'button'
  placeButton.className = 'asset-card'
  placeButton.draggable = true
  placeButton.dataset.placeDecoration = model.assetId
  // 搜索框按模型名过滤（与上游 `q(name).includes(搜索词)` 同口径）。
  placeButton.dataset.decorationName = model.name
  placeButton.setAttribute('aria-haspopup', 'menu')
  placeButton.setAttribute('aria-expanded', 'false')
  placeButton.title = `${model.name} · ${decorationSizeLabel(model.bytes)}`
  placeButton.setAttribute('aria-label', `放置模型 ${model.name}`)
  // 名称是**滚动窗口**（上游 `asset-name-window` / `asset-name-text`）：
  // 外层限宽 overflow:hidden，内层 max-content 单行 —— 长名悬停时横向滚动，
  // 而不是被省略号吃掉（「3D打印机-lite」截成「3D…」等于没法认）。
  const nameWindow = document.createElement('span')
  nameWindow.className = 'asset-name-window'
  const nameText = document.createElement('b')
  nameText.className = 'asset-name-text'
  nameText.textContent = model.name
  nameWindow.append(nameText)
  placeButton.append(nameWindow)

  const manageButton = document.createElement('button')
  manageButton.type = 'button'
  manageButton.className = 'decoration-card-options'
  manageButton.dataset.decorationOptions = model.assetId
  manageButton.textContent = '管理'
  manageButton.setAttribute('aria-label', `管理模型 ${model.name}`)
  manageButton.setAttribute('aria-haspopup', 'menu')
  manageButton.setAttribute('aria-expanded', 'false')

  card.append(placeButton, manageButton)
  return card
}

/**
 * 写状态行。`isError` 加 `.error` 类（上游同一个类名）：
 * 失败必须与「正在读取…」视觉可分，否则用户会以为还在加载。
 */
function writeStatus(panel: HTMLElement, text: string, isError = false): void {
  const status = panel.querySelector<HTMLElement>(STATUS_SELECTOR)
  if (!status) return
  status.textContent = text
  status.classList.toggle('error', isError)
}

/** 测试钩子：重置模块状态（避免用例之间互相污染）。 */
export function resetDecorationPanelForTest(): void {
  panelState.library = null
  panelState.bound = false
  panelState.loading = false
}

/** `querySelector` 结果收窄（`.map` 之后过滤掉 null）。 */
function isElement(value: HTMLElement | null): value is HTMLElement {
  return value !== null
}

/**
 * 装饰库工厂（0.8.9 `createDecorationLibrary`）。
 *
 * 本项目把「面板与交互」放在本模块、「网络」放在 `services/api/studio-models.ts`，
 * 所以这里只把已经导出的纯助手收口成上游形状（宿主若按上游写法调用也能拿到同一套行为）。
 */
export function createDecorationLibrary() {
  return {
    sizeLabel: decorationSizeLabel,
    statusText: decorationStatusText,
    uploadBlocked: decorationUploadBlocked,
    limitsText: decorationLimitsText,
  }
}

/**
 * 装饰库文案：**唯一来源**在 `authoring/items/studio-user-decorations.ts`。
 * 这里重导出而不是再定义一份 —— 两份必然漂移（附录十七的教训）。
 */
export { DECORATION_COPY } from '../../items/studio-user-decorations'
