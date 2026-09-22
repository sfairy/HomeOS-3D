/**
 * 摄像头控件的取流与挂载：快照静态图、HLS 视频、预热门禁。
 *
 * 两个 Map 是模块级缓存（按实体 ID），跨控件实例共用，避免同屏多个摄像头重复取流；
 * 缓存 TTL 与预热上限是刻意常量，调整前先确认不会把 NAS 上的转码打满。
 */
// 数值夹取统一走 utils/numbers.js。`clampNumber` 只用于三处：那三处 `clampCoercedNumber`
// 的兜底是**算出来的表达式**、存在越界的现实可能，所以要在调用点先夹一次
// （见 `utils/numbers.js` 模块头那张口径表）。
import { clampCoercedNumber } from "../../../utils/numbers.js?v=2609221226";
// 生产控制台里的诊断输出统一走 utils/debug-log.js（默认静默，只在 ?debug=1 时输出）。
import { debugLog } from "../../../utils/debug-log.js?v=2609221226";
// 同门分片：registry-visuals
import {
  appendSvgElement,
  resolveColor
} from "./registry-visuals.js?v=2609221226";

/**
 * 取摄像头圆形裁剪的半径比例。
 * 入参可能是 0~1 比例或 0~100 百分比，用「是否大于 0.5」区分（两种量纲分界明显）。
 */
export function cameraRadiusRatio(radiusValue, fallbackRadiusRatio = 0.04) {
  const parsedRadius = Number(radiusValue);
  if (Number.isFinite(parsedRadius)) {
    return clampCoercedNumber(
      parsedRadius > 0.5 ? parsedRadius / 100 : parsedRadius,
      0,
      0.5,
      fallbackRadiusRatio
    );
  } else {
    return fallbackRadiusRatio;
  }
}

/**
 * 给摄像头容器补一层边框：只画边框不含内容，宽高优先取控件尺寸，取不到才用容器客户端尺寸。
 * 边框宽度为 0 或显式关闭时返回 null，调用方不必再判断。
 */
export function appendCameraFrame(
  frameContainerElement,
  frameComponent,
  frameProperties = {},
  frameNamespace = "renderer"
) {
  if (!frameContainerElement || frameProperties.frameVisible === false) {
    return null;
  }
  const cameraFrameWidth = Math.max(
    20,
    Number(frameComponent?.position?.width || frameContainerElement.clientWidth || 320)
  );
  const cameraFrameHeight = Math.max(
    20,
    Number(frameComponent?.position?.height || frameContainerElement.clientHeight || 180)
  );
  const cameraFrameBorderWidth = clampCoercedNumber(frameProperties.frameWidth, 0, 20, 1);
  if (cameraFrameBorderWidth <= 0) {
    return null;
  }
  const cameraFrameInset = Math.max(0.5, cameraFrameBorderWidth / 2 + 0.5);
  const cameraFrameInnerWidth = Math.max(1, cameraFrameWidth - cameraFrameInset * 2);
  const cameraFrameInnerHeight = Math.max(1, cameraFrameHeight - cameraFrameInset * 2);
  const cameraFrameRadiusRatio = cameraRadiusRatio(frameProperties.radius);
  const cameraFrameCornerRadius =
    Math.min(cameraFrameInnerWidth, cameraFrameInnerHeight) * cameraFrameRadiusRatio;
  const cameraFrameOpacity = clampCoercedNumber(frameProperties.frameOpacity, 0, 1, 0.9);
  const cameraFrameColor = resolveColor(frameProperties.frameColor, "#d4d4d4");
  const cameraFrameId =
    frameNamespace +
    "-camera-frame-" +
    String(frameComponent?.id || "").replace(/[^a-z0-9_-]/gi, "");
  const cameraFrameSvg = appendSvgElement(frameContainerElement, "svg", {
    class: "hb-camera-frame",
    viewBox: "0 0 " + cameraFrameWidth + " " + cameraFrameHeight,
    preserveAspectRatio: "none",
    "aria-hidden": "true"
  });
  const cameraFrameDefs = appendSvgElement(cameraFrameSvg, "defs");
  const cameraFrameEdgeGradient = appendSvgElement(cameraFrameDefs, "linearGradient", {
    id: cameraFrameId + "-edge",
    gradientUnits: "userSpaceOnUse",
    x1: 0,
    y1: cameraFrameHeight / 2,
    x2: cameraFrameWidth,
    y2: cameraFrameHeight / 2,
    gradientTransform:
      "rotate(" +
      clampCoercedNumber(frameProperties.frameAngle, 0, 360, 45) +
      " " +
      cameraFrameWidth / 2 +
      " " +
      cameraFrameHeight / 2 +
      ")"
  });
  for (const [cameraFrameStopOffset, cameraFrameStopOpacity] of [
    [0, 0.96],
    [0.22, 0.72],
    [0.52, 0.3],
    [0.78, 0.66],
    [1, 0.42]
  ]) {
    appendSvgElement(cameraFrameEdgeGradient, "stop", {
      offset: cameraFrameStopOffset,
      "stop-color": cameraFrameColor,
      "stop-opacity": cameraFrameStopOpacity * cameraFrameOpacity
    });
  }
  appendSvgElement(cameraFrameSvg, "rect", {
    x: cameraFrameInset,
    y: cameraFrameInset,
    width: cameraFrameInnerWidth,
    height: cameraFrameInnerHeight,
    rx: cameraFrameCornerRadius,
    fill: "none",
    stroke: "url(#" + cameraFrameId + "-edge)",
    "stroke-width": cameraFrameBorderWidth,
    "vector-effect": "non-scaling-stroke"
  });
  return cameraFrameSvg;
}

