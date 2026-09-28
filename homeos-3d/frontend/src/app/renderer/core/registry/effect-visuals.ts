/**
 * 图标按钮特效的视觉知识：色温基准、亮度到透明度、特效层的绘制。
 */

import { lightRealtimeCapabilities } from "../../controls/light-runtime.js";
// 状态条目归一与小写状态文本统一走 utils/state-entry.js，全仓库只有这一份实现。
import { resolveStateEntry, stateTextOf } from "../../../utils/state-entry.js";
import { clampCoercedNumber, isUsableNumber } from "../../../utils/numbers.js";
// 同门分片：builtin-assets
import {
  effectVariantByAssetId,
  resolveAssetUrl
} from "./builtin-assets.js";
// 同门分片：entity-state
import { isLightVisualActive } from "./entity-state.js";

/**
 * 判断灯光特效是否在「等待实时视觉参数」：刚开灯时 brightness / color_temp 常晚一拍才上报，
 */
export function iconButtonEffectLightVisualAwaiting(effectAwaitComponent: any, effectAwaitContext: any = {}) {
  const effectAwaitProperties = effectAwaitComponent?.properties || {};
  const effectAwaitEntityId = String(effectAwaitComponent?.bindings?.entity?.entityId || "");
  if (
    !!effectAwaitContext.editable ||
    !effectAwaitEntityId.startsWith("light.") ||
    (effectAwaitProperties.effectBrightnessRealtime === false &&
      effectAwaitProperties.effectColorTemperatureRealtime === false)
  ) {
    return false;
  }
  const effectAwaitState: any = resolveStateEntry(effectAwaitContext.states?.get?.(effectAwaitEntityId));
  const effectAwaitStateText = stateTextOf(effectAwaitState);
  if (
    !effectAwaitState ||
    effectAwaitStateText === "unknown" ||
    effectAwaitStateText === "unavailable"
  ) {
    return true;
  }
  if (
    effectAwaitContext.pendingOptimisticState?.desiredActive === true ||
    effectAwaitStateText !== "on"
  ) {
    return false;
  }
  const effectAwaitAttributes = effectAwaitState.attributes || {};
  const effectAwaitRealtimeCapabilities = lightRealtimeCapabilities(
    effectAwaitEntityId,
    effectAwaitState
  );
  // 判断某属性是否已带上可用数值：null / undefined / 空串 / 布尔一律算「缺席」（HA 里未上报
  const hasNumericAttribute = (attributeKey: any) =>
    isUsableNumber(effectAwaitAttributes[attributeKey]);
  if (
    effectAwaitProperties.effectBrightnessRealtime !== false &&
    effectAwaitRealtimeCapabilities.brightness &&
    !hasNumericAttribute("brightness")
  ) {
    return true;
  }
  const effectSupportedColorModes = Array.isArray(effectAwaitAttributes.supported_color_modes)
    ? effectAwaitAttributes.supported_color_modes.map((colorModeName: any) =>
        String(colorModeName || "").toLowerCase()
      )
    : [];
  const effectActiveColorMode = String(effectAwaitAttributes.color_mode || "").toLowerCase();
  const isEffectColorTemperatureMode =
    effectActiveColorMode === "color_temp" ||
    (!effectActiveColorMode &&
      effectSupportedColorModes.length === 1 &&
      effectSupportedColorModes[0] === "color_temp");
  return (
    effectAwaitProperties.effectColorTemperatureRealtime !== false &&
    !!effectAwaitRealtimeCapabilities.colorTemperature &&
    !!isEffectColorTemperatureMode &&
    !hasNumericAttribute("color_temp_kelvin") &&
    !hasNumericAttribute("color_temp")
  );
}

// 色温视觉基准点：3500K 视为中性（不做饱和调整），偏暖加饱和、偏冷减饱和。
const ICON_BUTTON_EFFECT_BASE_TEMPERATURE_KELVIN = 3500;

/**
 * 把亮度百分比换算成特效层透明度。
 */
function brightnessPercentToOpacity(brightnessPercent: any) {
  if (
    brightnessPercent == null ||
    brightnessPercent === "" ||
    !Number.isFinite(Number(brightnessPercent))
  ) {
    return 1;
  }
  const clampedBrightness = Math.max(0, Math.min(1, Number(brightnessPercent) / 100));
  if (clampedBrightness <= 0) {
    return 0;
  } else {
    return 0.2 + clampedBrightness * 0.8;
  }
}

function resolveColorTemperature(kelvinAttributes: any = {}) {
  const colorTempKelvin = Number(kelvinAttributes.color_temp_kelvin);
  if (Number.isFinite(colorTempKelvin) && colorTempKelvin > 0) {
    return colorTempKelvin;
  }
  const colorTempMired = Number(kelvinAttributes.color_temp);
  if (Number.isFinite(colorTempMired) && colorTempMired > 0) {
    return 1000000 / colorTempMired;
  } else {
    return null;
  }
}

/**
 * 计算灯光特效层的视觉参数：亮度换透明度、色温换饱和度滤镜。
 */
