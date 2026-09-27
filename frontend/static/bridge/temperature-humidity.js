/**
 * 温湿度控件的公共助手（/static/ 共享层）。
 */

/**
 * 把一条温湿度配置归一成白名单字段。
 */
export function normalizeTemperatureHumidity(item) {
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
export function temperatureHumidityFloorCenter(level) {
  const plan = level?.plan || level?.scene || {};
  let points = (plan.walls || [])
    .flatMap(wall => [wall.start, wall.end])
    .filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  if (!points.length) {
    points = (plan.items || []).filter(
      item => Number.isFinite(item.x) && Number.isFinite(item.y)
    );
  }
  const centerOf = axis =>
    points.length
      ? Math.round(
          ((Math.min(...points.map(p => p[axis])) + Math.max(...points.map(p => p[axis]))) * 50) / 100
        )
      : 0;
  return { x: centerOf("x"), y: centerOf("y") };
}

/**
 * 把一帧实体状态折算成可展示的读数。
 * @param {object} state 实体状态对象，或 { newState } 包装。
 */
export function temperatureHumidityReading(state) {
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
    unit: available ? String(liveState.attributes?.unit_of_measurement || "") : ""
  };
}

/**
 * 从温湿度配置列表里抽出需要订阅的实体 ID。
 */
export function temperatureHumidityEntities(items = []) {
  return items.flatMap(item =>
    [item.temperatureEntityId, item.humidityEntityId]
      .filter(Boolean)
      .map(entityId => ({ entityId }))
  );
}

/**
 * 判断一个实体该不该出现在温湿度选择项里；kind 为 'temperature' 或 'humidity'。
 * @param {object} entity 实体注册项。
 * @param {string} kind 'temperature' | 'humidity'。
 * @param {object} state 实体状态对象，或 { newState } 包装。
 */
export function matchesTemperatureHumidityEntity(entity, kind, state) {
  if (
    !/^sensor\.[a-z0-9_]+$/.test(entity.entityId || "") ||
    entity.disabledBy != null ||
    entity.disabled_by != null ||
    entity.enabled === false ||
    ["missing", "disabled"].includes(entity.status)
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
  if (["°C", "°F", "℃", "℉", "K"].includes(unit)) {
    return kind === "temperature";
  }
  const normalizedId = entity.entityId.toLowerCase();
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