// HLS 播放地址的缓存有效期：30 秒。太短会频繁请求后端换取地址，太长会让过期的会话继续使用。
const CAMERA_HLS_CACHE_TTL_MS = 30000;

const CAMERA_PREWARM_LIMIT = 4;

const cameraSourceCache = new Map();

const cameraSourceInflight = new Map();

/**
 * 取摄像头的 HLS 播放地址（带缓存与并发合并）：同一实体在有效期内的请求直接命中缓存，
 * 未完成的请求按实体合并，多个控件同时挂载同一路摄像头时只会真正请求一次。
 * @throws {Error} 实体 ID 为空或后端返回失败时抛出。
 */
async function fetchCameraHlsSource(cameraEntityId) {
  const normalizedCameraEntityId = String(cameraEntityId || "").trim();
  if (!normalizedCameraEntityId) {
    throw new Error("Camera entity is required");
  }
  const requestStartTimestamp = Date.now();
  const cachedSourceEntry = cameraSourceCache.get(normalizedCameraEntityId);
  if (
    cachedSourceEntry &&
    requestStartTimestamp - cachedSourceEntry.createdAt < CAMERA_HLS_CACHE_TTL_MS
  ) {
    return cachedSourceEntry.source;
  }
  const inflightSourcePromise = cameraSourceInflight.get(normalizedCameraEntityId);
  if (inflightSourcePromise) {
    return inflightSourcePromise;
  }
    // 把「请求 → 解析 → 写缓存」包成一个 Promise 并立刻登记进 cameraSourceInflight：
    // 后到的同实体请求直接复用这个 Promise，实现并发合并。
    const pendingSourcePromise = (async () => {
    const hlsFetchResponse = await fetch(
      "/api/camera_hls/" + encodeURIComponent(normalizedCameraEntityId)
    );
    const hlsPayload = await hlsFetchResponse.json().catch(() => ({}));
    if (!hlsFetchResponse.ok) {
      throw new Error(
        hlsPayload?.detail || "Camera HLS request failed: " + hlsFetchResponse.status
      );
    }
    const hlsProxyUrl = typeof hlsPayload?.url == "string" ? hlsPayload.url.trim() : "";
    if (!hlsProxyUrl.startsWith("/")) {
      cameraSourceCache.set(normalizedCameraEntityId, {
        source: "",
        createdAt: Date.now()
      });
      return "";
    }
    cameraSourceCache.set(normalizedCameraEntityId, {
      source: hlsProxyUrl,
      createdAt: Date.now()
    });
    return hlsProxyUrl;
  })();
  cameraSourceInflight.set(normalizedCameraEntityId, pendingSourcePromise);
  try {
    return await pendingSourcePromise;
  } finally {
    if (cameraSourceInflight.get(normalizedCameraEntityId) === pendingSourcePromise) {
      cameraSourceInflight.delete(normalizedCameraEntityId);
    }
  }
}

