/**
 * 灯光（light / switch）状态的归一化、历史缓存与本地预览。
 *
 * HA 在灯关闭时通常上报残缺实体（没有 brightness / color_temp），所以本模块除归一化外，
 * 还记住「灯上次是什么样」供下次点亮回填；用户拖滑杆时先按本地值渲染，等 HA 回传后对账，避免跳变。
 *
 * 字段约定：brightness 为 0–255；色温 HA 有 color_temp（mired）与 color_temp_kelvin 两套写法，
 * 换算 kelvin = 1000000 / mired，本模块统一以开尔文对外。
 */

// 状态条目归一（变更对象 / 状态对象两种形态）与「按 ID 切域」只有一份实现（`/static/utils/`
// 里那两份），这里经 static-helpers 桥取用：运行侧（舞台页能以 file: 打开）不能写裸
// `/static/...` 的静态 import，桥按更严的那种口径分流（见该文件里的两条纪律）。
import { entityDomainFromId, resolveStateEntry } from "../core/static-helpers.js?v=2609260842";
/**
 * 判断是否为可用的数值型输入。
 * null、空串、非数字字符串一律视为「缺失」，避免被 Number 转成 0 或 NaN 后混进亮度 / 色温计算。
 */
const isNumericValue = candidateValue =>
  candidateValue != null && candidateValue !== "" && Number.isFinite(Number(candidateValue));
/**
 * HA 的 color_mode 白名单。
 * color_temp 单独判断（走色温通道），其余属「彩光 / 纯亮度」通道；onoff 表示只有开关没有亮度，
 * 是判断「是否支持亮度」的重要反例。
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
 *
 * @param {string} entityId 实体 ID，形如 light.living_room；非 light. 前缀一律视为不可用。
 */
