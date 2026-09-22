/**
 * 展示页主脚本（/display/<项目名>）。
 *
 * 长期打开的运行时页面，只读消费编辑器保存的草稿：解析地址得到项目、轮询 revision 判断
 * 是否刷新、拉取目录与素材、创建 PanelRenderer 渲染文档，并处理前后台切换、断网恢复与旋转
 * 屏。未配对 / 会话失效（401）跳 /pair，授权受限（403 LICENSE_RESTRICTED）就地刷新自愈
 *（墙面屏前没人能填激活码，刷新让后端门禁重新判定）；两个判定口径见 utils/api-request.js；
 * 素材版本号形如 "内置戳:用户戳"，只在变化时重新下载；轮询 10 秒，素材版本检查 30 秒。
 */
import { PanelRenderer } from "../renderer/core/renderer.js?v=2609221053";
import { apiAuthChallenge, apiRequestError } from "../utils/api-request.js?v=2609221053";
import { apiFetch } from "../utils/api-fetch.js?v=2609221053";
import { createButtonSound } from "../shared/sound-effects.js?v=2609221053";
import { syncAppleDisplaySurface } from "./display-surface.js?v=2609221053";
import { isAppleMobile } from "../utils/apple-device.js?v=2609221053";

const displayRootElement = document.querySelector("#display-root");
const displayShellElement = document.querySelector("#display-shell");
// capturePreview 用于截图与缩略图，跳过启动遮罩、不写尺寸。
const isCapturePreview = new URLSearchParams(window.location.search).get("capturePreview") === "1";
document.documentElement.classList.toggle("capture-preview", isCapturePreview);
let project = null;
let lastRevision = null;
let lastGlobalPopupRevision = null;
let panelRenderer = null;
const buttonSound = createButtonSound();
// refreshPromise / syncPromise 做单飞：同一时刻只允许一次刷新或一次目录同步。
let refreshPromise = null;
let loadedAssetsVersion = null;
let entityList = [];
let deviceList = [];
let translationResources = {};
let syncPromise = null;
let lastSyncFingerprint = null;
let hasTranslations = false;
let lastCatalogFingerprint = null;
// 素材版本检查节流时间戳，30 秒内不重复请求 /assets/version。
let lastAssetsCheckAt = 0;
let assetsVersion = null;

// 苹果移动端判定统一走 utils/apple-device.js：两套证据（UA 里的 Macintosh / navigator.platform）
// 都会被浏览器收紧，合并成一处并把两条证据并起来用。

/**
 * 把展示根节点尺寸同步成真实可视区域尺寸。
 * iOS 的 visualViewport 会随地址栏收缩，故改取 screen 尺寸；屏幕方向与视口不一致时交换宽高。
 */
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
  // !== 两侧都是布尔值：判断「方向不一致」，需要交换宽高。
  if (appleMobile && window.innerWidth >= window.innerHeight !== widthPx >= heightPx) {
    [widthPx, heightPx] = [heightPx, widthPx];
  }
  if (!!widthPx && !!heightPx) {
    displayShellElement.style.width = widthPx + "px";
    displayShellElement.style.height = heightPx + "px";
    if (appleMobile) {
      // iOS 全屏时 html / body 也要撑满，否则滚动会让画布露出白边。
      document.documentElement.style.width = widthPx + "px";
      document.documentElement.style.height = heightPx + "px";
      document.body.style.width = widthPx + "px";
      document.body.style.height = heightPx + "px";
    }
  }
}

// 未配对时跳转到配对页，并把当前地址带上以便配对后跳回。
function buildPairUrl() {
  return "/pair?next=" + encodeURIComponent("" + window.location.pathname + window.location.search);
}

/**
 * 请求展示页所需的接口。
 *
 * 超时预算与超时错误的形态都交给 utils/api-fetch.js（`apiFetch`）：它是全站接口的唯一
 * 出入口，20 秒预算与 `name === "TimeoutError"` 的约定都在那里。这里曾自持一个 20 秒
 * `AbortController`，并且超时抛的是**裸 Error**（name 是 "Error"）—— 调用方按 name 判
 * 「是不是超时」时永远落空，只能靠中文文案猜，而文案是会随版本改的。
 *
 * @throws {Error} 超时（name 为 TimeoutError）、HTTP 失败或响应不是合法 JSON。
 */
