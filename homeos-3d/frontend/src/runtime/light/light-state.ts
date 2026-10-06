const {
    lightSupportsColor: lightSupportsColor,
    lightColorRgb: lightColorRgb,
    lightColorHs: lightColorHs,
    lightColorServiceData: buildColorServicePayload,
    lightRealtimeCapabilities: lightRealtimeCapabilities,
    hsToRgbColor: j,
  } = await (import("@app/renderer/controls/light-runtime")),
  isColorHsPair = (colorHsCandidate) =>
    Array.isArray(colorHsCandidate) &&
    colorHsCandidate.length === 2 &&
    colorHsCandidate.every(
      (hsComponent) => typeof hsComponent == "number" && Number.isFinite(hsComponent),
    ) &&
    colorHsCandidate[0] >= 0 &&
    colorHsCandidate[0] <= 360 &&
    colorHsCandidate[1] >= 0 &&
    colorHsCandidate[1] <= 100;
export { j as hsToRgbColor };
const isNumericValue = (candidateValue) =>
    candidateValue != null && candidateValue !== "" && Number.isFinite(Number(candidateValue)),
  colorModeSet = new Set([
    "hs",
    "xy",
    "rgb",
    "rgbw",
    "rgbww",
    "white",
    "brightness",
    "onoff",
    "unknown",
  ]);
