export const FLOW_LINE_DEFAULTS = Object.freeze({
    effect: "water",
    shape: "rounded",
    points: [
      [0.08, 0.5],
      [0.92, 0.5],
    ],
    color: "#42d9ef",
    headColor: "#efffff",
    baseColor: "#42d9ef",
    width: 5,
    speed: 90,
    direction: 1,
    controlMode: "manual",
    tail: 58,
    spacing: 130,
    glow: 55,
    opacity: 1,
    baseOpacity: 0.16,
    baseVisible: true,
    headVisible: true,
    animated: true,
    radius: 28,
  }),
  FLOW_LINE_FIELDS = {
    effect: "效果风格",
    shape: "路径形态",
    color: "流光颜色",
    headColor: "光点颜色",
    baseColor: "底线颜色",
    width: "线宽",
    speed: "流速",
    direction: "流动方向",
    tail: "光尾长度",
    spacing: "光点间距",
    glow: "发光强度",
    opacity: "整体透明度",
    baseOpacity: "底线透明度",
    baseVisible: "显示底线",
    headVisible: "显示光点",
    animated: "流动动画",
    radius: "转角半径",
  };
const toFiniteNumber = (inputValue, fallbackValue) =>
  Number.isFinite(Number(inputValue)) && inputValue !== null && inputValue !== ""
    ? Number(inputValue)
    : fallbackValue;
export const flowClamp = (valueToClamp, minValue, maxValue, nonFiniteFallback = minValue) =>
  Math.max(minValue, Math.min(maxValue, toFiniteNumber(valueToClamp, nonFiniteFallback)));
const sanitizeHexColor = (candidateColor, fallbackColor) =>
  /^#[\da-f]{6}$/i.test(String(candidateColor)) ? candidateColor : fallbackColor;
