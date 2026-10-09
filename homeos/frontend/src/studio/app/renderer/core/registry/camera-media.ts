/** registry 相机媒体子模块：从 registry.ts 抽出，负责摄像头快照/HLS 实时预览挂载。 */
import { EntityRequestPolicy } from "../panel-caches";
import { clampNumber, normalizeCssColor, createSvgElement, resolveStatePayload } from "./_shared";
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
    ? clampNumber(
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
    cameraFrameStrokeWidth = clampNumber(cameraFrameOptions.frameWidth, 0, 20, 1);
  if (cameraFrameStrokeWidth <= 0) return null;
  const frameStrokeInset = Math.max(0.5, cameraFrameStrokeWidth / 2 + 0.5),
    frameInnerWidth = Math.max(1, viewportPixelWidth - frameStrokeInset * 2),
    frameInnerHeight = Math.max(1, viewportPixelHeight - frameStrokeInset * 2),
    cornerRadiusRatio = cameraRadiusRatio(cameraFrameOptions.radius),
    frameCornerRadius = Math.min(frameInnerWidth, frameInnerHeight) * cornerRadiusRatio,
    cameraFrameOpacity = clampNumber(cameraFrameOptions.frameOpacity, 0, 1, 0.9),
    cameraFrameColor = normalizeCssColor(cameraFrameOptions.frameColor, "#d4d4d4"),
    cameraFrameId =
      frameIdPrefix +
      "-camera-frame-" +
      String(targetEntityFrame?.id || "").replace(/[^a-z0-9_-]/gi, ""),
    cameraFrameSvgElement = createSvgElement(frameHostElement, "svg", {
      class: "hb-camera-frame",
      viewBox: "0 0 " + viewportPixelWidth + " " + viewportPixelHeight,
      preserveAspectRatio: "none",
      "aria-hidden": "true",
    }),
    cameraFrameDefsElement = createSvgElement(cameraFrameSvgElement, "defs"),
    cameraFrameGradientElement = createSvgElement(cameraFrameDefsElement, "linearGradient", {
      id: cameraFrameId + "-edge",
      gradientUnits: "userSpaceOnUse",
      x1: 0,
      y1: viewportPixelHeight / 2,
      x2: viewportPixelWidth,
      y2: viewportPixelHeight / 2,
      gradientTransform:
        "rotate(" +
        clampNumber(cameraFrameOptions.frameAngle, 0, 360, 45) +
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
    createSvgElement(cameraFrameGradientElement, "stop", {
      offset: gradientStopOffset,
      "stop-color": cameraFrameColor,
      "stop-opacity": gradientStopOpacity * cameraFrameOpacity,
    });
  return (
    createSvgElement(cameraFrameSvgElement, "rect", {
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
    const cameraHlsResponse = await fetch(
      "/api/camera_hls/" + encodeURIComponent(normalizedCameraEntityId),
      {
        signal: options.signal,
      },
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
export async function prewarmCameraMedia(cameraEntityIds: any[] = []) {
  if (document.visibilityState === "hidden") return;
  const uniqueCameraEntityIds = [
    ...new Set(
      (cameraEntityIds || [])
        .map((cameraEntityIdCandidate) => String(cameraEntityIdCandidate || "").trim())
        .filter(Boolean),
    ),
  ].slice(0, CAMERA_MAX_SOURCES);
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
        const snapshotResponse = await fetch(
          "/api/camera_proxy/" + encodeURIComponent(snapshotEntityId) + "?hb=" + Date.now(),
          {
            credentials: "same-origin",
            signal: snapshotAbortController.signal,
          },
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
 * 移植自 源代码/0.7.2 registry.js mountCameraMedia，并补上当前 HA 通用摄像头缺口：
 * - HLS → 12s/致命错误切 MJPEG（URL 无 query）→ 7s 无画面再试快照
 * - 清单为 HEVC / 解析后 2s 仍无画面：立刻 MJPEG（Chrome 对 H.265 假成功会拖死）
 * - 无 still_image 时快照恒 500：失败后回到 MJPEG，而不是直接「不可用」
 * - multipart 出帧轮询 naturalWidth（不单靠 load + currentSrc）
 */
export function mountCameraMedia({
  container: legacyContainerElement,
  entityId: legacySnapshotEntityId,
  label: legacyCameraLabel,
  objectFit: legacyObjectFit = "cover",
  placeholder: legacyPlaceholderElement,
  onReady: onTransportReady = () => {},
  onUnavailable: onTransportUnavailable = () => {},
  cleanup: registerLegacyCleanup = (_cleanupRegistration: () => void) => {},
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

  type TransportMode = "idle" | "hls" | "legacy" | "snapshot";
  let isTransportDisposed = false;
  let isLegacyTransport = false;
  let hasRequestedFallbackImage = false;
  let snapshotFailures = 0;
  let hlsManifestTimerId = 0;
  let hlsStartTimerId = 0;
  let hlsStallTimerId = 0;
  let legacyProbeTimerId = 0;
  let legacyPollTimerId = 0;
  let hlsPlayer: any = null;
  let hasVideoStarted = false;
  let transportGeneration = 0;
  let transportMode: TransportMode = "idle";
  let isPageHidden = document.visibilityState === "hidden";

  const mjpegStreamUrl = () =>
    "/api/camera_proxy_stream/" + encodeURIComponent(legacySnapshotEntityId);

  const playlistLooksHevc = (manifestPayload: any) => {
    const levels = Array.isArray(manifestPayload?.levels) ? manifestPayload.levels : [];
    const blob = levels
      .map((level: any) => String(level?.videoCodec || level?.codecs || level?.attrs?.CODECS || ""))
      .join(",")
      .toLowerCase();
    return /hvc1|hev1|hevc/.test(blob);
  };

  const clearTransportTimers = () => {
    window.clearTimeout(hlsManifestTimerId);
    window.clearTimeout(hlsStartTimerId);
    window.clearTimeout(hlsStallTimerId);
    window.clearTimeout(legacyProbeTimerId);
    window.clearInterval(legacyPollTimerId);
    hlsManifestTimerId = 0;
    hlsStartTimerId = 0;
    hlsStallTimerId = 0;
    legacyProbeTimerId = 0;
    legacyPollTimerId = 0;
  };

  const disposeCameraTransport = () => {
    transportGeneration += 1;
    transportMode = "idle";
    clearTransportTimers();
    hlsPlayer?.destroy();
    hlsPlayer = null;
    cameraVideoElement.pause();
    cameraVideoElement.removeAttribute("src");
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

  const reportTransportUnavailable = () => {
    if (isTransportDisposed || isPageHidden) return;
    hasVideoStarted = false;
    legacyPlaceholderElement.hidden = false;
    legacyPlaceholderElement.textContent = "摄像头实时预览不可用";
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
    window.clearTimeout(hlsStallTimerId);
    hlsPlayer?.destroy();
    hlsPlayer = null;
    cameraVideoElement.pause();
    cameraVideoElement.removeAttribute("src");
    cameraVideoElement.load();
    cameraVideoElement.remove();
    legacyContainerElement.prepend(fallbackImageElement);
    // 先让 HA 释放 HLS/RTSP 会话，再挂 MJPEG（与 0.7.2 同 URL，无 query）
    window.setTimeout(() => {
      if (isTransportDisposed || probeGeneration !== transportGeneration || transportMode !== "legacy")
        return;
      fallbackImageElement.src = mjpegStreamUrl();
      armLegacyFrameWatch(probeGeneration);
    }, force ? 0 : 200);
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
    try {
      const hlsSourceUrl = await resolveCameraStreamSource(legacySnapshotEntityId);
      if (isTransportDisposed || isPageHidden || playbackGeneration !== transportGeneration) return;
      legacyContainerElement.dataset.cameraHlsSource = hlsSourceUrl;
      legacyContainerElement.dataset.cameraTransport = "hls";
      const hlsRuntime = window.Hls as HlsRuntime | undefined;
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
        player.on(hlsRuntime.Events.MANIFEST_PARSED, (_ev: any, manifestPayload: any) => {
          if (!isCurrent()) return;
          if (playlistLooksHevc(manifestPayload)) {
            legacyContainerElement.dataset.cameraState = "hls-hevc-fallback";
            switchToLegacyTransport(playbackGeneration);
            return;
          }
          legacyContainerElement.dataset.cameraState = "manifest-parsed";
          cameraVideoElement.play().catch(() => {});
          // H.265 未标 codec 时也会黑屏不 fatal：2s 无画面就切 MJPEG
          window.clearTimeout(hlsStallTimerId);
          hlsStallTimerId = window.setTimeout(() => {
            if (isCurrent() && cameraVideoElement.readyState < 2) {
              legacyContainerElement.dataset.cameraState = "hls-stall-fallback";
              switchToLegacyTransport(playbackGeneration);
            }
          }, 2000);
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

  const resumeDeferredPlayback = () => {
    if (isTransportDisposed || isPageHidden) return;
    restoreVideoElement();
    hasVideoStarted = false;
    isLegacyTransport = false;
    hasRequestedFallbackImage = false;
    snapshotFailures = 0;
    legacyPlaceholderElement.hidden = false;
    legacyPlaceholderElement.textContent = "摄像头正在连接";
    const generation = transportGeneration;
    transportMode = "hls";
    legacyContainerElement.dataset.cameraState = "starting";
    void startHlsPlayback(generation);
    hlsStartTimerId = window.setTimeout(() => switchToLegacyTransport(generation), 12000);
  };

  const handlePageHidden = () => {
    if (document.visibilityState === "hidden") {
      if (isPageHidden) return;
      isPageHidden = true;
      disposeCameraTransport();
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
    legacyContainerElement.dataset.cameraState = "suspended";
    legacyPlaceholderElement.hidden = false;
    legacyPlaceholderElement.textContent = "摄像头已在后台暂停";
  } else {
    legacyContainerElement.dataset.cameraState = "deferred";
    hlsManifestTimerId = window.setTimeout(resumeDeferredPlayback, 0);
  }
  registerLegacyCleanup(() => {
    isTransportDisposed = true;
    document.removeEventListener("visibilitychange", handlePageHidden);
    disposeCameraTransport();
  });
  return {
    video: cameraVideoElement,
    image: fallbackImageElement,
  };
}
