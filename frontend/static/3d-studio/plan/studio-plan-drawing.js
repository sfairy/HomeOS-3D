/**
 * 平面图叠加层的绘制工具。
 *
 * 平面视图在 three.js 画布之上叠一层 2D Canvas，本模块提供基础图元：米制网格、线段、端点、
 * 告警圈与浮标文字。入参一律是设计图平面坐标（像素，与户型数据同一套），由调用方注入的
 * planToScreen / screenToPlan 与屏幕互转。所有图元只写调用方提供的 2D 上下文且各自
 * save / restore，不向外泄漏绘图状态。
 */

// 2D canvas 拿不到 CSS 变量，所以这里的颜色必须取成具体值再画。
// paletteColor 是 utils/colors.js 里的唯一实现，按令牌名缓存，逐点调用不产生额外开销。
import { paletteColor } from "../../utils/colors.js?v=2609251920";

// 端点圆点的**深色实心**：轮廓上的彩色描边要靠它压住，才能在浅色底图与深色底图上都看清。
// 与 studio-app.js 里选择手柄的填充是同一个角色（深底 + 彩色边），所以共用同一枚工具面令牌 ——
// 这两处以前各写各的十六进制（#0e151b 与 #111820，只差几个通道）。
const pointFillColor = () => paletteColor("--hos-tool-surface", "#141a20");

/**
 * 逐字绘制文本以支持字距：Canvas 2D 原生没有字距设置，只能累计游标逐字画。
 * 整串宽度超出 maxWidthPx 时对整体横向压缩而非截断换行，保证窄空间里仍完整可读。
 */
export function drawTrackedText(textContext, text, originX, originY, trackingPx, maxWidthPx) {
  // 用展开运算符按码点切分，避免把 emoji 等代理对字符拆成两半。
  const characters = [...String(text || "")];
  if (!characters.length) {
    return 0;
  }
  const glyphWidths = characters.map(glyph => textContext.measureText(glyph).width);
  // 总宽 = 各字宽之和 + 字间距 ×（字数 - 1），单字时没有字间距。
  const totalWidth =
    glyphWidths.reduce((accumulatedWidth, glyphWidth) => accumulatedWidth + glyphWidth, 0) +
    Math.max(characters.length - 1, 0) * trackingPx;
  // 只在超宽时压缩（widthScale 上限为 1），空串或零宽时按 1 处理防止除零。
  const widthScale = totalWidth > 0 ? Math.min(1, maxWidthPx / totalWidth) : 1;
  textContext.save();
  textContext.translate(originX, originY);
  // 横向缩放交给变换矩阵，字形本身不变形到不可读。
  textContext.scale(widthScale, 1);
  textContext.textAlign = "left";
  textContext.textBaseline = "middle";
  let cursorX = 0;
  characters.forEach((character, characterIndex) => {
    textContext.fillText(character, cursorX, 0);
    // 最后一个字符后面不再补字距，否则返回值会比实际视觉宽度大。
    cursorX +=
      glyphWidths[characterIndex] + (characterIndex < characters.length - 1 ? trackingPx : 0);
  });
  textContext.restore();
  // 返回压缩后的宽度，便于调用方排布相邻元素。
  return totalWidth * widthScale;
}

/**
 * 创建一组绑定到具体画布与坐标转换函数的绘图工具。
 */
