/**
 * `presence-sensor` 控件：人体感应，附带门磁 / 水浸 / 烟感 / 燃气四种传感器专题绘制。
 *
 * 四个 `render*Sensor` 只被本控件使用，故与注册放在一起。
 */
import { doorWindowPerspectiveMatrix } from "../../../controls/door-window-runtime.js?v=2609230040";
// 数值夹取统一走 utils/numbers.js。`clampNumber` 只用于三处：那三处 `clampCoercedNumber`
// 的兜底是**算出来的表达式**、存在越界的现实可能，所以要在调用点先夹一次
// （见 `utils/numbers.js` 模块头那张口径表）。
import { clampCoercedNumber } from "../../../../utils/numbers.js?v=2609230040";
import {
  presenceAnimationPhase,
  presenceMotionEventConfig,
  presenceSensorPresentation,
  presenceStateTimestamp
} from "../../../controls/presence-runtime.js?v=2609230040";
// 同门分片：registry-core
import { registerComponent } from "../registry-core.js?v=2609230040";
// 同门分片：registry-visuals
import {
  componentContentUnitsPx,
  resolveColor
} from "../registry-visuals.js?v=2609230040";

/**
 * 渲染门窗传感器。
 */
function renderDoorWindowSensor(
  sensorComponent,
  sensorProperties,
  sensorPresentation,
  sensorContext
) {
  const sensorAccentColor = resolveColor(
    sensorProperties.iconOnColor || sensorProperties.occupiedColor,
    "#ffffff"
  );
  const isSensorOccupied = sensorPresentation.key === "occupied";
  const sensorStateLabel = isSensorOccupied
    ? "打开"
    : sensorPresentation.key === "clear"
      ? "关闭"
      : sensorPresentation.key === "unavailable"
        ? "离线"
        : "未知";
  const sensorElement = document.createElement("div");
  sensorElement.className =
    "hb-door-window-sensor is-" + (isSensorOccupied ? "open" : sensorPresentation.key);
  sensorElement.dataset.sensorState = isSensorOccupied ? "open" : sensorPresentation.key;
  sensorElement.style.setProperty("--hb-door-window-accent", sensorAccentColor);
  sensorElement.setAttribute("role", "img");
  sensorElement.setAttribute("aria-label", "门窗传感器：" + sensorStateLabel);
  const sensorVisualElement = document.createElement("div");
  sensorVisualElement.className = "hb-door-window-visual";
  const sensorComponentScale = Math.max(
    0.01,
    Number(sensorContext.document?.canvas?.componentScale || 1)
  );
  const sensorWidth = Math.max(
    1,
    Number(sensorComponent.position?.width || 100) / sensorComponentScale
  );
  const sensorHeight = Math.max(
    1,
    Number(sensorComponent.position?.height || 100) / sensorComponentScale
  );
  sensorVisualElement.style.transform = doorWindowPerspectiveMatrix(
    sensorWidth,
    sensorHeight,
    sensorProperties.perspectiveCorners
  );
  const sensorFrameElement = document.createElement("span");
  sensorFrameElement.className = "hb-door-window-frame";
  const sensorLeftPanelElement = document.createElement("span");
  sensorLeftPanelElement.className = "hb-door-window-panel left";
  const sensorRightPanelElement = document.createElement("span");
  sensorRightPanelElement.className = "hb-door-window-panel right";
  sensorLeftPanelElement.append(document.createElement("i"));
  sensorRightPanelElement.append(document.createElement("i"));
  sensorFrameElement.append(sensorLeftPanelElement, sensorRightPanelElement);
  const sensorAirflowElement = document.createElement("span");
  sensorAirflowElement.className = "hb-door-window-airflow";
  for (let airflowSlatIndex = 0; airflowSlatIndex < 3; airflowSlatIndex += 1) {
    sensorAirflowElement.append(document.createElement("i"));
  }
  sensorVisualElement.append(sensorFrameElement, sensorAirflowElement);
  sensorElement.append(sensorVisualElement);
  return sensorElement;
}

/**
 * 渲染水浸传感器。
 */
