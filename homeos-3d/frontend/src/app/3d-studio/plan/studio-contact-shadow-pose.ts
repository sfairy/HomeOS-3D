/**
 * 接触阴影的位姿解析器：给一根节点返回「阴影烘焙时用的世界矩阵」。
 * 节点若带 userData.contactShadowRestMatrix（静止姿态），用它覆盖自身矩阵；
 * 覆盖会沿父链向上传染，子节点跟着用被覆盖的父世界矩阵相乘。
 */
export function createContactShadowPoseResolver() {
  const poseByObject = new Map();
  function resolvePose(object) {
    if (poseByObject.has(object)) return poseByObject.get(object);
    const parentPose = object.parent ? resolvePose(object.parent) : null,
      restMatrix = object.userData?.contactShadowRestMatrix,
      hasRestMatrix =
        Array.isArray(restMatrix) && restMatrix.length === 16 && restMatrix.every(Number.isFinite),
      overridden = hasRestMatrix || !!parentPose?.overridden;
    let worldMatrix = object.matrixWorld;
    if (overridden) {
      const localMatrix = hasRestMatrix ? object.matrix.clone().fromArray(restMatrix) : object.matrix;
      worldMatrix = parentPose ? parentPose.world.clone().multiply(localMatrix) : localMatrix.clone();
    }
    const pose = {
      world: worldMatrix,
      overridden: overridden,
    };
    return (poseByObject.set(object, pose), pose);
  }
  return (object) => resolvePose(object).world;
}
