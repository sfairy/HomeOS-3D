import { createPurifierExtras } from "../climate/purifier-extras";
import {
  coverState,
  coverControl,
  coverStateLabel,
  coverCanAdjustBlades,
} from "./cover-state";
import { domElement } from "@app/utils/dom-factory";
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
    createElement = (tagName, className = "", textContent = "") =>
      domElement(ownerDocument, tagName, className, textContent),
    replaceChildren = (hostNode, ...childNodes) => {
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
    statusElement = createElement("p", "", "尚未绑定设备");
  headingElement.append(titleElement, statusElement);
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
    actionButtons = [];
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
    nativeTiltElement = null,
    tiltPositionSliderElement = null,
    tiltPositionOutputElement = null,
    draftTiltPosition = null,
    tiltTicketCounter = 0,
    pendingIntent = null,
    intentTimeoutId = null,
    draftPosition = null,
    isDragging = false,
    errorText = "",
    stateRevision = 0,
    stateSignature = "";
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
    canAdjustSlider = () =>
      canControl() &&
      (viewModel.item?.coverKind === "dream"
        ? coverCanAdjustBlades(deviceState, resolvePresentation()) &&
          !(!viewModel.presentation && pendingIntent && !pendingIntent.blade)
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
      positionSliderElement.style.setProperty(
        "--hb-cover-position-progress",
        (sliderPosition ?? 0) + "%",
      ),
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
  async function sendControl(command) {
    if (!deviceState.dream && command.service.includes("_tilt")) {
      const instanceAtSend = instanceId,
        tiltTicket = ++tiltTicketCounter;
      ((draftTiltPosition = null), (errorText = ""), render());
      try {
        await onControl(command, viewModel.item);
      } catch (error) {
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
          isDisposed ||
            instanceId !== instanceAtSend ||
            pendingIntent?.ticket !== ticket ||
            ((intentTimeoutId = null), (pendingIntent = null), render());
        }, 15000)),
      render());
    try {
      await onControl(command, viewModel.item);
    } catch (error) {
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
  function requestControl(requestedService, controlValue = undefined) {
    if (canControl())
      try {
        return sendControl(
          coverControl(
            {
              ...deviceState,
              ...resolvePresentation(),
            },
            requestedService,
            controlValue,
          ),
        );
      } catch (controlError) {
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
      tiltPositionSliderElement.style.setProperty(
        "--hb-cover-position-progress",
        (tiltPosition ?? 0) + "%",
      ),
      tiltPositionSliderElement.parentElement &&
        (tiltPositionSliderElement.parentElement.hidden = !deviceState.tiltSupported));
    for (const tiltButton of nativeTiltElement.children[2].children)
      ((tiltButton.hidden = !deviceState[tiltButton.dataset.capability]),
        (tiltButton.disabled =
          !canAdjustSlider() || !deviceState[tiltButton.dataset.capability]));
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
          ? coverStateLabel(presentation.state)
          : "设备不可用"
        : "尚未绑定设备";
    const isDreamCover = viewModel.item?.coverKind === "dream",
      isAirerItem = viewModel.item?.airer,


      dreamStateLabel = {
        open: "整体已开启",
        closed: "整体已关闭",
        opening: "整体正在开启",
        closing: "整体正在关闭",
      }[presentation.state];
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
        presentation.position > 0 &&
        presentation.position < 100 &&
        (statusElement.textContent = isDreamCover ? "整体部分开启" : "部分开启"),
      isAirerItem &&
        !viewModel.editing &&
        deviceState.available &&
        (statusElement.textContent = presentation.opening
          ? "正在上升"
          : presentation.closing
            ? "正在下降"
            : deviceState.position === 100
              ? "已升至最高"
              : deviceState.position === 0
                ? "已降至最低"
                : "已暂停"),
      positionSliderElement.setAttribute(
        "aria-label",
        isAirerItem ? "目标升降位置" : isDreamCover ? "目标叶片角度" : "目标开合位置",
      ),
      (positionLegendElement.children[0].textContent = isAirerItem
        ? "最低"
        : isDreamCover
          ? "一侧闭合"
          : "关闭"),
      (positionLegendElement.children[1].textContent = isAirerItem
        ? "最高"
        : isDreamCover
          ? "反向闭合"
          : "打开"));
    const displayPosition =
      draftPosition ??
      (isDreamCover
        ? resolveDreamBladePosition()
        : presentation.estimated
          ? deviceState.position
          : presentation.position);
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
          ? deviceState.overallFeedbackAvailable
            ? "关闭到位后可调节叶片"
            : "暂不可调节叶片"
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
              ? "上升"
              : "下降"
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
        (actionButton.disabled = !canControl() || !deviceState[capability]));
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
    const feedbackMessage = viewModel.error || errorText || "";
    ((feedbackElement.textContent = feedbackMessage),
      (feedbackElement.hidden = !feedbackMessage),
      feedbackElement.classList.toggle("is-error", !!feedbackMessage),
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
