/** registry 折线图详情子模块：从 registry.ts 抽出，负责带时间轴的详细历史折线图渲染。 */
import {
  buildHistorySeries,
  formatTimestamp,
  createHoverLineChart,
  clampNumber,
  createSvgElement,
} from "./_shared";
import {
  resolvedThresholds,
  smoothChartPath,
  thresholdColor,
} from "../../controls/weather-chart-runtime";
import {
  formatLineChartValue,
  lineChartGeometry,
} from "../../controls/line-chart-runtime";
/** 渲染期直接挂在 DOM 元素上的组件控制器钩子（与 registry.ts 中声明保持一致）。 */
type ComponentControllerHooks = {
  syncFloorplanAutoDiagramState?: () => void;
  hbSyncVacuumMap?: () => void;
  syncLineChartState?: (...stateArgs: any[]) => any;
  cleanupLineChartHover?: () => void;
  pushEvent?: (...eventArgs: any[]) => any;
};
export function renderLineChartDetails(
  lineChartDetailsComponent: any,
  lineChartDetailsRenderEnvironment: any,
) {
  const detailsEntityId = lineChartDetailsComponent.bindings?.entity?.entityId || "",
    detailsEntityState = lineChartDetailsRenderEnvironment.states.get(detailsEntityId),
    detailsUnit = String(detailsEntityState?.attributes?.unit_of_measurement || ""),
    detailsStateValue = Number.parseFloat(detailsEntityState?.state),
    detailsHistorySeries = buildHistorySeries(
      lineChartDetailsRenderEnvironment,
      detailsEntityId,
      detailsStateValue,
      lineChartDetailsComponent.properties?.hours,
    ),
    lineChartDetailsElement: HTMLElement & ComponentControllerHooks = document.createElement("section");
  lineChartDetailsElement.className = "hb-line-chart-details";
  const detailsThresholdList = resolvedThresholds(
    lineChartDetailsComponent.properties?.thresholds,
    detailsHistorySeries,
    lineChartDetailsComponent.properties?.thresholdMode,
  );
  if (
    (lineChartDetailsElement.style.setProperty(
      "--hb-chart-current-color",
      Number.isFinite(detailsStateValue)
        ? thresholdColor(detailsThresholdList, detailsStateValue)
        : "#68cc3e",
    ),
    (lineChartDetailsElement.syncLineChartState = (detailsSyncedEntityState) => {
      const syncedDetailsValue = Number.parseFloat(detailsSyncedEntityState?.state);
      lineChartDetailsElement.style.setProperty(
        "--hb-chart-current-color",
        Number.isFinite(syncedDetailsValue)
          ? thresholdColor(detailsThresholdList, syncedDetailsValue)
          : "#68cc3e",
      );
    }),
    !detailsHistorySeries.length)
  ) {
    const emptyHistoryMessageElement = document.createElement("p");
    return (
      (emptyHistoryMessageElement.textContent = "暂无历史数据。"),
      lineChartDetailsElement.append(emptyHistoryMessageElement),
      lineChartDetailsElement
    );
  }
  const isCompactDetailsHorizontal =
      lineChartDetailsComponent.properties?.compactDetailsHorizontal === true,
    detailsViewWidth = isCompactDetailsHorizontal ? 790 : 720,
    detailsHeightOffset = isCompactDetailsHorizontal ? 0 : 56,
    detailsViewHeight = 340 + detailsHeightOffset,
    detailsInsetLeft = isCompactDetailsHorizontal ? 44 : 66,
    detailsInsetRight = isCompactDetailsHorizontal ? 44 : 26,
    plotRect = {
      left: detailsInsetLeft,
      top: 24,
      width: detailsViewWidth - detailsInsetLeft - detailsInsetRight,
      height: 258 + detailsHeightOffset,
    },
    detailsGeometry = lineChartGeometry(
      detailsHistorySeries,
      plotRect.left,
      plotRect.top,
      plotRect.width,
      plotRect.height,
    ),
    detailsSvgElement = createSvgElement(lineChartDetailsElement, "svg", {
      viewBox: "0 0 " + detailsViewWidth + " " + detailsViewHeight,
      preserveAspectRatio: "xMidYMid meet",
      role: "img",
      "aria-label": "带时间轴和数值轴的历史折线图",
    }),
    detailsGradientId =
      (lineChartDetailsRenderEnvironment.renderNamespace || "renderer") +
      "-chart-details-" +
      String(lineChartDetailsComponent.id || "").replace(/[^a-z0-9_-]/gi, ""),
    detailsDefsElement = createSvgElement(detailsSvgElement, "defs"),
    detailsGradientElement = createSvgElement(detailsDefsElement, "linearGradient", {
      id: detailsGradientId + "-line",
      gradientUnits: "userSpaceOnUse",
      x1: 0,
      y1: plotRect.top,
      x2: 0,
      y2: plotRect.top + plotRect.height,
    }),
    detailsThresholdEntries = detailsThresholdList.length
      ? detailsThresholdList
      : [
          {
            value: detailsGeometry.minimum,
            color: "#68cc3e",
          },
        ];
  for (const detailsThresholdEntry of [...detailsThresholdEntries].sort(
    (leftDetailsThreshold, rightDetailsThreshold) =>
      rightDetailsThreshold.value - leftDetailsThreshold.value,
  ))
    createSvgElement(detailsGradientElement, "stop", {
      offset:
        clampNumber(
          ((detailsGeometry.maximum - detailsThresholdEntry.value) / detailsGeometry.span) * 100,
          0,
          100,
          0,
        ) + "%",
      "stop-color": detailsThresholdEntry.color,
    });
  for (let gridTickIndex = 0; gridTickIndex <= 4; gridTickIndex += 1) {
    const gridTickRatio = gridTickIndex / 4,
      gridLineY = plotRect.top + gridTickRatio * plotRect.height,
      gridTickValue = detailsGeometry.maximum - gridTickRatio * detailsGeometry.span;
    createSvgElement(detailsSvgElement, "line", {
      x1: plotRect.left,
      y1: gridLineY,
      x2: plotRect.left + plotRect.width,
      y2: gridLineY,
      class: "hb-line-chart-details-grid",
    });
    const axisLabelElement = createSvgElement(detailsSvgElement, "text", {
      x: plotRect.left - (isCompactDetailsHorizontal ? 8 : 12),
      y: gridLineY + 4,
      "text-anchor": "end",
      class: "hb-line-chart-details-axis-label",
    });
    axisLabelElement.textContent = formatLineChartValue(
      gridTickValue,
      lineChartDetailsComponent.properties?.statePrecision,
    );
  }
  const hasTimeAxis = Number(lineChartDetailsComponent.properties?.hours || 24) > 24;
  for (let timeTickIndex = 0; timeTickIndex <= 5; timeTickIndex += 1) {
    const timeTickRatio = timeTickIndex / 5,
      timeTickX = plotRect.left + timeTickRatio * plotRect.width,
      tickTimestamp =
        detailsGeometry.firstTime +
        timeTickRatio * (detailsGeometry.lastTime - detailsGeometry.firstTime);
    createSvgElement(detailsSvgElement, "line", {
      x1: timeTickX,
      y1: plotRect.top,
      x2: timeTickX,
      y2: plotRect.top + plotRect.height,
      class: "hb-line-chart-details-grid vertical",
    });
    const timeAxisLabelElement = createSvgElement(detailsSvgElement, "text", {
      x: timeTickX,
      y: plotRect.top + plotRect.height + 25,
      "text-anchor": "middle",
      class: "hb-line-chart-details-axis-label",
    });
    timeAxisLabelElement.textContent = formatTimestamp(tickTimestamp, hasTimeAxis);
  }
  (createSvgElement(detailsSvgElement, "line", {
    x1: plotRect.left,
    y1: plotRect.top,
    x2: plotRect.left,
    y2: plotRect.top + plotRect.height,
    class: "hb-line-chart-details-axis",
  }),
    createSvgElement(detailsSvgElement, "line", {
      x1: plotRect.left,
      y1: plotRect.top + plotRect.height,
      x2: plotRect.left + plotRect.width,
      y2: plotRect.top + plotRect.height,
      class: "hb-line-chart-details-axis",
    }));
  const unitLabelElement = createSvgElement(detailsSvgElement, "text", {
    x: plotRect.left,
    y: 20,
    class: "hb-line-chart-details-axis-title",
  });
  unitLabelElement.textContent = detailsUnit || "数值";
  const detailsChartPath = smoothChartPath(detailsGeometry.points);
  (createSvgElement(detailsSvgElement, "path", {
    d:
      detailsChartPath +
      " L" +
      (plotRect.left + plotRect.width) +
      " " +
      (plotRect.top + plotRect.height) +
      " L" +
      plotRect.left +
      " " +
      (plotRect.top + plotRect.height) +
      " Z",
    fill: "url(#" + detailsGradientId + "-line)",
    opacity: 0.12,
    class: "hb-line-chart-details-fill",
  }),
    createSvgElement(detailsSvgElement, "path", {
      d: detailsChartPath,
      fill: "none",
      stroke: "url(#" + detailsGradientId + "-line)",
      "stroke-width": 2.4,
      pathLength: 100,
      "vector-effect": "non-scaling-stroke",
      class: "hb-line-chart-details-line",
    }));
  const movingDotElement = createSvgElement(detailsSvgElement, "circle", {
    cx: 0,
    cy: 0,
    r: 4.2,
    class: "hb-line-chart-details-lead-dot",
  });
  return (
    lineChartDetailsRenderEnvironment.animate !== false &&
      createSvgElement(movingDotElement, "animateMotion", {
        path: detailsChartPath,
        dur: "1.1s",
        begin: ".28s",
        fill: "freeze",
      }),
    (lineChartDetailsElement.cleanupLineChartHover = () => {}),
    lineChartDetailsRenderEnvironment.interactive !== false &&
      (lineChartDetailsElement.cleanupLineChartHover = createHoverLineChart(
        detailsSvgElement,
        lineChartDetailsElement,
        detailsGeometry,
        detailsUnit,
        (geometryPoint: any) => ({
          x: (geometryPoint.x / detailsViewWidth) * 100,
          y: (geometryPoint.y / detailsViewHeight) * 100,
        }),
        lineChartDetailsComponent.properties?.statePrecision,
        {
          start: plotRect.left / detailsViewWidth,
          end: (plotRect.left + plotRect.width) / detailsViewWidth,
        },
        lineChartDetailsElement,
      )),
    lineChartDetailsElement
  );
}
