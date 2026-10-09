import { domElement } from "@app/utils/dom-factory";
export function nasGroups(nasConfig: any) {
  const groupLabels = {
    system: "系统",
    storage: "存储",
    network: "网络",
    health: "健康",
  };
  return [...new Set([...(nasConfig?.groupOrder || []), ...Object.keys(groupLabels)])]
    .filter((defaultGroupKey) => Object.hasOwn(groupLabels, defaultGroupKey))
    .map((groupKey) => [groupKey, (groupLabels as any)[groupKey]]);
}
function nasMetricValue(metric: any, stateUpdate: any) {
  const entityState = stateUpdate?.newState || stateUpdate || {},
    stateValue = String(entityState.state ?? "").trim();
  if (
    entityState.available === false ||
    ["", "unknown", "unavailable", "none"].includes(stateValue.toLowerCase())
  )
    return {
      text: "—",
      available: false,
    };
  if (metric.kind === "problem")
    return ["on", "off"].includes(stateValue)
      ? {
          text: stateValue === "on" ? "有告警" : "正常",
          available: true,
          warning: stateValue === "on",
        }
      : {
          text: stateValue,
          available: true,
        };
  if (metric.kind === "timestamp") {
    const timestampMs = Date.parse(stateValue);
    return {
      text: Number.isFinite(timestampMs)
        ? new Date(timestampMs).toLocaleString("zh-CN", {
            hour12: false,
          })
        : stateValue,
      available: true,
    };
  }
  if (metric.kind === "status")
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
        }[stateValue.toLowerCase()] || stateValue,
      available: true,
      warning: /warning|critical|crashed|degraded|fail/i.test(stateValue),
    };
  const numericValue = Number(stateValue),
    unitOfMeasurement = String(entityState.attributes?.unit_of_measurement || "");
  return {
    text: Number.isFinite(numericValue)
      ? "" +
        new Intl.NumberFormat("zh-CN", {
          maximumFractionDigits: 1,
        }).format(numericValue) +
        (unitOfMeasurement ? " " + unitOfMeasurement : "")
      : stateValue,
    available: true,
    percent:
      Number.isFinite(numericValue) && unitOfMeasurement === "%"
        ? Math.max(0, Math.min(100, numericValue))
        : null,
  };
}
export function createNasPanel() {
  const createStyledElement = (tagName: any, className: any, textContent = "") =>
      domElement(document, tagName, className, textContent),
    panelElement = createStyledElement("div", "i3d-nas-panel"),
    headingElement = createStyledElement("div", "i3d-nas-heading"),
    titleElement = createStyledElement("h3", ""),
    statusElement = createStyledElement("p", "i3d-nas-status"),
    metricsElement = createStyledElement("div", "i3d-nas-metrics"),
    metaElement = createStyledElement("p", "i3d-nas-meta");
  (headingElement.append(titleElement, metaElement),
    panelElement.append(headingElement, statusElement, metricsElement),
    (panelElement.hidden = true));
  let renderedSignature = "",
    metricRows: any = [];
  function updateNasPanel({ item: nasComponent, states: statesByEntityId = {} }: any) {
    const statusSource = nasComponent.statusSource,
      visibleMetricIdSet = statusSource?.visibleMetrics && new Set(statusSource.visibleMetrics),
      visibleMetrics = (statusSource?.metrics || []).filter(
        (metricConfig: any) => !visibleMetricIdSet || visibleMetricIdSet.has(metricConfig.entityId),
      ),
      groupEntries = nasGroups(statusSource),
      metricsSignature = JSON.stringify([visibleMetrics, groupEntries]);
    if (
      ((titleElement.textContent = nasComponent.label || statusSource?.name || "NAS"),
      (titleElement.title = titleElement.textContent),
      renderedSignature !== metricsSignature)
    ) {
      ((renderedSignature = metricsSignature), metricsElement.replaceChildren(), (metricRows = []));
      for (const [metricGroupKey, groupLabel] of groupEntries) {
        const groupMetrics = visibleMetrics.filter(
          (groupMetric: any) => groupMetric.group === metricGroupKey,
        );
        if (!groupMetrics.length) continue;
        const groupSection = createStyledElement("section", "i3d-nas-group"),
          groupGrid = createStyledElement("div", "i3d-nas-grid");
        groupSection.append(createStyledElement("h4", "", groupLabel), groupGrid);
        for (const metricDefinition of groupMetrics) {
          const metricCard = createStyledElement("div", "i3d-nas-metric"),
            metricValueElement = createStyledElement("strong", ""),
            metricBar = createStyledElement("i", "i3d-nas-bar");
          (metricCard.classList.toggle("is-wide", metricDefinition.kind === "timestamp"),
            (metricCard.title = metricDefinition.entityId),
            metricCard.append(
              createStyledElement("span", "", metricDefinition.label),
              metricValueElement,
              metricBar,
            ),
            groupGrid.append(metricCard),
            metricRows.push({
              metric: metricDefinition,
              value: metricValueElement,
              bar: metricBar,
              card: metricCard,
            }));
        }
        metricsElement.append(groupSection);
      }
    }
    let latestTimestampMs = 0;
    for (const metricRow of metricRows) {
      const stateEntry =
          statesByEntityId instanceof Map
            ? statesByEntityId.get(metricRow.metric.entityId)
            : statesByEntityId[metricRow.metric.entityId],
        metricResult = nasMetricValue(metricRow.metric, stateEntry);
      ((metricRow.card.title = metricRow.metric.label + "：" + metricResult.text),
        (metricRow.value.textContent = metricResult.text),
        metricRow.card.classList.toggle("is-warning", !!metricResult.warning),
        metricRow.card.classList.toggle("is-unavailable", !metricResult.available),
        (metricRow.bar.hidden = metricResult.percent == null),
        (metricRow.bar.style.width = (metricResult.percent ?? 0) + "%"));
      const stateTimestampMs = Date.parse(stateEntry?.updatedAt || stateEntry?.last_updated || "");
      Number.isFinite(stateTimestampMs) &&
        (latestTimestampMs = Math.max(latestTimestampMs, stateTimestampMs));
    }
    ((statusElement.hidden = metricRows.length > 0),
      (statusElement.textContent = statusSource
        ? statusSource.metrics?.length
          ? "未选择显示内容"
          : "已关联 NAS，暂无状态指标。请启用指标并同步目录后重新匹配数据来源。"
        : "请在“配置设备”中选择 NAS 数据来源。"),
      (metaElement.textContent =
        "状态更新于 " +
        (latestTimestampMs
          ? new Date(latestTimestampMs).toLocaleTimeString("zh-CN", {
              hour12: false,
            })
          : "—")));
  }
  return {
    root: panelElement,
    update: updateNasPanel,
    dispose() {
      panelElement.remove();
    },
  };
}
