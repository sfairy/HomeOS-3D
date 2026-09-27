/**
 * 阴影灯索引。
 */

type SceneObjectLike = {
  isSpotLight?: boolean;
  castShadow?: boolean;
  map?: unknown;
  visible?: boolean;
  layers: { test: (layers: unknown) => boolean };
  parent?: SceneObjectLike | null;
  traverse: (callback: (object: SceneObjectLike) => void) => void;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

type CameraLike = {
  layers: unknown;
};

type ShadowLightEntry = {
  object: SceneObjectLike;
  path: SceneObjectLike[];
};

/**
 * 创建灯光索引实例。
 */
export function createRenderLightIndex() {
  let currentRoot: SceneObjectLike | null = null;
  let needsRebuild = true;
  let isDisposed = false;
  let observedObjects: SceneObjectLike[] = [];
  let shadowLightEntries: ShadowLightEntry[] = [];
  let sortedLights: SceneObjectLike[] = [];
  let traversalLights: SceneObjectLike[] = [];
  let traversalScores: number[] = [];
  // 对象 → 本帧是否可见的缓存：同一祖先被多盏灯共享时只算一次。
  const visibilityByObject = new Map<SceneObjectLike, boolean>();
  const stats = {
    builds: 0,
    sorts: 0,
    reads: 0,
    checkedLights: 0
  };
  // 只置脏不做重算：监听回调可能在渲染过程中触发，重建要推迟到下一次 read。
  const invalidateIndex = () => {
    needsRebuild = true;
  };
  function resetObservers() {
    for (const observedObject of observedObjects) {
      observedObject.removeEventListener("childadded", invalidateIndex);
      observedObject.removeEventListener("childremoved", invalidateIndex);
    }
    observedObjects = [];
    shadowLightEntries = [];
  }
  // 遍历一次全场景，记下所有聚光灯及其到根节点的路径；路径用于后面按祖先可见性剪枝。
  function rebuildIndex() {
    resetObservers();
    traversalLights = [];
    traversalScores = [];
    sortedLights = [];
    currentRoot?.traverse(sceneObject => {
      observedObjects.push(sceneObject);
      sceneObject.addEventListener("childadded", invalidateIndex);
      sceneObject.addEventListener("childremoved", invalidateIndex);
      // 只有聚光灯参与阴影贴图，其它灯型（环境光、平行光）不需要进入索引。
      if (!sceneObject.isSpotLight) {
        return;
      }
      // 自底向上收集到根的路径（含自身与根），供每帧的可见性判断使用。
      const parentPath: SceneObjectLike[] = [];
      for (
        let node: SceneObjectLike | null | undefined = sceneObject;
        node && (parentPath.push(node), node !== currentRoot);
        node = node.parent
      );
      shadowLightEntries.push({
        object: sceneObject,
        path: parentPath
      });
    });
    // 建完立即清脏：同一帧内后续的多次 read 就只重建这一次。
    needsRebuild = false;
    stats.builds++;
  }
  return {
    stats: stats,
    read(root: SceneObjectLike, camera: CameraLike) {
      // 已销毁时返回空数组而不是抛错：调用方不必在每个帧循环里判生命周期。
      if (isDisposed) {
        return [];
      }
      // 根对象被替换（整栋楼重建）时必须整体重算。
      if (currentRoot !== root) {
        currentRoot = root;
        needsRebuild = true;
      }
      if (needsRebuild) {
        rebuildIndex();
      }
      stats.reads++;
      // 每帧清空可见性缓存：只在单帧内复用，跨帧复用会把上一帧的隐藏状态当成当前状态。
      visibilityByObject.clear();
      let visibleLightCount = 0;
      let isOrderChanged = false;
      for (const { object: light, path: lightPath } of shadowLightEntries) {
        stats.checkedLights++;
        let isVisible = true;
        // 祖先链上任何一个 visible === false 都算不可见 —— 父级隐藏即整枝隐藏。
        for (const ancestorNode of lightPath) {
          let cachedVisibility = visibilityByObject.get(ancestorNode);
          if (cachedVisibility === undefined) {
            cachedVisibility = ancestorNode.visible !== false;
            visibilityByObject.set(ancestorNode, cachedVisibility);
          }
          if (!cachedVisibility) {
            isVisible = false;
            break;
          }
        }
        // 层不匹配说明这盏灯不属于当前相机（例如只照亮某个子场景），直接跳过。
        if (!isVisible || !light.layers.test(camera.layers)) {
          continue;
        }
        const shadowScore = (light.castShadow ? 2 : 0) + (light.map ? 1 : 0);
        if (
          traversalLights[visibleLightCount] !== light ||
          traversalScores[visibleLightCount] !== shadowScore
        ) {
          isOrderChanged = true;
        }
        traversalLights[visibleLightCount] = light;
        traversalScores[visibleLightCount] = shadowScore;
        visibleLightCount++;
      }
      // 长度变化同样算顺序改变：有灯被剔除或新灯进入。
      if (traversalLights.length !== visibleLightCount) {
        isOrderChanged = true;
      }
      traversalLights.length = traversalScores.length = visibleLightCount;
      if (isOrderChanged) {
        sortedLights.length = 0;
        for (const orderedLight of traversalLights) {
          sortedLights.push(orderedLight);
        }
        sortedLights.sort(
          (lightA, lightB) =>
            (lightB.castShadow ? 2 : 0) +
            (lightB.map ? 1 : 0) -
            ((lightA.castShadow ? 2 : 0) + (lightA.map ? 1 : 0))
        );
        stats.sorts++;
      }
      // 返回内部数组本身（而非拷贝）：read 是每帧调用的热路径，省掉一次数组分配。
      return sortedLights;
    },
    invalidate: invalidateIndex,
    dispose() {
      isDisposed = true;
      resetObservers();
      visibilityByObject.clear();
      currentRoot = null;
      sortedLights = traversalLights = traversalScores = [];
    }
  };
}
