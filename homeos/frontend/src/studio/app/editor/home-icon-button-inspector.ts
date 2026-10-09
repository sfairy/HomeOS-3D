/** 图标按钮 / 设备按钮 / 人在传感器检查器 sync（context 注入）。 */
import { clampNumber as clampNumber2, normalizedFontWeight as normalizedFontWeight2, roundField as roundField2 } from "./editor-utils";
import { setInspectorToggle as setInspectorToggle2 } from "./editor-basic-inspectors";

export interface IconButtonInspectorContext {
  activeProject: any;
  selectedComponentIdsSet: Set<any>;
  doorWindowPerspectiveEditIdsSet: Set<any>;
  iconButtonPreviewStateByComponentId: Map<any, any>;
  editorRenderer: any;
  findReplaceableComponents: (source: any) => any[];
  appliedStylePropertyKey: (component: any) => any[];
  syncComponentActionControls: (component: any, controlsEl: any) => void;
  loadNavigationIconOptions: (selectEl: any) => void;
  runExtraFallback: (component: any) => void;
  runSplit: (icon: any) => void;
  iconButtonTypeElement: any;
  iconButtonTypeLabelElement: any;
  presenceSensorKindLabelElement: any;
  presenceSensorKindElement: any;
  iconButtonMainHeadingElement: any;
  iconButtonSecondaryHeadingElement: any;
  iconButtonMainContentLabelElement: any;
  iconButtonSecondaryContentLabelElement: any;
  iconButtonMainTextElement: any;
  iconButtonSecondaryTextElement: any;
  iconButtonPreviewControlElement: any;
  iconButtonActionSectionElement: any;
  iconButtonPreviewDetailsElement: any;
  presenceMotionSectionElement: any;
  doorWindowPerspectiveSectionElement: any;
  doorWindowPerspectiveEditElement: any;
  doorWindowPerspectiveSaveElement: any;
  iconButtonIconButtonElement: any;
  iconButtonFillSectionElement: any;
  iconButtonFrameSectionElement: any;
  iconButtonSoftLightSectionElement: any;
  iconButtonGlowSectionElement: any;
  iconButtonIconColorLabelElement: any;
  deviceButtonIconVisibleElement: any;
  deviceButtonMainVisibleElement: any;
  deviceButtonSecondaryVisibleElement: any;
  deviceButtonIconOnColorLabelElement: any;
  deviceButtonBadgeColorLabelElement: any;
  deviceButtonBadgeOpacityLabelElement: any;
  iconButtonIconSizeLabelElement: any;
  deviceButtonSymbolSizeLabelElement: any;
  deviceButtonBadgeSizeLabelElement: any;
  deviceButtonStatePrecisionLabelElement: any;
  iconButtonIconLeftElement: any;
  iconButtonIconTopElement: any;
  iconButtonIconOffOpacityLabelElement: any;
  iconButtonIconOnOpacityLabelElement: any;
  iconButtonMainOffOpacityLabelElement: any;
  iconButtonMainOnOpacityLabelElement: any;
  iconButtonSecondaryOffOpacityLabelElement: any;
  iconButtonSecondaryOnOpacityLabelElement: any;
  iconButtonLabelElement: any;
  iconButtonIconColorElement: any;
  deviceButtonIconOnColorElement: any;
  deviceButtonBadgeColorElement: any;
  deviceButtonBadgeOpacityElement: any;
  deviceButtonBadgeSizeElement: any;
  deviceButtonSymbolSizeElement: any;
  deviceButtonStatePrecisionElement: any;
  presenceHaloScaleXElement: any;
  presenceHaloScaleYElement: any;
  presenceHaloRotationElement: any;
  presenceHaloOpacityElement: any;
  presencePersonScaleElement: any;
  presencePersonRotationElement: any;
  presencePersonOpacityElement: any;
  presenceOrbitDurationElement: any;
  presenceHaloVisibleElement: any;
  presencePersonVisibleElement: any;
  iconButtonIconSizeElement: any;
  iconButtonIconOffOpacityElement: any;
  iconButtonIconOnOpacityElement: any;
  iconButtonMainColorElement: any;
  iconButtonSecondaryColorElement: any;
  iconButtonMainOffOpacityElement: any;
  iconButtonMainOnOpacityElement: any;
  iconButtonSecondaryOffOpacityElement: any;
  iconButtonSecondaryOnOpacityElement: any;
  iconButtonMainSizeElement: any;
  iconButtonSecondarySizeElement: any;
  iconButtonMainWeightElement: any;
  iconButtonSecondaryWeightElement: any;
  iconButtonMainSpacingElement: any;
  iconButtonSecondarySpacingElement: any;
  iconButtonMainLeftElement: any;
  iconButtonMainTopElement: any;
  iconButtonSecondaryLeftElement: any;
  iconButtonSecondaryTopElement: any;
  iconButtonOnFillVisibleElement: any;
  iconButtonOnFillColorElement: any;
  iconButtonOnFillStrengthElement: any;
  iconButtonOnFillFadeDurationElement: any;
  iconButtonFrameVisibleElement: any;
  iconButtonFrameWidthElement: any;
  iconButtonFrameAngleElement: any;
  iconButtonFrameOffOpacityElement: any;
  iconButtonFrameOnOpacityElement: any;
  iconButtonCutCornerElement: any;
  iconButtonSoftLightVisibleElement: any;
  iconButtonSoftLightColorElement: any;
  iconButtonSoftLightStrengthElement: any;
  iconButtonSoftLightSizeElement: any;
  iconButtonSoftLightAngleElement: any;
  iconButtonGlowVisibleElement: any;
  iconButtonGlowColorElement: any;
  iconButtonGlowStrengthElement: any;
  iconButtonGlowSizeElement: any;
  iconButtonGlowAngleElement: any;
  iconButtonLeftElement: any;
  iconButtonTopElement: any;
  iconButtonWidthElement: any;
  iconButtonHeightElement: any;
  iconButtonScaleElement: any;
  iconButtonRotationElement: any;
  iconButtonPreviewStateElement: any;
  iconButtonApplyStyleElement: any;
  iconButtonApplyCountElement: any;
  iconButtonActionControlsElement: any;
}

