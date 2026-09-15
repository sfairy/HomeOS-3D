import {
  coverState,
  coverControl,
  coverStateLabel,
  coverCanAdjustBlades
} from "./cover-state.js?v=20260915211726";
export function createCoverPanel({
  element: hostElement,
  onControl: onControl = async () => {},
  onPreview: onPreview = () => {}
} = {}) {
  const ownerDocument = hostElement?.ownerDocument || globalThis.document;
  const createElement = (tagName, className = "", textContent = "") => {
    const element = ownerDocument.createElement(tagName);
    element.className = className;
    element.textContent = textContent;
    return element;
  };
  const replaceChildren = (containerElement, ...childNodes) => {
    if (typeof containerElement.replaceChildren == "function") {
      containerElement.replaceChildren(...childNodes);
    } else {
      for (const child of [...(containerElement.children || [])]) {
        child.remove?.();
      }
      containerElement.append(...childNodes);
    }
  };
  const rootElement = hostElement || createElement("section");
  rootElement.classList.add("i3d-cover-panel");
  const headingElement = createElement("div", "i3d-cover-heading");
  const titleElement = createElement("h3", "", "窗帘");
  const statusElement = createElement("p", "", "尚未绑定设备");
  headingElement.append(titleElement, statusElement);
  const bladeHintElement = createElement("p", "i3d-cover-blade-hint", "叶片角度 · 50% 为 90°打开");
  bladeHintElement.hidden = true;
  const controlsSlotElement = createElement("div", "i3d-cover-controls-slot");
  const controlsElement = createElement("section", "hb-cover-details-controls");
  const positionLabelElement = createElement("label", "hb-cover-details-position");
  const positionHeadingElement = createElement("span", "hb-cover-details-position-heading");
  const positionOutputElement = createElement("output");
  positionOutputElement.setAttribute("aria-label", "当前开合位置");
  positionHeadingElement.append(positionOutputElement);
  const positionSliderElement = createElement("input");
  positionSliderElement.type = "range";
  positionSliderElement.min = "0";
  positionSliderElement.max = "100";
  positionSliderElement.step = "1";
  positionSliderElement.setAttribute("aria-label", "目标开合位置");
  const positionLegendElement = createElement("span", "hb-cover-details-position-legend");
  positionLegendElement.append(
    createElement("small", "", "关闭"),
    createElement("small", "", "打开")
  );
  positionLabelElement.append(positionHeadingElement, positionSliderElement, positionLegendElement);
  const actionsElement = createElement("div", "hb-cover-details-actions");
  const actionButtons = [];
  for (const [actionLabel, controlService, capabilityKey] of [
    ["关闭", "close_cover", "closeSupported"],
    ["暂停", "stop_cover", "stopSupported"],
    ["打开", "open_cover", "openSupported"]
  ]) {
    const buttonElement = createElement("button");
    buttonElement.type = "button";
    buttonElement.dataset.coverAction = controlService;
    buttonElement.setAttribute("aria-label", actionLabel);
    buttonElement.append(createElement("strong", "", actionLabel));
    buttonElement.addEventListener("click", () => requestControl(controlService));
    actionButtons.push({
      button: buttonElement,
      service: controlService,
      capability: capabilityKey
    });
    actionsElement.append(buttonElement);
  }
  controlsElement.append(positionLabelElement, actionsElement);
  controlsSlotElement.append(controlsElement);
  const feedbackElement = createElement("p", "i3d-cover-feedback");
  feedbackElement.hidden = true;
  feedbackElement.setAttribute("role", "status");
  feedbackElement.setAttribute("aria-live", "polite");
  replaceChildren(
    rootElement,
    headingElement,
    bladeHintElement,
    controlsSlotElement,
    feedbackElement
  );
  let viewModel = {};
  let deviceState = coverState("", null);
  let isDisposed = false;
  let instanceId = 0;
  let ticketCounter = 0;
  let railUnconfirmed = false;
  let pendingIntent = null;
  let intentTimeoutId = null;
  let draftPosition = null;
  let isDragging = false;
  let errorMessage = "";
  let stateRevision = 0;
  let stateSignature = "";
  const canControl = () =>
    !isDisposed &&
    !viewModel.editing &&
    viewModel.item?.modelAvailable !== false &&
    deviceState.available;
  const resolveTargetPosition = () =>
    draftPosition ??
    viewModel.presentation?.targetPosition ??
    viewModel.presentation?.position ??
    (pendingIntent?.confirmed
      ? deviceState.position
      : (pendingIntent?.target ?? deviceState.position));
  const resolvePresentation = () =>
    viewModel.presentation || {
      ...deviceState,
      closedConfirmed: deviceState.closedConfirmed && !railUnconfirmed
    };
  const canAdjustSlider = () =>
    canControl() &&
    (viewModel.item?.coverKind === "dream"
      ? coverCanAdjustBlades(deviceState, resolvePresentation()) &&
        (!!viewModel.presentation || !pendingIntent || !!pendingIntent.blade)
      : deviceState.positionSupported);
  function clearPendingIntent() {
    if (intentTimeoutId !== null) {
      clearTimeout(intentTimeoutId);
    }
    intentTimeoutId = null;
    pendingIntent = null;
  }
  function syncSlider() {
    const isDream = viewModel.item?.coverKind === "dream";
    const sliderPosition = isDream
      ? (draftPosition ??
        viewModel.presentation?.tiltTarget ??
        viewModel.presentation?.tiltPosition ??
        deviceState.tiltPosition)
      : resolveTargetPosition();
    positionSliderElement.value = String(sliderPosition ?? 0);
    positionSliderElement.style.setProperty(
      "--hb-cover-position-progress",
      (sliderPosition ?? 0) + "%"
    );
    positionSliderElement.setAttribute(
      "aria-valuetext",
      sliderPosition === null
        ? "当前位置未知，滑动设置目标"
        : isDream
          ? "叶片角度 " + Math.round(sliderPosition) + "%，50% 为 90°打开"
          : "目标 " +
            Math.round(sliderPosition) +
            "%，当前位置" +
            (deviceState.position === null ? "未知" : Math.round(deviceState.position) + "%")
    );
    rootElement.setAttribute("aria-invalid", String(!!viewModel.error || !!errorMessage));
  }
  async function sendControl(command) {
    const instanceAtSend = instanceId;
    const ticket = ++ticketCounter;
    const hasPresentation = !!viewModel.presentation;
    clearPendingIntent();
    draftPosition = null;
    isDragging = false;
    errorMessage = "";
    if (
      deviceState.dream &&
      ["open_cover", "close_cover", "stop_cover"].includes(command.service)
    ) {
      railUnconfirmed ||= command.service === "open_cover" || !deviceState.closedConfirmed;
    }
    pendingIntent = {
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
      sending: true
    };
    if (!hasPresentation) {
      intentTimeoutId = setTimeout(() => {
        if (!isDisposed && instanceId === instanceAtSend && pendingIntent?.ticket === ticket) {
          intentTimeoutId = null;
          pendingIntent = null;
          render();
        }
      }, 15000);
    }
    render();
    try {
      await onControl(command);
    } catch (error) {
      if (!isDisposed && instanceId === instanceAtSend && ticketCounter === ticket) {
        clearPendingIntent();
        errorMessage = error?.message || "窗帘控制失败，请重试。";
        render();
      }
    } finally {
      if (!isDisposed && instanceId === instanceAtSend && ticketCounter === ticket) {
        if (hasPresentation) {
          clearPendingIntent();
        } else if (pendingIntent) {
          pendingIntent.sending = false;
        }
        render();
      }
    }
  }
  function requestControl(requestedService, controlValue) {
    if (canControl()) {
      try {
        return sendControl(
          coverControl(
            {
              ...deviceState,
              ...resolvePresentation()
            },
            requestedService,
            controlValue
          )
        );
      } catch (controlError) {
        errorMessage = controlError.message;
        render();
      }
    }
  }
  positionSliderElement.addEventListener("pointerdown", () => {
    if (canAdjustSlider()) {
      isDragging = true;
    }
  });
  positionSliderElement.addEventListener("input", () => {
    if (!canAdjustSlider()) {
      return;
    }
    const sliderValue = Number(positionSliderElement.value);
    if (!Number.isFinite(sliderValue)) {
      return;
    }
    isDragging = true;
    draftPosition = Math.max(0, Math.min(100, Math.round(sliderValue)));
    const previewPresentation = onPreview(viewModel.item?.entityId, draftPosition);
    if (previewPresentation) {
      viewModel = {
        ...viewModel,
        presentation: previewPresentation
      };
    }
    render();
  });
  positionSliderElement.addEventListener("change", () => {
    if (draftPosition === null) {
      isDragging = false;
      syncSlider();
      return;
    }
    const committedPosition = draftPosition;
    draftPosition = null;
    isDragging = false;
    if (canAdjustSlider()) {
      return requestControl(
        viewModel.item?.coverKind === "dream" && deviceState.tiltSupported
          ? "set_cover_tilt_position"
          : "set_cover_position",
        committedPosition
      );
    }
    syncSlider();
  });
  function cancelPreview() {
    draftPosition = null;
    isDragging = false;
    const clearedPreview = onPreview(viewModel.item?.entityId, null);
    if (clearedPreview) {
      viewModel = {
        ...viewModel,
        presentation: clearedPreview
      };
    }
    render();
  }
  positionSliderElement.addEventListener("pointercancel", cancelPreview);
  positionSliderElement.addEventListener("blur", () => {
    if (draftPosition !== null) {
      cancelPreview();
    }
  });
  function render() {
    if (isDisposed) {
      return;
    }
    titleElement.textContent = viewModel.item?.label || deviceState.name || "窗帘";
    titleElement.title = titleElement.textContent;
    const presentation = resolvePresentation();
    statusElement.textContent = viewModel.editing
      ? "控制预览"
      : viewModel.item?.entityId
        ? deviceState.available
          ? coverStateLabel(presentation.state)
          : "设备不可用"
        : "尚未绑定设备";
    const isDreamCover = viewModel.item?.coverKind === "dream";
    rootElement.classList.toggle("is-dream", isDreamCover);
    bladeHintElement.hidden = !isDreamCover;
    if (isDreamCover && !viewModel.editing && deviceState.available) {
      statusElement.textContent =
        {
          open: "整体已开启",
          closed: "整体已关闭",
          opening: "整体正在开启",
          closing: "整体正在关闭"
        }[presentation.state] || statusElement.textContent;
    }
    if (
      !viewModel.editing &&
      deviceState.available &&
      presentation.state === "open" &&
      presentation.position > 0 &&
      presentation.position < 100
    ) {
      statusElement.textContent = isDreamCover ? "整体部分开启" : "部分开启";
    }
    positionSliderElement.setAttribute(
      "aria-label",
      isDreamCover ? "目标叶片角度" : "目标开合位置"
    );
    positionLegendElement.children[0].textContent = isDreamCover ? "一侧闭合" : "关闭";
    positionLegendElement.children[1].textContent = isDreamCover ? "反向闭合" : "打开";
    const displayPosition =
      draftPosition ??
      (isDreamCover
        ? deviceState.tiltPosition
        : presentation.estimated
          ? deviceState.position
          : presentation.position);
    positionOutputElement.textContent =
      displayPosition === null ? "未知" : Math.round(displayPosition) + "%";
    positionOutputElement.title =
      draftPosition !== null
        ? isDreamCover
          ? "目标叶片角度预览"
          : "目标开合位置预览"
        : isDreamCover
          ? "叶片角度：50% 为 90°打开"
          : "整体开合位置";
    positionOutputElement.setAttribute(
      "aria-label",
      isDreamCover ? "当前叶片角度" : "当前开合位置"
    );
    positionSliderElement.disabled = !canAdjustSlider();
    if (
      !viewModel.editing &&
      deviceState.available &&
      presentation.estimated &&
      !presentation.moving
    ) {
      statusElement.textContent = "在线";
    }
    if (
      isDreamCover &&
      !viewModel.editing &&
      deviceState.available &&
      (!deviceState.overallFeedbackAvailable ||
        presentation.awaitingArrival ||
        presentation.estimated) &&
      !presentation.moving
    ) {
      statusElement.textContent = "在线";
    }
    bladeHintElement.textContent = "叶片角度";
    positionSliderElement.title =
      isDreamCover && !canAdjustSlider() && deviceState.available
        ? deviceState.overallFeedbackAvailable
          ? "关闭到位后可调节叶片"
          : "暂不可调节叶片"
        : "";
    for (const {
      button: actionButton,
      service: actionService,
      capability: capability
    } of actionButtons) {
      actionButton.children[0].textContent =
        actionService === "stop_cover"
          ? "暂停"
          : isDreamCover
            ? actionService === "open_cover"
              ? "开启"
              : "关闭"
            : actionService === "open_cover"
              ? "打开"
              : "关闭";
      actionButton.title = isDreamCover
        ? "整体" + actionButton.children[0].textContent
        : actionButton.children[0].textContent;
      actionButton.setAttribute("aria-label", actionButton.title);
      actionButton.disabled = !canControl() || !deviceState[capability];
      const isActiveAction =
        !!pendingIntent && !pendingIntent.confirmed && pendingIntent.service === actionService;
      actionButton.setAttribute("aria-busy", String(isActiveAction));
      actionButton.classList.toggle(
        "is-active",
        (actionService === "open_cover" && presentation.opening) ||
          (actionService === "close_cover" && presentation.closing)
      );
    }
    const feedbackMessage = viewModel.error || errorMessage || "";
    feedbackElement.textContent = feedbackMessage;
    feedbackElement.hidden = !feedbackMessage;
    feedbackElement.classList.toggle("is-error", !!feedbackMessage);
    rootElement.setAttribute(
      "aria-busy",
      String(
        !!(viewModel.presentation
          ? viewModel.presentation.preview
          : pendingIntent && !pendingIntent.confirmed)
      )
    );
    syncSlider();
  }
  function update(nextViewModel = {}) {
    if (isDisposed) {
      return;
    }
    const nextEntityId = nextViewModel.item?.entityId || "";
    if (nextEntityId !== deviceState.entityId || nextViewModel.item?.id !== viewModel.item?.id) {
      if (isDragging) {
        onPreview(viewModel.item?.entityId, null);
      }
      instanceId++;
      railUnconfirmed = false;
      clearPendingIntent();
      draftPosition = null;
      isDragging = false;
      errorMessage = "";
      stateRevision = 0;
      stateSignature = "";
    }
    const previousState = deviceState;
    viewModel = nextViewModel;
    deviceState =
      nextViewModel.state?.entityId === nextEntityId &&
      typeof nextViewModel.state?.positionKnown == "boolean"
        ? nextViewModel.state
        : coverState(nextEntityId, nextViewModel.state, nextViewModel.item);
    if (
      deviceState.overallFeedbackAvailable &&
      (deviceState.position !== previousState.position || deviceState.state !== previousState.state)
    ) {
      railUnconfirmed = false;
    }
    if (!canAdjustSlider() && isDragging) {
      draftPosition = null;
      isDragging = false;
      onPreview(nextEntityId, null);
    }
    const nextSignature = JSON.stringify([
      deviceState.state,
      deviceState.position,
      deviceState.raw.updatedAt ?? deviceState.raw.last_updated,
      deviceState.raw.lastChanged ?? deviceState.raw.last_changed
    ]);
    if (stateSignature !== nextSignature) {
      stateSignature = nextSignature;
      stateRevision++;
    }
    if (!canControl()) {
      draftPosition = null;
      isDragging = false;
      clearPendingIntent();
    }
    if (!viewModel.presentation && pendingIntent && stateRevision > pendingIntent.revision) {
      const reachedTarget =
        pendingIntent.target !== null &&
        deviceState.position !== null &&
        Math.abs(deviceState.position - pendingIntent.target) <= 0.5;
      const stoppedConfirmed = pendingIntent.service === "stop_cover" && !deviceState.moving;
      const openedConfirmed =
        pendingIntent.service === "open_cover" &&
        deviceState.position === null &&
        deviceState.state === "open" &&
        pendingIntent.initialState !== "open";
      const settledAfterMove =
        pendingIntent.confirmed && pendingIntent.wasMoving && !deviceState.moving;
      if (reachedTarget || stoppedConfirmed || openedConfirmed || settledAfterMove) {
        clearPendingIntent();
      } else if (pendingIntent.target !== null) {
        const expectedDirection =
          pendingIntent.initialPosition === null
            ? pendingIntent.service === "open_cover"
              ? 1
              : pendingIntent.service === "close_cover"
                ? -1
                : 0
            : Math.sign(pendingIntent.target - pendingIntent.initialPosition);
        const movedAlongDirection =
          expectedDirection !== 0 &&
          deviceState.position !== null &&
          pendingIntent.initialPosition !== null &&
          (deviceState.position - pendingIntent.initialPosition) * expectedDirection > 0.5;
        const stateFlippedInDirection =
          deviceState.state !== pendingIntent.initialState &&
          ((expectedDirection > 0 && deviceState.opening) ||
            (expectedDirection < 0 && deviceState.closing));
        if (movedAlongDirection || stateFlippedInDirection) {
          pendingIntent.confirmed = true;
          if (intentTimeoutId !== null) {
            clearTimeout(intentTimeoutId);
          }
          intentTimeoutId = null;
        }
        if (pendingIntent.confirmed && deviceState.moving) {
          pendingIntent.wasMoving = true;
        }
      }
    }
    if (!isDragging) {
      draftPosition = null;
    }
    render();
  }
  function dispose() {
    if (!isDisposed) {
      isDisposed = true;
      if (isDragging) {
        onPreview(viewModel.item?.entityId, null);
      }
      instanceId++;
      clearPendingIntent();
      replaceChildren(rootElement);
    }
  }
  render();
  return {
    root: rootElement,
    update: update,
    dispose: dispose
  };
}
