import { randomUuid } from "../../utils/random-id";
import { componentActionIsSupported } from "../../shared/action-rules";

export const maxRuntimeEntitySubscriptions = 1000,
  defaultTargetOccupancy = 0.76,
  compactTargetOccupancy = 0.7,
  maxPreferredScale = 1.6,
  fillMaxScale = 2,
  tightFillMaxScale = 2.12;

/** 门帘位置死区：位置值大于该阈值即视为「已张开」，否则视为停在闭合端（0）。 */
export const COVER_CLOSED_POSITION_EPSILON = 0.01;

export function runtimeDialogLayout({
  layerWidth: layoutLayerWidth,
  layerHeight: layoutLayerHeight,
  layoutWidth: layoutWidth,
  layoutHeight: layoutHeight,
  fillAvailable: isFillAvailable = false,
  tightFill: isTightFill = false,
  targetOccupancy: targetOccupancy = defaultTargetOccupancy,
}: any) {
  const max = Math.max(1, Number(layoutLayerWidth) || 1),
    dialogLayerHeight = Math.max(1, Number(layoutLayerHeight) || 1),
    dialogLayoutWidth = Math.max(1, Number(layoutWidth) || 1),
    dialogLayoutHeight = Math.max(1, Number(layoutHeight) || 1),
    min = isTightFill
      ? Math.min(40, Math.max(24, Math.min(max, dialogLayerHeight) * 0.03))
      : isFillAvailable
        ? Math.min(80, Math.max(32, Math.min(max, dialogLayerHeight) * 0.075))
        : Math.min(64, Math.max(24, Math.min(max, dialogLayerHeight) * 0.05)),
    dialogAvailableWidth = Math.max(1, max - min * 2),
    dialogAvailableHeight = Math.max(1, dialogLayerHeight - min * 2),
    dialogFitScale = Math.min(
      dialogAvailableWidth / dialogLayoutWidth,
      dialogAvailableHeight / dialogLayoutHeight,
    ),
    clampedTargetOccupancy = Math.max(
      0.2,
      Math.min(1, Number(targetOccupancy) || defaultTargetOccupancy),
    ),
    requestedOccupancyScale = Math.min(
      (max * clampedTargetOccupancy) / dialogLayoutWidth,
      (dialogLayerHeight * clampedTargetOccupancy) / dialogLayoutHeight,
    ),
    cappedPreferredScale = Math.min(maxPreferredScale, requestedOccupancyScale),
    dialogFinalScale = Math.min(
      isFillAvailable ? (isTightFill ? tightFillMaxScale : fillMaxScale) : cappedPreferredScale,
      dialogFitScale,
    );
  return {
    availableWidth: dialogAvailableWidth,
    availableHeight: dialogAvailableHeight,
    fitScale: dialogFitScale,
    preferredScale: cappedPreferredScale,
    safeInset: min,
    scale: Math.max(0.08, dialogFinalScale),
  };
}
export function runtimeDialogViewport({
  layerLeft: viewportLayerLeft = 0,
  layerTop: viewportLayerTop = 0,
  layerWidth: viewportLayerWidth,
  layerHeight: viewportLayerHeight,
  dashboardLeft: dashboardLeft,
  dashboardTop: dashboardTop,
  dashboardWidth: dashboardWidth,
  dashboardHeight: dashboardHeight,
}: any) {
  const num = Number(viewportLayerLeft) || 0,
    viewportLayerTopPx = Number(viewportLayerTop) || 0,
    viewportLayerWidthPx = Math.max(1, Number(viewportLayerWidth) || 1),
    viewportLayerHeightPx = Math.max(1, Number(viewportLayerHeight) || 1),
    viewportLayerRightPx = num + viewportLayerWidthPx,
    viewportLayerBottomPx = viewportLayerTopPx + viewportLayerHeightPx,
    dashboardLeftPx = Number.isFinite(Number(dashboardLeft)) ? Number(dashboardLeft) : num,
    dashboardTopPx = Number.isFinite(Number(dashboardTop))
      ? Number(dashboardTop)
      : viewportLayerTopPx,
    dashboardWidthPx = Math.max(1, Number(dashboardWidth) || viewportLayerWidthPx),
    dashboardHeightPx = Math.max(1, Number(dashboardHeight) || viewportLayerHeightPx),
    dashboardLeftLimitPx = Math.max(num, dashboardLeftPx),
    dashboardTopLimitPx = Math.max(viewportLayerTopPx, dashboardTopPx),
    dashboardRightLimitPx = Math.min(viewportLayerRightPx, dashboardLeftPx + dashboardWidthPx),
    dashboardBottomLimitPx = Math.min(viewportLayerBottomPx, dashboardTopPx + dashboardHeightPx),
    viewportBodyWidthPx = Math.max(1, dashboardRightLimitPx - dashboardLeftLimitPx),
    viewportBodyHeightPx = Math.max(1, dashboardBottomLimitPx - dashboardTopLimitPx);
  return {
    width: viewportBodyWidthPx,
    height: viewportBodyHeightPx,
    centerX: dashboardLeftLimitPx - num + viewportBodyWidthPx / 2,
    centerY: dashboardTopLimitPx - viewportLayerTopPx + viewportBodyHeightPx / 2,
  };
}
export function assignComponentIdentifiers(componentNodeRecord: any) {
  componentNodeRecord.id = "component-" + randomUuid();
  for (const childNodeRecord of componentNodeRecord.children || [])
    assignComponentIdentifiers(childNodeRecord);
  return componentNodeRecord;
}
export function isPrimaryModifierPressed(keyboardEvent: any) {
  const platformName = navigator.userAgentData?.platform || navigator.platform || "",
    test = /mac|iphone|ipad|ipod/i.test(platformName);
  return keyboardEvent.altKey || keyboardEvent.ctrlKey || (test && keyboardEvent.metaKey);
}
export function componentSupportsAction(actionComponentRecord: any, actionSpec: any) {
  return componentActionIsSupported(actionComponentRecord, actionSpec);
}
export function componentDialogTitle(titleComponentRecord: any, fallbackTitleText: any) {
  const options = titleComponentRecord?.properties || {};
  return String(options.label || "").trim() || fallbackTitleText;
}
export function popupModuleDialogTitle(
  popupModuleRecord: any,
  popupEntityRecord: any,
  fallbackTitleLabel = "",
) {
  return (
    String(popupModuleRecord?.title || "").trim() ||
    String(fallbackTitleLabel || "").trim() ||
    String(popupEntityRecord?.attributes?.friendly_name || "").trim() ||
    String(popupModuleRecord?.entityId || "").trim()
  );
}
export function createAirerVisual(airerHostElement: any) {
  const ownerDocument = airerHostElement.ownerDocument,
    element = ownerDocument.createElement("span");
  element.className = "hb-airer-visual";
  const airerGlowElement = ownerDocument.createElement("i");
  airerGlowElement.className = "hb-airer-visual-glow";
  const airerBodyElement = ownerDocument.createElement("span");
  airerBodyElement.className = "hb-airer-visual-body";
  const airerLampElement = ownerDocument.createElement("i");
  ((airerLampElement.className = "hb-airer-visual-lamp"),
    airerBodyElement.append(airerLampElement));
  const airerLiftsElement = ownerDocument.createElement("span");
  ((airerLiftsElement.className = "hb-airer-visual-lifts"),
    airerLiftsElement.append(ownerDocument.createElement("i"), ownerDocument.createElement("i")));
  const airerRackElement = ownerDocument.createElement("span");
  airerRackElement.className = "hb-airer-visual-rack";
  for (let rackShelfIndex = 0; rackShelfIndex < 4; rackShelfIndex += 1)
    airerRackElement.append(ownerDocument.createElement("i"));
  (element.append(airerGlowElement, airerBodyElement, airerLiftsElement, airerRackElement),
    airerHostElement.append(element));
}
export function entityStateText(stateKey: any) {
  return (
    ({
      open: "已升起",
      closed: "已下降",
      opening: "正在升起",
      closing: "正在下降",
    } as any)[stateKey] || ""
  );
}
export function createSwitchVisual({
  label: switchLabelText = "开关",
  interactive: isInteractive = true,
  onToggle: toggleHandler = null,
  compact: isCompact = false,
  momentary: isMomentary = false,
}: any = {}) {
  const switchButtonElement = document.createElement("button");
  ((switchButtonElement.type = "button"),
    (switchButtonElement.className = "hb-switch-visual"),
    switchButtonElement.classList.toggle("is-momentary", isMomentary),
    (switchButtonElement.inert = !isInteractive),
    switchButtonElement.setAttribute("aria-disabled", String(!isInteractive)));
  const switchAuraElement = document.createElement("i");
  switchAuraElement.className = "hb-switch-visual-aura";
  const switchPlateElement = document.createElement("span");
  switchPlateElement.className = "hb-switch-visual-plate";
  const switchIndicatorElement = document.createElement("i");
  switchIndicatorElement.className = "hb-switch-visual-indicator";
  const switchRockerElement = document.createElement("span");
  switchRockerElement.className = "hb-switch-visual-rocker";
  const switchOffMarkElement = document.createElement("i");
  ((switchOffMarkElement.className = "hb-switch-visual-mark off"),
    (switchOffMarkElement.textContent = "○"));
  const switchOnMarkElement = document.createElement("i");
  ((switchOnMarkElement.className = "hb-switch-visual-mark on"),
    (switchOnMarkElement.textContent = "┃"),
    switchRockerElement.append(switchOffMarkElement, switchOnMarkElement),
    switchPlateElement.append(switchIndicatorElement, switchRockerElement),
    switchButtonElement.append(switchAuraElement, switchPlateElement));
  const switchCopyElement = isCompact ? document.createElement("span") : null,
    switchCopyLabelElement = isCompact ? document.createElement("strong") : null,
    switchCopyStateElement = isCompact ? document.createElement("output") : null;
  isCompact &&
    ((switchCopyElement!.className = "hb-switch-visual-copy"),
    (switchCopyLabelElement!.className = "hb-switch-visual-copy-label"),
    (switchCopyStateElement!.className = "hb-switch-visual-copy-state"),
    (switchCopyLabelElement!.textContent = switchLabelText),
    switchCopyElement!.append(switchCopyLabelElement!, switchCopyStateElement!),
    switchButtonElement.append(switchCopyElement!),
    switchButtonElement.classList.add("is-compact"));
  const syncSwitchVisual = (
    isSwitchOn: any,
    {
      unavailable: isUnavailable = false,
      pending: isPending = false,
      success: isSuccess = false,
    } = {},
  ) => {
    const isSwitchPressed = (isMomentary ? isPending : !!isSwitchOn) && !isUnavailable;
    (switchButtonElement.classList.toggle("is-on", isSwitchPressed),
      switchButtonElement.classList.toggle("is-unavailable", isUnavailable),
      switchButtonElement.classList.toggle("is-pending", isPending),
      switchButtonElement.classList.toggle("is-success", isSuccess),
      switchButtonElement.setAttribute("aria-pressed", String(isSwitchPressed)),
      switchButtonElement.setAttribute("aria-busy", String(isPending)),
      switchButtonElement.setAttribute(
        "aria-label",
        isUnavailable
          ? switchLabelText + "当前不可用"
          : isMomentary
            ? "" +
              switchLabelText +
              (isSuccess ? "执行成功" : isPending ? "正在执行" : "，点击执行")
            : "" + switchLabelText + (isSwitchPressed ? "已开启，点击关闭" : "已关闭，点击开启"),
      ),
      switchCopyStateElement &&
        (switchCopyStateElement.textContent = isUnavailable
          ? "当前不可用"
          : isMomentary
            ? isSuccess
              ? "执行成功"
              : isPending
                ? "执行中"
                : "点击执行"
            : isSwitchPressed
              ? "运行中"
              : "已关闭"));
  };
  return (
    switchButtonElement.addEventListener("click", () => {
      isInteractive &&
        !switchButtonElement.classList.contains("is-pending") &&
        !switchButtonElement.classList.contains("is-unavailable") &&
        toggleHandler?.();
    }),
    {
      visual: switchButtonElement,
      sync: syncSwitchVisual,
    }
  );
}
export function mixHexColor(fromHexColor: any, toHexColor: any, blendAmount = 0) {
  const normalizeHexColor = (rawColor: any) => {
      const trim = String(rawColor || "").trim(),
        expandedHexColor = /^#[0-9a-f]{3}$/i.test(trim)
          ? "#" +
            trim
              .slice(1)
              .split("")
              .map((doubledHexDigit) => "" + doubledHexDigit + doubledHexDigit)
              .join("")
          : trim;
      return /^#[0-9a-f]{6}$/i.test(expandedHexColor) ? expandedHexColor : null;
    },
    sourceHexColor = normalizeHexColor(fromHexColor),
    targetHexColor = normalizeHexColor(toHexColor);
  if (!sourceHexColor || !targetHexColor) return fromHexColor;
  const clampedBlendAmount = Math.max(0, Math.min(1, Number(blendAmount) || 0)),
    parseHexChannel = (hexColorText: any, channelOffset: any) =>
      Number.parseInt(hexColorText.slice(channelOffset, channelOffset + 2), 16);
  return (
    "#" +
    [1, 3, 5]
      .map((channelOffsetIndex) =>
        Math.round(
          parseHexChannel(sourceHexColor, channelOffsetIndex) +
            (parseHexChannel(targetHexColor, channelOffsetIndex) -
              parseHexChannel(sourceHexColor, channelOffsetIndex)) *
              clampedBlendAmount,
        ),
      )
      .map((channelByteValue) => channelByteValue.toString(16).padStart(2, "0"))
      .join("")
  );
}

/** 键盘 Enter/Space 触发时，模拟点击当前聚焦的控件（非 HTMLElement 时忽略）。 */
export function clickFocusedElement(): void {
  const focusedElement = document.activeElement;
  focusedElement instanceof HTMLElement && focusedElement.click();
}

/** 页面是否处于后台。 */
export function isDocumentHidden(): boolean {
  return document.visibilityState === "hidden";
}
