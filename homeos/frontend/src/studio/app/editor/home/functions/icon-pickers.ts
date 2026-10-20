/* 图标与工具提示（图标按钮/菜单、提示、剪贴板） */
import type { EditorContext } from "../editor-context";
import { clampNumber as clampNumber2 } from "../../editor-utils";

export interface IconPickersDeps {
  editorCtx: EditorContext;
  airConditionerEntityButtonElement: any;
  airConditionerEntityMenuElement: any;
  cameraEntityButtonElement: any;
  cameraEntityMenuElement: any;
  copyTextToClipboard: any;
  customSelectsBySelectElement: any;
  enhanceEntityCopyButton: any;
  handleOperationError: any;
  hideAssetLargePreview: any;
  ibeAssetButtonElement: any;
  ibeAssetFolderElement: any;
  ibeAssetMenuElement: any;
  ibeEntityButtonElement: any;
  ibeEntityMenuElement: any;
  ibeIconButtonElement: any;
  ibeIconCopyElement: any;
  ibeIconMenuElement: any;
  ibeIconOptionsElement: any;
  iconButtonEntityButtonElement: any;
  iconButtonEntityMenuElement: any;
  iconButtonIconButtonElement: any;
  iconButtonIconCopyElement: any;
  iconButtonIconMenuElement: any;
  iconButtonIconOptionsElement: any;
  iconListStateByElement: any;
  iconTooltipElementValue: any;
  imageAssetButtonElement: any;
  imageAssetFolderSelectElement: any;
  imageAssetMenuElement: any;
  imageEntityButtonElement: any;
  imageEntityMenuElement: any;
  lightStatisticsActionEntityButtonElement: any;
  lightStatisticsActionEntityMenuElement: any;
  lightStatisticsEntityButtonElement: any;
  lightStatisticsEntityMenuElement: any;
  lightStatisticsIconButtonElement: any;
  lightStatisticsIconCopyElement: any;
  lightStatisticsIconMenuElement: any;
  lightStatisticsIconOptionsElement: any;
  lineChartEntityButtonElement: any;
  lineChartEntityMenuElement: any;
  navigationEntityButtonElement: any;
  navigationEntityMenuElement: any;
  navigationIconButtonElement: any;
  navigationIconCopyElement: any;
  navigationIconMenuElement: any;
  navigationIconOptionsElement: any;
  removedComponent: any;
  runDual: any;
  runFallback: any;
  runLeft: any;
  runLimit: any;
  runLower: any;
  runPrimary: any;
  runState: any;
  titleButtonEntityButtonElement: any;
  titleButtonEntityMenuElement: any;
  titleButtonIconButtonElement: any;
  titleButtonIconCopyElement: any;
  titleButtonIconMenuElement: any;
  titleButtonIconOptionsElement: any;
  vacuumMapEntityButtonElement: any;
  vacuumMapEntityMenuElement: any;
  weatherEntityButtonElement: any;
  weatherEntityMenuElement: any;
}

export function closePickerMenu(deps: IconPickersDeps, iconButtonFollowsEntityElement: any, triggerButton: any) {
  ((iconButtonFollowsEntityElement.hidden = true),
    triggerButton.setAttribute("aria-expanded", "false"),
    iconButtonFollowsEntityElement === deps.imageAssetMenuElement &&
      (deps.hideAssetLargePreview(),
      deps.runState(deps.customSelectsBySelectElement.get(deps.imageAssetFolderSelectElement))),
    iconButtonFollowsEntityElement === deps.ibeAssetMenuElement &&
      (deps.hideAssetLargePreview(), deps.runState(deps.customSelectsBySelectElement.get(deps.ibeAssetFolderElement))));
}

