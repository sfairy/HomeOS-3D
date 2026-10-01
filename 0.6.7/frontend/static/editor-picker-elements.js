export function createEditorPickerElements({
  entityKindLabel: p,
  entityPickerPrimaryName: d,
  entityPickerText: i,
  enableEntityTextHoverScroll: u,
  assetDisplayName: m,
  assetPreviewUrl: E,
  bindEditorIconNameTooltip: k,
  mdiIconUrl: g,
}) {
  function C(t, o, e) {
    const n = document.createElement("button");
    return (
      (n.type = "button"),
      (n.className = `navigation-icon-option navigation-icon-clear${t ? "" : " selected"}`),
      (n.dataset[e] = ""),
      (n.textContent = o),
      n
    );
  }
  function b(t, o, e) {
    const n = document.createElement("button");
    ((n.type = "button"),
      (n.className = `navigation-icon-option${t.name === o ? " selected" : ""}`),
      (n.dataset[e] = t.name),
      n.setAttribute("aria-label", t.name),
      (n.dataset.iconName = t.name));
    const c = document.createElement("i");
    return (
      c.setAttribute("aria-hidden", "true"),
      (c.style.maskImage = `url("${t.previewUrl}")`),
      (c.style.webkitMaskImage = `url("${t.previewUrl}")`),
      n.append(c),
      k(n, t.name),
      n
    );
  }
  function f(t, o = "未使用图标") {
    const e = String(t || "").trim(),
      n = document.createElement("span");
    ((n.className = "editor-paged-picker-current-icon"), (n.title = e || o));
    const c = document.createElement("i");
    c.setAttribute("aria-hidden", "true");
    const a = g(e);
    (a &&
      (c.style.setProperty("mask-image", `url("${a}")`),
      c.style.setProperty("-webkit-mask-image", `url("${a}")`)),
      n.append(c));
    const r = document.createElement("strong");
    return (
      (r.className = "editor-paged-picker-current-icon-name"),
      (r.textContent = e || o),
      n.append(r),
      n
    );
  }
  function N(t, o) {
    const e = document.createElement("button");
    ((e.type = "button"),
      (e.className = `inspector-entity-option${t.entityId === o ? " selected" : ""}`),
      (e.dataset.editorPickerValue = t.entityId),
      e.setAttribute("role", "option"),
      e.setAttribute("aria-selected", String(t.entityId === o)));
    const n = document.createElement("span");
    ((n.className = "inspector-entity-option-content"), (n.title = i(t)));
    const c = document.createElement("span");
    c.className = "inspector-entity-option-line inspector-entity-name-line";
    const a = document.createElement("span");
    ((a.className = "inspector-entity-kind"), (a.textContent = `[${p(t)}] `));
    const r = document.createElement("span");
    ((r.className = "inspector-entity-name"), (r.textContent = d(t)), c.append(a, r));
    const s = document.createElement("span");
    return (
      (s.className = "inspector-entity-option-line inspector-entity-id"),
      (s.textContent = t.entityId),
      n.append(c, s),
      u(e, c),
      e.append(n),
      e
    );
  }
  function l(t, o = false) {
    const e = document.createElement("button");
    return (
      (e.type = "button"),
      (e.className = `editor-paged-picker-clear${o ? " selected" : ""}`),
      (e.dataset.editorPickerValue = ""),
      (e.textContent = t),
      e
    );
  }
  function x(t = "不使用实体", o = false) {
    const e = l(t, o);
    return ((e.className = "editor-paged-picker-selected-action"), e);
  }
  function y(t, o = false) {
    const e = document.createElement("button");
    return (
      (e.type = "button"),
      (e.className = `editor-paged-picker-selected-action${o ? " selected" : ""}`),
      (e.dataset.editorPickerValue = t.entityId),
      (e.title = i(t)),
      (e.textContent = i(t)),
      e
    );
  }
  function I(t, o = "未选择实体") {
    const e = document.createElement("span");
    e.className = "editor-paged-picker-current-entity";
    const n = document.createElement("span");
    n.className = "editor-paged-picker-current-entity-name";
    const c = document.createElement("span");
    return (
      (c.className = "editor-paged-picker-current-entity-id"),
      t
        ? ((n.textContent = d(t)), (c.textContent = t.entityId || ""), (e.title = i(t)))
        : ((n.textContent = o), (c.textContent = "")),
      e.append(n),
      c.textContent && e.append(c),
      e
    );
  }
  function P(t, o = "未使用图片") {
    const e = document.createElement("span");
    e.className = "editor-paged-picker-current-asset";
    const n = document.createElement("img");
    n.alt = "";
    const c = document.createElement("span");
    return (
      (c.className = "editor-paged-picker-current-asset-name"),
      t
        ? ((n.src = E(t)),
          (c.textContent = m(t) || o),
          (e.title = t.name || t.relativePath || t.assetId || o))
        : ((n.hidden = true), (c.textContent = o)),
      e.append(n, c),
      e
    );
  }
  return Object.freeze({
    createIconPickerClearOption: C,
    createIconPickerOption: b,
    createEditorPickerCurrentIcon: f,
    createEditorEntityPickerOption: N,
    editorPickerClearOption: l,
    editorPickerClearAction: x,
    editorPickerEntityAction: y,
    createEditorPickerCurrentEntity: I,
    createEditorPickerCurrentAsset: P,
  });
}
