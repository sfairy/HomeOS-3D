/**
 * 原生 `<select>` 的统一外观层（3D 配置弹窗 `dialog.i3d-editor` 及其子弹窗）。
 *
 * 为什么不直接改 `createSelectRow`：配置面板有 40+ 处 `createSelectRow`，7 个弹窗还各自建
 * select。原生 select 展开的是**系统菜单**（macOS 深色圆角 + 系统蓝高亮），既不跟随应用主题
 * 色，30+ 条灯组列表也没法筛选。这里只替换显示层：`select` 仍是值真源
 * （`.value` / `.disabled` / `change` / `querySelector("select")` 全部保持原语义），
 * 调用方零改动。
 *
 * 外壳结构（沿用应用里既有的 `.custom-select*` 类名，并加 `i3d-select` 标记类；样式见
 * `runtime.css` 的 `.i3d-select .custom-select*` 一节 —— 带上标记类是为了让挂在
 * `document.body` 上的子弹窗（`dialog.i3d-add-dialog` 等）也吃到同一套样式）：
 *
 *   <span class="custom-select i3d-select">
 *     <select class="native-select-control" aria-hidden="true" tabindex="-1">…</select>
 *     <button class="custom-select-button" aria-haspopup="listbox"><span>当前值</span></button>
 *     <div class="custom-select-menu" role="listbox">
 *       <input class="custom-select-search">（选项 ≥ 8 条时才有）
 *       <button class="custom-select-option" role="option">…</button>
 *     </div>
 *   </span>
 *
 * 浮层 `position: fixed`，不受右侧 aside 的滚动裁剪；菜单挂在 wrapper 里，面板重绘时跟着
 * select 一起被移除，不会在弹窗里堆积游离节点。新插入的 select（弹窗、重绘）由
 * MutationObserver 兜住，`refresh()` 用于渲染结束后立即对齐一次。
 */

/** 选项多到这个数就加筛选框（灯组/设备列表常见 30+ 条）。 */
const SEARCHABLE_OPTION_COUNT = 8;

const MENU_EDGE_MARGIN = 8;

const MENU_MAX_HEIGHT = 320;

/** 悬浮菜单最小宽度：灯名比 1/3 侧栏宽，太窄会一直省略号。 */
const MENU_MIN_WIDTH = 168;

interface OptionControl {
  value: string;
  label: string;
  button: HTMLButtonElement;
}

interface SelectControl {
  select: HTMLSelectElement;
  wrapper: HTMLSpanElement;
  button: HTMLButtonElement;
  valueElement: HTMLSpanElement;
  menu: HTMLDivElement;
  search: HTMLInputElement | null;
  options: OptionControl[];
  /** 选项集签名：变了才重建菜单（每帧重建会打断筛选输入）。 */
  signature: string;
  activeIndex: number;
  isOpen: boolean;
}

export interface SelectControlsHandle {
  /** 面板重绘结束后对齐一次（装饰器自己也会用 MutationObserver 兜底）。 */
  refresh: () => void;
  /** 收起展开中的菜单并停止观察（弹窗关闭时调用）。 */
  dispose: () => void;
}

export interface SelectControlsOptions {
  /**
   * 只接管满足条件的选择器元素。
   *
   * 根节点是 `document.body` 时必须给（否则会顺手改掉宿主页面上与本编辑器无关的 select）；
   * 根节点就是弹窗本体时可以省略。
   */
  accepts?: (selectElement: HTMLSelectElement) => boolean;
}

/**
 * 给 `root` 里所有 `<select>` 套上统一的自绘下拉。
 *
 * @param root 弹窗元素（面板与各弹窗的共同祖先），或 `document.body` + `accepts` 过滤。
 */
