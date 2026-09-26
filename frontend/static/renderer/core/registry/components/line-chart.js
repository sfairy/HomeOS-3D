/**
 * `line-chart` 控件：注册折线图，绘制与历史序列在 `history-chart.js`。
 */
// 数值夹取统一走 utils/numbers.js。`clampNumber` 只用于三处：那三处 `clampCoercedNumber`
// 的兜底是**算出来的表达式**、存在越界的现实可能，所以要在调用点先夹一次
// （见 `utils/numbers.js` 模块头那张口径表）。
import { clampCoercedNumber } from "../../../../utils/numbers.js?v=2609262221";
import {
  formatLineChartValue,
  lineChartGeometry
} from "../../../controls/line-chart-runtime.js?v=2609262221";
import {
  resolvedThresholds,
  smoothChartPath,
  thresholdColor
} from "../../../controls/weather-chart-runtime.js?v=2609262221";
// 同门分片：history-chart
import {
  attachChartTooltip,
  buildHistorySeries
} from "../history-chart.js?v=2609262221";
// 同门分片：registry-core
import { registerComponent } from "../registry-core.js?v=2609262221";
// 同门分片：registry-visuals
import {
  appendSvgElement,
  chartThresholdPalette,
  resolveColor
} from "../registry-visuals.js?v=2609262221";

// 折线图控件：序列由 buildHistorySeries 整理，几何与路径由 line-chart-runtime 计算。
registerComponent("line-chart", {
  render(chartComponent, chartContext) {
    const chartProperties = chartComponent.properties || {};
    const chartEntityId = chartComponent.bindings?.entity?.entityId || "";
    const chartState = chartContext.states.get(chartEntityId);
    const chartUnit = String(chartState?.attributes?.unit_of_measurement || "");
    const chartCurrentValue = Number.parseFloat(chartState?.state);
    const chartSamples = buildHistorySeries(
      chartContext,
      chartEntityId,
      chartCurrentValue,
      chartProperties.hours
    );
    // 阈值色带由渲染层读令牌后注入：本模块碰 DOM，weather-chart-runtime 不碰，
    // 所以「令牌 → 实际色值」这一步落在这一侧（见 registry-visuals 的 chartThresholdPalette）。
    const chartThresholdColors = chartThresholdPalette();
    const chartThresholds = resolvedThresholds(
      chartProperties.thresholds,
      chartSamples,
      chartProperties.thresholdMode,
      chartThresholdColors
    );
    const chartElement = document.createElement("div");
    chartElement.className = "hb-line-chart-component";
    chartElement.style.borderRadius = clampCoercedNumber(chartProperties.cornerRadius, 0, 50, 10) + "%";
    const chartValueElement = document.createElement("span");
    chartValueElement.className = "hb-line-chart-value";
    chartValueElement.hidden = chartProperties.valueVisible === false;
    chartValueElement.style.color = resolveColor(chartProperties.valueColor, "#dce1e5");
    chartValueElement.style.fontSize =
      Math.max(
        10,
        (Number(chartComponent.position?.height || 300) *
          0.12 *
          clampCoercedNumber(chartProperties.valueScale, 10, 500, 100)) /
          100
      ) + "px";
    chartValueElement.style.left =
      95 + clampCoercedNumber(chartProperties.valueOffsetX, -100, 100, 0) + "%";
    chartValueElement.style.top = 8 + clampCoercedNumber(chartProperties.valueOffsetY, -100, 100, 0) + "%";
    const chartValueTextElement = document.createElement("strong");
    chartValueTextElement.textContent = formatLineChartValue(
      chartCurrentValue,
      chartProperties.statePrecision
    );
    const chartUnitElement = document.createElement("small");
    chartUnitElement.textContent = chartUnit;
    chartValueElement.append(chartValueTextElement, chartUnitElement);
    chartElement.append(chartValueElement);
    chartElement.syncLineChartState = runtimeStateUpdate => {
      const runtimeStateValue = Number.parseFloat(runtimeStateUpdate?.state);
      chartValueTextElement.textContent = formatLineChartValue(
        runtimeStateValue,
        chartProperties.statePrecision
      );
      chartUnitElement.textContent = String(
        runtimeStateUpdate?.attributes?.unit_of_measurement || ""
      );
      chartElement.style.setProperty(
        "--hb-chart-current-color",
        Number.isFinite(runtimeStateValue)
          ? thresholdColor(chartThresholds, runtimeStateValue, chartThresholdColors.defaultColor)
          : chartThresholdColors.defaultColor
      );
    };
    const chartSvg = appendSvgElement(chartElement, "svg", {
      viewBox: "0 0 100 70",
      preserveAspectRatio: "none",
      "aria-hidden": "true"
    });
    chartSvg.classList.add("hb-line-chart-graph");
    if (chartSamples.length) {
      const chartGeometry = lineChartGeometry(chartSamples);
      const {
        minimum: chartMinimum,
        maximum: chartMaximum,
        span: chartSpan,
        points: chartPoints
      } = chartGeometry;
      const chartPath = smoothChartPath(chartPoints);
      const chartGradientId =
        (chartContext.renderNamespace || "renderer") +
        "-chart-" +
        String(chartComponent.id || "").replace(/[^a-z0-9_-]/gi, "");
      const chartDefs = appendSvgElement(chartSvg, "defs");
      const chartLineGradient = appendSvgElement(chartDefs, "linearGradient", {
        id: chartGradientId + "-line",
        gradientUnits: "userSpaceOnUse",
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 70
      });
      const chartThresholdStops = chartThresholds.length
        ? chartThresholds
        : [
            {
              value: chartMinimum,
              color: chartThresholdColors.defaultColor
            }
          ];
      for (const chartThresholdStop of [...chartThresholdStops].sort(
        (firstThresholdStop, secondThresholdStop) =>
          secondThresholdStop.value - firstThresholdStop.value
      )) {
        appendSvgElement(chartLineGradient, "stop", {
          offset:
            clampCoercedNumber(((chartMaximum - chartThresholdStop.value) / chartSpan) * 100, 0, 100, 0) +
            "%",
          "stop-color": chartThresholdStop.color
        });
      }
      appendSvgElement(chartSvg, "path", {
        d: chartPath + " L100 70 L0 70 Z",
        fill: "url(#" + chartGradientId + "-line)",
        opacity: 0.18
      });
      appendSvgElement(chartSvg, "path", {
        d: chartPath,
        fill: "none",
        stroke: "url(#" + chartGradientId + "-line)",
        "stroke-width": 1.6,
        "vector-effect": "non-scaling-stroke"
      });
      if (!chartContext.editable) {
        const chartHoverLayerElement = document.createElement("span");
        chartHoverLayerElement.className = "hb-line-chart-hover-layer";
        chartElement.append(chartHoverLayerElement);
        const chartHoverCleanup = attachChartTooltip(
          chartHoverLayerElement,
          chartElement,
          chartGeometry,
          chartUnit,
          chartMappedPoint => ({
            x: chartMappedPoint.x,
            y: (chartMappedPoint.y / 70) * 100
          }),
          chartProperties.statePrecision
        );
        chartContext.cleanup?.(chartHoverCleanup);
      }
    } else {
      chartElement.classList.add("history-loading");
    }
    chartElement.style.setProperty(
      "--hb-chart-current-color",
      Number.isFinite(chartCurrentValue)
        ? thresholdColor(chartThresholds, chartCurrentValue, chartThresholdColors.defaultColor)
        : chartThresholdColors.defaultColor
    );
    return chartElement;
  }
});
