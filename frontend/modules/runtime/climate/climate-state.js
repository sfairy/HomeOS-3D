/**
 * 空调（climate）实体的状态归一化与控制命令构造。
 *
 * 把 HA 的 climate 实体（或 state_changed 事件）翻译成渲染器可直接消费的形状，并把面板操作
 * （开关、调温、改模式）翻译成发给 HA 的服务调用。
 *
 * 约定：能力解析（支持哪些模式、温度步长）与文案统一来自 static/renderer/controls/climate.js，
 * 这里只转发，绝不另写一份口径，否则 2D 与 3D 面板会出现同一台空调不同的模式列表。
 */

// 状态条目归一与「按 ID 切域」只有一份实现（/static/utils/），这里经 static-helpers 桥取用。
import {
  finiteNumberOrNull,
  normalizedTextOf,
  resolveStateEntry
} from "../core/static-helpers.js?v=2609262221";
// 动态导入渲染器模块：开发环境走相对路径（file:），生产环境走带缓存戳的静态路径。
// 缓存戳必须与 static 目录的统一版本号保持一致，改渲染器后要同步更新。
const climateRendererModule = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/renderer/controls/climate.js", import.meta.url))
  : import("/static/renderer/controls/climate.js?v=2609262221"));
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
// finiteNumberOrNull（经 static-helpers 桥取用）：布尔与空白串都视为「没上报」，
// 否则 Number(true) 是 1、Number("") 是 0，脏数据会被当成合法温度。
/**
 * 档位名表：键是档数，值是从最低档到最高档的名字。
 *
 * 市面上净化器 / 新风系统的档位名基本固定成这么几套，报「40%」或「3 档」对用户没有意义：
 *   · 7 档（percentage_step ≈ 14.29）—— 最常见的档数，命名一路从「自动」到「超高」；
 *   · 3 档（percentage_step ≈ 33.33）—— 低 / 中 / 高。
 * 其余档数（1 / 2 / 4 / 5 / 6 / 8 / 9 / 10）没有通用叫法，沿用「N 档」，
 * 不硬编一套用户不认识的命名 —— 编错了比「4 档」更难懂。
 */
const PURIFIER_SPEED_LEVEL_LABELS = {
  3: ["低档", "中档", "高档"],
  7: ["自动", "微风", "超低", "低风", "中风", "高风", "超高"]
};
/**
 * 把 HA 上报的 `percentage_step` 摊成离散风速档位（上游 0.6.5 `purifierSpeedLevels` 同口径）。
 *
 * 只有「步长能整除成 1–10 档」时才返回档位，否则返回空数组、面板退回连续滑杆：
 *   · 步长为空 / 非正 / > 100        → 无档位；
 *   · 100 / 步长 四舍五入后不在 1–10 → 档位太多或太少，按钮比滑杆更难用；
 *   · 步长与 100 / 档数 相差 > 0.02  → 除不尽（如 30 → 3.33 档），按档位切会漏掉真实取值。
 * 档位名按档数查 PURIFIER_SPEED_LEVEL_LABELS，没有约定的档数一律「N 档」；
 * 百分比按档位均分后向下取整，与 HA 的 0–100 步进语义一致（第 i 档 = floor(100 × (i+1) / 档数)）。
 */
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
 * 字段名与 HA 属性严格对应（min_temp / max_temp / fan_mode 等），面板与动画按这些名字取值，改名需同步使用方。
 */