async function apiRequest(path) {
  // 追加 _=时间戳 与 no-store 双保险，绕过浏览器与中间层缓存。
  const separator = path.includes("?") ? "&" : "?";
  try {
    const response = await apiFetch("/api/v1" + path + separator + "_=" + Date.now(), {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache"
      }
    });
    const payload =
      response.status === 204
        ? null
        : await response.json().catch(() => ({}));
    const authChallenge = apiAuthChallenge(response.status, payload);
    if (authChallenge === "session-expired") {
      window.location.assign(buildPairUrl());
      return null;
    }
    if (authChallenge === "license-restricted") {
      // 刷新而不是跳 /license：展示端是墙面屏，通常没人能填激活码；刷新会让后端门禁
      // 重新判定；若展示能力仍不可用，后端会把 /pair 与 /display/* 就地渲染成连接状态页
      //（那里只有「正在重连」和自动重试），因此刷新本身就是可自愈的落点。
      // 先重载再抛：重载是异步的，抛出的错误让当前这一帧立刻显示原因而不是白等。
      window.location.reload();
      throw apiRequestError(payload, {
        status: response.status,
        message: payload?.detail?.message || "授权后台正在验证，请稍后重试。",
        response
      });
    }
    if (!response.ok) {
      // 文案归一交给 utils/api-error.js，它认得字符串、`detail.message` 与 FastAPI 422 数组；
      // 错误形态与「先关联响应、避免重复上报」都在 utils/api-request.js 里。
      throw apiRequestError(payload, {
        status: response.status,
        fallback: "请求失败。",
        response
      });
    }
    return payload;
  } catch (caughtError) {
    // 超时已经由 apiFetch 抛成 name === "TimeoutError" 的错误，后续按 name 分支的调用方
    // 都能认出它，这里直接透传，不再把名字抹平。
    if (caughtError?.name === "TimeoutError") {
      throw caughtError;
    }
    // fetch 在网络层断掉时抛的是 `TypeError: Failed to fetch`，这句话会原样出现在
    // 启动层的错误界面和运行期横幅上，对用户没有任何意义，这里换成可读文案。
    if (caughtError instanceof TypeError) {
      throw new Error("无法连接服务器，请检查网络连接。");
    }
    throw caughtError;
  }
}

/**
 * 同步 HA 目录（实体 / 设备 / 翻译）并在必要时推给渲染层。
 */
