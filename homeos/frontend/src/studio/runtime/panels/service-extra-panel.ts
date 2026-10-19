/**
 * 服务型实体面板：通知 / 对话 / AI 任务 / 语音助手 / 遥控 / TTS / 图像识别 /
 * 播放器扩展 / 语音识别 / 唤醒词 / 射频。
 *
 * 这些实体"状态"几乎没有意义（`unknown` 才是正常态），真正的交互是一组
 * 带参数的 service。表单按 supported_features 动态裁剪；需要返回值的服务
 * （AI 生图、搜索媒体、引擎能力）在下发后把结果渲染到响应区。
 */
import { enhancePopupSelects } from "@app/shared/util/select-picker";
import {
  attributesOf,
  extraContextChanged,
  featureFlags,
  stringOptions,
} from "../device/entity-capabilities";
import { attachFeedback } from "./panel-utils";
import type { ExtraPanelViewModel, FeedbackSlot } from "./panel-utils";
import { unwrapExtraResponse } from "./list-extra-panel";

export type ServiceField = {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  json?: boolean;
  lines?: boolean;
  min?: number;
  max?: number;
  step?: number;
  value?: any;
  choices?: Array<[string, string]>;
};

export type ServiceForm = {
  service: string;
  label: string;
  fields: ServiceField[];
  confirm?: boolean;
  response?: boolean;
};

/** assistant 能力位：1=播报；2=语音对话。 */
const ASSIST_ANNOUNCE = 0x1;
const ASSIST_CONVERSATION = 0x2;
/** remote 能力位：1=学习；2=删除；4=活动列表。 */
const REMOTE_LEARN = 0x1;
const REMOTE_DELETE = 0x2;
const REMOTE_ACTIVITIES = 0x4;
/** ai_task 能力位：1=生成内容；2=附件；4=生成图片。 */
const AI_TASK_DATA = 0x1;
const AI_TASK_ATTACHMENTS = 0x2;
const AI_TASK_IMAGE = 0x4;
/** notify 能力位：1=标题。 */
const NOTIFY_TITLE = 0x1;
/** media_player 能力位（HA 标准位）。 */
const MEDIA_PLAY_MEDIA = 0x200;
const MEDIA_CLEAR_PLAYLIST = 0x2000;
const MEDIA_GROUPING = 0x80000;
const MEDIA_ANNOUNCE = 0x100000;
const MEDIA_ENQUEUE = 0x200000;
const MEDIA_SEARCH = 0x400000;

const STATELESS_DOMAINS = new Set([
  "ai_task",
  "notify",
  "tts",
  "stt",
  "wake_word",
  "infrared",
  "radio_frequency",
  "conversation",
]);
const CONNECTED_DOMAINS = new Set([
  "ai_task",
  "notify",
  "tts",
  "stt",
  "wake_word",
  "infrared",
  "radio_frequency",
]);

const SERVICE_STATE_LABELS: Record<string, string> = {
  on: "已开启",
  off: "已关闭",
  idle: "待机",
  listening: "正在聆听",
  processing: "正在处理",
  responding: "正在回复",
};

