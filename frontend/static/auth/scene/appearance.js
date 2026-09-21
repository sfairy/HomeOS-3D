/* HomeOS 可配置配色（canonical 源：design/scene/appearance.js）
   预设、明暗派生与令牌展开都在这里，三个入口（主应用 / 商店 / Activate）共用同一份。
   改动请以 design/scene/ 下的同名文件为准，两侧必须一致，勿单侧手改。

   ## 为什么这份逻辑在前端而不是后端

   主应用与商店是两个独立的 Docker 构建上下文（Dockerfile 只 COPY frontend/ 或只
   COPY store/），后端代码无法互相 import；把同一段 HSL 派生写两份 Python，再靠一个
   比对脚本来维持一致，是这份仓库里已经有过的坏味道（见 theme.css 顶部的历史注释）。

   而「改一个主控色」这件事本身就需要**即时预览**：管理员拖色轮时页面要立刻变，等一次
   网络往返才知道效果是不可用的。既然前端必须有一份派生逻辑，就不该再有第二份 ——
   所以前端算完整张令牌表，后端只做「白名单 + 取值格式」校验后原样存下来（见
   backend/core/appearance.py 与 store/ops/appearance.py 的 validate_tokens）。

   这不等同于「后端信任前端」：能调用这两个接口的都是已登录的管理员，他们本来就能改
   站点名与公告。后端要防的是**把样式表写坏**（注入选择器、关掉自己的样式、撑爆 CSP），
   而不是防管理员审美。取值格式两道正则就是那道墙。

   ## 为什么 -bright / -deep 是算出来的

   四束光各自只有 4 枚字面色令牌（base / bright / deep / rgb），其余（渐变、软底、
   描边、辉光）全是引用它们的 var()，改字面量就整片跟上。手写 48 个十六进制不现实，
   而只开放 base 又会得到「主控色换了、按钮的亮渐变还是旧的青」这种半身不遂的效果。

   预设表里「暖居琥珀」显式写着 bright / deep：它是默认值，必须与
   design/scene/page.css 逐字相等 —— 否则管理员只是打开面板点一下保存，默认外观就
   悄悄变了。 */

/** 可配置的四束光。heat / cool / alert / sensor **刻意不在其中**：
    它们编码物理含义（热 / 冷 / 故障 / 离线），管理员把「热」配成冷色会直接破坏语义，
    而居家四色只回答「这个家看起来是什么气质」。 */
export const CONFIGURABLE = ["accent", "lumen", "aura", "eco"];

/** 中文名，给设置界面用（后端也要报错文案，故与 PRESETS 分开导出）。 */
export const COLOR_LABELS = {
  accent: "主控色",
  lumen: "暖光",
  aura: "极光紫",
  eco: "生态薄荷",
};

/**
 * 预设配色。全站只用一套（暖居琥珀），保留数组结构是为了让设置界面、后端校验与
 * 冒烟测试继续按「预设」这一层表达走 —— 但不再提供多方案可选。
 * `shades` 必须显式写出（见文件头：默认值不许漂移），且与 page.css 逐字相等。
 */
