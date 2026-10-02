const buildEmbedSessionKey = (keySource) => `homeos:embed:${keySource.split("?")[0]}`;
export function validEmbedUrl(candidateUrl, expectedDisplayName?) {
  if (typeof candidateUrl != "string") return false;
  const urlMatch = /^\/embed\/[A-Za-z0-9_-]{43}\/display\/([A-Za-z0-9_-]+)\?embed=1$/.exec(
    candidateUrl,
  );
  return !!(urlMatch && (!expectedDisplayName || urlMatch[1] === expectedDisplayName));
}
function collectAvailableStorages() {
  const availableStorages = [];
  for (const storageName of ["localStorage", "sessionStorage"])
    try {
      window[storageName] && availableStorages.push(window[storageName]);
    } catch {}
  return availableStorages;
}
export function rememberEmbedSession(embedUrl, displayNames) {
  if (validEmbedUrl(embedUrl))
    for (const writableStorage of collectAvailableStorages())
      for (const displayName of displayNames.filter(Boolean))
        try {
          writableStorage.setItem(buildEmbedSessionKey(displayName), embedUrl);
        } catch {}
}
export async function resumeEmbedSession(pageUrl, fetchImpl = fetch, providedDisplayName) {
  if (!/^\/(?:display|homeos)\//.test(pageUrl)) return "";
  for (const readableStorage of collectAvailableStorages()) {
    let storedEmbedUrl;
    try {
      storedEmbedUrl = readableStorage.getItem(buildEmbedSessionKey(pageUrl));
    } catch {
      continue;
    }
    const resolvedDisplayName =
      providedDisplayName || /^\/display\/([A-Za-z0-9_-]+)(?:\?|$)/.exec(pageUrl)?.[1];
    if (!validEmbedUrl(storedEmbedUrl, resolvedDisplayName)) continue;
    const [serverOrigin, projectIdWithQuery] = storedEmbedUrl.split("/display/"),
      requestAbortController = new AbortController(),
      requestTimeoutId = setTimeout(() => requestAbortController.abort(), 10000);
    try {
      const response = await fetchImpl(
        `${serverOrigin}/api/v1/projects/${projectIdWithQuery.split("?")[0]}`,
        {
          cache: "no-store",
          signal: requestAbortController.signal,
        },
      );
      if (response.ok) return storedEmbedUrl;
      (response.status === 401 || response.status === 403 || response.status === 404) &&
        readableStorage.removeItem(buildEmbedSessionKey(pageUrl));
    } catch {
    } finally {
      clearTimeout(requestTimeoutId);
    }
  }
  return "";
}
export async function embeddedCookieAvailable(projectId, statusFetchImpl = fetch) {
  const statusAbortController = new AbortController(),
    statusTimeoutId = setTimeout(() => statusAbortController.abort(), 10000);
  try {
    return (
      await statusFetchImpl(
        `/api/v1/displays/embed-status?projectId=${encodeURIComponent(projectId)}`,
        {
          cache: "no-store",
          signal: statusAbortController.signal,
        },
      )
    ).ok;
  } catch {
    return false;
  } finally {
    clearTimeout(statusTimeoutId);
  }
}
