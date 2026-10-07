import {
  percentageBarDefaults as percentageBarDefaults2,
  percentageBarNumbers as percentageBarNumbers2,
  percentageBarSeries as percentageBarSeries2,
  PERCENTAGE_BAR_LIMIT as PERCENTAGE_BAR_LIMIT2,
} from "./percentage-bar-model";
import { inspectorComponentMetrics as inspectorComponentMetrics2 } from "../editor/editor-basic-inspectors";
import type { DomControl } from "@app/utils/dom-control";
import { domElement } from "@app/utils/dom-factory";
const inspectorStateByHost = new WeakMap<any, any>(),
  createElement = (tagName: any, textContent: any = null, className = "") =>
    domElement(document, tagName, className, textContent);
/** 检查器里一个字段的配置。 */
type InspectorFieldOptions = {
/** input 类型（number / text / color…）或 select。 */
type?: string;
value?: any;
/** 下拉选项（值与显示文案的二元组）。 */
choices?: [any, any][];
min?: number;
max?: number;
readonly?: boolean;
change?: (value: any) => void;
preview?: (value: any) => void;
/** 字段对应的几何 key，写进 dataset.geometry。 */
key?: string;
disabled?: boolean;
step?: number;
placeholder?: string;
};

export function renderPercentageBarInspector(hostElement: any, component: any, inspectorApi: any) {
  let inspectorState = inspectorStateByHost.get(hostElement);
  if (!inspectorState) {
    const inspectorForm = createElement("form", null, "inspector-form");
    ((inspectorForm.id = "percentage-bar-inspector"),
      inspectorForm.addEventListener("submit", (submitEvent: any) => submitEvent.preventDefault()),
      hostElement.append(inspectorForm),
      (inspectorState = {
        form: inspectorForm,
        selected: 0,
        componentId: null as any,
      }),
      inspectorStateByHost.set(hostElement, inspectorState));
  }
  const { form: formElement } = inspectorState;
  if (((formElement.hidden = component?.type !== "percentage-bar"), formElement.hidden)) return;
  (inspectorState.componentId !== component.id && (inspectorState.selected = 0),
    (inspectorState.componentId = component.id));
  const series = percentageBarSeries2(component);
  inspectorState.selected = Math.min(inspectorState.selected, series.length - 1);
  const options = {
      ...percentageBarDefaults2,
      ...component.properties,
    },
    componentMetrics = inspectorComponentMetrics2(component, inspectorApi.document);
  formElement.replaceChildren();
  const createSection = (sectionTitle: any) => {
      const createdSectionElement = createElement("section", null, "inspector-section");
      return (
        createdSectionElement.append(createElement("h3", sectionTitle)),
        formElement.append(createdSectionElement),
        createdSectionElement
      );
    },
    createGrid = (gridHostElement: any) => {
      const gridElement = createElement("div", null, "inspector-grid two-columns");
      return (gridHostElement.append(gridElement), gridElement);
    },
  createFieldControl = (
      fieldHostElement: any,
      labelText: any,
      {
        type: inputType = "text",
        value: fieldValue = "",
        choices: choiceOptions,
        min: minValue,
        max: maxValue,
        readonly: isReadOnly,
        change: onChange,
        preview: onPreview,
        key: geometryKey,
        disabled: isDisabled,
        step: stepValue = 1,
        placeholder: placeholderText,
      }: InspectorFieldOptions = {},
    ) => {
      const labelElement = createElement("label", labelText),
        controlElement = createElement(choiceOptions ? "select" : "input");
      if (choiceOptions)
        for (const [optionValue, optionLabel] of choiceOptions) {
          const optionElement = createElement("option", optionLabel);
          ((optionElement.value = optionValue), controlElement.append(optionElement));
        }
      else controlElement.type = inputType;
      ((controlElement.value = String(fieldValue)),
        controlElement.setAttribute("aria-label", labelText),
        geometryKey && (controlElement.dataset.geometry = geometryKey),
        minValue != null && (controlElement.min = minValue),
        maxValue != null && (controlElement.max = maxValue),
        inputType === "number" && (controlElement.step = String(stepValue)),
        placeholderText && (controlElement.placeholder = placeholderText),
        inputType === "text" && (controlElement.maxLength = 128),
        (controlElement.readOnly = !!isReadOnly),
        (controlElement.disabled = !!isDisabled));
      const readFieldValue = () =>
        inputType !== "number"
          ? controlElement.value
          : controlElement.value.trim() === "" || !Number.isFinite(Number(controlElement.value))
            ? null
            : Math.max(minValue!, Math.min(maxValue!, Number(controlElement.value)));
      return (
        controlElement.addEventListener("change", () => {
          const nextFieldValue = readFieldValue();
          nextFieldValue !== null
            ? onChange?.(nextFieldValue)
            : ((controlElement.value = String(fieldValue)), onPreview?.(fieldValue));
        }),
        onPreview &&
          controlElement.addEventListener("input", () => {
            const liveFieldValue = readFieldValue();
            liveFieldValue !== null && onPreview(liveFieldValue);
          }),
        labelElement.append(controlElement),
        fieldHostElement.append(labelElement),
        controlElement
      );
    },
    createPropertyField = (
      propertyHostElement: any,
      propertyLabelText: any,
      propertyKey: any,
      fieldOverrides: InspectorFieldOptions = {},
    ) =>
      createFieldControl(propertyHostElement, propertyLabelText, {
        value: options[propertyKey],
        type: (percentageBarNumbers2 as any)[propertyKey] ? "number" : "text",
        min: (percentageBarNumbers2 as any)[propertyKey]?.[0],
        max: (percentageBarNumbers2 as any)[propertyKey]?.[1],
        change: (newValue) =>
          inspectorApi.change({
            property: propertyKey,
            value: newValue,
          }),
        preview:
          (percentageBarNumbers2 as any)[propertyKey] || fieldOverrides.type === "color"
            ? (previewValue) => inspectorApi.previewProperty(propertyKey, previewValue)
            : undefined,
        ...fieldOverrides,
      }),
    basicGridElement = createGrid(createSection("基础"));
  (createFieldControl(basicGridElement, "类型", {
    value: "百分比柱状图",
    readonly: true,
  }),
    createPropertyField(basicGridElement, "控件备注", "label", {
      value: options.label || "",
    }));
  const seriesSection = createSection("柱体列表");
  seriesSection
    .querySelector("h3")
    .append(
      createElement(
        "span",
        series.length + " / " + PERCENTAGE_BAR_LIMIT2,
        "percentage-series-count",
      ),
    );
  const seriesTabsContainer = createElement("div", null, "percentage-series-tabs");
  series.forEach((seriesItem, seriesIndex) => {
    const seriesTabButton = createElement(
      "button",
      seriesItem.label || "柱体 " + (seriesIndex + 1),
    );
    ((seriesTabButton.type = "button"),
      (seriesTabButton.title = seriesItem.label || "柱体 " + (seriesIndex + 1)),
      seriesTabButton.setAttribute("aria-label", "选择第 " + (seriesIndex + 1) + " 根柱子"),
      seriesTabButton.setAttribute("aria-pressed", String(inspectorState.selected === seriesIndex)),
      seriesTabButton.addEventListener("click", () => {
        ((inspectorState.selected = seriesIndex),
          renderPercentageBarInspector(hostElement, component, inspectorApi));
      }),
      seriesTabsContainer.append(seriesTabButton));
  });
  const addSeriesButton = createElement("button", "+ 添加柱体");
  ((addSeriesButton.type = "button"),
    (addSeriesButton.disabled = series.length >= PERCENTAGE_BAR_LIMIT2),
    addSeriesButton.addEventListener("click", () => {
      ((inspectorState.selected = series.length),
        inspectorApi.change({
          add: true,
        }));
    }),
    seriesTabsContainer.append(addSeriesButton),
    seriesSection.append(seriesTabsContainer));
  const selected = inspectorState.selected,
    selectedSeries = series[selected],
    matchedEntity = inspectorApi.entities.find(
      (entity: any) => entity.entityId === selectedSeries.entityId,
    ),
    entityPickerButton = createElement(
      "button",
      matchedEntity
        ? inspectorApi.entityName(matchedEntity)
        : selectedSeries.entityId || "选择百分比实体",
      "inspector-picker-button",
    );
  ((entityPickerButton.type = "button"),
    entityPickerButton.setAttribute("aria-label", "选择百分比实体"),
    entityPickerButton.setAttribute("aria-haspopup", "dialog"));
  const entityPickerContainer = createElement("div", null, "inspector-picker");
  (entityPickerContainer.append(createElement("span", "百分比实体", "inspector-picker-title")),
    entityPickerContainer.append(entityPickerButton),
    entityPickerButton.addEventListener("click", () =>
      inspectorApi.pickEntity(entityPickerButton, selectedSeries, (entityPatch: any) =>
        inspectorApi.change({
          seriesIndex: selected,
          patch: entityPatch,
        }),
      ),
    ),
    seriesSection.append(entityPickerContainer));
  const text = selectedSeries.entityId
    ? "" +
      selectedSeries.entityId +
      (selectedSeries.attribute ? " · " + selectedSeries.attribute : "") +
      (matchedEntity ? "" : " · 实体未载入或已失效")
    : "仅列出百分比实体和设备的百分比属性。";
  entityPickerContainer.append(createElement("p", text, "inspector-help"));
  const seriesGridElement = createGrid(seriesSection);
  (createFieldControl(seriesGridElement, "柱体备注", {
    value: selectedSeries.label || "",
    placeholder: "默认实体名称",
    change: (labelValue) =>
      inspectorApi.change({
        seriesIndex: selected,
        patch: {
          label: labelValue,
        },
      }),
  }),
    createFieldControl(seriesGridElement, "柱体颜色", {
      type: "color",
      value: selectedSeries.color || "#f2a20d",
      change: (colorValue) =>
        inspectorApi.change({
          seriesIndex: selected,
          patch: {
            color: colorValue,
          },
        }),
    }));
  const seriesActions = createElement("div", null, "percentage-series-actions");
  for (const [actionLabel, actionConfig, isActionDisabled] of [
    [
      "前移",
      {
        move: -1,
      },
      selected === 0,
    ],
    [
      "后移",
      {
        move: 1,
      },
      selected === series.length - 1,
    ],
    [
      "移除",
      {
        remove: true,
      },
      series.length <= 1,
    ],
  ] as [string, any, boolean][]) {
    const actionButton = createElement("button", actionLabel);
    ((actionButton.type = "button"),
      (actionButton.disabled = isActionDisabled),
      actionButton.addEventListener("click", () => {
        (actionConfig.move && (inspectorState.selected += actionConfig.move),
          inspectorApi.change({
            seriesIndex: selected,
            ...actionConfig,
          }));
      }),
      seriesActions.append(actionButton));
  }
  seriesSection.append(seriesActions);
  const styleGridElement = createGrid(createSection("样式与布局"));
  (createPropertyField(styleGridElement, "柱体样式", "variant", {
    choices: [
      ["gradient", "渐变柱"],
      ["cursor", "内嵌游标柱"],
      ["glass", "玻璃液柱"],
    ],
  }),
    createPropertyField(styleGridElement, "显示方向", "orientation", {
      choices: [
        ["vertical", "纵向"],
        ["horizontal", "横向"],
      ],
    }));
  for (const [dimensionKey, dimensionLabel] of [
    ["thickness", "统一粗细（px）"],
    ["length", "柱体长度（px）"],
    ["gap", "柱间距（px）"],
    ["radius", "端部圆角（px）"],
  ])
    createPropertyField(styleGridElement, dimensionLabel, dimensionKey, {
      disabled: dimensionKey === "gap" && series.length === 1,
    });
  createPropertyField(styleGridElement, "填充浓度（%）", "fillOpacity").parentElement.classList.add(
    "inspector-full-row",
  );
  for (const [visibilityKey, itemLabel, sizeKey, colorKey, offsetKey] of [
    ["valueVisible", "数值", "valueSize", "valueColor", "valueOffset"],
    ["labelVisible", "备注", "labelSize", "labelColor", "labelOffset"],
  ]) {
    const visibilitySectionElement = createSection(itemLabel + "显示"),
      visibilityGridElement = createGrid(visibilitySectionElement);
    (createPropertyField(visibilityGridElement, "显示" + itemLabel, visibilityKey, {
      value: String(options[visibilityKey]),
      choices: [
        ["true", "显示"],
        ["false", "隐藏"],
      ],
      change: (selectedChoiceValue) =>
        inspectorApi.change({
          property: visibilityKey,
          value: selectedChoiceValue === "true",
        }),
    }),
      createPropertyField(visibilityGridElement, itemLabel + "颜色", colorKey, {
        type: "color",
        disabled: !options[visibilityKey],
      }));
    const typographyGridElement = createGrid(visibilitySectionElement);
    (createPropertyField(typographyGridElement, itemLabel + "字号（px）", sizeKey, {
      disabled: !options[visibilityKey],
    }),
      visibilityKey === "valueVisible" &&
        createPropertyField(typographyGridElement, "小数位数", "precision", {
          type: "text",
          choices: [
            ["0", "整数"],
            ["1", "1 位"],
            ["2", "2 位"],
          ],
          change: (precisionChoice) =>
            inspectorApi.change({
              property: "precision",
              value: Number(precisionChoice),
            }),
          disabled: !options.valueVisible,
        }));
    const offsetGridElement = createGrid(visibilitySectionElement);
    (createPropertyField(offsetGridElement, itemLabel + "水平偏移（px）", offsetKey + "X", {
      disabled: !options[visibilityKey],
    }),
      createPropertyField(offsetGridElement, itemLabel + "垂直偏移（px）", offsetKey + "Y", {
        disabled: !options[visibilityKey],
      }),
      visibilitySectionElement.append(
        createElement(
          "p",
          "水平：负数向左，正数向右；垂直：负数向上，正数向下。",
          "inspector-help",
        ),
      ));
  }
  const transformGridElement = createGrid(createSection("位置与变换"));
  for (const [geometryPropertyKey, geometryLabel, geometryValue, geometryMin, geometryMax] of [
    ["left", "左侧（%）", componentMetrics.left, 0, 100],
    ["top", "顶部（%）", componentMetrics.top, 0, 100],
    ["scale", "缩放（%）", componentMetrics.scale, 1, 500],
    ["rotation", "旋转（°）", componentMetrics.rotation, -360, 360],
  ] as [string, string, any, any, any][])
    createFieldControl(transformGridElement, geometryLabel, {
      type: "number",
      value: geometryValue,
      min: geometryMin,
      max: geometryMax,
      key: geometryPropertyKey,
      step: 0.1,
      change: (nextGeometryValue) =>
        inspectorApi.change({
          geometry: geometryPropertyKey,
          value: nextGeometryValue,
        }),
      preview: (geometryPreviewValue) =>
        inspectorApi.previewGeometry(geometryPropertyKey, geometryPreviewValue),
    });
  const batchSection = createSection("批量应用");
  batchSection.classList.add("navigation-batch-section");
  const applyStyleButton = createElement("button", "应用样式到其它百分比柱状图");
  ((applyStyleButton.type = "button"),
    (applyStyleButton.disabled = !inspectorApi.canApplyStyle),
    applyStyleButton.addEventListener("click", inspectorApi.applyStyle),
    batchSection.append(applyStyleButton),
    inspectorApi.enhance?.(formElement));
}
export function previewPercentageBarInspector(targetHostElement: any, previewComponent: any, ownerDocument: any) {
  const hostFormElement = inspectorStateByHost.get(targetHostElement)?.form;
  if (!hostFormElement || hostFormElement.hidden) return;
  const previewMetrics = inspectorComponentMetrics2(previewComponent, ownerDocument);
  for (const geometryPropertyName of ["left", "top", "scale", "rotation"]) {
    const selector = (hostFormElement as DomControl).querySelector<DomControl>(
      '[data-geometry="' + geometryPropertyName + '"]',
    );
    selector && (selector.value = (previewMetrics as any)[geometryPropertyName]);
  }
}
