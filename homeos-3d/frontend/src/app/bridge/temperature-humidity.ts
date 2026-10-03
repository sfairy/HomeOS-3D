/** 环境标签的默认信息框宽度与文字大小。 */
export const DEFAULT_LABEL_SIZE = 360;
export const DEFAULT_LABEL_ICON_SIZE = 21;
/** 编辑器与运行时共用的尺寸上下限。 */
export const MAX_LABEL_SIZE = 800;
export const MAX_LABEL_ICON_SIZE = 32;
/** 下限沿用历史值，避免出现无法阅读的卡片。 */
export const MIN_LABEL_SIZE = 100;
export const MIN_LABEL_ICON_SIZE = 9;
export const ENVIRONMENT_METRICS = [
    {
      key: "temperature",
      label: "温度",
      icon: "thermometer",
      classes: ["temperature"],
      names: /(?:^|[_. ])(?:temperature|temp)(?:_|$)|温度/i,
    },
    {
      key: "humidity",
      label: "湿度",
      icon: "water-percent",
      classes: ["humidity"],
      names: /(?:^|[_. ])(?:humidity|relative_humidity)(?:_|$)|湿度/i,
    },
    {
      key: "formaldehyde",
      label: "甲醛",
      icon: "molecule",
      classes: ["formaldehyde"],
      names: /(?:^|[_. ])(?:formaldehyde|hcho)(?:_|$)|甲醛/i,
    },
    {
      key: "pm25",
      label: "PM2.5",
      icon: "blur",
      classes: ["pm25"],
      names: /(?:^|[_. ])pm_?2[._]?5(?:_|$| )/i,
    },
    {
      key: "pm10",
      label: "PM10",
      icon: "grain",
      classes: ["pm10"],
      names: /(?:^|[_. ])pm_?10(?:_|$| )/i,
    },
    {
      key: "co2",
      label: "CO₂",
      icon: "molecule-co2",
      classes: ["carbon_dioxide"],
      names: /(?:^|[_. ])(?:co2|co₂|carbon_dioxide)(?:_|$)|二氧化碳/i,
    },
    {
      key: "tvoc",
      label: "TVOC",
      icon: "flask-outline",
      classes: ["volatile_organic_compounds", "volatile_organic_compounds_parts"],
      names: /(?:^|[_. ])(?:tvoc|voc|volatile_organic_compounds)(?:_|$)|挥发性有机物/i,
    },
    {
      key: "aqi",
      label: "AQI",
      icon: "air-filter",
      classes: ["aqi"],
      names: /(?:^|[_. ])aqi(?:_|$)|空气质量指数/i,
    },
    {
      key: "illuminance",
      label: "光照",
      icon: "white-balance-sunny",
      classes: ["illuminance"],
      names: /(?:^|[_. ])(?:illuminance|illumi|lux)(?:_|$)|光照|照度/i,
    },
  ],
  ENVIRONMENT_BATTERY = {
    key: "battery",
    label: "电量",
    icon: "battery",
    classes: ["battery"],
    names: /(?:^|[_. ])(?:battery|battery_level)(?:_|$)|电量|电池/i,
  },
  ENVIRONMENT_SENSORS = [...ENVIRONMENT_METRICS, ENVIRONMENT_BATTERY];