export function attachSelectControls(
  root: HTMLElement,
  options: SelectControlsOptions = {},
): SelectControlsHandle {
  const controls = new WeakMap<HTMLSelectElement, SelectControl>();
  const ownerDocument = root.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;
  let openControl: SelectControl | null = null;
  let queuedRefresh = false;
  let isRefreshing = false;
  let disposed = false;

  function rowLabelOf(control: SelectControl): string {
    const labelElement = control.wrapper.closest("label")?.querySelector(":scope > span:not(.custom-select)");
    return labelElement?.textContent?.trim() || "";
  }

  /** 该不该接管：多选 / 列表态 select 有自己的交互语义，原样保留。 */
  function shouldDecorate(selectElement: HTMLSelectElement): boolean {
    if (selectElement.multiple || selectElement.size > 1) return false;
    if (selectElement.dataset.nativeSelect === "true") return false;
    if (selectElement.closest(".custom-select")) return false;
    return options.accepts ? options.accepts(selectElement) : true;
  }

  function optionSignature(select: HTMLSelectElement): string {
    return Array.from(select.options)
      .map((option) => [option.value, option.textContent, option.disabled, option.hidden].join("\u0001"))
      .join("\u0002");
  }

  /** 把当前激活项滚动进菜单可视区（直接改 scrollTop，避免 `scrollIntoView` 连带滚 aside）。 */
  function revealActiveOption(control: SelectControl) {
    const activeButton = control.activeIndex >= 0 ? control.options[control.activeIndex]?.button : null;
    if (!control.isOpen || !activeButton) return;
    const menuTop = control.menu.scrollTop;
    const menuBottom = menuTop + control.menu.clientHeight;
    const optionTop = activeButton.offsetTop;
    const optionBottom = optionTop + activeButton.offsetHeight;
    if (optionTop < menuTop) control.menu.scrollTop = optionTop;
    else if (optionBottom > menuBottom) control.menu.scrollTop = optionBottom - control.menu.clientHeight;
  }

  function setActiveIndex(control: SelectControl, nextIndex: number) {
    control.activeIndex = nextIndex;
    control.options.forEach((optionControl, optionIndex) => {
      const isActive = optionIndex === nextIndex;
      optionControl.button.classList.toggle("active", isActive);
      optionControl.button.setAttribute("aria-selected", String(isActive));
    });
    revealActiveOption(control);
  }

  function applyFilter(control: SelectControl) {
    const filterText = (control.search?.value ?? "").trim().toLowerCase();
    let firstVisibleIndex = -1;
    control.options.forEach((optionControl, optionIndex) => {
      const isVisible = !filterText || optionControl.label.toLowerCase().includes(filterText);
      optionControl.button.hidden = !isVisible;
      if (isVisible && firstVisibleIndex < 0) firstVisibleIndex = optionIndex;
    });
    setActiveIndex(control, firstVisibleIndex);
  }

  function createSearchField(control: SelectControl): HTMLInputElement {
    const searchElement = ownerDocument.createElement("input");
    (searchElement.type = "search"),
      (searchElement.className = "custom-select-search"),
      (searchElement.autocomplete = "off"),
      searchElement.setAttribute("aria-label", "筛选选项"),
      (searchElement.placeholder = "筛选…"),
      searchElement.addEventListener("input", () => applyFilter(control));
    return searchElement;
  }

  function rebuildOptions(control: SelectControl) {
    const sourceOptions = Array.from(control.select.options).filter((option) => !option.hidden);
    control.search =
      sourceOptions.length >= SEARCHABLE_OPTION_COUNT ? (control.search ?? createSearchField(control)) : null;
    control.options = sourceOptions.map((option) => {
      const optionButton = ownerDocument.createElement("button");
      (optionButton.type = "button"),
        (optionButton.className = "custom-select-option"),
        (optionButton.dataset.value = option.value),
        optionButton.setAttribute("role", "option"),
        (optionButton.disabled = option.disabled),
        (optionButton.textContent = option.textContent);
      return { value: option.value, label: optionButton.textContent ?? "", button: optionButton };
    });
    control.menu.replaceChildren(
      ...(control.search ? [control.search] : []),
      ...control.options.map((optionControl) => optionControl.button),
    );
  }

  /**
   * 把价值真源对齐到「看得见的那一项」。
   *
   * 原生 select 的 `value` 不对应任何 option 时 `selectedIndex = -1`，浏览器显示为空白 ——
   * 面板里就只剩一个空框（旧实现里是「请选择」占位）。这里回落到第一项，让显示值、
   * `select.value` 和后续「保存配置」读到的值三者一致，不留「看起来选了 A、实际是空」的二义。
   * 显式声明了空值选项的列表（`["", "未绑定"]` 这类）不受影响：空串本身能匹配到自己的 option。
   */
  function alignSelectFallback(control: SelectControl): HTMLOptionElement | undefined {
    const select = control.select;
    if (select.selectedIndex >= 0) return select.options[select.selectedIndex];
    const firstOption = Array.from(select.options).find((option) => !option.hidden);
    if (!firstOption) return undefined;
    (select.value = firstOption.value), (select.selectedIndex = firstOption.index);
    return firstOption;
  }

  function syncControl(control: SelectControl) {
    const signature = optionSignature(control.select);
    signature !== control.signature &&
      ((control.signature = signature), rebuildOptions(control));
    const selectedLabel = alignSelectFallback(control)?.textContent?.trim() ?? "";
    const rowLabel = rowLabelOf(control);
    control.valueElement.textContent !== selectedLabel &&
      (control.valueElement.textContent = selectedLabel);
    control.button.disabled !== control.select.disabled &&
      (control.button.disabled = control.select.disabled);
    const buttonTitle = control.select.title || selectedLabel;
    control.button.title !== buttonTitle && (control.button.title = buttonTitle);
    const buttonLabel = rowLabel ? rowLabel + "：" + selectedLabel : selectedLabel;
    control.button.getAttribute("aria-label") !== buttonLabel &&
      control.button.setAttribute("aria-label", buttonLabel);
    control.menu.getAttribute("aria-label") !== rowLabel &&
      control.menu.setAttribute("aria-label", rowLabel || "选项");
    control.isOpen ||
      setActiveIndex(
        control,
        control.options.findIndex((optionControl) => optionControl.value === control.select.value),
      );
  }

  function positionMenu(control: SelectControl) {
    if (!ownerWindow) return;
    const anchorRect = control.button.getBoundingClientRect();
    const menuWidth = Math.round(
      Math.min(
        Math.max(anchorRect.width, MENU_MIN_WIDTH),
        Math.max(MENU_MIN_WIDTH, ownerWindow.innerWidth - MENU_EDGE_MARGIN * 2),
      ),
    );
    const maxHeight = Math.round(
      Math.min(MENU_MAX_HEIGHT, Math.max(120, ownerWindow.innerHeight - MENU_EDGE_MARGIN * 2)),
    );
    (control.menu.style.width = menuWidth + "px"), (control.menu.style.maxHeight = maxHeight + "px");
    const menuHeight = Math.min(control.menu.scrollHeight || maxHeight, maxHeight);
    const left = Math.min(
      Math.max(MENU_EDGE_MARGIN, anchorRect.left),
      Math.max(MENU_EDGE_MARGIN, ownerWindow.innerWidth - menuWidth - MENU_EDGE_MARGIN),
    );
    const fitsBelow = anchorRect.bottom + 4 + menuHeight + MENU_EDGE_MARGIN <= ownerWindow.innerHeight;
    (control.menu.style.left = Math.round(left) + "px"),
      (control.menu.style.top =
        Math.round(
          fitsBelow
            ? anchorRect.bottom + 4
            : Math.max(MENU_EDGE_MARGIN, anchorRect.top - menuHeight - 4),
        ) + "px");
  }

  function closeControl(restoreFocus = false) {
    const control = openControl;
    if (!control) return;
    openControl = null;
    (control.isOpen = false),
      (control.menu.hidden = true),
      control.button.setAttribute("aria-expanded", "false"),
      ownerDocument.removeEventListener("pointerdown", handleDocumentPointerDown, true),
      ownerDocument.removeEventListener("keydown", handleDocumentKeydown, true),
      ownerDocument.removeEventListener("scroll", handleDocumentScroll, true),
      ownerWindow?.removeEventListener("resize", closeControlOnResize);
    restoreFocus && control.button.focus({ preventScroll: true });
    syncControl(control);
  }

  function closeControlOnResize() {
    closeControl();
  }

  function pickOption(control: SelectControl, pickedValue: string) {
    closeControl(true);
    if (control.select.disabled || control.select.value === pickedValue) return;
    (control.select.value = pickedValue),
      control.select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function visibleOptionIndexes(control: SelectControl): number[] {
    const indexes: number[] = [];
    control.options.forEach((optionControl, optionIndex) => {
      optionControl.button.hidden || optionControl.button.disabled || indexes.push(optionIndex);
    });
    return indexes;
  }

  function stepActiveIndex(control: SelectControl, step: number) {
    const visibleIndexes = visibleOptionIndexes(control);
    if (!visibleIndexes.length) return;
    const currentPosition = visibleIndexes.indexOf(control.activeIndex);
    const nextPosition =
      currentPosition < 0
        ? step > 0
          ? 0
          : visibleIndexes.length - 1
        : (currentPosition + step + visibleIndexes.length) % visibleIndexes.length;
    setActiveIndex(control, visibleIndexes[nextPosition]);
  }

  function openControlMenu(control: SelectControl) {
    if (disposed || control.select.disabled || control.isOpen) return;
    closeControl();
    syncControl(control);
    (control.isOpen = true),
      (openControl = control),
      (control.menu.hidden = false),
      control.button.setAttribute("aria-expanded", "true");
    control.search && ((control.search.value = ""), applyFilter(control));
    setActiveIndex(
      control,
      control.options.findIndex((optionControl) => optionControl.value === control.select.value),
    );
    positionMenu(control);
    ownerDocument.addEventListener("pointerdown", handleDocumentPointerDown, true),
      ownerDocument.addEventListener("keydown", handleDocumentKeydown, true),
      ownerDocument.addEventListener("scroll", handleDocumentScroll, true),
      ownerWindow?.addEventListener("resize", closeControlOnResize);
    // 长列表直接进入筛选状态：点开就能输入灯名首字。
    control.search?.focus({ preventScroll: true });
  }

  function handleDocumentPointerDown(pointerEvent: PointerEvent) {
    const control = openControl;
    if (!control) return;
    const pointerTarget = pointerEvent.target;
    if (!(pointerTarget instanceof Node)) return;
    if (control.menu.contains(pointerTarget) || control.button.contains(pointerTarget)) return;
    closeControl();
  }

  function handleDocumentScroll(scrollEvent: Event) {
    const control = openControl;
    if (!control) return;
    const scrollTarget = scrollEvent.target;
    if (scrollTarget instanceof Node && control.menu.contains(scrollTarget)) return;
    closeControl();
  }

  function handleDocumentKeydown(keyboardEvent: KeyboardEvent) {
    const control = openControl;
    if (!control) return;
    switch (keyboardEvent.key) {
      case "Escape":
        (keyboardEvent.preventDefault(),
          keyboardEvent.stopPropagation(),
          closeControl(true));
        return;
      case "Tab":
        closeControl();
        return;
      case "ArrowDown":
      case "ArrowUp":
        (keyboardEvent.preventDefault(),
          keyboardEvent.stopPropagation(),
          stepActiveIndex(control, keyboardEvent.key === "ArrowDown" ? 1 : -1));
        return;
      case "Home":
      case "End": {
        const visibleIndexes = visibleOptionIndexes(control);
        if (!visibleIndexes.length) return;
        (keyboardEvent.preventDefault(),
          keyboardEvent.stopPropagation(),
          setActiveIndex(
            control,
            keyboardEvent.key === "Home" ? visibleIndexes[0] : visibleIndexes[visibleIndexes.length - 1],
          ));
        return;
      }
      case "Enter":
      case " ":
        // 空格在筛选框里是正文，不能当「确认」用。
        if (keyboardEvent.key === " " && keyboardEvent.target === control.search) return;
        {
          const activeOption = control.options[control.activeIndex];
          if (!activeOption || activeOption.button.hidden || activeOption.button.disabled) return;
          (keyboardEvent.preventDefault(),
            keyboardEvent.stopPropagation(),
            pickOption(control, activeOption.value));
        }
        return;
      default:
    }
  }

  function decorate(select: HTMLSelectElement): SelectControl {
    const wrapper = ownerDocument.createElement("span");
    wrapper.className = "custom-select i3d-select";
    const button = ownerDocument.createElement("button");
    (button.type = "button"),
      (button.className = "custom-select-button"),
      button.setAttribute("aria-haspopup", "listbox"),
      button.setAttribute("aria-expanded", "false");
    const valueElement = ownerDocument.createElement("span");
    (valueElement.className = "custom-select-value"), button.append(valueElement);
    const menu = ownerDocument.createElement("div");
    (menu.className = "custom-select-menu"), menu.setAttribute("role", "listbox"), (menu.hidden = true);
    (select.classList.add("native-select-control"),
      (select.tabIndex = -1),
      select.setAttribute("aria-hidden", "true"),
      select.before(wrapper),
      wrapper.append(select, button, menu));
    const control: SelectControl = {
      select,
      wrapper,
      button,
      valueElement,
      menu,
      search: null,
      options: [],
      signature: "",
      activeIndex: -1,
      isOpen: false,
    };
    controls.set(select, control);
    select.addEventListener("change", () => {
      (syncControl(control), control.isOpen && closeControl());
    });
    button.addEventListener("click", (clickEvent) => {
      (clickEvent.preventDefault(), control.isOpen ? closeControl() : openControlMenu(control));
    });
    button.addEventListener("keydown", (keyboardEvent) => {
      ["ArrowDown", "ArrowUp", "Enter", " "].includes(keyboardEvent.key) &&
        (control.isOpen || (keyboardEvent.preventDefault(), openControlMenu(control)));
    });
    // 点行标题时别让 <label> 把点击转给（已隐藏的）原生 select —— 那会弹出系统菜单。
    const settingRowElement = wrapper.closest("label");
    settingRowElement?.addEventListener("click", (labelClickEvent) => {
      const labelTarget = labelClickEvent.target;
      if (labelTarget instanceof Element && labelTarget.closest(".custom-select")) return;
      labelClickEvent.preventDefault();
    });
    menu.addEventListener("pointerdown", (pointerEvent) => {
      const pointerTarget = pointerEvent.target;
      pointerTarget instanceof Element &&
        pointerTarget.closest(".custom-select-option") &&
        pointerEvent.preventDefault();
    });
    menu.addEventListener("click", (clickEvent) => {
      const clickedOption = clickEvent.target;
      if (!(clickedOption instanceof Element)) return;
      const optionButton = clickedOption.closest(".custom-select-option");
      if (!(optionButton instanceof HTMLButtonElement)) return;
      (clickEvent.preventDefault(), pickOption(control, optionButton.dataset.value ?? ""));
    });
    return control;
  }

  function refresh() {
    if (disposed || isRefreshing) return;
    isRefreshing = true;
    try {
      for (const selectElement of root.querySelectorAll("select")) {
        const existingControl = controls.get(selectElement);
        // 已经被别的装饰器（仪表盘编辑器的 `.custom-select` 套壳）接管，或调用方显式要求
        // 保留原生外观（`data-native-select="true"`）：都不要重复套壳。
        if (!existingControl && !shouldDecorate(selectElement)) continue;
        syncControl(existingControl ?? decorate(selectElement));
      }
      openControl && !openControl.select.isConnected && closeControl();
    } finally {
      isRefreshing = false;
    }
  }

  function queueRefresh() {
    if (queuedRefresh || disposed) return;
    queuedRefresh = true;
    queueMicrotask(() => {
      (queuedRefresh = false), refresh();
    });
  }

  /** 新增节点里是否含 select（面板整体重绘、弹窗打开都会走到）。 */
  function addedSelect(node: Node): boolean {
    return (
      node instanceof Element && (node.tagName === "SELECT" || node.querySelector("select") !== null)
    );
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.target instanceof HTMLSelectElement) {
        queueRefresh();
        return;
      }
      if (mutation.type !== "childList") continue;
      const mutationTarget = mutation.target;
      // 自己套壳时把 select 挪进 wrapper 也会记一条 childList：别为此再刷一遍。
      if (mutationTarget instanceof Element && mutationTarget.closest(".custom-select")) continue;
      for (const addedNode of mutation.addedNodes)
        if (addedSelect(addedNode)) {
          queueRefresh();
          return;
        }
    }
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled", "hidden", "title", "multiple", "size"],
  });
  // 挂载时先把**已存在**的 select 装饰一遍：安防配置这类入口是先建好整个面板（含 select）
  // 再挂运行时，如果只等 MutationObserver，那些 select 永远等不到「新增节点」事件。
  refresh();

  return {
    refresh,
    dispose: () => {
      if (disposed) return;
      (disposed = true), observer.disconnect(), closeControl();
    },
  };
}

