/**
 * 站点配色设置面板（编辑器官网顶栏的「配色」按钮）。
 *
 * 两件事在这里发生，且刻意分开：
 *
 * 1. **即时预览**用 `document.documentElement.style.setProperty()` 逐枚写 CSS 变量。
 *    主应用的 CSP 是 `style-src 'self'`，内联 `<style>` 与 `style=` 属性都会被拦掉，
 *    但 CSSOM 赋值不受那条限制 —— 所以拖动色轮能立刻看到整页变色，不必每次往返服务端。
 *    实时改的这几枚变量会一直留在 root 上，直到用户关掉面板（那时按已保存值回灌）。
 *
 * 2. **保存**把展开好的令牌表 POST 给 `/api/v1/appearance`。后端据此生成
 *    `/appearance.css`，页面刷新后由那个 `<link>` 给出同一套颜色 ——
 *    也就是说「预览」与「落地」用的是同一个函数产出的同一张表，不会出现
 *    「拖的时候是这个色、保存完变另一个色」。
 *
 * 展开逻辑全部来自 `design/scene/appearance.js`（分发副本见 static/auth/scene/），
 * 那是唯一一份实现：后端不重算颜色，只做白名单校验后原样存下来。
 */

import {
  CONFIGURABLE,
  DEFAULT_PRESET,
  PRESETS,
  normalizeHex,
  resolveTokens
} from "../auth/scene/appearance.js?v=2609221451";
import { apiErrorMessage } from "../utils/api-error.js?v=2609221451";
import { apiFetch } from "../utils/api-fetch.js?v=2609221451";

/** 面板用到的元素。全部取自 index.html 的 #appearance-dialog。 */
const dialog = document.getElementById("appearance-dialog");
const openButton = document.getElementById("appearance-open");
const closeButton = document.getElementById("appearance-close");
const presetList = document.getElementById("appearance-preset-list");
const accentInput = document.getElementById("appearance-accent");
const accentHexInput = document.getElementById("appearance-accent-hex");
const resetButton = document.getElementById("appearance-reset");
const saveButton = document.getElementById("appearance-save");
const messageBox = document.getElementById("appearance-message");
const swatches = new Map(
  [...document.querySelectorAll("[data-swatch]")].map((node) => [node.dataset.swatch, node])
);

/** 面板当前的工作副本。关掉面板时丢弃；打开时从服务端读回。 */
let draft = { preset: DEFAULT_PRESET, accent: "" };
/** 服务端上的值，用于判断「有没有改动」以及「取消了要回到哪儿」。 */
let saved = { preset: DEFAULT_PRESET, accent: "" };
/** 预览期间写在 root 上的令牌名，取消 / 关闭时要逐枚摘掉。 */
const previewKeys = new Set();

function setMessage(text, kind = "") {
  if (!messageBox) return;
  messageBox.hidden = !text;
  messageBox.textContent = text || "";
  messageBox.classList.toggle("success", kind === "success");
  messageBox.classList.toggle("error", kind === "error");
}

/** 草稿对应的令牌表。预设与自定义色的取舍全在 resolveTokens() 里。 */
function draftTokens() {
  return resolveTokens({ presetId: draft.preset, accentColor: draft.accent || undefined });
}

/**
 * 把一张令牌表写到 root 上做预览。
 *
 * 只写**字面量**令牌（base / -bright / -deep / -rgb）：渐变、软底、描边那些是
 * `var()` 引用，改字面量它们自己会跟上。多写一份引用值等于把「谁是真的生效值」
 * 变模糊，而下一个改这里的人一定会去改错那一份。
 */
function applyPreview(tokens) {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(tokens)) {
    // -soft / -line / -text / grad-hover 也是字面量，一起写；rgba 与渐变都能被 CSSOM 接受。
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
  for (const button of presetList?.querySelectorAll(".appearance-preset") || []) {
    button.setAttribute("aria-checked", String(button.dataset.preset === draft.preset));
  }
  const tokens = draftTokens();
  const accent = tokens["--hos-accent"] || "";
  if (accentInput) accentInput.value = accent;
  if (accentHexInput && document.activeElement !== accentHexInput) accentHexInput.value = accent;
  // 自定义色输入只在「主控色被手动改过」时打上标记：这样恢复预设时用户看得见
  // 自己那枚自定义色已经不再生效，而不是以为它还在。
  const preset = PRESETS.find((item) => item.id === draft.preset);
  const isCustom = Boolean(draft.accent) && normalizeHex(draft.accent) !== normalizeHex(preset?.colors.accent);
  accentInput?.closest(".appearance-custom")?.classList.toggle("is-custom", isCustom);
}

/** 重画整块面板：控件状态 + 预览条 + 即时应用。 */
function repaint() {
  const tokens = draftTokens();
  paintControls();
  paintSwatches(tokens);
  applyPreview(tokens);
}

/**
 * 给每枚色点染上所属预设的颜色。
 *
 * 必须走 CSSOM 赋值，不能写成 `style="--dot:…"`：主应用的 CSP 是 `style-src 'self'`，
 * 内联 style 属性会被浏览器直接拦掉 —— 色点全变成透明，页面上只剩一条控制台报错。
 * 这一条与文件头「即时预览用 setProperty」是同一个理由。
 */
