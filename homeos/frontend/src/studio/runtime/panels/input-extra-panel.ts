/**
 * 文本 / 日期 / 时间 / 日期时间输入面板。
 *
 * 校验全部在 `inputCommand` 里完成（长度范围、格式转换、空值），面板只负责
 * "编辑中不写回"：用户正在输入时，状态刷新不能把光标位置冲掉。
 */
import { attributesOf, extraContextChanged, haNumber } from "../device/entity-capabilities";
import { attachFeedback } from "./panel-utils";
import type { ExtraPanelViewModel, FeedbackSlot } from "./panel-utils";

const inputDomains = new Set(["text", "date", "time", "datetime"]);

const pad2 = (value: any) => String(value).padStart(2, "0");

/** HA 的 datetime 是 ISO 字符串，`<input type="datetime-local">` 要本地时间。 */
export function inputValue(domain: string, state: any): string {
  if (domain !== "datetime") return String(state ?? "");
  const parsed = new Date(state);
  if (!Number.isFinite(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}T${pad2(
    parsed.getHours(),
  )}:${pad2(parsed.getMinutes())}:${pad2(parsed.getSeconds())}`;
}

const SERVICE_DATA_KEYS: Record<string, string> = {
  text: "value",
  date: "date",
  time: "time",
  datetime: "datetime",
};

function inputCommand(entityId: string, state: any, rawValue: any) {
  const domain = String(entityId).split(".")[0];
  const attributes = attributesOf(state);
  if (
    !inputDomains.has(domain) ||
    state?.available === false ||
    typeof state?.state != "string" ||
    ["unknown", "unavailable"].includes(state.state) ||
    (domain !== "text" && !state.state) ||
    typeof rawValue != "string"
  ) {
    throw Error("该输入实体当前不可用");
  }

  if (domain === "text") {
    const min = haNumber(attributes.min ?? 0);
    const max = haNumber(attributes.max ?? 64);
    const length = [...rawValue].length;
    if (
      !Number.isInteger(min) ||
      !Number.isInteger(max) ||
      (min as number) < 0 ||
      (max as number) < (min as number) ||
      length < (min as number) ||
      length > (max as number)
    ) {
      throw Error("文本长度不符合设备要求");
    }
  } else if (!rawValue) {
    throw Error("请先填写完整内容");
  }

  let value = rawValue;
  if (domain === "datetime") {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) throw Error("日期时间无效");
    value = parsed.toISOString();
  } else if (domain === "time" && /^\d{2}:\d{2}$/.test(value)) {
    value += ":00";
  }

  return {
    entityId,
    domain,
    service: "set_value",
    data: { [SERVICE_DATA_KEYS[domain]]: value },
    deviceKind: "purifier-extra",
  };
}

type InputExtraPanelOptions = {
  element: any;
  feedbackSlot?: FeedbackSlot;
  onControl?: (command: any) => Promise<any>;
};

export function createInputExtraPanel({
  element: hostElement,
  feedbackSlot,
  onControl = async () => {},
}: InputExtraPanelOptions) {
  const ownerDocument = hostElement.ownerDocument || globalThis.document;
  const createElement = (tagName: string, textContent = "") => {
    const node = ownerDocument.createElement(tagName);
    node.textContent = textContent;
    return node;
  };
  const formElement = createElement("form");
  const inputElement = createElement("input") as HTMLInputElement;
  const applyButton = createElement("button", "应用") as HTMLButtonElement;
  const errorElement = createElement("p");
  const hintElement = createElement("p");

  formElement.className = "i3d-extra-input-form";
  inputElement.className = "i3d-extra-input-value";
  applyButton.className = "i3d-climate-choice";
  applyButton.type = "submit";
  inputElement.autocomplete = "off";
  inputElement.spellcheck = false;
  hintElement.className = "i3d-extra-input-hint";
  errorElement.className = "i3d-climate-error";
  errorElement.setAttribute("role", "status");
  formElement.append(inputElement, applyButton, hintElement, errorElement);
  hostElement.replaceChildren(formElement);

  let viewModel: ExtraPanelViewModel | null = null;
  let contextSignature = "";
  let lastAvailable: boolean | null = null;
  let textDirty = false;
  let submitting = false;
  let expectedValue: any = null;
  let disposed = false;
  let generation = 0;
  let submitTimer: any = null;
  let errorText = "";

  function clearPending() {
    clearTimeout(submitTimer);
    submitTimer = null;
    submitting = false;
    expectedValue = null;
  }

  function readState() {
    return viewModel?.state?.newState || viewModel?.state;
  }

  function refresh() {
    if (disposed || !viewModel) return;
    const { item, editing } = viewModel;
    const state = readState();
    const domain = String(item.entityId).split(".")[0];
    const attributes = attributesOf(state);
    const available =
      !!state &&
      state.available !== false &&
      typeof state.state == "string" &&
      !["unknown", "unavailable"].includes(state.state) &&
      (domain === "text" || state.state !== "");
    const signature = JSON.stringify([
      item.entityId,
      domain === "text" ? attributes.mode : domain,
      !!editing,
    ]);

    if (contextSignature !== signature) {
      generation++;
      clearPending();
      textDirty = false;
      errorText = "";
      contextSignature = signature;
    }

    if (!available) {
      generation++;
      clearPending();
      textDirty = false;
      errorText = state?.state === "unknown" ? "状态未知" : "设备不可用";
    } else if (lastAvailable === false) {
      errorText = "";
    }
    lastAvailable = !!available;

    if (
      submitting &&
      (domain === "datetime"
        ? new Date(state.state).getTime() === new Date(expectedValue).getTime()
        : domain === "time"
          ? String(state.state).slice(0, 8) === expectedValue
          : state.state === expectedValue)
    ) {
      generation++;
      clearPending();
      textDirty = false;
      errorText = "";
    }

    inputElement.type =
      domain === "text"
        ? attributes.mode === "password"
          ? "password"
          : "text"
        : domain === "datetime"
          ? "datetime-local"
          : domain;
    inputElement.step = "1";
    inputElement.setAttribute("aria-label", item.label || item.entityId);

    const min = haNumber(attributes.min ?? 0);
    const max = haNumber(attributes.max ?? 64);
    const textRangeValid =
      domain !== "text" ||
      (Number.isInteger(min) && Number.isInteger(max) && (min as number) >= 0 && (max as number) >= (min as number));

    inputElement.disabled = !!(
      editing ||
      !available ||
      submitting ||
      item.modelAvailable === false ||
      !textRangeValid
    );
    applyButton.disabled = inputElement.disabled;
    applyButton.textContent = "应用";
    applyButton.setAttribute("aria-busy", String(submitting));

    if (!textDirty && !submitting) {
      inputElement.value = available ? inputValue(domain, state.state) : "";
    }

    hintElement.textContent =
      domain === "text"
        ? textRangeValid
          ? `允许 ${min}–${max} 个字符${attributes.pattern ? " · 格式按设备规则校验" : ""}`
          : "设备的文本范围无效"
        : domain === "datetime"
          ? "按当前浏览器时区填写"
          : "";
    errorElement.textContent = errorText;
  }

  inputElement.addEventListener("input", () => {
    if (inputElement.disabled) return;
    textDirty = true;
    errorText = "";
    errorElement.textContent = "";
  });

  inputElement.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Escape" && !submitting) {
      textDirty = false;
      errorText = "";
      refresh();
    }
  });

  formElement.addEventListener("submit", async (event: Event) => {
    event.preventDefault();
    if (disposed || !viewModel || inputElement.disabled || submitting) return;
    const requestGeneration = ++generation;
    try {
      if (typeof inputElement.checkValidity == "function" && !inputElement.checkValidity()) {
        inputElement.reportValidity?.();
        return;
      }
      const command = inputCommand(viewModel.item.entityId, viewModel.state, inputElement.value);
      expectedValue = Object.values(command.data)[0];
      submitting = true;
      errorText = "";
      refresh();
      if (submitting) {
        submitTimer = setTimeout(() => {
          if (disposed || requestGeneration !== generation) return;
          clearPending();
          textDirty = false;
          errorText = "设备响应超时，请重试";
          refresh();
        }, 10_000);
        submitTimer?.unref?.();
      }
      await onControl(command);
    } catch (error: any) {
      if (!disposed && requestGeneration === generation) {
        clearPending();
        errorText = error?.message || "更新失败，请重试";
        refresh();
      }
    }
  });

  const releaseFeedback = attachFeedback(feedbackSlot, errorElement, {
    source: () => viewModel?.item?.entityId,
    label: () => viewModel?.item?.label,
  });

  return {
    root: hostElement,
    update(nextViewModel: ExtraPanelViewModel) {
      if (disposed) return;
      if (extraContextChanged(viewModel, nextViewModel)) {
        generation++;
        clearPending();
        textDirty = false;
        errorText = "";
      }
      viewModel = nextViewModel;
      refresh();
    },
    dispose() {
      disposed = true;
      releaseFeedback();
      generation++;
      clearPending();
      viewModel = null;
      hostElement.replaceChildren();
    },
  };
}
