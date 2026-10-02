const excludedComponentKeySet = new Set(["actions", "bindings", "position", "properties", "style"]);
export function createRecoveryWriter(
  writeRecoverySnapshot,
  {
    delay: delayMs = 200,
    setTimer: setTimer = setTimeout,
    clearTimer: clearTimer = clearTimeout,
  } = {},
) {
  let pendingSnapshot = null,
    timeoutId = null;
  const flushPendingSnapshot = () => {
    (timeoutId !== null && clearTimer(timeoutId), (timeoutId = null));
    const flushedSnapshot = pendingSnapshot;
    ((pendingSnapshot = null), flushedSnapshot && writeRecoverySnapshot(flushedSnapshot));
  };
  return {
    schedule(incomingSnapshot) {
      (pendingSnapshot &&
        pendingSnapshot.projectId !== incomingSnapshot.projectId &&
        flushPendingSnapshot(),
        (pendingSnapshot = incomingSnapshot),
        timeoutId === null && (timeoutId = setTimer(flushPendingSnapshot, delayMs)));
    },
    flush: flushPendingSnapshot,
    cancel(projectId) {
      !pendingSnapshot ||
        pendingSnapshot.projectId !== projectId ||
        ((pendingSnapshot = null), timeoutId !== null && clearTimer(timeoutId), (timeoutId = null));
    },
  };
}
export function editorComponentEntries(editorDocument) {
  const componentById = new Map(),
    orderKeys = [],
    collectComponent = (component, scope, pagePath, parentId = null) => {
      if (!component?.id) return;
      const componentId = String(component.id);
      (componentById.set(componentId, {
        component: component,
        scope: scope,
        pagePath: pagePath,
        parentId: parentId,
      }),
        orderKeys.push(
          scope + ":" + (pagePath || "") + ":" + (parentId || "") + ":" + componentId,
        ));
      for (const nestedComponent of component.children || [])
        collectComponent(nestedComponent, scope, pagePath, componentId);
    };
  for (const sharedComponent of editorDocument?.sharedComponents || [])
    collectComponent(sharedComponent, "shared", "", null);
  for (const page of editorDocument?.pages || [])
    for (const pageComponent of page.components || [])
      collectComponent(pageComponent, "page", page.path, null);
  return {
    entries: componentById,
    order: orderKeys,
  };
}
export function editorComponentStructure(sourceComponent) {
  const componentStructure: Record<string, unknown> = {};
  for (const [propertyKey, propertyValue] of Object.entries(sourceComponent || {}))
    excludedComponentKeySet.has(propertyKey) ||
      propertyKey === "children" ||
      (componentStructure[propertyKey] = propertyValue);
  return (
    (componentStructure.children = (sourceComponent?.children || []).map(
      (childComponent) => childComponent.id,
    )),
    JSON.stringify(componentStructure)
  );
}
export function editorDocumentFrameSignature(sourceDocument) {
  const strippedDocument = {
    ...(sourceDocument || {}),
  };
  return (
    (strippedDocument.sharedComponents = []),
    strippedDocument.pages &&
      (strippedDocument.pages = strippedDocument.pages.map((pageEntry) => ({
        ...pageEntry,
        components: [],
      }))),
    documentSignature(strippedDocument)
  );
}
export function documentSignature(documentToSign) {
  const normalizeAction = (actionConfig) => {
      if (!actionConfig || !actionConfig.type || actionConfig.type === "none") return null;
      const actionCopy = {
        ...actionConfig,
      };
      return (
        (!actionCopy.data || !Object.keys(actionCopy.data).length) && delete actionCopy.data,
        actionCopy.type !== "navigate" && delete actionCopy.target,
        delete actionCopy.domain,
        delete actionCopy.service,
        canonicalizeForSignature(actionCopy)
      );
    },
    canonicalizeForSignature = (rawValue, parentKey = "") =>
      Array.isArray(rawValue)
        ? rawValue.map((arrayElement) => canonicalizeForSignature(arrayElement))
        : rawValue && typeof rawValue == "object"
          ? Object.fromEntries(
              parentKey === "actions"
                ? Object.keys(rawValue)
                    .sort()
                    .flatMap((actionKey) => {
                      const normalizedAction = normalizeAction(rawValue[actionKey]);
                      return normalizedAction ? [[actionKey, normalizedAction]] : [];
                    })
                : Object.keys(rawValue)
                    .sort()
                    .map((entryKey) => [
                      entryKey,
                      canonicalizeForSignature(rawValue[entryKey], entryKey),
                    ]),
            )
          : rawValue;
  return JSON.stringify(canonicalizeForSignature(documentToSign || null));
}
export function recoveryStorageKey(storagePrefix, recoveryProjectId) {
  return "" + storagePrefix + recoveryProjectId;
}
