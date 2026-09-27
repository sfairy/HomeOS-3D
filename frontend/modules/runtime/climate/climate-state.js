/**
 * 空调（climate）实体的状态归一化与控制命令构造。
 */

import {
  finiteNumberOrNull,
  normalizedTextOf,
  resolveStateEntry
} from "../core/static-helpers.js?v=2609271411";
// 动态导入渲染器模块：开发环境走相对路径（file:），生产环境走带缓存戳的静态路径。
const climateRendererModule = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/renderer/controls/climate.js", import.meta.url))
  : import("/static/renderer/controls/climate.js?v=2609271411"));
const {
  normalizeClimateCapabilities: normalizeClimateCapabilities,
  climateIsPoweredOn: climateIsPoweredOn,
  climateIsRunning: climateIsRunning,
  climatePowerCommand: climatePowerCommand
} = climateRendererModule;
export const {
  climateModeLabel,
  climateSwingModeLabel
} = climateRendererModule;
// 温度 / 能力位等属性一律转成「有限数或 null」，实现与理由统一在 utils/numbers.js 的
/**
 * 档位名表：键是档数，值是从最低档到最高档的名字。
 */
const PURIFIER_SPEED_LEVEL_LABELS = {
  3: ["低档", "中档", "高档"],
  7: ["自动", "微风", "超低", "低风", "中风", "高风", "超高"]
};
export function purifierSpeedLevels(percentageStep) {
  const step = finiteNumberOrNull(percentageStep);
  if (step === null || step <= 0 || step > 100) {
    return [];
  }
  const levelCount = Math.round(100 / step);
  if (levelCount < 1 || levelCount > 10 || Math.abs(step - 100 / levelCount) > 0.02) {
    return [];
  }
  const levelLabels = PURIFIER_SPEED_LEVEL_LABELS[levelCount];
  return Array.from({ length: levelCount }, (levelUnused, levelIndex) => ({
    label: levelLabels ? levelLabels[levelIndex] : levelIndex + 1 + " 档",
    percentage: Math.floor((100 * (levelIndex + 1)) / levelCount)
  }));
}

/**
 * 把 HA 的空调实体状态归一化成 3D 面板使用的状态对象。
 */
