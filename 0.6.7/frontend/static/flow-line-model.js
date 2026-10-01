export const FLOW_LINE_DEFAULTS = Object.freeze({
    effect: "water",
    shape: "rounded",
    points: [
      [0.08, 0.5],
      [0.92, 0.5],
    ],
    color: "#42d9ef",
    headColor: "#efffff",
    baseColor: "#42d9ef",
    width: 5,
    speed: 90,
    direction: 1,
    controlMode: "manual",
    tail: 58,
    spacing: 130,
    glow: 55,
    opacity: 1,
    baseOpacity: 0.16,
    baseVisible: true,
    headVisible: true,
    animated: true,
    radius: 28,
  }),
  FLOW_LINE_FIELDS = {
    effect: "效果风格",
    shape: "路径形态",
    color: "流光颜色",
    headColor: "光点颜色",
    baseColor: "底线颜色",
    width: "线宽",
    speed: "流速",
    direction: "流动方向",
    tail: "光尾长度",
    spacing: "光点间距",
    glow: "发光强度",
    opacity: "整体透明度",
    baseOpacity: "底线透明度",
    baseVisible: "显示底线",
    headVisible: "显示光点",
    animated: "流动动画",
    radius: "转角半径",
  };
const y = (arg1, arg2) =>
  Number.isFinite(Number(arg1)) && arg1 !== null && arg1 !== "" ? Number(arg1) : arg2;
export const flowClamp = (arg3, arg4, arg5, v1 = arg4) =>
  Math.max(arg4, Math.min(arg5, y(arg3, v1)));
