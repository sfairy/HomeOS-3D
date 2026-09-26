/**
 * 3D 户型工作室的纯几何、吸附与渲染预算工具库（无状态、不碰 DOM、不 import three.js，可直接单测）。
 * 坐标与单位：入参是平面坐标 x 右 y 下、单位底图像素；calibration.pixelsPerMeter 是同场景唯一的像素↔米系数，墙厚 / 层高 / 尺寸 / 照射距离等真实尺度一律是米。
 * 平面 y 轴对应三维世界 z 轴；本文件不做三维变换、也不感知楼层堆叠（平移与旋转由 studio-app.js 负责）。
 * 容差统一用 1e-7：平面坐标量级约 1e-1~1e4 像素、double 相对舍入误差约 1e-12，它作「同一点 / 零长度 / 平行」的判定阈值；随尺度缩放的判定（共线、端点归类、正交容差）在函数内另行派生。
 */
// 夹取实现在 utils/numbers.js（唯一实现），这里保留 clamp 这个名字对外 —— studio-app.js 等已按此名导入。
// 必须用 import + 本地 export，不能写成 `export { clampNumber as clamp } from ...`：
// 纯 re-export 只对外暴露名字、不在本模块作用域建绑定，下面这些函数里的 clamp(...) 会直接 ReferenceError。
import { clampNumber } from "../../utils/numbers.js?v=2609260946";

/**
 * 把数值夹到 [lowerBound, upperBound] 闭区间内。
 * 不做 NaN 兜底（NaN 原样传出），调用方须先用 `Number(x) || 默认值` 等把脏值换掉。
 */
export const clamp = clampNumber;

/**
 * 把 0~1 的亮度输入映射成聚光灯的渲染强度响应。
 * 平方曲线（gamma≈2）贴近人眼对亮度的非线性感知：低亮度段压得更低、高亮度段才拉开差距。
 * 吸顶灯在 (0, 0.35) 亮度区间另叠峰值约 +0.007 的抛物线增量（两端归零，0.35 为实测拐点），补偿宽角灯低亮度「看着比筒灯暗」的观感差。
 */
export function spotLightBrightnessResponse(lightType = "downlight", brightnessInput = 0) {
  const brightnessRatio = clamp(Number(brightnessInput) || 0, 0, 1);
  const baseResponse = brightnessRatio * brightnessRatio;
  if (lightType !== "ceilinglight" || brightnessRatio <= 0 || brightnessRatio >= 0.35) {
    return baseResponse;
  }
  const downlightBoost = brightnessRatio * 0.08 * (1 - brightnessRatio / 0.35);
  return baseResponse + downlightBoost;
}
/**
 * 估算一组灯在单帧里的相对渲染开销权重（不是实测耗时），供自适应画质降级使用。
 * 按「是否投影 + 光源面积」分档：灯带 0.3（不投影）、张角 ≥140° 吸顶灯 1.65 或 1.1、筒灯 1、其它 0。
 * 关灯或亮度 0 不累计；数值只用于与 adaptiveDeviceLightBudget 的预算比较，判断本机吃不吃得下这批灯。
 */
export function adaptiveLightRenderCost(lights = []) {
  return lights.reduce(
    (totalCost, light) =>
      light?.enabled === false || Math.max(0, Number(light?.brightness) || 0) <= 0
        ? totalCost
        : light?.type === "striplight"
          ? totalCost + 0.3
          : light?.type === "ceilinglight"
            ? totalCost + (Number(light?.angle) >= 140 ? 1.65 : 1.1)
            : light?.type === "downlight"
              ? totalCost + 1
              : totalCost,
    0
  );
}
/**
 * 按设备能力与预览分辨率估算本机可同时渲染的灯光预算（相对权重上限）。
 * 基准 4.5 + min(核数, 16)×0.55（4.5 为双核低端起步值，核数取到 16 为止，再多不会加快 WebGL 主线程提交）；
 * 内存分档 0.78/0.88/1/1.1 与像素因子（500000 像素按 sqrt 反比夹 0.72~1.2）均出自实测，整体再夹到 4~16。
 */
export function adaptiveDeviceLightBudget({
  hardwareConcurrency: hardwareConcurrency = 4,
  deviceMemory: deviceMemory = 8,
  previewPixels: previewPixels = 500000
} = {}) {
  const coreCount = clamp(Number(hardwareConcurrency) || 4, 2, 24);
  const memoryGb = clamp(Number(deviceMemory) || 8, 2, 32);
  const previewPixelCount = clamp(Number(previewPixels) || 500000, 120000, 4000000);
  const baseBudget = 4.5 + Math.min(coreCount, 16) * 0.55;
  const memoryFactor = memoryGb <= 4 ? 0.78 : memoryGb < 8 ? 0.88 : memoryGb >= 16 ? 1.1 : 1;
  const pixelFactor = clamp(Math.sqrt(500000 / previewPixelCount), 0.72, 1.2);
  return clamp(baseBudget * memoryFactor * pixelFactor, 4, 16);
}
/**
 * 汇总最近若干帧耗时，判断当前渲染是否流畅、是否需要降级。
 * 先剔除 8~120ms 以外的样本（<8ms 多为 rAF 噪声、>120ms 基本是切标签 / 断点停顿），不足 12 帧不下结论。
 * severe/slow/smooth 阈值 45/50/68ms、34/38/55ms、平均 ≤24ms 且 p90 ≤32ms 由实测帧率档位反推。
 */
export function assessAdaptiveRenderFrames(frameTimes = []) {
  // 8~120ms 是「真实一帧」的合理区间，区间外的样本会污染均值，直接丢弃。
  const validFrameTimesMs = frameTimes
    .map(Number)
    .filter(frameTime => Number.isFinite(frameTime) && frameTime >= 8 && frameTime <= 120);
  if (validFrameTimesMs.length < 12) {
    return {
      sufficient: false,
      sampleCount: validFrameTimesMs.length
    };
  }
  const sortedFrameTimesMs = [...validFrameTimesMs].sort(
    (frameTimeLeft, frameTimeRight) => frameTimeLeft - frameTimeRight
  );
  // 取排序后帧耗时数组的指定分位值：percentile 传 0~1（0.75 看「偏慢的大多数」，
  // 0.9 抓长尾卡顿）。用 (n-1)×percentile 向下取整，保证 0 命中首样本、1 命中末样本，
  // 不会越界；闭包复用已排好序的数组，避免每次分位都重新排序。
  const frameTimeAtPercentile = percentile =>
    sortedFrameTimesMs[
      Math.min(
        Math.floor((sortedFrameTimesMs.length - 1) * percentile),
        sortedFrameTimesMs.length - 1
      )
    ];
  const averageFrameMs =
    validFrameTimesMs.reduce((sum, frameTimeSample) => sum + frameTimeSample, 0) /
    validFrameTimesMs.length;
  const p75FrameMs = frameTimeAtPercentile(0.75);
  const p90FrameMs = frameTimeAtPercentile(0.9);
  return {
    sufficient: true,
    sampleCount: validFrameTimesMs.length,
    averageFrameMs: averageFrameMs,
    p75FrameMs: p75FrameMs,
    p90FrameMs: p90FrameMs,
    fps: 1000 / averageFrameMs,
    severe: averageFrameMs >= 45 || p75FrameMs >= 50 || p90FrameMs >= 68,
    slow: averageFrameMs >= 34 || p75FrameMs >= 38 || p90FrameMs >= 55,
    smooth: averageFrameMs <= 24 && p90FrameMs <= 32
  };
}
/**
 * 计算平面标签（房间名 / 图标 / 副标题 / 下划线）在绘制画布上的投影位置。
 * 系数取自设计稿 2048×640 的实测像素（标题基线 130/640、字号 184/640、下划线 590/640 等）等比缩放后
 * 减半宽 / 半高，把原点移到画布中心；baselineScaleRatio 默认 0.86、夹 0.3~1 防划线冲出画布。
 */
export function planLabelProjectionMetrics(widthPx, heightPx, baselineScaleInput = 0.86) {
  const safeWidthPx = Math.max(0, Number(widthPx) || 0);
  const safeHeightPx = Math.max(0, Number(heightPx) || 0);
  const baselineScaleRatio = clamp(
    Number.isFinite(Number(baselineScaleInput)) ? Number(baselineScaleInput) : 0.86,
    0.3,
    1
  );
  return {
    titleStartX: -safeWidthPx * (0.5 - 115 / 2048),
    titleY: safeHeightPx * (130 / 640 - 0.5),
    titleFontSize: (safeHeightPx * 184) / 640,
    titleMaxWidth: (safeWidthPx * 1340) / 2048,
    iconX: safeWidthPx * (1580 / 2048 - 0.5),
    iconY: safeHeightPx * (130 / 640 - 0.5),
    iconSize: (safeHeightPx * 170) / 640,
    subtitleStartX: -safeWidthPx * (0.5 - 72 / 2048),
    subtitleY: safeHeightPx * (410 / 640 - 0.5),
    subtitleFontSize: (safeHeightPx * 310) / 640,
    subtitleMaxWidth: (safeWidthPx * 1880) / 2048,
    baselineY: safeHeightPx * (590 / 640 - 0.5),
    baselineStartX: -safeWidthPx * (0.5 - 74 / 2048),
    baselineLength: ((safeWidthPx * 1880) / 2048) * baselineScaleRatio,
    baselineLineWidth: (safeHeightPx * 16) / 640,
    baselineCapHalfHeight: (safeHeightPx * 24) / 640
  };
}
/**
 * 在阴影贴图数量上限内挑出最值得投影的灯。
 * 先排除关灯、亮度 0 与灯带（只自发光不投影），按亮度打分、吸顶灯 ×1.08（光斑更依赖阴影体现体积感）。
 * 名额先按 groupId 去重（同一房间只留最亮，避免阴影叠糊）再按分数补足；排序稳定，避免灯一换阴影整体重算。
 */
export function selectShadowCastingLightIds(lightList = [], maxCount = 8) {
  const lightLimit = Math.max(0, Math.floor(Number(maxCount) || 0));
  if (lightLimit === 0) {
    return [];
  }
  const scoredLights = lightList
    .map((lightRecord, lightIndex) => ({
      id: String(lightRecord?.id || ""),
      groupId: String(lightRecord?.groupId || ""),
      type: String(lightRecord?.type || ""),
      brightness: Math.max(0, Number(lightRecord?.brightness) || 0),
      enabled: lightRecord?.enabled !== false,
      index: lightIndex
    }))
    .filter(
      candidate =>
        candidate.id &&
        candidate.enabled &&
        candidate.brightness > 0 &&
        candidate.type !== "striplight"
    )
    // 1.08 只是打破同亮度平手的微弱加成，不足以让暗的吸顶灯挤掉更亮的筒灯。
    .map(scoredCandidate => ({
      ...scoredCandidate,
      score: scoredCandidate.brightness * (scoredCandidate.type === "ceilinglight" ? 1.08 : 1)
    }));
  if (scoredLights.length <= lightLimit) {
    return scoredLights.map(rankedLight => rankedLight.id);
  }
  /**
   * 灯光排序比较器：分数高者在前；同分时按原始下标升序，保证结果稳定可复现。
   */
  const compareLightsByScore = (leftLight, rightLight) =>
    rightLight.score - leftLight.score || leftLight.index - rightLight.index;
  const bestCandidateByGroupId = new Map();
  for (const groupCandidate of scoredLights) {
    // 没分组的灯各自当作独立分组（用下标造唯一键），不会互相顶掉名额。
    const groupId = groupCandidate.groupId || "__ungrouped-" + groupCandidate.index;
    const currentBest = bestCandidateByGroupId.get(groupId);
    if (!currentBest || compareLightsByScore(groupCandidate, currentBest) < 0) {
      bestCandidateByGroupId.set(groupId, groupCandidate);
    }
  }
  const selectedLights = [...bestCandidateByGroupId.values()]
    .sort(compareLightsByScore)
    .slice(0, lightLimit);
  if (selectedLights.length < lightLimit) {
    const selectedIdSet = new Set(selectedLights.map(selectedLight => selectedLight.id));
    const remainingLights = scoredLights
      .filter(remainingLight => !selectedIdSet.has(remainingLight.id))
      .sort(compareLightsByScore);
    selectedLights.push(...remainingLights.slice(0, lightLimit - selectedLights.length));
  }
  return selectedLights.map(finalLight => finalLight.id);
}
/**
 * 推算聚光灯阴影贴图可用的纹理单元上限：从硬件单元（典型 16 个）扣掉材质贴图、非聚光灯阴影、面光源与预留位。
 * 硬件余量外再按容量经验分档（16 单元最多 3 张、24 最多 6 张、更宽裕才到 hardLimit），因为每多一张阴影贴图
 * 就多一次全屏采样、低端 GPU 往往先在这里掉帧；最终取「硬上限、分档上限、剩余单元」的最小值。
 */
export function spotShadowTextureUnitLimit({
  maxTextureUnits: maxTextureUnits = 16,
  materialTextureUnits: materialTextureUnits = 0,
  nonSpotShadowTextureUnits: nonSpotShadowTextureUnits = 1,
  rectAreaLightTextureUnits: rectAreaLightTextureUnits = 0,
  reservedTextureUnits: reservedTextureUnits = 1,
  hardLimit: hardLimit = 8
} = {}) {
  const unitCapacity = Math.max(0, Math.floor(Number(maxTextureUnits) || 0));
  const unitsInUse = [
    materialTextureUnits,
    nonSpotShadowTextureUnits,
    rectAreaLightTextureUnits,
    reservedTextureUnits
  ].reduce((unitSum, unitGroup) => unitSum + Math.max(0, Math.floor(Number(unitGroup) || 0)), 0);
  const hardLimitUnits = Math.max(0, Math.floor(Number(hardLimit) || 0));
  const adaptiveLimitUnits = unitCapacity <= 16 ? 3 : unitCapacity <= 24 ? 6 : hardLimitUnits;
  return Math.min(hardLimitUnits, adaptiveLimitUnits, Math.max(0, unitCapacity - unitsInUse));
}
/**
 * 给单盏聚光灯 / 筒灯推荐阴影贴图参数。
 * 宽角吸顶灯（张角 ≥140°）光斑铺得开，用 512 贴图 + 更大模糊半径与 8 次采样压锯齿，代价是显存与采样翻倍，
 * 普通灯仍用 256/4 次；normalBias 0.018 略高于 three.js 常用值，为在低分辨率贴图下先消除自阴影痤疮。
 */
