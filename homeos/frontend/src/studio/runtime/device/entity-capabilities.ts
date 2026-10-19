export function haNumber(rawValue: any) {
  if (typeof rawValue == "string") {
    if (
      ((rawValue = rawValue.trim()),
      !/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(rawValue))
    )
      return null;
    rawValue = Number(rawValue);
  }
  return typeof rawValue == "number" && Number.isFinite(rawValue) ? rawValue : null;
}
export function attributesOf(entityState: any) {
  const attributes = entityState?.attributes;
  return attributes && typeof attributes == "object" && !Array.isArray(attributes) ? attributes : {};
}
export function featureFlags(attributes: any) {
  const parsedFeatures = haNumber(attributes.supported_features);
  return Number.isInteger(parsedFeatures) && parsedFeatures! >= 0 && parsedFeatures! <= 2147483647
    ? (parsedFeatures as number)
    : 0;
}
export const stringOptions = (values: any) =>
    Array.isArray(values)
      ? [...new Set(values.filter((value) => typeof value == "string" && value.trim()))]
      : [],
  brightnessModes = new Set([
    "brightness",
    "color_temp",
    "hs",
    "xy",
    "rgb",
    "rgbw",
    "rgbww",
    "white",
  ]);
/** 无状态动作实体：`unknown` 表示"可执行"而不是离线。 */
const STATELESS_ACTION_DOMAINS = new Set(["button", "input_button", "scene"]);
/** 只在"有调用记录"时才有状态的服务域：`unknown` 属于正常态。 */
const STATELESS_SERVICE_DOMAINS = new Set([
  "ai_task",
  "notify",
  "tts",
  "stt",
  "wake_word",
  "infrared",
  "radio_frequency",
  "conversation",
]);

/**
 * 附加面板是否需要整体重建。
 *
 * 只比较"会改变控件结构"的字段：换设备、进入/退出编辑、实体可用性翻转、
 * 能力位变化。状态值本身变化不触发重建，交给面板的 update 增量刷新。
 */
export function extraContextChanged(previousContext: any, nextContext: any) {
  const signatureOf = (context: any) => {
    const liveState = context?.state?.newState || context?.state;
    const attributes = attributesOf(liveState);
    const domain = String(context?.item?.entityId || "").split(".")[0];
    const statelessUnknown =
      liveState?.state === "unknown" &&
      ((STATELESS_ACTION_DOMAINS.has(domain) && liveState.available !== false) ||
        (STATELESS_SERVICE_DOMAINS.has(domain) && liveState.availabilityReason === "unknown"));
    return [
      context?.item?.id,
      context?.item?.entityId,
      !!context?.editing,
      context?.item?.modelAvailable !== false,
      liveState?.available !== false || statelessUnknown,
      statelessUnknown
        ? "ready"
        : ["unknown", "unavailable"].includes(liveState?.state)
          ? liveState.state
          : liveState
            ? "ready"
            : "missing",
      attributes.supported_features,
      attributes.supported_color_modes,
    ];
  };
  return JSON.stringify(signatureOf(previousContext)) !== JSON.stringify(signatureOf(nextContext));
}

export function fanCapabilities(attributes: any) {
  const flags = featureFlags(attributes),
    unversioned = !Object.hasOwn(attributes, "supported_features");
  return {
    canTurnOn: unversioned || !!(flags! & 32),
    canTurnOff: unversioned || !!(flags! & 16),
    percentageSupported: unversioned ? haNumber(attributes.percentage) !== null : !!(flags! & 1),
    oscillatingSupported: !!(flags! & 2),
    directionSupported: !!(flags! & 4),
    presetModes: unversioned || flags! & 8 ? stringOptions(attributes.preset_modes) : [],
  };
}
