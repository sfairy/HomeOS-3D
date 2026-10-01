export function relativeLightColorTemperature(arg1, arg2, arg3) {
  const value1 = Number(arg1),
    value2 = Number(arg2),
    value3 = Math.max(0, Math.min(100, Number(arg3) || 0)) / 100;
  return !Number.isFinite(value1) || !Number.isFinite(value2) || value2 <= value1
    ? Number.isFinite(value1)
      ? value1
      : 2700
    : value1 + (value2 - value1) * value3;
}
export function lightVisualValueForCapability(arg4, arg5, arg6) {
  const value4 = Number(arg5);
  return arg4 && Number.isFinite(value4) ? value4 : Number(arg6);
}
const x = new Set(["hs", "rgb", "rgbw", "rgbww", "xy"]);
function p(arg7 = {}) {
  const value5 = Array.isArray(arg7?.supported_color_modes)
    ? arg7.supported_color_modes
        .map((arg8) =>
          String(arg8 || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean)
    : [];
  return value5.length ? value5 : lightColorHs(arg7) ? ["hs"] : value5;
}
const d = (arg9, arg10) =>
  Array.isArray(arg9) &&
  arg9.length === arg10 &&
  arg9.every(
    (arg11) => typeof arg11 == "number" && Number.isFinite(arg11) && arg11 >= 0 && arg11 <= 255,
  );
export function lightKelvinRgb(arg12) {
  const value6 = Math.max(1000, Math.min(40000, Number(arg12) || 2700)) / 100;
  return [
    value6 <= 66 ? 255 : 329.698727446 * (value6 - 60) ** -0.1332047592,
    value6 <= 66
      ? 99.4708025861 * Math.log(value6) - 161.1195681661
      : 288.1221695283 * (value6 - 60) ** -0.0755148492,
    value6 >= 66 ? 255 : value6 <= 19 ? 0 : 138.5177312231 * Math.log(value6 - 10) - 305.0447927307,
  ].map((arg13) => Math.max(0, Math.min(255, arg13)));
}
export function lightColorRgb(arg14 = {}) {
  const value7 = arg14,
    value8 = value7.color_mode;
  if (value8 === "white") return [255, 255, 255];
  if (["color_temp", "onoff", "brightness", "unknown"].includes(value8)) return null;
  const fn1 = () =>
      Array.isArray(value7.hs_color) &&
      value7.hs_color.length === 2 &&
      value7.hs_color.every((arg15) => typeof arg15 == "number" && Number.isFinite(arg15))
        ? hsToRgbColor(value7.hs_color)
        : null,
    fn2 = () => (d(value7.rgb_color, 3) ? [...value7.rgb_color] : null),
    fn3 = (arg16, arg17) => {
      if (!d(value7[arg16], arg17)) return null;
      const value9 = value7[arg16];
      let list1 = [value9[3], value9[3], value9[3]];
      if (arg17 === 5) {
        const [value12, value13] = value9.slice(3),
          value14 = Number(value7.min_color_temp_kelvin) || 2700,
          value15 = Number(value7.max_color_temp_kelvin) || 6500,
          value16 = value12 + value13 ? value13 / (value12 + value13) : 0.5,
          value17 =
            1000000 / (1000000 / value15 + value16 * (1000000 / value14 - 1000000 / value15));
        list1 = lightKelvinRgb(value17).map((arg18) => (arg18 * Math.max(value12, value13)) / 255);
      }
      const value10 = value9.slice(0, 3).map((arg19, arg20) => arg19 + list1[arg20]),
        value11 = Math.max(...value10) ? Math.max(...value9) / Math.max(...value10) : 0;
      return value10.map((arg21) => Math.round(arg21 * value11));
    },
    fn4 = () => {
      if (
        !Array.isArray(value7.xy_color) ||
        value7.xy_color.length !== 2 ||
        !value7.xy_color.every((arg22) => typeof arg22 == "number" && Number.isFinite(arg22))
      )
        return null;
      const [value18, value19] = value7.xy_color;
      if (value18 < 0 || value19 <= 0 || value18 + value19 > 1.00001) return null;
      const value20 = value18 / value19,
        value21 = (1 - value18 - value19) / value19,
        value22 = [
          1.656492 * value20 - 0.354851 - 0.255038 * value21,
          -0.707196 * value20 + 1.655397 + 0.036152 * value21,
          0.051713 * value20 - 0.121364 + 1.01153 * value21,
        ].map((arg23) =>
          arg23 <= 0.0031308
            ? Math.max(0, arg23) * 12.92
            : 1.055 * Math.pow(arg23, 1 / 2.4) - 0.055,
        ),
        value23 = Math.max(...value22, 1);
      return value22.map((arg24) => Math.round((arg24 / value23) * 255));
    };
  return value8 === "hs"
    ? fn1() || fn2()
    : value8 === "xy"
      ? fn2() || fn4() || fn1()
      : value8 === "rgbw"
        ? fn2() || fn3("rgbw_color", 4) || fn1()
        : value8 === "rgbww"
          ? fn2() || fn3("rgbww_color", 5) || fn1()
          : value8 === "rgb"
            ? fn2() || fn1()
            : fn2() || fn3("rgbw_color", 4) || fn3("rgbww_color", 5) || fn1() || fn4();
}
export function lightColorHs(arg25 = {}) {
  if (
    (!arg25.color_mode || arg25.color_mode === "hs") &&
    Array.isArray(arg25.hs_color) &&
    arg25.hs_color.length === 2 &&
    arg25.hs_color.every((arg26) => typeof arg26 == "number" && Number.isFinite(arg26))
  )
    return [((arg25.hs_color[0] % 360) + 360) % 360, Math.max(0, Math.min(100, arg25.hs_color[1]))];
  const value24 = lightColorRgb(arg25);
  return value24 ? rgbToHsColor(value24) : null;
}
export function lightControlModes(arg27 = {}) {
  const value25 = p(arg27);
  return [
    ...(value25.some((arg28) => x.has(arg28)) ? ["color"] : []),
    ...(value25.includes("color_temp") ? ["temperature"] : []),
    ...(value25.includes("white") ? ["white"] : []),
  ];
}
export function lightControlMode(arg29, arg30) {
  const value26 = arg29 === "color_temp" ? "temperature" : arg29 === "white" ? "white" : "color";
  return arg30.includes(value26) ? value26 : arg30[0] || "temperature";
}
export function lightSupportsColor(arg31 = {}) {
  return p(arg31).some((arg32) => x.has(arg32));
}
export function lightRealtimeCapabilities(arg33 = "", arg34 = {}) {
  const value27 = arg34?.newState || arg34 || {},
    value28 = value27?.attributes || {},
    value29 =
      String(arg33 || value27.entityId || value27.domain || "").split(".", 1)[0] === "light",
    value30 = Array.isArray(value28.supported_color_modes) ? value28.supported_color_modes : [],
    value31 = Number(value28.supported_features || 0),
    fn5 = (arg35) =>
      value28[arg35] !== null &&
      value28[arg35] !== undefined &&
      Number.isFinite(Number(value28[arg35]));
  return {
    brightness:
      value29 &&
      (fn5("brightness") || value30.some((arg36) => arg36 !== "onoff") || (value31 & 1) === 1),
    colorTemperature:
      value29 &&
      (value30.includes("color_temp") ||
        fn5("color_temp_kelvin") ||
        fn5("min_color_temp_kelvin") ||
        fn5("max_color_temp_kelvin") ||
        fn5("color_temp") ||
        (value31 & 2) === 2),
  };
}
export function rgbToHsColor(arg37) {
  if (!Array.isArray(arg37) || arg37.length < 3) return null;
  const value32 = arg37
      .slice(0, 3)
      .map((arg38) => Math.max(0, Math.min(255, Number(arg38) || 0)) / 255),
    value33 = Math.max(...value32),
    value34 = Math.min(...value32),
    value35 = value33 - value34;
  let value36 = 0;
  (value35 > 0 &&
    (value33 === value32[0]
      ? (value36 = 60 * (((value32[1] - value32[2]) / value35) % 6))
      : value33 === value32[1]
        ? (value36 = 60 * ((value32[2] - value32[0]) / value35 + 2))
        : (value36 = 60 * ((value32[0] - value32[1]) / value35 + 4))),
    value36 < 0 && (value36 += 360));
  const value37 = value33 <= 0 ? 0 : value35 / value33;
  return [value36, value37 * 100];
}
export function hsToRgbColor(arg39) {
  if (!Array.isArray(arg39) || arg39.length < 2) return null;
  const value38 = (((Number(arg39[0]) || 0) % 360) + 360) % 360,
    value39 = Math.max(0, Math.min(100, Number(arg39[1]) || 0)) / 100,
    value40 = 1,
    value41 = value40 * value39,
    value42 = value38 / 60,
    value43 = value41 * (1 - Math.abs((value42 % 2) - 1)),
    value44 = value40 - value41,
    [value45, value46, value47] =
      value42 < 1
        ? [value41, value43, 0]
        : value42 < 2
          ? [value43, value41, 0]
          : value42 < 3
            ? [0, value41, value43]
            : value42 < 4
              ? [0, value43, value41]
              : value42 < 5
                ? [value43, 0, value41]
                : [value41, 0, value43];
  return [value45, value46, value47].map((arg40) => Math.round((arg40 + value44) * 255));
}
export function lightColorPickerHsFromPoint(arg41, arg42, arg43 = 1) {
  const value48 = Math.max(0, Math.min(1, Number(arg41) || 0)),
    value49 = Math.max(0, Math.min(1, Number(arg42) || 0)),
    value50 = value48 - 0.5,
    value51 = value49 - 0.5,
    value52 = Math.max(Math.abs(value50), Math.abs(value51)) * 2,
    value53 = Number.isFinite(arg43) && arg43 > 0 ? arg43 : 1;
  return [
    ((((Math.atan2(value51, value50 * value53) * 180) / Math.PI + 360) % 360) + 90) % 360,
    value52 * 100,
  ];
}
export function lightColorPickerPointFromHs(arg44, arg45 = 1) {
  const value54 = (((Number(arg44?.[0]) || 0) % 360) + 360) % 360,
    value55 = Math.max(0, Math.min(100, Number(arg44?.[1]) || 0)) / 100,
    value56 = ((value54 - 90) * Math.PI) / 180,
    value57 = Number.isFinite(arg45) && arg45 > 0 ? arg45 : 1,
    value58 = Math.cos(value56) / value57,
    value59 = Math.sin(value56),
    value60 = (value55 * 0.5) / Math.max(Math.abs(value58), Math.abs(value59));
  return {
    x: Math.max(0, Math.min(1, 0.5 + value58 * value60)),
    y: Math.max(0, Math.min(1, 0.5 + value59 * value60)),
  };
}
export function lightColorServiceData(arg46, arg47) {
  const value61 = p(arg46),
    list2 = [
      Math.round((((Number(arg47?.[0]) || 0) % 360) + 360) % 360),
      Math.round(Math.max(0, Math.min(100, Number(arg47?.[1]) || 0))),
    ];
  return value61.includes("hs") || value61.includes("xy") || !value61.includes("rgb")
    ? {
        hs_color: list2,
      }
    : {
        rgb_color: hsToRgbColor(list2),
      };
}
export const UNSUPPORTED_LIGHT_VISUAL_TEMPERATURE_KELVIN = 4600,
  UNSUPPORTED_LIGHT_VISUAL_BRIGHTNESS_PERCENT = 100;
export function lightPresetBrightnessServiceData(arg48) {
  const value62 = Math.max(1, Math.min(100, Math.round(Number(arg48) || 1)));
  return value62 === 100
    ? {
        brightness: 255,
      }
    : {
        brightness_pct: value62,
      };
}
export const LIGHT_DETAIL_PRESET_DEFINITIONS = Object.freeze([
    Object.freeze({
      label: "柔和",
      detail: "25%",
      brightnessPercent: 25,
      colorTemperaturePercent: 10,
    }),
    Object.freeze({
      label: "日常",
      detail: "60%",
      brightnessPercent: 60,
      colorTemperaturePercent: 50,
    }),
    Object.freeze({
      label: "明亮",
      detail: "100%",
      brightnessPercent: 100,
      colorTemperaturePercent: 100,
    }),
  ]),
  LIGHT_PRESET_MINIMUM_HOLD_MS = 8000,
  LIGHT_PRESET_STABLE_CONFIRMATION_MS = 1200,
  LIGHT_PRESET_MAXIMUM_HOLD_MS = 12000;
export function lightPresetPendingDecision(arg49, arg50 = Date.now()) {
  if (!arg49) return "idle";
  const value63 = Number(arg50) || 0;
  if (value63 >= Number(arg49.expiresAt || 0)) return "timeout";
  if (!arg49.latestMatches || !Number.isFinite(Number(arg49.matchStartedAt))) return "hold";
  const value64 = value63 >= Number(arg49.minimumHoldUntil || 0),
    value65 = value63 - Number(arg49.matchStartedAt) >= LIGHT_PRESET_STABLE_CONFIRMATION_MS;
  return value64 && value65 ? "confirmed" : "hold";
}
