import { ShapeUtils, Vector2 } from "../vendor/three/0.182.0/three.module.min.js";
import {
  subtractPolygonLoops,
  validatedUnionPolygonLoops,
  polygonArea,
  modelBounds,
} from "./geometry.js";
export const COURTYARD_DRAWING_TYPES = ["courtyard-area", "courtyard-path", "courtyard-fence"],
  isCourtyardDrawing = (arg1) => COURTYARD_DRAWING_TYPES.includes(arg1?.type),
  courtyardSurfaceRise = (arg2) =>
    arg2?.type === "courtyard-area" && arg2.drawing?.style !== "lawn"
      ? Math.max(0, Number(arg2.height) || 0)
      : 0,
  DRAWING_STYLES = {
    "courtyard-area": {
      lawn: "草坪",
      deck: "木平台",
      paving: "石砖铺装",
    },
    "courtyard-path": {
      stone: "自然汀步",
      square: "方形汀步",
      round: "圆形汀步",
    },
    "courtyard-fence": {
      wall: "实体矮墙",
      slatwall: "矮墙加木栅",
      picket: "竖向木栅",
      horizontal: "横向木栏",
      hedge: "连续绿篱",
    },
  };
const w = (arg3, arg4, arg5) => Math.max(arg4, Math.min(arg5, arg3)),
  b = (arg6, arg7) => (Number.isFinite(Number(arg6)) ? Number(arg6) : arg7);
