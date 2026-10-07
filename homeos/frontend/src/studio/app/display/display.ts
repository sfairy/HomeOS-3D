/**
 * 展示页引导脚本（`/`、`/display/:projectId`、`/homeos/:name`）。
 *
 * 由 `DisplayView.vue` 在 `onMounted` 调 `bootDisplay()`、`onBeforeUnmount` 调 `teardownDisplay()`。
 * **已从「模块求值即执行的一次性脚本」改为可重入引导**：视图现在是 shell 内的路由，会被反复进出，
 * 因此 DOM 契约查询、宿主判定（整屏 vs 嵌入总览）、全局状态都在 boot 时重建，监听/定时器/观察者
 * 与 `PanelRenderer` 在 teardown 时回收。
 *
 * 引导体沿用原文件逐行搬入（未重新缩进），以保证移植语义零偏差；仅把顶层状态改为 boot 局部、
 * 把匿名处理器提为具名（否则 `removeEventListener` 无法命中）。
 */
import { PanelRenderer } from "../renderer/core/renderer";
import { createButtonSound } from "../shared/sound-effects";
import { syncAppleDisplaySurface } from "./display-surface";
import type { DomControl } from "@app/utils/dom-control";
import { navigateInShell } from "../../runtime/shell-navigation";

let disposeActiveDisplay: (() => void) | null = null;

