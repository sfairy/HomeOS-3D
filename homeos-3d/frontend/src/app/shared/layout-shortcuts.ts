/**
 * 布局快捷键：折叠 / 展开侧栏。
 */

type AnyObj = Record<string, any>;

/** 捕获阶段监听，保证在页面自己的 keydown（编辑器挂 document、工作室挂 window）之前跑。 */
const SHORTCUT_LISTENER_OPTIONS = { capture: true };

/** macOS 用 ⌘（meta），其余平台用 Ctrl。判定一次即可，平台不会在会话中途改变。 */
const IS_MAC_PLATFORM =
  typeof navigator !== "undefined" && /mac|iphone|ipad|ipod/i.test(navigator.platform || "");

const TEXT_ENTRY_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

function isTextEntryTarget(event: any) {
  const targetElement = event.target;
  return targetElement instanceof Element && Boolean(targetElement.closest(TEXT_ENTRY_SELECTOR));
}

/** 有弹窗打开时不抢键：弹窗里的操作永远优先于布局快捷键。 */
function hasOpenDialog(ownerDocument: any) {
  return Boolean(ownerDocument.querySelector("dialog[open]"));
}

/**
 * 解析 `"Mod+Shift+B"` 这类组合串。返回 null 表示写错了 —— 调用方应当直接忽略而不是
 */
function parseCombo(combo: any) {
  if (typeof combo !== "string" || !combo.trim()) {
    return null;
  }
  const tokens = combo
    .toLowerCase()
    .split("+")
    .map((token: any) => token.trim())
    .filter(Boolean);
  if (!tokens.length) {
    return null;
  }
  const modifierTokens = tokens.slice(0, -1);
  const knownModifiers = new Set(["mod", "shift", "alt"]);
  if (modifierTokens.some((token: any) => !knownModifiers.has(token))) {
    return null;
  }
  return {
    key: tokens[tokens.length - 1],
    mod: modifierTokens.includes("mod"),
    shift: modifierTokens.includes("shift"),
    alt: modifierTokens.includes("alt")
  };
}

function matchesCombo(event: any, combo: any) {
  const hasMod = IS_MAC_PLATFORM ? event.metaKey : event.ctrlKey;
  const hasOtherMod = IS_MAC_PLATFORM ? event.ctrlKey : event.metaKey;
  return (
    event.key.toLowerCase() === combo.key &&
    hasMod === combo.mod &&
    hasOtherMod === false &&
    event.shiftKey === combo.shift &&
    event.altKey === combo.alt
  );
}

/**
 * 绑定布局快捷键。
 * @param {object} options
 * @param {Array<{id: string, combo: string, run: Function}>} options.bindings
 * @param {Document} [options.ownerDocument]
 */
export function bindLayoutShortcuts({ bindings, ownerDocument = document }: AnyObj) {
  const resolvedBindings: any[] = [];
  for (const binding of bindings) {
    const parsedCombo = parseCombo(binding.combo);
    if (!parsedCombo || typeof binding.run !== "function") {
      // 写错的组合串 / 没有动作的绑定一律丢弃，不注册成「谁都命不中」的空条目。
      continue;
    }
    resolvedBindings.push({ ...binding, parsedCombo });
  }

  const handleKeyDown = (keyDownEvent: any) => {
    if (keyDownEvent.defaultPrevented || keyDownEvent.isComposing) {
      return;
    }
    if (isTextEntryTarget(keyDownEvent) || hasOpenDialog(ownerDocument)) {
      return;
    }
    for (const binding of resolvedBindings) {
      if (!matchesCombo(keyDownEvent, binding.parsedCombo)) {
        continue;
      }
      keyDownEvent.preventDefault();
      binding.run();
      return;
    }
  };

  ownerDocument.addEventListener("keydown", handleKeyDown, SHORTCUT_LISTENER_OPTIONS);

  return {
    destroy() {
      ownerDocument.removeEventListener("keydown", handleKeyDown, SHORTCUT_LISTENER_OPTIONS);
    }
  };
}
