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
function omitKeys(source: any, excludedKeys: any) {
  const result = {
    ...source,
  };
  for (const key of excludedKeys) delete result[key];
  return result;
}
function sortDeep(value: any): any {
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
const stableStringify = (input: any) => JSON.stringify(sortDeep(input)),
  floorComparisonShape = (floor: any) => ({
    ...floor.scene,
    settings: omitKeys(floor.scene?.settings, VIEW_SETTING_KEYS),
  }),
  floorIdentityShape = (sourceFloor: any) =>
    omitKeys(sourceFloor, ["scene", "name", "aligned", "alignmentPending"]);
export function sceneUpdatePlan(previousScene: any, nextScene: any) {
  const previousFloorsById = new Map(
      previousScene.floors.map((listedFloor: any) => [listedFloor.id, listedFloor]),
    ),
    sharedSceneShape = (scene: any) => omitKeys(scene, [...FLOOR_SHARED_KEYS, "floors", "baseLighting"]),
    isSceneChanged =
      stableStringify(sharedSceneShape(previousScene)) !==
        stableStringify(sharedSceneShape(nextScene)) ||
      stableStringify(previousScene.floors.map(floorIdentityShape)) !==
        stableStringify(nextScene.floors.map(floorIdentityShape)),
    changedFloorIds = nextScene.floors
      .filter(
        (candidateFloor: any) =>
          !previousFloorsById.has(candidateFloor.id) ||
          stableStringify(floorComparisonShape(previousFloorsById.get(candidateFloor.id))) !==
            stableStringify(floorComparisonShape(candidateFloor)),
      )
      .map((changedFloor: any) => changedFloor.id),
    isLightingChanged =
      stableStringify(previousScene.baseLighting) !== stableStringify(nextScene.baseLighting);
  return {
    full: isSceneChanged,
    floors: changedFloorIds,
    lighting: isLightingChanged,
    visual: isSceneChanged || changedFloorIds.length > 0 || isLightingChanged,
  };
}
