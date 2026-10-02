const UPDATE_WIKI_URL = "https://wiki.homeos.cn/updates.html#changelog";
export function applyUpdateNotice(noticeLink, noticeBadge, notice) {
  let logUrl;
  try {
    logUrl = new URL(notice?.logUrl);
  } catch {}
  const isTrustedNotice =
    notice?.updateAvailable === true &&
    typeof notice.latestVersion == "string" &&
    logUrl?.origin === "https://wiki.homeos.cn" &&
    logUrl.pathname === "/updates.html" &&
    !logUrl.username &&
    !logUrl.password;
  ((noticeBadge.hidden = !isTrustedNotice),
    (noticeLink.href = isTrustedNotice ? logUrl.href : UPDATE_WIKI_URL),
    (noticeLink.title = isTrustedNotice
      ? "当前 " +
        notice.currentVersion +
        "，最新 " +
        notice.latestVersion +
        "，查看更新日志和升级说明"
      : "查看开发计划与更新日志"),
    isTrustedNotice
      ? noticeLink.setAttribute(
          "aria-label",
          "开发计划与更新日志，有新版本 " + notice.latestVersion,
        )
      : noticeLink.removeAttribute("aria-label"));
}
export function startUpdateNotice(
  linkElement,
  badgeElement,
  {
    fetcher: fetcher = fetch,
    page: pageNode = document,
    schedule: schedule = setInterval,
    cancel: cancel = clearInterval,
  } = {},
) {
  let isFetching = false,
    isDisposed = false,
    abortController;
  async function refreshNotice() {
    if (isFetching || isDisposed || pageNode.hidden) return;
    ((isFetching = true), (abortController = new AbortController()));
    const abortTimer = setTimeout(() => abortController.abort(), 5000);
    try {
      const response = await fetcher("/api/v1/updates", {
        signal: abortController.signal,
        credentials: "same-origin",
        cache: "no-store",
      });
      if (response.ok && !isDisposed) {
        const payload = await response.json();
        isDisposed || applyUpdateNotice(linkElement, badgeElement, payload);
      } else isDisposed || applyUpdateNotice(linkElement, badgeElement, null);
    } catch {
      isDisposed || applyUpdateNotice(linkElement, badgeElement, null);
    } finally {
      (clearTimeout(abortTimer), (isFetching = false));
    }
  }
  const timerId = schedule(refreshNotice, 60 * 1000);
  return (
    pageNode.addEventListener("visibilitychange", refreshNotice),
    refreshNotice(),
    () => {
      ((isDisposed = true),
        abortController?.abort(),
        cancel(timerId),
        pageNode.removeEventListener("visibilitychange", refreshNotice));
    }
  );
}
const updatesLinkElement = globalThis.document?.querySelector("#product-updates-link"),
  updateBadgeElement = globalThis.document?.querySelector("#product-update-badge");
if (updatesLinkElement && updateBadgeElement) {
  let stopNotice = startUpdateNotice(updatesLinkElement, updateBadgeElement);
  (window.addEventListener("pagehide", () => {
    (stopNotice?.(), (stopNotice = null));
  }),
    window.addEventListener("pageshow", () => {
      stopNotice || (stopNotice = startUpdateNotice(updatesLinkElement, updateBadgeElement));
    }));
}
