/**
 * 编辑器选择器的「实体列表加载」生命周期。
 *
 * 位置：所有依赖 HA 实体列表的 picker 共用，负责在实体尚未加载时挂起操作。
 * 职责：实体未就绪时触发一次加载并等待，加载完成后回调；同一宿主元素
 *   只挂起一次，避免反复点击触发并发请求。
 * 约定：宿主元素会打上 aria-busy="true" 表示加载中；重复挂起返回 true，
 *   调用方据此跳过本次渲染。
 */

/**
 * 创建选择器生命周期控制器。
 *
 * @param {object} handlers 依赖注入。
 * @param {function(): boolean} handlers.getEntitiesLoaded 实体是否已加载完成。
 * @param {function(): Promise|null} handlers.getEntityLoadPromise 取正在进行的加载 Promise。
 * @param {function(): Promise} handlers.loadEntities 发起实体加载。
 * @param {function(Error): void} handlers.reportError 加载失败上报。
 * @returns {{deferUntilEntitiesLoaded: function(Element, function, function=): boolean}}
 *   生命周期控制器。
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
   *
   * @param {Element} hostElement 触发操作的宿主元素。
   * @param {function(): void} onEntitiesReady 实体就绪后的回调。
   * @param {function(): boolean} [shouldProceed] 额外的前置条件，返回 false 则放弃回调。
   * @returns {boolean} 已就绪返回 false（无需挂起）；已挂起或本次新挂起返回 true。
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
