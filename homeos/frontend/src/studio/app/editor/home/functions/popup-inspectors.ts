/* 弹窗检查器（资源选项、弹窗/时间/天气检查器） */
import type { EditorContext } from "../editor-context";
import { clampNumber as clampNumber2, roundField as roundField2, normalizedFontWeight as normalizedFontWeight2 } from "../../editor-utils";
import { fitInspectorComponentToDimensions as fitInspectorComponentToDimensions2, inspectorComponentMetrics as inspectorComponentMetrics2 } from "../../editor-basic-inspectors";
import { timeComponentDimensions as timeComponentDimensions2, dateComponentDimensions as dateComponentDimensions2, weatherComponentDimensions as weatherComponentDimensions2 } from "../../component-templates";
import { type CustomPopupEditorContext, renderCustomPopupEditor as renderCustomPopupEditorExternal, syncCustomPopupStage as syncCustomPopupStageExternal } from "../../home-custom-popup-editor";
import { syncTimeInspector as syncTimeInspectorExternal } from "../../home-time-inspector";
import { syncWeatherInspector as syncWeatherInspectorExternal } from "../../home-weather-inspector";
import { renderEntityOptionButtons } from "./entity-option-list";
import { positionFloatingMenu } from "../../../shared/util/editor-floating-layout";

export interface PopupInspectorsDeps {
  editorCtx: EditorContext;
  assetDisplayName: any;
  assetMatchesId: any;
  assignActionControlIds: any;
  buildCustomPopupEditorContext: any;
  buildTimeInspectorContext: any;
  buildWeatherInspectorContext: any;
  createAssetOptionButton: any;
  currentPage: any;
  customPopupEditorElement: any;
  dateLabelElement: any;
  dateLeftElement: any;
  dateLineGapElement: any;
  dateLunarColorElement: any;
  dateLunarElement: any;
  dateLunarSizeElement: any;
  dateLunarSpacingElement: any;
  dateLunarWeightElement: any;
  dateOpacityElement: any;
  datePrimaryColorElement: any;
  datePrimarySizeElement: any;
  datePrimarySpacingElement: any;
  datePrimaryWeightElement: any;
  dateRotationElement: any;
  dateScaleElement: any;
  dateTopElement: any;
  dateTypeElement: any;
  dateWeekdayElement: any;
  deviceNameValue: any;
  enhanceEntityCopyButton: any;
  findAssetById: any;
  handleOperationError: any;
  hideAssetLargePreview: any;
  ibeAssetButtonElement: any;
  ibeAssetMenuElement: any;
  ibeAssetOptionsElement: any;
  ibeAssetSearchElement: any;
  imageAssetButtonElement: any;
  imageAssetOptionsElement: any;
  imageAssetSearchInputElement: any;
  leftFolderName: any;
  mutateDocument: any;
  openPopupModuleDialog: any;
  probeAssetNaturalSize: any;
  removedComponent: any;
  resolveEffectAssetUrl: any;
  runAlt: any;
  runBackup: any;
  runExtraFallback: any;
  runMode: any;
  runQueue: any;
  runSnapshot: any;
  syncAssetFolderOptions: any;
  timeColorElement: any;
  timeFontSizeElement: any;
  timeFontWeightElement: any;
  timeHourFormatElement: any;
  timeLabelElement: any;
  timeLeftElement: any;
  timeLetterSpacingElement: any;
  timeOpacityElement: any;
  timeRotationElement: any;
  timeScaleElement: any;
  timeSecondsElement: any;
  timeTopElement: any;
  timeTypeElement: any;
  weatherConditionVisibleElement: any;
  weatherHumidityVisibleElement: any;
  weatherIconGapElement: any;
  weatherIconSizeElement: any;
  weatherIconVisibleElement: any;
  weatherLabelElement: any;
  weatherLeftElement: any;
  weatherLineGapElement: any;
  weatherOpacityElement: any;
  weatherRotationElement: any;
  weatherScaleElement: any;
  weatherSecondaryColorElement: any;
  weatherSecondarySizeElement: any;
  weatherSecondarySpacingElement: any;
  weatherSecondaryWeightElement: any;
  weatherTemperatureColorElement: any;
  weatherTemperatureSizeElement: any;
  weatherTemperatureSpacingElement: any;
  weatherTemperatureVisibleElement: any;
  weatherTemperatureWeightElement: any;
  weatherTopElement: any;
  weatherTypeElement: any;
}

