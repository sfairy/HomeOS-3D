/**
 * 空调气流层：按模式与风速画出可动的气流示意。
 *
 * 纯 SVG 拼接，无第三方依赖；尺寸单位来自 `registry-visuals.js` 的 `appendSvgElement`。
 */
// 数值夹取统一走 utils/numbers.js。`clampNumber` 只用于三处：那三处 `clampCoercedNumber`
// 的兜底是**算出来的表达式**、存在越界的现实可能，所以要在调用点先夹一次
// （见 `utils/numbers.js` 模块头那张口径表）。
import { clampCoercedNumber } from "../../../utils/numbers.js?v=2609260900";
// 「其它」档的中性灰：与编辑器侧共用同一枚定义，原先这里写的是 #ffffff、其余四处写 #dce2e6。
import { AIRFLOW_OTHER_COLOR } from "../../../utils/airflow-colors.js?v=2609260900";
// 同门分片：entity-state
import {
  isClimateDeviceActive,
  resolveClimateEffectMode
} from "./entity-state.js?v=2609260900";
// 同门分片：registry-visuals
import { paletteColor, resolveColor } from "./registry-visuals.js?v=2609260900";

/**
 * 生成空调 / 浴霸出风动画的 SVG（data URI）。
 * 用 SVG 而非 canvas：纯矢量渐变与位移交给浏览器合成更省电，且可用 SMIL 让光带沿路径流动；
 * 用 data URI 而非内联 DOM：图片可享受缓存与解码优化。外观参数都做了夹取，越界不破图。
 */
