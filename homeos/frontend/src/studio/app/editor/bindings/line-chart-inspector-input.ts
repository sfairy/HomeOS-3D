// 从 studio/app/editor/home.ts 迁出（P4 studio 拆分，语句级切片）。
// 折线图检视面板的 input 监听（写回折线图的系列/坐标轴字段）

import { clampNumber as clampNumber2 } from "../editor-utils";
import { findComponent as findComponent2 } from "../component-tree";

/** 依赖袋（宿主 `bootEditor` 作用域）：宿主按 getter 传入，模块**惰性读取** ——
 * 与留在宿主里的闭包同语义。搬走的语句只读不写，所以无需 state 袋 / setter。
 *
 * ⚠ 这里是**事件注册语句**：它在 boot 时只跑一次，回调要等用户操作。若按值注入，
 * 像 `editorRenderer`（boot 后才赋值）/ `activeProject` 这类可变状态会被冻结在注册那一刻，
 * 而声明在注册语句下方的名字甚至会在 boot 当场触发 TDZ。故宿主一律传 getter。
 */
export interface LineChartInspectorInputDeps {
  lineChartInspectorElement: any;
  removedComponent: any;
  lineChartColorPropertiesByElement: any;
  lineChartPropertyConfigsByElement: any;
  editorRenderer: any;
  lineChartThresholdInputs: any;
  lineChartTransformInputSet: any;
  activeProject: any;
  lineChartLeftInputElement: any;
  lineChartTopInputElement: any;
  lineChartWidthInputElement: any;
  lineChartHeightInputElement: any;
  lineChartScaleInputElement: any;
  lineChartRotationInputElement: any;
  selectedComponentId: any;
  coverMotorButtonElement: any;
  mutateDocument: any;
  lineChartThresholdModeSelectElement: any;
  setComponentsRotation: any;
  lineChartValueVisibleElement: any;
}

