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
/**
 * 结构化相等（键无序）：等价于「``JSON.stringify(sortDeep(x))`` 后比字符串」，
 * 但**不构建字符串**、不做中间对象克隆，且在第一个不同处提前返回。
 *
 * 原实现对整份场景做两轮 ``sortDeep``（每层都排序 + ``Object.fromEntries`` 重建）
 * 再各序列化成一个长字符串，编辑一次场景就是两次全量深拷贝。这里只遍历、不落地。
 *
 * 口径：与旧的字符串比较相比**更保守**（任何拿不准的情况都判为「不相等」），
 * 即最多多报一次变更，绝不会漏报。差异点（都是「旧版认为相等」而这里认为不等）：
 * 值为 ``undefined`` / 函数 / ``NaN`` 的字段，以及数组里的 ``undefined`` 元素。
 */
function stableEquals(left: any, right: any): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!stableEquals(left[index], right[index])) return false;
    }
    return true;
  }
  const leftIsObject = !!left && typeof left === "object",
    rightIsObject = !!right && typeof right === "object";
  if (leftIsObject || rightIsObject) {
    if (!leftIsObject || !rightIsObject) return false;
    // 非普通对象（Date / Map / 类实例）与旧版口径一致：只看自有可枚举键
    const leftKeys = Object.keys(left).sort(),
      rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    for (let index = 0; index < leftKeys.length; index += 1) {
      if (leftKeys[index] !== rightKeys[index]) return false;
      if (!stableEquals(left[leftKeys[index]], right[rightKeys[index]])) return false;
    }
    return true;
  }
  return Number.isNaN(left) && Number.isNaN(right);
}
const floorComparisonShape = (floor: any) => ({
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
      !stableEquals(sharedSceneShape(previousScene), sharedSceneShape(nextScene)) ||
      !stableEquals(
        previousScene.floors.map(floorIdentityShape),
        nextScene.floors.map(floorIdentityShape),
      ),
    changedFloorIds = nextScene.floors
      .filter(
        (candidateFloor: any) =>
          !previousFloorsById.has(candidateFloor.id) ||
          !stableEquals(
            floorComparisonShape(previousFloorsById.get(candidateFloor.id)),
            floorComparisonShape(candidateFloor),
          ),
      )
      .map((changedFloor: any) => changedFloor.id),
    isLightingChanged = !stableEquals(previousScene.baseLighting, nextScene.baseLighting);
  return {
    full: isSceneChanged,
    floors: changedFloorIds,
    lighting: isLightingChanged,
    visual: isSceneChanged || changedFloorIds.length > 0 || isLightingChanged,
  };
}
