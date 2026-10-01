const resolveFiniteNumber = (numericValue) =>
  typeof numericValue == "number" && Number.isFinite(numericValue) ? numericValue : null;
export function waterHeaterCapabilities(entityState) {
  const stateAttributes = entityState?.attributes || {},
    hasSupportedFeatures = Object.hasOwn(stateAttributes, "supported_features"),
    isFeatureSupported = (featureFlag, isSupportedByDefault = false) =>
      hasSupportedFeatures
        ? Number.isInteger(stateAttributes.supported_features) &&
          stateAttributes.supported_features >= 0 &&
          !!(stateAttributes.supported_features & featureFlag)
        : isSupportedByDefault,
    operationModes = [
      ...new Set(
        (Array.isArray(stateAttributes.operation_list)
          ? stateAttributes.operation_list
          : []
        ).filter((modeName) => typeof modeName == "string" && modeName.trim() && modeName !== "空"),
      ),
    ],
    minimumTemperature = resolveFiniteNumber(stateAttributes.min_temp),
    maximumTemperature = resolveFiniteNumber(stateAttributes.max_temp),
    temperatureStep =
      stateAttributes.target_temp_step == null
        ? 0.5
        : resolveFiniteNumber(stateAttributes.target_temp_step),
    isOperationSupported = isFeatureSupported(2, operationModes.length > 0),
    hasNativePower = isFeatureSupported(8),
    turnOnModes = operationModes.filter((candidateMode) => candidateMode !== "off");
  return {
    available:
      !!entityState?.state &&
      entityState.available !== false &&
      !["unknown", "unavailable"].includes(entityState.state),
    temperature: resolveFiniteNumber(stateAttributes.temperature),
    currentTemperature: resolveFiniteNumber(stateAttributes.current_temperature),
    minimum: minimumTemperature,
    maximum: maximumTemperature,
    step: temperatureStep,
    unit: ["°C", "°F", "K"].includes(stateAttributes.temperature_unit)
      ? stateAttributes.temperature_unit
      : ["°C", "°F", "K"].includes(stateAttributes.unit_of_measurement)
        ? stateAttributes.unit_of_measurement
        : "°",
    temperatureSupported:
      isFeatureSupported(1, resolveFiniteNumber(stateAttributes.temperature) !== null) &&
      minimumTemperature !== null &&
      maximumTemperature !== null &&
      minimumTemperature < maximumTemperature &&
      temperatureStep > 0,
    operationSupported: isOperationSupported,
    modes: isOperationSupported ? operationModes : [],
    nativePower: hasNativePower,
    canTurnOff: hasNativePower || (isOperationSupported && operationModes.includes("off")),
    canTurnOn: hasNativePower || (isOperationSupported && turnOnModes.length > 0),
    awaySupported: isFeatureSupported(4),
    away: stateAttributes.away_mode === true || stateAttributes.away_mode === "on",
  };
}
export function waterHeaterPowerCommand(powerEntityState, shouldTurnOn, requestedMode = "") {
  const heaterCapabilities = waterHeaterCapabilities(powerEntityState);
  if (!heaterCapabilities.available) throw new Error("热水器当前不可用。");
  if (heaterCapabilities.nativePower)
    return {
      domain: "water_heater",
      service: shouldTurnOn ? "turn_on" : "turn_off",
      data: {},
    };
  const selectableModes = heaterCapabilities.modes.filter(
      (selectableMode) => selectableMode !== "off",
    ),
    selectedOperationMode = shouldTurnOn
      ? selectableModes.includes(requestedMode)
        ? requestedMode
        : selectableModes.length === 1
          ? selectableModes[0]
          : ""
      : heaterCapabilities.modes.includes("off")
        ? "off"
        : "";
  if (!selectedOperationMode)
    throw new Error(
      shouldTurnOn && selectableModes.length > 1
        ? "请选择要开启的运行模式。"
        : "热水器未提供此开关能力。",
    );
  return {
    domain: "water_heater",
    service: "set_operation_mode",
    data: {
      operation_mode: selectedOperationMode,
    },
  };
}
export function waterHeaterCommandConfirmed(confirmedCommand, checkedEntityState) {
  const entityCapabilities = waterHeaterCapabilities(checkedEntityState);
  if (!entityCapabilities.available) return false;
  const currentOperationMode =
    checkedEntityState.attributes?.operation_mode || checkedEntityState.state;
  switch (confirmedCommand.service) {
    case "turn_on":
      return checkedEntityState.state !== "off";
    case "turn_off":
      return checkedEntityState.state === "off";
    case "set_operation_mode":
      return currentOperationMode === confirmedCommand.data.operation_mode;
    case "set_away_mode":
      return (
        (checkedEntityState.attributes?.away_mode === "on" ||
          checkedEntityState.attributes?.away_mode === true) === confirmedCommand.data.away_mode &&
        checkedEntityState.attributes?.away_mode != null
      );
    case "set_temperature":
      return (
        entityCapabilities.temperature !== null &&
        Math.abs(entityCapabilities.temperature - confirmedCommand.data.temperature) <=
          Math.max(0.001, (entityCapabilities.step || 0.5) / 100)
      );
    default:
      return false;
  }
}
export function createWaterHeaterFeedback({
  onChange: onStatusChange = () => {},
  timeout: responseTimeoutMs = 10000,
  schedule: scheduleTimeout = setTimeout,
  cancel: cancelTimeout = clearTimeout,
} = {}) {
  const pendingCommandsByMode = new Map();
  let isDisposed = false;
  const resolveCommandKey = (serviceCommand) =>
      ["turn_on", "turn_off", "set_operation_mode"].includes(serviceCommand.service)
        ? "mode"
        : serviceCommand.service,
    emitFeedback = (feedbackMessage) => {
      isDisposed || onStatusChange(feedbackMessage);
    },
    clearPendingCommand = (commandRecord) => {
      (cancelTimeout(commandRecord.timer),
        pendingCommandsByMode.get(commandRecord.key) === commandRecord &&
          pendingCommandsByMode.delete(commandRecord.key));
    };
  return {
    begin(requestedCommand) {
      const commandKey = resolveCommandKey(requestedCommand);
      pendingCommandsByMode.has(commandKey) &&
        clearPendingCommand(pendingCommandsByMode.get(commandKey));
      const pendingCommandRecord = {
        key: commandKey,
        command: requestedCommand,
      };
      return (
        pendingCommandsByMode.set(commandKey, pendingCommandRecord),
        emitFeedback(""),
        pendingCommandRecord
      );
    },
    sent(sentCommandRecord) {
      isDisposed ||
        pendingCommandsByMode.get(sentCommandRecord.key) !== sentCommandRecord ||
        (emitFeedback(""),
        (sentCommandRecord.timer = scheduleTimeout(() => {
          isDisposed ||
            pendingCommandsByMode.get(sentCommandRecord.key) !== sentCommandRecord ||
            (clearPendingCommand(sentCommandRecord), emitFeedback("设备未响应，请重试"));
        }, responseTimeoutMs)),
        sentCommandRecord.timer?.unref?.());
    },
    fail(failedCommandRecord, failureMessage) {
      isDisposed ||
        pendingCommandsByMode.get(failedCommandRecord.key) !== failedCommandRecord ||
        (clearPendingCommand(failedCommandRecord),
        emitFeedback(failureMessage || "设备控制失败，请重试"));
    },
    sync(syncEntityState) {
      if (isDisposed || !pendingCommandsByMode.size) return;
      if (!waterHeaterCapabilities(syncEntityState).available) {
        for (const offlineCommandRecord of pendingCommandsByMode.values())
          cancelTimeout(offlineCommandRecord.timer);
        (pendingCommandsByMode.clear(), emitFeedback("设备已离线，操作结果未确认"));
        return;
      }
      let hasConfirmedCommand = false;
      for (const syncCommandRecord of [...pendingCommandsByMode.values()])
        waterHeaterCommandConfirmed(syncCommandRecord.command, syncEntityState) &&
          (clearPendingCommand(syncCommandRecord), (hasConfirmedCommand = true));
      hasConfirmedCommand && emitFeedback("");
    },
    dispose() {
      isDisposed = true;
      for (const disposeCommandRecord of pendingCommandsByMode.values())
        cancelTimeout(disposeCommandRecord.timer);
      pendingCommandsByMode.clear();
    },
  };
}
