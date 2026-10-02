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
  noContactTextSet = new Set(["no contact", "分离", "分離"]),
  // 智能门锁自带「门状态」枚举（如 已上锁 / 已开锁 / 门未关 / 门虚掩）：它不是二值门磁，
  // 一个读数同时携带锁舌与门扇信息，但同样能推出门扇开合，所以单独识别。
  // 档位按门扇开度分三类：完全打开（已开锁 / 门未关）、虚掩（只开一条缝）、关闭（已上锁 / 童锁 / 反锁）。
  // 灯下「已开锁」按用户口径算「开」：锁舌收起时门扇通常已经推开了。
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
  // 「门虚掩」在 3D 里只开一条缝：用「完全打开」行程或角度的比例表示，不是写死角度，
  // 这样每扇门自己的 openAngle / 滑动行程仍然生效。
  AJAR_DOOR_OPEN_RATIO = 0.2;
function pendingDoorStateTexts(entry) {
  const rawState = entry.state,
    options = entry.attributes?.options,
    pendingTexts = [String(rawState ?? "")];
  // 少数集成把枚举状态上报成选项下标（0/1/2…）而不是标签。这里补一条按下标取到的
  // 标签一起匹配，避免「实体有 options 但 state 是数字」时又被判成未知。
  if (Array.isArray(options)) {
    const numericIndex = Number(rawState);
    Number.isInteger(numericIndex) &&
      numericIndex >= 0 &&
      numericIndex < options.length &&
      pendingTexts.push(String(options[numericIndex]));
  }
  return pendingTexts.map(normalizeStateText).filter(Boolean);
}
function doorOpenRatioFromText(normalizedText) {
  if (
    noContactTextSet.has(normalizedText) ||
    doorOpenTextSet.has(normalizedText) ||
    ["on", "open", "opened", "打开", "已打开", "开启"].includes(normalizedText)
  )
    return 1;
  // 「虚掩」比完全打开小一档，排在开/关之间判别，别被后面的关闭集合吞掉。
  if (doorAjarTextSet.has(normalizedText)) return AJAR_DOOR_OPEN_RATIO;
  if (
    contactTextSet.has(normalizedText) ||
    doorClosedTextSet.has(normalizedText) ||
    ["off", "closed", "close", "关闭", "已关闭"].includes(normalizedText)
  )
    return 0;
  return null;
}
function doorOpenRatioFromEntry(entry) {
  if (!isEntityUsable(entry)) return null;
  for (const normalizedText of pendingDoorStateTexts(entry)) {
    const readRatio = doorOpenRatioFromText(normalizedText);
    if (readRatio !== null) return readRatio;
  }
  return null;
}
function doorOpenFromEntry(entry) {
  const readRatio = doorOpenRatioFromEntry(entry);
  return readRatio === null ? null : readRatio > 0;
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
function hasDoorStateEnumOptions(entity, deviceClass) {
  // 门锁「门状态」枚举：选项里出现任一「未关 / 虚掩」档位即可认定它是门扇状态来源，
  // 不再要求恰好两个「接触 / 分离」选项（那把 6 档的门锁枚举全挡在门外）。
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
        (["sensor", "binary_sensor"].includes(domain) &&
          hasDoorStateEnumOptions(roleEntity, entityDeviceClass)) ||
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
function doorEventState(item, readEntityState) {
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
    // 门扇开度：1 = 完全打开，0 = 关闭，(0,1) = 虚掩。事件来源只有开/关两态，取 1/0。
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
    doorOpen = doorOpenRatio === null ? null : doorOpenRatio > 0,
    isOn = (onEntityId) => {
      const onEntry = readState(onEntityId);
      return isEntityUsable(onEntry) && onEntry.state === "on";
    },
    label = lockEntry
      ? LOCK_STATE_LABELS[state] || "门锁状态未知"
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