export function climateState(entityId, receivedState) {
  const stateObject = resolveStateEntry(receivedState, {});
  const attributes = stateObject.attributes || {};
  const capabilities = normalizeClimateCapabilities(stateObject);
  // state 只认字符串：数字等异常值一律当空串，后面按不可用处理。
  const stateValue = typeof stateObject.state == "string" ? stateObject.state : "";
  const minimum = finiteNumberOrNull(attributes.min_temp);
  const maximum = finiteNumberOrNull(attributes.max_temp);
  const temperature = finiteNumberOrNull(attributes.temperature);
  const supportedFeatures = finiteNumberOrNull(attributes.supported_features) || 0;
  // supported_features 的位含义随实体域而变：climate 的 bit 0 是「支持目标温度」，
  const isFanDomain = /^fan\.[a-z0-9_]+$/.test(entityId);
  // 与后端同一个口径：属性**是否存在**决定走不走能力位。只看「能不能解析成数字」会把
  const hasSupportedFeaturesAttribute = Object.prototype.hasOwnProperty.call(
    attributes,
    "supported_features"
  );
  // 净化器的能力位比 climate 严一档，口径直接抄 purifier.py：
  const rawPurifierFeatures = attributes.supported_features;
  const purifierFeatures = Number.isInteger(rawPurifierFeatures)
    ? rawPurifierFeatures
    : rawPurifierFeatures === true
      ? 1
      : 0;
  const percentage = finiteNumberOrNull(attributes.percentage);
  const parsedPercentageStep = finiteNumberOrNull(attributes.percentage_step);
  const targetLow = finiteNumberOrNull(attributes.target_temp_low);
  const targetHigh = finiteNumberOrNull(attributes.target_temp_high);
  const percentageStep = parsedPercentageStep !== null && parsedPercentageStep > 0 ? parsedPercentageStep : 1;
  const percentageSupported =
    isFanDomain &&
    (hasSupportedFeaturesAttribute ? !!(purifierFeatures & 1) : percentage !== null);
  // 三重判定：实体 ID 必须是 climate（空调）或 fan（空气净化器）域、HA 未标记不可用、
  const available =
    /^(?:climate|fan)\.[a-z0-9_]+$/.test(entityId) &&
    stateObject.available !== false &&
    !!stateValue &&
    !["unknown", "unavailable"].includes(stateValue);
  // 返回结构就是 3D 面板的内部契约；temperatureSupported / rangeSupported 由
  return {
    entityId: entityId,
    raw: stateObject,
    available: available,
    on: available && climateIsPoweredOn(stateObject, "air-conditioner"),
    running:
      available &&
      // hvac_action 是「正在制冷 / 制热 / 待机」的细粒度动作；未知态不算运行。
      !["unknown", "unavailable"].includes(normalizedTextOf(attributes.hvac_action || "")) &&
      climateIsRunning(stateObject, "air-conditioner"),
    name: String(attributes.friendly_name || entityId || "空调"),
    mode: stateValue,
    // visualMode 是给样式用的模式桶：关机 / 制冷 / 制热 / 净化 / 其它。
    visualMode:
      !available || !climateIsPoweredOn(stateObject, "air-conditioner")
        ? "off"
        : isFanDomain
          ? "purify"
          : stateValue === "cool"
            ? "cool"
            : stateValue === "heat"
              ? "heat"
              : "other",
    temperature: temperature,
    currentTemperature: finiteNumberOrNull(attributes.current_temperature),
    targetLow: targetLow,
    targetHigh: targetHigh,
    minimum: minimum,
    maximum: maximum,
    step: capabilities.temperatureStep,
    // supported_features 第 0 位（值 1）表示 HA 支持目标温度；
    temperatureSupported:
      !isFanDomain &&
      minimum !== null &&
      maximum !== null &&
      maximum > minimum &&
      (temperature !== null || !!(supportedFeatures & 1)),
    // 第 1 位（值 2）表示支持温度区间（target_temp_low/high）；
    rangeSupported:
      !isFanDomain && (!!(supportedFeatures & 2) || targetLow !== null || targetHigh !== null),
    modes: capabilities.hvacModes,
    fanModes: capabilities.fanModes,
    turnOnSupported: isFanDomain || !!(supportedFeatures & 256),
    swingModes: capabilities.swingModes,
    horizontalSwingModes: capabilities.horizontalSwingModes,
    presetModes: capabilities.presetModes,
    fanMode: attributes.fan_mode || "",
    swingMode: attributes.swing_mode || "",
    horizontalSwingMode: attributes.swing_horizontal_mode || "",
    presetMode: attributes.preset_mode || "",
    // ===== 空气净化器（HA 的 fan 域）专属状态位 =====
    purifier: isFanDomain,
    oscillating: isFanDomain && attributes.oscillating === true,
    oscillatingSupported: isFanDomain && !!(purifierFeatures & 2),
    // 风向前后吹：bit 2（值 4，DIRECTION），取值只有 forward / reverse。
    direction:
      isFanDomain && ["forward", "reverse"].includes(attributes.direction)
        ? attributes.direction
        : "",
    directionSupported: isFanDomain && !!(purifierFeatures & 4),
    percentage: percentage,
    percentageStep: percentageStep,
    percentageSupported: percentageSupported,
    speedLevels: percentageSupported ? purifierSpeedLevels(parsedPercentageStep) : [],
    presetModeSupported:
      isFanDomain &&
      (!hasSupportedFeaturesAttribute || !!(purifierFeatures & 8)) &&
      capabilities.presetModes.length > 0
  };
}
/**
 * 构造空调开关命令。
 */
