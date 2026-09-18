/**
 * 空调（climate）实体的状态归一化与控制命令构造。
 *
 * 在 3D 子系统里的位置：3D 场景只认识「渲染器」这套结构，本模块负责把 HA 的
 * climate 实体（或 state_changed 事件）翻译成渲染器能直接消费的形状，并把
 * 面板上的操作（开关、调温、改模式）翻译成下面要发给 HA 的服务调用。
 *
 * 对外提供：climateState、climatePowerControl、createClimateModeHistory、
 * climateControl，以及从渲染器转出的标签 / 图标工具（climateModeLabel 等）。
 *
 * 与渲染器的约定：能力解析（支持哪些模式、温度步长）与文案统一来自
 * static/renderer/climate.js，这里只做转发，绝不另写一份口径 —— 否则 2D 面板
 * 与 3D 面板会出现同一台空调显示不同模式列表的问题。
 */

// 动态导入渲染器模块：开发环境走相对路径（file:），生产环境走带缓存戳的静态路径。
// 缓存戳必须与 static 目录的统一版本号保持一致，改渲染器后要同步更新。
const climateRendererModule = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../static/renderer/climate.js", import.meta.url))
  : import("/static/renderer/climate.js?v=20260918181612"));
const {
  normalizeClimateCapabilities: normalizeClimateCapabilities,
  climateIsPoweredOn: climateIsPoweredOn,
  climateIsRunning: climateIsRunning,
  climatePowerCommand: climatePowerCommand
} = climateRendererModule;
export const {
  climateModeLabel,
  climateModeIcon,
  climateSwingModeLabel,
  climateOptionPresentation
} = climateRendererModule;
/**
 * 把任意输入转成有限数字，不可用时返回 null。
 *
 * 特意排除布尔值：`Number(true)` 是 1，会让「属性缺失但被写成 true」的脏数据
 * 被当成合法温度；空串同理要排除，避免被当成 0。
 */
const toFiniteNumber = input =>
  input != null && input !== "" && typeof input != "boolean" && Number.isFinite(Number(input))
    ? Number(input)
    : null;
/**
 * 把 HA 的空调实体状态归一化成 3D 面板使用的状态对象。
 *
 * 字段名与 HA 属性严格对应（min_temp / max_temp / fan_mode / swing_mode 等），
 * 面板与动画都按这些名字取值，改名前需同步改动使用方。
 *
 * @param {string} entityId 实体 ID，形如 climate.living_room。
 * @param {object} receivedState HA 的 state 对象或 state_changed 事件。
 * @returns {object} 归一化后的状态，含可用性、开关、运行、模式、温度与能力列表。
 */
export function climateState(entityId, receivedState) {
  // 事件对象取 newState；直接传 state 时用自身；都没有则退化成空对象，避免抛错。
  const stateObject = receivedState?.newState || receivedState || {};
  const attributes = stateObject.attributes || {};
  const capabilities = normalizeClimateCapabilities(stateObject);
  // state 只认字符串：数字等异常值一律当空串，后面按不可用处理。
  const stateValue = typeof stateObject.state == "string" ? stateObject.state : "";
  const minimum = toFiniteNumber(attributes.min_temp);
  const maximum = toFiniteNumber(attributes.max_temp);
  const temperature = toFiniteNumber(attributes.temperature);
  const supportedFeatures = toFiniteNumber(attributes.supported_features) || 0;
  const targetLow = toFiniteNumber(attributes.target_temp_low);
  const targetHigh = toFiniteNumber(attributes.target_temp_high);
  // 三重判定：实体 ID 必须是原生 climate 域、HA 未标记不可用、state 不是未知态。
  const available =
    /^climate\.[a-z0-9_]+$/.test(entityId) &&
    stateObject.available !== false &&
    !!stateValue &&
    !["unknown", "unavailable"].includes(stateValue);
  // 返回结构就是 3D 面板的内部契约；temperatureSupported / rangeSupported 由
  // HA 的 supported_features 位标志与「属性是否齐全」共同决定，缺一即视为不支持。
  return {
    entityId: entityId,
    raw: stateObject,
    available: available,
    on: available && climateIsPoweredOn(stateObject, "air-conditioner"),
    running:
      available &&
      // hvac_action 是「正在制冷 / 制热 / 待机」的细粒度动作；未知态不算运行。
      !["unknown", "unavailable"].includes(
        String(attributes.hvac_action || "")
          .trim()
          .toLowerCase()
      ) &&
      climateIsRunning(stateObject, "air-conditioner"),
    name: String(attributes.friendly_name || entityId || "空调"),
    mode: stateValue,
    // visualMode 只分三档：关机、制冷、制热，其余模式统一归入 other。
    // 3D 动画据此选择对应的气流 / 颜色表现，因此不能直接把 mode 透传过去。
    visualMode:
      !available || !climateIsPoweredOn(stateObject, "air-conditioner")
        ? "off"
        : stateValue === "cool"
          ? "cool"
          : stateValue === "heat"
            ? "heat"
            : "other",
    temperature: temperature,
    currentTemperature: toFiniteNumber(attributes.current_temperature),
    targetLow: targetLow,
    targetHigh: targetHigh,
    minimum: minimum,
    maximum: maximum,
    step: capabilities.temperatureStep,
    // supported_features 第 0 位（值 1）表示 HA 支持目标温度；
    // 有些实体没有 temperature 属性但仍支持设置，所以要允许这个后备判断。
    temperatureSupported:
      minimum !== null &&
      maximum !== null &&
      maximum > minimum &&
      (temperature !== null || !!(supportedFeatures & 1)),
    // 第 1 位（值 2）表示支持温度区间（target_temp_low/high）；
    // 部分实体只给了区间属性却没置位，因此也接受属性存在这一条件。
    rangeSupported: !!(supportedFeatures & 2) || targetLow !== null || targetHigh !== null,
    modes: capabilities.hvacModes,
    fanModes: capabilities.fanModes,
    // supported_features 第 7 位（值 128）是 ClimateEntityFeature.TURN_ON；
    // 支持它的实体可以只发 turn_on 而不必指定 hvac_mode。
    turnOnSupported: !!(supportedFeatures & 128),
    swingModes: capabilities.swingModes,
    horizontalSwingModes: capabilities.horizontalSwingModes,
    presetModes: capabilities.presetModes,
    fanMode: attributes.fan_mode || "",
    swingMode: attributes.swing_mode || "",
    horizontalSwingMode: attributes.swing_horizontal_mode || "",
    presetMode: attributes.preset_mode || ""
  };
}
/**
 * 构造空调开关命令。
 *
 * @param {object} state climateState 产出的状态对象。
 * @param {boolean} [desiredOn=!state.on] 目标开关状态，默认取反。
 * @param {string} [lastMode=""] 上次使用的模式；关→开时由渲染器用它决定回到哪个模式。
 * @returns {object} 形如 { entityId, domain, service, data } 的服务调用描述。
 * @throws {Error} 设备不可用，或渲染器未能给出可用的 set_hvac_mode 命令。
 */
