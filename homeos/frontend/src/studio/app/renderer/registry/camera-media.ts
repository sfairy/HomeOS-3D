/** registry 相机媒体子模块：负责摄像头快照/HLS 实时预览挂载。 */
import { EntityRequestPolicy } from "../panel-caches";
import {
  createGo2RtcMseTransport,
  normalizeGo2rtcTarget,
  GO2RTC_TRANSPORT_NAME,
  type Go2RtcMseTransportHandle,
} from "@/shared/camera/composables/useGo2RtcMseTransport";
import { ensureHls, isExpiredStreamAddressError, prefetchHlsOnIdle } from "@/shared/camera/hls-loader";
import { clampNumberWithFallback, normalizeCssColor, appendSvgElement, createCameraVisualState } from "./_shared";
import { withCameraHttpSlot } from "@runtime/camera/camera-budget";

/**
 * Studio 侧复用共享的 go2rtc MSE 实现（`shared/camera/composables/useGo2RtcMseTransport`），
 * 这里再导出一次，视频弹窗/安全检查器等别的渲染子模块从本文件取，避免两份协议漂移。
 */
export { normalizeGo2rtcTarget };
/** 渲染环境 / 属性袋：由 renderer 按组件类型动态组装（states、editable、document、cleanup、callEntityService、airflow* …），registry 侧只读取其中的可选字段； */
type RenderPropertyBag = any;
/** hls.js 运行时：外部脚本注入 window.Hls，vite-env.d.ts 的 Window 只有索引签名，这里按本文件实际用到的 API 补一份局部类型。 */
type HlsRuntime = {
  isSupported?: () => boolean;
  Events: {
    MEDIA_ATTACHED: string;
    MANIFEST_PARSED: string;
    ERROR: string;
  };
  new (hlsPlayerConfig?: {
    lowLatencyMode?: boolean;
    backBufferLength?: number;
    maxBufferLength?: number;
    maxMaxBufferLength?: number;
    maxBufferSize?: number;
  }): {
    on: (hlsEventName: string, hlsEventHandler: (...hlsEventArgs: any[]) => void) => void;
    loadSource: (hlsSourceUrl: string) => void;
    attachMedia: (mediaElement: HTMLMediaElement) => void;
    destroy: () => void;
  };
};
export function cameraRadiusRatio(rawRadiusRatio: any, fallbackRadiusRatio = 0.04) {
  const numericRadiusRatio = Number(rawRadiusRatio);
  return Number.isFinite(numericRadiusRatio)
    ? clampNumberWithFallback(
        numericRadiusRatio > 0.5 ? numericRadiusRatio / 100 : numericRadiusRatio,
        0,
        0.5,
        fallbackRadiusRatio,
      )
    : fallbackRadiusRatio;
}
export function appendCameraFrame(
  frameHostElement: any,
  targetEntityFrame: any,
  cameraFrameOptions: RenderPropertyBag = {},
  frameIdPrefix = "renderer",
) {
  if (!frameHostElement || cameraFrameOptions.frameVisible === false) return null;
  const viewportPixelWidth = Math.max(
      20,
      Number(targetEntityFrame?.position?.width || frameHostElement.clientWidth || 320),
    ),
    viewportPixelHeight = Math.max(
      20,
      Number(targetEntityFrame?.position?.height || frameHostElement.clientHeight || 180),
    ),
    cameraFrameStrokeWidth = clampNumberWithFallback(cameraFrameOptions.frameWidth, 0, 20, 1);
  if (cameraFrameStrokeWidth <= 0) return null;
  const frameStrokeInset = Math.max(0.5, cameraFrameStrokeWidth / 2 + 0.5),
    frameInnerWidth = Math.max(1, viewportPixelWidth - frameStrokeInset * 2),
    frameInnerHeight = Math.max(1, viewportPixelHeight - frameStrokeInset * 2),
    cornerRadiusRatio = cameraRadiusRatio(cameraFrameOptions.radius),
    frameCornerRadius = Math.min(frameInnerWidth, frameInnerHeight) * cornerRadiusRatio,
    cameraFrameOpacity = clampNumberWithFallback(cameraFrameOptions.frameOpacity, 0, 1, 0.9),
    cameraFrameColor = normalizeCssColor(cameraFrameOptions.frameColor, "#d4d4d4"),
    cameraFrameId =
      frameIdPrefix +
      "-camera-frame-" +
      String(targetEntityFrame?.id || "").replace(/[^a-z0-9_-]/gi, ""),
    cameraFrameSvgElement = appendSvgElement(frameHostElement, "svg", {
      class: "hb-camera-frame",
      viewBox: "0 0 " + viewportPixelWidth + " " + viewportPixelHeight,
      preserveAspectRatio: "none",
      "aria-hidden": "true",
    }),
    cameraFrameDefsElement = appendSvgElement(cameraFrameSvgElement, "defs"),
    cameraFrameGradientElement = appendSvgElement(cameraFrameDefsElement, "linearGradient", {
      id: cameraFrameId + "-edge",
      gradientUnits: "userSpaceOnUse",
      x1: 0,
      y1: viewportPixelHeight / 2,
      x2: viewportPixelWidth,
      y2: viewportPixelHeight / 2,
      gradientTransform:
        "rotate(" +
        clampNumberWithFallback(cameraFrameOptions.frameAngle, 0, 360, 45) +
        " " +
        viewportPixelWidth / 2 +
        " " +
        viewportPixelHeight / 2 +
        ")",
    });
  for (const [gradientStopOffset, gradientStopOpacity] of [
    [0, 0.96],
    [0.22, 0.72],
    [0.52, 0.3],
    [0.78, 0.66],
    [1, 0.42],
  ])
    appendSvgElement(cameraFrameGradientElement, "stop", {
      offset: gradientStopOffset,
      "stop-color": cameraFrameColor,
      "stop-opacity": gradientStopOpacity * cameraFrameOpacity,
    });
  return (
    appendSvgElement(cameraFrameSvgElement, "rect", {
      x: frameStrokeInset,
      y: frameStrokeInset,
      width: frameInnerWidth,
      height: frameInnerHeight,
      rx: frameCornerRadius,
      fill: "none",
      stroke: "url(#" + cameraFrameId + "-edge)",
      "stroke-width": cameraFrameStrokeWidth,
      "vector-effect": "non-scaling-stroke",
    }),
    cameraFrameSvgElement
  );
}
const CAMERA_SOURCE_CACHE_TTL_MS = 30000,
  CAMERA_MAX_SOURCES = 4,
  /** 一轮播放里最多换票重试几次「地址已失效」的 HLS；超过才降级。 */
  HLS_ADDRESS_RETRY_LIMIT = 2,
  /** HLS 起播兜底：这么久还没画面就降级 MJPEG（换票重试同样受它约束）。 */
  HLS_START_TIMEOUT_MS = 12000,
  cameraSourceByEntityId = new Map(),
  pendingSourceRequestByEntityId = new Map();