export function syncIconButtonInspector(ctx: IconButtonInspectorContext, iconButtonComponent: any) {
  const iconButtonProperties = iconButtonComponent.properties || {},
    isPresenceSensor = iconButtonComponent.type === "presence-sensor",
    sensorKind = ["presence", "door-window", "water-leak", "smoke", "natural-gas"].includes(
      iconButtonProperties.sensorKind,
    )
      ? iconButtonProperties.sensorKind
      : "presence",
    sensorKindLabel = ({
      presence: "人体/人在传感器",
      "door-window": "门窗传感器",
      "water-leak": "水浸传感器",
      smoke: "烟雾传感器",
      "natural-gas": "天然气传感器",
    } as any)[sensorKind],
    isDeviceButton = iconButtonComponent.type === "device-button" || isPresenceSensor,
    iconButtonPosition = iconButtonComponent.position || {},
    iconButtonCanvasWidthPx = Number(ctx.activeProject.document.canvas.width || 2778),
    iconButtonCanvasHeightPx = Number(ctx.activeProject.document.canvas.height || 1940),
    iconButtonWidthPx = Number(iconButtonPosition.width || 100),
    iconButtonHeightPx = Number(iconButtonPosition.height || 100);
  ((ctx.iconButtonTypeElement.value = isPresenceSensor
    ? sensorKindLabel
    : isDeviceButton
      ? "设备按钮"
      : "图标按钮"),
    ctx.iconButtonTypeLabelElement.classList.remove("inspector-full-row"),
    (ctx.presenceSensorKindLabelElement.hidden = !isPresenceSensor),
    ctx.presenceSensorKindLabelElement.classList.toggle("inspector-full-row", isPresenceSensor),
    (ctx.presenceSensorKindElement.value = sensorKind),
    ctx.loadNavigationIconOptions(ctx.presenceSensorKindElement),
    (ctx.iconButtonMainHeadingElement.textContent = isDeviceButton ? "标题" : "中文标题"),
    (ctx.iconButtonSecondaryHeadingElement.textContent = isDeviceButton ? "状态" : "英文标题"),
    (ctx.iconButtonMainContentLabelElement.textContent = isDeviceButton ? "自定义标题" : "内容"),
    (ctx.iconButtonSecondaryContentLabelElement.textContent = isDeviceButton ? "自定义状态" : "内容"),
    (ctx.iconButtonMainTextElement.placeholder = isDeviceButton ? "留空跟随实体名称" : ""),
    (ctx.iconButtonSecondaryTextElement.placeholder = isDeviceButton ? "留空跟随实体状态" : ""),
    (ctx.iconButtonPreviewControlElement.hidden = isDeviceButton),
    (ctx.iconButtonActionSectionElement.hidden = isPresenceSensor),
    (ctx.iconButtonPreviewDetailsElement.hidden = true),
    (ctx.presenceMotionSectionElement.hidden = !isPresenceSensor || sensorKind !== "presence"),
    (ctx.doorWindowPerspectiveSectionElement.hidden =
      !isPresenceSensor || sensorKind !== "door-window"));
  const isEditingPerspective = ctx.doorWindowPerspectiveEditIdsSet.has(iconButtonComponent.id);
  (ctx.doorWindowPerspectiveEditElement.classList.toggle("active", isEditingPerspective),
    ctx.doorWindowPerspectiveEditElement.setAttribute("aria-pressed", String(isEditingPerspective)),
    (ctx.doorWindowPerspectiveEditElement.textContent = "编辑透视"),
    (ctx.doorWindowPerspectiveSaveElement.disabled = !isEditingPerspective),
    (ctx.iconButtonMainHeadingElement.closest(".inspector-section").hidden = isPresenceSensor));
  const iconButtonSectionElement = ctx.iconButtonIconButtonElement.closest(".inspector-section");
  iconButtonSectionElement.querySelector("h3").textContent = isPresenceSensor ? "显示颜色" : "图标";
  const iconPickerElement = ctx.iconButtonIconButtonElement.closest(".inspector-picker");
  ((iconPickerElement.hidden = isPresenceSensor),
    (iconPickerElement.style.display = isPresenceSensor ? "none" : ""),
    (ctx.iconButtonFillSectionElement.hidden = isDeviceButton),
    (ctx.iconButtonFrameSectionElement.hidden = isDeviceButton),
    (ctx.iconButtonSoftLightSectionElement.hidden = isDeviceButton),
    (ctx.iconButtonGlowSectionElement.hidden = isDeviceButton),
    (ctx.iconButtonIconColorLabelElement.hidden = isPresenceSensor),
    (ctx.iconButtonIconColorLabelElement.firstChild.textContent = isDeviceButton ? "关闭颜色" : "颜色"),
    (ctx.deviceButtonIconVisibleElement.hidden = !isDeviceButton || isPresenceSensor),
    (ctx.deviceButtonMainVisibleElement.hidden = !isDeviceButton),
    (ctx.deviceButtonSecondaryVisibleElement.hidden = !isDeviceButton),
    (ctx.deviceButtonIconOnColorLabelElement.hidden = !isDeviceButton),
    (ctx.deviceButtonIconOnColorLabelElement.firstChild.textContent = isPresenceSensor
      ? ({
          presence: "有人颜色",
          "door-window": "打开颜色",
          "water-leak": "水浸颜色",
          smoke: "烟雾颜色",
          "natural-gas": "天然气颜色",
        } as any)[sensorKind]
      : "开启颜色"),
    (ctx.deviceButtonBadgeColorLabelElement.hidden = !isDeviceButton || isPresenceSensor),
    (ctx.deviceButtonBadgeOpacityLabelElement.hidden = !isDeviceButton || isPresenceSensor),
    (ctx.iconButtonIconSizeLabelElement.hidden = isDeviceButton),
    (ctx.deviceButtonSymbolSizeLabelElement.hidden = !isDeviceButton || isPresenceSensor),
    (ctx.deviceButtonBadgeSizeLabelElement.hidden = !isDeviceButton || isPresenceSensor),
    (ctx.deviceButtonStatePrecisionLabelElement.hidden = !isDeviceButton || isPresenceSensor),
    (ctx.iconButtonIconLeftElement.closest("label").hidden = isPresenceSensor),
    (ctx.iconButtonIconTopElement.closest("label").hidden = isPresenceSensor),
    (ctx.iconButtonIconOffOpacityLabelElement.hidden = isDeviceButton),
    (ctx.iconButtonIconOnOpacityLabelElement.hidden = isDeviceButton),
    (ctx.iconButtonMainOffOpacityLabelElement.hidden = isDeviceButton),
    (ctx.iconButtonMainOnOpacityLabelElement.hidden = isDeviceButton),
    (ctx.iconButtonSecondaryOffOpacityLabelElement.hidden = isDeviceButton),
    (ctx.iconButtonSecondaryOnOpacityLabelElement.hidden = isDeviceButton),
    (ctx.iconButtonLabelElement.value = iconButtonProperties.label || ""),
    ctx.runExtraFallback(iconButtonComponent),
    ctx.runSplit(iconButtonProperties.icon || ""),
    (ctx.iconButtonIconColorElement.value =
      iconButtonProperties.iconColor ||
      (isPresenceSensor ? iconButtonProperties.clearColor : "") ||
      iconButtonProperties.iconOffColor ||
      iconButtonProperties.iconOnColor ||
      "#d7d8da"),
    setInspectorToggle2(ctx.deviceButtonIconVisibleElement, iconButtonProperties.iconVisible !== false),
    (ctx.deviceButtonIconOnColorElement.value =
      sensorKind === "water-leak"
        ? iconButtonProperties.waterLeakColor || "#42c8ff"
        : sensorKind === "smoke"
          ? iconButtonProperties.smokeColor || "#ffffff"
          : sensorKind === "natural-gas"
            ? iconButtonProperties.naturalGasColor || "#ffb347"
            : iconButtonProperties.iconOnColor ||
              (isPresenceSensor ? iconButtonProperties.occupiedColor : "") ||
              "#379bff"),
    (ctx.deviceButtonBadgeColorElement.value = iconButtonProperties.badgeColor || "#5b5e66"),
    (ctx.deviceButtonBadgeOpacityElement.value = roundField2(
      Number(iconButtonProperties.badgeOpacity ?? 0.58) * 100,
    )),
    (ctx.deviceButtonBadgeSizeElement.value = roundField2(
      Number(iconButtonProperties.badgeSize ?? iconButtonProperties.iconSize ?? 28),
    )),
    (ctx.deviceButtonSymbolSizeElement.value = roundField2(
      Number(iconButtonProperties.symbolSize ?? Number(iconButtonProperties.iconSize ?? 28) * 0.5),
    )),
    (ctx.deviceButtonStatePrecisionElement.value = ["0", "1", "2", "3", "4"].includes(
      String(iconButtonProperties.statePrecision),
    )
      ? String(iconButtonProperties.statePrecision)
      : "auto"),
    (ctx.presenceHaloScaleXElement.value = roundField2(
      Number(iconButtonProperties.haloScaleX ?? iconButtonProperties.haloScale ?? 1) * 100,
    )),
    (ctx.presenceHaloScaleYElement.value = roundField2(
      Number(iconButtonProperties.haloScaleY ?? iconButtonProperties.haloScale ?? 1) * 100,
    )),
    (ctx.presenceHaloRotationElement.value = roundField2(
      Number(iconButtonProperties.haloRotation ?? 0),
    )),
    (ctx.presenceHaloOpacityElement.value = roundField2(
      Number(iconButtonProperties.haloOpacity ?? 1) * 100,
    )),
    (ctx.presencePersonScaleElement.value = roundField2(
      Number(iconButtonProperties.personScale ?? 1) * 100,
    )),
    (ctx.presencePersonRotationElement.value = roundField2(
      Number(iconButtonProperties.personRotation ?? 0),
    )),
    (ctx.presencePersonOpacityElement.value = roundField2(
      Number(iconButtonProperties.personOpacity ?? 1) * 100,
    )),
    (ctx.presenceOrbitDurationElement.value = roundField2(
      Number(iconButtonProperties.orbitDuration ?? 8),
    )),
    setInspectorToggle2(ctx.presenceHaloVisibleElement, iconButtonProperties.haloVisible !== false),
    setInspectorToggle2(ctx.presencePersonVisibleElement, iconButtonProperties.personVisible !== false),
    (ctx.iconButtonIconSizeElement.value = roundField2(Number(iconButtonProperties.iconSize ?? 42))),
    (ctx.iconButtonIconOffOpacityElement.value = roundField2(
      Number(iconButtonProperties.iconOffOpacity ?? 1) * 100,
    )),
    (ctx.iconButtonIconOnOpacityElement.value = roundField2(
      Number(iconButtonProperties.iconOnOpacity ?? 1) * 100,
    )),
    (ctx.iconButtonIconLeftElement.value = roundField2(Number(iconButtonProperties.iconLeft ?? 50))),
    (ctx.iconButtonIconTopElement.value = roundField2(Number(iconButtonProperties.iconTop ?? 34))),
    (ctx.iconButtonMainTextElement.value = iconButtonProperties.mainText || ""),
    setInspectorToggle2(
      ctx.deviceButtonMainVisibleElement,
      iconButtonProperties.mainTextVisible !== false,
    ),
    (ctx.iconButtonSecondaryTextElement.value = iconButtonProperties.secondaryText || ""),
    setInspectorToggle2(
      ctx.deviceButtonSecondaryVisibleElement,
      iconButtonProperties.secondaryTextVisible !== false,
    ),
    (ctx.iconButtonMainColorElement.value =
      iconButtonProperties.mainColor ||
      iconButtonProperties.mainOffColor ||
      iconButtonProperties.mainOnColor ||
      "#c7c8cb"),
    (ctx.iconButtonSecondaryColorElement.value =
      iconButtonProperties.secondaryColor ||
      iconButtonProperties.secondaryOffColor ||
      iconButtonProperties.secondaryOnColor ||
      "#75777d"),
    (ctx.iconButtonMainOffOpacityElement.value = roundField2(
      Number(iconButtonProperties.mainOffOpacity ?? 1) * 100,
    )),
    (ctx.iconButtonMainOnOpacityElement.value = roundField2(
      Number(iconButtonProperties.mainOnOpacity ?? 1) * 100,
    )),
    (ctx.iconButtonSecondaryOffOpacityElement.value = roundField2(
      Number(iconButtonProperties.secondaryOffOpacity ?? 1) * 100,
    )),
    (ctx.iconButtonSecondaryOnOpacityElement.value = roundField2(
      Number(iconButtonProperties.secondaryOnOpacity ?? 1) * 100,
    )),
    (ctx.iconButtonMainSizeElement.value = roundField2(Number(iconButtonProperties.mainSize ?? 25))),
    (ctx.iconButtonSecondarySizeElement.value = roundField2(
      Number(iconButtonProperties.secondarySize ?? 10),
    )),
    (ctx.iconButtonMainWeightElement.value = roundField2(
      normalizedFontWeight2(iconButtonProperties.mainWeight, 0.25),
    )),
    (ctx.iconButtonSecondaryWeightElement.value = roundField2(
      normalizedFontWeight2(iconButtonProperties.secondaryWeight, 0.18),
    )),
    (ctx.iconButtonMainSpacingElement.value = roundField2(
      Number(iconButtonProperties.mainSpacing ?? 1),
    )),
    (ctx.iconButtonSecondarySpacingElement.value = roundField2(
      Number(iconButtonProperties.secondarySpacing ?? 0.7),
    )),
    (ctx.iconButtonMainLeftElement.value = roundField2(Number(iconButtonProperties.mainTextLeft ?? 9))),
    (ctx.iconButtonMainTopElement.value = roundField2(Number(iconButtonProperties.mainTextTop ?? 78))),
    (ctx.iconButtonSecondaryLeftElement.value = roundField2(
      Number(iconButtonProperties.secondaryTextLeft ?? 9),
    )),
    (ctx.iconButtonSecondaryTopElement.value = roundField2(
      Number(iconButtonProperties.secondaryTextTop ?? 91),
    )),
    setInspectorToggle2(
      ctx.iconButtonOnFillVisibleElement,
      iconButtonProperties.onFillVisible !== false,
    ),
    (ctx.iconButtonOnFillColorElement.value = iconButtonProperties.onFillColor || "#dfb64f"),
    (ctx.iconButtonOnFillStrengthElement.value = roundField2(
      Number(iconButtonProperties.onFillStrength ?? 1) * 100,
    )),
    (ctx.iconButtonOnFillFadeDurationElement.value = roundField2(
      Number(iconButtonProperties.onFillFadeDuration ?? 0.3),
    )),
    setInspectorToggle2(ctx.iconButtonFrameVisibleElement, iconButtonProperties.frameVisible !== false),
    (ctx.iconButtonFrameWidthElement.value = roundField2(Number(iconButtonProperties.frameWidth ?? 1))),
    (ctx.iconButtonFrameAngleElement.value = roundField2(
      Number(iconButtonProperties.frameAngle ?? 45),
    )),
    (ctx.iconButtonFrameOffOpacityElement.value = roundField2(
      Number(iconButtonProperties.frameOffOpacity ?? 0.8) * 100,
    )),
    (ctx.iconButtonFrameOnOpacityElement.value = roundField2(
      Number(iconButtonProperties.frameOnOpacity ?? 1) * 100,
    )),
    (ctx.iconButtonCutCornerElement.value = roundField2(Number(iconButtonProperties.cutCorner ?? 20))),
    setInspectorToggle2(
      ctx.iconButtonSoftLightVisibleElement,
      iconButtonProperties.softLightVisible !== false,
    ),
    (ctx.iconButtonSoftLightColorElement.value = iconButtonProperties.softLightColor || "#ffffff"),
    (ctx.iconButtonSoftLightStrengthElement.value = roundField2(
      Number(iconButtonProperties.softLightStrength ?? 1) * 100,
    )),
    (ctx.iconButtonSoftLightSizeElement.value = roundField2(
      Number(iconButtonProperties.softLightSize ?? 1) * 100,
    )),
    (ctx.iconButtonSoftLightAngleElement.value = roundField2(
      Number(iconButtonProperties.softLightAngle ?? 45),
    )),
    setInspectorToggle2(ctx.iconButtonGlowVisibleElement, iconButtonProperties.glowVisible !== false),
    (ctx.iconButtonGlowColorElement.value = iconButtonProperties.glowColor || "#ffffff"),
    (ctx.iconButtonGlowStrengthElement.value = roundField2(
      Number(iconButtonProperties.glowStrength ?? 1) * 100,
    )),
    (ctx.iconButtonGlowSizeElement.value = roundField2(
      Number(iconButtonProperties.glowSize ?? 1) * 100,
    )),
    (ctx.iconButtonGlowAngleElement.value = roundField2(Number(iconButtonProperties.glowAngle ?? 220))),
    (ctx.iconButtonLeftElement.value = roundField2(
      clampNumber2(
        ((Number(iconButtonPosition.x || 0) + iconButtonWidthPx / 2) / iconButtonCanvasWidthPx) *
          100,
        0,
        100,
      ),
    )),
    (ctx.iconButtonTopElement.value = roundField2(
      clampNumber2(
        ((Number(iconButtonPosition.y || 0) + iconButtonHeightPx / 2) / iconButtonCanvasHeightPx) *
          100,
        0,
        100,
      ),
    )),
    (ctx.iconButtonWidthElement.value = roundField2(
      (iconButtonWidthPx / iconButtonCanvasWidthPx) * 100,
    )),
    (ctx.iconButtonHeightElement.value = roundField2(
      (iconButtonHeightPx / iconButtonCanvasHeightPx) * 100,
    )),
    (ctx.iconButtonScaleElement.value = roundField2(
      Number(iconButtonComponent.style?.scale || 1) * 100,
    )),
    (ctx.iconButtonRotationElement.value = roundField2(Number(iconButtonPosition.rotation || 0))),
    isPresenceSensor &&
      !ctx.iconButtonPreviewStateByComponentId.has(iconButtonComponent.id) &&
      (ctx.iconButtonPreviewStateByComponentId.set(iconButtonComponent.id, "on"),
      ctx.editorRenderer?.setComponentPreviewState(iconButtonComponent.id, "on")));
  const iconPreviewState =
    ctx.iconButtonPreviewStateByComponentId.get(iconButtonComponent.id) || "auto";
  for (const iconPreviewStateButtonElement of ctx.iconButtonPreviewStateElement.querySelectorAll(
    "[data-icon-button-preview]",
  )) {
    const isPreviewStateActive =
      iconPreviewStateButtonElement.dataset.iconButtonPreview === iconPreviewState;
    (iconPreviewStateButtonElement.classList.toggle("active", isPreviewStateActive),
      iconPreviewStateButtonElement.setAttribute("aria-pressed", String(isPreviewStateActive)));
  }
  const isIconButtonMultiSelection = ctx.selectedComponentIdsSet.size > 1;
  for (const iconSizeInputElement of [ctx.iconButtonWidthElement, ctx.iconButtonHeightElement])
    iconSizeInputElement.disabled = isIconButtonMultiSelection;
  ((ctx.iconButtonRotationElement.disabled = false), (ctx.iconButtonScaleElement.disabled = false));
  const iconButtonReplaceableCount = ctx.findReplaceableComponents(iconButtonComponent).length,
    iconButtonApplyTargetCount = ctx.appliedStylePropertyKey(iconButtonComponent).length;
  ((ctx.iconButtonApplyStyleElement.disabled =
    !iconButtonReplaceableCount || !iconButtonApplyTargetCount),
    (ctx.iconButtonApplyCountElement.textContent = iconButtonApplyTargetCount + " 项修改"),
    (ctx.iconButtonApplyStyleElement.textContent = "一键应用到同类型控件"),
    ctx.syncComponentActionControls(iconButtonComponent, ctx.iconButtonActionControlsElement));
}
