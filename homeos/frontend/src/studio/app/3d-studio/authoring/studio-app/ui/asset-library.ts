import { materialSlotGroupOf } from '../../../materials/studio-material-slot-groups'
import { type StudioAppContext } from '../studio-app-context'
import { type StudioAppRuntime } from '../runtime/studio-app-runtime'
import { courtyardToolAllowed as courtyardToolAllowed2 } from '../../../plan/courtyard-plan'
import { isCourtyardGate as isCourtyardGate2 } from '../../../plan/courtyard-drawing'
import { lampItemTypeSet } from '../../items/item-catalog'
import { libraryCardVisible, normalizeLibraryCategory } from '../../items/studio-model-library'
import { refreshDecorationLibrary } from './decoration-library'
import { type StudioControlElement } from '../../types/studio-app-types'

/**
 * 素材库页签模式的只读镜像（0.8.7 的 `vo`）。
 *
 * 为什么单独一个文件：3D 叠层要按「选中灯具 / 已放置页签 / 灯光分类」决定画不画灯位圆点
 * （0.8.7 `createEditorLightGizmo` 调用方的门控），而页签状态活在 `placed-items-wiring` 的
 * 闭包里。若直接从那边导出读取口，`editor-light-toolbar-options → placed-items-wiring →
 * editor-3d-wiring → editor-light-toolbar-options` 就成环；这里只放一个 WeakMap，
 * 双方都只依赖它，环自然消失。
 *
 * 用 WeakMap 而不是往 `appCtx` 塞字段：引擎的状态形状不为一个只读判定而改动。
 */
export type LibraryMode = 'assets' | 'placed'

const modes = new WeakMap<object, LibraryMode>()

/** 当前素材库页签；未安装面板（嵌入舞台等）时按默认「素材库」算。 */
export function libraryModeOf(appCtx: object): LibraryMode {
  return modes.get(appCtx) ?? 'assets'
}

/** 页签模式变了才写镜像：让叠层下一次重投影读到的就是新值。 */
export function rememberLibraryMode(appCtx: object, mode: LibraryMode): void {
  modes.set(appCtx, mode)
}

/**
 * 卡片名称的**横向滚动窗口**（0.8.9 `installLibraryNameScroll`）。
 *
 * 为什么不是省略号：资产卡片的宽度只有一百多像素，中文模型名普遍超过它。
 * 截断让用户无法区分「3D打印机-lite」与「3D打印机」，而卡片又没法加宽
 * （两列布局是面板宽度决定的）。上游的做法是**悬停时横向滚动**：
 *
 * - 名称容器 `overflow: hidden`，内层 `width: max-content` 单行不换行；
 * - 悬停/聚焦时若内容溢出，按溢出量播放一段往复动画（首尾各有停顿）；
 * - 离开/失焦立即取消，避免多个卡片同时滚动。
 *
 * 无障碍：卡片的 `title` 与 `aria-label` 都写完整名称 —— 滚动只是视觉补偿，
 * 读屏与提示框始终拿到全名。
 */

/** 单次往返的最短时长（毫秒，上游 `max(1200, overflow*14+600)`）。 */
const SCROLL_MIN_MS = 1_200
/** 每像素溢出对应的额外时长（毫秒/像素，上游 `overflow * 14`）。 */
const SCROLL_PER_PIXEL_MS = 14
/** 动画里首尾停顿的固定开销（毫秒）。 */
const SCROLL_PAUSE_MS = 600

type AnimationHandle = { cancel: () => void }

/**
 * 给一批卡片装上滚动窗口。
 *
 * 幂等：已经装过的卡片（`data-name-scroll` 标记）会被跳过 —— 列表每次刷新都重建卡片，
 * 但局部刷新时可能重复调用，重复绑监听会让滚动速度成倍。
 */
