/**
 * 布局快捷键：折叠 / 展开侧栏。
 *
 * 两页共用。这里只负责「键位 → 动作」的注册与**冲突规避**，动作本身由调用方给。
 * 只服务折叠与调宽：曾经的预设（⌘⇧1..3）与沉浸模式（⌘⇧F）随那一层 chrome 一起删掉了，
 * 详见 layout-shell.js 文件头。
 *
 * 键位选择经过逐条核对，两页现有绑定都没有占用（这是本次选 ⌘⇧ 系而不是单键的原因）：
 *   - 编辑器（home.js:21951 与 11833）：⌘D 复制、Delete/Backspace 删除、方向键微调、Enter 失焦、Esc。
 *   - 工作室（studio-app.js:22395）：⌘Z/⌘D/⌘C/⌘V、Delete/Backspace、方向键微调物件、
 *     Space 平移、S 临时关吸附、Shift 吸附覆盖、Esc 收尾。
 *   - 方向键在两页都属于「微调选中对象」，所以分隔条的键盘调宽**只在分隔条自己获焦时**生效
 *     （由 layout-shell.js 在元素上监听），不挂 window。
 *
 * 两条拦截纪律：
 *   1. 焦点在文本输入类元素里时不拦 —— 布局快捷键没有任何一条值得冒「把字符吃掉」的风险。
 *   2. 有弹窗打开时不拦 —— 弹窗里的操作必须优先。注意这里**不**把 `button` 算进第一条：
 *      折叠把手条本身就是 button，鼠标点完一次再按 ⌘B 仍应生效（否则「点一下、再用键盘收另一栏」
 *      这种最自然的用法会在第一次点击之后失灵）。
 */

/** 捕获阶段监听，保证在页面自己的 keydown（编辑器挂 document、工作室挂 window）之前跑。 */
const SHORTCUT_LISTENER_OPTIONS = { capture: true };

/** macOS 用 ⌘（meta），其余平台用 Ctrl。判定一次即可，平台不会在会话中途改变。 */
const IS_MAC_PLATFORM =
  typeof navigator !== "undefined" && /mac|iphone|ipad|ipod/i.test(navigator.platform || "");

/** 拦截前的「焦点在文本输入里」判定。刻意不含 button，见文件头第 2 条。 */
const TEXT_ENTRY_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

function isTextEntryTarget(event) {
  const targetElement = event.target;
  return targetElement instanceof Element && Boolean(targetElement.closest(TEXT_ENTRY_SELECTOR));
}

/** 有弹窗打开时不抢键：弹窗里的操作永远优先于布局快捷键。 */
function hasOpenDialog(ownerDocument) {
  return Boolean(ownerDocument.querySelector("dialog[open]"));
}

/**
 * 解析 `"Mod+Shift+B"` 这类组合串。返回 null 表示写错了 —— 调用方应当直接忽略而不是
 * 「匹配一切」，一个拼错的组合串静默变成全局热键是最难查的那类问题。
 */
function parseCombo(combo) {
  if (typeof combo !== "string" || !combo.trim()) {
    return null;
  }
  const tokens = combo
    .toLowerCase()
    .split("+")
    .map(token => token.trim())
    .filter(Boolean);
  if (!tokens.length) {
    return null;
  }
  const modifierTokens = tokens.slice(0, -1);
  const knownModifiers = new Set(["mod", "shift", "alt"]);
  if (modifierTokens.some(token => !knownModifiers.has(token))) {
    return null;
  }
  return {
    key: tokens[tokens.length - 1],
    mod: modifierTokens.includes("mod"),
    shift: modifierTokens.includes("shift"),
    alt: modifierTokens.includes("alt")
  };
}

function matchesCombo(event, combo) {
  // mod 的含义随平台变；另一个修饰键必须**没有**按下，否则 ⌘⇧B 会同时命中 Ctrl+⇧B 之类的组合。
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
 *
 * 描述里的 `id` 目前只用于调试与后续可能的提示位回填（`data-layout-shortcut` 的 HTML 提示位已随
 * 布局菜单一起删除，需要时再补回按平台生成 ⌘/Ctrl 文案的那段）。
 *
 * @param {object} options
 * @param {Array<{id: string, combo: string, run: Function}>} options.bindings
 * @param {Document} [options.ownerDocument]
 */
export function bindLayoutShortcuts({ bindings, ownerDocument = document }) {
  const resolvedBindings = [];
  for (const binding of bindings) {
    const parsedCombo = parseCombo(binding.combo);
    if (!parsedCombo || typeof binding.run !== "function") {
      // 写错的组合串 / 没有动作的绑定一律丢弃，不注册成「谁都命不中」的空条目。
      continue;
    }
    resolvedBindings.push({ ...binding, parsedCombo });
  }

  const handleKeyDown = keyDownEvent => {
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
      // preventDefault 是必须的：⌘B 在 Mac 与 Ctrl+B 在 Windows/Linux 都是浏览器/系统的
      // 「加粗」组合，不拦住会在焦点恰好落在可编辑区域边缘时连带触发。
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