export function normalizeCourtyardDrawing(arg8) {
  if (!isCourtyardDrawing(arg8)) return {};
  const fn1 = (arg9) =>
    Array.isArray(arg9)
      ? arg9
          .slice(0, 128)
          .filter((arg10) => Number.isFinite(arg10?.x) && Number.isFinite(arg10?.y))
          .map((arg11) => ({
            x: w(arg11.x, -1, 1),
            y: w(arg11.y, -1, 1),
          }))
      : [];
  return {
    drawing: {
      style:
        Object.hasOwn(DRAWING_STYLES[arg8.type], arg8.drawing?.style) ||
        (arg8.type === "courtyard-fence" &&
          ["brick", "metal", "lattice"].includes(arg8.drawing?.style))
          ? arg8.drawing.style
          : Object.keys(DRAWING_STYLES[arg8.type])[0],
      points: fn1(arg8.drawing?.points),
      holes: Array.isArray(arg8.drawing?.holes)
        ? arg8.drawing.holes
            .slice(0, 16)
            .map(fn1)
            .filter((arg12) => arg12.length >= 3)
        : [],
      closed: arg8.type === "courtyard-area" || arg8.drawing?.closed === true,
      curve: arg8.type === "courtyard-path" && arg8.drawing?.curve === true,
      spacing: w(b(arg8.drawing?.spacing, arg8.type === "courtyard-fence" ? 1.8 : 0.8), 0.2, 5),
      hedgeSpacing: w(b(arg8.drawing?.hedgeSpacing, 0.4), 0.2, 5),
      thickness: w(b(arg8.drawing?.thickness, 0.18), 0.06, 0.8),
      stoneWidth: w(b(arg8.drawing?.stoneWidth, 0.6), 0.15, 1.5),
      stoneDepth: w(b(arg8.drawing?.stoneDepth, 0.42), 0.15, 1.5),
      patternWidth: w(
        b(arg8.drawing?.patternWidth, arg8.drawing?.style === "deck" ? 0.16 : 0.6),
        0.08,
        2,
      ),
      patternLength: w(b(arg8.drawing?.patternLength, 0.9), 0.1, 3),
      angle: w(b(arg8.drawing?.angle, 0), -180, 180),
      gateWidth: w(b(arg8.drawing?.gateWidth, 0), 0, 4),
      gateOffset: w(b(arg8.drawing?.gateOffset, 1), 0, 200),
    },
  };
}
export function localPoints(arg13, arg14 = arg13.drawing.points) {
  return arg14.map((arg15) => ({
    x: arg15.x * arg13.width,
    y: arg15.y * arg13.depth,
  }));
}
export function drawingPlanPoints(arg16, arg17, arg18 = arg16.drawing.points) {
  const value1 = ((arg16.rotation || 0) * Math.PI) / 180,
    value2 = Math.cos(value1),
    value3 = Math.sin(value1);
  return localPoints(arg16, arg18).map((arg19) => ({
    x: arg16.x + (arg19.x * value2 - arg19.y * value3) * arg17,
    y: arg16.y + (arg19.x * value3 + arg19.y * value2) * arg17,
  }));
}
export function packDrawingPoints(arg20, arg21, arg22 = []) {
  const value4 = arg20.map((arg23) => arg23.x),
    value5 = arg20.map((arg24) => arg24.y),
    value6 = (Math.min(...value4) + Math.max(...value4)) / 2,
    value7 = (Math.min(...value5) + Math.max(...value5)) / 2,
    value8 = Math.max(0.1, (Math.max(...value4) - Math.min(...value4)) / arg21),
    value9 = Math.max(0.1, (Math.max(...value5) - Math.min(...value5)) / arg21),
    fn2 = (arg25) =>
      arg25.map((arg26) => ({
        x: (arg26.x - value6) / arg21 / value8,
        y: (arg26.y - value7) / arg21 / value9,
      }));
  return {
    x: value6,
    y: value7,
    width: value8,
    depth: value9,
    rotation: 0,
    points: fn2(arg20),
    holes: arg22.map(fn2),
  };
}
export function inside(arg27, arg28) {
  let value10 = false;
  for (let value11 = 0, value12 = arg28.length - 1; value11 < arg28.length; value12 = value11++) {
    const value13 = arg28[value11],
      value14 = arg28[value12];
    value13.y > arg27.y != value14.y > arg27.y &&
      arg27.x <
        ((value14.x - value13.x) * (arg27.y - value13.y)) / (value14.y - value13.y) + value13.x &&
      (value10 = !value10);
  }
  return value10;
}
export function segmentDistance(arg29, arg30, arg31) {
  const value15 = arg31.x - arg30.x,
    value16 = arg31.y - arg30.y,
    value17 = w(
      ((arg29.x - arg30.x) * value15 + (arg29.y - arg30.y) * value16) /
        (value15 * value15 + value16 * value16 || 1),
      0,
      1,
    );
  return Math.hypot(arg29.x - arg30.x - value15 * value17, arg29.y - arg30.y - value16 * value17);
}
function F(arg32, arg33, arg34) {
  return (arg33.x - arg32.x) * (arg34.y - arg32.y) - (arg33.y - arg32.y) * (arg34.x - arg32.x);
}
function W(arg35, arg36, arg37, arg38) {
  const list1 = [
    F(arg35, arg36, arg37),
    F(arg35, arg36, arg38),
    F(arg37, arg38, arg35),
    F(arg37, arg38, arg36),
  ];
  return list1[0] * list1[1] < -1e-10 && list1[2] * list1[3] < -1e-10
    ? true
    : (Math.abs(list1[0]) < 1e-8 && segmentDistance(arg37, arg35, arg36) < 1e-8) ||
        (Math.abs(list1[1]) < 1e-8 && segmentDistance(arg38, arg35, arg36) < 1e-8) ||
        (Math.abs(list1[2]) < 1e-8 && segmentDistance(arg35, arg37, arg38) < 1e-8) ||
        (Math.abs(list1[3]) < 1e-8 && segmentDistance(arg36, arg37, arg38) < 1e-8);
}
export function validLoop(arg39) {
  if (arg39.length < 3 || arg39.length > 128) return false;
  let value18 = 0;
  for (let value19 = 0; value19 < arg39.length; value19++) {
    const value20 = arg39[value19],
      value21 = arg39[(value19 + 1) % arg39.length];
    if (Math.hypot(value21.x - value20.x, value21.y - value20.y) < 0.00001) return false;
    value18 += value20.x * value21.y - value21.x * value20.y;
    for (let value22 = value19 + 2; value22 < arg39.length; value22++)
      if (
        !(value19 === 0 && value22 === arg39.length - 1) &&
        W(value20, value21, arg39[value22], arg39[(value22 + 1) % arg39.length])
      )
        return false;
  }
  return Math.abs(value18) > 0.00001;
}
export function validHole(arg40, arg41, arg42 = []) {
  if (!validLoop(arg40) || !arg40.every((arg43) => inside(arg43, arg41))) return false;
  for (const value23 of [arg41, ...arg42])
    for (let value24 = 0; value24 < arg40.length; value24++)
      for (let value25 = 0; value25 < value23.length; value25++)
        if (
          W(
            arg40[value24],
            arg40[(value24 + 1) % arg40.length],
            value23[value25],
            value23[(value25 + 1) % value23.length],
          )
        )
          return false;
  return !arg42.some((arg44) => inside(arg40[0], arg44) || inside(arg44[0], arg40));
}
export function pathPoints(arg45) {
  const value26 = localPoints(arg45),
    list2 = [];
  if (!arg45.drawing.curve || value26.length < 3)
    return arg45.drawing.closed ? [...value26, value26[0]] : value26;
  for (let value27 = 0; value27 < value26.length - 1; value27++) {
    const value28 = value26[Math.max(value27 - 1, 0)],
      value29 = value26[value27],
      value30 = value26[value27 + 1],
      value31 = value26[Math.min(value27 + 2, value26.length - 1)],
      value32 = w(
        Math.ceil(Math.hypot(value30.x - value29.x, value30.y - value29.y) / 0.12),
        4,
        40,
      );
    for (let value33 = 0; value33 < value32; value33++) {
      const value34 = value33 / value32,
        value35 = value34 * value34,
        value36 = value35 * value34,
        fn3 = (arg46) =>
          0.5 *
          (2 * value29[arg46] +
            (-value28[arg46] + value30[arg46]) * value34 +
            (2 * value28[arg46] - 5 * value29[arg46] + 4 * value30[arg46] - value31[arg46]) *
              value35 +
            (-value28[arg46] + 3 * value29[arg46] - 3 * value30[arg46] + value31[arg46]) * value36);
      list2.push({
        x: fn3("x"),
        y: fn3("y"),
      });
    }
  }
  return (list2.push(value26.at(-1)), list2);
}
export function samplePath(arg47, arg48) {
  const list3 = [];
  let value37 = 0,
    value38 = 0;
  for (let value39 = 1; value39 < arg47.length; value39++) {
    const value40 = arg47[value39 - 1],
      value41 = arg47[value39],
      value42 = Math.hypot(value41.x - value40.x, value41.y - value40.y);
    if (!(value42 < 1e-8)) {
      for (; value38 <= value37 + value42 + 1e-8 && list3.length < 1200;) {
        const value43 = w((value38 - value37) / value42, 0, 1);
        (list3.push({
          x: value40.x + (value41.x - value40.x) * value43,
          y: value40.y + (value41.y - value40.y) * value43,
          angle: Math.atan2(value41.y - value40.y, value41.x - value40.x),
        }),
          (value38 += arg48));
      }
      value37 += value42;
    }
  }
  return list3;
}
export function hitDrawing(arg49, arg50, arg51, arg52, arg53 = []) {
  const value44 = (-(arg49.rotation || 0) * Math.PI) / 180,
    value45 = (arg50.x - arg49.x) / arg51,
    value46 = (arg50.y - arg49.y) / arg51,
    object1 = {
      x: value45 * Math.cos(value44) - value46 * Math.sin(value44),
      y: value45 * Math.sin(value44) + value46 * Math.cos(value44),
    };
  if (arg49.type === "courtyard-area")
    return surfaceRegions(arg49, arg53).some(
      (arg54) =>
        inside(object1, arg54.outline) && !arg54.holes.some((arg55) => inside(object1, arg55)),
    );
  const value47 = pathPoints(arg49),
    value48 = Math.max(
      arg52 / arg51,
      arg49.type === "courtyard-path" ? arg49.drawing.stoneWidth / 2 : arg49.drawing.thickness / 2,
    );
  return value47.some(
    (arg56, arg57) => arg57 > 0 && segmentDistance(object1, value47[arg57 - 1], arg56) <= value48,
  );
}
export function clippedLine(arg58, arg59, arg60) {
  const value49 = arg59.x - arg58.x,
    value50 = arg59.y - arg58.y,
    list4 = [0, 1];
  for (const value51 of arg60)
    for (let value52 = 0; value52 < value51.length; value52++) {
      const value53 = value51[value52],
        value54 = value51[(value52 + 1) % value51.length],
        value55 = value54.x - value53.x,
        value56 = value54.y - value53.y,
        value57 = value49 * value56 - value50 * value55;
      if (Math.abs(value57) < 1e-10) continue;
      const value58 = ((value53.x - arg58.x) * value56 - (value53.y - arg58.y) * value55) / value57,
        value59 = ((value53.x - arg58.x) * value50 - (value53.y - arg58.y) * value49) / value57;
      value58 > 0 && value58 < 1 && value59 >= 0 && value59 <= 1 && list4.push(value58);
    }
  list4.sort((arg61, arg62) => arg61 - arg62);
  const list5 = [];
  for (let value60 = 1; value60 < list4.length; value60++) {
    if (list4[value60] - list4[value60 - 1] < 0.000001) continue;
    const value61 = (list4[value60] + list4[value60 - 1]) / 2,
      object2 = {
        x: arg58.x + value61 * value49,
        y: arg58.y + value61 * value50,
      };
    inside(object2, arg60[0]) &&
      !arg60.slice(1).some((arg63) => inside(object2, arg63)) &&
      list5.push([
        {
          x: arg58.x + list4[value60 - 1] * value49,
          y: arg58.y + list4[value60 - 1] * value50,
        },
        {
          x: arg58.x + list4[value60] * value49,
          y: arg58.y + list4[value60] * value50,
        },
      ]);
  }
  return list5;
}
export function buildingFootprints(arg64, arg65, arg66) {
  const value62 = arg65.map((arg67) =>
    arg67.map((arg68) => ({
      ...arg68,
    })),
  );
  for (const value63 of arg64) {
    const value64 = value63.start,
      value65 = value63.end,
      value66 = Math.hypot(value65.x - value64.x, value65.y - value64.y);
    if (value66 < 0.000001) continue;
    const value67 = (value63.thickness * arg66) / 2,
      object3 = {
        x: (-(value65.y - value64.y) / value66) * value67,
        y: ((value65.x - value64.x) / value66) * value67,
      };
    value62.push([
      {
        x: value64.x + object3.x,
        y: value64.y + object3.y,
      },
      {
        x: value65.x + object3.x,
        y: value65.y + object3.y,
      },
      {
        x: value65.x - object3.x,
        y: value65.y - object3.y,
      },
      {
        x: value64.x - object3.x,
        y: value64.y - object3.y,
      },
    ]);
  }
  return value62;
}
export function localBuildingFootprints(arg69, arg70, arg71) {
  const value68 = (-(arg69.rotation || 0) * Math.PI) / 180,
    value69 = Math.cos(value68),
    value70 = Math.sin(value68);
  return arg70.map((arg72) =>
    arg72.map((arg73) => {
      const value71 = (arg73.x - arg69.x) / arg71,
        value72 = (arg73.y - arg69.y) / arg71;
      return {
        x: value71 * value69 - value72 * value70,
        y: value71 * value70 + value72 * value69,
      };
    }),
  );
}
export function snapToWallFace(arg74, arg75, arg76, arg77) {
  let value73 = null;
  for (const value74 of arg75) {
    const value75 = value74.start,
      value76 = value74.end,
      value77 = value76.x - value75.x,
      value78 = value76.y - value75.y,
      value79 = Math.hypot(value77, value78);
    if (!value79) continue;
    const value80 = w(
        ((arg74.x - value75.x) * value77 + (arg74.y - value75.y) * value78) / (value79 * value79),
        0,
        1,
      ),
      value81 = value77 * (arg74.y - value75.y) - value78 * (arg74.x - value75.x) >= 0 ? 1 : -1,
      value82 = (value74.thickness * arg76) / 2,
      object4 = {
        x: value75.x + value80 * value77 - (value78 / value79) * value82 * value81,
        y: value75.y + value80 * value78 + (value77 / value79) * value82 * value81,
      },
      value83 = Math.hypot(arg74.x - object4.x, arg74.y - object4.y);
    value83 <= arg77 &&
      (!value73 || value83 < value73.distance) &&
      (value73 = {
        point: object4,
        distance: value83,
      });
  }
  return value73;
}
const v = new Map();
export function surfaceRegions(arg78, arg79 = []) {
  const value84 = localPoints(arg78);
  if (!validLoop(value84)) return [];
  const list6 = [];
  for (const value89 of arg78.drawing.holes.map((arg80) => localPoints(arg78, arg80)))
    validHole(value89, value84, list6) && list6.push(value89);
  const value85 = arg79.filter(
    (arg81) =>
      arg81.some(
        (arg82) =>
          arg82.x >= -arg78.width / 2 &&
          arg82.x <= arg78.width / 2 &&
          arg82.y >= -arg78.depth / 2 &&
          arg82.y <= arg78.depth / 2,
      ) ||
      value84.some((arg83) => inside(arg83, arg81)) ||
      arg81.some((arg84, arg85) =>
        value84.some((arg86, arg87) =>
          W(arg84, arg81[(arg85 + 1) % arg81.length], arg86, value84[(arg87 + 1) % value84.length]),
        ),
      ),
  );
  if (!value85.length)
    return [
      {
        outline: value84,
        holes: list6,
      },
    ];
  const value86 = JSON.stringify([value84, list6, value85]);
  if (v.has(value86)) return v.get(value86);
  const value87 = subtractPolygonLoops([value84], [...list6, ...value85]),
    value88 = value87
      .filter((arg88) => polygonArea(arg88) > 0)
      .map((arg89) => ({
        outline: arg89,
        holes: [],
      }));
  for (const value90 of value87.filter((arg90) => polygonArea(arg90) < 0)) {
    const value91 = value88
      .filter((arg91) => inside(value90[0], arg91.outline))
      .sort(
        (arg92, arg93) =>
          Math.abs(polygonArea(arg92.outline)) - Math.abs(polygonArea(arg93.outline)),
      )[0];
    value91 && value91.holes.push(value90);
  }
  return (v.size > 32 && v.delete(v.keys().next().value), v.set(value86, value88), value88);
}
export function courtyardBoundaryPoints(arg94, arg95) {
  const value92 = (arg94.walls || [])
    .flatMap((arg96) => [arg96.start, arg96.end])
    .filter((arg97) => Number.isFinite(arg97?.x) && Number.isFinite(arg97?.y));
  for (const value93 of arg94.items || [])
    isCourtyardDrawing(value93) && value92.push(...drawingPlanPoints(value93, arg95));
  return value92;
}
export function courtyardFootprintLoops(arg98, arg99, arg100, arg101, arg102 = []) {
  const value94 = arg98.map((arg103) =>
    arg103.map((arg104) => ({
      x: arg104.x,
      y: arg104.z,
    })),
  );
  let value95 = false;
  for (const value96 of arg99) {
    if (value96.type !== "courtyard-area" && value96.type !== "courtyard-fence") continue;
    const value97 = drawingPlanPoints(value96, arg100)
      .map(arg101)
      .map((arg105) => ({
        x: arg105.x,
        y: arg105.z,
      }));
    if (value96.type === "courtyard-fence") {
      const value98 = value96.drawing.thickness * (value96.drawing.style === "hedge" ? 1.5 : 0.6),
        value99 = value96.drawing.closed ? [...value97, value97[0]] : value97;
      for (let value100 = 1; value100 < value99.length; value100++) {
        const value101 = value99[value100 - 1],
          value102 = value99[value100],
          value103 = Math.hypot(value102.x - value101.x, value102.y - value101.y);
        if (value103 < 1e-7) continue;
        const value104 = (value102.x - value101.x) / value103,
          value105 = (value102.y - value101.y) / value103;
        (value94.push([
          {
            x: value101.x - value104 * value98 - value105 * value98,
            y: value101.y - value105 * value98 + value104 * value98,
          },
          {
            x: value102.x + value104 * value98 - value105 * value98,
            y: value102.y + value105 * value98 + value104 * value98,
          },
          {
            x: value102.x + value104 * value98 + value105 * value98,
            y: value102.y + value105 * value98 - value104 * value98,
          },
          {
            x: value101.x - value104 * value98 + value105 * value98,
            y: value101.y - value105 * value98 - value104 * value98,
          },
        ]),
          (value95 = true));
      }
      if (!value96.drawing.closed) continue;
    }
    if (!validLoop(value97)) continue;
    const list8 = [];
    if (value96.type === "courtyard-area")
      for (const value106 of value96.drawing.holes || []) {
        const value107 = drawingPlanPoints(value96, arg100, value106)
          .map(arg101)
          .map((arg106) => ({
            x: arg106.x,
            y: arg106.z,
          }));
        validHole(value107, value97, list8) && list8.push(value107);
      }
    if (list8.length) {
      const value108 = [value97, ...list8].map((arg107) =>
          arg107.map((arg108) => new Vector2(arg108.x, arg108.y)),
        ),
        value109 = value108.flat();
      value94.push(
        ...ShapeUtils.triangulateShape(value108[0], value108.slice(1)).map((arg109) =>
          arg109.map((arg110) => value109[arg110]),
        ),
      );
    } else value94.push(value97);
    value95 = true;
  }
  if (!value95) return value94;
  const list7 = [...value94];
  if (arg98.length) {
    for (const value110 of buildingFootprints(arg102, [], arg100))
      list7.push(
        value110.map(arg101).map((arg111) => ({
          x: arg111.x,
          y: arg111.z,
        })),
      );
  }
  for (const value111 of [list7, value94])
    for (const value112 of [1e-7, 0.00001]) {
      const value113 = validatedUnionPolygonLoops(value111, value112);
      if (value113.length) return value113;
    }
  return [];
}
export function courtyardPerimeterLoops(arg112, arg113, arg114, arg115, arg116 = []) {
  return arg113.some(
    (arg117) => arg117.type === "courtyard-area" || arg117.type === "courtyard-fence",
  )
    ? courtyardFootprintLoops(arg112, arg113, arg114, arg115, arg116)
        .filter((arg118) => polygonArea(arg118) > 0)
        .map((arg119) =>
          arg119.map((arg120) => ({
            x: arg120.x,
            z: arg120.y,
          })),
        )
    : arg112;
}
export function outerPerimeterLine(arg121, arg122 = 0.025) {
  const value114 = polygonArea(arg121) >= 0 ? 1 : -1;
  return arg121.map((arg123, arg124) => {
    const value115 = arg121[(arg124 + arg121.length - 1) % arg121.length],
      value116 = arg121[(arg124 + 1) % arg121.length],
      value117 = Math.hypot(arg123.x - value115.x, arg123.y - value115.y) || 1,
      value118 = Math.hypot(value116.x - arg123.x, value116.y - arg123.y) || 1,
      object5 = {
        x: ((arg123.y - value115.y) / value117) * value114,
        y: (-(arg123.x - value115.x) / value117) * value114,
      },
      object6 = {
        x: ((value116.y - arg123.y) / value118) * value114,
        y: (-(value116.x - arg123.x) / value118) * value114,
      },
      value119 = 1 + object5.x * object6.x + object5.y * object6.y;
    let value120 =
        value119 > 0.000001 ? ((object5.x + object6.x) * arg122) / value119 : object6.x * arg122,
      value121 =
        value119 > 0.000001 ? ((object5.y + object6.y) * arg122) / value119 : object6.y * arg122;
    const value122 = Math.hypot(value120, value121);
    return (
      value122 > arg122 * 3 &&
        ((value120 *= (arg122 * 3) / value122), (value121 *= (arg122 * 3) / value122)),
      {
        x: arg123.x + value120,
        z: arg123.y + value121,
      }
    );
  });
}
export function courtyardContentBounds(arg125, arg126) {
  const value123 = courtyardBoundaryPoints(arg125, arg126);
  if (!value123.length) return modelBounds(arg125);
  const value124 = Math.min(...value123.map((arg127) => arg127.x)),
    value125 = Math.min(...value123.map((arg128) => arg128.y)),
    value126 = Math.max(...value123.map((arg129) => arg129.x)),
    value127 = Math.max(...value123.map((arg130) => arg130.y));
  return {
    minX: value124,
    minY: value125,
    maxX: value126,
    maxY: value127,
    width: Math.max(1, value126 - value124),
    height: Math.max(1, value127 - value125),
  };
}
export function sceneContentBounds(arg131) {
  return (arg131.items || []).some(isCourtyardDrawing)
    ? courtyardContentBounds(arg131, arg131.calibration?.pixelsPerMeter || 100)
    : arg131.walls?.length
      ? modelBounds({
          background: null,
          walls: arg131.walls,
          items: [],
        })
      : arg131.items?.length
        ? modelBounds({
            background: null,
            walls: [],
            items: arg131.items,
          })
        : modelBounds(arg131);
}
export function sceneModelOrigin(arg132, arg133 = {}) {
  if (!arg132.walls?.length && (arg132.items || []).some(isCourtyardDrawing))
    return {
      x: b(arg133?.originX, 0),
      y: b(arg133?.originY, 0),
    };
  const value128 = arg132.walls?.length
    ? modelBounds({
        background: null,
        walls: arg132.walls,
        items: [],
      })
    : sceneContentBounds(arg132);
  return {
    x: (value128.minX + value128.maxX) / 2,
    y: (value128.minY + value128.maxY) / 2,
  };
}
export const isCourtyardGate = (arg134) =>
  ["garden-gate", "garden-gate-solid", "garden-gate-arch"].includes(arg134?.type);