export function attachLineChartInspectorInput(deps: LineChartInspectorInputDeps) {
(deps.lineChartInspectorElement.addEventListener("input", (lineChartInputEvent: any) => {
  const lineChartInputComponent = deps.removedComponent();
  if (!lineChartInputComponent || lineChartInputComponent.type !== "line-chart") return;
  const lineChartInputElement = lineChartInputEvent.target,
    lineChartInputColorProperty = deps.lineChartColorPropertiesByElement.get(lineChartInputElement),
    lineChartInputPropertyConfig = deps.lineChartPropertyConfigsByElement.get(lineChartInputElement);
  if (lineChartInputColorProperty) {
    deps.editorRenderer?.previewComponentProperties(lineChartInputComponent.id, {
      [lineChartInputColorProperty]: lineChartInputElement.value,
    });
    return;
  }
  if (lineChartInputPropertyConfig) {
    if (
      String(lineChartInputElement.value).trim() === "" ||
      !Number.isFinite(Number(lineChartInputElement.value))
    )
      return;
    const lineChartInputPropertyValue = clampNumber2(
      Number(lineChartInputElement.value),
      lineChartInputPropertyConfig.minimum,
      lineChartInputPropertyConfig.maximum,
    );
    ["updateInterval", "hours"].includes(lineChartInputPropertyConfig.property) ||
      deps.editorRenderer?.previewComponentProperties(lineChartInputComponent.id, {
        [lineChartInputPropertyConfig.property]:
          lineChartInputPropertyValue / lineChartInputPropertyConfig.divisor,
      });
    return;
  }
  if (
    deps.lineChartThresholdInputs.findIndex(
      (lineChartThresholdProbeItem: any) =>
        lineChartThresholdProbeItem.value === lineChartInputElement ||
        lineChartThresholdProbeItem.color === lineChartInputElement,
    ) >= 0
  ) {
    const lineChartThresholdValues = deps.lineChartThresholdInputs.map(
      (lineChartThresholdSourceItem: any) => ({
        value: Number(lineChartThresholdSourceItem.value.value),
        color: lineChartThresholdSourceItem.color.value,
      }),
    );
    lineChartThresholdValues.every((lineChartThresholdValueItem: any) =>
      Number.isFinite(lineChartThresholdValueItem.value),
    ) &&
      deps.editorRenderer?.previewComponentProperties(lineChartInputComponent.id, {
        thresholdMode: "manual",
        thresholds: lineChartThresholdValues,
      });
    return;
  }
  if (
    !deps.lineChartTransformInputSet.has(lineChartInputElement) ||
    String(lineChartInputElement.value).trim() === "" ||
    !Number.isFinite(Number(lineChartInputElement.value))
  )
    return;
  const lineChartTransformInputNumber = Number(lineChartInputElement.value),
    lineChartTransformCanvasWidth = Number(deps.activeProject.document.canvas.width || 2778),
    lineChartTransformCanvasHeight = Number(deps.activeProject.document.canvas.height || 1940),
    lineChartTransformComponentWidth = Number(lineChartInputComponent.position?.width || 100),
    lineChartTransformComponentHeight = Number(lineChartInputComponent.position?.height || 100),
    lineChartTransformCenterX =
      Number(lineChartInputComponent.position?.x || 0) + lineChartTransformComponentWidth / 2,
    lineChartTransformCenterY =
      Number(lineChartInputComponent.position?.y || 0) + lineChartTransformComponentHeight / 2;
  if (lineChartInputElement === deps.lineChartLeftInputElement)
    deps.editorRenderer?.previewComponentTransform(lineChartInputComponent.id, {
      x:
        (lineChartTransformCanvasWidth * clampNumber2(lineChartTransformInputNumber, 0, 100)) /
          100 -
        lineChartTransformComponentWidth / 2,
    });
  else {
    if (lineChartInputElement === deps.lineChartTopInputElement)
      deps.editorRenderer?.previewComponentTransform(lineChartInputComponent.id, {
        y:
          (lineChartTransformCanvasHeight * clampNumber2(lineChartTransformInputNumber, 0, 100)) /
            100 -
          lineChartTransformComponentHeight / 2,
      });
    else {
      if (lineChartInputElement === deps.lineChartWidthInputElement) {
        const lineChartTransformWidthPx =
          (lineChartTransformCanvasWidth * clampNumber2(lineChartTransformInputNumber, 0.1, 100)) /
          100;
        deps.editorRenderer?.previewComponentTransform(lineChartInputComponent.id, {
          x: lineChartTransformCenterX - lineChartTransformWidthPx / 2,
          width: lineChartTransformWidthPx,
        });
      } else {
        if (lineChartInputElement === deps.lineChartHeightInputElement) {
          const lineChartTransformHeightPx =
            (lineChartTransformCanvasHeight *
              clampNumber2(lineChartTransformInputNumber, 0.1, 100)) /
            100;
          deps.editorRenderer?.previewComponentTransform(lineChartInputComponent.id, {
            y: lineChartTransformCenterY - lineChartTransformHeightPx / 2,
            height: lineChartTransformHeightPx,
          });
        } else
          lineChartInputElement === deps.lineChartScaleInputElement
            ? deps.editorRenderer?.previewComponentTransform(lineChartInputComponent.id, {
                scale: clampNumber2(lineChartTransformInputNumber, 1, 500) / 100,
              })
            : lineChartInputElement === deps.lineChartRotationInputElement &&
              deps.editorRenderer?.previewComponentTransform(lineChartInputComponent.id, {
                rotation: clampNumber2(lineChartTransformInputNumber, -360, 360),
              });
      }
    }
  }
}),
  deps.lineChartInspectorElement.addEventListener("change", (lineChartChangeEvent: any) => {
    const lineChartChangeInputElement = lineChartChangeEvent.target,
      lineChartChangeComponentId = deps.selectedComponentId;
    if (!lineChartChangeComponentId) return;
    const lineChartChangeColorProperty = deps.lineChartColorPropertiesByElement.get(
        lineChartChangeInputElement,
      ),
      lineChartChangePropertyConfig = deps.lineChartPropertyConfigsByElement.get(
        lineChartChangeInputElement,
      ),
      lineChartChangeThresholdIndex = deps.lineChartThresholdInputs.findIndex(
        (lineChartThresholdProbeEntry: any) =>
          lineChartThresholdProbeEntry.value === lineChartChangeInputElement ||
          lineChartThresholdProbeEntry.color === lineChartChangeInputElement,
      );
    if (!(
      !lineChartChangeColorProperty &&
      !lineChartChangePropertyConfig &&
      lineChartChangeThresholdIndex < 0 &&
      !deps.lineChartTransformInputSet.has(lineChartChangeInputElement)
    )) {
      if (
        (lineChartChangePropertyConfig ||
          deps.lineChartTransformInputSet.has(lineChartChangeInputElement) ||
          (lineChartChangeThresholdIndex >= 0 && lineChartChangeInputElement.type === "number")) &&
        (String(lineChartChangeInputElement.value).trim() === "" ||
          !Number.isFinite(Number(lineChartChangeInputElement.value)))
      ) {
        deps.coverMotorButtonElement();
        return;
      }
      deps.mutateDocument((lineChartChangeDraftDocument: any) => {
        const lineChartChangeComponent = findComponent2(
          lineChartChangeDraftDocument,
          lineChartChangeComponentId,
        )?.component;
        if (!lineChartChangeComponent || lineChartChangeComponent.type !== "line-chart") return;
        ((lineChartChangeComponent.properties = {
          ...(lineChartChangeComponent.properties || {}),
        }),
          (lineChartChangeComponent.position = {
            ...(lineChartChangeComponent.position || {}),
          }),
          (lineChartChangeComponent.style = {
            ...(lineChartChangeComponent.style || {}),
          }));
        const lineChartChangeCanvasWidth = Number(
            lineChartChangeDraftDocument.canvas.width || 2778,
          ),
          lineChartChangeCanvasHeight = Number(lineChartChangeDraftDocument.canvas.height || 1940),
          lineChartChangeComponentWidth = Number(lineChartChangeComponent.position.width || 100),
          lineChartChangeComponentHeight = Number(lineChartChangeComponent.position.height || 100),
          lineChartChangeCenterX =
            Number(lineChartChangeComponent.position.x || 0) + lineChartChangeComponentWidth / 2,
          lineChartChangeCenterY =
            Number(lineChartChangeComponent.position.y || 0) + lineChartChangeComponentHeight / 2,
          lineChartChangeInputNumber = Number(lineChartChangeInputElement.value);
        lineChartChangeColorProperty
          ? ((lineChartChangeComponent.properties[lineChartChangeColorProperty] =
              lineChartChangeInputElement.value),
            lineChartChangeInputElement === deps.lineChartThresholdModeSelectElement &&
              lineChartChangeInputElement.value === "manual" &&
              !(
                Array.isArray(lineChartChangeComponent.properties.thresholds) &&
                lineChartChangeComponent.properties.thresholds.some(
                  (lineChartThresholdSourceEntry: any) =>
                    Number.isFinite(Number(lineChartThresholdSourceEntry?.value)),
                )
              ) &&
              (lineChartChangeComponent.properties.thresholds = deps.lineChartThresholdInputs.map(
                (lineChartThresholdSourceRecord: any) => ({
                  value: Number(lineChartThresholdSourceRecord.value.value),
                  color: lineChartThresholdSourceRecord.color.value,
                }),
              )))
          : lineChartChangePropertyConfig
            ? (lineChartChangeComponent.properties[lineChartChangePropertyConfig.property] =
                clampNumber2(
                  lineChartChangeInputNumber,
                  lineChartChangePropertyConfig.minimum,
                  lineChartChangePropertyConfig.maximum,
                ) / lineChartChangePropertyConfig.divisor)
            : lineChartChangeThresholdIndex >= 0
              ? ((lineChartChangeComponent.properties.thresholdMode = "manual"),
                (lineChartChangeComponent.properties.thresholds = deps.lineChartThresholdInputs.map(
                  (onLineChartValueVisibleClick: any) => ({
                    value: Number(onLineChartValueVisibleClick.value.value),
                    color: onLineChartValueVisibleClick.color.value,
                  }),
                )))
              : lineChartChangeInputElement === deps.lineChartLeftInputElement
                ? (lineChartChangeComponent.position.x =
                    (lineChartChangeCanvasWidth *
                      clampNumber2(lineChartChangeInputNumber, 0, 100)) /
                      100 -
                    lineChartChangeComponentWidth / 2)
                : lineChartChangeInputElement === deps.lineChartTopInputElement
                  ? (lineChartChangeComponent.position.y =
                      (lineChartChangeCanvasHeight *
                        clampNumber2(lineChartChangeInputNumber, 0, 100)) /
                        100 -
                      lineChartChangeComponentHeight / 2)
                  : lineChartChangeInputElement === deps.lineChartWidthInputElement
                    ? ((lineChartChangeComponent.position.width =
                        (lineChartChangeCanvasWidth *
                          clampNumber2(lineChartChangeInputNumber, 0.1, 100)) /
                        100),
                      (lineChartChangeComponent.position.x =
                        lineChartChangeCenterX - lineChartChangeComponent.position.width / 2))
                    : lineChartChangeInputElement === deps.lineChartHeightInputElement
                      ? ((lineChartChangeComponent.position.height =
                          (lineChartChangeCanvasHeight *
                            clampNumber2(lineChartChangeInputNumber, 0.1, 100)) /
                          100),
                        (lineChartChangeComponent.position.y =
                          lineChartChangeCenterY - lineChartChangeComponent.position.height / 2))
                      : lineChartChangeInputElement === deps.lineChartScaleInputElement
                        ? (lineChartChangeComponent.style.scale =
                            clampNumber2(lineChartChangeInputNumber, 1, 500) / 100)
                        : lineChartChangeInputElement === deps.lineChartRotationInputElement &&
                          deps.setComponentsRotation(
                            lineChartChangeDraftDocument,
                            lineChartChangeComponentId,
                            clampNumber2(lineChartChangeInputNumber, -360, 360),
                          );
      });
    }
  }),
  deps.lineChartValueVisibleElement.addEventListener("click", (lineChartValueVisibleEvent: any) => {
    const lineChartValueVisibleButtonElement = lineChartValueVisibleEvent.target.closest(
        "[data-line-chart-value-visible]",
      ),
      lineChartValueVisibleComponentId = deps.selectedComponentId;
    !lineChartValueVisibleButtonElement ||
      !lineChartValueVisibleComponentId ||
      deps.mutateDocument((lineChartValueVisibleDraftDocument: any) => {
        const lineChartValueVisibleComponent = findComponent2(
          lineChartValueVisibleDraftDocument,
          lineChartValueVisibleComponentId,
        )?.component;
        !lineChartValueVisibleComponent ||
          lineChartValueVisibleComponent.type !== "line-chart" ||
          (lineChartValueVisibleComponent.properties = {
            ...(lineChartValueVisibleComponent.properties || {}),
            valueVisible: lineChartValueVisibleButtonElement.dataset.lineChartValueVisible === "on",
          });
      });
  }));
}
