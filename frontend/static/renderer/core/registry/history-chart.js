/**
 * 折线图控件：历史序列构造、时间戳格式化、悬浮提示与详情面板绘制。
 *
 * 阈值 / 平滑 / 配色等纯函数在 `controls/weather-chart-runtime.js`，本文件只做组装与交互。
 */
// 数值夹取统一走 utils/numbers.js。`clampNumber` 只用于三处：那三处 `clampCoercedNumber`
// 的兜底是**算出来的表达式**、存在越界的现实可能，所以要在调用点先夹一次
// （见 `utils/numbers.js` 模块头那张口径表）。
import { clampCoercedNumber } from "../../../utils/numbers.js?v=2609251458";
import { formatZhDateTime } from "../../../utils/datetime.js?v=2609251458";
import {
  formatLineChartValue,
  lineChartGeometry
} from "../../controls/line-chart-runtime.js?v=2609251458";
import {
  resolvedThresholds,
  smoothChartPath,
  thresholdColor
} from "../../controls/weather-chart-runtime.js?v=2609251458";
// 同门分片：registry-visuals
import { appendSvgElement, chartThresholdPalette } from "./registry-visuals.js?v=2609251458";

/**
 * 把历史点整理成等间隔的折线序列：丢掉时间戳或数值非法的点，追加当前值作为最新一点，
 * 相邻重复（同一时间戳同一值）先去重，再按「每小时一个桶」前向填充（桶内取该时刻之前最近的一条记录），
 * 这样空档期会自然延续上一个值，与仪表盘读数语义一致。
 */
export function buildHistorySeries(historyContext, historyEntityId, currentStateValue, historyHours = 24) {
  // 先把原始点归一成「毫秒时间戳 + Number 数值」，后面统一按这两个字段比较与排序；
  // 解析失败的点会得到 NaN，交给紧随其后的 filter 丢掉，避免脏数据把曲线拉平。
  const historySamples = (
    Array.isArray(historyContext.history?.get(historyEntityId)?.points)
      ? historyContext.history.get(historyEntityId).points
      : []
  )
    .map(historyPoint => ({
      timestamp: Date.parse(historyPoint.timestamp),
      value: Number(historyPoint.value)
    }))
    .filter(
      historySample =>
        Number.isFinite(historySample.timestamp) && Number.isFinite(historySample.value)
    );
  const nowTimestamp = Date.now();
  if (Number.isFinite(currentStateValue)) {
    historySamples.push({
      timestamp: nowTimestamp,
      value: currentStateValue
    });
  }
  historySamples.sort(
    (firstSample, secondSample) => firstSample.timestamp - secondSample.timestamp
  );
  const dedupedSamples = historySamples.filter(
    (dedupSample, dedupIndex) =>
      dedupIndex === 0 ||
      dedupSample.timestamp !== historySamples[dedupIndex - 1].timestamp ||
      dedupSample.value !== historySamples[dedupIndex - 1].value
  );
  if (!dedupedSamples.length) {
    return [];
  }
  // 窗口夹在 1 小时到 168 小时（一周）：再长的话每小时一个桶的曲线已经没有信息量。
  const sampleBucketCount = Math.round(clampCoercedNumber(historyHours, 1, 168, 24));
  const MILLISECONDS_PER_HOUR = 3600000;
  const windowStartTimestamp = nowTimestamp - sampleBucketCount * MILLISECONDS_PER_HOUR;
  const bucketedSamples = [];
  let sampleCursor = 0;
  let lastSample = null;
  for (let bucketIndex = 0; bucketIndex <= sampleBucketCount; bucketIndex += 1) {
    const bucketTimestamp =
      bucketIndex === sampleBucketCount
        ? nowTimestamp
        : windowStartTimestamp + bucketIndex * MILLISECONDS_PER_HOUR;
    while (
      sampleCursor < dedupedSamples.length &&
      dedupedSamples[sampleCursor].timestamp <= bucketTimestamp
    ) {
      lastSample = dedupedSamples[sampleCursor];
      sampleCursor += 1;
    }
    const bucketSample = lastSample || dedupedSamples[sampleCursor] || dedupedSamples[0];
    if (bucketSample) {
      bucketedSamples.push({
        timestamp: bucketTimestamp,
        value: bucketSample.value
      });
    }
  }
  return bucketedSamples;
}

/**
 * 把时间戳格式化成图表提示用的 `MM-DD HH:mm` 或 `HH:mm`。
 *
 * Intl 的中文格式用斜杠分隔，这里统一替换成短横线。
 */
