const A = 2,
  D = 4,
  G = 3,
  H = 420,
  L = 470,
  R = 14,
  m = 28,
  y = 88;
export function popupLayoutColumns(arg1) {
  const value1 = Number(arg1?.columns);
  return value1 >= 2 && value1 <= 4 ? value1 : 3;
}
export function popupModuleColumnSpan(arg2) {
  const value2 = typeof arg2 == "string" ? arg2 : arg2?.type,
    value3 = typeof arg2 == "object" ? arg2?.deviceType || arg2?.properties?.deviceType : "";
  return value2 === "electric-bed" ||
    value3 === "electric-bed" ||
    ["climate", "air-purifier", "water-heater", "media-player", "camera", "line-chart"].includes(
      value2,
    )
    ? 2
    : 1;
}
export function popupModuleRowSpan(arg3) {
  const value4 = typeof arg3 == "string" ? arg3 : arg3?.type,
    value5 = typeof arg3 == "object" ? arg3?.deviceType || arg3?.properties?.deviceType : "";
  return 1;
}
function M(arg4, arg5) {
  const list1 = [],
    list2 = [];
  for (const value6 of arg4 || []) {
    const value7 = popupModuleColumnSpan(value6),
      value8 = popupModuleRowSpan(value6);
    if (value7 > arg5) return null;
    let value9 = null;
    const value10 = Math.max(4, (arg4?.length || 0) * 2 + 1);
    for (let value11 = 0; value11 < value10 && !value9; value11 += 1)
      for (let value12 = 0; value12 <= arg5 - value7; value12 += 1)
        if (
          Array.from(
            {
              length: value8,
            },
            (arg6, arg7) =>
              Array.from(
                {
                  length: value7,
                },
                (arg8, arg9) => !list2[value11 + arg7]?.[value12 + arg9],
              ).every(Boolean),
          ).every(Boolean)
        ) {
          value9 = {
            x: value12,
            y: value11,
            width: value7,
            height: value8,
          };
          for (let value13 = 0; value13 < value8; value13 += 1) {
            list2[value11 + value13] || (list2[value11 + value13] = []);
            for (let value14 = 0; value14 < value7; value14 += 1)
              list2[value11 + value13][value12 + value14] = true;
          }
          break;
        }
    if (!value9) return null;
    list1.push(value9);
  }
  return list1;
}
export function packPopupModules(arg10, arg11) {
  const value15 = popupLayoutColumns(arg11),
    value16 = M(arg10, value15) || [],
    value17 = Math.max(
      1,
      value16.reduce((arg12, arg13) => Math.max(arg12, arg13.y + arg13.height), 0),
    );
  return {
    rows: Math.min(value17, 3),
    columns: value15,
    placements: value16,
    fits: value17 <= 3,
  };
}
export function popupLayoutMetrics(arg14, arg15) {
  const value18 = packPopupModules(arg14, arg15),
    value19 = 56 + value18.columns * 420 + (value18.columns - 1) * 14,
    value20 = 56 + value18.rows * 470 + (value18.rows - 1) * 14;
  return {
    ...value18,
    gridWidth: value19,
    gridHeight: value20,
    popupWidth: value19,
    popupHeight: 88 + value20,
  };
}
