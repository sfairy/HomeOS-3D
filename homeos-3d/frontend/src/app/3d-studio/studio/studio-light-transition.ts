/**
 * 舞台灯光过渡：灯光开关的淡入淡出、灯光模型会话与灯光缓存协调。
 *
 * 自 studio-app.ts 的 createStageController 内簇工厂化外提。
 * 对 studio-app.ts 内部零依赖（模块级依赖为 0），故不存在循环引用；
 * 簇内可变状态经 getter/setter 暴露；相机运动标志由调用方经 deps 注入。
 */
import {
  DEFAULT_LIGHT_SETTINGS,
  LIGHT_TYPE_BRIGHTNESS_SCALE
} from "./studio-config-tables.js";
import {
  clamp,
  spotLightBrightnessResponse
} from "../plan/geometry.js";
import { finite } from "../loaders/studio-normalization.js";
import { isRegionLightingEnabled } from "./studio-architecture.js";
import { state } from "./studio-state.js";
import {
  assessFrameRateForAdaptive,
  updateRenderPixelRatio
} from "./studio-render-quality.js";
import {
  collectPreviewLights,
  currentPreviewFloorMode,
  floorItemKey,
  isAdaptiveLightCacheEnabled,
  lightCacheCanvasElement,
  lightGroupScopeKey,
  setLightCacheVisible
} from "./studio-plan-render.js";
import {
  applyRenderQualityMode,
  applyShadowBudget,
  collectLightsByItemKey,
  compositeLightCache,
  ensureLightModels,
  hideRenderShield,
  requestRenderFrame,
  scheduleLightCacheBuild,
  scheduleLightPrecompile
} from "./studio-render-pipeline.js";
import {
  createLightTransition,
  lightEffectColorHex,
  lightTransitionDurationMs,
  mapLightEffectState,
  sampleLightTransition
} from "../../bridge/light-motion.js";
import { LIGHT_ITEM_TYPES } from "./studio-item-types.js";
import * as threeModuleMin from "/static/vendor/three/0.186.0/three.module.min.js";

/* ---------- 工厂 ---------- */