function formatHistoryTimestamp(timestampValue, includeDate = true) {
  return formatZhDateTime(timestampValue, { withDate: includeDate });
}

/**
 * 给折线图挂上指针提示：竖线、光点与跟随的数值气泡。定位策略随气泡挂载的父元素分三种 ——
 * 图表容器内用 absolute 并按容器缩放比反算、运行时弹窗层内用 absolute 再减去弹窗层偏移、
 * document.body 用 fixed 直接按视口坐标；气泡按缩放比反向缩放，靠近容器左右边缘时改右 / 左对齐防裁切。
 */
export function attachChartTooltip(
  chartRootElement,
  chartContainerElement,
  tooltipGeometry,
  valueSuffix,
  positionMapper,
  valuePrecision = "auto",
  valueRange = {
    start: 0,
    end: 1
  },
  tooltipParentElement = document.body
) {
  const tooltipElement = document.createElement("span");
  tooltipElement.className = "hb-line-chart-tooltip";
  if (tooltipParentElement === chartContainerElement) {
    tooltipElement.classList.add("hb-line-chart-details-tooltip");
  }
  tooltipElement.hidden = true;
  const hoverGuideElement = document.createElement("i");
  hoverGuideElement.className = "hb-line-chart-hover-guide";
  hoverGuideElement.hidden = true;
  const hoverDotElement = document.createElement("i");
  hoverDotElement.className = "hb-line-chart-hover-dot";
  hoverDotElement.hidden = true;
  chartContainerElement.append(hoverGuideElement, hoverDotElement);
  tooltipParentElement.append(tooltipElement);
  // 图表气泡的 pointermove 处理器：把指针横坐标折算成时间（先取容器内比例，再用
  // valueRange 收窄到数据区间），线性扫描最近样本，再按容器 / 弹层的实际缩放摆放
  // 气泡、引导线与光点。元素一律用百分比定位，容器尺寸变化时无需重算像素。
  const handlePointerMove = pointerEvent => {
    const dialogLayerElement =
      tooltipParentElement === chartContainerElement
        ? chartContainerElement.closest(".hb-renderer-runtime-dialog-layer")
        : null;
    if (dialogLayerElement && tooltipElement.parentElement !== dialogLayerElement) {
      dialogLayerElement.append(tooltipElement);
    }
    const rootRect = chartRootElement.getBoundingClientRect();
    if (!rootRect.width) {
      return;
    }
    // 指针落在根元素内的横向比例（0~1）；先取屏幕比例，再用 valueRange 折算到数据区间。
    const relativePointerX = (pointerEvent.clientX - rootRect.left) / rootRect.width;
    const rangeRatio = clampCoercedNumber(
      (relativePointerX - valueRange.start) / Math.max(0.001, valueRange.end - valueRange.start),
      0,
      1,
      0
    );
    const targetTime =
      tooltipGeometry.firstTime +
      rangeRatio * (tooltipGeometry.lastTime - tooltipGeometry.firstTime);
    // 线性扫描找时间上最近的点：点数受窗口限制（最多百来个），
    // 线性扫描比二分更好写，也更省一次排序假设。
    const closestSample = tooltipGeometry.points.reduce((nearestSample, candidateSample) =>
      Math.abs(candidateSample.timestamp - targetTime) <
      Math.abs(nearestSample.timestamp - targetTime)
        ? candidateSample
        : nearestSample
    );
    const mappedPosition = positionMapper(closestSample);
    const containerRect = chartContainerElement.getBoundingClientRect();
    const offsetX =
      chartRootElement.getBoundingClientRect().left -
      containerRect.left +
      (mappedPosition.x / 100) * rootRect.width;
    const offsetY =
      chartRootElement.getBoundingClientRect().top -
      containerRect.top +
      (mappedPosition.y / 100) * rootRect.height;
    const pageX = containerRect.left + offsetX;
    const pageY = containerRect.top + offsetY;
    // 引导线与光点用百分比定位：容器尺寸随缩放变化，百分比不必跟着重算像素值。
    const percentX = (offsetX / Math.max(1, containerRect.width)) * 100;
    // 纵向同理；CSS 定位百分比以容器左上角为原点，与 offsetX / offsetY 的口径一致。
    const percentY = (offsetY / Math.max(1, containerRect.height)) * 100;
    const isInsideContainer = tooltipElement.parentElement === chartContainerElement;
    const isInsideDialogLayer =
      dialogLayerElement && tooltipElement.parentElement === dialogLayerElement;
    const dialogRect = isInsideDialogLayer ? dialogLayerElement.getBoundingClientRect() : null;
    const chartScale =
      tooltipParentElement === chartContainerElement
        ? rootRect.width /
          Math.max(1, chartRootElement.viewBox?.baseVal?.width || chartRootElement.clientWidth)
        : containerRect.width / Math.max(1, chartContainerElement.offsetWidth);
    const scaleParentElement = isInsideContainer
      ? chartContainerElement
      : isInsideDialogLayer
        ? dialogLayerElement
        : null;
    const scaleParentRect = isInsideContainer ? containerRect : dialogRect;
    const parentScaleX = scaleParentElement
      ? scaleParentRect.width / Math.max(1, scaleParentElement.offsetWidth)
      : 1;
    const parentScaleY = scaleParentElement
      ? scaleParentRect.height / Math.max(1, scaleParentElement.offsetHeight)
      : 1;
    const dialogOffsetX = isInsideDialogLayer ? (pageX - dialogRect.left) / parentScaleX : pageX;
    const dialogOffsetY = isInsideDialogLayer ? (pageY - dialogRect.top) / parentScaleY : pageY;
    tooltipElement.textContent =
      formatHistoryTimestamp(closestSample.timestamp) +
      "  " +
      formatLineChartValue(closestSample.value, valuePrecision) +
      valueSuffix;
    tooltipElement.style.position = isInsideContainer || isInsideDialogLayer ? "absolute" : "fixed";
    tooltipElement.style.left =
      (isInsideContainer ? offsetX / parentScaleX : dialogOffsetX) + "px";
    tooltipElement.style.top =
      (isInsideContainer ? offsetY / parentScaleY : dialogOffsetY) + "px";
    tooltipElement.style.transformOrigin = "0 0";
    tooltipElement.hidden = false;
    const scaledTooltipWidth = tooltipElement.offsetWidth * chartScale;
    const boundLeft = scaleParentRect?.left ?? 0;
    const boundRight = scaleParentRect?.right ?? window.innerWidth;
    const translateX =
      pageX - scaledTooltipWidth / 2 < boundLeft
        ? "0"
        : pageX + scaledTooltipWidth / 2 > boundRight
          ? "-100%"
          : "-50%";
    tooltipElement.style.transform =
      `scale(${chartScale / parentScaleX}, ${chartScale / parentScaleY}) ` +
      `translate(${translateX}, calc(-100% - 9px))`;
    hoverGuideElement.style.left = percentX + "%";
    hoverDotElement.style.left = percentX + "%";
    hoverDotElement.style.top = percentY + "%";
    hoverGuideElement.hidden = false;
    hoverDotElement.hidden = false;
  };
  // 移出图表时只隐藏三个浮层元素，不销毁：指针在图表内反复进出时避免反复重建 DOM。
  const handlePointerLeave = () => {
    tooltipElement.hidden = true;
    hoverGuideElement.hidden = true;
    hoverDotElement.hidden = true;
  };
  chartRootElement.addEventListener("pointermove", handlePointerMove);
  chartRootElement.addEventListener("pointerleave", handlePointerLeave);
  return () => {
    chartRootElement.removeEventListener("pointermove", handlePointerMove);
    chartRootElement.removeEventListener("pointerleave", handlePointerLeave);
    tooltipElement.remove();
  };
}

