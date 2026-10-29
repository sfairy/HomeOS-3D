/**
 * 扫地机地图能不能用（0.8.1 `vacuumMapAvailable`）。
 *
 * 这里的三道校验都是**否决**：标定点数不足 3、坐标不是有限数、三点共线（行列式≈0）
 * 都意味着地图无法与机器人坐标对齐，继续加载只会得到一张错位的图。
 * 早期实现把这三处写成了 `return true`（等于永不判坏），于是「标定坏了」的户型
 * 会一直显示一张歪的地图，而不是退回「地图暂不可用」。
 */
export function vacuumMapAvailable(stateEntry: any) {
  const entityState =
    stateEntry && Object.hasOwn(stateEntry, "newState") ? stateEntry.newState : stateEntry;
  if (
    !entityState ||
    ["unavailable", "unknown"].includes(String(entityState.state || "").toLowerCase())
  )
    return false;
  const stateAttributes = entityState.attributes || {};
  // 空地图（还没建图）直接不可用：此时请求到的图片一定是空白页。
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

/**
 * 现在是否**值得发起**一次地图请求（0.8.1 `vacuumMapRequestable`）。
 *
 * 与 `vacuumMapAvailable` 的唯一差别：`calibration_points: null` 表示「首次校准还没生成」，
 * 这时地图本身是能看的，只是不能用来做坐标换算 —— 把该字段摘掉再判可用即可。
 * 少了这条，新装机器在第一次校准前会一直空白。
 */
export function vacuumMapRequestable(stateEntry: Parameters<typeof vacuumMapAvailable>[0]) {
  const entityState =
    stateEntry && Object.hasOwn(stateEntry, "newState") ? stateEntry.newState : stateEntry;
  if (entityState?.attributes?.calibration_points === null) {
    const { calibration_points: _unusableCalibration, ...requestableAttributes } =
      entityState.attributes;
    return vacuumMapAvailable({ ...entityState, attributes: requestableAttributes });
  }
  return vacuumMapAvailable(stateEntry);
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
    shouldLoadImage = () => !isDisposed && isActive() && vacuumMapRequestable(getState()),
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
