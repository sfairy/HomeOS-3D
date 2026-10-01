import { hsToRgbColor } from "../../renderer/light-runtime.js?v=20260925-rgb-standard-v2-20260926-speaker-v1";
const s = (arg1, arg2, arg3) => Math.max(arg2, Math.min(arg3, arg1)),
  f = (arg4, arg5) => (Number.isFinite(arg4) ? arg4 : arg5),
  a = (arg6) => ({
    intensity: Math.max(0, f(arg6?.intensity, 0)),
    color: [0, 1, 2].map((arg7) => s(f(arg6?.color?.[arg7], 1), 0, 1)),
  });
function m(arg8, arg9, arg10, arg11) {
  const value1 = s(f(arg8, arg10[0]), arg11[0], arg11[1]),
    value2 = s(f(arg9, arg10[1]), arg11[0], arg11[1]);
  return [Math.min(value1, value2), Math.max(value1, value2)];
}
export function mapLightEffectState(arg12) {
  const object1 = {
    brightness: arg12?.brightness,
    kelvin: arg12?.kelvin,
  };
  let value3 = 1;
  if (arg12?.colorMode === "white") object1.colorRgb = [255, 255, 255];
  else {
    if (
      arg12?.colorSupported &&
      !["color_temp", "white", "onoff", "brightness", "unknown"].includes(arg12.colorMode)
    ) {
      const value5 =
        arg12.colorRgb || (Array.isArray(arg12.colorHs) ? hsToRgbColor(arg12.colorHs) : null);
      if (value5) {
        const value6 = Math.max(...value5) / 255;
        ((value3 =
          !arg12.colorMode || ["rgb", "rgbw", "rgbww"].includes(arg12.colorMode) ? value6 : 1),
          (object1.colorRgb = value5.map((arg13) => (value6 ? Math.round(arg13 / value6) : 0))));
      }
    }
  }
  const value4 = arg12?.effectRange;
  if (Number.isFinite(object1.brightness)) {
    const value7 = s(object1.brightness, 0, 100),
      [value8, value9] = m(value4?.brightnessMin, value4?.brightnessMax, [1, 100], [0, 150]);
    object1.brightness =
      value7 === 0 ? 0 : value8 + ((value9 - value8) * (s(value7, 1, 100) - 1)) / 99;
  }
  if (
    Number.isFinite(object1.kelvin) &&
    (Number.isFinite(value4?.temperatureMin) || Number.isFinite(value4?.temperatureMax))
  ) {
    const value10 = m(arg12.minimum, arg12.maximum, [2000, 6500], [1000, 20000]),
      [value11, value12] = m(value4.temperatureMin, value4.temperatureMax, value10, [1000, 20000]),
      value13 =
        value10[1] > value10[0]
          ? s((object1.kelvin - value10[0]) / (value10[1] - value10[0]), 0, 1)
          : 0;
    object1.kelvin = value11 + (value12 - value11) * value13;
  }
  return (
    arg12?.brightnessSupported === false &&
      Number.isFinite(arg12.effectDefaults?.brightness) &&
      (object1.brightness = s(arg12.effectDefaults.brightness, 0, 150)),
    arg12?.temperatureSupported === false &&
      Number.isFinite(arg12.effectDefaults?.kelvin) &&
      (object1.kelvin = s(arg12.effectDefaults.kelvin, 1000, 20000)),
    Number.isFinite(object1.brightness) && (object1.brightness *= value3),
    object1
  );
}
export function lightEffectColorHex(arg14, arg15 = null) {
  if (Array.isArray(arg15) && arg15.length === 3 && arg15.every(Number.isFinite))
    return arg15.reduce((arg16, arg17) => (arg16 << 8) | Math.round(s(arg17, 0, 255)), 0);
  const value14 = s(f(arg14, 3000), 1000, 20000) / 100,
    value15 = value14 <= 66 ? 255 : 329.698727446 * Math.pow(value14 - 60, -0.1332047592),
    value16 =
      value14 <= 66
        ? 99.4708025861 * Math.log(value14) - 161.1195681661
        : 288.1221695283 * Math.pow(value14 - 60, -0.0755148492),
    value17 =
      value14 >= 66
        ? 255
        : value14 <= 19
          ? 0
          : 138.5177312231 * Math.log(value14 - 10) - 305.0447927307,
    fn1 = (arg18) => Math.round(s(arg18, 0, 255));
  return (fn1(value15) << 16) | (fn1(value16) << 8) | fn1(value17);
}
export function lightTransitionDurationMs(arg19, arg20, arg21, arg22 = {}) {
  return arg22.immediate
    ? 0
    : arg19 !== arg20
      ? s(f(arg21, 0.3), 0, 10) * 1000
      : arg22.preview
        ? arg22.temperatureChanged
          ? 180
          : 90
        : 220;
}
export function createLightTransition(arg23, arg24, arg25, arg26) {
  return {
    from: a(arg23),
    to: a(arg24),
    started: f(arg25, 0),
    duration: Math.max(0, f(arg26, 0)),
  };
}
export function sampleLightTransition(arg27, arg28) {
  const value18 = arg27.duration
      ? s((f(arg28, arg27.started) - arg27.started) / arg27.duration, 0, 1)
      : 1,
    value19 = value18 * value18 * (3 - 2 * value18);
  return {
    intensity: arg27.from.intensity + (arg27.to.intensity - arg27.from.intensity) * value19,
    color: arg27.from.color.map(
      (arg29, arg30) => arg29 + (arg27.to.color[arg30] - arg29) * value19,
    ),
    complete: value18 === 1,
  };
}
