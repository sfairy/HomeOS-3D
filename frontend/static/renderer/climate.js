/**
 * 温控设备的纯计算层：能力探测、模式文案、开关与运行动作。
 *
 * 覆盖三类设备，语义差别很大，是本文件存在的主要理由：
 * - air-conditioner 空调：有 hvac_mode，制冷 / 制热由 hvac_action 反映；
 * - bath-heater 浴霸：模式实际落在 preset_mode / mode 上，且「关」常常等于「吹风」；
 * - water-heater 热水器：用 operation_mode 表达档位，是否有「运行中」要看温差。
 *
 * 位置：被 climate 控件、entity-power.js 的通用开关逻辑、以及各控件的运行时共同复用；
 * 不碰 DOM，也不读控件注册表。
 *
 * 约定：所有模式文案（关闭 / 制冷 / 取暖 / 换气…）都会直接上屏，
 * 与界面约定死的字符串，改动需同步改设计稿；
 * water-heater 不是可配置的类型，它由实体域推断出来，所以不在下面的白名单里。
 */
// 「按 ID 取域」只有一份实现（P12 收口 B 类末尾那一项）：本文件原先自带一份
// `String(entityId || "").split(".", 1)[0]`（`climateControlStructureKey` 里那处）；
// P12 残留补齐这一批又把 `climateModeTranslation` 里那处没守卫的
// `String(translationEntityId).split(".")[0]` 也换成它 —— 传入 `null` / `0` / `false`
// 时不再拼出以 `"null"` / `"0"` / `"false"` 为域的翻译键，直接按「取不到域」返回空串。
// 有钉子把这条新行为钉住（探针 `entity-helpers` 的 climate-translation 一条）。
import { entityDomainFromId } from "../utils/entities.js?v=20260919135340";

// 控件属性 deviceType 允许的取值；auto 表示交给 resolveClimateDeviceType 推断。
const CLIMATE_DEVICE_TYPES = new Set(["auto", "air-conditioner", "bath-heater"]);
/**
 * 归一化 HA 下发的字符串列表：去空格、丢空项、去重。
 *
 * @param {*} values 原始数组，可能不是数组。
 * @returns {string[]} 归一化后的列表；非数组输入返回空数组。
 */
function normalizeStringList(values) {
  if (Array.isArray(values)) {
    return [...new Set(values.map(entry => String(entry ?? "").trim()).filter(Boolean))];
  } else {
    return [];
  }
}
/**
 * 宽松地解析数字：null、空串与不可解析的值都回落到默认值。
 *
 * 默认值本身可以是 null，用来区分「值就是 0」与「压根没有这个值」——
 * supportsTargetTemperature 之类的能力开关正是靠这个区别判断的。
 *
 * @param {*} value 原始值。
 * @param {*} [fallbackValue] 解析失败时的返回值。
 * @returns {number|null} 解析结果。
 */
function toNumberOrDefault(value, fallbackValue = null) {
  if (value == null || value === "") {
    return fallbackValue;
  }
  const parsedNumber = Number(value);
  if (Number.isFinite(parsedNumber)) {
    return parsedNumber;
  } else {
    return fallbackValue;
  }
}
/**
 * 取控件上显式配置的设备类型。
 *
 * 白名单之外的任何值都当成 auto：属性可能来自旧版本或被手工改坏，
 * 与其把非法值透传到下游，不如统一收敛成「自动推断」。
 *
 * @param {object} component 控件对象。
 * @returns {string} auto / air-conditioner / bath-heater。
 */
export function configuredClimateDeviceType(component) {
  const configuredType = String(component?.properties?.deviceType || "auto");
  if (CLIMATE_DEVICE_TYPES.has(configuredType)) {
    return configuredType;
  } else {
    return "auto";
  }
}
/**
 * 把 HA 的 climate / water_heater 属性整理成一份能力描述。
 *
 * 除了照搬属性，还补上若干布尔能力位（是否可调温、有无模式 / 风速 / 摆风控制等），
 * 让上层只判断能力，不关心 HA 版本差异与字段名差异。
 *
 * 注意 hasModeControl 会把 havc_modes 里的 off 以及中文「空」排除掉：
 * 只有 off 的实体其实是纯开关，不该显示模式选择。
 *
 * @param {object} sourceState 状态对象（或含 attributes 的任意对象）。
 * @returns {object} 归一化后的能力集合，含 attributes 与各项布尔位。
 */
