/**
 * 商店配色的第二处定义只应该有一个真源：public/static/theme.css。
 *
 * 所以本模块不再复制任何十六进制：默认值从 :root 的当前计算样式里读，
 * 只把「管理员自定义的覆盖项」展开成字面量令牌，交给后端写进 /store-appearance.css。
 * 默认配色保存后是空令牌表 —— 那样 theme.css 永远是唯一真源，
 * 也不会出现「样式表改了一处、配色面板还写着旧值」的分裂。
 */

type ColorName = "accent" | "lumen" | "aura" | "eco";

export const CONFIGURABLE: readonly ColorName[] = ["accent", "lumen", "aura", "eco"];

type ColorMap = Record<ColorName, string>;

type Preset = {
  id: string;
  label: string;
  hint: string;
  readonly colors: ColorMap;
};

/** 每个色在 theme.css 里的令牌家族后缀（顺序与样式表一致，便于对照）。 */
const FAMILY_SUFFIXES = ["", "-rgb", "-bright", "-deep", "-soft", "-line", "-text"] as const;

/** 读 :root 上某个自定义属性的当前生效值；无 DOM（构建期 / 单测）时返回空串。 */
function readAppliedVar(name: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** 当前生效的基线令牌（全部来自 theme.css，不含管理员覆盖）。 */
function baselineTokens(): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const name of CONFIGURABLE) {
    for (const suffix of FAMILY_SUFFIXES) {
      const key = `--hb-${name}${suffix}`;
      const value = readAppliedVar(key);
      if (value) tokens[key] = value;
    }
  }
  const hoverGrad = readAppliedVar("--hb-accent-grad-hover");
  if (hoverGrad) tokens["--hb-accent-grad-hover"] = hoverGrad;
  return tokens;
}

/** 预设配色。色值不在 TS 里复制：后台面板渲染预设点阵时读 theme.css 的当前生效值。 */
export const PRESETS: Preset[] = [
  {
    id: "amber",
    label: "暖居琥珀",
    hint: "全站唯一配色：暖金主控，灯光 / 氛围 / 生态在线各占一束暖光",
    get colors(): ColorMap {
      return {
        accent: readAppliedVar("--hb-accent"),
        lumen: readAppliedVar("--hb-lumen"),
        aura: readAppliedVar("--hb-aura"),
        eco: readAppliedVar("--hb-eco"),
      };
    },
  },
];

/** 默认预设 id。 */
export const DEFAULT_PRESET = "amber";

/** `#abc` / `#aabbcc` / `aabbcc` → `#aabbcc`；其余返回 null。 */
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

/** 由一个基色推出 `-bright` 与 `-deep`。 */
function deriveShades(hex: string): { bright: string; deep: string } {
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

/**
 * 一个自定义主控色 → 只包含「主控色家族」的覆盖令牌。
 *
 * 三束居家光（lumen / aura / eco）沿用 theme.css：自定义只换主控色，
 * 这也和后台页面上写给管理员的说明一致。
 */
function accentOverrideTokens(accent: string): Record<string, string> {
  const { bright, deep } = deriveShades(accent);
  const triplet = rgbTriplet(accent);
  return {
    "--hb-accent": accent,
    "--hb-accent-rgb": triplet,
    "--hb-accent-bright": bright,
    "--hb-accent-deep": deep,
    "--hb-accent-soft": `rgba(${triplet}, 0.13)`,
    "--hb-accent-line": `rgba(${triplet}, 0.32)`,
    "--hb-accent-text": bright,
    "--hb-accent-grad-hover": `linear-gradient(180deg, ${bright}, ${accent})`,
  };
}

type ResolveTokensInput = {
  presetId?: string;
  accentColor?: string | null;
};

/**
 * 预设 + 可选的自定义主控色 → 样式表要用的令牌表。
 *
 * 返回对象的**自有属性只有覆盖项**：走 JSON.stringify / Object.entries 得到的就是
 * 「需要写出去的部分」，保存时不会把 theme.css 的默认值再抄一遍（默认配色存的是空表）；
 * 而 `tokens['--hb-accent']` 这类读取会顺着原型链拿到基线值，后台预览不会出现空白。
 */
export function resolveTokens({ presetId, accentColor }: ResolveTokensInput = {}): Record<string, string> {
  const preset =
    PRESETS.find((item) => item.id === presetId) ?? PRESETS.find((item) => item.id === DEFAULT_PRESET)!;
  const custom = normalizeHex(accentColor);
  const base = normalizeHex(preset.colors.accent);
  const overrides = custom && custom !== base ? accentOverrideTokens(custom) : {};
  return Object.assign(Object.create(baselineTokens()), overrides) as Record<string, string>;
}
