/**
 * 复合设备面板：加湿器 / 阀门 / 割草机 / 警报器 / 安防面板 / 扫地机 / 温控。
 *
 * 这些域各自有 2~6 个服务 + 一组能力位，状态词也比开关丰富。面板把
 * "动作按钮 / 参数表单 / 只读读数"三块拆开，动作按 supported_features 裁剪。
 */
import { createRangeFeedback } from "@app/shared/util/control-timeout";
import { enhancePopupSelects } from "@app/shared/util/select-picker";
import {
  attributesOf,
  extraContextChanged,
  featureFlags,
  haNumber,
  stringOptions,
} from "../device/entity-capabilities";
import { attachFeedback, EXTRA_STATE_LABELS } from "./panel-utils";
import type { ExtraPanelViewModel, FeedbackSlot } from "./panel-utils";

export type CompoundField = {
  key: string;
  label: string;
  type: string;
  attribute?: string;
  service?: string;
  min?: number;
  max?: number;
  step?: number;
  choices?: string[];
  draft?: boolean;
  json?: boolean;
  lines?: boolean;
};

export type CompoundAction = {
  service: string;
  label: string;
  confirm?: boolean;
  form?: boolean;
  keys?: string[];
};

export type CompoundSpec = {
  actions: CompoundAction[];
  fields: CompoundField[];
  readouts: Array<[string, string]>;
};

const readout = (attributes: any, key: string, unit = "") =>
  attributes[key] == null ? "暂无读数" : `${attributes[key]}${unit}`;

/** 各域 supported_features 位。 */
const HUMIDIFIER_MODE = 0x1;
const VALVE_OPEN = 0x1;
const VALVE_CLOSE = 0x2;
const VALVE_SET_POSITION = 0x4;
const VALVE_STOP = 0x8;
const CLIMATE_HUMIDITY = 0x4;
const SIREN_TONES = 0x4;
const SIREN_VOLUME = 0x8;
const SIREN_DURATION = 0x10;
const ALARM_HOME = 0x1;
const ALARM_AWAY = 0x2;
const ALARM_NIGHT = 0x4;
const ALARM_TRIGGER = 0x8;
const ALARM_CUSTOM = 0x10;
const ALARM_VACATION = 0x20;
const VACUUM_PAUSE = 0x4;
const VACUUM_STOP = 0x8;
const VACUUM_RETURN = 0x10;
const VACUUM_LOCATE = 0x200;
const VACUUM_CLEAN_SPOT = 0x400;
const VACUUM_FAN_SPEED = 0x20;
const VACUUM_SEND_COMMAND = 0x100;
const VACUUM_START = 0x2000;
const VACUUM_CLEAN_AREA = 0x4000;

