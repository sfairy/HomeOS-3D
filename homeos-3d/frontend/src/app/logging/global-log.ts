import type { DomControl } from "@app/utils/dom-control";
const LEVEL_LABELS = {
  info: "信息",
  success: "成功",
  warning: "警告",
  error: "错误",
};
const CONTEXT_LABELS = {
  requestId: "请求编号",
  path: "请求路径",
  method: "请求方法",
  status: "响应状态",
  durationMs: "耗时（毫秒）",
  page: "页面",
  projectId: "仪表盘编号",
  componentId: "控件编号",
  entityId: "实体",
  service: "服务",
  displayId: "展示设备编号",
  displayName: "展示设备名称",
  actor: "操作账号",
  userAgent: "浏览器信息",
  code: "原因代码",
  line: "行号",
  column: "列号",
  phase: "发生阶段",
};
const EVENT_LABELS = {
  startup: "程序启动",
  ready: "程序就绪",
  shutdown: "程序停止",
  accepted: "建立连接",
  rejected: "拒绝或终止连接",
  disconnected: "连接断开",
  subscribe: "订阅实体",
  "camera-stream": "摄像头持续传输",
  "device-control": "设备控制",
  "component-action": "控件操作",
  "runtime-operation": "显示端操作",
  "editor-operation": "编辑器操作",
  "save-draft": "仪表盘保存",
  "display-refresh": "仪表盘刷新",
  "studio-save": "户型草稿保存",
  "studio-exit-save": "退出前保存户型",
  "studio-export": "户型导出",
  "studio-model-load": "3D 模型加载",
  "studio-webgl-init": "3D 图形初始化",
  "studio-webgl-context": "3D 图形上下文",
  "studio-light-precompile": "灯光材质提前准备",
  "studio-model-precompile": "模型材质提前准备",
  "studio-initial-precompile": "首屏材质提前准备",
  "studio-shadow-atlas": "聚光灯阴影图集生成",
  "studio-light-cache": "光照缓存生成",
  "studio-light-cache-restore": "光照缓存恢复",
  "interaction3d-cache-write": "3D 缓存写入",
  "interaction3d-settled-cache": "3D 稳定画面缓存",
  "interaction3d-lifecycle": "3D 运行生命周期",
  "websocket-reconnected": "实时连接恢复",
  "websocket-disconnected": "实时连接断开",
  "websocket-message": "实时消息处理",
  "history-timeout": "历史曲线超时",
};
function formatContextEntry(contextKey, contextValue) {
  const eventLabel = contextKey === "phase" ? EVENT_LABELS[contextValue] : null;
  return (
    (CONTEXT_LABELS[contextKey] || contextKey) +
    "（" +
    contextKey +
    "）：" +
    (eventLabel ? eventLabel + "（" + contextValue + "）" : contextValue)
  );
}
function formatTimestamp(timestamp) {
  const parsedDate = new Date(timestamp);
  return Number.isNaN(parsedDate.getTime())
    ? "时间未知"
    : new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
        .format(parsedDate)
        .replace(/\//g, "-");
}
export function setupGlobalLog({ api: apiRequest }) {
  const globalLogOpenButton = document.querySelector<DomControl>("#global-log-open"),
    globalLogDialogElement = document.querySelector<DomControl>("#global-log-dialog");
  if (
    !globalLogOpenButton ||
    !globalLogDialogElement ||
    globalLogOpenButton.dataset.globalLogReady === "true"
  )
    return null;
  globalLogOpenButton.dataset.globalLogReady = "true";
  const globalLogCloseButton = globalLogDialogElement.querySelector<DomControl>("#global-log-close"),
    globalLogCloseFooterButton = globalLogDialogElement.querySelector<DomControl>("#global-log-close-footer"),
    globalLogRefreshButton = globalLogDialogElement.querySelector<DomControl>("#global-log-refresh"),
    globalLogExportButton = globalLogDialogElement.querySelector<DomControl>("#global-log-export"),
    globalLogClearButton = globalLogDialogElement.querySelector<DomControl>("#global-log-clear"),
    globalLogMoreButton = globalLogDialogElement.querySelector<DomControl>("#global-log-more"),
    globalLogLevelSelect = globalLogDialogElement.querySelector<DomControl>("#global-log-level"),
    globalLogCategorySelect = globalLogDialogElement.querySelector<DomControl>("#global-log-category"),
    globalLogSearchInput = globalLogDialogElement.querySelector<DomControl>("#global-log-search"),
    globalLogListElement = globalLogDialogElement.querySelector<DomControl>("#global-log-list"),
    globalLogStatusElement = globalLogDialogElement.querySelector<DomControl>("#global-log-status");
  let entries = [],
    isLoading = false,
    refreshTimer = null,
    searchTimer = null,
    nextOffset = null,
    hasPendingRefresh = false;
  const PAGE_SIZE = 200;
  function renderEntries(entryList) {
    if ((globalLogListElement.replaceChildren(), !entryList.length)) {
      const emptyElement = document.createElement("div");
      ((emptyElement.className = "global-log-empty"),
        (emptyElement.textContent = "当前筛选条件下没有日志。"),
        globalLogListElement.append(emptyElement));
      return;
    }
    const logListFragmentNode = document.createDocumentFragment();
    for (const logEntry of entryList) {
      const itemElement = document.createElement("article");
      itemElement.className = "global-log-item " + (logEntry.level || "info");
      const levelIcon = document.createElement("i");
      levelIcon.setAttribute("aria-hidden", "true");
      const bodyElement = document.createElement("div"),
        messageElement = document.createElement("strong");
      messageElement.textContent = logEntry.message || "未提供说明";
      const metaElement = document.createElement("span"),
        timeText = logEntry.clientTimestamp
          ? "客户端发生 " +
            formatTimestamp(logEntry.clientTimestamp) +
            " · 接收 " +
            formatTimestamp(logEntry.timestamp)
          : formatTimestamp(logEntry.timestamp);
      if (
        ((metaElement.textContent =
          timeText +
          " · " +
          (logEntry.source || "系统后台") +
          " · " +
          (logEntry.category || "系统")),
        bodyElement.append(messageElement, metaElement),
        logEntry.details || Object.keys(logEntry.context || {}).length)
      ) {
        const detailsElement = document.createElement("details"),
          summaryElement = document.createElement("summary");
        summaryElement.textContent = "查看详情";
        const detailsPreElement = document.createElement("pre");
        ((detailsPreElement.textContent = [
          ...Object.entries(logEntry.context || {}).map(
            ([detailKey, detailValue]) => formatContextEntry(detailKey, detailValue),
          ),
          logEntry.details || "",
        ]
          .filter(Boolean)
          .join("\n")),
          detailsElement.append(summaryElement, detailsPreElement),
          bodyElement.append(detailsElement));
      }
      if (Number(logEntry.repeatCount || 1) > 1) {
        const repeatElement = document.createElement("span");
        ((repeatElement.textContent =
          "重复 " +
          logEntry.repeatCount +
          " 次 · 最近" +
          (logEntry.lastClientTimestamp ? "发生" : "接收") +
          " " +
          formatTimestamp(
            logEntry.lastClientTimestamp || logEntry.lastTimestamp || logEntry.timestamp,
          )),
          bodyElement.append(repeatElement));
      }
      const levelBadge = document.createElement("b");
      ((levelBadge.textContent = LEVEL_LABELS[logEntry.level] || "信息"),
        itemElement.append(levelIcon, bodyElement, levelBadge),
        logListFragmentNode.append(itemElement));
    }
    globalLogListElement.append(logListFragmentNode);
  }
  function syncCategoryOptions(categories) {
    const currentCategory = globalLogCategorySelect.value;
    globalLogCategorySelect.replaceChildren(new Option("全部分类", ""));
    for (const category of categories || [])
      globalLogCategorySelect.add(new Option(category, category));
    globalLogCategorySelect.value = [...globalLogCategorySelect.options].some(
      (option) => option.value === currentCategory,
    )
      ? currentCategory
      : "";
  }
  function buildQueryParams() {
    const searchParams = new URLSearchParams();
    return (
      globalLogLevelSelect.value && searchParams.set("level", globalLogLevelSelect.value),
      globalLogCategorySelect.value && searchParams.set("category", globalLogCategorySelect.value),
      globalLogSearchInput.value.trim() &&
        searchParams.set("search", globalLogSearchInput.value.trim()),
      searchParams
    );
  }
  async function loadEntries({ append: append = false } = {}) {
    if (isLoading) {
      append || (hasPendingRefresh = true);
      return;
    }
    ((isLoading = true),
      (globalLogRefreshButton.disabled = true),
      (globalLogMoreButton.disabled = true),
      append || ((entries = []), (nextOffset = null), (globalLogMoreButton.hidden = true)),
      (globalLogStatusElement.textContent = "正在读取全局日志…"));
    try {
      const queryParams = buildQueryParams();
      (queryParams.set("limit", String(PAGE_SIZE)),
        queryParams.set("offset", String((append && nextOffset) || 0)));
      const response = await apiRequest("/logs?" + queryParams),
        items = response?.items || [];
      ((entries = append
        ? [...new Map([...entries, ...items].map((entry) => [entry.id, entry])).values()]
        : items),
        (nextOffset = response?.hasMore ? response.nextOffset : null),
        syncCategoryOptions(response?.categories || []),
        renderEntries(entries));
      const storage = response?.storage || {},
        sizeLimitText = storage.maxBytes
          ? " / " + (storage.maxBytes / 1024 / 1024).toFixed(0) + " MB 上限"
          : "",
        autoRefreshNote = entries.length > PAGE_SIZE ? " · 查看历史时暂停自动刷新" : "",
        storageErrorText =
          storage.healthy === false
            ? " · 日志存储异常：" +
              (storage.lastError || "写入失败") +
              "（待写 " +
              (storage.pendingEvents || 0) +
              "，丢弃 " +
              (storage.droppedEvents || 0) +
              "）"
            : "",
        writeFailureText =
          storage.healthy !== false && (storage.writeFailures > 0 || storage.droppedEvents > 0)
            ? " · 历史写入失败 " +
              (storage.writeFailures || 0) +
              " 次，丢弃 " +
              (storage.droppedEvents || 0) +
              " 条"
            : "";
      ((globalLogStatusElement.textContent =
        "已显示 " +
        entries.length +
        " / " +
        (response?.total ?? entries.length) +
        " 条 · 自动保留最近 " +
        (storage.retentionDays || response?.retentionDays || 7) +
        " 天" +
        sizeLimitText +
        autoRefreshNote +
        storageErrorText +
        writeFailureText),
        (globalLogMoreButton.hidden = nextOffset == null));
    } catch (caughtError) {
      ((globalLogStatusElement.textContent = caughtError.message || "日志读取失败。"),
        append || renderEntries([]));
    } finally {
      ((isLoading = false),
        (globalLogRefreshButton.disabled = false),
        (globalLogMoreButton.disabled = false),
        hasPendingRefresh && ((hasPendingRefresh = false), loadEntries()));
    }
  }
  function stopAutoRefresh() {
    (refreshTimer && window.clearInterval(refreshTimer), (refreshTimer = null));
  }
  async function openDialog() {
    (globalLogDialogElement.open || globalLogDialogElement.showModal(),
      await loadEntries(),
      stopAutoRefresh(),
      (refreshTimer = window.setInterval(() => {
        entries.length <= PAGE_SIZE &&
          !globalLogListElement.querySelector<DomControl>("details[open]") &&
          loadEntries();
      }, 10000)));
  }
  function closeDialog() {
    (stopAutoRefresh(), globalLogDialogElement.open && globalLogDialogElement.close());
  }
  return (
    globalLogOpenButton.addEventListener("click", openDialog),
    globalLogCloseButton.addEventListener("click", closeDialog),
    globalLogCloseFooterButton.addEventListener("click", closeDialog),
    globalLogRefreshButton.addEventListener("click", () => loadEntries()),
    globalLogMoreButton.addEventListener("click", () =>
      loadEntries({
        append: true,
      }),
    ),
    globalLogLevelSelect.addEventListener("change", () => loadEntries()),
    globalLogCategorySelect.addEventListener("change", () => loadEntries()),
    globalLogSearchInput.addEventListener("input", () => {
      (window.clearTimeout(searchTimer), (searchTimer = window.setTimeout(loadEntries, 250)));
    }),
    globalLogDialogElement.addEventListener("close", stopAutoRefresh),
    globalLogExportButton.addEventListener("click", () => {
      const downloadLink = document.createElement("a"),
        exportParams = buildQueryParams();
      ((downloadLink.href = "/api/v1/logs/export" + (exportParams.size ? "?" + exportParams : "")),
        (downloadLink.download =
          "homeos-global-log-" + new Date().toISOString().slice(0, 10) + ".txt"),
        document.body.append(downloadLink),
        downloadLink.click(),
        downloadLink.remove());
    }),
    globalLogClearButton.addEventListener("click", async () => {
      if (window.confirm("确定清空当前全局日志吗？清空后无法恢复。")) {
        globalLogClearButton.disabled = true;
        try {
          (await apiRequest("/logs", {
            method: "DELETE",
          }),
            await loadEntries());
        } catch (clearError) {
          globalLogStatusElement.textContent = clearError.message || "日志清空失败。";
        } finally {
          globalLogClearButton.disabled = false;
        }
      }
    }),
    {
      open: openDialog,
      refresh: loadEntries,
    }
  );
}
