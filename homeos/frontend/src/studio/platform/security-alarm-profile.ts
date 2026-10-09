import type { HaEntityEntry } from "@app/utils/ha-entity";

const isAvailableRecord = (record: any) =>
  record &&
  record.disabledBy == null &&
  record.disabled_by == null &&
  record.enabled !== false &&
  !["missing", "disabled"].includes(String(record.status || "").toLowerCase());

const ALARM_DEVICE_CLASSES: Record<string, string[]> = {
  moisture: ["moisture", "water", "leak"],
  smoke: ["smoke", "gas"],
  gas: ["gas", "carbon_monoxide"],
};

/** 小米气感 enum → 内部 status（对齐 0.7.2） */
export const GAS_ENUM_STATES: Record<string, string> = {
  预热: "warming",
  监测正常: "normal",
  监测中: "normal",
  自检: "testing",
  传感器寿命到期: "expired",
  设备故障: "fault",
  天然气泄漏报警: "alarm",
};

/** 0.7.2 烟雾 enum → 内部 status */
export const SMOKE_ENUM_STATES: Record<string, string> = {
  监测正常: "normal",
  监测中: "normal",
  烟雾告警: "alarm",
  设备故障: "fault",
  烟室积灰: "dirty",
  温度过高: "alarm",
};

/** HA event.* 烟雾事件类型（0.7.2 SMOKE_EVENT_TYPE） */
export const SMOKE_EVENT_TYPE = "检测到高浓度烟雾";

export function securityAlarmEntityMode(
  kind: string,
  entity: any = {},
  stateEntry: any = {},
) {
  const stateObject = stateEntry?.newState || stateEntry;
  const deviceClass =
    stateObject?.attributes?.device_class ||
    entity?.attributes?.device_class ||
    entity?.deviceClass ||
    entity?.device_class;
  const entityId = entity?.entityId || "";
  if (!["moisture", "smoke", "gas"].includes(kind)) return "";
  if (/^binary_sensor\.[a-z0-9_]+$/.test(entityId))
    return !deviceClass || deviceClass === kind ? "binary" : "";
  if (kind === "smoke" && /^event\.[a-z0-9_]+$/.test(entityId)) {
    const eventTypes =
      stateObject?.attributes?.event_types ||
      entity?.attributes?.event_types ||
      entity?.eventTypes;
    return (!deviceClass || deviceClass === "smoke") &&
      Array.isArray(eventTypes) &&
      eventTypes.includes(SMOKE_EVENT_TYPE)
      ? "smoke-event"
      : "";
  }
  if (!["gas", "smoke"].includes(kind) || !/^sensor\.[a-z0-9_]+$/.test(entityId)) return "";
  if (deviceClass && deviceClass !== "enum") return "";
  const options =
    stateObject?.attributes?.options || entity?.attributes?.options || entity?.options;
  const alarmOption = kind === "smoke" ? "烟雾告警" : "天然气泄漏报警";
  return Array.isArray(options) &&
    options.includes("监测正常") &&
    options.includes(alarmOption)
    ? kind + "-enum"
    : "";
}

function entityMatchesAlarmKind(entity: HaEntityEntry, kind: string) {
  const deviceClass =
    entity.deviceClass ||
    entity.device_class ||
    entity.attributes?.device_class ||
    "";
  const classToken = String(deviceClass).toLowerCase();
  const haystack = (
    (entity.entityId || "") +
    " " +
    (entity.name || "") +
    " " +
    (entity.translationKey || "")
  ).toLowerCase();
  if (kind === "moisture")
    return (
      ALARM_DEVICE_CLASSES.moisture.includes(classToken) ||
      /moisture|leak|water|水浸|漏水/.test(haystack)
    );
  if (kind === "smoke")
    return (
      classToken === "smoke" ||
      (/smoke|烟雾|烟感/.test(haystack) && !/gas|燃气|天然气/.test(haystack))
    );
  if (kind === "gas")
    return (
      classToken === "gas" ||
      classToken === "enum" ||
      /gas|natural.?gas|燃气|天然气|甲烷/.test(haystack)
    );
  return false;
}

export function alarmDeviceProfiles(
  kind: string,
  entities: HaEntityEntry[] = [],
  devices: any[] = [],
) {
  const devicesById = new Map<string, any>();
  for (const entityEntry of entities) {
    if (!isAvailableRecord(entityEntry)) continue;
    if (!/^(binary_sensor|sensor|event)\.[a-z0-9_]+$/.test(entityEntry.entityId || "")) continue;
    if (!entityMatchesAlarmKind(entityEntry, kind)) continue;
    const deviceId = entityEntry.deviceId || entityEntry.device_id;
    if (!deviceId) continue;
    const registryDevice = devices.find(
      (candidate) => (candidate.id || candidate.deviceId) === deviceId,
    );
    if (registryDevice?.disabledBy != null || registryDevice?.disabled_by != null) continue;
    if (!devicesById.has(deviceId)) {
      devicesById.set(deviceId, {
        deviceId: deviceId,
        name:
          registryDevice?.nameByUser ||
          registryDevice?.name_by_user ||
          registryDevice?.name ||
          entityEntry.name ||
          deviceId,
        entities: [] as HaEntityEntry[],
      });
    }
    devicesById.get(deviceId).entities.push(entityEntry);
  }
  return [...devicesById.values()].map((profile) => ({
    ...profile,
    entities: profile.entities.sort((left: HaEntityEntry, right: HaEntityEntry) =>
      String(left.entityId).localeCompare(String(right.entityId)),
    ),
  }));
}
