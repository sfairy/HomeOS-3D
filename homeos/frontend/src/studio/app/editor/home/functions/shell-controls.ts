/* 编辑器壳层与弹层控制（视口、下拉、实体/颜色选择器、错误提示） */
import type { EditorContext } from "../editor-context";
import { syncIconButtonInspector as syncIconButtonInspectorExternal } from "../../inspectors/home/home-icon-button-inspector";
import { syncNavigationInspector as syncNavigationInspectorExternal } from "../../inspectors/home/home-navigation-inspector";
import { syncLineChartInspector as syncLineChartInspectorExternal } from "../../inspectors/home/home-line-chart-inspector";
import { syncAirConditionerInspector as syncAirConditionerInspectorExternal } from "../../inspectors/home/home-air-conditioner-inspector";
import { requestJson as requestJsonCore } from "../../net/request-json";
import { formatLastSeen as formatLastSeenCore } from "../../controls/number-stepper";
import { normalizedHexColor as normalizedHexColor2, rgbToHsv as rgbToHsv2, hsvToRgb255 as hsvToRgb2, rgbToHex as rgbToHex2, clampNumber as clampNumber2 } from "../../editor-utils";
import { hexToRgbOrBlack as hexToRgb2 } from "@/shared/utils/ui/color.util";

export interface ShellControlsDeps {
  editorCtx: EditorContext;
  COMPONENT_DIALOG_DESIGN_HEIGHT: any;
  COMPONENT_DIALOG_DESIGN_WIDTH: any;
  COMPONENT_DIALOG_SCALE_MULTIPLIER: any;
  EDITOR_DESIGN_WIDTH: any;
  airConditionerInspectorContext: any;
  buttonSoundController: any;
  closeDropdownMenu: any;
  colorPickerBoundInputById: any;
  coverKindDraftDocument: any;
  displayDeviceCountElement: any;
  editorCanvasElement: any;
  editorHeaderElement: any;
  editorShellElement: any;
  errorDialogCloseButtonElement: any;
  errorDialogMessageElement: any;
  errorPhase: any;
  globalColorPickerBlueInputElement: any;
  globalColorPickerElement: any;
  globalColorPickerGreenInputElement: any;
  globalColorPickerHexTextInputElement: any;
  globalColorPickerHueRangeInputElement: any;
  globalColorPickerMarkerElement: any;
  globalColorPickerRedInputElement: any;
  globalColorPickerSwatchElement: any;
  iconButtonInspectorContext: any;
  lineChartInspectorContext: any;
  navigationInspectorContext: any;
  numberStepperDeps: any;
  openEntityPicker: any;
  pageActionsButtonElement: any;
  pageActionsMenuElement: any;
  pageNewElement: any;
  popupActionsButtonElement: any;
  popupActionsMenuElement: any;
  popupNewElement: any;
  positionTitleButtonIconMenu: any;
  projectActionsButtonElement: any;
  projectActionsMenuElement: any;
  refreshSoundToggle: any;
  renderWorkspaceResolution: any;
  requestJsonDeps: any;
  runEntry: any;
  setWorkspaceHasProject: any;
  soundToggleButtonElement: any;
  unbindDisplayDeviceError: any;
  value: any;
}

export function refreshEditorViewportFit(deps: ShellControlsDeps) {
  document.documentElement.classList.remove("editor-viewport-fit");
  document.documentElement.style.removeProperty("--editor-layout-height");
  document.documentElement.style.setProperty("--editor-viewport-scale", "1");
  void deps.EDITOR_DESIGN_WIDTH;
  void deps.editorHeaderElement;
  void deps.editorShellElement;
}

export function refreshComponentDialogScale(deps: ShellControlsDeps) {
  const componentDialogElement = document.getElementById(
    "component-template-dialog",
  ) as HTMLDialogElement | null;
  if (!componentDialogElement?.open || window.innerWidth <= 1180) return;
  const designedScale =
      deps.COMPONENT_DIALOG_SCALE_MULTIPLIER *
      Math.min(
        window.innerWidth / deps.COMPONENT_DIALOG_DESIGN_WIDTH,
        window.innerHeight / deps.COMPONENT_DIALOG_DESIGN_HEIGHT,
      ),
    componentDialogScale = Math.min(
      designedScale,
      (window.innerWidth * 0.9) / componentDialogElement.offsetWidth,
      (window.innerHeight * 0.9) / componentDialogElement.offsetHeight,
    );
  document.documentElement.style.setProperty(
    "--component-template-dialog-scale",
    String(componentDialogScale),
  );
}

