function d(arg1, arg2, arg3) {
  const value1 = arg1.floors || [],
    value2 = value1.find((arg4) => arg4.id === (arg2 === "all" ? arg3 : arg2));
  if (!value2) return null;
  const value3 = value2.scene,
    value4 = value3.calibration?.pixelsPerMeter || 1;
  if (arg2 === "all" && value1.length > 1) {
    const value10 = (-(value2.rotation || 0) * Math.PI) / 180,
      value11 = Math.cos(value10),
      value12 = Math.sin(value10);
    return {
      ppm: value4,
      c: value11,
      s: value12,
      x:
        (value2.offsetX || 0) -
        (value11 * (value2.originX || 0) + value12 * (value2.originY || 0)) / value4,
      z:
        (value2.offsetZ || 0) -
        (-value12 * (value2.originX || 0) + value11 * (value2.originY || 0)) / value4,
      y:
        [...value1].sort((arg5, arg6) => arg5.elevation - arg6.elevation).indexOf(value2) *
        arg1.previewFloorGap,
    };
  }
  if (
    !value3.walls?.length &&
    value3.items?.some((arg7) =>
      ["courtyard-area", "courtyard-path", "courtyard-fence"].includes(arg7.type),
    )
  )
    return {
      ppm: value4,
      c: 1,
      s: 0,
      x: -(value2.originX || 0) / value4,
      z: -(value2.originY || 0) / value4,
      y: 0,
    };
  let value5 = value3.walls?.length
    ? value3.walls.flatMap((arg8) => [arg8.start, arg8.end])
    : value3.items?.length
      ? value3.items
      : value3.background?.width && value3.background?.height
        ? [
            {
              x: 0,
              y: 0,
            },
            {
              x: value3.background.width,
              y: value3.background.height,
            },
          ]
        : [
            {
              x: 0,
              y: 0,
            },
            {
              x: 1200,
              y: 800,
            },
          ];
  if (
    ((value5 = value5.filter((arg9) => Number.isFinite(arg9?.x) && Number.isFinite(arg9?.y))),
    !value5.length)
  )
    return null;
  const value6 = Math.min(...value5.map((arg10) => arg10.x)),
    value7 = Math.min(...value5.map((arg11) => arg11.y)),
    value8 = Math.max(value6 + 1, ...value5.map((arg12) => arg12.x)),
    value9 = Math.max(value7 + 1, ...value5.map((arg13) => arg13.y));
  return {
    ppm: value4,
    c: 1,
    s: 0,
    x: -(value6 + value8) / 2 / value4,
    z: -(value7 + value9) / 2 / value4,
    y: 0,
  };
}
export function transformSceneCamera(arg14, arg15, arg16, arg17, arg18 = false) {
  if (!arg14) return arg14;
  const value13 = arg15.floors?.find((arg19) =>
    arg16.floors?.some((arg20) => arg20.id === arg19.id),
  )?.id;
  let value14 = d(arg15, arg17, value13),
    value15 = d(arg16, arg17, value13);
  if (!value14 || !value15) return structuredClone(arg14);
  arg18 && ([value14, value15] = [value15, value14]);
  const value16 = value14.ppm / value15.ppm,
    value17 = value15.c * value14.c + value15.s * value14.s,
    value18 = value15.s * value14.c - value15.c * value14.s,
    fn1 = ([arg21, arg22, arg23]) => [
      value17 * arg21 + value18 * arg23,
      arg22,
      -value18 * arg21 + value17 * arg23,
    ],
    fn2 = ([arg24, arg25, arg26]) => {
      const value19 = fn1([arg24 - value14.x, arg25 - value14.y, arg26 - value14.z]);
      return [
        value19[0] * value16 + value15.x,
        value19[1] * value16 + value15.y,
        value19[2] * value16 + value15.z,
      ];
    };
  return {
    ...structuredClone(arg14),
    position: fn2(arg14.position),
    target: fn2(arg14.target),
    ...(arg14.up
      ? {
          up: fn1(arg14.up),
        }
      : {}),
    ...(arg14.frameSize
      ? {
          frameSize: arg14.frameSize * value16,
        }
      : {}),
  };
}
