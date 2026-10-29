/**
 * 弹窗里 `<select>` 的富下拉（支持主题化、键盘导航、视口内翻转）。
 *
 * 原生 `<select>` 在 3D 弹窗里有两个问题：一是下拉列表由浏览器绘制，样式跟
 * 主题完全脱节；二是面板缩放到 0.6 倍时点击热区跟着缩，选项很难点中。这里把
 * `<select>` 换成 `button[role=combobox] + [role=listbox]`，同时保留原
 * `<select>` 作为数据源（`change` 事件照旧派发），调用方无需改代码。
 *
 * 定位/缩放/可见性守卫统一交给 `editor-floating-layout`（0.8.1 同款）。
 */
import {
  createFloatingLayout,
  type FloatingLayout,
} from "./editor-floating-layout";

/** 同一个页面里多个 picker 的 id 计数器（`aria-controls` 需要唯一 id）。 */
let pickerSeed = 0;

/** 下拉菜单最小/最大宽度（像素）：太窄点不中，太宽会盖住整个弹窗。 */
const MIN_MENU_WIDTH = 70;
const MAX_MENU_WIDTH = 320;
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
  layout?: FloatingLayout;
};

/**
 * 创建一组互斥的开合 picker。
 *
 * 一次只允许一个菜单展开：`open` 会先关掉上一个，注册在 document 上的
 * 三个全局监听也只会挂一份。
 */
export function createPopupPickers(hostElement: any, createElement: any) {
  const ownerDocument = hostElement.ownerDocument || globalThis.document;
  let active: PickerOptions | null = null;
  let typeAheadText = "";
  let typeAheadAt = 0;

  function close(refocus = false) {
    if (!active) return;
    const current = active;
    active = null;
    current.layout?.stop();
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

  /**
   * 定位交给 `editor-floating-layout`：容器内 clamp、上下翻转、缩放补偿与
   * `[hidden]` / `[inert]` / `dialog:not([open])` / `visibilitychange` 守卫都在那里。
   * 返回 `false` 时浮层已经关闭（`onDismiss`）。
   */
  function position() {
    if (!active) return;
    if (!active.layout?.position()) close();
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
    picker.menu.dataset.theme =
      hostElement.closest?.("[data-scene-style]")?.dataset.sceneStyle || "";
    picker.element.setAttribute("aria-expanded", "true");
    try {
      picker.menu.showPopover?.();
    } catch {
      /* 没有 Popover API 时 hidden 已经足够 */
    }
    picker.layout?.start();
    if (position(), !active) return;
    ownerDocument.addEventListener?.("pointerdown", onPointerDown, true);
    ownerDocument.addEventListener?.("scroll", onScroll, true);
    ownerDocument.addEventListener?.("keydown", onKeyDown, true);
    const selectedIndex = picker.values.indexOf(picker.element.value);
    focusChoice(
      picker,
      selectedIndex < 0 ? (fromEnd ? picker.choices.length - 1 : 0) : selectedIndex,
    );
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
    options.layout = createFloatingLayout({
      anchor: element,
      panel: menu,
      document: ownerDocument,
      container: () => hostElement.closest?.(".interaction3d-stage") || hostElement.closest?.("dialog"),
      minWidth: MIN_MENU_WIDTH,
      maxWidth: MAX_MENU_WIDTH,
      maxHeight: MAX_MENU_HEIGHT,
      minWidthFromAnchor: true,
      measureContentWidth: true,
      gap: 4,
      margin: 8,
      scaleToAnchor: true,
      inheritFont: true,
      onDismiss: () => {
        if (active === options) close();
      },
    });
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
