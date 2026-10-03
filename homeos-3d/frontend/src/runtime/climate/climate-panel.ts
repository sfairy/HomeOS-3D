import { bathHeaterState as bathHeaterState2 } from "../bath-heater/bath-heater";
import {
  climateState as climateState2,
  climateControl as climateControl2,
  climatePowerControl as climatePowerControl2,
  climateModeLabel as climateModeLabel2,
  climateSwingModeLabel as climateSwingModeLabel2,
  createClimateModeHistory as createClimateModeHistory2,
  createWaterHeaterFeedback as createWaterHeaterFeedback2,
  waterHeaterStatusLabel as waterHeaterStatusLabel2,
} from "./climate-state";
import { createPurifierExtras as createPurifierExtras2 } from "./purifier-extras";
import { purifierState as purifierState2 } from "../purifier/purifier-state";
import { domElement } from "@app/utils/dom-factory";
const formatSwingModeLabel = (swingModeKey, swingDirection = undefined) =>
    ({
      on: "开启",
      off: "关闭",
      middle: "居中",
    })[swingModeKey] || climateSwingModeLabel2(swingModeKey, swingDirection),
  fanModeLabels = {
    auto: "自动",
    low: "低风",
    medium: "中风",
    high: "高风",
    middle: "中风",
    quiet: "静音",
    silent: "静音",
    turbo: "强劲",
    diffuse: "柔风",
    focus: "集中",
  },
  purifierPresetLabels = {
    auto: "自动",
    silent: "静音",
    quiet: "静音",
    low: "低",
    medium: "中",
    middle: "中",
    high: "高",
    turbo: "强劲",
    sleep: "睡眠",
    favorite: "最爱",
    favorite_level: "最爱",
    strong: "强劲",
    normal: "标准",
    natural: "自然风",
  };
