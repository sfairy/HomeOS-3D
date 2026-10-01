const d = {
  sunny: ["clear-day", "晴"],
  "clear-night": ["clear-night", "晴"],
  partlycloudy: ["partly-cloudy-day", "多云"],
  cloudy: ["overcast", "阴"],
  rainy: ["rain", "小雨"],
  pouring: ["extreme-rain", "大雨"],
  lightning: ["thunderstorms", "雷电"],
  "lightning-rainy": ["thunderstorms-rain", "雷雨"],
  snowy: ["snow", "下雪"],
  "snowy-rainy": ["sleet", "雨夹雪"],
  fog: ["fog", "雾"],
  windy: ["wind", "大风"],
  "windy-variant": ["wind", "有风"],
  hail: ["hail", "冰雹"],
  exceptional: ["code-red", "异常天气"],
};
export function weatherVisual(arg1, arg2 = "") {
  let value1 = String(arg1 || "")
    .trim()
    .toLowerCase();
  const value2 = arg2 === "below_horizon";
  return (
    value2 && value1 === "sunny" && (value1 = "clear-night"),
    value2 && value1 === "partlycloudy"
      ? ["partly-cloudy-night", "多云"]
      : d[value1] || [
          "code-red",
          value1 && !["unknown", "unavailable"].includes(value1) ? value1 : "天气不可用",
        ]
  );
}
export function meteoconUrl(arg3) {
  const value3 = String(arg3 || "").trim();
  return /^[a-z0-9-]+$/.test(value3)
    ? "/bridge-static/vendor/meteocons/fill/" + value3 + ".svg"
    : "/bridge-static/vendor/meteocons/fill/code-red.svg";
}
function y(arg4, arg5) {
  const value4 = String(arg4 || "").trim();
  return /^(#[\da-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))$/i.test(value4) ? value4 : arg5;
}
const l = ["#ddffc2", "#68cc3e", "#ff8e52", "#ff1a1a"];
function s(arg6, arg7) {
  if (!arg6.length) return NaN;
  const value5 = (arg6.length - 1) * arg7,
    value6 = Math.floor(value5),
    value7 = Math.ceil(value5);
  return value6 === value7
    ? arg6[value6]
    : arg6[value6] + (arg6[value7] - arg6[value6]) * (value5 - value6);
}
export function normalizedThresholds(arg8) {
  return (Array.isArray(arg8) ? arg8 : [])
    .filter((arg9) => Number.isFinite(Number(arg9?.value)))
    .map((arg10) => ({
      value: Number(arg10.value),
      color: y(arg10.color, "#68cc3e"),
    }))
    .sort((arg11, arg12) => arg11.value - arg12.value);
}
export function automaticThresholds(arg13) {
  const value8 = (Array.isArray(arg13) ? arg13 : [])
    .map((arg14) => Number(arg14?.value ?? arg14))
    .filter((arg15) => Number.isFinite(arg15))
    .sort((arg16, arg17) => arg16 - arg17);
  if (!value8.length) return [];
  let value9 = s(value8, value8.length >= 5 ? 0.05 : 0),
    value10 = s(value8, value8.length >= 5 ? 0.95 : 1);
  if (!Number.isFinite(value9) || !Number.isFinite(value10)) return [];
  value10 < value9 && ([value9, value10] = [value10, value9]);
  const value11 = value10 - value9,
    value12 = Math.max(Math.abs(value9), Math.abs(value10), 1) * 1e-9;
  if (value11 <= value12) {
    const value14 = Math.max(Math.abs(value9) * 0.01, 0.01);
    return [
      {
        value: value9 - value14,
        color: l[0],
      },
      {
        value: value9,
        color: l[1],
      },
      {
        value: value9 + value14,
        color: l[2],
      },
      {
        value: value9 + value14 * 2,
        color: l[3],
      },
    ];
  }
  const value13 = value11 / (l.length - 1);
  return l.map((arg18, arg19) => ({
    value: value9 + value13 * arg19,
    color: arg18,
  }));
}
export function resolvedThresholds(arg20, arg21, arg22 = "") {
  const value15 = normalizedThresholds(arg20);
  return arg22 === "auto"
    ? automaticThresholds(arg21)
    : arg22 === "manual" || value15.length
      ? value15
      : automaticThresholds(arg21);
}
export function thresholdColor(arg23, arg24) {
  return (
    arg23.filter((arg25) => arg24 >= arg25.value).at(-1)?.color || arg23[0]?.color || "#68cc3e"
  );
}
export function smoothChartPath(arg26) {
  if (!arg26.length) return "";
  if (arg26.length === 1) return "M0 " + arg26[0].y + " L100 " + arg26[0].y;
  let value16 = "M" + arg26[0].x.toFixed(3) + " " + arg26[0].y.toFixed(3);
  for (let value17 = 0; value17 < arg26.length - 1; value17 += 1) {
    const value18 = arg26[value17],
      value19 = arg26[value17 + 1],
      value20 = arg26[value17 - 1] || value18,
      value21 = arg26[value17 + 2] || value19,
      value22 = value18.x + (value19.x - value20.x) / 6,
      value23 = value18.y + (value19.y - value20.y) / 6,
      value24 = value19.x - (value21.x - value18.x) / 6,
      value25 = value19.y - (value21.y - value18.y) / 6;
    value16 +=
      " C" +
      value22.toFixed(3) +
      " " +
      value23.toFixed(3) +
      " " +
      value24.toFixed(3) +
      " " +
      value25.toFixed(3) +
      " " +
      value19.x.toFixed(3) +
      " " +
      value19.y.toFixed(3);
  }
  return value16;
}
