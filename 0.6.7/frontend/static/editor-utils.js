import { randomUuid } from "./utils/random-id.js?v=20260724-revert-hold-popup-shield-v324";
export function clone(arg1) {
  return structuredClone(arg1);
}
export function newId(arg2) {
  return arg2 + "-" + randomUuid();
}
export function slugify(arg3) {
  return (
    String(arg3 || "")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "page-" + randomUuid().slice(0, 8)
  );
}
export function normalizedHexColor(arg4) {
  const value1 = String(arg4 || "").trim(),
    value2 = value1.startsWith("#") ? value1 : "#" + value1;
  return /^#[\da-f]{6}$/i.test(value2)
    ? value2.toLowerCase()
    : /^#[\da-f]{3}$/i.test(value2)
      ? ("#" + [...value2.slice(1)].map((arg5) => arg5.repeat(2)).join("")).toLowerCase()
      : "";
}
export function hexToRgb(arg6) {
  const value3 = normalizedHexColor(arg6) || "#000000";
  return {
    r: Number.parseInt(value3.slice(1, 3), 16),
    g: Number.parseInt(value3.slice(3, 5), 16),
    b: Number.parseInt(value3.slice(5, 7), 16),
  };
}
export function rgbToHex(arg7, arg8, arg9) {
  const fn1 = (arg10) =>
    Math.round(clampNumber(Number(arg10) || 0, 0, 255))
      .toString(16)
      .padStart(2, "0");
  return "#" + fn1(arg7) + fn1(arg8) + fn1(arg9);
}
export function rgbToHsv({ r: arg11, g: arg12, b: arg13 }) {
  const value4 = arg11 / 255,
    value5 = arg12 / 255,
    value6 = arg13 / 255,
    value7 = Math.max(value4, value5, value6),
    value8 = Math.min(value4, value5, value6),
    value9 = value7 - value8;
  let value10 = 0;
  return (
    value9 &&
      (value7 === value4
        ? (value10 = 60 * (((value5 - value6) / value9) % 6))
        : value7 === value5
          ? (value10 = 60 * ((value6 - value4) / value9 + 2))
          : (value10 = 60 * ((value4 - value5) / value9 + 4))),
    value10 < 0 && (value10 += 360),
    {
      h: value10,
      s: value7 ? value9 / value7 : 0,
      v: value7,
    }
  );
}
export function hsvToRgb(arg14, arg15, arg16) {
  const value11 = ((Number(arg14) % 360) + 360) % 360,
    value12 = clampNumber(Number(arg15), 0, 1),
    value13 = clampNumber(Number(arg16), 0, 1),
    value14 = value13 * value12,
    value15 = value11 / 60,
    value16 = value14 * (1 - Math.abs((value15 % 2) - 1)),
    value17 =
      value15 < 1
        ? [value14, value16, 0]
        : value15 < 2
          ? [value16, value14, 0]
          : value15 < 3
            ? [0, value14, value16]
            : value15 < 4
              ? [0, value16, value14]
              : value15 < 5
                ? [value16, 0, value14]
                : [value14, 0, value16],
    value18 = value13 - value14;
  return {
    r: (value17[0] + value18) * 255,
    g: (value17[1] + value18) * 255,
    b: (value17[2] + value18) * 255,
  };
}
export function roundField(arg17) {
  return Number.isFinite(arg17) ? String(Math.round(arg17 * 100) / 100) : "0";
}
export function clampNumber(arg18, arg19, arg20) {
  return Math.max(arg19, Math.min(arg20, arg18));
}
export function normalizedFontWeight(arg21, arg22 = 0.4) {
  const value19 = Number(arg21);
  return Number.isFinite(value19)
    ? value19 > 1
      ? clampNumber((value19 - 1) / 899, 0, 1)
      : clampNumber(value19, 0, 1)
    : arg22;
}