async function refreshCatalog() {
  return (
    // syncPromise 单飞：并发调用共享同一次同步，结束后清空以便下次重来。
    syncPromise ||
    ((syncPromise = (async () => {
      const syncStatus = await apiRequest("/ha/sync/status");
      if (!syncStatus) {
        return;
      }
      // 指纹由同步版本号 / 上次全量同步时间 + 三类计数拼成，任一变化即视为目录变了。
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
      // 翻译资源只需拉一次；目录变化时也要重拉，因为实体名可能改语言。
      const shouldRefreshTranslations =
        !!syncStatus.configured &&
        !!syncStatus.connected &&
        (!hasTranslations || !!hasCatalogChange);
      if (!!hasCatalogChange || !!shouldRefreshTranslations) {
        if (!syncStatus.configured) {
          // 未配置 HA：清空目录并标记已处理，避免每次轮询都重复走到这里。
          entityList = [];
          deviceList = [];
          translationResources = {};
          lastSyncFingerprint = fingerprint;
          hasTranslations = true;
          pushCatalogToRenderer();
          return;
        }
        if (hasCatalogChange) {
          // 实体分页拉取，每页 500 条，直到累计条数达到后端给出的总数。
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
          // 设备列表拿不到不算致命错误，退化成空列表即可。
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
            // 拉失败时标记未加载，下次轮询会再试。
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

// 生成目录指纹：只取影响渲染的字段，避免无谓的重复下发。
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
  // 翻译资源按键排序后再序列化，保证键序不同不会造成假差异。
  const translationEntries = Object.entries(translationResources).sort(
    ([firstLocale], [secondLocale]) => firstLocale.localeCompare(secondLocale)
  );
  return JSON.stringify([entityRows, deviceRows, translationEntries]);
}

// 目录指纹变化时才推给渲染层，减少一次全量实体下发。
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

// 地址里的项目名可能含中文与空格，解码失败时按原样返回，交给后续比较失败提示。
function decodeDisplayPath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * 根据 URL 解析当前展示的项目。
 * @throws {Error} 地址非法、项目不存在或名称重复时抛出中文文案。
 */
async function resolveProject() {
  const pathname = window.location.pathname;
  if (!pathname.startsWith("/display/")) {
    throw new Error("仪表盘地址无效。");
  }
  // "/display/" 长度为 9，其后全部是项目名。
  const projectName = decodeDisplayPath(pathname.slice(9)).trim();
  if (!projectName) {
    throw new Error("仪表盘地址无效。");
  }
  const projectsResponse = await apiRequest("/projects");
  if (!projectsResponse) {
    return null;
  }
  // 展示页只能按名称寻址，因此先精确匹配；数量为 0 或 >1 都在下面分别报错。
  const projectMatches = (projectsResponse.items || []).filter(
    projectCandidate => projectCandidate.name === projectName
  );
  if (!projectMatches.length) {
    throw new Error("找不到仪表盘“" + projectName + "”。");
  }
  if (projectMatches.length > 1) {
    // 展示页靠名称寻址，重名必须挡在入口，否则无法确定该渲染哪一个。
    throw new Error("仪表盘名称“" + projectName + "”重复，请先在编辑器中改名。");
  }
  return projectMatches[0];
}

/**
 * 拉取草稿并按需重建 / 更新渲染器（带单飞与 revision 短路）。
 */
async function refreshDisplay() {
  if (project) {
    return (
      refreshPromise ||
      (refreshPromise = (async () => {
        // 目录同步失败不影响主流程，静默忽略。
        refreshCatalog().catch(() => null);
        let revisionResponse = null;
        // 素材版本可能已被别处更新（如预览），这里先按已记录的版本比对一次。
        let hasAssetsChange = loadedAssetsVersion !== assetsVersion;
        if (panelRenderer) {
          revisionResponse = await apiRequest(
            "/projects/" + encodeURIComponent(project.id) + "/revision"
          );
          if (!revisionResponse) {
            return;
          }
          const now = Date.now();
          // 素材版本检查 30 秒节流，避免每次轮询都发一次请求。
          if (now - lastAssetsCheckAt >= 30000) {
            const assetsVersionResponse = await apiRequest("/assets/version");
            if (!assetsVersionResponse) {
              return;
            }
            // 版本号由内置戳与用户戳拼成，任一变化都意味着素材需要重下。
            const assetsKey =
              (assetsVersionResponse.builtin || "") + ":" + (assetsVersionResponse.user || "");
            hasAssetsChange = loadedAssetsVersion !== assetsKey;
            assetsVersion = assetsKey;
            lastAssetsCheckAt = now;
          }
          if (
            // 三重比对都无变化则直接返回，省掉拉草稿与重渲染的开销。
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
        // 先让启动层按画布背景色定好主题，避免首帧闪白。
        window.HABridgeDisplayBoot?.setDocument(draftResponse.document);
        syncAppleDisplaySurface(draftResponse.document);
        buttonSound.setEnabled(draftResponse.document?.soundEnabled !== false);
        let targetAssetsVersion = assetsVersion;
        let builtinAssets = null;
        let userAssets = null;
        if (!panelRenderer || hasAssetsChange || loadedAssetsVersion !== targetAssetsVersion) {
          // 首次进入或素材变了：必要时补查一次版本，然后并发拉取内置 / 用户素材。
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
          // 首次创建渲染器：contain 保证整块画布可见，不裁切。
          panelRenderer = new PanelRenderer(displayRootElement, {
            scaleMode: "contain",
            onRuntimeButtonPress() {
              buttonSound.play();
            },
            // 运行期异常必须看得见：展示页没有控制台，不传 onError 时控件操作失败、订阅被停掉都无反馈。
            onError(rendererError) {
              window.HABridgeDisplayBoot?.notice(rendererError?.message || "操作失败。");
            },
            // 实时推送可用性：致命关闭码（4400）后渲染层不会自动重连，画面会停在
            // 最后一帧；此时挂一条常驻横幅，等它重新订阅成功再撤掉。
            onRuntimeAvailabilityChange(available, unavailableMessage) {
              window.HABridgeDisplayBoot?.setRuntimePush(available, unavailableMessage);
            }
          });
          pushCatalogToRenderer();
        }
        if (builtinAssets && userAssets) {
          // 素材表要合并内置与用户两部分后一次性替换，避免出现中间态。
          panelRenderer.refreshBuiltinAssets([
            ...(builtinAssets.items || []),
            ...(userAssets.items || [])
          ]);
          loadedAssetsVersion = targetAssetsVersion;
        }
        if (
          // 只更新了素材（revision 未变）时到此为止，不必重设文档。
          lastRevision === draftResponse.revision &&
          lastGlobalPopupRevision === draftResponse.globalPopupRevision
        ) {
          return;
        }
        // 保持当前页：刷新后仍停在用户正在看的那一页。
        const currentPagePath = panelRenderer.page?.path || null;
        panelRenderer.setDocument(draftResponse.document, currentPagePath);
        window.HABridgeDisplayBoot?.ready(displayRootElement);
        lastRevision = draftResponse.revision;
        lastGlobalPopupRevision = draftResponse.globalPopupRevision;
      })().finally(() => {
        refreshPromise = null;
      }))
    );
  }
}

// 启动流程：先定尺寸，再解析项目，然后把项目 ID 写进日志上下文。
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

// 页面可见且启动未失败时才刷新：失败态要保持在错误界面等用户点重试。
function refreshIfVisible() {
  if (document.visibilityState === "visible") {
    if (!window.HABridgeDisplayBoot?.failed) {
      // 这一次刷新整体成功（含「revision 没变，无需重渲染」）就说明网络通了，
      // 此时必须撤掉「无法更新」横幅 —— 否则恢复联网后它一直挂着。
      refreshDisplay().then(
        () => window.HABridgeDisplayBoot?.recovered(),
        handleDisplayError
      );
    }
  }
}

// 从后台切回前台 / 网络恢复：重置素材检查节流，立即拉一次最新内容。
function handleLifecycleResume() {
  if (document.visibilityState === "visible") {
    lastAssetsCheckAt = 0;
    refreshIfVisible();
  }
}

// 统一的刷新失败处理：上报日志并让启动层显示错误与重试入口。
function handleDisplayError(error) {
  window.HABridgeLog?.error(error, {
    phase: "display-refresh"
  });
  window.HABridgeDisplayBoot?.fail(error);
}

window.addEventListener("pageshow", handleLifecycleResume);
document.addEventListener("visibilitychange", handleLifecycleResume);
window.addEventListener("online", handleLifecycleResume);
window.addEventListener("resize", syncViewportSize);
window.visualViewport?.addEventListener("resize", syncViewportSize);
// orientationchange 触发时尺寸尚未稳定，延后 100ms 再取。
window.addEventListener("orientationchange", () => window.setTimeout(syncViewportSize, 100));
// 10 秒轮询一次 revision，兼顾及时性与中控设备的功耗。
window.setInterval(refreshIfVisible, 10000);
bootstrap().catch(bootstrapError => {
  // 启动失败时在画布位置直接给出错误文案，无需用户操作。
  handleDisplayError(bootstrapError);
  const bootstrapErrorElement = document.createElement("p");
  bootstrapErrorElement.className = "display-error";
  bootstrapErrorElement.textContent = bootstrapError.message;
  displayRootElement.replaceChildren(bootstrapErrorElement);
});
