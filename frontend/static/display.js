import { PanelRenderer } from "./renderer/renderer.js?v=20260915211726";
import { ensureUiPackRuntime } from "./ui-packs/loader.js?v=20260915211726";
import { createButtonSound } from "./sound-effects.js?v=20260915211726";
import { syncAppleDisplaySurface } from "./display-surface.js?v=20260915211726";
const displayRootElement = document.querySelector("#display-root");
const displayShellElement = document.querySelector("#display-shell");
const isCapturePreview = new URLSearchParams(window.location.search).get("capturePreview") === "1";
document.documentElement.classList.toggle("capture-preview", isCapturePreview);
let project = null;
let lastRevision = null;
let lastGlobalPopupRevision = null;
let panelRenderer = null;
const buttonSound = createButtonSound();
let refreshPromise = null;
let uiPacks = [];
let loadedAssetsVersion = null;
let entityList = [];
let deviceList = [];
let translationResources = {};
let syncPromise = null;
let lastSyncFingerprint = null;
let hasTranslations = false;
let lastCatalogFingerprint = null;
let lastAssetsCheckAt = 0;
let assetsVersion = null;
function isAppleMobile() {
  const userAgent = navigator.userAgent || "";
  return (
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && Number(navigator.maxTouchPoints || 0) > 1)
  );
}
function syncViewportSize() {
  const appleMobile = isAppleMobile();
  let widthPx = Math.round(
    Number(appleMobile ? window.screen?.width : window.visualViewport?.width) ||
      Number(window.innerWidth) ||
      Number(document.documentElement.clientWidth)
  );
  let heightPx = Math.round(
    Number(appleMobile ? window.screen?.height : window.visualViewport?.height) ||
      Number(window.innerHeight) ||
      Number(document.documentElement.clientHeight)
  );
  if (appleMobile && window.innerWidth >= window.innerHeight !== widthPx >= heightPx) {
    [widthPx, heightPx] = [heightPx, widthPx];
  }
  if (!!widthPx && !!heightPx) {
    displayShellElement.style.width = widthPx + "px";
    displayShellElement.style.height = heightPx + "px";
    if (appleMobile) {
      document.documentElement.style.width = widthPx + "px";
      document.documentElement.style.height = heightPx + "px";
      document.body.style.width = widthPx + "px";
      document.body.style.height = heightPx + "px";
    }
  }
}
function buildPairUrl() {
  return "/pair?next=" + encodeURIComponent("" + window.location.pathname + window.location.search);
}
async function apiRequest(path) {
  const separator = path.includes("?") ? "&" : "?";
  const abortController = new AbortController();
  const timeoutId = window.setTimeout(() => abortController.abort(), 20000);
  try {
    const response = await fetch("/api/v1" + path + separator + "_=" + Date.now(), {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache"
      },
      signal: abortController.signal
    });
    const payload =
      response.status === 204
        ? null
        : await response.json().catch(cause => {
            if (abortController.signal.aborted) {
              throw cause;
            }
            return {};
          });
    if (response.status === 401) {
      window.location.assign(buildPairUrl());
      return null;
    }
    if (response.status === 403 && payload?.detail?.code === "LICENSE_RESTRICTED") {
      window.location.replace("/license");
      return null;
    }
    if (!response.ok) {
      const detail = payload?.detail;
      const requestError = new Error(
        typeof detail == "string" ? detail : detail?.message || "请求失败。"
      );
      requestError.code = detail?.code || "";
      throw window.HABridgeLog?.linkError(requestError, response) || requestError;
    }
    return payload;
  } catch (caughtError) {
    throw abortController.signal.aborted
      ? new Error("仪表盘更新请求超时，请检查网络连接。")
      : caughtError;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
async function resolveUiPack(dashboardDocument) {
  const uiPackId = dashboardDocument?.uiPack?.id || "ui.base";
  let uiPack = uiPacks.find(packEntry => packEntry.id === uiPackId);
  if (!uiPack) {
    const uiPackResponse = await apiRequest("/ui-packs?_=" + Date.now());
    if (!uiPackResponse) {
      return null;
    }
    uiPacks = uiPackResponse.items || [];
    uiPack = uiPacks.find(packCandidate => packCandidate.id === uiPackId);
  }
  if (!uiPack?.allowed) {
    const restrictedError = new Error("当前授权尚未解锁该 UI 方案。");
    restrictedError.code = "UI_PACK_RESTRICTED";
    throw restrictedError;
  }
  await ensureUiPackRuntime(uiPack);
  return uiPack;
}
async function refreshCatalog() {
  return (
    syncPromise ||
    ((syncPromise = (async () => {
      const syncStatus = await apiRequest("/ha/sync/status");
      if (!syncStatus) {
        return;
      }
      const fingerprint = syncStatus.configured
        ? JSON.stringify([
            Number.isFinite(Number(syncStatus.catalogRevision))
              ? Number(syncStatus.catalogRevision)
              : syncStatus.lastFullSyncAt || "",
            Number(syncStatus.counts?.entities || 0),
            Number(syncStatus.counts?.devices || 0),
            Number(syncStatus.counts?.areas || 0)
          ])
        : "not-configured";
      const hasCatalogChange = fingerprint !== lastSyncFingerprint;
      const shouldRefreshTranslations =
        !!syncStatus.configured &&
        !!syncStatus.connected &&
        (!hasTranslations || !!hasCatalogChange);
      if (!!hasCatalogChange || !!shouldRefreshTranslations) {
        if (!syncStatus.configured) {
          entityList = [];
          deviceList = [];
          translationResources = {};
          lastSyncFingerprint = fingerprint;
          hasTranslations = true;
          pushCatalogToRenderer();
          return;
        }
        if (hasCatalogChange) {
          const entityAccumulator = [];
          let offset = 0;
          let total = 0;
          do {
            const entityPage = await apiRequest("/ha/entities?limit=500&offset=" + offset);
            if (!entityPage) {
              return;
            }
            entityAccumulator.push(...(entityPage.items || []));
            total = Number(entityPage.total || 0);
            offset += Number(entityPage.limit || 500);
          } while (entityAccumulator.length < total);
          entityList = entityAccumulator;
          const deviceResponse = await apiRequest("/ha/devices").catch(() => null);
          if (deviceResponse) {
            deviceList = deviceResponse.items || [];
          }
          lastSyncFingerprint = fingerprint;
        }
        if (shouldRefreshTranslations) {
          const translationResponse = await apiRequest("/ha/translations").catch(() => null);
          if (translationResponse) {
            translationResources = translationResponse.resources || {};
            hasTranslations = true;
          } else {
            hasTranslations = false;
          }
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
  const entityRows = entityList.map(entity => [
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
    entity.disabledBy || ""
  ]);
  const deviceRows = deviceList.map(device => [
    device.deviceId || "",
    device.name || "",
    device.manufacturer || "",
    device.model || "",
    device.status || ""
  ]);
  const translationEntries = Object.entries(translationResources).sort(
    ([firstLocale], [secondLocale]) => firstLocale.localeCompare(secondLocale)
  );
  return JSON.stringify([entityRows, deviceRows, translationEntries]);
}
function pushCatalogToRenderer() {
  if (!panelRenderer) {
    return;
  }
  const catalogFingerprint = buildCatalogFingerprint();
  if (catalogFingerprint !== lastCatalogFingerprint) {
    lastCatalogFingerprint = catalogFingerprint;
    panelRenderer.setEntityCatalog(entityList, translationResources, deviceList);
  }
}
async function resolveProject() {
  const pathname = window.location.pathname;
  if (pathname.startsWith("/display/")) {
    return {
      id: decodeURIComponent(pathname.slice(9)),
      name: ""
    };
  }
  if (!pathname.startsWith("/habridge/")) {
    throw new Error("仪表盘地址无效。");
  }
  const projectName = decodeURIComponent(pathname.slice(10)).trim();
  if (!projectName) {
    throw new Error("仪表盘名称不能为空。");
  }
  const projectsResponse = await apiRequest("/projects");
  if (!projectsResponse) {
    return null;
  }
  const projectMatches = (projectsResponse.items || []).filter(
    projectCandidate => projectCandidate.name === projectName
  );
  if (!projectMatches.length) {
    throw new Error("找不到仪表盘“" + projectName + "”。");
  }
  if (projectMatches.length > 1) {
    throw new Error("仪表盘名称“" + projectName + "”重复，请先在编辑器中改名。");
  }
  return projectMatches[0];
}
async function refreshDisplay() {
  if (project) {
    return (
      refreshPromise ||
      ((refreshPromise = (async () => {
        refreshCatalog().catch(() => null);
        let revisionResponse = null;
        let hasAssetsChange = loadedAssetsVersion !== assetsVersion;
        if (panelRenderer) {
          revisionResponse = await apiRequest(
            "/projects/" + encodeURIComponent(project.id) + "/revision"
          );
          if (!revisionResponse) {
            return;
          }
          const now = Date.now();
          if (now - lastAssetsCheckAt >= 30000) {
            const assetsVersionResponse = await apiRequest("/assets/version");
            if (!assetsVersionResponse) {
              return;
            }
            const assetsKey =
              (assetsVersionResponse.builtin || "") + ":" + (assetsVersionResponse.user || "");
            hasAssetsChange = loadedAssetsVersion !== assetsKey;
            assetsVersion = assetsKey;
            lastAssetsCheckAt = now;
          }
          if (
            !hasAssetsChange &&
            revisionResponse.revision === lastRevision &&
            revisionResponse.globalPopupRevision === lastGlobalPopupRevision
          ) {
            return;
          }
        }
        const draftResponse = await apiRequest(
          "/projects/" + encodeURIComponent(project.id) + "/draft"
        );
        if (!draftResponse) {
          return;
        }
        window.HABridgeDisplayBoot?.setDocument(draftResponse.document);
        syncAppleDisplaySurface(draftResponse.document);
        buttonSound.setEnabled(draftResponse.document?.soundEnabled !== false);
        await resolveUiPack(draftResponse.document);
        let targetAssetsVersion = assetsVersion;
        let builtinAssets = null;
        let userAssets = null;
        if (!panelRenderer || hasAssetsChange || loadedAssetsVersion !== targetAssetsVersion) {
          const fetchedAssetsVersion = assetsVersion ? null : await apiRequest("/assets/version");
          targetAssetsVersion = fetchedAssetsVersion
            ? (fetchedAssetsVersion.builtin || "") + ":" + (fetchedAssetsVersion.user || "")
            : targetAssetsVersion;
          assetsVersion = targetAssetsVersion;
          lastAssetsCheckAt = Date.now();
          [builtinAssets, userAssets] = await Promise.all([
            apiRequest("/assets/builtin"),
            apiRequest("/assets/user")
          ]);
          if (!builtinAssets || !userAssets) {
            return;
          }
        }
        const title = project.name || draftResponse.document?.name || "HomeOS";
        document.title = title + " · HomeOS";
        if (!panelRenderer) {
          panelRenderer = new PanelRenderer(displayRootElement, {
            scaleMode: "contain",
            onRuntimeButtonPress() {
              buttonSound.play();
            }
          });
          pushCatalogToRenderer();
        }
        if (builtinAssets && userAssets) {
          panelRenderer.refreshBuiltinAssets([
            ...(builtinAssets.items || []),
            ...(userAssets.items || [])
          ]);
          loadedAssetsVersion = targetAssetsVersion;
        }
        if (
          lastRevision === draftResponse.revision &&
          lastGlobalPopupRevision === draftResponse.globalPopupRevision
        ) {
          return;
        }
        const currentPagePath = panelRenderer.page?.path || null;
        panelRenderer.setDocument(draftResponse.document, currentPagePath);
        window.HABridgeDisplayBoot?.ready(displayRootElement);
        lastRevision = draftResponse.revision;
        lastGlobalPopupRevision = draftResponse.globalPopupRevision;
      })().finally(() => {
        refreshPromise = null;
      })),
      refreshPromise)
    );
  }
}
async function bootstrap() {
  syncViewportSize();
  project = await resolveProject();
  window.HABridgeLog?.setContext({
    projectId: project?.id || ""
  });
  if (project) {
    await refreshDisplay();
  }
}
function refreshIfVisible() {
  if (document.visibilityState === "visible") {
    if (!window.HABridgeDisplayBoot?.failed) {
      refreshDisplay().catch(handleDisplayError);
    }
  }
}
function handleLifecycleResume() {
  if (document.visibilityState === "visible") {
    lastAssetsCheckAt = 0;
    refreshIfVisible();
  }
}
function handleDisplayError(error) {
  window.HABridgeLog?.error(error, {
    phase: "display-refresh"
  });
  window.HABridgeDisplayBoot?.fail(error);
  if (error?.code !== "UI_PACK_RESTRICTED") {
    return;
  }
  panelRenderer?.destroy();
  panelRenderer = null;
  lastRevision = null;
  const errorElement = document.createElement("p");
  errorElement.className = "display-error";
  errorElement.textContent = error.message;
  displayRootElement.replaceChildren(errorElement);
}
window.addEventListener("pageshow", handleLifecycleResume);
document.addEventListener("visibilitychange", handleLifecycleResume);
window.addEventListener("online", handleLifecycleResume);
window.addEventListener("resize", syncViewportSize);
window.visualViewport?.addEventListener("resize", syncViewportSize);
window.addEventListener("orientationchange", () => window.setTimeout(syncViewportSize, 100));
window.setInterval(refreshIfVisible, 10000);
bootstrap().catch(bootstrapError => {
  handleDisplayError(bootstrapError);
  if (bootstrapError?.code === "UI_PACK_RESTRICTED") {
    return;
  }
  const bootstrapErrorElement = document.createElement("p");
  bootstrapErrorElement.className = "display-error";
  bootstrapErrorElement.textContent = bootstrapError.message;
  displayRootElement.replaceChildren(bootstrapErrorElement);
});
