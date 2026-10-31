<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { adminApi } from "@store/shared/api/http";
import { describe } from "@store/shared/api/error";
import {
  CONFIGURABLE,
  DEFAULT_PRESET,
  PRESETS,
  normalizeHex,
  resolveTokens,
} from "@store/shared/scene/appearance";

interface Draft {
  preset: string;
  accent: string;
}

const draft = ref<Draft>({ preset: DEFAULT_PRESET, accent: "" });
const saved = ref<Draft>({ preset: DEFAULT_PRESET, accent: "" });
const remoteLoaded = ref(false);
const message = ref("");
const messageKind = ref<"" | "ok" | "err">("");
const saving = ref(false);
const colorValue = ref("");
const hexText = ref("");
const hexInvalid = ref(false);
const hexFocused = ref(false);
const previewKeys = new Set<string>();

const COLOR_LABELS: Record<string, string> = {
  accent: "主控色",
  lumen: "暖光",
  aura: "极光紫",
  eco: "薄荷",
};

function parseHexLike(value: string): [number, number, number] | null {
  const text = value.trim();
  const hex = normalizeHex(text);
  if (hex) {
    return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number];
  }
  const match = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(text);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: string, background: string): number | null {
  const fg = parseHexLike(foreground);
  const bg = parseHexLike(background);
  if (!fg || !bg) return null;
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const contrastChecks = computed(() => {
  const root = getComputedStyle(document.documentElement);
  const background = root.getPropertyValue("--hb-surface-raised").trim() || "#16263c";
  const items = CONFIGURABLE.map((name) => {
    const color = tokens.value[`--hb-${name}`] || root.getPropertyValue(`--hb-${name}`).trim();
    const ratio = contrastRatio(color, background);
    return {
      name,
      label: COLOR_LABELS[name] || name,
      color,
      ratio,
      low: ratio !== null && ratio < 3,
    };
  });
  return { background, items };
});

const tokens = computed(() =>
  resolveTokens({ presetId: draft.value.preset, accentColor: draft.value.accent || undefined }),
);
const accent = computed(() => tokens.value["--hb-accent"] || "");
const isCustom = computed(() => {
  const preset = PRESETS.find((item) => item.id === draft.value.preset);
  return Boolean(draft.value.accent) && normalizeHex(draft.value.accent) !== normalizeHex(preset?.colors.accent);
});

function setMessage(text: string, kind: "" | "ok" | "err" = "") {
  message.value = text;
  messageKind.value = kind;
}

function applyPreview(next: Record<string, string>) {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(next)) {
    root.style.setProperty(name, value);
    previewKeys.add(name);
  }
}

function clearPreview() {
  for (const name of previewKeys) document.documentElement.style.removeProperty(name);
  previewKeys.clear();
}

/**
 * 预览只跟随「覆盖项」。
 *
 * resolveTokens() 的自有属性只有自定义主色的覆盖令牌（默认配色是空表，基线值挂在原型链上），
 * 所以从自定义色切回默认时 Object.entries 拿到的是空表 —— 必须先撤掉上一轮 setProperty 的内联变量，
 * 否则色板会一直残留自定义主色，直到组件卸载。
 */
watch(tokens, (next) => {
  clearPreview();
  applyPreview(next);
});

watch(accent, (value) => {
  if (!colorValue.value || colorValue.value !== value) colorValue.value = value;
  if (!hexFocused.value && hexText.value !== value) hexText.value = value;
});

watch(colorValue, (value) => {
  const normalized = normalizeHex(value);
  if (!normalized) return;
  draft.value.accent = normalized;
  setMessage("");
});

function onHexInput() {
  hexInvalid.value = Boolean(hexText.value) && !normalizeHex(hexText.value);
}

function onHexChange() {
  hexInvalid.value = false;
  const normalized = normalizeHex(hexText.value);
  if (!normalized) {
    hexText.value = accent.value;
    return;
  }
  draft.value.accent = normalized;
  setMessage("");
}

function pickPreset(id: string) {
  draft.value = { preset: id, accent: "" };
  setMessage("");
}

const presetButtons = new Map<number, HTMLButtonElement>();

function setPresetRef(el: unknown, index: number) {
  if (el instanceof HTMLButtonElement) presetButtons.set(index, el);
  else presetButtons.delete(index);
}

/**
 * roving tabindex：整个 radiogroup 只占一个 Tab 站。
 *
 * role=radio 的语义是「一组里单选」，用 Tab 逐个走完五个预设会和读屏/浏览器的预期打架；
 * 正确做法是 Tab 进组、方向键在组内移动并即时选中（WAI-ARIA radio group 模式）。
 */
function presetTabIndex(index: number): number {
  const active = PRESETS.findIndex((item) => item.id === draft.value.preset);
  return index === (active >= 0 ? active : 0) ? 0 : -1;
}

function onPresetKeydown(event: KeyboardEvent, index: number) {
  const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
  const last = PRESETS.length - 1;
  let next = index;
  if (step !== 0) next = (index + step + PRESETS.length) % PRESETS.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = last;
  else return;
  event.preventDefault();
  const preset = PRESETS[next];
  if (!preset) return;
  pickPreset(preset.id);
  presetButtons.get(next)?.focus();
}

function reset() {
  draft.value = { preset: DEFAULT_PRESET, accent: "" };
  setMessage("");
}