/**
 * 渲染折线图弹窗里的详情视图（大图 + 阈值色带 + 当前值），与控件本体共用同一套数据整理与几何计算。
 * 返回值上挂了 syncLineChartState，运行时状态更新时直接调用它增量刷新，不必整块重建 DOM。
 */
export function renderLineChartDetails(detailsComponent, detailsContext) {
  const detailsEntityId = detailsComponent.bindings?.entity?.entityId || "";
  const detailsState = detailsContext.states.get(detailsEntityId);
  const detailsUnit = String(detailsState?.attributes?.unit_of_measurement || "");
  const detailsValue = Number.parseFloat(detailsState?.state);
  const detailsSamples = buildHistorySeries(
    detailsContext,
    detailsEntityId,
    detailsValue,
    detailsComponent.properties?.hours
  );
  const detailsElement = document.createElement("section");
  detailsElement.className = "hb-line-chart-details";
  // 同 line-chart：阈值色带由渲染层读令牌后注入（weather-chart-runtime 是纯计算模块，不读 DOM）。
  const detailsThresholdColors = chartThresholdPalette();
  const detailsThresholds = resolvedThresholds(
    detailsComponent.properties?.thresholds,
    detailsSamples,
    detailsComponent.properties?.thresholdMode,
    detailsThresholdColors
  );
  detailsElement.style.setProperty(
    "--hb-chart-current-color",
    Number.isFinite(detailsValue)
      ? thresholdColor(detailsThresholds, detailsValue, detailsThresholdColors.defaultColor)
      : detailsThresholdColors.defaultColor
  );
  detailsElement.syncLineChartState = detailsRuntimeUpdate => {
    const detailsRuntimeValue = Number.parseFloat(detailsRuntimeUpdate?.state);
    detailsElement.style.setProperty(
      "--hb-chart-current-color",
      Number.isFinite(detailsRuntimeValue)
        ? thresholdColor(detailsThresholds, detailsRuntimeValue, detailsThresholdColors.defaultColor)
        : detailsThresholdColors.defaultColor
    );
  };
  if (!detailsSamples.length) {
    const detailsEmptyElement = document.createElement("p");
    detailsEmptyElement.textContent = "暂无历史数据。";
    detailsElement.append(detailsEmptyElement);
    return detailsElement;
  }
  const isCompactHorizontal = detailsComponent.properties?.compactDetailsHorizontal === true;
  const detailsViewBoxWidth = isCompactHorizontal ? 790 : 720;
  const detailsTopOffset = isCompactHorizontal ? 0 : 56;
  const detailsViewBoxHeight = 340 + detailsTopOffset;
  const detailsLeftMargin = isCompactHorizontal ? 44 : 66;
  const detailsRightMargin = isCompactHorizontal ? 44 : 26;
  const detailsPlotRect = {
    left: detailsLeftMargin,
    top: 24,
    width: detailsViewBoxWidth - detailsLeftMargin - detailsRightMargin,
    height: 258 + detailsTopOffset
  };
  const detailsGeometry = lineChartGeometry(
    detailsSamples,
    detailsPlotRect.left,
    detailsPlotRect.top,
    detailsPlotRect.width,
    detailsPlotRect.height
  );
  const detailsSvg = appendSvgElement(detailsElement, "svg", {
    viewBox: "0 0 " + detailsViewBoxWidth + " " + detailsViewBoxHeight,
    preserveAspectRatio: "xMidYMid meet",
    role: "img",
    "aria-label": "带时间轴和数值轴的历史折线图"
  });
  const detailsGradientId =
    (detailsContext.renderNamespace || "renderer") +
    "-chart-details-" +
    String(detailsComponent.id || "").replace(/[^a-z0-9_-]/gi, "");
  const detailsDefs = appendSvgElement(detailsSvg, "defs");
  const detailsLineGradient = appendSvgElement(detailsDefs, "linearGradient", {
    id: detailsGradientId + "-line",
    gradientUnits: "userSpaceOnUse",
    x1: 0,
    y1: detailsPlotRect.top,
    x2: 0,
    y2: detailsPlotRect.top + detailsPlotRect.height
  });
  const detailsThresholdStops = detailsThresholds.length
    ? detailsThresholds
    : [
        {
          value: detailsGeometry.minimum,
          color: detailsThresholdColors.defaultColor
        }
      ];
  for (const detailsThresholdStop of [...detailsThresholdStops].sort(
    (lowerThresholdStop, higherThresholdStop) =>
      higherThresholdStop.value - lowerThresholdStop.value
  )) {
    appendSvgElement(detailsLineGradient, "stop", {
      offset:
        clampCoercedNumber(
          ((detailsGeometry.maximum - detailsThresholdStop.value) / detailsGeometry.span) * 100,
          0,
          100,
          0
        ) + "%",
      "stop-color": detailsThresholdStop.color
    });
  }
  for (let horizontalGridIndex = 0; horizontalGridIndex <= 4; horizontalGridIndex += 1) {
    const horizontalRatio = horizontalGridIndex / 4;
    const horizontalY = detailsPlotRect.top + horizontalRatio * detailsPlotRect.height;
    const horizontalValue = detailsGeometry.maximum - horizontalRatio * detailsGeometry.span;
    appendSvgElement(detailsSvg, "line", {
      x1: detailsPlotRect.left,
      y1: horizontalY,
      x2: detailsPlotRect.left + detailsPlotRect.width,
      y2: horizontalY,
      class: "hb-line-chart-details-grid"
    });
    const horizontalLabelElement = appendSvgElement(detailsSvg, "text", {
      x: detailsPlotRect.left - (isCompactHorizontal ? 8 : 12),
      y: horizontalY + 4,
      "text-anchor": "end",
      class: "hb-line-chart-details-axis-label"
    });
    horizontalLabelElement.textContent = formatLineChartValue(
      horizontalValue,
      detailsComponent.properties?.statePrecision
    );
  }
  const hasMultiDayRange = Number(detailsComponent.properties?.hours || 24) > 24;
  for (let verticalGridIndex = 0; verticalGridIndex <= 5; verticalGridIndex += 1) {
    const verticalRatio = verticalGridIndex / 5;
    const verticalX = detailsPlotRect.left + verticalRatio * detailsPlotRect.width;
    const verticalTime =
      detailsGeometry.firstTime +
      verticalRatio * (detailsGeometry.lastTime - detailsGeometry.firstTime);
    appendSvgElement(detailsSvg, "line", {
      x1: verticalX,
      y1: detailsPlotRect.top,
      x2: verticalX,
      y2: detailsPlotRect.top + detailsPlotRect.height,
      class: "hb-line-chart-details-grid vertical"
    });
    const verticalLabelElement = appendSvgElement(detailsSvg, "text", {
      x: verticalX,
      y: detailsPlotRect.top + detailsPlotRect.height + 25,
      "text-anchor": "middle",
      class: "hb-line-chart-details-axis-label"
    });
    verticalLabelElement.textContent = formatHistoryTimestamp(verticalTime, hasMultiDayRange);
  }
  appendSvgElement(detailsSvg, "line", {
    x1: detailsPlotRect.left,
    y1: detailsPlotRect.top,
    x2: detailsPlotRect.left,
    y2: detailsPlotRect.top + detailsPlotRect.height,
    class: "hb-line-chart-details-axis"
  });
  appendSvgElement(detailsSvg, "line", {
    x1: detailsPlotRect.left,
    y1: detailsPlotRect.top + detailsPlotRect.height,
    x2: detailsPlotRect.left + detailsPlotRect.width,
    y2: detailsPlotRect.top + detailsPlotRect.height,
    class: "hb-line-chart-details-axis"
  });
  const axisTitleElement = appendSvgElement(detailsSvg, "text", {
    x: detailsPlotRect.left,
    y: 20,
    class: "hb-line-chart-details-axis-title"
  });
  axisTitleElement.textContent = detailsUnit || "数值";
  const detailsPath = smoothChartPath(detailsGeometry.points);
  appendSvgElement(detailsSvg, "path", {
    d:
      detailsPath +
      " L" +
      (detailsPlotRect.left + detailsPlotRect.width) +
      " " +
      (detailsPlotRect.top + detailsPlotRect.height) +
      " L" +
      detailsPlotRect.left +
      " " +
      (detailsPlotRect.top + detailsPlotRect.height) +
      " Z",
    fill: "url(#" + detailsGradientId + "-line)",
    opacity: 0.12,
    class: "hb-line-chart-details-fill"
  });
  appendSvgElement(detailsSvg, "path", {
    d: detailsPath,
    fill: "none",
    stroke: "url(#" + detailsGradientId + "-line)",
    "stroke-width": 2.4,
    pathLength: 100,
    "vector-effect": "non-scaling-stroke",
    class: "hb-line-chart-details-line"
  });
  const leadDotElement = appendSvgElement(detailsSvg, "circle", {
    cx: 0,
    cy: 0,
    r: 4.2,
    class: "hb-line-chart-details-lead-dot"
  });
  if (detailsContext.animate !== false) {
    appendSvgElement(leadDotElement, "animateMotion", {
      path: detailsPath,
      dur: "1.1s",
      begin: ".28s",
      fill: "freeze"
    });
  }
  detailsElement.cleanupLineChartHover = () => {};
  if (detailsContext.interactive !== false) {
    detailsElement.cleanupLineChartHover = attachChartTooltip(
      detailsSvg,
      detailsElement,
      detailsGeometry,
      detailsUnit,
      detailsMappedPoint => ({
        x: (detailsMappedPoint.x / detailsViewBoxWidth) * 100,
        y: (detailsMappedPoint.y / detailsViewBoxHeight) * 100
      }),
      detailsComponent.properties?.statePrecision,
      {
        start: detailsPlotRect.left / detailsViewBoxWidth,
        end: (detailsPlotRect.left + detailsPlotRect.width) / detailsViewBoxWidth
      },
      detailsElement
    );
  }
  return detailsElement;
}