/**
 * 3D 编辑类弹窗的判定：主配置弹窗外壳 `.i3d-editor`，以及直接挂在 `document.body` 上的
 * 子弹窗（`.i3d-add-dialog` / `.i3d-speaker-media-dialog` / `.i3d-device-change-dialog` 等）。
 */
const INTERACTION3D_DIALOG_SELECTOR = ".i3d-editor, dialog[class*='i3d-']";

let sharedHandle: SelectControlsHandle | null = null;

/**
 * 全应用共享一份的自绘下拉装饰器（幂等）。
 *
 * 各编辑入口（配置 / 安防 / 存在感应 / 音箱…）都会 `mountInteraction3d`，但只有配置面板这条
 * 路会挂装饰器，于是安防配置等页面至今还是系统原生菜单。这里把观察根提到 `document.body`，
 * 用 `accepts` 把范围收在 3D 自己的弹窗里，任何编辑入口调用一次即可覆盖它后面插入的所有 select
 * （包括运行期才挂到 body 上的子弹窗）。
 *
 * 只用一次、不随单个弹窗关闭而 `dispose`：装饰器对所有 3D 弹窗都有效，谁来关都只是关掉自己那一份。
 */
export function ensureInteraction3dSelectControls(): SelectControlsHandle {
  sharedHandle ??= attachSelectControls(document.body, {
    accepts: (selectElement) => Boolean(selectElement.closest(INTERACTION3D_DIALOG_SELECTOR)),
  });
  return sharedHandle;
}
