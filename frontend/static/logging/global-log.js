/**
 * 全局日志查看器（后端日志 + 客户端上报日志的统一界面）。
 *
 * 编辑器 / 面板顶栏「全局日志」按钮打开的对话框，由 global-log-boot.js 注入 api 后调用
 * setupGlobalLog 启动。分页拉取 /api/v1/logs、按等级 / 分类 / 关键字筛选、展开详情、导出 txt、
 * 清空，并在打开期间自动刷新。接口路径由注入的 api 拼接；每页 200 条，翻到「查看历史」时暂停
 * 自动刷新，避免覆盖用户正在看的内容。
 */
import { confirmAction } from "../shared/ui-confirm.js?v=2609231046";
import { formatZhDateTime } from "../utils/datetime.js?v=2609231046";

// 日志等级的中文名，与后端 global_log.py 的等级枚举一致。
const LEVEL_LABELS = {
  info: "信息",
  success: "成功",
  warning: "警告",
  error: "错误"
};

/**
 * 把时间戳格式化成「MM-DD HH:mm:ss」。
 */
function formatTimestamp(timestamp) {
  const parsedDate = new Date(timestamp);
  if (Number.isNaN(parsedDate.getTime())) {
    return "时间未知";
  } else {
    return formatZhDateTime(parsedDate, { withSeconds: true });
  }
}

/**
 * 启动全局日志对话框。
 */
export function setupGlobalLog({ api: apiRequest }) {
  const openButton = document.querySelector("#global-log-open");
  const dialogElement = document.querySelector("#global-log-dialog");
  // dataset 标记做幂等保护：同一页面重复调用不会重复绑定事件。
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
  // 加载中又收到新的刷新请求时置位，当前请求结束后补一次，避免请求互相覆盖。
  let hasPendingRefresh = false;
  const PAGE_SIZE = 200;

  // 渲染日志列表；entryList 为空时展示占位文案。
  function renderEntries(entryList) {
    listElement.replaceChildren();
    if (!entryList.length) {
      const emptyElement = document.createElement("div");
      emptyElement.className = "global-log-empty";
      emptyElement.textContent = "当前筛选条件下没有日志。";
      listElement.append(emptyElement);
      return;
    }
    // 先攒进 DocumentFragment 再一次性插入，避免逐条 append 触发多次布局。
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
      // 客户端上报的日志同时给出「客户端发生」与「服务端接收」两个时间，
      // 便于排查离线补传的时序问题。
      const timeText = logEntry.clientTimestamp
        ? "客户端发生 " +
          formatTimestamp(logEntry.clientTimestamp) +
          " · 接收 " +
          formatTimestamp(logEntry.timestamp)
        : formatTimestamp(logEntry.timestamp);
      metaElement.textContent =
        timeText + " · " + (logEntry.source || "系统后台") + " · " + (logEntry.category || "系统");
      bodyElement.append(messageElement, metaElement);
      // 有上下文或详情时才渲染可展开区域。
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
      // 重复日志被后端聚合计数，这里补一行「重复 N 次」的说明。
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

  // 刷新分类下拉；当前选中的分类若已不存在则回退到「全部分类」。
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

  // 按当前筛选控件拼出查询参数。
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

  /**
   * 拉取日志列表；options.append 为 true 时在现有列表后追加（翻页），否则从第一页重新加载。
   */
  async function loadEntries({ append: append = false } = {}) {
    if (isLoading) {
      // 正在加载时记下待刷新标记，由 finally 里的逻辑补一次。
      if (!append) {
        hasPendingRefresh = true;
      }
      return;
    }
    isLoading = true;
    refreshButton.disabled = true;
    moreButton.disabled = true;
    if (!append) {
      // 非追加模式视为全新查询，清空游标与「查看更多」。
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
      // 追加时按 id 去重（Map 保留后写入的项），避免翻页期间新日志造成重复行。
      entries = append
        ? [...new Map([...entries, ...items].map(entry => [entry.id, entry])).values()]
        : items;
      nextOffset = response?.hasMore ? response.nextOffset : null;
      syncCategoryOptions(response?.categories || []);
      renderEntries(entries);
      // 状态栏把存储用量、保留天数、写入失败等信息拼成一行提示。
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
      // 期间被别处请求过刷新，这里补一次，保证界面最终是最新数据。
      if (hasPendingRefresh) {
        hasPendingRefresh = false;
        loadEntries();
      }
    }
  }

  // 关闭对话框时必须停止自动刷新，否则会在后台持续请求。
  function stopAutoRefresh() {
    if (refreshTimer) {
      window.clearInterval(refreshTimer);
    }
    refreshTimer = null;
  }

  // 打开对话框：加载首屏后开启 10 秒轮询。
  async function openDialog() {
    if (!dialogElement.open) {
      dialogElement.showModal();
    }
    await loadEntries();
    stopAutoRefresh();
    refreshTimer = window.setInterval(() => {
      // 用户翻到历史页或展开了详情时暂停刷新，避免内容被顶掉。
      if (entries.length <= PAGE_SIZE && !listElement.querySelector("details[open]")) {
        loadEntries();
      }
    }, 10000);
  }

  // 关闭对话框：必须停掉轮询再 close，否则对话框已关但 interval 仍在后台发请求。
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
  // 搜索输入做 250ms 防抖，避免每敲一个字就发一次请求。
  searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(loadEntries, 250);
  });
  dialogElement.addEventListener("close", stopAutoRefresh);
  exportButton.addEventListener("click", () => {
    // 用临时 <a download> 触发浏览器下载，导出条件与当前筛选一致。
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
    // 清空不可恢复，必须二次确认。
    const confirmedClear = await confirmAction({
      kicker: "DANGER ZONE",
      title: "清空全局日志",
      message: "确定清空当前全局日志吗？",
      detail: "清空后无法恢复。",
      confirmLabel: "确认清空",
      tone: "danger"
    });
    if (!confirmedClear) {
      return;
    }
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
  });
  return {
    open: openDialog,
    refresh: loadEntries
  };
}