export function normalizeClimateCapabilities(sourceState) {
  const stateAttributes =
    sourceState?.attributes && typeof sourceState.attributes == "object"
      ? sourceState.attributes
      : {};
  const hvacModes = normalizeStringList(stateAttributes.hvac_modes);
  const fanModes = normalizeStringList(stateAttributes.fan_modes);
  const swingModes = normalizeStringList(stateAttributes.swing_modes);
  const horizontalSwingModes = normalizeStringList(stateAttributes.swing_horizontal_modes);
  const presetModes = normalizeStringList(stateAttributes.preset_modes);
  const operationModes = normalizeStringList(stateAttributes.operation_list);
  const fanPercentage = toNumberOrDefault(stateAttributes.percentage);
  const fanPercentageStep = Math.max(1, toNumberOrDefault(stateAttributes.percentage_step, 1));
  const targetTemperature = toNumberOrDefault(stateAttributes.temperature);
  const currentTemperature = toNumberOrDefault(stateAttributes.current_temperature);
  let minimumTemperature = toNumberOrDefault(stateAttributes.min_temp, 16);
  let maximumTemperature = toNumberOrDefault(stateAttributes.max_temp, 30);
    // 上下限缺失或颠倒时统一退回 16~30 摄氏度的通用区间，
    // 否则下面按区间归一化滑条会得到负数跨度。
  if (maximumTemperature <= minimumTemperature) {
    minimumTemperature = 16;
    maximumTemperature = 30;
  }
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
      hvacModes.some(mode => mode !== "off") ||
      operationModes.some(operationMode => !["off", "空"].includes(operationMode.toLowerCase())),
    hasFanControl: fanModes.length > 0,
    hasSwingControl: swingModes.length > 0,
    hasHorizontalSwingControl: horizontalSwingModes.length > 0,
    hasPresetControl: presetModes.length > 0,
    supportsFanPercentage: fanPercentage !== null
  };
}
/**
 * 取设备可选的运行模式列表。
 *
 * 热水器走 operation_list，并过滤掉 off 与「空」；其余设备直接用 hvac_modes。
 * 两者字段不同是 HA 侧的历史差异，这里统一成同一份列表供界面渲染。
 *
 * @param {object} stateEntity 状态对象。
 * @param {string} [deviceType] 设备类型。
 * @returns {string[]} 可选的模式键列表。
 */
export function climateOperationModeValues(stateEntity, deviceType = "air-conditioner") {
  const capabilities = normalizeClimateCapabilities(stateEntity);
  if (deviceType === "water-heater") {
    return capabilities.operationModes.filter(
      operationModeKey => !["off", "空"].includes(String(operationModeKey).trim().toLowerCase())
    );
  } else {
    return capabilities.hvacModes;
  }
}
/**
 * 协调「本地待确认的目标温度」与「设备已确认的目标温度」。
 *
 * 用户拖动滑条后，本地会先记下 pending 值并把界面画成新值；设备把状态回推上来之前，
 * 界面不能被旧值拉回去（会看起来像滑条弹回）。只有当设备回报的值进入容差范围才算确认。
 *
 * @param {number} componentTargetTemperature 控件上记录的当前显示温度。
 * @param {*} confirmedTemperature 设备回报的温度。
 * @param {*} pendingTemperature 本地待确认的温度。
 * @param {number} [stepOverride] 该设备的温度步长，用于推导容差。
 * @returns {{temperature: number, pending: *, confirmed: boolean}} 新的显示值与确认标志。
 */
export function reconcileClimateTargetTemperature(
  componentTargetTemperature,
  confirmedTemperature,
  pendingTemperature,
  stepOverride = 0.5
) {
  const confirmedValue = toNumberOrDefault(confirmedTemperature);
  const pendingValue = toNumberOrDefault(pendingTemperature);
  if (confirmedValue === null) {
    return {
      temperature: componentTargetTemperature,
      pending: pendingTemperature,
      confirmed: false
    };
  }
  if (pendingValue === null) {
    return {
      temperature: confirmedValue,
      pending: null,
      confirmed: false
    };
  }
    // 容差取半个步长：设备常会四舍五入到自己的步长，容差太小会一直判定为「未确认」。
  const tolerance = Math.max(0.001, Math.abs(toNumberOrDefault(stepOverride, 0.5)) / 2);
  if (Math.abs(confirmedValue - pendingValue) <= tolerance) {
    return {
      temperature: confirmedValue,
      pending: null,
      confirmed: true
    };
  } else {
    return {
      temperature: componentTargetTemperature,
      pending: pendingTemperature,
      confirmed: false
    };
  }
}
/**
 * 生成一份「控制面板结构」的指纹。
 *
 * 只包含决定界面结构的能力（温度区间与步长、模式列表、风速、摆风、预设），
 * 不含温度、当前模式这类高频变化的字段——它被用作「需要重建面板吗」的缓存键，
 * 把易变字段放进来会导致每次状态更新都重建界面。
 *
 * @param {string} entityId 实体 ID。
 * @param {object} structureState 状态对象。
 * @param {string} [deviceTypeHint] 设备类型提示，影响模式列表的取值。
 * @returns {string} JSON 字符串形式的指纹。
 */