export function localSpotShadowSettings(
  shadowLightType = "downlight",
  shadowRangeInput = 3.5,
  angleInput = 90
) {
  const shadowRangeMeters = clamp(
    Number.isFinite(Number(shadowRangeInput)) ? Number(shadowRangeInput) : 3.5,
    0.5,
    10
  );
  const angleDeg = clamp(Number.isFinite(Number(angleInput)) ? Number(angleInput) : 90, 15, 180);
  const isWideCeilingLight = shadowLightType === "ceilinglight" && angleDeg >= 140;
  return {
    mapSize: isWideCeilingLight ? 512 : 256,
    radius: isWideCeilingLight ? 1.25 : 1,
    blurSamples: isWideCeilingLight ? 8 : 4,
    normalBias: 0.018,
    wideCeilingLight: isWideCeilingLight,
    range: shadowRangeMeters,
    angle: angleDeg
  };
}
/**
 * 计算平面坐标下两点间的欧氏距离。
 */
export function distance(firstPoint, secondPoint) {
  return Math.hypot(secondPoint.x - firstPoint.x, secondPoint.y - firstPoint.y);
}
/**
 * 计算推拉门两扇在给定开启比例下的中心偏移（相对门洞中心）。
 * 活动扇基准偏移是固定扇的镜像（两扇错开最远 = 完全闭合），再按 openRatio 线性插值：0 = 闭合、1 = 两扇完全重合 = 全开。
 * 固定扇偏移取 ±23% 门宽（handleSide ≥ 0 时向一侧、否则镜像）：23% 来自两扇搭接量约 4~5% 门宽时的实测外观比例。
 */
export function slidingDoorPanelCenters(panelWidth, handleSide = -1, openRatio = 2 / 3) {
  // 0.23 是门扇中心相对门洞中心的横向偏移比例（两扇搭接约 4~5% 门宽时的实测值）。
  const fixedOffset = (handleSide >= 0 ? 1 : -1) * panelWidth * 0.23;
  // 活动扇的基准位置与固定扇反向对称，即闭合状态。
  const movingBaseOffset = -fixedOffset;
  return {
    fixed: fixedOffset,
    moving: movingBaseOffset + (fixedOffset - movingBaseOffset) * clamp(openRatio, 0, 1)
  };
}
/**
 * 把点投影到线段上，取线段上离它最近的点。
 * t 被夹在 [0,1]，结果一定落在线段内（不是无限延长线），这是吸附 / 命中检测的期望语义；线段长度平方 ≤ 1e-7 时视为退化点，直接返回起点并把 t 记 0，避免除零产生 NaN/Infinity 污染下游。
 */
export function projectPointToSegment(point, segmentStart, segmentEnd) {
  const segmentDirX = segmentEnd.x - segmentStart.x;
  const segmentDirY = segmentEnd.y - segmentStart.y;
  const segmentLengthSquared = segmentDirX * segmentDirX + segmentDirY * segmentDirY;
  // 退化线段（两端点重合，长度平方 ≤ EPSILON）直接退化成起点，避免后面除以 0。
  if (segmentLengthSquared <= 1e-7) {
    return {
      point: {
        ...segmentStart
      },
      t: 0,
      distance: distance(point, segmentStart)
    };
  }
  const projectionT = clamp(
    ((point.x - segmentStart.x) * segmentDirX + (point.y - segmentStart.y) * segmentDirY) /
      segmentLengthSquared,
    0,
    1
  );
  const closestPoint = {
    x: segmentStart.x + segmentDirX * projectionT,
    y: segmentStart.y + segmentDirY * projectionT
  };
  return {
    point: closestPoint,
    t: projectionT,
    distance: distance(point, closestPoint)
  };
}
/**
 * 求两条线段的交点：叉积参数化求解，|cross| ≤ EPSILON 视为平行 / 共线返回 null（共线重叠由
 * mergeCollinearWallSegments / uncoveredCollinearWallSegments 单独处理）；参数区间用不对称容差（下界 1e-7、
 * 上界 1.0000001）让交点落在公共端点仍算命中，t 再 clamp 后插值修正越界。
 */
export function segmentIntersection(firstStart, firstEnd, secondStart, secondEnd) {
  const firstDirX = firstEnd.x - firstStart.x;
  const firstDirY = firstEnd.y - firstStart.y;
  const secondDirX = secondEnd.x - secondStart.x;
  const secondDirY = secondEnd.y - secondStart.y;
  // 二维叉积即两方向向量张成的平行四边形面积，为 0（含浮点噪声）表示平行或共线。
  const crossDenominator = firstDirX * secondDirY - firstDirY * secondDirX;
  if (Math.abs(crossDenominator) <= 1e-7) {
    return null;
  }
  const startDeltaX = secondStart.x - firstStart.x;
  const startDeltaY = secondStart.y - firstStart.y;
  // 交点在第一段上的归一化参数（0=起点，1=终点）。
  const firstT = (startDeltaX * secondDirY - startDeltaY * secondDirX) / crossDenominator;
  // 交点在第二段上的归一化参数。
  const secondT = (startDeltaX * firstDirY - startDeltaY * firstDirX) / crossDenominator;
  // 参数越界即交点落在线段之外；上界写成 1.0000001 是 1 + 1e-7 的字面量形式。
  if (firstT < -1e-7 || firstT > 1.0000001 || secondT < -1e-7 || secondT > 1.0000001) {
    return null;
  } else {
    return {
      x: firstStart.x + firstDirX * clamp(firstT, 0, 1),
      y: firstStart.y + firstDirY * clamp(firstT, 0, 1)
    };
  }
}
/**
 * 求一组墙两两之间的全部交点并按距离 ≤ EPSILON 去重（O(n²)）。
 * 三 / 四墙交汇处同一点会被重复算出；用近距离比较而非坐标哈希，是因为交点坐标由插值得到、位模式不稳定。
 * 调用方按场景缓存结果，撤销 / 重绘时不会反复付出这份平方复杂度。
 */
export function wallIntersections(wallList) {
  const intersectionPoints = [];
  for (let wallIndex = 0; wallIndex < wallList.length; wallIndex += 1) {
    for (
      let otherWallIndex = wallIndex + 1;
      otherWallIndex < wallList.length;
      otherWallIndex += 1
    ) {
      const intersection = segmentIntersection(
        wallList[wallIndex].start,
        wallList[wallIndex].end,
        wallList[otherWallIndex].start,
        wallList[otherWallIndex].end
      );
      if (
        !!intersection &&
        !intersectionPoints.some(existingPoint => distance(existingPoint, intersection) <= 1e-7)
      ) {
        intersectionPoints.push(intersection);
      }
    }
  }
  return intersectionPoints;
}
/**
 * 按墙与墙的交点把每根墙切成若干子段（「画墙 → 生成墙面」链路的第一步，切开后每段才能独立处理开口、角落延伸与合并）。
 * minGap（默认 1e-6 像素）是「同一点」级容差，用来吸收浮点误差：落在端点附近或与前一个切点几乎重合的 t 会被丢弃，否则会切出零长度碎片。
 */
export function splitWallSegments(inputWalls, minGap = 0.000001) {
  // 再兜一道 EPSILON 下限：传 0 或负数时仍要有一个能吸收浮点噪声的容差。
  const gapTolerance = Math.max(Number(minGap) || 0, 1e-7);
  const cutTsByWall = inputWalls.map(() => [0, 1]);
  for (let splitWallIndex = 0; splitWallIndex < inputWalls.length; splitWallIndex += 1) {
    for (
      let splitOtherWallIndex = splitWallIndex + 1;
      splitOtherWallIndex < inputWalls.length;
      splitOtherWallIndex += 1
    ) {
      const wall = inputWalls[splitWallIndex];
      const otherWall = inputWalls[splitOtherWallIndex];
      const wallIntersection = segmentIntersection(
        wall.start,
        wall.end,
        otherWall.start,
        otherWall.end
      );
      if (!wallIntersection) {
        continue;
      }
      const selfProjection = projectPointToSegment(wallIntersection, wall.start, wall.end);
      const otherProjection = projectPointToSegment(
        wallIntersection,
        otherWall.start,
        otherWall.end
      );
      if (selfProjection.t > gapTolerance && selfProjection.t < 1 - gapTolerance) {
        cutTsByWall[splitWallIndex].push(selfProjection.t);
      }
      if (otherProjection.t > gapTolerance && otherProjection.t < 1 - gapTolerance) {
        cutTsByWall[splitOtherWallIndex].push(otherProjection.t);
      }
    }
  }
  const pieces = [];
  inputWalls.forEach((sourceWall, sourceWallIndex) => {
    const sourceDirX = sourceWall.end.x - sourceWall.start.x;
    const sourceDirY = sourceWall.end.y - sourceWall.start.y;
    const sortedCutTs = [...cutTsByWall[sourceWallIndex]]
      .sort((cutTLeft, cutTRight) => cutTLeft - cutTRight)
      .filter(
        (currentT, currentIndex, tsList) =>
          currentIndex === 0 || currentT - tsList[currentIndex - 1] > gapTolerance
      );
    for (let pieceIndex = 0; pieceIndex < sortedCutTs.length - 1; pieceIndex += 1) {
      const pieceStartT = sortedCutTs[pieceIndex];
      const pieceEndT = sortedCutTs[pieceIndex + 1];
      if (!(pieceEndT - pieceStartT <= gapTolerance)) {
        pieces.push({
          sourceWall: sourceWall,
          sourceIndex: sourceWallIndex,
          pieceIndex: pieceIndex,
          pieceCount: sortedCutTs.length - 1,
          startT: pieceStartT,
          endT: pieceEndT,
          start: {
            x: sourceWall.start.x + sourceDirX * pieceStartT,
            y: sourceWall.start.y + sourceDirY * pieceStartT
          },
          end: {
            x: sourceWall.start.x + sourceDirX * pieceEndT,
            y: sourceWall.start.y + sourceDirY * pieceEndT
          }
        });
      }
    }
  });
  return pieces;
}
/**
 * 求一根参考墙中「没有被其它共线墙覆盖」的部分，用于画墙时提示重叠。
 * 只有方向叉积归一化后 ≤ 容差、且两端垂距 ≤ 容差的墙才算覆盖；覆盖区间按参数 t 合并后取补集。
 * minLength 兼作绝对长度阈值（调用方传 max(0.75, 每米像素数×0.01)，即重叠超过约 1cm 才提示）与归一化 t 容差。
 */
export function uncoveredCollinearWallSegments(referenceWall, otherWalls, minLength = 0.001) {
  if (!referenceWall?.start || !referenceWall?.end) {
    return [];
  }
  const lengthTolerance = Math.max(Number(minLength) || 0, 1e-7);
  const dirX = referenceWall.end.x - referenceWall.start.x;
  const dirY = referenceWall.end.y - referenceWall.start.y;
  const wallLength = Math.hypot(dirX, dirY);
  if (wallLength <= lengthTolerance) {
    return [];
  }
  const unitDirection = {
    x: dirX / wallLength,
    y: dirY / wallLength
  };
  // 把绝对长度容差换算成 t 空间容差：后续区间比较都在 [0,1] 上做，与墙长无关。
  const normalizedTolerance = lengthTolerance / wallLength;
  const coveredRanges = [];
  for (const overlappingWall of otherWalls || []) {
    if (
      !overlappingWall?.start ||
      !overlappingWall?.end ||
      overlappingWall.id === referenceWall.id
    ) {
      continue;
    }
    const otherDirX = overlappingWall.end.x - overlappingWall.start.x;
    const otherDirY = overlappingWall.end.y - overlappingWall.start.y;
    const otherLength = Math.hypot(otherDirX, otherDirY);
    if (
      otherLength <= lengthTolerance ||
      Math.abs(
        (unitDirection.x * otherDirY) / otherLength - (unitDirection.y * otherDirX) / otherLength
      ) > normalizedTolerance
    ) {
      continue;
    }
    const startOffsetVector = {
      x: overlappingWall.start.x - referenceWall.start.x,
      y: overlappingWall.start.y - referenceWall.start.y
    };
    const endOffsetVector = {
      x: overlappingWall.end.x - referenceWall.start.x,
      y: overlappingWall.end.y - referenceWall.start.y
    };
    const startOffset = Math.abs(
      startOffsetVector.x * unitDirection.y - startOffsetVector.y * unitDirection.x
    );
    const endOffset = Math.abs(
      endOffsetVector.x * unitDirection.y - endOffsetVector.y * unitDirection.x
    );
    if (Math.max(startOffset, endOffset) > lengthTolerance) {
      continue;
    }
    const startProjection =
      (startOffsetVector.x * unitDirection.x + startOffsetVector.y * unitDirection.y) / wallLength;
    const endProjection =
      (endOffsetVector.x * unitDirection.x + endOffsetVector.y * unitDirection.y) / wallLength;
    const rangeStart = clamp(Math.min(startProjection, endProjection), 0, 1);
    const rangeEnd = clamp(Math.max(startProjection, endProjection), 0, 1);
    if (rangeEnd - rangeStart > normalizedTolerance) {
      coveredRanges.push([rangeStart, rangeEnd]);
    }
  }
  if (!coveredRanges.length) {
    return [
      {
        start: {
          ...referenceWall.start
        },
        end: {
          ...referenceWall.end
        }
      }
    ];
  }
  coveredRanges.sort((rangeLeft, rangeRight) => rangeLeft[0] - rangeRight[0]);
  const mergedRanges = [];
  for (const range of coveredRanges) {
    const lastRange = mergedRanges.at(-1);
    if (lastRange && range[0] <= lastRange[1] + normalizedTolerance) {
      lastRange[1] = Math.max(lastRange[1], range[1]);
    } else {
      mergedRanges.push([...range]);
    }
  }
  const gapRanges = [];
  let cursor = 0;
  for (const [mergedRangeStart, mergedRangeEnd] of mergedRanges) {
    if (mergedRangeStart - cursor > normalizedTolerance) {
      gapRanges.push([cursor, mergedRangeStart]);
    }
    cursor = Math.max(cursor, mergedRangeEnd);
  }
  if (1 - cursor > normalizedTolerance) {
    gapRanges.push([cursor, 1]);
  }
  return gapRanges.map(([startT, endT]) => ({
    start: {
      x: referenceWall.start.x + dirX * startT,
      y: referenceWall.start.y + dirY * startT
    },
    end: {
      x: referenceWall.start.x + dirX * endT,
      y: referenceWall.start.y + dirY * endT
    }
  }));
}
/**
 * 生成与「起点 / 绕向」无关的多边形规范化键，用于判定两块墙面本来就是同一块。
 * 坐标四舍五入到 precision 位小数（默认 5，上限 12 因 double 已无有效数字），绝对值小于半个刻度者归零，
 * 否则 -0 与浮点噪声会造出本该相同却不等的键；再取正序 / 逆序循环移位的 2n 个结果中字典序最小者。
 */
