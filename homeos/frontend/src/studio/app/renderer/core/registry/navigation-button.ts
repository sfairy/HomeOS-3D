import { clampNumber, normalizeCssColor, resolveMdiIconUrl } from "./_shared";
import { bindSceneMode } from "../scene-mode";
import { renderPercentageBarControl } from "./percentage-bar";
import { navigationButtonIsActive, createNavigationEffectsSvg } from "./navigation-effects";
import { componentContentUnitsPx, navigationContentUnitPx } from "./content-units";
import { isEntityComponentActive } from "./cover-climate-state";

export function navigationComponentRenderer(navigationButtonComponent: any, navigationButtonRenderEnvironment: any) {
  const navigationButtonProperties = navigationButtonComponent.properties || {},
    resolvedTargetPage =
      ["tap", "doubleTap", "hold"]
        .map((actionKey) => navigationButtonComponent.actions?.[actionKey])
        .find(
          (navigationAction) => navigationAction?.type === "navigate" && navigationAction.target,
        )?.target ||
      navigationButtonProperties.targetPage ||
      "",
    boundNavigationEntityId = navigationButtonComponent.bindings?.entity?.entityId || "",
    navigationPreviewState =
      navigationButtonRenderEnvironment.editable &&
      ["off", "on"].includes(navigationButtonRenderEnvironment.previewState)
        ? navigationButtonRenderEnvironment.previewState
        : "auto",
    isBoundEntityActive = !!(
      boundNavigationEntityId &&
      isEntityComponentActive(
        navigationButtonComponent,
        boundNavigationEntityId,
        navigationButtonRenderEnvironment.states?.get(boundNavigationEntityId),
        navigationButtonRenderEnvironment,
      )
    ),
    isNavigationButtonActive = navigationButtonIsActive({
      targetPage: resolvedTargetPage,
      currentPagePath: navigationButtonRenderEnvironment.page?.path || "",
      entityId: boundNavigationEntityId,
      entityActive: isBoundEntityActive,
      previewState: navigationPreviewState,
    }),
    textOpacity = clampNumber(
      isNavigationButtonActive
        ? (navigationButtonProperties.textActiveOpacity ?? navigationButtonProperties.activeOpacity)
        : (navigationButtonProperties.textIdleOpacity ?? navigationButtonProperties.idleOpacity),
      0,
      1,
      isNavigationButtonActive ? 0.96 : 0.3,
    ),
    iconOpacity = clampNumber(
      isNavigationButtonActive
        ? (navigationButtonProperties.iconActiveOpacity ?? navigationButtonProperties.activeOpacity)
        : (navigationButtonProperties.iconIdleOpacity ?? navigationButtonProperties.idleOpacity),
      0,
      1,
      isNavigationButtonActive ? 0.96 : 0.3,
    ),
    navigationIntensityMultiplier = clampNumber(
      isNavigationButtonActive
        ? navigationButtonProperties.frameActiveOpacity
        : navigationButtonProperties.frameIdleOpacity,
      0,
      1,
      isNavigationButtonActive ? 0.98 : 0.48,
    ),
    navigationGlowIntensity = clampNumber(
      isNavigationButtonActive
        ? navigationButtonProperties.glowActiveStrength
        : navigationButtonProperties.glowIdleStrength,
      0,
      5,
      isNavigationButtonActive ? 2.2 : 0.5,
    ),
    navigationGlowSpreadScale = clampNumber(
      isNavigationButtonActive
        ? navigationButtonProperties.glowActiveSize
        : navigationButtonProperties.glowIdleSize,
      0,
      3,
      isNavigationButtonActive ? 3 : 1.5,
    ),
    mainTextColor = normalizeCssColor(navigationButtonProperties.mainColor, "#e9edf0"),
    secondaryTextColor = normalizeCssColor(navigationButtonProperties.secondaryColor, "#e9edf0"),
    navigationUnitScale = 100 / 64.36,
    contentUnitScale = navigationContentUnitPx(
      navigationButtonComponent,
      navigationButtonRenderEnvironment,
    ),
    navigationTextLeft = clampNumber(navigationButtonProperties.textLeft, -100, 200, 27.5),
    navigationTextTop = clampNumber(navigationButtonProperties.textTop, -100, 200, 81.5),
    mainTextLeft = clampNumber(
      navigationButtonProperties.mainTextLeft,
      -100,
      200,
      navigationTextLeft,
    ),
    mainTextTop = clampNumber(
      navigationButtonProperties.mainTextTop,
      -100,
      200,
      navigationTextTop - 18 * navigationUnitScale,
    ),
    secondaryTextLeft = clampNumber(
      navigationButtonProperties.secondaryTextLeft,
      -100,
      200,
      navigationTextLeft,
    ),
    secondaryTextTop = clampNumber(
      navigationButtonProperties.secondaryTextTop,
      -100,
      200,
      navigationTextTop,
    ),
    navigationButtonElement = document.createElement("div");
  if (
    ((navigationButtonElement.className =
      "hb-navigation-button" + (isNavigationButtonActive ? " active" : "")),
    (navigationButtonElement.dataset.targetPage = resolvedTargetPage),
    navigationButtonElement.style.setProperty("--navigation-text-opacity", String(textOpacity)),
    navigationButtonElement.style.setProperty("--navigation-icon-opacity", String(iconOpacity)),
    navigationButtonElement.style.setProperty(
      "--navigation-icon-size",
      clampNumber(navigationButtonProperties.iconSize, 1, 500, 50) * contentUnitScale + "px",
    ),
    navigationButtonElement.style.setProperty(
      "--navigation-icon-left",
      clampNumber(navigationButtonProperties.iconLeft, -100, 200, 14) + "%",
    ),
    navigationButtonElement.style.setProperty(
      "--navigation-icon-top",
      clampNumber(navigationButtonProperties.iconTop, -100, 200, 50) + "%",
    ),
    navigationButtonElement.style.setProperty(
      "--navigation-main-size",
      clampNumber(navigationButtonProperties.mainSize, 1, 500, 30) * contentUnitScale + "px",
    ),
    navigationButtonElement.style.setProperty(
      "--navigation-secondary-size",
      clampNumber(navigationButtonProperties.secondarySize, 1, 500, 11) * contentUnitScale + "px",
    ),
    navigationButtonElement.style.setProperty(
      "--navigation-main-spacing",
      clampNumber(navigationButtonProperties.mainSpacing, -20, 100, 8) * contentUnitScale + "px",
    ),
    navigationButtonElement.style.setProperty(
      "--navigation-secondary-spacing",
      clampNumber(navigationButtonProperties.secondarySpacing, -20, 100, 3) * contentUnitScale +
        "px",
    ),
    navigationButtonElement.style.setProperty("--navigation-main-left", mainTextLeft + "%"),
    navigationButtonElement.style.setProperty(
      "--navigation-secondary-left",
      secondaryTextLeft + "%",
    ),
    navigationButtonElement.style.setProperty("--navigation-main-top", mainTextTop + "%"),
    navigationButtonElement.style.setProperty("--navigation-secondary-top", secondaryTextTop + "%"),
    (navigationButtonProperties.glowVisible !== false ||
      navigationButtonProperties.frameVisible !== false) &&
      navigationButtonElement.append(
        createNavigationEffectsSvg(
          navigationButtonComponent,
          navigationButtonProperties,
          isNavigationButtonActive,
          navigationIntensityMultiplier,
          navigationGlowIntensity,
          navigationGlowSpreadScale,
        ),
      ),
    navigationButtonProperties.iconVisible !== false)
  ) {
    const navigationIconUrl = resolveMdiIconUrl(
      navigationButtonProperties.icon || "mdi:home-lightbulb-outline",
    );
    if (navigationIconUrl) {
      const navigationIconElement = document.createElement("i");
      ((navigationIconElement.className = "hb-navigation-icon"),
        navigationIconElement.setAttribute("aria-hidden", "true"),
        (navigationIconElement.style.backgroundColor = normalizeCssColor(
          navigationButtonProperties.iconColor,
          "#e9edf0",
        )),
        navigationIconElement.style.setProperty("mask-image", 'url("' + navigationIconUrl + '")'),
        navigationIconElement.style.setProperty(
          "-webkit-mask-image",
          'url("' + navigationIconUrl + '")',
        ),
        navigationButtonElement.append(navigationIconElement));
    }
  }
  const navigationTextElement = document.createElement("span");
  if (
    ((navigationTextElement.className = "hb-navigation-text"),
    navigationButtonProperties.mainTextVisible !== false)
  ) {
    const navigationMainTextElement = document.createElement("strong");
    ((navigationMainTextElement.textContent = navigationButtonProperties.mainText || "页面导航"),
      (navigationMainTextElement.style.color = mainTextColor),
      (navigationMainTextElement.style.webkitTextStrokeColor = mainTextColor),
      (navigationMainTextElement.style.webkitTextStrokeWidth =
        clampNumber(navigationButtonProperties.mainWeight, 0, 3, 0) * contentUnitScale + "px"),
      navigationTextElement.append(navigationMainTextElement));
  }
  if (navigationButtonProperties.secondaryTextVisible !== false) {
    const navigationSecondaryTextElement = document.createElement("small");
    ((navigationSecondaryTextElement.textContent =
      navigationButtonProperties.secondaryText || "NAVIGATION"),
      (navigationSecondaryTextElement.style.color = secondaryTextColor),
      (navigationSecondaryTextElement.style.webkitTextStrokeColor = secondaryTextColor),
      (navigationSecondaryTextElement.style.webkitTextStrokeWidth =
        clampNumber(navigationButtonProperties.secondaryWeight, 0, 3, 0) * contentUnitScale + "px"),
      navigationTextElement.append(navigationSecondaryTextElement));
  }
  return (
    navigationTextElement.childElementCount &&
      navigationButtonElement.append(navigationTextElement),
    navigationButtonElement
  );
}
