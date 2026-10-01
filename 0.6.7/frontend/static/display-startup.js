(() => {
  if (window.HABridgeDisplayStartup) return;
  const s = window.HABridgeEmbed?.path || location.pathname;
  if (!s.startsWith("/habridge/") && !s.startsWith("/display/")) return;
  let o;
  try {
    o = decodeURIComponent(s.slice(s.indexOf("/", 1) + 1)).trim();
  } catch {
    return;
  }
  if (!o) return;
  const n = new Map(),
    c = new Set();
  let d = false;
  const a = (t) => {
    if (d) return null;
    if (n.has(t)) return n.get(t);
    const e = new AbortController(),
      r = setTimeout(() => e.abort(), 20000);
    c.add(e);
    const i = (async () => {
      try {
        const l = await fetch(`/api/v1${t}?_=${Date.now()}`, {
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache",
            },
            signal: e.signal,
          }),
          h =
            l.status === 204
              ? null
              : await l.json().catch((f) => {
                  if (e.signal.aborted) throw f;
                  return {};
                });
        return {
          response: l,
          payload: h,
        };
      } finally {
        (clearTimeout(r), c.delete(e));
      }
    })();
    i.catch(() => {});
    const u = {
      controller: e,
      result: i,
    };
    return (n.set(t, u), u);
  };
  ((window.HABridgeDisplayStartup = {
    take(t) {
      const e = t.replace(/\?_=[0-9]+$/, ""),
        r = n.get(e);
      return (n.delete(e), r);
    },
  }),
    window.addEventListener(
      "pagehide",
      () => {
        d = true;
        for (const t of c) t.abort();
        n.clear();
      },
      {
        once: true,
      },
    ),
    s.startsWith("/habridge/")
      ? a("/projects")
          .result.then(({ response: t, payload: e }) => {
            if (!t.ok) return;
            const r = (e?.items || []).filter((i) => i.name === o);
            r.length === 1 && r[0].id && a(`/projects/${encodeURIComponent(r[0].id)}/draft`);
          })
          .catch(() => {})
      : a(`/projects/${encodeURIComponent(o)}/draft`));
  for (const t of ["/assets/version", "/assets/builtin", "/assets/user", "/ui-packs"]) a(t);
})();