function renderWaterLeakSensor(waterLeakProperties, waterLeakPresentation) {
  const waterLeakAccentColor = resolveColor(waterLeakProperties.waterLeakColor, "#42c8ff");
  const isWaterLeakOccupied = waterLeakPresentation.key === "occupied";
  const waterLeakStateLabel = isWaterLeakOccupied
    ? "检测到水浸"
    : waterLeakPresentation.key === "clear"
      ? "正常"
      : waterLeakPresentation.key === "unavailable"
        ? "离线"
        : "未知";
  const waterLeakElement = document.createElement("div");
  waterLeakElement.className =
    "hb-water-leak-sensor is-" + (isWaterLeakOccupied ? "wet" : waterLeakPresentation.key);
  waterLeakElement.dataset.sensorState = isWaterLeakOccupied ? "wet" : waterLeakPresentation.key;
  waterLeakElement.style.setProperty("--hb-water-leak-accent", waterLeakAccentColor);
  waterLeakElement.setAttribute("role", "img");
  waterLeakElement.setAttribute("aria-label", "水浸传感器：" + waterLeakStateLabel);
  const waterLeakVisualElement = document.createElement("div");
  waterLeakVisualElement.className = "hb-water-leak-visual";
  const waterLeakPuddleElement = document.createElement("span");
  waterLeakPuddleElement.className = "hb-water-leak-puddle";
  const waterLeakRipplesElement = document.createElement("span");
  waterLeakRipplesElement.className = "hb-water-leak-ripples";
  for (let rippleIndex = 0; rippleIndex < 3; rippleIndex += 1) {
    waterLeakRipplesElement.append(document.createElement("i"));
  }
  const SVG_NAMESPACE_URI = "http://www.w3.org/2000/svg";
  const waterLeakDropletElement = document.createElementNS(SVG_NAMESPACE_URI, "svg");
  waterLeakDropletElement.setAttribute("class", "hb-water-leak-droplet");
  waterLeakDropletElement.setAttribute("viewBox", "0 0 48 64");
  waterLeakDropletElement.setAttribute("aria-hidden", "true");
  const dropletBodyElement = document.createElementNS(SVG_NAMESPACE_URI, "path");
  dropletBodyElement.setAttribute("class", "body");
  dropletBodyElement.setAttribute(
    "d",
    "M24 3C20 10 6 27 6 40c0 11 8 20 18 20s18-9 18-20C42 27 28 10 24 3Z"
  );
  const dropletHighlightElement = document.createElementNS(SVG_NAMESPACE_URI, "path");
  dropletHighlightElement.setAttribute("class", "highlight");
  dropletHighlightElement.setAttribute("d", "M15 40c0-6 3-12 8-18");
  waterLeakDropletElement.append(dropletBodyElement, dropletHighlightElement);
  waterLeakVisualElement.append(
    waterLeakPuddleElement,
    waterLeakRipplesElement,
    waterLeakDropletElement
  );
  waterLeakElement.append(waterLeakVisualElement);
  return waterLeakElement;
}

/**
 * 渲染烟雾传感器。
 */
function renderSmokeSensor(smokeProperties, smokePresentation) {
  const smokeAccentColor = resolveColor(smokeProperties.smokeColor, "#ffffff");
  const isSmokeOccupied = smokePresentation.key === "occupied";
  const smokeStateLabel = isSmokeOccupied
    ? "检测到烟雾"
    : smokePresentation.key === "clear"
      ? "正常"
      : smokePresentation.key === "unavailable"
        ? "离线"
        : "未知";
  const smokeElement = document.createElement("div");
  smokeElement.className =
    "hb-smoke-sensor is-" + (isSmokeOccupied ? "alert" : smokePresentation.key);
  smokeElement.dataset.sensorState = isSmokeOccupied ? "alert" : smokePresentation.key;
  smokeElement.style.setProperty("--hb-smoke-accent", smokeAccentColor);
  smokeElement.setAttribute("role", "img");
  smokeElement.setAttribute("aria-label", "烟雾传感器：" + smokeStateLabel);
  const smokeVisualElement = document.createElement("span");
  smokeVisualElement.className = "hb-smoke-visual";
  const smokeGroundElement = document.createElement("span");
  smokeGroundElement.className = "hb-smoke-ground";
  const SMOKE_SVG_NAMESPACE_URI = "http://www.w3.org/2000/svg";
  const smokeWispsElement = document.createElementNS(SMOKE_SVG_NAMESPACE_URI, "svg");
  smokeWispsElement.setAttribute("class", "hb-smoke-wisps");
  smokeWispsElement.setAttribute("viewBox", "0 0 100 100");
  smokeWispsElement.setAttribute("aria-hidden", "true");
  for (const smokeWispPath of [
    "M27 94C12 76 41 67 27 49C13 32 38 22 30 7",
    "M50 97C34 79 65 69 49 50C35 33 61 21 52 3",
    "M73 93C60 77 86 66 72 48C59 32 83 22 75 8"
  ]) {
    const smokeWispElement = document.createElementNS(SMOKE_SVG_NAMESPACE_URI, "path");
    smokeWispElement.setAttribute("d", smokeWispPath);
    smokeWispsElement.append(smokeWispElement);
  }
  smokeVisualElement.append(smokeGroundElement, smokeWispsElement);
  smokeElement.append(smokeVisualElement);
  return smokeElement;
}