export function iconButtonEffectLightVisualState(lightVisualComponent: any, lightVisualContext: any = {}) {
  const lightVisualEntityId = String(lightVisualComponent?.bindings?.entity?.entityId || "");
  const lightVisualAttributes: any =
    (resolveStateEntry(lightVisualContext.states?.get?.(lightVisualEntityId)) as any)?.attributes ||
    {};
  if (!lightVisualEntityId.startsWith("light.")) {
    return {
      brightnessPercent: null,
      colorTemperatureKelvin: null,
      opacity: 1,
      filter: "none"
    };
  }
  const brightnessAttribute = lightVisualAttributes.brightness;
  const brightnessNumber =
    brightnessAttribute == null || brightnessAttribute === ""
      ? Number.NaN
      : Number(brightnessAttribute);
  const brightnessPercentValue = Number.isFinite(brightnessNumber)
    ? Math.max(0, Math.min(100, (brightnessNumber / 255) * 100))
    : null;
  const colorTemperatureKelvin: any = resolveColorTemperature(lightVisualAttributes);
  const visualProperties = lightVisualComponent?.properties || {};
  const isBrightnessRealtime = visualProperties.effectBrightnessRealtime !== false;
  const isColorTemperatureRealtime = visualProperties.effectColorTemperatureRealtime !== false;
  const brightnessOpacity = isBrightnessRealtime
    ? brightnessPercentToOpacity(brightnessPercentValue)
    : 1;
  if (!isColorTemperatureRealtime || colorTemperatureKelvin == null || !Number.isFinite(colorTemperatureKelvin)) {
    return {
      brightnessPercent: brightnessPercentValue,
      colorTemperatureKelvin: null,
      opacity: brightnessOpacity,
      filter: "none"
    };
  }
  // 偏暖窗口 1500K、偏冷窗口 3000K（冷端范围更宽，视觉上冷白光的变化本来就比暖光缓）；
  const warmFactor = Math.max(
    0,
    Math.min(1, (ICON_BUTTON_EFFECT_BASE_TEMPERATURE_KELVIN - (colorTemperatureKelvin as number)) / 1500)
  );
  const coolFactor = Math.max(
    0,
    Math.min(1, ((colorTemperatureKelvin as number) - ICON_BUTTON_EFFECT_BASE_TEMPERATURE_KELVIN) / 3000)
  );
  const saturationFactor = 1 + warmFactor * 0.95 - coolFactor * 0.55;
  return {
    brightnessPercent: brightnessPercentValue,
    colorTemperatureKelvin: colorTemperatureKelvin,
    opacity: brightnessOpacity,
    filter: "saturate(" + saturationFactor.toFixed(3) + ")"
  };
}

/**
 * 渲染图标按钮的光效图层。
 */
export function renderIconButtonEffectLayer(effectLayerComponent: any, effectLayerContext: any) {
  const effectLayerProperties = effectLayerComponent.properties || {};
  const effectVariantRecord = effectLayerContext.editable
    ? null
    : effectVariantByAssetId.get(String(effectLayerProperties.effectAssetId || ""));
  const effectImageSource =
    effectVariantRecord?.url || resolveAssetUrl(effectLayerProperties.effectAssetId);
  if (!effectImageSource || effectLayerProperties.effectVisible === false) {
    return null;
  }
  const isEffectActive = isLightVisualActive(effectLayerComponent, effectLayerContext);
  const effectVisualState = iconButtonEffectLightVisualState(
    effectLayerComponent,
    effectLayerContext
  );
  const isEffectAwaiting = iconButtonEffectLightVisualAwaiting(
    effectLayerComponent,
    effectLayerContext
  );
  const effectLayerElement = document.createElement("div");
  effectLayerElement.className =
    "hb-icon-button-effect-layer" +
    (isEffectActive ? " active" : "") +
    (isEffectAwaiting ? " awaiting-light-visual" : "");
  effectLayerElement.style.setProperty(
    "--hb-effect-image-opacity",
    String(clampCoercedNumber(effectLayerProperties.effectOpacity, 0, 1, 1) * effectVisualState.opacity)
  );
  // 视觉参数（透明度 / 滤镜）的变化过渡至少 0.45 秒：低于这个时长会看出跳变。
  const effectFadeDuration = clampCoercedNumber(effectLayerProperties.effectFadeDuration, 0, 3, 0.52);
  effectLayerElement.style.setProperty("--hb-effect-fade-duration", effectFadeDuration + "s");
  effectLayerElement.style.setProperty(
    "--hb-effect-visual-transition-duration",
    Math.max(0.45, effectFadeDuration) + "s"
  );
  const effectImageElement = document.createElement("img");
  if (effectVariantRecord) {
    effectImageElement.dataset.effectSource = effectImageSource;
  } else {
    effectImageElement.src = effectImageSource;
  }
  effectImageElement.alt = "";
  effectImageElement.draggable = false;
  effectImageElement.decoding = "async";
  effectImageElement.style.objectFit = "contain";
  effectImageElement.style.mixBlendMode = "normal";
  effectImageElement.style.filter = effectVisualState.filter;
  if (effectVariantRecord) {
    effectImageElement.dataset.effectOriginalWidth = String(effectVariantRecord.originalWidth);
    effectImageElement.dataset.effectOriginalHeight = String(effectVariantRecord.originalHeight);
    effectImageElement.dataset.effectCropX = String(effectVariantRecord.cropX);
    effectImageElement.dataset.effectCropY = String(effectVariantRecord.cropY);
    effectImageElement.dataset.effectCropWidth = String(effectVariantRecord.width);
    effectImageElement.dataset.effectCropHeight = String(effectVariantRecord.height);
  }
  effectLayerElement.append(effectImageElement);
  return effectLayerElement;
}
