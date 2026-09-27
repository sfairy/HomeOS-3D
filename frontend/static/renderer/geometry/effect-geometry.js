/**
 * 特效图层的几何与层级计算：z-index 分配、图层尺寸推导、裁剪定位与参考图反推缩放。
 */

// 人体感应特效的基础层级：取 5 亿，保证压在普通组件（z-index 通常几百到几千）之上，
const PRESENCE_SENSOR_BASE_Z_INDEX = 500000000;
// 图标按钮特效的基础层级：取 10 亿，是画布内的最高档，确保按钮与光效永远可点。
const ICON_BUTTON_EFFECT_BASE_Z_INDEX = 1000000000;
/**
 * 给图标按钮特效组件补上缺省可见性开关。
 */
export function normalizeIconButtonEffectComponent(component) {
  if (component?.type !== "icon-button-effect") {
    return component;
  }
  const nextProperties = {
    ...(component.properties || {})
  };
  if (!Object.prototype.hasOwnProperty.call(nextProperties, "buttonVisible")) {
    nextProperties.buttonVisible = true;
  }
  if (!Object.prototype.hasOwnProperty.call(nextProperties, "effectVisible")) {
    nextProperties.effectVisible = true;
  }
  return {
    ...component,
    properties: nextProperties
  };
}
/**
 * 计算宿主元素最终的 z-index。
 */
export function componentHostZIndex(hostComponent, baseZIndex, applyTypeBoost = true) {
  const resolvedZIndex = Number(baseZIndex || 0);
  if (!applyTypeBoost && hostComponent?.type !== "group") {
    return resolvedZIndex;
  } else if (
    hostComponent?.type === "icon-button-effect" &&
    (hostComponent.properties?.buttonVisible !== false ||
      hostComponent.properties?.hiddenContentClickable === true)
  ) {
    return ICON_BUTTON_EFFECT_BASE_Z_INDEX + resolvedZIndex;
  } else if (hostComponent?.type === "presence-sensor") {
    return PRESENCE_SENSOR_BASE_Z_INDEX + resolvedZIndex;
  } else {
    return resolvedZIndex;
  }
}
/**
 * 取特效的淡入淡出时长。
 */
export function effectFadeDuration(effectComponent) {
  const durationSeconds = Number(effectComponent?.properties?.effectFadeDuration);
  if (Number.isFinite(durationSeconds)) {
    return Math.max(0, Math.min(3, durationSeconds));
  } else {
    return 0.52;
  }
}
/**
 * 计算被裁剪源图的原始尺寸。
 */
export function effectSourceDimensions(
  sourceComponent,
  sourceImageElement,
  containerWidth,
  containerHeight
) {
  const componentNaturalWidth = Number(sourceComponent?.effectNaturalWidth || 0);
  const componentNaturalHeight = Number(sourceComponent?.effectNaturalHeight || 0);
  const datasetOriginalWidth = Number(sourceImageElement?.dataset?.effectOriginalWidth || 0);
  const datasetOriginalHeight = Number(sourceImageElement?.dataset?.effectOriginalHeight || 0);
  const elementNaturalWidth = Number(sourceImageElement?.naturalWidth || 0);
  const elementNaturalHeight = Number(sourceImageElement?.naturalHeight || 0);
  const sourceWidth =
    componentNaturalWidth > 0
      ? componentNaturalWidth
      : datasetOriginalWidth > 0
        ? datasetOriginalWidth
        : elementNaturalWidth;
  const sourceHeight =
    componentNaturalHeight > 0
      ? componentNaturalHeight
      : datasetOriginalHeight > 0
        ? datasetOriginalHeight
        : elementNaturalHeight;
  if (sourceWidth > 0 && sourceHeight > 0) {
    return {
      width: sourceWidth,
      height: sourceHeight,
      pendingNaturalSize: false
    };
  } else if (sourceComponent?.effectLayoutMode === "fill") {
    // fill 模式下容器尺寸就是源图尺寸，但仍标记待补算，等图片真正加载完再校准。
    return {
      width: containerWidth,
      height: containerHeight,
      pendingNaturalSize: true
    };
  } else {
    return {
      width: (containerWidth * Math.max(0.001, Number(sourceComponent?.effectWidth ?? 100))) / 100,
      height:
        (containerHeight * Math.max(0.001, Number(sourceComponent?.effectHeight ?? 100))) / 100,
      pendingNaturalSize: true
    };
  }
}
/**
 * 把源图坐标系下的裁剪矩形换算到目标尺寸坐标系。
 */