export function closeOtherPickerMenus(deps: IconPickersDeps, excludedKind: any = null) {
  if (
    (excludedKind !== "entity" && deps.runPrimary(deps.imageEntityMenuElement, deps.imageEntityButtonElement),
    excludedKind !== "weather-entity" &&
      deps.runPrimary(deps.weatherEntityMenuElement, deps.weatherEntityButtonElement),
    excludedKind !== "line-chart-entity" &&
      deps.runPrimary(deps.lineChartEntityMenuElement, deps.lineChartEntityButtonElement),
    excludedKind !== "ibe-entity" && deps.runPrimary(deps.ibeEntityMenuElement, deps.ibeEntityButtonElement),
    excludedKind !== "icon-button-entity" &&
      deps.runPrimary(deps.iconButtonEntityMenuElement, deps.iconButtonEntityButtonElement),
    excludedKind !== "vacuum-map-entity" &&
      deps.runPrimary(deps.vacuumMapEntityMenuElement, deps.vacuumMapEntityButtonElement),
    excludedKind !== "camera-entity" && deps.runPrimary(deps.cameraEntityMenuElement, deps.cameraEntityButtonElement),
    excludedKind !== "air-conditioner-entity" &&
      deps.runPrimary(deps.airConditionerEntityMenuElement, deps.airConditionerEntityButtonElement),
    excludedKind !== "title-button-entity" &&
      deps.runPrimary(deps.titleButtonEntityMenuElement, deps.titleButtonEntityButtonElement),
    excludedKind !== "light-statistics-entity")
  ) {
    const isIconButtonFollowsEntity = !deps.lightStatisticsEntityMenuElement.hidden;
    (deps.runPrimary(deps.lightStatisticsEntityMenuElement, deps.lightStatisticsEntityButtonElement),
      isIconButtonFollowsEntity && deps.runLimit());
  }
  (excludedKind !== "light-statistics-action-entity" &&
    deps.runPrimary(deps.lightStatisticsActionEntityMenuElement, deps.lightStatisticsActionEntityButtonElement),
    excludedKind !== "navigation-entity" &&
      deps.runPrimary(deps.navigationEntityMenuElement, deps.navigationEntityButtonElement),
    excludedKind !== "asset" && deps.runPrimary(deps.imageAssetMenuElement, deps.imageAssetButtonElement),
    excludedKind !== "ibe-asset" && deps.runPrimary(deps.ibeAssetMenuElement, deps.ibeAssetButtonElement),
    excludedKind !== "ibe-icon" && deps.runPrimary(deps.ibeIconMenuElement, deps.ibeIconButtonElement),
    excludedKind !== "icon-button-icon" &&
      deps.runPrimary(deps.iconButtonIconMenuElement, deps.iconButtonIconButtonElement),
    excludedKind !== "title-button-icon" &&
      deps.runPrimary(deps.titleButtonIconMenuElement, deps.titleButtonIconButtonElement),
    excludedKind !== "light-statistics-icon" &&
      deps.runPrimary(deps.lightStatisticsIconMenuElement, deps.lightStatisticsIconButtonElement),
    excludedKind !== "navigation-icon" &&
      deps.runPrimary(deps.navigationIconMenuElement, deps.navigationIconButtonElement));
}

export function resolveMdiIconUrl(deps: IconPickersDeps, iconName: any) {
  const replace = String(iconName || "")
    .trim()
    .replace(/^mdi:/, "");
  return /^[a-z0-9-]+$/.test(replace)
    ? "/static/vendor/mdi/7.4.47/svg/" + replace + ".svg"
    : "";
}

export function renderNavigationIconButton(deps: IconPickersDeps, iconName: any) {
  const iconButtonIconPreviewElement = String(iconName || ""),
    iconButtonIconLabelElement = deps.navigationIconButtonElement.querySelector("i"),
    iconButtonIconUrl = deps.navigationIconButtonElement.querySelector("span"),
    zi2 = deps.runDual(iconButtonIconPreviewElement);
  ((iconButtonIconLabelElement.hidden = !zi2),
    (iconButtonIconLabelElement.style.maskImage = zi2 ? 'url("' + zi2 + '")' : ""),
    (iconButtonIconLabelElement.style.webkitMaskImage = zi2 ? 'url("' + zi2 + '")' : ""),
    (iconButtonIconUrl.textContent = iconButtonIconPreviewElement || "不使用图标"),
    (deps.navigationIconCopyElement.disabled = !iconButtonIconPreviewElement),
    (deps.navigationIconCopyElement.title = iconButtonIconPreviewElement
      ? "复制 " + iconButtonIconPreviewElement
      : "当前未使用图标"));
}