export function climatePowerControl(state, desiredOn = !state.on, lastMode = "") {
  if (!state.available) {
    throw new Error("设备当前不可用。");
  }
  // 净化器是 fan 域实体，开关必须发 fan.turn_on / fan.turn_off，且不带参数。
  if (state.purifier) {
    return {
      entityId: state.entityId,
      domain: "fan",
      service: desiredOn ? "turn_on" : "turn_off",
      data: {}
    };
  }
  if (desiredOn) {
    const restoreMode = lastMode || (state.on ? state.mode : "");
    if (restoreMode && restoreMode !== "off" && state.modes.includes(restoreMode)) {
      return {
        entityId: state.entityId,
        domain: "climate",
        service: "set_hvac_mode",
        data: {
          hvac_mode: restoreMode
        }
      };
    }
    // 没有可恢复的模式时，若实体声明支持 turn_on 就用它 —— turn_on 会由设备
    if (state.turnOnSupported) {
      return {
        entityId: state.entityId,
        domain: "climate",
        service: "turn_on",
        data: {}
      };
    }
  }
  const command = climatePowerCommand(
    state.entityId,
    state.raw,
    desiredOn,
    "air-conditioner",
    lastMode
  );
  if (command.domain !== "climate" || command.service !== "set_hvac_mode") {
    throw new Error("设备尚未提供可用的开关模式。");
  }
  return {
    entityId: state.entityId,
    domain: "climate",
    service: command.service,
    data: command.data
  };
}
/**
 * 创建「空调上次使用模式」的记录器（关机后再开机时恢复用）。
 */
export function createClimateModeHistory({ storage, scope = "" } = {}) {
  const modesByEntityId = new Map();
  // storage 一旦抛异常就永久关掉：隐私模式下每次访问都会抛，反复重试只会拖慢渲染。
  let isStorageUsable = true;
  // 只有形如 cool / heat / dry 这样的模式名才值得记；off 与未知态不是「上次模式」。
  const isUsableMode = mode =>
    typeof mode == "string" &&
    /^[a-z_]+$/.test(mode) &&
    !["off", "unknown", "unavailable"].includes(mode);
  const storageKeyFor = entityId =>
    scope && /^climate\.[a-z0-9_]+$/.test(entityId)
      ? "hb-i3d:climate-mode:v1:" + scope + ":" + entityId
      : "";
  /** 取某台空调上次使用的模式；没有记录时返回空串。 */
  function get(entityId) {
    const key = storageKeyFor(entityId);
    try {
      const storedMode = isStorageUsable && key && storage?.getItem(key);
      if (isUsableMode(storedMode)) {
        modesByEntityId.set(entityId, storedMode);
        return storedMode;
      }
    } catch {
      isStorageUsable = false;
    }
    return modesByEntityId.get(entityId) || "";
  }
  /** 观察一份实体状态，把它更新进记录。 */
  function observe(entityId, receivedState) {
    const observedState = climateState(entityId, receivedState);
    // 只记「可用 + 开机 + 模式合法」的时刻：关机态与未知态都会污染记录，
    if (
      observedState.available &&
      observedState.on &&
      isUsableMode(observedState.mode) &&
      observedState.modes.includes(observedState.mode) &&
      get(entityId) !== observedState.mode
    ) {
      modesByEntityId.set(entityId, observedState.mode);
      try {
        const key = storageKeyFor(entityId);
        if (isStorageUsable && key) {
          storage?.setItem(key, observedState.mode);
        }
      } catch {
        isStorageUsable = false;
      }
    }
  }
  return {
    get: get,
    observe: observe
  };
}
/**
 * 构造空调的单项控制命令（设定温度 / 模式 / 风速 / 摆风）。
 */
