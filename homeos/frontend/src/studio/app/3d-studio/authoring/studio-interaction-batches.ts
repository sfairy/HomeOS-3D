/**
 * 交互渲染批处理（0.7.8 `studio-interaction-batches`）。
 *
 * 把静态、同几何同材质的网格按楼层合并成 `InstancedMesh`，减少 draw call；
 * 批次只在渲染之外生效（`renderer.render` 期间恢复原始网格，渲染后再挂回去），
 * 因此拾取与动画逻辑仍能看到真实的对象树。
 */

export type InteractionBatchStats = {
  candidates: number;
  batches: number;
  savedDraws: number;
};

export type InteractionBatchesOptions = {
  THREE: any;
  renderer: any;
  scene: any;
  /** 环境材质状态签名；返回 null 表示该材质不可批处理。 */
  materialState?: (material: any) => string | null;
  /** 楼层相机（多楼层总览时不同楼层可能用不同的相机）。 */
  getCamera?: (mesh: any, camera: any) => any;
  /** 动态对象判定（电视画面、喷雾、流光等不能合并）。 */
  isDynamicObject?: (object: any) => boolean;
};

export function createInteractionBatches({
  THREE: three,
  renderer: webglRenderer,
  scene,
  materialState = () => null,
  getCamera = (_mesh: any, camera: any) => camera,
  isDynamicObject = () => false,
}: InteractionBatchesOptions) {
  let preparedRoot: any = null,
    preparedCamera: any = null,
    candidates: { mesh: any; floor: any }[] = [],
    isDisposed = false;

  const batchesByGroupKey = new Map<any, any>(),
    hiddenMeshes: any[] = [],
    addedBatches: any[] = [],
    stats: InteractionBatchStats = {
      candidates: 0,
      batches: 0,
      savedDraws: 0,
    };

  function isVisible(object: any) {
    for (let node = object; node; node = node.parent) if (!node.visible) return false;
    return true;
  }

  function isBatchable(mesh: any) {
    return (
      mesh.isMesh &&
      !mesh.isInstancedMesh &&
      !mesh.isSkinnedMesh &&
      !mesh.isBatchedMesh &&
      !Array.isArray(mesh.material) &&
      mesh.geometry?.attributes?.position &&
      !Object.keys(mesh.geometry.morphAttributes).length &&
      !mesh.children.length &&
      !mesh.customDepthMaterial &&
      !mesh.customDistanceMaterial &&
      mesh.onBeforeRender === three.Object3D.prototype.onBeforeRender &&
      mesh.onAfterRender === three.Object3D.prototype.onAfterRender &&
      !mesh.userData.environmentEffect &&
      !mesh.userData.computerScreen &&
      !mesh.userData.televisionScreen
    );
  }

  /** 撤下全部批次并恢复被隐藏的原始网格。 */
  function restore() {
    for (const hiddenMesh of hiddenMeshes) hiddenMesh.visible = true;
    for (const batchMesh of addedBatches) batchMesh.removeFromParent();
    hiddenMeshes.length = addedBatches.length = 0;
  }

  // 渲染期间必须用原始网格（批处理只服务渲染之外的对象遍历）；
  // 渲染前后成对地恢复/重新挂载，避免同一帧重复绘制。
  const originalRender = webglRenderer.render;
  const wrappedRender = function (this: any, ...renderArgs: any[]) {
    const previousHiddenMeshes = hiddenMeshes.slice(),
      previousAddedBatches = addedBatches.slice();
    restore();
    try {
      return originalRender.apply(this, renderArgs);
    } finally {
      (restore(),
        !isDisposed &&
          (previousHiddenMeshes.forEach((hiddenMesh) => {
            ((hiddenMesh.visible = false), hiddenMeshes.push(hiddenMesh));
          }),
          previousAddedBatches.forEach((batchMesh) => {
            (scene.add(batchMesh), addedBatches.push(batchMesh));
          })));
    }
  };
  webglRenderer.render = wrappedRender;

  function disposeBatches() {
    restore();
    for (const batchMesh of batchesByGroupKey.values()) batchMesh.dispose();
    batchesByGroupKey.clear();
  }

  /** 收集可批处理候选；根或相机变化时重建一次。 */
  function prepare(root: any, camera: any) {
    if (isDisposed || (preparedRoot === root && preparedCamera === camera)) return;
    (disposeBatches(), (preparedRoot = root), (preparedCamera = camera), (candidates = []));
    root?.traverse((sceneNode: any) => {
      if (!isBatchable(sceneNode)) return;
      let ownerNode = sceneNode;
      while (ownerNode && !ownerNode.userData.environmentModelId)
        ownerNode = ownerNode.parent;
      ownerNode &&
        candidates.push({
          mesh: sceneNode,
          floor: ownerNode.userData.environmentFloorId,
        });
    });
    stats.candidates = candidates.length;
  }

  /** 世界矩阵是否只含旋转 + 均匀缩放（斜切/非均匀缩放会破坏实例矩阵分解）。 */
  function isOrthogonalMatrix(matrix: any) {
    const elements = matrix.elements,
      axisLength = (offset: number) =>
        Math.hypot(elements[offset], elements[offset + 1], elements[offset + 2]);
    for (const [firstAxis, secondAxis] of [
      [0, 4],
      [0, 8],
      [4, 8],
    ]) {
      if (
        Math.abs(
          elements[firstAxis] * elements[secondAxis] +
            elements[firstAxis + 1] * elements[secondAxis + 1] +
            elements[firstAxis + 2] * elements[secondAxis + 2],
        ) >
        axisLength(firstAxis) * axisLength(secondAxis) * 1e-7
      )
        return false;
    }
    return true;
  }

  /** 按「楼层 + 几何 + 材质状态 + 渲染状态」分组并生成/复用实例批次。 */
  function begin(camera: any) {
    (restore(), (stats.batches = stats.savedDraws = 0));
    if (isDisposed) return;
    const groupedBatchRecords = new Map<any, { floor: any; meshes: any[] }>(),
      materialKeyByMaterial = new Map<any, string | null>(),
      frustumByFloor = new Map<any, any>();

    for (const { mesh, floor } of candidates) {
      if (
        !isBatchable(mesh) ||
        isDynamicObject(mesh) ||
        !isVisible(mesh) ||
        mesh.matrixWorld.determinant() <= 0 ||
        !isOrthogonalMatrix(mesh.matrixWorld) ||
        !mesh.layers.mask
      )
        continue;

      if (camera && mesh.frustumCulled) {
        if (!frustumByFloor.has(floor)) {
          const floorCamera = getCamera(mesh, camera);
          frustumByFloor.set(
            floor,
            new three.Frustum().setFromProjectionMatrix(
              new three.Matrix4().multiplyMatrices(
                floorCamera.projectionMatrix,
                floorCamera.matrixWorldInverse,
              ),
            ),
          );
        }
        if (!frustumByFloor.get(floor).intersectsObject(mesh)) continue;
      }

      const meshMaterial = mesh.material;
      if (
        !meshMaterial.visible ||
        meshMaterial.transparent ||
        meshMaterial.opacity !== 1 ||
        meshMaterial.transmission > 0 ||
        meshMaterial.alphaTest > 0 ||
        meshMaterial.clippingPlanes?.length ||
        meshMaterial.displacementMap
      )
        continue;

      if (!materialKeyByMaterial.has(meshMaterial)) {
        let sourceMaterial = meshMaterial;
        let environmentStateKey = "";
        if (meshMaterial.environmentSourceMaterial) {
          environmentStateKey = materialState(meshMaterial) ?? "";
          if (!environmentStateKey) {
            materialKeyByMaterial.set(meshMaterial, null);
            continue;
          }
          sourceMaterial = meshMaterial.environmentSourceMaterial;
        }
        if (sourceMaterial.runtimeSourceMaterial) {
          materialKeyByMaterial.set(meshMaterial, null);
          continue;
        }
        materialKeyByMaterial.set(
          meshMaterial,
          JSON.stringify([
            sourceMaterial.uuid,
            environmentStateKey,
            meshMaterial.version,
            meshMaterial.color?.toArray(),
            meshMaterial.emissive?.toArray(),
            meshMaterial.emissiveIntensity,
            meshMaterial.roughness,
            meshMaterial.metalness,
            meshMaterial.side,
            meshMaterial.depthTest,
            meshMaterial.depthWrite,
            meshMaterial.colorWrite,
          ]),
        );
      }
      const materialKey = materialKeyByMaterial.get(meshMaterial);
      if (materialKey === null) continue;

      const batchGroupKey = JSON.stringify([
        floor,
        mesh.geometry.uuid,
        materialKey,
        mesh.layers.mask,
        mesh.renderOrder,
        mesh.castShadow,
        mesh.receiveShadow,
      ]);
      groupedBatchRecords.has(batchGroupKey) ||
        groupedBatchRecords.set(batchGroupKey, { floor, meshes: [] });
      groupedBatchRecords.get(batchGroupKey)!.meshes.push(mesh);
    }

    const reusedBatchGroupKeys = new Set<any>();
    for (const [batchGroupKey, { floor, meshes }] of groupedBatchRecords) {
      if (meshes.length < 2) continue;
      const firstMesh = meshes[0];
      let batchMesh = batchesByGroupKey.get(batchGroupKey);
      if (!batchMesh || batchMesh.instanceMatrix.count < meshes.length) {
        (batchMesh?.dispose(),
          (batchMesh = new three.InstancedMesh(
            firstMesh.geometry,
            firstMesh.material,
            meshes.length,
          )),
          batchMesh.instanceMatrix.setUsage(three.DynamicDrawUsage),
          (batchMesh.matrixAutoUpdate = false),
          (batchMesh.frustumCulled = false),
          (batchMesh.name = "interaction-render-batch"),
          (batchMesh.castShadow = firstMesh.castShadow),
          (batchMesh.receiveShadow = firstMesh.receiveShadow),
          (batchMesh.layers.mask = firstMesh.layers.mask),
          (batchMesh.renderOrder = firstMesh.renderOrder),
          (batchMesh.userData.floorId = floor),
          (batchMesh.userData.environmentFloorId = floor),
          batchesByGroupKey.set(batchGroupKey, batchMesh));
      }
      ((batchMesh.material = firstMesh.material),
        (batchMesh.count = meshes.length),
        meshes.forEach((batchedMesh, instanceIndex) => {
          (batchMesh.setMatrixAt(instanceIndex, batchedMesh.matrixWorld),
            (batchedMesh.visible = false),
            hiddenMeshes.push(batchedMesh));
        }),
        (batchMesh.instanceMatrix.needsUpdate = true),
        scene.add(batchMesh),
        addedBatches.push(batchMesh),
        reusedBatchGroupKeys.add(batchGroupKey),
        stats.batches++,
        (stats.savedDraws += meshes.length - 1));
    }

    for (const [batchGroupKey, batchMesh] of batchesByGroupKey)
      reusedBatchGroupKeys.has(batchGroupKey) ||
        (batchMesh.dispose(), batchesByGroupKey.delete(batchGroupKey));
  }

  return {
    prepare,
    begin,
    restore,
    stats,
    dispose() {
      ((isDisposed = true),
        disposeBatches(),
        (candidates = []),
        (preparedRoot = null),
        webglRenderer.render === wrappedRender && (webglRenderer.render = originalRender));
    },
  };
}
