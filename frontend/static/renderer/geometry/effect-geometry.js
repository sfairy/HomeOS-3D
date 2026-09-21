/**
 * 特效图层的几何与层级计算：z-index 分配、图层尺寸推导、裁剪定位与参考图反推缩放。
 *
 * 位置：纯几何模块，被 3D 交互页与控件 runtime 共用；不碰网络，只读传入的对象与 DOM。
 *
 * 单位约定：left / top / width / height 是画布像素，rotation 是角度（deg），scale 是无量纲倍数；
 * percent 型属性（effectWidth / effectHeight）是相对宿主尺寸的百分比。
 */

// 人体感应特效的基础层级：取 5 亿，保证压在普通组件（z-index 通常几百到几千）之上，
// 又给下面的图标按钮特效留出更高的一档。
const PRESENCE_SENSOR_BASE_Z_INDEX = 500000000;
// 图标按钮特效的基础层级：取 10 亿，是画布内的最高档，确保按钮与光效永远可点。
const ICON_BUTTON_EFFECT_BASE_Z_INDEX = 1000000000;
/**
 * 给图标按钮特效组件补上缺省可见性开关。
 * 用 hasOwnProperty 而非真值判断：这两个属性都可能是 false（用户主动关闭），`??` 或 `||`
 * 会把用户的选择覆盖回 true；仅对键不存在的新数据补默认值。
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
 * 图标按钮特效仅在「按钮可见」或「隐藏内容也允许点击」时才抬到 ICON_BUTTON_EFFECT_BASE_Z_INDEX
 * （人体感应特效同理抬到 PRESENCE_SENSOR_BASE_Z_INDEX）；均不成立说明当前不可交互，不该挡住其它元素。
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
 * 兜底顺序：先看组件缓存的原始尺寸，再看图片元素 dataset 里的记录，
 * 最后才用元素的 naturalWidth / naturalHeight。
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
 * 宽高有效、起点非负、宽高为正、右 / 下边不越界这几项检查缺一不可：
 * 任何一项不成立都说明裁剪数据是坏的，此时宁可整图不裁也不要裁出黑边。
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
 * 裁剪块中心相对原图中心的偏移要先按 scale 放大、再随图层旋转角旋转，最后叠加到
 * 原图中心上，否则旋转后裁剪块会跑到错误的位置。
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
 * 优先显式指定 effectReferenceImageId；否则在「可见、原始尺寸与目标一致、层级低于参考组件」
 * 的图片里取层级最高者；都没有返回 null。
 */
export function effectReferenceImageTransform(
  project,
  referenceComponent,
  targetWidth,
  targetHeight,
  fillWidth,
  fillHeight
) {
  // 目标尺寸非法时无从比较，直接判无参考图，避免下面按 0 做分母。
  if (!(targetWidth > 0) || !(targetHeight > 0)) {
    return null;
  }
  const referenceZIndex = Number(referenceComponent?.position?.zIndex || 1);
  const referenceImageId = String(referenceComponent?.properties?.effectReferenceImageId || "");
  const referencedCandidates = [];
  const fallbackCandidates = [];
  // 递归把组件树里所有 image 塞进候选池。显式指定了 effectReferenceImageId 时只收该图；
  // 否则收「可见 + 原始尺寸与目标完全一致 + 层级低于参考组件」的图（启发式：同尺寸底图
  // 通常就是它所属的参考图）。分成两个数组是因为指定命中要优先于尺寸启发式。
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
          // 取宽高比的较小者，即等比缩放到完全装进目标框，避免参考图被拉变形。
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