export function createLightTransitionController(deps: {
  isCameraMotionRunning: () => any;
  isControlInteractionActive: {
    get: () => any;
    set: (next: any) => void;
  };
}) {
  const lightTransitionsByLight = new Map();
  const lightFadesByGroupKey = new Map();
  let lightFadeFrameHandle = 0;
  let lightTransitionFrameHandle = 0;
  let lightSettleTimeoutHandle: any = null;
  let hasReceivedLightStates = false;
  let forceLightStateRefresh = false;
  let isPageHideCleanupInstalled = false;
  let motionRenderTimeoutHandle: any = null;
  let lightSessionModelRoot: any;
  let lightSessionFirstChild: any;
  let needsLightVisibilitySync = false;
  let sessionLightsByItemKey = new Map();
  let previewLightsByItemKey = new Map();
  const lightTransitionSessionToken = {
    restore: () => syncLightTransitionSession(performance.now(), true)
  };
  /**
   * 开关「运动渲染」：运动时提高渲染像素比，停止后延时降回并顺带评估自适应帧率。
   * @param {boolean} isMotionActive 是否处于运动状态。
   */
  function setMotionRenderingActive(isMotionActive: any) {
    if (motionRenderTimeoutHandle !== null) {
      window.clearTimeout(motionRenderTimeoutHandle);
    }
    motionRenderTimeoutHandle = null;
    if (isMotionActive) {
      if (state.isMotionRendering) {
        return;
      }
      state.isMotionRendering = true;
      state.lastFrameTimestampMs = 0;
      updateRenderPixelRatio(true, {
        preserveLightCache: true
      });
    } else if (state.isMotionRendering) {
      motionRenderTimeoutHandle = window.setTimeout(() => {
        motionRenderTimeoutHandle = null;
        state.isMotionRendering = false;
        assessFrameRateForAdaptive();
        state.lastFrameTimestampMs = 0;
        updateRenderPixelRatio(state.isCameraMotionActive, {
          preserveLightCache: true
        });
      }, 140);
    }
  }
  /**
   * 把亮度百分比换算成渲染响应值：区域光下线性，灯带做幂次压缩，其余按灯具类型的响应曲线。
   * @param {number} brightnessPercent 亮度百分比（0-150，舞台查看器可达 150）。
   * @returns {number} 0-1.5 的响应系数。
   */
  function lightBrightnessResponse(brightnessLightItem: any, brightnessPercent: any) {
    const brightnessFraction = clamp(finite(brightnessPercent, 0), 0, 150) / 100;
    if (isRegionLightingEnabled) {
      return brightnessFraction;
    } else if (brightnessLightItem.type === "striplight") {
      return Math.pow(brightnessFraction, 0.82);
    } else {
      // 与 spotBaseIntensity 同理：>100% 的部分要靠这个因子才真正提亮。
      return spotLightBrightnessResponse(brightnessLightItem.type, brightnessFraction) *
        Math.max(1, brightnessFraction);
    }
  }
  /**
   * 计算灯具的基准光强：普通灯具按类型取常量，灯带再结合照射范围与安装高度做补偿。
   * @returns {number} 该灯具的基准光强。
   */
  function baseLightIntensity(intensityLightItem: any) {
    const lightTypeDefaultSettings =
      (DEFAULT_LIGHT_SETTINGS as any)[intensityLightItem.type] || DEFAULT_LIGHT_SETTINGS.downlight;
    const typeBrightnessScale = (LIGHT_TYPE_BRIGHTNESS_SCALE as any)[intensityLightItem.type] || 1.1;
    if (intensityLightItem.type !== "striplight") {
      return (intensityLightItem.type === "ceilinglight" ? 680 : 520) * typeBrightnessScale;
    }
    const lightRangeMeters = clamp(
      finite(intensityLightItem.lightRange, lightTypeDefaultSettings.range),
      0.5,
      10
    );
    const lightElevationMeters = Math.max(finite(intensityLightItem.elevation, 2.7), 0.4);
    return (
      clamp(lightRangeMeters / lightTypeDefaultSettings.range, 0.45, 1.65) *
      48 *
      clamp(Math.max(1, Math.pow(lightElevationMeters / 2.7, 2)), 1, 4) *
      typeBrightnessScale
    );
  }
  /**
   * 把一次灯光过渡采样结果写到 Three.js 灯光对象上（强度、颜色与可见性）。
   * @param {object} sampledLightObject 目标 Three.js 灯光对象。
   * @param {{intensity:number,color:number[],complete:boolean}} lightTransitionSample 采样结果。
   */
  function applyTransitionSample(sampledLightObject: any, lightTransitionSample: any) {
    sampledLightObject.intensity = lightTransitionSample.intensity;
    sampledLightObject.color.fromArray(lightTransitionSample.color);
    sampledLightObject.visible =
      lightTransitionSample.intensity > 0.000001 || !lightTransitionSample.complete;
  }
  /**
   * 同步灯光过渡会话：模型根节点变化时重建逐灯索引，并按需把每盏灯的可见性刷成当前开关状态。
   * @param {number} sessionFrameTimeMs 当前帧时间戳（毫秒）。
   * @param {boolean} [forceVisibilitySync=false] 是否强制刷新可见性。
   */
  function syncLightTransitionSession(sessionFrameTimeMs: any, forceVisibilitySync = false) {
    if (state.lightTransitionSession === lightTransitionSessionToken) {
      if (
        lightSessionModelRoot !== state.previewModelRoot ||
        lightSessionFirstChild !== state.previewModelRoot?.children[0]
      ) {
        lightSessionModelRoot = state.previewModelRoot;
        lightSessionFirstChild = state.previewModelRoot?.children[0];
        sessionLightsByItemKey = collectLightsByItemKey();
        previewLightsByItemKey = new Map(
          collectPreviewLights().map((previewLightRecord: any) => [
            previewLightRecord.itemKey,
            previewLightRecord
          ])
        );
        needsLightVisibilitySync = true;
      }
      if (forceVisibilitySync || needsLightVisibilitySync) {
        for (const [sessionItemKey, sessionItemLights] of sessionLightsByItemKey) {
          const previewEntryForItem = previewLightsByItemKey.get(sessionItemKey);
          if (!previewEntryForItem) {
            continue;
          }
          const isItemLightOn =
            previewEntryForItem.group?.enabled !== false &&
            previewEntryForItem.item.lightBrightness > 0;
          for (const sessionLightObject of sessionItemLights) {
            sessionLightObject.intensity = isItemLightOn
              ? finite(sessionLightObject.userData.lightOnIntensity, 0)
              : 0;
            sessionLightObject.visible = isItemLightOn;
            sessionLightObject.color.setHex(
              lightEffectColorHex(previewEntryForItem.item.lightTemperature)
            );
          }
        }
      }
      needsLightVisibilitySync = false;
    }
    for (const [transitioningLight, activeLightTransition] of lightTransitionsByLight) {
      applyTransitionSample(
        transitioningLight,
        sampleLightTransition(activeLightTransition, sessionFrameTimeMs)
      );
    }
  }
  /**
   * 按时间对单条灯光渐变做 smoothstep 插值。
   * @param {number} fadeFrameTimeMs 当前帧时间戳（毫秒）。
   * @returns {number} 该时刻的插值结果。
   */
  function sampleLightFade(lightFadeEntry: any, fadeFrameTimeMs: any) {
    const lightFadeProgress = lightFadeEntry.duration
      ? clamp((fadeFrameTimeMs - lightFadeEntry.started) / lightFadeEntry.duration, 0, 1)
      : 1;
    return (
      lightFadeEntry.from +
      (lightFadeEntry.to - lightFadeEntry.from) *
        lightFadeProgress *
        lightFadeProgress *
        (3 - lightFadeProgress * 2)
    );
  }
  /**
   * 取消所有灯光渐变：停掉补间帧并清空渐变表。
   * @returns {void} 无返回值。
   */
  function cancelLightFade() {
    if (lightFadeFrameHandle) {
      cancelAnimationFrame(lightFadeFrameHandle);
    }
    lightFadeFrameHandle = 0;
    lightFadesByGroupKey.clear();
    state.isLightFadeAnimating = false;
  }
  /**
   * 灯光渐变的每帧推进：更新各组亮度、合成为灯光明暗纹理，并在还有渐变时请求下一帧。
   * @param {number} fadeTickTimestampMs 当前帧时间戳（毫秒）。
   */
  function advanceLightFade(fadeTickTimestampMs: any) {
    lightFadeFrameHandle = 0;
    if (
      !state.isLightCacheReady ||
      state.needsLightCacheRefresh ||
      lightCacheCanvasElement.hidden ||
      state.lightTransitionSession
    ) {
      cancelLightFade();
      return;
    }
    for (const [fadeGroupKey, fadingEntry] of lightFadesByGroupKey) {
      state.brightnessByLightGroupKey.set(
        fadeGroupKey,
        sampleLightFade(fadingEntry, fadeTickTimestampMs)
      );
      if (fadeTickTimestampMs >= fadingEntry.started + fadingEntry.duration) {
        lightFadesByGroupKey.delete(fadeGroupKey);
      }
    }
    state.isLightFadeAnimating = lightFadesByGroupKey.size > 0;
    compositeLightCache();
    if (lightFadesByGroupKey.size) {
      lightFadeFrameHandle = requestAnimationFrame(advanceLightFade);
    }
  }
  /**
   * 尝试为一批灯组启动渐变；灯光缓存未就绪、相机正在运动或过渡会话激活时放弃本次渐变。
   * @returns {boolean} 是否成功启动渐变。
   */
  function startGroupLightFades(groupLightEntriesByKey: any, isImmediateFade: any, fadeTransitionOptions: any) {
    if (
      !state.isLightCacheReady ||
      state.needsLightCacheRefresh ||
      state.isLightCacheBuilding ||
      lightCacheCanvasElement.hidden ||
      state.lightTransitionSession ||
      deps.isCameraMotionRunning() ||
      deps.isControlInteractionActive.get()
    ) {
      return false;
    }
    const fadeableLightEntries = [...groupLightEntriesByKey.values()].filter(
      fadeableLightEntry =>
        currentPreviewFloorMode() === "all" || fadeableLightEntry.floorId === state.activeFloorId
    );
    if (
      !fadeableLightEntries.every(
        checkedLightEntry =>
          checkedLightEntry.previousBrightness === checkedLightEntry.item.lightBrightness &&
          checkedLightEntry.previousKelvin === checkedLightEntry.item.lightTemperature &&
          state.canvasByLightGroupKey.has(
            lightGroupScopeKey(checkedLightEntry.floorId, checkedLightEntry.item.lightGroupId)
          )
      )
    ) {
      return false;
    }
    const fadeStartTimestampMs = performance.now();
    for (const gateLightEntry of fadeableLightEntries) {
      const gateLightGroupKey = lightGroupScopeKey(
        gateLightEntry.floorId,
        gateLightEntry.item.lightGroupId
      );
      const gateFadeEntry = lightFadesByGroupKey.get(gateLightGroupKey);
      const fadeFromBrightness = gateFadeEntry
        ? sampleLightFade(gateFadeEntry, fadeStartTimestampMs)
        : finite(state.brightnessByLightGroupKey.get(gateLightGroupKey), gateLightEntry.wasOn ? 1 : 0);
      lightFadesByGroupKey.set(gateLightGroupKey, {
        from: fadeFromBrightness,
        to: gateLightEntry.isOn ? 1 : 0,
        started: fadeStartTimestampMs,
        duration: lightTransitionDurationMs(
          gateLightEntry.wasOn,
          gateLightEntry.isOn,
          gateLightEntry.fadeDuration,
          {
            ...fadeTransitionOptions,
            immediate: isImmediateFade
          }
        )
      });
    }
    if (lightFadeFrameHandle) {
      cancelAnimationFrame(lightFadeFrameHandle);
    }
    advanceLightFade(fadeStartTimestampMs);
    return true;
  }
  /**
   * 开启灯光过渡会话：快照并取消现有渐变、置脏灯光缓存、隐藏缓存画布，改为逐灯实时过渡。
   * @returns {void} 无返回值。
   */
  function beginLightTransitionSession() {
    const snapshotFadesByGroupKey = new Map(lightFadesByGroupKey);
    cancelLightFade();
    state.lightTransitionSession = lightTransitionSessionToken;
    if (lightSettleTimeoutHandle !== null) {
      window.clearTimeout(lightSettleTimeoutHandle);
    }
    lightSettleTimeoutHandle = null;
    window.clearTimeout(state.lightCacheSettleTimer);
    state.lightCacheSettleTimer = null;
    state.lightCacheRevision += 1;
    state.needsLightCacheRefresh = true;
    if (!state.isLightCacheBuilding) {
      hideRenderShield();
    }
    setLightCacheVisible(false);
    const sessionPreviewLights = collectPreviewLights();
    sessionLightsByItemKey = ensureLightModels(sessionPreviewLights);
    previewLightsByItemKey = new Map(
      sessionPreviewLights.map((sessionPreviewLight: any) => [
        sessionPreviewLight.itemKey,
        sessionPreviewLight
      ])
    );
    lightSessionModelRoot = state.previewModelRoot;
    lightSessionFirstChild = state.previewModelRoot?.children[0];
    needsLightVisibilitySync = true;
    const sessionStartTimestampMs = performance.now();
    for (const sessionPreviewLightEntry of sessionPreviewLights) {
      const previousFadeEntry = snapshotFadesByGroupKey.get(sessionPreviewLightEntry.groupKey);
      if (!previousFadeEntry) {
        continue;
      }
      const previousFadeProgress = sampleLightFade(previousFadeEntry, sessionStartTimestampMs);
      for (const sessionLightNode of sessionLightsByItemKey.get(sessionPreviewLightEntry.itemKey) ||
        []) {
        const sessionLightOnIntensity = finite(sessionLightNode.userData.lightOnIntensity, 0);
        const sessionLightColorArray = sessionLightNode.color.toArray();
        lightTransitionsByLight.set(
          sessionLightNode,
          createLightTransition(
            {
              intensity: sessionLightOnIntensity * previousFadeProgress,
              color: sessionLightColorArray
            },
            {
              intensity: sessionLightOnIntensity * previousFadeEntry.to,
              color: sessionLightColorArray
            },
            sessionStartTimestampMs,
            Math.max(
              0,
              previousFadeEntry.started + previousFadeEntry.duration - sessionStartTimestampMs
            )
          )
        );
      }
    }
    if (lightTransitionsByLight.size && !lightTransitionFrameHandle) {
      lightTransitionFrameHandle = requestAnimationFrame(advanceLightTransition);
    }
    applyRenderQualityMode();
    return sessionLightsByItemKey;
  }
  /**
   * 结束灯光过渡会话：等环境动效、相机运动与逐灯过渡都停下后恢复灯光缓存，未就绪则延时重试。
   * @returns {void} 无返回值。
   */
  function endLightTransitionSession() {
    lightSettleTimeoutHandle = null;
    if (
      !state.isEnvironmentActive &&
      !state.isCurtainMoving &&
      !state.isVacuumMoving &&
      !state.isBackgroundFrameVisible &&
      !deps.isCameraMotionRunning() &&
      !deps.isControlInteractionActive.get() &&
      !lightTransitionsByLight.size &&
      state.lightTransitionSession === lightTransitionSessionToken
    ) {
      if (state.isLightCacheBuilding || state.isMotionRendering) {
        lightSettleTimeoutHandle = window.setTimeout(endLightTransitionSession, 60);
        return;
      }
      state.lightTransitionSession = null;
      if (isAdaptiveLightCacheEnabled()) {
        state.needsLightCacheRefresh = true;
        scheduleLightCacheBuild(0);
      }
    }
  }
  /**
   * 逐灯过渡的每帧推进：清理已结束的过渡，并在灯光转暗时重算阴影预算与触发着色器预编译。
   * @param {number} transitionFrameTimestampMs 当前帧时间戳（毫秒）。
   */
  function advanceLightTransition(transitionFrameTimestampMs: any) {
    lightTransitionFrameHandle = 0;
    syncLightTransitionSession(transitionFrameTimestampMs);
    let lightWentInvisible = false;
    for (const [fadingLightObject, fadingLightTransition] of lightTransitionsByLight) {
      if (
        !(
          transitionFrameTimestampMs - fadingLightTransition.started <
          fadingLightTransition.duration
        )
      ) {
        lightTransitionsByLight.delete(fadingLightObject);
        if (!fadingLightObject.visible) {
          lightWentInvisible = true;
        }
      }
    }
    if (lightWentInvisible) {
      applyShadowBudget(state.previewModelRoot, {
        rebuildAtlas: false
      });
      scheduleLightPrecompile();
    }
    requestRenderFrame();
    if (lightTransitionsByLight.size) {
      lightTransitionFrameHandle = requestAnimationFrame(advanceLightTransition);
    } else {
      setMotionRenderingActive(false);
      if (state.lightTransitionSession === lightTransitionSessionToken) {
        lightSettleTimeoutHandle = window.setTimeout(endLightTransitionSession, 180);
      }
    }
  }
  /**
   * 拆除所有灯光过渡与相关定时器：把灯光直接落到终值并清理会话状态，供销毁或重载场景时调用。
   * @returns {void} 无返回值。
   */
  function teardownLightTransitions() {
    cancelLightFade();
    if (lightTransitionFrameHandle) {
      cancelAnimationFrame(lightTransitionFrameHandle);
    }
    if (lightSettleTimeoutHandle !== null) {
      window.clearTimeout(lightSettleTimeoutHandle);
    }
    if (motionRenderTimeoutHandle !== null) {
      window.clearTimeout(motionRenderTimeoutHandle);
    }
    lightTransitionFrameHandle = 0;
    lightSettleTimeoutHandle = null;
    motionRenderTimeoutHandle = null;
    state.isMotionRendering = false;
    for (const [teardownLightObject, teardownLightTransition] of lightTransitionsByLight) {
      applyTransitionSample(teardownLightObject, {
        ...teardownLightTransition.to,
        complete: true
      });
    }
    lightTransitionsByLight.clear();
    deps.isControlInteractionActive.set(false);
    sessionLightsByItemKey.clear();
    previewLightsByItemKey.clear();
    if (state.lightTransitionSession === lightTransitionSessionToken) {
      state.lightTransitionSession = null;
    }
  }
  const savedItemLightStates = new WeakMap();
  const editorLightGroupStates = new Map();
  /**
   * 应用一批灯光开关状态：编辑器模式下按灯组补齐默认值，再交给过渡或渐变流程落地。
   * @param {Array<object>} requestedLightStates 目标灯光状态列表（floorId / groupId / on 等）。
   * @param {{editor?: boolean}} [lightStateOptions={}] 选项，editor 表示来自编辑器。
   */
  function applyLightStates(requestedLightStates: any, lightStateOptions: any = {}) {
    if (lightStateOptions.editor) {
      const editorStatesByFloorItemKey = new Map(
        requestedLightStates
          .filter((editorStateFilterEntry: any) => editorStateFilterEntry.on)
          .map((editorStateIndexEntry: any) => [
            floorItemKey(editorStateIndexEntry.floorId, editorStateIndexEntry.groupId),
            editorStateIndexEntry
          ])
      );
      requestedLightStates = state.studioDocument.floors.flatMap((editorFloorEntry: any) =>
        (editorFloorEntry.scene.lightGroups || []).map((editorLightGroupEntry: any) => {
          if (!editorLightGroupStates.has(editorLightGroupEntry)) {
            editorLightGroupStates.set(
              editorLightGroupEntry,
              editorLightGroupEntry.enabled !== false
            );
          }
          return (
            editorStatesByFloorItemKey.get(
              floorItemKey(editorFloorEntry.id, editorLightGroupEntry.id)
            ) || {
              floorId: editorFloorEntry.id,
              groupId: editorLightGroupEntry.id,
              on: false
            }
          );
        })
      );
    } else if (editorLightGroupStates.size) {
      const requestedStatesByFloorItemKey = new Map(
        requestedLightStates.map((requestedStateEntry: any) => [
          floorItemKey(requestedStateEntry.floorId, requestedStateEntry.groupId),
          requestedStateEntry
        ])
      );
      requestedLightStates = [
        ...state.studioDocument.floors.flatMap((mergeFloorRecord: any) =>
          (mergeFloorRecord.scene.lightGroups || [])
            .filter(
              (mergeLightGroupRecord: any) =>
                editorLightGroupStates.has(mergeLightGroupRecord) &&
                !requestedStatesByFloorItemKey.has(
                  floorItemKey(mergeFloorRecord.id, mergeLightGroupRecord.id)
                )
            )
            .map((mergeLightGroupEntry: any) => ({
              floorId: mergeFloorRecord.id,
              groupId: mergeLightGroupEntry.id,
              on: editorLightGroupStates.get(mergeLightGroupEntry),
              brightnessSupported: false,
              temperatureSupported: false
            }))
        ),
        ...requestedLightStates
      ];
      editorLightGroupStates.clear();
      lightStateOptions = {
        ...lightStateOptions,
        immediate: true
      };
    }
    if (!isPageHideCleanupInstalled) {
      isPageHideCleanupInstalled = true;
      window.addEventListener("pagehide", teardownLightTransitions, {
        once: true
      });
    }
    const isImmediateLightTransition =
      lightStateOptions.immediate === true ||
      !hasReceivedLightStates ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const changedLightStates = new Map();
    for (const changedLightState of requestedLightStates) {
      const lightEffectState = mapLightEffectState(changedLightState);
      const lightStateFloorRecord = state.studioDocument.floors.find(
        (lightStateFloorEntry: any) => lightStateFloorEntry.id === changedLightState.floorId
      );
      const lightStateGroupRecord = lightStateFloorRecord?.scene.lightGroups.find(
        (lightStateGroupEntry: any) => lightStateGroupEntry.id === changedLightState.groupId
      );
      if (!lightStateGroupRecord) {
        continue;
      }
      const wasGroupEnabled = lightStateGroupRecord.enabled !== false;
      const shouldGroupEnable = changedLightState.on === true;
      lightStateGroupRecord.enabled = shouldGroupEnable;
      for (const lightStateItem of lightStateFloorRecord.scene.items) {
        if (
          lightStateItem.lightGroupId !== lightStateGroupRecord.id ||
          !LIGHT_ITEM_TYPES.has(lightStateItem.type)
        ) {
          continue;
        }
        const itemBrightnessBefore = lightStateItem.lightBrightness;
        const itemKelvinBefore = lightStateItem.lightTemperature;
        if (!savedItemLightStates.has(lightStateItem)) {
          savedItemLightStates.set(lightStateItem, {
            brightness: itemBrightnessBefore,
            kelvin: itemKelvinBefore
          });
        }
        const cachedItemLightState = savedItemLightStates.get(lightStateItem);
        if (Number.isFinite(lightEffectState.brightness)) {
          lightStateItem.lightBrightness = lightEffectState.brightness;
        } else if (changedLightState.brightnessSupported === false) {
          lightStateItem.lightBrightness = cachedItemLightState.brightness;
        }
        if (Number.isFinite(lightEffectState.kelvin)) {
          lightStateItem.lightTemperature = lightEffectState.kelvin;
        } else if (changedLightState.temperatureSupported === false) {
          lightStateItem.lightTemperature = cachedItemLightState.kelvin;
        }
        if (
          !!forceLightStateRefresh ||
          wasGroupEnabled !== shouldGroupEnable ||
          itemBrightnessBefore !== lightStateItem.lightBrightness ||
          itemKelvinBefore !== lightStateItem.lightTemperature
        ) {
          changedLightStates.set(floorItemKey(lightStateFloorRecord.id, lightStateItem.id), {
            item: lightStateItem,
            floorId: lightStateFloorRecord.id,
            wasOn: wasGroupEnabled,
            isOn: shouldGroupEnable,
            previousBrightness: itemBrightnessBefore,
            previousKelvin: itemKelvinBefore,
            fadeDuration: changedLightState.fadeDuration
          });
        }
      }
    }
    hasReceivedLightStates = true;
    forceLightStateRefresh = false;
    if (!changedLightStates.size) {
      return;
    }
    const isAdaptiveLightCacheActive = isAdaptiveLightCacheEnabled();
    if (
      isAdaptiveLightCacheActive &&
      startGroupLightFades(changedLightStates, isImmediateLightTransition, lightStateOptions)
    ) {
      return;
    }
    let currentLightsByItemKey = collectLightsByItemKey();
    const baselineLightsByItemKey = currentLightsByItemKey;
    if (isAdaptiveLightCacheActive) {
      currentLightsByItemKey = beginLightTransitionSession();
    } else if (
      [...changedLightStates.keys()].some(
        uncachedItemKey => !currentLightsByItemKey.has(uncachedItemKey)
      )
    ) {
      currentLightsByItemKey = ensureLightModels(
        collectPreviewLights().filter((uncachedPreviewLight: any) =>
          changedLightStates.has(uncachedPreviewLight.itemKey)
        )
      );
    }
    let lightVisibilityChanged = false;
    const lightChangeTimestampMs = performance.now();
    for (const [lightChangeItemKey, lightChangeState] of changedLightStates) {
      if (currentPreviewFloorMode() !== "all" && lightChangeState.floorId !== state.activeFloorId) {
        continue;
      }
      const lightChangeLights = currentLightsByItemKey.get(lightChangeItemKey);
      if (lightChangeLights?.length) {
        for (const lightChangeLight of lightChangeLights) {
          const lightChangeTransition = lightTransitionsByLight.get(lightChangeLight);
          const previousBrightnessFactor = lightBrightnessResponse(
            lightChangeState.item,
            lightChangeState.previousBrightness
          );
          const steadyOnIntensity =
            baselineLightsByItemKey.get(lightChangeItemKey)?.includes(lightChangeLight) &&
            previousBrightnessFactor > 1e-7 &&
            lightChangeLight.userData.lightOnIntensity > 0
              ? lightChangeLight.userData.lightOnIntensity / previousBrightnessFactor
              : baseLightIntensity(lightChangeState.item);
          const targetLightOnIntensity =
            steadyOnIntensity *
            lightBrightnessResponse(lightChangeState.item, lightChangeState.item.lightBrightness);
          const targetLightSample = {
            intensity: lightChangeState.isOn ? targetLightOnIntensity : 0,
            color: new threeModuleMin.Color(
              lightEffectColorHex(lightChangeState.item.lightTemperature)
            ).toArray()
          };
          const sampledLightTransition = lightChangeTransition
            ? sampleLightTransition(lightChangeTransition, lightChangeTimestampMs)
            : null;
          const startLightSample =
            !lightChangeState.wasOn &&
            lightChangeState.isOn &&
            (!sampledLightTransition || sampledLightTransition.intensity <= 0.000001)
              ? {
                  intensity: 0,
                  color: targetLightSample.color
                }
              : sampledLightTransition || {
                  intensity: isAdaptiveLightCacheActive
                    ? lightChangeState.wasOn
                      ? steadyOnIntensity * previousBrightnessFactor
                      : 0
                    : lightChangeLight.intensity,
                  color: isAdaptiveLightCacheActive
                    ? new threeModuleMin.Color(
                        lightEffectColorHex(lightChangeState.previousKelvin)
                      ).toArray()
                    : lightChangeLight.color.toArray()
                };
          lightChangeLight.userData.lightOnIntensity = targetLightOnIntensity;
          lightChangeLight.userData.lightBrightness = lightChangeState.item.lightBrightness;
          const fadeDurationMs = lightTransitionDurationMs(
            lightChangeState.wasOn,
            lightChangeState.isOn,
            lightChangeState.fadeDuration,
            {
              ...lightStateOptions,
              immediate: isImmediateLightTransition,
              temperatureChanged:
                lightChangeState.previousKelvin !== lightChangeState.item.lightTemperature
            }
          );
          const createdLightTransition = createLightTransition(
            startLightSample,
            targetLightSample,
            lightChangeTimestampMs,
            fadeDurationMs
          );
          const lightWasVisible = lightChangeLight.visible;
          applyTransitionSample(
            lightChangeLight,
            sampleLightTransition(createdLightTransition, lightChangeTimestampMs)
          );
          lightVisibilityChanged ||= lightWasVisible !== lightChangeLight.visible;
          if (fadeDurationMs) {
            lightTransitionsByLight.set(lightChangeLight, createdLightTransition);
          } else {
            lightTransitionsByLight.delete(lightChangeLight);
          }
        }
      }
    }
    if (isAdaptiveLightCacheActive) {
      syncLightTransitionSession(lightChangeTimestampMs);
    }
    if (lightVisibilityChanged || isAdaptiveLightCacheActive) {
      applyShadowBudget(state.previewModelRoot, {
        rebuildAtlas: false
      });
    }
    if (lightVisibilityChanged) {
      scheduleLightPrecompile();
    }
    setMotionRenderingActive(lightTransitionsByLight.size > 0);
    requestRenderFrame();
    if (!lightTransitionFrameHandle) {
      if (lightTransitionsByLight.size) {
        lightTransitionFrameHandle = requestAnimationFrame(advanceLightTransition);
      } else if (isAdaptiveLightCacheActive) {
        lightSettleTimeoutHandle = window.setTimeout(endLightTransitionSession, 100);
      }
    }
  }

  return {
    applyLightStates,
    beginLightTransitionSession,
    endLightTransitionSession,
    get forceLightStateRefresh(): any {
      return forceLightStateRefresh;
    },
    set forceLightStateRefresh(next: any) {
      forceLightStateRefresh = next;
    },
    get hasReceivedLightStates(): any {
      return hasReceivedLightStates;
    },
    set hasReceivedLightStates(next: any) {
      hasReceivedLightStates = next;
    },
    get lightSettleTimeoutHandle(): any {
      return lightSettleTimeoutHandle;
    },
    set lightSettleTimeoutHandle(next: any) {
      lightSettleTimeoutHandle = next;
    },
    lightTransitionSessionToken,
    lightTransitionsByLight,
    syncLightTransitionSession,
    teardownLightTransitions
  };
}
