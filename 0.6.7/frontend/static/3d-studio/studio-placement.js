import {
  drawingPlanPoints,
  isCourtyardGate,
  syncCourtyardGates,
} from "./courtyard-drawing.js?v=20260927-drawing-v6";
const h = 0.001,
  d = (arg1, arg2, arg3, arg4) => Math.min(arg2, arg4) - Math.max(arg1, arg3);
function x(arg5, arg6, arg7, arg8, arg9, arg10, arg11) {
  const value1 = Math.cos(arg9),
    value2 = Math.sin(arg9);
  return {
    x: arg5,
    y: arg6,
    width: arg7,
    depth: arg8,
    axes: [
      {
        x: value1,
        y: value2,
      },
      {
        x: -value2,
        y: value1,
      },
    ],
    bottom: arg10,
    top: arg10 + arg11,
  };
}
function m(arg12, arg13, arg14 = false) {
  if (
    arg14 &&
    Math.abs(arg12.axes[0].x * arg13.axes[0].y - arg12.axes[0].y * arg13.axes[0].x) > 0.001
  )
    return 0;
  const value3 = d(arg12.bottom, arg12.top, arg13.bottom, arg13.top);
  if (value3 <= h) return 0;
  let value4 = Infinity;
  for (const value5 of [...arg12.axes, ...arg13.axes]) {
    const fn1 = (arg15) =>
        (Math.abs(value5.x * arg15.axes[0].x + value5.y * arg15.axes[0].y) * arg15.width) / 2 +
        (Math.abs(value5.x * arg15.axes[1].x + value5.y * arg15.axes[1].y) * arg15.depth) / 2,
      value6 = arg12.x * value5.x + arg12.y * value5.y,
      value7 = arg13.x * value5.x + arg13.y * value5.y,
      value8 = d(
        value6 - fn1(arg12),
        value6 + fn1(arg12),
        value7 - fn1(arg13),
        value7 + fn1(arg13),
      );
    if (value8 <= h) return 0;
    value4 = Math.min(value4, value8);
  }
  return value4 * value3;
}
function k(arg16, arg17) {
  const list1 = [],
    map1 = new Map((arg16.walls || []).map((arg18) => [arg18.id, arg18]));
  for (const value9 of ["doors", "windows", "railings"])
    for (const value10 of arg16[value9] || []) {
      const value11 = map1.get(value10.wallId);
      if (!value11) continue;
      const value12 = value11.end.x - value11.start.x,
        value13 = value11.end.y - value11.start.y,
        value14 = Math.hypot(value12, value13) / arg17;
      if (!value14) continue;
      const value15 = Math.min(value10.width / 2, value14 / 2),
        value16 = Math.max(value15 / value14, Math.min(1 - value15 / value14, value10.t || 0));
      list1.push({
        key: value9 + ":" + value10.id,
        group: "opening",
        parts: [
          x(
            (value11.start.x + value12 * value16) / arg17,
            (value11.start.y + value13 * value16) / arg17,
            value10.width,
            value11.thickness || 0.2,
            Math.atan2(value13, value12),
            value10.sill || 0,
            value10.height,
          ),
        ],
      });
    }
  for (const value17 of arg16.items || []) {
    if (
      (isCourtyardGate(value17) &&
        list1.push({
          key: "items:" + value17.id,
          group: "gate",
          parts: [
            x(
              value17.x / arg17,
              value17.y / arg17,
              value17.width,
              value17.depth || 0.22,
              ((value17.rotation || 0) * Math.PI) / 180,
              value17.elevation || 0,
              value17.height || 1.55,
            ),
          ],
        }),
      value17.type !== "courtyard-fence")
    )
      continue;
    const value18 = drawingPlanPoints(value17, arg17);
    value17.drawing.closed && value18.length && value18.push(value18[0]);
    const list2 = [];
    for (let value19 = 1; value19 < value18.length; value19++) {
      const value20 = value18[value19 - 1],
        value21 = value18[value19],
        value22 = value21.x - value20.x,
        value23 = value21.y - value20.y,
        value24 = Math.hypot(value22, value23) / arg17;
      value24 <= h ||
        list2.push(
          x(
            (value20.x + value21.x) / 2 / arg17,
            (value20.y + value21.y) / 2 / arg17,
            value24,
            (value17.drawing.thickness || 0.18) * (value17.drawing.style === "hedge" ? 3 : 1),
            Math.atan2(value23, value22),
            value17.elevation || 0,
            value17.height || 1.2,
          ),
        );
    }
    list1.push({
      key: "items:" + value17.id,
      group: "fence",
      parts: list2,
    });
  }
  return list1;
}
function g(arg19, arg20) {
  const value25 = k(arg19, arg20),
    map2 = new Map();
  for (let value26 = 0; value26 < value25.length; value26++)
    for (let value27 = value26; value27 < value25.length; value27++) {
      const value28 = value25[value26],
        value29 = value25[value27];
      if (value28.group !== value29.group || (value26 === value27 && value28.group !== "fence"))
        continue;
      let value30 = 0;
      for (let value31 = 0; value31 < value28.parts.length; value31++)
        for (
          let value32 = value26 === value27 ? value31 + 1 : 0;
          value32 < value29.parts.length;
          value32++
        )
          value30 += m(value28.parts[value31], value29.parts[value32], value28.group === "fence");
      value30 > 0 &&
        map2.set(JSON.stringify([value28.key, value29.key].sort()), {
          amount: value30,
          group: value28.group,
        });
    }
  return map2;
}
export function placementConflict(arg21, arg22, arg23 = 100) {
  const value33 = g(arg21, arg23);
  for (const [value34, value35] of g(arg22, arg23))
    if (!(value35.amount <= (value33.get(value34)?.amount || 0) + 1e-8))
      return value35.group === "opening"
        ? "该位置与已有门、窗户或栏杆重叠，请调整位置或尺寸。"
        : value35.group === "gate"
          ? "该位置与已有庭院门重叠，请调整位置或尺寸。"
          : "围挡与已有围挡或自身线段重叠，请调整路线、位置或尺寸。";
  return "";
}
export function restorePlacementScene(arg24, arg25) {
  for (const value36 of ["items", "walls", "doors", "windows", "railings"]) {
    if (!arg25[value36]) continue;
    const map3 = new Map((arg24[value36] || []).map((arg26) => [arg26.id, arg26]));
    arg24[value36] = arg25[value36].map((arg27) => {
      const value37 = map3.get(arg27.id) || {};
      for (const value38 of Object.keys(value37)) delete value37[value38];
      return Object.assign(value37, structuredClone(arg27));
    });
  }
}
export function validatePlacementChange(arg28, arg29, arg30 = 100) {
  syncCourtyardGates(arg29.items || [], arg30);
  const value39 = placementConflict(arg28, arg29, arg30);
  return (value39 && restorePlacementScene(arg29, arg28), value39);
}
