/**
 * 客户端日志上报（浏览器侧）。
 *
 * 位置：最早期加载的独立脚本，包裹 window.fetch 后暴露 window.HABridgeLog。
 * 职责：收集未捕获异常、资源加载失败、未处理的 Promise 拒绝与请求异常
 *   （失败或耗时超 5 秒），脱敏后进入本地队列，按批发送到 /api/v1/logs/events。
 * 约定：① 登录 / 初始化 / 配对这类公开页面只允许上报 warning 与 error，
 *   并改发 /api/v1/logs/public-events，避免把未登录用户的普通信息写进后台；
 *   ② 队列存 sessionStorage，上限 50 条 / 约 120KB / 15 分钟，超限丢最旧的；
 *   ③ 失败按指数退避重试（1 秒起，上限 60 秒），单次 flush 最多尝试 5 条；
 *   ④ 上报路径本身不记录，防止日志请求自激。
 */
(function (bridgeWindow) {
  "use strict";
  // 已初始化过或环境不支持 fetch（老浏览器）时直接退出，保证脚本可重复引入。
  if (bridgeWindow.HABridgeLog || typeof bridgeWindow.fetch != "function") return;
  // originalFetch 先绑定好 this，后续替换 window.fetch 后仍能调用原生实现。
  const originalFetch = bridgeWindow.fetch.bind(bridgeWindow),
    LOG_STORAGE_KEY = "homeos-client-log-v1",
    MAX_QUEUED_EVENT_COUNT = 50,
    // 12e4 字节 ≈ 120KB，避免 sessionStorage 被日志撑爆。
    MAX_QUEUE_BYTES = 12e4,
    // 900 秒（15 分钟）之前的日志视为过期，不再补报。
    MAX_EVENT_AGE_MS = 900 * 1e3,
    // 已上报过的错误对象与已关联响应用 WeakSet 去重，避免同一错误反复入队。
    reportedErrors = new WeakSet(),
    linkedResponseSet = new WeakSet(),
    // 上下文白名单：只允许这些键进入日志，其余一律丢弃，防止误传敏感字段。
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
    // 浏览器在 ResizeObserver 回调改动布局时派发的循环保护提示。它没有可用堆栈、
    // 也不代表业务出错，却会随每次布局抖动重复上报，这里统一识别后丢弃。
    // 真正需要修的是触发它的布局代码，而不是把这条提示记进后台。
    RESIZE_OBSERVER_LOOP_ERROR = /^ResizeObserver loop (?:completed with undelivered notifications|limit exceeded)\.?$/,
    isPublicPage = /^\/(?:login|setup|pair|license)(?:\/|$)/.test(bridgeWindow.location.pathname);
  // publicMode 可在收到 401 后动态切到 true（会话过期降级为公开上报）。
  let publicMode = isPublicPage,
    eventQueue = [],
    flushTimer = null,
    isFlushing = !1,
    // retryDelayMs 是下一次失败后的等待时间，成倍增长；nextRetryAt 是允许重试的时间点。
    retryDelayMs = 1e3,
    nextRetryAt = 0,
    logContext = {};

  /**
   * 归一化并脱敏请求路径。
   */
  function sanitizePath(rawPath) {
    try {
      const parsedUrl = new URL(String(rawPath || ""), bridgeWindow.location.href);
      // 非 http(s) / ws(s) 协议只保留协议名，避免泄漏自定义协议里的参数。
      if (!["http:", "https:", "ws:", "wss:"].includes(parsedUrl.protocol))
        return `[${parsedUrl.protocol.replace(":", "")}]`;
      let normalizedPath = parsedUrl.pathname;
      try {
        normalizedPath = decodeURIComponent(normalizedPath);
      } catch {}
      // HLS 流地址带随机 token，统一折叠成 [stream]；邮箱 / JWT 也一并替换。
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

  /**
   * 对任意文本做敏感信息脱敏。
   *
   * @param {*} rawText 原始文本。
   * @param {number} [maxLength] 截断长度，默认 1000。
   * @returns {string} 脱敏后的文本。
   */
  function redactSensitive(rawText, maxLength = 1e3) {
    // 依次处理：Cookie 头、PEM 私钥、邮箱、URL、Bearer Token、JWT、
    // 各种「密钥=值」写法、HLS 流地址，最后统一去掉剩余查询串。
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

  /**
   * 按白名单挑出可上报的上下文字段。
   *
   * @returns {object} 只含白名单键、且值已脱敏的上下文。
   */
  function pickContext(contextRecord) {
    const pickedContext = {};
    // 逐个键过滤：白名单外、值为 null / undefined、类型不是基本类型的都跳过。
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

  // 按当前页面推断日志来源名称，后台日志列表里直接显示这四类来源。
  function currentSourceName() {
    return bridgeWindow.location.pathname.startsWith("/3d-studio")
      ? "3D 户型编辑器"
      : /^\/display\//.test(bridgeWindow.location.pathname)
        ? "展示设备"
        : isPublicPage
          ? "登录与配对页面"
          : "仪表盘编辑器";
  }

  // 清理过期与超量的队列项：先按时间淘汰，再按总字节数从队首丢弃。
  function pruneQueue() {
    const cutoffTime = Date.now() - MAX_EVENT_AGE_MS;
    // 条件里用 JSON.stringify 估长：队列最多 50 条，这个开销可以接受。
    for (
      eventQueue = eventQueue
        .filter(prunedEntry => prunedEntry.queuedAt >= cutoffTime)
        .slice(-MAX_QUEUED_EVENT_COUNT);
      eventQueue.length && JSON.stringify(eventQueue).length > MAX_QUEUE_BYTES;
    )
      eventQueue.shift();
  }

  // 把队列持久化到 sessionStorage；隐私模式下写入失败则静默忽略。
  function persistQueue() {
    pruneQueue();
    try {
      eventQueue.length
        ? bridgeWindow.sessionStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(eventQueue))
        : bridgeWindow.sessionStorage.removeItem(LOG_STORAGE_KEY);
    } catch {}
  }

  // 安排一次发送；已有定时器或队列为空时不重复排程（天然合并短时间内的多次事件）。
  function scheduleFlush(delayMs = 100) {
    flushTimer ||
      !eventQueue.length ||
      (flushTimer = bridgeWindow.setTimeout(() => {
        ((flushTimer = null), flushQueue());
      }, delayMs));
  }

  /**
   * 组装并入队一条日志事件。
   *
   * @param {string} [reportDetails] 详情（通常是堆栈），截断到 8000 字符。
   */
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
      category: redactSensitive(reportCategory || "界面", 64),
      message: redactSensitive(reportMessage || "未知异常", 1e3) || "未知异常",
      details: redactSensitive(reportDetails, 8e3) || null,
      context: pickContext({
        userAgent: bridgeWindow.navigator?.userAgent || "",
        // 全局上下文在前，单条事件的上下文可覆盖同名键。
        ...logContext,
        ...reportContext,
        // page 必须钉死为当前路径：公开通道用它做白名单门禁，
        // 不能被 hbLogContext / setContext 里的同名键覆盖成编辑器路径。
        page: bridgeWindow.location.pathname
      }),
      clientTimestamp: new Date().toISOString()
    };
    // 公开页面（登录 / 配对）只允许上报 warning 与 error，其余等级直接丢弃。
    (publicMode && !["warning", "error"].includes(eventPayload.level)) ||
      (eventQueue.push({ event: eventPayload, queuedAt: Date.now() }),
      persistQueue(),
      scheduleFlush());
  }

  /**
   * 上报一个异常对象。
   */
  function reportError(thrownValue, extraContext = {}, fallbackMessage = "") {
    if (thrownValue && typeof thrownValue == "object") {
      // 同一个 Error 只上报一次，避免 catch 链里层层重复。
      if (reportedErrors.has(thrownValue)) return;
      reportedErrors.add(thrownValue);
    }
    reportEvent(
      "error",
      "界面",
      fallbackMessage || thrownValue?.message || String(thrownValue || "未知异常"),
      extraContext,
      thrownValue?.stack || ""
    );
  }

  /**
   * 把错误对象与响应关联，避免同一错误在别处再报一次。
   */
  function linkErrorToResponse(errorObject, response) {
    return (
      errorObject &&
        typeof errorObject == "object" &&
        linkedResponseSet.has(response) &&
        reportedErrors.add(errorObject),
      errorObject
    );
  }

  /**
   * 公开通道发送前规范化：钉死 page、丢掉非法时间戳、保证 message 非空。
   * 队列可能残留编辑器页的 page（例如会话过期后降级到 public-events），
   * 不处理就会被服务端以「不支持的页面」422 打回，控制台刷红。
   */
  function normalizePublicEvent(rawEvent) {
    const context = { ...(rawEvent?.context || {}) };
    context.page = String(bridgeWindow.location.pathname || "/")
      .split(/[?#]/, 1)[0]
      .replace(/\/+$/, "") || "/";
    const parsedTimestamp = new Date(rawEvent?.clientTimestamp || Date.now());
    return {
      level: ["warning", "error"].includes(rawEvent?.level) ? rawEvent.level : "error",
      source: redactSensitive(rawEvent?.source || currentSourceName(), 64),
      category: redactSensitive(rawEvent?.category || "界面", 64),
      message: redactSensitive(rawEvent?.message || "未知异常", 1e3) || "未知异常",
      details: rawEvent?.details ? redactSensitive(rawEvent.details, 8e3) : null,
      context: pickContext(context),
      clientTimestamp: Number.isFinite(parsedTimestamp.getTime())
        ? parsedTimestamp.toISOString()
        : new Date().toISOString()
    };
  }

  // 把队列里的日志逐条发给后端，失败按退避策略重试。
  async function flushQueue() {
    // 正在发送或明确离线时不发起请求（离线时等待 online 事件唤醒）。
    if (isFlushing || bridgeWindow.navigator?.onLine === !1) return;
    if (Date.now() < nextRetryAt) {
      scheduleFlush(nextRetryAt - Date.now());
      return;
    }
    if ((pruneQueue(), !eventQueue.length)) {
      persistQueue();
      return;
    }
    // 从待发送队列摘掉一条日志（发送成功，或因切到公开模式被跳过）。不用下标而是用
    // indexOf 重新定位：队列在 await 期间可能被并发修改，下标会失效；找不到时静默跳过。
    const removeQueuedEntry = queuedEntry => {
      const queueIndex = eventQueue.indexOf(queuedEntry);
      // 队列可能在并发中被清空，下标为 -1 时直接跳过。
      queueIndex >= 0 && eventQueue.splice(queueIndex, 1);
    };
    isFlushing = !0;
    try {
      // 单次 flush 最多尝试 5 条：避免长时间占用主线程，剩余留给下一轮。
      for (let attemptIndex = 0; eventQueue.length && attemptIndex < 5; attemptIndex += 1) {
        const batchEntry = eventQueue[0];
        // 页面切换到公开模式后，队列里遗留的 info / success 不再发送。
        if (publicMode && !["warning", "error"].includes(batchEntry.event.level)) {
          removeQueuedEntry(batchEntry);
          continue;
        }
        const abortController = typeof AbortController == "function" ? new AbortController() : null,
          // 8 秒超时兜底：网络挂起时主动 abort，避免请求队列堆积。
          timeoutId = bridgeWindow.setTimeout(() => abortController?.abort(), 8e3);
        // 公开通道发送前规范化，避免「不支持的页面 / 空 message / 非法时间」打出 422。
        const eventBody = publicMode ? normalizePublicEvent(batchEntry.event) : batchEntry.event;
        let sendResponse;
        try {
          sendResponse = await originalFetch(
            `/api/v1/logs/${publicMode ? "public-events" : "events"}`,
            {
              method: "POST",
              cache: "no-store",
              // keepalive 让页面卸载途中也能把日志发出去。
              keepalive: !0,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(eventBody),
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
          // 会话过期：降级为公开上报，1 秒后继续发（后续可用 public-events）。
          ((publicMode = !0), (nextRetryAt = Date.now() + 1e3));
          break;
        }
        if (sendResponse.status === 429 || sendResponse.status >= 500) {
          // 限流或服务端故障：尊重 Retry-After，同时把退避时长翻倍（上限 60 秒）。
          const retryAfterMs = Number(sendResponse.headers?.get("Retry-After")) * 1e3;
          ((nextRetryAt = Date.now() + Math.min(6e4, Math.max(retryDelayMs, retryAfterMs || 0))),
            (retryDelayMs = Math.min(6e4, retryDelayMs * 2)));
          break;
        }
        // 400 类客户端错误重试无意义，直接丢弃该条。
        removeQueuedEntry(batchEntry);
      }
    } catch {
      // 网络异常：整轮退避，等待下次排程。
      ((nextRetryAt = Date.now() + retryDelayMs), (retryDelayMs = Math.min(6e4, retryDelayMs * 2)));
    } finally {
      ((isFlushing = !1), persistQueue(), scheduleFlush(Math.max(100, nextRetryAt - Date.now())));
    }
  }

  // 包裹 fetch：记录失败与慢请求；业务可传 hbLogContext 附加日志上下文（不发给后端）。
  ((bridgeWindow.fetch = async function (requestInput, requestInit = {}) {
    const { hbLogContext: hbLogContext, ...fetchOptions } = requestInit || {},
      requestPath = sanitizePath(
        typeof requestInput == "string" || requestInput instanceof URL
          ? requestInput
          : requestInput?.url
      );
    // 日志接口自身的请求不记录，否则上报失败会引发日志风暴。
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
      // 失败记 error；成功但超过 5 秒记 warning，用于发现性能退化。
      // 成功时把响应标记为「已上报」，随后抛错时 linkErrorToResponse 不会重复记录。
      return (
        (!fetchResponse.ok || durationMs >= 5e3) &&
          (reportEvent(
            fetchResponse.ok ? "warning" : "error",
            "网络请求",
            `${fetchResponse.ok ? "请求耗时较长" : "请求失败"}：${requestInfo.method} ${requestPath}${fetchResponse.ok ? "" : `（HTTP ${fetchResponse.status}）`}`,
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
      // 取实际生效的 signal：显式传入优先，否则用 Request 对象自带的。
      const abortSignal =
        fetchOptions.signal === void 0 ? requestInput?.signal : fetchOptions.signal;
      throw (
        // 主动取消（AbortError 或与 signal.reason 相同）不算故障，不记录。
        caughtError?.name === "AbortError" ||
          (abortSignal?.aborted && caughtError === abortSignal.reason) ||
          (reportEvent(
            "error",
            "网络请求",
            `网络连接失败：${requestInfo.method} ${requestPath}`,
            { ...requestInfo, durationMs: Date.now() - startedAt },
            caughtError?.stack || caughtError?.message || ""
          ),
          caughtError && typeof caughtError == "object" && reportedErrors.add(caughtError)),
        caughtError
      );
    }
  }),
    // 对外接口：手动上报、上报错误、关联错误与响应、强制发送、设置全局上下文。
    (bridgeWindow.HABridgeLog = {
      report: reportEvent,
      error: reportError,
      linkError: linkErrorToResponse,
      flush: flushQueue,
      setContext: contextInput => {
        logContext = pickContext(contextInput);
      }
    }),
    // 资源加载失败不会冒泡到 window.onerror，只能靠捕获阶段的 error 事件。
    bridgeWindow.addEventListener(
      "error",
      errorEvent => {
        // 先丢掉浏览器自身的 ResizeObserver 循环提示：非业务异常且高频重复。
        if (RESIZE_OBSERVER_LOOP_ERROR.test(errorEvent.message || "")) {
          return;
        }
        const failedTarget = errorEvent.target;
        if (
          failedTarget &&
          failedTarget !== bridgeWindow &&
          (failedTarget.src || failedTarget.href)
        ) {
          reportEvent(
            "error",
            "资源加载",
            `资源加载失败：${sanitizePath(failedTarget.src || failedTarget.href)}`,
            {
              path: failedTarget.src || failedTarget.href,
              phase: String(failedTarget.tagName || "resource").toLowerCase()
            }
          );
          return;
        }
        reportError(
          errorEvent.error ||
            new Error(errorEvent.message || "页面脚本异常"),
          {
            path: errorEvent.filename || bridgeWindow.location.pathname,
            line: errorEvent.lineno,
            column: errorEvent.colno
          }
        );
      },
      // 捕获阶段才能拿到图片 / 脚本等资源的加载错误。
      !0
    ),
    bridgeWindow.addEventListener("unhandledrejection", rejectionEvent =>
      reportError(rejectionEvent.reason)
    ),
    // 网络恢复时立刻清空退避状态并重试，不必等下一个排程。
    bridgeWindow.addEventListener("online", () => {
      ((nextRetryAt = 0), flushQueue());
    }),
    bridgeWindow.addEventListener("pagehide", () => {
      // 页面即将卸载：落盘并趁机把队列发出去。
      (persistQueue(), flushQueue());
    }));
  // 恢复上次会话留下的队列（刷新 / 跳转前的日志），逐条做同样的脱敏与校验。
  try {
    const storedEntries = JSON.parse(bridgeWindow.sessionStorage.getItem(LOG_STORAGE_KEY) || "[]");
    if (Array.isArray(storedEntries))
      for (const storedEntry of storedEntries.slice(-MAX_QUEUED_EVENT_COUNT)) {
        // 结构不完整或已过期的历史条目直接丢弃。
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
            category: redactSensitive(storedEvent.category || "界面", 64),
            message: redactSensitive(storedEvent.message || "未知异常", 1e3),
            details: redactSensitive(storedEvent.details, 8e3),
            context: pickContext({
              ...(storedEvent.context || {}),
              // 恢复队列时也钉死为当前页，避免带着旧 page 撞上公开通道白名单。
              page: bridgeWindow.location.pathname
            }),
            // 时间用入队时刻，保证补报日志的时间线仍准确。
            clientTimestamp: (() => {
              const queuedDate = new Date(storedEntry.queuedAt);
              return Number.isFinite(queuedDate.getTime())
                ? queuedDate.toISOString()
                : new Date().toISOString();
            })()
          }
        });
      }
  } catch {}
  // 启动即落盘一次（顺带裁剪），并安排发送。
  (persistQueue(), scheduleFlush());
})(window);
