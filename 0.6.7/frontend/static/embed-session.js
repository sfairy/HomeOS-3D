const c = (e) => `ha-bridge:embed:${e.split("?")[0]}`;
export function validEmbedUrl(e, t) {
  if (typeof e != "string") return false;
  const o = /^\/embed\/[A-Za-z0-9_-]{43}\/display\/([A-Za-z0-9_-]+)\?embed=1$/.exec(e);
  return !!(o && (!t || o[1] === t));
}
function a() {
  const e = [];
  for (const t of ["localStorage", "sessionStorage"])
    try {
      window[t] && e.push(window[t]);
    } catch {}
  return e;
}
export function rememberEmbedSession(e, t) {
  if (validEmbedUrl(e))
    for (const o of a())
      for (const n of t.filter(Boolean))
        try {
          o.setItem(c(n), e);
        } catch {}
}
export async function resumeEmbedSession(e, t = fetch, o) {
  if (!/^\/(?:display|habridge)\//.test(e)) return "";
  for (const n of a()) {
    let r;
    try {
      r = n.getItem(c(e));
    } catch {
      continue;
    }
    const l = o || /^\/display\/([A-Za-z0-9_-]+)(?:\?|$)/.exec(e)?.[1];
    if (!validEmbedUrl(r, l)) continue;
    const [f, u] = r.split("/display/"),
      i = new AbortController(),
      m = setTimeout(() => i.abort(), 10000);
    try {
      const s = await t(`${f}/api/v1/projects/${u.split("?")[0]}`, {
        cache: "no-store",
        signal: i.signal,
      });
      if (s.ok) return r;
      (s.status === 401 || s.status === 403 || s.status === 404) && n.removeItem(c(e));
    } catch {
    } finally {
      clearTimeout(m);
    }
  }
  return "";
}
export async function embeddedCookieAvailable(e, t = fetch) {
  const o = new AbortController(),
    n = setTimeout(() => o.abort(), 10000);
  try {
    return (
      await t(`/api/v1/displays/embed-status?projectId=${encodeURIComponent(e)}`, {
        cache: "no-store",
        signal: o.signal,
      })
    ).ok;
  } catch {
    return false;
  } finally {
    clearTimeout(n);
  }
}
