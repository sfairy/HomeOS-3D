/**
 * 弹窗里 `<select>` 的富下拉（支持主题化、键盘导航、视口内翻转）。
 *
 * 原生 `<select>` 在 3D 弹窗里有两个问题：一是下拉列表由浏览器绘制，样式跟
 * 主题完全脱节；二是面板缩放到 0.6 倍时点击热区跟着缩，选项很难点中。这里把
 * `<select>` 换成 `button[role=combobox] + [role=listbox]`，同时保留原
 * `<select>` 作为数据源（`change` 事件照旧派发），调用方无需改代码。
 */

/** 同一个页面里多个 picker 的 id 计数器（`aria-controls` 需要唯一 id）。 */
let pickerSeed = 0;

/** 下拉菜单最小/最大宽度（像素）：太窄点不中，太宽会盖住整个弹窗。 */
const MIN_MENU_WIDTH = 70;
const MAX_MENU_WIDTH = 320;
/** 估算的菜单项高度（没有布局时的兜底）。 */
const FALLBACK_OPTION_HEIGHT = 40;
/** 菜单最大高度（像素）。 */
const MAX_MENU_HEIGHT = 280;
/** 双键快速输入（type-ahead）的合并窗口（毫秒）。 */
const TYPE_AHEAD_WINDOW = 700;

type PickerOptions = {
  picker: HTMLElement;
  element: HTMLButtonElement;
  menu: HTMLElement;
  values: string[];
  labels: Record<string, string>;
  choices: HTMLButtonElement[];
  signature?: string;
  wasHidden?: boolean;
};

/**
 * 创建一组互斥的开合 picker。
 *
 * 一次只允许一个菜单展开：`open` 会先关掉上一个，注册在 document 上的
 * 三个全局监听也只会挂一份。
 */
