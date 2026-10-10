/**
 * 展示页启动期预取层：在 3D 引导模块求值前，把草稿与资源清单的请求先发出去。
 *
 * 由 `DisplayView.vue` 在 `onMounted` 调 `bootDisplayStartup()`、`onBeforeUnmount` 调
 * `teardownDisplayStartup()`：
 *  - 目标路径（`/homeos/:name` vs `/display/:projectId`）在 boot 时才读取 —— 视图现在是
 *    可重入路由，同一份模块可能先后服务不同项目，import 期定死的 `basePath` 会取到上一个；
 *  - 预取缓存（`requestsByKey`）与在途请求在 teardown 时清空/中断，避免把上一个项目的
 *    草稿响应交给下一个视图（`take()` 是「取走即删」，重入时重新预取即可）。
 *
 * 对外契约：`window.HomeOSDisplayStartup = { take(requestUrl) }`（`display.ts` 依赖）。
 */
let disposeActiveStartup: (() => void) | null = null;

/** 起一次展示页预取（重复调用会先回收上一次）。非展示路径下是空操作。 */
export function bootDisplayStartup(): void {
  teardownDisplayStartup();

  const basePath = location.pathname;
  if (!basePath.startsWith("/homeos/") && !basePath.startsWith("/display/")) return;
  let projectName;
  try {
    projectName = decodeURIComponent(basePath.slice(basePath.indexOf("/", 1) + 1)).trim();
  } catch {
    return;
  }
  if (!projectName) return;
  const requestsByKey = new Map<string, any>(),
    activeControllerSet = new Set<AbortController>();
  let isDisposed = false;
  const loadEndpoint = (endpoint: any) => {
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
  const handlePageHide = () => {
    isDisposed = true;
    for (const controller of activeControllerSet) controller.abort();
    requestsByKey.clear();
  };
  ((window.HomeOSDisplayStartup = {
    take(requestUrl: string) {
      const cacheKey = requestUrl.replace(/\?_=[0-9]+$/, ""),
        cachedRecord = requestsByKey.get(cacheKey);
      return (requestsByKey.delete(cacheKey), cachedRecord);
    },
  }),
    window.addEventListener("pagehide", handlePageHide, {
      once: true,
    }),
    basePath.startsWith("/homeos/")
      ? loadEndpoint("/projects")
          .result.then(({ response: response, payload: draftPayload }: any) => {
            if (!response.ok) return;
            const matchedProjects = (draftPayload?.items || []).filter(
              (projectEntry: any) => projectEntry.name === projectName,
            );
            matchedProjects.length === 1 &&
              matchedProjects[0].id &&
              loadEndpoint(`/projects/${encodeURIComponent(matchedProjects[0].id)}/draft`);
          })
          .catch(() => {})
      : loadEndpoint(`/projects/${encodeURIComponent(projectName)}/draft`));
  for (const assetEndpoint of ["/assets/version", "/assets/builtin", "/assets/user"])
    loadEndpoint(assetEndpoint);

  disposeActiveStartup = () => {
    window.removeEventListener("pagehide", handlePageHide);
    isDisposed = true;
    for (const controller of activeControllerSet) controller.abort();
    requestsByKey.clear();
  };
}

/** 回收预取层：中断在途请求、清空缓存、撤下全局契约。 */
export function teardownDisplayStartup(): void {
  const dispose = disposeActiveStartup;
  disposeActiveStartup = null;
  dispose?.();
  delete (window as any).HomeOSDisplayStartup;
}