export const PRESETS = [
  {
    id: "amber",
    label: "暖居琥珀",
    hint: "全站唯一配色：暖金主控，灯光 / 氛围 / 生态在线各占一束暖光",
    colors: { accent: "#ffc46a", lumen: "#ff9d4d", aura: "#c9a0ff", eco: "#5fd0a8" },
    // 与 design/scene/page.css 的 --hos-*-bright / --hos-*-deep 逐字相等。
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
export function normalizeHex(input) {
  if (typeof input !== "string") return null;
  const value = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(value)) {
    return `#${value[0]}${value[0]}${value[1]}${value[1]}${value[2]}${value[2]}`;
  }
  return /^[0-9a-f]{6}$/.test(value) ? `#${value}` : null;
}

function hexToRgb(hex) {
  const value = normalizeHex(hex);
  if (!value) throw new TypeError(`不是合法的十六进制颜色：${hex}`);
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

/** `{ r, g, b }` → `r, g, b`。半透明派生色一律写 rgba(var(--x-rgb), α)，见 page.css 顶部注释。 */
export function rgbTriplet(hex) {
  return hexToRgb(hex).join(", ");
}

/** 按比例向白 / 黑插值；`amount` 为 0..1，负数向黑。 */
function mixChannel(channel, amount, target) {
  return Math.round(channel + (target - channel) * amount);
}

/**
 * 由一个基色推出 `-bright` 与 `-deep`。
 *
 * 用 HSL 而不是向白 / 黑插值：向白插值会把亮色洗成灰白（`#ffc46a` 提亮 10% 后彩度
 * 掉得肉眼可见），而「亮一档」在界面上的作用是**同一个色相的更亮一档**，不是更灰。
 * 所以亮度加固定量、饱和度只做轻微收缩（深色档多收一点：深色本身面积大，
 * 彩度不掉会让整块界面显得浊）。
 */
export function deriveShades(hex) {
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
  const toHex = (level, sat) => {
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
 *
 * 只回**字面量**令牌：`--hos-grad-accent`、`--hb-accent-soft`、`--hb-focus-ring`
 * 这类都是 `var()` 引用，改字面量它们自己会跟上。多回一份引用值只会让「谁才是真的
 * 生效值」变得可疑，而下一个人一定会去改错那一个。
 *
 * 两个命名空间一起发：主应用与场景读 `--hos-*`，商店读 `--hb-*`（theme.css 是
 * page.css 的镜像，两侧令牌须逐 token 相等）。同一张表在两端都无害，
 * 于是只需要一个 `GET /appearance.css` 响应体、一份前端产出。
 */
export function appearanceTokens(colors) {
  const tokens = {};
  for (const name of CONFIGURABLE) {
    const base = normalizeHex(colors[name]);
    if (!base) continue;
    const shades = colors[`${name}Shades`] || deriveShades(base);
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
  // 直接加 filter 会把文字洗灰，见 theme.css 的 --hb-accent-grad-hover）。
  const accent = normalizeHex(colors.accent);
  if (accent) {
    const shades = colors.accentShades || deriveShades(accent);
    const bright = normalizeHex(shades.bright) || deriveShades(accent).bright;
    tokens["--hb-accent-grad-hover"] = `linear-gradient(180deg, ${bright}, ${accent})`;
  }
  return tokens;
}

/** 预设 id → 展开好的令牌表；未知 id 回落到默认预设而不是抛错（后端存了旧值时仍要能出图）。 */
export function presetTokens(presetId) {
  return resolveTokens({ presetId });
}

/**
 * 预设 + 可选的自定义主控色 → 展开好的令牌表。设置界面用这一个函数出图。
 *
 * `accentColor` 与预设的 accent 相同时刻意**沿用预设的明暗档**：默认预设的
 * `-bright` / `-deep` 必须与设计系统逐字相等（见文件头），如果这里一律走
 * `deriveShades()`，管理员打开面板什么都不改、点一下保存，默认外观就变了。
 * 只有真正的自定义色才交给派生函数 —— 那种情况下本来就没有「既定值」可言。
 */
export function resolveTokens({ presetId, accentColor } = {}) {
  const preset = PRESETS.find((item) => item.id === presetId) || PRESETS.find((item) => item.id === DEFAULT_PRESET);
  const colors = { ...preset.colors };
  for (const name of CONFIGURABLE) {
    const shades = preset.shades?.[name];
    if (shades) colors[`${name}Shades`] = shades;
  }
  const custom = normalizeHex(accentColor);
  if (custom && custom !== normalizeHex(preset.colors.accent)) {
    colors.accent = custom;
    // 自定义色没有既定明暗档 —— 留着预设那一份会让按钮的渐变与底色对不上。
    delete colors.accentShades;
  }
  return appearanceTokens(colors);
}

/** 令牌表 → `:root{…}` 样式表正文。令牌名固定以 `--` 开头，故不需要转义。 */
export function tokensToCss(tokens) {
  const body = Object.entries(tokens)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");
  return `/* HomeOS 站点配色（由设置界面的配色项生成，勿手改） */\n:root {\n${body}\n}\n`;
}

/** 与 `appearanceTokens` 的键集一致的令牌名清单，供后端做白名单校验。 */
export function tokenNames() {
  return Object.keys(presetTokens(DEFAULT_PRESET));
}

/**
 * CSS 变量名（含 `--`）→ 去前缀的 kebab 名，供 `style.setProperty()` 用。
 * 设置界面用 CSSOM 逐枚赋值做即时预览：CSSOM 不受 CSP 的 `style-src 'self'` 约束
 * （那道限制只管内联 `<style>` 与 `style=` 属性）。
 */
export function cssVariableName(token) {
  return token.startsWith("--") ? token : `--${token}`;
}
