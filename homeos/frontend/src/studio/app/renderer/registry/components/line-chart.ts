/** 折线图渲染器（从 register-all 拆出）。 */
import {
  appendSvgElement,
  buildHistorySeries,
  clampNumberWithFallback,
  createHoverLineChart,
  normalizeCssColor,
} from "../_shared";
import { formatLineChartValue, lineChartGeometry } from "../../controls/line-chart-runtime";
import {
  resolvedThresholds,
  smoothChartPath,
  thresholdColor,
} from "../../controls/weather-chart-runtime";
import type { ComponentControllerHooks } from "./types";

export function register(registerComponent: (type: any, def: any) => void) {
  registerComponent("line-chart", {
      render(lineChartComponent: any, lineChartRenderEnvironment: any) {
        const lineChartProperties = lineChartComponent.properties || {},
          lineChartEntityId = lineChartComponent.bindings?.entity?.entityId || "",
          lineChartEntityState = lineChartRenderEnvironment.states.get(lineChartEntityId),
          lineChartUnit = String(lineChartEntityState?.attributes?.unit_of_measurement || ""),
          lineChartStateValue = Number.parseFloat(lineChartEntityState?.state),
          historySeries = buildHistorySeries(
            lineChartRenderEnvironment,
            lineChartEntityId,
            lineChartStateValue,
            lineChartProperties.hours,
          ),
          resolvedThresholdList = resolvedThresholds(
            lineChartProperties.thresholds,
            historySeries,
            lineChartProperties.thresholdMode,
          ),
          lineChartComponentElement: HTMLDivElement & ComponentControllerHooks = document.createElement("div");
        ((lineChartComponentElement.className = "hb-line-chart-component"),
          (lineChartComponentElement.style.borderRadius =
            clampNumberWithFallback(lineChartProperties.cornerRadius, 0, 50, 10) + "%"));
        const lineChartValueElement = document.createElement("span");
        ((lineChartValueElement.className = "hb-line-chart-value"),
          (lineChartValueElement.hidden = lineChartProperties.valueVisible === false),
          (lineChartValueElement.style.color = normalizeCssColor(
            lineChartProperties.valueColor,
            "#dce1e5",
          )),
          (lineChartValueElement.style.fontSize =
            Math.max(
              10,
              (Number(lineChartComponent.position?.height || 300) *
                0.12 *
                clampNumberWithFallback(lineChartProperties.valueScale, 10, 500, 100)) /
                100,
            ) + "px"),
          (lineChartValueElement.style.left =
            95 + clampNumberWithFallback(lineChartProperties.valueOffsetX, -100, 100, 0) + "%"),
          (lineChartValueElement.style.top =
            8 + clampNumberWithFallback(lineChartProperties.valueOffsetY, -100, 100, 0) + "%"));
        const stateValueElement = document.createElement("strong");
        stateValueElement.textContent = formatLineChartValue(
          lineChartStateValue,
          lineChartProperties.statePrecision,
        );
        const stateUnitElement = document.createElement("small");
        ((stateUnitElement.textContent = lineChartUnit),
          lineChartValueElement.append(stateValueElement, stateUnitElement),
          lineChartComponentElement.append(lineChartValueElement),
          (lineChartComponentElement.syncLineChartState = (syncedEntityState) => {
            const syncedStateValue = Number.parseFloat(syncedEntityState?.state);
            ((stateValueElement.textContent = formatLineChartValue(
              syncedStateValue,
              lineChartProperties.statePrecision,
            )),
              (stateUnitElement.textContent = String(
                syncedEntityState?.attributes?.unit_of_measurement || "",
              )),
              lineChartComponentElement.style.setProperty(
                "--hb-chart-current-color",
                Number.isFinite(syncedStateValue)
                  ? thresholdColor(resolvedThresholdList, syncedStateValue)
                  : "#68cc3e",
              ));
          }));
        const lineChartSvgElement = appendSvgElement(lineChartComponentElement, "svg", {
          viewBox: "0 0 100 70",
          preserveAspectRatio: "none",
          "aria-hidden": "true",
        });
        if ((lineChartSvgElement.classList.add("hb-line-chart-graph"), historySeries.length)) {
          const chartGeometry = lineChartGeometry(historySeries),
            {
              minimum: minimumValue,
              maximum: maximumValue,
              span: valueSpan,
              points: chartPoints,
            } = chartGeometry,
            chartPathDefinition = smoothChartPath(chartPoints),
            lineChartGradientId =
              (lineChartRenderEnvironment.renderNamespace || "renderer") +
              "-chart-" +
              String(lineChartComponent.id || "").replace(/[^a-z0-9_-]/gi, ""),
            chartDefsElement = appendSvgElement(lineChartSvgElement, "defs"),
            gradientElement = appendSvgElement(chartDefsElement, "linearGradient", {
              id: lineChartGradientId + "-line",
              gradientUnits: "userSpaceOnUse",
              x1: 0,
              y1: 0,
              x2: 0,
              y2: 70,
            }),
            thresholdEntries = resolvedThresholdList.length
              ? resolvedThresholdList
              : [
                  {
                    value: minimumValue,
                    color: "#68cc3e",
                  },
                ];
          for (const thresholdEntry of [...thresholdEntries].sort(
            (leftThreshold, rightThreshold) => rightThreshold.value - leftThreshold.value,
          ))
            appendSvgElement(gradientElement, "stop", {
              offset:
                clampNumberWithFallback(((maximumValue - thresholdEntry.value) / valueSpan) * 100, 0, 100, 0) +
                "%",
              "stop-color": thresholdEntry.color,
            });
          if (
            (appendSvgElement(lineChartSvgElement, "path", {
              d: chartPathDefinition + " L100 70 L0 70 Z",
              fill: "url(#" + lineChartGradientId + "-line)",
              opacity: 0.18,
            }),
            appendSvgElement(lineChartSvgElement, "path", {
              d: chartPathDefinition,
              fill: "none",
              stroke: "url(#" + lineChartGradientId + "-line)",
              "stroke-width": 1.6,
              "vector-effect": "non-scaling-stroke",
            }),
            !lineChartRenderEnvironment.editable)
          ) {
            const hoverLayerElement = document.createElement("span");
            ((hoverLayerElement.className = "hb-line-chart-hover-layer"),
              lineChartComponentElement.append(hoverLayerElement));
            const chartHoverOverlayElement = createHoverLineChart(
              hoverLayerElement,
              lineChartComponentElement,
              chartGeometry,
              lineChartUnit,
              (chartPoint: any) => ({
                x: chartPoint.x,
                y: (chartPoint.y / 70) * 100,
              }),
              lineChartProperties.statePrecision,
            );
            lineChartRenderEnvironment.cleanup?.(chartHoverOverlayElement);
          }
        } else lineChartComponentElement.classList.add("history-loading");
        return (
          lineChartComponentElement.style.setProperty(
            "--hb-chart-current-color",
            Number.isFinite(lineChartStateValue)
              ? thresholdColor(resolvedThresholdList, lineChartStateValue)
              : "#68cc3e",
          ),
          lineChartComponentElement
        );
      },
    });
}

export default register;
