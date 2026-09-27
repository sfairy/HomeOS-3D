
// 状态条目归一（变更对象 / 状态对象两种形态）与「按 ID 切域」只有一份实现（`/static/utils/`
import { entityDomainFromId, resolveStateEntry } from "../core/static-helpers.js?v=2609271508";
/**
 * 判断是否为可用的数值型输入。
 */
const isNumericValue = candidateValue =>
  candidateValue != null && candidateValue !== "" && Number.isFinite(Number(candidateValue));
/**
 * HA 的 color_mode 白名单。
 */
const COLOR_MODE_SET = new Set([
  "hs",
  "xy",
  "rgb",
  "rgbw",
  "rgbww",
  "white",
  "brightness",
  "onoff"
]);
/**
 * 把 HA 的灯光实体归一化成面板 / 动画使用的状态。
 * @param {string} entityId 实体 ID，形如 light.living_room；非 light. 前缀一律视为不可用。
 */
export function lightState(entityId, entityState, fallbackState) {
  const stateObject = resolveStateEntry(entityState, {});
  const attributes = stateObject.attributes || {};
  const supportedColorModes = Array.isArray(attributes.supported_color_modes)
    ? attributes.supported_color_modes
    : [];
  const isLightDomain = entityId.startsWith("light.");
  const colorMode =
    isLightDomain &&
    (attributes.color_mode === "color_temp" || COLOR_MODE_SET.has(attributes.color_mode))
      ? attributes.color_mode
      : (fallbackState?.colorMode ?? null);
  const brightnessSupported =
    isLightDomain &&
    (supportedColorModes.length
      ? supportedColorModes.some(supportedMode => !["onoff", "unknown"].includes(supportedMode))
      : isNumericValue(attributes.brightness) ||
        (Number(attributes.supported_features) & 1) !== 0 ||
        fallbackState?.brightnessSupported === true);
  // 色温支持判定同上：优先 supported_color_modes 内含 color_temp，
  const temperatureSupported =
    isLightDomain &&
    (supportedColorModes.length
      ? supportedColorModes.includes("color_temp")
      : isNumericValue(attributes.color_temp_kelvin) ||
        isNumericValue(attributes.color_temp) ||
        isNumericValue(attributes.min_color_temp_kelvin) ||
        isNumericValue(attributes.max_color_temp_kelvin) ||
        (Number(attributes.supported_features) & 2) !== 0 ||
        fallbackState?.temperatureSupported === true);
  // 色温下限：新版属性优先；老版本只有 max_mireds（微倒度越大色温越低），
  const minimumKelvin = isNumericValue(attributes.min_color_temp_kelvin)
    ? Number(attributes.min_color_temp_kelvin)
    : Number(attributes.max_mireds) > 0
      ? 1000000 / Number(attributes.max_mireds)
      : (fallbackState?.minimum ?? 2000);
  // 色温上限同理，由 min_mireds 换算；兜底 6500K。
  const maximumKelvin = isNumericValue(attributes.max_color_temp_kelvin)
    ? Number(attributes.max_color_temp_kelvin)
    : Number(attributes.min_mireds) > 0
      ? 1000000 / Number(attributes.min_mireds)
      : (fallbackState?.maximum ?? 6500);
  const kelvinValue =
    isNumericValue(attributes.color_temp_kelvin) && Number(attributes.color_temp_kelvin) > 0
      ? Number(attributes.color_temp_kelvin)
      : isNumericValue(attributes.color_temp) && Number(attributes.color_temp) > 0
        ? 1000000 / Number(attributes.color_temp)
        : (fallbackState?.kelvin ?? null);
  // 亮度先夹到 HA 的 0–255 原始区间，再做百分比换算。
  const rawBrightness = isNumericValue(attributes.brightness)
    ? Math.max(0, Math.min(255, Number(attributes.brightness)))
    : null;
  const brightnessPercent =
    rawBrightness !== null && (stateObject.state !== "off" || rawBrightness !== 0)
      ? rawBrightness > 0
        ? Math.max(1, Math.round((rawBrightness / 255) * 100))
        : 0
      : fallbackState?.brightness > 0
        ? fallbackState.brightness
        : null;
  // minimum / maximum 的夹取互相参照，保证即使设备上报的上下限颠倒，
  return {
    on: stateObject.state === "on",
    available: ["on", "off"].includes(stateObject.state),
    name: attributes.friendly_name || fallbackState?.name || entityId,
    brightnessSupported: brightnessSupported,
    temperatureSupported: temperatureSupported,
    colorMode: colorMode,
    brightness: brightnessSupported ? brightnessPercent : null,
    kelvin: temperatureSupported && isNumericValue(kelvinValue) ? Math.round(kelvinValue) : null,
    minimum: Math.round(Math.max(1000, Math.min(minimumKelvin, maximumKelvin))),
    maximum: Math.round(Math.min(20000, Math.max(minimumKelvin, maximumKelvin)))
  };
}
/**
 * 把归一化状态转换成「用于渲染」的状态：设备声明支持某项却暂时报不出值时宁可渲染成关闭，
 * @returns {object} 浅拷贝，其中 on 会被按需降级为 false。
 */
