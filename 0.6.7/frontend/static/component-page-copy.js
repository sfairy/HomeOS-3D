function findComponentInTree(componentTree, targetComponentId) {
  for (const childComponent of componentTree || []) {
    if (childComponent.id === targetComponentId) return childComponent;
    const nestedMatch = findComponentInTree(childComponent.children, targetComponentId);
    if (nestedMatch) return nestedMatch;
  }
  return null;
}
function findDocumentComponent(searchDocument, searchedComponentId) {
  const sharedComponentMatch = findComponentInTree(
    searchDocument?.sharedComponents,
    searchedComponentId,
  );
  if (sharedComponentMatch) return sharedComponentMatch;
  for (const visitedPage of searchDocument?.pages || []) {
    const pageComponentMatch = findComponentInTree(visitedPage.components, searchedComponentId);
    if (pageComponentMatch) return pageComponentMatch;
  }
  return null;
}
function locateComponentWithScope(scopedDocument, locatedComponentId) {
  const sharedScopeComponent = findComponentInTree(
    scopedDocument?.sharedComponents,
    locatedComponentId,
  );
  if (sharedScopeComponent)
    return {
      component: sharedScopeComponent,
      scope: "shared",
      page: null,
    };
  for (const scannedPage of scopedDocument?.pages || []) {
    const locatedComponent = findComponentInTree(scannedPage.components, locatedComponentId);
    if (locatedComponent)
      return {
        component: locatedComponent,
        scope: "page",
        page: scannedPage,
      };
  }
  return null;
}
function collectComponentsByIds(documentTree, wantedComponentIds) {
  const wantedIdSet = new Set(wantedComponentIds || []),
    collectedComponents = [],
    walkComponents = (walkComponentList) => {
      for (const candidateComponent of walkComponentList || [])
        (wantedIdSet.has(candidateComponent.id) && collectedComponents.push(candidateComponent),
          walkComponents(candidateComponent.children));
    };
  walkComponents(documentTree?.sharedComponents);
  for (const documentTreePage of documentTree?.pages || [])
    walkComponents(documentTreePage.components);
  return collectedComponents;
}
export function copyComponentTargetPages(originDocument, copiedComponentId) {
  const locatedTarget = locateComponentWithScope(originDocument, copiedComponentId);
  return locatedTarget
    ? (originDocument?.pages || []).filter(
        (otherPage) => locatedTarget.scope === "shared" || otherPage !== locatedTarget.page,
      )
    : [];
}
export function copyComponentTargets(pageSourceDocument, sourceComponentId) {
  const targetLocation = locateComponentWithScope(pageSourceDocument, sourceComponentId);
  if (!targetLocation) return [];
  const pageTargets = copyComponentTargetPages(pageSourceDocument, sourceComponentId).map(
    (page) => ({
      key: `page:${page.path}`,
      name: page.name,
      scope: "page",
      page: page,
    }),
  );
  return targetLocation.scope === "page"
    ? [
        {
          key: "shared",
          name: "侧边栏",
          scope: "shared",
        },
        ...pageTargets,
      ]
    : pageTargets;
}
function assignFreshComponentIds(componentNode, createComponentId) {
  componentNode.id = createComponentId();
  for (const nestedChildComponent of componentNode.children || [])
    assignFreshComponentIds(nestedChildComponent, createComponentId);
  return componentNode;
}
function uniqueCopyLabel(labelSourceComponent, siblingComponents, labelOf) {
  const baseLabel =
      String(labelOf(labelSourceComponent) || "控件")
        .trim()
        .replace(/_副本\d*$/, "") || "控件",
    existingLabelSet = new Set(
      (siblingComponents || []).map((existingComponent) =>
        String(labelOf(existingComponent)).trim(),
      ),
    );
  let candidateCopyName = `${baseLabel}_\u526F\u672C`,
    copyIndex = 2;
  for (; existingLabelSet.has(candidateCopyName);)
    ((candidateCopyName = `${baseLabel}_\u526F\u672C${copyIndex}`), (copyIndex += 1));
  return candidateCopyName;
}
function applyLayerOrder(components) {
  for (let layerIndex = 0; layerIndex < (components || []).length; layerIndex += 1) {
    const layeredComponent = components[layerIndex];
    layeredComponent.position = {
      ...(layeredComponent.position || {}),
      zIndex: components.length - layerIndex,
    };
  }
}
function roundSixDecimals(numericValue) {
  return Math.round(Number(numericValue) * 1000000) / 1000000;
}
function positiveNumberOr(candidateNumber, fallback) {
  const parsedNumber = Number(candidateNumber);
  return Number.isFinite(parsedNumber) && parsedNumber > 0 ? parsedNumber : fallback;
}
function scaleComponentGeometry(geometryComponent, scaleX, scaleY, childScale, isRoot = true) {
  if (!geometryComponent || typeof geometryComponent != "object") return;
  const position = geometryComponent.position || {},
    width = positiveNumberOr(position.width, 100),
    height = positiveNumberOr(position.height, 100),
    positionX = Number.isFinite(Number(position.x)) ? Number(position.x) : 0,
    positionY = Number.isFinite(Number(position.y)) ? Number(position.y) : 0,
    scaledWidth = width * (geometryComponent.type === "interaction3d" ? scaleX : childScale),
    scaledHeight = height * (geometryComponent.type === "interaction3d" ? scaleY : childScale);
  geometryComponent.position = {
    ...position,
    x: roundSixDecimals(
      isRoot ? (positionX + width / 2) * scaleX - scaledWidth / 2 : positionX * childScale,
    ),
    y: roundSixDecimals(
      isRoot ? (positionY + height / 2) * scaleY - scaledHeight / 2 : positionY * childScale,
    ),
    width: roundSixDecimals(scaledWidth),
    height: roundSixDecimals(scaledHeight),
  };
  for (const childNode of geometryComponent.children || [])
    scaleComponentGeometry(childNode, childScale, childScale, childScale, false);
}
function fitComponentToCanvas(componentToFit, sourceCanvas, targetCanvas) {
  const sourceWidth = positiveNumberOr(sourceCanvas?.width, 2778),
    sourceHeight = positiveNumberOr(sourceCanvas?.height, 1940),
    targetWidth = positiveNumberOr(targetCanvas?.width, sourceWidth),
    targetHeight = positiveNumberOr(targetCanvas?.height, sourceHeight),
    widthRatio = targetWidth / sourceWidth,
    heightRatio = targetHeight / sourceHeight;
  return (
    scaleComponentGeometry(
      componentToFit,
      widthRatio,
      heightRatio,
      Math.min(widthRatio, heightRatio),
    ),
    componentToFit
  );
}
function pruneInvalidReferences(componentToPrune, pruneDocument, handleInvalidReference) {
  if (!componentToPrune || typeof componentToPrune != "object") return;
  const pagePathSet = new Set(
      (pruneDocument?.pages || []).map((existingPage) => existingPage.path),
    ),
    popupIdSet = new Set(
      (pruneDocument?.customPopups || []).map((existingPopup) => existingPopup.id),
    );
  componentToPrune.properties?.targetPage &&
    !pagePathSet.has(componentToPrune.properties.targetPage) &&
    (delete componentToPrune.properties.targetPage, handleInvalidReference?.("navigate"));
  for (const [actionKey, actionValue] of Object.entries(componentToPrune.actions || {})) {
    const hasInvalidTarget =
        actionValue?.type === "navigate" && !pagePathSet.has(actionValue.target),
      hasInvalidPopup =
        actionValue?.type === "more-info" &&
        actionValue.data?.popupSource === "custom" &&
        !popupIdSet.has(actionValue.data?.popupId);
    (hasInvalidTarget || hasInvalidPopup) &&
      (delete componentToPrune.actions[actionKey],
      handleInvalidReference?.(hasInvalidTarget ? "navigate" : "popup"));
  }
  for (const childComponentToPrune of componentToPrune.children || [])
    pruneInvalidReferences(childComponentToPrune, pruneDocument, handleInvalidReference);
}
function resolveTargetComponentList(listDocument, scopeKey) {
  if (scopeKey === "shared")
    return listDocument.sharedComponents || (listDocument.sharedComponents = []);
  const targetPagePath = String(scopeKey || "").replace(/^page:/, ""),
    matchedPage = (listDocument.pages || []).find(
      (pageCandidate) => pageCandidate.path === targetPagePath,
    );
  return matchedPage ? matchedPage.components || (matchedPage.components = []) : null;
}
function addSharedComponentRefsToPages(refDocument, sharedComponentIds) {
  if (sharedComponentIds.length)
    for (const updatedPage of refDocument.pages || [])
      updatedPage.sharedComponentIds = [
        ...new Set([...sharedComponentIds, ...(updatedPage.sharedComponentIds || [])]),
      ];
}
export function copyComponentsAcrossDocuments(
  sourceDocumentToCopy,
  targetDocumentToCopy,
  componentIdsToCopy,
  targetScopeToCopy,
  {
    cloneValue: cloneValue = (clonedValue) => structuredClone(clonedValue),
    createId: createId,
    componentLabel: componentLabelOf = (labelComponent) =>
      labelComponent?.properties?.label || labelComponent?.type || "控件",
    scaleMode: scaleMode = "none",
    onInvalidAction: handleInvalidAction,
  } = {},
) {
  const requestedIds = [...new Set(componentIdsToCopy || [])].filter(Boolean);
  if (
    !sourceDocumentToCopy ||
    !targetDocumentToCopy ||
    !requestedIds.length ||
    typeof createId != "function"
  )
    return [];
  const sourceComponents = collectComponentsByIds(sourceDocumentToCopy, requestedIds),
    targetComponents = resolveTargetComponentList(targetDocumentToCopy, targetScopeToCopy);
  if (sourceComponents.length !== requestedIds.length || !targetComponents) return [];
  const copiedComponents = [];
  for (const sourceComponent of sourceComponents) {
    const copiedComponent = assignFreshComponentIds(cloneValue(sourceComponent), createId);
    ((copiedComponent.properties = {
      ...(copiedComponent.properties || {}),
      label: uniqueCopyLabel(
        sourceComponent,
        [...targetComponents, ...copiedComponents],
        componentLabelOf,
      ),
    }),
      delete copiedComponent.properties.previewState,
      pruneInvalidReferences(copiedComponent, targetDocumentToCopy, handleInvalidAction),
      (scaleMode === "proportional" || copiedComponent.type === "interaction3d") &&
        fitComponentToCanvas(
          copiedComponent,
          sourceDocumentToCopy.canvas,
          targetDocumentToCopy.canvas,
        ),
      copiedComponents.push(copiedComponent));
  }
  return (
    targetComponents.unshift(...copiedComponents),
    applyLayerOrder(targetComponents),
    targetScopeToCopy === "shared" &&
      addSharedComponentRefsToPages(
        targetDocumentToCopy,
        copiedComponents.map((copiedChildId) => copiedChildId.id),
      ),
    copiedComponents
  );
}
export function copyComponentAcrossDocuments(
  sourceDocument,
  targetDocument,
  componentId,
  targetScope,
  copyOptions = {},
) {
  return (
    copyComponentsAcrossDocuments(
      sourceDocument,
      targetDocument,
      [componentId],
      targetScope,
      copyOptions,
    )[0] || null
  );
}
export function copyComponentToPage(
  pageDocument,
  requestedComponentId,
  destinationPagePath,
  {
    cloneValue: cloneComponentValue = (clonedComponentValue) =>
      structuredClone(clonedComponentValue),
    createId: createPageComponentId,
    componentLabel: readComponentLabel = (labeledComponent) =>
      labeledComponent?.properties?.label || labeledComponent?.type || "控件",
  } = {},
) {
  if (
    !pageDocument ||
    !requestedComponentId ||
    !destinationPagePath ||
    typeof createPageComponentId != "function"
  )
    return null;
  const resolvedSourceComponent = findDocumentComponent(pageDocument, requestedComponentId),
    destinationPage = (pageDocument.pages || []).find(
      (pageCandidateForPath) => pageCandidateForPath.path === destinationPagePath,
    );
  if (!resolvedSourceComponent || !destinationPage) return null;
  const destinationComponents = destinationPage.components || (destinationPage.components = []),
    copiedPageComponent = assignFreshComponentIds(
      cloneComponentValue(resolvedSourceComponent),
      createPageComponentId,
    );
  return (
    (copiedPageComponent.properties = {
      ...(copiedPageComponent.properties || {}),
      label: uniqueCopyLabel(resolvedSourceComponent, destinationComponents, readComponentLabel),
    }),
    delete copiedPageComponent.properties.previewState,
    destinationComponents.unshift(copiedPageComponent),
    applyLayerOrder(destinationComponents),
    copiedPageComponent
  );
}
export function copyComponentToTarget(
  hostDocument,
  entryComponentId,
  destinationScope,
  targetCopyOptions = {},
) {
  return (
    copyComponentsToTarget(
      hostDocument,
      [entryComponentId],
      destinationScope,
      targetCopyOptions,
    )[0] || null
  );
}
export function copyComponentsToTarget(
  batchCopySourceDocument,
  batchCopyComponentIds,
  batchCopyTargetScope,
  batchCopyOptions = {},
) {
  return copyComponentsAcrossDocuments(
    batchCopySourceDocument,
    batchCopySourceDocument,
    batchCopyComponentIds,
    batchCopyTargetScope,
    {
      ...batchCopyOptions,
      scaleMode: "none",
    },
  );
}
