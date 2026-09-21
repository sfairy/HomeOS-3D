/**
 * 商店后台的「站点配色」面板（系统配置 → 站点配色）。
 *
 * 与主应用 `frontend/static/editor/appearance.js` 是同一件事的两个副本：两个服务
 * 各自独立构建、独立部署，没有可共享的 JS 包。颜色本身的逻辑**不在这里**——
 * 预设、明暗派生与令牌展开全在 `./scene/appearance.js`（design/scene 的分发产物），
 * 那是唯一一份实现，两个前端 import 的是同一个文件。
 *
 * 这里只做三件事：
 *   1. 即时预览：`documentElement.style.setProperty()` 逐枚写 CSS 变量。
 *      商店的 CSP 对 `style-src` 放宽到 `'unsafe-inline'`，但 CSSOM 赋值本来也不受
 *      那条限制 —— 拖动色轮能立刻看到整页变色，不必每次往返服务端。
 *   2. 保存：把展开好的令牌表 PUT 给 `/store-admin/v1/appearance`，后端据此生成
 *      `/store-appearance.css`；刷新后由那个 `<link>` 给出同一套颜色。
 *      预览与落地是同一个函数产出的同一张表，不会出现「拖的时候一个色、保存完另一个色」。
 *   3. 回读：打开面板时从服务端取回当前值，让界面与真实生效的颜色一致。
 *
 * 为什么是模块而不是继续往 admin.html 的内联脚本里堆：内联脚本是经典脚本，
 * 没法 `import`，而配色展开逻辑必须复用那一份（抄一遍就是第三份会走散的真值）。
 */

import {
  CONFIGURABLE,
  DEFAULT_PRESET,
  PRESETS,
  normalizeHex,
  resolveTokens,
} from "./scene/appearance.js?v=2609211953";

const dialogPane = document.querySelector('[data-tab-pane="palette"]');
const presetList = document.getElementById("palette-preset-list");
const accentInput = document.getElementById("palette-accent");
const accentHexInput = document.getElementById("palette-accent-hex");
const resetButton = document.getElementById("palette-reset");
const saveButton = document.getElementById("palette-save");
const messageBox = document.getElementById("palette-message");
const swatches = new Map(
  [...document.querySelectorAll(".admin-palette-preview [data-swatch]")].map((node) => [
    node.dataset.swatch,
    node,
  ])
);

/** 面板当前的工作副本；打开面板时从服务端读回。 */
let draft = { preset: DEFAULT_PRESET, accent: "" };
/** 服务端上的值，用于「有没有改动」与「取消了要回到哪儿」。 */
let saved = { preset: DEFAULT_PRESET, accent: "" };
/** 预览期间写在 root 上的令牌名，取消 / 关闭时要逐枚摘掉。 */
const previewKeys = new Set();

function setMessage(text, kind = "") {
  if (!messageBox) return;
  messageBox.hidden = !text;
  messageBox.textContent = text || "";
  messageBox.classList.toggle("is-ok", kind === "ok");
  messageBox.classList.toggle("is-err", kind === "err");
}

/** 草稿对应的令牌表。预设与自定义色的取舍全在 resolveTokens() 里。 */
function draftTokens() {
  return resolveTokens({ presetId: draft.preset, accentColor: draft.accent || undefined });
}

/**
 * 把一张令牌表写到 root 上做预览。
 *
 * 只写**字面量**令牌（base / -bright / -deep / -rgb / -soft / -line / -text）：
 * 渐变那些是 `var()` 引用，改字面量它们自己会跟上。多写一份引用值等于把
 * 「谁才是真的生效值」变模糊，而下一个改这里的人一定会去改错那一份。
 */
function applyPreview(tokens) {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(tokens)) {
    root.style.setProperty(name, value);
    previewKeys.add(name);
  }
}

/** 摘掉预览留下的所有内联覆盖：回到「由样式表决定颜色」的状态。 */
function clearPreview() {
  for (const name of previewKeys) document.documentElement.style.removeProperty(name);
  previewKeys.clear();
}

/** 画预览条：四束光的基色。 */
function paintSwatches(tokens) {
  for (const name of CONFIGURABLE) {
    const node = swatches.get(name);
    if (node) node.style.setProperty("--sw", tokens[`--hos-${name}`] || "transparent");
  }
}

/** 重画预设卡片与自定义色输入的选中态。 */
function paintControls() {
  for (const button of presetList?.querySelectorAll(".admin-palette-preset") || []) {
    button.setAttribute("aria-checked", String(button.dataset.preset === draft.preset));
  }
  const tokens = draftTokens();
  const accent = tokens["--hos-accent"] || "";
  if (accentInput) accentInput.value = accent;
  if (accentHexInput && document.activeElement !== accentHexInput) accentHexInput.value = accent;
  // 自定义色输入只在「主控色被手动改过」时描边：恢复预设时用户看得见自己那枚
  // 自定义色已经不再生效，而不是以为它还在。
  const preset = PRESETS.find((item) => item.id === draft.preset);
  const isCustom =
    Boolean(draft.accent) && normalizeHex(draft.accent) !== normalizeHex(preset?.colors.accent);
  accentInput?.closest(".admin-palette-custom")?.classList.toggle("is-custom", isCustom);
}