export function createAssetOptionButton(deps: PopupInspectorsDeps, optionAsset: any, selectedAssetId: any) {
  const assetOptionButton = document.createElement("button");
  ((assetOptionButton.type = "button"),
    (assetOptionButton.className =
      "inspector-asset-option" + (deps.assetMatchesId(optionAsset, selectedAssetId) ? " selected" : "")),
    (assetOptionButton.dataset.assetId = optionAsset.assetId),
    (assetOptionButton.title = optionAsset.name),
    assetOptionButton.setAttribute("role", "option"),
    assetOptionButton.setAttribute(
      "aria-selected",
      String(deps.assetMatchesId(optionAsset, selectedAssetId)),
    ));
  const previewImageElement = document.createElement("img");
  ((previewImageElement.src = deps.resolveEffectAssetUrl(optionAsset)),
    (previewImageElement.alt = optionAsset.name),
    (previewImageElement.loading = "lazy"),
    previewImageElement.addEventListener("error", () =>
      assetOptionButton.classList.add("image-load-error"),
    ));
  const assetNameElement = document.createElement("span");
  if (
    ((assetNameElement.textContent = deps.assetDisplayName(optionAsset)),
    assetOptionButton.append(previewImageElement, assetNameElement),
    optionAsset.source === "studio3d-export" || optionAsset.source !== "user")
  )
    return assetOptionButton;
  const deleteWrapElement = document.createElement("div");
  deleteWrapElement.className = "user-asset-option-wrap";
  const deleteButtonElement = document.createElement("button");
  return (
    (deleteButtonElement.type = "button"),
    (deleteButtonElement.className = "user-asset-delete"),
    (deleteButtonElement.dataset.deleteUserAsset = optionAsset.assetId),
    (deleteButtonElement.title = "删除 " + optionAsset.name),
    deleteButtonElement.setAttribute("aria-label", "删除 " + optionAsset.name),
    (deleteButtonElement.textContent = "×"),
    deleteWrapElement.append(assetOptionButton, deleteButtonElement),
    deleteWrapElement
  );
}

export function renderImageAssetOptions(deps: PopupInspectorsDeps, assetSearchQuery = "") {
  deps.hideAssetLargePreview();
  const boundAssetId = deps.removedComponent()?.properties?.assetId || "",
    normalizedAssetQuery = assetSearchQuery.trim().toLocaleLowerCase("zh-CN"),
    filteredAssets = (deps.editorCtx.imageAssetFolder === "user" ? deps.editorCtx.userAssets : deps.editorCtx.userAssetsState).filter(
      (matchingAsset: any) => {
        const matchesQuery =
            !normalizedAssetQuery ||
            (matchingAsset.name + " " + matchingAsset.relativePath)
              .toLocaleLowerCase("zh-CN")
              .includes(normalizedAssetQuery),
          matchesFolder = !!normalizedAssetQuery || matchingAsset.folder === deps.editorCtx.imageAssetFolderState;
        return matchesQuery && matchesFolder;
      },
    ),
    clearAssetButton = document.createElement("button");
  if (
    ((clearAssetButton.type = "button"),
    (clearAssetButton.className = "inspector-asset-clear" + (boundAssetId ? "" : " selected")),
    (clearAssetButton.dataset.assetId = ""),
    clearAssetButton.setAttribute("role", "option"),
    clearAssetButton.setAttribute("aria-selected", String(!boundAssetId)),
    (clearAssetButton.textContent = "不使用图片"),
    !filteredAssets.length)
  ) {
    const assetNoMatchElement = document.createElement("div");
    ((assetNoMatchElement.className = "inspector-picker-empty"),
      (assetNoMatchElement.textContent = "没有匹配的图片"),
      deps.imageAssetOptionsElement.replaceChildren(clearAssetButton, assetNoMatchElement));
    return;
  }
  deps.imageAssetOptionsElement.replaceChildren(
    clearAssetButton,
    ...filteredAssets.map((assetForOption: any) =>
      deps.createAssetOptionButton(assetForOption, boundAssetId),
    ),
  );
}

