const PRESENCE_SENSOR_BASE_Z_INDEX = 500000000,
  ICON_BUTTON_EFFECT_BASE_Z_INDEX = 1000000000;
export function normalizeIconButtonEffectComponent(component) {
  if (component?.type !== "icon-button-effect") return component;
  const nextProperties = {
    ...(component.properties || {}),
  };
  return (
    Object.prototype.hasOwnProperty.call(nextProperties, "buttonVisible") ||
      (nextProperties.buttonVisible = true),
    Object.prototype.hasOwnProperty.call(nextProperties, "effectVisible") ||
      (nextProperties.effectVisible = true),
    {
      ...component,
      properties: nextProperties,
    }
  );
}
export function componentHostZIndex(hostComponent, baseZIndex, applyTypeBoost = true) {
  const resolvedZIndex = Number(baseZIndex || 0);
  return !applyTypeBoost && hostComponent?.type !== "group"
    ? resolvedZIndex
    : hostComponent?.type === "icon-button-effect" &&
        (hostComponent.properties?.buttonVisible !== false ||
          hostComponent.properties?.hiddenContentClickable === true)
      ? 1000000000 + resolvedZIndex
      : hostComponent?.type === "presence-sensor"
        ? 500000000 + resolvedZIndex
        : resolvedZIndex;
}
export function effectFadeDuration(effectComponent) {
  const durationSeconds = Number(effectComponent?.properties?.effectFadeDuration);
  return Number.isFinite(durationSeconds) ? Math.max(0, Math.min(3, durationSeconds)) : 0.52;
}
export function effectLayerDimensions(
  layerComponent,
  layerImageElement,
  layerContainerWidth,
  layerContainerHeight,
) {
  if (layerComponent?.effectLayoutMode === "fill")
    return {
      width: layerContainerWidth,
      height: layerContainerHeight,
      pendingNaturalSize: false,
    };
  const layerNaturalWidth = Number(layerComponent?.effectNaturalWidth || 0),
    layerNaturalHeight = Number(layerComponent?.effectNaturalHeight || 0),
    layerOriginalWidth = Number(
      layerImageElement?.dataset?.effectOriginalWidth || layerImageElement?.naturalWidth || 0,
    ),
    layerOriginalHeight = Number(
      layerImageElement?.dataset?.effectOriginalHeight || layerImageElement?.naturalHeight || 0,
    ),
    layerWidth = layerNaturalWidth > 0 ? layerNaturalWidth : layerOriginalWidth,
    layerHeight = layerNaturalHeight > 0 ? layerNaturalHeight : layerOriginalHeight;
  return layerWidth > 0 && layerHeight > 0
    ? {
        width: layerWidth,
        height: layerHeight,
        pendingNaturalSize: false,
      }
    : {
        width:
          (layerContainerWidth * Math.max(0.001, Number(layerComponent?.effectWidth ?? 100))) / 100,
        height:
          (layerContainerHeight * Math.max(0.001, Number(layerComponent?.effectHeight ?? 100))) /
          100,
        pendingNaturalSize: true,
      };
}
export function effectSourceDimensions(
  sourceComponent,
  sourceImageElement,
  containerWidth,
  containerHeight,
) {
  const componentNaturalWidth = Number(sourceComponent?.effectNaturalWidth || 0),
    componentNaturalHeight = Number(sourceComponent?.effectNaturalHeight || 0),
    datasetOriginalWidth = Number(sourceImageElement?.dataset?.effectOriginalWidth || 0),
    datasetOriginalHeight = Number(sourceImageElement?.dataset?.effectOriginalHeight || 0),
    elementNaturalWidth = Number(sourceImageElement?.naturalWidth || 0),
    elementNaturalHeight = Number(sourceImageElement?.naturalHeight || 0),
    sourceWidth =
      componentNaturalWidth > 0
        ? componentNaturalWidth
        : datasetOriginalWidth > 0
          ? datasetOriginalWidth
          : elementNaturalWidth,
    sourceHeight =
      componentNaturalHeight > 0
        ? componentNaturalHeight
        : datasetOriginalHeight > 0
          ? datasetOriginalHeight
          : elementNaturalHeight;
  return sourceWidth > 0 && sourceHeight > 0
    ? {
        width: sourceWidth,
        height: sourceHeight,
        pendingNaturalSize: false,
      }
    : sourceComponent?.effectLayoutMode === "fill"
      ? {
          width: containerWidth,
          height: containerHeight,
          pendingNaturalSize: true,
        }
      : {
          width:
            (containerWidth * Math.max(0.001, Number(sourceComponent?.effectWidth ?? 100))) / 100,
          height:
            (containerHeight * Math.max(0.001, Number(sourceComponent?.effectHeight ?? 100))) / 100,
          pendingNaturalSize: true,
        };
}
export function effectCropRectangle(cropImageElement, targetDimensions) {
  const datasetWidth = Number(cropImageElement?.dataset?.effectOriginalWidth || 0),
    datasetHeight = Number(cropImageElement?.dataset?.effectOriginalHeight || 0),
    datasetCropX = Number(cropImageElement?.dataset?.effectCropX),
    datasetCropY = Number(cropImageElement?.dataset?.effectCropY),
    datasetCropWidth = Number(cropImageElement?.dataset?.effectCropWidth || 0),
    datasetCropHeight = Number(cropImageElement?.dataset?.effectCropHeight || 0);
  if (
    datasetWidth > 0 &&
    datasetHeight > 0 &&
    Number.isFinite(datasetCropX) &&
    Number.isFinite(datasetCropY) &&
    datasetCropX >= 0 &&
    datasetCropY >= 0 &&
    datasetCropWidth > 0 &&
    datasetCropHeight > 0 &&
    datasetCropX + datasetCropWidth <= datasetWidth &&
    datasetCropY + datasetCropHeight <= datasetHeight
  ) {
    const scaleX = targetDimensions.width / datasetWidth,
      scaleY = targetDimensions.height / datasetHeight;
    return {
      x: datasetCropX * scaleX,
      y: datasetCropY * scaleY,
      width: datasetCropWidth * scaleX,
      height: datasetCropHeight * scaleY,
    };
  }
  return {
    x: 0,
    y: 0,
    width: targetDimensions.width,
    height: targetDimensions.height,
  };
}
export function effectCroppedLayerGeometry({
  centerX: centerX,
  centerY: centerY,
  originalWidth: originalWidth,
  originalHeight: originalHeight,
  cropX: cropX,
  cropY: cropY,
  cropWidth: cropWidth,
  cropHeight: cropHeight,
  scale: scale = 1,
  rotation: rotation = 0,
}) {
  const rotationRad = (Number(rotation || 0) * Math.PI) / 180,
    scaleFactor = Math.max(0.0001, Number(scale || 1)),
    offsetX =
      (Number(cropX || 0) + Number(cropWidth || 0) / 2 - Number(originalWidth || 0) / 2) *
      scaleFactor,
    offsetY =
      (Number(cropY || 0) + Number(cropHeight || 0) / 2 - Number(originalHeight || 0) / 2) *
      scaleFactor,
    rotatedOffsetX = offsetX * Math.cos(rotationRad) - offsetY * Math.sin(rotationRad),
    rotatedOffsetY = offsetX * Math.sin(rotationRad) + offsetY * Math.cos(rotationRad),
    rotatedCenterX = Number(centerX || 0) + rotatedOffsetX,
    rotatedCenterY = Number(centerY || 0) + rotatedOffsetY;
  return {
    left: rotatedCenterX - Number(cropWidth || 0) / 2,
    top: rotatedCenterY - Number(cropHeight || 0) / 2,
    width: Number(cropWidth || 0),
    height: Number(cropHeight || 0),
    scale: scaleFactor,
    rotation: Number(rotation || 0),
  };
}
export function effectReferenceImageTransform(
  project,
  referenceComponent,
  targetWidth,
  targetHeight,
  fillWidth,
  fillHeight,
) {
  if (!(targetWidth > 0 && targetHeight > 0)) return null;
  const referenceZIndex = Number(referenceComponent?.position?.zIndex || 1),
    referenceImageId = String(referenceComponent?.properties?.effectReferenceImageId || ""),
    referencedCandidates = [],
    fallbackCandidates = [],
    collectCandidates = (componentList) => {
      for (const childComponent of componentList || []) {
        if (childComponent.type === "image") {
          const childProperties = childComponent.properties || {},
            childNaturalWidth = Number(childProperties.naturalWidth || 0),
            childNaturalHeight = Number(childProperties.naturalHeight || 0),
            childZIndex = Number(childComponent.position?.zIndex || 1),
            isReferenceImage = referenceImageId && childComponent.id === referenceImageId,
            isBestSizeMatch =
              !referenceImageId &&
              childComponent.style?.visible !== false &&
              childNaturalWidth === targetWidth &&
              childNaturalHeight === targetHeight &&
              childZIndex < referenceZIndex;
          if (isReferenceImage || isBestSizeMatch) {
            const isFillLayout = childProperties.layoutMode === "fill",
              childPosition = childComponent.position || {},
              candidateWidth = isFillLayout
                ? fillWidth
                : Number(childPosition.width || targetWidth),
              candidateHeight = isFillLayout
                ? fillHeight
                : Number(childPosition.height || targetHeight),
              candidate = {
                zIndex: childZIndex,
                scale: Math.min(candidateWidth / targetWidth, candidateHeight / targetHeight),
              };
            isReferenceImage
              ? referencedCandidates.push(candidate)
              : fallbackCandidates.push(candidate);
          }
        }
        collectCandidates(childComponent.children);
      }
    };
  return (
    collectCandidates(project?.components),
    referencedCandidates[0] ||
      fallbackCandidates.sort(
        (leftCandidate, rightCandidate) => rightCandidate.zIndex - leftCandidate.zIndex,
      )[0] ||
      null
  );
}
