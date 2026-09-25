/**
 * 窗帘（cover）实体的状态归一化与控制命令构造。
 *
 * 把 HA 的 cover 实体翻译成窗帘动画需要的「整体位置 + 叶片角度」，并把面板操作翻译成发给
 * HA 的服务调用。对外提供 coverStateLabel、coverIconIsOn、coverState、
 * coverCanAdjustBlades、coverControl。位置取 current_position（0–100），叶片角度取
 * current_tilt_position；能力位来自 supported_features（见 HA CoverEntityFeature）。
 */

// 状态条目归一（变更对象 / 状态对象两种形态）与「按 ID 切域」只有一份实现（`/static/utils/`
// 里那两份），这里经 static-helpers 桥取用：运行侧（舞台页能以 file: 打开）不能写裸
// `/static/...` 的静态 import，桥按更严的那种口径分流（见该文件里的两条纪律）。
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
} from "../core/static-helpers.js?v=2609251754";
/**
 * HA 窗帘状态 → 中文文案；同时被当作「状态是否合法」的白名单使用。 */
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
    // 严格比较 true，避免配置里写成字符串 "true" 时被误判。
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
  // 需要单独判断，见下面的 overallFeedbackAvailable。
  const isDreamCover = item.coverKind === "dream";
  // 能力位取「上报值，缺失时按已上报属性推断」的版本：一部分网关从不给 supported_features，
  // 按 0 处理会把窗帘面板整块置灰（按钮与滑杆全禁用，用户还拿不到任何可自救的提示）。
  // 推断规则与后端 cover.py 的 inferred_cover_features 逐条对应：开/关/停一律放行，
  // 报过 current_position 才算支持定位，报过 current_tilt_position 才算支持叶片。
  // 于是「报不出能力位、但报了叶片角度」的梦幻帘，下面的 set_tilt_position 位会经推断成立 ——
  // 不必再单独认一遍属性（单独认反而会与后端分叉：设备**报了**能力位时，后端严格以位为准，
  // 漏了 tilt 位就拒绝 tilt 服务，前端若靠属性把滑杆放开，用户只会撞上 422）。
  const supportedFeatures = coverFeaturesOrInferred(attributes);
  // 240 = 16+32+64+128，即 HA 里全部 tilt（开合角度）相关能力位；
  // 只要有任意一位，或上报了叶片角度，就认为设备能调叶片。
  const hasTiltFeedback = coverReportsTilt(attributes, supportedFeatures);
  // 非梦幻帘的整体位置始终可信；梦幻帘只有拿到叶片反馈时才敢相信整体位置，
  // 否则宁可当作未知，交由动画走估算逻辑。
  const overallFeedbackAvailable = !isDreamCover || hasTiltFeedback;
  const normalizedState = overallFeedbackAvailable ? stateValue : "unknown";
  // 位置归一：能上报就用上报值并夹到 0–100；只报 closed 而无位置时按 0 处理；
  // 其余情况保持 null，让上层区分「真的是 0」和「不知道」。
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
  // 状态未知时一律视为不可用，避免动画对着未知状态乱动。
  const available =
    /^cover\.[a-z0-9_]+$/.test(entityId) &&
    stateObject.available !== false &&
    Object.hasOwn(STATE_LABELS, stateValue);
  // 位置不可用时的兜底姿态：由 state 文案给出的「已停稳那一端」的位置。
  // 不少设备只报 open / closed 而没有 current_position，梦幻帘的整体位置还会被刻意判为不可信；
  // 缺了它，3D 帘布只能停在配置默认值上，设备关着而帘布全开（或反之）就会长期不符。
  // 只认已停稳的两端：opening / closing 期间不猜，运动表现交给动画与乐观推算。
  // 必须放在 available 之后：这段判定的第一项就是可用性。
  const statePositionHint = !available
    ? null
    : stateValue === "open"
      ? 100
      : stateValue === "closed"
        ? 0
        : null;
  // 返回结构是窗帘动画与图标的内部契约：positionKnown 区分「位置为 0」与「位置未知」，
  // positionReported 表示位置来自 HA，closedConfirmed 要求可用 + 反馈可信 + 全关，on 未知时退回 state 判断。
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
    // null 表示状态本身也说不清，调用方应保持原姿态而不是硬摆一个值。
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
    // coverFeaturesOrInferred 按「上报过 current_tilt_position」推断出来；
    // 另外，若设备没有 tilt 反馈却支持设位置，说明位置属性其实就是叶片角度。
    bladeSupported:
      !!(supportedFeatures & COVER_FEATURE_SET_TILT_POSITION) ||
      (!hasTiltFeedback && !!(supportedFeatures & COVER_FEATURE_SET_POSITION))
  };
}
/**
 * 判断当前是否允许调整叶片角度：梦幻帘的叶片机构依赖整体完全关闭才安全，这里是一道门禁。
 */
export function coverCanAdjustBlades(state, presentation = state) {
  if (!state.available || !state.bladeSupported) {
    return false;
  } else if (state.overallFeedbackAvailable) {
    // 有可信反馈时只认「确认全关」；用户手动拖到 0 但尚未停止不算。
    return presentation.closedConfirmed === true;
  } else if (presentation.moving || ["opening", "closing"].includes(state.raw?.state)) {
    // 反馈不可信时，运动过程中一律禁止，防止叶片命令与整体运动打架。
    return false;
  } else {
    // 完全无反馈的最后兜底：位置是估算的且大于 0，就认为没关严，禁止调叶片。
    return !presentation.estimated || !(presentation.position > 0);
  }
}
/**
 * 构造窗帘控制命令。
 * @throws {Error} 设备不可用、不支持该操作，或梦幻帘状态下不允许调叶片、位置非法。
 */
export function coverControl(sourceState, service, value) {
  if (!sourceState.available) {
    throw new Error("窗帘当前不可用。");
  }
  // 服务名 → 状态对象上的能力字段；用白名单既能挡未知服务，
  // 也能在设备未声明该能力时给出统一的中文报错。
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
    // HA 只接受整数百分比；小数或越界值直接拒绝，避免设备侧静默忽略。
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