export function syncImageAssetSelection(deps: PopupInspectorsDeps, imageComponent: any) {
  const currentAssetId = imageComponent.properties?.assetId || "",
    sn2 = deps.findAssetById(currentAssetId);
  ((deps.editorCtx.imageAssetFolder =
    ["user", "studio3d-export"].includes(sn2?.source) || (deps.editorCtx.userAssets.length && !sn2)
      ? "user"
      : "builtin"),
    (deps.editorCtx.imageAssetFolderState = sn2?.folder || "" || deps.editorCtx.imageAssetFolderState),
    deps.leftFolderName("image"),
    deps.syncAssetFolderOptions("image"),
    (deps.imageAssetButtonElement.textContent = sn2?.name || currentAssetId || "不使用图片"),
    (deps.imageAssetSearchInputElement.value = ""),
    deps.imageAssetOptionsElement.replaceChildren(),
    deps.probeAssetNaturalSize(imageComponent, sn2));
}

export function positionEffectAssetMenu(deps: PopupInspectorsDeps) {
  if (deps.ibeAssetMenuElement.hidden) return;
  positionFloatingMenu({
    anchor: deps.ibeAssetButtonElement,
    panel: deps.ibeAssetMenuElement,
    optionsElement: deps.ibeAssetOptionsElement,
    optionsReserve: 150,
    optionsMinHeight: 80,
    maxHeight: 470,
    gap: 8,
  });
}

export function renderEffectAssetOptions(deps: PopupInspectorsDeps, effectAssetSearchQuery = "") {
  deps.hideAssetLargePreview();
  const boundEffectAssetId = deps.removedComponent()?.properties?.effectAssetId || "",
    normalizedEffectQuery = effectAssetSearchQuery.trim().toLocaleLowerCase("zh-CN"),
    filteredEffectAssets = (deps.editorCtx.effectAssetFolder === "user" ? deps.editorCtx.userAssets : deps.editorCtx.userAssetsState).filter(
      (effectMatchingAsset: any) =>
        (!normalizedEffectQuery ||
          (effectMatchingAsset.name + " " + effectMatchingAsset.relativePath)
            .toLocaleLowerCase("zh-CN")
            .includes(normalizedEffectQuery)) &&
        (!!normalizedEffectQuery || effectMatchingAsset.folder === deps.editorCtx.effectAssetFolderState),
    ),
    effectClearAssetButton = document.createElement("button");
  ((effectClearAssetButton.type = "button"),
    (effectClearAssetButton.className =
      "inspector-asset-clear" + (boundEffectAssetId ? "" : " selected")),
    (effectClearAssetButton.dataset.assetId = ""),
    effectClearAssetButton.setAttribute("role", "option"),
    effectClearAssetButton.setAttribute("aria-selected", String(!boundEffectAssetId)),
    (effectClearAssetButton.textContent = "不使用图片"));
  const effectAssetOptionButtons = filteredEffectAssets.map((effectOptionAsset: any) =>
      deps.createAssetOptionButton(effectOptionAsset, boundEffectAssetId),
    ),
    effectNoMatchElement = document.createElement("div");
  ((effectNoMatchElement.className = "inspector-picker-empty"),
    effectAssetOptionButtons.length || (effectNoMatchElement.textContent = "没有匹配的图片"),
    deps.ibeAssetOptionsElement.replaceChildren(
      effectClearAssetButton,
      ...effectAssetOptionButtons,
      ...(effectNoMatchElement.textContent ? [effectNoMatchElement] : []),
    ));
}

