/**
 * 渲染质量：渲染像素比、自适应帧率评估与导出尺寸约束。
 *
 * 自 studio-app.ts 外提（依赖闭包自底向上）。对本模块之外的 studio-app.ts
 * 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import { state } from "./studio-state.js";
import {
  applyRenderQualityMode,
  invalidateRender,
  isAutoDiagramEmbed
} from "./studio-render-pipeline.js";
import {
  isRegionLightingEnabled,
  isStageViewerMode
} from "./studio-architecture.js";
import {
  measureLightRenderCost,
  selectElement
} from "./studio-plan-render.js";
import {
  assessAdaptiveRenderFrames,
  clamp
} from "../plan/geometry.js";
import { finite } from "../loaders/studio-normalization.js";
import {
  DEFAULT_EXPORT_HEIGHT,
  DEFAULT_EXPORT_WIDTH
} from "./studio-config-tables.js";

export const exportPreviewStageElement = selectElement("#export-preview-stage");

export const exportWidthInput = selectElement("#export-width");

export const exportHeightInput = selectElement("#export-height");

/**
 * 打开自适应渲染（切到光照缓存路径）。只有帧率评估确认「确实撑不住」（sufficient）时才允许开启且不重复开启。
 */
export function enableAdaptiveRender(frameAssessment: any) {
  if (!state.isAdaptiveRenderActive && !!frameAssessment?.sufficient) {
    state.isAdaptiveRenderActive = true;
    state.hasAdaptiveRenderProbe = true;
    state.adaptiveRenderCost = measureLightRenderCost().cost;
    state.lightCacheRevision += 1;
    state.needsLightCacheRefresh = true;
    applyRenderQualityMode();
  }
}

/**
 * 依据最近的帧间隔判断是否该降级到光照缓存。判据是「连续几帧慢」而非单帧：阈值随灯光开销与设备预算之
 */
export function assessFrameRateForAdaptive() {
  if (state.isAdaptiveRenderActive) {
    return;
  }
  const frameStats = assessAdaptiveRenderFrames(state.recentFrameDurationsMs);
  if (!frameStats.sufficient) {
    return;
  }
  const lightCacheRenderCost = measureLightRenderCost();
  const costBudgetRatio = lightCacheRenderCost.cost / Math.max(lightCacheRenderCost.budget, 1);
  const slowStreakThreshold = costBudgetRatio >= 1.8 ? 3 : costBudgetRatio >= 1 ? 4 : 5;
  if (frameStats.severe) {
    state.slowFrameStreak = slowStreakThreshold;
  } else if (frameStats.slow) {
    state.slowFrameStreak += 1;
  } else if (frameStats.smooth) {
    state.slowFrameStreak = 0;
  }
  if (state.slowFrameStreak >= slowStreakThreshold) {
    enableAdaptiveRender(frameStats);
  }
}

export function targetPixelRatio(isMotionRender = false) {
  if (
    isStageViewerMode &&
    isMotionRender &&
    state.motionRenderScale !== null &&
    (!state.isMotionRendering || state.isCameraMotionActive)
  ) {
    return Math.min(window.devicePixelRatio || 1, 1.6) * state.renderScale * state.motionRenderScale;
  }
  if (isRegionLightingEnabled) {
    const regionPixelRatio = Math.min(window.devicePixelRatio || 1, 1.6) * state.renderScale;
    if (isMotionRender) {
      return Math.min(regionPixelRatio, 1);
    } else {
      return regionPixelRatio;
    }
  }
  const isStageMotionRender = isStageViewerMode && state.isMotionRendering;
  let adaptivePixelRatio =
    Math.min(window.devicePixelRatio || 1, isMotionRender ? 1 : 1.6) *
    (isStageViewerMode ? state.renderScale : 1);
  if (isStageViewerMode && (isMotionRender || isStageMotionRender)) {
    const { cost: motionRenderCost, budget: motionRenderBudget } = measureLightRenderCost();
    if (motionRenderCost > motionRenderBudget) {
      adaptivePixelRatio = Math.min(
        adaptivePixelRatio,
        clamp(Math.sqrt(motionRenderBudget / motionRenderCost) * 0.85, 0.5, 0.85)
      );
    }
  }
  return adaptivePixelRatio;
}

/**
 * 把渲染器像素比调整到当前模式（预览 / 导出、运动 / 静止）应使用的值。相机运动期间降采样是
 */
export function updateRenderPixelRatio(
  shouldUseMotionRatio: any,
  { preserveLightCache: preserveLightCache = false } = {}
) {
  if (!state.renderer || (state.exportRenderState && !isAutoDiagramEmbed)) {
    return;
  }
  const targetRatio = state.exportRenderState
    ? exportPixelRatio(shouldUseMotionRatio)
    : targetPixelRatio(shouldUseMotionRatio);
  if (Math.abs(state.renderer.getPixelRatio() - targetRatio) > 0.000001) {
    state.renderer.setPixelRatio(targetRatio);
  }
  invalidateRender({
    preserveLightCache: preserveLightCache
  });
}

export function exportDimensions() {
  return {
    width: Math.round(clamp(finite(exportWidthInput.value, DEFAULT_EXPORT_WIDTH), 320, 4096)),
    height: Math.round(clamp(finite(exportHeightInput.value, DEFAULT_EXPORT_HEIGHT), 320, 4096))
  };
}

export function exportPixelRatio(limitRatio = false) {
  const basePixelRatio = window.devicePixelRatio || 1;
  if (!isAutoDiagramEmbed || !exportPreviewStageElement) {
    return basePixelRatio;
  }
  const { width: stageExportWidthPx, height: stageExportHeightPx } = exportDimensions();
  const exportStageWidthPx = Math.max(exportPreviewStageElement.clientWidth, 1);
  const exportStageHeightPx = Math.max(exportPreviewStageElement.clientHeight, 1);
  const requiredPixelRatio = Math.max(
    basePixelRatio,
    stageExportWidthPx / exportStageWidthPx,
    stageExportHeightPx / exportStageHeightPx,
    1.5
  );
  return Math.min(requiredPixelRatio, limitRatio ? 2 : 4);
}
