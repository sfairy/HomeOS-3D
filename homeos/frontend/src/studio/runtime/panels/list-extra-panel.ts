/**
 * 列表型实体面板：日程 / 待办 / 天气 / 固件更新。
 *
 * 共同点：状态只能表达"有/无"，真正的数据要按需调用 `list_events`、`get_items`、
 * `get_forecasts` 等带返回值的服务。所以这里全部按需拉取（滚到可见区 + 空闲时），
 * 并把写操作做成"二次点击确认"，避免误删日程 / 待办。
 */
import { enhancePopupSelects } from "@app/shared/util/select-picker";
import { attributesOf, extraContextChanged, featureFlags } from "../device/entity-capabilities";
import { attachFeedback, createVisibilityGate } from "./panel-utils";
import type { ExtraPanelViewModel, FeedbackSlot } from "./panel-utils";

/** 服务返回值可能是 `{ service_response: {...} }`，也可能直接是结果体。 */
export function unwrapExtraResponse(response: any, entityId: string) {
  const payload = response?.service_response ?? response;
  return payload?.[entityId] ?? payload;
}

const toLocalDateTimeInput = (value: any) => {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf())
    ? new Date(parsed.valueOf() - parsed.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
    : "";
};

const toIsoDateTime = (value: any) => {
  const parsed = new Date(value);
  if (!value || !Number.isFinite(parsed.valueOf())) throw Error("请填写有效时间。");
  return parsed.toISOString();
};

/** calendar 能力位：1=创建；2=删除；4=更新。 */
const CALENDAR_CREATE = 0x1;
const CALENDAR_DELETE = 0x2;
const CALENDAR_UPDATE = 0x4;
/** todo 能力位：1=新增；2=删除；4=更新状态；8=排序；16=清理已完成。 */
const TODO_ADD = 0x1;
const TODO_REMOVE = 0x2;
const TODO_UPDATE = 0x4;
const TODO_MOVE = 0x8;
const TODO_CLEAR = 0x10;
/** todo supported_features 位：32=到期时间；64=描述。 */
const TODO_DUE_DATETIME = 0x20;
const TODO_DESCRIPTION = 0x40;
/** weather 能力位：1=每日；2=每小时；4=半日。 */
const WEATHER_DAILY = 0x1;
const WEATHER_HOURLY = 0x2;
const WEATHER_TWICE_DAILY = 0x4;
/** update 能力位：1=安装；2=指定版本；4=跳过；8=备份；16=更新说明。 */
const UPDATE_INSTALL = 0x1;
const UPDATE_VERSION = 0x2;
const UPDATE_SKIP = 0x4;
const UPDATE_BACKUP = 0x8;
const UPDATE_RELEASE_NOTES = 0x10;

type ListExtraPanelOptions = {
  element: any;
  feedbackSlot?: FeedbackSlot;
  onControl?: (command: any) => Promise<any>;
};

