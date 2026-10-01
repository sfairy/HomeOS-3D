const e = (arg1, arg2) => {
  const value1 = Number(arg1);
  return Number.isFinite(value1) && value1 > 0 ? value1 : arg2;
};
export function floorplanAutoDiagramExportResolution(arg3 = {}, arg4 = {}) {
  const value2 = e(arg4.width, 2778),
    value3 = e(arg4.height, 1940),
    value4 = e(arg3.width, value2),
    value5 = e(arg3.height, value3),
    value6 = Math.sqrt((value2 * value3) / (value4 * value5)),
    value7 = Math.max(320 / value4, 320 / value5),
    value8 = Math.min(4096 / value4, 4096 / value5),
    value9 = value7 <= value8 ? Math.max(value7, Math.min(value8, value6)) : value8;
  return {
    width: Math.max(1, Math.round(value4 * value9)),
    height: Math.max(1, Math.round(value5 * value9)),
  };
}