export function climateControlStructureKey(
  entityId,
  structureState,
  deviceTypeHint = "air-conditioner"
) {
  const structureCapabilities = normalizeClimateCapabilities(structureState);
  const entityDomainName = entityDomainFromId(entityId);
  const supportsTemperature =
    ["climate", "water_heater"].includes(entityDomainName) &&
    structureCapabilities.supportsTargetTemperature;
  return JSON.stringify({
    temperature: supportsTemperature
      ? [
          structureCapabilities.minimumTemperature,
          structureCapabilities.maximumTemperature,
          structureCapabilities.temperatureStep
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
    presetModes: structureCapabilities.presetModes
  });
}
/**
 * 推断温控设备属于空调、浴霸还是（由域决定的）热水器。
 *
 * 判定顺序即优先级：控件显式配置 > 名称关键词 > 模式列表特征 > 冷却能力 > 只有单一制热。
 * 名称优先于模式，是因为浴霸与空调的模式列表高度重叠，而设备名通常最可靠。
 *
 * @param {object} deviceComponent 控件对象（读 properties.deviceType 与 properties.label）。
 * @param {object} deviceState 状态对象或变更对象。
 * @param {string} [friendlyName] 额外的名称线索（例如关联的实体名）。
 * @returns {string} air-conditioner 或 bath-heater。
 */
export function resolveClimateDeviceType(deviceComponent, deviceState, friendlyName = "") {
  const configuredDeviceType = configuredClimateDeviceType(deviceComponent);
  if (configuredDeviceType !== "auto") {
    return configuredDeviceType;
  }
  const resolvedCapabilities = normalizeClimateCapabilities(deviceState);
  const nameSearchText = [
    deviceComponent?.properties?.label,
    deviceState?.attributes?.friendly_name,
    friendlyName
  ]
    .map(namePart => String(namePart || "").toLowerCase())
    .join(" ");
    // 名称里出现浴霸类词汇即可定案：浴霸也有 climate 域与类似模式，靠模式区分不出来。
  if (/(浴霸|风暖|暖风|浴室取暖|bath.?heater)/i.test(nameSearchText)) {
    return "bath-heater";
  }
    // 模式键先归一化再比对：换气 / 除雾 / 干燥 这类浴霸专属模式只要出现其一，就按浴霸处理。
  const hvacModeKeys = resolvedCapabilities.hvacModes.map(normalizeClimateModeKey);
  const presetModeKeys = resolvedCapabilities.presetModes.map(normalizeClimateModeKey);
  if (
    [...hvacModeKeys, ...presetModeKeys].some(bathHeaterModeKey =>
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
        "干燥"
      ].includes(bathHeaterModeKey)
    )
  ) {
    return "bath-heater";
  }
  if (hvacModeKeys.some(coolModeKey => ["cool", "heat_cool"].includes(coolModeKey))) {
    return "air-conditioner";
  }
  const activeHeatModes = hvacModeKeys.filter(heatModeKey => heatModeKey !== "off");
  if (activeHeatModes.length === 1 && activeHeatModes[0] === "heat") {
    return "bath-heater";
  } else {
    return "air-conditioner";
  }
}
// 空调模式的中文文案表。键是归一化后的模式键，值是直接上屏的文案。
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
  eco_mold_prev: "节能＋防霉"
};
// 浴霸模式文案表：把 HA 里五花八门的模式名统一成取暖 / 吹风 / 换气 / 除雾 / 干燥这几类。
const BATH_HEATER_MODE_LABELS = {
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
  制热: "取暖",
  暖风: "取暖",
  取暖: "取暖",
  吹风: "吹风",
  换气: "换气",
  除雾: "除雾",
  干燥: "干燥",
  待机: "待机"
};
// 热水器模式文案表：normal / standard 对应「普通」，adaptive / auto 对应「自适温」。
const WATER_HEATER_MODE_LABELS = {
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
  普通: "普通",
  自适温: "自适温",
  节能: "节能",
  加热: "加热",
  保温: "保温"
};
// 上下摆风的档位文案；fixed_* 是固定风向，swing_* 是在该区间内摆动。
const VERTICAL_SWING_LABELS = {
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
  swing_lower: "下方摆动"
};
// 左右摆风的档位文案；语义与上下摆风对称。
const HORIZONTAL_SWING_LABELS = {
  off: "关闭",
  auto: "自动",
  default: "默认",
  full_swing: "全范围摆动",
  left: "固定左侧",
  left_center: "固定中左",
  center: "固定居中",
  right_center: "固定中右",
  right: "固定右侧"
};
// 只有上下摆风的机型会用 horizontal_* 模式表达「左右固定在某个位置」，单独建表以便组合文案。
const HORIZONTAL_POSITION_LABELS = {
  horizontal_leftmost: "固定最左",
  horizontal_middle_left: "固定左中",
  horizontal_middle_right: "固定右中",
  horizontal_rightmost: "固定最右"
};
/**
 * 把设备上报的模式名归一化成统一键。
 *
 * 依次做：NFKC 归一（全角转半角，中文括号数字等）、驼峰拆词、
 * 把 + 与 & 换成 _and_、转小写、空白与 . / - 换成下划线、压缩连续下划线并去掉首尾下划线。
 * 各家的模式名从 "Fan Only" 到 "fan-only" 再到 "fanOnly" 都有，
 * 归一化后文案表与能力判断才只需要维护一套键。
 *
 * @param {*} rawModeKey 原始模式名。
 * @returns {string} 归一化后的模式键；输入为空时返回空串。
 */
