/**
 * 编辑器通用小工具：ID / 颜色 / 数值格式化。
 *
 * 位置：编辑器各模块共用的纯函数集合，被 inspector、history、picker 等引用。
 * 职责：克隆文档、生成带前缀的 ID、把标题转为 URL 片段、颜色空间互转
 *   （HEX / RGB / HSV）、以及面板字段的取整与夹取。
 * 约定：ID 依赖 randomUuid（utils/random-id.js），同一版本戳必须与
 *   home.js 引用的一致；颜色一律先归一成小写 6 位 HEX 再计算。
 */
import { randomUuid } from "./utils/random-id.js?v=20260918224928";

/**
 * 深拷贝一个值。
 *
 * @param {*} value 待拷贝的值。
 * @returns {*} 拷贝结果；使用 structuredClone，不支持函数 / DOM 节点。
 */
export function clone(value) {
  return structuredClone(value);
}

/**
 * 生成「前缀 + 随机 UUID」形式的 ID。
 *
 * @param {string} idPrefix 前缀，如 "page" / "component"。
 * @returns {string} 新 ID。
 */
export function newId(idPrefix) {
  return idPrefix + "-" + randomUuid();
}

/**
 * 把文本转成 URL 片段：去音标、转小写、非字母数字压成连字符。
 *
 * @param {string} text 原始文本，通常为页面标题。
 * @returns {string} 片段；全中文等无法转写时回退为 "page-<8 位随机>"。
 */
export function slugify(text) {
  // slice(0, 72) 限制长度，避免生成过长的路径；结果为空串时必须有回退值，
  // 否则会产出空路径导致路由冲突。
  return (
    String(text || "")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "page-" + randomUuid().slice(0, 8)
  );
}

/**
 * 把各种写法的颜色归一成小写 6 位 HEX。
 *
 * @param {string} colorInput 颜色输入，可带或不带 "#"，支持 3 位缩写。
 * @returns {string} #rrggbb；无法识别时返回空串。
 */
export function normalizedHexColor(colorInput) {
  const trimmedColor = String(colorInput || "").trim();
  const hexColor = trimmedColor.startsWith("#") ? trimmedColor : "#" + trimmedColor;
  if (/^#[\da-f]{6}$/i.test(hexColor)) {
    return hexColor.toLowerCase();
  } else if (/^#[\da-f]{3}$/i.test(hexColor)) {
    // 3 位缩写按位展开：每个字符重复一次得到 6 位。
    return (
      "#" + [...hexColor.slice(1)].map(hexDigit => hexDigit.repeat(2)).join("")
    ).toLowerCase();
  } else {
    return "";
  }
}

/**
 * HEX 转 RGB。
 *
 * @param {string} hexColorInput HEX 颜色。
 * @returns {{r: number, g: number, b: number}} 0~255 的三通道值；非法输入按黑色处理。
 */
export function hexToRgb(hexColorInput) {
  const normalizedColor = normalizedHexColor(hexColorInput) || "#000000";
  return {
    r: Number.parseInt(normalizedColor.slice(1, 3), 16),
    g: Number.parseInt(normalizedColor.slice(3, 5), 16),
    b: Number.parseInt(normalizedColor.slice(5, 7), 16)
  };
}

/**
 * RGB 转 HEX。
 *
 * @param {number} red 红通道。
 * @param {number} green 绿通道。
 * @param {number} blue 蓝通道。
 * @returns {string} #rrggbb 小写形式；越界通道会先夹到 0~255。
 */
export function rgbToHex(red, green, blue) {
  // 单通道转两位小写十六进制；越界与非法输入先夹到 0~255，padStart 保证 0 也输出两位。
  const channelToHex = channelValue =>
    Math.round(clampNumber(Number(channelValue) || 0, 0, 255))
      .toString(16)
      .padStart(2, "0");
  return "#" + channelToHex(red) + channelToHex(green) + channelToHex(blue);
}

/**
 * RGB 转 HSV。
 *
 * @param {{r: number, g: number, b: number}} rgb 颜色对象，通道取值 0~255。
 * @returns {{h: number, s: number, v: number}} 色相 0~360、饱和度与明度 0~1。
 */
