/** registry 内部共享的低级工具函数：供主文件与各子模块复用。此处不依赖任何模块级可变状态。 */
import {
  clampNumber as clampNumberCore,
  finiteNumberOrCoerced,
} from "../../../utils/number";

/** 带 fallback 的夹取：非有限输入先落到 fallback，再夹到区间（口径统一到 app/utils/number）。 */
export function clampNumber(rawNumber: any, lowerBound: any, upperBound: any, fallbackNumber: any) {
  return clampNumberCore(finiteNumberOrCoerced(rawNumber, fallbackNumber), lowerBound, upperBound);
}
export function normalizeCssColor(colorInput: any, fallbackColor: any) {
  const trimmedColor = String(colorInput || "").trim();
  return /^(#[\da-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))$/i.test(trimmedColor)
    ? trimmedColor
    : fallbackColor;
}
export function applyTextOutline(textElement: any, fontWeightInput: any, fontSizeInput: any) {
  const numericWeight = Number(fontWeightInput),
    strokeRatio =
      Number.isFinite(numericWeight) && numericWeight > 1
        ? clampNumber((numericWeight - 1) / 899, 0, 1, 0.4)
        : clampNumber(numericWeight, 0, 1, 0.4),
    fontSizePixels = Math.max(1, Number(fontSizeInput || 16)),
    strokeWidthPixels = strokeRatio * fontSizePixels * 0.05;
  ((textElement.style.fontWeight = "100"),
    (textElement.style.webkitTextStroke = strokeWidthPixels.toFixed(3) + "px currentColor"),
    (textElement.style.paintOrder = "stroke fill"));
}
export function resolveMdiIconUrl(iconName: any) {
  const normalizedIconName = String(iconName || "")
    .trim()
    .replace(/^mdi:/, "");
  return /^[a-z0-9-]+$/.test(normalizedIconName)
    ? "/static/vendor/mdi/7.4.47/svg/" + normalizedIconName + ".svg"
    : "";
}
export function isActiveStateText(statePayload: any) {
  const stateText = String(statePayload?.state ?? statePayload?.newState?.state ?? "")
    .trim()
    .toLowerCase();
  return ["on", "open", "true", "home"].includes(stateText);
}
export function createSvgElement(svgParentElement: any, svgTagName: any, svgAttributes: Record<string, any> = {}) {
  const createdSvgElement = document.createElementNS("http://www.w3.org/2000/svg", svgTagName);
  for (const [svgAttributeName, svgAttributeValue] of Object.entries(svgAttributes))
    createdSvgElement.setAttribute(svgAttributeName, String(svgAttributeValue));
  return (svgParentElement.append(createdSvgElement), createdSvgElement);
}
export function resolveStatePayload(rawStatePayload: any) {
  return rawStatePayload?.newState || rawStatePayload || null;
}

import { formatLineChartValue } from "../../controls/line-chart-runtime";
export function buildHistorySeries(historySource: any, historyEntityId: any, liveValue: any, hoursWindow = 24) {
  const historyPoints = (
      Array.isArray(historySource.history?.get(historyEntityId)?.points)
        ? historySource.history.get(historyEntityId).points
        : []
    )
      .map((historyPointEntry: any) => ({
        timestamp: Date.parse(historyPointEntry.timestamp),
        value: Number(historyPointEntry.value),
      }))
      .filter(
        (validHistoryPoint: any) =>
          Number.isFinite(validHistoryPoint.timestamp) && Number.isFinite(validHistoryPoint.value),
      ),
    nowTimestamp = Date.now();
  (Number.isFinite(liveValue) &&
    historyPoints.push({
      timestamp: nowTimestamp,
      value: liveValue,
    }),
    historyPoints.sort(
      (previousPoint: any, currentPoint: any) => previousPoint.timestamp - currentPoint.timestamp,
    ));
  const dedupedPoints = historyPoints.filter(
    (candidateHistoryPoint: any, candidatePointIndex: any) =>
      candidatePointIndex === 0 ||
      candidateHistoryPoint.timestamp !== historyPoints[candidatePointIndex - 1].timestamp ||
      candidateHistoryPoint.value !== historyPoints[candidatePointIndex - 1].value,
  );
  if (!dedupedPoints.length) return [];
  const requestedHours = Math.round(clampNumber(hoursWindow, 1, 168, 24)),
    HOUR_IN_MILLISECONDS = 3600 * 1000,
    windowStartTimestamp = nowTimestamp - requestedHours * HOUR_IN_MILLISECONDS,
    seriesPoints: any[] = [];
  let historyCursor = 0,
    lastPointBeforeWindow: any = null;
  for (let hourOffset = 0; hourOffset <= requestedHours; hourOffset += 1) {
    const sampleTimestamp =
      hourOffset === requestedHours
        ? nowTimestamp
        : windowStartTimestamp + hourOffset * HOUR_IN_MILLISECONDS;
    for (
      ;
      historyCursor < dedupedPoints.length &&
      dedupedPoints[historyCursor].timestamp <= sampleTimestamp;
    )
      ((lastPointBeforeWindow = dedupedPoints[historyCursor]), (historyCursor += 1));
    const samplePoint = lastPointBeforeWindow || dedupedPoints[historyCursor] || dedupedPoints[0];
    samplePoint &&
      seriesPoints.push({
        timestamp: sampleTimestamp,
        value: samplePoint.value,
      });
  }
  return seriesPoints;
}
export function formatTimestamp(timestampInput: any, hasTimeComponent = true) {
  const dateTimeFormatOptions: Intl.DateTimeFormatOptions = hasTimeComponent
    ? {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }
    : {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      };
  return new Intl.DateTimeFormat("zh-CN", dateTimeFormatOptions)
    .format(new Date(timestampInput))
    .replace(/\//g, "-");
}
/** 点集是否按时间升序（同一份 geometry.points 只判一次，WeakMap 随数组一起回收）。 */
const ascendingPointsCache = new WeakMap<any[], boolean>();
function pointsAreAscending(points: any[]) {
  const cached = ascendingPointsCache.get(points);
  if (cached !== undefined) return cached;
  let ascending = true;
  for (let index = 1; index < points.length; index += 1) {
    if (Number(points[index].timestamp) < Number(points[index - 1].timestamp)) {
      ascending = false;
      break;
    }
  }
  ascendingPointsCache.set(points, ascending);
  return ascending;
}
/**
 * 找最接近 timestamp 的点。升序点集走二分（距离相等时同样取更早的那个），
 * 非升序时退回线性扫描保证结果不变。
 */
function findNearestSeriesPoint(points: any[], timestamp: number) {
  if (!points?.length) return points?.[0];
  if (points.length > 8 && pointsAreAscending(points)) {
    let low = 0,
      high = points.length - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (Number(points[middle].timestamp) < timestamp) low = middle + 1;
      else high = middle;
    }
    if (low === 0) return points[0];
    const after = points[low],
      before = points[low - 1];
    return Math.abs(Number(after.timestamp) - timestamp) <
      Math.abs(Number(before.timestamp) - timestamp)
      ? after
      : before;
  }
  return points.reduce((closestPoint: any, candidatePoint: any) =>
    Math.abs(candidatePoint.timestamp - timestamp) <
    Math.abs(closestPoint.timestamp - timestamp)
      ? candidatePoint
      : closestPoint,
  );
}
export function createHoverLineChart(
  chartContainer: any,
  tooltipHostElement: any,
  seriesRecord: any,
  valueSuffix: any,
  pointToPercent: any,
  valueFormat = "auto",
  windowRange = {
    start: 0,
    end: 1,
  },
  tooltipMountElement = document.body,
) {
  const tooltipElement = document.createElement("span");
  ((tooltipElement.className = "hb-line-chart-tooltip"),
    tooltipMountElement === tooltipHostElement &&
      tooltipElement.classList.add("hb-line-chart-details-tooltip"),
    (tooltipElement.hidden = true));
  const hoverGuideElement = document.createElement("i");
  ((hoverGuideElement.className = "hb-line-chart-hover-guide"), (hoverGuideElement.hidden = true));
  const hoverDotElement = document.createElement("i");
  ((hoverDotElement.className = "hb-line-chart-hover-dot"),
    (hoverDotElement.hidden = true),
    tooltipHostElement.append(hoverGuideElement, hoverDotElement),
    tooltipMountElement.append(tooltipElement));
  // 悬停重算合并到每帧一次：pointermove 在高刷屏/触控板上可一帧触发多次，
  // 而每次都要读多份 rect（读布局会强制同步布局）并重算 tooltip 位置。
  let hoverFrame: number | null = null,
    pendingHoverEvent: any = null;
  const applyChartPointerMove = (pointerEvent: any) => {
    const dialogLayerElement =
      tooltipMountElement === tooltipHostElement
        ? tooltipHostElement.closest(".hb-renderer-runtime-dialog-layer")
        : null;
    dialogLayerElement &&
      tooltipElement.parentElement !== dialogLayerElement &&
      dialogLayerElement.append(tooltipElement);
    // 只量一次容器：原来同一份 rect 读了 3 次（每次都可能触发同步布局）。
    const chartBounds = chartContainer.getBoundingClientRect();
    if (!chartBounds.width) return;
    const pointerRatioX = (pointerEvent.clientX - chartBounds.left) / chartBounds.width,
      windowRatio = clampNumber(
        (pointerRatioX - windowRange.start) /
          Math.max(0.001, windowRange.end - windowRange.start),
        0,
        1,
        0,
      ),
      pointerTimestamp =
        seriesRecord.firstTime + windowRatio * (seriesRecord.lastTime - seriesRecord.firstTime),
      nearestPoint = findNearestSeriesPoint(seriesRecord.points, pointerTimestamp),
      projectedPoint = pointToPercent(nearestPoint),
      hostBounds = tooltipHostElement.getBoundingClientRect(),
      localOffsetX =
        chartBounds.left - hostBounds.left + (projectedPoint.x / 100) * chartBounds.width,
      localOffsetY =
        chartBounds.top - hostBounds.top + (projectedPoint.y / 100) * chartBounds.height,
      absoluteLeft = hostBounds.left + localOffsetX,
      absoluteTop = hostBounds.top + localOffsetY,
      guideLeftPercent = (localOffsetX / Math.max(1, hostBounds.width)) * 100,
      guideTopPercent = (localOffsetY / Math.max(1, hostBounds.height)) * 100,
      isTooltipOnHost = tooltipElement.parentElement === tooltipHostElement,
      isTooltipOnDialogLayer =
        dialogLayerElement && tooltipElement.parentElement === dialogLayerElement,
      dialogLayerBounds = isTooltipOnDialogLayer
        ? dialogLayerElement.getBoundingClientRect()
        : null,
      tooltipScale =
        tooltipMountElement === tooltipHostElement
          ? chartBounds.width /
            Math.max(1, chartContainer.viewBox?.baseVal.width || chartContainer.clientWidth)
          : hostBounds.width / Math.max(1, tooltipHostElement.offsetWidth),
      positionContainerElement = isTooltipOnHost
        ? tooltipHostElement
        : isTooltipOnDialogLayer
          ? dialogLayerElement
          : null,
      positionContainerBounds = isTooltipOnHost ? hostBounds : dialogLayerBounds,
      horizontalScale = positionContainerElement
        ? positionContainerBounds.width / Math.max(1, positionContainerElement.offsetWidth)
        : 1,
      verticalScale = positionContainerElement
        ? positionContainerBounds.height / Math.max(1, positionContainerElement.offsetHeight)
        : 1,
      dialogLocalLeft = isTooltipOnDialogLayer
        ? (absoluteLeft - dialogLayerBounds.left) / horizontalScale
        : absoluteLeft,
      dialogLocalTop = isTooltipOnDialogLayer
        ? (absoluteTop - dialogLayerBounds.top) / verticalScale
        : absoluteTop;
    ((tooltipElement.textContent =
      formatTimestamp(nearestPoint.timestamp) +
      "  " +
      formatLineChartValue(nearestPoint.value, valueFormat) +
      valueSuffix),
      (tooltipElement.style.position =
        isTooltipOnHost || isTooltipOnDialogLayer ? "absolute" : "fixed"),
      (tooltipElement.style.left =
        (isTooltipOnHost ? localOffsetX / horizontalScale : dialogLocalLeft) + "px"),
      (tooltipElement.style.top =
        (isTooltipOnHost ? localOffsetY / verticalScale : dialogLocalTop) + "px"),
      (tooltipElement.style.transformOrigin = "0 0"),
      (tooltipElement.hidden = false));
    const tooltipPixelWidth = tooltipElement.offsetWidth * tooltipScale,
      containerLeftEdge = positionContainerBounds?.left ?? 0,
      containerRightEdge = positionContainerBounds?.right ?? window.innerWidth,
      tooltipTranslateX =
        absoluteLeft - tooltipPixelWidth / 2 < containerLeftEdge
          ? "0"
          : absoluteLeft + tooltipPixelWidth / 2 > containerRightEdge
            ? "-100%"
            : "-50%";
    ((tooltipElement.style.transform =
      "scale(" +
      tooltipScale / horizontalScale +
      ", " +
      tooltipScale / verticalScale +
      ") translate(" +
      tooltipTranslateX +
      ", calc(-100% - 9px))"),
      (hoverGuideElement.style.left = guideLeftPercent + "%"),
      (hoverDotElement.style.left = guideLeftPercent + "%"),
      (hoverDotElement.style.top = guideTopPercent + "%"),
      (tooltipElement.hidden = false),
      (hoverGuideElement.hidden = false),
      (hoverDotElement.hidden = false));
  };
  const handleChartPointerMove = (pointerEvent: any) => {
    pendingHoverEvent = pointerEvent;
    if (hoverFrame !== null) return;
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = null;
      const latestEvent = pendingHoverEvent;
      pendingHoverEvent = null;
      if (latestEvent) applyChartPointerMove(latestEvent);
    });
  };
  const handleChartPointerLeave = () => {
    // 离开时丢掉还没落地的那一帧，避免 tooltip 隐藏后又被补画一次。
    if (hoverFrame !== null) {
      cancelAnimationFrame(hoverFrame);
      hoverFrame = null;
    }
    pendingHoverEvent = null;
    ((tooltipElement.hidden = true),
      (hoverGuideElement.hidden = true),
      (hoverDotElement.hidden = true));
  };
  return (
    chartContainer.addEventListener("pointermove", handleChartPointerMove),
    chartContainer.addEventListener("pointerleave", handleChartPointerLeave),
    () => {
      (chartContainer.removeEventListener("pointermove", handleChartPointerMove),
        chartContainer.removeEventListener("pointerleave", handleChartPointerLeave),
        tooltipElement.remove());
    }
  );
}
