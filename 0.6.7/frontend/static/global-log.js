const U = {
  info: "信息",
  success: "成功",
  warning: "警告",
  error: "错误",
};
function $(arg1) {
  const date1 = new Date(arg1);
  return Number.isNaN(date1.getTime())
    ? "时间未知"
    : new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
        .format(date1)
        .replace(/\//g, "-");
}
export function setupGlobalLog({ api: arg2 }) {
  const value1 = document.querySelector("#global-log-open"),
    value2 = document.querySelector("#global-log-dialog");
  if (!value1 || !value2 || value1.dataset.globalLogReady === "true") return null;
  value1.dataset.globalLogReady = "true";
  const value3 = value2.querySelector("#global-log-close"),
    value4 = value2.querySelector("#global-log-close-footer"),
    value5 = value2.querySelector("#global-log-refresh"),
    value6 = value2.querySelector("#global-log-export"),
    value7 = value2.querySelector("#global-log-clear"),
    value8 = value2.querySelector("#global-log-more"),
    value9 = value2.querySelector("#global-log-level"),
    value10 = value2.querySelector("#global-log-category"),
    value11 = value2.querySelector("#global-log-search"),
    value12 = value2.querySelector("#global-log-list"),
    value13 = value2.querySelector("#global-log-status");
  let list1 = [],
    value14 = false,
    value15 = null,
    value16 = null,
    value17 = null,
    value18 = false;
  const value19 = 200;
  function fn1(arg3) {
    if ((value12.replaceChildren(), !arg3.length)) {
      const value21 = document.createElement("div");
      ((value21.className = "global-log-empty"),
        (value21.textContent = "当前筛选条件下没有日志。"),
        value12.append(value21));
      return;
    }
    const value20 = document.createDocumentFragment();
    for (const value22 of arg3) {
      const value23 = document.createElement("article");
      value23.className = "global-log-item " + (value22.level || "info");
      const value24 = document.createElement("i");
      value24.setAttribute("aria-hidden", "true");
      const value25 = document.createElement("div"),
        value26 = document.createElement("strong");
      value26.textContent = value22.message || "未提供说明";
      const value27 = document.createElement("span"),
        value28 = value22.clientTimestamp
          ? "客户端发生 " + $(value22.clientTimestamp) + " · 接收 " + $(value22.timestamp)
          : $(value22.timestamp);
      if (
        ((value27.textContent =
          value28 + " · " + (value22.source || "系统后台") + " · " + (value22.category || "系统")),
        value25.append(value26, value27),
        value22.details || Object.keys(value22.context || {}).length)
      ) {
        const value30 = document.createElement("details"),
          value31 = document.createElement("summary");
        value31.textContent = "查看详情";
        const value32 = document.createElement("pre");
        ((value32.textContent = [
          ...Object.entries(value22.context || {}).map(([arg4, arg5]) => arg4 + ": " + arg5),
          value22.details || "",
        ]
          .filter(Boolean)
          .join("\n")),
          value30.append(value31, value32),
          value25.append(value30));
      }
      if (Number(value22.repeatCount || 1) > 1) {
        const value33 = document.createElement("span");
        ((value33.textContent =
          "重复 " +
          value22.repeatCount +
          " 次 · 最近" +
          (value22.lastClientTimestamp ? "发生" : "接收") +
          " " +
          $(value22.lastClientTimestamp || value22.lastTimestamp || value22.timestamp)),
          value25.append(value33));
      }
      const value29 = document.createElement("b");
      ((value29.textContent = U[value22.level] || "信息"),
        value23.append(value24, value25, value29),
        value20.append(value23));
    }
    value12.append(value20);
  }
  function fn2(arg6) {
    const value34 = value10.value;
    value10.replaceChildren(new Option("全部分类", ""));
    for (const value35 of arg6 || []) value10.add(new Option(value35, value35));
    value10.value = [...value10.options].some((arg7) => arg7.value === value34) ? value34 : "";
  }
  function fn3() {
    const uRLSearchParams1 = new URLSearchParams();
    return (
      value9.value && uRLSearchParams1.set("level", value9.value),
      value10.value && uRLSearchParams1.set("category", value10.value),
      value11.value.trim() && uRLSearchParams1.set("search", value11.value.trim()),
      uRLSearchParams1
    );
  }
  async function fn4({ append: arg8 = false } = {}) {
    if (value14) {
      arg8 || (value18 = true);
      return;
    }
    ((value14 = true),
      (value5.disabled = true),
      (value8.disabled = true),
      arg8 || ((list1 = []), (value17 = null), (value8.hidden = true)),
      (value13.textContent = "正在读取全局日志…"));
    try {
      const value36 = fn3();
      (value36.set("limit", String(value19)),
        value36.set("offset", String((arg8 && value17) || 0)));
      const value37 = await arg2("/logs?" + value36),
        value38 = value37?.items || [];
      ((list1 = arg8
        ? [...new Map([...list1, ...value38].map((arg9) => [arg9.id, arg9])).values()]
        : value38),
        (value17 = value37?.hasMore ? value37.nextOffset : null),
        fn2(value37?.categories || []),
        fn1(list1));
      const value39 = value37?.storage || {},
        value40 = value39.maxBytes
          ? " / " + (value39.maxBytes / 1024 / 1024).toFixed(0) + " MB 上限"
          : "",
        value41 = list1.length > value19 ? " · 查看历史时暂停自动刷新" : "",
        value42 =
          value39.healthy === false
            ? " · 日志存储异常：" +
              (value39.lastError || "写入失败") +
              "（待写 " +
              (value39.pendingEvents || 0) +
              "，丢弃 " +
              (value39.droppedEvents || 0) +
              "）"
            : "",
        value43 =
          value39.healthy !== false && (value39.writeFailures > 0 || value39.droppedEvents > 0)
            ? " · 历史写入失败 " +
              (value39.writeFailures || 0) +
              " 次，丢弃 " +
              (value39.droppedEvents || 0) +
              " 条"
            : "";
      ((value13.textContent =
        "已显示 " +
        list1.length +
        " / " +
        (value37?.total ?? list1.length) +
        " 条 · 自动保留最近 " +
        (value39.retentionDays || value37?.retentionDays || 7) +
        " 天" +
        value40 +
        value41 +
        value42 +
        value43),
        (value8.hidden = value17 == null));
    } catch (error1) {
      ((value13.textContent = error1.message || "日志读取失败。"), arg8 || fn1([]));
    } finally {
      ((value14 = false),
        (value5.disabled = false),
        (value8.disabled = false),
        value18 && ((value18 = false), fn4()));
    }
  }
  function fn5() {
    (value15 && window.clearInterval(value15), (value15 = null));
  }
  async function fn6() {
    (value2.open || value2.showModal(),
      await fn4(),
      fn5(),
      (value15 = window.setInterval(() => {
        list1.length <= value19 && !value12.querySelector("details[open]") && fn4();
      }, 10000)));
  }
  function fn7() {
    (fn5(), value2.open && value2.close());
  }
  return (
    value1.addEventListener("click", fn6),
    value3.addEventListener("click", fn7),
    value4.addEventListener("click", fn7),
    value5.addEventListener("click", fn4),
    value8.addEventListener("click", () =>
      fn4({
        append: true,
      }),
    ),
    value9.addEventListener("change", fn4),
    value10.addEventListener("change", fn4),
    value11.addEventListener("input", () => {
      (window.clearTimeout(value16), (value16 = window.setTimeout(fn4, 250)));
    }),
    value2.addEventListener("close", fn5),
    value6.addEventListener("click", () => {
      const value44 = document.createElement("a"),
        value45 = fn3();
      ((value44.href = "/api/v1/logs/export" + (value45.size ? "?" + value45 : "")),
        (value44.download =
          "ha-bridge-global-log-" + new Date().toISOString().slice(0, 10) + ".txt"),
        document.body.append(value44),
        value44.click(),
        value44.remove());
    }),
    value7.addEventListener("click", async () => {
      if (window.confirm("确定清空当前全局日志吗？清空后无法恢复。")) {
        value7.disabled = true;
        try {
          (await arg2("/logs", {
            method: "DELETE",
          }),
            await fn4());
        } catch (error2) {
          value13.textContent = error2.message || "日志清空失败。";
        } finally {
          value7.disabled = false;
        }
      }
    }),
    {
      open: fn6,
      refresh: fn4,
    }
  );
}