export function createPlanDrawingTools({
  context: context,
  planToScreen: planToScreen,
  screenToPlan: screenToPlan,
  pixelsPerMeter: pixelsPerMeter,
  getCanvasSize: getCanvasSize,
  getViewZoom: getViewZoom
}) {
  /**
   * 绘制米制网格：按当前缩放自适应的步长，只画可见区域内的横纵线。
   */
  function drawMetricGrid() {
    const meterScale = pixelsPerMeter();
    // 比例尺尚未就绪（如画布还没量出尺寸）时直接跳过，避免画出错误间距的网格。
    if (!meterScale) {
      return;
    }
    const { width: canvasWidth, height: canvasHeight } = getCanvasSize();
    const zoom = getViewZoom();
    // 基准步长半米，再按缩放把屏幕上的间距收敛到 18~100 像素：
    // 太密会糊成灰底，太疏则失去参照作用；翻倍 / 减半保证步长始终是 0.5 米的整数倍。
    let gridStep = meterScale * 0.5;
    while (gridStep * zoom < 18) {
      gridStep *= 2;
    }
    while (gridStep * zoom > 100) {
      gridStep /= 2;
    }
    // 只有可见区域需要画线，用画布四角反算设计图范围即可。
    const canvasCorners = [
      {
        x: 0,
        y: 0
      },
      {
        x: canvasWidth,
        y: 0
      },
      {
        x: canvasWidth,
        y: canvasHeight
      },
      {
        x: 0,
        y: canvasHeight
      }
    ].map(screenToPlan);
    const minPlanX = Math.min(...canvasCorners.map(cornerForMinX => cornerForMinX.x));
    const maxPlanX = Math.max(...canvasCorners.map(cornerForMaxX => cornerForMaxX.x));
    const minPlanY = Math.min(...canvasCorners.map(cornerForMinY => cornerForMinY.y));
    const maxPlanY = Math.max(...canvasCorners.map(cornerForMaxY => cornerForMaxY.y));
    context.save();
    context.lineWidth = 1;
    // 起点对齐到步长整数倍，保证缩放时网格线不会整体漂移。
    for (
      let gridX = Math.floor(minPlanX / gridStep) * gridStep;
      gridX <= maxPlanX;
      gridX += gridStep
    ) {
      const screenTop = planToScreen({
        x: gridX,
        y: minPlanY
      });
      const screenBottom = planToScreen({
        x: gridX,
        y: maxPlanY
      });
      // 半米索引为偶数即整米线，用更深的颜色区分主次网格。
      const halfMeterIndexX = Math.round((gridX / meterScale) * 2);
      context.strokeStyle =
        halfMeterIndexX % 2 === 0 ? "rgba(91, 119, 139, .13)" : "rgba(91, 119, 139, .065)";
      context.beginPath();
      context.moveTo(screenTop.x, screenTop.y);
      context.lineTo(screenBottom.x, screenBottom.y);
      context.stroke();
    }
    // 纵线同理；横纵两次绘制分开做，是为了让主次线色能各按各的索引判断。
    for (
      let gridY = Math.floor(minPlanY / gridStep) * gridStep;
      gridY <= maxPlanY;
      gridY += gridStep
    ) {
      const screenLeft = planToScreen({
        x: minPlanX,
        y: gridY
      });
      const screenRight = planToScreen({
        x: maxPlanX,
        y: gridY
      });
      const halfMeterIndexY = Math.round((gridY / meterScale) * 2);
      context.strokeStyle =
        halfMeterIndexY % 2 === 0 ? "rgba(91, 119, 139, .13)" : "rgba(91, 119, 139, .065)";
      context.beginPath();
      context.moveTo(screenLeft.x, screenLeft.y);
      context.lineTo(screenRight.x, screenRight.y);
      context.stroke();
    }
    context.restore();
  }

  /**
   * 绘制一条设计图线段。
   */
  function drawLine(fromPlan, toPlan, lineOptions = {}) {
    const fromScreen = planToScreen(fromPlan);
    const toScreen = planToScreen(toPlan);
    context.save();
    context.strokeStyle = lineOptions.color || "#fff";
    context.lineWidth = lineOptions.width || 1;
    // 圆头端点让首尾相接的线段不留缺口。
    context.lineCap = lineOptions.cap || "round";
    // 虚线样式由调用方给出（例如用虚线区分参考线），未给则沿用上一段实线设置。
    if (lineOptions.dash) {
      context.setLineDash(lineOptions.dash);
    }
    context.beginPath();
    context.moveTo(fromScreen.x, fromScreen.y);
    context.lineTo(toScreen.x, toScreen.y);
    context.stroke();
    context.restore();
  }

  /**
   * 绘制一个端点圆点（深色实心 + 彩色描边）。
   */
  function drawPoint(planPoint, strokeColor, radiusPx = 4) {
    const screenPoint = planToScreen(planPoint);
    context.save();
    // 深色实心 + 彩色描边，保证在浅色底图与深色底图上都能看清。
    context.fillStyle = pointFillColor();
    context.strokeStyle = strokeColor;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(screenPoint.x, screenPoint.y, radiusPx, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
  }

  /**
   * 绘制「墙体未闭合」告警标记（红色发光圈）。
   */
  function drawOpenEndpointWarning(endpointPlan) {
    const endpointScreen = planToScreen(endpointPlan);
    context.save();
    // 强制不透明：告警标记不能因为全局透明度设置而被淡化。
    context.globalAlpha = 1;
    // 红色外发光 + 半透明填充圈 + 中心实心点，共三层以突出「墙体未闭合」的端点。
    context.shadowColor = "rgba(255, 84, 76, .75)";
    context.shadowBlur = 12;
    context.fillStyle = "rgba(255, 84, 76, .18)";
    context.strokeStyle = "#ff6258";
    context.lineWidth = 2.5;
    context.beginPath();
    context.arc(endpointScreen.x, endpointScreen.y, 9, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    // 关掉阴影再画中心点，否则小圆点会被自己的发光糊掉。
    context.shadowBlur = 0;
    context.fillStyle = "#ff6258";
    context.beginPath();
    context.arc(endpointScreen.x, endpointScreen.y, 3.2, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  /**
   * 在锚点正上方绘制带底框的浮标文字标签。
   */
  function drawFloatingLabel(anchorPlan, labelText, labelColor = "#dce3e8") {
    // 空文本直接返回，省掉一次测量与一次绘制。
    if (!labelText) {
      return;
    }
    const anchorScreen = planToScreen(anchorPlan);
    context.save();
    context.font = "600 10px ui-monospace, monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    // 底框宽度跟随文本宽度（左右各留 6 像素内边距）。
    const labelWidth = context.measureText(labelText).width + 12;
    context.fillStyle = "rgba(8, 13, 18, .88)";
    context.strokeStyle = "rgba(255, 255, 255, .11)";
    context.lineWidth = 1;
    context.beginPath();
    // 标签悬在锚点上方 25 像素处，避免遮挡锚点本身的图形。
    context.roundRect(anchorScreen.x - labelWidth / 2, anchorScreen.y - 25, labelWidth, 18, 5);
    context.fill();
    context.stroke();
    context.fillStyle = labelColor;
    context.fillText(labelText, anchorScreen.x, anchorScreen.y - 16);
    context.restore();
  }
  return {
    drawMetricGrid: drawMetricGrid,
    drawLine: drawLine,
    drawPoint: drawPoint,
    drawOpenEndpointWarning: drawOpenEndpointWarning,
    drawFloatingLabel: drawFloatingLabel
  };
}