export function lightRenderState(stateSnapshot) {
  const hasMissingBrightness =
    stateSnapshot.brightnessSupported && !Number.isFinite(stateSnapshot.brightness);
  // 彩光模式下没有色温是正常的，只有「支持色温且模式不是彩光」时缺值才算异常。
  const hasMissingKelvin =
    stateSnapshot.temperatureSupported &&
    !COLOR_MODE_SET.has(stateSnapshot.colorMode) &&
    !Number.isFinite(stateSnapshot.kelvin);
  return {
    ...stateSnapshot,
    on: stateSnapshot.on && !hasMissingBrightness && !hasMissingKelvin
  };
}
const HISTORY_MAX_AGE_MS = 604800000;
const MAX_TRACKED_ENTITIES = 256;
const isLightEntityId = entityIdCandidate => /^(light|switch)\.[a-z0-9_]+$/.test(entityIdCandidate);
/** 属性级数值校验：布尔值不算数值（Number(true) 会变成 1，属于脏数据）。 */
const isNumericAttribute = attributeValue =>
  typeof attributeValue != "boolean" && isNumericValue(attributeValue);
const LIGHT_ATTRIBUTE_VALIDATORS = {
  brightness: brightnessValue =>
    Number.isFinite(brightnessValue) && brightnessValue > 0 && brightnessValue <= 100,
  kelvin: kelvinCandidate => Number.isFinite(kelvinCandidate) && kelvinCandidate > 0,
  minimum: minimumCandidate =>
    Number.isFinite(minimumCandidate) && minimumCandidate >= 1000 && minimumCandidate <= 20000,
  maximum: maximumCandidate =>
    Number.isFinite(maximumCandidate) && maximumCandidate >= 1000 && maximumCandidate <= 20000,
  colorMode: colorModeCandidate =>
    colorModeCandidate === "color_temp" || COLOR_MODE_SET.has(colorModeCandidate),
  brightnessSupported: brightnessSupportedFlag => typeof brightnessSupportedFlag == "boolean",
  temperatureSupported: temperatureSupportedFlag => typeof temperatureSupportedFlag == "boolean"
};
function computeAttributePatch(patchEntityId, patchEntityState) {
  const entityStateBody = resolveStateEntry(patchEntityState, {});
  const entityAttributes = entityStateBody.attributes || {};
  const resolvedLightState = lightState(patchEntityId, patchEntityState);
  const attributePatch = {};
  const patchSupportedColorModes = Array.isArray(entityAttributes.supported_color_modes)
    ? entityAttributes.supported_color_modes
    : [];
  const hasReportedBrightness =
    isNumericAttribute(entityAttributes.brightness) && Number(entityAttributes.brightness) > 0;
  const hasReportedKelvin =
    (isNumericAttribute(entityAttributes.color_temp_kelvin) &&
      Number(entityAttributes.color_temp_kelvin) > 0) ||
    (isNumericAttribute(entityAttributes.color_temp) && Number(entityAttributes.color_temp) > 0);
  const hasReportedMinKelvin =
    (isNumericAttribute(entityAttributes.min_color_temp_kelvin) &&
      Number(entityAttributes.min_color_temp_kelvin) > 0) ||
    (isNumericAttribute(entityAttributes.max_mireds) && Number(entityAttributes.max_mireds) > 0);
  const hasReportedMaxKelvin =
    (isNumericAttribute(entityAttributes.max_color_temp_kelvin) &&
      Number(entityAttributes.max_color_temp_kelvin) > 0) ||
    (isNumericAttribute(entityAttributes.min_mireds) && Number(entityAttributes.min_mireds) > 0);
  const reportedSupportedFeatures = isNumericAttribute(entityAttributes.supported_features)
    ? Number(entityAttributes.supported_features)
    : 0;
  // 只要出现过任意亮度线索，就记下「这盏灯支不支持亮度」这个结论。
  if (patchSupportedColorModes.length || hasReportedBrightness || reportedSupportedFeatures & 1) {
    attributePatch.brightnessSupported = resolvedLightState.brightnessSupported;
  }
  // 色温支持同理：出现过任意色温线索才记录结论。
  if (
    patchSupportedColorModes.length ||
    hasReportedKelvin ||
    hasReportedMinKelvin ||
    hasReportedMaxKelvin ||
    reportedSupportedFeatures & 2
  ) {
    attributePatch.temperatureSupported = resolvedLightState.temperatureSupported;
  }
  // 具体数值只在「确实上报了」且「能力允许」时才收录：
  if (hasReportedBrightness && resolvedLightState.brightnessSupported) {
    attributePatch.brightness = resolvedLightState.brightness;
  }
  if (hasReportedKelvin && resolvedLightState.temperatureSupported) {
    attributePatch.kelvin = resolvedLightState.kelvin;
  }
  if (hasReportedMinKelvin) {
    attributePatch.minimum = resolvedLightState.minimum;
  }
  if (hasReportedMaxKelvin) {
    attributePatch.maximum = resolvedLightState.maximum;
  }
  if (
    entityAttributes.color_mode === "color_temp" ||
    COLOR_MODE_SET.has(entityAttributes.color_mode)
  ) {
    attributePatch.colorMode = resolvedLightState.colorMode;
  }
  // 逐项跑校验表，任何一项不合法就整体丢弃该项（而不是写个坏值进去）。
  return Object.fromEntries(
    Object.entries(attributePatch).filter(([patchKey, patchValue]) =>
      LIGHT_ATTRIBUTE_VALIDATORS[patchKey](patchValue)
    )
  );
}
function createLightHistoryStore(storage, scope, now, schedule, cancel) {
  if (!storage || typeof scope != "string" || !scope.trim()) {
    return null;
  }
  // 键名里带版本号，将来结构变更时可以并存而不必写迁移逻辑。
  const storageKey = "hb-i3d:light-history:v1:" + scope;
  const historyByEntityId = new Map();
  // 记录每个实体上次写入的补丁签名，用于跳过重复上报（同一状态会被反复推送）。
  const signatureByEntityId = new Map();
  let isStorageUsable = true;
  let flushTimerId = null;
  let hasPendingWrites = false;
  // 下次需要做过期清理的时间；Infinity 表示暂时无需清理。
  let nextPruneMs = 0;
  /** 取某实体所有记录里最新的时间戳，用于淘汰排序。 */
  const latestRecordTimestamp = attributeRecords =>
    Math.max(0, ...Object.values(attributeRecords).map(attributeRecord => attributeRecord.at));
  /**
   * 清理过期记录并控制实体数量上限。
   */
  function pruneExpiredRecords(nowMs) {
    if (nowMs < nextPruneMs && historyByEntityId.size <= MAX_TRACKED_ENTITIES) {
      return false;
    }
    let didPrune = false;
    nextPruneMs = Infinity;
    for (const [storedEntityId, storedAttributes] of historyByEntityId) {
      for (const [attributeKey, record] of Object.entries(storedAttributes)) {
        if (nowMs - record.at >= HISTORY_MAX_AGE_MS) {
          delete storedAttributes[attributeKey];
          didPrune = true;
        } else {
          // 顺手算出下一个「最早会过期」的时刻，作为下次清理的时间闸门。
          nextPruneMs = Math.min(nextPruneMs, record.at + HISTORY_MAX_AGE_MS);
        }
      }
      if (!Object.keys(storedAttributes).length) {
        historyByEntityId.delete(storedEntityId);
      }
    }
    if (historyByEntityId.size > MAX_TRACKED_ENTITIES) {
      // 超限时按「最新记录时间」升序淘汰最旧的实体，保留近期活跃的灯。
      const entitiesByAge = [...historyByEntityId].sort(
        (leftEntity, rightEntity) =>
          latestRecordTimestamp(leftEntity[1]) - latestRecordTimestamp(rightEntity[1])
      );
      for (const [evictedEntityId] of entitiesByAge.slice(
        0,
        historyByEntityId.size - MAX_TRACKED_ENTITIES
      )) {
        historyByEntityId.delete(evictedEntityId);
      }
      didPrune = true;
    }
    return didPrune;
  }
  function readStoredHistory() {
    const storedHistoryByEntityId = new Map();
    const storedJSON = storage.getItem(storageKey);
    if (storedJSON) {
      const parsedHistory = JSON.parse(storedJSON);
      const readAtMs = now();
      // 版本号不是 1 就认为不是本模块写的，直接判为损坏而不是猜测兼容。
      if (
        parsedHistory?.version !== 1 ||
        !parsedHistory.entities ||
        typeof parsedHistory.entities != "object" ||
        Array.isArray(parsedHistory.entities)
      ) {
        throw new Error("Invalid light history");
      }
      for (const [entityIdFromStorage, attributesFromStorage] of Object.entries(
        parsedHistory.entities
      )) {
        if (
          !isLightEntityId(entityIdFromStorage) ||
          !attributesFromStorage ||
          typeof attributesFromStorage != "object" ||
          Array.isArray(attributesFromStorage)
        ) {
          continue;
        }
        const validAttributeRecords = {};
        for (const [recordKey, storedRecord] of Object.entries(attributesFromStorage)) {
          if (
            Object.hasOwn(LIGHT_ATTRIBUTE_VALIDATORS, recordKey) &&
            LIGHT_ATTRIBUTE_VALIDATORS[recordKey](storedRecord?.value) &&
            // 时间戳必须合法且未过期；未来时间戳（时钟回拨）也一并丢弃。
            Number.isFinite(storedRecord.at) &&
            storedRecord.at >= 0 &&
            storedRecord.at <= readAtMs &&
            readAtMs - storedRecord.at < HISTORY_MAX_AGE_MS
          ) {
            validAttributeRecords[recordKey] = {
              value: storedRecord.value,
              at: storedRecord.at
            };
          }
        }
        if (Object.keys(validAttributeRecords).length) {
          storedHistoryByEntityId.set(entityIdFromStorage, validAttributeRecords);
        }
      }
    }
    return storedHistoryByEntityId;
  }
  try {
    for (const [restoredEntityId, restoredAttributes] of readStoredHistory()) {
      historyByEntityId.set(restoredEntityId, restoredAttributes);
    }
    pruneExpiredRecords(now());
  } catch {
    return null;
  }
  /** 序列化成存储格式；版本号固定写 1，与读取侧的校验对应。 */
  const serializeHistory = () =>
    JSON.stringify({
      version: 1,
      entities: Object.fromEntries(historyByEntityId)
    });
  /** 立即把内存记录合并写入存储（若确有待写内容且存储可用）。 */
  function flushHistory() {
    if (flushTimerId !== null) {
      cancel(flushTimerId);
      flushTimerId = null;
    }
    if (!!isStorageUsable && !!hasPendingWrites) {
      hasPendingWrites = false;
      try {
        // 先重新读一遍存储：其它标签页可能在本页内存快照之后写了更新的记录，
        for (const [persistedEntityId, persistedAttributes] of readStoredHistory()) {
          const mergedRecords = historyByEntityId.get(persistedEntityId) || {};
          for (const [mergedKey, newerRecord] of Object.entries(persistedAttributes)) {
            if (!mergedRecords[mergedKey] || mergedRecords[mergedKey].at < newerRecord.at) {
              mergedRecords[mergedKey] = newerRecord;
            }
          }
          if (mergedRecords.brightnessSupported?.value === false) {
            delete mergedRecords.brightness;
          }
          if (mergedRecords.temperatureSupported?.value === false) {
            delete mergedRecords.kelvin;
          }
          historyByEntityId.set(persistedEntityId, mergedRecords);
        }
        nextPruneMs = 0;
        pruneExpiredRecords(now());
        storage.setItem(storageKey, serializeHistory());
      } catch {
        isStorageUsable = false;
      }
    }
  }
  /** 安排一次延迟写盘；已有待写内容且尚未安排时才排，天然做到节流合并。 */
  function scheduleHistoryFlush() {
    if (!!isStorageUsable && flushTimerId === null && !!hasPendingWrites) {
      flushTimerId = schedule(() => {
        flushTimerId = null;
        flushHistory();
      });
    }
  }
  return {
    resolve(resolveEntityId, resolveEntityState) {
      const resolveNowMs = now();
      hasPendingWrites = pruneExpiredRecords(resolveNowMs) || hasPendingWrites;
      if (isLightEntityId(resolveEntityId)) {
        const resolvedPatch = computeAttributePatch(resolveEntityId, resolveEntityState);
        const patchSignature = JSON.stringify(resolvedPatch);
        // 签名相同说明这次上报没有带来新信息，跳过写入（HA 会重复推送同一状态）。
        if (signatureByEntityId.get(resolveEntityId) !== patchSignature) {
          // 先删后设：Map 的迭代顺序即插入顺序，这样最近活跃的实体排在最后，
          signatureByEntityId.delete(resolveEntityId);
          signatureByEntityId.set(resolveEntityId, patchSignature);
          const entityHistory = historyByEntityId.get(resolveEntityId) || {};
          for (const [historyAttributeKey, historyAttributeValue] of Object.entries(
            resolvedPatch
          )) {
            if (entityHistory[historyAttributeKey]?.value !== historyAttributeValue) {
              entityHistory[historyAttributeKey] = {
                value: historyAttributeValue,
                at: resolveNowMs
              };
              nextPruneMs = Math.min(nextPruneMs, resolveNowMs + HISTORY_MAX_AGE_MS);
              hasPendingWrites = true;
            }
          }
          if (resolvedPatch.brightnessSupported === false && entityHistory.brightness) {
            delete entityHistory.brightness;
            hasPendingWrites = true;
          }
          if (resolvedPatch.temperatureSupported === false && entityHistory.kelvin) {
            delete entityHistory.kelvin;
            hasPendingWrites = true;
          }
          if (Object.keys(entityHistory).length) {
            historyByEntityId.set(resolveEntityId, entityHistory);
          }
          while (signatureByEntityId.size > MAX_TRACKED_ENTITIES) {
            signatureByEntityId.delete(signatureByEntityId.keys().next().value);
          }
        }
      }
      hasPendingWrites = pruneExpiredRecords(resolveNowMs) || hasPendingWrites;
      scheduleHistoryFlush();
      const mergedAttributes = Object.fromEntries(
        Object.entries(historyByEntityId.get(resolveEntityId) || {}).map(
          ([mergedKeyName, mergedRecord]) => [mergedKeyName, mergedRecord.value]
        )
      );
      mergedAttributes.brightnessSupported ??=
        Number.isFinite(mergedAttributes.brightness) ||
        (!!mergedAttributes.colorMode && mergedAttributes.colorMode !== "onoff");
      mergedAttributes.temperatureSupported ??=
        Number.isFinite(mergedAttributes.kelvin) ||
        Number.isFinite(mergedAttributes.minimum) ||
        Number.isFinite(mergedAttributes.maximum) ||
        mergedAttributes.colorMode === "color_temp";
      return mergedAttributes;
    },
    flush: flushHistory,
    /** 清空内存与存储；用于切换项目或用户主动重置。 */
    clear() {
      if (flushTimerId !== null) {
        cancel(flushTimerId);
        flushTimerId = null;
      }
      historyByEntityId.clear();
      signatureByEntityId.clear();
      hasPendingWrites = false;
      nextPruneMs = Infinity;
      if (isStorageUsable) {
        try {
          storage.removeItem(storageKey);
        } catch {
          isStorageUsable = false;
        }
      }
    }
  };
}
export function createLightStateCache({
  storage: cacheStorage,
  scope: cacheScope,
  now: cacheNow = () => Date.now(),
  schedule: cacheSchedule = scheduledCallback => setTimeout(scheduledCallback, 50),
  cancel: cacheCancel = scheduledTimerId => clearTimeout(scheduledTimerId)
} = {}) {
  const lastStateByEntityId = new Map();
  const historyStore = createLightHistoryStore(
    cacheStorage,
    cacheScope,
    cacheNow,
    cacheSchedule,
    cacheCancel
  );
  return {
    resolve(cacheEntityId, cacheEntityState) {
      const cachedAttributes = historyStore
        ? {
            name: lastStateByEntityId.get(cacheEntityId)?.name,
            ...historyStore.resolve(cacheEntityId, cacheEntityState)
          }
        : lastStateByEntityId.get(cacheEntityId);
      const computedState = lightState(cacheEntityId, cacheEntityState, cachedAttributes);
      // 灯灭时 HA 会把 brightness 报成 0，直接用会让「下次开灯」变全黑；
      lastStateByEntityId.set(
        cacheEntityId,
        computedState.brightness === 0
          ? {
              ...computedState,
              brightness: cachedAttributes?.brightness > 0 ? cachedAttributes.brightness : null
            }
          : computedState
      );
      return computedState;
    },
    flush() {
      historyStore?.flush();
    },
    clear() {
      lastStateByEntityId.clear();
      historyStore?.clear();
    }
  };
}
/**
 * 构造灯光控制命令。
 */
