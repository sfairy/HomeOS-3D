/** 平面图坐标（米）：planToScreen / screenToPlan 在同一套坐标系里来回换算。 */
type PlanPoint = { x: number; y: number };

/** 画线样式； */
type PlanLineOptions = {
  color?: string;
  width?: number;
  cap?: CanvasLineCap;
  dash?: number[];
};

export function drawTrackedText(painter, text, originX, originY, trackingPx, maxWidthPx) {
  const characters = [...String(text || "")];
  if (!characters.length) return 0;
  const glyphWidths = characters.map((glyph) => painter.measureText(glyph).width),
    totalWidth =
      glyphWidths.reduce((accumulatedWidth, glyphWidth) => accumulatedWidth + glyphWidth, 0) +
      Math.max(characters.length - 1, 0) * trackingPx,
    widthScale = totalWidth > 0 ? Math.min(1, maxWidthPx / totalWidth) : 1;
  (painter.save(),
    painter.translate(originX, originY),
    painter.scale(widthScale, 1),
    (painter.textAlign = "left"),
    (painter.textBaseline = "middle"));
  let cursorX = 0;
  return (
    characters.forEach((character, characterIndex) => {
      (painter.fillText(character, cursorX, 0),
        (cursorX +=
          glyphWidths[characterIndex] + (characterIndex < characters.length - 1 ? trackingPx : 0)));
    }),
    painter.restore(),
    totalWidth * widthScale
  );
}
export function createPlanDrawingTools({
  context: canvasPainter,
  planToScreen: planToScreen,
  screenToPlan: screenToPlan,
  pixelsPerMeter: pixelsPerMeter,
  getCanvasSize: getCanvasSize,
  getViewZoom: getViewZoom,
}) {
  function drawMetricGrid() {
    const meterScale = pixelsPerMeter();
    if (!meterScale) return;
    const { width: canvasWidth, height: canvasHeight } = getCanvasSize(),
      zoom = getViewZoom();
    let gridStep = meterScale * 0.5;
    for (; gridStep * zoom < 18;) gridStep *= 2;
    for (; gridStep * zoom > 100;) gridStep /= 2;
    const canvasCorners = (
      [
        { x: 0, y: 0 },
        { x: canvasWidth, y: 0 },
        { x: canvasWidth, y: canvasHeight },
        { x: 0, y: canvasHeight },
      ] as PlanPoint[]
    ).map((corner) => screenToPlan(corner) as PlanPoint),
      minPlanX = Math.min(...canvasCorners.map((cornerForMinX) => cornerForMinX.x)),
      maxPlanX = Math.max(...canvasCorners.map((cornerForMaxX) => cornerForMaxX.x)),
      minPlanY = Math.min(...canvasCorners.map((cornerForMinY) => cornerForMinY.y)),
      maxPlanY = Math.max(...canvasCorners.map((cornerForMaxY) => cornerForMaxY.y));
    (canvasPainter.save(), (canvasPainter.lineWidth = 1));
    for (
      let gridX = Math.floor(minPlanX / gridStep) * gridStep;
      gridX <= maxPlanX;
      gridX += gridStep
    ) {
      const screenTop = planToScreen({
          x: gridX,
          y: minPlanY,
        }),
        screenBottom = planToScreen({
          x: gridX,
          y: maxPlanY,
        }),
        halfMeterIndexX = Math.round((gridX / meterScale) * 2);
      ((canvasPainter.strokeStyle =
        halfMeterIndexX % 2 === 0 ? "rgba(91, 119, 139, .13)" : "rgba(91, 119, 139, .065)"),
        canvasPainter.beginPath(),
        canvasPainter.moveTo(screenTop.x, screenTop.y),
        canvasPainter.lineTo(screenBottom.x, screenBottom.y),
        canvasPainter.stroke());
    }
    for (
      let gridY = Math.floor(minPlanY / gridStep) * gridStep;
      gridY <= maxPlanY;
      gridY += gridStep
    ) {
      const screenLeft = planToScreen({
          x: minPlanX,
          y: gridY,
        }),
        screenRight = planToScreen({
          x: maxPlanX,
          y: gridY,
        }),
        halfMeterIndexY = Math.round((gridY / meterScale) * 2);
      ((canvasPainter.strokeStyle =
        halfMeterIndexY % 2 === 0 ? "rgba(91, 119, 139, .13)" : "rgba(91, 119, 139, .065)"),
        canvasPainter.beginPath(),
        canvasPainter.moveTo(screenLeft.x, screenLeft.y),
        canvasPainter.lineTo(screenRight.x, screenRight.y),
        canvasPainter.stroke());
    }
    canvasPainter.restore();
  }
  function drawLine(fromPlan, toPlan, lineOptions: PlanLineOptions = {}) {
    const fromScreen = planToScreen(fromPlan),
      toScreen = planToScreen(toPlan);
    (canvasPainter.save(),
      (canvasPainter.strokeStyle = lineOptions.color || "#fff"),
      (canvasPainter.lineWidth = lineOptions.width || 1),
      (canvasPainter.lineCap = lineOptions.cap || "round"),
      lineOptions.dash && canvasPainter.setLineDash(lineOptions.dash),
      canvasPainter.beginPath(),
      canvasPainter.moveTo(fromScreen.x, fromScreen.y),
      canvasPainter.lineTo(toScreen.x, toScreen.y),
      canvasPainter.stroke(),
      canvasPainter.restore());
  }
  function drawPoint(planPoint, strokeColor, radiusPx = 4) {
    const screenPoint = planToScreen(planPoint);
    (canvasPainter.save(),
      (canvasPainter.fillStyle = "#0e151b"),
      (canvasPainter.strokeStyle = strokeColor),
      (canvasPainter.lineWidth = 2),
      canvasPainter.beginPath(),
      canvasPainter.arc(screenPoint.x, screenPoint.y, radiusPx, 0, Math.PI * 2),
      canvasPainter.fill(),
      canvasPainter.stroke(),
      canvasPainter.restore());
  }
  function drawOpenEndpointWarning(endpointPlan) {
    const endpointScreen = planToScreen(endpointPlan);
    (canvasPainter.save(),
      (canvasPainter.globalAlpha = 1),
      (canvasPainter.shadowColor = "rgba(255, 84, 76, .75)"),
      (canvasPainter.shadowBlur = 12),
      (canvasPainter.fillStyle = "rgba(255, 84, 76, .18)"),
      (canvasPainter.strokeStyle = "#ff6258"),
      (canvasPainter.lineWidth = 2.5),
      canvasPainter.beginPath(),
      canvasPainter.arc(endpointScreen.x, endpointScreen.y, 9, 0, Math.PI * 2),
      canvasPainter.fill(),
      canvasPainter.stroke(),
      (canvasPainter.shadowBlur = 0),
      (canvasPainter.fillStyle = "#ff6258"),
      canvasPainter.beginPath(),
      canvasPainter.arc(endpointScreen.x, endpointScreen.y, 3.2, 0, Math.PI * 2),
      canvasPainter.fill(),
      canvasPainter.restore());
  }
  function drawFloatingLabel(anchorPlan, labelText, labelColor = "#dce3e8") {
    if (!labelText) return;
    const anchorScreen = planToScreen(anchorPlan);
    (canvasPainter.save(),
      (canvasPainter.font = "600 10px ui-monospace, monospace"),
      (canvasPainter.textAlign = "center"),
      (canvasPainter.textBaseline = "middle"));
    const labelWidth = canvasPainter.measureText(labelText).width + 12;
    ((canvasPainter.fillStyle = "rgba(8, 13, 18, .88)"),
      (canvasPainter.strokeStyle = "rgba(255, 255, 255, .11)"),
      (canvasPainter.lineWidth = 1),
      canvasPainter.beginPath(),
      canvasPainter.roundRect(
        anchorScreen.x - labelWidth / 2,
        anchorScreen.y - 25,
        labelWidth,
        18,
        5,
      ),
      canvasPainter.fill(),
      canvasPainter.stroke(),
      (canvasPainter.fillStyle = labelColor),
      canvasPainter.fillText(labelText, anchorScreen.x, anchorScreen.y - 16),
      canvasPainter.restore());
  }
  return {
    drawMetricGrid: drawMetricGrid,
    drawLine: drawLine,
    drawPoint: drawPoint,
    drawOpenEndpointWarning: drawOpenEndpointWarning,
    drawFloatingLabel: drawFloatingLabel,
  };
}