export function normalizeClimateModeKey(rawModeKey) {
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
/**
 * 估算一段文本的显示宽度（不需要真实测量）。
 *
 * 用字符分类代替 canvas 测量，是为了在渲染前就能算出按钮排布：
 * 空白 0.35 em、窄字符 0.32 em、常规半角 0.58 em、宽字符 0.82 em、非 ASCII（中文）按 1 em。
 * 结果只用于「放得下吗」的判断，不要求像素级精确。
 *
 * @param {string} text 文本。
 * @param {number} fontSizePx 字号（像素）。
 * @returns {number} 估算宽度（像素）。
 */
function measureTextWidth(text, fontSizePx) {
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
    0
  );
}
/**
 * 决定模式选择用按钮排布还是下拉框。
 *
 * 逐个按钮估算宽度（含内边距与最小宽度），累加后与可用宽度比较，
 * 超出就退回下拉框——宁可用 select 也不要按钮换行或挤压。
 *
 * @param {Array<string>} modes 模式键列表。
 * @param {object} [labelLookup] 模式键到文案的映射。
 * @param {object} [options] 布局参数：availableWidth、buttonGap、minimumButtonWidth、
 *   horizontalPadding、iconWidth、inlineIcon、inlineIconGap、fontSize。
 * @returns {"select"|"buttons"} 建议的呈现方式。
 */
export function climateOptionPresentation(
  modes,
  labelLookup = {},
  {
    availableWidth: availableWidth = 380,
    buttonGap: buttonGap = 5,
    minimumButtonWidth: minimumButtonWidth = 36,
    horizontalPadding: horizontalPadding = 8,
    iconWidth: iconWidth = 20,
    inlineIcon: inlineIcon = false,
    inlineIconGap: inlineIconGap = 4,
    fontSize: fontSize = 11
  } = {}
) {
  const modeList = normalizeStringList(modes);
  if (
    modeList.length &&
    modeList
      .map(modeLabelKey => String(labelLookup?.[modeLabelKey] || modeLabelKey).trim())
      .reduce(
        (totalWidth, label) => {
          const labelWidth = measureTextWidth(label, fontSize);
          const buttonWidth = inlineIcon
            ? iconWidth + inlineIconGap + labelWidth
            : Math.max(iconWidth, labelWidth);
          return totalWidth + Math.max(minimumButtonWidth, buttonWidth + horizontalPadding);
        },
        Math.max(0, modeList.length - 1) * buttonGap
      ) > availableWidth
  ) {
    return "select";
  } else {
    return "buttons";
  }
}
/**
 * 从 HA 前端翻译表里查模式文案。
 *
 * 翻译键的构成是 component.<平台>.entity.<域>.<翻译键>.state_attributes.<属性>.state|options.<取值>，
 * 四种属性名（preset_mode / hvac_mode / operation_mode / fan_mode）与三种后缀都试一遍，
 * 命中即返回。这是可选增强：拿不到翻译时调用方会退回到本地文案表。
 *
 * @param {string} modeInput 模式原始值。
 * @param {object} [options] 选项：entityId、entityMetadata、entityTranslations、attributes。
 * @returns {string} 翻译文案；查不到或缺少平台 / 域 / 翻译键时返回空串。
 */