/** 引导展示页（重复调用会先回收上一次）。 */
export function bootDisplay(): void {
  teardownDisplay();

  const displayRootElement = document.querySelector<DomControl>("#display-root"),
  displayShellElement = document.querySelector<DomControl>("#display-shell"),
  /**
   * 本引导脚本的副作用（全局监听、定时器、bootstrap 请求）全部假定 `#display-shell` /
   * `#display-root` 契约存在。它由 `DisplayView.vue` 在 `onMounted` 里动态 `import()`，而这条
   * import 链是异步的（display-boot → display-startup → hls → display）。若在引导前视图已经卸载
   * —— 守卫重定向（未登录/未激活去 /login）、用户提前点走、dev 期热重载 —— 文档里已经没有任何
   * 展示页节点，两个 querySelector 都是 null，此时再初始化只会刷出两类「Uncaught TypeError」
   * 且对页面毫无收益：
   *   · `window.resize` → syncViewportSize 写 `null.style`（boot-guard 的首帧轻推就会触发）；
   *   · bootstrap 失败 → 兜底渲染在 `null` 上调用 `replaceChildren`。
   * 因此契约缺失时整体跳过初始化，等下一次真实挂载（同一模块会被重新 boot）再起。
   */
  hasDisplayDomContract = !!displayRootElement && !!displayShellElement,
  isCapturePreview = new URLSearchParams(window.location.search).get("capturePreview") === "1";
document.documentElement.classList.toggle("capture-preview", isCapturePreview);
// 展示端有两种宿主：独立整屏大屏（`/display/:projectId`、`/homeos/:name`）与
// **总览首页 `/`**（嵌进 MainLayout 的内容区）。前者按视口定尺，后者必须按父容器定尺
// —— 否则 100vw×100vh 会把顶栏、右侧栏与页脚一起盖住。
const isEmbeddedOverview = !(
  window.location.pathname.startsWith("/display/") ||
  window.location.pathname.startsWith("/homeos/")
);
document.documentElement.classList.toggle("display-embedded", isEmbeddedOverview);

/**
 * 展示端强制 3D 面板背景透明。
 *
 * 模板默认值（bridge/definition.ts）与历史项目文档都可能带 `backgroundVisible: true`，
 * 那会在场景里铺一块不透明地面 + 网格，挡住下方的开关灯背景图。WebGL 通路本身已是
 * alpha 合成（alpha:true + clearAlpha 0），因此只要把 backgroundVisible 归一成 false，
 * 房子周围就会透出背景图。这里在渲染前统一改写；编辑端走的是另一条通路，不受影响。
 */
function normalizeDisplayDocument(documentPayload: any): any {
  if (!documentPayload || typeof documentPayload !== "object") return documentPayload;
  const collections: any[][] = [
    Array.isArray(documentPayload.sharedComponents) ? documentPayload.sharedComponents : [],
  ];
  for (const page of Array.isArray(documentPayload.pages) ? documentPayload.pages : []) {
    collections.push(Array.isArray(page?.components) ? page.components : []);
  }
  for (const components of collections) {
    for (const component of components) {
      if (component?.type !== "interaction3d") continue;
      const properties = component.properties || (component.properties = {});
      if (properties.backgroundVisible !== false) properties.backgroundVisible = false;
    }
  }
  return documentPayload;
}
let project: any = null,
  lastRevision: any = null,
  lastGlobalPopupRevision: any = null,
  panelRenderer: any = null;
const buttonSound = createButtonSound();
let embeddedResizeObserver: ResizeObserver | null = null,
  refreshPromise: any = null,
  loadedAssetsVersion: any = null,
  entityRecords: any = [],
  deviceRecords: any = [],
  translationResources: Record<string, any> = {},
  syncPromise: any = null,
  lastSyncFingerprint: any = null,
  hasTranslations = false,
  lastCatalogFingerprint: any = null,
  lastAssetsCheckAt = 0,
  assetsVersion: any = null;
const isEmbeddedFrame = window.self !== window.top;
let visibleBounds: any = null;
function isAppleMobile() {
  const userAgent = navigator.userAgent || "";
  return (
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && Number(navigator.maxTouchPoints || 0) > 1)
  );
}
function syncViewportSize() {
  // 见文件头契约说明：视图已卸载时本函数只剩「让 resize 抛 null.style」这一副作用。
  const displayShell = displayShellElement;
  if (!displayShell) return;
  const shouldUseScreenSize = !isEmbeddedFrame && isAppleMobile(),
    // 嵌入总览时改用父容器（MainLayout 内容区）的布局尺寸：clientWidth/Height 不受
    // ScaledViewport 的 transform: scale 影响，得到的正是 #display-shell 需要的未缩放尺寸。
    embeddedParentElement = isEmbeddedOverview ? displayShell.parentElement : null;
  let widthPx = Math.round(
      Number(shouldUseScreenSize ? window.screen?.width : window.visualViewport?.width) ||
        Number(window.innerWidth) ||
        Number(document.documentElement.clientWidth),
    ),
    heightPx = Math.round(
      Number(shouldUseScreenSize ? window.screen?.height : window.visualViewport?.height) ||
        Number(window.innerHeight) ||
        Number(document.documentElement.clientHeight),
    );
  (shouldUseScreenSize &&
    window.innerWidth >= window.innerHeight !== widthPx >= heightPx &&
    ([widthPx, heightPx] = [heightPx, widthPx]),
    // 嵌入总览：以父容器尺寸覆盖视口尺寸（父容器尚未布局出尺寸时保留视口值兜底）。
    embeddedParentElement &&
      embeddedParentElement.clientWidth > 0 &&
      embeddedParentElement.clientHeight > 0 &&
      ((widthPx = Math.round(embeddedParentElement.clientWidth)),
      (heightPx = Math.round(embeddedParentElement.clientHeight))),
    !(!widthPx || !heightPx) &&
      (isEmbeddedFrame &&
        visibleBounds &&
        ((widthPx = Math.min(widthPx, visibleBounds.width)),
        (heightPx = Math.min(heightPx, visibleBounds.height)),
        (displayShell.style.left = visibleBounds.left + "px"),
        (displayShell.style.top = visibleBounds.top + "px")),
      (displayShell.style.width = widthPx + "px"),
      (displayShell.style.height = heightPx + "px"),
      panelRenderer?.resize(),
      shouldUseScreenSize &&
        ((document.documentElement.style.width = widthPx + "px"),
        (document.documentElement.style.height = heightPx + "px"),
        (document.body.style.width = widthPx + "px"),
        (document.body.style.height = heightPx + "px"))));
}
/** 带业务错误码的请求错误（后端 detail.code 原样带出）。 */
type DisplayRequestError = Error & { code?: string };

