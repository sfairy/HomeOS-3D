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
    isPublicPage = /^\/(?:login|setup)(?:\/|$)/.test(bridgeWindow.location.pathname);
  let publicMode = isPublicPage,
    eventQueue: any = [],
    flushTimer: any = null,
    isFlushing = false,
    retryDelayMs = 1000,
    nextRetryAt = 0,
    logPayload: Record<string, any> = {};

  // CSRF 头自补：homeos 后端的 CsrfMiddleware 对 /api/v1/logs/events（已登录上报）
  // 校验 X-CSRF-Token 与 csrf_token Cookie 双提交，缺失即 403。
  // 本文件是 index.html 里的经典脚本，在 document_start 就抓住了 window.fetch，
  // **早于** main.ts 的 installFetchCsrf() 全局包装，因此那次包装永远盖不到日志上报，
  // 必须自己读 Cookie 补头；否则已登录页面的异常上报恒定 403 并被静默丢弃。
  // 每次 flush 时现读（不缓存）：csrf_token 由首屏的 /setup/status 稍后才下发。
  function readCsrfToken() {
    try {
      const matchedCsrf = String(bridgeWindow.document?.cookie || "").match(
        /(?:^|;\s*)csrf_token=([^;]+)/,
      );
      return matchedCsrf ? decodeURIComponent(matchedCsrf[1]) : "";
    } catch {
      return "";
    }
  }
  function isDebugModeEnabled() {
    try {
      return new Set(["1", "true"]).has(
        new URLSearchParams(String(bridgeWindow.location?.search || "")).get("debug") || "",
      );
    } catch {
      return false;
    }
  }


  // 已知第三方扩展（图片助手 ImageAssistant）会在 document_start 往页面注入脚本并 patch window.fetch：
  // 给每次请求挂 .catch，失败时 console.error("Fetch request failed:", error) 再原样抛出。
  // 业务主动 abort 在途请求时拒绝值可能是 AbortError，也可能是字符串 reason（如 "stale" / "lifecycle"），
  // 二者都与业务无关（真正的网络故障由本文件的 fetch 包装器按业务口径上报），这里按特征一并丢弃。
  function isIgnorableThirdPartyConsoleError(consoleArguments: any) {
    const [consoleMessage, consoleCause] = consoleArguments;
    if (typeof consoleMessage != "string") return false;
    if (consoleMessage.startsWith("Error processing XMLHttpRequest response:")) return true;
    if (consoleMessage !== "Fetch request failed:") return false;
    return (
      consoleCause == null ||
      typeof consoleCause == "string" ||
      consoleCause?.name === "AbortError"
    );
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
  function sanitizePath(rawPath: any) {
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
  function redactSensitive(rawText: any, maxLength = 1000) {
    return String(rawText ?? "")
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
  function pickPayload(sourceFields: any) {
    const pickedPayload: Record<string, any> = {};
    for (const [detailKey, detailValue] of Object.entries(sourceFields || {}))
      !allowedPayloadKeySet.has(detailKey) ||
        detailValue == null ||
        !["string", "number", "boolean"].includes(typeof detailValue) ||
        ((pickedPayload as any)[detailKey] = ["path", "page"].includes(detailKey)
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
          ? "登录与初始化页面"
          : "仪表盘编辑器";
  }
  function buildEventDetails(errorEvent: ErrorEvent, eventTarget = "window") {
    const detailLines = [
      `\u4E8B\u4EF6\u7C7B\u578B\uFF1A${errorEvent.type || "error"}`,
      `\u4E8B\u4EF6\u76EE\u6807\uFF1A${eventTarget}`,
    ];
    (bridgeWindow.document?.readyState &&
      detailLines.push(`\u9875\u9762\u72B6\u6001\uFF1A${bridgeWindow.document.readyState}`),
      bridgeWindow.document?.visibilityState &&
        detailLines.push(
          `\u9875\u9762\u53EF\u89C1\u6027\uFF1A${bridgeWindow.document.visibilityState}`,
        ));
    const performanceNow = bridgeWindow.performance?.now?.();
    return (
      Number.isFinite(performanceNow) &&
        detailLines.push(
          `\u9875\u9762\u542F\u52A8\u540E\u6BEB\u79D2\uFF1A${Math.round(performanceNow)}`,
        ),
      detailLines
    );
  }
  function pruneQueue() {
    const cutoffTime = Date.now() - MAX_EVENT_AGE_MS;
    for (
      eventQueue = eventQueue
        .filter((prunedEntry: any) => prunedEntry.queuedAt >= cutoffTime)
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
    reportLevel: any,
    reportCategory: any,
    reportMessage: any,
    reportFields: any = {},
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
  // 主动 abort 产生的拒绝值不该被当成错误上报：可能是 AbortError，也可能是本仓库约定的字符串 reason
  // （render-cache 的 "stale"、renderer 的 "lifecycle"）。它们会经 unhandledrejection 触发这里。
  const ignorableAbortReasonSet = new Set(["stale", "lifecycle"]);
  function isAbortRejection(thrownValue: any) {
    return (
      thrownValue?.name === "AbortError" ||
      (typeof thrownValue == "string" && ignorableAbortReasonSet.has(thrownValue))
    );
  }
  function reportError(thrownValue: any = undefined, errorFields: any = {}, fallbackMessage: any = "") {
    if (isAbortRejection(thrownValue)) return;
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
  function linkErrorToResponse(errorObject: any, response: any) {
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
    const removeQueuedEntry = (queuedEntry: any) => {
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
          timeoutId = bridgeWindow.setTimeout(() => abortController?.abort(), 8000),
          // 匿名端点（public-events）不需要 CSRF（后端已豁免）；登录态上报必须带。
          csrfHeaderValue = publicMode ? "" : readCsrfToken();
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
                ...(csrfHeaderValue ? { "X-CSRF-Token": csrfHeaderValue } : {}),
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
  currentSrc?: string;
  href?: string;
  tagName?: string;
  error?: {
    code?: number;
    message?: string;
  };
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
    } catch (caughtError: any) {
      const abortSignal =
          fetchOptions.signal === undefined
            ? (requestInput as Request)?.signal
            : fetchOptions.signal,
        isAbortError =
          caughtError?.name === "AbortError" ||
          (abortSignal?.aborted && caughtError === abortSignal.reason),
        isTimeoutError =
          caughtError?.name === "TimeoutError" ||
          (abortSignal?.aborted && abortSignal.reason?.name === "TimeoutError");
      throw (
        (isTimeoutError || !isAbortError) &&
          (reportEvent(
            isTimeoutError ? "warning" : "error",
            "网络请求",
            `${
              isTimeoutError ? "请求超时，未能在限定时间内完成" : "网络连接失败"
            }\uFF1A${requestRecord.method} ${requestPath}`,
            {
              ...requestRecord,
              durationMs: Date.now() - startedAt,
              ...(isTimeoutError
                ? {
                    code: "REQUEST_TIMEOUT",
                  }
                : {}),
            },
            caughtError?.stack || caughtError?.message || "",
          ),
          caughtError && typeof caughtError == "object" && reportedErrorSet.add(caughtError),
          isTimeoutError &&
            abortSignal?.reason &&
            typeof abortSignal.reason == "object" &&
            reportedErrorSet.add(abortSignal.reason)),
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
        const failedTarget = errorEvent.target as ResourceErrorTarget,
          failedTagName = String(failedTarget?.tagName || "").toLowerCase(),
          failedSource = failedTarget?.currentSrc || failedTarget?.src || failedTarget?.href;
        /**
         * CSP 拦下页面里的行内 <style> 时，浏览器除了派发 securitypolicyviolation，还会
         * 给这个 <style> 元素发一个 error 事件，但**不带 message / filename / src**。
         * 于是它会掉进下面那条「浏览器错误事件（未提供异常信息）」分支，日志里只剩一句
         * BROWSER_ERROR_NO_DETAILS —— 完全看不出是 CSP 干的。
         * 这类事件交给下面的 securitypolicyviolation 监听器上报（那里能拿到
         * violatedDirective 与 blockedURI），这里直接跳过，避免同一次拦截记两条。
         */
        if (
          failedTagName === "style" &&
          !failedSource &&
          !errorEvent.message &&
          !errorEvent.filename
        )
          return;
        if (
          failedTarget &&
          failedTarget !== bridgeWindow &&
          (failedSource ||
            [
              "img",
              "script",
              "link",
              "video",
              "audio",
              "source",
              "iframe",
              "object",
              "embed",
            ].includes(failedTagName))
        ) {
          const resourceDetails = buildEventDetails(errorEvent, failedTagName || "resource");
          (failedTarget.error?.code != null &&
            resourceDetails.push(
              `\u5A92\u4F53\u9519\u8BEF\u4EE3\u7801\uFF1A${failedTarget.error.code}`,
            ),
            failedTarget.error?.message &&
              resourceDetails.push(
                `\u5A92\u4F53\u9519\u8BEF\u4FE1\u606F\uFF1A${failedTarget.error.message}`,
              ),
            reportEvent(
              "error",
              "资源加载",
              `\u8D44\u6E90\u52A0\u8F7D\u5931\u8D25\uFF1A${
                failedSource
                  ? sanitizePath(failedSource)
                  : `${failedTagName}\uFF08\u6D4F\u89C8\u5668\u672A\u63D0\u4F9B\u8D44\u6E90\u5730\u5740\uFF09`
              }`,
              {
                ...(failedSource
                  ? {
                      path: failedSource,
                    }
                  : {
                      code: "RESOURCE_ERROR_NO_PATH",
                    }),
                phase: failedTagName || "resource",
              },
              resourceDetails.join("\n"),
            ));
          return;
        }
        const scriptErrorFields: Record<string, string | number> = {
          path: errorEvent.filename || bridgeWindow.location.pathname,
          line: errorEvent.lineno,
          column: errorEvent.colno,
        };
        if (errorEvent.error) {
          reportError(errorEvent.error, scriptErrorFields, errorEvent.message);
          return;
        }
        const errorMessage = errorEvent.message || "浏览器错误事件（未提供异常信息）",
          errorDetails = buildEventDetails(errorEvent);
        (errorDetails.push("浏览器未提供原始异常堆栈；未生成日志收集器堆栈。"),
          errorEvent.filename ||
            errorDetails.push("浏览器未提供出错脚本的位置；请求路径为当前页面地址。"),
          errorEvent.message
            ? errorEvent.message === "Script error." &&
              !errorEvent.filename &&
              !errorEvent.lineno &&
              !errorEvent.colno &&
              ((scriptErrorFields.code = "SCRIPT_ERROR_OPAQUE"),
              errorDetails.push(
                "浏览器仅返回 Script error.，可能限制了异常详情；不能据此确定具体脚本或原因。",
              ))
            : (scriptErrorFields.code = "BROWSER_ERROR_NO_DETAILS"));
        const isResizeObserverLoop =
          [
            "ResizeObserver loop completed with undelivered notifications.",
            "ResizeObserver loop limit exceeded",
          ].includes(errorEvent.message) &&
          !errorEvent.lineno &&
          !errorEvent.colno;
        (isResizeObserverLoop &&
          ((scriptErrorFields.code = "RESIZE_OBSERVER_LOOP"),
          errorDetails.push(
            "浏览器推迟了本轮部分尺寸通知；若反复出现或伴随卡顿，需检查布局与尺寸监听回调。",
          )),
          reportEvent(
            isResizeObserverLoop ? "warning" : "error",
            "界面",
            errorMessage,
            scriptErrorFields,
            errorDetails.join("\n"),
          ));
      },
      true,
    ),
    /**
     * 内容安全策略（CSP）拦截上报。
     *
     * 没有这个监听器时，CSP 拦截要么只留一行控制台警告、要么被降级成
     * BROWSER_ERROR_NO_DETAILS（见上面 error 监听器里的说明），排查时只能靠猜。
     * securitypolicyviolation 事件带 violatedDirective / blockedURI / sourceFile，
     * 足以直接定位「哪条指令拦了什么、来源在哪一行」。
     *
     * 外壳页下发的策略见 backend/src/studio_shell.py 的 `_csp_header`。
     */
    bridgeWindow.addEventListener(
      "securitypolicyviolation",
      (violationEvent) => {
        const violatedDirective = violationEvent.violatedDirective || "",
          effectiveDirective = violationEvent.effectiveDirective || violatedDirective,
          blockedURI = violationEvent.blockedURI || "",
          disposition = violationEvent.disposition || "enforce",
          sourceFile = violationEvent.sourceFile
            ? sanitizePath(violationEvent.sourceFile)
            : "",
          blockedKind =
            blockedURI === "inline"
              ? "行内资源"
              : blockedURI === "eval"
                ? "eval"
                : blockedURI || "（浏览器未提供被拦截地址）",
          /**
           * 行内 <style> / style="..." 是最容易踩到的一条：外壳页是 `style-src 'self'`，
           * 样式只能外链到 /static/** 或用 <link> 引入。这里把修复方向直接写进日志，
           * 免得再出现「改了样式却毫无效果、控制台也只说 blocked」的情况。
           */
          guidance = /^style-src/.test(effectiveDirective)
            ? "样式需外链（/static/** 或 <link rel=stylesheet>）：当前策略是 style-src 'self'，" +
              "行内 <style> 与 style=\"...\" 都会被拦下。"
            : /^script-src/.test(effectiveDirective)
              ? "脚本需来自同源文件：当前策略是 script-src 'self'，行内 <script> 与 eval 都会被拦下。"
              : "";
        reportEvent(
          "error",
          "内容安全策略",
          `内容安全策略拦截（${disposition === "report" ? "仅上报" : "已阻止"}）：${
            effectiveDirective || "未知指令"
          } → ${blockedKind}`,
          {
            code: "CSP_VIOLATION",
            phase: effectiveDirective || "csp",
            path: sourceFile || bridgeWindow.location.pathname,
            line: Number.isFinite(violationEvent.lineNumber) ? violationEvent.lineNumber : 0,
            column: Number.isFinite(violationEvent.columnNumber) ? violationEvent.columnNumber : 0,
          },
          [
            `违反的指令：${violatedDirective || "（未提供）"}`,
            `生效指令：${effectiveDirective || "（未提供）"}`,
            `被拦截地址：${blockedURI || "（未提供）"}`,
            `来源文件：${sourceFile || "当前文档内联"}`,
            `来源位置：第 ${violationEvent.lineNumber || 0} 行第 ${
              violationEvent.columnNumber || 0
            } 列`,
            `处置方式：${disposition}`,
            guidance,
          ]
            .filter(Boolean)
            .join("\n"),
        );
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
