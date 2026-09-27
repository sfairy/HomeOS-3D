/**
 * 窗帘（cover）实体的状态归一化与控制命令构造。
 */

// 状态条目归一（变更对象 / 状态对象两种形态）与「按 ID 切域」只有一份实现（`/static/utils/`
import {
  COVER_FEATURE_CLOSE,
  COVER_FEATURE_OPEN,
  COVER_FEATURE_SET_POSITION,
  COVER_FEATURE_SET_TILT_POSITION,
  COVER_FEATURE_STOP,
  coverFeaturesOrInferred,
  coverReportsTilt,
  finiteNumberOrNull,
  resolveStateEntry,
  stateTextOf
} from "../core/static-helpers.js?v=2609271226";
const STATE_LABELS = {
  open: "已打开",
  closed: "已关闭",
  opening: "正在打开",
  closing: "正在关闭"
};
/**
 * 取窗帘状态的中文文案；已知状态返回对应文案，其余（含 unknown / unavailable）返回「设备不可用」。
 */
export function coverStateLabel(stateName) {
  if (Object.hasOwn(STATE_LABELS, stateName)) {
    return STATE_LABELS[stateName];
  } else {
    return "设备不可用";
  }
}
/**
 * 判断窗帘图标是否应按「点亮」呈现；可用且（按需取反后）为 on 时返回 true。
 */
export function coverIconIsOn(binding, iconState) {
  return (
    // iconStateReversed 用于「反转开关语义」的窗帘（例如常闭电磁阀驱动），
    !!iconState?.available && !!(binding?.iconStateReversed === true ? !iconState.on : iconState.on)
  );
}
/**
 * 把 HA 的窗帘实体状态归一化成 3D 动画使用的状态对象。
 */
export function coverState(entityId, receivedState, item = {}) {
  const stateObject = resolveStateEntry(receivedState, {});
  const attributes = stateObject.attributes || {};
  const stateValue = stateTextOf(stateObject);
  const reportedPosition = finiteNumberOrNull(attributes.current_position);
  const reportedTilt = finiteNumberOrNull(attributes.current_tilt_position);
  // 梦幻帘由「整体 + 叶片」两套机构组成，整体位置的反馈往往不可信，
  const isDreamCover = item.coverKind === "dream";
  // 能力位取「上报值，缺失时按已上报属性推断」的版本：一部分网关从不给 supported_features，
  const supportedFeatures = coverFeaturesOrInferred(attributes);
  // 240 = 16+32+64+128，即 HA 里全部 tilt（开合角度）相关能力位；
  const hasTiltFeedback = coverReportsTilt(attributes, supportedFeatures);
  // 非梦幻帘的整体位置始终可信；梦幻帘只有拿到叶片反馈时才敢相信整体位置，
  const overallFeedbackAvailable = !isDreamCover || hasTiltFeedback;
  const normalizedState = overallFeedbackAvailable ? stateValue : "unknown";
  // 位置归一：能上报就用上报值并夹到 0–100；只报 closed 而无位置时按 0 处理；
  const position = overallFeedbackAvailable
    ? reportedPosition === null
      ? normalizedState === "closed"
        ? 0
        : null
      : Math.max(0, Math.min(100, reportedPosition))
    : null;
  // 没有独立的 tilt 反馈时，退而用整体位置近似叶片角度（部分设备的约定）。
  const tiltPosition = hasTiltFeedback ? reportedTilt : reportedPosition;
  // 实体 ID 必须是原生 cover 域、HA 未标记不可用，且 state 落在已知文案表内；
  const available =
    /^cover\.[a-z0-9_]+$/.test(entityId) &&
    stateObject.available !== false &&
    Object.hasOwn(STATE_LABELS, stateValue);
  // 位置不可用时的兜底姿态：由 state 文案给出的「已停稳那一端」的位置。
  const statePositionHint = !available
    ? null
    : stateValue === "open"
      ? 100
      : stateValue === "closed"
        ? 0
        : null;
  // 返回结构是窗帘动画与图标的内部契约：positionKnown 区分「位置为 0」与「位置未知」，
  return {
    entityId: entityId,
    raw: stateObject,
    available: available,
    dream: isDreamCover,
    overallFeedbackAvailable: overallFeedbackAvailable,
    name: String(attributes.friendly_name || entityId || "窗帘"),
    state: normalizedState,
    position: position,
    positionKnown: position !== null,
    positionReported: overallFeedbackAvailable && reportedPosition !== null,
    // 位置缺失时的兜底姿态（0 / 100 / null），供 3D 动画在无位置反馈时摆位；
    statePositionHint: statePositionHint,
    features: supportedFeatures,
    closedConfirmed:
      available && overallFeedbackAvailable && normalizedState === "closed" && position === 0,
    tiltPosition: tiltPosition === null ? null : Math.max(0, Math.min(100, tiltPosition)),
    tiltPositionKnown: tiltPosition !== null,
    opening: available && normalizedState === "opening",
    closing: available && normalizedState === "closing",
    moving: available && ["opening", "closing"].includes(normalizedState),
    on:
      available &&
      (normalizedState === "opening" ||
        (position !== null ? position > 0 : normalizedState === "open")),
    openSupported: !!(supportedFeatures & COVER_FEATURE_OPEN),
    closeSupported: !!(supportedFeatures & COVER_FEATURE_CLOSE),
    positionSupported: !!(supportedFeatures & COVER_FEATURE_SET_POSITION),
    stopSupported: !!(supportedFeatures & COVER_FEATURE_STOP),
    tiltSupported: !!(supportedFeatures & COVER_FEATURE_SET_TILT_POSITION),
    // 叶片可调能力：声明了 set_tilt_position 位即可 —— 设备不报能力位时，该位由
    bladeSupported:
      !!(supportedFeatures & COVER_FEATURE_SET_TILT_POSITION) ||
      (!hasTiltFeedback && !!(supportedFeatures & COVER_FEATURE_SET_POSITION))
  };
}
/**
 * 判断当前是否允许调整叶片角度。
 */
