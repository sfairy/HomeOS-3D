function l(e, t) {
  for (const n of e || []) {
    if (n.id === t) return n;
    const o = l(n.children, t);
    if (o) return o;
  }
  return null;
}
function S(e, t) {
  const n = l(e?.sharedComponents, t);
  if (n) return n;
  for (const o of e?.pages || []) {
    const r = l(o.components, t);
    if (r) return r;
  }
  return null;
}
function m(e, t) {
  const n = l(e?.sharedComponents, t);
  if (n)
    return {
      component: n,
      scope: "shared",
      page: null,
    };
  for (const o of e?.pages || []) {
    const r = l(o.components, t);
    if (r)
      return {
        component: r,
        scope: "page",
        page: o,
      };
  }
  return null;
}
function T(e, t) {
  const n = new Set(t || []),
    o = [],
    r = (i) => {
      for (const s of i || []) (n.has(s.id) && o.push(s), r(s.children));
    };
  r(e?.sharedComponents);
  for (const i of e?.pages || []) r(i.components);
  return o;
}
export function copyComponentTargetPages(e, t) {
  const n = m(e, t);
  return n ? (e?.pages || []).filter((o) => n.scope === "shared" || o !== n.page) : [];
}
export function copyComponentTargets(e, t) {
  const n = m(e, t);
  if (!n) return [];
  const o = copyComponentTargetPages(e, t).map((r) => ({
    key: `page:${r.path}`,
    name: r.name,
    scope: "page",
    page: r,
  }));
  return n.scope === "page"
    ? [
        {
          key: "shared",
          name: "侧边栏",
          scope: "shared",
        },
        ...o,
      ]
    : o;
}
function b(e, t) {
  e.id = t();
  for (const n of e.children || []) b(n, t);
  return e;
}
function x(e, t, n) {
  const r =
      String(n(e) || "控件")
        .trim()
        .replace(/_副本\d*$/, "") || "控件",
    i = new Set((t || []).map((a) => String(n(a)).trim()));
  let s = `${r}_\u526F\u672C`,
    p = 2;
  for (; i.has(s);) ((s = `${r}_\u526F\u672C${p}`), (p += 1));
  return s;
}
function w(e) {
  for (let t = 0; t < (e || []).length; t += 1) {
    const n = e[t];
    n.position = {
      ...(n.position || {}),
      zIndex: e.length - t,
    };
  }
}
function C(e) {
  return Math.round(Number(e) * 1000000) / 1000000;
}
function g(e, t) {
  const n = Number(e);
  return Number.isFinite(n) && n > 0 ? n : t;
}
function P(e, t, n, o, r = true) {
  if (!e || typeof e != "object") return;
  const i = e.position || {},
    s = g(i.width, 100),
    p = g(i.height, 100),
    a = Number.isFinite(Number(i.x)) ? Number(i.x) : 0,
    c = Number.isFinite(Number(i.y)) ? Number(i.y) : 0,
    f = s * (e.type === "interaction3d" ? t : o),
    u = p * (e.type === "interaction3d" ? n : o);
  e.position = {
    ...i,
    x: C(r ? (a + s / 2) * t - f / 2 : a * o),
    y: C(r ? (c + p / 2) * n - u / 2 : c * o),
    width: C(f),
    height: C(u),
  };
  for (const d of e.children || []) P(d, o, o, o, false);
}
function _(e, t, n) {
  const o = g(t?.width, 2778),
    r = g(t?.height, 1940),
    i = g(n?.width, o),
    s = g(n?.height, r),
    p = i / o,
    a = s / r;
  return (P(e, p, a, Math.min(p, a)), e);
}
function N(e, t, n) {
  if (!e || typeof e != "object") return;
  const o = new Set((t?.pages || []).map((i) => i.path)),
    r = new Set((t?.customPopups || []).map((i) => i.id));
  e.properties?.targetPage &&
    !o.has(e.properties.targetPage) &&
    (delete e.properties.targetPage, n?.("navigate"));
  for (const [i, s] of Object.entries(e.actions || {})) {
    const p = s?.type === "navigate" && !o.has(s.target),
      a = s?.type === "more-info" && s.data?.popupSource === "custom" && !r.has(s.data?.popupId);
    (p || a) && (delete e.actions[i], n?.(p ? "navigate" : "popup"));
  }
  for (const i of e.children || []) N(i, t, n);
}
function L(e, t) {
  if (t === "shared") return e.sharedComponents || (e.sharedComponents = []);
  const n = String(t || "").replace(/^page:/, ""),
    o = (e.pages || []).find((r) => r.path === n);
  return o ? o.components || (o.components = []) : null;
}
function $(e, t) {
  if (t.length)
    for (const n of e.pages || [])
      n.sharedComponentIds = [...new Set([...t, ...(n.sharedComponentIds || [])])];
}
export function copyComponentsAcrossDocuments(
  e,
  t,
  n,
  o,
  {
    cloneValue: r = (c) => structuredClone(c),
    createId: i,
    componentLabel: s = (c) => c?.properties?.label || c?.type || "控件",
    scaleMode: p = "none",
    onInvalidAction: a,
  } = {},
) {
  const c = [...new Set(n || [])].filter(Boolean);
  if (!e || !t || !c.length || typeof i != "function") return [];
  const f = T(e, c),
    u = L(t, o);
  if (f.length !== c.length || !u) return [];
  const d = [];
  for (const y of f) {
    const h = b(r(y), i);
    ((h.properties = {
      ...(h.properties || {}),
      label: x(y, [...u, ...d], s),
    }),
      delete h.properties.previewState,
      N(h, t, a),
      (p === "proportional" || h.type === "interaction3d") && _(h, e.canvas, t.canvas),
      d.push(h));
  }
  return (
    u.unshift(...d),
    w(u),
    o === "shared" &&
      $(
        t,
        d.map((y) => y.id),
      ),
    d
  );
}
export function copyComponentAcrossDocuments(e, t, n, o, r = {}) {
  return copyComponentsAcrossDocuments(e, t, [n], o, r)[0] || null;
}
export function copyComponentToPage(
  e,
  t,
  n,
  {
    cloneValue: o = (s) => structuredClone(s),
    createId: r,
    componentLabel: i = (s) => s?.properties?.label || s?.type || "控件",
  } = {},
) {
  if (!e || !t || !n || typeof r != "function") return null;
  const s = S(e, t),
    p = (e.pages || []).find((f) => f.path === n);
  if (!s || !p) return null;
  const a = p.components || (p.components = []),
    c = b(o(s), r);
  return (
    (c.properties = {
      ...(c.properties || {}),
      label: x(s, a, i),
    }),
    delete c.properties.previewState,
    a.unshift(c),
    w(a),
    c
  );
}
export function copyComponentToTarget(e, t, n, o = {}) {
  return copyComponentsToTarget(e, [t], n, o)[0] || null;
}
export function copyComponentsToTarget(e, t, n, o = {}) {
  return copyComponentsAcrossDocuments(e, e, t, n, {
    ...o,
    scaleMode: "none",
  });
}
