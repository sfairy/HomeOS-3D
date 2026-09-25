/**
 * 温湿度控件的公共助手（/static/ 共享层）。
 *
 * 场景里的「温湿度计」标记由两个 HA 传感器驱动：一个报温度、一个报湿度。本模块把
 * 「配置里怎么存这两个实体」与「界面上怎么读这两个数」收敛到一处：
 *
 *   - normalizeTemperatureHumidity —— 只保留白名单字段，草稿归一用；
 *   - temperatureHumidityFloorCenter —— 标记在楼层里的缺省落点（包围盒中心）；
 *   - temperatureHumidityReading —— 把一帧状态折算成 { available, value, unit }；
 *   - temperatureHumidityEntities —— 从配置里抽出需要订阅的实体 ID；
 *   - matchesTemperatureHumidityEntity —— 判断一个实体像不像温度 / 湿度传感器。
 *
 * 本模块属于 /static/ 共享层（显示路径与编辑路径都用），因此保持零依赖：不 import
 * 任何东西，也不假设调用方处在 runtime 还是编辑器里。
 *
 * 状态读取一律兼容两种形态：实体状态对象本身，或 { newState: <状态对象> } 包装。
 */

/**
 * 把一条温湿度配置归一成白名单字段。
 *
 * 只挑已知字段而不是整份透传，是为了防止草稿里混入的临时 UI 字段（选中态、拖拽偏移…）
 * 被一起落库。用 Object.hasOwn 判存在，值为 undefined 的显式字段也会被带出去 ——
 * 「显式清空」与「从未设置」在配置里是两件事。
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
 *
 * 优先取所有墙段端点构成的包围盒中心；墙还没画（或端点无效）时退而取现有 items
 * 的包围盒。两个来源都为空就返回 (0, 0)，让新建标记落在原点而不是让调用方拿到 NaN。
 *
 * 中心取 min/max 的中点并按 50 / 100 四舍五入到整数：3D 坐标按像素整数存，
 * 半像素会让标记在相邻格子间抖动。
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
 *
 * 只有状态是有限数字时才认为读到了值：字符串会被 Number 归一，空串、'unknown'、
 * NaN 一律算不可用。不可用时 value 显示破折号而 unit 留空 —— 不要拿上一帧的单位
 * 去配一个空的数值，否则界面会出现「— °C」这种自相矛盾的展示。
 *
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
 *
 * 每一项最多贡献温度、湿度两个实体，空值（未绑定）用 Boolean 过滤掉。
 * flatMap + map 出的对象形状与订阅接口的入参一致，调用方直接展开即可。
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
 *
 * 判定顺序是有意排列的，越靠前越权威：
 *   1. 先做硬性排除：必须是 sensor 域、未禁用、状态不是 missing / disabled；
 *   2. device_class 明确时以它为准；
 *   3. 再按单位推断（°C / °F / ℃ / ℉ / K 视为温度）；
 *   4. 再看实体 ID 里的语义词 —— 电量 / 滤芯 / 寿命 / 进度这类先排除，避免把
 *      「电池温度」之外的 battery 传感器误当温度；
 *   5. 最后只剩中文名称兜底。
 *
 * 逐级回落而不是只信 device_class，是因为大量自定义传感器根本不上报 device_class。
 *
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
  // 名称去掉「温湿度(计|传感器)」这类通用修饰后再找「温度 / 湿度」，避免通用词干扰。
  const bareName = String(entity.name || "").replace(/温湿度(?:计|传感器)?/g, "");
  return kind === "temperature" ? /温度/.test(bareName) : /湿度/.test(bareName);
}
