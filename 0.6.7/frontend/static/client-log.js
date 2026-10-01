(function (r) {
  "use strict";

  if (r.HABridgeLog || typeof r.fetch != "function") return;
  const S = r.fetch.bind(r),
    $ = "ha-bridge-client-log-v1",
    I = 50,
    N = 120000,
    Z = 900 * 1000,
    m = new WeakSet(),
    x = new WeakSet(),
    z = new Set([
      "page",
      "projectId",
      "componentId",
      "entityId",
      "service",
      "requestId",
      "method",
      "path",
      "status",
      "durationMs",
      "code",
      "line",
      "column",
      "userAgent",
      "phase",
    ]),
    L = /^\/(?:login|setup|pair)(?:\/|$)/.test(r.location.pathname);
  let d = L,
    o = [],
    D = null,
    E = false,
    u = 1000,
    g = 0,
    T = {};
  function y(t) {
    try {
      const e = new URL(String(t || ""), r.location.href);
      if (!["http:", "https:", "ws:", "wss:"].includes(e.protocol))
        return `[${e.protocol.replace(":", "")}]`;
      let n = e.pathname;
      try {
        n = decodeURIComponent(n);
      } catch {}
      return n
        .split(/[?#]/, 1)[0]
        .replace(/\/embed\/[A-Za-z0-9_-]{43}(?=\/|$)/g, "/embed/[session]")
        .replace(/(\/api\/hls\/)[^/]+(?:\/.*)?/gi, "$1[stream]")
        .replace(/[A-Z0-9.!#$%&'*+=^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi, "[email redacted]")
        .replace(/\b(?:eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g, "[redacted]")
        .slice(0, 512);
    } catch {
      return "[invalid path]";
    }
  }
  function l(t, e = 1000) {
    return String(t ?? "")
      .replace(/\/embed\/[A-Za-z0-9_-]{43}(?=\/|$)/g, "/embed/[session]")
      .replace(
        /(\b(?:set-cookie|cookie)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\r\n]+)/gi,
        "$1[redacted]",
      )
      .replace(
        /-----BEGIN[\s\S]*?PRIVATE KEY-----[\s\S]*?-----END[\s\S]*?PRIVATE KEY-----/g,
        "[private key redacted]",
      )
      .replace(/[A-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi, "[email redacted]")
      .replace(/(?:https?|wss?|rtsps?):\/\/[^\s<>"']+/gi, (n) => y(n))
      .replace(/\bBearer\s+[^\s,;"']+/gi, "Bearer [redacted]")
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted]")
      .replace(
        /((?:password|passwd|token|authorization|cookie|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|pairing[_-]?code|activation[_-]?code|recovery[_-]?token|session[_-]?token|private[_-]?key|密码|激活码)\s*["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi,
        "$1[redacted]",
      )
      .replace(/\/api\/hls\/[^\s<>"'?#)]+(?:\?[^\s<>"')]+)?/gi, "/api/hls/[stream]")
      .replace(/(\/[^\s?"'<>]*)\?[^\s"'<>]*/g, "$1")
      .slice(0, e);
  }
  function b(t) {
    const e = {};
    for (const [n, a] of Object.entries(t || {}))
      !z.has(n) ||
        a == null ||
        !["string", "number", "boolean"].includes(typeof a) ||
        (e[n] = ["path", "page"].includes(n)
          ? y(a)
          : typeof a == "number" && Number.isFinite(a)
            ? a
            : l(a, 512));
    return e;
  }
  function O() {
    return r.location.pathname.startsWith("/3d-studio")
      ? "3D 户型编辑器"
      : /^\/(?:display|habridge)\//.test(r.location.pathname)
        ? "展示设备"
        : L
          ? "登录与配对页面"
          : "仪表盘编辑器";
  }
  function C() {
    const t = Date.now() - Z;
    for (o = o.filter((e) => e.queuedAt >= t).slice(-I); o.length && JSON.stringify(o).length > N;)
      o.shift();
  }
  function f() {
    C();
    try {
      o.length ? r.sessionStorage.setItem($, JSON.stringify(o)) : r.sessionStorage.removeItem($);
    } catch {}
  }
  function A(t = 100) {
    D ||
      !o.length ||
      (D = r.setTimeout(() => {
        ((D = null), v());
      }, t));
  }
  function h(t, e, n, a = {}, c = "") {
    const i = {
      level: ["info", "success", "warning", "error"].includes(t) ? t : "error",
      source: O(),
      category: l(e || "界面", 64),
      message: l(n || "未知异常", 1000),
      details: l(c, 8000),
      context: b({
        page: r.location.pathname,
        userAgent: r.navigator?.userAgent || "",
        ...T,
        ...a,
      }),
      clientTimestamp: new Date().toISOString(),
    };
    (d && !["warning", "error"].includes(i.level)) ||
      (o.push({
        event: i,
        queuedAt: Date.now(),
      }),
      f(),
      A());
  }
  function q(t, e = {}, n = "") {
    if (t && typeof t == "object") {
      if (m.has(t)) return;
      m.add(t);
    }
    h("error", "界面", n || t?.message || String(t || "未知异常"), e, t?.stack || "");
  }
  function M(t, e) {
    return (t && typeof t == "object" && x.has(e) && m.add(t), t);
  }
  async function v() {
    if (E || r.navigator?.onLine === false) return;
    if (Date.now() < g) {
      A(g - Date.now());
      return;
    }
    if ((C(), !o.length)) {
      f();
      return;
    }
    const t = (e) => {
      const n = o.indexOf(e);
      n >= 0 && o.splice(n, 1);
    };
    E = true;
    try {
      for (let e = 0; o.length && e < 5; e += 1) {
        const n = o[0];
        if (d && !["warning", "error"].includes(n.event.level)) {
          t(n);
          continue;
        }
        const a = typeof AbortController == "function" ? new AbortController() : null,
          c = r.setTimeout(() => a?.abort(), 8000);
        let i;
        try {
          i = await S(`/api/v1/logs/${d ? "public-events" : "events"}`, {
            method: "POST",
            cache: "no-store",
            keepalive: true,
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(n.event),
            ...(a
              ? {
                  signal: a.signal,
                }
              : {}),
          });
        } finally {
          r.clearTimeout(c);
        }
        if (i.ok) {
          (t(n), (u = 1000));
          continue;
        }
        if (i.status === 401 && !d) {
          ((d = true), (g = Date.now() + 1000));
          break;
        }
        if (i.status === 429 || i.status >= 500) {
          const k = Number(i.headers?.get("Retry-After")) * 1000;
          ((g = Date.now() + Math.min(60000, Math.max(u, k || 0))), (u = Math.min(60000, u * 2)));
          break;
        }
        t(n);
      }
    } catch {
      ((g = Date.now() + u), (u = Math.min(60000, u * 2)));
    } finally {
      ((E = false), f(), A(Math.max(100, g - Date.now())));
    }
  }
  ((r.fetch = async function (e, n = {}) {
    const { hbLogContext: a, ...c } = n || {},
      i = y(typeof e == "string" || e instanceof URL ? e : e?.url);
    if (/^\/api\/v1\/logs(?:\/|$)/.test(i)) return S(e, c);
    const k = Date.now(),
      _ = {
        method: c.method || e?.method || "GET",
        path: i,
        ...b(a),
      };
    try {
      const s = await S(e, c),
        p = Date.now() - k;
      return (
        (!s.ok || p >= 5000) &&
          (h(
            s.ok ? "warning" : "error",
            "网络请求",
            `${s.ok ? "请求耗时较长" : "请求失败"}\uFF1A${_.method} ${i}${s.ok ? "" : `\uFF08HTTP ${s.status}\uFF09`}`,
            {
              ..._,
              status: s.status,
              durationMs: p,
              requestId: s.headers?.get("X-Request-ID") || "",
            },
          ),
          s.ok || x.add(s)),
        s
      );
    } catch (s) {
      const p = c.signal === undefined ? e?.signal : c.signal;
      throw (
        s?.name === "AbortError" ||
          (p?.aborted && s === p.reason) ||
          (h(
            "error",
            "网络请求",
            `\u7F51\u7EDC\u8FDE\u63A5\u5931\u8D25\uFF1A${_.method} ${i}`,
            {
              ..._,
              durationMs: Date.now() - k,
            },
            s?.stack || s?.message || "",
          ),
          s && typeof s == "object" && m.add(s)),
        s
      );
    }
  }),
    (r.HABridgeLog = {
      report: h,
      error: q,
      linkError: M,
      flush: v,
      setContext: (t) => {
        T = b(t);
      },
    }),
    r.addEventListener(
      "error",
      (t) => {
        const e = t.target;
        if (e && e !== r && (e.src || e.href)) {
          h(
            "error",
            "资源加载",
            `\u8D44\u6E90\u52A0\u8F7D\u5931\u8D25\uFF1A${y(e.src || e.href)}`,
            {
              path: e.src || e.href,
              phase: String(e.tagName || "resource").toLowerCase(),
            },
          );
          return;
        }
        q(t.error || new Error(t.message || "页面脚本异常"), {
          path: t.filename || r.location.pathname,
          line: t.lineno,
          column: t.colno,
        });
      },
      true,
    ),
    r.addEventListener("unhandledrejection", (t) => q(t.reason)),
    r.addEventListener("online", () => {
      ((g = 0), v());
    }),
    r.addEventListener("pagehide", () => {
      (f(), v());
    }));
  try {
    const t = JSON.parse(r.sessionStorage.getItem($) || "[]");
    if (Array.isArray(t))
      for (const e of t.slice(-I)) {
        if (!e?.event || !Number.isFinite(e.queuedAt) || Date.now() - e.queuedAt > Z) continue;
        const n = e.event;
        o.push({
          queuedAt: e.queuedAt,
          event: {
            level: ["warning", "error", "info", "success"].includes(n.level) ? n.level : "error",
            source: l(n.source || O(), 64),
            category: l(n.category || "界面", 64),
            message: l(n.message || "未知异常", 1000),
            details: l(n.details, 8000),
            context: b(n.context),
            clientTimestamp: new Date(e.queuedAt).toISOString(),
          },
        });
      }
  } catch {}
  (f(), A());
})(window);
