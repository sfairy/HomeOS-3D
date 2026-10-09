/** LineChartInspector — context 注入 */
import { clampNumber as clampNumber2, roundField as roundField2 } from "./editor-utils";

export interface LineChartInspectorContext {
  activeProject: any;
  findReplaceableComponents: any;
  lineChartActionControlsElement: any;
  lineChartApplyCountElement: any;
  lineChartApplyStyleButtonElement: any;
  lineChartCurveRadiusInputElement: any;
  lineChartHeightInputElement: any;
  lineChartHoursInputElement: any;
  lineChartLabelElement: any;
  lineChartLeftInputElement: any;
  lineChartRotationInputElement: any;
  lineChartScaleInputElement: any;
  lineChartStatePrecisionSelectElement: any;
  lineChartThresholdModeSelectElement: any;
  lineChartTopInputElement: any;
  lineChartTypeElement: any;
  lineChartUpdateIntervalInputElement: any;
  lineChartValueColorInputElement: any;
  lineChartValueOffsetXInputElement: any;
  lineChartValueOffsetYInputElement: any;
  lineChartValueScaleInputElement: any;
  lineChartValueVisibleElement: any;
  lineChartThresholdInputs: any;
  lineChartWidthInputElement: any;
  runAltBackup: any;
  runExtraFallback: any;
  selectedComponentIdsSet: any;
  syncComponentActionControls: any;
}

