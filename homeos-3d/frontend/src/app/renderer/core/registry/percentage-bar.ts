import {
  percentageBarSeries as percentageBarSeries2,
  percentageBarDimensions as percentageBarDimensions2,
} from "../../../shared/percentage-bar-model";
export function percentageValue(entityState, attributeName = "") {
  if (
    ((entityState = entityState?.newState || entityState),
    entityState?.available === false ||
      ["unknown", "unavailable"].includes(String(entityState?.state).toLowerCase()))
  )
    return null;
  const rawValue = attributeName ? entityState?.attributes?.[attributeName] : entityState?.state;
  if (rawValue == null || typeof rawValue == "boolean" || String(rawValue).trim() === "")
    return null;
  const numericValue = Number(rawValue);
  return Number.isFinite(numericValue) ? Math.max(0, Math.min(100, numericValue)) : null;
}
export function percentageLabel(percentage, precision = 0) {
  if (percentage === null) return "—";
  const max = Math.max(0, Math.min(2, Math.trunc(Number(precision) || 0)));
  return percentage.toFixed(max) + "%";
}
/** 百分比图运行时元素：在标准 DOM 能力之外挂载状态同步入口。 */
type PercentageBarElement = HTMLElement & {
  syncPercentageStates: (statesByEntityId: Map<string, any>) => void;
};
export function renderPercentageBar(component, runtimeHost) {
  const options = component.properties || {},
    series = percentageBarSeries2(component),
    element = document.createElement("section") as PercentageBarElement;
  element.className = "hb-percentage-chart";
  const variant = ["cursor", "glass"].includes(options.variant) ? options.variant : "gradient";
  ((element.dataset.variant = variant),
    element.style.setProperty("--series-count", String(series.length)),
    element.classList.toggle("is-horizontal", options.orientation === "horizontal"));
  const resolveClampedOption = (optionName, minValue, maxValue, defaultValue) => {
      const optionNumber = Number(options[optionName]);
      return options[optionName] == null || !Number.isFinite(optionNumber)
        ? defaultValue
        : Math.max(minValue, Math.min(maxValue, optionNumber));
    },
    dimensionOptions = {
      length: [80, 600, 300],
      gap: [0, 80, 52],
      valueGap: [0, 40, 11],
      labelGap: [0, 40, 16],
      valueSize: [12, 48, 26],
      labelSize: [8, 24, 11],
      radius: [0, 24, 5],
    };
  for (const offsetKey of ["valueOffsetX", "valueOffsetY", "labelOffsetX", "labelOffsetY"])
    dimensionOptions[offsetKey] = [-600, 600, 0];
  for (const [optionKey, [minPx, maxPx, defaultPx]] of Object.entries(dimensionOptions))
    element.style.setProperty(
      "--" + optionKey.replace(/[A-Z]/g, (upperChar) => "-" + upperChar.toLowerCase()),
      resolveClampedOption(optionKey, minPx, maxPx, defaultPx) + "px",
    );
  (element.style.setProperty(
    "--fill-opacity",
    resolveClampedOption("fillOpacity", 5, 90, 32) + "%",
  ),
    element.classList.toggle("hide-values", options.valueVisible === false),
    element.classList.toggle("hide-labels", options.labelVisible === false));
  for (const [colorKey, cssVariableName] of [
    ["valueColor", "--chart-text"],
    ["labelColor", "--chart-label"],
  ])
    /^#[0-9a-f]{6}$/i.test(options[colorKey] || "") &&
      element.style.setProperty(cssVariableName, options[colorKey]);
  element.setAttribute("aria-label", options.title || "百分比柱状图");
  const axisElement = document.createElement("div");
  axisElement.className = "hb-percentage-axis";
  for (const tickPercentage of [100, 75, 50, 25, 0]) {
    const tickElement = document.createElement("span");
    ((tickElement.textContent = tickPercentage + "%"), axisElement.append(tickElement));
  }
  const plotElement = document.createElement("div");
  plotElement.className = "hb-percentage-plot";
  const map = series.map((seriesPoint) => {
    const columnElement = document.createElement("div");
    columnElement.className = "hb-percentage-column";
    const thicknessPx = Math.max(8, Math.min(96, Number(options.thickness) || 48));
    columnElement.style.setProperty("--bar-thickness", thicknessPx + "px");
    const valueElement = document.createElement("strong");
    valueElement.className = "hb-percentage-value";
    const trackElement = document.createElement("div");
    ((trackElement.className = "hb-percentage-track"),
      trackElement.setAttribute("role", "meter"),
      trackElement.setAttribute("aria-valuemin", "0"),
      trackElement.setAttribute("aria-valuemax", "100"));
    const fillElement = document.createElement("div");
    fillElement.className = "hb-percentage-fill";
    const color = seriesPoint.color || options.color;
    /^#[0-9a-f]{6}$/i.test(color || "") && columnElement.style.setProperty("--bar-color", color);
    const labelElement = document.createElement("span");
    labelElement.className = "hb-percentage-label";
    const surfaceElement = document.createElement("div");
    return (
      (surfaceElement.className = "hb-percentage-surface"),
      surfaceElement.setAttribute("aria-hidden", "true"),
      surfaceElement.append(fillElement),
      trackElement.append(surfaceElement),
      columnElement.append(valueElement, trackElement, labelElement),
      plotElement.append(columnElement),
      {
        item: seriesPoint,
        column: columnElement,
        value: valueElement,
        track: trackElement,
        fill: fillElement,
        label: labelElement,
      }
    );
  });
  return (
    element.append(axisElement, plotElement),
    (element.syncPercentageStates = (statesByEntityId) => {
      for (const columnRecord of map) {
        const runtimeState = statesByEntityId.get(columnRecord.item.entityId),
          percentageValue2 = percentageValue(runtimeState, columnRecord.item.attribute),
          text =
            columnRecord.item.label ||
            (runtimeState?.newState || runtimeState)?.attributes?.friendly_name ||
            columnRecord.item.entityId ||
            "未绑定实体",
          percentageLabel2 = percentageLabel(percentageValue2, options.precision);
        ((columnRecord.label.textContent = text), (columnRecord.label.title = text));
        const numberElement = document.createElement("span");
        numberElement.textContent = percentageValue2 === null ? "—" : percentageLabel2.slice(0, -1);
        const unitElement = document.createElement("small");
        ((unitElement.textContent = percentageValue2 === null ? "" : "%"),
          columnRecord.value.replaceChildren(numberElement, unitElement),
          columnRecord.column.style.setProperty(
            "--percentage",
            String((percentageValue2 ?? 0) / 100),
          ),
          (columnRecord.fill.hidden = percentageValue2 === null || percentageValue2 === 0),
          columnRecord.column.classList.toggle("is-unavailable", percentageValue2 === null),
          columnRecord.track.setAttribute("aria-label", text),
          columnRecord.track.setAttribute(
            "aria-valuetext",
            percentageValue2 === null ? "暂无数据" : percentageLabel2,
          ),
          percentageValue2 === null
            ? columnRecord.track.removeAttribute("aria-valuenow")
            : columnRecord.track.setAttribute("aria-valuenow", String(percentageValue2)),
          (columnRecord.column.title =
            text + "：" + (percentageValue2 === null ? "暂无数据" : percentageLabel2)));
      }
    }),
    element.syncPercentageStates(runtimeHost.states),
    element
  );
}
export function renderPercentageBarControl(controlComponent, controlHost) {
  const controlElement = document.createElement("div");
  controlElement.className = "hb-percentage-control";
  const percentageBar = renderPercentageBar(controlComponent, controlHost),
    dimensions = percentageBarDimensions2(
      controlComponent.properties,
      percentageBarSeries2(controlComponent).length,
    );
  ((percentageBar.style.width = dimensions.width + "px"),
    (percentageBar.style.minWidth = "0"),
    (percentageBar.style.height = dimensions.height + "px"),
    controlElement.append(percentageBar));
  const applyBarScale = () => {
    const width =
        controlElement.clientWidth || controlComponent.position?.width || dimensions.width,
      height =
        controlElement.clientHeight || controlComponent.position?.height || dimensions.height;
    percentageBar.style.transform =
      "translate(-50%, -50%) scale(" +
      Math.min(width / dimensions.width, height / dimensions.height) +
      ")";
  };
  if ((applyBarScale(), typeof ResizeObserver < "u")) {
    const resizeObserver = new ResizeObserver(applyBarScale);
    (resizeObserver.observe(controlElement),
      controlHost.cleanup?.(() => resizeObserver.disconnect()));
  }
  for (const entityId of new Set(
    percentageBarSeries2(controlComponent)
      .map((seriesDatum) => seriesDatum.entityId)
      .filter(Boolean),
  ))
    controlHost.registerRuntimeStateHandler?.(entityId, () =>
      percentageBar.syncPercentageStates(controlHost.states),
    );
  return controlElement;
}