export function canonicalPolygonKey(points, precision = 5) {
  if (!Array.isArray(points) || !points.length) {
    return "";
  }
  // 12 位是 double 定点化后仍有意义的极限，再多的位数只会放大浮点噪声。
  const decimals = clamp(Math.round(Number(precision) || 0), 0, 12);
  const coordinateKeys = points.map(polygonPoint => {
    const roundedX =
      Math.abs(Number(polygonPoint?.x) || 0) < 10 ** -decimals / 2
        ? 0
        : Number(polygonPoint?.x) || 0;
    const roundedY =
      Math.abs(Number(polygonPoint?.y) || 0) < 10 ** -decimals / 2
        ? 0
        : Number(polygonPoint?.y) || 0;
    return roundedX.toFixed(decimals) + "," + roundedY.toFixed(decimals);
  });
  const rotationKeys = [];
  for (const sequence of [coordinateKeys, [...coordinateKeys].reverse()]) {
    for (let offsetIndex = 0; offsetIndex < sequence.length; offsetIndex += 1) {
      rotationKeys.push(
        [...sequence.slice(offsetIndex), ...sequence.slice(0, offsetIndex)].join(";")
      );
    }
  }
  return rotationKeys.sort()[0];
}
/**
 * 在两根墙之间寻找唯一一对「几乎重合」的端点。
 * 枚举四种端点配对，只有恰好一对落在容差内才返回：0 对说明没接上，≥2 对说明两墙几乎完全重合、合并方向
 * 不唯一，宁可不合并。接点取两端点中点，避免合并后的坐标在两根墙之间来回漂移。
 */
function matchWallEndpoints(wallA, wallB, endpointTolerance) {
  const matchingPairs = [
    {
      firstKey: "start",
      secondKey: "start"
    },
    {
      firstKey: "start",
      secondKey: "end"
    },
    {
      firstKey: "end",
      secondKey: "start"
    },
    {
      firstKey: "end",
      secondKey: "end"
    }
  ].filter(
    ({ firstKey: wallAEndpointKey, secondKey: wallBEndpointKey }) =>
      distance(wallA[wallAEndpointKey], wallB[wallBEndpointKey]) <= endpointTolerance
  );
  if (matchingPairs.length !== 1) {
    return null;
  }
  const matchedPair = matchingPairs[0];
  return {
    point: {
      x: (wallA[matchedPair.firstKey].x + wallB[matchedPair.secondKey].x) / 2,
      y: (wallA[matchedPair.firstKey].y + wallB[matchedPair.secondKey].y) / 2
    },
    firstKey: matchedPair.firstKey,
    secondKey: matchedPair.secondKey,
    firstOuter: wallA[matchedPair.firstKey === "start" ? "end" : "start"],
    secondOuter: wallB[matchedPair.secondKey === "start" ? "end" : "start"]
  };
}
/**
 * 判断两根墙的「可合并属性」是否一致：高度、厚度、透明度与 allowOpenEnd（数值按容差比较）。
 * 任一不一致都会拼出半截高 / 半截透的接缝；透明度 null 表示「跟随场景默认值」，故两个 null 才相等，
 * 一个 null 一个数字时无法判断最终透明度是否一致，按不兼容处理。
 */
function canMergeWalls(firstWall, secondWall, compatibilityTolerance) {
  const firstOpacity =
    firstWall.opacity === null || firstWall.opacity === undefined
      ? null
      : Number(firstWall.opacity);
  const secondOpacity =
    secondWall.opacity === null || secondWall.opacity === undefined
      ? null
      : Number(secondWall.opacity);
  const isOpacityCompatible =
    firstOpacity === null || secondOpacity === null
      ? firstOpacity === secondOpacity
      : Math.abs(firstOpacity - secondOpacity) <= compatibilityTolerance;
  return (
    Math.abs((Number(firstWall.height) || 0) - (Number(secondWall.height) || 0)) <=
      compatibilityTolerance &&
    Math.abs((Number(firstWall.thickness) || 0) - (Number(secondWall.thickness) || 0)) <=
      compatibilityTolerance &&
    isOpacityCompatible &&
    (firstWall.allowOpenEnd === true) == (secondWall.allowOpenEnd === true)
  );
}
/**
 * 统计接点附近有多少个墙端点（即该节点的度数）。
 * 合并要求接点处恰好只有这 2 个端点：3 个以上说明这里是 T 形 / 十字路口，合并会吞掉第三根墙的接头；1 个以下说明两墙其实并未真正相接。
 */
function countEndpointsNearPoint(incidentWallEntries, probePoint, proximityTolerance) {
  return incidentWallEntries.reduce(
    (count, nearbyWall) =>
      count +
      (distance(nearbyWall.wall.start, probePoint) <= proximityTolerance ? 1 : 0) +
      (distance(nearbyWall.wall.end, probePoint) <= proximityTolerance ? 1 : 0),
    0
  );
}
/**
 * 判断端点配对是否构成「发夹接头」：两墙几乎反向又几乎共线，合并会得到零长墙或方向翻转的墙，必须排除。
 * 判据是外侧端点方向点积 < 0 且叉积绝对值 ≤ 容差 × 较长边长 —— 乘长度把叉积归一化成夹角正弦，使同一
 * 容差在长短墙上表示同一角度；下限 1 防止墙极短时容差退化为 0。
 */
function isHairpinJoin(endpointMatch, hairpinTolerance) {
  const firstOuterVector = subtractPoints(endpointMatch.firstOuter, endpointMatch.point);
  const secondOuterVector = subtractPoints(endpointMatch.secondOuter, endpointMatch.point);
  const firstOuterLength = Math.hypot(firstOuterVector.x, firstOuterVector.y);
  const secondOuterLength = Math.hypot(secondOuterVector.x, secondOuterVector.y);
  if (firstOuterLength <= hairpinTolerance || secondOuterLength <= hairpinTolerance) {
    return false;
  }
  const crossMagnitude = Math.abs(crossProduct(firstOuterVector, secondOuterVector));
  return (
    firstOuterVector.x * secondOuterVector.x + firstOuterVector.y * secondOuterVector.y < 0 &&
    crossMagnitude <= hairpinTolerance * Math.max(firstOuterLength, secondOuterLength, 1)
  );
}
/**
 * 合并同一平面内共线、且仅在端点相接的墙，反复扫描直到没有可合并的一对，减少墙数量。
 * 每次合并须同时满足：属性兼容、端点唯一配对、接点度数恰为 2、不是发夹接头 —— 缺一条都会破坏墙体拓扑
 * （T 形路口被吞、零长墙、半截属性），宁可不合并；mergeDistanceTolerance 只吸收浮点误差，不做模糊匹配。
 */
export function mergeCollinearWallSegments(sourceWalls, mergeDistanceTolerance = 0.000001) {
  const mergeTolerance = Math.max(Number(mergeDistanceTolerance) || 0, 1e-7);
  // 先剔除零长墙（两端距离 ≤ 容差），再深拷贝每条墙及其端点：合并过程会就地改写
  // 中间结果，绝不能污染调用方的场景数据。sourceIds 记录该墙由哪些原始 id 合成，
  // 供最后的 wallIdMap 回溯。
  const workList = (sourceWalls || [])
    .filter(
      rawWall =>
        rawWall?.start && rawWall?.end && distance(rawWall.start, rawWall.end) > mergeTolerance
    )
    .map(clonedWall => ({
      wall: {
        ...clonedWall,
        start: {
          ...clonedWall.start
        },
        end: {
          ...clonedWall.end
        }
      },
      sourceIds: new Set([clonedWall.id])
    }));
  let didMerge = true;
  while (didMerge) {
    didMerge = false;
    for (let leftIndex = 0; leftIndex < workList.length && !didMerge; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < workList.length; rightIndex += 1) {
        const leftEntry = workList[leftIndex];
        const rightEntry = workList[rightIndex];
        if (!canMergeWalls(leftEntry.wall, rightEntry.wall, mergeTolerance)) {
          continue;
        }
        const mergeMatch = matchWallEndpoints(leftEntry.wall, rightEntry.wall, mergeTolerance);
        if (
          !mergeMatch ||
          countEndpointsNearPoint(workList, mergeMatch.point, mergeTolerance) !== 2 ||
          !isHairpinJoin(mergeMatch, mergeTolerance)
        ) {
          continue;
        }
        const mergedWall = {
          ...leftEntry.wall,
          start:
            mergeMatch.firstKey === "end"
              ? {
                  ...mergeMatch.firstOuter
                }
              : {
                  ...mergeMatch.secondOuter
                },
          end:
            mergeMatch.firstKey === "end"
              ? {
                  ...mergeMatch.secondOuter
                }
              : {
                  ...mergeMatch.firstOuter
                }
        };
        workList[leftIndex] = {
          wall: mergedWall,
          sourceIds: new Set([...leftEntry.sourceIds, ...rightEntry.sourceIds])
        };
        workList.splice(rightIndex, 1);
        didMerge = true;
        break;
      }
    }
  }
  const wallIdBySourceId = new Map();
  for (const mergedEntry of workList) {
    for (const sourceId of mergedEntry.sourceIds) {
      wallIdBySourceId.set(sourceId, mergedEntry.wall.id);
    }
  }
  return {
    walls: workList.map(resultEntry => resultEntry.wall),
    wallIdMap: wallIdBySourceId
  };
}
/**
 * 把挂在某根墙上的附件（门 / 窗 / 栏杆等）重新定位到合并后的新墙。
 * 附件用归一化参数 t 表示，原墙合并后 t 不能复用：先把 t 还原成平面点，再投影到目标墙求新 t 并夹回 [0,1]，
 * 这样即使新墙方向被反转（start / end 对调）位置依然正确；任一入参缺失时原样返回，交调用方兜底。
 */
export function remapWallAttachment(attachment, fromWall, destinationWall) {
  if (!attachment || !fromWall || !destinationWall) {
    return attachment;
  }
  const attachmentT = clamp(Number(attachment.t) || 0, 0, 1);
  const pointOnSourceWall = lerpPoint(fromWall.start, fromWall.end, attachmentT);
  return {
    ...attachment,
    wallId: destinationWall.id,
    t: clamp(
      projectPointToSegment(pointOnSourceWall, destinationWall.start, destinationWall.end).t,
      0,
      1
    )
  };
}
/**
 * 在候选点里找出离查询点最近、且不超过 maxDistance 的一个。
 * 比较写成 `!(dist > maxDistance)` 与 `!(dist >= best.distance)`，即「不严格更远就接受、严格更近才替换」：
 * 多个候选同样近（如相邻墙的公共端点）时保留先到者，让吸附结果稳定、不随遍历顺序抖动。
 */
function findNearestCandidate(queryPoint, candidates, maxDistance) {
  let bestCandidate = null;
  for (const snapCandidate of candidates) {
    const candidateDistance = distance(queryPoint, snapCandidate.point);
    if (
      !(candidateDistance > maxDistance) &&
      (!bestCandidate || !(candidateDistance >= bestCandidate.distance))
    ) {
      bestCandidate = {
        ...snapCandidate,
        distance: candidateDistance
      };
    }
  }
  return bestCandidate;
}
/**
 * 把自由点沿就近的坐标轴锁到锚点上，得到「水平 / 垂直二选一」的正交结果：位移较大的分量所在轴保留
 * （点仍可沿该轴移动），另一分量压到锚点坐标；相等时归入垂直轴（锁 x）。label 是展示给用户的中文提示，
 * 不是标识符，不要拿它做逻辑判断。@returns {{point, axis, label}} 锁定后的点、轴名与中文标签。
 */
export function axisLockedPoint(freePoint, lockedAnchor) {
  const deltaX = freePoint.x - lockedAnchor.x;
  const deltaY = freePoint.y - lockedAnchor.y;
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    return {
      point: {
        x: freePoint.x,
        y: lockedAnchor.y
      },
      axis: "horizontal",
      label: "水平轴"
    };
  } else {
    return {
      point: {
        x: lockedAnchor.x,
        y: freePoint.y
      },
      axis: "vertical",
      label: "垂直轴"
    };
  }
}
/**
 * 在墙列表里找与「正交轴锁定」结果最接近的吸附点。
 * 墙在锁定轴方向退化（近似垂直于锁定轴）时要求墙自身坐标与锚点同轴，否则会吸到看不见的位置，再投影求最近点；
 * 否则把锚点代入墙的参数方程求 t，越界即交点不在墙上。两分支都用与 findNearestCandidate 相同的比较保证稳定。
 */
function findAxisSnapOnWalls(snapQueryPoint, snapAnchor, targetWalls, snapDistanceLimit, axis) {
  let bestSnap = null;
  for (const snapWall of targetWalls) {
    const axisKey = axis === "vertical" ? "x" : "y";
    const crossAxisKey = axis === "vertical" ? "y" : "x";
    const wallDelta = snapWall.end[axisKey] - snapWall.start[axisKey];
    if (Math.abs(wallDelta) <= 1e-7) {
      if (Math.abs(snapWall.start[axisKey] - snapAnchor[axisKey]) > 1e-7) {
        continue;
      }
      const snapProjection = projectPointToSegment(snapQueryPoint, snapWall.start, snapWall.end);
      if (
        snapProjection.distance > snapDistanceLimit ||
        (bestSnap && snapProjection.distance >= bestSnap.distance)
      ) {
        continue;
      }
      bestSnap = {
        point: {
          ...snapProjection.point,
          [axisKey]: snapAnchor[axisKey]
        },
        kind: "segment",
        targetId: snapWall.id,
        label: (axis === "vertical" ? "垂直" : "水平") + " · 墙线",
        distance: snapProjection.distance
      };
      continue;
    }
    // 把锚点坐标代入墙的参数方程，求锚点在墙上的归一化位置 t。
    const wallT = (snapAnchor[axisKey] - snapWall.start[axisKey]) / wallDelta;
    if (wallT < -1e-7 || wallT > 1.0000001) {
      continue;
    }
    const lockedPoint = {
      ...snapAnchor
    };
    lockedPoint[crossAxisKey] =
      snapWall.start[crossAxisKey] +
      (snapWall.end[crossAxisKey] - snapWall.start[crossAxisKey]) * clamp(wallT, 0, 1);
    const lockedDistance = distance(snapQueryPoint, lockedPoint);
    if (
      !(lockedDistance > snapDistanceLimit) &&
      (!bestSnap || !(lockedDistance >= bestSnap.distance))
    ) {
      bestSnap = {
        point: lockedPoint,
        kind: "segment",
        targetId: snapWall.id,
        label: (axis === "vertical" ? "垂直" : "水平") + " · 墙线",
        distance: lockedDistance
      };
    }
  }
  return bestSnap;
}
/**
 * 垂直轴优先吸附：光标与锚点的横向偏差在容差内时，优先给出竖直方向的吸附。
 * 先查墙线（findAxisSnapOnWalls），命中不了再退化成纯垂直轴提示；兜底分支的距离取横向偏差本身，使返回值的 distance 语义始终是「吸附点与原始光标点的距离」。
 */
