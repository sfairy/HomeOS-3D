/**
 * NAS 状态面板（3D 场景与详情弹窗共用的信息卡）。
 *
 * 把 NAS 绑定里的 statusSource 渲染成「分组 + 指标卡」，每卡显示名称、格式化数值与百分比
 * 进度条。对外提供 nasGroups、createNasPanel。指标配置来自
 * item.statusSource.metrics（每项含 entityId / label / kind / group），kind 决定数值展示
 * 方式，visibleMetrics 是「显示哪些实体」的白名单，单位取实体属性 unit_of_measurement。
 */

// 状态条目归一（变更对象 / 状态对象两种形态）与「按 ID 切域」只有一份实现（`/static/utils/`
// 里那两份），这里经 static-helpers 桥取用：运行侧（舞台页能以 file: 打开）不能写裸
// `/static/...` 的静态 import，桥按更严的那种口径分流（见该文件里的两条纪律）。
import {
  readFromMapOrRecord,
  resolveStateEntry,
  stateTextOf
} from "../core/static-helpers.js?v=2609231046";
// DOM 工厂（元素 / 按钮 / replaceChildren 兜底）的唯一实现同样经桥取用。
import { createDomFactory } from "../core/static-helpers.js?v=2609231046";
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
  // 这样可以兼容后端新增分组（不认识的忽略而不是报错），同时保证内置分组一定出现。
  return [...new Set([...(statusSource?.groupOrder || []), ...Object.keys(GROUP_LABELS)])]
    .filter(candidateGroup => Object.hasOwn(GROUP_LABELS, candidateGroup))
    .map(groupName => [groupName, GROUP_LABELS[groupName]]);
}
/**
 * 按指标类型格式化数值。
 */
function nasMetricValue(metric, state) {
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
    // 文案刻意反过来写，避免用户把 on 理解成「一切正常」。
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
    // warning 用正则兜底判断，覆盖映射表外的英文取值。
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
/**
 * 创建 NAS 面板控制器。
 *
 * `element` 给出宿主容器时，节点按它的 ownerDocument 创建（面板被放进弹窗 / 预览 iframe 的另一份
 * 文档时才不会造出属于外部文档的孤儿节点）；省略则用全局 document。
 */
export function createNasPanel({ element: hostElement } = {}) {
  const { el: createElement } = createDomFactory(hostElement?.ownerDocument || globalThis.document);
  const rootElement = createElement("div", "i3d-nas-panel");
  const headingElement = createElement("div", "i3d-nas-heading");
  const titleElement = createElement("h3", "");
  const statusElement = createElement("p", "i3d-nas-status");
  const metricsElement = createElement("div", "i3d-nas-metrics");
  const metaElement = createElement("p", "i3d-nas-meta");
  headingElement.append(titleElement, metaElement);
  rootElement.append(headingElement, statusElement, metricsElement);
  // 面板由外部按需显示，创建时先隐藏，避免首帧闪一下空壳。
  rootElement.hidden = true;
  // 结构签名：指标列表与分组不变时复用已有 DOM，只改数值 —— 高频状态推送下这很关键。
  let layoutSignature = "";
  let metricCards = [];
  // 释放标记。dispose() 只把根节点从文档里摘掉，若之后还有 update() 进来，
  // 它会照着已摘除的树把整块指标 DOM 重建一遍 —— 白做，而且写进一棵不会再显示的树。
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
    // 只有结构变了才重建 DOM；否则直接走到下面只更新文本与样式。
    if (layoutSignature !== nextSignature) {
      layoutSignature = nextSignature;
      metricsElement.replaceChildren();
      metricCards = [];
      for (const [groupKey, groupLabel] of groups) {
        const groupMetrics = metrics.filter(metricEntry => metricEntry.group === groupKey);
        // 空分组不渲染，避免出现只有标题没有内容的区块。
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
          // 时间戳文案较长，单独占整行，避免与其它指标挤成两行高。
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
    for (const metricCard of metricCards) {
      // 状态源既可能是 Map 也可能是普通对象，取值口径见 utils/state-entry.js。
      const metricState = readFromMapOrRecord(states, metricCard.metric.entityId);
      const display = nasMetricValue(metricCard.metric, metricState);
      metricCard.card.title = metricCard.metric.label + "：" + display.text;
      metricCard.value.textContent = display.text;
      metricCard.card.classList.toggle("is-warning", !!display.warning);
      metricCard.card.classList.toggle("is-unavailable", !display.available);
      // 没有百分比时隐藏进度条（hidden 而非宽度 0，避免留下一条细线）。
      metricCard.bar.hidden = display.percent == null;
      metricCard.bar.style.width = (display.percent ?? 0) + "%";
      // 取所有指标里最新的更新时间，作为面板右下角「状态更新于 …」的依据。
      const updatedAt = Date.parse(metricState?.updatedAt || metricState?.last_updated || "");
      if (Number.isFinite(updatedAt)) {
        latestUpdateMs = Math.max(latestUpdateMs, updatedAt);
      }
    }
    // 有指标卡时不显示占位说明；没有指标卡时按配置缺失的两种原因给出不同指引。
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
