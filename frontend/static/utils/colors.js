/**
 * 颜色工具：归一、校验、插值。三份「归一」契约各自服务一种用途，名字即契约：
 */
import { clampNumber, coercedFiniteNumberOr } from "./numbers.js?v=2609271411";

/**
 * 读取全站调色板（design/scene/page.css）里某个自定义属性的**实际色值**。
 */
const paletteColorCache = new Map();
export function paletteColor(token, fallbackColor) {
  const cached = paletteColorCache.get(token);
  if (cached !== undefined) return cached;
  let resolved = "";
  try {
    resolved = window.getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  } catch {
    /* 无 window / 无 document（极少见的嵌入场景）：走兜底色 */
  }
  const value = resolved || fallbackColor;
  paletteColorCache.set(token, value);
  return value;
}

/**
 * 容错归一：可省略 `#`、认三位缩写，输出小写 `#rrggbb`；无法识别时返回空串。
 */
export function hexColorOrEmpty(colorInput) {
  const trimmedColor = String(colorInput || "").trim();
  const hexColor = trimmedColor.startsWith("#") ? trimmedColor : "#" + trimmedColor;
  if (/^#[\da-f]{6}$/i.test(hexColor)) {
    return hexColor.toLowerCase();
  } else if (/^#[\da-f]{3}$/i.test(hexColor)) {
    // 三位缩写先展开成六位，再统一小写。
    return expandHexColorOrNull(hexColor).toLowerCase();
  } else {
    return "";
  }
}

/**
 * 严格归一：只认完整的 `#rrggbb`（大小写不限），输出小写；其余（含三位缩写）返回空串。
 */
export function strictHexColorOrEmpty(hexColorInput) {
  const normalizedHexValue = String(hexColorInput || "")
    .trim()
    .toLowerCase();
  if (/^#[\da-f]{6}$/.test(normalizedHexValue)) {
    return normalizedHexValue;
  } else {
    return "";
  }
}

/**
 * 解析成六位 `#rrggbb`（三位缩写展开，大小写原样保留）；不是十六进制时返回 `null`。
 */
function expandHexColorOrNull(colorValue) {
  const trimmedColor = String(colorValue || "").trim();
  const expandedColor = /^#[0-9a-f]{3}$/i.test(trimmedColor)
    ? "#" +
      trimmedColor
        .slice(1)
        .split("")
        .map(hexDigit => "" + hexDigit + hexDigit)
        .join("")
    : trimmedColor;
  if (/^#[0-9a-f]{6}$/i.test(expandedColor)) {
    return expandedColor;
  } else {
    return null;
  }
}

/**
 * 解析成 `{ r, g, b }` 三通道（各 0~255）；不是十六进制时返回 `null`。
 */
export function hexToRgbOrNull(colorInput) {
  const normalizedColor = hexColorOrEmpty(colorInput);
  if (!normalizedColor) {
    return null;
  }
  return {
    r: Number.parseInt(normalizedColor.slice(1, 3), 16),
    g: Number.parseInt(normalizedColor.slice(3, 5), 16),
    b: Number.parseInt(normalizedColor.slice(5, 7), 16)
  };
}

/**
 * 校验 CSS 颜色字符串，非法时用兜底色。
 */
export function resolveColor(colorCandidate, fallbackColor) {
  const trimmedColor = String(colorCandidate || "").trim();
  if (/^(#[\da-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))$/i.test(trimmedColor)) {
    return trimmedColor;
  } else {
    return fallbackColor;
  }
}

export function kelvinToRgbHex(kelvin, options) {
  const { minKelvin, maxKelvin, fallbackKelvin } = options;
  // 公式以「百 K」为单位，因此先除以 100。
  const scaledKelvin = clampNumber(coercedFiniteNumberOr(kelvin, fallbackKelvin), minKelvin, maxKelvin) / 100;
  const redChannel =
    scaledKelvin <= 66 ? 255 : (scaledKelvin - 60) ** -0.1332047592 * 329.698727446;
  const greenChannel =
    scaledKelvin <= 66
      ? Math.log(scaledKelvin) * 99.4708025861 - 161.1195681661
      : (scaledKelvin - 60) ** -0.0755148492 * 288.1221695283;
  const blueChannel =
    scaledKelvin >= 66
      ? 255
      : scaledKelvin <= 19
        ? 0
        : Math.log(scaledKelvin - 10) * 138.5177312231 - 305.0447927307;
  // 三通道各占 8 位拼成一个整数，与 CSS / three.js 的 0xRRGGBB 表示一致。
  const clampChannel = channel => Math.round(clampNumber(channel, 0, 255));
  return (clampChannel(redChannel) << 16) | (clampChannel(greenChannel) << 8) | clampChannel(blueChannel);
}

/**
 * 在两个十六进制颜色之间做线性插值。
 */
export function mixHexColors(startColor, endColor, blendRatio = 0) {
  // 三位简写先展开成六位（本模块是唯一实现）：HA 里用户手写的颜色常是 #abc，
  const normalizedStartColor = expandHexColorOrNull(startColor);
  const normalizedEndColor = expandHexColorOrNull(endColor);
  // 任一端不是 hex（例如 rgb() 写法或主题变量名）就放弃插值，原样返回起点色 ——
  if (!normalizedStartColor || !normalizedEndColor) {
    return startColor;
  }
  // 夹到 0~1：比例来自亮度百分比之类的计算值，可能因浮点误差略微越界。
  const clampedBlendRatio = Math.max(0, Math.min(1, Number(blendRatio) || 0));
  /**
   * 取出 #RRGGBB 中某个通道的十进制值。
   */
  const parseColorChannel = (hexString, channelOffset) =>
    Number.parseInt(hexString.slice(channelOffset, channelOffset + 2), 16);
  return (
    "#" +
    [1, 3, 5]
      .map(channelIndex =>
        Math.round(
          parseColorChannel(normalizedStartColor, channelIndex) +
            (parseColorChannel(normalizedEndColor, channelIndex) -
              parseColorChannel(normalizedStartColor, channelIndex)) *
              clampedBlendRatio
        )
      )
      .map(channelValue => channelValue.toString(16).padStart(2, "0"))
      .join("")
  );
}