export function climateModeTranslation(
  modeInput,
  {
    entityId: translationEntityId = "",
    entityMetadata: entityMetadata = null,
    entityTranslations: entityTranslations = null,
    attributes: attributeOverride = null
  } = {}
) {
  if (!entityTranslations || typeof entityTranslations != "object") {
    return "";
  }
  const metadata = entityMetadata?.get?.(translationEntityId) || {};
  const platform = String(metadata.platform || "").trim();
  const metadataDomain = String(
    metadata.domain || entityDomainFromId(translationEntityId)
  ).trim();
  const translationKey = String(metadata.translationKey || "").trim();
  const modeKey = normalizeClimateModeKey(modeInput);
  if (!platform || !metadataDomain || !translationKey || !modeKey) {
    return "";
  }
  const translationPrefix =
    "component." + platform + ".entity." + metadataDomain + "." + translationKey;
  const attributeNames =
    Array.isArray(attributeOverride) && attributeOverride.length
      ? attributeOverride
      : ["preset_mode", "hvac_mode", "operation_mode", "fan_mode"];
  const trimmedMode = String(modeInput || "").trim();
  const modeCandidates = [
    ...new Set([trimmedMode, trimmedMode.toLowerCase(), modeKey].filter(Boolean))
  ];
  const translationKeyCandidates = attributeNames.flatMap(attributeName =>
    modeCandidates.flatMap(candidate => [
      translationPrefix + ".state_attributes." + attributeName + ".state." + candidate,
      translationPrefix + ".state_attributes." + attributeName + ".options." + candidate,
      translationPrefix + ".state_attributes." + attributeName + "." + candidate
    ])
  );
  for (const candidateTranslationKey of translationKeyCandidates) {
    const translation = String(entityTranslations[candidateTranslationKey] || "").trim();
    if (translation) {
      return translation;
    }
  }
  return "";
}
/**
 * 取模式的展示文案。
 *
 * 优先级：HA 翻译（且含非 ASCII 字符，说明确实是本地化过的文案）→ 本地文案表 →
 * 翻译原文 → 原始模式名。空值返回「等待实体状态」而不是留白。
 *
 * @param {string} requestedMode 模式原始值。
 * @param {string} [labelModeDeviceType] 设备类型，决定用哪张文案表。
 * @param {object} [modeLabelOptions] 透传给 climateModeTranslation 的选项。
 * @returns {string} 展示文案。
 */
export function climateModeLabel(
  requestedMode,
  labelModeDeviceType = "air-conditioner",
  modeLabelOptions = {}
) {
  const rawMode = String(requestedMode || "").trim();
  if (!rawMode) {
    return "等待实体状态";
  }
  const normalizedModeKey = normalizeClimateModeKey(rawMode);
  const modeLabelTable =
    labelModeDeviceType === "bath-heater"
      ? BATH_HEATER_MODE_LABELS
      : labelModeDeviceType === "water-heater"
        ? WATER_HEATER_MODE_LABELS
        : CLIMATE_MODE_LABELS;
  const candidateTranslation = climateModeTranslation(rawMode, modeLabelOptions);
  if (candidateTranslation && /[^\x00-\x7f]/u.test(candidateTranslation)) {
    return candidateTranslation;
  } else {
    return modeLabelTable[normalizedModeKey] || candidateTranslation || rawMode;
  }
}
/**
 * 取摆风模式的展示文案。
 *
 * @param {string} swingModeInput 摆风模式原始值。
 * @param {string} [swingDirection] vertical 或 horizontal，决定用哪张表。
 * @param {object} [swingLabelOptions] 透传给 climateModeTranslation 的选项。
 * @returns {string} 展示文案；查不到时返回原始模式名。
 */
export function climateSwingModeLabel(
  swingModeInput,
  swingDirection = "vertical",
  swingLabelOptions = {}
) {
  const swingModeName = String(swingModeInput || "").trim();
  if (!swingModeName) {
    return "等待实体状态";
  }
  const normalizedSwingKey = normalizeClimateModeKey(swingModeName);
  const swingLabelTable =
    swingDirection === "horizontal" ? HORIZONTAL_SWING_LABELS : VERTICAL_SWING_LABELS;
  if (swingLabelTable[normalizedSwingKey]) {
    return swingLabelTable[normalizedSwingKey];
  }
    // 有些机型把「左右固定位置 + 上下摆动」合成一个竖直摆风模式，
    // 形如 horizontal_middle_left_and_vertical_swing，这里拆出位置部分再拼成组合文案。
  if (swingDirection === "vertical") {
    const positionMatch = normalizedSwingKey.match(
      /^(horizontal_(?:leftmost|middle_left|middle_right|rightmost))(?:_and_)?vertical_swing$/
    );
    if (positionMatch) {
      const positionLabel = HORIZONTAL_POSITION_LABELS[positionMatch[1]];
      if (positionLabel) {
        return positionLabel + "＋上下摆动";
      }
    }
    if (HORIZONTAL_POSITION_LABELS[normalizedSwingKey]) {
      return HORIZONTAL_POSITION_LABELS[normalizedSwingKey];
    }
  }
  return (
    climateModeTranslation(swingModeName, {
      ...swingLabelOptions,
      attributes: [swingDirection === "horizontal" ? "swing_horizontal_mode" : "swing_mode"]
    }) || swingModeName
  );
}
/**
 * 判断浴霸的某个模式是否会吹风（需要播放出风动画）。
 *
 * 只有明确的停机型模式（off / idle / standby / 待机 / 关闭 与未知态）不算吹风，
 * 其余一律算——浴霸的「换气」「除雾」同样有风，动画不该停。
 *
 * @param {*} airflowModeInput 模式原始值。
 * @returns {boolean} 需要出风动画时返回 true。
 */