function findVerticalAxisSnap(pointInput, verticalAnchor, wallSegments, verticalSnapDistance) {
  if (!verticalAnchor || Math.abs(pointInput.x - verticalAnchor.x) > verticalSnapDistance) {
    return null;
  }
  const verticalSnap = findAxisSnapOnWalls(
    pointInput,
    verticalAnchor,
    wallSegments,
    verticalSnapDistance,
    "vertical"
  );
  return (
    verticalSnap || {
      point: {
        x: verticalAnchor.x,
        y: pointInput.y
      },
      kind: "axis",
      label: "垂直轴",
      distance: Math.abs(pointInput.x - verticalAnchor.x)
    }
  );
}
/**
 * 强制正交约束下的吸附：在「轴锁定 + 锚点」限定的一条直线上找最近的特征点。
 * 候选只保留与锚点在锁定轴坐标上相同的端点与交点（筛选用吸附距离的百万分之一作坐标容差，远小于可感知
 * 像素偏移），确保候选落在正交线上；够不着时退回墙线吸附，仍无命中就返回轴锁定点本身（kind = "axis"）。
 */
function findOrthogonalAxisSnap(
  cursorPoint,
  orthogonalAnchor,
  wallGeometry,
  orthogonalSnapDistance,
  knownIntersections = wallIntersections(wallGeometry),
  options = {}
) {
  const axisLock = axisLockedPoint(cursorPoint, orthogonalAnchor);
  const lockAxisKey = axisLock.axis === "vertical" ? "x" : "y";
  const coordinateTolerance = Math.max(1e-7, orthogonalSnapDistance * 0.000001);
  const axisLabel = axisLock.axis === "vertical" ? "垂直" : "水平";
  const orthoCandidates = [
    ...(options.snapEndpoints === false
      ? []
      : wallGeometry.flatMap(endpointCandidateWall => [
          {
            point: endpointCandidateWall.start,
            kind: "endpoint",
            targetId: endpointCandidateWall.id,
            label: axisLabel + " · 端点"
          },
          {
            point: endpointCandidateWall.end,
            kind: "endpoint",
            targetId: endpointCandidateWall.id,
            label: axisLabel + " · 端点"
          }
        ])),
    ...(options.snapIntersections === false
      ? []
      : knownIntersections.map(intersectionPoint => ({
          point: intersectionPoint,
          kind: "intersection",
          label: axisLabel + " · 交点"
        })))
  ].filter(
    orthoCandidate =>
      Math.abs(orthoCandidate.point[lockAxisKey] - orthogonalAnchor[lockAxisKey]) <=
      coordinateTolerance
  );
  const endpointSnap = findNearestCandidate(cursorPoint, orthoCandidates, orthogonalSnapDistance);
  if (endpointSnap) {
    return endpointSnap;
  }
  if (options.snapSegments !== false) {
    const orthogonalSnap = findAxisSnapOnWalls(
      cursorPoint,
      orthogonalAnchor,
      wallGeometry,
      orthogonalSnapDistance,
      axisLock.axis
    );
    if (orthogonalSnap) {
      return orthogonalSnap;
    }
  }
  return {
    ...axisLock,
    kind: "axis",
    distance: distance(cursorPoint, axisLock.point)
  };
}
/**
 * 平面绘制的统一吸附入口：按优先级依次尝试各类吸附，返回第一个命中。
 * 顺序即优先级：强制正交轴 → 端点 → 交点 → 垂直轴 → 墙线 → 角度 → 网格 → 不吸附，体现「越结构化的特征
 * 越优先」；屏幕容差除以 zoom 换算成平面容差，使各缩放级别手感一致；子步骤可由 snapOptions 单独关闭。
 */
export function snapPoint(pointToSnap, wallShapes, snapOptions = {}) {
  const zoomScale = Math.max(Number(snapOptions.zoom) || 1, 1e-7);
  // 屏幕容差（默认 12px）换算成平面距离：视图放得越大，同样的像素容差对应的世界距离越小。
  const worldTolerance = (Number(snapOptions.screenTolerance) || 12) / zoomScale;
  const intersections = Array.isArray(snapOptions.intersections) ? snapOptions.intersections : null;
  if (snapOptions.forceOrthogonalAxis === true && snapOptions.anchor) {
    const orthogonalIntersections =
      snapOptions.snapIntersections === false ? [] : intersections || wallIntersections(wallShapes);
    return findOrthogonalAxisSnap(
      pointToSnap,
      snapOptions.anchor,
      wallShapes,
      worldTolerance,
      orthogonalIntersections,
      snapOptions
    );
  }
  const endpointCandidates = [];
  if (snapOptions.snapEndpoints !== false) {
    for (const endpointSourceWall of wallShapes) {
      endpointCandidates.push(
        {
          point: endpointSourceWall.start,
          kind: "endpoint",
          targetId: endpointSourceWall.id,
          label: "端点"
        },
        {
          point: endpointSourceWall.end,
          kind: "endpoint",
          targetId: endpointSourceWall.id,
          label: "端点"
        }
      );
    }
  }
  const endpointSnapResult = findNearestCandidate(pointToSnap, endpointCandidates, worldTolerance);
  if (endpointSnapResult) {
    return endpointSnapResult;
  }
  if (snapOptions.snapIntersections !== false) {
    const intersectionSnap = findNearestCandidate(
      pointToSnap,
      (intersections || wallIntersections(wallShapes)).map(snapIntersection => ({
        point: snapIntersection,
        kind: "intersection",
        label: "交点"
      })),
      worldTolerance
    );
    if (intersectionSnap) {
      return intersectionSnap;
    }
  }
  if (
    snapOptions.preferVerticalAxis === true &&
    snapOptions.snapOrthogonal !== false &&
    snapOptions.anchor
  ) {
    const verticalAxisSnap = findVerticalAxisSnap(
      pointToSnap,
      snapOptions.anchor,
      wallShapes,
      worldTolerance
    );
    if (verticalAxisSnap) {
      return verticalAxisSnap;
    }
  }
  if (snapOptions.snapSegments !== false) {
    const segmentSnap = wallShapes
      .map(segmentWall => {
        const segmentProjection = projectPointToSegment(
          pointToSnap,
          segmentWall.start,
          segmentWall.end
        );
        return {
          point: segmentProjection.point,
          kind: "segment",
          targetId: segmentWall.id,
          label: "墙线",
          distance: segmentProjection.distance
        };
      })
      .filter(segmentCandidate => segmentCandidate.distance <= worldTolerance)
      .sort(
        (leftSegCandidate, rightSegCandidate) =>
          leftSegCandidate.distance - rightSegCandidate.distance
      )[0];
    if (segmentSnap) {
      return segmentSnap;
    }
  }
  if (snapOptions.snapAngles !== false && snapOptions.anchor) {
    const anchorDeltaX = pointToSnap.x - snapOptions.anchor.x;
    const anchorDeltaY = pointToSnap.y - snapOptions.anchor.y;
    const anchorDistance = Math.hypot(anchorDeltaX, anchorDeltaY);
    if (anchorDistance > 1e-7) {
      // 角度吸附步长默认 15°，与设置面板里提供的可选步长保持一致。
      const angleStepRad = ((Number(snapOptions.angleStepDegrees) || 15) * Math.PI) / 180;
      const pointerAngleRad = Math.atan2(anchorDeltaY, anchorDeltaX);
      const snappedAngleRad = Math.round(pointerAngleRad / angleStepRad) * angleStepRad;
      const angleSnapPoint = {
        x: snapOptions.anchor.x + Math.cos(snappedAngleRad) * anchorDistance,
        y: snapOptions.anchor.y + Math.sin(snappedAngleRad) * anchorDistance
      };
      const angleSnapDistance = distance(pointToSnap, angleSnapPoint);
      if (angleSnapDistance <= worldTolerance) {
        // 先归一到 [0, 360) 再取整，避免标签出现 -0° 或 360° 这种反直觉的读法。
        const snappedAngleDeg = ((snappedAngleRad * 180) / Math.PI + 360) % 360;
        return {
          point: angleSnapPoint,
          kind: "angle",
          label: Math.round(snappedAngleDeg) + "°",
          distance: angleSnapDistance
        };
      }
    }
  }
  const gridSize = Number(snapOptions.gridSize) || 0;
  if (snapOptions.snapGrid !== false && gridSize > 1e-7) {
    const gridPoint = {
      x: Math.round(pointToSnap.x / gridSize) * gridSize,
      y: Math.round(pointToSnap.y / gridSize) * gridSize
    };
    const gridSnapDistance = distance(pointToSnap, gridPoint);
    if (gridSnapDistance <= worldTolerance) {
      return {
        point: gridPoint,
        kind: "grid",
        label: "网格",
        distance: gridSnapDistance
      };
    }
  }
  return {
    point: {
      ...pointToSnap
    },
    kind: null,
    label: "",
    distance: 0
  };
}
/**
 * 找出离参考点最近的墙（连同墙上的投影点与参数 t）。
 * maxWallDistance 默认 Infinity，命中检测时由调用方限制范围；距离比较沿用 findNearestCandidate 的写法：等距时保留先遍历到的墙，结果稳定。
 */
export function nearestWall(referencePoint, wallCandidates, maxWallDistance = Infinity) {
  let nearestHit = null;
  for (const hitWall of wallCandidates) {
    const wallProjection = projectPointToSegment(referencePoint, hitWall.start, hitWall.end);
    if (
      !(wallProjection.distance > maxWallDistance) &&
      (!nearestHit || !(wallProjection.distance >= nearestHit.distance))
    ) {
      nearestHit = {
        wall: hitWall,
        ...wallProjection
      };
    }
  }
  return nearestHit;
}
/**
 * 把墙的平面像素长度换算成米。
 * pixelsPerMeter 是场景标定出的唯一换算系数；未标定（0 / NaN / 负数）时兜底为 1，保证除法不会得到 0、NaN 或负长度 —— 此时数值没有物理意义但流程仍能走完（上层会因为标定为 0 而不显示真实尺寸标注）。
 */
export function wallLengthMeters(measuredWall, pixelsPerMeter) {
  return (
    distance(measuredWall.start, measuredWall.end) / Math.max(Number(pixelsPerMeter) || 1, 1e-7)
  );
}
/**
 * 把开口在墙上的归一化位置 t 夹到「洞口不越出墙端」的合法区间。
 * 合法区间由半个洞口宽决定：halfWidth 取洞口宽的一半与墙长一半的较小值，于是超宽洞口（比墙还长）退化成居中放置而不是报错；墙长为 0 时直接返回 0.5。
 * 门窗沿墙拖动时都走这里，保证无论怎么拖，洞口都不会跑到墙外。
 */
export function clampWindowT(openingWall, windowOpening, pixelsPerMeterReference) {
  const openingWallLength = wallLengthMeters(openingWall, pixelsPerMeterReference);
  if (openingWallLength <= 1e-7) {
    return 0.5;
  }
  const halfWidth = Math.min(
    Math.max(Number(windowOpening.width) || 0, 0) / 2,
    openingWallLength / 2
  );
  return clamp(
    Number(windowOpening.t) || 0,
    halfWidth / openingWallLength,
    1 - halfWidth / openingWallLength
  );
}
/**
 * 计算门扇的开启角（弧度），由门的 swing 决定往哪一侧开。
 * swing === -1（反向开启）取正角，其余取负角，绝对值为 maxAngleRad（默认 90°）；这里只表达平面图上的开启方向指示、不按开启百分比插值 —— 真实开启比例由三维动画另行驱动，两者刻意解耦。
 */
export function doorLeafRotation(door, maxAngleRad = Math.PI / 2) {
  return -(door?.swing === -1 ? -1 : 1) * maxAngleRad;
}
/**
 * 计算每根墙两端向外延伸多少，把同一个角上的墙体接缝补严（单位米，渲染时乘 pixelsPerMeter）。
 * 端点按容差聚成节点后，对同一节点上相邻两边按斜接关系算出外伸量 (t_other + t_self·cosθ)/sinθ，使两墙
 * 外侧棱相交；外伸上限为半墙厚 × maxExtensionRatio（默认 4），不截断则夹角极小时墙角会甩出长刺。
 */
