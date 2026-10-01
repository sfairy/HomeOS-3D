import { normalizeGroundReflection as E } from "./reflection-settings.js?v=20260918-reflection-user-settings-v1-20260918-review-1234-v2";
export function performanceWarnings(a, e) {
  const n = [];
  if (
    (e.renderScale > 1 &&
      e.renderScale > (a.renderScale ?? 1) &&
      n.push("高清渲染需要处理更多画面像素。"),
    e.motionRenderScale >= 0.8 &&
      e.motionRenderScale > (a.motionRenderScale ?? 0) &&
      n.push("较高的转动分辨率会增加旋转和聚焦过渡时的绘制开销。"),
    e.groundReflection)
  ) {
    const f = E(a.groundReflection),
      t = E(e.groundReflection),
      s = (i) => (i.strength === 0 || i.mode === "off" ? 0 : i.mode === "all" ? 2 : 1),
      r = s(f),
      o = s(t);
    (o > r &&
      n.push(o === 2 ? "室内和室外同时反射，需要额外绘制两组倒影。" : "地面反射需要额外绘制倒影。"),
      o &&
        t.resolution > 512 &&
        (t.resolution > f.resolution || !r) &&
        n.push("高反射清晰度会增加倒影的绘制开销和显存占用。"));
  }
  return n;
}
export function confirmPerformanceWarning(a, { document: e = document, signal: n } = {}) {
  return a.length
    ? n?.aborted
      ? Promise.resolve(false)
      : new Promise((f) => {
          const t = e.createElement("dialog");
          ((t.className = "settings-dialog i3d-performance-dialog"),
            t.setAttribute("aria-labelledby", "i3d-performance-title"),
            t.setAttribute("aria-describedby", "i3d-performance-description"));
          const s = e.createElement("h2");
          ((s.id = "i3d-performance-title"), (s.textContent = "画质与流畅度提示"));
          const r = e.createElement("div");
          r.id = "i3d-performance-description";
          for (const d of a) {
            const b = e.createElement("p");
            ((b.textContent = d), r.append(b));
          }
          const o = e.createElement("p");
          ((o.className = "i3d-performance-note"),
            (o.textContent =
              "手机、iPad 或性能较低的设备可能出现掉帧、发热或耗电增加。如果不够流畅，可以降低画质或关闭反射。"),
            r.append(o));
          const i = e.createElement("div");
          i.className = "dialog-actions";
          const c = e.createElement("button"),
            l = e.createElement("button");
          ((c.type = l.type = "button"),
            (c.textContent = "取消"),
            (l.textContent = "继续应用"),
            (l.className = "primary"),
            i.append(c, l),
            t.append(s, r, i));
          let u = false;
          const m = (d) => {
              u || ((u = true), n?.removeEventListener("abort", p), t.close(), t.remove(), f(d));
            },
            p = () => m(false);
          (c.addEventListener("click", p),
            l.addEventListener("click", () => m(true)),
            t.addEventListener("cancel", (d) => {
              (d.preventDefault(), m(false));
            }),
            t.addEventListener("close", () => m(false)),
            n?.addEventListener("abort", p, {
              once: true,
            }),
            e.body.append(t),
            t.showModal(),
            c.focus());
        })
    : Promise.resolve(true);
}