export function rgbToHsv({ r: redValue, g: greenValue, b: blueValue }) {
  const redRatio = redValue / 255;
  const greenRatio = greenValue / 255;
  const blueRatio = blueValue / 255;
  const maxChannel = Math.max(redRatio, greenRatio, blueRatio);
  const minChannel = Math.min(redRatio, greenRatio, blueRatio);
  const channelDelta = maxChannel - minChannel;
  let hueDegrees = 0;
  // channelDelta 为 0 说明是灰色，色相保持 0。
  if (channelDelta) {
    if (maxChannel === redRatio) {
      hueDegrees = (((greenRatio - blueRatio) / channelDelta) % 6) * 60;
    } else if (maxChannel === greenRatio) {
      hueDegrees = ((blueRatio - redRatio) / channelDelta + 2) * 60;
    } else {
      hueDegrees = ((redRatio - greenRatio) / channelDelta + 4) * 60;
    }
  }
  // 上面按 %6 得到的色相可能为负，统一折回 0~360。
  if (hueDegrees < 0) {
    hueDegrees += 360;
  }
  return {
    h: hueDegrees,
    s: maxChannel ? channelDelta / maxChannel : 0,
    v: maxChannel
  };
}

/**
 * HSV 转 RGB。
 *
 * @param {number} hue 色相，可为任意角度，内部按 360 取模。
 * @param {number} saturation 饱和度 0~1。
 * @param {number} brightness 明度 0~1。
 * @returns {{r: number, g: number, b: number}} 三通道 0~255 的值。
 */
export function hsvToRgb(hue, saturation, brightness) {
  // 二次取模把负角度（如 -30°）折回 [0, 360)，否则下面按扇区切片会落到负值区间。
  const normalizedHue = ((Number(hue) % 360) + 360) % 360;
  const normalizedSaturation = clampNumber(Number(saturation), 0, 1);
  const normalizedBrightness = clampNumber(Number(brightness), 0, 1);
  const chroma = normalizedBrightness * normalizedSaturation;
  const hueSector = normalizedHue / 60;
  const secondChannel = chroma * (1 - Math.abs((hueSector % 2) - 1));
  // 把色相划成 6 个 60° 扇区，分别给出三分量的相对值。
  const primaryChannels =
    hueSector < 1
      ? [chroma, secondChannel, 0]
      : hueSector < 2
        ? [secondChannel, chroma, 0]
        : hueSector < 3
          ? [0, chroma, secondChannel]
          : hueSector < 4
            ? [0, secondChannel, chroma]
            : hueSector < 5
              ? [secondChannel, 0, chroma]
              : [chroma, 0, secondChannel];
  const matchValue = normalizedBrightness - chroma;
  return {
    r: (primaryChannels[0] + matchValue) * 255,
    g: (primaryChannels[1] + matchValue) * 255,
    b: (primaryChannels[2] + matchValue) * 255
  };
}

/**
 * 把数值格式化成面板显示用的两位小数字符串。
 *
 * @param {number} fieldValue 数值。
 * @returns {string} 两位小数字符串；非有限数返回 "0"（输入框不接受 NaN）。
 */
export function roundField(fieldValue) {
  if (Number.isFinite(fieldValue)) {
    return String(Math.round(fieldValue * 100) / 100);
  } else {
    return "0";
  }
}

/**
 * 把数值夹到 [min, max] 区间。
 *
 * @param {number} inputValue 输入值。
 * @param {number} minValue 下限。
 * @param {number} maxValue 上限。
 * @returns {number} 夹取后的值。
 */
export function clampNumber(inputValue, minValue, maxValue) {
  return Math.max(minValue, Math.min(maxValue, inputValue));
}

/**
 * 归一字体粗细。
 *
 * 面板与后端存在两套写法：1~900 的 CSS 数值，与 0~1 的比例值。
 * 这里统一输出 0~1，方便滑杆控件使用。
 *
 * @param {number} weight 原始字重。
 * @param {number} [fallbackWeight] 非法输入时的回退比例。
 * @returns {number} 0~1 的比例值。
 */
export function normalizedFontWeight(weight, fallbackWeight = 0.4) {
  const numericWeight = Number(weight);
  if (Number.isFinite(numericWeight)) {
    if (numericWeight > 1) {
      // 899 是 900 与 1 的差；把 1~900 线性映射到 0~1。
      return clampNumber((numericWeight - 1) / 899, 0, 1);
    } else {
      return clampNumber(numericWeight, 0, 1);
    }
  } else {
    return fallbackWeight;
  }
}