export function syncEffectAssetSelection(deps: PopupInspectorsDeps, effectOwnerComponent: any) {
  const currentEffectAssetId = effectOwnerComponent.properties?.effectAssetId || "",
    sn3 = deps.findAssetById(currentEffectAssetId);
  ((deps.editorCtx.effectAssetFolder =
    ["user", "studio3d-export"].includes(sn3?.source) || (deps.editorCtx.userAssets.length && !sn3)
      ? "user"
      : "builtin"),
    (deps.editorCtx.effectAssetFolderState = sn3?.folder || deps.editorCtx.effectAssetFolderState),
    deps.leftFolderName("ibe"),
    deps.syncAssetFolderOptions("ibe"),
    (deps.ibeAssetButtonElement.textContent = sn3?.name || currentEffectAssetId || "不使用图片"),
    (deps.ibeAssetSearchElement.value = ""),
    deps.ibeAssetOptionsElement.replaceChildren());
}

export function assignActionControlIds(deps: PopupInspectorsDeps, controlElement: any) {
  const formId = controlElement.closest(".inspector-form[id]")?.id || "component-action",
    replace3 = String(controlElement.dataset.actionTrigger || "action").replace(
      /[^a-zA-Z0-9_-]/g,
      "-",
    ),
    idSelectorPairs = [
      ["[data-action-target]", "target"],
      ["[data-popup-source]", "popup-source"],
      ["[data-popup-entity-search]", "popup-entity-search"],
      ["[data-popup-entity]", "popup-entity"],
      ["[data-popup-custom]", "popup-custom"],
    ];
  for (const [selectorKey, idSuffix] of idSelectorPairs) {
    const targetControlElement = controlElement.querySelector(selectorKey);
    targetControlElement &&
      !targetControlElement.id &&
      !targetControlElement.name &&
      (targetControlElement.id = formId + "-" + replace3 + "-" + idSuffix);
  }
}

export function initActionPopupConfig(deps: PopupInspectorsDeps) {
  for (const moreElement of document.querySelectorAll('[data-action-type="more-info"]'))
    moreElement.textContent = "打开弹窗";
  for (const actionControlElement of document.querySelectorAll(
    ".component-action-control[data-action-trigger]",
  )) {
    if (
      (deps.assignActionControlIds(actionControlElement),
      actionControlElement.querySelector(".component-popup-config"))
    )
      continue;
    const popupSettingsElement = document.createElement("div");
    ((popupSettingsElement.className = "component-popup-config"),
      (popupSettingsElement.hidden = true),
      (popupSettingsElement.innerHTML =
        '\n      <label class="component-popup-config-row"><span>弹窗来源</span><select data-popup-source><option value="current">当前实体</option><option value="entity">其它实体</option><option value="custom">组合弹窗</option></select></label>\n      <div class="component-popup-config-row" data-popup-entity-row><span>选择实体</span><div class="component-popup-entity-picker"><button class="inspector-picker-button" type="button" data-popup-entity-button aria-haspopup="listbox" aria-expanded="false">选择实体</button><div class="inspector-picker-menu component-popup-entity-menu" data-popup-entity-menu hidden><input type="search" data-popup-entity-search placeholder="搜索实体名称或 ID" autocomplete="off"><div class="inspector-entity-options" data-popup-entity-options role="listbox"></div></div><input type="hidden" data-popup-entity></div></div>\n      <label class="component-popup-config-row" data-popup-custom-row><span>选择弹窗</span><select data-popup-custom></select></label>\n      <button class="component-popup-preview" type="button" data-popup-preview>预览弹窗</button>'),
      actionControlElement.append(popupSettingsElement),
      deps.assignActionControlIds(actionControlElement));
    const popupEntityButtonElement = popupSettingsElement.querySelector(
        "[data-popup-entity-button]",
      ),
      popupEntityInputElement = popupSettingsElement.querySelector<HTMLInputElement>("[data-popup-entity]");
    deps.enhanceEntityCopyButton(popupEntityButtonElement, () => popupEntityInputElement?.value || "");
  }
}