function compoundExtraSpec(domain: string, state: any): CompoundSpec {
  const attributes = attributesOf(state);
  const flags = featureFlags(attributes);
  const actions: CompoundAction[] = [];
  const fields: CompoundField[] = [];
  const readouts: Array<[string, string]> = [];

  const addAction = (
    service: string,
    label: string,
    bit = 0,
    extra: Partial<CompoundAction> = {},
  ) => {
    if (!bit || flags & bit) actions.push({ service, label, ...extra });
  };
  const addRange = (
    key: string,
    label: string,
    attribute: string,
    min: any,
    max: any,
    step: any,
    service: string,
    bit = 0,
  ) => {
    const numericMin = haNumber(min);
    const numericMax = haNumber(max);
    const numericStep = haNumber(step);
    if (
      (!bit || flags & bit) &&
      numericMin !== null &&
      numericMax !== null &&
      (numericMin as number) < (numericMax as number) &&
      numericStep !== null &&
      (numericStep as number) > 0
    ) {
      fields.push({
        key,
        label,
        attribute,
        min: numericMin as number,
        max: numericMax as number,
        step: numericStep as number,
        service,
        type: "range",
      });
    }
  };
  const addSelect = (
    key: string,
    label: string,
    attribute: string,
    choices: any,
    service: string,
    bit = 0,
  ) => {
    const options = stringOptions(choices);
    if ((!bit || flags & bit) && options.length) {
      fields.push({ key, label, attribute, choices: options, service, type: "select" });
    }
  };

  if (domain === "climate") {
    if (attributes.current_humidity != null) {
      readouts.push(["当前湿度", readout(attributes, "current_humidity", "%")]);
    }
    addRange(
      "humidity",
      "目标湿度",
      "humidity",
      attributes.min_humidity,
      attributes.max_humidity,
      1,
      "set_humidity",
      CLIMATE_HUMIDITY,
    );
  } else if (domain === "humidifier") {
    readouts.push(["当前湿度", readout(attributes, "current_humidity", "%")]);
    addAction("turn_on", "开启");
    addAction("turn_off", "关闭");
    addRange(
      "humidity",
      "目标湿度",
      "humidity",
      attributes.min_humidity,
      attributes.max_humidity,
      1,
      "set_humidity",
    );
    addSelect("mode", "运行模式", "mode", attributes.available_modes, "set_mode", HUMIDIFIER_MODE);
  } else if (domain === "valve") {
    readouts.push(["当前开度", readout(attributes, "current_position", "%")]);
    addAction("open_valve", "打开", VALVE_OPEN, { confirm: attributes.device_class === "gas" });
    addAction("close_valve", "关闭", VALVE_CLOSE);
    addAction("stop_valve", "停止", VALVE_STOP);
    addRange(
      "position",
      "目标开度",
      "current_position",
      0,
      100,
      1,
      "set_valve_position",
      VALVE_SET_POSITION,
    );
  } else if (domain === "lawn_mower") {
    addAction("start_mowing", "开始割草", VALVE_OPEN);
    addAction("pause", "暂停", VALVE_CLOSE);
    addAction("dock", "返回充电", VALVE_SET_POSITION);
  } else if (domain === "siren") {
    if (flags & SIREN_TONES) {
      const tones = attributes.available_tones;
      const toneList = Array.isArray(tones)
        ? tones
        : tones && typeof tones == "object"
          ? Object.keys(tones)
          : [];
      if (toneList.length) {
        fields.push({ key: "tone", label: "音调", type: "select", choices: toneList, draft: true });
      }
    }
    if (flags & SIREN_VOLUME) {
      fields.push({
        key: "volume_level",
        label: "音量（0–1）",
        type: "number",
        min: 0,
        max: 1,
        step: 0.05,
        draft: true,
      });
    }
    if (flags & SIREN_DURATION) {
      fields.push({
        key: "duration",
        label: "持续秒数",
        type: "number",
        min: 1,
        max: 86_400,
        step: 1,
        draft: true,
      });
    }
    addAction("turn_on", "鸣响", SIREN_TONES, { confirm: true, form: false });
    addAction("turn_off", "停止鸣响", SIREN_VOLUME);
  } else if (domain === "alarm_control_panel") {
    if (attributes.code_format) {
      fields.push({
        key: "code",
        label: "密码（仅本次操作）",
        type: "password",
        draft: true,
      });
    }
    addAction("alarm_disarm", "撤防", 0, { confirm: true, form: false });
    for (const [service, label, bit] of [
      ["alarm_arm_home", "在家布防", ALARM_HOME],
      ["alarm_arm_away", "离家布防", ALARM_AWAY],
      ["alarm_arm_night", "夜间布防", ALARM_NIGHT],
      ["alarm_arm_custom_bypass", "自定义布防", ALARM_CUSTOM],
      ["alarm_arm_vacation", "假期布防", ALARM_VACATION],
      ["alarm_trigger", "触发警报", ALARM_TRIGGER],
    ] as const) {
      addAction(service, label, bit, { confirm: true, form: false });
    }
  } else if (domain === "vacuum") {
    for (const [service, label, bit] of [
      ["start", "开始清扫", VACUUM_START],
      ["pause", "暂停", VACUUM_PAUSE],
      ["stop", "停止", VACUUM_STOP],
      ["return_to_base", "返回充电", VACUUM_RETURN],
      ["locate", "定位", VACUUM_LOCATE],
      ["clean_spot", "局部清扫", VACUUM_CLEAN_SPOT],
    ] as const) {
      addAction(service, label, bit);
    }
    addSelect(
      "fan_speed",
      "吸力",
      "fan_speed",
      attributes.fan_speed_list,
      "set_fan_speed",
      VACUUM_FAN_SPEED,
    );
    if (flags & VACUUM_SEND_COMMAND) {
      fields.push(
        { key: "command", label: "设备命令", type: "text", draft: true },
        {
          key: "params",
          label: "命令参数（JSON，可留空）",
          type: "textarea",
          draft: true,
          json: true,
        },
      );
      addAction("send_command", "发送设备命令", 0, {
        form: false,
        confirm: false,
        keys: ["command", "params"],
      });
    }
    if (flags & VACUUM_CLEAN_AREA) {
      fields.push({
        key: "cleaning_area_id",
        label: "清洁区域 ID（每行一个）",
        type: "textarea",
        draft: true,
        lines: true,
      });
      addAction("clean_area", "清洁所选区域", 0, {
        form: false,
        keys: ["cleaning_area_id"],
      });
    }
  }

  return { actions, fields, readouts };
}