export function wallJoinExtensions(wallEntries, junctionTolerance = 0.001, maxExtensionRatio = 4) {
  const joinTolerance = Math.max(Number(junctionTolerance) || 0, 1e-7);
  const extensionRatioLimit = Math.max(Number(maxExtensionRatio) || 0, 1);
  const extensionsByWallId = Object.fromEntries(
    (wallEntries || []).map(wallEntry => [
      wallEntry.id,
      {
        start: 0,
        end: 0
      }
    ])
  );
  const junctions = [];
  // 按容差把墙端点归并到「节点」：线性扫描已登记的节点，取距离 ≤ joinTolerance 的那个，
  // 命中即复用（同一墙角上的多条墙由此共享一个节点，斜接才会一起算）；
  // 未命中则新建节点登记。incidents 由调用方继续 push 各墙在该节点处的入射信息。
  const getJunction = endpointPoint => {
    let junction = junctions.find(
      matchingJunction => distance(matchingJunction.point, endpointPoint) <= joinTolerance
    );
    if (!junction) {
      junction = {
        point: {
          ...endpointPoint
        },
        incidents: []
      };
      junctions.push(junction);
    }
    return junction;
  };
  for (const extendedWallEntry of wallEntries || []) {
    const wallDirX = extendedWallEntry.end.x - extendedWallEntry.start.x;
    const wallDirY = extendedWallEntry.end.y - extendedWallEntry.start.y;
    const wallSpanLength = Math.hypot(wallDirX, wallDirY);
    if (wallSpanLength <= joinTolerance) {
      continue;
    }
    const halfThickness = Math.max(Number(extendedWallEntry.thickness) || 0, 0) / 2;
    getJunction(extendedWallEntry.start).incidents.push({
      wallId: extendedWallEntry.id,
      endpoint: "start",
      x: wallDirX / wallSpanLength,
      y: wallDirY / wallSpanLength,
      halfThickness: halfThickness
    });
    getJunction(extendedWallEntry.end).incidents.push({
      wallId: extendedWallEntry.id,
      endpoint: "end",
      x: -wallDirX / wallSpanLength,
      y: -wallDirY / wallSpanLength,
      halfThickness: halfThickness
    });
  }
  // 0.0001（约 0.006°）用来把「几乎平行 / 几乎反向」的相邻边排除掉：
  // 这类边做斜接会得到无穷长的外伸，没有意义。
  const SIN_TOLERANCE = 0.0001;
  for (const incidentJunction of junctions) {
    if (incidentJunction.incidents.length < 2) {
      continue;
    }
    const sortedIncidents = incidentJunction.incidents
      .map(incident => ({
        ...incident,
        angle: Math.atan2(incident.y, incident.x)
      }))
      .sort((incidentLeft, incidentRight) => incidentLeft.angle - incidentRight.angle);
    for (let incidentIndex = 0; incidentIndex < sortedIncidents.length; incidentIndex += 1) {
      const currentIncident = sortedIncidents[incidentIndex];
      const nextIncident = sortedIncidents[(incidentIndex + 1) % sortedIncidents.length];
      const gapAngleRad =
        (nextIncident.angle - currentIncident.angle + Math.PI * 2) % (Math.PI * 2);
      if (gapAngleRad <= SIN_TOLERANCE || gapAngleRad >= Math.PI - SIN_TOLERANCE) {
        continue;
      }
      const sinGap = Math.sin(gapAngleRad);
      const cosGap = Math.cos(gapAngleRad);
      if (sinGap <= SIN_TOLERANCE) {
        continue;
      }
      const maxExtension =
        Math.max(currentIncident.halfThickness, nextIncident.halfThickness, 0.000001) *
        extensionRatioLimit;
      const incidentExtension = clamp(
        (nextIncident.halfThickness + currentIncident.halfThickness * cosGap) / sinGap,
        0,
        maxExtension
      );
      const nextExtension = clamp(
        (currentIncident.halfThickness + nextIncident.halfThickness * cosGap) / sinGap,
        0,
        maxExtension
      );
      extensionsByWallId[currentIncident.wallId][currentIncident.endpoint] = Math.max(
        extensionsByWallId[currentIncident.wallId][currentIncident.endpoint],
        incidentExtension
      );
      extensionsByWallId[nextIncident.wallId][nextIncident.endpoint] = Math.max(
        extensionsByWallId[nextIncident.wallId][nextIncident.endpoint],
        nextExtension
      );
    }
  }
  return extensionsByWallId;
}
/**
 * 把一根墙按开口（门 / 窗 / 洞口）切成若干实心块，供三维建模使用。
 * 先在沿墙长度方向收集所有分界点（墙两端 + 每个开口左右边），再把每个子区间在高度方向用该处开口区间求补，
 * 于是墙裙、过梁与墙垛各自成块（互不重叠，可直接挤出并用于遮挡 / 阴影）；开口宽高一律夹进墙长与层高。
 */
export function wallSolidPieces(targetWall, openings, pixelsPerMeterScale, wallHeightMeters) {
  const wallLengthValue = wallLengthMeters(targetWall, pixelsPerMeterScale);
  const wallHeight = Math.max(Number(wallHeightMeters) || 0, 0);
  if (wallLengthValue <= 1e-7 || wallHeight <= 1e-7) {
    return [];
  }
  const openingSpans = openings
    .filter(opening => opening.wallId === targetWall.id)
    .map(mappedOpening => {
      const openingWidth = clamp(Number(mappedOpening.width) || 0, 0, wallLengthValue);
      const openingCenter =
        clampWindowT(targetWall, mappedOpening, pixelsPerMeterScale) * wallLengthValue;
      const openingSill = clamp(Number(mappedOpening.sill) || 0, 0, wallHeight);
      const openingTop = clamp(
        openingSill + Math.max(Number(mappedOpening.height) || 0, 0),
        openingSill,
        wallHeight
      );
      return {
        start: clamp(openingCenter - openingWidth / 2, 0, wallLengthValue),
        end: clamp(openingCenter + openingWidth / 2, 0, wallLengthValue),
        bottom: openingSill,
        top: openingTop
      };
    })
    .filter(
      openingSpan =>
        openingSpan.end - openingSpan.start > 1e-7 && openingSpan.top - openingSpan.bottom > 1e-7
    );
  const boundaries = [
    ...new Set([
      0,
      wallLengthValue,
      ...openingSpans.flatMap(boundarySpan => [boundarySpan.start, boundarySpan.end])
    ])
  ].sort((boundaryLeft, boundaryRight) => boundaryLeft - boundaryRight);
  const solidPieces = [];
  for (let boundaryIndex = 0; boundaryIndex < boundaries.length - 1; boundaryIndex += 1) {
    const spanStart = boundaries[boundaryIndex];
    const spanEnd = boundaries[boundaryIndex + 1];
    if (spanEnd - spanStart <= 1e-7) {
      continue;
    }
    // 用区间中点判定该子段落在哪些开口的横向范围内，避免边界骑缝时归属含糊。
    const spanMidpoint = (spanStart + spanEnd) / 2;
    const overlappingSpans = openingSpans
      .filter(
        overlapSpan =>
          spanMidpoint > overlapSpan.start - 1e-7 && spanMidpoint < overlapSpan.end + 1e-7
      )
      .map(mappedOverlap => [mappedOverlap.bottom, mappedOverlap.top])
      .sort((spanLeft, spanRight) => spanLeft[0] - spanRight[0]);
    if (!overlappingSpans.length) {
      solidPieces.push({
        start: spanStart,
        end: spanEnd,
        bottom: 0,
        top: wallHeight
      });
      continue;
    }
    const mergedVerticalSpans = [];
    for (const verticalSpan of overlappingSpans) {
      const lastVerticalSpan = mergedVerticalSpans.at(-1);
      if (lastVerticalSpan && verticalSpan[0] <= lastVerticalSpan[1] + 1e-7) {
        lastVerticalSpan[1] = Math.max(lastVerticalSpan[1], verticalSpan[1]);
      } else {
        mergedVerticalSpans.push([...verticalSpan]);
      }
    }
    let verticalCursor = 0;
    for (const [verticalSpanStart, verticalSpanEnd] of mergedVerticalSpans) {
      if (verticalSpanStart - verticalCursor > 1e-7) {
        solidPieces.push({
          start: spanStart,
          end: spanEnd,
          bottom: verticalCursor,
          top: verticalSpanStart
        });
      }
      verticalCursor = Math.max(verticalCursor, verticalSpanEnd);
    }
    if (wallHeight - verticalCursor > 1e-7) {
      solidPieces.push({
        start: spanStart,
        end: spanEnd,
        bottom: verticalCursor,
        top: wallHeight
      });
    }
  }
  return solidPieces;
}
/**
 * 判断平面点是否落在「可旋转矩形」内。
 * 把点绕矩形中心反向旋转 -rotation 回到矩形自身坐标轴再与半宽 / 半深比较；用反向变换而非构造四角做凸多边形
 * 判定，是因为三角函数误差不会在四个角累积，也省掉一次包含计算。rect 宽深是米，乘 scale 得平面像素尺寸。
 */
export function pointInRotatedRectangle(worldPoint, rect, scale) {
  // 旋转角取反：把点转回矩形自身的坐标轴，rotation 以度为单位。
  const inverseRotationRad = (-(Number(rect.rotation) || 0) * Math.PI) / 180;
  const localDeltaX = worldPoint.x - rect.x;
  const localDeltaY = worldPoint.y - rect.y;
  const alignedX =
    localDeltaX * Math.cos(inverseRotationRad) - localDeltaY * Math.sin(inverseRotationRad);
  const alignedY =
    localDeltaX * Math.sin(inverseRotationRad) + localDeltaY * Math.cos(inverseRotationRad);
  // 半宽 / 半深：米换算成平面像素后取一半，作为局部坐标下的比较边界。
  const halfBoxWidth = (Math.max(Number(rect.width) || 0, 0) * scale) / 2;
  // 半深：同样由米换算成平面像素再取一半。
  const halfBoxDepth = (Math.max(Number(rect.depth) || 0, 0) * scale) / 2;
  // 两个方向都落在半个盒体内才算命中，这一步等价于「点在矩形内」。
  return Math.abs(alignedX) <= halfBoxWidth && Math.abs(alignedY) <= halfBoxDepth;
}
/**
 * 拖拽四角手柄缩放可旋转物件，返回新的中心与宽深（可等比）。
 * 全在物件局部坐标系里算：指针位移反向旋转后乘角点符号（拖右上与拖左下生成方向相反）得沿宽 / 深的增量，
 * 再除以像素比例换算成米；宽深夹在 [最小尺寸, 8m]（默认 0.1m 防拖成零厚度）；等比按较大倍数统一缩放，中心从对角锚点推出半个新尺寸，故对角点始终不动。
 */
export function resizeRotatedItemFromCorner(
  item,
  cornerSign,
  anchorPoint,
  pointerPoint,
  cornerPixelsPerMeter,
  isUniformScale = false,
  resizeOptions = {}
) {
  const pixelScale = Math.max(Number(cornerPixelsPerMeter) || 0, 1e-7);
  const signX = cornerSign?.x < 0 ? -1 : 1;
  const signY = cornerSign?.y < 0 ? -1 : 1;
  // 同样先把指针位移反向旋转到物件的局部坐标轴（rotation 为角度制）。
  const itemInverseRotationRad = (-(Number(item.rotation) || 0) * Math.PI) / 180;
  const pointerDeltaX = pointerPoint.x - anchorPoint.x;
  const pointerDeltaY = pointerPoint.y - anchorPoint.y;
  const rotatedDeltaX =
    pointerDeltaX * Math.cos(itemInverseRotationRad) -
    pointerDeltaY * Math.sin(itemInverseRotationRad);
  const rotatedDeltaY =
    pointerDeltaX * Math.sin(itemInverseRotationRad) +
    pointerDeltaY * Math.cos(itemInverseRotationRad);
  // 局部位移乘角点符号后换算成米：拖右上角（符号为正）时宽深都随指针增大。
  const deltaWidthMeters = (signX * rotatedDeltaX) / pixelScale;
  // 深度的局部增量同样乘角点符号后换算成米，与宽度各自独立。
  const deltaDepthMeters = (signY * rotatedDeltaY) / pixelScale;
  const minDimension = Math.max(Number(resizeOptions.minimumDimension) || 0.1, 1e-7);
  const itemWidth = Math.max(Number(item.width) || minDimension, minDimension);
  const itemDepth = Math.max(Number(item.depth) || minDimension, minDimension);
  const itemHeight = Number(item.height);
  let newWidth = clamp(deltaWidthMeters, minDimension, 8);
  let newDepth = clamp(deltaDepthMeters, minDimension, 8);
  let uniformScale = 1;
  if (isUniformScale) {
    const minScale = Math.max(Number(resizeOptions.minimum) || 0, 1e-7);
    const maxScale = Math.max(Number(resizeOptions.maximum) || Number.POSITIVE_INFINITY, minScale);
    uniformScale = clamp(
      Math.max(deltaWidthMeters / itemWidth, deltaDepthMeters / itemDepth),
      minScale,
      maxScale
    );
    newWidth = itemWidth * uniformScale;
    newDepth = itemDepth * uniformScale;
  }
  // 新中心 = 对角锚点沿旋转后的宽 / 深方向推出半个新尺寸，保证锚点不动。
  const offsetX = (signX * newWidth * pixelScale) / 2;
  // 深度方向的半尺寸偏移，同样沿旋转后的局部轴推出。
  const offsetY = (signY * newDepth * pixelScale) / 2;
  // 物件自身的旋转角（度转弧度），用于把局部位移还原到平面方向。
  const rotationRad = ((Number(item.rotation) || 0) * Math.PI) / 180;
  const resizedItem = {
    x: anchorPoint.x + offsetX * Math.cos(rotationRad) - offsetY * Math.sin(rotationRad),
    y: anchorPoint.y + offsetX * Math.sin(rotationRad) + offsetY * Math.cos(rotationRad),
    width: newWidth,
    depth: newDepth
  };
  if (Number.isFinite(itemHeight) && itemHeight > 0) {
    resizedItem.height = isUniformScale ? itemHeight * uniformScale : itemHeight;
  }
  return resizedItem;
}
/**
 * 由两个指针的位置关系推算物件的绝对旋转角（度）。
 * 语义是「指针连线转多少，物件就转多少」：两次 atan2 得双指相对轴心的夹角变化，叠加到手势开始的基准角上。
 * 可选吸附步长（默认 0）把结果取整到步长整数倍（便于对齐 15° / 45°）；最后归一到 [0, 360) 以防上层比较失配。
 */
export function itemRotationFromPointers(
  baseRotationDeg,
  pivotPoint,
  firstPointer,
  secondPointer,
  angleStepDeg = 0
) {
  const firstAngleRad = Math.atan2(firstPointer.y - pivotPoint.y, firstPointer.x - pivotPoint.x);
  const secondAngleRad = Math.atan2(secondPointer.y - pivotPoint.y, secondPointer.x - pivotPoint.x);
  let rotationDeg =
    (Number(baseRotationDeg) || 0) + ((secondAngleRad - firstAngleRad) * 180) / Math.PI;
  const stepDeg = Math.max(Number(angleStepDeg) || 0, 0);
  if (stepDeg > 0) {
    rotationDeg = Math.round(rotationDeg / stepDeg) * stepDeg;
  }
  return ((rotationDeg % 360) + 360) % 360;
}
/**
 * 用鞋带公式计算多边形的有向面积（平面像素²）。
 * 结果带符号：逆时针为正、顺时针为负 —— 调用方靠符号判断绕向（extractClosedFaces 就用「有向面积为负」判定外轮廓），要面积大小时取绝对值。
 * 这里不校验顶点数，退化多边形会得到接近 0 的值。
 */
export function polygonArea(polygon) {
  let doubleArea = 0;
  for (let vertexIndex = 0; vertexIndex < polygon.length; vertexIndex += 1) {
    const vertex = polygon[vertexIndex];
    const nextVertex = polygon[(vertexIndex + 1) % polygon.length];
    doubleArea += vertex.x * nextVertex.y - nextVertex.x * vertex.y;
  }
  return doubleArea / 2;
}
/**
 * 判断点是否落在多边形内部（含边界，边界判定带容差）：先看点到最后一条边的距离是否 ≤ 容差，是则直接判在
 * 内部 —— 专治射线法在边界附近的抖动（点压墙线时会内外闪烁）；再用奇偶射线法沿 +x 数交叉次数判严格内部。
 * edgeTolerance 默认 1e-7，调用方传随标定尺度派生的约 1cm 像素容差，于是「贴着墙线」在这一层就归入内部。
 */
