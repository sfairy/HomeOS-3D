/**
 * 能用 CSS `zoom` 放大的组件类型（白名单）。
 *
 * `transform: scale()` 放大的是**已经栅格化的图层**，文字会糊；`zoom` 会按新尺寸重新排版与栅格化，
 * 所以放大后文字仍然锐利。代价是 `zoom` 改变长度单位的基准（`left/top` 也一起吃），
 * 因此下面要按 `(x + w*(1-z)/2)/z` 反算回未缩放坐标系。
 *
 * 只对这三类放开：标题条 / 灯光统计 / 天气都是纯文字块，重排代价小；其它组件（iframe、
 * canvas、3D 场景、图片）重新栅格化要么无效要么贵得离谱。
 */
const ZOOM_FRIENDLY_COMPONENT_TYPES = ["title-button", "light-statistics", "weather"];

/** 宿主几何只读这几个字段：位置/尺寸/旋转，以及 `style.scale`（组件倍率）。 */
interface HostPositionLike {
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  rotation?: unknown;
}
interface HostComponentLike {
  type?: unknown;
  position?: HostPositionLike;
  style?: { scale?: unknown } | null;
}

/**
 * 组件宿主的定位/尺寸/变换（`left` / `top` / `width` / `height` / `zoom` / `transform`）。
 *
 * `zoom` 只写进 `style.zoom`（空串表示不缩放），`transform` 里只留 rotate 与剩余倍率
 * `scale / zoom` —— 两者都吃满时正好是原倍率，不重复放大。编辑态（`editable`）一律不用 zoom：
 * 拖拽/缩放手柄在缩放坐标系里会产生小数偏差，编辑器宁可糊一点也不愿意拖不准。
 */
