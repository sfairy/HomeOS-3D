/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import { state } from "./studio-state.js";
import { isStageViewerMode } from "./studio-architecture.js";
import {
  collectActiveLights,
  currentPixelsPerMeter
} from "./studio-plan-render.js";
import { assessFrameRateForAdaptive } from "./studio-render-quality.js";
import {
  clampWindowT,
  mergeCollinearWallSegments,
  remapWallAttachment
} from "../plan/geometry.js";

/**
 * 合并共线的相邻墙段，并把门窗栏杆重挂到合并后的墙上。容差 1e-6 米（1 微米）：只吃吸附与
 */
export function mergeCollinearWalls() {
  const wallById = new Map(state.activeScene.walls.map((indexedWall: any) => [indexedWall.id, indexedWall]));
  const merged = mergeCollinearWallSegments(state.activeScene.walls, 0.000001);
  if (merged.walls.length === state.activeScene.walls.length) {
    return 0;
  }
  const mergedWallById = new Map(
    merged.walls.map((mergedEntryWall: any) => [mergedEntryWall.id, mergedEntryWall])
  );
  /**
   * 把挂在旧墙上的附件按 wallIdMap 重挂到合并后的新墙。三个前置条件（新墙 id、旧墙对象、
   */
  const remapMergedAttachment = (wallAttachment: any) => {
    const newWallId = merged.wallIdMap.get(wallAttachment.wallId);
    const oldWall = wallById.get(wallAttachment.wallId);
    const newWall = mergedWallById.get(newWallId);
    if (!newWallId || !oldWall || !newWall) {
      return wallAttachment;
    }
    const remappedAttachment = remapWallAttachment(wallAttachment, oldWall, newWall);
    remappedAttachment.t = clampWindowT(newWall, remappedAttachment, currentPixelsPerMeter() || 1);
    return remappedAttachment;
  };
  const removedWallCount = state.activeScene.walls.length - merged.walls.length;
  state.activeScene.walls = merged.walls;
  state.activeScene.windows = state.activeScene.windows.map(remapMergedAttachment);
  state.activeScene.doors = state.activeScene.doors.map(remapMergedAttachment);
  state.activeScene.railings = state.activeScene.railings.map(remapMergedAttachment);
  return removedWallCount;
}

/**
 * 采集一帧的耗时样本（渲染循环每帧结束时调用）。只在「需要被度量的渲染」里采样：相机运动（或舞台播放动画）才关心帧率，
 */
export function sampleFrameInterval(frameTimestampMs = performance.now()) {
  if (
    (!state.isCameraMotionActive && (!isStageViewerMode || !state.isMotionRendering)) ||
    state.exportRenderState ||
    state.isAdaptiveRenderActive ||
    !collectActiveLights().length
  ) {
    state.lastFrameTimestampMs = 0;
    return;
  }
  if (state.lastFrameTimestampMs > 0) {
    const frameIntervalMs = frameTimestampMs - state.lastFrameTimestampMs;
    if (
      frameIntervalMs >= 8 &&
      (frameIntervalMs <= 120 || (isStageViewerMode && frameIntervalMs <= 2000))
    ) {
      state.recentFrameDurationsMs.push(Math.min(frameIntervalMs, 120));
    }
  }
  state.lastFrameTimestampMs = frameTimestampMs;
  if (!(state.recentFrameDurationsMs.length < 24)) {
    assessFrameRateForAdaptive();
    state.recentFrameDurationsMs.splice(0, 12);
  }
}