export function syncLineChartInspector(ctx: LineChartInspectorContext, componentArg: any) {
  const {
    activeProject,
    findReplaceableComponents,
    lineChartActionControlsElement,
    lineChartApplyCountElement,
    lineChartApplyStyleButtonElement,
    lineChartCurveRadiusInputElement,
    lineChartHeightInputElement,
    lineChartHoursInputElement,
    lineChartLabelElement,
    lineChartLeftInputElement,
    lineChartRotationInputElement,
    lineChartScaleInputElement,
    lineChartStatePrecisionSelectElement,
    lineChartThresholdModeSelectElement,
    lineChartTopInputElement,
    lineChartTypeElement,
    lineChartUpdateIntervalInputElement,
    lineChartValueColorInputElement,
    lineChartValueOffsetXInputElement,
    lineChartValueOffsetYInputElement,
    lineChartValueScaleInputElement,
    lineChartValueVisibleElement,
    lineChartThresholdInputs,
    lineChartWidthInputElement,
    runAltBackup,
    runExtraFallback,
    selectedComponentIdsSet,
    syncComponentActionControls
  } = ctx;
  const linechartinspectorComponent = componentArg;
  const chartProperties = componentArg.properties || {},
    chartPosition = componentArg.position || {},
    chartCanvasWidthPx = Number(activeProject.document.canvas.width || 2778),
    chartCanvasHeightPx = Number(activeProject.document.canvas.height || 1940),
    chartWidthPx = Number(chartPosition.width || 100),
    chartHeightPx = Number(chartPosition.height || 100);
  (runExtraFallback(componentArg),
    (lineChartTypeElement.value = "折线图"),
    (lineChartLabelElement.value = chartProperties.label || ""));
  for (const valueVisibleToggleElement of lineChartValueVisibleElement.querySelectorAll(
    "[data-line-chart-value-visible]",
  )) {
    const isValueVisible =
      valueVisibleToggleElement.dataset.lineChartValueVisible ===
      (chartProperties.valueVisible === false ? "off" : "on");
    (valueVisibleToggleElement.classList.toggle("active", isValueVisible),
      valueVisibleToggleElement.setAttribute("aria-pressed", String(isValueVisible)));
  }
  ((lineChartValueScaleInputElement.value = roundField2(
    clampNumber2(Number(chartProperties.valueScale ?? 100), 10, 500),
  )),
    (lineChartValueColorInputElement.value = chartProperties.valueColor || "#dce1e5"),
    (lineChartStatePrecisionSelectElement.value = ["0", "1", "2", "3", "4"].includes(
      String(chartProperties.statePrecision),
    )
      ? String(chartProperties.statePrecision)
      : "auto"),
    (lineChartValueOffsetXInputElement.value = roundField2(
      clampNumber2(Number(chartProperties.valueOffsetX ?? 0), -100, 100),
    )),
    (lineChartValueOffsetYInputElement.value = roundField2(
      clampNumber2(Number(chartProperties.valueOffsetY ?? 0), -100, 100),
    )),
    (lineChartUpdateIntervalInputElement.value = roundField2(
      clampNumber2(Number(chartProperties.updateInterval ?? 600), 30, 86400),
    )),
    (lineChartHoursInputElement.value = roundField2(
      clampNumber2(Number(chartProperties.hours ?? 24), 1, 168),
    )),
    (lineChartCurveRadiusInputElement.value = roundField2(
      clampNumber2(Number(chartProperties.cornerRadius ?? 10), 0, 50),
    )));
  const hasCustomThresholds = [
      {
        value: 0,
        color: "#ddffc2",
      },
      {
        value: 13,
        color: "#68cc3e",
      },
      {
        value: 27,
        color: "#ff8e52",
      },
      {
        value: 40,
        color: "#ff1a1a",
      },
    ],
    some3 =
      Array.isArray(chartProperties.thresholds) &&
      chartProperties.thresholds.some((threshold: any) => Number.isFinite(Number(threshold?.value))),
    thresholdMode =
      chartProperties.thresholdMode === "auto" ||
      (!some3 && chartProperties.thresholdMode !== "manual")
        ? "auto"
        : "manual";
  lineChartThresholdModeSelectElement.value = thresholdMode;
  const thresholds = some3 ? chartProperties.thresholds : hasCustomThresholds;
  (lineChartThresholdInputs.forEach((thresholdInput: any, thresholdSlotIndex: any) => {
    ((thresholdInput.value.value = roundField2(
      Number(
        thresholds[thresholdSlotIndex]?.value ?? hasCustomThresholds[thresholdSlotIndex].value,
      ),
    )),
      (thresholdInput.color.value =
        thresholds[thresholdSlotIndex]?.color || hasCustomThresholds[thresholdSlotIndex].color),
      (thresholdInput.value.disabled = thresholdMode === "auto"),
      (thresholdInput.color.disabled = thresholdMode === "auto"));
  }),
    (lineChartLeftInputElement.value = roundField2(
      clampNumber2(
        ((Number(chartPosition.x || 0) + chartWidthPx / 2) / chartCanvasWidthPx) * 100,
        0,
        100,
      ),
    )),
    (lineChartTopInputElement.value = roundField2(
      clampNumber2(
        ((Number(chartPosition.y || 0) + chartHeightPx / 2) / chartCanvasHeightPx) * 100,
        0,
        100,
      ),
    )),
    (lineChartWidthInputElement.value = roundField2(
      clampNumber2((chartWidthPx / chartCanvasWidthPx) * 100, 0.1, 100),
    )),
    (lineChartHeightInputElement.value = roundField2(
      clampNumber2((chartHeightPx / chartCanvasHeightPx) * 100, 0.1, 100),
    )),
    (lineChartScaleInputElement.value = roundField2(
      clampNumber2(Number(componentArg.style?.scale || 1) * 100, 1, 500),
    )),
    (lineChartRotationInputElement.value = roundField2(
      clampNumber2(Number(chartPosition.rotation || 0), -360, 360),
    )));
  const isMultiSelection = selectedComponentIdsSet.size > 1;
  ((lineChartWidthInputElement.disabled = isMultiSelection),
    (lineChartHeightInputElement.disabled = isMultiSelection),
    (lineChartScaleInputElement.disabled = false),
    (lineChartRotationInputElement.disabled = false));
  const replaceableCount = findReplaceableComponents(componentArg).length,
    applyTargetCount = runAltBackup(componentArg).length;
  ((lineChartApplyStyleButtonElement.disabled = !replaceableCount || !applyTargetCount),
    (lineChartApplyCountElement.textContent = applyTargetCount + " 项修改"),
    (lineChartApplyStyleButtonElement.textContent = "一键应用到同类型控件"),
    syncComponentActionControls(componentArg, lineChartActionControlsElement));

}
