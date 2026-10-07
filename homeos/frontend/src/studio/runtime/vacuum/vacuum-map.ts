const { vacuumStatus: resolveVacuumStatus } = await (import("@app/renderer/controls/vacuum-runtime")),
  {
    vacuumMapAvailable: N,
    vacuumMapSource: resolveVacuumMapSource,
    createVacuumMapImageLoader: $,
  } = await (import("@app/renderer/core/vacuum-map-state"));
export { N as vacuumMapAvailable, $ as createVacuumMapImageLoader };
export function vacuumMapIdentity(mapEntityEntry: any, vacuumEntityEntry: any) {
  const mapIdentityAttributes = (mapEntityEntry?.newState || mapEntityEntry)?.attributes || {},
    vacuumIdentityAttributes = (vacuumEntityEntry?.newState || vacuumEntityEntry)?.attributes || {},
    isUsableIdValue = (idValue: any) =>
      (typeof idValue == "string" && idValue) ||
      (typeof idValue == "number" && Number.isFinite(idValue));
  for (const savedMapIdCandidate of [
    mapIdentityAttributes.saved_map_id,
    mapIdentityAttributes.selected_map_id,
    vacuumIdentityAttributes.selected_map_id,
  ])
    if (isUsableIdValue(savedMapIdCandidate)) return "saved:" + savedMapIdCandidate;
  if (isUsableIdValue(mapIdentityAttributes.map_index))
    return "index:" + mapIdentityAttributes.map_index;
  for (const mapIdKey of ["map_id", "current_map_id", "map_index", "selected_map_id"]) {
    const mapIdValue = mapIdentityAttributes[mapIdKey];
    if (
      (typeof mapIdValue == "string" && mapIdValue) ||
      (typeof mapIdValue == "number" && Number.isFinite(mapIdValue))
    )
      return String(mapIdValue);
  }
  return "";
}
export function vacuumBindingsForMap(bindings: any, statesByEntityId: any) {
  return bindings.flatMap((binding: any) => {
    const mapEntityState = statesByEntityId[binding.map?.entityId],
      vacuumEntityState = statesByEntityId[binding.entityId],
      mapAttributes = (mapEntityState?.newState || mapEntityState)?.attributes || {},
      vacuumStateAttributes = (vacuumEntityState?.newState || vacuumEntityState)?.attributes || {},
      mapIdentity = vacuumMapIdentity(mapEntityState, vacuumEntityState),
      sourceMapId = binding.map?.sourceMapId,
      hasSiblingBinding = bindings.some(
        (sibling: any) =>
          sibling !== binding &&
          sibling.floorId !== binding.floorId &&
          sibling.entityId === binding.entityId &&
          sibling.map?.entityId === binding.map?.entityId,
      );
    if (!sourceMapId) return hasSiblingBinding ? [] : [binding];
    if (sourceMapId === mapIdentity) return [binding];
    const isPlainSourceMapId = !sourceMapId.includes(":");
    return isPlainSourceMapId &&
      String(mapAttributes.map_id ?? mapAttributes.current_map_id ?? "") === sourceMapId
      ? [binding]
      : isPlainSourceMapId &&
          !hasSiblingBinding &&
          vacuumStateAttributes.multi_floor_map === false &&
          mapIdentity.startsWith("saved:")
        ? [
            {
              ...binding,
              map: {
                ...binding.map,
                sourceMapId: mapIdentity,
              },
            },
          ]
        : [];
  });
}
export function mapCorners(mapConfig: any) {
  const rotationRad = ((mapConfig.rotation || 0) * Math.PI) / 180,
    cosRotation = Math.cos(rotationRad),
    sinRotation = Math.sin(rotationRad);
  return [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ].map(([unitX, unitY]) => ({
    x: mapConfig.x + unitX * mapConfig.width * cosRotation - unitY * mapConfig.depth * sinRotation,
    y: mapConfig.y + unitX * mapConfig.width * sinRotation + unitY * mapConfig.depth * cosRotation,
  }));
}
export function mapSource(entityId: any, cacheBustTimestamp = Date.now()) {
  return resolveVacuumMapSource(entityId, cacheBustTimestamp);
}
export function createVacuumMaps(sceneHost: any, requestRender: any) {
  const { THREE: THREE } = sceneHost,
    entriesByItemId = new Map();
  let isActive = false,
    isDisposed = false,
    refreshTimerId: any = null,
    cachedSelectionKey = "",
    refreshIntervalMs = 5000,
    lastLoadTimestamp = -Infinity,
    nextRefreshAt = Infinity;
  const buildRevisionKey = (keyItem: any, revisionStates: any) => {
    const revisionMapState = revisionStates[keyItem.map?.entityId],
      mapState = revisionMapState?.newState || revisionMapState || {},
      revisionAttributes = mapState.attributes || {},
      revisionVacuumState = revisionStates[keyItem.entityId],
      vacuumState = revisionVacuumState?.newState || revisionVacuumState || {};
    return JSON.stringify([
      mapState.state,
      mapState.last_updated,
      revisionAttributes.entity_picture,
      revisionAttributes.image_last_updated,
      revisionAttributes.vacuum_position,
      revisionAttributes.robot_position,
      revisionAttributes.charger_position,
      vacuumState.state,
      vacuumState.last_updated,
    ]);
  };
  function scheduleRefreshIn(delayMs: any) {
    if (!isActive || isDisposed || document.hidden || !entriesByItemId.size) return;
    const scheduledAt = performance.now() + delayMs;
    (refreshTimerId !== null && nextRefreshAt <= scheduledAt) ||
      (clearTimeout(refreshTimerId),
      (nextRefreshAt = scheduledAt),
      (refreshTimerId = setTimeout(loadVisibleMaps, delayMs)));
  }
  const rescheduleRefresh = () =>
      scheduleRefreshIn(Math.max(0, 1000 - (performance.now() - lastLoadTimestamp))),
    prefersReducedMotion = () =>
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
    cancelImageLoad = (loadingEntry: any) => {
      (loadingEntry.generation++,
        clearTimeout(loadingEntry.timeout),
        (loadingEntry.timeout = null),
        loadingEntry.image &&
          ((loadingEntry.image.onload = loadingEntry.image.onerror = null),
          loadingEntry.loading && (loadingEntry.image.src = "")),
        (loadingEntry.loading = false));
    },
    hideAndReleaseTexture = (clearedEntry: any) => {
      ((clearedEntry.mesh.visible = false),
        (clearedEntry.fading = false),
        clearedEntry.mesh.material.map?.dispose(),
        (clearedEntry.mesh.material.map = null),
        (clearedEntry.mesh.material.needsUpdate = true));
    },
    disposeMapEntry = (disposalTarget: any) => {
      (cancelImageLoad(disposalTarget),
        disposalTarget.mesh.removeFromParent(),
        disposalTarget.mesh.geometry.dispose(),
        disposalTarget.mesh.material.map?.dispose(),
        disposalTarget.mesh.material.dispose());
    };
  function positionMesh(positionedEntry: any) {
    const worldCorners = mapCorners(positionedEntry.map).map((corner) =>
      sceneHost.worldPoint(positionedEntry.floorId, corner.x, corner.y, positionedEntry.height),
    );
    if (worldCorners.some((validCorner) => !validCorner)) return false;
    const positionAttribute = positionedEntry.mesh.geometry.attributes.position;
    return (
      worldCorners.forEach((cornerPoint, cornerIndex) =>
        positionAttribute.setXYZ(cornerIndex, cornerPoint.x, cornerPoint.y, cornerPoint.z),
      ),
      (positionAttribute.needsUpdate = true),
      positionedEntry.mesh.geometry.computeBoundingBox(),
      positionedEntry.mesh.geometry.computeBoundingSphere(),
      true
    );
  }
  function applyVisibility(visibilityEntry: any) {
    ((visibilityEntry.mesh.visible =
      isActive && visibilityEntry.positioned && !!visibilityEntry.mesh.material.map),
      visibilityEntry.mesh.visible &&
        ((visibilityEntry.mesh.material.opacity = prefersReducedMotion()
          ? visibilityEntry.opacity
          : 0),
        (visibilityEntry.fadeStart = null),
        (visibilityEntry.fading =
          visibilityEntry.mesh.material.opacity < visibilityEntry.opacity)));
  }
  function loadVisibleMaps() {
    if (
      (clearTimeout(refreshTimerId),
      (refreshTimerId = null),
      (nextRefreshAt = Infinity),
      !(!isActive || isDisposed || document.hidden))
    ) {
      for (const refreshEntry of entriesByItemId.values()) {
        if (refreshEntry.loading) continue;
        ((refreshEntry.loading = true),
          (refreshEntry.pending = false),
          (lastLoadTimestamp = performance.now()));
        const generation = ++refreshEntry.generation,
          mapImage = new Image();
        ((refreshEntry.image = mapImage),
          (mapImage.onload = () => {
            if (isDisposed || !isActive || generation !== refreshEntry.generation) return;
            (clearTimeout(refreshEntry.timeout),
              (refreshEntry.timeout = null),
              (refreshEntry.loading = false));
            const hasExistingTexture = !!refreshEntry.mesh.material.map;
            refreshEntry.mesh.material.map?.dispose();
            const texture = new THREE.Texture(mapImage);
            ((texture.colorSpace = THREE.SRGBColorSpace),
              (texture.needsUpdate = true),
              (refreshEntry.mesh.material.map = texture),
              (refreshEntry.mesh.material.needsUpdate = true),
              hasExistingTexture || applyVisibility(refreshEntry),
              refreshEntry.pending && rescheduleRefresh(),
              requestRender());
          }),
          (mapImage.onerror = () => {
            isDisposed ||
              !isActive ||
              generation !== refreshEntry.generation ||
              (cancelImageLoad(refreshEntry),
              hideAndReleaseTexture(refreshEntry),
              refreshEntry.pending && rescheduleRefresh(),
              requestRender());
          }),
          (refreshEntry.timeout = setTimeout(() => mapImage.onerror?.(new Event("error")), 15000)),
          (mapImage.src = mapSource(refreshEntry.entityId)));
      }
      scheduleRefreshIn(refreshIntervalMs);
    }
  }
  return {
    diagnostics() {
      let mapPixels = 0,
        mapTextures = 0;
      for (const measuredEntry of entriesByItemId.values()) {
        const entryImage = measuredEntry.mesh.material.map?.image;
        entryImage &&
          (mapTextures++,
          (mapPixels +=
            (entryImage.naturalWidth || entryImage.width || 0) *
            (entryImage.naturalHeight || entryImage.height || 0)));
      }
      return {
        mapPixels: mapPixels,
        mapTextures: mapTextures,
      };
    },
    sync(items: any, isEnabled: any, floorFilter: any, syncStates: Record<string, any> = {}) {
      if (!!!(isEnabled && !isDisposed && !document.hidden)) {
        if (isActive) {
          (clearTimeout(refreshTimerId), (refreshTimerId = null), (nextRefreshAt = Infinity));
          for (const hiddenEntry of entriesByItemId.values())
            (cancelImageLoad(hiddenEntry),
              (hiddenEntry.mesh.visible = false),
              (hiddenEntry.fading = false));
          requestRender();
        }
        isActive = false;
        return;
      }
      const isInactive = !isActive;
      ((isActive = true),
        (refreshIntervalMs = items.some(
          (listedItem: any) => vacuumStatusPresentation(listedItem, syncStates).active,
        )
          ? 1000
          : 5000));
      const visibleItems = items.filter(
          (candidateItem: any) =>
            N((syncStates as any)[candidateItem.map?.entityId]) &&
            candidateItem.visible !== false &&
            candidateItem.modelAvailable !== false &&
            candidateItem.map?.visible !== false &&
            mapSource(candidateItem.map?.entityId) &&
            candidateItem.map.width > 0 &&
            candidateItem.map.depth > 0 &&
            (floorFilter === "all" || candidateItem.floorId === floorFilter),
        ),
        selectionKey = JSON.stringify([
          sceneHost.sceneRevision,
          floorFilter,
          visibleItems.map((mappedItem: any) => [mappedItem.id, mappedItem.floorId, mappedItem.map]),
        ]),
        hasSelectionChanged = selectionKey !== cachedSelectionKey;
      if (hasSelectionChanged) {
        (clearTimeout(refreshTimerId), (refreshTimerId = null), (nextRefreshAt = Infinity));
        for (const staleEntry of entriesByItemId.values()) disposeMapEntry(staleEntry);
        (entriesByItemId.clear(),
          (cachedSelectionKey = selectionKey),
          visibleItems.forEach((visibleItem: any, itemIndex: any) => {
            const geometry = new THREE.BufferGeometry();
            (geometry.setAttribute(
              "position",
              new THREE.Float32BufferAttribute(new Float32Array(12), 3),
            ),
              geometry.setAttribute(
                "uv",
                new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2),
              ),
              geometry.setIndex([0, 2, 1, 0, 3, 2]));
            const material = new THREE.MeshBasicMaterial({
                transparent: true,
                opacity: 0,
                depthWrite: false,
                side: THREE.DoubleSide,
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: -1,
                toneMapped: false,
              }),
              mapMesh = new THREE.Mesh(geometry, material);
            ((mapMesh.name = "vacuum-map-overlay"),
              (mapMesh.userData.environmentEffect = true),
              (mapMesh.raycast = () => {}),
              (mapMesh.visible = false),
              sceneHost.overlayScene.add(mapMesh));
            const mapEntry: {
              mesh: any;
              image: any;
              entityId: any;
              generation: number;
              loading: boolean;
              revision: string;
              pending: boolean;
              floorId: any;
              map: any;
              height: number;
              opacity: number;
              fading: boolean;
              positioned?: any;
            } = {
              mesh: mapMesh,
              image: null as any,
              entityId: visibleItem.map.entityId,
              generation: 0,
              loading: false,
              revision: buildRevisionKey(visibleItem, syncStates),
              pending: false,
              floorId: visibleItem.floorId,
              map: visibleItem.map,
              height: 0.025 + itemIndex * 0.001,
              opacity: (visibleItem.map.opacity ?? 45) / 100,
              fading: false,
            };
            ((mapEntry.positioned = positionMesh(mapEntry)),
              entriesByItemId.set(visibleItem.id, mapEntry));
          }));
      } else {
        if (isInactive) {
          for (const restoredEntry of entriesByItemId.values())
            ((restoredEntry.positioned = positionMesh(restoredEntry)),
              hideAndReleaseTexture(restoredEntry));
        }
      }
      let hasPendingRevision = false;
      for (const changedItem of visibleItems) {
        const existingEntry = entriesByItemId.get(changedItem.id),
          revisionKey = buildRevisionKey(changedItem, syncStates);
        existingEntry &&
          existingEntry.revision !== revisionKey &&
          ((existingEntry.revision = revisionKey),
          (existingEntry.pending = true),
          (hasPendingRevision = true));
      }
      hasSelectionChanged || isInactive
        ? (loadVisibleMaps(), requestRender())
        : hasPendingRevision
          ? rescheduleRefresh()
          : scheduleRefreshIn(refreshIntervalMs);
    },
    tick(timestampMs: any) {
      if (!isActive || isDisposed) return false;
      let isFading = false,
        hasFaded = false;
      for (const fadingEntry of entriesByItemId.values())
        if (fadingEntry.fading) {
          fadingEntry.fadeStart === null && (fadingEntry.fadeStart = timestampMs);
          const fadeRatio = prefersReducedMotion()
              ? 1
              : Math.max(0, Math.min(1, (timestampMs - fadingEntry.fadeStart) / 280)),
            fadeOpacity = fadingEntry.opacity * fadeRatio * fadeRatio * (3 - 2 * fadeRatio);
          ((hasFaded ||= fadingEntry.mesh.material.opacity !== fadeOpacity),
            (fadingEntry.mesh.material.opacity = fadeOpacity),
            (fadingEntry.fading = fadeRatio < 1),
            (isFading ||= fadingEntry.fading));
        }
      return (hasFaded && requestRender(), isFading);
    },
    dispose() {
      ((isDisposed = true), (isActive = false), clearTimeout(refreshTimerId));
      for (const disposedEntry of entriesByItemId.values()) disposeMapEntry(disposedEntry);
      entriesByItemId.clear();
    },
  };
}
export function vacuumStatusPresentation(statusBinding: any, statusStates: Record<string, any> = {}) {
  const resolveEntityState = (entityEntry: any) => entityEntry?.newState || entityEntry || null,
    vacuumStateEntry = resolveEntityState((statusStates as any)[statusBinding.entityId]),
    vacuumAttributes = vacuumStateEntry?.attributes || {},
    statusRelatedEntities = (statusBinding.relatedEntityIds || []).map((statusEntityId: any) => ({
      entityId: statusEntityId,
      role: statusBinding.statusEntityRoles
        ? statusBinding.statusEntityRoles[statusEntityId] || ""
        : undefined,
      state: (statusStates as any)[statusEntityId],
    })),
    statusPresentation = resolveVacuumStatus(vacuumStateEntry, statusRelatedEntities),
    { available: isAvailable } = statusPresentation,
    relatedSensors = (statusBinding.relatedEntityIds || [])
      .filter((relatedEntityId: any) => relatedEntityId.startsWith("sensor."))
      .map((sensorEntityId: any) => ({
        id: sensorEntityId,
        state: resolveEntityState((statusStates as any)[sensorEntityId]),
      })),
    batterySensor =
      relatedSensors.find(
        (batteryCandidate: any) => batteryCandidate.state?.attributes?.device_class === "battery",
      ) ||
      relatedSensors.find(
        (batteryNameCandidate: any) =>
          /(?:^|[._])battery(?:_|$)/.test(batteryNameCandidate.id) &&
          !/filter|brush|mop|life|consumable/.test(batteryNameCandidate.id),
      ),
    parseBatteryPercent = (rawBatteryValue: any) =>
      rawBatteryValue == null ||
      String(rawBatteryValue).trim() === "" ||
      !Number.isFinite(parseFloat(rawBatteryValue))
        ? null
        : Math.max(0, Math.min(100, parseFloat(rawBatteryValue))),
    batteryPercent = isAvailable
      ? ([
          vacuumAttributes.battery_level,
          vacuumAttributes.battery_percentage,
          vacuumAttributes.battery,
          batterySensor?.state?.state,
        ]
          .map(parseBatteryPercent)
          .find((percentValue) => percentValue !== null) ?? null)
      : null;
  return {
    ...statusPresentation,
    battery: batteryPercent === null ? "电量 —" : Math.round(batteryPercent) + "%",
  };
}