let pickerIdCounter = 0;
function createPicker(panelRoot, createPickerElement) {
  const ownerDocument = panelRoot.ownerDocument,
    defaultView = ownerDocument.defaultView;
  let value = null,
    repositionFrameId = null,
    text = "",
    num = 0;
  function closePicker(shouldRefocus = false) {
    if (!value) return;
    const closingPicker = value;
    ((value = null),
      repositionFrameId != null && defaultView?.cancelAnimationFrame?.(repositionFrameId),
      (repositionFrameId = null));
    try {
      closingPicker.menu.hidePopover?.();
    } catch {}
    ((closingPicker.menu.hidden = true),
      closingPicker.picker.append(closingPicker.menu),
      closingPicker.element.setAttribute("aria-expanded", "false"),
      ownerDocument.removeEventListener?.("pointerdown", handleDocumentPointerDown, true),
      ownerDocument.removeEventListener?.("scroll", handleDocumentScroll, true),
      ownerDocument.removeEventListener?.("keydown", handleDocumentKeyDown, true),
      shouldRefocus &&
        !closingPicker.element.disabled &&
        closingPicker.element.focus?.({
          preventScroll: true,
        }));
  }
  function handleDocumentPointerDown(pointerEvent) {
    value &&
      !value.picker.contains?.(pointerEvent.target) &&
      !value.menu.contains?.(pointerEvent.target) &&
      closePicker();
  }
  function handleDocumentScroll(scrollEvent) {
    value && !value.menu.contains?.(scrollEvent.target) && closePicker();
  }
  function handleDocumentKeyDown(documentKeyEvent) {
    documentKeyEvent.key === "Escape" &&
      (documentKeyEvent.preventDefault(), documentKeyEvent.stopPropagation(), closePicker(true));
  }
  function positionPicker() {
    if (!value) return;
    const { element: comboboxElement, menu: menuElement } = value,
      boundingClientRect = comboboxElement.getBoundingClientRect();
    if (
      comboboxElement.disabled ||
      ownerDocument.hidden ||
      comboboxElement.isConnected === false ||
      (comboboxElement.getClientRects && !comboboxElement.getClientRects().length)
    ) {
      closePicker();
      return;
    }
    const computedStyle = defaultView?.getComputedStyle?.(comboboxElement);
    if (
      computedStyle?.visibility === "hidden" ||
      panelRoot.closest?.('[hidden], [aria-hidden="true"]')
    ) {
      closePicker();
      return;
    }
    const triggerWidth = comboboxElement.offsetWidth || boundingClientRect.width || 1,
      triggerHeight = comboboxElement.offsetHeight || boundingClientRect.height || 1,
      scaleX = boundingClientRect.width / triggerWidth || 1,
      scaleY = boundingClientRect.height / triggerHeight || 1,
      stageRect = panelRoot.closest?.(".interaction3d-stage")?.getBoundingClientRect(),
      visualViewport = defaultView?.visualViewport,
      clampLeft = Math.max(visualViewport?.offsetLeft || 0, stageRect?.left || 0) + 8,
      clampTop = Math.max(visualViewport?.offsetTop || 0, stageRect?.top || 0) + 8,
      clampRight =
        Math.min(
          (visualViewport?.offsetLeft || 0) +
            (visualViewport?.width || defaultView?.innerWidth || 1024),
          stageRect?.right ?? Infinity,
        ) - 8,
      clampBottom =
        Math.min(
          (visualViewport?.offsetTop || 0) +
            (visualViewport?.height || defaultView?.innerHeight || 768),
          stageRect?.bottom ?? Infinity,
        ) - 8;
    if (
      clampRight <= clampLeft ||
      clampBottom <= clampTop ||
      boundingClientRect.bottom < clampTop ||
      boundingClientRect.top > clampBottom
    ) {
      closePicker();
      return;
    }
    menuElement.dataset.theme = panelRoot.closest?.("[data-scene-style]")?.dataset.sceneStyle || "";
    const min = Math.min(Math.max(triggerWidth, 320), (clampRight - clampLeft) / scaleX);
    Object.assign(menuElement.style, {
      width: "max-content",
      minWidth: Math.min(Math.max(triggerWidth, 112), min) + "px",
      maxWidth: min + "px",
    });
    const menuWidth = Math.min(menuElement.offsetWidth || Math.max(triggerWidth, 112), min);
    Object.assign(menuElement.style, {
      width: menuWidth + "px",
      transform: "scale(" + scaleX + "," + scaleY + ")",
      transformOrigin: "0 0",
    });
    const menuContentHeight =
        Math.min(280, (menuElement.scrollHeight || value.choices.length * 40 + 12) + 2) * scaleY,
      max = Math.max(
        0,
        clampBottom -
          (boundingClientRect.bottom ?? boundingClientRect.top + boundingClientRect.height) -
          4 * scaleY,
      ),
      spaceAbove = Math.max(0, boundingClientRect.top - clampTop - 4 * scaleY),
      shouldOpenUpward = max < menuContentHeight && spaceAbove > max,
      availableHeight = Math.min(clampBottom - clampTop, shouldOpenUpward ? spaceAbove : max),
      menuHeight = Math.min(menuContentHeight, availableHeight);
    (Object.assign(menuElement.style, {
      maxHeight: Math.min(280, availableHeight / scaleY) + "px",
      left:
        Math.max(clampLeft, Math.min(boundingClientRect.left, clampRight - menuWidth * scaleX)) +
        "px",
      top:
        Math.max(
          clampTop,
          Math.min(
            shouldOpenUpward
              ? boundingClientRect.top - 4 * scaleY - menuHeight
              : (boundingClientRect.bottom ?? boundingClientRect.top + boundingClientRect.height) +
                  4 * scaleY,
            clampBottom - menuHeight,
          ),
        ) + "px",
    }),
      menuElement.style.setProperty(
        "--i3d-climate-accent",
        computedStyle?.getPropertyValue("--i3d-climate-accent") || "#73c8ff",
      ));
  }
  function schedulePosition() {
    ((repositionFrameId = null),
      positionPicker(),
      value &&
        (repositionFrameId = defaultView?.requestAnimationFrame?.(schedulePosition) ?? null));
  }
  function focusChoice(picker, activeIndex) {
    picker.choices.forEach((choiceOption, optionIndex) => {
      choiceOption.tabIndex = optionIndex === activeIndex ? 0 : -1;
    });
    const activeChoiceButton = picker.choices[activeIndex];
    if (
      (activeChoiceButton?.focus?.({
        preventScroll: true,
      }),
      activeChoiceButton && picker.menu.clientHeight)
    ) {
      const offsetTop = activeChoiceButton.offsetTop,
        choiceBottom = offsetTop + activeChoiceButton.offsetHeight;
      offsetTop < picker.menu.scrollTop
        ? (picker.menu.scrollTop = offsetTop)
        : choiceBottom > picker.menu.scrollTop + picker.menu.clientHeight &&
          (picker.menu.scrollTop = choiceBottom - picker.menu.clientHeight);
    }
  }
  function openPicker(targetPicker, shouldFocusLast = false) {
    if (targetPicker.element.disabled) return;
    if (value === targetPicker) {
      closePicker(true);
      return;
    }
    (closePicker(),
      (value = targetPicker),
      (text = ""),
      (num = 0),
      (ownerDocument.body || targetPicker.picker).append(targetPicker.menu),
      (targetPicker.menu.hidden = false),
      targetPicker.element.setAttribute("aria-expanded", "true"));
    try {
      targetPicker.menu.showPopover?.();
    } catch {}
    if ((positionPicker(), !value)) return;
    (ownerDocument.addEventListener?.("pointerdown", handleDocumentPointerDown, true),
      ownerDocument.addEventListener?.("scroll", handleDocumentScroll, true),
      ownerDocument.addEventListener?.("keydown", handleDocumentKeyDown, true));
    const indexOf = targetPicker.values.indexOf(targetPicker.element.value);
    (focusChoice(
      targetPicker,
      indexOf < 0 ? (shouldFocusLast ? targetPicker.choices.length - 1 : 0) : indexOf,
    ),
      schedulePosition());
  }
  function createPickerInstance(fieldLabel, pickerValues, pickerLabels, onSelect) {
    const pickerContainer = createPickerElement("div", "i3d-climate-picker"),
      comboboxButton = createPickerElement("button", "i3d-climate-choice i3d-climate-picker-value");
    ((comboboxButton.type = "button"),
      comboboxButton.setAttribute("role", "combobox"),
      comboboxButton.setAttribute("aria-label", fieldLabel),
      comboboxButton.setAttribute("aria-haspopup", "listbox"),
      comboboxButton.setAttribute("aria-expanded", "false"));
    const menuContainer = createPickerElement(
      "div",
      "i3d-extra-select-menu i3d-climate-picker-menu",
    );
    ((menuContainer.id = "i3d-climate-options-" + ++pickerIdCounter),
      (menuContainer.hidden = true),
      menuContainer.setAttribute("popover", "manual"),
      menuContainer.setAttribute("role", "listbox"),
      menuContainer.setAttribute("aria-label", fieldLabel + " 选项"),
      comboboxButton.setAttribute("aria-controls", menuContainer.id));
    const options = {
      picker: pickerContainer,
      element: comboboxButton,
      menu: menuContainer,
      values: pickerValues,
      labels: pickerLabels,
      choices: [],
    };
    for (const choiceValue of pickerValues) {
      const choiceButton = createPickerElement(
        "button",
        "",
        pickerLabels[choiceValue] || choiceValue,
      );
      ((choiceButton.type = "button"),
        (choiceButton.value = choiceValue),
        (choiceButton.tabIndex = -1),
        choiceButton.setAttribute("role", "option"),
        choiceButton.setAttribute("aria-selected", "false"),
        choiceButton.addEventListener("click", () => {
          if (!(value !== options || comboboxButton.disabled))
            return (closePicker(true), onSelect(choiceValue));
        }),
        options.choices.push(choiceButton),
        menuContainer.append(choiceButton));
    }
    return (
      comboboxButton.addEventListener("click", () => openPicker(options)),
      comboboxButton.addEventListener("keydown", (comboboxKeyEvent) => {
        ["ArrowDown", "ArrowUp"].includes(comboboxKeyEvent.key) &&
          (comboboxKeyEvent.preventDefault(),
          openPicker(options, comboboxKeyEvent.key === "ArrowUp"));
      }),
      menuContainer.addEventListener("keydown", (menuKeyEvent) => {
        if (menuKeyEvent.key === "Tab") {
          closePicker(true);
          return;
        }
        if (menuKeyEvent.key === "Escape") {
          (menuKeyEvent.preventDefault(), menuKeyEvent.stopPropagation(), closePicker(true));
          return;
        }
        const indexOf2 = options.choices.indexOf(ownerDocument.activeElement),
          choiceCount = options.choices.length;
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(menuKeyEvent.key))
          (menuKeyEvent.preventDefault(),
            focusChoice(
              options,
              menuKeyEvent.key === "Home"
                ? 0
                : menuKeyEvent.key === "End"
                  ? choiceCount - 1
                  : (indexOf2 + (menuKeyEvent.key === "ArrowDown" ? 1 : -1) + choiceCount) %
                    choiceCount,
            ));
        else {
          if (
            menuKeyEvent.key.length === 1 &&
            menuKeyEvent.key !== " " &&
            !menuKeyEvent.ctrlKey &&
            !menuKeyEvent.metaKey &&
            !menuKeyEvent.altKey &&
            !menuKeyEvent.isComposing
          ) {
            menuKeyEvent.preventDefault();
            const now = Date.now();
            ((text = now - num > 700 ? menuKeyEvent.key : text + menuKeyEvent.key), (num = now));
            const index = options.choices.findIndex((choice) =>
              choice.textContent.toLocaleLowerCase().startsWith(text.toLocaleLowerCase()),
            );
            index >= 0 && focusChoice(options, index);
          }
        }
      }),
      pickerContainer.append(comboboxButton, menuContainer),
      options
    );
  }
  function syncPickerState(pickerToSync, nextValue, nextLabel, isSyncDisabled) {
    ((pickerToSync.element.disabled = isSyncDisabled),
      (pickerToSync.element.value = nextValue),
      (pickerToSync.element.textContent = nextLabel || "请选择"),
      (pickerToSync.element.title = nextLabel || ""),
      pickerToSync.choices.forEach((choiceNode) => {
        choiceNode.setAttribute("aria-selected", String(choiceNode.value === nextValue));
      }),
      value === pickerToSync && isSyncDisabled && closePicker());
  }
  return {
    create: createPickerInstance,
    sync: syncPickerState,
    close: closePicker,
  };
}
/** 面板的宿主元素与回调； */
type ClimatePanelOptions = {
  element?: any;
  onControl?: (...args: any[]) => any;
  onLayout?: (...args: any[]) => any;
  modeHistory?: any;
};
/** 面板视图模型由 stage 的 update() 注入：字段是运行时状态袋，按实际访问到的键显式列出并全部可选。 */
type ClimatePanelViewModel = {
  item?: any;
  states?: any;
  editing?: any;
  busy?: any;
  state?: any;
  error?: any;
};
type ClimateStateBranch = ReturnType<typeof climateState2>;
/** 三分支键的并集。 */
type ClimateStateKeys<Branch> = Branch extends unknown ? keyof Branch : never;
/** 某个键在各分支中出现的类型的并集。 */
type ClimateStateValue<Key extends PropertyKey, Branch> = Branch extends unknown
  ? Key extends keyof Branch
    ? Branch[Key]
    : never
  : never;
