/**
 * 弹窗里的"操作反馈"聚合层。
 *
 * 各面板原本各自往 `feedbackSlot` 里塞一段文字，结果同一个弹窗里会出现
 * 三条重复提示（而且成功提示还会盖住真正的错误）。这里把宿主弹窗里所有
 * `feedbackSlot` 挂载的节点收进一个统一的 `role=status` 区域：
 *
 * - 同一个来源重复出现的相同文案只显示一次；
 * - 成功后 2 秒自动收起；
 * - 错误一直保留到用户关闭或换设备；
 * - `popupFeedbackText()` 把 HA 的原始英文/HTTP 报错翻译成人话。
 */

/** 把 HA / 网络层的原始错误文本压成一句用户能理解的话；无需提示时返回空串。 */
export function popupFeedbackText(value: any): string {
  const text = String(value || "").trim();
  // "指令已发送，状态以设备回报为准"这类文案没有信息量，直接吞掉。
  if (
    /^(?:(?:指令|命令)(?:已发送|发送成功)[，。,.\s]*(?:状态以设备回报为准[。.]?)?|(?:请求|服务调用|操作|发送)(?:已成功|成功)[。.]?)$/.test(
      text,
    )
  ) {
    return "";
  }
  const httpStatus = /^Home Assistant\b[^\n]*\bHTTP\s+(\d{3})\b/i.exec(text);
  if (httpStatus) {
    const status = Number(httpStatus[1]);
    if (status === 401) return "设备连接已失效，请重新连接。";
    if (status === 403) return "没有权限执行此操作。";
    if (status === 404 || status === 410) return "设备或功能不可用，请检查绑定。";
    if (status === 408 || status === 504) return "设备响应超时，请重试。";
    if (status === 429) return "操作太频繁，请稍后重试。";
    if (status >= 500) return "设备暂时无法完成操作，请稍后重试。";
    return "操作未完成，请检查输入内容。";
  }
  if (/^(?:Failed to fetch|NetworkError|Load failed|Network request failed|fetch failed)\b/i.test(text)) {
    return "连接中断，请稍后重试。";
  }
  if (/\b(?:extra keys not allowed|required key not provided)\s*@\s*data\[/i.test(text)) {
    return "设备暂时无法完成操作，请稍后重试。";
  }
  // 带着异常栈 / 接口路径 / JSON 片段 / 全英文的文本一律不外露。
  const leaksInternals =
    /\b(?:TypeError|ReferenceError|SyntaxError|Traceback|HTTP|entity_id|service_data|invalid_format)\b|\b(?:GET|POST|PUT|DELETE)\s+\/|\/api\/|\bService not found\b|^\s*[\[{]/.test(
      text,
    );
  if (leaksInternals || (text && !/[\u3400-\u9fff]/.test(text))) {
    return "操作未完成，请稍后重试。";
  }
  return text;
}

type FeedbackAttachOptions = {
  /** 反馈归属（实体 id）：`begin()` 用它切换来源时清理旧提示。 */
  source?: string | (() => string);
  /** 提示标题（设备名 / 操作名）。 */
  label?: string | (() => string);
  /** `error`（默认）/ `confirm` / `success`。 */
  kind?: string;
  /** 提示被替换或关闭时回调：用于释放外部计时器。 */
  onRetire?: () => void;
};

type FeedbackEntry = {
  node: HTMLElement;
  wrapper: HTMLElement;
  presentation: HTMLElement | null;
  source: string | (() => string);
  label: string | (() => string);
  kind?: string;
  onRetire?: () => void;
  lastValue: string;
};

export type PopupFeedback = ReturnType<typeof createPopupFeedback>;

/** 成功提示自动收起的等待（毫秒）。 */
const AUTO_HIDE_DELAY = 2000;

/**
 * 在弹窗根元素上安装反馈聚合区。
 *
 * 调用方只需在原 `feedbackSlot.attach(node, {...})` 处换成这里返回的 `attach`，
 * 其余用法不变；返回的 `dispose()` 会断开 MutationObserver 并移除节点。
 */
export function createPopupFeedback({ element: hostElement }: { element: any }) {
  const ownerDocument = hostElement.ownerDocument || globalThis.document;
  const MutationObserverImpl =
    ownerDocument.defaultView?.MutationObserver || globalThis.MutationObserver;
  if (!MutationObserverImpl) {
    const noop = () => {};
    return {
      root: null as HTMLElement | null,
      attach: () => noop,
      begin: noop,
      clear: noop,
      dispose: noop,
    };
  }

  const createElement = (tagName: string, textContent = "") => {
    const node = ownerDocument.createElement(tagName);
    node.textContent = textContent;
    return node;
  };
  const rootElement = createElement("div");
  const labelElement = createElement("strong");
  const closeElement = createElement("button", "×");
  const listElement = createElement("div");
  rootElement.className = "i3d-popup-feedback";
  rootElement.hidden = true;
  rootElement.setAttribute("role", "status");
  rootElement.setAttribute("aria-live", "polite");
  closeElement.type = "button";
  closeElement.className = "i3d-popup-feedback-close";
  closeElement.setAttribute("aria-label", "关闭提示");
  rootElement.append(labelElement, closeElement, listElement);
  hostElement.classList.add("i3d-feedback-owner");
  hostElement.append(rootElement);

  const entries = new Map<HTMLElement, FeedbackEntry>();
  let activeEntry: FeedbackEntry | null = null;
  let disposed = false;
  let hideTimer: any = null;
  let hideGeneration = 0;

  function cancelHide() {
    clearTimeout(hideTimer);
    hideTimer = null;
    hideGeneration++;
  }

  function clear() {
    cancelHide();
    if (activeEntry) {
      activeEntry.wrapper.hidden = true;
      activeEntry.onRetire?.();
    }
    activeEntry = null;
    rootElement.hidden = true;
  }

  function show(entry: FeedbackEntry, autoHide = false) {
    if (disposed) return;
    if (activeEntry && activeEntry !== entry) {
      activeEntry.wrapper.hidden = true;
      activeEntry.onRetire?.();
    }
    // 让反馈条贴在标题栏下方：不同面板的标题类名不统一，这里按已知的三类查找。
    const heading = hostElement.querySelector?.(
      ":scope > .i3d-climate-heading, :scope > .i3d-nas-heading, :scope > .i3d-cover-heading",
    );
    if (heading) {
      rootElement.style?.setProperty(
        "--i3d-feedback-top",
        `${heading.offsetTop + heading.offsetHeight + 4}px`,
      );
    }
    activeEntry = entry;
    labelElement.textContent =
      typeof entry.label === "function" ? entry.label() : entry.label || "";
    labelElement.hidden = !labelElement.textContent;
    // 原文交给 `popupFeedbackText` 翻译；`presentation` 是给 `<p>` 来源用的替身。
    if (entry.presentation) {
      entry.presentation.textContent = popupFeedbackText(entry.node.textContent);
    }
    rootElement.dataset.kind = entry.kind || entry.node.dataset.kind || "error";
    entry.wrapper.hidden = false;
    rootElement.hidden = false;
    if (autoHide) {
      cancelHide();
      if (rootElement.dataset.kind !== "confirm") {
        const generation = hideGeneration;
        hideTimer = setTimeout(() => {
          if (generation === hideGeneration && activeEntry === entry) clear();
        }, AUTO_HIDE_DELAY);
        hideTimer?.unref?.();
      }
    }
  }

  function syncEntry(entry: FeedbackEntry, force = false) {
    if (!entries.has(entry.node)) return;
    const text = String(entry.node.textContent || "").trim();
    const visible = text && !entry.node.hidden && (!entry.presentation || popupFeedbackText(text));
    if (!visible) {
      entry.lastValue = "";
      if (activeEntry === entry) clear();
      return;
    }
    if (text !== entry.lastValue || force) {
      entry.lastValue = text;
      show(entry, true);
    } else if (activeEntry === entry) {
      show(entry);
    }
  }

  const observer = new MutationObserverImpl((mutations: MutationRecord[]) => {
    const touched = new Map<FeedbackEntry, boolean>();
    for (const mutation of mutations) {
      let target: any = mutation.target as any;
      while (target && target !== rootElement && !entries.has(target)) {
        target = target.parentNode;
      }
      const entry = entries.get(target);
      if (entry) touched.set(entry, touched.get(entry) || mutation.type === "attributes");
    }
    for (const [entry, force] of touched) syncEntry(entry, force);
  });
  observer.observe(listElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["hidden"],
  });
  closeElement.addEventListener("click", clear);

  return {
    root: rootElement as HTMLElement | null,
    /**
     * 把一个反馈节点托管进来；返回的卸载函数可安全重复调用。
     * 传进来的节点必须已经挂到 `element` 的子树里（面板通常先 append）。
     */
    attach(node: HTMLElement, options: FeedbackAttachOptions = {}) {
      if (disposed) return () => {};
      const wrapper = createElement("div");
      wrapper.hidden = true;
      // `<p>` 来源保留原文节点（供 aria 读取），视觉上换成翻译后的替身。
      const presentation = node.tagName === "P" ? createElement("p") : null;
      if (presentation) {
        node.classList.add("i3d-popup-feedback-source");
        node.setAttribute("aria-hidden", "true");
      }
      const entry: FeedbackEntry = {
        node,
        wrapper,
        presentation,
        source: options.source ?? "",
        label: options.label ?? "",
        kind: options.kind,
        onRetire: options.onRetire,
        lastValue: "",
      };
      entries.set(node, entry);
      wrapper.append(node, ...(presentation ? [presentation] : []));
      listElement.append(wrapper);
      syncEntry(entry);
      return () => {
        if (!entries.has(node)) return;
        entries.delete(node);
        if (activeEntry === entry) clear();
        wrapper.remove();
      };
    },
    /** 切换反馈归属（换设备 / 换操作）：清掉其它来源的旧提示。 */
    begin(source: string) {
      const sourceOf = (entry: FeedbackEntry) =>
        typeof entry.source === "function" ? entry.source() : entry.source;
      if (activeEntry && sourceOf(activeEntry) !== source) clear();
      for (const entry of entries.values()) {
        if (sourceOf(entry) === source) entry.lastValue = "";
      }
    },
    clear,
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      clear();
      entries.clear();
      rootElement.remove();
    },
  };
}