export function normalizeFlowLine(rawConfig = {}) {
  const FLOW_LINE_DEFAULTS2 = FLOW_LINE_DEFAULTS,
    config = rawConfig,
    map = Array.isArray(config.points)
      ? config.points
          .slice(0, 256)
          .filter(
            (rawPointPair) =>
              Array.isArray(rawPointPair) &&
              rawPointPair.length >= 2 &&
              rawPointPair
                .slice(0, 2)
                .every(
                  (coordinateValue) =>
                    typeof coordinateValue == "number" && Number.isFinite(coordinateValue),
                ),
          )
          .map((pointPair) =>
            pointPair.slice(0, 2).map((clampedCoordinate) => flowClamp(clampedCoordinate, 0, 1)),
          )
      : FLOW_LINE_DEFAULTS2.points.map((defaultPoint) => [...defaultPoint]);
  return {
    effect: config.effect === "energy" ? "energy" : "water",
    shape: ["straight", "rounded", "curve"].includes(config.shape)
      ? config.shape
      : FLOW_LINE_DEFAULTS2.shape,
    points: map,
    color: sanitizeHexColor(config.color, FLOW_LINE_DEFAULTS2.color),
    headColor: sanitizeHexColor(config.headColor, FLOW_LINE_DEFAULTS2.headColor),
    baseColor: sanitizeHexColor(config.baseColor, FLOW_LINE_DEFAULTS2.baseColor),
    width: flowClamp(config.width, 1, 40, FLOW_LINE_DEFAULTS2.width),
    speed: flowClamp(config.speed, 0, 500, FLOW_LINE_DEFAULTS2.speed),
    direction: Number(config.direction) === -1 ? -1 : 1,
    controlMode: config.controlMode === "entity-sign" ? "entity-sign" : "manual",
    tail: flowClamp(config.tail, 2, 300, FLOW_LINE_DEFAULTS2.tail),
    spacing: flowClamp(config.spacing, 10, 600, FLOW_LINE_DEFAULTS2.spacing),
    glow: flowClamp(config.glow, 0, 100, FLOW_LINE_DEFAULTS2.glow),
    opacity: flowClamp(config.opacity, 0, 1, FLOW_LINE_DEFAULTS2.opacity),
    baseOpacity: flowClamp(config.baseOpacity, 0, 1, FLOW_LINE_DEFAULTS2.baseOpacity),
    radius: flowClamp(config.radius, 0, 150, FLOW_LINE_DEFAULTS2.radius),
    baseVisible: config.baseVisible !== false,
    headVisible: config.headVisible !== false,
    animated: config.animated !== false,
  };
}
export function flowLineMotion(inputConfig, stateEvent) {
  const normalizeFlowLine2 = normalizeFlowLine(inputConfig),
    resolvedState = stateEvent?.newState || stateEvent;
  let num = 1;
  if (normalizeFlowLine2.controlMode === "entity-sign") {
    const rawStateValue = resolvedState?.state,
      trim =
        typeof rawStateValue == "number" || typeof rawStateValue == "string"
          ? String(rawStateValue).trim()
          : "",
      NaN2 = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(trim) ? Number(trim) : NaN;
    num =
      resolvedState?.available === false ||
      stateEvent?.available === false ||
      !Number.isFinite(NaN2)
        ? 0
        : Math.sign(NaN2);
  }
  return {
    direction:
      normalizeFlowLine2.controlMode === "entity-sign" ? num || 1 : normalizeFlowLine2.direction,
    running: normalizeFlowLine2.animated && normalizeFlowLine2.speed > 0 && num !== 0,
  };
}
export function constrainFlowPoint(
  inputPoint,
  anchorPoint,
  shouldConstrain,
  lockedAxis = null,
  axisWeights = [1, 1],
) {
  const clampedPoint = inputPoint.map((pointCoordinate) => flowClamp(pointCoordinate, 0, 1));
  if (!shouldConstrain || !anchorPoint)
    return {
      point: clampedPoint,
      axis: null,
    };
  const abs = Math.abs(clampedPoint[0] - anchorPoint[0]),
    abs2 = Math.abs(clampedPoint[1] - anchorPoint[1]);
  return !lockedAxis && Math.max(abs, abs2) < 0.003
    ? {
        point: [...anchorPoint],
        axis: null,
      }
    : ((lockedAxis ||= abs * axisWeights[0] >= abs2 * axisWeights[1] ? "x" : "y"),
      {
        point:
          lockedAxis === "x"
            ? [clampedPoint[0], anchorPoint[1]]
            : [anchorPoint[0], clampedPoint[1]],
        axis: lockedAxis,
      });
}
export function flowLinePath(
  normalizedPoints,
  shape = "rounded",
  canvasWidth = 900,
  canvasHeight = 520,
  cornerRadius = 28,
) {
  const scaledPoints = normalizedPoints.map(([normalizedX, normalizedY]) => [
    normalizedX * canvasWidth,
    normalizedY * canvasHeight,
  ]);
  if (!scaledPoints.length) return "";
  let pathString = "M " + scaledPoints[0];
  if (scaledPoints.length < 2) return pathString;
  if (shape === "straight")
    return (
      pathString +
      scaledPoints
        .slice(1)
        .map((pathPoint) => " L " + pathPoint)
        .join("")
    );
  if (shape === "curve") {
    for (let curveIndex = 0; curveIndex < scaledPoints.length - 1; curveIndex++) {
      const previousPoint = scaledPoints[Math.max(0, curveIndex - 1)],
        currentPoint = scaledPoints[curveIndex],
        nextPoint = scaledPoints[curveIndex + 1],
        followingPoint = scaledPoints[Math.min(scaledPoints.length - 1, curveIndex + 2)];
      pathString +=
        " C " +
        currentPoint.map(
          (currentCoordinate, currentAxisIndex) =>
            currentCoordinate + (nextPoint[currentAxisIndex] - previousPoint[currentAxisIndex]) / 6,
        ) +
        " " +
        nextPoint.map(
          (nextCoordinate, nextAxisIndex) =>
            nextCoordinate - (followingPoint[nextAxisIndex] - currentPoint[nextAxisIndex]) / 6,
        ) +
        " " +
        nextPoint;
    }
    return pathString;
  }
  for (let vertexIndex = 1; vertexIndex < scaledPoints.length - 1; vertexIndex++) {
    const previousVertex = scaledPoints[vertexIndex - 1],
      currentVertex = scaledPoints[vertexIndex],
      nextVertex = scaledPoints[vertexIndex + 1],
      hypot = Math.hypot(
        currentVertex[0] - previousVertex[0],
        currentVertex[1] - previousVertex[1],
      ),
      hypot2 = Math.hypot(nextVertex[0] - currentVertex[0], nextVertex[1] - currentVertex[1]),
      min = Math.min(cornerRadius, hypot / 2, hypot2 / 2);
    pathString +=
      " L " +
      currentVertex.map(
        (vertexCoordinate, vertexAxisIndex) =>
          vertexCoordinate +
          ((previousVertex[vertexAxisIndex] - vertexCoordinate) * min) / (hypot || 1),
      ) +
      " Q " +
      currentVertex +
      " " +
      currentVertex.map(
        (nextVertexCoordinate, nextVertexAxisIndex) =>
          nextVertexCoordinate +
          ((nextVertex[nextVertexAxisIndex] - nextVertexCoordinate) * min) / (hypot2 || 1),
      );
  }
  return pathString + (" L " + scaledPoints.at(-1));
}
export function applyFlowLineStyle(styleSource, styleTarget, changedFields) {
  const normalizeFlowLine3 = normalizeFlowLine(styleSource.properties);
  styleTarget.properties = {
    ...styleTarget.properties,
  };
  for (const fieldKey of changedFields)
    Object.hasOwn(FLOW_LINE_FIELDS, fieldKey) &&
      (styleTarget.properties[fieldKey] = normalizeFlowLine3[fieldKey]);
}
export function fitFlowLinePath(flowEntity, flowPoints) {
  const options = flowEntity.position || {},
    layoutWidth = Number(options.width) || 600,
    layoutHeight = Number(options.height) || 300,
    minX = Math.min(...flowPoints.map((sampleX) => sampleX[0])),
    minY = Math.min(...flowPoints.map((sampleY) => sampleY[1])),
    max = Math.max(1, Math.max(...flowPoints.map((maxSampleX) => maxSampleX[0])) - minX),
    spanY = Math.max(1, Math.max(...flowPoints.map((maxSampleY) => maxSampleY[1])) - minY),
    rotationRad = ((Number(options.rotation) || 0) * Math.PI) / 180,
    scaleFactor = Math.max(0.01, Math.min(5, Number(flowEntity.style?.scale) || 1)),
    rotatedOffsetX = (minX + max / 2 - layoutWidth / 2) * scaleFactor,
    rotatedOffsetY = (minY + spanY / 2 - layoutHeight / 2) * scaleFactor;
  return {
    position: {
      x:
        (Number(options.x) || 0) +
        layoutWidth / 2 +
        rotatedOffsetX * Math.cos(rotationRad) -
        rotatedOffsetY * Math.sin(rotationRad) -
        max / 2,
      y:
        (Number(options.y) || 0) +
        layoutHeight / 2 +
        rotatedOffsetX * Math.sin(rotationRad) +
        rotatedOffsetY * Math.cos(rotationRad) -
        spanY / 2,
      width: max,
      height: spanY,
    },
    points: flowPoints.map(([pointX, pointY]) => [(pointX - minX) / max, (pointY - minY) / spanY]),
    origin: [minX, minY],
  };
}