export function climateControl(deviceState, service, value) {
  if (!deviceState.available) {
    throw new Error("设备当前不可用。");
  }
  let serviceData;
  if (service === "set_temperature") {
    const requestedTemperature = finiteNumberOrNull(value);
    if (!deviceState.temperatureSupported || requestedTemperature === null) {
      throw new Error("设备尚未提供可用的温度控制。");
    }
    // 小数位数取「步长」与「下限」中小数位更多的一方，最多 8 位；
    const fractionDigits = Math.min(
      8,
      Math.max(
        String(deviceState.step).split(".")[1]?.length || 0,
        String(deviceState.minimum).split(".")[1]?.length || 0
      )
    );
    // 先把请求温度夹到 [min, max]，再对齐到「下限 + 步长整数倍」的格点；
    const normalizedTemperature = Number(
      (
        deviceState.minimum +
        Math.round(
          (Math.max(deviceState.minimum, Math.min(deviceState.maximum, requestedTemperature)) -
            deviceState.minimum) /
            deviceState.step
        ) *
          deviceState.step
      ).toFixed(fractionDigits)
    );
    if (
      normalizedTemperature < deviceState.minimum ||
      normalizedTemperature > deviceState.maximum
    ) {
      throw new Error("设定温度超出设备范围。");
    }
    serviceData = {
      temperature: normalizedTemperature
    };
  } else {
    // 服务名 → [状态对象里的可选列表字段, 发给 HA 的属性名]。
    const serviceSpec = {
      set_hvac_mode: ["modes", "hvac_mode"],
      set_fan_mode: ["fanModes", "fan_mode"],
      set_swing_mode: ["swingModes", "swing_mode"]
    }[service];
    if (!serviceSpec || !deviceState[serviceSpec[0]].includes(value)) {
      throw new Error("设备不支持此控制选项。");
    }
    serviceData = {
      [serviceSpec[1]]: value
    };
  }
  return {
    entityId: deviceState.entityId,
    domain: "climate",
    service: service,
    data: serviceData
  };
}
/**
 * 构造空气净化器（HA 的 fan 域）的单项控制命令。
 */
export function purifierControl(deviceState, service, value) {
  if (!deviceState.available) {
    throw new Error("空气净化器当前不可用。");
  }
  let serviceData = {};
  if (service === "turn_on" || service === "turn_off") {
    // 开关机不带参数：后端对 fan 的这两条不设能力位门槛。
  } else if (service === "oscillate") {
    // 摆动：bit 1（值 2，FanEntityFeature.OSCILLATE），参数必须是布尔。
    if (!deviceState.oscillatingSupported || typeof value !== "boolean") {
      throw new Error("空气净化器不支持此操作或参数。");
    }
    serviceData = {
      oscillating: value
    };
  } else if (service === "set_direction") {
    // 前后吹风：bit 2（值 4，DIRECTION），取值只有 forward / reverse 两种。
    if (!deviceState.directionSupported || !["forward", "reverse"].includes(value)) {
      throw new Error("空气净化器不支持此操作或参数。");
    }
    serviceData = {
      direction: value
    };
  } else if (service === "set_percentage") {
    // 风速百分比：bit 0（值 1，SET_SPEED）。后端只要求 0~100 的有限实数，不比步长，
    const requestedPercentage = finiteNumberOrNull(value);
    if (
      !deviceState.percentageSupported ||
      requestedPercentage === null ||
      requestedPercentage < 0 ||
      requestedPercentage > 100
    ) {
      throw new Error("空气净化器不支持此操作或参数。");
    }
    serviceData = {
      percentage: requestedPercentage
    };
  } else if (service === "set_preset_mode") {
    // 预设模式：bit 3（值 8，PRESET_MODE）。候选表来自设备上报的 preset_modes，
    if (!deviceState.presetModeSupported || !deviceState.presetModes.includes(value)) {
      throw new Error("空气净化器不支持此操作或参数。");
    }
    serviceData = {
      preset_mode: value
    };
  } else {
    throw new Error("空气净化器不支持此操作或参数。");
  }
  return {
    entityId: deviceState.entityId,
    domain: "fan",
    service: service,
    data: serviceData
  };
}
