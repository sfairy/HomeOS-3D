/** Custom combined popup editor (extracted from home.ts). */
import { clone as clone2, newId as newId2, roundField as roundField2 } from "./editor-utils";
import {
  findCustomPopup as findCustomPopup2,
  normalizedPopupClimateDeviceType as normalizedPopupClimateDeviceType2,
  popupModuleDropPosition as popupModuleDropPosition2,
  popupModuleTypeLabel as popupModuleTypeLabel2,
  reorderedPopupModules as reorderedPopupModules2,
} from "./editor-document-management";
import {
  packPopupModules as packPopupModules2,
  popupLayoutColumns as popupLayoutColumns2,
  popupLayoutMetrics as popupLayoutMetrics2,
} from "../shared/popup-layout";
import { syncedLineChartProperties as syncedLineChartProperties2 } from "../renderer/core/renderer";

export interface CustomPopupEditorContext { [key: string]: any }

let customPopupEditorCtx: CustomPopupEditorContext;

export function syncCustomPopupStage(ctx: CustomPopupEditorContext) {
  customPopupEditorCtx = ctx;
  if (ctx.editorMode !== "popup") return;
  const editedPopup = findCustomPopup2(ctx.activeProject?.document, ctx.selectedPopupId),
    stageWrapElement = ctx.customPopupEditorElement.querySelector(".custom-popup-stage-wrap"),
    viewportElement = ctx.customPopupEditorElement.querySelector(".custom-popup-viewport"),
    stageElement = ctx.customPopupEditorElement.querySelector(".custom-popup-stage"),
    editorToolbarElement = ctx.customPopupEditorElement.querySelector(".custom-popup-editor-toolbar");
  if (
    !editedPopup ||
    !stageWrapElement ||
    !viewportElement ||
    !stageElement ||
    !editorToolbarElement
  )
    return;
  const layoutMetrics = popupLayoutMetrics2(editedPopup.modules || [], editedPopup.layout),
    gridWidth = layoutMetrics.gridWidth,
    gridHeight = layoutMetrics.gridHeight,
    stageScale = Math.max(
      0.2,
      Math.min(
        stageWrapElement.clientWidth / gridWidth,
        stageWrapElement.clientHeight / gridHeight,
      ),
    ),
    viewportWidthPx = Math.max(1, gridWidth * stageScale),
    viewportHeightPx = Math.max(1, gridHeight * stageScale);
  ((viewportElement.style.width = viewportWidthPx + "px"),
    (viewportElement.style.height = viewportHeightPx + "px"),
    (stageElement.style.width = gridWidth + "px"),
    (stageElement.style.height = gridHeight + "px"),
    (stageElement.style.transform = "scale(" + stageScale + ")"),
    (editorToolbarElement.style.width = stageWrapElement.clientWidth + "px"));
}
export function applyPopupModuleReorder(ctx: CustomPopupEditorContext, 
  popupIdValue: any,
  moduleId: any,
  beforeModuleId: any = null,
  placeAfter = false,
) {
  customPopupEditorCtx = ctx;
  const popupDefinition = (ctx.activeProject?.document?.customPopups || []).find(
    (candidatePopupModule: any) => candidatePopupModule.id === popupIdValue,
  );
  if (!popupDefinition) return;
  const reorderedModules = reorderedPopupModules2(
    popupDefinition.modules,
    moduleId,
    beforeModuleId,
    placeAfter,
  );
  if (!(
    reorderedModules.length === (popupDefinition.modules || []).length &&
    reorderedModules.every(
      (moduleEntry, moduleIndex) => moduleEntry.id === popupDefinition.modules[moduleIndex]?.id,
    )
  )) {
    if (!packPopupModules2(reorderedModules, popupDefinition.layout).fits) {
      ctx.handleOperationError(new Error("这个排序会使当前布局超过 3 行。"));
      return;
    }
    ctx.mutateDocument((reorderDraft: any) => {
      const draftPopup = (reorderDraft.customPopups || []).find(
        (draftPopupCandidate: any) => draftPopupCandidate.id === popupIdValue,
      );
      draftPopup &&
        (draftPopup.modules = reorderedPopupModules2(
          draftPopup.modules,
          moduleId,
          beforeModuleId,
          placeAfter,
        ));
    });
  }
}
function createPopupCoverSettings(popupIdentifier: any, coverModule: any) {
  const containerElement = document.createElement("div");
  containerElement.className = "popup-cover-settings";
  const coverSettings = [
    {
      label: "窗帘类型",
      property: "coverKind",
      fallback: "auto",
      allowed: ["auto", "standard", "dream", "airer"],
      options: [
        ["auto", "自动识别"],
        ["standard", "普通窗帘"],
        ["dream", "梦幻帘"],
        ["airer", "晾衣机"],
      ],
    },
    {
      label: "开合方向",
      property: "coverDirection",
      fallback: "split",
      allowed: ["split", "left", "right"],
      options: [
        ["split", "双开"],
        ["left", "向左"],
        ["right", "向右"],
      ],
    },
    {
      label: "电机方向",
      property: "coverMotorDirection",
      fallback: "auto",
      allowed: ["auto", "normal", "reversed"],
      options: [
        ["auto", "跟随 HA"],
        ["normal", "正常"],
        ["reversed", "反向"],
      ],
    },
  ];
  for (const settingRow of coverSettings) {
    const rowElement = document.createElement("div");
    rowElement.className = "popup-cover-setting-row";
    const rowLabelElement = document.createElement("span");
    rowLabelElement.textContent = settingRow.label;
    const optionsGroupElement = document.createElement("div");
    ((optionsGroupElement.className = "popup-cover-setting-options"),
      optionsGroupElement.setAttribute("role", "group"),
      optionsGroupElement.setAttribute("aria-label", settingRow.label));
    const activeValue = coverModule.properties?.[settingRow.property],
      fallback = settingRow.allowed.includes(activeValue) ? activeValue : settingRow.fallback;
    for (const [optionValue, optionLabel] of settingRow.options) {
      const settingOptionButton = document.createElement("button");
      ((settingOptionButton.type = "button"),
        (settingOptionButton.textContent = optionLabel),
        settingOptionButton.classList.toggle("active", optionValue === fallback),
        settingOptionButton.setAttribute("aria-pressed", String(optionValue === fallback)),
        settingOptionButton.addEventListener("click", (optionClickEvent) => {
          (optionClickEvent.stopPropagation(),
            optionValue !== fallback &&
              customPopupEditorCtx.mutateDocument((popupDraft: any) => {
                const updatedModule = (popupDraft.customPopups || [])
                  .find((popupEntryCandidate: any) => popupEntryCandidate.id === popupIdentifier)
                  ?.modules?.find((moduleCandidate: any) => moduleCandidate.id === coverModule.id);
                !updatedModule ||
                  updatedModule.type !== "cover" ||
                  (updatedModule.properties = {
                    ...(updatedModule.properties || {}),
                    [settingRow.property]: optionValue,
                  });
              }));
        }),
        optionsGroupElement.append(settingOptionButton));
    }
    (rowElement.append(rowLabelElement, optionsGroupElement), containerElement.append(rowElement));
  }
  return containerElement;
}
function createPopupClimateSettings(popupKey: any, climateModule: any) {
  const climateContainerElement = document.createElement("div");
  climateContainerElement.className = "popup-climate-settings";
  const deviceTypeRowElement = document.createElement("div");
  deviceTypeRowElement.className = "popup-cover-setting-row";
  const deviceTypeLabelElement = document.createElement("span");
  deviceTypeLabelElement.textContent = "设备类型";
  const deviceTypeOptionsElement = document.createElement("div");
  ((deviceTypeOptionsElement.className = "popup-cover-setting-options"),
    deviceTypeOptionsElement.setAttribute("role", "group"),
    deviceTypeOptionsElement.setAttribute("aria-label", "设备类型"));
  const deviceType3 = climateModule.properties?.deviceType || climateModule.deviceType,
    normalizedClimateType = normalizedPopupClimateDeviceType2(deviceType3);
  for (const [deviceTypeOption, deviceTypeOptionLabel] of [
    ["auto", "自动识别"],
    ["air-conditioner", "空调"],
    ["bath-heater", "浴霸"],
  ]) {
    const deviceTypeOptionButton = document.createElement("button");
    ((deviceTypeOptionButton.type = "button"),
      (deviceTypeOptionButton.textContent = deviceTypeOptionLabel),
      deviceTypeOptionButton.classList.toggle("active", deviceTypeOption === normalizedClimateType),
      deviceTypeOptionButton.setAttribute(
        "aria-pressed",
        String(deviceTypeOption === normalizedClimateType),
      ),
      deviceTypeOptionButton.addEventListener("click", (deviceTypeClickEvent) => {
        (deviceTypeClickEvent.stopPropagation(),
          deviceTypeOption !== normalizedClimateType &&
            customPopupEditorCtx.mutateDocument((climateDraft: any) => {
              const updatedClimateModule = (climateDraft.customPopups || [])
                .find((climatePopupCandidate: any) => climatePopupCandidate.id === popupKey)
                ?.modules?.find(
                  (climateModuleCandidate: any) => climateModuleCandidate.id === climateModule.id,
                );
              !updatedClimateModule ||
                updatedClimateModule.type !== "climate" ||
                ((updatedClimateModule.properties = {
                  ...(updatedClimateModule.properties || {}),
                  deviceType: deviceTypeOption,
                }),
                delete updatedClimateModule.deviceType);
            }));
      }),
      deviceTypeOptionsElement.append(deviceTypeOptionButton));
  }
  return (
    deviceTypeRowElement.append(deviceTypeLabelElement, deviceTypeOptionsElement),
    climateContainerElement.append(deviceTypeRowElement),
    climateContainerElement
  );
}
function resolveLineChartThresholds(thresholdSourceModule: any) {
  const configuredThresholds = [
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
    thresholds2 = Array.isArray(thresholdSourceModule.properties?.thresholds)
      ? thresholdSourceModule.properties.thresholds
      : [];
  return configuredThresholds.map((defaultThreshold, thresholdPosition) => ({
    value: Number.isFinite(Number(thresholds2[thresholdPosition]?.value))
      ? Number(thresholds2[thresholdPosition].value)
      : defaultThreshold.value,
    color: String(thresholds2[thresholdPosition]?.color || defaultThreshold.color),
  }));
}
function createPopupLineChartSettings(lineChartPopupId: any, lineChartModule: any) {
  const chartSettingsElement = document.createElement("div");
  chartSettingsElement.className = "popup-line-chart-settings";
  const precisionRowElement = document.createElement("div");
  precisionRowElement.className = "popup-line-chart-setting-row";
  const precisionLabelElement = document.createElement("span");
  precisionLabelElement.textContent = "数值小数位";
  const precisionSelectElement = document.createElement("select");
  precisionSelectElement.setAttribute("aria-label", "组合弹窗折线图数值小数位");
  for (const [precisionOptionValue, precisionOptionLabel] of [
    ["auto", "自动"],
    ["0", "0 位"],
    ["1", "1 位"],
    ["2", "2 位"],
    ["3", "3 位"],
    ["4", "4 位"],
  ])
    precisionSelectElement.append(new Option(precisionOptionLabel, precisionOptionValue));
  const syncedProperties = syncedLineChartProperties2(
    customPopupEditorCtx.activeProject?.document,
    customPopupEditorCtx.currentPage(),
    lineChartModule.entityId,
    lineChartModule.properties,
  );
  ((precisionSelectElement.value = ["0", "1", "2", "3", "4"].includes(
    String(syncedProperties.statePrecision),
  )
    ? String(syncedProperties.statePrecision)
    : "auto"),
    precisionSelectElement.addEventListener("pointerdown", (pointerEvent) =>
      pointerEvent.stopPropagation(),
    ),
    precisionSelectElement.addEventListener("click", (selectClickEvent) =>
      selectClickEvent.stopPropagation(),
    ),
    precisionSelectElement.addEventListener("change", (precisionChangeEvent) => {
      precisionChangeEvent.stopPropagation();
      const precisionValue = ["0", "1", "2", "3", "4"].includes(precisionSelectElement.value)
        ? precisionSelectElement.value
        : "auto";
      customPopupEditorCtx.mutateDocument((precisionDraft: any) => {
        const updatedChartModule = (precisionDraft.customPopups || [])
          .find((chartPopupCandidate: any) => chartPopupCandidate.id === lineChartPopupId)
          ?.modules?.find((chartModuleCandidate: any) => chartModuleCandidate.id === lineChartModule.id);
        !updatedChartModule ||
          updatedChartModule.type !== "line-chart" ||
          (updatedChartModule.properties = {
            ...(updatedChartModule.properties || {}),
            statePrecision: precisionValue,
          });
      });
    }),
    precisionRowElement.append(precisionLabelElement, precisionSelectElement),
    chartSettingsElement.append(precisionRowElement));
  const addColorRow = (rowTitle: any, colorValues: any, onColorChange: any, isDisabled = false) => {
    const colorRowElement = document.createElement("div");
    colorRowElement.className = "popup-line-chart-setting-row";
    const rowTitleElement = document.createElement("span");
    rowTitleElement.textContent = rowTitle;
    const colorInputsElement = document.createElement("div");
    ((colorInputsElement.className = "popup-line-chart-colors"),
      colorValues.forEach((colorValue: any, colorIndex: any) => {
        const colorPickerInput = document.createElement("input");
        ((colorPickerInput.type = "color"),
          (colorPickerInput.value = colorValue),
          (colorPickerInput.disabled = isDisabled),
          colorPickerInput.setAttribute(
            "aria-label",
            "" + rowTitle + (colorValues.length > 1 ? " " + (colorIndex + 1) : ""),
          ),
          colorPickerInput.addEventListener("pointerdown", (inputPointerEvent) =>
            inputPointerEvent.stopPropagation(),
          ),
          colorPickerInput.addEventListener("click", (inputClickEvent) =>
            inputClickEvent.stopPropagation(),
          ),
          colorPickerInput.addEventListener("change", (colorChangeEvent) => {
            (colorChangeEvent.stopPropagation(), onColorChange(colorPickerInput.value, colorIndex));
          }),
          colorInputsElement.append(colorPickerInput));
      }),
      colorRowElement.append(rowTitleElement, colorInputsElement),
      chartSettingsElement.append(colorRowElement));
  };
  addColorRow(
    "数值颜色",
    [String(lineChartModule.properties?.valueColor || "#dce1e5")],
    (nextColor: any) => {
      customPopupEditorCtx.mutateDocument((colorDraft: any) => {
        const updatedColorRowModule = (colorDraft.customPopups || [])
          .find((colorRowPopupCandidate: any) => colorRowPopupCandidate.id === lineChartPopupId)
          ?.modules?.find(
            (colorRowModuleCandidate: any) => colorRowModuleCandidate.id === lineChartModule.id,
          );
        !updatedColorRowModule ||
          updatedColorRowModule.type !== "line-chart" ||
          (updatedColorRowModule.properties = {
            ...(updatedColorRowModule.properties || {}),
            valueColor: nextColor,
          });
      });
    },
  );
  const thresholdModeRowElement = document.createElement("div");
  thresholdModeRowElement.className = "popup-line-chart-setting-row";
  const thresholdModeLabelElement = document.createElement("span");
  thresholdModeLabelElement.textContent = "阈值模式";
  const thresholdModeSelectElement = document.createElement("select");
  (thresholdModeSelectElement.setAttribute("aria-label", "组合弹窗折线图阈值模式"),
    thresholdModeSelectElement.append(
      new Option("自动（按历史范围）", "auto"),
      new Option("手动设置", "manual"),
    ));
  const some4 =
    Array.isArray(lineChartModule.properties?.thresholds) &&
    lineChartModule.properties.thresholds.some((thresholdEntry: any) =>
      Number.isFinite(Number(thresholdEntry?.value)),
    );
  ((thresholdModeSelectElement.value =
    lineChartModule.properties?.thresholdMode === "auto" ||
    (!some4 && lineChartModule.properties?.thresholdMode !== "manual")
      ? "auto"
      : "manual"),
    thresholdModeSelectElement.addEventListener("pointerdown", (selectPointerEvent) =>
      selectPointerEvent.stopPropagation(),
    ),
    thresholdModeSelectElement.addEventListener("click", (modeClickEvent) =>
      modeClickEvent.stopPropagation(),
    ),
    thresholdModeSelectElement.addEventListener("change", (modeChangeEvent) => {
      modeChangeEvent.stopPropagation();
      const nextThresholdMode = thresholdModeSelectElement.value === "manual" ? "manual" : "auto";
      customPopupEditorCtx.mutateDocument((modeDraft: any) => {
        const updatedModeModule = (modeDraft.customPopups || [])
          .find((modePopupCandidate: any) => modePopupCandidate.id === lineChartPopupId)
          ?.modules?.find((modeModuleCandidate: any) => modeModuleCandidate.id === lineChartModule.id);
        if (!updatedModeModule || updatedModeModule.type !== "line-chart") return;
        const nextProperties = {
          ...(updatedModeModule.properties || {}),
          thresholdMode: nextThresholdMode,
        };
        (nextThresholdMode === "manual" &&
          !Array.isArray(nextProperties.thresholds) &&
          (nextProperties.thresholds = resolveLineChartThresholds(updatedModeModule)),
          (updatedModeModule.properties = nextProperties));
      });
    }),
    thresholdModeRowElement.append(thresholdModeLabelElement, thresholdModeSelectElement),
    chartSettingsElement.append(thresholdModeRowElement));
  const gl2 = resolveLineChartThresholds(lineChartModule),
    thresholdRowElement = document.createElement("div");
  thresholdRowElement.className = "popup-line-chart-setting-row";
  const thresholdLabelElement = document.createElement("span");
  thresholdLabelElement.textContent = "阈值";
  const thresholdValuesElement = document.createElement("div");
  return (
    (thresholdValuesElement.className = "popup-line-chart-threshold-values"),
    gl2.forEach((thresholdRow, thresholdSlot) => {
      const thresholdInputElement = document.createElement("input");
      ((thresholdInputElement.type = "number"),
        (thresholdInputElement.step = "any"),
        (thresholdInputElement.value = roundField2(thresholdRow.value)),
        (thresholdInputElement.disabled = thresholdModeSelectElement.value === "auto"),
        thresholdInputElement.setAttribute("aria-label", "折线阈值 " + (thresholdSlot + 1)),
        thresholdInputElement.addEventListener("pointerdown", (valuePointerEvent) =>
          valuePointerEvent.stopPropagation(),
        ),
        thresholdInputElement.addEventListener("click", (valueClickEvent) =>
          valueClickEvent.stopPropagation(),
        ),
        thresholdInputElement.addEventListener("change", (valueChangeEvent) => {
          valueChangeEvent.stopPropagation();
          const nextThresholdValue = Number(thresholdInputElement.value);
          Number.isFinite(nextThresholdValue) &&
            ((thresholdInputElement.value = roundField2(nextThresholdValue)),
            customPopupEditorCtx.mutateDocument((thresholdDraft: any) => {
              const updatedThresholdModule = (thresholdDraft.customPopups || [])
                .find((thresholdPopupCandidate: any) => thresholdPopupCandidate.id === lineChartPopupId)
                ?.modules?.find(
                  (thresholdModuleCandidate: any) => thresholdModuleCandidate.id === lineChartModule.id,
                );
              if (!updatedThresholdModule || updatedThresholdModule.type !== "line-chart") return;
              const gl3 = resolveLineChartThresholds(updatedThresholdModule);
              ((gl3[thresholdSlot] = {
                ...gl3[thresholdSlot],
                value: nextThresholdValue,
              }),
                (updatedThresholdModule.properties = {
                  ...(updatedThresholdModule.properties || {}),
                  thresholdMode: "manual",
                  thresholds: gl3,
                }));
            }));
        }),
        thresholdValuesElement.append(thresholdInputElement));
    }),
    thresholdRowElement.append(thresholdLabelElement, thresholdValuesElement),
    chartSettingsElement.append(thresholdRowElement),
    addColorRow(
      "折线颜色",
      gl2.map((colorThresholdRow) => colorThresholdRow.color),
      (nextColorValue: any, colorSlot: any) => {
        customPopupEditorCtx.mutateDocument((colorRowDraft: any) => {
          const updatedColorThresholdModule = (colorRowDraft.customPopups || [])
            .find(
              (colorThresholdPopupCandidate: any) =>
                colorThresholdPopupCandidate.id === lineChartPopupId,
            )
            ?.modules?.find(
              (colorThresholdModuleCandidate: any) =>
                colorThresholdModuleCandidate.id === lineChartModule.id,
            );
          if (!updatedColorThresholdModule || updatedColorThresholdModule.type !== "line-chart")
            return;
          const gl4 = resolveLineChartThresholds(updatedColorThresholdModule);
          ((gl4[colorSlot] = {
            ...gl4[colorSlot],
            color: nextColorValue,
          }),
            (updatedColorThresholdModule.properties = {
              ...(updatedColorThresholdModule.properties || {}),
              thresholdMode: "manual",
              thresholds: gl4,
            }));
        });
      },
      thresholdModeSelectElement.value === "auto",
    ),
    chartSettingsElement
  );
}
export function renderCustomPopupEditor(ctx: CustomPopupEditorContext) {
  customPopupEditorCtx = ctx;
  if (ctx.editorMode !== "popup") return;
  const activePopup = findCustomPopup2(ctx.activeProject?.document, ctx.selectedPopupId);
  if ((ctx.customPopupEditorElement.replaceChildren(), !activePopup)) {
    const popupEmptyStateElement = document.createElement("div");
    ((popupEmptyStateElement.className = "custom-popup-empty"),
      (popupEmptyStateElement.innerHTML =
        "<div><strong>还没有组合弹窗</strong><p>从左侧新建后，可以混合添加灯光、空调、空气净化器、窗帘、摄像头和折线图。</p></div>"),
      ctx.customPopupEditorElement.append(popupEmptyStateElement));
    return;
  }
  const popupEditorShellElement = document.createElement("div");
  popupEditorShellElement.className = "custom-popup-editor-shell";
  const toolbarElement = document.createElement("div");
  toolbarElement.className = "custom-popup-editor-toolbar";
  const titleGroupElement = document.createElement("div"),
    popupNameElement = document.createElement("strong");
  popupNameElement.textContent = activePopup.name;
  const layoutSummaryElement = document.createElement("span"),
    metrics = popupLayoutMetrics2(activePopup.modules || [], activePopup.layout);
  ((layoutSummaryElement.textContent =
    metrics.columns + " 列 × " + metrics.rows + " 行·行数自适应"),
    titleGroupElement.append(popupNameElement, layoutSummaryElement));
  const toolbarActionsElement = document.createElement("div");
  toolbarActionsElement.className = "custom-popup-toolbar-actions";
  const columnToggleElement = document.createElement("span");
  columnToggleElement.className = "custom-popup-layout-toggle";
  for (const columnCount of [2, 3, 4]) {
    const columnButtonElement = document.createElement("button");
    ((columnButtonElement.type = "button"),
      (columnButtonElement.textContent = columnCount + " 列"),
      columnButtonElement.classList.toggle(
        "active",
        popupLayoutColumns2(activePopup.layout) === columnCount,
      ),
      columnButtonElement.addEventListener("click", () => {
        if (popupLayoutColumns2(activePopup.layout) === columnCount) return;
        const nextState = {
          ...(activePopup.layout || {}),
          columns: columnCount,
        };
        if (!packPopupModules2(activePopup.modules || [], nextState).fits) {
          ctx.handleOperationError(new Error("当前模块在 " + columnCount + " 列布局中会超过 3 行。"));
          return;
        }
        ctx.mutateDocument((layoutDraft: any) => {
          const layoutPopup = (layoutDraft.customPopups || []).find(
            (layoutPopupCandidate: any) => layoutPopupCandidate.id === activePopup.id,
          );
          layoutPopup &&
            (layoutPopup.layout = {
              ...(layoutPopup.layout || {}),
              columns: columnCount,
            });
        });
      }),
      columnToggleElement.append(columnButtonElement));
  }
  const addModuleButtonElement = document.createElement("button");
  ((addModuleButtonElement.type = "button"),
    (addModuleButtonElement.textContent = "＋ 添加模块"),
    addModuleButtonElement.addEventListener("click", () => ctx.openPopupModuleDialog()),
    toolbarActionsElement.append(columnToggleElement, addModuleButtonElement),
    toolbarElement.append(titleGroupElement, toolbarActionsElement));
  const editorStageWrapElement = document.createElement("div");
  editorStageWrapElement.className = "custom-popup-stage-wrap";
  const viewportWrapElement = document.createElement("div");
  viewportWrapElement.className = "custom-popup-viewport";
  const stageGridElement = document.createElement("div");
  ((stageGridElement.className = "custom-popup-stage"),
    (stageGridElement.style.width = metrics.gridWidth + "px"),
    (stageGridElement.style.height = metrics.gridHeight + "px"),
    stageGridElement.style.setProperty("--popup-columns", String(metrics.columns)),
    stageGridElement.style.setProperty("--popup-rows", String(metrics.rows)),
    (stageGridElement.style.gridTemplateColumns =
      "repeat(" + metrics.columns + ", minmax(0, 1fr))"),
    (stageGridElement.style.gridTemplateRows = "repeat(" + metrics.rows + ", minmax(0, 1fr))"));
  let draggedModuleId: any = null;
  const clearDropIndicators = () => {
    stageGridElement.classList.remove("popup-module-append-target");
    for (const dropIndicatorElement of stageGridElement.querySelectorAll(
      ".popup-module-drop-top,.popup-module-drop-right,.popup-module-drop-bottom,.popup-module-drop-left",
    ))
      dropIndicatorElement.classList.remove(
        "popup-module-drop-top",
        "popup-module-drop-right",
        "popup-module-drop-bottom",
        "popup-module-drop-left",
      );
  };
  (stageGridElement.addEventListener("dragover", (dragEvent) => {
    !draggedModuleId ||
      (dragEvent.target as Element).closest(".popup-module-card") ||
      (dragEvent.preventDefault(),
      clearDropIndicators(),
      stageGridElement.classList.add("popup-module-append-target"),
      dragEvent.dataTransfer && (dragEvent.dataTransfer.dropEffect = "move"));
  }),
    stageGridElement.addEventListener("drop", (dropEvent) => {
      if (!draggedModuleId || (dropEvent.target as Element).closest(".popup-module-card")) return;
      dropEvent.preventDefault();
      const movedModuleId = draggedModuleId;
      (clearDropIndicators(), applyPopupModuleReorder(customPopupEditorCtx, activePopup.id, movedModuleId));
    }));
  for (const [moduleSlotIndex, popupModuleEntry] of (activePopup.modules || []).entries()) {
    const placement = metrics.placements[moduleSlotIndex] || {
        x: 0,
        y: moduleSlotIndex,
        width: 1,
        height: 1,
      },
      columnSpan = [
        "climate",
        "air-purifier",
        "water-heater",
        "media-player",
        "camera",
        "line-chart",
      ].includes(popupModuleEntry.type)
        ? 2
        : placement.width,
      moduleCardElement = document.createElement("article");
    ((moduleCardElement.className = "popup-module-card"),
      (moduleCardElement.dataset.popupModuleId = popupModuleEntry.id),
      (moduleCardElement.draggable = true),
      moduleCardElement.setAttribute(
        "aria-label",
        (popupModuleEntry.title || ctx.deviceNameValue(popupModuleEntry.entityId)) + "，可拖动排序",
      ),
      (moduleCardElement.style.gridColumn = placement.x + 1 + " / span " + columnSpan),
      (moduleCardElement.style.gridRow = placement.y + 1 + " / span " + placement.height));
    const cardHeadingElement = document.createElement("div");
    cardHeadingElement.className = "popup-module-card-heading";
    const cardTitleWrapElement = document.createElement("div"),
      cardTitleElement = document.createElement("strong");
    ((cardTitleElement.textContent =
      popupModuleEntry.title || ctx.deviceNameValue(popupModuleEntry.entityId)),
      cardTitleWrapElement.append(cardTitleElement));
    const cardActionsElement = document.createElement("span");
    cardActionsElement.className = "popup-module-card-actions";
    const editModuleButtonElement = document.createElement("button");
    ((editModuleButtonElement.type = "button"),
      (editModuleButtonElement.textContent = "✎"),
      (editModuleButtonElement.title = "编辑模块"),
      editModuleButtonElement.addEventListener("click", () =>
        ctx.openPopupModuleDialog(popupModuleEntry),
      ));
    const duplicateModuleButtonElement = document.createElement("button");
    ((duplicateModuleButtonElement.type = "button"),
      (duplicateModuleButtonElement.textContent = "⎘"),
      (duplicateModuleButtonElement.title = "复制模块"),
      duplicateModuleButtonElement.addEventListener("click", () => {
        const duplicatedModules = [
          ...(activePopup.modules || []),
          {
            ...clone2(popupModuleEntry),
            id: "candidate",
          },
        ];
        if (!packPopupModules2(duplicatedModules, activePopup.layout).fits) {
          ctx.handleOperationError(new Error("当前布局已放不下这个复制模块。"));
          return;
        }
        ctx.mutateDocument((duplicateDraft: any) => {
          const duplicatePopup = (duplicateDraft.customPopups || []).find(
              (duplicatePopupCandidate: any) => duplicatePopupCandidate.id === activePopup.id,
            ),
            sourceModule = duplicatePopup?.modules?.find(
              (duplicatedModuleCandidate: any) => duplicatedModuleCandidate.id === popupModuleEntry.id,
            );
          sourceModule &&
            duplicatePopup.modules.push({
              ...clone2(sourceModule),
              id: newId2("popup-module"),
            });
        });
      }));
    const deleteModuleButtonElement = document.createElement("button");
    ((deleteModuleButtonElement.type = "button"),
      (deleteModuleButtonElement.textContent = "×"),
      (deleteModuleButtonElement.title = "删除模块"),
      deleteModuleButtonElement.addEventListener("click", () =>
        ctx.mutateDocument((deleteDraft: any) => {
          const deletePopup = (deleteDraft.customPopups || []).find(
            (deletePopupCandidate: any) => deletePopupCandidate.id === activePopup.id,
          );
          deletePopup &&
            (deletePopup.modules = deletePopup.modules.filter(
              (moduleToRemove: any) => moduleToRemove.id !== popupModuleEntry.id,
            ));
        }),
      ),
      cardActionsElement.append(
        editModuleButtonElement,
        duplicateModuleButtonElement,
        deleteModuleButtonElement,
      ),
      moduleCardElement.addEventListener("pointerdown", (pointerDownEvent) => {
        moduleCardElement.dataset.dragBlocked = String(
          !!(pointerDownEvent.target as Element).closest(
            ".popup-module-card-actions,.popup-cover-settings,.popup-climate-settings,.popup-line-chart-settings",
          ),
        );
      }),
      moduleCardElement.addEventListener("pointerup", () => {
        delete moduleCardElement.dataset.dragBlocked;
      }),
      moduleCardElement.addEventListener("pointercancel", () => {
        delete moduleCardElement.dataset.dragBlocked;
      }),
      moduleCardElement.addEventListener("dragstart", (dragStartEvent) => {
        if (moduleCardElement.dataset.dragBlocked === "true") {
          (dragStartEvent.preventDefault(), delete moduleCardElement.dataset.dragBlocked);
          return;
        }
        ((draggedModuleId = popupModuleEntry.id),
          moduleCardElement.classList.add("popup-module-dragging"),
          moduleCardElement.setAttribute("aria-grabbed", "true"),
          dragStartEvent.dataTransfer &&
            ((dragStartEvent.dataTransfer.effectAllowed = "move"),
            dragStartEvent.dataTransfer.setData("text/plain", popupModuleEntry.id)));
      }),
      moduleCardElement.addEventListener("dragover", (cardDragOverEvent) => {
        if (!draggedModuleId || draggedModuleId === popupModuleEntry.id) return;
        (cardDragOverEvent.preventDefault(),
          cardDragOverEvent.stopPropagation(),
          clearDropIndicators());
        const { edge: dropEdge } = popupModuleDropPosition2(moduleCardElement, cardDragOverEvent);
        (moduleCardElement.classList.add("popup-module-drop-" + dropEdge),
          cardDragOverEvent.dataTransfer && (cardDragOverEvent.dataTransfer.dropEffect = "move"));
      }),
      moduleCardElement.addEventListener("drop", (cardDropEvent) => {
        if (!draggedModuleId || draggedModuleId === popupModuleEntry.id) return;
        (cardDropEvent.preventDefault(), cardDropEvent.stopPropagation());
        const sourceModuleId = draggedModuleId,
          { placeAfter: placeAfterModule } = popupModuleDropPosition2(
            moduleCardElement,
            cardDropEvent,
          );
        (clearDropIndicators(),
          applyPopupModuleReorder(
            customPopupEditorCtx,
            activePopup.id,
            sourceModuleId,
            popupModuleEntry.id,
            placeAfterModule,
          ));
      }),
      moduleCardElement.addEventListener("dragend", () => {
        ((draggedModuleId = null),
          delete moduleCardElement.dataset.dragBlocked,
          moduleCardElement.classList.remove("popup-module-dragging"),
          moduleCardElement.removeAttribute("aria-grabbed"),
          clearDropIndicators());
      }),
      cardHeadingElement.append(cardTitleWrapElement, cardActionsElement));
    const placeholderElement = document.createElement("div");
    placeholderElement.className = "popup-module-placeholder";
    const placeholderTitleElement = document.createElement("strong");
    placeholderTitleElement.textContent = popupModuleTypeLabel2(popupModuleEntry.type) + "交互模块";
    const placeholderEntityElement = document.createElement("span");
    placeholderEntityElement.textContent = ctx.deviceNameValue(popupModuleEntry.entityId);
    const placeholderIdElement = document.createElement("small");
    ((placeholderIdElement.textContent = popupModuleEntry.entityId),
      placeholderElement.append(
        placeholderTitleElement,
        placeholderEntityElement,
        placeholderIdElement,
      ),
      popupModuleEntry.type === "cover" &&
        placeholderElement.append(createPopupCoverSettings(activePopup.id, popupModuleEntry)),
      popupModuleEntry.type === "climate" &&
        placeholderElement.append(createPopupClimateSettings(activePopup.id, popupModuleEntry)),
      popupModuleEntry.type === "line-chart" &&
        placeholderElement.append(createPopupLineChartSettings(activePopup.id, popupModuleEntry)),
      moduleCardElement.append(cardHeadingElement, placeholderElement),
      stageGridElement.append(moduleCardElement));
  }
  if (!(activePopup.modules || []).length) {
    const stageEmptyElement = document.createElement("div");
    ((stageEmptyElement.className = "custom-popup-empty"),
      (stageEmptyElement.style.gridColumn = "1 / -1"),
      (stageEmptyElement.style.gridRow = "1 / -1"),
      (stageEmptyElement.textContent = "点击“添加模块”开始组合弹窗"),
      stageGridElement.append(stageEmptyElement));
  }
  (viewportWrapElement.append(stageGridElement),
    editorStageWrapElement.append(viewportWrapElement),
    popupEditorShellElement.append(toolbarElement, editorStageWrapElement),
    ctx.customPopupEditorElement.append(popupEditorShellElement),
    window.requestAnimationFrame(() => syncCustomPopupStage(ctx)));
}