export function coverCanAdjustBlades(state, presentation = state) {
  if (!state.available || !state.bladeSupported) {
    return false;
  } else if (state.overallFeedbackAvailable) {
    // 有可信反馈时只认「确认全关」；用户手动拖到 0 但尚未停止不算。
    return presentation.closedConfirmed === true;
  } else {
    // 没有独立叶片反馈：位置就是唯一可调轴，不再用整体状态设门禁。
    return true;
  }
}
/**
 * 构造窗帘控制命令。
 */
export function coverControl(sourceState, service, value) {
  if (!sourceState.available) {
    throw new Error("窗帘当前不可用。");
  }
  // 服务名 → 状态对象上的能力字段；用白名单既能挡未知服务，
  const capabilityKey = {
    open_cover: "openSupported",
    close_cover: "closeSupported",
    stop_cover: "stopSupported",
    set_cover_position: "positionSupported",
    set_cover_tilt_position: "tiltSupported"
  }[service];
  if (!capabilityKey || !sourceState[capabilityKey]) {
    throw new Error("设备不支持此窗帘操作。");
  }
  if (
    sourceState.dream &&
    ["set_cover_position", "set_cover_tilt_position"].includes(service) &&
    !coverCanAdjustBlades(sourceState)
  ) {
    throw new Error("只有确认整体完全关闭且停止后，才能调整叶片。");
  }
  let serviceData = {};
  if (service === "set_cover_position" || service === "set_cover_tilt_position") {
    const positionValue = finiteNumberOrNull(value);
    if (!Number.isInteger(positionValue) || positionValue < 0 || positionValue > 100) {
      throw new Error("目标位置必须是 0–100 之间的整数。");
    }
    serviceData =
      service === "set_cover_tilt_position"
        ? {
            tilt_position: positionValue
          }
        : {
            position: positionValue
          };
  }
  return {
    entityId: sourceState.entityId,
    domain: "cover",
    service: service,
    data: serviceData
  };
}
