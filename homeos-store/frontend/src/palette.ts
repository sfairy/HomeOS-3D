/** 商店后台的「站点配色」面板（系统配置 → 站点配色）。 */

import { describe } from "./api-error.js";
import { api } from "./admin/api.js";
import {
  CONFIGURABLE,
  DEFAULT_PRESET,
  PRESETS,
  normalizeHex,
  resolveTokens,
} from "./scene/appearance.js";

type PaletteDraft = { preset: string; accent: string };

const dialogPane = document.querySelector<HTMLElement>('[data-tab-pane="palette"]');
const presetList = document.getElementById("palette-preset-list");
const accentInput = document.getElementById("palette-accent") as HTMLInputElement | null;
const accentHexInput = document.getElementById("palette-accent-hex") as HTMLInputElement | null;
const resetButton = document.getElementById("palette-reset");
const saveButton = document.getElementById("palette-save") as HTMLButtonElement | null;
const messageBox = document.getElementById("palette-message");
const swatches = new Map(
  [...document.querySelectorAll<HTMLElement>(".admin-palette-preview [data-swatch]")].map((node) => [
    node.dataset.swatch || '',
    node,
  ]),
);

/** 自定义色输入框的初值：从**当前生效的 --hb-accent** 读。 */
function liveAccent() {
  const applied = getComputedStyle(document.documentElement).getPropertyValue("--hb-accent").trim();
  const preset = PRESETS.find((item) => item.id === DEFAULT_PRESET)?.colors?.accent;
  return normalizeHex(applied) || normalizeHex(preset) || "";
}

/** 面板当前的工作副本； */
let draft: PaletteDraft = { preset: DEFAULT_PRESET, accent: "" };
/** 服务端上的值，用于「有没有改动」与「取消了要回到哪儿」。 */
let saved: PaletteDraft = { preset: DEFAULT_PRESET, accent: "" };
/** 是否真的读到过服务端配色。 */
let remoteLoaded = false;
/** 预览期间写在 root 上的令牌名，取消 / 关闭时要逐枚摘掉。 */
const previewKeys = new Set<string>();

function setMessage(text: string, kind = "") {
  if (!messageBox) return;
  messageBox.hidden = !text;
  messageBox.textContent = text || "";
  messageBox.classList.toggle("is-ok", kind === "ok");
  messageBox.classList.toggle("is-err", kind === "err");
}

function draftTokens() {
  return resolveTokens({ presetId: draft.preset, accentColor: draft.accent || undefined });
}

/** 把一张令牌表写到 root 上做预览。 */
function applyPreview(tokens: Record<string, string>) {
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
function paintSwatches(tokens: Record<string, string>) {
  for (const name of CONFIGURABLE) {
    const node = swatches.get(name);
    if (node) node.style.setProperty("--sw", tokens[`--hos-${name}`] || "transparent");
  }
}

/** 重画预设卡片与自定义色输入的选中态。 */
function paintControls() {
  for (const button of presetList?.querySelectorAll<HTMLElement>(".admin-palette-preset") || []) {
    button.setAttribute("aria-checked", String(button.dataset.preset === draft.preset));
  }
  const tokens = draftTokens();
  const accent = tokens["--hb-accent"] || "";
  if (accentInput) accentInput.value = accent;
  if (accentHexInput && document.activeElement !== accentHexInput) accentHexInput.value = accent;

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
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLElement>(".admin-palette-preset");
    if (!button) return;
    draft.preset = button.dataset.preset || DEFAULT_PRESET;

    draft.accent = "";
    setMessage("");
    repaint();
  });
}

/** 读回已保存的配色。 */
async function loadSaved() {
  try {
    const payload = (await api("/appearance")) as {
      preset?: string;
      tokens?: Record<string, string>;
    };
    const preset =
      typeof payload?.preset === "string" && payload.preset ? payload.preset : DEFAULT_PRESET;
    saved = { preset, accent: "" };
    const stored = normalizeHex(payload?.tokens?.["--hb-accent"]);
    const presetAccent = normalizeHex(PRESETS.find((item) => item.id === preset)?.colors.accent);
    if (stored && stored !== presetAccent) saved.accent = stored;
    remoteLoaded = true;
  } catch (error) {
    remoteLoaded = false;
    saved = { preset: DEFAULT_PRESET, accent: "" };
    setMessage(
      describe(error instanceof Error ? error.message : error, "读取当前配色失败，请刷新后重试。（当前不可保存，以免覆盖线上配色。）"),
      "err",
    );
  }
  draft = { ...saved };
}

async function save() {
  if (!saveButton) return;
  if (!remoteLoaded) {
    setMessage("还没读到服务端当前的配色，不能保存（否则会覆盖线上配色）。请刷新页面重试。", "err");
    return;
  }
  saveButton.disabled = true;
  setMessage("正在保存…");
  try {
    const payload = (await api("/appearance", {
      method: "PUT",
      body: JSON.stringify({ preset: draft.preset, tokens: draftTokens() }),
    })) as {
      tokens?: Record<string, string>;
    };
    saved = { ...draft };

    clearPreview();
    const tokens = payload?.tokens && Object.keys(payload.tokens).length ? payload.tokens : draftTokens();
    applyPreview(tokens);
    paintControls();
    setMessage("配色已保存，刷新后依然是这套颜色。", "ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败，请稍后重试。";
    setMessage(message || "保存失败，请稍后重试。", "err");
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

  const settingsPanel = dialogPane.closest(".admin-panel");
  const appShell = document.getElementById("admin-app");
  const isVisible = () =>
    (!appShell || !appShell.hidden) &&
    !dialogPane.hidden &&
    (!settingsPanel || settingsPanel.classList.contains("active"));


  let loaded = false;
  const ensureLoaded = () => {
    if (loaded || !isVisible()) return;
    loaded = true;
    loadSaved().then(() => {
      if (saveButton) saveButton.disabled = !remoteLoaded;
      repaint();
    });
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