/**
 * 预热摄像头播放地址。
 * 页面隐藏时不预热（看不到还白占带宽），数量截到 CAMERA_PREWARM_LIMIT；失败用 allSettled 吞掉，
 * 预热是可选优化，不该影响页面。
 */
export async function prewarmCameraMedia(prewarmEntityIds = []) {
  if (document.visibilityState === "hidden") {
    return;
  }
  const prewarmTargetEntityIds = [
    ...new Set(
      (prewarmEntityIds || [])
        .map(prewarmEntityId => String(prewarmEntityId || "").trim())
        .filter(Boolean)
    )
  ].slice(0, CAMERA_PREWARM_LIMIT);
  await Promise.allSettled(
    prewarmTargetEntityIds.map(prewarmRequestEntityId =>
      fetchCameraHlsSource(prewarmRequestEntityId)
    )
  );
}

/**
 * 在容器里挂一张定时刷新的摄像头快照。
 * 刷新间隔下限 6 秒（再短对后端与浏览器不划算），并夹在 setTimeout 最大值内；
 * 页面隐藏时挂起定时器，回到前台立刻补一次，避免后台空转。
 */
export function mountCameraSnapshot({
  container: snapshotContainer,
  entityId: snapshotEntityId,
  label: snapshotLabel,
  objectFit: snapshotObjectFit = "cover",
  refreshInterval: snapshotRefreshSeconds = 10,
  placeholder: snapshotPlaceholderElement,
  cleanup: snapshotCleanup = () => {}
}) {
  const snapshotImageElement = document.createElement("img");
  snapshotImageElement.className = "hb-camera-image";
  snapshotImageElement.alt = snapshotLabel || snapshotEntityId;
  snapshotImageElement.draggable = false;
  snapshotImageElement.style.objectFit = snapshotObjectFit;
  const snapshotRefreshValue = Number(snapshotRefreshSeconds);
  const snapshotRefreshSecondsClamped = Number.isFinite(snapshotRefreshValue)
    ? Math.max(6, Math.round(snapshotRefreshValue))
    : 10;
  const snapshotRefreshMs = Math.min(2147483000, snapshotRefreshSecondsClamped * 1000);
  let isSnapshotDisposed = false;
  let isSnapshotSuspended = document.visibilityState === "hidden";
  let snapshotRefreshTimeoutId = 0;
  let hasSnapshotLoaded = false;
  let snapshotRequestId = 0;
  // 统一的清表入口：顺手把 id 归零，于是「有没有定时器」只用 0 一个哨兵判断。
  const clearSnapshotRefreshTimer = () => {
    window.clearTimeout(snapshotRefreshTimeoutId);
    snapshotRefreshTimeoutId = 0;
  };
  // 排下一次刷新：先清旧表再排新表，保证同一时刻只有一个定时器；
  // 已销毁或处于后台挂起时不排，避免无人观看时空转请求。
  const scheduleSnapshotRefresh = () => {
    clearSnapshotRefreshTimer();
    if (!isSnapshotDisposed && !isSnapshotSuspended) {
      snapshotRefreshTimeoutId = window.setTimeout(loadCameraSnapshot, snapshotRefreshMs);
    }
  };
  // 取一张新快照：首张直接把地址交给可见的 img 并显示加载文案；
  // 之后改用离屏 img 预载，等 load 成功才替换可见图，刷新时不会闪白。
  const loadCameraSnapshot = () => {
    if (isSnapshotDisposed || isSnapshotSuspended) {
      return;
    }
    clearSnapshotRefreshTimer();
    const snapshotProxyUrl =
      "/api/camera_proxy/" + encodeURIComponent(snapshotEntityId) + "?hb=" + Date.now();
    if (!hasSnapshotLoaded) {
      snapshotPlaceholderElement.hidden = false;
      snapshotPlaceholderElement.textContent = "正在载入摄像头快照";
      snapshotContainer.dataset.cameraState = "snapshot-loading";
      snapshotImageElement.src = snapshotProxyUrl;
      return;
    }
    snapshotContainer.dataset.cameraState = "snapshot-loading";
    const currentSnapshotRequestId = ++snapshotRequestId;
    const preloadSnapshotImage = document.createElement("img");
    preloadSnapshotImage.addEventListener("load", () => {
      if (
        !isSnapshotDisposed &&
        !isSnapshotSuspended &&
        currentSnapshotRequestId === snapshotRequestId
      ) {
        snapshotImageElement.src = snapshotProxyUrl;
      }
    });
    preloadSnapshotImage.addEventListener("error", () => {
      if (
        !isSnapshotDisposed &&
        !isSnapshotSuspended &&
        currentSnapshotRequestId === snapshotRequestId
      ) {
        snapshotContainer.dataset.cameraState = "snapshot-stale";
        scheduleSnapshotRefresh();
      }
    });
    preloadSnapshotImage.src = snapshotProxyUrl;
  };
  snapshotImageElement.addEventListener("load", () => {
    if (!isSnapshotDisposed && !isSnapshotSuspended) {
      hasSnapshotLoaded = true;
      snapshotPlaceholderElement.hidden = true;
      snapshotContainer.dataset.cameraState = "snapshot-ready";
      scheduleSnapshotRefresh();
    }
  });
  snapshotImageElement.addEventListener("error", () => {
    if (!isSnapshotDisposed && !isSnapshotSuspended) {
      snapshotPlaceholderElement.hidden = false;
      snapshotPlaceholderElement.textContent = "摄像头快照不可用";
      snapshotContainer.dataset.cameraState = "snapshot-unavailable";
      scheduleSnapshotRefresh();
    }
  });
  // 页面显隐切换：隐藏时停表并标记挂起；回到前台立刻补一次刷新，
  // 免得用户看到的是离开页面之前的那张旧图。
  const handleSnapshotVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      isSnapshotSuspended = true;
      clearSnapshotRefreshTimer();
      snapshotContainer.dataset.cameraState = "snapshot-suspended";
      return;
    }
    if (isSnapshotSuspended) {
      isSnapshotSuspended = false;
      loadCameraSnapshot();
    }
  };
  snapshotContainer.dataset.cameraTransport = "snapshot";
  snapshotContainer.prepend(snapshotImageElement);
  document.addEventListener("visibilitychange", handleSnapshotVisibilityChange);
  if (isSnapshotSuspended) {
    snapshotContainer.dataset.cameraState = "snapshot-suspended";
  } else {
    loadCameraSnapshot();
  }
  snapshotCleanup(() => {
    isSnapshotDisposed = true;
    clearSnapshotRefreshTimer();
    document.removeEventListener("visibilitychange", handleSnapshotVisibilityChange);
    snapshotImageElement.removeAttribute("src");
  });
  return {
    image: snapshotImageElement
  };
}

