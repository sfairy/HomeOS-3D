/**
 * 门锁 / 门磁的共用口径：实体归一、安防实体识别、开合折算、门模型展开。
 */

type AnyObj = Record<string, any>;


// 一扇门可以绑定的全部实体槽位；identifyLockEntities 严格按这个顺序产出键。
export const LOCK_ENTITY_FIELDS = [
  "entityId",
  "doorEntityId",
  "batteryEntityId",
  "lowBatteryEntityId",
  "tamperEntityId"
];

/**
 * 状态条目归一：HA 推送有两种形态 —— 直接的状态对象，或带 newState 的变更对象。
 */
const normalizeStateEntry = (entry: any) => entry?.newState || entry;

/**
 * 判断一个状态条目是否「可用」。
 */
const isEntityUsable = (entry: any) =>
  entry &&
  entry.available !== false &&
  !["", "unknown", "unavailable"].includes(String(entry.state ?? ""));

/**
 * 把一个状态条目里所有「可能表示事件」的字段拼成一段可搜索的文本。
 */
const entityStateSignature = (entry: any) => {
  const attributes = entry?.attributes || ({} as AnyObj);
  const eventData = attributes.event_data || attributes.eventData || ({} as AnyObj);
  return [
    entry?.state,
    attributes.event_type,
    attributes.event,
    attributes.action,
    eventData.event_type,
    eventData.event,
    eventData.action
  ]
    .filter((value: any) => value != null)
    .join(" ")
    .trim()
    .toLowerCase();
};

/**
 * 门磁读数 → 开合的词表（唯一权威口径）：key 是状态文本小写归一后的**全等**值。
 */
const DOOR_STATE_TEXTS = new Map([
  ["on", true],
  ["open", true],
  ["opened", true],
  ["opening", true],
  ["door_open", true],
  ["opened_door", true],
  ["打开", true],
  ["已打开", true],
  ["开启", true],
  ["开门", true],
  ["门未关", true],
  ["门虚掩", true],
  ["off", false],
  ["closed", false],
  ["close", false],
  ["closing", false],
  ["door_close", false],
  ["closed_door", false],
  ["关闭", false],
  ["已关闭", false],
  ["关门", false],
  ["已上锁", false],
  ["已开锁", false]
]);

export function doorOpenFromText(stateText: any) {
  const text = String(stateText ?? "").trim().toLowerCase();
  return text && DOOR_STATE_TEXTS.has(text) ? DOOR_STATE_TEXTS.get(text) : null;
}

/**
 * 从单个实体状态推断门磁开合：true 打开 / false 关闭 / null 未知。
 */
export function doorOpenState(entry: any) {
  if (!isEntityUsable(entry)) {
    return null;
  }
  const directRead = doorOpenFromText(entry.state);
  if (directRead !== null) {
    return directRead;
  }
  const signature = entityStateSignature(entry);
  return /(^|[\s_.-])(open|opened|opening|door_open|opened_door|开门|打开|开启)(?=$|[\s_.-])/.test(
    signature
  )
    ? true
    : /(^|[\s_.-])(close|closed|closing|door_close|closed_door|关门|关闭)(?=$|[\s_.-])/.test(
        signature
      )
      ? false
      : null;
}

/**
 * 判断某个实体是否适合填某个门锁槽位（实体识别）。
 */
export function lockEntityRole(entity: any, field: any) {
  if (
    entity.disabledBy != null ||
    entity.disabled_by != null ||
    entity.enabled === false ||
    ["missing", "disabled"].includes(entity.status)
  ) {
    return false;
  }
  const entityId = entity.entityId || entity.entity_id || "";
  const domain = entityId.split(".")[0];
  const deviceClass =
    entity.deviceClass || entity.device_class || entity.attributes?.device_class;
  return field === "entityId"
    ? domain === "lock"
    : field === "doorEntityId"
      ? domain === "binary_sensor" && ["door", "opening"].includes(deviceClass)
      : field === "batteryEntityId"
        ? domain === "sensor" && deviceClass === "battery"
        : field === "lowBatteryEntityId"
          ? domain === "binary_sensor" && deviceClass === "battery"
          : field === "tamperEntityId"
            ? domain === "binary_sensor" && deviceClass === "tamper"
            : false;
}

