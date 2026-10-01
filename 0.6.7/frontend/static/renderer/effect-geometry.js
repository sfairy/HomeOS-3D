const O = 500000000,
  S = 1000000000;
export function normalizeIconButtonEffectComponent(arg1) {
  if (arg1?.type !== "icon-button-effect") return arg1;
  const object1 = {
    ...(arg1.properties || {}),
  };
  return (
    Object.prototype.hasOwnProperty.call(object1, "buttonVisible") ||
      (object1.buttonVisible = true),
    Object.prototype.hasOwnProperty.call(object1, "effectVisible") ||
      (object1.effectVisible = true),
    {
      ...arg1,
      properties: object1,
    }
  );
}
export function componentHostZIndex(arg2, arg3, arg4 = true) {
  const value1 = Number(arg3 || 0);
  return !arg4 && arg2?.type !== "group"
    ? value1
    : arg2?.type === "icon-button-effect" &&
        (arg2.properties?.buttonVisible !== false ||
          arg2.properties?.hiddenContentClickable === true)
      ? 1000000000 + value1
      : arg2?.type === "presence-sensor"
        ? 500000000 + value1
        : value1;
}
export function effectFadeDuration(arg5) {
  const value2 = Number(arg5?.properties?.effectFadeDuration);
  return Number.isFinite(value2) ? Math.max(0, Math.min(3, value2)) : 0.52;
}
export function effectLayerDimensions(arg6, arg7, arg8, arg9) {
  if (arg6?.effectLayoutMode === "fill")
    return {
      width: arg8,
      height: arg9,
      pendingNaturalSize: false,
    };
  const value3 = Number(arg6?.effectNaturalWidth || 0),
    value4 = Number(arg6?.effectNaturalHeight || 0),
    value5 = Number(arg7?.dataset?.effectOriginalWidth || arg7?.naturalWidth || 0),
    value6 = Number(arg7?.dataset?.effectOriginalHeight || arg7?.naturalHeight || 0),
    value7 = value3 > 0 ? value3 : value5,
    value8 = value4 > 0 ? value4 : value6;
  return value7 > 0 && value8 > 0
    ? {
        width: value7,
        height: value8,
        pendingNaturalSize: false,
      }
    : {
        width: (arg8 * Math.max(0.001, Number(arg6?.effectWidth ?? 100))) / 100,
        height: (arg9 * Math.max(0.001, Number(arg6?.effectHeight ?? 100))) / 100,
        pendingNaturalSize: true,
      };
}
export function effectSourceDimensions(arg10, arg11, arg12, arg13) {
  const value9 = Number(arg10?.effectNaturalWidth || 0),
    value10 = Number(arg10?.effectNaturalHeight || 0),
    value11 = Number(arg11?.dataset?.effectOriginalWidth || 0),
    value12 = Number(arg11?.dataset?.effectOriginalHeight || 0),
    value13 = Number(arg11?.naturalWidth || 0),
    value14 = Number(arg11?.naturalHeight || 0),
    value15 = value9 > 0 ? value9 : value11 > 0 ? value11 : value13,
    value16 = value10 > 0 ? value10 : value12 > 0 ? value12 : value14;
  return value15 > 0 && value16 > 0
    ? {
        width: value15,
        height: value16,
        pendingNaturalSize: false,
      }
    : arg10?.effectLayoutMode === "fill"
      ? {
          width: arg12,
          height: arg13,
          pendingNaturalSize: true,
        }
      : {
          width: (arg12 * Math.max(0.001, Number(arg10?.effectWidth ?? 100))) / 100,
          height: (arg13 * Math.max(0.001, Number(arg10?.effectHeight ?? 100))) / 100,
          pendingNaturalSize: true,
        };
}
export function effectCropRectangle(arg14, arg15) {
  const value17 = Number(arg14?.dataset?.effectOriginalWidth || 0),
    value18 = Number(arg14?.dataset?.effectOriginalHeight || 0),
    value19 = Number(arg14?.dataset?.effectCropX),
    value20 = Number(arg14?.dataset?.effectCropY),
    value21 = Number(arg14?.dataset?.effectCropWidth || 0),
    value22 = Number(arg14?.dataset?.effectCropHeight || 0);
  if (
    value17 > 0 &&
    value18 > 0 &&
    Number.isFinite(value19) &&
    Number.isFinite(value20) &&
    value19 >= 0 &&
    value20 >= 0 &&
    value21 > 0 &&
    value22 > 0 &&
    value19 + value21 <= value17 &&
    value20 + value22 <= value18
  ) {
    const value23 = arg15.width / value17,
      value24 = arg15.height / value18;
    return {
      x: value19 * value23,
      y: value20 * value24,
      width: value21 * value23,
      height: value22 * value24,
    };
  }
  return {
    x: 0,
    y: 0,
    width: arg15.width,
    height: arg15.height,
  };
}
export function effectCroppedLayerGeometry({
  centerX: arg16,
  centerY: arg17,
  originalWidth: arg18,
  originalHeight: arg19,
  cropX: arg20,
  cropY: arg21,
  cropWidth: arg22,
  cropHeight: arg23,
  scale: arg24 = 1,
  rotation: arg25 = 0,
}) {
  const value25 = (Number(arg25 || 0) * Math.PI) / 180,
    value26 = Math.max(0.0001, Number(arg24 || 1)),
    value27 = (Number(arg20 || 0) + Number(arg22 || 0) / 2 - Number(arg18 || 0) / 2) * value26,
    value28 = (Number(arg21 || 0) + Number(arg23 || 0) / 2 - Number(arg19 || 0) / 2) * value26,
    value29 = value27 * Math.cos(value25) - value28 * Math.sin(value25),
    value30 = value27 * Math.sin(value25) + value28 * Math.cos(value25),
    value31 = Number(arg16 || 0) + value29,
    value32 = Number(arg17 || 0) + value30;
  return {
    left: value31 - Number(arg22 || 0) / 2,
    top: value32 - Number(arg23 || 0) / 2,
    width: Number(arg22 || 0),
    height: Number(arg23 || 0),
    scale: value26,
    rotation: Number(arg25 || 0),
  };
}
export function effectReferenceImageTransform(arg26, arg27, arg28, arg29, arg30, arg31) {
  if (!(arg28 > 0 && arg29 > 0)) return null;
  const value33 = Number(arg27?.position?.zIndex || 1),
    value34 = String(arg27?.properties?.effectReferenceImageId || ""),
    list1 = [],
    list2 = [],
    fn1 = (arg32) => {
      for (const value35 of arg32 || []) {
        if (value35.type === "image") {
          const value36 = value35.properties || {},
            value37 = Number(value36.naturalWidth || 0),
            value38 = Number(value36.naturalHeight || 0),
            value39 = Number(value35.position?.zIndex || 1),
            value40 = value34 && value35.id === value34,
            value41 =
              !value34 &&
              value35.style?.visible !== false &&
              value37 === arg28 &&
              value38 === arg29 &&
              value39 < value33;
          if (value40 || value41) {
            const value42 = value36.layoutMode === "fill",
              value43 = value35.position || {},
              value44 = value42 ? arg30 : Number(value43.width || arg28),
              value45 = value42 ? arg31 : Number(value43.height || arg29),
              object2 = {
                zIndex: value39,
                scale: Math.min(value44 / arg28, value45 / arg29),
              };
            value40 ? list1.push(object2) : list2.push(object2);
          }
        }
        fn1(value35.children);
      }
    };
  return (
    fn1(arg26?.components),
    list1[0] || list2.sort((arg33, arg34) => arg34.zIndex - arg33.zIndex)[0] || null
  );
}
