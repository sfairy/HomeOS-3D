/** NavigationInspector — context 注入 */
import { clampNumber as clampNumber2, roundField as roundField2 } from "./editor-utils";
import { setInspectorToggle as setInspectorToggle2 } from "./editor-basic-inspectors";
import { resolveSceneControlMode as resolveSceneControlMode2 } from "../renderer/core/scene-mode";

export interface NavigationInspectorContext {
  activeProject: any;
  findReplaceableComponents: any;
  navigationActionControlsElement: any;
  navigationApplyCountElement: any;
  navigationApplyStyleElement: any;
  navigationEntityButtonElement: any;
  navigationFrameActiveOpacityElement: any;
  navigationFrameAngleElement: any;
  navigationFrameColorElement: any;
  navigationFrameIdleOpacityElement: any;
  navigationFrameVisibleElement: any;
  navigationFrameWidthElement: any;
  navigationGlowActiveSizeElement: any;
  navigationGlowActiveStrengthElement: any;
  navigationGlowAngleElement: any;
  navigationGlowColorElement: any;
  navigationGlowIdleSizeElement: any;
  navigationGlowIdleStrengthElement: any;
  navigationGlowVisibleElement: any;
  navigationHeightElement: any;
  navigationIconActiveOpacityElement: any;
  navigationIconColorElement: any;
  navigationIconIdleOpacityElement: any;
  navigationIconLeftElement: any;
  navigationIconSizeElement: any;
  navigationIconTopElement: any;
  navigationIconVisibleElement: any;
  navigationInspectorFormElement: any;
  navigationLabelElement: any;
  navigationLeftElement: any;
  navigationMainColorElement: any;
  navigationMainSizeElement: any;
  navigationMainSpacingElement: any;
  navigationMainTextElement: any;
  navigationMainTextLeftElement: any;
  navigationMainTextTopElement: any;
  navigationMainVisibleElement: any;
  navigationMainWeightElement: any;
  navigationPreviewStateByComponentId: any;
  navigationPreviewStateElement: any;
  navigationRadiusElement: any;
  navigationRotationElement: any;
  navigationScaleElement: any;
  navigationSecondaryColorElement: any;
  navigationSecondarySizeElement: any;
  navigationSecondarySpacingElement: any;
  navigationSecondaryTextElement: any;
  navigationSecondaryTextLeftElement: any;
  navigationSecondaryTextTopElement: any;
  navigationSecondaryVisibleElement: any;
  navigationSecondaryWeightElement: any;
  navigationTextActiveOpacityElement: any;
  navigationTextIdleOpacityElement: any;
  navigationTopElement: any;
  navigationTypeElement: any;
  navigationWidthElement: any;
  runClone: any;
  runExtraFallback: any;
  runVariantTwin: any;
  sceneModeControlElement: any;
  sceneModeHintElement: any;
  selectedComponentIdsSet: any;
  syncComponentActionControls: any;
}

