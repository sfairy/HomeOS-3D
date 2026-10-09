/** AirConditionerInspector — context 注入 */
import { clampNumber as clampNumber2, normalizedFontWeight as normalizedFontWeight2, roundField as roundField2 } from "./editor-utils";
import { setInspectorToggle as setInspectorToggle2 } from "./editor-basic-inspectors";
import { airflowCanvasOffsetBounds as airflowCanvasOffsetBounds2 } from "../renderer/core/renderer";

export interface AirConditionerInspectorContext {
  activeProject: any;
  airConditionerActionControlsElement: any;
  airConditionerActionSectionElement: any;
  airConditionerAirflowAngleElement: any;
  airConditionerAirflowBlurElement: any;
  airConditionerAirflowCoolColorElement: any;
  airConditionerAirflowCurveElement: any;
  airConditionerAirflowDensityElement: any;
  airConditionerAirflowFadeElement: any;
  airConditionerAirflowHeatColorElement: any;
  airConditionerAirflowHeightElement: any;
  airConditionerAirflowIrregularityElement: any;
  airConditionerAirflowLengthElement: any;
  airConditionerAirflowMotionElement: any;
  airConditionerAirflowOffsetXElement: any;
  airConditionerAirflowOffsetYElement: any;
  airConditionerAirflowOtherColorElement: any;
  airConditionerAirflowRotationElement: any;
  airConditionerAirflowScaleElement: any;
  airConditionerAirflowSectionElement: any;
  airConditionerAirflowSpeedElement: any;
  airConditionerAirflowSpreadElement: any;
  airConditionerAirflowStrengthElement: any;
  airConditionerAirflowThicknessElement: any;
  airConditionerAirflowVisibleElement: any;
  airConditionerAirflowWidthElement: any;
  airConditionerApplyCountElement: any;
  airConditionerApplyStyleElement: any;
  airConditionerBadgeColorElement: any;
  airConditionerBadgeOpacityElement: any;
  airConditionerBadgeSizeElement: any;
  airConditionerButtonSectionElement: any;
  airConditionerDeviceTypeElement: any;
  airConditionerHeightElement: any;
  airConditionerIconLeftElement: any;
  airConditionerIconOffColorElement: any;
  airConditionerIconOnColorElement: any;
  airConditionerIconTopElement: any;
  airConditionerIconVisibleElement: any;
  airConditionerLabelElement: any;
  airConditionerLayerByComponentId: any;
  airConditionerLayerOptionsElement: any;
  airConditionerLeftElement: any;
  airConditionerMainColorElement: any;
  airConditionerMainLeftElement: any;
  airConditionerMainSizeElement: any;
  airConditionerMainSpacingElement: any;
  airConditionerMainTextElement: any;
  airConditionerMainTopElement: any;
  airConditionerMainVisibleElement: any;
  airConditionerMainWeightElement: any;
  airConditionerPreviewDetailsElement: any;
  airConditionerPreviewStateByComponentId: any;
  airConditionerPreviewStateElement: any;
  airConditionerRotationElement: any;
  airConditionerScaleElement: any;
  airConditionerSecondaryColorElement: any;
  airConditionerSecondaryLeftElement: any;
  airConditionerSecondarySizeElement: any;
  airConditionerSecondarySpacingElement: any;
  airConditionerSecondaryTextElement: any;
  airConditionerSecondaryTopElement: any;
  airConditionerSecondaryVisibleElement: any;
  airConditionerSecondaryWeightElement: any;
  airConditionerSymbolSizeElement: any;
  airConditionerTopElement: any;
  airConditionerTransformSectionElement: any;
  airConditionerWidthElement: any;
  editorRenderer: any;
  findReplaceableComponents: any;
  runAltLeft: any;
  runExtraFallback: any;
  selectedComponentIdsSet: any;
  syncComponentActionControls: any;
}

