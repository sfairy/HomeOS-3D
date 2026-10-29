/** 楼层条目：只保留配置入口需要的两个字段（`id` 用于绑定，`name` 用于弹窗文案）。 */
export interface ConfigurationFloorRecord {
  id: string;
  name?: string;
}

export interface CurrentConfigurationFloorsOptions {
  /** 已保存的场景快照 id（`properties.sceneId`）。 */
  sceneId: string;
  projectId?: string;
  /**
   * 上一次同步拿到的服务端游标（`syncKey`）。
   *
   * 带上它服务端才能在「没有变化」时回 `204`，省掉一整份场景载荷；没有就退化成每次全量。
   */
  since?: string;
  /** 编辑器视图里已有的楼层（`editorView.metadata.floors`），`204` 时直接沿用。 */
  metadataFloors?: ConfigurationFloorRecord[];
  fetch?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface CurrentConfigurationFloorsResult {
  floors: ConfigurationFloorRecord[];
  /** 新的服务端游标；`204` 或没有游标时为空串。 */
  syncKey: string;
  /** `current` = 服务端返回了新场景；`metadata` = 204 沿用编辑器视图里的楼层。 */
  source: "current" | "metadata";
}

/** 请求超时：楼层只是入口的第一步，卡住会让「配置」按钮一直转圈。 */
const CURRENT_FLOORS_TIMEOUT_MS = 5000;

function toFloorRecords(floors: unknown): ConfigurationFloorRecord[] {
  if (!Array.isArray(floors)) return [];
  return floors
    .filter((floor): floor is { id?: unknown; name?: unknown } => Boolean(floor) && typeof floor === "object")
    .filter((floor) => typeof floor.id === "string" && floor.id)
    .map((floor) => ({
      id: floor.id as string,
      name: typeof floor.name === "string" ? floor.name : undefined,
    }));
}

/**
 * 读取「当前」楼层列表：服务端可能已经因为别的窗口保存而多/少了楼层，直接拿编辑器视图里的
 * `metadata.floors` 会让用户选到一个已经消失的楼层。
 *
 * 口径（对齐 0.8.1）：
 * - `204` → 内容没变，沿用 `metadataFloors`；
 * - `200` → 用响应里的 `scene.floors`（并记下新的 `syncKey` 供下次轮询）；
 * - 超时 / 网络错误 / 非 2xx → 抛错，由调用方决定退回旧列表还是提示。
 */
export async function currentConfigurationFloors({
  sceneId,
  projectId = "",
  since = "",
  metadataFloors = [],
  fetch: fetcher = globalThis.fetch,
  signal,
  timeoutMs = CURRENT_FLOORS_TIMEOUT_MS,
}: CurrentConfigurationFloorsOptions): Promise<CurrentConfigurationFloorsResult> {
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  const requestAbortController = new AbortController(),
    abortFromCaller = () => requestAbortController.abort(),
    timeoutId = setTimeout(() => requestAbortController.abort("timeout"), timeoutMs),
    params = new URLSearchParams();
  projectId && params.set("projectId", projectId);
  since && params.set("since", since);
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    const response = await fetcher(
      `/api/v1/modules/interaction3d/scenes/${encodeURIComponent(sceneId)}/current${
        params.size ? `?${params}` : ""
      }`,
      {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: requestAbortController.signal,
      },
    );
    if (response.status === 204)
      return { floors: metadataFloors, syncKey: since, source: "metadata" };
    if (!response.ok) {
      const detail = await response
        .json()
        .then((body: { detail?: unknown }) => (typeof body?.detail === "string" ? body.detail : ""))
        .catch(() => "");
      throw new Error(detail || "读取最新楼层失败，请稍后重试。");
    }
    const body = (await response.json().catch(() => ({}))) as {
      scene?: { floors?: unknown };
      syncKey?: unknown;
    };
    const floors = toFloorRecords(body?.scene?.floors);
    if (!floors.length) throw new Error("户型没有可配置的楼层，请重新载入户型。");
    return {
      floors,
      syncKey: typeof body?.syncKey === "string" ? body.syncKey : "",
      source: "current",
    };
  } catch (error) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    if (requestAbortController.signal.aborted && requestAbortController.signal.reason === "timeout")
      throw new Error("读取最新楼层超时，请稍后重试。");
    throw error instanceof Error ? error : new Error("读取最新楼层失败，请稍后重试。");
  } finally {
    (clearTimeout(timeoutId), signal?.removeEventListener("abort", abortFromCaller));
  }
}

/** 配置入口的楼层选择：单楼层直接进入，多楼层弹原生 dialog（Esc / 取消 / 页面离开都返回 null）。 */
export function chooseConfigurationFloor(
  floors: { id: string; name?: string }[] | null | undefined,
  { document: ownerDocument = globalThis.document, signal }: { document?: Document; signal?: AbortSignal } = {},
): Promise<string | null> {
  if (signal?.aborted) return Promise.resolve(null);
  if (!floors?.length)
    return Promise.reject(new Error("户型没有可配置的楼层，请重新载入户型。"));
  if (floors.length === 1) return Promise.resolve(floors[0].id);

  return new Promise((resolve) => {
    const create = (tagName: string, textContent = "", className = ""): any => {
      const node = ownerDocument.createElement(tagName);
      node.textContent = textContent;
      node.className = className;
      return node;
    };
    const dialogElement = create(
      "dialog",
      "",
      "settings-dialog i3d-performance-dialog i3d-floor-entry-dialog",
    );
    dialogElement.setAttribute("aria-label", "选择配置楼层");
    const headingElement = create("h2", "选择配置楼层");
    const optionsElement = create("div", "", "i3d-floor-entry-options");
    let settled = false;

    const finish = (floorId: string | null) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", cancel);
      ownerDocument.defaultView?.removeEventListener("pagehide", cancel);
      dialogElement.close();
      dialogElement.remove();
      resolve(floorId);
    };
    const cancel = () => finish(null);

    for (const floor of floors) {
      const optionButton = create("button", floor.name || "未命名楼层");
      optionButton.type = "button";
      optionButton.addEventListener("click", () => finish(floor.id));
      optionsElement.append(optionButton);
    }
    const actionsElement = create("div", "", "dialog-actions");
    const cancelButton = create("button", "取消");
    cancelButton.type = "button";
    cancelButton.addEventListener("click", cancel);
    actionsElement.append(cancelButton);
    dialogElement.append(headingElement, optionsElement, actionsElement);
    dialogElement.addEventListener("cancel", (cancelEvent: Event) => {
      cancelEvent.preventDefault();
      cancel();
    });
    dialogElement.addEventListener("close", cancel);
    signal?.addEventListener("abort", cancel, { once: true });
    ownerDocument.defaultView?.addEventListener("pagehide", cancel, { once: true });
    ownerDocument.body.append(dialogElement);
    dialogElement.showModal();
    (optionsElement.children[0] as HTMLElement | undefined)?.focus();
  });
}
