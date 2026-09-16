/**
 * 仪表盘画布尺寸调整：把整份文档从旧分辨率换算到新分辨率。
 *
 * 位置：编辑器「画布尺寸」对话框调用；展示页不做换算，只读结果。
 * 职责：深拷贝文档后，按宽度 / 高度比例与内容缩放因子重算所有组件的
 *   position，并同步画布的 componentScale / popupScale 与重算基准。
 * 约定：resizeBaseWidth / resizeBaseHeight / resizeContentScale 三个字段
 *   记录「上一次调整的基准」，多次调整时用它们而不是当前尺寸算比例，
 *   避免连续缩放导致累积误差；数值统一四舍五入到 1e-6。
 */

// 保留 6 位小数，既压掉浮点误差，又不至于让坐标精度不足。
const roundToMicroPrecision = rawValue => Math.round(Number(rawValue) * 1e6) / 1e6;

// 宽高兜底：非有限数或非正数一律用默认值，防止 NaN 在整棵树里扩散。
function positiveNumberOrDefault(candidateNumber, fallbackNumber) {
  const numericValue = Number(candidateNumber);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : fallbackNumber;
}

/**
 * 递归缩放组件子树。
 *
 * @param {object} componentNode 组件节点，可就地修改。
 * @param {number} horizontalScale 顶层组件的水平缩放比例。
 * @param {number} verticalScale 顶层组件的垂直缩放比例。
 * @param {number} contentScaleFactor 内容缩放因子（子层级按此整体缩放）。
 * @param {boolean} [isTopLevel] 是否为顶层组件；顶层按画布比例定位，子组件随父缩放。
 * @returns {void}
 */
function scaleComponentSubtree(
  componentNode,
  horizontalScale,
  verticalScale,
  contentScaleFactor,
  isTopLevel = !0
) {
  if (!componentNode || typeof componentNode != "object") return;
  const position = componentNode.position || {},
    originalWidth = positiveNumberOrDefault(position.width, 100),
    originalHeight = positiveNumberOrDefault(position.height, 100),
    originalX = Number.isFinite(Number(position.x)) ? Number(position.x) : 0,
    originalY = Number.isFinite(Number(position.y)) ? Number(position.y) : 0,
    // 3D 控件的外框按画布比例伸缩，其余组件按统一的内容缩放因子：
    // 3D 的内部画布是铺满自身外框渲染的，若用等比因子，外框与内部渲染口径不一致，
    // 就会出现黑边或内容被裁切。
    scaledWidth =
      originalWidth * (componentNode.type === "interaction3d" ? horizontalScale : contentScaleFactor),
    scaledHeight =
      originalHeight * (componentNode.type === "interaction3d" ? verticalScale : contentScaleFactor);
  // 定位规则：顶层组件按中心点对齐缩放，避免靠近边界的组件被挤出画布；
  // 子组件只随父级等比缩放，保持相对父容器的位置。
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
    // 这里用除法还原，抵消父级缩放，保证特效视觉尺寸不变。
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

// 摊平共享组件与各页面顶层组件，作为缩放 / 越界检查的统一输入。
function flattenComponents(dashboardDocument) {
  return [
    ...(dashboardDocument.sharedComponents || []),
    ...(dashboardDocument.pages || []).flatMap(page => page.components || [])
  ];
}

// 只检查顶层组件的包围盒是否越出画布，嵌套子组件不单独判定。
function isComponentOutsideCanvas(targetComponent, canvasWidth, limitHeight) {
  // fill 模式的 3D 控件在布局上就是铺满画布的，尺寸跟着画布走，
  // 永远不会越界；按记录尺寸判定反而会在改比例后误报。
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
  // 坐标缺失时视为历史脏数据，不当作越界，避免误报。
  return !Number.isFinite(positionX) || !Number.isFinite(positionY)
    ? !1
    : positionX < 0 ||
        positionY < 0 ||
        positionX + componentWidth > canvasWidth ||
        positionY + componentHeight > limitHeight;
}

/**
 * 统计有多少顶层组件落在画布之外，用于调整尺寸前给用户提示。
 *
 * @param {object} documentModel 文档模型。
 * @param {number} documentWidth 目标画布宽度。
 * @param {number} documentHeight 目标画布高度。
 * @returns {number} 越界组件数量；画布尺寸非法时返回 0。
 */
export function countComponentsOutsideCanvas(documentModel, documentWidth, documentHeight) {
  const limitWidth = Number(documentWidth),
    canvasHeight = Number(documentHeight);
  return !Number.isFinite(limitWidth) || !Number.isFinite(canvasHeight)
    ? 0
    : flattenComponents(documentModel).filter(component =>
        isComponentOutsideCanvas(component, limitWidth, canvasHeight)
      ).length;
}

/**
 * 把文档缩放到目标画布尺寸。
 *
 * @param {object} sourceDocument 原始文档模型，函数内不修改它。
 * @param {number} targetWidth 目标宽度（像素整数，320~7680）。
 * @param {number} targetHeight 目标高度（像素整数，240~4320）。
 * @param {object} [options] 选项。
 * @param {boolean} [options.lockContent] 仅改画布尺寸、不缩放任何组件内容。
 * @returns {object} 缩放后的新文档模型。
 * @throws {Error} 宽或高不是范围内的整数时抛出中文错误文案。
 */
export function resizeDashboardDocument(sourceDocument, targetWidth, targetHeight, options = {}) {
  // 深拷贝：编辑器需要保留原文档用于撤销，绝不能就地改写入参；
  // 缺少 resizeBase* 字段的老文档以当前尺寸为基准，等价于「一次性缩放」。
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
      "\u4EEA\u8868\u76D8\u5BBD\u5EA6\u5FC5\u987B\u4E3A 320 \u81F3 7680 \u4E4B\u95F4\u7684\u6574\u6570\u3002"
    );
  if (!Number.isInteger(heightPx) || heightPx < 240 || heightPx > 4320)
    throw new Error(
      "\u4EEA\u8868\u76D8\u9AD8\u5EA6\u5FC5\u987B\u4E3A 240 \u81F3 4320 \u4E4B\u95F4\u7684\u6574\u6570\u3002"
    );
  // 尺寸没变就直接返回副本，省掉一次全树遍历。
  if (widthPx === baseWidth && heightPx === baseHeight) return resizedDocument;
  // lockContent：只改画布大小，组件保持原样，常用于「扩展画布再手动排版」。
  // 3D 控件是唯一例外：它的外框必须跟着画布比例走，否则 fill 模式下的
  // 渲染尺寸会与画布对不上，缩放时出现内容拉伸或黑边。
  if (options.lockContent) {
    for (const flatComponent of flattenComponents(resizedDocument)) {
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
    components = flattenComponents(resizedDocument);
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
