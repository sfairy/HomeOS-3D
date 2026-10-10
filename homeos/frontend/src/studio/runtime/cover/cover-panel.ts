import { createPurifierExtras } from "../climate/purifier-extras";
import {
  coverState,
  coverControl,
  coverStateLabel,
  coverCanAdjustBlades,
  airerState,
} from "./cover-state";
import { airerMapControlPosition, airerMapControlService } from "../airer/airer-direction";
import { domElement } from "@app/utils/dom-factory";
import { applyRangeProgressCss } from "@app/utils/range-progress";
import { createStageDeviceVisual } from "../core/stage-device-visual";
/** cover 面板的宿主元素与回调； */
type CoverPanelOptions = {
  element?: any;
  onControl?: (...args: any[]) => any;
  onPreview?: (...args: any[]) => any;
  onExtraControl?: (...args: any[]) => any;
  onLayout?: (...args: any[]) => any;
};

/** 面板视图模型由 stage 的 update() 注入：字段来自运行时设备状态（动态属性袋），这里按实际访问到的键显式列出并全部保持可选，不做窄化假设。 */
type CoverPanelViewModel = {
  item?: any;
  states?: any;
  editing?: any;
  state?: any;
  presentation?: any;
  error?: any;
};

export function createCoverPanel({
  element: hostElement,
  onControl: onControl = async () => {},
  onPreview: onPreview = () => {},
  onExtraControl: onExtraControl = async () => {},
  onLayout: onLayout = () => {},
}: CoverPanelOptions = {}) {
  const ownerDocument = hostElement?.ownerDocument || globalThis.document,
    createElement = (tagName: any, className = "", textContent = "") =>
      domElement(ownerDocument, tagName, className, textContent),
    replaceChildren = (hostNode: any, ...childNodes: any[]) => {
      if (typeof hostNode.replaceChildren == "function") hostNode.replaceChildren(...childNodes);
      else {
        for (const existingChildElement of [...(hostNode.children || [])])
          existingChildElement.remove?.();
        hostNode.append(...childNodes);
      }
    },
    rootElement = hostElement || createElement("section");
  rootElement.classList.add("i3d-cover-panel");
  const headingElement = createElement("div", "i3d-cover-heading"),
    titleElement = createElement("h3", "", "窗帘"),
    statusElement = createElement("p", "", "尚未绑定设备"),
    headingTextElement = createElement("div", "i3d-cover-heading-text");
  const deviceVisual = createStageDeviceVisual({
    kind: "cover",
    document: ownerDocument,
    onActivate: () => {
      if (!canControl()) return;
      const presentation = resolvePresentation();
      if (
        presentation.moving ||
        (pendingIntent &&
          !pendingIntent.confirmed &&
          ["open_cover", "close_cover", "set_cover_position"].includes(pendingIntent.service))
      ) {
        deviceState.stopSupported && requestControl("stop_cover");
        return;
      }
      // 梦幻帘点击角标切换整体轨道开合，不用叶片角度判断
      const isDream = viewModel.item?.coverKind === "dream";
      const currentPosition =
        draftPosition ??
        presentation.position ??
        deviceState.position ??
        (presentation.on ? 100 : 0);
      const isOpen = isDream
        ? !!(
            presentation.on ||
            presentation.state === "open" ||
            presentation.state === "opening" ||
            (presentation.position ?? 0) > 0
          )
        : !!(
            presentation.on ||
            currentPosition > 0 ||
            presentation.state === "open" ||
            presentation.state === "opening"
          );
      requestControl(isOpen ? "close_cover" : "open_cover");
    },
  });
  (headingTextElement.append(titleElement, statusElement),
    headingElement.append(headingTextElement, deviceVisual.root));
  const bladeHintElement = createElement("p", "i3d-cover-blade-hint", "叶片角度 · 50% 为 90°打开");
  bladeHintElement.hidden = true;
  const controlsSlotElement = createElement("div", "i3d-cover-controls-slot"),
    controlsElement = createElement("section", "hb-cover-details-controls"),
    positionLabelElement = createElement("label", "hb-cover-details-position"),
    positionHeadingElement = createElement("span", "hb-cover-details-position-heading"),
    positionOutputElement = createElement("output");
  (positionOutputElement.setAttribute("aria-label", "当前开合位置"),
    positionHeadingElement.append(positionOutputElement));
  const positionSliderElement = createElement("input");
  ((positionSliderElement.type = "range"),
    positionSliderElement.classList.add("hb-range"),
    (positionSliderElement.min = "0"),
    (positionSliderElement.max = "100"),
    (positionSliderElement.step = "1"),
    positionSliderElement.setAttribute("aria-label", "目标开合位置"));
  const positionLegendElement = createElement("span", "hb-cover-details-position-legend");
  (positionLegendElement.append(
    createElement("small", "", "关闭"),
    createElement("small", "", "打开"),
  ),
    positionLabelElement.append(
      positionHeadingElement,
      positionSliderElement,
      positionLegendElement,
    ));
  const actionsElement = createElement("div", "hb-cover-details-actions"),
    actionButtons: any = [];
  for (const [actionLabel, controlService, capabilityKey] of [
    ["关闭", "close_cover", "closeSupported"],
    ["暂停", "stop_cover", "stopSupported"],
    ["打开", "open_cover", "openSupported"],
  ]) {
    const buttonElement = createElement("button");
    ((buttonElement.type = "button"),
      (buttonElement.dataset.coverAction = controlService),
      buttonElement.setAttribute("aria-label", actionLabel),
      buttonElement.append(createElement("strong", "", actionLabel)),
      buttonElement.addEventListener("click", () => requestControl(controlService)),
      actionButtons.push({
        button: buttonElement,
        service: controlService,
        capability: capabilityKey,
      }),
      actionsElement.append(buttonElement));
  }
  (controlsElement.append(positionLabelElement, actionsElement),
    controlsSlotElement.append(controlsElement));
  const feedbackElement = createElement("p", "i3d-cover-feedback");
  ((feedbackElement.hidden = true),
    feedbackElement.setAttribute("role", "status"),
    feedbackElement.setAttribute("aria-live", "polite"));
  const extrasPanelElement = createElement("div", "i3d-climate-panel i3d-airer-extras"),
    extrasGridElement = createElement("div", "i3d-purifier-extras i3d-extra-grid");
  extrasPanelElement.append(extrasGridElement);
  const purifierExtrasController = createPurifierExtras({
      element: extrasGridElement,
      onControl: onExtraControl,
      onLayout: onLayout,
    }),
    popupBodyElement = createElement("div", "i3d-popup-body");
  (popupBodyElement.append(
    bladeHintElement,
    controlsSlotElement,
    feedbackElement,
    extrasPanelElement,
  ),
    replaceChildren(rootElement, headingElement, popupBodyElement));
  let viewModel: CoverPanelViewModel = {},
    deviceState = coverState("", null),
    isDisposed = false,
    instanceId = 0,
    ticketCounter = 0,
    isRailUnconfirmed = false,
    nativeTiltElement: any = null,
    tiltPositionSliderElement: any = null,
    tiltPositionOutputElement: any = null,
    draftTiltPosition: any = null,
    tiltTicketCounter = 0,
    pendingIntent: any = null,
    intentTimeoutId: any = null,
    draftPosition: any = null,
    isDragging = false,
    errorText = "",
    stateRevision = 0,
    stateSignature = "";
  const AIRER_NO_FEEDBACK_MESSAGE = "设备未回报升降状态，请检查设备。";
  const airerPendingFeedbackMessage = () => {
    if (!viewModel.item?.airer || !pendingIntent || pendingIntent.confirmed) return "";
    if (pendingIntent.sending) return "正在发送升降指令…";
    if (pendingIntent.service === "stop_cover") return "等待暂停回报…";
    if (pendingIntent.service === "open_cover") return "等待上升回报…";
    if (pendingIntent.service === "close_cover") return "等待下降回报…";
    return "等待目标高度回报…";
  };
  const canControl = () =>
      !isDisposed &&
      !viewModel.editing &&
      viewModel.item?.modelAvailable !== false &&
      deviceState.available,
    resolveTargetPosition = () =>
      draftPosition ??
      viewModel.presentation?.targetPosition ??
      viewModel.presentation?.position ??
      (pendingIntent?.confirmed
        ? deviceState.position
        : (pendingIntent?.target ?? deviceState.position)),
    resolvePresentation = () =>
      viewModel.presentation || {
        ...deviceState,
        closedConfirmed: deviceState.closedConfirmed && !isRailUnconfirmed,
      },


    resolveDreamBladePosition = () =>
      viewModel.presentation?.tiltTarget ??
      viewModel.presentation?.tiltPosition ??
      deviceState.tiltPosition,
    // 梦幻帘：轨道停在「全开 / 全关」两端时才可调叶片；普通帘滑杆即整体开合位置。
    canAdjustSlider = () =>
      canControl() &&
      (viewModel.item?.coverKind === "dream"
        ? coverCanAdjustBlades(deviceState, resolvePresentation())
        : deviceState.positionSupported);
  function clearPendingIntent() {
    (intentTimeoutId !== null && clearTimeout(intentTimeoutId),
      (intentTimeoutId = null),
      (pendingIntent = null));
  }
  function syncSlider() {
    const isDream = viewModel.item?.coverKind === "dream",
      sliderPosition = isDream
        ? (draftPosition ?? resolveDreamBladePosition())
        : resolveTargetPosition();
    ((positionSliderElement.value = String(sliderPosition ?? 0)),
      applyRangeProgressCss(positionSliderElement, (sliderPosition ?? 0) + "%"),
      positionSliderElement.setAttribute(
        "aria-valuetext",
        sliderPosition === null
          ? "当前位置未知，滑动设置目标"
          : isDream
            ? "叶片角度 " + Math.round(sliderPosition) + "%，50% 为 90°打开"
            : "目标 " +
              Math.round(sliderPosition) +
              "%，当前位置" +
              (deviceState.position === null ? "未知" : Math.round(deviceState.position) + "%"),
      ),
      rootElement.setAttribute("aria-invalid", String(!!(viewModel.error || errorText))));
  }
  async function sendControl(command: any) {
    if (!deviceState.dream && command.service.includes("_tilt")) {
      const instanceAtSend = instanceId,
        tiltTicket = ++tiltTicketCounter;
      ((draftTiltPosition = null), (errorText = ""), render());
      try {
        await onControl(command, viewModel.item);
      } catch (error: any) {
        !isDisposed &&
          instanceId === instanceAtSend &&
          tiltTicketCounter === tiltTicket &&
          ((errorText = error?.message || "叶片控制失败，请重试。"), render());
      }
      return;
    }
    const instanceAtSend = instanceId,
      ticket = ++ticketCounter,
      hasPresentation = !!viewModel.presentation;
    (clearPendingIntent(),
      (draftPosition = null),
      (isDragging = false),
      (errorText = ""),
      deviceState.dream &&
        ["open_cover", "close_cover", "stop_cover"].includes(command.service) &&
        (isRailUnconfirmed ||= command.service === "open_cover" || !deviceState.closedConfirmed),
      (pendingIntent = {
        blade:
          viewModel.item?.coverKind === "dream" &&
          ["set_cover_position", "set_cover_tilt_position"].includes(command.service),
        ticket: ticket,
        revision: stateRevision,
        initialState: deviceState.state,
        initialPosition: deviceState.position,
        confirmed: false,
        wasMoving: false,
        service: command.service,
        target:
          command.service === "set_cover_position"
            ? command.data.position
            : command.service === "open_cover"
              ? 100
              : command.service === "close_cover"
                ? 0
                : null,
        sending: true,
      }),
      hasPresentation ||
        (intentTimeoutId = setTimeout(() => {
          if (
            isDisposed ||
            instanceId !== instanceAtSend ||
            pendingIntent?.ticket !== ticket
          )
            return;
          intentTimeoutId = null;
          pendingIntent = null;
          if (viewModel.item?.airer) errorText = AIRER_NO_FEEDBACK_MESSAGE;
          render();
        }, 15000)),
      render());
    try {
      await onControl(command, viewModel.item);
    } catch (error: any) {
      !isDisposed &&
        instanceId === instanceAtSend &&
        ticketCounter === ticket &&
        (clearPendingIntent(),
        (errorText =
          error?.message ||
          (viewModel.item?.airer ? "晾衣架控制失败，请重试。" : "窗帘控制失败，请重试。")),
        render());
    } finally {
      !isDisposed &&
        instanceId === instanceAtSend &&
        ticketCounter === ticket &&
        (hasPresentation ? clearPendingIntent() : pendingIntent && (pendingIntent.sending = false),
        render());
    }
  }
  function requestControl(requestedService: any, controlValue: any = undefined) {
    if (viewModel.item?.airer) {
      requestedService = airerMapControlService(requestedService, viewModel.item);
      if (
        requestedService === "set_cover_position" &&
        controlValue !== undefined &&
        controlValue !== null
      )
        controlValue = airerMapControlPosition(controlValue, viewModel.item);
    }
    if (canControl())
      try {
        return sendControl(
          coverControl(
            {
              ...deviceState,
              ...resolvePresentation(),
              // 门禁（coverCanAdjustBlades）以设备自报位置为准：presentation 的位置可能还在做
              // 收尾平滑动画，别让它盖掉设备刚刚报出来的真实位置。
              position: deviceState.positionKnown
                ? deviceState.position
                : resolvePresentation().position,
            },
            requestedService,
            controlValue,
          ),
        );
      } catch (controlError: any) {
        ((errorText = controlError.message), render());
      }
  }
  (positionSliderElement.addEventListener("pointerdown", () => {
    canAdjustSlider() && (isDragging = true);
  }),
    positionSliderElement.addEventListener("input", () => {
      if (!canAdjustSlider()) return;
      const sliderValue = Number(positionSliderElement.value);
      if (!Number.isFinite(sliderValue)) return;
      ((isDragging = true), (draftPosition = Math.max(0, Math.min(100, Math.round(sliderValue)))));
      const previewPresentation = onPreview(
        viewModel.item?.entityId,
        draftPosition,
        viewModel.item,
      );
      (previewPresentation &&
        (viewModel = {
          ...viewModel,
          presentation: previewPresentation,
        }),
        render());
    }),
    positionSliderElement.addEventListener("change", () => {
      if (draftPosition === null) {
        ((isDragging = false), syncSlider());
        return;
      }
      const committedPosition = draftPosition;
      if (((draftPosition = null), (isDragging = false), canAdjustSlider()))
        return requestControl(
          viewModel.item?.coverKind === "dream" && deviceState.tiltSupported
            ? "set_cover_tilt_position"
            : "set_cover_position",
          committedPosition,
        );
      syncSlider();
    }));
  function cancelPreview() {
    ((draftPosition = null), (isDragging = false));
    const clearedPreview = onPreview(viewModel.item?.entityId, null, viewModel.item);
    (clearedPreview &&
      (viewModel = {
        ...viewModel,
        presentation: clearedPreview,
      }),
      render());
  }
  (positionSliderElement.addEventListener("pointercancel", cancelPreview),
    positionSliderElement.addEventListener("blur", () => {
      draftPosition !== null && cancelPreview();
    }));
  function syncTiltSection() {
    if (
      !(
        !deviceState.dream &&
        !viewModel.item?.airer &&
        (deviceState.tiltSupported ||
          deviceState.tiltOpenSupported ||
          deviceState.tiltCloseSupported ||
          deviceState.tiltStopSupported)
      )
    ) {
      if (nativeTiltElement) {
        ((nativeTiltElement.hidden = true), (tiltPositionSliderElement.disabled = true));
        for (const tiltButton of nativeTiltElement.children[2].children) tiltButton.disabled = true;
      }
      draftTiltPosition = null;
      return;
    }
    if (!nativeTiltElement) {
      ((nativeTiltElement = createElement("section", "i3d-cover-native-tilt")),
        nativeTiltElement.append(createElement("h4", "", "叶片角度")));
      const tiltLabelElement = createElement("label", "hb-cover-details-position");
      ((tiltPositionOutputElement = createElement("output")),
        tiltPositionOutputElement.setAttribute("aria-label", "当前叶片位置"),
        (tiltPositionSliderElement = createElement("input")),
        (tiltPositionSliderElement.type = "range"),
        tiltPositionSliderElement.classList.add("hb-range"),
        (tiltPositionSliderElement.min = "0"),
        (tiltPositionSliderElement.max = "100"),
        (tiltPositionSliderElement.step = "1"),
        tiltPositionSliderElement.setAttribute("aria-label", "目标叶片位置"),
        tiltPositionSliderElement.addEventListener("input", () => {
          canAdjustSlider() &&
            deviceState.tiltSupported &&
            ((draftTiltPosition = Number(tiltPositionSliderElement.value)), syncTiltSection());
        }),
        tiltPositionSliderElement.addEventListener("change", () => {
          const committedTiltPosition = draftTiltPosition;
          ((draftTiltPosition = null),
            committedTiltPosition !== null && canAdjustSlider() && deviceState.tiltSupported
              ? requestControl("set_cover_tilt_position", committedTiltPosition)
              : syncTiltSection());
        }));
      const cancelTiltPreview = () => {
        ((draftTiltPosition = null), syncTiltSection());
      };
      (tiltPositionSliderElement.addEventListener("pointercancel", cancelTiltPreview),
        tiltPositionSliderElement.addEventListener("blur", cancelTiltPreview),
        tiltLabelElement.append(tiltPositionOutputElement, tiltPositionSliderElement),
        nativeTiltElement.append(tiltLabelElement));
      const tiltActionsElement = createElement("div", "hb-cover-details-actions");
      for (const [tiltLabel, tiltService, tiltCapability] of [
        ["关闭叶片", "close_cover_tilt", "tiltCloseSupported"],
        ["暂停叶片", "stop_cover_tilt", "tiltStopSupported"],
        ["打开叶片", "open_cover_tilt", "tiltOpenSupported"],
      ]) {
        const tiltButtonElement = createElement("button");
        ((tiltButtonElement.type = "button"),
          (tiltButtonElement.dataset.coverAction = tiltService),
          (tiltButtonElement.dataset.capability = tiltCapability),
          tiltButtonElement.setAttribute("aria-label", tiltLabel),
          tiltButtonElement.append(createElement("strong", "", tiltLabel)),
          tiltButtonElement.addEventListener("click", () => (
            (draftTiltPosition = null),
            requestControl(tiltService)
          )),
          tiltActionsElement.append(tiltButtonElement));
      }
      (nativeTiltElement.append(tiltActionsElement), popupBodyElement.append(nativeTiltElement));
    }
    nativeTiltElement.hidden = false;
    const tiltPosition = draftTiltPosition ?? deviceState.tiltPosition;
    ((tiltPositionOutputElement.textContent =
      tiltPosition === null ? "未知" : Math.round(tiltPosition) + "%"),
      (tiltPositionSliderElement.value = String(tiltPosition ?? 0)),
      (tiltPositionSliderElement.disabled = !canAdjustSlider() || !deviceState.tiltSupported),
      applyRangeProgressCss(tiltPositionSliderElement, (tiltPosition ?? 0) + "%"),
      tiltPositionSliderElement.parentElement &&
        (tiltPositionSliderElement.parentElement.hidden = !deviceState.tiltSupported));
    for (const tiltButton of nativeTiltElement.children[2].children)
      ((tiltButton.hidden = !(deviceState as any)[tiltButton.dataset.capability]),
        (tiltButton.disabled =
          !canAdjustSlider() || !(deviceState as any)[tiltButton.dataset.capability]));
  }
  function render() {
    if (isDisposed) return;
    ((titleElement.textContent =
      viewModel.item?.label || deviceState.name || (viewModel.item?.airer ? "晾衣架" : "窗帘")),
      (titleElement.title = titleElement.textContent));
    const presentation = resolvePresentation();
    statusElement.textContent = viewModel.editing
      ? "控制预览"
      : viewModel.item?.entityId
        ? deviceState.available
          ? // unknown 不等于「设备不可用」：瞬态被停滞看门狗降级、或尚未拿到可信整体反馈都属于这一档，
            // 说成不可用会误导，统一回落「在线」。
            presentation.state === "unknown"
            ? "在线"
            : coverStateLabel(presentation.state, {
                airer: !!viewModel.item?.airer,
              })
          : "设备不可用"
        : "尚未绑定设备";
    const isDreamCover = viewModel.item?.coverKind === "dream",
      isAirerItem = viewModel.item?.airer,
      // 「部分开启」只看设备实际回报的位置：设备刚报 全开/100 时，本地位置还在做收尾平滑动画，
      // 拿动画中的中间值判断会让卡片先闪一下「整体部分开启」再跳「整体已开启」。
      railReportedPosition = deviceState.position ?? presentation.position,

      dreamStateLabel = ({
        open: "整体已开启",
        closed: "整体已关闭",
        opening: "整体正在开启",
        closing: "整体正在关闭",
      } as any)[presentation.state];
    (rootElement.classList.toggle("is-dream", isDreamCover),
      (bladeHintElement.hidden = !isDreamCover),
      isDreamCover &&
        !viewModel.editing &&
        deviceState.available &&
        dreamStateLabel &&
        (statusElement.textContent = dreamStateLabel),
      !viewModel.editing &&
        deviceState.available &&
        presentation.state === "open" &&
        railReportedPosition !== null &&
        railReportedPosition > 0 &&
        railReportedPosition < 100 &&
        (statusElement.textContent = isDreamCover ? "整体部分开启" : "部分开启"),
      isAirerItem &&
        !viewModel.editing &&
        deviceState.available &&
        (statusElement.textContent = presentation.opening
          ? "正在放下"
          : presentation.closing
            ? "正在收起"
            : presentation.position === 100
              ? "已放下"
              : presentation.position === 0
                ? "已收起"
                : presentation.moving
                  ? presentation.closing
                    ? "正在收起…"
                    : presentation.opening
                      ? "正在放下…"
                      : "等待停稳…"
                  : presentation.preview && presentation.targetPosition !== null
                    ? "正在前往 " + Math.round(presentation.targetPosition) + "%"
                    : "已暂停"),
      positionSliderElement.setAttribute(
        "aria-label",
        isAirerItem ? "目标升降位置" : isDreamCover ? "目标叶片角度" : "目标开合位置",
      ),
      (positionLegendElement.children[0].textContent = isAirerItem
        ? "收起"
        : isDreamCover
          ? "正向闭合"
          : "关闭"),
      (positionLegendElement.children[1].textContent = isAirerItem
        ? "放下"
        : isDreamCover
          ? "反向闭合"
          : "打开"));
    // 普通帘：开合位；梦幻帘滑杆是叶片角度，轨道开合另算
    const displayPosition = isDreamCover
      ? (draftPosition ?? resolveDreamBladePosition())
      : resolveTargetPosition();
    const railPending =
      !!pendingIntent &&
      !pendingIntent.confirmed &&
      !pendingIntent.blade &&
      ["open_cover", "close_cover", "set_cover_position"].includes(pendingIntent.service);
    // 右上角图标只在「轨道真的在动」时播开合动画：调叶片（blade 意图 / 拖动叶片草稿）不算，
    // 也不会因为设备卡在 closing/opening 上就一直播（看门狗会把那一档降级，presentation.moving 随之归零）。
    const visualMoving = !!(presentation.moving || railPending);
    const visualRailPosition = isDreamCover
      ? railPending
        ? pendingIntent!.service === "open_cover"
          ? 100
          : pendingIntent!.service === "close_cover"
            ? 0
            : (pendingIntent!.target ?? presentation.position ?? 0)
        : (presentation.position ??
          (presentation.on ||
          presentation.state === "open" ||
          presentation.state === "opening"
            ? 100
            : 0))
      : (displayPosition ??
        presentation.position ??
        (presentation.on || pendingIntent?.service === "open_cover" ? 100 : 0));
    const visualTiltPosition = isDreamCover
      ? (displayPosition ?? deviceState.tiltPosition ?? 50)
      : null;
    const visualOn = !!(
      deviceState.available &&
      (isDreamCover
        ? railPending
          ? pendingIntent!.service === "open_cover" ||
            (pendingIntent!.service === "set_cover_position" && (pendingIntent!.target ?? 0) > 0)
          : pendingIntent?.service === "close_cover" && !pendingIntent.blade
            ? false
            : presentation.on ||
              presentation.state === "open" ||
              presentation.state === "opening" ||
              (presentation.position ?? 0) > 0
        : pendingIntent?.service === "open_cover" ||
          (pendingIntent?.service === "set_cover_position" && (pendingIntent.target ?? 0) > 0) ||
          (pendingIntent?.service === "close_cover"
            ? false
            : presentation.on ||
              presentation.position > 0 ||
              presentation.state === "open" ||
              presentation.state === "opening" ||
              (visualRailPosition ?? 0) > 0))
    );
    ((positionOutputElement.textContent =
      displayPosition === null ? "未知" : Math.round(displayPosition) + "%"),
      (positionOutputElement.title = isAirerItem
        ? "晾杆升降位置，100%为最高"
        : draftPosition !== null
          ? isDreamCover
            ? "目标叶片角度预览"
            : "目标开合位置预览"
          : isDreamCover
            ? "叶片角度：50% 为 90°打开"
            : "整体开合位置"),
      positionOutputElement.setAttribute(
        "aria-label",
        isAirerItem ? "当前升降位置" : isDreamCover ? "当前叶片角度" : "当前开合位置",
      ),
      (positionSliderElement.disabled = !canAdjustSlider()),
      !viewModel.editing &&
        deviceState.available &&
        presentation.estimated &&
        !presentation.moving &&
        !(isDreamCover && dreamStateLabel) &&
        (statusElement.textContent = "在线"),
      isDreamCover &&
        !viewModel.editing &&
        deviceState.available &&
        !dreamStateLabel &&
        (!deviceState.overallFeedbackAvailable ||
          presentation.awaitingArrival ||
          presentation.estimated) &&
        !presentation.moving &&
        (statusElement.textContent = "在线"),
      (bladeHintElement.textContent = "叶片角度"),
      (positionSliderElement.title =
        isDreamCover && !canAdjustSlider() && deviceState.available
          ? "整体全开或全关后可调节叶片"
          : ""));
    for (const {
      button: actionButton,
      service: actionService,
      capability: capability,
    } of actionButtons) {
      ((actionButton.children[0].textContent =
        actionService === "stop_cover"
          ? "暂停"
          : isAirerItem
            ? actionService === "open_cover"
              ? "放下"
              : "收起"
            : isDreamCover
              ? actionService === "open_cover"
                ? "开启"
                : "关闭"
              : actionService === "open_cover"
                ? "打开"
                : "关闭"),
        (actionButton.title = isDreamCover
          ? "整体" + actionButton.children[0].textContent
          : actionButton.children[0].textContent),
        actionButton.setAttribute("aria-label", actionButton.title),
        (actionButton.disabled = !canControl() || !(deviceState as any)[capability]));
      const isActiveAction = !!(
        pendingIntent &&
        !pendingIntent.confirmed &&
        pendingIntent.service === actionService
      );
      (actionButton.setAttribute("aria-busy", String(isActiveAction)),
        actionButton.classList.toggle(
          "is-active",
          (actionService === "open_cover" && presentation.opening) ||
            (actionService === "close_cover" && presentation.closing),
        ));
    }
    const pendingFeedback = airerPendingFeedbackMessage(),
      feedbackMessage = viewModel.error || errorText || pendingFeedback || "";
    ((feedbackElement.textContent = feedbackMessage),
      (feedbackElement.hidden = !feedbackMessage),
      feedbackElement.classList.toggle("is-error", !!(viewModel.error || errorText)),
      rootElement.setAttribute(
        "aria-busy",
        String(
          !!(viewModel.presentation
            ? viewModel.presentation.preview
            : pendingIntent && !pendingIntent.confirmed),
        ),
      ),
      syncSlider(),
      syncTiltSection());
    const lightExtra =
        viewModel.item?.extraControls?.find(
          (extraControl: any) =>
            extraControl?.domain === "light" ||
            String(extraControl?.entityId || "").startsWith("light."),
        ) || null,
      lightStateEntry = lightExtra?.entityId
        ? viewModel.states?.[lightExtra.entityId] ||
          (viewModel.states instanceof Map
            ? viewModel.states.get(lightExtra.entityId)
            : null)
        : null,
      lightStateValue = String(
        lightStateEntry?.newState?.state ?? lightStateEntry?.state ?? "",
      ).toLowerCase();
    deviceVisual.sync({
      kind: isAirerItem ? "airer" : "cover",
      dream: isDreamCover,
      on: visualOn,
      available: !!deviceState.available,
      disabled: !canControl(),
      interactive: canControl(),
      label: titleElement.textContent || (isAirerItem ? "晾衣架" : "窗帘"),
      position: visualRailPosition,
      tiltPosition: visualTiltPosition,
      moving: visualMoving,
      coverDirection: viewModel.item?.coverDirection || viewModel.item?.direction || "split",
      lightOn: lightStateValue === "on",
    });
  }
  function update(nextViewModel: CoverPanelViewModel = {}) {
    if (isDisposed) return;
    const nextEntityId = nextViewModel.item?.entityId || "";
    (nextEntityId !== deviceState.entityId || nextViewModel.item?.id !== viewModel.item?.id) &&
      (isDragging && onPreview(viewModel.item?.entityId, null, viewModel.item),
      instanceId++,
      (isRailUnconfirmed = false),
      clearPendingIntent(),
      (draftPosition = null),
      (draftTiltPosition = null),
      (isDragging = false),
      (errorText = ""),
      (stateRevision = 0),
      (stateSignature = ""));
    const previousState = deviceState;
    ((viewModel = nextViewModel),
      (extrasPanelElement.hidden =
        !nextViewModel.item?.airer || !nextViewModel.item?.extraControls?.length),
      purifierExtrasController.update({
        item: {
          ...nextViewModel.item,
          extraControls: nextViewModel.item?.airer ? nextViewModel.item.extraControls : [],
        },
        states: nextViewModel.states || {},
        editing: nextViewModel.editing,
      }),
      (deviceState =
        nextViewModel.state?.entityId === nextEntityId &&
        typeof nextViewModel.state?.positionKnown == "boolean"
          ? nextViewModel.state
          : coverState(nextEntityId, nextViewModel.state, nextViewModel.item)),
      nextViewModel.item?.airer && (deviceState = airerState(deviceState, nextViewModel.item)),
      errorText === AIRER_NO_FEEDBACK_MESSAGE &&
        deviceState.available &&
        (deviceState.moving || deviceState.position !== previousState.position) &&
        (errorText = ""),
      deviceState.overallFeedbackAvailable &&
        (deviceState.position !== previousState.position ||
          deviceState.state !== previousState.state) &&
        (isRailUnconfirmed = false),
      !canAdjustSlider() &&
        isDragging &&
        ((draftPosition = null),
        (isDragging = false),
        onPreview(nextEntityId, null, viewModel.item)));
    const nextSignature = JSON.stringify([
      deviceState.state,
      deviceState.position,
      deviceState.raw.updatedAt ?? deviceState.raw.last_updated,
      deviceState.raw.lastChanged ?? deviceState.raw.last_changed,
    ]);
    if (
      (stateSignature !== nextSignature && ((stateSignature = nextSignature), stateRevision++),
      canControl() || ((draftPosition = null), (isDragging = false), clearPendingIntent()),
      !viewModel.presentation && pendingIntent && stateRevision > pendingIntent.revision)
    ) {
      const reachedTarget =
          pendingIntent.target !== null &&
          deviceState.position !== null &&
          Math.abs(deviceState.position - pendingIntent.target) <= 0.5,
        stoppedConfirmed = pendingIntent.service === "stop_cover" && !deviceState.moving,
        openedConfirmed =
          pendingIntent.service === "open_cover" &&
          deviceState.position === null &&
          deviceState.state === "open" &&
          pendingIntent.initialState !== "open",
        settledAfterMove =
          pendingIntent.confirmed && pendingIntent.wasMoving && !deviceState.moving;
      if (reachedTarget || stoppedConfirmed || openedConfirmed || settledAfterMove)
        clearPendingIntent();
      else {
        if (pendingIntent.target !== null) {
          const expectedDirection =
              pendingIntent.initialPosition === null
                ? pendingIntent.service === "open_cover"
                  ? 1
                  : pendingIntent.service === "close_cover"
                    ? -1
                    : 0
                : Math.sign(pendingIntent.target - pendingIntent.initialPosition),
            movedAlongDirection =
              expectedDirection !== 0 &&
              deviceState.position !== null &&
              pendingIntent.initialPosition !== null &&
              (deviceState.position - pendingIntent.initialPosition) * expectedDirection > 0.5,
            stateFlippedInDirection =
              deviceState.state !== pendingIntent.initialState &&
              ((expectedDirection > 0 && deviceState.opening) ||
                (expectedDirection < 0 && deviceState.closing));
          ((movedAlongDirection || stateFlippedInDirection) &&
            ((pendingIntent.confirmed = true),
            intentTimeoutId !== null && clearTimeout(intentTimeoutId),
            (intentTimeoutId = null)),
            pendingIntent.confirmed && deviceState.moving && (pendingIntent.wasMoving = true));
        }
      }
    }
    (isDragging || (draftPosition = null), render());
  }
  function dispose() {
    isDisposed ||
      ((isDisposed = true),
      isDragging && onPreview(viewModel.item?.entityId, null, viewModel.item),
      instanceId++,
      clearPendingIntent(),
      purifierExtrasController.dispose(),
      deviceVisual.dispose(),
      replaceChildren(rootElement));
  }
  return (
    render(),
    {
      root: rootElement,
      update: update,
      dispose: dispose,
      deactivate() {
        ((draftTiltPosition = null),
          tiltTicketCounter++,
          isDragging ? cancelPreview() : syncTiltSection());
      },
    }
  );
}