export function syncAirConditionerInspector(ctx: AirConditionerInspectorContext, componentArg: any) {
  const {
    activeProject,
    airConditionerActionControlsElement,
    airConditionerActionSectionElement,
    airConditionerAirflowAngleElement,
    airConditionerAirflowBlurElement,
    airConditionerAirflowCoolColorElement,
    airConditionerAirflowCurveElement,
    airConditionerAirflowDensityElement,
    airConditionerAirflowFadeElement,
    airConditionerAirflowHeatColorElement,
    airConditionerAirflowHeightElement,
    airConditionerAirflowIrregularityElement,
    airConditionerAirflowLengthElement,
    airConditionerAirflowMotionElement,
    airConditionerAirflowOffsetXElement,
    airConditionerAirflowOffsetYElement,
    airConditionerAirflowOtherColorElement,
    airConditionerAirflowRotationElement,
    airConditionerAirflowScaleElement,
    airConditionerAirflowSectionElement,
    airConditionerAirflowSpeedElement,
    airConditionerAirflowSpreadElement,
    airConditionerAirflowStrengthElement,
    airConditionerAirflowThicknessElement,
    airConditionerAirflowVisibleElement,
    airConditionerAirflowWidthElement,
    airConditionerApplyCountElement,
    airConditionerApplyStyleElement,
    airConditionerBadgeColorElement,
    airConditionerBadgeOpacityElement,
    airConditionerBadgeSizeElement,
    airConditionerButtonSectionElement,
    airConditionerDeviceTypeElement,
    airConditionerHeightElement,
    airConditionerIconLeftElement,
    airConditionerIconOffColorElement,
    airConditionerIconOnColorElement,
    airConditionerIconTopElement,
    airConditionerIconVisibleElement,
    airConditionerLabelElement,
    airConditionerLayerByComponentId,
    airConditionerLayerOptionsElement,
    airConditionerLeftElement,
    airConditionerMainColorElement,
    airConditionerMainLeftElement,
    airConditionerMainSizeElement,
    airConditionerMainSpacingElement,
    airConditionerMainTextElement,
    airConditionerMainTopElement,
    airConditionerMainVisibleElement,
    airConditionerMainWeightElement,
    airConditionerPreviewDetailsElement,
    airConditionerPreviewStateByComponentId,
    airConditionerPreviewStateElement,
    airConditionerRotationElement,
    airConditionerScaleElement,
    airConditionerSecondaryColorElement,
    airConditionerSecondaryLeftElement,
    airConditionerSecondarySizeElement,
    airConditionerSecondarySpacingElement,
    airConditionerSecondaryTextElement,
    airConditionerSecondaryTopElement,
    airConditionerSecondaryVisibleElement,
    airConditionerSecondaryWeightElement,
    airConditionerSymbolSizeElement,
    airConditionerTopElement,
    airConditionerTransformSectionElement,
    airConditionerWidthElement,
    editorRenderer,
    findReplaceableComponents,
    runAltLeft,
    runExtraFallback,
    selectedComponentIdsSet,
    syncComponentActionControls
  } = ctx;
  const airConditionerProperties = componentArg.properties || {},
    airConditionerPosition = componentArg.position || {},
    airConditionerCanvasWidthPx = Number(activeProject.document.canvas.width || 2778),
    airConditionerCanvasHeightPx = Number(activeProject.document.canvas.height || 1940),
    airConditionerWidthPx = Number(airConditionerPosition.width || 100),
    airConditionerHeightPx = Number(airConditionerPosition.height || 100);
  airConditionerLabelElement.value = airConditionerProperties.label || "";
  const deviceType2 = ["air-conditioner", "bath-heater"].includes(
    airConditionerProperties.deviceType,
  )
    ? airConditionerProperties.deviceType
    : "auto";
  for (const deviceTypeButtonElement of airConditionerDeviceTypeElement.querySelectorAll(
    "[data-air-conditioner-device-type]",
  )) {
    const isDeviceTypeActive =
      deviceTypeButtonElement.dataset.airConditionerDeviceType === deviceType2;
    (deviceTypeButtonElement.classList.toggle("active", isDeviceTypeActive),
      deviceTypeButtonElement.setAttribute("aria-pressed", String(isDeviceTypeActive)));
  }
  ((airConditionerPreviewDetailsElement.textContent =
    deviceType2 === "bath-heater" ? "预览浴霸详情" : "预览空调 / 浴霸详情"),
    runExtraFallback(componentArg),
    (airConditionerPreviewDetailsElement.disabled =
      !componentArg.bindings?.entity?.entityId),
    (airConditionerIconOffColorElement.value = airConditionerProperties.iconOffColor || "#9aa5ad"),
    (airConditionerIconOnColorElement.value = airConditionerProperties.iconOnColor || "#73c8ff"),
    (airConditionerBadgeColorElement.value = airConditionerProperties.badgeColor || "#5b5e66"),
    (airConditionerBadgeOpacityElement.value = roundField2(
      Number(airConditionerProperties.badgeOpacity ?? 0.58) * 100,
    )),
    (airConditionerSymbolSizeElement.value = roundField2(
      Number(airConditionerProperties.symbolSize ?? 14),
    )),
    (airConditionerBadgeSizeElement.value = roundField2(
      Number(airConditionerProperties.badgeSize ?? 28),
    )),
    (airConditionerIconLeftElement.value = roundField2(
      Number(airConditionerProperties.iconLeft ?? 20),
    )),
    (airConditionerIconTopElement.value = roundField2(
      Number(airConditionerProperties.iconTop ?? 50),
    )),
    setInspectorToggle2(
      airConditionerIconVisibleElement,
      airConditionerProperties.iconVisible !== false,
    ),
    (airConditionerMainTextElement.value = airConditionerProperties.mainText || ""),
    (airConditionerMainColorElement.value = airConditionerProperties.mainColor || "#c7c8cb"),
    (airConditionerMainSizeElement.value = roundField2(
      Number(airConditionerProperties.mainSize ?? 21),
    )),
    (airConditionerMainWeightElement.value = roundField2(
      normalizedFontWeight2(airConditionerProperties.mainWeight, 0.24),
    )),
    (airConditionerMainSpacingElement.value = roundField2(
      Number(airConditionerProperties.mainSpacing ?? 0.5),
    )),
    (airConditionerMainLeftElement.value = roundField2(
      Number(airConditionerProperties.mainTextLeft ?? 39),
    )),
    (airConditionerMainTopElement.value = roundField2(
      Number(airConditionerProperties.mainTextTop ?? 40),
    )),
    setInspectorToggle2(
      airConditionerMainVisibleElement,
      airConditionerProperties.mainTextVisible !== false,
    ),
    (airConditionerSecondaryTextElement.value = airConditionerProperties.secondaryText || ""),
    (airConditionerSecondaryColorElement.value =
      airConditionerProperties.secondaryColor || "#75777d"),
    (airConditionerSecondarySizeElement.value = roundField2(
      Number(airConditionerProperties.secondarySize ?? 12),
    )),
    (airConditionerSecondaryWeightElement.value = roundField2(
      normalizedFontWeight2(airConditionerProperties.secondaryWeight, 0.12),
    )),
    (airConditionerSecondarySpacingElement.value = roundField2(
      Number(airConditionerProperties.secondarySpacing ?? 0.3),
    )),
    (airConditionerSecondaryLeftElement.value = roundField2(
      Number(airConditionerProperties.secondaryTextLeft ?? 39),
    )),
    (airConditionerSecondaryTopElement.value = roundField2(
      Number(airConditionerProperties.secondaryTextTop ?? 67),
    )),
    setInspectorToggle2(
      airConditionerSecondaryVisibleElement,
      airConditionerProperties.secondaryTextVisible !== false,
    ),
    setInspectorToggle2(
      airConditionerAirflowVisibleElement,
      airConditionerProperties.airflowVisible !== false,
    ));
  const airflowMotionMode =
    airConditionerProperties.airflowMotion === "static" ? "static" : "dynamic";
  for (const airflowMotionButtonElement of airConditionerAirflowMotionElement.querySelectorAll(
    "[data-airflow-motion]",
  )) {
    const isAirflowMotionActive =
      airflowMotionButtonElement.dataset.airflowMotion === airflowMotionMode;
    (airflowMotionButtonElement.classList.toggle("active", isAirflowMotionActive),
      airflowMotionButtonElement.setAttribute("aria-pressed", String(isAirflowMotionActive)));
  }
  ((airConditionerAirflowCoolColorElement.value =
    airConditionerProperties.airflowCoolColor || "#73c8ff"),
    (airConditionerAirflowHeatColorElement.value =
      airConditionerProperties.airflowHeatColor || "#ff8a65"),
    (airConditionerAirflowOtherColorElement.value =
      airConditionerProperties.airflowOtherColor || "#dce2e6"),
    (airConditionerAirflowAngleElement.value = roundField2(
      Number(airConditionerProperties.airflowAngle ?? 7),
    )),
    (airConditionerAirflowCurveElement.value = roundField2(
      Number(airConditionerProperties.airflowCurve ?? 20),
    )),
    (airConditionerAirflowLengthElement.value = roundField2(
      Number(airConditionerProperties.airflowLength ?? 200),
    )),
    (airConditionerAirflowFadeElement.value = roundField2(
      Number(airConditionerProperties.airflowFadePosition ?? 50),
    )),
    (airConditionerAirflowSpreadElement.value = roundField2(
      Number(airConditionerProperties.airflowSpread ?? 100),
    )),
    (airConditionerAirflowDensityElement.value = roundField2(
      Number(airConditionerProperties.airflowDensity ?? 60),
    )),
    (airConditionerAirflowIrregularityElement.value = roundField2(
      Number(airConditionerProperties.airflowIrregularity ?? 50),
    )),
    (airConditionerAirflowThicknessElement.value = roundField2(
      Number(airConditionerProperties.airflowThickness ?? 40),
    )),
    (airConditionerAirflowStrengthElement.value = roundField2(
      Number(airConditionerProperties.airflowStrength ?? 200),
    )),
    (airConditionerAirflowBlurElement.value = roundField2(
      Number(airConditionerProperties.airflowBlur ?? 6),
    )),
    (airConditionerAirflowSpeedElement.value = roundField2(
      Number(airConditionerProperties.airflowSpeed ?? 1),
    )),
    (airConditionerAirflowSpeedElement.disabled = airflowMotionMode === "static"));
  const airflowOffsetLimits = airflowCanvasOffsetBounds2(
    componentArg,
    activeProject.document.canvas,
  );
  ((airConditionerAirflowOffsetXElement.min = String(roundField2(airflowOffsetLimits.minX))),
    (airConditionerAirflowOffsetXElement.max = String(roundField2(airflowOffsetLimits.maxX))),
    (airConditionerAirflowOffsetYElement.min = String(roundField2(airflowOffsetLimits.minY))),
    (airConditionerAirflowOffsetYElement.max = String(roundField2(airflowOffsetLimits.maxY))),
    (airConditionerAirflowOffsetXElement.value = roundField2(
      Number(airConditionerProperties.airflowOffsetX ?? -75),
    )),
    (airConditionerAirflowOffsetYElement.value = roundField2(
      Number(airConditionerProperties.airflowOffsetY ?? 34),
    )),
    (airConditionerAirflowWidthElement.value = roundField2(
      Number(airConditionerProperties.airflowWidth ?? 64),
    )),
    (airConditionerAirflowHeightElement.value = roundField2(
      Number(airConditionerProperties.airflowHeight ?? 125),
    )),
    (airConditionerAirflowScaleElement.value = roundField2(
      Number(airConditionerProperties.airflowScale ?? 1) * 100,
    )),
    (airConditionerAirflowRotationElement.value = roundField2(
      Number(airConditionerProperties.airflowRotation ?? -3),
    )),
    (airConditionerLeftElement.value = roundField2(
      clampNumber2(
        ((Number(airConditionerPosition.x || 0) + airConditionerWidthPx / 2) /
          airConditionerCanvasWidthPx) *
          100,
        0,
        100,
      ),
    )),
    (airConditionerTopElement.value = roundField2(
      clampNumber2(
        ((Number(airConditionerPosition.y || 0) + airConditionerHeightPx / 2) /
          airConditionerCanvasHeightPx) *
          100,
        0,
        100,
      ),
    )),
    (airConditionerWidthElement.value = roundField2(
      (airConditionerWidthPx / airConditionerCanvasWidthPx) * 100,
    )),
    (airConditionerHeightElement.value = roundField2(
      (airConditionerHeightPx / airConditionerCanvasHeightPx) * 100,
    )),
    (airConditionerScaleElement.value = roundField2(
      Number(componentArg.style?.scale || 1) * 100,
    )),
    (airConditionerRotationElement.value = roundField2(
      Number(airConditionerPosition.rotation || 0),
    )));
  const activeLayerName =
    airConditionerLayerByComponentId.get(componentArg.id) === "airflow"
      ? "airflow"
      : "button";
  if (!airConditionerPreviewStateByComponentId.has(componentArg.id)) {
    const layerPreviewState = activeLayerName === "airflow" ? "on" : "off";
    (airConditionerPreviewStateByComponentId.set(componentArg.id, layerPreviewState),
      editorRenderer?.setComponentPreviewState(componentArg.id, layerPreviewState));
  }
  const airConditionerPreviewState =
    airConditionerPreviewStateByComponentId.get(componentArg.id) || "auto";
  for (const acPreviewStateButtonElement of airConditionerPreviewStateElement.querySelectorAll(
    "[data-air-conditioner-preview]",
  )) {
    const isAcPreviewStateActive =
      acPreviewStateButtonElement.dataset.airConditionerPreview === airConditionerPreviewState;
    (acPreviewStateButtonElement.classList.toggle("active", isAcPreviewStateActive),
      acPreviewStateButtonElement.setAttribute("aria-pressed", String(isAcPreviewStateActive)));
  }
  editorRenderer?.setComponentSelectionLayer(componentArg.id, activeLayerName);
  for (const layerOptionElement of airConditionerLayerOptionsElement.querySelectorAll(
    "[data-air-conditioner-layer]",
  )) {
    const isLayerSelected = layerOptionElement.dataset.airConditionerLayer === activeLayerName;
    (layerOptionElement.classList.toggle("active", isLayerSelected),
      layerOptionElement.setAttribute("aria-pressed", String(isLayerSelected)));
  }
  const isAirflowLayer = activeLayerName === "airflow";
  ((airConditionerButtonSectionElement.hidden = isAirflowLayer),
    (airConditionerTransformSectionElement.hidden = isAirflowLayer),
    (airConditionerActionSectionElement.hidden = isAirflowLayer),
    (airConditionerAirflowSectionElement.hidden = !isAirflowLayer));
  const isAirConditionerMultiSelection = selectedComponentIdsSet.size > 1;
  for (const acSizeInputElement of [airConditionerWidthElement, airConditionerHeightElement])
    acSizeInputElement.disabled = isAirConditionerMultiSelection;
  ((airConditionerRotationElement.disabled = false), (airConditionerScaleElement.disabled = false));
  const airConditionerReplaceableCount = findReplaceableComponents(componentArg).length,
    airConditionerApplyTargetCount = runAltLeft(componentArg).length;
  ((airConditionerApplyStyleElement.disabled =
    !airConditionerReplaceableCount || !airConditionerApplyTargetCount),
    (airConditionerApplyCountElement.textContent = airConditionerApplyTargetCount + " 项修改"),
    syncComponentActionControls(componentArg, airConditionerActionControlsElement));

}