export function refreshSoundToggle(deps: ShellControlsDeps) {
  if (!deps.soundToggleButtonElement) return;
  const isEditMode = deps.editorCtx.editorMode === "edit";
  ((deps.soundToggleButtonElement.hidden = !isEditMode),
    (deps.soundToggleButtonElement.disabled = !deps.editorCtx.activeProject),
    deps.editorCtx.activeProject &&
      typeof deps.editorCtx.activeProject.document?.soundEnabled == "boolean" &&
      deps.buttonSoundController.isEnabled() !== deps.editorCtx.activeProject.document.soundEnabled &&
      deps.buttonSoundController.setEnabled(deps.editorCtx.activeProject.document.soundEnabled),
    deps.soundToggleButtonElement.setAttribute(
      "aria-pressed",
      String(deps.buttonSoundController.isEnabled()),
    ),
    (deps.soundToggleButtonElement.title = deps.buttonSoundController.isEnabled()
      ? "关闭仪表盘音效"
      : "开启仪表盘音效"),
    deps.soundToggleButtonElement.setAttribute("aria-label", deps.soundToggleButtonElement.title),
    deps.soundToggleButtonElement.classList.toggle("is-muted", !deps.buttonSoundController.isEnabled()));
}

export function syncIconButtonInspector(deps: ShellControlsDeps, iconButtonComponent: any) {
  syncIconButtonInspectorExternal(deps.iconButtonInspectorContext, iconButtonComponent);
}

export function syncNavigationInspector(deps: ShellControlsDeps, navigationComponent: any) {
  syncNavigationInspectorExternal(deps.navigationInspectorContext, navigationComponent);
}

export function syncLineChartInspector(deps: ShellControlsDeps, lineChartComponent: any) {
  syncLineChartInspectorExternal(deps.lineChartInspectorContext, lineChartComponent);
}

export function syncAirConditionerInspector(deps: ShellControlsDeps, airConditionerComponent: any) {
  syncAirConditionerInspectorExternal(deps.airConditionerInspectorContext, airConditionerComponent);
}

export function requestJson(deps: ShellControlsDeps, requestPath: any, requestOptions: Record<string, any> = {}) {
  return requestJsonCore(deps.requestJsonDeps(), requestPath, requestOptions);
}

export function formatLastSeen(deps: ShellControlsDeps, lastSeenTimestamp: Document | HTMLElement = document) {
  return formatLastSeenCore(deps.numberStepperDeps(), lastSeenTimestamp);
}

export function setSettingsMessage(deps: ShellControlsDeps, messageElement: any, messageText: any, toneClass = "") {
  ((messageElement.hidden = !messageText),
    (messageElement.textContent = messageText),
    (messageElement.className = ("settings-message " + toneClass).trim()));
}

export function handleOperationError(deps: ShellControlsDeps, operationError: any) {
  (window.HomeOSLog?.error!(operationError, {
    projectId: deps.editorCtx.activeProject?.projectId || "",
    componentId: deps.editorCtx.selectedComponentId || "",
    phase: "editor-operation",
  }),
    (deps.errorDialogMessageElement.textContent = operationError?.message || "操作失败。"),
    deps.errorDialogCloseButtonElement.open || deps.errorDialogCloseButtonElement.showModal());
}

export function errorPhase(deps: ShellControlsDeps) {
  ((deps.projectActionsMenuElement.hidden = true),
    deps.projectActionsButtonElement.setAttribute("aria-expanded", "false"));
}

export function value(deps: ShellControlsDeps) {
  ((deps.pageActionsMenuElement.hidden = true),
    deps.pageActionsButtonElement.setAttribute("aria-expanded", "false"));
}

export function hidePopupActionsMenu(deps: ShellControlsDeps) {
  ((deps.popupActionsMenuElement.hidden = true),
    deps.popupActionsButtonElement.setAttribute("aria-expanded", "false"),
    (deps.editorCtx.moduleDialogPopupId = null));
}

export function closeCustomSelect(deps: ShellControlsDeps, selectState = deps.editorCtx.openCustomSelect) {
  selectState &&
    ((selectState.menu.hidden = true),
    selectState.button.setAttribute("aria-expanded", "false"),
    deps.editorCtx.openCustomSelect === selectState && (deps.editorCtx.openCustomSelect = null));
}

export function positionCustomSelectMenu(deps: ShellControlsDeps, selectState: any) {
  if (selectState.menu.hidden) return;
  const boundingClientRect = selectState.button.getBoundingClientRect(),
    hoverScrollStateByRow = Math.max(80, Math.min(320, window.innerHeight - 16));
  ((selectState.menu.style.width = boundingClientRect.width + "px"),
    (selectState.menu.style.maxHeight = hoverScrollStateByRow + "px"));
  const iconVisibilityVirtualEntities = Math.min(selectState.menu.scrollHeight, hoverScrollStateByRow),
    loadIconButtonEffectIconOptions = Math.max(
      8,
      Math.min(window.innerWidth - boundingClientRect.width - 8, boundingClientRect.left),
    ),
    loadIconButtonIconOptions = boundingClientRect.bottom + 4,
    loadLightStatisticsIconOptions =
      loadIconButtonIconOptions + iconVisibilityVirtualEntities <= window.innerHeight - 8
        ? loadIconButtonIconOptions
        : Math.max(8, boundingClientRect.top - iconVisibilityVirtualEntities - 4);
  ((selectState.menu.style.left = loadIconButtonEffectIconOptions + "px"),
    (selectState.menu.style.top = loadLightStatisticsIconOptions + "px"));
}

