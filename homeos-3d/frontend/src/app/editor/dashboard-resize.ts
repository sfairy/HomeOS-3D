/**
 * 仪表盘画布尺寸调整：把整份文档从旧分辨率换算到新分辨率。
 */


// 保留 6 位小数，既压掉浮点误差，又不至于让坐标精度不足。
const roundToMicroPrecision = (rawValue: any) => Math.round(Number(rawValue) * 1e6) / 1e6;

// 宽高兜底：非有限数或非正数一律用默认值，防止 NaN 在整棵树里扩散。
function positiveNumberOrDefault(candidateNumber: any, fallbackNumber: any) {
  const numericValue = Number(candidateNumber);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : fallbackNumber;
}

/**
 * 递归缩放组件子树。
 */
function scaleComponentSubtree(  componentNode: any,
  horizontalScale: any,
  verticalScale: any,
  contentScaleFactor: any,
  isTopLevel: any = !0
) {
  if (!componentNode || typeof componentNode != "object") return;
  const position = componentNode.position || {},
    originalWidth = positiveNumberOrDefault(position.width, 100),
    originalHeight = positiveNumberOrDefault(position.height, 100),
    originalX = Number.isFinite(Number(position.x)) ? Number(position.x) : 0,
    originalY = Number.isFinite(Number(position.y)) ? Number(position.y) : 0,
    scaledWidth =
      originalWidth * (componentNode.type === "interaction3d" ? horizontalScale : contentScaleFactor),
    scaledHeight =
      originalHeight * (componentNode.type === "interaction3d" ? verticalScale : contentScaleFactor);
  if (
    ((componentNode.position = {
      ...position,
      x: roundToMicroPrecision(
        isTopLevel
          ? (originalX + originalWidth / 2) * horizontalScale - scaledWidth / 2
          : originalX * contentScaleFactor
      ),
      y: roundToMicroPrecision(
        isTopLevel
          ? (originalY + originalHeight / 2) * verticalScale - scaledHeight / 2
          : originalY * contentScaleFactor
      ),
      width: roundToMicroPrecision(scaledWidth),
      height: roundToMicroPrecision(scaledHeight)
    }),
    // 图标按钮特效的宽高是相对容器的百分比语义（fill 模式除外），
    componentNode.type === "icon-button-effect" &&
      componentNode.properties?.effectLayoutMode !== "fill")
  ) {
    const effectWidth = Number(componentNode.properties?.effectWidth),
      effectHeight = Number(componentNode.properties?.effectHeight);
    (Number.isFinite(effectWidth) &&
      (componentNode.properties.effectWidth = roundToMicroPrecision(
        (effectWidth * contentScaleFactor) / horizontalScale
      )),
      Number.isFinite(effectHeight) &&
        (componentNode.properties.effectHeight = roundToMicroPrecision(
          (effectHeight * contentScaleFactor) / verticalScale
        )));
  }
  // 子层级一律按同一 contentScaleFactor 缩放，且不再按画布比例定位。
  for (const nestedComponent of componentNode.children || [])
    scaleComponentSubtree(
      nestedComponent,
      contentScaleFactor,
      contentScaleFactor,
      contentScaleFactor,
      !1
    );
}

// 摊平「文档级共享组件 + 各页面顶层组件」，作为缩放 / 越界检查的统一输入。
function flattenDocumentComponents(dashboardDocument: any) {
  return [
    ...(dashboardDocument.sharedComponents || []),
    ...(dashboardDocument.pages || []).flatMap((page: any) => page.components || [])
  ];
}

// 只检查顶层组件的包围盒是否越出画布，嵌套子组件不单独判定。
function isComponentOutsideCanvas(targetComponent: any, canvasWidth: any, limitHeight: any) {
  // fill 模式的 3D 控件在布局上就是铺满画布的，尺寸跟着画布走，
  if (
    targetComponent?.type === "interaction3d" &&
    targetComponent.properties?.layoutMode === "fill"
  ) {
    return !1;
  }
  const componentPosition = targetComponent?.position || {},
    positionX = Number(componentPosition.x),
    positionY = Number(componentPosition.y),
    componentWidth = positiveNumberOrDefault(componentPosition.width, 100),
    componentHeight = positiveNumberOrDefault(componentPosition.height, 100);
  return !Number.isFinite(positionX) || !Number.isFinite(positionY)
    ? !1
    : positionX < 0 ||
        positionY < 0 ||
        positionX + componentWidth > canvasWidth ||
        positionY + componentHeight > limitHeight;
}