/**
 * 嵌入总览时用 ResizeObserver 跟随父容器（MainLayout 内容区）尺寸。
 *
 * `window.resize` 只在窗口尺寸变化时触发；而右栏折叠、页脚内容增减、顶栏换行
 * 都会改变内容区尺寸，因此必须额外观察父容器，否则 `#display-shell` 会保持旧尺寸。
 */
function observeEmbeddedParent() {
  if (!isEmbeddedOverview || typeof ResizeObserver !== "function") return;
  const embeddedParentElement = displayShellElement?.parentElement;
  if (!embeddedParentElement) return;
  embeddedResizeObserver?.disconnect();
  embeddedResizeObserver = new ResizeObserver(() => syncViewportSize());
  embeddedResizeObserver.observe(embeddedParentElement);
}

async function apiRequest(path: any) {
  const separator = path.includes("?") ? "&" : "?",
    startupEntry = window.HomeOSDisplayStartup?.take!(path)!,
    abortController = startupEntry?.controller || new AbortController(),
    abortTimeoutId = startupEntry ? null : window.setTimeout(() => abortController.abort(), 20000);
  try {
    const response = startupEntry
        ? (await startupEntry.result).response
        : await fetch("/api/v1" + path + separator + "_=" + Date.now(), {
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache",
            },
            signal: abortController.signal,
          }),
      payload = startupEntry
        ? (await startupEntry.result).payload
        : response.status === 204
          ? null
          : await response.json().catch((parseError) => {
              if (abortController.signal.aborted) throw parseError;
              return {};
            });
    // 展示页与总览共用同一登录会话（配对码机制已移除）：未登录回登录页（shell 内路由）。
    if (response.status === 401) return (navigateInShell("/login"), null);
    if (response.status === 403 && payload?.detail?.code === "LICENSE_RESTRICTED") {
      navigateInShell("/activate");
      const licenseRestrictedError: DisplayRequestError = new Error(
        payload.detail.message || "授权后台正在验证，请稍后重试。",
      );
      throw ((licenseRestrictedError.code = "LICENSE_RESTRICTED"), licenseRestrictedError);
    }
    if (!response.ok) {
      const errorDetail = payload?.detail,
        requestError: DisplayRequestError = new Error(
          typeof errorDetail == "string" ? errorDetail : errorDetail?.message || "请求失败。",
        );
      throw (
        (requestError.code = errorDetail?.code || ""),
        window.HomeOSLog?.linkError!(requestError, response)! || requestError
      );
    }
    return payload;
  } catch (caughtError: any) {
    throw abortController.signal.aborted
      ? new Error("仪表盘更新请求超时，请检查网络连接。")
      : caughtError;
  } finally {
    window.clearTimeout(abortTimeoutId!);
  }
}
async function refreshCatalog() {
  return (
    syncPromise ||
    ((syncPromise = (async () => {
      const syncStatus = await apiRequest("/ha/sync/status");
      if (!syncStatus) return;
      const fingerprint = syncStatus.configured
          ? JSON.stringify([
              Number.isFinite(Number(syncStatus.catalogRevision))
                ? Number(syncStatus.catalogRevision)
                : syncStatus.lastFullSyncAt || "",
              Number(syncStatus.counts?.entities || 0),
              Number(syncStatus.counts?.devices || 0),
              Number(syncStatus.counts?.areas || 0),
            ])
          : "not-configured",
        hasCatalogChange = fingerprint !== lastSyncFingerprint,
        shouldRefreshTranslations = !!(
          syncStatus.configured &&
          syncStatus.connected &&
          (!hasTranslations || hasCatalogChange)
        );
      if (!(!hasCatalogChange && !shouldRefreshTranslations)) {
        if (!syncStatus.configured) {
          ((entityRecords = []),
            (deviceRecords = []),
            (translationResources = {}),
            (lastSyncFingerprint = fingerprint),
            (hasTranslations = true),
            pushCatalogToRenderer());
          return;
        }
        if (hasCatalogChange) {
          const entityAccumulator: any[] = [];
          let offset = 0,
            total = 0;
          do {
            const entityPage = await apiRequest("/ha/entities?limit=500&offset=" + offset);
            if (!entityPage) return;
            (entityAccumulator.push(...(entityPage.items || [])),
              (total = Number(entityPage.total || 0)),
              (offset += Number(entityPage.limit || 500)));
          } while (entityAccumulator.length < total);
          entityRecords = entityAccumulator;
          const deviceResponse = await apiRequest("/ha/devices").catch(() => null);
          (deviceResponse && (deviceRecords = deviceResponse.items || []),
            (lastSyncFingerprint = fingerprint));
        }
        if (shouldRefreshTranslations) {
          const translationResponse = await apiRequest("/ha/translations").catch(() => null);
          translationResponse
            ? ((translationResources = translationResponse.resources || {}),
              (hasTranslations = true))
            : (hasTranslations = false);
        }
        pushCatalogToRenderer();
      }
    })().finally(() => {
      syncPromise = null;
    })),
    syncPromise)
  );
}
function buildCatalogFingerprint() {
  const entityRows = entityRecords.map((entity: any) => [
      entity.entityId || "",
      entity.domain || "",
      entity.name || "",
      entity.icon || "",
      entity.deviceId || "",
      entity.platform || "",
      entity.translationKey || "",
      entity.uniqueId || "",
      entity.originalName || "",
      entity.status || "",
      entity.disabledBy || "",
    ]),
    deviceRows = deviceRecords.map((device: any) => [
      device.deviceId || "",
      device.name || "",
      device.manufacturer || "",
      device.model || "",
      device.status || "",
    ]),
    translationEntries = Object.entries(translationResources).sort(
      ([firstLocale], [secondLocale]) => firstLocale.localeCompare(secondLocale),
    );
  return JSON.stringify([entityRows, deviceRows, translationEntries]);
}
function pushCatalogToRenderer() {
  if (!panelRenderer) return;
  const catalogFingerprint = buildCatalogFingerprint();
  catalogFingerprint !== lastCatalogFingerprint &&
    ((lastCatalogFingerprint = catalogFingerprint),
    panelRenderer.setEntityCatalog(entityRecords, translationResources, deviceRecords));
}
async function resolveOverviewProject() {
  // 总览首页（`/`）：展示「当前活动仪表盘」。
  //
  // 由后端 `GET /projects/active` 单源解析（偏好键 → 最近更新的项目），前端不再把
  // `/projects` 的 id 与 `/config/project/active` 的 `activeProfileId` 对一遍 ——
  // 那是布局方案的 id 空间（如 `default`），与仪表盘 UUID 不是一回事，比对必然落空。
  try {
    const activeResponse = await apiRequest("/projects/active");
    return activeResponse?.active || null;
  } catch {
    // 前后端版本错位（旧后端没有这个端点）时退化为「列表首项」，即旧实现的等价兜底；
    // 正常路径只有一次请求，且不存在 id 空间交叉比对。
    const projectsResponse = await apiRequest("/projects");
    const projectItems = projectsResponse?.items || [];
    return projectItems.length ? projectItems[0] : null;
  }
}
async function resolveProject() {
  const pathname = window.location.pathname;
  if (pathname.startsWith("/display/"))
    return {
      id: decodeURIComponent(pathname.slice(9)),
      name: "",
    };
  if (pathname.startsWith("/homeos/")) {
    const projectName = decodeURIComponent(pathname.slice("/homeos/".length)).trim();
    if (!projectName) throw new Error("仪表盘名称不能为空。");
    const projectsResponse = await apiRequest("/projects");
    if (!projectsResponse) return null;
    const projectMatches = (projectsResponse.items || []).filter(
      (projectCandidate: any) => projectCandidate.name === projectName,
    );
    if (!projectMatches.length) throw new Error("找不到仪表盘“" + projectName + "”。");
    if (projectMatches.length > 1)
      throw new Error("仪表盘名称“" + projectName + "”重复，请先在编辑器中改名。");
    return projectMatches[0];
  }
  // 总览首页：无路径参数，按当前活动仪表盘展示。
  const overviewProject = await resolveOverviewProject();
  if (!overviewProject) {
    // 用独立错误码与「加载失败」区分：全新安装本就没有仪表盘，这是**正常空状态**，
    // 不该走整屏失败 splash（见 handleDisplayError 里的 NO_DASHBOARD 分支）。
    const noDashboardError: DisplayRequestError = new Error(
      "还没有可展示的仪表盘。请以管理员身份进入「设置 → 布局」打开仪表盘编辑器创建。",
    );
    throw ((noDashboardError.code = "NO_DASHBOARD"), noDashboardError);
  }
  return overviewProject;
}
async function refreshDisplay() {
  if (project)
    return (
      refreshPromise ||
      ((refreshPromise = (async () => {
        refreshCatalog().catch(() => null);
        const assetsPromise = panelRenderer
          ? null
          : Promise.all([
              apiRequest("/assets/version"),
              apiRequest("/assets/builtin"),
              apiRequest("/assets/user"),
            ])
              .then(([versionResponse, builtinResponse, userResponse]) => ({
                versions: versionResponse,
                builtin: builtinResponse,
                user: userResponse,
              }))
              .catch((assetsError) => ({
                error: assetsError,
              }));
        let revisionResponse: any = null,
          hasAssetsChange = loadedAssetsVersion !== assetsVersion;
        if (panelRenderer) {
          if (
            ((revisionResponse = await apiRequest(
              "/projects/" + encodeURIComponent(project.id) + "/revision",
            )),
            !revisionResponse)
          )
            return;
          const now = Date.now();
          if (now - lastAssetsCheckAt >= 30000) {
            const assetsVersionResponse = await apiRequest("/assets/version");
            if (!assetsVersionResponse) return;
            const assetsKey =
              (assetsVersionResponse.builtin || "") + ":" + (assetsVersionResponse.user || "");
            ((hasAssetsChange = loadedAssetsVersion !== assetsKey),
              (assetsVersion = assetsKey),
              (lastAssetsCheckAt = now));
          }
          if (
            !hasAssetsChange &&
            revisionResponse.revision === lastRevision &&
            revisionResponse.globalPopupRevision === lastGlobalPopupRevision
          )
            return;
        }
        const draftResponse = await apiRequest(
          "/projects/" + encodeURIComponent(project.id) + "/draft",
        );
        if (!draftResponse) return;
        const displayDocument = normalizeDisplayDocument(draftResponse.document);
        (window.HomeOSDisplayBoot?.setDocument!(displayDocument),
          syncAppleDisplaySurface(displayDocument),
          buttonSound.setEnabled(displayDocument?.soundEnabled !== false));
        let targetAssetsVersion = assetsVersion,
          builtinAssets: any = null,
          userAssets: any = null;
        if (!panelRenderer && assetsPromise) {

          const assetsBundle: any = await assetsPromise;
          if (assetsBundle.error) throw assetsBundle.error;
          const versionsPayload = assetsBundle.versions;
          ((targetAssetsVersion =
            (versionsPayload?.builtin || "") + ":" + (versionsPayload?.user || "")),
            (assetsVersion = targetAssetsVersion),
            (lastAssetsCheckAt = Date.now()),
            (builtinAssets = assetsBundle.builtin),
            (userAssets = assetsBundle.user));
        } else {
          if (hasAssetsChange || loadedAssetsVersion !== targetAssetsVersion) {
            const fetchedAssetsVersion = assetsVersion ? null : await apiRequest("/assets/version");
            if (
              ((targetAssetsVersion = fetchedAssetsVersion
                ? (fetchedAssetsVersion.builtin || "") + ":" + (fetchedAssetsVersion.user || "")
                : targetAssetsVersion),
              (assetsVersion = targetAssetsVersion),
              (lastAssetsCheckAt = Date.now()),
              ([builtinAssets, userAssets] = await Promise.all([
                apiRequest("/assets/builtin"),
                apiRequest("/assets/user"),
              ])),
              !builtinAssets || !userAssets)
            )
              return;
          }
        }
        const title = project.name || draftResponse.document?.name || "全屋智能家居";
        if (
          ((document.title = title + " · 全屋智能家居"),
          panelRenderer ||
            ((panelRenderer = new PanelRenderer(displayRootElement!, {
              scaleMode: "contain",
              onRuntimeButtonPress() {
                buttonSound.play();
              },
            })),
            pushCatalogToRenderer()),
          builtinAssets &&
            userAssets &&
            (panelRenderer.refreshBuiltinAssets([
              ...(builtinAssets.items || []),
              ...(userAssets.items || []),
            ]),
            (loadedAssetsVersion = targetAssetsVersion)),
          lastRevision === draftResponse.revision &&
            lastGlobalPopupRevision === draftResponse.globalPopupRevision)
        )
          return;
        const currentPagePath = panelRenderer.page?.path || null;
        (panelRenderer.setDocument(displayDocument, currentPagePath),
          window.HomeOSDisplayBoot?.ready!(displayRootElement!)!,
          (lastRevision = draftResponse.revision),
          (lastGlobalPopupRevision = draftResponse.globalPopupRevision));
      })().finally(() => {
        refreshPromise = null;
      })),
      refreshPromise)
    );
}
async function bootstrap() {
  (syncViewportSize(),
    observeEmbeddedParent(),
    (project = await resolveProject()),
    window.HomeOSLog?.setContext!({
      projectId: project?.id || "",
    })!,
    project && (await refreshDisplay()));
}
function refreshIfVisible() {
  document.visibilityState === "visible" &&
    (window.HomeOSDisplayBoot?.failed || refreshDisplay().catch(handleDisplayError));
}
function handleLifecycleResume() {
  document.visibilityState === "visible" && ((lastAssetsCheckAt = 0), refreshIfVisible());
}
function handleDisplayError(displayError: any) {
  window.HomeOSLog?.error!(displayError, {
    phase: "display-refresh",
  })!;
  // 「总览尚无任何仪表盘」是全新安装的正常空状态，不是故障：
  // 走整屏失败 splash 会连 MainLayout 的顶栏/侧边栏/页脚一起盖住，而此时提示文案
  // 恰恰要求用户去「设置 → 布局」—— 导航被挡住就成了死循环。这里改为收起 splash、
  // 放行外壳，把引导文案落到内容区，用户即可正常使用导航去创建仪表盘。
  if (displayError?.code === "NO_DASHBOARD") {
    (panelRenderer?.destroy(), (panelRenderer = null), (lastRevision = null));
    window.HomeOSDisplayBoot?.reveal!()!;
    const noDashboardElement = document.createElement("p");
    ((noDashboardElement.className = "display-error"),
      (noDashboardElement.textContent = displayError.message),
      displayRootElement?.replaceChildren(noDashboardElement));
    return;
  }
  if (
    (window.HomeOSDisplayBoot?.fail!(displayError),
    displayError?.code !== "UI_PACK_RESTRICTED")
  )
    return;
  (panelRenderer?.destroy(), (panelRenderer = null), (lastRevision = null));
  const displayErrorElement = document.createElement("p");
  ((displayErrorElement.className = "display-error"),
    (displayErrorElement.textContent = displayError.message),
    displayRootElement?.replaceChildren(displayErrorElement));
}
const handleOrientationChange = () => window.setTimeout(syncViewportSize, 100);
let viewportObserver: IntersectionObserver | null = null;
const handleViewportPageHide = () => viewportObserver?.disconnect();
const handleViewportPageShow = () => viewportObserver?.observe(document.documentElement);
if (!hasDisplayDomContract) {
  // 见文件头契约说明：视图已卸载时整块跳过 —— 不注册全局监听、不起定时器、不发 bootstrap
  // 请求，也就不会在 resize / 失败兜底里对 null 写入。
  window.HomeOSLog?.warn?.(
    "[display] 页面缺少 #display-shell/#display-root，跳过展示页初始化（视图可能已被卸载或重定向）。",
    { phase: "display-boot" },
  );
} else if (
  (window.addEventListener("pageshow", handleLifecycleResume),
  document.addEventListener("visibilitychange", handleLifecycleResume),
  window.addEventListener("online", handleLifecycleResume),
  window.addEventListener("resize", syncViewportSize),
  window.visualViewport?.addEventListener("resize", syncViewportSize),
  window.addEventListener("orientationchange", handleOrientationChange),
  isEmbeddedFrame && typeof IntersectionObserver == "function")
) {
  viewportObserver = new IntersectionObserver(
    (observerEntries) => {
      const lastEntry = observerEntries[observerEntries.length - 1];
      if (
        !lastEntry?.isIntersecting ||
        lastEntry.intersectionRect.width < 1 ||
        lastEntry.intersectionRect.height < 1
      )
        return;
      const intersectionRect = lastEntry.intersectionRect;
      ((visibleBounds = {
        width: intersectionRect.width,
        height: intersectionRect.height,
        left: intersectionRect.left,
        top: intersectionRect.top,
      }),
        syncViewportSize());
    },
    {
      threshold: Array.from(
        {
          length: 101,
        },
        (_thresholdItem, thresholdIndex) => thresholdIndex / 100,
      ),
    },
  );
  (viewportObserver.observe(document.documentElement),
    window.addEventListener("pagehide", handleViewportPageHide, {
      once: true,
    }),
    window.addEventListener("pageshow", handleViewportPageShow));
}
let refreshIntervalId: any = null;
if (hasDisplayDomContract) {
  (refreshIntervalId = window.setInterval(refreshIfVisible, 10000),
    bootstrap().catch((bootstrapError) => {
      handleDisplayError(bootstrapError);
      // NO_DASHBOARD 与 UI_PACK_RESTRICTED 的文案已由 handleDisplayError 落到内容区，
      // 这里再写一次只会重复渲染同一段文字。
      if (
        bootstrapError?.code === "UI_PACK_RESTRICTED" ||
        bootstrapError?.code === "NO_DASHBOARD"
      )
        return;
      const bootstrapErrorElement = document.createElement("p");
      ((bootstrapErrorElement.className = "display-error"),
        (bootstrapErrorElement.textContent = bootstrapError.message),
        displayRootElement?.replaceChildren(bootstrapErrorElement));
    }));
}

  disposeActiveDisplay = () => {
    // 定时器与观察者
    window.clearInterval(refreshIntervalId);
    embeddedResizeObserver?.disconnect();
    embeddedResizeObserver = null;
    viewportObserver?.disconnect();
    viewportObserver = null;
    // 全局监听（必须与注册时同一函数引用才能命中）
    window.removeEventListener("pageshow", handleLifecycleResume);
    document.removeEventListener("visibilitychange", handleLifecycleResume);
    window.removeEventListener("online", handleLifecycleResume);
    window.removeEventListener("resize", syncViewportSize);
    window.visualViewport?.removeEventListener("resize", syncViewportSize);
    window.removeEventListener("orientationchange", handleOrientationChange);
    window.removeEventListener("pagehide", handleViewportPageHide);
    window.removeEventListener("pageshow", handleViewportPageShow);
    // 渲染器：释放 3D 运行时、WebSocket 与画布
    (panelRenderer?.destroy(), (panelRenderer = null));
    buttonSound.dispose?.();
    // 文档级残留：嵌入宿主判定类、苹果端定尺写下的内联尺寸、苹果端表面色变量
    document.documentElement.classList.remove("display-embedded", "capture-preview");
    document.documentElement.style.removeProperty("width");
    document.documentElement.style.removeProperty("height");
    document.documentElement.style.removeProperty("--display-surface-background");
    document.body.style.removeProperty("width");
    document.body.style.removeProperty("height");
    // 模块级状态复位，避免下一次 boot 复用陈旧引用
    (project = null),
      (lastRevision = null),
      (lastGlobalPopupRevision = null),
      (refreshPromise = null),
      (loadedAssetsVersion = null),
      (entityRecords = []),
      (deviceRecords = []),
      (translationResources = {}),
      (syncPromise = null),
      (lastSyncFingerprint = null),
      (hasTranslations = false),
      (lastCatalogFingerprint = null),
      (lastAssetsCheckAt = 0),
      (assetsVersion = null),
      (visibleBounds = null);
  };
}

/** 回收展示页：注销监听/定时器/观察者、销毁渲染器、清掉文档级残留状态。 */
export function teardownDisplay(): void {
  const dispose = disposeActiveDisplay;
  disposeActiveDisplay = null;
  dispose?.();
}
