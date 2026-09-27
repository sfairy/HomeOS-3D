/**
 * 商店后台的「站点配色」面板（系统配置 → 站点配色）。
 */

import { describe } from "./api-error.js?v=2609271226";
import {
  CONFIGURABLE,
  DEFAULT_PRESET,
  PRESETS,
  normalizeHex,
  resolveTokens,
} from "./scene/appearance.js?v=2609271226";

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

/** 自定义色输入框的初值：从**当前生效的 --hb-accent** 读。
 * 值本身由 `./scene/appearance.js` 的预设决定，这里不再存第二份默认色。 */
function liveAccent() {
  const applied = getComputedStyle(document.documentElement).getPropertyValue("--hb-accent").trim();
  const preset = PRESETS.find((item) => item.id === DEFAULT_PRESET)?.colors?.accent;
  return normalizeHex(applied) || normalizeHex(preset) || "";
}

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

function draftTokens() {
  return resolveTokens({ presetId: draft.preset, accentColor: draft.accent || undefined });
}

/**
 * 把一张令牌表写到 root 上做预览。
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
  const accent = tokens["--hb-accent"] || "";
  if (accentInput) accentInput.value = accent;
  if (accentHexInput && document.activeElement !== accentHexInput) accentHexInput.value = accent;
  // 自定义色输入只在「主控色被手动改过」时描边：恢复预设时用户看得见自己那枚
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
    const stored = normalizeHex(payload?.tokens?.["--hb-accent"]);
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
        describe(payload?.detail, "保存失败，请稍后重试。")
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
  const initialAccent = liveAccent();
  if (initialAccent) {
    if (accentInput) accentInput.value = initialAccent;
    if (accentHexInput) accentHexInput.placeholder = initialAccent;
  }
  // 「配色面板此刻真的可见」要同时满足三个条件：外层 #admin-app 已经显形（登录看它）、
  const settingsPanel = dialogPane.closest(".admin-panel");
  const appShell = document.getElementById("admin-app");
  const isVisible = () =>
    (!appShell || !appShell.hidden) &&
    !dialogPane.hidden &&
    (!settingsPanel || settingsPanel.classList.contains("active"));

  // 首次真正看到分页才读服务端：配色面板不是默认打开的分页，开局就多发一个请求不值。
  let loaded = false;
  const ensureLoaded = () => {
    if (loaded || !isVisible()) return;
    loaded = true;
    loadSaved().then(repaint);
  };
  const observer = new MutationObserver(() => {
    if (!isVisible()) return;
    setMessage("");
    ensureLoaded();
  });
  observer.observe(dialogPane, { attributes: true, attributeFilter: ["hidden", "class"] });
  if (settingsPanel) {
    observer.observe(settingsPanel, { attributes: true, attributeFilter: ["hidden", "class"] });
  }
  if (appShell) observer.observe(appShell, { attributes: true, attributeFilter: ["hidden"] });
  ensureLoaded();

  accentInput?.addEventListener("input", () => {
    draft.accent = accentInput.value;
    setMessage("");
    repaint();
  });
  accentHexInput?.addEventListener("input", () => {
    // 只在写全了才应用：输到一半的 "#ffc" 也是合法三位色，中途应用会让用户
    const value = normalizeHex(accentHexInput.value);
    accentHexInput.classList.toggle("is-invalid", Boolean(accentHexInput.value) && !value);
  });
  accentHexInput?.addEventListener("change", () => {
    const value = normalizeHex(accentHexInput.value);
    accentHexInput.classList.remove("is-invalid");
    if (!value) {
      accentHexInput.value = draftTokens()["--hb-accent"] || "";
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
