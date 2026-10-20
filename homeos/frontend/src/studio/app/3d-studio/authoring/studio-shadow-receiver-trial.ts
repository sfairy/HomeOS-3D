/**
 * 阴影接收试验开关（0.7.8 `studio-shadow-receiver-trial`）。
 *
 * 默认关闭，仅在 URL 带 `?shadow-receiver-trial=non-casters` 时
 * 关闭「非投射体」的 receiveShadow，用于定位阴影接缝与性能问题。
 */

const SHADOW_TRIAL_MODES = new Set(["non-casters"]);

type ShadowReceiverTrialStats = {
  mode: string;
  scope?: string;
  triangleMetric?: string;
  meshes: number;
  receiveDisabled: number;
  triangles: number;
};

/** 解析当前试验模式；非法/缺省返回空串（即关闭）。 */
function shadowReceiverTrialMode(
  search: string = globalThis.location?.search || "",
): string {
  const requestedMode = new URLSearchParams(search).get("shadow-receiver-trial") || "";
  return SHADOW_TRIAL_MODES.has(requestedMode) ? requestedMode : "";
}

/** 三角形计数：索引数 / 3 × 实例数。 */
function triangleCount(mesh: any) {
  return (
    ((mesh.geometry?.index?.count ?? mesh.geometry?.attributes?.position?.count ?? 0) / 3) *
    (mesh.isInstancedMesh ? mesh.count : 1)
  );
}

/** 背景、网格、轮廓、灯光预览与地面接收体不参与试验。 */
function isExcludedReceiver(mesh: any) {
  for (let ancestor = mesh; ancestor; ancestor = ancestor.parent) {
    const exportRole = ancestor.userData?.exportRole;
    if (
      exportRole === "background" ||
      exportRole === "grid" ||
      exportRole === "outline" ||
      exportRole === "light-source-preview" ||
      ancestor.userData?.regionReceiverKind === "floor"
    )
      return true;
  }
  return false;
}

export function applyShadowReceiverTrial(
  rootObject: any,
  mode: string = shadowReceiverTrialMode(),
): ShadowReceiverTrialStats {
  const stats: ShadowReceiverTrialStats = {
    mode: mode || "",
    meshes: 0,
    receiveDisabled: 0,
    triangles: 0,
  };
  if (!rootObject || !SHADOW_TRIAL_MODES.has(mode)) return stats;
  rootObject.traverse((sceneNode: any) => {
    if (!sceneNode.isMesh || isExcludedReceiver(sceneNode)) return;
    const alreadyApplied =
      sceneNode.userData?.shadowReceiverTrial === mode && sceneNode.receiveShadow === false;
    if (
      !alreadyApplied &&
      (sceneNode.castShadow !== false || sceneNode.receiveShadow !== true)
    )
      return;
    ((stats.meshes += 1),
      (stats.receiveDisabled += 1),
      (stats.triangles += triangleCount(sceneNode)),
      alreadyApplied ||
        ((sceneNode.receiveShadow = false), (sceneNode.userData.shadowReceiverTrial = mode)));
  });
  return stats;
}

export function inspectShadowReceiverTrial(
  rootObject: any,
  mode: string = shadowReceiverTrialMode(),
): ShadowReceiverTrialStats {
  const stats: ShadowReceiverTrialStats = {
    mode: SHADOW_TRIAL_MODES.has(mode) ? mode : "",
    scope: "attached-model-root",
    triangleMetric: "full-geometry",
    meshes: 0,
    receiveDisabled: 0,
    triangles: 0,
  };
  if (!rootObject || !stats.mode) return stats;
  rootObject.traverse((sceneNode: any) => {
    !sceneNode.isMesh ||
      sceneNode.userData?.shadowReceiverTrial !== mode ||
      isExcludedReceiver(sceneNode) ||
      ((stats.meshes += 1),
      (stats.receiveDisabled += sceneNode.receiveShadow === false ? 1 : 0),
      (stats.triangles += triangleCount(sceneNode)));
  });
  return stats;
}
