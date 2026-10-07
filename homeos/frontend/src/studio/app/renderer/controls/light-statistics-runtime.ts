const onOffDomainSet = new Set(["light", "switch", "input_boolean", "fan", "humidifier", "siren"]),
  runningStateDomainSet = new Set(["climate", "water_heater"]);
function resolveEntityDomain(entityRef: any) {
  const resolvedEntityId =
    typeof entityRef == "string"
      ? entityRef
      : String(entityRef?.entityId || entityRef?.entity_id || "");
  return (
    String(typeof entityRef == "string" ? "" : entityRef?.domain || "")
      .trim()
      .toLowerCase() || resolvedEntityId.split(".", 1)[0].toLowerCase()
  );
}
function isBluetoothOnlineStatusSensor(sensorEntityRef: any) {
  const sensorEntityId =
    typeof sensorEntityRef == "string"
      ? sensorEntityRef
      : String(sensorEntityRef?.entityId || sensorEntityRef?.entity_id || "");
  return (
    resolveEntityDomain(sensorEntityRef) === "sensor" &&
    /(?:^|_)bt_online_status(?:_p_\d+_\d+)?(?:_\d+)?$/i.test(
      sensorEntityId.split(".").slice(1).join("."),
    )
  );
}
export function lightStatisticsEntitySupport(supportEntity: any) {
  const entityDomain = resolveEntityDomain(supportEntity);
  return entityDomain === "virtual" || supportEntity?.virtual
    ? {
        supported: true,
        message: "虚拟实体按当前显示状态统计。",
      }
    : entityDomain === "group"
      ? {
          supported: true,
          message: "群组将作为 1 个实体统计。",
        }
      : onOffDomainSet.has(entityDomain)
        ? {
            supported: true,
            message: "按开启/关闭状态统计。",
          }
        : runningStateDomainSet.has(entityDomain)
          ? {
              supported: true,
              message: "按关闭/运行状态统计。",
            }
          : isBluetoothOnlineStatusSensor(supportEntity)
            ? {
                supported: true,
                message: "按在线/离线状态统计，在线计入数量。",
              }
            : {
                supported: false,
                message: "该实体没有明确的开启/关闭状态。",
              };
}
export function lightStatisticsEntityStateStatus(statusEntity: any, stateSource: any) {
  if (!lightStatisticsEntitySupport(statusEntity).supported) return "abnormal";
  const statusEntityDomain = resolveEntityDomain(statusEntity),
    normalizedState = String(stateSource?.state ?? stateSource ?? "")
      .trim()
      .toLowerCase();
  if (!normalizedState || ["unknown", "unavailable"].includes(normalizedState)) return "abnormal";
  if (isBluetoothOnlineStatusSensor(statusEntity)) {
    const sensorState = normalizedState.replace(/^设备\s*\d+\s*-\s*/, "");
    return ["在线", "online", "on"].includes(sensorState)
      ? "on"
      : ["离线", "offline", "off"].includes(sensorState)
        ? "off"
        : "abnormal";
  }
  return normalizedState === "off"
    ? "off"
    : normalizedState === "on" || runningStateDomainSet.has(statusEntityDomain)
      ? "on"
      : "abnormal";
}
function readLookupEntry(lookupStore: any, lookupKey: any) {
  return typeof lookupStore?.get == "function"
    ? lookupStore.get(lookupKey) || null
    : (lookupStore && typeof lookupStore == "object" && lookupStore[lookupKey]) || null;
}
function readEntityState(stateStore: any, stateKey: any) {
  const rawStateEntry =
    typeof stateStore?.get == "function" ? stateStore.get(stateKey) : stateStore?.[stateKey];
  return rawStateEntry &&
    typeof rawStateEntry == "object" &&
    Object.prototype.hasOwnProperty.call(rawStateEntry, "newState")
    ? rawStateEntry.newState || null
    : rawStateEntry || null;
}
export function lightStatisticsSummary(
  entityIds: any,
  stateByEntityId = new Map(),
  metadataByEntityId = new Map(),
) {
  const uniqueEntityIds: any[] = [],
    seenEntityIdSet = new Set();
  for (const rawEntityId of Array.isArray(entityIds) ? entityIds : []) {
    const candidateEntityId = String(rawEntityId || "").trim();
    !candidateEntityId ||
      seenEntityIdSet.has(candidateEntityId) ||
      (seenEntityIdSet.add(candidateEntityId), uniqueEntityIds.push(candidateEntityId));
  }
  const entitySummaries = uniqueEntityIds.map((entityId) => {
    const metadataEntry = readLookupEntry(metadataByEntityId, entityId) || {},
      stateEntry = readEntityState(stateByEntityId, entityId),
      stateText = String(stateEntry?.state || "")
        .trim()
        .toLowerCase(),
      supportResult = lightStatisticsEntitySupport({
        ...metadataEntry,
        entityId: entityId,
      }),
      stateStatus = lightStatisticsEntityStateStatus(
        {
          ...metadataEntry,
          entityId: entityId,
        },
        stateEntry,
      );
    return {
      entityId: entityId,
      label: String(
        stateEntry?.attributes?.friendly_name ||
          metadataEntry.name ||
          metadataEntry.originalName ||
          entityId,
      ),
      state: stateText,
      status: stateStatus,
      message:
        stateStatus === "abnormal" && supportResult.supported
          ? "当前状态无法判断"
          : supportResult.message,
    };
  });
  return {
    total: entitySummaries.length,
    on: entitySummaries.filter((onEntry) => onEntry.status === "on").length,
    off: entitySummaries.filter((offEntry) => offEntry.status === "off").length,
    abnormal: entitySummaries.filter((abnormalEntry) => abnormalEntry.status === "abnormal").length,
    items: entitySummaries,
  };
}
