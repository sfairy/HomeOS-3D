const g = "https://wiki.habridge.cn/updates.html#changelog";
export function applyUpdateNotice(arg1, arg2, arg3) {
  let value1;
  try {
    value1 = new URL(arg3?.logUrl);
  } catch {}
  const value2 =
    arg3?.updateAvailable === true &&
    typeof arg3.latestVersion == "string" &&
    value1?.origin === "https://wiki.habridge.cn" &&
    value1.pathname === "/updates.html" &&
    !value1.username &&
    !value1.password;
  ((arg2.hidden = !value2),
    (arg1.href = value2 ? value1.href : g),
    (arg1.title = value2
      ? "当前 " + arg3.currentVersion + "，最新 " + arg3.latestVersion + "，查看更新日志和升级说明"
      : "查看开发计划与更新日志"),
    value2
      ? arg1.setAttribute("aria-label", "开发计划与更新日志，有新版本 " + arg3.latestVersion)
      : arg1.removeAttribute("aria-label"));
}
export function startUpdateNotice(
  arg4,
  arg5,
  {
    fetcher: arg6 = fetch,
    page: arg7 = document,
    schedule: arg8 = setInterval,
    cancel: arg9 = clearInterval,
  } = {},
) {
  let value3 = false,
    value4 = false,
    value5;
  async function fn1() {
    if (value3 || value4 || arg7.hidden) return;
    ((value3 = true), (value5 = new AbortController()));
    const value7 = setTimeout(() => value5.abort(), 5000);
    try {
      const value8 = await arg6("/api/v1/updates", {
        signal: value5.signal,
        credentials: "same-origin",
        cache: "no-store",
      });
      if (value8.ok && !value4) {
        const value9 = await value8.json();
        value4 || applyUpdateNotice(arg4, arg5, value9);
      } else value4 || applyUpdateNotice(arg4, arg5, null);
    } catch {
      value4 || applyUpdateNotice(arg4, arg5, null);
    } finally {
      (clearTimeout(value7), (value3 = false));
    }
  }
  const value6 = arg8(fn1, 60 * 1000);
  return (
    arg7.addEventListener("visibilitychange", fn1),
    fn1(),
    () => {
      ((value4 = true),
        value5?.abort(),
        arg9(value6),
        arg7.removeEventListener("visibilitychange", fn1));
    }
  );
}
const c = globalThis.document?.querySelector("#product-updates-link"),
  u = globalThis.document?.querySelector("#product-update-badge");
if (c && u) {
  let e = startUpdateNotice(c, u);
  (window.addEventListener("pagehide", () => {
    (e?.(), (e = null));
  }),
    window.addEventListener("pageshow", () => {
      e || (e = startUpdateNotice(c, u));
    }));
}
