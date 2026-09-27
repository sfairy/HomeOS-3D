/**
 * 楼层缓存：楼层切换构建结果的复用、容量回收与释放。
 *
 * 自 studio-app.ts 的 createStageController 内簇工厂化外提。
 * 对 studio-app.ts 内部零依赖（模块级依赖为 0），故不存在循环引用；
 * 簇内可变状态经 getter/setter 暴露。
 */
import { state } from "./studio-state.js";
import { disposeSceneSubtree } from "./studio-mesh-geometry.js";

/* ---------- 工厂 ---------- */

export function createFloorCacheController() {
  const floorTransitionCacheById = new Map();
  let floorCacheEpoch = 0;
  const disposeCachedFloorRecord = (cachedFloorEntry: any) => {
    environmentSceneController?.releaseRoot?.(cachedFloorEntry.node);
    state.regionLightController?.releaseRoot?.(cachedFloorEntry.node);
    disposeSceneSubtree(cachedFloorEntry.node);
  };
  /**
   * @param {Set<string>|null} [keptFloorIdSet=null] 需要保留的楼层 ID 集合。
   */
  const releaseFloorCache = (keptFloorIdSet: any = null) => {
    if (!keptFloorIdSet) {
      floorCacheEpoch++;
    }
    for (const [evictedFloorId, evictedFloorRecord] of floorTransitionCacheById) {
      if (!keptFloorIdSet || !!keptFloorIdSet.has(evictedFloorId)) {
        disposeCachedFloorRecord(evictedFloorRecord);
        floorTransitionCacheById.delete(evictedFloorId);
      }
    }
  };
  /**
   * 把上一帧构建好的楼层记录放回缓存复用，并重置其变换、做容量回收。
   * @returns {boolean} 缓存键缺失或 epoch 不匹配时返回 false，表示不可复用。
   */
  function retainCachedFloorRecord(retainedFloorRecord: any) {
    if (!retainedFloorRecord.cacheKey || retainedFloorRecord.cacheEpoch !== floorCacheEpoch) {
      return false;
    }
    const retainedFloorKey = retainedFloorRecord.id;
    const staleFloorRecord = floorTransitionCacheById.get(retainedFloorKey);
    if (staleFloorRecord && staleFloorRecord.node !== retainedFloorRecord.node) {
      disposeCachedFloorRecord(staleFloorRecord);
    }
    retainedFloorRecord.node.position.set(0, 0, 0);
    retainedFloorRecord.node.quaternion.identity();
    retainedFloorRecord.node.scale.set(1, 1, 1);
    retainedFloorRecord.node.updateMatrixWorld(true);
    floorTransitionCacheById.delete(retainedFloorKey);
    floorTransitionCacheById.set(retainedFloorKey, retainedFloorRecord);
    state.regionLightController?.retainRoot?.(retainedFloorRecord.node);
    environmentSceneController?.retainRoot?.(retainedFloorRecord.node);
    while (floorTransitionCacheById.size > 8) {
      const overflowFloorKey = floorTransitionCacheById.keys().next().value;
      disposeCachedFloorRecord(floorTransitionCacheById.get(overflowFloorKey));
      floorTransitionCacheById.delete(overflowFloorKey);
    }
    return true;
  }
  let environmentSceneController: any = null;

  return {
    get environmentSceneController(): any {
      return environmentSceneController;
    },
    set environmentSceneController(next: any) {
      environmentSceneController = next;
    },
    get floorCacheEpoch(): any {
      return floorCacheEpoch;
    },
    floorTransitionCacheById,
    releaseFloorCache,
    retainCachedFloorRecord
  };
}