async function resolveCameraStreamSource(sourceEntityId: any, options: { signal?: AbortSignal } = {}) {
  const normalizedCameraEntityId = String(sourceEntityId || "").trim();
  if (!normalizedCameraEntityId) throw new Error("Camera entity is required");
  const requestTimestampMs = Date.now(),
    cachedSourceRecord = cameraSourceByEntityId.get(normalizedCameraEntityId);
  if (
    cachedSourceRecord &&
    requestTimestampMs - cachedSourceRecord.createdAt < CAMERA_SOURCE_CACHE_TTL_MS
  )
    return cachedSourceRecord.source;
  const pendingSourceRequest = pendingSourceRequestByEntityId.get(normalizedCameraEntityId);
  if (pendingSourceRequest) return pendingSourceRequest;
  const sourceRequestPromise = (async () => {
    // 换票也要排队：大户型一轮预热最多 4 路，加上快照轮询会顶满同源连接池。
    const cameraHlsResponse = await withCameraHttpSlot(
      () =>
        fetch("/api/camera_hls/" + encodeURIComponent(normalizedCameraEntityId), {
          signal: options.signal,
        }),
      options.signal,
    );
    if (!cameraHlsResponse.ok)
      throw new Error("Camera HLS request failed: " + cameraHlsResponse.status);
    const cameraHlsPayload = await cameraHlsResponse.json(),
      cameraStreamUrl = typeof cameraHlsPayload?.url == "string" ? cameraHlsPayload.url.trim() : "";
    if (!cameraStreamUrl.startsWith("/")) throw new Error("Camera HLS response has no proxy URL");
    return (
      cameraSourceByEntityId.set(normalizedCameraEntityId, {
        source: cameraStreamUrl,
        createdAt: Date.now(),
      }),
      cameraStreamUrl
    );
  })();
  pendingSourceRequestByEntityId.set(normalizedCameraEntityId, sourceRequestPromise);
  try {
    return await sourceRequestPromise;
  } finally {
    pendingSourceRequestByEntityId.get(normalizedCameraEntityId) === sourceRequestPromise &&
      pendingSourceRequestByEntityId.delete(normalizedCameraEntityId);
  }
}
/**
 * 该摄像机控件是否值得预热 `/api/camera_hls/`。
 *
 * 快照模式不需要流；go2rtc 来源走 WebSocket 中继，预热只会白拉一路 HLS。
 * 判据放这里与 `prewarmCameraMedia` 同源，调用方（`panel-renderer.ts`）不必再展开四个条件。
 */
