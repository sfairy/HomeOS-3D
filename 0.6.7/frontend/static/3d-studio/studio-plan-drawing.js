export function drawTrackedText(arg1, arg2, arg3, arg4, arg5, arg6) {
  const list1 = [...String(arg2 || "")];
  if (!list1.length) return 0;
  const value1 = list1.map((arg7) => arg1.measureText(arg7).width),
    value2 = value1.reduce((arg8, arg9) => arg8 + arg9, 0) + Math.max(list1.length - 1, 0) * arg5,
    value3 = value2 > 0 ? Math.min(1, arg6 / value2) : 1;
  (arg1.save(),
    arg1.translate(arg3, arg4),
    arg1.scale(value3, 1),
    (arg1.textAlign = "left"),
    (arg1.textBaseline = "middle"));
  let value4 = 0;
  return (
    list1.forEach((arg10, arg11) => {
      (arg1.fillText(arg10, value4, 0),
        (value4 += value1[arg11] + (arg11 < list1.length - 1 ? arg5 : 0)));
    }),
    arg1.restore(),
    value2 * value3
  );
}
export function createPlanDrawingTools({
  context: arg12,
  planToScreen: arg13,
  screenToPlan: arg14,
  pixelsPerMeter: arg15,
  getCanvasSize: arg16,
  getViewZoom: arg17,
}) {
  function fn1() {
    const value5 = arg15();
    if (!value5) return;
    const { width: value6, height: value7 } = arg16(),
      value8 = arg17();
    let value9 = value5 * 0.5;
    for (; value9 * value8 < 18;) value9 *= 2;
    for (; value9 * value8 > 100;) value9 /= 2;
    const value10 = [
        {
          x: 0,
          y: 0,
        },
        {
          x: value6,
          y: 0,
        },
        {
          x: value6,
          y: value7,
        },
        {
          x: 0,
          y: value7,
        },
      ].map(arg14),
      value11 = Math.min(...value10.map((arg18) => arg18.x)),
      value12 = Math.max(...value10.map((arg19) => arg19.x)),
      value13 = Math.min(...value10.map((arg20) => arg20.y)),
      value14 = Math.max(...value10.map((arg21) => arg21.y));
    (arg12.save(), (arg12.lineWidth = 1));
    for (
      let value15 = Math.floor(value11 / value9) * value9;
      value15 <= value12;
      value15 += value9
    ) {
      const value16 = arg13({
          x: value15,
          y: value13,
        }),
        value17 = arg13({
          x: value15,
          y: value14,
        }),
        value18 = Math.round((value15 / value5) * 2);
      ((arg12.strokeStyle =
        value18 % 2 === 0 ? "rgba(91, 119, 139, .13)" : "rgba(91, 119, 139, .065)"),
        arg12.beginPath(),
        arg12.moveTo(value16.x, value16.y),
        arg12.lineTo(value17.x, value17.y),
        arg12.stroke());
    }
    for (
      let value19 = Math.floor(value13 / value9) * value9;
      value19 <= value14;
      value19 += value9
    ) {
      const value20 = arg13({
          x: value11,
          y: value19,
        }),
        value21 = arg13({
          x: value12,
          y: value19,
        }),
        value22 = Math.round((value19 / value5) * 2);
      ((arg12.strokeStyle =
        value22 % 2 === 0 ? "rgba(91, 119, 139, .13)" : "rgba(91, 119, 139, .065)"),
        arg12.beginPath(),
        arg12.moveTo(value20.x, value20.y),
        arg12.lineTo(value21.x, value21.y),
        arg12.stroke());
    }
    arg12.restore();
  }
  function fn2(arg22, arg23, arg24 = {}) {
    const value23 = arg13(arg22),
      value24 = arg13(arg23);
    (arg12.save(),
      (arg12.strokeStyle = arg24.color || "#fff"),
      (arg12.lineWidth = arg24.width || 1),
      (arg12.lineCap = arg24.cap || "round"),
      arg24.dash && arg12.setLineDash(arg24.dash),
      arg12.beginPath(),
      arg12.moveTo(value23.x, value23.y),
      arg12.lineTo(value24.x, value24.y),
      arg12.stroke(),
      arg12.restore());
  }
  function fn3(arg25, arg26, arg27 = 4) {
    const value25 = arg13(arg25);
    (arg12.save(),
      (arg12.fillStyle = "#0e151b"),
      (arg12.strokeStyle = arg26),
      (arg12.lineWidth = 2),
      arg12.beginPath(),
      arg12.arc(value25.x, value25.y, arg27, 0, Math.PI * 2),
      arg12.fill(),
      arg12.stroke(),
      arg12.restore());
  }
  function fn4(arg28) {
    const value26 = arg13(arg28);
    (arg12.save(),
      (arg12.globalAlpha = 1),
      (arg12.shadowColor = "rgba(255, 84, 76, .75)"),
      (arg12.shadowBlur = 12),
      (arg12.fillStyle = "rgba(255, 84, 76, .18)"),
      (arg12.strokeStyle = "#ff6258"),
      (arg12.lineWidth = 2.5),
      arg12.beginPath(),
      arg12.arc(value26.x, value26.y, 9, 0, Math.PI * 2),
      arg12.fill(),
      arg12.stroke(),
      (arg12.shadowBlur = 0),
      (arg12.fillStyle = "#ff6258"),
      arg12.beginPath(),
      arg12.arc(value26.x, value26.y, 3.2, 0, Math.PI * 2),
      arg12.fill(),
      arg12.restore());
  }
  function fn5(arg29, arg30, arg31 = "#dce3e8") {
    if (!arg30) return;
    const value27 = arg13(arg29);
    (arg12.save(),
      (arg12.font = "600 10px ui-monospace, monospace"),
      (arg12.textAlign = "center"),
      (arg12.textBaseline = "middle"));
    const value28 = arg12.measureText(arg30).width + 12;
    ((arg12.fillStyle = "rgba(8, 13, 18, .88)"),
      (arg12.strokeStyle = "rgba(255, 255, 255, .11)"),
      (arg12.lineWidth = 1),
      arg12.beginPath(),
      arg12.roundRect(value27.x - value28 / 2, value27.y - 25, value28, 18, 5),
      arg12.fill(),
      arg12.stroke(),
      (arg12.fillStyle = arg31),
      arg12.fillText(arg30, value27.x, value27.y - 16),
      arg12.restore());
  }
  return {
    drawMetricGrid: fn1,
    drawLine: fn2,
    drawPoint: fn3,
    drawOpenEndpointWarning: fn4,
    drawFloatingLabel: fn5,
  };
}
