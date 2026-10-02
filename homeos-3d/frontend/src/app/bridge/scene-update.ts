const VIEW_SETTING_KEYS = [
    "planViewRotation",
    "cameraView",
    "cameraTopRotation",
    "cameraMode",
    "cameraFocalLength",
    "fixedCameraView",
    "livePreviewEnabled",
    "backgroundVisible",
    "snapEnabled",
    "snapEndpoints",
    "snapIntersections",
    "snapSegments",
    "snapOrthogonal",
    "snapAngles",
    "snapGrid",
    "snapTolerance",
    "previewPanelRatio",
    "detailsPanelWidthRatio",
  ],
  FLOOR_SHARED_KEYS = [
    "activeFloorId",
    "previewFloorMode",
    "combinedCameraSettings",
    "combinedFixedCameraView",
    "exportFloorGap",
    "exportPresets",
    "activeExportPresetSlot",
  ];
function omitKeys(source, excludedKeys) {
  const result = {
    ...source,
  };
  for (const key of excludedKeys) delete result[key];
  return result;
}
function sortDeep(value) {
  return Array.isArray(value)
    ? value.map(sortDeep)
    : value && typeof value == "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((nestedKey) => [nestedKey, sortDeep(value[nestedKey])]),
        )
      : value;
}
const stableStringify = (input) => JSON.stringify(sortDeep(input)),
  floorComparisonShape = (floor) => ({
    ...floor.scene,
    settings: omitKeys(floor.scene?.settings, VIEW_SETTING_KEYS),
  }),
  floorIdentityShape = (sourceFloor) =>
    omitKeys(sourceFloor, ["scene", "name", "aligned", "alignmentPending"]);
export function sceneUpdatePlan(previousScene, nextScene) {
  const previousFloorsById = new Map(
      previousScene.floors.map((listedFloor) => [listedFloor.id, listedFloor]),
    ),
    sharedSceneShape = (scene) => omitKeys(scene, [...FLOOR_SHARED_KEYS, "floors", "baseLighting"]),
    isSceneChanged =
      stableStringify(sharedSceneShape(previousScene)) !==
        stableStringify(sharedSceneShape(nextScene)) ||
      stableStringify(previousScene.floors.map(floorIdentityShape)) !==
        stableStringify(nextScene.floors.map(floorIdentityShape)),
    changedFloorIds = nextScene.floors
      .filter(
        (candidateFloor) =>
          !previousFloorsById.has(candidateFloor.id) ||
          stableStringify(floorComparisonShape(previousFloorsById.get(candidateFloor.id))) !==
            stableStringify(floorComparisonShape(candidateFloor)),
      )
      .map((changedFloor) => changedFloor.id),
    isLightingChanged =
      stableStringify(previousScene.baseLighting) !== stableStringify(nextScene.baseLighting);
  return {
    full: isSceneChanged,
    floors: changedFloorIds,
    lighting: isLightingChanged,
    visual: isSceneChanged || changedFloorIds.length > 0 || isLightingChanged,
  };
}
