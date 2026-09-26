/**
 * 图标按钮特效的视觉知识：色温基准、亮度到透明度、特效层的绘制。
 *
 * `components/icon-button-effect.js` 只负责注册，实际绘制在这里。
 */
import { lightRealtimeCapabilities } from "../../controls/light-runtime.js?v=2609260946";
// 状态条目归一与小写状态文本统一走 utils/state-entry.js，全仓库只有这一份实现。
import { resolveStateEntry, stateTextOf } from "../../../utils/state-entry.js?v=2609260946";
// 数值夹取统一走 utils/numbers.js。`clampNumber` 只用于三处：那三处 `clampCoercedNumber`
// 的兜底是**算出来的表达式**、存在越界的现实可能，所以要在调用点先夹一次
// （见 `utils/numbers.js` 模块头那张口径表）。
import { clampCoercedNumber, isUsableNumber } from "../../../utils/numbers.js?v=2609260946";
// 同门分片：builtin-assets
import {
  effectVariantByAssetId,
  resolveAssetUrl
} from "./builtin-assets.js?v=2609260946";
// 同门分片：entity-state
import { isLightVisualActive } from "./entity-state.js?v=2609260946";

/**
 * 判断灯光特效是否在「等待实时视觉参数」：刚开灯时 brightness / color_temp 常晚一拍才上报，
 * 立刻按缺失属性绘制会先闪一下默认值；灯已开、能力支持、属性未到时返回 true，渲染侧打 awaiting-light-visual 类。
 * 编辑态 / 非 light 域 / 两项实时效果都关闭返回 false，状态缺失 / unknown / unavailable 返回 true；乐观开机以乐观状态为准。
 */
export function iconButtonEffectLightVisualAwaiting(effectAwaitComponent, effectAwaitContext = {}) {
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
  const effectAwaitState = resolveStateEntry(effectAwaitContext.states?.get?.(effectAwaitEntityId));
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
  // 的属性正是这几种形态），数字字符串则算可用。口径唯一实现在 utils/numbers.js 的
  // isUsableNumber，能力探测与这里共用 —— 原先两处各写一份，判空串的口径正好相反。
  // 返回 false 表示实时值还没到，调用方据此继续等待视觉。
  const hasNumericAttribute = attributeKey =>
    isUsableNumber(effectAwaitAttributes[attributeKey]);
  if (
    effectAwaitProperties.effectBrightnessRealtime !== false &&
    effectAwaitRealtimeCapabilities.brightness &&
    !hasNumericAttribute("brightness")
  ) {
    return true;
  }
  const effectSupportedColorModes = Array.isArray(effectAwaitAttributes.supported_color_modes)
    ? effectAwaitAttributes.supported_color_modes.map(colorModeName =>
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
 * 映射到 0.2~1 而非 0~1：最暗时仍留一点可见度，否则完全看不到控件；亮度缺失或非法时按满亮（1）。
 */
function brightnessPercentToOpacity(brightnessPercent) {
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

/**
 * 从属性取色温（开尔文）：新版 HA 给 color_temp_kelvin，老版只给 mired 的 color_temp，
 * 后者用 1000000 / mired 换算；都没有返回 null。
 */
function resolveColorTemperature(kelvinAttributes = {}) {
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
 * 两项实时效果可在控件属性里单独关掉，关掉的那项不参与计算（透明度按 1、滤镜 none），
 * 这样可固定一个理想外观而不随灯的实际状态变化。
 */
export function iconButtonEffectLightVisualState(lightVisualComponent, lightVisualContext = {}) {
  const lightVisualEntityId = String(lightVisualComponent?.bindings?.entity?.entityId || "");
  const lightVisualAttributes =
    resolveStateEntry(lightVisualContext.states?.get?.(lightVisualEntityId))?.attributes || {};
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
  const colorTemperatureKelvin = resolveColorTemperature(lightVisualAttributes);
  const visualProperties = lightVisualComponent?.properties || {};
  const isBrightnessRealtime = visualProperties.effectBrightnessRealtime !== false;
  const isColorTemperatureRealtime = visualProperties.effectColorTemperatureRealtime !== false;
  const brightnessOpacity = isBrightnessRealtime
    ? brightnessPercentToOpacity(brightnessPercentValue)
    : 1;
  if (!isColorTemperatureRealtime || !Number.isFinite(colorTemperatureKelvin)) {
    return {
      brightnessPercent: brightnessPercentValue,
      colorTemperatureKelvin: null,
      opacity: brightnessOpacity,
      filter: "none"
    };
  }
  // 偏暖窗口 1500K、偏冷窗口 3000K（冷端范围更宽，视觉上冷白光的变化本来就比暖光缓）；
  // 饱和度系数按 1 + 暖 * 0.95 - 冷 * 0.55 计算，暖端加得更猛、冷端收得更轻。
  const warmFactor = Math.max(
    0,
    Math.min(1, (ICON_BUTTON_EFFECT_BASE_TEMPERATURE_KELVIN - colorTemperatureKelvin) / 1500)
  );
  const coolFactor = Math.max(
    0,
    Math.min(1, (colorTemperatureKelvin - ICON_BUTTON_EFFECT_BASE_TEMPERATURE_KELVIN) / 3000)
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
 * 资源优先用服务端特效裁剪变体（省带宽显存），否则退回原图；用变体时先把裁剪参数写进 dataset
 * 而暂不设 src，交给 effect-geometry / 图片加载器拿到原图尺寸后再定最终地址与裁剪。
 */
export function renderIconButtonEffectLayer(effectLayerComponent, effectLayerContext) {
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