type CompoundExtraPanelOptions = {
  element: any;
  feedbackSlot?: FeedbackSlot;
  onControl: (command: any) => Promise<any>;
  hideStatus?: boolean;
  headerControls?: any;
};

export function createCompoundExtraPanel({
  element: hostElement,
  feedbackSlot,
  onControl,
  hideStatus = false,
  headerControls,
}: CompoundExtraPanelOptions) {
  const pickers = enhancePopupSelects(hostElement);
  const ownerDocument = hostElement.ownerDocument || globalThis.document;
  const createElement = (tagName: string, textContent = "") => {
    const node = ownerDocument.createElement(tagName);
    node.textContent = textContent;
    return node;
  };

  const statusElement = createElement("p");
  const powerButton = createElement("button") as HTMLButtonElement;
  const readoutsElement = createElement("div");
  const formElement = createElement("div");
  const actionsElement = createElement("div");
  const errorElement = createElement("p");

  hostElement.classList.add("i3d-extra-compound");
  formElement.className = "i3d-extra-form";
  actionsElement.className = "i3d-extra-actions";
  readoutsElement.className = "i3d-extra-readouts";
  errorElement.className = "i3d-climate-error";
  errorElement.setAttribute("role", "status");
  hostElement.replaceChildren(
    ...(headerControls ? [] : [statusElement]),
    readoutsElement,
    formElement,
    actionsElement,
    errorElement,
  );
  powerButton.type = "button";
  powerButton.className = "i3d-climate-choice";
  powerButton.setAttribute("role", "switch");
  headerControls?.append(statusElement, powerButton);

  let viewModel: ExtraPanelViewModel | null = null;
  let disposed = false;
  let generation = 0;
  let busy = false;
  let confirmSignature = "";
  let specSignature = "";
  const fieldInputs = new Map<string, { input: any; label: HTMLElement; field: CompoundField }>();
  const actionButtons: HTMLButtonElement[] = [];
  const feedback = createRangeFeedback({
    onChange: render,
    onTimeout: () => {
      errorElement.textContent = "设备未响应，请重试。";
    },
  });

  const stateOf = () => viewModel?.state?.newState || viewModel?.state;
  const domain = () => String(viewModel?.item?.entityId).split(".")[0];
  const isUsable = () =>
    !!viewModel &&
    stateOf() &&
    stateOf().available !== false &&
    !["unknown", "unavailable", "", undefined].includes(stateOf().state) &&
    viewModel.item.modelAvailable !== false;
  const isDisabled = () => disposed || !viewModel || viewModel.editing || busy || !isUsable();

  function collectDraftData(keys?: string[]) {
    const data: any = {};
    for (const [key, { input, field }] of fieldInputs) {
      if (!field.draft || (keys && !keys.includes(key)) || !input.value) continue;
      data[key] = field.json
        ? JSON.parse(input.value)
        : field.lines
          ? input.value
              .split("\n")
              .map((line: string) => line.trim())
              .filter(Boolean)
          : field.type === "number"
            ? Number(input.value)
            : input.value;
    }
    return data;
  }

  async function triggerRuntimeAction(
    action: CompoundAction,
    dataOverride?: any,
    rangeKey?: string,
    rangeEntry?: any,
  ) {
    if (isDisabled()) return;
    if (action.confirm && (confirmSignature !== action.service || !errorElement.textContent)) {
      confirmSignature = action.service;
      errorElement.dataset.kind = "confirm";
      errorElement.textContent = `确认${action.label}？再次点击执行。`;
      return;
    }
    confirmSignature = "";
    const requestGeneration = generation;
    try {
      const data = dataOverride ?? (action.form ? collectDraftData(action.keys) : {});
      // 密码类字段只对本次操作有效，发出后立刻清空，避免留在 DOM 里。
      for (const { input, field } of fieldInputs.values()) {
        if (field.type === "password") input.value = "";
      }
      busy = true;
      errorElement.textContent = "";
      syncDisabled();
      await onControl({
        entityId: viewModel!.item.entityId,
        domain: domain(),
        service: action.service,
        data,
      });
      if (!disposed && requestGeneration === generation) errorElement.textContent = "";
    } catch (error: any) {
      if (!disposed && requestGeneration === generation) {
        if (rangeKey && rangeEntry) feedback.cancel(rangeKey, rangeEntry);
        errorElement.dataset.kind = "error";
        errorElement.textContent = error?.message || "设备操作失败";
      }
    } finally {
      if (!disposed && requestGeneration === generation) {
        busy = false;
        syncDisabled();
      }
    }
  }

  function build(spec: CompoundSpec) {
    feedback.reset();
    fieldInputs.clear();
    readoutsElement.replaceChildren();
    formElement.replaceChildren();
    actionsElement.replaceChildren();
    actionButtons.length = 0;

    for (const field of spec.fields) {
      const row = createElement("label");
      const label = createElement("span", field.label);
      const input = createElement(
        field.type === "select" ? "select" : field.type === "textarea" ? "textarea" : "input",
      ) as any;
      row.className = "i3d-extra-field";
      input.setAttribute("aria-label", field.label);
      input.name = `i3d-extra-${field.key}`;
      if (!["select", "textarea"].includes(field.type)) input.type = field.type;
      if (field.type === "password") input.autocomplete = "off";
      for (const key of ["min", "max", "step"]) {
        if (field[key as "min"] != null) input[key] = field[key as "min"];
      }
      if (field.type === "select") {
        if (field.draft) {
          const option = createElement("option", "默认") as HTMLOptionElement;
          option.value = "";
          input.append(option);
        }
        for (const choice of field.choices || []) {
          const option = createElement("option", choice) as HTMLOptionElement;
          option.value = choice;
          input.append(option);
        }
      }
      if (!field.draft) {
        input.addEventListener("input", () => {
          if (field.type !== "range" || input.disabled) return;
          feedback.preview(field.key, Number(input.value));
          label.textContent = `${field.label} ${input.value}`;
        });
        input.addEventListener("change", () => {
          if (isDisabled()) return;
          const value = field.type === "select" ? input.value : Number(input.value);
          const rangeEntry = field.type === "range" ? feedback.commit(field.key, value) : null;
          void triggerRuntimeAction(
            { service: field.service!, label: field.label },
            { [field.key]: value },
            field.key,
            rangeEntry,
          );
        });
        for (const eventName of ["blur", "pointercancel"]) {
          input.addEventListener(eventName, () => {
            feedback.cancelPreview(field.key);
            render();
          });
        }
      }
      row.append(label, input);
      formElement.append(row);
      fieldInputs.set(field.key, { input, label: row, field });
    }

    for (const action of spec.actions) {
      if (
        headerControls &&
        String(viewModel?.item.entityId).startsWith("humidifier.") &&
        ["turn_on", "turn_off"].includes(action.service)
      ) {
        continue;
      }
      const button = createElement("button", action.label) as HTMLButtonElement;
      button.className = "i3d-climate-choice";
      button.type = "button";
      button.addEventListener("click", () => void triggerRuntimeAction(action));
      actionsElement.append(button);
      actionButtons.push(button);
    }
  }

  function syncDisabled() {
    for (const element of hostElement.querySelectorAll("button,input,select,textarea")) {
      (element as any).disabled = isDisabled();
    }
    pickers.sync();
  }

  function render() {
    if (disposed || !viewModel) return;
    const currentDomain = domain();
    const state = stateOf();
    const spec = compoundExtraSpec(currentDomain, state);
    const signature = JSON.stringify([spec.actions, spec.fields]);
    if (signature !== specSignature) {
      specSignature = signature;
      build(spec);
    }

    statusElement.textContent = isUsable()
      ? EXTRA_STATE_LABELS[state.state] || state.state
      : state?.state === "unknown"
        ? "状态未知"
        : "设备不可用";
    statusElement.title = statusElement.textContent;
    readoutsElement.replaceChildren(
      ...spec.readouts.map(([label, value]) => createElement("span", `${label} ${value}`)),
    );

    const attributes = attributesOf(state);
    for (const { input, label, field } of fieldInputs.values()) {
      if (field.draft) continue;
      const value =
        field.type === "range"
          ? feedback.read(field.key, haNumber(attributes[field.attribute!]), 0.5)
          : attributes[field.attribute!];
      if (field.type === "range" || !pickers.focused(input)) {
        input.value = value ?? (field.type === "range" ? field.min : "");
      }
      label.textContent =
        field.type === "range" ? `${field.label} ${value ?? "暂无读数"}` : field.label;
    }

    readoutsElement.hidden = !spec.readouts.length;
    formElement.hidden = !spec.fields.length;
    actionsElement.hidden = !actionButtons.length;
    powerButton.hidden = currentDomain !== "humidifier";
    powerButton.textContent = state?.state === "on" ? "关闭" : "开启";
    powerButton.setAttribute("aria-checked", String(state?.state === "on"));
    powerButton.disabled = isDisabled();
    powerButton.setAttribute("aria-label", `${viewModel.item.label || "加湿器"}电源`);
    statusElement.hidden =
      hideStatus || (currentDomain === "humidifier" && isUsable() && ["on", "off"].includes(state?.state));
    for (const button of actionButtons) button.disabled = isDisabled();
    pickers.sync();
  }

  powerButton.addEventListener(
    "click",
    () =>
      void triggerRuntimeAction({
        service: stateOf()?.state === "on" ? "turn_off" : "turn_on",
        label: stateOf()?.state === "on" ? "关闭" : "开启",
      }),
  );

  const releaseFeedback = attachFeedback(feedbackSlot, errorElement, {
    source: () => viewModel?.item?.entityId,
    label: () => viewModel?.item?.label,
    onRetire: () => {
      confirmSignature = "";
    },
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
        confirmSignature = "";
        errorElement.textContent = "";
        for (const { input, field } of fieldInputs.values()) {
          if (field.type === "password") input.value = "";
        }
      }
      viewModel = nextViewModel;
      render();
    },
    dispose() {
      feedback.reset();
      disposed = true;
      pickers.dispose();
      releaseFeedback();
      generation++;
      viewModel = null;
      fieldInputs.clear();
      headerControls && (statusElement.remove(), powerButton.remove());
      hostElement.replaceChildren();
    },
  };
}
