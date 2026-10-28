import { domElement } from "@app/shared/util/dom-factory";
import { formatHANumber } from "@app/shared/util/ha-number";
import { createPurifierExtras } from "../climate/purifier-extras";
import { createStageDeviceVisual } from "../core/stage-device-visual";

/**
 * NAS 状态面板（0.8.1 `nas-panel.js`）。
 *
 * 0.8.1 把 NAS 指标卡从「自己画一排 div」改成复用 `createPurifierExtras`：
 * - 卡片网格、拖动排序、右下角缩放、键盘移动全部由 extras 提供；
 * - 文案/进度条通过 `statePresentation` 注入 `nasMetricValue`；
 * - 排序与尺寸变化经 `onLayout` 回传 `{ id, group, layout }`，
 *   编辑器落到 `applyNasLayout` 再回写配置。
 */

const NAS_GROUP_LABELS: Record<string, string> = {
  system: "系统",
  storage: "存储",
  network: "网络",
  health: "健康",
};

export function nasGroups(
  nasConfig: { groupOrder?: unknown } | Record<string, unknown> | null | undefined,
): [string, string][] {
  const orderEntries = Array.isArray(nasConfig?.groupOrder)
    ? (nasConfig.groupOrder as unknown[]).filter(
        (groupKey): groupKey is string => typeof groupKey === "string",
      )
    : [];
  return [...new Set([...orderEntries, ...Object.keys(NAS_GROUP_LABELS)])]
    .filter((defaultGroupKey) => Object.hasOwn(NAS_GROUP_LABELS, defaultGroupKey))
    .map((groupKey) => [groupKey, NAS_GROUP_LABELS[groupKey]]);
}

export interface NasMetricPresentation {
  text: string;
  available?: boolean;
  warning?: boolean;
  percent?: number | null;
}

export function nasMetricValue(
  metric: { kind?: string },
  stateUpdate: { newState?: unknown; attributes?: unknown } | null,
  displayPrecision: number | null = null,
): NasMetricPresentation {
  const entityState = (stateUpdate?.newState || stateUpdate || {}) as {
      state?: unknown;
      available?: boolean;
      attributes?: Record<string, unknown>;
    },
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
      ? // HA 显示精度优先；未设置时原样显示（0.7.9 不再套 `Intl.NumberFormat`）。
        "" + formatHANumber(stateValue, displayPrecision) +
        (unitOfMeasurement ? " " + unitOfMeasurement : "")
      : stateValue,
    available: true,
    percent:
      Number.isFinite(numericValue) && unitOfMeasurement === "%"
        ? Math.max(0, Math.min(100, numericValue))
        : null,
  };
}

/** NAS 指标 = 「状态」类卡片；时间戳默认占两列，其余一列一行。 */
export function nasMetricLayout(metric: Record<string, unknown>) {
  return {
    ...metric,
    type: "state",
    columns: metric.columns ?? (metric.kind === "timestamp" ? 2 : 1),
    rows: metric.rows ?? 1,
  };
}

/**
 * 把预览里拖出来的顺序与尺寸写回 NAS 配置。
 *
 * 只接受「与本组指标一一对应」的布局：数量一致、entityId 不重复、列 1-4 / 行 1-2，
 * 任何一项不符就整份丢弃（避免预览里的异常状态污染配置）。
 */
