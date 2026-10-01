import { courtyardPalette } from "./courtyard-models.js";
import { decorateWarmFloor } from "./studio-scene-style.js";
import {
  localPoints,
  pathPoints,
  samplePath,
  clippedLine,
  validLoop,
  validHole,
  surfaceRegions,
  hedgeSamples,
  courtyardSurfaceRise,
} from "./courtyard-drawing.js?v=20260927-drawing-v7";
export function createCourtyardDrawingModel(arg1, arg2, arg3, arg4, arg5 = []) {
  const value1 = new arg1.Group(),
    value2 = arg3.drawing,
    value3 = arg4.warmWood ? "warm" : "default",
    value4 =
      arg3.type === "courtyard-area"
        ? "garden-" + value2.style
        : arg3.type === "courtyard-path"
          ? "garden-stepping"
          : value2.style === "hedge"
            ? "garden-hedge"
            : ["wall", "brick"].includes(value2.style)
              ? "garden-low-wall"
              : value2.style === "metal"
                ? "garden-gate"
                : "garden-fence",
    value5 = courtyardPalette(value4, value3),
    map1 = new Map();
  function fn1(arg6, arg7) {
    (map1.has(arg7) || map1.set(arg7, []),
      map1.get(arg7).push(arg6.index ? arg6.toNonIndexed() : arg6),
      arg6.index && arg6.dispose());
  }
  function fn2(arg8, arg9, arg10, arg11, arg12, arg13, arg14, arg15 = 0) {
    if (arg11 <= 0 || arg12 <= 0 || arg13 <= 0) return;
    const value6 = new arg1.BoxGeometry(arg11, arg12, arg13);
    (value6.rotateY(-arg15), value6.translate(arg8, arg9, arg10), fn1(value6, arg14));
  }
  function fn3(arg16, arg17, arg18, arg19, arg20) {
    const value7 = Math.hypot(arg17.x - arg16.x, arg17.y - arg16.y);
    fn2(
      (arg16.x + arg17.x) / 2,
      arg18,
      (arg16.y + arg17.y) / 2,
      value7,
      arg19,
      arg19,
      arg20,
      Math.atan2(arg17.y - arg16.y, arg17.x - arg16.x),
    );
  }
  function fn4(arg21, arg22 = []) {
    const value8 = new arg1.Shape(arg21.map((arg23) => new arg1.Vector2(arg23.x, -arg23.y)));
    for (const value9 of arg22)
      value8.holes.push(new arg1.Path(value9.map((arg24) => new arg1.Vector2(arg24.x, -arg24.y))));
    return value8;
  }
  function fn5(arg25, arg26, arg27, arg28, arg29 = 0) {
    const value10 = new arg1.ExtrudeGeometry(fn4(arg25, arg26), {
      depth: arg27,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1,
    });
    (value10.rotateX(-Math.PI / 2), value10.translate(0, arg29, 0), fn1(value10, arg28));
  }
  if (arg3.type === "courtyard-area") {
    const value11 = localPoints(arg3);
    if (!validLoop(value11)) return value1;
    const list1 = [];
    for (const value15 of value2.holes.map((arg30) => localPoints(arg3, arg30)))
      validHole(value15, value11, list1) && list1.push(value15);
    const value12 =
        value2.style === "lawn"
          ? value5.leaf
          : value2.style === "deck"
            ? value5.base
            : value5.light,
      value13 = surfaceRegions(arg3, arg5),
      value14 = -0.006 + courtyardSurfaceRise(arg3);
    for (const value16 of value13) {
      const value17 = new arg1.ShapeGeometry(fn4(value16.outline, value16.holes));
      (value17.rotateX(-Math.PI / 2), value17.translate(0, value14, 0), fn1(value17, value12));
      const value18 = Math.max(0, Number(arg3.elevation) || 0) + courtyardSurfaceRise(arg3);
      if (value18 > 0) {
        const value19 = new arg1.ExtrudeGeometry(fn4(value16.outline, value16.holes), {
            depth: value18,
            bevelEnabled: false,
            steps: 1,
          }),
          value20 = value19.groups.find((arg31) => arg31.materialIndex === 1);
        if (value20) {
          const value21 = value19.getAttribute("position"),
            value22 = new arg1.BufferGeometry();
          (value22.setAttribute(
            "position",
            new arg1.Float32BufferAttribute(
              value21.array.slice(value20.start * 3, (value20.start + value20.count) * 3),
              3,
            ),
          ),
            value22.computeVertexNormals(),
            value22.rotateX(-Math.PI / 2),
            value22.translate(0, value14 - value18, 0),
            fn1(value22, arg4.floor ?? value5.light));
        }
        value19.dispose();
      }
    }
    if (value2.style !== "lawn") {
      const value23 = (value2.angle * Math.PI) / 180,
        value24 = Math.cos(value23),
        value25 = Math.sin(value23),
        value26 = Math.hypot(arg3.width, arg3.depth),
        list2 = [],
        fn6 = (arg32) => ({
          x: arg32.x * value24 - arg32.y * value25,
          y: arg32.x * value25 + arg32.y * value24,
        }),
        fn7 = (arg33, arg34) => {
          for (const [value31, value32] of value13.flatMap((arg35) =>
            clippedLine(fn6(arg33), fn6(arg34), [arg35.outline, ...arg35.holes]),
          ))
            list2.push(
              value31.x,
              value14 + 0.002,
              value31.y,
              value32.x,
              value14 + 0.002,
              value32.y,
            );
        },
        value27 = Math.max(value2.patternWidth, value26 / 180),
        value28 = Math.max(value2.patternLength, value26 / 100);
      for (let value33 = Math.ceil(-value26 / value27); value33 <= value26 / value27; value33++) {
        const value34 = value33 * value27;
        if (
          (fn7(
            {
              x: -value26,
              y: value34,
            },
            {
              x: value26,
              y: value34,
            },
          ),
          value2.style === "paving")
        ) {
          for (
            let value35 = -value26 + ((value33 % 2) * value28) / 2;
            value35 <= value26;
            value35 += value28
          )
            fn7(
              {
                x: value35,
                y: value34,
              },
              {
                x: value35,
                y: value34 + value27,
              },
            );
        }
      }
      const value29 = new arg1.BufferGeometry();
      value29.setAttribute("position", new arg1.Float32BufferAttribute(list2, 3));
      const value30 = new arg1.LineSegments(
        value29,
        new arg1.LineBasicMaterial({
          color: value2.style === "deck" ? value5.dark : value5.base,
        }),
      );
      value1.add(value30);
    }
  } else {
    if (arg3.type === "courtyard-path") {
      const value36 = samplePath(
        pathPoints(arg3),
        Math.max(value2.spacing, value2.stoneDepth + 0.05),
      );
      for (const value37 of value36) {
        let value38;
        value2.style === "square"
          ? (value38 = [
              [-0.5, -0.5],
              [0.5, -0.5],
              [0.5, 0.5],
              [-0.5, 0.5],
            ])
          : (value38 = Array.from(
              {
                length: value2.style === "round" ? 12 : 7,
              },
              (arg36, arg37) => {
                const value42 = (arg37 * Math.PI * 2) / (value2.style === "round" ? 12 : 7),
                  value43 = value2.style === "round" ? 1 : [1, 0.88, 1, 0.9, 0.94, 1, 0.85][arg37];
                return [Math.cos(value42) * 0.5 * value43, Math.sin(value42) * 0.5 * value43];
              },
            ));
        const value39 = value37.angle - Math.PI / 2,
          value40 = Math.cos(value39),
          value41 = Math.sin(value39);
        fn5(
          value38.map(([arg38, arg39]) => ({
            x:
              value37.x + arg38 * value2.stoneWidth * value40 - arg39 * value2.stoneDepth * value41,
            y:
              value37.y + arg38 * value2.stoneWidth * value41 + arg39 * value2.stoneDepth * value40,
          })),
          [],
          arg3.height,
          value5.light,
        );
      }
    } else {
      if (value2.style === "hedge")
        for (const value44 of hedgeSamples(arg3, value2.openings || [])) {
          const value45 = new arg1.SphereGeometry(1, 8, 6);
          (value45.scale(value2.thickness * 1.5, arg3.height / 2, value2.thickness * 1.5),
            value45.translate(value44.x, arg3.height / 2, value44.y),
            fn1(value45, value5.leaf));
        }
      else {
        let fn8 = function (arg40) {
          const value56 = arg40.x.toFixed(4) + ":" + arg40.y.toFixed(4);
          set1.has(value56) ||
            value55++ > 3000 ||
            (set1.add(value56),
            fn2(
              arg40.x,
              (value53 + value47) / 2,
              arg40.y,
              value48,
              value47 - value53,
              value48,
              value51,
            ),
            fn2(arg40.x, value47 + 0.015, arg40.y, value48 * 1.18, 0.03, value48 * 1.18, value51));
        };
        const value46 = pathPoints(arg3),
          value47 = arg3.height,
          value48 = value2.thickness,
          value49 = ["wall", "brick", "slatwall"].includes(value2.style),
          value50 = value2.style === "metal",
          value51 = value50 ? value5.dark : value5.base,
          value52 = value2.style === "slatwall" ? Math.min(0.05, value47 * 0.08) : 0.05,
          value53 = value2.style === "slatwall" ? value47 * 0.4 + value52 : 0,
          set1 = new Set();
        let value54 = 0,
          value55 = 0;
        const list3 = [
          ...(value2.openings || []),
          ...(value2.gateWidth > 0
            ? [
                {
                  offset: value2.gateOffset,
                  width: value2.gateWidth,
                },
              ]
            : []),
        ];
        for (let value57 = 1; value57 < value46.length; value57++) {
          const value58 = value46[value57 - 1],
            value59 = value46[value57],
            value60 = Math.hypot(value59.x - value58.x, value59.y - value58.y);
          if (value60 < 0.001) continue;
          const value61 = (value59.x - value58.x) / value60,
            value62 = (value59.y - value58.y) / value60,
            fn9 = (arg41) => ({
              x: value58.x + value61 * arg41,
              y: value58.y + value62 * arg41,
            }),
            list4 = [0, value60];
          for (const value63 of list3)
            for (const value64 of [value63.offset, value63.offset + value63.width])
              value64 > value54 && value64 < value54 + value60 && list4.push(value64 - value54);
          list4.sort((arg42, arg43) => arg42 - arg43);
          for (let value65 = 1; value65 < list4.length; value65++) {
            const value66 = list4[value65 - 1],
              value67 = list4[value65],
              value68 = value54 + (value66 + value67) / 2;
            if (
              list3.some((arg44) => value68 > arg44.offset && value68 < arg44.offset + arg44.width)
            )
              continue;
            const value69 = list3.some(
                (arg45) => Math.abs(value54 + value66 - arg45.offset - arg45.width) < 0.000001,
              ),
              value70 = list3.some(
                (arg46) => Math.abs(value54 + value67 - arg46.offset) < 0.000001,
              ),
              value71 = value66 + (value69 ? 0.002 : 0),
              value72 = value67 - (value70 ? 0.002 : 0);
            if (value72 - value71 < 0.001) continue;
            const value73 = fn9(value71),
              value74 = fn9(value72),
              value75 = value72 - value71,
              value76 = Math.atan2(value62, value61);
            if (value49) {
              const value81 = value2.style === "slatwall" ? value47 * 0.4 : value47;
              if (
                (fn2(
                  (value73.x + value74.x) / 2,
                  value81 / 2,
                  (value73.y + value74.y) / 2,
                  value75,
                  value81,
                  value48,
                  value5.light,
                  value76,
                ),
                fn2(
                  (value73.x + value74.x) / 2,
                  value81 + value52 / 2,
                  (value73.y + value74.y) / 2,
                  value75,
                  value52,
                  value48 * 1.15,
                  value5.base,
                  value76,
                ),
                value2.style === "brick")
              )
                for (let value82 = 0; value82 < Math.min(25, value47 / 0.2); value82++) {
                  const value83 = fn9((value71 + value72) / 2);
                  value82 &&
                    fn2(
                      value83.x,
                      value82 * 0.2,
                      value83.y,
                      value75,
                      0.012,
                      value48 * 1.02,
                      value5.base,
                      value76,
                    );
                  for (
                    let value84 = 0.4 + (value82 % 2) * 0.25;
                    value84 < value75;
                    value84 += 0.5
                  ) {
                    const value85 = fn9(value71 + value84);
                    fn2(
                      value85.x,
                      value82 * 0.2 + 0.1,
                      value85.y,
                      0.012,
                      Math.min(0.19, value47 - value82 * 0.2),
                      value48 * 1.02,
                      value5.base,
                      value76,
                    );
                  }
                }
              if (value2.style !== "slatwall") continue;
            }
            const value77 = Math.min(150, Math.max(1, Math.ceil(value75 / value2.spacing))),
              value78 = ((value48 * 1.18) / 2) * (Math.abs(value61) + Math.abs(value62)),
              value79 = value71 + (value69 ? value78 : 0),
              value80 = value72 - (value70 ? value78 : 0);
            if (value80 >= value79) {
              for (let value86 = 0; value86 <= value77; value86++)
                fn8(fn9(value79 + ((value80 - value79) * value86) / value77));
            }
            if (value2.style === "horizontal") {
              for (let value87 = 1; value87 <= 4; value87++)
                fn3(
                  value73,
                  value74,
                  (value47 * value87) / 5,
                  Math.min(0.12, value48 * 0.75),
                  value51,
                );
            } else {
              if (value2.style === "lattice") {
                for (const value88 of [0.1, value47 - 0.1])
                  fn3(value73, value74, value88, 0.06, value51);
                for (let value89 = 0; value89 < value77; value89++) {
                  const value90 =
                      value71 +
                      (value75 * value89) / value77 +
                      (value89 === 0 && value69 ? 0.045 : 0),
                    value91 =
                      value71 +
                      (value75 * (value89 + 1)) / value77 -
                      (value89 === value77 - 1 && value70 ? 0.045 : 0);
                  if (!(value91 <= value90))
                    for (const value92 of [false, true]) {
                      const value93 = fn9(value90),
                        value94 = fn9(value91),
                        value95 = new arg1.Vector3(
                          value93.x,
                          value92 ? value47 - 0.12 : 0.12,
                          value93.y,
                        ),
                        value96 = new arg1.Vector3(
                          value94.x,
                          value92 ? 0.12 : value47 - 0.12,
                          value94.y,
                        ),
                        value97 = value96.clone().sub(value95),
                        value98 = new arg1.BoxGeometry(0.045, value97.length(), 0.045);
                      (value98.applyQuaternion(
                        new arg1.Quaternion().setFromUnitVectors(
                          new arg1.Vector3(0, 1, 0),
                          value97.normalize(),
                        ),
                      ),
                        value98.translate(...value95.add(value96).multiplyScalar(0.5).toArray()),
                        fn1(value98, value51));
                    }
                }
              } else {
                const value99 =
                    value2.style === "slatwall" ? Math.max(value53, value47 * 0.44) : 0.12,
                  value100 = Math.min(0.055, (value47 - value99) / 4),
                  value101 = Math.min(0.12, (value47 - value99) / 4);
                for (const value103 of [value99 + value101, value47 - value101])
                  fn3(value73, value74, value103, value100, value51);
                const value102 = Math.min(
                  220,
                  Math.max(1, Math.ceil(value75 / (value50 ? 0.13 : 0.18))),
                );
                for (let value104 = 1; value104 < value102; value104++) {
                  const value105 = value71 + (value75 * value104) / value102,
                    value106 = (value50 ? 0.025 : 0.075) / 2;
                  if (
                    (value69 && value105 - value106 < value71) ||
                    (value70 && value105 + value106 > value72)
                  )
                    continue;
                  const value107 = fn9(value105);
                  fn2(
                    value107.x,
                    (value99 + value47) / 2,
                    value107.y,
                    value106 * 2,
                    value47 - value99,
                    value50 ? 0.025 : 0.05,
                    value51,
                    value76,
                  );
                }
              }
            }
          }
          value54 += value60;
        }
      }
    }
  }
  for (const [value108, value109] of map1) {
    if (!value109.length) continue;
    const value110 = arg2(value109, false);
    if ((value109.forEach((arg47) => arg47.dispose()), !value110)) continue;
    const value111 = arg3.type === "courtyard-area" && value108 === arg4.floor,
      value112 = new arg1.MeshStandardMaterial({
        color: value108,
        roughness: value111 ? 0.96 : 0.92,
        metalness: 0,
        emissive: value108,
        emissiveIntensity: value111 ? 0.025 : arg4.warmWood ? 0.045 : 0.025,
      });
    value111 && decorateWarmFloor(value112, arg4);
    const value113 = new arg1.Mesh(value110, value112);
    ((value113.castShadow = true),
      (value113.receiveShadow = true),
      (arg3.type === "courtyard-area" || arg3.type === "courtyard-path") &&
        (value113.userData.regionReceiverKind = "floor"),
      value1.add(value113));
  }
  return (
    (value1.userData.courtyardSurface = ["courtyard-area", "courtyard-path"].includes(arg3.type)),
    (value1.userData.squareEdges = true),
    value1
  );
}
