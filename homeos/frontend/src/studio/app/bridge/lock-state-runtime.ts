export const LOCK_ENTITY_FIELDS = [
  "entityId",
  "doorEntityId",
  "batteryEntityId",
  "battery2EntityId",
  "lowBatteryEntityId",
  "tamperEntityId",
];
const normalizeStateEntry = (stateEntry: any) => stateEntry?.newState || stateEntry,
  isEntityUsable = (usableEntry: any) =>
    usableEntry &&
    usableEntry.available !== false &&
    !["", "unknown", "unavailable"].includes(String(usableEntry.state ?? "")),
  // 电量文案：可用时带单位（默认 %），不可用时回落 "—"（调用方据此判断是否渲染）。
  formatBatteryText = (batteryEntry: any) =>
    isEntityUsable(batteryEntry)
      ? "" + batteryEntry.state + (batteryEntry.attributes?.unit_of_measurement || "%")
      : "—",
  // 电量百分比：仅当设备报的是纯数值（0–100）时给出，供卡片画电量条；"low"/"high" 之类文字态返回 null。
  batteryLevelOf = (batteryEntry: any) => {
    if (!isEntityUsable(batteryEntry)) return null;
    const level = Number(batteryEntry.state);
    return Number.isFinite(level) ? Math.max(0, Math.min(100, level)) : null;
  },
  normalizeStateText = (rawText: any) =>
    typeof rawText == "string"
      ? rawText
          .trim()
          .toLowerCase()
          .replace(/[\s_-]+/g, " ")
      : "",
  contactTextSet = new Set(["contact", "接触", "接觸"]),
  noContactTextSet = new Set(["no contact", "分离", "分離"]),


  doorOpenTextSet = new Set([
    "门未关",
    "未关",
    "已开锁",
    "unlocked",
    "unlock",
    "door open",
    "opened door",
  ]),
  doorAjarTextSet = new Set(["门虚掩", "虚掩", "半掩", "半开", "ajar", "door ajar"]),
  doorClosedTextSet = new Set([
    "已上锁",
    "门已关",
    "已关",
    "开启童锁",
    "开启反锁",
    "locked",
    "door closed",
    "closed door",
  ]),


  AJAR_DOOR_OPEN_RATIO = 0.2;
