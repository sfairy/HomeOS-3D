const w = (arg1, arg2, arg3, arg4) => {
  const value1 = arg1 == null || arg1 === "" ? NaN : Number(arg1);
  return Number.isFinite(value1) ? Math.max(arg3, Math.min(arg4, value1)) : arg2;
};
export function normalizeCurtainTrack(arg5 = {}) {
  return {
    ...(arg5.curtainForm === "roller"
      ? {
          curtainForm: "roller",
        }
      : {}),
    curtainTrack:
      arg5.curtainForm === "roller"
        ? "straight"
        : ["straight", "l", "u"].includes(arg5.curtainTrack)
          ? arg5.curtainTrack
          : "straight",
    curtainCorner: arg5.curtainCorner === "left" ? "left" : "right",
    curtainLeftLength: w(arg5.curtainLeftLength, 1.2, 0.2, 7.8),
    curtainRightLength: w(arg5.curtainRightLength, 1.2, 0.2, 7.8),
    curtainMeet: w(arg5.curtainMeet, 50, 5, 95),
    curtainPreview: w(arg5.curtainPreview, 0, 0, 100),
    ...(arg5.curtainFabric === "cloth" || arg5.curtainFabric === "sheer"
      ? {
          curtainFabric: arg5.curtainFabric,
        }
      : {}),
  };
}
export function curtainFootprintDepth(arg6) {
  const value2 = normalizeCurtainTrack(arg6);
  return value2.curtainTrack === "straight"
    ? w(arg6.depth, 0.18, 0.05, 8)
    : 0.18 +
        (value2.curtainTrack === "u"
          ? Math.max(value2.curtainLeftLength, value2.curtainRightLength)
          : value2.curtainCorner === "left"
            ? value2.curtainLeftLength
            : value2.curtainRightLength);
}
export function createCurtainTrack(arg7 = {}) {
  const value3 = normalizeCurtainTrack(arg7),
    value4 = w(arg7.width ?? arg7.curtainWidth, 1.8, 0.2, 8),
    value5 =
      value3.curtainTrack === "u" ||
      (value3.curtainTrack === "l" && value3.curtainCorner === "left")
        ? value3.curtainLeftLength
        : 0,
    value6 =
      value3.curtainTrack === "u" ||
      (value3.curtainTrack === "l" && value3.curtainCorner === "right")
        ? value3.curtainRightLength
        : 0,
    value7 = -Math.max(value5, value6) / 2,
    list1 = [
      ...(value5
        ? [
            {
              x: -value4 / 2,
              z: value7 + value5,
            },
          ]
        : []),
      {
        x: -value4 / 2,
        z: value7,
      },
      {
        x: value4 / 2,
        z: value7,
      },
      ...(value6
        ? [
            {
              x: value4 / 2,
              z: value7 + value6,
            },
          ]
        : []),
    ],
    list2 = [];
  let value8 = 0;
  const fn1 = (arg8, arg9) => {
    const value10 = Math.hypot(arg9.x - arg8.x, arg9.z - arg8.z);
    if (value10 < 1e-8) return;
    const value11 = (arg9.x - arg8.x) / value10,
      value12 = (arg9.z - arg8.z) / value10;
    (list2.push({
      start: value8,
      length: value10,
      sample: (arg10) => ({
        x: arg8.x + value11 * arg10,
        z: arg8.z + value12 * arg10,
        tx: value11,
        tz: value12,
      }),
    }),
      (value8 += value10));
  };
  let value9 = list1[0];
  for (let value13 = 1; value13 < list1.length - 1; value13++) {
    const value14 = list1[value13 - 1],
      value15 = list1[value13],
      value16 = list1[value13 + 1],
      value17 = Math.hypot(value15.x - value14.x, value15.z - value14.z),
      value18 = Math.hypot(value16.x - value15.x, value16.z - value15.z),
      value19 = Math.min(0.08, value17 / 3, value18 / 3),
      value20 = (value15.x - value14.x) / value17,
      value21 = (value15.z - value14.z) / value17,
      value22 = (value16.x - value15.x) / value18,
      value23 = (value16.z - value15.z) / value18,
      object1 = {
        x: value15.x - value20 * value19,
        z: value15.z - value21 * value19,
      };
    fn1(value9, object1);
    const object2 = {
        x: object1.x + value22 * value19,
        z: object1.z + value23 * value19,
      },
      value24 = Math.atan2(object1.z - object2.z, object1.x - object2.x),
      value25 = Math.sign(value20 * value23 - value21 * value22),
      value26 = (value19 * Math.PI) / 2;
    (list2.push({
      start: value8,
      length: value26,
      sample: (arg11) => {
        const value27 = value24 + (value25 * arg11) / value19;
        return {
          x: object2.x + value19 * Math.cos(value27),
          z: object2.z + value19 * Math.sin(value27),
          tx: -value25 * Math.sin(value27),
          tz: value25 * Math.cos(value27),
        };
      },
    }),
      (value8 += value26),
      (value9 = {
        x: value15.x + value22 * value19,
        z: value15.z + value23 * value19,
      }));
  }
  return (
    fn1(value9, list1.at(-1)),
    {
      ...value3,
      width: value4,
      length: value8,
      vertices: list1,
      sample(arg12) {
        const value28 = w(arg12, 0, 0, value8),
          value29 = list2.find((arg13) => value28 <= arg13.start + arg13.length) || list2.at(-1);
        return value29.sample(Math.max(0, Math.min(value29.length, value28 - value29.start)));
      },
    }
  );
}
export function curtainPanelRanges(arg14, arg15 = 0, arg16 = "split") {
  const value30 = 1 - (0.88 * w(arg15, 0, 0, 100)) / 100,
    value31 = arg14.length,
    value32 = (value31 * arg14.curtainMeet) / 100;
  return [
    {
      visible: arg16 !== "right",
      start: 0,
      end: (arg16 === "split" ? value32 : value31) * value30,
    },
    {
      visible: arg16 !== "left",
      start: value31 - (arg16 === "split" ? value31 - value32 : value31) * value30,
      end: value31,
    },
  ];
}
export function createTrackClothGeometry(arg17, arg18, arg19, arg20 = "cloth") {
  const value33 = Math.max(
      4,
      Math.min(160, Math.round(arg18.length / (arg20 === "sheer" ? 0.1 : 0.15))),
    ),
    value34 = Math.max(64, value33 * 8),
    value35 = new arg17.PlaneGeometry(1, 1, value34, 1);
  return (
    value35.setAttribute(
      "color",
      new arg17.Float32BufferAttribute(new Float32Array((value34 + 1) * 6).fill(1), 3),
    ),
    (value35.userData.curtainCloth = {
      segments: value34,
      height: arg19,
      folds: value33,
      fabric: arg20,
      amplitude: arg20 === "sheer" ? 0.023 : 0.046,
    }),
    value35.attributes.position.setUsage(arg17.DynamicDrawUsage),
    value35
  );
}
export function poseTrackCloth(arg21, arg22, arg23) {
  const {
      segments: value36,
      height: value37,
      folds: value38,
      fabric: value39,
      amplitude: value40,
    } = arg21.userData.curtainCloth,
    value41 = arg21.attributes.position,
    value42 = arg23.side === 0 ? arg22.curtainMeet / 100 : 1 - arg22.curtainMeet / 100,
    value43 = Math.max(2, Math.round(value38 * (arg23.split ? value42 : 1)));
  for (let value44 = 0; value44 <= value36; value44++) {
    const value45 = value44 / value36,
      value46 = arg22.sample(arg23.start + (arg23.end - arg23.start) * value45),
      value47 = value40 * Math.sin(value45 * value43 * Math.PI * 2),
      value48 = 0.5 - 0.5 * Math.sin(value45 * value43 * Math.PI * 2),
      value49 = 1 - (value39 === "sheer" ? 0.16 : 0.34) * value48 * value48;
    for (let value50 = 0; value50 < 2; value50++)
      arg21.attributes.color.setXYZ(value50 * (value36 + 1) + value44, value49, value49, value49);
    for (let value51 = 0; value51 < 2; value51++)
      value41.setXYZ(
        value51 * (value36 + 1) + value44,
        value46.x - value46.tz * value47,
        0.06 + (value51 === 0 ? Math.max(0.1, value37 - 0.12) : 0),
        value46.z + value46.tx * value47,
      );
  }
  ((value41.needsUpdate = true),
    (arg21.attributes.color.needsUpdate = true),
    arg21.computeVertexNormals(),
    arg21.computeBoundingBox(),
    arg21.computeBoundingSphere());
}
export function addTrackCurtain(arg24, arg25, arg26, arg27 = {}) {
  if (arg26.curtainForm === "roller") {
    const value59 = createRollerCurtain(arg24, arg26, arg27);
    return (
      (arg25.userData.curtainRigRoot = true),
      (arg25.userData.curtainRigBasis = [
        value59.width,
        value59.height,
        curtainFootprintDepth(arg26),
      ]),
      (arg25.userData.curtainRollerModel = true),
      arg25.add(value59.group),
      value59.pose(arg26.curtainPreview),
      arg25
    );
  }
  const value52 = createCurtainTrack(arg26),
    value53 = w(arg26.height, 2.4, 0.2, 6),
    value54 = arg26.curtainFabric || "cloth";
  ((arg25.userData.curtainRigRoot = true),
    (arg25.userData.curtainTrackModel = true),
    (arg25.userData.curtainRigBasis = [value52.width, value53, curtainFootprintDepth(arg26)]));
  class ClassName1 extends arg24.Curve {
    ["getPoint"](arg28, arg29 = new arg24.Vector3()) {
      const value60 = value52.sample(arg28 * value52.length);
      return arg29.set(value60.x, value53 - 0.025, value60.z);
    }
  }
  const value55 = new arg24.MeshStandardMaterial({
      color: arg27.dark ?? 6647932,
      roughness: 0.38,
      metalness: 0.5,
    }),
    value56 = new arg24.Mesh(
      new arg24.TubeGeometry(
        new ClassName1(),
        Math.max(32, Math.ceil(value52.length * 24)),
        0.015,
        8,
        false,
      ),
      value55,
    );
  ((value56.userData.curtainPart = "rod"), arg25.add(value56));
  const value57 = new arg24.MeshStandardMaterial({
    color: value54 === "sheer" ? 16118766 : (arg27.light ?? 13094354),
    roughness: 0.94,
    vertexColors: true,
    side: arg24.DoubleSide,
    transparent: value54 === "sheer",
    opacity: value54 === "sheer" ? 0.48 : 1,
    depthWrite: value54 !== "sheer",
  });
  value57.forceSinglePass = true;
  const value58 = ["left", "right", "split"].includes(arg26.curtainPosition)
    ? arg26.curtainPosition
    : "split";
  return (
    curtainPanelRanges(value52, value52.curtainPreview, value58).forEach((arg30, arg31) => {
      const value61 = createTrackClothGeometry(arg24, value52, value53, value54);
      poseTrackCloth(value61, value52, {
        ...arg30,
        side: arg31,
        split: value58 === "split",
      });
      const value62 = new arg24.Mesh(value61, value57);
      ((value62.visible = arg30.visible),
        (value62.userData.curtainPart = "cloth"),
        (value62.castShadow = value54 !== "sheer"),
        (value62.receiveShadow = true),
        arg25.add(value62));
    }),
    arg25
  );
}
export function createRollerCurtain(arg32, arg33 = {}, arg34 = {}) {
  const value63 = w(arg33.width ?? arg33.curtainWidth, 1.8, 0.2, 8),
    value64 = w(arg33.height, 2.4, 0.2, 6),
    value65 = Math.min(0.045, value64 * 0.12),
    value66 = 0.0016,
    value67 = value64 - Math.sqrt(value65 * value65 + (value64 * value66) / Math.PI),
    value68 = Math.max(0.04, value67 - 0.035),
    value69 = new arg32.Group(),
    list3 = [],
    value70 = arg33.curtainFabric === "sheer",
    value71 =
      arg34.material ||
      new arg32.MeshStandardMaterial({
        color: arg34.light ?? 13094354,
        roughness: 0.94,
        side: arg32.DoubleSide,
        transparent: value70,
        opacity: value70 ? 0.48 : 1,
        depthWrite: !value70,
      });
  value71.vertexColors = false;
  const value72 = new arg32.MeshStandardMaterial({
      color: arg34.dark ?? 8884634,
      roughness: 0.4,
      metalness: 0.45,
    }),
    fn2 = (arg35, arg36, arg37) => {
      const value76 = new arg32.Mesh(arg35, arg36);
      return (
        (value76.userData.curtainPart = arg37),
        (value76.castShadow = !value70),
        (value76.receiveShadow = true),
        list3.push(value76),
        value69.add(value76),
        value76
      );
    },
    value73 = fn2(new arg32.PlaneGeometry(value63, value68), value71, "cloth"),
    value74 = fn2(new arg32.CylinderGeometry(1, 1, value63, 32), value71, "cloth");
  ((value74.rotation.z = Math.PI / 2), (value74.position.y = value67));
  const value75 = fn2(new arg32.BoxGeometry(value63 + 0.018, 0.025, 0.028), value72, "band");
  for (const value77 of [-value63 / 2 - 0.018, value63 / 2 + 0.018])
    fn2(new arg32.BoxGeometry(0.025, value65 * 2.5, value65 * 2.5), value72, "cap").position.set(
      value77,
      value67,
      0,
    );
  function fn3(arg38 = 0) {
    const value78 = w(arg38, 0, 0, 100) / 100,
      value79 = value68 * value78,
      value80 = value68 - value79,
      value81 = Math.sqrt(value65 * value65 + (value79 * value66) / Math.PI),
      value82 = value73.geometry.attributes.position,
      value83 = value73.geometry.attributes.uv;
    for (let value84 = 0; value84 < 4; value84++) {
      const value85 = value84 < 2;
      (value82.setXYZ(
        value84,
        value84 % 2 ? value63 / 2 : -value63 / 2,
        value85 ? value67 : value67 - value80,
        value81,
      ),
        value83.setY(value84, value85 ? 1 - value78 : 0));
    }
    return (
      (value82.needsUpdate = true),
      (value83.needsUpdate = true),
      value73.geometry.computeBoundingBox(),
      value73.geometry.computeBoundingSphere(),
      (value73.visible = value80 > 0.0001),
      value74.scale.set(value81, 1, value81),
      (value74.rotation.x = (-2 * Math.PI * (value81 - value65)) / value66),
      value75.position.set(0, value67 - value80, value81),
      {
        top: value67,
        bottom: value67 - value80,
        radius: value81,
        hanging: value80,
      }
    );
  }
  return (
    fn3(arg33.curtainPreview),
    {
      group: value69,
      meshes: list3,
      material: value71,
      width: value63,
      height: value64,
      pose: fn3,
      dispose({ keepMaterial: arg39 = false } = {}) {
        for (const value86 of list3) value86.geometry.dispose();
        (value72.dispose(), arg39 || value71.dispose());
      },
    }
  );
}
export function createDreamBladeGeometry(arg40, arg41, arg42) {
  const value87 = Math.max(4, Math.min(160, Math.ceil(arg41.length / 0.12))),
    value88 = new arg40.BufferGeometry();
  value88.setAttribute(
    "position",
    new arg40.Float32BufferAttribute(new Float32Array(value87 * 12), 3),
  );
  const list4 = [];
  for (let value89 = 0; value89 < value87; value89++)
    for (const value90 of [0.72, 1, 0.72, 1]) list4.push(value90, value90, value90);
  (value88.setAttribute("color", new arg40.Float32BufferAttribute(list4, 3)),
    value88.attributes.position.setUsage(arg40.DynamicDrawUsage));
  const list5 = [];
  for (let value91 = 0; value91 < value87; value91++) {
    const value92 = value91 * 4;
    list5.push(value92, value92 + 1, value92 + 2, value92 + 2, value92 + 1, value92 + 3);
  }
  return (
    value88.setIndex(list5),
    (value88.userData.dreamBlades = {
      count: value87,
      height: arg42,
      width: (arg41.length / value87) * 1.08,
    }),
    value88
  );
}
export function poseDreamBlades(arg43, arg44, arg45, arg46 = 50) {
  const { count: value93, height: value94, width: value95 } = arg43.userData.dreamBlades,
    value96 = arg43.attributes.position,
    value97 = Math.max(
      2,
      Math.round(
        value93 *
          (arg45.split
            ? arg45.side === 0
              ? arg44.curtainMeet / 100
              : 1 - arg44.curtainMeet / 100
            : 1),
      ),
    ),
    value98 = 0.02,
    value99 = Math.max(
      value98,
      Math.min(Math.PI - value98, (w(arg46, 50, 0, 100) * Math.PI) / 100),
    );
  for (let value100 = 0; value100 < value93; value100++) {
    const value101 = arg44.sample(
        arg45.start +
          ((arg45.end - arg45.start) * (Math.min(value100, value97 - 1) + 0.5)) / value97,
      ),
      value102 = value100 < value97 ? value95 / 2 : 0,
      value103 = (value101.tx * Math.cos(value99) - value101.tz * Math.sin(value99)) * value102,
      value104 = (value101.tz * Math.cos(value99) + value101.tx * Math.sin(value99)) * value102;
    (value96.setXYZ(value100 * 4, value101.x - value103, 0.06, value101.z - value104),
      value96.setXYZ(value100 * 4 + 1, value101.x + value103, 0.06, value101.z + value104),
      value96.setXYZ(
        value100 * 4 + 2,
        value101.x - value103,
        value94 - 0.06,
        value101.z - value104,
      ),
      value96.setXYZ(
        value100 * 4 + 3,
        value101.x + value103,
        value94 - 0.06,
        value101.z + value104,
      ));
  }
  ((value96.needsUpdate = true),
    arg43.computeVertexNormals(),
    arg43.computeBoundingBox(),
    arg43.computeBoundingSphere());
}