export function selectableEntities(deps: ShellControlsDeps, setLightStatisticsMessage: Document | HTMLElement = document) {
  (setLightStatisticsMessage instanceof HTMLSelectElement &&
    deps.positionTitleButtonIconMenu(setLightStatisticsMessage),
    setLightStatisticsMessage
      .querySelectorAll?.("select")
      .forEach((setPickerButtonLabel) => deps.positionTitleButtonIconMenu(setPickerButtonLabel)));
}

export function openEntityPicker(deps: ShellControlsDeps, openIconPicker: any, openLightStatisticsEntityPicker = false) {
  const closeColorPicker = normalizedHexColor2(openIconPicker);
  if (!closeColorPicker || !deps.editorCtx.activeColorInputElement) return;
  const commitColorPickerFromRgb = hexToRgb2(closeColorPicker),
    commitColorPickerHsv = rgbToHsv2(commitColorPickerFromRgb);
  ((deps.editorCtx.colorPickerHue = commitColorPickerHsv.s > 0 ? commitColorPickerHsv.h : deps.editorCtx.colorPickerHue),
    (deps.editorCtx.colorPickerSaturation = commitColorPickerHsv.s),
    (deps.editorCtx.colorPickerBrightness = commitColorPickerHsv.v),
    deps.globalColorPickerElement.style.setProperty(
      "--picker-hue",
      "hsl(" + deps.editorCtx.colorPickerHue + " 100% 50%)",
    ),
    deps.globalColorPickerElement.style.setProperty("--picker-color", closeColorPicker),
    (deps.globalColorPickerMarkerElement.style.left = deps.editorCtx.colorPickerSaturation * 100 + "%"),
    (deps.globalColorPickerMarkerElement.style.top = (1 - deps.editorCtx.colorPickerBrightness) * 100 + "%"),
    (deps.globalColorPickerHueRangeInputElement.value = String(Math.round(deps.editorCtx.colorPickerHue))),
    document.activeElement !== deps.globalColorPickerHexTextInputElement &&
      (deps.globalColorPickerHexTextInputElement.value = closeColorPicker.toUpperCase()),
    (deps.globalColorPickerRedInputElement.value = String(Math.round(commitColorPickerFromRgb.r))),
    (deps.globalColorPickerGreenInputElement.value = String(Math.round(commitColorPickerFromRgb.g))),
    (deps.globalColorPickerBlueInputElement.value = String(Math.round(commitColorPickerFromRgb.b))),
    (deps.globalColorPickerSwatchElement.style.background = closeColorPicker),
    deps.editorCtx.activeColorInputElement.value !== closeColorPicker &&
      ((deps.editorCtx.activeColorInputElement.value = closeColorPicker),
      openLightStatisticsEntityPicker &&
        deps.editorCtx.activeColorInputElement.dispatchEvent(
          new Event("input", {
            bubbles: true,
          }),
        )));
}

export function closeAllDropdownMenus(deps: ShellControlsDeps) {
  const enhanceColorInputsIn = hsvToRgb2(
    deps.editorCtx.colorPickerHue,
    deps.editorCtx.colorPickerSaturation,
    deps.editorCtx.colorPickerBrightness,
  );
  deps.openEntityPicker(
    rgbToHex2(enhanceColorInputsIn.r, enhanceColorInputsIn.g, enhanceColorInputsIn.b),
    true,
  );
}

export function closeDropdownMenu(deps: ShellControlsDeps) {
  if (deps.globalColorPickerElement.hidden || !deps.editorCtx.activeColorInputElement) return;
  const positionColorPicker = deps.editorCtx.activeColorInputElement.getBoundingClientRect(),
    syncColorPickerFromHex = deps.globalColorPickerElement.getBoundingClientRect(),
    num = 9,
    viewportRightMarginPx = 8,
    enhanceNativeSelectsIn = positionColorPicker.left - syncColorPickerFromHex.width - num,
    enhanceNumberInputsIn =
      enhanceNativeSelectsIn >= viewportRightMarginPx
        ? enhanceNativeSelectsIn
        : Math.min(
            window.innerWidth - syncColorPickerFromHex.width - viewportRightMarginPx,
            positionColorPicker.right + num,
          ),
    syncOpenColorPicker = clampNumber2(
      positionColorPicker.top,
      viewportRightMarginPx,
      Math.max(
        viewportRightMarginPx,
        window.innerHeight - syncColorPickerFromHex.height - viewportRightMarginPx,
      ),
    );
  ((deps.globalColorPickerElement.style.left =
    Math.max(viewportRightMarginPx, enhanceNumberInputsIn) + "px"),
    (deps.globalColorPickerElement.style.top = syncOpenColorPicker + "px"));
}

