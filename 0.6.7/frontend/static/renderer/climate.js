const S = new Set(["auto", "air-conditioner", "bath-heater"]);
function h(arg1) {
  return Array.isArray(arg1)
    ? [...new Set(arg1.map((arg2) => String(arg2 ?? "").trim()).filter(Boolean))]
    : [];
}
function d(arg3, arg4 = null) {
  if (arg3 == null || arg3 === "") return arg4;
  const value1 = Number(arg3);
  return Number.isFinite(value1) ? value1 : arg4;
}
export function configuredClimateDeviceType(arg5) {
  const value2 = String(arg5?.properties?.deviceType || "auto");
  return S.has(value2) ? value2 : "auto";
}
export function normalizeClimateCapabilities(arg6) {
  const value3 = arg6?.attributes && typeof arg6.attributes == "object" ? arg6.attributes : {},
    value4 = h(value3.hvac_modes),
    value5 = h(value3.fan_modes),
    value6 = h(value3.swing_modes),
    value7 = h(value3.swing_horizontal_modes),
    value8 = h(value3.preset_modes),
    value9 = h(value3.operation_list),
    value10 = d(value3.percentage),
    value11 = Math.max(1, d(value3.percentage_step, 1)),
    value12 = d(value3.temperature),
    value13 = d(value3.current_temperature);
  let value14 = d(value3.min_temp, 16),
    value15 = d(value3.max_temp, 30);
  value15 <= value14 && ((value14 = 16), (value15 = 30));
  const value16 = Math.max(0.1, d(value3.target_temp_step, 0.5));
  return {
    attributes: value3,
    hvacModes: value4,
    fanModes: value5,
    swingModes: value6,
    horizontalSwingModes: value7,
    presetModes: value8,
    operationModes: value9,
    fanPercentage: value10,
    fanPercentageStep: value11,
    targetTemperature: value12,
    currentTemperature: value13,
    minimumTemperature: value14,
    maximumTemperature: value15,
    temperatureStep: value16,
    supportsTargetTemperature: value12 !== null,
    hasModeControl:
      value4.some((arg7) => arg7 !== "off") ||
      value9.some((arg8) => !["off", "空"].includes(arg8.toLowerCase())),
    hasFanControl: value5.length > 0,
    hasSwingControl: value6.length > 0,
    hasHorizontalSwingControl: value7.length > 0,
    hasPresetControl: value8.length > 0,
    supportsFanPercentage: value10 !== null,
  };
}
export function climateOperationModeValues(arg9, arg10 = "air-conditioner") {
  const value17 = normalizeClimateCapabilities(arg9);
  return arg10 === "water-heater"
    ? value17.operationModes.filter(
        (arg11) => !["off", "空"].includes(String(arg11).trim().toLowerCase()),
      )
    : value17.hvacModes;
}
export function reconcileClimateTargetTemperature(arg12, arg13, arg14, arg15 = 0.5) {
  const value18 = d(arg13),
    value19 = d(arg14);
  if (value18 === null)
    return {
      temperature: arg12,
      pending: arg14,
      confirmed: false,
    };
  if (value19 === null)
    return {
      temperature: value18,
      pending: null,
      confirmed: false,
    };
  const value20 = Math.max(0.001, Math.abs(d(arg15, 0.5)) / 2);
  return Math.abs(value18 - value19) <= value20
    ? {
        temperature: value18,
        pending: null,
        confirmed: true,
      }
    : {
        temperature: arg12,
        pending: arg14,
        confirmed: false,
      };
}
export function climateControlStructureKey(arg16, arg17, arg18 = "air-conditioner") {
  const value21 = normalizeClimateCapabilities(arg17),
    value22 = String(arg16 || "").split(".", 1)[0],
    value23 = ["climate", "water_heater"].includes(value22) && value21.supportsTargetTemperature;
  return JSON.stringify({
    temperature: value23
      ? [value21.minimumTemperature, value21.maximumTemperature, value21.temperatureStep]
      : null,
    modes: climateOperationModeValues(arg17, arg18),
    fanModes: value22 === "climate" ? value21.fanModes : [],
    fanPercentageStep:
      value22 === "fan" && value21.supportsFanPercentage ? value21.fanPercentageStep : null,
    swingModes: value21.swingModes,
    horizontalSwingModes: value21.horizontalSwingModes,
    presetModes: value21.presetModes,
  });
}
export function resolveClimateDeviceType(arg19, arg20, arg21 = "") {
  const value24 = configuredClimateDeviceType(arg19);
  if (value24 !== "auto") return value24;
  const value25 = normalizeClimateCapabilities(arg20),
    value26 = [arg19?.properties?.label, arg20?.attributes?.friendly_name, arg21]
      .map((arg22) => String(arg22 || "").toLowerCase())
      .join(" ");
  if (/(浴霸|风暖|暖风|浴室取暖|bath.?heater)/i.test(value26)) return "bath-heater";
  const value27 = value25.hvacModes.map(normalizeClimateModeKey),
    value28 = value25.presetModes.map(normalizeClimateModeKey);
  if (
    [...value27, ...value28].some((arg23) =>
      [
        "vent",
        "ventilate",
        "ventilation",
        "exhaust",
        "air_exchange",
        "defog",
        "quick_heat",
        "quick_defog",
        "drying",
        "取暖",
        "吹风",
        "换气",
        "除雾",
        "干燥",
      ].includes(arg23),
    )
  )
    return "bath-heater";
  if (value27.some((arg24) => ["cool", "heat_cool"].includes(arg24))) return "air-conditioner";
  const value29 = value27.filter((arg25) => arg25 !== "off");
  return value29.length === 1 && value29[0] === "heat" ? "bath-heater" : "air-conditioner";
}
const M = {
    off: "关闭",
    cool: "制冷",
    heat: "制热",
    dry: "除湿",
    fan_only: "送风",
    fan: "送风",
    auto: "自动",
    heat_cool: "冷暖自动",
    unavailable: "不可用",
    unknown: "未知",
    idle: "待机",
    none: "无",
    eco: "节能",
    boost: "强劲",
    performance: "强劲",
    silent: "静音",
    sleep: "睡眠",
    comfort: "舒适",
    away: "离家",
    mold_prev: "防霉",
    eco_and_mold_prev: "节能＋防霉",
    eco_mold_prev: "节能＋防霉",
  },
  v = {
    off: "关闭",
    heat: "取暖",
    heating: "取暖",
    fan_only: "吹风",
    fan: "吹风",
    ventilation: "换气",
    ventilate: "换气",
    vent: "换气",
    exhaust: "换气",
    air_exchange: "换气",
    defog: "除雾",
    defogging: "除雾",
    demist: "除雾",
    anti_fog: "除雾",
    quick_heat: "快速取暖",
    rapid_heat: "快速取暖",
    fast_heat: "快速取暖",
    quick_defog: "快速除雾",
    rapid_defog: "快速除雾",
    fast_defog: "快速除雾",
    dry: "干燥",
    drying: "干燥",
    auto: "自动",
    unavailable: "不可用",
    unknown: "未知",
    idle: "待机",
    standby: "待机",
    none: "无",
    eco: "节能",
    boost: "强劲",
    performance: "强劲",
    silent: "静音",
    sleep: "睡眠",
    mold_prev: "防霉",
    eco_and_mold_prev: "节能＋防霉",
    eco_mold_prev: "节能＋防霉",
    "制热": "取暖",
    "暖风": "取暖",
    "取暖": "取暖",
    "吹风": "吹风",
    "换气": "换气",
    "除雾": "除雾",
    "干燥": "干燥",
    "待机": "待机",
  },
  x = {
    off: "关闭",
    normal: "普通",
    standard: "普通",
    eco: "节能",
    adaptive: "自适温",
    auto: "自适温",
    heat_pump: "热泵",
    electric: "电加热",
    gas: "燃气",
    performance: "强力",
    vacation: "假期",
    "普通": "普通",
    "自适温": "自适温",
    "节能": "节能",
    "加热": "加热",
    "保温": "保温",
  },
  L = {
    off: "关闭",
    auto: "自动",
    default: "默认",
    full_swing: "全范围摆动",
    vertical: "上下摆动",
    horizontal: "左右摆动",
    both: "上下左右",
    fixed_upper: "固定上方",
    fixed_upper_middle: "固定中上",
    fixed_middle: "固定中间",
    fixed_lower_middle: "固定中下",
    fixed_lower: "固定下方",
    swing_upper: "上方摆动",
    swing_upper_middle: "中上摆动",
    swing_middle: "中间摆动",
    swing_lower_middle: "中下摆动",
    swing_lower: "下方摆动",
  },
  y = {
    off: "关闭",
    auto: "自动",
    default: "默认",
    full_swing: "全范围摆动",
    left: "固定左侧",
    left_center: "固定中左",
    center: "固定居中",
    right_center: "固定中右",
    right: "固定右侧",
  },
  w = {
    horizontal_leftmost: "固定最左",
    horizontal_middle_left: "固定左中",
    horizontal_middle_right: "固定右中",
    horizontal_rightmost: "固定最右",
  };
