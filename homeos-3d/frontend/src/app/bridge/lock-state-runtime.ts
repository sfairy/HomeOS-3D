export const LOCK_ENTITY_FIELDS = [
  "entityId",
  "doorEntityId",
  "batteryEntityId",
  "lowBatteryEntityId",
  "tamperEntityId",
];
const normalizeStateEntry = (stateEntry) => stateEntry?.newState || stateEntry,
  isEntityUsable = (usableEntry) =>
    usableEntry &&
    usableEntry.available !== false &&
    !["", "unknown", "unavailable"].includes(String(usableEntry.state ?? "")),
  normalizeStateText = (rawText) =>
    typeof rawText == "string"
      ? rawText
          .trim()
          .toLowerCase()
          .replace(/[\s_-]+/g, " ")
      : "",
  contactTextSet = new Set(["contact", "接触", "接觸"]),
  noContactTextSet = new Set(["no contact", "分离", "分離"]);
function doorOpenFromEntry(entry) {
  if (!isEntityUsable(entry)) return null;
  const normalizedText = normalizeStateText(entry.state);
  return noContactTextSet.has(normalizedText) ||
    ["on", "open", "opened", "打开", "已打开", "开启"].includes(normalizedText)
    ? true
    : contactTextSet.has(normalizedText) ||
        ["off", "closed", "close", "关闭", "已关闭"].includes(normalizedText)
      ? false
      : null;
}
function hasContactEnumOptions(entity, deviceClass) {
  const options = entity.attributes?.options;
  return (
    deviceClass === "enum" &&
    Array.isArray(options) &&
    options.length === 2 &&
    options.some((noContactOption) => noContactTextSet.has(normalizeStateText(noContactOption))) &&
    options.some((contactOption) => contactTextSet.has(normalizeStateText(contactOption)))
  );
}
function isXiaomiContactSensor(sensorEntity) {
  return (
    sensorEntity.platform === "xiaomi_home" &&
    /_contact_state_p_\d+_\d+$/.test(sensorEntity.uniqueId || sensorEntity.unique_id || "")
  );
}
const entityStateSignature = (signatureEntry) => {
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
export function doorOpenState(doorStateEntry) {
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
export function lockEntityRole(roleEntity, field) {
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
        (["sensor", "binary_sensor"].includes(domain) && isXiaomiContactSensor(roleEntity))
      : field === "batteryEntityId"
        ? domain === "sensor" && entityDeviceClass === "battery"
        : field === "lowBatteryEntityId"
          ? domain === "binary_sensor" && entityDeviceClass === "battery"
          : field === "tamperEntityId"
            ? domain === "binary_sensor" && entityDeviceClass === "tamper"
            : false;
}
export function identifyLockEntities(entities) {
  return Object.fromEntries(
    LOCK_ENTITY_FIELDS.map((entityField) => {
      const matched = entities.filter((candidateEntity) =>
        lockEntityRole(candidateEntity, entityField),
      );
      return [entityField, matched.length === 1 ? matched[0].entityId || matched[0].entity_id : ""];
    }),
  );
}
export function doorEventState(item, readEntityState) {
  const eventTimestamp = (eventEntityId) => {
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
export function lockState(lockItem, states = {}) {
  const readState = (targetEntityId) =>
      normalizeStateEntry(
        states instanceof Map ? states.get(targetEntityId) : states[targetEntityId],
      ),
    lockEntry = readState(lockItem.entityId),
    doorEntry = readState(lockItem.doorEntityId),
    batteryEntry = readState(lockItem.batteryEntityId),
    isEventSource = ["single-event", "dual-event"].includes(lockItem.doorSource),
    eventState = isEventSource ? doorEventState(lockItem, readState) : null,
    isAvailable = !!(
      isEntityUsable(lockEntry) ||
      (isEventSource ? eventState !== null : isEntityUsable(doorEntry)) ||
      isEntityUsable(batteryEntry)
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
    doorOpen = isEventSource ? eventState : doorOpenFromEntry(doorEntry),
    isOn = (onEntityId) => {
      const onEntry = readState(onEntityId);
      return isEntityUsable(onEntry) && onEntry.state === "on";
    },
    label = lockEntry
      ? LOCK_STATE_LABELS[state] || "门锁状态未知"
      : doorOpen === true
        ? "门已打开"
        : doorOpen === false
          ? "门已关闭"
          : lockItem.doorEntityId
            ? "门状态未知"
            : "仅电量";
  return {
    state: state,
    available: isAvailable,
    label: label,
    doorOpen: doorOpen,
    doorLabel: lockItem.doorEntityId
      ? doorOpen === null
        ? "门状态未知"
        : doorOpen
          ? "门已打开"
          : "门已关闭"
      : "未绑定门磁",
    busy: ["locking", "unlocking", "opening"].includes(state),
    canOpen:
      !!isEntityUsable(lockEntry) &&
      ((Number(lockEntry?.attributes?.supported_features) || 0) & 1) !== 0,
    codeRequired: !!lockEntry?.attributes?.code_format,
    battery: isEntityUsable(batteryEntry)
      ? "" + batteryEntry.state + (batteryEntry.attributes?.unit_of_measurement || "%")
      : "—",
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
export function doorModels(config) {
  return (config?.scene?.doors?.length ? config.scene.doors : config?.doors || []).flatMap(
    (door, index) => {
      const modelId = door?.modelId || (String(door?.id || "").startsWith("door:") ? door.id : "");
      if (modelId && !door?.wallId) {
        const doorType = DOOR_TYPE_LABELS[door.doorType] ? door.doorType : "solid";
        return [
          {
            ...door,
            modelId: modelId,
            name: door.name || DOOR_TYPE_LABELS[doorType] + " " + (index + 1),
            doorType: doorType,
            doorLabel: door.doorLabel || DOOR_TYPE_LABELS[doorType],
          },
        ];
      }
      const wall = (config.scene?.walls || []).find((wallEntry) => wallEntry.id === door.wallId);
      if (!wall) return [];
      const positionRatio = Math.max(0, Math.min(1, Number(door.t) || 0)),
        resolvedDoorType = DOOR_TYPE_LABELS[door.doorType] ? door.doorType : "solid";
      return [
        {
          ...door,
          modelId: "door:" + door.id,
          name: door.name || DOOR_TYPE_LABELS[resolvedDoorType] + " " + (index + 1),
          doorLabel: DOOR_TYPE_LABELS[resolvedDoorType],
          x: wall.start.x + (wall.end.x - wall.start.x) * positionRatio,
          y: wall.start.y + (wall.end.y - wall.start.y) * positionRatio,
        },
      ];
    },
  );
}
export const entryDoorModels = doorModels;
