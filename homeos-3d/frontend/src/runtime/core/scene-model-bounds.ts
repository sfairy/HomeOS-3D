/**
 * 模型本体世界包围盒的唯一实现：环境光晕、气幕版式、NAS 指示灯布局都要先回答「这个模型有多大」。
 */

/**
 * 不属于「模型本体」、命中即跳过整棵子树的 userData 标记。
 */
const NON_BODY_USER_DATA_KEYS = ["environmentEffect", "environmentAirflow", "curtainMotionRig"];

type ThreeLike = {
  Box3: new () => {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
    union(box: unknown): unknown;
    isEmpty(): boolean;
    setFromBufferAttribute(attribute: unknown): { applyMatrix4(matrix: unknown): unknown };
  };
  Matrix4: new () => {
    multiplyMatrices(a: unknown, b: unknown): unknown;
  };
};

type SceneNode = {
  userData?: Record<string, unknown>;
  isMesh?: boolean;
  geometry?: {
    attributes?: { position?: { count: number; getX?: unknown } };
    boundingBox?: { clone(): { applyMatrix4(matrix: unknown): unknown } } | null;
    computeBoundingBox?: () => void;
  };
  children?: SceneNode[];
  matrixAutoUpdate?: boolean;
  updateMatrix?: () => void;
  matrix?: unknown;
};

const isNonBodyNode = (node: SceneNode) =>
  NON_BODY_USER_DATA_KEYS.some(key => node.userData?.[key]);

/**
 * 量出模型本体的世界包围盒。
 */
export function modelWorldBounds(
  modelRoot: SceneNode,
  threeNamespace: ThreeLike,
  options: { exact?: boolean } = {},
) {
  const { exact = false } = options;
  const boundsBox = new threeNamespace.Box3();

  /**
   * 顶点属性路径：几何体的 cached boundingBox 可能偏松，且不校验 NaN。
   */
  function exactMeshBox(meshNode: SceneNode, meshMatrix: unknown) {
    const positionAttribute = meshNode.geometry?.attributes?.position;
    if (!positionAttribute || !(positionAttribute.count > 0) || typeof positionAttribute.getX !== "function") {
      return null;
    }
    const meshBox = new threeNamespace.Box3()
      .setFromBufferAttribute(positionAttribute)
      .applyMatrix4(meshMatrix) as {
      min: { x: number; y: number; z: number };
      max: { x: number; y: number; z: number };
    };
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
  function cachedMeshBox(meshNode: SceneNode, meshMatrix: unknown) {
    const meshGeometry = meshNode.geometry;
    if (!meshGeometry) {
      return null;
    }
    if (!meshGeometry.boundingBox) {
      meshGeometry.computeBoundingBox?.();
    }
    return meshGeometry.boundingBox
      ? meshGeometry.boundingBox.clone().applyMatrix4(meshMatrix)
      : null;
  }

  function accumulateBounds(node: SceneNode, parentMatrix: unknown) {
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
        childNode.updateMatrix?.();
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
