const readEntityState = (stateSource, entityId) => {
    const resolvedEntityState = stateSource?.get?.(entityId) ?? stateSource?.[entityId];
    return resolvedEntityState?.newState ?? resolvedEntityState;
  },
  hasUsableState = (entityState) =>
    entityState &&
    entityState.available !== false &&
    entityState.state != null &&
    !["", "unknown", "unavailable", "none", "null"].includes(
      String(entityState.state).trim().toLowerCase(),
    );
export function carChargingMappingError(chargingStateConfig) {
  const rawStateValues = [chargingStateConfig?.inactive, chargingStateConfig?.active];
  return rawStateValues.some(
    (rawStateValue) => typeof rawStateValue != "string" || !rawStateValue.trim(),
  )
    ? "自定义时，请同时填写不充电和充电的原始状态值；两项都留空可恢复自动识别。"
    : rawStateValues.some(
          (rawStateText) => rawStateText.length > 120 || /[\r\n]/.test(rawStateText),
        )
      ? "每个输入框只填一个原始状态值，不超过 120 个字符。"
      : rawStateValues.some((normalizedStateValue) =>
            ["unknown", "unavailable", "none", "null"].includes(
              normalizedStateValue.trim().toLowerCase(),
            ),
          )
        ? "unknown、unavailable、none、null 表示未知或不可用，不能用作充电或不充电的状态值。"
        : chargingStateConfig.active.trim() === chargingStateConfig.inactive.trim()
          ? "充电和不充电的状态值不能相同。"
          : "";
}
const chargingStateLabels = {
  charging: "充电中",
  not_charging: "未充电",
  disconnected: "未连接",
  stopped: "已停止",
  complete: "充电完成",
  completed: "充电完成",
  paused: "充电暂停",
  idle: "空闲",
};
export function carState(carConfig, entityStateStore = {}) {
  const batteryState = readEntityState(entityStateStore, carConfig.batteryEntityId),
    chargingState = readEntityState(entityStateStore, carConfig.chargingEntityId),
    batteryLevel =
      hasUsableState(batteryState) &&
      /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(batteryState.state).trim())
        ? Number(batteryState.state)
        : NaN,
    unitOfMeasurement = batteryState?.attributes?.unit_of_measurement,
    isBatteryLevelValid =
      Number.isFinite(batteryLevel) &&
      batteryLevel >= 0 &&
      batteryLevel <= 100 &&
      (!unitOfMeasurement || unitOfMeasurement === "%"),
    chargingStateMapping = carConfig.chargingStates,
    rawChargingState = hasUsableState(chargingState) ? String(chargingState.state).trim() : "",
    isBinarySensor = carConfig.chargingEntityId?.startsWith("binary_sensor."),
    normalizedChargingState = rawChargingState.toLowerCase(),
    isCharging = rawChargingState
      ? chargingStateMapping
        ? carChargingMappingError(chargingStateMapping)
          ? null
          : rawChargingState === chargingStateMapping.active.trim()
            ? true
            : rawChargingState === chargingStateMapping.inactive.trim()
              ? false
              : null
        : isBinarySensor
          ? normalizedChargingState === "on"
            ? true
            : normalizedChargingState === "off"
              ? false
              : null
          : ["charging", "充电中", "正在充电"].includes(normalizedChargingState)
            ? true
            : [
                  "not_charging",
                  "disconnected",
                  "stopped",
                  "complete",
                  "completed",
                  "paused",
                  "idle",
                  "未充电",
                  "充电完成",
                  "未连接",
                  "充电暂停",
                ].includes(normalizedChargingState)
              ? false
              : null
      : null,
    isChargingUnavailable =
      chargingState?.available === false ||
      String(chargingState?.state).trim().toLowerCase() === "unavailable",
    chargingStatusText = rawChargingState
      ? isBinarySensor && isCharging !== null
        ? isCharging
          ? "充电中"
          : "未充电"
        : !chargingStateMapping && Object.hasOwn(chargingStateLabels, normalizedChargingState)
          ? chargingStateLabels[normalizedChargingState]
          : rawChargingState
      : isChargingUnavailable
        ? "充电状态不可用"
        : "充电状态未知";
  return {
    battery: isBatteryLevelValid ? batteryLevel : null,
    batteryAvailable: isBatteryLevelValid,
    charging: isCharging,
    chargingRaw: rawChargingState,
    available: isBatteryLevelValid || !!rawChargingState,
    on: isCharging === true,
    batteryText: isBatteryLevelValid ? Math.round(batteryLevel * 10) / 10 + "%" : "—",
    status: chargingStatusText,
  };
}
export function standardCarBindings(entities = []) {
  const findEntityId = (entityDomain, deviceClass) => {
    const matchingEntities = entities.filter(
      (entityConfig) =>
        entityConfig.entityId?.startsWith(entityDomain + ".") &&
        entityConfig.attributes?.device_class === deviceClass &&
        entityConfig.enabled !== false &&
        !entityConfig.disabledBy &&
        !entityConfig.disabled_by &&
        !["missing", "disabled"].includes(entityConfig.status),
    );
    return matchingEntities.length === 1 ? matchingEntities[0].entityId : "";
  };
  return {
    batteryEntityId: findEntityId("sensor", "battery"),
    chargingEntityId: findEntityId("binary_sensor", "battery_charging"),
  };
}
