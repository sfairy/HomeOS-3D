/**
 * 编辑器通用小工具：ID / 颜色 / 数值格式化。
 *
 * 克隆文档、生成带前缀 ID、把标题转为 URL 片段、颜色空间互转（HEX / RGB / HSV）与面板字段
 * 取整。ID 依赖 utils/random-id.js 的 randomUuid；颜色一律先归一成小写 6 位 HEX。夹取与
 * 颜色归一不在这里：它们是编辑器、3D 工作室与渲染器共用的契约，唯一实现在 utils/numbers.js
 * 与 utils/colors.js。
 */
import { randomUuid } from "../utils/random-id.js?v=20260921151446";
import { clampNumber } from "../utils/numbers.js?v=20260921151446";
import { hexToRgbOrNull } from "../utils/colors.js?v=20260921151446";

/**
 * 深拷贝一个值。
 */
export function clone(value) {
  return structuredClone(value);
}

/**
 * 生成「前缀 + 随机 UUID」形式的 ID。
 */
export function newId(idPrefix) {
  return idPrefix + "-" + randomUuid();
}

/**
 * 把文本转成 URL 片段：去音标、转小写、非字母数字压成连字符。
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
 * HEX 转 RGB；非法输入兜底黑色 —— 编辑器要用它把颜色画出来，拿到 `undefined` 会直接崩在渲染里。
 * 解析（含三位缩写展开、可省略 `#`）归 utils/colors.js 的 `hexToRgbOrNull`（唯一实现），
 * 这里只定「非法时用什么」这一件事。
 */
export function hexToRgb(hexColorInput) {
  return hexToRgbOrNull(hexColorInput) || { r: 0, g: 0, b: 0 };
}

/**
 * RGB 转 HEX。
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
 */
export function roundField(fieldValue) {
  if (Number.isFinite(fieldValue)) {
    return String(Math.round(fieldValue * 100) / 100);
  } else {
    return "0";
  }
}

/**
 * 归一字体粗细：面板与后端有 1~900 与 0~1 两套写法，这里统一输出 0~1 供滑杆使用。
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