export function renderTitleButtonIconPreview(deps: IconPickersDeps, titleButtonIconName: any) {
  const effectIconValueValue = String(titleButtonIconName || ""),
    effectIconPreviewElementBar = deps.ibeIconButtonElement.querySelector("i"),
    titleButtonIconValue = deps.ibeIconButtonElement.querySelector("span"),
    zi3 = deps.runDual(effectIconValueValue);
  ((effectIconPreviewElementBar.hidden = !zi3),
    (effectIconPreviewElementBar.style.maskImage = zi3 ? 'url("' + zi3 + '")' : ""),
    (effectIconPreviewElementBar.style.webkitMaskImage = zi3 ? 'url("' + zi3 + '")' : ""),
    (titleButtonIconValue.textContent = effectIconValueValue || "不使用图标"),
    (deps.ibeIconCopyElement.disabled = !effectIconValueValue),
    (deps.ibeIconCopyElement.title = effectIconValueValue
      ? "复制 " + effectIconValueValue
      : "当前未使用图标"));
}

export function renderEntityIconButtonPreview(deps: IconPickersDeps, iconName: any) {
  const titleIconPreviewElement = String(iconName || ""),
    includes = ["device-button", "presence-sensor"].includes(deps.removedComponent()?.type),
    titleIconLabelElement = deps.iconButtonIconButtonElement.querySelector("i"),
    titleIconUrl = deps.iconButtonIconButtonElement.querySelector("span"),
    zi4 = deps.runDual(titleIconPreviewElement);
  ((titleIconLabelElement.hidden = !zi4),
    (titleIconLabelElement.style.maskImage = zi4 ? 'url("' + zi4 + '")' : ""),
    (titleIconLabelElement.style.webkitMaskImage = zi4 ? 'url("' + zi4 + '")' : ""),
    (titleIconUrl.textContent =
      titleIconPreviewElement || (includes ? "跟随实体图标" : "不使用图标")),
    (deps.iconButtonIconCopyElement.disabled = !titleIconPreviewElement),
    (deps.iconButtonIconCopyElement.title = titleIconPreviewElement
      ? "复制 " + titleIconPreviewElement
      : "当前未使用图标"));
}

export function renderLightStatisticsIconPreview(deps: IconPickersDeps, iconName: any) {
  const titleButtonIconValueState = String(iconName || ""),
    titleIconPreviewElementElement = deps.titleButtonIconButtonElement.querySelector("i"),
    statisticsIconValue = deps.titleButtonIconButtonElement.querySelector("span"),
    zi5 = deps.runDual(titleButtonIconValueState);
  ((titleIconPreviewElementElement.hidden = !zi5),
    (titleIconPreviewElementElement.style.maskImage = zi5 ? 'url("' + zi5 + '")' : ""),
    (titleIconPreviewElementElement.style.webkitMaskImage = zi5 ? 'url("' + zi5 + '")' : ""),
    (statisticsIconValue.textContent = titleButtonIconValueState || "不使用图标"),
    (deps.titleButtonIconCopyElement.disabled = !titleButtonIconValueState),
    (deps.titleButtonIconCopyElement.title = titleButtonIconValueState
      ? "复制 " + titleButtonIconValueState
      : "当前未使用图标"));
}

export function renderLightStatisticsButtonIcon(deps: IconPickersDeps, iconName: any) {
  const statisticsIconPreviewElement = String(iconName ?? "mdi:lightbulb-group-outline"),
    statisticsIconLabelElement = deps.lightStatisticsIconButtonElement.querySelector("i"),
    statisticsIconUrl = deps.lightStatisticsIconButtonElement.querySelector("span"),
    zi6 = deps.runDual(statisticsIconPreviewElement);
  ((statisticsIconLabelElement.hidden = !zi6),
    (statisticsIconLabelElement.style.maskImage = zi6 ? 'url("' + zi6 + '")' : ""),
    (statisticsIconLabelElement.style.webkitMaskImage = zi6 ? 'url("' + zi6 + '")' : ""),
    (statisticsIconUrl.textContent = statisticsIconPreviewElement || "不使用图标"),
    (deps.lightStatisticsIconCopyElement.disabled = !statisticsIconPreviewElement),
    (deps.lightStatisticsIconCopyElement.title = statisticsIconPreviewElement
      ? "复制 " + statisticsIconPreviewElement
      : "当前未使用图标"));
}