export function bathHeaterModeUsesAirflow(airflowModeInput) {
  const normalizedAirflowKey = normalizeClimateModeKey(airflowModeInput);
  if (normalizedAirflowKey) {
    return !["off", "idle", "standby", "unknown", "unavailable", "待机", "关闭"].includes(
      normalizedAirflowKey
    );
  } else {
    return false;
  }
}
/**
 * 取用于「展示」的模式名。
 *
 * - 热水器：off / unknown / unavailable 直接返回 state，其余优先 operation_mode；
 * - 浴霸：state 为 off 时，如果 preset_mode / mode 是吹风类模式就返回那个模式，
 *   因为浴霸的「关机」常常只是停加热、风机仍在转；
 * - 空调与未知态：直接返回 state。
 *
 * @param {object} presentationState 状态对象。
 * @param {string} [presentationDeviceType] 设备类型。
 * @returns {string} 用于展示的模式名。
 */
export function climatePresentationMode(
  presentationState,
  presentationDeviceType = "air-conditioner"
) {
  const rawStateName = String(presentationState?.state || "off").trim();
  if (presentationDeviceType === "water-heater") {
    if (["off", "unknown", "unavailable"].includes(rawStateName.toLowerCase())) {
      return rawStateName;
    } else {
      return String(presentationState?.attributes?.operation_mode || rawStateName).trim();
    }
  }
  if (
    presentationDeviceType !== "bath-heater" ||
    ["unknown", "unavailable"].includes(rawStateName.toLowerCase())
  ) {
    return rawStateName;
  }
    // 浴霸关机后风机可能仍在转，此时应显示吹风 / 换气而不是「关闭」。
  if (rawStateName.toLowerCase() === "off") {
    const presetMode = String(
      presentationState?.attributes?.preset_mode || presentationState?.attributes?.mode || ""
    ).trim();
    if (bathHeaterModeUsesAirflow(presetMode)) {
      return presetMode;
    } else {
      return "off";
    }
  }
  return String(
    presentationState?.attributes?.preset_mode ||
      presentationState?.attributes?.mode ||
      presentationState?.attributes?.fan_mode ||
      rawStateName
  ).trim();
}
/**
 * 判断温控设备是否处于开机状态。
 *
 * 浴霸单独处理：state 为 off 时还要看展示模式是否会吹风，否则一律算关机；
 * 其余设备只要 state 不是 off / unknown / unavailable 就算开机。
 *
 * @param {object} powerState 状态对象或变更对象。
 * @param {string} [powerDeviceType] 设备类型。
 * @returns {boolean} 是否开机。
 */
export function climateIsPoweredOn(powerState, powerDeviceType = "air-conditioner") {
  const lowercasedState = String(powerState?.state || "off")
    .trim()
    .toLowerCase();
  if (powerDeviceType === "bath-heater") {
    if (!lowercasedState || ["unknown", "unavailable"].includes(lowercasedState)) {
      return false;
    }
    const presentationMode = normalizeClimateModeKey(
      climatePresentationMode(powerState, powerDeviceType)
    );
    if (["off", "idle", "standby", "待机", "关闭"].includes(presentationMode)) {
      return false;
    } else if (lowercasedState === "off") {
      return bathHeaterModeUsesAirflow(presentationMode);
    } else {
      return true;
    }
  }
  return !["off", "unknown", "unavailable"].includes(lowercasedState);
}
/**
 * 判断设备当前是否真的在工作（区别于「开着但待机」）。
 *
 * 先要求开机；然后按设备类型取证据：
 * - 热水器：当前水温低于目标 0.4 度以上才算在加热，否则视为保温；
 * - 浴霸：看展示模式是否会吹风；
 * - 空调：看 hvac_action 是否处于 idle / off 之外。
 *
 * @param {object} runState 状态对象或变更对象。
 * @param {string} [runDeviceType] 设备类型。
 * @returns {boolean} 是否正在工作。
 */
