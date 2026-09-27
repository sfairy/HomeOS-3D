/**
 * 场景变更比对：判断新一批项目数据相对上一次，需要重建还是增量更新。
 */

// 这些 settings 只改变编辑器的观察方式（视图旋转、剖切、吸附、面板宽度等），
const IGNORED_SETTING_KEYS = [
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
  "detailsPanelWidthRatio"
];
// 项目级忽略项：当前编辑楼层、导出预设等属于编辑态；baseLighting 虽然影响渲染，
const IGNORED_PROJECT_KEYS = [
  "activeFloorId",
  "previewFloorMode",
  "combinedCameraSettings",
  "combinedFixedCameraView",
  "exportFloorGap",
  "exportPresets",
  "activeExportPresetSlot"
];
// 浅拷贝后按名单删键；不修改入参，保证比较过程对调用方的数据无副作用。
function omitKeys(source, keys) {
  const result = {
    ...source
  };
  for (const omittedKey of keys) {
    delete result[omittedKey];
  }
  return result;
}
// 递归按键名排序：JSON.stringify 的结果受键序影响，不排序会把「同内容不同键序」
function sortDeep(node) {
  if (Array.isArray(node)) {
    return node.map(sortDeep);
  } else if (node && typeof node == "object") {
    return Object.fromEntries(
      Object.keys(node)
        .sort()
        .map(sortKey => [sortKey, sortDeep(node[sortKey])])
    );
  } else {
    return node;
  }
}
const stableStringify = value => JSON.stringify(sortDeep(value));
// 楼层的内容签名：只看 scene，并把纯观察类设置剔除。
const sceneSignature = floorRecord => ({
  ...floorRecord.scene,
  settings: omitKeys(floorRecord.scene?.settings, IGNORED_SETTING_KEYS)
});
// 楼层级的结构签名：scene 已单独做签名，名称与对齐进度属于编辑流程状态，一并剔除。
const floorSignature = floorEntry =>
  omitKeys(floorEntry, ["scene", "name", "aligned", "alignmentPending"]);
/**
 * 计算相对上一次数据的增量更新方案：结构变化只能重建，楼层变化可只换网格，灯光变化只需重算
 */
export function sceneUpdatePlan(previousProject, nextProject) {
  const floorsById = new Map(
    previousProject.floors.map(existingFloor => [existingFloor.id, existingFloor])
  );
  const projectSignature = project =>
    omitKeys(project, [...IGNORED_PROJECT_KEYS, "floors", "baseLighting"]);
  // 结构变化 = 项目级字段或任一楼层的非场景字段变化：这类改动无法增量，必须整场重建。
  const structureChanged =
    stableStringify(projectSignature(previousProject)) !==
      stableStringify(projectSignature(nextProject)) ||
    stableStringify(previousProject.floors.map(floorSignature)) !==
      stableStringify(nextProject.floors.map(floorSignature));
  // 逐层比对场景签名；nextProject 里新增的楼层（floorsById 中没有）也算变化。
  const changedFloorIds = nextProject.floors
    .filter(
      candidateFloor =>
        !floorsById.has(candidateFloor.id) ||
        stableStringify(sceneSignature(floorsById.get(candidateFloor.id))) !==
          stableStringify(sceneSignature(candidateFloor))
    )
    .map(floor => floor.id);
  // baseLighting 是整栋楼共享的灯光参数，单列出来是为了允许「只重算灯光」这一最轻的更新路径。
  const lightingChanged =
    stableStringify(previousProject.baseLighting) !== stableStringify(nextProject.baseLighting);
  // visual 是给调用方的唯一总开关：三个维度的任一变化都会改变画面；
  return {
    full: structureChanged,
    floors: changedFloorIds,
    lighting: lightingChanged,
    visual: structureChanged || changedFloorIds.length > 0 || lightingChanged
  };
}
