import { randomUuid } from "./utils/random-id.js?v=20260724-revert-hold-popup-shield-v324";
export function clone(sourceValue) {
  return structuredClone(sourceValue);
}
export function newId(idPrefix) {
  return idPrefix + "-" + randomUuid();
}
export function slugify(sourceText) {
  return (
    String(sourceText || "")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "page-" + randomUuid().slice(0, 8)
  );
}
export function normalizedHexColor(colorInput) {
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
export function hexToRgb(hexColor) {
  const validHexColor = normalizedHexColor(hexColor) || "#000000";
  return {
    r: Number.parseInt(validHexColor.slice(1, 3), 16),
    g: Number.parseInt(validHexColor.slice(3, 5), 16),
    b: Number.parseInt(validHexColor.slice(5, 7), 16),
  };
}
export function rgbToHex(redChannel, greenChannel, blueChannel) {
  const channelToHex = (channelNumber) =>
    Math.round(clampNumber(Number(channelNumber) || 0, 0, 255))
      .toString(16)
      .padStart(2, "0");
  return "#" + channelToHex(redChannel) + channelToHex(greenChannel) + channelToHex(blueChannel);
}
export function rgbToHsv({ r: redComponent, g: greenComponent, b: blueComponent }) {
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
export function hsvToRgb(hueInput, saturationInput, brightnessInput) {
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
export function roundField(numericField) {
  return Number.isFinite(numericField) ? String(Math.round(numericField * 100) / 100) : "0";
}
export function clampNumber(sourceNumber, lowerBound, upperBound) {
  return Math.max(lowerBound, Math.min(upperBound, sourceNumber));
}
export function normalizedFontWeight(fontWeightInput, fallbackWeight = 0.4) {
  const numericWeight = Number(fontWeightInput);
  return Number.isFinite(numericWeight)
    ? numericWeight > 1
      ? clampNumber((numericWeight - 1) / 899, 0, 1)
      : clampNumber(numericWeight, 0, 1)
    : fallbackWeight;
}