export function effectCropRectangle(cropImageElement, targetDimensions) {
  const datasetWidth = Number(cropImageElement?.dataset?.effectOriginalWidth || 0);
  const datasetHeight = Number(cropImageElement?.dataset?.effectOriginalHeight || 0);
  const datasetCropX = Number(cropImageElement?.dataset?.effectCropX);
  const datasetCropY = Number(cropImageElement?.dataset?.effectCropY);
  const datasetCropWidth = Number(cropImageElement?.dataset?.effectCropWidth || 0);
  const datasetCropHeight = Number(cropImageElement?.dataset?.effectCropHeight || 0);
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
    // 横纵分别缩放：源图与目标尺寸的宽高比可能不同，不做等比换算。
    const scaleX = targetDimensions.width / datasetWidth;
    const scaleY = targetDimensions.height / datasetHeight;
    return {
      x: datasetCropX * scaleX,
      y: datasetCropY * scaleY,
      width: datasetCropWidth * scaleX,
      height: datasetCropHeight * scaleY
    };
  }
  return {
    x: 0,
    y: 0,
    width: targetDimensions.width,
    height: targetDimensions.height
  };
}
/**
 * 计算裁剪后图层的定位盒。
 */
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
  rotation: rotation = 0
}) {
  // 先转弧度：下面按标准二维旋转矩阵计算裁剪块中心相对原图中心的偏移。
  const rotationRad = (Number(rotation || 0) * Math.PI) / 180;
  const scaleFactor = Math.max(0.0001, Number(scale || 1));
  const offsetX =
    (Number(cropX || 0) + Number(cropWidth || 0) / 2 - Number(originalWidth || 0) / 2) *
    scaleFactor;
  const offsetY =
    (Number(cropY || 0) + Number(cropHeight || 0) / 2 - Number(originalHeight || 0) / 2) *
    scaleFactor;
  // 标准二维旋转矩阵，把「相对原图中心」的偏移转到旋转后的坐标系。
  const rotatedOffsetX = offsetX * Math.cos(rotationRad) - offsetY * Math.sin(rotationRad);
  const rotatedOffsetY = offsetX * Math.sin(rotationRad) + offsetY * Math.cos(rotationRad);
  const rotatedCenterX = Number(centerX || 0) + rotatedOffsetX;
  const rotatedCenterY = Number(centerY || 0) + rotatedOffsetY;
  return {
    left: rotatedCenterX - Number(cropWidth || 0) / 2,
    top: rotatedCenterY - Number(cropHeight || 0) / 2,
    width: Number(cropWidth || 0),
    height: Number(cropHeight || 0),
    scale: scaleFactor,
    rotation: Number(rotation || 0)
  };
}
/**
 * 为特效挑一张参考图，并算出它相对目标的缩放比例。
 */
export function effectReferenceImageTransform(
  project,
  referenceComponent,
  targetWidth,
  targetHeight,
  fillWidth,
  fillHeight
) {
  if (!(targetWidth > 0) || !(targetHeight > 0)) {
    return null;
  }
  const referenceZIndex = Number(referenceComponent?.position?.zIndex || 1);
  const referenceImageId = String(referenceComponent?.properties?.effectReferenceImageId || "");
  const referencedCandidates = [];
  const fallbackCandidates = [];
  // 递归把组件树里所有 image 塞进候选池。显式指定了 effectReferenceImageId 时只收该图；
  const collectCandidates = componentList => {
    for (const childComponent of componentList || []) {
      if (childComponent.type === "image") {
        const childProperties = childComponent.properties || {};
        const childNaturalWidth = Number(childProperties.naturalWidth || 0);
        const childNaturalHeight = Number(childProperties.naturalHeight || 0);
        const childZIndex = Number(childComponent.position?.zIndex || 1);
        const isReferenceImage = referenceImageId && childComponent.id === referenceImageId;
        const isBestSizeMatch =
          !referenceImageId &&
          childComponent.style?.visible !== false &&
          childNaturalWidth === targetWidth &&
          childNaturalHeight === targetHeight &&
          childZIndex < referenceZIndex;
        if (isReferenceImage || isBestSizeMatch) {
          const isFillLayout = childProperties.layoutMode === "fill";
          const childPosition = childComponent.position || {};
          const candidateWidth = isFillLayout
            ? fillWidth
            : Number(childPosition.width || targetWidth);
          const candidateHeight = isFillLayout
            ? fillHeight
            : Number(childPosition.height || targetHeight);
          const candidate = {
            zIndex: childZIndex,
            scale: Math.min(candidateWidth / targetWidth, candidateHeight / targetHeight)
          };
          if (isReferenceImage) {
            referencedCandidates.push(candidate);
          } else {
            fallbackCandidates.push(candidate);
          }
        }
      }
      collectCandidates(childComponent.children);
    }
  };
  collectCandidates(project?.components);
  return (
    referencedCandidates[0] ||
    // 兜底候选按层级降序，取最贴近参考组件（层级最高且仍在其下）的一张。
    fallbackCandidates.sort(
      (leftCandidate, rightCandidate) => rightCandidate.zIndex - leftCandidate.zIndex
    )[0] ||
    null
  );
}
