export function createEditorPickerLifecycle({
  getEntitiesLoaded: getEntitiesLoaded,
  getEntityLoadPromise: getEntityLoadPromise,
  loadEntities: loadEntities,
  reportError: reportError,
}) {
  const deferredHostSet = new WeakSet();
  function deferUntilEntitiesLoaded(hostElement, onReady, canProceed = () => true) {
    if (getEntitiesLoaded()) return false;
    if (deferredHostSet.has(hostElement)) return true;
    const existingPromise = getEntityLoadPromise(),
      hasExistingPromise = !!existingPromise,
      loadPromise = existingPromise || loadEntities();
    return (
      deferredHostSet.add(hostElement),
      hostElement?.setAttribute("aria-busy", "true"),
      Promise.resolve(loadPromise)
        .then(() => {
          !getEntitiesLoaded() || !hostElement?.isConnected || !canProceed() || onReady();
        })
        .catch((loadError) => {
          hasExistingPromise || reportError(loadError);
        })
        .finally(() => {
          (deferredHostSet.delete(hostElement), hostElement?.removeAttribute("aria-busy"));
        }),
      true
    );
  }
  return {
    deferUntilEntitiesLoaded: deferUntilEntitiesLoaded,
  };
}
