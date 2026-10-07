const climateDeviceTypesSet = new Set(["auto", "air-conditioner", "bath-heater"]);
function normalizeStringList(values: any) {
  return Array.isArray(values)
    ? [...new Set(values.map((entry) => String(entry ?? "").trim()).filter(Boolean))]
    : [];
}
function toNumberOrDefault(sourceValue: any, fallbackValue: any = null) {
  if (sourceValue == null || sourceValue === "") return fallbackValue;
  const parsedNumber = Number(sourceValue);
  return Number.isFinite(parsedNumber) ? parsedNumber : fallbackValue;
}
function configuredClimateDeviceType(component: any) {
  const configuredType = String(component?.properties?.deviceType || "auto");
  return climateDeviceTypesSet.has(configuredType) ? configuredType : "auto";
}
export function normalizeClimateCapabilities(sourceState: any) {
  const stateAttributes =
      sourceState?.attributes && typeof sourceState.attributes == "object"
        ? sourceState.attributes
        : {},
    hvacModes = normalizeStringList(stateAttributes.hvac_modes),
    fanModes = normalizeStringList(stateAttributes.fan_modes),
    swingModes = normalizeStringList(stateAttributes.swing_modes),
    horizontalSwingModes = normalizeStringList(stateAttributes.swing_horizontal_modes),
    presetModes = normalizeStringList(stateAttributes.preset_modes),
    operationModes = normalizeStringList(stateAttributes.operation_list),
    fanPercentage = toNumberOrDefault(stateAttributes.percentage),
    fanPercentageStep = Math.max(1, toNumberOrDefault(stateAttributes.percentage_step, 1)),
    targetTemperature = toNumberOrDefault(stateAttributes.temperature),
    currentTemperature = toNumberOrDefault(stateAttributes.current_temperature);
  let minimumTemperature = toNumberOrDefault(stateAttributes.min_temp, 16),
    maximumTemperature = toNumberOrDefault(stateAttributes.max_temp, 30);
  maximumTemperature <= minimumTemperature &&
    ((minimumTemperature = 16), (maximumTemperature = 30));
  const temperatureStep = Math.max(0.1, toNumberOrDefault(stateAttributes.target_temp_step, 0.5));
  return {
    attributes: stateAttributes,
    hvacModes: hvacModes,
    fanModes: fanModes,
    swingModes: swingModes,
    horizontalSwingModes: horizontalSwingModes,
    presetModes: presetModes,
    operationModes: operationModes,
    fanPercentage: fanPercentage,
    fanPercentageStep: fanPercentageStep,
    targetTemperature: targetTemperature,
    currentTemperature: currentTemperature,
    minimumTemperature: minimumTemperature,
    maximumTemperature: maximumTemperature,
    temperatureStep: temperatureStep,
    supportsTargetTemperature: targetTemperature !== null,
    hasModeControl:
      hvacModes.some((mode) => mode !== "off") ||
      operationModes.some((operationMode) => !["off", "空"].includes(operationMode.toLowerCase())),
    hasFanControl: fanModes.length > 0,
    hasSwingControl: swingModes.length > 0,
    hasHorizontalSwingControl: horizontalSwingModes.length > 0,
    hasPresetControl: presetModes.length > 0,
    supportsFanPercentage: fanPercentage !== null,
  };
}
export function climateOperationModeValues(stateEntity: any, deviceType = "air-conditioner") {
  const capabilities = normalizeClimateCapabilities(stateEntity);
  return deviceType === "water-heater"
    ? capabilities.operationModes.filter(
        (operationModeKey) =>
          !["off", "空"].includes(String(operationModeKey).trim().toLowerCase()),
      )
    : capabilities.hvacModes;
}
export function reconcileClimateTargetTemperature(
  componentTargetTemperature: any,
  confirmedTemperature: any,
  pendingTemperature: any,
  stepOverride = 0.5,
) {
  const confirmedValue = toNumberOrDefault(confirmedTemperature),
    pendingValue = toNumberOrDefault(pendingTemperature);
  if (confirmedValue === null)
    return {
      temperature: componentTargetTemperature,
      pending: pendingTemperature,
      confirmed: false,
    };
  if (pendingValue === null)
    return {
      temperature: confirmedValue,
      pending: null as any,
      confirmed: false,
    };
  const tolerance = Math.max(0.001, Math.abs(toNumberOrDefault(stepOverride, 0.5)) / 2);
  return Math.abs(confirmedValue - pendingValue) <= tolerance
    ? {
        temperature: confirmedValue,
        pending: null as any,
        confirmed: true,
      }
    : {
        temperature: componentTargetTemperature,
        pending: pendingTemperature,
        confirmed: false,
      };
}
export function climateControlStructureKey(
  entityId: any,
  structureState: any,
  deviceTypeHint = "air-conditioner",
) {
  const structureCapabilities = normalizeClimateCapabilities(structureState),
    entityDomainName = String(entityId || "").split(".", 1)[0],
    supportsTemperature =
      ["climate", "water_heater"].includes(entityDomainName) &&
      structureCapabilities.supportsTargetTemperature;
  return JSON.stringify({
    temperature: supportsTemperature
      ? [
          structureCapabilities.minimumTemperature,
          structureCapabilities.maximumTemperature,
          structureCapabilities.temperatureStep,
        ]
      : null,
    modes: climateOperationModeValues(structureState, deviceTypeHint),
    fanModes: entityDomainName === "climate" ? structureCapabilities.fanModes : [],
    fanPercentageStep:
      entityDomainName === "fan" && structureCapabilities.supportsFanPercentage
        ? structureCapabilities.fanPercentageStep
        : null,
    swingModes: structureCapabilities.swingModes,
    horizontalSwingModes: structureCapabilities.horizontalSwingModes,
    presetModes: structureCapabilities.presetModes,
  });
}
export function resolveClimateDeviceType(deviceComponent: any, deviceState: any, friendlyName = "") {
  const configuredDeviceType = configuredClimateDeviceType(deviceComponent);
  if (configuredDeviceType !== "auto") return configuredDeviceType;
  const resolvedCapabilities = normalizeClimateCapabilities(deviceState),
    nameSearchText = [
      deviceComponent?.properties?.label,
      deviceState?.attributes?.friendly_name,
      friendlyName,
    ]
      .map((namePart) => String(namePart || "").toLowerCase())
      .join(" ");
  if (/(浴霸|风暖|暖风|浴室取暖|bath.?heater)/i.test(nameSearchText)) return "bath-heater";
  const hvacModeKeys = resolvedCapabilities.hvacModes.map(normalizeClimateModeKey),
    presetModeKeys = resolvedCapabilities.presetModes.map(normalizeClimateModeKey);
  if (
    [...hvacModeKeys, ...presetModeKeys].some((bathHeaterModeKey) =>
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
      ].includes(bathHeaterModeKey),
    )
  )
    return "bath-heater";
  if (hvacModeKeys.some((coolModeKey) => ["cool", "heat_cool"].includes(coolModeKey)))
    return "air-conditioner";
  const activeHeatModes = hvacModeKeys.filter((heatModeKey) => heatModeKey !== "off");
  return activeHeatModes.length === 1 && activeHeatModes[0] === "heat"
    ? "bath-heater"
    : "air-conditioner";
}
const CLIMATE_MODE_LABELS = {
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
  BATH_HEATER_MODE_LABELS = {
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
  WATER_HEATER_MODE_LABELS = {
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
  VERTICAL_SWING_LABELS = {
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
  HORIZONTAL_SWING_LABELS = {
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
  HORIZONTAL_POSITION_LABELS = {
    horizontal_leftmost: "固定最左",
    horizontal_middle_left: "固定左中",
    horizontal_middle_right: "固定右中",
    horizontal_rightmost: "固定最右",
  };
function normalizeClimateModeKey(rawModeKey: any) {
  return String(rawModeKey || "")
    .normalize("NFKC")
    .trim()
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/[+&]/g, "_and_")
    .toLowerCase()
    .replace(/[\s./-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}
function measureTextWidth(text: any, fontSizePx: any) {
  return Array.from(String(text || "")).reduce(
    (accumulatedWidth, character) =>
      /\s/u.test(character)
        ? accumulatedWidth + fontSizePx * 0.35
        : /[\x00-\x7f]/u.test(character)
          ? /[ilI1.,:;'|!]/u.test(character)
            ? accumulatedWidth + fontSizePx * 0.32
            : /[mwMW@#%&]/u.test(character)
              ? accumulatedWidth + fontSizePx * 0.82
              : accumulatedWidth + fontSizePx * 0.58
          : accumulatedWidth + fontSizePx,
    0,
  );
}
export function climateOptionPresentation(
  modes: any,
  labelLookup: Record<string, any> = {},
  {
    availableWidth: availableWidth = 380,
    buttonGap: buttonGap = 5,
    minimumButtonWidth: minimumButtonWidth = 36,
    horizontalPadding: horizontalPadding = 8,
    iconWidth: iconWidth = 20,
    inlineIcon: inlineIcon = false,
    inlineIconGap: inlineIconGap = 4,
    fontSize: fontSize = 11,
  } = {},
) {
  const modeList = normalizeStringList(modes);
  return modeList.length &&
    modeList
      .map((modeLabelKey) => String((labelLookup as any)?.[modeLabelKey] || modeLabelKey).trim())
      .reduce(
        (totalWidth, label) => {
          const labelWidth = measureTextWidth(label, fontSize),
            buttonWidth = inlineIcon
              ? iconWidth + inlineIconGap + labelWidth
              : Math.max(iconWidth, labelWidth);
          return totalWidth + Math.max(minimumButtonWidth, buttonWidth + horizontalPadding);
        },
        Math.max(0, modeList.length - 1) * buttonGap,
      ) > availableWidth
    ? "select"
    : "buttons";
}
function climateModeTranslation(
  modeInput: any,
  {
    entityId: translationEntityId = "",
    entityMetadata: entityMetadata = null,
    entityTranslations: entityTranslations = null,
    attributes: attributeOverride = null,
  }: any = {},
) {
  if (!entityTranslations || typeof entityTranslations != "object") return "";
  const metadata = entityMetadata?.get?.(translationEntityId) || {},
    platform = String(metadata.platform || "").trim(),
    metadataDomain = String(
      metadata.domain || String(translationEntityId).split(".")[0] || "",
    ).trim(),
    translationKey = String(metadata.translationKey || "").trim(),
    modeKey = normalizeClimateModeKey(modeInput);
  if (!platform || !metadataDomain || !translationKey || !modeKey) return "";
  const translationPrefix =
      "component." + platform + ".entity." + metadataDomain + "." + translationKey,
    attributeNames =
      Array.isArray(attributeOverride) && attributeOverride.length
        ? attributeOverride
        : ["preset_mode", "hvac_mode", "operation_mode", "fan_mode"],
    trimmedMode = String(modeInput || "").trim(),
    modeCandidates = [
      ...new Set([trimmedMode, trimmedMode.toLowerCase(), modeKey].filter(Boolean)),
    ],
    translationKeyCandidates = attributeNames.flatMap((attributeName) =>
      modeCandidates.flatMap((candidate) => [
        translationPrefix + ".state_attributes." + attributeName + ".state." + candidate,
        translationPrefix + ".state_attributes." + attributeName + ".options." + candidate,
        translationPrefix + ".state_attributes." + attributeName + "." + candidate,
      ]),
    );
  for (const candidateTranslationKey of translationKeyCandidates) {
    const translation = String(entityTranslations[candidateTranslationKey] || "").trim();
    if (translation) return translation;
  }
  return "";
}
export function climateModeLabel(
  requestedMode: any,
  labelModeDeviceType = "air-conditioner",
  modeLabelOptions: Record<string, any> = {},
) {
  const rawMode = String(requestedMode || "").trim();
  if (!rawMode) return "—";
  const normalizedModeKey = normalizeClimateModeKey(rawMode),
    modeLabelTable =
      labelModeDeviceType === "bath-heater"
        ? BATH_HEATER_MODE_LABELS
        : labelModeDeviceType === "water-heater"
          ? WATER_HEATER_MODE_LABELS
          : CLIMATE_MODE_LABELS,
    candidateTranslation = climateModeTranslation(rawMode, modeLabelOptions);
  return candidateTranslation && /[^\x00-\x7f]/u.test(candidateTranslation)
    ? candidateTranslation
    : (modeLabelTable as any)[normalizedModeKey] || candidateTranslation || rawMode;
}
export function climateSwingModeLabel(
  swingModeInput: any,
  swingDirection = "vertical",
  swingLabelOptions: Record<string, any> = {},
) {
  const swingModeName = String(swingModeInput || "").trim();
  if (!swingModeName) return "—";
  const normalizedSwingKey = normalizeClimateModeKey(swingModeName),
    swingLabelTable =
      swingDirection === "horizontal" ? HORIZONTAL_SWING_LABELS : VERTICAL_SWING_LABELS;
  if ((swingLabelTable as any)[normalizedSwingKey]) return (swingLabelTable as any)[normalizedSwingKey];
  if (swingDirection === "vertical") {
    const positionMatch = normalizedSwingKey.match(
      /^(horizontal_(?:leftmost|middle_left|middle_right|rightmost))(?:_and_)?vertical_swing$/,
    );
    if (positionMatch) {
      const positionLabel = (HORIZONTAL_POSITION_LABELS as any)[positionMatch[1]];
      if (positionLabel) return positionLabel + "＋上下摆动";
    }
    if ((HORIZONTAL_POSITION_LABELS as any)[normalizedSwingKey])
      return (HORIZONTAL_POSITION_LABELS as any)[normalizedSwingKey];
  }
  return (
    climateModeTranslation(swingModeName, {
      ...swingLabelOptions,
      attributes: [swingDirection === "horizontal" ? "swing_horizontal_mode" : "swing_mode"],
    }) || swingModeName
  );
}
export function bathHeaterModeUsesAirflow(airflowModeInput: any) {
  const normalizedAirflowKey = normalizeClimateModeKey(airflowModeInput);
  return normalizedAirflowKey
    ? !["off", "idle", "standby", "unknown", "unavailable", "待机", "关闭"].includes(
        normalizedAirflowKey,
      )
    : false;
}
export function climatePresentationMode(
  presentationState: any,
  presentationDeviceType = "air-conditioner",
) {
  const rawStateName = String(presentationState?.state || "off").trim();
  if (presentationDeviceType === "water-heater")
    return ["off", "unknown", "unavailable"].includes(rawStateName.toLowerCase())
      ? rawStateName
      : String(presentationState?.attributes?.operation_mode || rawStateName).trim();
  if (
    presentationDeviceType !== "bath-heater" ||
    ["unknown", "unavailable"].includes(rawStateName.toLowerCase())
  )
    return rawStateName;
  if (rawStateName.toLowerCase() === "off") {
    const presetMode = String(
      presentationState?.attributes?.preset_mode || presentationState?.attributes?.mode || "",
    ).trim();
    return bathHeaterModeUsesAirflow(presetMode) ? presetMode : "off";
  }
  return String(
    presentationState?.attributes?.preset_mode ||
      presentationState?.attributes?.mode ||
      presentationState?.attributes?.fan_mode ||
      rawStateName,
  ).trim();
}
export function climateIsPoweredOn(powerState: any, powerDeviceType = "air-conditioner") {
  const lowercasedState = String(powerState?.state || "off")
    .trim()
    .toLowerCase();
  if (powerDeviceType === "bath-heater") {
    if (!lowercasedState || ["unknown", "unavailable"].includes(lowercasedState)) return false;
    const presentationMode = normalizeClimateModeKey(
      climatePresentationMode(powerState, powerDeviceType),
    );
    return ["off", "idle", "standby", "待机", "关闭"].includes(presentationMode)
      ? false
      : lowercasedState === "off"
        ? bathHeaterModeUsesAirflow(presentationMode)
        : true;
  }
  return !["off", "unknown", "unavailable"].includes(lowercasedState);
}
export function climateIsRunning(runState: any, runDeviceType = "air-conditioner") {
  if (!climateIsPoweredOn(runState, runDeviceType)) return false;
  if (runDeviceType === "water-heater") {
    const measuredTemperature = toNumberOrDefault(runState?.attributes?.current_temperature),
      targetTemperatureValue = toNumberOrDefault(runState?.attributes?.temperature);
    return measuredTemperature !== null && targetTemperatureValue !== null
      ? measuredTemperature < targetTemperatureValue - 0.4
      : true;
  }
  if (runDeviceType === "bath-heater")
    return bathHeaterModeUsesAirflow(climatePresentationMode(runState, runDeviceType));
  const hvacAction = String(runState?.attributes?.hvac_action || "")
    .trim()
    .toLowerCase();
  return !["idle", "off"].includes(hvacAction);
}
export function climateEffectMode(effectState: any, effectDeviceType = "air-conditioner") {
  if (!climateIsPoweredOn(effectState, effectDeviceType)) return "off";
  if (effectDeviceType === "water-heater") return "heat";
  const effectModeKey = normalizeClimateModeKey(
      climatePresentationMode(effectState, effectDeviceType),
    ),
    hvacActionName = String(effectState?.attributes?.hvac_action || "")
      .trim()
      .toLowerCase();
  return effectDeviceType === "bath-heater"
    ? ["fan", "fan_only", "吹风"].includes(effectModeKey)
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
          ].includes(effectModeKey)
        ? "heat"
        : "other"
    : ["cooling", "cool"].includes(hvacActionName) || effectModeKey === "cool"
      ? "cool"
      : ["heating", "heat"].includes(hvacActionName) || ["heat", "heating"].includes(effectModeKey)
        ? "heat"
        : "other";
}
export function climateModeIcon(iconModeInput: any, iconDeviceType = "air-conditioner") {
  const iconModeKey = normalizeClimateModeKey(iconModeInput);
  return iconDeviceType === "water-heater"
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
      }[iconModeKey] || "•"
    : iconDeviceType === "bath-heater"
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
        }[iconModeKey] || "•"
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
        }[iconModeKey] || "•";
}
export function climateDeviceLabel(deviceLabelType: any) {
  return deviceLabelType === "bath-heater"
    ? "浴霸"
    : deviceLabelType === "water-heater"
      ? "热水器"
      : "空调";
}

export function climatePowerCommand(
  commandEntityId: any,
  commandState: any,
  isTurningOn: any,
  commandDeviceType = "air-conditioner",
  preferredMode = "",
) {
  const commandDomain = String(commandEntityId || "").split(".", 1)[0];
  if (commandDomain === "water_heater")
    return {
      domain: "water_heater",
      service: isTurningOn ? "turn_on" : "turn_off",
      data: {} as Record<string, any>,
    };
  if (commandDomain === "fan")
    return {
      domain: "fan",
      service: isTurningOn ? "turn_on" : "turn_off",
      data: {} as Record<string, any>,
    };
  if (commandDomain !== "climate")
    return {
      domain: "homeassistant",
      service: "toggle",
      data: {} as Record<string, any>,
    };
  const powerCapabilities = normalizeClimateCapabilities(commandState);
  if (!isTurningOn)
    return powerCapabilities.hvacModes.includes("off")
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
          data: {} as Record<string, any>,
        };
  const availableModes = powerCapabilities.hvacModes.filter(
      (availableMode) => availableMode !== "off",
    ),
    preferredModes =
      commandDeviceType === "bath-heater"
        ? ["heat", "auto", "fan_only", "ventilation", "dry", "idle"]
        : ["auto", "cool", "heat_cool", "heat", "fan_only", "dry", "idle"],
    selectedMode = availableModes.includes(preferredMode)
      ? preferredMode
      : preferredModes.find((candidateMode) => availableModes.includes(candidateMode)) ||
        availableModes[0];
  return selectedMode
    ? {
        domain: "climate",
        service: "set_hvac_mode",
        data: {
          hvac_mode: selectedMode,
        },
      }
    : {
        domain: "homeassistant",
        service: "toggle",
        data: {} as Record<string, any>,
      };
}
export function climateDefaultIcon(defaultIconDeviceType: any) {
  return defaultIconDeviceType === "bath-heater"
    ? "mdi:radiator"
    : defaultIconDeviceType === "water-heater"
      ? "mdi:water-boiler"
      : "mdi:air-conditioner";
}
export function waterHeaterStatusLabel(waterHeaterState: any) {
  const rawState = String(waterHeaterState?.state || "")
    .trim()
    .toLowerCase();
  return rawState === "unavailable"
    ? "当前不可用"
    : !rawState || rawState === "unknown"
      ? "状态未知"
      : rawState === "off"
        ? "已关闭"
        : climateIsRunning(waterHeaterState, "water-heater")
          ? "正在加热"
          : "保温中";
}