/**
 * 渲染天然气传感器。
 */
function renderGasSensor(gasProperties, gasPresentation) {
  const gasAccentColor = resolveColor(gasProperties.naturalGasColor, "#ffb347");
  const isGasOccupied = gasPresentation.key === "occupied";
  const gasStateLabel = isGasOccupied
    ? "检测到天然气"
    : gasPresentation.key === "clear"
      ? "正常"
      : gasPresentation.key === "unavailable"
        ? "离线"
        : "未知";
  const gasElement = document.createElement("div");
  gasElement.className =
    "hb-natural-gas-sensor is-" + (isGasOccupied ? "alert" : gasPresentation.key);
  gasElement.dataset.sensorState = isGasOccupied ? "alert" : gasPresentation.key;
  gasElement.style.setProperty("--hb-natural-gas-accent", gasAccentColor);
  gasElement.setAttribute("role", "img");
  gasElement.setAttribute("aria-label", "天然气传感器：" + gasStateLabel);
  const gasVisualElement = document.createElement("span");
  gasVisualElement.className = "hb-natural-gas-visual";
  const gasHazeElement = document.createElement("span");
  gasHazeElement.className = "hb-natural-gas-haze";
  const GAS_SVG_NAMESPACE_URI = "http://www.w3.org/2000/svg";
  const gasCurrentsElement = document.createElementNS(GAS_SVG_NAMESPACE_URI, "svg");
  gasCurrentsElement.setAttribute("class", "hb-natural-gas-currents");
  gasCurrentsElement.setAttribute("viewBox", "0 0 120 80");
  gasCurrentsElement.setAttribute("aria-hidden", "true");
  for (const gasCurrentPath of [
    "M3 19C23 5 38 32 58 18C78 4 94 29 117 13",
    "M0 40C20 26 35 53 55 39C76 24 94 54 120 35",
    "M5 62C26 47 42 74 64 58C85 43 101 67 117 54"
  ]) {
    const gasCurrentElement = document.createElementNS(GAS_SVG_NAMESPACE_URI, "path");
    gasCurrentElement.setAttribute("d", gasCurrentPath);
    gasCurrentsElement.append(gasCurrentElement);
  }
  gasVisualElement.append(gasHazeElement, gasCurrentsElement);
  gasElement.append(gasVisualElement);
  return gasElement;
}