export function installAssetNameScroll(
  cards: readonly HTMLElement[],
  options: { reducedMotion?: () => boolean } = {},
): void {
  const prefersReduced = options.reducedMotion ?? defaultReducedMotion
  const runningByCard = new Map<HTMLElement, AnimationHandle>()

  const stop = (card: HTMLElement) => {
    runningByCard.get(card)?.cancel()
    runningByCard.delete(card)
  }

  for (const card of cards) {
    const windowElement = card.querySelector<HTMLElement>('.asset-name-window')
    const textElement = card.querySelector<HTMLElement>('.asset-name-text')
    if (!windowElement || !textElement || card.dataset.nameScroll === '1') continue
    card.dataset.nameScroll = '1'

    const start = () => {
      stop(card)
      // 尊重「减少动态效果」：偏好开启时完全不动，用户仍可通过 title 看全名。
      if (prefersReduced() || card.hidden) return
      const overflow = textElement.scrollWidth - windowElement.clientWidth
      // 不溢出就没必要动；`<= 1` 的容差吸收亚像素取整。
      if (overflow <= 1 || typeof textElement.animate !== 'function') return
      runningByCard.set(
        card,
        textElement.animate(
          [
            { transform: 'translateX(0)', offset: 0 },
            { transform: 'translateX(0)', offset: 0.08 },
            { transform: `translateX(-${overflow}px)`, offset: 0.74 },
            { transform: `translateX(-${overflow}px)`, offset: 0.87 },
            { transform: 'translateX(0)', offset: 1 },
          ],
          {
            duration: Math.max(SCROLL_MIN_MS, overflow * SCROLL_PER_PIXEL_MS + SCROLL_PAUSE_MS),
            iterations: Infinity,
            easing: 'ease-in-out',
          },
        ) as unknown as AnimationHandle,
      )
    }

    card.addEventListener('pointerenter', start)
    card.addEventListener('focus', start)
    card.addEventListener('pointerleave', () => stop(card))
    card.addEventListener('blur', () => stop(card))
  }
}

function defaultReducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}


export function materialSlotGroupView(appCtx: StudioAppContext, materialSlotEntries: any) {
  const groupsInOrder: any = []
  for (const slotEntry of materialSlotEntries) {
    const slotGroup = materialSlotGroupOf(slotEntry)
    if (!groupsInOrder.some((groupEntry: any) => groupEntry.id === slotGroup.id))
      groupsInOrder.push({ id: slotGroup.id, label: slotGroup.label })
  }
  const isFilterable = groupsInOrder.length > 1,
    activeGroupId =
      isFilterable && groupsInOrder.some((groupEntry: any) => groupEntry.id === appCtx.materialSlotGroupFilter)
        ? appCtx.materialSlotGroupFilter
        : ''
  return {
    groups: groupsInOrder,
    isFilterable: isFilterable,
    activeGroupId: activeGroupId,
    visibleSlotEntries: activeGroupId
      ? materialSlotEntries.filter((slotEntry: any) => materialSlotGroupOf(slotEntry).id === activeGroupId)
      : materialSlotEntries,
  }
}


/**
 * 显示/隐藏「我的装饰」面板，并在进入时刷新列表。
 *
 * 面板常驻标记（`#decoration-library`）只切 `hidden`：上传按钮与删除菜单都按固定选择器
 * 绑定过一次，重建节点会让绑定失效。
 */
function syncDecorationPanel(runtime: StudioAppRuntime, selectedCategory: string): void {
  const panel = document.getElementById('decoration-library')
  if (!panel) return
  const isDecoration = selectedCategory === 'decoration'
  panel.hidden = !isDecoration
  if (isDecoration) runtime.assetGridElement.hidden = true
  if (isDecoration) void refreshDecorationLibrary(runtime)
}