export function pointInPolygon(testPoint, polygonOutline, edgeTolerance = 1e-7) {
  if (!Array.isArray(polygonOutline) || polygonOutline.length < 3) {
    return false;
  }
  const polygonEdgeTolerance = Math.max(Number(edgeTolerance) || 0, 1e-7);
  let isInside = false;
  for (let polygonEdgeIndex = 0; polygonEdgeIndex < polygonOutline.length; polygonEdgeIndex += 1) {
    const edgeStartVertex = polygonOutline[polygonEdgeIndex];
    const edgeEndVertex = polygonOutline[(polygonEdgeIndex + 1) % polygonOutline.length];
    if (
      projectPointToSegment(testPoint, edgeStartVertex, edgeEndVertex).distance <=
      polygonEdgeTolerance
    ) {
      return true;
    }
    if (edgeStartVertex.y > testPoint.y == edgeEndVertex.y > testPoint.y) {
      continue;
    }
    if (
      edgeStartVertex.x +
        ((testPoint.y - edgeStartVertex.y) * (edgeEndVertex.x - edgeStartVertex.x)) /
          (edgeEndVertex.y - edgeStartVertex.y) >
      testPoint.x
    ) {
      isInside = !isInside;
    }
  }
  return isInside;
}
/**
 * 二维叉积的 z 分量，即两向量张成的有向平行四边形面积。
 */
function crossProduct(vectorA, vectorB) {
  return vectorA.x * vectorB.y - vectorA.y * vectorB.x;
}
/**
 * 向量减法（pointA - pointB）。
 */
function subtractPoints(pointA, pointB) {
  return {
    x: pointA.x - pointB.x,
    y: pointA.y - pointB.y
  };
}
/**
 * 在两点之间做线性插值（factor = 0 取起点，1 取终点）。
 */
function lerpPoint(startPoint, endPoint, factor) {
  return {
    x: startPoint.x + (endPoint.x - startPoint.x) * factor,
    y: startPoint.y + (endPoint.y - startPoint.y) * factor
  };
}
/**
 * 把一次求交得到的切点参数 t 收进切线表。
 * 只接受落在 [-容差, 1 + 容差] 内的 t（越界说明交点落在线段外），并 clamp 回 [0, 1] 后再存 —— 这样「恰好落在端点」的交点既不会被丢掉，也不会因一点浮点越界在后续排序里跑到首尾之外。
 */
function pushCutT(cutLists, edgeIndex, cutT, cutTolerance) {
  if (!(cutT < -cutTolerance) && !(cutT > 1 + cutTolerance)) {
    cutLists[edgeIndex].push(clamp(cutT, 0, 1));
  }
}
/**
 * 简化多边形：去掉重复点、首尾重合点与近乎共线的中间顶点。
 * 布尔运算会产生大量「同一条直线上多切一刀」的顶点，既拖慢后续判定又让几何多出无意义细分，故在生成轮廓的
 * 最后一步统一清理：共线判据为叉积绝对值 ≤ 容差 × 两段长度之积（乘长度归一化成夹角正弦，下限取 1 防极短边把容差压成 0）；每删一点重新扫描，因为删点会让原本不共线的邻居变成共线。
 */
function simplifyPolygon(polygonPoints, simplifyTolerance) {
  const simplifiedPoints = polygonPoints.filter(
    (dedupePoint, pointIndex) =>
      pointIndex === 0 || distance(dedupePoint, polygonPoints[pointIndex - 1]) > simplifyTolerance
  );
  if (
    simplifiedPoints.length > 1 &&
    distance(simplifiedPoints[0], simplifiedPoints.at(-1)) <= simplifyTolerance
  ) {
    simplifiedPoints.pop();
  }
  if (simplifiedPoints.length < 3) {
    return [];
  }
  let didChange = true;
  while (didChange && simplifiedPoints.length >= 3) {
    didChange = false;
    for (let simplifyIndex = 0; simplifyIndex < simplifiedPoints.length; simplifyIndex += 1) {
      const previousPoint =
        simplifiedPoints[(simplifyIndex - 1 + simplifiedPoints.length) % simplifiedPoints.length];
      const currentPoint = simplifiedPoints[simplifyIndex];
      const nextPoint = simplifiedPoints[(simplifyIndex + 1) % simplifiedPoints.length];
      const incomingVector = subtractPoints(currentPoint, previousPoint);
      const outgoingVector = subtractPoints(nextPoint, currentPoint);
      const lengthProduct = Math.max(
        Math.hypot(incomingVector.x, incomingVector.y) *
          Math.hypot(outgoingVector.x, outgoingVector.y),
        1
      );
      if (
        !(
          Math.abs(crossProduct(incomingVector, outgoingVector)) >
          simplifyTolerance * lengthProduct
        )
      ) {
        simplifiedPoints.splice(simplifyIndex, 1);
        didChange = true;
        break;
      }
    }
  }
  return simplifiedPoints;
}
/**
 * 多边形挖洞：从基准轮廓里减去若干洞轮廓。
 * 只是 unionPolygonLoops 的参数换位封装 —— 布尔内核只实现「并集」一种：把洞也当作轮廓一起求并、靠奇偶规则让洞变成空腔，因此不需要第二套算法，两条路径的容差语义也随之保持一致。
 */
export function subtractPolygonLoops(baseLoops, holeLoops, loopTolerance = 0.000001) {
  return unionPolygonLoops(baseLoops, loopTolerance, holeLoops);
}
/**
 * 多边形布尔内核：多组轮廓求并、可选挖洞，输出互不重叠的结果轮廓（容差由 loopMergeTolerance 派生，默认 1e-6）。
 * 流程：过滤退化轮廓 / 零长边 → 求自交点与共线重叠并按 t 切子段 → 用中点探针只留「一侧在并集内、另一侧在外」
 * 的边界边 → 按「转向最大」游走成环再 simplifyPolygon 清理；顶点先按 epsilon × 8 网格吸附成同一图节点（否则游走会因浮点误差断链），requireCompleteWalks 时任一环未闭合即整体返回空数组。
 */
function unionPolygonLoops(
  loops,
  loopMergeTolerance = 0.000001,
  holesToSubtract = [],
  requireCompleteWalks = false
) {
  const epsilon = Math.max(Number(loopMergeTolerance) || 0, 1e-7);
  // 归一化：顶点不足 3 个、含非有限坐标、面积小于 epsilon² 的轮廓都算噪声丢弃；
  // 阈值取 epsilon² 而不是 epsilon，是因为面积是长度的平方量纲。
  const normalizedLoops = (loops || [])
    .filter(rawLoop => Array.isArray(rawLoop) && rawLoop.length >= 3)
    .map(loopPoints =>
      loopPoints.map(rawPoint => ({
        x: Number(rawPoint.x) || 0,
        y: Number(rawPoint.y) || 0
      }))
    )
    .filter(cleanedLoop => Math.abs(polygonArea(cleanedLoop)) > epsilon * epsilon);
  if (!normalizedLoops.length) {
    return [];
  }
  const normalizedHoles = holesToSubtract.filter(
    rawHole =>
      Array.isArray(rawHole) &&
      rawHole.length >= 3 &&
      rawHole.every(holePoint => Number.isFinite(holePoint.x) && Number.isFinite(holePoint.y)) &&
      Math.abs(polygonArea(rawHole)) > epsilon * epsilon
  );
  const sourceEdges = [];
  for (const sourceLoop of [...normalizedLoops, ...normalizedHoles]) {
    for (let loopVertexIndex = 0; loopVertexIndex < sourceLoop.length; loopVertexIndex += 1) {
      const edgeStart = sourceLoop[loopVertexIndex];
      const edgeEnd = sourceLoop[(loopVertexIndex + 1) % sourceLoop.length];
      if (distance(edgeStart, edgeEnd) > epsilon) {
        sourceEdges.push({
          start: edgeStart,
          end: edgeEnd
        });
      }
    }
  }
  const edgeCutTs = sourceEdges.map(() => [0, 1]);
  for (let firstEdgeIndex = 0; firstEdgeIndex < sourceEdges.length; firstEdgeIndex += 1) {
    const firstEdge = sourceEdges[firstEdgeIndex];
    const firstEdgeVector = subtractPoints(firstEdge.end, firstEdge.start);
    const firstEdgeLengthSquared =
      firstEdgeVector.x * firstEdgeVector.x + firstEdgeVector.y * firstEdgeVector.y;
    for (
      let secondEdgeIndex = firstEdgeIndex + 1;
      secondEdgeIndex < sourceEdges.length;
      secondEdgeIndex += 1
    ) {
      const secondEdge = sourceEdges[secondEdgeIndex];
      const secondEdgeVector = subtractPoints(secondEdge.end, secondEdge.start);
      const secondEdgeLengthSquared =
        secondEdgeVector.x * secondEdgeVector.x + secondEdgeVector.y * secondEdgeVector.y;
      const originOffset = subtractPoints(secondEdge.start, firstEdge.start);
      const edgeCross = crossProduct(firstEdgeVector, secondEdgeVector);
      const crossTolerance =
        epsilon * Math.max(Math.sqrt(firstEdgeLengthSquared * secondEdgeLengthSquared), 1);
      if (Math.abs(edgeCross) > crossTolerance) {
        const intersectionTFirst = crossProduct(originOffset, secondEdgeVector) / edgeCross;
        const intersectionTSecond = crossProduct(originOffset, firstEdgeVector) / edgeCross;
        if (
          intersectionTFirst < -epsilon ||
          intersectionTFirst > 1 + epsilon ||
          intersectionTSecond < -epsilon ||
          intersectionTSecond > 1 + epsilon
        ) {
          continue;
        }
        pushCutT(edgeCutTs, firstEdgeIndex, intersectionTFirst, epsilon);
        pushCutT(edgeCutTs, secondEdgeIndex, intersectionTSecond, epsilon);
        continue;
      }
      if (
        Math.abs(crossProduct(originOffset, firstEdgeVector)) >
        epsilon * Math.max(Math.sqrt(firstEdgeLengthSquared), 1)
      ) {
        continue;
      }
      const projectedStartT =
        (originOffset.x * firstEdgeVector.x + originOffset.y * firstEdgeVector.y) /
        firstEdgeLengthSquared;
      const secondEndOffset = subtractPoints(secondEdge.end, firstEdge.start);
      const projectedSecondEndT =
        (secondEndOffset.x * firstEdgeVector.x + secondEndOffset.y * firstEdgeVector.y) /
        firstEdgeLengthSquared;
      pushCutT(edgeCutTs, firstEdgeIndex, projectedStartT, epsilon);
      pushCutT(edgeCutTs, firstEdgeIndex, projectedSecondEndT, epsilon);
      const secondStartOffset = subtractPoints(firstEdge.start, secondEdge.start);
      const projectedSecondStartT =
        (secondStartOffset.x * secondEdgeVector.x + secondStartOffset.y * secondEdgeVector.y) /
        secondEdgeLengthSquared;
      const firstEndOffset = subtractPoints(firstEdge.end, secondEdge.start);
      const projectedFirstEndT =
        (firstEndOffset.x * secondEdgeVector.x + firstEndOffset.y * secondEdgeVector.y) /
        secondEdgeLengthSquared;
      pushCutT(edgeCutTs, secondEdgeIndex, projectedSecondStartT, epsilon);
      pushCutT(edgeCutTs, secondEdgeIndex, projectedFirstEndT, epsilon);
    }
  }
  // 判断点是否落在「实体」区域内：至少在一个外轮廓内，且不落在洞口 / 内院多边形内。
  // 调用方用它探测子边中点的左右侧归属，只保留一侧在内、一侧在外的子边，
  // 从而筛出墙体围成的区域边界，并排除洞口处的碎片。
  const isInteriorPoint = samplePoint =>
    normalizedLoops.some(loop => pointInPolygon(samplePoint, loop, epsilon)) &&
    !normalizedHoles.some(hole => pointInPolygon(samplePoint, hole, epsilon));
  const snapStep = epsilon * 8;
  const snappedPointByKey = new Map();
  // 把点吸附到 snapStep（= epsilon×8）的方格上，并用 Map 按格键缓存：同一格内的点
  // 返回同一个对象引用，后续就能直接比较 key（判重、生成无向边键）来去重近重合端点。
  // 取 8 倍容差是为了既压掉浮点抖动，又不改变可见的几何形状。
  const snapSamplePoint = snapInputPoint => {
    const snappedX = Math.round(snapInputPoint.x / snapStep) * snapStep;
    const snappedY = Math.round(snapInputPoint.y / snapStep) * snapStep;
    const snapKey = Math.round(snappedX / snapStep) + "," + Math.round(snappedY / snapStep);
    if (!snappedPointByKey.has(snapKey)) {
      snappedPointByKey.set(snapKey, {
        key: snapKey,
        point: {
          x: snappedX,
          y: snappedY
        }
      });
    }
    return snappedPointByKey.get(snapKey);
  };
  const boundaryEdges = [];
  const seenEdgeKeys = new Set();
  sourceEdges.forEach((edge, sourceEdgeIndex) => {
    const edgeSortedCutTs = [...edgeCutTs[sourceEdgeIndex]]
      .sort((pieceCutTLeft, pieceCutTRight) => pieceCutTLeft - pieceCutTRight)
      .filter(
        (filteredT, filteredIndex, cutTsList) =>
          filteredIndex === 0 || filteredT - cutTsList[filteredIndex - 1] > epsilon
      );
    for (let edgePieceIndex = 0; edgePieceIndex < edgeSortedCutTs.length - 1; edgePieceIndex += 1) {
      const pieceStartPoint = lerpPoint(edge.start, edge.end, edgeSortedCutTs[edgePieceIndex]);
      const pieceEndPoint = lerpPoint(edge.start, edge.end, edgeSortedCutTs[edgePieceIndex + 1]);
      const pieceLength = distance(pieceStartPoint, pieceEndPoint);
      if (pieceLength <= epsilon) {
        continue;
      }
      const pieceDirection = {
        x: (pieceEndPoint.x - pieceStartPoint.x) / pieceLength,
        y: (pieceEndPoint.y - pieceStartPoint.y) / pieceLength
      };
      const pieceMidpoint = lerpPoint(pieceStartPoint, pieceEndPoint, 0.5);
      const probeOffset = Math.min(pieceLength * 0.2, Math.max(epsilon * 32, 0.00001));
      const leftProbePoint = {
        x: pieceMidpoint.x - pieceDirection.y * probeOffset,
        y: pieceMidpoint.y + pieceDirection.x * probeOffset
      };
      const rightProbePoint = {
        x: pieceMidpoint.x + pieceDirection.y * probeOffset,
        y: pieceMidpoint.y - pieceDirection.x * probeOffset
      };
      const isLeftInside = isInteriorPoint(leftProbePoint);
      const isRightInside = isInteriorPoint(rightProbePoint);
      if (isLeftInside === isRightInside) {
        continue;
      }
      const startNode = snapSamplePoint(isLeftInside ? pieceStartPoint : pieceEndPoint);
      const endNode = snapSamplePoint(isLeftInside ? pieceEndPoint : pieceStartPoint);
      if (startNode.key === endNode.key) {
        continue;
      }
      const edgeKey = [startNode.key, endNode.key].sort().join("|");
      if (!seenEdgeKeys.has(edgeKey)) {
        seenEdgeKeys.add(edgeKey);
        boundaryEdges.push({
          start: startNode,
          end: endNode
        });
      }
    }
  });
  const edgeIndicesByStartKey = new Map();
  boundaryEdges.forEach((listedEdge, listedEdgeIndex) => {
    if (!edgeIndicesByStartKey.has(listedEdge.start.key)) {
      edgeIndicesByStartKey.set(listedEdge.start.key, []);
    }
    edgeIndicesByStartKey.get(listedEdge.start.key).push(listedEdgeIndex);
  });
  const unvisitedEdges = new Set(
    boundaryEdges.map((mappedEdge, mappedEdgeIndex) => mappedEdgeIndex)
  );
  const resultPolygons = [];
  while (unvisitedEdges.size) {
    const startEdgeIndex = unvisitedEdges.values().next().value;
    const startEdge = boundaryEdges[startEdgeIndex];
    const walkPoints = [startEdge.start.point];
    let currentEdgeIndex = startEdgeIndex;
    let isClosed = false;
    for (let stepIndex = 0; stepIndex <= boundaryEdges.length; stepIndex += 1) {
      const currentEdge = boundaryEdges[currentEdgeIndex];
      unvisitedEdges.delete(currentEdgeIndex);
      if (currentEdge.end.key === startEdge.start.key) {
        isClosed = true;
        break;
      }
      walkPoints.push(currentEdge.end.point);
      // 优先走尚未访问的后继边，避免把已经成环的边再串进当前环里。
      const nextEdgeIndices = (edgeIndicesByStartKey.get(currentEdge.end.key) || []).filter(
        candidateEdgeIndex => unvisitedEdges.has(candidateEdgeIndex)
      );
      if (!nextEdgeIndices.length) {
        break;
      }
      if (nextEdgeIndices.length === 1) {
        currentEdgeIndex = nextEdgeIndices[0];
        continue;
      }
      const incomingDirection = subtractPoints(currentEdge.end.point, currentEdge.start.point);
      currentEdgeIndex = nextEdgeIndices
        .map(candidateIndex => {
          const candidateEdge = boundaryEdges[candidateIndex];
          const outgoingDirection = subtractPoints(
            candidateEdge.end.point,
            candidateEdge.start.point
          );
          return {
            index: candidateIndex,
            turn: Math.atan2(
              crossProduct(incomingDirection, outgoingDirection),
              incomingDirection.x * outgoingDirection.x + incomingDirection.y * outgoingDirection.y
            )
          };
        })
        .sort((candidateLeft, candidateRight) => candidateRight.turn - candidateLeft.turn)[0].index;
    }
    if (!isClosed) {
      if (requireCompleteWalks) {
        return [];
      }
      continue;
    }
    const walkPolygon = simplifyPolygon(walkPoints, epsilon * 8);
    if (walkPolygon.length >= 3 && Math.abs(polygonArea(walkPolygon)) > epsilon * epsilon) {
      resultPolygons.push(walkPolygon);
    }
  }
  return resultPolygons.sort(
    (loopLeft, loopRight) => Math.abs(polygonArea(loopRight)) - Math.abs(polygonArea(loopLeft))
  );
}
/**
 * 带自检的多边形并集：结果不可信时宁可返回空数组，让调用方退回「不做布尔、直接用原始轮廓」。
 * 布尔运算遇病态输入（几乎重合的边、自相交轮廓）可能输出空结果或面积暴涨的怪轮廓，直接建模会破面。
 * 两道校验：必须走通所有环（requireCompleteWalks），且总面积 ≥ 源面积千分之一（再以 epsilon² × 1024 兜住极小规模）、不超过源面积之和。
 */
