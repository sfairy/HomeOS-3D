/**
 * 灯光状态映射与过渡动画的纯计算层。
 */

// 数值夹取与换算统一走 utils/numbers.js（唯一实现）：clampNumber 保证写进渲染层的值永远在
import { clampNumber, finiteNumberOr } from "../utils/numbers.js?v=2609271508";
// 色温换算（含唯一的公式与单通道夹取）也共用 utils/colors.js，别在这里再写一份系数。
import { kelvinToRgbHex } from "../utils/colors.js?v=2609271508";
const normalizeLightState = lightState => ({
  intensity: Math.max(0, finiteNumberOr(lightState?.intensity, 0)),
  color: [0, 1, 2].map(channelIndex => clampNumber(finiteNumberOr(lightState?.color?.[channelIndex], 1), 0, 1))
});
/**
 * 区间归一：两端各自夹进 bounds，再保证下限不大于上限；顺序颠倒在这里被静默纠正，
 */
function normalizeRange(minValue, maxValue, fallbackRange, bounds) {
  const clampedMin = clampNumber(finiteNumberOr(minValue, fallbackRange[0]), bounds[0], bounds[1]);
  const clampedMax = clampNumber(finiteNumberOr(maxValue, fallbackRange[1]), bounds[0], bounds[1]);
  return [Math.min(clampedMin, clampedMax), Math.max(clampedMin, clampedMax)];
}
/**
 * 把灯光实体的原始状态映射成「效果区间内」的亮度与色温。
 */
export function mapLightEffectState(lightEntry) {
  const mappedState = {
    brightness: lightEntry?.brightness,
    kelvin: lightEntry?.kelvin
  };
  const effectRange = lightEntry?.effectRange;
  // 实体没上报亮度就保持 undefined：兜底是上层的职责，这里不擅自编造数值。
  if (Number.isFinite(mappedState.brightness)) {
    const brightnessPercent = clampNumber(mappedState.brightness, 0, 100);
    // 效果区间默认 1~100；绝对范围是 0~150 —— 组件允许把亮度效果预设到 150%。
    const [brightnessMin, brightnessMax] = normalizeRange(
      effectRange?.brightnessMin,
      effectRange?.brightnessMax,
      [1, 100],
      [0, 150]
    );
    // 0 必须保持 0（关灯语义）；其余把 1~100 的百分比线性铺到效果区间上，
    mappedState.brightness =
      brightnessPercent === 0
        ? 0
        : brightnessMin +
          ((brightnessMax - brightnessMin) * (clampNumber(brightnessPercent, 1, 100) - 1)) / 99;
  }
  // 色温只有在「实体给了 kelvin」且「效果区间至少有一端可用」时才映射，
  if (
    Number.isFinite(mappedState.kelvin) &&
    (Number.isFinite(effectRange?.temperatureMin) || Number.isFinite(effectRange?.temperatureMax))
  ) {
    // 实体自身的 minimum / maximum 是它的物理量程，缺省 2000~6500 是常见家用灯的范围。
    const kelvinRange = normalizeRange(
      lightEntry.minimum,
      lightEntry.maximum,
      [2000, 6500],
      [1000, 20000]
    );
    const [temperatureMin, temperatureMax] = normalizeRange(
      effectRange.temperatureMin,
      effectRange.temperatureMax,
      kelvinRange,
      [1000, 20000]
    );
    // 先把实际色温归一成 0~1 的比例，再映射进效果区间：两侧量程不同也不会跳变；
    const kelvinRatio =
      kelvinRange[1] > kelvinRange[0]
        ? clampNumber((mappedState.kelvin - kelvinRange[0]) / (kelvinRange[1] - kelvinRange[0]), 0, 1)
        : 0;
    mappedState.kelvin = temperatureMin + (temperatureMax - temperatureMin) * kelvinRatio;
  }
  if (
    lightEntry?.brightnessSupported === false &&
    Number.isFinite(lightEntry.effectDefaults?.brightness)
  ) {
    // 效果默认值同样按 150% 上限取值：与编辑器的输入上限保持一致。
    mappedState.brightness = clampNumber(lightEntry.effectDefaults.brightness, 0, 150);
  }
  if (
    lightEntry?.temperatureSupported === false &&
    Number.isFinite(lightEntry.effectDefaults?.kelvin)
  ) {
    mappedState.kelvin = clampNumber(lightEntry.effectDefaults.kelvin, 1000, 20000);
  }
  return mappedState;
}
/**
 * 色温（K）换算成 0xRRGGBB（灯具发光色），公式与单通道收尾的唯一实现在 utils/colors.js。
 */
export function lightEffectColorHex(kelvin) {
  return kelvinToRgbHex(kelvin, { minKelvin: 1000, maxKelvin: 20000, fallbackKelvin: 3000 });
}
/**
 * 决定本次灯光变化的过渡时长：开关切换用组件配置的淡入淡出（夹在 0~10 秒，默认 0.3 秒）；
 */
export function lightTransitionDurationMs(wasOn, isOn, fadeDurationSeconds, options = {}) {
  // 立即生效优先于一切：初始同步时做动画，会让画面从错误状态缓慢爬回正确值。
  if (options.immediate) {
    return 0;
  } else if (wasOn !== isOn) {
    return clampNumber(finiteNumberOr(fadeDurationSeconds, 0.3), 0, 10) * 1000;
  } else if (options.preview) {
    // 预览面板里的开关要「跟手」，90ms 是能看出过渡又不觉得迟钝的下限；
    return options.temperatureChanged ? 180 : 90;
  } else {
    // 调节亮度 / 色温：220ms 让拖动滑块时的光影变化连续，同时不至于滞后于手指。
    return 220;
  }
}
/**
 * 构造一次灯光过渡描述。
 */
export function createLightTransition(fromState, toState, startedAtMs, durationMs) {
  return {
    from: normalizeLightState(fromState),
    to: normalizeLightState(toState),
    started: finiteNumberOr(startedAtMs, 0),
    duration: Math.max(0, finiteNumberOr(durationMs, 0))
  };
}
/**
 * 按时间采样一次过渡结果。
 */
export function sampleLightTransition(transition, nowMs) {
  const progress = transition.duration
    ? clampNumber((finiteNumberOr(nowMs, transition.started) - transition.started) / transition.duration, 0, 1)
    : 1;
  // 三次 smoothstep：进度本身已夹在 0~1，因此结果同样不会越界。
  const easedProgress = progress * progress * (3 - progress * 2);
  return {
    intensity:
      transition.from.intensity +
      (transition.to.intensity - transition.from.intensity) * easedProgress,
    color: transition.from.color.map(
      (fromChannel, colorIndex) =>
        fromChannel + (transition.to.color[colorIndex] - fromChannel) * easedProgress
    ),
    complete: progress === 1
  };
}