export function climateState(entityId, receivedState) {
  // 事件对象取 newState；直接传 state 时用自身；都没有则退化成空对象，避免抛错。
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
  // fan（空气净化器）的 bit 0 是「支持风速百分比」。因此下面一律先判域再解释位，不混用。
  const isFanDomain = /^fan\.[a-z0-9_]+$/.test(entityId);
  // 与后端同一个口径：属性**是否存在**决定走不走能力位。只看「能不能解析成数字」会把
  // 「键在、值是字符串」误当成「键不在」，从而错误放行那条后备分支（见 purifier.py）。
  const hasSupportedFeaturesAttribute = Object.prototype.hasOwnProperty.call(
    attributes,
    "supported_features"
  );
  // 净化器的能力位比 climate 严一档，口径直接抄 purifier.py：
  // `features = features if isinstance(features, int) else 0` —— 字符串一律当 0。
  // 若沿用上面的 finiteNumberOrNull，"15" 会被解析成 15，面板于是渲染出摆动 / 方向 /
  // 风速三组控件，而后端对同一份状态必然回 422：本地预检形同虚设，用户看到的是
  // 「按钮在、点了报错」。Python 里 bool 是 int 的子类，JSON 的 true 到后端就是 1，
  // 这里连这个边界一起照抄（true → 1，即只认第 0 位）。
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
  // 风速百分比：bit 0（值 1，SET_SPEED）。与后端一致：上报了 supported_features 就必须置位；
  // 完全没上报该属性时，退化为「HA 给过 percentage 就认为能设」。
  const percentageStep = parsedPercentageStep !== null && parsedPercentageStep > 0 ? parsedPercentageStep : 1;
  const percentageSupported =
    isFanDomain &&
    (hasSupportedFeaturesAttribute ? !!(purifierFeatures & 1) : percentage !== null);
  // 三重判定：实体 ID 必须是 climate（空调）或 fan（空气净化器）域、HA 未标记不可用、
  // state 不是未知态。净化器在 HA 里就是 fan 域，放开它才能让同一个面板同时服务两类设备。
  const available =
    /^(?:climate|fan)\.[a-z0-9_]+$/.test(entityId) &&
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
      !["unknown", "unavailable"].includes(normalizedTextOf(attributes.hvac_action || "")) &&
      climateIsRunning(stateObject, "air-conditioner"),
    name: String(attributes.friendly_name || entityId || "空调"),
    mode: stateValue,
    // visualMode 是给样式用的模式桶：关机 / 制冷 / 制热 / 净化 / 其它。
    // 3D 动画与面板强调色据此选择气流与配色，因此不能直接把 mode 透传过去
    // ——「烘干」「送风」这些模式没有对应的视觉表现，统一归入 other。
    // fan 域（净化器）单独成一桶：它没有冷热之分，但开着就该有自己的配色，
    // 否则会和 other 一起落到中性灰，整块面板没有颜色（见 climate-panel.css）。
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
    // 有些实体没有 temperature 属性但仍支持设置，所以要允许这个后备判断。
    // 只对 climate 域成立 —— fan 域同一位是风速百分比，判域防止净化器冒出一块温控区。
    temperatureSupported:
      !isFanDomain &&
      minimum !== null &&
      maximum !== null &&
      maximum > minimum &&
      (temperature !== null || !!(supportedFeatures & 1)),
    // 第 1 位（值 2）表示支持温度区间（target_temp_low/high）；
    // 部分实体只给了区间属性却没置位，因此也接受属性存在这一条件。
    // fan 域的 bit 1 含义是 OSCILLATE，必须先判域再解释，否则净化器会多出一行温区提示。
    rangeSupported:
      !isFanDomain && (!!(supportedFeatures & 2) || targetLow !== null || targetHigh !== null),
    modes: capabilities.hvacModes,
    fanModes: capabilities.fanModes,
    // supported_features 第 8 位（值 256）才是 ClimateEntityFeature.TURN_ON；第 7 位（值 128）
    // 是 TURN_OFF —— 拿 TURN_OFF 当开机能力，会让「只支持关机」的实体被误判成「能开机」，
    // 按钮亮着、命令却在 HA 侧被拒。支持 TURN_ON 的实体可以只发 turn_on 而不必指定 hvac_mode。
    // fan 域的开关机不设能力位门槛（后端 validate_purifier_command 直接放行），故净化器恒为 true。
    turnOnSupported: isFanDomain || !!(supportedFeatures & 256),
    swingModes: capabilities.swingModes,
    horizontalSwingModes: capabilities.horizontalSwingModes,
    presetModes: capabilities.presetModes,
    fanMode: attributes.fan_mode || "",
    swingMode: attributes.swing_mode || "",
    horizontalSwingMode: attributes.swing_horizontal_mode || "",
    presetMode: attributes.preset_mode || "",
    // ===== 空气净化器（HA 的 fan 域）专属状态位 =====
    // 空调实体上这些字段恒为「不支持 / 空」，面板据此决定要不要渲染净化器那几组控件。
    purifier: isFanDomain,
    // 摆动：bit 1（值 2，FanEntityFeature.OSCILLATE）。能力位取 purifierFeatures（严格整数口径），
    // 不用 supportedFeatures —— 后者会把字符串掩码当数字解释，与后端判定不一致。
    oscillating: isFanDomain && attributes.oscillating === true,
    oscillatingSupported: isFanDomain && !!(purifierFeatures & 2),
    // 风向前后吹：bit 2（值 4，DIRECTION），取值只有 forward / reverse。
    direction:
      isFanDomain && ["forward", "reverse"].includes(attributes.direction)
        ? attributes.direction
        : "",
    directionSupported: isFanDomain && !!(purifierFeatures & 4),
    // 风速百分比：bit 0（值 1，SET_SPEED）。与后端一致：上报了 supported_features 就必须置位；
    // 完全没上报该属性时，退化为「设备给过 percentage 就认为能设」。
    percentage: percentage,
    percentageStep: percentageStep,
    percentageSupported: percentageSupported,
    // 离散风速档位：步长能整除成 1–10 档时给按钮，否则空数组（面板退回连续滑杆）。
    // 判定用**原始** percentage_step 而不是上面兜底过的 percentageStep —— 上游同口径：
    // 步长缺失 / 非法时没有档位可言，不能拿兜底的 1 去铺出 100 个档。
    speedLevels: percentageSupported ? purifierSpeedLevels(parsedPercentageStep) : [],
    // 预设模式来自 capabilities.presetModes（即 HA 属性 preset_modes，能力解析口径只在
    // renderer/controls/climate.js 维护一份）。bit 3（值 8，FanEntityFeature.PRESET_MODE）；
    // 与后端一致：没上报 supported_features 时，只要设备给了 preset_modes 列表就放行。
    presetModeSupported:
      isFanDomain &&
      (!hasSupportedFeaturesAttribute || !!(purifierFeatures & 8)) &&
      capabilities.presetModes.length > 0
  };
}
/**
 * 构造空调开关命令。
 *
 * @throws {Error} 设备不可用，或渲染器未能给出可用的 set_hvac_mode 命令。
 */