export async function copyTextToClipboard(deps: IconPickersDeps, clipboardText: any) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(clipboardText);
    return;
  }
  const clipboardTextAreaElement = document.createElement("textarea");
  ((clipboardTextAreaElement.value = clipboardText),
    clipboardTextAreaElement.setAttribute("readonly", ""),
    (clipboardTextAreaElement.style.position = "fixed"),
    (clipboardTextAreaElement.style.opacity = "0"),
    document.body.append(clipboardTextAreaElement),
    clipboardTextAreaElement.select());
  const execCommand = document.execCommand("copy");
  if ((clipboardTextAreaElement.remove(), !execCommand)) throw new Error("复制失败。");
}

export function enhanceEntityCopyButton(deps: IconPickersDeps, 
  copyButtonHostElement: any,
  entityIdGetter = () => copyButtonHostElement.dataset.entityId || "",
) {
  if (!copyButtonHostElement || copyButtonHostElement.dataset.entityCopyReady === "true")
    return copyButtonHostElement._entityCopySync;
  deps.runFallback(copyButtonHostElement);
  const entityCopyRowElement = document.createElement("div");
  entityCopyRowElement.className = "entity-picker-field-row";
  const entityCopyButtonElement = document.createElement("button");
  ((entityCopyButtonElement.type = "button"),
    (entityCopyButtonElement.className = "navigation-icon-copy entity-picker-copy"),
    (entityCopyButtonElement.title = "复制实体 ID"),
    entityCopyButtonElement.setAttribute("aria-label", "复制实体 ID"),
    (entityCopyButtonElement.disabled = true),
    (entityCopyButtonElement.innerHTML =
      '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8" height="8" rx="1.3"></rect><path d="M10.5 5V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9A1.5 1.5 0 0 0 3.5 10.5H5"></path></svg><span aria-hidden="true">✓</span>'));
  const syncEntityCopyButton = () => {
    const currentEntityId = String(entityIdGetter() || "");
    ((entityCopyButtonElement.dataset.entityId = currentEntityId),
      (entityCopyButtonElement.disabled = !currentEntityId),
      (entityCopyButtonElement.title = currentEntityId
        ? "复制 " + currentEntityId
        : "当前未选择实体"));
  };
  return (
    entityCopyButtonElement.addEventListener("click", async (entityCopyClickEvent) => {
      (entityCopyClickEvent.preventDefault(), entityCopyClickEvent.stopPropagation());
      const clickedEntityId = entityCopyButtonElement.dataset.entityId || "";
      if (clickedEntityId)
        try {
          (await deps.copyTextToClipboard(clickedEntityId),
            entityCopyButtonElement.classList.add("copied"),
            window.setTimeout(() => entityCopyButtonElement.classList.remove("copied"), 1000));
        } catch (entityCopyError: any) {
          deps.handleOperationError(entityCopyError);
        }
    }),
    copyButtonHostElement.replaceWith(entityCopyRowElement),
    entityCopyRowElement.append(copyButtonHostElement, entityCopyButtonElement),
    (copyButtonHostElement.dataset.entityCopyReady = "true"),
    (copyButtonHostElement._entityCopySync = syncEntityCopyButton),
    syncEntityCopyButton(),
    syncEntityCopyButton
  );
}

export function enhanceEntityCopyButtons(deps: IconPickersDeps) {
  for (const entityButtonId of [
    "image-entity-button",
    "ibe-entity-button",
    "icon-button-entity-button",
    "air-conditioner-entity-button",
    "vacuum-map-entity-button",
    "camera-entity-button",
    "weather-entity-button",
    "line-chart-entity-button",
    "navigation-entity-button",
    "popup-module-entity-button",
  ]) {
    const elementById = document.getElementById(entityButtonId);
    elementById && deps.enhanceEntityCopyButton(elementById);
  }
}

