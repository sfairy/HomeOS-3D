/* HomeOS 可配置配色（本文件为 store 侧逻辑源；3d 侧见 homeos-3d/.../auth/scene/appearance.ts）
   悄悄变了。 */

export type ColorName = "accent" | "lumen" | "aura" | "eco";

export const CONFIGURABLE: readonly ColorName[] = ["accent", "lumen", "aura", "eco"];

export type ShadePair = {
  bright: string;
  deep: string;
};

export type ColorMap = Record<ColorName, string>;

export type ShadeMap = Partial<Record<ColorName, ShadePair>>;

export type AppearanceColors = ColorMap & {
  accentShades?: ShadePair;
  lumenShades?: ShadePair;
  auraShades?: ShadePair;
  ecoShades?: ShadePair;
};

export type Preset = {
  id: string;
  label: string;
  hint: string;
  colors: ColorMap;
  shades: ShadeMap;
};

/**
 * 预设配色。全站只用一套（暖居琥珀），保留数组结构是为了让设置界面、后端校验与
 */
export const PRESETS: Preset[] = [
  {
    id: "amber",
    label: "暖居琥珀",
    hint: "全站唯一配色：暖金主控，灯光 / 氛围 / 生态在线各占一束暖光",
    colors: { accent: "#ffc46a", lumen: "#ff9d4d", aura: "#c9a0ff", eco: "#5fd0a8" },
    shades: {
      accent: { bright: "#ffd9a0", deep: "#e09523" },
      lumen: { bright: "#ffba83", deep: "#c96a1d" },
      aura: { bright: "#e7d6ff", deep: "#9253e6" },
      eco: { bright: "#88dcbf", deep: "#3b8e71" },
    },
  },
];

/** 默认预设 id。后端与设置界面都以它作为「没有配置过」的取值。 */
export const DEFAULT_PRESET = "amber";

/* --------------------------------------------------------------- 颜色工具 */


/** `#abc` / `#aabbcc` / `aabbcc` → `#aabbcc`；无法解析时返回 null。 */
export function normalizeHex(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(value)) {
    return `#${value[0]}${value[0]}${value[1]}${value[1]}${value[2]}${value[2]}`;
  }
  return /^[0-9a-f]{6}$/.test(value) ? `#${value}` : null;
}

function hexToRgb(hex: string): number[] {
  const value = normalizeHex(hex);
  if (!value) throw new TypeError(`不是合法的十六进制颜色：${hex}`);
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function rgbTriplet(hex: string): string {
  return hexToRgb(hex).join(", ");
}

/**
 * 由一个基色推出 `-bright` 与 `-deep`。
 */
function deriveShades(hex: string): ShadePair {
  const [r, g, b] = hexToRgb(hex).map((channel) => channel / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  let hue = 0;
  let saturation = 0;
  if (delta > 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
    else if (max === g) hue = ((b - r) / delta + 2) * 60;
    else hue = ((r - g) / delta + 4) * 60;
  }
  const toHex = (level: number, sat: number): string => {
    const chroma = (1 - Math.abs(2 * level - 1)) * Math.min(Math.max(sat, 0), 1);
    const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
    const offset = level - chroma / 2;
    const table =
      hue < 60
        ? [chroma, secondary, 0]
        : hue < 120
          ? [secondary, chroma, 0]
          : hue < 180
            ? [0, chroma, secondary]
            : hue < 240
              ? [0, secondary, chroma]
              : hue < 300
                ? [secondary, 0, chroma]
                : [chroma, 0, secondary];
    return (
      "#" +
      table
        .map((part) => Math.round((part + offset) * 255).toString(16).padStart(2, "0"))
        .join("")
    );
  };
  return {
    bright: toHex(Math.min(lightness + 0.105, 0.95), saturation),
    deep: toHex(Math.max(lightness - 0.2, 0.12), saturation * 0.75),
  };
}

/* ------------------------------------------------------------- 令牌展开 */

/**
 * 把四个基色展开成两张样式表要用的字面量令牌表。
 */
export function appearanceTokens(colors: Partial<AppearanceColors>): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const name of CONFIGURABLE) {
    const base = normalizeHex(colors[name]);
    if (!base) continue;
    const shadeKey = `${name}Shades` as const;
    const shades = (colors[shadeKey] as ShadePair | undefined) || deriveShades(base);
    const bright = normalizeHex(shades.bright) || deriveShades(base).bright;
    const deep = normalizeHex(shades.deep) || deriveShades(base).deep;
    const triplet = rgbTriplet(base);
    tokens[`--hos-${name}`] = base;
    tokens[`--hos-${name}-rgb`] = triplet;
    tokens[`--hos-${name}-bright`] = bright;
    tokens[`--hos-${name}-deep`] = deep;
    tokens[`--hb-${name}`] = base;
    tokens[`--hb-${name}-rgb`] = triplet;
    tokens[`--hb-${name}-bright`] = bright;
    tokens[`--hb-${name}-deep`] = deep;
    tokens[`--hb-${name}-soft`] = `rgba(${triplet}, 0.13)`;
    tokens[`--hb-${name}-line`] = `rgba(${triplet}, 0.32)`;
    tokens[`--hb-${name}-text`] = bright;
  }
  // 主按钮 hover 用的是比默认渐变再亮一档的独立渐变（默认那层上面压着深色文字，
  const accent = normalizeHex(colors.accent);
  if (accent) {
    const shades = colors.accentShades || deriveShades(accent);
    const bright = normalizeHex(shades.bright) || deriveShades(accent).bright;
    tokens["--hb-accent-grad-hover"] = `linear-gradient(180deg, ${bright}, ${accent})`;
  }
  return tokens;
}

export type ResolveTokensInput = {
  presetId?: string;
  accentColor?: string | null;
};

/**
 * 预设 + 可选的自定义主控色 → 展开好的令牌表。设置界面用这一个函数出图。
 */
export function resolveTokens({ presetId, accentColor }: ResolveTokensInput = {}): Record<string, string> {
  const preset = PRESETS.find((item) => item.id === presetId) || PRESETS.find((item) => item.id === DEFAULT_PRESET)!;
  const colors: AppearanceColors = { ...preset.colors };
  for (const name of CONFIGURABLE) {
    const shades = preset.shades?.[name];
    if (shades) {
      (colors as Record<string, unknown>)[`${name}Shades`] = shades;
    }
  }
  const custom = normalizeHex(accentColor);
  if (custom && custom !== normalizeHex(preset.colors.accent)) {
    colors.accent = custom;
    // 自定义色没有既定明暗档 —— 留着预设那一份会让按钮的渐变与底色对不上。
    delete colors.accentShades;
  }
  return appearanceTokens(colors);
}