export function applyNasLayout(
  statusSource: { visibleMetrics?: string[]; metrics?: Record<string, unknown>[] } | null,
  groupKey: string,
  layout: { entityId?: unknown; columns?: number; rows?: number }[] | null,
): boolean {
  if (!statusSource || !Array.isArray(layout)) return false;
  const visibleMetricIdSet = statusSource.visibleMetrics && new Set(statusSource.visibleMetrics),
    groupMetrics = (statusSource.metrics || []).filter(
      (metricEntry) =>
        metricEntry.group === groupKey &&
        (!visibleMetricIdSet || visibleMetricIdSet.has(metricEntry.entityId as string)),
    ),
    groupMetricByEntityId = new Map(groupMetrics.map((metricEntry) => [metricEntry.entityId, metricEntry]));
  if (
    layout.length !== groupMetricByEntityId.size ||
    new Set(layout.map((layoutEntry) => layoutEntry?.entityId)).size !== groupMetricByEntityId.size ||
    layout.some(
      (layoutEntry) =>
        !groupMetricByEntityId.has(layoutEntry?.entityId) ||
        ![1, 2, 3, 4].includes(Number(layoutEntry.columns)) ||
        ![1, 2].includes(Number(layoutEntry.rows)),
    )
  )
    return false;
  const nextGroupMetrics = layout.map((layoutEntry) => {
    const metricEntry = groupMetricByEntityId.get(layoutEntry.entityId) as Record<string, unknown>,
      defaultLayout = nasMetricLayout(metricEntry),
      nextMetric = {
        ...metricEntry,
      };
    return (
      layoutEntry.columns !== defaultLayout.columns && (nextMetric.columns = layoutEntry.columns),
      layoutEntry.rows !== defaultLayout.rows && (nextMetric.rows = layoutEntry.rows),
      nextMetric
    );
  });
  let nextGroupIndex = 0;
  return (
    (statusSource.metrics = (statusSource.metrics || []).map((metricEntry) =>
      groupMetricByEntityId.has(metricEntry.entityId)
        ? nextGroupMetrics[nextGroupIndex++]
        : metricEntry,
    )),
    true
  );
}

interface NasPanelUpdatePayload {
  item: {
    id?: string;
    label?: string;
    statusSource?: {
      name?: string;
      deviceId?: string;
      groupOrder?: string[];
      visibleMetrics?: string[];
      metrics?: Record<string, unknown>[];
    } | null;
  };
  states?: Record<string, unknown> | Map<string, unknown>;
  numberFormats?: Record<string, number>;
  editing?: boolean;
}

