import { PanelRenderer } from "./renderer/renderer.js?v=20260909-curtain-action-v15-20260911-navigation-light-v14-20260911-security-camera-popup-v6-quiet-feedback-v1-stage-retain-v1-20260914-chart-tooltip-scale-v1-warm-popups-v1-access-poll-30s-v1-20260926-scene-mode-v3-dialog-cleanup-v1-apple-native-v1-20260930-flow-line-sign-v1-20260930-percentage-text-offset-v1";
import { ensureUiPackRuntime } from "./ui-packs/loader.js?v=20260811-water-heater-popup-v44-20260824-light-statistics-v4-20260828-count-statistics-v1-20260824-load-optimization-v1-20260902-camera-popup-ready-v1-20260902-floorplan-auto-diagram-v12-20260908-environment-v1-20260908-lighting-mode-v1-20260926-scene-mode-v3-20260930-flow-line-sign-v1-20260930-percentage-text-offset-v1";
import { createButtonSound } from "./sound-effects.js?v=20260826-button-sound-v2";
import { syncAppleDisplaySurface } from "./display-surface.js?v=20260914-ios-pwa-surface-v1";
const displayRootElement = document.querySelector("#display-root"),
  displayShellElement = document.querySelector("#display-shell"),
  isCapturePreview = new URLSearchParams(window.location.search).get("capturePreview") === "1";
document.documentElement.classList.toggle("capture-preview", isCapturePreview);
let project = null,
  lastRevision = null,
  lastGlobalPopupRevision = null,
  panelRenderer = null;
const buttonSound = createButtonSound();
let refreshPromise = null,
  uiPacks = [],
  loadedAssetsVersion = null,
  entityRecords = [],
  deviceRecords = [],
  translationResources = {},
  syncPromise = null,
  lastSyncFingerprint = null,
  hasTranslations = false,
  lastCatalogFingerprint = null,
  lastAssetsCheckAt = 0,
  assetsVersion = null;
