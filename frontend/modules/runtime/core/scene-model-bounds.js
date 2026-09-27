/**
 * 模型本体世界包围盒的唯一实现：环境光晕、气幕版式、NAS 指示灯布局都要先回答「这个模型有多大」。
 */

/**
 * 不属于「模型本体」、命中即跳过整棵子树的 userData 标记。
 */
const NON_BODY_USER_DATA_KEYS = ["environmentEffect", "environmentAirflow", "curtainMotionRig"];

const isNonBodyNode = node => NON_BODY_USER_DATA_KEYS.some(key => node.userData?.[key]);

/**
 * 量出模型本体的世界包围盒。
 * @param modelRoot 模型根节点；它自身一定参与累加（允许它带 `environmentModelId`），其子节点里带
 * @param threeNamespace 调用方注入的 three 命名空间（运行侧不 import 裸 `/static/` 的 three）。
 * @param options.exact `true` 时按顶点属性求精确包围盒，并逐个分量校验有限性（模型数据里偶有 NaN，
 * @returns 世界坐标 `Box3`；没有任何有效网格时返回 `null`（调用方一律判空后再用）。
 */
export function modelWorldBounds(modelRoot, threeNamespace, options = {}) {
  const { exact = false } = options;
  const boundsBox = new threeNamespace.Box3();

  /**
   * 顶点属性路径：几何体的 cached boundingBox 可能偏松，且不校验 NaN。
   */
  function exactMeshBox(meshNode, meshMatrix) {
    const positionAttribute = meshNode.geometry.attributes.position;
    if (!(positionAttribute.count > 0) || typeof positionAttribute.getX !== "function") {
      return null;
    }
    const meshBox = new threeNamespace.Box3()
      .setFromBufferAttribute(positionAttribute)
      .applyMatrix4(meshMatrix);
    const componentsAreFinite = [
      meshBox.min.x,
      meshBox.min.y,
      meshBox.min.z,
      meshBox.max.x,
      meshBox.max.y,
      meshBox.max.z
    ].every(Number.isFinite);
    return componentsAreFinite ? meshBox : null;
  }

  /**
   * 缓存路径：直接用几何体自带的包围盒（缺就先算一次），**必须 clone 后再变换** ——
   */
  function cachedMeshBox(meshNode, meshMatrix) {
    const meshGeometry = meshNode.geometry;
    if (!meshGeometry) {
      return null;
    }
    if (!meshGeometry.boundingBox) {
      meshGeometry.computeBoundingBox();
    }
    return meshGeometry.boundingBox
      ? meshGeometry.boundingBox.clone().applyMatrix4(meshMatrix)
      : null;
  }

  function accumulateBounds(node, parentMatrix) {
    if (isNonBodyNode(node)) {
      return;
    }
    if (node !== modelRoot && node.userData?.environmentModelId != null) {
      return;
    }
    if (node.isMesh && node.geometry?.attributes?.position) {
      const meshBox = exact
        ? exactMeshBox(node, parentMatrix)
        : cachedMeshBox(node, parentMatrix);
      if (meshBox) {
        boundsBox.union(meshBox);
      }
    }
    for (const childNode of node.children || []) {
      if (childNode.matrixAutoUpdate) {
        childNode.updateMatrix();
      }
      accumulateBounds(
        childNode,
        new threeNamespace.Matrix4().multiplyMatrices(parentMatrix, childNode.matrix)
      );
    }
  }

  accumulateBounds(modelRoot, new threeNamespace.Matrix4());
  return boundsBox.isEmpty() ? null : boundsBox;
}