export function climateIsRunning(runState, runDeviceType = "air-conditioner") {
  if (!climateIsPoweredOn(runState, runDeviceType)) {
    return false;
  }
  if (runDeviceType === "water-heater") {
    const measuredTemperature = toNumberOrDefault(runState?.attributes?.current_temperature);
    const targetTemperatureValue = toNumberOrDefault(runState?.attributes?.temperature);
      // 0.4 度是刻意的滞回量：出水温度在目标附近抖动时，「正在加热 / 保温中」不会来回跳。
    if (measuredTemperature !== null && targetTemperatureValue !== null) {
      return measuredTemperature < targetTemperatureValue - 0.4;
    } else {
      return true;
    }
  }
  if (runDeviceType === "bath-heater") {
    return bathHeaterModeUsesAirflow(climatePresentationMode(runState, runDeviceType));
  }
  const hvacAction = String(runState?.attributes?.hvac_action || "")
    .trim()
    .toLowerCase();
  return !["idle", "off"].includes(hvacAction);
}
/**
 * 把当前状态映射成出风特效要用的四种模式。
 *
 * @param {object} effectState 状态对象或变更对象。
 * @param {string} [effectDeviceType] 设备类型。
 * @returns {"off"|"cool"|"heat"|"other"} 特效模式；off 表示风机停转。
 *
 * 浴霸的判定与空调不同：吹风类模式对应特效的 cool（视觉上是冷色气流），
 * 取暖 / 快速取暖类对应 heat，其余归 other。
 */
export function climateEffectMode(effectState, effectDeviceType = "air-conditioner") {
  if (!climateIsPoweredOn(effectState, effectDeviceType)) {
    return "off";
  }
  if (effectDeviceType === "water-heater") {
    return "heat";
  }
  const effectModeKey = normalizeClimateModeKey(
    climatePresentationMode(effectState, effectDeviceType)
  );
  const hvacActionName = String(effectState?.attributes?.hvac_action || "")
    .trim()
    .toLowerCase();
  if (effectDeviceType === "bath-heater") {
    if (["fan", "fan_only", "吹风"].includes(effectModeKey)) {
      return "cool";
    } else if (
      [
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
        "制热"
      ].includes(effectModeKey)
    ) {
      return "heat";
    } else {
      return "other";
    }
  } else if (["cooling", "cool"].includes(hvacActionName) || effectModeKey === "cool") {
    return "cool";
  } else if (
    ["heating", "heat"].includes(hvacActionName) ||
    ["heat", "heating"].includes(effectModeKey)
  ) {
    return "heat";
  } else {
    return "other";
  }
}
/**
 * 取模式对应的图标。
 *
 * 这里返回的是几何符号而不是 mdi 图标名：模式图标的文字短、字号小，
 * 用字体符号可以直接跟着文字排版，不需要额外的图标请求与对齐处理。
 * 每张表查不到时统一回落到 • 。
 *
 * @param {string} iconModeInput 模式原始值。
 * @param {string} [iconDeviceType] 设备类型。
 * @returns {string} 图标字符。
 */
export function climateModeIcon(iconModeInput, iconDeviceType = "air-conditioner") {
  const iconModeKey = normalizeClimateModeKey(iconModeInput);
  if (iconDeviceType === "water-heater") {
    return (
      {
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
        普通: "♨",
        自适温: "A",
        节能: "♢",
        加热: "♨",
        保温: "○"
      }[iconModeKey] || "•"
    );
  } else if (iconDeviceType === "bath-heater") {
    return (
      {
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
        制热: "♨",
        暖风: "♨",
        取暖: "♨",
        吹风: "✾",
        换气: "↥",
        除雾: "◈",
        干燥: "◇",
        待机: "○"
      }[iconModeKey] || "•"
    );
  } else {
    return (
      {
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
        eco_mold_prev: "♢"
      }[iconModeKey] || "•"
    );
  }
}
/**
 * 取设备类型的通用名称（界面文案）。
 *
 * @param {string} deviceLabelType 设备类型。
 * @returns {string} 浴霸 / 热水器 / 空调。
 */
export function climateDeviceLabel(deviceLabelType) {
  if (deviceLabelType === "bath-heater") {
    return "浴霸";
  } else if (deviceLabelType === "water-heater") {
    return "热水器";
  } else {
    return "空调";
  }
}
/**
 * 决定温控弹窗的标题。
 *
 * 浴霸沿用旧版默认标题「空调」，这里会替换成设备名；
 * 手动改过标题的控件保持用户输入，不做覆盖。
 *
 * @param {string} title 控件上配置的标题。
 * @param {string} [fallbackTitle] 缺省标题。
 * @param {string} [titleDeviceType] 设备类型。
 * @returns {string} 最终标题，保证非空。
 */
