/**
 * 窗帘控制面板（3D 详情弹窗 / 配置预览共用）。
 *
 * 把 coverState 归一化后的状态渲染成「开合位置滑杆 + 打开 / 暂停 / 关闭」，操作交给 onControl；
 * onPreview 让 3D 场景在拖动滑杆时实时预览目标位置。
 *
 * 约定：不直接访问后端，命令由 cover-state.js 的 coverControl 构造。梦幻帘（coverKind === "dream"）
 * 走「整体 + 叶片」两段语义，同一滑杆控制叶片角度，且必须整体关闭到位后才允许调整。
 */
import {
  coverState,
  coverControl,
  coverStateLabel,
  coverCanAdjustBlades
} from "./cover-state.js?v=20260921122709";
/**
 * 创建窗帘面板。
 */
export function createCoverPanel({
  element: hostElement,
  onControl: onControl = async () => {},
  onPreview: onPreview = () => {}
} = {}) {
  const ownerDocument = hostElement?.ownerDocument || globalThis.document;
  // 建元素并挂类名 / 文本；刻意用宿主的 ownerDocument，面板被放进别的文档
  // （弹窗、预览 iframe）时才不会造出属于外部文档的孤儿节点。
  const createElement = (tagName, className = "", textContent = "") => {
    const element = ownerDocument.createElement(tagName);
    element.className = className;
    element.textContent = textContent;
    return element;
  };
  /**
   * 清空容器并填入新子节点。
   * 优先用原生 replaceChildren；部分嵌入式 WebView 未实现该方法，
   * 因此保留手动实现的兜底分支。
   */
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
  // 位置统一用 0–100 的整数百分比，与 HA 的 current_position 口径一致。
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
  // 每个动作按钮绑定：按钮文案、要调用的服务、对应状态对象里的能力字段。
  for (const [actionLabel, controlService, capabilityKey] of [
    ["关闭", "close_cover", "closeSupported"],
    ["暂停", "stop_cover", "stopSupported"],
    ["打开", "open_cover", "openSupported"]
  ]) {
    const buttonElement = createElement("button");
    buttonElement.type = "button";
    // data-cover-action 是给样式与自动化测试定位用的稳定标记。
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
  // aria-live=polite：错误提示出现时不打断用户操作，等当前朗读结束再播报。
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
  // 先用空实体跑一次归一化，得到字段齐全的初始状态，后面读属性就不必判空。
  let deviceState = coverState("", null);
  let isDisposed = false;
  // 实体变化即自增，用于丢弃属于上一个实体的异步回包。
  let instanceId = 0;
  // 每次发命令取一个自增票号，只有「票号仍是最后一次」的回调才允许改状态。
  let ticketCounter = 0;
  // 梦幻帘专用：一旦执行过「打开」，整体位置的反馈就不再可信（导轨状态未知）。
  let railUnconfirmed = false;
  // 待确认的用户意图：记录发送时的状态与目标，用于判断命令是否真的生效。
  let pendingIntent = null;
  let intentTimeoutId = null;
  // 拖动中的本地草稿位置；松手后清空。
  let draftPosition = null;
  let isDragging = false;
  let errorMessage = "";
  // 状态修订号：每次 HA 回传的新状态与上次不同就自增，用于判断意图是否已被回应。
  let stateRevision = 0;
  let stateSignature = "";
  /** 是否允许下发命令。 */
  const canControl = () =>
    !isDisposed &&
    !viewModel.editing &&
    viewModel.item?.modelAvailable !== false &&
    deviceState.available;
  // 滑杆显示值的优先级：本地草稿 > 外部预览的目标 > 外部预览的当前位置 >
  // 待确认意图的目标（已确认则改用真实位置，因为命令即将到达目标，不必再显示目标值）。
  const resolveTargetPosition = () =>
    draftPosition ??
    viewModel.presentation?.targetPosition ??
    viewModel.presentation?.position ??
    (pendingIntent?.confirmed
      ? deviceState.position
      : (pendingIntent?.target ?? deviceState.position));
  // 展示状态优先用外部（3D 场景）给的版本；没有时从设备状态派生一份。
  // 派生时会按 railUnconfirmed 把「确认关闭」降级：梦幻帘开过之后就不能再相信关闭反馈。
  const resolvePresentation = () =>
    viewModel.presentation || {
      ...deviceState,
      closedConfirmed: deviceState.closedConfirmed && !railUnconfirmed
    };
  /**
   * 滑杆是否可用。
   * 梦幻帘只能调叶片，且必须满足 coverCanAdjustBlades 的门禁；
   * 其余窗帘则要求设备支持设置位置。
   */
  const canAdjustSlider = () =>
    canControl() &&
    (viewModel.item?.coverKind === "dream"
      ? coverCanAdjustBlades(deviceState, resolvePresentation()) &&
        (!!viewModel.presentation || !pendingIntent || !!pendingIntent.blade)
      : deviceState.positionSupported);
  /** 清掉待确认意图与它的超时定时器。 */
  function clearPendingIntent() {
    if (intentTimeoutId !== null) {
      clearTimeout(intentTimeoutId);
    }
    intentTimeoutId = null;
    pendingIntent = null;
  }
  /** 把滑杆的显示值、进度条颜色变量与无障碍文案同步到当前状态。 */
  function syncSlider() {
    const isDream = viewModel.item?.coverKind === "dream";
    // 梦幻帘的滑杆表示叶片角度，取值优先级与整体位置类似，但读的是 tilt 字段。
    const sliderPosition = isDream
      ? (draftPosition ??
        viewModel.presentation?.tiltTarget ??
        viewModel.presentation?.tiltPosition ??
        deviceState.tiltPosition)
      : resolveTargetPosition();
    positionSliderElement.value = String(sliderPosition ?? 0);
    // CSS 变量驱动已填充轨道长度；位置未知时按 0 绘制。
    positionSliderElement.style.setProperty(
      "--hb-cover-position-progress",
      (sliderPosition ?? 0) + "%"
    );
    // aria-valuetext 让读屏软件读出「目标 42%，当前位置 30%」而不是干巴巴的数字。
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
  /**
   * 发送一条窗帘命令，并登记待确认意图。
   */
  async function sendControl(command) {
    const instanceAtSend = instanceId;
    const ticket = ++ticketCounter;
    // 有外部 presentation 时（弹窗详情），目标是可预期到达的，
    // 因此不设超时，完全交给外部的展示状态驱动生命周期。
    const hasPresentation = !!viewModel.presentation;
    clearPendingIntent();
    draftPosition = null;
    isDragging = false;
    errorMessage = "";
    if (
      deviceState.dream &&
      ["open_cover", "close_cover", "stop_cover"].includes(command.service)
    ) {
      // 打开，或任何在「未确认全关」状态下发的整体命令，都会让整体位置反馈失去可信度。
      railUnconfirmed ||= command.service === "open_cover" || !deviceState.closedConfirmed;
    }
    // 登记意图：记录发送时的状态与推断出的目标位置，供 update() 判断是否生效。
    pendingIntent = {
      // blade 标记用于区分「调叶片」与「调整体」，梦幻帘的滑杆据此决定是否可用。
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
      // 目标位置由服务名推断：设位置取参数值，打开即 100，关闭即 0，暂停无目标。
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
      // 15 秒兜底：无外部展示状态时，命令若迟迟没有引起状态变化就放弃等待，
      // 否则界面会一直停留在「执行中」。
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
      // 只有仍是同一实体、且之后没有发过更新的命令时才展示错误。
      if (!isDisposed && instanceId === instanceAtSend && ticketCounter === ticket) {
        clearPendingIntent();
        errorMessage = error?.message || "窗帘控制失败，请重试。";
        render();
      }
    } finally {
      if (!isDisposed && instanceId === instanceAtSend && ticketCounter === ticket) {
        if (hasPresentation) {
          // 有外部展示状态时命令发出即视为意图结束，等待状态回传即可。
          clearPendingIntent();
        } else if (pendingIntent) {
          // 否则继续等待状态变化确认；这里只是标记「已经发出」。
          pendingIntent.sending = false;
        }
        render();
      }
    }
  }
  /**
   * 先本地校验再发送控制命令。
   * 校验前先把展示状态合并进设备状态：梦幻帘的可调叶片判断依赖展示层的 closedConfirmed
   * （可能已被 railUnconfirmed 降级），只传 deviceState 会漏判。不可控时返回 undefined。
   */
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
  // pointerdown 提前进入拖动态：即使 input 事件还没触发，也让后续逻辑知道用户在操作滑杆。
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
    // 拖动过程中就把目标位置交给 3D 场景做实时预览；预览状态回填到 viewModel，
    // 这样滑杆与场景显示的是同一份数据，不会互相打架。
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
    // 没有草稿说明这次 change 不是拖动引起的（例如键盘操作后直接触发），只同步显示。
    if (draftPosition === null) {
      isDragging = false;
      syncSlider();
      return;
    }
    const committedPosition = draftPosition;
    draftPosition = null;
    isDragging = false;
    if (canAdjustSlider()) {
      // 梦幻帘且支持 tilt 时，滑杆对应的是叶片角度服务；其余情况是整体位置。
      return requestControl(
        viewModel.item?.coverKind === "dream" && deviceState.tiltSupported
          ? "set_cover_tilt_position"
          : "set_cover_position",
        committedPosition
      );
    }
    syncSlider();
  });
  /** 取消拖动：丢弃草稿并通知 3D 场景取消预览。 */
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
  // pointercancel（手势被系统抢走）与 blur（焦点离开）都要取消预览，
  // 否则滑杆会停在半途的位置上，3D 预览也会一直挂着。
  positionSliderElement.addEventListener("pointercancel", cancelPreview);
  positionSliderElement.addEventListener("blur", () => {
    if (draftPosition !== null) {
      cancelPreview();
    }
  });
  /** 按当前 viewModel 与 deviceState 重绘面板。 */
  function render() {
    if (isDisposed) {
      return;
    }
    titleElement.textContent = viewModel.item?.label || deviceState.name || "窗帘";
    titleElement.title = titleElement.textContent;
    const presentation = resolvePresentation();
    // 状态文案优先级：编辑预览 > 未绑定 > 不可用 > 状态文案。
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
      // 梦幻帘把状态文案统一加上「整体」前缀，与叶片角度区分开。
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
      // state 为 open 但位置在中间：说明是行程中停住的，文案要区别于完全打开。
      statusElement.textContent = isDreamCover ? "整体部分开启" : "部分开启";
    }
    positionSliderElement.setAttribute(
      "aria-label",
      isDreamCover ? "目标叶片角度" : "目标开合位置"
    );
    // 梦幻帘的 50% 是「90° 打开」，两端分别是两种闭合方向，因此图例文案不同。
    positionLegendElement.children[0].textContent = isDreamCover ? "一侧闭合" : "关闭";
    positionLegendElement.children[1].textContent = isDreamCover ? "反向闭合" : "打开";
    // 输出值的优先级：拖动草稿 > （梦幻帘）叶片角度 > （估算位置时）设备位置 > 展示位置。
    // 估算位置不可信，所以宁可显示设备上报值。
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
      // 位置靠估算且没在动：反馈不可信，只能确定设备在线，文案降级为「在线」。
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
      // 梦幻帘同理：整体反馈不可用 / 尚未到位 / 位置为估算时，同样只报「在线」。
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
      // 梦幻帘用「开启 / 关闭」，普通窗帘用「打开 / 关闭」，避免与叶片开合混淆。
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
      // aria-busy 表示该动作正在等待确认；is-active 让样式上的运动方向动画与之一致。
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
    // aria-busy：有外部预览时看预览是否在生效，否则看是否有未确认的意图。
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
  /**
   * 用新的视图模型刷新面板。
   */
  function update(nextViewModel = {}) {
    if (isDisposed) {
      return;
    }
    const nextEntityId = nextViewModel.item?.entityId || "";
    // 实体变了或换了绑定项：作废旧回包与所有本地状态（包括正在进行的 3D 预览）。
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
    // 上游可能已经传了归一化状态（用 positionKnown 是否为布尔值识别），避免重复归一化。
    deviceState =
      nextViewModel.state?.entityId === nextEntityId &&
      typeof nextViewModel.state?.positionKnown == "boolean"
        ? nextViewModel.state
        : coverState(nextEntityId, nextViewModel.state, nextViewModel.item);
    if (
      deviceState.overallFeedbackAvailable &&
      (deviceState.position !== previousState.position || deviceState.state !== previousState.state)
    ) {
      // 整体位置反馈恢复可信（或位置发生了变化）时，解除梦幻帘的导轨未知标记。
      railUnconfirmed = false;
    }
    // 状态变化导致滑杆不可用时，立刻收起草稿与 3D 预览，不能让用户对着不可控的控件操作。
    if (!canAdjustSlider() && isDragging) {
      draftPosition = null;
      isDragging = false;
      onPreview(nextEntityId, null);
    }
    // 状态签名包含时间戳字段：即使 state 与 position 都没变，
    // 只要 HA 又推了一次（last_updated 变了）也算一次新状态。
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
    // 只有「没有外部展示状态」时才由本面板自行对账意图：
    // 有 presentation 时生命周期的判断权在外部的展示状态里。
    if (!viewModel.presentation && pendingIntent && stateRevision > pendingIntent.revision) {
      // 四种「已经达成目标」的判定，命中任一即认为命令生效：1) 到达目标位置（0.5% 容差，
      // 覆盖设备取整误差）；2) 暂停命令且已停止移动；3) 打开命令但设备不报位置，且 state 从
      // 非 open 翻转为 open；4) 此前已确认在运动，现在停下来了。
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
        // 尚未到达目标：判断设备是否「朝目标方向动起来了」。
        // 初始位置已知时用位置差的方向，未知时用服务名推断方向。
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
          // 一旦确认动起来了就撤掉超时：接下来只需等它停稳。
          pendingIntent.confirmed = true;
          if (intentTimeoutId !== null) {
            clearTimeout(intentTimeoutId);
          }
          intentTimeoutId = null;
        }
        if (pendingIntent.confirmed && deviceState.moving) {
          // 记录「确实动过」，这样停下时才能区分「到达目标」与「根本没动」。
          pendingIntent.wasMoving = true;
        }
      }
    }
    // 不在拖动中就丢弃草稿，避免旧草稿盖住新上报的位置。
    if (!isDragging) {
      draftPosition = null;
    }
    render();
  }
  // 释放面板：拖拽中先把预览位置撤回（onPreview(null)），再置位 isDisposed、
  // 自增 instanceId 让在途回包失效，最后清定时器与 DOM。
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
