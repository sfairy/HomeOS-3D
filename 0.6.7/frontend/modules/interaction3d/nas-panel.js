export function nasGroups(arg1) {
  const object1 = {
    system: "系统",
    storage: "存储",
    network: "网络",
    health: "健康",
  };
  return [...new Set([...(arg1?.groupOrder || []), ...Object.keys(object1)])]
    .filter((arg2) => Object.hasOwn(object1, arg2))
    .map((arg3) => [arg3, object1[arg3]]);
}
export function nasMetricValue(arg4, arg5) {
  const value1 = arg5?.newState || arg5 || {},
    value2 = String(value1.state ?? "").trim();
  if (
    value1.available === false ||
    ["", "unknown", "unavailable", "none"].includes(value2.toLowerCase())
  )
    return {
      text: "—",
      available: false,
    };
  if (arg4.kind === "problem")
    return ["on", "off"].includes(value2)
      ? {
          text: value2 === "on" ? "有告警" : "正常",
          available: true,
          warning: value2 === "on",
        }
      : {
          text: value2,
          available: true,
        };
  if (arg4.kind === "timestamp") {
    const value5 = Date.parse(value2);
    return {
      text: Number.isFinite(value5)
        ? new Date(value5).toLocaleString("zh-CN", {
            hour12: false,
          })
        : value2,
      available: true,
    };
  }
  if (arg4.kind === "status")
    return {
      text:
        {
          normal: "正常",
          healthy: "健康",
          good: "良好",
          ok: "正常",
          warning: "警告",
          critical: "严重",
          crashed: "故障",
          degraded: "降级",
        }[value2.toLowerCase()] || value2,
      available: true,
      warning: /warning|critical|crashed|degraded|fail/i.test(value2),
    };
  const value3 = Number(value2),
    value4 = String(value1.attributes?.unit_of_measurement || "");
  return {
    text: Number.isFinite(value3)
      ? "" +
        new Intl.NumberFormat("zh-CN", {
          maximumFractionDigits: 1,
        }).format(value3) +
        (value4 ? " " + value4 : "")
      : value2,
    available: true,
    percent: Number.isFinite(value3) && value4 === "%" ? Math.max(0, Math.min(100, value3)) : null,
  };
}
export function createNasPanel() {
  const fn1 = (arg6, arg7, arg8 = "") => {
      const value12 = document.createElement(arg6);
      return ((value12.className = arg7), (value12.textContent = arg8), value12);
    },
    value6 = fn1("div", "i3d-nas-panel"),
    value7 = fn1("div", "i3d-nas-heading"),
    value8 = fn1("h3", ""),
    value9 = fn1("p", "i3d-nas-status"),
    value10 = fn1("div", "i3d-nas-metrics"),
    value11 = fn1("p", "i3d-nas-meta");
  (value7.append(value8, value11), value6.append(value7, value9, value10), (value6.hidden = true));
  let text1 = "",
    list1 = [];
  function fn2({ item: arg9, states: arg10 = {} }) {
    const value13 = arg9.statusSource,
      value14 = value13?.visibleMetrics && new Set(value13.visibleMetrics),
      value15 = (value13?.metrics || []).filter((arg11) => !value14 || value14.has(arg11.entityId)),
      value16 = nasGroups(value13),
      value17 = JSON.stringify([value15, value16]);
    if (
      ((value8.textContent = arg9.label || value13?.name || "NAS"),
      (value8.title = value8.textContent),
      text1 !== value17)
    ) {
      ((text1 = value17), value10.replaceChildren(), (list1 = []));
      for (const [value19, value20] of value16) {
        const value21 = value15.filter((arg12) => arg12.group === value19);
        if (!value21.length) continue;
        const value22 = fn1("section", "i3d-nas-group"),
          value23 = fn1("div", "i3d-nas-grid");
        value22.append(fn1("h4", "", value20), value23);
        for (const value24 of value21) {
          const value25 = fn1("div", "i3d-nas-metric"),
            value26 = fn1("strong", ""),
            value27 = fn1("i", "i3d-nas-bar");
          (value25.classList.toggle("is-wide", value24.kind === "timestamp"),
            (value25.title = value24.entityId),
            value25.append(fn1("span", "", value24.label), value26, value27),
            value23.append(value25),
            list1.push({
              metric: value24,
              value: value26,
              bar: value27,
              card: value25,
            }));
        }
        value10.append(value22);
      }
    }
    let value18 = 0;
    for (const value28 of list1) {
      const value29 =
          arg10 instanceof Map
            ? arg10.get(value28.metric.entityId)
            : arg10[value28.metric.entityId],
        value30 = nasMetricValue(value28.metric, value29);
      ((value28.card.title = value28.metric.label + "：" + value30.text),
        (value28.value.textContent = value30.text),
        value28.card.classList.toggle("is-warning", !!value30.warning),
        value28.card.classList.toggle("is-unavailable", !value30.available),
        (value28.bar.hidden = value30.percent == null),
        (value28.bar.style.width = (value30.percent ?? 0) + "%"));
      const value31 = Date.parse(value29?.updatedAt || value29?.last_updated || "");
      Number.isFinite(value31) && (value18 = Math.max(value18, value31));
    }
    ((value9.hidden = list1.length > 0),
      (value9.textContent = value13
        ? value13.metrics?.length
          ? "未选择显示内容"
          : "已关联 NAS，暂无状态指标。请启用指标并同步目录后重新匹配数据来源。"
        : "请在“配置设备”中选择 NAS 数据来源。"),
      (value11.textContent =
        "状态更新于 " +
        (value18
          ? new Date(value18).toLocaleTimeString("zh-CN", {
              hour12: false,
            })
          : "—")));
  }
  return {
    root: value6,
    update: fn2,
    dispose() {
      value6.remove();
    },
  };
}