/** 重画整块面板：控件状态 + 预览条 + 即时应用。 */
function repaint() {
  const tokens = draftTokens();
  paintControls();
  paintSwatches(tokens);
  applyPreview(tokens);
}

/** 建预设卡片。内容不会变，所以只建一次。 */
function buildPresetCards() {
  if (!presetList || presetList.childElementCount) return;
  presetList.innerHTML = PRESETS.map(
    (preset) => `
      <button class="admin-palette-preset" type="button" role="radio" aria-checked="false" data-preset="${preset.id}">
        <span class="admin-palette-dots" aria-hidden="true">
          ${CONFIGURABLE.map((name) => `<i style="--dot:${preset.colors[name]}"></i>`).join("")}
        </span>
        <strong>${preset.label}</strong>
        <small>${preset.hint}</small>
      </button>`
  ).join("");
  presetList.addEventListener("click", (event) => {
    const button = event.target.closest(".admin-palette-preset");
    if (!button) return;
    draft.preset = button.dataset.preset;
    // 换预设 = 放弃自定义色：保留着它会让「点了暖居琥珀，主控色却还是上次拖的紫」
    // 变成一个没有出口的状态。
    draft.accent = "";
    setMessage("");
    repaint();
  });
}

/** 读回已保存的配色。失败（未登录 / 网络）时退回默认值，不让面板整个不可用。 */
async function loadSaved() {
  try {
    const response = await fetch("/store-admin/v1/appearance", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("read failed");
    const payload = await response.json();
    const preset =
      typeof payload?.preset === "string" && payload.preset ? payload.preset : DEFAULT_PRESET;
    saved = { preset, accent: "" };
    // 服务端的 tokens 里主控色与预设不一致，说明当初存的就是自定义色。
    const stored = normalizeHex(payload?.tokens?.["--hos-accent"]);
    const presetAccent = normalizeHex(PRESETS.find((item) => item.id === preset)?.colors.accent);
    if (stored && stored !== presetAccent) saved.accent = stored;
  } catch {
    saved = { preset: DEFAULT_PRESET, accent: "" };
  }
  draft = { ...saved };
}

async function save() {
  if (!saveButton) return;
  saveButton.disabled = true;
  setMessage("正在保存…");
  try {
    const response = await fetch("/store-admin/v1/appearance", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset: draft.preset, tokens: draftTokens() }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        window.ApiError
          ? window.ApiError.describe(payload?.detail, "保存失败，请稍后重试。")
          : "保存失败，请稍后重试。"
      );
    }
    saved = { ...draft };
    // 保存后重新灌一次预览：服务端可能归一化了某个值，让界面立刻对齐真实生效的颜色。
    clearPreview();
    const tokens = payload?.tokens && Object.keys(payload.tokens).length ? payload.tokens : draftTokens();
    applyPreview(tokens);
    paintControls();
    setMessage("配色已保存，刷新后依然是这套颜色。", "ok");
  } catch (error) {
    setMessage(error?.message || "保存失败，请稍后重试。", "err");
  } finally {
    saveButton.disabled = false;
  }
}

if (dialogPane) {
  buildPresetCards();
  // 首次进入分页才读服务端：配色面板不是默认打开的分页，开局就多发一个请求不值。
  let loaded = false;
  const ensureLoaded = () => {
    if (loaded) return;
    loaded = true;
    loadSaved().then(repaint);
  };
  // 分页切换靠 hidden 属性（见 admin.html 里的 tabs 逻辑），所以用 MutationObserver
  // 盯它 —— 比在后台脚本里加一个「切到配色分页了」的自定义事件更少耦合：
  // 那个事件一旦被改名或漏派发，面板会安静地显示默认色而不是当前配色。
  new MutationObserver(() => {
    if (!dialogPane.hidden) {
      setMessage("");
      ensureLoaded();
    }
  }).observe(dialogPane, { attributes: true, attributeFilter: ["hidden", "class"] });
  if (!dialogPane.hidden) ensureLoaded();

  accentInput?.addEventListener("input", () => {
    draft.accent = accentInput.value;
    setMessage("");
    repaint();
  });
  accentHexInput?.addEventListener("input", () => {
    // 只在写全了才应用：输到一半的 "#ffc" 也是合法三位色，中途应用会让用户
    // 看到一串自己没打算选的跳变。
    const value = normalizeHex(accentHexInput.value);
    accentHexInput.classList.toggle("is-invalid", Boolean(accentHexInput.value) && !value);
  });
  accentHexInput?.addEventListener("change", () => {
    const value = normalizeHex(accentHexInput.value);
    accentHexInput.classList.remove("is-invalid");
    if (!value) {
      accentHexInput.value = draftTokens()["--hos-accent"] || "";
      return;
    }
    draft.accent = value;
    setMessage("");
    repaint();
  });

  resetButton?.addEventListener("click", () => {
    draft = { preset: DEFAULT_PRESET, accent: "" };
    setMessage("");
    repaint();
  });
  saveButton?.addEventListener("click", () => {
    save();
  });
}
