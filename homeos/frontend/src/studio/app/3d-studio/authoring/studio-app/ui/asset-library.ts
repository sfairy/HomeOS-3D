import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { courtyardToolAllowed as courtyardToolAllowed2 } from '../../../plan/courtyard-plan'
import { isCourtyardGate as isCourtyardGate2 } from '../../../plan/courtyard-drawing'
import { lampItemTypeSet } from '../../items/item-catalog'
import { libraryCardVisible, normalizeLibraryCategory } from '../../items/studio-model-library'
import type { StudioControlElement } from '../../types/studio-app-types'

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
  runtime.assetSearchEmptyElement &&
    (runtime.assetSearchEmptyElement.hidden = !librarySearchText || assetMatchCount > 0)
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
  runtime.appCtx.selectedItem && !runtime.isSelectionAllowed(runtime.appCtx.selectedItem) && runtime.refreshSelection(),
    runtime.appCtx.selectedItems.length && runtime.refreshSelection(),
    runtime.selectStudioTool('select'),
    runtime.syncLightGroupList(),
    runtime.refreshStudioUi(),
    runtime.refreshStudioView(),
    ao7 !== runtime.getPreviewScopeSelection() && runtime.setPreviewScope(ao7)
}
