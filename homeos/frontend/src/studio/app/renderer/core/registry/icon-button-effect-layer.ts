import { clampNumber } from "./_shared";
import { effectVariantByAssetId, resolveAssetSource } from "./asset-state";
import {
  iconButtonEffectLightVisualAwaiting,
  iconButtonEffectLightVisualState,
  isCoverAuthoredActive,
} from "./cover-climate-state";

export function renderIconButtonEffectLayer(effectLayerComponent: any, effectLayerRenderEnvironment: any) {
  const effectLayerProperties = effectLayerComponent.properties || {},
    effectAssetOverride = effectLayerRenderEnvironment.editable
      ? null
      : effectVariantByAssetId.get(String(effectLayerProperties.effectAssetId || "")),
    effectAssetUrl =
      effectAssetOverride?.url || resolveAssetSource(effectLayerProperties.effectAssetId);
  if (!effectAssetUrl || effectLayerProperties.effectVisible === false) return null;
  const isEffectAuthoredActive = isCoverAuthoredActive(
      effectLayerComponent,
      effectLayerRenderEnvironment,
    ),
    effectLightVisualState = iconButtonEffectLightVisualState(
      effectLayerComponent,
      effectLayerRenderEnvironment,
    ),
    isEffectAwaitingLight = iconButtonEffectLightVisualAwaiting(
      effectLayerComponent,
      effectLayerRenderEnvironment,
    ),
    effectLayerElement = document.createElement("div");
  ((effectLayerElement.className =
    "hb-icon-button-effect-layer" +
    (isEffectAuthoredActive ? " active" : "") +
    (isEffectAwaitingLight ? " awaiting-light-visual" : "")),
    effectLayerElement.style.setProperty(
      "--hb-effect-image-opacity",
      String(
        clampNumber(effectLayerProperties.effectOpacity, 0, 1, 1) * effectLightVisualState.opacity,
      ),
    ));
  const effectFadeDuration = clampNumber(effectLayerProperties.effectFadeDuration, 0, 3, 0.52);
  (effectLayerElement.style.setProperty("--hb-effect-fade-duration", effectFadeDuration + "s"),
    effectLayerElement.style.setProperty(
      "--hb-effect-visual-transition-duration",
      Math.max(0.45, effectFadeDuration) + "s",
    ));
  const effectImageElement = document.createElement("img");
  return (
    effectAssetOverride
      ? (effectImageElement.dataset.effectSource = effectAssetUrl)
      : (effectImageElement.src = effectAssetUrl),
    (effectImageElement.alt = ""),
    (effectImageElement.draggable = false),
    (effectImageElement.decoding = "async"),
    (effectImageElement.style.objectFit = "contain"),
    (effectImageElement.style.mixBlendMode = "normal"),
    (effectImageElement.style.filter = effectLightVisualState.filter),
    effectAssetOverride &&
      ((effectImageElement.dataset.effectOriginalWidth = String(effectAssetOverride.originalWidth)),
      (effectImageElement.dataset.effectOriginalHeight = String(
        effectAssetOverride.originalHeight,
      )),
      (effectImageElement.dataset.effectCropX = String(effectAssetOverride.cropX)),
      (effectImageElement.dataset.effectCropY = String(effectAssetOverride.cropY)),
      (effectImageElement.dataset.effectCropWidth = String(effectAssetOverride.width)),
      (effectImageElement.dataset.effectCropHeight = String(effectAssetOverride.height))),
    effectLayerElement.append(effectImageElement),
    effectLayerElement
  );
}
