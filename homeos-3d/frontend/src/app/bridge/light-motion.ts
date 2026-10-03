import { hsToRgbColor } from "../renderer/controls/light-runtime";
import { clampNumber, finiteNumberOr } from "../utils/number";
const normalizeLightState = (lightState) => ({
    intensity: Math.max(0, finiteNumberOr(lightState?.intensity, 0)),
    color: [0, 1, 2].map((channelIndex) =>
      clampNumber(finiteNumberOr(lightState?.color?.[channelIndex], 1), 0, 1),
    ),
  });
function normalizeRange(minValue, maxValue, fallbackRange, bounds) {
  const clampedMin = clampNumber(finiteNumberOr(minValue, fallbackRange[0]), bounds[0], bounds[1]),
    clampedMax = clampNumber(finiteNumberOr(maxValue, fallbackRange[1]), bounds[0], bounds[1]);
  return [Math.min(clampedMin, clampedMax), Math.max(clampedMin, clampedMax)];
}
/**
 * 灯光效果映射的结果：colorRgb 只在灯具支持彩色时才补上，所以是可选字段。
 * 值一律按 any 处理：它们来自未定型的外部灯光条目，后面会直接参与算术与钳制。
 */
type MappedLightState = {
  brightness: any;
  kelvin: any;
  colorRgb?: any;
};
export function mapLightEffectState(lightEntry) {
  const mappedState: MappedLightState = {
    brightness: lightEntry?.brightness,
    kelvin: lightEntry?.kelvin,
  };
  let brightnessScale = 1;
  if (lightEntry?.colorMode === "white") mappedState.colorRgb = [255, 255, 255];
  else {
    if (
      lightEntry?.colorSupported &&
      !["color_temp", "white", "onoff", "brightness", "unknown"].includes(lightEntry.colorMode)
    ) {
      const rawRgbChannels =
        lightEntry.colorRgb ||
        (Array.isArray(lightEntry.colorHs) ? hsToRgbColor(lightEntry.colorHs) : null);
      if (rawRgbChannels) {
        const maxChannelRatio = Math.max(...rawRgbChannels) / 255;
        ((brightnessScale =
          !lightEntry.colorMode || ["rgb", "rgbw", "rgbww"].includes(lightEntry.colorMode)
            ? maxChannelRatio
            : 1),
          (mappedState.colorRgb = rawRgbChannels.map((channelValue) =>
            maxChannelRatio ? Math.round(channelValue / maxChannelRatio) : 0,
          )));
      }
    }
  }
  const effectRange = lightEntry?.effectRange;
  if (Number.isFinite(mappedState.brightness)) {
    const brightnessPercent = clampNumber(mappedState.brightness, 0, 100),
      [brightnessMin, brightnessMax] = normalizeRange(
        effectRange?.brightnessMin,
        effectRange?.brightnessMax,
        [1, 100],
        [0, 150],
      );
    mappedState.brightness =
      brightnessPercent === 0
        ? 0
        : brightnessMin +
          ((brightnessMax - brightnessMin) * (clampNumber(brightnessPercent, 1, 100) - 1)) / 99;
  }
  if (
    Number.isFinite(mappedState.kelvin) &&
    (Number.isFinite(effectRange?.temperatureMin) || Number.isFinite(effectRange?.temperatureMax))
  ) {
    const kelvinRange = normalizeRange(
        lightEntry.minimum,
        lightEntry.maximum,
        [2000, 6500],
        [1000, 20000],
      ),
      [temperatureMin, temperatureMax] = normalizeRange(
        effectRange.temperatureMin,
        effectRange.temperatureMax,
        kelvinRange,
        [1000, 20000],
      ),
      kelvinRatio =
        kelvinRange[1] > kelvinRange[0]
          ? clampNumber(
              (mappedState.kelvin - kelvinRange[0]) / (kelvinRange[1] - kelvinRange[0]),
              0,
              1,
            )
          : 0;
    mappedState.kelvin = temperatureMin + (temperatureMax - temperatureMin) * kelvinRatio;
  }
  return (
    lightEntry?.brightnessSupported === false &&
      Number.isFinite(lightEntry.effectDefaults?.brightness) &&
      (mappedState.brightness = clampNumber(lightEntry.effectDefaults.brightness, 0, 150)),
    lightEntry?.temperatureSupported === false &&
      Number.isFinite(lightEntry.effectDefaults?.kelvin) &&
      (mappedState.kelvin = clampNumber(lightEntry.effectDefaults.kelvin, 1000, 20000)),
    Number.isFinite(mappedState.brightness) && (mappedState.brightness *= brightnessScale),
    mappedState
  );
}
export function lightEffectColorHex(kelvin, rgbChannels = null) {
  if (Array.isArray(rgbChannels) && rgbChannels.length === 3 && rgbChannels.every(Number.isFinite))
    return rgbChannels.reduce(
      (packedHex, rgbChannel) => (packedHex << 8) | Math.round(clampNumber(rgbChannel, 0, 255)),
      0,
    );
  const scaledKelvin = clampNumber(finiteNumberOr(kelvin, 3000), 1000, 20000) / 100,
    redChannel =
      scaledKelvin <= 66 ? 255 : 329.698727446 * Math.pow(scaledKelvin - 60, -0.1332047592),
    greenChannel =
      scaledKelvin <= 66
        ? 99.4708025861 * Math.log(scaledKelvin) - 161.1195681661
        : 288.1221695283 * Math.pow(scaledKelvin - 60, -0.0755148492),
    blueChannel =
      scaledKelvin >= 66
        ? 255
        : scaledKelvin <= 19
          ? 0
          : 138.5177312231 * Math.log(scaledKelvin - 10) - 305.0447927307,
    clampChannel = (channel) => Math.round(clampNumber(channel, 0, 255));
  return (
    (clampChannel(redChannel) << 16) | (clampChannel(greenChannel) << 8) | clampChannel(blueChannel)
  );
}
// options 的三个开关都来自 UI 侧（立即生效 / 预览 / 只改了色温）；缺省时按普通切换处理。
export function lightTransitionDurationMs(
  wasOn,
  isOn,
  fadeDurationSeconds,
  options: { immediate?: boolean; preview?: boolean; temperatureChanged?: boolean } = {},
) {
  return options.immediate
    ? 0
    : wasOn !== isOn
      ? clampNumber(finiteNumberOr(fadeDurationSeconds, 0.3), 0, 10) * 1000
      : options.preview
        ? options.temperatureChanged
          ? 180
          : 90
        : 220;
}
export function createLightTransition(fromState, toState, startedAtMs, durationMs) {
  return {
    from: normalizeLightState(fromState),
    to: normalizeLightState(toState),
    started: finiteNumberOr(startedAtMs, 0),
    duration: Math.max(0, finiteNumberOr(durationMs, 0)),
  };
}
export function sampleLightTransition(transition, nowMs) {
  const progress = transition.duration
      ? clampNumber(
          (finiteNumberOr(nowMs, transition.started) - transition.started) / transition.duration,
          0,
          1,
        )
      : 1,
    easedProgress = progress * progress * (3 - 2 * progress);
  return {
    intensity:
      transition.from.intensity +
      (transition.to.intensity - transition.from.intensity) * easedProgress,
    color: transition.from.color.map(
      (fromChannel, colorIndex) =>
        fromChannel + (transition.to.color[colorIndex] - fromChannel) * easedProgress,
    ),
    complete: progress === 1,
  };
}