export function anchorGate(arg135, arg136, arg137, arg138) {
  if (!isCourtyardGate(arg135)) return false;
  let value129 = null;
  for (const value130 of arg136.filter((arg139) => arg139.type === "courtyard-fence")) {
    const value131 = drawingPlanPoints(value130, arg137);
    value130.drawing.closed && value131.push(value131[0]);
    let value132 = 0;
    const value133 = value131
      .slice(1)
      .reduce(
        (arg140, arg141, arg142) =>
          arg140 + Math.hypot(arg141.x - value131[arg142].x, arg141.y - value131[arg142].y),
        0,
      );
    for (let value134 = 1; value134 < value131.length; value134++) {
      const value135 = value131[value134 - 1],
        value136 = value131[value134],
        value137 = value136.x - value135.x,
        value138 = value136.y - value135.y,
        value139 = Math.hypot(value137, value138);
      if (value139 < arg135.width * arg137) {
        value132 += value139;
        continue;
      }
      const value140 = w(
          ((arg135.x - value135.x) * value137 + (arg135.y - value135.y) * value138) /
            (value139 * value139),
          (arg135.width * arg137) / 2 / value139,
          1 - (arg135.width * arg137) / 2 / value139,
        ),
        object7 = {
          x: value135.x + value140 * value137,
          y: value135.y + value140 * value138,
        },
        value141 = Math.hypot(arg135.x - object7.x, arg135.y - object7.y);
      (value141 <= arg138 &&
        (!value129 || value141 < value129.distance) &&
        (value129 = {
          fenceId: value130.id,
          fraction: (value132 + value140 * value139) / value133,
          distance: value141,
        }),
        (value132 += value139));
    }
  }
  return value129
    ? ((arg135.courtyardGate = {
        fenceId: value129.fenceId,
        fraction: value129.fraction,
      }),
      syncCourtyardGates(
        [
          ...arg136.filter((arg143) => arg143 !== arg135 && arg143.type === "courtyard-fence"),
          arg135,
        ],
        arg137,
      ),
      true)
    : (delete arg135.courtyardGate, false);
}
export function syncCourtyardGates(arg144, arg145) {
  for (const value142 of arg144.filter(isCourtyardGate)) {
    if (!value142.courtyardGate) continue;
    const value143 = arg144.find(
      (arg146) => arg146.id === value142.courtyardGate.fenceId && arg146.type === "courtyard-fence",
    );
    if (!value143) {
      delete value142.courtyardGate;
      continue;
    }
    const value144 = drawingPlanPoints(value143, arg145);
    value143.drawing.closed && value144.push(value144[0]);
    const value145 = value144
      .slice(1)
      .map((arg147, arg148) =>
        Math.hypot(arg147.x - value144[arg148].x, arg147.y - value144[arg148].y),
      );
    let value146 =
      value145.reduce((arg149, arg150) => arg149 + arg150, 0) * value142.courtyardGate.fraction;
    for (let value147 = 0; value147 < value145.length; value147++) {
      if (value146 > value145[value147] && value147 < value145.length - 1) {
        value146 -= value145[value147];
        continue;
      }
      const value148 = value144[value147],
        value149 = value144[value147 + 1],
        value150 = w(value146 / (value145[value147] || 1), 0, 1);
      ((value142.x = value148.x + (value149.x - value148.x) * value150),
        (value142.y = value148.y + (value149.y - value148.y) * value150),
        (value142.rotation =
          (Math.atan2(value149.y - value148.y, value149.x - value148.x) * 180) / Math.PI),
        (value142.elevation = value143.elevation || 0));
      break;
    }
  }
}
export function fenceOpenings(arg151, arg152) {
  const value151 = pathPoints(arg151),
    value152 = value151
      .slice(1)
      .reduce(
        (arg153, arg154, arg155) =>
          arg153 + Math.hypot(arg154.x - value151[arg155].x, arg154.y - value151[arg155].y),
        0,
      );
  return arg152
    .filter((arg156) => isCourtyardGate(arg156) && arg156.courtyardGate?.fenceId === arg151.id)
    .map((arg157) => ({
      offset: Math.max(0, value152 * arg157.courtyardGate.fraction - arg157.width / 2),
      width: arg157.width,
    }));
}
export function surfaceExclusions(arg158, arg159, arg160, arg161) {
  const value153 = localBuildingFootprints(arg158, arg160, arg161),
    value154 = arg159.findIndex((arg162) => arg162.id === arg158.id);
  for (const value155 of arg159.slice(value154 + 1)) {
    if (
      value155.type !== "courtyard-area" ||
      Math.abs(
        (value155.elevation || 0) +
          courtyardSurfaceRise(value155) -
          (arg158.elevation || 0) -
          courtyardSurfaceRise(arg158),
      ) > 0.003
    )
      continue;
    const value156 = drawingPlanPoints(value155, arg161),
      value157 = value155.drawing.holes.map((arg163) =>
        drawingPlanPoints(value155, arg161, arg163),
      );
    if (!validLoop(value156)) continue;
    const value158 = value157.filter((arg164, arg165) =>
        validHole(
          arg164,
          value156,
          value157.filter((arg166, arg167) => arg165 !== arg167),
        ),
      ),
      value159 = [value156, ...value158].map((arg168) =>
        arg168.map((arg169) => new Vector2(arg169.x, arg169.y)),
      ),
      value160 = value159.flat(),
      value161 = ShapeUtils.triangulateShape(value159[0], value159.slice(1)).map((arg170) =>
        arg170.map((arg171) => value160[arg171]),
      );
    value153.push(...localBuildingFootprints(arg158, value161, arg161));
  }
  return value153;
}
export function fenceSegments(arg172, arg173 = []) {
  const value162 = pathPoints(arg172),
    list9 = [
      ...arg173,
      ...(arg172.drawing.gateWidth > 0
        ? [
            {
              offset: arg172.drawing.gateOffset,
              width: arg172.drawing.gateWidth,
            },
          ]
        : []),
    ],
    list10 = [];
  let value163 = 0;
  for (let value164 = 1; value164 < value162.length; value164++) {
    const value165 = value162[value164 - 1],
      value166 = value162[value164],
      value167 = Math.hypot(value166.x - value165.x, value166.y - value165.y);
    if (value167 < 1e-8) continue;
    const list11 = [0, value167];
    for (const value168 of list9)
      for (const value169 of [value168.offset, value168.offset + value168.width])
        value169 > value163 && value169 < value163 + value167 && list11.push(value169 - value163);
    list11.sort((arg174, arg175) => arg174 - arg175);
    const fn4 = (arg176) => ({
      x: value165.x + ((value166.x - value165.x) * arg176) / value167,
      y: value165.y + ((value166.y - value165.y) * arg176) / value167,
    });
    for (let value170 = 1; value170 < list11.length; value170++) {
      const value171 = value163 + (list11[value170 - 1] + list11[value170]) / 2;
      list9.some((arg177) => value171 > arg177.offset && value171 < arg177.offset + arg177.width) ||
        list10.push([fn4(list11[value170 - 1]), fn4(list11[value170])]);
    }
    value163 += value167;
  }
  return list10;
}
export function remapCourtyardAttachments(arg178, arg179) {
  const map1 = new Map(arg178.map((arg180, arg181) => [arg180.id, arg179[arg181].id]));
  for (const value172 of arg179) {
    if (!value172.courtyardGate) continue;
    const value173 = map1.get(value172.courtyardGate.fenceId);
    value173
      ? (value172.courtyardGate = {
          ...value172.courtyardGate,
          fenceId: value173,
        })
      : delete value172.courtyardGate;
  }
}
export function hedgeSamples(arg182, arg183 = []) {
  const list12 = [],
    set1 = new Set(),
    value174 = w(b(arg182.drawing.hedgeSpacing, 0.4), 0.2, 5);
  for (const [value175, value176] of fenceSegments(arg182, arg183)) {
    const value177 = Math.hypot(value176.x - value175.x, value176.y - value175.y),
      value178 = Math.min(arg182.drawing.thickness * 1.5, value177 / 2),
      fn5 = (arg184) => ({
        x: value175.x + ((value176.x - value175.x) * arg184) / value177,
        y: value175.y + ((value176.y - value175.y) * arg184) / value177,
      }),
      value179 =
        value177 <= value178 * 2 + 0.000001
          ? [fn5(value177 / 2)]
          : samplePath([fn5(value178), fn5(value177 - value178)], value174);
    for (const value180 of value179) {
      const value181 = value180.x.toFixed(4) + ":" + value180.y.toFixed(4);
      if (!set1.has(value181) && (set1.add(value181), list12.push(value180), list12.length >= 1200))
        return list12;
    }
  }
  return list12;
}
export function snapCourtyardPoint(
  arg185,
  {
    base: arg186,
    walls: arg189 = [],
    items: arg190 = [],
    draft: arg191 = [],
    ppm: arg192 = 100,
    tolerance: arg193 = 12,
    enabled: arg194 = true,
    anchor: arg187,
    forceAxis: arg195 = false,
    excludeId: arg188,
    settings: arg196 = {},
  },
) {
  if (!arg194) return arg186;
  const value182 = arg190
      .filter(isCourtyardDrawing)
      .filter((arg197) => arg197.id !== arg188)
      .flatMap((arg198) => [
        {
          points: drawingPlanPoints(arg198, arg192),
          closed: arg198.type === "courtyard-area" || arg198.drawing.closed,
        },
        ...arg198.drawing.holes.map((arg199) => ({
          points: drawingPlanPoints(arg198, arg192, arg199),
          closed: true,
        })),
      ]),
    value183 = buildingFootprints(arg189, [], arg192),
    fn6 = (arg200) =>
      !arg195 ||
      !arg187 ||
      (Math.abs(arg186.point.x - arg187.x) < 0.000001
        ? Math.abs(arg200.x - arg187.x) < 0.000001
        : Math.abs(arg200.y - arg187.y) < 0.000001),
    fn7 = (arg201) =>
      arg201
        .filter((arg202) => fn6(arg202.point))
        .map((arg203) => ({
          ...arg203,
          distance: Math.hypot(arg203.point.x - arg185.x, arg203.point.y - arg185.y),
        }))
        .filter((arg204) => arg204.distance <= arg193)
        .sort((arg205, arg206) => arg205.distance - arg206.distance)[0];
  if (arg196.snapEndpoints !== false) {
    const list13 = [
        ...arg191.map((arg207, arg208) => ({
          point: arg207,
          kind: "endpoint",
          label: arg208 === 0 && arg191.length >= 3 ? "点击闭合地面" : "绘制节点",
        })),
        ...value182.flatMap((arg209) =>
          arg209.points.map((arg210) => ({
            point: arg210,
            kind: "endpoint",
            label: "庭院节点",
          })),
        ),
        ...value183.flatMap((arg211) =>
          arg211.map((arg212) => ({
            point: arg212,
            kind: "endpoint",
            label: "墙面端点",
          })),
        ),
      ],
      value184 = fn7(list13);
    if (value184) return value184;
  }
  if (arg196.snapSegments !== false) {
    const list14 = [];
    for (const value186 of [
      ...value182,
      ...value183.map((arg213) => ({
        points: arg213,
        closed: true,
        wall: true,
      })),
    ])
      for (
        let value187 = 0;
        value187 < value186.points.length - (value186.closed ? 0 : 1);
        value187++
      ) {
        const value188 = value186.points[value187],
          value189 = value186.points[(value187 + 1) % value186.points.length],
          value190 = value189.x - value188.x,
          value191 = value189.y - value188.y,
          value192 = value190 * value190 + value191 * value191;
        if (!value192) continue;
        let value193 = w(
          ((arg185.x - value188.x) * value190 + (arg185.y - value188.y) * value191) / value192,
          0,
          1,
        );
        if (arg195 && arg187) {
          const value194 = Math.abs(arg186.point.x - arg187.x) < 0.000001,
            value195 = value194 ? value190 : value191;
          if (
            Math.abs(value195) > 1e-8 &&
            ((value193 =
              ((value194 ? arg187.x : arg187.y) - (value194 ? value188.x : value188.y)) / value195),
            value193 < 0 || value193 > 1)
          )
            continue;
        }
        list14.push({
          point: {
            x: value188.x + value193 * value190,
            y: value188.y + value193 * value191,
          },
          kind: "segment",
          label: value186.wall ? "墙面" : "庭院边线",
        });
      }
    const value185 = fn7(list14);
    if (value185) return value185;
  }
  return arg186;
}
export function trimCourtyardArea(arg214, arg215, arg216, arg217, arg218) {
  const value196 = drawingPlanPoints(arg214, arg218),
    value197 = arg214.drawing.holes.map((arg219) => drawingPlanPoints(arg214, arg218, arg219)),
    value198 = arg216.x - arg215.x,
    value199 = arg216.y - arg215.y,
    value200 = Math.hypot(value198, value199);
  if (value200 < arg218 * 0.01) return null;
  const value201 = Math.sign(value198 * (arg217.y - arg215.y) - value199 * (arg217.x - arg215.x));
  if (!value201) return null;
  const value202 =
      Math.max(
        ...value196.map((arg220) => Math.hypot(arg220.x - arg215.x, arg220.y - arg215.y)),
        value200,
        arg218,
      ) * 4,
    object8 = {
      x: (value198 / value200) * value202,
      y: (value199 / value200) * value202,
    },
    object9 = {
      x: (-value199 / value200) * value202 * value201,
      y: (value198 / value200) * value202 * value201,
    },
    list15 = [
      {
        x: arg215.x - object8.x,
        y: arg215.y - object8.y,
      },
      {
        x: arg215.x + object8.x,
        y: arg215.y + object8.y,
      },
      {
        x: arg215.x + object8.x + object9.x,
        y: arg215.y + object8.y + object9.y,
      },
      {
        x: arg215.x - object8.x + object9.x,
        y: arg215.y - object8.y + object9.y,
      },
    ],
    value203 = subtractPolygonLoops([value196], [...value197, list15]),
    value204 = value203
      .filter((arg221) => polygonArea(arg221) > 0)
      .map((arg222) => ({
        outline: arg222,
        holes: [],
      }));
  for (const value205 of value203.filter((arg223) => polygonArea(arg223) < 0)) {
    const value206 = value204
      .filter((arg224) => inside(value205[0], arg224.outline))
      .sort(
        (arg225, arg226) =>
          Math.abs(polygonArea(arg225.outline)) - Math.abs(polygonArea(arg226.outline)),
      )[0];
    value206 && value206.holes.push(value205);
  }
  return value204;
}