export function ensureIconListPaginationState(deps: IconPickersDeps, element: any) {
  let iconTooltipElementState = deps.iconListStateByElement.get(element);
  return (
    iconTooltipElementState ||
      ((iconTooltipElementState = {
        query: "",
        offset: 0,
        total: 0,
        loading: false,
        complete: false,
        generation: 0,
      }),
      deps.iconListStateByElement.set(element, iconTooltipElementState)),
    iconTooltipElementState
  );
}

export function hideIconNameTooltip(deps: IconPickersDeps) {
  (deps.editorCtx.iconTooltipElement?.remove(), (deps.editorCtx.iconTooltipElement = null));
}

export function showIconNameTooltip(deps: IconPickersDeps, iconTooltipElementElement: any, tooltipLabel: any) {
  deps.runLower();
  const iconTooltipElementPanel = iconTooltipElementElement.closest("dialog");
  if (!iconTooltipElementPanel?.open || !tooltipLabel) return;
  const iconTooltipElementSection = document.createElement("div");
  ((iconTooltipElementSection.className = "editor-icon-name-tooltip"),
    (iconTooltipElementSection.textContent = tooltipLabel),
    iconTooltipElementPanel.append(iconTooltipElementSection));
  const targetBounds = iconTooltipElementElement.getBoundingClientRect(),
    targetBoundsState = iconTooltipElementSection.getBoundingClientRect(),
    clampedUpper = Math.min(
      window.innerWidth - targetBoundsState.width - 8,
      Math.max(8, targetBounds.left + (targetBounds.width - targetBoundsState.width) / 2),
    );
  let measuredBounds = targetBounds.top - targetBoundsState.height - 8;
  (measuredBounds < 8 && (measuredBounds = targetBounds.bottom + 8),
    (iconTooltipElementSection.style.left = clampedUpper + "px"),
    (iconTooltipElementSection.style.top = measuredBounds + "px"),
    (deps.editorCtx.iconTooltipElement = iconTooltipElementSection));
}

export function bindIconNameTooltipEvents(deps: IconPickersDeps, hostElement: any, tooltipLabel: any) {
  (hostElement.addEventListener("pointerenter", () => deps.runLeft(hostElement, tooltipLabel)),
    hostElement.addEventListener("pointerleave", deps.runLower),
    hostElement.addEventListener("focus", () => deps.runLeft(hostElement, tooltipLabel)),
    hostElement.addEventListener("blur", deps.runLower));
}

export function bindIconListInfiniteScroll(deps: IconPickersDeps, iconTooltipElementList: any, loadMore: any) {
  iconTooltipElementList.addEventListener("scroll", () => {
    iconTooltipElementList.scrollHeight -
      iconTooltipElementList.scrollTop -
      iconTooltipElementList.clientHeight >
      120 || loadMore().catch(deps.handleOperationError);
  });
}

export async function iconTooltipElementCount(deps: IconPickersDeps, 
  iconTooltipElementIndex = "",
  { append: iconTooltipElementTotal = false } = {},
) {
  return deps.iconTooltipElementValue({
    optionsElement: deps.navigationIconOptionsElement,
    query: iconTooltipElementIndex,
    currentIcon: deps.removedComponent()?.properties?.icon || "",
    append: iconTooltipElementTotal,
  });
}

export async function iconTooltipElementFlag(deps: IconPickersDeps, 
  iconTooltipElementSlot = "",
  { append: iconTooltipElementCase = false } = {},
) {
  return deps.iconTooltipElementValue({
    optionsElement: deps.ibeIconOptionsElement,
    query: iconTooltipElementSlot,
    currentIcon: deps.removedComponent()?.properties?.icon || "",
    append: iconTooltipElementCase,
  });
}

export async function iconTooltipElementStep(deps: IconPickersDeps, 
  iconTooltipElementPhase = "",
  { append: iconTooltipElementView = false } = {},
) {
  const createdInstanceValue = deps.removedComponent();
  return deps.iconTooltipElementValue({
    optionsElement: deps.iconButtonIconOptionsElement,
    query: iconTooltipElementPhase,
    currentIcon: createdInstanceValue?.properties?.icon || "",
    clearLabel: createdInstanceValue?.type === "device-button" ? "跟随实体图标" : "不使用图标",
    append: iconTooltipElementView,
  });
}