export function syncNavigationInspector(ctx: NavigationInspectorContext, componentArg: any) {
  const {
    activeProject,
    findReplaceableComponents,
    navigationActionControlsElement,
    navigationApplyCountElement,
    navigationApplyStyleElement,
    navigationEntityButtonElement,
    navigationFrameActiveOpacityElement,
    navigationFrameAngleElement,
    navigationFrameColorElement,
    navigationFrameIdleOpacityElement,
    navigationFrameVisibleElement,
    navigationFrameWidthElement,
    navigationGlowActiveSizeElement,
    navigationGlowActiveStrengthElement,
    navigationGlowAngleElement,
    navigationGlowColorElement,
    navigationGlowIdleSizeElement,
    navigationGlowIdleStrengthElement,
    navigationGlowVisibleElement,
    navigationHeightElement,
    navigationIconActiveOpacityElement,
    navigationIconColorElement,
    navigationIconIdleOpacityElement,
    navigationIconLeftElement,
    navigationIconSizeElement,
    navigationIconTopElement,
    navigationIconVisibleElement,
    navigationInspectorFormElement,
    navigationLabelElement,
    navigationLeftElement,
    navigationMainColorElement,
    navigationMainSizeElement,
    navigationMainSpacingElement,
    navigationMainTextElement,
    navigationMainTextLeftElement,
    navigationMainTextTopElement,
    navigationMainVisibleElement,
    navigationMainWeightElement,
    navigationPreviewStateByComponentId,
    navigationPreviewStateElement,
    navigationRadiusElement,
    navigationRotationElement,
    navigationScaleElement,
    navigationSecondaryColorElement,
    navigationSecondarySizeElement,
    navigationSecondarySpacingElement,
    navigationSecondaryTextElement,
    navigationSecondaryTextLeftElement,
    navigationSecondaryTextTopElement,
    navigationSecondaryVisibleElement,
    navigationSecondaryWeightElement,
    navigationTextActiveOpacityElement,
    navigationTextIdleOpacityElement,
    navigationTopElement,
    navigationTypeElement,
    navigationWidthElement,
    runClone,
    runExtraFallback,
    runVariantTwin,
    sceneModeControlElement,
    sceneModeHintElement,
    selectedComponentIdsSet,
    syncComponentActionControls
  } = ctx;
  const availablePropertiesRecord = componentArg.properties || {},
    navigationProperties = componentArg.position || {},
    measuredBoundsText = Number(activeProject.document.canvas.width || 2778),
    navigationCanvasWidthPx = Number(activeProject.document.canvas.height || 1940),
    navigationCanvasHeightPx = Number(navigationProperties.width || 100),
    navigationWidthPx = Number(navigationProperties.height || 100),
    isNavigationWidthPx = componentArg.type === "scene-mode";
  ((navigationTypeElement.value = isNavigationWidthPx ? "情景模式" : "导航按钮"),
    (navigationEntityButtonElement
      .closest(".inspector-picker")
      .querySelector(".inspector-picker-title").textContent = isNavigationWidthPx
      ? "绑定实体"
      : "关联实体（可选）"),
    navigationInspectorFormElement.classList.toggle("is-scene-mode", isNavigationWidthPx),
    (sceneModeControlElement.closest(".inspector-section").hidden = !isNavigationWidthPx));
  const navigationHeightPxState = componentArg.bindings?.entity?.entityId || "",
    navigationHeightPx = resolveSceneControlMode2(
      availablePropertiesRecord.controlMode,
      navigationHeightPxState,
    );
  for (const navigationHeightPxElement of sceneModeControlElement.querySelectorAll(
    "[data-scene-control-mode]",
  )) {
    const isPreviewState =
      navigationHeightPxElement.dataset.sceneControlMode === navigationHeightPx;
    (navigationHeightPxElement.classList.toggle("active", isPreviewState),
      navigationHeightPxElement.setAttribute("aria-pressed", String(isPreviewState)));
  }
  ((sceneModeHintElement.textContent =
    navigationHeightPx === "switch" ? "点击切换，状态跟随设备。" : "点击执行，轻弹反馈。"),
    (navigationFrameVisibleElement.closest(".inspector-section").hidden = isNavigationWidthPx),
    (navigationGlowVisibleElement.closest(".inspector-section").hidden = isNavigationWidthPx),
    (navigationActionControlsElement.closest(".inspector-section").hidden = isNavigationWidthPx));
  for (const previewStateElement of [
    navigationMainVisibleElement,
    navigationSecondaryVisibleElement,
    navigationIconVisibleElement,
  ])
    previewStateElement.hidden = isNavigationWidthPx;
  ((navigationLabelElement.value = availablePropertiesRecord.label || ""),
    runExtraFallback(componentArg));
  const previewState = navigationPreviewStateByComponentId.get(componentArg.id) || "auto";
  for (const previewStateButtonElement of navigationPreviewStateElement.querySelectorAll(
    "[data-navigation-preview]",
  ))
    (previewStateButtonElement.classList.toggle(
      "active",
      previewStateButtonElement.dataset.navigationPreview === previewState,
    ),
      (previewStateButtonElement.textContent =
        previewStateButtonElement.dataset.navigationPreview === "auto"
          ? "自动跟随"
          : previewStateButtonElement.dataset.navigationPreview === "on"
            ? isNavigationWidthPx
              ? "激活"
              : "选择后"
            : isNavigationWidthPx
              ? "默认"
              : "选择前"));
  ((navigationMainTextElement.value = availablePropertiesRecord.mainText || "页面导航"),
    (navigationSecondaryTextElement.value =
      availablePropertiesRecord.secondaryText || "NAVIGATION"),
    setInspectorToggle2(
      navigationMainVisibleElement,
      availablePropertiesRecord.mainTextVisible !== false,
    ),
    setInspectorToggle2(
      navigationSecondaryVisibleElement,
      availablePropertiesRecord.secondaryTextVisible !== false,
    ),
    setInspectorToggle2(
      navigationIconVisibleElement,
      availablePropertiesRecord.iconVisible !== false,
    ),
    setInspectorToggle2(
      navigationFrameVisibleElement,
      availablePropertiesRecord.frameVisible !== false,
    ),
    setInspectorToggle2(
      navigationGlowVisibleElement,
      availablePropertiesRecord.glowVisible !== false,
    ),
    runClone(availablePropertiesRecord.icon || ""),
    (navigationMainColorElement.value = availablePropertiesRecord.mainColor || "#e9edf0"),
    (navigationSecondaryColorElement.value = availablePropertiesRecord.secondaryColor || "#e9edf0"),
    (navigationMainSizeElement.value = roundField2(
      Number(availablePropertiesRecord.mainSize ?? 30),
    )),
    (navigationSecondarySizeElement.value = roundField2(
      Number(availablePropertiesRecord.secondarySize ?? 11),
    )),
    (navigationMainWeightElement.value = roundField2(
      Number(availablePropertiesRecord.mainWeight ?? 0),
    )),
    (navigationSecondaryWeightElement.value = roundField2(
      Number(availablePropertiesRecord.secondaryWeight ?? 0),
    )),
    (navigationMainSpacingElement.value = roundField2(
      Number(availablePropertiesRecord.mainSpacing ?? 8),
    )),
    (navigationSecondarySpacingElement.value = roundField2(
      Number(availablePropertiesRecord.secondarySpacing ?? 3),
    )));
  const navigationTextLeft = Number(availablePropertiesRecord.textLeft ?? 27.5),
    navigationTextTop = Number(availablePropertiesRecord.textTop ?? 81.5);
  ((navigationMainTextLeftElement.value = roundField2(
    Number(availablePropertiesRecord.mainTextLeft ?? navigationTextLeft),
  )),
    (navigationMainTextTopElement.value = roundField2(
      Number(availablePropertiesRecord.mainTextTop ?? navigationTextTop - 1800 / 64.36),
    )),
    (navigationSecondaryTextLeftElement.value = roundField2(
      Number(availablePropertiesRecord.secondaryTextLeft ?? navigationTextLeft),
    )),
    (navigationSecondaryTextTopElement.value = roundField2(
      Number(availablePropertiesRecord.secondaryTextTop ?? navigationTextTop),
    )),
    (navigationTextIdleOpacityElement.value = roundField2(
      clampNumber2(
        Number(
          availablePropertiesRecord.textIdleOpacity ?? availablePropertiesRecord.idleOpacity ?? 0.3,
        ) * 100,
        0,
        100,
      ),
    )),
    (navigationTextActiveOpacityElement.value = roundField2(
      clampNumber2(
        Number(
          availablePropertiesRecord.textActiveOpacity ??
            availablePropertiesRecord.activeOpacity ??
            0.96,
        ) * 100,
        0,
        100,
      ),
    )),
    (navigationIconColorElement.value = availablePropertiesRecord.iconColor || "#e9edf0"),
    (navigationIconSizeElement.value = roundField2(
      Number(availablePropertiesRecord.iconSize ?? 50),
    )),
    (navigationIconLeftElement.value = roundField2(
      Number(availablePropertiesRecord.iconLeft ?? 14),
    )),
    (navigationIconTopElement.value = roundField2(Number(availablePropertiesRecord.iconTop ?? 50))),
    (navigationIconIdleOpacityElement.value = roundField2(
      clampNumber2(
        Number(
          availablePropertiesRecord.iconIdleOpacity ?? availablePropertiesRecord.idleOpacity ?? 0.3,
        ) * 100,
        0,
        100,
      ),
    )),
    (navigationIconActiveOpacityElement.value = roundField2(
      clampNumber2(
        Number(
          availablePropertiesRecord.iconActiveOpacity ??
            availablePropertiesRecord.activeOpacity ??
            0.96,
        ) * 100,
        0,
        100,
      ),
    )),
    (navigationFrameColorElement.value = availablePropertiesRecord.frameColor || "#d9e0e6"),
    (navigationFrameWidthElement.value = roundField2(
      Number(availablePropertiesRecord.frameWidth ?? 2),
    )),
    (navigationFrameIdleOpacityElement.value = roundField2(
      clampNumber2(Number(availablePropertiesRecord.frameIdleOpacity ?? 0.48) * 100, 0, 100),
    )),
    (navigationFrameActiveOpacityElement.value = roundField2(
      clampNumber2(Number(availablePropertiesRecord.frameActiveOpacity ?? 0.98) * 100, 0, 100),
    )),
    (navigationFrameAngleElement.value = roundField2(
      clampNumber2(Number(availablePropertiesRecord.frameAngle ?? 45), 0, 360),
    )),
    (navigationGlowColorElement.value = availablePropertiesRecord.glowColor || "#f2f6fa"),
    (navigationGlowAngleElement.value = roundField2(
      clampNumber2(Number(availablePropertiesRecord.glowAngle ?? 45), 0, 360),
    )),
    (navigationGlowIdleStrengthElement.value = roundField2(
      clampNumber2(Number(availablePropertiesRecord.glowIdleStrength ?? 0.5) * 100, 0, 500),
    )),
    (navigationGlowIdleSizeElement.value = roundField2(
      clampNumber2(Number(availablePropertiesRecord.glowIdleSize ?? 1.5) * 100, 0, 300),
    )),
    (navigationGlowActiveStrengthElement.value = roundField2(
      clampNumber2(Number(availablePropertiesRecord.glowActiveStrength ?? 2.2) * 100, 0, 500),
    )),
    (navigationGlowActiveSizeElement.value = roundField2(
      clampNumber2(Number(availablePropertiesRecord.glowActiveSize ?? 3) * 100, 0, 300),
    )),
    (navigationRadiusElement.value = roundField2(
      clampNumber2(Number(availablePropertiesRecord.radius ?? 0.5) * 100, 0, 50),
    )),
    (navigationLeftElement.value = roundField2(
      clampNumber2(
        ((Number(navigationProperties.x || 0) + navigationCanvasHeightPx / 2) /
          measuredBoundsText) *
          100,
        0,
        100,
      ),
    )),
    (navigationTopElement.value = roundField2(
      clampNumber2(
        ((Number(navigationProperties.y || 0) + navigationWidthPx / 2) / navigationCanvasWidthPx) *
          100,
        0,
        100,
      ),
    )),
    (navigationWidthElement.value = roundField2(
      clampNumber2((navigationCanvasHeightPx / measuredBoundsText) * 100, 0.1, 100),
    )),
    (navigationHeightElement.value = roundField2(
      clampNumber2((navigationWidthPx / navigationCanvasWidthPx) * 100, 0.1, 100),
    )),
    (navigationScaleElement.value = roundField2(
      clampNumber2(Number(componentArg.style?.scale || 1) * 100, 1, 500),
    )),
    (navigationRotationElement.value = roundField2(Number(navigationProperties.rotation || 0))));
  const isNavigationMultiSelection = selectedComponentIdsSet.size > 1;
  ((navigationWidthElement.disabled = isNavigationMultiSelection),
    (navigationHeightElement.disabled = isNavigationMultiSelection),
    (navigationScaleElement.disabled = false),
    (navigationRotationElement.disabled = false));
  const navigationReplaceableCount = findReplaceableComponents(componentArg).length,
    navigationApplyTargetCount = runVariantTwin(componentArg).length;
  ((navigationApplyStyleElement.disabled =
    !navigationReplaceableCount || !navigationApplyTargetCount),
    (navigationApplyCountElement.textContent = navigationApplyTargetCount + " 项修改"),
    (navigationApplyStyleElement.textContent = "一键应用到同类型控件"),
    syncComponentActionControls(componentArg, navigationActionControlsElement));

}