async function loadSaved() {
  try {
    const payload = await adminApi<{ preset?: string; tokens?: Record<string, string> }>("/appearance");
    const preset =
      typeof payload?.preset === "string" && payload.preset ? payload.preset : DEFAULT_PRESET;
    saved.value = { preset, accent: "" };
    const stored = normalizeHex(payload?.tokens?.["--hb-accent"]);
    const presetAccent = normalizeHex(PRESETS.find((item) => item.id === preset)?.colors.accent);
    if (stored && stored !== presetAccent) saved.value.accent = stored;
    remoteLoaded.value = true;
  } catch (error) {
    remoteLoaded.value = false;
    saved.value = { preset: DEFAULT_PRESET, accent: "" };
    setMessage(
      describe(
        error instanceof Error ? error.message : error,
        "读取当前配色失败，请刷新后重试。（当前不可保存，以免覆盖线上配色。）",
      ),
      "err",
    );
  }
  draft.value = { ...saved.value };
}

async function save() {
  if (!remoteLoaded.value) {
    setMessage("还没读到服务端当前的配色，不能保存（否则会覆盖线上配色）。请刷新页面重试。", "err");
    return;
  }
  saving.value = true;
  setMessage("正在保存…");
  try {
    const payload = await adminApi<{ tokens?: Record<string, string> }>("/appearance", {
      method: "PUT",
      body: JSON.stringify({ preset: draft.value.preset, tokens: tokens.value }),
    });
    saved.value = { ...draft.value };
    clearPreview();
    const next =
      payload?.tokens && Object.keys(payload.tokens).length ? payload.tokens : tokens.value;
    applyPreview(next);
    setMessage("配色已保存，刷新后依然是这套颜色。", "ok");
  } catch (error) {
    setMessage(describe(error instanceof Error ? error.message : error, "保存失败，请稍后重试。"), "err");
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  const applied = getComputedStyle(document.documentElement).getPropertyValue("--hb-accent").trim();
  const preset = PRESETS.find((item) => item.id === DEFAULT_PRESET)?.colors?.accent;
  const initial = normalizeHex(applied) || normalizeHex(preset) || "";
  colorValue.value = initial;
  hexText.value = initial;
  await loadSaved();
  applyPreview(tokens.value);
});

onBeforeUnmount(() => {
  clearPreview();
});
</script>

<template>
  <div class="admin-tab-pane" data-tab-pane="palette" data-tone="aura">
    <p class="admin-hint admin-grid__full">
      配色分两层：一个主控色决定「可进入 / 可操作」的暖金，三束居家光分别代表灯光与已激活（暖光）、
      氛围与恢复（极光紫）、在线与节能（薄荷）。温度与安防的读色不在这里 ——
      它们编码物理含义，改掉会让「热」看起来像「冷」。改动即时生效，保存后刷新依然是这套颜色。
    </p>
    <div class="admin-palette-presets admin-grid__full" role="radiogroup" aria-label="配色预设">
      <button
        v-for="(preset, index) in PRESETS"
        :key="preset.id"
        :ref="(el) => setPresetRef(el, index)"
        class="admin-palette-preset"
        type="button"
        role="radio"
        :aria-checked="preset.id === draft.preset"
        :tabindex="presetTabIndex(index)"
        @click="pickPreset(preset.id)"
        @keydown="onPresetKeydown($event, index)"
      >
        <span class="admin-palette-dots" aria-hidden="true">
          <i v-for="name in CONFIGURABLE" :key="name" :style="{ '--dot': preset.colors[name] }"></i>
        </span>
        <strong>{{ preset.label }}</strong>
        <small>{{ preset.hint }}</small>
      </button>
    </div>
    <div class="admin-palette-custom admin-grid__full" :class="{ 'is-custom': isCustom }">
      <span>自定义主控色</span>
      <input v-model="colorValue" type="color" aria-label="自定义主控色" />
      <input
        v-model="hexText"
        class="hb-input"
        :class="{ 'is-invalid': hexInvalid }"
        type="text"
        inputmode="text"
        spellcheck="false"
        maxlength="7"
        placeholder="#RRGGBB"
        aria-label="主控色十六进制值"
        @focus="hexFocused = true"
        @blur="hexFocused = false"
        @input="onHexInput"
        @change="onHexChange"
      />
      <small>自定义只换主控色，暖光 / 极光紫 / 薄荷沿用所选预设。</small>
    </div>
    <div class="admin-palette-preview admin-grid__full" aria-hidden="true">
      <span v-for="name in CONFIGURABLE" :key="name" :style="{ '--sw': tokens[`--hb-${name}`] }"></span>
    </div>
    <div class="admin-palette-contrast admin-grid__full">
      <p class="admin-hint">
        对比度检查：相对面板底色 <code>{{ contrastChecks.background }}</code>。非文本色块建议 ≥ 3:1，
        正文文字建议 ≥ 4.5:1；低于阈值时保存仍会生效，但请先确认实际可读性。
      </p>
      <ul class="admin-palette-contrast__list">
        <li v-for="item in contrastChecks.items" :key="item.name">
          <span class="admin-palette-contrast__swatch" :style="{ background: item.color }" aria-hidden="true"></span>
          <span>{{ item.label }}</span>
          <strong>{{ item.ratio === null ? "无法计算" : `${item.ratio.toFixed(2)}:1` }}</strong>
          <span v-if="item.low" class="admin-palette-contrast__warn">低于 3:1</span>
        </li>
      </ul>
    </div>
    <p
      class="admin-inline-msg admin-grid__full"
      :class="{ 'is-ok': messageKind === 'ok', 'is-err': messageKind === 'err' }"
      role="status"
      :hidden="!message"
    >
      {{ message }}
    </p>
    <div class="admin-form-actions admin-grid__full">
      <button class="hb-button" type="button" @click="reset">恢复默认</button>
      <button class="hb-button hb-button--primary" type="button" :disabled="saving || !remoteLoaded" @click="save">
        保存配色
      </button>
    </div>
  </div>
</template>
