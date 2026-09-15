import {
  climateState,
  climateControl,
  climatePowerControl,
  climateModeLabel,
  climateSwingModeLabel
} from "./climate-state.js?v=20260915211726";
const FAN_MODE_LABELS = {
  auto: "自动",
  low: "低风",
  medium: "中风",
  high: "高风",
  middle: "中风",
  quiet: "静音",
  silent: "静音",
  turbo: "强劲",
  diffuse: "柔风",
  focus: "集中"
};
export function createClimatePanel({
  element: hostElement,
  onControl: onControl = async () => {}
} = {}) {
  const ownerDocument = hostElement?.ownerDocument || globalThis.document;
  const createElement = (tagName, className, textContent = "") => {
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
  const rootElement = hostElement || createElement("section", "");
  rootElement.classList.add("i3d-climate-panel");
  const headingElement = createElement("div", "i3d-climate-heading");
  const titleElement = createElement("h3", "", "空调");
  const statusElement = createElement("p", "", "尚未绑定设备");
  const powerButton = createElement("button", "i3d-climate-power");
  powerButton.type = "button";
  const headingTextElement = createElement("div", "i3d-climate-heading-text");
  headingTextElement.append(titleElement, statusElement);
  headingElement.append(headingTextElement, powerButton);
  const thermostatSlotElement = createElement("div", "i3d-climate-thermostat-slot");
  const thermostatElement = createElement("section", "hb-climate-thermostat");
  const decreaseButton = createElement("button", "hb-climate-temperature-step", "−");
  const increaseButton = createElement("button", "hb-climate-temperature-step", "+");
  decreaseButton.type = increaseButton.type = "button";
  decreaseButton.setAttribute("aria-label", "降低设定温度");
  increaseButton.setAttribute("aria-label", "提高设定温度");
  const temperatureContentElement = createElement("div", "i3d-climate-temperature-content");
  const targetOutputElement = createElement("output", "i3d-climate-target");
  const currentTemperatureElement = createElement("span", "", "当前温度 --");
  targetOutputElement.setAttribute("aria-label", "设定温度");
  temperatureContentElement.append(
    createElement("small", "", "设定温度"),
    targetOutputElement,
    currentTemperatureElement
  );
  thermostatElement.append(decreaseButton, temperatureContentElement, increaseButton);
  thermostatSlotElement.append(thermostatElement);
  const rangeHintElement = createElement("p", "i3d-climate-temperature-interval");
  const groupsElement = createElement("div", "i3d-climate-groups");
  const emptyElement = createElement("p", "i3d-climate-empty");
  const errorElement = createElement("p", "i3d-climate-error");
  emptyElement.setAttribute("role", "status");
  errorElement.setAttribute("role", "status");
  replaceChildren(
    rootElement,
    headingElement,
    thermostatSlotElement,
    rangeHintElement,
    groupsElement,
    emptyElement,
    errorElement
  );
  let viewModel = {};
  let deviceState = climateState("", null);
  let isDisposed = false;
  let isSending = false;
  let errorMessage = "";
  let instanceId = 0;
  let draftTemperature = null;
  let temperatureTimeoutId = null;
  let lastPowerMode = "";
  let renderedGroupsSignature = "";
  let choiceButtons = [];
  const canControl = () =>
    !isDisposed && !viewModel.editing && !viewModel.busy && !isSending && deviceState.available;
  const clearTemperatureDraft = () => {
    if (temperatureTimeoutId !== null) {
      clearTimeout(temperatureTimeoutId);
    }
    temperatureTimeoutId = null;
    draftTemperature = null;
  };
  function resolveTemperature() {
    return draftTemperature ?? deviceState.temperature;
  }
  function syncTemperature(temperature = resolveTemperature()) {
    targetOutputElement.value = temperature === null ? "" : String(temperature);
    targetOutputElement.textContent = temperature === null ? "--" : temperature + "°C";
    currentTemperatureElement.textContent =
      deviceState.currentTemperature === null
        ? "当前温度 --"
        : "当前温度 " + deviceState.currentTemperature + "°C";
    decreaseButton.disabled =
      !canControl() || temperature === null || temperature <= deviceState.minimum;
    increaseButton.disabled =
      !canControl() || temperature === null || temperature >= deviceState.maximum;
  }
  async function sendControl(command) {
    if (!canControl()) {
      return;
    }
    const instanceAtSend = instanceId;
    isSending = true;
    errorMessage = "";
    if (command.service === "set_temperature") {
      clearTemperatureDraft();
      draftTemperature = command.data.temperature;
      temperatureTimeoutId = setTimeout(() => {
        temperatureTimeoutId = null;
        draftTemperature = null;
        if (!isDisposed) {
          render();
        }
      }, 8000);
    }
    render();
    try {
      await onControl(command);
    } catch (error) {
      if (!isDisposed && instanceAtSend === instanceId) {
        errorMessage = error?.message || "空调控制失败，请重试。";
        clearTemperatureDraft();
      }
    } finally {
      if (!isDisposed && instanceAtSend === instanceId) {
        isSending = false;
        render();
      }
    }
  }
  function requestControl(requestedService, value) {
    if (canControl()) {
      try {
        return sendControl(climateControl(deviceState, requestedService, value));
      } catch (controlError) {
        errorMessage = controlError.message;
        render();
      }
    }
  }
  function togglePower({ toggle: toggle = true } = {}) {
    if (!canControl() || (!toggle && deviceState.on)) {
      return Promise.resolve(false);
    }
    try {
      return sendControl(
        climatePowerControl(deviceState, toggle ? !deviceState.on : true, lastPowerMode)
      );
    } catch (powerError) {
      errorMessage = powerError.message;
      render();
      return Promise.resolve(false);
    }
  }
  powerButton.addEventListener("click", () => togglePower());
  decreaseButton.addEventListener("click", () =>
    requestControl(
      "set_temperature",
      (resolveTemperature() ?? deviceState.minimum) - deviceState.step
    )
  );
  increaseButton.addEventListener("click", () =>
    requestControl(
      "set_temperature",
      (resolveTemperature() ?? deviceState.minimum) + deviceState.step
    )
  );
  function buildChoiceGroups() {
    replaceChildren(groupsElement);
    choiceButtons = [];
    for (const [groupLabel, optionValues, field, service, optionLabels] of [
      [
        "运行模式",
        deviceState.modes.filter(mode => mode !== "off"),
        "mode",
        "set_hvac_mode",
        Object.fromEntries(deviceState.modes.map(fanMode => [fanMode, climateModeLabel(fanMode)]))
      ],
      ["风速", deviceState.fanModes, "fanMode", "set_fan_mode", FAN_MODE_LABELS],
      [
        "摆风",
        deviceState.swingModes,
        "swingMode",
        "set_swing_mode",
        Object.fromEntries(
          deviceState.swingModes.map(swingMode => [swingMode, climateSwingModeLabel(swingMode)])
        )
      ]
    ]) {
      if (!optionValues.length) {
        continue;
      }
      const groupElement = createElement("section", "i3d-climate-option-group");
      const groupHeadingElement = createElement("h4", "", groupLabel);
      groupElement.append(groupHeadingElement);
      const choicesElement = createElement("div", "i3d-climate-choices");
      choicesElement.setAttribute("role", "group");
      choicesElement.setAttribute("aria-label", groupLabel);
      for (const optionValue of optionValues) {
        const choiceButton = createElement(
          "button",
          "i3d-climate-choice",
          optionLabels[optionValue] || optionValue
        );
        choiceButton.type = "button";
        choiceButton.addEventListener("click", () => requestControl(service, optionValue));
        choiceButtons.push({
          element: choiceButton,
          field: field,
          value: optionValue
        });
        choicesElement.append(choiceButton);
      }
      groupElement.append(choicesElement);
      groupsElement.append(groupElement);
    }
  }
  function render() {
    if (isDisposed) {
      return;
    }
    const item = viewModel.item || {};
    const hasEntity = !!item.entityId;
    const isControllable = canControl();
    titleElement.textContent = item.label || deviceState.name || "空调";
    titleElement.title = titleElement.textContent;
    statusElement.textContent = viewModel.editing
      ? "控制预览"
      : hasEntity
        ? deviceState.available
          ? deviceState.on
            ? climateModeLabel(deviceState.mode)
            : "已关闭"
          : "设备不可用"
        : "尚未绑定设备";
    rootElement.dataset.climateMode = deviceState.available ? deviceState.visualMode : "off";
    rootElement.classList.toggle("is-on", deviceState.available && deviceState.on);
    rootElement.classList.toggle("is-running", deviceState.available && deviceState.running);
    powerButton.textContent = deviceState.on ? "关闭" : "开启";
    rootElement.setAttribute("aria-busy", String(isSending || !!viewModel.busy));
    powerButton.disabled =
      !isControllable ||
      !deviceState.modes.some(modeId => modeId !== "off") ||
      (deviceState.on && !deviceState.modes.includes("off"));
    powerButton.setAttribute("aria-pressed", String(deviceState.on));
    powerButton.setAttribute(
      "aria-label",
      titleElement.textContent + "，" + (deviceState.on ? "关闭空调" : "开启空调")
    );
    if (deviceState.on) {
      lastPowerMode = deviceState.mode;
    }
    thermostatSlotElement.hidden = targetOutputElement.hidden = !deviceState.temperatureSupported;
    syncTemperature();
    rangeHintElement.hidden = !deviceState.rangeSupported || deviceState.temperatureSupported;
    rangeHintElement.textContent =
      "设定温区 " +
      (deviceState.targetLow ?? "--") +
      "–" +
      (deviceState.targetHigh ?? "--") +
      "°C · 当前 " +
      (deviceState.currentTemperature ?? "--") +
      "°C";
    const groupsSignature = JSON.stringify([
      deviceState.entityId,
      deviceState.modes,
      deviceState.fanModes,
      deviceState.swingModes
    ]);
    if (renderedGroupsSignature !== groupsSignature) {
      renderedGroupsSignature = groupsSignature;
      buildChoiceGroups();
    }
    for (const choice of choiceButtons) {
      choice.element.disabled = !isControllable;
      choice.element.setAttribute(
        "aria-pressed",
        String(deviceState[choice.field] === choice.value)
      );
    }
    emptyElement.hidden =
      deviceState.available && (deviceState.temperatureSupported || choiceButtons.length > 0);
    emptyElement.textContent = hasEntity
      ? deviceState.available
        ? "设备尚未提供控制能力，状态到达后会自动更新。"
        : "正在等待设备状态，连接恢复后会自动更新。"
      : "绑定空调实体后显示设备控制。";
    errorElement.textContent = viewModel.error || errorMessage;
    errorElement.hidden = !errorElement.textContent;
  }
  function update(nextViewModel = {}) {
    if (isDisposed) {
      return;
    }
    const nextEntityId = nextViewModel.item?.entityId || "";
    if (nextEntityId !== deviceState.entityId) {
      instanceId++;
      isSending = false;
      errorMessage = "";
      lastPowerMode = "";
      clearTemperatureDraft();
    }
    viewModel = nextViewModel;
    deviceState =
      nextViewModel.state?.entityId === nextEntityId && Array.isArray(nextViewModel.state?.modes)
        ? nextViewModel.state
        : climateState(nextEntityId, nextViewModel.state);
    if (
      draftTemperature !== null &&
      deviceState.temperature !== null &&
      Math.abs(deviceState.temperature - draftTemperature) < deviceState.step / 2 + 0.001
    ) {
      clearTemperatureDraft();
    }
    render();
  }
  function dispose() {
    if (!isDisposed) {
      isDisposed = true;
      instanceId++;
      clearTemperatureDraft();
      replaceChildren(rootElement);
    }
  }
  render();
  return {
    root: rootElement,
    update: update,
    power: togglePower,
    dispose: dispose
  };
}
