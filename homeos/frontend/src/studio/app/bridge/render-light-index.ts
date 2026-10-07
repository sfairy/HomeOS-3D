export function createRenderLightIndex() {
  let indexedSceneRoot: any = null,
    isDirty = true,
    isDisposed = false,
    observedObjects: any = [],
    spotlightEntries: any = [],
    sortedVisibleLights: any = [],
    visibleLightOrder: any = [],
    visibleLightWeights: any = [];
  const visibilityByObject = new Map(),
    indexStats = {
      builds: 0,
      sorts: 0,
      reads: 0,
      checkedLights: 0,
    },
    markIndexDirty = () => {
      isDirty = true;
    };
  function detachChildListeners() {
    for (const observedObject of observedObjects)
      (observedObject.removeEventListener("childadded", markIndexDirty),
        observedObject.removeEventListener("childremoved", markIndexDirty));
    ((observedObjects = []), (spotlightEntries = []));
  }
  function rebuildLightIndex() {
    (detachChildListeners(),
      (visibleLightOrder = []),
      (visibleLightWeights = []),
      (sortedVisibleLights = []),
      indexedSceneRoot.traverse((sceneNode: any) => {
        if (
          (observedObjects.push(sceneNode),
          sceneNode.addEventListener("childadded", markIndexDirty),
          sceneNode.addEventListener("childremoved", markIndexDirty),
          !sceneNode.isSpotLight)
        )
          return;
        const ancestorPath: any[] = [];
        for (
          let pathCursor = sceneNode;
          pathCursor && (ancestorPath.push(pathCursor), pathCursor !== indexedSceneRoot);
          pathCursor = pathCursor.parent
        );
        spotlightEntries.push({
          object: sceneNode,
          path: ancestorPath,
        });
      }),
      (isDirty = false),
      indexStats.builds++);
  }
  return {
    stats: indexStats,
    read(sceneRoot: any, camera: any) {
      if (isDisposed) return [];
      (indexedSceneRoot !== sceneRoot && ((indexedSceneRoot = sceneRoot), (isDirty = true)),
        isDirty && rebuildLightIndex(),
        indexStats.reads++,
        visibilityByObject.clear());
      let visibleLightCount = 0,
        isOrderChanged = false;
      for (const { object: lightObject, path: entryPath } of spotlightEntries) {
        indexStats.checkedLights++;
        let isPathVisible = true;
        for (const ancestorNode of entryPath) {
          let cachedVisibility = visibilityByObject.get(ancestorNode);
          if (
            (cachedVisibility === undefined &&
              ((cachedVisibility = ancestorNode.visible !== false),
              visibilityByObject.set(ancestorNode, cachedVisibility)),
            !cachedVisibility)
          ) {
            isPathVisible = false;
            break;
          }
        }
        if (!isPathVisible || !lightObject.layers.test(camera.layers)) continue;
        const lightSortWeight = (lightObject.castShadow ? 2 : 0) + (lightObject.map ? 1 : 0);
        ((visibleLightOrder[visibleLightCount] !== lightObject ||
          visibleLightWeights[visibleLightCount] !== lightSortWeight) &&
          (isOrderChanged = true),
          (visibleLightOrder[visibleLightCount] = lightObject),
          (visibleLightWeights[visibleLightCount] = lightSortWeight),
          visibleLightCount++);
      }
      if (
        (visibleLightOrder.length !== visibleLightCount && (isOrderChanged = true),
        (visibleLightOrder.length = visibleLightWeights.length = visibleLightCount),
        isOrderChanged)
      ) {
        sortedVisibleLights.length = 0;
        for (const visibleLight of visibleLightOrder) sortedVisibleLights.push(visibleLight);
        (sortedVisibleLights.sort(
          (leftLight: any, rightLight: any) =>
            (rightLight.castShadow ? 2 : 0) +
            (rightLight.map ? 1 : 0) -
            ((leftLight.castShadow ? 2 : 0) + (leftLight.map ? 1 : 0)),
        ),
          indexStats.sorts++);
      }
      return sortedVisibleLights;
    },
    invalidate: markIndexDirty,
    dispose() {
      ((isDisposed = true),
        detachChildListeners(),
        visibilityByObject.clear(),
        (indexedSceneRoot = null),
        (sortedVisibleLights = visibleLightOrder = visibleLightWeights = []));
    },
  };
}