export function climatePowerControl(state, desiredOn = !state.on, lastMode = "") {
  if (!state.available) {
    throw new Error("设备当前不可用。");
  }
  // 净化器是 fan 域实体，开关必须发 fan.turn_on / fan.turn_off，且不带参数。
  // 必须在下面那套 climate 的「恢复上次模式」逻辑之前返回：净化器没有 hvac_mode，
  // 落到 set_hvac_mode 分支只会得到一条注定被 HA 拒绝的命令。
  // 面板自己虽然先判了 deviceState.purifier 再分支，但这层判断不该是唯一防线 ——
  // 一旦有第二个调用方（主播的电源路径等），climate.turn_on 打到 fan 实体上是静默失败。
  // 与 0.6.5 逐字同口径：这里直接给命令，不绕 purifierControl（它带面板级的报错文案）。
  if (state.purifier) {
    return {
      entityId: state.entityId,
      domain: "fan",
      service: desiredOn ? "turn_on" : "turn_off",
      data: {}
    };
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
 * HA 的 climate 一关机 state 就变 off，不再上报用户最后选的是 cool 还是 heat，故在内存里记住
 * 每台空调最后一个「可用且正在运行」的模式并用 localStorage 持久化；storage 不可用（隐私模式等）时静默降级为仅内存。
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
 * @throws {Error} 设备不可用、不支持该控制项，或温度越界 / 不支持温度控制。
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
/**
 * 构造空气净化器（HA 的 fan 域）的单项控制命令。
 *
 * 与 climateControl 分开是因为域不同：空调走 climate.*，净化器走 fan.*。域名不是猜的 ——
 * 后端 /control 最终落到 api/ha.py 的 ALLOWED_SERVICES，那里登记的是 ('fan', 'set_percentage')
 * 等组合；purifier.py 的 validate_purifier_command 就按这些裸服务名复核。
 *
 * 本地先按同一张能力表拦一道，把注定失败的请求变成立即的中文提示；文案与后端逐字一致，
 * 用户无论在哪一层被挡都看到同一句话。
 *
 * @throws {Error} 设备不可用、不支持该项，或取值越界。
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
    // 这里也不比 —— 多挡一道会让设备端本可接受的取值在本地被误拒。
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
    // 白名单校验挡住面板传来的过期 / 伪造值。
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