// 人体感应控件：把四种传感器外观（人体 / 门窗 / 水浸 / 烟雾 / 天然气）合成一个控件，
// 具体外观由 properties.sensorKind 决定，状态统一走 presence-runtime 的四态映射。
registerComponent("presence-sensor", {
  render(presenceComponent, presenceContext) {
    const presenceProperties = presenceComponent.properties || {};
    const presenceEntityId = presenceComponent.bindings?.entity?.entityId || "";
    const presenceState = presenceContext.states?.get(presenceEntityId);
    const motionEventConfig = presenceMotionEventConfig(
      presenceEntityId,
      presenceState,
      presenceContext.entityMetadata,
      presenceContext.states,
      presenceProperties
    );
    const sensorPresentationData = presenceSensorPresentation(
      presenceState,
      presenceContext.editable ? presenceContext.previewState : "auto",
      motionEventConfig
    );
    if (presenceProperties.sensorKind === "door-window") {
      return renderDoorWindowSensor(
        presenceComponent,
        presenceProperties,
        sensorPresentationData,
        presenceContext
      );
    }
    if (presenceProperties.sensorKind === "water-leak") {
      return renderWaterLeakSensor(presenceProperties, sensorPresentationData);
    }
    if (presenceProperties.sensorKind === "smoke") {
      return renderSmokeSensor(presenceProperties, sensorPresentationData);
    }
    if (presenceProperties.sensorKind === "natural-gas") {
      return renderGasSensor(presenceProperties, sensorPresentationData);
    }
    const presenceAccentColor = resolveColor(
      presenceProperties.iconOnColor || presenceProperties.occupiedColor,
      "#ffffff"
    );
    const presenceIdleColor = resolveColor(
      presenceProperties.iconColor || presenceProperties.clearColor,
      "#758189"
    );
    const presenceUnit = componentContentUnitsPx(presenceComponent, presenceContext);
    const presenceElement = document.createElement("div");
    presenceElement.className = "hb-presence-sensor is-" + sensorPresentationData.key;
    presenceElement.classList.toggle("is-halo-hidden", presenceProperties.haloVisible === false);
    presenceElement.classList.toggle(
      "is-person-hidden",
      presenceProperties.personVisible === false
    );
    presenceElement.dataset.presenceState = sensorPresentationData.key;
    presenceElement.style.setProperty("--hb-presence-occupied", presenceAccentColor);
    presenceElement.style.setProperty("--hb-presence-clear", presenceIdleColor);
    const animationStrength = clampCoercedNumber(presenceProperties.animationStrength, 0, 1, 0.72);
    const haloScale = clampCoercedNumber(presenceProperties.haloScale, 0.2, 3, 1);
    const haloScaleX = clampCoercedNumber(presenceProperties.haloScaleX, 0.2, 3, haloScale);
    const haloScaleY = clampCoercedNumber(presenceProperties.haloScaleY, 0.2, 3, haloScale);
    const haloRotation = clampCoercedNumber(presenceProperties.haloRotation, -360, 360, 0);
    const haloOpacity = clampCoercedNumber(presenceProperties.haloOpacity, 0, 1, 1);
    const personScale = clampCoercedNumber(presenceProperties.personScale, 0.2, 3, 1);
    const personRotation = clampCoercedNumber(presenceProperties.personRotation, -360, 360, 0);
    const personOpacity = clampCoercedNumber(presenceProperties.personOpacity, 0, 1, 1);
    const orbitDuration = clampCoercedNumber(presenceProperties.orbitDuration, 2, 60, 8);
    presenceElement.style.setProperty("--hb-presence-motion", String(animationStrength));
    const waveDuration = Number((3.2 - animationStrength * 0.8).toFixed(2));
    presenceElement.style.setProperty("--hb-presence-wave-duration", waveDuration + "s");
    presenceElement.style.setProperty("--hb-presence-halo-scale-x", String(haloScaleX));
    presenceElement.style.setProperty("--hb-presence-halo-scale-y", String(haloScaleY));
    presenceElement.style.setProperty("--hb-presence-halo-rotation", haloRotation + "deg");
    presenceElement.style.setProperty("--hb-presence-halo-opacity", String(haloOpacity));
    presenceElement.style.setProperty("--hb-presence-person-scale", String(personScale));
    presenceElement.style.setProperty("--hb-presence-person-rotation", personRotation + "deg");
    presenceElement.style.setProperty("--hb-presence-person-opacity", String(personOpacity));
    presenceElement.style.setProperty("--hb-presence-orbit-duration", orbitDuration + "s");
    if (sensorPresentationData.key === "occupied") {
      const presencePhase = presenceAnimationPhase(presenceState, {
        orbit: orbitDuration,
        wave: waveDuration
      });
      presenceElement.style.setProperty("--hb-presence-orbit-delay", presencePhase.orbitDelay);
      presenceElement.style.setProperty("--hb-presence-wave-delay", presencePhase.waveDelay);
      presenceElement.style.setProperty("--hb-presence-floor-delay", presencePhase.floorDelay);
      presenceElement.style.setProperty("--hb-presence-step-delay", presencePhase.stepDelay);
    }
    const orbitOffsetX = haloScaleX * 32 * presenceUnit.width;
    const orbitOffsetY = haloScaleY * 13 * presenceUnit.height;
    presenceElement.style.setProperty("--hb-presence-orbit-x", orbitOffsetX.toFixed(4) + "px");
    presenceElement.style.setProperty(
      "--hb-presence-orbit-x-negative",
      (-orbitOffsetX).toFixed(4) + "px"
    );
    presenceElement.style.setProperty("--hb-presence-orbit-y", orbitOffsetY.toFixed(4) + "px");
    presenceElement.style.setProperty(
      "--hb-presence-orbit-y-negative",
      (-orbitOffsetY).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-x-diagonal",
      (orbitOffsetX * 0.707).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-x-diagonal-negative",
      (-orbitOffsetX * 0.707).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-y-diagonal",
      (orbitOffsetY * 0.707).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-y-diagonal-negative",
      (-orbitOffsetY * 0.707).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-x-shallow",
      (orbitOffsetX * 0.382683).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-x-shallow-negative",
      (-orbitOffsetX * 0.382683).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-x-steep",
      (orbitOffsetX * 0.92388).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-x-steep-negative",
      (-orbitOffsetX * 0.92388).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-y-shallow",
      (orbitOffsetY * 0.382683).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-y-shallow-negative",
      (-orbitOffsetY * 0.382683).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-y-steep",
      (orbitOffsetY * 0.92388).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-y-steep-negative",
      (-orbitOffsetY * 0.92388).toFixed(4) + "px"
    );
    presenceElement.style.setProperty("--hb-presence-person-width", presenceUnit.width * 22 + "px");
    presenceElement.style.setProperty(
      "--hb-presence-person-height",
      presenceUnit.height * 62 + "px"
    );
    // 这里曾有 --hb-presence-copy-gap / -main-size / -secondary-size 三枚写入。
    // 它们对应的「文案」层（DOM 与 .hb-presence-copy-* 的 gap / font-size 规则）已在
    // 0.6.2 的重构里整体移除，只剩 JS 这半截还在按人物框尺寸算字号 —— 算了没人用。
    // 三枚一并删除（tools/check_invariants.mjs 第 10 条记录了这一类「写了没人读」）。
    // 注意上面那几枚 --hb-presence-person-* 不同：它们由 presence 的样式表取用。
    presenceElement.setAttribute("role", "img");
    presenceElement.setAttribute("aria-label", "人在传感器：" + sensorPresentationData.label);
    const presenceVisualElement = document.createElement("div");
    presenceVisualElement.className = "hb-presence-sensor-visual";
    const presenceHaloElement = document.createElement("span");
    presenceHaloElement.className = "hb-presence-sensor-halo";
    const presenceSpaceElement = document.createElement("span");
    presenceSpaceElement.className = "hb-presence-sensor-space";
    for (let haloSpanIndex = 0; haloSpanIndex < 3; haloSpanIndex += 1) {
      presenceSpaceElement.append(document.createElement("i"));
    }
    const presencePersonElement = document.createElement("span");
    presencePersonElement.className = "hb-presence-sensor-person";
    const personHeadElement = document.createElement("i");
    const personBodyElement = document.createElement("b");
    const personLeftArmElement = document.createElement("span");
    personLeftArmElement.className = "arm left";
    const personRightArmElement = document.createElement("span");
    personRightArmElement.className = "arm right";
    const personLeftLegElement = document.createElement("span");
    personLeftLegElement.className = "leg left";
    const personRightLegElement = document.createElement("span");
    personRightLegElement.className = "leg right";
    presencePersonElement.append(
      personHeadElement,
      personBodyElement,
      personLeftArmElement,
      personRightArmElement,
      personLeftLegElement,
      personRightLegElement
    );
    const presenceFloorElement = document.createElement("span");
    presenceFloorElement.className = "hb-presence-sensor-floor";
    presenceHaloElement.append(presenceSpaceElement, presenceFloorElement);
    const presenceOrbitElement = document.createElement("span");
    presenceOrbitElement.className = "hb-presence-sensor-orbit";
    const presenceTravelerElement = document.createElement("span");
    presenceTravelerElement.className = "hb-presence-sensor-traveler";
    presenceTravelerElement.append(presencePersonElement);
    presenceOrbitElement.append(presenceTravelerElement);
    presenceVisualElement.append(presenceHaloElement, presenceOrbitElement);
    presenceElement.append(presenceVisualElement);
    if (
      !presenceContext.editable &&
      motionEventConfig.motionEvent &&
      sensorPresentationData.key === "occupied"
    ) {
      const presenceTimestamp = presenceStateTimestamp(presenceState);
      const motionRemainingMs = Number.isFinite(presenceTimestamp)
        ? motionEventConfig.motionTimeoutSeconds * 1000 - (Date.now() - presenceTimestamp)
        : 0;
      if (motionRemainingMs > 0) {
        const motionTimeoutId = window.setTimeout(
          () => presenceContext.invalidate?.(),
          motionRemainingMs + 80
        );
        presenceContext.cleanup(() => window.clearTimeout(motionTimeoutId));
      }
    }
    return presenceElement;
  }
});