const isEmbeddedFrame = window.self !== window.top;
let visibleBounds = null;
function isAppleMobile() {
  const userAgent = navigator.userAgent || "";
  return (
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && Number(navigator.maxTouchPoints || 0) > 1)
  );
}
function syncViewportSize() {
  const shouldUseScreenSize = !isEmbeddedFrame && isAppleMobile();
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
    !(!widthPx || !heightPx) &&
      (isEmbeddedFrame &&
        visibleBounds &&
        ((widthPx = Math.min(widthPx, visibleBounds.width)),
        (heightPx = Math.min(heightPx, visibleBounds.height)),
        (displayShellElement.style.left = visibleBounds.left + "px"),
        (displayShellElement.style.top = visibleBounds.top + "px")),
      (displayShellElement.style.width = widthPx + "px"),
      (displayShellElement.style.height = heightPx + "px"),
      panelRenderer?.resize(),
      shouldUseScreenSize &&
        ((document.documentElement.style.width = widthPx + "px"),
        (document.documentElement.style.height = heightPx + "px"),
        (document.body.style.width = widthPx + "px"),
        (document.body.style.height = heightPx + "px"))));
}
function buildPairUrl() {
  return (
    "/pair?" +
    (window.HABridgeEmbed ||
    window.self !== window.top ||
    new URLSearchParams(location.search).get("embed") === "1"
      ? "embed=1&"
      : "") +
    "next=" +
    encodeURIComponent(
      "" + (window.HABridgeEmbed?.path || window.location.pathname) + window.location.search,
    )
  );
}
async function apiRequest(path) {
  const separator = path.includes("?") ? "&" : "?",
    startupEntry = window.HABridgeDisplayStartup?.take(path),
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
    if (
      response.status === 401 ||
      (response.status === 403 && payload?.detail?.code === "DISPLAY_PROJECT_UNPAIRED")
    )
      return (window.location.assign(buildPairUrl()), null);
    if (response.status === 403 && payload?.detail?.code === "LICENSE_RESTRICTED") {
      window.location.reload();
      const licenseRestrictedError = new Error(
        payload.detail.message || "授权后台正在验证，请稍后重试。",
      );
      throw ((licenseRestrictedError.code = "LICENSE_RESTRICTED"), licenseRestrictedError);
    }
    if (!response.ok) {
      const errorDetail = payload?.detail,
        requestError = new Error(
          typeof errorDetail == "string" ? errorDetail : errorDetail?.message || "请求失败。",
        );
      throw (
        (requestError.code = errorDetail?.code || ""),
        window.HABridgeLog?.linkError(requestError, response) || requestError
      );
    }
    return payload;
  } catch (caughtError) {
    throw abortController.signal.aborted
      ? new Error("仪表盘更新请求超时，请检查网络连接。")
      : caughtError;
  } finally {
    window.clearTimeout(abortTimeoutId);
  }
}
async function resolveUiPack(displayDocument) {
  const uiPackId = displayDocument?.uiPack?.id || "ui.base";
  let selectedUiPack = uiPacks.find((uiPackCandidate) => uiPackCandidate.id === uiPackId);
  if (!selectedUiPack) {
    const uiPackResponse = await apiRequest("/ui-packs?_=" + Date.now());
    if (!uiPackResponse) return null;
    ((uiPacks = uiPackResponse.items || []),
      (selectedUiPack = uiPacks.find((foundUiPack) => foundUiPack.id === uiPackId)));
  }
  if (!selectedUiPack?.allowed) {
    const uiPackRestrictedError = new Error("当前授权尚未解锁该 UI 方案。");
    throw ((uiPackRestrictedError.code = "UI_PACK_RESTRICTED"), uiPackRestrictedError);
  }
  return (await ensureUiPackRuntime(selectedUiPack), selectedUiPack);
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
          const entityAccumulator = [];
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
  const entityRows = entityRecords.map((entity) => [
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
    deviceRows = deviceRecords.map((device) => [
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
async function resolveProject() {
  const pathname = window.HABridgeEmbed?.path || window.location.pathname;
  if (pathname.startsWith("/display/"))
    return {
      id: decodeURIComponent(pathname.slice(9)),
      name: "",
    };
  if (!pathname.startsWith("/habridge/")) throw new Error("仪表盘地址无效。");
  const projectName = decodeURIComponent(pathname.slice(10)).trim();
  if (!projectName) throw new Error("仪表盘名称不能为空。");
  const projectsResponse = await apiRequest("/projects");
  if (!projectsResponse) return null;
  const projectMatches = (projectsResponse.items || []).filter(
    (projectCandidate) => projectCandidate.name === projectName,
  );
  if (!projectMatches.length) throw new Error("找不到仪表盘“" + projectName + "”。");
  if (projectMatches.length > 1)
    throw new Error("仪表盘名称“" + projectName + "”重复，请先在编辑器中改名。");
  return projectMatches[0];
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
        let revisionResponse = null,
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
        (window.HABridgeDisplayBoot?.setDocument(draftResponse.document),
          syncAppleDisplaySurface(draftResponse.document),
          buttonSound.setEnabled(draftResponse.document?.soundEnabled !== false),
          await resolveUiPack(draftResponse.document));
        let targetAssetsVersion = assetsVersion,
          builtinAssets = null,
          userAssets = null;
        if (!panelRenderer && assetsPromise) {
          const assetsBundle = await assetsPromise;
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
        const title = project.name || draftResponse.document?.name || "HA Bridge";
        if (
          ((document.title = title + " · HA Bridge"),
          panelRenderer ||
            ((panelRenderer = new PanelRenderer(displayRootElement, {
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
        (panelRenderer.setDocument(draftResponse.document, currentPagePath),
          window.HABridgeDisplayBoot?.ready(displayRootElement),
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
    (project = await resolveProject()),
    window.HABridgeLog?.setContext({
      projectId: project?.id || "",
    }),
    project && (await refreshDisplay()));
}
function refreshIfVisible() {
  document.visibilityState === "visible" &&
    (window.HABridgeDisplayBoot?.failed || refreshDisplay().catch(handleDisplayError));
}
function handleLifecycleResume() {
  document.visibilityState === "visible" && ((lastAssetsCheckAt = 0), refreshIfVisible());
}
function handleDisplayError(displayError) {
  if (
    (window.HABridgeLog?.error(displayError, {
      phase: "display-refresh",
    }),
    window.HABridgeDisplayBoot?.fail(displayError),
    displayError?.code !== "UI_PACK_RESTRICTED")
  )
    return;
  (panelRenderer?.destroy(), (panelRenderer = null), (lastRevision = null));
  const displayErrorElement = document.createElement("p");
  ((displayErrorElement.className = "display-error"),
    (displayErrorElement.textContent = displayError.message),
    displayRootElement.replaceChildren(displayErrorElement));
}
if (
  (window.addEventListener("pageshow", handleLifecycleResume),
  document.addEventListener("visibilitychange", handleLifecycleResume),
  window.addEventListener("online", handleLifecycleResume),
  window.addEventListener("resize", syncViewportSize),
  window.visualViewport?.addEventListener("resize", syncViewportSize),
  window.addEventListener("orientationchange", () => window.setTimeout(syncViewportSize, 100)),
  isEmbeddedFrame && typeof IntersectionObserver == "function")
) {
  const viewportObserver = new IntersectionObserver(
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
        (thresholdItem, thresholdIndex) => thresholdIndex / 100,
      ),
    },
  );
  (viewportObserver.observe(document.documentElement),
    window.addEventListener("pagehide", () => viewportObserver.disconnect(), {
      once: true,
    }),
    window.addEventListener("pageshow", () => viewportObserver.observe(document.documentElement)));
}
(window.setInterval(refreshIfVisible, 10000),
  bootstrap().catch((bootstrapError) => {
    if ((handleDisplayError(bootstrapError), bootstrapError?.code === "UI_PACK_RESTRICTED")) return;
    const bootstrapErrorElement = document.createElement("p");
    ((bootstrapErrorElement.className = "display-error"),
      (bootstrapErrorElement.textContent = bootstrapError.message),
      displayRootElement.replaceChildren(bootstrapErrorElement));
  }));