export function lightState(entityId, entityState, fallbackState) {
  const stateObject = resolveStateEntry(entityState, {});
  const attributes = stateObject.attributes || {};
  const supportedColorModes = Array.isArray(attributes.supported_color_modes)
    ? attributes.supported_color_modes
    : [];
  const isLightDomain = entityId.startsWith("light.");
  // color_mode 只接受已知值；不认识的模式（HA 新版本可能新增）回退到历史值，
  // 避免把新模式的灯误判成「不支持色温」。
  const colorMode =
    isLightDomain &&
    (attributes.color_mode === "color_temp" || COLOR_MODE_SET.has(attributes.color_mode))
      ? attributes.color_mode
      : (fallbackState?.colorMode ?? null);
  // 亮度支持判定：优先看 supported_color_modes —— 只要有一种不是 onoff/unknown 就说明可调；
  // 没有该属性时，退化为「上报过 brightness」「supported_features 第 0 位（BRIGHTNESS）」
  // 或「历史值说支持」三者之一。
  const brightnessSupported =
    isLightDomain &&
    (supportedColorModes.length
      ? supportedColorModes.some(supportedMode => !["onoff", "unknown"].includes(supportedMode))
      : isNumericValue(attributes.brightness) ||
        (Number(attributes.supported_features) & 1) !== 0 ||
        fallbackState?.brightnessSupported === true);
  // 色温支持判定同上：优先 supported_color_modes 内含 color_temp，
  // 否则看是否上报过色温上下限 / 当前色温，或 supported_features 第 1 位（COLOR_TEMP）。
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
  // 因此下限开尔文 = 1000000 / max_mireds；两者都没有才用历史值或 2000K 兜底。
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
  // 当前色温：优先开尔文属性；老设备给的是 mired，需换算；都没有则回退历史值。
  // 这里要求 > 0，因为 0 在两种单位下都是无意义值。
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
  // 亮度百分比：state 为 off 且亮度为 0 说明是关机残留值，不能当有效亮度，回退到历史值（也为 0 或缺则 null）。
  // 下限取 Math.max(1, …) 是刻意的：只要不是 0 就至少显示 1%，否则 1/255 会被四舍五入成 0，
  // 用户会看到「开着但亮度为 0」。
  const brightnessPercent =
    rawBrightness !== null && (stateObject.state !== "off" || rawBrightness !== 0)
      ? rawBrightness > 0
        ? Math.max(1, Math.round((rawBrightness / 255) * 100))
        : 0
      : fallbackState?.brightness > 0
        ? fallbackState.brightness
        : null;
  // minimum / maximum 的夹取互相参照，保证即使设备上报的上下限颠倒，
  // 输出仍是合法区间；整体再限制在 1000–20000K 这一现实可用的范围内。
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
 * 也不要让动画拿到 undefined 后出现亮度突变或除零。
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
/** 历史记录保留 7 天：足够覆盖「周末回家发现灯还是上次的亮度」，又不会把存储撑爆。 */
const HISTORY_MAX_AGE_MS = 604800000;
/** 最多跟踪 256 个灯具实体，超出后按最旧记录淘汰，避免无上限增长。 */
const MAX_TRACKED_ENTITIES = 256;
/** 允许记录历史的实体域；switch 也纳入是因为部分灯具被接成了开关。 */
const isLightEntityId = entityIdCandidate => /^(light|switch)\.[a-z0-9_]+$/.test(entityIdCandidate);
/** 属性级数值校验：布尔值不算数值（Number(true) 会变成 1，属于脏数据）。 */
const isNumericAttribute = attributeValue =>
  typeof attributeValue != "boolean" && isNumericValue(attributeValue);
/** 历史记录里每个属性各自的合法性校验，写入与读取两侧共用同一份口径。 */
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
/**
 * 从一次实体上报里抽出「值得写进历史」的属性补丁。
 * 只记录本次确实出现过的属性并逐项经 LIGHT_ATTRIBUTE_VALIDATORS 过滤，历史里不会混入 undefined 或越界值，
 * 也不会用「没上报」的信息覆盖已有记录。
 */
function computeAttributePatch(patchEntityId, patchEntityState) {
  const entityStateBody = resolveStateEntry(patchEntityState, {});
  const entityAttributes = entityStateBody.attributes || {};
  const resolvedLightState = lightState(patchEntityId, patchEntityState);
  const attributePatch = {};
  const patchSupportedColorModes = Array.isArray(entityAttributes.supported_color_modes)
    ? entityAttributes.supported_color_modes
    : [];
  // 下面几个 hasReportedXxx 的写法（> 0 判断 + mired 分支）是刻意的：
  // 只有「设备确实报了一个有意义的正值」才算数，0 与缺失都视为没上报。
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
  // 不支持亮度的灯哪怕报了个 brightness，也不该污染历史。
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
/**
 * 创建灯光历史存储器（localStorage 持久化 + 内存索引）：读取一律当作不可信输入校验，
 * 写入「合并后再存」避免多标签页互冲，写盘节流（默认 50ms），存储不可用时静默降级为只用内存。
 */
function createLightHistoryStore(storage, scope, now, schedule, cancel) {
  // 参数不合法就整体关闭历史功能，调用方会退化成「只有内存缓存」的模式。
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
   *
   * 带时间闸门：未到期且实体数未超限时直接返回，避免每次上报都全量遍历。
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
      // 属性被清空的实体整条删掉，否则会白占名额。
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
  /**
   * 从存储里读出并校验历史：存储内容来自外部（旧版本、其它页面甚至手工篡改），
   * 因此逐层校验顶层版本与结构、实体 ID 形态、属性名与值、时间戳是否落在过去 7 天内。
   * @throws {Error} 顶层结构无法识别时抛出，由调用方按「存储不可用」处理。
   */
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
    // 存储损坏：直接放弃历史功能（返回 null），而不是带病运行。
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
        // 以「时间戳更新的那条为准」做逐属性合并，保证不丢数据。
        for (const [persistedEntityId, persistedAttributes] of readStoredHistory()) {
          const mergedRecords = historyByEntityId.get(persistedEntityId) || {};
          for (const [mergedKey, newerRecord] of Object.entries(persistedAttributes)) {
            if (!mergedRecords[mergedKey] || mergedRecords[mergedKey].at < newerRecord.at) {
              mergedRecords[mergedKey] = newerRecord;
            }
          }
          // 若历史里明确记着「不支持亮度 / 色温」，则把对应的残留数值删掉，
          // 否则换了一批设备（同一实体 ID）后会沿用上一代的无效数值。
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
        // 写失败（配额满 / 隐私模式）后不再重试，避免每次上报都抛异常。
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
    /**
     * 记录一次实体上报，并返回该实体目前累积出的历史属性。
     */
    resolve(resolveEntityId, resolveEntityState) {
      const resolveNowMs = now();
      hasPendingWrites = pruneExpiredRecords(resolveNowMs) || hasPendingWrites;
      if (isLightEntityId(resolveEntityId)) {
        const resolvedPatch = computeAttributePatch(resolveEntityId, resolveEntityState);
        const patchSignature = JSON.stringify(resolvedPatch);
        // 签名相同说明这次上报没有带来新信息，跳过写入（HA 会重复推送同一状态）。
        if (signatureByEntityId.get(resolveEntityId) !== patchSignature) {
          // 先删后设：Map 的迭代顺序即插入顺序，这样最近活跃的实体排在最后，
          // 后面的淘汰逻辑（依赖插入顺序）才能正确清掉最旧的签名。
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
          // 能力一旦被判为不支持，立即清掉对应数值，避免历史里长期留着无效亮度。
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
          // 签名表与历史表用同一个上限；迭代顺序即插入顺序，删的是最旧的。
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
      // 历史里可能只有亮度 / 色温数值而没有能力结论（早期版本写入的数据），
      // 这里按「有值即支持」补一次推论，只在该键缺失时生效（??=）。
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
/**
 * 创建灯光状态缓存：把历史回填与「上一次的对外状态」合到一起。
 */
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
    /**
     * 归一化一个实体，历史可用时用历史补齐缺失字段。
     */
    resolve(cacheEntityId, cacheEntityState) {
      // name 不在历史里（它不算「灯光属性」），因此单独从内存的上次状态里补。
      const cachedAttributes = historyStore
        ? {
            name: lastStateByEntityId.get(cacheEntityId)?.name,
            ...historyStore.resolve(cacheEntityId, cacheEntityState)
          }
        : lastStateByEntityId.get(cacheEntityId);
      const computedState = lightState(cacheEntityId, cacheEntityState, cachedAttributes);
      // 灯灭时 HA 会把 brightness 报成 0，直接用会让「下次开灯」变全黑；
      // 这里把上一次的非零亮度写回缓存，作为下次开灯的默认亮度。
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
 * @throws {Error} 实体非法 / 不可用、参数非数值，或设备不支持该调节。
 */
export function lightCommand(commandEntityId, commandName, commandValue, capabilities) {
  if (!/^(light|switch)\.[a-z0-9_]+$/.test(commandEntityId) || !capabilities.available) {
    throw new Error("设备不可用。");
  }
  // 域走 static-helpers 桥过来的 `entityDomainFromId`（唯一实现仍在 utils/entities.js，
  // 见该模块头）；局部名用 entityDomainName，避免 `entityDomain` 让人误以为它还是
  // 本文件自带的一份实现。上面那行正则已保证 commandEntityId 是字符串。
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
    // 否则 1% 会被换算成 2（四舍五入后的最小值），再小就直接是 0 等于关灯。
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
 * 生命周期：set → retain（已确认提交）→ 值一致后 reconcile 删除；reject 立即删除，无响应则 expire 超时清理。
 * 每个预览带自增 revision，retain/acknowledge/reject 要求 revision 匹配，避免快速连续操作时新旧混淆。
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
      // 只有显式关机的 power 命令才会把 on 写成 false。
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
      // 防止一次丢失的回包让界面永远停在乐观状态。
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
      // 色温容差取 15K：设备对色温普遍会做取整或按档位靠拢，容差太小会一直对不上。
      const isSettled = Object.entries(pendingPreview.values).every(
        ([previewKey, expectedValue]) =>
          previewKey === "on"
            ? serverEntityState.on === expectedValue
            : Number.isFinite(serverEntityState[previewKey]) &&
              Math.abs(serverEntityState[previewKey] - expectedValue) <=
                (previewKey === "kelvin" ? 15 : 1)
      );
      // 设备不可用时预览没有意义；已提交且对账成功则功成身退。
      // 未提交的预览即使对上了也先保留，等释放时再由 retain/reject 决定。
      if (!serverEntityState.available || (pendingPreview.committed && isSettled)) {
        previewsByEntityId.delete(reconcileEntityId);
      }
    },
    /**
     * 把预览降级为「未提交」。
     *
     * 用于连续交互（例如滑杆拖动中）：当前值还会变，不应因一次对账成功就被清掉。
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
     * 应答只代表命令已被接收、状态未必立刻回传，因此不直接删除，而是把超时压到 8 秒，
     * 失败了也能较快退回服务器状态。
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
