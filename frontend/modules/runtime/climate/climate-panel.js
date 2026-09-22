/**
 * 空调控制面板（3D 详情弹窗 / 配置预览共用）。
 *
 * 把 climateState 归一化后的状态渲染成一张控制卡（开关、设定温度、运行模式、风速、摆风），
 * 用户操作交给 onControl 发送。对外提供 createClimatePanel。面板不直接访问后端，所有命令
 * 通过 onControl(command) 发出，命令结构由 climate-state.js 统一构造。
 */
import {
  climateState,
  climateControl,
  climatePowerControl,
  climateModeLabel,
  climateSwingModeLabel,
  createClimateModeHistory
} from "./climate-state.js?v=2609221053";
// DOM 工厂（元素 / 按钮 / replaceChildren 兜底）的唯一实现；运行侧不能写裸 `/static/...` 的
// 静态 import，故经 static-helpers 桥取用。
import { createDomFactory } from "../core/static-helpers.js?v=2609221053";
/**
 * HA 的 fan_mode 取值 → 中文文案。
 * 各厂商写法不一（medium/middle 都是中风），故常见写法都列上；未收录的原样显示。
 */
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
/**
 * 创建空调面板。
 */
export function createClimatePanel({
  element: hostElement,
  onControl: onControl = async () => {},
  modeHistory: modeHistory = createClimateModeHistory()
} = {}) {
  // 刻意用宿主的 ownerDocument：面板被放进别的文档（弹窗、预览 iframe）时才不会造出属于外部
  // 文档的孤儿节点。工厂实现见 /static/shared/dom-factory.js。
  const { el: createElement, replaceChildren } = createDomFactory(
    hostElement?.ownerDocument || globalThis.document
  );
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
  // 温度控温区独立成 slot：设备不支持调温时整块隐藏，不用逐个控件隐藏。
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
  // role=status：占位说明与错误提示变化时由读屏软件播报。
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
  // 用一个空实体先跑一遍归一化，得到「全部字段都存在」的初始状态，
  // 这样 render 里可以放心地直接读 deviceState.xxx 而不必到处判空。
  let deviceState = climateState("", null);
  let isDisposed = false;
  let isSending = false;
  let errorMessage = "";
  // 每次绑定的实体变化就自增，用来丢弃属于上一个实体的异步回包。
  let instanceId = 0;
  // 本地乐观温度：用户按下 +/- 后立刻显示，等 HA 回传对齐后再丢弃。
  let draftTemperature = null;
  let temperatureTimeoutId = null;
  // 选项组的结构签名，避免每次 render 都重建 DOM。
  let renderedGroupsSignature = "";
  let choiceButtons = [];
  /** 当前是否允许下发命令：未销毁、非编辑预览、非忙碌、并已拿到可用状态。 */
  const canControl = () =>
    !isDisposed && !viewModel.editing && !viewModel.busy && !isSending && deviceState.available;
  /** 取消本地温度草稿（含定时器）；不发命令，只清状态。 */
  const clearTemperatureDraft = () => {
    if (temperatureTimeoutId !== null) {
      clearTimeout(temperatureTimeoutId);
    }
    temperatureTimeoutId = null;
    draftTemperature = null;
  };
  /** 当前应显示的温度：优先本地草稿，其次设备上报值。 */
  function resolveTemperature() {
    return draftTemperature ?? deviceState.temperature;
  }
  /**
   * 刷新温度区的显示与按钮可用性。
   */
  function syncTemperature(temperature = resolveTemperature()) {
    // output 同时写 value 与 textContent：前者给表单语义，后者保证老浏览器也显示文本。
    targetOutputElement.value = temperature === null ? "" : String(temperature);
    targetOutputElement.textContent = temperature === null ? "--" : temperature + "°C";
    currentTemperatureElement.textContent =
      deviceState.currentTemperature === null
        ? "当前温度 --"
        : "当前温度 " + deviceState.currentTemperature + "°C";
    // 到达上下限就禁用对应按钮，避免用户点了才被告知越界。
    decreaseButton.disabled =
      !canControl() || temperature === null || temperature <= deviceState.minimum;
    increaseButton.disabled =
      !canControl() || temperature === null || temperature >= deviceState.maximum;
  }
  /**
   * 发送一条命令并维护发送中的界面状态。
   */
  async function sendControl(command) {
    if (!canControl()) {
      return;
    }
    const instanceAtSend = instanceId;
    isSending = true;
    errorMessage = "";
    if (command.service === "set_temperature") {
      // 调温做本地乐观：先清掉旧草稿，把新值直接标上，8 秒内没等到 HA 对齐就放弃。
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
      // 实体已经换人或面板已销毁时，这个错误不再展示（属于过期回包）。
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
  /**
   * 先本地校验再发送控制命令；不可控时返回 undefined。
   */
  function requestControl(requestedService, value) {
    if (canControl()) {
      try {
        return sendControl(climateControl(deviceState, requestedService, value));
      } catch (controlError) {
        // climateControl 会在设备不支持该项时抛错，这里转成界面提示而不是弹出异常。
        errorMessage = controlError.message;
        render();
      }
    }
  }
  /**
   * 切换开关机。
   */
  function togglePower({ toggle: toggle = true } = {}) {
    // toggle=false 且设备已开时不重复下发，避免把「开机」按钮当成无操作。
    if (!canControl() || (!toggle && deviceState.on)) {
      return Promise.resolve(false);
    }
    try {
      return sendControl(
        // 开机时从模式历史里取「上次用的模式」交给命令构造器；
        // 面板不再自己维护这个状态，历史来源统一在 climate-state 里。
        climatePowerControl(
          deviceState,
          toggle ? !deviceState.on : true,
          modeHistory.get(deviceState.entityId)
        )
      );
    } catch (powerError) {
      errorMessage = powerError.message;
      render();
      return Promise.resolve(false);
    }
  }
  powerButton.addEventListener("click", () => togglePower());
  // 步进按设备声明的 step：没有读数时从下限起步，保证第一次点击落在合法区间内。
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
  /** 按设备能力重建「运行模式 / 风速 / 摆风」三组选项按钮。 */
  function buildChoiceGroups() {
    replaceChildren(groupsElement);
    choiceButtons = [];
    // 每行依次是：分组标题、可选值、状态对象上的字段名、要调用的服务、取值 → 文案映射。
    for (const [groupLabel, optionValues, field, service, optionLabels] of [
      [
        "运行模式",
        // 模式组里排除 off：关机由面板右上角的开关按钮负责，避免两种入口语义重叠。
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
      // 设备没提供该项能力就不渲染整组。
      if (!optionValues.length) {
        continue;
      }
      const groupElement = createElement("section", "i3d-climate-option-group");
      const groupHeadingElement = createElement("h4", "", groupLabel);
      groupElement.append(groupHeadingElement);
      const choicesElement = createElement("div", "i3d-climate-choices");
      // 用 group + aria-label 让读屏软件播报分组名，而不是只读出一串按钮。
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
  /** 按当前 viewModel 与 deviceState 重绘整块面板。 */
  function render() {
    if (isDisposed) {
      return;
    }
    const item = viewModel.item || {};
    const hasEntity = !!item.entityId;
    const isControllable = canControl();
    titleElement.textContent = item.label || deviceState.name || "空调";
    titleElement.title = titleElement.textContent;
    // 状态文案的优先级：编辑预览 > 未绑定 > 不可用 > 开关态（开机显示模式名）。
    statusElement.textContent = viewModel.editing
      ? "控制预览"
      : hasEntity
        ? deviceState.available
          ? deviceState.on
            ? climateModeLabel(deviceState.mode)
            : "已关闭"
          : "设备不可用"
        : "尚未绑定设备";
    // data-climate-mode 是 CSS 动画的钩子（冷 / 热 / 其它 / 关），样式按它切换气流表现。
    rootElement.dataset.climateMode = deviceState.available ? deviceState.visualMode : "off";
    rootElement.classList.toggle("is-on", deviceState.available && deviceState.on);
    // is-running 与 is-on 不同：开机但处于待机（hvac_action 为 idle）时不应animate。
    rootElement.classList.toggle("is-running", deviceState.available && deviceState.running);
    powerButton.textContent = deviceState.on ? "关闭" : "开启";
    rootElement.setAttribute("aria-busy", String(isSending || !!viewModel.busy));
    // 开关按钮的禁用条件：不可控、设备既没有 turn_on 能力也没有可用模式（除 off 外），
    // 或设备已开却没有 off 模式（无法关机）。
    powerButton.disabled =
      !isControllable ||
      (!deviceState.turnOnSupported &&
        !deviceState.modes.some(modeId => modeId !== "off")) ||
      (deviceState.on && !deviceState.modes.includes("off"));
    powerButton.setAttribute("aria-pressed", String(deviceState.on));
    powerButton.setAttribute(
      "aria-label",
      titleElement.textContent + "，" + (deviceState.on ? "关闭空调" : "开启空调")
    );
    thermostatSlotElement.hidden = targetOutputElement.hidden = !deviceState.temperatureSupported;
    syncTemperature();
    // 温区提示只在「支持温区但不支持单点调温」时出现，否则会与控温区重复。
    rangeHintElement.hidden = !deviceState.rangeSupported || deviceState.temperatureSupported;
    rangeHintElement.textContent =
      "设定温区 " +
      (deviceState.targetLow ?? "--") +
      "–" +
      (deviceState.targetHigh ?? "--") +
      "°C · 当前 " +
      (deviceState.currentTemperature ?? "--") +
      "°C";
    // 选项组只在实体或能力列表变化时重建；其余情况复用按钮、只改按下态。
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
    // 有可用状态且（能调温或至少有一组可选按钮）时无需占位说明。
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
  /**
   * 用新的视图模型刷新面板。
   */
  function update(nextViewModel = {}) {
    if (isDisposed) {
      return;
    }
    const nextEntityId = nextViewModel.item?.entityId || "";
    // 换了实体：作废在途命令的回包（instanceId 自增）并清空与旧实体相关的本地状态。
    if (nextEntityId !== deviceState.entityId) {
      instanceId++;
      isSending = false;
      errorMessage = "";
      clearTemperatureDraft();
    }
    viewModel = nextViewModel;
    // 上游可能已经传了归一化后的状态（例如同一份数据被多个面板共享），
    // 这里用「entityId 一致 + modes 是数组」两个特征识别，避免重复归一化。
    deviceState =
      nextViewModel.state?.entityId === nextEntityId && Array.isArray(nextViewModel.state?.modes)
        ? nextViewModel.state
        : climateState(nextEntityId, nextViewModel.state);
    // 面板每见到一份真实状态就把「上次用的模式」记下来；配置预览里的占位状态不算。
    if (!nextViewModel.editing) {
      modeHistory.observe(nextEntityId, deviceState.raw);
    }
    // 设备上报值已经追上本地草稿（误差在半步以内）就丢弃草稿，
    // 用真实状态渲染，避免长时间停留在乐观值上。
    if (
      draftTemperature !== null &&
      deviceState.temperature !== null &&
      Math.abs(deviceState.temperature - draftTemperature) < deviceState.step / 2 + 0.001
    ) {
      clearTemperatureDraft();
    }
    render();
  }
  // 释放面板：置 isDisposed 并自增 instanceId，让所有在途异步回包失效，
  // 再清掉温度草稿与 DOM，避免面板销毁后仍被旧设备的响应改写。
  function dispose() {
    if (!isDisposed) {
      isDisposed = true;
      // 自增后所有在途回包都不再触发渲染。
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