/**
 * 从一份实体清单里，按槽位唯一地挑出各角色的实体 ID。
 */
export function identifyLockEntities(entities: any) {
  return Object.fromEntries(
    LOCK_ENTITY_FIELDS.map((field: any) => {
      const matched = entities.filter((entity: any) => lockEntityRole(entity, field));
      return [
        field,
        matched.length === 1 ? matched[0].entityId || matched[0].entity_id : ""
      ];
    })
  );
}

/**
 * 事件型门磁的开合折算（single-event / dual-event 共用）。
 */
export function doorEventState(item: any, readState: any) {
  const eventTimestamp = (entityId: any) => {
    const entry = readState(entityId);
    if (!entityId?.startsWith("event.") || !isEntityUsable(entry)) {
      return null;
    }
    const timestamp = /^\d{4}-\d{2}-\d{2}T/.test(String(entry.state))
      ? Date.parse(entry.state)
      : NaN;
    return Number.isFinite(timestamp) ? timestamp : null;
  };
  if (item.doorSource === "dual-event") {
    if (
      !item.doorOpenEntityId ||
      !item.doorCloseEntityId ||
      item.doorOpenEntityId === item.doorCloseEntityId
    ) {
      return null;
    }
    const openTime = eventTimestamp(item.doorOpenEntityId);
    const closeTime = eventTimestamp(item.doorCloseEntityId);
    // 单边读不出时间**不等于**未知：那条事件只是还没发生过，此时「发生过的那条」就是门的
    return (
      openTime === closeTime ||
      [readState(item.doorOpenEntityId), readState(item.doorCloseEntityId)].some(
        entry => !entry || entry.available === false || entry.state === "unavailable"
      )
        ? null
        : openTime === null
          ? false
          : closeTime === null
            ? true
            : openTime > closeTime
    );
  }
  if (eventTimestamp(item.doorEventEntityId) === null) {
    return null;
  }
  const entry = readState(item.doorEventEntityId);
  // 事件值一律小写归一后比较：设备上报 "Open" / 布尔 true / 数字 1，而配置里填的多半是
  const eventValue = String(
    entry.attributes?.[item.doorEventAttribute || "event_type"] ?? ""
  ).trim().toLowerCase();
  const openValue = String(item.doorOpenValue ?? "").trim().toLowerCase();
  const closeValue = String(item.doorCloseValue ?? "").trim().toLowerCase();
  return !openValue || !closeValue || openValue === closeValue
    ? null
    : eventValue === openValue
      ? true
      : eventValue === closeValue
        ? false
        : null;
}

// 锁本体 state → 中文文案；同时充当「哪些 state 认识」的白名单。
const LOCK_STATE_LABELS: AnyObj = {
  locked: "已上锁",
  unlocked: "已解锁",
  locking: "正在上锁",
  unlocking: "正在解锁",
  open: "锁舌已释放",
  opening: "正在释放锁舌",
  jammed: "门锁卡住",
  unavailable: "门锁状态不可用"
};

// 门磁状态文本的可读白名单已上移成 DOOR_STATE_TEXTS（词表即唯一口径）：true 侧与 false 侧

/**
 * 把一条安防「锁」配置折算成完整状态。
 */