export function cameraRecordNeedsHlsPrewarm(cameraComponentRecord: any) {
  return (
    cameraComponentRecord.type === "camera" &&
    cameraComponentRecord.properties?.mediaVisible !== false &&
    cameraComponentRecord.properties?.displayMode !== "snapshot" &&
    cameraComponentRecord.properties?.cameraSource !== "go2rtc"
  );
}
export async function prewarmCameraMedia(cameraEntityIds: any[] = []) {
  if (document.visibilityState === "hidden") return;
  const uniqueCameraEntityIds = [
    ...new Set(
      (cameraEntityIds || [])
        .map((cameraEntityIdCandidate) => String(cameraEntityIdCandidate || "").trim())
        .filter(Boolean),
    ),
  ].slice(0, CAMERA_MAX_SOURCES);
  // 只有确有待预热的摄像头时才预取 620KB 的 hls.min.js：panel-renderer 传入的列表已按
  // cameraRecordNeedsHlsPrewarm 过滤，为空即本页没有任何 HLS 摄像头组件，不下发该脚本。
  if (!uniqueCameraEntityIds.length) return;
  prefetchHlsOnIdle();
  await Promise.allSettled(
    uniqueCameraEntityIds.map((prewarmEntityId) => resolveCameraStreamSource(prewarmEntityId)),
  );
}
export function mountCameraSnapshot({
  container: cameraContainerElement,
  entityId: snapshotEntityId,
  label: cameraLabel,
  objectFit: cameraObjectFit = "cover",
  refreshInterval: refreshIntervalSeconds = 10,
  placeholder: placeholderElement,
  cleanup: registerCleanup = (_cleanupRegistration: any) => {},
}: any) {
  const cameraImageElement = document.createElement("img");
  ((cameraImageElement.className = "hb-camera-image"),
    (cameraImageElement.alt = cameraLabel || snapshotEntityId),
    (cameraImageElement.draggable = false),
    (cameraImageElement.style.objectFit = cameraObjectFit));
  const rawRefreshInterval = Number(refreshIntervalSeconds),
    refreshInterval = Number.isFinite(rawRefreshInterval)
      ? Math.max(6, Math.round(rawRefreshInterval))
      : 10,
    refreshIntervalMs = Math.min(2147483000, refreshInterval * 1000);
  let isSnapshotLoading = false,
    isDocumentHidden = document.visibilityState === "hidden",
    refreshTimerId = 0,
    hasLoadedSnapshot = false,
    currentObjectUrl: any = null,
    activeAbortController: any = null;
  const entityRequestPolicy1 = new EntityRequestPolicy(),
    clearRefreshTimer = () => {
      (window.clearTimeout(refreshTimerId), (refreshTimerId = 0));
    },
    scheduleRefresh = (refreshDelayMs = refreshIntervalMs) => {
      (clearRefreshTimer(),
        !(isSnapshotLoading || isDocumentHidden || !Number.isFinite(refreshDelayMs)) &&
          (refreshTimerId = window.setTimeout(loadCameraSnapshot, refreshDelayMs)));
    },
    loadCameraSnapshot = async () => {
      if (isSnapshotLoading || isDocumentHidden || activeAbortController) return;
      if (!entityRequestPolicy1.canRequest(snapshotEntityId)) {
        entityRequestPolicy1.authBlocked ||
          scheduleRefresh(
            Math.max(
              0,
              (entityRequestPolicy1.entries.get(snapshotEntityId)?.nextAt ?? Infinity) - Date.now(),
            ),
          );
        return;
      }
      clearRefreshTimer();
      const snapshotAbortController = new AbortController();
      activeAbortController = snapshotAbortController;
      const abortTimeoutHandle = window.setTimeout(() => snapshotAbortController.abort(), 12000);
      try {
        cameraContainerElement.dataset.cameraState = "snapshot-loading";
        const snapshotResponse = await withCameraHttpSlot(
          () =>
            fetch(
              "/api/camera_proxy/" + encodeURIComponent(snapshotEntityId) + "?hb=" + Date.now(),
              {
                credentials: "same-origin",
                signal: snapshotAbortController.signal,
              },
            ),
          snapshotAbortController.signal,
        );
        if (
          isSnapshotLoading ||
          isDocumentHidden ||
          activeAbortController !== snapshotAbortController
        )
          return;
        if (!snapshotResponse.ok) {
          const failureRetryDelayMs = entityRequestPolicy1.failure(
            snapshotEntityId,
            snapshotResponse.status,
          );
          (hasLoadedSnapshot ||
            ((placeholderElement.hidden = false),
            (placeholderElement.textContent =
              snapshotResponse.status === 404
                ? "摄像头实体不可用，请检查绑定"
                : snapshotResponse.status === 401
                  ? "请登录后查看摄像头"
                  : "摄像头快照不可用")),
            (cameraContainerElement.dataset.cameraState = hasLoadedSnapshot
              ? "snapshot-stale"
              : "snapshot-unavailable"),
            scheduleRefresh(
              Number.isFinite(failureRetryDelayMs)
                ? Math.max(refreshIntervalMs, failureRetryDelayMs)
                : failureRetryDelayMs,
            ));
          return;
        }
        const snapshotBlob = await snapshotResponse.blob();
        if (
          isSnapshotLoading ||
          isDocumentHidden ||
          activeAbortController !== snapshotAbortController
        )
          return;
        if (!snapshotBlob.size) throw new Error("Empty camera snapshot");
        const snapshotObjectUrl = URL.createObjectURL(snapshotBlob),
          previousObjectUrl = currentObjectUrl;
        ((currentObjectUrl = snapshotObjectUrl),
          (cameraImageElement.src = snapshotObjectUrl),
          previousObjectUrl && URL.revokeObjectURL(previousObjectUrl));
      } catch {
        if (
          isSnapshotLoading ||
          isDocumentHidden ||
          activeAbortController !== snapshotAbortController
        )
          return;
        const unavailableRetryDelayMs = entityRequestPolicy1.failure(snapshotEntityId);
        ((cameraContainerElement.dataset.cameraState = hasLoadedSnapshot
          ? "snapshot-stale"
          : "snapshot-unavailable"),
          hasLoadedSnapshot ||
            ((placeholderElement.hidden = false),
            (placeholderElement.textContent = "摄像头快照不可用")),
          scheduleRefresh(Math.max(refreshIntervalMs, unavailableRetryDelayMs)));
      } finally {
        (window.clearTimeout(abortTimeoutHandle),
          activeAbortController === snapshotAbortController && (activeAbortController = null));
      }
    };
  (cameraImageElement.addEventListener("load", () => {
    isSnapshotLoading ||
      isDocumentHidden ||
      (entityRequestPolicy1.success(snapshotEntityId),
      (hasLoadedSnapshot = true),
      (placeholderElement.hidden = true),
      (cameraContainerElement.dataset.cameraState = "snapshot-ready"),
      scheduleRefresh());
  }),
    cameraImageElement.addEventListener("error", () => {
      isSnapshotLoading ||
        isDocumentHidden ||
        ((cameraContainerElement.dataset.cameraState = "snapshot-unavailable"),
        (placeholderElement.hidden = false),
        (placeholderElement.textContent = "摄像头快照不可用"),
        scheduleRefresh(
          Math.max(refreshIntervalMs, entityRequestPolicy1.failure(snapshotEntityId)),
        ));
    }));
  const suspendSnapshotRefresh = () => {
      (activeAbortController?.abort(), (activeAbortController = null), clearRefreshTimer());
    },
    handleRuntimeResume = (resumeEvent: any) => {
      isSnapshotLoading ||
        (resumeEvent?.type === "hb-runtime-ready"
          ? (entityRequestPolicy1.authenticated(),
            resumeEvent.detail?.entityIds?.includes(snapshotEntityId) &&
              entityRequestPolicy1.success(snapshotEntityId))
          : entityRequestPolicy1.resume(),
        !isDocumentHidden && loadCameraSnapshot());
    },
    handleVisibilityChange = () => {
      ((isDocumentHidden = document.visibilityState === "hidden"),
        isDocumentHidden
          ? (suspendSnapshotRefresh(),
            (cameraContainerElement.dataset.cameraState = "snapshot-suspended"))
          : loadCameraSnapshot());
    };
  return (
    (cameraContainerElement.dataset.cameraTransport = "snapshot"),
    cameraContainerElement.prepend(cameraImageElement),
    document.addEventListener("visibilitychange", handleVisibilityChange),
    window.addEventListener("online", handleRuntimeResume),
    window.addEventListener("hb-runtime-ready", handleRuntimeResume),
    isDocumentHidden
      ? (cameraContainerElement.dataset.cameraState = "snapshot-suspended")
      : loadCameraSnapshot(),
    registerCleanup(() => {
      ((isSnapshotLoading = true),
        suspendSnapshotRefresh(),
        document.removeEventListener("visibilitychange", handleVisibilityChange),
        window.removeEventListener("online", handleRuntimeResume),
        window.removeEventListener("hb-runtime-ready", handleRuntimeResume),
        cameraImageElement.removeAttribute("src"),
        currentObjectUrl && URL.revokeObjectURL(currentObjectUrl));
    }),
    {
      image: cameraImageElement,
    }
  );
}
/**
 * HLS → 12s/致命错误切 MJPEG（URL 无 query）→ 7s 无画面再试快照。
 *
 * 注意：勿因 CODECS=hvc1 立刻弃 HLS。本机 Chrome 对 hvc1 报 probably，
 * 而 HA 通用摄像头的 MJPEG 常返回 Content-Length:0 空体；过早降级反而必挂。
 */
