import { clampNumber, normalizeCssColor, createSvgElement } from "./_shared";
import { randomUuid } from "../../../utils/random-id";

export function createNavigationEffectsSvg(
  navigationComponent: any,
  visualProperties: any,
  isActiveState: any,
  intensityMultiplier: any,
  glowIntensity: any,
  glowSpreadScale: any,
) {
  const viewWidth = Math.max(1, Number(navigationComponent.position?.width || 236)),
    viewHeight = Math.max(1, Number(navigationComponent.position?.height || 100)),
    svgHeight = Math.max(8, (236 * viewHeight) / viewWidth),
    frameWidth = clampNumber(visualProperties.frameWidth, 0, 20, 2),
    frameInset = Math.max(0.5, frameWidth / 2 + 0.5),
    innerWidth = Math.max(1, 236 - frameInset * 2),
    innerHeight = Math.max(1, svgHeight - frameInset * 2),
    cornerRadius =
      Math.min(innerWidth, innerHeight) * clampNumber(visualProperties.radius, 0, 0.5, 0.5),
    glowOpacity = Math.min(1, 0.38 * glowIntensity),
    edgeGlowSpread = Math.max(0, Math.min(innerWidth, innerHeight) * 0.42 * glowSpreadScale),
    innerGlowSpread = Math.max(0, Math.min(innerWidth, innerHeight) * 0.095 * glowSpreadScale),
    centerX = 236 / 2,
    centerY = svgHeight / 2,
    frameColor = normalizeCssColor(visualProperties.frameColor, "#d9e0e6"),
    glowColor = normalizeCssColor(visualProperties.glowColor, "#f2f6fa"),
    frameAngle = clampNumber(visualProperties.frameAngle, 0, 360, 45),
    glowAngle = clampNumber(visualProperties.glowAngle, 0, 360, 45),
    intensityDivisor = isActiveState ? 0.98 : 0.48,
    scaleOpacity = (opacityInput: any) =>
      Math.max(0, Math.min(1, (opacityInput * intensityMultiplier) / intensityDivisor)),
    gradientId = "navigation-" + randomUuid(),
    svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  return (
    svgElement.classList.add("hb-navigation-effects"),
    svgElement.setAttribute("viewBox", "0 0 236 " + svgHeight),
    svgElement.setAttribute("preserveAspectRatio", "none"),
    svgElement.setAttribute("aria-hidden", "true"),
    (svgElement.innerHTML =
      '\n    <defs>\n      <linearGradient id="navigation-edge-' +
      gradientId +
      '" gradientUnits="userSpaceOnUse" x1="0" y1="' +
      centerY +
      '" x2="236" y2="' +
      centerY +
      '" gradientTransform="rotate(' +
      frameAngle +
      " " +
      centerX +
      " " +
      centerY +
      ')">\n        <stop offset="0" stop-color="' +
      frameColor +
      '" stop-opacity="' +
      scaleOpacity(isActiveState ? 0.98 : 0.48) +
      '"/>\n        <stop offset=".48" stop-color="' +
      frameColor +
      '" stop-opacity="' +
      scaleOpacity(isActiveState ? 0.58 : 0.22) +
      '"/>\n        <stop offset="1" stop-color="' +
      frameColor +
      '" stop-opacity="' +
      scaleOpacity(isActiveState ? 0.82 : 0.36) +
      '"/>\n      </linearGradient>\n      <linearGradient id="navigation-light-' +
      gradientId +
      '" gradientUnits="userSpaceOnUse" x1="0" y1="' +
      centerY +
      '" x2="236" y2="' +
      centerY +
      '" gradientTransform="rotate(' +
      glowAngle +
      " " +
      centerX +
      " " +
      centerY +
      ')">\n        <stop offset="0" stop-color="' +
      glowColor +
      '" stop-opacity="' +
      glowOpacity +
      '"/>\n        <stop offset=".45" stop-color="' +
      glowColor +
      '" stop-opacity="' +
      glowOpacity * 0.35 +
      '"/>\n        <stop offset="1" stop-color="' +
      glowColor +
      '" stop-opacity="' +
      glowOpacity * 0.72 +
      '"/>\n      </linearGradient>\n      <clipPath id="navigation-shape-' +
      gradientId +
      '"><rect x="' +
      frameInset +
      '" y="' +
      frameInset +
      '" width="' +
      innerWidth +
      '" height="' +
      innerHeight +
      '" rx="' +
      cornerRadius +
      '"/></clipPath>\n      <filter id="navigation-soft-light-' +
      gradientId +
      '" x="-35%" y="-75%" width="170%" height="250%"><feGaussianBlur stdDeviation="' +
      innerGlowSpread +
      '"/></filter>\n    </defs>\n    ' +
      (visualProperties.glowVisible !== false && edgeGlowSpread > 0 && glowOpacity > 0
        ? '<g clip-path="url(#navigation-shape-' +
          gradientId +
          ')"><rect x="' +
          frameInset +
          '" y="' +
          frameInset +
          '" width="' +
          innerWidth +
          '" height="' +
          innerHeight +
          '" rx="' +
          cornerRadius +
          '" fill="none" stroke="url(#navigation-light-' +
          gradientId +
          ')" stroke-width="' +
          edgeGlowSpread +
          '" filter="url(#navigation-soft-light-' +
          gradientId +
          ')"/></g>'
        : "") +
      "\n    " +
      (visualProperties.frameVisible !== false
        ? '<rect x="' +
          frameInset +
          '" y="' +
          frameInset +
          '" width="' +
          innerWidth +
          '" height="' +
          innerHeight +
          '" rx="' +
          cornerRadius +
          '" fill="none" stroke="url(#navigation-edge-' +
          gradientId +
          ')" stroke-width="' +
          frameWidth +
          '"/>'
        : "") +
      "\n  "),
    svgElement
  );
}
export function navigationButtonIsActive({
  targetPage = "",
  currentPagePath = "",
  entityId: navigationEntityId = "",
  entityActive: isEntityActive = false,
  previewState: previewStateValue = "auto",
} = {}) {
  return previewStateValue === "on"
    ? true
    : previewStateValue === "off"
      ? false
      : targetPage
        ? targetPage === currentPagePath
        : !!(navigationEntityId && isEntityActive);
}
