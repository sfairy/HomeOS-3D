const p = new TextEncoder();
export const EXPORT_RENDER_SCALE = 1,
  EXPORT_IMAGE_MIME_TYPE = "image/webp",
  EXPORT_IMAGE_EXTENSION = "webp",
  EXPORT_IMAGE_QUALITY = 0.95;
export function scaledExportResolution(arg1, arg2, arg3 = EXPORT_RENDER_SCALE) {
  const value1 = Number.isFinite(arg3) && arg3 > 0 ? arg3 : EXPORT_RENDER_SCALE;
  return {
    width: Math.max(1, Math.round(Number(arg1) * value1)),
    height: Math.max(1, Math.round(Number(arg2) * value1)),
  };
}
function E(arg4) {
  let value2 = 4294967295;
  for (const value3 of arg4) {
    value2 ^= value3;
    for (let value4 = 0; value4 < 8; value4 += 1)
      value2 = (value2 >>> 1) ^ (3988292384 & -(value2 & 1));
  }
  return (value2 ^ 4294967295) >>> 0;
}
function r(arg5, arg6, arg7) {
  arg5.setUint16(arg6, arg7, true);
}
function u(arg8, arg9, arg10) {
  arg8.setUint32(arg9, arg10 >>> 0, true);
}
function M(arg11) {
  const value5 = arg11.reduce((arg12, arg13) => arg12 + arg13.length, 0),
    uint8Array1 = new Uint8Array(value5);
  let value6 = 0;
  for (const value7 of arg11) (uint8Array1.set(value7, value6), (value6 += value7.length));
  return uint8Array1;
}
export function buildStoredZip(arg14) {
  const list1 = [],
    list2 = [];
  let value8 = 0;
  for (const value10 of arg14) {
    const value11 = p.encode(String(value10.name)),
      value12 = value10.data instanceof Uint8Array ? value10.data : new Uint8Array(value10.data),
      value13 = E(value12),
      uint8Array3 = new Uint8Array(30 + value11.length),
      dataView2 = new DataView(uint8Array3.buffer);
    (u(dataView2, 0, 67324752),
      r(dataView2, 4, 20),
      r(dataView2, 6, 2048),
      r(dataView2, 8, 0),
      r(dataView2, 10, 0),
      r(dataView2, 12, 0),
      u(dataView2, 14, value13),
      u(dataView2, 18, value12.length),
      u(dataView2, 22, value12.length),
      r(dataView2, 26, value11.length),
      r(dataView2, 28, 0),
      uint8Array3.set(value11, 30),
      list1.push(uint8Array3, value12));
    const uint8Array4 = new Uint8Array(46 + value11.length),
      dataView3 = new DataView(uint8Array4.buffer);
    (u(dataView3, 0, 33639248),
      r(dataView3, 4, 20),
      r(dataView3, 6, 20),
      r(dataView3, 8, 2048),
      r(dataView3, 10, 0),
      r(dataView3, 12, 0),
      r(dataView3, 14, 0),
      u(dataView3, 16, value13),
      u(dataView3, 20, value12.length),
      u(dataView3, 24, value12.length),
      r(dataView3, 28, value11.length),
      r(dataView3, 30, 0),
      r(dataView3, 32, 0),
      r(dataView3, 34, 0),
      r(dataView3, 36, 0),
      u(dataView3, 38, 0),
      u(dataView3, 42, value8),
      uint8Array4.set(value11, 46),
      list2.push(uint8Array4),
      (value8 += uint8Array3.length + value12.length));
  }
  const value9 = M(list2),
    uint8Array2 = new Uint8Array(22),
    dataView1 = new DataView(uint8Array2.buffer);
  return (
    u(dataView1, 0, 101010256),
    r(dataView1, 4, 0),
    r(dataView1, 6, 0),
    r(dataView1, 8, arg14.length),
    r(dataView1, 10, arg14.length),
    u(dataView1, 12, value9.length),
    u(dataView1, 16, value8),
    r(dataView1, 20, 0),
    M([...list1, value9, uint8Array2])
  );
}
export function buildLightDeltaPixels(arg15, arg16) {
  if (arg15.length !== arg16.length)
    throw new Error("Light layer frames must have matching dimensions.");
  const uint8ClampedArray1 = new Uint8ClampedArray(arg15.length);
  for (let value14 = 0; value14 < arg15.length; value14 += 4) {
    const value15 = arg15[value14 + 3] / 255,
      value16 = arg16[value14 + 3] / 255;
    if (value15 < 0.999) {
      if (value16 <= 1 / 255) continue;
      ((uint8ClampedArray1[value14] = arg16[value14]),
        (uint8ClampedArray1[value14 + 1] = arg16[value14 + 1]),
        (uint8ClampedArray1[value14 + 2] = arg16[value14 + 2]),
        (uint8ClampedArray1[value14 + 3] = arg16[value14 + 3]));
      continue;
    }
    let value17 = 0;
    const value18 =
      arg15[value14] * 0.2126 + arg15[value14 + 1] * 0.7152 + arg15[value14 + 2] * 0.0722;
    if (!(
      arg16[value14] * 0.2126 +
        arg16[value14 + 1] * 0.7152 +
        arg16[value14 + 2] * 0.0722 -
        value18 <=
        1.5 && Math.abs(value16 - value15) <= 1 / 255
    )) {
      for (let value19 = 0; value19 < 3; value19 += 1) {
        const value20 = arg15[value14 + value19],
          value21 = arg16[value14 + value19] - value20,
          value22 =
            value21 >= 0 ? value21 / Math.max(255 - value20, 1) : -value21 / Math.max(value20, 1);
        value17 = Math.max(value17, value22);
      }
      if (
        ((value17 = Math.min(Math.max(value17, Math.abs(value16 - value15)), 1)),
        !(value17 < 1 / 255))
      ) {
        for (let value23 = 0; value23 < 3; value23 += 1) {
          const value24 = arg15[value14 + value23],
            value25 = arg16[value14 + value23];
          uint8ClampedArray1[value14 + value23] = Math.round(
            Math.min(Math.max((value25 - value24 * (1 - value17)) / value17, 0), 255),
          );
        }
        uint8ClampedArray1[value14 + 3] = Math.round(value17 * 255);
      }
    }
  }
  return uint8ClampedArray1;
}
