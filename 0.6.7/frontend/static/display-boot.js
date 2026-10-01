(() => {
  const l = document.documentElement,
    h = new URLSearchParams(location.search).get("capturePreview") === "1",
    b = `ha-bridge:display-theme:${window.HABridgeEmbed?.path || location.pathname}`,
    A = `ha-bridge:display-warm:${window.HABridgeEmbed?.path || location.pathname}`;
  let S = false;
  try {
    S = !h && localStorage.getItem(A) === "1";
  } catch {}
  const $ = /\bHA-Bridge-Apple\/\d/.test(globalThis.navigator?.userAgent || ""),
    d = S || $,
    x = new URLSearchParams(location.search).get("performance-diagnostics") === "1",
    m = (e) => {
      x &&
        console.info(
          "[display-load]",
          JSON.stringify({
            phase: e,
            at: Math.round(performance.now()),
            warm: S,
          }),
        );
    };
  (m("boot"),
    l.classList.toggle("display-warm-start", d),
    l.classList.toggle("capture-preview", h));
  try {
    const e = localStorage.getItem(b);
    (e === "dark" || e === "light") && (l.dataset.displayTheme = e);
  } catch {}
  let n = h ? "done" : "loading",
    p,
    y,
    E,
    k,
    H = performance.now(),
    u = null;
  const w = new Map(),
    r = () => document.getElementById("display-splash"),
    f = () => document.getElementById("display-splash-message"),
    T = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function B() {
    for (const e of [p, y, E, k]) clearTimeout(e);
  }
  function M(e) {
    const s = e?.canvas?.background,
      t = s?.type === "color" ? String(s.color || "") : "";
    let o = "";
    const i = t.match(/^#([\da-f]{3}|[\da-f]{6})$/i),
      a = t.match(/^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)(?:\s*[,/]\s*1(?:\.0*)?)?\s*\)$/i);
    let v;
    if (i) {
      const g = i[1].length === 3 ? [...i[1]].map((c) => c + c).join("") : i[1];
      v = [0, 2, 4].map((c) => parseInt(g.slice(c, c + 2), 16));
    } else a && (v = a.slice(1, 4).map(Number));
    if (v)
      o = v.reduce((g, c, R) => g + c * [0.2126, 0.7152, 0.0722][R], 0) >= 150 ? "light" : "dark";
    else {
      const g = String(e?.theme?.name || "").toLowerCase();
      /(^|[-_])light($|[-_])/.test(g)
        ? (o = "light")
        : /(^|[-_])dark($|[-_])/.test(g) && (o = "dark");
    }
    o ? (l.dataset.displayTheme = o) : delete l.dataset.displayTheme;
    try {
      o ? localStorage.setItem(b, o) : localStorage.removeItem(b);
    } catch {}
  }
  function L(e, s = false) {
    if (n === "done" || n === "error") return;
    (m(s ? "slow-loading" : "load-error"),
      B(),
      (n = s ? "slow" : "error"),
      r()?.classList.remove("is-complete", "is-leaving"),
      r()?.classList.add("is-error"),
      f() && (f().textContent = e?.message || "仪表盘加载失败，请检查网络后重试。"));
    const t = document.getElementById("display-splash-actions");
    t && (t.hidden = false);
    const o = document.getElementById("display-splash-enter");
    o && (o.hidden = !s);
  }
  function q(e = false) {
    if (n === "done" || n === "leaving") return;
    (m(e ? "first-screen-ready" : "manual-entry"),
      B(),
      (n = "leaving"),
      r()?.classList.remove("is-error"),
      r()?.classList.add("is-complete"));
    const s = document.getElementById("display-splash-actions");
    (s && (s.hidden = true),
      f() && (f().textContent = e ? "即将进入你的家…" : "正在进入仪表盘…"),
      (E = setTimeout(
        () => {
          (r()?.classList.add("is-leaving"),
            m("reveal-start"),
            window.dispatchEvent?.(new Event("hb-display-reveal")),
            (E = setTimeout(
              () => {
                const t = r()?.contains(document.activeElement);
                if (
                  (r()?.remove(),
                  l.classList.remove("display-booting"),
                  (n = "done"),
                  m("entered"),
                  e)
                )
                  try {
                    localStorage.setItem(A, "1");
                  } catch {}
                (w.clear(),
                  t &&
                    u?.focus({
                      preventScroll: true,
                    }));
              },
              T() ? 100 : d ? 150 : 550,
            )));
        },
        T() || d ? 0 : 250,
      )));
  }
  function I(e) {
    if (!e.isConnected || e.closest("[hidden]")) return false;
    const s = e.getBoundingClientRect();
    if (
      s.width <= 0 ||
      s.height <= 0 ||
      s.bottom <= 0 ||
      s.right <= 0 ||
      s.top >= innerHeight ||
      s.left >= innerWidth
    )
      return false;
    for (let t = e; t && t !== u; t = t.parentElement) {
      const o = getComputedStyle(t);
      if (o.visibility === "hidden" || o.display === "none" || Number(o.opacity) === 0)
        return false;
    }
    return true;
  }
  function C() {
    const e = ".hb-camera-component, .hb-vacuum-map";
    for (const t of u.querySelectorAll("img[src]"))
      if (!t.closest(e) && I(t) && !t.complete) return true;
    for (const t of u.querySelectorAll(".hb-interaction3d-host")) {
      if (!I(t) || t.dataset.access === "locked" || t.querySelector(".is-load-error")) continue;
      const o = t.querySelector(".hb-interaction3d-runtime");
      if (!o || o.classList.contains("is-loading")) return true;
    }
    let s = false;
    for (const t of u.querySelectorAll('[style*="background"]'))
      if (!(t.closest(e) || !I(t)))
        for (const o of t.style.backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
          const i = o[1];
          if (!w.has(i)) {
            const a = new Image();
            ((a.src = i), w.set(i, a));
          }
          w.get(i).complete || (s = true);
        }
    return s;
  }
  function P(e) {
    if (n !== "loading") return;
    ((u = e),
      (n = "waiting"),
      m("document-ready"),
      clearTimeout(y),
      (y = setTimeout(() => {
        n === "waiting" &&
          (L(new Error("首屏素材加载较慢，准备好后会自动进入，也可以重试或先进入仪表盘。"), true),
          (p = setTimeout(i, 1000)));
      }, 60000)));
    let s = 0;
    const t = d ? 32 : 120,
      o = d ? 32 : 80,
      i = () => {
        if (n !== "waiting" && n !== "slow") return;
        const a = performance.now();
        (C() ? (s = 0) : s || (s = a),
          s && a - s >= t && a - H >= (T() || d ? 0 : 1350)
            ? requestAnimationFrame(() => {
                (n !== "waiting" && n !== "slow") ||
                  (C() ? ((s = 0), (p = setTimeout(i, n === "slow" ? 1000 : o))) : q(true));
              })
            : (p = setTimeout(i, n === "slow" ? 1000 : o)));
      };
    i();
  }
  ((window.HABridgeDisplayBoot = {
    setDocument: M,
    ready: P,
    fail: L,
    get pending() {
      return n !== "done";
    },
    get failed() {
      return n === "error";
    },
  }),
    !h &&
      (window.addEventListener("online", () => {
        n === "error" && location.reload();
      }),
      l.classList.add("display-booting"),
      document.addEventListener("click", (e) => {
        (e.target.closest("#display-splash-retry") && location.reload(),
          e.target.closest("#display-splash-enter") && q());
      }),
      (k = setTimeout(() => {
        (n === "loading" || n === "waiting") &&
          f() &&
          (f().textContent = "正在准备你的家，请稍候…");
      }, 8000)),
      (y = setTimeout(() => L(new Error("仪表盘加载超时，请检查网络后重试。")), 45000)),
      document.addEventListener("focusin", (e) => {
        n !== "done" &&
          document.getElementById("display-shell")?.contains(e.target) &&
          r()?.focus({
            preventScroll: true,
          });
      })));
})();