/** 一个分组标题辖下的模型卡：从标题往后数，直到下一个分组标题为止。 */
function assetGroupCards(assetGroupHeading: StudioControlElement): StudioControlElement[] {
  const groupCards: StudioControlElement[] = []
  for (
    let nextElementSibling = assetGroupHeading.nextElementSibling as StudioControlElement | null;
    nextElementSibling && !nextElementSibling.hasAttribute('data-asset-heading-category');
    nextElementSibling = nextElementSibling.nextElementSibling as StudioControlElement | null
  )
    nextElementSibling.hasAttribute('data-item-type') && groupCards.push(nextElementSibling)
  return groupCards
}

/**
 * 0.8.7 的模型卡分组**没有折叠**：标题只是分类小标签，卡片始终全部展开
 * （上游 HTML 里既没有 `data-asset-expanded`，也没有对应的点击处理）。
 *
 * 这里保留一个空实现，是为了让 `setAssetCategory` 的调用点不必改动，
 * 同时明确「不要再引入手风琴」——曾经做过一版默认全收起，结果素材库看起来是空的。
 */
function resetAssetGroupExpansion(_runtime: StudioAppRuntime): void {
  /* 上游无折叠态，无需重置 */
}

export function filterAssetList(runtime: StudioAppRuntime) {
  const librarySearchText = (runtime.assetSearchInput?.value || '').trim().toLocaleLowerCase().replace(/\s+/g, ''),
    activeLibraryCategory = normalizeLibraryCategory(runtime.appCtx.activeLibraryCategory),
    isLibrarySearching = librarySearchText.length > 0
  runtime.libraryNameScroll.cancelAll()
  let assetMatchCount = 0
  for (const assetToolbarEntryButton of runtime.itemTypeButtons) {
    // 「灯光」大类单独一行（`#light-asset-row`），卡片上不带 `data-library-*`，只能按类型集合判；
    // 其余三个大类（home / appliance / courtyard）一律交给模型库的 DOM 判定，避免两处各写一套。
    const itemType = assetToolbarEntryButton.dataset.itemType,
      isAssetCardVisible =
        activeLibraryCategory === 'light'
          ? lampItemTypeSet.has(itemType!)
          : libraryCardVisible(assetToolbarEntryButton, activeLibraryCategory, null, librarySearchText) &&
            // 庭院门是画在平面上的构件，不进模型卡列表。
            (activeLibraryCategory !== 'courtyard' || !isCourtyardGate2({ type: itemType }))
    // 命中态另记一份：`hidden` 还会被分组收叠改写，分组计数只能看分类 / 搜索命中。
    assetToolbarEntryButton.dataset.assetMatch = isAssetCardVisible ? '1' : '0'
    assetToolbarEntryButton.hidden = !isAssetCardVisible
    isAssetCardVisible && (assetMatchCount += 1)
  }
  runtime.assetGridElement?.classList.toggle('asset-grid-searching', isLibrarySearching)
  for (const assetGroupHeading of runtime.assetHeadingCategoryControls) {
    const groupCards = assetGroupCards(assetGroupHeading),
      groupMatchCount = groupCards.filter((groupCard) => groupCard.dataset.assetMatch === '1').length
    // 标题只是分类小标签：不折叠、不显示数量徽标（上游没有这两者）。
    assetGroupHeading.hidden =
      assetGroupHeading.dataset.assetHeadingCategory !== activeLibraryCategory || groupMatchCount === 0
    for (const groupCard of groupCards) groupCard.hidden = groupCard.dataset.assetMatch !== '1'
  }
  // 「我的装饰」是动态列表（卡片由 JS 建），不走上面的静态卡片循环，
  // 所以搜索必须在这里额外把装饰也算进「是否有匹配」——否则搜不到时不会提示。
  const decorationMatchCount = filterDecorationCards(librarySearchText)
  runtime.assetSearchEmptyElement &&
    (runtime.assetSearchEmptyElement.hidden = !librarySearchText || assetMatchCount + decorationMatchCount > 0)
}