export function componentHostGeometry(
  hostComponent: HostComponentLike | null | undefined,
  hostPosition: HostPositionLike = hostComponent?.position || {},
  {
    editable = false,
    layoutIsFill = false,
    supportsZoom = false,
  }: { editable?: boolean; layoutIsFill?: boolean; supportsZoom?: boolean } = {},
) {
  const hostX = Number(hostPosition.x || 0),
    hostY = Number(hostPosition.y || 0),
    hostWidth = Number(hostPosition.width || 100),
    hostHeight = Number(hostPosition.height || 100),
    hostScale = layoutIsFill
      ? 1
      : Math.max(0.01, Math.min(5, Number(hostComponent?.style?.scale || 1))),
    // fill 布局铺满画布，缩放没有意义；其余情况上界 5 与 UI 的滑杆范围一致。
    hostZoom =
      !editable &&
      supportsZoom &&
      hostScale > 1 &&
      typeof hostComponent?.type === "string" &&
      ZOOM_FRIENDLY_COMPONENT_TYPES.includes(hostComponent.type)
        ? hostScale
        : 1;
  return {
    left: (hostX + (hostWidth * (1 - hostZoom)) / 2) / hostZoom + "px",
    top: (hostY + (hostHeight * (1 - hostZoom)) / 2) / hostZoom + "px",
    width: hostWidth + "px",
    height: hostHeight + "px",
    zoom: hostZoom === 1 ? "" : String(hostZoom),
    transform:
      "rotate(" +
      Number(hostPosition.rotation || 0) +
      "deg) scale(" +
      hostScale / hostZoom +
      ")",
  };
}
export function airflowCanvasOffsetBounds(layer: any, canvasSize: any) {
  const layerPosition = layer?.position || {},
    layerWidth = Math.max(1, Number(layerPosition.width || 100)),
    layerHeight = Math.max(1, Number(layerPosition.height || 100)),
    canvasWidth = Math.max(1, Number(canvasSize?.width || 2778)),
    canvasHeight = Math.max(1, Number(canvasSize?.height || 1940)),
    layerCenterX = Number(layerPosition.x || 0) + layerWidth / 2,
    layerCenterY = Number(layerPosition.y || 0) + layerHeight / 2;
  return {
    minX: Math.min(-500, (-layerCenterX / layerWidth) * 100),
    maxX: Math.max(500, ((canvasWidth - layerCenterX) / layerWidth) * 100),
    minY: Math.min(-500, (-layerCenterY / layerHeight) * 100),
    maxY: Math.max(500, ((canvasHeight - layerCenterY) / layerHeight) * 100),
  };
}
export function airflowLayerGeometry(airflowLayer: any, { grouped: isGrouped = false } = {}) {
  const airflowLayerPosition = airflowLayer?.position || {},
    layerProperties = airflowLayer?.properties || {},
    airflowLayerWidth = Math.max(1, Number(airflowLayerPosition.width || 300)),
    airflowLayerHeight = Math.max(1, Number(airflowLayerPosition.height || 150)),
    airflowOffsetX = (airflowLayerWidth * Number(layerProperties.airflowOffsetX ?? -75)) / 100,
    airflowOffsetY = (airflowLayerHeight * Number(layerProperties.airflowOffsetY ?? 34)) / 100,
    airflowWidth =
      (airflowLayerWidth * Math.max(0.01, Number(layerProperties.airflowWidth ?? 64))) / 100,
    airflowHeight =
      (airflowLayerHeight * Math.max(0.01, Number(layerProperties.airflowHeight ?? 125))) / 100,
    airflowLayerRotation = Number(airflowLayerPosition.rotation || 0),
    airflowRotation = Number(layerProperties.airflowRotation || 0),
    airflowScale = Math.max(0.01, Math.min(5, Number(layerProperties.airflowScale || 1)));
  if (!isGrouped)
    return {
      left:
        Number(airflowLayerPosition.x || 0) +
        airflowLayerWidth / 2 +
        airflowOffsetX -
        airflowWidth / 2,
      top:
        Number(airflowLayerPosition.y || 0) +
        airflowLayerHeight / 2 +
        airflowOffsetY -
        airflowHeight / 2,
      width: airflowWidth,
      height: airflowHeight,
      rotation: airflowLayerRotation + airflowRotation,
      scale: airflowScale,
    };
  const airflowLayerScale = Math.max(0.01, Math.min(5, Number(airflowLayer?.style?.scale || 1))),
    airflowLayerAngleRad = (airflowLayerRotation * Math.PI) / 180,
    airflowLayerCosine = Math.cos(airflowLayerAngleRad),
    airflowLayerSine = Math.sin(airflowLayerAngleRad),
    rotatedOffsetX =
      (airflowLayerCosine * airflowOffsetX + airflowLayerSine * airflowOffsetY) / airflowLayerScale,
    rotatedOffsetY =
      (-airflowLayerSine * airflowOffsetX + airflowLayerCosine * airflowOffsetY) /
      airflowLayerScale;
  return {
    left: airflowLayerWidth / 2 + rotatedOffsetX - airflowWidth / 2,
    top: airflowLayerHeight / 2 + rotatedOffsetY - airflowHeight / 2,
    width: airflowWidth,
    height: airflowHeight,
    rotation: airflowRotation,
    scale: airflowScale / airflowLayerScale,
  };
}
export function rotateMultiSelectionTransforms(
  components: any,
  selectionCenterX: any,
  selectionCenterY: any,
  selectionRotationDeg: any,
) {
  const selectionRotationRad = (Number(selectionRotationDeg || 0) * Math.PI) / 180,
    selectionRotationCosine = Math.cos(selectionRotationRad),
    selectionRotationSine = Math.sin(selectionRotationRad);
  return (components || []).map((component: any) => {
    const componentOffsetX = Number(component.centerX || 0) - selectionCenterX,
      componentOffsetY = Number(component.centerY || 0) - selectionCenterY,
      rotatedCenterX =
        selectionCenterX +
        componentOffsetX * selectionRotationCosine -
        componentOffsetY * selectionRotationSine,
      rotatedCenterY =
        selectionCenterY +
        componentOffsetX * selectionRotationSine +
        componentOffsetY * selectionRotationCosine;
    return {
      componentId: component.componentId,
      x: rotatedCenterX - Number(component.width || 0) / 2,
      y: rotatedCenterY - Number(component.height || 0) / 2,
      rotation: Number(component.rotation || 0) + selectionRotationDeg,
    };
  });
}
export function groupedComponentLocalDelta(
  deltaX: any,
  deltaY: any,
  { rotation: groupRotationDeg = 0, scale: groupScale = 1 } = {},
) {
  const groupRotationRad = (Number(groupRotationDeg || 0) * Math.PI) / 180,
    groupRotationCosine = Math.cos(groupRotationRad),
    groupRotationSine = Math.sin(groupRotationRad),
    scaleFactor = Math.max(0.01, Number(groupScale) || 1);
  return {
    x:
      (groupRotationCosine * Number(deltaX || 0) + groupRotationSine * Number(deltaY || 0)) /
      scaleFactor,
    y:
      (-groupRotationSine * Number(deltaX || 0) + groupRotationCosine * Number(deltaY || 0)) /
      scaleFactor,
  };
}
