export const EDITOR_PICKER_PAGE_SIZES = Object.freeze({
  icon: 84,
  entity: 33,
  asset: 16,
});
export function editorEntityPickerInitialPage(totalCount, hasAddTile) {
  return totalCount < 0
    ? 1
    : Math.floor((totalCount + (hasAddTile ? 1 : 0)) / EDITOR_PICKER_PAGE_SIZES.entity) + 1;
}
export function editorEntityPickerPage(items, pageNumber, reservesAddTile) {
  const pageSize = EDITOR_PICKER_PAGE_SIZES.entity,
    leadingOffset = reservesAddTile ? 1 : 0,
    startIndex = Math.max(0, (pageNumber - 1) * pageSize - leadingOffset),
    sliceCount = pageSize - (pageNumber === 1 ? leadingOffset : 0);
  return {
    items: items.slice(startIndex, startIndex + sliceCount),
    total: items.length + leadingOffset,
  };
}