export function lightCommand(commandEntityId, commandName, commandValue, capabilities) {
  if (!/^(light|switch)\.[a-z0-9_]+$/.test(commandEntityId) || !capabilities.available) {
    throw new Error("设备不可用。");
  }
  const entityDomainName = entityDomainFromId(commandEntityId);
  if (commandName === "power") {
    return {
      domain: entityDomainName,
      service: commandValue ? "turn_on" : "turn_off",
      entityId: commandEntityId,
      data: {}
    };
  }
  if (!Number.isFinite(Number(commandValue))) {
    throw new Error("灯光参数无效。");
  }
  if (commandName === "brightness" && capabilities.brightnessSupported) {
    // 面板用 1–100 的百分比，HA 要 0–255：先夹取再换算，且至少为 1，
    return {
      domain: entityDomainName,
      service: "turn_on",
      entityId: commandEntityId,
      data: {
        brightness: Math.round((Math.max(1, Math.min(100, Number(commandValue))) * 255) / 100)
      }
    };
  }
  if (commandName === "temperature" && capabilities.temperatureSupported) {
    // 色温一律用开尔文属性下发，并夹到设备声明的区间内。
    return {
      domain: entityDomainName,
      service: "turn_on",
      entityId: commandEntityId,
      data: {
        color_temp_kelvin: Math.round(
          Math.max(capabilities.minimum, Math.min(capabilities.maximum, Number(commandValue)))
        )
      }
    };
  }
  throw new Error("此设备不支持该灯光调节。");
}
/**
 * 创建灯光本地预览：在 HA 回传之前先按用户操作渲染。
 */
