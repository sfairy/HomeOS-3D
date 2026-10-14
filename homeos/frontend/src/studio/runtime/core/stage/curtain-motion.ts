/**
 * 窗帘运动重建（舞台侧）：按当前配置/设备态重算窗帘轨道与同步快照。
 *
 * 从 `runtime/core/stage.ts` 的 `mountStage()` 闭包切出，依赖袋 `StageCurtainMotionDeps`。
 */

import { coverState as coverState2 } from "../../cover/cover-state";

/** 依赖袋（宿主 `bootEditor` 作用域）：**每次调用现取**的普通对象，等价于闭包读值。
 * 本族切片只读不写（外层写入 0），所以不需要 getter / state 袋；宿主侧每个函数一个同名
 * 薄转发器，调用点零改写（函数声明保持提升语义）。族内互调留在模块内，不进依赖袋。
 */
export interface StageCurtainMotionDeps {
  mountOptions: any;
  curtainSyncSnapshot: any;
  options: any;
  deviceStates: any;
  syncCoverIconStates: any;
  collectCoverBindings: any;
  collectPreviewCovers: any;
  trackedCoverBindings: any;
  list: any;
  curtainMotion: any;
  coverFeedback: any;
  computeCoverKey: any;
  dreamTiltFeedback: any;
  tiltPreviewByCoverKey: any;
  pruneTiltPreviews: any;
  startupProgress: any;
  nextCoverFeedbackDelay: any;
}

export function rebuildCurtainMotionCore(deps: StageCurtainMotionDeps) {
    const modelRoot = deps.mountOptions.modelRoot,
      sceneRevision = deps.mountOptions.sceneRevision,
      document2 = deps.mountOptions.document;
    if (
      deps.curtainSyncSnapshot?.config === deps.options &&
      deps.curtainSyncSnapshot.states === deps.deviceStates &&
      deps.curtainSyncSnapshot.root === modelRoot &&
      deps.curtainSyncSnapshot.revision === sceneRevision &&
      deps.curtainSyncSnapshot.source === document2
    ) {
      deps.syncCoverIconStates();
      return;
    }
    deps.curtainSyncSnapshot = {
      config: deps.options,
      states: deps.deviceStates,
      root: modelRoot,
      revision: sceneRevision,
      source: document2,
    };
    const coverBindings = [...deps.collectCoverBindings(), ...deps.collectPreviewCovers()];
    ((deps.trackedCoverBindings = coverBindings),
      (deps.list = [
        ...new Set(coverBindings.map((coverBinding) => coverBinding.floorId).filter(Boolean)),
      ]),
      deps.curtainMotion.setBindings(
        modelRoot,
        coverBindings.filter((airerFilterBinding) => !airerFilterBinding.airer),
        sceneRevision,
      ),
      deps.coverFeedback.retain(coverBindings.map(deps.computeCoverKey)));
    const dreamCoverKeys = coverBindings
      .filter((dreamBinding) => dreamBinding.coverKind === "dream")
      .map(deps.computeCoverKey);
    deps.dreamTiltFeedback.retain(dreamCoverKeys);
    for (const staleCoverKey of deps.tiltPreviewByCoverKey.keys())
      dreamCoverKeys.includes(staleCoverKey) || deps.tiltPreviewByCoverKey.delete(staleCoverKey);
    for (const coverBindingForSync of coverBindings) {
      const coverStateSnapshot = coverState2(
        coverBindingForSync.entityId,
        (deps.deviceStates as any)[coverBindingForSync.entityId],
        coverBindingForSync,
      );
      (coverBindingForSync.coverKind === "dream" &&
        deps.dreamTiltFeedback.sync(deps.computeCoverKey(coverBindingForSync), {
          ...coverStateSnapshot,
          dream: false,
          overallFeedbackAvailable: true,
          axis: "blade",
          state: "open",
          position: coverStateSnapshot.tiltPosition,
          opening: false,
          closing: false,
          moving: false,
        }),
        deps.coverFeedback.sync(deps.computeCoverKey(coverBindingForSync), coverStateSnapshot));
    }
    (deps.pruneTiltPreviews(),
      deps.syncCoverIconStates(),
      deps.mountOptions.curtainFrame?.({
        key: deps.curtainMotion.poseKey(),
        structure: deps.curtainMotion.structureKey(),
        floorIds: deps.list,
        moving:
          deps.startupProgress > 0 &&
          (deps.curtainMotion.isMoving() || deps.nextCoverFeedbackDelay() <= 1000 / 30),
      }));
  }