export async function iconTooltipElementStore(deps: IconPickersDeps, 
  iconTooltipElementCache = "",
  { append: iconTooltipElementQueue = false } = {},
) {
  return deps.iconTooltipElementValue({
    optionsElement: deps.titleButtonIconOptionsElement,
    query: iconTooltipElementCache,
    currentIcon: deps.removedComponent()?.properties?.icon || "",
    append: iconTooltipElementQueue,
  });
}

export async function iconTooltipElementBuffer(deps: IconPickersDeps, 
  iconTooltipElementCursor = "",
  { append: iconTooltipElementPointer = false } = {},
) {
  const availableProperties = deps.removedComponent()?.properties || {},
    iconTooltipElementTarget = String(
      Object.hasOwn(availableProperties, "icon")
        ? availableProperties.icon || ""
        : "mdi:lightbulb-group-outline",
    );
  return deps.iconTooltipElementValue({
    optionsElement: deps.lightStatisticsIconOptionsElement,
    query: iconTooltipElementCursor,
    currentIcon: iconTooltipElementTarget,
    datasetKey: "lightStatisticsIconName",
    append: iconTooltipElementPointer,
  });
}

export function positionNavigationIconMenu(deps: IconPickersDeps) {
  if (deps.navigationIconMenuElement.hidden) return;
  const parentBounds = deps.navigationIconButtonElement.parentElement.getBoundingClientRect(),
    iconTooltipMarginPx = 5,
    iconTooltipGapPx = 8,
    availableSize =
      window.innerHeight - parentBounds.bottom - iconTooltipMarginPx - iconTooltipGapPx,
    measuredBoundsState = parentBounds.top - iconTooltipMarginPx - iconTooltipGapPx,
    iconTooltipElementSource = availableSize >= 250 || availableSize >= measuredBoundsState,
    clampedLower = Math.max(
      150,
      Math.min(390, iconTooltipElementSource ? availableSize : measuredBoundsState),
    );
  ((deps.navigationIconMenuElement.style.left =
    clampNumber2(
      parentBounds.left,
      iconTooltipGapPx,
      Math.max(
        iconTooltipGapPx,
        window.innerWidth - parentBounds.width - iconTooltipGapPx,
      ),
    ) + "px"),
    (deps.navigationIconMenuElement.style.top = iconTooltipElementSource
      ? parentBounds.bottom + iconTooltipMarginPx + "px"
      : Math.max(iconTooltipGapPx, parentBounds.top - clampedLower - iconTooltipMarginPx) + "px"),
    (deps.navigationIconMenuElement.style.width = parentBounds.width + "px"),
    (deps.navigationIconMenuElement.style.maxHeight = clampedLower + "px"),
    (deps.navigationIconOptionsElement.style.maxHeight = Math.max(90, clampedLower - 57) + "px"));
}

export function positionIbeIconMenu(deps: IconPickersDeps) {
  if (deps.ibeIconMenuElement.hidden) return;
  const parentBoundsState = deps.ibeIconButtonElement.parentElement.getBoundingClientRect(),
    iconTooltipStateValue = 5,
    iconTooltipStateConfig = 8,
    availableSizeState =
      window.innerHeight -
      parentBoundsState.bottom -
      iconTooltipStateValue -
      iconTooltipStateConfig,
    measuredBoundsValue = parentBoundsState.top - iconTooltipStateValue - iconTooltipStateConfig,
    iconTooltipElementOrigin =
      availableSizeState >= 250 || availableSizeState >= measuredBoundsValue,
    clampedLowerState = Math.max(
      150,
      Math.min(390, iconTooltipElementOrigin ? availableSizeState : measuredBoundsValue),
    );
  ((deps.ibeIconMenuElement.style.left =
    clampNumber2(
      parentBoundsState.left,
      iconTooltipStateConfig,
      Math.max(
        iconTooltipStateConfig,
        window.innerWidth - parentBoundsState.width - iconTooltipStateConfig,
      ),
    ) + "px"),
    (deps.ibeIconMenuElement.style.top = iconTooltipElementOrigin
      ? parentBoundsState.bottom + iconTooltipStateValue + "px"
      : Math.max(
          iconTooltipStateConfig,
          parentBoundsState.top - clampedLowerState - iconTooltipStateValue,
        ) + "px"),
    (deps.ibeIconMenuElement.style.width = parentBoundsState.width + "px"),
    (deps.ibeIconMenuElement.style.maxHeight = clampedLowerState + "px"),
    (deps.ibeIconOptionsElement.style.maxHeight = Math.max(90, clampedLowerState - 57) + "px"));
}