export function lightState(entityId, entityState, fallbackState = null) {
  const stateObject = entityState?.newState || entityState || {},
    attributes = stateObject.attributes || {},
    supportedColorModes = Array.isArray(attributes.supported_color_modes)
      ? attributes.supported_color_modes
      : [],
    isLightDomain = entityId.startsWith("light."),
    colorSupported =
      isLightDomain &&
      (supportedColorModes.length
        ? lightSupportsColor(attributes)
        : lightSupportsColor(attributes) || fallbackState?.colorSupported === true),
    colorRgb = (colorSupported && (lightColorRgb(attributes) || fallbackState?.colorRgb)) || null,
    colorHs = (colorSupported && (lightColorHs(attributes) || fallbackState?.colorHs)) || null,
    colorMode =
      isLightDomain &&
      (attributes.color_mode === "color_temp" || colorModeSet.has(attributes.color_mode))
        ? attributes.color_mode
        : (fallbackState?.colorMode ?? null),
    realtimeCapabilities = lightRealtimeCapabilities(entityId, stateObject),
    brightnessSupported =
      isLightDomain &&
      (realtimeCapabilities.brightness ||
        (!supportedColorModes.length && fallbackState?.brightnessSupported === true)),
    temperatureSupported =
      isLightDomain &&
      (realtimeCapabilities.colorTemperature ||
        (!supportedColorModes.length && fallbackState?.temperatureSupported === true)),
    capabilitiesKnown =
      supportedColorModes.length > 0 ||
      isNumericValue(attributes.brightness) ||
      isNumericValue(attributes.color_temp_kelvin) ||
      isNumericValue(attributes.color_temp) ||
      isNumericValue(attributes.min_color_temp_kelvin) ||
      isNumericValue(attributes.max_color_temp_kelvin) ||
      (Number(attributes.supported_features) & 3) !== 0 ||
      fallbackState?.capabilitiesKnown === true,
    minimumKelvin = isNumericValue(attributes.min_color_temp_kelvin)
      ? Number(attributes.min_color_temp_kelvin)
      : Number(attributes.max_mireds) > 0
        ? 1000000 / Number(attributes.max_mireds)
        : (fallbackState?.minimum ?? 2000),
    maximumKelvin = isNumericValue(attributes.max_color_temp_kelvin)
      ? Number(attributes.max_color_temp_kelvin)
      : Number(attributes.min_mireds) > 0
        ? 1000000 / Number(attributes.min_mireds)
        : (fallbackState?.maximum ?? 6500),
    kelvinValue =
      isNumericValue(attributes.color_temp_kelvin) && Number(attributes.color_temp_kelvin) > 0
        ? Number(attributes.color_temp_kelvin)
        : isNumericValue(attributes.color_temp) && Number(attributes.color_temp) > 0
          ? 1000000 / Number(attributes.color_temp)
          : (fallbackState?.kelvin ?? null),
    rawBrightness = isNumericValue(attributes.brightness)
      ? Math.max(0, Math.min(255, Number(attributes.brightness)))
      : null,
    brightnessPercent =
      rawBrightness !== null && !(stateObject.state === "off" && rawBrightness === 0)
        ? rawBrightness > 0
          ? Math.max(1, Math.round((rawBrightness / 255) * 100))
          : 0
        : fallbackState?.brightness > 0
          ? fallbackState.brightness
          : null;
  return {
    on: stateObject.state === "on",
    available: ["on", "off"].includes(stateObject.state),
    name: attributes.friendly_name || fallbackState?.name || entityId,
    brightnessSupported: brightnessSupported,
    temperatureSupported: temperatureSupported,
    colorSupported: colorSupported,
    colorHs: colorHs,
    colorRgb: colorRgb,
    colorModes: supportedColorModes.length
      ? [...supportedColorModes]
      : fallbackState?.colorModes || [],
    colorMode: colorMode,
    capabilitiesKnown: capabilitiesKnown,
    brightness: brightnessSupported ? brightnessPercent : null,
    kelvin: temperatureSupported && isNumericValue(kelvinValue) ? Math.round(kelvinValue) : null,
    minimum: Math.round(Math.max(1000, Math.min(minimumKelvin, maximumKelvin))),
    maximum: Math.round(Math.min(20000, Math.max(minimumKelvin, maximumKelvin))),
  };
}
export function lightRenderState(stateSnapshot) {
  const hasMissingBrightness =
      stateSnapshot.brightnessSupported && !Number.isFinite(stateSnapshot.brightness),
    hasUsableColorRgb =
      !stateSnapshot.colorMode &&
      stateSnapshot.colorSupported &&
      Array.isArray(stateSnapshot.colorRgb) &&
      stateSnapshot.colorRgb.length === 3 &&
      stateSnapshot.colorRgb.every(
        (rgbChannel) => Number.isFinite(rgbChannel) && rgbChannel >= 0 && rgbChannel <= 255,
      ),
    hasMissingKelvin =
      stateSnapshot.temperatureSupported &&
      !colorModeSet.has(stateSnapshot.colorMode) &&
      !Number.isFinite(stateSnapshot.kelvin) &&
      !hasUsableColorRgb;
  return {
    ...stateSnapshot,
    on: stateSnapshot.on && !hasMissingBrightness && !hasMissingKelvin,
  };
}
const HISTORY_MAX_AGE_MS = 10080 * 60 * 1000,
  MAX_TRACKED_ENTITIES = 256,
  isLightEntityId = (entityIdCandidate) => /^(light|switch)\.[a-z0-9_]+$/.test(entityIdCandidate),
  isNumericAttribute = (attributeValue) =>
    typeof attributeValue != "boolean" && isNumericValue(attributeValue),
  LIGHT_ATTRIBUTE_VALIDATORS = {
    brightness: (brightnessValue) =>
      Number.isFinite(brightnessValue) && brightnessValue > 0 && brightnessValue <= 100,
    kelvin: (kelvinCandidate) => Number.isFinite(kelvinCandidate) && kelvinCandidate > 0,
    minimum: (minimumCandidate) =>
      Number.isFinite(minimumCandidate) && minimumCandidate >= 1000 && minimumCandidate <= 20000,
    maximum: (maximumCandidate) =>
      Number.isFinite(maximumCandidate) && maximumCandidate >= 1000 && maximumCandidate <= 20000,
    colorMode: (colorModeCandidate) =>
      colorModeCandidate === "color_temp" || colorModeSet.has(colorModeCandidate),
    brightnessSupported: (brightnessSupportedFlag) => typeof brightnessSupportedFlag == "boolean",
    temperatureSupported: (temperatureSupportedFlag) =>
      typeof temperatureSupportedFlag == "boolean",
    colorSupported: (colorSupportedFlag) => typeof colorSupportedFlag == "boolean",
    colorHs: isColorHsPair,
    colorRgb: (colorRgbCandidate) =>
      Array.isArray(colorRgbCandidate) &&
      colorRgbCandidate.length === 3 &&
      colorRgbCandidate.every(
        (rgbComponent) => Number.isFinite(rgbComponent) && rgbComponent >= 0 && rgbComponent <= 255,
      ),
    colorModes: (colorModesCandidate) =>
      Array.isArray(colorModesCandidate) &&
      colorModesCandidate.length <= 12 &&
      colorModesCandidate.every(
        (colorModeName) => typeof colorModeName == "string" && colorModeName.length < 32,
      ),
  };
