import { clampNumber, normalizeCssColor } from "./_shared";
import { isClimatePoweredOn, resolveAirflowMotionKind } from "./cover-climate-state";

type RenderPropertyBag = any;

function buildAirflowSvg(airflowProperties: RenderPropertyBag = {}, airflowModeKind = "other") {
  const airflowMotionKind = airflowProperties.airflowMotion === "static" ? "static" : "dynamic",
    airflowColor =
      airflowModeKind === "cool"
        ? normalizeCssColor(airflowProperties.airflowCoolColor, "#73c8ff")
        : airflowModeKind === "heat"
          ? normalizeCssColor(airflowProperties.airflowHeatColor, "#ff8a65")
          : normalizeCssColor(airflowProperties.airflowOtherColor, "#ffffff"),
    airflowAngleDegrees = clampNumber(airflowProperties.airflowAngle, -360, 360, 7),
    airflowLengthRatio = clampNumber(airflowProperties.airflowLength, 10, 300, 200) / 100,
    airflowFadeRatio = clampNumber(airflowProperties.airflowFadePosition, 15, 100, 50) / 100,
    airflowSpreadValue = clampNumber(airflowProperties.airflowSpread, 10, 300, 100),
    airflowCurveFactor = Math.tanh(
      clampNumber(airflowProperties.airflowCurve, -200, 200, 20) / 140,
    ),
    airflowDensityRatio = clampNumber(airflowProperties.airflowDensity, 20, 200, 60) / 100,
    airflowIrregularityRatio = clampNumber(airflowProperties.airflowIrregularity, 0, 200, 50) / 100,
    airflowThicknessRatio = clampNumber(airflowProperties.airflowThickness, 5, 300, 40) / 100,
    airflowStrengthRatio = clampNumber(airflowProperties.airflowStrength, 0, 500, 200) / 100,
    airflowBlurValue = clampNumber(airflowProperties.airflowBlur, 0, 30, 6),
    airflowSpeedValue = clampNumber(airflowProperties.airflowSpeed, 0.3, 12, 1),
    streamBaseOffset = 6,
    streamFarOffset = streamBaseOffset + (228 - streamBaseOffset) * airflowFadeRatio,
    streamMidOffset = streamBaseOffset + (streamFarOffset - streamBaseOffset) * 0.63,
    streamNearOffset = streamMidOffset + (streamFarOffset - streamMidOffset) * 0.56,
    streamSwayAmplitude = Math.min(70, 44 * Math.sqrt(airflowSpreadValue / 100)),
    pseudoRandom = (randomSeed: any) => {
      const rawRandomValue = Math.sin(randomSeed * 12.9898) * 43758.5453;
      return rawRandomValue - Math.floor(rawRandomValue);
    },
    bedPathCount = Math.max(3, Math.min(12, Math.round(8 * airflowDensityRatio))),
    wispStrandCount = Math.max(2, Math.min(4, Math.round(1.5 + 1.2 * airflowDensityRatio))),
    bedPathOffsets = Array.from(
      {
        length: bedPathCount,
      },
      (_pathSlotElement, pathOffsetIndex) => {
        const pathRatio = bedPathCount === 1 ? 0.5 : pathOffsetIndex / (bedPathCount - 1),
          lateralJitter = (pseudoRandom(pathOffsetIndex + 3) - 0.5) * 10 * airflowIrregularityRatio;
        return Math.max(
          10,
          Math.min(170, 90 + (pathRatio - 0.5) * streamSwayAmplitude * 2 + lateralJitter),
        );
      },
    ),
    minPathOffset = Math.min(...bedPathOffsets),
    maxPathOffset = Math.max(...bedPathOffsets),
    tipOffset = airflowCurveFactor >= 0 ? 168 - maxPathOffset : minPathOffset - 12,
    tipDriftAmount = airflowCurveFactor * Math.max(0, tipOffset),
    bedPathStrings = bedPathOffsets.map((pathOffset) => {
      const pathEndOffset = pathOffset + tipDriftAmount,
        pathQuarterOffset = pathOffset + tipDriftAmount * 0.42;
      return (
        "M" +
        pathOffset.toFixed(2) +
        " " +
        streamBaseOffset +
        "L" +
        pathOffset.toFixed(2) +
        " " +
        streamMidOffset.toFixed(2) +
        "C" +
        pathOffset.toFixed(2) +
        " " +
        streamNearOffset.toFixed(2) +
        " " +
        pathQuarterOffset.toFixed(2) +
        " " +
        streamFarOffset.toFixed(2) +
        " " +
        pathEndOffset.toFixed(2) +
        " " +
        streamFarOffset.toFixed(2)
      );
    }),
    wispRectMarkupList = bedPathStrings.flatMap((bedPathString, bedPathIndex) =>
      Array.from(
        {
          length: wispStrandCount,
        },
        (_strandSlotElement, strandSlotIndex) => {
          const wispSeed = bedPathIndex * 41 + strandSlotIndex * 67 + 11,
            wispWidth = Math.max(
              8,
              Math.min(
                112,
                (34 + pseudoRandom(wispSeed) * 42 * (0.7 + airflowIrregularityRatio * 0.3)) *
                  airflowLengthRatio,
              ),
            ),
            wispHeight = Math.max(
              0.2,
              Math.min(14, (1.5 + pseudoRandom(wispSeed + 7) * 2.9) * airflowThicknessRatio),
            ),
            wispVelocity =
              airflowSpeedValue *
              (0.8 + pseudoRandom(wispSeed + 13) * 0.42 * (0.55 + airflowIrregularityRatio * 0.45)),
            wispPhase =
              (strandSlotIndex / wispStrandCount +
                bedPathIndex * 0.067 +
                (pseudoRandom(wispSeed + 19) - 0.5) * 0.08 * airflowIrregularityRatio +
                1) %
              1,
            wispOpacity = Math.min(
              1,
              airflowStrengthRatio * (0.62 + pseudoRandom(wispSeed + 29) * 0.5),
            ),
            wispRectMarkup =
              '<rect x="' +
              (-wispWidth / 2).toFixed(2) +
              '" y="' +
              (-wispHeight * 1.3).toFixed(2) +
              '" width="' +
              wispWidth.toFixed(2) +
              '" height="' +
              (wispHeight * 2.6).toFixed(2) +
              '" rx="' +
              (wispHeight * 1.3).toFixed(2) +
              '" fill="url(#wisp)" filter="url(#glow)"/><rect x="' +
              (-wispWidth * 0.42).toFixed(2) +
              '" y="' +
              (-wispHeight * 0.22).toFixed(2) +
              '" width="' +
              (wispWidth * 0.82).toFixed(2) +
              '" height="' +
              (wispHeight * 0.44).toFixed(2) +
              '" rx="' +
              (wispHeight * 0.22).toFixed(2) +
              '" fill="url(#core)"/>';
          return airflowMotionKind === "static"
            ? '<g opacity="' +
                wispOpacity.toFixed(3) +
                '">' +
                wispRectMarkup +
                '<animateMotion path="' +
                bedPathString +
                '" dur="0.001s" keyPoints="' +
                wispPhase.toFixed(4) +
                ";" +
                wispPhase.toFixed(4) +
                '" keyTimes="0;1" fill="freeze" rotate="auto"/></g>'
            : '<g opacity="0">' +
                wispRectMarkup +
                '<animate attributeName="opacity" values="0;' +
                wispOpacity.toFixed(3) +
                ";" +
                wispOpacity.toFixed(3) +
                ';0" keyTimes="0;.06;.78;1" dur="' +
                wispVelocity.toFixed(3) +
                's" begin="' +
                (-wispVelocity * wispPhase).toFixed(3) +
                's" repeatCount="indefinite"/><animateMotion path="' +
                bedPathString +
                '" dur="' +
                wispVelocity.toFixed(3) +
                's" begin="' +
                (-wispVelocity * wispPhase).toFixed(3) +
                's" rotate="auto" repeatCount="indefinite"/></g>';
        },
      ),
    ),
    airflowSvgMarkup =
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
      Math.max(0.2, airflowBlurValue * 1.35) +
      '"/><feComponentTransfer><feFuncA type="linear" slope="' +
      (airflowStrengthRatio <= 1 ? 1 : 1 + (airflowStrengthRatio - 1) * 0.9).toFixed(3) +
      '"/></feComponentTransfer></filter></defs><g transform="rotate(' +
      airflowAngleDegrees +
      ' 90 120)">' +
      bedPathStrings
        .map(
          (bedPathOutline) =>
            '<path d="' +
            bedPathOutline +
            '" fill="none" stroke="url(#bed)" stroke-width="1.2" stroke-linecap="round" opacity="' +
            Math.min(1, airflowStrengthRatio * 0.075).toFixed(3) +
            '"/>',
        )
        .join("") +
      wispRectMarkupList.join("") +
      "</g></svg>";
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(airflowSvgMarkup);
}
export function renderAirConditionerAirflowLayer(
  airflowLayerComponent: any,
  airflowLayerRenderEnvironment: any,
) {
  const airflowLayerProperties = airflowLayerComponent.properties || {};
  if (
    airflowLayerProperties.airflowVisible === false ||
    !isClimatePoweredOn(airflowLayerComponent, airflowLayerRenderEnvironment)
  )
    return null;
  const airflowLayerElement = document.createElement("div");
  airflowLayerElement.className = "hb-air-conditioner-airflow-layer";
  const airflowImageElement = document.createElement("img");
  return (
    (airflowImageElement.src = buildAirflowSvg(
      airflowLayerProperties,
      resolveAirflowMotionKind(airflowLayerComponent, airflowLayerRenderEnvironment),
    )),
    (airflowImageElement.alt = ""),
    (airflowImageElement.draggable = false),
    airflowLayerElement.append(airflowImageElement),
    airflowLayerElement
  );
}
