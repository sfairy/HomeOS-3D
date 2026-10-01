export function airflowCanvasOffsetBounds(arg1, arg2) {
  const value1 = arg1?.position || {},
    value2 = Math.max(1, Number(value1.width || 100)),
    value3 = Math.max(1, Number(value1.height || 100)),
    value4 = Math.max(1, Number(arg2?.width || 2778)),
    value5 = Math.max(1, Number(arg2?.height || 1940)),
    value6 = Number(value1.x || 0) + value2 / 2,
    value7 = Number(value1.y || 0) + value3 / 2;
  return {
    minX: Math.min(-500, (-value6 / value2) * 100),
    maxX: Math.max(500, ((value4 - value6) / value2) * 100),
    minY: Math.min(-500, (-value7 / value3) * 100),
    maxY: Math.max(500, ((value5 - value7) / value3) * 100),
  };
}
export function airflowLayerGeometry(arg3, { grouped: arg4 = false } = {}) {
  const value8 = arg3?.position || {},
    value9 = arg3?.properties || {},
    value10 = Math.max(1, Number(value8.width || 300)),
    value11 = Math.max(1, Number(value8.height || 150)),
    value12 = (value10 * Number(value9.airflowOffsetX ?? -75)) / 100,
    value13 = (value11 * Number(value9.airflowOffsetY ?? 34)) / 100,
    value14 = (value10 * Math.max(0.01, Number(value9.airflowWidth ?? 64))) / 100,
    value15 = (value11 * Math.max(0.01, Number(value9.airflowHeight ?? 125))) / 100,
    value16 = Number(value8.rotation || 0),
    value17 = Number(value9.airflowRotation || 0),
    value18 = Math.max(0.01, Math.min(5, Number(value9.airflowScale || 1)));
  if (!arg4)
    return {
      left: Number(value8.x || 0) + value10 / 2 + value12 - value14 / 2,
      top: Number(value8.y || 0) + value11 / 2 + value13 - value15 / 2,
      width: value14,
      height: value15,
      rotation: value16 + value17,
      scale: value18,
    };
  const value19 = Math.max(0.01, Math.min(5, Number(arg3?.style?.scale || 1))),
    value20 = (value16 * Math.PI) / 180,
    value21 = Math.cos(value20),
    value22 = Math.sin(value20),
    value23 = (value21 * value12 + value22 * value13) / value19,
    value24 = (-value22 * value12 + value21 * value13) / value19;
  return {
    left: value10 / 2 + value23 - value14 / 2,
    top: value11 / 2 + value24 - value15 / 2,
    width: value14,
    height: value15,
    rotation: value17,
    scale: value18 / value19,
  };
}
export function rotateMultiSelectionTransforms(arg5, arg6, arg7, arg8) {
  const value25 = (Number(arg8 || 0) * Math.PI) / 180,
    value26 = Math.cos(value25),
    value27 = Math.sin(value25);
  return (arg5 || []).map((arg9) => {
    const value28 = Number(arg9.centerX || 0) - arg6,
      value29 = Number(arg9.centerY || 0) - arg7,
      value30 = arg6 + value28 * value26 - value29 * value27,
      value31 = arg7 + value28 * value27 + value29 * value26;
    return {
      componentId: arg9.componentId,
      x: value30 - Number(arg9.width || 0) / 2,
      y: value31 - Number(arg9.height || 0) / 2,
      rotation: Number(arg9.rotation || 0) + arg8,
    };
  });
}
export function groupedComponentLocalDelta(
  arg10,
  arg11,
  { rotation: arg12 = 0, scale: arg13 = 1 } = {},
) {
  const value32 = (Number(arg12 || 0) * Math.PI) / 180,
    value33 = Math.cos(value32),
    value34 = Math.sin(value32),
    value35 = Math.max(0.01, Number(arg13) || 1);
  return {
    x: (value33 * Number(arg10 || 0) + value34 * Number(arg11 || 0)) / value35,
    y: (-value34 * Number(arg10 || 0) + value33 * Number(arg11 || 0)) / value35,
  };
}
