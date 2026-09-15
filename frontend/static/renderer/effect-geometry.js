/**
 * 特效图层的几何与层级计算。
 *
 * 职责：
 * - 决定特效宿主元素的 z-index（图标按钮特效、人体感应特效都要压在地图之上）；
 * - 决定特效图层 / 源图的尺寸，兼容「已声明尺寸」「图片原始尺寸」「加载中」三种时机；
 * - 处理特效图片的裁剪矩形与裁剪后的定位；
 * - 在工程里挑出一张「参考图」，用于按它反推特效的缩放比例。
 *
 * 位置：纯几何模块，被 3D 交互页与控件 runtime 共用；不碰网络，只读传入的对象与 DOM 元素。
 *
 * 单位约定：所有 left / top / width / height 都是画布像素，rotation 是角度（deg），
 * scale 是无量纲倍数。percent 型属性（effectWidth / effectHeight）是相对宿主尺寸的百分比。
 */

// 人体感应特效的基础层级：取 5 亿，保证压在普通组件（z-index 通常几百到几千）之上，
// 又给下面的图标按钮特效留出更高的一档。
const PRESENCE_SENSOR_BASE_Z_INDEX = 500000000;
// 图标按钮特效的基础层级：取 10 亿，是画布内的最高档，确保按钮与光效永远可点。
const ICON_BUTTON_EFFECT_BASE_Z_INDEX = 1000000000;
/**
 * 给图标按钮特效组件补上缺省可见性开关。
 *
 * 用 hasOwnProperty 而不是真值判断：这两个属性都可能是 false（用户主动关闭），
 * 用 `??` 或 `||` 会把用户的选择覆盖回 true。仅对新数据（键不存在）补默认值。
 *
 * @param {object} component 组件对象。
 * @returns {object} 补齐后的组件；非 icon-button-effect 类型原样返回。
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
 *
 * @param {object} hostComponent 宿主组件。
 * @param {number} baseZIndex 组件自身配置的层级。
 * @param {boolean} [applyTypeBoost] 是否施加类型加档。分组场景下传 false 关闭加档
 *   （分组内部已有自己的层叠上下文），但 group 类型例外——分组本身仍按普通层级处理。
 * @returns {number} 最终层级。
 *
 * 加档条件：图标按钮特效在「按钮可见」或「隐藏内容也允许点击」时才抬到 10 亿——
 * 两者都不成立说明这个特效当前不可交互，不该挡住其它元素。
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
    return 1000000000 + resolvedZIndex;
  } else if (hostComponent?.type === "presence-sensor") {
    return 500000000 + resolvedZIndex;
  } else {
    return resolvedZIndex;
  }
}
/**
 * 取特效的淡入淡出时长。
 *
 * @param {object} effectComponent 特效组件。
 * @returns {number} 秒数；属性缺失或非法时用 0.52，越界时夹到 0~3 秒。
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
 * 计算特效图层应该使用的尺寸。
 *
 * 取值优先级（先到先用）：
 * 1. 布局为 fill —— 直接铺满宿主，无需知道图片原始尺寸；
 * 2. 组件上已缓存的原图尺寸（effectNaturalWidth / effectNaturalHeight，加载完成后回填）；
 * 3. 图片元素当前可读到的原始尺寸（dataset 里的记录优先于 naturalWidth，后者在懒加载时可能为 0）；
 * 4. 全都拿不到时按百分比属性给一个临时尺寸，并把 pendingNaturalSize 置为 true，
 *    调用方据此在图片 load 事件后重算一次。
 *
 * @param {object} layerComponent 图层所属组件。
 * @param {HTMLImageElement} layerImageElement 图层图片元素。
 * @param {number} layerFallbackWidth 宿主宽度（fill 布局与百分比换算的基准）。
 * @param {number} layerFallbackHeight 宿主高度。
 * @returns {{width: number, height: number, pendingNaturalSize: boolean}} 尺寸与是否待补算。
 */