function computeAttributePatch(patchEntityId, patchEntityState) {
  const entityStateBody = patchEntityState?.newState || patchEntityState || {},
    entityAttributes = entityStateBody.attributes || {},
    resolvedLightState = lightState(patchEntityId, patchEntityState),

    attributePatch: Record<string, any> = {},
    patchSupportedColorModes = Array.isArray(entityAttributes.supported_color_modes)
      ? entityAttributes.supported_color_modes
      : [],
    hasReportedBrightness =
      isNumericAttribute(entityAttributes.brightness) && Number(entityAttributes.brightness) > 0,
    hasReportedKelvin =
      (isNumericAttribute(entityAttributes.color_temp_kelvin) &&
        Number(entityAttributes.color_temp_kelvin) > 0) ||
      (isNumericAttribute(entityAttributes.color_temp) && Number(entityAttributes.color_temp) > 0),
    hasReportedMinKelvin =
      (isNumericAttribute(entityAttributes.min_color_temp_kelvin) &&
        Number(entityAttributes.min_color_temp_kelvin) > 0) ||
      (isNumericAttribute(entityAttributes.max_mireds) && Number(entityAttributes.max_mireds) > 0),
    hasReportedMaxKelvin =
      (isNumericAttribute(entityAttributes.max_color_temp_kelvin) &&
        Number(entityAttributes.max_color_temp_kelvin) > 0) ||
      (isNumericAttribute(entityAttributes.min_mireds) && Number(entityAttributes.min_mireds) > 0),
    reportedSupportedFeatures = isNumericAttribute(entityAttributes.supported_features)
      ? Number(entityAttributes.supported_features)
      : 0;
  return (
    (patchSupportedColorModes.length || hasReportedBrightness || reportedSupportedFeatures & 1) &&
      (attributePatch.brightnessSupported = resolvedLightState.brightnessSupported),
    (patchSupportedColorModes.length ||
      hasReportedKelvin ||
      hasReportedMinKelvin ||
      hasReportedMaxKelvin ||
      reportedSupportedFeatures & 2) &&
      (attributePatch.temperatureSupported = resolvedLightState.temperatureSupported),
    (patchSupportedColorModes.length || lightColorHs(entityAttributes)) &&
      (attributePatch.colorSupported = resolvedLightState.colorSupported),
    patchSupportedColorModes.length && (attributePatch.colorModes = [...patchSupportedColorModes]),
    resolvedLightState.colorSupported &&
      lightColorRgb(entityAttributes) &&
      (attributePatch.colorRgb = resolvedLightState.colorRgb),
    resolvedLightState.colorSupported &&
      lightColorHs(entityAttributes) &&
      (attributePatch.colorHs = resolvedLightState.colorHs),
    hasReportedBrightness &&
      resolvedLightState.brightnessSupported &&
      (attributePatch.brightness = resolvedLightState.brightness),
    hasReportedKelvin &&
      resolvedLightState.temperatureSupported &&
      (attributePatch.kelvin = resolvedLightState.kelvin),
    hasReportedMinKelvin && (attributePatch.minimum = resolvedLightState.minimum),
    hasReportedMaxKelvin && (attributePatch.maximum = resolvedLightState.maximum),
    (entityAttributes.color_mode === "color_temp" ||
      colorModeSet.has(entityAttributes.color_mode)) &&
      (attributePatch.colorMode = resolvedLightState.colorMode),
    Object.fromEntries(
      Object.entries(attributePatch).filter(([patchKey, patchValue]) =>
        LIGHT_ATTRIBUTE_VALIDATORS[patchKey](patchValue),
      ),
    )
  );
}

