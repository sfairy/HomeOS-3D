/**
 * 地面反射的可见性剔除：逐面镜子渲染反射贴图时，把「不可能出现在镜像画面里的网格」临时隐藏，
 * 减少反射通道的绘制量。
 *
 * 工作方式：add 收集候选网格 → begin(capture, camera) 以该面镜子在镜像贴图里实际占用的 UV 范围
 * 收窄相机投影矩阵 → 用收窄后的视锥整体剔除 → restore 恢复。capture.matrix 是「世界坐标 → 镜像
 * 贴图 UV 空间」的矩阵，capture.map 是反射渲染目标（用其宽度换算纹素尺寸）；不申请 GPU 资源。
 */

/**
 * 创建一套反射剔除器（每个反射控制器一份，内部状态可跨帧复用）。
 */
export function createReflectionCulling(THREE) {
  // 三种缓存都用 WeakMap：网格被回收后缓存自动失效，不会随场景编辑无限增长。
  // boundsCacheByGeometry 记的是「包围盒是按哪个版本的 position 属性算的」，
  // boxCacheByMesh 记世界包围盒，entryCacheByMesh 复用候选条目对象。
  const boundsCacheByGeometry = new WeakMap();
  const boxCacheByMesh = new WeakMap();
  const entryCacheByMesh = new WeakMap();
  const candidateEntries = [];
  const hiddenMeshes = [];
  // 下面这些临时对象在构造函数里建一次，避免每帧在热路径上反复 new。
  const scratchClipVector = new THREE.Vector4();
  const scratchNdcMatrix = new THREE.Matrix4();
  const scratchProjectionMatrix = new THREE.Matrix4();
  const scratchFrustum = new THREE.Frustum();
  // 统计量暴露给上层做性能观测：受检网格数、被剔数、跳过的整次捕获数。
  const stats = {
    tested: 0,
    culled: 0,
    skippedCaptures: 0
  };
  // 自定义着色器材质无法保证在镜像相机下行为一致（可能读屏幕坐标），
  // 位移贴图会改变顶点位置使包围盒失真，两类都不参与剔除。
  const isUnsupportedMaterial = material =>
    !material || material.isShaderMaterial || material.displacementMap;

  /**
   * 取几何的局部包围盒，属性变化时自动重算。
   */
  function getGeometryBounds(geometry) {
    const positionAttribute = geometry.attributes.position;
    const cachedBounds = boundsCacheByGeometry.get(geometry);
    // 同时比对版本号与底层数据版本：只改 attributes 版本可能漏掉 buffer 被整体替换的情况。
    if (
      !cachedBounds ||
      cachedBounds.attribute !== positionAttribute ||
      cachedBounds.version !== positionAttribute?.version ||
      cachedBounds.dataVersion !== positionAttribute?.data?.version
    ) {
      geometry.computeBoundingBox();
      boundsCacheByGeometry.set(geometry, {
        attribute: positionAttribute,
        version: positionAttribute?.version,
        dataVersion: positionAttribute?.data?.version
      });
    }
    return geometry.boundingBox;
  }

  /**
   * 取网格的世界包围盒，几何或世界矩阵变化时重算。
   */
  function getWorldBounds(mesh) {
    const localBounds = getGeometryBounds(mesh.geometry);
    if (!localBounds || localBounds.isEmpty()) {
      return null;
    }
    let cachedBox = boxCacheByMesh.get(mesh);
    if (!cachedBox) {
      cachedBox = {
        box: new THREE.Box3(),
        local: new THREE.Box3(),
        matrix: new THREE.Matrix4(),
        ready: false
      };
      boxCacheByMesh.set(mesh, cachedBox);
    }
    // 用「局部包围盒 + 世界矩阵」两个比较对象判断是否过期，
    // 比每次都重新 applyMatrix4 便宜，而相等比较会直接短路。
    if (
      !cachedBox.ready ||
      !cachedBox.local.equals(localBounds) ||
      !cachedBox.matrix.equals(mesh.matrixWorld)
    ) {
      cachedBox.local.copy(localBounds);
      cachedBox.matrix.copy(mesh.matrixWorld);
      cachedBox.box.copy(localBounds).applyMatrix4(mesh.matrixWorld);
      cachedBox.ready = true;
    }
    return cachedBox.box;
  }

  /**
   * 清空候选列表并恢复上一轮被隐藏的网格。
   */
  function reset() {
    restore();
    candidateEntries.length = 0;
    stats.tested = stats.culled = stats.skippedCaptures = 0;
  }

  /**
   * 登记一个候选网格（只在满足剔除前提时才登记）。
   */
  function add(candidateMesh, skipShadowCasters = false) {
    // 只有「自带视锥剔除、无子节点、非骨骼 / 非实例化 / 无变形目标」的普通网格才安全：
    // 子节点与实例化网格的可见性会影响多个渲染项，单独隐藏会误伤。
    if (
      !candidateMesh.isMesh ||
      !candidateMesh.visible ||
      !candidateMesh.frustumCulled ||
      (skipShadowCasters && candidateMesh.castShadow) ||
      candidateMesh.children.length ||
      candidateMesh.isSkinnedMesh ||
      candidateMesh.isInstancedMesh ||
      candidateMesh.morphTargetInfluences?.length ||
      !candidateMesh.geometry?.attributes.position ||
      (Array.isArray(candidateMesh.material)
        ? candidateMesh.material.some(isUnsupportedMaterial)
        : isUnsupportedMaterial(candidateMesh.material))
    ) {
      return;
    }
    const worldBounds = getWorldBounds(candidateMesh);
    // 包围盒数值必须全为有限值，否则 NaN 会让 intersectsBox 恒为 false，
    // 结果是把本该可见的网格藏起来，出现「反射里少东西」的怪现象。
    if (
      worldBounds &&
      Number.isFinite(
        worldBounds.min.x +
          worldBounds.min.y +
          worldBounds.min.z +
          worldBounds.max.x +
          worldBounds.max.y +
          worldBounds.max.z
      )
    ) {
      let entry = entryCacheByMesh.get(candidateMesh);
      if (!entry) {
        // 条目在网格生命周期内复用，避免每帧为同样的网格新建对象。
        entry = {
          object: candidateMesh,
          box: worldBounds
        };
        entryCacheByMesh.set(candidateMesh, entry);
      }
      candidateEntries.push(entry);
    }
  }

  /**
   * 针对一面镜子开始一轮剔除：把镜面源物体的世界包围盒投影到镜像贴图 UV 空间，得到它实际占用的矩形，
   * 据此构造「只渲染这块矩形」的投影矩阵并做视锥剔除（既提高有效分辨率，也剔掉大量无关网格）。
   * @returns {boolean} 返回 false 表示镜面在贴图上完全不可见，整次反射可以跳过。
   */
  function begin(capture, camera) {
    restore();
    const sourceBounds = getWorldBounds(capture.source);
    let minU = Infinity;
    let minV = Infinity;
    let maxU = -Infinity;
    let maxV = -Infinity;
    let isInsideFrustum = !!sourceBounds;
    if (sourceBounds) {
      // 遍历包围盒八个角点，逐个投影后取并集，得到镜面在 UV 空间的覆盖范围。
      for (let cornerIndex = 0; cornerIndex < 8; cornerIndex++) {
        scratchClipVector
          .set(
            cornerIndex & 1 ? sourceBounds.max.x : sourceBounds.min.x,
            cornerIndex & 2 ? sourceBounds.max.y : sourceBounds.min.y,
            cornerIndex & 4 ? sourceBounds.max.z : sourceBounds.min.z,
            1
          )
          .applyMatrix4(capture.matrix);
        // w <= 0 表示该角点落在镜像相机背后，UV 没有意义；
        // 此时放弃收窄，退回整屏投影（isInsideFrustum = false）。
        if (scratchClipVector.w <= 0.00001) {
          isInsideFrustum = false;
          break;
        }
        const projectedX = scratchClipVector.x / scratchClipVector.w;
        const projectedY = scratchClipVector.y / scratchClipVector.w;
        minU = Math.min(minU, projectedX);
        maxU = Math.max(maxU, projectedX);
        minV = Math.min(minV, projectedY);
        maxV = Math.max(maxV, projectedY);
      }
    }
    scratchProjectionMatrix.copy(camera.projectionMatrix);
    if (isInsideFrustum) {
      // 边距 = 固定的 14/1024（经验值，覆盖镜面自身的厚度与法线扰动）
      //      + 2 个纹素（吸收采样时的双线性插值，防止边缘出现一条透明缝）。
      const edgePadding = 0.013671875 + 2 / capture.map.width;
      minU = Math.max(0, minU - edgePadding);
      minV = Math.max(0, minV - edgePadding);
      maxU = Math.min(1, maxU + edgePadding);
      maxV = Math.min(1, maxV + edgePadding);
      // 夹取到画布内仍为空，说明镜面完全在视野外，这次反射不必渲染。
      if (maxU <= minU || maxV <= minV) {
        stats.skippedCaptures++;
        return false;
      }
      const uSpan = maxU - minU;
      const vSpan = maxV - minV;
      // 该矩阵把 [minU, maxU] × [minV, maxV] 这段 NDC 区域拉伸到整个 [-1, 1]，
      // 等价于给相机换了个更窄的视锥，只渲染镜面用到的那块区域。
      scratchNdcMatrix.set(
        1 / uSpan,
        0,
        0,
        -(minU + maxU - 1) / uSpan,
        0,
        1 / vSpan,
        0,
        -(minV + maxV - 1) / vSpan,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1
      );
      scratchProjectionMatrix.premultiply(scratchNdcMatrix);
    }
    // 视锥需要在世界空间判定，因此再左乘视图矩阵的逆（即相机世界矩阵的反向组合）。
    scratchFrustum.setFromProjectionMatrix(
      scratchProjectionMatrix.multiply(camera.matrixWorldInverse)
    );
    for (const { object: entryObject, box: entryBounds } of candidateEntries) {
      stats.tested++;
      if (!scratchFrustum.intersectsBox(entryBounds)) {
        // 只关 visible 不改进场景图：restore 时原样打开即可，开销最小。
        hiddenMeshes.push(entryObject);
        entryObject.visible = false;
        stats.culled++;
      }
    }
    return true;
  }

  /**
   * 恢复所有被本轮剔除隐藏的网格。
   */
  function restore() {
    for (const hiddenMesh of hiddenMeshes) {
      hiddenMesh.visible = true;
    }
    hiddenMeshes.length = 0;
  }
  return {
    reset: reset,
    add: add,
    begin: begin,
    restore: restore,
    stats: stats
  };
}
