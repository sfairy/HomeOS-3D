import { randomUuid } from "./utils/random-id.js?v=20260916013557";
export function clone(value) {
  return structuredClone(value);
}
export function newId(idPrefix) {
  return idPrefix + "-" + randomUuid();
}
export function slugify(text) {
  return (
    String(text || "")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "page-" + randomUuid().slice(0, 8)
  );
}
export function normalizedHexColor(colorInput) {
  const trimmedColor = String(colorInput || "").trim();
  const hexColor = trimmedColor.startsWith("#") ? trimmedColor : "#" + trimmedColor;
  if (/^#[\da-f]{6}$/i.test(hexColor)) {
    return hexColor.toLowerCase();
  } else if (/^#[\da-f]{3}$/i.test(hexColor)) {
    return (
      "#" + [...hexColor.slice(1)].map(hexDigit => hexDigit.repeat(2)).join("")
    ).toLowerCase();
  } else {
    return "";
  }
}
export function hexToRgb(hexColorInput) {
  const normalizedColor = normalizedHexColor(hexColorInput) || "#000000";
  return {
    r: Number.parseInt(normalizedColor.slice(1, 3), 16),
    g: Number.parseInt(normalizedColor.slice(3, 5), 16),
    b: Number.parseInt(normalizedColor.slice(5, 7), 16)
  };
}
export function rgbToHex(red, green, blue) {
  const channelToHex = channelValue =>
    Math.round(clampNumber(Number(channelValue) || 0, 0, 255))
      .toString(16)
      .padStart(2, "0");
  return "#" + channelToHex(red) + channelToHex(green) + channelToHex(blue);
}
export function rgbToHsv({ r: redValue, g: greenValue, b: blueValue }) {
  const redRatio = redValue / 255;
  const greenRatio = greenValue / 255;
  const blueRatio = blueValue / 255;
  const maxChannel = Math.max(redRatio, greenRatio, blueRatio);
  const minChannel = Math.min(redRatio, greenRatio, blueRatio);
  const channelDelta = maxChannel - minChannel;
  let hueDegrees = 0;
  if (channelDelta) {
    if (maxChannel === redRatio) {
      hueDegrees = (((greenRatio - blueRatio) / channelDelta) % 6) * 60;
    } else if (maxChannel === greenRatio) {
      hueDegrees = ((blueRatio - redRatio) / channelDelta + 2) * 60;
    } else {
      hueDegrees = ((redRatio - greenRatio) / channelDelta + 4) * 60;
    }
  }
  if (hueDegrees < 0) {
    hueDegrees += 360;
  }
  return {
    h: hueDegrees,
    s: maxChannel ? channelDelta / maxChannel : 0,
    v: maxChannel
  };
}
export function hsvToRgb(hue, saturation, brightness) {
  const normalizedHue = ((Number(hue) % 360) + 360) % 360;
  const normalizedSaturation = clampNumber(Number(saturation), 0, 1);
  const normalizedBrightness = clampNumber(Number(brightness), 0, 1);
  const chroma = normalizedBrightness * normalizedSaturation;
  const hueSector = normalizedHue / 60;
  const secondChannel = chroma * (1 - Math.abs((hueSector % 2) - 1));
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
export function roundField(fieldValue) {
  if (Number.isFinite(fieldValue)) {
    return String(Math.round(fieldValue * 100) / 100);
  } else {
    return "0";
  }
}
export function clampNumber(inputValue, minValue, maxValue) {
  return Math.max(minValue, Math.min(maxValue, inputValue));
}
export function normalizedFontWeight(weight, fallbackWeight = 0.4) {
  const numericWeight = Number(weight);
  if (Number.isFinite(numericWeight)) {
    if (numericWeight > 1) {
      return clampNumber((numericWeight - 1) / 899, 0, 1);
    } else {
      return clampNumber(numericWeight, 0, 1);
    }
  } else {
    return fallbackWeight;
  }
}
