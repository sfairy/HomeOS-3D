/**
 * 空调控制面板（3D 详情弹窗 / 配置预览共用）。
 *
 * 把 climateState 归一化后的状态渲染成一张控制卡（开关、设定温度、运行模式、风速、摆风），
 * 用户操作交给 onControl 发送。对外提供 createClimatePanel。面板不直接访问后端，所有命令
 * 通过 onControl(command) 发出，命令结构由 climate-state.js 统一构造。
 *
 * 同一张面板也服务空气净化器（HA 的 fan 域）：净化器的风速 / 风速档位 / 方向 / 摆头 /
 * 模式预设这几组只在对应 supported_features 位为真时渲染，命令一律走 purifierControl
 * （domain=fan），与空调的 climate 命令分开构造。
 */
import {
  climateState,
  climateControl,
  climatePowerControl,
  climateModeLabel,
  climateSwingModeLabel,
  createClimateModeHistory,
  purifierControl
} from "./climate-state.js?v=2609252203";
// DOM 工厂（元素 / 按钮 / replaceChildren 兜底）的唯一实现；运行侧不能写裸 `/static/...` 的
// 静态 import，故经 static-helpers 桥取用。
import { createDomFactory } from "../core/static-helpers.js?v=2609252203";
// 「附加功能」卡片网格：与通用设备弹窗（device/device-panel.js）共用同一份渲染器。
// 净化器与那 5 类通用设备只是宿主面板不同，卡片的行为（开关 / 选项 / 数值 / 按钮 / 状态显示）
// 必须只有一份实现，否则同一张卡在两处会长出两种交互。
import { createPurifierExtras } from "./purifier-extras.js?v=2609252203";
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
 * 净化器 preset_mode 取值 → 中文文案。与 2D 能力详情面板（panel-renderer/device-controls/
 * capability.js）同一张表，避免同一台净化器在 2D 与 3D 里显示成两个名字；未收录的原样显示。
 */
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
 * 创建空调面板。
 */