export function createPopupPickers(hostElement: any, createElement: any) {
  const ownerDocument = hostElement.ownerDocument || globalThis.document;
  const view = ownerDocument.defaultView;
  let active: PickerOptions | null = null;
  let frameId: any = null;
  let typeAheadText = "";
  let typeAheadAt = 0;

  function close(refocus = false) {
    if (!active) return;
    const current = active;
    active = null;
    if (frameId != null) view?.cancelAnimationFrame?.(frameId);
    frameId = null;
    try {
      current.menu.hidePopover?.();
    } catch {
      /* 老浏览器没有 Popover API：下面用 hidden 兜底 */
    }
    current.menu.hidden = true;
    current.picker.append(current.menu);
    current.element.setAttribute("aria-expanded", "false");
    ownerDocument.removeEventListener?.("pointerdown", onPointerDown, true);
    ownerDocument.removeEventListener?.("scroll", onScroll, true);
    ownerDocument.removeEventListener?.("keydown", onKeyDown, true);
    if (refocus && !current.element.disabled) current.element.focus?.({ preventScroll: true });
  }

  function onPointerDown(event: Event) {
    if (!active) return;
    const target = event.target as Node;
    if (!active.picker.contains?.(target) && !active.menu.contains?.(target)) close();
  }

  function onScroll(event: Event) {
    if (active && !active.menu.contains?.(event.target as Node)) close();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  }

  /** 每帧跟随锚点定位：弹窗可能正在缩放 / 拖拽，静态定位会错位。 */
  function position() {
    if (!active) return;
    const { element, menu } = active;
    const rect = element.getBoundingClientRect();
    if (
      element.disabled ||
      ownerDocument.hidden ||
      element.isConnected === false ||
      (element.getClientRects && !element.getClientRects().length)
    ) {
      close();
      return;
    }
    const styles = view?.getComputedStyle?.(element);
    if (
      styles?.visibility === "hidden" ||
      hostElement.closest?.('[hidden], [aria-hidden="true"], [inert]')
    ) {
      close();
      return;
    }
    // 弹窗用 transform 缩放，菜单挂在 body 上以后要手动乘回缩放比。
    const layoutWidth = element.offsetWidth || rect.width || 1;
    const layoutHeight = element.offsetHeight || rect.height || 1;
    const scaleX = rect.width / layoutWidth || 1;
    const scaleY = rect.height / layoutHeight || 1;
    const stageRect = hostElement.closest?.(".interaction3d-stage")?.getBoundingClientRect();
    const viewport = view?.visualViewport;
    const boundsLeft = Math.max(viewport?.offsetLeft || 0, stageRect?.left || 0) + 8;
    const boundsTop = Math.max(viewport?.offsetTop || 0, stageRect?.top || 0) + 8;
    const boundsRight =
      Math.min(
        (viewport?.offsetLeft || 0) + (viewport?.width || view?.innerWidth || 1024),
        stageRect?.right ?? Infinity,
      ) - 8;
    const boundsBottom =
      Math.min(
        (viewport?.offsetTop || 0) + (viewport?.height || view?.innerHeight || 768),
        stageRect?.bottom ?? Infinity,
      ) - 8;
    if (
      boundsRight <= boundsLeft ||
      boundsBottom <= boundsTop ||
      rect.bottom < boundsTop ||
      rect.top > boundsBottom
    ) {
      close();
      return;
    }
    menu.dataset.theme =
      hostElement.closest?.("[data-scene-style]")?.dataset.sceneStyle || "";
    const availableWidth = Math.min(
      Math.max(layoutWidth, MAX_MENU_WIDTH),
      (boundsRight - boundsLeft) / scaleX,
    );
    Object.assign(menu.style, {
      width: "max-content",
      minWidth: `${Math.min(Math.max(layoutWidth, MIN_MENU_WIDTH), availableWidth)}px`,
      maxWidth: `${availableWidth}px`,
    });
    const menuWidth = Math.min(
      menu.offsetWidth || Math.max(layoutWidth, MIN_MENU_WIDTH),
      availableWidth,
    );
    Object.assign(menu.style, {
      width: `${menuWidth}px`,
      transform: `scale(${scaleX},${scaleY})`,
      transformOrigin: "0 0",
    });
    const desiredHeight =
      Math.min(
        MAX_MENU_HEIGHT,
        (menu.scrollHeight || active.choices.length * FALLBACK_OPTION_HEIGHT + 12) + 2,
      ) * scaleY;
    const spaceBelow = Math.max(
      0,
      boundsBottom - (rect.bottom ?? rect.top + rect.height) - 4 * scaleY,
    );
    const spaceAbove = Math.max(0, rect.top - boundsTop - 4 * scaleY);
    const flip = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
    const space = Math.min(boundsBottom - boundsTop, flip ? spaceAbove : spaceBelow);
    const menuHeight = Math.min(desiredHeight, space);
    Object.assign(menu.style, {
      maxHeight: `${Math.min(MAX_MENU_HEIGHT, space / scaleY)}px`,
      left: `${Math.max(boundsLeft, Math.min(rect.left, boundsRight - menuWidth * scaleX))}px`,
      top: `${Math.max(
        boundsTop,
        Math.min(
          flip ? rect.top - 4 * scaleY - menuHeight : (rect.bottom ?? rect.top + rect.height) + 4 * scaleY,
          boundsBottom - menuHeight,
        ),
      )}px`,
    });
    if (styles?.font) menu.style.font = styles.font;
    menu.style.setProperty(
      "--i3d-climate-accent",
      styles?.getPropertyValue("--i3d-climate-accent") || "#73c8ff",
    );
  }

  function followAnchor() {
    frameId = null;
    position();
    if (active) frameId = view?.requestAnimationFrame?.(followAnchor) ?? null;
  }

  /** 把 roving tabindex 移到第 `index` 项，并把它滚进可视区。 */
  function focusChoice(picker: PickerOptions, index: number) {
    if (picker.choices[index]?.disabled) {
      index = picker.choices.findIndex((choice) => !choice.disabled);
    }
    picker.choices.forEach((choice, choiceIndex) => {
      choice.tabIndex = choiceIndex === index ? 0 : -1;
    });
    const choice = picker.choices[index];
    choice?.focus?.({ preventScroll: true });
    if (choice && picker.menu.clientHeight) {
      const top = choice.offsetTop;
      const bottom = top + choice.offsetHeight;
      if (top < picker.menu.scrollTop) picker.menu.scrollTop = top;
      else if (bottom > picker.menu.scrollTop + picker.menu.clientHeight) {
        picker.menu.scrollTop = bottom - picker.menu.clientHeight;
      }
    }
  }

  function open(picker: PickerOptions, fromEnd = false) {
    if (picker.element.disabled) return;
    if (active === picker) {
      close(true);
      return;
    }
    close();
    active = picker;
    typeAheadText = "";
    typeAheadAt = 0;
    (ownerDocument.body || picker.picker).append(picker.menu);
    picker.menu.hidden = false;
    picker.element.setAttribute("aria-expanded", "true");
    try {
      picker.menu.showPopover?.();
    } catch {
      /* 没有 Popover API 时 hidden 已经足够 */
    }
    if (position(), !active) return;
    ownerDocument.addEventListener?.("pointerdown", onPointerDown, true);
    ownerDocument.addEventListener?.("scroll", onScroll, true);
    ownerDocument.addEventListener?.("keydown", onKeyDown, true);
    const selectedIndex = picker.values.indexOf(picker.element.value);
    focusChoice(
      picker,
      selectedIndex < 0 ? (fromEnd ? picker.choices.length - 1 : 0) : selectedIndex,
    );
    followAnchor();
  }

  function create(
    ariaLabel: string,
    values: string[],
    labels: Record<string, string>,
    onSelect: (value: string) => void,
  ) {
    const picker = createElement("div", "i3d-climate-picker");
    const element = createElement("button", "i3d-climate-choice i3d-climate-picker-value");
    element.type = "button";
    element.setAttribute("role", "combobox");
    element.setAttribute("aria-label", ariaLabel);
    element.setAttribute("aria-haspopup", "listbox");
    element.setAttribute("aria-expanded", "false");
    const menu = createElement("div", "i3d-extra-select-menu i3d-climate-picker-menu");
    menu.id = `i3d-climate-options-${++pickerSeed}`;
    menu.hidden = true;
    menu.setAttribute("popover", "manual");
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", `${ariaLabel} 选项`);
    element.setAttribute("aria-controls", menu.id);
    const options: PickerOptions = {
      picker,
      element,
      menu,
      values,
      labels,
      choices: [],
    };
    for (const value of values) {
      const choice = createElement("button", "", labels[value] || value);
      choice.type = "button";
      choice.value = value;
      choice.tabIndex = -1;
      choice.setAttribute("role", "option");
      choice.setAttribute("aria-selected", "false");
      choice.addEventListener("click", () => {
        if (position(), active !== options || element.disabled) return;
        close(true);
        onSelect(value);
      });
      options.choices.push(choice);
      menu.append(choice);
    }
    element.addEventListener("click", () => open(options));
    element.addEventListener("keydown", (event: KeyboardEvent) => {
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        open(options, event.key === "ArrowUp");
      }
    });
    menu.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        close(true);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      }
      const enabled = options.choices.filter((choice) => !choice.disabled);
      const current = enabled.indexOf(ownerDocument.activeElement as any);
      if (!enabled.length) return;
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? enabled.length - 1
              : (current + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length;
        focusChoice(options, options.choices.indexOf(enabled[next]));
        return;
      }
      // 单字符快速定位：700ms 内连续按键合并成前缀。
      if (
        event.key.length === 1 &&
        event.key !== " " &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.isComposing
      ) {
        event.preventDefault();
        const now = Date.now();
        typeAheadText =
          now - typeAheadAt > TYPE_AHEAD_WINDOW ? event.key : typeAheadText + event.key;
        typeAheadAt = now;
        const match = options.choices.findIndex(
          (choice) =>
            !choice.disabled &&
            choice.textContent.toLocaleLowerCase().startsWith(typeAheadText.toLocaleLowerCase()),
        );
        if (match >= 0) focusChoice(options, match);
      }
    });
    picker.append(element, menu);
    return options;
  }

  function sync(picker: PickerOptions, value: string, label: string, disabled: boolean) {
    picker.element.disabled = disabled;
    picker.element.value = value;
    picker.element.textContent = label || "请选择";
    picker.element.title = label || "";
    picker.choices.forEach((choice) => {
      choice.setAttribute("aria-selected", String(choice.value === value));
    });
    if (active === picker && disabled) close();
  }

  return { create, sync, close };
}