function pendingDoorStateTexts(entry: any) {
  const rawState = entry.state,
    options = entry.attributes?.options,
    pendingTexts = [String(rawState ?? "")];


  if (Array.isArray(options)) {
    const numericIndex = Number(rawState);
    Number.isInteger(numericIndex) &&
      numericIndex >= 0 &&
      numericIndex < options.length &&
      pendingTexts.push(String(options[numericIndex]));
  }
  return pendingTexts.map(normalizeStateText).filter(Boolean);
}
function doorOpenRatioFromText(normalizedText: any) {
  if (
    noContactTextSet.has(normalizedText) ||
    doorOpenTextSet.has(normalizedText) ||
    ["on", "open", "opened", "打开", "已打开", "开启"].includes(normalizedText)
  )
    return 1;

  if (doorAjarTextSet.has(normalizedText)) return AJAR_DOOR_OPEN_RATIO;
  if (
    contactTextSet.has(normalizedText) ||
    doorClosedTextSet.has(normalizedText) ||
    ["off", "closed", "close", "关闭", "已关闭"].includes(normalizedText)
  )
    return 0;
  return null;
}
function doorOpenRatioFromEntry(entry: any) {
  if (!isEntityUsable(entry)) return null;
  for (const normalizedText of pendingDoorStateTexts(entry)) {
    const readRatio = doorOpenRatioFromText(normalizedText);
    if (readRatio !== null) return readRatio;
  }
  return null;
}
function doorOpenFromEntry(entry: any) {
  const readRatio = doorOpenRatioFromEntry(entry);
  return readRatio === null ? null : readRatio > 0;
}
function hasContactEnumOptions(entity: any, deviceClass: any) {
  const options = entity.attributes?.options;
  return (
    deviceClass === "enum" &&
    Array.isArray(options) &&
    options.length === 2 &&
    options.some((noContactOption) => noContactTextSet.has(normalizeStateText(noContactOption))) &&
    options.some((contactOption) => contactTextSet.has(normalizeStateText(contactOption)))
  );
}
function hasDoorStateEnumOptions(entity: any, deviceClass: any) {


  const options = entity.attributes?.options;
  return (
    deviceClass === "enum" &&
    Array.isArray(options) &&
    options.some((doorStateOption) => {
      const normalizedOption = normalizeStateText(doorStateOption);
      return doorOpenTextSet.has(normalizedOption) || doorAjarTextSet.has(normalizedOption);
    })
  );
}
function isXiaomiContactSensor(sensorEntity: any) {
  return (
    sensorEntity.platform === "xiaomi_home" &&
    /_contact_state_p_\d+_\d+$/.test(sensorEntity.uniqueId || sensorEntity.unique_id || "")
  );
}
const entityStateSignature = (signatureEntry: any) => {
  const attributes = signatureEntry?.attributes || {},
    doorEvent = attributes.event_data || attributes.eventData || {};
  return [
    signatureEntry?.state,
    attributes.event_type,
    attributes.event,
    attributes.action,
    doorEvent.event_type,
    doorEvent.event,
    doorEvent.action,
  ]
    .filter((part) => part != null)
    .join(" ")
    .trim()
    .toLowerCase();
};
export function doorOpenState(doorStateEntry: any) {
  if (!isEntityUsable(doorStateEntry)) return null;
  const directRead = doorOpenFromEntry(doorStateEntry);
  if (directRead !== null) return directRead;
  const signature = entityStateSignature(doorStateEntry);
  return /(^|[\s_.-])(open|opened|opening|door_open|opened_door|开门|打开|开启)(?=$|[\s_.-])/.test(
    signature,
  )
    ? true
    : /(^|[\s_.-])(close|closed|closing|door_close|closed_door|关门|关闭)(?=$|[\s_.-])/.test(
          signature,
        )
      ? false
      : null;
}
export function lockEntityRole(roleEntity: any, field: any) {
  if (
    roleEntity.disabledBy != null ||
    roleEntity.disabled_by != null ||
    roleEntity.enabled === false ||
    ["missing", "disabled"].includes(roleEntity.status)
  )
    return false;
  const entityId = roleEntity.entityId || roleEntity.entity_id || "",
    domain = entityId.split(".")[0],
    entityDeviceClass =
      roleEntity.deviceClass || roleEntity.device_class || roleEntity.attributes?.device_class;
  return field === "entityId"
    ? domain === "lock"
    : field === "doorEntityId"
      ? (domain === "binary_sensor" && ["door", "opening"].includes(entityDeviceClass)) ||
        (domain === "sensor" && hasContactEnumOptions(roleEntity, entityDeviceClass)) ||
        (["sensor", "binary_sensor"].includes(domain) &&
          hasDoorStateEnumOptions(roleEntity, entityDeviceClass)) ||
        (["sensor", "binary_sensor"].includes(domain) && isXiaomiContactSensor(roleEntity))
      : field === "batteryEntityId" || field === "battery2EntityId"
        ? domain === "sensor" && entityDeviceClass === "battery"
        : field === "lowBatteryEntityId"
          ? domain === "binary_sensor" && entityDeviceClass === "battery"
          : field === "tamperEntityId"
            ? domain === "binary_sensor" && entityDeviceClass === "tamper"
            : false;
}
/** 从实体名称/ID 里嗅探电池类型；识别不出来时返回 null，交给设备上报顺序决定。 */
const batteryKindOf = (candidateEntity: any) => {
  const nameText = [
    candidateEntity?.name,
    candidateEntity?.friendly_name,
    candidateEntity?.original_name,
    candidateEntity?.attributes?.friendly_name,
    candidateEntity?.entityId,
    candidateEntity?.entity_id,
  ]
    .filter((namePart) => typeof namePart === "string" && namePart)
    .join(" ")
    .toLowerCase();
  if (!nameText) return null;
  if (/锂|lithium|li-ion|li_ion|recharge|充电/.test(nameText)) return "lithium";
  if (/干电池|干电|dry|alkaline/.test(nameText)) return "dry";
  return null;
};
export function identifyLockEntities(entities: any) {
  const entityIdOf = (candidateEntity: any) =>
      candidateEntity?.entityId || candidateEntity?.entity_id || "",
    matchedEntities = (entityField: string) =>
      entities.filter((candidateEntity: any) => lockEntityRole(candidateEntity, entityField)),
    // 不少门锁同时上报两路电量：batteryEntityId 固定是锂电池、battery2EntityId 固定是干电池。
    // 优先按实体名里的「锂 / 干电池」线索配对，认不出来再退回设备上报顺序；
    // 只有一路时第二槽位留空，避免两槽指向同一实体。
    batteryMatches = matchedEntities("batteryEntityId");
  let primaryBattery = batteryMatches[0],
    secondaryBattery = batteryMatches[1];
  if (batteryMatches.length > 1) {
    const lithiumBattery = batteryMatches.find(
        (candidateEntity: any) => batteryKindOf(candidateEntity) === "lithium",
      ),
      dryBattery = batteryMatches.find(
        (candidateEntity: any) => batteryKindOf(candidateEntity) === "dry",
      );
    // 两路都能认出类型且不冲突时才按类型配对；认不全就保持设备上报顺序，不乱猜。
    if (lithiumBattery && dryBattery && lithiumBattery !== dryBattery) {
      primaryBattery = lithiumBattery;
      secondaryBattery = dryBattery;
    }
  }
  return Object.fromEntries(
    LOCK_ENTITY_FIELDS.map((entityField): [string, string] => {
      if (entityField === "batteryEntityId")
        return [entityField, primaryBattery ? entityIdOf(primaryBattery) : ""];
      if (entityField === "battery2EntityId")
        return [entityField, secondaryBattery ? entityIdOf(secondaryBattery) : ""];
      const matched = matchedEntities(entityField);
      return [entityField, matched.length === 1 ? entityIdOf(matched[0]) : ""];
    }),
  );
}
function doorEventState(item: any, readEntityState: any) {
  const eventTimestamp = (eventEntityId: any) => {
    const eventEntry = readEntityState(eventEntityId);
    if (!eventEntityId?.startsWith("event.") || !isEntityUsable(eventEntry)) return null;
    const timestamp = /^\d{4}-\d{2}-\d{2}T/.test(String(eventEntry.state))
      ? Date.parse(eventEntry.state)
      : NaN;
    return Number.isFinite(timestamp) ? timestamp : null;
  };
  if (item.doorSource === "dual-event") {
    if (
      !item.doorOpenEntityId ||
      !item.doorCloseEntityId ||
      item.doorOpenEntityId === item.doorCloseEntityId
    )
      return null;
    const openTime = eventTimestamp(item.doorOpenEntityId),
      closeTime = eventTimestamp(item.doorCloseEntityId);
    return openTime === closeTime ||
      [readEntityState(item.doorOpenEntityId), readEntityState(item.doorCloseEntityId)].some(
        (checkedEntry) =>
          !checkedEntry || checkedEntry.available === false || checkedEntry.state === "unavailable",
      )
      ? null
      : openTime === null
        ? false
        : closeTime === null
          ? true
          : openTime > closeTime;
  }
  if (eventTimestamp(item.doorEventEntityId) === null) return null;
  const eventStateEntry = readEntityState(item.doorEventEntityId),
    eventValue = String(
      eventStateEntry.attributes?.[item.doorEventAttribute || "event_type"] ?? "",
    ).trim(),
    openValue = (item.doorOpenValue || "").trim(),
    closeValue = (item.doorCloseValue || "").trim();
  return !openValue || !closeValue || openValue === closeValue
    ? null
    : eventValue === openValue
      ? true
      : eventValue === closeValue
        ? false
        : null;
}
export function lockState(lockItem: any, states: Record<string, any> = {}) {
  const readState = (targetEntityId: any) =>
      normalizeStateEntry(
        states instanceof Map ? states.get(targetEntityId) : (states as any)[targetEntityId],
      ),
    lockEntry = readState(lockItem.entityId),
    doorEntry = readState(lockItem.doorEntityId),
    batteryEntry = readState(lockItem.batteryEntityId),
    battery2Entry = readState(lockItem.battery2EntityId),
    isEventSource = ["single-event", "dual-event"].includes(lockItem.doorSource),
    eventState = isEventSource ? doorEventState(lockItem, readState) : null,

    doorOpenRatio = isEventSource
      ? eventState === null
        ? null
        : eventState
          ? 1
          : 0
      : doorOpenRatioFromEntry(doorEntry),
    doorAjar = doorOpenRatio !== null && doorOpenRatio > 0 && doorOpenRatio < 1,
    doorOpenLabel =
      doorOpenRatio === null
        ? "门状态未知"
        : doorAjar
          ? "门虚掩"
          : doorOpenRatio > 0
            ? "门已打开"
            : "门已关闭",
    isAvailable = !!(
      isEntityUsable(lockEntry) ||
      (isEventSource ? eventState !== null : isEntityUsable(doorEntry)) ||
      isEntityUsable(batteryEntry) ||
      isEntityUsable(battery2Entry)
    ),
    state = isEntityUsable(lockEntry) ? lockEntry.state : "unavailable",
    LOCK_STATE_LABELS = {
      locked: "已上锁",
      unlocked: "已解锁",
      locking: "正在上锁",
      unlocking: "正在解锁",
      open: "锁舌已释放",
      opening: "正在释放锁舌",
      jammed: "门锁卡住",
      unavailable: "门锁状态不可用",
    },
    doorOpen = doorOpenRatio === null ? null : doorOpenRatio > 0,
    isOn = (onEntityId: any) => {
      const onEntry = readState(onEntityId);
      return isEntityUsable(onEntry) && onEntry.state === "on";
    },
    label = lockEntry
      ? (LOCK_STATE_LABELS as any)[state] || "门锁状态未知"
      : lockItem.doorEntityId || isEventSource
        ? doorOpenLabel
        : "仅电量";
  return {
    state: state,
    available: isAvailable,
    label: label,
    doorOpen: doorOpen,
    doorOpenRatio: doorOpenRatio,
    doorAjar: doorAjar,
    doorOpenLabel: doorOpenLabel,
    doorLabel: lockItem.doorEntityId ? doorOpenLabel : "未绑定门磁",
    busy: ["locking", "unlocking", "opening"].includes(state),
    canOpen:
      !!isEntityUsable(lockEntry) &&
      ((Number(lockEntry?.attributes?.supported_features) || 0) & 1) !== 0,
    codeRequired: !!lockEntry?.attributes?.code_format,
    battery: formatBatteryText(batteryEntry),
    battery2: formatBatteryText(battery2Entry),
    batteryLevel: batteryLevelOf(batteryEntry),
    battery2Level: batteryLevelOf(battery2Entry),
    lowBattery: isOn(lockItem.lowBatteryEntityId),
    tamper: isOn(lockItem.tamperEntityId),
  };
}
const DOOR_TYPE_LABELS = {
  entry: "入户门",
  solid: "木门",
  double: "双开门",
  glass: "玻璃门",
  "sliding-glass": "推拉门",
  "roller-shutter": "卷帘门",
  "frame-only": "门框",
};
export function doorModels(config: any) {
  return (config?.scene?.doors?.length ? config.scene.doors : config?.doors || []).flatMap(
    (door: any, index: any) => {
      const modelId = door?.modelId || (String(door?.id || "").startsWith("door:") ? door.id : "");
      if (modelId && !door?.wallId) {
        const doorType = (DOOR_TYPE_LABELS as any)[door.doorType] ? door.doorType : "solid";
        return [
          {
            ...door,
            modelId: modelId,
            name: door.name || (DOOR_TYPE_LABELS as any)[doorType] + " " + (index + 1),
            doorType: doorType,
            doorLabel: door.doorLabel || (DOOR_TYPE_LABELS as any)[doorType],
          },
        ];
      }
      const wall = (config.scene?.walls || []).find((wallEntry: any) => wallEntry.id === door.wallId);
      if (!wall) return [];
      const positionRatio = Math.max(0, Math.min(1, Number(door.t) || 0)),
        resolvedDoorType = (DOOR_TYPE_LABELS as any)[door.doorType] ? door.doorType : "solid";
      return [
        {
          ...door,
          modelId: "door:" + door.id,
          name: door.name || (DOOR_TYPE_LABELS as any)[resolvedDoorType] + " " + (index + 1),
          doorLabel: (DOOR_TYPE_LABELS as any)[resolvedDoorType],
          x: wall.start.x + (wall.end.x - wall.start.x) * positionRatio,
          y: wall.start.y + (wall.end.y - wall.start.y) * positionRatio,
        },
      ];
    },
  );
}
