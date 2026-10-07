export function vacuumMapAvailable(stateEntry: any) {
  const entityState =
    stateEntry && Object.hasOwn(stateEntry, "newState") ? stateEntry.newState : stateEntry;
  if (
    !entityState ||
    ["unavailable", "unknown"].includes(String(entityState.state || "").toLowerCase())
  )
    return false;
  const stateAttributes = entityState.attributes || {};
  if (stateAttributes.is_empty === true || stateAttributes.empty_map === true) return false;
  if (Object.hasOwn(stateAttributes, "calibration_points")) {
    const calibrationPoints = stateAttributes.calibration_points;
    if (!Array.isArray(calibrationPoints) || calibrationPoints.length < 3) return false;
    const [firstCalibration, secondCalibration, thirdCalibration] = calibrationPoints;
    for (const coordinateSpace of ["map", "vacuum"]) {
      if (
        ![firstCalibration, secondCalibration, thirdCalibration].every(
          (calibrationPoint) =>
            Number.isFinite(calibrationPoint?.[coordinateSpace]?.x) &&
            Number.isFinite(calibrationPoint?.[coordinateSpace]?.y),
        )
      )
        return false;
      const barycentricDeterminant =
        (secondCalibration[coordinateSpace].x - firstCalibration[coordinateSpace].x) *
          (thirdCalibration[coordinateSpace].y - firstCalibration[coordinateSpace].y) -
        (secondCalibration[coordinateSpace].y - firstCalibration[coordinateSpace].y) *
          (thirdCalibration[coordinateSpace].x - firstCalibration[coordinateSpace].x);
      if (Math.abs(barycentricDeterminant) < 1e-9) return false;
    }
  }
  return true;
}
export function vacuumMapSource(sourceEntityId: string, cacheBustTimestamp: string | number = Date.now()) {
  return /^(camera|image)\.[a-z0-9_]+$/.test(sourceEntityId || "")
    ? "/api/" +
        (sourceEntityId.startsWith("camera.") ? "camera" : "image") +
        "_proxy/" +
        encodeURIComponent(sourceEntityId) +
        "?hb=" +
        encodeURIComponent(cacheBustTimestamp) +
        "&hb_live=1"
    : "";
}
export function createVacuumMapImageLoader({
  entityId: entityId,
  getState: getState,
  isActive: isActive,
  onFrame: onFrame,
  onUnavailable: onUnavailable,
}: any) {
  let isDisposed = false,
    hasSynced = false,
    loadingImage: any = null,
    retryTimerId: any = null,
    loadTimeoutId: any = null,
    requestGeneration = 0,
    retryCount = 0,
    lastStateSignature = "",
    lastRequestAtMs = -Infinity,
    isRefreshPending = false;
  const cancelImageLoad = () => {
      (requestGeneration++,
        clearTimeout(retryTimerId),
        clearTimeout(loadTimeoutId),
        (retryTimerId = loadTimeoutId = null),
        loadingImage &&
          ((loadingImage.onload = loadingImage.onerror = null),
          (loadingImage.src = ""),
          (loadingImage = null)));
    },
    shouldLoadImage = () => !isDisposed && isActive() && vacuumMapAvailable(getState()),
    scheduleRefresh = (delayMs: any) => {
      (clearTimeout(retryTimerId),
        (retryTimerId = setTimeout(() => {
          ((retryTimerId = null), loadMapImage());
        }, delayMs)));
    };
  function loadMapImage() {
    if (!shouldLoadImage()) {
      syncState();
      return;
    }
    if (loadingImage) {
      isRefreshPending = true;
      return;
    }
    ((lastRequestAtMs = Date.now()), (isRefreshPending = false));
    const mapImage = new Image(),
      generation = ++requestGeneration;
    loadingImage = mapImage;
    const handleImageResult = (isLoaded: any) => {
      if (!(isDisposed || generation !== requestGeneration)) {
        if (
          (requestGeneration++,
          clearTimeout(loadTimeoutId),
          (loadTimeoutId = null),
          (loadingImage = null),
          (mapImage.onload = mapImage.onerror = null),
          !shouldLoadImage())
        ) {
          ((mapImage.src = ""), syncState());
          return;
        }
        (isLoaded
          ? ((retryCount = 0), onFrame(mapImage))
          : ((mapImage.src = ""), retryCount++, onUnavailable()),
          scheduleRefresh(
            isRefreshPending
              ? Math.max(0, 1000 - (Date.now() - lastRequestAtMs))
              : isLoaded
                ? 5000
                : Math.min(30000, 1000 * 2 ** Math.min(retryCount - 1, 5)),
          ));
      }
    };
    ((mapImage.onload = () => handleImageResult(true)),
      (mapImage.onerror = () => handleImageResult(false)),
      (loadTimeoutId = setTimeout(() => handleImageResult(false), 15000)),
      (mapImage.src = vacuumMapSource(entityId, Date.now() + "-" + generation)));
  }
  function syncState() {
    if (isDisposed) return;
    const isLoadAllowed = shouldLoadImage(),
      reportedState = getState(),
      currentState = reportedState?.newState || reportedState || {},
      vacuumStateAttributes = currentState.attributes || {},
      stateSignature = JSON.stringify([
        currentState.state,
        currentState.updatedAt,
        currentState.last_updated,
        vacuumStateAttributes.image_last_updated,
        vacuumStateAttributes.frame_id,
        vacuumStateAttributes.map_id,
        vacuumStateAttributes.calibration_points,
        vacuumStateAttributes.is_empty,
      ]);
    if (!isLoadAllowed) {
      (cancelImageLoad(),
        (hasSynced = false),
        (lastStateSignature = stateSignature),
        onUnavailable());
      return;
    }
    const isFirstSync = !hasSynced,
      hasStateChanged = lastStateSignature !== stateSignature;
    ((hasSynced = true),
      (lastStateSignature = stateSignature),
      isFirstSync
        ? ((retryCount = 0), loadMapImage())
        : hasStateChanged &&
          (loadingImage
            ? (isRefreshPending = true)
            : scheduleRefresh(Math.max(0, 1000 - (Date.now() - lastRequestAtMs)))));
  }
  return {
    sync: syncState,
    dispose() {
      ((isDisposed = true), cancelImageLoad(), onUnavailable());
    },
  };
}