export function lockState(item: any, states: any = {}) {
  const readState = (entityId: any) =>
    normalizeStateEntry(states instanceof Map ? states.get(entityId) : states[entityId]);
  const lockEntry = readState(item.entityId);
  const doorEntry = readState(item.doorEntityId);
  const batteryEntry = readState(item.batteryEntityId);
  // 事件型门磁没有独立的门磁实体，开合只能从事件里推断。
  const isEventSource = ["single-event", "dual-event"].includes(item.doorSource);
  const eventState = isEventSource ? doorEventState(item, readState) : null;
  // 只要有任何一个绑定的实体还在线上，这扇门整体就算「可用」。
  const available = !!(
    isEntityUsable(lockEntry) ||
    (isEventSource ? eventState !== null : isEntityUsable(doorEntry)) ||
    isEntityUsable(batteryEntry)
  );
  const state = isEntityUsable(lockEntry) ? lockEntry.state : "unavailable";
  // 门磁读数与门外动画共用 DOOR_STATE_TEXTS 那一份词表（含小米 S2 这类枚举型门状态）；
  const doorOpen = isEventSource
    ? eventState
    : isEntityUsable(doorEntry)
      ? doorOpenFromText(doorEntry.state)
      : null;
  const isOn = (entityId: any) => {
    const entry = readState(entityId);
    return isEntityUsable(entry) && entry.state === "on";
  };
  // 事件型门磁没有独立的门磁实体（doorEntityId 被清空），「有没有绑门磁」要看它那一套事件
  const doorBound = isEventSource
    ? item.doorSource === "single-event"
      ? !!item.doorEventEntityId
      : !!(item.doorOpenEntityId && item.doorCloseEntityId)
    : !!item.doorEntityId;
  const label = lockEntry
    ? LOCK_STATE_LABELS[state] || "门锁状态未知"
    : doorOpen === true
      ? "门已打开"
      : doorOpen === false
        ? "门已关闭"
        : doorBound
          ? "门状态未知"
          : "仅电量";
  return {
    state,
    available,
    label,
    doorOpen,
    doorLabel: doorBound
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
    lowBattery: isOn(item.lowBatteryEntityId),
    tamper: isOn(item.tamperEntityId)
  };
}

/**
 * 门型 → 中文名。既是 doorModels 生成默认名称 / 门牌文案的词表，也是「合法 doorType」的白名单：
 */
const DOOR_TYPE_LABELS: AnyObj = {
  entry: "入户门",
  solid: "木门",
  double: "双开门",
  glass: "玻璃门",
  "sliding-glass": "推拉门",
  "roller-shutter": "卷帘门",
  "frame-only": "门框"
};

/**
 * 把场景配置里的门展开成「与 3D 模型一一对应」的门模型清单。
 */
export function doorModels(config: any) {
  return (
    config?.scene?.doors?.length ? config.scene.doors : config?.doors || []
  ).flatMap((door: any, index: any) => {
    const modelId =
      door?.modelId ||
      (String(door?.id || "").startsWith("door:") ? door.id : "");
    if (modelId && !door?.wallId) {
      const doorType = DOOR_TYPE_LABELS[door.doorType] ? door.doorType : "solid";
      return [
        {
          ...door,
          modelId,
          name: door.name || DOOR_TYPE_LABELS[doorType] + " " + (index + 1),
          doorType,
          doorLabel: door.doorLabel || DOOR_TYPE_LABELS[doorType]
        }
      ];
    }
    const wall = (config.scene?.walls || []).find((wallEntry: any) => wallEntry.id === door.wallId);
    if (!wall) {
      return [];
    }
    const t = Math.max(0, Math.min(1, Number(door.t) || 0));
    const doorType = DOOR_TYPE_LABELS[door.doorType] ? door.doorType : "solid";
    return [
      {
        ...door,
        modelId: "door:" + door.id,
        name: door.name || DOOR_TYPE_LABELS[doorType] + " " + (index + 1),
        doorLabel: DOOR_TYPE_LABELS[doorType],
        x: wall.start.x + (wall.end.x - wall.start.x) * t,
        y: wall.start.y + (wall.end.y - wall.start.y) * t
      }
    ];
  });
}

// 入户门模型与全部门模型同源：早期版本只渲染入户门，别名保留下来给旧调用点使用。
export const entryDoorModels = doorModels;

/**
 * 一条门锁绑定最终生效的门轴方向：配置显式值 → 门模型自带 → 缺省左开。
 * @param {object} lockEntry 门锁绑定（``config.security.locks`` 的一项）。
 * @param {object} floor 该绑定所在楼层（用来取 ``scene.doors`` / ``doors``）。
 * @returns {"left"|"right"}
 */
export function lockHinge(lockEntry: any, floor: any) {
  if (lockEntry?.hinge === "right" || lockEntry?.hinge === "left") {
    return lockEntry.hinge;
  }
  // 与 lock.py 同口径地剥净前缀再补一次：配置侧存的可能是裸门 ID，也可能是 door:<id>。
  const rawModelId = String(lockEntry?.modelId || "").replace(/^(?:door:)+/, "");
  const modelId = rawModelId ? "door:" + rawModelId : "";
  const model = modelId
    ? doorModels(floor).find((candidate: any) => candidate.modelId === modelId)
    : null;
  return model?.hinge === "right" ? "right" : "left";
}
