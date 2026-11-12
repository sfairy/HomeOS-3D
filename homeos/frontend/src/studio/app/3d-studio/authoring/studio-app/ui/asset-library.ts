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
 * 分组展开态只记在标题的 `data-asset-expanded` 上：DOM 即唯一状态源，
 * 不额外开运行时字段。初始标记里没有这个属性，因此默认全部收起。
 */
function resetAssetGroupExpansion(runtime: StudioAppRuntime) {
  for (const assetGroupHeading of runtime.assetHeadingCategoryControls)
    assetGroupHeading.dataset.assetExpanded = 'false'
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
      groupMatchCount = groupCards.filter((groupCard) => groupCard.dataset.assetMatch === '1').length,
      // 搜索是扁平结果视图：命中分组一律展开，否则结果会被收叠挡住；非搜索态才看手风琴标记。
      isGroupExpanded = isLibrarySearching || assetGroupHeading.dataset.assetExpanded === 'true'
    ;(assetGroupHeading.dataset.assetCount = String(groupMatchCount)),
      assetGroupHeading.classList.toggle('is-collapsed', !isGroupExpanded),
      assetGroupHeading.setAttribute('aria-expanded', String(isGroupExpanded))
    assetGroupHeading.hidden =
      assetGroupHeading.dataset.assetHeadingCategory !== activeLibraryCategory || groupMatchCount === 0
    if (!isGroupExpanded) for (const groupCard of groupCards) groupCard.hidden = true
  }
  runtime.assetSearchEmptyElement &&
    (runtime.assetSearchEmptyElement.hidden = !librarySearchText || assetMatchCount > 0)
}

/**
 * 手风琴收叠：点标题即切换该组，并把同大类其余分组一律收起，
 * 因此任意时刻最多只有一个分组展开；展开中的那组再点一次会收起（全部收起也允许）。
 */
export function toggleAssetGroup(runtime: StudioAppRuntime, assetGroupHeading: StudioControlElement) {
  // 搜索态分组强制展开，此时标题不参与收叠。
  if ((runtime.assetSearchInput?.value || '').trim()) return
  const isExpanding = assetGroupHeading.dataset.assetExpanded !== 'true'
  for (const otherAssetGroupHeading of runtime.assetHeadingCategoryControls)
    otherAssetGroupHeading.dataset.assetExpanded = String(isExpanding && otherAssetGroupHeading === assetGroupHeading)
  runtime.filterAssetList()
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