export function climatePowerControl(state, desiredOn = !state.on, lastMode = "") {
  if (!state.available) {
    throw new Error("设备当前不可用。");
  }
  // 开机：优先显式恢复「上次使用的模式」（面板从模式历史里取），
  // 退而求其次沿用实体当前模式（HA 关机时上报 off，所以这里必须先排除 off）。
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
    // 自己决定回到哪个模式，比硬塞一个 mode 更稳妥。
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
  // 渲染器可能在实体缺少可用模式时返回退化的命令，这里必须挡掉，
  // 否则会把无效服务调用发到 HA，产生难以排查的失败。
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
 *
 * 为什么需要它：HA 的 climate 实体一关机，state 就变成 off，实体本身不再上报
 * 用户最后选的是 cool 还是 heat，面板因此拿不回上一次的模式。这里在内存里记住
 * 每台空调最后一个「可用且正在运行」的模式，并用 localStorage 持久化，
 * 刷新页面或重进应用后仍能恢复。
 *
 * @param {object} [options] 参数。
 * @param {Storage} [options.storage] 持久化后端；不可用（隐私模式等）时静默降级为仅内存。
 * @param {string} [options.scope=""] 作用域；隔离同一实体在不同页面里的记录。
 * @returns {{get: (entityId: string) => string, observe: (entityId: string, receivedState: object) => void}}
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
  // 没有 scope 或实体 ID 非法时不落盘，避免把记录写进无法区分归属的公共键。
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
    // 也会让下一次开机恢复到一个并不存在的模式。
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
 *
 * @param {object} deviceState climateState 产出的状态对象。
 * @param {string} service 服务名：set_temperature、set_hvac_mode、set_fan_mode 或 set_swing_mode。
 * @param {*} value 目标值；set_temperature 时为数字温度，其余为模式字符串。
 * @returns {object} 服务调用描述，data 里只带该服务对应的那一个字段。
 * @throws {Error} 设备不可用、不支持该控制项，或温度越界 / 不支持温度控制。
 */
export function climateControl(deviceState, service, value) {
  if (!deviceState.available) {
    throw new Error("设备当前不可用。");
  }
  let serviceData;
  if (service === "set_temperature") {
    const requestedTemperature = toFiniteNumber(value);
    if (!deviceState.temperatureSupported || requestedTemperature === null) {
      throw new Error("设备尚未提供可用的温度控制。");
    }
    // 小数位数取「步长」与「下限」中小数位更多的一方，最多 8 位；
    // 这样 0.5 步长的空调不会被截成整数，0.1 下限也不会被四舍五入丢掉精度。
    const fractionDigits = Math.min(
      8,
      Math.max(
        String(deviceState.step).split(".")[1]?.length || 0,
        String(deviceState.minimum).split(".")[1]?.length || 0
      )
    );
    // 先把请求温度夹到 [min, max]，再对齐到「下限 + 步长整数倍」的格点；
    // 浮点运算末位会带出误差，所以最后用 toFixed 按上面算出的小数位收敛。
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
    // 可选列表来自实体自身能力，用白名单校验可挡住面板传来的过期 / 伪造值。
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
