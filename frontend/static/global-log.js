const LEVEL_LABELS = {
  info: "信息",
  success: "成功",
  warning: "警告",
  error: "错误"
};
function formatTimestamp(timestamp) {
  const parsedDate = new Date(timestamp);
  if (Number.isNaN(parsedDate.getTime())) {
    return "时间未知";
  } else {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    })
      .format(parsedDate)
      .replace(/\//g, "-");
  }
}
export function setupGlobalLog({ api: apiRequest }) {
  const openButton = document.querySelector("#global-log-open");
  const dialogElement = document.querySelector("#global-log-dialog");
  if (!openButton || !dialogElement || openButton.dataset.globalLogReady === "true") {
    return null;
  }
  openButton.dataset.globalLogReady = "true";
  const closeButton = dialogElement.querySelector("#global-log-close");
  const closeFooterButton = dialogElement.querySelector("#global-log-close-footer");
  const refreshButton = dialogElement.querySelector("#global-log-refresh");
  const exportButton = dialogElement.querySelector("#global-log-export");
  const clearButton = dialogElement.querySelector("#global-log-clear");
  const moreButton = dialogElement.querySelector("#global-log-more");
  const levelSelect = dialogElement.querySelector("#global-log-level");
  const categorySelect = dialogElement.querySelector("#global-log-category");
  const searchInput = dialogElement.querySelector("#global-log-search");
  const listElement = dialogElement.querySelector("#global-log-list");
  const statusElement = dialogElement.querySelector("#global-log-status");
  let entries = [];
  let isLoading = false;
  let refreshTimer = null;
  let searchTimer = null;
  let nextOffset = null;
  let hasPendingRefresh = false;
  const PAGE_SIZE = 200;
  function renderEntries(entryList) {
    listElement.replaceChildren();
    if (!entryList.length) {
      const emptyElement = document.createElement("div");
      emptyElement.className = "global-log-empty";
      emptyElement.textContent = "当前筛选条件下没有日志。";
      listElement.append(emptyElement);
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const logEntry of entryList) {
      const itemElement = document.createElement("article");
      itemElement.className = "global-log-item " + (logEntry.level || "info");
      const levelIcon = document.createElement("i");
      levelIcon.setAttribute("aria-hidden", "true");
      const bodyElement = document.createElement("div");
      const messageElement = document.createElement("strong");
      messageElement.textContent = logEntry.message || "未提供说明";
      const metaElement = document.createElement("span");
      const timeText = logEntry.clientTimestamp
        ? "客户端发生 " +
          formatTimestamp(logEntry.clientTimestamp) +
          " · 接收 " +
          formatTimestamp(logEntry.timestamp)
        : formatTimestamp(logEntry.timestamp);
      metaElement.textContent =
        timeText + " · " + (logEntry.source || "系统后台") + " · " + (logEntry.category || "系统");
      bodyElement.append(messageElement, metaElement);
      if (logEntry.details || Object.keys(logEntry.context || {}).length) {
        const detailsElement = document.createElement("details");
        const summaryElement = document.createElement("summary");
        summaryElement.textContent = "查看详情";
        const detailsPreElement = document.createElement("pre");
        detailsPreElement.textContent = [
          ...Object.entries(logEntry.context || {}).map(
            ([contextKey, contextValue]) => contextKey + ": " + contextValue
          ),
          logEntry.details || ""
        ]
          .filter(Boolean)
          .join("\n");
        detailsElement.append(summaryElement, detailsPreElement);
        bodyElement.append(detailsElement);
      }
      if (Number(logEntry.repeatCount || 1) > 1) {
        const repeatElement = document.createElement("span");
        repeatElement.textContent =
          "重复 " +
          logEntry.repeatCount +
          " 次 · 最近" +
          (logEntry.lastClientTimestamp ? "发生" : "接收") +
          " " +
          formatTimestamp(
            logEntry.lastClientTimestamp || logEntry.lastTimestamp || logEntry.timestamp
          );
        bodyElement.append(repeatElement);
      }
      const levelBadge = document.createElement("b");
      levelBadge.textContent = LEVEL_LABELS[logEntry.level] || "信息";
      itemElement.append(levelIcon, bodyElement, levelBadge);
      fragment.append(itemElement);
    }
    listElement.append(fragment);
  }
  function syncCategoryOptions(categories) {
    const currentCategory = categorySelect.value;
    categorySelect.replaceChildren(new Option("全部分类", ""));
    for (const category of categories || []) {
      categorySelect.add(new Option(category, category));
    }
    categorySelect.value = [...categorySelect.options].some(
      option => option.value === currentCategory
    )
      ? currentCategory
      : "";
  }
  function buildQueryParams() {
    const searchParams = new URLSearchParams();
    if (levelSelect.value) {
      searchParams.set("level", levelSelect.value);
    }
    if (categorySelect.value) {
      searchParams.set("category", categorySelect.value);
    }
    if (searchInput.value.trim()) {
      searchParams.set("search", searchInput.value.trim());
    }
    return searchParams;
  }
  async function loadEntries({ append: append = false } = {}) {
    if (isLoading) {
      if (!append) {
        hasPendingRefresh = true;
      }
      return;
    }
    isLoading = true;
    refreshButton.disabled = true;
    moreButton.disabled = true;
    if (!append) {
      entries = [];
      nextOffset = null;
      moreButton.hidden = true;
    }
    statusElement.textContent = "正在读取全局日志…";
    try {
      const queryParams = buildQueryParams();
      queryParams.set("limit", String(PAGE_SIZE));
      queryParams.set("offset", String((append && nextOffset) || 0));
      const response = await apiRequest("/logs?" + queryParams);
      const items = response?.items || [];
      entries = append
        ? [...new Map([...entries, ...items].map(entry => [entry.id, entry])).values()]
        : items;
      nextOffset = response?.hasMore ? response.nextOffset : null;
      syncCategoryOptions(response?.categories || []);
      renderEntries(entries);
      const storage = response?.storage || {};
      const sizeLimitText = storage.maxBytes
        ? " / " + (storage.maxBytes / 1024 / 1024).toFixed(0) + " MB 上限"
        : "";
      const autoRefreshNote = entries.length > PAGE_SIZE ? " · 查看历史时暂停自动刷新" : "";
      const storageErrorText =
        storage.healthy === false
          ? " · 日志存储异常：" +
            (storage.lastError || "写入失败") +
            "（待写 " +
            (storage.pendingEvents || 0) +
            "，丢弃 " +
            (storage.droppedEvents || 0) +
            "）"
          : "";
      const writeFailureText =
        storage.healthy !== false && (storage.writeFailures > 0 || storage.droppedEvents > 0)
          ? " · 历史写入失败 " +
            (storage.writeFailures || 0) +
            " 次，丢弃 " +
            (storage.droppedEvents || 0) +
            " 条"
          : "";
      statusElement.textContent =
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
        writeFailureText;
      moreButton.hidden = nextOffset == null;
    } catch (caughtError) {
      statusElement.textContent = caughtError.message || "日志读取失败。";
      if (!append) {
        renderEntries([]);
      }
    } finally {
      isLoading = false;
      refreshButton.disabled = false;
      moreButton.disabled = false;
      if (hasPendingRefresh) {
        hasPendingRefresh = false;
        loadEntries();
      }
    }
  }
  function stopAutoRefresh() {
    if (refreshTimer) {
      window.clearInterval(refreshTimer);
    }
    refreshTimer = null;
  }
  async function openDialog() {
    if (!dialogElement.open) {
      dialogElement.showModal();
    }
    await loadEntries();
    stopAutoRefresh();
    refreshTimer = window.setInterval(() => {
      if (entries.length <= PAGE_SIZE && !listElement.querySelector("details[open]")) {
        loadEntries();
      }
    }, 10000);
  }
  function closeDialog() {
    stopAutoRefresh();
    if (dialogElement.open) {
      dialogElement.close();
    }
  }
  openButton.addEventListener("click", openDialog);
  closeButton.addEventListener("click", closeDialog);
  closeFooterButton.addEventListener("click", closeDialog);
  refreshButton.addEventListener("click", loadEntries);
  moreButton.addEventListener("click", () =>
    loadEntries({
      append: true
    })
  );
  levelSelect.addEventListener("change", loadEntries);
  categorySelect.addEventListener("change", loadEntries);
  searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(loadEntries, 250);
  });
  dialogElement.addEventListener("close", stopAutoRefresh);
  exportButton.addEventListener("click", () => {
    const downloadLink = document.createElement("a");
    const exportParams = buildQueryParams();
    downloadLink.href = "/api/v1/logs/export" + (exportParams.size ? "?" + exportParams : "");
    downloadLink.download =
      "homeos-global-log-" + new Date().toISOString().slice(0, 10) + ".txt";
    document.body.append(downloadLink);
    downloadLink.click();
    downloadLink.remove();
  });
  clearButton.addEventListener("click", async () => {
    if (window.confirm("确定清空当前全局日志吗？清空后无法恢复。")) {
      clearButton.disabled = true;
      try {
        await apiRequest("/logs", {
          method: "DELETE"
        });
        await loadEntries();
      } catch (clearError) {
        statusElement.textContent = clearError.message || "日志清空失败。";
      } finally {
        clearButton.disabled = false;
      }
    }
  });
  return {
    open: openDialog,
    refresh: loadEntries
  };
}
