const r = (t) => Math.round(Number(t) * 1000000) / 1000000;
function f(t, s) {
  const o = Number(t);
  return Number.isFinite(o) && o > 0 ? o : s;
}
function y(t, s, o, i, e = true) {
  if (!t || typeof t != "object") return;
  const n = t.position || {},
    u = f(n.width, 100),
    a = f(n.height, 100),
    d = Number.isFinite(Number(n.x)) ? Number(n.x) : 0,
    p = Number.isFinite(Number(n.y)) ? Number(n.y) : 0,
    c = u * (t.type === "interaction3d" ? s : i),
    h = a * (t.type === "interaction3d" ? o : i);
  if (
    ((t.position = {
      ...n,
      x: r(e ? (d + u / 2) * s - c / 2 : d * i),
      y: r(e ? (p + a / 2) * o - h / 2 : p * i),
      width: r(c),
      height: r(h),
    }),
    t.type === "icon-button-effect" && t.properties?.effectLayoutMode !== "fill")
  ) {
    const b = Number(t.properties?.effectWidth),
      N = Number(t.properties?.effectHeight);
    (Number.isFinite(b) && (t.properties.effectWidth = r((b * i) / s)),
      Number.isFinite(N) && (t.properties.effectHeight = r((N * i) / o)));
  }
  for (const b of t.children || []) y(b, i, i, i, false);
}
function w(t) {
  return [...(t.sharedComponents || []), ...(t.pages || []).flatMap((s) => s.components || [])];
}
function x(t, s, o) {
  if (t?.type === "interaction3d" && t.properties?.layoutMode === "fill") return false;
  const i = t?.position || {},
    e = Number(i.x),
    n = Number(i.y),
    u = f(i.width, 100),
    a = f(i.height, 100);
  return !Number.isFinite(e) || !Number.isFinite(n)
    ? false
    : e < 0 || n < 0 || e + u > s || n + a > o;
}
export function countComponentsOutsideCanvas(t, s, o) {
  const i = Number(s),
    e = Number(o);
  return !Number.isFinite(i) || !Number.isFinite(e) ? 0 : w(t).filter((n) => x(n, i, e)).length;
}
export function resizeDashboardDocument(t, s, o, i = {}) {
  const e = JSON.parse(JSON.stringify(t)),
    n = f(e?.canvas?.width, 2778),
    u = f(e?.canvas?.height, 1940),
    a = f(e?.canvas?.resizeBaseWidth, n),
    d = f(e?.canvas?.resizeBaseHeight, u),
    p = f(e?.canvas?.resizeContentScale, Math.min(n / a, u / d)),
    c = Number(s),
    h = Number(o);
  if (!Number.isInteger(c) || c < 320 || c > 7680)
    throw new Error("仪表盘宽度必须为 320 至 7680 之间的整数。");
  if (!Number.isInteger(h) || h < 240 || h > 4320)
    throw new Error("仪表盘高度必须为 240 至 4320 之间的整数。");
  if (c === n && h === u) return e;
  if (i.lockContent) {
    for (const m of w(e)) m.type === "interaction3d" && y(m, c / n, h / u, 1);
    return (
      (e.canvas = {
        ...(e.canvas || {}),
        width: c,
        height: h,
        resizeBaseWidth: r(a),
        resizeBaseHeight: r(d),
        resizeContentScale: r(p),
      }),
      e
    );
  }
  const b = c / n,
    N = h / u,
    z = Math.min(c / a, h / d),
    g = z / p,
    C = w(e);
  for (const m of C) y(m, b, N, g, true);
  return (
    (e.canvas = {
      ...(e.canvas || {}),
      width: c,
      height: h,
      componentScale: r(f(e.canvas?.componentScale, 1) * g),
      popupScale: r(f(e.canvas?.popupScale, 1) * g),
      resizeBaseWidth: r(a),
      resizeBaseHeight: r(d),
      resizeContentScale: r(z),
    }),
    e
  );
}