export function closePopupEntityMenus(deps: PopupInspectorsDeps, activeTriggerElement: any = null) {
  for (const popupMenuElement of document.querySelectorAll<HTMLElement>("[data-popup-entity-menu]")) {
    const triggerElement = popupMenuElement.closest("[data-action-trigger]");
    triggerElement !== activeTriggerElement &&
      ((popupMenuElement.hidden = true),
      triggerElement
        ?.querySelector("[data-popup-entity-button]")
        ?.setAttribute("aria-expanded", "false"));
  }
}

export function syncPopupEntityButton(deps: PopupInspectorsDeps, configElement: any) {
  const popupEntityId = configElement?.querySelector("[data-popup-entity]")?.value || "",
    popupEntity = deps.editorCtx.entities.find(
      (popupCandidateEntity: any) => popupCandidateEntity.entityId === popupEntityId,
    ),
    popupPickerButtonElement = configElement?.querySelector("[data-popup-entity-button]");
  if (!popupPickerButtonElement) return;
  const buttonLabel = popupEntity
    ? "[" + deps.runQueue(popupEntity) + "] " + deps.runSnapshot(popupEntity)
    : popupEntityId || "选择实体";
  (deps.runBackup(popupPickerButtonElement, buttonLabel, popupEntityId || buttonLabel),
    (popupPickerButtonElement.dataset.entityId = popupEntityId),
    popupPickerButtonElement._entityCopySync?.());
}

export function renderPopupEntityOptions(deps: PopupInspectorsDeps, popupConfigElement: any, popupSearchQuery = "") {
  const optionsElement = popupConfigElement?.querySelector("[data-popup-entity-options]"),
    popupSelectedEntityId = popupConfigElement?.querySelector("[data-popup-entity]")?.value || "";
  if (!optionsElement) return;
  const normalizedPopupQuery = String(popupSearchQuery || "")
      .trim()
      .toLocaleLowerCase("zh-CN"),
    filteredEntities = deps.editorCtx.entities.filter(
      (listedPopupEntity: any) =>
        !normalizedPopupQuery ||
        (deps.runMode(listedPopupEntity) + " " + listedPopupEntity.entityId)
          .toLocaleLowerCase("zh-CN")
          .includes(normalizedPopupQuery),
    );
  if (
    (renderEntityOptionButtons(optionsElement, filteredEntities, {
      selectedId: popupSelectedEntityId,
      datasetKey: "popupActionEntityId",
      deps,
    }),
    !filteredEntities.length)
  ) {
    const popupNoMatchElement = document.createElement("div");
    ((popupNoMatchElement.className = "inspector-picker-empty"),
      (popupNoMatchElement.textContent = "没有匹配的实体"),
      optionsElement.append(popupNoMatchElement));
  }
}

export function positionPopupEntityMenu(deps: PopupInspectorsDeps, triggerConfigElement: any) {
  const popupEntityButtonPanel = triggerConfigElement?.querySelector("[data-popup-entity-button]"),
    entityMenuElementElement = triggerConfigElement?.querySelector("[data-popup-entity-menu]");
  if (!popupEntityButtonPanel || !entityMenuElementElement || entityMenuElementElement.hidden)
    return;
  const optionsElement = entityMenuElementElement.querySelector("[data-popup-entity-options]");
  positionFloatingMenu({
    anchor: popupEntityButtonPanel,
    panel: entityMenuElementElement,
    optionsElement,
    optionsReserve: 58,
    optionsMinHeight: 120,
    maxHeight: 340,
    maxWidth: Math.min(
      popupEntityButtonPanel.getBoundingClientRect().width,
      window.innerWidth - 16,
    ),
    gap: 5,
  });
}

export function timeFitComponent(deps: PopupInspectorsDeps, timeFitProperties: any, timeProperties = timeFitProperties?.properties || {}) {
  fitInspectorComponentToDimensions2(timeFitProperties, timeProperties, timeComponentDimensions2);
}

