const _ = Object.freeze([0, 0, 1, 0, 1, 1, 0, 1]),
  F = Object.freeze([
    [-1.5, 2.5],
    [-1.5, 2.5],
    [-1.5, 2.5],
    [-1.5, 2.5],
    [-1.5, 2.5],
    [-1.5, 2.5],
    [-1.5, 2.5],
    [-1.5, 2.5],
  ]);
export function doorWindowPerspectiveCorners(arg1) {
  return (Array.isArray(arg1) && arg1.length === 8 ? arg1 : _).map((arg2, arg3) => {
    const value1 = Number(arg2),
      value2 = _[arg3],
      [value3, value4] = F[arg3];
    return Math.max(value3, Math.min(value4, Number.isFinite(value1) ? value1 : value2));
  });
}
export function doorWindowPerspectiveMatrix(arg4, arg5, arg6) {
  const value5 = Math.max(1, Number(arg4) || 1),
    value6 = Math.max(1, Number(arg5) || 1),
    value7 = doorWindowPerspectiveCorners(arg6),
    [value8, value9, value10, value11, value12, value13, value14, value15] = value7.map(
      (arg7, arg8) => arg7 * (arg8 % 2 === 0 ? value5 : value6),
    ),
    value16 = value10 - value12,
    value17 = value14 - value12,
    value18 = value8 - value10 + value12 - value14,
    value19 = value11 - value13,
    value20 = value15 - value13,
    value21 = value9 - value11 + value13 - value15,
    value22 = value16 * value20 - value17 * value19;
  if (Math.abs(value22) < 0.000001) return "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)";
  const value23 = (value18 * value20 - value17 * value21) / value22,
    value24 = (value16 * value21 - value18 * value19) / value22,
    value25 = (value10 - value8 + value23 * value10) / value5,
    value26 = (value14 - value8 + value24 * value14) / value6,
    value27 = (value11 - value9 + value23 * value11) / value5,
    value28 = (value15 - value9 + value24 * value15) / value6,
    value29 = value23 / value5,
    value30 = value24 / value6;
  return (
    "matrix3d(" +
    [value25, value27, 0, value29, value26, value28, 0, value30, 0, 0, 1, 0, value8, value9, 0, 1]
      .map((arg9) => (Math.abs(arg9) < 1e-8 ? 0 : Number(arg9.toFixed(8))))
      .join(",") +
    ")"
  );
}
