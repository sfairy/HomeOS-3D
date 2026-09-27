/**
 * NAS 状态面板（3D 场景与详情弹窗共用的信息卡）。
 */

// 状态条目归一（变更对象 / 状态对象两种形态）与「按 ID 切域」只有一份实现（`/static/utils/`
import {
  readFromMapOrRecord,
  resolveStateEntry,
  stateTextOf
} from "../core/static-helpers.js?v=2609271411";
// DOM 工厂（元素 / 按钮 / replaceChildren 兜底）的唯一实现同样经桥取用。
import { createDomFactory } from "../core/static-helpers.js?v=2609271411";
/**
 * 计算要展示的分组及其中文名。
 */
export function nasGroups(statusSource) {
  const GROUP_LABELS = {
    system: "系统",
    storage: "存储",
    network: "网络",
    health: "健康"
  };
  // 先把配置里的顺序与内置顺序合并去重，再过滤掉不认识的分组名 ——
  return [...new Set([...(statusSource?.groupOrder || []), ...Object.keys(GROUP_LABELS)])]
    .filter(candidateGroup => Object.hasOwn(GROUP_LABELS, candidateGroup))
    .map(groupName => [groupName, GROUP_LABELS[groupName]]);
}
/**
 * 按指标类型格式化数值。
 */
export function nasMetricValue(metric, state) {
  const stateObject = resolveStateEntry(state, {});
  // 原样文本用于展示（时间戳、数值、未识别枚举都直接透传），小写文本只用于判定。
  const stateValue = String(stateObject.state ?? "").trim();
  const stateKey = stateTextOf(stateObject);
  // 统一的「无数据」出口：用长破折号而不是空串，让卡片保持稳定高度与可读性。
  if (
    stateObject.available === false ||
    ["", "unknown", "unavailable", "none"].includes(stateKey)
  ) {
    return {
      text: "—",
      available: false
    };
  }
  if (metric.kind === "problem") {
    // problem 表示「有告警」类二元传感器：on 是异常，off 才是正常。
    if (["on", "off"].includes(stateValue)) {
      return {
        text: stateValue === "on" ? "有告警" : "正常",
        available: true,
        warning: stateValue === "on"
      };
    } else {
      return {
        text: stateValue,
        available: true
      };
    }
  }
  if (metric.kind === "timestamp") {
    // 时间戳往往同时有数值与文本两种形态；能解析就本地化，解析不了就原样显示。
    const parsedTimestamp = Date.parse(stateValue);
    return {
      text: Number.isFinite(parsedTimestamp)
        ? new Date(parsedTimestamp).toLocaleString("zh-CN", {
            hour12: false
          })
        : stateValue,
      available: true
    };
  }
  if (metric.kind === "status") {
    // status 是一组枚举文案：先查中文映射，查不到就原样透传（后端可能新增取值）。
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
          degraded: "降级"
        }[stateKey] || stateValue,
      available: true,
      warning: /warning|critical|crashed|degraded|fail/i.test(stateValue)
    };
  }
  // 默认按数值处理：带上实体声明的单位，最多保留一位小数（容量 / 温度类足够）。
  const numericValue = Number(stateValue);
  const unit = String(stateObject.attributes?.unit_of_measurement || "");
  return {
    text: Number.isFinite(numericValue)
      ? "" +
        new Intl.NumberFormat("zh-CN", {
          maximumFractionDigits: 1
        }).format(numericValue) +
        (unit ? " " + unit : "")
      : stateValue,
    available: true,
    // 只有百分比单位才给进度条：其它单位的数值没有「占满」的语义。
    percent:
      Number.isFinite(numericValue) && unit === "%"
        ? Math.max(0, Math.min(100, numericValue))
        : null
  };
}
const NAS_VISUAL_PARTS = [
  "ground",
  "body",
  "bay is-bay-left",
  "bay is-bay-right",
  "grill",
  "light"
];

/**
 * 建 NAS 图形：与「通用设备」弹窗里那台机器同一套视觉语言（同样的金属配方 + 落地影 + 状态灯），
 */
function createNasVisual(createElement) {
  const element = createElement("div", "i3d-nas-visual");
  // 装饰性插画：不进无障碍树、不吃指针事件。面板里标题行与指标卡已经承担全部语义，
  element.setAttribute("aria-hidden", "true");
  for (const partName of NAS_VISUAL_PARTS) {
    element.append(createElement("i", "i3d-nas-visual-" + partName));
  }
  return {
    element,
    /**
     * 状态只落在那一颗状态灯上（配色与设备图形的四态同源）：任一指标告警 → 琥珀；
     */
    update({ warning: warning, available: available }) {
      element.classList.toggle("is-status-warning", warning);
      element.classList.toggle("is-status-normal", !warning && available);
      element.classList.toggle("is-status-unknown", !warning && !available);
    }
  };
}

/**
 * 创建 NAS 面板控制器。
 */