/**
 * 在容器里挂载实时视频，失败时自动退回定时快照。
 * 视频元素必须 muted + playsInline：浏览器只允许静音自动播放，不静音会被拒绝播放而黑屏。
 * @param {function} [options.onUnavailable] 不可用回调。
 */
export function mountCameraMedia({
  container: mediaContainer,
  entityId: mediaEntityId,
  label: mediaLabel,
  objectFit: mediaObjectFit = "cover",
  placeholder: mediaPlaceholderElement,
  onReady: onMediaReady = () => {},
  onUnavailable: onMediaUnavailable = () => {},
  cleanup: mediaCleanup = () => {}
}) {
  const cameraVideoElement = document.createElement("video");
  cameraVideoElement.className = "hb-camera-video";
  cameraVideoElement.setAttribute("aria-label", mediaLabel || mediaEntityId);
  cameraVideoElement.autoplay = true;
  cameraVideoElement.muted = true;
  cameraVideoElement.playsInline = true;
  cameraVideoElement.disablePictureInPicture = true;
  cameraVideoElement.style.objectFit = mediaObjectFit;
  const cameraSnapshotImageElement = document.createElement("img");
  cameraSnapshotImageElement.className = "hb-camera-image";
  cameraSnapshotImageElement.alt = mediaLabel || mediaEntityId;
  cameraSnapshotImageElement.draggable = false;
  cameraSnapshotImageElement.style.objectFit = mediaObjectFit;
  let isMediaDisposed = false;
  let hasLegacyFallbackStarted = false;
  let hasSnapshotFallbackStarted = false;
  let connectTimeoutId = 0;
  let hlsTimeoutId = 0;
  let snapshotProbeTimeoutId = 0;
  let hlsInstance = null;
  let hasVideoReady = false;
  let mediaGeneration = 0;
  let isMediaSuspended = document.visibilityState === "hidden";
  // 拆掉当前播放链路。先自增 mediaGeneration，让在途的 HLS 拉流、各超时回调全部失效；
  // 再清定时器、销毁 Hls 实例、摘掉 video 与快照的 src 并复位所有降级标记，
  // 这样下一轮 beginCameraPlayback 才能从干净状态重新走一遍。
  const teardownCameraMedia = () => {
    mediaGeneration += 1;
    window.clearTimeout(connectTimeoutId);
    window.clearTimeout(hlsTimeoutId);
    window.clearTimeout(snapshotProbeTimeoutId);
    connectTimeoutId = 0;
    hlsTimeoutId = 0;
    snapshotProbeTimeoutId = 0;
    hlsInstance?.destroy();
    hlsInstance = null;
    cameraVideoElement.pause();
    cameraVideoElement.removeAttribute("src");
    cameraVideoElement.load();
    cameraSnapshotImageElement.removeAttribute("src");
    hasLegacyFallbackStarted = false;
    hasSnapshotFallbackStarted = false;
    hasVideoReady = false;
  };
  // 切到视频模式：移除降级用的快照 img，并把 video 挂回容器；
  // isConnected 判断是为了在重复调用时不把 video 反复插入造成重排。
  const showCameraVideo = () => {
    cameraSnapshotImageElement.remove();
    if (!cameraVideoElement.isConnected) {
      mediaContainer.prepend(cameraVideoElement);
    }
  };
  // loadeddata / playing / 快照 load 三个事件共用：只认第一次成功，
  // 之后重复事件直接忽略，避免 onMediaReady 被回调多次。
  const handleVideoReady = () => {
    if (!isMediaDisposed && !isMediaSuspended && !hasVideoReady) {
      hasVideoReady = true;
      window.clearTimeout(hlsTimeoutId);
      window.clearTimeout(snapshotProbeTimeoutId);
      mediaPlaceholderElement.hidden = true;
      onMediaReady();
    }
  };
  // 彻底不可用：恢复占位文案并通知调用方；这里是所有降级路径的终点，不再继续重试。
  const handleVideoUnavailable = () => {
    if (!isMediaDisposed && !isMediaSuspended) {
      hasVideoReady = false;
      mediaPlaceholderElement.hidden = false;
      mediaPlaceholderElement.textContent = "摄像头实时预览不可用";
      onMediaUnavailable();
    }
  };
  // 老式静态快照通道：直接打 /api/camera_proxy，带时间戳参数绕过浏览器与后端的缓存。
  const loadLegacySnapshotImage = () => {
    if (!isMediaDisposed && !isMediaSuspended) {
      cameraSnapshotImageElement.src =
        "/api/camera_proxy/" + encodeURIComponent(mediaEntityId) + "?hb=" + Date.now();
    }
  };
  // 降级到定时快照，整轮播放只允许降级一次（hasSnapshotFallbackStarted 把关）；
  // expectedGeneration 用于丢弃上一轮播放遗留的过期回调。
  const fallbackToSnapshotImage = (expectedGeneration = mediaGeneration) => {
    if (
      !isMediaDisposed &&
      !isMediaSuspended &&
      expectedGeneration === mediaGeneration &&
      !hasSnapshotFallbackStarted
    ) {
      hasSnapshotFallbackStarted = true;
      window.clearTimeout(snapshotProbeTimeoutId);
      loadLegacySnapshotImage();
    }
  };
  // 降级到 /api/camera_proxy_stream（MJPEG 长连）：同样受 mediaGeneration 与一次性标记约束，
  // 并把 video 换成 img；7 秒内拿不到 naturalWidth 就再退一级到静态快照。
  const useLegacyCameraStream = (fallbackGeneration = mediaGeneration) => {
    if (
      !isMediaDisposed &&
      !isMediaSuspended &&
      fallbackGeneration === mediaGeneration &&
      !hasLegacyFallbackStarted
    ) {
      hasLegacyFallbackStarted = true;
      mediaContainer.dataset.cameraTransport = "legacy";
      window.clearTimeout(hlsTimeoutId);
      hlsInstance?.destroy();
      hlsInstance = null;
      cameraVideoElement.pause();
      cameraVideoElement.removeAttribute("src");
      cameraVideoElement.load();
      cameraVideoElement.remove();
      mediaContainer.prepend(cameraSnapshotImageElement);
      cameraSnapshotImageElement.src =
        "/api/camera_proxy_stream/" + encodeURIComponent(mediaEntityId);
      snapshotProbeTimeoutId = window.setTimeout(() => {
        if (!cameraSnapshotImageElement.naturalWidth) {
          fallbackToSnapshotImage(fallbackGeneration);
        }
      }, 7000);
    }
  };
  cameraVideoElement.addEventListener("loadeddata", handleVideoReady);
  cameraVideoElement.addEventListener("playing", handleVideoReady);
  cameraVideoElement.addEventListener(
    "error",
    () => {
      if (!hlsInstance) {
        useLegacyCameraStream();
      }
    },
    {
      once: true
    }
  );
  cameraSnapshotImageElement.addEventListener("load", handleVideoReady);
  cameraSnapshotImageElement.addEventListener("error", () => {
    if (!isMediaDisposed && !isMediaSuspended) {
      if (hasSnapshotFallbackStarted) {
        handleVideoUnavailable();
      } else {
        fallbackToSnapshotImage();
      }
    }
  });
  mediaContainer.prepend(cameraVideoElement);
  // 启动 HLS 播放：取源是异步的，期间可能已切换实体或控件被卸载 / 暂停，每个回调都拿
  // playbackGeneration 与 mediaGeneration 比对，过期即放弃；致命错误会删掉 cameraSourceCache 并回落旧版流，
  // 避免下次复用坏地址。缓冲区前后各 15s 配 lowLatencyMode，是延迟与卡顿的折中。
  const startHlsPlayback = async playbackGeneration => {
    try {
      const hlsSourceUrl = await fetchCameraHlsSource(mediaEntityId);
      if (isMediaDisposed || isMediaSuspended || playbackGeneration !== mediaGeneration) {
        return;
      }
      if (!hlsSourceUrl) {
        useLegacyCameraStream(playbackGeneration);
        return;
      }
      mediaContainer.dataset.cameraHlsSource = hlsSourceUrl;
      mediaContainer.dataset.cameraTransport = "hls";
      if (window.Hls?.isSupported?.()) {
        hlsInstance = new window.Hls({
          lowLatencyMode: true,
          backBufferLength: 15,
          maxBufferLength: 15
        });
        hlsInstance.on(window.Hls.Events.MEDIA_ATTACHED, () =>
          hlsInstance?.loadSource(hlsSourceUrl)
        );
        hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, () => {
          mediaContainer.dataset.cameraState = "manifest-parsed";
          // 自动播放被浏览器策略拦下是预期结果（要等用户交互），不该冒出未处理的拒绝。
          cameraVideoElement.play().catch(() => {});
        });
        hlsInstance.on(window.Hls.Events.ERROR, (hlsEventName, hlsEventData) => {
          if (!isMediaDisposed && !isMediaSuspended && playbackGeneration === mediaGeneration) {
            if (hlsEventData?.fatal) {
              cameraSourceCache.delete(String(mediaEntityId || "").trim());
              mediaContainer.dataset.cameraState = "hls-failed";
              mediaContainer.dataset.cameraError = [
                hlsEventData.type,
                hlsEventData.details,
                hlsEventData.url || hlsEventData.response?.url || "",
                hlsEventData.response?.code || 0,
                hlsEventData.reason || hlsEventData.error?.message || ""
              ].join(" | ");
              window.HABridgeLog?.report(
                "error",
                "摄像头",
                "摄像头播放失败：" +
                  (hlsEventData.type || "") +
                  " / " +
                  (hlsEventData.details || ""),
                {
                  entityId: mediaEntityId,
                  phase: "hls-playback",
                  status: hlsEventData.response?.code || 0,
                  path: hlsEventData.url || hlsEventData.response?.url || ""
                }
              );
              // HABridgeLog 已经把「会话历史」那份错误上报过了（含 entityId / type / details）；
              // 控制台这份只在 ?debug=1 时输出，避免生产里同一次失败响两份。
              debugLog("warn", "[HomeOS camera] HLS playback failed", {
                entityId: mediaEntityId,
                type: hlsEventData.type,
                details: hlsEventData.details,
                url: hlsEventData.url || hlsEventData.response?.url || "",
                status: hlsEventData.response?.code || 0,
                reason: hlsEventData.reason || hlsEventData.error?.message || ""
              });
              useLegacyCameraStream(playbackGeneration);
            }
          }
        });
        hlsInstance.attachMedia(cameraVideoElement);
      } else {
        cameraVideoElement.src = hlsSourceUrl;
        // 自动播放被浏览器策略拦下是预期结果（要等用户交互），不该冒出未处理的拒绝。
        cameraVideoElement.play().catch(() => {});
      }
    } catch (hlsError) {
      if (isMediaDisposed || isMediaSuspended || playbackGeneration !== mediaGeneration) {
        return;
      }
      mediaContainer.dataset.cameraState = "setup-fallback";
      mediaContainer.dataset.cameraError = String(hlsError);
      // 这里必须记一笔：HLS 初始化抛错后画面会静默降级到 MJPEG，用户只看到「能播了」，
      // 完全看不出走的是降级通道；不记日志就无从知道 HLS 在哪些设备上根本起不来。
      // 文案与「摄像头播放失败」分支保持同一前缀，便于在会话历史里按关键词归并。
      window.HABridgeLog?.report(
        "error",
        "摄像头",
        "摄像头连接失败：" + (hlsError?.message || hlsError),
        { entityId: mediaEntityId, phase: "hls-setup" }
      );
      // 控制台这份只在 ?debug=1 时输出：会话历史已经记过一次，生产里不必同一次失败响两份。
      debugLog("warn", "[HomeOS camera] HLS setup failed", {
        entityId: mediaEntityId,
        error: String(hlsError)
      });
      useLegacyCameraStream(playbackGeneration);
    }
  };
  // 开始一轮播放：复位就绪标记、写「正在连接」占位，先走 HLS；
  // 12 秒未就绪由 hlsTimeoutId 统一降级到 MJPEG 通道。
  const beginCameraPlayback = () => {
    if (isMediaDisposed || isMediaSuspended) {
      return;
    }
    showCameraVideo();
    hasVideoReady = false;
    mediaPlaceholderElement.hidden = false;
    mediaPlaceholderElement.textContent = "摄像头正在连接";
    const playbackStartGeneration = mediaGeneration;
    mediaContainer.dataset.cameraState = "starting";
    startHlsPlayback(playbackStartGeneration);
    hlsTimeoutId = window.setTimeout(() => useLegacyCameraStream(playbackStartGeneration), 12000);
  };
  // 页面显隐：隐藏时主动拆链路（后台不该继续占带宽与解码资源），
  // 回到前台重新完整走一遍播放流程，而不是只把 video 恢复播放。
  const handleMediaVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      if (isMediaSuspended) {
        return;
      }
      isMediaSuspended = true;
      teardownCameraMedia();
      mediaContainer.dataset.cameraState = "suspended";
      mediaPlaceholderElement.hidden = false;
      mediaPlaceholderElement.textContent = "摄像头已在后台暂停";
      return;
    }
    if (isMediaSuspended) {
      isMediaSuspended = false;
      beginCameraPlayback();
    }
  };
  document.addEventListener("visibilitychange", handleMediaVisibilityChange);
  if (isMediaSuspended) {
    mediaContainer.dataset.cameraState = "suspended";
    mediaPlaceholderElement.hidden = false;
    mediaPlaceholderElement.textContent = "摄像头已在后台暂停";
  } else {
    mediaContainer.dataset.cameraState = "deferred";
    connectTimeoutId = window.setTimeout(beginCameraPlayback, 0);
  }
  mediaCleanup(() => {
    isMediaDisposed = true;
    document.removeEventListener("visibilitychange", handleMediaVisibilityChange);
    teardownCameraMedia();
  });
  return {
    video: cameraVideoElement,
    image: cameraSnapshotImageElement
  };
}
