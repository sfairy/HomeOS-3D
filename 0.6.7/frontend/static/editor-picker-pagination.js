export const EDITOR_PICKER_PAGE_SIZES = Object.freeze({
  icon: 84,
  entity: 33,
  asset: 16,
});
export function editorEntityPickerInitialPage(t, e) {
  return t < 0 ? 1 : Math.floor((t + (e ? 1 : 0)) / EDITOR_PICKER_PAGE_SIZES.entity) + 1;
}
export function editorEntityPickerPage(t, e, n) {
  const r = EDITOR_PICKER_PAGE_SIZES.entity,
    i = n ? 1 : 0,
    o = Math.max(0, (e - 1) * r - i),
    s = r - (e === 1 ? i : 0);
  return {
    items: t.slice(o, o + s),
    total: t.length + i,
  };
}
