import { normalizeCssColor } from "./_shared";
import { doorWindowPerspectiveMatrix } from "../../controls/door-window-runtime";

export function createDoorWindowSensorView(
  sensorComponent: any,
  doorWindowProperties: any,
  sensorState: any,
  sensorRenderEnvironment: any,
) {
  const sensorAccentColor = normalizeCssColor(
      doorWindowProperties.iconOnColor || doorWindowProperties.occupiedColor,
      "#ffffff",
    ),
    isDoorWindowOpen = sensorState.key === "occupied",
    sensorStateLabel = isDoorWindowOpen
      ? "打开"
      : sensorState.key === "clear"
        ? "关闭"
        : sensorState.key === "unavailable"
          ? "离线"
          : "未知",
    doorWindowSensorElement = document.createElement("div");
  ((doorWindowSensorElement.className =
    "hb-door-window-sensor is-" + (isDoorWindowOpen ? "open" : sensorState.key)),
    (doorWindowSensorElement.dataset.sensorState = isDoorWindowOpen ? "open" : sensorState.key),
    doorWindowSensorElement.style.setProperty("--hb-door-window-accent", sensorAccentColor),
    doorWindowSensorElement.setAttribute("role", "img"),
    doorWindowSensorElement.setAttribute("aria-label", "门窗传感器：" + sensorStateLabel));
  const doorWindowVisualElement = document.createElement("div");
  doorWindowVisualElement.className = "hb-door-window-visual";
  const componentScale = Math.max(
      0.01,
      Number(sensorRenderEnvironment.document?.canvas?.componentScale || 1),
    ),
    visualWidth = Math.max(1, Number(sensorComponent.position?.width || 100) / componentScale),
    visualHeight = Math.max(1, Number(sensorComponent.position?.height || 100) / componentScale);
  doorWindowVisualElement.style.transform = doorWindowPerspectiveMatrix(
    visualWidth,
    visualHeight,
    doorWindowProperties.perspectiveCorners,
  );
  const doorWindowFrameElement = document.createElement("span");
  doorWindowFrameElement.className = "hb-door-window-frame";
  const leftPanelElement = document.createElement("span");
  leftPanelElement.className = "hb-door-window-panel left";
  const rightPanelElement = document.createElement("span");
  ((rightPanelElement.className = "hb-door-window-panel right"),
    leftPanelElement.append(document.createElement("i")),
    rightPanelElement.append(document.createElement("i")),
    doorWindowFrameElement.append(leftPanelElement, rightPanelElement));
  const airflowElement = document.createElement("span");
  airflowElement.className = "hb-door-window-airflow";
  for (let airflowDotIndex = 0; airflowDotIndex < 3; airflowDotIndex += 1)
    airflowElement.append(document.createElement("i"));
  return (
    doorWindowVisualElement.append(doorWindowFrameElement, airflowElement),
    doorWindowSensorElement.append(doorWindowVisualElement),
    doorWindowSensorElement
  );
}
export function createWaterLeakSensorView(waterLeakProperties: any, waterLeakState: any) {
  const waterLeakColor = normalizeCssColor(waterLeakProperties.waterLeakColor, "#42c8ff"),
    isWaterLeakWet = waterLeakState.key === "occupied",
    waterLeakStateLabel = isWaterLeakWet
      ? "检测到水浸"
      : waterLeakState.key === "clear"
        ? "正常"
        : waterLeakState.key === "unavailable"
          ? "离线"
          : "未知",
    waterLeakSensorElement = document.createElement("div");
  ((waterLeakSensorElement.className =
    "hb-water-leak-sensor is-" + (isWaterLeakWet ? "wet" : waterLeakState.key)),
    (waterLeakSensorElement.dataset.sensorState = isWaterLeakWet ? "wet" : waterLeakState.key),
    waterLeakSensorElement.style.setProperty("--hb-water-leak-accent", waterLeakColor),
    waterLeakSensorElement.setAttribute("role", "img"),
    waterLeakSensorElement.setAttribute("aria-label", "水浸传感器：" + waterLeakStateLabel));
  const waterLeakVisualElement = document.createElement("div");
  waterLeakVisualElement.className = "hb-water-leak-visual";
  const puddleElement = document.createElement("span");
  puddleElement.className = "hb-water-leak-puddle";
  const ripplesElement = document.createElement("span");
  ripplesElement.className = "hb-water-leak-ripples";
  for (let rippleIndex = 0; rippleIndex < 3; rippleIndex += 1)
    ripplesElement.append(document.createElement("i"));
  const svgUrl = "http://www.w3.org/2000/svg",
    dropletSvgElement = document.createElementNS(svgUrl, "svg");
  (dropletSvgElement.setAttribute("class", "hb-water-leak-droplet"),
    dropletSvgElement.setAttribute("viewBox", "0 0 48 64"),
    dropletSvgElement.setAttribute("aria-hidden", "true"));
  const dropletBodyPathElement = document.createElementNS(svgUrl, "path");
  (dropletBodyPathElement.setAttribute("class", "body"),
    dropletBodyPathElement.setAttribute(
      "d",
      "M24 3C20 10 6 27 6 40c0 11 8 20 18 20s18-9 18-20C42 27 28 10 24 3Z",
    ));
  const dropletHighlightPathElement = document.createElementNS(svgUrl, "path");
  return (
    dropletHighlightPathElement.setAttribute("class", "highlight"),
    dropletHighlightPathElement.setAttribute("d", "M15 40c0-6 3-12 8-18"),
    dropletSvgElement.append(dropletBodyPathElement, dropletHighlightPathElement),
    waterLeakVisualElement.append(puddleElement, ripplesElement, dropletSvgElement),
    waterLeakSensorElement.append(waterLeakVisualElement),
    waterLeakSensorElement
  );
}
export function createSmokeSensorView(smokeProperties: any, smokeState: any) {
  const smokeColor = normalizeCssColor(smokeProperties.smokeColor, "#ffffff"),
    isSmokeAlert = smokeState.key === "occupied",
    smokeStateLabel = isSmokeAlert
      ? "检测到烟雾"
      : smokeState.key === "clear"
        ? "正常"
        : smokeState.key === "unavailable"
          ? "离线"
          : "未知",
    smokeSensorElement = document.createElement("div");
  ((smokeSensorElement.className =
    "hb-smoke-sensor is-" + (isSmokeAlert ? "alert" : smokeState.key)),
    (smokeSensorElement.dataset.sensorState = isSmokeAlert ? "alert" : smokeState.key),
    smokeSensorElement.style.setProperty("--hb-smoke-accent", smokeColor),
    smokeSensorElement.setAttribute("role", "img"),
    smokeSensorElement.setAttribute("aria-label", "烟雾传感器：" + smokeStateLabel));
  const smokeVisualElement = document.createElement("span");
  smokeVisualElement.className = "hb-smoke-visual";
  const smokeGroundElement = document.createElement("span");
  smokeGroundElement.className = "hb-smoke-ground";
  const smokeSvgUrl = "http://www.w3.org/2000/svg",
    smokeWispsSvgElement = document.createElementNS(smokeSvgUrl, "svg");
  (smokeWispsSvgElement.setAttribute("class", "hb-smoke-wisps"),
    smokeWispsSvgElement.setAttribute("viewBox", "0 0 100 100"),
    smokeWispsSvgElement.setAttribute("aria-hidden", "true"));
  for (const wispPathDefinition of [
    "M27 94C12 76 41 67 27 49C13 32 38 22 30 7",
    "M50 97C34 79 65 69 49 50C35 33 61 21 52 3",
    "M73 93C60 77 86 66 72 48C59 32 83 22 75 8",
  ]) {
    const wispPathElement = document.createElementNS(smokeSvgUrl, "path");
    (wispPathElement.setAttribute("d", wispPathDefinition),
      smokeWispsSvgElement.append(wispPathElement));
  }
  return (
    smokeVisualElement.append(smokeGroundElement, smokeWispsSvgElement),
    smokeSensorElement.append(smokeVisualElement),
    smokeSensorElement
  );
}
export function naturalGasPresentationLabel(naturalGasState: any) {
  const rawState = String(
    naturalGasState?.raw?.state ?? naturalGasState?.state ?? naturalGasState?.label ?? "",
  ).trim();
  const token = rawState.toLowerCase();
  const xiaomiLabels: Record<string, string> = {
    preheat: "预热",
    preheating: "预热",
    预热: "预热",
    monitoring: "监测正常",
    normal: "监测正常",
    监测正常: "监测正常",
    self_check: "自检",
    selfcheck: "自检",
    自检: "自检",
    sensor_expired: "传感器寿命到期",
    lifetime_expired: "传感器寿命到期",
    传感器寿命到期: "传感器寿命到期",
    fault: "设备故障",
    failure: "设备故障",
    设备故障: "设备故障",
    gas_leak: "天然气泄漏报警",
    leak: "天然气泄漏报警",
    天然气泄漏报警: "天然气泄漏报警",
  };
  if (xiaomiLabels[token]) return xiaomiLabels[token];
  if (xiaomiLabels[rawState]) return xiaomiLabels[rawState];
  if (naturalGasState.key === "occupied") return "天然气泄漏报警";
  if (naturalGasState.key === "clear") return "监测正常";
  if (naturalGasState.key === "unavailable") return "离线";
  return rawState || "未知";
}
export function createNaturalGasSensorView(naturalGasProperties: any, naturalGasState: any) {
  const naturalGasColor = normalizeCssColor(naturalGasProperties.naturalGasColor, "#ffb347"),
    isNaturalGasAlert =
      naturalGasState.key === "occupied" ||
      naturalGasPresentationLabel(naturalGasState) === "天然气泄漏报警",
    naturalGasStateLabel = naturalGasPresentationLabel(naturalGasState),
    naturalGasSensorElement = document.createElement("div");
  ((naturalGasSensorElement.className =
    "hb-natural-gas-sensor is-" + (isNaturalGasAlert ? "alert" : naturalGasState.key)),
    (naturalGasSensorElement.dataset.sensorState = isNaturalGasAlert
      ? "alert"
      : naturalGasState.key),
    naturalGasSensorElement.style.setProperty("--hb-natural-gas-accent", naturalGasColor),
    naturalGasSensorElement.setAttribute("role", "img"),
    naturalGasSensorElement.setAttribute("aria-label", "天然气传感器：" + naturalGasStateLabel));
  const naturalGasVisualElement = document.createElement("span");
  naturalGasVisualElement.className = "hb-natural-gas-visual";
  const naturalGasHazeElement = document.createElement("span");
  naturalGasHazeElement.className = "hb-natural-gas-haze";
  const naturalGasSvgUrl = "http://www.w3.org/2000/svg",
    naturalGasSvgElement = document.createElementNS(naturalGasSvgUrl, "svg");
  (naturalGasSvgElement.setAttribute("class", "hb-natural-gas-currents"),
    naturalGasSvgElement.setAttribute("viewBox", "0 0 120 80"),
    naturalGasSvgElement.setAttribute("aria-hidden", "true"));
  for (const currentPathDefinition of [
    "M3 19C23 5 38 32 58 18C78 4 94 29 117 13",
    "M0 40C20 26 35 53 55 39C76 24 94 54 120 35",
    "M5 62C26 47 42 74 64 58C85 43 101 67 117 54",
  ]) {
    const currentPathElement = document.createElementNS(naturalGasSvgUrl, "path");
    (currentPathElement.setAttribute("d", currentPathDefinition),
      naturalGasSvgElement.append(currentPathElement));
  }
  return (
    naturalGasVisualElement.append(naturalGasHazeElement, naturalGasSvgElement),
    naturalGasSensorElement.append(naturalGasVisualElement),
    naturalGasSensorElement
  );
}
