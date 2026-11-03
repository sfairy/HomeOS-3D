/**
 * 真正离页才释放资源（0.8.4）：`pagehide` 只要 `persisted === false` 就说明页面不会进
 * bfcache，这时才允许做不可逆清理；返回的函数用于提前解绑（例如控件先被卸载）。
 */
export function onPermanentPageHide(disposeTarget: EventTarget, disposeResources: () => void) {
  let isBound = true;
  const unbindPageHide = () => {
    isBound && ((isBound = false), disposeTarget.removeEventListener?.("pagehide", handlePageHide));
  };
  function handlePageHide(pageHideEvent: any) {
    pageHideEvent?.persisted || (unbindPageHide(), disposeResources());
  }
  return (disposeTarget.addEventListener?.("pagehide", handlePageHide), unbindPageHide);
}