export function openColorPickerForInput(deps: ShellControlsDeps, commitColorPickerFromRgbElement: any) {
  if (!commitColorPickerFromRgbElement || commitColorPickerFromRgbElement.disabled) return;
  (deps.editorCtx.activeColorInputElement &&
    deps.editorCtx.activeColorInputElement !== commitColorPickerFromRgbElement &&
    deps.setWorkspaceHasProject(),
    (deps.editorCtx.activeColorInputElement = commitColorPickerFromRgbElement),
    (deps.editorCtx.activeColorHex = normalizedHexColor2(commitColorPickerFromRgbElement.value) || "#000000"));
  const updateColorPickerFromPointer = rgbToHsv2(hexToRgb2(deps.editorCtx.activeColorHex));
  ((deps.editorCtx.colorPickerHue = updateColorPickerFromPointer.h),
    (deps.editorCtx.colorPickerSaturation = updateColorPickerFromPointer.s),
    (deps.editorCtx.colorPickerBrightness = updateColorPickerFromPointer.v),
    (deps.globalColorPickerElement.hidden = false),
    deps.openEntityPicker(deps.editorCtx.activeColorHex),
    window.requestAnimationFrame(deps.closeDropdownMenu));
}

export function setWorkspaceHasProject(deps: ShellControlsDeps) {
  if (!deps.editorCtx.activeColorInputElement) return;
  const he2 = deps.editorCtx.activeColorInputElement,
    isPositionColorPicker = normalizedHexColor2(he2.value) !== deps.editorCtx.activeColorHex;
  ((deps.globalColorPickerElement.hidden = true),
    (deps.editorCtx.activeColorInputElement = null),
    (deps.editorCtx.colorPickerDragPointerId = null),
    isPositionColorPicker &&
      he2.dispatchEvent(
        new Event("change", {
          bubbles: true,
        }),
      ),
    deps.coverKindDraftDocument(he2));
}

export function hasActiveProject(deps: ShellControlsDeps) {
  !deps.globalColorPickerElement.hidden &&
    deps.editorCtx.activeColorInputElement?.isConnected &&
    deps.openEntityPicker(deps.editorCtx.activeColorInputElement.value);
}

export function destroyDashboardPreview(deps: ShellControlsDeps, renderDashboardPreview: Document | HTMLElement = document) {
  (renderDashboardPreview instanceof HTMLInputElement && renderDashboardPreview.type === "color"
    ? [renderDashboardPreview]
    : [...(renderDashboardPreview.querySelectorAll?.<HTMLElement>('input[type="color"]') || [])]
  ).forEach((previewPagePath) => {
    deps.colorPickerBoundInputById.has(previewPagePath) ||
      (deps.colorPickerBoundInputById.set(previewPagePath, true),
      (previewPagePath.title = "打开颜色选择器"),
      previewPagePath.addEventListener("pointerdown", (changedPagePath) => {
        (changedPagePath.preventDefault(), deps.runEntry(previewPagePath));
      }),
      previewPagePath.addEventListener("click", (renderDashboardDisplayLink) =>
        renderDashboardDisplayLink.preventDefault(),
      ),
      previewPagePath.addEventListener("keydown", (renderDashboardPreviewState) => {
        ["Enter", " "].includes(renderDashboardPreviewState.key) &&
          (renderDashboardPreviewState.preventDefault(), deps.runEntry(previewPagePath));
      }));
  });
}

export function syncWorkspaceEmptyState(deps: ShellControlsDeps, hasPages: any) {
  (deps.displayDeviceCountElement.classList.toggle("empty", !hasPages),
    deps.editorCanvasElement.classList.toggle("workspace-empty-state", !hasPages),
    deps.editorCanvasElement.classList.toggle("canvas-placeholder", hasPages),
    (deps.projectActionsButtonElement.disabled = !hasPages),
    (deps.pageNewElement.disabled = !hasPages),
    (deps.popupNewElement.disabled = !hasPages),
    hasPages ||
      (deps.editorCanvasElement.removeAttribute("style"),
      (deps.editorCanvasElement.innerHTML =
        '<div class="canvas-message"><strong>请从左侧新建仪表盘。</strong></div>'),
      deps.errorPhase(),
      deps.value()),
    deps.renderWorkspaceResolution(),
    deps.unbindDisplayDeviceError(),
    deps.refreshSoundToggle());
}