export function createNasPanel({ element: hostElement } = {}) {
  const { el: createElement } = createDomFactory(hostElement?.ownerDocument || globalThis.document);
  const rootElement = createElement("div", "i3d-nas-panel");
  const headingElement = createElement("div", "i3d-nas-heading");
  const titleElement = createElement("h3", "");
  const statusElement = createElement("p", "i3d-nas-status");
  const metricsElement = createElement("div", "i3d-nas-metrics");
  const metaElement = createElement("p", "i3d-nas-meta");
  const visual = createNasVisual(createElement);
  headingElement.append(titleElement, metaElement);
  // 图形与空调 / 通用设备面板同位置：标题之后、内容之前，单独占一行居中。
  rootElement.append(headingElement, visual.element, statusElement, metricsElement);
  rootElement.hidden = true;
  // 结构签名：指标列表与分组不变时复用已有 DOM，只改数值 —— 高频状态推送下这很关键。
  let layoutSignature = "";
  let metricCards = [];
  // 释放标记。dispose() 只把根节点从文档里摘掉，若之后还有 update() 进来，
  let isDisposed = false;
  /**
   * 刷新面板内容。
   */
  function update({ item: item, states: states = {} }) {
    // 释放后一律忽略：见上面 isDisposed 的说明。
    if (isDisposed) {
      return;
    }
    const sourceConfig = item.statusSource;
    // visibleMetrics 是白名单；未配置时表示「全部显示」。
    const visibleMetricIds = sourceConfig?.visibleMetrics && new Set(sourceConfig.visibleMetrics);
    const metrics = (sourceConfig?.metrics || []).filter(
      configuredMetric => !visibleMetricIds || visibleMetricIds.has(configuredMetric.entityId)
    );
    const groups = nasGroups(sourceConfig);
    const nextSignature = JSON.stringify([metrics, groups]);
    titleElement.textContent = item.label || sourceConfig?.name || "NAS";
    titleElement.title = titleElement.textContent;
    if (layoutSignature !== nextSignature) {
      layoutSignature = nextSignature;
      metricsElement.replaceChildren();
      metricCards = [];
      for (const [groupKey, groupLabel] of groups) {
        const groupMetrics = metrics.filter(metricEntry => metricEntry.group === groupKey);
        if (!groupMetrics.length) {
          continue;
        }
        const groupElement = createElement("section", "i3d-nas-group");
        const gridElement = createElement("div", "i3d-nas-grid");
        groupElement.append(createElement("h4", "", groupLabel), gridElement);
        for (const metricConfig of groupMetrics) {
          const cardElement = createElement("div", "i3d-nas-metric");
          const valueElement = createElement("strong", "");
          const barElement = createElement("i", "i3d-nas-bar");
          cardElement.classList.toggle("is-wide", metricConfig.kind === "timestamp");
          cardElement.title = metricConfig.entityId;
          cardElement.append(
            createElement("span", "", metricConfig.label),
            valueElement,
            barElement
          );
          gridElement.append(cardElement);
          // 缓存引用，后续每次 update 直接改 textContent / style，不再查询 DOM。
          metricCards.push({
            metric: metricConfig,
            value: valueElement,
            bar: barElement,
            card: cardElement
          });
        }
        metricsElement.append(groupElement);
      }
    }
    let latestUpdateMs = 0;
    // 图形那颗状态灯要的是「这台 NAS 整体怎么样」：任一指标告警算告警，
    let hasWarning = false;
    let hasReading = false;
    for (const metricCard of metricCards) {
      // 状态源既可能是 Map 也可能是普通对象，取值口径见 utils/state-entry.js。
      const metricState = readFromMapOrRecord(states, metricCard.metric.entityId);
      const display = nasMetricValue(metricCard.metric, metricState);
      metricCard.card.title = metricCard.metric.label + "：" + display.text;
      metricCard.value.textContent = display.text;
      metricCard.card.classList.toggle("is-warning", !!display.warning);
      metricCard.card.classList.toggle("is-unavailable", !display.available);
      hasWarning = hasWarning || !!display.warning;
      hasReading = hasReading || display.available;
      metricCard.bar.hidden = display.percent == null;
      metricCard.bar.style.width = (display.percent ?? 0) + "%";
      // 取所有指标里最新的更新时间，作为面板右下角「状态更新于 …」的依据。
      const updatedAt = Date.parse(metricState?.updatedAt || metricState?.last_updated || "");
      if (Number.isFinite(updatedAt)) {
        latestUpdateMs = Math.max(latestUpdateMs, updatedAt);
      }
    }
    visual.update({ warning: hasWarning, available: hasReading });
    statusElement.hidden = metricCards.length > 0;
    statusElement.textContent = sourceConfig
      ? sourceConfig.metrics?.length
        ? "未选择显示内容"
        : "已关联 NAS，暂无状态指标。请启用指标并同步目录后重新匹配数据来源。"
      : "请在“配置设备”中选择 NAS 数据来源。";
    metaElement.textContent =
      "状态更新于 " +
      (latestUpdateMs
        ? new Date(latestUpdateMs).toLocaleTimeString("zh-CN", {
            hour12: false
          })
        : "—");
  }
  return {
    root: rootElement,
    update: update,
    dispose() {
      isDisposed = true;
      rootElement.remove();
    }
  };
}