export function renderTimeInspector(deps: PopupInspectorsDeps, dateProperties: any) {
  const availablePropertiesState = dateProperties.properties || {},
    {
      left: datePropertiesState,
      top: DATE_INSPECTOR_FIELDS,
      scale: DATE_INSPECTOR_TOGGLES,
      rotation: datePropertiesValue,
    }: any = inspectorComponentMetrics2(dateProperties, deps.editorCtx.activeProject.document);
  ((deps.timeTypeElement.value = "时间"),
    (deps.timeLabelElement.value = availablePropertiesState.label || ""));
  for (const datePropertiesElement of deps.timeHourFormatElement.querySelectorAll(
    "[data-time-hour-format]",
  ))
    datePropertiesElement.classList.toggle(
      "active",
      datePropertiesElement.dataset.timeHourFormat ===
        (availablePropertiesState.hour12 === true ? "12" : "24"),
    );
  for (const weatherPropertiesElement of deps.timeSecondsElement.querySelectorAll("[data-time-seconds]"))
    weatherPropertiesElement.classList.toggle(
      "active",
      weatherPropertiesElement.dataset.timeSeconds ===
        (availablePropertiesState.showSeconds === true ? "on" : "off"),
    );
  ((deps.timeColorElement.value = availablePropertiesState.color || "#248eb2"),
    (deps.timeFontSizeElement.value = roundField2(
      clampNumber2(Number(availablePropertiesState.fontSize ?? 96), 12, 500),
    )),
    (deps.timeFontWeightElement.value = roundField2(
      normalizedFontWeight2(availablePropertiesState.fontWeight),
    )),
    (deps.timeLetterSpacingElement.value = roundField2(
      clampNumber2(Number(availablePropertiesState.letterSpacing ?? 2.2), -20, 100),
    )),
    (deps.timeOpacityElement.value = roundField2(
      clampNumber2(Number(availablePropertiesState.opacity ?? 1) * 100, 0, 100),
    )),
    (deps.timeLeftElement.value = datePropertiesState),
    (deps.timeTopElement.value = DATE_INSPECTOR_FIELDS),
    (deps.timeScaleElement.value = DATE_INSPECTOR_TOGGLES),
    (deps.timeRotationElement.value = datePropertiesValue),
    (deps.timeScaleElement.disabled = false),
    (deps.timeRotationElement.disabled = false));
}

export function weatherProperties(deps: PopupInspectorsDeps, 
  availablePropertiesValue: any,
  availablePropertiesConfig = availablePropertiesValue?.properties || {},
) {
  fitInspectorComponentToDimensions2(
    availablePropertiesValue,
    availablePropertiesConfig,
    dateComponentDimensions2,
  );
}

export function fitWeatherComponentToDimensions(deps: PopupInspectorsDeps, 
  weatherFitComponent: any,
  weatherFitProperties = weatherFitComponent?.properties || {},
) {
  fitInspectorComponentToDimensions2(
    weatherFitComponent,
    weatherFitProperties,
    weatherComponentDimensions2,
  );
}

export function entitiesByEntityId(deps: PopupInspectorsDeps) {
  return new Map(
    deps.editorCtx.entities
      .map((entityRecord: any) => [String(entityRecord.entityId || ""), entityRecord] as const)
      .filter(([entityValue]: any) => entityValue),
  );
}

export function devicesByDeviceId(deps: PopupInspectorsDeps) {
  return new Map(
    deps.editorCtx.devices
      .map((deviceRecord: any) => [String(deviceRecord.deviceId || ""), deviceRecord] as const)
      .filter(([deviceValue]: any) => deviceValue),
  );
}

export function buildCustomPopupEditorContext(deps: PopupInspectorsDeps): CustomPopupEditorContext {
  return {
    get editorMode() {
      return deps.editorCtx.editorMode;
    },
    get activeProject() {
      return deps.editorCtx.activeProject;
    },
    get selectedPopupId() {
      return deps.editorCtx.selectedPopupId;
    },
    customPopupEditorElement: deps.customPopupEditorElement,
    mutateDocument: deps.mutateDocument,
    handleOperationError: deps.handleOperationError,
    currentPage: deps.currentPage,
    deviceNameValue: deps.deviceNameValue,
    openPopupModuleDialog: deps.openPopupModuleDialog,
  };
}