/**
 * 把弹窗里的原生 `<select>` 全部换成本地富下拉。
 *
 * 会持续观察 `change` 之后的同步：`sync()` 由调用方在状态刷新时调用，
 * 这里额外提供 MutationObserver 式的 `sync()` 遍历入口（`enhancePopupSelects` 返回的
 * `sync` 就是重扫一遍），保证面板重建后新出现的 `<select>` 也会被接管。
 */
export function enhancePopupSelects(hostElement: any) {
  const ownerDocument = hostElement.ownerDocument || globalThis.document;
  const enhancers = new Map<HTMLSelectElement, PickerOptions>();
  let disposed = false;
  const pickers = createPopupPickers(hostElement, (tagName: string, className = "", text = "") => {
    const node = ownerDocument.createElement(tagName);
    node.className = className;
    node.textContent = text;
    return node;
  });

  const isOptionDisabled = (option: HTMLOptionElement) =>
    !!(
      option.disabled ||
      (option.parentElement?.tagName === "OPTGROUP" &&
        (option.parentElement as HTMLOptGroupElement).disabled)
    );

  function restore(select: HTMLSelectElement, picker: PickerOptions) {
    pickers.close();
    picker.picker.replaceWith(select);
        select.hidden = picker.wasHidden ?? false;
    enhancers.delete(select);
  }

  function sync() {
    if (disposed) return;
    const selects = [...(hostElement.querySelectorAll?.("select") || [])] as HTMLSelectElement[];
    for (const [select, picker] of enhancers) {
      if (!selects.includes(select)) restore(select, picker);
    }
    for (const select of selects) {
      if (!select.replaceWith || !select.options) continue;
      const options = [...select.options];
      const signature = JSON.stringify(
        options.map((option) => [option.value, option.textContent, isOptionDisabled(option)]),
      );
      let picker = enhancers.get(select);
      if (picker && picker.signature !== signature) {
        restore(select, picker);
        picker = undefined;
      }
      if (!picker) {
        const labels = Object.fromEntries(options.map((option) => [option.value, option.textContent]));
        const ariaLabel = select.getAttribute("aria-label") || select.name || "选择选项";
        picker = pickers.create(
          ariaLabel,
          options.map((option) => option.value),
          labels as Record<string, string>,
          (value) => {
            if (
              disposed ||
              select.disabled ||
              !hostElement.contains(select) ||
              select.value === value
            ) {
              return;
            }
            const option = [...select.options].find((item) => item.value === value);
            if (!option || isOptionDisabled(option)) return;
            select.value = value;
            select.dispatchEvent(
              new (ownerDocument.defaultView?.Event || Event)("change", { bubbles: true }),
            );
            sync();
          },
        );
        picker.signature = signature;
        picker.wasHidden = select.hidden === true;
        picker.picker.classList.add("i3d-popup-select");
        select.replaceWith(picker.picker);
        picker.picker.append(select);
        select.hidden = true;
        enhancers.set(select, picker);
      }
      picker.choices.forEach((choice, index) => {
        choice.disabled = isOptionDisabled(options[index]);
      });
      pickers.sync(
        picker,
        select.value,
        options.find((option) => option.value === select.value)?.textContent || "请选择",
        select.disabled || !options.some((option) => !isOptionDisabled(option)),
      );
    }
  }

  return {
    sync,
    close: pickers.close,
    focused(select: HTMLSelectElement) {
      const picker = enhancers.get(select);
      return (
        ownerDocument.activeElement === select ||
        !!picker?.picker.contains(ownerDocument.activeElement) ||
        !!picker?.menu.contains(ownerDocument.activeElement)
      );
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [select, picker] of enhancers) restore(select, picker);
      pickers.close();
    },
  };
}
