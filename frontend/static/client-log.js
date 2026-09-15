(function (bridgeWindow) {
  "use strict";
  if (bridgeWindow.HABridgeLog || typeof bridgeWindow.fetch != "function") return;
  const originalFetch = bridgeWindow.fetch.bind(bridgeWindow),
    LOG_STORAGE_KEY = "homeos-client-log-v1",
    MAX_QUEUED_EVENT_COUNT = 50,
    MAX_QUEUE_BYTES = 12e4,
    MAX_EVENT_AGE_MS = 900 * 1e3,
    reportedErrors = new WeakSet(),
    linkedResponseSet = new WeakSet(),
    ALLOWED_CONTEXT_KEYS = new Set([
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
      "phase"
    ]),
    isPublicPage = /^\/(?:login|setup|pair)(?:\/|$)/.test(bridgeWindow.location.pathname);
  let publicMode = isPublicPage,
    eventQueue = [],
    flushTimer = null,
    isFlushing = !1,
    retryDelayMs = 1e3,
    nextRetryAt = 0,
    logContext = {};
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
        .replace(/(\/api\/hls\/)[^/]+(?:\/.*)?/gi, "$1[stream]")
        .replace(/[A-Z0-9.!#$%&'*+=^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi, "[email redacted]")
        .replace(/\b(?:eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g, "[redacted]")
        .slice(0, 512);
    } catch {
      return "[invalid path]";
    }
  }
  function redactSensitive(rawText, maxLength = 1e3) {
    return String(rawText ?? "")
      .replace(
        /(\b(?:set-cookie|cookie)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\r\n]+)/gi,
        "$1[redacted]"
      )
      .replace(
        /-----BEGIN[\s\S]*?PRIVATE KEY-----[\s\S]*?-----END[\s\S]*?PRIVATE KEY-----/g,
        "[private key redacted]"
      )
      .replace(/[A-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi, "[email redacted]")
      .replace(/(?:https?|wss?|rtsps?):\/\/[^\s<>"']+/gi, matchedUrl => sanitizePath(matchedUrl))
      .replace(/\bBearer\s+[^\s,;"']+/gi, "Bearer [redacted]")
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted]")
      .replace(
        /((?:password|passwd|token|authorization|cookie|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|pairing[_-]?code|activation[_-]?code|recovery[_-]?token|session[_-]?token|private[_-]?key|密码|激活码)\s*["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi,
        "$1[redacted]"
      )
      .replace(/\/api\/hls\/[^\s<>"'?#)]+(?:\?[^\s<>"')]+)?/gi, "/api/hls/[stream]")
      .replace(/(\/[^\s?"'<>]*)\?[^\s"'<>]*/g, "$1")
      .slice(0, maxLength);
  }
  function pickContext(contextRecord) {
    const pickedContext = {};
    for (const [contextKey, contextValue] of Object.entries(contextRecord || {}))
      !ALLOWED_CONTEXT_KEYS.has(contextKey) ||
        contextValue == null ||
        !["string", "number", "boolean"].includes(typeof contextValue) ||
        (pickedContext[contextKey] = ["path", "page"].includes(contextKey)
          ? sanitizePath(contextValue)
          : typeof contextValue == "number" && Number.isFinite(contextValue)
            ? contextValue
            : redactSensitive(contextValue, 512));
    return pickedContext;
  }
  function currentSourceName() {
    return bridgeWindow.location.pathname.startsWith("/3d-studio")
      ? "3D \u6237\u578B\u7F16\u8F91\u5668"
      : /^\/(?:display|habridge)\//.test(bridgeWindow.location.pathname)
        ? "\u5C55\u793A\u8BBE\u5907"
        : isPublicPage
          ? "\u767B\u5F55\u4E0E\u914D\u5BF9\u9875\u9762"
          : "\u4EEA\u8868\u76D8\u7F16\u8F91\u5668";
  }
  function pruneQueue() {
    const cutoffTime = Date.now() - MAX_EVENT_AGE_MS;
    for (
      eventQueue = eventQueue
        .filter(prunedEntry => prunedEntry.queuedAt >= cutoffTime)
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
    reportContext = {},
    reportDetails = ""
  ) {
    const eventPayload = {
      level: ["info", "success", "warning", "error"].includes(reportLevel) ? reportLevel : "error",
      source: currentSourceName(),
      category: redactSensitive(reportCategory || "\u754C\u9762", 64),
      message: redactSensitive(reportMessage || "\u672A\u77E5\u5F02\u5E38", 1e3),
      details: redactSensitive(reportDetails, 8e3),
      context: pickContext({
        page: bridgeWindow.location.pathname,
        userAgent: bridgeWindow.navigator?.userAgent || "",
        ...logContext,
        ...reportContext
      }),
      clientTimestamp: new Date().toISOString()
    };
    (publicMode && !["warning", "error"].includes(eventPayload.level)) ||
      (eventQueue.push({ event: eventPayload, queuedAt: Date.now() }),
      persistQueue(),
      scheduleFlush());
  }
  function reportError(thrownValue, extraContext = {}, fallbackMessage = "") {
    if (thrownValue && typeof thrownValue == "object") {
      if (reportedErrors.has(thrownValue)) return;
      reportedErrors.add(thrownValue);
    }
    reportEvent(
      "error",
      "\u754C\u9762",
      fallbackMessage || thrownValue?.message || String(thrownValue || "\u672A\u77E5\u5F02\u5E38"),
      extraContext,
      thrownValue?.stack || ""
    );
  }
  function linkErrorToResponse(errorObject, response) {
    return (
      errorObject &&
        typeof errorObject == "object" &&
        linkedResponseSet.has(response) &&
        reportedErrors.add(errorObject),
      errorObject
    );
  }
  async function flushQueue() {
    if (isFlushing || bridgeWindow.navigator?.onLine === !1) return;
    if (Date.now() < nextRetryAt) {
      scheduleFlush(nextRetryAt - Date.now());
      return;
    }
    if ((pruneQueue(), !eventQueue.length)) {
      persistQueue();
      return;
    }
    const removeQueuedEntry = queuedEntry => {
      const queueIndex = eventQueue.indexOf(queuedEntry);
      queueIndex >= 0 && eventQueue.splice(queueIndex, 1);
    };
    isFlushing = !0;
    try {
      for (let attemptIndex = 0; eventQueue.length && attemptIndex < 5; attemptIndex += 1) {
        const batchEntry = eventQueue[0];
        if (publicMode && !["warning", "error"].includes(batchEntry.event.level)) {
          removeQueuedEntry(batchEntry);
          continue;
        }
        const abortController = typeof AbortController == "function" ? new AbortController() : null,
          timeoutId = bridgeWindow.setTimeout(() => abortController?.abort(), 8e3);
        let sendResponse;
        try {
          sendResponse = await originalFetch(
            `/api/v1/logs/${publicMode ? "public-events" : "events"}`,
            {
              method: "POST",
              cache: "no-store",
              keepalive: !0,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(batchEntry.event),
              ...(abortController ? { signal: abortController.signal } : {})
            }
          );
        } finally {
          bridgeWindow.clearTimeout(timeoutId);
        }
        if (sendResponse.ok) {
          (removeQueuedEntry(batchEntry), (retryDelayMs = 1e3));
          continue;
        }
        if (sendResponse.status === 401 && !publicMode) {
          ((publicMode = !0), (nextRetryAt = Date.now() + 1e3));
          break;
        }
        if (sendResponse.status === 429 || sendResponse.status >= 500) {
          const retryAfterMs = Number(sendResponse.headers?.get("Retry-After")) * 1e3;
          ((nextRetryAt = Date.now() + Math.min(6e4, Math.max(retryDelayMs, retryAfterMs || 0))),
            (retryDelayMs = Math.min(6e4, retryDelayMs * 2)));
          break;
        }
        removeQueuedEntry(batchEntry);
      }
    } catch {
      ((nextRetryAt = Date.now() + retryDelayMs), (retryDelayMs = Math.min(6e4, retryDelayMs * 2)));
    } finally {
      ((isFlushing = !1), persistQueue(), scheduleFlush(Math.max(100, nextRetryAt - Date.now())));
    }
  }
  ((bridgeWindow.fetch = async function (requestInput, requestInit = {}) {
    const { hbLogContext: hbLogContext, ...fetchOptions } = requestInit || {},
      requestPath = sanitizePath(
        typeof requestInput == "string" || requestInput instanceof URL
          ? requestInput
          : requestInput?.url
      );
    if (/^\/api\/v1\/logs(?:\/|$)/.test(requestPath))
      return originalFetch(requestInput, fetchOptions);
    const startedAt = Date.now(),
      requestInfo = {
        method: fetchOptions.method || requestInput?.method || "GET",
        path: requestPath,
        ...pickContext(hbLogContext)
      };
    try {
      const fetchResponse = await originalFetch(requestInput, fetchOptions),
        durationMs = Date.now() - startedAt;
      return (
        (!fetchResponse.ok || durationMs >= 5e3) &&
          (reportEvent(
            fetchResponse.ok ? "warning" : "error",
            "\u7F51\u7EDC\u8BF7\u6C42",
            `${fetchResponse.ok ? "\u8BF7\u6C42\u8017\u65F6\u8F83\u957F" : "\u8BF7\u6C42\u5931\u8D25"}\uFF1A${requestInfo.method} ${requestPath}${fetchResponse.ok ? "" : `\uFF08HTTP ${fetchResponse.status}\uFF09`}`,
            {
              ...requestInfo,
              status: fetchResponse.status,
              durationMs: durationMs,
              requestId: fetchResponse.headers?.get("X-Request-ID") || ""
            }
          ),
          fetchResponse.ok || linkedResponseSet.add(fetchResponse)),
        fetchResponse
      );
    } catch (caughtError) {
      const abortSignal =
        fetchOptions.signal === void 0 ? requestInput?.signal : fetchOptions.signal;
      throw (
        caughtError?.name === "AbortError" ||
          (abortSignal?.aborted && caughtError === abortSignal.reason) ||
          (reportEvent(
            "error",
            "\u7F51\u7EDC\u8BF7\u6C42",
            `\u7F51\u7EDC\u8FDE\u63A5\u5931\u8D25\uFF1A${requestInfo.method} ${requestPath}`,
            { ...requestInfo, durationMs: Date.now() - startedAt },
            caughtError?.stack || caughtError?.message || ""
          ),
          caughtError && typeof caughtError == "object" && reportedErrors.add(caughtError)),
        caughtError
      );
    }
  }),
    (bridgeWindow.HABridgeLog = {
      report: reportEvent,
      error: reportError,
      linkError: linkErrorToResponse,
      flush: flushQueue,
      setContext: contextInput => {
        logContext = pickContext(contextInput);
      }
    }),
    bridgeWindow.addEventListener(
      "error",
      errorEvent => {
        const failedTarget = errorEvent.target;
        if (
          failedTarget &&
          failedTarget !== bridgeWindow &&
          (failedTarget.src || failedTarget.href)
        ) {
          reportEvent(
            "error",
            "\u8D44\u6E90\u52A0\u8F7D",
            `\u8D44\u6E90\u52A0\u8F7D\u5931\u8D25\uFF1A${sanitizePath(failedTarget.src || failedTarget.href)}`,
            {
              path: failedTarget.src || failedTarget.href,
              phase: String(failedTarget.tagName || "resource").toLowerCase()
            }
          );
          return;
        }
        reportError(
          errorEvent.error ||
            new Error(errorEvent.message || "\u9875\u9762\u811A\u672C\u5F02\u5E38"),
          {
            path: errorEvent.filename || bridgeWindow.location.pathname,
            line: errorEvent.lineno,
            column: errorEvent.colno
          }
        );
      },
      !0
    ),
    bridgeWindow.addEventListener("unhandledrejection", rejectionEvent =>
      reportError(rejectionEvent.reason)
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
        eventQueue.push({
          queuedAt: storedEntry.queuedAt,
          event: {
            level: ["warning", "error", "info", "success"].includes(storedEvent.level)
              ? storedEvent.level
              : "error",
            source: redactSensitive(storedEvent.source || currentSourceName(), 64),
            category: redactSensitive(storedEvent.category || "\u754C\u9762", 64),
            message: redactSensitive(storedEvent.message || "\u672A\u77E5\u5F02\u5E38", 1e3),
            details: redactSensitive(storedEvent.details, 8e3),
            context: pickContext(storedEvent.context),
            clientTimestamp: new Date(storedEntry.queuedAt).toISOString()
          }
        });
      }
  } catch {}
  (persistQueue(), scheduleFlush());
})(window);
