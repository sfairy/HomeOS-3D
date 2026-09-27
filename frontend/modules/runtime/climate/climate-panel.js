/**
 * 空调控制面板（3D 详情弹窗 / 配置预览共用）。
 */
import {
  climateState,
  climateControl,
  climatePowerControl,
  climateModeLabel,
  climateSwingModeLabel,
  createClimateModeHistory,
  purifierControl
} from "./climate-state.js?v=2609271508";
import { createDomFactory } from "../core/static-helpers.js?v=2609271508";
// 「附加功能」卡片网格：与通用设备弹窗（device/device-panel.js）共用同一份渲染器。
import { createPurifierExtras } from "./purifier-extras.js?v=2609271508";
/**
 * HA 的 fan_mode 取值 → 中文文案。
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
const PURIFIER_PRESET_LABELS = {
  auto: "自动",
  sleep: "睡眠",
  favorite: "最爱",
  favorite_level: "最爱",
  none: "标准",
  normal: "标准",
  manual: "手动",
  low: "低",
  medium: "中",
  middle: "中",
  high: "高",
  strong: "强劲",
  turbo: "强劲",
  silent: "静音",
  quiet: "静音"
};
/**
 * 分组标题前的小图标。
 */
const GROUP_GLYPHS = {
  运行模式: "◉",
  风速: "≈",
  摆风: "↕",
  摆动: "↻",
  方向: "⇄"
};
/**
 * 风速档位按钮占几列。
 */
function speedLevelColumnCount(levelCount) {
  const maxColumns = Math.min(levelCount, 6);
  const minColumns = Math.max(1, Math.ceil(levelCount / 2));
  let bestColumns = maxColumns;
  let bestFill = -1;
  for (let columns = maxColumns; columns >= minColumns; columns--) {
    const lastRowCount = levelCount % columns === 0 ? columns : levelCount % columns;
    const fill = lastRowCount / columns;
    if (fill > bestFill) {
      bestFill = fill;
      bestColumns = columns;
    }
  }
  return bestColumns;
}
/**
 * 创建空调面板。
 */