export function serviceExtraSpec(domain: string, state: any, states: any = {}) {
  const attributes = attributesOf(state);
  const flags = featureFlags(attributes);
  const forms: ServiceForm[] = [];

  const field = (key: string, label: string, extra: Partial<ServiceField> = {}): ServiceField => ({
    key,
    label,
    type: "text",
    ...extra,
  });
  const messageField = field("message", "内容", { type: "textarea", required: true });
  const jsonField = (key: string, label: string) =>
    field(key, label, { type: "textarea", json: true });
  const selectField = (key: string, label: string, choices: Array<[string, string]>) =>
    field(key, label, { type: "select", choices });
  const addForm = (service: string, label: string, fields: ServiceField[] = [], extra: Partial<ServiceForm> = {}) => {
    forms.push({ service, label, fields, ...extra });
  };
  const mediaPlayers = () =>
    Object.entries(states)
      .filter(([entityId]) => entityId.startsWith("media_player."))
      .map(([entityId, entry]: [string, any]) => [
        entityId,
        attributesOf(entry?.newState || entry).friendly_name || entityId,
      ] as [string, string]);

  if (domain === "notify") {
    addForm(
      "send_message",
      "发送通知",
      [messageField, ...(flags & NOTIFY_TITLE ? [field("title", "标题")] : [])],
      { confirm: true },
    );
  }
  if (domain === "conversation") {
    addForm(
      "process",
      "对话",
      [field("text", "对话内容", { type: "textarea", required: true }), field("language", "语言（可选）")],
      { response: true },
    );
  }
  if (domain === "ai_task") {
    const base = [
      field("task_name", "任务名称", { required: true }),
      field("instructions", "任务要求", { type: "textarea", required: true }),
    ];
    const attachmentFields =
      flags & AI_TASK_ATTACHMENTS ? [jsonField("attachments", "附件（HA 媒体 ID 与类型 JSON）")] : [];
    if (flags & AI_TASK_DATA) {
      addForm("generate_data", "生成内容", [...base, jsonField("structure", "输出结构（可选 JSON）"), ...attachmentFields], {
        response: true,
      });
    }
    if (flags & AI_TASK_IMAGE) {
      addForm("generate_image", "生成图片", [...base, ...attachmentFields], { response: true });
    }
  }
  if (domain === "assist_satellite") {
    if (flags & ASSIST_ANNOUNCE) {
      addForm(
        "announce",
        "播报",
        [
          field("message", "播报文本", { type: "textarea" }),
          field("media_id", "播报媒体 ID（可选）"),
          field("preannounce", "播放提示音", { type: "checkbox", value: true }),
          field("preannounce_media_id", "提示音媒体 ID（可选）"),
        ],
        { confirm: true },
      );
    }
    if (flags & ASSIST_CONVERSATION) {
      addForm(
        "start_conversation",
        "开始语音对话",
        [
          field("start_message", "开场文本"),
          field("start_media_id", "开场媒体 ID（可选）"),
          field("extra_system_prompt", "补充要求", { type: "textarea" }),
        ],
        { confirm: true },
      );
      addForm(
        "ask_question",
        "提问并等待回答",
        [field("question", "问题", { type: "textarea", required: true }), jsonField("answers", "匹配答案（可选 JSON）")],
        { response: true, confirm: true },
      );
    }
  }
  if (domain === "remote") {
    addForm(
      "turn_on",
      "开启遥控器",
      flags & REMOTE_ACTIVITIES
        ? [selectField("activity", "活动", [["", "默认"], ...stringOptions(attributes.activity_list).map((activity) => [activity, activity] as [string, string])])]
        : [],
    );
    addForm("turn_off", "关闭遥控器");
    const commandFields = [
      field("device", "目标设备（可选）"),
      field("command", "命令（每行一个）", { type: "textarea", required: true, lines: true }),
    ];
    addForm("send_command", "发送命令", [
      ...commandFields,
      field("num_repeats", "重复次数", { type: "number", min: 0, max: 255, step: 1 }),
      field("delay_secs", "命令间隔（秒）", { type: "number", min: 0, max: 60, step: 0.1 }),
      field("hold_secs", "持续时间（秒）", { type: "number", min: 0, max: 60, step: 0.1 }),
    ]);
    if (flags & REMOTE_LEARN) {
      addForm(
        "learn_command",
        "学习命令",
        [
          ...commandFields,
          selectField("command_type", "信号类型", [
            ["ir", "ir"],
            ["rf", "rf"],
          ]),
          field("timeout", "等待秒数", { type: "number", min: 0, max: 60, step: 1 }),
        ],
        { confirm: true },
      );
    }
    if (flags & REMOTE_DELETE) {
      addForm("delete_command", "删除已学命令", commandFields, { confirm: true });
    }
  }
  if (domain === "tts") {
    const players = mediaPlayers();
    addForm(
      "speak",
      "朗读文本",
      [
        messageField,
        players.length
          ? selectField("media_player_entity_id", "播放设备", [["", "选择播放设备"], ...players])
          : field("media_player_entity_id", "播放设备实体 ID", { required: true }),
        field("language", "语言（可选）"),
        field("cache", "缓存语音", { type: "checkbox", value: true }),
        jsonField("options", "语音参数（可选 JSON）"),
      ],
      { confirm: true },
    );
  }
  if (domain === "image_processing") addForm("scan", "重新识别画面");
  if (domain === "media_player") {
    if (flags & MEDIA_PLAY_MEDIA) {
      addForm("play_media", "播放指定媒体", [
        field("media_content_id", "媒体 ID 或地址", { required: true }),
        field("media_content_type", "媒体类型", { required: true }),
        ...(flags & MEDIA_ENQUEUE
          ? [
              selectField("enqueue", "队列方式", [
                ["", "直接播放"],
                ["play", "立即播放"],
                ["next", "下一项"],
                ["add", "加入末尾"],
                ["replace", "替换队列"],
              ]),
            ]
          : []),
        ...(flags & MEDIA_ANNOUNCE ? [field("announce", "临时播报", { type: "checkbox" })] : []),
      ]);
    }
    if (flags & MEDIA_CLEAR_PLAYLIST) addForm("clear_playlist", "清空播放队列", [], { confirm: true });
    if (flags & MEDIA_GROUPING) {
      addForm("join", "组合播放", [
        field("group_members", "组合成员实体 ID（每行一个）", {
          type: "textarea",
          required: true,
          lines: true,
        }),
      ]);
      addForm("unjoin", "退出组合");
    }
    if (flags & MEDIA_SEARCH) {
      addForm("search_media", "搜索媒体", [field("search_query", "搜索关键词", { required: true })], {
        response: true,
      });
    }
  }
  if (["stt", "wake_word", "radio_frequency"].includes(domain)) {
    addForm("info", "查看引擎能力", [], { response: true });
  }

  const note =
    {
      stt: "语音识别服务",
      wake_word: "唤醒词检测服务",
      infrared: attributes.device_class === "receiver" ? "红外接收器" : "红外发射器",
      radio_frequency: "射频发射器",
    }[domain] || "";

  return { forms, note };
}

