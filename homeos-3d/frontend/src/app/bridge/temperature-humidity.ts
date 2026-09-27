/**
 * 温湿度控件的公共助手（/static/ 共享层）。
 */

import type { PropertyBag } from "../types/document.js";

type Point2 = { x?: unknown; y?: unknown; [key: string]: unknown };
type PlanLike = {
  walls?: Array<{ start?: Point2; end?: Point2; [key: string]: unknown }>;
  items?: Point2[];
  [key: string]: unknown;
};
type FloorLevel = {
  plan?: PlanLike;
  scene?: PlanLike;
  [key: string]: unknown;
};
type EntityLike = PropertyBag & {
  entityId?: string;
  disabledBy?: unknown;
  disabled_by?: unknown;
  enabled?: unknown;
  status?: unknown;
  deviceClass?: unknown;
  device_class?: unknown;
  attributes?: PropertyBag;
  unitOfMeasurement?: unknown;
  unit_of_measurement?: unknown;
  name?: unknown;
};
type StateLike = {
  newState?: PropertyBag & { state?: unknown; available?: unknown; attributes?: PropertyBag };
  state?: unknown;
  available?: unknown;
  attributes?: PropertyBag;
  [key: string]: unknown;
};

/**
 * 把一条温湿度配置归一成白名单字段。
 */
export function normalizeTemperatureHumidity(item: PropertyBag) {
  return Object.fromEntries(
    [
      "id",
      "floorId",
      "label",
      "temperatureEntityId",
      "humidityEntityId",
      "x",
      "y",
      "height",
      "size",
      "iconSize",
      "hitSize",
      "visible"
    ]
      .filter(key => Object.hasOwn(item, key))
      .map(key => [key, item[key]])
  );
}

/**
 * 楼层里温湿度标记的缺省中心点。
 */
export function temperatureHumidityFloorCenter(level: FloorLevel | null | undefined) {
  const plan = level?.plan || level?.scene || {};
  let points: Point2[] = (plan.walls || [])
    .flatMap(wall => [wall.start, wall.end])
    .filter(
      (point): point is Point2 =>
        !!point && Number.isFinite(point?.x as number) && Number.isFinite(point?.y as number)
    );
  if (!points.length) {
    points = (plan.items || []).filter(
      item => Number.isFinite(item.x as number) && Number.isFinite(item.y as number)
    );
  }
  const centerOf = (axis: "x" | "y") =>
    points.length
      ? Math.round(
          ((Math.min(...points.map(p => Number(p[axis]))) +
            Math.max(...points.map(p => Number(p[axis])))) *
            50) /
            100
        )
      : 0;
  return { x: centerOf("x"), y: centerOf("y") };
}

/**
 * 把一帧实体状态折算成可展示的读数。
 * @param {object} state 实体状态对象，或 { newState } 包装。
 */
export function temperatureHumidityReading(state: StateLike | null | undefined) {
  const liveState = state?.newState || state;
  const rawValue = liveState?.state;
  const available =
    liveState?.available !== false &&
    ["string", "number"].includes(typeof rawValue) &&
    String(rawValue).trim() !== "" &&
    Number.isFinite(Number(rawValue));
  return {
    available,
    value: available ? String(rawValue) : "—",
    unit: available ? String(liveState?.attributes?.unit_of_measurement || "") : ""
  };
}

/**
 * 从温湿度配置列表里抽出需要订阅的实体 ID。
 */
export function temperatureHumidityEntities(items: PropertyBag[] = []) {
  return items.flatMap(item =>
    [item.temperatureEntityId, item.humidityEntityId]
      .filter(Boolean)
      .map(entityId => ({ entityId: String(entityId) }))
  );
}

/**
 * 判断一个实体该不该出现在温湿度选择项里；kind 为 'temperature' 或 'humidity'。
 * @param {object} entity 实体注册项。
 * @param {string} kind 'temperature' | 'humidity'。
 * @param {object} state 实体状态对象，或 { newState } 包装。
 */
export function matchesTemperatureHumidityEntity(
  entity: EntityLike,
  kind: string,
  state: StateLike | null | undefined
) {
  if (
    !/^sensor\.[a-z0-9_]+$/.test(entity.entityId || "") ||
    entity.disabledBy != null ||
    entity.disabled_by != null ||
    entity.enabled === false ||
    ["missing", "disabled"].includes(String(entity.status))
  ) {
    return false;
  }
  const liveAttributes = (state?.newState || state)?.attributes || {};
  const deviceClass =
    liveAttributes.device_class ||
    entity.deviceClass ||
    entity.device_class ||
    entity.attributes?.device_class;
  if (deviceClass) {
    return deviceClass === kind;
  }
  const unit =
    liveAttributes.unit_of_measurement ||
    entity.unitOfMeasurement ||
    entity.unit_of_measurement ||
    entity.attributes?.unit_of_measurement ||
    "";
  if (["°C", "°F", "℃", "℉", "K"].includes(String(unit))) {
    return kind === "temperature";
  }
  const normalizedId = String(entity.entityId || "").toLowerCase();
  if (/(?:^|[_.])(?:battery|filter|life|progress)(?:_|$)/.test(normalizedId)) {
    return false;
  }
  if (/(?:^|[_.])(?:humidity|relative_humidity)(?:_|$)/.test(normalizedId)) {
    return kind === "humidity";
  }
  if (/(?:^|[_.])(?:temperature|temp)(?:_|$)/.test(normalizedId)) {
    return kind === "temperature";
  }
  const bareName = String(entity.name || "").replace(/温湿度(?:计|传感器)?/g, "");
  return kind === "temperature" ? /温度/.test(bareName) : /湿度/.test(bareName);
}
