(function (bridgeWindow) {
  "use strict";

  if (bridgeWindow.HomeOSLog || typeof bridgeWindow.fetch != "function") return;
  const originalFetch = bridgeWindow.fetch.bind(bridgeWindow),
    LOG_STORAGE_KEY = "homeos-client-log-v1",
    MAX_QUEUED_EVENT_COUNT = 50,
    MAX_QUEUE_BYTES = 120000,
    MAX_EVENT_AGE_MS = 900 * 1000,
    reportedErrorSet = new WeakSet(),
    linkedResponseSet = new WeakSet(),
    allowedPayloadKeySet = new Set([
      "page",
      "projectId",
      "componentId",
      "entityId",
      "service",
      "requestId",
      "method",
      "path",
      "status",
      "durationMs",
      "code",
      "line",
      "column",
      "userAgent",
      "phase",
    ]),
    isPublicPage = /^\/(?:login|setup|pair)(?:\/|$)/.test(bridgeWindow.location.pathname);
  let publicMode = isPublicPage,
    eventQueue = [],
    flushTimer = null,
    isFlushing = false,
    retryDelayMs = 1000,
    nextRetryAt = 0,
    logPayload = {};
  // 开发开关取值：与 utils/debug-log.js 同一口径，只认显式的 1 / true。
  function isDebugModeEnabled() {
    try {
      return new Set(["1", "true"]).has(
        new URLSearchParams(String(bridgeWindow.location?.search || "")).get("debug") || "",
      );
    } catch {
      return false;
    }
  }
  // 已知第三方浏览器扩展（chrome-extension://odphnbhiddhdpoccbialllejaajemdio，图片助手 ImageAssistant）
  // 会在 document_start 往页面主世界注入脚本，同时 patch XMLHttpRequest 与 window.fetch：
  //   - XHR：responseType 为 arraybuffer / json 时仍去读 responseText，于是把 InvalidStateError 打到控制台；
  //   - fetch：给每次请求挂 .catch，失败时 console.error("Fetch request failed:", error) 再原样抛出。
  // 业务在卸载组件 / 切换模式时会主动 abort 在途请求，这些 AbortError 于是刷屏。它们和业务无关，
  // 真正的网络故障由本文件自己的 fetch 包装器按业务口径上报，因此这里按特征丢弃。
  function isIgnorableThirdPartyConsoleError(consoleArguments) {
    const [consoleMessage, consoleCause] = consoleArguments;
    if (typeof consoleMessage != "string") return false;
    if (consoleMessage.startsWith("Error processing XMLHttpRequest response:")) return true;
    return consoleMessage === "Fetch request failed:" && consoleCause?.name === "AbortError";
  }
  function suppressThirdPartyConsoleNoise() {
    const consoleObject = bridgeWindow.console;
    if (!consoleObject || typeof consoleObject.error != "function") return;
    const originalConsoleError = consoleObject.error;
    consoleObject.error = function (...consoleArguments) {
      if (isIgnorableThirdPartyConsoleError(consoleArguments)) return;
      return originalConsoleError.apply(consoleObject, consoleArguments);
    };
  }
  isDebugModeEnabled() || suppressThirdPartyConsoleNoise();
  function sanitizePath(rawPath) {
    try {
      const parsedUrl = new URL(String(rawPath || ""), bridgeWindow.location.href);
      if (!["http:", "https:", "ws:", "wss:"].includes(parsedUrl.protocol))
        return `[${parsedUrl.protocol.replace(":", "")}]`;
      let normalizedPath = parsedUrl.pathname;
      try {
        normalizedPath = decodeURIComponent(normalizedPath);
      } catch {}
      return normalizedPath
        .split(/[?#]/, 1)[0]
        .replace(/\/embed\/[A-Za-z0-9_-]{43}(?=\/|$)/g, "/embed/[session]")
        .replace(/(\/api\/hls\/)[^/]+(?:\/.*)?/gi, "$1[stream]")
        .replace(/[A-Z0-9.!#$%&'*+=^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi, "[email redacted]")
        .replace(/\b(?:eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g, "[redacted]")
        .slice(0, 512);
    } catch {
      return "[invalid path]";
    }
  }
  function redactSensitive(rawText, maxLength = 1000) {
    return String(rawText ?? "")
      .replace(/\/embed\/[A-Za-z0-9_-]{43}(?=\/|$)/g, "/embed/[session]")
      .replace(
        /(\b(?:set-cookie|cookie)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\r\n]+)/gi,
        "$1[redacted]",
      )
      .replace(
        /-----BEGIN[\s\S]*?PRIVATE KEY-----[\s\S]*?-----END[\s\S]*?PRIVATE KEY-----/g,
        "[private key redacted]",
      )
      .replace(/[A-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi, "[email redacted]")
      .replace(/(?:https?|wss?|rtsps?):\/\/[^\s<>"']+/gi, (matchedUrl) => sanitizePath(matchedUrl))
      .replace(/\bBearer\s+[^\s,;"']+/gi, "Bearer [redacted]")
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted]")
      .replace(
        /((?:password|passwd|token|authorization|cookie|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|pairing[_-]?code|activation[_-]?code|recovery[_-]?token|session[_-]?token|private[_-]?key|密码|激活码)\s*["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi,
        "$1[redacted]",
      )
      .replace(/\/api\/hls\/[^\s<>"'?#)]+(?:\?[^\s<>"')]+)?/gi, "/api/hls/[stream]")
      .replace(/(\/[^\s?"'<>]*)\?[^\s"'<>]*/g, "$1")
      .slice(0, maxLength);
  }
  function pickPayload(sourceFields) {
    const pickedPayload = {};
    for (const [detailKey, detailValue] of Object.entries(sourceFields || {}))
      !allowedPayloadKeySet.has(detailKey) ||
        detailValue == null ||
        !["string", "number", "boolean"].includes(typeof detailValue) ||
        (pickedPayload[detailKey] = ["path", "page"].includes(detailKey)
          ? sanitizePath(detailValue)
          : typeof detailValue == "number" && Number.isFinite(detailValue)
            ? detailValue
            : redactSensitive(detailValue, 512));
    return pickedPayload;
  }
  function currentSourceName() {
    return bridgeWindow.location.pathname.startsWith("/3d-studio")
      ? "3D 户型编辑器"
      : /^\/(?:display|homeos)\//.test(bridgeWindow.location.pathname)
        ? "展示设备"
        : isPublicPage
          ? "登录与配对页面"
          : "仪表盘编辑器";
  }
  function pruneQueue() {
    const cutoffTime = Date.now() - MAX_EVENT_AGE_MS;
    for (
      eventQueue = eventQueue
        .filter((prunedEntry) => prunedEntry.queuedAt >= cutoffTime)
        .slice(-MAX_QUEUED_EVENT_COUNT);
      eventQueue.length && JSON.stringify(eventQueue).length > MAX_QUEUE_BYTES;
    )
      eventQueue.shift();
  }
  function persistQueue() {
    pruneQueue();
    try {
      eventQueue.length
        ? bridgeWindow.sessionStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(eventQueue))
        : bridgeWindow.sessionStorage.removeItem(LOG_STORAGE_KEY);
    } catch {}
  }
  function scheduleFlush(delayMs = 100) {
    flushTimer ||
      !eventQueue.length ||
      (flushTimer = bridgeWindow.setTimeout(() => {
        ((flushTimer = null), flushQueue());
      }, delayMs));
  }
  function reportEvent(
    reportLevel,
    reportCategory,
    reportMessage,
    reportFields = {},
    reportDetails = "",
  ) {
    const eventPayload = {
      level: ["info", "success", "warning", "error"].includes(reportLevel) ? reportLevel : "error",
      source: currentSourceName(),
      category: redactSensitive(reportCategory || "界面", 64),
      message: redactSensitive(reportMessage || "未知异常", 1000),
      details: redactSensitive(reportDetails, 8000),
      context: pickPayload({
        page: bridgeWindow.location.pathname,
        userAgent: bridgeWindow.navigator?.userAgent || "",
        ...logPayload,
        ...reportFields,
      }),
      clientTimestamp: new Date().toISOString(),
    };
    (publicMode && !["warning", "error"].includes(eventPayload.level)) ||
      (eventQueue.push({
        event: eventPayload,
        queuedAt: Date.now(),
      }),
      persistQueue(),
      scheduleFlush());
  }
  function reportError(thrownValue, errorFields = {}, fallbackMessage = "") {
    if (thrownValue && typeof thrownValue == "object") {
      if (reportedErrorSet.has(thrownValue)) return;
      reportedErrorSet.add(thrownValue);
    }
    reportEvent(
      "error",
      "界面",
      fallbackMessage || thrownValue?.message || String(thrownValue || "未知异常"),
      errorFields,
      thrownValue?.stack || "",
    );
  }
  function linkErrorToResponse(errorObject, response) {
    return (
      errorObject &&
        typeof errorObject == "object" &&
        linkedResponseSet.has(response) &&
        reportedErrorSet.add(errorObject),
      errorObject
    );
  }
  async function flushQueue() {
    if (isFlushing || bridgeWindow.navigator?.onLine === false) return;
    if (Date.now() < nextRetryAt) {
      scheduleFlush(nextRetryAt - Date.now());
      return;
    }
    if ((pruneQueue(), !eventQueue.length)) {
      persistQueue();
      return;
    }
    const removeQueuedEntry = (queuedEntry) => {
      const queueIndex = eventQueue.indexOf(queuedEntry);
      queueIndex >= 0 && eventQueue.splice(queueIndex, 1);
    };
    isFlushing = true;
    try {
      for (let attemptIndex = 0; eventQueue.length && attemptIndex < 5; attemptIndex += 1) {
        const batchEntry = eventQueue[0];
        if (publicMode && !["warning", "error"].includes(batchEntry.event.level)) {
          removeQueuedEntry(batchEntry);
          continue;
        }
        const abortController = typeof AbortController == "function" ? new AbortController() : null,
          timeoutId = bridgeWindow.setTimeout(() => abortController?.abort(), 8000);
        let sendResponse;
        try {
          sendResponse = await originalFetch(
            `/api/v1/logs/${publicMode ? "public-events" : "events"}`,
            {
              method: "POST",
              cache: "no-store",
              keepalive: true,
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(batchEntry.event),
              ...(abortController
                ? {
                    signal: abortController.signal,
                  }
                : {}),
            },
          );
        } finally {
          bridgeWindow.clearTimeout(timeoutId);
        }
        if (sendResponse.ok) {
          (removeQueuedEntry(batchEntry), (retryDelayMs = 1000));
          continue;
        }
        if (sendResponse.status === 401 && !publicMode) {
          ((publicMode = true), (nextRetryAt = Date.now() + 1000));
          break;
        }
        if (sendResponse.status === 429 || sendResponse.status >= 500) {
          const retryAfterMs = Number(sendResponse.headers?.get("Retry-After")) * 1000;
          ((nextRetryAt = Date.now() + Math.min(60000, Math.max(retryDelayMs, retryAfterMs || 0))),
            (retryDelayMs = Math.min(60000, retryDelayMs * 2)));
          break;
        }
        removeQueuedEntry(batchEntry);
      }
    } catch {
      ((nextRetryAt = Date.now() + retryDelayMs),
        (retryDelayMs = Math.min(60000, retryDelayMs * 2)));
    } finally {
      ((isFlushing = false),
        persistQueue(),
        scheduleFlush(Math.max(100, nextRetryAt - Date.now())));
    }
  }
/** fetch 包装器认可的额外字段：调用方通过它附带日志上下文。 */
type FetchInitWithLogContext = RequestInit & {
  /** 日志上下文（会随请求一起上报）。 */
  hbLogContext?: any;
};

/** 资源加载失败事件里被指向的元素：src / href / tagName 三选若干。 */
type ResourceErrorTarget = EventTarget & {
  src?: string;
  href?: string;
  tagName?: string;
};

  ((bridgeWindow.fetch = async function (
    requestInput,
    requestInit: FetchInitWithLogContext = {},
  ) {
    const { hbLogContext: hbLogPayload, ...fetchOptions } = requestInit || {},
      requestPath = sanitizePath(
        typeof requestInput == "string" || requestInput instanceof URL
          ? requestInput
          : requestInput?.url,
      );
    if (/^\/api\/v1\/logs(?:\/|$)/.test(requestPath))
      return originalFetch(requestInput, fetchOptions);
    const startedAt = Date.now(),
      requestRecord = {
        method: fetchOptions.method || (requestInput as Request)?.method || "GET",
        path: requestPath,
        ...pickPayload(hbLogPayload),
      };
    try {
      const fetchResponse = await originalFetch(requestInput, fetchOptions),
        durationMs = Date.now() - startedAt;
      return (
        (!fetchResponse.ok || durationMs >= 5000) &&
          (reportEvent(
            fetchResponse.ok ? "warning" : "error",
            "网络请求",
            `${fetchResponse.ok ? "请求耗时较长" : "请求失败"}\uFF1A${requestRecord.method} ${requestPath}${fetchResponse.ok ? "" : `\uFF08HTTP ${fetchResponse.status}\uFF09`}`,
            {
              ...requestRecord,
              status: fetchResponse.status,
              durationMs: durationMs,
              requestId: fetchResponse.headers?.get("X-Request-ID") || "",
            },
          ),
          fetchResponse.ok || linkedResponseSet.add(fetchResponse)),
        fetchResponse
      );
    } catch (caughtError) {
      const abortSignal =
        fetchOptions.signal === undefined
          ? (requestInput as Request)?.signal
          : fetchOptions.signal;
      throw (
        caughtError?.name === "AbortError" ||
          (abortSignal?.aborted && caughtError === abortSignal.reason) ||
          (reportEvent(
            "error",
            "网络请求",
            `\u7F51\u7EDC\u8FDE\u63A5\u5931\u8D25\uFF1A${requestRecord.method} ${requestPath}`,
            {
              ...requestRecord,
              durationMs: Date.now() - startedAt,
            },
            caughtError?.stack || caughtError?.message || "",
          ),
          caughtError && typeof caughtError == "object" && reportedErrorSet.add(caughtError)),
        caughtError
      );
    }
  }),
    (bridgeWindow.HomeOSLog = {
      report: reportEvent,
      error: reportError,
      linkError: linkErrorToResponse,
      flush: flushQueue,
      setContext: (payloadInput) => {
        logPayload = pickPayload(payloadInput);
      },
    }),
    bridgeWindow.addEventListener(
      "error",
      (errorEvent) => {
        // 资源加载失败时 target 是 <img>/<script>/<link>，事件类型上只保证是 EventTarget。
        const failedTarget = errorEvent.target as ResourceErrorTarget;
        if (
          failedTarget &&
          failedTarget !== bridgeWindow &&
          (failedTarget.src || failedTarget.href)
        ) {
          reportEvent(
            "error",
            "资源加载",
            `\u8D44\u6E90\u52A0\u8F7D\u5931\u8D25\uFF1A${sanitizePath(failedTarget.src || failedTarget.href)}`,
            {
              path: failedTarget.src || failedTarget.href,
              phase: String(failedTarget.tagName || "resource").toLowerCase(),
            },
          );
          return;
        }
        reportError(errorEvent.error || new Error(errorEvent.message || "页面脚本异常"), {
          path: errorEvent.filename || bridgeWindow.location.pathname,
          line: errorEvent.lineno,
          column: errorEvent.colno,
        });
      },
      true,
    ),
    bridgeWindow.addEventListener("unhandledrejection", (rejectionEvent) =>
      reportError(rejectionEvent.reason),
    ),
    bridgeWindow.addEventListener("online", () => {
      ((nextRetryAt = 0), flushQueue());
    }),
    bridgeWindow.addEventListener("pagehide", () => {
      (persistQueue(), flushQueue());
    }));
  try {
    const storedEntries = JSON.parse(bridgeWindow.sessionStorage.getItem(LOG_STORAGE_KEY) || "[]");
    if (Array.isArray(storedEntries))
      for (const storedEntry of storedEntries.slice(-MAX_QUEUED_EVENT_COUNT)) {
        if (
          !storedEntry?.event ||
          !Number.isFinite(storedEntry.queuedAt) ||
          Date.now() - storedEntry.queuedAt > MAX_EVENT_AGE_MS
        )
          continue;
        const storedEvent = storedEntry.event;
        // 单条记录归一化失败（例如越界的时间戳）只丢这一条，不能连坐整批待发送日志。
        try {
          eventQueue.push({
            queuedAt: storedEntry.queuedAt,
            event: {
              level: ["warning", "error", "info", "success"].includes(storedEvent.level)
                ? storedEvent.level
                : "error",
              source: redactSensitive(storedEvent.source || currentSourceName(), 64),
              category: redactSensitive(storedEvent.category || "界面", 64),
              message: redactSensitive(storedEvent.message || "未知异常", 1000),
              details: redactSensitive(storedEvent.details, 8000),
              context: pickPayload(storedEvent.context),
              clientTimestamp: new Date(storedEntry.queuedAt).toISOString(),
            },
          });
        } catch {
          continue;
        }
      }
  } catch {}
  (persistQueue(), scheduleFlush());
})(window);
