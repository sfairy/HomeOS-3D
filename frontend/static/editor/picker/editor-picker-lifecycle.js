/**
 * 编辑器选择器的「实体列表加载」生命周期。
 *
 * 所有依赖 HA 实体列表的 picker 共用：实体未就绪时触发一次加载并等待，加载完成后回调；同一
 * 宿主元素只挂起一次，避免反复点击触发并发请求。宿主元素会打上 aria-busy="true" 表示加载中；
 * 重复挂起返回 true，调用方据此跳过本次渲染。
 */

/**
 * 创建选择器生命周期控制器。
 */
export function createEditorPickerLifecycle({
  getEntitiesLoaded: getEntitiesLoaded,
  getEntityLoadPromise: getEntityLoadPromise,
  loadEntities: loadEntities,
  reportError: reportError
}) {
  // 用 WeakSet 记录正在等待的宿主元素，元素被移除后可自然回收。
  const busyElements = new WeakSet();

  /**
   * 实体未加载完成时挂起回调，加载完成后执行。
   */
  function deferUntilEntitiesLoaded(hostElement, onEntitiesReady, shouldProceed = () => !0) {
    if (getEntitiesLoaded()) return !1;
    // 已在等待中：直接告诉调用方本次跳过，避免并发加载。
    if (busyElements.has(hostElement)) return !0;
    // 复用进行中的请求，只有确实没有请求时才自己发起。
    const existingPromise = getEntityLoadPromise(),
      hasExistingPromise = !!existingPromise,
      loadPromise = existingPromise || loadEntities();
    return (
      busyElements.add(hostElement),
      hostElement?.setAttribute("aria-busy", "true"),
      Promise.resolve(loadPromise)
        .then(() => {
          // 宿主可能已被卸载，或调用方的前置条件已不成立，此时放弃回调。
          !getEntitiesLoaded() ||
            !hostElement?.isConnected ||
            !shouldProceed() ||
            onEntitiesReady();
        })
        .catch(loadError => {
          // 复用已有请求时不重复上报，避免同一错误刷多条日志。
          hasExistingPromise || reportError(loadError);
        })
        .finally(() => {
          (busyElements.delete(hostElement), hostElement?.removeAttribute("aria-busy"));
        }),
      !0
    );
  }
  return { deferUntilEntitiesLoaded: deferUntilEntitiesLoaded };
}