export function effectLayerDimensions(
  layerComponent,
  layerImageElement,
  layerFallbackWidth,
  layerFallbackHeight
) {
  if (layerComponent?.effectLayoutMode === "fill") {
    return {
      width: layerFallbackWidth,
      height: layerFallbackHeight,
      pendingNaturalSize: false
    };
  }
  const declaredWidth = Number(layerComponent?.effectNaturalWidth || 0);
  const declaredHeight = Number(layerComponent?.effectNaturalHeight || 0);
  const layerOriginalWidth = Number(
    layerImageElement?.dataset?.effectOriginalWidth || layerImageElement?.naturalWidth || 0
  );
  const layerOriginalHeight = Number(
    layerImageElement?.dataset?.effectOriginalHeight || layerImageElement?.naturalHeight || 0
  );
  const resolvedWidth = declaredWidth > 0 ? declaredWidth : layerOriginalWidth;
  const resolvedHeight = declaredHeight > 0 ? declaredHeight : layerOriginalHeight;
  if (resolvedWidth > 0 && resolvedHeight > 0) {
    return {
      width: resolvedWidth,
      height: resolvedHeight,
      pendingNaturalSize: false
    };
  } else {
    // 0.001% 的下限防止百分比为 0 时尺寸塌成 0，导致后续按尺寸做的比例换算全部除零。
    return {
      width:
        (layerFallbackWidth * Math.max(0.001, Number(layerComponent?.effectWidth ?? 100))) / 100,
      height:
        (layerFallbackHeight * Math.max(0.001, Number(layerComponent?.effectHeight ?? 100))) / 100,
      pendingNaturalSize: true
    };
  }
}
/**
 * 计算被裁剪源图的原始尺寸。
 *
 * 与 effectLayerDimensions 同构，但多一层兜底：先看组件缓存的原始尺寸，
 * 再看图片元素 dataset 里的记录，最后才用元素的 naturalWidth / naturalHeight。
 *
 * @param {object} sourceComponent 源图所属组件。
 * @param {HTMLImageElement} sourceImageElement 源图元素。
 * @param {number} containerWidth 容器宽度（fill 布局与百分比换算的基准）。
 * @param {number} containerHeight 容器高度。
 * @returns {{width: number, height: number, pendingNaturalSize: boolean}} 尺寸与是否待补算。
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
 *
 * 六项检查（宽高有效、起点非负、宽高为正、右 / 下边不越界）缺一不可：
 * 任何一项不成立都说明这段裁剪数据是坏的，此时宁可整图不裁也不要裁出黑边。
 *
 * @param {HTMLImageElement} cropImageElement 源图元素，裁剪参数存在 dataset 上。
 * @param {{width: number, height: number}} targetDimensions 目标尺寸。
 * @returns {{x: number, y: number, width: number, height: number}} 目标坐标系下的裁剪矩形。
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
 *
 * 裁剪块的中心相对原图中心有偏移，这个偏移要先按 scale 放大、
 * 再随图层旋转角旋转，最后叠加到原图中心上——否则旋转后裁剪块会跑到错误的位置。
 *
 * @param {object} geometry 几何参数。
 * @param {number} geometry.centerX 原图中心横坐标（父坐标系）。
 * @param {number} geometry.centerY 原图中心纵坐标。
 * @param {number} geometry.originalWidth 原图宽。
 * @param {number} geometry.originalHeight 原图高。
 * @param {number} geometry.cropX 裁剪矩形左上角（原图坐标系）。
 * @param {number} geometry.cropY 裁剪矩形左上角纵坐标。
 * @param {number} geometry.cropWidth 裁剪宽。
 * @param {number} geometry.cropHeight 裁剪高。
 * @param {number} [geometry.scale] 缩放倍数，兜底 0.0001 防止除零与退化。
 * @param {number} [geometry.rotation] 旋转角度（deg）。
 * @returns {{left: number, top: number, width: number, height: number, scale: number,
 *   rotation: number}}
 *   图层定位盒，left / top 已是左上角坐标。
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
 *
 * 两级候选：
 * - 显式指定的 effectReferenceImageId 命中即胜出（用户明确指定，无需再比尺寸）；
 * - 否则在「可见、原始尺寸与目标完全一致、层级低于参考组件」的图片里挑层级最高的那张，
 *   这是启发式兜底——同一尺寸的底图通常就是它所属的参考图。
 * 两者都没有时返回 null，调用方按无参考图处理。
 *
 * @param {object} project 工程对象，遍历其 components 树。
 * @param {object} referenceComponent 参照组件，提供 zIndex 与 effectReferenceImageId。
 * @param {number} targetWidth 目标宽度。
 * @param {number} targetHeight 目标高度。
 * @param {number} fillWidth fill 布局候选的宽度。
 * @param {number} fillHeight fill 布局候选的高度。
 * @returns {{zIndex: number, scale: number}|null} 参考图的层级与缩放比例；无候选返回 null。
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
