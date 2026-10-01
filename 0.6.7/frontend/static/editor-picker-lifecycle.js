export function createEditorPickerLifecycle({
  getEntitiesLoaded: i,
  getEntityLoadPromise: t,
  loadEntities: s,
  reportError: a,
}) {
  const n = new WeakSet();
  function c(e, d, o = () => true) {
    if (i()) return false;
    if (n.has(e)) return true;
    const r = t(),
      u = !!r,
      f = r || s();
    return (
      n.add(e),
      e?.setAttribute("aria-busy", "true"),
      Promise.resolve(f)
        .then(() => {
          !i() || !e?.isConnected || !o() || d();
        })
        .catch((l) => {
          u || a(l);
        })
        .finally(() => {
          (n.delete(e), e?.removeAttribute("aria-busy"));
        }),
      true
    );
  }
  return {
    deferUntilEntitiesLoaded: c,
  };
}