/**
 * 按搜索词过滤装饰卡片，返回命中数。
 *
 * 装饰列表每次刷新重建卡片，所以这里直接对现有 DOM 切片 —— 不重建、不打乱顺序，
 * 搜索框每敲一个字符都重建一次卡片的代价远高于切 `hidden`。
 */
function filterDecorationCards(searchText: string): number {
  const cards = [...document.querySelectorAll<HTMLElement>('#decoration-library [data-place-decoration]')]
  if (cards.length === 0) return 0
  let matches = 0
  for (const card of cards) {
    const cardName = (card.dataset.decorationName || card.textContent || '').toLocaleLowerCase().replace(/\s+/g, '')
    const matched = searchText.length === 0 || cardName.includes(searchText)
    const wrapper = card.closest<HTMLElement>('.decoration-card')
    if (wrapper) wrapper.hidden = !matched
    matched && (matches += 1)
  }
  return matches
}

/**
 * 兼容入口：0.8.7 的分组标题不可点击（没有手风琴），保留导出是为了不打断既有调用点。
 * 若将来要恢复折叠，请先把 `3d-studio.html` 的对照搭起来，确认用户能接受「默认收起」。
 */
export function toggleAssetGroup(_runtime: StudioAppRuntime, _assetGroupHeading: StudioControlElement): void {
  /* 上游无折叠 */
}

export function setAssetCategory(runtime: StudioAppRuntime, assetCategory: any) {
  // 合法大类只在模型库里定义一次：非法值回落 `home`，卡片过滤与按钮态都用收窄后的值。
  const selectedAssetCategory = normalizeLibraryCategory(assetCategory),
    ao7 = runtime.getPreviewScopeSelection()
  runtime.hideLightGroupActionMenu(), (runtime.appCtx.activeLibraryCategory = selectedAssetCategory)
  for (const assetCategoryButton of runtime.assetCategoryButtons) {
    const isActiveAssetCategory = assetCategoryButton.dataset.assetCategory === selectedAssetCategory
    assetCategoryButton.classList.toggle('active', isActiveAssetCategory),
      assetCategoryButton.setAttribute('aria-pressed', String(isActiveAssetCategory))
  }
  // 切大类回到「全部收起」的初始态：不同大类的同名分区（如宠物用品）不会带着上一个大类的展开态。
  resetAssetGroupExpansion(runtime), runtime.filterAssetList()
  for (const setAssetCategoryToolButton of runtime.toolButtons)
    setAssetCategoryToolButton.disabled =
      selectedAssetCategory === 'courtyard' && !courtyardToolAllowed2(setAssetCategoryToolButton.dataset.tool)
  for (const toolControlEntry of [
    'global-wall-height',
    'global-wall-thickness',
    'global-wall-opacity',
    'toggle-floor-edge',
  ]) {
    const elementById = document.getElementById(toolControlEntry) as StudioControlElement | null
    elementById && (elementById.disabled = selectedAssetCategory === 'courtyard')
  }
  ;(runtime.assetGridElement.hidden = selectedAssetCategory === 'light'),
    (runtime.lightAssetRowElement.hidden = selectedAssetCategory !== 'light')
  // 0.8.9「我的装饰」：动态大类。隐藏静态栅格、显示面板，并在进入时刷新列表
  // （列表走服务端，切分类就是最自然的刷新时机，也让上传/删除后的改动可见）。
  syncDecorationPanel(runtime, selectedAssetCategory)
  runtime.appCtx.selectedItem && !runtime.isSelectionAllowed(runtime.appCtx.selectedItem) && runtime.refreshSelection(),
    runtime.appCtx.selectedItems.length && runtime.refreshSelection(),
    runtime.selectStudioTool('select'),
    runtime.syncLightGroupList(),
    runtime.refreshStudioUi(),
    runtime.refreshStudioView(),
    ao7 !== runtime.getPreviewScopeSelection() && runtime.setPreviewScope(ao7)
}
