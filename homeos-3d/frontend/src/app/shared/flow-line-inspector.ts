import {
  normalizeFlowLine as normalizeFlowLine2,
  flowClamp as flowClamp2,
} from "./flow-line-model";
import { inspectorComponentMetrics as inspectorComponentMetrics2 } from "../editor/editor-basic-inspectors";
import { openFlowLinePathEditor as openFlowLinePathEditor2 } from "./flow-line-editor";
import type { DomControl } from "@app/utils/dom-control";
const inspectorStateByHost = new WeakMap(),
  numericRangeByProperty = {
    width: [1, 40, 1],
    speed: [0, 500, 1],
    tail: [2, 300, 1],
    spacing: [10, 600, 1],
    glow: [0, 100, 1],
    radius: [0, 150, 1],
    opacity: [0, 100, 100],
    baseOpacity: [0, 100, 100],
  },
  geometryRangeByProperty = {
    left: [0, 100],
    top: [0, 100],
    widthPercent: [0.1, 100],
    heightPercent: [0.1, 100],
    scale: [1, 500],
    rotation: [-360, 360],
  };
export function flowLineGeometryChange(
  geometryComponent,
  documentCanvas,
  geometryProperty,
  numericValue,
) {
  const componentMetrics = inspectorComponentMetrics2(geometryComponent, {
      canvas: documentCanvas,
    }),
    options = geometryComponent.position || {},
    num = Number(documentCanvas?.width) || 2778,
    canvasHeightPx = Number(documentCanvas?.height) || 1940,
    centerXPx = Number(options.x || 0) + componentMetrics.width / 2,
    centerYPx = Number(options.y || 0) + componentMetrics.height / 2;
  return geometryProperty === "left"
    ? {
        position: {
          x: (num * numericValue) / 100 - componentMetrics.width / 2,
        },
      }
    : geometryProperty === "top"
      ? {
          position: {
            y: (canvasHeightPx * numericValue) / 100 - componentMetrics.height / 2,
          },
        }
      : geometryProperty === "widthPercent"
        ? {
            position: {
              x: centerXPx - (num * numericValue) / 200,
              width: (num * numericValue) / 100,
            },
          }
        : geometryProperty === "heightPercent"
          ? {
              position: {
                y: centerYPx - (canvasHeightPx * numericValue) / 200,
                height: (canvasHeightPx * numericValue) / 100,
              },
            }
          : geometryProperty === "scale"
            ? {
                style: {
                  scale: numericValue / 100,
                },
              }
            : {
                position: {
                  rotation: numericValue,
                },
              };
}
export function renderFlowLineInspector(hostElement, inspectorComponent, inspectorOptions) {
  let inspectorState = inspectorStateByHost.get(hostElement);
  if (!inspectorState) {
    const element = document.createElement("form");
    ((element.id = "flow-line-inspector"),
      (element.className = "inspector-form"),
      hostElement.append(element),
      (inspectorState = {
        form: element,
        fields: new Map(),
        component: null,
        options: null,
      }),
      inspectorStateByHost.set(hostElement, inspectorState));
    const createInspectorSection = (sectionTitle) => {
        const sectionElement = document.createElement("section");
        sectionElement.className = "inspector-section";
        const headingElement = document.createElement("h3");
        return (
          (headingElement.textContent = sectionTitle),
          sectionElement.append(headingElement),
          element.append(sectionElement),
          sectionElement
        );
      },
      createInspectorGrid = (sectionContainer) => {
        const gridElement = document.createElement("div");
        return (
          (gridElement.className = "inspector-grid two-columns"),
          sectionContainer.append(gridElement),
          gridElement
        );
      },
      createInspectorField = (
        fieldContainer,
        controlKey,
        fieldLabel,
        controlType = "number",
        selectOptions = [],
      ) => {
        const fieldLabelElement = document.createElement("label");
        fieldLabelElement.append(document.createTextNode(fieldLabel));
        // select 与 input 共用同一套赋值语句，统一按过渡期控件类型处理。
        const controlElement = document.createElement(
          controlType === "select" ? "select" : "input",
        ) as DomControl;
        if (
          ((controlElement.id = "flow-line-" + controlKey),
          (controlElement.name = controlKey),
          controlType === "select")
        )
          for (const [optionValue, optionLabel] of selectOptions) {
            const optionElement = document.createElement("option");
            ((optionElement.value = optionValue),
              (optionElement.textContent = optionLabel),
              controlElement.append(optionElement));
          }
        else controlElement.type = controlType;
        if (controlType === "number") {
          const fieldRange =
            numericRangeByProperty[controlKey] || geometryRangeByProperty[controlKey];
          ((controlElement.min = fieldRange[0]),
            (controlElement.max = fieldRange[1]),
            (controlElement.step = numericRangeByProperty[controlKey] ? "1" : "0.1"));
        }
        return (
          controlType === "text" && (controlElement.maxLength = 128),
          fieldLabelElement.append(controlElement),
          fieldContainer.append(fieldLabelElement),
          inspectorState.fields.set(controlKey, controlElement),
          controlElement
        );
      },
      basicSection = createInspectorGrid(createInspectorSection("基础")),
      typeControlElement = createInspectorField(basicSection, "type", "类型", "text");
    ((typeControlElement.readOnly = true),
      (typeControlElement.value = "流水线条"),
      createInspectorField(basicSection, "label", "备注 / 名称", "text"));
    const pathSection = createInspectorSection("路径"),
      editPathButton = document.createElement("button");
    ((editPathButton.type = "button"),
      (editPathButton.textContent = "绘制 / 编辑路径"),
      (editPathButton.dataset.flowPathEditor = ""),
      pathSection.append(editPathButton),
      (inspectorState.count = document.createElement("p")),
      (inspectorState.count.className = "field-note"),
      pathSection.append(inspectorState.count),
      (editPathButton.onclick = () => {
        const component = inspectorState.component,
          pathEditorOptions = inspectorState.options;
        if (component)
          try {
            openFlowLinePathEditor2(component, {
              ...pathEditorOptions.pathEditorContext?.(),
              onSave: (savedPath) => pathEditorOptions.onChange(component.id, savedPath),
              onError: pathEditorOptions.onError,
            });
          } catch (caughtError) {
            pathEditorOptions.onError?.(caughtError);
          }
      }));
    const pathGrid = createInspectorGrid(pathSection);
    (createInspectorField(pathGrid, "shape", "路径形态", "select", [
      ["straight", "折线"],
      ["rounded", "圆角"],
      ["curve", "曲线"],
    ]),
      createInspectorField(pathGrid, "radius", "转角半径"));
    const effectSection = createInspectorSection("效果"),
      effectGrid = createInspectorGrid(effectSection);
    (createInspectorField(effectGrid, "effect", "效果风格", "select", [
      ["water", "水流"],
      ["energy", "能量"],
    ]),
      createInspectorField(effectGrid, "opacity", "整体透明度（%）"));
    const createPropertyGroup = (
        groupContainer,
        groupLabel,
        visibilityKey = "",
        enabledLabel = "显示",
        disabledLabel = "隐藏",
      ) => {
        const propertyGroupElement = document.createElement("div");
        ((propertyGroupElement.className = "navigation-property-group"),
          groupContainer.append(propertyGroupElement));
        const headingWrapper = document.createElement("div");
        ((headingWrapper.className = "navigation-property-heading"),
          propertyGroupElement.append(headingWrapper));
        const headingTitle = document.createElement("strong");
        if (
          ((headingTitle.textContent = groupLabel),
          headingWrapper.append(headingTitle),
          visibilityKey)
        ) {
          const visibilityToggle = document.createElement("button");
          ((visibilityToggle.type = "button"),
            (visibilityToggle.id = "flow-line-" + visibilityKey),
            (visibilityToggle.className = "inspector-visibility-toggle compact"),
            (visibilityToggle.dataset.onLabel = enabledLabel),
            (visibilityToggle.dataset.offLabel = disabledLabel),
            visibilityToggle.setAttribute("aria-label", groupLabel),
            headingWrapper.append(visibilityToggle),
            inspectorState.fields.set(visibilityKey, visibilityToggle),
            (visibilityToggle.onclick = () => {
              const component2 = inspectorState.component,
                visibilityOptions = inspectorState.options;
              component2 &&
                Promise.resolve(
                  visibilityOptions.onChange(component2.id, {
                    properties: {
                      [visibilityKey]: !normalizeFlowLine2(component2.properties)[visibilityKey],
                    },
                  }),
                ).catch((toggleError) => visibilityOptions.onError?.(toggleError));
            }));
        }
        return createInspectorGrid(propertyGroupElement);
      },
      glowGrid = createPropertyGroup(effectSection, "流光");
    (createInspectorField(glowGrid, "color", "颜色", "color"),
      createInspectorField(glowGrid, "width", "线宽"),
      createInspectorField(glowGrid, "tail", "光尾长度"),
      createInspectorField(glowGrid, "glow", "发光强度（%）"));
    const baseLineGrid = createPropertyGroup(effectSection, "底线", "baseVisible");
    (createInspectorField(baseLineGrid, "baseColor", "颜色", "color"),
      createInspectorField(baseLineGrid, "baseOpacity", "透明度（%）"));
    const headDotGrid = createPropertyGroup(effectSection, "光点", "headVisible");
    (createInspectorField(headDotGrid, "headColor", "颜色", "color"),
      createInspectorField(headDotGrid, "spacing", "光点间距"));
    const animationGrid = createPropertyGroup(
      effectSection,
      "流动动画",
      "animated",
      "开启",
      "关闭",
    );
    createInspectorField(animationGrid, "controlMode", "控制方式", "select", [
      ["manual", "手动"],
      ["entity-sign", "实体自动"],
    ]);
    const entityPickerLabel = document.createElement("label");
    ((entityPickerLabel.textContent = "数值实体"),
      animationGrid.append(entityPickerLabel),
      (inspectorState.entityLabel = entityPickerLabel));
    const entityPickerButton = document.createElement("button");
    ((entityPickerButton.type = "button"),
      (entityPickerButton.className = "inspector-picker-button"),
      (entityPickerButton.id = "flow-line-entity"),
      entityPickerLabel.append(entityPickerButton),
      (inspectorState.entityButton = entityPickerButton),
      (entityPickerButton.onclick = () => {
        const component3 = inspectorState.component,
          entityPickerOptions = inspectorState.options;
        component3 &&
          Promise.resolve(
            entityPickerOptions.pickEntity?.(
              entityPickerButton,
              component3.bindings?.entity?.entityId || "",
              (selectedEntityId) =>
                entityPickerOptions.onChange(component3.id, {
                  bindings: {
                    entity: {
                      entityId: selectedEntityId || null,
                    },
                  },
                }),
            ),
          ).catch((entityPickerError) => entityPickerOptions.onError?.(entityPickerError));
      }),
      (inspectorState.directionLabel = createInspectorField(
        animationGrid,
        "direction",
        "方向",
        "select",
        [
          ["1", "正向"],
          ["-1", "反向"],
        ],
      ).parentElement),
      createInspectorField(animationGrid, "speed", "流速"),
      (inspectorState.motionNote = document.createElement("p")),
      (inspectorState.motionNote.className = "field-note"),
      effectSection.append(inspectorState.motionNote));
    const positionGrid = createInspectorGrid(createInspectorSection("位置"));
    for (const [positionKey, positionLabel] of [
      ["left", "左侧（%）"],
      ["top", "顶部（%）"],
    ])
      createInspectorField(positionGrid, positionKey, positionLabel);
    const sizeTransformGrid = createInspectorGrid(createInspectorSection("尺寸与变换"));
    for (const [transformKey, transformLabel] of [
      ["widthPercent", "宽度（%）"],
      ["heightPercent", "高度（%）"],
      ["scale", "缩放（%）"],
      ["rotation", "旋转（°）"],
    ])
      createInspectorField(sizeTransformGrid, transformKey, transformLabel);
    const batchSection = createInspectorSection("批量应用");
    (batchSection.classList.add("navigation-batch-section"),
      (inspectorState.applyCount = document.createElement("span")),
      (inspectorState.applyCount.id = "flow-line-apply-count"),
      batchSection.querySelector<DomControl>("h3").append(" ", inspectorState.applyCount));
    const applyStyleButton = document.createElement("button");
    ((applyStyleButton.type = "button"),
      (applyStyleButton.id = "flow-line-apply-style"),
      (applyStyleButton.textContent = "一键应用到同类型控件"),
      (applyStyleButton.onclick = () => inspectorState.options.onApplyStyle?.()),
      batchSection.append(applyStyleButton),
      (inspectorState.apply = applyStyleButton),
      element.addEventListener("submit", (submitEvent) => submitEvent.preventDefault()));
    const handleFieldChange = (changeEvent, isPreview) => {
      const target = changeEvent.target,
        fieldName = target.name,
        component4 = inspectorState.component,
        changeOptions = inspectorState.options;
      if (!component4 || !inspectorState.fields.has(fieldName) || fieldName === "type") return;
      let checked = target.type === "checkbox" ? target.checked : target.value,
        changePayload;
      if (numericRangeByProperty[fieldName] || geometryRangeByProperty[fieldName]) {
        if (checked === "" || !Number.isFinite(Number(checked))) return;
        const clampRange = numericRangeByProperty[fieldName] || geometryRangeByProperty[fieldName];
        ((checked = flowClamp2(checked, clampRange[0], clampRange[1])),
          (changePayload = geometryRangeByProperty[fieldName]
            ? flowLineGeometryChange(component4, changeOptions.document?.canvas, fieldName, checked)
            : {
                properties: {
                  [fieldName]: checked / (clampRange[2] || 1),
                },
              }));
      } else
        fieldName === "effect"
          ? (changePayload = {
              properties:
                checked === "energy"
                  ? {
                      effect: checked,
                      color: "#b594ff",
                      baseColor: "#b594ff",
                      speed: 140,
                      width: 4,
                      tail: 85,
                      spacing: 175,
                      glow: 80,
                    }
                  : {
                      effect: checked,
                      color: "#42d9ef",
                      baseColor: "#42d9ef",
                      speed: 90,
                      width: 5,
                      tail: 58,
                      spacing: 130,
                      glow: 55,
                    },
            })
          : (changePayload = {
              properties: {
                [fieldName]: fieldName === "direction" ? Number(checked) : checked,
              },
            });
      isPreview
        ? changeOptions.onPreview?.(component4.id, changePayload)
        : Promise.resolve(changeOptions.onChange(component4.id, changePayload)).catch(
            (changeError) => changeOptions.onError?.(changeError),
          );
    };
    (element.addEventListener("input", (inputEvent) => handleFieldChange(inputEvent, true)),
      element.addEventListener("change", (fieldChangeEvent) =>
        handleFieldChange(fieldChangeEvent, false),
      ),
      inspectorOptions.enhanceControls?.(element));
  }
  if (
    ((inspectorState.component = inspectorComponent),
    (inspectorState.options = inspectorOptions),
    (inspectorState.form.hidden = inspectorComponent?.type !== "flow-line"),
    inspectorState.form.hidden)
  )
    return;
  inspectorState.form.dataset.componentId = inspectorComponent.id;
  const normalizedProperties = normalizeFlowLine2(inspectorComponent.properties),
    currentMetrics = inspectorComponentMetrics2(inspectorComponent, inspectorOptions.document);
  for (const [fieldKey, fieldControl] of inspectorState.fields) {
    if (fieldKey === "type") continue;
    const text =
      fieldKey === "label"
        ? inspectorComponent.properties?.label || inspectorComponent.properties?.instanceName || ""
        : geometryRangeByProperty[fieldKey]
          ? currentMetrics[fieldKey]
          : numericRangeByProperty[fieldKey]
            ? normalizedProperties[fieldKey] * (numericRangeByProperty[fieldKey][2] || 1)
            : normalizedProperties[fieldKey];
    fieldControl.tagName === "BUTTON"
      ? (fieldControl.setAttribute("aria-pressed", String(text)),
        (fieldControl.textContent = text
          ? fieldControl.dataset.onLabel
          : fieldControl.dataset.offLabel))
      : (fieldControl.value = text);
  }
  inspectorState.count.textContent =
    normalizedProperties.points.length + " 个节点 · 拖动时按 Shift 锁轴";
  const boundEntityId = inspectorComponent.bindings?.entity?.entityId || "",
    boundEntity = inspectorOptions.entities?.find(
      (candidateEntity) => candidateEntity.entityId === boundEntityId,
    );
  ((inspectorState.entityLabel.hidden = normalizedProperties.controlMode !== "entity-sign"),
    (inspectorState.directionLabel.hidden = normalizedProperties.controlMode === "entity-sign"),
    (inspectorState.entityButton.textContent =
      boundEntity?.name || boundEntityId || "选择数值实体"),
    (inspectorState.entityButton.title = boundEntityId),
    (inspectorState.motionNote.hidden = normalizedProperties.controlMode !== "entity-sign"),
    (inspectorState.motionNote.textContent =
      "绑定后自动读取：正数从路径起点流向终点，负数反向，0 或不可用时只显示底线。"),
    (inspectorState.applyCount.textContent = (inspectorOptions.styleChangeCount || 0) + " 项修改"),
    (inspectorState.apply.disabled = !inspectorOptions.hasStyleChanges));
  for (const percentFieldKey of ["widthPercent", "heightPercent"])
    inspectorState.fields.get(percentFieldKey).disabled = !!inspectorOptions.multipleSelected;
  inspectorOptions.syncControls?.(inspectorState.form);
}
export function previewFlowLineInspectorTransform(
  previewHostElement,
  componentOptions,
  canvasElement,
  transformDelta,
) {
  const activeInspectorState = inspectorStateByHost.get(previewHostElement);
  if (!activeInspectorState || activeInspectorState.form.hidden) return;
  const previewOptions = {
      ...componentOptions,
      position: {
        ...componentOptions.position,
        ...transformDelta,
      },
      style: {
        ...componentOptions.style,
        ...(Number.isFinite(transformDelta.scale)
          ? {
              scale: transformDelta.scale,
            }
          : {}),
      },
    },
    previewMetrics = inspectorComponentMetrics2(previewOptions, {
      canvas: canvasElement,
    });
  for (const geometryKey of Object.keys(geometryRangeByProperty))
    activeInspectorState.fields.get(geometryKey).value = previewMetrics[geometryKey];
}