export function createClimatePanel({
  element: hostElement,
  onControl: onControl = async () => {},
  // 卡片网格排序 / 改尺寸后的布局回传（净化器才有卡片）。与 onControl 一样由舞台注入：
  onLayout: onLayout = () => {},
  modeHistory: modeHistory = createClimateModeHistory()
} = {}) {
  const ownerDocument = hostElement?.ownerDocument || globalThis.document;
  const { el: createElement, replaceChildren } = createDomFactory(ownerDocument);
  const rootElement = hostElement || createElement("section", "");
  rootElement.classList.add("i3d-climate-panel");
  const headingElement = createElement("div", "i3d-climate-heading");
  const titleElement = createElement("h3", "", "空调");
  const statusElement = createElement("p", "", "尚未绑定设备");
  const powerButton = createElement("button", "i3d-climate-power");
  powerButton.type = "button";
  const headingTextElement = createElement("div", "i3d-climate-heading-text");
  headingTextElement.append(titleElement, statusElement);
  // 标题行保持原版两件套（文字 + 电源）。设备图形不放这里 —— 见下文的说明。
  headingElement.append(headingTextElement, powerButton);
  // 设备图形：结构照 2D 弹窗那两个组件，一比一移植：
  const purifierElement = createElement("div", "i3d-climate-purifier");
  purifierElement.setAttribute("aria-hidden", "true");
  const purifierAuraElement = createElement("i", "i3d-climate-purifier-aura");
  const purifierAirflowElement = createElement("span", "i3d-climate-purifier-airflow");
  for (let airflowIndex = 0; airflowIndex < 4; airflowIndex += 1) {
    purifierAirflowElement.append(createElement("i", ""));
  }
  const purifierBodyElement = createElement("span", "i3d-climate-purifier-body");
  const purifierTopElement = createElement("i", "i3d-climate-purifier-top");
  const purifierVentElement = createElement("i", "i3d-climate-purifier-vent");
  const purifierDisplayElement = createElement("span", "i3d-climate-purifier-display");
  const purifierDisplayTextElement = createElement("strong", "", "OFF");
  purifierDisplayElement.append(purifierDisplayTextElement);
  purifierBodyElement.append(purifierTopElement, purifierVentElement, purifierDisplayElement);
  purifierElement.append(purifierAuraElement, purifierAirflowElement, purifierBodyElement);
  const airconElement = createElement("div", "i3d-climate-aircon");
  airconElement.setAttribute("aria-hidden", "true");
  const airconUnitElement = createElement("span", "i3d-climate-aircon-unit");
  const airconBrandElement = createElement("span", "i3d-climate-aircon-brand", "SMART AIR");
  const airconDisplayElement = createElement("strong", "i3d-climate-aircon-display", "OFF");
  const airconVentElement = createElement("span", "i3d-climate-aircon-vent");
  for (let louverIndex = 0; louverIndex < 5; louverIndex += 1) {
    airconVentElement.append(createElement("i", ""));
  }
  airconUnitElement.append(airconBrandElement, airconDisplayElement, airconVentElement);
  const airconAirflowElement = createElement("span", "i3d-climate-aircon-airflow");
  for (let airconAirflowIndex = 0; airconAirflowIndex < 3; airconAirflowIndex += 1) {
    airconAirflowElement.append(createElement("i", ""));
  }
  airconElement.append(airconUnitElement, airconAirflowElement);
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
  // 表盘：环形进度 + 中心读数，同时它就是「设定温度」这个滑块本体。
  const dialElement = createElement("div", "i3d-climate-dial");
  dialElement.setAttribute("role", "slider");
  dialElement.tabIndex = 0;
  dialElement.setAttribute("aria-label", "设定温度");
  temperatureContentElement.setAttribute("aria-hidden", "true");
  temperatureContentElement.append(
    createElement("small", "", "设定温度"),
    targetOutputElement,
    currentTemperatureElement
  );
  dialElement.append(temperatureContentElement);
  // −/+ 保留：拖动是「粗调」，键盘与读屏用户靠这两个按钮和方向键做「细调」，
  thermostatElement.append(decreaseButton, dialElement, increaseButton);
  thermostatSlotElement.append(thermostatElement);
  const rangeHintElement = createElement("p", "i3d-climate-temperature-interval");
  const groupsElement = createElement("div", "i3d-climate-groups");
  const extraGridElement = createElement("div", "i3d-climate-groups i3d-extra-grid");
  // 先藏起来：构造时还没有任何绑定，首帧 update() 之前这块网格不该占位。
  extraGridElement.hidden = true;
  const emptyElement = createElement("p", "i3d-climate-empty");
  const errorElement = createElement("p", "i3d-climate-error");
  // role=status：占位说明与错误提示变化时由读屏软件播报。
  emptyElement.setAttribute("role", "status");
  errorElement.setAttribute("role", "status");
  replaceChildren(
    rootElement,
    headingElement,
    purifierElement,
    airconElement,
    thermostatSlotElement,
    rangeHintElement,
    groupsElement,
    extraGridElement,
    emptyElement,
    errorElement
  );
  const extras = createPurifierExtras({
    element: extraGridElement,
    // 布局回传直接转交给舞台：拖拽 / 改尺寸只在编辑预览态可用（见下面传来的 editing），
    onLayout,
    onControl: extraControl => onControl({ ...extraControl, deviceKind: "purifier-extra" })
  });
  let viewModel = {};
  // 用一个空实体先跑一遍归一化，得到「全部字段都存在」的初始状态，
  let deviceState = climateState("", null);
  let isDisposed = false;
  let isSending = false;
  let errorMessage = "";
  // 每次绑定的实体变化就自增，用来丢弃属于上一个实体的异步回包。
  let instanceId = 0;
  // 本地乐观温度：用户按下 +/- 后立刻显示，等 HA 回传对齐后再丢弃。
  let draftTemperature = null;
  let temperatureTimeoutId = null;
  // 本地乐观风速：拖动净化器风速滑杆后立刻显示，等 HA 回传对齐后再丢弃（与温度草稿同一套机制）。
  let draftPercentage = null;
  let percentageTimeoutId = null;
  // 净化器控件的节点引用；每次重建选项组时重新赋值，当前面板不是净化器时为 null。
  let purifierSpeedTitle = null;
  let purifierSpeedValue = null;
  // 档位刻度条：滑杆下方的等分刻度，标记「每个档位落在滑轨的哪个位置」。纯装饰（aria-hidden），
  let purifierSpeedTicksElement = null;
  let purifierSpeedInput = null;
  let purifierSpeedLevelsElement = null;
  // 档位按钮与它对应的档位数据：与 choiceButtons 分开维护 —— 档位的「选中」是
  let purifierSpeedLevelButtons = [];
  let purifierOscillateButton = null;
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
  /** 取消本地风速草稿（含定时器）；不发命令，只清状态。 */
  const clearPercentageDraft = () => {
    if (percentageTimeoutId !== null) {
      clearTimeout(percentageTimeoutId);
    }
    percentageTimeoutId = null;
    draftPercentage = null;
  };
  /** 当前应显示的风速百分比：优先本地草稿，其次设备上报值。 */
  function resolvePercentage() {
    return draftPercentage ?? deviceState.percentage;
  }
  /**
   * 当前风速落在第几档（-1 表示没落在任何一档）。
   */
  function activeSpeedLevelIndex(percentage) {
    if (!deviceState.on || percentage === null || percentage <= 0) {
      return -1;
    }
    return deviceState.speedLevels.findIndex(
      speedLevel => Math.abs(speedLevel.percentage - percentage) <= 1
    );
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
    decreaseButton.disabled =
      !canControl() || temperature === null || temperature <= deviceState.minimum;
    increaseButton.disabled =
      !canControl() || temperature === null || temperature >= deviceState.maximum;
    if (!deviceState.temperatureSupported) {
      return;
    }
    const range = deviceState.maximum - deviceState.minimum;
    const dialFraction =
      temperature === null
        ? 0
        : Math.min(1, Math.max(0, (temperature - deviceState.minimum) / range));
    dialElement.style.setProperty("--i3d-dial-progress", String(dialFraction));
    dialElement.setAttribute("aria-valuemin", String(deviceState.minimum));
    dialElement.setAttribute("aria-valuemax", String(deviceState.maximum));
    // 设定温度未知时按 ARIA 的「不确定滑块」处理：省略 aria-valuenow 才是正确表达，
    if (temperature === null) {
      dialElement.removeAttribute("aria-valuenow");
    } else {
      dialElement.setAttribute("aria-valuenow", String(temperature));
    }
    dialElement.setAttribute(
      "aria-valuetext",
      (temperature === null ? "尚未上报设定温度" : "设定 " + temperature + " 摄氏度") +
        (deviceState.currentTemperature === null
          ? ""
          : "，当前 " + deviceState.currentTemperature + " 摄氏度")
    );
    // 预览 / 不可控时表盘仍要能显示读数，只是不再响应拖动，故用 aria-disabled 而不是 disabled
    dialElement.setAttribute("aria-disabled", String(!canControl()));
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
    } else if (command.service === "set_percentage") {
      // 调风速同理：乐观显示新百分比，8 秒内没等到 HA 对齐就退回设备上报值。
      clearPercentageDraft();
      draftPercentage = command.data.percentage;
      percentageTimeoutId = setTimeout(() => {
        percentageTimeoutId = null;
        draftPercentage = null;
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
   * 先本地校验再发送净化器控制命令；不可控时返回 undefined。
   */
  function requestPurifierControl(requestedService, value) {
    if (canControl()) {
      try {
        return sendControl(purifierControl(deviceState, requestedService, value));
      } catch (controlError) {
        errorMessage = controlError.message;
        render();
      }
    }
  }
  /**
   * 切换开关机。
   */
  function togglePower({ toggle: toggle = true } = {}) {
    if (!canControl() || (!toggle && deviceState.on)) {
      return Promise.resolve(false);
    }
    if (deviceState.purifier) {
      // fan 域的开关机是无参数服务，没有「恢复上次模式」一说，直接按当前开关态反向下发。
      try {
        return sendControl(
          purifierControl(deviceState, deviceState.on ? "turn_off" : "turn_on")
        );
      } catch (powerError) {
        errorMessage = powerError.message;
        render();
        return Promise.resolve(false);
      }
    }
    try {
      return sendControl(
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
  /**
   * 把任意温度夹进 [min, max] 并按 step 对齐到刻度。
   */
  function snapTemperature(value) {
    const step = deviceState.step > 0 ? deviceState.step : 1;
    const stepped = deviceState.minimum + Math.round((value - deviceState.minimum) / step) * step;
    const clamped = Math.min(deviceState.maximum, Math.max(deviceState.minimum, stepped));
    return Number(clamped.toFixed((String(step).split(".")[1] || "").length));
  }
  /**
   * 由指针位置换出温度：把指针相对表盘圆心的方位角映射到 270° 的弧形量程上。
   */
  function temperatureFromPointer(event) {
    // 没有布局信息（离屏 / 假 DOM）时直接放弃：算不出圆心就没法算角度。
    const rect = dialElement.getBoundingClientRect?.();
    if (!rect || !rect.width || !rect.height) {
      return null;
    }
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    if (!dx && !dy) {
      return null;
    }
    // atan2 给的是「以右为 0、顺时针为正」，换算成「以正上方为 0、顺时针为正」的钟表角。
    const clockAngle = (((Math.atan2(dy, dx) * 180) / Math.PI + 90) % 360 + 360) % 360;
    let sweep = clockAngle - 225;
    if (sweep < 0) {
      sweep += 360;
    }
    if (sweep > 270) {
      sweep = sweep < 315 ? 270 : 0;
    }
    const range = deviceState.maximum - deviceState.minimum;
    return snapTemperature(deviceState.minimum + (sweep / 270) * range);
  }
  // 拖动期间只改本地显示、不发命令；松手才下发一条 set_temperature —— 与风速滑杆同一套节奏，
  let isDialDragging = false;
  dialElement.addEventListener("pointerdown", event => {
    if (!canControl()) {
      return;
    }
    dialElement.setPointerCapture?.(event.pointerId);
    isDialDragging = true;
    const temperature = temperatureFromPointer(event);
    if (temperature !== null) {
      draftTemperature = temperature;
      syncTemperature(temperature);
    }
  });
  dialElement.addEventListener("pointermove", event => {
    if (!isDialDragging) {
      return;
    }
    const temperature = temperatureFromPointer(event);
    if (temperature !== null) {
      draftTemperature = temperature;
      syncTemperature(temperature);
    }
  });
  const endDialDrag = event => {
    if (!isDialDragging) {
      return;
    }
    isDialDragging = false;
    dialElement.releasePointerCapture?.(event.pointerId);
    const temperature = resolveTemperature();
    if (temperature === null || temperature === deviceState.temperature) {
      // 拖了一圈又回到原值：只清草稿，别白发一条命令。
      clearTemperatureDraft();
      render();
      return;
    }
    requestControl("set_temperature", temperature);
  };
  dialElement.addEventListener("pointerup", endDialDrag);
  // pointercancel（手势被系统接管、来电、切到别的应用）与 pointerup 语义不同：用户并没有
  dialElement.addEventListener("pointercancel", event => {
    if (!isDialDragging) {
      return;
    }
    isDialDragging = false;
    dialElement.releasePointerCapture?.(event.pointerId);
    clearTemperatureDraft();
    render();
  });
  dialElement.addEventListener("keydown", event => {
    // 拖动中忽略键盘：两套输入同时在改写同一个草稿，谁后到谁说话，结果不可预期。
    if (isDialDragging) {
      return;
    }
    const base = resolveTemperature() ?? deviceState.minimum;
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      requestControl(
        "set_temperature",
        event.key === "Home" ? deviceState.minimum : deviceState.maximum
      );
      return;
    }
    const direction =
      event.key === "ArrowUp" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowDown" || event.key === "ArrowLeft"
          ? -1
          : 0;
    if (!direction) {
      return;
    }
    event.preventDefault();
    requestControl("set_temperature", snapTemperature(base + direction * deviceState.step));
  });
  /** 按设备能力重建「运行模式 / 风速 / 摆风 / 方向」几组选项按钮。 */
  function buildChoiceGroups() {
    replaceChildren(groupsElement);
    choiceButtons = [];
    // 净化器的这几组命令属于 fan 域，必须交给 purifierControl 构造（domain=fan）；
    const requestGroupControl = deviceState.purifier ? requestPurifierControl : requestControl;
    // 净化器的预设模式：上游把「能力位门槛」直接折进列表（位没置位就是空数组），本仓把门槛
    const purifierPresetModes = deviceState.presetModeSupported ? deviceState.presetModes : [];
    // 每行依次是：分组标题、可选值、状态对象上的字段名、要调用的服务、取值 → 文案映射。
    for (const [groupLabel, optionValues, field, service, optionLabels] of [
      [
        "运行模式",
        deviceState.purifier
          ? purifierPresetModes
          : deviceState.modes.filter(mode => mode !== "off"),
        deviceState.purifier ? "presetMode" : "mode",
        deviceState.purifier ? "set_preset_mode" : "set_hvac_mode",
        // 净化器的预设名各厂商写法不一（大小写、前后空白），查表前先归一；未收录的原样显示。
        Object.fromEntries(
          (deviceState.purifier ? purifierPresetModes : deviceState.modes).map(modeValue => [
            modeValue,
            deviceState.purifier
              ? PURIFIER_PRESET_LABELS[String(modeValue).trim().toLowerCase()] || modeValue
              : climateModeLabel(modeValue)
          ])
        )
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
      ],
      // 方向（前后吹）只有净化器有：HA 的取值固定 forward / reverse，文案沿用 HA 中文翻译。
      [
        "方向",
        deviceState.purifier && deviceState.directionSupported ? ["forward", "reverse"] : [],
        "direction",
        "set_direction",
        { forward: "正向", reverse: "反向" }
      ]
    ]) {
      // 设备没提供该项能力就不渲染整组。
      if (!optionValues.length) {
        continue;
      }
      const groupElement = createElement("section", "i3d-climate-option-group");
      const groupHeadingElement = createElement("h4", "", groupLabel);
      if (GROUP_GLYPHS[groupLabel]) {
        groupHeadingElement.dataset.glyph = GROUP_GLYPHS[groupLabel];
      }
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
        choiceButton.addEventListener("click", () => requestGroupControl(service, optionValue));
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
    // ===== 净化器（fan 域）控件 =====
    if (deviceState.purifier) {
      // 摆动：单个开关式按钮，不成组 —— 结构照抄上游 0.6.5（section 下直接挂一个按钮，
      if (deviceState.oscillatingSupported) {
        const oscillateGroupElement = createElement("section", "i3d-climate-option-group");
        oscillateGroupElement.append(createElement("h4", "", "摆动"));
        purifierOscillateButton = createElement(
          "button",
          "i3d-climate-choice",
          deviceState.oscillating ? "已开启" : "已关闭"
        );
        purifierOscillateButton.type = "button";
        purifierOscillateButton.addEventListener("click", () =>
          requestPurifierControl("oscillate", !deviceState.oscillating)
        );
        oscillateGroupElement.append(purifierOscillateButton);
        groupsElement.append(oscillateGroupElement);
      }
      // 风速：滑杆与离散档位**同时**显示 —— 档位按钮是「一步到位」的快捷选择，滑杆负责连续微调，
      if (deviceState.percentageSupported) {
        const speedGroupElement = createElement(
          "section",
          "i3d-climate-option-group i3d-climate-speed"
        );
        // 标题固定为「风速」，不再兼职读数：读数挪到右侧的高亮 chip（purifierSpeedValue），
        purifierSpeedTitle = createElement("span", "i3d-climate-speed-title", "风速");
        purifierSpeedValue = createElement("span", "i3d-climate-speed-value", "--");
        purifierSpeedInput = createElement("input", "i3d-climate-speed-range");
        purifierSpeedInput.type = "range";
        purifierSpeedInput.min = "0";
        purifierSpeedInput.max = "100";
        purifierSpeedInput.step = String(deviceState.percentageStep);
        purifierSpeedInput.setAttribute("aria-label", "净化器风速");
        purifierSpeedInput.addEventListener("input", () => {
          if (!purifierSpeedValue) {
            return;
          }
          const draggedPercentage = Number(purifierSpeedInput.value);
          // 读数按 render() 的口径取整：滑杆 step 是 HA 的原始小数（7 档 = 14.2857…），
          purifierSpeedValue.textContent = Math.round(draggedPercentage) + "%";
          // 档位高亮同步跟手：档位与百分比是同一份状态的两种写法，拖动时亮错档比不亮更误导。
          const activeIndex = activeSpeedLevelIndex(draggedPercentage);
          for (const [levelIndex, level] of purifierSpeedLevelButtons.entries()) {
            level.element.setAttribute("aria-pressed", String(levelIndex === activeIndex));
          }
        });
        purifierSpeedInput.addEventListener("change", () =>
          requestPurifierControl("set_percentage", Number(purifierSpeedInput.value))
        );
        // 档位按钮直接挂在这层 .i3d-climate-choices 上（沿用选项组的按钮外观，不额外造样式）；
        purifierSpeedLevelsElement = createElement(
          "div",
          "i3d-climate-choices i3d-climate-speed-levels"
        );
        purifierSpeedLevelsElement.setAttribute("role", "group");
        purifierSpeedLevelsElement.setAttribute("aria-label", "净化器风速档位");
        purifierSpeedLevelsElement.style.gridTemplateColumns = `repeat(${speedLevelColumnCount(
          deviceState.speedLevels.length
        )}, minmax(0, 1fr))`;
        // 刻度条：按档位百分比绝对定位。容器左右各内缩「半个滑块宽」，这样 left: <百分比>%
        purifierSpeedTicksElement = createElement("div", "i3d-climate-speed-ticks");
        purifierSpeedTicksElement.setAttribute("aria-hidden", "true");
        for (const speedLevel of deviceState.speedLevels) {
          const tickElement = createElement("span", "i3d-climate-speed-tick");
          tickElement.style.left = speedLevel.percentage + "%";
          purifierSpeedTicksElement.append(tickElement);
        }
        // 档位按钮一次成型：档位表只随 percentageStep / percentageSupported 变，两者都在
        purifierSpeedLevelButtons = deviceState.speedLevels.map(speedLevel => {
          const levelButton = createElement("button", "i3d-climate-choice", speedLevel.label);
          levelButton.type = "button";
          // 这一档在色阶上的位置（0–1），整排按钮据此各自上色连成一条色阶。
          levelButton.style.setProperty("--i3d-level", String(speedLevel.percentage / 100));
          levelButton.addEventListener("click", () =>
            requestPurifierControl("set_percentage", speedLevel.percentage)
          );
          purifierSpeedLevelsElement.append(levelButton);
          return { element: levelButton, label: speedLevel.label, percentage: speedLevel.percentage };
        });
        speedGroupElement.append(
          purifierSpeedTitle,
          purifierSpeedValue,
          purifierSpeedInput,
          purifierSpeedTicksElement,
          purifierSpeedLevelsElement
        );
        groupsElement.append(speedGroupElement);
      }
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
    titleElement.textContent =
      item.label || deviceState.name || (deviceState.purifier ? "空气净化器" : "空调");
    titleElement.title = titleElement.textContent;
    // 状态文案的优先级：编辑预览 > 未绑定 > 不可用 > 开关态（空调显示模式名，净化器只说开 / 关）。
    statusElement.textContent = viewModel.editing
      ? "控制预览"
      : hasEntity
        ? deviceState.available
          ? deviceState.on
            ? deviceState.purifier
              ? "已开启"
              : climateModeLabel(deviceState.mode)
            : "已关闭"
          : "设备不可用"
        : "尚未绑定设备";
    // data-climate-mode 是 CSS 动画与配色的钩子（冷 / 热 / 净化 / 其它 / 关）。
    rootElement.dataset.climateMode = deviceState.available ? deviceState.visualMode : "off";
    if (deviceState.purifier) {
      const levelPercentage = deviceState.percentageSupported ? resolvePercentage() : null;
      rootElement.style.setProperty(
        "--i3d-purifier-level",
        String(Math.min(1, Math.max(0, (levelPercentage ?? 0) / 100)))
      );
    } else {
      rootElement.style.removeProperty("--i3d-purifier-level");
    }
    purifierElement.hidden = !deviceState.purifier;
    airconElement.hidden = deviceState.purifier;
    if (deviceState.purifier) {
      const isDeviceUsable = deviceState.available && deviceState.on;
      purifierElement.classList.toggle("is-on", isDeviceUsable);
      purifierElement.classList.toggle("is-unavailable", !deviceState.available);
      // 显示屏优先报档位名（两字，正是实体机显示屏的尺寸）；没有档位表时退到百分比。
      const graphicPercentage = deviceState.percentageSupported ? resolvePercentage() : null;
      const graphicLevelIndex = activeSpeedLevelIndex(graphicPercentage);
      purifierDisplayTextElement.textContent = !isDeviceUsable
        ? "OFF"
        : graphicLevelIndex >= 0
          ? deviceState.speedLevels[graphicLevelIndex].label
          : graphicPercentage !== null
            ? graphicPercentage + "%"
            : "ON";
    } else {
      // 空调机上那台挂壁机：与 2D 同一套三态 —— 开机报目标温度（没有读数才退到模式名），
      const isAirconUsable = deviceState.available && deviceState.on;
      airconElement.classList.toggle("is-on", isAirconUsable);
      airconElement.classList.toggle(
        "is-running",
        isAirconUsable && deviceState.running
      );
      airconElement.classList.toggle("is-unavailable", !deviceState.available);
      const hasTemperatureReading =
        deviceState.temperatureSupported && deviceState.temperature !== null;
      airconDisplayElement.textContent = !isAirconUsable
        ? "OFF"
        : hasTemperatureReading
          ? deviceState.temperature + "°"
          : climateModeLabel(deviceState.mode);
    }
    // is-preview：编辑预览态。上游同口径 —— 预览里控件一律禁用（不发设备指令），
    rootElement.classList.toggle("is-preview", !!viewModel.editing);
    rootElement.classList.toggle("is-on", deviceState.available && deviceState.on);
    // is-running 与 is-on 不同：开机但处于待机（hvac_action 为 idle）时不应animate。
    rootElement.classList.toggle("is-running", deviceState.available && deviceState.running);
    // 电源按钮做成图标按钮：头部已经有设备名 + 状态两行文字，再来一个「关闭 / 开启」文字块
    powerButton.textContent = "";
    rootElement.setAttribute("aria-busy", String(isSending || !!viewModel.busy));
    // 开关按钮的禁用条件：不可控、设备既没有 turn_on 能力也没有可用模式（除 off 外），
    powerButton.disabled =
      !isControllable ||
      (!deviceState.purifier &&
        ((!deviceState.turnOnSupported &&
          !deviceState.modes.some(modeId => modeId !== "off")) ||
          (deviceState.on && !deviceState.modes.includes("off"))));
    powerButton.setAttribute("aria-pressed", String(deviceState.on));
    powerButton.setAttribute(
      "aria-label",
      (titleElement.textContent || "设备") + "，" + (deviceState.on ? "关闭" : "开启")
    );
    powerButton.title = deviceState.on ? "关闭" : "开启";
    thermostatSlotElement.hidden = dialElement.hidden = !deviceState.temperatureSupported;
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
    // 选项组只在实体或能力列表变化时重建；其余情况复用按钮、只改按下态。
    const groupsSignature = JSON.stringify([
      deviceState.entityId,
      deviceState.modes,
      deviceState.fanModes,
      deviceState.swingModes,
      deviceState.purifier,
      deviceState.percentageSupported,
      deviceState.percentageStep,
      deviceState.oscillatingSupported,
      deviceState.directionSupported,
      deviceState.presetModeSupported,
      deviceState.presetModes
    ]);
    if (renderedGroupsSignature !== groupsSignature) {
      renderedGroupsSignature = groupsSignature;
      purifierSpeedTitle = null;
      purifierSpeedValue = null;
      purifierSpeedTicksElement = null;
      purifierSpeedInput = null;
      purifierSpeedLevelsElement = null;
      purifierSpeedLevelButtons = [];
      purifierOscillateButton = null;
      buildChoiceGroups();
    }
    for (const choice of choiceButtons) {
      choice.element.disabled = !isControllable;
      choice.element.setAttribute(
        "aria-pressed",
        String(deviceState[choice.field] === choice.value)
      );
    }
    // 净化器控件：摆动的文案与按下态、风速滑杆 / 档位按钮的取值与可用性。
    if (purifierOscillateButton) {
      purifierOscillateButton.textContent = deviceState.oscillating ? "已开启" : "已关闭";
      purifierOscillateButton.setAttribute("aria-pressed", String(deviceState.oscillating));
      purifierOscillateButton.disabled = !isControllable;
    }
    if (purifierSpeedInput) {
      const displayedPercentage = resolvePercentage();
      purifierSpeedInput.disabled = !isControllable;
      if (ownerDocument.activeElement !== purifierSpeedInput) {
        purifierSpeedInput.value = String(displayedPercentage ?? 0);
      }
      // 档位命中：开着且百分比为正时，落在哪一档的 ±1 之内就点亮那一档（口径见
      const activeLevelIndex = activeSpeedLevelIndex(displayedPercentage);
      // 读数 chip：有档位时优先报档位名 + 百分比（档位名负责「感知」、百分比负责「精度」，
      const activeLabel =
        activeLevelIndex >= 0 ? purifierSpeedLevelButtons[activeLevelIndex].label : "";
      purifierSpeedValue.textContent =
        purifierSpeedLevelButtons.length === 0
          ? (displayedPercentage ?? "--") + "%"
          : activeLevelIndex >= 0
            ? activeLabel + " · " + displayedPercentage + "%"
            : deviceState.presetMode
              ? "由模式控制"
              : deviceState.on
                ? (displayedPercentage ?? "--") + "%"
                : "已关闭";
      // 档位标签同步进滑杆的无障碍名：滑杆现在是常显控件，读屏焦点落在它身上时只说
      purifierSpeedInput.setAttribute(
        "aria-valuetext",
        activeLabel ? activeLabel + "（" + displayedPercentage + "%）" : "未定档"
      );
      // 滑杆与档位按钮并存：档位负责「一步到位」，滑杆负责连续微调与当前值的可视化位置。
      purifierSpeedLevelsElement.hidden = purifierSpeedLevelButtons.length === 0;
      for (const [levelIndex, speedLevel] of purifierSpeedLevelButtons.entries()) {
        speedLevel.element.disabled = !isControllable;
        speedLevel.element.setAttribute("aria-pressed", String(levelIndex === activeLevelIndex));
      }
      // 刻度是纯装饰（aria-hidden），没有 aria 状态可用，才需要 .is-active 这类视觉类。
      purifierSpeedTicksElement.hidden = purifierSpeedLevelButtons.length === 0;
      for (let tickIndex = 0; tickIndex < purifierSpeedTicksElement.children.length; tickIndex += 1) {
        purifierSpeedTicksElement.children[tickIndex].classList.toggle(
          "is-active",
          tickIndex === activeLevelIndex
        );
      }
    }
    // 有可用状态且（能调温，或设备本身是净化器，或至少有一组可选按钮）时无需占位说明。
    emptyElement.hidden =
      deviceState.available &&
      (deviceState.temperatureSupported ||
        deviceState.purifier ||
        choiceButtons.length > 0);
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
      clearPercentageDraft();
    }
    viewModel = nextViewModel;
    // 上游可能已经传了归一化后的状态（例如同一份数据被多个面板共享），
    deviceState =
      nextViewModel.state?.entityId === nextEntityId && Array.isArray(nextViewModel.state?.modes)
        ? nextViewModel.state
        : climateState(nextEntityId, nextViewModel.state);
    // 面板每见到一份真实状态就把「上次用的模式」记下来；配置预览里的占位状态不算。
    if (!nextViewModel.editing) {
      modeHistory.observe(nextEntityId, deviceState.raw);
    }
    // 设备上报值已经追上本地草稿（误差在半步以内）就丢弃草稿，
    if (
      draftTemperature !== null &&
      deviceState.temperature !== null &&
      Math.abs(deviceState.temperature - draftTemperature) < deviceState.step / 2 + 0.001
    ) {
      clearTemperatureDraft();
    }
    // 风速草稿同理：设备上报值追上（半步以内）就丢弃，用真实状态渲染。
    if (
      draftPercentage !== null &&
      deviceState.percentage !== null &&
      Math.abs(deviceState.percentage - draftPercentage) < deviceState.percentageStep / 2 + 0.001
    ) {
      clearPercentageDraft();
    }
    render();
    // 附加功能卡片续在主体渲染之后刷新：只有净化器才有资格把 extraControls 交给卡片渲染器。
    const cardEditing = !!(nextViewModel.editing || nextViewModel.busy);
    extras.update(
      deviceState.purifier
        ? {
            item: nextViewModel.item,
            states: nextViewModel.states || {},
            editing: cardEditing
          }
        : {
            item: { ...nextViewModel.item, extraControls: [] },
            states: {},
            editing: cardEditing
          }
    );
  }
  // 释放面板：置 isDisposed 并自增 instanceId，让所有在途异步回包失效，
  function dispose() {
    if (!isDisposed) {
      isDisposed = true;
      // 自增后所有在途回包都不再触发渲染。
      instanceId++;
      clearTemperatureDraft();
      clearPercentageDraft();
      // 先让卡片渲染器摘掉它挂在 document 上的全局监听（pointerdown / scroll / keydown）
      extras.dispose();
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