export function validatedUnionPolygonLoops(inputLoops, validationTolerance = 0.000001) {
  const epsilonValue = Math.max(Number(validationTolerance) || 0, 1e-7);
  // 输入先过一遍同量的退化过滤，保证后面「源面积之和」这个基准是干净的。
  const validLoops = (inputLoops || [])
    .filter(checkedLoop => Array.isArray(checkedLoop) && checkedLoop.length >= 3)
    .filter(areaLoop => Math.abs(polygonArea(areaLoop)) > epsilonValue * epsilonValue);
  if (!validLoops.length) {
    return [];
  }
  const mergedLoops = unionPolygonLoops(validLoops, epsilonValue, [], true);
  if (!mergedLoops.length) {
    return [];
  }
  const sourceTotalArea = validLoops.reduce(
    (areaSum, sourceLoopItem) => areaSum + Math.abs(polygonArea(sourceLoopItem)),
    0
  );
  const mergedTotalArea = mergedLoops.reduce(
    (mergedAreaSum, mergedLoop) => mergedAreaSum + polygonArea(mergedLoop),
    0
  );
  const areaTolerance = Math.max(sourceTotalArea * 0.001, epsilonValue * epsilonValue * 1024);
  if (mergedTotalArea <= areaTolerance || mergedTotalArea > sourceTotalArea + areaTolerance) {
    return [];
  } else {
    return mergedLoops;
  }
}
/**
 * 把墙列表建成「节点 + 子边」的平面图，供闭环与端点度数分析使用。
 * 节点合并走空间哈希（按 nodeTolerance 分格只查 3×3）而非两两比较，否则每加一个端点都要扫全表退化成 O(n²)，
 * 同组取「下标最小且距离在容差内」者保证可复现。边按包围盒 x 排序、只与重叠者求交（扫描线剪枝）；交点以参数 t 记进 cuts 后排序切段、按节点对去重，因此「一条长墙被若干短墙穿过」也能正确切段。
 */
function buildWallGraph(graphWalls, nodeTolerance) {
  const nodes = [];
  const endpointWallsByNode = [];
  const nodeIndicesByCell = new Map();
  // 查询（或登记）端点所属节点：按 nodeTolerance 分格的哈希表把查找限制在自身与周围
  // 3×3 格内，避免 O(n²) 的两两比较。同一格组内取「下标最小」且在容差内的节点，
  // 保证归并结果与遍历顺序无关、每次运行都能复现（供闭环 / 度数分析使用）。
  const getNodeIndex = nodePoint => {
    const cellX = Math.floor(nodePoint.x / nodeTolerance);
    const cellY = Math.floor(nodePoint.y / nodeTolerance);
    let bestNodeIndex = -1;
    for (let cellOffsetX = -1; cellOffsetX <= 1; cellOffsetX += 1) {
      for (let cellOffsetY = -1; cellOffsetY <= 1; cellOffsetY += 1) {
        for (const candidateNodeIndex of nodeIndicesByCell.get(
          cellX + cellOffsetX + "," + (cellY + cellOffsetY)
        ) || []) {
          if (
            (bestNodeIndex < 0 || candidateNodeIndex < bestNodeIndex) &&
            distance(nodes[candidateNodeIndex], nodePoint) <= nodeTolerance
          ) {
            bestNodeIndex = candidateNodeIndex;
          }
        }
      }
    }
    if (bestNodeIndex >= 0) {
      return bestNodeIndex;
    }
    const newNodeIndex = nodes.length;
    nodes.push({
      x: nodePoint.x,
      y: nodePoint.y
    });
    endpointWallsByNode.push([]);
    const cellKey = cellX + "," + cellY;
    if (!nodeIndicesByCell.has(cellKey)) {
      nodeIndicesByCell.set(cellKey, []);
    }
    nodeIndicesByCell.get(cellKey).push(newNodeIndex);
    return newNodeIndex;
  };
  /**
   * 生成与先后顺序无关的节点对键（小下标在前），用于子边去重。
   */
  const makeNodePairKey = (nodeIndexA, nodeIndexB) =>
    nodeIndexA < nodeIndexB ? nodeIndexA + "," + nodeIndexB : nodeIndexB + "," + nodeIndexA;
  const graphEdges = [];
  const seenNodePairs = new Set();
  for (const inputWall of graphWalls || []) {
    if (
      ![inputWall?.start?.x, inputWall?.start?.y, inputWall?.end?.x, inputWall?.end?.y].every(
        Number.isFinite
      )
    ) {
      continue;
    }
    const startNodeIndex = getNodeIndex(inputWall.start);
    const endNodeIndex = getNodeIndex(inputWall.end);
    if (startNodeIndex === endNodeIndex) {
      continue;
    }
    endpointWallsByNode[startNodeIndex].push(inputWall);
    endpointWallsByNode[endNodeIndex].push(inputWall);
    const nodePairKey = makeNodePairKey(startNodeIndex, endNodeIndex);
    if (seenNodePairs.has(nodePairKey)) {
      continue;
    }
    seenNodePairs.add(nodePairKey);
    const startNodePoint = nodes[startNodeIndex];
    const endNodePoint = nodes[endNodeIndex];
    graphEdges.push({
      start: startNodeIndex,
      end: endNodeIndex,
      minX: Math.min(startNodePoint.x, endNodePoint.x),
      maxX: Math.max(startNodePoint.x, endNodePoint.x),
      minY: Math.min(startNodePoint.y, endNodePoint.y),
      maxY: Math.max(startNodePoint.y, endNodePoint.y),
      cuts: [
        {
          t: 0,
          node: startNodeIndex
        },
        {
          t: 1,
          node: endNodeIndex
        }
      ]
    });
  }
  /**
   * 把一个节点作为切点挂到某条边上（前提是它落在边的内部且确实贴边）。
   * 条件是 t 严格落在 (0, 1) 且投影距离 ≤ nodeTolerance：边的两个端点本来就已作为 cuts 的首尾存在，重复添加会切出零长子边；距离判据则过滤掉「同处一格但不在该边上」的节点。
   */
  const addGraphEdgeCut = (graphEdge, intersectionNodeIndex) => {
    if (intersectionNodeIndex === graphEdge.start || intersectionNodeIndex === graphEdge.end) {
      return;
    }
    const cutProjection = projectPointToSegment(
      nodes[intersectionNodeIndex],
      nodes[graphEdge.start],
      nodes[graphEdge.end]
    );
    if (cutProjection.t > 0 && cutProjection.t < 1 && cutProjection.distance <= nodeTolerance) {
      graphEdge.cuts.push({
        t: cutProjection.t,
        node: intersectionNodeIndex
      });
    }
  };
  graphEdges.sort((graphEdgeLeft, graphEdgeRight) => graphEdgeLeft.minX - graphEdgeRight.minX);
  for (let outerEdgeIndex = 0; outerEdgeIndex < graphEdges.length; outerEdgeIndex += 1) {
    const outerEdge = graphEdges[outerEdgeIndex];
    for (
      let innerEdgeIndex = outerEdgeIndex + 1;
      innerEdgeIndex < graphEdges.length;
      innerEdgeIndex += 1
    ) {
      const innerEdge = graphEdges[innerEdgeIndex];
      if (innerEdge.minX > outerEdge.maxX + nodeTolerance) {
        break;
      }
      if (
        innerEdge.minY > outerEdge.maxY + nodeTolerance ||
        innerEdge.maxY < outerEdge.minY - nodeTolerance
      ) {
        continue;
      }
      addGraphEdgeCut(outerEdge, innerEdge.start);
      addGraphEdgeCut(outerEdge, innerEdge.end);
      addGraphEdgeCut(innerEdge, outerEdge.start);
      addGraphEdgeCut(innerEdge, outerEdge.end);
      const crossingPoint = segmentIntersection(
        nodes[outerEdge.start],
        nodes[outerEdge.end],
        nodes[innerEdge.start],
        nodes[innerEdge.end]
      );
      if (crossingPoint) {
        const crossingNodeIndex = getNodeIndex(crossingPoint);
        addGraphEdgeCut(outerEdge, crossingNodeIndex);
        addGraphEdgeCut(innerEdge, crossingNodeIndex);
      }
    }
  }
  const subEdges = [];
  const seenSubEdgeKeys = new Set();
  for (const subEdgeSource of graphEdges) {
    subEdgeSource.cuts.sort((cutLeft, cutRight) => cutLeft.t - cutRight.t);
    let previousNodeIndex = subEdgeSource.cuts[0].node;
    for (const cut of subEdgeSource.cuts.slice(1)) {
      const cutNodeIndex = cut.node;
      const subEdgeKey = makeNodePairKey(previousNodeIndex, cutNodeIndex);
      if (previousNodeIndex !== cutNodeIndex && !seenSubEdgeKeys.has(subEdgeKey)) {
        seenSubEdgeKeys.add(subEdgeKey);
        subEdges.push({
          start: previousNodeIndex,
          end: cutNodeIndex
        });
      }
      previousNodeIndex = cutNodeIndex;
    }
  }
  return {
    nodes: nodes,
    edges: subEdges,
    endpointWalls: endpointWallsByNode
  };
}
/**
 * 从墙图中提取所有闭合面（房间与外轮廓）。
 * 用半边结构做最小环搜索：每条无向边拆成互为孪生的两条半边，在每个节点按出射角排序，走环时固定取「孪生边的
 * 下一条」——等价于始终贴着边界同一侧拐弯，故每个环都是不能再细分的极小面。有向面积为负标 outer、为正的是内腔；同环可能从不同起点走两遍，用「最小下标顶点的旋转键」去重，面积 < faceTolerance² 的丢弃。
 */