export function positionIconButtonIconMenu(deps: IconPickersDeps) {
  if (deps.iconButtonIconMenuElement.hidden) return;
  const parentBoundsValue = deps.iconButtonIconButtonElement.parentElement.getBoundingClientRect(),
    iconTooltipStateRef = 5,
    iconTooltipStateEntry = 8,
    availableSizeValue =
      window.innerHeight - parentBoundsValue.bottom - iconTooltipStateRef - iconTooltipStateEntry,
    measuredBoundsConfig = parentBoundsValue.top - iconTooltipStateRef - iconTooltipStateEntry,
    iconTooltipElementDraft =
      availableSizeValue >= 250 || availableSizeValue >= measuredBoundsConfig,
    clampedLowerValue = Math.max(
      150,
      Math.min(390, iconTooltipElementDraft ? availableSizeValue : measuredBoundsConfig),
    );
  ((deps.iconButtonIconMenuElement.style.left =
    clampNumber2(
      parentBoundsValue.left,
      iconTooltipStateEntry,
      Math.max(
        iconTooltipStateEntry,
        window.innerWidth - parentBoundsValue.width - iconTooltipStateEntry,
      ),
    ) + "px"),
    (deps.iconButtonIconMenuElement.style.top = iconTooltipElementDraft
      ? parentBoundsValue.bottom + iconTooltipStateRef + "px"
      : Math.max(
          iconTooltipStateEntry,
          parentBoundsValue.top - clampedLowerValue - iconTooltipStateRef,
        ) + "px"),
    (deps.iconButtonIconMenuElement.style.width = parentBoundsValue.width + "px"),
    (deps.iconButtonIconMenuElement.style.maxHeight = clampedLowerValue + "px"),
    (deps.iconButtonIconOptionsElement.style.maxHeight = Math.max(90, clampedLowerValue - 57) + "px"));
}

export function layoutTitleButtonIconMenu(deps: IconPickersDeps) {
  if (deps.titleButtonIconMenuElement.hidden) return;
  const parentBoundsConfig = deps.titleButtonIconButtonElement.parentElement.getBoundingClientRect(),
    relatedPopupMarginPx = 5,
    relatedPopupGapPx = 8,
    availableSizeConfig =
      window.innerHeight - parentBoundsConfig.bottom - relatedPopupMarginPx - relatedPopupGapPx,
    measuredBoundsRef = parentBoundsConfig.top - relatedPopupMarginPx - relatedPopupGapPx,
    relatedPopupElementState =
      availableSizeConfig >= 250 || availableSizeConfig >= measuredBoundsRef,
    clampedLowerConfig = Math.max(
      150,
      Math.min(390, relatedPopupElementState ? availableSizeConfig : measuredBoundsRef),
    );
  ((deps.titleButtonIconMenuElement.style.left =
    clampNumber2(
      parentBoundsConfig.left,
      relatedPopupGapPx,
      Math.max(
        relatedPopupGapPx,
        window.innerWidth - parentBoundsConfig.width - relatedPopupGapPx,
      ),
    ) + "px"),
    (deps.titleButtonIconMenuElement.style.top = relatedPopupElementState
      ? parentBoundsConfig.bottom + relatedPopupMarginPx + "px"
      : Math.max(
          relatedPopupGapPx,
          parentBoundsConfig.top - clampedLowerConfig - relatedPopupMarginPx,
        ) + "px"),
    (deps.titleButtonIconMenuElement.style.width = parentBoundsConfig.width + "px"),
    (deps.titleButtonIconMenuElement.style.maxHeight = clampedLowerConfig + "px"),
    (deps.titleButtonIconOptionsElement.style.maxHeight = Math.max(90, clampedLowerConfig - 57) + "px"));
}

