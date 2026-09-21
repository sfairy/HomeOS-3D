/**
 * 模型本体世界包围盒的唯一实现：环境光晕、气幕版式、NAS 指示灯布局都要先回答「这个模型有多大」。
 *
 * 为什么不用 `Box3.setFromObject`：它会把环境效果（光晕面片、波纹、气幕）、窗帘动画骨架、嵌套模型的
 * 子对象一起算进去，包围盒被撑大 —— 表现出来是指示灯漂出模型、光晕环离模型一圈，且都不报错。
 *
 * 为什么不能读 `matrixWorld`：本帧未必渲染过，它可能还是上一帧的值。因此沿父链把 `matrix` 相乘传下去，
 * 途中对 `matrixAutoUpdate` 的子对象先手动 `updateMatrix()`（手工管理矩阵的对象自己负责，不动它）。
 *
 * 排除项用 userData 标记判定，并且**命中即整棵子树不再下降**（这些子树的坐标语义与模型本体不同）。
 * 三张标记合在一张表里，而不是各调用点各写一份：此前气流只排自己的 `environmentAirflow`、光晕排
 * `environmentEffect` + `curtainMotionRig`、指示灯只排 `environmentEffect`，同一模型在三个模块里
 * 的「本体」边界不一致；`environmentEffect` 是环境效果的统一标记（气流面片两个都会打）。
 *
 * 为什么放在 `core/`：三个消费方分属 environment/ 与 nas/ 两个域，这是跨域共用的几何口径，
 * 与 `core/scene-model-key.js` 同级。
 */

/**
 * 不属于「模型本体」、命中即跳过整棵子树的 userData 标记。
 * 新增环境效果时请给效果对象打上 `environmentEffect`，并在这里确认它该被排除。
 */
const NON_BODY_USER_DATA_KEYS = ["environmentEffect", "environmentAirflow", "curtainMotionRig"];

const isNonBodyNode = node => NON_BODY_USER_DATA_KEYS.some(key => node.userData?.[key]);

/**
 * 量出模型本体的世界包围盒。
 *
 * @param modelRoot 模型根节点；它自身一定参与累加（允许它带 `environmentModelId`），其子节点里带
 *   `environmentModelId` 的是嵌套的独立模型，有自己的原点，整棵跳过。
 * @param threeNamespace 调用方注入的 three 命名空间（运行侧不 import 裸 `/static/` 的 three）。
 * @param options.exact `true` 时按顶点属性求精确包围盒，并逐个分量校验有限性（模型数据里偶有 NaN，
 *   会把整个包围盒污染成无效值）；`false`（默认）用几何体缓存的 `boundingBox`，是 O(1) 的，
 *   适合每次同步都会调用的地方（代价是缓存盒可能比真实顶点略松）。
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
    // `getX` 的可用性检查是刻意的：某些压缩几何体只提供部分读取接口。
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
   * 直接 `applyMatrix4` 会把它改写成世界坐标，污染其它使用者。
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
