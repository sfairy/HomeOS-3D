/**
 * 画布几何变换工具：为「出风层」（空调 / 风扇的送风动画图层）与多选拖拽提供坐标换算 ——
 * 算出出风层在普通控件内与分组内的落点，以及分组旋转缩放后鼠标位移在本地的分量。
 *
 * 位置：纯计算模块，被编辑器与运行时共用；不读 DOM，也不碰控件注册表。
 * 坐标约定：position / properties 里 x、y、width、height 是画布像素，rotation 是角度（deg，顺时针为正），
 * scale 是无量纲倍数；而出风层的 airflowOffsetX / Y、airflowWidth / Height 是相对控件宽高的百分比。
 */

/**
 * 计算出风层偏移量的可调上下界（百分比单位）。
 * 界值取「控件中心推到画布边缘时的比例」与 ±500 中更外扩者（下限 Math.min、上限 Math.max），
 * 这样控件在任何角落都有 ±500% 可调空间，居中时也不会被压成 0。
 */
export function airflowCanvasOffsetBounds(component, canvasSize) {
  const position = component?.position || {};
  // 宽高至少为 1，否则下面按宽高做分母时会得到 Infinity。
  const componentWidthPx = Math.max(1, Number(position.width || 100));
  const componentHeightPx = Math.max(1, Number(position.height || 100));
  const canvasWidth = Math.max(1, Number(canvasSize?.width || 2778));
  const canvasHeight = Math.max(1, Number(canvasSize?.height || 1940));
  const centerX = Number(position.x || 0) + componentWidthPx / 2;
  const centerY = Number(position.y || 0) + componentHeightPx / 2;
  return {
    minX: Math.min(-500, (-centerX / componentWidthPx) * 100),
    maxX: Math.max(500, ((canvasWidth - centerX) / componentWidthPx) * 100),
    minY: Math.min(-500, (-centerY / componentHeightPx) * 100),
    maxY: Math.max(500, ((canvasHeight - centerY) / componentHeightPx) * 100)
  };
}
/**
 * 计算出风图层的定位盒。
 * 分组内外口径刻意不同：未分组时 left / top 是画布绝对坐标；分组内时是相对组内原点，并先按组
 * 旋转把偏移转到本地坐标系、再除以组缩放抵消父层 transform，rotation 只留自身角度、scale 除以组缩放。
 */