/** climateState() 按实体类型返回三个分支（热水器/净化器/空调），每个分支只带本分支的能力字段； */
type ClimateDeviceState = {
  [Key in ClimateStateKeys<ClimateStateBranch>]?: ClimateStateValue<Key, ClimateStateBranch>;
};
export function createClimatePanel({
  element: hostElement,
  onControl: onControl = async () => {},
  onLayout: onLayout = () => {},
  modeHistory: modeHistory = createClimateModeHistory2(),
}: ClimatePanelOptions = {}) {
  const document = hostElement?.ownerDocument || globalThis.document,
    createElement = (tagName, className, textContent = "") =>
      domElement(document, tagName, className, textContent),
    replaceChildren = (containerElement, ...children) => {
      if (typeof containerElement.replaceChildren == "function")
        containerElement.replaceChildren(...children);
      else {
        for (const childNode of [...(containerElement.children || [])]) childNode.remove?.();
        containerElement.append(...children);
      }
    },
    rootElement = hostElement || createElement("section", "");
  rootElement.classList.add("i3d-climate-panel");
  const je2 = createPicker(rootElement, createElement),
    headingElement = createElement("div", "i3d-climate-heading"),
    titleElement = createElement("h3", "", "空调"),
    statusElement = createElement("p", "", "尚未绑定设备"),
    powerButton = createElement("button", "i3d-climate-power");
  powerButton.type = "button";
  const headingTextElement = createElement("div", "i3d-climate-heading-text");
  (headingTextElement.append(titleElement, statusElement),
    headingElement.append(headingTextElement, powerButton));
  const thermostatSlotElement = createElement("div", "i3d-climate-thermostat-slot"),
    thermostatElement = createElement("section", "hb-climate-thermostat"),
    decreaseButton = createElement("button", "hb-climate-temperature-step", "−"),
    increaseButton = createElement("button", "hb-climate-temperature-step", "+");
  ((decreaseButton.type = increaseButton.type = "button"),
    decreaseButton.setAttribute("aria-label", "降低设定温度"),
    increaseButton.setAttribute("aria-label", "提高设定温度"));
  const temperatureContentElement = createElement("div", "i3d-climate-temperature-content"),
    targetOutputElement = createElement("output", "i3d-climate-target"),
    currentTemperatureElement = createElement("span", "", "当前温度 --");
  (targetOutputElement.setAttribute("aria-label", "设定温度"),
    temperatureContentElement.append(
      createElement("small", "", "设定温度"),
      targetOutputElement,
      currentTemperatureElement,
    ),
    thermostatElement.append(decreaseButton, temperatureContentElement, increaseButton),
    thermostatSlotElement.append(thermostatElement));
  const awayModeButton = createElement("button", "i3d-climate-choice");
  ((awayModeButton.type = "button"),
    awayModeButton.setAttribute("aria-label", "离家模式"),
    awayModeButton.addEventListener("click", () =>
      requestControl("set_away_mode", !deviceState.away),
    ));
  const feedbackElement = createElement("p", "i3d-climate-feedback");
  (feedbackElement.setAttribute("role", "status"), (feedbackElement.hidden = true));
  const createFeedback = () =>
    createWaterHeaterFeedback2({
      onChange(feedbackText) {
        ((feedbackElement.textContent = feedbackText), (feedbackElement.hidden = !feedbackText));
      },
    });
  let feedbackTracker = createFeedback();
  const temperatureIntervalElement = createElement("p", "i3d-climate-temperature-interval"),
    mainGroupsElement = createElement("div", "i3d-climate-groups i3d-climate-main-groups"),
    emptyStateElement = createElement("p", "i3d-climate-empty"),
    errorElement = createElement("p", "i3d-climate-error"),
    fanSpeedGroupElement = createElement("section", "i3d-climate-option-group"),
    fanSpeedLabelElement = createElement("span", "", "风速"),
    fanSpeedRangeElement = createElement("input", "");
  ((fanSpeedRangeElement.type = "range"),
    (fanSpeedRangeElement.min = "0"),
    (fanSpeedRangeElement.max = "100"),
    fanSpeedRangeElement.setAttribute("aria-label", "净化器风速"),
    fanSpeedRangeElement.addEventListener("input", () => {
      fanSpeedLabelElement.textContent = "风速 " + fanSpeedRangeElement.value + "%";
    }),
    fanSpeedRangeElement.addEventListener("change", () =>
      requestControl("set_percentage", Number(fanSpeedRangeElement.value)),
    ));
  const speedLevelsElement = createElement("div", "i3d-climate-choices");
  (speedLevelsElement.setAttribute("role", "group"),
    speedLevelsElement.setAttribute("aria-label", "净化器风速档位"),
    fanSpeedGroupElement.append(fanSpeedLabelElement, fanSpeedRangeElement, speedLevelsElement));
  let lastSpeedSignature = "",
    list = [];
  (emptyStateElement.setAttribute("role", "status"), errorElement.setAttribute("role", "status"));
  const temperatureRangeElement = createElement("section", "i3d-climate-range"),
    rangeRows = [];
  for (const [rangeField, rangeLabel] of [
    ["target_temp_low", "温区下限"],
    ["target_temp_high", "温区上限"],
  ]) {
    const rangeRowElement = createElement("div", "hb-climate-thermostat"),
      rangeDecreaseButton = createElement("button", "hb-climate-temperature-step", "−"),
      rangeIncreaseButton = createElement("button", "hb-climate-temperature-step", "+");
    ((rangeDecreaseButton.type = rangeIncreaseButton.type = "button"),
      rangeDecreaseButton.setAttribute("aria-label", "降低" + rangeLabel),
      rangeIncreaseButton.setAttribute("aria-label", "提高" + rangeLabel));
    const rangeContentElement = createElement("div", "i3d-climate-temperature-content"),
      rangeOutputElement = createElement("output", "i3d-climate-range-value");
    (rangeOutputElement.setAttribute("aria-label", rangeLabel),
      rangeContentElement.append(createElement("small", "", rangeLabel), rangeOutputElement),
      rangeRowElement.append(rangeDecreaseButton, rangeContentElement, rangeIncreaseButton),
      temperatureRangeElement.append(rangeRowElement),
      rangeDecreaseButton.addEventListener("click", () => stepRangeValue(rangeField, -1)),
      rangeIncreaseButton.addEventListener("click", () => stepRangeValue(rangeField, 1)),
      rangeRows.push({
        field: rangeField,
        output: rangeOutputElement,
        decrease: rangeDecreaseButton,
        increase: rangeIncreaseButton,
      }));
  }
  const popupBodyElement = createElement("div", "i3d-popup-body");
  (popupBodyElement.append(
    awayModeButton,
    feedbackElement,
    thermostatSlotElement,
    temperatureRangeElement,
    temperatureIntervalElement,
    fanSpeedGroupElement,
    mainGroupsElement,
    emptyStateElement,
    errorElement,
  ),
    replaceChildren(rootElement, headingElement, popupBodyElement));
  const extrasGridElement = createElement("div", "i3d-climate-groups i3d-extra-grid");
  popupBodyElement.append(extrasGridElement);
  const purifierExtrasController = createPurifierExtras2({
    element: extrasGridElement,
    onControl: (extraControl) =>
      onControl(
        viewModel.item?.climateType === "bath-heater"
          ? {
              ...extraControl,
              deviceKind: "climate-extra",
            }
          : viewModel.item?.pedestalFan
            ? {
                ...extraControl,
                deviceKind: "fan-extra",
              }
            : deviceState.waterHeater
              ? {
                  ...extraControl,
                  deviceKind: "water-heater-extra",
                }
              : !viewModel.item?.airPurifier && !deviceState.purifier
                ? {
                    ...extraControl,
                    deviceKind: "climate-extra",
                  }
                : extraControl,
        viewModel.item,
      ),
    onLayout: onLayout,
  });
  let viewModel: ClimatePanelViewModel = {},
    deviceState: ClimateDeviceState = climateState2("", null),
    isDisposed = false,
    isSending = false,
    errorText = "",
    instanceId = 0,
    pendingRangeValues = null,
    draftTemperature = null,
    temperatureTimeoutId = null,
    renderedGroupsSignature = "",
    choiceButtons = [],
    pendingControlPromise = Promise.resolve(),
    pendingControlCount = 0;
  const canControl = () =>
      !isDisposed && !viewModel.editing && !viewModel.busy && deviceState.available,
    clearPendingState = () => {
      (temperatureTimeoutId !== null && clearTimeout(temperatureTimeoutId),
        (temperatureTimeoutId = null),
        (draftTemperature = null),
        (pendingRangeValues = null));
    };
  function resolveTemperature() {
    return draftTemperature ?? deviceState.temperature;
  }
  function syncTemperature(temperature = resolveTemperature()) {
    ((targetOutputElement.value = temperature === null ? "" : String(temperature)),
      (targetOutputElement.textContent =
        temperature === null ? "--" : "" + temperature + (deviceState.temperatureUnit || "°")),
      (currentTemperatureElement.textContent =
        deviceState.currentTemperature === null
          ? "当前温度 --"
          : "当前温度 " + deviceState.currentTemperature + (deviceState.temperatureUnit || "°")),
      (decreaseButton.disabled =
        !canControl() || (temperature !== null && temperature <= deviceState.minimum)),
      (increaseButton.disabled =
        !canControl() || (temperature !== null && temperature >= deviceState.maximum)));
  }
  function resolveRangeValues() {
    return (
      pendingRangeValues || {
        target_temp_low: deviceState.targetLow,
        target_temp_high: deviceState.targetHigh,
      }
    );
  }
  function stepRangeValue(rangeFieldKey, delta) {
    if (!canControl()) return;
    const baseRangeValues = resolveRangeValues(),
      nextRangeValues = {
        target_temp_low: baseRangeValues.target_temp_low ?? deviceState.minimum,
        target_temp_high: baseRangeValues.target_temp_high ?? deviceState.maximum,
      };
    ((nextRangeValues[rangeFieldKey] +=
      baseRangeValues[rangeFieldKey] === null ? 0 : delta * deviceState.step),
      (nextRangeValues[rangeFieldKey] =
        rangeFieldKey === "target_temp_low"
          ? Math.min(nextRangeValues[rangeFieldKey], nextRangeValues.target_temp_high)
          : Math.max(nextRangeValues[rangeFieldKey], nextRangeValues.target_temp_low)),
      requestControl("set_temperature", nextRangeValues));
  }
  async function sendControl(command) {
    if (!canControl()) return;
    const instanceAtSend = instanceId,
      previousControlPromise = pendingControlCount ? pendingControlPromise : null;
    let resolvePendingControl;
    ((pendingControlPromise = new Promise((resolvePromise) => {
      resolvePendingControl = resolvePromise;
    })),
      pendingControlCount++,
      (isSending = true),
      (errorText = ""),
      command.service === "set_temperature" &&
        (clearPendingState(),
        "temperature" in command.data
          ? (draftTemperature = command.data.temperature)
          : (pendingRangeValues = {
              ...command.data,
            }),
        (temperatureTimeoutId = setTimeout(() => {
          ((temperatureTimeoutId = null),
            (draftTemperature = null),
            (pendingRangeValues = null),
            isDisposed || render());
        }, 8000))),
      render());
    let feedbackSession = null;
    try {
      if (
        (previousControlPromise && (await previousControlPromise),
        isDisposed || instanceAtSend !== instanceId || !canControl())
      )
        return;
      (deviceState.waterHeater && (feedbackSession = feedbackTracker.begin(command)),
        await onControl(
          viewModel.item?.pedestalFan
            ? {
                ...command,
                deviceKind: "fan",
              }
            : command,
          viewModel.item,
        ),
        feedbackSession &&
          (feedbackTracker.sent(feedbackSession), feedbackTracker.sync(deviceState.raw)));
    } catch (controlError) {
      (feedbackSession && feedbackTracker.fail(feedbackSession, controlError?.message),
        !isDisposed &&
          instanceAtSend === instanceId &&
          ((errorText = controlError?.message || "设备控制失败，请重试。"),
          pendingControlCount === 1 && clearPendingState()));
    } finally {
      (resolvePendingControl(),
        !isDisposed &&
          instanceAtSend === instanceId &&
          (pendingControlCount--, (isSending = pendingControlCount > 0), render()));
    }
  }
  function requestControl(requestedService, controlValue) {
    if (canControl())
      try {
        return sendControl(climateControl2(deviceState, requestedService, controlValue));
      } catch (controlBuildError) {
        ((errorText = controlBuildError.message), render());
      }
  }
  function togglePower({ toggle: shouldToggle = true } = {}) {
    if (!canControl() || (!shouldToggle && deviceState.on)) return Promise.resolve(false);
    try {
      return sendControl(
        climatePowerControl2(
          deviceState,
          shouldToggle ? !deviceState.on : true,
          modeHistory.get(deviceState.entityId),
        ),
      );
    } catch (powerError) {
      return ((errorText = powerError.message), render(), Promise.resolve(false));
    }
  }
  (powerButton.addEventListener("click", () => togglePower()),
    decreaseButton.addEventListener("click", () =>
      requestControl(
        "set_temperature",
        resolveTemperature() === null
          ? deviceState.minimum
          : resolveTemperature() - deviceState.step,
      ),
    ),
    increaseButton.addEventListener("click", () =>
      requestControl(
        "set_temperature",
        resolveTemperature() === null
          ? deviceState.minimum
          : resolveTemperature() + deviceState.step,
      ),
    ));
  function buildChoiceGroups() {
    (je2.close(), replaceChildren(mainGroupsElement), (choiceButtons = []));
    const primaryGroupsElement = createElement("div", "i3d-climate-primary-groups");
    ((primaryGroupsElement.hidden = true), mainGroupsElement.append(primaryGroupsElement));
    for (const [groupLabel, optionValues, field, service, optionLabels] of [
      [
        "运行模式",
        deviceState.purifier
          ? deviceState.presetModes
          : deviceState.waterHeater && !deviceState.nativePower
            ? deviceState.modes
            : deviceState.modes.filter((mode) => mode !== "off"),
        deviceState.purifier ? "presetMode" : "mode",
        deviceState.purifier
          ? "set_preset_mode"
          : deviceState.waterHeater
            ? "set_operation_mode"
            : "set_hvac_mode",
        Object.fromEntries(
          (deviceState.purifier ? deviceState.presetModes : deviceState.modes).map((modeValue) => [
            modeValue,
            deviceState.purifier
              ? purifierPresetLabels[String(modeValue).trim().toLowerCase()] || modeValue
              : climateModeLabel2(
                  modeValue,
                  deviceState.waterHeater ? "water-heater" : "air-conditioner",
                ),
          ]),
        ),
      ],
      ["风速", deviceState.fanModes, "fanMode", "set_fan_mode", fanModeLabels],
      [
        deviceState.horizontalSwingModes?.length ? "上下摆风" : "摆风",
        deviceState.swingModes,
        "swingMode",
        "set_swing_mode",
        Object.fromEntries(
          deviceState.swingModes.map((swingMode) => [swingMode, formatSwingModeLabel(swingMode)]),
        ),
      ],
      [
        "左右摆风",
        deviceState.horizontalSwingModes || [],
        "horizontalSwingMode",
        "set_swing_horizontal_mode",
        Object.fromEntries(
          (deviceState.horizontalSwingModes || []).map((horizontalSwingValue) => [
            horizontalSwingValue,
            formatSwingModeLabel(horizontalSwingValue, "horizontal"),
          ]),
        ),
      ],
      [
        "预设模式",
        !deviceState.purifier && !deviceState.waterHeater ? deviceState.presetModes : [],
        "presetMode",
        "set_preset_mode",
        Object.fromEntries(
          (deviceState.presetModes || []).map((presetModeValue) => [
            presetModeValue,
            climateModeLabel2(presetModeValue),
          ]),
        ),
      ],
      [
        "方向",
        deviceState.purifier && deviceState.directionSupported ? ["forward", "reverse"] : [],
        "direction",
        "set_direction",
        {
          forward: "正向",
          reverse: "反向",
        },
      ],
    ]) {
      if (!optionValues.length) continue;
      const groupElement = createElement("section", "i3d-climate-option-group"),
        groupHeadingElement = createElement("h4", "", groupLabel);
      groupElement.append(groupHeadingElement);
      const includes =
          !deviceState.purifier &&
          !deviceState.waterHeater &&
          ["mode", "fanMode", "presetMode"].includes(field),
        groupContainer = includes ? primaryGroupsElement : mainGroupsElement;
      if (
        (includes && (primaryGroupsElement.hidden = false),
        includes ||
          (!deviceState.purifier &&
            !deviceState.waterHeater &&
            (optionValues.length > 4 ||
              optionValues.some(
                (listedOption) => [...(optionLabels[listedOption] || listedOption)].length > 8,
              ))))
      ) {
        const groupPicker = je2.create(groupLabel, optionValues, optionLabels, (pickedValue) =>
          requestControl(service, pickedValue),
        );
        (choiceButtons.push(
          Object.assign(groupPicker, {
            field: field,
            select: true,
          }),
        ),
          groupElement.append(groupPicker.picker),
          groupContainer.append(groupElement));
        continue;
      }
      const choicesElement = createElement("div", "i3d-climate-choices");
      (choicesElement.setAttribute("role", "group"),
        choicesElement.setAttribute("aria-label", groupLabel),
        viewModel.item?.pedestalFan &&
          field === "presetMode" &&
          choicesElement.classList.add("i3d-fan-modes"));
      for (const optionValue of optionValues) {
        const optionButton = createElement(
          "button",
          "i3d-climate-choice",
          optionLabels[optionValue] || optionValue,
        );
        ((optionButton.type = "button"),
          optionButton.addEventListener("click", () => requestControl(service, optionValue)),
          choiceButtons.push({
            element: optionButton,
            field: field,
            value: optionValue,
          }),
          choicesElement.append(optionButton));
      }
      (groupElement.append(choicesElement), groupContainer.append(groupElement));
    }
    if (deviceState.purifier && deviceState.oscillatingSupported) {
      const oscillatingGroupElement = createElement("section", "i3d-climate-option-group"),
        oscillatingTitleElement = createElement(
          "h4",
          "",
          viewModel.item?.pedestalFan ? "摇头" : "摆动",
        ),
        oscillatingButton = createElement(
          "button",
          "i3d-climate-choice",
          deviceState.oscillating ? "已开启" : "已关闭",
        );
      ((oscillatingButton.type = "button"),
        oscillatingButton.addEventListener("click", () =>
          requestControl("oscillate", !deviceState.oscillating),
        ),
        choiceButtons.push({
          element: oscillatingButton,
          field: "oscillating",
          value: true,
        }),
        oscillatingGroupElement.append(oscillatingTitleElement, oscillatingButton),
        mainGroupsElement.append(oscillatingGroupElement));
    }
  }
  function render() {
    if (isDisposed) return;
    const activeItem = viewModel.item || {},
      hasEntity = !!activeItem.entityId,
      isControllable = canControl();
    (rootElement.setAttribute(
      "aria-label",
      activeItem.climateType === "bath-heater"
        ? "浴霸控制"
        : deviceState.waterHeater
          ? "热水器控制"
          : activeItem.airPurifier
            ? "空气净化器控制"
            : deviceState.purifier
              ? "风扇控制"
              : "空调控制",
    ),
      (titleElement.textContent = activeItem.label || deviceState.name || "空调"),
      (titleElement.title = titleElement.textContent),
      (statusElement.textContent = viewModel.editing
        ? "控制预览"
        : hasEntity
          ? deviceState.available
            ? deviceState.on
              ? climateModeLabel2(deviceState.mode)
              : "已关闭"
            : "设备不可用"
          : "尚未绑定设备"),
      deviceState.purifier &&
        deviceState.available &&
        !viewModel.editing &&
        (statusElement.textContent = deviceState.on
          ? activeItem.pedestalFan
            ? "运行中"
            : "净化中"
          : "已关闭"),
      deviceState.waterHeater &&
        deviceState.available &&
        !viewModel.editing &&
        (statusElement.textContent = waterHeaterStatusLabel2(deviceState.raw)),
      activeItem.waterHeater &&
        !hasEntity &&
        !viewModel.editing &&
        (activeItem.deviceId || activeItem.extraControls?.length) &&
        (statusElement.textContent = "各功能独立控制"),
      activeItem.climateType === "bath-heater" &&
        !viewModel.editing &&
        (statusElement.textContent = bathHeaterState2(activeItem, viewModel.states).label));
    const purifierStatus = activeItem.airPurifier
      ? purifierState2(activeItem, viewModel.states)
      : null;
    (purifierStatus && !viewModel.editing && (statusElement.textContent = purifierStatus.label),
      rootElement.classList.toggle(
        "is-air-conditioner-panel",
        !deviceState.purifier && !deviceState.waterHeater,
      ),
      rootElement.classList.toggle("is-fan-panel", !!activeItem.pedestalFan),
      (fanSpeedRangeElement.className = "i3d-control-range"),
      fanSpeedRangeElement.setAttribute(
        "aria-label",
        activeItem.pedestalFan ? "电风扇风速" : "净化器风速",
      ),
      speedLevelsElement.setAttribute(
        "aria-label",
        activeItem.pedestalFan ? "电风扇风速档位" : "净化器风速档位",
      ));
    const displayState = purifierStatus || deviceState;
    ((rootElement.dataset.climateMode = displayState.available ? displayState.visualMode : "off"),
      rootElement.classList.toggle("is-preview", !!viewModel.editing),
      rootElement.classList.toggle("is-on", displayState.available && displayState.on),
      rootElement.classList.toggle("is-running", displayState.available && displayState.running),
      (awayModeButton.hidden = !deviceState.waterHeater || !deviceState.awaySupported),
      (awayModeButton.disabled = !isControllable || isSending),
      (awayModeButton.textContent = deviceState.away ? "离家模式 · 已开启" : "离家模式 · 已关闭"),
      awayModeButton.setAttribute("aria-pressed", String(!!deviceState.away)),
      (powerButton.hidden =
        !!(
          (activeItem.climateType === "bath-heater" || activeItem.airPurifier) &&
          !activeItem.entityId
        ) || !!(deviceState.waterHeater && !deviceState.canTurnOn && !deviceState.canTurnOff)),
      (powerButton.textContent = deviceState.on ? "关闭" : "开启"),
      rootElement.setAttribute("aria-busy", String(isSending || !!viewModel.busy)),
      (powerButton.disabled =
        !isControllable ||
        (!deviceState.turnOnSupported && !deviceState.modes.some((modeId) => modeId !== "off")) ||
        (deviceState.on && !deviceState.waterHeater && !deviceState.modes.includes("off"))),
      !deviceState.waterHeater &&
        !deviceState.purifier &&
        (powerButton.disabled =
          !isControllable || (deviceState.on ? !deviceState.canTurnOff : !deviceState.canTurnOn)),
      deviceState.waterHeater &&
        (powerButton.disabled =
          !isControllable ||
          isSending ||
          (deviceState.on ? !deviceState.canTurnOff : !deviceState.canTurnOn)),
      powerButton.setAttribute("aria-pressed", String(deviceState.on)),
      powerButton.setAttribute(
        "aria-label",
        titleElement.textContent +
          "，" +
          (deviceState.on ? "关闭" : "开启") +
          (activeItem.climateType === "bath-heater"
            ? "浴霸主实体"
            : deviceState.waterHeater
              ? "热水器"
              : activeItem.pedestalFan
                ? "电风扇"
                : deviceState.purifier
                  ? "空气净化器"
                  : "空调"),
      ),
      (thermostatSlotElement.hidden = targetOutputElement.hidden =
        !deviceState.temperatureSupported || deviceState.useTemperatureRange),
      (temperatureRangeElement.hidden = !deviceState.useTemperatureRange),
      (fanSpeedGroupElement.hidden = !deviceState.purifier || !deviceState.percentageSupported),
      (fanSpeedRangeElement.disabled = !isControllable),
      (fanSpeedRangeElement.step = String(deviceState.percentageStep || 1)),
      (fanSpeedRangeElement.value = String(deviceState.percentage ?? 0)),
      (fanSpeedLabelElement.textContent = "风速 " + (deviceState.percentage ?? "--") + "%"));
    const speedLevels = deviceState.speedLevels || [],
      stringify = JSON.stringify([deviceState.entityId, speedLevels]);
    ((fanSpeedRangeElement.hidden = speedLevels.length > 0),
      (speedLevelsElement.hidden = !speedLevels.length),
      lastSpeedSignature !== stringify &&
        ((lastSpeedSignature = stringify),
        replaceChildren(speedLevelsElement),
        (list = speedLevels.map((speedLevel) => {
          const speedChoiceButton = createElement("button", "i3d-climate-choice", speedLevel.label);
          return (
            (speedChoiceButton.type = "button"),
            speedChoiceButton.addEventListener("click", () =>
              requestControl("set_percentage", speedLevel.percentage),
            ),
            speedLevelsElement.append(speedChoiceButton),
            {
              button: speedChoiceButton,
              ...speedLevel,
            }
          );
        }))));
    let activeSpeedIndex = -1;
    (deviceState.on &&
      deviceState.percentage > 0 &&
      (activeSpeedIndex = speedLevels.findIndex(
        (speedEntry) => Math.abs(speedEntry.percentage - deviceState.percentage) <= 1,
      )),
      speedLevels.length &&
        (fanSpeedLabelElement.textContent =
          activeSpeedIndex >= 0
            ? "风速 · " + speedLevels[activeSpeedIndex].label
            : deviceState.presetMode
              ? "风速 · 由模式控制"
              : deviceState.on
                ? "风速 " + (deviceState.percentage ?? "--") + "%"
                : "风速 · 已关闭"),
      list.forEach(({ button: speedButton }, speedIndex) => {
        ((speedButton.disabled = !isControllable),
          speedButton.setAttribute("aria-pressed", String(speedIndex === activeSpeedIndex)));
      }),
      syncTemperature());
    const rangeValues = resolveRangeValues();
    for (const rangeRow of rangeRows) {
      const rowValue = rangeValues[rangeRow.field],
        isLowerBound = rangeRow.field === "target_temp_low";
      ((rangeRow.output.textContent =
        rowValue == null ? "--" : "" + rowValue + (deviceState.temperatureUnit || "°")),
        (rangeRow.decrease.disabled =
          !isControllable ||
          (rowValue !== null &&
            rowValue <=
              (isLowerBound
                ? deviceState.minimum
                : (rangeValues.target_temp_low ?? deviceState.minimum)))),
        (rangeRow.increase.disabled =
          !isControllable ||
          (rowValue !== null &&
            rowValue >=
              (isLowerBound
                ? (rangeValues.target_temp_high ?? deviceState.maximum)
                : deviceState.maximum))));
    }
    ((temperatureIntervalElement.hidden = deviceState.waterHeater
      ? deviceState.temperatureSupported ||
        (deviceState.currentTemperature === null && deviceState.temperature === null)
      : !deviceState.useTemperatureRange &&
        (deviceState.temperatureSupported ||
          deviceState.currentTemperature === null ||
          deviceState.purifier)),
      (temperatureIntervalElement.textContent = deviceState.waterHeater
        ? "当前水温 " +
          (deviceState.currentTemperature ?? "--") +
          deviceState.temperatureUnit +
          " · 目标 " +
          (deviceState.temperature ?? "--") +
          deviceState.temperatureUnit +
          "（只读）"
        : "当前温度 " +
          (deviceState.currentTemperature ?? "--") +
          (deviceState.temperatureUnit || "°")));
    const optionsSignature = JSON.stringify([
      deviceState.entityId,
      !!activeItem.pedestalFan,
      deviceState.modes,
      deviceState.fanModes,
      deviceState.swingModes,
      deviceState.horizontalSwingModes,
      deviceState.presetModes,
      deviceState.directionSupported,
      deviceState.oscillatingSupported,
      deviceState.nativePower,
    ]);
    renderedGroupsSignature !== optionsSignature &&
      ((renderedGroupsSignature = optionsSignature), buildChoiceGroups());
    for (const controlEntry of choiceButtons)
      if (
        (controlEntry.field === "oscillating" &&
          (controlEntry.element.textContent = deviceState.oscillating ? "已开启" : "已关闭"),
        (controlEntry.element.disabled = !isControllable),
        controlEntry.select)
      ) {
        const entryValue = deviceState[controlEntry.field] || "",
          entryLabel =
            controlEntry.labels[entryValue] ||
            (controlEntry.field === "mode" ? climateModeLabel2(entryValue) : entryValue);
        je2.sync(controlEntry, entryValue, entryLabel, !isControllable);
      } else
        controlEntry.element.setAttribute(
          "aria-pressed",
          String(deviceState[controlEntry.field] === controlEntry.value),
        );
    ((emptyStateElement.hidden =
      deviceState.available &&
      (deviceState.purifier ||
        deviceState.temperatureSupported ||
        deviceState.rangeSupported ||
        deviceState.canTurnOn ||
        deviceState.canTurnOff ||
        choiceButtons.length > 0 ||
        (deviceState.waterHeater &&
          (deviceState.canTurnOn || deviceState.canTurnOff || deviceState.awaySupported)))),
      (activeItem.climateType === "bath-heater" ||
        activeItem.airPurifier ||
        activeItem.waterHeater) &&
        activeItem.extraControls?.length &&
        (emptyStateElement.hidden = true),
      (emptyStateElement.textContent =
        activeItem.waterHeater && !hasEntity && activeItem.deviceId
          ? "请在附加功能中选择要显示的功能"
          : hasEntity
            ? deviceState.raw?.state === "unavailable"
              ? "设备离线"
              : ""
            : "尚未绑定设备"),
      (emptyStateElement.hidden ||= !emptyStateElement.textContent),
      (errorElement.textContent = viewModel.error || errorText),
      (errorElement.hidden = !errorElement.textContent));
  }
  function update(nextViewModel: ClimatePanelViewModel = {}) {
    if (isDisposed) return;
    const nextEntityId = nextViewModel.item?.entityId || "";
    nextEntityId !== deviceState.entityId &&
      (instanceId++,
      (pendingControlCount = 0),
      (pendingControlPromise = Promise.resolve()),
      (isSending = false),
      (errorText = ""),
      clearPendingState(),
      feedbackTracker.dispose(),
      (feedbackTracker = createFeedback()),
      (feedbackElement.textContent = ""),
      (feedbackElement.hidden = true));
    const useTemperatureRange = deviceState.useTemperatureRange;
    ((viewModel = nextViewModel),
      purifierExtrasController.update({
        item: nextViewModel.item,
        states: nextViewModel.states || {},
        editing: nextViewModel.editing || nextViewModel.busy,
      }),
      (deviceState =
        nextViewModel.state?.entityId === nextEntityId && Array.isArray(nextViewModel.state?.modes)
          ? nextViewModel.state
          : climateState2(nextEntityId, nextViewModel.state)),
      nextViewModel.item?.airPurifier &&
        !nextEntityId &&
        (deviceState = {
          ...deviceState,
          purifier: true,
          name: "空气净化器",
        }),
      nextViewModel.item?.waterHeater &&
        !nextEntityId &&
        (deviceState = {
          ...deviceState,
          waterHeater: true,
          name: "热水器",
        }),
      useTemperatureRange !== deviceState.useTemperatureRange && clearPendingState(),
      deviceState.waterHeater && feedbackTracker.sync(deviceState.raw),
      nextViewModel.editing || modeHistory.observe(nextEntityId, deviceState.raw),
      draftTemperature !== null &&
        deviceState.temperature !== null &&
        Math.abs(deviceState.temperature - draftTemperature) <
          Math.max(0.001, deviceState.step / 100) &&
        clearPendingState(),
      pendingRangeValues &&
        ["target_temp_low", "target_temp_high"].every(
          (rangeFieldName, rangeIndex) =>
            [deviceState.targetLow, deviceState.targetHigh][rangeIndex] !== null &&
            Math.abs(
              [deviceState.targetLow, deviceState.targetHigh][rangeIndex] -
                pendingRangeValues[rangeFieldName],
            ) < Math.max(0.001, deviceState.step / 100),
        ) &&
        clearPendingState(),
      render());
  }
  function dispose() {
    isDisposed ||
      ((isDisposed = true),
      instanceId++,
      je2.close(),
      clearPendingState(),
      feedbackTracker.dispose(),
      purifierExtrasController.dispose(),
      replaceChildren(rootElement));
  }
  return (
    render(),
    {
      root: rootElement,
      update: update,
      power: togglePower,
      dispose: dispose,
      cancelPending() {
        (instanceId++,
          je2.close(),
          (pendingControlCount = 0),
          (pendingControlPromise = Promise.resolve()),
          (isSending = false),
          clearPendingState(),
          feedbackTracker.dispose(),
          (feedbackTracker = createFeedback()),
          (feedbackElement.textContent = ""),
          (feedbackElement.hidden = true));
      },
    }
  );
}