export function createListExtraPanel({
  element: hostElement,
  feedbackSlot,
  onControl = async () => {},
}: ListExtraPanelOptions) {
  const pickers = enhancePopupSelects(hostElement);
  const ownerDocument = hostElement.ownerDocument || globalThis.document;
  const createElement = (tagName: string, textContent = "") => {
    const node = ownerDocument.createElement(tagName);
    node.textContent = textContent;
    return node;
  };

  const statusElement = createElement("p");
  const readoutsElement = createElement("div");
  const actionsElement = createElement("div");
  const contentElement = createElement("div");
  const formElement = createElement("div");
  const errorElement = createElement("p");
  const refreshButton = createElement("button", "刷新内容") as HTMLButtonElement;

  hostElement.classList.add("i3d-extra-list-panel");
  actionsElement.className = "i3d-extra-actions";
  formElement.className = "i3d-extra-form";
  contentElement.className = "i3d-extra-list-content";
  readoutsElement.className = "i3d-extra-readouts";
  errorElement.className = "i3d-climate-error";
  errorElement.setAttribute("role", "status");
  refreshButton.type = "button";
  refreshButton.className = "i3d-climate-choice";
  actionsElement.append(refreshButton);
  hostElement.replaceChildren(
    statusElement,
    readoutsElement,
    actionsElement,
    contentElement,
    formElement,
    errorElement,
  );

  let viewModel: ExtraPanelViewModel | null = null;
  let disposed = false;
  let generation = 0;
  let busyCount = 0;
  let contentLoading = false;
  let contentSignature = "";
  let confirmSignature = "";
  let payload: any = null;
  const inputs = new Map<string, any>();

  const stateOf = () => viewModel?.state?.newState || viewModel?.state;
  const attributes = () => attributesOf(stateOf());
  const flags = () => featureFlags(attributes());
  const isUsable = () =>
    !!viewModel &&
    viewModel.item.modelAvailable !== false &&
    stateOf()?.available !== false &&
    !["", "unavailable", "unknown", undefined].includes(stateOf()?.state);
  const isDisabled = () => disposed || !viewModel || viewModel.editing || !isUsable() || busyCount > 0;
  const domain = () => String(viewModel?.item?.entityId).split(".")[0];

  function addButton(parent: any, label: string, onClick: () => any) {
    const button = createElement("button", label) as HTMLButtonElement;
    button.type = "button";
    button.className = "i3d-climate-choice";
    button.addEventListener("click", onClick);
    parent.append(button);
    return button;
  }

  function addField(
    key: string,
    label: string,
    type = "text",
    options: any = {},
  ) {
    const row = createElement("label");
    const input = createElement(
      type === "select" ? "select" : type === "textarea" ? "textarea" : "input",
    ) as any;
    row.className = "i3d-extra-field";
    row.append(createElement("span", label), input);
    input.setAttribute("aria-label", label);
    if (!["select", "textarea"].includes(type)) input.type = type;
    if (options.choices) {
      for (const [value, text] of options.choices) {
        const option = createElement("option", text) as HTMLOptionElement;
        option.value = value;
        input.append(option);
      }
    }
    if (options.value !== undefined) input.value = options.value;
    if (type === "checkbox") input.checked = !!options.value;
    (options.parent || formElement).append(row);
    inputs.set(key, input);
    return input;
  }

  async function callService(service: string, data: any = {}, refreshContent = false, confirm = false) {
    if (isDisabled()) return;
    if (
      confirm &&
      (confirmSignature !== JSON.stringify([service, data]) || !errorElement.textContent)
    ) {
      confirmSignature = JSON.stringify([service, data]);
      errorElement.dataset.kind = "confirm";
      errorElement.textContent = "请再次点击确认此操作。";
      return;
    }
    confirmSignature = "";
    const requestGeneration = generation;
    busyCount++;
    errorElement.textContent = "";
    syncDisabled();
    try {
      const response = await onControl({
        entityId: viewModel!.item.entityId,
        domain: domain(),
        service,
        data,
      });
      if (disposed || requestGeneration !== generation) return;
      if (refreshContent) {
        contentLoading = false;
        busyCount--;
        await loadContent();
        if (disposed || requestGeneration !== generation) return;
        busyCount++;
      } else {
        return response;
      }
    } catch (error: any) {
      if (!disposed && requestGeneration === generation) {
        errorElement.dataset.kind = "error";
        errorElement.textContent = error?.message || "内容操作失败";
      }
    } finally {
      if (!disposed && requestGeneration === generation) {
        busyCount--;
        syncDisabled();
      }
    }
  }

  const inputValue = (key: string) => inputs.get(key)?.value || "";
  const readRange = () => ({
    start: toIsoDateTime(inputValue("range-start")),
    end: toIsoDateTime(inputValue("range-end")),
  });

  async function loadContent() {
    if (isDisabled() || !gate.visible() || disposed) return;
    const requestGeneration = generation;
    let service: string | undefined;
    let data: any = {};
    try {
      if (domain() === "calendar") {
        service = "list_events";
        data = readRange();
      } else if (domain() === "todo") {
        service = "get_items";
      } else if (domain() === "weather") {
        service = "get_forecasts";
        data = { type: inputValue("forecast") };
        if (!data.type) {
          contentLoading = false;
          return;
        }
      }
      if (!service) {
        contentLoading = false;
        return;
      }
      contentLoading = true;
      const response = await callService(service, data);
      if (disposed || requestGeneration !== generation || response === undefined) return;
      payload = unwrapExtraResponse(response, viewModel!.item.entityId);
      contentLoading = false;
      renderContent();
    } catch (error: any) {
      if (requestGeneration !== generation || disposed) return;
      errorElement.dataset.kind = "error";
      errorElement.textContent = error?.message;
    }
  }

  function addCalendarForm(parent: any, event: any = null) {
    const details = createElement("details");
    const summary = createElement("summary", event ? "编辑日程" : "新增日程");
    const body = createElement("div");
    details.append(summary, body);
    body.className = "i3d-extra-form";
    parent.append(details);
    const localInputs = new Map<string, any>();
    const addLocal = (key: string, label: string, type: string, value: any) => {
      const row = createElement("label");
      const input = createElement(type === "textarea" ? "textarea" : "input") as any;
      row.className = "i3d-extra-field";
      if (type !== "textarea") input.type = type;
      input.value = value || "";
      input.setAttribute("aria-label", label);
      row.append(createElement("span", label), input);
      body.append(row);
      localInputs.set(key, input);
      return input;
    };
    addLocal("summary", "日程标题", "text", event?.summary);
    const allDay = addLocal("allDay", "全天日程", "checkbox", "") as HTMLInputElement;
    allDay.checked = !!(
      event?.all_day ||
      event?.start?.date ||
      (typeof event?.start == "string" && !event.start.includes("T"))
    );
    const eventTime = (key: string) =>
      typeof event?.[key] == "object"
        ? event[key].dateTime || event[key].date
        : event?.[key];
    const startInput = addLocal("start", "开始", "datetime-local", toLocalDateTimeInput(eventTime("start")));
    const endInput = addLocal("end", "结束", "datetime-local", toLocalDateTimeInput(eventTime("end")));
    const syncAllDay = () => {
      for (const input of [startInput, endInput]) {
        const current = input.value;
        input.type = allDay.checked ? "date" : "datetime-local";
        input.value = allDay.checked
          ? current.slice(0, 10)
          : current.length === 10
            ? `${current}T00:00`
            : current;
      }
    };
    allDay.addEventListener("change", syncAllDay);
    if (allDay.checked) {
      syncAllDay();
      startInput.value = String(eventTime("start") || "").slice(0, 10);
      endInput.value = String(eventTime("end") || "").slice(0, 10);
    }
    addLocal("description", "日程说明", "textarea", event?.description);
    addLocal("location", "地点", "text", event?.location);
    addButton(body, event ? "保存日程" : "创建日程", () => {
      try {
        const core = {
          summary: localInputs.get("summary").value,
          description: localInputs.get("description").value,
          location: localInputs.get("location").value,
        };
        const start = allDay.checked ? startInput.value : toIsoDateTime(startInput.value);
        const end = allDay.checked ? endInput.value : toIsoDateTime(endInput.value);
        if (event) {
          void callService(
            "update_event",
            {
              uid: event.uid,
              event: { ...core, start, end },
              ...(event.recurrence_id ? { recurrence_id: event.recurrence_id } : {}),
            },
            true,
          );
        } else {
          void callService(
            "create_event",
            {
              ...core,
              [allDay.checked ? "start_date" : "start_date_time"]: start,
              [allDay.checked ? "end_date" : "end_date_time"]: end,
            },
            true,
          );
        }
      } catch (error: any) {
        errorElement.dataset.kind = "error";
        errorElement.textContent = error?.message;
      }
    });
  }

  function addTodoForm(parent: any, item: any = null) {
    const details = createElement("details");
    const summary = createElement("summary", item ? "编辑待办" : "新增待办");
    const body = createElement("div");
    details.append(summary, body);
    body.className = "i3d-extra-form";
    parent.append(details);
    const localFlags = flags();
    const addLocal = (label: string, type: string, value: any) => {
      const row = createElement("label");
      const input = createElement(type === "textarea" ? "textarea" : "input") as any;
      row.className = "i3d-extra-field";
      if (type !== "textarea") input.type = type;
      input.value = value || "";
      input.setAttribute("aria-label", label);
      row.append(createElement("span", label), input);
      body.append(row);
      return input;
    };
    const titleInput = addLocal("待办标题", "text", item?.summary);
    const descriptionInput =
      localFlags & TODO_DESCRIPTION ? addLocal("待办说明", "textarea", item?.description) : null;
    const dueInput =
      localFlags & (TODO_DUE_DATETIME | 0x10)
        ? addLocal(
            localFlags & TODO_DUE_DATETIME ? "到期时间" : "到期日期",
            localFlags & TODO_DUE_DATETIME ? "datetime-local" : "date",
            localFlags & TODO_DUE_DATETIME
              ? toLocalDateTimeInput(item?.due)
              : item?.due?.slice(0, 10),
          )
        : null;
    addButton(body, item ? "保存待办" : "添加待办", () => {
      try {
        const data: any = item
          ? { item: item.uid || item.summary, rename: titleInput.value }
          : { item: titleInput.value };
        if (descriptionInput) data.description = descriptionInput.value;
        if (dueInput?.value) {
          data[localFlags & TODO_DUE_DATETIME ? "due_datetime" : "due_date"] =
            localFlags & TODO_DUE_DATETIME ? toIsoDateTime(dueInput.value) : dueInput.value;
        }
        void callService(item ? "update_item" : "add_item", data, true);
      } catch (error: any) {
        errorElement.dataset.kind = "error";
        errorElement.textContent = error?.message;
      }
    });
  }

  function renderContent() {
    contentElement.replaceChildren();
    const localFlags = flags();
    const currentDomain = domain();

    if (currentDomain === "calendar") {
      const events = Array.isArray(payload) ? payload : payload?.events || [];
      if (!events.length) contentElement.append(createElement("p", "此时间段暂无日程"));
      for (const event of events) {
        const article = createElement("article");
        article.append(createElement("strong", event.summary || "无标题日程"));
        const eventTime = (value: any) =>
          typeof value == "object" ? value.dateTime || value.date : value;
        article.append(
          createElement("p", `${eventTime(event.start)} → ${eventTime(event.end)}`),
        );
        if (event.location) article.append(createElement("p", event.location));
        if (event.description) article.append(createElement("p", event.description));
        if (localFlags & CALENDAR_UPDATE && event.uid) addCalendarForm(article, event);
        if (localFlags & CALENDAR_DELETE && event.uid) {
          addButton(article, "删除日程", () =>
            void callService(
              "delete_event",
              {
                uid: event.uid,
                ...(event.recurrence_id ? { recurrence_id: event.recurrence_id } : {}),
              },
              true,
              true,
            ),
          );
        }
        contentElement.append(article);
      }
    } else if (currentDomain === "todo") {
      const items = payload?.items || [];
      if (!items.length) contentElement.append(createElement("p", "暂无待办事项"));
      items.forEach((todo: any, index: number) => {
        const article = createElement("article");
        article.append(createElement("strong", todo.summary || "无标题待办"));
        if (todo.description) article.append(createElement("p", todo.description));
        if (todo.due) article.append(createElement("p", `到期 ${todo.due}`));
        if (localFlags & TODO_UPDATE) {
          addButton(article, todo.status === "completed" ? "恢复待办" : "标记完成", () =>
            void callService(
              "update_item",
              {
                item: todo.uid || todo.summary,
                status: todo.status === "completed" ? "needs_action" : "completed",
              },
              true,
            ),
          );
        } else {
          article.append(createElement("span", todo.status === "completed" ? "已完成" : "待完成"));
        }
        if (localFlags & TODO_UPDATE) addTodoForm(article, todo);
        if (localFlags & TODO_MOVE && todo.uid && index > 0) {
          addButton(article, "上移", () =>
            void callService(
              "move_item",
              {
                uid: todo.uid,
                ...(index > 1 ? { previous_uid: items[index - 2].uid } : {}),
              },
              true,
            ),
          );
        }
        if (localFlags & TODO_REMOVE) {
          addButton(article, "删除待办", () =>
            void callService("remove_item", { item: todo.uid || todo.summary }, true, true),
          );
        }
        contentElement.append(article);
      });
    } else if (currentDomain === "weather") {
      const forecast = payload?.forecast || [];
      if (!forecast.length) contentElement.append(createElement("p", "暂无预报数据"));
      for (const entry of forecast) {
        const article = createElement("article");
        article.append(
          createElement("strong", entry.datetime ? new Date(entry.datetime).toLocaleString() : ""),
        );
        for (const [key, label, unit] of [
          ["condition", "天气", ""],
          ["temperature", "温度", attributes().temperature_unit || ""],
          ["templow", "最低温", attributes().temperature_unit || ""],
          ["precipitation_probability", "降水概率", "%"],
          ["precipitation", "降水", attributes().precipitation_unit || ""],
          ["wind_speed", "风速", attributes().wind_speed_unit || ""],
          ["humidity", "湿度", "%"],
        ] as const) {
          if (entry[key] != null) article.append(createElement("span", `${label} ${entry[key]}${unit}`));
        }
        contentElement.append(article);
      }
    }
    syncDisabled();
  }

  function buildForms() {
    inputs.clear();
    formElement.replaceChildren();
    actionsElement.replaceChildren(refreshButton);
    contentElement.replaceChildren();
    const localFlags = flags();
    const currentDomain = domain();
    refreshButton.hidden = currentDomain === "update";

    if (currentDomain === "calendar") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      addField("range-start", "查看开始", "datetime-local", {
        parent: actionsElement,
        value: toLocalDateTimeInput(start),
      });
      addField("range-end", "查看结束", "datetime-local", {
        parent: actionsElement,
        value: toLocalDateTimeInput(end),
      });
      if (localFlags & CALENDAR_CREATE) addCalendarForm(formElement);
    } else if (currentDomain === "todo") {
      if (localFlags & TODO_ADD) addTodoForm(formElement);
      if (localFlags & TODO_CLEAR) {
        addButton(formElement, "清理已完成待办", () =>
          void callService("remove_completed_items", {}, true, true),
        );
      }
    } else if (currentDomain === "weather") {
      const forecasts = (
        [
          ["daily", "每日", WEATHER_DAILY],
          ["hourly", "每小时", WEATHER_HOURLY],
          ["twice_daily", "半日", WEATHER_TWICE_DAILY],
        ] as const
      )
        .filter(([, , bit]) => localFlags & bit)
        .map(([value, label]) => [value, label]);
      if (forecasts.length) {
        addField("forecast", "预报方式", "select", {
          parent: actionsElement,
          choices: forecasts,
        }).addEventListener("change", () => void loadContent());
      } else {
        refreshButton.hidden = true;
      }
    } else if (currentDomain === "update") {
      if (localFlags & UPDATE_VERSION) addField("version", "指定版本（留空为最新）");
      if (localFlags & UPDATE_BACKUP) addField("backup", "更新前备份", "checkbox");
      if (localFlags & UPDATE_INSTALL) {
        const installButton = addButton(formElement, "安装更新", () =>
          void callService(
            "install",
            {
              ...(inputValue("version") ? { version: inputValue("version") } : {}),
              ...(localFlags & UPDATE_BACKUP
                ? { backup: !!inputs.get("backup")?.checked }
                : {}),
            },
            false,
            true,
          ),
        );
        installButton.dataset.install = "true";
        addButton(formElement, "跳过此版本", () => void callService("skip"));
        addButton(formElement, "清除跳过版本", () => void callService("clear_skipped"));
        if (localFlags & UPDATE_RELEASE_NOTES) {
          addButton(formElement, "查看更新说明", async () => {
            const requestGeneration = generation;
            const response = await callService("release_notes");
            if (disposed || requestGeneration !== generation || response === undefined) return;
            contentElement.replaceChildren(
              createElement(
                "p",
                typeof response == "string" ? response : response?.release_notes || "暂无更新说明",
              ),
            );
          });
        }
      }
    }
    pickers.sync();
  }

  function syncDisabled() {
    for (const element of hostElement.querySelectorAll("button,input,select,textarea")) {
      element.disabled =
        isDisabled() || (element.dataset.install === "true" && !!attributes().in_progress);
    }
    pickers.sync();
  }

  function render() {
    if (disposed || !viewModel) return;
    const currentDomain = domain();
    const state = stateOf();
    const stateAttributes = attributes();
    const signature = JSON.stringify([viewModel.item.entityId, flags()]);
    if (signature !== contentSignature) {
      contentSignature = signature;
      contentLoading = false;
      payload = null;
      buildForms();
    }

    statusElement.textContent = isUsable()
      ? currentDomain === "update"
        ? state.state === "on"
          ? "有可用更新"
          : "已是最新版本"
        : currentDomain === "todo"
          ? `未完成 ${state.state} 项`
          : currentDomain === "calendar"
            ? state.state === "on"
              ? "当前有日程"
              : "当前无进行中的日程"
            : state.state
      : state?.state === "unknown"
        ? "状态未知"
        : "设备不可用";

    const entries =
      currentDomain === "update"
        ? [
            ["当前版本", stateAttributes.installed_version],
            ["最新版本", stateAttributes.latest_version],
            ["已跳过", stateAttributes.skipped_version],
            [
              "安装进度",
              stateAttributes.update_percentage == null
                ? stateAttributes.in_progress
                  ? "进行中"
                  : null
                : `${stateAttributes.update_percentage}%`,
            ],
          ]
        : currentDomain === "weather"
          ? [
              [
                "温度",
                stateAttributes.temperature == null
                  ? null
                  : `${stateAttributes.temperature}${stateAttributes.temperature_unit || ""}`,
              ],
              ["湿度", stateAttributes.humidity == null ? null : `${stateAttributes.humidity}%`],
              [
                "气压",
                stateAttributes.pressure == null
                  ? null
                  : `${stateAttributes.pressure}${stateAttributes.pressure_unit || ""}`,
              ],
              [
                "风速",
                stateAttributes.wind_speed == null
                  ? null
                  : `${stateAttributes.wind_speed}${stateAttributes.wind_speed_unit || ""}`,
              ],
            ]
          : [];
    readoutsElement.replaceChildren(
      ...entries
        .filter(([, value]) => value != null)
        .map(([label, value]) => createElement("span", `${label} ${value}`)),
    );

    syncDisabled();
    if (isUsable() && !viewModel.editing && gate.visible() && !contentLoading && !busyCount) {
      void loadContent();
    }
  }

  refreshButton.addEventListener("click", () => void loadContent());
  const gate = createVisibilityGate(hostElement, render);
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
        busyCount = 0;
        contentLoading = false;
        confirmSignature = "";
        errorElement.textContent = "";
      }
      viewModel = nextViewModel;
      render();
    },
    dispose() {
      disposed = true;
      pickers.dispose();
      releaseFeedback();
      generation++;
      gate.dispose();
      viewModel = null;
      inputs.clear();
      hostElement.replaceChildren();
    },
  };
}