export function mountCameraMedia({
  container: legacyContainerElement,
  entityId: legacySnapshotEntityId,
  label: legacyCameraLabel,
  objectFit: legacyObjectFit = "cover",
  placeholder: legacyPlaceholderElement,
  onStateChange: onVisualStateChange = (_visualState: string) => {},
  onReady: onTransportReady = () => {},
  onUnavailable: onTransportUnavailable = () => {},
  cleanup: registerLegacyCleanup = (_cleanupRegistration: () => void) => {},
  go2rtcUrl: legacyGo2rtcUrl = "",
  projectId: cameraProjectId = "",
  componentId: cameraComponentId = "",
  cameraId: cameraMarkerId = "",
}: any) {
  const cameraVideoElement = document.createElement("video");
  cameraVideoElement.className = "hb-camera-video";
  cameraVideoElement.setAttribute("aria-label", legacyCameraLabel || legacySnapshotEntityId);
  cameraVideoElement.autoplay = true;
  cameraVideoElement.muted = true;
  cameraVideoElement.playsInline = true;
  cameraVideoElement.disablePictureInPicture = true;
  cameraVideoElement.style.objectFit = legacyObjectFit;

  const fallbackImageElement = document.createElement("img");
  fallbackImageElement.className = "hb-camera-image";
  fallbackImageElement.alt = legacyCameraLabel || legacySnapshotEntityId;
  fallbackImageElement.draggable = false;
  fallbackImageElement.style.objectFit = legacyObjectFit;

  type TransportMode = "idle" | "hls" | "legacy" | "snapshot" | "go2rtc";
  let isTransportDisposed = false;
  let isLegacyTransport = false;
  let hasRequestedFallbackImage = false;
  let snapshotFailures = 0;
  let hlsManifestTimerId = 0;
  let hlsStartTimerId = 0;
  let legacyProbeTimerId = 0;
  let legacyPollTimerId = 0;
  let hlsPlayer: any = null;
  let hasVideoStarted = false;
  let transportGeneration = 0;
  let hlsAddressRetries = 0;
  let transportMode: TransportMode = "idle";
  let isPageHidden = document.visibilityState === "hidden";
  // go2rtc MSE：传输本体与视觉状态机都由共享实现负责，这里只持有句柄以便释放。
  let go2rtcTransport: Go2RtcMseTransportHandle | null = null;
  const cameraVisualState = createCameraVisualState(
    legacyContainerElement,
    onVisualStateChange,
  );
  const go2rtcSourceUrl = String(legacyGo2rtcUrl || "").trim();

  const mjpegStreamUrl = () =>
    "/api/camera_proxy_stream/" + encodeURIComponent(legacySnapshotEntityId);

  const clearTransportTimers = () => {
    window.clearTimeout(hlsManifestTimerId);
    window.clearTimeout(hlsStartTimerId);
    window.clearTimeout(legacyProbeTimerId);
    window.clearInterval(legacyPollTimerId);
    hlsManifestTimerId = 0;
    hlsStartTimerId = 0;
    legacyProbeTimerId = 0;
    legacyPollTimerId = 0;
  };

  const disposeCameraTransport = () => {
    transportGeneration += 1;
    transportMode = "idle";
    clearTransportTimers();
    go2rtcTransport?.dispose();
    go2rtcTransport = null;
    hlsPlayer?.destroy();
    hlsPlayer = null;
    cameraVideoElement.pause();
    cameraVideoElement.removeAttribute("src");
    cameraVideoElement.srcObject = null;
    cameraVideoElement.load();
    fallbackImageElement.removeAttribute("src");
    isLegacyTransport = false;
    hasRequestedFallbackImage = false;
    snapshotFailures = 0;
    hasVideoStarted = false;
  };

  const restoreVideoElement = () => {
    fallbackImageElement.remove();
    if (!cameraVideoElement.isConnected) legacyContainerElement.prepend(cameraVideoElement);
  };

  const handleTransportReady = () => {
    if (isTransportDisposed || isPageHidden || hasVideoStarted) return;
    hasVideoStarted = true;
    clearTransportTimers();
    legacyPlaceholderElement.hidden = true;
    onTransportReady();
  };

  const reportTransportUnavailable = (unavailableMessage = "摄像头实时预览不可用") => {
    if (isTransportDisposed || isPageHidden) return;
    hasVideoStarted = false;
    legacyPlaceholderElement.hidden = false;
    legacyPlaceholderElement.textContent = unavailableMessage;
    onTransportUnavailable();
  };

  const loadFallbackSnapshot = () => {
    if (isTransportDisposed || isPageHidden) return;
    fallbackImageElement.src =
      "/api/camera_proxy/" + encodeURIComponent(legacySnapshotEntityId) + "?hb=" + Date.now();
  };

  const armLegacyFrameWatch = (probeGeneration: number) => {
    window.clearInterval(legacyPollTimerId);
    window.clearTimeout(legacyProbeTimerId);
    // multipart MJPEG 有时不触发可靠的 load；轮询 naturalWidth
    legacyPollTimerId = window.setInterval(() => {
      if (
        isTransportDisposed ||
        probeGeneration !== transportGeneration ||
        (transportMode !== "legacy" && transportMode !== "snapshot")
      )
        return;
      if (fallbackImageElement.naturalWidth > 0) handleTransportReady();
    }, 250);
    legacyProbeTimerId = window.setTimeout(() => {
      if (probeGeneration !== transportGeneration || transportMode !== "legacy") return;
      if (fallbackImageElement.naturalWidth > 0) {
        handleTransportReady();
        return;
      }
      scheduleFallbackRequest(probeGeneration);
    }, 7000);
  };

  const scheduleFallbackRequest = (fallbackGeneration = transportGeneration) => {
    if (
      isTransportDisposed ||
      isPageHidden ||
      fallbackGeneration !== transportGeneration ||
      hasRequestedFallbackImage
    )
      return;
    transportGeneration += 1;
    transportMode = "snapshot";
    hasRequestedFallbackImage = true;
    window.clearTimeout(legacyProbeTimerId);
    loadFallbackSnapshot();
  };

  const switchToLegacyTransport = (
    legacyGeneration = transportGeneration,
    { force = false }: { force?: boolean } = {},
  ) => {
    if (
      isTransportDisposed ||
      isPageHidden ||
      (!force && legacyGeneration !== transportGeneration) ||
      (!force && isLegacyTransport)
    )
      return;
    const probeGeneration = ++transportGeneration;
    transportMode = "legacy";
    isLegacyTransport = true;
    hasRequestedFallbackImage = false;
    hasVideoStarted = false;
    legacyPlaceholderElement.hidden = false;
    legacyPlaceholderElement.textContent = "摄像头正在连接";
    legacyContainerElement.dataset.cameraTransport = "legacy";
    window.clearTimeout(hlsStartTimerId);
    hlsPlayer?.destroy();
    hlsPlayer = null;
    cameraVideoElement.pause();
    cameraVideoElement.removeAttribute("src");
    cameraVideoElement.load();
    cameraVideoElement.remove();
    legacyContainerElement.prepend(fallbackImageElement);
    // 快照 URL 不带 query，避免缓存失效
    fallbackImageElement.src = mjpegStreamUrl();
    armLegacyFrameWatch(probeGeneration);
  };

  const onVideoProgress = () => {
    if (transportMode === "hls" && cameraVideoElement.readyState >= 2) handleTransportReady();
  };

  cameraVideoElement.addEventListener("loadeddata", onVideoProgress);
  cameraVideoElement.addEventListener("playing", onVideoProgress);
  cameraVideoElement.addEventListener("error", () => {
    if (transportMode === "hls" && !hlsPlayer) switchToLegacyTransport();
  });
  fallbackImageElement.addEventListener("load", () => {
    if (
      ["legacy", "snapshot"].includes(transportMode) &&
      fallbackImageElement.naturalWidth > 0
    ) {
      handleTransportReady();
    }
  });
  fallbackImageElement.addEventListener("error", () => {
    if (
      isTransportDisposed ||
      isPageHidden ||
      !["legacy", "snapshot"].includes(transportMode)
    )
      return;
    if (transportMode === "snapshot" || hasRequestedFallbackImage) {
      snapshotFailures += 1;
      // 无 still_image_url 的通用摄像头快照必 500：回到 MJPEG
      if (snapshotFailures <= 3) {
        isLegacyTransport = false;
        switchToLegacyTransport(transportGeneration, { force: true });
        return;
      }
      reportTransportUnavailable();
      return;
    }
    scheduleFallbackRequest();
  });
  legacyContainerElement.prepend(cameraVideoElement);

  const startHlsPlayback = async (playbackGeneration: number) => {
    // hls.js 脚本按需加载：与流地址换票并行启动，避免首帧多等一个 RTT；失败时按原逻辑走快照/MJPEG。
    const hlsRuntimePromise = ensureHls();
    try {
      const hlsSourceUrl = await resolveCameraStreamSource(legacySnapshotEntityId);
      if (isTransportDisposed || isPageHidden || playbackGeneration !== transportGeneration) return;
      legacyContainerElement.dataset.cameraHlsSource = hlsSourceUrl;
      legacyContainerElement.dataset.cameraTransport = "hls";
      const hlsRuntime = (await hlsRuntimePromise) as HlsRuntime | null;
      // 脚本加载期间页面可能已隐藏/卸载或已切走传输模式，恢复前必须重新校验。
      if (isTransportDisposed || isPageHidden || playbackGeneration !== transportGeneration) return;
      if (hlsRuntime?.isSupported?.()) {
        const player = new hlsRuntime({
          lowLatencyMode: true,
          backBufferLength: 15,
          maxBufferLength: 15,
          maxMaxBufferLength: 15,
          maxBufferSize: 0x7a1200,
        });
        hlsPlayer = player;
        const isCurrent = () =>
          !isTransportDisposed &&
          !isPageHidden &&
          playbackGeneration === transportGeneration &&
          transportMode === "hls" &&
          hlsPlayer === player;
        player.on(hlsRuntime.Events.MEDIA_ATTACHED, () => {
          if (isCurrent()) player.loadSource(hlsSourceUrl);
        });
        player.on(hlsRuntime.Events.MANIFEST_PARSED, () => {
          if (!isCurrent()) return;
          hlsAddressRetries = 0;
          legacyContainerElement.dataset.cameraState = "manifest-parsed";
          cameraVideoElement.play().catch(() => {});
        });
        player.on(hlsRuntime.Events.ERROR, (_ev: any, hlsErrorPayload: any) => {
          if (!isCurrent() || !hlsErrorPayload?.fatal) return;
          cameraSourceByEntityId.delete(String(legacySnapshotEntityId || "").trim());
          legacyContainerElement.dataset.cameraState = "hls-failed";
          legacyContainerElement.dataset.cameraError = [
            hlsErrorPayload.type,
            hlsErrorPayload.details,
            hlsErrorPayload.url || hlsErrorPayload.response?.url || "",
            hlsErrorPayload.response?.code || 0,
            hlsErrorPayload.reason || hlsErrorPayload.error?.message || "",
          ].join(" | ");
          window.HomeOSLog?.report?.(
            "error",
            "摄像头",
            "摄像头播放失败：" +
              (hlsErrorPayload.type || "") +
              " / " +
              (hlsErrorPayload.details || ""),
            {
              entityId: legacySnapshotEntityId,
              phase: "hls-playback",
              status: hlsErrorPayload.response?.code || 0,
              path: hlsErrorPayload.url || hlsErrorPayload.response?.url || "",
            },
          );
          console.warn("[HomeOS camera] HLS playback failed", {
            entityId: legacySnapshotEntityId,
            type: hlsErrorPayload.type,
            details: hlsErrorPayload.details,
            url: hlsErrorPayload.url || hlsErrorPayload.response?.url || "",
            status: hlsErrorPayload.response?.code || 0,
            reason: hlsErrorPayload.reason || hlsErrorPayload.error?.message || "",
          });
          if (
            isExpiredStreamAddressError(hlsErrorPayload) &&
            hlsAddressRetries < HLS_ADDRESS_RETRY_LIMIT
          ) {
            // HA 一路流只有一个 hls token：流 worker 重建（时间戳不连续 / 空闲回收）后旧地址
            // 立刻 404，重新 `camera/stream` 换票通常就能恢复。这里不能降级——通用摄像头的
            // MJPEG 常为空体、快照常 500，两条降级路都是死的。
            hlsAddressRetries += 1;
            player.destroy();
            if (hlsPlayer === player) hlsPlayer = null;
            cameraVideoElement.pause();
            cameraVideoElement.removeAttribute("src");
            cameraVideoElement.load();
            window.clearTimeout(hlsStartTimerId);
            const retryGeneration = ++transportGeneration;
            transportMode = "hls";
            legacyContainerElement.dataset.cameraState = "retrying";
            hlsStartTimerId = window.setTimeout(
              () => switchToLegacyTransport(retryGeneration),
              HLS_START_TIMEOUT_MS,
            );
            void startHlsPlayback(retryGeneration);
            return;
          }
          switchToLegacyTransport(playbackGeneration);
        });
        player.attachMedia(cameraVideoElement);
      } else {
        cameraVideoElement.src = hlsSourceUrl;
        cameraVideoElement.play().catch(() => {});
      }
    } catch (hlsPlaybackError: any) {
      if (isTransportDisposed || isPageHidden || playbackGeneration !== transportGeneration) return;
      legacyContainerElement.dataset.cameraState = "setup-failed";
      legacyContainerElement.dataset.cameraError = String(hlsPlaybackError);
      window.HomeOSLog?.error?.(
        hlsPlaybackError,
        { entityId: legacySnapshotEntityId, phase: "hls-setup" },
        "摄像头连接失败：" + (hlsPlaybackError?.message || hlsPlaybackError),
      );
      console.warn("[HomeOS camera] HLS setup failed", {
        entityId: legacySnapshotEntityId,
        error: String(hlsPlaybackError),
      });
      switchToLegacyTransport(playbackGeneration);
    }
  };

  /**
   * go2rtc MSE 通道。
   *
   * 与 HLS 不同，这里**不做** MJPEG 降级：go2rtc 的正路就是 MSE，重连退避由共享传输自己负责，
   * 只有它宣告终态（配置错误、被拒、浏览器不支持）时才把占位文案交回上层。
   */
  const startGo2rtcPlayback = (playbackGeneration: number) => {
    const generation = playbackGeneration;
    transportMode = "go2rtc";
    legacyContainerElement.dataset.cameraTransport = GO2RTC_TRANSPORT_NAME;
    legacyContainerElement.dataset.cameraState = "starting";
    go2rtcTransport = createGo2RtcMseTransport({
      video: cameraVideoElement,
      url: go2rtcSourceUrl,
      projectId: cameraProjectId,
      componentId: cameraComponentId,
      cameraId: cameraMarkerId,
      onStateChange: (visualState, stateMessage) => {
        if (isTransportDisposed || generation !== transportGeneration) return;
        cameraVisualState.setState(visualState);
        legacyContainerElement.dataset.cameraState = visualState;
        // `ready` 既走这里也走 onReady，靠 handleTransportReady 的 hasVideoStarted 去重；
        // 重连时把占位重新显出来，否则断线期间会留一块黑画面。
        if (visualState === "ready") {
          handleTransportReady();
          return;
        }
        hasVideoStarted = false;
        legacyPlaceholderElement.hidden = false;
        legacyPlaceholderElement.textContent = stateMessage || "摄像头正在连接";
      },
      onReady: () => {
        if (isTransportDisposed || generation !== transportGeneration) return;
        handleTransportReady();
      },
      onUnavailable: (message) => {
        if (isTransportDisposed || generation !== transportGeneration) return;
        cameraVisualState.setState("unavailable");
        legacyContainerElement.dataset.cameraState = "unavailable";
        reportTransportUnavailable(message || "摄像头实时预览不可用");
      },
    });
  };

  const resumeDeferredPlayback = () => {
    if (isTransportDisposed || isPageHidden) return;
    restoreVideoElement();
    hasVideoStarted = false;
    isLegacyTransport = false;
    hasRequestedFallbackImage = false;
    snapshotFailures = 0;
    hlsAddressRetries = 0;
    legacyPlaceholderElement.hidden = false;
    legacyPlaceholderElement.textContent = "摄像头正在连接";
    const generation = transportGeneration;
    cameraVisualState.setState("connecting");
    // go2rtc 来源：地址非空即直接走 MSE，且**不挂** 12s 降级定时器——MSE 不该退回 MJPEG。
    if (go2rtcSourceUrl) {
      startGo2rtcPlayback(generation);
      return;
    }
    transportMode = "hls";
    legacyContainerElement.dataset.cameraState = "starting";
    void startHlsPlayback(generation);
    hlsStartTimerId = window.setTimeout(
      () => switchToLegacyTransport(generation),
      HLS_START_TIMEOUT_MS,
    );
  };

  const handlePageHidden = () => {
    if (document.visibilityState === "hidden") {
      if (isPageHidden) return;
      isPageHidden = true;
      disposeCameraTransport();
      cameraVisualState.setState("suspended");
      legacyContainerElement.dataset.cameraState = "suspended";
      legacyPlaceholderElement.hidden = false;
      legacyPlaceholderElement.textContent = "摄像头已在后台暂停";
      return;
    }
    if (isPageHidden) {
      isPageHidden = false;
      resumeDeferredPlayback();
    }
  };

  document.addEventListener("visibilitychange", handlePageHidden);
  if (isPageHidden) {
    cameraVisualState.setState("suspended");
    legacyContainerElement.dataset.cameraState = "suspended";
    legacyPlaceholderElement.hidden = false;
    legacyPlaceholderElement.textContent = "摄像头已在后台暂停";
  } else {
    cameraVisualState.setState("connecting");
    legacyContainerElement.dataset.cameraState = "deferred";
    hlsManifestTimerId = window.setTimeout(resumeDeferredPlayback, 0);
  }
  registerLegacyCleanup(() => {
    isTransportDisposed = true;
    document.removeEventListener("visibilitychange", handlePageHidden);
    disposeCameraTransport();
    cameraVisualState.dispose();
  });
  return {
    video: cameraVideoElement,
    image: fallbackImageElement,
  };
}