export function createClimatePanel({
  element: hostElement,
  onControl: onControl = async () => {},
  modeHistory: modeHistory = createClimateModeHistory()
} = {}) {
  // 刻意用宿主的 ownerDocument：面板被放进别的文档（弹窗、预览 iframe）时才不会造出属于外部
  // 文档的孤儿节点。工厂实现见 /static/shared/dom-factory.js。净化器滑杆的聚焦判断也要用它。
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
  // 附加功能卡片网格：与通用设备弹窗同属一套 `i3d-extra-*` 契约，所以同样挂
  // `i3d-climate-groups`（沿用列间距等排版变量）+ `i3d-extra-grid`（真正的 6 列网格，见
  // climate-panel.css）。刻意独立于 groupsElement：后者会被 buildChoiceGroups 整块
  // replaceChildren，卡片混在里面会随每次能力变化被推倒重建，输入焦点与下拉都会丢。
  const extraGridElement = createElement("div", "i3d-climate-groups i3d-extra-grid");
  // 先藏起来：构造时还没有任何绑定，首帧 update() 之前这块网格不该占位。
  // 之后每一次 update() 都由 extras.update() 按「是否净化器 + 是否配了卡片」重新决定。
  extraGridElement.hidden = true;
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
    extraGridElement,
    emptyElement,
    errorElement
  );
  // 卡片渲染器只创建一次：createPurifierExtras.update() 自己按「设备 / 布局 / 编辑态」签名
  // 决定要不要重建 DOM，若换成每次 update 重建实例，正在输入的数值框与展开的下拉会被
  // 反复销毁，用户打一半的数字或刚点开的选项都会丢。
  //
  // onControl 追加 `deviceKind: "purifier-extra"`：extraCommand 虽然已经带了这个标记，但
  // 这里显式再写一遍是与 device-panel.js 同一份契约（通用设备是 `device-extra`），后端
  // /control 靠它分流到净化器附加实体的校验分支，不能省。
  const extras = createPurifierExtras({
    element: extraGridElement,
    onControl: extraControl => onControl({ ...extraControl, deviceKind: "purifier-extra" })
  });
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
  // 本地乐观风速：拖动净化器风速滑杆后立刻显示，等 HA 回传对齐后再丢弃（与温度草稿同一套机制）。
  let draftPercentage = null;
  let percentageTimeoutId = null;
  // 净化器控件的节点引用；每次重建选项组时重新赋值，当前面板不是净化器时为 null。
  let purifierSpeedInput = null;
  let purifierSpeedOutput = null;
  let purifierOscillateButton = null;
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
   * 与 requestControl 同形，只是命令交给 purifierControl（domain=fan）构造。
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
    // toggle=false 且设备已开时不重复下发，避免把「开机」按钮当成无操作。
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
    // ===== 净化器（fan 域）控件 =====
    // 只在对应 supported_features 位为真时渲染：后端拿同一张表复核（purifier.py 的 docstring
    // 写明「前端可以骗人，HA 不会」），所以设备不具备的能力应整组隐藏，而不是渲染出来再禁用。
    if (deviceState.purifier) {
      // 每一组都重复「标题 + role=group 容器」这套骨架，抽一个局部工厂避免三处抄一遍。
      const addPurifierGroup = (groupLabel, buildChoices) => {
        const groupElement = createElement("section", "i3d-climate-option-group");
        groupElement.append(createElement("h4", "", groupLabel));
        const choicesElement = createElement("div", "i3d-climate-choices");
        choicesElement.setAttribute("role", "group");
        choicesElement.setAttribute("aria-label", groupLabel);
        buildChoices(choicesElement);
        groupElement.append(choicesElement);
        groupsElement.append(groupElement);
      };
      // 模式预设：候选表来自设备上报的 preset_modes，未知取值原样显示（不猜文案）。
      if (deviceState.presetModeSupported) {
        addPurifierGroup("模式预设", choicesElement => {
          for (const presetModeValue of deviceState.presetModes) {
            const presetButton = createElement(
              "button",
              "i3d-climate-choice",
              PURIFIER_PRESET_LABELS[String(presetModeValue).toLowerCase()] || presetModeValue
            );
            presetButton.type = "button";
            presetButton.addEventListener("click", () =>
              requestPurifierControl("set_preset_mode", presetModeValue)
            );
            choiceButtons.push({
              element: presetButton,
              field: "presetMode",
              value: presetModeValue
            });
            choicesElement.append(presetButton);
          }
        });
      }
      // 方向：HA 的取值只有 forward / reverse，文案沿用 HA 中文翻译的「正向 / 反向」。
      if (deviceState.directionSupported) {
        addPurifierGroup("方向", choicesElement => {
          for (const [directionValue, directionLabel] of [
            ["forward", "正向"],
            ["reverse", "反向"]
          ]) {
            const directionButton = createElement("button", "i3d-climate-choice", directionLabel);
            directionButton.type = "button";
            directionButton.addEventListener("click", () =>
              requestPurifierControl("set_direction", directionValue)
            );
            choiceButtons.push({
              element: directionButton,
              field: "direction",
              value: directionValue
            });
            choicesElement.append(directionButton);
          }
        });
      }
      // 摆头：单个开关式按钮，按下态用 aria-pressed 表达（与其它选项组同一套无障碍语言）。
      if (deviceState.oscillatingSupported) {
        addPurifierGroup("摆头", choicesElement => {
          purifierOscillateButton = createElement("button", "i3d-climate-choice");
          purifierOscillateButton.type = "button";
          purifierOscillateButton.setAttribute("aria-label", "摆头");
          purifierOscillateButton.addEventListener("click", () =>
            requestPurifierControl("oscillate", !deviceState.oscillating)
          );
          choicesElement.append(purifierOscillateButton);
        });
      }
      // 风速：滑杆范围固定 0~100，步长取设备上报的 percentage_step（缺省 1）。
      if (deviceState.percentageSupported) {
        addPurifierGroup("净化器风速", choicesElement => {
          purifierSpeedInput = createElement("input", "i3d-climate-purifier-range");
          purifierSpeedInput.type = "range";
          purifierSpeedInput.min = "0";
          purifierSpeedInput.max = "100";
          purifierSpeedInput.step = String(deviceState.percentageStep);
          purifierSpeedInput.setAttribute("aria-label", "净化器风速");
          purifierSpeedOutput = createElement("output", "i3d-climate-purifier-output");
          purifierSpeedInput.addEventListener("change", () =>
            requestPurifierControl("set_percentage", Number(purifierSpeedInput.value))
          );
          // 加自己的类把默认的 flex 换行改成「滑杆撑满 + 右侧读数」，见 climate-panel.css。
          choicesElement.classList.add("i3d-climate-purifier-speed");
          choicesElement.append(purifierSpeedInput, purifierSpeedOutput);
        });
      }
      // 风速档位：按 percentage_step 均分出的离散档位。档位多于 8 个时只留滑杆 ——
      // 否则步长 1 会铺出 101 个按钮，比连续调节更难用。
      if (deviceState.percentageSupported) {
        const gearValues = [];
        for (
          let gearValue = 0;
          gearValue <= 100 + 1e-9;
          gearValue += deviceState.percentageStep
        ) {
          // 浮点累加会带出 99.99999999 这类值，先按 1e-6 收敛再显示 / 下发。
          gearValues.push(Math.round(gearValue * 1e6) / 1e6);
        }
        if (gearValues.length >= 2 && gearValues.length <= 8) {
          addPurifierGroup("净化器风速档位", choicesElement => {
            for (const gearValue of gearValues) {
              const gearButton = createElement("button", "i3d-climate-choice", String(gearValue));
              gearButton.type = "button";
              gearButton.addEventListener("click", () =>
                requestPurifierControl("set_percentage", gearValue)
              );
              choiceButtons.push({
                element: gearButton,
                field: "percentage",
                value: gearValue
              });
              choicesElement.append(gearButton);
            }
          });
        }
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
    // data-climate-mode 是 CSS 动画的钩子（冷 / 热 / 其它 / 关），样式按它切换气流表现。
    rootElement.dataset.climateMode = deviceState.available ? deviceState.visualMode : "off";
    rootElement.classList.toggle("is-on", deviceState.available && deviceState.on);
    // is-running 与 is-on 不同：开机但处于待机（hvac_action 为 idle）时不应animate。
    rootElement.classList.toggle("is-running", deviceState.available && deviceState.running);
    powerButton.textContent = deviceState.on ? "关闭" : "开启";
    rootElement.setAttribute("aria-busy", String(isSending || !!viewModel.busy));
    // 开关按钮的禁用条件：不可控、设备既没有 turn_on 能力也没有可用模式（除 off 外），
    // 或设备已开却没有 off 模式（无法关机）。净化器走 fan 域的 turn_on / turn_off，
    // 后端不设任何能力位门槛，故只受「是否可控」约束，不能套用上面那套模式列表判断。
    powerButton.disabled =
      !isControllable ||
      (!deviceState.purifier &&
        ((!deviceState.turnOnSupported &&
          !deviceState.modes.some(modeId => modeId !== "off")) ||
          (deviceState.on && !deviceState.modes.includes("off"))));
    powerButton.setAttribute("aria-pressed", String(deviceState.on));
    powerButton.setAttribute(
      "aria-label",
      titleElement.textContent +
        "，" +
        (deviceState.on ? "关闭" : "开启") +
        (deviceState.purifier ? "空气净化器" : "空调")
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
    // 净化器的能力位 / 列表也在签名里：变了就要重建那几组控件；只变当前值（percentage /
    // oscillating / direction）不重建，交给下面的按下态与滑杆同步去改。
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
      // 重建会丢掉旧的净化器节点引用，先清空再建，避免指向已移除的节点。
      purifierSpeedInput = null;
      purifierSpeedOutput = null;
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
    // 净化器控件：摆头按钮的文案与按下态、风速滑杆的当前值与可用性。
    if (purifierOscillateButton) {
      purifierOscillateButton.textContent = deviceState.oscillating ? "已开启" : "已关闭";
      purifierOscillateButton.setAttribute("aria-pressed", String(deviceState.oscillating));
      purifierOscillateButton.disabled = !isControllable;
    }
    if (purifierSpeedInput) {
      const displayedPercentage = resolvePercentage();
      purifierSpeedInput.disabled = !isControllable;
      // 正在拖动 / 聚焦的滑杆不要被状态回包拉回去，否则指针下的滑块会被「弹一下」。
      if (ownerDocument.activeElement !== purifierSpeedInput) {
        purifierSpeedInput.value = String(displayedPercentage ?? 0);
      }
      const percentageText = (displayedPercentage ?? 0) + "%";
      purifierSpeedOutput.textContent = percentageText;
      purifierSpeedOutput.value = percentageText;
    }
    // 有可用状态且（能调温或有风速滑杆，或至少有一组可选按钮）时无需占位说明。
    emptyElement.hidden =
      deviceState.available &&
      (deviceState.temperatureSupported ||
        !!purifierSpeedInput ||
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
    // 空调绑定即使因为配置串扰或手工改过 JSON 混进了 extraControls，也必须当成空——否则
    // 一台普通空调会冒出一片本不属于它的卡片，看起来像「配置串台」。非净化器同时清空 states，
    // 避免上一台净化器的实时值残留在隐藏的卡片里。
    extras.update(
      deviceState.purifier
        ? { item: nextViewModel.item, states: nextViewModel.states || {} }
        : { item: { ...nextViewModel.item, extraControls: [] }, states: {} }
    );
  }
  // 释放面板：置 isDisposed 并自增 instanceId，让所有在途异步回包失效，
  // 再清掉温度 / 风速草稿与 DOM，避免面板销毁后仍被旧设备的响应改写。
  function dispose() {
    if (!isDisposed) {
      isDisposed = true;
      // 自增后所有在途回包都不再触发渲染。
      instanceId++;
      clearTemperatureDraft();
      clearPercentageDraft();
      // 先让卡片渲染器摘掉它挂在 document 上的全局监听（pointerdown / scroll / keydown）
      // 与在途定时器，再清空面板 DOM。漏掉这一步会留下一批只增不减的监听器。
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