const b = (arg6, arg7) => (/^#[\da-f]{6}$/i.test(String(arg6)) ? arg6 : arg7);
export function normalizeFlowLine(v2 = {}) {
  const FLOW_LINE_DEFAULTS2 = FLOW_LINE_DEFAULTS,
    v3 = v2,
    map = Array.isArray(v3.points)
      ? v3.points
          .slice(0, 256)
          .filter(
            (arg8) =>
              Array.isArray(arg8) &&
              arg8.length >= 2 &&
              arg8.slice(0, 2).every((arg9) => typeof arg9 == "number" && Number.isFinite(arg9)),
          )
          .map((arg10) => arg10.slice(0, 2).map((arg11) => flowClamp(arg11, 0, 1)))
      : FLOW_LINE_DEFAULTS2.points.map((arg12) => [...arg12]);
  return {
    effect: v3.effect === "energy" ? "energy" : "water",
    shape: ["straight", "rounded", "curve"].includes(v3.shape)
      ? v3.shape
      : FLOW_LINE_DEFAULTS2.shape,
    points: map,
    color: b(v3.color, FLOW_LINE_DEFAULTS2.color),
    headColor: b(v3.headColor, FLOW_LINE_DEFAULTS2.headColor),
    baseColor: b(v3.baseColor, FLOW_LINE_DEFAULTS2.baseColor),
    width: flowClamp(v3.width, 1, 40, FLOW_LINE_DEFAULTS2.width),
    speed: flowClamp(v3.speed, 0, 500, FLOW_LINE_DEFAULTS2.speed),
    direction: Number(v3.direction) === -1 ? -1 : 1,
    controlMode: v3.controlMode === "entity-sign" ? "entity-sign" : "manual",
    tail: flowClamp(v3.tail, 2, 300, FLOW_LINE_DEFAULTS2.tail),
    spacing: flowClamp(v3.spacing, 10, 600, FLOW_LINE_DEFAULTS2.spacing),
    glow: flowClamp(v3.glow, 0, 100, FLOW_LINE_DEFAULTS2.glow),
    opacity: flowClamp(v3.opacity, 0, 1, FLOW_LINE_DEFAULTS2.opacity),
    baseOpacity: flowClamp(v3.baseOpacity, 0, 1, FLOW_LINE_DEFAULTS2.baseOpacity),
    radius: flowClamp(v3.radius, 0, 150, FLOW_LINE_DEFAULTS2.radius),
    baseVisible: v3.baseVisible !== false,
    headVisible: v3.headVisible !== false,
    animated: v3.animated !== false,
  };
}
export function flowLineMotion(arg13, arg14) {
  const normalizeFlowLine2 = normalizeFlowLine(arg13),
    v4 = arg14?.newState || arg14;
  let num = 1;
  if (normalizeFlowLine2.controlMode === "entity-sign") {
    const v5 = v4?.state,
      trim = typeof v5 == "number" || typeof v5 == "string" ? String(v5).trim() : "",
      NaN2 = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(trim) ? Number(trim) : NaN;
    num =
      v4?.available === false || arg14?.available === false || !Number.isFinite(NaN2)
        ? 0
        : Math.sign(NaN2);
  }
  return {
    direction:
      normalizeFlowLine2.controlMode === "entity-sign" ? num || 1 : normalizeFlowLine2.direction,
    running: normalizeFlowLine2.animated && normalizeFlowLine2.speed > 0 && num !== 0,
  };
}
export function constrainFlowPoint(arg15, arg16, arg17, v6 = null, v7 = [1, 1]) {
  const map2 = arg15.map((arg18) => flowClamp(arg18, 0, 1));
  if (!arg17 || !arg16)
    return {
      point: map2,
      axis: null,
    };
  const abs = Math.abs(map2[0] - arg16[0]),
    abs2 = Math.abs(map2[1] - arg16[1]);
  return !v6 && Math.max(abs, abs2) < 0.003
    ? {
        point: [...arg16],
        axis: null,
      }
    : ((v6 ||= abs * v7[0] >= abs2 * v7[1] ? "x" : "y"),
      {
        point: v6 === "x" ? [map2[0], arg16[1]] : [arg16[0], map2[1]],
        axis: v6,
      });
}
export function flowLinePath(arg19, v8 = "rounded", v9 = 900, v10 = 520, v11 = 28) {
  const map3 = arg19.map(([v12, v13]) => [v12 * v9, v13 * v10]);
  if (!map3.length) return "";
  let v14 = "M " + map3[0];
  if (map3.length < 2) return v14;
  if (v8 === "straight")
    return (
      v14 +
      map3
        .slice(1)
        .map((arg20) => " L " + arg20)
        .join("")
    );
  if (v8 === "curve") {
    for (let num2 = 0; num2 < map3.length - 1; num2++) {
      const v15 = map3[Math.max(0, num2 - 1)],
        v16 = map3[num2],
        v17 = map3[num2 + 1],
        v18 = map3[Math.min(map3.length - 1, num2 + 2)];
      v14 +=
        " C " +
        v16.map((arg21, arg22) => arg21 + (v17[arg22] - v15[arg22]) / 6) +
        " " +
        v17.map((arg23, arg24) => arg23 - (v18[arg24] - v16[arg24]) / 6) +
        " " +
        v17;
    }
    return v14;
  }
  for (let num3 = 1; num3 < map3.length - 1; num3++) {
    const v19 = map3[num3 - 1],
      v20 = map3[num3],
      v21 = map3[num3 + 1],
      hypot = Math.hypot(v20[0] - v19[0], v20[1] - v19[1]),
      hypot2 = Math.hypot(v21[0] - v20[0], v21[1] - v20[1]),
      min = Math.min(v11, hypot / 2, hypot2 / 2);
    v14 +=
      " L " +
      v20.map((arg25, arg26) => arg25 + ((v19[arg26] - arg25) * min) / (hypot || 1)) +
      " Q " +
      v20 +
      " " +
      v20.map((arg27, arg28) => arg27 + ((v21[arg28] - arg27) * min) / (hypot2 || 1));
  }
  return v14 + (" L " + map3.at(-1));
}
export function applyFlowLineStyle(arg29, arg30, arg31) {
  const normalizeFlowLine3 = normalizeFlowLine(arg29.properties);
  arg30.properties = {
    ...arg30.properties,
  };
  for (const v22 of arg31)
    Object.hasOwn(FLOW_LINE_FIELDS, v22) && (arg30.properties[v22] = normalizeFlowLine3[v22]);
}
export function fitFlowLinePath(arg32, arg33) {
  const options = arg32.position || {},
    num4 = Number(options.width) || 600,
    num5 = Number(options.height) || 300,
    min2 = Math.min(...arg33.map((arg34) => arg34[0])),
    min3 = Math.min(...arg33.map((arg35) => arg35[1])),
    max = Math.max(1, Math.max(...arg33.map((arg36) => arg36[0])) - min2),
    max2 = Math.max(1, Math.max(...arg33.map((arg37) => arg37[1])) - min3),
    v23 = ((Number(options.rotation) || 0) * Math.PI) / 180,
    max3 = Math.max(0.01, Math.min(5, Number(arg32.style?.scale) || 1)),
    v24 = (min2 + max / 2 - num4 / 2) * max3,
    v25 = (min3 + max2 / 2 - num5 / 2) * max3;
  return {
    position: {
      x: (Number(options.x) || 0) + num4 / 2 + v24 * Math.cos(v23) - v25 * Math.sin(v23) - max / 2,
      y: (Number(options.y) || 0) + num5 / 2 + v24 * Math.sin(v23) + v25 * Math.cos(v23) - max2 / 2,
      width: max,
      height: max2,
    },
    points: arg33.map(([v26, v27]) => [(v26 - min2) / max, (v27 - min3) / max2]),
    origin: [min2, min3],
  };
}
