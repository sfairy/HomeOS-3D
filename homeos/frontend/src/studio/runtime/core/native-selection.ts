/**
 * iPad / 触屏长按守卫（0.8.4）：运行时区不允许选中文字或拖拽出图片，
 * 输入框与可编辑区域保持原生行为。按宿主元素引用计数，最后一个使用者退出才解绑。
 */
const selectionGuards = new WeakMap<
    EventTarget,
    { count: number; preventSelection: (event: Event) => void }
  >(),
  GUARDED_EVENTS = ["selectstart", "contextmenu", "dragstart"] as const;

export function installNativeSelectionGuard(guardHostElement: EventTarget) {
  let guardRecord = selectionGuards.get(guardHostElement);
  if (!guardRecord) {
    const preventSelection = (selectionEvent: Event) => {
      const eventTarget =
          (selectionEvent.composedPath?.()[0] as any) || selectionEvent.target,
        targetElement =
          eventTarget?.nodeType === 3 ? eventTarget.parentElement : eventTarget;
      targetElement?.closest?.("input, textarea, select") ||
        targetElement?.isContentEditable ||
        selectionEvent.preventDefault();
    };
    guardRecord = { count: 0, preventSelection };
    for (const guardedEventName of GUARDED_EVENTS)
      guardHostElement.addEventListener(guardedEventName, preventSelection, true);
    selectionGuards.set(guardHostElement, guardRecord);
  }
  guardRecord.count++;
  let isDisposed = false;
  return () => {
    if (isDisposed) return;
    isDisposed = true;
    if (--guardRecord!.count) return;
    for (const guardedEventName of GUARDED_EVENTS)
      guardHostElement.removeEventListener(guardedEventName, guardRecord!.preventSelection, true);
    selectionGuards.delete(guardHostElement);
  };
}