function extractClosedFaces(faceWalls, faceTolerance) {
  const { nodes: graphNodes, edges: faceGraphEdges } = buildWallGraph(faceWalls, faceTolerance);
  const halfEdgeIndicesByNode = Array.from(
    {
      length: graphNodes.length
    },
    () => []
  );
  const halfEdges = [];
  for (const baseEdge of faceGraphEdges) {
    const forwardHalfEdgeIndex = halfEdges.length;
    halfEdges.push(
      {
        start: baseEdge.start,
        end: baseEdge.end
      },
      {
        start: baseEdge.end,
        end: baseEdge.start
      }
    );
    halfEdgeIndicesByNode[baseEdge.start].push(forwardHalfEdgeIndex);
    halfEdgeIndicesByNode[baseEdge.end].push(forwardHalfEdgeIndex + 1);
  }
  const sortedOrderByHalfEdge = new Int32Array(halfEdges.length);
  halfEdgeIndicesByNode.forEach((nodeHalfEdges, nodeIndex) => {
    // 节点周围的半边按「从本节点指向对端的方位角」（atan2，弧度 -π~π）升序排列，
    // 这是求「下一条半边」的前提：逆时针绕面行走时，只需取排序中当前反向边的前一条
    // 即可（+length-1 取环形前一位），无需在行走时反复做角度查询。
    const halfEdgeAngle = halfEdgeIndex =>
      Math.atan2(
        graphNodes[halfEdges[halfEdgeIndex].end].y - graphNodes[nodeIndex].y,
        graphNodes[halfEdges[halfEdgeIndex].end].x - graphNodes[nodeIndex].x
      );
    nodeHalfEdges.sort(
      (halfEdgeLeft, halfEdgeRight) => halfEdgeAngle(halfEdgeLeft) - halfEdgeAngle(halfEdgeRight)
    );
    nodeHalfEdges.forEach((sortedHalfEdgeIndex, sortedOrder) => {
      sortedOrderByHalfEdge[sortedHalfEdgeIndex] = sortedOrder;
    });
  });
  const nextHalfEdgeIndices = halfEdges.map((forwardHalfEdge, forwardIndex) => {
    const adjacentHalfEdges = halfEdgeIndicesByNode[forwardHalfEdge.end];
    return adjacentHalfEdges[
      (sortedOrderByHalfEdge[forwardIndex ^ 1] + adjacentHalfEdges.length - 1) %
        adjacentHalfEdges.length
    ];
  });
  const visitedHalfEdges = new Uint8Array(halfEdges.length);
  const facesByCycleKey = new Map();
  // 登记一条由半边索引构成的闭合环（面）：少于 3 条边或面积小于 faceTolerance² 的退化环直接丢弃（零面积环是数值噪声，不是房间）。
  // 有向面积先平移首个顶点再算以减小浮点误差；随后把环旋转到「最小半边下标开头」生成规范化 key 去重，使同一条环无论从哪个半边起步、正反哪个方向都只登记一次。
  const recordFace = cycleHalfEdges => {
    if (cycleHalfEdges.length < 3) {
      return;
    }
    const cyclePoints = cycleHalfEdges.map(cycleHalfEdgeIndex => graphNodes[cycleHalfEdgeIndex]);
    const originPoint = cyclePoints[0];
    const signedArea = polygonArea(
      cyclePoints.map(cyclePoint => subtractPoints(cyclePoint, originPoint))
    );
    if (Math.abs(signedArea) <= faceTolerance * faceTolerance) {
      return;
    }
    const orientedCycle = signedArea > 0 ? cycleHalfEdges : [...cycleHalfEdges].reverse();
    let minVertexIndex = 0;
    for (let scanIndex = 1; scanIndex < orientedCycle.length; scanIndex += 1) {
      if (orientedCycle[scanIndex] < orientedCycle[minVertexIndex]) {
        minVertexIndex = scanIndex;
      }
    }
    const cycleKey = [
      ...orientedCycle.slice(minVertexIndex),
      ...orientedCycle.slice(0, minVertexIndex)
    ].join(",");
    const existingFace = facesByCycleKey.get(cycleKey);
    if (existingFace) {
      existingFace.outer ||= signedArea < 0;
      return;
    }
    const facePolygon = simplifyPolygon(
      orientedCycle.map(polygonNodeIndex => ({
        ...graphNodes[polygonNodeIndex]
      })),
      1e-7
    );
    if (facePolygon.length >= 3) {
      facesByCycleKey.set(cycleKey, {
        polygon: facePolygon,
        area: Math.abs(signedArea),
        outer: signedArea < 0
      });
    }
  };
  for (
    let walkStartHalfEdgeIndex = 0;
    walkStartHalfEdgeIndex < halfEdges.length;
    walkStartHalfEdgeIndex += 1
  ) {
    if (visitedHalfEdges[walkStartHalfEdgeIndex]) {
      continue;
    }
    const faceWalk = [];
    const walkPositions = new Map();
    let currentWalkHalfEdge = walkStartHalfEdgeIndex;
    // 把半边压入当前行走路径；若该半边已在路径中，说明绕回了旧位置 —— 中间那段
    // 就是一个闭合环，交给 recordFace 登记，并把多出来的尾巴从路径和索引表里弹出，
    // 以便同一次行走里再识别出嵌套的其它环。
    const pushFaceWalk = walkHalfEdgeIndex => {
      const existingPosition = walkPositions.get(walkHalfEdgeIndex);
      if (existingPosition !== undefined) {
        for (
          recordFace(faceWalk.slice(existingPosition));
          faceWalk.length > existingPosition + 1;
        ) {
          walkPositions.delete(faceWalk.pop());
        }
      } else {
        walkPositions.set(walkHalfEdgeIndex, faceWalk.length);
        faceWalk.push(walkHalfEdgeIndex);
      }
    };
    while (!visitedHalfEdges[currentWalkHalfEdge]) {
      visitedHalfEdges[currentWalkHalfEdge] = 1;
      pushFaceWalk(halfEdges[currentWalkHalfEdge].start);
      currentWalkHalfEdge = nextHalfEdgeIndices[currentWalkHalfEdge];
    }
    if (currentWalkHalfEdge === walkStartHalfEdgeIndex) {
      pushFaceWalk(halfEdges[walkStartHalfEdgeIndex].start);
    }
  }
  return [...facesByCycleKey.values()].sort(
    (faceLeft, faceRight) => faceRight.area - faceLeft.area
  );
}
/**
 * 求墙围出的所有闭合房间多边形。
 */
export function closedWallPolygons(loopWalls, polygonTolerance = 1) {
  const polygonToleranceValue = Math.max(Number(polygonTolerance) || 0, 1e-7);
  return extractClosedFaces(loopWalls, polygonToleranceValue).map(face => face.polygon);
}
/**
 * 找出墙图中度数为 1 的端点，也就是只连着一根墙的「悬空端」。
 * 度数直接由子边计数得到：墙被切分后只有真正的悬空端才会只剩一条子边，因此这里不需要额外的几何判断就能区分「开口」与「内部接缝」。
 */
function collectOpenEndpoints(degreeWalls, degreeTolerance = 1) {
  const endpointToleranceValue = Math.max(Number(degreeTolerance) || 0, 1e-7);
  const {
    nodes: degreeNodes,
    edges: degreeEdges,
    endpointWalls: endpointWallGroups
  } = buildWallGraph(degreeWalls, endpointToleranceValue);
  const degreeByNode = new Uint32Array(degreeNodes.length);
  for (const degreeEdge of degreeEdges) {
    degreeByNode[degreeEdge.start] += 1;
    degreeByNode[degreeEdge.end] += 1;
  }
  return degreeNodes.flatMap((node, degreeNodeIndex) =>
    degreeByNode[degreeNodeIndex] === 1
      ? [
          {
            point: node,
            walls: endpointWallGroups[degreeNodeIndex]
          }
        ]
      : []
  );
}
/**
 * 判断一个点是否「严格」落在多边形内部（即不贴在任意一条边上）。
 * 先用 pointInPolygon 做粗判，再逐条边检查点到边的最小距离是否大于容差，全部大于才算严格内部。
 * 这道额外检查是为了把「压在房间轮廓上的悬空端点」排除掉：端点贴在轮廓上说明它仍然是需要提示的开口，只是刚好与外轮廓相接。
 */
function isStrictlyInsidePolygon(boundaryPolygon, enclosingPolygon, loopEdgeTolerance) {
  if (pointInPolygon(boundaryPolygon, enclosingPolygon, loopEdgeTolerance)) {
    return enclosingPolygon.every(
      (boundaryVertex, boundaryVertexIndex) =>
        projectPointToSegment(
          boundaryPolygon,
          boundaryVertex,
          enclosingPolygon[(boundaryVertexIndex + 1) % enclosingPolygon.length]
        ).distance > loopEdgeTolerance
    );
  } else {
    return false;
  }
}
/**
 * 找出「没有闭合」的墙端点：悬空的，且不在任何一个房间外轮廓内部。
 * 两层过滤：先剔除自己声明了 allowOpenEnd 的端点（有意留口，如栏杆接口），再剔除落在房间轮廓内的端点
 * ——内部隔墙端点到不了外墙，不算未闭合。floorPolygons 可传入已算好的楼层轮廓，避免渲染循环里重复跑闭环搜索。
 */
export function unclosedWallEndpoints(unclosedWalls, unclosedTolerance = 1, floorPolygons = null) {
  const wallToleranceValue = Math.max(Number(unclosedTolerance) || 0, 1e-7);
  const checkedFloorPolygons = Array.isArray(floorPolygons)
    ? floorPolygons
    : closedWallFloorPolygons(unclosedWalls, wallToleranceValue);
  return collectOpenEndpoints(unclosedWalls, wallToleranceValue)
    .filter(
      openEndpoint =>
        !openEndpoint.walls.length ||
        openEndpoint.walls.some(endpointWall => endpointWall.allowOpenEnd !== true)
    )
    .filter(
      testedEndpoint =>
        !checkedFloorPolygons.some(floorPolygon =>
          isStrictlyInsidePolygon(testedEndpoint.point, floorPolygon, wallToleranceValue)
        )
    )
    .map(mappedEndpoint => ({
      ...mappedEndpoint.point
    }));
}
/**
 * 判断 innerLoop 是否被 outerLoop 完全包住（用于剔除嵌套的轮廓）。
 * 两道判据：outer 的绝对面积必须大于 inner，且 inner 的每个顶点与每条边的中点都落在 outer 内部 —— 补边
 * 中点是为了防止「顶点都在里面、边却跨出去」的凹多边形漏判。面积比较用容差的平方是因为面积与长度差一个量纲。
 */
function isLoopEngulfedByLoop(innerLoop, outerLoop, engulfTolerance) {
  const toleranceSquared = engulfTolerance * engulfTolerance;
  // 求环的绝对面积：先整体平移到首个顶点为原点再套鞋带公式，可减小坐标数值大时
  // 的浮点抵消误差；取绝对值是因为这里只比大小、不关心绕向。与 engulfTolerance²
  // （面积与长度差一个量纲）配合，比较两个环谁包住谁（见下方 isLoopEngulfedByLoop）。
  const absolutePolygonArea = measuredLoop =>
    Math.abs(
      polygonArea(measuredLoop.map(loopPoint => subtractPoints(loopPoint, measuredLoop[0])))
    );
  if (absolutePolygonArea(outerLoop) <= absolutePolygonArea(innerLoop) + toleranceSquared) {
    return false;
  } else {
    return innerLoop.every((innerVertex, cornerIndex) => {
      if (!pointInPolygon(innerVertex, outerLoop, engulfTolerance)) {
        return false;
      }
      const nextInnerVertex = innerLoop[(cornerIndex + 1) % innerLoop.length];
      const edgeMidpoint = {
        x: (innerVertex.x + nextInnerVertex.x) / 2,
        y: (innerVertex.y + nextInnerVertex.y) / 2
      };
      return pointInPolygon(edgeMidpoint, outerLoop, engulfTolerance);
    });
  }
}
/**
 * 求墙围出的「楼层外轮廓」：只保留有向面积为负（外轮廓）且不被他者包住的面。
 * extractClosedFaces 会把房间内腔与外轮廓一起返回，这里只取外轮廓，再用 isLoopEngulfedByLoop 去掉被更大外轮廓包住的嵌套轮廓（例如内院形成的小外环）。
 * 保证调用方拿到的是一组互不包含的楼层底面积。
 */
export function closedWallFloorPolygons(floorWalls, floorTolerance = 1) {
  const floorToleranceValue = Math.max(Number(floorTolerance) || 0, 1e-7);
  const outerFloorPolygons = [];
  for (const { polygon: outerFacePolygon, outer: isOuterFace } of extractClosedFaces(
    floorWalls,
    floorToleranceValue
  )) {
    if (
      // 用 !! 把 undefined（未经判定的面）明确当作非外轮廓，而不是依赖隐式转换。
      !!isOuterFace &&
      !outerFloorPolygons.some(candidateFloor =>
        isLoopEngulfedByLoop(outerFacePolygon, candidateFloor, floorToleranceValue)
      )
    ) {
      outerFloorPolygons.push(outerFacePolygon);
    }
  }
  return outerFloorPolygons;
}
/**
 * 计算整个模型的平面包围盒（底图 + 所有墙端点 + 所有物件锚点），用于取景：视图缩放、楼层堆叠对齐与导出选区。
 * 三类数据缺一不可 —— 只算墙会漏掉墙外家具，只算家具又会让空场景没有范围。完全空文档时返回 1200 × 800
 * （与默认底图尺寸一致）的兜底画布，让取景逻辑不必特判「空」；宽高下限取 1 以避免后续除零。
 */
export function modelBounds(model) {
  const boundPoints = [];
  if (model.background?.width && model.background?.height) {
    boundPoints.push(
      {
        x: 0,
        y: 0
      },
      {
        x: model.background.width,
        y: model.background.height
      }
    );
  }
  for (const boundWall of model.walls || []) {
    boundPoints.push(boundWall.start, boundWall.end);
  }
  for (const boundItem of model.items || []) {
    boundPoints.push({
      x: boundItem.x,
      y: boundItem.y
    });
  }
  if (!boundPoints.length) {
    return {
      minX: 0,
      minY: 0,
      maxX: 1200,
      maxY: 800,
      width: 1200,
      height: 800
    };
  }
  const minX = Math.min(...boundPoints.map(minXPoint => minXPoint.x));
  const minY = Math.min(...boundPoints.map(minYPoint => minYPoint.y));
  const maxX = Math.max(...boundPoints.map(maxXPoint => maxXPoint.x));
  const maxY = Math.max(...boundPoints.map(maxYPoint => maxYPoint.y));
  return {
    minX: minX,
    minY: minY,
    maxX: Math.max(maxX, minX + 1),
    maxY: Math.max(maxY, minY + 1),
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1)
  };
}
