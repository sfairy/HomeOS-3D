const {
    lightSupportsColor: L,
    lightColorRgb: T,
    lightColorHs: z,
    lightColorServiceData: B,
    hsToRgbColor: j,
  } = await (import.meta.url.startsWith("file:")
    ? import(new URL("../../static/renderer/light-runtime.js", import.meta.url))
    : import(
        new URL(
          "../../../../bridge-static/renderer/light-runtime.js?v=20260925-rgb-standard-v2-20260926-speaker-v1",
          import.meta.url,
        )
      )),
  k = (arg1) =>
    Array.isArray(arg1) &&
    arg1.length === 2 &&
    arg1.every((arg2) => typeof arg2 == "number" && Number.isFinite(arg2)) &&
    arg1[0] >= 0 &&
    arg1[0] <= 360 &&
    arg1[1] >= 0 &&
    arg1[1] <= 100;
export { j as hsToRgbColor };
const d = (arg3) => arg3 != null && arg3 !== "" && Number.isFinite(Number(arg3)),
  R = new Set(["hs", "xy", "rgb", "rgbw", "rgbww", "white", "brightness", "onoff", "unknown"]);
export function lightState(arg4, arg5, arg6) {
  const value1 = arg5?.newState || arg5 || {},
    value2 = value1.attributes || {},
    value3 = Array.isArray(value2.supported_color_modes) ? value2.supported_color_modes : [],
    value4 = arg4.startsWith("light."),
    value5 = value4 && (value3.length ? L(value2) : L(value2) || arg6?.colorSupported === true),
    value6 = (value5 && (T(value2) || arg6?.colorRgb)) || null,
    value7 = (value5 && (z(value2) || arg6?.colorHs)) || null,
    value8 =
      value4 && (value2.color_mode === "color_temp" || R.has(value2.color_mode))
        ? value2.color_mode
        : (arg6?.colorMode ?? null),
    value9 =
      value4 &&
      (value3.length
        ? value3.some((arg7) => !["onoff", "unknown"].includes(arg7))
        : d(value2.brightness) ||
          (Number(value2.supported_features) & 1) !== 0 ||
          arg6?.brightnessSupported === true),
    value10 =
      value4 &&
      (value3.length
        ? value3.includes("color_temp")
        : d(value2.color_temp_kelvin) ||
          d(value2.color_temp) ||
          d(value2.min_color_temp_kelvin) ||
          d(value2.max_color_temp_kelvin) ||
          (Number(value2.supported_features) & 2) !== 0 ||
          arg6?.temperatureSupported === true),
    value11 =
      value3.length > 0 ||
      d(value2.brightness) ||
      d(value2.color_temp_kelvin) ||
      d(value2.color_temp) ||
      d(value2.min_color_temp_kelvin) ||
      d(value2.max_color_temp_kelvin) ||
      (Number(value2.supported_features) & 3) !== 0 ||
      arg6?.capabilitiesKnown === true,
    value12 = d(value2.min_color_temp_kelvin)
      ? Number(value2.min_color_temp_kelvin)
      : Number(value2.max_mireds) > 0
        ? 1000000 / Number(value2.max_mireds)
        : (arg6?.minimum ?? 2000),
    value13 = d(value2.max_color_temp_kelvin)
      ? Number(value2.max_color_temp_kelvin)
      : Number(value2.min_mireds) > 0
        ? 1000000 / Number(value2.min_mireds)
        : (arg6?.maximum ?? 6500),
    value14 =
      d(value2.color_temp_kelvin) && Number(value2.color_temp_kelvin) > 0
        ? Number(value2.color_temp_kelvin)
        : d(value2.color_temp) && Number(value2.color_temp) > 0
          ? 1000000 / Number(value2.color_temp)
          : (arg6?.kelvin ?? null),
    value15 = d(value2.brightness) ? Math.max(0, Math.min(255, Number(value2.brightness))) : null,
    value16 =
      value15 !== null && !(value1.state === "off" && value15 === 0)
        ? value15 > 0
          ? Math.max(1, Math.round((value15 / 255) * 100))
          : 0
        : arg6?.brightness > 0
          ? arg6.brightness
          : null;
  return {
    on: value1.state === "on",
    available: ["on", "off"].includes(value1.state),
    name: value2.friendly_name || arg6?.name || arg4,
    brightnessSupported: value9,
    temperatureSupported: value10,
    colorSupported: value5,
    colorHs: value7,
    colorRgb: value6,
    colorModes: value3.length ? [...value3] : arg6?.colorModes || [],
    colorMode: value8,
    capabilitiesKnown: value11,
    brightness: value9 ? value16 : null,
    kelvin: value10 && d(value14) ? Math.round(value14) : null,
    minimum: Math.round(Math.max(1000, Math.min(value12, value13))),
    maximum: Math.round(Math.min(20000, Math.max(value12, value13))),
  };
}
export function lightRenderState(arg8) {
  const value17 = arg8.brightnessSupported && !Number.isFinite(arg8.brightness),
    value18 = arg8.temperatureSupported && !R.has(arg8.colorMode) && !Number.isFinite(arg8.kelvin);
  return {
    ...arg8,
    on: arg8.on && !value17 && !value18,
  };
}
const A = 10080 * 60 * 1000,
  E = 256,
  J = (arg9) => /^(light|switch)\.[a-z0-9_]+$/.test(arg9),
  w = (arg10) => typeof arg10 != "boolean" && d(arg10),
  C = {
    brightness: (arg11) => Number.isFinite(arg11) && arg11 > 0 && arg11 <= 100,
    kelvin: (arg12) => Number.isFinite(arg12) && arg12 > 0,
    minimum: (arg13) => Number.isFinite(arg13) && arg13 >= 1000 && arg13 <= 20000,
    maximum: (arg14) => Number.isFinite(arg14) && arg14 >= 1000 && arg14 <= 20000,
    colorMode: (arg15) => arg15 === "color_temp" || R.has(arg15),
    brightnessSupported: (arg16) => typeof arg16 == "boolean",
    temperatureSupported: (arg17) => typeof arg17 == "boolean",
    colorSupported: (arg18) => typeof arg18 == "boolean",
    colorHs: k,
    colorRgb: (arg19) =>
      Array.isArray(arg19) &&
      arg19.length === 3 &&
      arg19.every((arg20) => Number.isFinite(arg20) && arg20 >= 0 && arg20 <= 255),
    colorModes: (arg21) =>
      Array.isArray(arg21) &&
      arg21.length <= 12 &&
      arg21.every((arg22) => typeof arg22 == "string" && arg22.length < 32),
  };