function paintPresetDots() {
  for (const button of presetList.querySelectorAll(".appearance-preset")) {
    const preset = PRESETS.find((item) => item.id === button.dataset.preset);
    if (!preset) continue;
    for (const dot of button.querySelectorAll("[data-dot]")) {
      dot.style.setProperty("--dot", preset.colors[dot.dataset.dot] || "transparent");
    }
  }
}

/** 建预设卡片。只在打开面板时建一次（内容不会变）。 */
function buildPresetCards() {
  if (!presetList || presetList.childElementCount) return;
  presetList.innerHTML = PRESETS.map(
    (preset) => `
      <button class="appearance-preset" type="button" role="radio" aria-checked="false" data-preset="${preset.id}">
        <span class="appearance-preset-dots" aria-hidden="true">
          ${CONFIGURABLE.map((name) => `<i data-dot="${name}"></i>`).join("")}
        </span>
        <strong>${preset.label}</strong>
        <small>${preset.hint}</small>
      </button>`
  ).join("");
  paintPresetDots();
  presetList.addEventListener("click", (event) => {
    const button = event.target.closest(".appearance-preset");
    if (!button) return;
    draft.preset = button.dataset.preset;
    // 换预设 = 放弃自定义色。保留着它会让「点了暖居琥珀，主控色却还是我上次拖的紫」
    // 变成一个没有出口的状态。
    draft.accent = "";
    setMessage("");
    repaint();
  });
}

/** 从服务端读回已保存的配色。405/404（旧后端）时退回默认值，不让面板整个不可用。 */
async function loadSaved() {
  try {
    const payload = await apiFetch("/api/v1/appearance", { method: "GET" });
    const preset = typeof payload?.preset === "string" && payload.preset ? payload.preset : DEFAULT_PRESET;
    saved = { preset, accent: "" };
    // 服务端的 tokens 里主控色与预设不一致，说明当初存的就是自定义色。
    const stored = payload?.tokens?.["--hos-accent"];
    const presetAccent = PRESETS.find((item) => item.id === preset)?.colors.accent;
    if (stored && normalizeHex(stored) !== normalizeHex(presetAccent)) saved.accent = normalizeHex(stored);
  } catch {
    saved = { preset: DEFAULT_PRESET, accent: "" };
  }
  draft = { ...saved };
}

async function openDialog() {
  if (!dialog) return;
  setMessage("");
  buildPresetCards();
  await loadSaved();
  repaint();
  dialog.showModal();
}

/** 关闭：把预览撤掉，页面回到「由样式表决定」的状态（即上次保存的结果）。 */
function closeDialog() {
  clearPreview();
  dialog?.close();
}

async function save() {
  if (!saveButton) return;
  saveButton.disabled = true;
  setMessage("正在保存…");
  try {
    const payload = await apiFetch("/api/v1/appearance", {
      method: "PUT",
      // 必须显式声明 JSON：apiFetch 只是 fetch 的透传，而 fetch 对字符串 body 的默认
      // Content-Type 是 text/plain。FastAPI 只在 application/json 下才把请求体当对象解析，
      // 少了这一行后端会在进入 validate_tokens 之前就以 422 拒绝（model_attributes_type）。
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset: draft.preset, tokens: draftTokens() }),
    });
    saved = { ...draft };
    // 保存后重新灌一次预览：服务端可能归一化了某个值，让界面立刻对齐真实生效的颜色。
    clearPreview();
    applyPreview(payload?.tokens && Object.keys(payload.tokens).length ? payload.tokens : draftTokens());
    paintControls();
    setMessage("配色已保存，刷新后依然是这套颜色。", "success");
  } catch (error) {
    setMessage(apiErrorMessage(error, "保存失败，请稍后重试。"), "error");
  } finally {
    saveButton.disabled = false;
  }
}

if (dialog) {
  openButton?.addEventListener("click", () => {
    openDialog();
  });
  closeButton?.addEventListener("click", closeDialog);
  // 点 backdrop 关闭：dialog 的默认行为只把 event.target 指向 dialog 自身。
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });
  // Esc 也会走到 close 事件：无论从哪条路径关闭，预览都必须撤掉，
  // 否则页面上会留下一层只有关掉标签页才消失的内联覆盖。
  dialog.addEventListener("close", clearPreview);

  accentInput?.addEventListener("input", () => {
    draft.accent = accentInput.value;
    setMessage("");
    repaint();
  });
  accentHexInput?.addEventListener("input", () => {
    const value = normalizeHex(accentHexInput.value);
    // 只在写全了才应用：输到一半的 "#ffc" 也是合法三位色，中途应用会让用户
    // 看到一串自己没打算选的跳变。
    accentHexInput.classList.toggle("is-invalid", Boolean(accentHexInput.value) && !value);
  });
  accentHexInput?.addEventListener("change", () => {
    const value = normalizeHex(accentHexInput.value);
    if (!value) {
      accentHexInput.value = draftTokens()["--hos-accent"] || "";
      accentHexInput.classList.remove("is-invalid");
      return;
    }
    accentHexInput.classList.remove("is-invalid");
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
