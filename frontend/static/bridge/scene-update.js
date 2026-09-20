/**
 * 场景变更比对：判断新一批项目数据相对上一次，需要重建还是增量更新。
 *
 * 编辑器每次收到项目保存 / 协作推送后调用，结果驱动 3D 场景的更新策略；只做纯计算。对外导出
 * sceneUpdatePlan。判定是「内容级」的：只影响编辑器视图状态、不影响渲染结果的字段被显式排除
 * （见下方忽略表），否则切换正交视图、拖动预览面板宽度都会触发整场重建。
 */

// 这些 settings 只改变编辑器的观察方式（视图旋转、剖切、吸附、面板宽度等），
// 不改变导出的 3D 内容，因此不参与「场景是否变化」的判定。
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
// 但它有独立的灯光通道，所以也从结构签名里剔除、走单独的 lighting 判定。
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
// 误判成变化，进而触发无意义的重建。
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
// 全模块统一的比较基准：任何字段比较都必须经过它，否则会漏掉键序差异。
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
 * 光照，调用方据此避免「改一盏灯就重建整栋楼」。
 */
export function sceneUpdatePlan(previousProject, nextProject) {
  const floorsById = new Map(
    previousProject.floors.map(existingFloor => [existingFloor.id, existingFloor])
  );
  // 项目级签名一次算好复用两次，避免在大项目上重复做稳定序列化。
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
  // 分开返回这四项，是为了让调用方能在 visual 为真时选择代价最小的更新路径。
  return {
    full: structureChanged,
    floors: changedFloorIds,
    lighting: lightingChanged,
    visual: structureChanged || changedFloorIds.length > 0 || lightingChanged
  };
}
