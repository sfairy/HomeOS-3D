(() => {
  if (window.HomeOSDisplayStartup) return;
  const basePath = window.HomeOSEmbed?.path || location.pathname;
  if (!basePath.startsWith("/homeos/") && !basePath.startsWith("/display/")) return;
  let projectName;
  try {
    projectName = decodeURIComponent(basePath.slice(basePath.indexOf("/", 1) + 1)).trim();
  } catch {
    return;
  }
  if (!projectName) return;
  const requestsByKey = new Map(),
    activeControllerSet = new Set<AbortController>();
  let isDisposed = false;
  const loadEndpoint = (endpoint) => {
    if (isDisposed) return null;
    if (requestsByKey.has(endpoint)) return requestsByKey.get(endpoint);
    const abortController = new AbortController(),
      abortTimer = setTimeout(() => abortController.abort(), 20000);
    activeControllerSet.add(abortController);
    const pendingResult = (async () => {
      try {
        const fetchResponse = await fetch(`/api/v1${endpoint}?_=${Date.now()}`, {
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache",
            },
            signal: abortController.signal,
          }),
          payload =
            fetchResponse.status === 204
              ? null
              : await fetchResponse.json().catch((parseError) => {
                  if (abortController.signal.aborted) throw parseError;
                  return {};
                });
        return {
          response: fetchResponse,
          payload: payload,
        };
      } finally {
        (clearTimeout(abortTimer), activeControllerSet.delete(abortController));
      }
    })();
    pendingResult.catch(() => {});
    const requestRecord = {
      controller: abortController,
      result: pendingResult,
    };
    return (requestsByKey.set(endpoint, requestRecord), requestRecord);
  };
  ((window.HomeOSDisplayStartup = {
    take(requestUrl) {
      const cacheKey = requestUrl.replace(/\?_=[0-9]+$/, ""),
        cachedRecord = requestsByKey.get(cacheKey);
      return (requestsByKey.delete(cacheKey), cachedRecord);
    },
  }),
    window.addEventListener(
      "pagehide",
      () => {
        isDisposed = true;
        for (const controller of activeControllerSet) controller.abort();
        requestsByKey.clear();
      },
      {
        once: true,
      },
    ),
    basePath.startsWith("/homeos/")
      ? loadEndpoint("/projects")
          .result.then(({ response: response, payload: draftPayload }) => {
            if (!response.ok) return;
            const matchedProjects = (draftPayload?.items || []).filter(
              (projectEntry) => projectEntry.name === projectName,
            );
            matchedProjects.length === 1 &&
              matchedProjects[0].id &&
              loadEndpoint(`/projects/${encodeURIComponent(matchedProjects[0].id)}/draft`);
          })
          .catch(() => {})
      : loadEndpoint(`/projects/${encodeURIComponent(projectName)}/draft`));
  for (const assetEndpoint of ["/assets/version", "/assets/builtin", "/assets/user"])
    loadEndpoint(assetEndpoint);
})();
