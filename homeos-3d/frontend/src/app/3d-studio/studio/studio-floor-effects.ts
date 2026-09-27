/**
 * 舞台灯光过渡：灯光开关的淡入淡出、灯光模型会话与灯光缓存协调。
 *
 * 自 studio-app.ts 的 createStageController 内簇工厂化外提。
 * 对 studio-app.ts 内部零依赖（模块级依赖为 0），故不存在循环引用；
 * 簇内可变状态经 getter/setter 暴露；相机运动标志由调用方经 deps 注入。
 */
import { requestRenderFrame } from "./studio-render-pipeline.js";
import { state } from "./studio-state.js";
import { isRegionLightingEnabled } from "./studio-architecture.js";
import { createMotionPresentation } from "./studio-motion-presentation.js";
import { currentPreviewFloorMode } from "./studio-plan-render.js";
import { createGroundReflections } from "../reflection/studio-ground-reflections.js";
import * as threeModuleMin from "/static/vendor/three/0.186.0/three.module.min.js";

/* ---------- 工厂 ---------- */

export function createFloorEffectsController() {
  const groundReflectionsController = createGroundReflections({
    THREE: threeModuleMin,
    renderer: state.renderer,
    scene: state.previewOverlayScene,
    getRoot: () => state.previewModelRoot,
    getSceneRevision: () => state.sceneCacheRevision,
    floorLighting: isRegionLightingEnabled,
    getFloorCamera: (reflectionFloorCamera: any, reflectionFloorId: any) =>
      state.overviewStackController?.reflectionCamera(reflectionFloorCamera, reflectionFloorId) ||
      reflectionFloorCamera,
    cull: true,
    blur: false,
    syncLighting: (reflectionSyncFloorCamera: any) =>
      state.regionLightController?.syncCamera(reflectionSyncFloorCamera),
    requestFrame: () => requestRenderFrame(),
    getStateKey: () =>
      [
        state.sceneCacheRevision,
        state.isEnvironmentActive,
        state.studioDocument.uniformOverviewStack === true,
        isRegionLightingEnabled ? "" : state.lightCacheRevision,
        state.isLightCacheReady,
        state.renderer.toneMappingExposure
      ].join("|")
  });
  let areFloorEffectsPaused = false;
  let areReflectionsSuspended = false;
  const motionPresentation = createMotionPresentation({
    reflections(isPresentationSuspended) {
      areReflectionsSuspended = isPresentationSuspended;
      groundReflectionsController.setSuspended?.(areFloorEffectsPaused || isPresentationSuspended, {
        fade: !areFloorEffectsPaused
      });
    },
    shadows(isPresentationMotion) {
      state.contactShadowController?.setVisibleFloor?.(
        currentPreviewFloorMode() === "all" ? null : state.activeFloorId
      );
      state.contactShadowController?.setMotion?.(isPresentationMotion);
    }
  });
  const areFloorEffectsFollowed = isRegionLightingEnabled;
  let areShadowsFrozen = false;
  let shadowRestoreStartMs: any = null;
  let shadowAutoUpdateBefore = true;
  const shadowIntensityByShadow = new Map();
  /**
   * 切换阴影的运动态与冻结态：运动时打开阴影自动更新，静止后用强度渐变收尾。
   * @param {boolean} isShadowMotion 是否处于运动状态。
   */
  function setMotionShadows(isShadowMotion: any) {
    if (areShadowsFrozen !== isShadowMotion) {
      areShadowsFrozen = isShadowMotion;
      if (areFloorEffectsFollowed) {
        if (isShadowMotion) {
          shadowAutoUpdateBefore = state.renderer.shadowMap.autoUpdate;
        }
        state.renderer.shadowMap.autoUpdate = isShadowMotion ? true : shadowAutoUpdateBefore;
        state.renderer.shadowMap.needsUpdate = true;
        state.regionLightController?.setMotion?.(isShadowMotion, true);
        return;
      }
      if (isShadowMotion) {
        shadowRestoreStartMs = null;
        shadowAutoUpdateBefore = state.renderer.shadowMap.autoUpdate;
        state.renderer.shadowMap.autoUpdate = false;
        state.renderer.shadowMap.needsUpdate = false;
        state.previewOverlayScene.traverse((shadowSceneNode: any) => {
          if (
            !!shadowSceneNode.isLight &&
            !!shadowSceneNode.castShadow &&
            !!shadowSceneNode.shadow
          ) {
            if (!shadowIntensityByShadow.has(shadowSceneNode.shadow)) {
              shadowIntensityByShadow.set(
                shadowSceneNode.shadow,
                shadowSceneNode.shadow.intensity ?? 1
              );
            }
            shadowSceneNode.shadow.intensity = 0;
          }
        });
      } else {
        state.renderer.shadowMap.autoUpdate = shadowAutoUpdateBefore;
        state.renderer.shadowMap.needsUpdate = true;
        shadowRestoreStartMs = performance.now();
      }
      state.regionLightController?.setMotion?.(isShadowMotion);
    }
  }
  /**
   * 逐帧把冻结期间被压低的阴影强度恢复回原值，用于运动结束后的收尾动画。
   * @returns {void} 无返回值。
   */
  function restoreShadowIntensity() {
    if (areShadowsFrozen || shadowRestoreStartMs === null) {
      return;
    }
    const shadowRestoreProgress = Math.min(1, (performance.now() - shadowRestoreStartMs) / 280);
    for (const [restoringShadow, restoringShadowIntensity] of shadowIntensityByShadow) {
      restoringShadow.intensity = restoringShadowIntensity * shadowRestoreProgress;
    }
    if (shadowRestoreProgress < 1) {
      requestRenderFrame();
    } else {
      shadowIntensityByShadow.clear();
      shadowRestoreStartMs = null;
    }
  }
  /**
   * 挂起或恢复楼层相关动效与阴影更新，供楼层切换、导出等需要稳定画面的场景调用。
   * @param {boolean} isFloorEffectSuspended 是否挂起。
   */
  function suspendFloorEffects(isFloorEffectSuspended: any) {
    motionPresentation.floor(isFloorEffectSuspended);
    setMotionShadows(isFloorEffectSuspended);
  }

  return {
    areFloorEffectsFollowed,
    get areFloorEffectsPaused(): any {
      return areFloorEffectsPaused;
    },
    set areFloorEffectsPaused(next: any) {
      areFloorEffectsPaused = next;
    },
    get areReflectionsSuspended(): any {
      return areReflectionsSuspended;
    },
    get areShadowsFrozen(): any {
      return areShadowsFrozen;
    },
    set areShadowsFrozen(next: any) {
      areShadowsFrozen = next;
    },
    groundReflectionsController,
    motionPresentation,
    restoreShadowIntensity,
    suspendFloorEffects
  };
}