export function renderCustomPopupEditor(deps: PopupInspectorsDeps) {
  renderCustomPopupEditorExternal(deps.buildCustomPopupEditorContext());
}

export function syncCustomPopupStage(deps: PopupInspectorsDeps) {
  syncCustomPopupStageExternal(deps.buildCustomPopupEditorContext());
}

export function buildTimeInspectorContext(deps: PopupInspectorsDeps) {
  return {
    get activeProject() {
      return deps.editorCtx.activeProject;
    },
    dateTypeElement: deps.dateTypeElement,
    dateLabelElement: deps.dateLabelElement,
    dateWeekdayElement: deps.dateWeekdayElement,
    dateLunarElement: deps.dateLunarElement,
    datePrimaryColorElement: deps.datePrimaryColorElement,
    datePrimarySizeElement: deps.datePrimarySizeElement,
    datePrimaryWeightElement: deps.datePrimaryWeightElement,
    datePrimarySpacingElement: deps.datePrimarySpacingElement,
    dateLunarColorElement: deps.dateLunarColorElement,
    dateLunarSizeElement: deps.dateLunarSizeElement,
    dateLunarWeightElement: deps.dateLunarWeightElement,
    dateLunarSpacingElement: deps.dateLunarSpacingElement,
    dateLineGapElement: deps.dateLineGapElement,
    dateOpacityElement: deps.dateOpacityElement,
    dateLeftElement: deps.dateLeftElement,
    dateTopElement: deps.dateTopElement,
    dateScaleElement: deps.dateScaleElement,
    dateRotationElement: deps.dateRotationElement,
  };
}

export function syncTimeInspector(deps: PopupInspectorsDeps, timeComponent: any) {
  syncTimeInspectorExternal(deps.buildTimeInspectorContext(), timeComponent);
}

export function buildWeatherInspectorContext(deps: PopupInspectorsDeps) {
  return {
    get activeProject() {
      return deps.editorCtx.activeProject;
    },
    runExtraFallback: deps.runExtraFallback,
    weatherTypeElement: deps.weatherTypeElement,
    weatherLabelElement: deps.weatherLabelElement,
    weatherIconVisibleElement: deps.weatherIconVisibleElement,
    weatherTemperatureVisibleElement: deps.weatherTemperatureVisibleElement,
    weatherConditionVisibleElement: deps.weatherConditionVisibleElement,
    weatherHumidityVisibleElement: deps.weatherHumidityVisibleElement,
    weatherIconSizeElement: deps.weatherIconSizeElement,
    weatherIconGapElement: deps.weatherIconGapElement,
    weatherTemperatureColorElement: deps.weatherTemperatureColorElement,
    weatherTemperatureSizeElement: deps.weatherTemperatureSizeElement,
    weatherTemperatureWeightElement: deps.weatherTemperatureWeightElement,
    weatherTemperatureSpacingElement: deps.weatherTemperatureSpacingElement,
    weatherSecondaryColorElement: deps.weatherSecondaryColorElement,
    weatherSecondarySizeElement: deps.weatherSecondarySizeElement,
    weatherSecondaryWeightElement: deps.weatherSecondaryWeightElement,
    weatherSecondarySpacingElement: deps.weatherSecondarySpacingElement,
    weatherLineGapElement: deps.weatherLineGapElement,
    weatherOpacityElement: deps.weatherOpacityElement,
    weatherLeftElement: deps.weatherLeftElement,
    weatherTopElement: deps.weatherTopElement,
    weatherScaleElement: deps.weatherScaleElement,
    weatherRotationElement: deps.weatherRotationElement,
  };
}

export function syncWeatherInspector(deps: PopupInspectorsDeps, weatherComponent: any) {
  syncWeatherInspectorExternal(deps.buildWeatherInspectorContext(), weatherComponent);
}