/**
 * 统计有多少顶层组件落在画布之外，用于调整尺寸前给用户提示。
 */
export function countComponentsOutsideCanvas(documentModel: any, documentWidth: any, documentHeight: any) {
  const limitWidth = Number(documentWidth),
    canvasHeight = Number(documentHeight);
  return !Number.isFinite(limitWidth) || !Number.isFinite(canvasHeight)
    ? 0
    : flattenDocumentComponents(documentModel).filter((component: any) =>
        isComponentOutsideCanvas(component, limitWidth, canvasHeight)
      ).length;
}

/**
 * 把文档缩放到目标画布尺寸。
 */
export function resizeDashboardDocument(sourceDocument: any, targetWidth: any, targetHeight: any, options: any = {}) {
  // 深拷贝：编辑器需要保留原文档用于撤销，绝不能就地改写入参；
  const resizedDocument = JSON.parse(JSON.stringify(sourceDocument)),
    baseWidth = positiveNumberOrDefault(resizedDocument?.canvas?.width, 2778),
    baseHeight = positiveNumberOrDefault(resizedDocument?.canvas?.height, 1940),
    resizeBaseWidth = positiveNumberOrDefault(resizedDocument?.canvas?.resizeBaseWidth, baseWidth),
    resizeBaseHeight = positiveNumberOrDefault(
      resizedDocument?.canvas?.resizeBaseHeight,
      baseHeight
    ),
    resizeContentScale = positiveNumberOrDefault(
      resizedDocument?.canvas?.resizeContentScale,
      Math.min(baseWidth / resizeBaseWidth, baseHeight / resizeBaseHeight)
    ),
    widthPx = Number(targetWidth),
    heightPx = Number(targetHeight);
  // 上下限与后端 panel/schema.py 的画布约束保持一致，后端也会再校验一次。
  if (!Number.isInteger(widthPx) || widthPx < 320 || widthPx > 7680)
    throw new Error(
      "仪表盘宽度必须为 320 至 7680 之间的整数。"
    );
  if (!Number.isInteger(heightPx) || heightPx < 240 || heightPx > 4320)
    throw new Error(
      "仪表盘高度必须为 240 至 4320 之间的整数。"
    );
  // 尺寸没变就直接返回副本，省掉一次全树遍历。
  if (widthPx === baseWidth && heightPx === baseHeight) return resizedDocument;
  if (options.lockContent) {
    for (const flatComponent of flattenDocumentComponents(resizedDocument)) {
      if (flatComponent.type === "interaction3d") {
        scaleComponentSubtree(
          flatComponent,
          widthPx / baseWidth,
          heightPx / baseHeight,
          1
        );
      }
    }
    return (
      (resizedDocument.canvas = {
        ...(resizedDocument.canvas || {}),
        width: widthPx,
        height: heightPx,
        resizeBaseWidth: roundToMicroPrecision(resizeBaseWidth),
        resizeBaseHeight: roundToMicroPrecision(resizeBaseHeight),
        resizeContentScale: roundToMicroPrecision(resizeContentScale)
      }),
      resizedDocument
    );
  }
  // scaleDelta 是增量比例 = 本次内容缩放 / 上次内容缩放，用于累乘到组件自身的缩放属性上。
  const scaleRatioX = widthPx / baseWidth,
    scaleRatioY = heightPx / baseHeight,
    nextContentScale = Math.min(widthPx / resizeBaseWidth, heightPx / resizeBaseHeight),
    scaleDelta = nextContentScale / resizeContentScale,
    components = flattenDocumentComponents(resizedDocument);
  for (const flatComponent of components)
    scaleComponentSubtree(flatComponent, scaleRatioX, scaleRatioY, scaleDelta, !0);
  return (
    (resizedDocument.canvas = {
      ...(resizedDocument.canvas || {}),
      width: widthPx,
      height: heightPx,
      componentScale: roundToMicroPrecision(
        positiveNumberOrDefault(resizedDocument.canvas?.componentScale, 1) * scaleDelta
      ),
      popupScale: roundToMicroPrecision(
        positiveNumberOrDefault(resizedDocument.canvas?.popupScale, 1) * scaleDelta
      ),
      resizeBaseWidth: roundToMicroPrecision(resizeBaseWidth),
      resizeBaseHeight: roundToMicroPrecision(resizeBaseHeight),
      resizeContentScale: roundToMicroPrecision(nextContentScale)
    }),
    resizedDocument
  );
}