function buildAirflowSvg(airflowProperties = {}, airflowClimateMode = "other") {
  const airflowMotionMode = airflowProperties.airflowMotion === "static" ? "static" : "dynamic";
  const airflowColor =
    airflowClimateMode === "cool"
      ? resolveColor(airflowProperties.airflowCoolColor, paletteColor("--hos-cool", "#58c4ff"))
      : airflowClimateMode === "heat"
        // 与上面 cool 分支对称：都走 paletteColor 取令牌。原先这一支只写死 #ff8a65，
        // 于是换主控色时冷气跟、热气不跟 —— 同一个 switch 的两支行为不一致。
        ? resolveColor(airflowProperties.airflowHeatColor, paletteColor("--hos-heat", "#ff8a65"))
        : resolveColor(airflowProperties.airflowOtherColor, AIRFLOW_OTHER_COLOR);
  const airflowAngleDeg = clampCoercedNumber(airflowProperties.airflowAngle, -360, 360, 7);
  const airflowLengthRatio = clampCoercedNumber(airflowProperties.airflowLength, 10, 300, 200) / 100;
  const airflowFadeRatio = clampCoercedNumber(airflowProperties.airflowFadePosition, 15, 100, 50) / 100;
  const airflowSpreadValue = clampCoercedNumber(airflowProperties.airflowSpread, 10, 300, 100);
  const airflowCurveValue = Math.tanh(
    clampCoercedNumber(airflowProperties.airflowCurve, -200, 200, 20) / 140
  );
  const airflowDensityRatio = clampCoercedNumber(airflowProperties.airflowDensity, 20, 200, 60) / 100;
  const airflowIrregularityRatio =
    clampCoercedNumber(airflowProperties.airflowIrregularity, 0, 200, 50) / 100;
  const airflowThicknessRatio = clampCoercedNumber(airflowProperties.airflowThickness, 5, 300, 40) / 100;
  const airflowStrengthRatio = clampCoercedNumber(airflowProperties.airflowStrength, 0, 500, 200) / 100;
  const airflowBlurPx = clampCoercedNumber(airflowProperties.airflowBlur, 0, 30, 6);
  const airflowSpeedSeconds = clampCoercedNumber(airflowProperties.airflowSpeed, 0.3, 12, 1);
  const airflowTopY = 6;
  const airflowBottomY = airflowTopY + (228 - airflowTopY) * airflowFadeRatio;
  const airflowMidY = airflowTopY + (airflowBottomY - airflowTopY) * 0.63;
  const airflowTailY = airflowMidY + (airflowBottomY - airflowMidY) * 0.56;
  const airflowSpreadPx = Math.min(70, Math.sqrt(airflowSpreadValue / 100) * 44);
  // 确定性伪随机（sin 哈希取小数部分）：形状要有「随机感」，
  // 但同一个控件的每次渲染必须完全一致，否则每次状态更新气流都会跳动。
  const pseudoRandomUnit = randomSeed => {
    const randomSeedProduct = Math.sin(randomSeed * 12.9898) * 43758.5453;
    return randomSeedProduct - Math.floor(randomSeedProduct);
  };
  // 主气流条数 3~12、小光点 2~4 条，都按密度比例推算并设上下限：
  // 太少看不出风，太多则 SVG 节点数暴涨（每个光点两个 rect）。
  const airflowStrandCount = Math.max(3, Math.min(12, Math.round(airflowDensityRatio * 8)));
  const airflowWispCount = Math.max(2, Math.min(4, Math.round(1.5 + airflowDensityRatio * 1.2)));
  const airflowStrandOffsets = Array.from(
    {
      length: airflowStrandCount
    },
    (strandElement, strandIndex) => {
      const strandRatio = airflowStrandCount === 1 ? 0.5 : strandIndex / (airflowStrandCount - 1);
      const strandJitter =
        (pseudoRandomUnit(strandIndex + 3) - 0.5) * 10 * airflowIrregularityRatio;
      return Math.max(
        10,
        Math.min(170, 90 + (strandRatio - 0.5) * airflowSpreadPx * 2 + strandJitter)
      );
    }
  );
  const minStrandOffset = Math.min(...airflowStrandOffsets);
  const maxStrandOffset = Math.max(...airflowStrandOffsets);
  const strandBaseOffset = airflowCurveValue >= 0 ? 168 - maxStrandOffset : minStrandOffset - 12;
  const strandCurveOffset = airflowCurveValue * Math.max(0, strandBaseOffset);
  const airflowStrandPaths = airflowStrandOffsets.map(strandOffset => {
    const strandEndOffset = strandOffset + strandCurveOffset;
    const strandControlOffset = strandOffset + strandCurveOffset * 0.42;
    return (
      "M" +
      strandOffset.toFixed(2) +
      " " +
      airflowTopY +
      "L" +
      strandOffset.toFixed(2) +
      " " +
      airflowMidY.toFixed(2) +
      "C" +
      strandOffset.toFixed(2) +
      " " +
      airflowTailY.toFixed(2) +
      " " +
      strandControlOffset.toFixed(2) +
      " " +
      airflowBottomY.toFixed(2) +
      " " +
      strandEndOffset.toFixed(2) +
      " " +
      airflowBottomY.toFixed(2)
    );
  });
  const airflowWisps = airflowStrandPaths.flatMap((strandPathD, strandPathIndex) =>
    Array.from(
      {
        length: airflowWispCount
      },
      (wispElement, wispIndex) => {
        const wispSeed = strandPathIndex * 41 + wispIndex * 67 + 11;
        const wispLength = Math.max(
          8,
          Math.min(
            112,
            (34 + pseudoRandomUnit(wispSeed) * 42 * (0.7 + airflowIrregularityRatio * 0.3)) *
              airflowLengthRatio
          )
        );
        const wispWidth = Math.max(
          0.2,
          Math.min(14, (1.5 + pseudoRandomUnit(wispSeed + 7) * 2.9) * airflowThicknessRatio)
        );
        const wispDuration =
          airflowSpeedSeconds *
          (0.8 + pseudoRandomUnit(wispSeed + 13) * 0.42 * (0.55 + airflowIrregularityRatio * 0.45));
        const wispPhase =
          (wispIndex / airflowWispCount +
            strandPathIndex * 0.067 +
            (pseudoRandomUnit(wispSeed + 19) - 0.5) * 0.08 * airflowIrregularityRatio +
            1) %
          1;
        const wispOpacity = Math.min(
          1,
          airflowStrengthRatio * (0.62 + pseudoRandomUnit(wispSeed + 29) * 0.5)
        );
        const wispMarkup =
          '<rect x="' +
          (-wispLength / 2).toFixed(2) +
          '" y="' +
          (-wispWidth * 1.3).toFixed(2) +
          '" width="' +
          wispLength.toFixed(2) +
          '" height="' +
          (wispWidth * 2.6).toFixed(2) +
          '" rx="' +
          (wispWidth * 1.3).toFixed(2) +
          '" fill="url(#wisp)" filter="url(#glow)"/><rect x="' +
          (-wispLength * 0.42).toFixed(2) +
          '" y="' +
          (-wispWidth * 0.22).toFixed(2) +
          '" width="' +
          (wispLength * 0.82).toFixed(2) +
          '" height="' +
          (wispWidth * 0.44).toFixed(2) +
          '" rx="' +
          (wispWidth * 0.22).toFixed(2) +
          '" fill="url(#core)"/>';
        // 静态模式：不循环动画，而是用一次 0.001 秒的 animateMotion 加 fill=freeze，
        // 把光点钉在 keyPoints 指定的相位上——等价于「摆好姿势不播放」。
        if (airflowMotionMode === "static") {
          return (
            '<g opacity="' +
            wispOpacity.toFixed(3) +
            '">' +
            wispMarkup +
            '<animateMotion path="' +
            strandPathD +
            '" dur="0.001s" keyPoints="' +
            wispPhase.toFixed(4) +
            ";" +
            wispPhase.toFixed(4) +
            '" keyTimes="0;1" fill="freeze" rotate="auto"/></g>'
          );
        } else {
          return (
            '<g opacity="0">' +
            wispMarkup +
            '<animate attributeName="opacity" values="0;' +
            wispOpacity.toFixed(3) +
            ";" +
            wispOpacity.toFixed(3) +
            ';0" keyTimes="0;.06;.78;1" dur="' +
            wispDuration.toFixed(3) +
            's" begin="' +
            (-wispDuration * wispPhase).toFixed(3) +
            's" repeatCount="indefinite"/><animateMotion path="' +
            strandPathD +
            '" dur="' +
            wispDuration.toFixed(3) +
            's" begin="' +
            (-wispDuration * wispPhase).toFixed(3) +
            's" rotate="auto" repeatCount="indefinite"/></g>'
          );
        }
      }
    )
  );
  // 外层固定 viewBox 0 0 180 240 并由 preserveAspectRatio=none 拉伸铺满图层，
  // 因此内部坐标是「百分比式」的，与控件实际尺寸无关；
  // 角度用整体 rotate(angle 90 120) 实现，绕画布中心旋转。
  const airflowSvgMarkup =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 240" preserveAspectRatio="none"><defs><linearGradient id="bed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' +
    airflowColor +
    '" stop-opacity="0"/><stop offset=".22" stop-color="' +
    airflowColor +
    '" stop-opacity=".25"/><stop offset=".58" stop-color="' +
    airflowColor +
    '" stop-opacity=".8"/><stop offset="1" stop-color="' +
    airflowColor +
    '" stop-opacity="0"/></linearGradient><linearGradient id="wisp"><stop offset="0" stop-color="' +
    airflowColor +
    '" stop-opacity="0"/><stop offset=".2" stop-color="' +
    airflowColor +
    '" stop-opacity=".18"/><stop offset=".52" stop-color="' +
    airflowColor +
    '"/><stop offset=".78" stop-color="' +
    airflowColor +
    '" stop-opacity=".52"/><stop offset="1" stop-color="' +
    airflowColor +
    '" stop-opacity="0"/></linearGradient><linearGradient id="core"><stop offset="0" stop-color="' +
    airflowColor +
    '" stop-opacity="0"/><stop offset=".34" stop-color="' +
    airflowColor +
    '" stop-opacity=".12"/><stop offset=".58" stop-color="' +
    airflowColor +
    '"/><stop offset=".82" stop-color="' +
    airflowColor +
    '" stop-opacity=".28"/><stop offset="1" stop-color="' +
    airflowColor +
    '" stop-opacity="0"/></linearGradient><filter id="glow" x="-120%" y="-240%" width="340%" height="580%"><feGaussianBlur stdDeviation="' +
    Math.max(0.2, airflowBlurPx * 1.35) +
    '"/><feComponentTransfer><feFuncA type="linear" slope="' +
    (airflowStrengthRatio <= 1 ? 1 : 1 + (airflowStrengthRatio - 1) * 0.9).toFixed(3) +
    '"/></feComponentTransfer></filter></defs><g transform="rotate(' +
    airflowAngleDeg +
    ' 90 120)">' +
    airflowStrandPaths
      .map(
        airflowBedPath =>
          '<path d="' +
          airflowBedPath +
          '" fill="none" stroke="url(#bed)" stroke-width="1.2" stroke-linecap="round" opacity="' +
          Math.min(1, airflowStrengthRatio * 0.075).toFixed(3) +
          '"/>'
      )
      .join("") +
    airflowWisps.join("") +
    "</g></svg>";
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(airflowSvgMarkup);
}

/**
 * 渲染空调 / 浴霸的出风图层。
 */
export function renderAirConditionerAirflowLayer(airflowLayerComponent, airflowLayerContext) {
  const airflowLayerProperties = airflowLayerComponent.properties || {};
  if (
    airflowLayerProperties.airflowVisible === false ||
    !isClimateDeviceActive(airflowLayerComponent, airflowLayerContext)
  ) {
    return null;
  }
  const airflowLayerElement = document.createElement("div");
  airflowLayerElement.className = "hb-air-conditioner-airflow-layer";
  const airflowImageElement = document.createElement("img");
  airflowImageElement.src = buildAirflowSvg(
    airflowLayerProperties,
    resolveClimateEffectMode(airflowLayerComponent, airflowLayerContext)
  );
  airflowImageElement.alt = "";
  airflowImageElement.draggable = false;
  airflowLayerElement.append(airflowImageElement);
  return airflowLayerElement;
}
