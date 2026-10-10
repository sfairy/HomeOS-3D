import { attributesOf, haNumber } from "../device/entity-capabilities";
import {
  airerVisualPosition,
  normalizeAirerDirection,
} from "../airer/airer-direction";
/** HA 窗帘能力位（与 0.6.5 cover-features 同口径）。 */
const COVER_FEATURE_OPEN = 1,
  COVER_FEATURE_CLOSE = 2,
  COVER_FEATURE_SET_POSITION = 4,
  COVER_FEATURE_STOP = 8,
  COVER_FEATURE_SET_TILT_POSITION = 128,
  /** 240 = 16+32+64+128：HA 里全部 tilt（开合角度）相关能力位的并集。 */
  COVER_TILT_FEATURE_MASK = 240;
/**
 * 取窗帘能力位；设备**从不**上报 `supported_features` 时，按它已经报出来的状态推断。
 */
function coverFeaturesOrInferred(attributes: any) {
  const reportedFeatures = haNumber(attributes?.supported_features);
  if (reportedFeatures !== null)
    return Number.isSafeInteger(reportedFeatures) && reportedFeatures >= 0 ? reportedFeatures : 0;
  let inferredFeatures = COVER_FEATURE_OPEN | COVER_FEATURE_CLOSE | COVER_FEATURE_STOP;
  if (haNumber(attributes?.current_position) !== null)
    inferredFeatures |= COVER_FEATURE_SET_POSITION;
  if (haNumber(attributes?.current_tilt_position) !== null)
    inferredFeatures |= COVER_FEATURE_SET_TILT_POSITION;
  return inferredFeatures;
}
/** 是否有叶片反馈证据：上报了 current_tilt_position，或置起了任意一个 tilt 能力位。 */
function coverReportsTilt(attributes: any, features: number) {
  return haNumber(attributes?.current_tilt_position) !== null || !!(features & COVER_TILT_FEATURE_MASK);
}
const stateLabelByState = {
    open: "已打开",
    closed: "已关闭",
    opening: "正在打开",
    closing: "正在关闭",
  };
