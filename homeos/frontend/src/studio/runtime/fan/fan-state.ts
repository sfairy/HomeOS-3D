/** 0.7.2 fan / ceiling-fan runtime state helper. */

const isAvailableRecord = (record: any) =>
  record &&
  record.disabledBy == null &&
  record.disabled_by == null &&
  record.enabled !== false &&
  !["missing", "disabled"].includes(String(record.status || "").toLowerCase());

function readEntityState(stateSource: any, entityId: any) {
  if (!entityId) return null;
  const entry =
    stateSource instanceof Map ? stateSource.get(entityId) : stateSource?.[entityId];
  return entry?.newState || entry || null;
}

function finiteNumber(raw: unknown, fallback: number | null = null) {
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function isBinaryOnOff(entityState: any) {
  return !!(
    entityState &&
    entityState.available !== false &&
    ["on", "off"].includes(entityState.state)
  );
}

function appearanceVisualMode(binding: any = {}) {
  if (binding?.visualMode === "ceiling" || binding?.visualMode === "tower") {
    return binding.visualMode;
  }
  return binding?.modelType === "ceiling-fan" ? "ceiling" : "tower";
}

/**
 * 动画来源实体必须属于当前绑定设备，且已勾进附加功能。
 * kind: run | speed | direction
 */
export function fanSourceAllowed(
  kind: "run" | "speed" | "direction",
  entity: any,
  binding: any = {},
  deviceId: string | null | undefined,
) {
  const entityId = entity?.entityId || entity?.entity_id || "";
  const domain = String(entityId).split(".")[0];
  const entityDeviceId = entity?.deviceId || entity?.device_id;
  if (
    !deviceId ||
    entityDeviceId !== deviceId ||
    !binding?.extraControls?.some((extra: any) => extra?.entityId === entityId) ||
    !isAvailableRecord(entity)
  ) {
    return false;
  }
  if (kind === "run") {
    return ["switch", "input_boolean", "fan", "binary_sensor"].includes(domain);
  }
  if (kind === "direction") {
    return ["switch", "input_boolean", "select", "input_select"].includes(domain);
  }
  if (kind !== "speed" || !["number", "input_number"].includes(domain)) return false;
  const attributes = entity?.attributes || {};
  const min = finiteNumber(attributes.min);
  const max = finiteNumber(attributes.max);
  const step = finiteNumber(attributes.step ?? 1);
  return (
    [undefined, null, "", "%"].includes(attributes.unit_of_measurement) &&
    min !== null &&
    max !== null &&
    step != null &&
    step > 0 &&
    min >= 0 &&
    max > min
  );
}

/** Normalize HA fan / switch / input_* into a visual motion state (0.7.2 fanBindingState). */
export function fanMotionState(entityState: any, binding: any = {}) {
  // Legacy single-entity path used by unbound model preview.
  entityState = entityState?.newState || entityState || {};
  const attributes = entityState.attributes || {};
  const isOn =
    entityState.available !== false &&
    (entityState.state === "on" ||
      entityState.state === "running" ||
      (typeof attributes.percentage === "number" && attributes.percentage > 0));
  let speedPercentage =
    typeof attributes.percentage === "number" && Number.isFinite(attributes.percentage)
      ? Math.max(0, Math.min(100, attributes.percentage))
      : 40;
  let direction = attributes.direction === "reverse" ? -1 : 1;
  const oscillating =
    isOn &&
    (attributes.oscillating === true ||
      String(attributes.oscillating || "").toLowerCase() === "true");
  const running = !!(isOn && speedPercentage > 0);
  return {
    available: entityState.available !== false && !!entityState.state,
    on: !!isOn,
    running,
    percentage: speedPercentage,
    oscillating,
    direction,
    directionKnown: attributes.direction === "forward" || attributes.direction === "reverse",
    visualMode: appearanceVisualMode(binding),
    label: isOn ? (speedPercentage > 0 ? "运行中" : "已开启 · 风速为 0") : "已关闭",
  };
}

/** Resolve fan binding extras (speed / direction / run / reverseState) against a state map. */
export function resolveFanBindingState(binding: any = {}, stateSource: any = {}) {
  const primary = readEntityState(stateSource, binding.entityId);
  const runState =
    readEntityState(stateSource, binding.runEntityId || binding.entityId) || primary;
  const primaryAttributes = primary?.attributes || {};
  let percentage: number | null = Number.isFinite(primaryAttributes.percentage)
    ? Math.max(0, Math.min(100, Number(primaryAttributes.percentage)))
    : null;
  let directionKnown =
    primaryAttributes.direction === "forward" || primaryAttributes.direction === "reverse";
  let direction = primaryAttributes.direction === "reverse" ? -1 : 1;
  let speedOk = true;

  const powerAvailable = isBinaryOnOff(runState);
  const powerOn = powerAvailable && runState.state === "on";

  if (binding.speedEntityId) {
    const speedState = readEntityState(stateSource, binding.speedEntityId);
    const speedAttributes = speedState?.attributes || {};
    const min = finiteNumber(speedAttributes.min);
    const max = finiteNumber(speedAttributes.max);
    const value = finiteNumber(speedState?.state);
    speedOk = !!(
      speedState &&
      speedState.available !== false &&
      value !== null &&
      min !== null &&
      min >= 0 &&
      max != null &&
      max > min &&
      value >= min &&
      value <= max &&
      [undefined, null, "", "%"].includes(speedAttributes.unit_of_measurement)
    );
    percentage = speedOk && max != null ? Math.max(0, Math.min(100, (value! / max) * 100)) : null;
  } else if (percentage === null && Number.isFinite(primaryAttributes.percentage)) {
    percentage = Math.max(0, Math.min(100, Number(primaryAttributes.percentage)));
  } else if (percentage === null) {
    percentage = 40;
  }

  if (binding.directionEntityId) {
    const directionState = readEntityState(stateSource, binding.directionEntityId);
    const domain = String(binding.directionEntityId).split(".")[0];
    const options = ["switch", "input_boolean"].includes(domain)
      ? ["on", "off"]
      : directionState?.attributes?.options;
    directionKnown = !!(
      directionState &&
      directionState.available !== false &&
      binding.reverseState &&
      Array.isArray(options) &&
      options.includes(binding.reverseState) &&
      options.includes(directionState.state)
    );
    direction =
      directionKnown && directionState.state === binding.reverseState ? -1 : 1;
  }

  const directionOk = !binding.directionEntityId || directionKnown;
  const running = !!(
    powerOn &&
    speedOk &&
    directionOk &&
    (percentage === null || percentage > 0)
  );

  let label = "状态未知";
  if (powerAvailable) {
    if (!powerOn) label = "已关闭";
    else if (!speedOk) label = "风速不可用";
    else if (!directionOk) label = "方向不可用";
    else if (running) label = "运行中";
    else label = "已开启 · 风速为 0";
  }

  return {
    available: powerAvailable,
    on: powerOn,
    running,
    percentage,
    direction,
    directionKnown,
    oscillating: !!(powerOn && primaryAttributes.oscillating === true),
    visualMode: appearanceVisualMode(binding),
    label,
  };
}

export function fanStatusLabel(state: ReturnType<typeof resolveFanBindingState> | null) {
  return state?.label || "状态未知";
}

export function isFanEntityCandidate(entity: any) {
  if (!isAvailableRecord(entity)) return false;
  const entityId = String(entity.entityId || entity.entity_id || "");
  return /^(fan|switch|input_boolean|input_number|input_select|select|binary_sensor|number)\.[a-z0-9_]+$/.test(
    entityId,
  );
}

/** Options for reverseState select given a direction entity id + live state. */
export function fanReverseStateOptions(directionEntityId: string, directionState: any) {
  const domain = String(directionEntityId || "").split(".")[0];
  if (["switch", "input_boolean"].includes(domain)) {
    return [
      ["on", "开启时反转"],
      ["off", "关闭时反转"],
    ] as [string, string][];
  }
  const options = directionState?.attributes?.options;
  if (Array.isArray(options)) {
    return options
      .filter((option: unknown) => typeof option === "string")
      .map((option: string) => [option, option] as [string, string]);
  }
  return [] as [string, string][];
}