type ServiceExtraPanelOptions = {
  element: any;
  feedbackSlot?: FeedbackSlot;
  onControl: (command: any) => Promise<any>;
  hideStatus?: boolean;
};

export function createServiceExtraPanel({
  element: hostElement,
  feedbackSlot,
  onControl,
  hideStatus = false,
}: ServiceExtraPanelOptions) {
  const pickers = enhancePopupSelects(hostElement);
  const ownerDocument = hostElement.ownerDocument || globalThis.document;
  const createElement = (tagName: string, textContent = "") => {
    const node = ownerDocument.createElement(tagName);
    node.textContent = textContent;
    return node;
  };

  const statusElement = createElement("p");
  const noteElement = createElement("p");
  const formElement = createElement("div");
  const responseElement = createElement("div");
  const errorElement = createElement("p");

  hostElement.classList.add("i3d-extra-service");
  formElement.className = "i3d-extra-form";
  responseElement.className = "i3d-extra-response";
  errorElement.className = "i3d-climate-error";
  errorElement.setAttribute("role", "status");
  hostElement.replaceChildren(statusElement, noteElement, formElement, responseElement, errorElement);

  let viewModel: ExtraPanelViewModel | null = null;
  let disposed = false;
  let generation = 0;
  let busy = false;
  let specSignature = "";
  let confirmSignature = "";

  const stateOf = () => viewModel?.state?.newState || viewModel?.state;
  const domain = () => String(viewModel?.item?.entityId).split(".")[0];
  const statelessUnknown = () => {
    const state = stateOf();
    return (
      state?.state === "unknown" &&
      STATELESS_DOMAINS.has(domain()) &&
      (state.available !== false || state.availabilityReason === "unknown")
    );
  };
  const isUsable = () =>
    !!viewModel &&
    viewModel.item.modelAvailable !== false &&
    (statelessUnknown() ||
      (stateOf()?.available !== false &&
        !["unknown", "unavailable", "", undefined].includes(stateOf()?.state)));
  const isDisabled = () =>
    disposed ||
    !viewModel ||
    viewModel.editing ||
    busy ||
    !isUsable() ||
    (String(viewModel.item.entityId).startsWith("media_player.") &&
      ["off", "standby"].includes(stateOf()?.state));

  function syncDisabled() {
    for (const element of hostElement.querySelectorAll("button,input,select,textarea")) {
      (element as any).disabled = isDisabled();
    }
    pickers.sync();
  }

  function renderResponse(response: any, service: string) {
    const result = unwrapExtraResponse(response, viewModel!.item.entityId);
    responseElement.replaceChildren();
    if (
      typeof result?.image == "string" &&
      /^data:image\/(?:png|jpeg|webp|gif);base64,/.test(result.image)
    ) {
      const image = createElement("img") as HTMLImageElement;
      image.alt = "AI 生成图片";
      image.src = result.image;
      responseElement.append(image);
      if (result.revised_prompt) responseElement.append(createElement("p", result.revised_prompt));
      return;
    }

    if (service === "search_media") {
      const results = Array.isArray(result?.result) ? result.result : Array.isArray(result) ? result : [];
      if (!results.length) responseElement.append(createElement("p", "暂无搜索结果"));
      for (const media of results) {
        const article = createElement("article");
        article.append(createElement("p", media.title || "未命名媒体"));
        if (
          media.can_play &&
          media.media_content_id &&
          media.media_content_type &&
          featureFlags(attributesOf(stateOf())) & MEDIA_PLAY_MEDIA
        ) {
          const playButton = createElement("button", "播放") as HTMLButtonElement;
          playButton.type = "button";
          playButton.className = "i3d-climate-choice";
          article.append(playButton);
          playButton.addEventListener("click", () =>
            void dispatch({ service: "play_media", label: "播放" }, {
              media_content_id: media.media_content_id,
              media_content_type: media.media_content_type,
            }),
          );
        }
        responseElement.append(article);
      }
      syncDisabled();
      return;
    }

    const speech = result?.response?.speech?.plain?.speech;
    if (speech) {
      responseElement.append(createElement("p", speech));
    } else if (typeof result == "string") {
      responseElement.append(createElement("p", result));
    } else if (result?.data !== undefined) {
      responseElement.append(
        createElement(
          "p",
          typeof result.data == "string" ? result.data : JSON.stringify(result.data, null, 2),
        ),
      );
    } else if (result?.wake_words) {
      for (const wakeWord of result.wake_words) {
        responseElement.append(createElement("p", wakeWord.name || wakeWord.id));
      }
    } else if (result?.supported_languages) {
      responseElement.append(createElement("p", `支持语言：${result.supported_languages.join("、")}`));
    } else if (result?.supported_frequency_ranges) {
      for (const [low, high] of result.supported_frequency_ranges) {
        responseElement.append(
          createElement("p", `频率范围 ${low / 1_000_000}–${high / 1_000_000} MHz`),
        );
      }
      if (result.supported_modulations) {
        responseElement.append(
          createElement("p", `调制方式 ${result.supported_modulations.join("、")}`),
        );
      }
    } else {
      responseElement.append(createElement("pre", JSON.stringify(result, null, 2) || "操作完成"));
    }
  }

  async function dispatch(form: any, dataOverride?: any) {
    if (isDisabled()) return;
    const requestGeneration = generation;
    try {
      const requestSignature = JSON.stringify([form.service, dataOverride]);
      if (form.confirm && (confirmSignature !== requestSignature || !errorElement.textContent)) {
        confirmSignature = requestSignature;
        errorElement.dataset.kind = "confirm";
        errorElement.textContent = `确认${form.label}？再次点击执行。`;
        return;
      }
      confirmSignature = "";
      busy = true;
      errorElement.textContent = "";
      errorElement.dataset.kind = "";
      syncDisabled();
      const response = await onControl({
        entityId: viewModel!.item.entityId,
        domain: domain(),
        service: form.service,
        data: dataOverride,
      });
      if (disposed || requestGeneration !== generation) return;
      if (form.response) renderResponse(response, form.service);
      else errorElement.textContent = "";
    } catch (error: any) {
      if (!disposed && requestGeneration === generation) {
        errorElement.dataset.kind = "error";
        errorElement.textContent = error?.message || "操作失败";
      }
    } finally {
      if (!disposed && requestGeneration === generation) {
        busy = false;
        syncDisabled();
      }
    }
  }

  function buildForms(spec: ReturnType<typeof serviceExtraSpec>) {
    formElement.replaceChildren();
    for (const form of spec.forms) {
      const wrapper = createElement(form.fields.length ? "details" : "div");
      const body = createElement("div");
      body.className = "i3d-extra-form";
      if (form.fields.length) wrapper.append(createElement("summary", form.label));
      wrapper.append(body);
      formElement.append(wrapper);
      const entries = new Map<string, { field: ServiceField; input: any }>();

      for (const formField of form.fields) {
        const row = createElement("label");
        const input = createElement(
          ["textarea", "select"].includes(formField.type || "") ? formField.type! : "input",
        ) as any;
        row.className = "i3d-extra-field";
        row.append(createElement("span", formField.label), input);
        input.setAttribute("aria-label", formField.label);
        if (!["textarea", "select"].includes(formField.type || "")) input.type = formField.type;
        for (const key of ["min", "max", "step"]) {
          if (formField[key as "min"] != null) input[key] = formField[key as "min"];
        }
        if (formField.type === "select") {
          for (const [value, text] of formField.choices || []) {
            const option = createElement("option", text) as HTMLOptionElement;
            option.value = value;
            input.append(option);
          }
        }
        if (formField.type === "checkbox") input.checked = !!formField.value;
        body.append(row);
        entries.set(formField.key, { field: formField, input });
      }

      const submitButton = createElement("button", form.label) as HTMLButtonElement;
      submitButton.type = "button";
      submitButton.className = "i3d-climate-choice";
      body.append(submitButton);
      submitButton.addEventListener("click", async () => {
        if (isDisabled()) return;
        const requestGeneration = generation;
        const data: any = {};
        try {
          for (const [key, { field: formField, input }] of entries) {
            if (formField.required && !input.value.trim()) {
              throw Error(`请填写${formField.label}。`);
            }
            if (formField.type === "checkbox") {
              data[key] = input.checked;
              continue;
            }
            if (!input.value) continue;
            data[key] = formField.json
              ? JSON.parse(input.value)
              : formField.lines
                ? input.value
                    .split("\n")
                    .map((line: string) => line.trim())
                    .filter(Boolean)
                : formField.type === "number"
                  ? Number(input.value)
                  : input.value;
          }
          if (form.service === "play_media") {
            if (data.announce !== true) delete data.announce;
            if (data.announce && data.enqueue) throw Error("临时播报与队列方式请只选择一种。");
          }
          await dispatch(form, data);
        } catch (error: any) {
          if (!disposed && requestGeneration === generation) {
            errorElement.dataset.kind = "error";
            errorElement.textContent = error?.message || "参数无效";
          }
        }
      });
    }
  }

  function render() {
    if (disposed || !viewModel) return;
    const spec = serviceExtraSpec(domain(), stateOf(), viewModel.states);
    const signature = JSON.stringify([viewModel.item.entityId, spec]);
    if (signature !== specSignature) {
      specSignature = signature;
      buildForms(spec);
    }
    noteElement.textContent = spec.note;
    noteElement.hidden = !spec.note;

    if (isUsable()) {
      statusElement.textContent = statelessUnknown()
        ? "尚无使用记录"
        : SERVICE_STATE_LABELS[stateOf().state] ||
          (CONNECTED_DOMAINS.has(domain()) ? "已连接" : stateOf().state);
    } else {
      statusElement.textContent = stateOf()?.state === "unknown" ? "状态未知" : "设备不可用";
    }
    statusElement.hidden = hideStatus;
    syncDisabled();
  }

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
        pickers.close();
        generation++;
        busy = false;
        confirmSignature = "";
        errorElement.textContent = "";
        responseElement.replaceChildren();
      }
      viewModel = nextViewModel;
      render();
    },
    dispose() {
      disposed = true;
      pickers.dispose();
      releaseFeedback();
      generation++;
      viewModel = null;
      hostElement.replaceChildren();
    },
  };
}