export function coverStateLabel(stateKey: any, options: { airer?: boolean } = {}) {
  if (options.airer) {
    const airerLabelByState = {
      open: "已放下",
      closed: "已收起",
      opening: "正在放下",
      closing: "正在收起",
    };
    return Object.hasOwn(airerLabelByState, stateKey)
      ? (airerLabelByState as any)[stateKey]
      : Object.hasOwn(stateLabelByState, stateKey)
        ? (stateLabelByState as any)[stateKey]
        : "设备不可用";
  }
  return Object.hasOwn(stateLabelByState, stateKey) ? (stateLabelByState as any)[stateKey] : "设备不可用";
}
/** 对齐 0.7.2 airerState：positionReversed + liftReversed 交换 opening/capabilities。 */
export function airerState(coverStatus: any, binding: any = {}) {
  const direction = normalizeAirerDirection(binding);
  const source = coverStatus?.airerAdapted
    ? {
        position: coverStatus.devicePosition,
        opening: coverStatus.deviceOpening,
        closing: coverStatus.deviceClosing,
        openSupported: coverStatus.deviceOpenSupported,
        closeSupported: coverStatus.deviceCloseSupported,
      }
    : coverStatus;
  const visualPosition = airerVisualPosition(source.position, binding);
  const opening = direction.liftReversed ? source.closing : source.opening;
  const closing = direction.liftReversed ? source.opening : source.closing;
  return {
    ...coverStatus,
    airerAdapted: true,
    devicePosition: source.position,
    deviceOpening: source.opening,
    deviceClosing: source.closing,
    deviceOpenSupported: source.openSupported,
    deviceCloseSupported: source.closeSupported,
    position: visualPosition,
    visualPosition,
    opening,
    closing,
    moving: !!(opening || closing),
    openSupported: direction.liftReversed ? source.closeSupported : source.openSupported,
    closeSupported: direction.liftReversed ? source.openSupported : source.closeSupported,
  };
}
export function coverIconIsOn(component: any, coverFeedback: any) {
  if (!coverFeedback?.available) return false;
  const isAirer = !!(component?.airer || component?.coverKind === "airer");
  // 0.7.2：晾衣架 unknown 时图标不亮
  if (isAirer && coverFeedback.state === "unknown") return false;
  const adapted = isAirer ? airerState(coverFeedback, component) : coverFeedback;
  const isCoverOn = isAirer
    ? adapted.closing ||
      (adapted.position !== null && adapted.position !== undefined
        ? adapted.position < 100
        : false)
    : coverFeedback.on;
  return !!(component?.iconStateReversed === true ? !isCoverOn : isCoverOn);
}
export function coverState(entityId: any, stateChange: any, options: { coverKind?: string } = {}) {
  const rawState = stateChange?.newState || stateChange || {},
    stateAttributes = attributesOf(rawState),
    normalizedState = String(rawState.state || "")
      .trim()
      .toLowerCase(),
    currentPosition = haNumber(stateAttributes.current_position),
    currentTiltPosition = haNumber(stateAttributes.current_tilt_position),
    isDreamCover = options.coverKind === "dream",
    supportedFeatures = coverFeaturesOrInferred(stateAttributes),
    hasTiltFeedback = coverReportsTilt(stateAttributes, supportedFeatures),
    // 设备自报的「已完全合拢」布尔位（HA 语义：current_position === 0 时为 true）。
    reportedClosed = stateAttributes.is_closed === true,
    // 实测（乐屋/dream 帘 + 小米网关一路，supported_features=15，无 tilt 能力位）两端终态的实体属性：
    //   全关：state="closed"  is_closed=true   current_position=0
    //   全开：state="open"    is_closed=false  current_position=100
    //   （另有 device_class="curtain"、friendly_name、supported_features=15，与开合无关）
    // 注意 is_closed 只有 true / false 两个取值，没有 "open" 这种文案：开=is_closed:false，
    // 所以「全开」只能由 state="open" 表态，「全关」则 state="closed" 与 is_closed=true 都算。
    // is_closed=true 与 state="opening" 同时出现属于自相矛盾，以「正在开启」为准。
    settledClosedByDevice =
      normalizedState !== "opening" && (normalizedState === "closed" || reportedClosed),
    settledOpenByDevice = normalizedState === "open",
    // 瞬态（opening / closing）先原样采信：实体确实在走行程时必须如实显示「整体正在开启 / 整体正在关闭」，
    // 右上角图标也据此播开合动画，不能一律吞成「在线」。
    // 但这台电机既会在真正运行时连续上报瞬态（实测约 2–4s 一次），也会把瞬态压在 closing/opening 上
    // 数十分钟不回收（实测一次卡了 37 分钟），单看某一帧快照无法区分。区分靠时间：交给反馈层看门狗
    // （cover-feedback.ts 的 stalled）——位置长时间零推进且没有在途动画时，把这一轮瞬态降级为 unknown，
    // 卡片回落「在线」，图标停动画。
    isTransientState = normalizedState === "opening" || normalizedState === "closing",
    // 梦幻帘由「整体轨道 + 叶片」两套机构组成，整体反馈往往不可信：拿到独立叶片反馈
    // （current_tilt_position 或 tilt 能力位）才敢相信；拿不到时至少要有终态证据或瞬态证据。
    hasOverallFeedback =
      !isDreamCover ||
      hasTiltFeedback ||
      settledClosedByDevice ||
      settledOpenByDevice ||
      isTransientState,
    normalizedRailState = settledClosedByDevice
      ? "closed"
      : settledOpenByDevice
        ? "open"
        : normalizedState,
    effectiveState = hasOverallFeedback ? normalizedRailState : "unknown",
    // 可信时位置取设备上报值；全关位缺位置时按 0 兜底（statePositionHint 同口径）。
    // 瞬态缺位置不猜端点：电机没报行程就别摆位，交给乐观预览。
    effectivePosition = hasOverallFeedback
      ? settledClosedByDevice
        ? 0
        : currentPosition === null
          ? normalizedState === "closed"
            ? 0
            : null
          : Math.max(0, Math.min(100, currentPosition))
      : null,
    computedTiltPosition = hasTiltFeedback ? currentTiltPosition : currentPosition,
    isKnownRailState = Object.hasOwn(stateLabelByState, normalizedState),
    isBoundCover = /^cover\.[a-z0-9_]+$/.test(entityId) && rawState.available !== false,
    // 0.7.2：晾衣架需具备 open/close/stop（features & 0xb），且
    // available!==false 或 availabilityReason==='unknown'（状态 unknown 亦可交互）
    isAirerDevice = !!(options as any).airer || options.coverKind === "airer",
    isAvailable = isAirerDevice
      ? /^cover\.[a-z0-9_]+$/.test(entityId) &&
        normalizedState !== "unavailable" &&
        !!(supportedFeatures! & 0xb) &&
        (rawState.available !== false ||
          rawState.availabilityReason === "unknown" ||
          (rawState as any).availability_reason === "unknown")
      : isBoundCover && isKnownRailState;
  return {
    entityId: entityId,
    raw: rawState,
    available: isAvailable,
    dream: isDreamCover,
    overallFeedbackAvailable: hasOverallFeedback,
    name: String(stateAttributes.friendly_name || entityId || "窗帘"),
    state: effectiveState,
    position: effectivePosition,
    positionKnown: effectivePosition !== null,
    positionReported: hasOverallFeedback && currentPosition !== null,
    // 位置缺失时的兜底姿态（0 / 100 / null）：设备只报 opened / closed 而没报 current_position 时，
    // 仍能让 3D 窗帘动画摆到对应那一端，而不是一律当作全关。
    // 同样只认「可信的整体反馈」：梦幻帘拿不到叶片反馈时整体状态整个不可信，连摆位也不猜，
    // 轨道只跟随用户的乐观预览，避免把已关闭的帘摆成开启。
    statePositionHint:
      isAvailable && hasOverallFeedback
        ? normalizedRailState === "open"
          ? 100
          : normalizedRailState === "closed"
            ? 0
            : null
        : null,
    features: supportedFeatures,
    closedConfirmed:


      isAvailable && effectiveState === "closed" && effectivePosition === 0,
    tiltPosition:
      computedTiltPosition === null ? null : Math.max(0, Math.min(100, computedTiltPosition)),
    tiltPositionKnown: computedTiltPosition !== null,
    opening: isAvailable && effectiveState === "opening",
    closing: isAvailable && effectiveState === "closing",
    moving: isAvailable && ["opening", "closing"].includes(effectiveState),
    on:
      isAvailable &&
      (effectiveState === "opening" ||
        (effectivePosition !== null ? effectivePosition > 0 : effectiveState === "open")),
    openSupported:
      !!(supportedFeatures! & COVER_FEATURE_OPEN) ||
      (isAirerDevice && !isKnownRailState && isAvailable),
    closeSupported:
      !!(supportedFeatures! & COVER_FEATURE_CLOSE) ||
      (isAirerDevice && !isKnownRailState && isAvailable),
    positionSupported:
      !!(supportedFeatures! & COVER_FEATURE_SET_POSITION) ||
      (isAirerDevice && !isKnownRailState && isAvailable),
    stopSupported:
      !!(supportedFeatures! & COVER_FEATURE_STOP) ||
      (isAirerDevice && !isKnownRailState && isAvailable),
    tiltSupported: !!(supportedFeatures! & COVER_FEATURE_SET_TILT_POSITION),
    tiltOpenSupported: !!(supportedFeatures! & 16),
    tiltCloseSupported: !!(supportedFeatures! & 32),
    tiltStopSupported: !!(supportedFeatures! & 64),
    // 叶片可调能力：声明了 set_tilt_position 位即可 —— 设备不报能力位时，该位由
    // coverFeaturesOrInferred 从 current_tilt_position 推断出来。
    bladeSupported:
      !!(supportedFeatures! & COVER_FEATURE_SET_TILT_POSITION) ||
      (!hasTiltFeedback && !!(supportedFeatures! & COVER_FEATURE_SET_POSITION)),
  };
}
export function coverCanAdjustBlades(coverStatus: any, estimatedStatus = coverStatus) {
  if (
    !coverStatus.available ||
    !(coverStatus.bladeSupported || coverStatus.tiltOpenSupported || coverStatus.tiltCloseSupported)
  )
    return false;
  // 普通窗帘的滑杆就是整体开合位置，有位置能力即可调。
  if (!coverStatus.dream) return true;
  // 拿不到独立叶片反馈的梦幻帘：整体位置就是唯一可调轴（它同时承担叶片角度），
  // 不做「必须停在两端」的门禁 —— 否则中间位置会把滑杆整根禁掉，用户无路可走。
  if (!coverStatus.overallFeedbackAvailable) return true;
  // 有独立叶片反馈时：运动过程中（含轨道在途 / 乐观预览）一律不许调叶片，否则界面会先
  // 「到位」放行滑杆，而后端此刻仍认为轨道在运行，下发就被拒。必须等 HA 真的报停稳。
  if (estimatedStatus?.moving || estimatedStatus?.opening || estimatedStatus?.closing) return false;
  // 停稳后，轨道还得停在「全开」或「全关」两端；停在中间位置时滑杆禁用（置灰）。
  // 位置优先取设备自报值：presentation 里的位置可能还在做收尾平滑动画
  // （设备已经报了 60，动画还停在 100），拿动画值判断会把「半开」误判成「全开」而错误放行。
  const settledPosition =
    (coverStatus.positionKnown ? coverStatus.position : null) ??
    estimatedStatus?.position ??
    (estimatedStatus?.state === "open" ? 100 : estimatedStatus?.state === "closed" ? 0 : null);
  return settledPosition === 0 || settledPosition === 100;
}
export function coverControl(coverDevice: any, serviceName: any, targetPosition: any) {
  if (!coverDevice.available) throw new Error("窗帘当前不可用。");
  const capabilityKey = ({
    open_cover: "openSupported",
    close_cover: "closeSupported",
    stop_cover: "stopSupported",
    set_cover_position: "positionSupported",
    set_cover_tilt_position: "tiltSupported",
    open_cover_tilt: "tiltOpenSupported",
    close_cover_tilt: "tiltCloseSupported",
    stop_cover_tilt: "tiltStopSupported",
  } as any)[serviceName];
  // 晾衣架状态未知时 supported_features 可能尚未回报：仍允许 open/close/stop
  const allowAirerUnknown =
    coverDevice.state === "unknown" &&
    ["open_cover", "close_cover", "stop_cover", "set_cover_position"].includes(serviceName);
  if (!capabilityKey || (!coverDevice[capabilityKey] && !allowAirerUnknown))
    throw new Error("设备不支持此窗帘操作。");
  if (
    coverDevice.dream &&
    [
      "set_cover_position",
      "set_cover_tilt_position",
      "open_cover_tilt",
      "close_cover_tilt",
    ].includes(serviceName) &&
    !coverCanAdjustBlades(coverDevice)
  )
    throw new Error("只有整体完全开启或完全关闭后，才能调整叶片。");
  let serviceData: Record<string, any> = {};
  if (serviceName === "set_cover_position" || serviceName === "set_cover_tilt_position") {
    const parsedPosition = haNumber(targetPosition);
    if (!Number.isInteger(parsedPosition) || parsedPosition! < 0 || parsedPosition! > 100)
      throw new Error("目标位置必须是 0–100 之间的整数。");
    serviceData =
      serviceName === "set_cover_tilt_position"
        ? {
            tilt_position: parsedPosition,
          }
        : {
            position: parsedPosition,
          };
  }
  return {
    entityId: coverDevice.entityId,
    domain: "cover",
    service: serviceName,
    data: serviceData,
  };
}