function D(arg23, arg24) {
  const value19 = arg24?.newState || arg24 || {},
    value20 = value19.attributes || {},
    value21 = lightState(arg23, arg24),
    object1 = {},
    value22 = Array.isArray(value20.supported_color_modes) ? value20.supported_color_modes : [],
    value23 = w(value20.brightness) && Number(value20.brightness) > 0,
    value24 =
      (w(value20.color_temp_kelvin) && Number(value20.color_temp_kelvin) > 0) ||
      (w(value20.color_temp) && Number(value20.color_temp) > 0),
    value25 =
      (w(value20.min_color_temp_kelvin) && Number(value20.min_color_temp_kelvin) > 0) ||
      (w(value20.max_mireds) && Number(value20.max_mireds) > 0),
    value26 =
      (w(value20.max_color_temp_kelvin) && Number(value20.max_color_temp_kelvin) > 0) ||
      (w(value20.min_mireds) && Number(value20.min_mireds) > 0),
    value27 = w(value20.supported_features) ? Number(value20.supported_features) : 0;
  return (
    (value22.length || value23 || value27 & 1) &&
      (object1.brightnessSupported = value21.brightnessSupported),
    (value22.length || value24 || value25 || value26 || value27 & 2) &&
      (object1.temperatureSupported = value21.temperatureSupported),
    (value22.length || z(value20)) && (object1.colorSupported = value21.colorSupported),
    value22.length && (object1.colorModes = [...value22]),
    value21.colorSupported && T(value20) && (object1.colorRgb = value21.colorRgb),
    value21.colorSupported && z(value20) && (object1.colorHs = value21.colorHs),
    value23 && value21.brightnessSupported && (object1.brightness = value21.brightness),
    value24 && value21.temperatureSupported && (object1.kelvin = value21.kelvin),
    value25 && (object1.minimum = value21.minimum),
    value26 && (object1.maximum = value21.maximum),
    (value20.color_mode === "color_temp" || R.has(value20.color_mode)) &&
      (object1.colorMode = value21.colorMode),
    Object.fromEntries(Object.entries(object1).filter(([arg25, arg26]) => C[arg25](arg26)))
  );
}
function W(arg27, arg28, arg29, arg30, arg31) {
  if (!arg27 || typeof arg28 != "string" || !arg28.trim()) return null;
  const value28 = "hb-i3d:light-history:v1:" + arg28,
    map1 = new Map(),
    map2 = new Map();
  let value29 = true,
    value30 = null,
    value31 = false,
    value32 = 0;
  const fn1 = (arg32) => Math.max(0, ...Object.values(arg32).map((arg33) => arg33.at));
  function fn2(arg34) {
    if (arg34 < value32 && map1.size <= E) return false;
    let value33 = false;
    value32 = Infinity;
    for (const [value34, value35] of map1) {
      for (const [value36, value37] of Object.entries(value35))
        arg34 - value37.at >= A
          ? (delete value35[value36], (value33 = true))
          : (value32 = Math.min(value32, value37.at + A));
      Object.keys(value35).length || map1.delete(value34);
    }
    if (map1.size > E) {
      const value38 = [...map1].sort((arg35, arg36) => fn1(arg35[1]) - fn1(arg36[1]));
      for (const [value39] of value38.slice(0, map1.size - E)) map1.delete(value39);
      value33 = true;
    }
    return value33;
  }
  function fn3() {
    const map3 = new Map(),
      value40 = arg27.getItem(value28);
    if (value40) {
      const value41 = JSON.parse(value40),
        value42 = arg29();
      if (
        value41?.version !== 1 ||
        !value41.entities ||
        typeof value41.entities != "object" ||
        Array.isArray(value41.entities)
      )
        throw new Error("Invalid light history");
      for (const [value43, value44] of Object.entries(value41.entities)) {
        if (!J(value43) || !value44 || typeof value44 != "object" || Array.isArray(value44))
          continue;
        const object2 = {};
        for (const [value45, value46] of Object.entries(value44))
          Object.hasOwn(C, value45) &&
            C[value45](value46?.value) &&
            Number.isFinite(value46.at) &&
            value46.at >= 0 &&
            value46.at <= value42 &&
            value42 - value46.at < A &&
            (object2[value45] = {
              value: value46.value,
              at: value46.at,
            });
        Object.keys(object2).length && map3.set(value43, object2);
      }
    }
    return map3;
  }
  try {
    for (const [value47, value48] of fn3()) map1.set(value47, value48);
    fn2(arg29());
  } catch {
    return null;
  }
  const fn4 = () =>
    JSON.stringify({
      version: 1,
      entities: Object.fromEntries(map1),
    });
  function fn5() {
    if ((value30 !== null && (arg31(value30), (value30 = null)), !(!value29 || !value31))) {
      value31 = false;
      try {
        for (const [value49, value50] of fn3()) {
          const value51 = map1.get(value49) || {};
          for (const [value52, value53] of Object.entries(value50))
            (!value51[value52] || value51[value52].at < value53.at) && (value51[value52] = value53);
          (value51.brightnessSupported?.value === false && delete value51.brightness,
            value51.temperatureSupported?.value === false && delete value51.kelvin,
            value51.colorSupported?.value === false &&
              (delete value51.colorHs, delete value51.colorRgb),
            map1.set(value49, value51));
        }
        ((value32 = 0), fn2(arg29()), arg27.setItem(value28, fn4()));
      } catch {
        value29 = false;
      }
    }
  }
  function fn6() {
    !value29 ||
      value30 !== null ||
      !value31 ||
      (value30 = arg30(() => {
        ((value30 = null), fn5());
      }));
  }
  return {
    resolve(arg37, arg38) {
      const value54 = arg29();
      if (((value31 = fn2(value54) || value31), J(arg37))) {
        const value56 = D(arg37, arg38),
          value57 = JSON.stringify(value56);
        if (map2.get(arg37) !== value57) {
          (map2.delete(arg37), map2.set(arg37, value57));
          const value58 = map1.get(arg37) || {};
          for (const [value59, value60] of Object.entries(value56))
            JSON.stringify(value58[value59]?.value) !== JSON.stringify(value60) &&
              ((value58[value59] = {
                value: value60,
                at: value54,
              }),
              (value32 = Math.min(value32, value54 + A)),
              (value31 = true));
          for (
            value56.brightnessSupported === false &&
              value58.brightness &&
              (delete value58.brightness, (value31 = true)),
              value56.colorSupported === false &&
                (value58.colorHs || value58.colorRgb) &&
                (delete value58.colorHs, delete value58.colorRgb, (value31 = true)),
              value56.temperatureSupported === false &&
                value58.kelvin &&
                (delete value58.kelvin, (value31 = true)),
              Object.keys(value58).length && map1.set(arg37, value58);
            map2.size > E;
          )
            map2.delete(map2.keys().next().value);
        }
      }
      ((value31 = fn2(value54) || value31), fn6());
      const value55 = Object.fromEntries(
        Object.entries(map1.get(arg37) || {}).map(([arg39, arg40]) => [arg39, arg40.value]),
      );
      return (
        (value55.colorSupported ??= k(value55.colorHs)),
        (value55.brightnessSupported ??=
          Number.isFinite(value55.brightness) ||
          !!(value55.colorMode && value55.colorMode !== "onoff")),
        (value55.temperatureSupported ??=
          Number.isFinite(value55.kelvin) ||
          Number.isFinite(value55.minimum) ||
          Number.isFinite(value55.maximum) ||
          value55.colorMode === "color_temp"),
        value55
      );
    },
    flush: fn5,
    clear() {
      if (
        (value30 !== null && (arg31(value30), (value30 = null)),
        map1.clear(),
        map2.clear(),
        (value31 = false),
        (value32 = Infinity),
        value29)
      )
        try {
          arg27.removeItem(value28);
        } catch {
          value29 = false;
        }
    },
  };
}
export function createLightStateCache({
  storage: arg41,
  scope: arg42,
  now: arg43 = () => Date.now(),
  schedule: arg44 = (arg46) => setTimeout(arg46, 50),
  cancel: arg45 = (arg47) => clearTimeout(arg47),
} = {}) {
  const map4 = new Map(),
    value61 = W(arg41, arg42, arg43, arg44, arg45);
  return {
    resolve(arg48, arg49) {
      const value62 = value61
          ? {
              name: map4.get(arg48)?.name,
              ...value61.resolve(arg48, arg49),
            }
          : map4.get(arg48),
        value63 = lightState(arg48, arg49, value62);
      return (
        map4.set(
          arg48,
          value63.brightness === 0
            ? {
                ...value63,
                brightness: value62?.brightness > 0 ? value62.brightness : null,
              }
            : value63,
        ),
        value63
      );
    },
    flush() {
      value61?.flush();
    },
    clear() {
      (map4.clear(), value61?.clear());
    },
  };
}
export function lightCommand(arg50, arg51, arg52, arg53) {
  if (!/^(light|switch)\.[a-z0-9_]+$/.test(arg50) || !arg53.available)
    throw new Error("设备不可用。");
  const value64 = arg50.split(".")[0];
  if (arg51 === "power")
    return {
      domain: value64,
      service: arg52 ? "turn_on" : "turn_off",
      entityId: arg50,
      data: {},
    };
  if (arg51 === "white" && arg53.colorModes?.includes("white"))
    return {
      domain: value64,
      service: "turn_on",
      entityId: arg50,
      data: {
        white: Math.round((Math.max(1, Math.min(100, arg53.brightness || 100)) * 255) / 100),
      },
    };
  if (arg51 === "color") {
    if (!arg53.colorSupported || !k(arg52)) throw new Error("此设备不支持该颜色或颜色参数无效。");
    return {
      domain: value64,
      service: "turn_on",
      entityId: arg50,
      data: B(
        {
          supported_color_modes: arg53.colorModes,
        },
        arg52,
      ),
    };
  }
  if (!Number.isFinite(Number(arg52))) throw new Error("灯光参数无效。");
  if (arg51 === "brightness" && arg53.brightnessSupported)
    return {
      domain: value64,
      service: "turn_on",
      entityId: arg50,
      data: {
        brightness: Math.round((Math.max(1, Math.min(100, Number(arg52))) * 255) / 100),
      },
    };
  if (arg51 === "temperature" && arg53.temperatureSupported)
    return {
      domain: value64,
      service: "turn_on",
      entityId: arg50,
      data: {
        color_temp_kelvin: Math.round(
          Math.max(arg53.minimum, Math.min(arg53.maximum, Number(arg52))),
        ),
      },
    };
  throw new Error("此设备不支持该灯光调节。");
}
export function createLightPreview({ now: arg54 = () => performance.now() } = {}) {
  const map5 = new Map();
  let value65 = 0;
  return {
    set(arg55, arg56, arg57, arg58 = false) {
      const object3 = {
        ...map5.get(arg55)?.values,
        on: arg56 === "power" ? arg57 === true : true,
      };
      (arg56 === "brightness" && (object3.brightness = arg57),
        arg56 === "temperature" &&
          ((object3.kelvin = arg57),
          (object3.colorMode = "color_temp"),
          delete object3.colorHs,
          delete object3.colorRgb),
        arg56 === "color" &&
          k(arg57) &&
          ((object3.colorHs = [...arg57]),
          (object3.colorRgb = j(arg57)),
          (object3.colorMode = "hs"),
          delete object3.kelvin),
        arg56 === "white" &&
          ((object3.colorMode = "white"),
          (object3.colorRgb = [255, 255, 255]),
          (object3.colorHs = [0, 0]),
          delete object3.kelvin),
        arg56 === "preset" &&
          (Number.isFinite(arg57?.brightness) && (object3.brightness = arg57.brightness),
          Number.isFinite(arg57?.kelvin) &&
            ((object3.kelvin = arg57.kelvin),
            (object3.colorMode = "color_temp"),
            delete object3.colorHs,
            delete object3.colorRgb)),
        arg56 === "power" &&
          !arg57 &&
          (delete object3.brightness,
          delete object3.kelvin,
          delete object3.colorHs,
          delete object3.colorRgb,
          delete object3.colorMode));
      const object4 = {
        values: object3,
        revision: ++value65,
        committed: arg58,
        expires: arg54() + 15000,
      };
      return (map5.set(arg55, object4), object4.revision);
    },
    state(arg59, arg60) {
      return {
        ...arg60,
        ...map5.get(arg59)?.values,
      };
    },
    reconcile(arg61, arg62) {
      const value66 = map5.get(arg61);
      if (!value66) return;
      const value67 = Object.entries(value66.values).every(([arg63, arg64]) =>
        arg63 === "on"
          ? arg62.on === arg64
          : arg63 === "colorMode"
            ? arg64 === "white"
              ? arg62.colorMode === "white"
              : arg64 === "color_temp"
                ? arg62.colorMode === "color_temp" ||
                  (!arg62.colorMode && Number.isFinite(arg62.kelvin))
                : ["hs", "rgb", "rgbw", "rgbww", "xy"].includes(arg62.colorMode) ||
                  (!arg62.colorMode && k(arg62.colorHs))
            : arg63 === "colorRgb"
              ? true
              : arg63 === "colorHs"
                ? k(arg62.colorHs) &&
                  j(arg62.colorHs).every((arg65, arg66) => Math.abs(arg65 - j(arg64)[arg66]) <= 4)
                : Number.isFinite(arg62[arg63]) &&
                  Math.abs(arg62[arg63] - arg64) <= (arg63 === "kelvin" ? 15 : 1),
      );
      (!arg62.available || (value66.committed && value67)) && map5.delete(arg61);
    },
    hold(arg67, arg68) {
      const value68 = map5.get(arg67);
      value68?.revision === arg68 && (value68.committed = false);
    },
    retain(arg69, arg70) {
      const value69 = map5.get(arg69);
      value69?.revision === arg70 &&
        ((value69.committed = true), (value69.expires = arg54() + 15000));
    },
    acknowledge(arg71, arg72) {
      const value70 = map5.get(arg71);
      value70?.revision === arg72 && (value70.expires = arg54() + 8000);
    },
    reject(arg73, arg74) {
      map5.get(arg73)?.revision === arg74 && map5.delete(arg73);
    },
    expire() {
      let value71 = false;
      for (const [value72, value73] of map5)
        value73.expires <= arg54() && (map5.delete(value72), (value71 = true));
      return value71;
    },
    clear() {
      map5.clear();
    },
    nextDelay(arg75 = arg54()) {
      let value74 = Infinity;
      for (const value75 of map5.values()) value74 = Math.min(value74, value75.expires);
      return Math.max(0, value74 - arg75);
    },
  };
}
