export function editorAssetFolders(e) {
  return [...new Set((e || []).map((t) => t.folder).filter(Boolean))].sort((t, b) =>
    t.localeCompare(b, "zh-CN"),
  );
}
export function editorAssetSelectedFolder(e, t) {
  return t.includes(e) ? e : t[0] || "";
}
export function createEditorAssetToolbar({
  documentObject: e,
  getSource: t,
  setSource: b,
  getFolder: f,
  setFolder: A,
  getAssets: E,
  getUploadInput: h,
  canDeleteFolder: m,
  onDeleteFolder: v,
}) {
  return function (s, { toolbar: y, controller: c }) {
    const i = e.createElement("div");
    ((i.className = "asset-source-tabs"),
      i.setAttribute("role", "tablist"),
      i.setAttribute("aria-label", "图片来源"));
    for (const [r, p] of [
      ["user", "我的图片"],
      ["builtin", "栖光素材"],
    ]) {
      const l = e.createElement("button");
      ((l.type = "button"),
        (l.textContent = p),
        (l.dataset.editorAssetSource = r),
        l.addEventListener("click", () => {
          b(s, r);
          const n = editorAssetFolders(E(r));
          (A(s, editorAssetSelectedFolder(f(s), n)),
            c.syncAssetToolbar?.(),
            c.refresh({
              resetPage: true,
            }));
        }),
        i.append(l));
    }
    const a = e.createElement("select");
    ((a.className = "editor-paged-picker-folder"),
      a.setAttribute("aria-label", "选择图片文件夹"),
      a.addEventListener("change", () => {
        (A(s, a.value),
          c.syncAssetToolbar?.(),
          c.refresh({
            resetPage: true,
          }));
      }));
    const o = e.createElement("button");
    ((o.type = "button"),
      (o.className = "asset-folder-delete"),
      (o.textContent = "删除"),
      o.setAttribute("aria-label", "删除当前自动导图文件夹"),
      (o.title = "删除当前自动导图文件夹"),
      o.addEventListener("click", () => v?.(s, a.value)));
    const u = e.createElement("div");
    ((u.className = "editor-paged-picker-folder-row"), u.append(a, o));
    const d = e.createElement("button");
    ((d.type = "button"),
      (d.className = "asset-upload-button"),
      (d.textContent = "上传"),
      d.addEventListener("click", () => h(s).click()),
      y.append(i, u, d),
      (c.syncAssetToolbar = () => {
        const r = t(s);
        for (const n of i.querySelectorAll("[data-editor-asset-source]"))
          n.classList.toggle("active", n.dataset.editorAssetSource === r);
        const p = editorAssetFolders(E(r)),
          l = f(s);
        (a.replaceChildren(...p.map((n) => new Option(n === "." ? "根目录" : n, n))),
          (a.value = l),
          (u.hidden = !p.length),
          (o.hidden = !m?.(r, l)),
          (d.hidden = r !== "user"));
      }),
      c.syncAssetToolbar());
  };
}