export function createNasPanel({
  onLayout = (_layout: { id?: string; group: string; layout: unknown }) => {},
}: {
  onLayout?: (layout: { id?: string; group: string; layout: unknown }) => void;
} = {}) {
  const createStyledElement = (tagName: string, className: string, textContent = "") =>
      domElement(document, tagName, className, textContent),
    panelElement = createStyledElement("div", "i3d-nas-panel i3d-climate-panel"),
    headingElement = createStyledElement("div", "i3d-nas-heading"),
    titleElement = createStyledElement("h3", ""),
    statusElement = createStyledElement("p", "i3d-nas-status"),
    metricsElement = createStyledElement("div", "i3d-nas-metrics"),
    metaElement = createStyledElement("p", "i3d-nas-meta");
  const deviceVisual = createStageDeviceVisual({
    kind: "nas",
    onActivate: undefined,
  });
  const headingTextElement = createStyledElement("div", "i3d-popup-heading-text");
  (headingTextElement.append(titleElement, metaElement),
    headingElement.append(headingTextElement, deviceVisual.root),
    panelElement.append(headingElement, statusElement, metricsElement),
    (panelElement.hidden = true));
  /** 分组 → 该组复用的 extras 实例；顺序由 `nasGroups` 决定。 */
  const groupExtrasByKey = new Map<
      string,
      { section: HTMLElement; extras: ReturnType<typeof createPurifierExtras> }
    >(),
    trackedGroupKeys = new Set<string>();
  let lastItem: NasPanelUpdatePayload["item"] | null = null,
    isVisible = true;

  function renderNasPanel({
    item: nasComponent,
    states: statesByEntityId = {},
    numberFormats: numberFormatsByEntityId = {},
    editing = false,
  }: NasPanelUpdatePayload) {
    if (((lastItem = nasComponent), !isVisible)) return;
    const statusSource = nasComponent.statusSource,
      visibleMetricIdSet = statusSource?.visibleMetrics && new Set(statusSource.visibleMetrics),
      visibleMetrics = (statusSource?.metrics || []).filter(
        (metricConfig) => !visibleMetricIdSet || visibleMetricIdSet.has(metricConfig.entityId as string),
      );
    ((titleElement.textContent = nasComponent.label || statusSource?.name || "NAS"),
      (titleElement.title = titleElement.textContent));
    trackedGroupKeys.clear();
    let groupIndex = 0;
    for (const [metricGroupKey, groupLabel] of nasGroups(statusSource || null)) {
      const groupMetrics = visibleMetrics.filter(
        (groupMetric) => groupMetric.group === metricGroupKey,
      );
      if (!groupMetrics.length) continue;
      trackedGroupKeys.add(metricGroupKey);
      let groupExtras = groupExtrasByKey.get(metricGroupKey);
      if (!groupExtras) {
        const groupSection = createStyledElement("section", "i3d-nas-group"),
          groupGrid = createStyledElement("div", "i3d-nas-grid i3d-extra-grid");
        groupSection.append(createStyledElement("h4", "", groupLabel), groupGrid);
        const extrasInstance = createPurifierExtras({
          element: groupGrid,
          scrollContainer: metricsElement,
          statePresentation: (presentedItem: unknown, presentedState: unknown, precision: number | null) =>
            nasMetricValue(presentedItem as { kind?: string }, presentedState as never, precision),
          onLayout: (groupLayout: unknown) =>
            onLayout({
              id: lastItem?.id,
              group: metricGroupKey,
              layout: groupLayout,
            }),
        });
        groupExtras = {
          section: groupSection,
          extras: extrasInstance,
        };
        groupExtrasByKey.set(metricGroupKey, groupExtras);
      }
      metricsElement.children[groupIndex] !== groupExtras.section &&
        metricsElement.insertBefore(groupExtras.section, metricsElement.children[groupIndex] || null);
      groupIndex++;
      groupExtras.extras.update({
        item: {
          ...nasComponent,
          deviceId: statusSource?.deviceId,
          extraControls: groupMetrics.map(nasMetricLayout),
        },
        states: statesByEntityId,
        numberFormats: numberFormatsByEntityId,
        editing: editing,
      });
    }
    for (const [disposedGroupKey, disposedGroup] of groupExtrasByKey)
      trackedGroupKeys.has(disposedGroupKey) ||
        (disposedGroup.extras.dispose(),
        disposedGroup.section.remove(),
        groupExtrasByKey.delete(disposedGroupKey));
    let latestTimestampMs = 0;
    for (const metricEntry of visibleMetrics) {
      const stateEntry =
          statesByEntityId instanceof Map
            ? statesByEntityId.get(metricEntry.entityId as string)
            : (statesByEntityId as Record<string, unknown>)[metricEntry.entityId as string],
        stateTimestampMs = Date.parse(
          String(
            (stateEntry as { updatedAt?: string; last_updated?: string } | null)?.updatedAt ||
              (stateEntry as { last_updated?: string } | null)?.last_updated ||
              "",
          ),
        );
      Number.isFinite(stateTimestampMs) &&
        (latestTimestampMs = Math.max(latestTimestampMs, stateTimestampMs));
    }
    ((statusElement.hidden = visibleMetrics.length > 0),
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
          : "—")),
      deviceVisual.sync({
        kind: "nas",
        on: !!statusSource && visibleMetrics.length > 0,
        available: !!statusSource,
        interactive: false,
        disabled: true,
        status: visibleMetrics.length ? "normal" : "off",
        label: titleElement.textContent || "NAS",
      }));
  }

  return {
    root: panelElement,
    update: renderNasPanel,
    setVisible(nextVisible: boolean) {
      isVisible = nextVisible;
      for (const groupExtras of groupExtrasByKey.values())
        groupExtras.extras.setVisible(nextVisible);
    },
    dispose() {
      for (const groupExtras of groupExtrasByKey.values()) groupExtras.extras.dispose();
      (groupExtrasByKey.clear(),
        (lastItem = null),
        deviceVisual.dispose(),
        panelElement.remove());
    },
  };
}