export function climateDialogTitle(title, fallbackTitle = "", titleDeviceType = "air-conditioner") {
  const trimmedTitle = String(title || "").trim();
  const defaultTitle = String(fallbackTitle || "").trim() || climateDeviceLabel(titleDeviceType);
  if (trimmedTitle) {
    if (titleDeviceType === "bath-heater" && trimmedTitle === "空调") {
      return defaultTitle;
    } else {
      return trimmedTitle;
    }
  } else {
    return defaultTitle;
  }
}
/**
 * 构造开机 / 关机的服务调用。
 *
 * 分域处理：water_heater 与 fan 直接用 turn_on / turn_off；非 climate 域退回通用 toggle；
 * climate 域则要显式设置 hvac_mode，因为它的开关就是模式切换。
 *
 * @param {string} commandEntityId 目标实体 ID。
 * @param {object} commandState 当前状态对象。
 * @param {boolean} isTurningOn 本次是开机还是关机。
 * @param {string} [commandDeviceType] 设备类型，决定开机模式的偏好顺序。
 * @param {string} [preferredMode] 调用方指定的首选模式，合法时优先于偏好表。
 * @returns {{domain: string, service: string, data: object}} 服务调用描述。
 */
export function climatePowerCommand(
  commandEntityId,
  commandState,
  isTurningOn,
  commandDeviceType = "air-conditioner",
  preferredMode = ""
) {
  const commandDomain = entityDomainFromId(commandEntityId);
  if (commandDomain === "water_heater") {
    return {
      domain: "water_heater",
      service: isTurningOn ? "turn_on" : "turn_off",
      data: {}
    };
  }
  if (commandDomain === "fan") {
    return {
      domain: "fan",
      service: isTurningOn ? "turn_on" : "turn_off",
      data: {}
    };
  }
  if (commandDomain !== "climate") {
    return {
      domain: "homeassistant",
      service: "toggle",
      data: {}
    };
  }
    // 关机：设备支持 off 模式就显式设过去，否则只能退回通用 toggle（有些设备没有 off 模式）。
  const powerCapabilities = normalizeClimateCapabilities(commandState);
  if (!isTurningOn) {
    if (powerCapabilities.hvacModes.includes("off")) {
      return {
        domain: "climate",
        service: "set_hvac_mode",
        data: {
          hvac_mode: "off"
        }
      };
    } else {
      return {
        domain: "homeassistant",
        service: "toggle",
        data: {}
      };
    }
  }
  const availableModes = powerCapabilities.hvacModes.filter(
    availableMode => availableMode !== "off"
  );
    // 开机模式的偏好顺序按设备类型区分：浴霸优先取暖，空调优先自动，
    // 都取不到时退而取设备上报的第一个可用模式。
  const preferredModes =
    commandDeviceType === "bath-heater"
      ? ["heat", "auto", "fan_only", "ventilation", "dry", "idle"]
      : ["auto", "cool", "heat_cool", "heat", "fan_only", "dry", "idle"];
  const selectedMode = availableModes.includes(preferredMode)
    ? preferredMode
    : preferredModes.find(candidateMode => availableModes.includes(candidateMode)) ||
      availableModes[0];
  if (selectedMode) {
    return {
      domain: "climate",
      service: "set_hvac_mode",
      data: {
        hvac_mode: selectedMode
      }
    };
  } else {
    return {
      domain: "homeassistant",
      service: "toggle",
      data: {}
    };
  }
}
/**
 * 取设备类型的默认 MDI 图标名。
 *
 * @param {string} defaultIconDeviceType 设备类型。
 * @returns {string} mdi 图标名。
 */
export function climateDefaultIcon(defaultIconDeviceType) {
  if (defaultIconDeviceType === "bath-heater") {
    return "mdi:radiator";
  } else if (defaultIconDeviceType === "water-heater") {
    return "mdi:water-boiler";
  } else {
    return "mdi:air-conditioner";
  }
}
/**
 * 取热水器的状态文案。
 *
 * 判定顺序：离线 → 未知 → 已关闭 → 正在加热（看温差）→ 保温中。
 * 「保温中」是兜底而不是一种独立状态：开着但没在加热就等于保温。
 *
 * @param {object} waterHeaterState 状态对象。
 * @returns {string} 中文状态文案。
 */
export function waterHeaterStatusLabel(waterHeaterState) {
  const rawState = String(waterHeaterState?.state || "")
    .trim()
    .toLowerCase();
  if (rawState === "unavailable") {
    return "当前不可用";
  } else if (!rawState || rawState === "unknown") {
    return "状态未知";
  } else if (rawState === "off") {
    return "已关闭";
  } else if (climateIsRunning(waterHeaterState, "water-heater")) {
    return "正在加热";
  } else {
    return "保温中";
  }
}