export function airflowLayerGeometry(sourceComponent, { grouped: isGrouped = false } = {}) {
  const componentPosition = sourceComponent?.position || {};
  const properties = sourceComponent?.properties || {};
  const componentWidth = Math.max(1, Number(componentPosition.width || 300));
  const componentHeight = Math.max(1, Number(componentPosition.height || 150));
  // 横向偏移按控件宽度换算像素；-75 是历史默认值，表示出风层略偏左，
  // 老文档没写这个属性时也有一段可见的送风动画。
  const airflowOffsetXPx = (componentWidth * Number(properties.airflowOffsetX ?? -75)) / 100;
  // 纵向用控件高度单独换算（不共用宽度）：控件高宽比千差万别，分开换算才能保住视觉比例。
  const airflowOffsetYPx = (componentHeight * Number(properties.airflowOffsetY ?? 34)) / 100;
  // 宽高各给 0.01% 的下限：0 会让图层塌成一条线，负值会翻转朝向。
  const airflowWidthPx =
    (componentWidth * Math.max(0.01, Number(properties.airflowWidth ?? 64))) / 100;
  const airflowHeightPx =
    (componentHeight * Math.max(0.01, Number(properties.airflowHeight ?? 125))) / 100;
  const componentRotation = Number(componentPosition.rotation || 0);
  const airflowRotation = Number(properties.airflowRotation || 0);
  const airflowScale = Math.max(0.01, Math.min(5, Number(properties.airflowScale || 1)));
  if (!isGrouped) {
    // 未分组：把偏移从组件中心算起，再减去图层自身一半的宽高换算成左上角坐标。
    return {
      left:
        Number(componentPosition.x || 0) +
        componentWidth / 2 +
        airflowOffsetXPx -
        airflowWidthPx / 2,
      top:
        Number(componentPosition.y || 0) +
        componentHeight / 2 +
        airflowOffsetYPx -
        airflowHeightPx / 2,
      width: airflowWidthPx,
      height: airflowHeightPx,
      rotation: componentRotation + airflowRotation,
      scale: airflowScale
    };
  }
  const groupScale = Math.max(0.01, Math.min(5, Number(sourceComponent?.style?.scale || 1)));
  // 组的旋转量就存在组件自己的 position.rotation 上（组容器与组内控件共用同一个角度），
  // 所以这里不需要额外参数；三角函数要弧度，先由角度制换算过来。
  const groupRotationRadians = (componentRotation * Math.PI) / 180;
  const groupRotationCos = Math.cos(groupRotationRadians);
  const groupRotationSin = Math.sin(groupRotationRadians);
  // 逆旋转矩阵（角度取相反数，等价于把这个矩阵非对角项改号）加上除以组缩放，
  // 把画布方向上的偏移换算到组内本地坐标系。
  const scaledOffsetXPx =
    (groupRotationCos * airflowOffsetXPx + groupRotationSin * airflowOffsetYPx) / groupScale;
  const scaledOffsetYPx =
    (-groupRotationSin * airflowOffsetXPx + groupRotationCos * airflowOffsetYPx) / groupScale;
  return {
    left: componentWidth / 2 + scaledOffsetXPx - airflowWidthPx / 2,
    top: componentHeight / 2 + scaledOffsetYPx - airflowHeightPx / 2,
    width: airflowWidthPx,
    height: airflowHeightPx,
    rotation: airflowRotation,
    scale: airflowScale / groupScale
  };
}
/**
 * 围绕枢轴点旋转一组控件的变换。
 * 先把各控件中心平移到以枢轴为原点的相对坐标，乘旋转矩阵后再平移回去，
 * 最后按控件自身宽高还原成左上角坐标。
 */
export function rotateMultiSelectionTransforms(transforms, pivotX, pivotY, pivotRotationDegrees) {
  // 本次旋转增量由角度制换算成弧度，只算一次供下面所有控件复用。
  const selectionRotationRadians = (Number(pivotRotationDegrees || 0) * Math.PI) / 180;
  const selectionRotationCos = Math.cos(selectionRotationRadians);
  const selectionRotationSin = Math.sin(selectionRotationRadians);
  return (transforms || []).map(transform => {
    const relativeX = Number(transform.centerX || 0) - pivotX;
    const relativeY = Number(transform.centerY || 0) - pivotY;
    const rotatedX = pivotX + relativeX * selectionRotationCos - relativeY * selectionRotationSin;
    const rotatedY = pivotY + relativeX * selectionRotationSin + relativeY * selectionRotationCos;
    return {
      componentId: transform.componentId,
      x: rotatedX - Number(transform.width || 0) / 2,
      y: rotatedY - Number(transform.height || 0) / 2,
      // 角度直接相加；象限判定交给下游渲染，这里不做归一化。
      rotation: Number(transform.rotation || 0) + pivotRotationDegrees
    };
  });
}
/**
 * 把画布方向的位移换算成分组本地坐标系的位移。
 * 分组带旋转缩放时鼠标位移不等于控件在组内位移，这里用逆旋转（非对角项改号）
 * 加除以缩放还原，拖拽才能贴着指针走。
 */
export function groupedComponentLocalDelta(
  deltaX,
  deltaY,
  { rotation: rotationDegrees = 0, scale: scale = 1 } = {}
) {
  // 组的旋转角同样以角度制传入，换一次弧度供下面的逆旋转矩阵使用。
  const localRotationRadians = (Number(rotationDegrees || 0) * Math.PI) / 180;
  const localRotationCos = Math.cos(localRotationRadians);
  const localRotationSin = Math.sin(localRotationRadians);
  const groupLocalScale = Math.max(0.01, Number(scale) || 1);
  return {
    x:
      (localRotationCos * Number(deltaX || 0) + localRotationSin * Number(deltaY || 0)) /
      groupLocalScale,
    y:
      (-localRotationSin * Number(deltaX || 0) + localRotationCos * Number(deltaY || 0)) /
      groupLocalScale
  };
}
