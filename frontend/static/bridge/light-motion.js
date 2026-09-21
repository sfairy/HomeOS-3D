/**
 * 灯光状态映射与过渡动画的纯计算层。
 *
 * 舞台页拿到 HA 灯光实体后，先用这里把实体上报值翻译成渲染层可用的亮度 / 颜色，再用过渡采样
 * 逐帧做渐变；不接触 three.js，只产出数字。导出 mapLightEffectState、lightEffectColorHex、
 * lightTransitionDurationMs、createLightTransition、sampleLightTransition。亮度用 0~100 百分比，
 * 色温用开尔文，颜色用 0xRRGGBB；全部为纯函数。
 */

// 数值夹取与换算统一走 utils/numbers.js（唯一实现）：clampNumber 保证写进渲染层的值永远在
// 合法区间，finiteNumberOr 把 NaN / undefined 这类「缺失」与合法的 0 区分开（0 往往有语义）。
import { clampNumber, finiteNumberOr } from "../utils/numbers.js?v=2609211957";
// 过渡用的灯态：亮度非负、颜色三通道归一到 [0,1]，避免插值过程中放大出非法值。
const normalizeLightState = lightState => ({
  intensity: Math.max(0, finiteNumberOr(lightState?.intensity, 0)),
  color: [0, 1, 2].map(channelIndex => clampNumber(finiteNumberOr(lightState?.color?.[channelIndex], 1), 0, 1))
});
/**
 * 区间归一：两端各自夹进 bounds，再保证下限不大于上限；顺序颠倒在这里被静默纠正，
 * 调用方无需再判大小。
 */
function normalizeRange(minValue, maxValue, fallbackRange, bounds) {
  const clampedMin = clampNumber(finiteNumberOr(minValue, fallbackRange[0]), bounds[0], bounds[1]);
  const clampedMax = clampNumber(finiteNumberOr(maxValue, fallbackRange[1]), bounds[0], bounds[1]);
  return [Math.min(clampedMin, clampedMax), Math.max(clampedMin, clampedMax)];
}
/**
 * 把灯光实体的原始状态映射成「效果区间内」的亮度与色温。
 * 灯启用效果后，上报的 brightness 只是百分比，实际可达范围由 effectRange 限定；直接当亮度
 * 用会与实际观感对不上，故按比例映射进效果区间。
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
    // 除以 99 是因为有效端点是 1 和 100。
    mappedState.brightness =
      brightnessPercent === 0
        ? 0
        : brightnessMin +
          ((brightnessMax - brightnessMin) * (clampNumber(brightnessPercent, 1, 100) - 1)) / 99;
  }
  // 色温只有在「实体给了 kelvin」且「效果区间至少有一端可用」时才映射，
  // 否则会把未启用色温的灯拖进一个凭空的区间。
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
    // 量程退化（上下限相等）时比例取 0，等价于取效果区间的最低色温。
    const kelvinRatio =
      kelvinRange[1] > kelvinRange[0]
        ? clampNumber((mappedState.kelvin - kelvinRange[0]) / (kelvinRange[1] - kelvinRange[0]), 0, 1)
        : 0;
    mappedState.kelvin = temperatureMin + (temperatureMax - temperatureMin) * kelvinRatio;
  }
  // 不支持调亮度的灯只能展示效果默认值，否则滑块会停在 0，看起来像坏了。
  if (
    lightEntry?.brightnessSupported === false &&
    Number.isFinite(lightEntry.effectDefaults?.brightness)
  ) {
    // 效果默认值同样按 150% 上限取值：与编辑器的输入上限保持一致。
    mappedState.brightness = clampNumber(lightEntry.effectDefaults.brightness, 0, 150);
  }
  // 同理：不支持色温的灯用效果默认色温兜底，避免显示成 0K 的极端冷色。
  if (
    lightEntry?.temperatureSupported === false &&
    Number.isFinite(lightEntry.effectDefaults?.kelvin)
  ) {
    mappedState.kelvin = clampNumber(lightEntry.effectDefaults.kelvin, 1000, 20000);
  }
  return mappedState;
}
/**
 * 色温（K）换算成 0xRRGGBB（Tanner Helland 经典近似式，66 是 6600K 分段点）。
 * 下面的浮点常数就是公式系数，改等于换公式，必须整段替换而非微调某一位。
 */
export function lightEffectColorHex(kelvin) {
  // 公式以「百 K」为单位，因此先除以 100。
  const scaledKelvin = clampNumber(finiteNumberOr(kelvin, 3000), 1000, 20000) / 100;
  const redChannel =
    scaledKelvin <= 66 ? 255 : Math.pow(scaledKelvin - 60, -0.1332047592) * 329.698727446;
  const greenChannel =
    scaledKelvin <= 66
      ? Math.log(scaledKelvin) * 99.4708025861 - 161.1195681661
      : Math.pow(scaledKelvin - 60, -0.0755148492) * 288.1221695283;
  const blueChannel =
    scaledKelvin >= 66
      ? 255
      : scaledKelvin <= 19
        ? 0
        : Math.log(scaledKelvin - 10) * 138.5177312231 - 305.0447927307;
  // 单通道收尾：四舍五入并夹到 0~255，保证下面拼出的整数始终在 0xRRGGBB 范围内。
  const clampChannel = channel => Math.round(clampNumber(channel, 0, 255));
  // 三通道各占 8 位拼成一个整数，与 CSS / three.js 的 0xRRGGBB 表示一致。
  return (
    (clampChannel(redChannel) << 16) | (clampChannel(greenChannel) << 8) | clampChannel(blueChannel)
  );
}
/**
 * 决定本次灯光变化的过渡时长：开关切换用组件配置的淡入淡出（夹在 0~10 秒，默认 0.3 秒）；
 * 预览求跟手、调光求顺滑，另有节奏。
 */
export function lightTransitionDurationMs(wasOn, isOn, fadeDurationSeconds, options = {}) {
  // 立即生效优先于一切：初始同步时做动画，会让画面从错误状态缓慢爬回正确值。
  if (options.immediate) {
    return 0;
  } else if (wasOn !== isOn) {
    return clampNumber(finiteNumberOr(fadeDurationSeconds, 0.3), 0, 10) * 1000;
  } else if (options.preview) {
    // 预览面板里的开关要「跟手」，90ms 是能看出过渡又不觉得迟钝的下限；
    // 但同一次预览里色温也变了的话，90ms 会让冷暖跳变显得生硬，放宽到 180ms。
    return options.temperatureChanged ? 180 : 90;
  } else {
    // 调节亮度 / 色温：220ms 让拖动滑块时的光影变化连续，同时不至于滞后于手指。
    return 220;
  }
}
/**
 * 构造一次灯光过渡描述。
 * 起点与终点都先归一，保证插值两侧的量纲一致（否则强度与颜色会互相污染）。
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
 * 用 smoothstep（3t² − 2t³）而非线性：起止处导数为 0，灯光变化不会出现生硬折角。
 * complete 为真时调用方可停止为这次过渡排帧。
 */
export function sampleLightTransition(transition, nowMs) {
  // duration 为 0（立即生效）时直接视为完成，避免除零得到 NaN 进度。
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