export function normalizeClimateModeKey(arg26) {
  return String(arg26 || "")
    .normalize("NFKC")
    .trim()
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/[+&]/g, "_and_")
    .toLowerCase()
    .replace(/[\s./-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}
function C(arg27, arg28) {
  return Array.from(String(arg27 || "")).reduce(
    (arg29, arg30) =>
      /\s/u.test(arg30)
        ? arg29 + arg28 * 0.35
        : /[\x00-\x7f]/u.test(arg30)
          ? /[ilI1.,:;'|!]/u.test(arg30)
            ? arg29 + arg28 * 0.32
            : /[mwMW@#%&]/u.test(arg30)
              ? arg29 + arg28 * 0.82
              : arg29 + arg28 * 0.58
          : arg29 + arg28,
    0,
  );
}
export function climateOptionPresentation(
  arg31,
  arg32 = {},
  {
    availableWidth: arg33 = 380,
    buttonGap: arg34 = 5,
    minimumButtonWidth: arg35 = 36,
    horizontalPadding: arg36 = 8,
    iconWidth: arg37 = 20,
    inlineIcon: arg38 = false,
    inlineIconGap: arg39 = 4,
    fontSize: arg40 = 11,
  } = {},
) {
  const value30 = h(arg31);
  return value30.length &&
    value30
      .map((arg41) => String(arg32?.[arg41] || arg41).trim())
      .reduce(
        (arg42, arg43) => {
          const value31 = C(arg43, arg40),
            value32 = arg38 ? arg37 + arg39 + value31 : Math.max(arg37, value31);
          return arg42 + Math.max(arg35, value32 + arg36);
        },
        Math.max(0, value30.length - 1) * arg34,
      ) > arg33
    ? "select"
    : "buttons";
}
export function climateModeTranslation(
  arg44,
  {
    entityId: arg45 = "",
    entityMetadata: arg46 = null,
    entityTranslations: arg47 = null,
    attributes: arg48 = null,
  } = {},
) {
  if (!arg47 || typeof arg47 != "object") return "";
  const value33 = arg46?.get?.(arg45) || {},
    value34 = String(value33.platform || "").trim(),
    value35 = String(value33.domain || String(arg45).split(".")[0] || "").trim(),
    value36 = String(value33.translationKey || "").trim(),
    value37 = normalizeClimateModeKey(arg44);
  if (!value34 || !value35 || !value36 || !value37) return "";
  const value38 = "component." + value34 + ".entity." + value35 + "." + value36,
    value39 =
      Array.isArray(arg48) && arg48.length
        ? arg48
        : ["preset_mode", "hvac_mode", "operation_mode", "fan_mode"],
    value40 = String(arg44 || "").trim(),
    list1 = [...new Set([value40, value40.toLowerCase(), value37].filter(Boolean))],
    value41 = value39.flatMap((arg49) =>
      list1.flatMap((arg50) => [
        value38 + ".state_attributes." + arg49 + ".state." + arg50,
        value38 + ".state_attributes." + arg49 + ".options." + arg50,
        value38 + ".state_attributes." + arg49 + "." + arg50,
      ]),
    );
  for (const value42 of value41) {
    const value43 = String(arg47[value42] || "").trim();
    if (value43) return value43;
  }
  return "";
}
export function climateModeLabel(arg51, arg52 = "air-conditioner", arg53 = {}) {
  const value44 = String(arg51 || "").trim();
  if (!value44) return "—";
  const value45 = normalizeClimateModeKey(value44),
    value46 = arg52 === "bath-heater" ? v : arg52 === "water-heater" ? x : M,
    value47 = climateModeTranslation(value44, arg53);
  return value47 && /[^\x00-\x7f]/u.test(value47)
    ? value47
    : value46[value45] || value47 || value44;
}
export function climateSwingModeLabel(arg54, arg55 = "vertical", arg56 = {}) {
  const value48 = String(arg54 || "").trim();
  if (!value48) return "—";
  const value49 = normalizeClimateModeKey(value48),
    value50 = arg55 === "horizontal" ? y : L;
  if (value50[value49]) return value50[value49];
  if (arg55 === "vertical") {
    const value51 = value49.match(
      /^(horizontal_(?:leftmost|middle_left|middle_right|rightmost))(?:_and_)?vertical_swing$/,
    );
    if (value51) {
      const value52 = w[value51[1]];
      if (value52) return value52 + "＋上下摆动";
    }
    if (w[value49]) return w[value49];
  }
  return (
    climateModeTranslation(value48, {
      ...arg56,
      attributes: [arg55 === "horizontal" ? "swing_horizontal_mode" : "swing_mode"],
    }) || value48
  );
}
export function bathHeaterModeUsesAirflow(arg57) {
  const value53 = normalizeClimateModeKey(arg57);
  return value53
    ? !["off", "idle", "standby", "unknown", "unavailable", "待机", "关闭"].includes(value53)
    : false;
}
export function climatePresentationMode(arg58, arg59 = "air-conditioner") {
  const value54 = String(arg58?.state || "off").trim();
  if (arg59 === "water-heater")
    return ["off", "unknown", "unavailable"].includes(value54.toLowerCase())
      ? value54
      : String(arg58?.attributes?.operation_mode || value54).trim();
  if (arg59 !== "bath-heater" || ["unknown", "unavailable"].includes(value54.toLowerCase()))
    return value54;
  if (value54.toLowerCase() === "off") {
    const value55 = String(arg58?.attributes?.preset_mode || arg58?.attributes?.mode || "").trim();
    return bathHeaterModeUsesAirflow(value55) ? value55 : "off";
  }
  return String(
    arg58?.attributes?.preset_mode ||
      arg58?.attributes?.mode ||
      arg58?.attributes?.fan_mode ||
      value54,
  ).trim();
}
export function climateIsPoweredOn(arg60, arg61 = "air-conditioner") {
  const value56 = String(arg60?.state || "off")
    .trim()
    .toLowerCase();
  if (arg61 === "bath-heater") {
    if (!value56 || ["unknown", "unavailable"].includes(value56)) return false;
    const value57 = normalizeClimateModeKey(climatePresentationMode(arg60, arg61));
    return ["off", "idle", "standby", "待机", "关闭"].includes(value57)
      ? false
      : value56 === "off"
        ? bathHeaterModeUsesAirflow(value57)
        : true;
  }
  return !["off", "unknown", "unavailable"].includes(value56);
}
export function climateIsRunning(arg62, arg63 = "air-conditioner") {
  if (!climateIsPoweredOn(arg62, arg63)) return false;
  if (arg63 === "water-heater") {
    const value59 = d(arg62?.attributes?.current_temperature),
      value60 = d(arg62?.attributes?.temperature);
    return value59 !== null && value60 !== null ? value59 < value60 - 0.4 : true;
  }
  if (arg63 === "bath-heater")
    return bathHeaterModeUsesAirflow(climatePresentationMode(arg62, arg63));
  const value58 = String(arg62?.attributes?.hvac_action || "")
    .trim()
    .toLowerCase();
  return !["idle", "off"].includes(value58);
}
export function climateEffectMode(arg64, arg65 = "air-conditioner") {
  if (!climateIsPoweredOn(arg64, arg65)) return "off";
  if (arg65 === "water-heater") return "heat";
  const value61 = normalizeClimateModeKey(climatePresentationMode(arg64, arg65)),
    value62 = String(arg64?.attributes?.hvac_action || "")
      .trim()
      .toLowerCase();
  return arg65 === "bath-heater"
    ? ["fan", "fan_only", "吹风"].includes(value61)
      ? "cool"
      : [
            "heat",
            "heating",
            "quick_heat",
            "rapid_heat",
            "fast_heat",
            "quick_defog",
            "rapid_defog",
            "fast_defog",
            "取暖",
            "暖风",
            "制热",
          ].includes(value61)
        ? "heat"
        : "other"
    : ["cooling", "cool"].includes(value62) || value61 === "cool"
      ? "cool"
      : ["heating", "heat"].includes(value62) || ["heat", "heating"].includes(value61)
        ? "heat"
        : "other";
}
export function climateModeIcon(arg66, arg67 = "air-conditioner") {
  const value63 = normalizeClimateModeKey(arg66);
  return arg67 === "water-heater"
    ? {
        normal: "♨",
        standard: "♨",
        eco: "♢",
        adaptive: "A",
        auto: "A",
        heat_pump: "↻",
        electric: "↯",
        gas: "◈",
        performance: "↯",
        vacation: "⌂",
        "普通": "♨",
        "自适温": "A",
        "节能": "♢",
        "加热": "♨",
        "保温": "○",
      }[value63] || "•"
    : arg67 === "bath-heater"
      ? {
          heat: "♨",
          heating: "♨",
          quick_heat: "♨",
          rapid_heat: "♨",
          fast_heat: "♨",
          fan_only: "✾",
          fan: "✾",
          ventilation: "↥",
          ventilate: "↥",
          vent: "↥",
          exhaust: "↥",
          air_exchange: "↥",
          defog: "◈",
          defogging: "◈",
          demist: "◈",
          anti_fog: "◈",
          quick_defog: "♨",
          rapid_defog: "♨",
          fast_defog: "♨",
          dry: "◇",
          drying: "◇",
          auto: "A",
          idle: "○",
          standby: "○",
          "制热": "♨",
          "暖风": "♨",
          "取暖": "♨",
          "吹风": "✾",
          "换气": "↥",
          "除雾": "◈",
          "干燥": "◇",
          "待机": "○",
        }[value63] || "•"
      : {
          cool: "❄",
          heat: "☀",
          dry: "◊",
          fan_only: "✾",
          fan: "✾",
          auto: "A",
          heat_cool: "◐",
          none: "○",
          comfort: "♧",
          eco: "♢",
          boost: "↯",
          sleep: "☾",
          away: "⌂",
          mold_prev: "◌",
          eco_and_mold_prev: "♢",
          eco_mold_prev: "♢",
        }[value63] || "•";
}
export function climateDeviceLabel(arg68) {
  return arg68 === "bath-heater" ? "浴霸" : arg68 === "water-heater" ? "热水器" : "空调";
}
export function climateDialogTitle(arg69, arg70 = "", arg71 = "air-conditioner") {
  const value64 = String(arg69 || "").trim(),
    value65 = String(arg70 || "").trim() || climateDeviceLabel(arg71);
  return value64 ? (arg71 === "bath-heater" && value64 === "空调" ? value65 : value64) : value65;
}
export function climatePowerCommand(arg72, arg73, arg74, arg75 = "air-conditioner", arg76 = "") {
  const value66 = String(arg72 || "").split(".", 1)[0];
  if (value66 === "water_heater")
    return {
      domain: "water_heater",
      service: arg74 ? "turn_on" : "turn_off",
      data: {},
    };
  if (value66 === "fan")
    return {
      domain: "fan",
      service: arg74 ? "turn_on" : "turn_off",
      data: {},
    };
  if (value66 !== "climate")
    return {
      domain: "homeassistant",
      service: "toggle",
      data: {},
    };
  const value67 = normalizeClimateCapabilities(arg73);
  if (!arg74)
    return value67.hvacModes.includes("off")
      ? {
          domain: "climate",
          service: "set_hvac_mode",
          data: {
            hvac_mode: "off",
          },
        }
      : {
          domain: "homeassistant",
          service: "toggle",
          data: {},
        };
  const value68 = value67.hvacModes.filter((arg77) => arg77 !== "off"),
    value69 =
      arg75 === "bath-heater"
        ? ["heat", "auto", "fan_only", "ventilation", "dry", "idle"]
        : ["auto", "cool", "heat_cool", "heat", "fan_only", "dry", "idle"],
    value70 = value68.includes(arg76)
      ? arg76
      : value69.find((arg78) => value68.includes(arg78)) || value68[0];
  return value70
    ? {
        domain: "climate",
        service: "set_hvac_mode",
        data: {
          hvac_mode: value70,
        },
      }
    : {
        domain: "homeassistant",
        service: "toggle",
        data: {},
      };
}
export function climateDefaultIcon(arg79) {
  return arg79 === "bath-heater"
    ? "mdi:radiator"
    : arg79 === "water-heater"
      ? "mdi:water-boiler"
      : "mdi:air-conditioner";
}
export function waterHeaterStatusLabel(arg80) {
  const value71 = String(arg80?.state || "")
    .trim()
    .toLowerCase();
  return value71 === "unavailable"
    ? "当前不可用"
    : !value71 || value71 === "unknown"
      ? "状态未知"
      : value71 === "off"
        ? "已关闭"
        : climateIsRunning(arg80, "water-heater")
          ? "正在加热"
          : "保温中";
}
