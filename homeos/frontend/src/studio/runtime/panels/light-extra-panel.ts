/**
 * 灯光附加面板：电源、亮度、色温、色盘、RGBW/RGBWW 通道、灯效、闪烁、渐变。
 *
 * 与 0.7.8 保持一致的能力裁剪：
 * - 有 `brightness` 模式才给亮度条；
 * - `color_temp` 且色温上下限合法才给色温条；
 * - 灯效 / 闪烁 / 渐变分别受 supported_features 的 4 / 8 / 32 位控制；
 * - 亮度拖到 0 直接 `turn_off`，而不是 `turn_on(brightness=0)`。
 */
const lightRuntime = await import("@app/renderer/controls/light-runtime");
import { enhancePopupSelects } from "@app/shared/util/select-picker";
import { createRangeFeedback } from "@app/shared/util/control-timeout";
import {
  attributesOf,
  brightnessModes,
  extraContextChanged,
  featureFlags,
  haNumber,
  stringOptions,
} from "../device/entity-capabilities";
import { createLightColorPicker } from "../light/light-color-picker";
import { attachFeedback } from "./panel-utils";
import type { ExtraPanelViewModel, FeedbackSlot } from "./panel-utils";

/** supported_features 位：灯效 / 闪烁 / 渐变。 */
const LIGHT_EFFECT = 0x4;
const LIGHT_FLASH = 0x8;
const LIGHT_TRANSITION = 0x20;

const CHANNEL_LABELS = ["红", "绿", "蓝", "白", "暖白"];

function lightExtraCapabilities(state: any) {
  const attributes = attributesOf(state);
  const modes = stringOptions(attributes.supported_color_modes);
  const flags = featureFlags(attributes);
  const minKelvin = haNumber(attributes.min_color_temp_kelvin);
  const maxKelvin = haNumber(attributes.max_color_temp_kelvin);
  return {
    a: attributes,
    modes,
    brightness: modes.some((mode) => brightnessModes.has(mode)),
    color: lightRuntime.lightSupportsColor(attributes),
    temperature:
      modes.includes("color_temp") &&
      minKelvin !== null &&
      (minKelvin as number) > 0 &&
      maxKelvin !== null &&
      (maxKelvin as number) >= (minKelvin as number),
    white: modes.includes("white"),
    effects: flags & LIGHT_EFFECT ? stringOptions(attributes.effect_list) : [],
    flash: !!(flags & LIGHT_FLASH),
    transition: !!(flags & LIGHT_TRANSITION),
  };
}

type LightField = {
  row: HTMLElement;
  input: any;
  readout: HTMLElement;
  label: string;
  type: string;
};

type LightExtraPanelOptions = {
  element: any;
  headerControls?: any;
  feedbackSlot?: FeedbackSlot;
  onControl?: (command: any) => Promise<any>;
};

