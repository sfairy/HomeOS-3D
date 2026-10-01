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
const b = new WeakMap();
export function layoutEnvironmentReadings(arg1, v1 = 0) {
  if (!arg1.isConnected) return;
  const selector = arg1.querySelector(".i3d-temperature-humidity-values"),
    filter = [...selector.children].filter((arg2) => !arg2.hidden),
    contains = arg1.classList.contains("is-metric-names-hidden"),
    num = Number.isInteger(v1) && v1 >= 1 && v1 <= 4 ? v1 : 0,
    join = [
      arg1.style.width,
      arg1.style.fontSize,
      contains,
      num,
      ...filter.map((arg3) => arg3.textContent),
    ].join("|");
  if (b.get(arg1) === join) return;
  (selector.classList.remove("is-meter-narrow"),
    selector.classList.remove("is-meter-stacked"),
    selector.classList.add("is-meter-measuring"));
  const defaultView = arg1.ownerDocument.defaultView,
    num2 = parseFloat(defaultView.getComputedStyle(selector).columnGap) || 0,
    list = [0, 0, 0, 0];
  let num3 = 0;
  filter.forEach((arg4) => {
    ((num3 = Math.max(num3, parseFloat(defaultView.getComputedStyle(arg4).columnGap) || 0)),
      [...arg4.children].forEach((arg5, arg6) => {
        arg5.hidden || (list[arg6] = Math.max(list[arg6] || 0, arg5.offsetWidth));
      }));
  });
  const clientWidth = selector.clientWidth,
    max = Math.max(1, list.reduce((arg7, arg8) => arg7 + arg8, 0) + (contains ? 2 : 3) * num3),
    max2 = Math.max(
      1,
      Math.min(filter.length, num || Math.floor((clientWidth + num2) / (max + num2))),
    ),
    max3 = Math.max(1, (clientWidth - (max2 - 1) * num2) / max2);
  (selector.style.setProperty("--meter-unit-width", list[3] + "px"),
    selector.style.setProperty("--meter-cell-width", max3 + "px"),
    (selector.style.gridTemplateColumns = "repeat(" + max2 + ", minmax(0, 1fr))"),
    selector.classList.remove("is-meter-measuring"),
    selector.classList.toggle("is-meter-narrow", max > max3),
    selector.classList.toggle("is-meter-stacked", max > max3 && max3 < list[0] * 2 + num3 * 2),
    clientWidth > 0 && b.set(arg1, join));
}
export function normalizeTemperatureHumidity(arg9) {
  const list2 = [
    "id",
    "floorId",
    "label",
    ...ENVIRONMENT_SENSORS.map(({ key: v2 }) => v2 + "EntityId"),
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
    list2.filter((arg10) => Object.hasOwn(arg9, arg10)).map((arg11) => [arg11, arg9[arg11]]),
  );
}
export function temperatureHumidityFloorCenter(arg12) {
  const options = arg12?.plan || arg12?.scene || {};
  let filter2 = (options.walls || [])
    .flatMap((arg13) => [arg13.start, arg13.end])
    .filter((arg14) => Number.isFinite(arg14?.x) && Number.isFinite(arg14?.y));
  filter2.length ||
    (filter2 = (options.items || []).filter(
      (arg15) => Number.isFinite(arg15.x) && Number.isFinite(arg15.y),
    ));
  const v3 = (arg16) =>
    filter2.length
      ? Math.round(
          (Math.min(...filter2.map((arg17) => arg17[arg16])) +
            Math.max(...filter2.map((arg18) => arg18[arg16]))) *
            50,
        ) / 100
      : 0;
  return {
    x: v3("x"),
    y: v3("y"),
  };
}
export function temperatureHumidityReading(arg19) {
  const v4 = arg19?.newState || arg19,
    v5 = v4?.state,
    finite =
      v4?.available !== false &&
      ["string", "number"].includes(typeof v5) &&
      String(v5).trim() !== "" &&
      Number.isFinite(Number(v5));
  return {
    available: finite,
    value: finite ? String(v5) : "—",
    unit: finite ? String(v4.attributes?.unit_of_measurement || "") : "",
  };
}
export function temperatureHumidityEntities(v6 = []) {
  return v6.flatMap((arg20) =>
    ENVIRONMENT_SENSORS.map(({ key: v7 }) => arg20[v7 + "EntityId"])
      .filter(Boolean)
      .map((arg21) => ({
        entityId: arg21,
      })),
  );
}
export function matchesTemperatureHumidityEntity(arg22, arg23, arg24) {
  if (
    !/^sensor\.[a-z0-9_]+$/.test(arg22.entityId || "") ||
    arg22.disabledBy != null ||
    arg22.disabled_by != null ||
    arg22.enabled === false ||
    ["missing", "disabled"].includes(arg22.status)
  )
    return false;
  const options2 = (arg24?.newState || arg24)?.attributes || {},
    device_class =
      options2.device_class ||
      arg22.deviceClass ||
      arg22.device_class ||
      arg22.attributes?.device_class,
    v8 = ENVIRONMENT_SENSORS.find((arg25) => arg25.key === arg23);
  if (!v8) return false;
  if (device_class) return v8.classes.includes(device_class);
  const text =
    options2.unit_of_measurement ||
    arg22.unitOfMeasurement ||
    arg22.unit_of_measurement ||
    arg22.attributes?.unit_of_measurement ||
    "";
  if (["°C", "°F", "℃", "℉", "K"].includes(text)) return arg23 === "temperature";
  if (["lx", "lux"].includes(text)) return arg23 === "illuminance";
  const lowerCase = arg22.entityId.toLowerCase();
  if (/(?:^|[_.])(?:filter|life|progress)(?:_|$)/.test(lowerCase)) return false;
  const v9 = ENVIRONMENT_SENSORS.find((arg26) => arg26.names.test(lowerCase));
  if (v9) return v9.key === arg23;
  const replace = String(arg22.name || "").replace(/温湿度(?:计|传感器)?/g, "");
  return v8.names.test(replace) || v8.names.test(replace.replace(/[\u4e00-\u9fff]/g, " "));
}