type LightHistoryRecord = { at: number; value?: unknown };

type LightHistoryStorage = {
  getItem: (storageKey: string) => string | null;
  setItem: (storageKey: string, storageValue: string) => void;
  removeItem: (storageKey: string) => void;
};
function createLightHistoryStore(storage, scope, now, schedule, cancel) {
  if (!storage || typeof scope != "string" || !scope.trim()) return null;
  const storageKey = "hb-i3d:light-history:v1:" + scope,
    historyByEntityId = new Map<string, Record<string, LightHistoryRecord>>(),
    signatureByEntityId = new Map();
  let isStorageUsable = true,
    flushTimerId = null,
    hasPendingWrites = false,
    nextPruneMs = 0;
  const latestRecordTimestamp = (attributeRecords: Record<string, LightHistoryRecord>) =>
    Math.max(0, ...Object.values(attributeRecords).map((attributeRecord) => attributeRecord.at));
  function pruneExpiredRecords(nowMs) {
    if (nowMs < nextPruneMs && historyByEntityId.size <= MAX_TRACKED_ENTITIES) return false;
    let hasPruned = false;
    nextPruneMs = Infinity;
    for (const [storedEntityId, storedAttributes] of historyByEntityId) {
      for (const [attributeKey, record] of Object.entries(storedAttributes))
        nowMs - record.at >= HISTORY_MAX_AGE_MS
          ? (delete storedAttributes[attributeKey], (hasPruned = true))
          : (nextPruneMs = Math.min(nextPruneMs, record.at + HISTORY_MAX_AGE_MS));
      Object.keys(storedAttributes).length || historyByEntityId.delete(storedEntityId);
    }
    if (historyByEntityId.size > MAX_TRACKED_ENTITIES) {
      const entitiesByAge = [...historyByEntityId].sort(
        (leftEntity, rightEntity) =>
          latestRecordTimestamp(leftEntity[1]) - latestRecordTimestamp(rightEntity[1]),
      );
      for (const [evictedEntityId] of entitiesByAge.slice(
        0,
        historyByEntityId.size - MAX_TRACKED_ENTITIES,
      ))
        historyByEntityId.delete(evictedEntityId);
      hasPruned = true;
    }
    return hasPruned;
  }
  function readStoredHistory() {
    const storedHistoryByEntityId = new Map<string, Record<string, LightHistoryRecord>>(),
      storedJSON = storage.getItem(storageKey);
    if (storedJSON) {
      const parsedHistory = JSON.parse(storedJSON),
        readAtMs = now();
      if (
        parsedHistory?.version !== 1 ||
        !parsedHistory.entities ||
        typeof parsedHistory.entities != "object" ||
        Array.isArray(parsedHistory.entities)
      )
        throw new Error("Invalid light history");
      for (const [entityIdFromStorage, attributesFromStorage] of Object.entries(
        parsedHistory.entities,
      )) {
        if (
          !isLightEntityId(entityIdFromStorage) ||
          !attributesFromStorage ||
          typeof attributesFromStorage != "object" ||
          Array.isArray(attributesFromStorage)
        )
          continue;
        const validAttributeRecords = {};
        for (const [recordKey, storedRecord] of Object.entries(attributesFromStorage))
          Object.hasOwn(LIGHT_ATTRIBUTE_VALIDATORS, recordKey) &&
            LIGHT_ATTRIBUTE_VALIDATORS[recordKey](storedRecord?.value) &&
            Number.isFinite(storedRecord.at) &&
            storedRecord.at >= 0 &&
            storedRecord.at <= readAtMs &&
            readAtMs - storedRecord.at < HISTORY_MAX_AGE_MS &&
            (validAttributeRecords[recordKey] = {
              value: storedRecord.value,
              at: storedRecord.at,
            });
        Object.keys(validAttributeRecords).length &&
          storedHistoryByEntityId.set(entityIdFromStorage, validAttributeRecords);
      }
    }
    return storedHistoryByEntityId;
  }
  try {
    for (const [restoredEntityId, restoredAttributes] of readStoredHistory())
      historyByEntityId.set(restoredEntityId, restoredAttributes);
    pruneExpiredRecords(now());
  } catch {
    return null;
  }
  const serializeHistory = () =>
    JSON.stringify({
      version: 1,
      entities: Object.fromEntries(historyByEntityId),
    });
  function flushHistory() {
    if (
      (flushTimerId !== null && (cancel(flushTimerId), (flushTimerId = null)),
      !(!isStorageUsable || !hasPendingWrites))
    ) {
      hasPendingWrites = false;
      try {
        for (const [persistedEntityId, persistedAttributes] of readStoredHistory()) {
          const mergedRecords: Record<string, LightHistoryRecord> =
            historyByEntityId.get(persistedEntityId) || {};
          for (const [mergedKey, newerRecord] of Object.entries(persistedAttributes))
            (!mergedRecords[mergedKey] || mergedRecords[mergedKey].at < newerRecord.at) &&
              (mergedRecords[mergedKey] = newerRecord);
          (mergedRecords.brightnessSupported?.value === false && delete mergedRecords.brightness,
            mergedRecords.temperatureSupported?.value === false && delete mergedRecords.kelvin,
            mergedRecords.colorSupported?.value === false &&
              (delete mergedRecords.colorHs, delete mergedRecords.colorRgb),
            historyByEntityId.set(persistedEntityId, mergedRecords));
        }
        ((nextPruneMs = 0),
          pruneExpiredRecords(now()),
          storage.setItem(storageKey, serializeHistory()));
      } catch {
        isStorageUsable = false;
      }
    }
  }
  function scheduleHistoryFlush() {
    !isStorageUsable ||
      flushTimerId !== null ||
      !hasPendingWrites ||
      (flushTimerId = schedule(() => {
        ((flushTimerId = null), flushHistory());
      }));
  }
  return {
    resolve(resolveEntityId, resolveEntityState) {
      const resolveNowMs = now();
      if (
        ((hasPendingWrites = pruneExpiredRecords(resolveNowMs) || hasPendingWrites),
        isLightEntityId(resolveEntityId))
      ) {
        const resolvedPatch = computeAttributePatch(resolveEntityId, resolveEntityState),
          patchSignature = JSON.stringify(resolvedPatch);
        if (signatureByEntityId.get(resolveEntityId) !== patchSignature) {
          (signatureByEntityId.delete(resolveEntityId),
            signatureByEntityId.set(resolveEntityId, patchSignature));
          const entityHistory = historyByEntityId.get(resolveEntityId) || {};
          for (const [historyAttributeKey, historyAttributeValue] of Object.entries(resolvedPatch))
            JSON.stringify(entityHistory[historyAttributeKey]?.value) !==
              JSON.stringify(historyAttributeValue) &&
              ((entityHistory[historyAttributeKey] = {
                value: historyAttributeValue,
                at: resolveNowMs,
              }),
              (nextPruneMs = Math.min(nextPruneMs, resolveNowMs + HISTORY_MAX_AGE_MS)),
              (hasPendingWrites = true));
          for (
            resolvedPatch.brightnessSupported === false &&
              entityHistory.brightness &&
              (delete entityHistory.brightness, (hasPendingWrites = true)),
              resolvedPatch.colorSupported === false &&
                (entityHistory.colorHs || entityHistory.colorRgb) &&
                (delete entityHistory.colorHs,
                delete entityHistory.colorRgb,
                (hasPendingWrites = true)),
              resolvedPatch.temperatureSupported === false &&
                entityHistory.kelvin &&
                (delete entityHistory.kelvin, (hasPendingWrites = true)),
              Object.keys(entityHistory).length &&
                historyByEntityId.set(resolveEntityId, entityHistory);
            signatureByEntityId.size > MAX_TRACKED_ENTITIES;
          )
            signatureByEntityId.delete(signatureByEntityId.keys().next().value);
        }
      }
      ((hasPendingWrites = pruneExpiredRecords(resolveNowMs) || hasPendingWrites),
        scheduleHistoryFlush());
      const mergedAttributes = Object.fromEntries(
        Object.entries(historyByEntityId.get(resolveEntityId) || {}).map(
          ([mergedKeyName, mergedRecord]) => [mergedKeyName, mergedRecord.value],
        ),
      );
      return (
        (mergedAttributes.colorSupported ??= isColorHsPair(mergedAttributes.colorHs)),
        (mergedAttributes.brightnessSupported ??=
          Number.isFinite(mergedAttributes.brightness) ||
          !!(mergedAttributes.colorMode && mergedAttributes.colorMode !== "onoff")),
        (mergedAttributes.temperatureSupported ??=
          Number.isFinite(mergedAttributes.kelvin) ||
          Number.isFinite(mergedAttributes.minimum) ||
          Number.isFinite(mergedAttributes.maximum) ||
          mergedAttributes.colorMode === "color_temp"),
        mergedAttributes
      );
    },
    flush: flushHistory,
    clear() {
      if (
        (flushTimerId !== null && (cancel(flushTimerId), (flushTimerId = null)),
        historyByEntityId.clear(),
        signatureByEntityId.clear(),
        (hasPendingWrites = false),
        (nextPruneMs = Infinity),
        isStorageUsable)
      )
        try {
          storage.removeItem(storageKey);
        } catch {
          isStorageUsable = false;
        }
    },
  };
}
export function createLightStateCache({
  storage: cacheStorage,
  scope: cacheScope,
  now: cacheNow = () => Date.now(),
  schedule: cacheSchedule = (scheduledCallback) => setTimeout(scheduledCallback, 50),
  cancel: cacheCancel = (scheduledTimerId) => clearTimeout(scheduledTimerId),
}: {
  storage?: LightHistoryStorage | null;
  scope?: string;
  now?: () => number;

  schedule?: (scheduledCallback: () => void) => any;
  cancel?: (scheduledTimerId: any) => void;
} = {}) {
  const lastStateByEntityId = new Map(),
    historyStore = createLightHistoryStore(
      cacheStorage,
      cacheScope,
      cacheNow,
      cacheSchedule,
      cacheCancel,
    );
  return {
    resolve(cacheEntityId, cacheEntityState) {
      const cachedAttributes = historyStore
          ? {
              name: lastStateByEntityId.get(cacheEntityId)?.name,
              ...historyStore.resolve(cacheEntityId, cacheEntityState),
            }
          : lastStateByEntityId.get(cacheEntityId),
        computedState = lightState(cacheEntityId, cacheEntityState, cachedAttributes);
      return (
        lastStateByEntityId.set(
          cacheEntityId,
          computedState.brightness === 0
            ? {
                ...computedState,
                brightness: cachedAttributes?.brightness > 0 ? cachedAttributes.brightness : null,
              }
            : computedState,
        ),
        computedState
      );
    },
    flush() {
      historyStore?.flush();
    },
    clear() {
      (lastStateByEntityId.clear(), historyStore?.clear());
    },
  };
}
export function lightCommand(commandEntityId, commandName, commandValue, capabilities) {
  if (!/^(light|switch)\.[a-z0-9_]+$/.test(commandEntityId) || !capabilities.available)
    throw new Error("设备不可用。");
  const entityDomainName = commandEntityId.split(".")[0];
  if (commandName === "power")
    return {
      domain: entityDomainName,
      service: commandValue ? "turn_on" : "turn_off",
      entityId: commandEntityId,
      data: {},
    };
  if (commandName === "white" && capabilities.colorModes?.includes("white"))
    return {
      domain: entityDomainName,
      service: "turn_on",
      entityId: commandEntityId,
      data: {
        white: Math.round(
          (Math.max(
            1,
            Math.min(100, Number.isFinite(commandValue) ? commandValue : capabilities.brightness || 100),
          ) *
            255) /
            100,
        ),
      },
    };
  if (commandName === "color") {
    if (!capabilities.colorSupported || !isColorHsPair(commandValue))
      throw new Error("此设备不支持该颜色或颜色参数无效。");
    return {
      domain: entityDomainName,
      service: "turn_on",
      entityId: commandEntityId,
      data: buildColorServicePayload(
        {
          supported_color_modes: capabilities.colorModes,
        },
        commandValue,
      ),
    };
  }
  if (!Number.isFinite(Number(commandValue))) throw new Error("灯光参数无效。");
  if (commandName === "brightness" && capabilities.brightnessSupported)
    return {
      domain: entityDomainName,
      service: "turn_on",
      entityId: commandEntityId,
      data: {
        brightness: Math.round((Math.max(1, Math.min(100, Number(commandValue))) * 255) / 100),
      },
    };
  if (commandName === "temperature" && capabilities.temperatureSupported)
    return {
      domain: entityDomainName,
      service: "turn_on",
      entityId: commandEntityId,
      data: {
        color_temp_kelvin: Math.round(
          Math.max(capabilities.minimum, Math.min(capabilities.maximum, Number(commandValue))),
        ),
      },
    };
  throw new Error("此设备不支持该灯光调节。");
}
export function createLightPreview({ now: previewNow = () => performance.now() } = {}) {

  const previewsByEntityId = new Map<
    any,
    { values: Record<string, any>; revision: number; committed: boolean; expires: number }
  >();
  let revisionCounter = 0;
  return {
    set(previewEntityId, previewCommand, previewValue, isCommitted = false) {

      const previewValues: Record<string, any> = {
        ...previewsByEntityId.get(previewEntityId)?.values,
        on: previewCommand === "power" ? previewValue === true : true,
      };
      (previewCommand === "brightness" && (previewValues.brightness = previewValue),
        previewCommand === "temperature" &&
          ((previewValues.kelvin = previewValue),
          (previewValues.colorMode = "color_temp"),
          delete previewValues.colorHs,
          delete previewValues.colorRgb),
        previewCommand === "color" &&
          isColorHsPair(previewValue) &&
          ((previewValues.colorHs = [...previewValue]),
          (previewValues.colorRgb = j(previewValue)),
          (previewValues.colorMode = "hs"),
          delete previewValues.kelvin),
        previewCommand === "white" &&
          ((previewValues.colorMode = "white"),
          (previewValues.colorRgb = [255, 255, 255]),
          (previewValues.colorHs = [0, 0]),
          Number.isFinite(previewValue) && (previewValues.brightness = previewValue),
          delete previewValues.kelvin),
        previewCommand === "preset" &&
          (Number.isFinite(previewValue?.brightness) &&
            (previewValues.brightness = previewValue.brightness),
          Number.isFinite(previewValue?.kelvin) &&
            ((previewValues.kelvin = previewValue.kelvin),
            (previewValues.colorMode = "color_temp"),
            delete previewValues.colorHs,
            delete previewValues.colorRgb)),
        previewCommand === "power" &&
          !previewValue &&
          (delete previewValues.brightness,
          delete previewValues.kelvin,
          delete previewValues.colorHs,
          delete previewValues.colorRgb,
          delete previewValues.colorMode));
      const previewEntry = {
        values: previewValues,
        revision: ++revisionCounter,
        committed: isCommitted,
        expires: previewNow() + 15000,
      };
      return (previewsByEntityId.set(previewEntityId, previewEntry), previewEntry.revision);
    },
    state(stateEntityId, serverState) {
      return {
        ...serverState,
        ...previewsByEntityId.get(stateEntityId)?.values,
      };
    },
    reconcile(reconcileEntityId, serverEntityState) {
      const pendingPreview = previewsByEntityId.get(reconcileEntityId);
      if (!pendingPreview) return;
      const isSettled = Object.entries(pendingPreview.values).every(
        ([previewKey, expectedValue]) =>
          previewKey === "on"
            ? serverEntityState.on === expectedValue
            : previewKey === "colorMode"
              ? expectedValue === "white"
                ? serverEntityState.colorMode === "white"
                : expectedValue === "color_temp"
                  ? serverEntityState.colorMode === "color_temp" ||
                    (!serverEntityState.colorMode && Number.isFinite(serverEntityState.kelvin))
                  : ["hs", "rgb", "rgbw", "rgbww", "xy"].includes(serverEntityState.colorMode) ||
                    (!serverEntityState.colorMode && isColorHsPair(serverEntityState.colorHs))
              : previewKey === "colorRgb"
                ? true
                : previewKey === "colorHs"
                  ? isColorHsPair(serverEntityState.colorHs) &&
                    j(serverEntityState.colorHs).every(
                      (serverRgbComponent, rgbChannelIndex) =>
                        Math.abs(serverRgbComponent - j(expectedValue)[rgbChannelIndex]) <= 4,
                    )
                  : Number.isFinite(serverEntityState[previewKey]) &&
                    Math.abs(serverEntityState[previewKey] - expectedValue) <=
                      (previewKey === "kelvin" ? 15 : 1),
      );
      (!serverEntityState.available || (pendingPreview.committed && isSettled)) &&
        previewsByEntityId.delete(reconcileEntityId);
    },
    hold(holdEntityId, holdRevision) {
      const heldPreview = previewsByEntityId.get(holdEntityId);
      heldPreview?.revision === holdRevision && (heldPreview.committed = false);
    },
    retain(retainEntityId, retainRevision) {
      const retainedPreview = previewsByEntityId.get(retainEntityId);
      retainedPreview?.revision === retainRevision &&
        ((retainedPreview.committed = true), (retainedPreview.expires = previewNow() + 15000));
    },
    acknowledge(acknowledgeEntityId, acknowledgeRevision) {
      const acknowledgedPreview = previewsByEntityId.get(acknowledgeEntityId);
      acknowledgedPreview?.revision === acknowledgeRevision &&
        (acknowledgedPreview.expires = previewNow() + 8000);
    },
    reject(rejectEntityId, rejectRevision) {
      previewsByEntityId.get(rejectEntityId)?.revision === rejectRevision &&
        previewsByEntityId.delete(rejectEntityId);
    },
    expire() {
      let hasExpired = false;
      for (const [expiredEntityId, expiredPreview] of previewsByEntityId)
        expiredPreview.expires <= previewNow() &&
          (previewsByEntityId.delete(expiredEntityId), (hasExpired = true));
      return hasExpired;
    },
    clear() {
      previewsByEntityId.clear();
    },
    nextDelay(atMs = previewNow()) {
      let earliestExpiryMs = Infinity;
      for (const previewRecord of previewsByEntityId.values())
        earliestExpiryMs = Math.min(earliestExpiryMs, previewRecord.expires);
      return Math.max(0, earliestExpiryMs - atMs);
    },
  };
}
