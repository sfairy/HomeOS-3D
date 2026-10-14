import { randomUuid } from "../shared/util/random-id";
import { clampNumber } from "../shared/util/number";
export { clampNumber };
export function clone(sourceValue: any) {
  return structuredClone(sourceValue);
}
export function newId(idPrefix: any) {
  return idPrefix + "-" + randomUuid();
}
export function slugify(sourceText: any) {
  return (
    String(sourceText || "")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "page-" + randomUuid().slice(0, 8)
  );
}
export function normalizedHexColor(colorInput: any) {
  const trimmedColor = String(colorInput || "").trim(),
    hashPrefixedColor = trimmedColor.startsWith("#") ? trimmedColor : "#" + trimmedColor;
  return /^#[\da-f]{6}$/i.test(hashPrefixedColor)
    ? hashPrefixedColor.toLowerCase()
    : /^#[\da-f]{3}$/i.test(hashPrefixedColor)
      ? (
          "#" + [...hashPrefixedColor.slice(1)].map((hexDigit) => hexDigit.repeat(2)).join("")
        ).toLowerCase()
      : "";
}
export function rgbToHex(redChannel: any, greenChannel: any, blueChannel: any) {
  const channelToHex = (channelNumber: any) =>
    Math.round(clampNumber(Number(channelNumber) || 0, 0, 255))
      .toString(16)
      .padStart(2, "0");
  return "#" + channelToHex(redChannel) + channelToHex(greenChannel) + channelToHex(blueChannel);
}
export function rgbToHsv({ r: redComponent, g: greenComponent, b: blueComponent }: any) {
  const normalizedRed = redComponent / 255,
    normalizedGreen = greenComponent / 255,
    normalizedBlue = blueComponent / 255,
    maxChannel = Math.max(normalizedRed, normalizedGreen, normalizedBlue),
    minChannel = Math.min(normalizedRed, normalizedGreen, normalizedBlue),
    channelRange = maxChannel - minChannel;
  let hueDeg = 0;
  return (
    channelRange &&
      (maxChannel === normalizedRed
        ? (hueDeg = 60 * (((normalizedGreen - normalizedBlue) / channelRange) % 6))
        : maxChannel === normalizedGreen
          ? (hueDeg = 60 * ((normalizedBlue - normalizedRed) / channelRange + 2))
          : (hueDeg = 60 * ((normalizedRed - normalizedGreen) / channelRange + 4))),
    hueDeg < 0 && (hueDeg += 360),
    {
      h: hueDeg,
      s: maxChannel ? channelRange / maxChannel : 0,
      v: maxChannel,
    }
  );
}
/**
 * HSV → RGB 0–255 分量（色相为角度，饱和度/明度为 0–1）。
 *
 * 与 `@/shared/entity/utils/control/light-control-core` 的 `hsvToRgb` **不是**同一口径：
 * 那边收的是 HA 的 `hs_color`（饱和度按百分比），返回 0–1 分量；这边收 0–1 饱和度并直接给
 * 0–255 通道。两者此前同名，取色盘与弹窗各用一份、极易串用，故此处按量纲改名。
 */
export function hsvToRgb255(hueInput: any, saturationInput: any, brightnessInput: any) {
  const normalizedHue = ((Number(hueInput) % 360) + 360) % 360,
    saturationRatio = clampNumber(Number(saturationInput), 0, 1),
    brightnessRatio = clampNumber(Number(brightnessInput), 0, 1),
    chroma = brightnessRatio * saturationRatio,
    hueSector = normalizedHue / 60,
    intermediateChannel = chroma * (1 - Math.abs((hueSector % 2) - 1)),
    baseRgbComponents =
      hueSector < 1
        ? [chroma, intermediateChannel, 0]
        : hueSector < 2
          ? [intermediateChannel, chroma, 0]
          : hueSector < 3
            ? [0, chroma, intermediateChannel]
            : hueSector < 4
              ? [0, intermediateChannel, chroma]
              : hueSector < 5
                ? [intermediateChannel, 0, chroma]
                : [chroma, 0, intermediateChannel],
    brightnessOffset = brightnessRatio - chroma;
  return {
    r: (baseRgbComponents[0] + brightnessOffset) * 255,
    g: (baseRgbComponents[1] + brightnessOffset) * 255,
    b: (baseRgbComponents[2] + brightnessOffset) * 255,
  };
}
export function roundField(numericField: any) {
  return Number.isFinite(numericField) ? String(Math.round(numericField * 100) / 100) : "0";
}
export function visibilityIconSvg(visibilityIconVisible: any) {
  return visibilityIconVisible
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 16M2.5 12s3.5-6 9.5-6c2 0 3.7.7 5.1 1.6M21.5 12s-3.5 6-9.5 6c-2 0-3.7-.7-5.1-1.6"/></svg>';
}

export function normalizedFontWeight(fontWeightInput: any, fallbackWeight = 0.4) {
  const numericWeight = Number(fontWeightInput);
  return Number.isFinite(numericWeight)
    ? numericWeight > 1
      ? clampNumber((numericWeight - 1) / 899, 0, 1)
      : clampNumber(numericWeight, 0, 1)
    : fallbackWeight;
}
