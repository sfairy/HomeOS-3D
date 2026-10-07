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