export function createLightPreview({ now: previewNow = () => performance.now() } = {}) {
  const previewsByEntityId = new Map();
  let revisionCounter = 0;
  return {
    /**
     * 写入一条预览。
     */
    set(previewEntityId, previewCommand, previewValue, isCommitted = false) {
      // 在旧预览基础上叠加新值；任何一项调节都隐含「灯已打开」，
      const previewValues = {
        ...previewsByEntityId.get(previewEntityId)?.values,
        on: previewCommand === "power" ? previewValue === true : true
      };
      if (previewCommand === "brightness") {
        previewValues.brightness = previewValue;
      }
      if (previewCommand === "temperature") {
        previewValues.kelvin = previewValue;
      }
      if (previewCommand === "preset") {
        // 预设可能同时改亮度与色温，只取其中合法的数值项。
        if (Number.isFinite(previewValue?.brightness)) {
          previewValues.brightness = previewValue.brightness;
        }
        if (Number.isFinite(previewValue?.kelvin)) {
          previewValues.kelvin = previewValue.kelvin;
        }
      }
      if (previewCommand === "power" && !previewValue) {
        // 关机时清掉亮度与色温：留着会让渲染层在「关灯」状态下仍显示旧参数。
        delete previewValues.brightness;
        delete previewValues.kelvin;
      }
      // 15 秒是预览的兜底存活时间：超过它仍未与 HA 对齐就丢弃，
      const previewEntry = {
        values: previewValues,
        revision: ++revisionCounter,
        committed: isCommitted,
        expires: previewNow() + 15000
      };
      previewsByEntityId.set(previewEntityId, previewEntry);
      return previewEntry.revision;
    },
    /**
     * 把预览值叠加到服务器状态上。
     */
    state(stateEntityId, serverState) {
      return {
        ...serverState,
        ...previewsByEntityId.get(stateEntityId)?.values
      };
    },
    /**
     * 与 HA 回传状态对账；一致且已提交，或设备已不可用时清掉预览。
     */
    reconcile(reconcileEntityId, serverEntityState) {
      const pendingPreview = previewsByEntityId.get(reconcileEntityId);
      if (!pendingPreview) {
        return;
      }
      // 逐项比较；数值项必须都落进容差内才算一致。
      const isSettled = Object.entries(pendingPreview.values).every(
        ([previewKey, expectedValue]) =>
          previewKey === "on"
            ? serverEntityState.on === expectedValue
            : Number.isFinite(serverEntityState[previewKey]) &&
              Math.abs(serverEntityState[previewKey] - expectedValue) <=
                (previewKey === "kelvin" ? 15 : 1)
      );
      if (!serverEntityState.available || (pendingPreview.committed && isSettled)) {
        previewsByEntityId.delete(reconcileEntityId);
      }
    },
    /**
     * 把预览降级为「未提交」。
     */
    hold(holdEntityId, holdRevision) {
      const heldPreview = previewsByEntityId.get(holdEntityId);
      if (heldPreview?.revision === holdRevision) {
        heldPreview.committed = false;
      }
    },
    /**
     * 标记预览已提交（命令已发出），并续期存活时间。
     */
    retain(retainEntityId, retainRevision) {
      const retainedPreview = previewsByEntityId.get(retainEntityId);
      if (retainedPreview?.revision === retainRevision) {
        retainedPreview.committed = true;
        retainedPreview.expires = previewNow() + 15000;
      }
    },
    /**
     * 收到 HA 已受理的应答，缩短剩余存活时间。
     */
    acknowledge(acknowledgeEntityId, acknowledgeRevision) {
      const acknowledgedPreview = previewsByEntityId.get(acknowledgeEntityId);
      if (acknowledgedPreview?.revision === acknowledgeRevision) {
        acknowledgedPreview.expires = previewNow() + 8000;
      }
    },
    /**
     * 命令被拒绝：立即丢弃预览，回到服务器状态。
     */
    reject(rejectEntityId, rejectRevision) {
      if (previewsByEntityId.get(rejectEntityId)?.revision === rejectRevision) {
        previewsByEntityId.delete(rejectEntityId);
      }
    },
    /**
     * 清理所有已超时的预览。
     */
    expire() {
      let didExpire = false;
      for (const [expiredEntityId, expiredPreview] of previewsByEntityId) {
        if (expiredPreview.expires <= previewNow()) {
          previewsByEntityId.delete(expiredEntityId);
          didExpire = true;
        }
      }
      return didExpire;
    },
    clear() {
      previewsByEntityId.clear();
    },
    /**
     * 距离最近一次超时还有多久，供调用方设置下一轮 expire 的定时器。
     */
    nextDelay(atMs = previewNow()) {
      let earliestExpiryMs = Infinity;
      for (const previewRecord of previewsByEntityId.values()) {
        earliestExpiryMs = Math.min(earliestExpiryMs, previewRecord.expires);
      }
      return Math.max(0, earliestExpiryMs - atMs);
    }
  };
}