export function createLightExtraPanel({
  element: hostElement,
  headerControls,
  feedbackSlot,
  onControl = async () => {},
}: LightExtraPanelOptions) {
  const pickers = enhancePopupSelects(hostElement);
  const ownerDocument = hostElement.ownerDocument || globalThis.document;
  const createElement = (tagName: string, textContent = "") => {
    const node = ownerDocument.createElement(tagName);
    node.textContent = textContent;
    return node;
  };

  hostElement.classList.add("i3d-extra-light");
  const statusElement = createElement("p");
  const powerButton = createElement("button") as HTMLButtonElement;
  const formElement = createElement("div");
  const errorElement = createElement("p");
  powerButton.type = "button";
  powerButton.className = "i3d-climate-choice";
  powerButton.setAttribute("role", "switch");
  formElement.className = "i3d-extra-form";
  errorElement.className = "i3d-climate-error";
  errorElement.setAttribute("role", "status");

  let viewModel: ExtraPanelViewModel | null = null;
  let disposed = false;
  let generation = 0;
  let busy = false;
  let contextSignature = "";

  const feedback = createRangeFeedback({
    onChange: refresh,
    onTimeout: () => {
      errorElement.textContent = "设备未响应，请重试。";
    },
  });
  const fields = new Map<string, any>();

  const colorPicker = createLightColorPicker({
    onPreview: () => null,
    onCancel: () => {},
    onCommit: (hsColor: any) =>
      void sendCommand(
        "turn_on",
        lightRuntime.lightColorServiceData(attributesOf(viewModel?.state), hsColor),
      ),
  });

  const isUsable = () =>
    !!viewModel &&
    viewModel.state?.available !== false &&
    !["unknown", "unavailable", "", undefined].includes(viewModel.state?.state) &&
    viewModel.item?.modelAvailable !== false;

  const isDisabled = () => busy || !viewModel || viewModel.editing || !isUsable();

  async function sendCommand(service: string, data: any = {}, rangeKey?: string, rangeEntry?: any) {
    if (isDisabled()) return;
    const requestGeneration = generation;
    busy = true;
    errorElement.textContent = "";
    refresh();
    try {
      await onControl({
        entityId: viewModel!.item.entityId,
        domain: "light",
        service,
        data,
      });
      if (disposed || requestGeneration !== generation) return;
      errorElement.textContent = "";
    } catch (error: any) {
      if (!disposed && requestGeneration === generation) {
        if (rangeKey && rangeEntry) feedback.cancel(rangeKey, rangeEntry);
        errorElement.textContent = error?.message || "灯光控制失败";
      }
    } finally {
      if (!disposed && requestGeneration === generation) {
        busy = false;
        refresh();
      }
    }
  }

  function buildField(
    key: string,
    labelText: string,
    type: string,
    min: any = null,
    max: any = null,
    step: any = null,
    service = "turn_on",
    dataKey = key,
  ) {
    const row = createElement("label");
    const readout = createElement("span", labelText);
    const input = createElement(type === "select" ? "select" : "input") as any;
    row.className = "i3d-extra-field";
    input.setAttribute("aria-label", labelText);
    input.name = `i3d-extra-light-${key}`;
    if (type !== "select") {
      input.type = type;
      input.min = min;
      input.max = max;
      input.step = step;
    }
    if (type === "range") {
      input.addEventListener("input", () => {
        if (input.disabled) return;
        feedback.preview(key, Number(input.value));
        readout.textContent = `${labelText} ${input.value}`;
      });
    }
    input.addEventListener("change", () => {
      const value = type === "select" ? input.value : Number(input.value);
      if (key === "transition" || isDisabled()) return;
      const rangeEntry = type === "range" ? feedback.commit(key, value) : null;
      const data: any = { [dataKey]: value };
      const transitionField = fields.get("transition");
      if (transitionField && Number(transitionField.input.value) > 0) {
        data.transition = Number(transitionField.input.value);
      }
      if (key === "brightness" && value === 0) {
        delete data.brightness;
        void sendCommand("turn_off", data, key, rangeEntry);
      } else {
        void sendCommand(service, data, key, rangeEntry);
      }
    });
    for (const eventName of ["blur", "pointercancel"]) {
      input.addEventListener(eventName, () => {
        feedback.cancelPreview(key);
        refresh();
      });
    }
    row.append(readout, input);
    formElement.append(row);
    fields.set(key, { row, input, readout, label: labelText, type });
    return input;
  }

  function rebuild(capabilities: any) {
    feedback.reset();
    fields.clear();
    formElement.replaceChildren();
    colorPicker.root.hidden = true;

    if (capabilities.brightness) buildField("brightness", "亮度", "range", 0, 255, 1);
    if (capabilities.temperature) {
      buildField(
        "color_temp_kelvin",
        "色温 K",
        "range",
        capabilities.a.min_color_temp_kelvin,
        capabilities.a.max_color_temp_kelvin,
        1,
      );
    }
    if (capabilities.color) formElement.append(colorPicker.root);
    if (capabilities.white) buildField("white", "独立白光", "range", 0, 255, 1);

    for (const [mode, channels] of [
      ["rgbw", 4],
      ["rgbww", 5],
    ] as const) {
      if (!capabilities.modes.includes(mode)) continue;
      const channelSet = createElement("fieldset");
      const legend = createElement("legend", mode === "rgbw" ? "RGBW 通道" : "RGBWW 通道");
      channelSet.append(legend);
      channelSet.className = "i3d-extra-channels";
      formElement.append(channelSet);
      const inputs: HTMLInputElement[] = [];
      for (let index = 0; index < channels; index++) {
        const channelRow = createElement("label");
        const channelInput = createElement("input") as HTMLInputElement;
        channelRow.append(
          createElement("span", CHANNEL_LABELS[index]),
          channelInput,
        );
        channelInput.type = "number";
        channelInput.min = "0";
        channelInput.max = "255";
        channelInput.step = "1";
        channelInput.setAttribute("aria-label", `${mode.toUpperCase()} ${CHANNEL_LABELS[index]}`);
        channelSet.append(channelRow);
        inputs.push(channelInput);
      }
      const applyButton = createElement("button", "应用通道") as HTMLButtonElement;
      applyButton.type = "button";
      applyButton.className = "i3d-climate-choice";
      channelSet.append(applyButton);
      applyButton.addEventListener("click", () => {
        const values = inputs.map((input) => (input.value === "" ? NaN : Number(input.value)));
        if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
          errorElement.textContent = "每个通道请输入 0–255。";
          return;
        }
        void sendCommand("turn_on", { [`${mode}_color`]: values });
      });
      fields.set(mode, { row: channelSet, inputs, apply: applyButton, channel: true });
    }

    if (capabilities.effects.length) {
      const effectSelect = buildField("effect", "灯效", "select");
      for (const effect of capabilities.effects) {
        const option = createElement("option", effect) as HTMLOptionElement;
        option.value = effect;
        effectSelect.append(option);
      }
    }
    if (capabilities.flash) {
      const flashSelect = buildField("flash", "闪烁", "select");
      for (const [value, label] of [
        ["", "选择闪烁"],
        ["short", "短闪"],
        ["long", "长闪"],
      ]) {
        const option = createElement("option", label) as HTMLOptionElement;
        option.value = value;
        flashSelect.append(option);
      }
      flashSelect.addEventListener("change", () => {
        flashSelect.value = "";
      });
    }
    if (capabilities.transition) {
      const transitionInput = buildField("transition", "渐变秒数", "number", 0, 300, 0.1);
      transitionInput.value = "0";
    }
    pickers.close();
  }

  function refresh() {
    if (!viewModel || disposed) return;
    const capabilities = lightExtraCapabilities(viewModel.state);
    const signature = JSON.stringify([
      capabilities.modes,
      capabilities.effects,
      capabilities.flash,
      capabilities.transition,
      capabilities.a.min_color_temp_kelvin,
      capabilities.a.max_color_temp_kelvin,
    ]);
    if (signature !== contextSignature) {
      contextSignature = signature;
      rebuild(capabilities);
    }

    const isOn = viewModel.state?.state === "on";
    const unknown = viewModel.state?.state === "unknown";
    statusElement.textContent = isUsable()
      ? isOn
        ? "已开启"
        : "已关闭"
      : unknown
        ? "状态未知"
        : "设备不可用";
    statusElement.hidden = isUsable();
    statusElement.title = statusElement.textContent;
    powerButton.textContent = isOn ? "关闭" : "开启";
    powerButton.setAttribute("aria-checked", String(isOn));
    powerButton.disabled = isDisabled();
    powerButton.setAttribute("aria-label", `${viewModel.item.label || "灯光"}电源`);

    for (const [key, field] of fields) {
      if (field.channel) {
        const channelColor = capabilities.a[`${key}_color`];
        field.inputs.forEach((input: HTMLInputElement, index: number) => {
          input.disabled = isDisabled();
          if (ownerDocument.activeElement !== input) {
            input.value =
              Array.isArray(channelColor) && haNumber(channelColor[index]) !== null
                ? channelColor[index]
                : "";
          }
        });
        field.apply.disabled = isDisabled();
        continue;
      }
      field.input.disabled = isDisabled();
      let value =
        key === "brightness"
          ? isOn
            ? haNumber(capabilities.a.brightness)
            : 0
          : key === "white"
            ? capabilities.a.color_mode === "white"
              ? haNumber(capabilities.a.brightness)
              : null
            : capabilities.a[key];
      if (!["transition", "flash"].includes(key)) {
        if (field.type === "range") value = feedback.read(key, haNumber(value), 0.5);
        if (field.type === "range" || !pickers.focused(field.input)) {
          field.input.value = value ?? (field.type === "range" ? field.input.min : "");
        }
        field.readout.textContent =
          field.type === "range" ? `${field.label} ${value ?? "暂无读数"}` : field.label;
      }
    }

    colorPicker.update({
      entityId: viewModel.item.entityId,
      enabled: !isDisabled(),
      visible: capabilities.color,
      hs: lightRuntime.lightColorHs(capabilities.a) || [0, 0],
    });
    if (headerControls) hostElement.hidden = !formElement.childElementCount && !errorElement.textContent;
    pickers.sync();
  }

  powerButton.addEventListener("click", () =>
    void sendCommand(viewModel?.state?.state === "on" ? "turn_off" : "turn_on"),
  );
  if (headerControls) {
    headerControls.replaceChildren(statusElement, powerButton);
    hostElement.replaceChildren(formElement, errorElement);
  } else {
    const heading = createElement("div");
    heading.className = "i3d-extra-light-heading";
    heading.append(statusElement, powerButton);
    hostElement.replaceChildren(heading, formElement, errorElement);
  }
  const releaseFeedback = attachFeedback(feedbackSlot, errorElement, {
    source: () => viewModel?.item?.entityId,
    label: () => viewModel?.item?.label,
  });

  return {
    root: hostElement,
    update(nextViewModel: ExtraPanelViewModel) {
      if (disposed) return;
      if (extraContextChanged(viewModel, nextViewModel)) {
        feedback.reset();
        pickers.close();
        generation++;
        busy = false;
        errorElement.textContent = "";
      }
      viewModel = nextViewModel;
      refresh();
    },
    dispose() {
      feedback.reset();
      disposed = true;
      pickers.dispose();
      releaseFeedback();
      generation++;
      colorPicker.dispose();
      viewModel = null;
      headerControls?.replaceChildren();
      hostElement.replaceChildren();
    },
  };
}