const layoutSignatureByElement = new WeakMap();
export function layoutEnvironmentReadings(hostElement, requestedColumnCount = 0) {
  if (!hostElement.isConnected) return;
  const selector = hostElement.querySelector(".i3d-temperature-humidity-values"),
    filter = [...selector.children].filter((visibleCellElement) => !visibleCellElement.hidden),
    contains = hostElement.classList.contains("is-metric-names-hidden"),
    num =
      Number.isInteger(requestedColumnCount) &&
      requestedColumnCount >= 1 &&
      requestedColumnCount <= 4
        ? requestedColumnCount
        : 0,
    join = [
      hostElement.style.width,
      hostElement.style.fontSize,
      contains,
      num,
      ...filter.map((signatureCellElement) => signatureCellElement.textContent),
    ].join("|");
  if (layoutSignatureByElement.get(hostElement) === join) return;
  (selector.classList.remove("is-meter-narrow"),
    selector.classList.remove("is-meter-stacked"),
    selector.classList.add("is-meter-measuring"));
  const defaultView = hostElement.ownerDocument.defaultView,
    gridColumnGapPx = parseFloat(defaultView.getComputedStyle(selector).columnGap) || 0,
    list = [0, 0, 0, 0];
  let maxCellColumnGapPx = 0;
  filter.forEach((metricCellElement) => {
    ((maxCellColumnGapPx = Math.max(
      maxCellColumnGapPx,
      parseFloat(defaultView.getComputedStyle(metricCellElement).columnGap) || 0,
    )),
      [...metricCellElement.children].forEach((cellChildElement, childIndex) => {
        cellChildElement.hidden ||
          (list[childIndex] = Math.max(list[childIndex] || 0, cellChildElement.offsetWidth));
      }));
  });
  const clientWidth = selector.clientWidth,
    max = Math.max(
      1,
      list.reduce((accumulatedWidth, columnWidth) => accumulatedWidth + columnWidth, 0) +
        (contains ? 2 : 3) * maxCellColumnGapPx,
    ),
    columnCount = Math.max(
      1,
      Math.min(
        filter.length,
        num || Math.floor((clientWidth + gridColumnGapPx) / (max + gridColumnGapPx)),
      ),
    ),
    cellWidthPx = Math.max(1, (clientWidth - (columnCount - 1) * gridColumnGapPx) / columnCount);
  (selector.style.setProperty("--meter-unit-width", list[3] + "px"),
    selector.style.setProperty("--meter-cell-width", cellWidthPx + "px"),
    (selector.style.gridTemplateColumns = "repeat(" + columnCount + ", minmax(0, 1fr))"),
    selector.classList.remove("is-meter-measuring"),
    selector.classList.toggle("is-meter-narrow", max > cellWidthPx),
    selector.classList.toggle(
      "is-meter-stacked",
      max > cellWidthPx && cellWidthPx < list[0] * 2 + maxCellColumnGapPx * 2,
    ),
    clientWidth > 0 && layoutSignatureByElement.set(hostElement, join));
}
export function normalizeTemperatureHumidity(rawConfig) {
  const allowedFieldNames = [
    "id",
    "floorId",
    "label",
    ...ENVIRONMENT_SENSORS.map(({ key: metricKey }) => metricKey + "EntityId"),
    "x",
    "y",
    "height",
    "size",
    "iconSize",
    "hitSize",
    "visible",
    "opacity",
    "showMetricNames",
    "columns",
  ];
  return Object.fromEntries(
    allowedFieldNames
      .filter((fieldName) => Object.hasOwn(rawConfig, fieldName))
      .map((retainedFieldName) => [retainedFieldName, rawConfig[retainedFieldName]]),
  );
}
export function temperatureHumidityFloorCenter(floor) {
  const options = floor?.plan || floor?.scene || {};
  let floorPlanPoints = (options.walls || [])
    .flatMap((wall) => [wall.start, wall.end])
    .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  floorPlanPoints.length ||
    (floorPlanPoints = (options.items || []).filter(
      (floorItem) => Number.isFinite(floorItem.x) && Number.isFinite(floorItem.y),
    ));
  const resolveAxisCenter = (axisName) =>
    floorPlanPoints.length
      ? Math.round(
          (Math.min(...floorPlanPoints.map((minCandidatePoint) => minCandidatePoint[axisName])) +
            Math.max(...floorPlanPoints.map((maxCandidatePoint) => maxCandidatePoint[axisName]))) *
            50,
        ) / 100
      : 0;
  return {
    x: resolveAxisCenter("x"),
    y: resolveAxisCenter("y"),
  };
}
export function temperatureHumidityReading(readingState) {
  const entityState = readingState?.newState || readingState,
    stateValue = entityState?.state,
    finite =
      entityState?.available !== false &&
      ["string", "number"].includes(typeof stateValue) &&
      String(stateValue).trim() !== "" &&
      Number.isFinite(Number(stateValue));
  return {
    available: finite,
    value: finite ? String(stateValue) : "—",
    unit: finite ? String(entityState.attributes?.unit_of_measurement || "") : "",
  };
}
export function temperatureHumidityEntities(widgetConfigs = []) {
  return widgetConfigs.flatMap((widgetConfig) =>
    ENVIRONMENT_SENSORS.map(
      ({ key: sensorMetricKey }) => widgetConfig[sensorMetricKey + "EntityId"],
    )
      .filter(Boolean)
      .map((entityId) => ({
        entityId: entityId,
      })),
  );
}
export function matchesTemperatureHumidityEntity(entityConfig, targetMetricKey, matchState) {
  if (
    !/^sensor\.[a-z0-9_]+$/.test(entityConfig.entityId || "") ||
    entityConfig.disabledBy != null ||
    entityConfig.disabled_by != null ||
    entityConfig.enabled === false ||
    ["missing", "disabled"].includes(entityConfig.status)
  )
    return false;
  const stateAttributes = (matchState?.newState || matchState)?.attributes || {},
    device_class =
      stateAttributes.device_class ||
      entityConfig.deviceClass ||
      entityConfig.device_class ||
      entityConfig.attributes?.device_class,
    matchedMetric = ENVIRONMENT_SENSORS.find(
      (candidateMetric) => candidateMetric.key === targetMetricKey,
    );
  if (!matchedMetric) return false;
  if (device_class) return matchedMetric.classes.includes(device_class);
  const text =
    stateAttributes.unit_of_measurement ||
    entityConfig.unitOfMeasurement ||
    entityConfig.unit_of_measurement ||
    entityConfig.attributes?.unit_of_measurement ||
    "";
  if (["°C", "°F", "℃", "℉", "K"].includes(text)) return targetMetricKey === "temperature";
  if (["lx", "lux"].includes(text)) return targetMetricKey === "illuminance";
  const lowerCase = entityConfig.entityId.toLowerCase();
  if (/(?:^|[_.])(?:filter|life|progress)(?:_|$)/.test(lowerCase)) return false;
  const nameMatchedMetric = ENVIRONMENT_SENSORS.find((metric) => metric.names.test(lowerCase));
  if (nameMatchedMetric) return nameMatchedMetric.key === targetMetricKey;
  const replace = String(entityConfig.name || "").replace(/温湿度(?:计|传感器)?/g, "");
  return (
    matchedMetric.names.test(replace) ||
    matchedMetric.names.test(replace.replace(/[\u4e00-\u9fff]/g, " "))
  );
}
